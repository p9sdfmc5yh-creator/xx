# -*- coding: utf-8 -*-
"""k11_shaji - sea buckthorn berries (沙棘, Hippophae rhamnoides), kind = pile.

    python k11_shaji.py --quality preview --threads 2 --out /tmp/x.png
    python k11_shaji.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.50,0.63,0.75 --out crop.png
    python k11_shaji.py --quality final --out film/renders/k11_shaji.png

True scale (metres): 6-9 mm oval berries, thin taut glossy skin, juicy translucent orange flesh (random-walk
SSS), minute brownish / silvery peltate scale dots (denser at both ends), dark stigma point at the tip, small
stem scar (some keep a short brown stalk); two narrow silvery-green leaves lie on the mound.
make_items(seed) -> loose berries for the flat-lay film.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _fruits as F                                                                   # noqa: E402

SHOT = 'k11_shaji'
R_DOME = 0.185
N_PLAIN, N_STALK = 8, 2


# ----------------------------------------------------------------------------- 1. geometry
def make_berry(seed, stalk=False, nu=124, nv=156):
    """One berry: long axis X (stem scar at -X, stigma point at +X).  -> (parts, attrs, half_sizes)."""
    rng = np.random.default_rng(9000 + seed)
    sd = seed * 31 + 7
    L = rng.uniform(0.0062, 0.0092)
    Wd = L * rng.uniform(0.70, 0.92)
    a, b = 0.5 * L, 0.5 * Wd
    c = b * rng.uniform(0.93, 1.0)
    U, s, ph = F.sphere_grid(nu, nv)
    th = math.pi * s
    x = U[..., 0]
    taper = rng.uniform(-0.07, 0.11)
    rad = 1.0 + 0.032 * F.noise3(C.fbm3, U * 1.4 + 2.2, 2, seed=sd) + 0.010 * F.noise3(C.fbm3, U * 4.5 + 5.0, 2, seed=sd + 1)
    for _ in range(int(rng.integers(0, 3))):                          # soft flat spots where berries pressed
        cdir = F.unit(rng.normal(size=3) * [0.5, 1, 1])
        aa, dd = rng.uniform(0.40, 0.75), rng.uniform(0.015, 0.045)
        ang = np.arccos(np.clip(U @ cdir, -1, 1))
        rad = rad - dd * np.clip(1.0 - (ang / aa) ** 2, 0, 1) ** 1.6
    if rng.random() < 0.45:                                           # faint longitudinal furrow on one side
        dphi = np.angle(np.exp(1j * (ph - rng.uniform(0, 6.28))))
        rad = rad - rng.uniform(0.012, 0.030) * np.exp(-(dphi / 0.25) ** 2) * np.sin(th) ** 2
    scale = np.stack([a + 0 * x, b * (1.0 + taper * x), c * (1.0 + taper * x)], -1)
    P = U * scale * rad[..., None]
    d0 = a * th + 0 * ph                                              # arc distance from the stem pole
    d1 = a * (math.pi - th) + 0 * ph                                  # ... from the tip
    P = P + U * (-0.00024 * np.exp(-(d0 / 0.00075) ** 2) + 0.00013 * np.exp(-(d1 / 0.00034) ** 2))[..., None]
    verts = P.reshape(-1, 3)
    faces = C.grid_faces(nu, nv, wrap_v=True)
    attrs = dict(base=np.exp(-(d0 / 0.00080) ** 2).ravel(), tip=np.exp(-(d1 / 0.00030) ** 2).ravel(),
                 ends=np.maximum(np.exp(-(d0 / 0.0027) ** 2), 0.8 * np.exp(-(d1 / 0.0022) ** 2)).ravel())
    parts = [(verts, faces, 0)]
    if stalk:
        n = 18
        t = np.linspace(0, 1, n)[:, None]
        p0 = np.array([-a * rad[0].mean() + 0.0003, 0.0, 0.0])
        d = F.unit([-1.0, rng.normal(0, 0.4), rng.normal(0.1, 0.4)])
        side = F.unit(np.cross(d, [0.2, 0.3, 1.0]))
        ln = rng.uniform(0.0018, 0.0045)
        path = p0 + d * ln * t + side * ln * 0.3 * rng.normal() * t ** 2
        r = rng.uniform(0.00020, 0.00028) * (1.15 - 0.3 * t[:, 0])
        r[0] *= 1.7
        r[-1] *= 0.3
        sv, sf = C.tube(path, r, nv=10)
        parts.append((sv, sf, 1))
        for k in attrs:
            attrs[k] = np.concatenate([attrs[k], np.zeros(len(sv))])
    return parts, attrs, (a * 0.975, b * 0.965, c * 0.965)


def make_leaf(seed, L, W, c0, up, d, items, under=False, nu=170, nv=24):
    """Narrow lanceolate leaf lying as a stiff strip on the berries.  c0 = point on the dome, up = local normal,
    d = unit tangent direction, items = (loc (N,3), radius (N,)).  -> (verts, faces, attrs)."""
    rng = np.random.default_rng(500 + seed)
    up, d = F.unit(up), F.unit(d - np.dot(d, F.unit(up)) * F.unit(up))
    n = np.cross(up, d)
    t = np.linspace(0, 1, nu)[:, None]
    w = np.linspace(-1, 1, nv)[None, :]
    wid = 0.5 * W * (4 * t * (1 - t)) ** 0.62 * (1.0 + 0.05 * np.sin(t * 17 + seed))
    pos = (t - 0.5) * L
    bend = rng.normal(0, 0.05) * L
    lat = w * wid + bend * (4 * t * (1 - t) - 0.667)
    loc, rad = items
    rel = loc - c0
    u, pd, pn = rel @ up, rel @ d, rel @ n
    ks = np.linspace(-0.5, 0.5, 31) * L
    env = np.full(len(ks), -np.inf)
    for k, xk in enumerate(ks):
        near = (np.abs(pd - xk) < 0.85 * rad) & (np.abs(pn) < 0.85 * rad + 0.35 * W)
        if near.any():
            env[k] = (u[near] + 0.98 * rad[near]).max()
    ok = np.isfinite(env)
    A = np.polyfit(ks[ok], env[ok], 2)                              # gently arched, rests on the highest berries
    A[-1] += (env[ok] - np.polyval(A, ks[ok])).max() + 0.00025
    sign = -1.0 if under else 1.0                                     # upper side: shallow channel; underside: keel
    hloc = sign * 0.20 * wid * np.abs(w) ** 1.3 + lat * rng.normal(0, 0.18) * (t - 0.5) * 2.0
    hloc = hloc + 0.00015 * F.noise3(C.fbm3, np.stack([pos + 0 * w, lat, 0 * lat], -1) / 0.004, 2, seed=seed)
    h = np.polyval(A, pos) + hloc - hloc.min()
    verts = (c0 + d * (pos + 0 * w)[..., None] + n * lat[..., None] + up * h[..., None]).reshape(-1, 3)
    faces = C.grid_faces(nu, nv, wrap_v=False)
    attrs = dict(mid=np.exp(-((w + 0 * t) / 0.13) ** 2).ravel(), under=np.full(nu * nv, 1.0 if under else 0.0),
                 tl=(t + 0 * w).ravel())
    return verts, faces, attrs


# ----------------------------------------------------------------------------- 2. materials
def berry_material(sss_method='RANDOM_WALK'):
    m = C.Mat('shaji_skin', sss_method=sss_method)
    P = m.per_instance_coords()
    hue = m.attr('hue', 'INSTANCER')                                  # 0 yellow-orange ... 1 red-orange
    ends, tip, base = m.attr('ends'), m.attr('tip'), m.attr('base')
    n_mid = m.noise(scale=380, detail=3, roughness=0.55, vector=P)
    col = m.mix((0.720, 0.370, 0.0140), (0.620, 0.125, 0.0060), hue)
    col = m.mix(col, m.hsv(col, 0.5, 1.03, 0.80), m.map_range(n_mid, 0.38, 0.70))          # faint mottle
    col = m.mix(col, (0.700, 0.340, 0.030), m.math('MULTIPLY', m.attr('base'), 0.0))        # (placeholder, off)
    col = m.jitter(col, hue=0.008, saturation=0.05, value=0.12)
    # peltate scale dots: minute, brownish or silvery, denser towards both ends
    vd = m.voronoi(scale=1900, feature='F1', vector=P, output='Distance')
    vc = m.node('ShaderNodeSeparateColor', {0: m.voronoi(scale=1900, feature='F1', vector=P, output='Color')})
    rad = m.map_range(vc.outputs[1], 0.0, 1.0, 0.06, 0.15)
    dot = m.map_range(vd, m.math('MULTIPLY', rad, 0.5), rad, 1.0, 0.0)
    dot = m.math('MULTIPLY', dot, m.math('GREATER_THAN', vc.outputs[0], m.map_range(ends, 0.0, 1.0, 0.50, 0.15)))
    dcol = m.mix((0.170, 0.070, 0.022), (0.600, 0.520, 0.400), m.math('GREATER_THAN', vc.outputs[2], 0.62))
    col = m.mix(col, dcol, m.math('MULTIPLY', dot, 0.80))
    tipm = m.map_range(tip, 0.30, 0.80, smooth=True)
    basem = m.map_range(base, 0.25, 0.80, smooth=True)
    col = m.mix(col, (0.028, 0.013, 0.008), tipm)                     # stigma remnant: dark brown point
    col = m.mix(col, (0.150, 0.070, 0.028), basem)                    # stem scar
    rn = m.noise(scale=900, detail=3, roughness=0.6, vector=P)
    rough = m.map_range(rn, 0.30, 0.70, 0.22, 0.38)
    matte = m.math('MAXIMUM', dot, m.math('MAXIMUM', tipm, basem))
    rough = m.mixf(rough, 0.70, matte)
    rough = m.math('ADD', rough, m.map_range(m.attr('inst_rand', 'INSTANCER'), 0, 1, -0.03, 0.08))
    coat = m.map_range(matte, 0.0, 1.0, 0.22, 0.0)
    nrm = m.bump(dot, strength=0.5, distance=0.000012)
    skin = m.noise(scale=3600, detail=2, roughness=0.5, vector=P)
    nrm = m.bump(skin, strength=0.14, distance=0.00003, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.45, specular=0.50,
          sss=0.88, sss_radius=(1.0, 0.42, 0.040), sss_scale=0.0021, sss_anisotropy=0.0,
          coat=coat, coat_roughness=0.10, normal=nrm)
    return m


def stalk_material():
    m = C.Mat('shaji_stalk')
    P = m.per_instance_coords()
    n = m.noise(scale=2600, detail=3, roughness=0.6, vector=P)
    m.set(base_color=m.ramp(n, [(0.3, (0.070, 0.036, 0.016)), (0.7, (0.230, 0.130, 0.060))]), roughness=0.7,
          specular=0.3, normal=m.bump(n, 0.6, 0.00004))
    return m


def leaf_material():
    """Upper side dull grey-green with silvery scales, underside silvery-white with rusty dots and a pale midrib."""
    m = C.Mat('shaji_leaf')
    P = m.coords('Object')
    under, mid = m.attr('under'), m.attr('mid')
    n1 = m.noise(scale=700, detail=4, roughness=0.6, vector=m.mapping(P, scale=(0.35, 1, 1)))
    sc = m.noise(scale=6000, detail=2, roughness=0.5, vector=P)
    up_col = m.mix((0.030, 0.062, 0.024), (0.066, 0.115, 0.045), m.map_range(n1, 0.3, 0.7))
    up_col = m.mix(up_col, (0.300, 0.360, 0.290), m.map_range(sc, 0.60, 0.74, 0.0, 0.32))  # silvery scales
    up_col = m.mix(up_col, (0.150, 0.200, 0.090), m.math('MULTIPLY', mid, 0.6))
    un_col = m.mix((0.400, 0.430, 0.350), (0.560, 0.580, 0.500), m.map_range(n1, 0.3, 0.7))
    un_col = m.mix(un_col, (0.300, 0.165, 0.060), m.map_range(sc, 0.66, 0.76, 0.0, 0.70))  # rusty scales
    un_col = m.mix(un_col, (0.470, 0.400, 0.230), m.math('MULTIPLY', mid, 0.8))
    col = m.mix(up_col, un_col, under)
    midh = m.math('MULTIPLY', mid, m.map_range(under, 0.0, 1.0, -1.0, 1.0))                # groove above, rib below
    nrm = m.bump(midh, strength=0.8, distance=0.00025)
    nrm = m.bump(m.math('ADD', n1, m.math('MULTIPLY', sc, 0.5)), strength=0.5, distance=0.00005, normal=nrm)
    m.set(base_color=col, roughness=m.map_range(sc, 0.3, 0.7, 0.42, 0.62), specular=0.35, sheen=0.22,
          sheen_roughness=0.45, sss=0.15, sss_radius=(0.4, 1.0, 0.2), sss_scale=0.0004, normal=nrm)
    return m


_MATS = {}


def _materials():
    if _MATS.get('a') is None or _MATS['a'].mat.name not in C.bpy.data.materials:
        _MATS['a'], _MATS['b'] = berry_material(), stalk_material()
    return [_MATS['a'], _MATS['b']]


def make_items(seed=0):
    """Loose sea buckthorn berries (two keep their stalk) -> dict(objects, footprint_r, half_height, name).
    The berry shader reads the per-instance attribute 'hue' (0 yellow-orange ... 1 red-orange); 0 if absent."""
    rng = np.random.default_rng(seed + 9)
    objs, fr, hh = [], [], []
    for i in range(7):
        parts, attrs, half = make_berry(80 + seed * 11 + i, stalk=(i in (2, 5)))
        q = F.quat_mul(F.quat_axis((0, 0, 1), rng.uniform(0, 6.28)), F.quat_axis((1, 0, 0), rng.uniform(0, 6.28)))
        ob, r, h = F.rest_item('shaji_item_%d' % i, parts, attrs, _materials(), F.quat_matrix(q))
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='沙棘')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    rng = np.random.default_rng(args.seed)
    mats = _materials()
    variants, shapes = [], []
    for i in range(N_PLAIN + N_STALK):
        parts, attrs, half = make_berry(i, stalk=(i >= N_PLAIN))
        v, f, fm = C.merge_meshes(parts)
        variants.append(C.mesh_from_arrays('shaji_%03d' % i, v, f, attrs=attrs, materials=mats, face_mat=fm))
        shapes.append(half)
    weights = [1.0] * N_PLAIN + [0.30] * N_STALK

    sol = C.planet_solve(R_DOME + 0.020)                              # camera is fitted to the heap top
    x0, x1, y0, y1 = sol['patch']
    patch = (x0 * 1.14, x1 * 1.14, y0 * 1.12, y1 * 1.12)
    heap = C.pack_heap(R_DOME, patch, shapes, layers=3.0, coverage=0.74, weights=weights, seed=args.seed,
                       scale_range=(0.84, 1.12), tilt_deg=40, roll_deg=180, candidates=10, sink=0.10, rough=0.0012)
    n = len(heap.loc)
    hue = np.clip(rng.normal(0.38, 0.20, n), 0, 1)
    odd = rng.random(n)
    hue = np.where(odd < 0.12, rng.uniform(0.0, 0.12, n), np.where(odd > 0.88, rng.uniform(0.85, 1.0, n), hue))
    C.instance_on_points('heap', variants, heap, attrs={'hue': hue})
    C.dome_base(R_DOME - 0.0015, C.simple_material('base', (0.090, 0.024, 0.003), 0.9))

    # two leaves resting on the berries (upper side / silvery underside)
    loc = np.asarray(heap.loc, float)
    sc = np.asarray(heap.scale, float).reshape(n, -1).mean(1)
    rad = np.array([np.mean(shapes[int(k)]) for k in heap.var]) * sc
    lmat = leaf_material()
    for j, (fx, fy, yaw, L, W, under) in enumerate([(0.36, 0.34, -22.0, 0.031, 0.0066, False)]):
        px, py = fx * x1, fy * y0
        c0 = np.array([px, py, math.sqrt(R_DOME ** 2 - px * px - py * py)])
        d = np.array([math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0.0])
        v, f, at = make_leaf(j + args.seed, L, W, c0, c0 / np.linalg.norm(c0), d, (loc, rad), under=under)
        C.mesh_from_arrays('leaf%d' % j, v, f, attrs=at, material=lmat)

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.53, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(0.94, 1.0, 0.92), key=0.90, fill=0.60, rim=1.4, world=0.9, key_size=0.9)
    F.finish(args, SHOT)


if __name__ == '__main__':
    main()
