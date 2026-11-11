#!/usr/bin/env python3
"""mk-coins2.py — the cut list and the per-plate briefs of the second coin film (the "collector's plate" montage, 1080×1080 logical).
Writes src/films/coins2/timeline.js and docs/storyboard-coins2.json from the one table below, so the two can never disagree.
Cut structure follows the second reference film: 13 slow plates that accelerate, 45 three-frame flashes in which ever-changing
collections spell a glyph (the reference spells the digit 5; this film spells the house name 志和诚 — fifteen flashes for each
character), three holds and a final plate that show the whole name, the coins flying apart, and two title cards. 500 frames at 25 fps."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = 'src/films/coins/scenes/'          # film A scenes worth reading for technique
NOTEXT = '画面不出现任何可读的文字、数字、字母。'
SLOW = [
 ('p01','p01-coin-plate',38,0.75,'泉谱图版','一页旧的彩色图版：各种古钱像蝴蝶标本一样铺满画面——空首布、刀币、圜钱、方孔圆钱、贝币，大的有 400 px，互相错落，四周裁出画外；手工设色的石印 / 铜版画质感（细密的排线 + 淡彩），米白旧纸。正中一枚大方孔圆钱做定格动画：每 3 帧换一个姿态（正面 → 略侧 → 侧立 → 略侧，像参考片正中那只扑翅的蛾子）。镜头缓慢推近。钱面只画外郭、内郭和磨平的地章，不写钱文。', A+'s35-collector-sketch.js、'+A+'s10-spade-coins.js', '空首布 刀币 圜钱'),
 ('p02','p02-rubbing-album',27,2.0,'钱背墨拓册页','一页钱币拓片册：宣纸上排着两三行墨拓，拓的都是钱背（光背，个别有月纹或星点），黑底上是外郭、内郭的白线和斑驳的拓墨颗粒；页边有两三方朱红藏印（印文是不可读的篆书式线条）和淡淡的折痕。镜头缓慢向右横移，拓片裁出画外。', A+'s30-yellow-silk-rubbing.js', '开元通宝'),
 ('p03','p03-ingot-and-hoof-gold',25,3.0,'银锭与马蹄金','彩色石印图版上的两件大器物并排（各占画面一半、略裁出画外）：左边一枚银锭（元宝：两端起翅、锭面有丝纹和氧化的灰黑），右边一枚马蹄金（口沿一圈花丝纹）。像老图录那样有干净的投影和细腻的明暗，米白纸。镜头缓慢左移。不画戳记文字。', A+'s25-silver-ingot.js、'+A+'s27-horse-hoof-gold.js', '银锭 马蹄金'),
 ('p04','p04-money-tree-branch',17,3.9,'摇钱树枝','植物图谱画法的一枝青铜摇钱树：扁平的枝叶上挂着方孔圆钱（与枝叶铸成一体），叶缘有芒刺，青铜上是孔雀石绿和局部的赤铜红；牛皮纸色的底。画成一张手绘设色的标本图，枝条从左下斜向右上，裁出画外。钱面不写字。', A+'s36-money-tree.js', '摇钱树'),
 ('p05','p05-coin-anatomy-engraving',12,4.5,'方孔圆钱规制图','一张铜版线刻的规制图（对应参考片里的建筑平面图）：方孔圆钱的平面和剖面，粗黑的轮廓、细密的排线阴影、引出线。只允许出现四个楷体小字标注「外郭」「内郭」「肉」「穿」（字体用 \'"GJ WenKai"\'），各指向正确的部位：外郭＝钱边缘凸起的一圈，内郭＝紧围方孔凸起的方框，肉＝两郭之间的平面，穿＝中央的方孔。其他任何文字、数字都不要。浅灰白的纸，镜头缓慢右移。', A+'s07-coin-blueprint.js', '方孔圆钱'),
 ('p06','p06-mould-engraving',11,5.0,'叠铸范线刻','一张细密的铜版画：叠铸陶范的范片，一排排圆形钱腔（腔里方芯凸起）由浇道相连，斜向透视排开，像参考片里那张带透视的建筑铜版画；纯黑线条和排线，米白纸。'+NOTEXT, A+'s12-stack-casting-mould.js', '钱范'),
 ('p07','p07-knife-and-spade-specimens',10,5.375,'刀布标本','博物图谱式的彩色标本：五六枚刀币和布币散放在灰白纸上（对应参考片里那页小鸟），每枚 200—300 px，青铜绿锈、细节清楚，各带柔和投影，角度各不相同。刀币：刀首、弧背凹刃的刀身、扁柄、柄端圆环；布币：銎首、平肩或耸肩、两足。'+NOTEXT, A+'s10-spade-coins.js', '刀币 布币'),
 ('p08','p08-coin-brocade',8,5.75,'连钱纹织锦','第一次露出「钱形」：一大块连钱纹织锦被剪成一枚巨大的方孔圆钱形，放在橘黄色的纸上，镜头推得很近——画面里只看到钱形的一段圆弧边和方孔的一个直角（钱形比标准符号大约 2.2 倍，圆心在画面左下之外）。织锦是朱红地、金线连钱纹，经纬清楚，剪口有毛边。', A+'s22-coin-pattern-brocade.js', '连钱纹'),
 ('p09','p09-ingot-line-engravings',6,6.0,'金银锭线刻','线刻图版（对应参考片里那页晶体）：十来件金饼、银锭、银铤的俯视和斜视线描，像几何体一样整齐地散布在米黄纸上，细线排线表现体积，有的只勾轮廓。'+NOTEXT, A+'s34-round-square-geometry.js', '银锭'),
 ('p10','p10-plum-and-coins',6,6.3,'梅枝铜钱','工笔 / 植物图谱画法——一枝老梅弯成一个圆，枝上开着朱砂红的梅花和花苞；圆的中间，四段短枝搭成一个方框；几枚带绿锈的铜钱挂在枝上，合起来是一枚方孔圆钱的样子。灰粉色的旧纸，镜头缓慢推近，有几片花瓣飘落。', '', ''),
 ('p11','p11-ring-coins',6,6.55,'圜钱','淡彩图版：十几枚圜钱（战国的圆形圆孔钱：扁平的圆环，孔是圆的，有的带一圈细外郭）散布在灰白纸上，通体绿锈，水彩晕染的质感，大小不一、互相错落、部分裁出画外。'+NOTEXT, A+'s09-green-wuzhu.js', ''),
 ('p12','p12-abacus',4,6.75,'算盘','俯视的一段算盘（对应参考片里那页乐谱）：横向的细档像五线谱，一颗颗深色算珠像音符一样错落地停在档上；旧黄纸般的浅色木面、深色边框。'+NOTEXT, A+'s31-papercut-market.js', ''),
 ('p13','p13-cord-strings',8,6.95,'彩绳钱串（第一次拼出字）','各色彩绳（红、蓝、黄、绿）扎着的小钱串，一小捆一小捆，顺着笔画排开，拼出当前的字；灰白纸，柔和投影。这是符号第一次出现。', A+'s11-red-cord-coins.js', ''),
]
# every glyph plate is a MATERIAL that spells whatever glyph the timeline gives it ('志' / '和' / '诚' big, or '志和诚' in a row)
MATERIALS = {
 'elm':    ('g01-elm-seeds', '榆钱', '淡绿色的榆钱（榆树翅果：圆形薄翅中间一粒种子）一片片拼成字；植物水彩画法，米白纸，极淡的投影。', ''),
 'damask': ('g02-damask-negative', '连钱纹缎·留白', '赭黄色的暗花缎铺满整页，缎面织着连钱纹；字是花纹里留出的一块素地（负形）：素地比花纹略浅，边缘是织纹自然的收口。', A+'s22-coin-pattern-brocade.js'),
 'seals':  ('g03-seal-impressions', '朱印', '几十方朱红的印蜕盖在宣纸上拼成字：大小不一的方印、长方印，印泥有浓淡和飞白，印文一律是不可读的篆书式线条。', ''),
 'knife':  ('g05-knife-coins-engraved', '刀币线刻', '黑白铜版画：一枚枚刀币首尾相接顺着笔画走，拼成字；细线排线，米白纸。', A+'s35-collector-sketch.js'),
 'penny':  ('g06-pennywort', '铜钱草', '铜钱草的圆叶（圆形、边缘浅波、叶脉从中心放射）一片片拼成字，深浅不同的绿色，带细叶柄；植物图谱画法，米白纸。', ''),
 'rubs':   ('g07-ink-rubbings', '钱背墨拓', '宣纸上几十个钱背墨拓拼成字：每个是一枚黑色圆拓，白线的外郭和方孔，拓墨有颗粒和浓淡；大小不一。', A+'s30-yellow-silk-rubbing.js'),
 'beads':  ('g08-abacus-beads', '算珠', '深褐色的木算珠（鼓形，侧立露出中孔，或平放）拼成字，赭黄色的纸，清楚的投影和木纹高光。', ''),
 'dollar': ('g09-silver-dollars', '银元', '白纸上一枚枚银元拼成字：铜版画式的灰阶，边齿、珠圈和磨平的浮雕（不可读，不写字）。', A+'s28-silver-dollar-reeding.js'),
 'cord':   ('g10-red-cord', '红绳', '红丝绳在米白纸上盘出字：绳子沿着每一笔的中线走（一笔一段，笔画交接处绳子相压），绳有捻度、粗细约为笔画宽度的四分之一到三分之一，贴纸处有投影，一两处打结、垂流苏。', A+'s11-red-cord-coins.js'),
 'strings':('g11-coin-strings', '钱串', '一串串穿好的铜钱（侧看是一摞钱缘，像一节节短棍）顺着笔画摆，拼成字；青铜色带绿锈，灰蓝色的纸。', A+'s37-fanned-coins.js、'+A+'s02-coin-string.js'),
 'slips':  ('g12-paper-slips-negative', '彩笺·留白', '各色旧笺纸（朱红、藤黄、石绿、月白、粉、靛蓝）层层叠叠铺满整页，只在正中留出字形的空，露出下面深褐色的衬纸（负形）。笺纸不写字；纸片有厚度和投影。', A+'s31-papercut-market.js'),
 'mahjong':('g13-mahjong-circles', '麻将筒子', '墨绿色毡面上，象牙色的麻将牌拼成字，全是筒子牌（牌面只有红、绿、蓝的圆筒花纹），牌有厚度、圆角和竹背，投影清楚。牌面不出现任何汉字或数字。', ''),
 'cakes':  ('g14-gold-cakes', '金饼', '纯黑的底上，一枚枚金饼（圆饼形，面凸起、有铸造皱纹）拼成字，暖金色高光，暗部赤金。', A+'s27-horse-hoof-gold.js、'+A+'s03-gold-kaiyuan.js'),
 'mala':   ('g15-malachite-crust', '孔雀石锈', '浅色纸上，一簇簇孔雀石绿的葡萄状锈晶和蓝铜矿小晶簇拼成字，像矿物标本图；颗粒有体积和高光。', A+'s17-patina-microscopy.js'),
 'map':    ('g19-island-map', '岛屿地图', '一张老地图：海上一座字形的岛（几笔就是几块相连的陆地），岛上有山脉晕滃线、河流、淡彩分区和绿色的海岸线，海面有经纬网格。完全不标地名、不写字。', ''),
 'woodcut':('g20-woodcut', '木刻', '黑底白线的木刻版画：字由粗壮的刻线和排线表现（沿笔画方向的排线，轮廓一粗一细的双线），刀味足、有飞白。', A+'s18-coin-catalogue-woodcut.js'),
 'mould':  ('g22-mould-fragments', '钱范残片', '米白纸上，赤陶色的钱范陶片（面上有圆形钱腔和浇道的凹痕）拼成字，边缘是断口，像考古标本。', A+'s12-stack-casting-mould.js'),
 'ink':    ('g23-ink-wash', '水墨', '白宣纸上的水墨字：墨色有浓淡、飞白、洇晕和起收笔的笔意——像一笔笔写出来的，但字形必须与当前符号的轮廓重合。', A+'s35-collector-sketch.js'),
 'stars':  ('g24-star-chart', '星图', '深青色的夜空，金色的星点沿字的轮廓排开，用细线连成「星座」，笔画的端点和转折处是亮星；有淡淡的银河和细小的散星。不写字。', ''),
 'false':  ('g28-false-colour', '伪彩扫描', '深蓝黑的底上，字是一块成分扫描的伪彩图：洋红、橙、黄、绿的等高线色带，边缘有辉光。不写数字和字母。', A+'s23-xrf-false-color.js'),
 'dots':   ('g30-red-dots', '朱点格纸', '白色方格纸上，朱红的圆点按格子排成点阵字：圆点落在格子交点上，印泥有浓淡。', ''),
 'metal':  ('g31-metallograph', '金相', '淡紫白的显微照片：字形里是青铜金相组织（青绿色的多边形晶粒、晶界、枝晶），字形之外是失焦的浅色背景。不标倍率。', A+'s32-bronze-metallograph.js'),
 'go':     ('g36-go-stones', '围棋子', '木棋盘（有墨线格子）上，黑白围棋子拼成字；棋子落在格子交点上，有弧面高光和投影。', ''),
 'leaf':   ('g27-gold-leaf', '金箔', '黑漆底上，金箔贴出字：一张张方形金箔（边缘破碎、有皱褶和搭接缝）拼满字形，金箔的反光深浅不一，字的边缘有金箔的碎屑。', A+'s27-horse-hoof-gold.js'),
}
RUNS = [
 ('志', ['elm', 'damask', 'seals', 'cakes', 'knife', 'penny', 'rubs', 'beads', 'dollar', 'cord', 'stars', 'slips', 'mahjong', 'map', 'woodcut']),
 ('和', ['mala', 'mould', 'false', 'ink', 'go', 'metal', 'leaf', 'dots', 'strings', 'elm', 'stars', 'seals', 'dollar', 'slips', 'cakes']),
 ('诚', ['rubs', 'mahjong', 'damask', 'cord', 'woodcut', 'map', 'knife', 'metal', 'false', 'penny', 'mould', 'ink', 'go', 'mala', 'dots']),   # abacus beads cannot spell 诚 legibly: its strokes are too dense for objects that size
]
ALL = '志和诚'
HOLDS = [
 ('h1','g27-gold-leaf',6,12.9,ALL,'金箔', None),
 ('h2','h2-molten-pour',19,13.4,ALL,'铜汁入范','这是停留 0.76 秒的重点镜头：俯视一只长方形的砂范（范框是陶或铁的，四角有合范的榫），范里「志和诚」三个字的型腔灌满了炽亮的铜汁——三个字整个在发光（白热到橙黄），范体是暗色的型砂，一侧有浇口和烟熏。19 帧里铜汁的亮度缓慢起伏、表面有细小的流动纹和几片正在形成的暗色氧化皮，辉光柔和地漫到砂面上。'),
 ('h3','h3-plaque',22,14.2,ALL,'金字牌匾','这是停留 0.88 秒的重点镜头：一块老字号的木牌匾（横匾），黑漆地，「志和诚」三个字是凸起的浮雕贴金字——字面略鼓、边缘有倒角，金箔在高处磨亮、凹处积着暗金；黑漆地有细密的断纹和木纹起伏；四周是带线脚的边框（可以是朱漆或紫檀色），四角有铜包角。22 帧里一道侧光从左向右缓慢扫过，字的受光面和投影随之移动——立体感是这个镜头的全部。除了这三个字，匾上不出现任何其他文字和印章。'),
 ('z1','z1-hundred-coins',38,14.8,ALL,'百钱成字·飞散','全片的收束：米白旧纸上，一百多枚各种各样的古钱（方孔圆钱、圜钱、小布币、小刀币、金饼、银锭……颜色各异：青铜绿、红斑、金、银）拼成「志和诚」三个字，各带投影。前 12 帧基本静止（个别钱极轻微地晃动）；之后钱一枚枚离开纸面、翻转着朝镜头飞来（越来越大、有厚度、带运动模糊和景深），最后 3 帧一枚巨大的失焦的钱几乎盖满画面。必须保留具名导出 drawFlyers(ctx, t)：在透明背景上画出 t ∈ [0,1] 期间「还在飞走的十来枚钱」，供片名卡叠加；t=1 时画面里已经没有钱。'),
]
ENDS = [('title','title',58,17.2,'片名卡'), ('brand','brand',41,19.2,'品牌卡')]

shots, board, slots = [], [], {}
def add(sid, f, n, name, glyph=None, ref=None):
    shots.append(dict(id=sid, scene=f, frames=n, name=name, glyph=glyph)); slots[sid] = dict(scene=f, glyph=glyph, ref=ref)
for sid, f, n, ref, name, brief, borrow, res in SLOW:
    g = '志' if sid == 'p13' else None
    add(sid, f, n, name, g, ref)
    board.append(dict(id=sid, file=f, frames=n, kind='glyph' if g else 'slow', preview=sid, name=name, brief=brief, borrow=borrow, research=res))
used, k = {}, 0
for glyph, mats in RUNS:
    for m in mats:
        k += 1; sid = 'f%02d' % k; f, name, brief, borrow = MATERIALS[m]
        ref = 7.125 if k == 1 else 7.25 if k == 2 else 7.5 + (k - 3) * 0.125
        add(sid, f, 6 if k == 2 else 3, name + '·' + glyph, glyph, round(ref, 3))
        used.setdefault(m, []).append(sid)
for m, (f, name, brief, borrow) in MATERIALS.items():
    ids = used.get(m, []) + [h[0] for h in HOLDS if h[1] == f]
    board.append(dict(id=f.split('-')[0], file=f, frames=3, kind='glyph', preview=ids[0] if ids else None, slots=ids, name=name, brief=brief + NOTEXT, borrow=borrow, research=''))
for sid, f, n, ref, glyph, name, brief in HOLDS:
    add(sid, f, n, name, glyph, ref)
    if brief: board.append(dict(id=sid, file=f, frames=n, kind='hold', preview=sid, name=name, brief=brief, borrow='', research=''))
for sid, f, n, ref, name in ENDS:
    add(sid, f, n, name, None, ref)
total = sum(s['frames'] for s in shots)
assert total == 500, total
js = ['// timeline.js — cut list of the second coin film (film id: coins2), the "collector\'s plate" montage. GENERATED by tools/mk-coins2.py — edit the table there.',
      '// 1080 × 1080 logical (2160 × 2160 with ?ss=2), 25 fps, 500 frames. `glyph` is what a glyph plate has to spell (see src/lib/plate.js).',
      'export const FPS = 25;',
      'export const TITLE = { title: "中国古钱币", brand: "志和诚", seal: "通宝", cta: ["物有来处", "人有所守"] };',
      'export const STYLE = { font: \'"GJ WenKai"\' };',
      'const LIST = [']
for s_ in shots:
    js.append('  { id: %s, scene: %s, frames: %d%s },   // %s' % (json.dumps(s_['id']), json.dumps(s_['scene']), s_['frames'], (', glyph: ' + json.dumps(s_['glyph'], ensure_ascii=False)) if s_.get('glyph') else '', s_['name']))
js += ['];', 'let f = 0;', 'export const SHOTS = LIST.map((s) => { const o = { ...s, start: f, end: f + s.frames }; f += s.frames; return o; });',
       'export const TOTAL_FRAMES = f;', 'export const shotAt = (n) => SHOTS.find((s) => n >= s.start && n < s.end) || SHOTS[SHOTS.length - 1];', '']
open(os.path.join(ROOT, 'src/films/coins2/timeline.js'), 'w', encoding='utf-8').write('\n'.join(js))
json.dump(dict(film='coins2', size=1080, fps=25, frames=total, glyphs=['志', '和', '诚', '志和诚'], slots=slots, shots=board), open(os.path.join(ROOT, 'docs/storyboard-coins2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(ROOT, 'src/films/coins2/PLAYER'), 'w').write('player2.html\n')
print(len(shots), 'shots,', len(board), 'plates in the storyboard,', total, 'frames')
