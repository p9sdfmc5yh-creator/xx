# -*- coding: utf-8 -*-
"""Version A at 1920x1080 - vintage plate look: every 3D still on aged card stock, ink titles,
white paper first / last pages, clean warm finishing.  Uses the best still available per shot
(1080p-native final > 4K final > newest valid preview); a shot without any new still falls back to
the original film frames so the cut is always complete.

    python build_a_1080.py shots            -> contact sheet of every shot (scratch/wip/a_sheet.jpg)
    python build_a_1080.py build OUT.mp4    -> the film (1248 frames, original audio)
"""
import sys, os, json, glob, subprocess, numpy as np, cv2
from multiprocessing import Pool
S = '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
R = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, R + '/compose')
import text as T, retro as RT
W, H = 1920, 1080
SH = json.load(open(R + '/shots.json'))['shots']
SKIP = set(filter(None, os.environ.get('WIP_SKIP', '').split(',')))
INK = np.array([0.115, 0.092, 0.075], np.float32)
PAGE_WHITE = np.array([0.974, 0.970, 0.958], np.float32)          # first / last pages: white paper
PILE = ('m03_dazao', 'm01_shanyao', 'k13_luohanguo')              # shots rebuilt as mounds of loose items

# Aged card-stock colour per shot (sRGB), chosen for contrast with the ingredient: pale ingredients on
# mid-tones, dark ingredients on pale stock; all muted and warm-leaning like old printed plates.
CARD = {
    's02_cabinet': (0.90, 0.86, 0.78), 's03_millet': (0.70, 0.76, 0.78), 's04_bowl': (0.86, 0.74, 0.69),
    'm01_shanyao': (0.78, 0.71, 0.63), 'm02_gouqi': (0.93, 0.89, 0.80), 'm03_dazao': (0.92, 0.88, 0.79),
    'm04_shengjiang': (0.69, 0.75, 0.81), 'm05_jupi': (0.76, 0.80, 0.70), 'm06_lianzi': (0.84, 0.70, 0.68),
    'm07_baihe': (0.74, 0.69, 0.77), 'm08_shanzha': (0.90, 0.82, 0.64), 'm09_juhua': (0.62, 0.69, 0.77),
    'm10_fengmi': (0.80, 0.84, 0.76), 'k01_fuling': (0.74, 0.68, 0.62), 'k02_yiyiren': (0.62, 0.75, 0.74),
    'k03_guiyuan': (0.86, 0.72, 0.70), 'k04_heizhima': (0.93, 0.90, 0.82), 'k05_bohe': (0.93, 0.90, 0.80),
    'k06_sangshen': (0.90, 0.80, 0.84), 'k07_chixiaodou': (0.88, 0.82, 0.70), 'k08_heye': (0.86, 0.79, 0.66),
    'k09_gancao': (0.80, 0.67, 0.60), 'k10_jianghuang': (0.66, 0.73, 0.82), 'k11_shaji': (0.72, 0.80, 0.72),
    'k12_juemingzi': (0.88, 0.89, 0.80), 'k13_luohanguo': (0.74, 0.79, 0.72), 'k14_rougui': (0.70, 0.75, 0.80),
    'k15_qianshi': (0.68, 0.74, 0.80), 'k16_lingzhi': (0.72, 0.77, 0.71),
}
# Per-shot finishing of the still: lift = brighten without clipping (1 = none), gamma < 1 opens shadows,
# sat = saturation, dy = shift down in pixels (keeps the title clear of the heap).
ADJ = {        # applied to any still of the shot
    'k06_sangshen': dict(lift=1.9, gamma=0.86), 'm09_juhua': dict(lift=1.55), 'm08_shanzha': dict(lift=1.30, sat=1.08),
    'm06_lianzi': dict(lift=1.15), 'm05_jupi': dict(sat=1.15, lift=1.08),
}
ADJ_PREVIEW = {  # only while the shot still comes from an old preview render (re-rendered stills fix these in 3D)
    'k05_bohe': dict(gamma=0.80, lift=1.10), 'm05_jupi': dict(dy=38, sat=1.18, lift=1.10), 'm03_dazao': dict(lift=1.25, sat=1.08),
}

def framing_ok(a):
    h, w = a.shape
    col = a[:, w // 2 - w // 50:w // 2 + w // 50].max(axis=1); ys = np.where(col > 0.5)[0]
    if len(ys) == 0: return False
    return 0.47 <= ys[0] / h <= 0.60 and a[-1].mean() > 0.97 and a[:int(0.45 * h), int(0.2 * w):int(0.8 * w)].max() < 0.05

def is_pile(sid):
    if sid == 'm03_dazao':
        p = R + '/blender/shots/m03_dazao.py'
        return not (os.path.exists(p) and 'pack_heap' in open(p).read())
    return sid in PILE

def script_mtime(sid):
    ps = [R + f'/blender/shots/{sid}.py'] + ([R + '/blender/shots/pile_from_items.py'] if is_pile(sid) else [])
    return max([os.path.getmtime(p) for p in ps if os.path.exists(p)] or [0])

def adjust(rgb, a, adj):
    """rgb straight sRGB 0..1"""
    if not adj: return rgb
    x = rgb
    if adj.get('gamma'): x = np.clip(x, 0, 1) ** adj['gamma']
    if adj.get('lift'): x = 1.0 - (1.0 - np.clip(x, 0, 1)) ** adj['lift']
    if adj.get('sat'):
        l = (x * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1, keepdims=True)
        x = np.clip(l + (x - l) * adj['sat'], 0, 1)
    return x.astype(np.float32)

def pick_still(sid):
    """-> (path, premultiplied rgb, alpha) at 1920x1080, or (None, None, None)"""
    from PIL import Image
    def w_of(p):
        try: return Image.open(p).size[0]
        except Exception: return 0
    st = script_mtime(sid)
    allc = sorted(set(glob.glob(f'{S}/tmp_{sid}/*.png') + glob.glob(f'{S}/previews/{sid}*.png')), key=os.path.getmtime, reverse=True)
    if is_pile(sid):                                             # prefer mound renders; keep the old still only as a last resort
        pile_c = [p for p in allc if 'pile' in os.path.basename(p)]
        allc = pile_c or allc
    hd, k4 = R + f'/renders_hd/{sid}.png', R + f'/renders/{sid}.png'
    cands = [hd] if os.path.exists(hd) and os.path.getmtime(hd) >= st - 1 else []
    if os.path.exists(k4) and not is_pile(sid) and (os.path.getmtime(k4) >= st - 1 or sid in ('m02_gouqi', 's02_cabinet')): cands.append(k4)
    if os.path.exists(hd) and hd not in cands: cands.append(hd)                    # slightly stale 1080p still beats a preview
    cands += [p for p in allc if w_of(p) >= 1280] + [p for p in allc if 960 <= w_of(p) < 1280]
    for p in cands:
        im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if im is None or im.ndim != 3 or im.shape[2] != 4: continue
        h, w = im.shape[:2]
        if w < 960 or abs(w / h - 16 / 9) > 0.01: continue
        mx = 65535.0 if im.dtype == np.uint16 else 255.0
        f = im.astype(np.float32) / mx
        a = f[..., 3]
        if not framing_ok(a): continue
        native = '/renders_hd/' in p or '/renders/' in p
        adj = ADJ.get(sid) if native else (ADJ_PREVIEW.get(sid) or ADJ.get(sid))
        rgb = adjust(f[..., 2::-1], a, adj)
        pm = np.dstack([rgb * a[..., None], a])                                      # premultiply BEFORE any resampling
        pm = cv2.resize(pm, (W, H), interpolation=cv2.INTER_AREA if w > W else cv2.INTER_LANCZOS4)
        dy = (adj or {}).get('dy', 0)
        if dy: pm = cv2.warpAffine(pm, np.float32([[1, 0, 0], [0, 1, dy]]), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        a2 = np.clip(pm[..., 3], 0, 1)
        return p, np.clip(pm[..., :3], 0, 1) * (a2[..., None] > 0), a2
    return None, None, None

def orig(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg')[..., ::-1].astype(np.float32) / 255.0

_FILL = None
_SMALL = None
def put_text(img, f):
    """Every text element as dark ink where it sits on light paper, in its white-with-halo style (plus a
    soft dark backing) where it sits on a dark / busy foreground - decided per element from the picture."""
    global _FILL, _SMALL
    if _FILL is None:
        els = T.load_timeline()['elements']
        _FILL = {e['id']: (sum(T.element_style(e).get('fill', [255, 255, 255])) / 3.0 < 128) for e in els}
        _SMALL = {e['id']: (T.element_style(e).get('size', 100) <= 50 and T.element_style(e).get('anchor', [0, 0])[1] > 0.8 * H) for e in els}
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
        csum = max(float(cov.sum()), 1e-6); rl = reg.mean(-1)
        under = float((rl * cov).sum() / csum)
        std = float(np.sqrt(((rl - under) ** 2 * cov).sum() / csum))
        small = _SMALL.get(eid)
        if (under > 0.58 and std < 0.06) if small else (under > 0.45):                       # plain light paper -> ink
            ink = np.clip(a * fillm, 0, 1) * 0.94
            reg[:] = reg * (1 - ink) + INK * ink
        else:                                                       # on the object -> light text with a soft dark backing
            g = np.clip(a * fillm, 0, 1)
            back = cv2.GaussianBlur(g[..., 0], (0, 0), 9 if small else 14)[..., None]
            back = np.clip(back * (2.6 if small else 1.6), 0, 1) * (0.62 if small else 0.45)
            reg[:] = reg * (1 - back)
            reg[:] = reg * (1 - g) + np.array([0.985, 0.975, 0.945], np.float32) * g
    return out

_cache = {}
def shot_assets(s):
    sid = s['id']
    if sid in _cache: return _cache[sid]
    out = None
    if sid not in SKIP:
        p, pm, a = pick_still(sid)
        if p is not None:
            out = (p, pm, a, RT.tinted_paper(CARD.get(sid, (0.90, 0.86, 0.78))))
    _cache[sid] = out
    return out

def frame_raw(f):
    for s in SH:
        if s['start'] <= f < s['end']:
            A = shot_assets(s)
            if A is None: return np.clip(orig(f), 0, 1)
            p, pm, a, paper = A
            n = s['end'] - s['start']; z = 1.0 + {8: 0.012, 16: 0.02, 64: 0.05}.get(n, 0.02) * (f - s['start']) / max(n - 1, 1)
            M = np.float32([[z, 0, W / 2 * (1 - z)], [0, z, 0.53 * H * (1 - z)]])
            q = cv2.warpAffine(np.dstack([pm, a]), M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
            az = np.clip(q[..., 3], 0, 1)
            occ = (np.clip(cv2.GaussianBlur(az, (0, 0), 30) * 1.25, 0, 1) * (1 - az))[..., None]      # soft contact shadow
            pg = paper * (1 - 0.20 * occ)
            comp = np.clip(q[..., :3], 0, 1) + pg * (1 - az[..., None])                                  # premultiplied over
            return put_text(comp, f)
    if 192 <= f < 256:                                             # yin-yang, inverted onto cream paper as an ink wash
        import backdrops as B
        lum = B.backdrop(f, scale=1).mean(-1, keepdims=True).astype(np.float32)
        m = np.clip((lum - 0.10) / 0.45, 0, 1); m = m * m * (3 - 2 * m)                                  # flat dome, no inverted vignette
        paper = RT.tinted_paper((0.93, 0.90, 0.83))
        wash = np.array([0.20, 0.165, 0.14], np.float32) * (0.80 + 0.25 * paper / paper.mean())
        return put_text(paper * (1 - m) + wash * m, f)
    seg0, seg1 = (0, 192) if f < 192 else (736, 1248)              # white first / last pages
    z = 1.0 + 0.035 * (f - seg0) / (seg1 - seg0)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    pw = RT.paper_white(1) + (0.075 * np.clip(rr - 0.55, 0, None) ** 2)[..., None]
    pw = np.clip(pw / pw.mean(axis=(0, 1), keepdims=True) * PAGE_WHITE, 0, 1)
    pg = cv2.warpAffine(pw, np.float32([[z, 0, W / 2 * (1 - z)], [0, z, H / 2 * (1 - z)]]), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return put_text(pg, f)

def frame(f):
    page = f < 192 or f >= 736
    x = RT.retro(frame_raw(f).astype(np.float32), f, 1, strength=0.22 if page else 1.0) * float(T.global_fade(f))
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'shots':
        fs = [60, 170, 224] + [(s['start'] + s['end']) // 2 for s in SH] + [800, 1000, 1200]
        tiles = []
        for f in fs:
            t = cv2.resize(frame(f), (480, 270), interpolation=cv2.INTER_AREA)
            sh = [s for s in SH if s['start'] <= f < s['end']]
            if sh:
                A = shot_assets(sh[0])
                tag = sh[0]['id'][:4] + (' ' + A[0].replace(R, '').replace(S, '')[-26:] if A else ' (ORIG)')
            else: tag = 'f%d' % f
            cv2.putText(t, tag, (5, 262), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 0, 255), 1); tiles.append(t)
        while len(tiles) % 7: tiles.append(np.zeros((270, 480, 3), np.uint8))
        cv2.imwrite(S + '/wip/a_sheet.jpg', np.vstack([np.hstack(tiles[i:i + 7]) for i in range(0, len(tiles), 7)])[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 86]); print('sheet ok')
    else:
        out = sys.argv[2]
        for s_ in SH:
            A = shot_assets(s_)
            print('%-16s %s' % (s_['id'], A[0].replace(R, '').replace(S, 'S') if A else 'ORIGINAL FRAMES'), flush=True)
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30', '-i', '-', '-i', S + '/work/audio_orig.m4a', '-map', '0:v', '-map', '1:a', '-frames:v', '1248', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-maxrate', '24M', '-bufsize', '48M', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'copy', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
        with Pool(4) as pool:
            for i, fr in enumerate(pool.imap(frame, range(1248), chunksize=8)):
                ff.stdin.write(fr.tobytes())
                if i % 200 == 0: print('frame', i, flush=True)
        ff.stdin.close(); ff.wait(); print('done', out)
