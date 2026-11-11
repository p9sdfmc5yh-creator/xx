# -*- coding: utf-8 -*-
"""k15_qianshi - 芡实: a mound of dried euryale seeds (fox nut), mostly broken halves, kind = pile.

    python k15_qianshi.py --quality preview --out /tmp/x.png
    python k15_qianshi.py --quality draft --res 3840x2160 --spp 16 --region 0.40,0.56,0.60,0.76 --out /tmp/c.png
    python k15_qianshi.py --quality final --out film/renders/k15_qianshi.png

A euryale kernel: 5-8 mm sphere; about two thirds of the surface carry a thin red-brown to dark
purplish-brown seed coat (内种皮) with a faint irregular net of veins, the remaining end (-X) is
yellowish-white with a small dimple (hilum).  The commodity is mostly broken: halves and smaller
fragments showing a flat, chalk-white, floury fracture face.  Matte, starchy.  Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _seeds as S                                                                    # noqa: E402
C, PI = S.C, math.pi

SHOT = 'k15_qianshi'
NAME = '芡实'
R_DOME = 0.24                 # 7 mm seed -> ~85 px at the horizon of a 1920 frame
KINDS = ['whole'] * 4 + ['half'] * 6 + ['frag'] * 3


# ----------------------------------------------------------------------------- 1. geometry
def _fracture(verts, n, h, a, seed):
    """Break along a NON-planar, floury surface: gently conchoidal (mm-scale warp) + crumbly relief,
    slightly dished in the middle; returns (verts, frac mask)."""
    n = S.unit(n)
    t = verts - np.outer(verts @ n, n)
    rr = np.linalg.norm(t, axis=1) / a
    hh = (h + 0.10 * a * C.perlin3(verts * (0.9 / a) + 3.0 + seed, seed + 8)
          + 0.035 * a * C.fbm3(verts * (3.2 / a) + 7.0, 3, seed=seed + 9)
          + 5.0e-5 * C.fbm3(verts * 5200.0, 2, seed=seed + 10) - 0.05 * a * (1.0 - rr ** 2))
    over = verts @ n - hh
    return verts - n * np.maximum(over, 0.0)[:, None], C.smoothstep(0.0, 4e-5, over)


def qian_arrays(seed, kind='whole', nu=190, nv=260):
    """One euryale seed / half / fragment.  Halves are returned with the fracture face on +Z."""
    rng = np.random.default_rng(6600 + seed)
    d, T, PH = S.sphere_dirs(nu, nv, pole_dense=0.2)
    D = rng.uniform(0.0056, 0.0080)
    a, b, c = 0.5 * D * rng.uniform(0.95, 1.04), 0.5 * D, 0.5 * D * rng.uniform(0.92, 1.0)
    off = rng.uniform(0, 50, 3)
    r = S.lumps(d, off, seed, amp=0.040, freq=1.4, fine=0.012) + S.flats(d, rng, 2, (0.02, 0.05), x_bias=1.0)
    # seed coat covers the +X two thirds; irregular chipped boundary, a few abraded holes
    Tb = rng.uniform(1.00, 1.30)
    en = 0.20 * C.fbm3(d * 2.6 + off + 11.0, 3, seed=seed + 5) + 0.05 * C.fbm3(d * 9.0 + off, 2, seed=seed + 6)
    coat = C.smoothstep(Tb - 0.025, Tb + 0.025, T + en)
    chip = C.smoothstep(0.80, 0.86, S.norm01(C.fbm3(d * 5.0 + off + 40.0, 3, seed=seed + 7)))
    coat = coat * (1.0 - chip)
    r = r + 0.016 * coat
    # white end: slightly flattened, small dimple (hilum) at the pole
    hil = np.exp(-(T / rng.uniform(0.16, 0.22)) ** 2)
    r = r - 0.035 * C.smoothstep(Tb, 0.0, T) - 0.045 * hil
    verts = (d * r[..., None] * [a, b, c]).reshape(-1, 3)
    frac = np.zeros(len(verts))
    if kind != 'whole':
        n = S.unit(rng.normal(size=3))
        verts, frac = _fracture(verts, n, rng.uniform(-0.18, 0.12) * a, a, seed)
        e1 = S.unit(np.cross(n, [0.3, 0.5, 0.8]))
        e2 = np.cross(n, e1)
        verts = verts @ np.stack([e1, e2, n], 0).T                   # fracture normal -> +Z
        if kind == 'frag':
            t = rng.uniform(0, 2 * PI)
            n2 = S.unit([math.cos(t), math.sin(t), rng.normal(0, 0.25)])
            verts, f2 = _fracture(verts, n2, rng.uniform(-0.10, 0.30) * a, a, seed + 50)
            frac = np.maximum(frac, f2)
    verts, hs = S.finish(verts, 0.97)
    mott, rvar = S.slow_fields(d, off, seed)
    attrs = S.fl(dict(coat=coat, hil=C.smoothstep(0.3, 0.8, hil), mott=mott, rvar=rvar))
    attrs['coat'] = attrs['coat'] * (1.0 - frac)
    attrs['frac'] = frac
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, hs


# ----------------------------------------------------------------------------- 2. materials
def qian_material():
    m = C.Mat('qianshi', sss_method='BURLEY')
    P = m.per_instance_coords()
    t1, t2, t3 = S.inst_rand3(m)
    A = m.attr
    coat, frac = A('coat'), A('frac')
    # seed coat: red-brown ... dark purplish brown, faint darker vein net, starch dust / abrasion
    cc = m.ramp(t1, [(0.00, (0.250, 0.078, 0.042)), (0.35, (0.165, 0.044, 0.029)),
                     (0.80, (0.095, 0.025, 0.022)), (1.00, (0.056, 0.016, 0.018))])
    cc = m.hsv(cc, 0.5, 1.0, m.map_range(A('mott'), 0, 1, 0.72, 1.22))
    Pw = m.mix(P, m.noise(scale=450, detail=2, vector=P, color=True), 0.0007, blend='ADD')
    ve = m.voronoi(scale=950, feature='DISTANCE_TO_EDGE', vector=Pw)
    vein = m.map_range(ve, 0.0, 0.075, 1.0, 0.0, smooth=True)
    cc = m.mix(cc, (0.034, 0.010, 0.012), m.math('MULTIPLY', vein, 0.50))
    dn = m.noise(scale=1100, detail=4, roughness=0.60, vector=P)
    dust = m.math('MULTIPLY', m.map_range(dn, 0.46, 0.80), m.map_range(t2, 0, 1, 0.10, 0.90))
    cc = m.mix(cc, (0.360, 0.220, 0.170), m.math('MULTIPLY', dust, 0.40))
    # yellowish-white end with tan staining, brown hilum dimple
    wn = m.noise(scale=1500, detail=3, roughness=0.6, vector=P)
    wc = m.mix((0.600, 0.490, 0.290), (0.700, 0.630, 0.450), wn)
    wc = m.mix(wc, (0.300, 0.180, 0.080), m.math('MULTIPLY', A('hil'), 0.8))
    # floury chalk-white fracture
    fn = m.noise(scale=2600, detail=4, roughness=0.7, vector=P)
    fc = m.mix((0.640, 0.610, 0.530), (0.780, 0.770, 0.730), fn)
    fc = m.hsv(fc, 0.5, m.map_range(t3, 0, 1, 0.7, 1.5), m.map_range(A('mott'), 0, 1, 0.94, 1.03))
    col = m.mix(m.mix(wc, cc, coat), fc, frac)
    col = m.jitter(col, hue=0.008, saturation=0.08, value=0.10)
    rough = m.mixf(0.72, m.map_range(A('rvar'), 0, 1, 0.50, 0.72), coat)
    rough = m.mixf(rough, 0.86, m.math('MULTIPLY', dust, coat))
    rough = m.mixf(rough, 0.93, frac)
    nrm = m.bump(vein, strength=m.math('MULTIPLY', coat, 0.5), distance=0.00004)
    mic = m.noise(scale=4200, detail=4, roughness=0.68, vector=P)
    nrm = m.bump(mic, strength=m.mixf(0.6, 1.0, frac), distance=m.mixf(0.000025, 0.00010, frac), normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.50, specular=m.mixf(0.25, 0.38, coat),
          sss=m.mixf(0.50, 0.08, coat), sss_radius=(1.0, 0.85, 0.70), sss_scale=0.0009,
          sheen=m.mixf(0.15, 0.05, coat), sheen_roughness=0.5, normal=nrm)
    return m


def starch_material():
    m = C.Mat('qian_starch')
    n = m.noise(scale=15000, detail=2)
    m.set(base_color=m.jitter(m.mix((0.66, 0.63, 0.56), (0.78, 0.77, 0.73), n), 0.01, 0.1, 0.12), roughness=0.9,
          sss=0.4, sss_radius=(1.0, 0.8, 0.6), sss_scale=0.0002)
    return m


# ----------------------------------------------------------------------------- loose items
def make_items(seed=0):
    """7 loose pieces: 2 whole seeds, 3 halves (two fracture-up, one coat-up), 2 fragments."""
    mat = qian_material()
    rng = np.random.default_rng(seed)
    specs = [('whole', 0.4, 0.3), ('whole', 2.0, -1.2), ('half', 0.0, 0.0), ('half', 0.08, 0.0), ('half', PI, 0.0),
             ('frag', 0.0, 0.0), ('frag', PI, 0.0)]
    entries = []
    for i, (kind, rx, ry) in enumerate(specs):
        v, f, attrs, _ = qian_arrays(seed + 30 + i, kind)
        entries.append((S.rest_pose(v, rx + rng.normal(0, 0.04), ry, rng.uniform(0, 2 * PI)), f, attrs))
    return S.items_dict(NAME, 'qianshi', entries, material=mat)


# ----------------------------------------------------------------------------- build + render
def make_variants():
    mat = qian_material()
    objs, shapes = [], []
    for i, kind in enumerate(KINDS):
        v, f, attrs, hs = qian_arrays(i, kind)
        objs.append(C.mesh_from_arrays('qs%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(hs)
    w = [{'whole': 0.9, 'half': 1.0, 'frag': 0.7}[k] for k in KINDS]
    return objs, shapes, w


def debris(heap, sol, rng):
    S.add_debris(heap, sol, rng, starch_material(), size=1.6e-4, per_m2=1.1e5, hollow=0.65)


def main():
    S.run_pile(SHOT, make_variants, R_DOME,
               heap_kw=dict(layers=3.3, coverage=0.74, scale_range=(0.86, 1.10), tilt_deg=17, roll_deg=20, flip=True,
                            candidates=10, sink=0.10, rough=0.0012),
               base_color=(0.060, 0.035, 0.028), base_drop=0.0012, debris=debris,
               light_kw=dict(tint=(0.96, 0.98, 1.0), key=0.72, fill=0.55, rim=0.9, world=0.8, key_size=1.0))


if __name__ == '__main__':
    main()
