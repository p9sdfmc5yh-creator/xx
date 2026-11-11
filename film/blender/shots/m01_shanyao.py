# -*- coding: utf-8 -*-
"""m01_shanyao - 山药 (Chinese yam), macro across the freshly cut face of a thick 铁棍山药.  kind = disc.

    python m01_shanyao.py --quality preview --threads 2 --out /tmp/p.png
    python m01_shanyao.py --quality draft --res 3840x2160 --spp 24 --region 0.35,0.45,0.60,0.70 --out /tmp/c.png
    python m01_shanyao.py --quality final --out film/renders/m01_shanyao.png

Structure: fields() = numpy micro relief + masks of the cut face (knife ridges, granular starch, sparse
vascular dots, skin lip), face_material() = moist ivory flesh (SSS + patchy mucilage coat with glints),
thin tan skin in cross-section at the far rim, whisker rootlets past the horizon.  Shared code: _discs.py.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _discs as D                                                                    # noqa: E402

SHOT = 'm01_shanyao'
R0 = 0.023                # slice radius: a thick iron-stick yam, 46 mm across
ELEV = 25.0
KNIFE = 9.0               # direction of the knife strokes, degrees from +X


def make_outline(seed=0, r0=R0):
    return D.Outline(r0, lobes=[(2, 0.016, 0.6), (3, 0.010, 2.0), (5, 0.005, 1.0)], rough=0.00004,
                     rough_wl=0.0005, nubs=44, nub_h=0.00020, nub_w=0.00032, seed=seed)


# ----------------------------------------------------------------------------- 1. cut-face relief + masks
def fields(x, y, d, ro, th, seed=0):
    p = D.P3(x, y)
    h = D.knife_marks(x, y, angle_deg=KNIFE, seed=seed, amp=3.5e-6)
    h += 1.8e-5 * C.fbm3(p * 130.0, 2, seed=seed + 1)                     # the blade never cuts dead flat
    h += 6e-6 * C.fbm3(p * 3000.0, 3, seed=seed + 2)                      # granular starch lumps (0.3 mm)
    bounds = (x.min(), x.max(), y.min(), y.max())
    pts = D.scatter(bounds, 0.0012, seed + 3, density=lambda a, b: 0.6)   # scattered vascular bundles
    dot, dotid, q = D.dots(x, y, pts, (0.00005, 0.00012), soft=0.35, seed=seed + 4)
    dot = dot * (d > 0.0007)
    h += dot * (dotid - 0.45) * 1.6e-5                                    # some are pits, some ooze a bead
    lipn = C.fbm3(D.P3(th * ro / 0.0005, np.zeros_like(th), 3.3), 3, seed=seed + 6)
    h += np.exp(-(d / 0.00016) ** 2) * (1.0e-5 + 2.2e-5 * lipn)           # tough skin leaves a tiny burr
    h -= 0.9e-5 * np.exp(-((d - 0.0006) / 0.0004) ** 2)                   # cortex sinks a little
    wet = C.smoothstep(-0.30, 0.25, C.fbm3(p * 260.0, 3, seed=seed + 7))  # mucilage film is patchy
    return h, dict(dot=dot, dotid=dotid, wet=wet)


# ----------------------------------------------------------------------------- 2. materials
_MATS = {}


def face_material(dry=False):
    key = 'dry' if dry else 'wet'
    if key in _MATS:
        return _MATS[key]
    m = C.Mat('yam_face_' + key, sss_method='BURLEY')
    P = m.coords('Object')
    din, dot, dotid, wet = m.attr('din'), m.attr('dot'), m.attr('dotid'), m.attr('wet')
    # flesh: ivory white, slow cream mottling, cell walls a hair darker, starch grains brighter
    mott = m.noise(scale=150, detail=3, roughness=0.55, vector=P)
    flesh = m.mix((0.76, 0.725, 0.61), (0.84, 0.82, 0.74), m.map_range(mott, 0.30, 0.72))
    cell = m.voronoi(scale=8500, feature='DISTANCE_TO_EDGE', vector=P)
    flesh = m.mix(flesh, (0.63, 0.59, 0.47), m.map_range(cell, 0.0, 0.10, 0.32, 0.0))
    grain = m.noise(scale=30000, detail=2, roughness=0.6, vector=P)
    flesh = m.mix(flesh, (0.90, 0.89, 0.84), m.map_range(grain, 0.60, 0.80, 0.0, 0.55))
    band = m.map_range(din, 0.22, 1.5, 1.0, 0.0, smooth=True)             # translucent cortex under the skin
    flesh = m.mix(flesh, (0.62, 0.53, 0.31), m.math('MULTIPLY', band, 0.55))
    flesh = m.mix(flesh, (0.47, 0.40, 0.26), m.math('MULTIPLY', dot, m.map_range(dotid, 0, 1, 0.30, 0.75)))
    # skin in cross-section (noisy thickness 0.15-0.4 mm) and on the outer wall (din < 0)
    thick = m.map_range(m.noise(scale=2200, detail=3, vector=P), 0.2, 0.8, 0.13, 0.38)
    is_skin = m.math('SUBTRACT', 1.0, m.map_range(din, m.math('MULTIPLY', thick, 0.55), thick, 0.0, 1.0, smooth=True))
    skin_col = m.ramp(m.noise(scale=1300, detail=4, roughness=0.6, vector=P),
                      [(0.25, (0.075, 0.040, 0.020)), (0.55, (0.22, 0.135, 0.065)), (0.85, (0.34, 0.235, 0.12))])
    col = m.mix(flesh, skin_col, is_skin)
    if dry:
        col = m.mix(col, (0.86, 0.85, 0.80), m.math('MULTIPLY', m.math('SUBTRACT', 1.0, is_skin), 0.45))
    # roughness + micro relief (cells slightly domed, starch grain)
    r_fl = m.map_range(m.noise(scale=900, detail=3, vector=P), 0.3, 0.7, 0.40, 0.60)
    rough = m.mixf(r_fl if not dry else 0.82, 0.86, is_skin)
    nrm = m.bump(cell, strength=0.45, distance=0.000010)
    nrm = m.bump(grain, strength=0.55, distance=0.000007, normal=nrm)
    kw = {}
    if not dry:
        # mucilage film: patchy, smeared along the knife strokes; tiny beads give the sparkle
        Pk = m.mapping(P, rotation=(0, 0, math.radians(KNIFE)), scale=(0.06, 1.0, 1.0))
        streak = m.noise(scale=800, detail=2, roughness=0.5, vector=Pk)
        film = m.math('MULTIPLY', m.math('MULTIPLY', wet, m.map_range(streak, 0.25, 0.75, 0.45, 1.0)),
                      m.math('SUBTRACT', 1.0, is_skin))
        bead = m.map_range(m.voronoi(scale=5200, feature='F1', vector=P), 0.0, 0.30, 1.0, 0.0, smooth=True)
        bead = m.math('MULTIPLY', bead, m.map_range(m.noise(scale=1300, detail=2, vector=P), 0.52, 0.62))
        cn = m.bump(m.noise(scale=21000, detail=2, roughness=0.6, vector=P), strength=0.35, distance=0.000005)
        cn = m.bump(bead, strength=0.9, distance=0.000022, normal=cn)
        kw = dict(coat=m.math('MULTIPLY', film, 0.85), coat_ior=1.36, coat_normal=cn,
                  coat_roughness=m.map_range(streak, 0.2, 0.8, 0.10, 0.24))
    m.set(base_color=col, roughness=rough, ior=1.45, specular=0.45, normal=nrm,
          sss=m.mixf(0.9, 0.25, is_skin), sss_radius=(1.0, 0.80, 0.52), sss_scale=0.0011, **kw)
    _MATS[key] = m
    return m


def rootlet_material():
    if 'root' in _MATS:
        return _MATS['root']
    m = C.Mat('yam_rootlet')
    P = m.coords('Object')
    n = m.noise(scale=2500, detail=3, vector=P)
    m.set(base_color=m.ramp(n, [(0.3, (0.10, 0.055, 0.028)), (0.75, (0.30, 0.20, 0.10))]), roughness=0.72,
          sss=0.25, sss_radius=(1.0, 0.5, 0.25), sss_scale=0.0002, normal=m.bump(n, 0.6, 0.00002))
    _MATS['root'] = m
    return m


# ----------------------------------------------------------------------------- loose items (pharmacy jar)
def make_items(seed=0, n=6):
    """Dried yam slices (山药片): chalk-white, matte, slightly warped, thin tan skin at the rim.
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    rng = np.random.default_rng(900 + seed)
    objs, fr, hh = [], [], []
    for i in range(n):
        r0 = rng.uniform(0.0105, 0.0155)
        ol = D.Outline(r0, lobes=[(2, rng.uniform(0.01, 0.05), rng.uniform(0, 6)), (3, rng.uniform(0.005, 0.025), rng.uniform(0, 6))],
                       rough=0.00005, rough_wl=0.0005, nubs=18, nub_h=0.00018, seed=seed * 13 + i)
        ob, r, h = D.slice_item('shanyao_item_%d' % i, ol, rng.uniform(0.0028, 0.0045), fields, face_material(dry=True),
                                seed=seed * 13 + i, warp=rng.uniform(0.01, 0.045))
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='山药')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    cam, info = C.disc_camera(R0, elevation_deg=ELEV, lens_mm=85, apex=0.535, edge=0.68)
    ol = make_outline(args.seed)
    D.hero_face('yam_face', ol, info, fields, face_material(), n_max=D.n_max_for(args), fillet=0.00010, seed=args.seed)
    D.rootlets('yam_rootlets', ol, info, rootlet_material(), n=30, th_range=(-0.85, 0.85), length=(0.003, 0.009),
               radius=(0.00006, 0.00013), depth=(0.0002, 0.0016), rise=(-0.10, 0.50), seed=args.seed + 5)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    D.lights(info, tint=(0.82, 1.0, 0.93), key=0.70, fill=0.70, rim=0.9, top=0.35, sheen=0.40)
    D.finish(args, SHOT)


if __name__ == '__main__':
    main()
