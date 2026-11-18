# World model — research log ("novelty-proportional world model")

*Paused 2026-11-18 to focus on the studio. Everything needed to resume is here.*

## The idea in one paragraph
Turn a photo (later: a script) into a **persistent 3D world** that is **rendered** by default — cheap, runs on a
phone CPU — and call a video AI **only for parts never seen before**. What the AI imagines is lifted back into the
3D world, so revisiting is free and exact. Pitch that survives the prior-art scan: **compute proportional to
novelty + the phone renders by default + $0 hardware** (NOT "3D cache + video model", which is published).

## Code map (`worldwalk/`)
| file | what |
|---|---|
| `ww.py` | splat renderer (numba), unproject, LaMa ONNX, Depth Anything V2 Small, scale/shift fields, plane fit/snap |
| `mv.py` | `World`, `chunked_world()` (the main loop), harmonize (colour seams), refine/replace, plane growing, metrics: `seam_score`, `seam_parts`, `token_novelty`, `colour_glitch`, `export_world` |
| `photo.py` | real photo → depth → world → camera walk |
| `replay_v3.py` | re-runs saved real Colab AI output on CPU (validated: CPU predicted seam 3.09, GPU measured 3.05) |
| `novelty_kinds.py` | "two kinds of new" kill-test |
| `refine_test.py` | repaint test with ground truth (`WW_MATTE=1` = no mirror sphere) |
| `lora_merge.py` | merges ComfyUI/Kijai-format Wan LoRAs into diffusers models (unit-tested exact) |
| `multiuser.py`, `spec.py` | shared-world economics, speculative pre-generation sims |
| `viewer/index.html` | phone viewer: WebGL2 point renderer + software fallback (216k pts in 17.8 ms/frame, no GPU) |
| `colab/make_notebook_vN.py` → `*.ipynb` | Colab T4 experiments (generator scripts; regenerate the .ipynb from them) |

Results zips live in `worldwalk/runs/colab/` (gitignored), unpacked into `v2/ … v6/`.

## Timeline of experiments
| ver | what changed | result | verdict |
|---|---|---|---|
| CPU 1 | single-image lifting (LaMa + mono depth) | revisit 50.9 dB, but lifting depth error 56-84% | own **scalefield** fit best (34-35 dB vs 44.8 ceiling); elastic solve failed |
| Colab v1 | one-shot VACE video inpainting + triangulation | AI content **screen-locked** (no parallax) | ❌ need chunked, world-locked generation |
| v2 | 9-frame chunks rendered from the world | world-locked, 0% walk-back holes, 28 s/chunk — but **stripes** (seam 4.7) | per-frame sliver lifting is wrong |
| v3 | **keyframe lifting** (only last frame of a chunk enters the world) | stripes gone (stripe ratio = raw model), depth err 29% vs 53% | ✅ kept; seam 9.2 = colour joins |
| CPU | **harmonize** (colour field at the join, σ=3) | seam 9.3 → 3.1 (floor 2.6) | ✅ default |
| v4 | real photo (lab) + 140° room, 97 frames | AI continued the lab; walk-back exact; **smears** | thin edge strips → AI stretches lines |
| CPU | **generate ahead** (stride 3: one AI chunk spans 24 frames) | oracle: 3× fewer calls, 2.2× less work, seam 1.78→1.48 | ✅ default (prior art: SRENDER 2601.09697) |
| CPU | repaint magnified areas | +0.4 dB on matte scene at 2× tokens; mirror sphere breaks it (view-dependent colour) | off by default |
| v5 | generate ahead on GPU | **4 AI calls (was 12), 4.8 min (was 12), photo seam 1.26 (was 2.29)**; AI draws objects, not streaks | ✅; neon colour glitches remain |
| CPU | "two kinds of new" (cheap filler for "more of the same") | only **22%** of new area matches a cheap fill on the cluttered lab | ❌ dropped as main direction |
| v6 | 480p, guidance 6, shift 8, **holes pre-filled with nearby colours** | C2: realistic lab equipment, colour noise −63%, seam 1.36; 93 s/call | ✅ **C2 = new default** — glitches came from OUR settings (grey hole fill + 384px) |
| CPU | **plane growing** depth (planes grow along colour + surface orientation) | perfect-content: depth err 7.3% → 5.8%; colour-only growing fails (96%) | promising, needs real-AI test (v7) |

Key metric numbers to beat: v5 photo seam **1.26**; v6 C2 hue noise **0.010**; real photo's own hue noise 0.007.

## Ready to run (not run yet)
- **v8 speed** — `colab/world_speed_v8.ipynb`: C2 at 40 steps vs CausVid LoRA at 8/6/4 steps (guidance 1, merged
  with our own loader). Expectation: ~10× faster per AI call if S6/S8 look as clean as 40 steps. Errors are saved
  inside `results_v8.json`.
- **v7 depth** — `colab/world_depth_v7.ipynb`: room walk with real AI, depth methods D0 current / D1 plane
  growing / D2 Marigold-DC (Apache-2.0). Uses old v5 generator settings (fine: compares depth only).
- Colab tips: Runtime → T4 GPU → Run all; save the zip into `worldwalk/runs/colab/` (not Downloads).

## Ideas still open (ranked)
1. **Token-sparse filling** — run the video model only on the ~25-35% of tokens that touch new content (measured
   19-35% in our runs). Prior: DreamStereo 2604.12270 (10.7×), YOSE 2604.27322 (on VACE, 2.5×). Not found inside a
   persistent-world loop → the investor speed demo.
2. **Consensus lifting** (own idea) — generate twice, lift only what both agree on in 3D; regenerate the rest.
3. **Depth for big holes** — v7 results decide: plane growing vs Marigold-DC vs DA3-Small / DepthLab.
4. **View-dependent colour** (mirrors/gloss) — spherical-harmonics colour per point; needs several views.
5. **Photo walk-in scene for the studio** — the product bridge (camera walks into an uploaded photo).
6. **Story Worlds** — script → 3D world + narration-choreographed camera (closest: World Labs Memory House, Lyra 2.0).
7. Later: dynamics (moving people), per-world tiny model on the phone, world streaming to phones.

## Prior art to cite / not to claim
GEN3C 2503.03751 · Voyager 2506.04225 · WorldWarp 2512.19678 (fill-and-revise noise) · SRENDER 2601.09697
(sparse keyframes + render = our "generate ahead") · World from Motion 2607.01202 (our loop in 4D, Wan+VACE) ·
Lyra 2.0 2604.13036 · GSExplorer 2611.01543 · DreamStereo 2604.12270 · YOSE 2604.27322 · CausVid 2412.07772 ·
Self-Forcing 2506.08009 · Marigold-DC 2412.13389 · DepthLab 2412.18153 · DA3 2511.10647 · Difix3D+ 2503.01774.

## Lessons (don't repeat)
- Check prior art BEFORE calling anything new (we re-invented SRENDER's keyframes).
- Our own metrics have blind spots: world_psnr favours per-frame lifting; "oversaturation" counts real bright
  objects. Always look at the frames.
- The AI paints what the hole is told: flat grey holes → grey blobs; colour-prefilled holes → real objects.
- Test regimes matter: 49 frames + stride 3 gives keyframes with zero overlap (useless test).
- The laptop has 8.5 GB RAM and ~3 GB free disk: never run two CPU tests at once; GPU work goes to Colab.
