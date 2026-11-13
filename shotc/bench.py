"""
shotc benchmark — does knowing the whole shot in advance buy 10x less compute at EQUAL quality?

  python bench.py --scene soft --W 270 --H 480 --F 48                 (laptop scale)
  python bench.py --scene hard --W 540 --H 960 --F 96 --denoise      (GitHub runner, needs pyoidn)

Same machine, same renderer core, same scene, all CPU threads:
  REF  per-frame path tracing at --ref-spp (independent noise seed)
  A0   per-frame path tracing at 1..64 spp            — today's cinematic method (Cycles / UE path tracer)
       (+ OIDN: Intel Open Image Denoise with albedo/normal guides, the production default)
  A1   A0 + past-only temporal reuse (game-style TAA)  — how much is "just temporal reuse"
  B    shot compiler: visibility over the whole camera path -> world light cache (coarse full path +
       importance-weighted final gather + de-speckle) -> past+FUTURE reuse of direct light and of
       view-dependent reflections/refractions (weighted by view angle)        (+ OIDN, same guides)
Quality, measured against REF on evaluation frames spread over the shot (incl. first and last):
  PSNR   per-frame accuracy (tonemapped)
  tPSNR  TEMPORAL accuracy: frame-to-frame change vs the reference's change on consecutive frame
         pairs. Low tPSNR = flicker/boiling in the video, which per-frame PSNR cannot see.
Equal quality: the cheapest A0 cost that reaches B's quality, interpolated between MEASURED points
(log cost); if no measured A0 point reaches it, the result is reported as a lower bound (>=).
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


def psnr(mse):
    return 10 * math.log10(1.0 / max(mse, 1e-12))


def save_png(img, path):
    from PIL import Image
    Image.fromarray(np.clip(tonemap(img) * 255, 0, 255).astype(np.uint8)).save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="soft", choices=["soft", "hard"])
    ap.add_argument("--W", type=int, default=270)
    ap.add_argument("--H", type=int, default=480)
    ap.add_argument("--F", type=int, default=48)
    ap.add_argument("--ref-spp", type=int, default=1024)
    ap.add_argument("--evals", type=int, default=5)
    ap.add_argument("--a-spp", default="1,2,4,8,16,32,64")
    ap.add_argument("--out", default="runs/local")
    # B: direct_spp, spp, K, cell, cache_spp[, filter[, spec_K[, spec_spp]]] ; ...
    ap.add_argument("--b", default="2,2,6,0.06,64,2.5,4,2;4,4,6,0.05,128,2.5,4,4")
    ap.add_argument("--vis-stride", type=int, default=4)
    ap.add_argument("--denoise", action="store_true", help="also score both methods after Intel OIDN (pip install pyoidn)")
    args = ap.parse_args()
    W, H, F = args.W, args.H, args.F
    os.makedirs(args.out, exist_ok=True)
    SPH, BOX, MAT, LGT = T.studio_scene(args.scene)
    CAM = T.camera_path(F, W, H)
    base = sorted(set(int(round(x)) for x in np.linspace(0, F - 1, args.evals)))
    pairs = [(f, f + 1) if f + 1 < F else (f - 1, f) for f in base]
    evf = sorted(set(x for p in pairs for x in p))
    mid = base[len(base) // 2]
    tol = 0.02 * (270 / W) + 0.01
    log = lambda *a: print(*a, flush=True)
    log(f"scene {args.scene}, shot {W}x{H}, {F} frames, eval frames {base} (+ next frame for flicker), threads={T.nb.get_num_threads()}")

    # warm-up: compile every kernel on a tiny problem (compile time is not render time)
    t0 = time.time()
    tc = T.camera_path(3, 8, 8)
    T.render_A(tc, 0, 8, 8, 1, 0, SPH, BOX, MAT, LGT)
    Pw = np.stack([T.gbuffer(tc, f, 8, 8, SPH, BOX, MAT) for f in range(3)])
    T.temporal_past(tc, 1, np.zeros((3, 8, 8, 3), np.float32), Pw, 8, 8, 1, 0.1)
    T.visibility(tc, 3, 8, 8, 2, 1, 0.1, SPH, BOX, MAT)
    C0w = T.fill_cache(np.zeros((1, 3)), np.array([[0.0, 1.0, 0.0]]), np.array([1], np.int64), SPH, BOX, MAT, LGT)
    T.gather_cache(np.zeros((1, 3)), np.array([[0.0, 1.0, 0.0]]), np.array([1], np.int64), np.array([0], np.int64), C0w, 0.1, SPH, BOX, MAT, LGT)
    T.filter_cache(np.array([0], np.int64), C0w, 2.0)
    Pd, Dd = T.direct_buffer(tc, 0, 8, 8, 1, SPH, BOX, MAT, LGT)
    ck, cz = np.array([0], np.int64), np.zeros((1, 3), np.float32)
    Pmw, Smw = T.spec_buffer(tc, 0, 8, 8, 1, 0.1, ck, cz, SPH, BOX, MAT, LGT)
    T.render_B(tc, 1, 3, 8, 8, 1, 1, 0.1, 0.1, np.stack([Pd] * 3), np.stack([Dd] * 3), ck, cz, SPH, BOX, MAT, LGT, 1, 0.05, np.stack([Pmw] * 3), np.stack([Smw] * 3))
    T.aux_buffers(tc, 0, 8, 8, 1, SPH, BOX, MAT)
    log(f"compiled kernels in {time.time() - t0:.1f}s (excluded)")

    # ── reference (cached on disk per scene/size) ──
    ref_file = os.path.join(args.out, f"ref_{args.scene}_{W}x{H}_F{F}_s{args.ref_spp}.npz")
    REF = {int(k): v for k, v in np.load(ref_file).items()} if os.path.exists(ref_file) else {}
    for f in evf:
        if f not in REF:
            t0 = time.time()
            REF[f] = T.render_A(CAM, f, W, H, args.ref_spp, 999_983, SPH, BOX, MAT, LGT)
            log(f"  ref frame {f}: {time.time() - t0:.1f}s")
            np.savez_compressed(ref_file, **{str(k): v for k, v in REF.items()})
    TR = {f: tonemap(REF[f]) for f in evf}

    def quality(imgs):
        mse = np.mean([np.mean((tonemap(imgs[f]) - TR[f]) ** 2) for f in evf])
        rel = np.mean([np.mean((imgs[f] - REF[f]) ** 2 / (REF[f] ** 2 + 1e-2)) for f in evf])
        tmse = np.mean([np.mean(((tonemap(imgs[b]) - tonemap(imgs[a])) - (TR[b] - TR[a])) ** 2) for a, b in pairs])
        per = [psnr(np.mean((tonemap(imgs[f]) - TR[f]) ** 2)) for f in base]
        return {"psnr": psnr(mse), "tpsnr": psnr(tmse), "relmse": float(rel), "per_frame_psnr": per}

    dn = None
    aux_sec = 0.0
    if args.denoise:
        import pyoidn
        AUX = {}
        t1 = time.time()
        for f in evf:
            AUX[f] = T.aux_buffers(CAM, f, W, H, 8, SPH, BOX, MAT)
        aux_sec = (time.time() - t1) / len(evf)  # charged to BOTH methods, per frame

        def dn(img, f):
            a, n = AUX[f]
            return pyoidn.denoise(np.ascontiguousarray(img, np.float32), albedo=a, normal=n, hdr=True)

        dn(REF[evf[0]], evf[0])  # initialise the device once (excluded)
        log("denoiser: Intel OIDN via pyoidn (albedo + normal guides)")

    def with_dn(imgs, render_sec_per_frame):
        t1 = time.time()
        d = {f: dn(imgs[f], f) for f in evf}
        dsec = (time.time() - t1) / len(evf) + aux_sec
        q = quality(d)
        q["shot_sec"] = render_sec_per_frame * F + dsec * F
        return q, d

    fmt = lambda q: f"PSNR {q['psnr']:.2f}  flicker-tPSNR {q['tpsnr']:.2f}  relMSE {q['relmse']:.5f}"
    res = {"shot": {"scene": args.scene, "W": W, "H": H, "F": F, "eval_frames": base, "pairs": pairs, "ref_spp": args.ref_spp}, "A0": [], "A1": [], "B": []}

    # ── A0: per-frame path tracing (frames are independent, so cost = per-frame time x F) ──
    for spp in [int(x) for x in args.a_spp.split(",")]:
        t0 = time.time()
        imgs = {f: T.render_A(CAM, f, W, H, spp, 0, SPH, BOX, MAT, LGT) for f in evf}
        per_frame = (time.time() - t0) / len(evf)
        row = {"spp": spp, "sec_per_frame": per_frame, "shot_sec": per_frame * F, **quality(imgs)}
        log(f"A0 spp={spp:3d}  shot {row['shot_sec']:7.1f}s  {fmt(row)}")
        if spp in (4, 16):
            save_png(imgs[mid], os.path.join(args.out, f"A0_spp{spp}.png"))
        if dn:
            row["dn"], d = with_dn(imgs, per_frame)
            log(f"   +OIDN   shot {row['dn']['shot_sec']:7.1f}s  {fmt(row['dn'])}")
            if spp in (1, 4, 16):
                save_png(d[mid], os.path.join(args.out, f"A0_spp{spp}_oidn.png"))
        res["A0"].append(row)

    # ── A1: per-frame + past-only temporal reuse (game-style) ──
    for spp, K in [(1, 8), (4, 8)]:
        t0 = time.time()
        A = np.stack([T.render_A(CAM, f, W, H, spp, 0, SPH, BOX, MAT, LGT) for f in range(F)])
        P = np.stack([T.gbuffer(CAM, f, W, H, SPH, BOX, MAT) for f in range(F)])
        outs = {f: T.temporal_past(CAM, f, A, P, W, H, K, tol) for f in evf}
        sec = (time.time() - t0) + 0.0  # temporal_past on eval frames only: negligible vs rendering
        row = {"spp": spp, "K_past": K, "shot_sec": sec, **quality(outs)}
        res["A1"].append(row)
        log(f"A1 spp={spp} past K={K}  shot {sec:7.1f}s  {fmt(row)}")
        del A, P

    # ── B: shot compiler ──
    for cfg in args.b.split(";"):
        parts = cfg.split(",")
        nd, spp, K, h, ns = int(parts[0]), int(parts[1]), int(parts[2]), float(parts[3]), int(parts[4])
        filt = float(parts[5]) if len(parts) > 5 else 0.0
        Ks = int(parts[6]) if len(parts) > 6 else 0
        nspec = int(parts[7]) if len(parts) > 7 else 4
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
        C0 = T.fill_cache(cpos, cnrm, np.full(len(ukeys), max(8, ns // 8), dtype=np.int64), SPH, BOX, MAT, LGT)
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
        for f in range(F):  # B renders EVERY frame: its cost is the real whole-shot cost
            img, m = T.render_B(CAM, f, F, W, H, spp, K, tol, h, Ps, Ds, ukeys, C, SPH, BOX, MAT, LGT, Ks, math.radians(3.0), Pm, Sm)
            miss += m
            if f in evf:
                outs[f] = img
        tm["final_frames"] = time.time() - t1
        sec = time.time() - t0
        row = {"cfg": cfg, "cells": int(len(ukeys)), "cache_misses": int(miss), "shot_sec": sec, "stages": {k: round(v, 2) for k, v in tm.items()}, **quality(outs)}
        log(f"B {cfg}: shot {sec:7.1f}s {row['stages']}  {fmt(row)}")
        tag = cfg.replace(",", "_")
        save_png(outs[mid], os.path.join(args.out, f"B_{tag}.png"))
        if dn:
            row["dn"], d = with_dn(outs, sec / F)
            log(f"   +OIDN   shot {row['dn']['shot_sec']:7.1f}s  {fmt(row['dn'])}")
            save_png(d[mid], os.path.join(args.out, f"B_{tag}_oidn.png"))
        res["B"].append(row)
        del Ps, Ds, Pm, Sm
    save_png(REF[mid], os.path.join(args.out, "REF.png"))

    # ── equal quality: cheapest MEASURED A0 setting that reaches B's quality ──
    def a0_cost_for(target, metric, key):
        prev = None
        for r in res["A0"]:  # ascending spp
            q = (r[key] if key else r)
            if q[metric] >= target:
                if prev is None:
                    return q["shot_sec"], "<="
                u = (target - prev[metric]) / max(q[metric] - prev[metric], 1e-9)
                return math.exp(math.log(prev["shot_sec"]) + u * (math.log(q["shot_sec"]) - math.log(prev["shot_sec"]))), "="
            prev = q
        return max((r[key] if key else r)["shot_sec"] for r in res["A0"]), ">="

    log("\n=== EQUAL-QUALITY COMPUTE (A0 cost to match B / B cost) ===")
    for row in res["B"]:
        for key in ([None, "dn"] if dn else [None]):
            b = row[key] if key else row
            b["equal"] = {}
            for metric in ("psnr", "tpsnr"):
                cost, rel = a0_cost_for(b[metric], metric, key)
                b["equal"][metric] = {"a0_sec": cost, "ratio": cost / b["shot_sec"], "relation": rel}
            e = b["equal"]
            log(f"B {row['cfg']} [{'denoised' if key else 'raw'}]: per-frame accuracy {e['psnr']['relation']}{e['psnr']['ratio']:.1f}x · "
                f"flicker {e['tpsnr']['relation']}{e['tpsnr']['ratio']:.1f}x   (B {b['shot_sec']:.0f}s)")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump(res, fh, indent=1)
    log(f"wrote {args.out}/results.json")


if __name__ == "__main__":
    main()
