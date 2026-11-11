# -*- coding: utf-8 -*-
"""k06_sangshen - ripe mulberries (桑椹, Morus alba fruit), kind = pile.

    python k06_sangshen.py --quality preview --threads 2 --out /tmp/x.png
    python k06_sangshen.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.50,0.63,0.75 --out crop.png
    python k06_sangshen.py --quality final --out film/renders/k06_sangshen.png

True scale (metres): each berry a 15-25 x 8-12 mm oblong aggregate of ~100 tightly packed 2-3 mm drupelets.
The drupelets are REAL geometry: a Poisson-disc set of seed points on the body, every vertex is pushed out by a
bead profile of its Voronoi cell (deep creases between beads).  Per-drupelet random id + per-berry ripeness
drive the colour (purple-black / dark red-purple / red), each drupelet carries its dark style point.
make_items(seed) -> loose berries for the flat-lay film.
"""
import os, sys, math
import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _fruits as F                                                                   # noqa: E402

SHOT = 'k06_sangshen'
R_DOME = 0.28
N_PLAIN, N_STALK = 6, 3


# ----------------------------------------------------------------------------- 1. geometry
def make_mulberry(seed, stalk=False, nu=250, nv=216):
    """One mulberry, long axis X (stalk end at -X).  -> (parts, attrs, half_sizes)."""
    rng = np.random.default_rng(11000 + seed)
    sd = seed * 41 + 11
    L = rng.uniform(0.0160, 0.0260)
    Wd = float(np.clip(L * rng.uniform(0.42, 0.56), 0.0080, 0.0118))
    dsp = rng.uniform(0.0018, 0.0023)                                 # drupelet spacing
    Hd = 0.50 * dsp                                                   # bulge height
    a, b = 0.5 * L - 0.8 * Hd, 0.5 * Wd - 0.8 * Hd
    s = np.linspace(0.0, 1.0, nu)[:, None]
    ph = np.linspace(0.0, 2 * math.pi, nv, endpoint=False)[None, :]
    th = 2e-3 + (math.pi - 4e-3) * s
    e = 2.0 / rng.uniform(2.2, 2.7)
    ct, st = np.cos(th), np.sin(th)
    x = -a * np.sign(ct) * np.abs(ct) ** e
    r = b * np.abs(st) ** e * (1.0 - rng.uniform(0.02, 0.20) * x / a)   # narrower towards the tip
    flat = rng.uniform(0.90, 1.0)
    lump = 1.0 + 0.06 * F.noise3(C.fbm3, np.stack([x / b + 0 * ph, np.cos(ph) + 0 * x, np.sin(ph) + 0 * x], -1) * 0.9 + 3.0,
                                 2, seed=sd)
    P0 = np.stack([x + 0 * ph, r * np.cos(ph) * lump, r * np.sin(ph) * lump * flat], -1)
    u = x / a
    P0[..., 1] += rng.normal(0, 0.05) * L * (1.0 - u * u)
    P0[..., 2] += rng.normal(0, 0.03) * L * (1.0 - u * u)
    dPs = np.gradient(P0, s[:, 0], axis=0)
    dPp = np.gradient(P0, ph[0], axis=1)
    N0 = np.cross(dPp, dPs)
    area = np.linalg.norm(N0, axis=-1)
    N0 = N0 / np.maximum(area, 1e-30)[..., None]
    N0[0], N0[-1] = [-1.0, 0, 0], [1.0, 0, 0]

    # Poisson-disc drupelet centres on the body (area-weighted dart throwing)
    flatP = P0.reshape(-1, 3)
    cand = rng.choice(len(flatP), size=7000, p=(area / area.sum()).ravel())
    seeds, rmin = [], []
    for i in cand:
        p = flatP[i]
        dm = dsp * rng.uniform(0.86, 1.16)
        if seeds:
            d = np.linalg.norm(np.asarray(seeds) - p, axis=1)
            if (d < 0.5 * (dm + np.asarray(rmin))).any():
                continue
        seeds.append(p); rmin.append(dm)
    seeds = np.asarray(seeds)
    nd = len(seeds)
    dist, idx = cKDTree(seeds).query(flatP, k=3)
    d1 = dist[:, 0]
    rb = 0.66 * np.asarray(rmin)                                      # bead radius: neighbours squeeze each other
    hm = rng.uniform(0.78, 1.18, nd)                                  # some drupelets plumper than others
    hm[rng.random(nd) < 0.06] *= 0.55                                 # a few aborted / shrunken ones
    cap = np.sqrt(np.clip(1.0 - (dist / rb[idx]) ** 2, 0.0, 1.0))     # spherical caps of the 3 nearest drupelets
    hk = Hd * hm[idx] * cap
    own = idx[np.arange(len(idx)), hk.argmax(1)]                      # the bead a vertex belongs to (union of caps)
    h = hk.max(1)
    rel = h / Hd
    h = h - 0.00006 * np.exp(-(d1 / 0.00016) ** 2)                    # tiny pit where the style sat
    verts = flatP + N0.reshape(-1, 3) * h[:, None]
    faces = C.grid_faces(nu, nv, wrap_v=True)
    did = rng.random(nd)
    attrs = dict(did=did[own], cav=1.0 - C.smoothstep(0.0, 0.55, rel), style=np.exp(-(d1 / 0.00019) ** 2),
                 slen=(s + 0 * ph).ravel())
    parts = [(verts, faces, 0)]
    if stalk:                                                         # short fruit stalk, green to brown
        n = 22
        t = np.linspace(0, 1, n)[:, None]
        p0 = np.array([-a + 0.0004, P0[0, :, 1].mean(), P0[0, :, 2].mean()])
        d = F.unit([-1.0, rng.normal(0, 0.3), rng.normal(0.1, 0.3)])
        side = F.unit(np.cross(d, [0.2, 0.3, 1.0]))
        ln = rng.uniform(0.005, 0.012)
        path = p0 + d * ln * t + side * ln * 0.35 * rng.normal() * t ** 2
        rr = rng.uniform(0.00042, 0.00058) * (1.1 - 0.2 * t[:, 0])
        rr[0] *= 1.5
        rr[-1] *= 0.35
        sv, sf = C.tube(path, rr, nv=12)
        parts.append((sv, sf, 1))
        for k in attrs:
            attrs[k] = np.concatenate([attrs[k], np.zeros(len(sv))])
        attrs['slen'][-len(sv):] = np.repeat(t[:, 0], len(sv) // n)
    print('[mulberry %d] %.1f x %.1f mm, %d drupelets' % (seed, L * 1e3, Wd * 1e3, nd))
    return parts, attrs, (0.5 * L * 0.95, 0.5 * Wd * 0.94, 0.5 * Wd * flat * 0.94)


# ----------------------------------------------------------------------------- 2. materials
def mulberry_material(sss_method='BURLEY'):
    m = C.Mat('mulberry', sss_method=sss_method)
    P = m.per_instance_coords()
    did, cav, style = m.attr('did'), m.attr('cav'), m.attr('style')
    unripe = m.attr('unripe', 'INSTANCER')                            # 0 ripe purple-black ... 1 red
    # ripeness per drupelet: unripe berries are patchy (some drupelets redder), ripe ones nearly uniform
    spread = m.map_range(unripe, 0.0, 1.0, 0.16, 0.60)
    r = m.math('SUBTRACT', m.math('SUBTRACT', 1.0, unripe),
               m.math('MULTIPLY', m.math('SUBTRACT', did, 0.45), spread))
    r = m.math('ADD', r, m.map_range(m.noise(scale=160, detail=2, roughness=0.5, vector=P), 0.3, 0.7, -0.10, 0.10))
    col = m.ramp(r, [(0.00, (0.300, 0.012, 0.022)), (0.30, (0.180, 0.006, 0.018)), (0.55, (0.075, 0.004, 0.020)),
                     (0.80, (0.020, 0.0035, 0.015)), (1.00, (0.0075, 0.0030, 0.0085))])
    col = m.jitter(col, hue=0.008, saturation=0.06, value=0.15)
    col = m.mix(col, m.hsv(col, 0.5, 1.0, 0.35), m.map_range(cav, 0.30, 1.0, 0.0, 0.85, smooth=True))   # creases
    stm = m.map_range(style, 0.25, 0.75, smooth=True)
    col = m.mix(col, (0.012, 0.007, 0.005), stm)
    rn = m.noise(scale=1300, detail=3, roughness=0.6, vector=P)
    rough = m.map_range(rn, 0.30, 0.70, 0.07, 0.20)
    rough = m.mixf(rough, 0.45, m.map_range(cav, 0.45, 1.0))
    rough = m.mixf(rough, 0.75, stm)
    rough = m.math('ADD', rough, m.map_range(m.attr('inst_rand', 'INSTANCER'), 0, 1, -0.02, 0.07))
    coat = m.math('MULTIPLY', m.map_range(cav, 0.4, 1.0, 0.65, 0.15), m.map_range(stm, 0, 1, 1.0, 0.0))
    skin = m.noise(scale=4200, detail=2, roughness=0.55, vector=P)
    nrm = m.bump(skin, strength=0.12, distance=0.00003)
    nrm = m.bump(stm, strength=0.4, distance=0.00002, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.42, specular=0.55,
          sss=m.map_range(r, 0.0, 0.8, 0.60, 0.30), sss_radius=(1.0, 0.12, 0.14), sss_scale=0.0014,
          coat=coat, coat_roughness=0.035, normal=nrm)
    return m


def stalk_material():
    m = C.Mat('mulberry_stalk')
    P = m.per_instance_coords()
    n = m.noise(scale=2000, detail=3, roughness=0.6, vector=m.mapping(P, scale=(0.25, 1, 1)))
    green = m.mix((0.070, 0.125, 0.022), (0.150, 0.210, 0.045), n)
    brown = m.mix((0.070, 0.038, 0.016), (0.190, 0.110, 0.050), n)
    age = m.math('ADD', m.attr('slen'), m.map_range(m.attr('inst_rand', 'INSTANCER'), 0, 1, -0.7, 0.5))
    m.set(base_color=m.mix(green, brown, m.map_range(age, 0.2, 0.8, smooth=True)), roughness=0.55, specular=0.35,
          sss=0.2, sss_radius=(0.5, 1.0, 0.2), sss_scale=0.0004, normal=m.bump(n, 0.5, 0.00005))
    return m


_MATS = {}


def _materials():
    if _MATS.get('a') is None or _MATS['a'].mat.name not in C.bpy.data.materials:
        _MATS['a'], _MATS['b'] = mulberry_material(), stalk_material()
    return [_MATS['a'], _MATS['b']]


def make_items(seed=0):
    """Loose ripe mulberries lying on their side (two keep the stalk) -> dict(objects, footprint_r, half_height, name).
    The shader reads the per-instance attribute 'unripe' (0 = ripe purple-black, default; 1 = red)."""
    rng = np.random.default_rng(seed + 3)
    objs, fr, hh = [], [], []
    for i in range(6):
        parts, attrs, half = make_mulberry(50 + seed * 7 + i, stalk=(i in (1, 4)))
        q = F.quat_mul(F.quat_axis((0, 0, 1), rng.uniform(0, 6.28)), F.quat_axis((1, 0, 0), rng.uniform(0, 6.28)))
        ob, r, h = F.rest_item('sangshen_item_%d' % i, parts, attrs, _materials(), F.quat_matrix(q))
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='桑椹')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args(seed=3)                                       # seed 3: silhouette well inside the framing contract
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    rng = np.random.default_rng(args.seed)
    mats = _materials()
    variants, shapes = [], []
    for i in range(N_PLAIN + N_STALK):
        parts, attrs, half = make_mulberry(i, stalk=(i >= N_PLAIN))
        v, f, fm = C.merge_meshes(parts)
        variants.append(C.mesh_from_arrays('mulberry_%03d' % i, v, f, attrs=attrs, materials=mats, face_mat=fm))
        shapes.append(half)
    weights = [1.0] * N_PLAIN + [0.45] * N_STALK

    sol = C.planet_solve(R_DOME + 0.035)                              # camera is fitted to the heap top
    x0, x1, y0, y1 = sol['patch']
    patch = (x0 * 1.32, x1 * 1.32, y0 * 1.16, y1 * 1.16)
    heap = C.pack_heap(R_DOME, patch, shapes, layers=3.0, coverage=0.74, weights=weights, seed=args.seed,
                       scale_range=(0.86, 1.10), tilt_deg=14, roll_deg=180, candidates=14, sink=0.12, rough=0.002)
    n = len(heap.loc)
    k = rng.random(n)
    unripe = np.where(k < 0.76, rng.uniform(0.0, 0.12, n), np.where(k < 0.92, rng.uniform(0.25, 0.50, n),
                                                                     rng.uniform(0.65, 1.0, n)))
    C.instance_on_points('heap', variants, heap, attrs={'unripe': unripe})
    C.dome_base(R_DOME - 0.002, C.simple_material('base', (0.006, 0.002, 0.006), 0.9))

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.54, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(1.0, 0.93, 0.97), key=1.0, fill=0.85, rim=1.3, world=1.2, key_size=0.6)
    F.finish(args, SHOT)


if __name__ == '__main__':
    main()
