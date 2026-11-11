#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Stereoscopic 3D synthesis for the 《药食同源》 films (numpy / scipy-free core / cv2).

Both films are built from layers whose depth is known exactly, so a clean left / right pair is
synthesised from ONE render per shot (depth-image-based rendering, DIBR):

    Version A frame = sky plate (infinity) + 3D foreground still (RGBA + camera depth) + text
    Version B frame = one opaque top-down still with a full-frame depth map            + text

Public API (all images float32 sRGB 0..1 unless noted; uint8 / uint16 inputs are normalised)
---------------------------------------------------------------------------------------------
    disparity_from_depth(depth, alpha=None, conv=None, max_px=None, mode='A'|'B', ...)
        -> signed disparity map in pixels, float32 (H, W)   [+ info dict with return_info=True]
           disparity = x_right - x_left.  0 = screen plane, > 0 behind the screen, < 0 in front.
    synth_view(img, disparity, eye=-1|+1, ...)
        -> the layer re-projected for the left (-1) / right (+1) eye: every pixel moves by
           eye * disparity / 2 (symmetric pair).  Occlusion-correct, hole-free.
    synth_pair(img, disparity, ...)            -> (left, right)   (two synth_view calls, threaded)
    stereo_pair_A(sky_rgb, fg_rgba, fg_depth, text_rgba=None, ...)  -> (left_rgb, right_rgb)
    stereo_pair_B(rgb, depth, text_rgba=None, ...)                  -> (left_rgb, right_rgb)
    pack_sbs(left, right, mode='half'|'full')  -> side-by-side frame (left eye on the left)
    pack_anaglyph(left, right, method='dubois'|'gray')              -> red-cyan anaglyph
    floating_window(left, right, disparity, alpha=None)  -> pair with the frame edges masked where
           content in front of the screen is cut by the left / right frame edge
    safe_text_disparity(text_alpha, disparity, ...)      -> disparity that keeps text in front of
           whatever it covers
    shift_x(img, dx)                           -> layer shifted horizontally (uniform disparity)

Sign / geometry conventions
---------------------------
    x_left  = x - d/2          x_right = x + d/2          d = k * (1/z_conv - 1/z)
    (a parallel-axis stereo camera with sensor shift: disparity is exactly linear in 1/z, there
    is no vertical parallax and no keystone.)  Far things have d > 0 and appear behind the
    screen, near things d < 0 and float in front of it.

How a view is synthesised (synth_view)
--------------------------------------
Rows are independent (pure horizontal parallax).  For the right eye a source pixel centre j of a
row lands at g_j = j + d_j/2.  Neighbouring pixels whose disparity differs by <= `cut` px form a
connected surface segment; a bigger jump is a depth discontinuity (the two pixels are separate
surfaces, each owning its own +-0.5 px footprint).  Every target pixel is covered by zero, one or
several such pieces:
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
bicubic) kernel by cv2.remap, so there are no splat cracks, no stair-steps and no double
resampling.  The left eye is the same algorithm on the mirrored row.

Depth conditioning (disparity_from_depth)
-----------------------------------------
Cycles' Z pass is one un-filtered sample per pixel: hard, aliased edges that are dithered inside
the depth-of-field blur and sprinkled with single-pixel misses.  Before use the disparity is
    1. extended into pixels without depth (nearest valid neighbour) - the anti-aliased / defocused
       alpha fringe of a foreground layer travels with its own object;
    2. despeckled (5x5 median passes);
    3. edge-preservingly smoothed (self-guided filter): steps smaller than `soft_step` px become
       gentle ramps (a sub-pixel "rubber sheet", invisible, and it averages the DOF dither into
       the soft ramp the colour image has), bigger steps stay perfectly hard;
    4. foreground-dilated by `dilate` px at the remaining hard steps, so the mixed (anti-aliased)
       edge pixels and a thin ring of background ride with the near object: every seam created
       by the warp is then background-against-background, i.e. invisible, and no ghost contour
       is left behind on the far side.

Performance (3840x2160, 2 threads on a loaded 4-core box): see `stereo.py bench`.

CLI
---
    stereo.py demo  --out-dir DIR      goji validation set (anaglyph, half-SBS, 100 % edge crops)
    stereo.py bench                    timings at 4K
    stereo.py selftest                 brute-force check of the warp engine + synthetic B scene
    stereo.py pair-a --fg F.png --depth F_depth.npy [--sky S.png] [--text T.png] --out O.jpg
    stereo.py pair-b --rgb F.png --depth F_depth.npy [--text T.png] --out O.jpg
"""
import os
import sys
import time
import argparse
import threading

import numpy as np
import cv2

__all__ = ['disparity_from_depth', 'synth_view', 'synth_pair', 'stereo_pair_A', 'stereo_pair_B',
           'pack_sbs', 'pack_anaglyph', 'floating_window', 'safe_text_disparity', 'shift_x',
           'srgb_to_linear', 'linear_to_srgb', 'to_float', 'disparity_preview', 'DEFAULTS']

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
    despeckle=2,        # 5x5 median passes
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


def _dilate_near(d, radius, thr):
    """Grow the NEAR side (smaller disparity) of every hard step by `radius` px."""
    if radius < 1:
        return d
    k = 2 * int(radius) + 1
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    lo = cv2.erode(d, ker, borderType=cv2.BORDER_REPLICATE)
    hi = cv2.dilate(d, ker, borderType=cv2.BORDER_REPLICATE)
    w = np.clip(((hi - lo) - 0.5 * thr) / thr, 0.0, 1.0)      # 0 below thr/2, 1 above 1.5 thr
    w = w * w * (3.0 - 2.0 * w)
    return d + w * (lo - d)


def disparity_from_depth(depth, alpha=None, conv=None, max_px=None, mode='A', *,
                         sky_px=None, far_px=None, near_px=None, fg_share=None,
                         pct=None, knee=None, despeckle=None, soft_step=None, soft_radius=None,
                         dilate=None, cut=None, sky_max=None, near_max=None, return_info=False):
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
    max_px, sky_px, far_px, near_px   parallaxes in pixels of THIS image (defaults scale with
              the width; near_px is negative for "in front").
    pct, knee robust range: depth percentiles (0.2, 99.8) and the soft-clip of what lies beyond.
    despeckle, soft_step, soft_radius, dilate, cut    conditioning, see the module docstring.

    Returns float32 (H, W); with return_info=True also a dict:
        sky_px, near_px, far_px (farthest foreground / ground), k (px*m), conv (m), z_near,
        z_far, min_px, max_px (actual range on valid pixels), width, mode, valid (bool mask).
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
        k = share * budget / span                               # px * m
        if conv is not None:                                    # screen plane given
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
        if s < 1.0:
            k, near, sky = k * s, near * s, sky * s
        far = near + k * span                                   # farthest foreground percentile
        far = min(far, sky - 0.02 * (sky - near))
    else:
        budget = _px(max_px, Dd['B_max'], W)
        if far_px is not None and near_px is not None:
            budget = float(far_px) - float(near_px)
        k = budget / span
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
        if s < 1.0:
            k, near, far = k * s, near * s, far * s
        sky = far

    d = (np.float32(near) + np.float32(k) * (np.float32(inv_near) - inv)).astype(np.float32)
    # soft-clip the outliers beyond the percentile range
    kn = max(float(knee) * (far - near), 1e-6)
    kn_far = min(kn, 0.5 * max(sky - far, 0.0)) if mode == 'A' else kn
    lo_m = d < near
    if lo_m.any():
        d[lo_m] = near - kn * np.tanh((near - d[lo_m]) / kn)
    hi_m = d > far
    if hi_m.any():
        d[hi_m] = far + kn_far * np.tanh((d[hi_m] - far) / max(kn_far, 1e-6)) if kn_far > 0 else far

    d = _fill_invalid(d, valid)
    for _ in range(max(0, despeckle)):
        d = cv2.medianBlur(d, 5)
    d = _soften_small_steps(d, soft_radius, soft_step)
    d = _dilate_near(d, dil, cut)
    d = np.ascontiguousarray(d, np.float32)

    if not return_info:
        return d
    dv = d[stat]
    conv_inv = inv_near + near / k
    info = dict(sky_px=float(sky), near_px=float(near), far_px=float(far), k=float(k),
                conv=float(1.0 / conv_inv) if conv_inv > 1e-9 else float('inf'),
                z_near=float(1.0 / inv_near), z_far=float(1.0 / inv_far),
                min_px=float(dv.min()), max_px=float(dv.max()), width=W, mode=mode, valid=valid,
                fg_share=float((far - near) / max(sky - near, 1e-9)) if mode == 'A' else 1.0)
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
    conn = np.abs(dD) <= f32(0.5 * cut)                       # segment (j, j+1) is one surface
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
    # second integer (stretched connected segments only)
    ok = (f + f32(1.0) < rlen) & (A + 1 >= 0) & (A + 1 < W)
    sel = np.flatnonzero(ok.ravel())
    if sel.size:
        np.maximum.at(best, (rows + A + 1).ravel()[sel], jfull[sel])
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
    inv = np.where(conn, f32(1.0) / (f32(1.0) + dD), f32(1.0)).astype(f32)
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
                 surfaces (default 1.0; must be <= 2).
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
    assert 0 < cut <= 2.0, 'cut must be in (0, 2]'
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
def _over_text(rgb, text, linear):
    """rgb (H, W, 3) sRGB, text (H, W, 4) straight-alpha sRGB -> rgb with the text 'over'."""
    if text is None:
        return rgb
    a = text[..., 3]
    ys, xs = np.nonzero(a.max(axis=1))[0], np.nonzero(a.max(axis=0))[0]
    if ys.size == 0:
        return rgb
    y0, y1, x0, x1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
    dst = rgb[y0:y1, x0:x1]
    t = text[y0:y1, x0:x1]
    ta = t[..., 3:4]
    if linear:
        dst[...] = linear_to_srgb(srgb_to_linear(dst) * (1.0 - ta) + srgb_to_linear(t[..., :3]) * ta)
    else:
        dst[...] = dst * (1.0 - ta) + t[..., :3] * ta
    return rgb


def _text_views(text, text_px, snap):
    if text is None:
        return None, None, 0.0
    if snap:
        text_px = _snap_even(text_px)
    if abs(text_px) < 1e-6:
        return text, text, 0.0
    return shift_x(text, -0.5 * text_px, cv2.BORDER_CONSTANT), shift_x(text, 0.5 * text_px, cv2.BORDER_CONSTANT), text_px


def stereo_pair_A(sky_rgb, fg_rgba, fg_depth, text_rgba=None, *, disparity=None, info=None,
                  conv=None, max_px=None, sky_px=None, near_px=None, fg_share=None,
                  text_px=0.0, text_safe=False, text_snap=True, float_window=True,
                  linear=True, text_linear=False, interp='lanczos', cut=None, threads=2,
                  return_info=False, **disp_kw):
    """Version A frame -> (left_rgb, right_rgb), float32 sRGB (H, W, 3).

    sky_rgb    (H, W, 3) sky plate (at infinity): moved as a whole by -/+ sky_px/2.  The sky
               parallax is snapped to an even number of px so the plate is copied, not resampled.
               (A (3,) / (1, 1, 3) colour is accepted too.)
    fg_rgba    (H, W, 4) foreground still, STRAIGHT alpha, display-referred sRGB (the Cycles PNG).
    fg_depth   (H, W) camera depth in metres, 0 = no geometry.
    text_rgba  (H, W, 4) straight-alpha text layer or None; drawn last, at parallax text_px
               (default 0 = on the screen plane, identical in both eyes).  text_safe=True moves
               it in front of whatever foreground it overlaps (see safe_text_disparity).
    disparity, info   pre-computed result of disparity_from_depth(..., mode='A', return_info=True)
               (cache it per shot: the still does not change from frame to frame).
    linear     'over' of foreground on sky in linear light (True) or on the gamma values (False).
    text_linear  text 'over' in linear light; default False = gamma space, which is what
               compose/text.py prescribes (the original film blended its text that way).
    float_window  mask the lateral frame edges where the heap comes out of the screen.
    Other keywords go to disparity_from_depth (pct, knee, soft_step, dilate, ...).

    With return_info=True a third value is returned: dict(disparity, sky_px, text_px, near_px,
    far_px, min_px, max_px, hole_frac_left, hole_frac_right, window, ...).
    """
    fg = to_float(fg_rgba)
    H, W = fg.shape[:2]
    assert fg.shape[2] == 4, 'fg_rgba must be RGBA'
    sky = to_float(sky_rgb)
    if sky.ndim != 3 or sky.shape[:2] != (H, W):
        sky = np.ascontiguousarray(np.broadcast_to(np.asarray(sky, np.float32).reshape(1, 1, 3), (H, W, 3)))
    text = to_float(text_rgba)
    alpha = fg[..., 3]
    if disparity is None or info is None:
        disparity, info = disparity_from_depth(fg_depth, alpha, conv, max_px, 'A', sky_px=sky_px,
                                               near_px=near_px, fg_share=fg_share, cut=cut,
                                               return_info=True, **disp_kw)
    sky_d = _snap_even(info['sky_px'])
    if text is not None and text_safe:
        text_px = safe_text_disparity(text, disparity, base=text_px, alpha=alpha)
    tL, tR, text_px = _text_views(text, text_px, text_snap)

    pm = fg.copy()
    pm[..., :3] *= pm[..., 3:4]                               # premultiplied, gamma space
    views = synth_pair(pm, disparity, threads=threads, cut=cut, interp=interp, premultiplied=True,
                       return_info=True)

    def finish(view, eye, txt):
        v, vi = view
        a = v[..., 3:4]
        s = shift_x(sky, 0.5 * eye * sky_d)
        if linear:
            c = np.where(a > 1e-5, v[..., :3] / np.maximum(a, 1e-5), 0.0)
            np.clip(c, 0.0, 1.0, out=c)
            out = linear_to_srgb(srgb_to_linear(c) * a + srgb_to_linear(s) * (1.0 - a))
        else:
            out = v[..., :3] + s * (1.0 - a)
        out = np.ascontiguousarray(out, np.float32)
        _over_text(out, txt, text_linear)
        np.clip(out, 0.0, 1.0, out=out)
        hf = float(np.count_nonzero(vi['hole_mask'] & (v[..., 3] > 0.02))) / float(H * W)
        return out, hf

    (L, hl), (R, hr) = _parallel(finish, [(views[0], -1, tL), (views[1], 1, tR)], threads)
    win = None
    if float_window:
        L, R, win = floating_window(L, R, disparity, alpha, copy=False)
        if text is not None and win is not None and max(win[0].max(), win[1].max()) > 0:
            pass                                               # text never sits in the edge strip
    if not return_info:
        return L, R
    out = dict(info)
    out.update(disparity=disparity, sky_px=float(sky_d), text_px=float(text_px), hole_frac_left=hl,
               hole_frac_right=hr, window=win)
    return L, R, out


def stereo_pair_B(rgb, depth, text_rgba=None, *, disparity=None, info=None, conv=None, max_px=None,
                  far_px=None, near_px=None, text_px=None, text_safe=True, text_snap=True,
                  float_window=True, text_linear=False, interp='lanczos', cut=None, threads=2,
                  return_info=False, **disp_kw):
    """Version B frame -> (left_rgb, right_rgb), float32 sRGB (H, W, 3).

    rgb        (H, W, 3) opaque top-down still (an alpha channel is ignored).
    depth      (H, W) camera depth in metres covering the frame (ground + items).
    text_rgba  (H, W, 4) straight-alpha text or None, drawn last at parallax text_px (default
               -0.2 % of the width = slightly in front of the screen).  text_safe=True (default)
               pushes it further forward when it covers something nearer than that.
    disparity, info   pre-computed disparity_from_depth(..., mode='B', return_info=True).
    The still is warped in gamma space (it is opaque: nothing is blended except the text).
    With return_info=True a third value is returned (see stereo_pair_A).
    """
    img = to_float(rgb)
    if img.ndim == 3 and img.shape[2] == 4:
        img = np.ascontiguousarray(img[..., :3])
    H, W = img.shape[:2]
    text = to_float(text_rgba)
    if disparity is None or info is None:
        disparity, info = disparity_from_depth(depth, None, conv, max_px, 'B', far_px=far_px,
                                               near_px=near_px, cut=cut, return_info=True, **disp_kw)
    if text_px is None:
        text_px = DEFAULTS['B_text'] * W
    if text is not None and text_safe:
        text_px = safe_text_disparity(text, disparity, base=text_px)
    tL, tR, text_px = _text_views(text, text_px, text_snap)
    views = synth_pair(img, disparity, threads=threads, cut=cut, interp=interp, return_info=True)
    outs = []
    for (v, vi), txt in zip(views, (tL, tR)):
        _over_text(v, txt, text_linear)
        np.clip(v, 0.0, 1.0, out=v)
        outs.append((v, float(np.count_nonzero(vi['hole_mask'])) / float(H * W)))
    (L, hl), (R, hr) = outs
    win = None
    if float_window:
        L, R, win = floating_window(L, R, disparity, copy=False)
    if not return_info:
        return L, R
    out = dict(info)
    out.update(disparity=disparity, text_px=float(text_px), hole_frac_left=hl, hole_frac_right=hr,
               window=win)
    return L, R, out


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
