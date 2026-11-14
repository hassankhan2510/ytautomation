"""
First-principles bound for a "novelty-proportional" world model:
of all the pixels a camera shows while exploring a world, what fraction show something the
camera has NEVER seen before? Everything else is, in principle, re-renderable from stored state
instead of re-generated. (Lighting/dynamics aside — this measures geometry/visibility novelty.)

Exact geometry from the shotc scene: each pixel's first-hit world point is quantised into 2 cm
cells; a pixel is "novel" if its cell was never visible in any earlier frame.
"""
import math
import sys

import numba as nb
import numpy as np

import tracer as T


@nb.njit(parallel=True, cache=True)
def hit_points(CAM, f, W, H, SPH, BOX):
    P = np.full((H, W, 3), np.nan)
    for y in nb.prange(H):
        for x in range(W):
            ox, oy, oz, dx, dy, dz = T.cam_ray(CAM, f, x + 0.5, y + 0.5, W, H)
            t, m, nx, ny, nz = T.hit_scene(ox, oy, oz, dx, dy, dz, T.INF, SPH, BOX)
            if m >= 0:
                P[y, x, 0], P[y, x, 1], P[y, x, 2] = ox + t * dx, oy + t * dy, oz + t * dz
    return P


def walk_path(F, W, H, fov=62.0, turn_deg=150.0):
    """Exploration: walk through the room while turning (the world-model use case)."""
    CAM = np.zeros((F, 13))
    for f in range(F):
        u = f / max(1, F - 1)
        pos = np.array([-2.2 + 4.0 * u, 1.6, 2.2 - 3.6 * u])
        a = math.radians(-60 + turn_deg * u)
        fwd = np.array([math.sin(a), -0.08, -math.cos(a)])
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, [0.0, 1.0, 0.0])
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        CAM[f] = [*pos, *fwd, *right, *up, math.tan(math.radians(fov) / 2)]
    return CAM


def novelty(CAM, F, W, H, SPH, BOX, cell=0.02):
    seen = np.empty(0, dtype=np.int64)
    fr = []
    for f in range(F):
        P = hit_points(CAM, f, W, H, SPH, BOX).reshape(-1, 3)
        ok = ~np.isnan(P[:, 0])
        q = np.floor(P[ok] / cell).astype(np.int64) + 4096
        keys = (q[:, 0] * 8192 + q[:, 1]) * 8192 + q[:, 2]
        new = ~np.isin(keys, seen)
        fr.append(new.mean())
        seen = np.union1d(seen, keys)
    return np.array(fr)


if __name__ == "__main__":
    W, H, F = 270, 480, int(sys.argv[1]) if len(sys.argv) > 1 else 240  # 240 frames = 10 s at 24 fps
    SPH, BOX, MAT, LGT = T.studio_scene("hard")
    for name, CAM in (("orbit (product shot)", T.camera_path(F, W, H)), ("walk + turn 150deg (exploration)", walk_path(F, W, H)),
                      ("fast walk + turn 300deg", walk_path(F, W, H, turn_deg=300.0))):
        fr = novelty(CAM, F, W, H, SPH, BOX)
        print(f"{name:34s} first frame 100% new; frames 2..{F}: mean {fr[1:].mean() * 100:5.2f}% new pixels, "
              f"p95 {np.percentile(fr[1:], 95) * 100:5.2f}%  -> whole clip {fr.mean() * 100:5.2f}% of all pixels are novel")


def token_novelty(CAM, F, W, H, SPH, BOX, cell=0.02, tok=16, tframes=4, dil=1):
    """Same, in a video DiT's units: a latent token = tok x tok pixels x tframes frames; a token is
    'novel' if any pixel in it is novel, after dilating the mask by `dil` tokens (seam band)."""
    seen = np.empty(0, dtype=np.int64)
    gh, gw = H // tok, W // tok
    masks = []
    for f in range(F):
        P = hit_points(CAM, f, W, H, SPH, BOX).reshape(-1, 3)
        ok = ~np.isnan(P[:, 0])
        q = np.floor(np.nan_to_num(P) / cell).astype(np.int64) + 4096
        keys = (q[:, 0] * 8192 + q[:, 1]) * 8192 + q[:, 2]
        new = np.zeros(len(keys), bool)
        new[ok] = ~np.isin(keys[ok], seen)
        seen = np.union1d(seen, keys[ok])
        m = new.reshape(H, W)[: gh * tok, : gw * tok].reshape(gh, tok, gw, tok).any(axis=(1, 3))
        masks.append(m)
    out = []
    for s in range(1, F // tframes):  # skip the first latent step (everything is new)
        m = np.any(masks[s * tframes:(s + 1) * tframes], axis=0)
        if dil:
            d = m.copy()
            d[1:, :] |= m[:-1, :]; d[:-1, :] |= m[1:, :]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
            m = d
        out.append(m.mean())
    return np.array(out)


def report_tokens(F=240, W=540, H=960):
    SPH, BOX, MAT, LGT = T.studio_scene("hard")
    for name, CAM in (("orbit", T.camera_path(F, W, H)), ("walk+turn 150", walk_path(F, W, H)), ("fast walk+turn 300", walk_path(F, W, H, turn_deg=300.0))):
        r = token_novelty(CAM, F, W, H, SPH, BOX)
        print(f"{name:20s} latent steps: median {np.median(r) * 100:5.1f}% novel tokens, p90 {np.percentile(r, 90) * 100:5.1f}%, "
              f"steps under 5%: {np.mean(r < 0.05) * 100:4.0f}%, under 1%: {np.mean(r < 0.01) * 100:4.0f}%  -> token-pruning bound ~{1 / max(r.mean(), 1e-3):.1f}x")
