#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Stereoscopic 3D synthesis for the 《药食同源》 films (numpy + cv2 only).

Both films are built from layers whose depth is known exactly, so a clean left / right pair is
synthesised from ONE render per shot (depth-image-based rendering, DIBR):

    Version A frame = sky plate (infinity) + 3D foreground still (RGBA + camera depth) + text
    Version B frame = one opaque top-down still with a full-frame depth map            + text

Public API (all images float32 sRGB 0..1; uint8 / uint16 inputs are normalised)
-------------------------------------------------------------------------------
    disparity_from_depth(depth, alpha=None, conv=None, max_px=None, mode='A'|'B', ...)
        -> signed disparity map in pixels, float32 (H, W)   [+ info dict with return_info=True]
           disparity = x_right - x_left.  0 = screen plane, > 0 behind the screen, < 0 in front.
    synth_view(img, disparity, eye=-1|+1, ...)
        -> the layer re-projected for the left (-1) / right (+1) eye: every pixel moves by
           eye * disparity / 2 (symmetric pair).  Occlusion-correct, hole-free.
    synth_pair(img, disparity, ...)            -> (left, right)

    stereo_pair_A(sky_rgb, fg_rgba, fg_depth, text_rgba=None, ...)  -> (left_rgb, right_rgb)
    stereo_pair_B(rgb, depth, text_rgba=None, ...)                  -> (left_rgb, right_rgb)
      ... which are just   compose_A(sky, prepare_A(fg_rgba, fg_depth), text)
                           compose_B(prepare_B(rgb, depth), text)
      prepare_* = the expensive, per-SHOT part (disparity + the two warped views; the still does
      not change during a shot), compose_* = the cheap per-FRAME part (sky, text, window).
      zoom_prep(prep, zoom) applies the film's 2D push-in to a prepared pair.

    pack_sbs(left, right, mode='half'|'full')  -> side-by-side frame (left eye on the left)
    pack_anaglyph(left, right, method='dubois'|'gray')              -> red-cyan anaglyph
    floating_window(left, right, disparity, alpha=None)  -> the pair with the lateral frame edges
           masked where content in front of the screen is cut by the frame
    safe_text_disparity(text_alpha, disparity, ...)      -> parallax that keeps a text in front of
           whatever it covers
    shift_x(img, dx)                           -> layer shifted horizontally (uniform parallax)
    disparity_preview(disparity, ...)          -> colour-coded QC picture

Typical use
-----------
    import stereo
    prep = stereo.prepare_A(fg_rgba, fg_depth)                 # once per shot (~2 s at 4K)
    for f in frames:                                            # ~0.5 s per frame at 4K
        p = stereo.zoom_prep(prep, zoom[f])                     # optional push-in
        L, R = stereo.compose_A(sky[f], p, text_layer[f])
        frame = stereo.pack_sbs(L, R, 'half')                   # 3840x2160 half-SBS

Sign / geometry conventions
---------------------------
    x_left  = x - d/2          x_right = x + d/2          d = k * (1/z_conv - 1/z)
    This is exactly what a parallel-axis stereo camera with sensor shift records (base
    b = k / focal_px, screen plane at z_conv): disparity linear in 1/z, no vertical parallax, no
    keystone.  Far things have d > 0 and appear behind the screen, near things d < 0 and float in
    front of it.  (Checked against true Cycles left / right renders, see the report.)

How a view is synthesised (synth_view)
--------------------------------------
Rows are independent (pure horizontal parallax).  For the right eye the centre of source pixel j
lands at g_j = j + d_j/2.  Neighbouring pixels form a connected surface segment unless the step
between them is a depth discontinuity (`_jumps`: larger than `cut` px AND not part of a slope);
at a discontinuity the two pixels are separate surfaces, each owning its own +-0.5 px.
Every target pixel is covered by zero, one or several such pieces:
    several -> the nearest wins.  For a horizontal-parallax warp "nearest" is exactly "rightmost
               in the source" for the right eye (McMillan's occlusion-compatible order), so the
               z-buffer is one scatter-max of the source index;
    one     -> the exact inverse map u = j + (n - g_j) / (g_{j+1} - g_j) (sub-pixel accurate);
    zero    -> a disocclusion.  It is filled from the FARTHER of its two neighbours only (the near
               object is never smeared): the far surface is mirrored about the hole edge (keeps
               the texture grain, no streaks) and its low frequencies are replaced by those at
               the hole edge (so a contact-shadow gradient is extended, not reflected into a
               bright halo).
The image itself is then sampled ONCE at the fractional source coordinates with a Lanczos-4 (or
bicubic) kernel by cv2.remap: no splat cracks, no stair-steps, no double resampling.  The left
eye is the same algorithm on the mirrored row.  RGBA layers are warped premultiplied.

Depth conditioning (disparity_from_depth)
-----------------------------------------
Cycles' Z pass is one un-filtered sample per pixel: hard, aliased edges that are dithered inside
the depth-of-field blur and sprinkled with single-pixel misses.  Before use the disparity is
    1. extended into pixels without depth (nearest valid neighbour) - the anti-aliased / defocused
       alpha fringe of a foreground layer travels with its own object;
    2. averaged where it is dithered (= out of focus): the mean of the dither is a soft ramp just
       as wide as the blur of the colour image, so a defocused edge is stretched / compressed
       instead of being cut inside its own blur (no ghost contours); stray pixels are removed
       elsewhere (conditional median: thin stems survive);
    3. edge-preservingly smoothed (self-guided filter): steps smaller than `soft_step` px become
       gentle ramps (a sub-pixel "rubber sheet", invisible), bigger steps stay perfectly hard;
    4. foreground-dilated by `dilate` px at the remaining hard steps, so the mixed (anti-aliased)
       edge pixels and a thin ring of background ride with the near object: every seam created
       by the warp is then background-against-background, i.e. invisible, and no ghost contour
       is left behind on the far side.

CLI
---
    stereo.py demo  --out-dir DIR      goji validation set (anaglyph, half-SBS, 100 % edge crops)
    stereo.py bench                    timings at 4K
    stereo.py selftest                 brute-force check of the warp engine + synthetic B scene
    stereo.py pair-a --fg F.png --depth F_depth.npy [--sky S.png] [--text T.png] --out O.jpg
    stereo.py pair-b --rgb F.png --depth F_depth.npy [--text T.png] --out O.jpg
                     [--format half|full|anaglyph|pair]
"""
import os
import sys
import time
import argparse
import threading

import numpy as np
import cv2

__all__ = ['disparity_from_depth', 'synth_view', 'synth_pair', 'stereo_pair_A', 'stereo_pair_B',
           'prepare_A', 'compose_A', 'prepare_B', 'compose_B', 'zoom_prep', 'pack_sbs',
           'pack_anaglyph', 'floating_window', 'safe_text_disparity', 'shift_x', 'srgb_to_linear',
           'linear_to_srgb', 'to_float', 'disparity_preview', 'DEFAULTS']

# ----------------------------------------------------------------------------------------------
# Defaults.  Every length is a FRACTION OF THE FRAME WIDTH so that 1920-px drafts and 3840-px
# finals get the same picture.  (At 3840 px: 1 % = 38.4 px.)
# ----------------------------------------------------------------------------------------------
DEFAULTS = dict(
    # --- mode A (foreground still over a sky at infinity) ---------------------------------
    A_max=0.020,        # total parallax budget sky <-> nearest foreground (2.0 % of the width)
    A_sky=0.011,        # sky parallax, behind the screen (+1.1 %; never more than `sky_max`)
    A_fg_share=0.55,    # share of the budget spent INSIDE the foreground (near..far percentile)
    # --- mode B (opaque top-down still, depth everywhere) ---------------------------------
    B_max=0.012,        # total parallax budget ground <-> tallest item (1.2 %)
    B_far=0.003,        # ground parallax (+0.3 %: the plate sits just behind the screen)
    B_text=-0.002,      # text parallax: slightly in front of the screen (and see text_safe)
    # --- comfort limits -------------------------------------------------------------------
    sky_max=0.012,      # hard limit for positive parallax (1.2 %)
    near_max=0.015,     # hard limit for negative parallax (1.5 %)
    # --- robust range ---------------------------------------------------------------------
    pct=(0.2, 99.8),    # near / far depth percentiles that define the range
    knee=0.15,          # soft-clip of the outliers beyond the percentiles (fraction of the range)
    # --- conditioning ---------------------------------------------------------------------
    defocus_win=1 / 427.0,   # window (9 px at 4K) in which Z-pass dither is detected
    defocus_sigma=1 / 1100.0,   # gaussian sigma (3.5 px at 4K) of the mean taken in dithered zones
    despeckle=2,        # stray-pixel removal passes
    soft_step=0.0008,   # steps below ~3 px (4K) become ramps
    soft_radius=1 / 640.0,   # radius of that smoothing (6 px at 4K)
    dilate=1 / 1920.0,  # foreground dilation at hard steps (2 px at 4K)
    # --- warp -----------------------------------------------------------------------------
    cut=1.0,            # px of disparity between neighbours above which they are separate surfaces
    base_radius=1 / 960.0,   # half window of the low-pass used by the hole fill (4 px at 4K)
)

_YMAP_CACHE = {}


# ==============================================================================================
# small helpers
# ==============================================================================================
def to_float(img):
    """uint8 / uint16 / float image -> float32 in 0..1 (floats are passed through)."""
    if img is None:
        return None
    a = np.asarray(img)
    if a.dtype == np.uint8:
        return a.astype(np.float32) * np.float32(1.0 / 255.0)
    if a.dtype == np.uint16:
        return a.astype(np.float32) * np.float32(1.0 / 65535.0)
    return np.ascontiguousarray(a, dtype=np.float32)


def srgb_to_linear(x):
    x = np.asarray(x, np.float32)
    x = np.maximum(x, 0.0)
    return np.where(x <= 0.04045, x * np.float32(1 / 12.92),
                    np.power((x + np.float32(0.055)) * np.float32(1 / 1.055), np.float32(2.4)))


def linear_to_srgb(x):
    x = np.asarray(x, np.float32)
    x = np.maximum(x, 0.0)
    return np.where(x <= 0.0031308, x * np.float32(12.92),
                    np.float32(1.055) * np.power(x, np.float32(1 / 2.4)) - np.float32(0.055))


def _ymap(H, W):
    key = (H, W)
    m = _YMAP_CACHE.get(key)
    if m is None:
        if len(_YMAP_CACHE) > 4:
            _YMAP_CACHE.clear()
        m = np.ascontiguousarray(np.broadcast_to(np.arange(H, dtype=np.float32)[:, None], (H, W)))
        _YMAP_CACHE[key] = m
    return m


def _px(value, frac, W, lo=None):
    """A length given in px (value) or defaulted to frac * W."""
    v = frac * W if value is None else float(value)
    if lo is not None:
        v = max(lo, v)
    return v


def _box(a, r):
    k = 2 * int(r) + 1
    return cv2.blur(a, (k, k), borderType=cv2.BORDER_REFLECT)


def _parallel(fn, argsets, threads=2):
    """Run fn(*args) for each arg tuple, in threads (numpy / cv2 release the GIL)."""
    if threads <= 1 or len(argsets) <= 1:
        return [fn(*a) for a in argsets]
    out = [None] * len(argsets)
    err = []

    def run(i, a):
        try:
            out[i] = fn(*a)
        except BaseException as e:          # noqa
            err.append(e)

    ts = [threading.Thread(target=run, args=(i, a)) for i, a in enumerate(argsets)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    if err:
        raise err[0]
    return out


# ==============================================================================================
# depth -> disparity
# ==============================================================================================
def _fill_invalid(d, valid):
    """Give every invalid pixel the value of the nearest valid pixel (euclidean)."""
    if valid.all():
        return d
    if not valid.any():
        return np.zeros_like(d)
    src = np.where(valid, 0, 255).astype(np.uint8)            # zeros = seeds
    _, lab = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(int(lab.max()) + 1, np.float32)
    lut[lab[valid]] = d[valid]
    return lut[lab]


def _isolated(d, tau):
    """Pixels that stick out from at least 3 of their 4 neighbours by more than tau, all in the
    same direction (single pixels and one-pixel spurs) - the signature of a single-sample Z pass
    dithered by depth of field.  Clean edges, corners and thin lines do not qualify."""
    H, W = d.shape
    c = d[1:-1, 1:-1]
    diffs = (c - d[1:-1, :-2], c - d[1:-1, 2:], c - d[:-2, 1:-1], c - d[2:, 1:-1])
    pos = np.zeros(c.shape, np.int8)
    neg = np.zeros(c.shape, np.int8)
    for x in diffs:
        pos += x > tau
        neg += x < -tau
    iso = np.zeros((H, W), bool)
    iso[1:-1, 1:-1] = (pos >= 3) | (neg >= 3)
    return iso


def _despeckle(d, tau, passes=1):
    """Remove stray pixels: a pixel that differs from the 5x5 median by more than tau AND has at
    most one 8-neighbour like itself is replaced by the median.  Thin lines (>= 2 like
    neighbours) survive, unlike with a plain median."""
    H, W = d.shape
    for _ in range(max(0, passes)):
        med = cv2.medianBlur(d, 5)
        ys, xs = np.nonzero(np.abs(d - med)[1:-1, 1:-1] > tau)
        if ys.size == 0:
            break
        ys += 1
        xs += 1
        c = d[ys, xs]
        sup = np.zeros(ys.size, np.int32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    sup += np.abs(d[ys + dy, xs + dx] - c) <= tau
        k = sup <= 1
        if not k.any():
            break
        d = d.copy()
        d[ys[k], xs[k]] = med[ys[k], xs[k]]
    return d


def _defocus_soften(d, tau, win, sigma):
    """Where the Z pass is DITHERED (out-of-focus edges: each pixel saw the scene through one
    random point of the aperture) the right disparity is the local mean of the dither - a soft
    ramp exactly as wide as the blur of the colour image, so the blurred edge is stretched /
    compressed between the eyes instead of being cut inside its own blur (which would leave a
    ghost contour).  Clean (in-focus) edges are not touched.  Returns (d, weight map)."""
    iso = _isolated(d, tau)
    if win < 3 or np.count_nonzero(iso) < 16:
        return d, None
    win |= 1
    rho = cv2.blur(iso.astype(np.float32), (win, win))        # density of isolated pixels
    w = np.clip((rho - 1.5 / (win * win)) / (2.5 / (win * win)), 0.0, 1.0)   # 1 speck: 0, >= 4: 1
    if not w.any():
        return d, None
    k = 2 * (win // 2 + win // 4) + 1
    w = cv2.dilate(w, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    w = cv2.GaussianBlur(w, (0, 0), sigma)
    mean = cv2.GaussianBlur(d, (0, 0), sigma, borderType=cv2.BORDER_REPLICATE)
    return d + w * (mean - d), w


def _soften_small_steps(d, radius, step):
    """Self-guided (edge-preserving) smoothing: steps << `step` px are blurred into ramps of
    ~2*radius px, steps >> `step` stay hard."""
    if radius < 1 or step <= 0:
        return d
    off = np.float32(np.median(d[::16, ::16]))
    x = d - off                                              # keep the squares small (float32)
    m = _box(x, radius)
    v = _box(x * x, radius) - m * m
    np.maximum(v, 0, out=v)
    eps = np.float32((0.5 * step) ** 2)
    a = v / (v + eps)
    b = (1.0 - a) * m
    return _box(a, radius) * x + _box(b, radius) + off


def _jumps(d, thr, axis=1, big=4.0, rho=2.0):
    """Depth DISCONTINUITIES between neighbours along `axis`: bool array shaped like d, True at
    index j when the step d[j+1] - d[j] is a jump (the last index is always True = frame edge).

    A steep but continuous surface - the flank of a heap, a bowl wall, the limb of a berry - must
    stay ONE surface however steep it is (it is stretched / compressed between the eyes), while
    a real edge must be cut.  With s = |step|:
        s <= thr                 connected (ordinary surface);
        thr < s <= big * thr     connected if a neighbouring step of the same sign is at least
                                 s / rho (the step belongs to a slope or to the accelerating
                                 gradient of a limb), a jump if it stands alone;
        any s                    connected if both neighbouring steps are within thr of it (a
                                 steady slope of any steepness);
        otherwise                a jump."""
    if axis == 0:
        return np.ascontiguousarray(_jumps(np.ascontiguousarray(d.T), thr, 1, big, rho).T)
    H, W = d.shape
    f32 = np.float32
    dD = np.zeros((H, W + 1), f32)                            # dD[:, j+1] = step j ; padded with 0
    np.subtract(d[:, 1:], d[:, :-1], out=dD[:, 1:W])
    c = dD[:, 1:W]                                            # steps 0 .. W-2
    l = dD[:, 0:W - 1]                                        # previous step (0 at the border)
    r = dD[:, 2:W + 1]                                        # next step (0 at the border)
    a = np.abs(c)
    jump = a > f32(thr)
    if jump.any():
        sg = np.sign(c)
        nb = np.maximum(np.maximum(l * sg, r * sg), 0)        # largest same-signed neighbour step
        lenient = (a <= f32(big * thr)) & (nb * f32(rho) >= a)
        steady = (np.abs(c - l) <= f32(thr)) & (np.abs(c - r) <= f32(thr))
        jump &= ~(lenient | steady)
    out = np.ones((H, W), bool)
    out[:, :W - 1] = jump
    return out


def _dilate_near(d, radius, thr):
    """Grow the NEAR side (smaller disparity) of every depth discontinuity by `radius` px, so the
    mixed (anti-aliased) edge pixels and a thin ring of background ride with the near object.
    Slopes are left alone."""
    if radius < 1:
        return d
    jx = _jumps(d, thr, 1)
    jx[:, -1] = False
    jy = _jumps(d, thr, 0)
    jy[-1, :] = False
    m = jx | jy
    m[:, 1:] |= jx[:, :-1]
    m[1:, :] |= jy[:-1, :]
    if not m.any():
        return d
    k = 2 * int(radius) + 1
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    zone = cv2.dilate(m.astype(np.uint8), ker) > 0
    lo = cv2.erode(d, ker, borderType=cv2.BORDER_REPLICATE)
    return np.where(zone, lo, d)


def disparity_from_depth(depth, alpha=None, conv=None, max_px=None, mode='A', *,
                         k=None, sky_px=None, far_px=None, near_px=None, fg_share=None,
                         pct=None, knee=None, defocus=True, despeckle=None, soft_step=None,
                         soft_radius=None, dilate=None, cut=None, sky_max=None, near_max=None,
                         return_info=False):
    """Camera-space depth (metres, 0 / nan / inf = no geometry) -> signed disparity in pixels.

    disparity = x_right - x_left = k * (1/z_conv - 1/z): 0 on the screen plane, > 0 behind it,
    < 0 in front.  Linear in 1/z (what a real parallel stereo rig records), scaled so that robust
    near / far percentiles of the scene fill a comfortable parallax budget.

    mode 'A'  a foreground layer in front of a sky at infinity (use `alpha` = the layer's alpha).
              budget `max_px` (default 2.0 % of the width) = sky parallax - nearest parallax;
              sky at `sky_px` (default +1.1 %), nearest percentile at sky_px - max_px (-0.9 %).
              `fg_share` (default 0.55) of the budget is spent between the nearest and the
              farthest foreground percentile, the rest is the step from the farthest foreground
              to the sky.  A single rig would give the foreground only 1 - z_near/z_far of the
              budget (32 % for a heap spanning 0.31..0.46 m) and waste the rest on the empty gap
              to infinity; like a "multi-rig" stereo film the sky is pulled in instead.  The share
              is never lowered below the single-rig value; fg_share=0 gives the single rig.
              The returned map is the disparity OF THE FOREGROUND LAYER, defined everywhere (it
              is extended outwards from the silhouette so the soft alpha fringe moves with its
              object); the sky's own disparity is info['sky_px'].
    mode 'B'  an opaque still whose depth covers the frame (top-down plate).  budget `max_px`
              (default 1.2 %): ground (far percentile) at `far_px` (default +0.3 %, just behind
              the screen), tallest items at far_px - max_px (-0.9 %, in front).

    conv      depth (m) of the screen plane.  None = derived from the numbers above.  If given,
              the scale k is kept and the parallaxes follow (clamped to sky_max / near_max).
    k         px * m.  Give k AND conv to FREEZE the mapping d = k * (1/conv - 1/z) (both are
              in the info of an earlier call): nothing is then derived from this image's own
              depth range, which is what an animated sequence needs (no "breathing").  k scales
              with the picture width and with any 2D zoom applied to the picture.
    max_px, sky_px, far_px, near_px   parallaxes in pixels of THIS image (defaults scale with
              the width; near_px is negative for "in front").
    pct, knee robust range: depth percentiles (0.2, 99.8) and the soft-clip of what lies beyond.
    defocus, despeckle, soft_step, soft_radius, dilate, cut    conditioning, see the module
              docstring (defocus=False skips the dither -> soft ramp step).

    Returns float32 (H, W); with return_info=True also a dict:
        sky_px, near_px, far_px (farthest foreground / ground), k (px*m), conv (m), z_near,
        z_far, min_px, max_px (actual range on valid pixels), fg_share, width, mode, valid
        (bool mask), defocus_frac (share of the geometry whose Z pass was found dithered).
    """
    Dd = DEFAULTS
    z = np.asarray(depth, np.float32)
    H, W = z.shape
    mode = str(mode).upper()
    assert mode in ('A', 'B'), mode
    pct = Dd['pct'] if pct is None else pct
    knee = Dd['knee'] if knee is None else knee
    despeckle = Dd['despeckle'] if despeckle is None else int(despeckle)
    cut = Dd['cut'] if cut is None else float(cut)
    soft_step = _px(soft_step, Dd['soft_step'], W)
    soft_radius = int(round(_px(soft_radius, Dd['soft_radius'], W)))
    dil = int(np.ceil(_px(dilate, Dd['dilate'], W) - 1e-6))
    dwin = int(round(Dd['defocus_win'] * W))
    dsig = max(1.0, Dd['defocus_sigma'] * W)
    sky_max = _px(sky_max, Dd['sky_max'], W)
    near_max = _px(near_max, Dd['near_max'], W)

    valid = np.isfinite(z) & (z > 1e-6) & (z < 1e8)
    if not valid.any():
        d = np.zeros((H, W), np.float32)
        info = dict(sky_px=0.0, near_px=0.0, far_px=0.0, k=0.0, conv=float('inf'), z_near=0.0, z_far=0.0,
                    min_px=0.0, max_px=0.0, width=W, mode=mode, valid=valid)
        return (d, info) if return_info else d
    stat = valid
    if alpha is not None:
        a = to_float(alpha)
        solid = valid & (a > 0.5)
        if solid.any():
            stat = solid
    inv = np.zeros((H, W), np.float32)
    np.divide(1.0, z, out=inv, where=valid)
    sample = inv[::3, ::3][stat[::3, ::3]]
    if sample.size < 100:
        sample = inv[stat]
    # near = large 1/z
    inv_far, inv_near = np.percentile(sample, [100.0 - pct[1], 100.0 - pct[0]]).astype(np.float64)
    span = max(inv_near - inv_far, 1e-9)

    if mode == 'A':
        budget = _px(max_px, Dd['A_max'], W)
        if sky_px is not None and near_px is not None:
            budget = float(sky_px) - float(near_px)
        share_phys = span / max(inv_near, 1e-9)                # what one rig would give
        share = Dd['A_fg_share'] if fg_share is None else float(fg_share)
        share = float(np.clip(max(share, share_phys), 0.02, 0.92))
        frozen = k is not None and conv is not None
        if frozen:                                              # mapping given explicitly
            k = float(k)
            near = k * (1.0 / float(conv) - inv_near)
            sky = _px(sky_px, Dd['A_sky'], W)
            sky = max(sky, near + k * span * 1.05)
        else:
            k = share * budget / span                           # px * m
        if frozen:
            pass
        elif conv is not None:                                  # screen plane given
            near = k * (1.0 / float(conv) - inv_near)
            sky = near + budget
        elif near_px is not None and sky_px is None:
            near = float(near_px)
            sky = near + budget
        else:
            sky = _px(sky_px, Dd['A_sky'], W)
            near = sky - budget
        # comfort clamps (scale the whole mapping about the screen plane)
        s = 1.0
        if sky > sky_max:
            s = min(s, sky_max / sky)
        if -near > near_max:
            s = min(s, near_max / -near)
        if s < 1.0 and not frozen:
            k, near, sky = k * s, near * s, sky * s
        far = near + k * span                                   # farthest foreground percentile
        far = min(far, sky - 0.02 * (sky - near))
    else:
        budget = _px(max_px, Dd['B_max'], W)
        if far_px is not None and near_px is not None:
            budget = float(far_px) - float(near_px)
        frozen = k is not None and conv is not None
        k = float(k) if frozen else budget / span
        if frozen:
            budget = k * span
        if conv is not None:                                    # screen plane given
            far = k * (1.0 / float(conv) - inv_far)
        elif near_px is not None and far_px is None:
            far = float(near_px) + budget
        else:
            far = _px(far_px, Dd['B_far'], W)
        near = far - budget
        s = 1.0
        if far > sky_max:
            s = min(s, sky_max / far)
        if -near > near_max:
            s = min(s, near_max / -near)
        if s < 1.0 and not frozen:
            k, near, far = k * s, near * s, far * s
        sky = far

    d = (np.float32(near) + np.float32(k) * (np.float32(inv_near) - inv)).astype(np.float32)
    # soft-clip the outliers beyond the percentile range
    kn = max(float(knee) * (far - near), 1e-6)
    kn_far = min(kn, 0.5 * max(sky - far, 0.0)) if mode == 'A' else kn
    lo_m = (d < near) & (not frozen)                           # a frozen mapping is used as is
    if lo_m.any():
        d[lo_m] = near - kn * np.tanh((near - d[lo_m]) / kn)
    hi_m = (d > far) & (not frozen)
    if hi_m.any():
        d[hi_m] = far + kn_far * np.tanh((d[hi_m] - far) / max(kn_far, 1e-6)) if kn_far > 0 else far

    d = _fill_invalid(d, valid)
    d, wdef = _defocus_soften(d, 0.5 * cut, dwin, dsig) if defocus else (d, None)
    d = _despeckle(d, 0.5 * cut, despeckle)
    d = _soften_small_steps(d, soft_radius, soft_step)
    d = _dilate_near(d, dil, cut)
    d = np.ascontiguousarray(d, np.float32)

    if not return_info:
        return d
    dv = d[stat]
    conv_inv = inv_near + near / k
    dfrac = float(np.count_nonzero((wdef > 0.5) & stat)) / max(1, int(np.count_nonzero(stat))) \
        if wdef is not None else 0.0
    info = dict(sky_px=float(sky), near_px=float(near), far_px=float(far), k=float(k),
                conv=float(1.0 / conv_inv) if conv_inv > 1e-9 else float('inf'),
                z_near=float(1.0 / inv_near), z_far=float(1.0 / inv_far),
                min_px=float(dv.min()), max_px=float(dv.max()), width=W, mode=mode, valid=valid,
                fg_share=float((far - near) / max(sky - near, 1e-9)) if mode == 'A' else 1.0,
                defocus_frac=dfrac)
    return d, info


# ==============================================================================================
# the warp engine
# ==============================================================================================
def _warp_map_right(D, cut):
    """Inverse map of the RIGHT-eye view (x' = x + D/2) of a disparity map D (H, W) float32.

    Returns u (H, W) float32 = source x for every target pixel (holes already carry their
    mirror-fill coordinate) and `holes` = None or a dict of per-hole-pixel arrays:
        idx (flat target index), row0 (flat index of the row start), c0 / cm (source columns of
        the hole edge and of the mirrored sample), lo / hi (source run the fill may read from),
        t (distance to the hole edge in px).
    """
    H, W = D.shape
    f32 = np.float32
    sD = D * f32(0.5)
    dD = np.empty_like(sD)
    np.subtract(sD[:, 1:], sD[:, :-1], out=dD[:, :-1])
    dD[:, -1] = np.inf                                        # frame edge = cut
    conn = ~_jumps(sD, 0.5 * cut)                             # segment (j, j+1) is one surface
    jj = np.arange(W, dtype=np.int32)[None, :]
    g = sD + jj.astype(f32)
    A = np.ceil(g)
    f = (A - g).astype(f32)                                   # 0 <= f < 1
    A = A.astype(np.int32)
    rlen = np.where(conn, f32(1.0) + dD, f32(0.5)).astype(f32)   # length of the piece right of j
    rows = (np.arange(H, dtype=np.int64) * W)[:, None]
    N = H * W
    best = np.full(N + 1, -1, np.int32)                       # slot N = dump
    jfull = np.ascontiguousarray(np.broadcast_to(jj, (H, W))).ravel()
    # first integer at / after g_j
    ok = (f < rlen) & (A >= 0) & (A < W)
    tgt = np.where(ok, rows + A, N).ravel()
    np.maximum.at(best, tgt, jfull)
    # further integers (stretched connected segments only)
    sel = np.flatnonzero((f + f32(1.0) < rlen).ravel())
    if sel.size:
        fs_, rl_, js_ = f.ravel()[sel], rlen.ravel()[sel], jfull[sel]
        As_ = A.ravel()[sel].astype(np.int64)
        base_ = (sel // W) * W
        k = 1
        while sel.size and k < 4096:
            n_ = As_ + k
            okk = (n_ >= 0) & (n_ < W)
            np.maximum.at(best, (base_ + n_)[okk], js_[okk])
            k += 1
            keep = fs_ + f32(k) < rl_
            if not keep.all():
                fs_, rl_, js_, As_, base_, sel = fs_[keep], rl_[keep], js_[keep], As_[keep], base_[keep], sel[keep]
    # the half pixel to the LEFT of a run start
    start = np.empty((H, W), bool)
    start[:, 0] = True
    start[:, 1:] = ~conn[:, :-1]
    ok = start & (f >= f32(0.5)) & (A - 1 >= 0) & (A - 1 < W)
    sel = np.flatnonzero(ok.ravel())
    if sel.size:
        np.maximum.at(best, (rows + A - 1).ravel()[sel], jfull[sel])
    del tgt, ok, sel, start, A, f, g, rlen

    best = best[:N]
    hole = best < 0
    j = np.maximum(best, 0)
    src_flat = (rows + j.reshape(H, W)).ravel()
    p = (jfull - j).astype(f32) - sD.ravel()[src_flat]        # n - g_j, in [-0.5, rlen)
    with np.errstate(divide='ignore', invalid='ignore'):
        inv = np.where(conn & (dD > f32(-0.999)), f32(1.0) / (f32(1.0) + dD), f32(1.0)).astype(f32)
    u = j.astype(f32) + np.where(p > 0, p * inv.ravel()[src_flat], p)
    del p, inv, src_flat

    holes = None
    hidx = np.flatnonzero(hole)
    if hidx.size:
        Dflat = D.ravel()
        brk = np.ones(hidx.size, bool)
        brk[1:] = (np.diff(hidx) != 1) | (hidx[1:] % W == 0)
        rs = np.flatnonzero(brk)
        re = np.r_[rs[1:], hidx.size] - 1
        fs, fe = hidx[rs], hidx[re]                           # first / last hole pixel of each run
        row0 = (fs // W) * W
        hasL = (fs - row0) > 0
        hasR = (fe - row0) < (W - 1)
        nl = np.where(hasL, fs - 1, fs)
        nr = np.where(hasR, fe + 1, fe)
        jl = np.maximum(best[nl], 0)
        jr = np.maximum(best[nr], 0)
        Dl = np.where(hasL, Dflat[row0 + jl], -np.inf)
        Dr = np.where(hasR, Dflat[row0 + jr], -np.inf)
        useR = Dr >= Dl                                       # the FARTHER side feeds the hole
        nb = np.where(useR, nr, nl)                           # boundary target pixel
        jb = np.where(useR, jr, jl).astype(np.int64)          # its source pixel
        ub = u[nb]
        cflat = np.flatnonzero(~conn.ravel())                 # cut segments (each row end is one)
        # run of the far surface in the source: [lo, hi]
        pos = np.searchsorted(cflat, row0 + jb, side='left')
        hi_r = cflat[np.minimum(pos, cflat.size - 1)] - row0  # first cut at / after jb
        prev = np.where(pos > 0, cflat[np.maximum(pos - 1, 0)] + 1, 0)
        lo_l = np.maximum(prev, row0) - row0                  # run start at / before jb
        lo = np.where(useR, jb, lo_l)
        hi = np.where(useR, hi_r, jb)
        L = np.where(useR, hi - ub, ub - lo).astype(f32)      # usable length away from the hole
        L = np.maximum(L, 0)
        rid = np.cumsum(brk) - 1
        t = np.abs(hidx - nb[rid]).astype(f32)
        Lp = L[rid]
        per = np.maximum(2.0 * Lp, 1e-3)
        refl = np.where(Lp >= 0.5, Lp - np.abs(np.mod(t, per) - Lp), 0.0).astype(f32)
        sgn = np.where(useR, 1.0, -1.0).astype(f32)[rid]
        um = ub[rid] + sgn * refl
        u[hidx] = um
        holes = dict(idx=hidx, row0=row0[rid], c0=np.rint(ub[rid]).astype(np.int64),
                     cm=np.rint(um).astype(np.int64), lo=lo[rid].astype(np.int64),
                     hi=hi[rid].astype(np.int64), t=t)
    return u.reshape(H, W), holes


def _warp_map(D, eye, cut):
    """Inverse map for eye = +1 (right) or -1 (left) in un-mirrored coordinates."""
    H, W = D.shape
    if eye > 0:
        return _warp_map_right(D, cut)
    u, holes = _warp_map_right(np.ascontiguousarray(D[:, ::-1]), cut)
    u = np.float32(W - 1) - u[:, ::-1]
    if holes is not None:
        col = holes['idx'] - holes['row0']
        holes['idx'] = holes['row0'] + (W - 1 - col)
        holes['c0'] = (W - 1) - holes['c0']
        holes['cm'] = (W - 1) - holes['cm']
        holes['lo'], holes['hi'] = (W - 1) - holes['hi'], (W - 1) - holes['lo']
        o = np.argsort(holes['idx'], kind='stable')
        holes = {k: v[o] for k, v in holes.items()}
    return np.ascontiguousarray(u), holes


def _hole_base_correction(out, src, holes, radius, min_t=1.5):
    """Replace the low frequencies of the mirrored fill by those at the hole edge (in place)."""
    if holes is None or radius < 1:
        return
    sel = holes['t'] >= min_t
    if not sel.any():
        return
    H, W = src.shape[:2]
    C = 1 if src.ndim == 2 else src.shape[2]
    s2 = src.reshape(H * W, C)
    o2 = out.reshape(H * W, C)
    idx = holes['idx'][sel]
    row0 = holes['row0'][sel]
    lo = holes['lo'][sel]
    hi = np.maximum(holes['hi'][sel], lo)
    c0 = np.clip(holes['c0'][sel], lo, hi)
    cm = np.clip(holes['cm'][sel], lo, hi)
    acc = np.zeros((idx.size, C), np.float32)
    for o in range(-radius, radius + 1):
        acc += s2[row0 + np.clip(c0 + o, lo, hi)]
        acc -= s2[row0 + np.clip(cm + o, lo, hi)]
    acc *= np.float32(1.0 / (2 * radius + 1))
    o2[idx] += acc


_INTERP = {'lanczos': cv2.INTER_LANCZOS4, 'cubic': cv2.INTER_CUBIC, 'linear': cv2.INTER_LINEAR,
           'nearest': cv2.INTER_NEAREST}


def synth_view(img, disparity, eye, *, cut=None, interp='lanczos', premultiplied=False,
               base_radius=None, return_info=False):
    """Re-project a layer for one eye.

    img          (H, W), (H, W, 3) or (H, W, 4) image; uint8/uint16 are normalised to float32.
                 RGBA is treated as STRAIGHT alpha unless premultiplied=True; either way it is
                 warped premultiplied and returned in the convention it came in.
    disparity    (H, W) float32, px, from disparity_from_depth (x_right - x_left).
    eye          -1 = left (pixels move by -disparity/2), +1 = right (+disparity/2).
    cut          px of disparity between neighbouring pixels above which they are separate
                 surfaces (default 1.0), unless the step is part of a steady slope (_jumps).
    interp       'lanczos' (default, sharpest, ~4x slower), 'cubic', 'linear'.
    base_radius  half window (px) of the low-pass in the disocclusion fill; 0 = plain mirror.
    return_info  -> (view, {'hole_mask': bool (H, W) of filled target pixels, 'u': inverse map}).

    Occlusions: nearest surface wins.  Disocclusions: filled from the farther neighbour only.
    Frame edges: content that moves into the frame from outside is the mirror image of the
    edge (cv2 BORDER_REFLECT_101 semantics).
    """
    assert eye in (-1, 1), 'eye must be -1 (left) or +1 (right)'
    src = to_float(img)
    D = np.ascontiguousarray(disparity, np.float32)
    H, W = D.shape
    assert src.shape[:2] == (H, W), (src.shape, D.shape)
    cut = DEFAULTS['cut'] if cut is None else float(cut)
    assert cut > 0, 'cut must be positive'
    radius = int(round(_px(base_radius, DEFAULTS['base_radius'], W)))
    rgba = src.ndim == 3 and src.shape[2] == 4
    if rgba and not premultiplied:
        src = src.copy()
        src[..., :3] *= src[..., 3:4]
    u, holes = _warp_map(D, eye, cut)
    out = cv2.remap(src, u, _ymap(H, W), _INTERP[interp], borderMode=cv2.BORDER_REFLECT_101)
    _hole_base_correction(out, src, holes, radius)
    if rgba:
        np.clip(out[..., 3], 0.0, 1.0, out=out[..., 3])
        np.maximum(out[..., :3], 0.0, out=out[..., :3])
        if not premultiplied:
            a = out[..., 3:4]
            out[..., :3] = np.where(a > 1e-5, out[..., :3] / np.maximum(a, 1e-5), 0.0)
            np.clip(out[..., :3], 0.0, 1.0, out=out[..., :3])
    else:
        np.clip(out, 0.0, 1.0, out=out)
    if return_info:
        hm = np.zeros(H * W, bool)
        if holes is not None:
            hm[holes['idx']] = True
        return out, dict(hole_mask=hm.reshape(H, W), u=u)
    return out


def synth_pair(img, disparity, *, threads=2, **kw):
    """(left, right) = synth_view(img, disparity, -1), synth_view(img, disparity, +1).
    With return_info=True each element is a (view, info) tuple."""
    src = to_float(img)
    return tuple(_parallel(lambda e: synth_view(src, disparity, e, **kw), [(-1,), (1,)], threads))


def shift_x(img, dx, border=cv2.BORDER_REFLECT_101):
    """Shift a layer horizontally by dx px (positive = to the right).  Integer shifts are exact
    copies, fractional shifts are bicubic.  The uncovered edge is the mirror of the edge."""
    img = to_float(img)
    if abs(dx) < 1e-6:
        return img
    H, W = img.shape[:2]
    if abs(dx - round(dx)) < 1e-6 and border == cv2.BORDER_REFLECT_101 and abs(dx) < W - 1:
        k = int(round(dx))
        out = np.empty_like(img)
        if k > 0:
            out[:, k:] = img[:, :W - k]
            out[:, :k] = img[:, k:0:-1]
        else:
            k = -k
            out[:, :W - k] = img[:, k:]
            out[:, W - k:] = img[:, W - 2:W - 2 - k:-1]
        return out
    M = np.float32([[1, 0, dx], [0, 1, 0]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=border)


# ==============================================================================================
# text depth, floating window
# ==============================================================================================
def safe_text_disparity(text_alpha, disparity, base=0.0, margin=None, alpha=None, thr=0.02):
    """Disparity for a text layer so that it is never BEHIND what it covers:
    min(base, nearest scene disparity under the text - margin).  `disparity` is the scene
    disparity (for mode A pass alpha = foreground alpha so that only real geometry counts);
    margin defaults to 0.1 % of the width."""
    ta = to_float(text_alpha)
    if ta.ndim == 3:
        ta = ta[..., 3]
    H, W = ta.shape
    margin = 0.001 * W if margin is None else margin
    m = ta > thr
    if not m.any():
        return float(base)
    k = max(3, int(W / 160) | 1)
    m = cv2.dilate(m.astype(np.uint8), np.ones((k, k), np.uint8)) > 0
    if alpha is not None:
        m &= to_float(alpha) > 0.05
    if not m.any():
        return float(base)
    return float(min(base, float(np.min(disparity[m])) - margin))


def _snap_even(d):
    """Round a disparity to an even number of px (each eye then moves by whole pixels)."""
    return 2.0 * round(d / 2.0)


def floating_window(left, right, disparity, alpha=None, *, margin=1.15, band=None, smooth=None,
                    copy=True):
    """Mask the frame edges where something IN FRONT of the screen is cut by the left / right
    frame edge (a "window violation": the cut-off object claims to be nearer than the frame that
    occludes it).  The left edge of the LEFT eye and the right edge of the RIGHT eye are blacked
    out by the local negative parallax, which moves the perceived frame forward to the object.
    Per row, smoothed vertically; nothing happens where the edge content is behind the screen.

    disparity   scene disparity of the picture (for mode A: of the foreground layer + alpha)
    margin      mask width = margin * |parallax|
    band        columns inspected at each edge (default 1.5 % of the width)
    Returns (left, right, (wl, wr)) with wl / wr = per-row mask widths in px.
    """
    H, W = disparity.shape
    band = int(round(0.015 * W)) if band is None else int(band)
    smooth = H / 36.0 if smooth is None else smooth
    dl = disparity[:, :band]
    dr = disparity[:, W - band:]
    if alpha is not None:
        a = to_float(alpha)
        dl = np.where(a[:, :band] > 0.5, dl, 0.0)
        dr = np.where(a[:, W - band:] > 0.5, dr, 0.0)
    wl = np.maximum(-dl.min(axis=1), 0.0).astype(np.float32) * margin
    wr = np.maximum(-dr.min(axis=1), 0.0).astype(np.float32) * margin

    def sm(w):
        k = max(3, int(smooth) | 1)
        w = cv2.dilate(w.reshape(-1, 1), np.ones((k, 1), np.uint8))          # never too narrow
        w = cv2.GaussianBlur(w, (1, 0), sigmaX=1e-3, sigmaY=smooth, borderType=cv2.BORDER_REPLICATE)
        return w.reshape(-1)

    wl, wr = sm(wl), sm(wr)
    if copy:
        left, right = left.copy(), right.copy()
    nmax = int(np.ceil(max(wl.max(), wr.max()))) + 1
    if nmax > 1:
        x = np.arange(nmax, dtype=np.float32)[None, :]
        ml = np.clip(x + 1.0 - wl[:, None], 0.0, 1.0)         # coverage kept at column x
        left[:, :nmax] *= ml[..., None] if left.ndim == 3 else ml
        mr = np.clip(x + 1.0 - wr[:, None], 0.0, 1.0)[:, ::-1]
        right[:, W - nmax:] *= mr[..., None] if right.ndim == 3 else mr
    return left, right, (wl, wr)


# ==============================================================================================
# stereo pairs
# ==============================================================================================
def _over_tile(rgb, tile, x0, y0, linear):
    """'over' a straight-alpha sRGB RGBA tile onto rgb (H, W, 3) at integer (x0, y0), in place."""
    H, W = rgb.shape[:2]
    h, w = tile.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(w, W - x0), min(h, H - y0)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    t = tile[sy0:sy1, sx0:sx1]
    dst = rgb[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
    ta = t[..., 3:4]
    if linear:
        dst[...] = linear_to_srgb(srgb_to_linear(dst) * (1.0 - ta) + srgb_to_linear(t[..., :3]) * ta)
    else:
        dst[...] = dst * (1.0 - ta) + t[..., :3] * ta


def _text_blocks(text):
    """Split a full-frame straight-alpha text layer into blocks (one per line / group of glyphs):
    list of (tile RGBA, x0, y0).  Glyphs closer than ~3 % of the width horizontally and ~0.6 %
    vertically belong to one block, so a title and a caption get their own depth."""
    H, W = text.shape[:2]
    m = (text[..., 3] > 1.0 / 1024.0).astype(np.uint8)
    if not m.any():
        return []
    q = 8
    Hq, Wq = (H + q - 1) // q, (W + q - 1) // q
    mp = np.zeros((Hq * q, Wq * q), np.uint8)
    mp[:H, :W] = m
    small = mp.reshape(Hq, q, Wq, q).max(axis=(1, 3))
    kx, ky = int(0.03 * W / q) | 1, int(0.006 * W / q) | 1
    n, lab = cv2.connectedComponents(cv2.dilate(small, np.ones((ky, kx), np.uint8)))
    out = []
    for i in range(1, n):
        ys, xs = np.nonzero((lab == i) & (small > 0))
        if ys.size == 0:
            continue
        y0, y1 = int(ys.min()) * q, min(H, (int(ys.max()) + 1) * q)
        x0, x1 = int(xs.min()) * q, min(W, (int(xs.max()) + 1) * q)
        tile = text[y0:y1, x0:x1].copy()
        if n > 2:                                             # blank what belongs to other blocks
            own = np.repeat(np.repeat(lab[y0 // q:(y1 + q - 1) // q, x0 // q:(x1 + q - 1) // q] == i, q, 0), q, 1)
            tile[..., 3] *= own[:y1 - y0, :x1 - x0]
        out.append((tile, x0, y0))
    return out


def _text_items(text_rgba, H, W):
    """Normalise the `text_rgba` argument to a list of [tile, x0, y0, px-or-None].
    Accepted: None; a full-frame (H, W, 4) layer (split into blocks); or a list whose items are
    full-frame layers, (layer, px), (tile, x0, y0), (tile, x0, y0, px) or dicts with keys
    rgba, x, y, px.  px = that item's parallax in pixels (None = automatic)."""
    if text_rgba is None:
        return []
    items = []

    def add(rgba, x0=None, y0=None, px=None):
        rgba = to_float(rgba)
        assert rgba.ndim == 3 and rgba.shape[2] == 4, 'text layers must be RGBA'
        if x0 is None:
            if rgba.shape[:2] != (H, W):
                raise ValueError('a text layer without a position must be full-frame')
            for tile, tx, ty in _text_blocks(rgba):
                items.append([tile, tx, ty, px])
        else:
            items.append([rgba, int(x0), int(y0), px])

    if isinstance(text_rgba, np.ndarray):
        add(text_rgba)
        return items
    for it in text_rgba:
        if isinstance(it, dict):
            add(it['rgba'], it.get('x'), it.get('y'), it.get('px'))
        elif isinstance(it, np.ndarray):
            add(it)
        elif len(it) == 2:
            add(it[0], None, None, it[1])
        elif len(it) == 3:
            add(it[0], it[1], it[2])
        else:
            add(it[0], it[1], it[2], it[3])
    return items


def _draw_text(L, R, text_rgba, disparity, alpha, base_px, safe, snap, linear, margin=None):
    """Draw every text item on both eyes (in place).  An item's parallax is its own px if given,
    else base_px, moved in front of whatever scene content it covers when safe=True.
    Returns [(x0, y0, w, h, px), ...]."""
    H, W = L.shape[:2]
    margin = 0.001 * W if margin is None else margin
    done = []
    for tile, x0, y0, px in _text_items(text_rgba, H, W):
        h, w = tile.shape[:2]
        if px is None:
            px = float(base_px)
            if safe and disparity is not None:
                pad = max(2, int(W / 320))
                ya, yb, xa, xb = max(0, y0 - pad), min(H, y0 + h + pad), max(0, x0 - pad), min(W, x0 + w + pad)
                if yb > ya and xb > xa:
                    cov = np.zeros((yb - ya, xb - xa), np.uint8)
                    ty0, tx0 = max(0, ya - y0), max(0, xa - x0)
                    sub = tile[ty0:ty0 + (yb - ya), tx0:tx0 + (xb - xa), 3] > 1.0 / 1024.0
                    oy, ox = max(0, y0 - ya), max(0, x0 - xa)
                    cov[oy:oy + sub.shape[0], ox:ox + sub.shape[1]] = sub
                    k = 2 * pad + 1
                    cov = cv2.dilate(cov, np.ones((k, k), np.uint8)) > 0
                    if alpha is not None:
                        cov &= alpha[ya:yb, xa:xb] > 0.05
                    if cov.any():
                        px = min(px, float(disparity[ya:yb, xa:xb][cov].min()) - margin)
        if snap:
            px = _snap_even(px)
            hs = int(round(0.5 * px))
            _over_tile(L, tile, x0 - hs, y0, linear)
            _over_tile(R, tile, x0 + hs, y0, linear)
        else:
            sh = 0.5 * px
            padx = int(np.ceil(abs(sh))) + 2
            big = cv2.copyMakeBorder(tile, 0, 0, padx, padx, cv2.BORDER_CONSTANT, value=0)
            _over_tile(L, shift_x(big, -sh, cv2.BORDER_CONSTANT), x0 - padx, y0, linear)
            _over_tile(R, shift_x(big, sh, cv2.BORDER_CONSTANT), x0 - padx, y0, linear)
        done.append((x0, y0, w, h, float(px)))
    return done


def _fg_over(bg, v, linear):
    """Premultiplied (gamma) RGBA view `v` over the sRGB plate `bg`, IN PLACE on bg.  Only the
    partly transparent pixels need the linear-light maths; opaque ones are copied."""
    a = v[..., 3]
    rows = np.flatnonzero(a.max(axis=1) > 0)
    if rows.size == 0:
        return bg
    y0, y1 = rows[0], rows[-1] + 1
    a = a[y0:y1]
    dst = bg[y0:y1]
    src = v[y0:y1, :, :3]
    opaque = a >= 0.9995
    np.copyto(dst, src, where=opaque[..., None])
    ys, xs = np.nonzero((a > 0.0005) & ~opaque)
    if ys.size:
        af = a[ys, xs][:, None]
        c = src[ys, xs]
        b = dst[ys, xs]
        if linear:
            c = np.clip(c / af, 0.0, 1.0)
            dst[ys, xs] = linear_to_srgb(srgb_to_linear(c) * af + srgb_to_linear(b) * (1.0 - af))
        else:
            dst[ys, xs] = c + b * (1.0 - af)
    return bg


def prepare_A(fg_rgba, fg_depth, *, disparity=None, info=None, conv=None, max_px=None, sky_px=None,
              near_px=None, fg_share=None, interp='lanczos', cut=None, threads=2, **disp_kw):
    """The per-SHOT part of a version A pair: disparity + the two re-projected foreground views.
    The still does not change during a shot, so call this once per shot and compose_A per frame.

    Returns a dict:
        left, right   (H, W, 4) float32 foreground views, PREMULTIPLIED alpha, gamma (sRGB) values
        disparity     (H, W) foreground disparity, px          alpha   the centre view's alpha
        sky_px        sky parallax, snapped to an even number of px
        near_px, far_px, min_px, max_px, k, conv, z_near, z_far ...   (see disparity_from_depth)
        hole_frac_left / hole_frac_right   disoccluded + filled pixels / frame pixels
    If you animate the views afterwards (push-in), apply the SAME 2D transform to both eyes: a
    zoom by s about the frame centre scales every parallax by s (keep s * max parallax in budget).
    """
    fg = to_float(fg_rgba)
    H, W = fg.shape[:2]
    assert fg.ndim == 3 and fg.shape[2] == 4, 'fg_rgba must be RGBA'
    alpha = fg[..., 3]
    if disparity is None or info is None:
        disparity, info = disparity_from_depth(fg_depth, alpha, conv, max_px, 'A', sky_px=sky_px,
                                               near_px=near_px, fg_share=fg_share, cut=cut,
                                               return_info=True, **disp_kw)
    rows = np.flatnonzero(alpha.max(axis=1) > 0)
    out = dict(info)
    views = [np.zeros((H, W, 4), np.float32), np.zeros((H, W, 4), np.float32)]
    hf = [0.0, 0.0]
    if rows.size:
        y0, y1 = int(rows[0]), int(rows[-1]) + 1              # rows are independent: skip the empty ones
        pm = fg[y0:y1].copy()
        pm[..., :3] *= pm[..., 3:4]                           # premultiplied, gamma space
        Ds = np.ascontiguousarray(disparity[y0:y1])
        res = synth_pair(pm, Ds, threads=threads, cut=cut, interp=interp, premultiplied=True,
                         return_info=True)
        for i, (v, vi) in enumerate(res):
            views[i][y0:y1] = v
            hf[i] = float(np.count_nonzero(vi['hole_mask'] & (v[..., 3] > 0.02))) / float(H * W)
    out.update(left=views[0], right=views[1], disparity=disparity, alpha=alpha,
               sky_px=float(_snap_even(info['sky_px'])), hole_frac_left=hf[0], hole_frac_right=hf[1])
    return out


def compose_A(sky_rgb, prep, text_rgba=None, *, text_px=0.0, text_safe=True, text_snap=True,
              float_window=True, linear=True, text_linear=False, threads=2, return_info=False):
    """The per-FRAME part of a version A pair: sky (shifted to its parallax) + prepared foreground
    views + text -> (left_rgb, right_rgb) float32 sRGB.  See stereo_pair_A for the arguments."""
    L4, R4 = prep['left'], prep['right']
    H, W = L4.shape[:2]
    sky = to_float(sky_rgb)
    if sky.ndim != 3 or sky.shape[:2] != (H, W):
        sky = np.ascontiguousarray(np.broadcast_to(np.asarray(sky, np.float32).reshape(1, 1, 3), (H, W, 3)))
    sky = sky[..., :3]
    sky_d = prep['sky_px']

    def finish(v, eye):
        out = shift_x(sky, 0.5 * eye * sky_d)
        if out is sky or not out.flags.writeable or not out.flags.c_contiguous:
            out = np.array(out, np.float32, order='C')
        _fg_over(out, v, linear)
        return out

    L, R = _parallel(finish, [(L4, -1), (R4, 1)], threads)
    blocks = _draw_text(L, R, text_rgba, prep['disparity'], prep['alpha'], text_px, text_safe,
                        text_snap, text_linear)
    np.clip(L, 0.0, 1.0, out=L)
    np.clip(R, 0.0, 1.0, out=R)
    win = None
    if float_window:
        L, R, win = floating_window(L, R, prep['disparity'], prep['alpha'], copy=False)
    if not return_info:
        return L, R
    out = {k: v for k, v in prep.items() if k not in ('left', 'right')}
    out.update(text_blocks=blocks, text_px=min([b[4] for b in blocks]) if blocks else float(text_px),
               window=win)
    return L, R, out


def stereo_pair_A(sky_rgb, fg_rgba, fg_depth, text_rgba=None, *, disparity=None, info=None,
                  conv=None, max_px=None, sky_px=None, near_px=None, fg_share=None,
                  text_px=0.0, text_safe=True, text_snap=True, float_window=True,
                  linear=True, text_linear=False, interp='lanczos', cut=None, threads=2,
                  return_info=False, **disp_kw):
    """Version A frame -> (left_rgb, right_rgb), float32 sRGB (H, W, 3).
    (= compose_A(sky, prepare_A(fg, depth), text); use those two when a shot has many frames.)

    sky_rgb    (H, W, 3) sky plate (at infinity): moved as a whole by -/+ sky_px/2.  The sky
               parallax is snapped to an even number of px so the plate is copied, not resampled.
               (A (3,) / (1, 1, 3) colour is accepted too.)
    fg_rgba    (H, W, 4) foreground still, STRAIGHT alpha, display-referred sRGB (the Cycles PNG).
    fg_depth   (H, W) camera depth in metres, 0 = no geometry.
    text_rgba  (H, W, 4) straight-alpha text layer or None; drawn last, at parallax text_px
               (default 0 = on the screen plane, identical in both eyes).  The layer is split
               into blocks (title, caption, ...) and with text_safe=True (default) every block
               that covers foreground is moved just in front of it - text on the screen plane
               drawn over a heap that floats in front of the screen would be a depth conflict.
               So the title in the sky stays at 0 and a caption over the heap comes forward.
               text_snap rounds each parallax to an even px count: glyphs are copied, never
               resampled.  For full control pass a LIST of items instead: full-frame layers,
               (layer, px), (tile, x0, y0) or (tile, x0, y0, px) with px = that item's parallax
               (use this to keep a caption's depth constant during a push-in).
    disparity, info   pre-computed result of disparity_from_depth(..., mode='A', return_info=True).
    linear     'over' of foreground on sky in linear light (True) or on the gamma values (False).
    text_linear  text 'over' in linear light; default False = gamma space, which is what
               compose/text.py prescribes (the original film blended its text that way).
    float_window  mask the lateral frame edges where the heap comes out of the screen.
    Other keywords go to disparity_from_depth (pct, knee, soft_step, dilate, ...).

    With return_info=True a third value is returned: dict(disparity, sky_px, near_px, far_px,
    min_px, max_px, hole_frac_left, hole_frac_right, window, text_blocks [(x0, y0, w, h, px)],
    text_px (the most forward block), ...).
    """
    prep = prepare_A(fg_rgba, fg_depth, disparity=disparity, info=info, conv=conv, max_px=max_px,
                     sky_px=sky_px, near_px=near_px, fg_share=fg_share, interp=interp, cut=cut,
                     threads=threads, **disp_kw)
    return compose_A(sky_rgb, prep, text_rgba, text_px=text_px, text_safe=text_safe,
                     text_snap=text_snap, float_window=float_window, linear=linear,
                     text_linear=text_linear, threads=threads, return_info=return_info)


def prepare_B(rgb, depth, *, disparity=None, info=None, conv=None, max_px=None, far_px=None,
              near_px=None, interp='lanczos', cut=None, threads=2, **disp_kw):
    """The per-SHOT part of a version B pair -> dict(left, right (H, W, 3) float32 sRGB views,
    disparity, hole_frac_left / right, + the disparity_from_depth info)."""
    img = to_float(rgb)
    if img.ndim == 3 and img.shape[2] == 4:
        img = np.ascontiguousarray(img[..., :3])
    H, W = img.shape[:2]
    if disparity is None or info is None:
        disparity, info = disparity_from_depth(depth, None, conv, max_px, 'B', far_px=far_px,
                                               near_px=near_px, cut=cut, return_info=True, **disp_kw)
    res = synth_pair(img, disparity, threads=threads, cut=cut, interp=interp, return_info=True)
    out = dict(info)
    out.update(left=res[0][0], right=res[1][0], disparity=disparity,
               hole_frac_left=float(np.count_nonzero(res[0][1]['hole_mask'])) / float(H * W),
               hole_frac_right=float(np.count_nonzero(res[1][1]['hole_mask'])) / float(H * W))
    return out


def compose_B(prep, text_rgba=None, *, text_px=None, text_safe=True, text_snap=True,
              float_window=True, text_linear=False, return_info=False):
    """The per-FRAME part of a version B pair: prepared views + text -> (left_rgb, right_rgb)."""
    H, W = prep['left'].shape[:2]
    if text_px is None:
        text_px = DEFAULTS['B_text'] * W
    L, R = prep['left'], prep['right']
    if text_rgba is not None or float_window:
        L, R = L.copy(), R.copy()
    blocks = _draw_text(L, R, text_rgba, prep['disparity'], None, text_px, text_safe, text_snap,
                        text_linear)
    win = None
    if float_window:
        L, R, win = floating_window(L, R, prep['disparity'], copy=False)
    if not return_info:
        return L, R
    out = {k: v for k, v in prep.items() if k not in ('left', 'right')}
    out.update(text_blocks=blocks, text_px=min([b[4] for b in blocks]) if blocks else float(text_px),
               window=win)
    return L, R, out


def zoom_prep(prep, zoom, center=None, interp='lanczos'):
    """Apply the film's 2D push-in to a prepared pair: both views (and the disparity / alpha that
    compose_* use for the text depth and the floating window) are scaled by `zoom` about `center`
    (default: frame centre) with the SAME transform, so there is no vertical parallax and every
    parallax simply grows by `zoom`.  The sky of version A is not touched (it is composed later).
    Returns a new dict; `prep` is not modified."""
    if abs(zoom - 1.0) < 1e-9:
        return prep
    H, W = prep['left'].shape[:2]
    cx, cy = ((W - 1) / 2.0, (H - 1) / 2.0) if center is None else center
    M = np.float32([[zoom, 0, cx * (1 - zoom)], [0, zoom, cy * (1 - zoom)]])
    fl = _INTERP[interp]

    def wz(a, flags, scale=1.0):
        r = cv2.warpAffine(a, M, (W, H), flags=flags, borderMode=cv2.BORDER_REFLECT_101)
        return r * np.float32(scale) if scale != 1.0 else r

    out = dict(prep)
    for key in ('left', 'right'):
        v = wz(prep[key], fl)
        if v.shape[2] == 4:
            np.clip(v[..., 3], 0.0, 1.0, out=v[..., 3])
            np.maximum(v[..., :3], 0.0, out=v[..., :3])
        else:
            np.clip(v, 0.0, 1.0, out=v)
        out[key] = v
    out['disparity'] = wz(prep['disparity'], cv2.INTER_LINEAR, zoom)
    if prep.get('alpha') is not None:
        out['alpha'] = wz(np.ascontiguousarray(prep['alpha']), cv2.INTER_LINEAR)
    for key in ('near_px', 'far_px', 'min_px', 'max_px', 'k'):
        if key in out:
            out[key] = float(out[key]) * zoom
    return out


def stereo_pair_B(rgb, depth, text_rgba=None, *, disparity=None, info=None, conv=None, max_px=None,
                  far_px=None, near_px=None, text_px=None, text_safe=True, text_snap=True,
                  float_window=True, text_linear=False, interp='lanczos', cut=None, threads=2,
                  return_info=False, **disp_kw):
    """Version B frame -> (left_rgb, right_rgb), float32 sRGB (H, W, 3).
    (= compose_B(prepare_B(rgb, depth), text).)

    rgb        (H, W, 3) opaque top-down still (an alpha channel is ignored).
    depth      (H, W) camera depth in metres covering the frame (ground + items).
    text_rgba  (H, W, 4) straight-alpha text or None, drawn last at parallax text_px (default
               -0.2 % of the width = slightly in front of the screen).  text_safe=True (default)
               pushes each text block further forward when it covers something nearer than
               that.  A list of items with explicit parallaxes is accepted as in stereo_pair_A.
    disparity, info   pre-computed disparity_from_depth(..., mode='B', return_info=True).
    float_window  mask the lateral frame edges where an item in front of the screen is cut off.
    The still is warped in gamma space (it is opaque: nothing is blended except the text).
    With return_info=True a third value is returned (see stereo_pair_A).
    """
    prep = prepare_B(rgb, depth, disparity=disparity, info=info, conv=conv, max_px=max_px,
                     far_px=far_px, near_px=near_px, interp=interp, cut=cut, threads=threads, **disp_kw)
    return compose_B(prep, text_rgba, text_px=text_px, text_safe=text_safe, text_snap=text_snap,
                     float_window=float_window, text_linear=text_linear, return_info=return_info)


# ==============================================================================================
# packing
# ==============================================================================================
def pack_sbs(left, right, mode='half', swap=False):
    """Side-by-side frame, left eye on the left (swap=True: cross-eyed viewing order).
    'half'  each eye squeezed horizontally to W/2 (area filter) -> W x H, the frame-compatible
            format 3D TVs / VR players call "SBS half" (3840x2160 in -> 3840x2160 out).
    'full'  2W x H (7680x2160), full resolution per eye."""
    l, r = (right, left) if swap else (left, right)
    if mode == 'full':
        return np.concatenate([l, r], axis=1)
    assert mode == 'half', mode
    H, W = l.shape[:2]
    wl = W // 2
    a = cv2.resize(l, (wl, H), interpolation=cv2.INTER_AREA)
    b = cv2.resize(r, (W - wl, H), interpolation=cv2.INTER_AREA)
    return np.concatenate([a, b], axis=1)


# Dubois least-squares anaglyph matrices for red-cyan glasses on an LCD (rows = output R, G, B).
_DUBOIS_L = np.float32([[0.4561, 0.500484, 0.176381],
                        [-0.0400822, -0.0378246, -0.0157589],
                        [-0.0152161, -0.0205971, -0.00546856]])
_DUBOIS_R = np.float32([[-0.0434706, -0.0879388, -0.00155529],
                        [0.378476, 0.73364, -0.0184503],
                        [-0.0721527, -0.112961, 1.2264]])


def pack_anaglyph(left, right, method='dubois'):
    """Red-cyan anaglyph (left eye = red filter) for a quick check without 3D hardware.
    'dubois'  Dubois' least-squares matrices, applied in linear light (least ghosting / rivalry);
    'gray'    luminance anaglyph (no colour, cleanest depth - useful for all-red subjects)."""
    l = srgb_to_linear(to_float(left)[..., :3])
    r = srgb_to_linear(to_float(right)[..., :3])
    if method == 'gray':
        w = np.float32([0.2126, 0.7152, 0.0722])
        yl, yr = l @ w, r @ w
        out = np.stack([yl, yr, yr], axis=-1)
    else:
        assert method == 'dubois', method
        out = l @ _DUBOIS_L.T + r @ _DUBOIS_R.T
    return linear_to_srgb(np.clip(out, 0.0, 1.0)).astype(np.float32)


def disparity_preview(disparity, alpha=None, sky_px=None, limit=None):
    """Colour-coded disparity for QC: red = in front of the screen, white = screen plane,
    blue = behind.  (H, W, 3) float32 sRGB."""
    d = np.asarray(disparity, np.float32)
    if alpha is not None and sky_px is not None:
        d = np.where(to_float(alpha) > 0.5, d, np.float32(sky_px))
    lim = float(np.abs(d).max()) if limit is None else float(limit)
    t = np.clip(d / max(lim, 1e-6), -1, 1)[..., None]
    red, blue, white = np.float32([0.85, 0.12, 0.10]), np.float32([0.10, 0.25, 0.85]), np.float32([1, 1, 1])
    return np.where(t < 0, white + (red - white) * (-t), white + (blue - white) * t).astype(np.float32)


# ==============================================================================================
# CLI
# ==============================================================================================
HERE = os.path.dirname(os.path.abspath(__file__))
FILM_DIR = os.path.dirname(HERE)
SCRATCH = os.environ.get('YSTY_SCRATCH',
                         '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad')


def _read_image(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    assert im is not None, 'cannot read ' + path
    im = to_float(im)
    if im.ndim == 3:
        im = im[..., [2, 1, 0, 3]] if im.shape[2] == 4 else im[..., ::-1]
    return np.ascontiguousarray(im)


def _write_image(path, rgb, quality=93, width=None):
    rgb = np.clip(rgb, 0.0, 1.0)
    if width and rgb.shape[1] > width:
        h = int(round(rgb.shape[0] * width / float(rgb.shape[1])))
        rgb = cv2.resize(rgb, (width, h), interpolation=cv2.INTER_AREA)
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    if path.lower().endswith('.png'):
        arr = (rgb * 65535.0 + 0.5).astype(np.uint16)
        cv2.imwrite(path, arr[..., ::-1])
    else:
        arr = (rgb * 255.0 + 0.5).astype(np.uint8)
        cv2.imwrite(path, arr[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, quality,
                                           cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444])
    return path


def demo_sky(H, W, top=(0.012, 0.010, 0.014), bottom=(0.105, 0.050, 0.034), stars=True, seed=7):
    """Dark vertical gradient (the m02 backdrop mood) + a few pin-point stars (they make the
    sky's parallax visible in the check images)."""
    t = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None, None] ** 1.6
    sky = np.float32(top)[None, None, :] * (1.0 - t) + np.float32(bottom)[None, None, :] * t
    sky = np.ascontiguousarray(np.broadcast_to(sky, (H, W, 3))).copy()
    if stars:
        rng = np.random.default_rng(seed)
        n = 260
        layer = np.zeros((H, W), np.float32)
        ys = (rng.random(n) ** 1.5 * 0.5 * H).astype(int)
        xs = (rng.random(n) * W).astype(int)
        layer[ys, xs] = rng.random(n).astype(np.float32) ** 2 * 6.0 + 0.6
        layer = cv2.GaussianBlur(layer, (0, 0), W / 3840.0 * 1.1)
        sky += layer[..., None] * np.float32([1.0, 0.96, 0.9])
    return np.clip(sky, 0.0, 1.0)


def demo_title(H, W, text=u'枸杞子', cy=0.405, em=0.118, tracking=0.22, font=None):
    """Dummy white title with a soft shadow, straight-alpha RGBA float32 (Pillow)."""
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    font = font or os.path.join(SCRATCH, 'fonts', 'NotoSerifCJKsc-Bold.otf')
    px = int(em * H)
    try:
        fnt = ImageFont.truetype(font, px)
    except Exception:
        fnt = ImageFont.load_default()
    adv = [fnt.getlength(c) for c in text]
    tot = sum(adv) + tracking * px * (len(text) - 1)
    x = (W - tot) / 2.0
    cov = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(cov)
    for c, a in zip(text, adv):
        dr.text((x, cy * H), c, font=fnt, fill=255, anchor='lm')
        x += a + tracking * px
    sh = cov.filter(ImageFilter.GaussianBlur(px * 0.06))
    c = np.asarray(cov, np.float32) / 255.0
    s = np.asarray(sh, np.float32) / 255.0 * 0.55
    a = c + s * (1.0 - c)
    out = np.zeros((H, W, 4), np.float32)
    out[..., :3] = (c / np.maximum(a, 1e-6))[..., None]        # white text over black shadow
    out[..., 3] = a
    return out


def _fmt_px(v, W):
    return '%+.1f px (%+.2f %% W)' % (v, 100.0 * v / W)


def cmd_demo(args):
    cv2.setNumThreads(args.threads)
    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)
    t0 = time.perf_counter()
    fg = _read_image(args.fg)
    depth = np.load(args.depth)
    if args.scale != 1.0:
        s = args.scale
        fg = cv2.resize(fg, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        depth = cv2.resize(depth, (fg.shape[1], fg.shape[0]), interpolation=cv2.INTER_NEAREST)
    H, W = fg.shape[:2]
    sky = demo_sky(H, W)
    title = demo_title(H, W)
    t_load = time.perf_counter() - t0

    t0, c0 = time.perf_counter(), time.process_time()
    D, info = disparity_from_depth(depth, fg[..., 3], mode='A', return_info=True)
    t_disp, c_disp = time.perf_counter() - t0, time.process_time() - c0
    t0, c0 = time.perf_counter(), time.process_time()
    L, R, inf = stereo_pair_A(sky, fg, depth, title, disparity=D, info=info, return_info=True,
                              threads=args.threads, interp=args.interp)
    t_pair, c_pair = time.perf_counter() - t0, time.process_time() - c0
    t0 = time.perf_counter()
    half = pack_sbs(L, R, 'half')
    t_half = time.perf_counter() - t0
    t0 = time.perf_counter()
    ana = pack_anaglyph(L, R)
    t_ana = time.perf_counter() - t0

    _write_image(os.path.join(out_dir, 'stereo_goji_anaglyph.jpg'), ana, width=1920)
    _write_image(os.path.join(out_dir, 'stereo_goji_anaglyph_gray.jpg'), pack_anaglyph(L, R, 'gray'), width=1920)
    _write_image(os.path.join(out_dir, 'stereo_goji_sbs_half.jpg'), half)
    _write_image(os.path.join(out_dir, 'stereo_goji_disparity.jpg'),
                 disparity_preview(D, fg[..., 3], inf['sky_px']), width=1920)
    # 100 % crops around silhouette berries: left | right
    cw, ch = int(0.14 * W), int(0.11 * H)
    alpha = fg[..., 3]
    crops = []
    for fx in (0.14, 0.43, 0.56, 0.86):
        x0 = int(fx * W - cw / 2)
        col = alpha[:, x0 + cw // 2]
        top = int(np.argmax(col > 0.5))
        y0 = int(np.clip(top - ch * 0.42, 0, H - ch))
        crops.append((x0, y0))
    crops.append((int(0.47 * W), int(0.86 * H)))                 # near field, inside the heap
    rows = []
    gap = np.ones((ch, 6, 3), np.float32) * 0.5
    for x0, y0 in crops:
        rows.append(np.concatenate([L[y0:y0 + ch, x0:x0 + cw], gap, R[y0:y0 + ch, x0:x0 + cw]], axis=1))
        rows.append(np.ones((6, rows[-1].shape[1], 3), np.float32) * 0.5)
    _write_image(os.path.join(out_dir, 'stereo_goji_edges.jpg'), np.concatenate(rows[:-1], axis=0), quality=95)

    solid = alpha > 0.5
    dv = D[solid]
    print('== goji stereo demo  %dx%d ==' % (W, H))
    print('depth range (percentiles)   z_near %.4f m   z_far %.4f m   screen plane (conv) %.4f m   k = %.2f px*m'
          % (info['z_near'], info['z_far'], info['conv'], info['k']))
    print('foreground disparity        min %s   max %s' % (_fmt_px(dv.min(), W), _fmt_px(dv.max(), W)))
    print('   percentile targets       near %s   far %s' % (_fmt_px(info['near_px'], W), _fmt_px(info['far_px'], W)))
    print('sky disparity               %s' % _fmt_px(inf['sky_px'], W))
    print('text disparity              %s' % _fmt_px(inf['text_px'], W))
    print('total parallax used         %.1f px = %.2f %% of the width' % (inf['sky_px'] - dv.min(), 100 * (inf['sky_px'] - dv.min()) / W))
    print('disoccluded pixels filled   left %.3f %%   right %.3f %%  of the frame (%.3f %% / %.3f %% of the foreground)'
          % (100 * inf['hole_frac_left'], 100 * inf['hole_frac_right'],
             100 * inf['hole_frac_left'] / solid.mean(), 100 * inf['hole_frac_right'] / solid.mean()))
    if inf['window'] is not None:
        print('floating window             left edge up to %.1f px, right edge up to %.1f px'
              % (inf['window'][0].max(), inf['window'][1].max()))
    print('defocused (dithered Z) share of the foreground: %.1f %%' % (100 * info.get('defocus_frac', 0.0)))
    print('timings (wall / cpu): disparity_from_depth %.2f / %.2f s | stereo_pair_A with cached disparity '
          '%.2f / %.2f s | pack half %.2f s | anaglyph %.2f s | load %.2f s'
          % (t_disp, c_disp, t_pair, c_pair, t_half, t_ana, t_load))
    print('written to', out_dir)
    return L, R, inf


def synthetic_plate(H=1080, W=1920, seed=3):
    """A synthetic top-down 'specimen plate': textured ground with soft contact shadows and a few
    items (domes, a thin stem, a ring) -> (rgb, depth[m]).  Used by selftest / bench."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    s = W / 1920.0
    cam = 0.60                                               # camera height above the ground (m)
    height = np.zeros((H, W), np.float32)
    col = np.zeros((H, W, 3), np.float32)
    item = np.zeros((H, W), bool)
    n1 = cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 1.2 * s)
    n2 = cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 14 * s)
    ground = 0.80 + 0.9 * (n1 - 0.5) + 0.25 * (n2 - 0.5)
    ground = ground[..., None] * np.float32([0.93, 0.88, 0.78])
    ground[(yy.astype(int) // int(40 * s)) % 6 == 0] *= 0.93  # some structure: faint ruled lines
    shadow = np.zeros((H, W), np.float32)
    for _ in range(26):
        cx, cy = rng.uniform(0.04, 0.96) * W, rng.uniform(0.06, 0.94) * H
        r = rng.uniform(22, 70) * s
        hgt = rng.uniform(0.006, 0.030)
        d2 = ((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)
        m = d2 < 1.0
        dome = hgt * np.sqrt(np.clip(1.0 - d2, 0, 1)) ** 0.7
        upd = m & (dome > height)
        height[upd] = dome[upd]
        base = np.float32(rng.uniform(0.25, 0.9, 3)) * np.float32([1.0, 0.55, 0.4])
        tex = 0.75 + 0.5 * (n1 - 0.5) + 0.35 * np.sqrt(np.clip(1.0 - d2, 0, 1))
        col[upd] = (tex[..., None] * base)[upd]
        item |= upd
        shadow = np.maximum(shadow, np.exp(-np.clip(np.sqrt(d2) - 1.0, 0, None) * r / (22 * s)) * (d2 >= 1.0) * (hgt / 0.03))
    # a thin stem (3 px) high above the ground and a hairline
    for (x0, y0, x1, y1, wd, hg) in ((0.2, 0.3, 0.45, 0.62, 3.0, 0.028), (0.6, 0.2, 0.8, 0.75, 1.5, 0.02)):
        px, py = x1 * W - x0 * W, y1 * H - y0 * H
        ln = np.hypot(px, py)
        tpar = np.clip(((xx - x0 * W) * px + (yy - y0 * H) * py) / (ln * ln), 0, 1)
        dist = np.hypot(xx - (x0 * W + tpar * px), yy - (y0 * H + tpar * py))
        m = dist < wd * s
        height[m] = hg
        col[m] = np.float32([0.25, 0.16, 0.08])
        item |= m
    img = np.where(item[..., None], col, ground * (1.0 - 0.55 * np.clip(shadow, 0, 1))[..., None])
    # anti-alias the colour only (the depth stays hard, like a Z pass)
    img = cv2.GaussianBlur(np.clip(img, 0, 1).astype(np.float32), (0, 0), 0.7)
    depth = (cam - height).astype(np.float32)
    return img, depth


def cmd_selftest(args):
    cv2.setNumThreads(args.threads)
    ok = True
    # 1. constant disparity = pure shift
    rng = np.random.default_rng(0)
    img = cv2.GaussianBlur(rng.random((64, 256, 3)).astype(np.float32), (0, 0), 1.5)
    D = np.full((64, 256), 8.0, np.float32)
    l = synth_view(img, D, -1)
    r = synth_view(img, D, 1)
    e = max(np.abs(l[:, :-8] - img[:, 4:-4]).max(), np.abs(r[:, 8:] - img[:, 4:-4]).max())
    print('constant disparity -> exact +-4 px shift, max err %.2e' % e)
    ok &= e < 1e-5
    # 2. random piecewise rows against a brute-force z-buffer
    worst = 0.0
    for trial in range(60):
        H, W = 4, int(rng.integers(40, 100))
        D = np.zeros((H, W), np.float32)
        for y in range(H):
            x = 0
            while x < W:
                w = int(rng.integers(1, 22))
                slope = rng.uniform(-0.3, 0.3) if rng.random() < 0.7 else rng.uniform(-6, 6)   # some steep slopes
                D[y, x:x + w] = rng.uniform(-25, 25) + slope * np.arange(min(w, W - x))
                x += w
        cut = float(rng.choice([0.5, 1.0, 2.0]))
        u, holes = _warp_map(D, 1, cut)
        ref = np.full((H, W), np.nan)
        zb = np.full((H, W), np.inf)
        for y in range(H):
            d = D[y].astype(np.float64)
            g = np.arange(W) + 0.5 * d
            conn = ~_jumps(D[y:y + 1] * np.float32(0.5), 0.5 * cut)[0]
            for j in range(W):
                c = []
                if conn[j]:
                    for n in range(int(np.ceil(g[j])), int(np.ceil(g[j + 1]))):
                        fr = (n - g[j]) / (g[j + 1] - g[j])
                        c.append((n, j + fr, d[j] + fr * (d[j + 1] - d[j])))
                else:
                    n = int(np.ceil(g[j]))
                    if n - g[j] < 0.5:
                        c.append((n, j + n - g[j], d[j]))
                if j == 0 or not conn[j - 1]:
                    n = int(np.ceil(g[j])) - 1
                    if g[j] - n <= 0.5 and n < g[j]:
                        c.append((n, j + n - g[j], d[j]))
                for n, uu, dd in c:
                    if 0 <= n < W and dd < zb[y, n]:
                        zb[y, n], ref[y, n] = dd, uu
        hm = np.zeros(H * W, bool)
        if holes is not None:
            hm[holes['idx']] = True
        if not np.array_equal(hm.reshape(H, W), np.isnan(ref)):
            ok = False
            print('  hole mask mismatch in trial', trial)
            continue
        m = ~np.isnan(ref)
        worst = max(worst, float(np.abs(u - ref)[m].max()))
    print('inverse map vs brute-force z-buffer: worst |du| = %.2e px' % worst)
    ok &= worst < 2e-3
    # 3. a near bar over a far ground: the fill must never read the bar
    D = np.full((4, 200), 10, np.float32)
    D[:, 80:120] = -30
    src = np.zeros((4, 200, 3), np.float32)
    src[:, 80:120] = 1.0
    for eye in (-1, 1):
        v, inf = synth_view(src, D, eye, return_info=True)
        leak = float(v[inf['hole_mask']].max())
        cols = np.flatnonzero(v[0, :, 0] > 0.5)
        good = leak == 0.0 and cols[0] == 80 - eye * 15 and cols[-1] == 119 - eye * 15
        print('near bar, eye %+d: bar at %d..%d, leak into the disocclusion %.3f  %s'
              % (eye, cols[0], cols[-1], leak, 'ok' if good else 'FAIL'))
        ok &= good
    # 4. synthetic plate (mode B)
    img, depth = synthetic_plate(args.h, args.w)
    t0 = time.perf_counter()
    L, R, inf = stereo_pair_B(img, depth, None, return_info=True, threads=args.threads)
    print('synthetic plate %dx%d: stereo_pair_B %.2f s, disparity %.1f .. %.1f px, holes L %.2f %% R %.2f %%'
          % (args.w, args.h, time.perf_counter() - t0, inf['min_px'], inf['max_px'],
             100 * inf['hole_frac_left'], 100 * inf['hole_frac_right']))
    if args.out_dir:
        _write_image(os.path.join(args.out_dir, 'stereo_plate_anaglyph.jpg'), pack_anaglyph(L, R), width=1920)
        _write_image(os.path.join(args.out_dir, 'stereo_plate_sbs_full.jpg'), pack_sbs(L, R, 'full'))
    print('SELFTEST', 'OK' if ok else 'FAILED')
    return 0 if ok else 1


def cmd_bench(args):
    cv2.setNumThreads(args.threads)
    H, W = args.h, args.w

    def tm(label, fn, n=args.repeat):
        best, bestc = 1e9, 1e9
        for _ in range(n):
            t0, c0 = time.perf_counter(), time.process_time()
            r = fn()
            best = min(best, time.perf_counter() - t0)
            bestc = min(bestc, time.process_time() - c0)
        print('  %-52s wall %6.2f s   cpu %6.2f s' % (label, best, bestc))
        return r

    print('bench %dx%d, threads %d  (cpu = CPU seconds summed over threads: the load-independent cost)'
          % (W, H, args.threads))
    if os.path.exists(args.fg) and os.path.exists(args.depth):
        fg = _read_image(args.fg)
        depth = np.load(args.depth)
        if fg.shape[1] != W:
            fg = cv2.resize(fg, (W, H), interpolation=cv2.INTER_AREA)
            depth = cv2.resize(depth, (W, H), interpolation=cv2.INTER_NEAREST)
        sky = demo_sky(H, W)
        title = demo_title(H, W)
        print('mode A (goji foreground + sky + title)')
        D, info = tm('disparity_from_depth (once per shot)', lambda: disparity_from_depth(depth, fg[..., 3], mode='A', return_info=True))
        pm = fg.copy()
        pm[..., :3] *= pm[..., 3:4]
        tm('synth_view RGBA, one eye, lanczos', lambda: synth_view(pm, D, 1, premultiplied=True))
        tm('synth_view RGBA, one eye, cubic', lambda: synth_view(pm, D, 1, premultiplied=True, interp='cubic'))
        tm('_warp_map only, one eye', lambda: _warp_map(D, 1, 1.0))
        tm('stereo_pair_A, cached disparity, lanczos', lambda: stereo_pair_A(sky, fg, depth, title, disparity=D, info=info, threads=args.threads))
        tm('stereo_pair_A, cached disparity, cubic', lambda: stereo_pair_A(sky, fg, depth, title, disparity=D, info=info, threads=args.threads, interp='cubic'))
        prep = tm('prepare_A (per shot), cached disparity', lambda: prepare_A(fg, depth, disparity=D, info=info, threads=args.threads))
        tm('compose_A (per frame)', lambda: compose_A(sky, prep, title, threads=args.threads))
        tm('zoom_prep 1.05 (per frame, optional)', lambda: zoom_prep(prep, 1.05))
        L, R = compose_A(sky, prep, title, threads=args.threads)
        tm('pack_sbs half', lambda: pack_sbs(L, R, 'half'))
        tm('pack_anaglyph dubois', lambda: pack_anaglyph(L, R))
    img, depth = synthetic_plate(H, W)
    print('mode B (synthetic plate)')
    D, info = tm('disparity_from_depth (once per shot)', lambda: disparity_from_depth(depth, mode='B', return_info=True))
    tm('stereo_pair_B, cached disparity, lanczos', lambda: stereo_pair_B(img, depth, None, disparity=D, info=info, threads=args.threads))
    tm('stereo_pair_B, cached disparity, cubic', lambda: stereo_pair_B(img, depth, None, disparity=D, info=info, threads=args.threads, interp='cubic'))
    prep = prepare_B(img, depth, disparity=D, info=info, threads=args.threads)
    tm('compose_B (per frame, no text)', lambda: compose_B(prep, None))
    return 0


def _report(inf, W):
    print('disparity range %s .. %s%s   text %s   holes L %.3f %% R %.3f %%'
          % (_fmt_px(inf['min_px'], W), _fmt_px(inf['max_px'], W),
             ('   sky ' + _fmt_px(inf['sky_px'], W)) if inf.get('mode') == 'A' else '',
             _fmt_px(inf['text_px'], W), 100 * inf['hole_frac_left'], 100 * inf['hole_frac_right']))


def _pack_out(args, L, R):
    if args.format == 'half':
        out = pack_sbs(L, R, 'half')
    elif args.format == 'full':
        out = pack_sbs(L, R, 'full')
    elif args.format == 'anaglyph':
        out = pack_anaglyph(L, R)
    else:
        base, ext = os.path.splitext(args.out)
        _write_image(base + '_L' + ext, L)
        _write_image(base + '_R' + ext, R)
        return
    _write_image(args.out, out)


def cmd_pair_a(args):
    cv2.setNumThreads(args.threads)
    fg = _read_image(args.fg)
    depth = np.load(args.depth)
    H, W = fg.shape[:2]
    sky = _read_image(args.sky)[..., :3] if args.sky else demo_sky(H, W, stars=False)
    text = _read_image(args.text) if args.text else None
    L, R, inf = stereo_pair_A(sky, fg, depth, text, return_info=True, threads=args.threads,
                              max_px=args.max_px, interp=args.interp)
    _report(inf, W)
    _pack_out(args, L, R)
    return 0


def cmd_pair_b(args):
    cv2.setNumThreads(args.threads)
    rgb = _read_image(args.rgb)
    depth = np.load(args.depth)
    text = _read_image(args.text) if args.text else None
    L, R, inf = stereo_pair_B(rgb, depth, text, return_info=True, threads=args.threads,
                              max_px=args.max_px, interp=args.interp)
    _report(inf, rgb.shape[1])
    _pack_out(args, L, R)
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description='stereoscopic 3D synthesis (see module docstring)')
    sub = p.add_subparsers(dest='cmd')
    goji = os.path.join(FILM_DIR, 'renders', 'm02_gouqi.png')
    gojid = os.path.join(FILM_DIR, 'renders', 'm02_gouqi_depth.npy')

    d = sub.add_parser('demo', help='goji validation images')
    d.add_argument('--out-dir', default=os.path.join(SCRATCH, 'previews'))
    d.add_argument('--fg', default=goji)
    d.add_argument('--depth', default=gojid)
    d.add_argument('--scale', type=float, default=1.0)
    d.add_argument('--interp', default='lanczos', choices=list(_INTERP))
    d.add_argument('--threads', type=int, default=2)
    d.set_defaults(fn=cmd_demo)

    b = sub.add_parser('bench', help='timings')
    b.add_argument('--w', type=int, default=3840)
    b.add_argument('--h', type=int, default=2160)
    b.add_argument('--fg', default=goji)
    b.add_argument('--depth', default=gojid)
    b.add_argument('--repeat', type=int, default=2)
    b.add_argument('--threads', type=int, default=2)
    b.set_defaults(fn=cmd_bench)

    s = sub.add_parser('selftest', help='engine checks + synthetic plate')
    s.add_argument('--w', type=int, default=1920)
    s.add_argument('--h', type=int, default=1080)
    s.add_argument('--out-dir', default=None)
    s.add_argument('--threads', type=int, default=2)
    s.set_defaults(fn=cmd_selftest)

    for name, fn in (('pair-a', cmd_pair_a), ('pair-b', cmd_pair_b)):
        q = sub.add_parser(name)
        if name == 'pair-a':
            q.add_argument('--fg', required=True, help='RGBA still (PNG)')
            q.add_argument('--sky', default=None, help='sky plate (default: dark gradient)')
        else:
            q.add_argument('--rgb', required=True, help='opaque still')
        q.add_argument('--depth', required=True, help='.npy depth in metres')
        q.add_argument('--text', default=None, help='RGBA text layer')
        q.add_argument('--out', required=True)
        q.add_argument('--format', default='half', choices=['half', 'full', 'anaglyph', 'pair'])
        q.add_argument('--max-px', dest='max_px', type=float, default=None)
        q.add_argument('--interp', default='lanczos', choices=list(_INTERP))
        q.add_argument('--threads', type=int, default=2)
        q.set_defaults(fn=fn)

    args = p.parse_args(argv)
    if not getattr(args, 'fn', None):
        p.print_help()
        return 2
    r = args.fn(args)
    return r if isinstance(r, int) else 0


if __name__ == '__main__':
    sys.exit(main())
