#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Compositor of VERSION B of 《药食同源》 (top-down specimen plates + ingredient typography).

    compose_frame_b(frame_idx, scale=1) -> uint8 (1080*scale, 1920*scale, 3) RGB

Per frame:  still of the scene (film/renders_b/<id>.png = the film frame at t = 0)
            -> slow push-in (Lanczos)  -> 2-D text (ink on pale grounds / warm white on dark ones)
            -> retro.retro() vintage print finishing  -> global fade to black at the very end.

Scenes / cut grid: film/shots_b.json (built-in fallback table below).  Everything is laid out in
1920x1080 pixel units and multiplied by `scale` (1 = 1080p, 2 = 4K); stills of any 16:9 size are
accepted (a 4K still is pre-shrunk with INTER_AREA for a 1080p build, a 1080p still is enlarged
with Lanczos for a 4K build).

Stills        renders_b/<id>.png or renders_b/<bNN>*.png ; the landing also needs the ground-only
              plate renders_b/<bNN>*empty*.png.  A missing / unreadable still = plain paper
              placeholder carrying the shot id.
Push-in       1.012 over 8-frame shots, 1.02 over 16, 1.05 over 64, 1.06 over the intro / landing.
Landing       736-1248: stop-motion reveal, one character per 8 frames (药 736, 食 744, 同 752,
              源 760): the full plate is blended over the empty plate through one soft-edged
              vertical band per character; the columns are measured from the difference of the
              two stills.
Text          film/timeline.json through text.py (same strings and timings as the original):
                0-448    unchanged layout
                448-608  the big ingredient label (unchanged position = the clear window)
                608-736  only the small ingredient label near the bottom (the physical glyph
                         replaces the big words 厨房里 / 藏着 / 本草)
                736-1248 the big 药食同源 line is dropped (physical glyph); the remaining lines of
                         the three outro cards are re-laid in the clear lower third (RELAY below)
              colour per card: dark ink (glyph fill only, no shadow) where the ground under the
              card is lighter than LUMA_SPLIT, warm white (+ a faint soft shadow on mid-tones)
              where it is darker.

CLI
    python compose_b.py --frame 650 --out f650.png [--scale 1]
    python compose_b.py --sheet sheet.jpg [--step 40 --tw 320]
    python compose_b.py --list
"""
import glob
import json
import math
import os
import re
import sys
from collections import OrderedDict

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.dirname(HERE)
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import text as T      # noqa: E402
import retro as R     # noqa: E402

W0, H0 = 1920, 1080
NFRAMES = 1248
RENDERS_B = os.environ.get('YAOSHI_RENDERS_B', os.path.join(FILM, 'renders_b'))
SHOTS_B = os.path.join(FILM, 'shots_b.json')

RETRO_STRENGTH = float(os.environ.get('YAOSHI_B_RETRO', '1.0'))   # retro.retro(strength=...)
LUMA_SPLIT = 0.45                                   # ground luma (display value) below which text is white
INK = np.array([0.115, 0.092, 0.075], np.float32)
WARM_WHITE = np.array([0.992, 0.968, 0.918], np.float32)
INK_OPACITY = 0.94
WHITE_OPACITY = 0.97
PAPER = np.array([0.930, 0.905, 0.850], np.float32)   # placeholder paper

LANDING = (736, 1248)
REVEAL_STEP = 8            # frames per character
REVEAL_EDGE = 10.0         # half width of the soft band edge, 1080p px

# manifest {key: {'path','mtime','size'} | None}; key = scene id or scene id + '#empty'.
# build_b.py freezes it once per build so that all workers see the same set of stills.
MANIFEST = None

_FALLBACK_SCENES = [
    ('b00_intro', 0, 192), ('b01_yinyang', 192, 256), ('b02_cabinet', 256, 320), ('b03_grains', 320, 384),
    ('b04_bowl', 384, 448), ('b05_shanyao', 448, 464), ('b06_gouqi', 464, 480), ('b07_dazao', 480, 496),
    ('b08_shengjiang', 496, 512), ('b09_jupi', 512, 528), ('b10_lianzi', 528, 544), ('b11_baihe', 544, 560),
    ('b12_shanzha', 560, 576), ('b13_juhua', 576, 592), ('b14_fengmi', 592, 608), ('b15_fuling', 608, 616),
    ('b16_yiyiren', 616, 624), ('b17_guiyuan', 624, 632), ('b18_heizhima', 632, 640), ('b19_bohe', 640, 648),
    ('b20_sangshen', 648, 656), ('b21_chixiaodou', 656, 664), ('b22_heye', 664, 672), ('b23_gancao', 672, 680),
    ('b24_jianghuang', 680, 688), ('b25_shaji', 688, 696), ('b26_juemingzi', 696, 704),
    ('b27_luohanguo', 704, 712), ('b28_rougui', 712, 720), ('b29_qianshi', 720, 728), ('b30_lingzhi', 728, 736),
    ('b31_landing', 736, 1248)]

# ----------------------------------------------------------------------------- outro re-layout
# 1080p px; by = baseline.  Everything not listed keeps the geometry of timeline.json.
DROP = {'o1_title'}                                   # + every montage_8f big word (see b_elements)
RELAY = {
    # card 1  (800-930)
    'o1_sub':  dict(size=58, by=832),
    'o1_note': dict(size=29, by=892),
    # card 2  (932-1058)
    'o2_title': dict(size=74, by=812),
    'o2_sub':   dict(size=42, by=878),
    'o2_note':  dict(size=28, by=930),
    # card 3  (1080-1248):  制作人  肖汶玥   on one line, the film line below
    'o3_role': dict(size=40, tracking_em=0.5, cx=778.75, by=809),
    'o3_name': dict(size=86, tracking_em=0.34, cx=1063.0, by=826),
    'o3_sub':  dict(size=38, by=900),
}


# ----------------------------------------------------------------------------- scenes
def _load_scenes():
    try:
        with open(SHOTS_B, encoding='utf-8') as fh:
            sc = [(s['id'], int(s['start']), int(s['end'])) for s in json.load(fh)['scenes']]
        sc.sort(key=lambda s: s[1])
        ok = sc[0][1] == 0 and sc[-1][2] == NFRAMES and all(a[2] == b[1] for a, b in zip(sc[:-1], sc[1:]))
        if ok:
            return sc
    except Exception:
        pass
    return list(_FALLBACK_SCENES)


_SCENES = _load_scenes()


def scenes():
    """[(id, start, end)] of version B, contiguous over 0..1248."""
    return list(_SCENES)


def scene_at(frame_idx):
    for s in _SCENES:
        if s[1] <= frame_idx < s[2]:
            return s
    raise ValueError('frame %r outside 0..%d' % (frame_idx, NFRAMES))


def zoom_max(start, end):
    n = end - start
    if n <= 8:
        return 1.012
    if n <= 16:
        return 1.02
    if n <= 64:
        return 1.05
    return 1.06


# ----------------------------------------------------------------------------- stills
def _short(sid):
    m = re.match(r'(b\d+)', sid)
    return m.group(1) if m else sid


def find_still(sid, empty=False, renders=None):
    """Path of the still of scene `sid` (or of its ground-only 'empty' plate), or None."""
    d = renders or RENDERS_B
    sh = _short(sid)
    if empty:
        cands = [os.path.join(d, sid + '_empty.png'), os.path.join(d, sh + '_empty.png')]
        cands += sorted(glob.glob(os.path.join(d, sh + '*empty*.png')))
    else:
        cands = [os.path.join(d, sid + '.png'), os.path.join(d, sh + '.png')]
        cands += sorted(p for p in glob.glob(os.path.join(d, sh + '*.png'))
                        if not re.search(r'empty|depth|plan|mask|\.part', os.path.basename(p)))
    for p in cands:
        if os.path.isfile(p):
            return p
    return None


def _entry(path):
    if not path:
        return None
    try:
        st = os.stat(path)
    except OSError:
        return None
    return dict(path=path, mtime=st.st_mtime, size=st.st_size)


def _readable(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return im is not None and im.ndim >= 2 and im.shape[0] >= 270 and im.shape[1] >= 480


def build_manifest(renders=None, check=True):
    """Freeze the set of stills: {scene id / scene id + '#empty': entry or None}."""
    man = {}
    for sid, a, b in _SCENES:
        keys = [(sid, False)] + ([(sid + '#empty', True)] if a >= LANDING[0] else [])
        for key, empty in keys:
            e = _entry(find_still(sid, empty, renders))
            if e is not None and check and not _readable(e['path']):
                e = None                                   # still being written / broken
            man[key] = e
    return man


def _still_entry(key):
    if MANIFEST is not None:
        return MANIFEST.get(key)
    sid, _, tag = key.partition('#')
    return _entry(find_still(sid, tag == 'empty'))


def is_placeholder(sid):
    return _still_entry(sid) is None


_img_cache = OrderedDict()
_IMG_CACHE_MAX = 4


def _cache_put(key, val):
    _img_cache[key] = val
    _img_cache.move_to_end(key)
    while len(_img_cache) > _IMG_CACHE_MAX:
        _img_cache.popitem(last=False)
    return val


def _load_rgb(path):
    """float32 RGB 0..1 (alpha, if any, is flattened on the placeholder paper), or None."""
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im is None or im.ndim < 2:
        return None
    div = 65535.0 if im.dtype == np.uint16 else 255.0
    im = im.astype(np.float32) / div
    if im.ndim == 2:
        im = np.repeat(im[..., None], 3, axis=2)
    elif im.shape[2] == 4:
        a = im[..., 3:4]
        im = im[..., 2::-1] * a + PAPER * (1 - a)
    else:
        im = im[..., 2::-1]
    return np.ascontiguousarray(im)


def _prep(key, wout, hout, zmax):
    """Still of manifest key, prepared for the push-in at output size (cached): float32 RGB, at most
    zmax x the output size (bigger stills are pre-shrunk with INTER_AREA).  None = placeholder."""
    e = _still_entry(key)
    if e is None:
        return None
    ck = ('prep', e['path'], e['mtime'], e['size'], wout, hout)
    if ck in _img_cache:
        _img_cache.move_to_end(ck)
        return _img_cache[ck]
    im = _load_rgb(e['path'])
    if im is None:
        return _cache_put(ck, None)
    hs, ws = im.shape[:2]
    fit = max(wout / ws, hout / hs)                      # cover fit, output px per source px at z = 1
    lim = 1.0 / zmax
    if fit < lim * 0.98:                                 # source much bigger than needed: shrink once
        k = fit / lim
        im = cv2.resize(im, (int(round(ws * k)), int(round(hs * k))), interpolation=cv2.INTER_AREA)
    return _cache_put(ck, im)


def _push_in(src, z, wout, hout, anchor=(0.5, 0.5)):
    """Resample src (any 16:9-ish size) to the output frame, enlarged by z about `anchor`."""
    hs, ws = src.shape[:2]
    s = z * max(wout / ws, hout / hs)
    ax, ay = anchor
    tx = (ax * wout - 0.5) - s * (ax * ws - 0.5)
    ty = (ay * hout - 0.5) - s * (ay * hs - 0.5)
    if abs(s - 1.0) < 1e-9 and abs(tx) < 1e-6 and abs(ty) < 1e-6 and (ws, hs) == (wout, hout):
        return src.copy()
    M = np.float64([[s, 0, tx], [0, s, ty]])
    return cv2.warpAffine(src, M, (wout, hout), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT_101)


# ----------------------------------------------------------------------------- placeholder
_ph_cache = {}


def _paper_plain(wout, hout):
    key = (wout, hout)
    if key not in _ph_cache:
        rng = np.random.default_rng(5)
        mott = cv2.resize(cv2.GaussianBlur(rng.standard_normal((135, 240)).astype(np.float32), (0, 0), 7),
                          (wout, hout), interpolation=cv2.INTER_CUBIC) * 0.05
        fine = cv2.GaussianBlur(rng.standard_normal((hout, wout)).astype(np.float32), (0, 0), 0.8 * wout / W0) * 0.006
        _ph_cache[key] = np.clip(PAPER + (mott + fine)[..., None] * np.array([1.0, 1.03, 1.1], np.float32), 0, 1)
    return _ph_cache[key]


def _placeholder(sid, scale):
    wout, hout = W0 * scale, H0 * scale
    ck = ('ph', sid, scale)
    if ck in _img_cache:
        _img_cache.move_to_end(ck)
        return _img_cache[ck]
    img = _paper_plain(wout, hout).copy()
    size = 40
    pens, _ = T.layout_pens(sid, 'Medium', size, 4.0, W0 / 2.0)
    box = T.text_bbox(sid, 'Medium', size, pens, 150)
    cov = T.raster_text(sid, 'Medium', size, pens, 150, box, scale)
    x0, y0 = int(round(box[0] * scale)), int(round(box[1] * scale))
    a = (cov * 0.55)[..., None]
    dst = img[y0:y0 + cov.shape[0], x0:x0 + cov.shape[1]]
    dst[...] = dst * (1 - a) + INK * a
    return _cache_put(ck, img)


# ----------------------------------------------------------------------------- landing reveal
_reveal_cache = {}


def _synth_empty(full):
    """Stand-in for a missing ground-only plate: the clear lower strip of the landing plate,
    mirrored upwards (used for 24 frames only)."""
    h = full.shape[0]
    a, b = int(0.70 * h), int(0.97 * h)
    strip = full[a:b]
    rows = []
    n = 0
    flip = True
    while n < a:
        rows.append(strip[::-1] if flip else strip)
        n += strip.shape[0]
        flip = not flip
    top = np.concatenate(rows[::-1], axis=0)[-a:]
    return np.concatenate([top, full[a:]], axis=0)


def measure_columns(full, empty):
    """Three boundaries (fractions of the width) between the four characters, measured from the
    difference of the full and the ground-only plate."""
    h, w = full.shape[:2]
    sw = 960
    sh = max(1, int(round(h * sw / w)))
    d = np.abs(cv2.resize(full, (sw, sh), interpolation=cv2.INTER_AREA) -
               cv2.resize(empty, (sw, sh), interpolation=cv2.INTER_AREA)).max(axis=2)
    m = (d > 0.07).astype(np.float32)
    col = m.sum(axis=0)
    if col.sum() < 50:
        return [0.3, 0.5, 0.7]
    k = 7
    col = np.convolve(col, np.ones(k, np.float32) / k, mode='same')
    cum = np.cumsum(col) / col.sum()
    xa, xb = float(np.searchsorted(cum, 0.004)), float(np.searchsorted(cum, 0.996))
    out = []
    for i in (1, 2, 3):
        xe = xa + (xb - xa) * i / 4.0
        win = max(4, int(0.07 * (xb - xa)))
        lo, hi = max(0, int(xe) - win), min(sw, int(xe) + win + 1)
        seg = col[lo:hi]
        low = np.flatnonzero(seg <= seg.min() + 0.04 * max(col.max(), 1e-6))
        # centre of the low run that is closest to the expected position
        runs = np.split(low, np.flatnonzero(np.diff(low) > 1) + 1)
        best = min(runs, key=lambda r: abs((r[0] + r[-1]) / 2.0 + lo - xe))
        out.append(((best[0] + best[-1]) / 2.0 + lo + 0.5) / sw)
    return out


def _landing_plate(sid, f, start, wout, hout, zmax):
    """Landing plate with the first n characters revealed (n = 1..4), before the push-in."""
    full = _prep(sid, wout, hout, zmax)
    if full is None:
        return None
    n = min(4, 1 + (f - start) // REVEAL_STEP)
    if n >= 4:
        return full
    e_full = _still_entry(sid)
    e_emp = _still_entry(sid + '#empty')
    sig = (e_full['path'], e_full['mtime'], e_emp and e_emp['path'], e_emp and e_emp['mtime'], wout, hout)
    ck = ('reveal', sig, n)
    if ck in _img_cache:
        _img_cache.move_to_end(ck)
        return _img_cache[ck]
    empty = _prep(sid + '#empty', wout, hout, zmax)
    if empty is None or empty.shape != full.shape:
        if empty is not None:
            empty = cv2.resize(empty, (full.shape[1], full.shape[0]), interpolation=cv2.INTER_AREA)
        else:
            empty = _synth_empty(full)
    if sig not in _reveal_cache:
        _reveal_cache.clear()
        _reveal_cache[sig] = measure_columns(full, empty)
    bounds = _reveal_cache[sig]
    w = full.shape[1]
    x = (np.arange(w, dtype=np.float32) + 0.5)
    e = REVEAL_EDGE * w / W0
    u = np.clip((bounds[n - 1] * w + e - x) / (2 * e), 0, 1)       # bands 1..n = everything left of boundary n
    alpha = (u * u * (3 - 2 * u))[None, :, None]
    return _cache_put(ck, empty + (full - empty) * alpha)


def reveal_bounds(scale=1):
    """The measured character boundaries of the landing (fractions of the width) - for inspection."""
    sid, a, b = scene_at(LANDING[0])
    _landing_plate(sid, a, a, W0 * scale, H0 * scale, zoom_max(a, b))
    return next(iter(_reveal_cache.values()), None)


# ----------------------------------------------------------------------------- text
_B_ELEMENTS = None


def b_elements():
    """Text elements of version B: timeline.json minus the dropped lines, outro re-laid."""
    global _B_ELEMENTS
    if _B_ELEMENTS is not None:
        return _B_ELEMENTS
    tl = T.load_timeline()
    out = []
    for raw in tl['elements']:
        el = T.element_style(raw, tl)
        eid = el['id']
        if eid in DROP or (el.get('card') == 'montage_8f' and eid.endswith('_big')):
            continue
        size = el['size']
        d = dict(id=eid, card=el.get('card'), text=T.element_text(el, False, tl), weight=el['weight'], size=size,
                 tracking_em=el.get('tracking_em', el['tracking'] / float(size)), tracking=el['tracking'],
                 cx=float(el['anchor'][0]), by=el['anchor'][1], start=el['start'], end=el['end'],
                 opacity=el.get('opacity'), fill_opacity=float(el.get('fill_opacity', 1.0)), pens=el.get('pens'))
        ov = RELAY.get(eid)
        if ov:
            d.update(ov)
            d['tracking'] = d['tracking_em'] * d['size']
            d['pens'] = None
        if d['pens'] is not None and len(d['pens']) != len(d['text']):
            d['pens'] = None
        out.append(d)
    names = [d['text'] for d in out if d['id'] in ('i1_name', 'o3_name')]
    assert names == ['肖汶玥', '肖汶玥'], names
    _B_ELEMENTS = out
    return out


def _el_opacity(el, f):
    if f < el['start'] or f >= el['end']:
        return 0.0
    return max(0.0, min(1.0, T.eval_keys(el['opacity'], f, 1.0)))


def _el_sigma(el):
    return float(min(14.0, max(5.0, 0.12 * el['size'])))


_el_cache = {}


def _el_raster(el, scale):
    """(coverage, soft shadow, x0, y0) of one element at output scale (cached)."""
    key = (el['id'], scale)
    if key not in _el_cache:
        pens = el['pens'] or T.layout_pens(el['text'], el['weight'], el['size'], el['tracking'], el['cx'])[0]
        x0, y0, x1, y1 = T.text_bbox(el['text'], el['weight'], el['size'], pens, el['by'])
        sig = _el_sigma(el)
        pad = int(math.ceil(3 * sig)) + 1
        box = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
        cov = T.raster_text(el['text'], el['weight'], el['size'], pens, el['by'], box, scale)
        sh = np.clip(cv2.GaussianBlur(cov, (0, 0), sig * scale) * 1.7, 0, 1)
        _el_cache[key] = (cov, sh, int(round(box[0] * scale)), int(round(box[1] * scale)))
    return _el_cache[key]


def _el_box(el):
    """Tight 1080p box of the glyphs (for sampling the ground under the text)."""
    _, width = T.layout_pens(el['text'], el['weight'], el['size'], el['tracking'], el['cx'])
    return (el['cx'] - width / 2.0, el['by'] - 0.92 * el['size'], el['cx'] + width / 2.0, el['by'] + 0.12 * el['size'])


_mode_cache = {}


def _card_mode(sid, a, b, card, plate):
    """('ink' | 'white', ground luma) for the text card `card` on scene sid; plate = picture at t = 0
    (None = placeholder).  Decided once per scene and card from the ground under all its lines."""
    e = _still_entry(sid)
    key = (sid, card, e and e['path'], e and e['mtime'])
    if key in _mode_cache:
        return _mode_cache[key]
    if plate is None:
        res = ('ink', float(PAPER.mean()))
    else:
        small = cv2.resize(plate, (480, 270), interpolation=cv2.INTER_AREA)
        luma = small @ np.array([0.299, 0.587, 0.114], np.float32)
        num = den = 0.0
        for el in b_elements():
            if el['card'] != card or el['end'] <= a or el['start'] >= b:
                continue
            x0, y0, x1, y1 = _el_box(el)
            xa, xb = int(max(0, x0 / 4)), int(min(480, math.ceil(x1 / 4)))
            ya, yb = int(max(0, y0 / 4)), int(min(270, math.ceil(y1 / 4)))
            if xb <= xa or yb <= ya:
                continue
            area = float((xb - xa) * (yb - ya))
            num += float(np.median(luma[ya:yb, xa:xb])) * area
            den += area
        lum = num / den if den else 1.0
        res = ('white' if lum < LUMA_SPLIT else 'ink', lum)
    if len(_mode_cache) > 256:
        _mode_cache.clear()
    _mode_cache[key] = res
    return res


def _draw_text(img, f, scene, plate, scale):
    sid, a, b = scene
    hout, wout = img.shape[:2]
    for el in b_elements():
        op = _el_opacity(el, f)
        if op <= 0.0:
            continue
        mode, lum = _card_mode(sid, a, b, el['card'], plate)
        cov, sh, x0, y0 = _el_raster(el, scale)
        h, w = cov.shape
        sx0, sy0 = max(0, -x0), max(0, -y0)
        sx1, sy1 = min(w, wout - x0), min(h, hout - y0)
        if sx1 <= sx0 or sy1 <= sy0:
            continue
        dst = img[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
        c = cov[sy0:sy1, sx0:sx1, None]
        if mode == 'white':
            k = 0.50 * min(1.0, max(0.0, (lum - 0.10) / 0.25))      # soft shadow only on mid-tone grounds
            if k > 0:
                dst *= 1.0 - (k * op) * sh[sy0:sy1, sx0:sx1, None]
            al = c * (op * el['fill_opacity'] * WHITE_OPACITY)
            dst[...] = dst * (1 - al) + WARM_WHITE * al
        else:
            al = c * (op * min(1.0, el['fill_opacity'] * 1.08) * INK_OPACITY)
            dst[...] = dst * (1 - al) + INK * al
    return img


# ----------------------------------------------------------------------------- frame
def picture(frame_idx, scale=1):
    """(float32 picture after the push-in, plate at t = 0 or None, scene)."""
    f = int(frame_idx)
    scene = scene_at(f)
    sid, a, b = scene
    wout, hout = W0 * scale, H0 * scale
    zmax = zoom_max(a, b)
    z = 1.0 + (zmax - 1.0) * (f - a) / float(b - a)
    if a >= LANDING[0]:
        plate = _landing_plate(sid, f, a, wout, hout, zmax)
        ref = _prep(sid, wout, hout, zmax) if plate is not None else None
    else:
        plate = ref = _prep(sid, wout, hout, zmax)
    if plate is None:
        return _push_in(_placeholder(sid, scale), z, wout, hout), None, scene
    return _push_in(plate, z, wout, hout), ref, scene


def compose_frame_b(frame_idx, scale=1, strength=None, finish=True):
    """uint8 RGB (1080*scale, 1920*scale, 3) of film frame `frame_idx` (0-based) of version B."""
    f = int(frame_idx)
    img, plate, scene = picture(f, scale)
    img = np.clip(img, 0, 1, out=img)
    _draw_text(img, f, scene, plate, scale)
    if finish:
        k = RETRO_STRENGTH if strength is None else float(strength)
        if k > 0:
            img = R.retro(img, f, scale, k)
    g = float(T.global_fade(f))
    if g < 1.0:
        img = img * g
    return (np.clip(img, 0, 1) * 255.0 + 0.5).astype(np.uint8)


# ----------------------------------------------------------------------------- CLI
def write_sheet(path, step=40, tw=320, cols=5, scale=1, frames=None):
    frames = list(range(0, NFRAMES, step)) if frames is None else frames
    th = int(round(tw * H0 / W0))
    tiles = []
    for f in frames:
        im = cv2.resize(compose_frame_b(f, scale), (tw, th), interpolation=cv2.INTER_AREA)
        im = cv2.cvtColor(im, cv2.COLOR_RGB2BGR)
        cv2.putText(im, '%d %s' % (f, _short(scene_at(f)[0])), (5, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(im, '%d %s' % (f, _short(scene_at(f)[0])), (5, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 230, 255), 1, cv2.LINE_AA)
        tiles.append(im)
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    cv2.imwrite(path, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]),
                [cv2.IMWRITE_JPEG_QUALITY, 90])


def main(argv=None):
    global RETRO_STRENGTH
    import argparse
    ap = argparse.ArgumentParser(description='version B compositor (see module docstring)')
    ap.add_argument('--frame', type=int, action='append')
    ap.add_argument('--out')
    ap.add_argument('--scale', type=int, default=1)
    ap.add_argument('--strength', type=float, default=None, help='retro strength (default %.2f)' % RETRO_STRENGTH)
    ap.add_argument('--sheet')
    ap.add_argument('--step', type=int, default=40)
    ap.add_argument('--tw', type=int, default=320)
    ap.add_argument('--cols', type=int, default=5)
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args(argv)
    if a.strength is not None:
        RETRO_STRENGTH = a.strength
    if a.list:
        man = build_manifest()
        for sid, s, e in _SCENES:
            en = man.get(sid)
            print('%-16s %4d-%4d  zoom %.3f  %s' % (sid, s, e, zoom_max(s, e),
                                                     en['path'] if en else 'PLACEHOLDER'))
        en = man.get(_SCENES[-1][0] + '#empty')
        print('%-16s %s' % ('landing empty', en['path'] if en else 'missing (synthetic ground for the reveal)'))
        print('reveal boundaries', reveal_bounds(a.scale))
    for i, f in enumerate(a.frame or []):
        out = a.out or 'b_%04d.png' % f
        if len(a.frame) > 1:
            root, ext = os.path.splitext(out)
            out = '%s_%04d%s' % (root, f, ext)
        cv2.imwrite(out, cv2.cvtColor(compose_frame_b(f, a.scale), cv2.COLOR_RGB2BGR))
        print('wrote', out)
    if a.sheet:
        write_sheet(a.sheet, a.step, a.tw, a.cols, a.scale)
        print('wrote', a.sheet)


if __name__ == '__main__':
    main()
