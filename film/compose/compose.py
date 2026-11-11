#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Final frame assembly of the 《药食同源》 rebuild (4K master, resolution independent).

    compose_frame(frame_idx, scale=2, renders_dir=RENDERS, use_old_name=False, stills=None)
        -> uint8 (1080*scale, 1920*scale, 3) RGB, the finished film frame.

Scene per frame (cut list): 0-192 horizon_bg | 192-256 yinyang_bg | 256-736 the 29 shots
of shots.json | 736-1248 horizon_bg.  A 3D shot is

    sky_plate (stars drift)  +  foreground still (slow push-in)  ->  'over' in linear light
    -> gentle highlight bloom -> monochrome grain -> text -> global fade -> TPDF dither

Foreground stills: <renders_dir>/<shot_id>.png, 16-bit straight-alpha RGBA (AgX display
referred sRGB) covering exactly the film frame at t=0 (any resolution: 3840x2160, or
4032x2268 = 5 % more pixels for the three 64-frame shots so the end of their push-in is 1:1),
optional <shot_id>_depth.npy (metres along the camera axis, 0 = no geometry).  A missing /
unreadable still becomes an obvious striped grey PLACEHOLDER dome with the old silhouette.

What is done to the foreground, and why
 * push-in: uniform scale about the horizon apex (measured on the alpha channel), constant
   relative speed, 1.000 -> 1.012 (8-frame shots) / 1.020 (16) / 1.050 (64).  ONE resampling
   per frame straight from the still with an exact sub-pixel map, Lanczos-4 (8x8 taps).
   Frame 0 of a shot is the still, bit for bit (identity map).  INTER_AREA is only used for
   real minification (a pre-decimation by >= 1.2x, e.g. 4K stills in a --scale 1 build); for
   the 0.95-1.0x range of the oversized 64-frame stills Lanczos-4 is used on purpose: a box
   filter that close to 1:1 degenerates to a 2-tap average whose phase beats across the
   picture (visible soft/sharp bands that crawl during the move), Lanczos stays tack sharp.
 * depth parallax (64-frame shots, when the depth map exists): the move becomes a real dolly,
   log-scale(x) = u * (ln 1.05 + E(x)), E proportional to (disparity - disparity at the apex),
   normalised to +2 % at the nearest foreground and soft-limited at 3 %.  E is a smooth
   low-resolution field (sky filled from the nearest geometry, blurred), evaluated at the
   destination pixel by fixed-point iteration, so the inverse map is continuous: no tearing.
 * 'over': resampling is done on premultiplied values; where alpha is 0 or 1 the pixels are
   copied untouched, the silhouette pixels (0 < a < 1) are blended in LINEAR light.
 * contact shadow: measured on the original (median over the 29 shots of
   original - sky plate just above the silhouette = -0.2 levels, i.e. none); only the bright-sky
   shots show a soft 1.5-3 % dip within ~10 px.  CONTACT holds those measured strengths, all
   other shots get none.
 * bloom: additive in linear light, 4.5 % / 2.5 % of the energy of speculars above sRGB 0.80
   in two Gaussians (5 / 20 px at 1080p).  Baked into the still once (it rides with the
   push-in), spill onto the sky is added per frame.  Nothing is ever blurred.
 * vignette: none added.  The radial falloff of the original sky is part of the fitted sky
   plates; the original foregrounds show only the shading of their own CG sphere.
 * grain: fine monochrome Gaussian grain, new every frame, sigma 0.8 8-bit levels at 4K in
   the mid-tones, less in deep shadow; then text, fade, and a final +-1 LSB TPDF dither.
 * the small bottom labels of the 8-frame shots get an extra soft drop shadow whose strength
   follows the brightness of the photograph behind them (LABEL_SHADOW).

CLI
    python compose.py frame N [--scale 2] --out x.png
    python compose.py preview <shot_id> [--still PATH] [--frame N] [--scale 2] --out x.jpg
    python compose.py sheet --out x.jpg [--tw 480] [--cols 8]
    python compose.py bench [--scale 2]
"""
import argparse
import math
import os
import sys
import time
from functools import lru_cache

import cv2
import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import backdrops as B  # noqa: E402
import text as T  # noqa: E402

W, H = 1920, 1080
NFRAMES = 1248
RENDERS = os.environ.get('YAOSHI_RENDERS', os.path.join(os.path.dirname(_HERE), 'renders'))
FONT_DIR = T.FONT_DIR

# push-in: final scale by shot length (frames)
PUSH = {8: 1.012, 16: 1.020, 64: 1.050}
OVERSCAN = 1.05                 # stills of the 64-frame shots carry 5 % more pixels
PARALLAX_NEAR = 0.020           # extra log-scale of the nearest foreground at the end of a 64-frame shot
PARALLAX_MAX = 0.030            # soft limit of the extra log-scale
BLOOM = ((0.045, 5.0), (0.025, 20.0))   # (energy fraction, sigma in 1080p px)
BLOOM_KNEE = (0.80, 0.97)       # sRGB value (max channel) where a highlight starts / fully blooms
GRAIN_SIGMA = 0.0031            # gamma-space sigma at 4K (0.8 8-bit levels); x0.75 at 1080p
LABEL_SHADOW = (0.12, 0.55)     # extra shadow opacity under the small labels: dark bg .. bright bg
# faint darkening of the sky hugging the silhouette, fraction of the sky level, measured on the
# original (5-16 px above the old silhouette, original minus rebuilt sky plate); 0 elsewhere.
CONTACT = {'m01_shanyao': 0.029, 'm03_dazao': 0.026, 'm07_baihe': 0.030, 'm10_fengmi': 0.020,
           'k01_fuling': 0.030, 'k04_heizhima': 0.025, 'k05_bohe': 0.014, 'k06_sangshen': 0.029,
           'k12_juemingzi': 0.017, 'k13_luohanguo': 0.028, 'm09_juhua': 0.005}
CONTACT_SIGMA = 10.0            # 1080p px


# ----------------------------------------------------------------------------- colour helpers

def _dec(v):
    """sRGB -> linear (float32 in, float32 out)."""
    v = np.clip(v, 0.0, 1.0)
    return np.where(v <= 0.04045, v * np.float32(1 / 12.92),
                    ((v + np.float32(0.055)) * np.float32(1 / 1.055)) ** np.float32(2.4)).astype(np.float32)


def _enc(v):
    v = np.clip(v, 0.0, 1.0)
    return np.where(v <= 0.0031308, v * np.float32(12.92),
                    np.float32(1.055) * v ** np.float32(1 / 2.4) - np.float32(0.055)).astype(np.float32)


def to_u8(img):
    return np.clip(np.rint(img * 255.0), 0, 255).astype(np.uint8)


# ----------------------------------------------------------------------------- stills

def still_path(shot_id, renders_dir=None):
    return os.path.join(renders_dir or RENDERS, shot_id + '.png')


def _sig(path):
    try:
        st = os.stat(path)
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def still_signature(shot_id, renders_dir=None, stills=None):
    """Hashable identity of the inputs of a shot (None parts = missing -> placeholder)."""
    p = (stills or {}).get(shot_id) or still_path(shot_id, renders_dir)
    return (p, _sig(p), _sig(p[:-4] + '_depth.npy'))


def _read_still(path):
    """float32 RGBA straight alpha 0..1 (sRGB encoded), or None."""
    if not os.path.isfile(path):
        return None
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im is None or im.ndim != 3 or im.shape[2] != 4:
        return None
    k = 1.0 / (65535.0 if im.dtype == np.uint16 else 255.0)
    out = np.empty(im.shape, np.float32)
    np.multiply(im[..., 2::-1], np.float32(k), out=out[..., :3])
    np.multiply(im[..., 3], np.float32(k), out=out[..., 3])
    return out


def _placeholder(shot_id, scale):
    """Obvious grey striped dome with the silhouette of the ORIGINAL shot (straight RGBA)."""
    from PIL import Image, ImageDraw, ImageFont
    wo, ho = W * scale, H * scale
    xs, ys = B._axes(scale)
    try:
        hs = B.old_horizon(shot_id)
    except Exception:
        hs = 580.0 + (np.arange(W) - 959.5) ** 2 / 5600.0
    hsx = np.interp(xs, np.arange(W), hs).astype(np.float32)
    a = np.clip((ys[:, None] - hsx[None, :]) * scale + 0.5, 0.0, 1.0)
    d = np.maximum(ys[:, None] - hsx[None, :], 0.0)
    stripes = ((xs[None, :] + ys[:, None]) // 36 % 2).astype(np.float32)
    g = 0.34 + 0.10 * np.exp(-d / 90.0) + 0.035 * stripes
    try:
        s = B._shot(shot_id)
        label = 'PLACEHOLDER  %s  %s' % (shot_id, s.get('cn', ''))
    except Exception:
        label = 'PLACEHOLDER  %s' % shot_id
    im = Image.fromarray(np.zeros((ho, wo), np.uint8))
    try:
        font = ImageFont.truetype(os.path.join(FONT_DIR, 'NotoSansCJKsc-Bold.otf'), 46 * scale)
    except Exception:
        font = ImageFont.load_default()
    dr = ImageDraw.Draw(im)
    tw = dr.textlength(label, font=font)
    dr.text(((wo - tw) / 2, 830 * scale), label, fill=255, font=font)
    g = g * (1.0 - np.asarray(im, np.float32) / 255.0 * 0.55)
    out = np.empty((ho, wo, 4), np.float32)
    out[..., 0] = out[..., 1] = out[..., 2] = g
    out[..., 3] = a
    return out


def _depth_field(depth_path, alpha_small, anchor_cell):
    """Smooth low-res extra-log-scale field E (135x240) from the depth map, or None."""
    gh, gw = 135, 240
    try:
        z = np.load(depth_path).astype(np.float32)
    except Exception:
        return None
    if z.ndim != 2:
        return None
    valid = (z > 1e-6).astype(np.float32)
    disp = np.where(z > 1e-6, 1.0 / np.maximum(z, 1e-6), 0.0).astype(np.float32)
    v = cv2.resize(valid, (gw, gh), interpolation=cv2.INTER_AREA)
    d = cv2.resize(disp, (gw, gh), interpolation=cv2.INTER_AREA)
    ok = v > 0.5
    if ok.sum() < 50:
        return None
    d = np.where(ok, d / np.maximum(v, 1e-6), 0.0)
    from scipy import ndimage
    idx = ndimage.distance_transform_edt(~ok, return_distances=False, return_indices=True)
    d = d[idx[0], idx[1]].astype(np.float32)
    d = cv2.GaussianBlur(d, (0, 0), 2.5, borderType=cv2.BORDER_REPLICATE)
    cy = int(min(gh - 1, max(0, round(anchor_cell[1] + 2))))
    cx = int(min(gw - 1, max(0, round(anchor_cell[0]))))
    ref = float(d[cy, cx])
    hi = float(np.percentile(d[ok], 98))
    if not (hi - ref > 1e-4 * abs(ref)):
        return None
    e = PARALLAX_NEAR * (d - ref) / (hi - ref)
    return (PARALLAX_MAX * np.tanh(e / PARALLAX_MAX)).astype(np.float32)


@lru_cache(maxsize=2)
def _prep(shot_id, scale, sig):
    """Static layers of a shot (cached): premultiplied foreground with baked bloom, low-res
    bloom, anchor, parallax field ..."""
    path = sig[0]
    wo, ho = W * scale, H * scale
    s = B._shot(shot_id)
    n = s['end'] - s['start']
    S = PUSH.get(n, 1.0 + 0.0008 * n)
    im = _read_still(path) if sig[1] is not None else None
    placeholder = im is None
    if placeholder:
        im = _placeholder(shot_id, scale)
    im[..., :3] *= im[..., 3:]                       # premultiply (sRGB-encoded values)
    k = im.shape[1] / float(wo)
    kk = OVERSCAN if (n >= 64 and k >= OVERSCAN * 0.999) else 1.0
    if k / kk >= 1.2:                                # real minification -> area filter, once
        im = cv2.resize(im, (int(round(wo * kk)), int(round(ho * kk))), interpolation=cv2.INTER_AREA)
    hs, ws = im.shape[:2]
    kx, ky = ws / float(wo), hs / float(ho)
    a = im[..., 3]
    # horizon apex = anchor of the push-in (output pixel-edge units)
    c0, c1 = int(ws * 0.47), int(ws * 0.53)
    col = a[:, c0:c1] > 0.5
    first = np.where(col.any(0), col.argmax(0), hs - 1)
    apex = float(np.median(first))
    rows = np.nonzero(a.max(1) > 0.002)[0]
    top = float(rows[0]) if len(rows) else float(hs - 1)
    anchor = (wo / 2.0, apex / ky)
    # bloom source: speculars only, linear light, premultiplied
    bw, bh = 960, 540
    vmax = im[..., :3].max(-1)
    m = vmax > BLOOM_KNEE[0]
    src = np.zeros((hs, ws, 3), np.float32)
    if m.any():
        am = np.maximum(a[m], 1e-4)[:, None]
        w = np.clip((vmax[m] / am[:, 0] - BLOOM_KNEE[0]) / (BLOOM_KNEE[1] - BLOOM_KNEE[0]), 0.0, 1.0)
        src[m] = _dec(im[m][:, :3] / am) * am * (w * w)[:, None]
    low = cv2.resize(src, (bw, bh), interpolation=cv2.INTER_AREA)
    del src
    cell = bw / float(W)                             # low-res cells per 1080p pixel
    bloom = np.zeros_like(low)
    for frac, sg in BLOOM:
        bloom += np.float32(frac) * cv2.GaussianBlur(low, (0, 0), sg * cell, borderType=cv2.BORDER_REPLICATE)
    # bake the bloom into the foreground (linear add), only where it is measurable
    full = cv2.resize(bloom, (ws, hs), interpolation=cv2.INTER_LINEAR)
    m = (full.max(-1) > 2e-4) & (a > 0.002)
    if m.any() and not placeholder:
        am = np.maximum(a[m], 1e-4)[:, None]
        im[m, :3] = _enc(_dec(im[m][:, :3] / am) + full[m]) * am
    del full
    E = None
    if n >= 64 and not placeholder and sig[2] is not None:
        E = _depth_field(path[:-4] + '_depth.npy', None, (anchor[0] / wo * 240.0, anchor[1] / ho * 135.0))
    return dict(P=im, kx=kx, ky=ky, anchor=anchor, top=top / ky, bloom=bloom, E=E, S=S, n=n,
                start=s['start'], placeholder=placeholder, contact=CONTACT.get(shot_id, 0.0))


def shot_static(shot_id, scale=2, renders_dir=None, stills=None):
    return _prep(shot_id, int(scale), still_signature(shot_id, renders_dir, stills))


def is_placeholder(shot_id, renders_dir=None, stills=None):
    sig = still_signature(shot_id, renders_dir, stills)
    return sig[1] is None


# ----------------------------------------------------------------------------- grain / dither

@lru_cache(maxsize=1)
def _grain_tile():
    rng = np.random.default_rng(20261111)
    g = rng.standard_normal((1024, 1024), dtype=np.float32)
    g = cv2.GaussianBlur(np.pad(g, 8, mode='wrap'), (0, 0), 0.6)[8:-8, 8:-8]
    return (g / g.std()).astype(np.float32)


def add_grain(img, frame_idx, scale):
    """In place: fine monochrome grain (same value on R, G, B), new pattern every frame."""
    g = _grain_tile()
    amp = np.float32(GRAIN_SIGMA * (1.0 if scale >= 1.5 else 0.75))
    rng = np.random.default_rng(7919 * (int(frame_idx) + 11))
    h, w = img.shape[:2]
    for y in range(0, h, 512):
        hh = min(512, h - y)
        for x in range(0, w, 512):
            ww = min(512, w - x)
            oy, ox = (int(v) for v in rng.integers(0, 512, 2))
            blk = img[y:y + hh, x:x + ww]
            wgt = np.minimum(blk[..., 1] * np.float32(3.0) + np.float32(0.35), np.float32(1.0))
            wgt *= g[oy:oy + hh, ox:ox + ww]
            wgt *= amp
            blk += wgt[..., None]
    return img


# ----------------------------------------------------------------------------- 3D shots

def push_scale(st, frame_idx):
    """(u, uniform scale) of the push-in at a frame."""
    n = st['n']
    u = (frame_idx - st['start']) / float(n - 1) if n > 1 else 0.0
    u = min(1.0, max(0.0, u))
    return u, math.exp(u * math.log(st['S']))


def _warp_fg(st, frame_idx, scale):
    """Foreground at a frame: (premultiplied RGBA float32 band, y0) - rows y0.. of the output."""
    wo, ho = W * scale, H * scale
    P, kx, ky = st['P'], st['kx'], st['ky']
    ax, ay = st['anchor']
    u, s = push_scale(st, frame_idx)
    E = st['E']
    smax = s * math.exp(u * PARALLAX_MAX) if E is not None else s
    y0 = int(max(0, math.floor(ay + (st['top'] - ay) * smax) - 64 * scale))
    hb = ho - y0
    if E is None or u <= 0.0:
        m = 1.0 / s
        M = np.array([[kx * m, 0.0, kx * (ax * (1 - m) + 0.5 * m) - 0.5],
                      [0.0, ky * m, ky * (ay * (1 - m) + (y0 + 0.5) * m) - 0.5]])
        out = cv2.warpAffine(P, M, (wo, hb), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP,
                             borderMode=cv2.BORDER_REPLICATE)
        return out, y0, M
    # dolly: per-pixel inverse scale from the depth at the destination pixel
    gh, gw = E.shape
    cx, cy = wo / float(gw), ho / float(gh)                     # output px per cell
    gx = (np.arange(gw, dtype=np.float32) + 0.5) * cx - ax      # cell centres relative to the anchor
    gy = (np.arange(gh, dtype=np.float32) + 0.5) * cy - ay
    lnS = math.log(st['S'])
    minv = np.full((gh, gw), 1.0 / s, np.float32)
    for _ in range(3):
        mx = (ax + gx[None, :] * minv) / cx - 0.5
        my = (ay + gy[:, None] * minv) / cy - 0.5
        e = cv2.remap(E, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR,
                      borderMode=cv2.BORDER_REPLICATE)
        minv = np.exp(-u * (lnS + e)).astype(np.float32)
    mfull = cv2.resize(minv, (wo, ho), interpolation=cv2.INTER_CUBIC)[y0:]
    xs = np.arange(wo, dtype=np.float32) + np.float32(0.5 - ax)
    ys = np.arange(y0, ho, dtype=np.float32) + np.float32(0.5 - ay)
    mapx = mfull * xs[None, :]
    mapx += np.float32(ax)
    mapx *= np.float32(kx)
    mapx -= np.float32(0.5)
    mapy = mfull * ys[:, None]
    mapy += np.float32(ay)
    mapy *= np.float32(ky)
    mapy -= np.float32(0.5)
    out = cv2.remap(P, mapx, mapy, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    m = 1.0 / s
    M = np.array([[kx * m, 0.0, kx * (ax * (1 - m) + 0.5 * m) - 0.5],
                  [0.0, ky * m, ky * (ay * (1 - m) + (y0 + 0.5) * m) - 0.5]])
    return out, y0, M


def _shot_frame(shot_id, frame_idx, scale, st):
    """float32 sRGB frame of a 3D shot before grain / text."""
    wo, ho = W * scale, H * scale
    img = B.sky_plate(shot_id, frame_idx, scale, True, 0.0)
    fg, y0, M = _warp_fg(st, frame_idx, scale)
    np.clip(fg, 0.0, 1.0, out=fg)
    a = fg[..., 3]
    band = img[y0:]
    part = np.nonzero(a.min(1) < 0.998)[0]
    r1 = int(part[-1]) + 1 if len(part) else 0
    if r1 < band.shape[0]:
        band[r1:] = fg[r1:, :, :3]                     # fully covered rows: the photograph, untouched
    if r1 > 0:
        sky = band[:r1]
        pa = a[:r1]
        prgb = fg[:r1, :, :3]
        if st['contact'] > 0.0:                         # faint darkening of the sky at the silhouette
            f8 = 8
            small = cv2.resize(pa, (wo // f8, max(1, r1 // f8)), interpolation=cv2.INTER_AREA)
            small = cv2.GaussianBlur(small, (0, 0), CONTACT_SIGMA * scale / f8, borderType=cv2.BORDER_REPLICATE)
            wgt = cv2.resize(small, (wo, r1), interpolation=cv2.INTER_LINEAR)
            np.clip(wgt * np.float32(2.0 * st['contact']), 0.0, st['contact'], out=wgt)
            sky *= (np.float32(1.0) - wgt)[..., None]
        # bloom spill of the foreground speculars onto the sky (low-res glow, same push-in)
        bl = st['bloom']
        qx, qy = bl.shape[1] / float(st['P'].shape[1]), bl.shape[0] / float(st['P'].shape[0])
        Mb = np.array([[M[0, 0] * qx, 0.0, (M[0, 2] + 0.5) * qx - 0.5],
                       [0.0, M[1, 1] * qy, (M[1, 2] + 0.5) * qy - 0.5]])
        glow = cv2.warpAffine(bl, Mb, (wo, r1), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                              borderMode=cv2.BORDER_REPLICATE)
        idx = np.nonzero((pa < 0.998) & ((pa > 0.002) | (glow.max(-1) > 2e-4)))
        if len(idx[0]):
            av = pa[idx][:, None]
            lin = _dec(prgb[idx] / np.maximum(av, 1e-4)) * av + (_dec(sky[idx]) + glow[idx]) * (1.0 - av)
            edge = _enc(lin)
        sky *= (np.float32(1.0) - pa)[..., None]        # exact where a is 0 or 1
        sky += prgb
        if len(idx[0]):
            sky[idx] = edge                              # silhouette pixels: linear-light 'over'
    return img


# ----------------------------------------------------------------------------- text helpers

_label_cache = {}


def _label_shadow(img, frame_idx, use_old_name, scale):
    """Extra soft shadow under the small bottom labels (in place, before the text)."""
    ho, wo = img.shape[:2]
    for rgba, x0, y0, op, eid in T.frame_layers(frame_idx, use_old_name, scale):
        if not eid.endswith('_small'):
            continue
        key = (eid, bool(use_old_name), scale)
        if key not in _label_cache:
            if len(_label_cache) > 8:
                _label_cache.clear()
            al = np.ascontiguousarray(rgba[..., 3])
            core = (al > 0.9).astype(np.float32)        # glyph bodies (the halo is < 0.8)
            sh = cv2.GaussianBlur(core, (0, 0), 4.0 * scale, borderType=cv2.BORDER_CONSTANT)
            sh2 = cv2.GaussianBlur(core, (0, 0), 11.0 * scale, borderType=cv2.BORDER_CONSTANT)
            sh = np.clip(1.6 * sh + 1.2 * sh2, 0.0, 1.0)
            _label_cache[key] = (sh, core)
        sh, core = _label_cache[key]
        c = T._clip(sh[..., None], x0, y0, wo, ho)
        if c is None:
            continue
        src, dx, dy = c
        dst = img[dy:dy + src.shape[0], dx:dx + src.shape[1]]
        wsum = float(src.sum())
        ybg = float((dst[..., 1] * src[..., 0]).sum() / wsum) if wsum > 0 else 0.0
        k = LABEL_SHADOW[0] + (LABEL_SHADOW[1] - LABEL_SHADOW[0]) * min(1.0, max(0.0, (ybg - 0.12) / 0.45))
        dst *= (1.0 - np.float32(k * op) * src)
    return img


# ----------------------------------------------------------------------------- frame

def scene_at(frame_idx):
    f = int(frame_idx)
    if B.YINYANG[0] <= f < B.YINYANG[1]:
        return 's01_yinyang'
    if B.MONTAGE[0] <= f < B.MONTAGE[1]:
        return B.shot_at(f)
    return 's00_intro' if f < B.YINYANG[0] else 'e01_outro'


def scenes():
    """[(id, start, end)] of the whole film in order."""
    out = [('s00_intro', B.INTRO[0], B.INTRO[1]), ('s01_yinyang', B.YINYANG[0], B.YINYANG[1])]
    out += [(s['id'], s['start'], s['end']) for s in B.shots()]
    out.append(('e01_outro', B.OUTRO[0], B.OUTRO[1]))
    return out


def compose_float(frame_idx, scale=2, renders_dir=None, use_old_name=False, stills=None,
                  grain=True, text=True):
    """float32 sRGB frame (before dither / quantisation)."""
    f = int(frame_idx)
    scale = int(scale)
    if B.MONTAGE[0] <= f < B.MONTAGE[1]:
        sid = B.shot_at(f)
        st = shot_static(sid, scale, renders_dir, stills)
        img = _shot_frame(sid, f, scale, st)
    elif B.YINYANG[0] <= f < B.YINYANG[1]:
        img = B.yinyang_bg(f, scale, 0.0)
    else:
        img = B.horizon_bg(f, scale, False, 0.0)
    if grain:
        add_grain(img, f, scale)
    if text:
        _label_shadow(img, f, use_old_name, scale)
        T.composite_text(img, f, use_old_name, scale, fade=True)
    else:
        g = T.global_fade(f)
        if g < 1.0:
            img *= np.float32(g)
    return img


def compose_frame(frame_idx, scale=2, renders_dir=None, use_old_name=False, stills=None):
    """Finished film frame: uint8 RGB (1080*scale, 1920*scale, 3)."""
    img = compose_float(frame_idx, scale, renders_dir, use_old_name, stills)
    g = T.global_fade(int(frame_idx))
    B._apply_dither(img, int(frame_idx), min(1.0, 8.0 * g))    # the fade ends on true black
    return to_u8(img)


# ----------------------------------------------------------------------------- CLI

def _imwrite(path, rgb, quality=95):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    bgr = np.ascontiguousarray(rgb[..., ::-1])
    if path.lower().endswith(('.jpg', '.jpeg')):
        cv2.imwrite(path, bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    else:
        cv2.imwrite(path, bgr)


def write_sheet(path, tw=480, cols=8, renders_dir=None, use_old_name=False):
    th = tw * 9 // 16
    items = []
    for sid, a, b in scenes():
        f = {'s00_intro': 60, 'e01_outro': 1200}.get(sid, (a + b) // 2)
        items.append((sid, f))
    rows = (len(items) + cols - 1) // cols
    sheet = np.zeros((rows * (th + 22), cols * tw, 3), np.uint8)
    for i, (sid, f) in enumerate(items):
        fr = compose_frame(f, 1, renders_dir, use_old_name)
        fr = cv2.resize(fr, (tw, th), interpolation=cv2.INTER_AREA)
        y, x = (i // cols) * (th + 22), (i % cols) * tw
        sheet[y + 22:y + 22 + th, x:x + tw] = fr
        ph = B.MONTAGE[0] <= f < B.MONTAGE[1] and is_placeholder(sid, renders_dir)
        cv2.putText(sheet, '%s f%d%s' % (sid, f, '  [PLACEHOLDER]' if ph else ''), (x + 4, y + 16),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 160, 80) if ph else (230, 230, 230), 1, cv2.LINE_AA)
    _imwrite(path, sheet, 90)
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('frame')
    p.add_argument('n', type=int)
    p.add_argument('--scale', type=int, default=2)
    p.add_argument('--out', required=True)
    p.add_argument('--renders', default=None)
    p.add_argument('--old-name', action='store_true')
    p = sub.add_parser('preview')
    p.add_argument('shot_id')
    p.add_argument('--still', default=None)
    p.add_argument('--frame', type=int, default=None)
    p.add_argument('--scale', type=int, default=2)
    p.add_argument('--out', required=True)
    p.add_argument('--renders', default=None)
    p = sub.add_parser('sheet')
    p.add_argument('--out', required=True)
    p.add_argument('--tw', type=int, default=480)
    p.add_argument('--cols', type=int, default=8)
    p.add_argument('--renders', default=None)
    p = sub.add_parser('bench')
    p.add_argument('--scale', type=int, default=2)
    p.add_argument('--frames', default='60,120,224,290,470,471,472,620,900,1200')
    a = ap.parse_args(argv)
    if a.cmd == 'frame':
        _imwrite(a.out, compose_frame(a.n, a.scale, a.renders, a.old_name))
        print('wrote', a.out, 'scene', scene_at(a.n))
    elif a.cmd == 'preview':
        s = B._shot(a.shot_id)
        f = a.frame if a.frame is not None else (s['start'] + s['end']) // 2
        stills = {a.shot_id: a.still} if a.still else None
        if is_placeholder(a.shot_id, a.renders, stills):
            print('WARNING: no still for %s -> placeholder' % a.shot_id)
        _imwrite(a.out, compose_frame(f, a.scale, a.renders, False, stills))
        st = shot_static(a.shot_id, a.scale, a.renders, stills)
        print('wrote %s  frame %d  apex y=%.1f (1080p)  parallax=%s' %
              (a.out, f, st['anchor'][1] / a.scale, st['E'] is not None))
    elif a.cmd == 'sheet':
        print('wrote', write_sheet(a.out, a.tw, a.cols, a.renders))
    elif a.cmd == 'bench':
        for f in [int(v) for v in a.frames.split(',')]:
            t, c = time.time(), time.process_time()
            compose_frame(f, a.scale)
            print('frame %4d %-14s wall %.2f s  cpu %.2f s' % (f, scene_at(f), time.time() - t, time.process_time() - c))


if __name__ == '__main__':
    main()
