# -*- coding: utf-8 -*-
"""k01_fuling - 茯苓 (poria sclerotium), macro across the cut face.  kind = disc.

    python k01_fuling.py --quality preview --threads 2 --out /tmp/p.png
    python k01_fuling.py --quality draft --res 3840x2160 --spp 24 --region 0.36,0.48,0.62,0.76 --out /tmp/c.png
    python k01_fuling.py --quality final --out film/renders/k01_fuling.png

Chalk-white, dry, matte, powdery flesh with faint pinkish-brown marbling veins, hairline cracks, tiny pits
and broad knife facets; a reddish-brown zone under the thick (1-3 mm) black-brown wrinkled bark (茯苓皮)
that forms the horizon; loose white powder.  Shared code: _discs.py.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _discs as D                                                                    # noqa: E402

SHOT = 'k01_fuling'
R0 = 0.040                # cut through a small sclerotium, 80 mm across
ELEV = 25.0
KNIFE = 6.0


def make_outline(seed=0, r0=R0):
    return D.Outline(r0, lobes=[(2, 0.025, 0.7), (3, 0.016, 2.4), (5, 0.008, 0.4)], wrinkle=0.00060, wrinkle_wl=0.0036,
                     rough=0.00010, rough_wl=0.0006, seed=seed)


# ----------------------------------------------------------------------------- 1. cut-face relief + masks
def flesh_masks(x, y, z, seed):
    """Marbling veins (sharp + soft halo), hairline cracks, powder: shared by the hero face and the blocks."""
    p = np.stack([x, y, z], -1)
    w0 = 0.004 * C.fbm3(p * 60.0 + 3.1, 2, seed=seed + 78)
    w1 = 0.004 * C.fbm3(p * 60.0 + 7.7, 2, seed=seed + 79)
    v1 = np.abs(C.perlin3(np.stack([x + w0, y + w1, z], -1) * 150.0, seed + 80))
    vmask = C.smoothstep(-0.10, 0.25, C.fbm3(p * 45.0, 2, seed=seed + 81))
    vein = (1.0 - C.smoothstep(0.0, 0.05, v1)) * vmask
    veinsoft = (1.0 - C.smoothstep(0.0, 0.24, v1)) * vmask
    v2 = np.abs(C.perlin3(np.stack([x + 2 * w0, y - w1, z], -1) * 85.0 + 9.0, seed + 82))
    cmask = C.smoothstep(0.16, 0.38, C.fbm3(p * 38.0 + 5.0, 2, seed=seed + 83))
    crack = (1.0 - C.smoothstep(0.0, 0.007, v2)) * cmask
    powder = C.smoothstep(0.0, 0.45, C.fbm3(p * 300.0, 3, seed=seed + 8))
    return vein, veinsoft, crack, powder


def fields(x, y, d, ro, th, seed=0):
    p = D.P3(x, y)
    vein, veinsoft, crack, powder = flesh_masks(x, y, np.zeros_like(x), seed)
    h = D.facets(x, y, seed=seed + 70, n=4, tilt=0.010)
    h += D.knife_marks(x, y, angle_deg=KNIFE, seed=seed, amp=1.3e-5, wl=(0.0002, 0.0007, 0.0025))
    h += 4.0e-5 * C.fbm3(p * 90.0, 2, seed=seed + 1) + 1.6e-5 * C.fbm3(p * 2500.0, 3, seed=seed + 2)
    h -= crack * 8e-5
    h -= vein * 6e-6
    bounds = (x.min(), x.max(), y.min(), y.max())
    pts = D.scatter(bounds, 0.0021, seed + 3, density=lambda a, b: 0.5)
    pit, pid, q = D.dots(x, y, pts, (0.00006, 0.00022), soft=0.3, seed=seed + 5)
    q = q * (1.0 + 0.5 * C.fbm3(p * 5000.0, 2, seed=seed + 12))
    pit = 1.0 - C.smoothstep(0.30, 1.0, q)
    h -= pit * (3e-5 + 9e-5 * pid)
    # bark: 1-3 mm thick, rough broken cross-section standing a little proud; groove at the junction
    bt = 0.0010 + 0.0019 * C.smoothstep(-0.3, 0.4, C.fbm3(D.P3(np.sin(th) * 4.0, np.cos(th) * 4.0, 0.3), 2, seed=seed + 30))
    bt = bt * (1.0 + 0.25 * C.fbm3(p * 900.0, 2, seed=seed + 31))
    bark = 1.0 - C.smoothstep(0.80, 1.0, d / bt)
    h += bark * (2.5e-5 + 7e-5 * C.fbm3(p * 1800.0, 3, seed=seed + 32))
    h -= 3.5e-5 * np.exp(-((d - bt) / 0.0003) ** 2)
    redz = np.exp(-np.maximum(d - bt, 0.0) / 0.0022) * (1.0 - bark)
    fields.powder = powder
    return h, dict(vein=vein, veinsoft=veinsoft, crack=crack, pit=pit, bark=bark, redz=redz, powder=powder)


# ----------------------------------------------------------------------------- 2. materials
_MATS = {}


def face_material():
    if 'face' in _MATS:
        return _MATS['face']
    m = C.Mat('fuling_face', sss_method='BURLEY')
    P = m.coords('Object')
    vein, veinsoft, crack, pit = m.attr('vein'), m.attr('veinsoft'), m.attr('crack'), m.attr('pit')
    bark, redz, powder = m.attr('bark'), m.attr('redz'), m.attr('powder')
    mott = m.map_range(m.noise(scale=120, detail=2, roughness=0.55, vector=P), 0.3, 0.7)
    white = m.mix((0.74, 0.69, 0.63), (0.82, 0.79, 0.75), mott)             # chalk white, faintly warm
    white = m.mix(white, (0.76, 0.63, 0.57), m.map_range(m.noise(scale=55, detail=2, vector=P), 0.5, 0.78, 0.0, 0.45))
    grain = m.noise(scale=16000, detail=2, roughness=0.6, vector=P)
    white = m.mix(white, (0.90, 0.89, 0.86), m.map_range(grain, 0.60, 0.80, 0.0, 0.6))
    white = m.mix(white, (0.58, 0.52, 0.46), m.map_range(grain, 0.20, 0.34, 0.38, 0.0))
    white = m.mix(white, (0.66, 0.50, 0.40), m.math('MULTIPLY', veinsoft, 0.28))
    white = m.mix(white, (0.50, 0.31, 0.22), m.math('MULTIPLY', vein, 0.55))
    white = m.mix(white, (0.58, 0.31, 0.20), m.math('MULTIPLY', redz, 0.6))                # 赤茯苓 zone
    white = m.mix(white, (0.92, 0.91, 0.89), m.math('MULTIPLY', powder, m.map_range(m.noise(scale=7000, detail=2, vector=P), 0.4, 0.65, 0.0, 0.6)))
    white = m.mix(white, (0.22, 0.15, 0.11), m.map_range(crack, 0.1, 0.7))
    white = m.mix(white, (0.40, 0.33, 0.28), m.math('MULTIPLY', pit, 0.5))
    barkc = m.ramp(m.noise(scale=900, detail=4, roughness=0.7, vector=P),
                   [(0.25, (0.010, 0.006, 0.0035)), (0.55, (0.045, 0.025, 0.013)), (0.80, (0.12, 0.068, 0.036))])
    col = m.mix(white, barkc, bark)
    nrm = m.bump(m.noise(scale=5000, detail=3, roughness=0.65, vector=P), strength=0.8, distance=0.000045)
    nrm = m.bump(grain, strength=0.7, distance=0.000022, normal=nrm)
    m.set(base_color=col, roughness=m.mixf(0.90, 0.80, bark), ior=1.45, specular=0.2, normal=nrm,
          sheen=m.mixf(0.12, 0.0, bark), sheen_roughness=0.5,
          sss=m.mixf(0.40, 0.05, bark), sss_radius=(1.0, 0.75, 0.60), sss_scale=0.0006)
    _MATS['face'] = m
    return m


def bits_material(dark=False):
    key = 'dark' if dark else 'white'
    if key in _MATS:
        return _MATS[key]
    m = C.Mat('fuling_bits_' + key)
    base = (0.05, 0.028, 0.015) if dark else (0.86, 0.84, 0.80)
    m.set(base_color=m.jitter(base, hue=0.01, saturation=0.1, value=0.2), roughness=0.9,
          sss=0.0 if dark else 0.3, sss_radius=(1.0, 0.8, 0.6), sss_scale=0.00005)
    _MATS[key] = m
    return m


# ----------------------------------------------------------------------------- loose items (pharmacy jar)
def _block(name, seed, size):
    """茯苓块 / 茯苓片: a knife-cut white block (rounded box, chipped corners), no bark."""
    rng = np.random.default_rng(seed)
    a, b, c = size
    v, f, _, _ = C.superellipsoid(a, b, c, nu=110, nv=140, e_long=0.22, e_round=0.22)
    n = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
    v = v * (1.0 + 0.035 * C.fbm3(n * 1.6 + seed, 3, seed=seed))[:, None]
    v = v + n * (0.00006 * C.fbm3(v * 2500.0, 3, seed=seed + 1))[:, None]
    chip = C.smoothstep(0.25, 0.6, C.fbm3(v * 220.0 + 4.0, 2, seed=seed + 2))
    v = v - n * (chip * 0.0004)[:, None]
    vein, veinsoft, crack, powder = flesh_masks(v[:, 0] + seed, v[:, 1], v[:, 2], seed)
    z0 = v[:, 2].min()
    v[:, 2] -= z0
    zero = np.zeros(len(v))
    attrs = dict(vein=vein, veinsoft=veinsoft, crack=crack * 0.6, pit=zero, bark=zero, redz=zero, powder=powder,
                 din=zero + 5.0, rn=zero + 0.5)
    ob = C.mesh_from_arrays(name, v, f, attrs=attrs, material=face_material())
    return ob, float(max(a, b)), float(v[:, 2].max() * 0.5)


def make_items(seed=0, n=6):
    """White poria blocks and thick slabs (茯苓块 / 茯苓片) as dispensed.
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    rng = np.random.default_rng(100 + seed)
    objs, fr, hh = [], [], []
    for i in range(n):
        if i % 2 == 0:
            s = rng.uniform(0.0055, 0.008)
            size = (s * rng.uniform(0.9, 1.15), s * rng.uniform(0.85, 1.05), s * rng.uniform(0.75, 1.0))
        else:
            s = rng.uniform(0.010, 0.016)
            size = (s, s * rng.uniform(0.6, 0.9), rng.uniform(0.002, 0.0035))
        ob, r, h = _block('fuling_item_%d' % i, seed * 13 + i, size)
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='茯苓')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    cam, info = C.disc_camera(R0, elevation_deg=ELEV, lens_mm=85, apex=0.54, edge=0.68)
    ol = make_outline(args.seed)
    face, F = D.hero_face('fuling_face', ol, info, fields, face_material(), n_max=D.n_max_for(args), fillet=0.00030,
                          seed=args.seed, wall_depth=0.008)
    rng = np.random.default_rng(args.seed + 61)
    cp = D.face_points(F, 2600, seed=args.seed + 60, weight=0.05 + fields.powder ** 2, margin=0.003)
    sz = rng.uniform(0.000015, 0.000055, len(cp))
    cp[:, 2] += sz * 0.35
    D.crumbs('fuling_powder', cp, sz, bits_material(False), seed=args.seed + 62)
    near_rim = (F['d'] > 0.0) & (F['d'] < 0.006)
    bp = D.face_points(F, 260, seed=args.seed + 65, weight=near_rim * np.exp(-F['d'] / 0.002), margin=0.0)
    bs = rng.uniform(0.00003, 0.00013, len(bp))
    bp[:, 2] += bs * 0.35
    D.crumbs('fuling_barkbits', bp, bs, bits_material(True), seed=args.seed + 66)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=2.2)
    D.lights(info, tint=(0.95, 0.97, 1.0), key=0.55, fill=0.50, rim=0.9, top=0.2, key_az=-52, key_el=28, sheen=0.0)
    D.finish(args, SHOT)


if __name__ == '__main__':
    main()
