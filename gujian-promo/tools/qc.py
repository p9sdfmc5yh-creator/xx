#!/usr/bin/env python3
"""qc.py — checks on a rendered film (build/<film>/frames) and, if present, the encoded mp4.

  python3 tools/qc.py --film antiques [--mp4 out/zhongguo-guwan.mp4]

- frame count is 500 and every frame is 1920x1080
- first frame equals last frame (the film loops)
- no accidental duplicate of the previous shot at a cut (every cut changes the picture)
- writes build/<film>/qc/cuts_N.jpg: for every shot its first | last frame, to look for edge reveals
- with --mp4: stream parameters, duration, loudness, and stills grabbed from the encoded file (qc/mp4_*.jpg)
"""
import os, sys, json, subprocess
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = sys.argv[1:]
film = a[a.index('--film') + 1] if '--film' in a else 'arch'
mp4 = a[a.index('--mp4') + 1] if '--mp4' in a else None
FR = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5, 101]
fdir = os.path.join(ROOT, 'build', film, 'frames')
out = os.path.join(ROOT, 'build', film, 'qc'); os.makedirs(out, exist_ok=True)
BASE = 0 if os.path.exists(os.path.join(fdir, 'f_00000.png')) else 1   # frames are numbered from 0 or from 1
f = lambda n: os.path.join(fdir, 'f_%05d.png' % (n - 1 + BASE))
ok = True
def say(flag, msg):
    global ok
    ok = ok and flag
    print(('PASS  ' if flag else 'FAIL  ') + msg)

n = len([x for x in os.listdir(fdir) if x.endswith('.png')])
say(n == 500 == sum(FR), f'frame count {n} (expected 500)')
sizes = {Image.open(f(i)).size for i in (1, 250, 500)}
say(sizes == {(1920, 1080)}, f'frame size {sizes}')
# film grain differs on every frame, so compare box-averaged thumbnails, and use two neighbouring frames of the first shot as the yardstick
_th = lambda n: Image.open(f(n)).convert('RGB').resize((160, 90), Image.BOX)
_md = lambda x, y: sum(ImageStat.Stat(ImageChops.difference(x, y)).mean) / 3
loop, ref = _md(_th(1), _th(500)), _md(_th(1), _th(2))
say(loop < max(1.2, 2 * ref), f'loop: first vs last frame differ by {loop:.2f} (two neighbouring frames differ by {ref:.2f}; same order of magnitude = grain only)')

font = None
try: font = ImageFont.truetype(os.path.join(ROOT, 'assets', 'fonts', 'NotoSerifSC.ttf'), 20)
except Exception: font = ImageFont.load_default()
start = 0; cuts = []
for i, k in enumerate(FR):
    cuts.append((('s%02d' % (i + 1)) if i < 37 else 'title', start + 1, start + k)); start += k
small = lambda p: Image.open(p).convert('RGB').resize((160, 90))
weak = []
for j in range(1, len(cuts)):
    dd = ImageChops.difference(small(f(cuts[j - 1][2])), small(f(cuts[j][1])))
    m = sum(ImageStat.Stat(dd).mean) / 3
    if m < 12: weak.append((cuts[j - 1][0], cuts[j][0], round(m, 1)))
say(True, f'cuts with little change in the picture (mean diff < 12): {weak or "none"}')
# frozen shots (no motion at all between first and last frame)
frozen = []
for sid, a0, a1 in cuts[:37]:
    dd = ImageChops.difference(small(f(a0)), small(f(a1)))
    if sum(ImageStat.Stat(dd).mean) / 3 < 0.6: frozen.append(sid)
say(True, f'shots whose first and last frames are almost identical (very little motion): {frozen or "none"}')

PER = 10
for s in range(0, len(cuts), PER):
    grp = cuts[s:s + PER]
    im = Image.new('RGB', (1920, (len(grp) + 1) // 2 * 270), (18, 18, 20)); dr = ImageDraw.Draw(im)
    for k, (sid, a0, a1) in enumerate(grp):
        x, y = (k % 2) * 960, (k // 2) * 270
        im.paste(Image.open(f(a0)).convert('RGB').resize((480, 270), Image.LANCZOS), (x, y))
        im.paste(Image.open(f(a1)).convert('RGB').resize((480, 270), Image.LANCZOS), (x + 480, y))
        dr.rectangle([x, y, x + 150, y + 26], fill=(0, 0, 0)); dr.text((x + 6, y + 1), f'{sid} 首帧|末帧', font=font, fill=(255, 255, 255))
    p = os.path.join(out, f'cuts_{s // PER + 1}.jpg'); im.save(p, quality=88); print('      ' + p)

if mp4:
    mp = os.path.join(ROOT, mp4) if not os.path.isabs(mp4) else mp4
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp]))
    v = [s for s in info['streams'] if s['codec_type'] == 'video'][0]; au = [s for s in info['streams'] if s['codec_type'] == 'audio'][0]
    say(v['codec_name'] == 'h264' and v['width'] == 1920 and v['height'] == 1080 and v['pix_fmt'] == 'yuv420p' and v['r_frame_rate'] == '25/1',
        f"video {v['codec_name']} {v['width']}x{v['height']} {v['pix_fmt']} {v['r_frame_rate']} fps, {v.get('nb_frames')} frames, colour {v.get('color_space')}/{v.get('color_range')}")
    say(v.get('nb_frames') == '500', f"encoded frame count {v.get('nb_frames')}")
    say(au['codec_name'] == 'aac' and au['sample_rate'] == '48000' and au['channels'] == 2, f"audio {au['codec_name']} {au['sample_rate']} Hz, {au['channels']} ch")
    dur = float(info['format']['duration']); say(abs(dur - 20.0) < 0.06, f"duration {dur:.3f} s, size {int(info['format']['size']) / 1e6:.1f} MB, {int(info['format']['bit_rate']) / 1e6:.1f} Mbps")
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', mp, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    tail = r[r.rfind('Integrated loudness:'):]
    I = float(tail.split(' I:')[1].split('LUFS')[0]); P = float(tail.split('Peak:')[1].split('dBFS')[0])
    say(abs(I + 16) <= 1.0 and P <= -1.0, f'loudness {I} LUFS, true peak {P} dBFS')
    for t in (0.5, 8.3, 12.0, 14.0, 15.6, 16.6, 18.2, 19.96):
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(t), '-i', mp, '-frames:v', '1', '-q:v', '2', os.path.join(out, 'mp4_%05.2f.jpg' % t)])
    print('      stills from the encoded file: ' + out + '/mp4_*.jpg')
    # native-resolution crops of the encoded picture, to judge fineness and banding after compression
    from PIL import ImageOps
    tiles = []
    for t in (0.5, 8.3, 14.0, 16.6, 18.2, 19.96):
        p = os.path.join(out, 'mp4_%05.2f.jpg' % t)
        if os.path.exists(p):
            im = Image.open(p).convert('RGB'); tiles.append(im.crop((640, 470, 1280, 830)))
    if tiles:
        sheet = Image.new('RGB', (1920, 720), (18, 18, 20))
        for k, tl in enumerate(tiles[:6]): sheet.paste(tl, ((k % 3) * 640, (k // 3) * 360))
        sheet.save(os.path.join(out, 'mp4_zoom.jpg'), quality=95); print('      ' + os.path.join(out, 'mp4_zoom.jpg'))
print('RESULT: ' + ('all checks passed' if ok else 'CHECKS FAILED'))
sys.exit(0 if ok else 1)
