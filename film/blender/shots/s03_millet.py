# -*- coding: utf-8 -*-
"""s03_millet - 小米（五谷）: a mound of hulled foxtail millet (Setaria italica), kind = pile.

    python s03_millet.py --quality draft   --out /tmp/x.png
    python s03_millet.py --quality draft   --res 4032x2268 --spp 24 --region 0.35,0.62,0.65,0.92   # final-density crop
    python s03_millet.py --quality final   --out film/renders/s03_millet.png     # 4032x2268 still + _depth.npy

A hulled millet grain is a miniature maize kernel: a 1.5-1.8 mm slightly flattened ovoid, golden
yellow, satin-matte, with a paler cream germ shield (胚) on the convex (dorsal) face that starts at
the narrow base and is outlined by a shallow groove; the hilum is a dark dot low on the flat face.

  1 grain_arrays / hull_arrays   numpy geometry (real germ groove, facets, lumps) + per-vertex masks
  2 millet_material              masks -> colour / roughness, Burley SSS, pebbly micro bump, flour dust
  3 heap (pack_heap) + debris (flour crumbs, bran flakes) + dome base
  4 camera fitted to the heap, DOF, back-lit food lighting      5 render + framing check + comp
Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 's03_millet'
NAME = '小米（五谷）'
FINAL_RES = (4032, 2268)      # 64-frame shot: film frame + 5 % for the push-in
R_DOME = 0.19                 # bare dome radius -> a grain is ~44 px at the horizon of a 1920 frame (x2.1 at 4K)
N_WHOLE, N_BROKEN, N_HULL = 10, 2, 2
PI = math.pi


# ----------------------------------------------------------------------------- 1. geometry
def _sphere_dirs(nu, nv):
    """Unit directions on a lat-long grid whose poles lie on the X axis (base pole = -X)."""
    t = np.linspace(0.0, PI, nu)
    t[0], t[-1] = 2e-3, PI - 2e-3
    ph = np.linspace(0, 2 * PI, nv, endpoint=False)
    T, PH = np.meshgrid(t, ph, indexing='ij')
    d = np.stack([-np.cos(T), np.sin(T) * np.cos(PH), np.sin(T) * np.sin(PH)], -1)
    return d, T, PH


def _norm01(x, lo=4, hi=96):
    a, b = np.percentile(x, [lo, hi])
    return np.clip((x - a) / (b - a + 1e-12), 0.0, 1.0)


def _pack(germ, groove, pit, hil, tip, frac, mott, bran, dzone, hull, rvar):
    """Per-vertex masks packed in three vector attributes + two floats (cheap to read in the shader)."""
    f = lambda x: np.asarray(x, float).ravel()
    return dict(m1=np.stack([f(germ), f(groove), f(pit)], 1), m2=np.stack([f(hil), f(tip), f(frac)], 1),
                m3=np.stack([f(mott), f(bran), f(dzone)], 1), hull=f(hull), rvar=f(rvar))


def _baked_fields(d, off, seed):
    """Slow colour / roughness fields baked per vertex (features >= 0.15 mm), all in 0..1."""
    mott = _norm01(C.fbm3(d * 1.7 + off + 31.0, 3, seed=seed + 21))                 # horny vs floury zones
    bran = C.smoothstep(0.62, 0.86, _norm01(C.fbm3(d * 5.5 + off + 7.0, 3, seed=seed + 22)))   # bran remnants
    dzone = C.smoothstep(0.50, 0.85, _norm01(C.fbm3(d * 2.3 + off + 53.0, 2, seed=seed + 23)))  # where flour clings
    rvar = _norm01(C.fbm3(d * 4.0 + off + 77.0, 3, seed=seed + 24))
    return mott, bran, dzone, rvar


def grain_arrays(seed, broken=False, nu=88, nv=120):
    """One hulled millet grain.  Long axis X (germ / base end at -X), germ face +Z, flat hilum face -Z.
    Returns (verts (N,3) centred on the bounding box, faces, attrs, half_sizes (a, b, c))."""
    rng = np.random.default_rng(7000 + seed)
    d, T, PH = _sphere_dirs(nu, nv)
    dx, dy, dz = d[..., 0], d[..., 1], d[..., 2]
    L = rng.uniform(1.50e-3, 1.74e-3)
    Wd = L * rng.uniform(0.90, 0.99)
    Th = Wd * rng.uniform(0.80, 0.92)
    a, b, c = L / 2, Wd / 2, Th / 2
    off = rng.uniform(0, 50, 3)
    # low-frequency lumps + one or two flats (grains are pressed against each other in the panicle)
    r = 1.0 + 0.034 * C.fbm3(d * 1.25 + off, 2, seed=seed) + 0.010 * C.perlin3(d * 4.3 + off[::-1], seed + 3)
    for _ in range(int(rng.integers(0, 3))):
        n = rng.normal(size=3)
        n[0] *= 0.6
        n /= np.linalg.norm(n)
        r = r - rng.uniform(0.025, 0.06) * C.smoothstep(0.70, 1.0, d @ n)
    # --- germ (胚): a small tongue-shaped dimple that starts at the base pole on the dorsal face
    lu = rng.uniform(0.40, 0.52)
    Tc = math.asin(min(0.96 * lu, 0.99))
    c0 = np.array([-math.cos(Tc), 0.0, math.sin(Tc)])
    eu = np.array([math.sin(Tc), 0.0, math.cos(Tc)])
    pu, pv, pn = d @ eu, dy, d @ c0
    lv = rng.uniform(0.25, 0.33) * (1.0 - 0.25 * pu / lu)
    skew = rng.normal(0, 0.07)
    rho = np.sqrt((pu / lu) ** 2 + ((pv - skew * pu) / lv) ** 2) + 6.0 * C.smoothstep(0.45, 0.10, pn)
    rho = rho * (1.0 + 0.12 * C.perlin3(d * 3.4 + off + 17.0, seed + 5))          # irregular outline
    germ = C.smoothstep(1.08, 0.80, rho)
    groove = np.exp(-((rho - 1.0) / 0.20) ** 2)
    intact = rng.random() < 0.60
    if intact:        # embryo still in place: shallow outline groove, slightly sunken pad
        r = r - rng.uniform(0.028, 0.045) * groove - 0.022 * germ + 0.016 * C.smoothstep(0.7, 0.1, rho)
        pit = np.zeros_like(rho)
    else:             # germ knocked out by milling: a notch showing the floury endosperm
        pit = C.smoothstep(1.0, 0.25, rho)
        r = r - 0.022 * groove - rng.uniform(0.05, 0.085) * pit
    # --- hilum dot on the flat face near the base, tiny style remnant at the apex, faint ventral crease
    Th_ = rng.uniform(0.16, 0.24) * PI
    h0 = np.array([-math.cos(Th_), 0.0, -math.sin(Th_)])
    hil = np.exp(-(np.arccos(np.clip(d @ h0, -1, 1)) / rng.uniform(0.07, 0.10)) ** 2)
    r = r - 0.020 * hil
    tip = np.exp(-((PI - T) / 0.085) ** 2)
    crease = np.exp(-(dy / 0.07) ** 2) * (dz < 0) * np.sin(T) ** 2 * C.smoothstep(0.75 * PI, 0.3 * PI, T)
    r = r - 0.012 * crease
    # --- assemble: slight egg taper (narrower base), flattened ventral side
    k = 1.0 + rng.uniform(0.03, 0.08) * dx
    X, Y, Z = a * dx * r, b * dy * r * k, c * dz * r * k
    Z = np.where(Z < 0, Z * rng.uniform(0.85, 0.95), Z)
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    frac = np.zeros(len(verts))
    if broken:        # snapped grain: clip with a rough plane, floury fracture face
        n = rng.normal(size=3) * [1.0, 0.45, 0.45]
        n /= np.linalg.norm(n)
        h = rng.uniform(-0.15, 0.30) * a
        hh = h + 6.0e-5 * C.fbm3(verts * 2600.0 + off, 3, seed=seed + 9)
        over = verts @ n - hh
        frac = C.smoothstep(0.0, 2.5e-5, over)
        verts = verts - n * np.maximum(over, 0.0)[:, None]
    lo, hi = verts.min(0), verts.max(0)
    verts = verts - 0.5 * (lo + hi)
    mott, bran, dzone, rvar = _baked_fields(d, off, seed)
    attrs = _pack(germ, groove, pit, hil, tip, frac, mott, bran, dzone, np.zeros(len(verts)), rvar)
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, tuple(0.5 * (hi - lo) * 0.975)


def hull_arrays(seed, nu=88, nv=120):
    """An unhulled grain (谷子): pointed-elliptic glossy lemma, flat palea with two seam lines."""
    rng = np.random.default_rng(8000 + seed)
    d, T, PH = _sphere_dirs(nu, nv)
    L = rng.uniform(2.0e-3, 2.35e-3)
    Wd = L * rng.uniform(0.66, 0.74)
    Th = Wd * rng.uniform(0.76, 0.86)
    a, b, c = L / 2, Wd / 2, Th / 2
    off = rng.uniform(0, 50, 3)
    prof = np.sin(T) ** (0.80 + 0.40 * (T / PI))                       # blunt base, pointed apex
    r = 1.0 + 0.035 * C.fbm3(d * 1.4 + off, 2, seed=seed)
    seam = np.exp(-((np.abs(np.cos(PH)) - 0.80) / 0.07) ** 2) * (np.sin(PH) < 0)
    r = r - 0.045 * seam * np.sin(T)
    X = -a * np.cos(T)
    Y = b * prof * np.cos(PH) * r
    Z = c * prof * np.sin(PH) * r
    Z = np.where(Z < 0, Z * 0.60, Z)
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    lo, hi = verts.min(0), verts.max(0)
    verts = verts - 0.5 * (lo + hi)
    z = np.zeros(len(verts))
    mott, bran, dzone, rvar = _baked_fields(d, off, seed)
    attrs = _pack(z, 0.6 * seam, z, z, np.exp(-((PI - T) / 0.16) ** 2), z, mott, z, 0.3 * dzone.ravel(),
                  np.ones(len(verts)), rvar)
    return verts, C.grid_faces(nu, nv, wrap_v=True), attrs, tuple(0.5 * (hi - lo) * 0.97)


def crumb_arrays(seed, flat=False):
    """Unit-size (radius 0.1 mm) irregular flour crumb, or a thin curled bran flake when flat."""
    rng = np.random.default_rng(9000 + seed)
    d, T, PH = _sphere_dirs(14, 18)
    r = 1.0 + 0.45 * C.fbm3(d * 1.6 + rng.uniform(0, 30, 3), 2, seed=seed)
    s = np.array([1.0, rng.uniform(0.6, 0.9), 0.10 if flat else rng.uniform(0.5, 0.8)]) * 1e-4
    v = (d * r[..., None] * s).reshape(-1, 3)
    if flat:
        v[:, 2] += rng.normal(0, 2500.0) * (v[:, 0] ** 2 - v[:, 1] ** 2) + rng.normal(0, 2000.0) * v[:, 0] * v[:, 1]
    return v, C.grid_faces(14, 18, wrap_v=True)


# ----------------------------------------------------------------------------- 2. materials
def millet_material():
    """Hulled millet endosperm / germ / flour / hull in one Principled material.  Slow fields come
    from baked vertex attributes, only the sub-0.1 mm detail is procedural (CPU economy: 4 noise
    look-ups).  Every per-grain value derives from Object Info > Random, so the material works
    for the heap instances AND for the stand-alone objects of make_items()."""
    m = C.Mat('millet', sss_method='BURLEY')
    P = m.per_instance_coords()
    wn = m.node('ShaderNodeTexWhiteNoise', {'W': m.math('MULTIPLY', m.obj_random(), 517.3)}, noise_dimensions='1D')
    sep = m.node('ShaderNodeSeparateColor', {0: wn.outputs['Color']})
    t_tone, t_dust, t_misc = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    xyz = lambda name: m.node('ShaderNodeSeparateXYZ', {0: m.attr(name, output='Vector')}).outputs
    germ, groove, pit = xyz('m1')[0], xyz('m1')[1], xyz('m1')[2]
    m2, m3 = xyz('m2'), xyz('m3')
    hil, tip, frac = m2[0], m2[1], m2[2]
    mott, bran, dzone = m3[0], m3[1], m3[2]
    hull, rvar = m.attr('hull'), m.attr('rvar')

    # --- item-to-item: a few pale straw grains, mostly golden yellow, some deeper orange ones
    body = m.ramp(t_tone, [(0.00, (0.760, 0.590, 0.220)), (0.08, (0.760, 0.520, 0.105)),
                           (0.24, (0.750, 0.470, 0.048)), (0.78, (0.730, 0.425, 0.034)),
                           (0.94, (0.660, 0.330, 0.022)), (1.00, (0.560, 0.235, 0.016))])
    # --- within a grain: horny (deeper, more saturated) versus floury (paler) zones
    col = m.hsv(body, 0.5, m.map_range(mott, 0.0, 1.0, 1.06, 0.93), m.map_range(mott, 0.0, 1.0, 0.91, 1.04))
    # --- micro: fine speckle and thin orange-brown remnants of the bran layer
    spk = m.noise(scale=9500, detail=1, roughness=0.6, vector=P)
    col = m.hsv(col, 0.5, 1.0, m.map_range(spk, 0.30, 0.72, 0.91, 1.06))
    col = m.mix(col, (0.520, 0.250, 0.026), m.math('MULTIPLY', bran, m.map_range(spk, 0.35, 0.6, 0.05, 0.22)))
    # --- germ: pale cream dimple, its outline groove darker, knocked-out pit = chalky endosperm
    col = m.mix(col, m.mix((0.720, 0.570, 0.270), (0.780, 0.680, 0.420), spk), m.math('MULTIPLY', germ, 0.78))
    col = m.mix(col, (0.800, 0.730, 0.520), m.math('MULTIPLY', pit, 0.80))
    col = m.mix(col, (0.400, 0.190, 0.024), m.math('MULTIPLY', groove, 0.30))
    col = m.mix(col, (0.170, 0.070, 0.020), m.map_range(hil, 0.35, 0.85, smooth=True))
    col = m.mix(col, (0.300, 0.120, 0.022), m.math('MULTIPLY', tip, 0.50))
    # --- flour dust clinging to the surface (more on some grains, more in the groove)
    dn = m.noise(scale=15000, detail=1, roughness=0.7, vector=P)
    dust = m.math('MULTIPLY', m.map_range(dn, 0.56, 0.70), dzone)
    dust = m.math('MULTIPLY', dust, m.map_range(t_dust, 0.0, 1.0, 0.10, 1.0))
    dust = m.math('ADD', dust, m.math('MULTIPLY', groove, m.map_range(dn, 0.45, 0.65, 0.0, 0.30)), clamp=True)
    col = m.mix(col, (0.790, 0.720, 0.520), m.math('MULTIPLY', dust, 0.50))
    col = m.jitter(col, hue=0.006, saturation=0.05, value=0.08)
    # --- fracture face of broken grains: floury, off-white
    col = m.mix(col, m.mix((0.720, 0.600, 0.300), (0.820, 0.760, 0.560), dn), frac)
    # --- unhulled grains: straw-tan to chestnut glossy lemma
    hcol = m.ramp(t_misc, [(0.0, (0.400, 0.220, 0.055)), (0.55, (0.290, 0.125, 0.033)), (1.0, (0.150, 0.055, 0.020))])
    hcol = m.mix(hcol, (0.10, 0.04, 0.015), m.math('MULTIPLY', groove, 0.8))
    hcol = m.hsv(hcol, 0.5, 1.0, m.map_range(mott, 0.0, 1.0, 0.8, 1.15))
    col = m.mix(col, hcol, hull)

    # --- roughness: satin, broken up; germ / flour / fracture matte; hull glossy
    rough = m.map_range(rvar, 0.0, 1.0, 0.30, 0.50)
    rough = m.math('ADD', rough, m.map_range(t_misc, 0, 1, -0.05, 0.07))
    rough = m.mixf(rough, 0.66, m.math('MULTIPLY', germ, 0.8))
    rough = m.mixf(rough, 0.85, dust)
    matte = m.math('MAXIMUM', frac, pit)
    rough = m.mixf(rough, 0.90, matte)
    rough = m.mixf(rough, m.map_range(rvar, 0.0, 1.0, 0.24, 0.40), hull)
    # --- micro relief in ONE bump: 0.17 mm orange-peel down to 25 um pericarp grain; stronger on floury faces
    mic = m.noise(scale=6000, detail=3, roughness=0.62, lacunarity=2.6, vector=P)
    nrm = m.bump(mic, strength=m.mixf(0.70, 1.0, matte), distance=m.mixf(0.000018, 0.00004, matte))
    sss = m.mixf(0.55, 0.25, m.math('MAXIMUM', hull, m.math('MULTIPLY', frac, 0.5)))
    m.set(base_color=col, roughness=rough, ior=1.50, specular=0.38,
          sss=sss, sss_radius=(1.0, 0.55, 0.20), sss_scale=0.00035,
          sheen=0.06, sheen_roughness=0.45, sheen_tint=(1.0, 0.92, 0.75), normal=nrm)
    return m


def debris_materials():
    fl = C.Mat('flour')
    n = fl.noise(scale=20000, detail=2)
    fl.set(base_color=fl.jitter(fl.mix((0.74, 0.64, 0.40), (0.84, 0.79, 0.62), n), 0.01, 0.1, 0.15), roughness=0.85,
           sss=0.4, sss_radius=(1.0, 0.7, 0.4), sss_scale=0.0001)
    br = C.Mat('bran')
    n = br.noise(scale=9000, detail=3)
    br.set(base_color=br.jitter(br.mix((0.40, 0.19, 0.04), (0.62, 0.38, 0.11), n), 0.015, 0.1, 0.25), roughness=0.55,
           sss=0.5, sss_radius=(1.0, 0.5, 0.2), sss_scale=0.0002, normal=br.bump(n, 0.5, 0.00001))
    return fl, br


# ----------------------------------------------------------------------------- loose items (flat-lay re-use)
def _roll_x(v, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    return v @ np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]]).T


def make_items(seed=0):
    """Loose millet grains as found in a jar: 8 template objects at real-world scale, each in a
    natural resting pose, lowest point on z = 0, origin at the footprint centre.
    5 whole grains germ-up / tilted, 1 lying on the germ (hilum up), 1 broken, 1 unhulled."""
    mat = millet_material()
    rng = np.random.default_rng(seed)
    specs = [('whole', 0.0), ('whole', 0.25), ('whole', -0.5), ('whole', 0.1), ('whole', 1.3),
             ('whole', PI), ('broken', 0.2), ('hull', 0.0)]
    objects, foot, half_h = [], [], []
    for i, (kind, roll) in enumerate(specs):
        if kind == 'hull':
            v, f, attrs, _ = hull_arrays(seed + i)
        else:
            v, f, attrs, _ = grain_arrays(seed + 20 + i, broken=(kind == 'broken'))
        v = _roll_x(v, roll + rng.normal(0, 0.08))
        c = np.array([v[:, 0].min() + v[:, 0].max(), v[:, 1].min() + v[:, 1].max(), 2 * v[:, 2].min()]) * 0.5
        v = v - c
        objects.append(C.mesh_from_arrays('millet_item_%d' % i, v, f, attrs=attrs, material=mat))
        foot.append(float(np.hypot(v[:, 0], v[:, 1]).max()))
        half_h.append(float(v[:, 2].max() * 0.5))
    return dict(objects=objects, footprint_r=foot, half_height=half_h, name=NAME)


# ----------------------------------------------------------------------------- 3. debris on the heap surface
def scatter_debris(heap, n, rng, hollow=0.7, reach=0.0007):
    """n points resting on the heap's height field (hollow = share that rolled into the gaps).
    Returns (loc (n,3), quat (n,4) aligned with the local slope + random yaw)."""
    gx, gy, Hf = heap.gx, heap.gy, heap.height
    xmin, xmax, ymin, ymax = heap.extent
    res = gx[1] - gx[0]
    bx, by = rng.uniform(xmin, xmax, n), rng.uniform(ymin, ymax, n)
    cx = bx[:, None] + np.concatenate([np.zeros((n, 1)), rng.uniform(-reach, reach, (n, 5))], 1)
    cy = by[:, None] + np.concatenate([np.zeros((n, 1)), rng.uniform(-reach, reach, (n, 5))], 1)
    ix = np.clip(((cx - gx[0]) / res).astype(int), 1, len(gx) - 2)
    iy = np.clip(((cy - gy[0]) / res).astype(int), 1, len(gy) - 2)
    hz = Hf[iy, ix]
    pick = np.where(rng.random(n) < hollow, hz.argmin(1), 0)
    ar = np.arange(n)
    ix, iy = ix[ar, pick], iy[ar, pick]
    loc = np.stack([cx[ar, pick], cy[ar, pick], hz[ar, pick]], 1)
    sx = (Hf[iy, ix + 1] - Hf[iy, ix - 1]) / (2 * res)
    sy = (Hf[iy + 1, ix] - Hf[iy - 1, ix]) / (2 * res)
    nrm = np.stack([-sx, -sy, np.ones(n)], 1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    # quaternion rotating +Z onto nrm, then a random yaw about the local Z
    w = 1.0 + nrm[:, 2]
    q1 = np.stack([w, -nrm[:, 1], nrm[:, 0], np.zeros(n)], 1)
    q1 /= np.linalg.norm(q1, axis=1, keepdims=True)
    yaw = rng.uniform(0, 2 * PI, n)
    q2 = np.stack([np.cos(yaw / 2), np.zeros(n), np.zeros(n), np.sin(yaw / 2)], 1)
    w1, x1, y1, z1 = q1.T
    w2, x2, y2, z2 = q2.T
    quat = np.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], 1)
    return loc, quat, nrm


# ----------------------------------------------------------------------------- build + render
def build_scene(args):
    rng = np.random.default_rng(args.seed)
    mat = millet_material()
    variants, shapes = [], []
    for i in range(N_WHOLE + N_BROKEN):
        v, f, attrs, half = grain_arrays(i, broken=(i >= N_WHOLE))
        variants.append(C.mesh_from_arrays('grain%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(half)
    for i in range(N_HULL):
        v, f, attrs, half = hull_arrays(i)
        variants.append(C.mesh_from_arrays('hull%02d' % i, v, f, attrs=attrs, material=mat))
        shapes.append(half)
    weights = [1.0] * N_WHOLE + [0.06] * N_BROKEN + [0.04] * N_HULL

    # 3. heap: near-spherical grains tumble freely (large roll / tilt, both faces up)
    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=3.6, coverage=0.74, weights=weights, seed=args.seed,
                       scale_range=(0.93, 1.07), tilt_deg=28, roll_deg=75, flip=True, candidates=8, sink=0.05,
                       rough=0.00030, grid_res=0.00006)
    C.instance_on_points('heap', variants, heap)
    C.dome_base(R_DOME - 0.0004, C.simple_material('base', (0.060, 0.026, 0.004), 0.9))

    # flour crumbs + bran flakes resting on / between the grains
    fl, br = debris_materials()
    dvars = [C.mesh_from_arrays('crumb%d' % i, *crumb_arrays(i), material=fl) for i in range(4)]
    dvars += [C.mesh_from_arrays('flake%d' % i, *crumb_arrays(10 + i, flat=True), material=br) for i in range(3)]
    area = (sol['patch'][1] - sol['patch'][0]) * (sol['patch'][3] - sol['patch'][2])
    n_c, n_f = int(area * 2.6e5), int(area * 4.5e4)
    loc_c, quat_c, nrm_c = scatter_debris(heap, n_c, rng, hollow=0.55)
    loc_f, quat_f, nrm_f = scatter_debris(heap, n_f, rng, hollow=0.85)
    s_c = rng.uniform(0.25, 1.0, n_c) ** 2 * 1.0 + 0.15           # x 0.1 mm radius
    s_f = rng.uniform(0.6, 1.8, n_f)
    loc_c = loc_c - nrm_c * (0.00003 + 0.00002 * s_c)[:, None]
    loc_f = loc_f - nrm_f * 0.00003
    C.instance_on_points('debris', dvars, loc=np.concatenate([loc_c, loc_f]), quat=np.concatenate([quat_c, quat_f]),
                         scale=np.concatenate([s_c, s_f]),
                         var=np.concatenate([rng.integers(0, 4, n_c), 4 + rng.integers(0, 3, n_f)]))

    # 4. camera on the real heap surface, deep but lens-like DOF, back-lit food lighting (warm sky)
    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.53, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=(1.0, 0.945, 0.84), key=0.80, fill=0.60, rim=0.90, world=0.8, key_size=1.0)
    return heap, info


def main():
    args = C.parse_args()
    if args.quality == 'final' and not args.res:
        args.q['res'] = FINAL_RES
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    build_scene(args)
    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or (os.path.join(C.PREVIEW_DIR, SHOT + '_comp.jpg') if args.quality == 'final'
                         else os.path.splitext(args.out)[0] + '_comp.jpg')
    if args.region:
        C.quick_comp(args.out, SHOT, comp, crop=args.region, text=False)
    else:
        C.quick_comp(args.out, SHOT, comp)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
