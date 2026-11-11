#!/usr/bin/env python3
"""sheet2.py — review sheets for one plate of a square film, from the stills tools/preview2.js wrote into --dir:
   <id>_sheet.jpg    1080×1080  first | middle / last | middle with the glyph guide
   <id>_zoom.jpg     1620×540   three 540×540 crops of the middle frame at 1:1 (top of the glyph, lower left, right)
   <id>_compare.jpg  1620×810   the reference film's plate at the same moment (left) | our middle frame (right)
Reference frames are third-party material kept outside git in build/ref2/f (24 fps, f_0001.jpg …); without them the compare is skipped."""
import os, sys, json
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = sys.argv[1:]
film = a[a.index('--film') + 1] if '--film' in a else 'coins2'
d = a[a.index('--dir') + 1]
ids = [x for x in a if not x.startswith('--') and x not in (film, d)]
slots = {}
try:
    slots = json.load(open(os.path.join(ROOT, 'docs', f'storyboard-{film}.json'), encoding='utf-8')).get('slots', {})
except Exception:
    pass
for i in ids:
    P = lambda n: os.path.join(d, f'{i}_{n}.jpg')
    if not os.path.exists(P('mid')): continue
    mid = Image.open(P('mid')).convert('RGB')
    tiles = [Image.open(P(n)).convert('RGB') if os.path.exists(P(n)) else mid for n in ('tmp-start', 'mid', 'tmp-end', 'tmp-guide')]
    sh = Image.new('RGB', (1080, 1080))
    for k, t in enumerate(tiles): sh.paste(t.resize((540, 540), Image.LANCZOS), ((k % 2) * 540, (k // 2) * 540))
    sh.save(P('sheet'), quality=90); print('sheet:   ' + P('sheet'))
    W = mid.size[0]; q = W / 1080.0                       # device pixels per logical pixel (1 or 2)
    z = Image.new('RGB', (1620, 540))
    for k, (x, y) in enumerate(((400, 150), (130, 520), (560, 470))):     # logical positions; crops are 540 × 540 DEVICE pixels, shown 1:1
        x, y = int(x * q), int(y * q); z.paste(mid.crop((x, y, x + 540, y + 540)), (k * 540, 0))
    z.save(P('zoom'), quality=95); print('zoom:    ' + P('zoom') + ('   (1:1 device pixels of the %d px render)' % W))
    ref = slots.get(i, {}).get('ref')
    rf = os.path.join(ROOT, 'build', 'ref2', 'f', 'f_%04d.jpg' % (round(ref * 24) + 1)) if ref is not None else None
    if rf and os.path.exists(rf):
        c = Image.new('RGB', (1620, 810), (20, 20, 22))
        c.paste(Image.open(rf).convert('RGB').resize((810, 810), Image.LANCZOS), (0, 0)); c.paste(mid.resize((810, 810), Image.LANCZOS), (810, 0))
        dr = ImageDraw.Draw(c); dr.rectangle([0, 0, 150, 16], fill=(0, 0, 0)); dr.text((4, 2), 'reference %.2fs' % ref, fill=(255, 255, 0))
        dr.rectangle([810, 0, 900, 16], fill=(0, 0, 0)); dr.text((814, 2), f'ours {i}', fill=(255, 255, 0))
        c.save(P('compare'), quality=90); print('compare: ' + P('compare'))
    for n in ('tmp-start', 'tmp-end', 'tmp-guide'):
        try: os.unlink(P(n))
        except OSError: pass
