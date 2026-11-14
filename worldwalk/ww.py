"""
worldwalk v0 — a NOVELTY-PROPORTIONAL world model loop, measured on a scene with exact ground truth.

  state  : persistent coloured 3D points (never forgotten)
  frame  : RENDERED from state by default (cheap, exact)
  novelty: holes the state cannot explain (coverage == 0), measured in pixels and 16 px tokens
  generate ONLY on novelty events (hole tokens > tau): LaMa (Apache-2.0, ONNX, CPU) inpaints
  lift   : new pixels -> 3D with monocular depth (Depth Anything V2 Small) aligned to the state by
             global  — least-squares scale/shift in disparity on all covered pixels (standard)
             band    — the same fit restricted to a seam band around the hole
             poisson — OURS: gradient-domain solve; inside the hole keep the mono-depth gradients,
                       on the hole boundary match the rendered state exactly (Dirichlet). Closed form,
                       one sparse solve, no network, no optimisation loop.
Ground truth comes from the shotc ray tracer (exact depth for every pixel), so seam/lift errors are
measured, not eyeballed. Modes: --gen oracle (generator = ground-truth pixels: isolates lifting error)
or --gen lama (a real generative inpainter: the full system).
"""
import argparse
import json
import math
import os
import sys
import time

import numba as nb
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "shotc"))
import tracer as T  # noqa: E402


# ───────────────────────── ground-truth world (deterministic shading) ─────────────────────────
@nb.njit(parallel=True, cache=True)
def gt_frame(CAM, f, W, H, SPH, BOX, MAT, LGT):
    """Exact geometry + low-noise shading: albedo * (ambient + 32-sample soft direct), one mirror
    bounce for metal/glass. Returns rgb (linear), z-depth along the camera axis."""
    img = np.zeros((H, W, 3), np.float32)
    Z = np.full((H, W), np.inf, np.float32)
    for y in nb.prange(H):
        for x in range(W):
            ox, oy, oz, dx, dy, dz = T.cam_ray(CAM, f, x + 0.5, y + 0.5, W, H)
            t, m, nx, ny, nz = T.hit_scene(ox, oy, oz, dx, dy, dz, T.INF, SPH, BOX)
            if m < 0:
                continue
            Z[y, x] = t * (dx * CAM[f, 3] + dy * CAM[f, 4] + dz * CAM[f, 5])
            tr, tg, tb = 1.0, 1.0, 1.0
            px, py, pz = ox + t * dx, oy + t * dy, oz + t * dz
            for b in range(3):
                typ = int(MAT[m, 3])
                if typ == T.LIGHT:
                    img[y, x, 0], img[y, x, 1], img[y, x, 2] = tr * 1.0, tg * 1.0, tb * 0.95
                    break
                if typ == T.DIFFUSE:
                    s = T.seed(y, x, 77)
                    er = eg = eb = 0.0
                    for k in range(32):
                        a, g_, c, s = T.direct(px, py, pz, nx, ny, nz, s, SPH, BOX, MAT, LGT)
                        er += a
                        eg += g_
                        eb += c
                    amb = 0.18
                    img[y, x, 0] = tr * MAT[m, 0] * (amb + er / 32 * 0.04)
                    img[y, x, 1] = tg * MAT[m, 1] * (amb + eg / 32 * 0.04)
                    img[y, x, 2] = tb * MAT[m, 2] * (amb + eb / 32 * 0.04)
                    break
                # mirror bounce (metal / glass treated as reflective for the GT look)
                dn = dx * nx + dy * ny + dz * nz
                dx, dy, dz = dx - 2 * dn * nx, dy - 2 * dn * ny, dz - 2 * dn * nz
                tr, tg, tb = tr * MAT[m, 0], tg * MAT[m, 1], tb * MAT[m, 2]
                t, m, nx, ny, nz = T.hit_scene(px + nx * 1e-4, py + ny * 1e-4, pz + nz * 1e-4, dx, dy, dz, T.INF, SPH, BOX)
                if m < 0:
                    break
                px, py, pz = px + t * dx, py + t * dy, pz + t * dz
    return img, Z


def walk_loop(F, fov=60.0):
    """Explore forward while turning, then come back the same way (a revisit)."""
    half = F // 2
    CAM = np.zeros((F, 13))
    for f in range(F):
        u = f / max(1, half - 1) if f < half else (F - 1 - f) / max(1, half - 1)
        pos = np.array([-1.9 + 3.2 * u, 1.55, 2.3 - 2.9 * u])
        a = math.radians(-50 + 140 * u)
        fwd = np.array([math.sin(a), -0.12, -math.cos(a)])
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, [0.0, 1.0, 0.0])
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        CAM[f] = [*pos, *fwd, *right, *up, math.tan(math.radians(fov) / 2)]
    return CAM


# ───────────────────────── the state: points, splat-rendered ─────────────────────────
@nb.njit(cache=True)
def splat(P, C, R, CAM, f, W, H, Q):
    """Z-buffered square splats. Returns rgb, z, coverage (0/1)."""
    img = np.zeros((H, W, 3), np.float32)
    Z = np.full((H, W), np.inf, np.float32)
    Qm = np.zeros((H, W), np.float32)
    Im = np.full((H, W), -1, np.int64)
    asp = W / H
    th = CAM[f, 12]
    fy = H / (2 * th)
    for i in range(P.shape[0]):
        vx, vy, vz = P[i, 0] - CAM[f, 0], P[i, 1] - CAM[f, 1], P[i, 2] - CAM[f, 2]
        z = vx * CAM[f, 3] + vy * CAM[f, 4] + vz * CAM[f, 5]
        if z <= 0.05:
            continue
        u = (vx * CAM[f, 6] + vy * CAM[f, 7] + vz * CAM[f, 8]) / (z * th * asp)
        v = (vx * CAM[f, 9] + vy * CAM[f, 10] + vz * CAM[f, 11]) / (z * th)
        cx = (u + 1.0) * 0.5 * W
        cy = (1.0 - v) * 0.5 * H
        r = max(0.5, R[i] * fy / z)  # pixel radius of a world-size-R splat
        x0, x1 = int(cx - r), int(cx + r)
        y0, y1 = int(cy - r), int(cy + r)
        for yy in range(max(0, y0), min(H - 1, y1) + 1):
            for xx in range(max(0, x0), min(W - 1, x1) + 1):
                if z < Z[yy, xx]:
                    Z[yy, xx] = z
                    Qm[yy, xx] = Q[i]
                    Im[yy, xx] = i
                    img[yy, xx, 0], img[yy, xx, 1], img[yy, xx, 2] = C[i, 0], C[i, 1], C[i, 2]
    cov = np.isfinite(Z)
    return img, Z, cov, Qm, Im


def unproject(CAM, f, W, H, zmap, mask):
    ys, xs = np.nonzero(mask)
    z = zmap[ys, xs].astype(np.float64)
    th = CAM[f, 12]
    asp = W / H
    u = ((xs + 0.5) / W * 2 - 1) * th * asp
    v = (1 - (ys + 0.5) / H * 2) * th
    pos, fwd, right, up = CAM[f, 0:3], CAM[f, 3:6], CAM[f, 6:9], CAM[f, 9:12]
    P = pos[None] + z[:, None] * (fwd[None] + u[:, None] * right[None] + v[:, None] * up[None])
    R = z * th / H * 1.15  # world size of one pixel at that depth (+15% overlap)
    return P, R, ys, xs


# ───────────────────────── generator + depth (real networks, CPU) ─────────────────────────
class Lama:
    def __init__(self):
        import onnxruntime as ort
        self.s = ort.InferenceSession(os.path.join(HERE, "models", "lama_fp32.onnx"), providers=["CPUExecutionProvider"])

    def __call__(self, rgb01, mask):
        H, W = mask.shape
        im = np.asarray(Image.fromarray((rgb01 * 255).astype(np.uint8)).resize((512, 512), Image.BICUBIC), np.float32) / 255
        mk = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((512, 512), Image.NEAREST), np.float32) / 255
        out = self.s.run(None, {"image": im.transpose(2, 0, 1)[None], "mask": (mk > 0.5).astype(np.float32)[None, None]})[0][0]
        out = out.transpose(1, 2, 0)
        out = out / 255.0 if out.max() > 2 else out
        return np.asarray(Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255


class MonoDepth:
    def __init__(self):
        from transformers import pipeline
        self.p = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf", device="cpu")

    def __call__(self, rgb01):
        H, W = rgb01.shape[:2]
        out = self.p(Image.fromarray((rgb01 * 255).astype(np.uint8)))
        d = np.asarray(out["predicted_depth"], np.float32)
        d = np.asarray(Image.fromarray(d).resize((W, H), Image.BILINEAR), np.float32)
        return d  # relative inverse depth (disparity-like), affine-ambiguous


def tonemap(x):
    x = np.maximum(x, 0)
    return (x / (1 + x)) ** (1 / 2.2)


def inv_tonemap(y):
    y = np.clip(y, 0, 0.999) ** 2.2
    return y / (1 - y)


# ───────────────────────── lifting: three ways to give new pixels a depth ─────────────────────────
def dilate(m, k):
    out = m.copy()
    for _ in range(k):
        o = out.copy()
        o[1:] |= out[:-1]; o[:-1] |= out[1:]; o[:, 1:] |= out[:, :-1]; o[:, :-1] |= out[:, 1:]
        out = o
    return out


def fit_affine(dm, disp_r, sel):
    A = np.stack([dm[sel], np.ones(sel.sum())], 1)
    s, t = np.linalg.lstsq(A, disp_r[sel], rcond=None)[0]
    return s, t


def fit_planes(X, k_max=10, iters=800, thr=0.02, min_frac=0.01, rng=None):
    """Sequential RANSAC: up to k_max planes (n, c with n.x = c) from 3D points X of the CURRENT state."""
    rng = rng or np.random.default_rng(0)
    planes, rest = [], X
    n0 = len(X)
    for _ in range(k_max):
        if len(rest) < max(150, min_frac * n0):
            break
        i = rng.integers(0, len(rest), (iters, 3))
        a, b, c = rest[i[:, 0]], rest[i[:, 1]], rest[i[:, 2]]
        nrm = np.cross(b - a, c - a)
        ln = np.linalg.norm(nrm, axis=1)
        ok = ln > 1e-6
        nrm, a = nrm[ok] / ln[ok, None], a[ok]
        off = (nrm * a).sum(1)
        cnt = (np.abs(rest @ nrm.T - off[None]) < thr).sum(0)
        best = int(np.argmax(cnt))
        if cnt[best] < max(150, min_frac * n0):
            break
        nb, ob = nrm[best], off[best]
        inl = np.abs(rest @ nb - ob) < thr
        # refine by least squares on the inliers
        Y = rest[inl]
        cen = Y.mean(0)
        _, _, vt = np.linalg.svd(Y - cen, full_matrices=False)
        nb = vt[-1]
        ob = nb @ cen
        planes.append((nb, ob))
        rest = rest[np.abs(rest @ nb - ob) >= thr]
    return planes


def plane_snap(z_mono, CAM, f, W, H, hole, zr, cov, tol=0.15):
    """OURS (structure-aware lifting): extend the flat surfaces already in the world into the hole.
    The mono depth only VOTES which surface a hole pixel belongs to (if any plane is within tol of it);
    the depth itself then comes from the existing geometry, so it cannot drift."""
    ys, xs = np.nonzero(cov)
    if len(ys) < 500:
        return z_mono, 0.0
    k = np.random.default_rng(0).choice(len(ys), min(20000, len(ys)), replace=False)
    Pw, _, _, _ = unproject(CAM, f, W, H, zr, cov)
    Pw = Pw[k]
    planes = fit_planes(Pw)
    if not planes:
        return z_mono, 0.0
    # CONTINUITY: label covered pixels by the plane they lie on; a hole component may only continue
    # planes that actually touch its rim in the image (surfaces extend across the seam, never jump).
    from scipy import ndimage
    Pall, _, cy, cx = unproject(CAM, f, W, H, zr, cov)
    lab_img = np.full((H, W), -1, np.int64)
    dist_best = np.full(len(Pall), np.inf)
    for pi_, (nb, ob) in enumerate(planes):
        dd = np.abs(Pall @ nb - ob)
        on = (dd < 0.02) & (dd < dist_best)
        dist_best[on] = dd[on]
        lab_img[cy[on], cx[on]] = pi_
    comp, ncomp = ndimage.label(hole)
    allowed = {}
    for c in range(1, ncomp + 1):
        rim = dilate(comp == c, 3) & cov
        labs, cnts = np.unique(lab_img[rim], return_counts=True)
        allowed[c] = {int(l) for l, n in zip(labs, cnts) if l >= 0 and n >= 15}
    hy, hx = np.nonzero(hole)
    hc = comp[hy, hx]
    th = CAM[f, 12]
    asp = W / H
    u = ((hx + 0.5) / W * 2 - 1) * th * asp
    v = (1 - (hy + 0.5) / H * 2) * th
    o, fw, rt, up = CAM[f, 0:3], CAM[f, 3:6], CAM[f, 6:9], CAM[f, 9:12]
    w = fw[None] + u[:, None] * rt[None] + v[:, None] * up[None]  # ray with unit forward component
    zm = z_mono[hy, hx]
    best = np.full(len(hy), np.inf)
    bestz = zm.copy()
    for pi_, (nb, ob) in enumerate(planes):
        okc = np.array([pi_ in allowed[c] for c in hc]) if len(hc) else np.zeros(0, bool)
        den = w @ nb
        zc = np.where(np.abs(den) > 1e-6, (ob - o @ nb) / np.where(np.abs(den) > 1e-6, den, 1), -1)  # z-depth of the plane hit
        rel = np.abs(zc - zm) / np.maximum(zm, 1e-6)
        take = okc & (zc > 0.05) & (rel < tol) & (rel < best)
        best[take] = rel[take]
        bestz[take] = zc[take]
    out = z_mono.copy()
    out[hy, hx] = bestz
    return out, float(np.isfinite(best).mean())


LAST_FIELDS = [None]


def scalefield_fit(dm, disp_r, sel, w, prev, G=int(os.environ.get("SF_G", 12)), lam=float(os.environ.get("SF_LAM", 3.0)), mu=0.05, nmax=30000):
    """OURS: the mono depth's error is mostly a slowly varying scale/shift, so solve for smooth
    FIELDS s(x,y), t(x,y) on a coarse G x G grid: confidence-weighted data term on every covered
    pixel + membrane smoothness + a weak pull to the global fit. Extrapolates harmonically into
    holes instead of extending one global line. One small sparse least-squares solve."""
    H, W = dm.shape
    ys, xs = np.nonzero(sel)
    if len(ys) > nmax:
        k = np.random.default_rng(0).choice(len(ys), nmax, replace=False)
        ys, xs = ys[k], xs[k]
    s0, t0 = fit_affine(dm, disp_r, sel) if sel.sum() >= 50 else prev
    if s0 <= 0:
        s0, t0 = prev
    gx = xs / (W - 1) * (G - 1)
    gy = ys / (H - 1) * (G - 1)
    x0 = np.clip(np.floor(gx).astype(int), 0, G - 2)
    y0 = np.clip(np.floor(gy).astype(int), 0, G - 2)
    fx, fy = gx - x0, gy - y0
    nodes = [(y0 * G + x0, (1 - fx) * (1 - fy)), (y0 * G + x0 + 1, fx * (1 - fy)), ((y0 + 1) * G + x0, (1 - fx) * fy), ((y0 + 1) * G + x0 + 1, fx * fy)]
    n = len(ys)
    sw = np.sqrt(np.maximum(w[ys, xs], 1e-3))
    rows, cols, vals = [], [], []
    for nd, bw in nodes:
        rows += [np.arange(n), np.arange(n)]
        cols += [nd, G * G + nd]
        vals += [sw * bw * dm[ys, xs], sw * bw]
    rhs = [sw * disp_r[ys, xs]]
    r = n
    for off in (0, G * G):  # smoothness on s and on t
        for a in range(G):
            for b in range(G):
                i = a * G + b
                for j in ((a * G + b + 1) if b + 1 < G else -1, ((a + 1) * G + b) if a + 1 < G else -1):
                    if j < 0:
                        continue
                    sc = lam * (1.0 if off == 0 else 1.0 / max(abs(s0), 1e-6) * abs(s0))
                    rows += [np.array([r]), np.array([r])]
                    cols += [np.array([off + i]), np.array([off + j])]
                    vals += [np.array([sc]), np.array([-sc])]
                    rhs.append(np.array([0.0]))
                    r += 1
    for i in range(G * G):  # weak prior towards the global fit
        rows += [np.array([r]), np.array([r + 1])]
        cols += [np.array([i]), np.array([G * G + i])]
        vals += [np.array([mu]), np.array([mu])]
        rhs += [np.array([mu * s0]), np.array([mu * t0])]
        r += 2
    A = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(r, 2 * G * G))
    sol = spla.lsqr(A, np.concatenate(rhs), atol=1e-10, btol=1e-10, iter_lim=5000)[0]
    S, Tt = sol[: G * G].reshape(G, G), sol[G * G:].reshape(G, G)
    # bilinear upsample of the fields to every pixel
    yy, xx = np.mgrid[0:H, 0:W]
    gx = xx / (W - 1) * (G - 1)
    gy = yy / (H - 1) * (G - 1)
    x0 = np.clip(np.floor(gx).astype(int), 0, G - 2)
    y0 = np.clip(np.floor(gy).astype(int), 0, G - 2)
    fx, fy = gx - x0, gy - y0
    def up(F):
        return F[y0, x0] * (1 - fx) * (1 - fy) + F[y0, x0 + 1] * fx * (1 - fy) + F[y0 + 1, x0] * (1 - fx) * fy + F[y0 + 1, x0 + 1] * fx * fy
    LAST_FIELDS[0] = (S, Tt)
    return up(S) * dm + up(Tt), (s0, t0)


def lift_depth(method, dm, zr, cov, hole, prev, band_px=6, w=None):
    """Return (z for every pixel, (s, t) used). dm: mono disparity, zr: rendered z (inf = no cover).
    prev: last good (s, t) — used when too little of the frame is covered to fit (fast turns)."""
    disp_r = np.where(cov, 1.0 / np.maximum(zr, 1e-6), 0.0)
    if method == "scalefield":
        d, st = scalefield_fit(dm, disp_r, cov, w if w is not None else cov.astype(np.float32), prev)
        d = np.where(d > 1e-4, d, prev[0] * dm + prev[1])
        return 1.0 / np.maximum(d, 1e-4), st
    band = dilate(hole, band_px) & cov
    bg = None
    if method.endswith("_bg"):
        # OCCLUSION-AWARE: a disoccluded hole reveals BACKGROUND, so only the far side of its rim may
        # anchor it. Per hole component, keep rim pixels in the farther 60% (lower disparity); the
        # near-side rim (the occluder) is left free (Neumann) instead of pulling the hole forward.
        from scipy import ndimage
        lab, nlab = ndimage.label(hole)
        rim = dilate(hole, 1) & cov
        bg = np.zeros_like(hole)
        rlab = ndimage.maximum_filter(lab, size=3) * rim
        for c in range(1, nlab + 1):
            r = rlab == c
            if r.sum() == 0:
                continue
            cut = np.percentile(disp_r[r], 60)
            bg |= r & (disp_r <= cut)
        band = dilate(hole, band_px) & cov & (dilate(bg, band_px) | ~dilate(rim, band_px))
        method = method[:-3]
    if band.sum() < 50:
        band = cov
    sel = cov if method == "global" else band
    s, t = fit_affine(dm, disp_r, sel) if sel.sum() >= 50 else prev
    if s <= 0:  # a fit with the wrong sign is worse than the previous scale
        s, t = prev
    if method in ("global", "band"):
        return 1.0 / np.maximum(s * dm + t, 1e-4), (s, t)
    # poisson (ours): unknown disparity u on hole pixels; Laplacian(u) = Laplacian(s*dm) inside,
    # neighbours outside the hole are fixed to the RENDERED disparity (exact seam match).
    g = s * dm + t
    H, W = hole.shape
    idx = -np.ones((H, W), np.int64)
    ys, xs = np.nonzero(hole)
    n = len(ys)
    idx[ys, xs] = np.arange(n)
    rows, cols, vals = [], [], []
    b = np.zeros(n)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = ys + dy, xs + dx
        inb = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
        k = np.nonzero(inb)[0]
        yk, xk = yy[k], xx[k]
        # guidance gradient from the mono depth
        b[k] += g[ys[k], xs[k]] - g[yk, xk]
        rows.append(k); cols.append(k); vals.append(np.ones(len(k)))
        nb_idx = idx[yk, xk]
        inside = nb_idx >= 0
        rows.append(k[inside]); cols.append(nb_idx[inside]); vals.append(-np.ones(inside.sum()))
        fixed = ~inside
        kf = k[fixed]
        # boundary: rendered disparity where covered, else the guidance itself (image border / no cover)
        cv = cov[yk[fixed], xk[fixed]]
        if bg is not None:
            # near-side rim: no Dirichlet constraint -> drop this neighbour from the equation (Neumann)
            anchor = bg[yk[fixed], xk[fixed]] | ~cv
            drop = kf[~anchor]
            np.add.at(b, drop, -(g[ys[drop], xs[drop]] - g[yk[fixed][~anchor], xk[fixed][~anchor]]))
            rows.append(drop); cols.append(drop); vals.append(-np.ones(len(drop)))
            kf, cv, yf, xf = kf[anchor], cv[anchor], yk[fixed][anchor], xk[fixed][anchor]
        else:
            yf, xf = yk[fixed], xk[fixed]
        bv = np.where(cv, disp_r[yf, xf], g[yf, xf])
        np.add.at(b, kf, bv)
    # weak pull to the guidance keeps every row well-posed (a hole cell whose rim is all near-side)
    rows.append(np.arange(n)); cols.append(np.arange(n)); vals.append(np.full(n, 1e-3))
    b += 1e-3 * g[ys, xs]
    A = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n))
    u = spla.spsolve(A, b)
    u = np.where(u > 1e-4, u, g[ys, xs])  # never let the solve go behind the camera
    out = 1.0 / np.maximum(g, 1e-4)
    out[ys, xs] = 1.0 / np.maximum(u, 1e-4)
    return out, (s, t)


# ───────────────────────── the loop ─────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--W", type=int, default=384)
    ap.add_argument("--H", type=int, default=384)
    ap.add_argument("--F", type=int, default=96)
    ap.add_argument("--gen", default="oracle", choices=["oracle", "lama"])
    ap.add_argument("--lift", default="scalefield", choices=["global", "band", "poisson", "band_bg", "poisson_bg", "scalefield", "gt", "oracle_affine", "oracle_scalefield", "planes"])
    ap.add_argument("--tau", type=float, default=0.004, help="generate only when novel pixel fraction > tau")
    ap.add_argument("--out", default="runs/v0")
    ap.add_argument("--frontier", type=int, default=0, help="leave this many px at the image border uncommitted (0 = off)")
    ap.add_argument("--elastic", type=int, default=0, help="re-solve the fields of the last K imagined regions jointly (0 = off)")
    ap.add_argument("--edge-drop", type=float, default=0.0, help="drop lifted pixels with |grad log z| above this (0 = off)")
    ap.add_argument("--lifted-conf", type=float, default=0.25, help="anchor weight of imagined+lifted points")
    ap.add_argument("--init", default="mono", choices=["mono", "gt"], help="gt = start the world from exact depth (isolates lifting)")
    args = ap.parse_args()
    W, H, F = args.W, args.H, args.F
    os.makedirs(args.out, exist_ok=True)
    SPH, BOX, MAT, LGT = T.studio_scene("hard")
    CAM = walk_loop(F)
    log = lambda *a: print(*a, flush=True)
    depth = MonoDepth()
    lama = Lama() if args.gen == "lama" else None

    GT = [gt_frame(CAM, f, W, H, SPH, BOX, MAT, LGT) for f in range(F)]
    # frame 0: the world starts from one image + its (aligned) depth
    rgb0, z0 = GT[0]
    t0 = time.time()
    dm0 = depth(tonemap(rgb0))
    gen_sec = time.time() - t0
    fin = np.isfinite(z0)
    s, t = fit_affine(dm0, np.where(fin, 1 / np.maximum(z0, 1e-6), 0), fin)  # global metric scale once (camera intrinsics/scale prior)
    zinit = 1.0 / np.maximum(s * dm0 + t, 1e-4) if args.init == "mono" else np.where(fin, z0, 1e3)
    st = (s, t)
    P, R, ys, xs = unproject(CAM, 0, W, H, zinit, np.ones((H, W), bool))
    C = rgb0[ys, xs]
    Q = np.ones(len(P))  # confidence: first-view points 1.0, imagined+lifted points lower
    # per-point lift metadata for the elastic world: event id (-1 = fixed first view), pixel, mono value
    pev = np.full(len(P), -1, np.int64)
    ppx = np.zeros(len(P))
    ppy = np.zeros(len(P))
    pm = np.zeros(len(P))
    EW = None
    if args.elastic > 0:
        from elastic import ElasticWorld
        EW = ElasticWorld(CAM, W, H, int(os.environ.get("SF_G", 12)), lam=float(os.environ.get("SF_LAM", 3.0)))
    rng = np.random.default_rng(1)
    events, rows = 0, []
    lift_err_all, seam_err_all, diag, snap_log = [], [], [], []
    frames_out = []
    for f in range(1, F):
        rgb_gt, z_gt = GT[f]
        t1 = time.time()
        img, zr, cov, Qm, Im = splat(P, C, R.astype(np.float64), CAM, f, W, H, Q)
        render_sec = time.time() - t1
        hole = ~cov
        nov = hole.mean()
        tok = hole[: H // 16 * 16, : W // 16 * 16].reshape(H // 16, 16, W // 16, 16).any(axis=(1, 3)).mean()
        g_sec = 0.0
        if nov > args.tau:
            events += 1
            t1 = time.time()
            if lama is None:
                filled = tonemap(rgb_gt)  # oracle generator: isolates the lifting error
            else:
                filled = lama(tonemap(img), dilate(hole, 2))
            gen_rgb = np.where(hole[..., None], filled, tonemap(img))
            dm = depth(gen_rgb)
            if args.lift == "gt":  # CEILING: perfect depth for every new pixel
                zl = np.where(np.isfinite(z_gt), z_gt, 1e3)
            elif args.lift == "planes":  # scale-field lift, then snap to the world's extended surfaces
                zl, st = lift_depth("scalefield", dm, zr, cov, hole, st, w=Qm)
                zl, snapped = plane_snap(zl, CAM, f, W, H, hole, zr, cov)
                snap_log.append(snapped)
            elif args.lift == "oracle_scalefield":  # smooth (non-affine) correction, perfectly fitted on the hole
                okh = hole & np.isfinite(z_gt)
                dg = np.where(np.isfinite(z_gt), 1 / np.maximum(z_gt, 1e-6), 0)
                d, _ = scalefield_fit(dm, dg, okh, okh.astype(np.float32), st) if okh.sum() > 50 else (st[0] * dm + st[1], st)
                zl = 1.0 / np.maximum(d, 1e-4)
            elif args.lift == "oracle_affine":  # mono-depth SHAPE with perfect calibration on the hole
                okh = hole & np.isfinite(z_gt)
                so, to = fit_affine(dm, np.where(np.isfinite(z_gt), 1 / np.maximum(z_gt, 1e-6), 0), okh) if okh.sum() > 20 else st
                zl = 1.0 / np.maximum(so * dm + to, 1e-4)
            else:
                zl, st = lift_depth(args.lift, dm, zr, cov, hole, st, w=Qm)
            g_sec = time.time() - t1
            gen_sec += g_sec
            # errors vs exact ground truth depth, inside the hole and on its 3-px seam ring
            ok = hole & np.isfinite(z_gt)
            seam = ok & dilate(~hole, 3)  # hole pixels within 3 px of the existing world
            if ok.sum():
                lift_err_all.append(float(np.median(np.abs(zl[ok] - z_gt[ok]) / z_gt[ok])))
                # diagnostics: (1) are the anchors (rendered state on the rim) already wrong?
                rim = dilate(hole, 3) & cov & np.isfinite(z_gt)
                a_err = float(np.median(np.abs(zr[rim] - z_gt[rim]) / z_gt[rim])) if rim.any() else float("nan")
                # (2) best possible affine-disparity fit of the mono depth ON the hole (oracle floor)
                A = np.stack([dm[ok], np.ones(ok.sum())], 1)
                so, to = np.linalg.lstsq(A, 1 / z_gt[ok], rcond=None)[0]
                floor = float(np.median(np.abs(1 / np.maximum(so * dm[ok] + to, 1e-4) - z_gt[ok]) / z_gt[ok]))
                # (3) where is the hole: touching the image border (field-of-view growth) or interior (disocclusion)?
                border = bool(hole[0].any() or hole[-1].any() or hole[:, 0].any() or hole[:, -1].any())
                diag.append({"f": f, "hole": float(hole.mean()), "lift_err": lift_err_all[-1], "anchor_err": a_err, "oracle_floor": floor, "border": border})
            if seam.sum():
                seam_err_all.append(float(np.median(np.abs(zl[seam] - z_gt[seam]) / z_gt[seam])))
            lift_mask = hole
            if args.edge_drop > 0:
                # FLYING-PIXEL GUARD: mono depth blurs object edges into ramps between foreground and
                # background; points on those ramps float in mid-air from any new viewpoint. Drop hole
                # pixels whose log-depth changes faster than edge_drop per pixel; they stay holes and
                # are re-imagined from a later view, where they may no longer sit on an edge.
                lz = np.log(np.maximum(zl, 1e-4))
                gy_, gx_ = np.gradient(lz)
                lift_mask = hole & (np.hypot(gx_, gy_) < args.edge_drop)
            if args.frontier > 0:
                # LAZY COMMIT AT THE FRONTIER: geometry entering at the screen edge has context on one
                # side only, so it is the least constrained — and it is exactly what the NEXT strip will
                # anchor on. Leave a band of M px at the image border uncommitted; one frame later it sits
                # inside the view with more context and is lifted then.
                M = args.frontier
                edge = np.zeros_like(hole)
                edge[:M, :] = edge[-M:, :] = True
                edge[:, :M] = edge[:, -M:] = True
                lift_mask = lift_mask & ~edge
            Pn, Rn, yn, xn = unproject(CAM, f, W, H, zl, lift_mask)
            eid = -1
            if EW is not None and args.lift == "scalefield" and LAST_FIELDS[0] is not None:
                eid = EW.add_event(f, LAST_FIELDS[0][0], LAST_FIELDS[0][1], dm, Im, rng)
            pev = np.concatenate([pev, np.full(len(Pn), eid)])
            ppx = np.concatenate([ppx, xn.astype(np.float64)])
            ppy = np.concatenate([ppy, yn.astype(np.float64)])
            pm = np.concatenate([pm, dm[yn, xn].astype(np.float64)])
            P = np.vstack([P, Pn])
            R = np.concatenate([R, Rn])
            Q = np.concatenate([Q, np.full(len(Pn), args.lifted_conf)])
            if eid >= 0:
                P, moved = EW.solve(pev, ppx, ppy, pm, P, window=args.elastic)
            C = np.vstack([C, inv_tonemap(gen_rgb[yn, xn]).astype(np.float32)])
            img, zr, cov, Qm, Im = splat(P, C, R.astype(np.float64), CAM, f, W, H, Q)
        out = tonemap(img)
        if g_sec > 0:
            # pixels generated but not committed (frontier) are still SHOWN this frame
            out = np.where(~cov[..., None], gen_rgb, out)
        mse = float(np.mean((out - tonemap(rgb_gt)) ** 2))
        rows.append({"f": f, "novel_px": float(nov), "novel_tok": float(tok), "generated": g_sec > 0, "render_s": render_sec, "gen_s": g_sec, "psnr": 10 * math.log10(1 / max(mse, 1e-10)), "points": int(len(P))})
        frames_out.append((out * 255).astype(np.uint8))
        if f % 8 == 0:
            log(f"f{f:3d} novel {nov * 100:5.2f}% px / {tok * 100:5.1f}% tok  gen {'Y' if g_sec else '-'} {g_sec:5.2f}s  render {render_sec:5.2f}s  PSNR {rows[-1]['psnr']:5.2f}  points {len(P)}")
    # revisit: the last frame is the first frame's pose again
    last = rows[-1]
    first_render = frames_out[0]
    summary = {
        "gen": args.gen, "lift": args.lift, "tau": args.tau, "frames": F, "generator_events": events,
        "frames_without_generation_pct": 100 * (1 - events / (F - 1)),
        "mean_novel_px_pct": 100 * float(np.mean([r["novel_px"] for r in rows])),
        "mean_novel_tok_pct": 100 * float(np.mean([r["novel_tok"] for r in rows])),
        "lift_abs_rel_err_median_of_events": float(np.median(lift_err_all)) if lift_err_all else None,
        "seam_abs_rel_err_median_of_events": float(np.median(seam_err_all)) if seam_err_all else None,
        "seam_abs_rel_err_mean_of_events": float(np.mean(seam_err_all)) if seam_err_all else None,
        "mean_psnr": float(np.mean([r["psnr"] for r in rows])),
        "plane_snapped_frac": float(np.mean(snap_log)) if snap_log else None,
        "revisit_psnr_last_frame": last["psnr"],
        "render_s_per_frame": float(np.mean([r["render_s"] for r in rows])),
        "gen_s_total": gen_sec,
    }
    log(json.dumps(summary, indent=1))
    with open(os.path.join(args.out, f"summary_{args.gen}_{args.lift}.json"), "w") as fh:
        json.dump({"summary": summary, "rows": rows, "diag": diag}, fh, indent=1)
    for d in diag[:12]:
        log(f"  event f{d['f']:3d} hole {d['hole'] * 100:5.1f}% border {d['border']!s:5s} lift {d['lift_err']:.3f}  anchors {d['anchor_err']:.3f}  oracle-floor {d['oracle_floor']:.3f}")
    strip = np.concatenate([frames_out[i] for i in np.linspace(0, len(frames_out) - 1, 6).astype(int)], axis=1)
    Image.fromarray(strip).save(os.path.join(args.out, f"strip_{args.gen}_{args.lift}.png"))


if __name__ == "__main__":
    main()
