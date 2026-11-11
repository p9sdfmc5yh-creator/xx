# -*- coding: utf-8 -*-
"""Version A at 1920x1080 - vintage plate look: every 3D still on tinted vintage paper, ink text,
white paper first / last pages, clean warm finishing.  Uses the best still available per shot
(1080p-native final > 4K final > newest valid preview); shots without any new still fall back to
the original film frames so the cut is always complete.

    python build_a_1080.py shots  -> contact sheet of every shot   ;  python build_a_1080.py build OUT.mp4
"""
import sys, os, json, glob, subprocess, colorsys, numpy as np, cv2
from multiprocessing import Pool
S = '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
R = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, R + '/compose')
import text as T, retro as RT
W, H = 1920, 1080
SH = json.load(open(R + '/shots.json'))['shots']
SKIP = set(filter(None, os.environ.get('WIP_SKIP', '').split(',')))
INK = np.array([0.115, 0.092, 0.075], np.float32)

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)

def framing_ok(a):
    h, w = a.shape
    col = a[:, w // 2 - w // 50:w // 2 + w // 50].max(axis=1); ys = np.where(col > 0.5)[0]
    if len(ys) == 0: return False
    return 0.47 <= ys[0] / h <= 0.60 and a[-1].mean() > 0.97 and a[:int(0.45 * h), int(0.2 * w):int(0.8 * w)].max() < 0.05

def script_of(sid):
    p = R + f'/blender/shots/{sid}.py'
    if sid == 'm03_dazao' and os.path.exists(p) and 'pack_heap' not in open(p).read(): return R + '/blender/shots/m03_dazao_pile.py'
    return p

def pick_still(sid):
    from PIL import Image
    def w_of(p):
        try: return Image.open(p).size[0]
        except Exception: return 0
    sc = script_of(sid); st = os.path.getmtime(sc) if os.path.exists(sc) else 0
    allc = sorted(set(glob.glob(f'{S}/tmp_{sid}/*.png') + glob.glob(f'{S}/previews/{sid}*.png')), key=os.path.getmtime, reverse=True)
    if sid == 'm03_dazao' and sc.endswith('_pile.py'): allc = [p for p in allc if 'pile' in os.path.basename(p)]
    cands = [p for p in (R + f'/renders_hd/{sid}.png', R + f'/renders/{sid}.png') if os.path.exists(p) and os.path.getmtime(p) >= st - 1]
    cands += [p for p in allc if w_of(p) >= 1280] + [p for p in allc if 960 <= w_of(p) < 1280]
    for p in cands:
        im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if im is None or im.ndim != 3 or im.shape[2] != 4: continue
        h, w = im.shape[:2]
        if w < 960 or abs(w / h - 16 / 9) > 0.01: continue
        mx = 65535.0 if im.dtype == np.uint16 else 255.0
        a = im[..., 3].astype(np.float32) / mx
        if not framing_ok(a): continue
        im = cv2.resize(im.astype(np.float32) / mx, (W, H), interpolation=cv2.INTER_AREA if w > W else cv2.INTER_LANCZOS4)
        return p, np.clip(im[..., 2::-1], 0, 1), np.clip(im[..., 3], 0, 1)
    return None, None, None

def orig(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg')[..., ::-1].astype(np.float32) / 255.0

def paper_tint_for(sky):
    c = sky[:int(0.40 * H)].reshape(-1, 3).mean(0); h, s, v = colorsys.rgb_to_hsv(*[float(t) for t in c])
    if s < 0.12 or v < 0.06: h, s2 = 0.09, 0.20                 # neutral / black skies -> warm kraft
    else: s2 = min(max(s * 0.42, 0.13), 0.29)                    # muted, aged card-stock colours
    return np.array(colorsys.hsv_to_rgb(h, s2, 0.84 if v < 0.6 else 0.92), np.float32)

_FILL = None
def put_text(img, f, dark_fill=False):
    """Every text element as dark ink where it sits on light paper, in its original white-with-halo
    style where it sits on a dark / busy foreground (decided per element from the picture under it)."""
    global _FILL
    if _FILL is None:
        _FILL = {e['id']: (sum(T.element_style(e).get('fill', [255, 255, 255])) / 3.0 < 128) for e in T.load_timeline()['elements']}
    out = img.astype(np.float32).copy()
    for rgba, x0, y0, op, eid in T.frame_layers(f, scale=1):
        c = T._clip(rgba, x0, y0, W, H)
        if c is None: continue
        crop, cx0, cy0 = c; h, w = crop.shape[:2]
        reg = out[cy0:cy0 + h, cx0:cx0 + w]
        a = crop[..., 3:4] * op
        lum = crop[..., :3].mean(-1, keepdims=True)
        fillm = np.clip((0.75 - lum) / 0.5, 0, 1) if _FILL.get(eid) else np.clip((lum - 0.25) / 0.6, 0, 1)
        cov = crop[..., 3] * fillm[..., 0]
        under = float((reg.mean(-1) * cov).sum() / max(float(cov.sum()), 1e-6))
        if under > 0.45:
            ink = np.clip(a * fillm, 0, 1) * 0.94
            reg[:] = reg * (1 - ink) + INK * ink
        else:
            if _FILL.get(eid):      # dark-fill element on a dark ground: draw it light instead
                ink = np.clip(a * fillm, 0, 1)
                reg[:] = reg * (1 - ink) + np.array([0.97, 0.95, 0.90], np.float32) * ink
            else:
                reg[:] = reg * (1 - a) + crop[..., :3] * a
    return out

_cache = {}
def shot_assets(s):
    sid = s['id']
    if sid in _cache: return _cache[sid]
    out = None
    if sid not in SKIP:
        p, rgb, a = pick_still(sid)
        if p is not None:
            import backdrops as B
            sky = B.sky_plate(sid, (s['start'] + s['end']) // 2, scale=1).astype(np.float32)
            out = (p, rgb, a, RT.tinted_paper(paper_tint_for(sky)))
    _cache[sid] = out
    return out

def frame_raw(f):
    for s in SH:
        if s['start'] <= f < s['end']:
            A = shot_assets(s)
            if A is None: return np.clip(orig(f), 0, 1)
            p, rgb, a, paper = A
            n = s['end'] - s['start']; z = 1.0 + {8: 0.012, 16: 0.02, 64: 0.05}.get(n, 0.02) * (f - s['start']) / max(n - 1, 1)
            M = np.float32([[z, 0, W / 2 * (1 - z)], [0, z, 0.53 * H * (1 - z)]])
            rgbz = cv2.warpAffine(rgb, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
            az = np.clip(cv2.warpAffine(a, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE), 0, 1)
            occ = (np.clip(cv2.GaussianBlur(az, (0, 0), 30) * 1.25, 0, 1) * (1 - az))[..., None]      # soft contact shadow on the paper
            pg = paper * (1 - 0.20 * occ)
            comp = lin2srgb(srgb2lin(np.clip(rgbz, 0, 1)) * az[..., None] + srgb2lin(pg) * (1 - az[..., None]))
            return put_text(comp, f, dark_fill=(s.get('text') == 'dark'))
    if 192 <= f < 256:                                             # yin-yang, inverted onto cream paper
        import backdrops as B
        lum = np.clip(B.backdrop(f, scale=1).mean(-1, keepdims=True), 0, 1).astype(np.float32)
        paper = RT.tinted_paper((0.93, 0.90, 0.83))
        pg = paper * (1 - lum) + np.array([0.17, 0.145, 0.13], np.float32) * (0.9 + 0.1 * paper) * lum
        return put_text(pg, f)
    seg0, seg1 = (0, 192) if f < 192 else (736, 1248)              # white first / last pages
    z = 1.0 + 0.035 * (f - seg0) / (seg1 - seg0)
    pg = cv2.warpAffine(RT.paper_white(1), np.float32([[z, 0, W / 2 * (1 - z)], [0, z, H / 2 * (1 - z)]]), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return put_text(pg, f)

def frame(f):
    x = RT.retro(frame_raw(f).astype(np.float32), f, 1) * float(T.global_fade(f))
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'shots':
        fs = [60, 170, 224] + [(s['start'] + s['end']) // 2 for s in SH] + [800, 1000, 1200]
        tiles = []
        for f in fs:
            t = cv2.resize(frame(f), (480, 270), interpolation=cv2.INTER_AREA)
            sh = [s for s in SH if s['start'] <= f < s['end']]
            tag = ('f%d' % f) if not sh else sh[0]['id'] + (' NEW ' + os.path.basename(shot_assets(sh[0])[0])[:16] if shot_assets(sh[0]) else ' (orig)')
            cv2.putText(t, tag, (5, 262), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 255), 1); tiles.append(t)
        while len(tiles) % 7: tiles.append(np.zeros((270, 480, 3), np.uint8))
        cv2.imwrite(S + '/wip/a_sheet.jpg', np.vstack([np.hstack(tiles[i:i + 7]) for i in range(0, len(tiles), 7)])[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 86]); print('sheet ok')
    else:
        out = sys.argv[2]
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30', '-i', '-', '-i', S + '/work/audio_orig.m4a', '-map', '0:v', '-map', '1:a', '-frames:v', '1248', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-maxrate', '20M', '-bufsize', '40M', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'copy', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
        with Pool(4) as pool:
            for i, fr in enumerate(pool.imap(frame, range(1248), chunksize=8)):
                ff.stdin.write(fr.tobytes())
                if i % 200 == 0: print('frame', i, flush=True)
        ff.stdin.close(); ff.wait(); print('done', out)
