"""Writes world_chunked_v6.ipynb (run: python make_notebook_v6.py)."""
import json, os
cells = []
md = lambda t: cells.append({"cell_type": "markdown", "metadata": {}, "source": t.strip("\n").splitlines(True)})
code = lambda t: cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": t.strip("\n").splitlines(True)})

md("""
# Clean colours + faster — v6 (free Colab T4, ~45-60 min)

v5 made the AI draw real objects, but its imagined areas have **colour glitches** (neon blotches, rainbow
fringes): **2.9%** of imagined pixels are more saturated than anything in the real photo (photo itself:
0.36%). Research points at our settings, not only the model: 384 px is below the 480p Wan-1.3B was trained
on; the sampler shift/guidance were defaults; holes were filled with flat grey (the model is TOLD the hole
is grey); and half precision on a T4 may overflow.

Same photo walk as v5 (generate-ahead, 4 AI calls), four settings side by side:
* **C0** v5 settings (384 px, 40 steps) — baseline
* **C1** 480 px + recommended sampler (guidance 6, shift 8)
* **C2** C1 + holes pre-filled with nearby colours instead of grey
* **C3** C2 + CausVid speed add-on: **6 steps instead of 40** (skipped automatically if it won't load)
* plus a **precision check**: one chunk of C2 regenerated in full fp32 — does the glitch come from fp16?

**Start:** Runtime → Change runtime type → **T4 GPU**, then Runtime → Run all. `results_v6.zip` downloads at the end.
""")


code("""
# 1. machine
!nvidia-smi --query-gpu=name,memory.total --format=csv
import psutil, shutil; print(f"RAM {psutil.virtual_memory().total/1e9:.1f} GB · disk free {shutil.disk_usage('/').free/1e9:.0f} GB")
""")
code("""
# 2. install (2-4 min; a red 'dependency conflicts' warning about cuml/cudf/pytensor is harmless)
!pip -q install -U "diffusers>=0.35" transformers accelerate sentencepiece ftfy numba imageio imageio-ffmpeg
""")
code("""
# 3. our research code (public repo, two folders)
import os, sys
if not os.path.exists('ytautomation'):
    !git clone -q --depth 1 --filter=blob:none --sparse https://github.com/hassankhan2510/ytautomation.git
    !cd ytautomation && git sparse-checkout set shotc worldwalk
else:
    !cd ytautomation && git pull -q
sys.path.insert(0, '/content/ytautomation/worldwalk'); sys.path.insert(0, '/content/ytautomation/shotc')
os.environ['SF_G'] = '12'; os.environ['SF_LAM'] = '10'
import mv, ww, photo, numpy as np, time, json, imageio
print('code ready')
""")
code("""
# 4. the photo for world B — default: a lab photo from our repo. To use YOUR photo (a room works best):
#    set USE_MY_PHOTO = True and describe it in PHOTO_PROMPT, then run this cell and pick the file.
USE_MY_PHOTO = False
PHOTO_PROMPT = ('the rest of the same laboratory room: white walls, shelves with white and black boxes, lab benches '
                'with machines, bright ceiling lights, realistic photograph, slow smooth camera pan')
if USE_MY_PHOTO:
    from google.colab import files
    up = files.upload(); PHOTO = list(up.keys())[0]
else:
    PHOTO = 'lab.jpg'
    !wget -q -O lab.jpg https://raw.githubusercontent.com/hassankhan2510/ytautomation/main/theranos-doc/public/assets/lab.jpg
print('photo:', PHOTO)
""")
code("""
# 5. the photo world at 384 px (baseline) and 480 px (CPU + depth on GPU, ~3-6 min incl. compiling)
F, CHUNK = 97, 9
depth = ww.MonoDepth(device=0)
WORLD = {S: photo.photo_inputs(PHOTO, F, S, S, depth, deg=90.0) for S in (384, 480)}
imageio.imwrite('photo_start.png', (WORLD[384][1][0]*255).astype('uint8')); print('photo worlds ready')
""")
code("""
# 6. encode the prompts on the GPU, then free the 11 GB text encoder
import torch, gc
from transformers import AutoTokenizer, UMT5EncoderModel
MID = 'Wan-AI/Wan2.1-VACE-1.3B-diffusers'
ROOM_PROMPT = ('the inside of an empty minimalist photo studio, plain plaster walls, a smooth grey concrete floor, '
               'a polished gold sphere on a white pedestal, soft even light, realistic photograph, slow smooth camera pan')
NEG = ('stripes, glitch, repeated patterns, clutter, blurry, distorted, warped, flickering, '
       'text, watermark, low quality, cartoon')
tok = AutoTokenizer.from_pretrained(MID, subfolder='tokenizer')
te = UMT5EncoderModel.from_pretrained(MID, subfolder='text_encoder', torch_dtype=torch.float16, device_map='cuda')
def encode(text, L=512):
    ti = tok([text], padding='max_length', max_length=L, truncation=True, add_special_tokens=True, return_attention_mask=True, return_tensors='pt')
    n = int(ti.attention_mask.gt(0).sum())
    with torch.no_grad():
        e = te(ti.input_ids.cuda(), ti.attention_mask.cuda()).last_hidden_state[0, :n]
    return torch.cat([e, e.new_zeros(L - n, e.shape[1])])[None]
EMB = {'photo': encode(PHOTO_PROMPT)}; NE = encode(NEG)
del te; gc.collect(); torch.cuda.empty_cache(); print('prompts encoded; text encoder freed')
""")
code("""
# 7. the video model + a configurable chunk generator
from diffusers import WanVACEPipeline, AutoencoderKLWan, UniPCMultistepScheduler
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter
vae = AutoencoderKLWan.from_pretrained(MID, subfolder='vae', torch_dtype=torch.float32)   # VAE stays fp32
DT = torch.float16
pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=DT).to('cuda')
BASE_SCHED = pipe.scheduler.config
times = []; CUR = {'pe': EMB['photo'], 'cfg': {}}; FIRST = {}
def set_cfg(cfg):
    CUR['cfg'] = cfg
    pipe.scheduler = UniPCMultistepScheduler.from_config(BASE_SCHED, **({'flow_shift': cfg['shift']} if cfg.get('shift') else {}))
def smear(f, m):
    # holes pre-filled with the nearest known colours, heavily blurred: the model sees colour context, not grey
    if not m.any():
        return f
    _, (iy, ix) = distance_transform_edt(m, return_indices=True)
    near = f[iy, ix]
    blur = np.stack([gaussian_filter(near[..., c], 10) for c in range(3)], -1)
    return np.where(m[..., None], blur, f)
def gen_chunk(frames, masks, idx):
    cfg = CUR['cfg']
    mk = [ww.dilate(m, 8) for m in masks]
    fill = (lambda f, m: smear(f, m)) if cfg.get('fill') == 'smear' else (lambda f, m: np.where(m[..., None], 0.5, f))
    video = [Image.fromarray((np.clip(fill(f, m), 0, 1) * 255).astype('uint8')) for f, m in zip(frames, mk)]
    mask = [Image.fromarray((m * 255).astype('uint8')) for m in mk]
    H, W = frames.shape[1], frames.shape[2]
    t0 = time.time()
    out = pipe(video=video, mask=mask, prompt_embeds=CUR['pe'].to(DT), negative_prompt_embeds=NE.to(DT), height=H, width=W,
               num_frames=len(idx), num_inference_steps=cfg['steps'], guidance_scale=cfg['guidance'],
               generator=torch.Generator('cuda').manual_seed(idx[0]), output_type='np').frames[0]
    g = np.asarray(out, dtype=np.float32)
    times.append(time.time() - t0)
    if 'first' not in FIRST and cfg.get('keep_first'):
        FIRST['first'] = (frames.copy(), [m.copy() for m in masks], list(idx), g.copy())
    print(f'  chunk {idx[0]}-{idx[-1]}: new area {100*np.mean(masks):.1f}% · {times[-1]:.0f}s · NaN {int(np.isnan(g).sum())}')
    return np.nan_to_num(g, nan=0.5)
def load_causvid():
    # CausVid distillation LoRA for Wan2.1-1.3B (few-step). Returns True if it loaded.
    try:
        from huggingface_hub import list_repo_files, hf_hub_download
        cands = [f for f in list_repo_files('Kijai/WanVideo_comfy') if 'causvid' in f.lower() and '1_3b' in f.lower() and f.endswith('.safetensors')]
        print('CausVid candidates:', cands[:5])
        path = hf_hub_download('Kijai/WanVideo_comfy', cands[0])
        pipe.load_lora_weights(path, adapter_name='causvid')
        pipe.set_adapters(['causvid'], [0.7])
        return True
    except Exception as e:
        print('  CausVid LoRA not loaded -> C3 skipped:', str(e)[:200])
        return False
print('model ready')
""")
code("""
# 8. FOUR SETTINGS ON THE SAME WALK (~20-30 min) + the precision check
res = {}
def save(name, frames, q=8):
    imageio.mimsave(name, [(np.clip(f, 0, 1)*255).astype('uint8') for f in frames], fps=12, quality=q)
RUNS = [('C0_v5', 384, dict(steps=40, guidance=5.0, shift=None, fill='grey')),
        ('C1_480_sampler', 480, dict(steps=40, guidance=6.0, shift=8.0, fill='grey')),
        ('C2_480_smear', 480, dict(steps=40, guidance=6.0, shift=8.0, fill='smear', keep_first=True)),
        ('C3_6steps', 480, dict(steps=6, guidance=1.0, shift=8.0, fill='smear', lora=True))]
for name, S, cfg in RUNS:
    if cfg.get('lora') and not load_causvid():
        continue
    print(f'=== {name} ===')
    set_cfg(cfg); times.clear(); raw = []; t0 = time.time()
    CAM, rgb, z = WORLD[S]
    out, shown, back = mv.chunked_world(gen_chunk, CAM, S, S, rgb, z, 'single', depth, chunk=CHUNK, dev='cuda',
                                        lift='last', raw_out=raw, blend='field_off', stride=3)
    out['minutes_total'] = (time.time() - t0) / 60; out['seconds_per_ai_call'] = float(np.mean(times)) if times else 0.0
    out['config'] = {k: v for k, v in cfg.items() if k != 'keep_first'}; out['size'] = S
    res[name] = out
    save(f'shown_{name}.mp4', shown); save(f'walkback_{name}.mp4', back)
    if raw:
        save(f'raw_{name}.mp4', np.concatenate(raw), q=9)
    print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in out.items() if k in ('seam_ratio', 'oversat_pct', 'hue_noise', 'seconds_per_ai_call', 'minutes_total')})

# precision check: the first chunk of C2 again, transformer in full fp32 (VAE already fp32)
if 'first' in FIRST:
    try:
        frames, masks, idx, g16 = FIRST['first']
        del pipe; gc.collect(); torch.cuda.empty_cache()
        DT = torch.float32
        pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=DT).to('cuda')
        BASE_SCHED = pipe.scheduler.config
        set_cfg(dict(steps=40, guidance=6.0, shift=8.0, fill='smear'))
        g32 = gen_chunk(np.array(frames), masks, idx)
        ref = WORLD[480][1][0]
        m = np.array(masks)
        res['precision_check'] = {'fp16': mv.colour_glitch(g16[1:], m[1:], ref), 'fp32': mv.colour_glitch(g32[1:], m[1:], ref),
                                  'fp32_seconds': times[-1]}
        imageio.imwrite('precision_fp16_vs_fp32.png', (np.clip(np.concatenate([g16[-1], g32[-1]], 1), 0, 1) * 255).astype('uint8'))
        print('precision check:', res['precision_check'])
    except Exception as e:
        print('precision check failed:', str(e)[:200])
json.dump(res, open('results_v6.json', 'w'), indent=1)
""")
code("""
# 9. download (send results_v6.zip back)
!zip -q results_v6.zip results_v6.json photo_start.png shown_*.mp4 walkback_*.mp4 raw_*.mp4 precision_*.png
from google.colab import files; files.download('results_v6.zip')
""")
nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4", "provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "world_chunked_v6.ipynb"), "w", encoding="utf-8"), indent=1)
print("wrote world_chunked_v6.ipynb")
