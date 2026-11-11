#!/usr/bin/env python3
"""qc2.py — checks on a rendered SQUARE film (build/<film>/frames, cut list read from the film's timeline.js) and, if given, the mp4.
  python3 tools/qc2.py --film coins2 [--mp4 out/zhongguo-guqianbi-tuban.mp4]
- frame count and frame size; every cut changes the picture; no shot is an error slate (dark red)
- per shot: frame-to-frame change (a single big jump inside a shot is a pop)
- contact sheets of every shot's middle frame → build/<film>/qc/contact_N.jpg
- with --mp4: stream parameters, duration, loudness, stills from the encoded file"""
import os, re, sys, json, subprocess
import numpy as np
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = sys.argv[1:]
film = a[a.index('--film') + 1] if '--film' in a else 'coins2'
mp4 = a[a.index('--mp4') + 1] if '--mp4' in a else None
src = open(os.path.join(ROOT, 'src', 'films', film, 'timeline.js'), encoding='utf-8').read()
rows = [(sid, int(n)) for sid, n in re.findall(r'\{ id: "([^"]+)", scene: "[^"]+", frames: (\d+)', src)]
total = sum(n for _, n in rows)
fdir = os.path.join(ROOT, 'build', film, 'frames'); out = os.path.join(ROOT, 'build', film, 'qc'); os.makedirs(out, exist_ok=True)
F = lambda n: os.path.join(fdir, 'f_%05d.png' % n)
ok = True
def say(flag, msg):
    global ok
    ok = ok and flag; print(('PASS  ' if flag else 'FAIL  ') + msg)
n = len([x for x in os.listdir(fdir) if x.endswith('.png')])
say(n == total, f'frame count {n} (timeline says {total})')
size = Image.open(F(0)).size
say(size[0] == size[1], f'frame size {size}')
th = lambda k: np.asarray(Image.open(F(k)).convert('RGB').resize((180, 180), Image.BOX), dtype=np.float32)
start, cuts = 0, []
for sid, k in rows: cuts.append((sid, start, start + k - 1)); start += k
weak, slates, pops = [], [], []
prev_last = None
for sid, a0, a1 in cuts:
    fr = [th(j) for j in range(a0, a1 + 1)]
    m = fr[len(fr) // 2].mean(axis=(0, 1))
    if m[0] > 30 and m[1] < 8 and m[2] < 8: slates.append(sid)          # the renderer's dark-red error slate
    if prev_last is not None and float(np.mean(np.abs(fr[0] - prev_last))) < 6: weak.append(sid)
    if len(fr) > 4 and sid not in ('z1', 'title', 'brand'):
        d = np.array([float(np.mean(np.abs(fr[j + 1] - fr[j]))) for j in range(len(fr) - 1)])
        if d.max() > 3 * (np.median(d) + 0.3) and d.max() > 2.0: pops.append((sid, int(np.argmax(d)) + 1, round(float(d.max()), 1)))
    prev_last = fr[-1]
say(not slates, f'error slates: {slates or "none"}')
say(True, f'cuts with little change in the picture: {weak or "none"}')
say(True, f'jumps inside a shot (shot, frame, size): {pops or "none"}  (plates with stop-motion animation are expected here)')
per = 25
for s in range(0, len(cuts), per):
    grp = cuts[s:s + per]; sh = Image.new('RGB', (1350, 270 * ((len(grp) + 4) // 5)), (18, 18, 20)); dr = ImageDraw.Draw(sh)
    for k, (sid, a0, a1) in enumerate(grp):
        x, y = (k % 5) * 270, (k // 5) * 270
        sh.paste(Image.open(F((a0 + a1) // 2)).convert('RGB').resize((270, 270), Image.LANCZOS), (x, y))
        dr.rectangle([x, y, x + 46, y + 14], fill=(0, 0, 0)); dr.text((x + 3, y + 1), sid, fill=(255, 255, 0))
    p = os.path.join(out, f'contact_{s // per + 1}.jpg'); sh.save(p, quality=90); print('      ' + p)
if mp4:
    mp = mp4 if os.path.isabs(mp4) else os.path.join(ROOT, mp4)
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp]))
    v = [s for s in info['streams'] if s['codec_type'] == 'video'][0]; au = [s for s in info['streams'] if s['codec_type'] == 'audio'][0]
    say(v['codec_name'] == 'h264' and v['width'] == size[0] and v['height'] == size[1] and v['pix_fmt'] == 'yuv420p' and v['r_frame_rate'] == '25/1',
        f"video {v['codec_name']} {v['width']}x{v['height']} {v['pix_fmt']} {v['r_frame_rate']} fps, {v.get('nb_frames')} frames, colour {v.get('color_space')}/{v.get('color_range')}")
    say(v.get('nb_frames') == str(total), f"encoded frame count {v.get('nb_frames')}")
    say(au['codec_name'] == 'aac' and au['sample_rate'] == '48000' and au['channels'] == 2, f"audio {au['codec_name']} {au['sample_rate']} Hz, {au['channels']} ch")
    dur = float(info['format']['duration']); say(abs(dur - total / 25) < 0.06, f"duration {dur:.3f} s, size {int(info['format']['size']) / 1e6:.1f} MB, {int(info['format']['bit_rate']) / 1e6:.1f} Mbps")
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', mp, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    tail = r[r.rfind('Integrated loudness:'):]
    I = float(tail.split(' I:')[1].split('LUFS')[0]); P = float(tail.split('Peak:')[1].split('dBFS')[0])
    say(abs(I + 16) <= 1.0 and P <= -1.0, f'loudness {I} LUFS, true peak {P} dBFS')
    tiles = []
    for t in (0.6, 3.0, 9.0, 13.2, 14.0, 17.0, 19.0):
        p = os.path.join(out, 'mp4_%05.2f.jpg' % t)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(t), '-i', mp, '-frames:v', '1', '-q:v', '2', p])
        if os.path.exists(p): tiles.append(Image.open(p).convert('RGB').crop((270, 150, 810, 690)))
    if tiles:
        sh = Image.new('RGB', (540 * 4, 540 * 2), (18, 18, 20))
        for k, tl in enumerate(tiles[:8]): sh.paste(tl, ((k % 4) * 540, (k // 4) * 540))
        sh.save(os.path.join(out, 'mp4_zoom.jpg'), quality=95); print('      ' + os.path.join(out, 'mp4_zoom.jpg'))
print('RESULT: ' + ('all checks passed' if ok else 'CHECKS FAILED'))
sys.exit(0 if ok else 1)
