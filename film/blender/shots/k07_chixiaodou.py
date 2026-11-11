# -*- coding: utf-8 -*-
"""k07_chixiaodou - 赤小豆: a mound of rice beans (Vigna umbellata), kind = pile.

    python k07_chixiaodou.py --quality preview --out /tmp/x.png
    python k07_chixiaodou.py --quality draft --res 3840x2160 --spp 16 --region 0.40,0.56,0.60,0.76 --out /tmp/c.png
    python k07_chixiaodou.py --quality final --out film/renders/k07_chixiaodou.png

A rice bean: 5-8 mm long, 3-5 mm wide, oblong-cylindrical with rounded ends (slimmer than adzuki),
dark red to purplish maroon, smooth semi-gloss testa; on one side a narrow WHITE LINEAR hilum
(种脐), ~half to two-thirds of the bean length, set towards one end, a raised lip with a sunken
midline; a faint ridge on the opposite side.  A few beans are paler, browner or wrinkled.
Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _seeds as S                                                                    # noqa: E402
C, PI = S.C, math.pi

SHOT = 'k07_chixiaodou'
NAME = '赤小豆'
R_DOME = 0.245                # 7 mm bean -> ~83 px at the horizon of a 1920 frame
N_SMOOTH, N_WRINKLED = 8, 2


# ----------------------------------------------------------------------------- 1. geometry
def bean_arrays(seed, wrinkled=False, nu=180, nv=220):
    """One rice bean (long axis X, hilum on +Z).  Returns (verts, faces, attrs, half_sizes)."""
    rng = np.random.default_rng(6300 + seed)
    d, T, PH = S.sphere_dirs(nu, nv)
    dx = d[..., 0]
    sT = np.sin(T)
    L = rng.uniform(0.0056, 0.0080)
    Wd = np.clip(L * rng.uniform(0.52, 0.62), 0.0031, 0.0046)
    Th = Wd * rng.uniform(0.90, 1.0)
    a, b, c = L / 2, Wd / 2, Th / 2
    off = rng.uniform(0, 50, 3)
    r = S.lumps(d, off, seed, amp=0.022, freq=1.2, fine=0.005) + S.flats(d, rng, 2, (0.010, 0.028), x_bias=0.3)
    # oblong capsule: cylindrical mid-part, rounded (slightly unequal) ends
    ex = rng.uniform(0.74, 0.84)
    prof = sT ** (rng.uniform(0.56, 0.66) + 0.06 * dx)
    Xn = np.sign(dx) * np.abs(dx) ** ex
    cph, sph = np.cos(PH), np.sin(PH)
    wr = np.zeros_like(T)
    if wrinkled:                               # shrivelled bean: broad taut crests, narrow creases
        cyl = np.stack([Xn * a / b * 0.8, cph, sph], -1)
        qw = cyl + 0.4 * np.stack([C.fbm3(cyl * 1.2 + off, 2, seed=seed + 1), C.fbm3(cyl * 1.2 + off + 5, 2, seed=seed + 2),
                                   C.fbm3(cyl * 1.2 + off + 9, 2, seed=seed + 3)], -1)
        bl = np.abs(C.perlin3(qw * [1.1, 1.9, 1.9] + off, seed + 10)) ** 0.55
        b2 = np.abs(C.perlin3(qw * [2.4, 4.0, 4.0] + off, seed + 11)) ** 0.6
        how = 0.4 + 0.6 * C.smoothstep(-0.3, 0.3, C.fbm3(cyl * 0.8 + off + 20, 2, seed=seed + 12))
        r = r + how * (0.085 * (bl - 0.72) + 0.03 * (b2 - 0.6)) * np.clip(prof * 1.5, 0, 1)
        wr = how * (1.0 - C.smoothstep(0.0, 0.45, bl))
    # faint ridge opposite the hilum
    dphi_b = np.angle(np.exp(1j * (PH + PI / 2)))
    r = r + 0.012 * np.exp(-(dphi_b / 0.16) ** 2) * sT
    X = a * Xn * (1.0 + 0.3 * (r - 1.0))
    rho_y, rho_z = b * prof * r, c * prof * r
    # hilum on +Z: linear, towards one end; raised lip, sunken midline
    x0 = rng.uniform(-0.22, -0.05) * a
    hl = rng.uniform(0.26, 0.33) * L
    hw = rng.uniform(0.00026, 0.00034)
    u = (X - x0) / hl
    v = np.angle(np.exp(1j * (PH - PI / 2))) * 0.5 * (b + c) / hw
    rho = (np.abs(u) ** 4 + np.abs(v) ** 2.2) ** 0.5
    hil = C.smoothstep(1.0, 0.72, rho)
    rim = np.exp(-((rho - 1.05) / 0.22) ** 2)
    line = np.exp(-(v / 0.30) ** 2) * C.smoothstep(0.95, 0.75, np.abs(u))
    dh = 0.00010 * C.smoothstep(1.15, 0.55, rho) - 0.00009 * line * hil - 0.000015 * rim
    Y = (rho_y + dh) * cph
    Z = (rho_z + dh) * sph
    # hilum side nearly straight / slightly concave (gentle kidney bend)
    Z = Z - rng.uniform(0.0, 0.07) * a * (1.0 - Xn ** 2)
    Y = Y + rng.normal(0, 0.025) * a * (1.0 - Xn ** 2)
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    verts, hs = S.finish(verts, 0.975)
    mott, rvar = S.slow_fields(d, off, seed)
    attrs = S.fl(dict(hil=hil, line=line * hil, rim=rim, mott=mott, rvar=rvar, wr=wr,
                      halo=np.exp(-((rho - 1.0) / 1.6) ** 2) * (rho > 1.0)))
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, hs


# ----------------------------------------------------------------------------- 2. material
def bean_material():
    m = C.Mat('chixiaodou', sss_method='BURLEY')
    P = m.per_instance_coords()
    t1, t2, t3 = S.inst_rand3(m)
    A = m.attr
    # item-to-item: a few paler brownish-red, mostly dark red, some purplish maroon / near black-red
    body = m.ramp(t1, [(0.00, (0.300, 0.052, 0.024)), (0.10, (0.225, 0.026, 0.015)), (0.55, (0.160, 0.013, 0.011)),
                       (0.88, (0.100, 0.008, 0.013)), (1.00, (0.058, 0.006, 0.011))])
    col = m.hsv(body, 0.5, m.map_range(A('mott'), 0, 1, 1.05, 0.95), m.map_range(A('mott'), 0, 1, 0.78, 1.15))
    # micro: fine darker specks and faint paler pin-points
    spk = m.noise(scale=8500, detail=2, roughness=0.6, vector=P)
    col = m.hsv(col, 0.5, 1.0, m.map_range(spk, 0.28, 0.72, 0.80, 1.12))
    blot = m.noise(scale=900, detail=2, roughness=0.5, vector=P)
    col = m.mix(col, (0.045, 0.006, 0.010), m.math('MULTIPLY', m.map_range(blot, 0.58, 0.72), 0.45))
    col = m.mix(col, (0.050, 0.006, 0.008), m.math('MULTIPLY', A('wr'), 0.55))
    col = m.jitter(col, hue=0.008, saturation=0.08, value=0.14)
    # hilum: dark halo around a chalk-white lip, tan midline
    col = m.mix(col, (0.040, 0.006, 0.008), m.math('MULTIPLY', A('halo'), 0.35))
    col = m.mix(col, (0.050, 0.010, 0.008), m.math('MULTIPLY', A('rim'), 0.70))
    hn = m.noise(scale=6000, detail=2, vector=P)
    col = m.mix(col, m.mix((0.640, 0.590, 0.480), (0.760, 0.730, 0.650), hn), m.map_range(A('hil'), 0.15, 0.7, smooth=True))
    col = m.mix(col, (0.330, 0.230, 0.140), m.math('MULTIPLY', A('line'), 0.75))
    # roughness: semi-gloss testa broken up at two scales; hilum matte
    rn = m.noise(scale=1300, detail=3, roughness=0.6, vector=P)
    rough = m.mixf(m.map_range(A('rvar'), 0, 1, 0.20, 0.36), m.map_range(rn, 0.3, 0.7, 0.18, 0.42), 0.5)
    rough = m.math('ADD', rough, m.map_range(t3, 0, 1, -0.04, 0.10))
    rough = m.mixf(rough, 0.55, A('wr'))
    hilm = m.map_range(A('hil'), 0.15, 0.7, smooth=True)
    rough = m.mixf(rough, 0.80, hilm)
    peel = m.noise(scale=2600, detail=2, roughness=0.5, vector=P)
    nrm = m.bump(peel, strength=0.35, distance=0.000022)
    nrm = m.micro_bump(scale=10000, strength=0.35, distance=0.000010, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.50, specular=0.45,
          sss=m.mixf(0.22, 0.45, hilm), sss_radius=(1.0, 0.25, 0.12), sss_scale=0.0005,
          coat=m.mixf(0.25, 0.0, hilm), coat_roughness=0.16, normal=nrm)
    return m


# ----------------------------------------------------------------------------- loose items
def make_items(seed=0):
    """7 loose rice beans: 3 hilum up / half up, 3 lying on the side or hilum down, 1 wrinkled."""
    mat = bean_material()
    rng = np.random.default_rng(seed)
    specs = [(False, 0.0), (False, 0.6), (False, -0.8), (False, PI / 2), (False, PI), (False, -PI / 2 - 0.3), (True, 0.4)]
    entries = []
    for i, (wr, rx) in enumerate(specs):
        v, f, attrs, _ = bean_arrays(seed + 30 + i, wrinkled=wr)
        entries.append((S.rest_pose(v, rx + rng.normal(0, 0.05), 0.0, rng.uniform(0, 2 * PI)), f, attrs))
    return S.items_dict(NAME, 'chixiaodou', entries, material=mat)


# ----------------------------------------------------------------------------- build + render
def make_variants():
    mat = bean_material()
    objs, shapes = [], []
    for i in range(N_SMOOTH + N_WRINKLED):
        v, f, attrs, hs = bean_arrays(i, wrinkled=(i >= N_SMOOTH))
        objs.append(C.mesh_from_arrays('cx%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(hs)
    return objs, shapes, [1.0] * N_SMOOTH + [0.22] * N_WRINKLED


def main():
    S.run_pile(SHOT, make_variants, R_DOME,
               heap_kw=dict(layers=3.2, coverage=0.72, scale_range=(0.88, 1.10), tilt_deg=14, roll_deg=120,
                            candidates=7, sink=0.06, rough=0.0022),
               base_color=(0.030, 0.004, 0.004), base_drop=0.0012,
               light_kw=dict(tint=(1.0, 0.93, 0.86), key=0.95, fill=0.75, rim=1.15, world=1.0, key_size=1.0))


if __name__ == '__main__':
    main()
