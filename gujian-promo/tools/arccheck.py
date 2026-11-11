#!/usr/bin/env python3
"""arccheck.py — objective check that each shot's dominant edge sits on the shared arc.

For every shot's preview still (build/preview/<id>_mid.jpg, rendered WITHOUT tagline text → use `preview.js --notext`)
it measures the edge strength across concentric offsets of the arc (mean |L(dr+3) − L(dr−3)| along the curve) and reports
where the strongest edge is. A healthy shot peaks within a few px of dr = 0.

  python3 tools/arccheck.py [suffix]     (suffix defaults to "mid")
"""
import os, re, sys, json, signal
signal.signal(signal.SIGPIPE, signal.SIG_DFL)
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
W, H = 1920, 1080
argv = sys.argv[1:]
film = 'arch'
if '--film' in argv:
    i = argv.index('--film'); film = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
suffix = argv[0] if argv else 'mid'
PREV = os.path.join(ROOT, 'build', 'preview') if film == 'arch' else os.path.join(ROOT, 'build', film, 'preview')

# shot arcs: ask node to evaluate the film's timeline (ES module) and print [id, R, crestY]
import subprocess
tl = os.path.join(ROOT, 'src', 'timeline.js') if film == 'arch' else os.path.join(ROOT, 'src', 'films', film, 'timeline.js')
js = "import('file://%s').then(m => console.log(JSON.stringify(m.SHOTS.map(s => [s.id, s.arc.R, s.arc.crestY]))))" % tl.replace('\\', '/')
shots = [tuple(x) for x in json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT).decode())]

def profile(img, R, crestY):
    L = np.asarray(img.convert('L'), dtype=np.float32)
    cx, cyc = W / 2, crestY + R
    span = np.arcsin(min(1, (W / 2 - 20) / R))
    th = np.linspace(-span, span, 600)
    def sample(dr):
        x = cx + (R + dr) * np.sin(th); y = cyc - (R + dr) * np.cos(th)
        xi = np.clip(np.round(x).astype(int), 0, W - 1); yi = np.clip(np.round(y).astype(int), 0, H - 1)
        ok = (y >= 0) & (y < H)
        return L[yi, xi], ok
    offs = np.arange(-90, 91, 2)
    out = []
    for d in offs:
        a, ok1 = sample(d + 3); b, ok2 = sample(d - 3)
        ok = ok1 & ok2
        out.append(float(np.mean(np.abs(a[ok] - b[ok]))) if ok.any() else 0.0)
    return offs, np.array(out)

rows = []
for sid, R, crestY in shots:
    p = os.path.join(PREV, f'{sid}_{suffix}.jpg')
    if not os.path.exists(p):
        rows.append((sid, None)); continue
    offs, pr = profile(Image.open(p), R, crestY)
    k = int(np.argmax(pr))
    at0 = float(pr[np.abs(offs) <= 6].max())
    med = float(np.median(pr))
    rows.append((sid, dict(peak_dr=int(offs[k]), peak=round(float(pr[k]), 1), at_arc=round(at0, 1), median=round(med, 1), ratio=round(at0 / (med + 1e-6), 2))))

print(f"{'shot':6} {'peak@dr':>8} {'peak':>7} {'at arc':>7} {'median':>7} {'arc/median':>10}  verdict")
for sid, r in rows:
    if r is None:
        print(f'{sid:6} (no preview)'); continue
    ok = abs(r['peak_dr']) <= 8 or r['at_arc'] >= 0.8 * r['peak']
    strong = r['ratio'] >= 1.8
    verdict = 'OK' if ok and strong else ('edge off arc' if not ok else 'weak edge')
    print(f"{sid:6} {r['peak_dr']:>8} {r['peak']:>7} {r['at_arc']:>7} {r['median']:>7} {r['ratio']:>10}  {verdict}")
