# -*- coding: utf-8 -*-
"""k14_rougui - cassia cinnamon bark (肉桂): mound of quills, troughs, chunks and chips.

    python k14_rougui.py --quality preview --threads 2 --out /tmp/x.png
    python k14_rougui.py --quality final   --out film/renders/k14_rougui.png

A piece of bark is a SHEET of thickness t rolled up: the cross-section centre line is integrated
from a curvature profile (double scroll 企边桂 / single scroll 桂通 / trough / flat chunk), offset
+-t/2 into the rough grey-brown outer surface and the smooth red-brown inner surface, closed by
rounded side edges and by broken / sawn end faces that show the layered cross-section (paler
line between outer and inner layer).  All relief (lenticels, wrinkles, striations) is real
displacement on the unrolled sheet.  Units: metres.
"""
import os, sys, math, shutil
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 'k14_rougui'
R_DOME = 1.05
KINDS = ['double', 'double', 'double', 'single', 'single', 'trough', 'trough', 'chunk', 'chunk',
         'chip', 'chip', 'chip']
WEIGHTS = [1.0, 1.0, 1.0, 0.9, 0.9, 0.7, 0.7, 0.55, 0.55, 0.45, 0.45, 0.45]


# ----------------------------------------------------------------------------- 1. geometry
def _section(kap, a):
    """Integrate curvature kap(..., n) over arc coordinate a(..., n) -> y, z, theta (anchored mid)."""
    da = np.diff(a, axis=-1)
    km = 0.5 * (kap[..., 1:] + kap[..., :-1])
    zero = np.zeros_like(a[..., :1])
    th = np.concatenate([zero, np.cumsum(km * da, -1)], -1)
    mid = a.shape[-1] // 2
    th = th - th[..., mid:mid + 1]
    thm = 0.5 * (th[..., 1:] + th[..., :-1])
    y = np.concatenate([zero, np.cumsum(np.cos(thm) * da, -1)], -1)
    z = np.concatenate([zero, np.cumsum(np.sin(thm) * da, -1)], -1)
    return y - y[..., mid:mid + 1], z - z[..., mid:mid + 1], th


def _fit_curl(kfun, W, t0, cmax):
    """Largest curl factor <= 1 for which the rolled sheet does not touch itself."""
    u = np.linspace(0, 1, 200)
    a = (u - 0.5) * W
    far = np.abs(a[:, None] - a[None]) > 3.2 * t0
    k = 1.0
    if not far.any():
        return k
    for _ in range(80):
        kap = np.minimum(kfun(u) * k * cmax, 1.2 / t0)
        y, z, _ = _section(kap, a)
        d = np.hypot(y[:, None] - y[None], z[:, None] - z[None])
        if d[far].min() >= 1.55 * t0:
            break
        k *= 0.955
    return k


def _qn(v, q):
    return np.cross(v[q[1]] - v[q[0]], v[q[3]] - v[q[0]])


def make_quill(seed, kind, res=1.0):
    """One piece of cassia bark.  Long axis X, widest across Y, flattest in Z.
    -> verts, faces(quads), attrs, half_sizes."""
    rng = np.random.default_rng(4100 + 17 * seed)
    if kind == 'double':
        L, t0, W = rng.uniform(0.062, 0.098), rng.uniform(0.0022, 0.0035), rng.uniform(0.050, 0.072)
        r_mid, n_ = rng.uniform(0.011, 0.016), rng.uniform(1.6, 2.6)
        re0, re1 = rng.uniform(0.0042, 0.0060, 2) + 0.5 * t0
        kfun = lambda u: 1 / r_mid + (np.where(u < 0.5, 1 / re0, 1 / re1) - 1 / r_mid) * np.abs(2 * u - 1) ** n_
    elif kind == 'single':
        L, t0, W = rng.uniform(0.060, 0.095), rng.uniform(0.0024, 0.0040), rng.uniform(0.046, 0.066)
        r_out, r_in = rng.uniform(0.010, 0.014), rng.uniform(0.0040, 0.0055) + 0.5 * t0
        kfun = lambda u: 1 / (r_out + (r_in - r_out) * u ** 1.2)
    elif kind == 'trough':
        L, t0, W = rng.uniform(0.055, 0.090), rng.uniform(0.0030, 0.0048), rng.uniform(0.030, 0.044)
        r_, sk = rng.uniform(0.010, 0.016), rng.normal(0, 0.25)
        kfun = lambda u: (1 + sk * (2 * u - 1) + 0.5 * np.abs(2 * u - 1) ** 3) / r_
    elif kind == 'chunk':
        L, t0, W = rng.uniform(0.030, 0.050), rng.uniform(0.0030, 0.0052), rng.uniform(0.022, 0.036)
        r_, sk = rng.uniform(0.016, 0.034), rng.normal(0, 0.4)
        kfun = lambda u: (1 + sk * (2 * u - 1)) / r_
    else:                                                          # chip / splinter
        L, t0, W = rng.uniform(0.012, 0.026), rng.uniform(0.0016, 0.0028), rng.uniform(0.006, 0.013)
        r_, sk = rng.uniform(0.010, 0.030), rng.normal(0, 0.4)
        kfun = lambda u: (1 + sk * (2 * u - 1)) / r_
    small = kind in ('chunk', 'chip')
    ns = int(np.clip(L / 0.00028 * res, 36, 340))
    nc = int(np.clip(W / 0.00030 * res, 20, 230))
    nw = 9
    ne = nw - 2
    sd = 31 * seed + 5
    s = np.linspace(0, 1, ns)[:, None]
    uj = np.linspace(0, 1, nc)[None, :]

    # curl factor / sheet width vary slowly along the length
    line = np.concatenate([s * L, np.zeros_like(s), np.zeros_like(s)], -1)
    cvar = 1.0 + 0.045 * np.clip(C.fbm3(line * 28.0 + 3.3, 2, seed=sd), -1, 1)[:, None]
    kfit = _fit_curl(kfun, W, t0, 1.05)
    e0 = np.clip(0.022 + 0.030 * C.fbm3(line * 90.0 + 11.0, 3, seed=sd + 1), 0, 0.07)[:, None]
    e1 = np.clip(0.022 + 0.030 * C.fbm3(line * 90.0 + 23.0, 3, seed=sd + 2), 0, 0.07)[:, None]
    ue = e0 + uj * (1 - e0 - e1)
    a = (ue - 0.5) * W                                             # (ns, nc) arc coordinate on the sheet
    kap = np.minimum(kfun(ue) * kfit * cvar, 1.2 / t0)
    cy, cz, th = _section(kap, a)
    ty, tz = np.cos(th), np.sin(th)
    ny, nz = np.sin(th), -np.cos(th)                               # outward (convex / outer-bark side)

    # jagged (snapped) or nearly straight (sawn) ends
    an = ((uj - 0.5) * W)[0]
    ends = []
    for k in range(2):
        broken = small or rng.random() < 0.55
        amp = min(0.0032, 0.10 * L) if broken else 0.0004
        slope = rng.normal(0, 0.22 if broken else 0.04)
        q = np.stack([an, np.zeros_like(an), np.zeros_like(an)], -1)
        j = amp * (C.fbm3(q * 85.0 + 5.0 * k, 3, seed=sd + 3 + k) + 0.35 * C.fbm3(q * 420.0, 2, seed=sd + 5 + k))
        ends.append(j + slope * an)
    x0 = (-0.5 * L + ends[0])[None, :]
    x1 = (0.5 * L + ends[1])[None, :]
    X = x0 + s * (x1 - x0)                                          # (ns, nc)

    # ---- relief on the unrolled sheet (p in metres)
    p = np.stack([X, a, np.zeros_like(X)], -1)
    d_edge = np.minimum(uj, 1 - uj) * W * np.ones_like(X)
    thick = t0 * (1 + 0.13 * C.fbm3(p * [50, 50, 1], 3, seed=sd + 7)) * (0.55 + 0.45 * C.smoothstep(0.0, 0.0045, d_edge))
    und = C.fbm3(p * [60, 60, 1] + 1.7, 3, seed=sd + 8)
    pw = p + np.stack([0.004 * C.fbm3(p * [45, 45, 1] + 51.0, 2, seed=sd + 30),
                       0.0016 * C.fbm3(p * [38, 60, 1] + 77.0, 3, seed=sd + 31), np.zeros_like(X)], -1)
    how = 0.25 + 0.75 * C.smoothstep(-0.30, 0.30, C.fbm3(p * [34, 34, 1] + 91.0, 2, seed=sd + 32))
    wr = how * C.ridged3(pw * [70, 430, 1] + 4.1, 3, seed=sd + 9) ** 2     # longitudinal wrinkle creases
    wr2 = how * C.ridged3(pw * [230, 1200, 1] + 8.3, 2, seed=sd + 10) ** 2
    F1, F2, cid = C.cellular3((pw * [1 / 0.0030, 1 / 0.0080, 1]).reshape(-1, 3) + [0, 0, 0.5], seed=sd + 11)
    F1, cid = F1.reshape(X.shape), cid.reshape(X.shape)
    lent = C.smoothstep(0.20 + 0.5 * cid, 0.06, F1) * (cid < 0.30)             # transverse lenticel ridges
    lichn = C.fbm3(p * [48, 48, 1] + 13.0, 4, seed=sd + 12)
    lich = C.smoothstep(0.12, 0.36, lichn) * rng.uniform(0.35, 1.0)
    fine = C.fbm3(p * [1500, 1500, 1], 3, seed=sd + 13)
    scal = C.smoothstep(-0.05, 0.05, C.fbm3(p * [150, 240, 1] + 31.0, 3, seed=sd + 14))   # flaky cork plates
    h_o = (0.00026 * und - 0.00024 * wr - 0.00009 * wr2 + 0.00026 * lent * (0.6 + 2.0 * cid)
           + 0.00007 * lich + 0.00005 * fine + 0.00010 * scal)
    h_i = (0.00014 * C.fbm3(p * [70, 70, 1] + 2.2, 3, seed=sd + 15)
           + 0.00010 * C.fbm3(p * [42, 900, 1], 3, seed=sd + 16)
           + 0.00004 * C.fbm3(p * [60, 2600, 1], 2, seed=sd + 17))
    Po = np.stack([X, cy + ny * (0.5 * thick + h_o), cz + nz * (0.5 * thick + h_o)], -1)
    Pi = np.stack([X, cy - ny * (0.5 * thick + h_i), cz - nz * (0.5 * thick + h_i)], -1)

    # rounded, slightly ragged side edges (u = 0 and u = 1)
    wk = np.linspace(0, 1, nw)[1:-1]                               # interior thickness coordinate

    def edge(jc, sign):
        o, i_ = Po[:, jc][:, None, :], Pi[:, jc][:, None, :]
        w = wk[None, :, None]
        e = o * (1 - w) + i_ * w
        bul = 0.30 * thick[:, jc][:, None] * np.sin(math.pi * wk)[None, :]
        rag = 1 + 0.5 * C.fbm3(np.stack([X[:, jc] * 700, 0 * X[:, jc], 0 * X[:, jc] + jc], -1), 2, seed=sd + 18)[:, None]
        e[..., 1] += sign * ty[:, jc][:, None] * bul * rag
        e[..., 2] += sign * tz[:, jc][:, None] * bul * rag
        return e                                                   # (ns, ne, 3), w ascending
    E0, E1 = edge(0, -1.0), edge(nc - 1, +1.0)
    ring = np.concatenate([Po, E1, Pi[:, ::-1], E0[:, ::-1]], 1)   # (ns, M, 3)
    M = ring.shape[1]

    # slow twist + bow of the whole piece
    tw = rng.normal(0, 0.16) * (s - 0.5)
    by, bz = rng.normal(0, 0.012, 2) * L
    arc = 4.0 * s * (1 - s) - 0.667
    ct, st = np.cos(tw), np.sin(tw)
    yy = ring[..., 1] * ct - ring[..., 2] * st + by * arc
    zz = ring[..., 1] * st + ring[..., 2] * ct + bz * arc
    ring = np.stack([ring[..., 0], yy, zz], -1)
    lo, hi = ring.reshape(-1, 3).min(0), ring.reshape(-1, 3).max(0)
    ring = ring - 0.5 * (lo + hi)
    half = 0.5 * (hi - lo)

    zc, oc = np.zeros((ns, nc)), np.ones((ns, nc))
    wrow = np.broadcast_to(wk[None, :], (ns, ne))
    A = dict(inner=np.concatenate([zc, wrow, oc, wrow[:, ::-1]], 1),
             cap=np.concatenate([zc, np.ones((ns, ne)), zc, np.ones((ns, ne))], 1),
             lich=np.concatenate([lich, np.zeros((ns, ne)), zc, np.zeros((ns, ne))], 1),
             lent=np.concatenate([lent, np.zeros((ns, ne)), zc, np.zeros((ns, ne))], 1),
             cav=np.concatenate([np.clip(wr * 1.15 + 0.5 * wr2, 0, 1), np.zeros((ns, ne)), zc, np.zeros((ns, ne))], 1))
    verts = [ring.reshape(-1, 3)]
    fs = C.grid_faces(ns, M, wrap_v=True)
    if _qn(verts[0], fs[(ns // 2) * M + nc // 2])[2] > 0:           # outer surface at mid-back must face -Z
        fs = fs[:, ::-1]
    faces = [fs]
    attrs = {k: [v.ravel()] for k, v in A.items()}
    nvt = ns * M

    # end faces: strip between outer and inner surface, granular + stepped (layers snap apart)
    wfull = np.linspace(0, 1, nw)
    for k, row in enumerate((0, ns - 1)):
        r = ring[row]
        o, i_ = r[:nc], r[nc + ne:2 * nc + ne][::-1]
        cols = o[:, None, :] * (1 - wfull)[None, :, None] + i_[:, None, :] * wfull[None, :, None]   # (nc, nw, 3)
        c0 = np.concatenate([o[:1], r[2 * nc + ne:][::-1], i_[:1]], 0)[None]                        # edge 0 bulge column
        c1 = np.concatenate([o[-1:], r[nc:nc + ne], i_[-1:]], 0)[None]
        cap = np.concatenate([c0, cols, c1], 0)                                                     # (nc + 2, nw, 3)
        aa = np.concatenate([an[:1], an, an[-1:]])[:, None] * np.ones((1, nw))
        ww = wfull[None, :] * np.ones((nc + 2, 1))
        q = np.stack([aa, ww * t0, np.zeros_like(aa) + k], -1)
        gran = 0.00030 * C.fbm3(q * 900.0, 3, seed=sd + 20 + k) + 0.00045 * C.fbm3(q * [160, 500, 1], 2, seed=sd + 22 + k)
        step = 0.0007 * rng.normal() * (C.smoothstep(0.36, 0.50, ww) - 0.5) * (1 if amp > 0.001 else 0.2)
        env = np.minimum(1.0, np.minimum(ww, 1 - ww) * 5.0)
        env[0, :] = 0.0
        env[-1, :] = 0.0
        cap[..., 0] += (gran + step) * env
        cf = C.grid_faces(nc + 2, nw, wrap_v=False) + nvt
        vv = cap.reshape(-1, 3)
        want = -1.0 if k == 0 else 1.0
        if _qn(np.concatenate(verts + [vv]), cf[((nc + 2) // 2) * (nw - 1) + nw // 2])[0] * want < 0:
            cf = cf[:, ::-1]
        verts.append(vv)
        faces.append(cf)
        nvt += len(vv)
        attrs['inner'].append(ww.ravel())
        attrs['cap'].append(np.ones(len(vv)))
        for nm in ('lich', 'lent', 'cav'):
            attrs[nm].append(np.zeros(len(vv)))
    verts = np.concatenate(verts)
    faces = np.concatenate(faces)
    attrs = {k: np.concatenate(v) for k, v in attrs.items()}
    return verts, faces, attrs, tuple(float(h) for h in half)


# ----------------------------------------------------------------------------- 2. material
def bark_material():
    m = C.Mat('rougui_bark', sss_method='BURLEY')
    P = m.per_instance_coords()
    inner, cap = m.attr('inner'), m.attr('cap')
    lich, lent, cav = m.attr('lich'), m.attr('lent'), m.attr('cav')
    Pl = m.mapping(P, scale=(0.25, 1.0, 1.0))                       # stretched along the length
    Ps = m.mapping(P, scale=(0.05, 1.0, 1.0))
    # outer bark: grey-brown cork, dark wrinkle creases, tan lenticels, grey-white lichen patches
    n1 = m.noise(scale=240, detail=4, roughness=0.6, vector=P)
    o = m.mix((0.122, 0.080, 0.053), (0.245, 0.172, 0.116), m.map_range(n1, 0.30, 0.72))
    n2 = m.noise(scale=1700, detail=3, roughness=0.6, vector=Pl)
    o = m.mix(o, (0.32, 0.240, 0.170), m.math('MULTIPLY', m.map_range(n2, 0.55, 0.80), 0.40))
    o = m.mix(o, (0.050, 0.030, 0.020), m.map_range(cav, 0.12, 0.85, 0.0, 0.80, smooth=True))
    o = m.mix(o, (0.340, 0.225, 0.130), m.math('MULTIPLY', lent, 0.65))
    ln = m.noise(scale=800, detail=4, roughness=0.7, vector=P)
    lm = m.math('MULTIPLY', m.map_range(lich, 0.20, 0.65, smooth=True), m.map_range(ln, 0.34, 0.56))
    o = m.mix(o, (0.440, 0.425, 0.375), m.math('MULTIPLY', lm, 0.85))
    # inner surface: warm red-brown, fine longitudinal streaks, oily darker bands
    s1 = m.noise(scale=1300, detail=3, roughness=0.6, vector=Ps)
    s2 = m.noise(scale=170, detail=3, roughness=0.5, vector=P)
    i_ = m.mix((0.092, 0.025, 0.010), (0.225, 0.068, 0.024), m.map_range(s1, 0.30, 0.70))
    i_ = m.mix(i_, (0.280, 0.105, 0.040), m.math('MULTIPLY', m.map_range(s2, 0.50, 0.80), 0.50))
    # cross-section: cork / brown granular outer layer / pale stone-cell line / red-brown oily inner layer
    g = m.noise(scale=2600, detail=2, roughness=0.5, vector=P)
    cs = m.ramp(inner, [(0.00, (0.100, 0.064, 0.040)), (0.10, (0.215, 0.115, 0.055)), (0.40, (0.240, 0.128, 0.058)),
                        (0.47, (0.440, 0.305, 0.160)), (0.55, (0.170, 0.050, 0.020)), (1.00, (0.118, 0.032, 0.014))])
    cs = m.mix(cs, (0.050, 0.020, 0.010), m.map_range(g, 0.45, 0.80, 0.0, 0.55))
    im = m.map_range(inner, 0.4, 0.6)
    col = m.mix(m.mix(o, i_, im), cs, cap)
    col = m.jitter(col, hue=0.012, saturation=0.10, value=0.20)
    col = m.mix(col, (0.055, 0.028, 0.017), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.60))
    r_o = m.map_range(n1, 0.30, 0.70, 0.70, 0.90)
    r_i = m.map_range(s1, 0.30, 0.70, 0.36, 0.60)
    rough = m.mixf(m.mixf(r_o, r_i, im), 0.72, cap)
    h_o = m.noise(scale=2300, detail=4, roughness=0.65, vector=Pl)
    h_i = m.math('MULTIPLY', m.noise(scale=3000, detail=3, roughness=0.6, vector=Ps), 0.35)
    h_c = m.noise(scale=3400, detail=3, roughness=0.7, vector=P)
    nrm = m.bump(m.mixf(m.mixf(h_o, h_i, im), h_c, cap), strength=0.9, distance=0.00022)
    nrm = m.micro_bump(scale=8000, strength=0.4, distance=0.00004, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.48, specular=0.40,
          normal=nrm)                                              # bark is opaque: no SSS (render speed)
    return m


# ----------------------------------------------------------------------------- loose items (flat-lay)
def make_items(seed=0):
    """Six loose pieces of cassia bark as found in a pharmacy jar: two double scrolls, a single
    scroll, a trough, a chunk and a chip; each in a resting pose, lowest point on z = 0, origin
    at the footprint centre."""
    mat = bark_material()
    rng = np.random.default_rng(9100 + seed)
    kinds = ['double', 'double', 'single', 'trough', 'chunk', 'chip']
    objs, foot, hh = [], [], []
    for i, kind in enumerate(kinds):
        v, f, attrs, half = make_quill(100 + 50 * seed + i, kind)
        roll = math.pi * float(rng.integers(0, 2)) + math.radians(rng.normal(0, 6.0))
        if kind == 'trough':
            roll = math.pi + math.radians(rng.normal(0, 5.0))       # a trough rests on its two edges
        c, s = math.cos(roll), math.sin(roll)
        v = v @ np.array([[1, 0, 0], [0, c, -s], [0, s, c]]).T
        cxy = 0.5 * (v[:, :2].max(0) + v[:, :2].min(0))
        v = v - np.array([cxy[0], cxy[1], v[:, 2].min()])
        objs.append(C.mesh_from_arrays('rougui_item_%d' % i, v, f, attrs=attrs, material=mat))
        foot.append(float(np.percentile(np.hypot(v[:, 0], v[:, 1]), 99.5)))
        hh.append(float(0.5 * v[:, 2].max()))
    return dict(objects=objs, footprint_r=foot, half_height=hh, name='肉桂',
                weights=[1.0, 1.0, 0.9, 0.7, 0.6, 0.6],
                inst_attrs={'dark': lambda r, k: (r.random(k) < 0.12) * r.uniform(0.4, 1.0, k)})


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    rng = np.random.default_rng(args.seed)
    mat = bark_material()
    variants, shapes = [], []
    for i, kind in enumerate(KINDS):
        v, f, attrs, half = make_quill(i, kind)
        variants.append(C.mesh_from_arrays('quill%d' % i, v, f, attrs=attrs, material=mat))
        shapes.append((half[0] * 1.22, half[1] * 1.05, half[2] * 1.0))   # ellipsoid proxy of a cylinder-like piece
    print('[rougui] verts', sum(len(o.data.vertices) for o in variants))

    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=2.6, coverage=0.72, weights=WEIGHTS, seed=args.seed,
                       scale_range=(0.90, 1.10), tilt_deg=3.5, roll_deg=40, flip=True, candidates=8, sink=0.05,
                       max_slope_deg=20, rough=0.010, grid_res=0.0012)
    dark = (rng.random(len(heap)) < 0.12) * rng.uniform(0.4, 1.0, len(heap))
    C.instance_on_points('heap', variants, heap, attrs={'dark': dark})
    C.dome_base(R_DOME - 0.004, C.simple_material('base', (0.030, 0.016, 0.010), 0.9))

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.54, edge=0.64)      # tuned: lumpy heap of long quills
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(1.0, 0.92, 0.82), key=1.35, fill=1.15, rim=1.2, world=1.2, key_size=1.0)

    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp)
    print('[comp]', comp)
    if args.quality == 'preview' and not args.region:
        shutil.copyfile(comp, os.path.join(C.PREVIEW_DIR, SHOT + '_prev_comp.jpg'))


if __name__ == '__main__':
    main()
