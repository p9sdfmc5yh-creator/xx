# -*- coding: utf-8 -*-
"""m07_baihe - dried lily bulb scales (百合干), kind = pile.

    python m07_baihe.py --quality preview --threads 2 --out /tmp/p.png
    python m07_baihe.py --quality draft --res 3840x2160 --spp 24 --region 0.36,0.56,0.64,0.86 --out /tmp/c.png
    python m07_baihe.py --quality final --out film/renders/m07_baihe.png

A scale is a closed thin shell: boat / spoon shaped (curved along its length, cupped across), 22-43 mm
long, 10-18 mm wide, 1.6-2.7 mm thick in the middle thinning to a ruffled translucent edge, with
fine longitudinal veins + shrivel wrinkles as real displacement.  Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 'm07_baihe'
N_VARIANTS = 9
R_DOME = 0.46                       # 30 mm scale -> ~190 px in the 1920 frame at the horizon
BROKEN = {6: 1, 7: 2}               # variant -> 1 tip snapped off, 2 base half missing
WEIGHTS = [1.0] * 6 + [0.55, 0.55, 1.0]
REF = '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad/ref/%s.jpg' % SHOT


def _n1(t, row, seed, octaves=3):
    """fbm of a scalar field t (any shape) on its own noise 'row'."""
    t = np.asarray(t, float)
    p = np.stack([t, np.full(t.shape, float(row)), np.full(t.shape, 0.37)], -1)
    return C.fbm3(p, octaves, seed=seed)


# ----------------------------------------------------------------------------- 1. geometry
def make_scale(seed, broken=0, nu=250, nv=208):
    """One dried lily scale.  Long axis X (base at -X, tip at +X), width Y, concave (inner) face +Z.
    Returns (verts, faces, attrs, half_sizes) - verts centred on the bounding box."""
    rng = np.random.default_rng(4100 + seed)
    L = rng.uniform(0.024, 0.043)
    Wd = float(np.clip(L * rng.uniform(0.36, 0.52), 0.010, 0.0185))
    th = rng.uniform(0.0016, 0.0027)
    s = np.linspace(0.0, 1.0, nu)[:, None]
    psi = np.linspace(0, 2 * math.pi, nv, endpoint=False)[None, :]
    ph = psi + 0.2 * np.sin(2 * psi)                       # more vertices across the faces, fewer at the rim
    S, PH = np.broadcast_arrays(s, ph)
    S = S.copy(); PH = PH.copy()
    yn, sn = np.cos(PH), np.sin(PH)                         # yn: across (-1..1), sn > 0 inner face
    asn = np.abs(sn)
    side = C.smoothstep(-0.5, 0.5, yn)

    # --- which part of the full scale exists (truncated base scar, optional fracture)
    s0, s1, jag0, jag1 = rng.uniform(0.05, 0.10), 0.975, 0.012, 0.0
    if broken == 1:
        s1, jag1 = rng.uniform(0.50, 0.72), 0.075
    elif broken == 2:
        s0, jag0 = rng.uniform(0.30, 0.45), 0.075
    s0e = s0 + jag0 * _n1(yn * 2.6, 8.3, seed + 41)
    s1e = s1 + jag1 * _n1(yn * 2.6, 3.1, seed + 40)
    se = np.clip(s0e + (s1e - s0e) * S, 1e-4, 0.999)

    # --- outline: elongated oval, widest below the middle, narrowing to a blunt point
    k = rng.uniform(0.74, 0.92)
    sf = np.linspace(1e-4, 0.999, 400)
    pmax = (np.sin(math.pi * sf ** k) ** (0.55 + 0.33 * sf)).max()
    prof = np.sin(math.pi * se ** k) ** (0.55 + 0.33 * se) / pmax
    cb, ct = 0.030, (0.020 if broken == 1 else 0.030)
    cap = (np.sqrt(np.clip(1 - np.clip(1 - S / cb, 0, 1) ** 2, 0, 1)) *
           np.sqrt(np.clip(1 - np.clip((S - (1 - ct)) / ct, 0, 1) ** 2, 0, 1)))
    en = _n1(se * 5.0, 1.7, seed + 42) * (1 - side) + _n1(se * 5.0, 5.9, seed + 43) * side
    halfw = 0.5 * Wd * prof * cap * (1 + 0.08 * en)

    # --- thickness: fleshy base / middle, thin towards tip and rim (lens with a rounded edge)
    lump = C.fbm3(np.stack([se * L * 120.0, yn * Wd * 120.0, np.full(S.shape, seed * 1.3)], -1), 2, seed=seed + 44)
    th_s = (th * (0.30 + 0.70 * (1 - C.smoothstep(0.30, 1.0, se))) * (1 + 0.20 * lump)
            * cap ** 0.7 * np.clip(prof * 2.0, 0, 1) ** 0.5)
    e_edge = rng.uniform(0.16, 0.26)
    t_loc = th_s * (e_edge * asn + (1 - e_edge) * asn ** 1.7)       # full local thickness
    zh = 0.5 * t_loc * np.sign(sn) * (1.0 - 0.25 * np.tanh(sn * 3.0))   # outer face bulges more

    # --- mid surface: boat (sag along the length), cup across, ruffled rim, twist
    yw = yn * prof * cap
    u = 2 * se - 1
    dL = rng.uniform(0.07, 0.19) * L
    zl = dL * (u ** 2 + 0.30 * rng.normal() * u ** 3)
    dW = rng.uniform(0.10, 0.26) * Wd
    zc = dW * yw ** 2 * (0.65 + 0.35 * (1 - se))
    wl = rng.uniform(0.005, 0.009)
    rf = _n1(se * L / wl, 2.3, seed + 45) * (1 - side) + _n1(se * L / wl, 6.6, seed + 46) * side
    zr = rng.uniform(0.0007, 0.0016) * np.abs(yw) ** 2.2 * rf
    X = (se - 0.5 * (s0 + s1)) * L
    Y = yn * halfw + rng.normal(0, 0.03) * L * (4 * S * (1 - S) - 0.667)
    Z = zl + zc + zr + zh
    tw = rng.normal(0, 0.22) * (S - 0.5)
    Y, Z = Y * np.cos(tw) - Z * np.sin(tw), Y * np.sin(tw) + Z * np.cos(tw)
    G = np.stack([X, Y, Z], -1)

    # --- normals of the smooth shell (finite differences on the grid)
    ds = np.gradient(G, axis=0)
    dv = np.roll(G, -1, 1) - np.roll(G, 1, 1)
    nrm = np.cross(dv, ds)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-12)

    # --- relief: shrivel wrinkles running lengthwise, parallel veins, soft dents
    q = np.stack([se * L * 1000.0, yn * halfw * 1000.0, zh * 1500.0], -1)        # mm
    warp = 1.2 * 0.5 * np.stack([C.fbm3(q * 0.35 + 7.1, 3, seed=seed + 1),
                                 C.fbm3(q * 0.35 + 3.7, 3, seed=seed + 2),
                                 C.fbm3(q * 0.35 + 9.4, 3, seed=seed + 3)], -1)
    qq = q + warp
    fw = rng.uniform(0.75, 1.15)
    b1 = np.abs(C.perlin3(qq * [0.11 * fw, fw, fw], seed + 10))
    b2 = np.abs(C.perlin3(qq * [0.26 * fw, 2.3 * fw, 2.3 * fw] + 5.0, seed + 11))
    fold, fold2 = b1 ** 0.5, b2 ** 0.6
    how = 0.35 + 0.65 * C.smoothstep(-0.3, 0.3, C.fbm3(q * 0.13 + 21.0, 2, seed=seed + 15))
    dent = C.fbm3(q * 0.22 + 2.0, 2, seed=seed + 14)
    ridge = np.zeros(S.shape)
    nvn = int(rng.integers(5, 9))
    for y0 in np.linspace(-0.80, 0.80, nvn) + rng.normal(0, 0.04, nvn):
        wob = 0.035 * np.sin(se * rng.uniform(5, 11) + rng.uniform(0, 6.28))
        d = (yn - y0 - wob) * np.maximum(halfw, 1e-5)
        ridge += rng.uniform(0.55, 1.0) * np.exp(-(d / rng.uniform(0.00016, 0.00028)) ** 2)
    env = np.clip(np.sin(math.pi * S), 0, 1) ** 0.5 * cap * np.clip(t_loc / 0.0007, 0, 1)
    h = (0.00017 * how * (fold - 0.70) + 0.00006 * how * (fold2 - 0.62)
         + 0.00011 * ridge * (0.82 - 0.18 * np.tanh(sn * 4.0)) + 0.00018 * dent) * env
    V = (G + nrm * h[..., None]).reshape(-1, 3)
    faces = C.grid_faces(nu, nv, wrap_v=True)

    cav = how * ((1 - C.smoothstep(0.0, 0.5, fold)) * 0.9 + (1 - C.smoothstep(0.0, 0.4, fold2)) * 0.35) * env
    edge = np.clip(np.abs(yn) ** 4 + C.smoothstep(0.78, 1.0, se) + (1 - C.smoothstep(0.0, 0.07, S)), 0, 1)
    attrs = dict(cav=np.clip(cav, 0, 1).ravel(), vein=np.clip(ridge * env, 0, 1).ravel(), edge=edge.ravel(),
                 thin=(1 - np.clip(t_loc / th, 0, 1)).ravel(), slen=se.ravel().copy())
    lo, hi = V.min(0), V.max(0)
    V = V - 0.5 * (lo + hi)
    ext = 0.5 * (hi - lo)
    half = (float(ext[0] * 0.96), float(ext[1] * 0.92), float(max(ext[2] * 0.72, 0.0013)))
    return V, faces, attrs, half


# ----------------------------------------------------------------------------- 2. material
def baihe_material(sss_method='BURLEY'):
    m = C.Mat('baihe_scale', sss_method=sss_method)
    cav, vein, edge, thin = m.attr('cav'), m.attr('vein'), m.attr('edge'), m.attr('thin')
    P = m.per_instance_coords()
    Ps = m.mapping(P, scale=(0.14, 1.0, 1.0))                       # stretched along the scale
    # ivory body with slow creamy / yellower mottling, horn-yellow where the flesh is thin
    mott = m.noise(scale=150, detail=3, roughness=0.55, vector=P)
    col = m.mix((0.78, 0.66, 0.43), (0.72, 0.55, 0.28), m.map_range(mott, 0.35, 0.70))
    col = m.mix(col, (0.68, 0.46, 0.18), m.math('MULTIPLY', m.map_range(thin, 0.45, 1.0, smooth=True), 0.55))
    streak = m.noise(scale=900, detail=3, roughness=0.6, vector=Ps)
    col = m.mix(col, (0.62, 0.44, 0.20), m.math('MULTIPLY', m.map_range(streak, 0.50, 0.80), 0.22))
    col = m.mix(col, (0.50, 0.32, 0.13), m.math('MULTIPLY', m.map_range(cav, 0.10, 0.90, smooth=True), 0.42))
    col = m.mix(col, (0.55, 0.37, 0.15), m.math('MULTIPLY', vein, 0.30))
    # light tan / brown rims and tips on some scales, a few rusty freckles
    patch = m.map_range(m.noise(scale=110, detail=3, roughness=0.6, vector=P), 0.38, 0.66)
    tan = m.math('MULTIPLY', m.math('MULTIPLY', m.map_range(edge, 0.35, 1.0, smooth=True), patch),
                 m.map_range(m.attr('tan', 'INSTANCER'), 0.0, 1.0, 0.10, 0.85))
    col = m.mix(col, (0.30, 0.15, 0.05), tan)
    frk = m.map_range(m.noise(scale=620, detail=2, roughness=0.5, vector=P), 0.74, 0.80)
    col = m.mix(col, (0.36, 0.20, 0.08), m.math('MULTIPLY', frk, 0.45))
    col = m.jitter(col, hue=0.012, saturation=0.16, value=0.13)
    col = m.mix(col, (0.50, 0.31, 0.12), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.60))
    # horny semi-matte surface: roughness map, duller in creases and on the dry rims
    rn = m.noise(scale=1100, detail=4, roughness=0.6, vector=P)
    rough = m.map_range(rn, 0.25, 0.75, 0.36, 0.60)
    rough = m.mixf(rough, 0.72, m.map_range(cav, 0.2, 0.9))
    rough = m.mixf(rough, 0.70, tan)
    rough = m.math('ADD', rough, m.map_range(m.attr('inst_rand', 'INSTANCER'), 0, 1, -0.05, 0.08))
    crinkle = m.noise(scale=2300, detail=3, roughness=0.65, vector=Ps)
    nrm = m.bump(crinkle, strength=0.7, distance=0.00010)
    nrm = m.micro_bump(scale=8000, strength=0.45, distance=0.00004, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.50, specular=0.40,
          sss=0.85, sss_radius=(1.0, 0.60, 0.28), sss_scale=0.0030, sss_anisotropy=0.0, normal=nrm)
    return m


def sky_tint():
    """Fill / rim tint harmonised with the shot's sky (warm white fallback)."""
    try:
        import cv2
        im = cv2.imread(REF)
        c = im[: int(im.shape[0] * 0.35)].reshape(-1, 3).mean(0)[::-1] / 255.0
        c = c ** 2.2
        c = c / c.max()
        t = 0.62 + 0.38 * c
        t = t * np.array([1.0, 0.97, 0.90])                       # keep the ivory warm
        return tuple(float(x) for x in t / t.max())
    except Exception:
        return (1.0, 0.95, 0.85)


def build_variants(mat, seed=0, n=N_VARIANTS, prefix='baihe'):
    objs, shapes, raw = [], [], []
    for i in range(n):
        v, f, attrs, half = make_scale(i + 50 * seed, broken=BROKEN.get(i, 0))
        raw.append((v, f, attrs))
        shapes.append(half)
    return raw, shapes


# ----------------------------------------------------------------------------- loose items (flat-lay)
def make_items(seed=0, n=6):
    """6 loose dried lily scales as they lie on a table: some belly-down like a little boat (concave
    side up), some turned over and resting on rim and tips, one snapped piece.  Real-world scale,
    lowest point on z = 0, origin at the footprint centre."""
    mat = baihe_material()
    rng = np.random.default_rng(7100 + seed)
    ids = [0, 1, 2, 4, 6, 8][:n]
    objs, foot, hh = [], [], []
    for j, i in enumerate(ids):
        v, f, attrs, half = make_scale(i + 50 * seed, broken=BROKEN.get(i, 0))
        ang = math.radians(rng.normal(0, 5.0)) + (math.pi if j % 2 == 1 else 0.0)
        c, s = math.cos(ang), math.sin(ang)
        v = v @ np.array([[1, 0, 0], [0, c, -s], [0, s, c]]).T
        cxy = 0.5 * (v[:, :2].max(0) + v[:, :2].min(0))
        v = v - np.array([cxy[0], cxy[1], v[:, 2].min()])
        objs.append(C.mesh_from_arrays('baihe_item_%d' % j, v, f, attrs=attrs, material=mat))
        foot.append(float(np.percentile(np.hypot(v[:, 0], v[:, 1]), 99.5)))
        hh.append(float(0.5 * v[:, 2].max()))
    return dict(objects=objs, footprint_r=foot, half_height=hh, name='百合',
                inst_attrs={'dark': lambda r, k: (r.random(k) < 0.12) * r.uniform(0.4, 1.0, k),
                            'tan': lambda r, k: r.random(k) ** 2})


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    rng = np.random.default_rng(args.seed + 5)

    mat = baihe_material()
    raw, shapes = build_variants(mat)
    variants = [C.mesh_from_arrays('scale%d' % i, v, f, attrs=a, material=mat) for i, (v, f, a) in enumerate(raw)]

    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=3.0, coverage=0.74, weights=WEIGHTS, seed=args.seed,
                       scale_range=(0.84, 1.12), tilt_deg=16, roll_deg=30, flip=True, candidates=6, sink=0.12,
                       rough=0.004)
    n = len(heap)
    dark = (rng.random(n) < 0.12) * rng.uniform(0.4, 1.0, n)
    tan = rng.random(n) ** 2
    C.instance_on_points('heap', variants, heap, attrs={'dark': dark, 'tan': tan})
    C.dome_base(R_DOME - 0.002, C.simple_material('base', (0.22, 0.14, 0.06), 0.9))
    print('[heap] %d scales' % n)

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.53, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    tint = sky_tint()
    print('[tint]', tint)
    C.studio_lights(info, tint=tint, key=0.78, fill=0.85, rim=0.9, world=1.1, key_size=1.1)

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
