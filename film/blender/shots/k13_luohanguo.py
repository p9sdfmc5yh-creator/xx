# -*- coding: utf-8 -*-
"""k13_luohanguo - dried monk fruit (罗汉果), kind = surface: a macro across the top of ONE whole
dried fruit (a 57 mm sphere at true scale): its limb is the horizon arc.

    python k13_luohanguo.py --quality preview --out /tmp/x.png
    python k13_luohanguo.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.50,0.62,0.75   # final-density crop
    python k13_luohanguo.py --quality final --out film/renders/k13_luohanguo.png

At the contract framing only a ~19 mm wide strip of the shell is in frame (about 200 px / mm at
4K), so the shell is built as a dense patch (0.012 mm cells) with real micro relief - shallow
dents, dry-shrink wrinkles, pits, tiny warts - plus ~36 000 real fuzz hairs (0.1-0.35 mm) that
give the velvety sheen and the soft halo on the silhouette.  The fruit's stem pole lies just
below the frame, so its faint darker longitudinal lines (纵纹) fan out towards the horizon.
shell_relief() works on unit directions and is shared with make_items() (whole fruits).
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _botanicals import C, rot, merge_parts, hair_tubes, settle, finish                # noqa: E402

SHOT = 'k13_luohanguo'
SEED = 2
R_FRUIT = 0.0285
N_HAIR = 13000
SKY_TINT = (1.0, 0.92, 0.70)      # golden-yellow sky of the shot
_p = np.array([-0.07, -math.sin(math.radians(33.5)), math.cos(math.radians(33.5))])
POLE = _p / np.linalg.norm(_p)    # stem pole: 33.5 deg from the top towards the camera = just below the frame


# ----------------------------------------------------------------------------- 1. geometry
def shell_relief(d, R, pole, seed, n_lines=11, fine=True):
    """Radial offset h (m) of the dried shell for unit directions d (..., 3) on a fruit of radius R
    whose stem pole is `pole`, + shader attrs 'lg' = (longitudinal line, pit, stem scar)."""
    rng = np.random.default_rng(300 + seed)
    pole = np.asarray(pole, float)
    ref = np.array([1.0, 0.0, 0.0]) if abs(pole[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    e1 = np.cross(pole, ref)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(pole, e1)
    p = d * R
    ct = np.clip(d @ pole, -1, 1)
    th = np.arccos(ct)
    lam = np.arctan2(d @ e2, d @ e1) + 0.07 * C.fbm3(p / 0.007 + 3.0, 3, seed=seed + 1)
    lk = (np.arange(n_lines) + rng.uniform(-0.22, 0.22, n_lines)) * 2 * np.pi / n_lines + rng.uniform(0, 6.28)
    sk = rng.uniform(0.60, 1.0, n_lines)
    dl = np.angle(np.exp(1j * (lam[..., None] - lk)))                        # (..., n_lines)
    k = np.abs(dl).argmin(-1)
    dist = R * np.sin(th) * np.abs(np.take_along_axis(dl, k[..., None], -1)[..., 0])
    fadeL = 0.70 + 0.30 * np.clip(0.5 + 1.2 * C.perlin3(p / 0.008 + 11.0, seed + 2), 0, 1)
    line = sk[k] * fadeL * (0.72 * np.exp(-(dist / 0.00030) ** 2) + 0.28 * np.exp(-(dist / 0.0010) ** 2))
    scar = C.smoothstep(0.085, 0.060, th)
    h = 0.00030 * C.fbm3(p / 0.009, 3, seed=seed + 3) - 0.00035 * C.smoothstep(0.15, 0.55, C.perlin3(p / 0.013 + 5.0, seed + 4))
    h = h - 0.000070 * line + 0.00012 * scar * (0.5 + C.perlin3(p / 0.0006, seed + 5))
    pit = np.zeros_like(th)
    if fine:
        q = p.reshape(-1, 3)
        shp = th.shape
        wr = np.abs(C.perlin3(q / 0.00075 + 1.0, seed + 6)).reshape(shp) ** 0.6                 # dry-shrink wrinkles
        wr2 = np.abs(C.perlin3(q / 0.00030 + 9.0, seed + 7)).reshape(shp) ** 0.7
        how = 0.45 + 0.55 * C.smoothstep(-0.25, 0.25, C.fbm3(q / 0.004 + 2.0, 2, seed=seed + 8)).reshape(shp)
        F1, F2, _ = C.cellular3(q / 0.00030 + 4.0, seed + 9)
        sel = (C.perlin3(q / 0.0011 + 6.0, seed + 10) > 0.16).reshape(shp)
        pit = np.where(sel, 1.0 - C.smoothstep(0.10, 0.30, F1.reshape(shp)), 0.0)
        G1, G2, _ = C.cellular3(q / 0.00095 + 14.0, seed + 11)
        selw = (C.perlin3(q / 0.0027 + 16.0, seed + 12) > 0.10).reshape(shp)
        wart = np.where(selw, 1.0 - C.smoothstep(0.08, 0.34, G1.reshape(shp)), 0.0)
        h = (h + 0.000022 * how * (wr - 0.55) + 0.000009 * (wr2 - 0.5) - 0.000020 * pit + 0.000030 * wart
             + 0.000004 * C.perlin3(q / 0.00009, seed + 13).reshape(shp))
    return h, dict(lg=np.stack([np.clip(line, 0, 1), pit, scar], -1))


# ----------------------------------------------------------------------------- 2. materials
def shell_material():
    """Thin hard dried shell: mottled brown / yellow-brown / olive, darker blotches and lines, matte
    with a faint velvety sheen."""
    m = C.Mat('lhg_shell')
    lg = m.node('ShaderNodeSeparateXYZ', {0: m.attr('lg', output='Vector')})
    line, pit, scar = lg.outputs[0], lg.outputs[1], lg.outputs[2]
    P = m.coords('Object')
    big = m.noise(scale=105, detail=4, roughness=0.6, vector=P)                 # ~1 cm patches
    med = m.noise(scale=560, detail=4, roughness=0.65, vector=P)                # ~2 mm blotches
    fine = m.noise(scale=5200, detail=3, roughness=0.6, vector=P)               # 0.2 mm speckle
    col = m.ramp(big, [(0.30, (0.060, 0.027, 0.009)), (0.45, (0.135, 0.062, 0.016)), (0.58, (0.200, 0.105, 0.024)),
                       (0.74, (0.115, 0.092, 0.022))])
    col = m.mix(col, (0.040, 0.018, 0.008), m.map_range(med, 0.54, 0.74, 0.0, 0.80, smooth=True))
    col = m.mix(col, (0.250, 0.140, 0.036), m.map_range(med, 0.44, 0.22, 0.0, 0.45, smooth=True))
    col = m.mix(col, (0.66, 0.62, 0.58), m.map_range(fine, 0.40, 0.72), blend='MULTIPLY')
    col = m.mix(col, (0.040, 0.019, 0.009), m.math('MULTIPLY', line, 0.88))
    col = m.mix(col, (0.032, 0.016, 0.008), m.math('MULTIPLY', pit, 0.45))
    sp = m.map_range(m.voronoi(scale=2500, feature='F1', vector=P), 0.05, 0.11, 1.0, 0.0, smooth=True)
    col = m.mix(col, (0.36, 0.25, 0.10), m.math('MULTIPLY', sp, 0.45))
    col = m.mix(col, (0.34, 0.25, 0.13), scar)
    col = m.jitter(col, hue=0.01, saturation=0.08, value=0.10)
    rough = m.map_range(med, 0.3, 0.7, 0.50, 0.68)
    rough = m.mixf(rough, 0.85, m.math('MAXIMUM', pit, scar))
    nrm = m.bump(m.noise(scale=9500, detail=3, roughness=0.6, vector=P), strength=0.5, distance=0.000012)
    nrm = m.bump(fine, strength=0.35, distance=0.00002, normal=nrm)
    nrm = m.bump(sp, strength=0.4, distance=0.000012, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.5, specular=0.12, sheen=0.06, sheen_roughness=0.45, normal=nrm)
    try:
        m.set(**{'Sheen Tint': (1.0, 0.86, 0.58, 1.0)})
    except Exception:
        pass
    return m


def fuzz_material():
    """Short pale yellowish hairs: glow when back-lit."""
    m = C.Mat('lhg_fuzz')
    tv = m.attr('tv')
    r = m.attr('hr')
    col = m.mix((0.30, 0.19, 0.07), (0.56, 0.41, 0.17), tv)
    col = m.mix(col, (0.16, 0.09, 0.035), m.map_range(r, 0.6, 1.0, 0.0, 0.8))
    m.set(base_color=col, roughness=0.5, specular=0.3)
    tr = m.node('ShaderNodeBsdfTranslucent', {'Color': m.mix(col, (1.0, 0.82, 0.45), 1.0, blend='MULTIPLY')})
    mix = m.node('ShaderNodeMixShader', {0: 0.4, 1: m.bsdf.outputs[0], 2: tr.outputs[0]})
    m.nt.links.new(mix.outputs[0], m.out.inputs['Surface'])
    return m


def stem_material():
    m = C.Mat('lhg_stem')
    n = m.noise(scale=1500, detail=3)
    m.set(base_color=m.ramp(n, [(0.3, (0.10, 0.06, 0.03)), (0.7, (0.24, 0.16, 0.08))]), roughness=0.8,
          normal=m.bump(n, 0.5, 0.00008))
    return m


# ----------------------------------------------------------------------------- loose items (flat-lay)
def make_fruit(seed, nu=420, nv=640, stem=False):
    """One whole dried fruit, stem pole = +Z.  Returns dict(verts, faces, face_mat, attrs)."""
    rng = np.random.default_rng(8100 + seed)
    R = rng.uniform(0.0245, 0.0300)
    th = np.linspace(1e-4, math.pi - 1e-4, nu)[:, None]
    la = np.linspace(0, 2 * math.pi, nv, endpoint=False)[None, :]
    d = np.stack(np.broadcast_arrays(np.sin(th) * np.cos(la), np.sin(th) * np.sin(la), np.cos(th) + 0 * la), -1)
    h, attrs = shell_relief(d, R, (0.0, 0.0, 1.0), 40 + seed, n_lines=int(rng.integers(7, 11)), fine=True)
    for _ in range(int(rng.integers(1, 3))):                        # one or two broad dents of a dried shell
        c = rng.normal(size=3)
        c /= np.linalg.norm(c)
        ang = np.arccos(np.clip(d @ c, -1, 1))
        h = h - rng.uniform(0.0008, 0.0020) * np.exp(-(ang / rng.uniform(0.25, 0.45)) ** 2)
    verts = (d * (R + h)[..., None]).reshape(-1, 3) * [1.0, rng.uniform(0.95, 1.0), rng.uniform(1.0, 1.13)]
    parts = [(verts, C.grid_faces(nu, nv, wrap_v=True), 0, dict(lg=attrs['lg'].reshape(-1, 3)))]
    if stem:
        tt = np.linspace(0, 1, 10)[:, None]
        ln = rng.uniform(0.003, 0.007)
        top = np.array([0.0, 0.0, verts[:, 2].max() - 0.0004])
        path = top + tt * ln * np.array([rng.normal(0, 0.25), rng.normal(0, 0.25), 1.0])
        rr = np.linspace(0.0016, 0.0012, 10)
        rr[-1] *= 0.5
        sv, sf = C.tube(path, rr, nv=14)
        parts.append((sv, sf, 1, {}))
    verts, faces, fm, at = merge_parts(parts)
    return dict(verts=verts, faces=faces, face_mat=fm, attrs=at)


def make_items(seed=0):
    """5 whole dried monk fruits in resting poses (on the side, stem scar visible), lowest point on z = 0."""
    mats = [shell_material(), stem_material()]
    rng = np.random.default_rng(800 + seed)
    objs, foot, hh = [], [], []
    for i, tilt in enumerate([70, 95, 40, 110, 80]):
        h = make_fruit(seed * 100 + i, stem=(i in (0, 3)))
        Rm = rot(2, rng.uniform(0, 2 * math.pi)) @ rot(0, math.radians(tilt + rng.normal(0, 8)))
        v, fr, hz = settle(h['verts'], Rm)
        objs.append(C.mesh_from_arrays('luohanguo_item_%d' % i, v, h['faces'], attrs=h['attrs'], materials=mats,
                                       face_mat=h['face_mat']))
        foot.append(fr)
        hh.append(hz)
    return dict(objects=objs, footprint_r=foot, half_height=hh, name='罗汉果')


# ----------------------------------------------------------------------------- hero scene
def main():
    args = C.parse_args(seed=SEED)
    sc = C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    hi = sc.render.resolution_x >= 2500
    rng = np.random.default_rng(args.seed)
    sol = C.planet_solve(R_FRUIT, apex=0.535)
    v, f, n, (ny, nx) = C.patch_grid(sol['patch'], R=R_FRUIT, n_max=1800 if hi else 800)
    h, attrs = shell_relief(n, R_FRUIT, POLE, args.seed, fine=True)
    verts = v + n * h[:, None]
    C.mesh_from_arrays('shell', verts, f, attrs=attrs, material=shell_material())
    print('[shell] %d x %d verts, cell %.4f mm' % (nx, ny, 1000 * (sol['patch'][1] - sol['patch'][0]) / (nx - 1)))

    # fuzz: real hairs, patchy (partly rubbed off), semi-appressed in random directions
    w = 0.25 + 0.75 * C.smoothstep(-0.2, 0.3, C.fbm3(v / 0.004 + 40.0, 3, seed=args.seed + 20))
    idx = rng.choice(len(v), N_HAIR, p=w / w.sum())
    nn = n[idx]
    tang = np.cross(nn, rng.normal(size=(N_HAIR, 3)))
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    dirs = nn * rng.uniform(0.25, 1.1, N_HAIR)[:, None] + tang
    ln = rng.uniform(0.00007, 0.00024, N_HAIR)
    ln = np.where(rng.random(N_HAIR) < 0.05, ln * 1.6, ln)
    hv, hf, tv = hair_tubes(rng, verts[idx] - nn * 0.000008, dirs, ln, rng.uniform(0.0000032, 0.0000052, N_HAIR),
                            bend=0.45, nr=5, nseg=3)
    C.mesh_from_arrays('fuzz', hv, hf, material=fuzz_material(),
                       attrs=dict(tv=tv, hr=np.repeat(rng.random(N_HAIR), 15)))

    cam, info = C.planet_camera(R_FRUIT + float(np.percentile(h, 99)) * 0.7, apex=0.535, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=2.5)
    # side key (not the usual back key): at these grazing view angles a back light turns the matte shell into a
    # pale glare veil; from the side it models the pits and wrinkles and keeps the browns saturated
    C.studio_lights(info, tint=SKY_TINT, key=1.0, fill=0.55, rim=0.45, world=0.55, key_az=-108, key_el=46, key_size=1.0)
    finish(args, SHOT)


if __name__ == '__main__':
    main()
