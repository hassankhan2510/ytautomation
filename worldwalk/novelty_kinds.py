"""Two kinds of "new": how much of what the video AI paints is just MORE OF THE SAME (continuation —
a cheap filler would produce the same kind of content) vs genuinely NEW content (semantic novelty — only
the big model can do it)?

Replays the REAL Colab output (raw_*.mp4) through the world builder on CPU; at every AI call, for each
16x16 token the AI painted, compares the AI's fill with two cheap fills (LaMa 27M on CPU, and a
nearest-colour smear) using texture STATISTICS (mean colour, contrast, edge energy, edge orientation) —
"same kind of stuff", not "same pixels" (a different brick of the same wall is fine).

    python novelty_kinds.py runs/colab/v5 photo_ahead 384
"""
import os
import subprocess
import sys

import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter

os.environ.setdefault("SF_G", "12"); os.environ.setdefault("SF_LAM", "10")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shotc"))
import mv  # noqa: E402
import photo  # noqa: E402
import ww  # noqa: E402

TOK = 16


def smear(f, m):
    if not m.any():
        return f
    _, (iy, ix) = distance_transform_edt(m, return_indices=True)
    near = f[iy, ix]
    return np.where(m[..., None], np.stack([gaussian_filter(near[..., c], 6) for c in range(3)], -1), f)


def tok_stats(img):
    """per-token texture statistics: mean RGB (3), contrast (1), edge energy (1), edge-orientation histogram (4)"""
    H, W = img.shape[:2]
    gh, gw = H // TOK, W // TOK
    g = img.mean(-1)
    gy, gx = np.gradient(g)
    mag = np.hypot(gx, gy)
    ang = (np.arctan2(gy, gx) % np.pi) / np.pi * 4
    out = np.zeros((gh, gw, 9), np.float32)
    for i in range(gh):
        for j in range(gw):
            sl = (slice(i * TOK, (i + 1) * TOK), slice(j * TOK, (j + 1) * TOK))
            p = img[sl]
            out[i, j, :3] = p.reshape(-1, 3).mean(0)
            out[i, j, 3] = g[sl].std()
            out[i, j, 4] = mag[sl].mean()
            h = np.bincount(np.minimum(ang[sl].astype(int).ravel(), 3), weights=mag[sl].ravel(), minlength=4)
            out[i, j, 5:] = h / (h.sum() + 1e-6)
    return out


def same_kind(a, b, col=0.07, con=0.035, edge=0.025, ori=0.35):
    """token-wise: is b 'the same kind of stuff' as a? (colour, contrast, edge energy, orientation)"""
    dc = np.abs(a[..., :3] - b[..., :3]).mean(-1)
    return (dc < col) & (np.abs(a[..., 3] - b[..., 3]) < con) & (np.abs(a[..., 4] - b[..., 4]) < edge) & \
           (0.5 * np.abs(a[..., 5:] - b[..., 5:]).sum(-1) < ori)


def main(d, name, S):
    F = 97
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(d, f"raw_{name}.mp4"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    raw = np.frombuffer(raw, np.uint8).reshape(-1, S, S, 3).astype(np.float32) / 255
    chunks = [raw[i:i + 9] for i in range(0, len(raw), 9)]
    depth = ww.MonoDepth()
    CAM, rgb, z = photo.photo_inputs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "theranos-doc", "public", "assets", "lab.jpg"), F, S, S, depth, deg=90.0)
    lama = ww.Lama()
    rows, totals = [], {"tok": 0, "lama": 0, "smear": 0, "either": 0}
    k = {"i": 0}

    def gen(frames, masks, idx):
        ai = chunks[k["i"]]; k["i"] += 1
        f, m = frames[-1], ww.dilate(masks[-1], 8)
        A = ai[-1]
        L = lama(f, m)
        Sm = smear(f, m)
        gh, gw = S // TOK, S // TOK
        novel = m[: gh * TOK, : gw * TOK].reshape(gh, TOK, gw, TOK).mean((1, 3)) > 0.5
        sa, sl, ss = tok_stats(A), tok_stats(L), tok_stats(Sm)
        kl, ks = same_kind(sa, sl) & novel, same_kind(sa, ss) & novel
        n = int(novel.sum())
        totals["tok"] += n; totals["lama"] += int(kl.sum()); totals["smear"] += int(ks.sum()); totals["either"] += int((kl | ks).sum())
        print(f"  AI call {k['i']}: {n} new tokens · LaMa same-kind {100 * kl.sum() / max(1, n):.0f}% · smear same-kind {100 * ks.sum() / max(1, n):.0f}% · either {100 * (kl | ks).sum() / max(1, n):.0f}%")
        # visual: AI fill | LaMa fill | map (green = cheap filler would do, red = genuinely new)
        mp = A.copy()
        for i in range(gh):
            for j in range(gw):
                if novel[i, j]:
                    c = np.array([0.1, 0.85, 0.2]) if (kl | ks)[i, j] else np.array([0.9, 0.1, 0.15])
                    sl_ = (slice(i * TOK, (i + 1) * TOK), slice(j * TOK, (j + 1) * TOK))
                    mp[sl_] = 0.55 * mp[sl_] + 0.45 * c
        rows.append(np.concatenate([A, L, mp], 1))
        return ai

    out, shown, back = mv.chunked_world(gen, CAM, S, S, rgb, z, "single", depth, chunk=9, lift="last", blend="field_off", stride=3, log=lambda *a: None)
    t = totals
    print(f"TOTAL {t['tok']} new tokens: cheap filler 'same kind' — LaMa {100 * t['lama'] / max(1, t['tok']):.0f}% · smear {100 * t['smear'] / max(1, t['tok']):.0f}% · either {100 * t['either'] / max(1, t['tok']):.0f}%")
    im = (np.clip(np.concatenate(rows, 0), 0, 1) * 255).astype(np.uint8)
    h, w, _ = im.shape
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-i", "-", os.path.join(d, f"novelty_kinds_{name}.png")], input=im.tobytes())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
