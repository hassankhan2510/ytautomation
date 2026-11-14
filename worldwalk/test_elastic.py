"""Unit test for the elastic world: each imagined region is lifted with a WRONG scale c_e (0.8..1.3);
the depth net (here: perfect) sees later views. The joint solve must pull points back to the truth."""
import numpy as np, ww, tracer as T
from elastic import ElasticWorld
W = H = 128; F = 40
SPH, BOX, MAT, LGT = T.studio_scene("hard"); CAM = ww.walk_loop(F)
rng = np.random.default_rng(0)
EW = ElasticWorld(CAM, W, H, G=6, lam=2.0, prior=0.05)
P = np.zeros((0, 3)); Pt = []; pev = []; ppx = []; ppy = []; pdh = []
for k, (f, c) in enumerate([(2, 1.0), (4, 1.25), (6, 0.8), (8, 1.3), (10, 0.9), (12, 1.15)]):
    z = ww.gt_frame(CAM, f, W, H, SPH, BOX, MAT, LGT)[1]; fin = np.isfinite(z)
    dfull = np.where(fin, c / np.maximum(z, 1e-6), 1e-3)   # this region's (wrong) lift disparity
    Im = ww.splat(P, np.zeros((len(P), 3), np.float32), np.full(len(P), 0.02), CAM, f, W, H, np.ones(len(P)))[4] if len(P) else np.full((H, W), -1, np.int64)
    if k:
        eid = EW.add_event(f, dfull, Im, rng)
    ys, xs = np.nonzero(fin); s = rng.choice(len(ys), 1500, replace=False); ys, xs = ys[s], xs[s]
    ray = EW.ray(f, xs.astype(float), ys.astype(float))
    P = np.vstack([P, CAM[f, 0:3][None] + (1 / dfull[ys, xs])[:, None] * ray]); Pt.append(CAM[f, 0:3][None] + z[ys, xs][:, None] * ray)
    pev.append(np.full(len(xs), eid if k else -1)); ppx.append(xs.astype(float)); ppy.append(ys.astype(float)); pdh.append(dfull[ys, xs])
Pt = np.vstack(Pt); pev = np.concatenate(pev); ppx = np.concatenate(ppx); ppy = np.concatenate(ppy); pdh = np.concatenate(pdh)
err = lambda P: np.median(np.linalg.norm(P - Pt, axis=1) / np.linalg.norm(Pt - CAM[2, 0:3], axis=1))
print("before: median relative point error", round(err(P), 4))
for it in range(4):
    P, mv = EW.solve(pev, ppx, ppy, pdh, P, window=5, iters=1)
    print(f"solve {it}: error {err(P):.4f}   implied scale per region {[round(float(1 / (1 + e['L'].mean())), 3) for e in EW.ev]}  (truth 1.25 0.8 1.3 0.9 1.15)")

print("\n-- diagnostics --")
for e in range(len(EW.ev)):
    xs, ys, dhj, pi = EW.obs[e]
    cj = CAM[EW.ev[e]["f"]]
    g0_true = 1.0 / ((Pt[pi] - cj[None, 0:3]) @ cj[3:6])
    print(f"region {e} (frame {EW.ev[e]['f']}): obs {len(pi)}, of which old-region pts {np.bincount(pev[pi] + 1, minlength=7)[:7]} ; "
          f"median true-disp / dhat = {np.median(g0_true / dhj):.3f} (expect 1/c)")
