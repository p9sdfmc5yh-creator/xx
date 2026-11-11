#!/usr/bin/env python3
"""flicker.py — temporal check on rendered frames: within every shot, how much does the picture change from frame to frame?
   python3 tools/flicker.py --film coins
A shot that moves smoothly has similar frame-to-frame differences throughout; a single big jump (max ≫ median) is a pop or a flicker.
Film grain is different on every frame, so differences are measured on box-averaged 240×135 thumbnails."""
import os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = sys.argv[1:]
film = a[a.index('--film') + 1] if '--film' in a else 'arch'
FR = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5, 101]
ss = os.environ.get('GJ_SS', '1')
fdir = os.path.join(ROOT, 'build', film, 'frames' if ss == '1' else f'frames-ss{ss}')   # GJ_SS=2: check the 4K frames
th = lambda n: np.asarray(Image.open(os.path.join(fdir, 'f_%05d.png' % n)).convert('RGB').resize((240, 135), Image.BOX), dtype=np.float32)
start = 0
print(f"{'shot':6} {'frames':>6} {'median':>7} {'max':>7} {'max/med':>8}  note")
for i, k in enumerate(FR):
    sid = ('s%02d' % (i + 1)) if i < 37 else 'title'
    fr = [th(start + j) for j in range(k)]
    d = np.array([float(np.mean(np.abs(fr[j + 1] - fr[j]))) for j in range(k - 1)])
    if sid == 'title':   # the card has two intended hard cuts (card A → card B) and a tilt; report them apart
        big = np.argsort(d)[-3:][::-1]
        print(f"{sid:6} {k:>6} {np.median(d):>7.2f} {d.max():>7.2f} {'':>8}  largest changes at frames {[int(b) + 1 for b in big]} (card B cuts in at 33)")
    else:
        r = d.max() / (np.median(d) + 1e-6)
        note = 'JUMP at frame %d' % (int(np.argmax(d)) + 1) if (r > 3.0 and d.max() > 1.5) else ''
        print(f"{sid:6} {k:>6} {np.median(d):>7.2f} {d.max():>7.2f} {r:>8.2f}  {note}")
    start += k
