# -*- coding: utf-8 -*-
"""_discs.py - shared toolkit of the 'disc' shots (macro across the cut face of ONE thick slice;
the far rim with the peel / bark in cross-section is the horizon arc).

Used by m01_shanyao, m04_shengjiang, k09_gancao, k10_jianghuang, k01_fuling.  Units = metres.

    Outline(r0, lobes, wrinkle, rough, nubs)        closed outline r(theta); theta from +Y (far point) towards +X
    hero_face(name, outline, sol, fields, material)  dense cut-face patch (only what the camera sees) folded
                                                     over the rim into a wall; numpy micro relief + masks
    slice_item(name, outline, thickness, fields, m)  closed loose slice (polar grid) for make_items()
    knife_marks / facets / scatter / nearest / radial_cracks   numpy relief + mask helpers
    rootlets / flakes / fibres / crumbs              things that stand up past the silhouette or lie on the face
    lights(info, tint, ...)                          studio rig + low back 'sheen' box for wet / waxy cut faces
    finish(args, shot)                               render + framing check + judging composite

`fields(x, y, d, ro, th, seed)` is the per-ingredient callback: flat arrays of positions [m], distance
inside the rim d [m] (>= 0), local outline radius ro [m] and polar angle th; returns (height [m], attrs dict).
The toolkit adds the attributes 'din' (mm inside the rim; NEGATIVE = mm down the outer wall) and 'rn'
(radius / outline radius).
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

ASPECT = 16.0 / 9.0


# ----------------------------------------------------------------------------- outline
class Outline(object):
    """Closed slice outline r(theta).  lobes = [(k, relative_amplitude, phase), ...]; wrinkle [m] = bark
    wrinkles seen in cross-section (billow: round ridges, V grooves) of wavelength wrinkle_wl [m];
    rough [m] = fine raggedness; nubs = number of small outward bumps (root-hair nubs, node scars).
    The radius around theta = 0 (the far point = horizon apex) is normalised to r0."""

    def __init__(self, r0, lobes=(), wrinkle=0.0, wrinkle_wl=0.0012, rough=0.0, rough_wl=0.00025,
                 nubs=0, nub_h=0.0002, nub_w=0.0003, seed=0, n=16384):
        self.r0 = float(r0)
        th = np.linspace(-np.pi, np.pi, n, endpoint=False)
        f = np.ones(n)
        for k, a, ph in lobes:
            f += a * np.cos(k * th - ph)
        r = self.r0 * f
        c = np.stack([np.sin(th), np.cos(th), np.zeros(n)], 1) * self.r0
        if wrinkle:
            b = np.abs(C.perlin3(c / wrinkle_wl, seed + 3)) ** 0.6
            b2 = np.abs(C.perlin3(c / (wrinkle_wl * 0.37) + 5.0, seed + 4)) ** 0.7
            r = r + wrinkle * ((b - 0.45) + 0.35 * (b2 - 0.45))
        if rough:
            r = r + rough * C.fbm3(c / rough_wl, 3, seed=seed + 5)
        if nubs:
            rng = np.random.default_rng(seed + 77)
            for t0 in rng.uniform(-np.pi, np.pi, nubs):
                dth = np.angle(np.exp(1j * (th - t0)))
                r = r + nub_h * rng.uniform(0.4, 1.0) * np.exp(-(dth * self.r0 / (nub_w * rng.uniform(0.6, 1.3))) ** 2)
        r = r * (self.r0 / r[np.abs(th) < 0.10].mean())
        self.tab, self.n = r, n
        self.rmax = float(r.max())

    def r(self, theta):
        t = (np.asarray(theta, float) + np.pi) / (2 * np.pi) * self.n
        i0 = np.floor(t).astype(np.int64)
        fr = t - i0
        return self.tab[i0 % self.n] * (1 - fr) + self.tab[(i0 + 1) % self.n] * fr


# ----------------------------------------------------------------------------- numpy field helpers
def P3(x, y, z=0.0):
    return np.stack([x, y, np.zeros_like(x) + z], -1)


def knife_marks(x, y, angle_deg=10.0, seed=0, amp=5e-6, wl=(0.00012, 0.0004, 0.0016), weights=(0.5, 1.0, 0.9),
                bow=0.07, along=45.0):
    """Parallel, slightly bowed micro ridges left by a blade drawn across the face (height, metres)."""
    a = math.radians(angle_deg)
    u = x * math.cos(a) + y * math.sin(a)
    w = -x * math.sin(a) + y * math.cos(a) + u * u / (2.0 * bow)
    h = np.zeros_like(x)
    for i, (l, wt) in enumerate(zip(wl, weights)):
        h += wt * C.perlin3(np.stack([w / l, u / (l * along), np.full_like(u, 3.7 * i)], -1), seed + 31 * i)
    return amp * h


def facets(x, y, seed=0, n=4, tilt=0.012):
    """A few broad planar knife facets meeting in soft ridges (height, metres, zero mean)."""
    rng = np.random.default_rng(seed)
    h = None
    ext = max(np.ptp(x), np.ptp(y))
    for i in range(n):
        ang = rng.uniform(0, 2 * math.pi)
        g = tilt * rng.uniform(0.35, 1.0)
        pl = g * (math.cos(ang) * (x - x.mean()) + math.sin(ang) * (y - y.mean())) + rng.uniform(-0.3, 0.3) * tilt * ext * 0.4
        h = pl if h is None else np.minimum(h, pl)
    return h - h.mean()


def scatter(bounds, spacing, seed=0, jitter=1.0, density=None):
    """Jittered-grid points in bounds = (xmin, xmax, ymin, ymax); density(x, y) -> keep probability."""
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = bounds
    gx = np.arange(xmin - spacing, xmax + spacing, spacing)
    gy = np.arange(ymin - spacing, ymax + spacing, spacing * 0.866)
    X, Y = np.meshgrid(gx, gy)
    X = X + (np.arange(len(gy)) % 2)[:, None] * spacing * 0.5
    p = np.stack([X.ravel(), Y.ravel()], 1) + rng.uniform(-0.5, 0.5, (X.size, 2)) * spacing * jitter
    if density is not None:
        p = p[rng.random(len(p)) < density(p[:, 0], p[:, 1])]
    return p


def nearest(pts, x, y, seed=0, k=1):
    """Distance to and index of the nearest of pts (M,2) for every (x, y), plus a random 0-1 per point."""
    from scipy.spatial import cKDTree
    if len(pts) == 0:
        return np.full(x.shape, 1e9), np.zeros(x.shape, np.int64), np.zeros(1)
    d, i = cKDTree(pts).query(np.stack([x, y], 1), k=k, workers=2)
    return d, i, np.random.default_rng(seed).random(len(pts))


def dots(x, y, pts, rad, soft=0.5, seed=0):
    """Soft round dot mask around scattered centres.  rad = (rmin, rmax) per-dot radius range.
    Returns (mask 0-1, per-dot random 0-1 broadcast to the vertices, normalised distance)."""
    d, i, rnd = nearest(pts, x, y, seed)
    rv = rnd[i]
    r = rad[0] + (rad[1] - rad[0]) * ((rv * 7.31) % 1.0)
    q = d / r
    return 1.0 - C.smoothstep(soft, 1.0, q), rv, q


def radial_cracks(x, y, n=14, seed=0, r_in=0.2, r_out=0.9, r0=1.0, width=0.00012, wobble=0.05):
    """Radial drying fissures: n cracks at random angles, each spanning a random part of [r_in, r_out] * r0,
    widest in the middle, tapering to hairlines, slightly wandering.  Returns depth mask 0-1."""
    rng = np.random.default_rng(seed)
    rho = np.hypot(x, y)
    th = np.arctan2(x, y)
    out = np.zeros_like(x)
    for i in range(n):
        t0 = rng.uniform(-np.pi, np.pi)
        a, b = sorted(rng.uniform(r_in, r_out, 2))
        if b - a < 0.12:
            b = min(r_out, a + 0.2)
        a, b = a * r0, b * r0
        wob = wobble * (C.perlin3(P3(rho / (0.12 * r0), np.zeros_like(rho) + i * 3.1), seed + i)
                        + 0.4 * C.perlin3(P3(rho / (0.03 * r0), np.zeros_like(rho) + i * 5.3), seed + 50 + i))
        dth = np.angle(np.exp(1j * (th - t0 - wob)))
        sel = (np.abs(dth) < 0.25) & (rho > a) & (rho < b)
        s = (rho[sel] - a) / (b - a)
        w = width * rng.uniform(0.5, 1.4) * (np.sin(np.pi * s) ** 0.8 + 0.05)
        dist = np.abs(dth[sel]) * rho[sel]
        out[sel] = np.maximum(out[sel], 1.0 - C.smoothstep(0.35, 1.0, dist / w))
    return out


# ----------------------------------------------------------------------------- camera helpers
def screen_frac(info, pts):
    """Project world points -> (fx, fy) frame fractions (origin top-left) for the disc camera `info`."""
    pos, fwd, up = np.array(info['cam_pos']), np.array(info['cam_fwd']), np.array(info['cam_up'])
    v = np.asarray(pts, float) - pos
    z = v @ fwd
    hw = C.SENSOR_MM / 2.0 / info['lens_mm']
    hh = hw / ASPECT
    return 0.5 + (v[:, 0] / z) / (2 * hw), 0.5 - ((v @ up) / z) / (2 * hh)


def sky_limit(fx):
    """Highest allowed position (fraction of H from the top) of anything at column fx (framing contract)."""
    a = np.abs(np.asarray(fx) - 0.5)
    return np.where(a < 0.115, 0.509, np.where(a < 0.315, 0.480, 0.40))


# ----------------------------------------------------------------------------- hero cut face
def hero_face(name, outline, sol, fields, material, n_max=1700, fillet=0.00012, wall_plan=None, wall_gain=4.0,
              seed=0, wall_depth=0.004):
    """The cut face as a dense regular grid over the visible patch sol['patch'] (plane z = 0, micro
    relief from `fields`), rounded over the rim with radius `fillet` and folded down into the outer
    wall (vertices outside the outline are clamped onto it and pushed down).  Returns (object, F) with
    F = dict(bounds, cell, shape, z (ny, nx) heights, height(x, y) lookup, attrs)."""
    xmin, xmax, ymin, ymax = [float(v) for v in sol['patch']]
    r0 = outline.r0
    tv = np.linspace(-1.4, 1.4, 4000)
    rv = outline.r(tv)
    sel = (rv * np.sin(tv) > xmin) & (rv * np.sin(tv) < xmax)
    wall_plan = wall_plan or 0.03 * r0
    ymax = float((rv * np.cos(tv))[sel].max() + wall_plan)
    v, f, _, (ny, nx) = C.patch_grid((xmin, xmax, ymin, ymax), None, n_max)
    x, y = v[:, 0].copy(), v[:, 1].copy()
    rho = np.hypot(x, y)
    th = np.arctan2(x, y)
    ro = outline.r(th)
    out = rho > ro
    k = np.where(out, ro / np.maximum(rho, 1e-9), 1.0)
    xc, yc = x * k, y * k
    d = np.maximum(ro - rho, 0.0)
    h, attrs = fields(xc, yc, d, ro, th, seed)
    u = np.clip((fillet - d) / fillet, 0.0, 1.0)
    z = h - fillet * (1.0 - np.sqrt(1.0 - u * u))
    s = (rho - ro) * wall_gain
    z = np.where(out, h - fillet - s, z)
    v[:, 0], v[:, 1], v[:, 2] = xc, yc, z
    attrs = dict(attrs)
    attrs['din'] = np.where(out, -s, d) * 1000.0
    attrs['rn'] = np.minimum(rho / ro, 1.0)
    keep = (s[f] < wall_depth).any(axis=1)                      # drop the far-outside corners of the grid
    ob = C.mesh_from_arrays(name, v, f[keep], attrs=attrs, material=material)
    Z = z.reshape(ny, nx)
    cell = (xmax - xmin) / (nx - 1)

    def height(px, py):
        ix = np.clip(np.round((np.asarray(px) - xmin) / cell).astype(int), 0, nx - 1)
        iy = np.clip(np.round((np.asarray(py) - ymin) / cell).astype(int), 0, ny - 1)
        return Z[iy, ix]

    print('[disc] face %dx%d = %.2f M verts, cell %.1f um' % (nx, ny, nx * ny / 1e6, cell * 1e6))
    return ob, dict(bounds=(xmin, xmax, ymin, ymax), cell=cell, shape=(ny, nx), z=Z, height=height, attrs=attrs,
                    x=xc, y=yc, d=d)


# ----------------------------------------------------------------------------- loose slice (make_items)
def slice_item(name, outline, thickness, fields, material, seed=0, nr=110, nth=384, fillet=0.0002, warp=0.0,
               wall_rows=8, bottom_fields=None):
    """Closed thick slice lying flat (lowest point z = 0, origin at the footprint centre): top face,
    rounded rim, outer wall, bottom face - one polar grid.  `fields` as for hero_face (called for the
    top and, mirrored, for the bottom).  warp = potato-chip warp amplitude as a fraction of the radius.
    Returns (object, footprint_radius, half_height)."""
    th = np.linspace(-np.pi, np.pi, nth, endpoint=False)
    ro = outline.r(th)
    fr = np.linspace(0.0, 1.0, nr) ** 0.9
    fr[0] = 0.0006
    RO, FR = np.broadcast_arrays(ro[None, :], fr[:, None])
    TH = np.broadcast_to(th[None, :], RO.shape)
    rho = RO * FR
    x, y = (rho * np.sin(TH)).ravel(), (rho * np.cos(TH)).ravel()
    d = (RO - rho).ravel()
    h, at = fields(x, y, d, RO.ravel(), TH.ravel(), seed)
    u = np.clip((fillet - d) / fillet, 0.0, 1.0)
    cap = fillet * (1.0 - np.sqrt(1.0 - u * u))
    ztop = thickness + h - cap
    bf = bottom_fields or fields
    hb, ab = bf(-x, y, d, RO.ravel(), TH.ravel(), seed + 101)
    zbot = cap - hb
    top = np.stack([x, y, ztop], 1).reshape(nr, nth, 3)
    bot = np.stack([x, y, zbot], 1).reshape(nr, nth, 3)[::-1]
    t = np.linspace(0, 1, wall_rows + 2)[1:-1][:, None, None]
    wall = top[-1][None] * (1 - t) + bot[0][None] * t
    V = np.concatenate([top, wall, bot], 0)
    nring = V.shape[0]
    attrs = {}
    for kname in at:
        a_top = np.asarray(at[kname], float).reshape(nr, nth)
        a_bot = np.asarray(ab[kname], float).reshape(nr, nth)[::-1]
        a_wall = np.repeat(a_top[-1][None], wall_rows, 0)
        attrs[kname] = np.concatenate([a_top, a_wall, a_bot], 0).ravel()
    din_top = d.reshape(nr, nth) * 1000.0
    din_wall = -(0.05 + np.broadcast_to(t[:, :, 0], (wall_rows, nth)) * thickness * 1000.0)
    attrs['din'] = np.concatenate([din_top, din_wall, din_top[::-1]], 0).ravel()
    attrs['rn'] = np.concatenate([FR, np.ones((wall_rows, nth)), FR[::-1]], 0).ravel()
    V = V.reshape(-1, 3)
    if warp:
        q = P3(V[:, 0], V[:, 1]) / outline.r0
        V[:, 2] += warp * outline.r0 * (C.perlin3(q * 0.9 + 3.0, seed + 9) * 1.6 + 0.6 * (q[:, 0] ** 2 - q[:, 1] ** 2) *
                                        np.random.default_rng(seed).uniform(-1, 1))
    faces = C.grid_faces(nring, nth, wrap_v=True)
    a, b, c = V[faces[0, 0]], V[faces[0, 1]], V[faces[0, 2]]
    if np.cross(b - a, c - a)[2] < 0:
        faces = faces[:, ::-1]
    V[:, 2] -= V[:, 2].min()
    ob = C.mesh_from_arrays(name, V, faces, attrs=attrs, material=material)
    return ob, float(ro.max()), float(V[:, 2].max() * 0.5)


# ----------------------------------------------------------------------------- things past the silhouette
def rootlets(name, outline, info, material, n=30, th_range=(-0.8, 0.8), length=(0.0015, 0.006),
             radius=(0.00005, 0.00012), depth=(0.0001, 0.0012), rise=(-0.15, 0.45), wander=0.35, droop=0.25,
             seed=0, limit=True, nseg=26, nv=7, thetas=None):
    """Fine rootlets / whiskers growing out of the outer wall just below the rim; the parts that
    reach past the horizon are what the camera sees.  With limit=True every rootlet is cut where it
    would poke into the text zone (sky_limit).  Returns the mesh object (or None)."""
    rng = np.random.default_rng(seed)
    parts = []
    ez = np.array([0.0, 0.0, 1.0])
    for i in range(n):
        th = rng.uniform(*th_range) if thetas is None else thetas[i]
        ro = float(outline.r(th))
        er = np.array([math.sin(th), math.cos(th), 0.0])
        et = np.array([math.cos(th), -math.sin(th), 0.0])
        r0 = rng.uniform(*radius)
        p = (ro - r0) * er - ez * rng.uniform(*depth)
        el, sw = rng.uniform(*rise), rng.normal(0, 0.5)
        dv = er * math.cos(el) * math.cos(sw) + et * math.sin(sw) * math.cos(el) + ez * math.sin(el)
        L = rng.uniform(*length)
        kk = rng.normal(0, wander, 3)
        pts = [p]
        for j in range(nseg):
            dv = dv + (kk + rng.normal(0, wander * 0.6, 3)) / nseg - ez * droop / nseg
            dv /= np.linalg.norm(dv)
            pts.append(pts[-1] + dv * L / nseg)
        pts = np.array(pts)
        if limit:
            fx, fy = screen_frac(info, pts)
            bad = fy < sky_limit(fx)
            if bad.any():
                pts = pts[:max(int(np.argmax(bad)) - 1, 0)]
        if len(pts) < 5:
            continue
        t = np.linspace(0, 1, len(pts))
        rad = r0 * ((1 - t) ** 0.7 + 0.06)
        rad[0] *= 1.6
        v, f = C.tube(pts, rad, nv=nv)
        parts.append((v, f, 0))
    if not parts:
        return None
    v, fl, _ = C.merge_meshes(parts)
    return C.mesh_from_arrays(name, v, fl, material=material)


def flakes(name, outline, info, material, n=20, th_range=(-0.8, 0.8), width=(0.0004, 0.0014),
           length=(0.0005, 0.002), lift=(0.2, 1.2), curl=(-0.3, 1.4), z0=-0.0001, seed=0, thetas=None, nu=9, ns=14):
    """Thin papery skin flakes peeling off at the rim: narrow tongues attached to the rim that lift
    outwards / upwards and curl.  Each is shortened until it respects sky_limit.  Returns the object."""
    rng = np.random.default_rng(seed)
    parts = []
    ez = np.array([0.0, 0.0, 1.0])
    s = np.linspace(0, 1, ns)
    uu = np.linspace(-1, 1, nu)
    for i in range(n):
        th = rng.uniform(*th_range) if thetas is None else thetas[i]
        ro = float(outline.r(th))
        er = np.array([math.sin(th), math.cos(th), 0.0])
        et = np.array([math.cos(th), -math.sin(th), 0.0])
        w, L = rng.uniform(*width), rng.uniform(*length)
        a0, kt = rng.uniform(*lift), rng.uniform(*curl)
        skew, cup = rng.normal(0, 0.25), rng.uniform(-0.25, 0.5)
        rag = 1.0 + 0.45 * C.perlin3(P3(s * 5.0, np.zeros(ns) + i * 1.7), seed + i) + 0.2 * C.perlin3(P3(s * 13.0, np.zeros(ns) + i * 2.9), seed + i + 7)
        for attempt in range(4):
            ang = a0 + kt * s
            dr = np.concatenate([[0], np.cumsum(np.cos(ang[:-1]))]) * L / (ns - 1)
            dz = np.concatenate([[0], np.cumsum(np.sin(ang[:-1]))]) * L / (ns - 1)
            wid = 0.5 * w * (1 - s ** 2.2) ** 0.6 * rag
            base = ro * er + ez * z0
            Pm = (base[None, None, :] + er[None, None, :] * dr[:, None, None] + ez[None, None, :] * dz[:, None, None]
                  + et[None, None, :] * (uu[None, :, None] * wid[:, None, None] + skew * w * s[:, None, None])
                  + ez[None, None, :] * (cup * (uu[None, :, None] ** 2 - 0.3) * wid[:, None, None]))
            V = Pm.reshape(-1, 3)
            fx, fy = screen_frac(info, V)
            if (fy >= sky_limit(fx)).all():
                parts.append((V, C.grid_faces(ns, nu, wrap_v=False), 0))
                break
            L *= 0.6
    if not parts:
        return None
    v, fl, _ = C.merge_meshes(parts)
    return C.mesh_from_arrays(name, v, fl, material=material)


def fibres(name, base, material, length=(0.0002, 0.001), radius=(0.000012, 0.000022), lean=0.6, curl=0.5,
           seed=0, nseg=7, nv=5):
    """Many short fibres standing up from points `base` (N,3) of the cut face (vectorised tubes)."""
    rng = np.random.default_rng(seed)
    base = np.asarray(base, float)
    N = len(base)
    if N == 0:
        return None
    L = rng.uniform(length[0], length[1], N) * rng.uniform(0.35, 1.0, N)
    R = rng.uniform(radius[0], radius[1], N)
    az = rng.uniform(0, 2 * math.pi, N)
    tl = np.clip(np.abs(rng.normal(0, lean, N)), 0.02, 1.35)
    d0 = np.stack([np.sin(tl) * np.cos(az), np.sin(tl) * np.sin(az), np.cos(tl)], 1)
    az2 = az + rng.normal(0, 1.0, N)
    bend = np.stack([np.cos(az2), np.sin(az2), np.full(N, -0.35)], 1)
    t = np.linspace(0, 1, nseg)
    Pp = (base[:, None, :] + d0[:, None, :] * (t[None, :] * L[:, None])[..., None]
          + bend[:, None, :] * (curl * L[:, None] * t[None, :] ** 2)[..., None])
    a = np.cross(d0, np.array([0.0, 0.0, 1.0]))
    a /= np.linalg.norm(a, axis=1, keepdims=True) + 1e-12
    b = np.cross(d0, a)
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)
    rr = R[:, None] * (1.0 - 0.8 * t[None, :] ** 1.5)
    V = (Pp[:, :, None, :] + rr[:, :, None, None] * (np.cos(ph)[None, None, :, None] * a[:, None, None, :]
                                                     + np.sin(ph)[None, None, :, None] * b[:, None, None, :]))
    f0 = C.grid_faces(nseg, nv, wrap_v=True)
    Fa = (f0[None] + (np.arange(N) * nseg * nv)[:, None, None]).reshape(-1, 4)
    tt = np.broadcast_to(t[None, :, None], (N, nseg, nv)).ravel()
    rnd = np.broadcast_to(rng.random(N)[:, None, None], (N, nseg, nv)).ravel()
    return C.mesh_from_arrays(name, V.reshape(-1, 3), Fa, material=material, attrs={'t': tt, 'frand': rnd})


def crumbs(name, loc, size, material, seed=0, nvar=5, squash=0.7, attrs=None):
    """Loose crumbs / powder grains lying on the face: instanced lumpy blobs.  loc (N,3), size (N,) [m]."""
    rng = np.random.default_rng(seed)
    variants = []
    for i in range(nvar):
        v, f, _, _ = C.superellipsoid(1.0, rng.uniform(0.7, 1.0), rng.uniform(0.5, 0.9) * squash, nu=10, nv=12,
                                      e_long=rng.uniform(0.7, 1.2), e_round=rng.uniform(0.7, 1.2))
        nr = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        v = v * (1.0 + 0.28 * C.fbm3(nr * 1.7 + i * 9.1, 2, seed=seed + i))[:, None]
        variants.append(C.mesh_from_arrays('%s_v%d' % (name, i), v, f, material=material))
    N = len(loc)
    q = rng.normal(size=(N, 4))
    q /= np.linalg.norm(q, axis=1, keepdims=True)
    return C.instance_on_points(name, variants, loc=np.asarray(loc, float), quat=q, scale=np.asarray(size, float),
                                var=rng.integers(0, nvar, N), attrs=attrs)


def face_points(F, n, seed=0, weight=None, margin=0.0):
    """n random points on the hero face (x, y, z on the relief), optionally importance-sampled by a
    per-vertex weight array (same layout as the grid) - for crumbs, fibres, droplets."""
    rng = np.random.default_rng(seed)
    ok = F['d'] > margin
    w = ok.astype(float) if weight is None else np.asarray(weight, float) * ok
    w = w / w.sum()
    idx = rng.choice(len(w), size=n, p=w)
    x = F['x'][idx] + rng.uniform(-0.5, 0.5, n) * F['cell']
    y = F['y'][idx] + rng.uniform(-0.5, 0.5, n) * F['cell']
    return np.stack([x, y, F['z'].ravel()[idx]], 1)


# ----------------------------------------------------------------------------- light + finish
def lights(info, tint, key=0.85, fill=0.8, rim=1.0, top=0.45, world=1.0, key_az=-40.0, key_el=38.0, key_size=1.1,
           sheen=0.0, sheen_az=-8.0, sheen_el=30.0, sheen_size=1.0, sheen_color=(1.0, 0.97, 0.93)):
    """common.studio_lights (key moved further behind the subject so its reflection grazes the cut
    face) + an optional low soft box straight behind the slice ('sheen'): it sits in the mirror
    direction of the camera for the horizontal face, so wet / waxy faces get their soft sheen and
    micro glints, dry powdery ones stay matte."""
    L = C.studio_lights(info, tint=tint, key=key, fill=fill, rim=rim, world=world, key_az=key_az, key_el=key_el,
                        key_size=key_size, top=top)
    if sheen > 0:
        T, s = np.array(info['target'], float), float(info['scale'])
        a, e = math.radians(sheen_az), math.radians(sheen_el)
        pos = T + 2.8 * s * np.array([math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)])
        L['sheen'] = C._area_light('sheen', pos, T, sheen_size * s, 60.0 * sheen * s * s, sheen_color)
    return L


def n_max_for(args, full=1700, light=1000):
    """Grid density: full for 4K-density renders, lighter for the small previews."""
    return full if args.q['res'][0] >= 3000 else light


def finish(args, shot):
    """Render, verify the framing contract, write the judging composite (crop composite for --region)."""
    C.render(args)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, shot + ('_comp.jpg' if args.quality == 'final'
                                                             else '_%s_comp.jpg' % args.quality))
    if args.region:
        comp = os.path.splitext(args.out)[0] + '_crop.jpg'
        C.quick_comp(args.out, shot, comp, crop=args.region, text=False)
    else:
        C.check_framing(args.out)
        C.quick_comp(args.out, shot, comp)
    print('[comp]', comp)
    return comp


# ----------------------------------------------------------------------------- shader helpers
def moist_layers(m, P, celld, grain, wet, dry_mask, knife_deg=10.0, cell_h=0.000028, grain_h=0.000008, drop=None,
                 coat_ior=1.38, coat_rough=(0.10, 0.26), calm_scale=600.0, film_gain=1.0):
    """Micro relief + wet film of a freshly cut, juicy face.  celld = Voronoi F1 socket (one cell pattern
    drives colour and relief), grain = fine noise socket, wet = 0-1 wetness mask, dry_mask = 1 where no
    film (skin).  Cells are slightly domed (their amplitude varies slowly), the film is patchy and smeared
    along the knife strokes; `drop` = optional mask of real droplets (mirror-smooth).  Returns the kwargs
    for Mat.set (normal, coat, coat_ior, coat_normal, coat_roughness).  Cheap on purpose: 2 bump nodes."""
    calm = m.map_range(m.noise(scale=calm_scale, detail=2, vector=P), 0.3, 0.7, 0.35, 1.0)
    amp = calm if drop is None else m.math('MULTIPLY', calm, m.math('SUBTRACT', 1.0, drop))
    dome = m.math('MULTIPLY', m.map_range(celld, 0.0, 0.60, 1.0, 0.0, smooth=True), amp)
    nrm = m.bump(dome, strength=0.7, distance=cell_h)
    nrm = m.bump(grain, strength=0.5, distance=grain_h, normal=nrm)
    Pk = m.mapping(P, rotation=(0, 0, math.radians(knife_deg)), scale=(0.06, 1.0, 1.0))
    streak = m.noise(scale=800, detail=2, roughness=0.5, vector=Pk)
    film = m.math('MULTIPLY', m.math('MULTIPLY', wet, m.map_range(streak, 0.25, 0.75, 0.45 * film_gain, film_gain)),
                  m.math('SUBTRACT', 1.0, dry_mask))
    cr = m.map_range(streak, 0.2, 0.8, coat_rough[0], coat_rough[1])
    if drop is not None:
        film = m.math('MAXIMUM', m.math('MULTIPLY', film, 0.9), drop)
        cr = m.mixf(cr, 0.035, drop)
    return dict(normal=nrm, coat=film, coat_ior=coat_ior, coat_normal=nrm, coat_roughness=cr)


def skin_mask(m, P, din, thick=(0.15, 0.34), scale=2200.0):
    """1 on the skin seen in cross-section (noisy thickness, mm) and on the outer wall (din < 0)."""
    t = m.map_range(m.noise(scale=scale, detail=2, vector=P), 0.2, 0.8, thick[0], thick[1])
    return m.math('SUBTRACT', 1.0, m.map_range(din, m.math('MULTIPLY', t, 0.55), t, 0.0, 1.0, smooth=True))


def translucent_sheet(m, color, fac=0.35):
    """Mix a Translucent BSDF into Mat m (thin papery flakes, petals: light passes through the sheet)."""
    nt = m.nt
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
    m._in(tr.inputs['Color'], color)
    mx = nt.nodes.new('ShaderNodeMixShader')
    mx.inputs[0].default_value = fac
    nt.links.new(m.bsdf.outputs[0], mx.inputs[1])
    nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], m.out.inputs['Surface'])
    return m
