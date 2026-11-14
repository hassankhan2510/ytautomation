"""
ELASTIC WORLD — imagined geometry is not frozen at the moment it is lifted.

Every lifted region e keeps one smooth CORRECTION FIELD l_e(x, y) on a coarse G x G grid: its points
sit at disparity  d = dhat * (1 + l_e(u)),  where dhat is the disparity it was lifted with. (A first
attempt used free scale+shift fields; the joint solve found a degenerate "flatten everything"
solution. Drift is mostly scale, so one multiplicative field per region is the well-posed choice.)

Each later generation event j runs the depth network on a frame that also SHOWS older imagined
regions (rendered from the state). A wrongly placed wall looks bent from the new viewpoint and the
depth network reads that, so every covered pixel p of event j showing point i (lifted by event k) is
a constraint linking region j and region k:

    dhat_j(p) * (1 + l_j(p))  =  1 / z_j(P_i),    P_i = o_k + w_i / (dhat_i (1 + l_k(u_i)))

Gauss-Newton over the fields of the last K regions (older regions and the first view are fixed =
gauge), with membrane smoothness and a prior l ~ 0. Then every point of those regions slides along
its own camera ray. Cost: one small sparse least-squares solve per generation event.
"""
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla


def bilinear(xs, ys, W, H, G):
    gx = xs / (W - 1) * (G - 1)
    gy = ys / (H - 1) * (G - 1)
    x0 = np.clip(np.floor(gx).astype(int), 0, G - 2)
    y0 = np.clip(np.floor(gy).astype(int), 0, G - 2)
    fx, fy = gx - x0, gy - y0
    idx = np.stack([y0 * G + x0, y0 * G + x0 + 1, (y0 + 1) * G + x0, (y0 + 1) * G + x0 + 1])
    w = np.stack([(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy])
    return idx, w


class ElasticWorld:
    def __init__(self, CAM, W, H, G=8, lam=4.0, prior=0.5, nobs=3000):
        self.CAM, self.W, self.H, self.G = CAM, W, H, G
        self.lam, self.prior, self.nobs = lam, prior, nobs
        self.ev = []   # per region: {"f": frame, "L": G x G correction field}
        self.obs = []  # per event: (pix x, pix y, dhat_j at those pixels, observed point index)

    def ray(self, f, xs, ys):
        th = self.CAM[f, 12]
        asp = self.W / self.H
        u = ((xs + 0.5) / self.W * 2 - 1) * th * asp
        v = (1 - (ys + 0.5) / self.H * 2) * th
        c = self.CAM[f]
        return c[None, 3:6] + u[:, None] * c[None, 6:9] + v[:, None] * c[None, 9:12]

    def field_at(self, e, xs, ys):
        idx, w = bilinear(xs, ys, self.W, self.H, self.G)
        return (w * self.ev[e]["L"].ravel()[idx]).sum(0), idx, w

    def add_event(self, f, dhat_full, idx_map, rng):
        ys, xs = np.nonzero(idx_map >= 0)
        if len(ys) > self.nobs:
            k = rng.choice(len(ys), self.nobs, replace=False)
            ys, xs = ys[k], xs[k]
        self.ev.append({"f": f, "L": np.zeros((self.G, self.G))})
        self.obs.append((xs.astype(np.float64), ys.astype(np.float64), dhat_full[ys, xs].astype(np.float64), idx_map[ys, xs]))
        return len(self.ev) - 1

    def positions(self, e, ppx, ppy, pdh, ip):
        l, _, _ = self.field_at(e, ppx[ip], ppy[ip])
        d = np.maximum(pdh[ip] * (1 + l), 1e-3)
        f = self.ev[e]["f"]
        return self.CAM[f, 0:3][None] + (1.0 / d)[:, None] * self.ray(f, ppx[ip], ppy[ip])

    def solve(self, pev, ppx, ppy, pdh, P, window, iters=3):
        G, G2 = self.G, self.G * self.G
        nE = len(self.ev)
        var = list(range(max(0, nE - window), nE))
        if not var:
            return P, 0.0
        col = {e: i for i, e in enumerate(var)}
        nU = len(var) * G2
        P = P.copy()
        moved = 0.0
        for _ in range(iters):
            rows, cols, vals, rhs = [], [], [], []
            r = 0
            for j in var:
                xs, ys, dhj, pi = self.obs[j]
                if not len(pi):
                    continue
                cj = self.CAM[self.ev[j]["f"]]
                lj, idx_j, w_j = self.field_at(j, xs, ys)
                n = len(pi)
                rr = np.arange(r, r + n)
                for t in range(4):
                    rows.append(rr); cols.append(col[j] * G2 + idx_j[t]); vals.append(dhj * w_j[t])
                # rhs for fixed observed points: g0 - dhat_j
                a_ = (P[pi] - cj[None, 0:3]) @ cj[3:6]
                g0 = 1.0 / np.maximum(a_, 1e-4)
                rhs_j = g0 - dhj
                k_of = pev[pi]
                for kk in np.unique(k_of):
                    if kk not in col or kk == j:
                        continue
                    s2 = np.nonzero(k_of == kk)[0]
                    ip = pi[s2]
                    ck = self.CAM[self.ev[kk]["f"]]
                    lk, idx_k, w_k = self.field_at(kk, ppx[ip], ppy[ip])
                    d0 = np.maximum(pdh[ip] * (1 + lk), 1e-3)
                    wv = self.ray(self.ev[kk]["f"], ppx[ip], ppy[ip])
                    A = (ck[0:3] - cj[0:3]) @ cj[3:6]
                    B = wv @ cj[3:6]
                    den = np.maximum(A * d0 + B, 1e-6)
                    gd, gp = d0 / den, B / den ** 2
                    for t in range(4):
                        rows.append(r + s2); cols.append(col[kk] * G2 + idx_k[t]); vals.append(-gp * pdh[ip] * w_k[t])
                    rhs_j[s2] = gd - dhj[s2] - gp * pdh[ip] * lk
                rhs.append(rhs_j)
                r += n
            # membrane smoothness + prior l ~ 0, scaled to the data magnitude
            scale = float(np.median(np.concatenate([o[2] for o in self.obs if len(o[2])]))) if r else 1.0
            for e in var:
                base = col[e] * G2
                for a in range(G):
                    for b in range(G):
                        i = a * G + b
                        for jn in ((i + 1) if b + 1 < G else -1, (i + G) if a + 1 < G else -1):
                            if jn < 0:
                                continue
                            rows += [np.array([r]), np.array([r])]
                            cols += [np.array([base + i]), np.array([base + jn])]
                            vals += [np.array([self.lam * scale]), np.array([-self.lam * scale])]
                            rhs.append(np.array([0.0]))
                            r += 1
                rows.append(np.arange(r, r + G2)); cols.append(base + np.arange(G2)); vals.append(np.full(G2, self.prior * scale))
                rhs.append(np.zeros(G2))
                r += G2
            A_ = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(r, nU))
            sol = spla.lsqr(A_, np.concatenate(rhs), atol=1e-10, btol=1e-10, iter_lim=4000)[0]
            for e in var:
                self.ev[e]["L"] = np.clip(sol[col[e] * G2:(col[e] + 1) * G2].reshape(G, G), -0.6, 1.5)
            moved = 0.0
            for e in var:
                ip = np.nonzero(pev == e)[0]
                if len(ip):
                    newP = self.positions(e, ppx, ppy, pdh, ip)
                    moved += float(np.mean(np.linalg.norm(newP - P[ip], axis=1)))
                    P[ip] = newP
        return P, moved
