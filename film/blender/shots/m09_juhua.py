# -*- coding: utf-8 -*-
"""m09_juhua - dried chrysanthemum flower heads (菊花: 贡菊 / 杭白菊 for tea), kind = pile.

    python m09_juhua.py --quality draft   --out /tmp/x.png
    python m09_juhua.py --quality draft   --res 3840x2160 --spp 24 --region 0.35,0.60,0.65,0.90   # final-density crop
    python m09_juhua.py --quality final   --out film/renders/m09_juhua.png                         # still + _depth.npy

One flower head (capitulum, 20-29 mm) is built from real parts, all numpy, units = metres:
  * 100-140 ligulate ray florets ("petals"): thin single sheets (44 x 11 vertices each) swept along a
    curled / kinked / twisted centre line, channelled cross-section (margins rolled in), narrow
    claw, blunt toothed tip, crinkled margins - 5-7 rows, outer rows long and spreading, inner rows
    short, erect and incurved over the centre;
  * a button of golden tubular disc florets (5-toothed little tubes on a Vogel spiral);
  * the involucre underneath: saucer-shaped receptacle, 3 rows of imbricate bracts with pale
    scarious margins, short cut stem stub.
Petals are zero-thickness sheets shaded as a thin translucent leaf (Principled + Translucent mix):
the back light glows through them, which is what dried chrysanthemum looks like in a macro photo.

make_items(seed) returns loose items (heads in resting poses + single petals) for the flat-lay film.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 'm09_juhua'
R_DOME = 0.42             # bare dome radius -> a 25 mm head is ~170 px (1920 frame) at the horizon
SEED = 3                  # default heap seed (chosen by a framing scan)
N_UP, N_FLIP = 7, 2       # head mesh variants built face-up / built upside-down (involucre showing)
SKY_TINT = (0.80, 0.87, 1.0)   # navy night sky of the shot -> cool fill / rim


# ----------------------------------------------------------------------------- helpers
def _rot(axis, ang):
    c, s = math.cos(ang), math.sin(ang)
    if axis == 0:
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 1:
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def _merge(parts):
    """[(verts, faces, slot, {attr: array})] -> verts, [faces], face_mat, attrs (missing attrs = 0)."""
    shapes = {}
    for p in parts:
        for k, v in p[3].items():
            shapes[k] = np.asarray(v).shape[1:]
    out = {k: [] for k in shapes}
    for v, f, slot, at in parts:
        n = len(v)
        for k, shp in shapes.items():
            out[k].append(np.asarray(at[k], np.float32).reshape((n,) + shp) if k in at
                          else np.zeros((n,) + shp, np.float32))
    verts, faces, fm = C.merge_meshes([(p[0], p[1], p[2]) for p in parts])
    return verts, faces, fm, {k: np.concatenate(v, 0) for k, v in out.items()}


# ----------------------------------------------------------------------------- 1. geometry
def petal_sheets(rng, seed, base, phi, theta0, curl, L, hw, row, ns=44, nt=11, dry=1.0, age0=0.2):
    """P ligulate florets as one vertex soup.  Each starts at base[p] and grows in the local frame
    (radial = azimuth phi[p], tangential, axial = +Z): initial elevation theta0, total extra elevation
    `curl` (incurving) along its length L, flat half-width hw.  Returns verts, quad faces, attrs."""
    P = len(phi)
    sl = np.linspace(0.0, 1.0, ns)[None, :]                              # (1, ns)
    pid = rng.uniform(0, 500, P)[:, None]                                # decorrelates noise per petal

    def n1(freq, off, sd):                                               # smooth noise along each petal (P, ns)
        q = np.stack(np.broadcast_arrays(sl * freq, pid, np.full((1, 1), off)), -1)
        return C.perlin3(q, seed + sd)

    cexp = rng.uniform(0.8, 1.7, P)[:, None]
    kink = rng.uniform(0.25, 0.60, P)[:, None] * dry
    th = theta0[:, None] + curl[:, None] * sl ** cexp + 1.2 * kink * n1(2.3, 1.7, 1) * np.sqrt(sl)
    ps = (rng.normal(0, 0.16, P)[:, None] + rng.normal(0, 0.45, P)[:, None] * sl ** 1.5
          + 0.9 * kink * n1(2.3, 5.3, 2) * np.sqrt(sl))
    ds = (L / (ns - 1))[:, None, None]
    T = np.stack([np.cos(th) * np.cos(ps), np.cos(th) * np.sin(ps), np.sin(th)], -1)       # (P, ns, 3)
    Cl = np.cumsum(T * ds, axis=1) - T * ds
    W = np.stack([-np.sin(ps), np.cos(ps), np.zeros_like(ps)], -1)
    N = np.stack([-np.sin(th) * np.cos(ps), -np.sin(th) * np.sin(ps), np.cos(th)], -1)
    tw = rng.normal(0, 0.9, P)[:, None] * C.smoothstep(0.15, 1.0, sl) + 0.5 * kink * n1(3.1, 9.1, 3)
    ct, st = np.cos(tw)[..., None], np.sin(tw)[..., None]
    W2, N2 = W * ct + N * st, N * ct - W * st
    # cross-section: circular arc of half-angle gam (0 = flat, 2.5 = rolled into a tube)
    gm = rng.uniform(0.35, 1.5, P)[:, None]
    gt = gm + rng.uniform(-0.2, 0.9, P)[:, None]
    gam = (gm + (2.3 - gm) * (1 - C.smoothstep(0.0, 0.32, sl)) + (gt - gm) * C.smoothstep(0.55, 1.0, sl)
           + 0.35 * n1(3.7, 13.3, 4))
    gam = np.clip(gam, 0.08, 2.7)
    s_t = 0.84
    wprof = 0.17 + 0.83 * C.smoothstep(0.0, 0.5, sl) ** 0.8                               # narrow claw
    tipr = np.sqrt(np.clip(1 - 0.93 * np.clip((sl - s_t) / (1 - s_t), 0, 1) ** 2, 0, 1))   # blunt tip
    h = hw[:, None] * wprof * tipr * (1 + 0.20 * dry * n1(4.5, 17.7, 5))                  # shrivelled width
    t = np.linspace(-1.0, 1.0, nt)[None, None, :]
    g3, h3 = gam[..., None], h[..., None]
    x = h3 * np.sin(g3 * t) / g3
    y = h3 * (1 - np.cos(g3 * t)) / g3 - 0.5 * h3 * (1 - np.cos(g3)) / g3
    sgn = np.where(rng.random(P) < 0.82, 1.0, -1.0)[:, None, None]                         # mostly involute
    S3 = np.broadcast_to(sl[..., None], (P, ns, nt))
    T3 = np.broadcast_to(t, (P, ns, nt))
    qs = np.stack([S3 * (L[:, None, None] / 0.0017), T3 * (hw[:, None, None] / 0.0011),
                   np.broadcast_to(pid[..., None], (P, ns, nt))], -1)
    cr = C.perlin3(qs, seed + 6) + 0.45 * C.perlin3(qs * [2.7, 2.3, 1.0] + 3.3, seed + 7)
    edge = 0.30 + 0.70 * np.abs(T3) ** 1.5
    hn = 0.00024 * dry * cr * edge * C.smoothstep(0.05, 0.3, S3)                           # crinkled margins
    tooth = 0.5 - 0.5 * np.cos(3 * np.pi * T3 + rng.uniform(0, 6.28, P)[:, None, None])
    dT = -L[:, None, None] * 0.035 * tooth * C.smoothstep(0.85, 1.0, S3)                   # 2-3 tip teeth
    loc = (Cl[:, :, None, :] + W2[:, :, None, :] * x[..., None] + N2[:, :, None, :] * (sgn * y + hn)[..., None]
           + T[:, :, None, :] * dT[..., None])
    cph, sph = np.cos(phi)[:, None, None], np.sin(phi)[:, None, None]
    X = base[:, None, None, 0] + loc[..., 0] * cph - loc[..., 1] * sph
    Y = base[:, None, None, 1] + loc[..., 0] * sph + loc[..., 1] * cph
    Z = base[:, None, None, 2] + loc[..., 2]
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    f0 = C.grid_faces(ns, nt, wrap_v=False)
    faces = (f0[None] + (np.arange(P) * ns * nt)[:, None, None]).reshape(-1, 4)
    prand = rng.random(P)
    age = np.clip(age0 + rng.normal(0, 0.28, P), 0, 1)
    bc = lambda a: np.broadcast_to(np.asarray(a)[:, None, None], (P, ns, nt))              # noqa: E731
    puv = np.stack([T3, S3, bc(prand)], -1).reshape(-1, 3)
    pinfo = np.stack([bc(row), bc(age), np.zeros((P, ns, nt))], -1).reshape(-1, 3)
    return verts, faces, dict(puv=puv, pinfo=pinfo)


def disc_florets(rng, base, axis, length, radius, nseg=10):
    """Tubular disc florets: tapered tube, flared 5-toothed limb, dark hollow mouth."""
    n = len(base)
    sf = np.array([0.0, 0.50, 0.80, 0.93, 1.0, 0.94, 0.72])
    rf = np.array([0.55, 0.62, 0.95, 1.08, 0.80, 0.42, 0.18])
    tr = np.array([0, 0, 0, 0.12, 0.30, 0, 0.0])
    tz = np.array([0, 0, 0, 0, 0.07, 0, 0.0])
    pvv = np.array([0.0, 0.50, 0.80, 0.93, 1.0, 1.5, 1.5])
    nr = len(sf)
    ang = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    teeth = np.cos(5 * ang)
    ref = np.where(np.abs(axis[:, 2:3]) < 0.95, [[0.0, 0.0, 1.0]], [[1.0, 0.0, 0.0]])
    u = np.cross(axis, ref)
    u /= np.linalg.norm(u, axis=1, keepdims=True)
    v = np.cross(axis, u)
    rad = radius[:, None, None] * rf[None, :, None] * (1 + tr[None, :, None] * teeth[None, None, :])
    zl = length[:, None, None] * (sf[None, :, None] + tz[None, :, None] * teeth[None, None, :])
    bend = rng.normal(0, 0.12, (n, 2))
    off_u = (bend[:, 0] * length)[:, None, None] * sf[None, :, None] ** 2
    off_v = (bend[:, 1] * length)[:, None, None] * sf[None, :, None] ** 2
    cu = rad * np.cos(ang)[None, None, :] + off_u
    cv = rad * np.sin(ang)[None, None, :] + off_v
    P3 = (base[:, None, None, :] + axis[:, None, None, :] * zl[..., None] + u[:, None, None, :] * cu[..., None]
          + v[:, None, None, :] * cv[..., None])
    f0 = C.grid_faces(nr, nseg, wrap_v=True)
    faces = (f0[None] + (np.arange(n) * nr * nseg)[:, None, None]).reshape(-1, 4)
    r = rng.random(n)
    puv = np.stack([np.zeros((n, nr, nseg)), np.broadcast_to(pvv[None, :, None], (n, nr, nseg)),
                    np.broadcast_to(r[:, None, None], (n, nr, nseg))], -1).reshape(-1, 3)
    return P3.reshape(-1, 3), faces, dict(puv=puv)


def _involucre(rng, rr, hc, h_inv, r_stem):
    """Receptacle body (closed lathe about Z), 3 rows of bracts, cut stem stub.  Slot 2."""
    parts = []
    rr1 = rr * 1.04
    # receptacle: dome top (hidden under the florets) + saucer below
    u = np.linspace(0, 1, 7)
    pr = np.concatenate([np.maximum(rr * u, 1e-5), r_stem + (rr1 - r_stem) * np.sin(np.linspace(1, 0, 12) * np.pi / 2)])
    pz = np.concatenate([hc * (1 - u ** 2), -h_inv * np.cos(np.linspace(1, 0, 12) * np.pi / 2)])
    nv = 28
    a = np.linspace(0, 2 * np.pi, nv, endpoint=False)
    v = np.stack([pr[:, None] * np.cos(a)[None], pr[:, None] * np.sin(a)[None], np.repeat(pz[:, None], nv, 1)], -1)
    n = v.shape[0] * nv
    parts.append((v.reshape(-1, 3), C.grid_faces(len(pr), nv, wrap_v=True), 2,
                  dict(puv=np.tile([0.15, 0.5, 0.5], (n, 1)))))
    # bracts
    nsb, ntb = 9, 5
    sb = np.linspace(0, 1, nsb)[None, :, None]
    tb = np.linspace(-1, 1, ntb)[None, None, :]
    for nb0, u0, u1, off in ((12, 0.40, 1.08, 0.00006), (10, 0.16, 0.84, 0.00020), (8, 0.00, 0.50, 0.00034)):
        nb = int(nb0 + rng.integers(-1, 2))
        ph0 = 2 * np.pi * (np.arange(nb) + rng.uniform(-0.2, 0.2, nb)) / nb + rng.uniform(0, 6.28)
        uu = u0 + (u1 - u0) * sb * rng.uniform(0.85, 1.1, nb)[:, None, None]
        shape = (1 - sb ** 2.4) ** 0.55 * (0.72 + 0.28 * C.smoothstep(0, 0.25, sb))
        ph = ph0[:, None, None] + tb * (np.pi / nb) * 1.30 * shape * rng.uniform(0.85, 1.15, nb)[:, None, None]
        uu = np.broadcast_to(uu, ph.shape)
        uc = np.clip(uu, 0, 1)
        r = np.where(uu <= 1, r_stem + (rr1 - r_stem) * np.sin(uc * np.pi / 2), rr1 + (uu - 1) * h_inv * 0.3)
        z = np.where(uu <= 1, -h_inv * np.cos(uc * np.pi / 2), (uu - 1) * h_inv * 1.5)
        r = r + off + rng.uniform(0, 0.0007, nb)[:, None, None] * sb ** 2 - 0.00012 * np.abs(tb)
        z = z - 0.5 * off
        bv = np.stack([r * np.cos(ph), r * np.sin(ph), z], -1).reshape(-1, 3)
        f0 = C.grid_faces(nsb, ntb, wrap_v=False)
        bf = (f0[None] + (np.arange(nb) * nsb * ntb)[:, None, None]).reshape(-1, 4)
        pale = np.maximum(np.abs(tb) ** 2 * 0.9, C.smoothstep(0.7, 1.0, sb) * 0.8) + 0 * ph
        puv = np.stack([pale, np.broadcast_to(sb, ph.shape), np.broadcast_to(rng.random(nb)[:, None, None], ph.shape)],
                       -1).reshape(-1, 3)
        parts.append((bv, bf, 2, dict(puv=puv)))
    # stem stub with a cut end
    ln = rng.uniform(0.0015, 0.0060)
    d = np.array([rng.normal(0, 0.28), rng.normal(0, 0.28), -1.0])
    d /= np.linalg.norm(d)
    tt = np.concatenate([np.linspace(0, 1, 7), [1.004, 1.006]])[:, None]
    side = np.cross(d, [1.0, 0.0, 0.0])
    path = np.array([0, 0, -h_inv * 0.8]) + d * ln * tt + side * ln * 0.2 * rng.normal() * tt ** 2
    rad = r_stem * np.concatenate([np.linspace(1.15, 0.95, 7), [0.80, 0.02]])
    sv, sf_ = C.tube(path, rad, nv=12)
    cut = np.repeat((tt[:, 0] > 1.0).astype(float), 12)
    parts.append((sv, sf_, 2, dict(puv=np.stack([np.full(len(sv), 0.25), np.repeat(tt[:, 0], 12), np.full(len(sv), 0.5)], 1),
                                    pinfo=np.stack([np.ones(len(sv)), cut, np.zeros(len(sv))], 1))))
    return parts


def make_head(seed, flipped=False, ns=44, nt=11):
    """One dried flower head, face up (+Z) unless `flipped`, centred on its collision ellipsoid.
    Returns dict(verts, faces, face_mat, attrs, half=(a, b, c))."""
    rng = np.random.default_rng(9000 + seed)
    Rh = rng.uniform(0.0100, 0.0142)                 # flower radius
    style = rng.random()                             # 0 = tight pompon (贡菊), 1 = open, big yellow eye (杭白菊)
    rr = Rh * rng.uniform(0.27, 0.33)                # receptacle radius
    hc = rr * rng.uniform(0.20, 0.40)                # receptacle dome height
    rdisc = rr * (0.42 + 0.30 * style)               # radius of the disc-floret button
    h_inv = rr * rng.uniform(0.55, 0.80)             # depth of the involucre saucer
    r_stem = rng.uniform(0.0008, 0.0011)
    K = int(rng.integers(5, 8))                      # rows of ray florets
    n_out = int(rng.integers(22, 30))
    curl0 = 1.30 * (1 - 0.45 * style)
    L0 = (Rh - rr) * curl0 / math.sin(curl0)
    A = {k: [] for k in ('phi', 'r', 'th', 'cu', 'L', 'hw', 'row')}
    for k in range(K):
        f = k / (K - 1.0)                            # 0 = outermost row, 1 = innermost
        n = max(8, int(round(n_out * (1 - 0.52 * f))))
        A['phi'].append(2 * np.pi * (np.arange(n) + rng.uniform(-0.38, 0.38, n)) / n + rng.uniform(0, 6.28))
        A['r'].append(rr * (1.0 - (1.0 - rdisc / rr - 0.04) * f) * rng.uniform(0.94, 1.04, n))
        th0 = -0.14 + (1.36 - 0.30 * style) * f ** 0.85 + rng.normal(0, 0.15, n)
        cu = curl0 * (1 - 0.58 * f) + rng.normal(0, 0.36, n)
        if k < 2:                                    # a few outer petals reflexed towards the stem
            rf = rng.random(n) < 0.14
            cu = np.where(rf, -rng.uniform(0.2, 0.8, n), cu)
            th0 = np.where(rf, th0 - 0.2, th0)
        ln = L0 * (1.0 - 0.36 * f) * rng.uniform(0.82, 1.08, n)
        ln = np.where(rng.random(n) < 0.06, ln * rng.uniform(0.45, 0.7, n), ln)          # broken ones
        A['th'].append(th0)
        A['cu'].append(cu)
        A['L'].append(ln)
        A['hw'].append(Rh * 0.118 * (1 - 0.26 * f) * rng.uniform(0.75, 1.2, n))
        A['row'].append(np.full(n, f))
    A = {k: np.concatenate(v) for k, v in A.items()}
    base = np.stack([A['r'] * np.cos(A['phi']), A['r'] * np.sin(A['phi']),
                     hc * (1 - np.clip(A['r'] / rr, 0, 1) ** 2) + 0.0003], 1)
    pv_, pf_, pat = petal_sheets(rng, 100 + seed * 13, base, A['phi'], A['th'], A['cu'], A['L'], A['hw'], A['row'],
                                 ns, nt, age0=rng.uniform(0.0, 0.5))
    parts = [(pv_, pf_, 0, pat)]
    # disc florets on a Vogel spiral; the young ones in the middle are shorter (dimpled button)
    nd = max(12, int(np.pi * rdisc ** 2 / 0.00062 ** 2))
    i = np.arange(nd) + 0.5
    rd = rdisc * np.sqrt(i / nd)
    pd = i * 2.39996323 + rng.uniform(0, 6.28)
    dl = 0.5 * rd / rdisc + rng.normal(0, 0.10, nd)
    ax = np.stack([np.sin(dl) * np.cos(pd), np.sin(dl) * np.sin(pd), np.cos(dl)], 1)
    bd = np.stack([rd * np.cos(pd), rd * np.sin(pd), hc * (1 - (rd / rr) ** 2) - 0.0002], 1)
    ln = Rh * 0.27 * (0.55 + 0.45 * C.smoothstep(0.0, 0.7, rd / rdisc)) * rng.uniform(0.85, 1.12, nd)
    dv, df, dat = disc_florets(rng, bd, ax, ln, 0.00034 * (0.75 + 0.25 * rd / rdisc) * rng.uniform(0.85, 1.15, nd))
    parts.append((dv, df, 1, dat))
    parts += _involucre(rng, rr, hc, h_inv, r_stem)
    verts, faces, fm, attrs = _merge(parts)
    # whole-head deformation: dried heads are squashed, lopsided, never rotationally symmetric
    a = rng.uniform(0, 2 * np.pi)
    e = rng.uniform(0.0, 0.14)
    ca, sa = math.cos(a), math.sin(a)
    uu = (verts[:, 0] * ca + verts[:, 1] * sa) * (1 + e)
    ww = (-verts[:, 0] * sa + verts[:, 1] * ca) * (1 - e)
    zz = verts[:, 2] * rng.uniform(0.80, 1.0) * (1 + rng.uniform(-0.28, 0.28) * uu / Rh)
    verts = np.stack([uu * ca - ww * sa, uu * sa + ww * ca, zz], 1)
    q = verts / 0.012 + rng.uniform(0, 50, 3)
    verts = verts + 0.0010 * np.stack([C.fbm3(q, 2, seed=seed + 41), C.fbm3(q + 9.1, 2, seed=seed + 42),
                                       C.fbm3(q + 4.3, 2, seed=seed + 43)], 1)
    npet = len(pv_)
    pz = verts[:npet, 2]
    zmin, zmax = min(float(np.percentile(pz, 0.5)), -h_inv), float(np.percentile(pz, 99.5))
    verts[:, 2] -= 0.5 * (zmin + zmax)
    r97 = float(np.percentile(np.hypot(verts[:npet, 0], verts[:npet, 1]), 97))
    half = (0.90 * r97, 0.90 * r97, 0.90 * 0.5 * (zmax - zmin))
    if flipped:
        verts = verts * [1.0, -1.0, -1.0]
    return dict(verts=verts, faces=faces, face_mat=fm, attrs=attrs, half=half)


def make_loose(seed, kind='petal'):
    """A detached ray floret (or a short fragment / a single disc floret), PCA-aligned: long axis X,
    flat side Z, centred.  Returns dict like make_head."""
    rng = np.random.default_rng(7000 + seed)
    if kind == 'floret':
        v, f, at = disc_florets(rng, np.zeros((1, 3)), np.array([[1.0, 0, 0]]), np.array([rng.uniform(0.0028, 0.0038)]),
                                np.array([0.00036]))
        slot = 1
    else:
        L = rng.uniform(0.0030, 0.0055, 1) if kind == 'frag' else rng.uniform(0.0075, 0.0130, 1)
        v, f, at = petal_sheets(rng, 300 + seed, np.zeros((1, 3)), np.zeros(1), rng.normal(0, 0.1, 1),
                                rng.uniform(-0.3, 0.9, 1), L, rng.uniform(0.0011, 0.0017, 1),
                                np.array([rng.random()]), dry=1.3, age0=rng.uniform(0.1, 0.7))
        slot = 0
    c = v.mean(0)
    _, _, vt = np.linalg.svd(v - c, full_matrices=False)
    if np.linalg.det(vt) < 0:
        vt[2] *= -1
    v = (v - c) @ vt.T
    v -= 0.5 * (v.max(0) + v.min(0))
    verts, faces, fm, attrs = _merge([(v, f, slot, at)])
    return dict(verts=verts, faces=faces, face_mat=fm, attrs=attrs, half=tuple(0.5 * np.ptp(v, axis=0)))


# ----------------------------------------------------------------------------- 2. materials
def petal_material():
    """Thin papery ligule: ivory / cream, yellow claw, brown-edged when old, fine parallel veins.
    Principled (diffuse + sheen) mixed with a warm Translucent BSDF = light glows through."""
    m = C.Mat('ju_petal')
    uvr = m.attr('puv', output='Vector')
    sep = m.node('ShaderNodeSeparateXYZ', {0: uvr})
    pu, pv, pr = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    inf = m.node('ShaderNodeSeparateXYZ', {0: m.attr('pinfo', output='Vector')})
    row, age = inf.outputs[0], inf.outputs[1]
    tone = m.attr('tone', 'INSTANCER')                      # 0 = white head ... 1 = yellowed head
    dark = m.attr('dark', 'INSTANCER')                      # a few stale, tan heads
    P = m.per_instance_coords()
    mott = m.noise(scale=380, detail=3, roughness=0.6, vector=P)
    col = m.mix((0.84, 0.81, 0.70), (0.78, 0.715, 0.53), m.map_range(mott, 0.30, 0.72))       # ivory <-> cream
    col = m.mix(col, (0.72, 0.60, 0.30), m.math('MULTIPLY', m.map_range(pr, 0.55, 1.0), 0.45))  # some petals creamier
    # yellowing towards the claw, stronger on yellowed heads and on the inner rows
    yb = m.map_range(pv, 0.02, 0.62, 1.0, 0.0, smooth=True)
    yb = m.math('MULTIPLY', yb, m.math('ADD', m.map_range(tone, 0, 1, 0.50, 1.0), m.math('MULTIPLY', row, 0.25)), clamp=True)
    col = m.mix(col, (0.66, 0.47, 0.13), yb)
    col = m.mix(col, (0.72, 0.60, 0.30), m.math('MULTIPLY', tone, 0.38))
    # old petals: brown tips and margins in blotches
    bn = m.noise(scale=1.0, detail=3, roughness=0.6, vector=m.mapping(uvr, scale=(1.3, 3.2, 31.0)))
    tipm = m.math('MULTIPLY', m.map_range(pv, 0.45, 1.0), m.map_range(bn, 0.42, 0.68, smooth=True))
    tipm = m.math('MULTIPLY', tipm, m.map_range(age, 0.25, 0.9), clamp=True)
    col = m.mix(col, (0.40, 0.25, 0.09), m.math('MULTIPLY', tipm, 0.85))
    col = m.mix(col, (0.50, 0.37, 0.18), m.math('MULTIPLY', dark, 0.55))
    # veins: fine parallel streaks along the ligule (slightly darker, and relief)
    vein = m.noise(scale=1.0, detail=2.5, roughness=0.6, vector=m.mapping(uvr, scale=(5.5, 0.45, 47.0)))
    col = m.mix(col, (0.80, 0.72, 0.54), m.map_range(vein, 0.50, 0.78), blend='MULTIPLY')
    col = m.jitter(col, hue=0.008, saturation=0.15, value=0.07)
    rn = m.noise(scale=1300, detail=3, roughness=0.6, vector=P)
    rough = m.map_range(rn, 0.25, 0.75, 0.52, 0.80)
    nrm = m.bump(vein, strength=0.7, distance=0.00006)
    crinkle = m.noise(scale=2300, detail=3, roughness=0.65, vector=P)
    nrm = m.bump(crinkle, strength=0.55, distance=0.00009, normal=nrm)
    nrm = m.micro_bump(scale=9000, strength=0.4, distance=0.00003, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.45, specular=0.30, sheen=0.30, sheen_roughness=0.5, normal=nrm)
    tcol = m.mix(col, (1.0, 0.89, 0.64), 1.0, blend='MULTIPLY')
    tr = m.node('ShaderNodeBsdfTranslucent', {'Color': tcol, 'Normal': nrm})
    mix = m.node('ShaderNodeMixShader', {0: 0.34, 1: m.bsdf.outputs[0], 2: tr.outputs[0]})
    m.nt.links.new(mix.outputs[0], m.out.inputs['Surface'])
    return m


def disc_material():
    """Dried tubular disc florets: golden yellow tubes, orange-brown teeth, dark mouth."""
    m = C.Mat('ju_disc', sss_method='BURLEY')
    sep = m.node('ShaderNodeSeparateXYZ', {0: m.attr('puv', output='Vector')})
    pv, pr = sep.outputs[1], sep.outputs[2]
    P = m.per_instance_coords()
    col = m.ramp(pv, [(0.0, (0.34, 0.20, 0.035)), (0.55, (0.60, 0.35, 0.035)), (0.90, (0.64, 0.33, 0.028)),
                      (1.0, (0.42, 0.17, 0.016))])
    col = m.mix(col, (0.33, 0.15, 0.03), m.map_range(pr, 0.55, 1.0, 0.0, 0.7))                 # browner ones
    col = m.mix(col, (0.05, 0.02, 0.004), m.map_range(pv, 1.1, 1.4))                           # hollow mouth
    col = m.mix(col, (0.36, 0.22, 0.06), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.5))
    col = m.jitter(col, hue=0.012, saturation=0.10, value=0.15)
    n = m.noise(scale=4000, detail=3, vector=P)
    m.set(base_color=col, roughness=m.map_range(n, 0.3, 0.7, 0.45, 0.70), specular=0.35,
          sss=0.30, sss_radius=(1.0, 0.45, 0.12), sss_scale=0.0004, normal=m.bump(n, 0.5, 0.00004))
    return m


def bract_material():
    """Involucre bracts (olive-brown, pale scarious margins), receptacle, stem stub with a pale cut."""
    m = C.Mat('ju_bract')
    sep = m.node('ShaderNodeSeparateXYZ', {0: m.attr('puv', output='Vector')})
    pale = sep.outputs[0]
    inf = m.node('ShaderNodeSeparateXYZ', {0: m.attr('pinfo', output='Vector')})
    stem, cut = inf.outputs[0], inf.outputs[1]
    P = m.per_instance_coords()
    n = m.noise(scale=900, detail=4, roughness=0.6, vector=P)
    col = m.mix((0.165, 0.170, 0.060), (0.300, 0.255, 0.095), n)
    col = m.mix(col, (0.52, 0.42, 0.24), m.map_range(pale, 0.15, 0.9, smooth=True))
    col = m.mix(col, m.mix((0.25, 0.22, 0.10), (0.38, 0.31, 0.15), n), stem)
    col = m.mix(col, (0.62, 0.54, 0.36), cut)
    col = m.jitter(col, hue=0.015, saturation=0.15, value=0.15)
    fib = m.noise(scale=2600, detail=3, roughness=0.6, vector=m.mapping(P, scale=(1.0, 1.0, 0.3)))
    m.set(base_color=col, roughness=m.map_range(n, 0.3, 0.7, 0.60, 0.82), specular=0.30, sheen=0.35,
          sheen_roughness=0.5, normal=m.bump(fib, 0.6, 0.00006))
    return m


def make_materials():
    return [petal_material(), disc_material(), bract_material()]


def _object(name, h, mats, link=True):
    return C.mesh_from_arrays(name, h['verts'], h['faces'], attrs=h['attrs'], materials=mats,
                              face_mat=h['face_mat'], link=link)


# ----------------------------------------------------------------------------- loose items (flat-lay)
def make_items(seed=0):
    """Loose items as found in a tea jar, real-world scale, each in a natural resting pose with its
    lowest point on z = 0 and the origin at the footprint centre: 6 flower heads (4 face up and
    slightly tilted, 1 lying on its side, 1 face down showing involucre + stem stub) and 2 single
    detached petals."""
    mats = make_materials()
    rng = np.random.default_rng(500 + seed)
    objs, foot, hh = [], [], []
    poses = [8, 15, 5, 22, 78, 174]                              # tilt of the flower axis from vertical (deg)
    todo = [('head', i, t) for i, t in enumerate(poses)] + [('petal', 20, 0), ('petal', 21, 0)]
    for kind, i, tilt in todo:
        h = make_head(seed * 100 + i) if kind == 'head' else make_loose(seed * 100 + i)
        Rm = _rot(2, rng.uniform(0, 2 * math.pi)) @ _rot(0, math.radians(tilt))
        v = h['verts'] @ Rm.T
        v[:, 2] -= v[:, 2].min()
        v[:, :2] -= 0.5 * (v[:, :2].max(0) + v[:, :2].min(0))
        h = dict(h, verts=v)
        objs.append(_object('juhua_item_%d' % len(objs), h, mats))
        foot.append(float(np.percentile(np.hypot(v[:, 0], v[:, 1]), 99.5)))
        hh.append(float(0.5 * v[:, 2].max()))
    return dict(objects=objs, footprint_r=foot, half_height=hh, name='菊花')


# ----------------------------------------------------------------------------- hero scene
def scatter_on_heap(heap, n, rng, lift=0.0004, candidates=3, lowness=1.0):
    """Drop n small flat items on the heap's heightfield, preferring hollows; they lie along the local
    slope with a random yaw.  Returns loc (n,3), quat (n,4)."""
    from scipy.ndimage import map_coordinates, gaussian_filter
    gx, gy, Hf = heap.gx, heap.gy, heap.height
    res = gx[1] - gx[0]
    Hs = gaussian_filter(Hf, 0.008 / res)
    d_y, d_x = np.gradient(gaussian_filter(Hf, 1.2), res)
    xmin, xmax, ymin, ymax = heap.extent
    cx, cy = heap.center[0], heap.center[1]
    best = None
    for k in range(candidates):
        x = rng.uniform(xmin, xmax, n) + cx
        y = rng.uniform(ymin, ymax, n) + cy
        ij = [(y - gy[0]) / res, (x - gx[0]) / res]
        z = map_coordinates(Hf, ij, order=1)
        low = (z - map_coordinates(Hs, ij, order=1)) * lowness + rng.normal(0, 0.002, n)
        cur = np.stack([low, x, y, z, map_coordinates(d_x, ij, order=1), map_coordinates(d_y, ij, order=1)], 1)
        best = cur if best is None else np.where((cur[:, 0] < best[:, 0])[:, None], cur, best)
    loc = np.stack([best[:, 1], best[:, 2], best[:, 3] + lift], 1)
    rot = np.zeros((n, 3, 3))
    for i in range(n):
        sx, sy = best[i, 4], best[i, 5]
        sl = math.hypot(sx, sy)
        if sl > 1.4:
            sx, sy = sx * 1.4 / sl, sy * 1.4 / sl
        nz = np.array([-sx, -sy, 1.0])
        nz /= np.linalg.norm(nz)
        ax = np.cross([0, 0, 1.0], nz)
        sa = np.linalg.norm(ax)
        Ra = np.eye(3)
        if sa > 1e-9:
            ax /= sa
            ang = math.asin(min(1.0, sa))
            Kx = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
            Ra = np.eye(3) + math.sin(ang) * Kx + (1 - math.cos(ang)) * (Kx @ Kx)
        rot[i] = Ra @ _rot(2, rng.uniform(0, 6.283)) @ _rot(1, rng.normal(0, 0.3)) @ _rot(0, rng.normal(0, 0.6))
    return loc, C._quat_from_matrix(rot)


def main():
    args = C.parse_args(seed=SEED)
    sc = C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    sc.cycles.diffuse_bounces = 4                    # white petals: inter-reflection keeps the crevices clean
    rng = np.random.default_rng(args.seed)
    mats = make_materials()

    # 1. head variants
    variants, shapes = [], []
    for i in range(N_UP + N_FLIP):
        h = make_head(i, flipped=(i >= N_UP))
        variants.append(_object('head%d' % i, h, mats))
        shapes.append(h['half'])
    weights = [1.0] * N_UP + [0.8] * N_FLIP

    # 2. heap of heads on the dome, random facing
    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=2.7, coverage=0.72, weights=weights, seed=args.seed,
                       scale_range=(0.85, 1.12), tilt_deg=22, roll_deg=40, candidates=7, sink=0.22, rough=0.0035)
    n = len(heap)
    tone = np.clip(rng.beta(1.6, 3.0, n), 0, 1)
    dark = (rng.random(n) < 0.08) * rng.uniform(0.4, 1.0, n)
    C.instance_on_points('heap', variants, heap, attrs={'tone': tone, 'dark': dark})
    C.dome_base(R_DOME - 0.004, C.simple_material('base', (0.085, 0.065, 0.035), 0.9))

    # 3. loose petals, fragments and shed disc florets between / on the heads
    loose, kinds = [], ['petal'] * 5 + ['frag'] * 2 + ['floret']
    for i, kd in enumerate(kinds):
        loose.append(_object('loose%d' % i, make_loose(i, kd), mats))
    nl = int(1.25 * n)
    loc, quat = scatter_on_heap(heap, nl, rng)
    var = rng.choice(len(kinds), nl, p=np.array([1.0] * 5 + [0.9] * 2 + [1.6]) / 8.4)
    C.instance_on_points('loose', loose, loc=loc, quat=quat, scale=rng.uniform(0.85, 1.15, nl), var=var,
                         attrs={'tone': np.clip(rng.beta(1.6, 2.2, nl), 0, 1), 'dark': (rng.random(nl) < 0.15) * 0.8})

    # 4. camera fitted to the real heap, lens-like DOF, back-lit food lighting in the night-sky key
    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.56, edge=0.685, top_margin=0.025)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=SKY_TINT, key=0.66, fill=0.50, rim=0.9, world=1.0, key_size=1.0)

    # 5. render, verify the framing contract, write the judging composite
    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    if args.region:
        C.quick_comp(args.out, SHOT, comp, crop=args.region, text=False)
    else:
        C.quick_comp(args.out, SHOT, comp)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
