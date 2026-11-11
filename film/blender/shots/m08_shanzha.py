# -*- coding: utf-8 -*-
"""m08_shanzha - dried hawthorn slices (山楂片), kind = pile.

    python m08_shanzha.py --quality draft   --out /tmp/x.png
    python m08_shanzha.py --quality draft   --res 3840x2160 --spp 24 --region 0.35,0.7,0.65,1.0   # final-density crop
    python m08_shanzha.py --quality final   --out film/renders/m08_shanzha.png

What a pharmacist expects (and what is modelled, at true scale in metres):
  * transverse slices 17-23 mm across, 2.6-4 mm thick at the skin, warped like crisps;
  * the dried flesh has shrunk to about half the cut thickness, so the dark-red wrinkled skin rim
    (with pale lenticel dots) stands proud as a thin lip on both faces;
  * tan / yellow-brown matte, puckered cut face, red-brown stain under the skin;
  * five wedge-shaped seed cavities in a rosette: real THROUGH holes (thin septa, sometimes broken
    into one ragged hole) or still holding the pale bony stones (cut flush, standing proud);
  * end caps: domed wrinkled skin with the dark puckered calyx (five sepal stubs) or the stalk
    scar / a short stalk; a broken piece; loose stones as debris.

Importable without rendering:  make_items(seed) -> templates for the flat-lay version.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 'm08_shanzha'
R_DOME = 0.34             # bare dome radius -> a 20 mm slice is ~170 px wide in the 1920 frame
ATTRS = ('skin', 'cav', 'rad', 'wall', 'calyx', 'seedh')

# mesh variants: (weights are the pile mix)
SPECS = [
    dict(kind='mid', stones=0),
    dict(kind='mid', stones=2),
    dict(kind='mid', stones=0, merge=True),
    dict(kind='mid', stones=5),
    dict(kind='mid', stones=1),
    dict(kind='mid', stones=3, small=0.86),
    dict(kind='mid', stones=0, broken=True),
    dict(kind='calyx'),
    dict(kind='stalk'),
    dict(kind='stone'),
]
WEIGHTS = [1.0, 1.0, 0.8, 0.8, 1.0, 0.9, 0.6, 0.55, 0.45, 0.45]


# ----------------------------------------------------------------------------- 1. geometry
def _dilate8(mask):
    """8-neighbour dilation on a (rows, theta) grid, periodic in theta."""
    out = mask.copy()
    for dj in (-1, 0, 1):
        r = np.roll(mask, dj, axis=1)
        out |= r
        out[1:] |= r[:-1]
        out[:-1] |= r[1:]
    return out


def _hole_sd(cavs, x, y, seed):
    """Approximate signed distance (metres, < 0 inside) to the union of the seed cavities.
    Each cavity is a rounded sector (superellipse in polar coordinates) with a noisy outline."""
    sd = np.full(np.shape(x), 1.0)
    eps = 1.5e-5

    def F(c, xx, yy):
        rm = np.hypot(xx, yy)
        ph = np.angle(np.exp(1j * (np.arctan2(yy, xx) - c['th'])))
        p = c['p']
        f = ((np.abs(rm - c['rc']) / c['a']) ** p + (np.abs(ph) / c['phw']) ** p) ** (1.0 / p) - 1.0
        n = C.perlin3(np.stack([xx * c['nf'], yy * c['nf'], np.zeros_like(xx) + c['ns']], -1), seed)
        return f + c['na'] * n

    for c in cavs:
        f0 = F(c, x, y)
        gx = (F(c, x + eps, y) - F(c, x - eps, y)) / (2 * eps)
        gy = (F(c, x, y + eps) - F(c, x, y - eps)) / (2 * eps)
        sd = np.minimum(sd, f0 / np.sqrt(gx * gx + gy * gy + 1e-6))
    return sd


def _stone_part(c, hs, zoff, nt=84):
    """A bony stone (pyrene) still sitting in cavity `c`, cut flush by the knife on both faces:
    the cavity outline extruded to +-hs with rounded edges and the small seed chamber as a dimple."""
    p = c['p']
    tau = np.linspace(0, 2 * np.pi, nt, endpoint=False)
    ct = np.sign(np.cos(tau)) * np.abs(np.cos(tau)) ** (2.0 / p)
    st = np.sign(np.sin(tau)) * np.abs(np.sin(tau)) ** (2.0 / p)
    rc_ = min(0.00032, 0.45 * hs)
    k_face = np.linspace(0.0, 0.84, 13)
    beta = np.linspace(0, np.pi / 2, 8)[1:]
    kap = np.concatenate([k_face, 0.84 + 0.13 * np.sin(beta)])
    zz = np.concatenate([np.full(len(k_face), hs), hs - rc_ * (1 - np.cos(beta))])
    nw = 5
    zw_ = np.linspace(hs - rc_, -(hs - rc_), nw + 2)[1:-1]
    kap = np.concatenate([kap, np.full(nw, 0.97), kap[::-1]])
    zz = np.concatenate([zz, zw_, -zz[::-1]])
    K = kap[:, None]
    face = (np.abs(zz) > hs - 1e-9)[:, None] * 1.0
    dim = (1 - C.smoothstep(0.10, 0.36, K)) * face
    rm = c['rc'] + K * c['a'] * ct[None, :]
    ang = c['th'] + K * c['phw'] * st[None, :]
    x, y = rm * np.cos(ang), rm * np.sin(ang)
    z = zz[:, None] - np.sign(zz)[:, None] * 0.00060 * dim + zoff + 0 * x
    v = np.stack([x, y, z], -1).reshape(-1, 3)
    f = C.grid_faces(len(kap), nt, wrap_v=True)[:, ::-1]
    return v, f, 1, dict(seedh=(dim + 0 * x).ravel(), cav=((1 - face) + 0 * x).ravel())


def make_loose_stone(seed):
    """A whole loose stone (果核): 6 x 4 x 3.4 mm, wedge-ish, shallow grooves on the back."""
    rng = np.random.default_rng(5000 + seed)
    a, b, c = 0.0031 * rng.uniform(0.9, 1.12), 0.0021 * rng.uniform(0.9, 1.1), 0.0016 * rng.uniform(0.9, 1.1)
    v, f, s, phi = C.superellipsoid(a, b, c, nu=90, nv=96, e_long=0.85, e_round=0.80,
                                    taper=rng.uniform(-0.3, 0.3))
    n = C.vertex_normals(v, f)
    g = np.abs(C.perlin3(v * [260, 900, 900] + 3.0, seed)) ** 0.6
    v = v + n * (0.00012 * C.fbm3(v * 420 + 1.0, 3, seed=seed + 1) - 0.00009 * (1 - g))[:, None]
    if np.mean((v * n).sum(1)) < 0:
        f = f[:, ::-1]
    half = (a * 0.95, b * 0.95, c * 0.95)
    parts = [(v, f, 1, dict(cav=0.55 * (1 - g) + 0.25))]
    return parts, half


def make_piece(seed, kind='mid', stones=0, merge=False, broken=False, small=1.0, nr=116, nth=448, nb=22):
    """One dried hawthorn piece as numpy parts [(verts, faces, material_slot, attrs)], plus its
    tight half sizes.  The piece lies in the XY plane (thickness = Z), centred on the origin.
    kind: 'mid' (transverse slice with the five cavities), 'calyx' / 'stalk' (end caps: skin dome up),
    'stone' (a loose stone)."""
    if kind == 'stone':
        return make_loose_stone(seed)
    rng = np.random.default_rng(3000 + seed)
    cap = kind in ('calyx', 'stalk')
    Rm = rng.uniform(0.0090, 0.0118) * small * (0.82 if cap else 1.0)       # outline radius
    t_rim = rng.uniform(0.0027, 0.0040)                                    # cut thickness (kept by the skin)
    th = np.linspace(0, 2 * np.pi, nth, endpoint=False)
    cth, sth = np.cos(th), np.sin(th)
    c3 = np.stack([cth, sth, np.zeros(nth)], -1)
    ecc, the = rng.uniform(0.0, 0.07), rng.uniform(0, np.pi)
    Rth = Rm * (1 + 0.05 * C.fbm3(c3 * 0.9 + seed * 1.7, 2, seed=seed + 1)
                + 0.016 * C.fbm3(c3 * 3.2 + 5.0, 2, seed=seed + 2) + ecc * np.cos(2 * (th - the)))
    brk = np.zeros(nth)
    if broken:                                         # a segment snapped off along a chord
        d, thb = Rm * rng.uniform(0.60, 0.72), rng.uniform(0, 2 * np.pi)
        cd = np.cos(th - thb)
        chord = d / np.maximum(cd, 1e-3) * (1 + 0.035 * C.fbm3(c3 * 6 + 9, 3, seed=seed + 3))
        Rcl = np.where(cd > 0, np.minimum(Rth, chord), Rth)
        brk = C.smoothstep(0.0, 0.0004, Rth - Rcl)
        Rth = Rcl
    e_b = rng.uniform(0.00030, 0.00050) * (1 - brk)                         # outward bulge of the skin band
    Rin = Rth - e_b

    s = np.linspace(0, 1, nr)
    rho_f = 0.6 * s + 0.4 * np.sin(0.5 * np.pi * s)                         # flat faces: a bit denser at the rim
    rho_d = np.sin(0.5 * np.pi * s)                                         # dome: much denser at the rim
    rho_t = rho_d if cap else rho_f
    Xt, Yt = rho_t[:, None] * Rin[None, :] * cth[None, :], rho_t[:, None] * Rin[None, :] * sth[None, :]

    # ---- the five seed cavities (through holes)
    cavs = []
    if not cap:
        th0, core = rng.uniform(0, 2 * np.pi), rng.uniform(0.40, 0.50)
        m0 = int(rng.integers(0, 5))
        for i in range(5):
            r_in, r_out = Rm * rng.uniform(0.055, 0.09), Rm * core * rng.uniform(0.9, 1.08)
            phw = math.radians(rng.uniform(24, 30))
            if merge and i in (m0, (m0 + 1) % 5, (m0 + 2) % 5):
                phw = math.radians(rng.uniform(36.5, 39))                   # septa torn: holes merge
            cavs.append(dict(th=th0 + i * 2 * np.pi / 5 + rng.normal(0, 0.05), rc=0.5 * (r_in + r_out),
                             a=0.5 * (r_out - r_in), phw=phw, p=rng.uniform(2.3, 3.2),
                             nf=rng.uniform(450, 700), ns=rng.uniform(0, 50), na=rng.uniform(0.07, 0.13)))
    if cavs:
        sd = _hole_sd(cavs, Xt, Yt, seed)
        ins = sd < 0
        border = ins & _dilate8(~ins)
        e2 = 2e-5
        for _ in range(3):                                                  # snap border vertices onto the outline
            xb, yb = Xt[border], Yt[border]
            s0 = _hole_sd(cavs, xb, yb, seed)
            gx = (_hole_sd(cavs, xb + e2, yb, seed) - _hole_sd(cavs, xb - e2, yb, seed)) / (2 * e2)
            gy = (_hole_sd(cavs, xb, yb + e2, seed) - _hole_sd(cavs, xb, yb - e2, seed)) / (2 * e2)
            g2 = gx * gx + gy * gy + 1e-9
            step = np.clip(s0 / g2, -0.0004, 0.0004)
            Xt[border] = xb - step * gx
            Yt[border] = yb - step * gy
        sd = _hole_sd(cavs, Xt, Yt, seed)
        sd[ins] = 0.0
        wd = 0.00055
        hfac = (1 - (1 - np.clip(sd / wd, 0, 1)) ** 3) ** (1 / 3.0)
        wall = 1 - np.clip(sd / (2.4 * wd), 0, 1)
        q_in = ins[:-1] & ins[1:] & np.roll(ins, -1, 1)[:-1] & np.roll(ins, -1, 1)[1:]
    else:
        hfac, wall = np.ones_like(Xt), np.zeros_like(Xt)
        q_in = np.zeros((nr - 1, nth), bool)

    wedge, thw = rng.uniform(0, 0.22), rng.uniform(0, 2 * np.pi)
    h_rim = 0.5 * t_rim * (1 + wedge * np.cos(th - thw)) + 0.00012 * C.fbm3(c3 * 3.0 + 11, 3, seed=seed + 4)
    shrink, lipw = rng.uniform(0.40, 0.60), rng.uniform(0.0008, 0.0015)
    f1 = rng.uniform(560, 760)

    def flesh(X, Y, rho, so):
        """Half thickness + crease mask of one dried cut face."""
        P = np.stack([X, Y, np.full_like(X, 0.37 * so)], -1)
        wq = P + 0.0007 * np.stack([C.fbm3(P * 300 + 3.1, 2, seed=seed + so),
                                    C.fbm3(P * 300 + 7.7, 2, seed=seed + so + 1), np.zeros_like(X)], -1)
        b1 = np.abs(C.perlin3(wq * f1, seed + so + 2)) ** 0.55
        b2 = np.abs(C.perlin3(wq * 1700 + 4.0, seed + so + 3)) ** 0.6
        fine = C.fbm3(P * 4200, 2, seed=seed + so + 4)
        sag = 1 + 0.25 * C.fbm3(P * 100 + 1.3, 2, seed=seed + so + 5)
        lip = C.smoothstep(1 - lipw / Rm, 1.0, rho)[:, None] ** 1.6 * (1 - brk)[None, :]
        hfl = h_rim[None, :] * shrink * sag + 0.00017 * (b1 - 0.62) + 0.00006 * (b2 - 0.6) + 0.000025 * fine
        hfl = np.maximum(hfl, 0.00035)
        h = hfl + (h_rim[None, :] - hfl) * lip
        cav = np.clip((1 - C.smoothstep(0.0, 0.5, b1)) * 0.9 + (1 - C.smoothstep(0, 0.4, b2)) * 0.35, 0, 1) * (1 - lip)
        return h, cav

    def skin_edge(rho):
        return C.smoothstep(1 - 0.00050 / Rm, 1 - 0.00012 / Rm, rho)[:, None] * (1 - brk)[None, :]

    calyx_t = np.zeros_like(Xt)
    if cap:                                            # ---- top = skin dome with calyx / stalk scar
        rmt = np.hypot(Xt, Yt)
        Hd = rng.uniform(0.0042, 0.0062)
        dome = Hd * (1 - rho_t[:, None] ** 2.2) ** 0.62 * (1 + 0.07 * C.fbm3(
            np.stack([Xt * 120, Yt * 120, np.zeros_like(Xt)], -1), 2, seed=seed + 30))
        Zt = 0.6 * h_rim[None, :] + dome
        if kind == 'calyx':
            ph5 = rng.uniform(0, 2 * np.pi)
            Zt -= 0.0015 * np.exp(-(rmt / 0.0015) ** 2)
            lob = (0.5 + 0.5 * np.cos(5 * th[None, :] + ph5)) ** 1.5 * (1 + 0.3 * C.fbm3(c3 * 2.5 + 4, 2, seed=seed + 31))[None, :]
            Zt += 0.00055 * np.exp(-((rmt - 0.0019) / 0.00055) ** 2) * (0.35 + 0.65 * lob)
            calyx_t = np.clip(1.25 * np.exp(-(rmt / 0.0027) ** 2), 0, 1)
        else:
            Zt -= 0.0008 * np.exp(-(rmt / 0.0011) ** 2)
            calyx_t = np.clip(1.2 * np.exp(-(rmt / 0.0010) ** 2), 0, 1)
        cav_t, skin_t, rad_t, wall_t = np.zeros_like(Xt), np.ones_like(Xt), np.ones_like(Xt), np.zeros_like(Xt)
        Xo, Yo = (rho_f[::-1, None] * Rin[None, :] * cth[None, :]), (rho_f[::-1, None] * Rin[None, :] * sth[None, :])
        hb, cav_o = flesh(Xo, Yo, rho_f[::-1], 50)
        wall_o = np.zeros_like(Xo)
        thp = rng.uniform(0, 2 * np.pi)
        for i in range(5):                             # tips of the cavities: five small dark pits
            cx, cy = 0.2 * Rm * math.cos(thp + i * 1.2566), 0.2 * Rm * math.sin(thp + i * 1.2566)
            wall_o += np.exp(-((Xo - cx) ** 2 + (Yo - cy) ** 2) / (rng.uniform(0.00035, 0.00055)) ** 2)
        hb = np.maximum(hb - 0.0005 * wall_o, 0.00015)
        Zo = -hb
        skin_o, rad_o = skin_edge(rho_f[::-1]), rho_f[::-1, None] + 0 * Xo
        keep_o = np.ones((nr - 1, nth), bool)
    else:                                              # ---- two cut faces with the cavities
        ht, cav_t = flesh(Xt, Yt, rho_t, 10)
        Zt = ht * hfac
        skin_t, rad_t, wall_t = skin_edge(rho_t), rho_t[:, None] + 0 * Xt, wall
        Xo, Yo = Xt[::-1].copy(), Yt[::-1].copy()
        hb, cav_o = flesh(Xo, Yo, rho_t[::-1], 50)
        Zo = -hb * hfac[::-1]
        skin_o, rad_o, wall_o = skin_t[::-1], rad_t[::-1], wall[::-1]
        keep_o = ~q_in[::-1]

    # ---- skin band joining the two faces
    psi = (np.pi / 2 - np.pi * np.arange(1, nb + 1) / (nb + 1))[:, None]
    z_hi, z_lo = Zt[-1][None, :], Zo[0][None, :]
    rad_b = Rin[None, :] + e_b[None, :] * np.cos(psi) ** 0.8
    Xb, Yb = rad_b * cth[None, :], rad_b * sth[None, :]
    Zb = 0.5 * (z_hi + z_lo) + 0.5 * (z_hi - z_lo) * np.sin(psi)
    skin_b = np.repeat((1 - brk)[None, :], nb, 0)

    V = np.stack([np.concatenate([Xt, Xb, Xo]), np.concatenate([Yt, Yb, Yo]), np.concatenate([Zt, Zb, Zo])], -1).reshape(-1, 3)
    nrows = 2 * nr + nb
    faces = C.grid_faces(nrows, nth, wrap_v=True)[:, ::-1]
    skin = np.concatenate([skin_t, skin_b, skin_o]).ravel()
    cav_f = np.concatenate([cav_t, np.zeros((nb, nth)), cav_o]).ravel()
    rad = np.concatenate([rad_t, np.ones((nb, nth)), rad_o]).ravel()
    wall_a = np.concatenate([wall_t, np.zeros((nb, nth)), wall_o]).ravel()
    calyx = np.concatenate([calyx_t, np.zeros((nb, nth)), np.zeros_like(Xo)]).ravel()

    # ---- skin shrivel wrinkles: real displacement along the normal
    nrm = C.vertex_normals(V, faces)
    if np.mean(nrm[:nr * nth // 2, 2]) < 0:
        faces, nrm = faces[:, ::-1], -nrm
    q = V * [1.0, 1.0, 1.0 if cap else 0.45]
    wq = q + 0.0005 * np.stack([C.fbm3(q * 260 + 1.7, 2, seed=seed + 23), C.fbm3(q * 260 + 5.1, 2, seed=seed + 24),
                                C.fbm3(q * 260 + 8.3, 2, seed=seed + 25)], -1)
    fs = rng.uniform(640, 820) if cap else rng.uniform(850, 1150)
    s1 = np.abs(C.perlin3(wq * fs + 2.0, seed + 20)) ** 0.5
    s2 = np.abs(C.perlin3(wq * fs * 2.3 + 5.0, seed + 21)) ** 0.6
    how = 0.45 + 0.55 * C.smoothstep(-0.3, 0.3, C.fbm3(q * 180 + 2.0, 2, seed=seed + 22))
    amp = 0.00034 if cap else 0.00017
    V = V + nrm * (skin * amp * how * ((s1 - 0.72) + 0.4 * (s2 - 0.62)))[:, None]
    cav_s = np.clip(how * ((1 - C.smoothstep(0, 0.5, s1)) * 0.9 + (1 - C.smoothstep(0, 0.4, s2)) * 0.4), 0, 1)
    cav = cav_f * (1 - skin) + cav_s * skin

    keep = np.ones((nrows - 1, nth), bool)
    keep[:nr - 1] = ~q_in
    keep[nr + nb:nr + nb + nr - 1] = keep_o
    faces = faces[keep.ravel()]

    # ---- drying warp: saddle / cup / three-fold curl + slight in-plane distortion (stones follow it)
    ws = 0.35 if cap else 1.0
    A2, Ac, A3 = rng.normal(0, 0.0013) * ws, rng.uniform(-0.0014, 0.0014) * ws, rng.normal(0, 0.0006) * ws
    t2, t3 = rng.uniform(0, np.pi), rng.uniform(0, 2 * np.pi)

    def warp(v):
        x, y = v[:, 0], v[:, 1]
        rr, an = np.hypot(x, y) / Rm, np.arctan2(y, x)
        p3 = np.stack([x, y, np.zeros_like(x) + 0.1 * seed], -1)
        zw = (A2 * rr ** 2 * np.cos(2 * (an - t2)) + Ac * rr ** 2 + A3 * rr ** 3 * np.cos(3 * (an - t3))
              + 0.00035 * ws * C.fbm3(p3 * 70, 2, seed=seed + 40))
        out = v.copy()
        out[:, 0] += 0.0005 * C.fbm3(p3 * 55 + 3.3, 2, seed=seed + 41)
        out[:, 1] += 0.0005 * C.fbm3(p3 * 55 + 6.6, 2, seed=seed + 42)
        out[:, 2] += zw
        return out

    V = warp(V)
    parts = [(V, faces, 0, dict(skin=skin, cav=cav, rad=rad, wall=wall_a, calyx=calyx))]
    lo, hi = V.min(0), V.max(0)                         # size of the slice itself (stalk excluded)

    if stones and cavs:
        hs0 = float(np.mean(h_rim))
        for i in rng.choice(5, size=min(5, stones), replace=False):
            sv, sf, slot, sat = _stone_part(cavs[i], hs0 * rng.uniform(0.70, 0.92), rng.normal(0, 0.00022))
            parts.append((warp(sv), sf, slot, sat))
    if kind == 'stalk' and seed % 2 == 0:               # short dry fruit stalk
        n = 14
        t = np.linspace(0, 1, n)[:, None]
        p0 = V[0] - np.array([0, 0, 0.0003])
        az = rng.uniform(0, 2 * np.pi)
        d = np.array([math.cos(az) * 0.8, math.sin(az) * 0.8, 0.6])
        side = np.cross(d, [0, 0, 1.0])
        ln = rng.uniform(0.003, 0.0055)
        path = p0 + d * ln * t + side * ln * 0.3 * rng.normal() * t ** 2 - np.array([0, 0, 1.0]) * ln * 0.35 * t ** 2
        r = 0.00042 * (1.2 - 0.4 * t[:, 0])
        r[-1] *= 0.15
        sv, sf = C.tube(path, r, nv=12)
        parts.append((sv, sf, 2, {}))

    ctr = 0.5 * (lo + hi)
    parts = [(p[0] - ctr, p[1], p[2], p[3]) for p in parts]
    half = (0.5 * (hi[0] - lo[0]) * 0.97, 0.5 * (hi[1] - lo[1]) * 0.97, 0.5 * (hi[2] - lo[2]) * 0.92)
    return parts, half


def _merge(parts):
    v, f, fm = C.merge_meshes([(p[0], p[1], p[2]) for p in parts])
    at = {k: np.concatenate([np.asarray(p[3][k], float).ravel() if k in p[3] else np.zeros(len(p[0])) for p in parts])
          for k in ATTRS}
    return v, f, fm, at


# ----------------------------------------------------------------------------- 2. materials
def shanzha_material(sss_method='BURLEY'):
    """Dried flesh (cut faces, hole walls) and skin (rim band, end-cap dome) in ONE material,
    blended by the baked vertex masks."""
    m = C.Mat('shanzha', sss_method=sss_method)
    P = m.per_instance_coords()
    skin_a, cav, rad, wall, cal = m.attr('skin'), m.attr('cav'), m.attr('rad'), m.attr('wall'), m.attr('calyx')
    skin = m.map_range(skin_a, 0.30, 0.70, smooth=True)
    # --- flesh: tan / yellow-brown, paler near the core, red-brown stain under the skin
    mott = m.noise(scale=240, detail=3, roughness=0.6, vector=P)
    mott2 = m.noise(scale=950, detail=3, roughness=0.6, vector=P)
    fl = m.mix((0.50, 0.275, 0.115), (0.33, 0.150, 0.055), m.map_range(mott, 0.30, 0.72))
    fl = m.mix(fl, (0.58, 0.37, 0.165), m.math('MULTIPLY', m.map_range(rad, 0.66, 0.30), 0.55))
    stain = m.math('MULTIPLY', m.map_range(rad, 0.66, 0.985, smooth=True), m.map_range(mott2, 0.2, 0.8, 0.40, 1.0))
    fl = m.mix(fl, (0.25, 0.050, 0.026), m.math('MULTIPLY', stain, 0.85))
    fl = m.mix(fl, (0.20, 0.075, 0.034), m.map_range(cav, 0.10, 1.0, 0.0, 0.42, smooth=True))
    fl = m.mix(fl, (0.115, 0.038, 0.020), m.map_range(wall, 0.30, 1.0, 0.0, 0.85, smooth=True))
    fl = m.mix(fl, (0.19, 0.078, 0.036), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.65))
    sp = m.noise(scale=5200, detail=2, roughness=0.7, vector=P)                # stone-cell speckle
    fl = m.hsv(fl, 0.5, 1.0, m.map_range(sp, 0.30, 0.70, 0.84, 1.14))
    # --- skin: deep red to maroon, dark creases, pale lenticel dots
    sn = m.noise(scale=330, detail=3, roughness=0.6, vector=P)
    sk = m.mix((0.29, 0.014, 0.011), (0.105, 0.007, 0.007), m.map_range(sn, 0.30, 0.70))
    sk = m.mix(sk, (0.050, 0.005, 0.005), m.map_range(cav, 0.2, 0.9, 0.0, 0.80, smooth=True))
    vd = m.voronoi(scale=820, vector=P)
    vc = m.node('ShaderNodeSeparateColor', {0: m.voronoi(scale=820, vector=P, output='Color')}).outputs[0]
    dot = m.math('MULTIPLY', m.map_range(vd, 0.10, 0.20, 1.0, 0.0, smooth=True), m.math('GREATER_THAN', vc, 0.38))
    sk = m.mix(sk, (0.40, 0.27, 0.17), m.math('MULTIPLY', dot, 0.85))
    col = m.mix(fl, sk, skin)
    col = m.mix(col, (0.030, 0.017, 0.011), m.map_range(cal, 0.25, 0.85, smooth=True))
    col = m.jitter(col, hue=0.010, saturation=0.10, value=0.20)
    # --- roughness / specular: matte grainy flesh, leathery semi-gloss skin
    rn = m.noise(scale=1700, detail=4, roughness=0.6, vector=P)
    r_fl = m.map_range(rn, 0.25, 0.75, 0.62, 0.86)
    r_sk = m.math('ADD', m.map_range(rn, 0.25, 0.75, 0.27, 0.47), m.math('MULTIPLY', cav, 0.22))
    r_sk = m.mixf(r_sk, 0.7, dot)
    rough = m.mixf(r_fl, r_sk, skin)
    rough = m.mixf(rough, 0.85, m.map_range(cal, 0.25, 0.85))
    # --- micro relief
    inv = m.math('SUBTRACT', 1.0, skin)
    g1 = m.noise(scale=1500, detail=4, roughness=0.65, vector=P)
    g2 = m.noise(scale=5200, detail=3, roughness=0.7, vector=P)
    nrm = m.bump(m.math('MULTIPLY', g1, inv), strength=0.9, distance=0.00014)
    nrm = m.bump(m.math('MULTIPLY', g2, inv), strength=0.8, distance=0.00005, normal=nrm)
    Ps = m.mapping(P, scale=(1.0, 1.0, 0.35))
    cr = m.noise(scale=2300, detail=3, roughness=0.65, vector=Ps)
    nrm = m.bump(m.math('MULTIPLY', cr, skin), strength=0.7, distance=0.00011, normal=nrm)
    nrm = m.bump(m.math('MULTIPLY', dot, skin), strength=0.5, distance=0.00004, normal=nrm)
    nrm = m.micro_bump(scale=9000, strength=0.35, distance=0.00003, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.47, specular=m.mixf(0.22, 0.48, skin),
          sss=0.50, sss_radius=m.mix((1.0, 0.52, 0.28), (1.0, 0.16, 0.08), skin), sss_scale=0.0009,
          normal=nrm)
    return m


def stone_material():
    """Bony pale-yellow stone: smooth sawn face, darker seed chamber, browner flanks."""
    m = C.Mat('shanzha_stone')
    P = m.per_instance_coords()
    n = m.noise(scale=650, detail=3, roughness=0.6, vector=P)
    col = m.mix((0.56, 0.385, 0.175), (0.40, 0.245, 0.10), m.map_range(n, 0.30, 0.70))
    col = m.mix(col, (0.27, 0.13, 0.05), m.math('MULTIPLY', m.attr('cav'), 0.6))
    col = m.mix(col, (0.06, 0.028, 0.014), m.map_range(m.attr('seedh'), 0.25, 0.8, smooth=True))
    col = m.jitter(col, hue=0.008, saturation=0.08, value=0.14)
    rn = m.noise(scale=2600, detail=3, vector=P)
    nrm = m.bump(m.noise(scale=1900, detail=3, roughness=0.6, vector=m.mapping(P, scale=(0.3, 1, 1))), 0.5, 0.00006)
    nrm = m.micro_bump(scale=8000, strength=0.4, distance=0.00003, vector=P, normal=nrm)
    m.set(base_color=col, roughness=m.map_range(rn, 0.25, 0.75, 0.38, 0.60), specular=0.4,
          sss=0.25, sss_radius=(1.0, 0.6, 0.3), sss_scale=0.0005, normal=nrm)
    return m


def stem_material():
    m = C.Mat('shanzha_stem')
    n = m.noise(scale=2600, detail=3)
    m.set(base_color=m.ramp(n, [(0.3, (0.07, 0.035, 0.018)), (0.7, (0.18, 0.10, 0.05))]), roughness=0.78,
          normal=m.bump(n, 0.5, 0.00005))
    return m


# ----------------------------------------------------------------------------- 3. assets
def build_variants(seed=0, link=True, on_ground=False):
    """All mesh variants as bpy objects.  Returns (objects, half_sizes, heights)."""
    mats = [shanzha_material(), stone_material(), stem_material()]
    objs, shapes, heights = [], [], []
    for i, sp in enumerate(SPECS):
        parts, half = make_piece(i + 100 * seed, **sp)
        v, f, fm, at = _merge(parts)
        if on_ground:
            v = v - np.array([0.0, 0.0, v[:, 2].min()])
        objs.append(C.mesh_from_arrays('shanzha_%02d' % i, v, f, attrs=at, materials=mats, face_mat=fm, link=link))
        shapes.append(half)
        heights.append(float(v[:, 2].max() - v[:, 2].min()))
    return objs, shapes, heights


def make_items(seed=0, link=False):
    """Loose items of 山楂 as found in a pharmacy jar, for the top-down flat-lay re-use.
    Template objects at real-world scale (metres), each lying flat in its resting pose (cut face /
    skin dome up), lowest point on z = 0, origin at the footprint centre.  Items 0-6 are slices
    (holes, stones, torn core, broken piece), 7-8 end caps (calyx, stalk), 9 a loose stone.
    link=False: the objects are NOT linked to the scene (instance them, e.g. with
    common.instance_on_points / variants_collection)."""
    objs, shapes, heights = build_variants(seed, link=link, on_ground=True)
    return dict(objects=objs, footprint_r=[float(max(h[0], h[1]) / 0.97) for h in shapes],
                half_height=[0.5 * h for h in heights], name='山楂')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    rng = np.random.default_rng(args.seed)

    variants, shapes, _ = build_variants(0)
    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=3.0, coverage=0.72, weights=WEIGHTS, seed=args.seed,
                       scale_range=(0.90, 1.08), tilt_deg=15, roll_deg=15, flip=True, candidates=6, sink=0.10,
                       rough=0.004)
    dark = (rng.random(len(heap)) < 0.16) * rng.uniform(0.4, 1.0, len(heap))
    C.instance_on_points('heap', variants, heap, attrs={'dark': dark})
    C.dome_base(R_DOME - 0.002, C.simple_material('base', (0.030, 0.010, 0.006), 0.9))

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.53, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(0.86, 1.0, 0.90), key=0.80, fill=0.80, rim=1.0, world=1.0, key_size=1.0)

    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp, crop=args.region, text=not args.region)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
