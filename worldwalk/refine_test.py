"""Does refining magnified regions make the persistent world better? Oracle generator on the synthetic
room (ground truth known): score the WALK-BACK frames (pure render from the final world) against the
true views, and count the extra generation it costs.  python refine_test.py [frames] [thresholds]"""
import os, sys, json, math, time
import numpy as np
os.environ.setdefault("SF_G", "12"); os.environ.setdefault("SF_LAM", "10")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shotc"))
import mv, ww

F = int(sys.argv[1]) if len(sys.argv) > 1 else 97
TH = [float(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "0,2.5,1.6").split(",")]
W = H = 384
PATH = os.environ.get("PATH_KIND", "turn")
CAM = mv.room_path(F, deg=140.0)
if PATH == "approach":  # walk 1.6 m towards the pedestal while turning 30 deg: everything gets closer
    CAM = mv.room_path(F, deg=30.0)
    f0 = CAM[0, 3:6].copy()
    for f in range(F):
        CAM[f, 0:3] += f0 * 1.6 * f / (F - 1)
gt_rgb, gt_z = mv.scene_truth(CAM, W, H)
depth = ww.MonoDepth()
res = {}
for th in TH:
    t0 = time.time()
    out, shown, back = mv.chunked_world(mv.oracle_gen(gt_rgb), CAM, W, H, gt_rgb, gt_z, "single", depth, chunk=9, lift="last", blend="field_off", refine=th, log=lambda *a: None)
    b = back[::-1]
    ps = [10 * math.log10(1 / max(float(np.mean((b[f] - gt_rgb[f]) ** 2)), 1e-10)) for f in range(1, F)]
    # sharpness of the revisit vs truth (gradient energy ratio; 1.0 = as sharp as reality)
    def gm(x): g = x.mean(-1); return np.hypot(*np.gradient(g)).mean()
    sharp = float(np.mean([gm(b[f]) / max(gm(gt_rgb[f]), 1e-6) for f in range(1, F, 4)]))
    out.update({"revisit_psnr_vs_truth": float(np.mean(ps)), "revisit_psnr_worst": float(np.min(ps)), "revisit_sharpness": sharp, "seconds": time.time() - t0})
    res[str(th)] = out
    print("RES", th, json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in out.items() if k != "token_frac_per_chunk"}), flush=True)
    np.save(f"runs/refine_back_{PATH}_{th}.npy", (np.clip(b, 0, 1) * 255).astype(np.uint8))
json.dump(res, open(f"runs/refine_test_{PATH}.json", "w"), indent=1)
