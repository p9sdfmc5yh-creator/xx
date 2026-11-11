# -*- coding: utf-8 -*-
"""k10_jianghuang - 姜黄 (turmeric rhizome), macro across the cut face of a dried slice.  kind = disc.

    python k10_jianghuang.py --quality preview --threads 2 --out /tmp/p.png
    python k10_jianghuang.py --quality draft --res 3840x2160 --spp 24 --region 0.36,0.48,0.62,0.76 --out /tmp/c.png
    python k10_jianghuang.py --quality final --out film/renders/k10_jianghuang.png

Anatomy: thin wrinkled khaki skin with rootlet stubs -> golden-orange cortex -> distinct paler-yellow
endodermis ring at ~70 % radius -> deeper orange stele with scattered pale vascular dots, darker core.
Dense, horny, waxy lustre (角质样); hairline drying cracks; bright yellow powder dust.  Shared: _discs.py.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import _discs as D                                                                    # noqa: E402

SHOT = 'k10_jianghuang'
R0 = 0.014                # mother-rhizome slice, 28 mm across
ELEV = 25.0
KNIFE = 12.0
END = 0.70                # endodermis radius / outline radius


def make_outline(seed=0, r0=R0):
    return D.Outline(r0, lobes=[(2, 0.022, 0.5), (3, 0.012, 1.9)], wrinkle=0.00016, wrinkle_wl=0.0015,
                     rough=0.00003, rough_wl=0.0003, nubs=16, nub_h=0.00022, nub_w=0.0004, seed=seed)


# ----------------------------------------------------------------------------- 1. cut-face relief + masks
def make_fields(ol):
    def ring_r(t, seed):
        return END + 0.022 * C.fbm3(D.P3(np.sin(t) * 2.0, np.cos(t) * 2.0, 0.9), 3, seed=seed + 20)

    def fields(x, y, d, ro, th, seed=0):
        p = D.P3(x, y)
        rn = 1.0 - d / ro
        e = (rn - ring_r(th, seed)) * ro
        ring = np.exp(-(e / 0.00010) ** 2)
        stele = 1.0 - C.smoothstep(-0.00008, 0.00008, e)
        core = 1.0 - C.smoothstep(0.22, 0.60, rn)
        h = D.knife_marks(x, y, angle_deg=KNIFE, seed=seed, amp=6e-6, wl=(0.00009, 0.0003, 0.0011), weights=(0.6, 1.0, 0.8))
        h += 3.0e-5 * C.fbm3(p * 150.0, 2, seed=seed + 1)
        h += 5e-6 * C.fbm3(p * 6000.0, 2, seed=seed + 2)
        h += ring * 8e-6
        bounds = (x.min(), x.max(), y.min(), y.max())
        cand = D.scatter(bounds, 0.00030, seed + 3)
        tc = np.arctan2(cand[:, 0], cand[:, 1])
        rc = np.hypot(cand[:, 0], cand[:, 1]) / ol.r(tc)
        rrc = ring_r(tc, seed)
        u = np.random.default_rng(seed + 4).random(len(cand))
        keep = np.where(rc > rrc + 0.015, u < 0.10, np.where(rc > rrc - 0.07, u < 0.55, u < 0.28))
        keep &= (rc < 0.96) & (np.abs(rc - rrc) > 0.010)
        dot, dotid, q = D.dots(x, y, cand[keep], (0.00004, 0.00010), soft=0.3, seed=seed + 5)
        q = q * (1.0 + 0.5 * C.fbm3(p * 9000.0, 2, seed=seed + 12))
        dot = 1.0 - C.smoothstep(0.30, 1.0, q)
        h -= dot * (4e-6 + 1.0e-5 * dotid)
        crack = D.radial_cracks(x, y, n=5, seed=seed + 50, r_in=0.25, r_out=0.96, r0=ol.r0, width=0.000035, wobble=0.025, rag=0.6)
        h -= crack ** 0.7 * 0.00010
        pw = C.fbm3(p * 420.0, 3, seed=seed + 8) + 0.5 * C.fbm3(p * 2600.0, 2, seed=seed + 9)
        powder = C.smoothstep(0.08, 0.50, pw)
        powder = np.maximum(powder, 0.9 * np.exp(-(d / 0.0006) ** 2) * C.smoothstep(-0.3, 0.2, pw))
        h += powder * 7e-6
        lipn = C.fbm3(D.P3(th * ro / 0.0005, np.zeros_like(th), 3.3), 3, seed=seed + 6)
        h += np.exp(-(d / 0.00022) ** 2) * (1.0e-5 + 3.0e-5 * lipn)
        fields.powder = powder
        return h, dict(dot=dot, dotid=dotid, ring=ring, stele=stele, core=core, crack=crack, powder=powder)
    return fields


# ----------------------------------------------------------------------------- 2. materials
_MATS = {}


def face_material():
    if 'face' in _MATS:
        return _MATS['face']
    m = C.Mat('jianghuang_face', sss_method='BURLEY')
    P = m.coords('Object')
    din, dot, dotid, ring = m.attr('din'), m.attr('dot'), m.attr('dotid'), m.attr('ring')
    stele, core, crack, powder = m.attr('stele'), m.attr('core'), m.attr('crack'), m.attr('powder')
    mott = m.map_range(m.noise(scale=180, detail=2, roughness=0.55, vector=P), 0.3, 0.7)
    cortex_c = m.mix((0.56, 0.175, 0.006), (0.67, 0.245, 0.011), mott)        # golden orange
    stele_c = m.mix((0.50, 0.135, 0.004), (0.61, 0.195, 0.008), mott)        # deeper orange
    flesh = m.mix(cortex_c, stele_c, stele)
    flesh = m.mix(flesh, (0.36, 0.080, 0.003), m.math('MULTIPLY', core, 0.6))
    grain = m.noise(scale=22000, detail=2, roughness=0.6, vector=P)
    flesh = m.mix(flesh, (0.76, 0.34, 0.02), m.map_range(grain, 0.62, 0.80, 0.0, 0.45))    # resin cells
    flesh = m.mix(flesh, (0.34, 0.085, 0.004), m.map_range(grain, 0.20, 0.34, 0.4, 0.0))
    flesh = m.mix(flesh, (0.84, 0.47, 0.04), m.math('MULTIPLY', ring, 0.9))               # paler endodermis
    flesh = m.mix(flesh, (0.80, 0.42, 0.035), m.math('MULTIPLY', dot, m.map_range(dotid, 0, 1, 0.45, 0.9)))
    flesh = m.mix(flesh, (0.16, 0.04, 0.003), m.map_range(crack, 0.1, 0.7))
    pgrain = m.noise(scale=9000, detail=2, roughness=0.6, vector=P)
    pmask = m.math('MULTIPLY', powder, m.map_range(pgrain, 0.38, 0.62))
    powc = m.mix((0.72, 0.36, 0.012), (0.82, 0.48, 0.03), pgrain)
    flesh = m.mix(flesh, powc, m.math('MULTIPLY', pmask, 0.85))
    is_skin = D.skin_mask(m, P, din, thick=(0.18, 0.42), scale=1800.0)
    skin_col = m.ramp(m.noise(scale=2400, detail=3, roughness=0.7, vector=P),
                      [(0.25, (0.075, 0.042, 0.014)), (0.55, (0.22, 0.14, 0.05)), (0.82, (0.36, 0.26, 0.11))])
    col = m.mix(flesh, skin_col, is_skin)
    dull = m.math('MAXIMUM', pmask, is_skin)
    rough = m.mixf(m.map_range(m.noise(scale=1200, detail=2, vector=P), 0.3, 0.7, 0.36, 0.54), 0.88, dull)
    nrm = m.bump(m.noise(scale=6500, detail=2, roughness=0.6, vector=P), strength=0.5, distance=0.000012)
    nrm = m.bump(grain, strength=0.6, distance=m.mixf(0.000006, 0.000022, dull), normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.50, specular=0.5, normal=nrm,
          coat=m.math('MULTIPLY', m.math('SUBTRACT', 1.0, dull), 0.18), coat_roughness=0.30, coat_normal=nrm,
          sss=m.mixf(0.75, 0.15, is_skin), sss_radius=(1.0, 0.33, 0.04), sss_scale=0.0009)
    _MATS['face'] = m
    return m


def powder_material():
    if 'powder' in _MATS:
        return _MATS['powder']
    m = C.Mat('jianghuang_powder')
    m.set(base_color=m.jitter((0.78, 0.42, 0.02), hue=0.012, saturation=0.1, value=0.18), roughness=0.9,
          sss=0.3, sss_radius=(1.0, 0.4, 0.05), sss_scale=0.00004)
    _MATS['powder'] = m
    return m


def stub_material():
    if 'stub' in _MATS:
        return _MATS['stub']
    m = C.Mat('jianghuang_stub')
    n = m.noise(scale=2600, detail=3, vector=m.coords('Object'))
    m.set(base_color=m.ramp(n, [(0.3, (0.07, 0.04, 0.014)), (0.75, (0.30, 0.20, 0.08))]), roughness=0.8,
          normal=m.bump(n, 0.7, 0.00003))
    _MATS['stub'] = m
    return m


# ----------------------------------------------------------------------------- loose items (pharmacy jar)
def make_items(seed=0, n=6):
    """姜黄片: dried horny slices, round to irregular oval, 2-4 mm thick, 12-24 mm across.
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    rng = np.random.default_rng(300 + seed)
    objs, fr, hh = [], [], []
    for i in range(n):
        r0 = rng.uniform(0.006, 0.0115)
        ol = D.Outline(r0, lobes=[(2, rng.uniform(0.03, 0.14), rng.uniform(0, 6)), (3, rng.uniform(0.0, 0.05), rng.uniform(0, 6))],
                       wrinkle=0.00014, wrinkle_wl=0.0014, rough=0.00003, nubs=8, nub_h=0.0002, seed=seed * 13 + i)
        ob, r, h = D.slice_item('jianghuang_item_%d' % i, ol, rng.uniform(0.002, 0.004), make_fields(ol), face_material(),
                                seed=seed * 13 + i, warp=rng.uniform(0.008, 0.03), nr=120, nth=400, fillet=0.00012)
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='姜黄')


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    cam, info = C.disc_camera(R0, elevation_deg=ELEV, lens_mm=85, apex=0.535, edge=0.68)
    ol = make_outline(args.seed)
    fields = make_fields(ol)
    face, F = D.hero_face('jianghuang_face', ol, info, fields, face_material(), n_max=D.n_max_for(args), fillet=0.00008,
                          seed=args.seed)
    cp = D.face_points(F, 1800, seed=args.seed + 60, weight=0.03 + fields.powder ** 2, margin=0.0001)
    sz = np.random.default_rng(args.seed + 61).uniform(0.000007, 0.000026, len(cp))
    cp[:, 2] += sz * 0.35
    D.crumbs('jianghuang_powder', cp, sz, powder_material(), seed=args.seed + 62)
    D.rootlets('jianghuang_stubs', ol, info, stub_material(), n=9, th_range=(-0.85, 0.85), length=(0.0003, 0.0010),
               radius=(0.00007, 0.00014), depth=(0.0001, 0.0005), rise=(0.0, 0.5), wander=0.25, droop=0.1,
               seed=args.seed + 5, nseg=12)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=2.2)
    D.lights(info, tint=(0.92, 0.95, 1.0), key=0.62, fill=0.48, rim=0.9, top=0.15, sheen=0.22, sheen_size=0.7,
             sheen_az=-9, sheen_el=28)
    D.finish(args, SHOT)


if __name__ == '__main__':
    main()
