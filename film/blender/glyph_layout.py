# -*- coding: utf-8 -*-
"""Lay small items out so that they spell Chinese characters (top-down "flat-lay" shots, version B).

Pure numpy / scipy / Pillow - no bpy - so it can be unit-tested and previewed quickly.

    lay = glyph_layout("本草", item_r=0.0035, stroke_items=5.0, seed=1)
    lay['xy']      (N,2) metres, glyph block centred on the origin, +y = up in the picture
    lay['z']       (N,)  metres, resting height of the item centre above the ground (z = 0)
    lay['yaw']     (N,)  radians
    lay['tilt']    (N,2) radians, small tilt about x / y from the local heap slope
    lay['scale']   (N,)  per-item size factor
    lay['layer']   (N,)  0 = touching the ground, 1.. = stacked
    lay['stray']   (N,)  bool, True for the few loose items outside the strokes
    lay['size']    (w, h) metres of the whole text block
    lay['mask'], lay['px_per_m'], lay['origin_px']  for debugging / previews

The strokes are filled by "pouring": candidate points are thrown into the (slightly eroded) stroke
mask, blue-noise filtered per pass, then dropped onto a height field so later items rest on earlier
ones. Stroke edges stay crisp because item centres are kept >= edge_inset * r inside the outline.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

FONT_DIR = os.environ.get(
    "YAOSHI_FONT_DIR",
    "/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad/fonts")
DEFAULT_FONT = "NotoSansCJKsc-Black.otf"   # uniform heavy strokes read best when built from objects


def text_mask(text, font_file=DEFAULT_FONT, em_px=900, tracking=0.06, line_gap=0.12):
    """Rasterise `text` (may contain '\\n') -> boolean mask (True = stroke), tightly cropped."""
    font = ImageFont.truetype(os.path.join(FONT_DIR, font_file), em_px)
    lines = text.split("\n")
    adv = int(em_px * (1.0 + tracking))
    w = adv * max(len(l) for l in lines) + em_px
    lh = int(em_px * (1.0 + line_gap))
    h = lh * len(lines) + em_px
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    for li, line in enumerate(lines):
        x0 = (w - adv * len(line)) // 2
        for ci, ch in enumerate(line):
            d.text((x0 + ci * adv, em_px // 4 + li * lh), ch, font=font, fill=255)
    m = np.asarray(im) > 127
    ys, xs = np.where(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def stroke_width_px(mask):
    """Typical stroke width in pixels (2 x median of the distance transform along the skeleton ridge)."""
    dt = ndi.distance_transform_edt(mask)
    ridge = (dt == ndi.maximum_filter(dt, size=5)) & (dt > 2)
    return 2.0 * float(np.median(dt[ridge]))


def _blue_noise_filter(pts, d, rng):
    """Greedy dart-throwing: keep points that are >= d from every kept point (grid hash)."""
    cell = d / math.sqrt(2)
    grid = {}
    keep = []
    order = rng.permutation(len(pts))
    for i in order:
        x, y = pts[i]
        cx, cy = int(x // cell), int(y // cell)
        ok = True
        for gx in range(cx - 2, cx + 3):
            for gy in range(cy - 2, cy + 3):
                j = grid.get((gx, gy))
                if j is not None:
                    dx, dy = pts[j][0] - x, pts[j][1] - y
                    if dx * dx + dy * dy < d * d:
                        ok = False
                        break
            if not ok:
                break
        if ok:
            grid[(cx, cy)] = i
            keep.append(i)
    return np.array(keep, dtype=int)


def glyph_layout(text, item_r, stroke_items=5.0, item_h=None, shape="sphere", passes=3,
                 density=1.0, edge_inset=0.55, size_jitter=0.12, stray_frac=0.015, stray_reach=6.0,
                 align=0.0, font_file=DEFAULT_FONT, tracking=0.06, seed=0, max_items=400000):
    """See module docstring.

    item_r        footprint radius of one item in metres (half its longest top-down dimension / ~0.8)
    stroke_items  how many item diameters fit across a typical stroke (>= 2.5 for legibility)
    item_h        half thickness of an item lying flat (default = item_r for spheres, 0.45 r otherwise)
    shape         'sphere' or 'flat' (affects stacking profile)
    passes        number of pouring passes (1 = sparse single layer, 3 = generous heap)
    density       multiplies the number of candidates per pass
    align         0..1 : how strongly elongated items follow the local stroke direction
    """
    rng = np.random.default_rng(seed)
    mask = text_mask(text, font_file=font_file, tracking=tracking)
    sw = stroke_width_px(mask)
    px_per_m = sw / (stroke_items * 2.0 * item_r)
    r_px = item_r * px_per_m
    H, W = mask.shape
    dt = ndi.distance_transform_edt(mask)
    inner = dt >= edge_inset * r_px
    if item_h is None:
        item_h = item_r if shape == "sphere" else 0.45 * item_r

    # local stroke direction (structure tensor of the smoothed mask) for optional alignment
    sm = ndi.gaussian_filter(mask.astype(np.float32), r_px * 1.5)
    gy, gx = np.gradient(sm)
    jxx = ndi.gaussian_filter(gx * gx, r_px * 3)
    jyy = ndi.gaussian_filter(gy * gy, r_px * 3)
    jxy = ndi.gaussian_filter(gx * gy, r_px * 3)
    stroke_dir = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2   # along the stroke

    ys, xs = np.where(inner)
    area_px = len(ys)
    per_pass = int(density * area_px / (math.pi * r_px * r_px) * 1.6)
    pts_all, layer_all = [], []
    for p in range(passes):
        n = min(per_pass * 6, max_items * 4)
        idx = rng.integers(0, len(ys), n)
        cand = np.stack([xs[idx] + rng.random(n), ys[idx] + rng.random(n)], 1)
        dmin = 2.0 * r_px * (0.98 if p == 0 else 0.90)
        k = _blue_noise_filter(cand, dmin, rng)
        pts_all.append(cand[k])
        layer_all.append(np.full(len(k), p))
    pts = np.concatenate(pts_all)
    lay_id = np.concatenate(layer_all)
    stray = np.zeros(len(pts), bool)

    # a few loose items around the strokes
    ns = int(len(pts_all[0]) * stray_frac)
    if ns > 0:
        outside = (~mask) & (ndi.distance_transform_edt(~mask) < stray_reach * r_px)
        oy, ox = np.where(outside)
        if len(oy):
            j = rng.integers(0, len(oy), ns * 4)
            c = np.stack([ox[j] + rng.random(len(j)), oy[j] + rng.random(len(j))], 1)
            kk = _blue_noise_filter(c, 2.6 * r_px, rng)[:ns]
            pts = np.concatenate([pts, c[kk]])
            lay_id = np.concatenate([lay_id, np.zeros(len(kk), int)])
            stray = np.concatenate([stray, np.ones(len(kk), bool)])

    n = len(pts)
    if n > max_items:
        sel = rng.permutation(n)[:max_items]
        sel.sort()
        pts, lay_id, stray = pts[sel], lay_id[sel], stray[sel]
        n = len(pts)
    scale = np.clip(rng.normal(1.0, size_jitter, n), 0.7, 1.35)

    # ---- drop onto a height field (cells ~ r/3) ----
    cell = max(r_px / 3.0, 1.0)
    gw, gh = int(W / cell) + 3, int(H / cell) + 3
    hf = np.zeros((gh, gw), np.float32)          # top surface height in metres
    z = np.zeros(n, np.float32)
    tilt = np.zeros((n, 2), np.float32)
    order = np.lexsort((rng.random(n), lay_id))  # pass 0 first, random inside a pass
    for i in order:
        r_i = r_px * scale[i]
        h_i = item_h * scale[i]
        cx, cy = pts[i, 0] / cell, pts[i, 1] / cell
        rr = r_i / cell
        x0, x1 = int(max(cx - rr, 0)), int(min(cx + rr + 1, gw - 1))
        y0, y1 = int(max(cy - rr, 0)), int(min(cy + rr + 1, gh - 1))
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        d2 = ((xx - cx) ** 2 + (yy - cy) ** 2) / (rr * rr + 1e-9)
        inside = d2 <= 1.0
        if not inside.any():
            continue
        if shape == "sphere":
            prof = h_i * np.sqrt(np.clip(1.0 - d2, 0, 1))      # half-height of the item above each cell
        else:
            prof = h_i * np.clip(1.0 - d2 ** 2, 0, 1) ** 0.5
        sub = hf[y0:y1 + 1, x0:x1 + 1]
        # centre height so the item's underside touches the surface somewhere
        zc = float(np.max(np.where(inside, sub + prof, -1e9)))
        zc = max(zc, h_i)
        z[i] = zc
        if lay_id[i] > 0 or zc > h_i * 1.05:
            w = inside.astype(np.float32)
            sx = float((sub * w * (xx - cx)).sum() / ((w * (xx - cx) ** 2).sum() + 1e-9))
            sy = float((sub * w * (yy - cy)).sum() / ((w * (yy - cy) ** 2).sum() + 1e-9))
            tilt[i] = (math.atan(sy / (cell / px_per_m)) * 0.6, -math.atan(sx / (cell / px_per_m)) * 0.6)
        np.maximum(sub, np.where(inside, zc + prof, sub), out=sub)

    yaw = rng.random(n) * 2 * np.pi
    if align > 0:
        sd = stroke_dir[np.clip(pts[:, 1].astype(int), 0, H - 1), np.clip(pts[:, 0].astype(int), 0, W - 1)]
        jitter = rng.normal(0, (1.0 - align) * 1.2 + 0.08, n)
        flip = rng.integers(0, 2, n) * np.pi
        aligned = -sd + jitter + flip          # image y is down -> negate for world +y up
        use = (rng.random(n) < align) & (~stray)
        yaw = np.where(use, aligned, yaw)

    xy = np.empty((n, 2), np.float64)
    xy[:, 0] = (pts[:, 0] - W / 2.0) / px_per_m
    xy[:, 1] = -(pts[:, 1] - H / 2.0) / px_per_m
    layer = np.round((z - item_h) / (1.6 * item_h + 1e-9)).astype(int).clip(0)
    return dict(xy=xy, z=z, yaw=yaw, tilt=tilt, scale=scale, layer=layer, stray=stray,
                size=(W / px_per_m, H / px_per_m), mask=mask, px_per_m=px_per_m,
                origin_px=(W / 2.0, H / 2.0), item_r=item_r, item_h=item_h)


def preview(lay, out_png, px=1600, colour=(190, 40, 30)):
    """Quick top-down preview (discs shaded by height) to check legibility before rendering."""
    w_m, h_m = lay["size"]
    s = px / (w_m * 1.15)
    Wp, Hp = int(w_m * 1.15 * s), int(h_m * 1.25 * s)
    im = Image.new("RGB", (Wp, Hp), (236, 228, 208))
    d = ImageDraw.Draw(im)
    zmax = float(lay["z"].max()) + 1e-9
    for i in np.argsort(lay["z"]):
        x = Wp / 2 + lay["xy"][i, 0] * s
        y = Hp / 2 - lay["xy"][i, 1] * s
        r = lay["item_r"] * lay["scale"][i] * s
        k = 0.55 + 0.45 * lay["z"][i] / zmax
        c = tuple(int(v * k) for v in colour)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c, outline=(40, 20, 15))
    im.save(out_png)
    return im.size


if __name__ == "__main__":
    import sys, time
    text = sys.argv[1] if len(sys.argv) > 1 else "本草"
    out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/glyph_preview.png"
    t = time.time()
    lay = glyph_layout(text, item_r=0.0035, stroke_items=float(sys.argv[3]) if len(sys.argv) > 3 else 5.0, seed=1)
    print("items", len(lay["z"]), "block size m", [round(v, 3) for v in lay["size"]],
          "max layer", int(lay["layer"].max()), "strays", int(lay["stray"].sum()), "sec", round(time.time() - t, 1))
    print("preview", preview(lay, out))
