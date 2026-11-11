# -*- coding: utf-8 -*-
"""k12_juemingzi - 决明子: a mound of cassia seeds (Senna obtusifolia), kind = pile.

    python k12_juemingzi.py --quality preview --out /tmp/x.png
    python k12_juemingzi.py --quality draft --res 3840x2160 --spp 16 --region 0.40,0.56,0.60,0.76 --out /tmp/c.png
    python k12_juemingzi.py --quality final --out film/renders/k12_juemingzi.png

A cassia seed: 3-7 mm x 2-4 mm short rhomboid rod (菱方形), the two ends cut obliquely and parallel
(one end flat-ish, the other drawn into an oblique point); greenish-brown / olive to coffee brown,
smooth, hard and glossy; a raised ridge line along the back and the belly (+-Z) and, on each side
face, a paler narrow sunken line running obliquely.  Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _seeds as S                                                                    # noqa: E402
C, PI = S.C, math.pi

SHOT = 'k12_juemingzi'
NAME = '决明子'
R_DOME = 0.19                 # 5 mm seed -> ~76 px at the horizon of a 1920 frame
N_VARIANTS = 10


# ----------------------------------------------------------------------------- 1. geometry
def cassia_arrays(seed, nu=170, nv=168):
    """One cassia seed (long axis X, ridges on +-Z, pale lines on the +-Y faces)."""
    rng = np.random.default_rng(6500 + seed)
    p_r, p_x = rng.uniform(0.26, 0.36), rng.uniform(0.55, 0.68)
    d, T, PH = S.sphere_dirs(nu, nv, t=S.profile_t(nu, lambda t: -1.8 * np.sign(np.cos(t)) * np.abs(np.cos(t)) ** p_x,
                                                   lambda t: np.sin(t) ** p_r))
    dx = d[..., 0]
    sT = np.sin(T)
    L = rng.uniform(0.0036, 0.0056)
    Wd = rng.uniform(0.0023, 0.0031)
    Th = Wd * rng.uniform(0.82, 0.98)
    a, b, c = L / 2, Wd / 2, Th / 2
    off = rng.uniform(0, 50, 3)
    r = S.lumps(d, off, seed, amp=0.022, freq=1.3, fine=0.006) + S.flats(d, rng, 2, (0.010, 0.03), x_bias=0.3)
    prof = sT ** p_r                              # boxy rod with rounded end edges
    Xn = np.sign(dx) * np.abs(dx) ** p_x
    n_se = rng.uniform(1.45, 1.80)                                    # rhombic-round cross-section
    cph, sph = np.cos(PH), np.sin(PH)
    cy = np.sign(cph) * np.abs(cph) ** (2.0 / n_se)
    cz = np.sign(sph) * np.abs(sph) ** (2.0 / n_se)
    # raised ridge lines along back and belly
    dz_top = np.angle(np.exp(1j * (PH - PI / 2)))
    dz_bot = np.angle(np.exp(1j * (PH + PI / 2)))
    ridge = np.exp(-(dz_top / 0.12) ** 2) + np.exp(-(dz_bot / 0.12) ** 2)
    r = r + rng.uniform(0.035, 0.060) * ridge * prof
    # pale sunken oblique lines on the two side faces (obliquely symmetric)
    sl = rng.uniform(0.35, 0.60) * rng.choice([-1, 1])
    w_l = rng.uniform(0.085, 0.12)
    l1 = np.exp(-(np.angle(np.exp(1j * (PH - sl * Xn))) / w_l) ** 2)
    l2 = np.exp(-(np.angle(np.exp(1j * (PH - PI + sl * Xn))) / w_l) ** 2)
    line = (l1 + l2) * C.smoothstep(0.86, 0.60, np.abs(Xn))
    r = r - 0.030 * line
    X = a * Xn
    Y = b * prof * cy * r
    Z = c * prof * cz * r
    # obliquely truncated, parallel ends; one end drawn out into a point
    sh = rng.uniform(0.45, 0.85) * rng.choice([-1, 1])
    X = X + sh * Z
    tip = rng.uniform(0.10, 0.22) * a
    X = X + tip * C.smoothstep(0.35, 1.0, Xn) * np.clip(np.sign(sh) * Z / c, 0, 1) ** 1.5
    Y = Y + rng.normal(0, 0.03) * a * (1 - Xn ** 2)
    Z = Z + rng.normal(0, 0.03) * a * (1 - Xn ** 2)
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    verts, hs = S.finish(verts, 0.96)
    hs = (hs[0] * 0.90, hs[1], hs[2])                                 # the sheared corners overhang the proxy
    mott, rvar = S.slow_fields(d, off, seed)
    attrs = S.fl(dict(ridge=np.clip(ridge * prof, 0, 1), line=np.clip(line, 0, 1), mott=mott, rvar=rvar,
                      ends=C.smoothstep(0.80, 0.98, np.abs(dx))))
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, hs


# ----------------------------------------------------------------------------- 2. material
def cassia_material():
    m = C.Mat('juemingzi', sss_method='BURLEY')
    P = m.per_instance_coords()
    t1, t2, t3 = S.inst_rand3(m)
    A = m.attr
    # item-to-item: yellowish green-brown ... olive brown ... coffee ... near black-brown
    body = m.ramp(t1, [(0.00, (0.230, 0.150, 0.045)), (0.15, (0.150, 0.100, 0.030)), (0.45, (0.105, 0.064, 0.020)),
                       (0.75, (0.075, 0.038, 0.014)), (0.92, (0.046, 0.023, 0.010)), (1.00, (0.028, 0.014, 0.007))])
    col = m.hsv(body, m.map_range(t2, 0, 1, 0.480, 0.512), m.map_range(A('mott'), 0, 1, 1.06, 0.94),
                m.map_range(A('mott'), 0, 1, 0.72, 1.22))
    spk = m.noise(scale=7500, detail=2, roughness=0.6, vector=P)
    col = m.hsv(col, 0.5, 1.0, m.map_range(spk, 0.28, 0.72, 0.84, 1.10))
    blot = m.noise(scale=800, detail=2, roughness=0.5, vector=P)
    col = m.mix(col, (0.028, 0.016, 0.008), m.math('MULTIPLY', m.map_range(blot, 0.56, 0.72), 0.40))
    # ridge a little paler (worn), pale yellow-brown sunken lines, darker truncated ends
    col = m.mix(col, (0.250, 0.180, 0.060), m.math('MULTIPLY', A('ridge'), 0.22))
    ln = m.map_range(A('line'), 0.30, 0.80, smooth=True)
    col = m.mix(col, m.mix((0.330, 0.240, 0.090), (0.230, 0.150, 0.050), spk), m.math('MULTIPLY', ln, 0.92))
    col = m.jitter(col, hue=0.012, saturation=0.10, value=0.16)
    # hard glossy testa, gloss broken up at two scales; lines dull
    rn = m.noise(scale=1100, detail=3, roughness=0.6, vector=P)
    rough = m.mixf(m.map_range(A('rvar'), 0, 1, 0.17, 0.34), m.map_range(rn, 0.3, 0.7, 0.14, 0.40), 0.5)
    rough = m.math('ADD', rough, m.map_range(t3, 0, 1, -0.03, 0.12))
    rough = m.mixf(rough, 0.55, ln)
    peel = m.noise(scale=2400, detail=2, roughness=0.5, vector=P)
    nrm = m.bump(peel, strength=0.45, distance=0.000026)
    nrm = m.micro_bump(scale=11000, strength=0.3, distance=0.000007, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.52, specular=0.50,
          sss=0.10, sss_radius=(1.0, 0.5, 0.2), sss_scale=0.0003,
          coat=m.mixf(0.30, 0.0, ln), coat_roughness=0.13, normal=nrm)
    return m


# ----------------------------------------------------------------------------- loose items
def make_items(seed=0):
    """8 loose cassia seeds resting on one of their four faces."""
    mat = cassia_material()
    rng = np.random.default_rng(seed)
    entries = []
    for i, rx in enumerate([PI / 4, -PI / 4, 3 * PI / 4, -3 * PI / 4, PI / 4, -PI / 4, 3 * PI / 4, PI / 2]):
        v, f, attrs, _ = cassia_arrays(seed + 30 + i)
        entries.append((S.rest_pose(v, rx + rng.normal(0, 0.06), 0.0, rng.uniform(0, 2 * PI)), f, attrs))
    return S.items_dict(NAME, 'juemingzi', entries, material=mat)


# ----------------------------------------------------------------------------- build + render
def make_variants():
    mat = cassia_material()
    objs, shapes = [], []
    for i in range(N_VARIANTS):
        v, f, attrs, hs = cassia_arrays(i)
        objs.append(C.mesh_from_arrays('jm%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(hs)
    return objs, shapes, None


def main():
    S.run_pile(SHOT, make_variants, R_DOME,
               heap_kw=dict(layers=3.3, coverage=0.72, scale_range=(0.82, 1.12), tilt_deg=16, roll_deg=120,
                            candidates=7, sink=0.08, rough=0.0016),
               base_color=(0.018, 0.011, 0.005), base_drop=0.0008, exposure=0.15,
               light_kw=dict(tint=(0.98, 1.0, 0.93), key=1.0, fill=0.85, rim=1.2, world=1.1, key_size=1.2))


if __name__ == '__main__':
    main()
