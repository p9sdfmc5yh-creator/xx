# -*- coding: utf-8 -*-
"""k09_gancao - 甘草 (licorice root), macro across the cut face of a dried slice.  kind = disc.

    python k09_gancao.py --quality preview --threads 2 --out /tmp/p.png
    python k09_gancao.py --quality draft --res 3840x2160 --spp 24 --region 0.36,0.48,0.62,0.76 --out /tmp/c.png
    python k09_gancao.py --quality final --out film/renders/k09_gancao.png

Anatomy: reddish-brown wrinkled cork (~0.5 mm) -> pale yellow bark (phloem) with funnel-shaped rays and
clefts -> distinct brownish cambium ring at ~74 % radius -> yellow wood: radial medullary rays (菊花心),
vessel pores in the wedges between them, radial drying fissures.  Dry, fibrous, slightly powdery.
Shared code: _discs.py.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _discs as D                                                                    # noqa: E402

SHOT = 'k09_gancao'
R0 = 0.015                # a thick root: slice 30 mm across
ELEV = 24.0
CAMB = 0.74               # cambium radius / outline radius


def make_outline(seed=0, r0=R0):
    return D.Outline(r0, lobes=[(2, 0.025, 0.4), (3, 0.012, 1.5)], wrinkle=0.00028, wrinkle_wl=0.0019,
                     rough=0.00004, rough_wl=0.0003, seed=seed)


# ----------------------------------------------------------------------------- 1. cut-face relief + masks
def make_fields(ol):
    def anat(x, y, rn, seed):
        """ray mask, wood mask, cambium mask, signed distance to the cambium for arbitrary points."""
        t = np.arctan2(x, y)
        sn, cs = np.sin(t), np.cos(t)
        w1 = np.abs(C.perlin3(np.stack([sn * 11.0, cs * 11.0, rn * 0.9 + 0.3], -1), seed + 40))
        ray1 = 1.0 - C.smoothstep(0.0, 0.10, w1)                            # primary rays, widening outwards
        w2 = np.abs(C.perlin3(np.stack([sn * 34.0, cs * 34.0, rn * 1.5 + 2.3], -1), seed + 41))
        ray2 = (1.0 - C.smoothstep(0.0, 0.16, w2)) * C.smoothstep(0.25, 0.6, rn)   # secondary rays, outer wood
        ray = np.maximum(ray1, 0.7 * ray2)
        cr = CAMB + 0.014 * C.fbm3(np.stack([sn * 3.0, cs * 3.0, np.full_like(t, 0.5)], -1), 2, seed=seed + 42)
        return ray, cr, sn, cs

    def fields(x, y, d, ro, th, seed=0):
        p = D.P3(x, y)
        rn = 1.0 - d / ro
        ray, cr, sn, cs = anat(x, y, rn, seed)
        e = (rn - cr) * ro
        camb = np.exp(-(e / 0.00008) ** 2)
        xyl = 1.0 - C.smoothstep(-0.00006, 0.00006, e)
        fib = C.fbm3(np.stack([sn * 90.0, cs * 90.0, rn * 4.0], -1), 2, seed=seed + 43)     # radial fibre streaks
        h = 1.6e-5 * fib
        h += 3.0e-5 * C.fbm3(p * 150.0, 2, seed=seed + 1)
        h += 0.8e-5 * C.fbm3(p * 5000.0, 2, seed=seed + 2)
        h -= ray * (1.8e-5 * xyl + 3.0e-5 * (1.0 - xyl))                    # soft ray parenchyma shrank on drying
        h -= 1.2e-5 * camb
        h -= 1.5e-5 * (1.0 - xyl)
        # vessels: pores in the wood wedges between the rays
        bounds = (x.min(), x.max(), y.min(), y.max())
        cand = D.scatter(bounds, 0.00021, seed + 3)
        tc = np.arctan2(cand[:, 0], cand[:, 1])
        rc = np.hypot(cand[:, 0], cand[:, 1]) / ol.r(tc)
        rayc, crc, _, _ = anat(cand[:, 0], cand[:, 1], rc, seed)
        keep = (rc < crc - 0.02) & (rayc < 0.15) & (np.random.default_rng(seed + 4).random(len(cand)) < 0.5)
        pore, pid, q = D.dots(x, y, cand[keep], (0.000018, 0.000055), soft=0.45, seed=seed + 5)
        h -= pore * (1.5e-5 + 3.0e-5 * pid)
        # radial drying fissures (real geometry)
        crack = D.radial_cracks(x, y, n=20, seed=seed + 50, r_in=0.30, r_out=0.985, r0=ol.r0, width=0.00013, wobble=0.035)
        h -= crack ** 0.8 * 0.00032
        # cork: stands a little proud and is ragged
        lipn = C.fbm3(D.P3(th * ro / 0.0006, np.zeros_like(th), 3.3), 3, seed=seed + 6)
        h += np.exp(-(d / 0.00035) ** 2) * (1.5e-5 + 4.0e-5 * lipn)
        fields.crack = crack
        return h, dict(ray=ray, camb=camb, xyl=xyl, pore=pore, crack=crack, fib=np.clip(0.5 + fib, 0, 1))
    return fields


# ----------------------------------------------------------------------------- 2. materials
_MATS = {}


def face_material():
    if 'face' in _MATS:
        return _MATS['face']
    m = C.Mat('gancao_face', sss_method='BURLEY')
    P = m.coords('Object')
    din, ray, camb, xyl = m.attr('din'), m.attr('ray'), m.attr('camb'), m.attr('xyl')
    pore, crack, fib = m.attr('pore'), m.attr('crack'), m.attr('fib')
    mott = m.map_range(m.noise(scale=200, detail=2, roughness=0.55, vector=P), 0.3, 0.7)
    wood = m.mix((0.58, 0.34, 0.030), (0.70, 0.46, 0.065), mott)             # yellow wood wedges
    wood = m.mix(wood, (0.78, 0.57, 0.13), m.map_range(fib, 0.45, 0.85, 0.0, 0.6))
    bark = m.mix((0.68, 0.49, 0.12), (0.77, 0.60, 0.21), mott)              # paler phloem
    flesh = m.mix(bark, wood, xyl)
    flesh = m.mix(flesh, (0.84, 0.70, 0.29), m.math('MULTIPLY', ray, 0.85)) # pale medullary rays
    grain = m.noise(scale=24000, detail=2, roughness=0.6, vector=P)
    flesh = m.mix(flesh, (0.90, 0.80, 0.48), m.map_range(grain, 0.62, 0.80, 0.0, 0.38))   # starch powder specks
    flesh = m.mix(flesh, (0.40, 0.24, 0.035), m.map_range(grain, 0.18, 0.32, 0.35, 0.0))
    flesh = m.mix(flesh, (0.33, 0.19, 0.05), m.math('MULTIPLY', camb, 0.9))
    flesh = m.mix(flesh, (0.17, 0.09, 0.02), pore)
    flesh = m.mix(flesh, (0.20, 0.11, 0.03), m.map_range(crack, 0.15, 0.8))
    is_skin = D.skin_mask(m, P, din, thick=(0.32, 0.75), scale=1500.0)
    cork = m.ramp(m.noise(scale=2400, detail=3, roughness=0.7, vector=P),
                  [(0.25, (0.040, 0.012, 0.007)), (0.55, (0.15, 0.045, 0.020)), (0.82, (0.27, 0.12, 0.06))])
    cork = m.mix(cork, (0.10, 0.065, 0.045), m.map_range(din, 0.0, 0.10, 0.6, 0.0))      # grey-brown outer film
    col = m.mix(flesh, cork, is_skin)
    rough = m.mixf(m.map_range(grain, 0.3, 0.7, 0.72, 0.90), 0.88, is_skin)
    nrm = m.bump(m.noise(scale=7000, detail=2, roughness=0.6, vector=P), strength=0.55, distance=0.000022)
    nrm = m.bump(grain, strength=0.6, distance=0.000010, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.45, specular=0.25, normal=nrm, sheen=m.mixf(0.10, 0.0, is_skin), sheen_roughness=0.5,
          sss=m.mixf(0.3, 0.1, is_skin), sss_radius=(1.0, 0.60, 0.20), sss_scale=0.0003)
    _MATS['face'] = m
    return m


def bits_material():
    """Loose powder crumbs and raised fibre ends (pale straw yellow)."""
    if 'bits' in _MATS:
        return _MATS['bits']
    m = C.Mat('gancao_bits')
    col = m.jitter((0.88, 0.74, 0.36), hue=0.012, saturation=0.15, value=0.12)
    m.set(base_color=col, roughness=0.8, sss=0.3, sss_radius=(1.0, 0.6, 0.2), sss_scale=0.00005)
    _MATS['bits'] = m
    return m


def fibre_material():
    if 'fibre' in _MATS:
        return _MATS['fibre']
    m = C.Mat('gancao_fibre')
    col = m.mix((0.66, 0.47, 0.13), (0.88, 0.76, 0.42), m.attr('frand'))
    m.set(base_color=col, roughness=0.6, sss=0.3, sss_radius=(1.0, 0.6, 0.2), sss_scale=0.00005)
    _MATS['fibre'] = m
    return m


# ----------------------------------------------------------------------------- loose items (pharmacy jar)
def make_items(seed=0, n=7):
    """甘草片: dried round / slightly oval slices 2-3 mm thick, 8-20 mm across, a little warped.
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    rng = np.random.default_rng(500 + seed)
    objs, fr, hh = [], [], []
    for i in range(n):
        r0 = rng.uniform(0.0045, 0.0095)
        ol = D.Outline(r0, lobes=[(2, rng.uniform(0.02, 0.10), rng.uniform(0, 6)), (3, rng.uniform(0.0, 0.03), rng.uniform(0, 6))],
                       wrinkle=0.00022, wrinkle_wl=0.0016, rough=0.00004, seed=seed * 13 + i)
        ob, r, h = D.slice_item('gancao_item_%d' % i, ol, rng.uniform(0.0018, 0.0032), make_fields(ol), face_material(),
                                seed=seed * 13 + i, warp=rng.uniform(0.01, 0.05), nr=120, nth=400, fillet=0.00012)
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='甘草')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    cam, info = C.disc_camera(R0, elevation_deg=ELEV, lens_mm=85, apex=0.535, edge=0.68)
    ol = make_outline(args.seed)
    fields = make_fields(ol)
    face, F = D.hero_face('gancao_face', ol, info, fields, face_material(), n_max=D.n_max_for(args), fillet=0.00010,
                          seed=args.seed)
    # powder crumbs (more of them along the fissures) and raised fibre ends
    w = 0.10 + 4.0 * (fields.crack > 0.05)
    cp = D.face_points(F, 1100, seed=args.seed + 60, weight=w, margin=0.0002)
    sz = np.random.default_rng(args.seed + 61).uniform(0.000008, 0.000030, len(cp))
    cp[:, 2] += sz * 0.35
    D.crumbs('gancao_crumbs', cp, sz, bits_material(), seed=args.seed + 62)
    fp = D.face_points(F, 240, seed=args.seed + 63, margin=0.0004)
    fp[:, 2] -= 4e-6
    D.fibres('gancao_fibres', fp, fibre_material(), length=(0.00008, 0.00040), radius=(0.000007, 0.000013),
             lean=0.9, curl=0.7, seed=args.seed + 64)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=2.2)
    D.lights(info, tint=(1.0, 0.90, 0.86), key=0.58, fill=0.50, rim=0.9, top=0.2, key_az=-48, key_el=30, sheen=0.0)
    D.finish(args, SHOT)


if __name__ == '__main__':
    main()
