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


# ═════════════════════ v2: CHUNKED, WORLD-LOCKED GENERATION ═════════════════════
def room_path(F, fov=60.0, deg=70.0):
    """Start back in the room looking at the pedestal (lots of context), then turn right while
    drifting sideways: new regions enter gradually from the screen edge (~2 deg per frame)."""
    CAM = np.zeros((F, 13))
    for f in range(F):
        u = f / max(1, F - 1)
        pos = np.array([-1.2 + 1.2 * u, 1.5, 2.4 - 0.4 * u])
        a = math.radians(-10 + deg * u)
        fwd = np.array([math.sin(a), -0.12, -math.cos(a)])
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, [0.0, 1.0, 0.0])
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        CAM[f] = [*pos, *fwd, *right, *up, math.tan(math.radians(fov) / 2)]
    return CAM


def scene_truth(CAM, W, H, tex=1.0):
    SPH, BOX, MAT, LGT = T.studio_scene("hard")
    import os
    if os.environ.get("WW_MATTE") == "1":  # all surfaces diffuse: no view-dependent reflections
        MAT = MAT.copy(); MAT[(MAT[:, 3] == T.METAL) | (MAT[:, 3] == T.GLASS), 3] = T.DIFFUSE
    GT = [ww.gt_frame(CAM, f, W, H, SPH, BOX, MAT, LGT, tex) for f in range(len(CAM))]
    return np.array([ww.tonemap(g[0]) for g in GT], np.float32), np.array([g[1] for g in GT], np.float32)


class World:
    """The persistent explicit state (points). Starts from the first view with its exact depth."""
    def __init__(self, CAM, W, H, rgb0, z0):
        self.CAM, self.W, self.H = CAM, W, H
        fin = np.isfinite(z0)
        self.P, self.R, ys, xs = ww.unproject(CAM, 0, W, H, np.where(fin, z0, 1e3), np.ones((H, W), bool))
        self.C = ww.inv_tonemap(rgb0[ys, xs]).astype(np.float32)

    def render(self, f):
        img, zr, cov, _, _ = ww.splat(self.P, self.C, self.R.astype(np.float64), self.CAM, f, self.W, self.H, np.ones(len(self.P)))
        return ww.tonemap(img).astype(np.float32), zr, cov

    def render_q(self, f):
        """render + per-pixel MAGNIFICATION: how many times closer we now are than when the winning
        point was captured (its splat now covers mag x its native ~1 px footprint). mag >> 1 = the
        world holds less detail than the screen shows -> blurry blocks / rubber streaks."""
        img, zr, cov, _, Im = ww.splat(self.P, self.C, self.R.astype(np.float64), self.CAM, f, self.W, self.H, np.ones(len(self.P)))
        fy = self.H / (2 * self.CAM[f, 12])
        mag = np.zeros((self.H, self.W), np.float32)
        mag[cov] = self.R[Im[cov]] * fy / zr[cov] / 0.575
        return ww.tonemap(img).astype(np.float32), zr, cov, mag

    def replace(self, f, z, mask, rgb):
        """REFINE: drop the (magnified) points that currently show in `mask` from view f and write the
        model's sharper pixels there at this view's native density, keeping the known geometry z."""
        _, _, cov, _, Im = ww.splat(self.P, self.C, self.R.astype(np.float64), self.CAM, f, self.W, self.H, np.ones(len(self.P)))
        drop = np.unique(Im[mask & cov]); drop = drop[drop >= 0]
        # the dropped (big) splats also covered pixels OUTSIDE mask: re-write their whole footprint,
        # or whatever was behind them shows through
        foot = cov & np.isin(Im, drop)
        keep = np.ones(len(self.P), bool); keep[drop] = False
        self.P, self.R, self.C = self.P[keep], self.R[keep], self.C[keep]
        n0 = len(self.P)
        self.add(f, z, foot & np.isfinite(z), rgb)
        import os
        self.R[n0:] *= float(os.environ.get("REFINE_R", "1.0"))  # splat overlap of refined points
        return int((~keep).sum())

    def add(self, f, z, mask, rgb):
        Pn, Rn, yn, xn = ww.unproject(self.CAM, f, self.W, self.H, z, mask)
        self.P = np.vstack([self.P, Pn]); self.R = np.concatenate([self.R, Rn])
        self.C = np.vstack([self.C, ww.inv_tonemap(rgb[yn, xn]).astype(np.float32)])


def plane_sweep_conf(frames, CAM, t, nbrs, z_prior, dev="cpu", **kw):
    """plane_sweep + a per-pixel CONFIDENCE: the matched depth must explain the other views clearly
    better than the single-view prior does (photo-consistency margin) — otherwise keep the prior."""
    z_mv = plane_sweep(frames, CAM, t, nbrs, z_prior, dev=dev, **kw)
    def photo_cost(z):
        W, H = frames.shape[2], frames.shape[1]
        I = torch.tensor(frames, device=dev, dtype=torch.float32)
        rt = rays(CAM, t, W, H, dev)
        X = torch.tensor(CAM[t, 0:3], device=dev, dtype=torch.float32) + torch.tensor(z, device=dev, dtype=torch.float32)[..., None] * rt
        cost = torch.zeros((H, W), device=dev); cnt = torch.zeros((H, W), device=dev)
        for n in nbrs:
            grid, zn = project_grid(CAM, n, X, W, H)
            col, valid = sample(I[n], grid)
            valid = valid & (zn > 0.05)
            d = (col - I[t]).abs().mean(-1)
            cost += torch.where(valid, d, torch.zeros_like(d)); cnt += valid.float()
        cost = torch.where(cnt > 0, cost / cnt.clamp(min=1), torch.full_like(cost, 1.0))
        return Fnn.avg_pool2d(cost[None, None], 5, stride=1, padding=2)[0, 0].cpu().numpy()
    c_mv, c_sv = photo_cost(z_mv), photo_cost(np.where(np.isfinite(z_prior), z_prior, 3.0))
    conf = c_mv < 0.8 * c_sv  # triangulation explains the other views >=20% better
    return np.where(conf, z_mv, z_prior), conf


def chunked_world(gen_fn, CAM, W, H, gt_rgb, gt_z, method, depth_model, chunk=9, tau=0.002, dev="cpu", log=print, lift="every", raw_out=None, blend="hard", gate=0.001, refine=0.0, stride=1, depth_fn=None):
    """World-locked generation: chunks of `chunk` frames (overlapping by one). Each chunk is rendered
    from the CURRENT world — so content imagined in earlier chunks is already on screen and moves
    correctly with the camera — then the generator fills only what is still unknown, and every frame
    is lifted into the world before the next chunk is rendered.
    gen_fn(frames[k,H,W,3], masks[k,H,W]) -> filled frames. method: single | multi | hybrid."""
    # depth for lifted pixels: default = mono depth + our scale/shift field; depth_fn(rgb, zr, cov, f, prev)
    # swaps in another method (plane scaffold, depth completion, ...) with everything else identical
    _lift = (lambda rgb, zr_, cov_, f_, st_: depth_fn(rgb, zr_, cov_, f_, st_)) if depth_fn else             (lambda rgb, zr_, cov_, f_, st_: single_view_depth(rgb, zr_, cov_, depth_model, st_))
    F = len(CAM)
    world = World(CAM, W, H, gt_rgb[0], gt_z[0])
    final = np.zeros((F, H, W, 3), np.float32)
    imagined = np.zeros((F, H, W), bool)
    final[0] = gt_rgb[0]
    st = (1.0, 0.0)
    lift_err, conf_frac = [], []
    tok, tok_holes, gen_calls, chunks, ref_frac, replaced = [], [], 0, 0, [], 0
    pre_cov, disp_holes = {}, []
    def refine_mask(cov, mag):
        # regenerate where the world is too coarse for this view (refine=0 -> off)
        if refine <= 0:
            return np.zeros_like(cov)
        return ww.dilate(cov & (mag > refine), 2) & cov
    s = 0
    while s < F - 1:
        # stride > 1 = GENERATE AHEAD, BIG: one generator chunk spans chunk*stride frames of motion, so the
        # new area per call is large (the model draws objects instead of stretching thin edge strips);
        # the frames in between are pure renders of the world.
        idx = list(range(s, F, stride))[:chunk]
        frames, masks = [], []
        for f in idx:
            img, zr, cov, mag = world.render_q(f)
            frames.append(img); masks.append(~cov | refine_mask(cov, mag))
        frames, masks = np.array(frames), np.array(masks)
        chunks += 1
        tok.append(token_novelty(masks))
        ref_frac.append(float(np.mean([m.mean() for m in masks[1:]])))
        if masks[1:].mean() < gate:
            # NOVELTY GATE: nothing new in this chunk -> pure render from the world, no generator call
            for j, f in enumerate(idx):
                if f:
                    final[f] = frames[j]
            s = idx[-1]
            continue
        gen_calls += 1
        if stride > 1 and lift == "last":  # what each in-between view could see BEFORE this chunk
            for f in range(idx[0] + 1, idx[-1] + 1):
                pre_cov[f] = world.render(f)[2]
        gen = gen_fn(frames, masks, idx).astype(np.float32)
        if raw_out is not None:
            raw_out.append(gen.copy())
        base = blend.split("+")[0]
        if base != "hard":
            gen = np.array([harmonize(g, fr, m, mode=base) for g, fr, m in zip(gen, frames, masks)])
        if "feather" in blend:
            # display only: cross-fade from the model's pixels to the world's over the 8 px band the
            # model repainted OUTSIDE the hole (the world itself only ever receives hole pixels)
            gen = np.array([feather(g, fr, m) for g, fr, m in zip(gen, frames, masks)])
        else:
            gen = np.where(masks[..., None], gen, frames)  # keep everything the world already knows
        if lift == "last":
            # KEYFRAME LIFTING (v3): inside the chunk the viewer sees the model's own coherent video;
            # only the chunk's LAST frame is written into the world, in one piece with one depth fit.
            # (v2 lifted every frame's ~10 px sliver with its own depth -> slivers drift apart -> stripes.)
            for j, f in enumerate(idx):
                if f == 0:
                    continue
                final[f] = gen[j]
                imagined[f] |= masks[j]
            f = idx[-1]
            img, zr, cov, mag = world.render_q(f)
            hole = ~cov
            rm = refine_mask(cov, mag)
            if rm.any():
                replaced += world.replace(f, refine_depth(zr, cov, mag), rm, gen[-1])
                img, zr, cov = world.render(f)
                hole = ~cov
            if hole.mean() > tau:
                z1, st = _lift(gen[-1], zr, cov, f, st)
                ok = hole & np.isfinite(gt_z[f])
                if ok.sum():
                    lift_err.append(float(np.median(np.abs(z1[ok] - gt_z[f][ok]) / gt_z[f][ok])))
                world.add(f, z1, hole, gen[-1])
            if stride > 1:
                # earlier generated frames fill what the keyframe could not see (translation parallax)
                for j in range(len(idx) - 2, 0, -1):
                    img, zr, cov = world.render(idx[j])
                    hole = ~cov
                    if hole.mean() > tau:
                        z1, st = _lift(gen[j], zr, cov, idx[j] if lift == 'last' else f, st)
                        world.add(idx[j], z1, hole, gen[j])
                # every frame of the stretch is shown as a render of the world (no generator);
                # tiny leftover holes take the nearest known colour (counted in display_hole_pct)
                from scipy.ndimage import distance_transform_edt
                for f in range(idx[0] + 1, idx[-1] + 1):
                    img, zr, cov = world.render(f)
                    if not cov.all():
                        disp_holes.append(float((~cov).mean()))
                        _, (iy, ix) = distance_transform_edt(~cov, return_indices=True)
                        img = img[iy, ix]
                    final[f] = img
                    imagined[f] |= ~pre_cov[f]
            s = idx[-1]
            continue
        for j, f in enumerate(idx):
            if f == 0:
                continue
            img, zr, cov = world.render(f)
            hole = ~cov
            final[f] = np.where(hole[..., None], gen[j], img)
            imagined[f] |= masks[j]
            if hole.mean() <= tau:
                continue
            z1, st = _lift(gen[j], zr, cov, idx[j] if lift == 'last' else f, st)
            if method == "single":
                z = z1
            else:
                nb = [idx[k] for k in range(len(idx)) if idx[k] != f and abs(idx[k] - f) >= 2][:4] or [idx[k] for k in range(len(idx)) if idx[k] != f]
                gl = np.zeros((F, H, W, 3), np.float32)
                gl[idx] = gen
                if method == "multi":
                    z = plane_sweep(gl, CAM, f, nb, z1, dev=dev)
                else:
                    z, conf = plane_sweep_conf(gl, CAM, f, nb, z1, dev=dev)
                    conf_frac.append(float(conf[hole].mean()))
            ok = hole & np.isfinite(gt_z[f])
            if ok.sum():
                lift_err.append(float(np.median(np.abs(z[ok] - gt_z[f][ok]) / gt_z[f][ok])))
            world.add(f, z, hole, gen[j])
        s = idx[-1]
    # score: does the final world reproduce the frames the user was shown (imagined pixels only)?
    ps = []
    for f in range(1, F):
        img, _, cov = world.render(f)
        m = imagined[f] & cov
        if m.sum() > 50:
            ps.append(10 * math.log10(1 / max(float(np.mean((img[m] - final[f][m]) ** 2)), 1e-10)))
    chunked_world.world = world  # the built persistent state (for export / the phone viewer)
    back, back_holes = walk_back(world, CAM)
    out = {"method": method, "lift": lift, "world_psnr": float(np.mean(ps)), "seam_ratio": seam_score(final[1:], imagined[1:]), **seam_parts(final[1:], imagined[1:]), **colour_glitch(final[1:], imagined[1:], gt_rgb[0]), "walk_back_holes_pct": 100 * back_holes, "median_lift_err": float(np.median(lift_err)) if lift_err else float("nan"),
           "imagined_pct": 100 * float(imagined[1:].mean()),
           "generator_calls": gen_calls, "chunks": chunks, "token_frac_per_chunk": [round(t, 4) for t in tok],
           "token_frac_mean": float(np.mean(tok)) if tok else float("nan"),
           "refine": refine, "regen_pixel_frac": float(np.mean(ref_frac)) if ref_frac else float("nan"), "points_replaced": replaced,
           "points_final": int(len(world.P)),
           "stride": stride, "display_hole_pct": 100 * float(np.sum(disp_holes)) / max(1, F - 1), "trusted_triangulation_pct": 100 * float(np.mean(conf_frac)) if conf_frac else None}
    log(f"  {method:6s}/{lift:5s}: world reproduces shown frames {out['world_psnr']:.2f} dB · seam ratio {out['seam_ratio']:.2f} · walk-back holes {out['walk_back_holes_pct']:.2f}% · lift depth err {out['median_lift_err']:.3f}"
        + (f" · triangulation trusted on {out['trusted_triangulation_pct']:.0f}% of new px" if conf_frac else ""))
    return out, final, back


def refine_depth(zr, cov, mag):
    """Depth for refined pixels. The z-buffer of magnified square splats is a STAIRCASE (one flat depth
    per big splat); writing sharp colour onto it puts points at the wrong depth. REFINE_Z: raw | median
    (edge-preserving, window ~ splat size) | gauss (normalised Gaussian in disparity)."""
    import os
    mode = os.environ.get("REFINE_Z", "median")
    if mode == "raw":
        return zr
    from scipy.ndimage import median_filter, gaussian_filter
    disp = np.where(cov, 1.0 / np.maximum(zr, 1e-6), 0.0).astype(np.float32)
    k = int(np.clip(np.percentile(mag[cov], 90) * 2 + 1, 3, 15)) if cov.any() else 5
    if mode == "median":
        d = median_filter(disp, size=k)
    else:
        w = gaussian_filter(cov.astype(np.float32), k / 3)
        d = gaussian_filter(disp, k / 3) / np.maximum(w, 1e-4)
    return np.where(cov & (d > 1e-6), 1.0 / np.maximum(d, 1e-6), zr).astype(np.float32)


def plane_grow_depth(rgb, zr, cov, CAM, f, z_fallback, thr=0.03, col_tol=0.07, max_iter=600, k_max=8, use_normals=True, normal_tol=0.85):
    """OURS — structure-first depth for imagined pixels ("colour-guided plane growing").
    1. fit the planes (walls/floor/tables) of the KNOWN geometry visible in this view
    2. label known pixels by plane; grow labels into the hole, pixel by pixel, only where the generated
       colour continues smoothly from the neighbour (a wall keeps going while the paint looks like that wall)
    3. claimed hole pixels get EXACT depth from ray-plane intersection; unclaimed ones keep z_fallback.
    Returns (z, fraction of hole pixels claimed)."""
    H, W = zr.shape
    hole = ~cov
    if hole.mean() < 1e-4 or cov.sum() < 800:
        return z_fallback, 0.0
    P, _, ys, xs = ww.unproject(CAM, f, W, H, np.where(cov, zr, 1.0), cov)
    sub = np.random.default_rng(0).choice(len(P), min(len(P), 20000), replace=False)
    planes = ww.fit_planes(P[sub], k_max=k_max, iters=500, thr=thr)
    if not planes:
        return z_fallback, 0.0
    th = CAM[f, 12]; asp = W / H
    u = ((np.arange(W) + 0.5) / W * 2 - 1)[None, :] * th * asp
    v = (1 - (np.arange(H) + 0.5) / H * 2)[:, None] * th
    pos, fwd, right, up = CAM[f, 0:3], CAM[f, 3:6], CAM[f, 6:9], CAM[f, 9:12]
    zp = []
    for (n, c) in planes:
        den = n @ fwd + u * (n @ right) + v * (n @ up)
        z = (c - n @ pos) / np.where(np.abs(den) < 1e-6, 1e-6, den)
        zp.append(np.where(z > 0.05, z, np.inf))
    zp = np.array(zp)  # [K,H,W]
    # surface ORIENTATION of every pixel from the fallback (mono) depth: its scale is unreliable in big holes,
    # its orientation much less so -> a plane may only grow into pixels that face the same way
    Pm, _, yy, xx = ww.unproject(CAM, f, W, H, np.where(np.isfinite(z_fallback), z_fallback, 1e3), np.ones((H, W), bool))
    Pm = Pm.reshape(H, W, 3)
    dx_ = np.roll(Pm, -1, 1) - np.roll(Pm, 1, 1); dy_ = np.roll(Pm, -1, 0) - np.roll(Pm, 1, 0)
    nrm = np.cross(dx_, dy_); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True) + 1e-9
    pn = np.array([n for n, _ in planes])
    face = np.abs(np.einsum("hwc,kc->khw", nrm, pn)) > normal_tol  # [K,H,W]: pixel faces like plane k
    lab = np.full((H, W), -1, int)
    rel = np.abs(zp - zr[None]) / np.maximum(zr[None], 1e-6)
    best = np.argmin(np.where(np.isfinite(rel), rel, 9), 0)
    ok = cov & (np.take_along_axis(rel, best[None], 0)[0] < 0.03)
    lab[ok] = best[ok]
    # grow into the hole along colour continuity (4-neighbour, vectorised wavefront)
    grow = hole.copy()
    for _ in range(max_iter):
        changed = False
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src = np.roll(lab, (dy, dx), (0, 1))
            srgb = np.roll(rgb, (dy, dx), (0, 1))
            cand = grow & (lab < 0) & (src >= 0) & (np.abs(rgb - srgb).max(-1) < col_tol)
            if use_normals:
                cand &= np.take_along_axis(face, np.maximum(src, 0)[None], 0)[0]
            if dy == 1: cand[0, :] = False
            if dy == -1: cand[-1, :] = False
            if dx == 1: cand[:, 0] = False
            if dx == -1: cand[:, -1] = False
            if cand.any():
                lab[cand] = src[cand]; changed = True
        if not changed:
            break
    claim = hole & (lab >= 0)
    z = z_fallback.copy()
    if claim.any():
        zz = np.take_along_axis(zp, np.maximum(lab, 0)[None], 0)[0]
        good = claim & np.isfinite(zz) & (zz < 50)
        z[good] = zz[good]
        claim = good
    return z, float(claim.sum() / max(1, hole.sum()))


def colour_glitch(final, imagined, ref):
    """How 'AI-glitchy' the imagined pixels look, measured against the real photo (ref):
    oversat = share of imagined pixels more saturated than the photo's 99.5th percentile chroma
              (the neon cyan/green/blue blotches), hue_noise = mean local hue jitter where colour is
              strong (rainbow fringes). Lower = cleaner; a real photo scores ~0.005 / its own jitter."""
    def chroma(x):
        return x.max(-1) - x.min(-1)
    thr = float(np.quantile(chroma(ref), 0.995)) * 1.05
    over, noise = [], []
    for img, m in zip(final, imagined):
        if m.mean() < 0.002:
            continue
        c = chroma(img)
        over.append(float((c[m] > thr).mean()))
        r, g, b = img[..., 0], img[..., 1], img[..., 2]
        hue = np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)
        z = np.exp(1j * hue)
        from scipy.ndimage import uniform_filter
        R = np.abs(uniform_filter(z.real, 3) + 1j * uniform_filter(z.imag, 3))  # 1 = uniform hue, 0 = chaotic
        strong = m & (c > 0.12)
        if strong.sum() > 50:
            noise.append(float((1 - R)[strong].mean()))
    return {"oversat_pct": 100 * float(np.mean(over)) if over else float("nan"),
            "hue_noise": float(np.mean(noise)) if noise else float("nan")}


def token_novelty(masks, sp=16, tf=4, halo=1):
    """Fraction of the video model's tokens that touch new content in this chunk. Wan2.1: VAE 8x
    spatial + 2x2 patches = one token per 16x16 px; 4x temporal (first frame alone) -> latent frames
    = 1 + (k-1)/4. A token is 'novel' if any pixel of its block in any of its frames is a hole, grown
    by `halo` tokens of context. Token pruning (DreamStereo-style) costs ~ this fraction of full."""
    k, H, W = masks.shape
    groups = [[0]] + [list(range(i, min(i + tf, k))) for i in range(1, k, tf)]
    gh, gw = H // sp, W // sp
    out = []
    for g in groups:
        m = masks[g].any(0)[: gh * sp, : gw * sp].reshape(gh, sp, gw, sp).any((1, 3))
        out.append(ww.dilate(m, halo) if halo else m)
    return float(np.mean(out))


def feather(gen, known, hole, band=8):
    from scipy.ndimage import distance_transform_edt
    d = distance_transform_edt(~hole)  # 0 inside the hole, px distance outside
    a = np.clip(1.0 - (d - 0.5) / band, 0.0, 1.0)
    a[hole] = 1.0
    return (a[..., None] * gen + (1 - a[..., None]) * known).astype(np.float32)


def seam_parts(final, imagined, r=5, sigma=3.0):
    """Split a visible seam into its causes, on rings r px either side of the join:
    colour_step = local-mean colour jump across the join / typical known-side gradient (colour/brightness);
    sharpness   = gradient energy just inside the imagined side / just outside (1.0 = equally sharp,
                  < 1 = the imagined side is blurrier)."""
    from scipy.ndimage import gaussian_filter
    cs, sh = [], []
    for img, m in zip(final, imagined):
        if m.mean() < 0.002 or m.mean() > 0.98:
            continue
        g = img.mean(-1)
        rin = m & ww.dilate(~m, r)
        rout = ~m & ww.dilate(m, r)
        if rin.sum() < 50 or rout.sum() < 50:
            continue
        def lmean(w):
            return gaussian_filter(g * w, sigma) / np.maximum(gaussian_filter(w.astype(np.float32), sigma), 1e-4)
        mi, mo = lmean(rin.astype(np.float32)), lmean(rout.astype(np.float32))
        edge = ww.dilate(m, 1) & ww.dilate(~m, 1)
        gy, gx = np.gradient(g)
        gm = np.hypot(gx, gy)
        typ = gm[rout].mean()
        cs.append(float(np.abs(mi - mo)[edge].mean() / max(typ, 1e-4)))
        sh.append(float(gm[rin & ~edge].mean() / max(gm[rout & ~edge].mean(), 1e-4)))
    return {"seam_colour_step": float(np.mean(cs)) if cs else float("nan"), "seam_sharpness_in_vs_out": float(np.mean(sh)) if sh else float("nan")}


def harmonize(gen, known, hole, band=8, sigma=3.0, mode="field"):
    """Seam fix (v4). The video model re-paints the whole frame, and its colours drift a little from
    the world's render (VAE / lighting drift). Hard-pasting its hole pixels next to rendered pixels
    then leaves a visible step at the join (v3 seam ratio 9.2). Fix, measured on a band just OUTSIDE
    the hole where we have BOTH the model's version and the world's version of the same pixels:
      'affine': one per-channel gain+offset for the whole hole;
      'field' : affine + a smooth residual field (normalised Gaussian convolution of the band error,
                like seamless cloning) that is exact at the join and fades away from it."""
    if hole.mean() < 1e-4 or hole.all():
        return gen
    import os
    sigma = float(os.environ.get("HARM_SIGMA", sigma)); band = int(os.environ.get("HARM_BAND", band))
    from scipy.ndimage import gaussian_filter, distance_transform_edt
    B = ww.dilate(hole, band) & ~hole
    if B.sum() < 50:
        return gen
    out = gen.copy()
    for c in range(3):
        g, k = gen[..., c][B], known[..., c][B]
        if mode in ("offset", "field_off"):
            a = 1.0  # a thin, nearly flat band cannot pin down a gain -> offset only (no colour cast)
        else:
            # ridge toward gain 1: a gain is only trusted when the band has real contrast
            gm, km = g.mean(), k.mean(); vg = float(((g - gm) ** 2).sum()); lam = 0.02 * len(g)
            a = float(np.clip((float(((g - gm) * (k - km)).sum()) + lam) / (vg + lam), 0.8, 1.25))
        b = float(np.clip(k.mean() - a * g.mean(), -0.2, 0.2))
        out[..., c] = a * gen[..., c] + b
    if mode in ("field", "field_off"):
        r = np.where(B[..., None], known - out, 0.0)
        wsum = gaussian_filter(B.astype(np.float32), sigma)
        fill = np.stack([gaussian_filter(r[..., c], sigma) for c in range(3)], -1) / np.maximum(wsum, 1e-3)[..., None]
        d = distance_transform_edt(hole)  # px into the hole from the join
        fade = np.exp(-d / (3 * sigma))[..., None]
        out = np.where(hole[..., None], out + fade * np.clip(fill, -0.3, 0.3), out)
    return np.clip(out, 0, 1).astype(np.float32)


def oracle_gen(gt_rgb):
    return lambda frames, masks, idx: gt_rgb[idx]


def sticker_gen(gt_rgb):
    """Adversarial stand-in for what VACE did: whatever the FIRST frame of the chunk shows in the hole
    is pasted at the same screen position in every frame of the chunk (screen-locked content)."""
    def g(frames, masks, idx):
        first = gt_rgb[idx[0]]
        return np.repeat(first[None], len(idx), 0)
    return g


def seam_score(final, imagined):
    """How visible is the join between imagined and already-known pixels? Ratio of the colour jump
    ACROSS the boundary to the typical jump between neighbouring pixels nearby (1.0 = invisible seam,
    larger = visible edge). Averaged over frames that contain imagined pixels."""
    out = []
    for img, m in zip(final, imagined):
        if m.mean() < 0.002 or m.mean() > 0.98:
            continue
        g = img.mean(-1)
        dx = np.abs(np.diff(g, axis=1)); mx = m[:, 1:] != m[:, :-1]
        dy = np.abs(np.diff(g, axis=0)); my = m[1:, :] != m[:-1, :]
        across = np.concatenate([dx[mx], dy[my]])
        near = ww.dilate(m, 4) & ~m  # the known side, within 4 px of the join
        typical = np.concatenate([dx[near[:, 1:] & ~mx], dy[near[1:, :] & ~my]])
        if len(across) > 20 and len(typical) > 20:
            out.append(float(np.mean(across) / max(np.mean(typical), 1e-4)))
    return float(np.mean(out)) if out else float("nan")


def walk_back(world, CAM):
    """Revisit: render the built world along the reverse path. No generation: holes left = what a
    returning user would still be missing; the frames are the 'never forgets' demo."""
    frames, holes = [], []
    for f in range(len(CAM) - 1, -1, -1):
        img, _, cov = world.render(f)
        frames.append(img); holes.append(float((~cov).mean()))
    return np.array(frames), float(np.mean(holes))


def export_world(world, CAM, path, frames=None):
    """Write the persistent world for the phone viewer: <path>.bin = N x (xyz float32, radius float32,
    rgb uint8 + pad) and <path>.json = point count + camera path (+ optional shown-frame count)."""
    import json as _json
    C = np.clip(ww.tonemap(world.C), 0, 1)
    n = len(world.P)
    rec = np.zeros(n, dtype=[("p", "<f4", 3), ("r", "<f4"), ("c", "u1", 4)])
    rec["p"] = world.P.astype(np.float32); rec["r"] = world.R.astype(np.float32)
    rec["c"][:, :3] = (C * 255).astype(np.uint8); rec["c"][:, 3] = 255
    rec.tofile(path + ".bin")
    _json.dump({"points": int(n), "stride": 20, "cam": np.asarray(CAM, float).round(5).tolist(), "W": world.W, "H": world.H},
               open(path + ".json", "w"))
    return n
