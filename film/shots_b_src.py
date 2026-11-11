# -*- coding: utf-8 -*-
"""Master shot table of VERSION B (top-down specimen plates / ingredient typography) of 《药食同源》.
Run this file to (re)generate film/shots_b.json.  Same timeline, audio and cut grid as version A
(film/shots.json): 1248 frames @ 30 fps; every start/end below is a cut of the original film.

Scene keys
  id, start, end      frame range [start, end)
  layout              wreath | glyph | landing | taiji | dishes | bespoke   (film/blender/flatlay.py)
  text                glyph string poured from the ingredient (glyph / landing), else null
  label               what the 2-D text layer writes over the plate (information for the compositor)
  source              ingredient module id(s) in film/blender/shots/ (make_items)
  ground              {type: paper|slate|walnut|linen, colour: DISPLAY sRGB 0-255 of the lit ground,
                       grid: {type, pitch_m, line_m, colour, opacity, major}, fibres, cloud, ...}
  frame_width_m       physical width of the frame on the ground, chosen for the ingredient
  item_mm / item_w_mm assumed length / width of one item the width was chosen for (flatlay rescales the
                       frame when the real module differs by more than 15 %; lock_width: true disables it)
  seed                layout + paper seed
  text_mode           'light' = white overlay text (dark ground), 'dark' = dark-ink overlay text (pale ground)
  exposure            stops; pale grounds need ~ +0.9 to render as pale paper under AgX Punchy
  final_res           final render size (b00-b04 are rendered 5 % oversize for the slow push-in)
  params              layout parameters (see README_B.md)
"""
import json, os

FPS, W, H, NFRAMES = 30, 3840, 2160, 1248
FONT = 'NotoSansCJKsc-Black.otf'

# stroke width of a single glyph in NotoSans Black at height 0.72 H = 0.0543 x frame width (measured on 药),
# so   frame_width = n_item_widths * item_width / 0.0543 / (1 - thin)
GLYPH_K = 0.0543


def paper(colour, **kw):
    d = dict(type='paper', colour=list(colour))
    d.update(kw)
    return d


CREAM = (214, 203, 178)
CINNABAR_INK = (176, 44, 30)

SCENES = []

# ----------------------------------------------------------------------------- long scenes (4032 x 2268)
SCENES += [
 dict(id='b00_intro', start=0, end=192, layout='wreath', text=None, label='药食同源 / 中医药 (dark ink title cards)',
      source=['m02_gouqi', 'm03_dazao', 'm08_shanzha', 'm09_juhua', 'm06_lianzi', 'm07_baihe', 'm05_jupi', 'k03_guiyuan',
              'k14_rougui', 'm04_shengjiang', 'k07_chixiaodou', 'k15_qianshi'],
      optional_sources=True,
      ground=paper(CREAM, grid=dict(type='square', pitch_m=0.0225, line_m=0.0006, colour=CINNABAR_INK, opacity=0.80, major=0),
                   fibres=1.2, cloud=0.05),
      frame_width_m=0.90, item_mm=None, lock_width=True, seed=11, text_mode='dark', exposure=0.9, final_res=[4032, 2268],
      params=dict(window=[0.50, 0.535, 0.62, 0.50], layers=2.0, reach=0.55, rough=0.14, strays=14, mix='patches'),
      note='cream xuan with a cinnabar printed grid; loose wreath of every available ingredient in patches; the '
           'centre (title 196 px + three lines, y 0.33-0.75 H, <= 0.50 W wide) stays clear'),
 dict(id='b01_yinyang', start=192, end=256, layout='taiji', text=None, label='阴阳平衡 (white, above)',
      source=['k04_heizhima', 'k02_yiyiren'],
      ground=dict(type='slate', colour=[38, 42, 48]),
      frame_width_m=0.46, item_mm=[3.0, 6.0], seed=12, text_mode='light', exposure=0.0, final_res=[4032, 2268],
      params=dict(centre=[0.50, 0.72], diameter=0.50, dot=0.20, layers=3),
      note='yin = black sesame, yang = white coix seed, two opposite eyes; text zone above y 0.45 H is bare slate'),
 dict(id='b02_cabinet', start=256, end=320, layout='bespoke', script='flatlay_b02_cabinet.py', text=None,
      label='四气 · 五味 (white, upper 42 %)', source=['s02_cabinet'], ground=dict(type='none'),
      frame_width_m=1.60, seed=13, text_mode='light', exposure=0.0, final_res=[4032, 2268],
      params=dict(dark_above=0.42),
      note='frontal drawer grid from the assets of s02_cabinet.py; upper 42 % falls into darkness (NOT BUILT YET)'),
 dict(id='b03_grains', start=320, end=384, layout='dishes', text=None, label='五谷为养 ... (white, above)',
      source=['s03_millet', 'k02_yiyiren', 'k07_chixiaodou', 'k04_heizhima', 'm06_lianzi'],
      ground=dict(type='walnut', colour=[58, 36, 22]),
      frame_width_m=0.60, item_mm=[1.6, 6.0, 7.0, 3.0, 14.0], seed=14, text_mode='light', exposure=0.0, final_res=[4032, 2268],
      params=dict(centre_v=0.72, dish=0.150, pitch=0.180, kinds=['wood', 'celadon', 'wood', 'celadon', 'wood'], heap=0.30, fill=0.80),
      note='five 90 mm dishes (turned wood / celadon) heaped with millet, coix seed, adzuki bean, black sesame, lotus seed'),
 dict(id='b04_bowl', start=384, end=448, layout='bespoke', script='flatlay_b04_bowl.py', text=None,
      label='药食同源 / 既是食品，又是中药材 (white, above)', source=['s04_bowl'],
      ground=dict(type='linen', colour=[22, 34, 66]),
      frame_width_m=0.62, seed=15, text_mode='light', exposure=0.0, final_res=[4032, 2268],
      params=dict(centre=[0.50, 0.74], diameter=0.62),
      note='top-down blue-and-white bowl, amber broth, floating goji, on indigo linen (NOT BUILT YET; linen ground exists)'),
]

# ----------------------------------------------------------------------------- 16-frame wreaths
#   id-suffix, source, label, ground display colour, text mode, item length mm, frame width m
WREATHS = [
 ('b05', 'm01_shanyao',    '山药',   (18, 74, 72),    'light', 35, 0.80),
 ('b06', 'm02_gouqi',      '枸杞子', (36, 15, 11),    'light', 14, 0.34),
 ('b07', 'm03_dazao',      '大枣',   (214, 201, 174), 'dark',  32, 0.72),
 ('b08', 'm04_shengjiang', '生姜',   (30, 60, 96),    'light', 35, 0.80),
 ('b09', 'm05_jupi',       '橘皮',   (27, 23, 20),    'light', 45, 1.00),
 ('b10', 'm06_lianzi',     '莲子',   (112, 50, 78),   'light', 14, 0.34),
 ('b11', 'm07_baihe',      '百合',   (44, 27, 72),    'light', 30, 0.66),
 ('b12', 'm08_shanzha',    '山楂',   (16, 46, 28),    'light', 20, 0.46),
 ('b13', 'm09_juhua',      '菊花',   (24, 31, 70),    'light', 25, 0.56),
 ('b14', 'm10_fengmi',     '蜂蜜',   (40, 22, 8),     'light', 35, 0.80),
]
for i, (bid, src, label, col, tm, mm, wm) in enumerate(WREATHS):
    SCENES.append(dict(
        id='%s_%s' % (bid, src.split('_')[1]), start=448 + 16 * i, end=464 + 16 * i, layout='wreath', text=None, label=label,
        source=[src], ground=paper(col, fibres=1.0, cloud=0.08 if tm == 'light' else 0.05),
        frame_width_m=wm, item_mm=mm, seed=20 + i, text_mode=tm, exposure=0.9 if tm == 'dark' else 0.0,
        params=dict(window=[0.50, 0.42, 0.46, 0.30], layers=2.4, reach=0.55, rough=0.16, strays=9)))

# ----------------------------------------------------------------------------- 8-frame glyphs
#   id, source, small label, glyph, ground, text mode, assumed item (length, width) mm, strokes in item widths
GLYPHS = [
 ('b15', 'k01_fuling',     '茯苓',   '药', (36, 38, 44),    'light', (10, 10),  3.0, None),
 ('b16', 'k02_yiyiren',    '薏苡仁', '药', (18, 76, 78),    'light', (6, 5),    5.0, None),
 ('b17', 'k03_guiyuan',    '桂圆',   '药', (52, 17, 11),    'light', (22, 22),  2.5, None),
 ('b18', 'k04_heizhima',   '黑芝麻', '药', (214, 203, 178), 'dark',  (3, 1.8),  8.0, None),
 ('b19', 'k05_bohe',       '薄荷',   '食', (203, 210, 190), 'dark',  (35, 18),  2.5, None),
 ('b20', 'k06_sangshen',   '桑椹',   '食', (212, 180, 203), 'dark',  (20, 10),  3.0, None),
 ('b21', 'k07_chixiaodou', '赤小豆', '食', (36, 20, 18),    'light', (7, 4.5),  5.0, None),
 ('b22', 'k08_heye',       '荷叶',   '食', (14, 40, 30),    'light', (40, 30),  2.5, None),
 ('b23', 'k09_gancao',     '甘草',   '同', (100, 30, 22),   'light', (18, 10),  3.0, None),
 ('b24', 'k10_jianghuang', '姜黄',   '同', (16, 40, 86),    'light', (20, 14),  2.5, None),
 ('b25', 'k11_shaji',      '沙棘',   '同', (48, 66, 50),    'light', (8, 8),    4.0, None),
 ('b26', 'k12_juemingzi',  '决明子', '同', (196, 204, 184), 'dark',  (5, 3),    6.0, None),
 ('b27', 'k13_luohanguo',  '罗汉果', '源', (198, 158, 60),  'dark',  (50, 50),  2.5, None),
 ('b28', 'k14_rougui',     '肉桂',   '源', (20, 25, 36),    'light', (80, 12),  5.5, 'length'),
 ('b29', 'k15_qianshi',    '芡实',   '源', (34, 50, 80),    'light', (7, 7),    5.0, None),
 ('b30', 'k16_lingzhi',    '灵芝',   '源', (24, 19, 15),    'light', (45, 15),  2.7, 'length'),
]
THIN = 0.10     # stroke erosion (fraction of the stroke width): opens the counters of the Black weight
for i, (bid, src, label, ch, col, tm, (ln, wd), n, size_by) in enumerate(GLYPHS):
    wm = round(n * wd * 1e-3 / (GLYPH_K * (1.0 - THIN)), 3)
    expo = {'dark': 0.9}.get(tm, 0.0)
    if bid == 'b27':
        expo = 0.5
    SCENES.append(dict(
        id='%s_%s' % (bid, src.split('_')[1]), start=608 + 8 * i, end=616 + 8 * i, layout='glyph', text=ch, label=label,
        source=[src], ground=paper(col, fibres=1.0, cloud=0.08 if tm == 'light' else 0.05),
        frame_width_m=wm, item_mm=ln, item_w_mm=wd, size_by=size_by or 'width', seed=40 + i, text_mode=tm, exposure=expo,
        params=dict(centre=[0.50, 0.47], height=0.72, font=FONT, thin=THIN, strays=0.012)))

# ----------------------------------------------------------------------------- landing
SCENES.append(dict(
    id='b31_landing', start=736, end=1248, layout='landing', text='药食同源', label='outro cards (white, lower third)',
    source=['k02_yiyiren'],
    ground=paper((152, 36, 26), grid=dict(type='square', pitch_m=0.0250, line_m=0.0007, colour=(214, 160, 84), opacity=0.55, major=0),
                 fibres=1.0, cloud=0.07),
    frame_width_m=1.00, item_mm=6.0, item_w_mm=5.0, size_by='width', seed=77, text_mode='light', exposure=0.0,
    params=dict(centre=[0.50, 0.40], width=0.80, font=FONT, thin=THIN, tracking=0.10, strays=0.006),
    reveal=dict(per_char_frames=8, order='药食同源', empty_variant='--empty'),
    note='title poured from white coix seeds on cinnabar-red paper with a pale gold grid; lower third clear for the '
         'white outro lines; render it twice (full + --empty) for the 2-D stop-motion reveal, one character per 8 frames'))

TABLE = dict(
    _about=__doc__,
    fps=FPS, width=W, height=H, nframes=NFRAMES,
    defaults=dict(lens_mm=135, look='AgX - Punchy', final_res=[3840, 2160]),
    scenes=SCENES,
)

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots_b.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(TABLE, f, ensure_ascii=False, indent=1)
    cuts = [(s['start'], s['end']) for s in SCENES]
    assert cuts[0][0] == 0 and cuts[-1][1] == NFRAMES and all(a[1] == b[0] for a, b in zip(cuts, cuts[1:])), 'gaps in the cut grid'
    print('wrote', out, len(SCENES), 'scenes')
    for s in SCENES:
        print('  %-16s %4d-%4d %-8s %-4s W=%.3f m  %s' % (s['id'], s['start'], s['end'], s['layout'], s.get('text') or '-',
                                                       s['frame_width_m'], ','.join(s['source'])[:60]))
