# -*- coding: utf-8 -*-
"""m06_lianzi - 莲子: a mound of dried white lotus seeds (去芯白莲), kind = pile.

    python m06_lianzi.py --quality preview --out /tmp/x.png
    python m06_lianzi.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.58,0.62,0.82 --out /tmp/c.png
    python m06_lianzi.py --quality final --out film/renders/m06_lianzi.png

A dried, skinned and de-cored lotus seed: 12-16 mm short oval, ivory / cream, matte and finely
powdery with faint longitudinal striations; apex (+X) = small red-brown nipple inside a darker ring,
base (-X) = the round hole the green plumule was pushed out through; a faint seam between the two
cotyledons; some seeds keep patches of thin red-brown seed coat, some are split halves showing the
flat inner face with the plumule groove.  Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _seeds as S                                                                    # noqa: E402
C, PI = S.C, math.pi

SHOT = 'm06_lianzi'
NAME = '莲子'
R_DOME = 0.32                 # 14 mm seed -> ~125 px at the horizon of a 1920 frame
N_WHOLE, N_HALF = 8, 3


# ----------------------------------------------------------------------------- 1. geometry
def lotus_arrays(seed, half=False, nu=200, nv=300):
    """One lotus seed (long axis X, base hole at -X, nipple at +X; split plane z = 0 for halves).
    Returns (verts, faces, attrs, half_sizes)."""
    rng = np.random.default_rng(6100 + seed)
    d, T, PH = S.sphere_dirs(nu, nv, pole_dense=0.45)
    dx, dy, dz = d[..., 0], d[..., 1], d[..., 2]
    sT = np.sin(T)
    L = rng.uniform(0.0125, 0.0160)
    Wd = L * rng.uniform(0.76, 0.90)
    Th = Wd * rng.uniform(0.93, 1.0)
    a, b, c = L / 2, Wd / 2, Th / 2
    off = rng.uniform(0, 50, 3)
    r = S.lumps(d, off, seed, amp=0.030, freq=1.2, fine=0.007) + S.flats(d, rng, 2, (0.012, 0.03))
    # shallow longitudinal shrink furrows, branching, fading towards the poles
    cyl = np.stack([dx * 0.55, np.cos(PH), np.sin(PH)], -1)
    warp = 0.35 * np.stack([C.fbm3(cyl * 1.3 + off + 5.0, 2, seed=seed + 1), C.fbm3(cyl * 1.3 + off + 9.0, 2, seed=seed + 2),
                            C.fbm3(cyl * 1.3 + off + 2.0, 2, seed=seed + 3)], -1)
    q = cyl + warp
    b1 = np.abs(C.perlin3(q * [1.0, 2.6, 2.6] + off, seed + 10))
    b2 = np.abs(C.perlin3(q * [2.0, 6.5, 6.5] + off + 4.0, seed + 11))
    how = 0.35 + 0.65 * C.smoothstep(-0.3, 0.4, C.fbm3(d * 0.9 + off + 21.0, 2, seed=seed + 15))
    fur1 = 1.0 - C.smoothstep(0.0, 0.30, b1)
    fur2 = 1.0 - C.smoothstep(0.0, 0.35, b2)
    env = sT ** 1.5
    r = r - rng.uniform(0.012, 0.024) * how * fur1 * env - 0.006 * how * fur2 * env
    # apex nipple inside a shallow ring groove
    tA = PI - T
    wob = 1.0 + 0.18 * C.perlin3(np.stack([np.cos(PH) * 1.5, np.sin(PH) * 1.5, np.zeros_like(PH)], -1) + off, seed + 30)
    nip_r = rng.uniform(0.085, 0.12) * wob
    nip = np.exp(-(tA / nip_r) ** 2)
    ring = np.exp(-((tA - 2.3 * nip_r) / (0.9 * nip_r)) ** 2)
    r = r + rng.uniform(0.030, 0.050) * nip - 0.016 * ring
    # base hole (plumule pushed out): a pit with an irregular, slightly raised rim
    T0 = rng.uniform(0.0010, 0.0014) / b * (1.0 + 0.16 * C.perlin3(
        np.stack([np.cos(PH) * 1.2, np.sin(PH) * 1.2, np.ones_like(PH)], -1) + off, seed + 31))
    pit = C.smoothstep(T0, 0.45 * T0, T)
    r = r * (1.0 - rng.uniform(0.25, 0.38) * pit) + 0.012 * np.exp(-((T - 1.3 * T0) / (0.45 * T0)) ** 2)
    hole = C.smoothstep(1.08 * T0, 0.80 * T0, T)
    # cotyledon seam (plane z = 0), deepest near the base hole
    seam = np.exp(-(dz / 0.022) ** 2) * (0.35 + 0.65 * C.smoothstep(1.6, 0.3, T)) * C.smoothstep(0.12, 0.3, tA)
    r = r - 0.010 * seam
    # thin red-brown seed-coat remnants (amount varies a lot from seed to seed)
    amt = {2: 0.35, 5: 1.0, 7: 0.15}.get(seed % 100, 0.0)                 # most seeds are fully skinned
    sk = S.norm01(C.fbm3(q * [0.9, 1.6, 1.6] + off + 40.0, 3, seed=seed + 40)) + 0.35 * np.exp(-(tA / 0.7) ** 2)
    th = 1.22 - 0.50 * amt
    skin = C.smoothstep(th, th + 0.10, sk) * (amt > 0)
    r = r + 0.0045 * skin
    ee = 0.93
    X = a * np.sign(dx) * np.abs(dx) ** ee * r
    Y, Z = b * dy * r, c * dz * r
    inner = np.zeros_like(X)
    groove = np.zeros_like(X)
    if half:                                   # one cotyledon: flat inner face with the plumule groove
        inner = C.smoothstep(0.03, -0.03, dz)
        gw = rng.uniform(0.0014, 0.0019)
        gd = rng.uniform(0.0011, 0.0017)
        g = np.exp(-(Y / gw) ** 2) * C.smoothstep(0.72 * a, 0.42 * a, X)
        face = gd * g + 0.00006 * C.fbm3(np.stack([X, Y, 0 * X], -1) * 900.0 + off, 3, seed=seed + 50) \
            + 0.00025 * C.smoothstep(0.75, 1.0, np.hypot(X / a, Y / b))        # rim slightly rounded
        Z = np.where(dz < 0, face * (1.0 - 0.0 * Z), Z)
        groove = g * inner
        hole = hole * (1.0 - inner)
        seam = seam * 0.0
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    verts, hs = S.finish(verts, 0.975)
    mott, rvar = S.slow_fields(d, off, seed)
    attrs = S.fl(dict(hole=hole, nip=np.exp(-(tA / (1.15 * nip_r)) ** 2), ring=ring, skin=skin, seam=seam,
                      inner=inner, groove=groove, mott=mott, rvar=rvar, fur=np.clip(how * (fur1 + 0.5 * fur2) * env, 0, 1)))
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, hs


# ----------------------------------------------------------------------------- 2. material
def lotus_material():
    m = C.Mat('lianzi', sss_method='BURLEY')
    P = m.per_instance_coords()
    t1, t2, t3 = S.inst_rand3(m)
    A = m.attr
    # item-to-item: ivory ... cream ... a few yellowed ones
    body = m.ramp(t1, [(0.00, (0.700, 0.640, 0.500)), (0.30, (0.660, 0.580, 0.410)),
                       (0.80, (0.620, 0.520, 0.330)), (1.00, (0.540, 0.410, 0.220))])
    col = m.hsv(body, 0.5, m.map_range(A('mott'), 0, 1, 1.10, 0.92), m.map_range(A('mott'), 0, 1, 0.90, 1.05))
    # faint longitudinal striations (noise stretched along the seed axis) + furrow floors a touch darker
    Ps = m.mapping(P, scale=(0.06, 1.0, 1.0))
    stri = m.noise(scale=1500, detail=3, roughness=0.6, vector=Ps)
    col = m.hsv(col, 0.5, m.map_range(stri, 0.30, 0.70, 1.16, 0.94), m.map_range(stri, 0.30, 0.70, 0.86, 1.05))
    col = m.mix(col, (0.400, 0.270, 0.130), m.math('MULTIPLY', A('fur'), 0.30))
    # powdery bloom: chalky paler patches
    dn = m.noise(scale=4200, detail=2, roughness=0.7, vector=P)
    dust = m.math('MULTIPLY', m.map_range(dn, 0.50, 0.72), m.map_range(t2, 0, 1, 0.15, 0.85))
    col = m.mix(col, (0.780, 0.750, 0.660), m.math('MULTIPLY', dust, 0.55))
    # a few shallow cracks (only where a slow mask allows)
    Pw = m.mix(P, m.noise(scale=180, detail=2, vector=P, color=True), 0.004, blend='ADD')
    ce = m.voronoi(scale=230, feature='DISTANCE_TO_EDGE', vector=Pw)
    cmask = m.map_range(m.noise(scale=95, detail=1, vector=P), 0.63, 0.70)
    crack = m.math('MULTIPLY', m.map_range(ce, 0.0, 0.022, 1.0, 0.0), cmask)
    col = m.mix(col, (0.230, 0.140, 0.060), m.math('MULTIPLY', crack, 0.55))
    col = m.mix(col, (0.330, 0.220, 0.110), m.math('MULTIPLY', A('seam'), 0.55))
    # split halves: smooth, slightly yellower inner face, groove floor darker
    col = m.mix(col, m.hsv(body, 0.5, 1.12, 1.02), m.math('MULTIPLY', A('inner'), 0.75))
    col = m.mix(col, (0.420, 0.300, 0.150), m.math('MULTIPLY', A('groove'), 0.45))
    col = m.jitter(col, hue=0.006, saturation=0.06, value=0.07)
    # red-brown seed-coat remnants, dark ring + nipple at the apex, dark hole at the base
    sn = m.noise(scale=2600, detail=3, roughness=0.6, vector=Ps)
    skin = m.math('MULTIPLY', A('skin'), m.map_range(sn, 0.30, 0.55, 0.55, 1.0))
    col = m.mix(col, m.mix((0.240, 0.070, 0.032), (0.110, 0.030, 0.018), sn), skin)
    col = m.mix(col, (0.150, 0.060, 0.030), m.math('MULTIPLY', A('ring'), 0.75))
    col = m.mix(col, (0.170, 0.050, 0.026), m.map_range(A('nip'), 0.25, 0.75, smooth=True))
    col = m.mix(col, (0.030, 0.016, 0.008), A('hole'))
    # roughness: powdery matte, skin remnants smoother
    rough = m.map_range(A('rvar'), 0, 1, 0.58, 0.80)
    rough = m.mixf(rough, 0.90, dust)
    rough = m.mixf(rough, 0.42, skin)
    nrm = m.bump(stri, strength=0.55, distance=0.00007)
    nrm = m.bump(crack, strength=0.8, distance=0.00012, normal=nrm, invert=True)
    nrm = m.micro_bump(scale=7000, strength=0.45, distance=0.00003, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.50, specular=0.30,
          sss=m.mixf(0.50, 0.15, skin), sss_radius=(1.0, 0.70, 0.42), sss_scale=0.0013,
          sheen=0.20, sheen_roughness=0.5, normal=nrm)
    return m


# ----------------------------------------------------------------------------- loose items
def make_items(seed=0):
    """6 loose lotus seeds: 4 whole (lying on their side, one showing the hole, one the nipple),
    2 split halves (one inner face up, one down)."""
    mat = lotus_material()
    rng = np.random.default_rng(seed)
    specs = [(False, 0.3, 0.0), (False, 2.2, 0.0), (False, -1.1, 0.75), (False, 0.9, -0.8), (True, PI, 0.0), (True, 0.0, 0.0)]
    entries = []
    for i, (hf, rx, ry) in enumerate(specs):
        v, f, attrs, _ = lotus_arrays(seed + 30 + i, half=hf)
        entries.append((S.rest_pose(v, rx + rng.normal(0, 0.05), ry, rng.uniform(0, 2 * PI)), f, attrs))
    return S.items_dict(NAME, 'lianzi', entries, material=mat)


# ----------------------------------------------------------------------------- build + render
def make_variants():
    mat = lotus_material()
    objs, shapes = [], []
    for i in range(N_WHOLE + N_HALF):
        v, f, attrs, hs = lotus_arrays(i, half=(i >= N_WHOLE))
        objs.append(C.mesh_from_arrays('lz%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(hs)
    w = [1.0] * N_WHOLE + [0.30] * N_HALF
    w[5] = 0.5
    return objs, shapes, w


def main():
    S.run_pile(SHOT, make_variants, R_DOME,
               heap_kw=dict(layers=3.0, coverage=0.72, scale_range=(0.90, 1.08), tilt_deg=30, roll_deg=120, flip=True,
                            candidates=6, sink=0.07, rough=0.0045),
               base_color=(0.075, 0.050, 0.025), base_drop=0.003,
               light_kw=dict(tint=(1.0, 0.94, 0.86), key=0.72, fill=0.55, rim=0.9, world=0.8, key_size=1.0))


if __name__ == '__main__':
    main()
