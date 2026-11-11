# -*- coding: utf-8 -*-
"""m04_shengjiang - 生姜 (fresh ginger), macro across the freshly cut face of a rhizome.  kind = disc.

    python m04_shengjiang.py --quality preview --threads 2 --out /tmp/p.png
    python m04_shengjiang.py --quality draft --res 3840x2160 --spp 24 --region 0.35,0.48,0.62,0.76 --out /tmp/c.png
    python m04_shengjiang.py --quality final --out film/renders/m04_shengjiang.png

Anatomy (a pharmacist checks this): lobed outline; thin corky skin; cortex; a distinct thin endodermis
ring at ~78 % radius; stele crowded with vascular-bundle dots, densest in a band just inside the ring;
fibre ends standing up from the cut; juicy wet film.  Shared code: _discs.py.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _discs as D                                                                    # noqa: E402

SHOT = 'm04_shengjiang'
R0 = 0.019                # far-rim radius of the rhizome section (38 mm across)
ELEV = 25.0
KNIFE = -7.0
RING = 0.78               # endodermis radius / outline radius


def make_outline(seed=0, r0=R0):
    return D.Outline(r0, lobes=[(2, 0.035, 0.3), (3, 0.020, 1.2), (5, 0.008, 2.0)], rough=0.00003, rough_wl=0.0004,
                     wrinkle=0.00006, wrinkle_wl=0.0016, seed=seed)


# ----------------------------------------------------------------------------- 1. cut-face relief + masks
def make_fields(ol):
    def ring_r(t, seed):
        return RING + 0.020 * C.fbm3(D.P3(np.sin(t) * 2.2, np.cos(t) * 2.2, 1.7), 3, seed=seed + 20)

    def fields(x, y, d, ro, th, seed=0):
        p = D.P3(x, y)
        rn = 1.0 - d / ro
        e = (rn - ring_r(th, seed)) * ro                                    # signed distance to the endodermis [m]
        ring = np.exp(-(e / 0.00007) ** 2)
        stele = 1.0 - C.smoothstep(-0.00008, 0.00008, e)
        h = D.knife_marks(x, y, angle_deg=KNIFE, seed=seed, amp=6e-6)
        h += 3.5e-5 * C.fbm3(p * 140.0, 2, seed=seed + 1)
        h += 1.0e-5 * C.fbm3(p * 3200.0, 3, seed=seed + 2)
        # vascular bundles: sparse in the cortex, crowded in a band inside the ring, scattered in the stele
        bounds = (x.min(), x.max(), y.min(), y.max())
        cand = D.scatter(bounds, 0.00028, seed + 3)
        tc = np.arctan2(cand[:, 0], cand[:, 1])
        rc = np.hypot(cand[:, 0], cand[:, 1]) / ol.r(tc)
        rrc = ring_r(tc, seed)
        u = np.random.default_rng(seed + 4).random(len(cand))
        keep = np.where(rc > rrc + 0.012, u < 0.085, np.where(rc > rrc - 0.075, u < 0.70, u < 0.25))
        keep &= (rc < 0.975) & (np.abs(rc - rrc) > 0.008)
        pts = cand[keep]
        fields.pts = pts
        dot, dotid, q = D.dots(x, y, pts, (0.000045, 0.00011), soft=0.3, seed=seed + 5)
        q = q * (1.0 + 0.5 * C.fbm3(p * 9000.0, 2, seed=seed + 12))
        dot = 1.0 - C.smoothstep(0.30, 1.0, q)
        h += dot * (5e-6 + 1.8e-5 * dotid)                                  # tough fibre bundles stand proud
        h -= ring * 6e-6
        h -= (1.0 - stele) * 6e-6                                           # juicy cortex sinks a hair
        lipn = C.fbm3(D.P3(th * ro / 0.0005, np.zeros_like(th), 3.3), 3, seed=seed + 6)
        h += np.exp(-(d / 0.00014) ** 2) * (0.8e-5 + 2.0e-5 * lipn)
        wet = C.smoothstep(-0.30, 0.25, C.fbm3(p * 260.0, 3, seed=seed + 7))
        return h, dict(dot=dot, dotid=dotid, wet=wet, ring=ring, stele=stele)
    return fields


# ----------------------------------------------------------------------------- 2. materials
_MATS = {}


def face_material():
    if 'face' in _MATS:
        return _MATS['face']
    m = C.Mat('ginger_face', sss_method='BURLEY')
    P = m.coords('Object')
    din, dot, dotid, wet = m.attr('din'), m.attr('dot'), m.attr('dotid'), m.attr('wet')
    ring, stele = m.attr('ring'), m.attr('stele')
    mott = m.map_range(m.noise(scale=170, detail=2, roughness=0.55, vector=P), 0.3, 0.7)
    cortex_c = m.mix((0.80, 0.655, 0.29), (0.86, 0.735, 0.39), mott)        # pale cream-yellow
    stele_c = m.mix((0.77, 0.585, 0.185), (0.83, 0.665, 0.26), mott)        # a little deeper yellow
    flesh = m.mix(cortex_c, stele_c, stele)
    celld = m.voronoi(scale=9500, feature='F1', vector=P)                   # juicy parenchyma cells
    flesh = m.mix(flesh, (0.62, 0.44, 0.11), m.map_range(celld, 0.36, 0.62, 0.0, 0.5))
    grain = m.noise(scale=26000, detail=2, roughness=0.6, vector=P)
    flesh = m.mix(flesh, (0.80, 0.48, 0.05), m.map_range(grain, 0.70, 0.80, 0.0, 0.75))   # oleoresin cells
    flesh = m.mix(flesh, (0.93, 0.86, 0.60), m.map_range(grain, 0.20, 0.32, 0.5, 0.0))    # starch-pale specks
    flesh = m.mix(flesh, (0.60, 0.50, 0.19), m.math('MULTIPLY', m.map_range(din, 0.2, 1.0, 1.0, 0.0, smooth=True), 0.5))
    flesh = m.mix(flesh, (0.47, 0.33, 0.08), m.math('MULTIPLY', ring, 0.8))
    flesh = m.mix(flesh, (0.50, 0.34, 0.09), m.math('MULTIPLY', dot, m.map_range(dotid, 0, 1, 0.5, 0.95)))
    is_skin = D.skin_mask(m, P, din, thick=(0.10, 0.26))
    skin_col = m.ramp(m.noise(scale=2600, detail=3, roughness=0.7, vector=P),
                      [(0.25, (0.15, 0.095, 0.045)), (0.55, (0.36, 0.26, 0.14)), (0.80, (0.52, 0.41, 0.25))])
    col = m.mix(flesh, skin_col, is_skin)
    r_fl = m.map_range(m.noise(scale=900, detail=2, vector=P), 0.3, 0.7, 0.38, 0.58)
    rough = m.mixf(m.mixf(r_fl, 0.72, dot), 0.85, is_skin)
    kw = D.moist_layers(m, P, celld, grain, wet, is_skin, knife_deg=KNIFE, cell_h=0.000026, coat_ior=1.36,
                        coat_rough=(0.08, 0.24))
    m.set(base_color=col, roughness=rough, ior=1.45, specular=0.45,
          sss=m.mixf(0.6, 0.2, is_skin), sss_radius=(1.0, 0.70, 0.28), sss_scale=0.0006, **kw)
    _MATS['face'] = m
    return m


def flake_material():
    if 'flake' in _MATS:
        return _MATS['flake']
    m = C.Mat('ginger_skin_flake')
    P = m.coords('Object')
    n = m.noise(scale=2400, detail=4, roughness=0.65, vector=m.mapping(P, scale=(1.0, 1.0, 0.35)))
    col = m.ramp(n, [(0.25, (0.20, 0.13, 0.06)), (0.55, (0.42, 0.31, 0.17)), (0.82, (0.58, 0.47, 0.30))])
    m.set(base_color=col, roughness=0.75, normal=m.bump(n, 0.7, 0.00002))
    D.translucent_sheet(m, (0.55, 0.38, 0.18), 0.35)
    _MATS['flake'] = m
    return m


def fibre_material():
    if 'fibre' in _MATS:
        return _MATS['fibre']
    m = C.Mat('ginger_fibre')
    col = m.mix((0.70, 0.55, 0.24), (0.86, 0.76, 0.46), m.attr('frand'))
    m.set(base_color=col, roughness=0.45, sss=0.4, sss_radius=(1.0, 0.7, 0.3), sss_scale=0.00005)
    _MATS['fibre'] = m
    return m


# ----------------------------------------------------------------------------- loose items (pharmacy jar)
def make_items(seed=0, n=6):
    """Fresh ginger slices (生姜片): irregular knobbly outline, 2.5-4 mm thick, skin left on.
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    rng = np.random.default_rng(700 + seed)
    objs, fr, hh = [], [], []
    for i in range(n):
        r0 = rng.uniform(0.011, 0.018)
        ol = D.Outline(r0, lobes=[(2, rng.uniform(0.06, 0.20), rng.uniform(0, 6)), (3, rng.uniform(0.03, 0.10), rng.uniform(0, 6)),
                                  (4, rng.uniform(0.0, 0.05), rng.uniform(0, 6))],
                       rough=0.00003, wrinkle=0.00006, wrinkle_wl=0.0016, seed=seed * 13 + i)
        ob, r, h = D.slice_item('shengjiang_item_%d' % i, ol, rng.uniform(0.0025, 0.004), make_fields(ol), face_material(),
                                seed=seed * 13 + i, warp=rng.uniform(0.0, 0.012), nr=130, nth=420)
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='生姜')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    cam, info = C.disc_camera(R0, elevation_deg=ELEV, lens_mm=85, apex=0.535, edge=0.68)
    ol = make_outline(args.seed)
    fields = make_fields(ol)
    face, F = D.hero_face('ginger_face', ol, info, fields, face_material(), n_max=D.n_max_for(args), fillet=0.00006,
                          seed=args.seed)
    # fibre ends standing up from ~1 in 6 vascular bundles (the knife drags them out)
    rng = np.random.default_rng(args.seed + 30)
    pts = fields.pts
    b = F['bounds']
    tp = np.arctan2(pts[:, 0], pts[:, 1])
    ok = ((pts[:, 0] > b[0]) & (pts[:, 0] < b[1]) & (pts[:, 1] > b[2]) &
          (np.hypot(pts[:, 0], pts[:, 1]) < ol.r(tp) - 0.0012) & (rng.random(len(pts)) < 0.16))
    fp = pts[ok]
    base = np.stack([fp[:, 0], fp[:, 1], F['height'](fp[:, 0], fp[:, 1]) - 4e-6], 1)
    D.fibres('ginger_fibres', base, fibre_material(), length=(0.00015, 0.0009), radius=(0.000009, 0.000018),
             lean=0.7, curl=0.6, seed=args.seed + 31)
    D.flakes('ginger_flakes', ol, info, flake_material(), n=20, th_range=(-0.85, 0.85), width=(0.0004, 0.0016),
             length=(0.0004, 0.0020), lift=(0.15, 1.1), curl=(-0.4, 1.5), z0=-0.00004, seed=args.seed + 9)
    D.flakes('ginger_fray', ol, info, flake_material(), n=30, th_range=(-0.85, 0.85), width=(0.00008, 0.0003),
             length=(0.0001, 0.0005), lift=(0.3, 1.4), curl=(-0.6, 1.2), z0=-0.00003, seed=args.seed + 19)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=2.2)
    D.lights(info, tint=(0.80, 0.90, 1.0), key=0.42, fill=0.50, rim=0.9, top=0.15, sheen=1.2, sheen_size=0.6,
             sheen_az=-9, sheen_el=28)
    D.finish(args, SHOT)


if __name__ == '__main__':
    main()
