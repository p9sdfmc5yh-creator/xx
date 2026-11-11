#!/usr/bin/env python3
"""pairs.py — director's overview: every shot of a film next to the same shot of the reference film.

  python3 tools/pairs.py --film coins [--dir build/coins/preview] [--out build/coins/pairs]

Reads <dir>/<id>_mid.jpg (from tools/preview.js) and build/ref/trio/ref_<id>_b.jpg, writes pairs_1.jpg … (10 shots per sheet,
two pairs per row, each pair = reference 480x270 | ours 480x270 with the shot id).
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.environ.get('GJ_REF_DIR', os.path.join(ROOT, 'build', 'ref', 'trio'))
a = sys.argv[1:]
film = a[a.index('--film') + 1] if '--film' in a else 'arch'
d = a[a.index('--dir') + 1] if '--dir' in a else (os.path.join(ROOT, 'build', 'preview') if film == 'arch' else os.path.join(ROOT, 'build', film, 'preview'))
out = a[a.index('--out') + 1] if '--out' in a else os.path.join(ROOT, 'build', film, 'pairs')
os.makedirs(out, exist_ok=True)
try:
    font = ImageFont.truetype(os.path.join(ROOT, 'assets', 'fonts', 'NotoSerifSC.ttf'), 20)
except Exception:
    font = ImageFont.load_default()
ids = ['s%02d' % i for i in range(1, 38)] + ['title']
W, Hh, PER = 480, 270, 10
sheets = [ids[i:i + PER] for i in range(0, len(ids), PER)]
for si, group in enumerate(sheets):
    rows = (len(group) + 1) // 2
    im = Image.new('RGB', (1920, rows * Hh), (18, 18, 20))
    dr = ImageDraw.Draw(im)
    for k, sid in enumerate(group):
        x, y = (k % 2) * 960, (k // 2) * Hh
        r = os.path.join(REF, f'ref_{sid}_b.jpg')
        o = os.path.join(d, f'{sid}_mid.jpg')
        if os.path.exists(r):
            im.paste(Image.open(r).convert('RGB').resize((W, Hh), Image.LANCZOS), (x, y))
        if os.path.exists(o):
            im.paste(Image.open(o).convert('RGB').resize((W, Hh), Image.LANCZOS), (x + W, y))
        else:
            dr.text((x + W + 180, y + 120), '（缺）', font=font, fill=(200, 80, 80))
        dr.rectangle([x, y, x + 64, y + 26], fill=(0, 0, 0))
        dr.text((x + 6, y + 1), sid, font=font, fill=(255, 255, 255))
        dr.rectangle([x + W - 1, y, x + W, y + Hh], fill=(255, 0, 170))
        dr.rectangle([x, y + Hh - 1, x + 960, y + Hh], fill=(18, 18, 20))
    p = os.path.join(out, f'pairs_{si + 1}.jpg')
    im.save(p, quality=88)
    print(p)
