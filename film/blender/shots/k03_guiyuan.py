# -*- coding: utf-8 -*-
"""k03_guiyuan - dried longan in shell (带壳桂圆干, Dimocarpus longan), kind = pile.

    python k03_guiyuan.py --quality preview --threads 2 --out /tmp/x.png
    python k03_guiyuan.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.50,0.63,0.75 --out crop.png
    python k03_guiyuan.py --quality final --out film/renders/k03_guiyuan.png

True scale (metres): each fruit an 19-25 mm slightly dented sphere; thin brittle tan shell with flat scale-like
areoles (real displacement) + granulation (bump), dark round stem scar, some with a short twig; a few cracked
open: glossy dark amber aril around a shiny black seed.     make_items(seed) -> loose fruits for the flat-lay film.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _fruits as F                                                                   # noqa: E402

SHOT = 'k03_guiyuan'
R_DOME = 0.30
KINDS = ['whole'] * 6 + ['twig'] * 2 + ['open', 'open_seed']
WEIGHTS = [1.0] * 6 + [0.45, 0.45, 0.24, 0.24]


# ----------------------------------------------------------------------------- 1. geometry
def make_longan(seed, kind='whole', nu=200, nv=312):
    """One dried longan.  Stem pole at -X.  -> (parts, attrs, half_sizes, hole_dir or None)."""
    rng = np.random.default_rng(7000 + seed)
    sd = seed * 57 + 3
    r0 = 0.5 * rng.uniform(0.0190, 0.0245)
    U, s, ph = F.sphere_grid(nu, nv)
    th = math.pi * s
    ax = np.array([rng.uniform(0.90, 0.98), 1.0, rng.uniform(0.94, 1.03)])
    rad = 1.0 + 0.045 * F.noise3(C.fbm3, U * 1.2 + 3.1, 3, seed=sd)
    # shoulder: the fruit is a little fuller on one side of the stem
    sh = F.unit([-0.5, rng.normal(), rng.normal()])
    rad = rad + 0.035 * np.clip(U @ sh, 0, 1) ** 2
    # dents (thin dry shell caves in like a ping-pong ball)
    dent = np.zeros(U.shape[:2])
    for _ in range(int(rng.integers(1, 4))):
        c = F.unit(rng.normal(size=3))
        a, d = rng.uniform(0.35, 0.80), rng.uniform(0.04, 0.15)
        ang = np.arccos(np.clip(U @ c, -1, 1)) * (1.0 + 0.18 * F.noise3(C.perlin3, U * 2.0 + 5.0, sd + 1))
        w = np.clip(1.0 - (ang / a) ** 2, 0, 1) ** 1.35
        rad = rad - d * w
        dent = dent + w
    # scale-like areoles (flat polygonal plates, ~1 mm, narrow grooves) with a tiny central wart
    Pc = U * (r0 / 0.00105)
    F1, F2, cid = F.noise3(C.cellular3, Pc, seed=sd + 5)
    plate = C.smoothstep(0.02, 0.30, F2 - F1)
    wart = np.exp(-(F1 / 0.22) ** 2) * (cid > 0.30)
    hfine = 0.050e-3 * plate + 0.032e-3 * wart + 0.022e-3 * F.noise3(C.fbm3, Pc * 2.3 + 1.7, 2, seed=sd + 6)
    # stem scar: sunken darker disc with a slightly raised rim
    dpole = r0 * th + 0 * ph
    hscar = -0.32e-3 * np.exp(-(dpole / 1.4e-3) ** 2) + 0.11e-3 * np.exp(-((dpole - 2.0e-3) / 0.6e-3) ** 2)
    scar = np.exp(-(dpole / 1.55e-3) ** 2)

    opn = np.zeros(U.shape[:2], bool)
    seedm = np.zeros(U.shape[:2], bool)
    edge = np.zeros(U.shape[:2])
    hole = None
    if kind.startswith('open'):
        tc, pc = math.radians(rng.uniform(65, 115)), rng.uniform(0, 2 * math.pi)
        hole = np.array([-math.cos(tc), math.sin(tc) * math.cos(pc), math.sin(tc) * math.sin(pc)])
        e1 = F.unit(np.cross(hole, [1.0, 0.2, 0.1]))
        e2 = np.cross(hole, e1)
        ang = np.arccos(np.clip(U @ hole, -1, 1))
        az = np.arctan2(U @ e2, U @ e1)
        a_h = rng.uniform(0.62, 0.90)
        p1, p2 = rng.uniform(0, 6.28, 2)
        thr = a_h * (1.0 + 0.24 * np.abs(np.sin(2.5 * az + p1)) - 0.22 * np.abs(np.sin(1.5 * az + p2))
                     + 0.14 * F.noise3(C.fbm3, U * 3.0 + 8.0, 2, seed=sd + 7))
        d_in = thr - ang
        opn = d_in > 0
        r_fl = 0.70 * (1.0 + 0.085 * (np.abs(F.noise3(C.perlin3, U * 5.0 + 2.0, sd + 8)) ** 0.6 - 0.5)
                       + 0.045 * (np.abs(F.noise3(C.perlin3, U * 11.0 + 4.0, sd + 9)) ** 0.6 - 0.5)
                       + 0.05 * F.noise3(C.fbm3, U * 2.0 + 6.0, 2, seed=sd + 10))
        if kind == 'open_seed':
            c2 = F.unit(hole + 0.22 * e1 * rng.normal() + 0.22 * e2 * rng.normal())
            ang2 = np.arccos(np.clip(U @ c2, -1, 1))
            thr2 = 0.52 * a_h * (1.0 + 0.30 * F.noise3(C.fbm3, U * 4.0 + 9.0, 2, seed=sd + 11))
            seedm = (ang2 < thr2) & opn
            r_fl = np.where(seedm, 0.615 * (1.0 + 0.004 * F.noise3(C.fbm3, U * 3.0, 2, seed=sd + 12)), r_fl)
        wall = C.smoothstep(0.0, 0.055, d_in)                         # shell rim -> aril over ~0.6 mm (smooth inner wall)
        rad = (rad + 0.02 * np.exp(-(np.clip(-d_in, 0, None) / 0.06) ** 2)) * (1.0 - wall) + r_fl * wall
        edge = np.exp(-(np.clip(-d_in, 0, None) / 0.030) ** 2) * (1.0 - C.smoothstep(0.030, 0.055, d_in))
    opn = (d_in > 0.045) if kind.startswith('open') else opn
    radius = r0 * rad + np.where(opn, 0.0, hfine + hscar)
    verts = (U * ax * radius[..., None]).reshape(-1, 3)
    faces = C.grid_faces(nu, nv, wrap_v=True)
    attrs = dict(groove=((1.0 - plate) * (~opn)).ravel(), scar=(scar * (~opn)).ravel(), open=opn.astype(float).ravel(),
                 seed=seedm.astype(float).ravel(), edge=edge.ravel(), dent=np.clip(dent, 0, 1).ravel(),
                 cid=cid.ravel())
    parts = [(verts, faces, 0)]
    if kind == 'twig':                                               # short woody fruit stalk
        n = 22
        t = np.linspace(0, 1, n)[:, None]
        p0 = np.array([-r0 * ax[0] * rad[0].mean() + 0.0006, 0.0, 0.0])
        d = F.unit([-1.0, rng.normal(0, 0.35), rng.normal(0, 0.35)])
        side = F.unit(np.cross(d, [0.2, 0.3, 1.0]))
        ln = rng.uniform(0.004, 0.011)
        path = p0 + d * ln * t + side * ln * 0.25 * rng.normal() * t ** 2
        r = rng.uniform(0.00055, 0.00080) * (1.1 - 0.25 * t[:, 0]) * (1.0 + 0.12 * np.sin(t[:, 0] * rng.uniform(8, 15)))
        r[0] *= 1.6
        r[-1] *= 0.15
        sv, sf = C.tube(path, r, nv=14)
        parts.append((sv, sf, 1))
        for k in attrs:
            attrs[k] = np.concatenate([attrs[k], np.zeros(len(sv))])
    half = tuple(float(x) for x in r0 * ax * 0.965)
    return parts, attrs, half, hole


# ----------------------------------------------------------------------------- 2. materials
def longan_material():
    m = C.Mat('longan_shell', sss_method='BURLEY')
    P = m.per_instance_coords()
    groove, scar, opn, seed = m.attr('groove'), m.attr('scar'), m.attr('open'), m.attr('seed')
    edge, dent, cid = m.attr('edge'), m.attr('dent'), m.attr('cid')
    n_big = m.noise(scale=75, detail=3, roughness=0.55, vector=P)            # ~1.5 cm weathering patches
    n_mid = m.noise(scale=430, detail=4, roughness=0.6, vector=P)            # ~2 mm mottle
    n_fine = m.noise(scale=2600, detail=3, roughness=0.6, vector=P)          # granulation
    base = m.mix((0.320, 0.150, 0.042), (0.500, 0.270, 0.082), m.map_range(n_mid, 0.30, 0.70))
    base = m.mix(base, (0.215, 0.088, 0.028), m.map_range(n_big, 0.52, 0.74, 0.0, 0.75, smooth=True))
    base = m.mix(base, (0.540, 0.360, 0.150), m.map_range(n_big, 0.43, 0.22, 0.0, 0.55, smooth=True))
    base = m.mix(base, m.hsv(base, 0.5, 1.0, 0.80), m.map_range(cid, 0.55, 1.0))          # plate-to-plate variation
    base = m.jitter(base, hue=0.016, saturation=0.14, value=0.26)
    base = m.mix(base, (0.180, 0.082, 0.030), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.65))
    col = m.mix(base, (0.120, 0.056, 0.022), m.map_range(groove, 0.35, 0.95, 0.0, 0.50, smooth=True))
    sp = m.noise(scale=5200, detail=2, roughness=0.5, vector=P)
    col = m.mix(col, (0.075, 0.038, 0.017), m.map_range(sp, 0.66, 0.78, 0.0, 0.50))        # dark specks
    dust = m.math('MULTIPLY', m.map_range(m.noise(scale=190, detail=3, roughness=0.6, vector=P), 0.42, 0.72),
                  m.map_range(dent, 0.0, 0.8, 0.45, 1.0))
    col = m.mix(col, (0.560, 0.450, 0.300), m.math('MULTIPLY', dust, 0.26))                # pale dusty bloom
    scar_m = m.map_range(scar, 0.20, 0.80, smooth=True)
    col = m.mix(col, (0.070, 0.034, 0.016), scar_m)
    col = m.mix(col, (0.640, 0.500, 0.290), m.math('MULTIPLY', edge, 0.85))                # broken rim: pale inside
    flesh = m.mix((0.050, 0.011, 0.003), (0.150, 0.042, 0.008), m.map_range(n_mid, 0.30, 0.70))
    col = m.mix(col, flesh, opn)
    col = m.mix(col, (0.007, 0.004, 0.004), seed)
    rough = m.map_range(n_fine, 0.25, 0.75, 0.60, 0.84)
    rough = m.mixf(rough, 0.90, m.math('MULTIPLY', dust, 0.6))
    rough = m.mixf(rough, m.map_range(n_fine, 0.25, 0.75, 0.10, 0.28), opn)
    rough = m.mixf(rough, 0.07, seed)
    sss = m.map_range(opn, 0.0, 1.0, 0.22, 0.80)
    sss = m.math('MULTIPLY', sss, m.map_range(seed, 0.0, 1.0, 1.0, 0.0))
    coat = m.math('MAXIMUM', m.math('MULTIPLY', opn, 0.55), seed)
    shell_w = m.map_range(opn, 0.0, 1.0, 1.0, 0.12)
    nrm = m.bump(n_fine, strength=m.math('MULTIPLY', shell_w, 0.75), distance=0.00007)
    grit = m.noise(scale=8500, detail=2, roughness=0.6, vector=P)
    nrm = m.bump(grit, strength=m.math('MULTIPLY', shell_w, 0.55), distance=0.00003, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.46, specular=0.35,
          sss=sss, sss_radius=(1.0, 0.42, 0.16), sss_scale=0.0013,
          coat=coat, coat_roughness=0.06, sheen=m.map_range(opn, 0.0, 1.0, 0.10, 0.0), sheen_roughness=0.5,
          normal=nrm)
    return m


def twig_material():
    m = C.Mat('longan_twig')
    P = m.per_instance_coords()
    n = m.noise(scale=1600, detail=4, roughness=0.6, vector=m.mapping(P, scale=(0.2, 1, 1)))
    m.set(base_color=m.ramp(n, [(0.28, (0.060, 0.032, 0.015)), (0.72, (0.230, 0.135, 0.065))]), roughness=0.78,
          specular=0.25, normal=m.bump(n, 0.7, 0.00008))
    return m


_MATS = {}


def _materials():
    if _MATS.get('a') is None or _MATS['a'].mat.name not in C.bpy.data.materials:
        _MATS['a'], _MATS['b'] = longan_material(), twig_material()
    return [_MATS['a'], _MATS['b']]


def make_items(seed=0):
    """Loose dried longans (whole, with twig, cracked open) -> dict(objects, footprint_r, half_height, name)."""
    rng = np.random.default_rng(seed + 5)
    kinds = ['whole', 'whole', 'twig', 'whole', 'open_seed', 'open']
    objs, fr, hh = [], [], []
    for i, k in enumerate(kinds):
        parts, attrs, half, hole = make_longan(60 + seed * 13 + i, k)
        if hole is not None:                                         # opening faces up
            q = F.aim_quat(hole, (0.0, -0.25, 1.0), rng, spread=0.15)
        else:                                                        # stem axis horizontal, free spin
            q = F.quat_mul(F.quat_axis((0, 0, 1), rng.uniform(0, 6.28)), F.quat_axis((1, 0, 0), rng.uniform(0, 6.28)))
        ob, r, h = F.rest_item('guiyuan_item_%d' % i, parts, attrs, _materials(), F.quat_matrix(q))
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='桂圆')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    rng = np.random.default_rng(args.seed)
    mats = _materials()
    variants, shapes, holes = [], [], []
    for i, k in enumerate(KINDS):
        parts, attrs, half, hole = make_longan(i, k)
        v, f, fm = C.merge_meshes(parts)
        variants.append(C.mesh_from_arrays('longan_%03d' % i, v, f, attrs=attrs, materials=mats, face_mat=fm))
        shapes.append(half)
        holes.append(hole)

    sol = C.planet_solve(R_DOME + 0.050)                             # the camera is fitted to the heap TOP (+ ~5 cm)
    x0, x1, y0, y1 = sol['patch']
    patch = (x0 * 1.12, x1 * 1.12, y0 * 1.10, y1 * 1.10)
    heap = C.pack_heap(R_DOME, patch, shapes, layers=2.5, coverage=0.74, weights=WEIGHTS, seed=args.seed,
                       scale_range=(0.86, 1.10), candidates=14, sink=0.09, rough=0.002)
    n = len(heap.loc)
    quat = F.rand_quats(n, rng)                                      # spheres: any orientation rests
    var = np.asarray(heap.var).astype(int)
    for i in np.where(var >= 8)[0]:                                  # cracked ones show their opening
        quat[i] = F.aim_quat(holes[var[i]], (0.1, -0.70, 0.70), rng, spread=0.60)
    dark = (rng.random(n) < 0.20) * rng.uniform(0.4, 1.0, n)
    C.instance_on_points('heap', variants, loc=heap.loc, quat=quat, scale=heap.scale, var=heap.var,
                         attrs={'dark': dark})
    C.dome_base(R_DOME - 0.004, C.simple_material('base', (0.040, 0.020, 0.008), 0.9))

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.53, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(1.0, 0.90, 0.80), key=1.05, fill=0.65, rim=1.3, world=0.9, key_size=0.8)
    F.finish(args, SHOT)


if __name__ == '__main__':
    main()
