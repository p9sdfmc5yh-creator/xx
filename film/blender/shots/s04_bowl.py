# -*- coding: utf-8 -*-
"""s04_bowl - 青花瓷碗·药膳汤 (blue-and-white porcelain bowl of amber herbal broth with goji).

    python s04_bowl.py --quality draft   --out /tmp/x.png
    python s04_bowl.py --quality draft   --res 4032x2268 --spp 48 --region 0.3,0.55,0.6,0.8   # final-density crop
    python s04_bowl.py --quality final   --out film/renders/s04_bowl.png      # 4032x2268 still + _depth.npy

Bespoke ('special') scene, same horizon layout as the disc shots: the FAR RIM of a 26 cm bowl is the
horizon arc; we look over the (out of frame) near edge into the bowl.

  1 bowl      lathe with a real lip, out-of-round + warped rim, underglaze cobalt 回纹 band painted
              stroke by stroke into a texture (numpy/cv2), glassy glaze with waviness / pinholes
  2 berries   8 plump rehydrated goji meshes (residual furrows, pale stem scar), wet SSS skin
  3 broth     one height-field sheet: the meniscus (wall + every floating berry) is the solution of
              the linearised Young-Laplace equation  h - lambda^2 lap(h) = 0 ; absorbing amber volume
  4 bubbles, sunk berries, camera (common.disc_camera), soft boxes placed for the glaze reflections
Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import bpy                                                                            # noqa: E402
from mathutils import Matrix, Vector                                                  # noqa: E402

SHOT = 's04_bowl'
NAME = '青花瓷碗·药膳汤'
TMP = os.path.join(C.SCRATCH, 'tmp_' + SHOT)
FINAL_RES = (4032, 2268)                 # 64-frame shot: film frame + 5 % for the push-in

# ---- scene constants (metres)
Z_BROTH = -0.0235                        # broth level below the top of the lip
LAMBDA = 0.0027                          # capillary length of water
H_WALL = 0.0019                          # meniscus rise on the glazed wall
V_RANGE = 0.022                          # arc length (from the lip top) covered by the band texture
N_SEG = 1440                             # lathe segments
LENS = 100.0
ELEV = 24.0
APEX, EDGE = 0.52, 0.70
N_GOJI = 8
FSTOP = 20.0
DX = 0.00025                             # broth sheet cell in the visible zone


# ============================================================================= 1. bowl geometry
def _rim_distort(seed=0):
    """Out-of-round radius factor e(theta) and rim warp dz(theta) (metres) of a hand-made bowl."""
    rng = np.random.default_rng(90 + seed)
    ks = np.array([2, 3, 4, 5, 7, 11, 17, 29])
    ar = np.array([11e-4, 5e-4, 3e-4, 2e-4, 1.2e-4, 0.6e-4, 0.4e-4, 0.25e-4]) * rng.uniform(0.6, 1.2, 8)
    az = np.array([2.2e-4, 1.2e-4, 0.8e-4, 0.5e-4, 0.3e-4, 0.2e-4, 0.12e-4, 0.08e-4]) * rng.uniform(0.6, 1.2, 8)
    pr, pz = rng.uniform(0, 2 * math.pi, 8), rng.uniform(0, 2 * math.pi, 8)

    def e(th):
        th = np.asarray(th, float)[..., None]
        return (ar * np.cos(ks * th + pr)).sum(-1)

    def dz(th):
        th = np.asarray(th, float)[..., None]
        return (az * np.cos(ks * th + pz)).sum(-1)
    return e, dz


def bowl_profile():
    """Closed half profile of the bowl, from the inner centre up the inner wall, over the lip and
    down the outer wall.  Returns dict(r, z, s (arc length from the lip top, >= 0 on both sides),
    inner (bool), r_in(z) callable for the inner wall, z_bottom(r) callable, r_top)."""
    from scipy.interpolate import CubicSpline
    ctrl = np.array([[0.0000, -0.0850], [0.0270, -0.0846], [0.0500, -0.0822], [0.0700, -0.0750],
                     [0.0880, -0.0620], [0.1035, -0.0450], [0.1148, -0.0270], [0.1207, -0.0130],
                     [0.1248, -0.0060], [0.1302, -0.0020]])
    u = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(ctrl, axis=0), axis=1))])
    cs = CubicSpline(u, ctrl, bc_type=((1, (1.0, 0.0)), (1, (0.80, 0.60))))   # everted lip (撇口)
    uu = np.linspace(0, u[-1], 6000)
    P = cs(uu)
    P[:, 0] = np.maximum(P[:, 0], 0.0)
    cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    Ltot = cum[-1]
    # resample: 0.3 mm near the lip (visible wall), 1.2 mm on the submerged part
    sd = [0.0]
    while sd[-1] < Ltot - 0.0006:
        d = sd[-1]
        sd.append(d + (0.0003 if d < 0.040 else 0.0012))
    sd = np.minimum(np.array(sd), Ltot - 0.0005)          # distance from the lip end, stop short of r = 0
    t = Ltot - sd
    Pin = np.stack([np.interp(t, cum, P[:, 0]), np.interp(t, cum, P[:, 1])], 1)          # lip -> centre
    T = np.gradient(Pin, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    T = -T                                                 # towards the lip
    Nw = np.stack([T[:, 1], -T[:, 0]], 1)                  # outward (into the wall)
    thick = 0.0029 + 0.0024 * C.smoothstep(0.0, 0.035, sd) + 0.0012 * C.smoothstep(0.05, 0.12, sd)
    Pout = Pin + Nw * thick[:, None]
    # lip: slightly pointed half ellipse between Pin[0] and Pout[0]
    t0 = thick[0]
    cen = Pin[0] + 0.5 * t0 * Nw[0]
    phi = np.linspace(0, math.pi, 41)[1:-1]
    lip = cen + 0.5 * t0 * (-np.cos(phi)[:, None] * Nw[0] + 1.18 * np.sin(phi)[:, None] * T[0])
    prof = np.concatenate([Pin[::-1], lip, Pout[::2]], 0)
    inner = np.zeros(len(prof), bool)
    inner[:len(Pin)] = True
    ztop = prof[:, 1].max()
    itop = int(prof[:, 1].argmax())
    prof[:, 1] -= ztop
    seg = np.linalg.norm(np.diff(prof, axis=0), axis=1)
    c2 = np.concatenate([[0], np.cumsum(seg)])
    s = np.abs(c2 - c2[itop])
    inner[:itop + 1] = True
    inner[itop + 1:] = False
    zi, ri = Pin[::-1, 1] - ztop, Pin[::-1, 0]             # increasing z

    def r_in(z):
        return np.interp(z, zi, ri)

    def z_bottom(r):
        return np.interp(r, ri, zi)
    return dict(r=prof[:, 0], z=prof[:, 1], s=s, inner=inner, r_in=r_in, z_bottom=z_bottom,
                r_top=float(prof[itop, 0]), depth=float(-prof[:, 1].min()))


def build_bowl(material, seed=0):
    pf = bowl_profile()
    e, dz = _rim_distort(seed)
    nu, nv = len(pf['r']), N_SEG
    th = -0.5 * math.pi + 2 * math.pi * np.arange(nv) / nv          # seam on the near side (-Y)
    hfrac = np.clip(1.0 + pf['z'] / pf['depth'], 0, 1)[:, None]     # 1 at the rim, 0 at the bottom
    r = pf['r'][:, None] * (1.0 + e(th)[None, :] * hfrac)
    z = pf['z'][:, None] + dz(th)[None, :] * hfrac ** 2
    v = np.stack([r * np.cos(th)[None, :], r * np.sin(th)[None, :], z], -1).reshape(-1, 3)
    uu = np.repeat((3.0 * np.arange(nv) / nv)[None, :], nu, 0)
    vv = np.repeat((pf['s'] / V_RANGE)[:, None], nv, 1)
    uv = np.stack([uu, vv], -1).reshape(-1, 2)
    faces = C.grid_faces(nu, nv, wrap_v=True)[:, ::-1]              # normals out of the porcelain
    inner = np.repeat(pf['inner'][:, None].astype(np.float32), nv, 1).ravel()
    ob = C.mesh_from_arrays('bowl', v, faces, uvs=uv, attrs={'inner': inner}, material=material)
    return ob, pf, e, dz


# ============================================================================= 1b. cobalt texture
def make_cobalt_texture(path, seed=0, W=8192, H=704, tile_mm=268.0):
    """Hand-painted underglaze cobalt band (density 0..1, 8-bit grey): two thin lines, a 回纹
    (meander) frieze of 24 square spirals painted stroke by stroke with a loaded brush, two more
    lines.  Brush load decays along each stroke, pools at corners and stroke starts, the pigment is
    grainy ('heaped and piled' specks) and bleeds softly into the glaze."""
    import cv2
    from scipy.ndimage import gaussian_filter
    rng = np.random.default_rng(700 + seed)
    vr = V_RANGE * 1000.0
    sx, sy = W / tile_mm, H / vr
    sm = 0.5 * (sx + sy)
    mask = np.zeros((H, W), np.uint8)
    load = np.zeros((H, W), np.uint8)
    SH, F = 4, 16

    def sn(n, corr):
        k = max(2, int(n / corr) + 3)
        return np.interp(np.linspace(0, k - 1, n), np.arange(k), rng.normal(size=k))

    def stamp(x, y, rad, ld):
        for xo in ((0.0, tile_mm, -tile_mm) if (x < 3 or x > tile_mm - 3) else (0.0,)):
            c = (int(round((x + xo) * sx * F)), int(round(y * sy * F)))
            cv2.circle(mask, c, max(1, int(round(rad * sm * F))), 255, -1, cv2.LINE_AA, SH)
            cv2.circle(load, c, int(round((rad * sm + 1.5) * F)), int(np.clip(ld, 0.05, 1.6) / 1.6 * 255), -1,
                       cv2.LINE_8, SH)

    def stroke(pts, w0, ld0, fade=0.35, wob=0.05, pool=0.35):
        pts = np.asarray(pts, float)
        seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        cum = np.concatenate([[0], np.cumsum(seg)])
        Lt = cum[-1]
        n = max(4, int(Lt / 0.05))
        t = np.linspace(0, Lt, n)
        x = np.interp(t, cum, pts[:, 0]) + wob * sn(n, 30)
        y = np.interp(t, cum, pts[:, 1]) + wob * sn(n, 30)
        w = w0 * (1 + 0.13 * sn(n, 28)) * (1 + 0.22 * np.exp(-t / 0.5)) * np.clip((Lt - t) / 0.7, 0.5, 1.0)
        ld = ld0 * (1.12 - fade * t / Lt) * (1 + 0.12 * sn(n, 45)) + pool * np.exp(-t / 0.6)
        # the brush dwells at every corner: slightly wider, darker
        for cdist in cum[1:-1]:
            g = np.exp(-((t - cdist) / 0.45) ** 2)
            w = w * (1 + 0.16 * g)
            ld = ld + 0.28 * g
        for i in range(n):
            stamp(x[i], y[i], 0.5 * w[i], ld[i])

    # --- circumferential lines (brush held against the turning bowl, reloaded every ~10 cm)
    for yc, w0 in ((3.9, 0.62), (5.15, 0.42), (17.75, 0.45), (19.05, 0.70)):
        x = -rng.uniform(0, 60)
        drift = 0.10 * sn(400, 60)
        while x < tile_mm:
            Ls = rng.uniform(70, 120)
            xs = np.linspace(x, x + Ls, 24)
            ys = yc + np.interp(xs % tile_mm, np.linspace(0, tile_mm, 400), drift) + rng.normal(0, 0.03)
            stroke(np.stack([xs, ys], 1), w0 * rng.uniform(0.9, 1.1), rng.uniform(0.75, 1.0), fade=0.45,
                   wob=0.02, pool=0.2)
            x += Ls - rng.uniform(1.0, 3.0)

    # --- 回纹 units: square spirals, alternately mirrored (正反回纹)
    n_units = 24
    pitch = tile_mm / n_units
    Wu, Hu, p = 9.5, 9.3, 1.92
    y_top = 6.95
    for k in range(n_units):
        pts = [(0, Hu), (0, 0), (Wu, 0), (Wu, Hu), (p, Hu), (p, p), (Wu - p, p), (Wu - p, Hu - p),
               (2 * p, Hu - p), (2 * p, 2 * p), (Wu - 2 * p, 2 * p), (Wu - 2 * p, Hu - 2 * p - 0.5)]
        pts = np.array(pts, float)
        if k % 2:
            pts[:, 0] = Wu - pts[:, 0]
        pts += rng.normal(0, 0.14, pts.shape)                               # hand jitter of every corner
        ang = rng.normal(0, 0.014)
        ca, sa = math.cos(ang), math.sin(ang)
        c0 = np.array([Wu / 2, Hu / 2])
        pts = (pts - c0) @ np.array([[ca, sa], [-sa, ca]]) * rng.uniform(0.96, 1.03) + c0
        pts[:, 0] += k * pitch + 0.5 * (pitch - Wu) + rng.normal(0, 0.16)
        pts[:, 1] += y_top + rng.normal(0, 0.14)
        w0 = rng.uniform(0.84, 1.04)
        ld0 = rng.uniform(0.72, 1.05)
        # painted as 2-3 separate strokes (the brush is lifted and reloaded)
        cut = [0, int(rng.integers(3, 6)), int(rng.integers(7, 9)), len(pts) - 1]
        for a, b in zip(cut[:-1], cut[1:]):
            stroke(pts[a:b + 1], w0 * rng.uniform(0.93, 1.07), ld0 * rng.uniform(0.85, 1.12))

    m = mask.astype(np.float32) / 255.0
    ld = load.astype(np.float32) / 255.0 * 1.6

    def noise(sig):
        n = gaussian_filter(rng.normal(size=(H, W)).astype(np.float32), sig, mode='wrap')
        return n / n.std()
    n1, n2, n3 = noise(22), noise(3.2), noise(0.9)
    D = m * ld * np.clip(1 + 0.24 * n1 + 0.11 * n2 + 0.06 * n3, 0.3, 2.0)
    spk = ((n2 > 2.0) & (m > 0.6)).astype(np.float32)                       # iron-rust / heaped specks
    D += 0.55 * gaussian_filter(spk, 1.3)
    D = 0.70 * gaussian_filter(D, 1.25) + 0.30 * gaussian_filter(D, 3.6)    # bleed under the glaze
    D += 0.05 * gaussian_filter(m, 9.0)                                     # faint blue halo
    D = np.clip(D / 1.6, 0, 1)
    D[:3] = 0
    D[-3:] = 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, (D[::-1] * 255 + 0.5).astype(np.uint8))               # v = 0 (lip) is the bottom row
    return path


def porcelain_material(seed=0):
    tex_path = os.path.join(TMP, 'cobalt_band_v2_%d.png' % seed)
    if not os.path.exists(tex_path):
        make_cobalt_texture(tex_path, seed)
    img = bpy.data.images.load(tex_path)
    img.colorspace_settings.name = 'Non-Color'
    m = C.Mat('porcelain', sss_method='BURLEY')
    uv = m.coords('UV')
    oc = m.coords('Object')
    sep = m.node('ShaderNodeSeparateXYZ', {0: uv})
    v = sep.outputs[1]
    tex = m.node('ShaderNodeTexImage', {'Vector': uv}, image=img, extension='REPEAT', interpolation='Cubic')
    inband = m.math('MULTIPLY', m.math('GREATER_THAN', v, 0.004), m.math('LESS_THAN', v, 0.996))
    D = m.math('MULTIPLY', tex.outputs['Color'], inband)
    # double ring around the well of the bowl (seen through the broth)
    so = m.node('ShaderNodeSeparateXYZ', {0: oc})
    rad = m.math('SQRT', m.math('ADD', m.math('POWER', so.outputs[0], 2.0), m.math('POWER', so.outputs[1], 2.0)))
    rad = m.math('ADD', rad, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(scale=40, detail=1), 0.5), 0.0007))
    ring = None
    for rc, hw in ((0.0600, 0.00045), (0.0622, 0.00032)):
        d = m.math('ABSOLUTE', m.math('SUBTRACT', rad, rc))
        g = m.map_range(d, hw * 0.55, hw * 1.5, 1.0, 0.0, smooth=True)
        ring = g if ring is None else m.math('MAXIMUM', ring, g)
    ring = m.math('MULTIPLY', ring, m.map_range(m.noise(scale=260, detail=2), 0.25, 0.75, 0.25, 0.62))
    ring = m.math('MULTIPLY', ring, m.attr('inner'))
    D = m.math('MAXIMUM', D, ring)
    # pigment grain modulates the density a little more at shading time
    Dn = m.math('MULTIPLY', D, m.map_range(m.noise(scale=5200, detail=2), 0.2, 0.8, 0.86, 1.14))
    cobalt = m.ramp(Dn, [(0.05, (0.36, 0.47, 0.70)), (0.22, (0.105, 0.20, 0.52)), (0.42, (0.030, 0.075, 0.33)),
                         (0.62, (0.012, 0.028, 0.16)), (0.90, (0.006, 0.010, 0.050))])
    a = m.map_range(Dn, 0.015, 0.20, 0.0, 1.0, smooth=True)
    # body: slightly bluish-white glaze, a touch of warm/cool drift, thin warmer glaze on the lip
    drift = m.noise(scale=22, detail=2)
    body = m.mix((0.795, 0.835, 0.845), (0.815, 0.835, 0.825), drift)
    lipw = m.map_range(v, 0.02, 0.10, 0.55, 0.0, smooth=True)
    body = m.mix(body, (0.80, 0.765, 0.69), lipw)
    col = m.mix(body, cobalt, a)
    # pinholes (棕眼) and tiny iron specks: sparse dark dots
    vd = m.node('ShaderNodeTexVoronoi', {'Scale': 300.0, 'Randomness': 1.0, 'Vector': oc}, feature='F1')
    cell = m.node('ShaderNodeSeparateColor', {0: vd.outputs['Color']})
    spot_on = m.math('GREATER_THAN', cell.outputs[0], 0.90)
    spot_r = m.map_range(cell.outputs[1], 0, 1, 0.022, 0.065)
    spot = m.math('MULTIPLY', spot_on, m.map_range(m.math('DIVIDE', vd.outputs['Distance'], spot_r), 0.5, 1.0, 1.0, 0.0,
                                                    smooth=True))
    col = m.mix(col, (0.16, 0.10, 0.06), m.math('MULTIPLY', spot, 0.75))
    # glaze surface: slow waviness + faint orange peel + pinhole dents
    w1 = m.noise(scale=95, detail=2, roughness=0.45)
    w2 = m.noise(scale=420, detail=2)
    hgt = m.math('ADD', w1, m.math('MULTIPLY', w2, 0.10))
    nrm = m.bump(hgt, strength=1.0, distance=0.00006)
    nrm = m.bump(spot, strength=0.6, distance=0.00003, normal=nrm, invert=True)
    rough = m.map_range(m.noise(scale=160, detail=3), 0.3, 0.75, 0.022, 0.060)
    m.set(base_color=col, roughness=rough, ior=1.52, normal=nrm)       # (Burley SSS on the body: 2x cost, invisible)
    return m


# ============================================================================= 2. rehydrated goji
def make_soaked_goji(seed, nu=150, nv=92):
    """One plump REHYDRATED goji berry (numpy).  Long axis X (stem end at -X).  Skin taut again
    but with residual shallow lengthwise furrows that die out, soft seed bumps, pale stem scar.
    Returns (verts, faces, attrs, (L, D))."""
    rng = np.random.default_rng(4000 + seed)
    L = rng.uniform(0.0135, 0.0188)
    Dm = rng.uniform(0.0069, 0.0090)
    flat = rng.uniform(0.86, 0.97)
    s = np.linspace(0.0, 1.0, nu)[:, None]
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)[None, :]
    S, PH = np.broadcast_arrays(s, ph)
    k = rng.uniform(0.88, 1.12)
    e = 0.40 + 0.15 * s
    sc = np.clip(s, 1e-4, 1 - 1e-4)
    prof = np.sin(math.pi * sc ** k) ** e
    prof = prof * (1 + 0.07 * np.sin(2 * math.pi * (s + rng.uniform())) + 0.04 * np.sin(4 * math.pi * (s + rng.uniform())))             # uneven belly
    R0 = 0.5 * Dm * prof
    X = (S - 0.5) * L
    # position on the undeformed surface (for noise lookups)
    q = np.stack([X, R0 * np.cos(PH), R0 * np.sin(PH)], -1)
    wr = rng.uniform(0.60, 1.0)                                                      # how wrinkled this one stayed
    qq = np.stack([q[..., 0] * 110.0, np.cos(PH) * 1.7, np.sin(PH) * 1.7], -1)
    warp = C.fbm3(q * 160.0, octaves=2, seed=seed * 7 + 1)[..., None] * 0.55
    bil = np.abs(C.perlin3(qq * np.array([1.0, 1.55, 1.55]) + warp, seed=seed * 7 + 2)) ** 0.6
    bil2 = np.abs(C.perlin3(qq * np.array([2.3, 3.6, 3.6]) + warp * 1.5 + 9.1, seed=seed * 7 + 3)) ** 0.6
    how = C.smoothstep(-0.25, 0.35, C.fbm3(q * 95.0 + 3.3, octaves=2, seed=seed * 7 + 4))
    env = (0.30 + 0.70 * (1 - S) ** 1.3) * prof ** 0.6 * wr * (0.25 + 0.75 * how)
    crease = np.clip(1.0 - bil / 0.55, 0, 1) ** 1.6                                  # narrow valleys
    crease2 = np.clip(1.0 - bil2 / 0.45, 0, 1) ** 1.6
    disp = -(crease * 0.00088 + crease2 * 0.00028) * env
    lumps = C.fbm3(q * 300.0 + 1.7, octaves=2, seed=seed * 7 + 5) * 0.00034 * prof ** 0.5   # seeds under the skin
    dent = -0.0005 * rng.uniform(0, 1) * np.exp(-(((S - rng.uniform(0.3, 0.7)) / 0.16) ** 2 +
                                                 ((np.angle(np.exp(1j * (PH - rng.uniform(0, 6.28))))) / 0.7) ** 2))
    R = np.maximum(R0 + disp + lumps + dent * prof, 2e-5)
    bend = rng.uniform(-0.0011, 0.0011)
    Y = R * np.cos(PH) + bend * (1 - (2 * S - 1) ** 2)
    Z = R * np.sin(PH) * flat
    # stem end: small dimple with the scar; tip: tiny nipple
    Xo = X + 0.00035 * np.exp(-(S / 0.022) ** 2) + 0.00030 * np.exp(-((1 - S) / 0.030) ** 2)
    v = np.stack([Xo, Y, Z], -1).reshape(-1, 3)
    scar = np.exp(-(R0 / rng.uniform(0.00045, 0.00070)) ** 2) * (S < 0.5)
    attrs = dict(scar=scar.ravel(), furrow=np.clip((crease * 0.8 + crease2 * 0.4) * env / 0.6, 0, 1).ravel(),
                 ax=S.ravel().copy())
    return v, C.grid_faces(nu, nv, wrap_v=True), attrs, (L, Dm)


def soaked_goji_material():
    """Rehydrated goji skin: deep orange-red, patchy, seeds glowing through, darker in the residual
    furrows; a thin UNEVEN water film (coat) whose highlight is broken by the skin relief - a uniform
    mirror coat over a smooth body is what reads as plastic."""
    m = C.Mat('goji_wet', sss_method='RANDOM_WALK')
    oc = m.per_instance_coords('Object', spread=3.0)
    fur = m.attr('furrow')
    n_patch = m.noise(scale=150, detail=2, vector=oc)
    n_fine = m.noise(scale=1500, detail=3, vector=oc)
    col = m.ramp(n_patch, [(0.22, (0.115, 0.0030, 0.0020)), (0.50, (0.190, 0.0080, 0.0026)), (0.80, (0.265, 0.024, 0.0036))])
    vor = m.voronoi(scale=560, vector=oc, feature='SMOOTH_F1', smoothness=0.4)
    seedm = m.map_range(vor, 0.10, 0.50, 1.0, 0.0, smooth=True)                 # seeds showing through
    col = m.mix(col, (0.34, 0.066, 0.008), m.math('MULTIPLY', seedm, 0.20))
    col = m.mix(col, (0.30, 0.046, 0.006), m.map_range(m.attr('ax'), 0.02, 0.26, 0.42, 0.0, smooth=True))   # paler shoulder
    col = m.mix(col, (0.055, 0.0016, 0.0016), m.math('MULTIPLY', fur, 0.80))
    col = m.jitter(col, hue=0.014, saturation=0.08, value=0.30)
    dark = m.map_range(m.math('FRACT', m.math('MULTIPLY', m.obj_random(), 13.37)), 0.80, 1.0, 0.0, 0.55)   # a few older, browner
    col = m.mix(col, (0.060, 0.007, 0.004), dark)
    col = m.mix(col, (0.74, 0.60, 0.36), m.map_range(m.attr('scar'), 0.25, 0.8, 0.0, 0.95, smooth=True))
    rough = m.math('ADD', m.map_range(n_fine, 0.3, 0.7, 0.30, 0.52), m.math('MULTIPLY', fur, 0.22))
    stretch = m.mapping(oc, scale=(0.22, 1.0, 1.0))
    h1 = m.noise(scale=760, detail=3, vector=stretch)
    nrm = m.bump(h1, strength=0.75, distance=0.00026)
    nrm = m.bump(m.noise(scale=2600, detail=3, vector=stretch), strength=0.7, distance=0.00010, normal=nrm)
    nrm = m.bump(m.noise(scale=9000, detail=2, vector=oc), strength=0.4, distance=0.00002, normal=nrm)
    wn = m.noise(scale=240, detail=2, vector=oc)
    wet = m.math('MULTIPLY', m.map_range(wn, 0.32, 0.68, 0.05, 0.36, smooth=True),
                 m.math('SUBTRACT', 1.0, m.math('MULTIPLY', fur, 0.5)))                     # uneven water film
    cn = m.bump(h1, strength=0.75, distance=0.00020)                                        # the film follows the skin, softened
    cn = m.bump(m.noise(scale=2600, detail=3, vector=stretch), strength=0.5, distance=0.00007, normal=cn)
    m.set(base_color=col, roughness=rough, sss=0.65, sss_radius=(1.0, 0.13, 0.05), sss_scale=0.0014,
          sss_anisotropy=0.3, ior=1.42, specular=0.30, coat=wet, coat_ior=1.34, normal=nrm,
          coat_roughness=m.map_range(n_fine, 0.3, 0.7, 0.04, 0.11))
    m.bsdf.inputs['Coat Normal'].default_value = (0, 0, 0)
    m.nt.links.new(cn, m.bsdf.inputs['Coat Normal'])
    return m


# ============================================================================= 3. broth
def broth_material():
    mat = bpy.data.materials.new('broth')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    glass = nt.nodes.new('ShaderNodeBsdfGlass')
    glass.inputs['Roughness'].default_value = 0.0
    glass.inputs['IOR'].default_value = 1.336
    glass.inputs['Color'].default_value = (1, 1, 1, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (0.95, 0.95, 0.95, 1)
    lp = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mix.inputs[0])
    nt.links.new(glass.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    vol = nt.nodes.new('ShaderNodeVolumeAbsorption')
    # amber-brown herbal broth: transmittance over 5 cm ~ (0.66, 0.36, 0.085)
    vol.inputs['Color'].default_value = (0.849, 0.629, 0.104, 1)
    vol.inputs['Density'].default_value = 100.0
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return mat


def bubble_material():
    mat = bpy.data.materials.new('bubble')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    gl = nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.0
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.45
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fr.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return mat


def _seg_dist(p1, q1, p2, q2):
    """Distance between 2-D segments p1q1 and p2q2."""
    def pt_seg(p, a, b):
        ab = b - a
        t = np.clip(np.dot(p - a, ab) / max(np.dot(ab, ab), 1e-12), 0, 1)
        return np.linalg.norm(p - (a + t * ab))

    def ccw(a, b, c):
        return (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0])
    if (ccw(p1, q1, p2) * ccw(p1, q1, q2) < 0) and (ccw(p2, q2, p1) * ccw(p2, q2, q1) < 0):
        return 0.0
    return min(pt_seg(p1, p2, q2), pt_seg(q1, p2, q2), pt_seg(p2, p1, q1), pt_seg(q2, p1, q1))


def arrange_floaters(dims, frame_to_plane, r_wall, rng):
    """Composition of the floating berries, designed in FRAME coordinates (fx, fy) and mapped to
    the broth plane.  Berries drift into small rafts (Cheerios effect) and against the wall.
    Returns list of dict(var, xy, yaw, pitch, roll, sink, scale)."""
    rafts = [((0.345, 0.865), 8, 0.4), ((0.685, 0.835), 5, -0.5), ((0.530, 0.775), 3, 0.1),
             ((0.130, 0.905), 2, 0.9), ((0.880, 0.925), 2, -0.2), ((0.560, 0.955), 1, 0.6),
             ((0.240, 0.800), 1, 1.2), ((0.455, 1.010), 2, -0.8), ((0.800, 1.020), 1, 0.3),
             ((0.050, 1.010), 1, 0.2), ((0.930, 0.800), 1, 1.0), ((0.730, 0.955), 1, 1.9),
             ((0.300, 1.040), 1, 0.0), ((0.640, 1.060), 2, 0.5)]
    placed = []

    def capsule(it):
        L, Dm = dims[it['var']]
        L, Dm = L * it['scale'], Dm * it['scale']
        a = max(0.5 * L * math.cos(it['pitch']) - 0.42 * Dm, 0.0005)
        d = np.array([math.cos(it['yaw']), math.sin(it['yaw'])])
        return it['xy'] - a * d, it['xy'] + a * d, 0.46 * Dm

    def free(it, gap):
        p, q, r = capsule(it)
        if max(np.linalg.norm(p), np.linalg.norm(q)) + r > r_wall - 0.0004:
            return False
        for o in placed:
            p2, q2, r2 = capsule(o)
            if _seg_dist(p, q, p2, q2) < r + r2 + gap:
                return False
        return True

    for (fx, fy), n, yaw0 in rafts:
        c = np.array(frame_to_plane(fx, fy))
        members = []
        for i in range(n):
            for attempt in range(60):
                it = dict(var=int(rng.integers(0, len(dims))), scale=float(rng.uniform(0.9, 1.1)),
                          yaw=yaw0 + rng.normal(0, 0.55) + (math.pi if rng.random() < 0.5 else 0.0),
                          pitch=float(rng.normal(0, 0.07)), roll=float(rng.uniform(0, 2 * math.pi)),
                          sink=float(rng.uniform(0.10, 0.30)))
                if rng.random() < 0.12:                                    # a few float stem-end down
                    it['pitch'] = float(rng.uniform(0.35, 0.8) * rng.choice([-1, 1]))
                    it['sink'] = float(rng.uniform(0.35, 0.6))
                ang = rng.uniform(0, 2 * math.pi)
                dirv = np.array([math.cos(ang), math.sin(ang) * 0.8])
                cen = c if not members else np.mean([m_['xy'] for m_ in members], axis=0)
                ok = False
                for dist in np.arange(0.0, 0.03, 0.0004):
                    it['xy'] = cen + dirv * dist
                    if free(it, rng.uniform(0.0001, 0.0006)):
                        ok = True
                        break
                if ok:
                    placed.append(it)
                    members.append(it)
                    break
    return placed


def solve_meniscus(fixed, val, dx, lam):
    """Linearised Young-Laplace  h - lam^2 lap(h) = 0  on a raster, Dirichlet where `fixed`."""
    import scipy.sparse as sp
    import scipy.sparse.linalg as spl
    ny, nx = fixed.shape
    a = (lam / dx) ** 2
    free = ~fixed
    n = int(free.sum())
    idx = -np.ones((ny, nx), np.int64)
    idx[free] = np.arange(n)
    diag = np.full(n, 1.0)
    b = np.zeros(n)
    rows, cols = [], []
    for sl_a, sl_b in (((slice(None), slice(0, nx - 1)), (slice(None), slice(1, nx))),
                       ((slice(0, ny - 1), slice(None)), (slice(1, ny), slice(None)))):
        ia, ib = idx[sl_a].ravel(), idx[sl_b].ravel()
        va, vb = val[sl_a].ravel(), val[sl_b].ravel()
        both = (ia >= 0) & (ib >= 0)
        rows += [ia[both], ib[both]]
        cols += [ib[both], ia[both]]
        np.add.at(diag, ia[both], a)
        np.add.at(diag, ib[both], a)
        ma = (ia >= 0) & (ib < 0)
        np.add.at(diag, ia[ma], a)
        np.add.at(b, ia[ma], a * vb[ma])
        mb = (ib >= 0) & (ia < 0)
        np.add.at(diag, ib[mb], a)
        np.add.at(b, ib[mb], a * va[mb])
    rows, cols = np.concatenate(rows), np.concatenate(cols)
    A = sp.csr_matrix((np.full(len(rows), -a), (rows, cols)), shape=(n, n)) + sp.diags(diag)
    Mi = sp.diags(1.0 / diag)
    try:
        x, info = spl.cg(A, b, rtol=1e-6, maxiter=3000, M=Mi)
    except TypeError:
        x, info = spl.cg(A, b, tol=1e-6, maxiter=3000, M=Mi)
    h = val.copy()
    h[free] = x
    return h


def build_broth(material, pf, e_fn, floaters_world, y_split, bubbles=None):
    """The broth surface: tensor grid (fine in the visible zone), z = Z_BROTH + meniscus height.
    floaters_world: list of (verts (n,3) world, faces, contact_rise) for the meniscus obstacles."""
    from mathutils.bvhtree import BVHTree
    r0 = float(pf['r_in'](Z_BROTH + H_WALL))                 # contact radius (before out-of-round)
    Xh = r0 + 0.006
    xs = np.arange(-Xh, Xh + DX * 0.5, DX)
    ys_f = np.arange(y_split, Xh + DX * 0.5, DX)
    ys_c = np.arange(-Xh, y_split - 1e-9, 0.002)
    hfrac = 1.0 + Z_BROTH / pf['depth']
    # ---- fine zone: PDE
    gx, gy = np.meshgrid(xs, ys_f)
    rr = np.hypot(gx, gy)
    th = np.arctan2(gy, gx)
    rc = r0 * (1.0 + e_fn(th) * hfrac)
    fixed = rr >= rc
    val = np.where(fixed, H_WALL, 0.0)
    for verts, faces, rise in floaters_world:
        lo, hi = verts.min(0), verts.max(0)
        if hi[1] < y_split or lo[2] > Z_BROTH + rise or hi[2] < Z_BROTH + rise:
            continue
        bvh = BVHTree.FromPolygons([tuple(p) for p in verts.tolist()], [tuple(f) for f in faces.tolist()])
        i0, i1 = np.searchsorted(xs, [lo[0], hi[0]])
        j0, j1 = np.searchsorted(ys_f, [lo[1], hi[1]])
        zc = Z_BROTH + rise
        dn, up_ = Vector((0, 0, -1)), Vector((0, 0, 1))
        for j in range(max(j0 - 1, 0), min(j1 + 1, len(ys_f))):
            for i in range(max(i0 - 1, 0), min(i1 + 1, len(xs))):
                hit = bvh.ray_cast(Vector((xs[i], ys_f[j], hi[2] + 0.001)), dn)
                if hit[0] is not None and hit[0].z >= zc:
                    # the berry must really cross the contact height here (not an overhanging end)
                    hb = bvh.ray_cast(Vector((xs[i], ys_f[j], lo[2] - 0.001)), up_)
                    if hb[0] is not None and hb[0].z <= zc:
                        fixed[j, i] = True
                        val[j, i] = rise
    for (bx, by, br) in (bubbles or []):                      # tiny rise around bubbles
        i, j = int(round((bx + Xh) / DX)), int(round((by - y_split) / DX))
        k = max(1, int(br * 0.8 / DX))
        if 0 <= j - k and j + k < len(ys_f) and 0 <= i - k and i + k < len(xs):
            sub = np.hypot(*np.meshgrid(np.arange(-k, k + 1), np.arange(-k, k + 1))) <= k
            fixed[j - k:j + k + 1, i - k:i + k + 1] |= sub
            val[j - k:j + k + 1, i - k:i + k + 1][sub] = np.maximum(val[j - k:j + k + 1, i - k:i + k + 1][sub],
                                                                    0.25 * br)
    h_f = solve_meniscus(fixed, val, DX, LAMBDA)
    from scipy.ndimage import gaussian_filter
    h_f = gaussian_filter(h_f, 1.4, mode='nearest')          # no raster stair-steps along the contact lines
    # ---- coarse zone (near half, out of frame): analytic wall meniscus
    cx, cy = np.meshgrid(xs, ys_c)
    crr = np.hypot(cx, cy)
    crc = r0 * (1.0 + e_fn(np.arctan2(cy, cx)) * hfrac)
    h_c = H_WALL * np.exp(-np.clip(crc - crr, 0, None) / LAMBDA)
    ys = np.concatenate([ys_c, ys_f])
    h = np.concatenate([h_c, h_f], 0)
    X, Y = np.meshgrid(xs, ys)
    v = np.stack([X, Y, Z_BROTH + h], -1).reshape(-1, 3)
    ny, nx = len(ys), len(xs)
    f = C.grid_faces(ny, nx, wrap_v=False)
    rv = np.hypot(v[:, 0], v[:, 1])
    rcv = r0 * (1.0 + e_fn(np.arctan2(v[:, 1], v[:, 0])) * hfrac) + 0.0022
    keep = (rv[f] < rcv[f]).any(1)
    f = f[keep]
    used = np.zeros(len(v), bool)
    used[f.ravel()] = True
    remap = np.cumsum(used) - 1
    ob = C.mesh_from_arrays('broth', v[used], remap[f], material=material)
    return ob, (xs, ys_f, h_f)


# ============================================================================= public: loose items
def make_items(seed=0, n=6):
    """Loose items for the flat-lay version: plump rehydrated goji berries (泡发枸杞) lying on their flat
    side, lowest point on z = 0, origin at the footprint centre.
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    skin = soaked_goji_material()
    objs, fr, hh = [], [], []
    for i in range(n):
        v, f, attrs, _ = make_soaked_goji(seed * 11 + i)
        v = v.copy()
        v[:, :2] -= 0.5 * (v[:, :2].max(0) + v[:, :2].min(0))
        v[:, 2] -= v[:, 2].min()
        objs.append(C.mesh_from_arrays('bowl_goji_item_%d' % i, v, f, attrs=attrs, material=skin))
        fr.append(float(np.hypot(v[:, 0], v[:, 1]).max()))
        hh.append(float(0.5 * v[:, 2].max()))
    return dict(objects=objs, footprint_r=fr, half_height=hh, name='枸杞（泡发）')


# ============================================================================= scene
def rect_light(name, az, el, dist, target, size, size_y, power, color):
    a, e_ = math.radians(az), math.radians(el)
    T = np.array(target, float)
    pos = T + dist * np.array([math.sin(a) * math.cos(e_), math.cos(a) * math.cos(e_), math.sin(e_)])
    ob = C._area_light(name, pos, T, size, power, color, shape='RECTANGLE')
    ob.data.size_y = size_y
    return ob


def build_scene(args):
    rng = np.random.default_rng(args.seed)
    sc = bpy.context.scene
    # ---- bowl
    porcelain = porcelain_material(seed=0)
    bowl, pf, e_fn, dz_fn = build_bowl(porcelain, seed=0)
    R_sil = pf['r_top']
    sol = C.disc_solve(R_sil, elevation_deg=ELEV, lens_mm=LENS, apex=APEX, edge=EDGE,
                       aspect=sc.render.resolution_x / sc.render.resolution_y)
    pos, fwd, up = np.array(sol['cam_pos']), np.array(sol['cam_fwd']), np.array(sol['cam_up'])
    hw = C.SENSOR_MM / 2.0 / LENS
    hh = hw * sc.render.resolution_y / sc.render.resolution_x

    def frame_to_plane(fx, fy, z=Z_BROTH):
        d = fwd + (fx - 0.5) * 2 * hw * np.array([1.0, 0, 0]) + (0.5 - fy) * 2 * hh * up
        t = (z - pos[2]) / d[2]
        p = pos + d * t
        return p[0], p[1]

    # ---- berries
    skin = soaked_goji_material()
    variants, dims, vmesh = [], [], []
    for i in range(N_GOJI):
        v, f, attrs, dim = make_soaked_goji(i)
        variants.append(C.mesh_from_arrays('goji%d' % i, v, f, attrs=attrs, material=skin))
        dims.append(dim)
        vmesh.append((v, f))
    r_wall = float(pf['r_in'](Z_BROTH)) * 0.997
    fl = arrange_floaters(dims, frame_to_plane, r_wall, rng)
    loc, quat, scl, var, world = [], [], [], [], []
    for it in fl:
        L, Dm = dims[it['var']]
        Dm *= it['scale']
        M = (Matrix.Rotation(it['yaw'], 3, 'Z') @ Matrix.Rotation(it['pitch'], 3, 'Y') @
             Matrix.Rotation(it['roll'], 3, 'X'))
        zc = Z_BROTH - it['sink'] * Dm
        p = np.array([it['xy'][0], it['xy'][1], zc])
        loc.append(p)
        q = M.to_quaternion()
        quat.append((q.w, q.x, q.y, q.z))
        scl.append(it['scale'])
        var.append(it['var'])
        v, f = vmesh[it['var']]
        world.append(((v * it['scale']) @ np.array(M).T + p, f, float(rng.uniform(0.00030, 0.00060))))
    n_float = len(loc)
    # sunk berries resting on the bottom (seen refracted through the deep broth)
    for k in range(7):
        ang = math.radians(rng.uniform(35, 145))
        rad = rng.uniform(0.040, 0.079)
        i = int(rng.integers(0, N_GOJI))
        s_ = float(rng.uniform(0.9, 1.08))
        Dm = dims[i][1] * s_
        M = Matrix.Rotation(rng.uniform(0, 6.28), 3, 'Z') @ Matrix.Rotation(rng.uniform(0, 6.28), 3, 'X')
        loc.append(np.array([rad * math.cos(ang), rad * math.sin(ang), float(pf['z_bottom'](rad)) + 0.45 * Dm]))
        q = M.to_quaternion()
        quat.append((q.w, q.x, q.y, q.z))
        scl.append(s_)
        var.append(i)
    C.instance_on_points('berries', variants, loc=np.array(loc), quat=np.array(quat), scale=np.array(scl),
                         var=np.array(var))
    # ---- bubbles: small clusters on the wall meniscus + a few against berries
    bub = []
    hfrac = 1.0 + Z_BROTH / pf['depth']
    r_c = float(pf['r_in'](Z_BROTH + H_WALL))
    for cth in (62, 77, 96, 99, 118, 131, 84, 106):
        cth = math.radians(cth + rng.normal(0, 2.0))
        for j in range(int(rng.integers(2, 9))):
            br = float(np.clip(rng.lognormal(math.log(0.00042), 0.5), 0.00018, 0.0012))
            t_ = cth + rng.normal(0, 0.018)
            rr = r_c * (1.0 + float(e_fn(t_)) * hfrac) - br * rng.uniform(0.9, 1.5) - abs(rng.normal(0, 0.0007))
            cand = (rr * math.cos(t_), rr * math.sin(t_), br)
            if all(math.hypot(cand[0] - b[0], cand[1] - b[1]) > (cand[2] + b[2]) * 0.98 for b in bub):
                bub.append(cand)
    for it in fl[:14]:
        if rng.random() < 0.55:
            L, Dm = dims[it['var']]
            br = float(np.clip(rng.lognormal(math.log(0.00038), 0.45), 0.00018, 0.0009))
            a = rng.uniform(0, 6.28)
            off = np.array([math.cos(it['yaw']), math.sin(it['yaw'])]) * rng.uniform(-0.35, 0.35) * L
            nrm = np.array([-math.sin(it['yaw']), math.cos(it['yaw'])]) * (0.5 * Dm * it['scale'] + br * 1.0) * \
                (1 if math.sin(a) > 0 else -1)
            p = it['xy'] + off + nrm
            bub.append((float(p[0]), float(p[1]), br))
    # ---- broth
    y_split = max(sol['patch'][2] - 0.004, -0.02)
    broth, (xs, ysf, hf) = build_broth(broth_material(), pf, e_fn, world[:n_float], y_split, bubbles=bub)
    from scipy.ndimage import map_coordinates
    bl, bs = [], []
    for bx, by, br in bub:
        if by <= ysf[0]:
            continue
        hz = map_coordinates(hf, [[(by - ysf[0]) / DX], [(bx - xs[0]) / DX]], order=1)[0]
        bl.append((bx, by, Z_BROTH + hz + 0.12 * br))
        bs.append(br)
    if bl:
        sv, sf_, _, _ = C.superellipsoid(1.0, 1.0, 1.0, nu=24, nv=32)
        sph = C.mesh_from_arrays('bubble', sv, sf_, material=bubble_material())
        qn = np.tile(np.array([[1.0, 0, 0, 0]]), (len(bl), 1))
        C.instance_on_points('bubbles', [sph], loc=np.array(bl), quat=qn, scale=np.array(bs),
                             var=np.zeros(len(bl), int))
    # ---- camera
    cam, info = C.disc_camera(R_sil, elevation_deg=ELEV, lens_mm=LENS, apex=APEX, edge=EDGE)
    # focus on the main raft of berries, band slightly soft, nearest foreground softer
    fx, fy = frame_to_plane(0.40, 0.84)
    focus = float((np.array([fx, fy, Z_BROTH]) - pos) @ fwd)
    C.set_dof(cam, focus, FSTOP)
    Wpx = 2112
    print('[dof] focus %.3f m  blur@rim %.1f px  blur@near %.1f px (of %d)' % (
        focus, C.blur_px(cam, focus, info['limb_dist'], FSTOP, Wpx),
        C.blur_px(cam, focus, float((np.array(frame_to_plane(0.5, 1.0) + (Z_BROTH,)) - pos) @ fwd), FSTOP, Wpx), Wpx))
    # ---- light: big soft box 3/4 back-left (key), window-like box over the camera (its reflection
    #      is the crisp glaze highlight on the inner wall), low strip back-right, dim warm world
    T = (0.0, 0.085, -0.015)
    rect_light('key', -38.0, 50.0, 1.05, T, 0.80, 0.60, 70.0, (1.0, 0.955, 0.88))
    rect_light('top', 0.0, 66.0, 1.00, T, 0.60, 0.45, 17.0, (1.0, 0.975, 0.94))
    rect_light('front', -150.0, 52.0, 1.25, T, 0.50, 0.42, 16.0, (0.94, 0.97, 1.0))      # gleam on the flared lip
    rect_light('sheen', 163.0, 17.5, 1.35, T, 1.50, 0.11, 4.0, (1.0, 0.97, 0.93))        # sheen under the band
    rect_light('strip', 64.0, 36.0, 1.0, T, 0.22, 0.70, 9.0, (1.0, 0.90, 0.78))
    C.world_gradient(horizon=(0.030, 0.021, 0.014), zenith=(0.060, 0.048, 0.038), ground=(0.012, 0.008, 0.005))
    return info


def main():
    args = C.parse_args()
    if args.quality == 'final' and not args.res:
        args.q['res'] = FINAL_RES
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    sc = bpy.context.scene
    sc.cycles.transmission_bounces = 6
    sc.cycles.glossy_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.max_bounces = 8
    build_scene(args)
    res = C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp, crop=args.region, text=not args.region)
    print('[comp]', comp, ' render %.1f s' % res['seconds'])


if __name__ == '__main__':
    main()
