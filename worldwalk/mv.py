"""
MULTI-VIEW LIFTING — the GPU kill-test, written so every non-GPU part runs (and is tested) on CPU.

  1. build_inputs : render the persistent state along a turning camera path; never-seen regions are
                    holes (mask). Also keeps ground truth (rgb, depth) for reference.
  2. (GPU) a video inpainting model (Wan2.1-VACE-1.3B) fills the holes as ONE clip, so the same
     imagined content is drawn from several viewpoints.
  3. depth for the imagined content, two ways:
       single : Depth Anything on each frame + our scale-field calibration (the CPU baseline)
       multi  : plane-sweep TRIANGULATION across neighbouring generated frames (known cameras),
                photo-consistency cost + a weak prior towards the single-view depth
  4. score: does the lifted geometry reproduce the generator's OWN other views? Warp frame t's
     imagined pixels into held-out frames t+-e (not used by the sweep) and measure colour error.
     Lower = the 3D placement agrees with what the model actually drew. Also: error vs true depth.
"""
import math
import os
import sys

import numpy as np
import torch
import torch.nn.functional as Fnn

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "shotc"))
import tracer as T  # noqa: E402
import ww  # noqa: E402


def turn_path(F, fov=60.0, deg=50.0):
    """Stand still-ish and turn (the case that drifted in ww.py), slight forward drift for parallax."""
    CAM = np.zeros((F, 13))
    for f in range(F):
        u = f / max(1, F - 1)
        pos = np.array([-1.6 + 0.9 * u, 1.55, 2.0 - 0.5 * u])
        a = math.radians(-45 + deg * u)
        fwd = np.array([math.sin(a), -0.1, -math.cos(a)])
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, [0.0, 1.0, 0.0])
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        CAM[f] = [*pos, *fwd, *right, *up, math.tan(math.radians(fov) / 2)]
    return CAM


def build_inputs(F=33, W=320, H=320, tex=1.0):
    SPH, BOX, MAT, LGT = T.studio_scene("hard")
    CAM = turn_path(F)
    GT = [ww.gt_frame(CAM, f, W, H, SPH, BOX, MAT, LGT, tex) for f in range(F)]
    rgb0, z0 = GT[0]
    fin = np.isfinite(z0)
    P, R, ys, xs = ww.unproject(CAM, 0, W, H, np.where(fin, z0, 1e3), np.ones((H, W), bool))
    C = rgb0[ys, xs]
    frames, masks, zrs = [], [], []
    for f in range(F):
        img, zr, cov, _, _ = ww.splat(P, C, R.astype(np.float64), CAM, f, W, H, np.ones(len(P)))
        frames.append(ww.tonemap(img))
        masks.append(~cov)
        zrs.append(zr)
    return {"CAM": CAM, "W": W, "H": H, "frames": np.array(frames, np.float32), "masks": np.array(masks),
            "zr": np.array(zrs, np.float32), "gt_rgb": np.array([ww.tonemap(g[0]) for g in GT], np.float32),
            "gt_z": np.array([g[1] for g in GT], np.float32)}


# ───────────────────────── geometry in torch (GPU if available) ─────────────────────────
def rays(CAM, f, W, H, dev):
    th = float(CAM[f, 12])
    asp = W / H
    ys, xs = torch.meshgrid(torch.arange(H, device=dev), torch.arange(W, device=dev), indexing="ij")
    u = ((xs + 0.5) / W * 2 - 1) * th * asp
    v = (1 - (ys + 0.5) / H * 2) * th
    c = torch.tensor(CAM[f], device=dev, dtype=torch.float32)
    return c[3:6] + u[..., None] * c[6:9] + v[..., None] * c[9:12]  # H W 3, unit forward component


def project_grid(CAM, n, X, W, H):
    """World points X (..., 3) -> normalised grid coords for grid_sample in frame n, and depth."""
    c = torch.tensor(CAM[n], device=X.device, dtype=torch.float32)
    v = X - c[0:3]
    z = (v * c[3:6]).sum(-1)
    th = float(CAM[n, 12])
    asp = W / H
    u = (v * c[6:9]).sum(-1) / (z * th * asp)
    vv = (v * c[9:12]).sum(-1) / (z * th)
    gx = u  # grid_sample x in [-1, 1]
    gy = -vv
    return torch.stack([gx, gy], -1), z


def sample(img, grid):
    """img H W 3 (torch), grid ... 2 -> ... 3, plus validity."""
    g = grid.reshape(1, -1, 1, 2)
    out = Fnn.grid_sample(img.permute(2, 0, 1)[None], g, mode="bilinear", padding_mode="border", align_corners=False)
    valid = (grid[..., 0].abs() <= 1) & (grid[..., 1].abs() <= 1)
    return out[0, :, :, 0].T.reshape(*grid.shape[:-1], 3), valid


def plane_sweep(frames, CAM, t, nbrs, z_prior, D=64, span=0.45, lam=0.02, win=5, dev="cpu"):
    """Depth for every pixel of frame t by photo-consistency against frames `nbrs` (known cameras).
    Hypotheses are relative to the single-view prior (z_prior * e^[-span, span]): ~1.4% steps instead
    of ~11% for a global sweep, then a parabola through the best 3 costs gives sub-step depth.
    The result is ABSOLUTE (fixed by the known camera baselines), so it cannot drift."""
    W, H = frames.shape[2], frames.shape[1]
    I = torch.tensor(frames, device=dev, dtype=torch.float32)
    rt = rays(CAM, t, W, H, dev)
    o = torch.tensor(CAM[t, 0:3], device=dev, dtype=torch.float32)
    zp = torch.tensor(np.where(np.isfinite(z_prior), z_prior, 3.0), device=dev, dtype=torch.float32)
    offs = torch.linspace(-span, span, D, device=dev)
    costs = torch.empty((D, H, W), device=dev)
    for i, a in enumerate(offs):
        z = zp * torch.exp(a)
        X = o + z[..., None] * rt
        cost = torch.zeros((H, W), device=dev)
        cnt = torch.zeros((H, W), device=dev)
        for n in nbrs:
            grid, zn = project_grid(CAM, n, X, W, H)
            col, valid = sample(I[n], grid)
            valid = valid & (zn > 0.05)
            d = (col - I[t]).abs().mean(-1)
            cost += torch.where(valid, d, torch.zeros_like(d))
            cnt += valid.float()
        cost = torch.where(cnt > 0, cost / cnt.clamp(min=1), torch.full_like(cost, 1.0))
        cost = Fnn.avg_pool2d(cost[None, None], win, stride=1, padding=win // 2)[0, 0]
        costs[i] = cost + lam * a.abs()
    k = costs.argmin(0)
    kc = k.clamp(1, D - 2)
    c0 = costs.gather(0, (kc - 1)[None])[0]
    c1 = costs.gather(0, kc[None])[0]
    c2 = costs.gather(0, (kc + 1)[None])[0]
    den = c0 - 2 * c1 + c2
    sub = torch.where(den > 1e-9, 0.5 * (c0 - c2) / den, torch.zeros_like(den)).clamp(-0.5, 0.5)
    step = offs[1] - offs[0]
    a_best = offs[kc] + sub * step
    a_best = torch.where((k == 0) | (k == D - 1), offs[k], a_best)
    return (zp * torch.exp(a_best)).cpu().numpy()


def reproj_error(frames, CAM, t, z, mask, evals, dev="cpu"):
    """Mean colour error when frame t's MASKED (imagined) pixels are carried to held-out frames by depth z."""
    W, H = frames.shape[2], frames.shape[1]
    I = torch.tensor(frames, device=dev, dtype=torch.float32)
    rt = rays(CAM, t, W, H, dev)
    X = torch.tensor(CAM[t, 0:3], device=dev, dtype=torch.float32) + torch.tensor(z, device=dev, dtype=torch.float32)[..., None] * rt
    m = torch.tensor(mask, device=dev)
    errs = []
    for e in evals:
        grid, ze = project_grid(CAM, e, X, W, H)
        col, valid = sample(I[e], grid)
        ok = valid & m & (ze > 0.05)
        if ok.sum() > 50:
            errs.append(float((col - I[t]).abs().mean(-1)[ok].mean()))
    return float(np.mean(errs)) if errs else float("nan")


def single_view_depth(frame_rgb, zr, cov, depth_model, prev=(1.0, 0.0)):
    dm = depth_model(frame_rgb)
    disp_r = np.where(cov, 1.0 / np.maximum(zr, 1e-6), 0.0)
    d, st = ww.scalefield_fit(dm, disp_r, cov, cov.astype(np.float32), prev)
    return 1.0 / np.maximum(d, 1e-4), st


def evaluate(gen, inp, depth_model, ts=None, k_sweep=(2,), k_eval=(4,), dev="cpu", log=print):
    """gen: generated video (F H W 3, 0..1). Compare single-view vs multi-view lifting on imagined pixels."""
    F = gen.shape[0]
    CAM, masks, zr, gtz = inp["CAM"], inp["masks"], inp["zr"], inp["gt_z"]
    ts = ts or [t for t in range(max(k_eval), F - max(k_eval), 3)]
    rows = []
    st = (1.0, 0.0)
    for t in ts:
        m = masks[t]
        if m.mean() < 0.005:
            continue
        cov = ~m
        z_single, st = single_view_depth(gen[t], zr[t], cov, depth_model, st)
        nb = [t + s * k for k in k_sweep for s in (-1, 1) if 0 <= t + s * k < F]
        ev = [t + s * k for k in k_eval for s in (-1, 1) if 0 <= t + s * k < F]
        z_multi = plane_sweep(gen, CAM, t, nb, z_single, dev=dev)
        ok = m & np.isfinite(gtz[t])
        r = {"t": t, "hole_pct": 100 * float(m.mean()),
             "reproj_single": reproj_error(gen, CAM, t, z_single, m, ev, dev), "reproj_multi": reproj_error(gen, CAM, t, z_multi, m, ev, dev),
             "gt_err_single": float(np.median(np.abs(z_single[ok] - gtz[t][ok]) / gtz[t][ok])),
             "gt_err_multi": float(np.median(np.abs(z_multi[ok] - gtz[t][ok]) / gtz[t][ok]))}
        rows.append(r)
        log(f"  t={t:2d} hole {r['hole_pct']:4.1f}%  held-out reprojection error  single {r['reproj_single']:.4f}  multi {r['reproj_multi']:.4f}   "
            f"|  depth err vs truth  single {r['gt_err_single']:.3f}  multi {r['gt_err_multi']:.3f}")
    agg = {k: float(np.nanmean([r[k] for r in rows])) for k in rows[0] if k != "t"} if rows else {}
    return rows, agg


def chained_lift(gen, inp, method, depth_model, k_sweep=(2, 4), tau=0.002, dev="cpu", log=print):
    """Lift the generated clip frame after frame into ONE growing world (start: exact first view).
    method: 'single' (mono + scale field vs the current world) or 'multi' (plane sweep across the
    generated clip, prior = single). Scores the FINAL world: render it at every frame and compare with
    the generated frames (PSNR on pixels that were imagined), plus point depth error vs truth."""
    CAM, W, H = inp["CAM"], inp["W"], inp["H"]
    F = gen.shape[0]
    gtz = inp["gt_z"]
    z0 = gtz[0]
    fin = np.isfinite(z0)
    P, R, ys, xs = ww.unproject(CAM, 0, W, H, np.where(fin, z0, 1e3), np.ones((H, W), bool))
    C = ww.inv_tonemap(gen[0][ys, xs]).astype(np.float32)
    lift_err = []
    st = (1.0, 0.0)
    for t in range(1, F):
        img, zr, cov, _, _ = ww.splat(P, C, R.astype(np.float64), CAM, t, W, H, np.ones(len(P)))
        hole = ~cov
        if hole.mean() <= tau:
            continue
        z_single, st = single_view_depth(gen[t], zr, cov, depth_model, st)
        if method == "multi":
            nb = [t + s_ * k for k in k_sweep for s_ in (-1, 1) if 0 <= t + s_ * k < F]
            z = plane_sweep(gen, CAM, t, nb, z_single, dev=dev)
        else:
            z = z_single
        ok = hole & np.isfinite(gtz[t])
        if ok.sum():
            lift_err.append(float(np.median(np.abs(z[ok] - gtz[t][ok]) / gtz[t][ok])))
        Pn, Rn, yn, xn = ww.unproject(CAM, t, W, H, z, hole)
        P = np.vstack([P, Pn]); R = np.concatenate([R, Rn])
        C = np.vstack([C, ww.inv_tonemap(gen[t][yn, xn]).astype(np.float32)])
    # score the final world against every generated frame, on originally-imagined pixels
    ps = []
    for t in range(F):
        img, _, cov, _, _ = ww.splat(P, C, R.astype(np.float64), CAM, t, W, H, np.ones(len(P)))
        m = inp["masks"][t] & cov
        if m.sum() > 50:
            mse = float(np.mean((ww.tonemap(img)[m] - gen[t][m]) ** 2))
            ps.append(10 * math.log10(1 / max(mse, 1e-10)))
    out = {"method": method, "psnr_imagined": float(np.mean(ps)), "median_lift_err": float(np.median(lift_err)) if lift_err else float("nan"), "points": int(len(P))}
    log(f"  {method:6s}: final-world PSNR on imagined pixels {out['psnr_imagined']:.2f} dB   median depth error of lifts {out['median_lift_err']:.3f}")
    return out
