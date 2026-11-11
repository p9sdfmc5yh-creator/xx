# -*- coding: utf-8 -*-
"""s02_cabinet - 百子柜 (traditional Chinese apothecary drawer cabinet), kind = special.

    python s02_cabinet.py --quality draft   --out /tmp/x.png
    python s02_cabinet.py --quality draft   --res 4032x2268 --spp 48 --region 0.3,0.6,0.6,0.9 --out /tmp/c.png
    python s02_cabinet.py --quality final   --out film/renders/s02_cabinet.png      # 4032x2268 + _depth.npy

The "planet" is an oblate spheroid (equatorial radius 2.0 m, polar radius 1.0 m) whose whole surface is
an antique medicine cabinet: flat drawer fronts set in a faceted frame of rails (rings) and stiles
(meridians).  We look across its upper flank from 30 deg off the short axis, so the lower rows face
the lens (labels legible) and the top rows roll away over the limb = the horizon arc.

World: +Z up (gravity -Z: the ring pulls hang down the drawer fronts), camera on -Y looking +Y.
Units are metres: a drawer front is ~0.10 x 0.10 m, a ring pull 24 mm, a paper label 66 x 32 mm.

Structure: 1 layout maths   2 geometry builders (boards, labels + atlas, brass pulls)
           3 materials      4 scene assembly   5 camera / light / render harness (common.py)
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import bpy                                                                            # noqa: E402
from mathutils import Matrix, Vector                                                  # noqa: E402

SHOT = 's02_cabinet'
NAME_CN = '百子柜（中药柜）'
TMP_DIR = os.path.join(C.SCRATCH, 'tmp_' + SHOT)
ASSET_DIR = os.path.join(C.HERE, 'assets', SHOT)          # brush font (OFL) lives here
FINAL_RES = (4032, 2268)                                   # 64-frame shot: 5 % more pixels than 3840x2160

# ----------------------------------------------------------------------------- parameters (metres)
A_EQ, B_POL = 2.00, 1.00            # spheroid semi-axes: equatorial, polar (short axis ~ towards the lens)
DELTA = math.radians(8.0)           # camera elevation above the world horizon, seen from the centre
EPS = math.radians(30.0)            # angle between the camera direction and the short axis
LENS = 100.0
N_COL = 98                          # drawers around the equator -> pitch 0.128 m
ROW_H = 0.118                       # row pitch along the meridian
RAIL_W, STILE_W, GAP = 0.0170, 0.0150, 0.0013
T_FRONT, T_FRAME = 0.016, 0.022     # board thicknesses
BEVEL = 0.0011
PULL_Y, LABEL_Y = -0.0185, 0.0262   # pull / label centre on the drawer front (local y, metres)
LABEL_W, LABEL_H = 0.0700, 0.0350   # label quad (visible paper is ~5 % smaller: irregular hand-cut edge)
RING_R, RING_WIRE = 0.0105, 0.0015
EYE_Z = 0.0040                      # height of the ring's pivot above the drawer front

# 食药物质 (food-medicine homologous substances).  HERO = the ingredients that have their own shot in
# the film: they go on the largest, most legible labels.  All names are real list entries.
HERO = ('山药 枸杞 大枣 生姜 陈皮 莲子 百合 山楂 菊花 蜂蜜 茯苓 薏苡仁 龙眼肉 黑芝麻 薄荷 桑椹 赤小豆 荷叶 甘草 '
        '姜黄 沙棘 决明子 罗汉果 肉桂 芡实 灵芝').split()
LOOK = ('茯苓 菊花 甘草 薄荷 芡实 桑椹 荷叶 乌梅 山楂 紫苏 桔梗 栀子 沙棘 佛手 木瓜 麦芽 昆布 白果 玉竹 葛根 覆盆子 '
        '小茴香 藿香 白芷 桑叶 蜂蜜 刀豆 罗汉果 山药 枸杞 大枣 百合 莲子 陈皮 肉桂 灵芝 黄精 砂仁 丁香 八角 花椒 黑芝麻 '
        '决明子 薏苡仁 赤小豆 龙眼肉 酸枣仁 金银花 蒲公英 鱼腥草 淡竹叶 益智仁').split()
EXTRA = ('高良姜 阿胶 鸡内金 胖大海 香橼 桃仁 杏仁 莱菔子 槐花 火麻仁 白扁豆 肉豆蔻 余甘子 郁李仁 青果 香薷 淡豆豉 '
         '菊苣 黄芥子 槐米 榧子 薤白 党参 当归 黄芪 天麻 人参 草果 荜茇 山柰 西红花 玫瑰花 夏枯草 山茱萸 杜仲叶 西洋参 '
         '肉苁蓉 代代花 马齿苋 小蓟 牡蛎 橘红 紫苏籽 白茅根 粉葛 布渣叶 松花粉 芫荽 山银花 黑胡椒').split()


def all_names():
    out = []
    for n in list(HERO) + list(LOOK) + list(EXTRA):
        if n not in out:
            out.append(n)
    return out


# ============================================================================= 1. layout maths
def basis():
    a = DELTA - EPS
    p = np.array([0.0, -math.cos(a), math.sin(a)])       # short axis (pole), towards the lens and a bit down
    zp = np.array([0.0, math.sin(a), math.cos(a)])       # "up" on the spheroid
    xp = np.array([1.0, 0.0, 0.0])
    return p, zp, xp


def surf(t, ph, off=0.0):
    """Point and unit normal of the spheroid at parametric colatitude t (from the pole) and azimuth ph
    (0 = top meridian, + towards +X).  `off` moves the point along the normal."""
    p, zp, xp = basis()
    t = np.asarray(t, float)
    ph = np.asarray(ph, float)
    er = np.cos(ph)[..., None] * zp + np.sin(ph)[..., None] * xp
    P = A_EQ * np.sin(t)[..., None] * er + B_POL * np.cos(t)[..., None] * p
    N = (np.sin(t) / A_EQ)[..., None] * er + (np.cos(t) / B_POL)[..., None] * p
    N = N / np.linalg.norm(N, axis=-1, keepdims=True)
    return P + off * N, N


def project(P, cam):
    """World points -> (x, y) frame fractions (origin top-left) and camera-axis depth."""
    d = np.asarray(P, float) - cam['pos']
    z = d @ cam['fwd']
    x = 0.5 + (d @ cam['right']) / z * LENS / C.SENSOR_MM
    y = 0.5 - (d @ cam['up']) / z * LENS / (C.SENSOR_MM * 9.0 / 16.0)
    return x, y, z


def solve_camera(apex=0.540, edge=0.675, off=0.006):
    """Camera distance + pitch so that the spheroid's limb (offset by the proud frame) has its apex at
    y = apex*H and meets the left/right frame edges at y = edge*H."""
    c = np.array([0.0, -math.cos(DELTA), math.sin(DELTA)])
    t = np.radians(np.linspace(15, 165, 700))
    ph = np.radians(np.linspace(-50, 50, 801))
    T, PH = np.meshgrid(t, ph, indexing='ij')
    P, _ = surf(T, PH, off)

    def cam_of(D, beta):
        f = np.array([0.0, math.cos(beta), math.sin(beta)])
        r = np.array([1.0, 0.0, 0.0])
        return dict(pos=D * c, fwd=f, right=r, up=np.cross(r, f), D=D, beta=beta)

    def meas(D, beta):
        x, y, z = project(P, cam_of(D, beta))
        ma = (z > 0) & (np.abs(x - 0.5) < 0.004)
        me = (z > 0) & (np.abs(x) < 0.004)
        return y[ma].min(), (y[me].min() if me.any() else 9.0)

    def fit_beta(D):
        lo, hi = math.radians(-60), math.radians(60)
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if meas(D, mid)[0] < apex:
                lo = mid
            else:
                hi = mid
        return 0.5 * (lo + hi)

    lo, hi = 2.6, 24.0
    for _ in range(34):
        D = 0.5 * (lo + hi)
        if meas(D, fit_beta(D))[1] < edge:
            lo = D
        else:
            hi = D
    D = 0.5 * (lo + hi)
    cam = cam_of(D, fit_beta(D))
    # central-column profile: limb, nearest visible point, focus helpers
    tt = np.radians(np.linspace(15, 165, 4000))
    Pc, Nc = surf(tt, np.zeros_like(tt))
    x, y, z = project(Pc, cam)
    V = cam['pos'] - Pc
    cosg = (V * Nc).sum(1) / np.linalg.norm(V, axis=1)
    il = int(np.argmax(cosg < 0))
    ib = int(np.argmin(np.abs(y[:il] - 1.0)))
    cam.update(t_limb=float(tt[il]), t_bottom=float(tt[ib]), limb_dist=float(z[il]), near_dist=float(z[ib]),
               target=Pc[int(0.5 * (il + ib))].copy(), scale=float(z[il] * C.SENSOR_MM / LENS))
    return cam


def row_bounds(t_anchor, t_lo, t_hi):
    """Row boundaries (parametric t) spaced ROW_H along the meridian, one of them exactly at t_anchor."""
    def march(t, sgn):
        s, dt = 0.0, 2e-5
        while s < ROW_H:
            s += math.sqrt((A_EQ * math.cos(t)) ** 2 + (B_POL * math.sin(t)) ** 2) * dt
            t += sgn * dt
        return t
    ts = [t_anchor]
    while ts[0] > t_lo:
        ts.insert(0, march(ts[0], -1.0))
    while ts[-1] < t_hi:
        ts.append(march(ts[-1], 1.0))
    return np.array(ts)


def cell_frame(t, ph):
    """Origin on the surface + orthonormal axes (u = drawer right, v = drawer up = towards the limb,
    n = outward) as a 3x3 matrix with the axes in its COLUMNS."""
    p, zp, xp = basis()
    P, n = surf(t, ph)
    u = -math.sin(ph) * zp + math.cos(ph) * xp
    v = np.cross(n, u)
    return P, np.stack([u, v, n], 1)


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1.0, 0], [-s, 0, c]])


# ============================================================================= 2a. boards (drawer fronts, rails, stiles)
def _box_template():
    """Chamfered box, 24 vertices: vertex (corner c, axis k) lies on the face perpendicular to axis k and
    carries that face's normal -> flat faces shade flat, the chamfers interpolate = rounded edge."""
    corners = [(sx, sy, sz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    sign = np.zeros((24, 3))
    inset = np.ones((24, 3))
    nrm = np.zeros((24, 3))
    for ci, s in enumerate(corners):
        for k in range(3):
            sign[ci * 3 + k] = s
            inset[ci * 3 + k, k] = 0.0
            nrm[ci * 3 + k, k] = s[k]
    quads, tris = [], []
    P = sign * (1.0 - 0.2 * inset)
    for k in range(3):                                               # 6 main faces
        o = [a for a in range(3) if a != k]
        for sg in (-1, 1):
            ids = [ci * 3 + k for ci, s in enumerate(corners) if s[k] == sg]
            ids.sort(key=lambda i: math.atan2(P[i, o[1]], P[i, o[0]]))
            quads.append(ids)
    for k1 in range(3):                                              # 12 edge chamfers
        for k2 in range(k1 + 1, 3):
            for s1 in (-1, 1):
                for s2 in (-1, 1):
                    cs = [ci for ci, s in enumerate(corners) if s[k1] == s1 and s[k2] == s2]
                    quads.append([cs[0] * 3 + k1, cs[1] * 3 + k1, cs[1] * 3 + k2, cs[0] * 3 + k2])
    for ci in range(8):                                              # 8 corner triangles
        tris.append([ci * 3, ci * 3 + 1, ci * 3 + 2])

    def fix(f):
        f = list(f)
        cen = P[f].mean(0)
        n = np.cross(P[f[1]] - P[f[0]], P[f[2]] - P[f[0]])
        return f if n @ cen > 0 else f[::-1]
    return sign, inset, nrm, np.array([fix(f) for f in quads]), np.array([fix(f) for f in tris])


class Boards(object):
    """Collects chamfered boards and bakes the per-vertex data the wood shader needs:
       bl   local position (m, origin = board centre; x = along the grain, z = face normal)
       bh   half size (m)            brnd  random 0-1 per board       bkind  0 drawer front, 1 frame
       bp   position inside a virtual log (m): growth rings are circles in its y-z plane"""

    def __init__(self):
        self.items = []

    def add(self, center, axes, half, kind, rng, taper=0.0, bevel=BEVEL):
        self.items.append(dict(c=np.asarray(center, float), R=np.asarray(axes, float), h=np.asarray(half, float),
                               kind=float(kind), taper=float(taper), bevel=float(bevel),
                               tree=(rng.uniform(0, 40.0), rng.uniform(-0.11, 0.11), rng.uniform(0.045, 0.24),
                                     rng.normal(0, 0.05), rng.uniform(0.78, 1.30)), rnd=rng.random()))

    def build(self, name, material):
        sign, inset, nrm, quads, tris = _box_template()
        V, Nn, Q, T = [], [], [], []
        at = dict(bl=[], bh=[], bp=[], brnd=[], bkind=[])
        for k, it in enumerate(self.items):
            h = it['h']
            P = sign * (h - inset * it['bevel'])
            Pw = P.copy()
            if it['taper']:
                Pw[:, 1] *= 1.0 + it['taper'] * Pw[:, 0] / h[0]
            V.append(Pw @ it['R'].T + it['c'])
            Nn.append(nrm @ it['R'].T)
            Q.append(quads + 24 * k)
            T.append(tris + 24 * k)
            ox, oy, oz, tilt, sc = it['tree']
            at['bl'].append(P)
            at['bh'].append(np.repeat(h[None], 24, 0))
            at['bp'].append(np.stack([P[:, 0] + ox, (P[:, 1] + oy) * sc, (P[:, 2] + oz + tilt * P[:, 0]) * sc], 1))
            at['brnd'].append(np.full(24, it['rnd']))
            at['bkind'].append(np.full(24, it['kind']))
        V = np.concatenate(V)
        ob = C.mesh_from_arrays(name, V, [np.concatenate(Q), np.concatenate(T)], smooth=True, material=material,
                                attrs={k: np.concatenate(v) for k, v in at.items()})
        try:                                                         # face-weighted "rounded edge" normals
            ob.data.normals_split_custom_set_from_vertices([tuple(n) for n in np.concatenate(Nn)])
        except Exception as e:                                       # pragma: no cover
            print('[warn] custom normals failed:', e)
        return ob


# ============================================================================= 2b. paper labels
def _font_path():
    for p in (os.path.join(ASSET_DIR, 'MaShanZheng-Regular.ttf'),
              os.path.join(TMP_DIR, 'fontdl', 'MaShanZheng-Regular.ttf'),
              os.path.join(C.FONT_DIR, 'NotoSerifCJKsc-SemiBold.otf')):
        if os.path.exists(p):
            return p
    raise IOError('no label font found')


def make_label_image(name, rng, W=512, H=256, ss=2):
    """One hand-written label: aged fibrous paper (RGB) + irregular hand-cut outline (A).  uint8 HxWx4."""
    from PIL import Image, ImageDraw, ImageFont, ImageChops
    from scipy.ndimage import gaussian_filter
    w, h = W * ss, H * ss

    def f(sig):
        n = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), sig * ss, mode='reflect')
        return n / (n.std() + 1e-6)

    age = float(rng.beta(2.0, 2.4))
    base = np.array([226, 213, 181.0]) * (1 - age) + np.array([191, 163, 112.0]) * age
    base = base * rng.uniform(0.93, 1.03)
    img = base[None, None, :] * (1.0 + 0.022 * f(0.6) + 0.014 * f(3.0) + 0.030 * f(22.0))[..., None]
    blot = np.clip(0.6 * f(30.0) + 0.4 * f(9.0), 0, 2.5)                       # uneven yellowing / glue stains
    img *= 1.0 - (0.02 + 0.06 * age) * blot[..., None] * np.array([0.45, 0.80, 1.45])
    # paper fibres: short curved hairs, lighter and darker than the sheet
    fib = Image.new('L', (w, h), 128)
    d = ImageDraw.Draw(fib)
    for _ in range(520):
        x0, y0 = rng.uniform(0, w), rng.uniform(0, h)
        a = rng.uniform(0, math.pi)
        L = rng.uniform(8, 46) * ss
        bend = rng.normal(0, 0.25) * L
        p1 = (x0 + 0.5 * L * math.cos(a) - bend * math.sin(a), y0 + 0.5 * L * math.sin(a) + bend * math.cos(a))
        p2 = (x0 + L * math.cos(a), y0 + L * math.sin(a))
        d.line([(x0, y0), p1, p2], fill=int(128 + rng.choice([-1, 1]) * rng.uniform(14, 46)), width=1)
    fibn = gaussian_filter(np.asarray(fib, np.float32), 0.55 * ss) - 128.0
    img *= (1.0 + fibn / 128.0 * 0.30)[..., None]
    # outline: scissor cut, never quite straight or square
    X, Y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    mg = 0.055 * h

    def wob(n):
        g = gaussian_filter(rng.standard_normal(n).astype(np.float32), 0.10 * n, mode='reflect')
        g2 = gaussian_filter(rng.standard_normal(n).astype(np.float32), 0.012 * n, mode='reflect')
        return (g / (g.std() + 1e-6) * 0.0045 + g2 / (g2.std() + 1e-6) * 0.0011) * h + rng.normal(0, 0.006) * h

    sk = rng.normal(0, 0.010, 4)
    xl = mg + wob(h) + sk[0] * np.arange(h)
    xr = w - mg + wob(h) + sk[1] * np.arange(h)
    yt = mg + wob(w) + sk[2] * np.arange(w) * 0.5
    yb = h - mg + wob(w) + sk[3] * np.arange(w) * 0.5
    dist = np.minimum(np.minimum(X - xl[:, None], xr[:, None] - X), np.minimum(Y - yt[None, :], yb[None, :] - Y))
    if rng.random() < 0.16:                                                     # a torn / snipped corner
        cx, cy = rng.choice([0, w]), rng.choice([0, h])
        ang = rng.uniform(0.6, 1.0)
        dd = (np.abs(X - cx) * math.cos(ang) + np.abs(Y - cy) * math.sin(ang)) - rng.uniform(0.16, 0.30) * h
        dist = np.minimum(dist, dd + 0.012 * h * f(2.0))
    alpha = np.clip(dist / ss + 0.5, 0, 1)
    edge = np.exp(-np.clip(dist, 0, None) / (0.05 * h))
    img *= 1.0 - edge[..., None] * (0.05 + 0.20 * age) * (0.75 + 0.25 * f(5.0))[..., None] * np.array([0.55, 0.90, 1.5])
    for _ in range(rng.poisson(2 + 9 * age)):                                   # foxing
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(1.2, 6.0) * ss
        g = np.exp(-((X - cx) ** 2 + (Y - cy) ** 2) / (2 * r * r)) * rng.uniform(0.12, 0.45)
        img *= 1.0 - g[..., None] * np.array([0.35, 0.60, 0.90])
    if rng.random() < 0.3:                                                      # tide mark of an old splash
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(0.25, 0.6) * h
        rr = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2) + 0.04 * h * f(8.0)
        ring = np.exp(-((rr - r) / (0.018 * h)) ** 2) * 0.16 + (rr < r) * 0.05
        img *= 1.0 - ring[..., None] * np.array([0.5, 0.8, 1.3])
    # ink: brush kai, each character written separately
    n = len(name)
    fs = int(min(0.70 * h, 0.86 * (w - 2 * mg) / n))
    font = ImageFont.truetype(_font_path(), fs)
    txt = Image.new('L', (w, h), 0)
    adv = fs * (0.97 if n == 2 else 0.93)
    x0 = 0.5 * w - 0.5 * adv * (n - 1) + rng.normal(0, 0.012) * w
    slope = rng.normal(0, 0.012)
    for k, ch in enumerate(name):
        sz = int(fs * rng.uniform(0.94, 1.05))
        fnt = font if sz == fs else ImageFont.truetype(_font_path(), sz)
        g = Image.new('L', (2 * fs, 2 * fs), 0)
        ImageDraw.Draw(g).text((fs, fs), ch, font=fnt, fill=255, anchor='mm')
        g = g.rotate(rng.normal(0, 2.2), resample=Image.BICUBIC)
        cx = x0 + k * adv + rng.normal(0, 0.012) * fs
        cy = 0.5 * h + rng.normal(0, 0.02) * fs + slope * (k - 0.5 * (n - 1)) * adv
        layer = Image.new('L', (w, h), 0)
        layer.paste(g, (int(cx - fs), int(cy - fs)))
        txt = ImageChops.lighter(txt, layer)
    ink = np.asarray(txt, np.float32) / 255.0
    soft = gaussian_filter(ink, 2.2 * ss)
    edgez = np.clip(ink * (1.0 - soft) * 3.2, 0, 1)                             # stroke rims / thin strokes
    dry = np.clip((0.6 * f(0.5) + 0.7 * f(2.2)) - 0.75, 0, 1)                   # dry-brush skips
    load = np.clip(0.86 + 0.14 * f(7.0), 0.55, 1.0)                             # ink load varies along a stroke
    inkd = ink * load * (1.0 - 0.55 * np.clip(dry * 2.0, 0, 1) * edgez) * rng.uniform(0.86, 0.97)
    inkd = np.maximum(inkd, gaussian_filter(inkd, 0.9 * ss) * 0.92)             # slight feathering into fibres
    inkd *= 1.0 - 0.25 * np.clip(fibn / 40.0, 0, 1)                             # pale fibres lie over the ink
    ink_col = np.array([24, 21, 20.0]) * (1 - age) + np.array([50, 41, 34.0]) * age
    img = img * (1 - inkd[..., None]) + ink_col[None, None, :] * inkd[..., None]
    rgba = np.dstack([np.clip(img, 0, 255), alpha * 255.0]).astype(np.uint8)
    return np.asarray(Image.fromarray(rgba, 'RGBA').resize((W, H), Image.LANCZOS))


def make_label_atlas(names, seed=1, cols=8, cell=(512, 256)):
    """All labels in one RGBA atlas PNG (cached in the shot's tmp dir).  Returns (path, cols, rows)."""
    from PIL import Image
    import hashlib
    rows = int(math.ceil(len(names) / float(cols)))
    key = hashlib.md5(('|'.join(names) + str(seed) + str(cell) + _font_path() + 'v4').encode('utf-8')).hexdigest()[:10]
    os.makedirs(TMP_DIR, exist_ok=True)
    path = os.path.join(TMP_DIR, 'label_atlas_%s.png' % key)
    if not os.path.exists(path):
        cw, ch = cell
        atlas = np.zeros((rows * ch, cols * cw, 4), np.uint8)
        for k, nm in enumerate(names):
            rng = np.random.default_rng(seed * 1000 + k)
            r, c = divmod(k, cols)
            atlas[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = make_label_image(nm, rng, cw, ch)
        Image.fromarray(atlas, 'RGBA').save(path)
    return path, cols, rows


def label_mesh_arrays(frames, cells, cols, rows, rng, nx=14, ny=7):
    """frames: list of (origin, 3x3 axes) of the drawer-front faces; cells: atlas cell index per label.
    Each label is a small grid glued to the wood: a hair above it, edges and one or two corners lifted."""
    gx, gy = np.meshgrid(np.linspace(-0.5, 0.5, nx + 1), np.linspace(-0.5, 0.5, ny + 1))
    gx, gy = gx.ravel(), gy.ravel()
    base_f = C.grid_faces(ny + 1, nx + 1, wrap_v=False)
    V, F, UV = [], [], []
    for k, ((O, R), cell) in enumerate(zip(frames, cells)):
        x, y = gx * LABEL_W, gy * LABEL_H
        z = np.full_like(x, 0.00016)
        z += 0.00010 * (np.sin(x * rng.uniform(150, 420) + rng.uniform(0, 6)) * np.sin(y * rng.uniform(200, 500) + rng.uniform(0, 6)) + 1)
        for _ in range(rng.choice([0, 1, 1, 2, 3])):                             # lifted corners (old paste gives up)
            cx, cy = rng.choice([-0.5, 0.5]) * LABEL_W, rng.choice([-0.5, 0.5]) * LABEL_H
            rad = rng.uniform(0.006, 0.020)
            lift = rng.choice([rng.uniform(0.0003, 0.0010), rng.uniform(0.0012, 0.0036)], p=[0.72, 0.28])
            dd = np.clip(1.0 - np.hypot(x - cx, y - cy) / rad, 0, 1)
            z += lift * dd ** 2
        if rng.random() < 0.35:                                                  # a long edge bulging off the wood
            sgn = rng.choice([-1, 1])
            z += rng.uniform(0.0002, 0.0007) * np.clip(sgn * gy * 2, 0, 1) ** 3 * (0.5 + 0.5 * np.cos(gx * rng.uniform(4, 9)))
        a = rng.normal(0, math.radians(1.6))
        ox, oy = rng.normal(0, 0.0022), LABEL_Y + rng.normal(0, 0.0016)
        loc = np.stack([x * math.cos(a) - y * math.sin(a) + ox, x * math.sin(a) + y * math.cos(a) + oy, z], 1)
        V.append(loc @ R.T + O)
        F.append(base_f + k * len(gx))
        r, c = divmod(int(cell), cols)
        UV.append(np.stack([(c + gx + 0.5) / cols, 1.0 - (r + 0.5 - gy) / rows], 1))
    return np.concatenate(V), np.concatenate(F), np.concatenate(UV)


# ============================================================================= 2c. brass pulls
def _orient_closed(v, f):
    """Flip the quads of a closed surface so the normals point outwards (positive signed volume)."""
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return f if np.einsum('ij,ij->i', a, np.cross(b, c)).sum() > 0 else f[:, ::-1].copy()


def make_backplate(seed):
    """Round chrysanthemum backplate (菊花垫片) with its split-pin eye.  Lies on z = 0, origin at the centre.
    Returns (verts, faces, attrs) with a per-vertex 'wear' mask (1 = rubbed bright, 0 = oxidised recess)."""
    rng = np.random.default_rng(700 + seed)
    npet = int(rng.choice([12, 16, 16]))
    Rp = rng.uniform(0.0138, 0.0152)
    rho_k = np.array([0.0, 0.10, 0.22, 0.29, 0.335, 0.38, 0.52, 0.72, 0.88, 0.955, 0.99, 1.0]) * Rp
    z_k = np.array([2.05, 2.0, 1.75, 1.25, 0.90, 0.78, 0.98, 0.95, 0.74, 0.50, 0.22, 0.0]) * 1e-3
    rr = np.unique(np.concatenate([np.linspace(0.0002, Rp, 26), rho_k[1:]]))
    nseg = 96
    ph = np.linspace(0, 2 * math.pi, nseg, endpoint=False)
    RR, PH = np.meshgrid(rr, ph, indexing='ij')
    z = np.interp(RR, rho_k, z_k)
    flute = np.cos(npet * PH + rng.uniform(0, 6))
    win = C.smoothstep(0.36 * Rp, 0.50 * Rp, RR) * (1.0 - C.smoothstep(0.90 * Rp, 0.99 * Rp, RR))
    crease = np.abs(flute) ** 0.6 * np.sign(flute)
    z = z + 0.00022 * win * (crease - 0.3)
    rad = RR * (1.0 + 0.040 * (0.5 + 0.5 * flute) * C.smoothstep(0.80 * Rp, Rp, RR))          # scalloped rim
    rad = rad * (1.0 + 0.012 * np.sin(PH * 2 + rng.uniform(0, 6)))                              # hand-cut, not round
    z = z + 0.00006 * np.sin(PH * 3 + rng.uniform(0, 6)) * (RR / Rp)                            # slightly buckled
    z = np.where(RR >= Rp * 0.999, 0.0, np.maximum(z, 0.00012))
    v = np.stack([rad * np.cos(PH), rad * np.sin(PH), z], -1).reshape(-1, 3)
    f = C.grid_faces(len(rr), nseg, wrap_v=True)[:, ::-1]
    wear = np.clip(0.30 + 0.55 * win * (crease * 0.5 + 0.5) + 0.75 * C.smoothstep(0.0006, 0.0019, z) * (RR < 0.4 * Rp)
                   + 0.45 * C.smoothstep(0.90 * Rp, 0.97 * Rp, RR) * (z > 0.0001), 0, 1)
    wear = wear * (1.0 - 0.55 * np.exp(-((RR - 0.37 * Rp) / (0.035 * Rp)) ** 2))                 # grime ring round the boss
    parts = [(v, f, wear.ravel())]
    # the eye: a loop of split pin standing in the y-z plane (hole axis = x), ring wire runs through it
    Rl, rw = 0.0026, 0.00085
    th = np.linspace(0, 2 * math.pi, 28, endpoint=False)
    om = np.linspace(0, 2 * math.pi, 10, endpoint=False)
    TH, OM = np.meshgrid(th, om, indexing='ij')
    cy, cz = Rl * np.cos(TH), Rl * np.sin(TH) * 1.12
    ve = np.stack([rw * np.sin(OM) * 1.5, cy + rw * np.cos(OM) * np.cos(TH), EYE_Z + cz + rw * np.cos(OM) * np.sin(TH)], -1)
    ve = ve.reshape(-1, 3)
    fe = _orient_closed(ve - [0, 0, EYE_Z], C.grid_faces(28, 10, wrap_v=True, wrap_u=True))
    parts.append((ve, fe, np.full(len(ve), 0.42) + 0.3 * (ve[:, 2] > EYE_Z + 0.0015)))
    V = np.concatenate([p[0] for p in parts])
    off, F = 0, []
    for p in parts:
        F.append(p[1] + off)
        off += len(p[0])
    return V, np.concatenate(F), dict(wear=np.concatenate([p[2] for p in parts]))


def make_ring(seed, nth=96, nom=16):
    """Hand-forged brass ring.  Local frame: the ring lies in the x-y plane, its TOP point (the pivot
    in the eye) is the origin and it hangs towards -y.  Returns (verts, faces, attrs)."""
    rng = np.random.default_rng(900 + seed)
    R = RING_R * rng.uniform(0.96, 1.05)
    rw = RING_WIRE * rng.uniform(0.92, 1.08)
    th = np.linspace(0, 2 * math.pi, nth, endpoint=False)
    om = np.linspace(0, 2 * math.pi, nom, endpoint=False)
    TH, OM = np.meshgrid(th, om, indexing='ij')
    ell = 1.0 + rng.uniform(-0.035, 0.035) * np.cos(2 * TH + rng.uniform(0, 6)) + 0.012 * np.cos(3 * TH + rng.uniform(0, 6))
    cx, cy = R * ell * np.sin(TH), -R + R * ell * np.cos(TH)
    cz = 0.00025 * np.sin(2 * TH + rng.uniform(0, 6))                                          # not quite planar
    seam = rng.uniform(0.6, 5.6)                                                               # where the wire was closed
    dth = np.angle(np.exp(1j * (TH - seam)))
    rwv = rw * (1.0 + 0.05 * np.sin(5 * TH + rng.uniform(0, 6)) - 0.32 * np.exp(-(dth / 0.012) ** 2))
    flat = 1.0 - 0.10 * np.cos(OM) ** 2                                                        # slightly flattened section
    er = np.stack([np.sin(TH), np.cos(TH), np.zeros_like(TH)], -1)
    v = np.stack([cx, cy, cz], -1) + (rwv * flat * np.cos(OM))[..., None] * er + (rwv * np.sin(OM))[..., None] * np.array([0, 0, 1.0])
    v = v.reshape(-1, 3)
    f = _orient_closed(v - [0, -R, 0], C.grid_faces(nth, nom, wrap_v=True, wrap_u=True))
    low = 0.5 - 0.5 * np.cos(TH)                                                               # 1 at the bottom (fingers)
    wear = np.clip(0.26 + 0.34 * np.clip(np.cos(OM), 0, 1) + 0.22 * np.clip(np.sin(OM), 0, 1) + 0.30 * low ** 1.5
                   - 0.5 * np.exp(-(dth / 0.03) ** 2), 0, 1)
    return v, f, dict(wear=wear.ravel()), R


# ============================================================================= 3. materials
def wood_material():
    """Aged dark elm / rosewood-toned cabinet wood: ring-porous growth rings cut from a virtual log
    (cathedral figure on flat-sawn fronts, straight grain on the rails), open pores, worn pale arrises,
    grime in the corners, hand-polished patina and ring rub marks round the pulls, patchy old shellac."""
    m = C.Mat('aged_elm')

    def VM(op, a, b=None):
        ins = {0: a}
        if b is not None:
            ins[1] = b
        return m.node('ShaderNodeVectorMath', ins, operation=op).outputs[0]

    def XYZ(x, y, z):
        return m.node('ShaderNodeCombineXYZ', {0: x, 1: y, 2: z}).outputs[0]

    bp = m.attr('bp', output='Vector')
    bl = m.attr('bl', output='Vector')
    bh = m.attr('bh', output='Vector')
    rnd = m.attr('brnd')
    kind = m.attr('bkind')
    drawer = m.math('SUBTRACT', 1.0, kind)
    # --- growth rings in the log, warped so no line is ruler-straight
    wn = m.noise(scale=1.0, detail=2.0, roughness=0.55, vector=m.mapping(bp, scale=(2.6, 12.0, 12.0)), color=True)
    q = VM('ADD', bp, VM('MULTIPLY', VM('SUBTRACT', wn, (0.5, 0.5, 0.5)), (0.0, 0.020, 0.020)))
    sq = m.node('ShaderNodeSeparateXYZ', {0: q})
    qy, qz = sq.outputs[1], sq.outputs[2]
    r = m.math('SQRT', m.math('ADD', m.math('MULTIPLY', qy, qy), m.math('MULTIPLY', qz, qz)))
    rj = m.noise(scale=1.0, detail=1.0, vector=XYZ(m.math('MULTIPLY', r, 48.0), m.math('MULTIPLY', rnd, 31.0), 0.0))
    ph = m.math('ADD', m.math('MULTIPLY', r, 1.0 / 0.0036), m.math('MULTIPLY', rj, 2.6))
    f = m.math('FRACT', ph)
    tone = m.ramp(f, [(0.0, 0.16), (0.07, 0.03), (0.30, 0.72), (0.86, 1.0), (1.0, 0.62)])        # dark porous earlywood
    early = m.ramp(f, [(0.0, 0.85), (0.06, 1.0), (0.24, 1.0), (0.40, 0.0), (0.97, 0.0), (1.0, 0.85)])
    # --- pores (short dark dashes along the grain), fibre streaks, slow blotches
    pn = m.noise(scale=1.0, detail=1.0, roughness=0.5, vector=m.mapping(q, scale=(150.0, 2600.0, 2600.0)))
    pores = m.math('MULTIPLY', m.map_range(pn, 0.60, 0.76, 0.0, 1.0, smooth=True),
                   m.math('ADD', 0.30, m.math('MULTIPLY', early, 0.70)))
    fn = m.noise(scale=1.0, detail=3.0, roughness=0.6, vector=m.mapping(q, scale=(5.0, 420.0, 420.0)))
    bn = m.noise(scale=9.0, detail=3.0, roughness=0.55, vector=q)
    c_late, c_early = (0.200, 0.072, 0.024), (0.045, 0.016, 0.007)
    col = m.mix(c_early, c_late, m.math('MULTIPLY', tone, m.map_range(fn, 0.25, 0.75, 0.62, 1.0)))
    col = m.mix(col, (0.018, 0.009, 0.005), m.math('MULTIPLY', pores, 0.80))
    col = m.hsv(col, m.map_range(bn, 0.3, 0.7, 0.492, 0.510), m.map_range(bn, 0.3, 0.7, 1.08, 0.90),
                m.map_range(bn, 0.25, 0.75, 0.62, 1.30))
    col = m.jitter(col, hue=0.014, saturation=0.14, value=0.26, source=rnd)                       # board to board
    col = m.hsv(col, 0.5, 1.0, m.mixf(1.0, 0.78, kind))                                           # frame a shade darker
    # --- distance to the nearest arris of the board (second smallest of the three face distances)
    sd = m.node('ShaderNodeSeparateXYZ', {0: VM('SUBTRACT', bh, VM('ABSOLUTE', bl))})
    dx, dy, dz = sd.outputs[0], sd.outputs[1], sd.outputs[2]
    mn = m.math('MINIMUM', m.math('MINIMUM', dx, dy), dz)
    mx = m.math('MAXIMUM', m.math('MAXIMUM', dx, dy), dz)
    edge_d = m.math('SUBTRACT', m.math('SUBTRACT', m.math('ADD', m.math('ADD', dx, dy), dz), mn), mx)
    blr = VM('ADD', bl, XYZ(m.math('MULTIPLY', rnd, 7.3), m.math('MULTIPLY', rnd, 3.1), 0.0))
    wn2 = m.noise(scale=170.0, detail=3.0, roughness=0.65, vector=blr)
    wthr = m.math('ADD', 0.0005, m.math('MULTIPLY', m.math('POWER', wn2, 2.2), 0.0085))
    wear = m.map_range(edge_d, 0.0, wthr, 1.0, 0.0, smooth=True)
    gn = m.noise(scale=60.0, detail=2.0, vector=blr)
    grime = m.math('MULTIPLY', m.map_range(edge_d, 0.0012, 0.012, 1.0, 0.0, smooth=True), m.map_range(gn, 0.3, 0.7, 0.25, 0.85))
    col = m.mix(col, (0.016, 0.010, 0.007), grime)
    raw = m.mix((0.34, 0.185, 0.080), (0.46, 0.285, 0.130), fn)
    col = m.mix(col, raw, m.math('MULTIPLY', wear, 0.80))
    # --- round the pull: decades of fingers (darker, glossier) and the arc the hanging ring has rubbed pale
    sb = m.node('ShaderNodeSeparateXYZ', {0: bl})
    py = m.math('SUBTRACT', sb.outputs[1], PULL_Y)
    dp = m.math('SQRT', m.math('ADD', m.math('MULTIPLY', sb.outputs[0], sb.outputs[0]), m.math('MULTIPLY', py, py)))
    pat = m.math('MULTIPLY', drawer, m.math('MULTIPLY', m.map_range(dp, 0.012, 0.050, 1.0, 0.0, smooth=True),
                                            m.map_range(gn, 0.2, 0.8, 0.45, 1.0)))
    col = m.mix(col, (0.030, 0.014, 0.008), m.math('MULTIPLY', pat, 0.55))
    band = m.math('MULTIPLY', m.map_range(dp, 0.0172, 0.0200, 0.0, 1.0, smooth=True), m.map_range(dp, 0.0222, 0.0252, 1.0, 0.0, smooth=True))
    rub = m.math('MULTIPLY', m.math('MULTIPLY', drawer, band),
                 m.math('MULTIPLY', m.map_range(py, -0.004, -0.014, 0.0, 1.0, smooth=True), m.map_range(wn2, 0.30, 0.62, 0.0, 1.0)))
    col = m.mix(col, raw, m.math('MULTIPLY', rub, 0.55))
    # --- dust settles on whatever faces the sky
    nz = m.node('ShaderNodeSeparateXYZ', {0: m.node('ShaderNodeNewGeometry').outputs['Normal']}).outputs[2]
    dn = m.noise(scale=420.0, detail=3.0, roughness=0.7, vector=blr)
    dust = m.math('MULTIPLY', m.map_range(nz, 0.45, 0.98, 0.0, 1.0, smooth=True), m.map_range(dn, 0.25, 0.75, 0.05, 0.30))
    col = m.mix(col, (0.30, 0.245, 0.185), dust)
    # --- roughness: worn satin shellac, open pores are dull, hand patina is glossy
    rn = m.noise(scale=1.0, detail=3.0, roughness=0.6, vector=m.mapping(q, scale=(26.0, 300.0, 300.0)))
    rough = m.map_range(rn, 0.28, 0.72, 0.27, 0.50)
    rough = m.math('ADD', rough, m.math('MULTIPLY', pores, 0.22))
    rough = m.mixf(rough, 0.21, m.math('MULTIPLY', pat, 0.75))
    rough = m.mixf(rough, 0.40, wear)
    rough = m.mixf(rough, 0.58, rub)
    rough = m.math('ADD', rough, m.math('MULTIPLY', dust, 0.9), clamp=True)
    cn = m.noise(scale=22.0, detail=2.0, vector=blr)
    coat = m.math('MULTIPLY', m.map_range(cn, 0.42, 0.62, 0.0, 0.40, smooth=True), m.math('SUBTRACT', 1.0, wear))
    # --- relief: pores, raised latewood, fine fibre, slow cupping of the old board
    nrm = m.bump(pores, strength=1.0, distance=0.00016, invert=True)
    nrm = m.bump(tone, strength=0.6, distance=0.00007, normal=nrm)
    gr = m.noise(scale=1.0, detail=2.0, roughness=0.6, vector=m.mapping(q, scale=(260.0, 5200.0, 5200.0)))
    nrm = m.bump(gr, strength=0.55, distance=0.00005, normal=nrm)
    cup = m.noise(scale=14.0, detail=1.0, vector=blr)
    nrm = m.bump(cup, strength=0.35, distance=0.0010, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.50, specular=0.5, coat=coat, coat_roughness=0.16, normal=nrm)
    return m


def brass_material():
    """Antique brass: brown oxide in the recesses, bright yellow metal where fingers and the swinging
    ring have polished it, a little verdigris in the creases; roughness follows the same masks."""
    m = C.Mat('old_brass')
    wear = m.attr('wear')
    P = m.per_instance_coords()
    n1 = m.noise(scale=1100.0, detail=4.0, roughness=0.65, vector=P)
    n2 = m.noise(scale=160.0, detail=2.0, vector=P)
    r = m.obj_random()
    t = m.math('ADD', m.math('MULTIPLY', wear, 1.25),
               m.math('ADD', m.math('MULTIPLY', m.math('SUBTRACT', n1, 0.5), 0.85),
                      m.math('ADD', m.math('MULTIPLY', m.math('SUBTRACT', n2, 0.5), 0.60),
                             m.math('SUBTRACT', m.math('MULTIPLY', r, 0.34), 0.30))), clamp=True)
    col = m.ramp(t, [(0.0, (0.040, 0.024, 0.012)), (0.30, (0.20, 0.105, 0.036)), (0.62, (0.52, 0.32, 0.095)),
                     (1.0, (0.86, 0.60, 0.22))])
    vn = m.noise(scale=520.0, detail=3.0, roughness=0.6, vector=P)
    verd = m.math('MULTIPLY', m.map_range(vn, 0.63, 0.76, 0.0, 1.0, smooth=True), m.map_range(t, 0.10, 0.45, 0.75, 0.0))
    col = m.mix(col, (0.070, 0.20, 0.155), verd)
    rough = m.ramp(t, [(0.0, 0.66), (0.35, 0.50), (0.70, 0.33), (1.0, 0.20)])
    rough = m.mixf(rough, 0.85, verd)
    pit = m.noise(scale=2600.0, detail=3.0, roughness=0.7, vector=P)
    nrm = m.bump(pit, strength=0.5, distance=0.00004)
    nrm = m.bump(n2, strength=0.25, distance=0.00012, normal=nrm)
    m.set(base_color=col, metallic=m.mixf(1.0, 0.15, verd), roughness=rough, normal=nrm)
    return m


def paper_material(atlas_path):
    m = C.Mat('label_paper')
    img = bpy.data.images.load(atlas_path)
    img.alpha_mode = 'CHANNEL_PACKED'
    tex = m.node('ShaderNodeTexImage', {'Vector': m.coords('UV')}, image=img, interpolation='Cubic', extension='EXTEND')
    col = m.hsv(tex.outputs['Color'], 0.5, 1.0, 0.86)
    bw = m.node('ShaderNodeRGBToBW', {0: tex.outputs['Color']}).outputs[0]
    fib = m.noise(scale=3200.0, detail=3.0, roughness=0.7, vector=m.position())
    nrm = m.bump(bw, strength=0.35, distance=0.00006)
    nrm = m.bump(fib, strength=0.5, distance=0.00003, normal=nrm)
    m.set(base_color=col, roughness=m.map_range(bw, 0.1, 0.8, 0.62, 0.86), specular=0.25, sheen=0.25, sheen_roughness=0.6,
          alpha=tex.outputs['Alpha'], normal=nrm)
    return m


# ============================================================================= 4. scene assembly
def build_cabinet(cam, seed=1):
    """Everything the lens sees (+ margin): boards, labels, brass pulls, dark carcass behind the gaps."""
    rng = np.random.default_rng(seed)
    dphi = 2 * math.pi / N_COL
    tb = row_bounds(cam['t_limb'] + math.radians(1.2), cam['t_bottom'] - math.radians(13.0), cam['t_limb'] + math.radians(15.0))
    nrow = len(tb) - 1
    # columns needed: project a fan of cell centres, keep what can touch the frame
    imax = 1
    for i in range(1, N_COL // 4):
        Pc, _ = surf(0.5 * (tb[:-1] + tb[1:]), np.full(nrow, (i - 0.5) * dphi))
        x, y, z = project(Pc, cam)
        if ((x < 1.10) & (y > 0.40) & (y < 1.12) & (z > 0)).any():
            imax = i + 1
    cols = list(range(-imax, imax + 1))

    wood, paper_frames, label_score = Boards(), [], []
    pulls = []
    cells = {}
    ajar = set()
    # ---- drawer fronts
    for j in range(nrow):
        t0, t1 = tb[j], tb[j + 1]
        tc = 0.5 * (t0 + t1)
        hd = float(np.linalg.norm(surf(t1, 0.0)[0] - surf(t0, 0.0)[0])) - RAIL_W - 2 * GAP
        wd = 2 * A_EQ * min(math.sin(t0), math.sin(t1)) * math.sin(0.5 * dphi) - STILE_W - 2 * GAP
        for i in cols:
            O, R = cell_frame(tc, i * dphi)
            inset = rng.uniform(0.0002, 0.0016)
            if rng.random() < 0.022 and t1 < cam['t_limb'] - 0.1:
                inset = -rng.uniform(0.002, 0.006)                    # a drawer left slightly ajar
                ajar.add((i, j))
            Rd = R @ rot_z(rng.normal(0, 0.0030)) @ rot_x(rng.normal(0, 0.0035)) @ rot_y(rng.normal(0, 0.0030))
            Of = O - R[:, 2] * inset + R[:, 0] * rng.normal(0, 0.00025) - R[:, 1] * rng.uniform(0.0002, 0.0008)
            wood.add(Of - Rd[:, 2] * 0.5 * T_FRONT, Rd, (0.5 * wd, 0.5 * hd, 0.5 * T_FRONT), 0, rng)
            cells[(i, j)] = dict(O=Of, R=Rd, wd=wd, hd=hd)
            paper_frames.append((Of, Rd))
            x, y, z = project(Of + Rd[:, 1] * LABEL_Y, cam)
            facing = float(Rd[:, 2] @ (cam['pos'] - Of)) / float(np.linalg.norm(cam['pos'] - Of))
            inside = (0.03 < x < 0.97) and (y < 0.975) and facing > 0.12
            label_score.append(facing / z ** 2 * (1.0 if inside else 1e-3))
            pulls.append((Of + Rd[:, 1] * PULL_Y, Rd))
    # ---- rails (ring segments at every row boundary) and stiles (between neighbours in a row)
    for j in range(nrow + 1):
        for i in cols:
            N0, _ = surf(tb[j], (i - 0.5) * dphi)
            N1, _ = surf(tb[j], (i + 0.5) * dphi)
            M, n = surf(tb[j], i * dphi)
            ax = (N1 - N0) / np.linalg.norm(N1 - N0)
            n = n - ax * (n @ ax)
            n /= np.linalg.norm(n)
            front = 0.0
            for jj, sg in ((j - 1, 1.0), (j, -1.0)):                  # drawer edges that meet this rail
                c = cells.get((i, jj))
                if c is not None and (i, jj) not in ajar:
                    e = c['O'] + c['R'][:, 1] * sg * 0.5 * c['hd']
                    front = max(front, float((e - 0.5 * (N0 + N1)) @ n))
            front += rng.uniform(0.0006, 0.0013)
            R = np.stack([ax, np.cross(n, ax), n], 1)
            wood.add(0.5 * (N0 + N1) + n * (front - 0.5 * T_FRAME), R,
                     (0.5 * np.linalg.norm(N1 - N0) + 0.0002, 0.5 * RAIL_W, 0.5 * T_FRAME), 1, rng)
    for j in range(nrow):
        t0, t1 = tb[j], tb[j + 1]
        tc = 0.5 * (t0 + t1)
        for i in cols + [cols[-1] + 1]:
            phb = (i - 0.5) * dphi
            Pa, _ = surf(t0, phb)
            Pb, _ = surf(t1, phb)
            M, n = surf(tc, phb)
            ax = (Pb - Pa) / np.linalg.norm(Pb - Pa)
            n = n - ax * (n @ ax)
            n /= np.linalg.norm(n)
            mid = 0.5 * (Pa + Pb)
            front = float((M - mid) @ n)
            for ii, sg in ((i - 1, 1.0), (i, -1.0)):
                c = cells.get((ii, j))
                if c is not None and (ii, j) not in ajar:
                    e = c['O'] + c['R'][:, 0] * sg * 0.5 * c['wd']
                    front = max(front, float((e - mid) @ n))
            front += rng.uniform(0.0003, 0.0009)
            wd = cells[(cols[0], j)]['wd']
            w0 = 2 * A_EQ * math.sin(t0) * math.sin(0.5 * dphi) - wd - 2 * GAP
            w1 = 2 * A_EQ * math.sin(t1) * math.sin(0.5 * dphi) - wd - 2 * GAP
            wm = 0.5 * (w0 + w1)
            R = np.stack([ax, np.cross(n, ax), n], 1)
            wood.add(mid + n * (front - 0.5 * T_FRAME), R,
                     (0.5 * (np.linalg.norm(Pb - Pa) - RAIL_W) + 0.0002, 0.5 * wm, 0.5 * T_FRAME), 1, rng,
                     taper=(w1 - w0) / (2 * wm))
    wood_ob = wood.build('cabinet_wood', wood_material())

    # ---- labels: the largest, most frontal ones get the film's hero ingredients
    names = all_names()
    order = np.argsort(-np.array(label_score))
    nh = len(HERO)
    perm_h = rng.permutation(nh)
    rest = rng.permutation(np.arange(nh, len(names)))
    cell_idx = np.zeros(len(order), int)
    for rank, k in enumerate(order):
        if rank < nh:
            cell_idx[k] = perm_h[rank]
        else:
            cell_idx[k] = rest[(rank - nh) % len(rest)]
    atlas, acols, arows = make_label_atlas(names, seed=seed)
    lv, lf, luv = label_mesh_arrays(paper_frames, cell_idx, acols, arows, rng)
    paper_ob = C.mesh_from_arrays('labels', lv, lf, smooth=True, material=paper_material(atlas), uvs=luv)

    # ---- brass pulls: backplate + eye fixed to the drawer, ring hanging under gravity against the front
    brass = brass_material()
    plates = [C.mesh_from_arrays('plate%d' % k, *make_backplate(k)[:2], attrs=make_backplate(k)[2], material=brass, link=False).data
              for k in range(4)]
    rings = []
    for k in range(5):
        v, f, at, Rk = make_ring(k)
        rings.append((C.mesh_from_arrays('ring%d' % k, v, f, attrs=at, material=brass, link=False).data, Rk))
    coll = bpy.data.collections.new('pulls')
    bpy.context.scene.collection.children.link(coll)
    g = np.array([0.0, 0.0, -1.0])
    for k, (O, R) in enumerate(pulls):
        yaw_p = rng.normal(0, 0.10)
        ob = bpy.data.objects.new('pl%03d' % k, plates[int(rng.integers(len(plates)))])
        Rp = R @ rot_z(yaw_p)
        ob.matrix_world = Matrix(np.vstack([np.column_stack([Rp, O]), [0, 0, 0, 1]]).tolist())
        coll.objects.link(ob)
        n = R[:, 2]
        gt = g - n * (g @ n)                                         # downhill direction in the drawer face
        slope = float(np.linalg.norm(gt))
        psi = math.atan2(float(gt @ R[:, 0]), -float(gt @ R[:, 1]))
        psi += rng.normal(0, math.radians(4.0 + 30.0 * (1.0 - slope) ** 2))
        md, Rk = rings[int(rng.integers(len(rings)))]
        tilt = math.asin(min(0.5, (EYE_Z - RING_WIRE * 1.12 - 0.0002) / (2 * Rk))) + abs(rng.normal(0, 0.012))
        Rr = R @ rot_z(psi) @ rot_x(tilt) @ rot_y(rng.normal(0, 0.05))
        ob = bpy.data.objects.new('rg%03d' % k, md)
        ob.matrix_world = Matrix(np.vstack([np.column_stack([Rr, O + n * EYE_Z]), [0, 0, 0, 1]]).tolist())
        coll.objects.link(ob)

    # ---- dark carcass behind the hairline gaps (also guarantees a solid alpha)
    tt = np.linspace(tb[0] - 0.12, tb[-1] + 0.25, 220)
    pp = np.linspace((cols[0] - 2.5) * dphi, (cols[-1] + 2.5) * dphi, 260)
    T, PH = np.meshgrid(tt, pp, indexing='ij')
    Pb, _ = surf(T, PH, off=-0.0115)
    blk = C.mesh_from_arrays('carcass', Pb.reshape(-1, 3), C.grid_faces(len(tt), len(pp), wrap_v=False), smooth=True,
                             material=C.simple_material('carcass_dark', (0.012, 0.007, 0.004), 0.9))
    print('[cabinet] rows=%d cols=%d drawers=%d boards=%d  limb t=%.1f deg' % (
        nrow, len(cols), len(pulls), len(wood.items), math.degrees(cam['t_limb'])))
    return dict(wood=wood_ob, labels=paper_ob, carcass=blk, names=[names[c] for c in cell_idx])


def make_items(seed=0):
    """Loose items for the flat-lay version.  The cabinet is a bespoke built scene (no loose pieces of
    an ingredient), so the list is empty by contract."""
    return dict(objects=[], footprint_r=[], half_height=[], name=NAME_CN)


# ============================================================================= 5. harness (common.py)
def make_camera(cam):
    cd = bpy.data.cameras.new('cam')
    cd.lens = LENS
    cd.sensor_width = C.SENSOR_MM
    cd.sensor_fit = 'HORIZONTAL'
    cd.clip_start, cd.clip_end = 0.2, 60.0
    ob = bpy.data.objects.new('cam', cd)
    r, u, f, p = cam['right'], cam['up'], cam['fwd'], cam['pos']
    ob.matrix_world = Matrix(((r[0], u[0], -f[0], p[0]), (r[1], u[1], -f[1], p[1]), (r[2], u[2], -f[2], p[2]), (0, 0, 0, 1)))
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def area_light(name, pos, target, size, power, color, size_y=None, spread=math.pi):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE' if size_y else 'DISK'
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.energy = power
    ld.color = color
    ld.spread = spread
    ob = bpy.data.objects.new(name, ld)
    p = Vector(pos)
    d = (Vector(target) - p).normalized()
    ob.matrix_world = Matrix.Translation(p) @ d.to_track_quat('-Z', 'Y').to_matrix().to_4x4()
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lights(cam):
    """Warm low-key apothecary light: one big warm source high on the left raking across the fronts,
    an amber kicker low behind the limb (sheen on the far rows, glints on the rings), dim fill."""
    T = np.array(cam['target'], float)

    def at(d, dist):
        d = np.array(d, float)
        return T + d / np.linalg.norm(d) * dist
    area_light('key', at((-0.66, 0.02, 0.75), 5.2), T, 2.2, 1100.0, (1.0, 0.80, 0.56))
    area_light('kick', at((0.48, 0.80, 0.36), 5.5), T + [0.0, 0.2, 0.25], 2.6, 1100.0, (1.0, 0.66, 0.36), size_y=0.9)
    area_light('fill', at((0.55, -0.80, 0.25), 5.0), T, 4.0, 90.0, (0.80, 0.74, 0.70))
    C.world_gradient(horizon=(0.030, 0.017, 0.007), zenith=(0.020, 0.013, 0.008), ground=(0.004, 0.003, 0.002))


def main():
    args = C.parse_args()
    if args.quality == 'final' and not args.res:
        args.q['res'] = FINAL_RES
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    sc = bpy.context.scene
    sc.cycles.diffuse_bounces = 2                                   # hard-surface scene: keep paths short
    sc.cycles.glossy_bounces = 3
    sc.cycles.max_bounces = 6
    cam = solve_camera()
    print('[camera] D=%.3f pitch=%.2f deg  limb %.2f m  near %.2f m  frame width at limb %.2f m' % (
        cam['D'], math.degrees(cam['beta']), cam['limb_dist'], cam['near_dist'], cam['scale']))
    build_cabinet(cam, seed=args.seed)
    cob = make_camera(cam)
    focus = 1.0 / (0.60 / cam['near_dist'] + 0.40 / cam['limb_dist'])
    fstop = 6.3
    C.set_dof(cob, focus, fstop)
    W = FINAL_RES[0]
    print('[dof] focus %.2f m f/%.1f  blur near %.1f px, limb %.1f px (at %d px width)' % (
        focus, fstop, C.blur_px(cob, focus, cam['near_dist'], fstop, W), C.blur_px(cob, focus, cam['limb_dist'], fstop, W), W))
    lights(cam)
    res = C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp, crop=args.region, text=not args.region)
    print('[comp]', comp)
    return res


if __name__ == '__main__':
    main()
