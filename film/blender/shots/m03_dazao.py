# -*- coding: utf-8 -*-
"""m03_dazao - dried red jujube (大枣, Ziziphus jujuba), kind = surface.

    python m03_dazao.py --quality draft   --out /tmp/x.png
    python m03_dazao.py --quality draft   --res 3840x2160 --spp 24 --region 0.35,0.62,0.65,0.92 --out crop.png
    python m03_dazao.py --quality final   --out film/renders/m03_dazao.png        # still + _depth.npy

Scene (true scale, metres): ONE big hero jujube (41 x 25 mm) lies across the frame; we look over its
back at 1.1x macro, the frame is ~30 mm wide, so the fruit's own top contour is the horizon arc and
its two ends leave the frame left and right.  Only the part of the skin the camera sees is tessellated
densely (~2.6 px cells), all shrivel folds / pinch ridges / fine crinkles are real displacement.
Smaller jujubes lie lower behind it (out of focus) and around it (bounce light, reflections).

Importable without rendering:   make_items(seed=0)  -> loose whole jujubes for the flat-lay film.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402

SHOT = 'm03_dazao'
MM = 1e-3
HERO = dict(seed=11, L=0.0415, Dm=0.0255, roll_deg=20.0, yaw_deg=-5.0)
FRAME_W = 0.031           # approx. visible width at the horizon (m) - only used to pick the mesh density
LENS = 85.0


# ----------------------------------------------------------------------------- 1. geometry
def _profile_curve(a, b, p, taper, cav_depth, cav_r, tip_depth, tip_r, n=6000):
    """Meridian of the fruit (x along the axis, r radius): oblong superellipse, slightly ovoid, with the
    sunken stem cavity (果梗洼) at -x and a small dimple at the apex.  Returns x, r, s (arc length 0-1), length."""
    th = np.linspace(0.0, math.pi, n)
    ct, st = np.cos(th), np.sin(th)
    e = 2.0 / p
    x = -a * np.sign(ct) * np.abs(ct) ** e
    r = b * np.abs(st) ** e
    r = r * (1.0 + taper * x / a)
    wst = C.smoothstep(0.3, -0.3, x / a)                          # 1 on the stem half
    x = x + cav_depth * np.exp(-(r / cav_r) ** 2) * wst - tip_depth * np.exp(-(r / tip_r) ** 2) * (1.0 - wst)
    d = np.hypot(np.diff(x), np.diff(r))
    s = np.concatenate([[0.0], np.cumsum(d)])
    return x, r, s / s[-1], float(s[-1])


def make_jujube(seed, L=None, Dm=None, nu=440, nv=300, window=None, cell=None, stem=True, shrivel=1.0):
    """One dried jujube as numpy arrays.  Long axis = X (stem end at -X), thinnest direction = Z, centred.

    window=None : uniform nu x nv grid (loose items, neighbours).
    window=dict(x=(x0, x1), ph=(centre, half_width)) + cell (m): the hero - a (s, phi) grid that is `cell`
                  fine inside the window (what the camera sees) and 0.25 mm coarse elsewhere.
    Returns (parts [(verts, faces, slot)], attrs {name: (N,)}, half_sizes (a, b, c))."""
    rng = np.random.default_rng(3000 + seed)
    L = L or rng.uniform(0.027, 0.036)
    Dm = Dm or L * rng.uniform(0.60, 0.74)
    a, b = 0.5 * L, 0.5 * Dm
    k = Dm / 0.022
    p = rng.uniform(2.3, 2.9)
    taper = rng.uniform(-0.10, 0.04)
    cav_depth, cav_r = rng.uniform(0.0016, 0.0028) * k, rng.uniform(0.0030, 0.0040) * k
    tip_depth, tip_r = rng.uniform(0.0002, 0.0007), rng.uniform(0.0012, 0.0020)
    px, pr, ps, plen = _profile_curve(a, b, p, taper, cav_depth, cav_r, tip_depth, tip_r)

    # ---- parameter grids
    if window is None:
        s = np.linspace(0.0, 1.0, nu)
        ph = np.linspace(0.0, 2 * math.pi, nv, endpoint=False)
    else:
        i0, i1 = int(np.argmin(px[:3000])), 3000 + int(np.argmax(px[3000:]))       # cavity rim .. apex rim
        sa = float(np.interp(window['x'][0], px[i0:i1], ps[i0:i1]))
        sb = float(np.interp(window['x'][1], px[i0:i1], ps[i0:i1]))
        coarse = 0.00025
        n0 = max(12, int(sa * plen / coarse))
        n1 = max(12, int((1 - sb) * plen / coarse))
        nd = max(40, int((sb - sa) * plen / cell))
        s = np.concatenate([np.linspace(0, sa, n0, endpoint=False), np.linspace(sa, sb, nd),
                            np.linspace(sb, 1.0, n1 + 1)[1:]])
        phc, half = window['ph']
        ndp = max(40, int(2 * half * b / cell))
        ncp = max(24, int((2 * math.pi - 2 * half) * b / coarse))
        ph = np.concatenate([phc + np.linspace(-half, half, ndp),
                             phc + half + (2 * math.pi - 2 * half) * np.arange(1, ncp + 1) / (ncp + 1.0)])
    nu, nv = len(s), len(ph)
    X0 = np.interp(s, ps, px)[:, None]
    R0 = np.maximum(np.interp(s, ps, pr), 2e-5)[:, None]
    PH = ph[None, :]

    # ---- base body: flattened, faintly lobed cross-section
    flat = rng.uniform(0.86, 0.97)
    e2, e3 = rng.uniform(0.0, 0.035), rng.uniform(0.0, 0.03)
    f2, f3 = rng.uniform(0, math.pi), rng.uniform(0, 2 * math.pi)
    lob = 1.0 + e2 * np.cos(2 * (PH - f2)) + e3 * np.cos(3 * (PH - f3))
    P0 = np.stack([X0 + 0 * PH, R0 * np.cos(PH) * lob, R0 * np.sin(PH) * lob * flat], -1)
    dPs = np.gradient(P0, s, axis=0)
    dPp = np.gradient(P0, ph, axis=1)
    N0 = np.cross(dPp, dPs)
    nl = np.linalg.norm(N0, axis=-1, keepdims=True)
    N0 = N0 / np.maximum(nl, 1e-30)
    pole = (R0 < 6e-5) + 0 * PH > 0
    N0[pole] = np.stack([np.where(X0 < 0, -1.0, 1.0) + 0 * PH, 0 * PH + 0 * X0, 0 * PH + 0 * X0], -1)[pole]

    # ---- shrivel height field (all lengths in mm).  Sampled in 3D on the smooth body -> seamless.
    q = P0 / MM
    sd = seed * 131 + 5
    qa = q * np.array([0.62, 1.0, 1.0])                               # folds prefer the long axis
    warp = 1.5 * np.stack([C.perlin3(qa / 6.0 + 7.1, sd + 1), C.perlin3(qa / 6.0 + 3.7, sd + 2),
                           C.perlin3(qa / 6.0 + 9.4, sd + 3)], -1)
    qw = qa + warp
    how = 0.52 + 0.48 * C.smoothstep(-0.28, 0.22, C.perlin3(q / 10.0 + 21.0, sd + 4))     # where it shrivelled most
    F1 = np.abs(C.perlin3(qw / 8.5, sd + 10)) ** 0.70                 # broad taut pillows, sharp V creases
    F2 = np.abs(C.perlin3(qw / 3.6 + 5.0, sd + 11)) ** 0.75          # secondary folds
    qb = q * np.array([0.85, 1.0, 1.0]) + 2.4 * warp                  # tertiary wrinkles: less stretched, patchy
    F2b = np.abs(C.perlin3(qb / 0.80 + 31.0, sd + 18)) ** 0.60
    tmask = 0.22 + 0.78 * C.smoothstep(-0.25, 0.25, C.perlin3(q / 2.6 + 40.0, sd + 19))
    F2b = 0.45 + (F2b - 0.45) * tmask        # tertiary wrinkles (everywhere, like aged skin)
    rg = (1.0 - np.abs(C.perlin3(qw / 5.2 + 9.0, sd + 12))) ** 10     # thin pinched ridges of excess skin
    rmask = C.smoothstep(-0.05, 0.30, C.perlin3(q / 8.0 + 3.0, sd + 13))
    lump = C.fbm3(q / 13.0 + 7.0, 2, seed=sd + 14)
    dent = C.smoothstep(0.28, 0.75, C.perlin3(q / 9.0 + 2.0, sd + 15))
    ridge = rg * rmask
    h = (0.9 * lump - 1.1 * dent
         + shrivel * (0.95 * how * (F1 - 0.45) + 0.30 * how * (F2 - 0.42)
                      + 0.06 * (0.35 + 0.65 * how) * (F2b - 0.45) + 0.05 * ridge))
    cav = how * ((1.0 - C.smoothstep(0.0, 0.46, F1)) * 0.95 + (1.0 - C.smoothstep(0.0, 0.36, F2)) * 0.50)
    cav = cav + (0.35 + 0.65 * how) * (1.0 - C.smoothstep(0.0, 0.30, F2b)) * 0.22
    cav = np.clip(cav, 0.0, 1.0)
    # fine crinkles: live on the flanks / in the creases, the pillow tops stay taut and glossy
    qf = q * np.array([0.42, 1.0, 1.0]) + 2.2 * warp
    F3 = np.abs(C.perlin3(qf / 0.72 + 13.0, sd + 16)) ** 0.6
    fmask = np.clip(0.42 + 0.8 * cav, 0.0, 1.0) * how
    h = h + shrivel * 0.05 * fmask * (F3 - 0.5)
    if cell is not None and cell < 0.00007:                           # only the dense hero mesh can carry these
        F4 = C.perlin3(qf / 0.27 + 17.0, sd + 17)
        h = h + 0.020 * F4 * (0.35 + 0.65 * fmask)
    env = 0.30 + 0.70 * C.smoothstep(0.0, 0.55, R0 / b)               # calmer at the two poles
    h = h * env
    P = P0 + N0 * (h * MM)[..., None]

    # ---- bent centre line
    u = X0 / a
    P[..., 1] += rng.normal(0, 0.035) * L * (1.0 - u * u)
    P[..., 2] += rng.normal(0, 0.02) * L * (1.0 - u * u)
    verts = P.reshape(-1, 3)
    faces = C.grid_faces(nu, nv, wrap_v=True)

    stem_half = (X0 < 0) + 0 * PH > 0
    rr = (R0 + 0 * PH)
    attrs = dict(cav=(cav * env).ravel(), ridge=ridge.ravel(),
                 scar=(np.exp(-(rr / (0.0011 * k)) ** 2) * stem_half).ravel(),
                 halo=(np.exp(-(rr / (cav_r * 0.9)) ** 2) * stem_half).ravel(),
                 tip=(np.exp(-(rr / 0.0006) ** 2) * (~stem_half)).ravel())
    parts = [(verts, faces, 0)]
    if stem:                                                          # short woody fruit stalk (果梗) in the cavity
        n = 26
        t = np.linspace(0, 1, n)[:, None]
        p0 = np.array([-a + cav_depth + 0.0006, 0.0, 0.0]) + P[0].mean(0) * [0, 1, 1]
        d = np.array([-1.0, rng.normal(0, 0.28), rng.normal(0.05, 0.22)])
        d /= np.linalg.norm(d)
        side = np.cross(d, [0.3, 0.2, 1.0])
        side /= np.linalg.norm(side)
        ln = cav_depth + rng.uniform(0.002, 0.007)
        path = p0 + d * ln * t + side * ln * 0.22 * rng.normal() * t ** 2
        path += 0.00012 * np.stack([C.perlin3(path / 0.0012 + i * 3.3, sd + 30 + i) for i in range(3)], -1)
        r = rng.uniform(0.00048, 0.00068) * k ** 0.5 * (1.15 - 0.35 * t[:, 0])
        r *= 1.0 + 0.10 * np.sin(t[:, 0] * rng.uniform(9, 16) + rng.uniform(0, 6))
        r[-4:] *= np.array([1.25, 1.45, 1.30, 0.25])                  # swollen abscission joint, closed end
        r[0] *= 1.5
        sv, sf = C.tube(path, r, nv=18)
        parts.append((sv, sf, 1))
        for kname in attrs:
            attrs[kname] = np.concatenate([attrs[kname], np.zeros(len(sv))])
    return parts, attrs, (a, b, b * flat)


# ----------------------------------------------------------------------------- 2. materials
def jujube_material(sss_method='BURLEY', name='jujube_skin'):
    """Dried jujube exocarp: deep wine-red, thin glossy cuticle (coat) over a satin base, almost black-red
    creases, paler translucent pinch ridges, tan lenticel specks, a little dust, patchy at 3 scales."""
    m = C.Mat(name, sss_method=sss_method)
    cav, ridge = m.attr('cav'), m.attr('ridge')
    P = m.per_instance_coords()
    n_big = m.noise(scale=95, detail=3, roughness=0.55, vector=P)           # ~1 cm ripeness / sun patches
    n_mid = m.noise(scale=520, detail=4, roughness=0.6, vector=P)           # ~2 mm mottle
    crest = m.mix((0.080, 0.0034, 0.0055), (0.165, 0.0072, 0.0075), m.map_range(n_mid, 0.30, 0.72))
    crest = m.mix(crest, (0.042, 0.0034, 0.0050), m.map_range(n_big, 0.53, 0.72, 0.0, 0.80, smooth=True))
    crest = m.mix(crest, (0.230, 0.0170, 0.0090), m.map_range(n_big, 0.42, 0.24, 0.0, 0.45, smooth=True))
    col = m.mix(crest, (0.012, 0.0012, 0.0024), m.map_range(cav, 0.10, 0.90, 0.0, 0.94, smooth=True))
    col = m.mix(col, (0.300, 0.0280, 0.0110), m.math('MULTIPLY', ridge, 0.35))
    col = m.jitter(col, hue=0.010, saturation=0.08, value=0.20)
    col = m.mix(col, (0.050, 0.0080, 0.0060), m.math('MULTIPLY', m.attr('dark', 'INSTANCER'), 0.7))
    # lenticels: sparse pale tan specks, 0.08-0.2 mm, fading in the creases
    vd = m.voronoi(scale=1150, feature='F1', vector=P, output='Distance')
    vc = m.node('ShaderNodeSeparateColor', {0: m.voronoi(scale=1150, feature='F1', vector=P, output='Color')})
    rad = m.map_range(vc.outputs[1], 0.0, 1.0, 0.05, 0.11)
    dot = m.map_range(vd, m.math('MULTIPLY', rad, 0.45), rad, 1.0, 0.0)
    dot = m.math('MULTIPLY', dot, m.math('GREATER_THAN', vc.outputs[0], 0.56))
    dot = m.math('MULTIPLY', dot, m.map_range(cav, 0.2, 0.7, 1.0, 0.15))
    col = m.mix(col, (0.420, 0.220, 0.100), m.math('MULTIPLY', dot, 0.85))
    # dust: tiny pale specks gathering in the creases
    dn = m.noise(scale=15000, detail=2, roughness=0.5, vector=P)
    dz = m.noise(scale=240, detail=2, roughness=0.5, vector=P)
    dust = m.math('MULTIPLY', m.map_range(dn, 0.70, 0.80),
                  m.math('MULTIPLY', m.map_range(dz, 0.40, 0.70), m.map_range(cav, 0.0, 0.8, 0.25, 1.0)))
    col = m.mix(col, (0.50, 0.40, 0.30), m.math('MULTIPLY', dust, 0.55))
    # stem cavity: dull, darker; corky tan scar where the stalk sits; tiny brown style point at the apex
    col = m.mix(col, (0.045, 0.010, 0.007), m.math('MULTIPLY', m.attr('halo'), 0.55))
    scar = m.map_range(m.attr('scar'), 0.25, 0.8, smooth=True)
    col = m.mix(col, (0.230, 0.115, 0.050), scar)
    tip = m.map_range(m.attr('tip'), 0.3, 0.8, smooth=True)
    col = m.mix(col, (0.150, 0.070, 0.035), tip)

    # roughness: satin base broken by noise, rubbed dull patches, matte creases / lenticels / scars
    rn = m.noise(scale=900, detail=4, roughness=0.65, vector=P)
    scuff = m.map_range(m.noise(scale=230, detail=3, roughness=0.6, vector=P), 0.54, 0.74, smooth=True)
    rough = m.math('ADD', m.map_range(rn, 0.28, 0.72, 0.30, 0.50), m.math('MULTIPLY', scuff, 0.13))
    crease = m.map_range(cav, 0.25, 0.90)
    rough = m.mixf(rough, 0.60, crease)
    rough = m.mixf(rough, 0.62, dot)
    rough = m.mixf(rough, 0.80, m.math('MAXIMUM', scar, m.math('MULTIPLY', dust, 0.8)))
    rough = m.math('ADD', rough, m.map_range(m.attr('inst_rand', 'INSTANCER'), 0, 1, -0.03, 0.07))
    # cuticle = thin clear coat, worn off in creases, on lenticels and where rubbed
    coat = m.math('MULTIPLY', m.map_range(crease, 0.0, 1.0, 0.70, 0.10),
                  m.math('MULTIPLY', m.map_range(dot, 0, 1, 1.0, 0.1), m.map_range(scuff, 0, 1, 1.0, 0.45)))
    coat = m.math('MULTIPLY', coat, m.map_range(m.math('MAXIMUM', scar, m.attr('halo')), 0, 1, 1.0, 0.2))
    coat_rough = m.map_range(rn, 0.25, 0.75, 0.025, 0.095)

    # micro relief (below the mesh resolution): stretched crinkle, orange-peel dimples, raised lenticels
    Ps = m.mapping(P, scale=(0.30, 1.0, 1.0))
    crinkle = m.noise(scale=2400, detail=3, roughness=0.65, vector=Ps)
    nrm = m.bump(crinkle, strength=m.map_range(cav, 0.0, 0.8, 0.22, 0.85), distance=0.00006)
    peel = m.noise(scale=7500, detail=2, roughness=0.55, vector=P)
    nrm = m.bump(peel, strength=0.55, distance=0.000016, normal=nrm)
    grain = m.noise(scale=21000, detail=2, roughness=0.6, vector=P)
    nrm = m.bump(m.math('ADD', dot, dust), strength=0.6, distance=0.000016, normal=nrm)
    cnrm = m.bump(crinkle, strength=m.map_range(cav, 0.0, 0.8, 0.10, 0.45), distance=0.00006)
    cnrm = m.bump(peel, strength=0.50, distance=0.000016, normal=cnrm)
    cnrm = m.bump(grain, strength=0.35, distance=0.000006, normal=cnrm)
    m.set(base_color=col, roughness=rough, ior=1.46, specular=0.36,
          sss=0.45, sss_radius=(1.0, 0.11, 0.06), sss_scale=0.0012, sss_anisotropy=0.0,
          coat=coat, coat_roughness=coat_rough, coat_ior=1.5, coat_normal=cnrm, normal=nrm)
    return m


def stem_material():
    m = C.Mat('jujube_stem')
    P = m.per_instance_coords()
    n = m.noise(scale=1800, detail=4, roughness=0.6, vector=m.mapping(P, scale=(0.15, 1, 1)))
    n2 = m.noise(scale=5000, detail=2, vector=P)
    m.set(base_color=m.ramp(n, [(0.28, (0.050, 0.026, 0.012)), (0.72, (0.200, 0.115, 0.055))]), roughness=0.72,
          specular=0.3, normal=m.bump(m.math('ADD', n, m.math('MULTIPLY', n2, 0.4)), 0.7, 0.00009))
    return m


# ----------------------------------------------------------------------------- loose items (flat-lay film)
_MATS = {}


def _materials():
    if _MATS.get('skin') is None or _MATS['skin'].mat.name not in C.bpy.data.materials:
        _MATS['skin'], _MATS['stem'] = jujube_material(), stem_material()
    return [_MATS['skin'], _MATS['stem']]


def _item_object(name, seed, nu=440, nv=300, stem=True, shrivel=1.0):
    """Whole jujube lying on its flat side: lowest point on z = 0, origin at the footprint centre."""
    parts, attrs, half = make_jujube(seed, nu=nu, nv=nv, stem=stem, shrivel=shrivel)
    v, f, fm = C.merge_meshes(parts)
    body = parts[0][0]
    c = 0.5 * (body.min(0) + body.max(0))
    v = v - np.array([c[0], c[1], body.min(0)[2]])
    ob = C.mesh_from_arrays(name, v, f, attrs=attrs, materials=_materials(), face_mat=fm)
    ext = body.max(0) - body.min(0)
    return ob, 0.5 * float(np.hypot(ext[0], ext[1]) * 0.92), 0.5 * float(ext[2])


def make_items(seed=0, n=6):
    """Loose whole dried jujubes as found in a pharmacy jar (some keep their short stalk).
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    objs, fr, hh = [], [], []
    for i in range(n):
        ob, r, h = _item_object('dazao_item_%d' % i, 40 + seed * 17 + i, stem=(i % 3 == 0),
                                shrivel=(0.8, 1.0, 1.15, 0.9, 1.05, 0.7)[i % 6])
        objs.append(ob); fr.append(r); hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='大枣')


# ----------------------------------------------------------------------------- camera fitted to the real contour
def _rot(axis, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    if axis == 'x':
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def fit_camera(pts, lens=LENS, apex=0.53, edge=0.69, elev_deg=7.0, aspect=16.0 / 9.0, cam_x=0.0):
    """Camera on the -Y side looking over the fruit (line of sight `elev_deg` below horizontal).  Distance and
    pitch are solved on the REAL displaced vertices: highest silhouette point of the central 20 % of the width
    at y = apex*H, mean silhouette height in the outer 4 % columns at y = edge*H.  Returns an info dict."""
    hw = 18.0 / lens
    hh = hw / aspect
    e = math.radians(elev_deg)
    T = np.array([cam_x, 0.0, pts[:, 2].max()])
    right = np.array([1.0, 0.0, 0.0])

    def project(d, delta):
        pos = T + d * np.array([0.0, -math.cos(e), math.sin(e)])
        ang = -e + delta
        fwd = np.array([0.0, math.cos(ang), math.sin(ang)])
        up = np.array([0.0, -math.sin(ang), math.cos(ang)])
        v = pts - pos
        z = v @ fwd
        return pos, fwd, up, (v @ right) / z / hw, 0.5 - (v @ up) / z / hh / 2.0, z

    def measure(d):
        delta = 0.0
        for _ in range(4):
            pos, fwd, up, x, y, z = project(d, delta)
            delta += (apex - y[np.abs(x) < 0.2].min()) * 2.0 * hh
        pos, fwd, up, x, y, z = project(d, delta)
        def col_top(x0):
            m = (x > x0) & (x < x0 + 0.01) & (z > 0)
            return float(y[m].min()) if m.any() else 2.0
        eL = np.median([col_top(-1 + 0.01 * i) for i in range(4)])
        eR = np.median([col_top(0.99 - 0.01 * i) for i in range(4)])
        return delta, eL, eR, (pos, fwd, up, x, y, z)

    lo, hi = 0.035, 0.30
    for _ in range(26):
        d = 0.5 * (lo + hi)
        delta, eL, eR, _ = measure(d)
        if 0.5 * (eL + eR) > edge:
            hi = d
        else:
            lo = d
    delta, eL, eR, (pos, fwd, up, x, y, z) = measure(d)
    inside = (np.abs(x) < 1.0) & (y < 1.0) & (y > 0.0)
    limb = float(z[np.argmin(np.where(np.abs(x) < 0.2, y, 9.0))])
    near = float(z[inside].min())
    print('[fit] d=%.1f mm  frame width at limb=%.1f mm  apex=%.3f edges=%.3f/%.3f  limb=%.1f near=%.1f mm' % (
        d * 1e3, 2 * hw * limb * 1e3, apex, eL, eR, limb * 1e3, near * 1e3))
    return dict(cam_pos=pos, cam_fwd=fwd, cam_up=up, D=d, limb_dist=limb, near_dist=near,
                focus_dist=limb - 0.42 * (limb - near), scale=2 * hw * limb, kind='surface', lens_mm=lens,
                target=tuple(T + np.array([0.0, -0.004, -0.003])), edges=(eL, eR))


def frame_xy(info, pts):
    """World points -> (x in [-1, 1], y = fraction of frame height from the top, depth) for the fitted camera."""
    hw = 18.0 / info['lens_mm']
    hh = hw * 9.0 / 16.0
    f, u, p = np.array(info['cam_fwd'], float), np.array(info['cam_up'], float), np.array(info['cam_pos'], float)
    v = pts - p
    z = v @ f
    return (v @ np.cross(f, u)) / z / hw, 0.5 - (v @ u) / z / hh / 2.0, z


def place_peek(ob, info, pos, euler_deg, top_frac):
    """Place a neighbour and slide it vertically until its highest visible point sits at top_frac of the frame."""
    from mathutils import Euler
    n = len(ob.data.vertices)
    co = np.empty(n * 3)
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)[::5]
    eul = Euler([math.radians(a) for a in euler_deg], 'XYZ')
    Rm = np.array(eul.to_matrix())
    pos = np.array(pos, float)
    hh = 18.0 / info['lens_mm'] * 9.0 / 16.0
    for _ in range(5):
        x, y, z = frame_xy(info, co @ Rm.T + pos)
        vis = np.abs(x) < 1.0
        i = int(np.argmin(np.where(vis, y, 9.0)))
        pos[2] += (y[i] - top_frac) * 2.0 * hh * z[i]
    x, y, z = frame_xy(info, co @ Rm.T + pos)
    print('[peek] %s top %.3f at x=%.2f  z0=%.1f mm' % (ob.name, y[np.abs(x) < 1].min(), x[i], pos[2] * 1e3))
    ob.rotation_euler = eul
    ob.location = pos


def make_camera(info, name='cam'):
    bpy = C.bpy
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.sensor_width, cd.sensor_fit = info['lens_mm'], C.SENSOR_MM, 'HORIZONTAL'
    cd.clip_start, cd.clip_end = info['near_dist'] * 0.2, info['D'] * 12
    cam = bpy.data.objects.new(name, cd)
    f, u = np.array(info['cam_fwd'], float), np.array(info['cam_up'], float)
    r = np.cross(f, u)
    p = info['cam_pos']
    cam.matrix_world = C.Matrix(((r[0], u[0], -f[0], p[0]), (r[1], u[1], -f[1], p[1]),
                                 (r[2], u[2], -f[2], p[2]), (0, 0, 0, 1)))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


# neighbours: (item seed, position of the footprint centre (m), yaw deg, roll deg, tilt deg)
NEIGHBOURS = [
    (51, (-0.0250, 0.0400, -0.0030), 24.0, 40.0, 0.0, 0.632),   # behind-left: peeks over the hero's left shoulder
    (52, (0.0300, 0.0460, -0.0040), -20.0, 200.0, 0.0, 0.655),  # behind-right: a little lower
    (53, (0.0020, 0.0700, -0.0200), 8.0, 90.0, 0.0),        # far behind, hidden: bounce only
    (54, (-0.0330, -0.0200, -0.0170), -60.0, 10.0, 0.0),    # front-left, below the frame: red bounce / reflection
    (55, (0.0340, -0.0240, -0.0180), 50.0, 120.0, 0.0),     # front-right, below the frame
]


# ----------------------------------------------------------------------------- build + render
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    W = args.q['res'][0]
    skin = jujube_material(sss_method='RANDOM_WALK', name='jujube_hero')
    mats = _materials()

    # 1. hero: dense only where the camera looks
    cell = max(2.6 * FRAME_W / W, 0.000026)
    roll, yaw = HERO['roll_deg'], HERO['yaw_deg']
    window = dict(x=(-0.0190, 0.0190), ph=(math.radians(118.0 - roll), math.radians(62.0)))
    parts, attrs, half = make_jujube(HERO['seed'] + args.seed - 1, L=HERO['L'], Dm=HERO['Dm'], window=window,
                                     cell=cell, stem=True)
    Rm = _rot('z', yaw) @ _rot('x', roll)
    v, f, fm = C.merge_meshes(parts)
    v = v @ Rm.T
    v[:, 2] -= v[:len(parts[0][0]), 2].min()                          # rests on z = 0
    hero = C.mesh_from_arrays('hero', v, f, attrs=attrs, materials=[skin, mats[1]], face_mat=fm)
    print('[hero] %d verts, cell %.3f mm' % (len(v), cell * 1e3))

    # 2. camera on the real contour
    body = v[:len(parts[0][0])]
    info = fit_camera(body[::max(1, len(body) // 400000)], apex=0.535, edge=0.69, elev_deg=7.0)
    cam = make_camera(info)
    focus, fstop = C.auto_dof(cam, info, near_blur_px=8.0, far_blur_px=3.0)
    print('[dof] focus %.1f mm  f/%.0f' % (focus * 1e3, fstop))

    # 3. neighbours (smaller, lower, around / behind the hero)
    for i, nb in enumerate(NEIGHBOURS):
        sd, pos, nyaw, nroll, ntilt = nb[:5]
        ob, r, h = _item_object('nb%d' % i, sd, nu=520, nv=360, stem=True)
        if len(nb) > 5:
            place_peek(ob, info, pos, (nroll, ntilt, nyaw), nb[5])
        else:
            ob.rotation_euler = (math.radians(nroll), math.radians(ntilt), math.radians(nyaw))
            ob.location = pos
    # ground far below (only bounce light): dark red-brown
    g = C.dome_base(0.6, C.simple_material('ground', (0.030, 0.008, 0.006), 0.9), center=(0, 0, -0.625))

    # 4. light: big soft key 3/4 back-left, cream-tinted fill from the camera side, low rim back-right
    C.studio_lights(info, tint=(1.0, 0.955, 0.88), key=1.05, fill=0.55, rim=1.6, world=0.5, key_size=0.5)

    # 5. render, framing check, judging composite
    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp, crop=args.region, text=not args.region)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
