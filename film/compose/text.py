#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Text overlay renderer for the 《药食同源》 rebuild.

    render_text_layer(frame_idx, use_old_name=False, scale=1)
        -> float32 (1080*scale, 1920*scale, 4), straight-alpha RGBA, sRGB 0..1,
           halo/shadow included, fully transparent where there is no text.
           Composite it "over" the backdrop IN sRGB (gamma) SPACE - that is how
           the original was blended:      out = bg*(1-a) + rgb*a

    composite_text(rgb, frame_idx, use_old_name=False, scale=1, fade=True)
        -> same thing done in place on a float sRGB frame (only touches the text
           rectangles, so it is cheap at 4K); fade=True also applies global_fade.

    global_fade(frame_idx) -> float
        multiplier (0..1) for the FINAL picture (backdrop + text): the fade to
        black at the very end of the film.  NOT baked into render_text_layer().

How the original text was made (reverse-engineered, see timeline.json "_about"):
Pillow/FreeType glyphs of Noto Serif CJK SC drawn ONE GLYPH AT A TIME at 1x with
an integer pixel size, on an integer baseline, pen x = floor(x + 0.5) where
    x_0 = cx - width/2,  x_{i+1} = x_i + advance_i + tracking
    advance_i = font units * size / 1000   (un-hinted, un-rounded)
    width     = sum(advance) + tracking*(n-1)     (no trailing tracking)
This module reproduces exactly that, so at scale=1 the glyph masks are pixel
identical to the original (IoU ~0.99 against the h264 frames).  scale=2 keeps the
same snapped layout and rasterises natively at twice the size (true 4K text).

All parameters live in ../timeline.json.  The JSON stores the NEW producer name;
use_old_name=True swaps the old one back in for verification only.

Needs Pillow + numpy (cv2 only for the CLI image writers).  No bpy.

CLI:
    python text.py --frame 60 --out x.png                 # RGBA png of the layer
    python text.py --frame 60 --out x.png --bg 20,24,40   # flattened on a colour
    python text.py --sheet sheet.jpg                      # contact sheet, all cards
    python text.py --list                                 # element table
    python text.py --bench
"""
import json
import math
import os
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFont

_HERE = os.path.dirname(os.path.abspath(__file__))
TIMELINE_PATH = os.environ.get(
    'YAOSHI_TIMELINE', os.path.join(os.path.dirname(_HERE), 'timeline.json'))
FONT_DIR = os.environ.get(
    'YAOSHI_FONT_DIR',
    '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad/fonts')
W, H = 1920, 1080

WEIGHT_FILES = {
    'Light': 'NotoSerifCJKsc-Light.otf',
    'Regular': 'NotoSerifCJKsc-Regular.otf',
    'Medium': 'NotoSerifCJKsc-Medium.otf',
    'SemiBold': 'NotoSerifCJKsc-SemiBold.otf',
    'Bold': 'NotoSerifCJKsc-Bold.otf',
    'Black': 'NotoSerifCJKsc-Black.otf',
}
_BLANK = ' 　 '


# --------------------------------------------------------------------------- #
# layout + glyph rasteriser
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=512)
def _font(weight, px):
    fn = WEIGHT_FILES.get(weight, weight)
    path = fn if os.path.isabs(fn) else os.path.join(FONT_DIR, fn)
    return ImageFont.truetype(path, px, layout_engine=ImageFont.Layout.BASIC)


@lru_cache(maxsize=8192)
def _units(weight, ch):
    """Horizontal advance of `ch` in 1/1000 em (the fonts have 1000 units/em)."""
    return float(_font(weight, 1000).getlength(ch))


def layout_pens(text, weight, size, tracking, cx=960.0):
    """Integer pen x of every character (1080p pixels) and the line width.

    Reproduces the original layout: un-hinted linear advances, constant
    tracking after every character but the last, line centred on cx, each pen
    rounded half-up to a whole pixel.
    """
    adv = [_units(weight, ch) * size / 1000.0 for ch in text]
    width = sum(adv) + tracking * (len(text) - 1) if text else 0.0
    x = cx - width / 2.0
    pens = []
    for a in adv:
        pens.append(int(math.floor(x + 0.5)))
        x += a + tracking
    return pens, width


def text_bbox(text, weight, size, pens, by):
    """Loose integer box (x0, y0, x1, y1) in 1080p px that contains all ink."""
    vis = [p for p, ch in zip(pens, text) if p is not None and ch not in _BLANK]
    if not vis:
        return (0, 0, 1, 1)
    return (int(min(vis) - 0.12 * size) - 1, int(by - 1.02 * size) - 1,
            int(max(vis) + 1.12 * size) + 2, int(by + 0.30 * size) + 2)


def raster_text(text, weight, size, pens, by, box, scale=1):
    """Coverage (float32 0..1) of the glyphs inside box=(x0,y0,x1,y1) [1080p px].
    Output resolution is `scale` x the box.  Native FreeType rendering at
    font size size*scale, pen (pen*scale, by*scale), baseline anchored."""
    x0, y0, x1, y1 = box
    wpx = int(round((x1 - x0) * scale))
    hpx = int(round((y1 - y0) * scale))
    im = Image.new('L', (wpx, hpx), 0)
    d = ImageDraw.Draw(im)
    f = _font(weight, size * scale)
    for ch, p in zip(text, pens):
        if p is None or ch in _BLANK:
            continue
        d.text((int(round((p - x0) * scale)), int(round((by - y0) * scale))), ch,
               font=f, fill=255, anchor='ls')
    return np.asarray(im, dtype=np.float32) / 255.0


def _gauss(a, sigma):
    """Separable gaussian blur (true sigma, px), zero padded, pure numpy."""
    if sigma <= 0:
        return a
    r = max(1, int(math.ceil(3.0 * sigma)))
    k = np.exp(-0.5 * (np.arange(-r, r + 1, dtype=np.float32) / sigma) ** 2)
    k /= k.sum()
    h, w = a.shape
    p = np.zeros((h, w + 2 * r), np.float32)
    p[:, r:r + w] = a
    t = np.zeros((h, w), np.float32)
    for i, kv in enumerate(k):
        t += kv * p[:, i:i + w]
    p = np.zeros((h + 2 * r, w), np.float32)
    p[r:r + h] = t
    o = np.zeros((h, w), np.float32)
    for i, kv in enumerate(k):
        o += kv * p[i:i + h]
    return o


def element_raster(text, weight, size, tracking, cx, by, fill, fill_opacity=1.0,
                   halo=None, pens=None, scale=1):
    """Full-opacity straight-alpha RGBA crop of one element (text + halo).

    fill = [r,g,b] 0..255.   halo = dict(color=[r,g,b], blur=sigma px @1080p,
    opacity, dx, dy) or None - a gaussian-blurred copy of the glyph coverage
    drawn under the text (black "shadow" for light text, white glow for dark).
    Returns (rgba float32 (h,w,4), x0, y0) with x0,y0 in OUTPUT pixels.
    """
    if pens is None:
        pens, _ = layout_pens(text, weight, size, tracking, cx)
    x0, y0, x1, y1 = text_bbox(text, weight, size, pens, by)
    pad = 0
    if halo and halo.get('opacity', 0) > 0:
        pad = int(math.ceil(3.0 * halo.get('blur', 0) + max(abs(halo.get('dx', 0)),
                                                             abs(halo.get('dy', 0))))) + 1
    box = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    a = raster_text(text, weight, size, pens, by, box, scale)
    at = np.clip(a * float(fill_opacity), 0.0, 1.0)
    fill = np.asarray(fill, np.float32) / 255.0
    rgba = np.empty(a.shape + (4,), np.float32)
    if halo and halo.get('opacity', 0) > 0:
        s = _gauss(a, float(halo.get('blur', 0)) * scale)
        dx = int(round(halo.get('dx', 0) * scale))
        dy = int(round(halo.get('dy', 0) * scale))
        if dx or dy:
            s = np.roll(np.roll(s, dy, axis=0), dx, axis=1)
        ah = np.clip(s, 0.0, 1.0) * float(halo['opacity'])
        hcol = np.asarray(halo.get('color', [0, 0, 0]), np.float32) / 255.0
        oa = at + ah * (1.0 - at)
        wt = at / np.maximum(oa, 1e-6)
        rgba[..., :3] = fill[None, None, :] * wt[..., None] + hcol[None, None, :] * (1.0 - wt)[..., None]
        rgba[..., 3] = oa
    else:
        rgba[..., :3] = fill[None, None, :]
        rgba[..., 3] = at
    return rgba, int(round(box[0] * scale)), int(round(box[1] * scale))


# --------------------------------------------------------------------------- #
# timeline
# --------------------------------------------------------------------------- #
_TL = None


def load_timeline(path=None, force=False):
    global _TL
    if _TL is None or force or path:
        with open(path or TIMELINE_PATH, encoding='utf-8') as fh:
            _TL = json.load(fh)
        _elem_layer.cache_clear()
    return _TL


def _ease(u, kind):
    if kind in (None, 'linear'):
        return u
    if kind == 'smoothstep':
        return u * u * (3.0 - 2.0 * u)
    if kind == 'hold':
        return 0.0
    raise ValueError('unknown easing %r' % kind)


def eval_keys(keys, f, default=1.0):
    """keys = [[frame, value] or [frame, value, easing_to_next_key], ...] sorted
    by frame (frames may be fractional).  Constant before the first / after the
    last key.  easing: 'linear' (default), 'smoothstep', 'hold'."""
    if not keys:
        return default
    if f <= keys[0][0]:
        return float(keys[0][1])
    if f >= keys[-1][0]:
        return float(keys[-1][1])
    for k0, k1 in zip(keys[:-1], keys[1:]):
        if k0[0] <= f <= k1[0]:
            if k1[0] == k0[0]:
                return float(k1[1])
            u = (f - k0[0]) / float(k1[0] - k0[0])
            u = _ease(u, k0[2] if len(k0) > 2 else 'linear')
            return float(k0[1] + (k1[1] - k0[1]) * u)
    return default


def global_fade(frame_idx, tl=None):
    """Brightness multiplier for the final composite (fade to black at the end).
    Apply to gamma-encoded values:  out = composite * global_fade(f)."""
    tl = tl or load_timeline()
    return eval_keys(tl.get('global_fade', {}).get('keys', []), frame_idx, 1.0)


def element_text(el, use_old_name=False, tl=None):
    tl = tl or load_timeline()
    if el.get('is_producer_name'):
        return tl['producer_name_old'] if use_old_name else tl['producer_name_new']
    return el['text']


def element_style(el, tl=None):
    """Element dict with its style defaults merged in."""
    tl = tl or load_timeline()
    out = dict(tl.get('styles', {}).get(el.get('style'), {}))
    out.update(el)
    return out


@lru_cache(maxsize=1024)
def _elem_layer(idx, use_old_name, scale):
    tl = load_timeline()
    el = element_style(tl['elements'][idx], tl)
    text = element_text(el, use_old_name, tl)
    cx, by = el['anchor']
    pens = el.get('pens')
    if pens is not None and len(pens) != len(text):
        pens = None
    return element_raster(text, el['weight'], el['size'], el['tracking'], cx, by,
                          el.get('fill', [255, 255, 255]), el.get('fill_opacity', 1.0),
                          el.get('halo'), pens, scale)


def element_opacity(el, frame_idx):
    if frame_idx < el['start'] or frame_idx >= el['end']:
        return 0.0
    return max(0.0, min(1.0, eval_keys(el.get('opacity'), frame_idx, 1.0)))


def frame_layers(frame_idx, use_old_name=False, scale=1):
    """[(rgba crop float32 straight alpha at full opacity, x0, y0, opacity, id)]
    for every element visible on this frame, in paint order."""
    tl = load_timeline()
    out = []
    for i, el in enumerate(tl['elements']):
        op = element_opacity(el, frame_idx)
        if op <= 0.0:
            continue
        rgba, x0, y0 = _elem_layer(i, bool(use_old_name), scale)
        out.append((rgba, x0, y0, op, el['id']))
    return out


def _clip(rgba, x0, y0, wout, hout):
    h, w = rgba.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(w, wout - x0), min(h, hout - y0)
    if sx1 <= sx0 or sy1 <= sy0:
        return None
    return rgba[sy0:sy1, sx0:sx1], x0 + sx0, y0 + sy0


def render_text_layer(frame_idx, use_old_name=False, scale=1):
    """float32 (1080*scale, 1920*scale, 4) straight-alpha RGBA, sRGB 0..1."""
    wout, hout = int(round(W * scale)), int(round(H * scale))
    out = np.zeros((hout, wout, 4), np.float32)
    for rgba, x0, y0, op, _ in frame_layers(frame_idx, use_old_name, scale):
        c = _clip(rgba, x0, y0, wout, hout)
        if c is None:
            continue
        src, dx, dy = c
        dst = out[dy:dy + src.shape[0], dx:dx + src.shape[1]]
        sa = src[..., 3:4] * op
        da = dst[..., 3:4]
        oa = sa + da * (1.0 - sa)
        rgb = (src[..., :3] * sa + dst[..., :3] * da * (1.0 - sa)) / np.maximum(oa, 1e-6)
        dst[..., :3] = np.where(oa > 0, rgb, 0.0)
        dst[..., 3:4] = oa
    return out


def composite_text(rgb, frame_idx, use_old_name=False, scale=1, fade=True):
    """In-place: rgb = float array (1080*scale, 1920*scale, 3), sRGB 0..1."""
    hout, wout = rgb.shape[:2]
    for rgba, x0, y0, op, _ in frame_layers(frame_idx, use_old_name, scale):
        c = _clip(rgba, x0, y0, wout, hout)
        if c is None:
            continue
        src, dx, dy = c
        dst = rgb[dy:dy + src.shape[0], dx:dx + src.shape[1]]
        a = src[..., 3:4] * op
        dst[...] = dst * (1.0 - a) + src[..., :3] * a
    if fade:
        g = global_fade(frame_idx)
        if g < 1.0:
            rgb *= g
    return rgb


def composite_over(bg_rgb, layer):
    """bg_rgb float (H,W,3) sRGB 0..1; layer from render_text_layer()."""
    a = layer[..., 3:4]
    return bg_rgb * (1.0 - a) + layer[..., :3] * a


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _write(path, layer, bg=None):
    import cv2
    if bg is None:
        im = np.clip(layer * 255.0 + 0.5, 0, 255).astype(np.uint8)
        cv2.imwrite(path, cv2.cvtColor(im, cv2.COLOR_RGBA2BGRA))
    else:
        b = np.empty(layer.shape[:2] + (3,), np.float32)
        b[:] = np.asarray(bg, np.float32) / 255.0
        im = np.clip(composite_over(b, layer) * 255.0 + 0.5, 0, 255).astype(np.uint8)
        cv2.imwrite(path, cv2.cvtColor(im, cv2.COLOR_RGB2BGR))


def sheet_frames(tl=None):
    """One representative (fully faded-in) frame per distinct on-screen text state."""
    tl = tl or load_timeline()
    frames = set()
    for el in tl['elements']:
        ks = el.get('opacity') or []
        full = [k[0] for k in ks if k[1] >= 1.0]
        f0 = max(el['start'], int(math.ceil(min(full)))) if full else el['start']
        f1 = min(el['end'] - 1, int(math.floor(max(full)))) if full else el['end'] - 1
        frames.add(int((f0 + f1) // 2) if f1 - f0 > 20 else f1)
    return sorted(frames)


def write_sheet(path, use_old_name=False, cols=6, tw=480):
    import cv2
    tl = load_timeline()
    th = int(tw * H / W)
    tiles = []
    for f in sheet_frames(tl):
        lay = render_text_layer(f, use_old_name)
        dark = any(sum(element_style(el, tl).get('fill', [255] * 3)) < 380
                   for el in tl['elements'] if element_opacity(el, f) > 0 and 'small' not in el['id'])
        b = np.empty((H, W, 3), np.float32)
        b[:] = (0.86, 0.84, 0.78) if dark else (0.16, 0.24, 0.34)
        im = np.clip(composite_over(b, lay) * 255 + 0.5, 0, 255).astype(np.uint8)
        im = cv2.resize(cv2.cvtColor(im, cv2.COLOR_RGB2BGR), (tw, th), interpolation=cv2.INTER_AREA)
        cv2.putText(im, 'f%d' % f, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 255), 1, cv2.LINE_AA)
        tiles.append(im)
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
    cv2.imwrite(path, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 90])


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description='text overlay renderer (see module docstring)')
    ap.add_argument('--frame', type=int)
    ap.add_argument('--out')
    ap.add_argument('--bg', help='r,g,b (0-255): flatten on this colour instead of writing RGBA')
    ap.add_argument('--scale', type=int, default=1, help='1 = 1920x1080, 2 = 3840x2160')
    ap.add_argument('--old-name', action='store_true', help='verification only: draw the old producer name')
    ap.add_argument('--sheet', metavar='JPG', help='write a contact sheet of every text card')
    ap.add_argument('--list', action='store_true', help='print the element table')
    ap.add_argument('--bench', action='store_true', help='time rendering all frames')
    a = ap.parse_args(argv)
    tl = load_timeline()
    if a.list:
        for el in tl['elements']:
            s = element_style(el, tl)
            print('%-20s %-9s %3d trk %6.2f cx %6.1f by %4d  f%4d-%4d  %s' % (
                el['id'], s['weight'], s['size'], s['tracking'], s['anchor'][0], s['anchor'][1],
                el['start'], el['end'], element_text(el, a.old_name, tl)))
    if a.sheet:
        write_sheet(a.sheet, a.old_name)
        print('wrote', a.sheet)
    if a.frame is not None:
        lay = render_text_layer(a.frame, a.old_name, a.scale)
        bg = [float(v) for v in a.bg.split(',')] if a.bg else None
        out = a.out or 'text_%04d.png' % a.frame
        _write(out, lay, bg)
        print('wrote', out, lay.shape, 'alpha max %.3f' % lay[..., 3].max(),
              'global_fade %.3f' % global_fade(a.frame))
    if a.bench:
        import time
        t = time.time()
        for f in range(tl['nframes']):
            render_text_layer(f)
        print('%d frames in %.1f s' % (tl['nframes'], time.time() - t))


if __name__ == '__main__':
    main()
