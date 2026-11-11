# -*- coding: utf-8 -*-
"""Master shot table of VERSION B (top-down specimen plates / ingredient typography) of 《药食同源》.
Run this file to (re)generate film/shots_b.json.  Same timeline, audio and cut grid as version A
(film/shots.json): 1248 frames @ 30 fps; every start/end below is a cut of the original film.

LOOK (user: "不要搞得像鬼片"): BRIGHT, warm, clean vintage specimen plates.  Every ground is a light or
mid-tone handmade card stock with visible fibre (never near-black), each plate its own colour chosen
for contrast with the ingredient (pale ingredients on mid-tones, dark / saturated ones on pale paper).
First and last page are warm WHITE paper with a faint ruled grid.

Scene keys
  id, start, end      frame range [start, end)
  layout              wreath | glyph | landing | taiji   (film/blender/flatlay.py)
  text                glyph string poured from the ingredient (glyph / landing), else null
  label               what the 2-D text layer writes over the plate (information for the compositor)
  source              ingredient module id(s) in film/blender/shots/ (make_items)
  ground              {type: paper, colour: DISPLAY sRGB 0-255 of the lit ground,
                       grid: {type, pitch_m, line_m, colour, opacity, major}, fibres, cloud, ...}
  frame_width_m       physical width of the frame on the ground, chosen for the measured item size
                      (lock_width: true everywhere - flatlay does not rescale)
  item_scale          optional uniform scale of the module's items (smaller cut pieces)
  seed                layout + paper seed
  text_mode           'dark' = dark-ink overlay text (pale ground), 'light' = white overlay text (mid-tone ground)
  exposure            stops (1.0 for every plate: one consistent bright exposure; papers paler than a
                      0.90 albedo can render get a small display gain in flatlay, see display_gain)
  params              layout parameters (see README_B.md)
"""
import json, os

FPS, W, H, NFRAMES = 30, 3840, 2160, 1248
FONT = 'NotoSansCJKsc-Black.otf'
EXPO = 1.0

# stroke width of a single glyph in NotoSans Black at height 0.72 H = 0.0543 x frame width (measured on 药),
# so   frame_width = n_item_widths * item_width / 0.0543 / (1 - thin)
GLYPH_K = 0.0543
GLYPH_H = 0.74
THIN = 0.10     # stroke erosion (fraction of the stroke width): opens the counters of the Black weight

# measured by flatlay.ItemSet (length, width, thickness in mm of the top-down footprint)
SIZE = {
 'm01_shanyao': (23.8, 22.5, 4.1), 'm02_gouqi': (12.6, 5.7, 4.3), 'm03_dazao': (33.2, 21.8, 20.4),
 'm04_shengjiang': (25.1, 21.2, 3.0), 'm05_jupi': (43.5, 21.5, 27.8), 'm06_lianzi': (13.4, 11.9, 12.0),
 'm07_baihe': (25.9, 13.9, 6.7), 'm08_shanzha': (18.8, 17.2, 5.6), 'm09_juhua': (21.9, 20.0, 15.7),
 'm10_fengmi': (34.2, 26.4, 12.6), 'k01_fuling': (17.7, 15.5, 7.1), 'k02_yiyiren': (6.4, 5.7, 3.4),
 'k03_guiyuan': (22.3, 20.3, 22.0), 'k04_heizhima': (2.9, 1.9, 0.9), 'k05_bohe': (43.8, 25.1, 5.0),
 'k06_sangshen': (21.6, 9.3, 9.8), 'k07_chixiaodou': (6.9, 3.9, 3.9), 'k08_heye': (47.5, 38.1, 9.5),
 'k09_gancao': (15.7, 14.2, 2.9), 'k10_jianghuang': (19.7, 15.9, 3.1), 'k11_shaji': (8.5, 6.9, 6.8),
 'k12_juemingzi': (5.1, 2.4, 2.3), 'k13_luohanguo': (58.4, 51.6, 49.9), 'k14_rougui': (74.9, 27.2, 19.6),
 'k15_qianshi': (6.3, 5.9, 3.9), 'k16_lingzhi': (78.1, 58.8, 14.8), 's03_millet': (1.6, 1.5, 1.3),
}

# ----------------------------------------------------------------------------- vintage card stock palette (display sRGB)
WHITE = (241, 236, 224)
CREAM = (238, 228, 206)
BUTTER = (240, 222, 170)
PEACH = (242, 214, 188)
OCHRE = (234, 204, 146)
PALE_ROSE = (238, 208, 200)
DUSTY_ROSE = (208, 152, 144)
TERRACOTTA = (200, 130, 100)
SAGE = (150, 168, 134)
PALE_SAGE = (210, 216, 188)
CELADON = (194, 214, 198)
MINT = (208, 224, 206)
TEAL = (100, 148, 146)
DEEP_TEAL = (86, 134, 142)
SLATE_BLUE = (122, 148, 170)
INDIGO = (100, 124, 164)
PALE_BLUE = (194, 212, 224)
LILAC = (220, 210, 228)
MAUVE = (156, 130, 164)
GRID_INK = (150, 120, 96)


def paper(colour, **kw):
    d = dict(type='paper', colour=list(colour), fibres=1.0, cloud=0.05)
    d.update(kw)
    return d


def tmode(col):
    return 'dark' if 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2] > 175 else 'light'


SCENES = []

# ----------------------------------------------------------------------------- long scenes
MIX_INTRO = ['m02_gouqi', 'm03_dazao', 'm09_juhua', 'm06_lianzi', 'm08_shanzha', 'k03_guiyuan', 'm04_shengjiang',
             'k09_gancao', 'm07_baihe', 'k11_shaji', 'm01_shanyao', 'k06_sangshen']
SCENES += [
 dict(id='b00_intro', start=0, end=192, layout='wreath', text=None, label='药食同源 / 中医药 (dark ink title cards)',
      source=MIX_INTRO,
      ground=paper(WHITE, grid=dict(type='square', pitch_m=0.0195, line_m=0.00045, colour=GRID_INK, opacity=0.30, major=0),
                   fibres=1.0, cloud=0.035),
      frame_width_m=0.62, lock_width=True, seed=11, text_mode='dark', exposure=EXPO,
      params=dict(window=[0.50, 0.50, 0.72, 0.70], layers=1.0, reach=0.30, rough=0.10, strays=10, mix='patches', patch=0.13),
      note='warm white paper with a faint ruled grid; a sparse single-layer border of twelve ingredients in small '
           'patches; the centre (u 0.14-0.86, v 0.15-0.85) is clear for the title cards'),
 dict(id='b01_yinyang', start=192, end=256, layout='taiji', text=None, label='阴阳平衡 (white, above)',
      source=['k04_heizhima', 'k02_yiyiren'],
      ground=paper(TERRACOTTA),
      frame_width_m=0.40, lock_width=True, seed=12, text_mode='light', exposure=EXPO,
      params=dict(centre=[0.50, 0.725], diameter=0.50, dot=0.20, layers=3),
      note='yin = black sesame, yang = white coix seed, two opposite eyes, on terracotta card; the text zone above '
           'y 0.46 H is bare paper'),
 dict(id='b02_cabinet', start=256, end=320, layout='wreath', text=None, label='四气 · 五味 (upper-centre window)',
      source=['k09_gancao', 'm04_shengjiang', 'm08_shanzha', 'm09_juhua', 'k05_bohe', 'k10_jianghuang', 'k14_rougui', 'm05_jupi'],
      ground=paper(CREAM),
      frame_width_m=0.66, lock_width=True, seed=13, text_mode='dark', exposure=EXPO,
      params=dict(window=[0.50, 0.385, 0.60, 0.37], layers=1.7, reach=0.50, rough=0.14, strays=8, mix='patches', patch=0.20),
      note='herbs & spices of the four natures / five flavours (liquorice, ginger, hawthorn, chrysanthemum, mint, '
           'turmeric, cinnamon, tangerine peel) in organic patches on cream paper'),
 dict(id='b03_grains', start=320, end=384, layout='wreath', text=None, label='五谷为养 ... (upper-centre window)',
      source=['s03_millet', 'k07_chixiaodou', 'k02_yiyiren', 'k04_heizhima', 'm06_lianzi', 'k12_juemingzi', 'k15_qianshi'],
      ground=paper(SAGE),
      frame_width_m=0.30, lock_width=True, seed=14, text_mode='light', exposure=EXPO,
      params=dict(window=[0.50, 0.385, 0.60, 0.37], layers=2.0, reach=0.55, rough=0.10, strays=6, mix='sectors',
                  sector_start=205.0, sector_blur=0.05),
      note='seven grains / seeds (millet, adzuki bean, coix seed, black sesame, lotus seed, cassia seed, gorgon nut), '
           'one per sector around the window, on sage card'),
 dict(id='b04_bowl', start=384, end=448, layout='wreath', text=None,
      label='药食同源 / 既是食品，又是中药材 (upper-centre window)',
      source=['m02_gouqi', 'm03_dazao', 'm09_juhua', 'm06_lianzi', 'k03_guiyuan', 'm01_shanyao'],
      ground=paper(SLATE_BLUE),
      frame_width_m=0.56, lock_width=True, seed=15, text_mode='light', exposure=EXPO,
      params=dict(window=[0.50, 0.385, 0.60, 0.37], layers=1.8, reach=0.52, rough=0.14, strays=8, mix='patches', patch=0.18),
      note='goji + jujube + chrysanthemum + lotus seed + longan + yam on slate-blue card'),
]

# ----------------------------------------------------------------------------- 16-frame wreaths
#   id, source, label, ground, item lengths across the frame
WREATHS = [
 ('b05', 'm01_shanyao',    '山药',   TERRACOTTA,  20),
 ('b06', 'm02_gouqi',      '枸杞子', CREAM,       21),
 ('b07', 'm03_dazao',      '大枣',   CELADON,     19),
 ('b08', 'm04_shengjiang', '生姜',   INDIGO,      20),
 ('b09', 'm05_jupi',       '橘皮',   PALE_BLUE,   18),
 ('b10', 'm06_lianzi',     '莲子',   DUSTY_ROSE,  21),
 ('b11', 'm07_baihe',      '百合',   SAGE,        20),
 ('b12', 'm08_shanzha',    '山楂',   BUTTER,      20),
 ('b13', 'm09_juhua',      '菊花',   SLATE_BLUE,  20),
 ('b14', 'm10_fengmi',     '蜂蜜',   LILAC,       19),
]
for i, (bid, src, label, col, nlen) in enumerate(WREATHS):
    SCENES.append(dict(
        id='%s_%s' % (bid, src.split('_')[1]), start=448 + 16 * i, end=464 + 16 * i, layout='wreath', text=None, label=label,
        source=[src], ground=paper(col),
        frame_width_m=round(nlen * SIZE[src][0] * 1e-3, 3), lock_width=True, seed=20 + i, text_mode=tmode(col), exposure=EXPO,
        params=dict(window=[0.50, 0.42, 0.46, 0.30], layers=2.0, reach=0.55, rough=0.16, strays=8)))

# ----------------------------------------------------------------------------- 8-frame glyphs
#   id, source, small label, glyph, ground, strokes in item widths, item scale, extra params
GLYPHS = [
 ('b15', 'k01_fuling',     '茯苓',   '药', TERRACOTTA, 3.4, 1.0, {}),
 ('b16', 'k02_yiyiren',    '薏苡仁', '药', TEAL,       5.5, 1.0, {}),
 ('b17', 'k03_guiyuan',    '桂圆',   '药', CREAM,      3.2, 1.0, {}),
 ('b18', 'k04_heizhima',   '黑芝麻', '药', PEACH,      9.0, 1.0, {}),
 ('b19', 'k05_bohe',       '薄荷',   '食', PALE_ROSE,  3.0, 1.0, {}),
 ('b20', 'k06_sangshen',   '桑椹',   '食', BUTTER,     4.0, 1.0, {}),
 ('b21', 'k07_chixiaodou', '赤小豆', '食', CELADON,    6.0, 1.0, {}),
 ('b22', 'k08_heye',       '荷叶',   '食', LILAC,      3.0, 0.6, {}),
 ('b23', 'k09_gancao',     '甘草',   '同', SLATE_BLUE, 3.5, 1.0, {}),
 ('b24', 'k10_jianghuang', '姜黄',   '同', DEEP_TEAL,  3.4, 1.0, {}),
 ('b25', 'k11_shaji',      '沙棘',   '同', MINT,       4.6, 1.0, {}),
 ('b26', 'k12_juemingzi',  '决明子', '同', CREAM,      7.5, 1.0, {}),
 ('b27', 'k13_luohanguo',  '罗汉果', '源', PALE_BLUE,  3.0, 1.0, {}),
 ('b28', 'k14_rougui',     '肉桂',   '源', PALE_SAGE,  3.3, 1.0, {}),
 ('b29', 'k15_qianshi',    '芡实',   '源', MAUVE,      5.5, 1.0, {}),
 ('b30', 'k16_lingzhi',    '灵芝',   '源', OCHRE,      2.8, 1.0, {}),
]
for i, (bid, src, label, ch, col, n, isc, extra) in enumerate(GLYPHS):
    wd = SIZE[src][1] * isc
    wm = round(n * wd * 1e-3 / (GLYPH_K * (GLYPH_H / 0.72) * (1.0 - THIN)), 3)
    P = dict(centre=[0.50, 0.46], height=GLYPH_H, font=FONT, thin=THIN, strays=0.010)
    P.update(extra)
    sc = dict(
        id='%s_%s' % (bid, src.split('_')[1]), start=608 + 8 * i, end=616 + 8 * i, layout='glyph', text=ch, label=label,
        source=[src], ground=paper(col),
        frame_width_m=wm, lock_width=True, seed=40 + i, text_mode=tmode(col), exposure=EXPO, params=P)
    if isc != 1.0:
        sc['item_scale'] = isc
    SCENES.append(sc)

# ----------------------------------------------------------------------------- landing
SCENES.append(dict(
    id='b31_landing', start=736, end=1248, layout='landing', text='药食同源', label='outro cards (dark ink, lower third)',
    source=['m02_gouqi'],
    ground=paper(WHITE, grid=dict(type='square', pitch_m=0.0281, line_m=0.00065, colour=GRID_INK, opacity=0.30, major=0),
                 fibres=1.0, cloud=0.035),
    frame_width_m=0.90, lock_width=True, seed=77, text_mode='dark', exposure=EXPO,
    params=dict(centre=[0.50, 0.40], width=0.80, font=FONT, thin=THIN, tracking=0.10, strays=0.004),
    reveal=dict(per_char_frames=8, order='药食同源', empty_variant='--empty  ->  renders_b/b31_empty.png'),
    note='the four characters poured from dried goji berries (vermilion on warm white paper with a faint ruled grid, '
         'like a red seal); block centre (0.50 W, 0.40 H), width 0.80 W; lower third clear; rendered twice '
         '(full + --empty, identical camera / light / paper) for the 2-D stop-motion reveal'))

TABLE = dict(
    _about=__doc__,
    fps=FPS, width=W, height=H, nframes=NFRAMES,
    defaults=dict(lens_mm=135, look='AgX - Punchy', final_res=[1920, 1080]),
    scenes=SCENES,
)

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots_b.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(TABLE, f, ensure_ascii=False, indent=1)
    cuts = [(s['start'], s['end']) for s in SCENES]
    assert cuts[0][0] == 0 and cuts[-1][1] == NFRAMES and all(a[1] == b[0] for a, b in zip(cuts, cuts[1:])), 'gaps in the cut grid'
    assert len(SCENES) == 32
    print('wrote', out, len(SCENES), 'scenes')
    for s in SCENES:
        print('  %-16s %4d-%4d %-8s %-4s W=%.3f m  %s' % (s['id'], s['start'], s['end'], s['layout'], s.get('text') or '-',
                                                       s['frame_width_m'], ','.join(s['source'])[:60]))
