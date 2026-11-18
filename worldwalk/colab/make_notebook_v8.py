"""Writes world_speed_v8.ipynb (run: python make_notebook_v8.py)."""
import json, os
cells = []
md = lambda t: cells.append({"cell_type": "markdown", "metadata": {}, "source": t.strip("\n").splitlines(True)})
code = lambda t: cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": t.strip("\n").splitlines(True)})

md("""
# Same quality, 5-10x faster? — v8 (free Colab T4, ~25-35 min)

v6 found the clean setting (**C2**: 480p, guidance 6, shift 8, holes pre-filled with nearby colours) — the neon
glitches are gone — but each AI call takes ~93 s with 40 denoising steps.

**CausVid** is a published distillation add-on (LoRA) that lets Wan-1.3B work in 4-8 steps without the
second "guidance" pass. In v6 the standard loader rejected its file format, so this notebook merges it into
the model with **our own loader** (exact maths, prints how many layers matched).

Same photo walk, four runs:
* **B** — C2 at 40 steps (the v6 winner, baseline)
* **S8 / S6 / S4** — C2 + CausVid at 8 / 6 / 4 steps, guidance 1 (no second pass)

Errors are saved into the results file — nothing to copy by hand.

**Start:** Runtime → Change runtime type → **T4 GPU**, then Runtime → Run all. `results_v8.zip` downloads at the end.
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
WORLD = {480: photo.photo_inputs(PHOTO, F, 480, 480, depth, deg=90.0)}
imageio.imwrite('photo_start.png', (WORLD[480][1][0]*255).astype('uint8')); print('photo world ready')
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
def load_causvid(strength=0.7):
    # CausVid few-step LoRA for Wan2.1-1.3B, merged with OUR loader (worldwalk/lora_merge.py)
    from huggingface_hub import list_repo_files, hf_hub_download
    from safetensors.torch import load_file
    import lora_merge
    cands = [f for f in list_repo_files('Kijai/WanVideo_comfy') if 'causvid' in f.lower() and '1_3b' in f.lower() and f.endswith('.safetensors')]
    print('CausVid file:', cands[:1])
    rep = lora_merge.merge_lora(pipe.transformer, load_file(hf_hub_download('Kijai/WanVideo_comfy', cands[0])), strength=strength)
    print('merge report:', rep)
    return rep
print('model ready')
""")
code("""
# 8. BASELINE + THREE SPEEDS ON THE SAME WALK (~15-25 min); every error is saved into the results
import traceback
res = {'errors': []}
def save(name, frames, q=8):
    imageio.mimsave(name, [(np.clip(f, 0, 1)*255).astype('uint8') for f in frames], fps=12, quality=q)
C2 = dict(guidance=6.0, shift=8.0, fill='smear')
RUNS = [('B_40steps', dict(C2, steps=40)),
        ('S8_causvid', dict(C2, steps=8, guidance=1.0, lora=True)),
        ('S6_causvid', dict(C2, steps=6, guidance=1.0, lora=True)),
        ('S4_causvid', dict(C2, steps=4, guidance=1.0, lora=True))]
merged = None
for name, cfg in RUNS:
    try:
        if cfg.get('lora') and merged is None:
            merged = load_causvid()
            res['lora_merge'] = merged
            if merged['matched_layers'] < 50:
                raise RuntimeError(f"only {merged['matched_layers']} LoRA layers matched")
        print(f'=== {name} ===')
        set_cfg(cfg); times.clear(); raw = []; t0 = time.time()
        CAM, rgb, z = WORLD[480]
        out, shown, back = mv.chunked_world(gen_chunk, CAM, 480, 480, rgb, z, 'single', depth, chunk=CHUNK, dev='cuda',
                                            lift='last', raw_out=raw, blend='field_off', stride=3)
        out['minutes_total'] = (time.time() - t0) / 60; out['seconds_per_ai_call'] = float(np.mean(times)) if times else 0.0
        out['config'] = {k: v for k, v in cfg.items()}
        res[name] = out
        save(f'shown_{name}.mp4', shown); save(f'walkback_{name}.mp4', back)
        if raw:
            save(f'raw_{name}.mp4', np.concatenate(raw), q=9)
        print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in out.items() if k in ('seam_ratio', 'oversat_pct', 'hue_noise', 'seconds_per_ai_call', 'minutes_total')})
    except Exception as e:
        res['errors'].append({'run': name, 'error': str(e)[:400], 'trace': traceback.format_exc()[-1500:]})
        print('!!', name, 'failed:', str(e)[:300])
        if cfg.get('lora'):
            break
json.dump(res, open('results_v8.json', 'w'), indent=1)
""")
code("""
# 9. download (send results_v8.zip back)
!zip -q results_v8.zip results_v8.json photo_start.png shown_*.mp4 walkback_*.mp4 raw_*.mp4
from google.colab import files; files.download('results_v8.zip')
""")
nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4", "provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "world_speed_v8.ipynb"), "w", encoding="utf-8"), indent=1)
print("wrote world_speed_v8.ipynb")
