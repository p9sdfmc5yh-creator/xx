# -*- coding: utf-8 -*-
"""k04_heizhima - 黑芝麻: a mound of black sesame seeds, macro, kind = pile.

    python k04_heizhima.py --quality preview --out /tmp/x.png
    python k04_heizhima.py --quality draft --res 3840x2160 --spp 16 --region 0.40,0.56,0.60,0.76 --out /tmp/c.png
    python k04_heizhima.py --quality final --out film/renders/k04_heizhima.png

A black sesame seed: ~3 mm x 1.8 mm x 0.9 mm flat ovate / teardrop, pointed end (-X) with a tiny
pale-brown hilum, round other end; charcoal black to very dark brown, matte with a faint oily sheen,
finely pebbled / reticulate testa, a faint raised ridge just inside the edge on both faces, faces
often slightly dented.  Seeds lie flat in every direction, a few on edge.  Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _seeds as S                                                                    # noqa: E402
C, PI = S.C, math.pi

SHOT = 'k04_heizhima'
NAME = '黑芝麻'
R_DOME = 0.13                 # 3 mm seed -> ~67 px at the horizon of a 1920 frame
N_VARIANTS = 10


# ----------------------------------------------------------------------------- 1. geometry
def sesame_arrays(seed, nu=150, nv=112):
    """One sesame seed (long axis X, pointed hilum end at -X, flat faces +-Z)."""
    rng = np.random.default_rng(6400 + seed)
    s = 1.0 - (1.0 - np.linspace(0.0, 1.0, nu)) ** 1.8           # rings crowd towards the round end (closed cap)
    s[0], s[-1] = 1e-6, 1 - 1e-9
    ph = np.linspace(0, 2 * PI, nv, endpoint=False)
    Sg, PH = np.meshgrid(s, ph, indexing='ij')
    L = rng.uniform(0.0027, 0.0034)
    Wd = L * rng.uniform(0.56, 0.66)
    Th = rng.uniform(0.00080, 0.00106)
    off = rng.uniform(0, 50, 3)
    k = rng.uniform(1.30, 1.55)                                   # fattest part towards the round end
    e = 0.50 + rng.uniform(0.30, 0.42) * (1.0 - Sg)               # round at s = 1, pointed at s = 0
    f = np.sin(PI * Sg ** k) ** e
    f = f / f.max()
    tp = f ** 0.62                                                # thickness falls off only near the ends
    cph, sph = np.cos(PH), np.sin(PH)
    sgn = np.sign(sph)
    lens = sgn * np.abs(sph) ** 0.70                              # plump, blunt-edged lens
    X = (Sg - 0.5) * L
    cyl = np.stack([Sg * 2.0, cph, sph], -1)
    lump = 1.0 + 0.045 * C.fbm3(cyl * 1.3 + off, 2, seed=seed)
    ridge = np.exp(-((np.abs(cph) - 0.80) / 0.075) ** 2) * np.clip(f * 2.0, 0, 1)
    side = (sph > 0).astype(float)
    d_top, d_bot = rng.uniform(0.0, 0.22), rng.uniform(-0.08, 0.14)
    sc = rng.uniform(0.52, 0.66)
    dent = np.exp(-(((Sg - sc) / 0.24) ** 2 + (cph / 0.62) ** 2))
    damt = side * d_top + (1 - side) * max(d_bot, 0.0)
    Y = 0.5 * Wd * f * cph * lump
    Z = 0.5 * Th * tp * lens * lump * (1.0 + 0.04 * ridge - damt * dent)
    # warp: seeds are never flat - slight curl along and across, a little twist
    xn, yn = X / (0.5 * L), Y / (0.5 * Wd)
    Z = Z + rng.normal(0, 0.05) * Th * xn ** 2 + rng.normal(0, 0.08) * Th * yn ** 2 + rng.normal(0, 0.07) * Th * xn * yn
    Y = Y + rng.normal(0, 0.03) * Wd * xn ** 2
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    verts, hs = S.finish(verts, 0.97)
    mott = S.norm01(C.fbm3(cyl * 1.6 + off + 31.0, 3, seed=seed + 21))
    rvar = S.norm01(C.fbm3(cyl * 3.5 + off + 77.0, 3, seed=seed + 24))
    attrs = S.fl(dict(hil=np.exp(-(Sg / 0.030) ** 2), tipz=np.exp(-(Sg / 0.14) ** 2), ridge=ridge,
                      edge=np.abs(cph) ** 8 * np.clip(f * 2, 0, 1), dent=dent * damt / 0.22, mott=mott, rvar=rvar))
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, hs


# ----------------------------------------------------------------------------- 2. material
def sesame_material():
    m = C.Mat('heizhima', sss_method='BURLEY')
    P = m.per_instance_coords()
    t1, t2, t3 = S.inst_rand3(m)
    A = m.attr
    # item-to-item: some brownish, most charcoal black, a few greyish (bloomed)
    body = m.ramp(t1, [(0.00, (0.075, 0.040, 0.020)), (0.07, (0.036, 0.022, 0.014)), (0.25, (0.017, 0.014, 0.012)),
                       (0.90, (0.010, 0.0095, 0.0095)), (1.00, (0.032, 0.030, 0.028))])
    col = m.hsv(body, 0.5, 1.0, m.map_range(A('mott'), 0, 1, 0.75, 1.25))
    # pebbled / reticulate testa: 0.07 mm cells, raised centres, darker joints
    Pw = m.mix(P, m.noise(scale=3000, detail=1, vector=P, color=True), 0.00006, blend='ADD')
    vd = m.voronoi(scale=14500, feature='F1', vector=Pw)
    peb = m.map_range(vd, 0.08, 0.62, 1.0, 0.0, smooth=True)
    col = m.hsv(col, 0.5, 1.0, m.map_range(peb, 0, 1, 0.62, 1.30))
    # greyish waxy bloom / dust in patches, paler worn edge + ridge, pale-brown hilum, brownish tip
    dn = m.noise(scale=2600, detail=3, roughness=0.65, vector=P)
    dust = m.math('MULTIPLY', m.map_range(dn, 0.50, 0.75), m.map_range(t2, 0, 1, 0.0, 0.8))
    col = m.mix(col, (0.070, 0.066, 0.060), m.math('MULTIPLY', m.math('MULTIPLY', dust, peb), 0.35))
    col = m.mix(col, (0.070, 0.045, 0.028), m.math('MULTIPLY', m.math('MAXIMUM', A('edge'), A('ridge')), 0.22))
    col = m.mix(col, (0.060, 0.034, 0.018), m.math('MULTIPLY', A('tipz'), 0.35))
    col = m.mix(col, (0.260, 0.160, 0.075), m.map_range(A('hil'), 0.35, 0.85, smooth=True))
    col = m.jitter(col, hue=0.01, saturation=0.10, value=0.18)
    rough = m.map_range(A('rvar'), 0, 1, 0.42, 0.62)
    rough = m.math('ADD', rough, m.map_range(t3, 0, 1, -0.06, 0.08))
    rough = m.mixf(rough, 0.75, dust)
    nrm = m.bump(peb, strength=1.0, distance=0.000030)
    nrm = m.micro_bump(scale=30000, strength=0.3, distance=0.000005, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.48, specular=0.50,
          coat=m.map_range(t3, 0, 1, 0.0, 0.12), coat_roughness=0.30, normal=nrm)
    return m


# ----------------------------------------------------------------------------- loose items
def make_items(seed=0):
    """8 loose sesame seeds lying flat (both faces), one tilted on a neighbourless edge."""
    mat = sesame_material()
    rng = np.random.default_rng(seed)
    entries = []
    for i, rx in enumerate([0.0, PI, 0.05, PI - 0.06, 0.0, PI, 0.1, 0.35]):
        v, f, attrs, _ = sesame_arrays(seed + 30 + i)
        entries.append((S.rest_pose(v, rx + rng.normal(0, 0.03), 0.0, rng.uniform(0, 2 * PI)), f, attrs))
    return S.items_dict(NAME, 'heizhima', entries, material=mat)


# ----------------------------------------------------------------------------- build + render
def make_variants():
    mat = sesame_material()
    objs, shapes = [], []
    for i in range(N_VARIANTS):
        v, f, attrs, hs = sesame_arrays(i)
        objs.append(C.mesh_from_arrays('zm%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(hs)
    return objs, shapes, None


def main():
    S.run_pile(SHOT, make_variants, R_DOME,
               heap_kw=dict(layers=3.4, coverage=0.72, scale_range=(0.88, 1.10), tilt_deg=17, roll_deg=30, flip=True,
                            candidates=6, sink=0.10, rough=0.0010),
               base_color=(0.006, 0.005, 0.005), base_drop=0.0004, exposure=0.10,
               light_kw=dict(tint=(1.0, 0.97, 0.92), key=1.0, fill=0.85, rim=1.5, world=1.0, key_size=1.1))


if __name__ == '__main__':
    main()
