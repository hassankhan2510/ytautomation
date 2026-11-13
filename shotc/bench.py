"""
shotc benchmark — does knowing the whole shot in advance buy 10x less compute at EQUAL quality?

  python bench.py --W 270 --H 480 --F 48            (laptop scale)
  python bench.py --W 540 --H 960 --F 96 --out runs/actions   (GitHub runner scale)

Method (all on the same machine, same renderer core, same scene, all CPU threads):
  REF  per-frame path tracing at --ref-spp on the evaluation frames (independent noise seed).
  A0   per-frame path tracing at 1..64 spp            — today's cinematic method (Cycles / UE path tracer).
  A1   A0 + past-only temporal reuse (game-style TAA)  — so we know how much is "just temporal reuse".
  B    shot compiler (visibility -> world light cache -> past+future temporal reuse).
Quality = error vs REF on evaluation frames spread over the shot, INCLUDING the first and last frame
(where B's time window is one-sided). Two metrics: relMSE on linear HDR, and PSNR after tonemapping.
Equal quality: A0's error-vs-spp curve is fitted (log-log) and we solve for the spp A0 would need to
match B; its cost is A0's measured per-sample time x that spp x all frames. Ratio = that / B's total
measured wall time (B's shot-wide precompute included).
"""
import argparse
import json
import math
import os
import time

import numpy as np

import tracer as T


def tonemap(x):
    x = np.maximum(x, 0)
    return (x / (1.0 + x)) ** (1 / 2.2)


def errors(img, ref):
    rel = float(np.mean((img - ref) ** 2 / (ref ** 2 + 1e-2)))
    mse = float(np.mean((tonemap(img) - tonemap(ref)) ** 2))
    return rel, mse


def psnr(mse):
    return 10 * math.log10(1.0 / max(mse, 1e-12))


def save_png(img, path):
    from PIL import Image
    Image.fromarray(np.clip(tonemap(img) * 255, 0, 255).astype(np.uint8)).save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--W", type=int, default=270)
    ap.add_argument("--H", type=int, default=480)
    ap.add_argument("--F", type=int, default=48)
    ap.add_argument("--ref-spp", type=int, default=1024)
    ap.add_argument("--evals", type=int, default=5)
    ap.add_argument("--a-spp", default="1,2,4,8,16,32,64")
    ap.add_argument("--out", default="runs/local")
    # B knobs: direct samples per frame, final spp, temporal half-window, cache cell size, cache samples
    ap.add_argument("--b", default="2,2,4,0.06,256;1,1,6,0.06,256;4,4,4,0.04,512")
    ap.add_argument("--vis-stride", type=int, default=4)
    ap.add_argument("--denoise", action="store_true", help="also score both methods after Intel OIDN (pip install pyoidn)")
    args = ap.parse_args()
    W, H, F = args.W, args.H, args.F
    os.makedirs(args.out, exist_ok=True)
    SPH, BOX, MAT, LGT = T.studio_scene()
    CAM = T.camera_path(F, W, H)
    ev = sorted(set(int(round(x)) for x in np.linspace(0, F - 1, args.evals)))
    tol = 0.02 * (270 / W) + 0.01
    log = lambda *a: print(*a, flush=True)
    log(f"shot {W}x{H}, {F} frames, eval frames {ev}, threads={T.nb.get_num_threads()}")

    # warm-up: compile every kernel on a tiny problem (compile time is not render time)
    t0 = time.time()
    tc = T.camera_path(3, 8, 8)
    T.render_A(tc, 0, 8, 8, 1, 0, SPH, BOX, MAT, LGT)
    Pw = np.stack([T.gbuffer(tc, f, 8, 8, SPH, BOX, MAT) for f in range(3)])
    T.temporal_past(tc, 1, np.zeros((3, 8, 8, 3), np.float32), Pw, 8, 8, 1, 0.1)
    k, p = T.visibility(tc, 3, 8, 8, 2, 1, 0.1, SPH, BOX, MAT)
    C0w = T.fill_cache(np.zeros((1, 3)), np.array([[0.0, 1.0, 0.0]]), np.array([1], np.int64), SPH, BOX, MAT, LGT)
    T.gather_cache(np.zeros((1, 3)), np.array([[0.0, 1.0, 0.0]]), np.array([1], np.int64), np.array([0], np.int64), C0w, 0.1, SPH, BOX, MAT, LGT)
    T.filter_cache(np.array([0], np.int64), C0w, 2.0)
    Pd, Dd = T.direct_buffer(tc, 0, 8, 8, 1, SPH, BOX, MAT, LGT)
    ck, cz = np.array([0], np.int64), np.zeros((1, 3), np.float32)
    Pmw, Smw = T.spec_buffer(tc, 0, 8, 8, 1, 0.1, ck, cz, SPH, BOX, MAT, LGT)
    T.render_B(tc, 1, 3, 8, 8, 1, 1, 0.1, 0.1, np.stack([Pd] * 3), np.stack([Dd] * 3), ck, cz, SPH, BOX, MAT, LGT, 1, 0.05, np.stack([Pmw] * 3), np.stack([Smw] * 3))
    log(f"compiled kernels in {time.time() - t0:.1f}s (excluded)")

    # ── reference ──
    ref_file = os.path.join(args.out, f"ref_{W}x{H}_F{F}_s{args.ref_spp}.npz")
    if os.path.exists(ref_file):
        REF = dict(np.load(ref_file))
        REF = {int(k): v for k, v in REF.items()}
        log("reference loaded")
    else:
        REF = {}
        for f in ev:
            t0 = time.time()
            REF[f] = T.render_A(CAM, f, W, H, args.ref_spp, 999_983, SPH, BOX, MAT, LGT)
            log(f"  ref frame {f}: {time.time() - t0:.1f}s")
        np.savez_compressed(ref_file, **{str(k): v for k, v in REF.items()})
    # how noisy is the reference itself? (two halves would be better; report its expected floor)

    AUX = {}
    dn = None
    if args.denoise:
        import pyoidn
        T.aux_buffers(tc, 0, 8, 8, 1, SPH, BOX, MAT)  # compile (excluded)
        t1 = time.time()
        for f in ev:
            AUX[f] = T.aux_buffers(CAM, f, W, H, 8, SPH, BOX, MAT)
        aux_sec = (time.time() - t1) / len(ev)  # charged to BOTH methods, per frame
        def dn(img, f):
            a, n = AUX[f]
            return pyoidn.denoise(np.ascontiguousarray(img, np.float32), albedo=a, normal=n, hdr=True)
        dn(REF[ev[0]], ev[0])  # initialise the device once (excluded)
        log("denoiser: Intel OIDN via pyoidn (albedo + normal guides)")

    res = {"shot": {"W": W, "H": H, "F": F, "eval_frames": ev, "ref_spp": args.ref_spp}, "A0": [], "A1": [], "B": []}

    # ── A0: per-frame path tracing ──
    for spp in [int(x) for x in args.a_spp.split(",")]:
        t0 = time.time()
        imgs = {f: T.render_A(CAM, f, W, H, spp, 0, SPH, BOX, MAT, LGT) for f in ev}
        per_frame = (time.time() - t0) / len(ev)
        e = np.array([errors(imgs[f], REF[f]) for f in ev])
        row = {"spp": spp, "sec_per_frame": per_frame, "shot_sec": per_frame * F, "relmse": float(e[:, 0].mean()), "psnr": psnr(e[:, 1].mean())}
        if dn:
            t1 = time.time()
            dimg = {f: dn(imgs[f], f) for f in ev}
            dsec = (time.time() - t1) / len(ev) + aux_sec
            de = np.array([errors(dimg[f], REF[f]) for f in ev])
            row["dn"] = {"shot_sec": (per_frame + dsec) * F, "relmse": float(de[:, 0].mean()), "psnr": psnr(de[:, 1].mean())}
            log(f"   +OIDN: shot {row['dn']['shot_sec']:7.1f}s  relMSE {row['dn']['relmse']:.5f}  PSNR {row['dn']['psnr']:.2f}")
            if spp in (1, 4):
                save_png(dimg[ev[len(ev) // 2]], os.path.join(args.out, f"A0_spp{spp}_oidn.png"))
        res["A0"].append(row)
        log(f"A0 spp={spp:3d}  {per_frame:6.2f}s/frame  shot {row['shot_sec']:7.1f}s  relMSE {row['relmse']:.5f}  PSNR {row['psnr']:.2f}")
        if spp in (4, 16):
            save_png(imgs[ev[len(ev) // 2]], os.path.join(args.out, f"A0_spp{spp}.png"))

    # ── A1: per-frame + past-only temporal reuse (game-style) ──
    for spp, K in [(1, 8), (4, 8)]:
        t0 = time.time()
        A = np.stack([T.render_A(CAM, f, W, H, spp, 0, SPH, BOX, MAT, LGT) for f in range(F)])
        P = np.stack([T.gbuffer(CAM, f, W, H, SPH, BOX, MAT) for f in range(F)])
        outs = {f: T.temporal_past(CAM, f, A, P, W, H, K, tol) for f in range(F)}
        sec = time.time() - t0
        e = np.array([errors(outs[f], REF[f]) for f in ev])
        row = {"spp": spp, "K_past": K, "shot_sec": sec, "relmse": float(e[:, 0].mean()), "psnr": psnr(e[:, 1].mean()), "per_eval": [psnr(x) for x in e[:, 1]]}
        res["A1"].append(row)
        log(f"A1 spp={spp} past K={K}  shot {sec:7.1f}s  relMSE {row['relmse']:.5f}  PSNR {row['psnr']:.2f}  per-frame PSNR {[round(x, 1) for x in row['per_eval']]}")
        del A, P

    # ── B: shot compiler ──
    for cfg in args.b.split(";"):
        parts = cfg.split(",")
        nd, spp, K, h, ns = int(parts[0]), int(parts[1]), int(parts[2]), float(parts[3]), int(parts[4])
        filt = float(parts[5]) if len(parts) > 5 else 0.0  # cache de-speckle clamp (0 = off)
        Ks = int(parts[6]) if len(parts) > 6 else 0  # view-dependent (metal) reuse half-window (0 = off)
        nspec = int(parts[7]) if len(parts) > 7 else 4  # reflection samples per metal pixel per frame
        tm = {}
        t0 = time.time()
        keys, pts = T.visibility(CAM, F, W, H, args.vis_stride, 2, h, SPH, BOX, MAT)
        ok = keys >= 0
        keys, pts = keys[ok], pts[ok]
        ukeys, inv, cnt = np.unique(keys, return_inverse=True, return_counts=True)
        cpos = np.zeros((len(ukeys), 3))
        cnrm = np.zeros((len(ukeys), 3))
        for c in range(3):
            cpos[:, c] = np.bincount(inv, weights=pts[:, c], minlength=len(ukeys)) / cnt
            cnrm[:, c] = np.bincount(inv, weights=pts[:, 3 + c], minlength=len(ukeys))
        cnrm /= np.maximum(np.linalg.norm(cnrm, axis=1, keepdims=True), 1e-9)
        tm["visibility"] = time.time() - t0
        t1 = time.time()
        # stage 1: coarse full-path cache (all bounces, few samples) — feeds the gather's deep bounces
        C0 = T.fill_cache(cpos, cnrm, np.full(len(ukeys), max(8, ns // 8), dtype=np.int64), SPH, BOX, MAT, LGT)
        # stage 2: final gather, samples ~ sqrt(screen coverage over the whole shot) (known future)
        w = np.sqrt(cnt.astype(np.float64))
        nsamp = np.clip(np.round(ns * w / w.mean()), max(4, ns // 4), ns * 4).astype(np.int64)
        C = T.gather_cache(cpos, cnrm, nsamp, ukeys, C0, h, SPH, BOX, MAT, LGT)
        if filt > 0:
            C = T.filter_cache(ukeys, C, filt)
        tm["light_cache"] = time.time() - t1
        t1 = time.time()
        Ps = np.empty((F, H, W, 3), np.float32)
        Ds = np.empty((F, H, W, 3), np.float32)
        for f in range(F):
            Ps[f], Ds[f] = T.direct_buffer(CAM, f, W, H, nd, SPH, BOX, MAT, LGT)
        tm["direct_buffers"] = time.time() - t1
        Pm = np.full((1, 1, 1, 3), np.inf, np.float32)
        Sm = np.zeros((1, 1, 1, 3), np.float32)
        if Ks > 0:
            t1 = time.time()
            Pm = np.empty((F, H, W, 3), np.float32)
            Sm = np.empty((F, H, W, 3), np.float32)
            for f in range(F):
                Pm[f], Sm[f] = T.spec_buffer(CAM, f, W, H, nspec, h, ukeys, C, SPH, BOX, MAT, LGT)
            tm["spec_buffers"] = time.time() - t1
        t1 = time.time()
        outs, miss = {}, 0
        for f in range(F):
            outs[f], m = T.render_B(CAM, f, F, W, H, spp, K, tol, h, Ps, Ds, ukeys, C, SPH, BOX, MAT, LGT, Ks, math.radians(3.0), Pm, Sm)
            miss += m
        tm["final_frames"] = time.time() - t1
        sec = time.time() - t0
        e = np.array([errors(outs[f], REF[f]) for f in ev])
        row = {"cfg": {"direct_spp": nd, "spp": spp, "K": K, "cell": h, "cache_spp": ns, "filter": filt, "spec_K": Ks, "spec_spp": nspec}, "cells": int(len(ukeys)), "cache_misses": int(miss),
               "shot_sec": sec, "stages": tm, "relmse": float(e[:, 0].mean()), "psnr": psnr(e[:, 1].mean()), "per_eval": [psnr(x) for x in e[:, 1]]}
        if dn:
            t1 = time.time()
            dimg = {f: dn(outs[f], f) for f in ev}
            dsec = (time.time() - t1) / len(ev) + aux_sec
            de = np.array([errors(dimg[f], REF[f]) for f in ev])
            row["dn"] = {"shot_sec": sec + dsec * F, "relmse": float(de[:, 0].mean()), "psnr": psnr(de[:, 1].mean())}
            log(f"   +OIDN: shot {row['dn']['shot_sec']:7.1f}s  relMSE {row['dn']['relmse']:.5f}  PSNR {row['dn']['psnr']:.2f}")
            save_png(dimg[ev[len(ev) // 2]], os.path.join(args.out, f"B_{cfg.replace(',', '_')}_oidn.png"))
        res["B"].append(row)
        log(f"B {cfg}: cells {len(ukeys)} misses {miss}  shot {sec:7.1f}s {({k: round(v, 1) for k, v in tm.items()})}  relMSE {row['relmse']:.5f}  PSNR {row['psnr']:.2f}  per-frame {[round(x, 1) for x in row['per_eval']]}")
        save_png(outs[ev[len(ev) // 2]], os.path.join(args.out, f"B_{cfg.replace(',', '_').replace(';', '')}.png"))
        del Ps, Ds, Pm, Sm

    save_png(REF[ev[len(ev) // 2]], os.path.join(args.out, "REF.png"))

    # ── equal-quality compute: interpolate A0's MEASURED cost-vs-quality curve (log space) ──
    def a0_cost_at(target_psnr, key):
        pts = [(r[key]["psnr"] if key else r["psnr"], r[key]["shot_sec"] if key else r["shot_sec"]) for r in res["A0"]]
        pts.sort()
        if target_psnr <= pts[0][0]:
            return pts[0][1], "<=", True
        for (q0, c0), (q1, c1) in zip(pts, pts[1:]):
            if q0 <= target_psnr <= q1:
                u = (target_psnr - q0) / max(q1 - q0, 1e-9)
                return math.exp(math.log(c0) + u * (math.log(c1) - math.log(c0))), "=", False
        # beyond the measured range: report the measured maximum as a LOWER bound
        return pts[-1][1], ">=", True
    for row in res["B"]:
        for key in ([None, "dn"] if dn else [None]):
            b = row[key] if key else row
            cost, rel, bound = a0_cost_at(b["psnr"], key)
            b["A0_equal_psnr"] = {"shot_sec": cost, "ratio": cost / b["shot_sec"], "relation": rel}
            tag = "denoised" if key else "raw"
            log(f"B {row['cfg']} [{tag}] PSNR {b['psnr']:.2f}: per-frame needs {rel}{cost:.1f}s vs {b['shot_sec']:.1f}s -> {rel}{cost / b['shot_sec']:.1f}x")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump(res, fh, indent=1)
    log(f"wrote {args.out}/results.json")


if __name__ == "__main__":
    main()
