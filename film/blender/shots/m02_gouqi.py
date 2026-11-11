# -*- coding: utf-8 -*-
"""m02_gouqi - dried goji berries (枸杞子).  REFERENCE SHOT / template for every 'pile' shot.

    python m02_gouqi.py --quality draft   --out /tmp/x.png                       # ~20 s
    python m02_gouqi.py --quality final   --region 0.36,0.56,0.64,0.86  --out /tmp/c.png  # exact final pixels of a crop
    python m02_gouqi.py --quality final   --out film/renders/m02_gouqi.png        # still + _depth.npy

Structure (copy it):  1 variants (numpy geometry with REAL wrinkles + per-vertex masks)
                      2 material (masks -> colour / roughness, SSS, micro bump, per-instance jitter)
                      3 heap (pack_heap) + instancing + dome base
                      4 camera fitted to the heap, DOF, lights     5 render + framing check + comp
Units are metres: a berry is ~14 mm long.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 'm02_gouqi'
N_VARIANTS = 9            # distinct berry meshes (the last two carry a stem)
R_DOME = 0.26             # bare dome radius -> berries ~150-220 px long in the 1920 frame


# ----------------------------------------------------------------------------- 1. geometry
def make_berry(seed, with_stem=False, nu=230, nv=132):
    """One dried goji berry as numpy arrays.  Long axis = X (stem end at -X), flat side = Z.
    Returns (parts, attrs, half_sizes): parts = [(verts, faces, material_slot), ...] for
    C.merge_meshes (slot 0 skin, slot 1 stem), attrs = per-vertex shader masks, half_sizes =
    tight (a, b, c) half extents in metres = the collision proxy for C.pack_heap."""
    rng = np.random.default_rng(1000 + seed)
    L = rng.uniform(0.0105, 0.0172)                 # length
    Wd = rng.uniform(0.0056, 0.0074)                # width
    Th = Wd * rng.uniform(0.58, 0.80)               # thickness: dried berries are flattened
    s = np.linspace(0.0, 1.0, nu)[:, None]          # 0 = stem end, 1 = tip
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)[None, :]
    S, PH = np.broadcast_arrays(s, ph)

    # --- silhouette profile: blunt stem end, slightly more pointed tip, fattest part off-centre
    k = rng.uniform(0.85, 1.20)
    e = 0.44 + 0.20 * s                              # 0.5 = elliptical end, 1 = conical point
    prof = np.sin(math.pi * np.clip(s, 1e-4, 1 - 1e-4) ** k) ** e
    prof = prof / prof.max()

    # --- wrinkle height field.  Sampled on a cylinder (periodic around the berry) whose axis is
    #     compressed, so folds run mostly lengthwise but branch, meander and die out.
    aspect = L / Wd
    cyl = np.stack([S * aspect, np.cos(PH), np.sin(PH)], -1)        # ~unit cross-section
    warp = 0.55 * np.stack([C.fbm3(cyl * 1.1 + 7.1, 3, seed=seed + 1),
                            C.fbm3(cyl * 1.1 + 3.7, 3, seed=seed + 2),
                            C.fbm3(cyl * 1.1 + 9.4, 3, seed=seed + 3)], -1)
    q = cyl + warp
    f_long = rng.uniform(0.75, 1.10)                 # folds span roughly 1/3 - 1/2 of the length
    f_circ = rng.uniform(1.05, 1.45)                 # ~6-9 folds around
    b1 = np.abs(C.perlin3(q * [f_long, f_circ, f_circ], seed + 10))            # billow: sharp creases at 0
    b2 = np.abs(C.perlin3(q * [f_long * 2.1, f_circ * 2.3, f_circ * 2.3] + 5.0, seed + 11))
    b3 = np.abs(C.perlin3(q * [f_long * 5.0, f_circ * 5.0, f_circ * 5.0] + 11.0, seed + 12))
    fold = b1 ** 0.50                                # broad taut crests, narrow V-shaped creases
    fold2 = b2 ** 0.60
    how = C.smoothstep(-0.35, 0.30, C.fbm3(cyl * 0.8 + 21.0, 2, seed=seed + 15))  # where it shrivelled most
    how = 0.50 + 0.50 * how
    cross = C.fbm3(cyl * [7.0, 1.4, 1.4], 3, seed=seed + 13)                    # fine transverse crinkle
    dent = C.perlin3(cyl * [0.50, 0.50, 0.50] + 2.0, seed + 14)                 # collapse of the flat sides
    # seeds pressing from inside: a few soft bumps
    seeds_h = np.zeros_like(S)
    for _ in range(rng.integers(3, 7)):
        s0, p0 = rng.uniform(0.22, 0.80), rng.uniform(0, 2 * math.pi)
        dphi = np.angle(np.exp(1j * (PH - p0)))
        d2 = ((S - s0) * L / 0.0011) ** 2 + (dphi * 0.5 * Wd / 0.0011) ** 2
        seeds_h += np.exp(-d2)
    rad = (1.0
           + 0.30 * how * (fold - 0.70)
           + 0.13 * how * (fold2 - 0.62)
           + 0.045 * (b3 ** 0.7 - 0.5)
           + 0.022 * cross
           + 0.20 * np.minimum(dent, 0.2)
           + 0.07 * np.clip(seeds_h, 0, 1.2))
    amp_env = np.clip(prof * 1.6, 0, 1) ** 0.7       # calm the wrinkles down at the two poles
    rad = 1.0 + (rad - 1.0) * amp_env

    # --- cross-section (flattened superellipse) and a bent, slightly twisted centre line
    tw = rng.normal(0, 0.35) * (S - 0.5)
    cph, sph = np.cos(PH + tw), np.sin(PH + tw)
    ee = 0.92
    cy = np.sign(cph) * np.abs(cph) ** ee * (Wd / 2)
    cz = np.sign(sph) * np.abs(sph) ** ee * (Th / 2)
    bend_y = rng.normal(0, 0.075) * L
    bend_z = rng.normal(0, 0.03) * L
    arc = 4.0 * S * (1.0 - S) - 0.667
    X = (S - 0.5) * L
    Y = prof * rad * cy + bend_y * arc
    Z = prof * rad * cz + bend_z * arc
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    faces = C.grid_faces(nu, nv, wrap_v=True)

    # --- per-vertex masks for the shader
    cav = how * ((1.0 - C.smoothstep(0.0, 0.50, fold)) * 0.95 + (1.0 - C.smoothstep(0.0, 0.40, fold2)) * 0.40)
    cav = np.clip(cav * amp_env, 0, 1)
    scar_d = np.linalg.norm(verts - verts[:nv].mean(0), axis=1)     # distance from the stem pole
    attrs = dict(cav=cav.ravel(),                                   # 1 in creases, 0 on crests
                 scar=np.exp(-(scar_d / rng.uniform(0.00050, 0.00075)) ** 2),
                 halo=np.exp(-(scar_d / 0.0022) ** 2),
                 seedb=np.clip(seeds_h, 0, 1).ravel(),
                 slen=S.ravel().copy())
    half = (0.5 * L * 0.96, 0.5 * Wd * 0.95, 0.5 * Th * 0.92)
    parts = [(verts, faces, 0)]
    if with_stem:                                                   # short dry stem (果柄)
        n = 14
        t = np.linspace(0, 1, n)[:, None]
        p0 = verts[:nv].mean(0)
        d = np.array([-1.0, rng.normal(0, 0.35), rng.normal(0.15, 0.3)])
        d /= np.linalg.norm(d)
        side = np.cross(d, [0, 0, 1.0])
        ln = rng.uniform(0.0025, 0.006)
        path = p0 + d * ln * t + side * ln * 0.25 * rng.normal() * t ** 2 + np.array([0.0005, 0, 0])
        r = 0.00022 * (1.25 - 0.45 * t[:, 0])
        r[0] *= 1.8                                                  # flared base (calyx remnant)
        r[-1] *= 0.6
        sv, sf = C.tube(path, r, nv=10)
        parts.append((sv, sf, 1))
        for kname in attrs:
            attrs[kname] = np.concatenate([attrs[kname], np.zeros(len(sv))])
    return parts, attrs, half


# ----------------------------------------------------------------------------- 2. materials
def goji_material(sss_method='RANDOM_WALK'):
    m = C.Mat('goji_skin', sss_method=sss_method)
    cav = m.attr('cav')
    P = m.per_instance_coords()                                     # object coords, unique per berry
    # colour: orange-red crests, deep crimson creases, slow mottling, per-berry jitter
    mott = m.noise(scale=420, detail=3, roughness=0.55, vector=P)
    crest = m.mix((0.400, 0.010, 0.009), (0.510, 0.026, 0.010), m.map_range(mott, 0.35, 0.70))
    col = m.mix(crest, (0.120, 0.003, 0.005), m.map_range(cav, 0.08, 0.85, 0.0, 0.92, smooth=True))
    col = m.jitter(col, hue=0.012, saturation=0.08, value=0.22)
    # some berries are older / darker / browner (per-instance attribute written by the shot)
    col = m.mix(col, (0.115, 0.016, 0.010), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.75))
    # seeds show through as slightly paler patches
    col = m.mix(col, (0.72, 0.20, 0.04), m.math('MULTIPLY', m.attr('seedb'), 0.14))
    # stem scar: pale yellowish-white dot with an orange halo
    col = m.mix(col, (0.80, 0.26, 0.035), m.math('MULTIPLY', m.attr('halo'), 0.55))
    scar = m.map_range(m.attr('scar'), 0.25, 0.75, smooth=True)
    col = m.mix(col, (0.78, 0.62, 0.36), scar)
    # roughness: waxy semi-gloss on crests, dull in creases, broken up by noise; scar is matte
    rn = m.noise(scale=1500, detail=4, roughness=0.6, vector=P)
    rough = m.map_range(rn, 0.25, 0.75, 0.26, 0.50)
    rough = m.mixf(rough, 0.62, m.map_range(cav, 0.2, 0.9))
    rough = m.mixf(rough, 0.75, scar)
    rough = m.math('ADD', rough, m.map_range(m.attr('inst_rand', 'INSTANCER'), 0, 1, -0.04, 0.10))
    # micro relief: fine longitudinal crinkle (stretched along X) + pore grain
    Ps = m.mapping(P, scale=(0.22, 1.0, 1.0))
    crinkle = m.noise(scale=2600, detail=3, roughness=0.65, vector=Ps)
    nrm = m.bump(crinkle, strength=0.8, distance=0.00013)
    nrm = m.micro_bump(scale=9000, strength=0.5, distance=0.00004, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.47, specular=0.42,
          sss=0.60, sss_radius=(1.0, 0.14, 0.07), sss_scale=0.0011, sss_anisotropy=0.0,
          normal=nrm)
    return m


def stem_material():
    m = C.Mat('goji_stem')
    n = m.noise(scale=3000, detail=3)
    m.set(base_color=m.ramp(n, [(0.3, (0.10, 0.055, 0.025)), (0.7, (0.24, 0.15, 0.07))]), roughness=0.75,
          normal=m.bump(n, 0.5, 0.00005))
    return m


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    rng = np.random.default_rng(args.seed)

    skin, stem = goji_material(), stem_material()
    variants, shapes = [], []
    for i in range(N_VARIANTS):
        parts, attrs, half = make_berry(i, with_stem=(i >= N_VARIANTS - 2))
        v, f, fm = C.merge_meshes(parts)
        variants.append(C.mesh_from_arrays('berry%d' % i, v, f, attrs=attrs, materials=[skin, stem], face_mat=fm))
        shapes.append(half)
    weights = [1.0] * (N_VARIANTS - 2) + [0.22, 0.22]               # stems are the exception

    # 3. heap: what the camera will see (+ margin) is populated, nothing else
    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=3.2, coverage=0.72, weights=weights, seed=args.seed,
                       scale_range=(0.82, 1.12), tilt_deg=9, roll_deg=28, candidates=6, sink=0.16, rough=0.0016)
    dark = (rng.random(len(heap)) < 0.10) * rng.uniform(0.5, 1.0, len(heap))
    C.instance_on_points('heap', variants, heap, attrs={'dark': dark})
    C.dome_base(R_DOME - 0.0015, C.simple_material('base', (0.045, 0.006, 0.004), 0.9))

    # 4. camera on the real heap surface, lens-like but deep DOF, back-lit food lighting
    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.53, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(1.0, 0.86, 0.80), key=0.85, fill=0.75, rim=1.1, world=1.0, key_size=0.9)

    # 5. render, verify the framing contract, write the judging composite
    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
