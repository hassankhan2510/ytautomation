"""Writes world_chunked_v3.ipynb (run: python make_notebook_v3.py)."""
import json, os
cells = []
md = lambda t: cells.append({"cell_type": "markdown", "metadata": {}, "source": t.strip("\n").splitlines(True)})
code = lambda t: cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": t.strip("\n").splitlines(True)})

md("""
# World-locked world generation — v3 (free Colab T4, ~35-50 min)

Run #1 showed the video AI paints large unknown areas like a *sticker on the screen*. v2 does what the
leading systems do (GEN3C, Voyager, ViewCrafter): **small chunks** (9 frames ≈ 10° of turning). Every
chunk is rendered from the current 3D world, the AI fills only the thin new strip, and that strip is
written into the world before the next chunk — so everything the user sees is real 3D by construction.

v2 result: fast (28 s/chunk) and the world never forgets, but writing every frame's thin new sliver into
3D with its own depth made **stripes**. v3 adds **keyframe lifting** (only each chunk's last frame is written
into the world, in one piece) and runs it **side by side** with v2's per-frame lifting; better quality
settings (384 px, 40 steps, cleaner prompt); and saves the model's raw output.

**Start:** Runtime → Change runtime type → **T4 GPU**, then Runtime → Run all. `results_v3.zip` downloads at the end.
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
import mv, ww, numpy as np, time, json, imageio
print('code ready')
""")
code("""
# 4. the camera walk and the starting view (CPU, ~3-6 min incl. compiling)
F, W, H, CHUNK = 49, 384, 384, 9          # 49 = 1 + 6 chunks of 8 new frames; 70 deg turn
CAM = mv.room_path(F)
t0 = time.time(); gt_rgb, gt_z = mv.scene_truth(CAM, W, H); print(f'scene ready in {time.time()-t0:.0f}s')
""")
code("""
# 5. encode the prompt on the GPU, then free the 11 GB text encoder
import torch, gc
from transformers import AutoTokenizer, UMT5EncoderModel
MID = 'Wan-AI/Wan2.1-VACE-1.3B-diffusers'
PROMPT = ('the inside of an empty minimalist photo studio, plain plaster walls, a smooth grey concrete floor, '
          'a polished gold sphere on a white pedestal, soft even light, realistic photograph, slow smooth camera pan')
NEG = ('stripes, glitch, repeated patterns, shelves, clutter, many objects, blurry, distorted, warped, flickering, '
       'text, watermark, low quality, cartoon, people')
tok = AutoTokenizer.from_pretrained(MID, subfolder='tokenizer')
te = UMT5EncoderModel.from_pretrained(MID, subfolder='text_encoder', torch_dtype=torch.float16, device_map='cuda')
def encode(text, L=512):
    ti = tok([text], padding='max_length', max_length=L, truncation=True, add_special_tokens=True, return_attention_mask=True, return_tensors='pt')
    n = int(ti.attention_mask.gt(0).sum())
    with torch.no_grad():
        e = te(ti.input_ids.cuda(), ti.attention_mask.cuda()).last_hidden_state[0, :n]
    return torch.cat([e, e.new_zeros(L - n, e.shape[1])])[None]
pe, ne = encode(PROMPT), encode(NEG)
del te; gc.collect(); torch.cuda.empty_cache(); print('prompt encoded; text encoder freed')
""")
code("""
# 6. the video model + a chunk generator (gray holes, masks grown 8 px, as the research recommends)
from diffusers import WanVACEPipeline, AutoencoderKLWan
from PIL import Image
vae = AutoencoderKLWan.from_pretrained(MID, subfolder='vae', torch_dtype=torch.float32)
DT = torch.float16
pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=DT).to('cuda')
times = []
def gen_chunk(frames, masks, idx):
    global pipe, DT
    mk = [ww.dilate(m, 8) for m in masks]
    video = [Image.fromarray((np.where(m[..., None], 0.5, f) * 255).astype('uint8')) for f, m in zip(frames, mk)]
    mask = [Image.fromarray((m * 255).astype('uint8')) for m in mk]
    for attempt in range(2):
        t0 = time.time()
        out = pipe(video=video, mask=mask, prompt_embeds=pe.to(DT), negative_prompt_embeds=ne.to(DT), height=H, width=W,
                   num_frames=len(idx), num_inference_steps=40, guidance_scale=5.0,
                   generator=torch.Generator('cuda').manual_seed(idx[0]), output_type='np').frames[0]
        g = np.asarray(out, dtype=np.float32)
        if not np.isnan(g).any() and g.std() > 1e-3:
            break
        print('  half precision failed -> switching to full precision'); DT = torch.float32
        del pipe; gc.collect(); torch.cuda.empty_cache()
        pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=DT).to('cuda')
    times.append(time.time() - t0)
    print(f'  chunk frames {idx[0]}-{idx[-1]}: new area {100*np.mean(masks):.1f}% · {times[-1]/60:.1f} min')
    return g
print('model ready')
""")
code("""
# 7. BUILD TWO WORLDS (A/B, ~15-25 min): keyframe lifting (v3) vs per-frame lifting (v2)
depth = ww.MonoDepth(device=0)
res = {}
def save(name, frames):
    imageio.mimsave(name, [(np.clip(f, 0, 1)*255).astype('uint8') for f in frames], fps=12)
for mode in ('last', 'every'):
    print(f'=== lifting mode: {mode} ===')
    times.clear(); raw = []; t0 = time.time()
    out, shown, back = mv.chunked_world(gen_chunk, CAM, W, H, gt_rgb, gt_z, 'single', depth, chunk=CHUNK, dev='cuda', lift=mode, raw_out=raw)
    out['minutes_total'] = (time.time() - t0) / 60; out['minutes_per_chunk'] = float(np.mean(times)) / 60
    res[mode] = out
    save(f'shown_{mode}.mp4', shown); save(f'walkback_{mode}.mp4', back)
    if mode == 'last':
        save('raw_model_output.mp4', np.concatenate(raw))
json.dump(res, open('results_v3.json', 'w'), indent=1)
print(json.dumps(res, indent=1))
""")
code("""
# 8. download (send results_v2.zip back)
!zip -q results_v3.zip results_v3.json shown_last.mp4 walkback_last.mp4 shown_every.mp4 walkback_every.mp4 raw_model_output.mp4
from google.colab import files; files.download('results_v3.zip')
""")
nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4", "provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "world_chunked_v3.ipynb"), "w", encoding="utf-8"), indent=1)
print("wrote world_chunked_v3.ipynb")
