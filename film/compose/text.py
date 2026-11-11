#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Text overlay renderer for the 《药食同源》 rebuild.

    render_text_layer(frame_idx, use_old_name=False) -> float32 (1080,1920,4)
        straight-alpha RGBA, sRGB 0..1, shadow included, fully transparent
        where there is no text.  Composite it "over" the backdrop IN sRGB SPACE
        (that is how the original was blended):   out = bg*(1-a) + rgb*a

    global_fade(frame_idx) -> float
        multiplier (0..1) the compositor must apply to the FINAL picture
        (backdrop + text) - the fade to black at the end of the film.  It is NOT
        baked into render_text_layer().

All parameters live in ../timeline.json (reverse-engineered from the original
film, see the "_about" block there).  The JSON stores the NEW producer name;
use_old_name=True swaps the old one back in for verification only.

Only Pillow + numpy are needed (cv2 only for the CLI).  No bpy.

CLI:
    python text.py --frame 60 --out x.png            # RGBA png of the layer
    python text.py --frame 60 --out x.png --bg 20,24,40   # flattened on a colour
    python text.py --sheet sheet.jpg                 # contact sheet of all cards
"""
import json
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
SS = 4  # supersampling factor of the glyph rasteriser

WEIGHT_FILES = {
    'Light': 'NotoSerifCJKsc-Light.otf',
    'Regular': 'NotoSerifCJKsc-Regular.otf',
    'Medium': 'NotoSerifCJKsc-Medium.otf',
    'SemiBold': 'NotoSerifCJKsc-SemiBold.otf',
    'Bold': 'NotoSerifCJKsc-Bold.otf',
    'Black': 'NotoSerifCJKsc-Black.otf',
}


# --------------------------------------------------------------------------- #
# glyph rasteriser
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=256)
def _font(weight, px_ss):
    """px_ss = font size in supersampled pixels (float, rounded to 1/64)."""
    fn = WEIGHT_FILES.get(weight, weight)
    path = fn if os.path.isabs(fn) else os.path.join(FONT_DIR, fn)
    return ImageFont.truetype(path, px_ss, layout_engine=ImageFont.Layout.BASIC)


def layout(text, weight, size, tracking=0.0):
    """Pen x-offset (frame px, relative to the line start) of every glyph and
    the total line width.  width = sum(advances) + tracking*(n-1): the trailing
    tracking is NOT part of the width, so `cx` is the centre of the visible run.
    """
    f = _font(weight, round(size * SS * 64) / 64.0)
    xs, x = [], 0.0
    for i, ch in enumerate(text):
        xs.append(x)
        x += f.getlength(ch) / SS + tracking
    width = x - tracking if text else 0.0
    return xs, width


def raster_line(text, weight, size, tracking, cx, by, ss=SS, box=None):
    """Rasterise one line.  cx = x of the centre of the run, by = baseline y
    (frame pixels, floats; pixel i covers [i, i+1)).

    Returns (alpha float32 2-D in 0..1 at frame resolution, x0, y0) where
    (x0, y0) is the frame position of the array's top-left pixel.  If box =
    (x0, y0, x1, y1) is given, the array covers exactly that frame rectangle.
    """
    f = _font(weight, round(size * ss * 64) / 64.0)
    xs, width = [], 0.0
    x = 0.0
    for ch in text:
        xs.append(x)
        x += f.getlength(ch) / ss + tracking
    width = x - tracking if text else 0.0
    left = cx - width / 2.0
    if box is None:
        pad = int(np.ceil(size * 0.35)) + 2
        bx0 = int(np.floor(left)) - pad
        bx1 = int(np.ceil(left + width)) + pad
        by0 = int(np.floor(by - size * 1.15)) - 2
        by1 = int(np.ceil(by + size * 0.40)) + 2
    else:
        bx0, by0, bx1, by1 = [int(v) for v in box]
    wpx, hpx = (bx1 - bx0), (by1 - by0)
    im = Image.new('L', (wpx * ss, hpx * ss), 0)
    d = ImageDraw.Draw(im)
    for ch, gx in zip(text, xs):
        if ch in ' 　':
            continue
        px = (left + gx - bx0) * ss
        py = (by - by0) * ss
        d.text((px, py), ch, font=f, fill=255, anchor='ls')
    a = np.asarray(im, dtype=np.float32) / 255.0
    a = a.reshape(hpx, ss, wpx, ss).mean(axis=(1, 3))
    return a, bx0, by0


def _gauss(a, sigma):
    """Separable gaussian blur (true sigma in px), zero padded, pure numpy."""
    if sigma <= 0:
        return a
    r = max(1, int(np.ceil(3.0 * sigma)))
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


def _shift(a, dx, dy):
    """Sub-pixel translate of a 2-D array by (dx, dy), bilinear, zero fill."""
    if dx == 0 and dy == 0:
        return a
    h, w = a.shape
    ix, iy = int(np.floor(dx)), int(np.floor(dy))
    fx, fy = dx - ix, dy - iy

    def ishift(arr, sx, sy):
        out = np.zeros_like(arr)
        xs0, xs1 = max(0, sx), min(w, w + sx)
        ys0, ys1 = max(0, sy), min(h, h + sy)
        if xs1 > xs0 and ys1 > ys0:
            out[ys0:ys1, xs0:xs1] = arr[ys0 - sy:ys1 - sy, xs0 - sx:xs1 - sx]
        return out

    out = (1 - fx) * (1 - fy) * ishift(a, ix, iy)
    if fx:
        out += fx * (1 - fy) * ishift(a, ix + 1, iy)
    if fy:
        out += (1 - fx) * fy * ishift(a, ix, iy + 1)
    if fx and fy:
        out += fx * fy * ishift(a, ix + 1, iy + 1)
    return out


def element_raster(text, weight, size, tracking, cx, by, fill, fill_opacity=1.0,
                   shadow=None, soften=0.0, scale=1.0):
    """Full-opacity straight-alpha RGBA crop of one element (text + shadow).

    Returns (rgba float32 (h,w,4), x0, y0).
    shadow = dict(dx, dy, blur, color=[r,g,b] 0..1, opacity) or None
    soften = gaussian sigma (frame px) applied to the glyph coverage
    scale  = uniform scale about (cx, by)   (used by motion keyframes)
    """
    size_s = size * scale
    track_s = tracking * scale
    xs, width = layout(text, weight, size_s, track_s)
    pad = 2
    if shadow:
        pad += int(np.ceil(3.2 * shadow.get('blur', 0) + max(abs(shadow.get('dx', 0)),
                                                              abs(shadow.get('dy', 0)))))
    pad += int(np.ceil(3 * soften))
    left = cx - width / 2.0
    box = (int(np.floor(left - size_s * 0.15)) - pad,
           int(np.floor(by - size_s * 1.10)) - pad,
           int(np.ceil(left + width + size_s * 0.15)) + pad,
           int(np.ceil(by + size_s * 0.35)) + pad)
    a, x0, y0 = raster_line(text, weight, size_s, track_s, cx, by, box=box)
    if soften > 0:
        a = _gauss(a, soften)
    at = np.clip(a * fill_opacity, 0, 1)
    fill = np.asarray(fill, np.float32)
    if shadow and shadow.get('opacity', 0) > 0:
        s = _gauss(a, float(shadow.get('blur', 0)))
        s = _shift(s, float(shadow.get('dx', 0)), float(shadow.get('dy', 0)))
        gain = float(shadow.get('gain', 1.0))
        as_ = np.clip(s * gain, 0, 1) * float(shadow['opacity'])
        scol = np.asarray(shadow.get('color', [0, 0, 0]), np.float32)
        out_a = at + as_ * (1 - at)
        with np.errstate(invalid='ignore', divide='ignore'):
            rgb = (fill[None, None, :] * at[..., None]
                   + scol[None, None, :] * (as_ * (1 - at))[..., None]) / np.maximum(out_a, 1e-6)[..., None]
        rgba = np.concatenate([rgb, out_a[..., None]], axis=2)
    else:
        rgba = np.empty(a.shape + (4,), np.float32)
        rgba[..., :3] = fill[None, None, :]
        rgba[..., 3] = at
    return rgba.astype(np.float32), x0, y0


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
        return u * u * (3 - 2 * u)
    if kind == 'ease_out_cubic':
        return 1 - (1 - u) ** 3
    if kind == 'ease_in_cubic':
        return u ** 3
    if kind == 'ease_in_out_cubic':
        return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2
    if kind == 'ease_out_quad':
        return 1 - (1 - u) ** 2
    if kind == 'ease_in_quad':
        return u * u
    raise ValueError('unknown easing %r' % kind)


def eval_keys(keys, f, default=1.0):
    """keys = [[frame, value] or [frame, value, easing_to_next], ...] sorted by
    frame.  Constant before the first / after the last key."""
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
    """Brightness multiplier for the final composite (fade to black)."""
    tl = tl or load_timeline()
    return eval_keys(tl.get('global_fade', {}).get('keys', []), frame_idx, 1.0)


def _elem_text(el, use_old_name, tl):
    if el.get('is_producer_name'):
        return tl['producer_name_old'] if use_old_name else tl['producer_name_new']
    return el['text']


@lru_cache(maxsize=512)
def _elem_layer(idx, use_old_name, scale_q, dx_q, dy_q):
    tl = load_timeline()
    el = tl['elements'][idx]
    st = tl['styles'][el['style']] if 'style' in el else {}
    g = lambda k, d=None: el.get(k, st.get(k, d))
    cx, by = el['anchor']
    return element_raster(
        _elem_text(el, use_old_name, tl), g('weight'), g('size'), g('tracking', 0.0),
        cx + dx_q / 8.0, by + dy_q / 8.0, g('fill', [1, 1, 1]), g('fill_opacity', 1.0),
        g('shadow'), g('soften', 0.0), scale_q / 4096.0)


def active_elements(frame_idx, tl=None):
    """[(index, element, opacity)] of the elements visible on this frame."""
    tl = tl or load_timeline()
    out = []
    for i, el in enumerate(tl['elements']):
        if frame_idx < el['start'] or frame_idx >= el['end']:
            continue
        op = eval_keys(el.get('opacity'), frame_idx, 1.0)
        if op <= 0.0:
            continue
        out.append((i, el, op))
    return out


def render_text_layer(frame_idx, use_old_name=False):
    """float32 (1080,1920,4) straight-alpha RGBA, sRGB 0..1."""
    tl = load_timeline()
    out = np.zeros((H, W, 4), np.float32)
    for i, el, op in active_elements(frame_idx, tl):
        mo = el.get('motion') or {}
        sc = eval_keys(mo.get('scale'), frame_idx, 1.0)
        dx = eval_keys(mo.get('dx'), frame_idx, 0.0)
        dy = eval_keys(mo.get('dy'), frame_idx, 0.0)
        rgba, x0, y0 = _elem_layer(i, bool(use_old_name), int(round(sc * 4096)),
                                   int(round(dx * 8)), int(round(dy * 8)))
        h, w = rgba.shape[:2]
        sx0, sy0 = max(0, -x0), max(0, -y0)
        sx1, sy1 = min(w, W - x0), min(h, H - y0)
        if sx1 <= sx0 or sy1 <= sy0:
            continue
        src = rgba[sy0:sy1, sx0:sx1]
        dst = out[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
        sa = src[..., 3:4] * op
        da = dst[..., 3:4]
        oa = sa + da * (1 - sa)
        rgb = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
        dst[..., :3] = np.where(oa > 0, rgb, 0)
        dst[..., 3:4] = oa
    return out


def composite_over(bg_rgb, layer):
    """bg_rgb float (H,W,3) sRGB 0..1; layer from render_text_layer()."""
    a = layer[..., 3:4]
    return bg_rgb * (1 - a) + layer[..., :3] * a


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _to_png(layer, path, bg=None):
    import cv2
    if bg is None:
        im = np.clip(layer * 255.0 + 0.5, 0, 255).astype(np.uint8)
        cv2.imwrite(path, cv2.cvtColor(im, cv2.COLOR_RGBA2BGRA))
    else:
        b = np.empty((H, W, 3), np.float32)
        b[:] = np.asarray(bg, np.float32) / 255.0
        im = np.clip(composite_over(b, layer) * 255.0 + 0.5, 0, 255).astype(np.uint8)
        cv2.imwrite(path, cv2.cvtColor(im, cv2.COLOR_RGB2BGR))


def _sheet(path, use_old_name=False, cols=6, tw=480):
    import cv2
    tl = load_timeline()
    frames = tl.get('sheet_frames')
    if not frames:
        frames = sorted({int((el['start'] + el['end'] - 1) // 2) for el in tl['elements']})
    th = int(tw * H / W)
    tiles = []
    for f in frames:
        lay = render_text_layer(f, use_old_name)
        dark = any(sum(tl['styles'].get(el.get('style'), el).get('fill', el.get('fill', [1, 1, 1]))) < 1.5
                   for _, el, _ in active_elements(f, tl))
        b = np.empty((H, W, 3), np.float32)
        b[:] = (0.80, 0.78, 0.72) if dark else (0.10, 0.13, 0.20)
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
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--frame', type=int)
    ap.add_argument('--out')
    ap.add_argument('--bg', help='r,g,b (0-255): flatten on this colour instead of writing RGBA')
    ap.add_argument('--old-name', action='store_true', help='verification only: draw the old producer name')
    ap.add_argument('--sheet', metavar='JPG', help='write a contact sheet of every text card')
    ap.add_argument('--bench', action='store_true', help='time rendering all frames')
    a = ap.parse_args(argv)
    if a.sheet:
        _sheet(a.sheet, a.old_name)
        print('wrote', a.sheet)
    if a.frame is not None:
        lay = render_text_layer(a.frame, a.old_name)
        bg = [float(v) for v in a.bg.split(',')] if a.bg else None
        out = a.out or 'text_%04d.png' % a.frame
        _to_png(lay, out, bg)
        print('wrote', out, 'alpha max %.3f' % lay[..., 3].max(), 'global_fade %.3f' % global_fade(a.frame))
    if a.bench:
        import time
        tl = load_timeline()
        t = time.time()
        for f in range(tl['nframes']):
            render_text_layer(f)
        print('%d frames in %.1f s' % (tl['nframes'], time.time() - t))


if __name__ == '__main__':
    main()
