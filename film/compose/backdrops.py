#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""2D backdrops of the 《药食同源》 rebuild - resolution independent (4K master).

Everything is re-synthesised in float from models that were reverse-engineered
from the original 1920x1080 film; nothing is a blown-up copy of an old frame.

    horizon_bg(frame_idx, scale=2, fade=False, dither=1.0)   frames 0-191, 736-1247
    yinyang_bg(frame_idx, scale=2, dither=1.0)               frames 192-255
    sky_plate(shot_id, frame_idx, scale=2, stars=True, dither=1.0)
                                                             frames 256-735 (29 shots)
    backdrop(frame_idx, scale=2)      dispatcher over the cut list (any frame)
    sky_colors() / write_sky_colors(path)   zenith / mid / horizon colour per shot

All of them return float32 sRGB (gamma-encoded) 0..1, shape (1080*scale,
1920*scale, 3).  scale=1 -> 1920x1080, scale=2 -> 3840x2160.  frame_idx is the
0-based frame of the 1248-frame / 30 fps film.  dither is the TPDF amplitude in
8-bit LSB (0 = off); it is the very last operation.

Geometry convention: all models live in 1080p pixel-CENTRE coordinates
(pixel i of the 1920x1080 original is at x = i).  Output pixel j at `scale`
sits at x = (j + 0.5) / scale - 0.5.

Models (data in backdrops_data.npz, built by the scripts described in the
"_about" entry of that file):

 * horizon (intro / outro): planet limb = circle R 2800 centred x 959.5; its top
   moves 935.70 -> 580.80 (smoothstep f90..137.8) in the intro and 935.69 ->
   699.94 (smoothstep f1062..1148) in the outro.  Picture = clip(B + g(f) * G)
   where B (base) and G (glow) are smooth tables over (distance from the limb,
   |x - 959.5|) and g(f) is ONE scalar glow level per frame (0 at f736-751,
   1 for f0-89, ~5.6 at f182+, ~6.1 at f1175+; hard steps at f752 and f1056 as
   in the original).  The limb edge is rebuilt as a clean 1-output-pixel
   coverage edge between the extrapolated outer and inner profiles.
 * yin-yang: limb circle x 958.89, top 579.77, R(t) growing 2806.8 -> 2871.1;
   dot and moon follow the measured tracks (rigid rotation -5.2e-4 rad/frame
   about the planet centre + ~2.2 % zoom).  Shading = smooth fit of the
   original; paper texture, limb shading and edges are new and procedural.
 * sky plates: per shot a smooth tension-spline fit of the star-free sky
   (text + foreground masked), continued below the old horizon with a damped
   gradient (no extrapolation blow-up); stars = catalogue of sub-pixel points
   (position, RGB flux) that drift exactly like the original star field:
   p(t) = c + (p0 - c) * exp((lam + i*omega) * (f - start))  (see sky_motion()).
   Stars do not twinkle in the original (flux constant within measurement noise).
   The fit is done in limb-following coordinates, so the tinted haze that hugs
   the horizon is kept and bridged correctly behind the title.

CLI:
    python backdrops.py --frame 120 --scale 2 --out x.png
    python backdrops.py --shot m02_gouqi --frame 470 --out sky.png
    python backdrops.py --sheet sheet.jpg
    python backdrops.py --colors ../sky_colors.json
    python backdrops.py --bench
"""
import json
import math
import os
from functools import lru_cache

import cv2
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.special import erf

_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.environ.get('YAOSHI_BACKDROP_DATA', os.path.join(_HERE, 'backdrops_data.npz'))
SHOTS_PATH = os.environ.get('YAOSHI_SHOTS', os.path.join(os.path.dirname(_HERE), 'shots.json'))
W, H = 1920, 1080
NFRAMES = 1248
INTRO = (0, 192)
YINYANG = (192, 256)
MONTAGE = (256, 736)
OUTRO = (736, 1248)

# ----------------------------------------------------------------------------- data

_D = None


def _data():
    global _D
    if _D is None:
        z = np.load(DATA_PATH, allow_pickle=False)
        _D = {k: z[k] for k in z.files}
    return _D


@lru_cache(maxsize=1)
def shots():
    """[{id, start, end, ...}] from shots.json (falls back to the table in the data file)."""
    try:
        return json.load(open(SHOTS_PATH, encoding='utf-8'))['shots']
    except Exception:
        d = _data()
        return [dict(id=str(i), start=int(a), end=int(b))
                for i, a, b in zip(d['shot_ids'], d['shot_start'], d['shot_end'])]


def shot_at(frame_idx):
    for s in shots():
        if s['start'] <= frame_idx < s['end']:
            return s['id']
    return None


def _shot(shot_id):
    for s in shots():
        if s['id'] == shot_id:
            return s
    raise KeyError(shot_id)


# ----------------------------------------------------------------------------- helpers

def _smoothstep(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3.0 - 2.0 * u)


def _axes(scale):
    """1080p pixel-centre coordinates of the output pixel centres."""
    xs = (np.arange(W * scale, dtype=np.float32) + 0.5) / scale - 0.5
    ys = (np.arange(H * scale, dtype=np.float32) + 0.5) / scale - 0.5
    return xs, ys


@lru_cache(maxsize=1)
def _dither_tile():
    rng = np.random.default_rng(20241111)
    t = rng.random((512, 512, 3), dtype=np.float32) - rng.random((512, 512, 3), dtype=np.float32)
    return t / 255.0          # TPDF, +-1 LSB peak


def _apply_dither(img, frame_idx, amp):
    """In place: TPDF dither (amp in 8-bit LSB), new offset every frame."""
    if not amp:
        return img
    rng = np.random.default_rng(1000003 * (int(frame_idx) + 7))
    t = np.roll(_dither_tile(), (int(rng.integers(0, 512)), int(rng.integers(0, 512))), (0, 1))
    if amp != 1.0:
        t = t * np.float32(amp)
    h, w = img.shape[:2]
    for y in range(0, h, 512):
        hh = min(512, h - y)
        for x in range(0, w, 512):
            ww = min(512, w - x)
            img[y:y + hh, x:x + ww] += t[:hh, :ww]
    return img


def global_fade(frame_idx):
    """Same key as timeline.json: 1 until f1222, smoothstep to 0 at f1246."""
    return 1.0 - _smoothstep((frame_idx - 1222.0) / 24.0)


# ----------------------------------------------------------------------------- 1. horizon

HZ_CX, HZ_R = 959.5, 2800.0
_HZ_NI, _HZ_DI0 = 106, -99.5      # inner rows: d = -99.5 + k   (k = 0..105  -> +5.5)
_HZ_DO0 = -5.5                    # outer rows: d = -5.5 + k    (k = 0..1155 -> 1149.5)


def horizon_limb_y(frame_idx):
    """y (1080p pixel-centre coords) of the top of the planet limb."""
    f = float(frame_idx)
    if f < 464:
        return 935.70 + (580.80 - 935.70) * _smoothstep((f - 90.05) / (137.83 - 90.05))
    return 935.69 + (699.94 - 935.69) * _smoothstep((f - 1062.0) / (1148.0 - 1062.0))


def horizon_glow(frame_idx):
    """Scalar glow level g(f) (1 = first intro card)."""
    gt = _data()['hz_g']
    return float(gt[int(min(max(frame_idx, 0), len(gt) - 1))])


@lru_cache(maxsize=1)
def _hz_luts():
    """Stacked (inner rows, then outer rows) base / glow tables, x upsampled to 4 px bins."""
    d = _data()

    def upx(a):
        nx = a.shape[1]
        xc = np.arange(nx) * 16 + 8.0
        xm = np.r_[-xc[3::-1], xc]
        am = np.concatenate([a[:, 3::-1], a], 1)
        cs = CubicSpline(xm, am, axis=1, bc_type='natural')
        xn = np.arange(256) * 4 + 2.0
        return cs(np.clip(xn, 0, xc[-1])).astype(np.float32)

    lb = np.concatenate([upx(d['hz_Bi']), upx(d['hz_Bo'])], 0)
    lg = np.concatenate([upx(d['hz_Gi']), upx(d['hz_Go'])], 0)
    return np.ascontiguousarray(lb), np.ascontiguousarray(lg)


@lru_cache(maxsize=2)
def _hz_cols(scale):
    xs, ys = _axes(scale)
    dx = np.abs(xs - HZ_CX)
    cols = np.ascontiguousarray(np.broadcast_to((dx / 4.0 - 0.5)[None, :], (H * scale, W * scale)), np.float32)
    return dx, dx * dx, ys, cols


def _hz_coords(cy, scale):
    """remap coordinates into the stacked tables + the 1-pixel limb band (analytic)."""
    dx, dx2, ys, cols = _hz_cols(scale)
    rows = ((ys - np.float32(cy)) ** 2)[:, None] + dx2[None, :]
    cv2.sqrt(rows, rows)
    rows += np.float32(-HZ_R - _HZ_DI0)                    # inner rows: d + 99.5
    rows[rows >= -_HZ_DI0] += np.float32(_HZ_NI + _HZ_DI0 - _HZ_DO0)   # outer rows: d + 111.5
    x64 = dx.astype(np.float64)
    yl = cy - np.sqrt(HZ_R ** 2 - x64 ** 2)
    ii = np.floor((yl + 0.5) * scale - 0.5).astype(np.int64)[None, :] + np.arange(-1, 3)[:, None]
    jj = np.broadcast_to(np.arange(len(dx))[None, :], ii.shape)
    dd = np.sqrt(x64[None, :] ** 2 + ((ii + 0.5) / scale - 0.5 - cy) ** 2) - HZ_R
    k = (np.abs(dd) < 0.5 / scale) & (ii >= 0) & (ii < H * scale)
    band = (ii[k], jj[k])
    return rows, cols, band, dd[k], np.clip(x64[jj[k]] / 4.0 - 0.5, 0, 254.999)


def _bilin(lut, r, c):
    r0 = np.floor(r).astype(np.int64)
    c0 = np.floor(c).astype(np.int64)
    fr = (r - r0)[:, None]
    fc = (c - c0)[:, None]
    r1 = np.minimum(r0 + 1, lut.shape[0] - 1)
    c1 = np.minimum(c0 + 1, lut.shape[1] - 1)
    return ((lut[r0, c0] * (1 - fc) + lut[r0, c1] * fc) * (1 - fr)
            + (lut[r1, c0] * (1 - fc) + lut[r1, c1] * fc) * fr)


_hz_cache = {}


def horizon_bg(frame_idx, scale=2, fade=False, dither=1.0):
    """Intro / outro planet horizon.  fade=True also applies the end-of-film fade."""
    lb, lg = _hz_luts()
    g = horizon_glow(frame_idx)
    cy = horizon_limb_y(frame_idx) + HZ_R
    key = (scale, round(cy, 3))
    moving = abs(horizon_limb_y(frame_idx + 1) - horizon_limb_y(frame_idx - 1)) > 1e-6
    lut = lb + np.float32(g) * lg
    if moving:
        rows, cols, band, bd, bc = _hz_coords(cy, scale)
        out = cv2.remap(lut, cols, rows, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    else:
        if key not in _hz_cache:
            _hz_cache.clear()
            rows, cols, band, bd, bc = _hz_coords(cy, scale)
            bi = cv2.remap(lb, cols, rows, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            gi = cv2.remap(lg, cols, rows, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            _hz_cache[key] = (bi, gi, band, bd, bc)
        bi, gi, band, bd, bc = _hz_cache[key]
        out = cv2.addWeighted(bi, 1.0, gi, float(g), 0.0)
    # clean coverage edge: a = fraction of the output pixel outside the planet
    if len(bd):
        a = np.clip(bd * scale + 0.5, 0.0, 1.0)[:, None]
        vo = _bilin(lut, np.clip(bd - _HZ_DO0 + _HZ_NI, _HZ_NI, lut.shape[0] - 1), bc)
        vi = _bilin(lut, np.clip(bd - _HZ_DI0, 0, _HZ_NI - 1), bc)
        out[band] = (a * vo + (1 - a) * vi).astype(np.float32)
    k = 1.0 / 255.0
    if fade:                       # the fade multiplies the CLIPPED picture
        fd = global_fade(frame_idx)
        if fd < 1.0:
            np.minimum(out, np.float32(255.0), out=out)
            k *= fd
    out *= np.float32(k)
    _apply_dither(out, frame_idx, dither)
    return np.clip(out, 0.0, 1.0, out=out)


# ----------------------------------------------------------------------------- 2. yin-yang

YY_CX, YY_YTOP = 958.8946, 579.7666
_YY_R = (0.003368253487726585, 0.8063264740211592, 2806.81800530188)
_YY_DOT_X = (-0.0005162398974651086, -1.0244143511553756, 1644.3703434372674)
_YY_DOT_Y = (0.0002159430169204735, -0.22302041130351946, 974.900876813747)
_YY_DOT_R = (0.020810826182802316, 62.33279953186329)
_YY_MOON_X = (-0.00042532939401429017, -1.8331496501144504, 210.48531976141638)
_YY_MOON_Y = (0.0005554697063514368, 0.3204458620340621, 370.7931452170543)
_YY_MOON_R = (0.023415023153954932, 69.75088695379405)
_YY_OMEGA = -0.00052767            # planet rotation, rad / frame (from the dot)
_YY_PLANET_POLY = (218.5532, 7.7378, 71.3942, -159.4890, 56.1429, -11.2920, -7.0875, 46.2712,
                   -20.9664, 26.4569, -127.3903, 60.4683, 29.4546, -38.5678, -17.7207)
_YY_PLANET_RGB = (1.0481, 1.0143, 0.9374)
_YY_SPACE_RGB = (0.9474, 0.9468, 1.1056)
_YY_SPACE_LUM = 12.2
_YY_TEX_BOX = (-32.0, 556.0, 2048, 560)     # x0, y0, w, h of the planet texture canvas (1080p units)


def yinyang_geometry(frame_idx):
    """Measured layout at a frame: dict(limb=(cx, cy, R), dot=(x, y, r), moon=(x, y, r))."""
    t = float(frame_idx) - 192.0
    r = np.polyval(_YY_R, t)
    return dict(limb=(YY_CX, YY_YTOP + r, r),
                dot=(np.polyval(_YY_DOT_X, t), np.polyval(_YY_DOT_Y, t), np.polyval(_YY_DOT_R, t)),
                moon=(np.polyval(_YY_MOON_X, t), np.polyval(_YY_MOON_Y, t), np.polyval(_YY_MOON_R, t)))


def _paper(h, w, seed):
    """Subtle xuan-paper / stone texture, multiplicative, mean 1 (h, w in generator pixels)."""
    rng = np.random.default_rng(seed)

    def noise(sig, amp):
        if sig > 6:                      # big scales at low res
            k = int(sig // 3)
            n = rng.standard_normal((h // k + 3, w // k + 3)).astype(np.float32)
            n = cv2.GaussianBlur(n, (0, 0), sig / k)
            n = cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
        else:
            n = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), sig)
        return n * np.float32(amp / max(float(n.std()), 1e-6))

    tex = 1.0 + noise(0.9, 0.010) + noise(2.6, 0.006) + noise(9.0, 0.007) + noise(34.0, 0.009) \
        + noise(120.0, 0.010)
    # paper fibres: thin, slightly curved strands
    dark = np.zeros((h, w), np.uint8)
    light = np.zeros((h, w), np.uint8)
    n_f = int(h * w / 1100)
    for i in range(n_f):
        x0, y0 = rng.uniform(-40, w + 40), rng.uniform(-40, h + 40)
        ln = float(rng.gamma(2.2, 26.0)) + 10.0
        ang = math.radians(rng.normal(-10.0, 28.0))
        bend = rng.normal(0.0, 0.16) * ln
        p0 = np.array([x0, y0])
        dv = np.array([math.cos(ang), math.sin(ang)])
        nv = np.array([-dv[1], dv[0]])
        ts = np.linspace(0, 1, 9)[:, None]
        pts = p0 + dv * ln * ts + nv * bend * 4 * ts * (1 - ts)
        pts = np.round(pts * 16).astype(np.int32).reshape(-1, 1, 2)
        if i % 4 == 0:
            cv2.polylines(light, [pts], False, int(rng.integers(40, 150)), 1, cv2.LINE_AA, 4)
        else:
            cv2.polylines(dark, [pts], False, int(rng.integers(40, 200)), 1, cv2.LINE_AA, 4)
    fib = cv2.GaussianBlur(light.astype(np.float32) * (0.030 / 255) - dark.astype(np.float32) * (0.050 / 255),
                           (0, 0), 0.75)
    return np.clip(tex + fib, 0.86, 1.08).astype(np.float32)


@lru_cache(maxsize=2)
def _yy_static(scale):
    gen = max(2, int(math.ceil(scale)))
    x0, y0, tw, th = _YY_TEX_BOX
    tex = _paper(th * gen, tw * gen, 71)
    moon = _paper(176 * gen, 176 * gen, 72)
    if gen != scale:
        f = scale / gen
        tex = cv2.resize(tex, (int(round(tw * scale)), int(round(th * scale))), interpolation=cv2.INTER_AREA)
        moon = cv2.resize(moon, (int(round(176 * scale)), int(round(176 * scale))), interpolation=cv2.INTER_AREA)
    xs, ys = _axes(scale)
    u = ((xs - 959.5) / 960.0)[None, :]
    v = ((ys - 539.5) / 540.0)[:, None]
    # smooth shading of the planet (frame fixed), degree-4 fit of the original
    lum = np.zeros((len(ys), len(xs)), np.float32)
    k = 0
    for i in range(5):
        for j in range(5 - i):
            lum += np.float32(_YY_PLANET_POLY[k]) * (u ** i) * (v ** j)
            k += 1
    np.clip(lum, 120.0, 245.0, out=lum)
    rr = np.sqrt(u * u + (0.5625 * v) ** 2)
    q = np.clip((rr - 0.80) / 0.35, 0, 1)
    space = (_YY_SPACE_LUM * (1.0 - 0.34 * q * q * (3 - 2 * q))).astype(np.float32)
    return tex, moon, lum, space, xs, ys


def yinyang_bg(frame_idx, scale=2, dither=1.0):
    """Taiji scene: off-white paper planet with a black dot, small moon, black space."""
    tex, moontex, lum, space, xs, ys = _yy_static(scale)
    t = float(frame_idx) - 192.0
    geo = yinyang_geometry(frame_idx)
    cx, cy, R = geo['limb']
    hh, ww = lum.shape
    srgb = np.array(_YY_SPACE_RGB, np.float32) / 255.0
    prgb = np.array(_YY_PLANET_RGB, np.float32) / 255.0
    out = np.empty((hh, ww, 3), np.float32)
    # rows: [0, r0) space only | [r0, r1) limb band | [r1, hh) deep inside the planet
    r0 = max(0, int(math.floor((YY_YTOP - 70.0 + 0.5) * scale)))
    y_low = cy - math.sqrt(max(R * R - max(cx, W - 1 - cx) ** 2, 0.0))       # limb at the frame edge
    r1 = min(hh, max(r0, int(math.ceil((y_low + 80.0 + 0.5) * scale))))
    out[:r0] = space[:r0, :, None] * srgb
    # texture: rigid rotation about the planet centre + zoom (planet-fixed coordinates)
    R0 = np.polyval(_YY_R, 0.0)
    k = R / R0
    dl = _YY_OMEGA * t
    ca, sa = k * math.cos(dl), k * math.sin(dl)
    c0 = np.array([YY_CX, YY_YTOP + R0])
    A = np.array([[ca, -sa], [sa, ca]])                     # p = C + A (p0 - C0)   (1080p coords)
    b = np.array([cx, cy]) - A @ c0
    off0 = np.array([0.5 / scale - 0.5 + _YY_TEX_BOX[0], 0.5 / scale - 0.5 + _YY_TEX_BOX[1]])
    M = np.zeros((2, 3))
    M[:, :2] = A                                            # canvas pixel -> output pixel
    M[:, 2] = (A @ off0 + b + 0.5) * scale - 0.5
    M[1, 2] -= r0
    shade = cv2.warpAffine(tex, M, (ww, hh - r0), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    shade *= lum[r0:]
    # dot: soft contact shadow on the paper now, the hole itself at the end
    dxp, dyp, dr = geo['dot']
    pad = dr + 40.0
    dj0 = max(0, int((dxp - pad + 0.5) * scale)); dj1 = min(ww, int((dxp + pad + 0.5) * scale) + 1)
    di0 = max(r0, int((dyp - pad + 0.5) * scale)); di1 = min(hh, int((dyp + pad + 0.5) * scale) + 1)
    has_dot = dj1 > dj0 and di1 > di0
    if has_dot:
        dd = np.sqrt(((xs[dj0:dj1] - np.float32(dxp)) ** 2)[None, :]
                     + ((ys[di0:di1] - np.float32(dyp)) ** 2)[:, None]) - np.float32(dr)
        shade[di0 - r0:di1 - r0, dj0:dj1] *= (1.0 - 0.07 * np.exp(-np.maximum(dd, 0.0) / 5.0))
    # ---- limb band
    nb = r1 - r0
    if nb > 0:
        dist = ((ys[r0:r1] - np.float32(cy)) ** 2)[:, None] + ((xs - np.float32(cx)) ** 2)[None, :]
        cv2.sqrt(dist, dist)
        dist -= np.float32(R)                               # < 0 inside the planet
        cov = np.clip(dist * np.float32(-scale) + np.float32(0.5), 0.0, 1.0)
        sb = shade[:nb]
        sb *= (1.0 - np.float32(0.11) * cv2.exp(np.minimum(dist, 0.0) * np.float32(0.1)))   # limb shading
        bloom = cv2.exp(np.maximum(dist, 0.0) * np.float32(-1.0 / 14.0))
        bloom *= np.float32(0.012 * 229.5)
        bloom[dist < -1.0] = 0.0
        inv = 1.0 - cov
        a = cov * sb
        sp = space[r0:r1] * inv
        bloom *= inv
        for c in range(3):
            out[r0:r1, :, c] = sp * srgb[c] + bloom * prgb[c] + a * prgb[c]
    if r1 < hh:
        for c in range(3):
            np.multiply(shade[nb:], prgb[c], out=out[r1:, :, c])
    if has_dot:
        hole = np.clip(dd * scale + 0.5, 0.0, 1.0)[:, :, None]          # 1 = paper, 0 = hole
        reg = out[di0:di1, dj0:dj1]
        reg[:] = reg * hole + (space[di0:di1, dj0:dj1, None] * srgb) * (1.0 - hole)
    # ---- moon
    mx, my, mr = geo['moon']
    pad = mr + 40.0
    j0 = max(0, int(math.floor((mx - pad + 0.5) * scale)))
    j1 = min(ww, int(math.ceil((mx + pad + 0.5) * scale)))
    i0 = max(0, int(math.floor((my - pad + 0.5) * scale)))
    i1 = min(hh, int(math.ceil((my + pad + 0.5) * scale)))
    if j1 > j0 and i1 > i0:
        md = np.sqrt(((xs[j0:j1] - np.float32(mx)) ** 2)[None, :] + ((ys[i0:i1] - np.float32(my)) ** 2)[:, None]) \
            - np.float32(mr)
        mc = np.clip(-md * scale + 0.5, 0.0, 1.0)
        Mm = np.array([[k, 0.0, (mx - 88.0 * k + 0.5 + k * (0.5 / scale - 0.5)) * scale - 0.5 - j0],
                       [0.0, k, (my - 88.0 * k + 0.5 + k * (0.5 / scale - 0.5)) * scale - 0.5 - i0]])
        mt = cv2.warpAffine(moontex, Mm, (j1 - j0, i1 - i0), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        mlum = 205.5 * mt * (1.0 - 0.10 * np.exp(np.minimum(md, 0.0) / 9.0))
        mbloom = 0.010 * 229.5 * np.exp(-np.maximum(md, 0.0) / 12.0) * (md > -1.0)
        reg = out[i0:i1, j0:j1]
        for c in range(3):
            reg[:, :, c] = (reg[:, :, c] + mbloom * prgb[c]) * (1.0 - mc) + mc * mlum * prgb[c]
    _apply_dither(out, frame_idx, dither)
    return np.clip(out, 0.0, 1.0, out=out)


# ----------------------------------------------------------------------------- 3. sky plates

STAR_SIGMA = 0.5          # core sigma, 1080p pixels  (1 output pixel at 4K)
STAR_HALO = (0.12, 1.4)   # fraction of the flux in a soft halo, halo sigma (1080p px)


@lru_cache(maxsize=2)
def _sky_base(shot_id, scale):
    """Smooth star-free sky of a shot, float32 sRGB 0..1 at the output size (cached)."""
    u = _data()['sky_' + shot_id].astype(np.float32) * np.float32(1.0 / 256.0)
    big = cv2.resize(u, (W * scale, H * scale), interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), 4.0 * scale)
    big *= np.float32(1.0 / 255.0)
    return np.clip(big, 0.0, 1.0, out=big)


def star_positions(shot_id, frame_idx):
    """(x, y, flux_rgb) of the shot's stars at a frame, 1080p pixel-centre coords.
    flux is in 8-bit levels * (1080p pixel)^2, per channel."""
    d = _data()
    cat = d['stars_' + shot_id]
    if len(cat) == 0:
        return np.zeros(0), np.zeros(0), np.zeros((0, 3), np.float32)
    lam, om, ccx, ccy, t0 = d['mot_' + shot_id]
    e = np.exp(complex(lam, om) * (float(frame_idx) - t0))
    c = complex(ccx, ccy)
    p = c + (cat[:, 0] + 1j * cat[:, 1] - c) * e
    return p.real, p.imag, cat[:, 2:5]


def sky_motion(shot_id, frame_idx):
    """2x3 matrix M (1080p pixel-centre coords): p(frame) = M @ [x0, y0, 1] for a sky point that was at
    (x0, y0) on the first frame of the shot - the rigid drift of the original picture: rotation of
    -pi/6000 rad/frame about the planet centre (959.5, 3381), plus in the three 64-frame shots a
    push-in of exp(3.4e-4 * frames) about the top of the limb.  Stars follow exactly this."""
    lam, om, ccx, ccy, t0 = _data()['mot_' + shot_id]
    e = np.exp(complex(lam, om) * (float(frame_idx) - t0))
    dd = (1 - e) * complex(ccx, ccy)
    return np.array([[e.real, -e.imag, dd.real], [e.imag, e.real, dd.imag]])


def _splat_stars(img, x, y, flux, scale):
    """Add pixel-integrated Gaussian points (flux conserving, anti-aliased) in place."""
    hh, ww = img.shape[:2]
    s1 = STAR_SIGMA * scale
    hf, hs = STAR_HALO
    s2 = hs * scale
    rad = int(math.ceil(3.2 * s2))
    k1, k2 = 1.0 / (math.sqrt(2.0) * s1), 1.0 / (math.sqrt(2.0) * s2)
    offs = np.arange(-rad, rad + 2, dtype=np.float64) - 0.5
    for xi, yi, fl in zip(x, y, flux):
        px = (xi + 0.5) * scale - 0.5
        py = (yi + 0.5) * scale - 0.5
        if px < -rad or py < -rad or px > ww + rad or py > hh + rad:
            continue
        jx, jy = int(round(px)), int(round(py))
        ex = offs + (jx - px)
        ey = offs + (jy - py)
        wx1 = np.diff(erf(ex * k1)) * 0.5
        wy1 = np.diff(erf(ey * k1)) * 0.5
        wx2 = np.diff(erf(ex * k2)) * 0.5
        wy2 = np.diff(erf(ey * k2)) * 0.5
        patch = (1.0 - hf) * np.outer(wy1, wx1) + hf * np.outer(wy2, wx2)
        a0, a1 = max(0, jy - rad), min(hh, jy + rad + 1)
        b0, b1 = max(0, jx - rad), min(ww, jx + rad + 1)
        if a1 <= a0 or b1 <= b0:
            continue
        pp = patch[a0 - (jy - rad):a1 - (jy - rad), b0 - (jx - rad):b1 - (jx - rad)]
        img[a0:a1, b0:b1] += (pp[:, :, None] * (fl * (scale * scale / 255.0))[None, None, :]).astype(np.float32)
    return img


def sky_plate(shot_id, frame_idx, scale=2, stars=True, dither=1.0):
    """Sky of one montage shot WITHOUT planet / text: smooth gradient + drifting stars."""
    out = _sky_base(shot_id, scale).copy()
    if stars:
        x, y, fl = star_positions(shot_id, frame_idx)
        if len(x):
            _splat_stars(out, x, y, fl, scale)
    _apply_dither(out, frame_idx, dither)
    return np.clip(out, 0.0, 1.0, out=out)


def old_horizon(shot_id):
    """y of the ORIGINAL foreground silhouette per 1080p column (float, 1920) - reference only."""
    return _data()['hs_' + shot_id].astype(np.float32)


def sky_colors():
    """{shot_id: {zenith, mid, horizon: [r, g, b] 0-255 sRGB, old_horizon_y}} sampled on the centre column."""
    out = {}
    for s in shots():
        sid = s['id']
        u = _data()['sky_' + sid].astype(np.float32) / 256.0
        hs = old_horizon(sid)
        hc = float(np.median(hs[900:1020]))

        def smp(y):
            r = int(min(max(y / 8.0, 0), u.shape[0] - 1))
            return [round(float(v), 1) for v in u[r, 112:128].mean(0)]

        z, m, hz = smp(4), smp(hc * 0.5), smp(hc - 16)
        out[sid] = dict(zenith=z, mid=m, horizon=hz,
                        zenith_hex='#%02x%02x%02x' % tuple(int(round(v)) for v in z),
                        mid_hex='#%02x%02x%02x' % tuple(int(round(v)) for v in m),
                        horizon_hex='#%02x%02x%02x' % tuple(int(round(v)) for v in hz),
                        old_horizon_y=round(hc, 1), old_horizon_y_min=round(float(hs.min()), 1),
                        n_stars=int(len(_data()['stars_' + sid])))
    return out


def write_sky_colors(path):
    d = dict(_about='Per-shot sky colours of the rebuilt plates (film/compose/backdrops.py): sRGB 0-255 on the '
                    'centre column at the top of the frame (zenith), half-way to the old horizon (mid) and 16 px '
                    'above the old horizon (horizon). old_horizon_y = y of the ORIGINAL foreground silhouette at '
                    'the centre in 1080p pixels (the plate continues smoothly below it).',
             shots=sky_colors())
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    return d


# ----------------------------------------------------------------------------- dispatcher / CLI

def backdrop(frame_idx, scale=2, dither=1.0, fade=False):
    """Backdrop of any film frame (sky plate for montage frames)."""
    f = int(frame_idx)
    if YINYANG[0] <= f < YINYANG[1]:
        return yinyang_bg(f, scale, dither)
    if MONTAGE[0] <= f < MONTAGE[1]:
        return sky_plate(shot_at(f), f, scale, True, dither)
    return horizon_bg(f, scale, fade, dither)


def to_u8(img):
    return np.clip(np.rint(img * 255.0), 0, 255).astype(np.uint8)


def write_sheet(path, tw=384):
    th = tw * 9 // 16
    items = [('intro %d' % f, f) for f in (0, 110, 191)] + [('yinyang %d' % f, f) for f in (192, 224, 255)]
    items += [(s['id'], (s['start'] + s['end']) // 2) for s in shots()]
    items += [('outro %d' % f, f) for f in (740, 900, 1221)]
    tiles = []
    for name, f in items:
        im = to_u8(backdrop(f, 1, dither=0.0))[:, :, ::-1]
        im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
        cv2.putText(im, name, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(im, name, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(im)
    cols = 5
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)])
    cv2.imwrite(path, sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return sheet.shape


def main(argv=None):
    import argparse
    import time
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--frame', type=int)
    ap.add_argument('--shot', help='force the sky plate of this shot id')
    ap.add_argument('--scale', type=int, default=2)
    ap.add_argument('--out')
    ap.add_argument('--no-dither', action='store_true')
    ap.add_argument('--fade', action='store_true', help='apply the end-of-film fade (outro)')
    ap.add_argument('--sheet')
    ap.add_argument('--colors')
    ap.add_argument('--bench', action='store_true')
    a = ap.parse_args(argv)
    if a.sheet:
        print('sheet', write_sheet(a.sheet))
    if a.colors:
        write_sky_colors(a.colors)
        print('wrote', a.colors)
    if a.bench:
        for f in (60, 61, 110, 111, 224, 225, 300, 301, 470, 471, 900, 901):
            t = time.time()
            backdrop(f, a.scale)
            print('frame %4d  scale %d  %.3f s' % (f, a.scale, time.time() - t))
    if a.frame is not None and a.out:
        dz = 0.0 if a.no_dither else 1.0
        if a.shot:
            img = sky_plate(a.shot, a.frame, a.scale, True, dz)
        else:
            img = backdrop(a.frame, a.scale, dz, a.fade)
        if a.out.lower().endswith('.png') or a.out.lower().endswith('.tif'):
            cv2.imwrite(a.out, to_u8(img)[:, :, ::-1])
        else:
            cv2.imwrite(a.out, to_u8(img)[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 95])
        print('wrote', a.out, img.shape)


if __name__ == '__main__':
    main()
