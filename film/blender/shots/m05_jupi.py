# -*- coding: utf-8 -*-
"""m05_jupi - dried tangerine peel / chenpi (橘皮 / 陈皮), kind = pile.

    python m05_jupi.py --quality preview --threads 2 --out /tmp/x.png
    python m05_jupi.py --quality draft --res 3840x2160 --spp 24 --region 0.36,0.56,0.64,0.86 --out /tmp/c.png
    python m05_jupi.py --quality final --out film/renders/m05_jupi.png

A mound of sun-dried peel: single lobes and torn fragments plus a few whole three-lobed peels
(三瓣, joined at the stem end).  Every piece is a thin solid sheet (1-1.5 mm) rolled inwards the way
peel dries: convex orange-brown outer side densely pitted with oil glands (油室), concave pale
yellowish-white inner side with fibre strands (筋络).  Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 'm05_jupi'
R_DOME = 0.56


# ----------------------------------------------------------------------------- 1. geometry
def _curl(xa, ya, L, rho_w, rho_l, x0, tw):
    """Isometric-ish drying curl of a flat sheet point (xa along the lobe, ya across): roll about
    the lobe axis (edges go down -> outer side convex), bend lengthwise, twist.  Flat for xa < x0."""
    g = C.smoothstep(x0, x0 + 0.30 * L, xa)
    k = np.maximum(g / rho_w * (1.0 + 0.9 * np.clip(xa / L, 0, 1)), 1e-7)
    a = np.clip(ya * k, -2.5, 2.5)
    y1 = np.sin(a) / k
    z1 = (np.cos(a) - 1.0) / k
    b = np.maximum(xa - x0, 0.0) / rho_l
    x2 = np.minimum(xa, x0) + (rho_l + z1) * np.sin(b)
    z2 = (rho_l + z1) * np.cos(b) - rho_l
    t = tw * np.maximum(xa - x0, 0.0) / L
    ct, st = np.cos(t), np.sin(t)
    return x2, y1 * ct - z2 * st, y1 * st + z2 * ct


def _finish(P, flat, dedge, wrap_v, rng, seed, th0, flipped, scar=None):
    """Top sheet (nu,nv,3) -> wrinkled solid sheet.  Returns (verts, faces, attrs, uvs, half)."""
    nu, nv = P.shape[:2]
    N = nu * nv
    faces = C.grid_faces(nu, nv, wrap_v=wrap_v)
    V0 = P.reshape(-1, 3).astype(float)
    nrm = C.vertex_normals(V0, faces)
    if nrm[:, 2].mean() < 0:
        faces = faces[:, ::-1].copy()
        nrm = -nrm
    fx, fy = flat[..., 0].ravel(), flat[..., 1].ravel()
    de = dedge.ravel()
    q = np.stack([fx, fy, np.full_like(fx, 0.37 * seed + 1.3)], -1)
    warp = 0.0011 * C.fbm3(q * [38, 38, 1], 3, seed=seed + 1) + 0.00040 * C.fbm3(q * [125, 125, 1] + 3.0, 2, seed=seed + 2)
    dq = 0.0012 * np.stack([C.fbm3(q * [160, 160, 1] + 7.0, 2, seed=seed + 6),
                            C.fbm3(q * [160, 160, 1] + 2.0, 2, seed=seed + 7), 0 * fx], -1)
    bil = np.abs(C.perlin3((q + dq) * [330, 430, 1], seed + 3))
    bil2 = np.abs(C.perlin3((q + dq) * [900, 760, 1] + 4.0, seed + 8))
    crease = 1.0 - C.smoothstep(0.0, 0.28, bil)
    crease2 = 1.0 - C.smoothstep(0.0, 0.30, bil2)
    how = C.smoothstep(-0.30, 0.30, C.fbm3(q * [70, 70, 1] + 9.0, 2, seed=seed + 4))
    edgew = np.exp(-de / 0.0045)
    wav = 0.0008 * edgew * C.perlin3(q * [210, 210, 1] + 5.0, seed + 5)          # wavy dried margin
    h = warp + wav - 0.00010 * crease * (0.10 + 0.90 * how) - 0.00004 * crease2
    V1 = V0 + nrm * h[:, None]
    n1 = C.vertex_normals(V1, faces)
    th = th0 * (0.55 + 0.45 * C.smoothstep(0.0, 0.0035, de)) * (1.0 + 0.18 * C.fbm3(q * [90, 90, 1] + 11.0, 2, seed=seed + 9))
    B = V1 - n1 * th[:, None]
    verts = np.concatenate([V1, B], 0)
    if wrap_v:
        loop = (nu - 1) * nv + np.arange(nv)
    else:
        loop = np.concatenate([np.arange(nv), np.arange(1, nu) * nv + nv - 1,
                               (nu - 1) * nv + np.arange(nv - 2, -1, -1), np.arange(nu - 2, 0, -1) * nv])
    l2 = np.roll(loop, -1)
    rim = np.stack([loop, l2, l2 + N, loop + N], 1)
    c0 = verts.mean(0)
    qc = verts[rim].mean(1) - c0
    qn = np.cross(verts[rim[:, 1]] - verts[rim[:, 0]], verts[rim[:, 3]] - verts[rim[:, 0]])
    if (qn * qc).sum() < 0:
        rim = rim[:, ::-1].copy()
    allf = np.concatenate([faces, faces[:, ::-1] + N, rim], 0)
    cav = np.clip(crease * (0.10 + 0.90 * how) + 0.30 * crease2, 0, 1)
    edge = np.exp(-de / 0.0028)
    sc = np.zeros(N) if scar is None else scar.ravel()
    attrs = dict(side=np.concatenate([np.zeros(N), np.ones(N)]),
                 edge=np.concatenate([edge, edge]),
                 cav=np.concatenate([cav, 0.3 * cav]),
                 scar=np.concatenate([sc, 0 * sc]))
    uvs = np.concatenate([np.stack([fx, fy], 1)] * 2, 0)
    if flipped:
        verts = verts * np.array([1.0, -1.0, -1.0])
    lo, hi = verts.min(0), verts.max(0)
    verts = verts - 0.5 * (lo + hi)
    d = 0.5 * (hi - lo)
    half = (float(d[0] * 0.94), float(d[1] * 0.90), float(d[2] * 0.78))
    return verts, allf, attrs, uvs, half


def make_lobe(seed, flipped=False, fragment=False, nu=290, nv=176):
    """One dried peel lobe (or a torn fragment): long axis X, outer side +Z (unless flipped)."""
    rng = np.random.default_rng(500 + seed)
    L = rng.uniform(0.030, 0.042) if fragment else rng.uniform(0.040, 0.058)
    W = rng.uniform(0.024, 0.034) if fragment else rng.uniform(0.022, 0.033)
    t = np.linspace(0.0, 1.0, nu)[:, None]
    v = np.linspace(-1.0, 1.0, nv)[None, :]
    T, V = np.broadcast_arrays(t, v)
    base_w = rng.uniform(0.75, 0.95) if fragment else rng.uniform(0.38, 0.62)
    p = rng.uniform(3.5, 5.0) if fragment else rng.uniform(1.9, 2.8)
    prof = (base_w + (1 - base_w) * C.smoothstep(0.0, 0.42, T)) * np.maximum(1.0 - T ** p, 0.0) ** 0.62
    prof = np.maximum(prof, 0.035)
    en = C.fbm3(np.stack([T * 4.5, V * 0.8, 0 * T + seed], -1), 3, seed=seed + 20)
    halfw = 0.5 * W * prof * (1.0 + 0.22 * en)
    rag = 0.0035 * C.fbm3(np.stack([V * 2.6, 0 * V + 3.0, 0 * V + seed], -1), 3, seed=seed + 21) * (1 - T) ** 3
    rag2 = 0.0020 * C.fbm3(np.stack([V * 3.1, 0 * V + 8.0, 0 * V + seed], -1), 3, seed=seed + 22) * T ** 6 * (1.0 if fragment else 0.3)
    xa = T * L + rag + rag2
    ya = V * halfw + 0.004 * np.sin(T * rng.uniform(1.5, 3.5) + rng.uniform(0, 6)) * rng.normal(0, 0.6)
    rho_w = (0.5 * W) / rng.uniform(0.50, 1.10)
    rho_l = rng.uniform(0.035, 0.11) * (1 if rng.random() < 0.8 else -1.6)
    tw = rng.normal(0, 0.45)
    x, y, z = _curl(xa, ya, L, rho_w, rho_l, -0.31 * L, tw)
    dedge = np.minimum(np.minimum((1 - np.abs(V)) * halfw, T * L), (1 - T) * L)
    th0 = rng.uniform(0.0010, 0.0015)
    return _finish(np.stack([x, y, z], -1), np.stack([xa, ya], -1), dedge, False, rng, seed, th0, flipped)


def make_trilobe(seed, flipped=False, nu=236, nv=690):
    """A whole peel opened into three lobes joined at the stem end (三瓣陈皮)."""
    rng = np.random.default_rng(900 + seed)
    s = np.linspace(0.012, 1.0, nu)[:, None]
    th = np.linspace(0.0, 2 * math.pi, nv, endpoint=False)[None, :]
    S, TH = np.broadcast_arrays(s, th)
    kk = np.round(TH / (2 * math.pi / 3)).astype(int) % 3
    phi = np.angle(np.exp(1j * (TH - kk * 2 * math.pi / 3)))
    Lk = rng.uniform(0.040, 0.052, 3)[kk]
    r_sin = rng.uniform(0.0065, 0.0095)
    en = C.fbm3(np.stack([np.cos(TH) * 2.2, np.sin(TH) * 2.2, 0 * TH + seed], -1), 3, seed=seed + 20)
    r_out = r_sin + (Lk - r_sin) * ((np.cos(1.5 * phi) - 0.22) / 0.78).clip(0, 1) ** 0.58 * (1.0 + 0.10 * en)
    r = S * r_out
    xa, ya = r * np.cos(phi), r * np.sin(phi)
    rho_w = (0.016 / rng.uniform(0.75, 1.25, 3))[kk]
    rho_l = rng.uniform(0.030, 0.060, 3)[kk]
    tw = rng.normal(0, 0.25, 3)[kk]
    x, y, z = _curl(xa, ya, Lk, rho_w, rho_l, 0.55 * r_sin, tw)
    a = kk * 2 * math.pi / 3
    X = x * np.cos(a) - y * np.sin(a)
    Y = x * np.sin(a) + y * np.cos(a)
    z = z + 0.0012 * np.exp(-(r / 0.011) ** 2) - 0.0007 * np.exp(-(r / 0.0022) ** 2)     # shoulder + stem-scar dimple
    flat = np.stack([r * np.cos(TH), r * np.sin(TH)], -1)
    dedge = (1 - S) * r_out
    scar = np.exp(-(r / 0.0019) ** 2)
    th0 = rng.uniform(0.0011, 0.0015)
    return _finish(np.stack([X, Y, z], -1), flat, dedge, True, rng, seed, th0, flipped, scar=scar)


# ----------------------------------------------------------------------------- 2. material
def peel_material():
    m = C.Mat('chenpi', sss_method='BURLEY')
    side = m.attr('side')
    inner = m.map_range(side, 0.22, 0.50, 0.0, 1.0, smooth=True)
    edge = m.attr('edge')
    cav = m.attr('cav')
    UV = m.coords('UV')                                               # flat sheet coordinates in metres
    P = m.per_instance_coords()
    # oil glands: two populations of sunken round pits
    d1 = m.voronoi(scale=1650, feature='F1', randomness=1.0, vector=UV)
    d2 = m.voronoi(scale=1050, feature='F1', randomness=1.0, vector=m.mapping(UV, location=(0.37, 0.11, 0.0)))
    pit1 = m.map_range(d1, 0.10, 0.33, 1.0, 0.0, smooth=True)
    pit2 = m.map_range(d2, 0.07, 0.27, 1.0, 0.0, smooth=True)
    pit = m.math('MAXIMUM', m.math('MULTIPLY', pit1, 0.75), pit2)
    # --- outer side (flavedo): orange -> orange-red -> reddish-brown patches
    mott = m.noise(scale=150, detail=3, roughness=0.55, vector=P)
    col = m.mix((0.520, 0.132, 0.008), (0.380, 0.060, 0.006), m.map_range(mott, 0.34, 0.66))
    brown = m.noise(scale=55, detail=2, roughness=0.5, vector=m.mapping(P, location=(3.1, 1.7, 0.4)))
    col = m.mix(col, (0.200, 0.042, 0.011), m.map_range(brown, 0.56, 0.80, 0.0, 0.70, smooth=True))
    speck = m.noise(scale=2600, detail=2, roughness=0.6, vector=P)
    col = m.mix(col, (0.56, 0.20, 0.03), m.map_range(speck, 0.58, 0.80, 0.0, 0.30))
    col = m.mix(col, (0.110, 0.026, 0.009), m.math('MULTIPLY', edge, 0.55))
    col = m.mix(col, (0.100, 0.022, 0.007), m.math('MULTIPLY', cav, 0.38))
    col = m.mix(col, (0.070, 0.016, 0.005), m.math('MULTIPLY', pit, 0.72))
    col = m.jitter(col, hue=0.014, saturation=0.10, value=0.22)
    col = m.mix(col, (0.085, 0.024, 0.010), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.70))
    col = m.mix(col, (0.050, 0.040, 0.016), m.map_range(m.attr('scar'), 0.3, 0.8, smooth=True))
    # --- inner side (albedo / pith): pale yellowish white, tan patches, fibre strands, gland dots
    pn = m.noise(scale=95, detail=3, roughness=0.6, vector=m.mapping(P, location=(1.3, 5.2, 2.2)))
    pith = m.mix((0.680, 0.540, 0.280), (0.500, 0.350, 0.150), m.map_range(pn, 0.38, 0.70))
    fib = m.noise(scale=820, detail=2, roughness=0.5, distortion=0.6, vector=m.mapping(UV, scale=(0.10, 1.0, 1.0)))
    strand = m.ramp(fib, [(0.40, 0.0), (0.50, 1.0), (0.60, 0.0)])
    pith = m.mix(pith, (0.740, 0.620, 0.360), m.math('MULTIPLY', strand, 0.55))
    pith = m.mix(pith, (0.420, 0.230, 0.050), m.math('MULTIPLY', pit, 0.30))
    pith = m.mix(pith, (0.300, 0.170, 0.060), m.math('MULTIPLY', edge, 0.45))
    pith = m.jitter(pith, hue=0.008, saturation=0.10, value=0.14)
    base = m.mix(col, pith, inner)
    # --- roughness
    rn = m.noise(scale=1300, detail=4, roughness=0.6, vector=P)
    ro = m.map_range(rn, 0.25, 0.75, 0.36, 0.58)
    ro = m.mixf(ro, 0.70, m.math('MULTIPLY', pit, 0.8))
    ro = m.math('ADD', ro, m.map_range(m.attr('inst_rand', 'INSTANCER'), 0, 1, -0.04, 0.10))
    rough = m.mixf(ro, 0.86, inner)
    # --- micro relief (one height chain, mixed per side)
    grain = m.noise(scale=3400, detail=3, roughness=0.6, vector=P)
    h_out = m.math('ADD', m.math('MULTIPLY', pit, -1.0), m.math('MULTIPLY', grain, 0.30))
    sponge = m.noise(scale=1900, detail=4, roughness=0.7, vector=P)
    h_in = m.math('ADD', m.math('MULTIPLY', strand, 0.9), m.math('MULTIPLY', sponge, 0.8))
    hh = m.mixf(h_out, h_in, inner)
    nrm = m.bump(hh, strength=1.0, distance=0.00013)
    nrm = m.micro_bump(scale=9500, strength=0.35, distance=0.00003, vector=P, normal=nrm)
    m.set(base_color=base, roughness=rough, ior=1.46, specular=0.40,
          sss=m.mixf(0.0, 0.45, inner), sss_radius=(1.0, 0.36, 0.12), sss_scale=0.0011,
          coat=m.mixf(0.07, 0.0, inner), coat_roughness=0.35,
          sheen=m.mixf(0.0, 0.35, inner), sheen_roughness=0.6, normal=nrm)
    return m


# ----------------------------------------------------------------------------- variants
# (kind, seed, flipped): outer side up dominates; a few lie inner side up; two whole three-lobed peels
SPEC = [('lobe', 0, False), ('lobe', 1, False), ('lobe', 2, False), ('frag', 3, False), ('lobe', 4, False),
        ('lobe', 5, True), ('frag', 6, True), ('tri', 0, False), ('tri', 1, True)]
WEIGHTS = [1.0, 1.0, 1.0, 0.9, 1.0, 0.30, 0.25, 0.30, 0.08]


def _build(kind, seed, flipped, lite=1.0):
    if kind == 'tri':
        return make_trilobe(seed, flipped, nu=int(236 * lite), nv=int(690 * lite))
    return make_lobe(seed, flipped, fragment=(kind == 'frag'), nu=int(290 * lite), nv=int(176 * lite))


def make_items(seed=0):
    """Loose chenpi pieces for the top-down flat-lay: lobes / fragments (one lying inner side up) and
    one whole three-lobed peel, resting pose, lowest point on z = 0, origin at the footprint centre."""
    mat = peel_material()
    spec = [('lobe', 0), ('lobe', 1), ('frag', 3), ('lobe', 5), ('tri', 0), ('lobe', 2)]
    flips = [False, False, False, True, False, False]
    objs, foot, hh = [], [], []
    for i, ((kind, sd), fl) in enumerate(zip(spec, flips)):
        v, f, attrs, uvs, half = _build(kind, sd + 40 * seed, fl)
        v = v - np.array([0.5 * (v[:, 0].max() + v[:, 0].min()), 0.5 * (v[:, 1].max() + v[:, 1].min()), v[:, 2].min()])
        objs.append(C.mesh_from_arrays('jupi_item_%d' % i, v, f, attrs=attrs, uvs=uvs, material=mat))
        foot.append(float(np.percentile(np.hypot(v[:, 0], v[:, 1]), 99.5)))
        hh.append(float(0.5 * v[:, 2].max()))
    return dict(objects=objs, footprint_r=foot, half_height=hh, name='橘皮',
                weights=[1.0, 1.0, 0.8, 0.6, 0.5, 1.0],
                inst_attrs={'dark': lambda r, k: (r.random(k) < 0.18) * r.uniform(0.4, 1.0, k)})


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.10)
    rng = np.random.default_rng(args.seed)
    mat = peel_material()
    variants, shapes = [], []
    for i, (kind, sd, fl) in enumerate(SPEC):
        v, f, attrs, uvs, half = _build(kind, sd, fl)
        variants.append(C.mesh_from_arrays('peel%d' % i, v, f, attrs=attrs, uvs=uvs, material=mat))
        shapes.append(half)

    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=3.6, coverage=0.84, weights=WEIGHTS, seed=args.seed,
                       scale_range=(0.86, 1.12), tilt_deg=6, roll_deg=12, candidates=8, sink=0.25, rough=0.002,
                       max_slope_deg=30)
    dark = (rng.random(len(heap)) < 0.18) * rng.uniform(0.4, 1.0, len(heap))
    C.instance_on_points('heap', variants, heap, attrs={'dark': dark})
    C.dome_base(R_DOME - 0.002, C.simple_material('base', (0.040, 0.012, 0.005), 0.9))

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.525, edge=0.645, top_margin=0.03)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(1.0, 0.90, 0.80), key=0.90, fill=0.95, rim=1.1, world=1.0, key_size=0.9)

    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
