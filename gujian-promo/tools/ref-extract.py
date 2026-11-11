#!/usr/bin/env python3
"""ref-extract.py — cut the reference film into first / middle / last stills for every shot.

  python3 tools/ref-extract.py /path/to/reference.mp4

Writes build/ref/trio/ref_sNN_{a,b,c}.jpg (and ref_title_{a,b,c}.jpg). tools/preview.js and tools/compare.py use them to
put the reference shot next to ours. The reference film is third-party material: build/ is not in version control, so
after a fresh clone the stills have to be regenerated from the video the client supplied (25 fps; our 500 frames are its
first 500 frames).
"""
import os, subprocess, sys, tempfile, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5]
if len(sys.argv) < 2:
    sys.exit(__doc__)
out = os.path.join(ROOT, 'build', 'ref', 'trio'); os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp()
subprocess.check_call(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', sys.argv[1], '-frames:v', '500', '-q:v', '2', os.path.join(tmp, 'f_%04d.jpg')])
start = 0
for i, n in enumerate(FR):
    sid = 's%02d' % (i + 1)
    edge = 1 if n > 4 else 0                      # skip the frame right at a cut: compression blends neighbours there
    for tag, f in (('a', start + 1 + edge), ('b', start + 1 + n // 2), ('c', start + n - edge)):
        shutil.copy(os.path.join(tmp, 'f_%04d.jpg' % f), os.path.join(out, 'ref_%s_%s.jpg' % (sid, tag)))
    start += n
for tag, f in (('a', 399 + 20), ('b', 399 + 45), ('c', 500)):
    shutil.copy(os.path.join(tmp, 'f_%04d.jpg' % f), os.path.join(out, 'ref_title_%s.jpg' % tag))
shutil.rmtree(tmp)
print('wrote', len(os.listdir(out)), 'stills to', out)
