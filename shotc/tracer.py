"""
shotc — SHOT COMPILER benchmark, v0 renderer core (CPU-only, numba -> LLVM native, all cores).

One physically-based path tracer, used two ways on the SAME shot:
  A  "per-frame"  — every frame path-traced independently (how Cycles / Unreal's path tracer make
                    cinematic frames: the renderer doesn't know the future, so nothing is shared).
  B  "shot-compiled" — the whole camera path is known before rendering, so:
       1. VISIBILITY: find every surface the camera will ever see (cheap primary rays, all frames).
       2. WORLD-SPACE LIGHT CACHE: indirect light on exactly those surfaces is path-traced ONCE for
          the whole shot (it is view-independent for diffuse surfaces) and shared by all frames.
       3. BIDIRECTIONAL TEMPORAL REUSE: direct light (also view-independent on diffuse surfaces) is
          sampled per frame, then every pixel averages its own point's samples from frames t-K..t+K
          (past AND future — only possible offline, when the future is known).
     View-dependent light (metal reflections) is still traced per frame.

Scene: a closed studio (indirect light dominates — the hard case), pedestal, gold metal sphere,
coloured spheres, one small ceiling softbox. All geometry in arrays; nothing is faked.
"""
import math

import numba as nb
import numpy as np

EPS = 1e-4
INF = 1e30

# material table: r, g, b, type (0 diffuse, 1 metal, 2 light, 3 glass), fuzz (metal) / IOR (glass)
DIFFUSE, METAL, LIGHT, GLASS = 0, 1, 2, 3


def studio_scene(kind="soft"):
    """soft: big softbox (easy for 1-spp + denoiser). hard: same power from a softbox 25x smaller
    (sharp shadows, much noisier indirect) + a glass ball that throws a caustic on the floor."""
    MAT = np.array([
        [0.80, 0.78, 0.74, DIFFUSE, 0.0],  # 0 warm white walls
        [0.15, 0.55, 0.55, DIFFUSE, 0.0],  # 1 teal wall
        [0.75, 0.30, 0.20, DIFFUSE, 0.0],  # 2 terracotta wall
        [0.85, 0.85, 0.85, DIFFUSE, 0.0],  # 3 pedestal
        [1.00, 0.78, 0.35, METAL, 0.12],   # 4 gold product
        [0.80, 0.15, 0.20, DIFFUSE, 0.0],  # 5 red ball
        [0.15, 0.30, 0.85, DIFFUSE, 0.0],  # 6 blue ball
        [0.00, 0.00, 0.00, LIGHT, 0.0],    # 7 softbox
        [0.40, 0.38, 0.36, DIFFUSE, 0.0],  # 8 floor
    ])
    T = 0.2  # wall thickness
    BOX = np.array([
        [-3, -T, -3, 3, 0, 3, 8],          # floor
        [-3, 4, -3, 3, 4 + T, 3, 0],       # ceiling
        [-3, 0, -3 - T, 3, 4, -3, 0],      # back wall
        [-3, 0, 3, 3, 4, 3 + T, 0],        # front wall
        [-3 - T, 0, -3, -3, 4, 3, 1],      # left wall (teal)
        [3, 0, -3, 3 + T, 4, 3, 2],        # right wall (terracotta)
        [-0.55, 0, -0.55, 0.55, 0.8, 0.55, 3],  # pedestal
        [-0.6, 3.97, -0.6, 0.6, 4.0, 0.6, 7],   # softbox (emitter)
    ], dtype=np.float64)
    SPH = np.array([
        [0.0, 1.25, 0.0, 0.45, 4],
        [-1.4, 0.35, 0.9, 0.35, 5],
        [1.3, 0.3, -0.8, 0.3, 6],
    ], dtype=np.float64)
    # light: x0, x1, z0, z1, y (emitting downward), Le r g b
    LGT = np.array([-0.6, 0.6, -0.6, 0.6, 3.97, 28.0, 25.0, 21.0])
    if kind == "hard":
        MAT = np.vstack([MAT, [[0.98, 0.98, 0.98, GLASS, 1.5]]])  # 9 glass
        SPH = np.vstack([SPH, [[0.95, 0.32, 0.85, 0.32, 9]]])
        a = 0.12  # light half-size: 0.24 x 0.24 instead of 1.2 x 1.2, same total power
        BOX[7] = [-a, 3.97, -a, a, 4.0, a, 7]
        k = (0.6 / a) ** 2
        LGT = np.array([-a, a, -a, a, 3.97, 28.0 * k, 25.0 * k, 21.0 * k])
    return SPH, BOX, MAT, LGT


def camera_path(F, W, H, fov_deg=62.0):
    """Orbit + slow push-in around the product. Returns CAM[F, 13]: pos, fwd, right, up, tan(half fov)."""
    CAM = np.zeros((F, 13))
    tgt = np.array([0.0, 1.05, 0.0])
    for f in range(F):
        a = math.radians(-35 + 70 * f / max(1, F - 1))
        r = 2.85 - 0.35 * f / max(1, F - 1)
        pos = np.array([r * math.sin(a), 1.65, r * math.cos(a)])
        fwd = tgt - pos
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, [0.0, 1.0, 0.0])
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        CAM[f] = [*pos, *fwd, *right, *up, math.tan(math.radians(fov_deg) / 2)]
    return CAM


# ───────────────────────── RNG (xorshift64, splitmix seeding) ─────────────────────────
@nb.njit(inline="always")
def seed(a, b, c):
    z = np.uint64(a) * np.uint64(0x9E3779B97F4A7C15) ^ np.uint64(b) * np.uint64(0xBF58476D1CE4E5B9) ^ np.uint64(c) * np.uint64(0x94D049BB133111EB)
    z = (z ^ (z >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
    z = (z ^ (z >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
    z = z ^ (z >> np.uint64(31))
    return z | np.uint64(1)


@nb.njit(inline="always")
def nxt(s):
    s ^= s << np.uint64(13)
    s ^= s >> np.uint64(7)
    s ^= s << np.uint64(17)
    return s


@nb.njit(inline="always")
def u01(s):
    return float(s >> np.uint64(11)) * (1.0 / 9007199254740992.0)


# ───────────────────────── geometry ─────────────────────────
@nb.njit(inline="always")
def hit_scene(ox, oy, oz, dx, dy, dz, tmax, SPH, BOX):
    best = tmax
    mat = -1
    nx = ny = nz = 0.0
    for i in range(SPH.shape[0]):
        cx, cy, cz, r = SPH[i, 0], SPH[i, 1], SPH[i, 2], SPH[i, 3]
        lx, ly, lz = ox - cx, oy - cy, oz - cz
        b = lx * dx + ly * dy + lz * dz
        c = lx * lx + ly * ly + lz * lz - r * r
        disc = b * b - c
        if disc > 0.0:
            sq = math.sqrt(disc)
            t = -b - sq
            if t < EPS:
                t = -b + sq
            if EPS < t < best:
                best = t
                mat = int(SPH[i, 4])
                nx, ny, nz = (lx + t * dx) / r, (ly + t * dy) / r, (lz + t * dz) / r
    ix = 1.0 / dx if dx != 0.0 else INF
    iy = 1.0 / dy if dy != 0.0 else INF
    iz = 1.0 / dz if dz != 0.0 else INF
    for i in range(BOX.shape[0]):
        t0x, t1x = (BOX[i, 0] - ox) * ix, (BOX[i, 3] - ox) * ix
        t0y, t1y = (BOX[i, 1] - oy) * iy, (BOX[i, 4] - oy) * iy
        t0z, t1z = (BOX[i, 2] - oz) * iz, (BOX[i, 5] - oz) * iz
        ax, bx = min(t0x, t1x), max(t0x, t1x)
        ay, by = min(t0y, t1y), max(t0y, t1y)
        az, bz = min(t0z, t1z), max(t0z, t1z)
        tn = max(ax, ay, az)
        tf = min(bx, by, bz)
        if tn <= tf and tn > EPS and tn < best:
            best = tn
            mat = int(BOX[i, 6])
            if tn == ax:
                nx, ny, nz = (-1.0 if dx > 0 else 1.0), 0.0, 0.0
            elif tn == ay:
                nx, ny, nz = 0.0, (-1.0 if dy > 0 else 1.0), 0.0
            else:
                nx, ny, nz = 0.0, 0.0, (-1.0 if dz > 0 else 1.0)
    return best, mat, nx, ny, nz


@nb.njit(inline="always")
def onb_dir(nx, ny, nz, a, b, c):
    """local (a,b,c) with c along n -> world"""
    if abs(nx) > 0.9:
        tx, ty, tz = 0.0, 1.0, 0.0
    else:
        tx, ty, tz = 1.0, 0.0, 0.0
    # u = normalize(t x n)
    ux, uy, uz = ty * nz - tz * ny, tz * nx - tx * nz, tx * ny - ty * nx
    l = math.sqrt(ux * ux + uy * uy + uz * uz)
    ux, uy, uz = ux / l, uy / l, uz / l
    vx, vy, vz = ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux
    return a * ux + b * vx + c * nx, a * uy + b * vy + c * ny, a * uz + b * vz + c * nz


@nb.njit(inline="always")
def cos_sample(nx, ny, nz, s):
    s = nxt(s)
    r1 = u01(s)
    s = nxt(s)
    r2 = u01(s)
    phi = 2.0 * math.pi * r1
    sr = math.sqrt(r2)
    dx, dy, dz = onb_dir(nx, ny, nz, math.cos(phi) * sr, math.sin(phi) * sr, math.sqrt(max(0.0, 1.0 - r2)))
    return dx, dy, dz, s


@nb.njit(inline="always")
def direct(px, py, pz, nx, ny, nz, s, SPH, BOX, MAT, LGT):
    """One NEE sample of the softbox. Returns irradiance/pi (so Lo_diffuse = albedo * this)."""
    s = nxt(s)
    lx = LGT[0] + (LGT[1] - LGT[0]) * u01(s)
    s = nxt(s)
    lz = LGT[2] + (LGT[3] - LGT[2]) * u01(s)
    ly = LGT[4]
    wx, wy, wz = lx - px, ly - py, lz - pz
    d2 = wx * wx + wy * wy + wz * wz
    d = math.sqrt(d2)
    wx, wy, wz = wx / d, wy / d, wz / d
    cs = wx * nx + wy * ny + wz * nz
    cl = wy  # light faces down (-y); cos at light = dot(-w, -y) = wy
    if cs <= 0.0 or cl <= 0.0:
        return 0.0, 0.0, 0.0, s
    t, m, _, _, _ = hit_scene(px + nx * EPS, py + ny * EPS, pz + nz * EPS, wx, wy, wz, d - 1e-3, SPH, BOX)
    if m != -1 and int(MAT[m, 3]) != LIGHT:
        return 0.0, 0.0, 0.0, s
    area = (LGT[1] - LGT[0]) * (LGT[3] - LGT[2])
    g = cs * cl * area / (math.pi * d2)
    return LGT[5] * g, LGT[6] * g, LGT[7] * g, s


@nb.njit(inline="always")
def metal_dir(dx, dy, dz, nx, ny, nz, fuzz, s):
    dn = dx * nx + dy * ny + dz * nz
    rx, ry, rz = dx - 2 * dn * nx, dy - 2 * dn * ny, dz - 2 * dn * nz
    while True:
        s = nxt(s)
        a = 2 * u01(s) - 1
        s = nxt(s)
        b = 2 * u01(s) - 1
        s = nxt(s)
        c = 2 * u01(s) - 1
        if a * a + b * b + c * c <= 1.0:
            break
    rx, ry, rz = rx + fuzz * a, ry + fuzz * b, rz + fuzz * c
    l = math.sqrt(rx * rx + ry * ry + rz * rz)
    return rx / l, ry / l, rz / l, s


@nb.njit(inline="always")
def scatter(dx, dy, dz, nx, ny, nz, m, MAT, s):
    """Specular event at a METAL or GLASS surface. Returns new direction, throughput tint, the offset
    normal for the next ray origin, ok flag, rng. Glass: Fresnel (Schlick) chooses reflect vs refract,
    total internal reflection handled; the sphere normal always points outward."""
    if int(MAT[m, 3]) == METAL:
        rx, ry, rz, s = metal_dir(dx, dy, dz, nx, ny, nz, MAT[m, 4], s)
        ok = rx * nx + ry * ny + rz * nz > 0.0
        return rx, ry, rz, MAT[m, 0], MAT[m, 1], MAT[m, 2], nx, ny, nz, ok, s
    ior = MAT[m, 4]
    c = -(dx * nx + dy * ny + dz * nz)
    if c > 0.0:  # entering
        eta, fx, fy, fz = 1.0 / ior, nx, ny, nz
    else:  # leaving
        eta, fx, fy, fz, c = ior, -nx, -ny, -nz, -c
    k = 1.0 - eta * eta * (1.0 - c * c)
    r0 = ((1.0 - ior) / (1.0 + ior)) ** 2
    fres = r0 + (1.0 - r0) * (1.0 - c) ** 5
    s = nxt(s)
    if k < 0.0 or u01(s) < fres:  # reflect
        rx, ry, rz = dx + 2 * c * fx, dy + 2 * c * fy, dz + 2 * c * fz
        return rx, ry, rz, 1.0, 1.0, 1.0, fx, fy, fz, True, s
    sk = math.sqrt(k)
    rx, ry, rz = eta * dx + (eta * c - sk) * fx, eta * dy + (eta * c - sk) * fy, eta * dz + (eta * c - sk) * fz
    l = math.sqrt(rx * rx + ry * ry + rz * rz)
    return rx / l, ry / l, rz / l, MAT[m, 0], MAT[m, 1], MAT[m, 2], -fx, -fy, -fz, True, s


@nb.njit(inline="always")
def is_spec(typ):
    return typ == METAL or typ == GLASS


@nb.njit(cache=True)
def radiance(ox, oy, oz, dx, dy, dz, s, count_emit, maxd, SPH, BOX, MAT, LGT):
    """Unbiased path tracer with next-event estimation. count_emit=False skips light seen directly
    by a diffuse bounce (that energy is already counted by NEE / by the caller)."""
    tr, tg, tb = 1.0, 1.0, 1.0
    Lr = Lg = Lb = 0.0
    for depth in range(maxd):
        t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
        if m < 0:
            break
        typ = int(MAT[m, 3])
        if typ == LIGHT:
            if count_emit:
                Lr += tr * LGT[5]
                Lg += tg * LGT[6]
                Lb += tb * LGT[7]
            break
        px, py, pz = ox + t * dx, oy + t * dy, oz + t * dz
        ar, ag, ab = MAT[m, 0], MAT[m, 1], MAT[m, 2]
        if typ == DIFFUSE:
            er, eg, eb, s = direct(px, py, pz, nx, ny, nz, s, SPH, BOX, MAT, LGT)
            Lr += tr * ar * er
            Lg += tg * ag * eg
            Lb += tb * ab * eb
            dx, dy, dz, s = cos_sample(nx, ny, nz, s)
            count_emit = False
        else:
            dx, dy, dz, ar, ag, ab, nx, ny, nz, ok, s = scatter(dx, dy, dz, nx, ny, nz, m, MAT, s)
            if not ok:
                break
            count_emit = True
        tr, tg, tb = tr * ar, tg * ag, tb * ab
        ox, oy, oz = px + nx * EPS, py + ny * EPS, pz + nz * EPS
        if depth >= 2:
            p = max(tr, tg, tb)
            s = nxt(s)
            if u01(s) > p:
                break
            tr, tg, tb = tr / p, tg / p, tb / p
    return Lr, Lg, Lb, s


@nb.njit(inline="always")
def cam_ray(CAM, f, x, y, W, H):
    asp = W / H
    th = CAM[f, 12]
    u = (x / W * 2.0 - 1.0) * th * asp
    v = (1.0 - y / H * 2.0) * th
    dx = CAM[f, 3] + u * CAM[f, 6] + v * CAM[f, 9]
    dy = CAM[f, 4] + u * CAM[f, 7] + v * CAM[f, 10]
    dz = CAM[f, 5] + u * CAM[f, 8] + v * CAM[f, 11]
    l = math.sqrt(dx * dx + dy * dy + dz * dz)
    return CAM[f, 0], CAM[f, 1], CAM[f, 2], dx / l, dy / l, dz / l


@nb.njit(inline="always")
def project(CAM, f, px, py, pz, W, H):
    vx, vy, vz = px - CAM[f, 0], py - CAM[f, 1], pz - CAM[f, 2]
    z = vx * CAM[f, 3] + vy * CAM[f, 4] + vz * CAM[f, 5]
    if z <= 1e-6:
        return -1, -1
    asp = W / H
    th = CAM[f, 12]
    u = (vx * CAM[f, 6] + vy * CAM[f, 7] + vz * CAM[f, 8]) / (z * th * asp)
    v = (vx * CAM[f, 9] + vy * CAM[f, 10] + vz * CAM[f, 11]) / (z * th)
    x = int((u + 1.0) * 0.5 * W)
    y = int((1.0 - v) * 0.5 * H)
    if x < 0 or x >= W or y < 0 or y >= H:
        return -1, -1
    return x, y


# ───────────────────────── A: per-frame path tracing ─────────────────────────
@nb.njit(parallel=True, fastmath=True, cache=True)
def render_A(CAM, f, W, H, spp, salt, SPH, BOX, MAT, LGT):
    img = np.zeros((H, W, 3), dtype=np.float32)
    for y in nb.prange(H):
        for x in range(W):
            s = seed(f * 7919 + salt, y * W + x, 0xA)
            r = g = b = 0.0
            for k in range(spp):
                s = nxt(s)
                jx = u01(s)
                s = nxt(s)
                jy = u01(s)
                ox, oy, oz, dx, dy, dz = cam_ray(CAM, f, x + jx, y + jy, W, H)
                lr, lg, lb, s = radiance(ox, oy, oz, dx, dy, dz, s, True, 8, SPH, BOX, MAT, LGT)
                r += lr
                g += lg
                b += lb
            img[y, x, 0], img[y, x, 1], img[y, x, 2] = r / spp, g / spp, b / spp
    return img


@nb.njit(parallel=True, fastmath=True, cache=True)
def gbuffer(CAM, f, W, H, SPH, BOX, MAT):
    """pixel-centre world position of DIFFUSE hits (inf elsewhere)"""
    P = np.full((H, W, 3), np.inf, dtype=np.float32)
    for y in nb.prange(H):
        for x in range(W):
            ox, oy, oz, dx, dy, dz = cam_ray(CAM, f, x + 0.5, y + 0.5, W, H)
            t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
            if m >= 0 and int(MAT[m, 3]) == DIFFUSE:
                P[y, x, 0], P[y, x, 1], P[y, x, 2] = ox + t * dx, oy + t * dy, oz + t * dz
    return P


@nb.njit(parallel=True, fastmath=True, cache=True)
def temporal_past(CAM, t, Aimgs, Ps, W, H, K, tol):
    """Game-style baseline (A1): average each diffuse pixel with its reprojection in the PAST K frames."""
    out = Aimgs[t].copy()
    for y in nb.prange(H):
        for x in range(W):
            px, py, pz = Ps[t, y, x, 0], Ps[t, y, x, 1], Ps[t, y, x, 2]
            if not np.isfinite(px):
                continue
            r, g, b, n = 0.0, 0.0, 0.0, 0
            for k in range(max(0, t - K), t + 1):
                xx, yy = project(CAM, k, px, py, pz, W, H)
                if xx < 0:
                    continue
                qx, qy, qz = Ps[k, yy, xx, 0], Ps[k, yy, xx, 1], Ps[k, yy, xx, 2]
                if (qx - px) ** 2 + (qy - py) ** 2 + (qz - pz) ** 2 > tol * tol:
                    continue
                r += Aimgs[k, yy, xx, 0]
                g += Aimgs[k, yy, xx, 1]
                b += Aimgs[k, yy, xx, 2]
                n += 1
            if n:
                out[y, x, 0], out[y, x, 1], out[y, x, 2] = r / n, g / n, b / n
    return out


# ───────────────────────── B: shot compiler ─────────────────────────
@nb.njit(inline="always")
def cell_key(px, py, pz, nx, ny, nz, h):
    ix = int(math.floor(px / h)) + 1024
    iy = int(math.floor(py / h)) + 1024
    iz = int(math.floor(pz / h)) + 1024
    ax, ay, az = abs(nx), abs(ny), abs(nz)
    if ax >= ay and ax >= az:
        bk = 0 if nx > 0 else 1
    elif ay >= az:
        bk = 2 if ny > 0 else 3
    else:
        bk = 4 if nz > 0 else 5
    return ((np.int64(ix) * 2048 + iy) * 2048 + iz) * 8 + bk


@nb.njit(parallel=True, fastmath=True, cache=True)
def visibility(CAM, F, W, H, stride, jit, h, SPH, BOX, MAT):
    """Every surface point the shot will ever show (primary hits + one mirror bounce off metal),
    with jittered cache keys so stochastic lookups find their neighbour cells too."""
    gw, gh = W // stride, H // stride
    n = F * gh * gw * jit * 2
    keys = np.full(n, -1, dtype=np.int64)
    pts = np.zeros((n, 6), dtype=np.float64)
    for idx in nb.prange(F * gh):
        f, gy = idx // gh, idx % gh
        for gx in range(gw):
            s = seed(f, gy * gw + gx, 0x51)
            for j in range(jit):
                s = nxt(s)
                jx = u01(s)
                s = nxt(s)
                jy = u01(s)
                ox, oy, oz, dx, dy, dz = cam_ray(CAM, f, (gx + jx) * stride, (gy + jy) * stride, W, H)
                t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
                for _ in range(6):  # follow reflections/refractions: the surfaces seen through them count too
                    if m < 0 or not is_spec(int(MAT[m, 3])):
                        break
                    px, py, pz = ox + t * dx, oy + t * dy, oz + t * dz
                    dx, dy, dz, _r, _g, _b, fx, fy, fz, ok, s = scatter(dx, dy, dz, nx, ny, nz, m, MAT, s)
                    ox, oy, oz = px + fx * EPS, py + fy * EPS, pz + fz * EPS
                    t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
                if m < 0 or int(MAT[m, 3]) != DIFFUSE:
                    continue
                o = (((idx * gw + gx) * jit) + j) * 2
                for slot in range(2):
                    px, py, pz = ox + t * dx, oy + t * dy, oz + t * dz
                    a = b = c = 0.0
                    if j > 0:  # jittered keys so stochastic lookups find their neighbour cells
                        s = nxt(s)
                        a = (u01(s) - 0.5) * h
                        s = nxt(s)
                        b = (u01(s) - 0.5) * h
                        s = nxt(s)
                        c = (u01(s) - 0.5) * h
                    keys[o + slot] = cell_key(px + a, py + b, pz + c, nx, ny, nz, h)
                    pts[o + slot, 0], pts[o + slot, 1], pts[o + slot, 2] = px, py, pz
                    pts[o + slot, 3], pts[o + slot, 4], pts[o + slot, 5] = nx, ny, nz
                    if slot == 0:  # one diffuse bounce: where the light-cache gather rays will land
                        dx, dy, dz, s = cos_sample(nx, ny, nz, s)
                        ox, oy, oz = px + nx * EPS, py + ny * EPS, pz + nz * EPS
                        t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
                        if m < 0 or int(MAT[m, 3]) != DIFFUSE:
                            break
    return keys, pts


@nb.njit(parallel=True, fastmath=True, cache=True)
def fill_cache(cpos, cnrm, nsamp, SPH, BOX, MAT, LGT):
    """Indirect incident light for every visible cell, path-traced ONCE for the whole shot."""
    n = cpos.shape[0]
    C = np.zeros((n, 3), dtype=np.float32)
    for i in nb.prange(n):
        s = seed(i, 77, 0xCAC4E)
        px, py, pz = cpos[i, 0], cpos[i, 1], cpos[i, 2]
        nx, ny, nz = cnrm[i, 0], cnrm[i, 1], cnrm[i, 2]
        ox, oy, oz = px + nx * EPS * 10, py + ny * EPS * 10, pz + nz * EPS * 10
        r = g = b = 0.0
        for k in range(nsamp[i]):
            dx, dy, dz, s = cos_sample(nx, ny, nz, s)
            lr, lg, lb, s = radiance(ox, oy, oz, dx, dy, dz, s, False, 8, SPH, BOX, MAT, LGT)
            r += lr
            g += lg
            b += lb
        C[i, 0], C[i, 1], C[i, 2] = r / nsamp[i], g / nsamp[i], b / nsamp[i]
    return C


@nb.njit(parallel=True, fastmath=True, cache=True)
def gather_cache(cpos, cnrm, nsamp, ckeys, Cprev, h, SPH, BOX, MAT, LGT):
    """FINAL GATHER: one exact bounce per sample (direct light at the hit is sampled exactly), and
    everything beyond that bounce is read from the coarse cache Cprev. Cheap rays, low variance:
    the deep, smooth part of the light is already averaged once for the whole shot."""
    n = cpos.shape[0]
    C = np.zeros((n, 3), dtype=np.float32)
    for i in nb.prange(n):
        s = seed(i, 91, 0x6A7)
        nx, ny, nz = cnrm[i, 0], cnrm[i, 1], cnrm[i, 2]
        ox, oy, oz = cpos[i, 0] + nx * EPS * 10, cpos[i, 1] + ny * EPS * 10, cpos[i, 2] + nz * EPS * 10
        r = g = b = 0.0
        for k in range(nsamp[i]):
            dx, dy, dz, s = cos_sample(nx, ny, nz, s)
            qx, qy, qz = ox, oy, oz
            tr, tg, tb = 1.0, 1.0, 1.0
            for bounce in range(8):
                t, m, mx, my, mz = hit_scene(qx, qy, qz, dx, dy, dz, INF, SPH, BOX)
                if m < 0:
                    break
                typ = int(MAT[m, 3])
                if typ == LIGHT:
                    if bounce > 0:  # light seen through a mirror chain (not counted by NEE)
                        r += tr * LGT[5]
                        g += tg * LGT[6]
                        b += tb * LGT[7]
                    break
                px, py, pz = qx + t * dx, qy + t * dy, qz + t * dz
                if is_spec(typ):
                    dx, dy, dz, ar, ag, ab, fx, fy, fz, ok, s = scatter(dx, dy, dz, mx, my, mz, m, MAT, s)
                    if not ok:
                        break
                    tr, tg, tb = tr * ar, tg * ag, tb * ab
                    qx, qy, qz = px + fx * EPS, py + fy * EPS, pz + fz * EPS
                    continue
                er, eg, eb, s = direct(px, py, pz, mx, my, mz, s, SPH, BOX, MAT, LGT)
                kk = cell_key(px, py, pz, mx, my, mz, h)
                j = np.searchsorted(ckeys, kk)
                if j < ckeys.shape[0] and ckeys[j] == kk:
                    cr, cg, cb = Cprev[j, 0], Cprev[j, 1], Cprev[j, 2]
                else:  # unseen surface: trace the rest of the path for real (unbiased)
                    ex, ey, ez, s = cos_sample(mx, my, mz, s)
                    cr, cg, cb, s = radiance(px + mx * EPS, py + my * EPS, pz + mz * EPS, ex, ey, ez, s, False, 8, SPH, BOX, MAT, LGT)
                r += tr * MAT[m, 0] * (er + cr)
                g += tg * MAT[m, 1] * (eg + cg)
                b += tb * MAT[m, 2] * (eb + cb)
                break
        C[i, 0], C[i, 1], C[i, 2] = r / nsamp[i], g / nsamp[i], b / nsamp[i]
    return C


@nb.njit(inline="always")
def cache_get(ckeys, C, px, py, pz, nx, ny, nz, h, s, SPH, BOX, MAT, LGT):
    """Stochastic (jittered) cache lookup; a missing cell falls back to one live path sample."""
    s = nxt(s)
    a = (u01(s) - 0.5) * h
    s = nxt(s)
    b = (u01(s) - 0.5) * h
    s = nxt(s)
    c = (u01(s) - 0.5) * h
    k = cell_key(px + a, py + b, pz + c, nx, ny, nz, h)
    i = np.searchsorted(ckeys, k)
    if i < ckeys.shape[0] and ckeys[i] == k:
        return C[i, 0], C[i, 1], C[i, 2], s, 0
    k = cell_key(px, py, pz, nx, ny, nz, h)  # jitter left the visible set: use the point's own cell
    i = np.searchsorted(ckeys, k)
    if i < ckeys.shape[0] and ckeys[i] == k:
        return C[i, 0], C[i, 1], C[i, 2], s, 0
    dx, dy, dz, s = cos_sample(nx, ny, nz, s)
    lr, lg, lb, s = radiance(px + nx * EPS, py + ny * EPS, pz + nz * EPS, dx, dy, dz, s, False, 8, SPH, BOX, MAT, LGT)
    return lr, lg, lb, s, 1


@nb.njit(parallel=True, fastmath=True, cache=True)
def direct_buffer(CAM, f, W, H, nd, SPH, BOX, MAT, LGT):
    """Per frame: pixel-centre diffuse point + its direct light (nd NEE samples). View-independent."""
    P = np.full((H, W, 3), np.inf, dtype=np.float32)
    D = np.zeros((H, W, 3), dtype=np.float32)
    for y in nb.prange(H):
        for x in range(W):
            ox, oy, oz, dx, dy, dz = cam_ray(CAM, f, x + 0.5, y + 0.5, W, H)
            t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
            if m < 0 or int(MAT[m, 3]) != DIFFUSE:
                continue
            px, py, pz = ox + t * dx, oy + t * dy, oz + t * dz
            P[y, x, 0], P[y, x, 1], P[y, x, 2] = px, py, pz
            s = seed(f * 31 + 5, y * W + x, 0xD1)
            r = g = b = 0.0
            for k in range(nd):
                er, eg, eb, s = direct(px, py, pz, nx, ny, nz, s, SPH, BOX, MAT, LGT)
                r += er
                g += eg
                b += eb
            D[y, x, 0], D[y, x, 1], D[y, x, 2] = r / nd, g / nd, b / nd
    return P, D


@nb.njit(inline="always")
def shade_ray(ox, oy, oz, dx, dy, dz, s, h, ckeys, C, SPH, BOX, MAT, LGT):
    """Radiance arriving along a ray, shaded the shot-compiler way: light -> emission, metal -> follow
    the reflection, diffuse -> albedo * (1 NEE sample + cached indirect)."""
    tr, tg, tb = 1.0, 1.0, 1.0
    for bounce in range(8):
        t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
        if m < 0:
            return 0.0, 0.0, 0.0, s
        typ = int(MAT[m, 3])
        if typ == LIGHT:
            return tr * LGT[5], tg * LGT[6], tb * LGT[7], s
        px, py, pz = ox + t * dx, oy + t * dy, oz + t * dz
        if is_spec(typ):
            dx, dy, dz, ar, ag, ab, fx, fy, fz, ok, s = scatter(dx, dy, dz, nx, ny, nz, m, MAT, s)
            if not ok:
                return 0.0, 0.0, 0.0, s
            tr, tg, tb = tr * ar, tg * ag, tb * ab
            ox, oy, oz = px + fx * EPS, py + fy * EPS, pz + fz * EPS
            continue
        er, eg, eb, s = direct(px, py, pz, nx, ny, nz, s, SPH, BOX, MAT, LGT)
        cr, cg, cb, s, miss = cache_get(ckeys, C, px, py, pz, nx, ny, nz, h, s, SPH, BOX, MAT, LGT)
        return tr * MAT[m, 0] * (er + cr), tg * MAT[m, 1] * (eg + cg), tb * MAT[m, 2] * (eb + cb), s
    return 0.0, 0.0, 0.0, s


@nb.njit(parallel=True, fastmath=True, cache=True)
def spec_buffer(CAM, f, W, H, ns, h, ckeys, C, SPH, BOX, MAT, LGT):
    """Per frame: pixel-centre METAL point + its reflected radiance (ns samples) for THIS view.
    View-dependent, but the camera turns ~1 degree per frame while the gold's lobe is ~7 degrees wide,
    so neighbouring frames (past AND future) can lend their samples, weighted by view angle."""
    P = np.full((H, W, 3), np.inf, dtype=np.float32)
    S = np.zeros((H, W, 3), dtype=np.float32)
    for y in nb.prange(H):
        for x in range(W):
            ox, oy, oz, dx, dy, dz = cam_ray(CAM, f, x + 0.5, y + 0.5, W, H)
            t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
            if m < 0 or not is_spec(int(MAT[m, 3])):
                continue
            px, py, pz = ox + t * dx, oy + t * dy, oz + t * dz
            P[y, x, 0], P[y, x, 1], P[y, x, 2] = px, py, pz
            s = seed(f * 37 + 11, y * W + x, 0x5EC)
            r = g = b = 0.0
            for k in range(ns):
                rx, ry, rz, ar, ag, ab, fx, fy, fz, ok, s = scatter(dx, dy, dz, nx, ny, nz, m, MAT, s)
                if not ok:
                    continue
                lr, lg, lb, s = shade_ray(px + fx * EPS, py + fy * EPS, pz + fz * EPS, rx, ry, rz, s, h, ckeys, C, SPH, BOX, MAT, LGT)
                r += ar * lr
                g += ag * lg
                b += ab * lb
            S[y, x, 0], S[y, x, 1], S[y, x, 2] = r / ns, g / ns, b / ns
    return P, S


@nb.njit(parallel=True, fastmath=True, cache=True)
def render_B(CAM, t, F, W, H, spp, K, tol, h, Ps, Ds, ckeys, C, SPH, BOX, MAT, LGT, Ks, sig, Pm, Sm):
    """Final frame t: per sample, diffuse = albedo * (bidirectional-temporal direct + cached indirect);
    metal = traced reflection whose diffuse hit is shaded the same way; light = emission."""
    img = np.zeros((H, W, 3), dtype=np.float32)
    misses = np.zeros(H, dtype=np.int64)
    k0, k1 = max(0, t - K), min(F - 1, t + K)
    for y in nb.prange(H):
        for x in range(W):
            s = seed(t * 7919 + 3, y * W + x, 0xB)
            r = g = b = 0.0
            for q in range(spp):
                s = nxt(s)
                jx = u01(s)
                s = nxt(s)
                jy = u01(s)
                ox, oy, oz, dx, dy, dz = cam_ray(CAM, t, x + jx, y + jy, W, H)
                tr, tg, tb = 1.0, 1.0, 1.0
                lr = lg = lb = 0.0
                for bounce in range(8):
                    tt, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
                    if m < 0:
                        break
                    typ = int(MAT[m, 3])
                    if typ == LIGHT:
                        lr, lg, lb = tr * LGT[5], tg * LGT[6], tb * LGT[7]
                        break
                    px, py, pz = ox + tt * dx, oy + tt * dy, oz + tt * dz
                    if is_spec(typ):
                        if bounce == 0 and Ks > 0:
                            # view-dependent reuse: borrow reflection samples from frames t-Ks..t+Ks that saw
                            # this point from almost the same direction (Gaussian weight on view angle)
                            vx, vy, vz = px - CAM[t, 0], py - CAM[t, 1], pz - CAM[t, 2]
                            vl = math.sqrt(vx * vx + vy * vy + vz * vz)
                            wr = wg = wb = ws = 0.0
                            for k in range(max(0, t - Ks), min(F - 1, t + Ks) + 1):
                                xx, yy = project(CAM, k, px, py, pz, W, H)
                                if xx < 0:
                                    continue
                                qx, qy, qz = Pm[k, yy, xx, 0], Pm[k, yy, xx, 1], Pm[k, yy, xx, 2]
                                if (qx - px) ** 2 + (qy - py) ** 2 + (qz - pz) ** 2 > tol * tol:
                                    continue
                                ux, uy, uz = qx - CAM[k, 0], qy - CAM[k, 1], qz - CAM[k, 2]
                                ul = math.sqrt(ux * ux + uy * uy + uz * uz)
                                ca = min(1.0, (vx * ux + vy * uy + vz * uz) / (vl * ul))
                                # smooth glass changes faster with view than rough gold: narrower window
                                sg = sig if typ == METAL else sig * 0.35
                                w = math.exp(-(math.acos(ca) / sg) ** 2)
                                wr += w * Sm[k, yy, xx, 0]
                                wg += w * Sm[k, yy, xx, 1]
                                wb += w * Sm[k, yy, xx, 2]
                                ws += w
                            if ws > 0.0:
                                lr, lg, lb = wr / ws, wg / ws, wb / ws
                                break
                        dx, dy, dz, ar, ag, ab, fx, fy, fz, ok, s = scatter(dx, dy, dz, nx, ny, nz, m, MAT, s)
                        if not ok:
                            break
                        tr, tg, tb = tr * ar, tg * ag, tb * ab
                        ox, oy, oz = px + fx * EPS, py + fy * EPS, pz + fz * EPS
                        continue
                    # diffuse: direct light from the time window (past + FUTURE frames), only on primary hits
                    er = eg = eb = 0.0
                    nwin = 0
                    if bounce == 0:
                        for k in range(k0, k1 + 1):
                            xx, yy = project(CAM, k, px, py, pz, W, H)
                            if xx < 0:
                                continue
                            qx, qy, qz = Ps[k, yy, xx, 0], Ps[k, yy, xx, 1], Ps[k, yy, xx, 2]
                            if (qx - px) ** 2 + (qy - py) ** 2 + (qz - pz) ** 2 > tol * tol:
                                continue
                            er += Ds[k, yy, xx, 0]
                            eg += Ds[k, yy, xx, 1]
                            eb += Ds[k, yy, xx, 2]
                            nwin += 1
                    if nwin:
                        er, eg, eb = er / nwin, eg / nwin, eb / nwin
                    else:
                        er, eg, eb, s = direct(px, py, pz, nx, ny, nz, s, SPH, BOX, MAT, LGT)
                    cr, cg, cb, s, miss = cache_get(ckeys, C, px, py, pz, nx, ny, nz, h, s, SPH, BOX, MAT, LGT)
                    misses[y] += miss
                    lr = tr * MAT[m, 0] * (er + cr)
                    lg = tg * MAT[m, 1] * (eg + cg)
                    lb = tb * MAT[m, 2] * (eb + cb)
                    break
                r += lr
                g += lg
                b += lb
            img[y, x, 0], img[y, x, 1], img[y, x, 2] = r / spp, g / spp, b / spp
    return img, misses.sum()


@nb.njit(parallel=True, fastmath=True, cache=True)
def filter_cache(ckeys, C, clamp):
    """De-speckle the light cache: each cell is compared with its 26 neighbours (same normal bucket);
    an outlier brighter than clamp x the neighbourhood mean is pulled down, then a light 3x3x3 blend.
    Indirect light is smooth, so the blur bias is small — and it is MEASURED against the reference."""
    n = ckeys.shape[0]
    out = np.empty_like(C)
    for i in nb.prange(n):
        key = ckeys[i]
        bk = key % 8
        rest = key // 8
        iz = rest % 2048
        iy = (rest // 2048) % 2048
        ix = rest // (2048 * 2048)
        sr = sg = sb = 0.0
        cnt = 0
        for ax in range(-1, 2):
            for ay in range(-1, 2):
                for az in range(-1, 2):
                    if ax == 0 and ay == 0 and az == 0:
                        continue
                    k = ((np.int64(ix + ax) * 2048 + (iy + ay)) * 2048 + (iz + az)) * 8 + bk
                    j = np.searchsorted(ckeys, k)
                    if j < n and ckeys[j] == k:
                        sr += C[j, 0]
                        sg += C[j, 1]
                        sb += C[j, 2]
                        cnt += 1
        r, g, b = C[i, 0], C[i, 1], C[i, 2]
        if cnt >= 3:
            mr, mg, mb = sr / cnt, sg / cnt, sb / cnt
            lum, mlum = r + g + b, mr + mg + mb
            if lum > clamp * mlum and lum > 0.0:
                f = clamp * mlum / lum
                r, g, b = r * f, g * f, b * f
            r, g, b = 0.5 * r + 0.5 * mr, 0.5 * g + 0.5 * mg, 0.5 * b + 0.5 * mb
        out[i, 0], out[i, 1], out[i, 2] = r, g, b
    return out


@nb.njit(parallel=True, fastmath=True, cache=True)
def aux_buffers(CAM, f, W, H, spp, SPH, BOX, MAT):
    """Anti-aliased first-hit albedo + normal: the guide images a production denoiser (OIDN) uses."""
    A = np.zeros((H, W, 3), dtype=np.float32)
    N = np.zeros((H, W, 3), dtype=np.float32)
    for y in nb.prange(H):
        for x in range(W):
            s = seed(f * 13 + 1, y * W + x, 0xA0)
            for q in range(spp):
                s = nxt(s)
                jx = u01(s)
                s = nxt(s)
                jy = u01(s)
                ox, oy, oz, dx, dy, dz = cam_ray(CAM, f, x + jx, y + jy, W, H)
                t, m, nx, ny, nz = hit_scene(ox, oy, oz, dx, dy, dz, INF, SPH, BOX)
                if m < 0:
                    continue
                if int(MAT[m, 3]) == LIGHT:
                    A[y, x, 0] += 1.0
                    A[y, x, 1] += 1.0
                    A[y, x, 2] += 1.0
                else:
                    A[y, x, 0] += MAT[m, 0]
                    A[y, x, 1] += MAT[m, 1]
                    A[y, x, 2] += MAT[m, 2]
                N[y, x, 0] += nx
                N[y, x, 1] += ny
                N[y, x, 2] += nz
            for c in range(3):
                A[y, x, c] /= spp
                N[y, x, c] /= spp
    return A, N
