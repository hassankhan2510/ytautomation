"""Writes world_depth_v7.ipynb (run: python make_notebook_v7.py)."""
import json, os
cells = []
md = lambda t: cells.append({"cell_type": "markdown", "metadata": {}, "source": t.strip("\n").splitlines(True)})
code = lambda t: cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": t.strip("\n").splitlines(True)})

md("""
# Depth of imagined content — v7 (free Colab T4, ~45-60 min)

When the AI imagines a big new area, we must decide how FAR away each new pixel is before it goes into
the 3D world. On the synthetic room (where the true depth is known) our current method was off by up to
182% in v5 — that's why imagined parts bend and float when you walk somewhere new.

Same room walk as v5 (real AI, generate-ahead, 4 AI calls), three depth methods side by side:
* **D0 current** — mono depth (Depth Anything V2 Small) + our smooth scale/shift field
* **D1 plane growing (ours)** — the walls/floor the world already knows are grown into the new area,
  pixel by pixel, where the painted colour continues AND the surface faces the same way; claimed pixels
  get exact geometric depth (CPU check with perfect content: depth error 7.3% -> 5.8%)
* **D2 Marigold-DC** (Apache-2.0, ETH Zurich) — a diffusion depth model guided at test time to agree with
  the known depth, filling the rest

Scored against the TRUE depth: depth error of lifted pixels, and how well walking back matches the truth.

**Start:** Runtime → Change runtime type → **T4 GPU**, then Runtime → Run all. `results_v7.zip` downloads at the end.
""")
code("""
# 1. machine
!nvidia-smi --query-gpu=name,memory.total --format=csv
""")
code("""
# 2. install (3-5 min; red 'dependency conflicts' warnings about cuml/cudf/pytensor are harmless)
!pip -q install -U "diffusers>=0.35" transformers accelerate sentencepiece ftfy numba imageio imageio-ffmpeg
!git clone -q --depth 1 https://github.com/prs-eth/Marigold-DC.git /content/Marigold-DC || echo "Marigold-DC clone failed - D2 will be skipped"
""")
code("""
# 3. our research code
import os, sys
if not os.path.exists('ytautomation'):
    !git clone -q --depth 1 --filter=blob:none --sparse https://github.com/hassankhan2510/ytautomation.git
    !cd ytautomation && git sparse-checkout set shotc worldwalk
else:
    !cd ytautomation && git pull -q
sys.path.insert(0, '/content/ytautomation/worldwalk'); sys.path.insert(0, '/content/ytautomation/shotc')
os.environ['SF_G'] = '12'; os.environ['SF_LAM'] = '10'
import mv, ww, numpy as np, time, json, imageio, math, subprocess
print('code ready')
""")
code("""
# 4. the room walk with its TRUE depth (CPU, ~4-8 min incl. compiling)
F, S, CHUNK = 97, 384, 9
CAM = mv.room_path(F, deg=140.0)
t0 = time.time(); gt_rgb, gt_z = mv.scene_truth(CAM, S, S); print(f'room ready in {time.time()-t0:.0f}s')
depth = ww.MonoDepth(device=0)
""")
code("""
# 5. encode the prompt, free the 11 GB text encoder
import torch, gc
from transformers import AutoTokenizer, UMT5EncoderModel
MID = 'Wan-AI/Wan2.1-VACE-1.3B-diffusers'
PROMPT = ('the inside of an empty minimalist photo studio, plain plaster walls, a smooth grey concrete floor, '
          'a polished gold sphere on a white pedestal, soft even light, realistic photograph, slow smooth camera pan')
NEG = 'stripes, glitch, repeated patterns, clutter, blurry, distorted, warped, flickering, text, watermark, low quality, cartoon'
tok = AutoTokenizer.from_pretrained(MID, subfolder='tokenizer')
te = UMT5EncoderModel.from_pretrained(MID, subfolder='text_encoder', torch_dtype=torch.float16, device_map='cuda')
def encode(text, L=512):
    ti = tok([text], padding='max_length', max_length=L, truncation=True, add_special_tokens=True, return_attention_mask=True, return_tensors='pt')
    n = int(ti.attention_mask.gt(0).sum())
    with torch.no_grad():
        e = te(ti.input_ids.cuda(), ti.attention_mask.cuda()).last_hidden_state[0, :n]
    return torch.cat([e, e.new_zeros(L - n, e.shape[1])])[None]
PE, NE = encode(PROMPT), encode(NEG)
del te; gc.collect(); torch.cuda.empty_cache(); print('prompt encoded')
""")
code("""
# 6. the video model (v5 settings, so D0 reproduces the v5 room numbers)
from diffusers import WanVACEPipeline, AutoencoderKLWan
from PIL import Image
vae = AutoencoderKLWan.from_pretrained(MID, subfolder='vae', torch_dtype=torch.float32)
DT = torch.float16
pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=DT).to('cuda')
times = []
def gen_chunk(frames, masks, idx):
    mk = [ww.dilate(m, 8) for m in masks]
    video = [Image.fromarray((np.where(m[..., None], 0.5, f) * 255).astype('uint8')) for f, m in zip(frames, mk)]
    mask = [Image.fromarray((m * 255).astype('uint8')) for m in mk]
    t0 = time.time()
    out = pipe(video=video, mask=mask, prompt_embeds=PE.to(DT), negative_prompt_embeds=NE.to(DT), height=S, width=S,
               num_frames=len(idx), num_inference_steps=40, guidance_scale=5.0,
               generator=torch.Generator('cuda').manual_seed(idx[0]), output_type='np').frames[0]
    times.append(time.time() - t0)
    g = np.nan_to_num(np.asarray(out, dtype=np.float32), nan=0.5)
    print(f'  AI call frames {idx[0]}-{idx[-1]}: new area {100*np.mean(masks):.1f}% · {times[-1]:.0f}s')
    return g
print('model ready')
""")
code("""
# 7. the three depth methods
def d0_current(rgb, zr, cov, f, st):
    return mv.single_view_depth(rgb, zr, cov, depth, st)

CLAIM = []
def d1_plane_grow(rgb, zr, cov, f, st):
    z1, st2 = mv.single_view_depth(rgb, zr, cov, depth, st)
    z2, frac = mv.plane_grow_depth(rgb, zr, cov, CAM, f, z1)
    CLAIM.append(frac)
    return z2, st2

MDC_OK = os.path.exists('/content/Marigold-DC/marigold_dc.py')
def d2_marigold_dc(rgb, zr, cov, f, st):
    z1, st2 = mv.single_view_depth(rgb, zr, cov, depth, st)   # fallback if Marigold-DC fails
    if not MDC_OK:
        return z1, st2
    try:
        imageio.imwrite('/content/mdc_in.png', (np.clip(rgb, 0, 1) * 255).astype('uint8'))
        np.save('/content/mdc_sparse.npy', np.where(cov & np.isfinite(zr), zr, 0.0).astype(np.float32))
        r = subprocess.run([sys.executable, '-m', 'marigold_dc', '--in-image', '/content/mdc_in.png', '--in-depth', '/content/mdc_sparse.npy',
                            '--out-depth', '/content/mdc_out.npy', '--num_inference_steps', '30', '--processing_resolution', '0'],
                           cwd='/content/Marigold-DC', capture_output=True, text=True, timeout=900)
        zd = np.load('/content/mdc_out.npy').astype(np.float32)
        if zd.shape != zr.shape or not np.isfinite(zd[~cov]).any():
            raise RuntimeError(r.stderr[-300:])
        return np.where(cov, zr, np.where(np.isfinite(zd) & (zd > 0.05), zd, z1)), st2
    except Exception as e:
        print('  Marigold-DC failed on this frame -> fallback:', str(e)[:160])
        return z1, st2
print('Marigold-DC available:', MDC_OK)
""")
code("""
# 8. BUILD THE SAME WALK THREE TIMES (~30-40 min), score against the TRUE depth and views
res = {}
def save(name, frames, q=8):
    imageio.mimsave(name, [(np.clip(f, 0, 1)*255).astype('uint8') for f in frames], fps=12, quality=q)
for name, fn in (('D0_current', d0_current), ('D1_plane_grow', d1_plane_grow), ('D2_marigold_dc', d2_marigold_dc)):
    if name.startswith('D2') and not MDC_OK:
        continue
    print(f'=== {name} ===')
    times.clear(); CLAIM.clear(); t0 = time.time()
    out, shown, back = mv.chunked_world(gen_chunk, CAM, S, S, gt_rgb, gt_z, 'single', depth, chunk=CHUNK, dev='cuda',
                                        lift='last', blend='field_off', stride=3, depth_fn=fn)
    b = back[::-1]
    out['revisit_psnr_vs_truth'] = float(np.mean([10 * math.log10(1 / max(float(np.mean((b[f] - gt_rgb[f]) ** 2)), 1e-10)) for f in range(1, F)]))
    out['minutes_total'] = (time.time() - t0) / 60
    if CLAIM: out['plane_claimed_pct'] = 100 * float(np.mean(CLAIM))
    res[name] = out
    save(f'shown_{name}.mp4', shown); save(f'walkback_{name}.mp4', back)
    print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in out.items() if k in ('median_lift_err', 'revisit_psnr_vs_truth', 'seam_ratio', 'oversat_pct', 'plane_claimed_pct', 'minutes_total')})
json.dump(res, open('results_v7.json', 'w'), indent=1)
""")
code("""
# 9. download (send results_v7.zip back)
!zip -q results_v7.zip results_v7.json shown_*.mp4 walkback_*.mp4
from google.colab import files; files.download('results_v7.zip')
""")
nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4", "provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "world_depth_v7.ipynb"), "w", encoding="utf-8"), indent=1)
print("wrote world_depth_v7.ipynb")
