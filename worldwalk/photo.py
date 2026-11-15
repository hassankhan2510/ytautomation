"""Start the persistent world from ONE REAL PHOTO (milestone 2: real look instead of the synthetic room).

photo -> monocular depth -> point world (frame 0) -> camera walks out of the photo (turn + step
forward) -> each chunk the world renders what it knows, the generator fills only the new area,
keyframe lifting writes it back. There is no ground truth for a real photo, so the scores are the
ones that do not need it: seam, sharpness/colour at the join, revisit consistency (world_psnr),
walk-back holes, generator calls and token novelty.

CPU check:  python photo.py <photo.jpg> [frames] [size]      (generator = LaMa, a stand-in for the video model)
"""
import math
import os
import sys
import json
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "shotc"))
os.environ.setdefault("SF_G", "12"); os.environ.setdefault("SF_LAM", "10")
import mv  # noqa: E402
import ww  # noqa: E402


def load_photo(path, W, H):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    s = min(w / W, h / H)  # centre crop to the target aspect, then resize
    cw, ch = int(W * s), int(H * s)
    im = im.crop(((w - cw) // 2, (h - ch) // 2, (w - cw) // 2 + cw, (h - ch) // 2 + ch)).resize((W, H), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255


def photo_depth(rgb, depth_model, near=1.0, far=12.0):
    """Relative disparity -> plausible metric depth: robustly map the 2nd..98th percentile of
    disparity onto 1/far..1/near (a single-photo world has no true scale; consistency is what counts)."""
    d = depth_model(rgb)
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    dn = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
    return (1.0 / (1.0 / far + dn * (1.0 / near - 1.0 / far))).astype(np.float32)


def photo_path(F, fov=60.0, deg=70.0, forward=0.8, side=0.3):
    """Frame 0 = the photo's own camera (origin, looking down -z). Then turn right by `deg` while
    stepping forward and a little sideways (parallax), so new space enters from the right edge."""
    CAM = np.zeros((F, 13))
    for f in range(F):
        u = f / max(1, F - 1)
        a = math.radians(deg * u)
        fwd = np.array([math.sin(a), 0.0, -math.cos(a)])
        right = np.cross(fwd, [0.0, 1.0, 0.0]); right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        pos = np.array([side * u, 0.0, -forward * u])
        CAM[f] = [*pos, *fwd, *right, *up, math.tan(math.radians(fov) / 2)]
    return CAM


def photo_inputs(path, F, W, H, depth_model, **kw):
    """gt_rgb / gt_z in the shape chunked_world expects: only frame 0 is known (the photo + its
    depth); the rest is NaN depth, so depth-error metrics are skipped automatically."""
    rgb0 = load_photo(path, W, H)
    z0 = photo_depth(rgb0, depth_model)
    gt_rgb = np.zeros((F, H, W, 3), np.float32); gt_rgb[0] = rgb0
    gt_z = np.full((F, H, W), np.nan, np.float32); gt_z[0] = z0
    return photo_path(F, **kw), gt_rgb, gt_z


def lama_gen(lama):
    return lambda frames, masks, idx: np.array([lama(f, ww.dilate(m, 4)) for f, m in zip(frames, masks)])


if __name__ == "__main__":
    path = sys.argv[1]
    F = int(sys.argv[2]) if len(sys.argv) > 2 else 49
    S = int(sys.argv[3]) if len(sys.argv) > 3 else 384
    out_dir = os.path.join(HERE, "runs", "photo"); os.makedirs(out_dir, exist_ok=True)
    depth = ww.MonoDepth()
    CAM, gt_rgb, gt_z = photo_inputs(path, F, S, S, depth)
    lama = ww.Lama()
    res = {}
    for blend in os.environ.get("PHOTO_BLENDS", "hard,field_off").split(","):
        t0 = time.time()
        out, shown, back = mv.chunked_world(lama_gen(lama), CAM, S, S, gt_rgb, gt_z, "single", depth, chunk=9, lift="last", blend=blend, log=lambda *a: None)
        out["seconds"] = time.time() - t0
        res[blend] = out
        print("RES", blend, json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in out.items() if k != "token_frac_per_chunk"}))
        np.save(os.path.join(out_dir, f"shown_{blend}.npy"), (np.clip(shown, 0, 1) * 255).astype(np.uint8))
        np.save(os.path.join(out_dir, f"back_{blend}.npy"), (np.clip(back, 0, 1) * 255).astype(np.uint8))
        n = mv.export_world(mv.chunked_world.world, CAM, os.path.join(out_dir, f"world_{blend}"))
        print(f"exported {n} points")
    json.dump(res, open(os.path.join(out_dir, "photo_cpu.json"), "w"), indent=1)
