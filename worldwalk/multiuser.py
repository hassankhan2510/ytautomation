"""
COMPUTE NETWORK EFFECT — does generation cost per user FALL as more users share one persistent world?

A city block (streets + random buildings). K users walk independent random routes at the same time.
Each step, every user's view is rendered from the SHARED explicit state; only pixels nobody has ever
seen (excluding sky) need the generator, and whatever is generated is lifted into the shared state
for everyone. Lifting uses exact depth here on purpose: this experiment isolates the ECONOMICS
(how much must be generated), not the lifting quality (measured separately in ww.py).

Baseline for comparison: a frame-generating world model pays for every pixel of every frame of every
user, and users cannot share anything.
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "shotc"))
import tracer as T  # noqa: E402
import ww  # noqa: E402


def city(seed=7, n=7, block=8.0, street=4.0):
    rng = np.random.default_rng(seed)
    pal = [[0.75, 0.72, 0.68], [0.55, 0.60, 0.70], [0.80, 0.55, 0.40], [0.45, 0.62, 0.50], [0.70, 0.70, 0.75], [0.62, 0.48, 0.58]]
    MAT = [[0.40, 0.40, 0.42, T.DIFFUSE, 0.0], [0.0, 0.0, 0.0, T.LIGHT, 0.0]] + [[*c, T.DIFFUSE, 0.0] for c in pal]
    span = n * (block + street)
    BOX = [[-span, -0.2, -span, span, 0.0, span, 0]]  # ground
    for i in range(-n // 2, n // 2 + 1):
        for j in range(-n // 2, n // 2 + 1):
            cx, cz = i * (block + street), j * (block + street)
            for _ in range(rng.integers(1, 4)):  # 1-3 buildings per block
                w, d = rng.uniform(2.0, block / 2), rng.uniform(2.0, block / 2)
                x0 = cx + rng.uniform(-block / 2, block / 2 - w)
                z0 = cz + rng.uniform(-block / 2, block / 2 - d)
                BOX.append([x0, 0.0, z0, x0 + w, rng.uniform(3, 14), z0 + d, 2 + int(rng.integers(0, len(pal)))])
    BOX.append([-30, 80.0, -30, 30, 80.5, 30, 1])  # sky light panel ("sun")
    SPH = np.zeros((0, 5))
    LGT = np.array([-30, 30, -30, 30, 80.0, 0.6, 0.58, 0.52])
    return SPH, np.array(BOX, dtype=np.float64), np.array(MAT, dtype=np.float64), LGT, block, street


def walkers(K, F, block, street, n=7, seed=0, fov=70.0, speed=0.12):
    """K users walking along the street grid, turning at random at crossings, looking around."""
    rng = np.random.default_rng(seed)
    pitch = block + street
    cams = np.zeros((K, F, 13))
    for k in range(K):
        gx, gz = rng.integers(-n // 2, n // 2), rng.integers(-n // 2, n // 2)
        pos = np.array([gx * pitch + pitch / 2, 1.6, gz * pitch + pitch / 2])  # on a crossing
        heading = rng.choice([0, 90, 180, 270])
        look = 0.0
        for f in range(F):
            d = np.array([math.sin(math.radians(heading)), 0, -math.cos(math.radians(heading))])
            pos = pos + speed * d
            # at a crossing, maybe turn
            on_x = abs(((pos[0] - pitch / 2) / pitch) - round((pos[0] - pitch / 2) / pitch)) < speed / pitch
            on_z = abs(((pos[2] - pitch / 2) / pitch) - round((pos[2] - pitch / 2) / pitch)) < speed / pitch
            if on_x and on_z and rng.random() < 0.5:
                heading = (heading + rng.choice([-90, 90])) % 360
            lim = (n // 2) * pitch
            if abs(pos[0]) > lim or abs(pos[2]) > lim:
                heading = (heading + 180) % 360
            look = 0.85 * look + rng.normal(0, 6)  # glancing around
            a = math.radians(heading + look)
            fwd = np.array([math.sin(a), -0.05, -math.cos(a)])
            fwd /= np.linalg.norm(fwd)
            right = np.cross(fwd, [0.0, 1.0, 0.0])
            right /= np.linalg.norm(right)
            up = np.cross(right, fwd)
            cams[k, f] = [*pos, *fwd, *right, *up, math.tan(math.radians(fov) / 2)]
    return cams


def run(K, F, W, H, seed, tau=0.002, n=7):
    """n = city size in blocks: 7 = open city (paths scatter), 3 = small plaza/hub (paths overlap)."""
    SPH, BOX, MAT, LGT, block, street = city(n=n)
    cams = walkers(K, F, block, street, n=n, seed=seed)
    P = np.zeros((0, 3))
    C = np.zeros((0, 3), np.float32)
    R = np.zeros(0)
    gen_px = np.zeros(K)
    events = np.zeros(K)
    seen_px = np.zeros(K)
    for f in range(F):
        for k in range(K):
            CAM = cams[k]
            rgb, z = ww.gt_frame(CAM, f, W, H, SPH, BOX, MAT, LGT)
            sky = ~np.isfinite(z)
            if len(P):
                _, _, cov, _, _ = ww.splat(P, C, R.astype(np.float64), CAM, f, W, H, np.ones(len(P)))
            else:
                cov = np.zeros((H, W), bool)
            hole = ~cov & ~sky
            seen_px[k] += (~sky).sum()
            if hole.mean() > tau:
                events[k] += 1
                gen_px[k] += hole.sum()
                Pn, Rn, yn, xn = ww.unproject(CAM, f, W, H, np.where(sky, 1.0, z), hole)
                P = np.vstack([P, Pn])
                R = np.concatenate([R, Rn])
                C = np.vstack([C, rgb[yn, xn]])
    return {"K": K, "gen_px_per_user": float(gen_px.mean()), "gen_frac_of_viewed": float(gen_px.sum() / seen_px.sum()),
            "events_per_user": float(events.mean()), "frames_per_user": F, "points": int(len(P))}


if __name__ == "__main__":
    F = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    W = H = 128
    out = []
    for K in (1, 2, 4, 8):
        rs = [run(K, F, W, H, seed=s, n=n) for s in (0, 1)]  # two random crowds per K
        r = {k: float(np.mean([x[k] for x in rs])) for k in rs[0]}
        out.append(r)
        base = out[0]["gen_px_per_user"]
        print(f"K={K}: generated pixels per user {r['gen_px_per_user']:9.0f}  ({r['gen_px_per_user'] / base:5.2f}x of solo)  "
              f"= {100 * r['gen_frac_of_viewed']:5.2f}% of all pixels viewed  ·  generation events per user {r['events_per_user']:5.1f}/{F}  ·  world points {r['points']:.0f}", flush=True)
    os.makedirs(os.path.join(HERE, "runs"), exist_ok=True)
    json.dump(out, open(os.path.join(HERE, "runs", f"multiuser_n{n}.json"), "w"), indent=1)
