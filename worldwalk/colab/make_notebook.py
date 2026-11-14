"""Writes multiview_kill_test.ipynb (run: python make_notebook.py)."""
import json
import os

cells = []


def md(t):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": t.strip("\n").splitlines(True)})


def code(t):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": t.strip("\n").splitlines(True)})


md("""
# Multi-view lifting — GPU kill-test (free Colab T4, ~60-90 min)

**Question:** when an AI video model imagines new parts of a world as a short clip, can we place that
content in 3D *by triangulation across its own frames* — better than single-image depth (which drifts)?

Steps: render our persistent world along a turning camera (unseen parts = holes) → **Wan2.1-VACE-1.3B**
(Apache-2.0) fills the holes as one consistent clip → lift the clip into a growing 3D world two ways
(*single-view* depth vs *multi-view triangulation*) → score the final world against the generated frames.

**Before you start:** Runtime → Change runtime type → **T4 GPU**. Then Runtime → Run all.
Nothing here needs your accounts or keys. At the end a `results.zip` downloads.
""")

code("""
# 1. check the machine
!nvidia-smi --query-gpu=name,memory.total --format=csv
import psutil, shutil
print(f"RAM {psutil.virtual_memory().total/1e9:.1f} GB · free disk {shutil.disk_usage('/').free/1e9:.0f} GB")
""")

code("""
# 2. install (2-4 min)
!pip -q install -U "diffusers>=0.35" transformers accelerate sentencepiece ftfy numba imageio imageio-ffmpeg
""")

code("""
# 3. get our research code (public repo, only the two folders we need)
import os, sys
if not os.path.exists('ytautomation'):
    !git clone -q --depth 1 --filter=blob:none --sparse https://github.com/hassankhan2510/ytautomation.git
    !cd ytautomation && git sparse-checkout set shotc worldwalk
sys.path.insert(0, '/content/ytautomation/worldwalk'); sys.path.insert(0, '/content/ytautomation/shotc')
os.environ['SF_G'] = '12'; os.environ['SF_LAM'] = '10'
import mv, ww, numpy as np, time
print('code ready')
""")

code("""
# 4. build the input clip from our persistent world (CPU, ~2-5 min incl. compiling)
t0 = time.time()
F, W, H = 33, 320, 320            # 33 frames (4k+1 as Wan needs), 320x320 to fit a T4
inp = mv.build_inputs(F=F, W=W, H=H)
print(f'built in {time.time()-t0:.0f}s · holes (unseen) per frame: {100*inp["masks"].mean():.1f}% on average')
import imageio
imageio.mimsave('input_with_holes.mp4', [(f*255).astype('uint8') for f in inp['frames']], fps=8)
""")

code("""
# 5. encode the text prompt on the GPU, then free the 11 GB text encoder (keeps RAM/VRAM low)
import torch, gc
from transformers import AutoTokenizer, UMT5EncoderModel
MID = 'Wan-AI/Wan2.1-VACE-1.3B-diffusers'
PROMPT = ('a quiet minimalist photo studio room, plaster walls in white, teal and terracotta, a polished gold '
          'sphere on a white pedestal, soft overhead light, realistic photograph, steady camera pan')
NEG = 'blurry, distorted, flickering, warped, text, watermark, low quality, cartoon'
tok = AutoTokenizer.from_pretrained(MID, subfolder='tokenizer')
te = UMT5EncoderModel.from_pretrained(MID, subfolder='text_encoder', torch_dtype=torch.float16, device_map='cuda')
def encode(text, L=512):
    ti = tok([text], padding='max_length', max_length=L, truncation=True, add_special_tokens=True, return_attention_mask=True, return_tensors='pt')
    n = int(ti.attention_mask.gt(0).sum())
    with torch.no_grad():
        e = te(ti.input_ids.cuda(), ti.attention_mask.cuda()).last_hidden_state[0, :n]
    return torch.cat([e, e.new_zeros(L - n, e.shape[1])])[None]
pe, ne = encode(PROMPT), encode(NEG)
del te; gc.collect(); torch.cuda.empty_cache()
print('prompt encoded', pe.shape, '· text encoder freed')
""")

code("""
# 6. load the video model (fp16 on a T4) and fill the holes as ONE clip (~10-30 min)
from diffusers import WanVACEPipeline, AutoencoderKLWan
from PIL import Image
vae = AutoencoderKLWan.from_pretrained(MID, subfolder='vae', torch_dtype=torch.float32)
pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=torch.float16)
pipe.to('cuda')
video = [Image.fromarray((np.where(m[..., None], 0.5, f) * 255).astype('uint8')) for f, m in zip(inp['frames'], inp['masks'])]
mdil = [ww.dilate(m, 2) for m in inp['masks']]
mask = [Image.fromarray((m * 255).astype('uint8')) for m in mdil]
t0 = time.time()
out = pipe(video=video, mask=mask, prompt_embeds=pe.to(torch.float16), negative_prompt_embeds=ne.to(torch.float16),
           height=H, width=W, num_frames=F, num_inference_steps=25, guidance_scale=5.0,
           generator=torch.Generator('cuda').manual_seed(0), output_type='np').frames[0]
gen_raw = np.asarray(out, dtype=np.float32)
print(f'generated in {(time.time()-t0)/60:.1f} min · shape {gen_raw.shape} · NaNs: {int(np.isnan(gen_raw).sum())}')
if np.isnan(gen_raw).any() or gen_raw.std() < 1e-3:
    print('half precision failed on this GPU -> retrying in full precision (slower)')
    del pipe; gc.collect(); torch.cuda.empty_cache()
    pipe = WanVACEPipeline.from_pretrained(MID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=torch.float32).to('cuda')
    t0 = time.time()
    out = pipe(video=video, mask=mask, prompt_embeds=pe.float(), negative_prompt_embeds=ne.float(), height=H, width=W,
               num_frames=F, num_inference_steps=25, guidance_scale=5.0, generator=torch.Generator('cuda').manual_seed(0), output_type='np').frames[0]
    gen_raw = np.asarray(out, dtype=np.float32)
    print(f'generated in {(time.time()-t0)/60:.1f} min · NaNs: {int(np.isnan(gen_raw).sum())}')
# keep the known (rendered) pixels exactly; take only the imagined pixels from the model
gen = np.where(np.array(mdil)[..., None], gen_raw, inp['frames']).astype(np.float32)
np.save('gen.npy', gen)
imageio.mimsave('generated.mp4', [(np.clip(g, 0, 1)*255).astype('uint8') for g in gen], fps=8)
del pipe; gc.collect(); torch.cuda.empty_cache()
""")

code("""
# 7. the kill-test: lift the clip into ONE growing 3D world, single-view vs multi-view (~10-20 min)
import json
depth = ww.MonoDepth(device=0)
res = {}
print('REAL generator (Wan2.1-VACE):')
for m in ('single', 'multi'):
    t0 = time.time(); res['real_' + m] = mv.chained_lift(gen, inp, m, depth, dev='cuda'); print(f'    {time.time()-t0:.0f}s')
print('ORACLE generator (perfectly consistent; reference):')
oracle = np.where(inp['masks'][..., None], inp['gt_rgb'], inp['frames']).astype(np.float32)
for m in ('single', 'multi'):
    res['oracle_' + m] = mv.chained_lift(oracle, inp, m, depth, dev='cuda')
json.dump(res, open('results.json', 'w'), indent=1)
r = res
print()
print(f"VERDICT (real generator): multi-view depth error {r['real_multi']['median_lift_err']:.3f} vs single {r['real_single']['median_lift_err']:.3f}; "
      f"final-world PSNR {r['real_multi']['psnr_imagined']:.2f} vs {r['real_single']['psnr_imagined']:.2f} dB")
""")

code("""
# 8. download results (send results.zip back)
!zip -q results.zip results.json input_with_holes.mp4 generated.mp4
from google.colab import files
files.download('results.zip')
""")

nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4", "provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"},
                                   "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
here = os.path.dirname(os.path.abspath(__file__))
json.dump(nb, open(os.path.join(here, "multiview_kill_test.ipynb"), "w", encoding="utf-8"), indent=1)
print("wrote multiview_kill_test.ipynb")
