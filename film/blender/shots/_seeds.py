# -*- coding: utf-8 -*-
"""_seeds.py - shared toolkit for the "heap of small convex seeds" pile shots
(m06_lianzi, k02_yiyiren, k07_chixiaodou, k04_heizhima, k12_juemingzi, k15_qianshi; s03_millet
predates it and is self-contained).

Geometry helpers work on a lat-long grid of unit directions whose poles lie on the X axis
(`sphere_dirs`): every seed is an ellipsoid-like body  P = (a dx, b dy, c dz) * r(d)  whose radial
multiplier r carries the real morphology (grooves, pits, hilum, ridges), plus per-vertex masks
baked for the shader.  `run_pile` is the common build + render driver (same CLI as m02_gouqi).
Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

PI = math.pi


# ----------------------------------------------------------------------------- numpy geometry helpers
def sphere_dirs(nu, nv, pole_dense=0.0):
    """Unit directions on a lat-long grid with poles on the X axis (T = 0 at -X, T = pi at +X).
    pole_dense in [0, 0.8) concentrates rings near both poles (hilum pits, nipples).
    Returns (d (nu, nv, 3), T (nu, nv), PH (nu, nv))."""
    u = np.linspace(0.0, 1.0, nu)
    t = PI * (u - pole_dense * np.sin(2 * PI * u) / (2 * PI))
    t[0], t[-1] = 2e-3, PI - 2e-3
    ph = np.linspace(0, 2 * PI, nv, endpoint=False)
    T, PH = np.meshgrid(t, ph, indexing='ij')
    d = np.stack([-np.cos(T), np.sin(T) * np.cos(PH), np.sin(T) * np.sin(PH)], -1)
    return d, T, PH


def norm01(x, lo=4, hi=96):
    a, b = np.percentile(x, [lo, hi])
    return np.clip((x - a) / (b - a + 1e-12), 0.0, 1.0)


def ang(d, c):
    """Angle (rad) between the directions d (..., 3) and the unit vector c."""
    return np.arccos(np.clip(d @ np.asarray(c, float), -1.0, 1.0))


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def lumps(d, off, seed, amp=0.03, freq=1.3, fine=0.008):
    """Low-frequency lumpiness of a seed body: radial multiplier around 1."""
    return 1.0 + amp * C.fbm3(d * freq + off, 2, seed=seed) + fine * C.perlin3(d * 4.1 + off[::-1], seed + 3)


def flats(d, rng, n_max=2, depth=(0.02, 0.05), x_bias=0.6):
    """Random pressed facets (seeds grow squeezed against their neighbours): radial offset <= 0."""
    r = np.zeros(d.shape[:-1])
    for _ in range(int(rng.integers(0, n_max + 1))):
        n = rng.normal(size=3)
        n[0] *= x_bias
        n /= np.linalg.norm(n)
        r -= rng.uniform(*depth) * C.smoothstep(0.70, 1.0, d @ n)
    return r


def slow_fields(d, off, seed):
    """Baked slow colour / roughness fields in 0..1: (mott, rvar)."""
    mott = norm01(C.fbm3(d * 1.7 + off + 31.0, 3, seed=seed + 21))
    rvar = norm01(C.fbm3(d * 4.0 + off + 77.0, 3, seed=seed + 24))
    return mott, rvar


def clip_plane(verts, n, h, rough=0.0, freq=1500.0, seed=0, soft=3e-5):
    """Break a seed: project everything beyond the plane {x.n = h} onto a rough fracture surface.
    Returns (verts, frac mask 0..1)."""
    n = unit(n)
    hh = h + (rough * C.fbm3(verts * freq + 3.0, 4, seed=seed + 9) if rough else 0.0)
    over = verts @ n - hh
    frac = C.smoothstep(0.0, soft, over)
    return verts - n * np.maximum(over, 0.0)[:, None], frac


def finish(verts, tight=0.97):
    """Centre the mesh on its bounding box -> (verts, half_sizes for pack_heap)."""
    lo, hi = verts.min(0), verts.max(0)
    return verts - 0.5 * (lo + hi), tuple(0.5 * (hi - lo) * tight)


def fl(attrs):
    """Flatten / float all (nu, nv) attribute grids to per-vertex arrays."""
    return {k: np.asarray(v, float).ravel() for k, v in attrs.items()}


def rot(v, rx=0.0, ry=0.0, rz=0.0):
    """Rotate points about X, then Y, then Z (radians)."""
    for axis, a in ((0, rx), (1, ry), (2, rz)):
        if a:
            ca, sa = math.cos(a), math.sin(a)
            i, j = [(1, 2), (2, 0), (0, 1)][axis]
            M = np.eye(3)
            M[i, i], M[i, j], M[j, i], M[j, j] = ca, -sa, sa, ca
            v = v @ M.T
    return v


def rest_pose(v, rx=0.0, ry=0.0, rz=0.0):
    """Rotate, then drop on z = 0 with the origin at the footprint centre (loose-item pose)."""
    v = rot(v, rx, ry, rz)
    c = np.array([v[:, 0].min() + v[:, 0].max(), v[:, 1].min() + v[:, 1].max(), 2 * v[:, 2].min()]) * 0.5
    return v - c


def items_dict(name, prefix, entries, material=None, materials=None):
    """entries = [(verts already in rest pose, faces, attrs[, face_mat]), ...] -> make_items() dict."""
    objects, foot, half_h = [], [], []
    for i, e in enumerate(entries):
        v, f, attrs = e[0], e[1], e[2]
        kw = dict(material=material) if materials is None else dict(materials=materials, face_mat=e[3] if len(e) > 3 else None)
        objects.append(C.mesh_from_arrays('%s_item_%d' % (prefix, i), v, f, attrs=attrs, **kw))
        foot.append(float(np.hypot(v[:, 0], v[:, 1]).max()))
        half_h.append(float(v[:, 2].max() * 0.5))
    return dict(objects=objects, footprint_r=foot, half_height=half_h, name=name)


# ----------------------------------------------------------------------------- debris on a heap
def crumb_arrays(seed, flat=False, size=1e-4):
    """Irregular crumb of radius `size` (or a thin curled flake when flat)."""
    rng = np.random.default_rng(9000 + seed)
    d, T, PH = sphere_dirs(14, 18)
    r = 1.0 + 0.45 * C.fbm3(d * 1.6 + rng.uniform(0, 30, 3), 2, seed=seed)
    s = np.array([1.0, rng.uniform(0.6, 0.9), 0.10 if flat else rng.uniform(0.5, 0.8)]) * size
    v = (d * r[..., None] * s).reshape(-1, 3)
    if flat:
        k = 0.25 / size
        v[:, 2] += rng.normal(0, k) * (v[:, 0] ** 2 - v[:, 1] ** 2) + rng.normal(0, k) * v[:, 0] * v[:, 1]
    return v, C.grid_faces(14, 18, wrap_v=True)


def scatter_on_heap(heap, n, rng, hollow=0.7, reach=0.0007):
    """n points resting on the heap's height field (hollow = share that rolled into the gaps).
    Returns (loc (n,3), quat (n,4 wxyz) aligned with the local slope + random yaw, normals)."""
    gx, gy, Hf = heap.gx, heap.gy, heap.height
    xmin, xmax, ymin, ymax = heap.extent
    res = gx[1] - gx[0]
    bx, by = rng.uniform(xmin, xmax, n), rng.uniform(ymin, ymax, n)
    cx = bx[:, None] + np.concatenate([np.zeros((n, 1)), rng.uniform(-reach, reach, (n, 5))], 1)
    cy = by[:, None] + np.concatenate([np.zeros((n, 1)), rng.uniform(-reach, reach, (n, 5))], 1)
    ix = np.clip(((cx - gx[0]) / res).astype(int), 1, len(gx) - 2)
    iy = np.clip(((cy - gy[0]) / res).astype(int), 1, len(gy) - 2)
    hz = Hf[iy, ix]
    pick = np.where(rng.random(n) < hollow, hz.argmin(1), 0)
    ar = np.arange(n)
    ix, iy = ix[ar, pick], iy[ar, pick]
    loc = np.stack([cx[ar, pick], cy[ar, pick], hz[ar, pick]], 1)
    sx = (Hf[iy, ix + 1] - Hf[iy, ix - 1]) / (2 * res)
    sy = (Hf[iy + 1, ix] - Hf[iy - 1, ix]) / (2 * res)
    nrm = np.stack([-sx, -sy, np.ones(n)], 1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    w = 1.0 + nrm[:, 2]
    q1 = np.stack([w, -nrm[:, 1], nrm[:, 0], np.zeros(n)], 1)
    q1 /= np.linalg.norm(q1, axis=1, keepdims=True)
    yaw = rng.uniform(0, 2 * PI, n)
    q2 = np.stack([np.cos(yaw / 2), np.zeros(n), np.zeros(n), np.sin(yaw / 2)], 1)
    w1, x1, y1, z1 = q1.T
    w2, x2, y2, z2 = q2.T
    quat = np.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], 1)
    return loc, quat, nrm


def add_debris(heap, sol, rng, material, size=1e-4, per_m2=2.0e5, flat_material=None, flat_per_m2=0.0,
               hollow=0.6, name='debris'):
    """Crumbs (and optional flakes) of mean radius ~size scattered on / between the heap items."""
    area = (sol['patch'][1] - sol['patch'][0]) * (sol['patch'][3] - sol['patch'][2])
    dvars = [C.mesh_from_arrays('%s_c%d' % (name, i), *crumb_arrays(i, size=size), material=material) for i in range(4)]
    n_c = int(area * per_m2)
    loc, quat, nrm = scatter_on_heap(heap, n_c, rng, hollow=hollow, reach=7 * size)
    sc = rng.uniform(0.25, 1.0, n_c) ** 2 + 0.15
    loc = loc - nrm * (size * (0.3 + 0.2 * sc))[:, None]
    var = rng.integers(0, 4, n_c)
    if flat_material is not None and flat_per_m2 > 0:
        dvars += [C.mesh_from_arrays('%s_f%d' % (name, i), *crumb_arrays(10 + i, flat=True, size=size),
                                     material=flat_material) for i in range(3)]
        n_f = int(area * flat_per_m2)
        l2, q2, n2 = scatter_on_heap(heap, n_f, rng, hollow=0.85, reach=7 * size)
        loc = np.concatenate([loc, l2 - n2 * 0.3 * size])
        quat = np.concatenate([quat, q2])
        sc = np.concatenate([sc, rng.uniform(0.6, 1.8, n_f)])
        var = np.concatenate([var, 4 + rng.integers(0, 3, n_f)])
    C.instance_on_points(name, dvars, loc=loc, quat=quat, scale=sc, var=var)


# ----------------------------------------------------------------------------- shader helpers
def inst_rand3(m):
    """Three decorrelated per-instance uniforms (work for heap instances AND stand-alone objects)."""
    wn = m.node('ShaderNodeTexWhiteNoise', {'W': m.math('MULTIPLY', m.obj_random(), 517.3)}, noise_dimensions='1D')
    sep = m.node('ShaderNodeSeparateColor', {0: wn.outputs['Color']})
    return sep.outputs[0], sep.outputs[1], sep.outputs[2]


# ----------------------------------------------------------------------------- common driver
def run_pile(shot, make_variants, R, heap_kw=None, base_color=(0.05, 0.03, 0.02), base_drop=0.0005,
             light_kw=None, dof_kw=None, exposure=0.0, final_res=None, debris=None, apex=0.53, edge=0.68,
             inst_attrs=None, look='AgX - Punchy', seed=None):
    """Build the heap shot and render it (CLI of common.parse_args).
    make_variants() -> (objects, shapes, weights);  debris(heap, sol, rng) optional;
    inst_attrs(heap, rng) -> {name: per-instance array} optional."""
    args = C.parse_args(**({} if seed is None else {'seed': seed}))
    if final_res and args.quality == 'final' and not args.res:
        args.q['res'] = final_res
    C.setup_scene(args, look=look, exposure=exposure)
    rng = np.random.default_rng(args.seed)
    objects, shapes, weights = make_variants()
    sol = C.planet_solve(R)
    kw = dict(layers=3.2, coverage=0.72, seed=args.seed, candidates=6, sink=0.10, scale_range=(0.9, 1.1),
              tilt_deg=12, roll_deg=30)
    kw.update(heap_kw or {})
    heap = C.pack_heap(R, sol['patch'], shapes, weights=weights, **kw)
    C.instance_on_points('heap', objects, heap, attrs=inst_attrs(heap, rng) if inst_attrs else None)
    C.dome_base(R - base_drop, C.simple_material('base', base_color, 0.9))
    if debris:
        debris(heap, sol, rng)
    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=apex, edge=edge)
    dk = dict(near_blur_px=7, far_blur_px=3)
    dk.update(dof_kw or {})
    C.auto_dof(cam, info, **dk)
    lk = dict(tint=(1.0, 0.95, 0.88), key=0.85, fill=0.70, rim=1.0, world=0.9, key_size=1.0)
    lk.update(light_kw or {})
    C.studio_lights(info, **lk)
    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or (os.path.join(C.PREVIEW_DIR, shot + '_comp.jpg') if args.quality == 'final'
                         else os.path.splitext(args.out)[0] + '_comp.jpg')
    if args.region:
        C.quick_comp(args.out, shot, comp, crop=args.region, text=False)
    else:
        C.quick_comp(args.out, shot, comp)
    print('[comp]', comp)
    return heap, info
