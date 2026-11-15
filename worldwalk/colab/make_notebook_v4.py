"""Writes world_chunked_v4.ipynb (run: python make_notebook_v4.py)."""
import json, os
cells = []
md = lambda t: cells.append({"cell_type": "markdown", "metadata": {}, "source": t.strip("\n").splitlines(True)})
code = lambda t: cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": t.strip("\n").splitlines(True)})

md("""
# Persistent world from a REAL PHOTO — v4 (free Colab T4, ~45-60 min)

v3 proved keyframe lifting kills the stripes. The remaining visible problem was colour joins between
chunks; v4 turns on the **colour-harmonised join** (tested on CPU on v3's real output: seam 9.3 → 3.1).

Two worlds in one session, each a **twice-as-long walk** (12 chunks):
* **A — the synthetic room**, 140° turn: is the colour stable over a long walk?
* **B — a real photo**: walk out of a real photograph into AI-imagined space (default: a lab photo;
  set `USE_MY_PHOTO = True` in cell 4 to upload your own room photo).

It also records how many generator calls were skipped (nothing new on screen) and what fraction of the
video model's tokens actually touched new content — the compute-saving number.

**Start:** Runtime → Change runtime type → **T4 GPU**, then Runtime → Run all. `results_v4.zip` downloads at the end.
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
# 5. both camera walks + starting views (CPU + depth on GPU, ~3-6 min incl. compiling)
F, W, H, CHUNK = 97, 384, 384, 9          # 97 = 1 + 12 chunks of 8 new frames
depth = ww.MonoDepth(device=0)
CAM_A = mv.room_path(F, deg=140.0)
t0 = time.time(); rgb_A, z_A = mv.scene_truth(CAM_A, W, H); print(f'room ready in {time.time()-t0:.0f}s')
CAM_B, rgb_B, z_B = photo.photo_inputs(PHOTO, F, W, H, depth, deg=90.0)
imageio.imwrite('photo_start.png', (rgb_B[0]*255).astype('uint8')); print('photo world ready')
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
EMB = {'room': encode(ROOM_PROMPT), 'photo': encode(PHOTO_PROMPT)}; NE = encode(NEG)
del te; gc.collect(); torch.cuda.empty_cache(); print('prompts encoded; text encoder freed')
""")
code("""
# 7. the video model + a chunk generator (gray holes, masks grown 8 px)
from diffusers import WanVACEPipeline, AutoencoderKLWan
from PIL import Image
vae = AutoencoderKLWan.from_pretrained(MID, subfolder='vae', torch_dtype=torch.float32)
DT = torch.float16
pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=DT).to('cuda')
times = []; CUR = {'pe': None}
def gen_chunk(frames, masks, idx):
    global pipe, DT
    mk = [ww.dilate(m, 8) for m in masks]
    video = [Image.fromarray((np.where(m[..., None], 0.5, f) * 255).astype('uint8')) for f, m in zip(frames, mk)]
    mask = [Image.fromarray((m * 255).astype('uint8')) for m in mk]
    for attempt in range(2):
        t0 = time.time()
        out = pipe(video=video, mask=mask, prompt_embeds=CUR['pe'].to(DT), negative_prompt_embeds=NE.to(DT), height=H, width=W,
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
# 8. BUILD TWO WORLDS (~25-35 min): A = synthetic room 140 deg, B = real photo 90 deg; harmonised joins
res = {}
def save(name, frames, q=8):
    imageio.mimsave(name, [(np.clip(f, 0, 1)*255).astype('uint8') for f in frames], fps=12, quality=q)
for name, CAM, rgb, z, emb in (('room', CAM_A, rgb_A, z_A, 'room'), ('photo', CAM_B, rgb_B, z_B, 'photo')):
    print(f'=== world {name} ===')
    CUR['pe'] = EMB[emb]; times.clear(); raw = []; t0 = time.time()
    out, shown, back = mv.chunked_world(gen_chunk, CAM, W, H, rgb, z, 'single', depth, chunk=CHUNK, dev='cuda',
                                        lift='last', raw_out=raw, blend='field_off')
    out['minutes_total'] = (time.time() - t0) / 60; out['minutes_per_chunk'] = float(np.mean(times)) / 60 if times else 0.0
    res[name] = out
    save(f'shown_{name}.mp4', shown); save(f'walkback_{name}.mp4', back)
    mv.export_world(mv.chunked_world.world, CAM, f'world_{name}')   # opens in worldwalk/viewer (phone)
    if raw:
        save(f'raw_{name}.mp4', np.concatenate(raw), q=9)   # lets us replay the real model output on CPU
    print({k: v for k, v in out.items() if k != 'token_frac_per_chunk'})
json.dump(res, open('results_v4.json', 'w'), indent=1)
""")
code("""
# 9. download (send results_v4.zip back)
!zip -q results_v4.zip results_v4.json photo_start.png shown_*.mp4 walkback_*.mp4 raw_*.mp4 world_*.bin world_*.json
from google.colab import files; files.download('results_v4.zip')
""")
nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4", "provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "world_chunked_v4.ipynb"), "w", encoding="utf-8"), indent=1)
print("wrote world_chunked_v4.ipynb")
