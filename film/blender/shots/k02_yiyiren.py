# -*- coding: utf-8 -*-
"""k02_yiyiren - 薏苡仁: a mound of coix kernels (Job's tears, hulled), kind = pile.

    python k02_yiyiren.py --quality preview --out /tmp/x.png
    python k02_yiyiren.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.58,0.62,0.82 --out /tmp/c.png
    python k02_yiyiren.py --quality final --out film/renders/k02_yiyiren.png

A coix kernel: 4-8 mm broad ovoid, dorsal side (+Z) round, ventral side (-Z) flatter with ONE wide
deep longitudinal groove (腹沟) whose floor keeps the pale-brown seed coat; base (-X) broader and
slightly truncated with a brown dot hilum, apex (+X) blunt; milky white / ivory, matte-satin and
a little powdery, slightly translucent; occasional yellow-brown seed-coat remnants.  Units: metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _seeds as S                                                                    # noqa: E402
C, PI = S.C, math.pi

SHOT = 'k02_yiyiren'
NAME = '薏苡仁'
R_DOME = 0.215                # 6 mm kernel -> ~80 px at the horizon of a 1920 frame
N_WHOLE, N_BROKEN = 9, 2


# ----------------------------------------------------------------------------- 1. geometry
def coix_arrays(seed, broken=False, nu=150, nv=210):
    """One coix kernel (long axis X, base at -X, groove on -Z).  Returns (verts, faces, attrs, half_sizes)."""
    rng = np.random.default_rng(6200 + seed)
    d, T, PH = S.sphere_dirs(nu, nv, pole_dense=0.15)
    dx, dy, dz = d[..., 0], d[..., 1], d[..., 2]
    L = rng.uniform(0.0050, 0.0075)
    Wd = L * rng.uniform(0.80, 0.96)
    Th = Wd * rng.uniform(0.62, 0.76)
    a, b, c = L / 2, Wd / 2, Th / 2
    off = rng.uniform(0, 50, 3)
    r = S.lumps(d, off, seed, amp=0.035, freq=1.3, fine=0.010) + S.flats(d, rng, 2, (0.015, 0.045))
    k = 1.0 - rng.uniform(0.05, 0.13) * dx                           # broader base, narrower apex
    X = a * dx * r
    xm = -a * rng.uniform(0.78, 0.90)                                # truncated base
    X = np.where(X < xm, xm + 0.22 * (X - xm), X)
    Y = b * dy * r * k
    Z = c * dz * r * k
    Z = np.where(Z < 0, Z * rng.uniform(0.62, 0.78), Z)              # flatter ventral side
    # wide deep ventral groove, widest at the base, dying out before the apex, slightly meandering
    gw = rng.uniform(0.17, 0.24) * Wd * (1.0 + 0.30 * np.clip(-X / a, -1, 1))
    yc = 0.06 * Wd * np.sin(X / a * rng.uniform(1.0, 2.2) + rng.uniform(0, 6)) + rng.normal(0, 0.03) * Wd
    win = C.smoothstep(rng.uniform(0.70, 0.88) * a, 0.35 * a, X)
    g = np.exp(-((Y - yc) / gw) ** 2) * win * C.smoothstep(0.05, -0.25, dz)
    gd = rng.uniform(0.30, 0.44) * Th
    Z = Z + gd * g
    floor = C.smoothstep(0.30, 0.75, g)
    # hilum: brown dot at the base, just ventral of the pole, slightly sunken
    h0 = S.unit([-1.0, 0.0, -0.25])
    ah = S.ang(d, h0)
    hil = np.exp(-(ah / rng.uniform(0.16, 0.22)) ** 2)
    X = X + 0.035 * a * hil
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    frac = np.zeros(len(verts))
    if broken:
        n = rng.normal(size=3) * [1.0, 0.35, 0.35]
        verts, frac = S.clip_plane(verts, n, rng.uniform(-0.1, 0.3) * a, rough=1.2e-4, freq=1400.0, seed=seed)
    verts, hs = S.finish(verts, 0.97)
    # yellow-brown seed-coat remnants: thin flakes, mostly beside the groove and at the base
    amt = rng.choice([0.0, 0.15, 0.3, 0.6], p=[0.35, 0.3, 0.2, 0.15])
    cn = S.norm01(C.fbm3(d * 3.2 + off + 40.0, 3, seed=seed + 40))
    near = np.clip(1.6 * np.exp(-((np.abs(Y - yc) - 1.5 * gw) / (1.2 * gw)) ** 2) * (dz < 0.2) * win + 0.6 * np.exp(-(ah / 0.6) ** 2), 0, 1)
    coat = C.smoothstep(0.80 - 0.30 * amt, 0.90 - 0.30 * amt, cn * (0.55 + 0.45 * near)) * (amt > 0)
    mott, rvar = S.slow_fields(d, off, seed)
    attrs = S.fl(dict(groove=floor, gsh=np.clip(g, 0, 1), hil=C.smoothstep(0.35, 0.8, hil), coat=coat, mott=mott, rvar=rvar))
    attrs['frac'] = frac
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, hs


# ----------------------------------------------------------------------------- 2. material
def coix_material():
    m = C.Mat('yiyiren', sss_method='BURLEY')
    P = m.per_instance_coords()
    t1, t2, t3 = S.inst_rand3(m)
    A = m.attr
    body = m.ramp(t1, [(0.00, (0.700, 0.690, 0.620)), (0.40, (0.670, 0.640, 0.540)),
                       (0.85, (0.630, 0.570, 0.420)), (1.00, (0.560, 0.460, 0.290))])
    # horny (slightly darker, translucent) versus chalky zones
    col = m.hsv(body, 0.5, m.map_range(A('mott'), 0, 1, 1.12, 0.90), m.map_range(A('mott'), 0, 1, 0.90, 1.05))
    spk = m.noise(scale=7000, detail=2, roughness=0.6, vector=P)
    col = m.hsv(col, 0.5, 1.0, m.map_range(spk, 0.30, 0.72, 0.94, 1.04))
    dn = m.noise(scale=4600, detail=2, roughness=0.7, vector=P)
    dust = m.math('MULTIPLY', m.map_range(dn, 0.50, 0.72), m.map_range(t2, 0, 1, 0.15, 0.90))
    col = m.mix(col, (0.790, 0.775, 0.720), m.math('MULTIPLY', dust, 0.55))
    col = m.jitter(col, hue=0.006, saturation=0.06, value=0.07)
    # shading into the groove, brown fibrous floor
    Ps = m.mapping(P, scale=(0.10, 1.0, 1.0))
    gs = m.noise(scale=1700, detail=3, roughness=0.6, vector=Ps)
    col = m.mix(col, (0.480, 0.330, 0.170), m.math('MULTIPLY', A('gsh'), 0.30))
    col = m.mix(col, m.mix((0.380, 0.215, 0.085), (0.170, 0.080, 0.030), m.map_range(gs, 0.3, 0.7)),
                m.math('MULTIPLY', A('groove'), m.map_range(t3, 0, 1, 0.70, 1.0)))
    # seed-coat remnants, hilum, chalky fracture
    cn = m.noise(scale=2400, detail=3, roughness=0.6, vector=P)
    coat = m.math('MULTIPLY', A('coat'), m.map_range(cn, 0.30, 0.55, 0.45, 1.0))
    col = m.mix(col, m.mix((0.430, 0.250, 0.085), (0.250, 0.120, 0.040), cn), m.math('MULTIPLY', coat, 0.85))
    col = m.mix(col, (0.150, 0.070, 0.030), A('hil'))
    frac = A('frac')
    col = m.mix(col, m.mix((0.720, 0.700, 0.640), (0.800, 0.790, 0.750), dn), frac)
    rough = m.map_range(A('rvar'), 0, 1, 0.40, 0.60)
    rough = m.math('ADD', rough, m.map_range(t3, 0, 1, -0.05, 0.06))
    rough = m.mixf(rough, 0.85, dust)
    rough = m.mixf(rough, 0.70, A('groove'))
    rough = m.mixf(rough, 0.92, frac)
    nrm = m.bump(gs, strength=m.mixf(0.0, 0.8, A('groove')), distance=0.00006)
    mic = m.noise(scale=6500, detail=3, roughness=0.62, vector=P)
    nrm = m.bump(mic, strength=m.mixf(0.55, 1.0, frac), distance=m.mixf(0.000016, 0.00006, frac), normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.50, specular=0.36,
          sss=m.mixf(0.62, 0.25, m.math('MAXIMUM', coat, A('groove'))), sss_radius=(1.0, 0.82, 0.60), sss_scale=0.0010,
          sheen=0.10, sheen_roughness=0.5, normal=nrm)
    return m


# ----------------------------------------------------------------------------- loose items
def make_items(seed=0):
    """7 loose coix kernels: 3 dorsal side up, 3 groove up, 1 broken."""
    mat = coix_material()
    rng = np.random.default_rng(seed)
    specs = [(False, 0.0), (False, 0.12), (False, -0.1), (False, PI), (False, PI + 0.15), (False, PI - 0.2), (True, 0.1)]
    entries = []
    for i, (br, rx) in enumerate(specs):
        v, f, attrs, _ = coix_arrays(seed + 30 + i, broken=br)
        entries.append((S.rest_pose(v, rx + rng.normal(0, 0.04), 0.0, rng.uniform(0, 2 * PI)), f, attrs))
    return S.items_dict(NAME, 'yiyiren', entries, material=mat)


# ----------------------------------------------------------------------------- build + render
def make_variants():
    mat = coix_material()
    objs, shapes = [], []
    for i in range(N_WHOLE + N_BROKEN):
        v, f, attrs, hs = coix_arrays(i, broken=(i >= N_WHOLE))
        objs.append(C.mesh_from_arrays('yy%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(hs)
    return objs, shapes, [1.0] * N_WHOLE + [0.20] * N_BROKEN


def main():
    S.run_pile(SHOT, make_variants, R_DOME,
               heap_kw=dict(layers=3.2, coverage=0.72, scale_range=(0.86, 1.10), tilt_deg=22, roll_deg=50, flip=True,
                            candidates=6, sink=0.08, rough=0.0022),
               base_color=(0.070, 0.055, 0.035), base_drop=0.0012,
               light_kw=dict(tint=(0.97, 1.0, 0.97), key=0.72, fill=0.55, rim=0.9, world=0.8, key_size=1.0))


if __name__ == '__main__':
    main()
