# -*- coding: utf-8 -*-
"""Vintage look for 《药食同源》: white paper title pages + faded-film grade.

Resolution independent: scale = 1 -> 1920x1080, scale = 2 -> 3840x2160.

    page = white_page(frame_idx, scale)          # intro (0-192) / outro (736-1248) card: warm white
                                                 # aged paper, faint ruled grid, dark ink text
    out  = retro(img, frame_idx, scale)          # faded warm print, halation, vignette, grain,
                                                 # dust, flicker and sub-pixel gate weave

All images are float32 sRGB 0..1, shape (1080*scale, 1920*scale, 3).
"""
import numpy as np
import cv2

import text as T

INK = np.array([0.115, 0.092, 0.075], np.float32)
INTRO = (0, 192)
OUTRO = (736, 1248)
_paper = {}
_vig = {}


def is_title_page(frame_idx):
    return INTRO[0] <= frame_idx < INTRO[1] or OUTRO[0] <= frame_idx < OUTRO[1]


def paper_white(scale=1):
    """Warm white aged paper with fibres, faint mottling and a faint ruled grid (cached per scale)."""
    if scale in _paper:
        return _paper[scale]
    H, W = 1080 * scale, 1920 * scale
    rng = np.random.default_rng(11)
    base = np.ones((H, W, 3), np.float32) * np.array([0.965, 0.950, 0.915], np.float32)
    fine = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 0.9 * scale) * 0.010 * scale ** 0.5
    mott = cv2.resize(cv2.GaussianBlur(rng.standard_normal((180, 320)).astype(np.float32), (0, 0), 9),
                      (W, H), interpolation=cv2.INTER_CUBIC) * 0.060
    fib = np.zeros((H, W), np.float32)
    for _ in range(2600):
        x, y = rng.integers(0, W), rng.integers(0, H)
        a = rng.uniform(0, np.pi)
        l = rng.uniform(8, 34) * scale
        cv2.line(fib, (int(x), int(y)), (int(x + l * np.cos(a)), int(y + l * np.sin(a))),
                 float(rng.uniform(0.25, 1.0)), max(1, scale), cv2.LINE_AA)
    fib = cv2.GaussianBlur(fib, (0, 0), 0.7 * scale) * 0.022
    grid = np.zeros((H, W), np.float32)
    st = 60 * scale
    for x in range((W // 2) % st, W, st):
        grid[:, x:x + scale] = 1
    for y in range((H // 2) % st, H, st):
        grid[y:y + scale, :] = 1
    wob = cv2.resize(rng.random((27, 48)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    grid = cv2.GaussianBlur(grid, (0, 0), 0.6 * scale) * 0.075 * (0.75 + 0.5 * wob)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    edge = np.clip(r - 0.55, 0, None) ** 2 * 0.10
    tone = (fine + mott - fib - edge)[..., None] * np.array([1.0, 1.03, 1.12], np.float32)
    p = np.clip(base + tone - grid[..., None] * np.array([0.9, 1.0, 1.05], np.float32), 0, 1)
    _paper[scale] = p
    return p


def white_page(frame_idx, scale=1, use_old_name=False):
    """Title card on white paper with dark ink text (the film's text layer, recoloured)."""
    H, W = 1080 * scale, 1920 * scale
    lay = T.render_text_layer(frame_idx, use_old_name=use_old_name, scale=scale)
    lum = lay[..., :3].mean(axis=2)
    ink = np.clip(lay[..., 3] * np.clip((lum - 0.25) / 0.6, 0, 1), 0, 1)[..., None]   # glyph fill only, no shadow
    seg0, seg1 = INTRO if frame_idx < INTRO[1] else OUTRO
    z = 1.0 + 0.035 * (frame_idx - seg0) / (seg1 - seg0)
    M = np.float32([[z, 0, W / 2 * (1 - z)], [0, z, H / 2 * (1 - z)]])
    pg = cv2.warpAffine(paper_white(scale), M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = pg * (1 - ink * 0.94) + INK * ink * 0.94
    return out * float(T.global_fade(frame_idx))


def retro(img, frame_idx, scale=1, strength=1.0):
    """Faded warm print, halation, vignette, film grain, dust, flicker, gate weave."""
    H, W = img.shape[:2]
    f = frame_idx
    k = float(strength)
    rng = np.random.default_rng(1000 + f)
    x = np.clip(img, 0, 1).astype(np.float32)
    dx = (0.7 * np.sin(f * 0.9) + 0.3 * np.sin(f * 2.3)) * scale * k
    dy = 0.6 * np.sin(f * 0.7 + 1.3) * scale * k
    x = cv2.warpAffine(x, np.float32([[1, 0, dx], [0, 1, dy]]), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    lum = (x * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1, keepdims=True)
    hal = cv2.resize(cv2.GaussianBlur(cv2.resize(np.clip(lum - 0.72, 0, 1), (480, 270)), (0, 0), 7), (W, H))[..., None]
    x = x + hal * np.array([0.55, 0.22, 0.08], np.float32) * k                 # warm halation around highlights
    x = lum + (x - lum) * (1 - 0.20 * k)                                        # gentle desaturation
    x = x * (1 + (np.array([1.035, 1.0, 0.90], np.float32) - 1) * k) + np.array([0.012, 0.004, -0.006], np.float32) * k
    x = np.clip(x, 0, 1)
    x = (1 - k) * x + k * (0.058 + 0.905 * x ** 0.94)                          # lifted blacks, soft whites
    x = x + (1 - lum) * np.array([0.016, 0.008, 0.0], np.float32) * k           # brown-toned shadows
    key = (H, W)
    if key not in _vig:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2)) / 1.414
        _vig[key] = (np.clip(r, 0, 1) ** 2.4)[..., None]
    x = x * (1 - 0.30 * k * _vig[key]) * (1 + (0.012 * np.sin(f * 1.7) + 0.008 * rng.standard_normal()) * k)
    g = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 0.75 * scale) * scale
    lum2 = np.clip(x.mean(-1, keepdims=True), 0, 1)
    x = x + g[..., None] * 0.038 * k * (0.55 + 1.8 * lum2 * (1 - lum2))          # grain, strongest in mid-tones
    for _ in range(int(rng.integers(2, 7))):                                     # dust specks
        cx, cy = int(rng.integers(0, W)), int(rng.integers(0, H))
        rr = int(rng.integers(1, 3)) * scale
        col = (0.08, 0.07, 0.06) if rng.random() < 0.7 else (0.95, 0.93, 0.88)
        cv2.circle(x, (cx, cy), rr, col, -1, cv2.LINE_AA)
    if rng.random() < 0.10 * k:                                                  # occasional hairline scratch
        sx = int(rng.integers(0, W))
        x[:, sx:sx + scale] = x[:, sx:sx + scale] * 0.82 + 0.14
    return np.clip(x, 0, 1)
