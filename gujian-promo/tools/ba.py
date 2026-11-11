#!/usr/bin/env python3
"""ba.py — before / after sheets for reviewing a refinement pass.
   python3 tools/ba.py --film coins s16 s18 …   → build/<film>/ba/<id>.jpg
Top row: whole frame, baseline (left) vs current preview (right). Bottom row: the same 960×540 window around the crest at 1:1.
Baseline stills come from build/<film>/baseline/<id>_mid.jpg (render them once with `preview.js … --out build/<film>/baseline`)."""
import os, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = sys.argv[1:]
film = a[a.index('--film') + 1] if '--film' in a else 'arch'
ids = [x for x in a if x.startswith('s') and x[1:].isdigit() or x == 'title']
base = os.path.join(ROOT, 'build', film, 'baseline'); cur = os.path.join(ROOT, 'build', film, 'preview'); out = os.path.join(ROOT, 'build', film, 'ba')
os.makedirs(out, exist_ok=True)
for i in ids:
    pb, pc = os.path.join(base, f'{i}_mid.jpg'), os.path.join(cur, f'{i}_mid.jpg')
    if not (os.path.exists(pb) and os.path.exists(pc)): print('missing', i); continue
    b, c = Image.open(pb).convert('RGB'), Image.open(pc).convert('RGB')
    sh = Image.new('RGB', (1920, 1080))
    sh.paste(b.resize((960, 540), Image.LANCZOS), (0, 0)); sh.paste(c.resize((960, 540), Image.LANCZOS), (960, 0))
    box = (480, 330, 1440, 870)
    sh.paste(b.crop(box), (0, 540)); sh.paste(c.crop(box), (960, 540))
    d = ImageDraw.Draw(sh); d.line([(960, 0), (960, 1080)], fill=(255, 255, 0), width=2)
    d.rectangle([0, 0, 110, 16], fill=(0, 0, 0)); d.text((4, 2), f'{i} BEFORE', fill=(255, 255, 0))
    d.rectangle([960, 0, 1070, 16], fill=(0, 0, 0)); d.text((964, 2), f'{i} AFTER', fill=(255, 255, 0))
    p = os.path.join(out, f'{i}.jpg'); sh.save(p, quality=90); print(p)
