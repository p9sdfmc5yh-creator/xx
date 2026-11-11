#!/usr/bin/env python3
"""compare.py — put the reference film next to our render of the same shot.

  python3 tools/compare.py --dir build/coins/preview s05 [s06 ...]

Reads  <dir>/<id>_tmp-start.jpg, <id>_mid.jpg, <id>_tmp-end.jpg  (written by tools/preview.js)
and    build/ref/trio/ref_<id>_{a,b,c}.jpg   (first / middle / last frame of the same shot in the reference film;
       override the folder with GJ_REF_DIR)
Writes <dir>/<id>_compare.jpg (1920x846):
       top row     reference middle frame | our middle frame      (960x540 each)
       bottom row  reference first, last  | our first, last       (480x270 each)
The reference stills are third-party material kept outside git (build/ is ignored); without them the tool does nothing.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.environ.get('GJ_REF_DIR', os.path.join(ROOT, 'build', 'ref', 'trio'))


def font(size):
    for f in ('NotoSerifSC-VF.ttf', 'NotoSerifSC[wght].ttf', 'NotoSerifSC-Regular.ttf'):
        p = os.path.join(ROOT, 'assets', 'fonts', f)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    d = os.path.join(ROOT, 'assets', 'fonts')
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.lower().startswith('notoserifsc'):
                try:
                    return ImageFont.truetype(os.path.join(d, f), size)
                except Exception:
                    pass
    return ImageFont.load_default()


def fit(path, w, h):
    return Image.open(path).convert('RGB').resize((w, h), Image.LANCZOS)


def compare(d, sid, label=''):
    ref = [os.path.join(REF, f'ref_{sid}_{t}.jpg') for t in 'abc']
    ours = [os.path.join(d, f'{sid}_tmp-start.jpg'), os.path.join(d, f'{sid}_mid.jpg'), os.path.join(d, f'{sid}_tmp-end.jpg')]
    if not all(os.path.exists(p) for p in ref + ours):
        return None
    HEAD = 36
    out = Image.new('RGB', (1920, HEAD + 540 + 270), (18, 18, 20))
    out.paste(fit(ref[1], 960, 540), (0, HEAD))
    out.paste(fit(ours[1], 960, 540), (960, HEAD))
    out.paste(fit(ref[0], 480, 270), (0, HEAD + 540))
    out.paste(fit(ref[2], 480, 270), (480, HEAD + 540))
    out.paste(fit(ours[0], 480, 270), (960, HEAD + 540))
    out.paste(fit(ours[2], 480, 270), (1440, HEAD + 540))
    dr = ImageDraw.Draw(out)
    dr.rectangle([958, 0, 961, out.height], fill=(255, 0, 170))
    f = font(22)
    dr.text((14, 5), '参考片 · 同一镜头（上：中间帧　下：首帧 / 末帧）', font=f, fill=(235, 235, 235))
    dr.text((974, 5), f'我们的画面 · {label}{sid}（上：中间帧　下：首帧 / 末帧）', font=f, fill=(235, 235, 235))
    p = os.path.join(d, f'{sid}_compare.jpg')
    out.save(p, quality=90)
    return p


def zoom(d, sid, label=''):
    """three native-resolution (1:1) crops of our middle frame → <dir>/<id>_zoom.jpg (1920x396): the place to judge fineness"""
    mid = os.path.join(d, f'{sid}_mid.jpg')
    if not os.path.exists(mid):
        return None
    im = Image.open(mid).convert('RGB')
    boxes = [('弧顶正中', 640, 450), ('左下', 120, 640), ('右侧', 1160, 560)]
    HEAD = 36
    out = Image.new('RGB', (1920, HEAD + 360), (18, 18, 20))
    dr = ImageDraw.Draw(out)
    f = font(22)
    for k, (name, x, y) in enumerate(boxes):
        out.paste(im.crop((x, y, x + 640, y + 360)), (k * 640, HEAD))
        dr.text((k * 640 + 12, 5), f'{label}{sid} 原始像素 1:1 · {name}', font=f, fill=(235, 235, 235))
        if k:
            dr.rectangle([k * 640 - 1, 0, k * 640, out.height], fill=(255, 0, 170))
    p = os.path.join(d, f'{sid}_zoom.jpg')
    out.save(p, quality=95)
    return p


def tri(d, sid, before, label=''):
    """reference middle frame | before | after (= <dir>/<id>_mid.jpg), 640x360 each → <dir>/<id>_tri.jpg"""
    ref = os.path.join(REF, f'ref_{sid}_b.jpg')
    after = os.path.join(d, f'{sid}_mid.jpg')
    if not all(os.path.exists(p) for p in (ref, before, after)):
        return None
    HEAD = 36
    out = Image.new('RGB', (1920, HEAD + 360), (18, 18, 20))
    f = font(22)
    dr = ImageDraw.Draw(out)
    for k, (path, name) in enumerate(((ref, '参考片 · 同一镜头'), (before, f'打磨前 · {label}{sid}'), (after, f'打磨后（现在）· {label}{sid}'))):
        out.paste(fit(path, 640, 360), (k * 640, HEAD))
        dr.text((k * 640 + 12, 5), name, font=f, fill=(235, 235, 235))
        if k:
            dr.rectangle([k * 640 - 1, 0, k * 640 + 1, out.height], fill=(255, 0, 170))
    p = os.path.join(d, f'{sid}_tri.jpg')
    out.save(p, quality=90)
    return p


if __name__ == '__main__':
    if '--tri' in sys.argv:
        # python3 tools/compare.py --tri s05 --before build/arch/review/s05_before_mid.jpg --dir build/preview [--label arch]
        a = sys.argv[1:]
        print(tri(a[a.index('--dir') + 1], a[a.index('--tri') + 1], a[a.index('--before') + 1], (a[a.index('--label') + 1] + ' ') if '--label' in a else '') or '')
        sys.exit(0)
    a = sys.argv[1:]
    d = a[a.index('--dir') + 1]
    label = a[a.index('--label') + 1] + ' ' if '--label' in a else ''
    skip = {a.index('--dir'), a.index('--dir') + 1}
    if '--label' in a:
        skip |= {a.index('--label'), a.index('--label') + 1}
    for i, sid in enumerate(a):
        if i in skip:
            continue
        p = compare(d, sid, label)
        print(p or '')
        z = zoom(d, sid, label)
        print('ZOOM ' + z if z else '')
