#!/usr/bin/env python3
"""mk-coins2.py — the cut list and the per-plate briefs of the second coin film (the "collector's plate" montage, 1080×1080).
Writes src/films/coins2/timeline.js and docs/storyboard-coins2.json from the one table below, so the two can never disagree.
Cut structure follows the second reference film: 13 slow plates that accelerate, 45 three-frame flashes in which ever-changing
collections spell the same glyph, three holds, the final plate that flies apart, and two title cards. 500 frames at 25 fps."""
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
 ('p10','p10-cowries',6,6.3,'贝币','一堆货贝散放在浅褐色的纸上（对应参考片里那页鸟蛋）：大小不一，有的腹面朝上露出带细齿的狭长壳口，有的背面朝上（背部磨平或凿孔），壳面釉质光泽、斑点，柔和投影；近处的大、裁出画外。'+NOTEXT, A+'s04-cowrie.js', '贝币'),
 ('p11','p11-ant-nose-coins',6,6.55,'蚁鼻钱','淡彩图版（对应参考片里那页绿色微生物）：十几枚蚁鼻钱（楚国小铜贝，上大下小的水滴形，正面凸起）散布在灰白纸上，通体绿锈，水彩晕染的质感；正面的阴文只画成不可读的凹痕（两点一竖似的坑），上端有小孔。', A+'s09-green-wuzhu.js', '蚁鼻钱'),
 ('p12','p12-abacus',4,6.75,'算盘','俯视的一段算盘（对应参考片里那页乐谱）：横向的细档像五线谱，一颗颗深色算珠像音符一样错落地停在档上；旧黄纸般的浅色木面、深色边框。'+NOTEXT, A+'s31-papercut-market.js', ''),
 ('p13','p13-cord-strings',8,6.95,'彩绳钱串（拼成钱形）','各色彩绳（红、蓝、黄、绿）扎着的小钱串，一小捆一小捆（对应参考片里那些小旗），沿标准钱形符号排开：外圈一圈、方孔四边各一排，拼出方孔圆钱；灰白纸，柔和投影。这是符号第一次完整出现，位置和大小必须和 K.GLYPH 一致。', A+'s11-red-cord-coins.js', '红绳钱串'),
]
FLASH = [
 ('g01','g01-elm-seeds',3,'榆钱','淡绿色的榆钱（榆树翅果：圆形薄翅中间一粒种子）一片片拼成钱形；植物水彩画法，米白纸，极淡的投影。', ''),
 ('g02','g02-damask-negative',6,'连钱纹缎·留白','赭黄色的暗花缎铺满整页，缎面织着连钱纹；钱形符号是花纹里留出的一块素地（负形）：素地比花纹略浅，边缘是织纹自然的收口。', A+'s22-coin-pattern-brocade.js'),
 ('g03','g03-seal-impressions',3,'朱印','几十方朱红的印蜕盖在宣纸上拼成钱形：大小不一的方印、长方印，印泥有浓淡和飞白，印文一律是不可读的篆书式线条；外圈沿圆、内圈沿方孔四边盖。', ''),
 ('g04','g04-gold-couching',3,'盘金绣','旧亚麻布上，一块藏青缎子剪成钱形贴绣在正中，上面用盘金绣盘出一圈圈金线螺旋和连钱小花；金线有捻度和高光，针脚清楚。', A+'s22-coin-pattern-brocade.js'),
 ('g05','g05-knife-coins-engraved',3,'刀币线刻','黑白铜版画：十几枚刀币沿钱形排开——外圈的刀币首尾相接顺着圆走（弧背朝外），内圈四枚沿方孔四边；细线排线，米白纸。', A+'s35-collector-sketch.js'),
 ('g06','g06-pennywort',3,'铜钱草','铜钱草的圆叶（圆形、边缘浅波、叶脉从中心放射）一片片拼成钱形，深浅不同的绿色，带细叶柄；植物图谱画法，米白纸。', ''),
 ('g07','g07-ink-rubbings',3,'钱背墨拓','宣纸上几十个钱背墨拓拼成钱形：每个是一枚黑色圆拓，白线的外郭和方孔，拓墨有颗粒和浓淡；大小不一，外圈沿圆、内圈沿方孔。', A+'s30-yellow-silk-rubbing.js'),
 ('g08','g08-abacus-beads',3,'算珠','深褐色的木算珠（鼓形，侧立露出中孔，或平放）拼成钱形，赭黄色的纸，清楚的投影和木纹高光。', ''),
 ('g09','g09-silver-dollars',3,'银元','白纸上十几枚银元拼成钱形（最接近参考片里那一格硬币）：铜版画式的灰阶，边齿、珠圈和磨平的浮雕（不可读，不写字），外圈一圈、方孔四边各两三枚。', A+'s28-silver-dollar-reeding.js、'+A+'s06-dragon-dollar-toning.js'),
 ('g10','g10-red-cord',3,'红绳','一根红丝绳在米白纸上盘出钱形的轮廓：外面一个圆、里面一个方，一笔连下来，接头处打一个结、垂下流苏；绳有捻度、粗细约 14 px，贴纸处有投影。', A+'s11-red-cord-coins.js、'+A+'s13-carved-pattern-coin.js'),
 ('g11','g11-coin-strings',3,'钱串','一串串穿好的铜钱（侧看是一摞钱缘，像一节节短棍）弯成弧形、摆成直线，拼出钱形：外圈几段弧形钱串、方孔四边各一段直钱串；青铜色带绿锈，灰蓝色的纸。', A+'s37-fanned-coins.js、'+A+'s02-coin-string.js'),
 ('g12','g12-paper-slips-negative',3,'彩笺·留白','各色旧笺纸（朱红、藤黄、石绿、月白、粉、靛蓝）层层叠叠铺满整页，只在正中留出一块钱形的空，露出下面深褐色的衬纸（负形，对应参考片里邮票留出的 5）。笺纸边缘有的印着连钱纹边框、有的是素色，不写字；纸片有厚度和投影。', A+'s31-papercut-market.js'),
 ('g13','g13-mahjong-circles',3,'麻将筒子','墨绿色毡面上，象牙色的麻将牌拼成钱形，全是筒子牌（牌面只有红、绿、蓝的圆筒花纹），牌有厚度、圆角和竹背，投影清楚。牌面不出现任何汉字或数字。', ''),
 ('g14','g14-gold-cakes',3,'金饼','纯黑的底上，一枚枚金饼（圆饼形，面凸起、有冰裂般的铸造皱纹）拼成钱形，暖金色高光，暗部赤金。', A+'s27-horse-hoof-gold.js、'+A+'s03-gold-kaiyuan.js'),
 ('g15','g15-malachite-crust',3,'孔雀石锈','浅色纸上，一簇簇孔雀石绿的葡萄状锈晶和蓝铜矿小晶簇拼成钱形，像矿物标本图；颗粒有体积和高光。', A+'s17-patina-microscopy.js、'+A+'s09-green-wuzhu.js'),
 ('g16','g16-compass-construction',3,'规矩作图','米白纸上用圆规和直尺作出的钱形：墨线的圆和方、铅笔的辅助线、圆心的针孔、淡淡的排线阴影把「肉」的部分涂暗，线条有手绘的粗细。不写字和数字。', A+'s34-round-square-geometry.js'),
 ('g17','g17-spade-coins',3,'布币','深褐色的纸上，十几枚青铜布币（带绿锈和红斑）呈放射状拼成钱形：銎首朝外，足朝方孔；大小略有不同。', A+'s10-spade-coins.js'),
 ('g18','g18-spectral-bars',3,'光谱条','米白纸上一排排水平的黑色横条，横条在钱形处断开或变细，靠断口拼出钱形；部分横条上嵌着细的彩色谱线（红、橙、黄、绿、青）。不写数字。', A+'s23-xrf-false-color.js'),
 ('g19','g19-island-map',3,'岛屿地图','一张老地图：海上一座钱形的岛（方孔是岛中央的方湖），岛上有山脉晕滃线、河流、淡彩分区和绿色的海岸线，海面有经纬网格。完全不标地名、不写字。', ''),
 ('g20','g20-woodcut',3,'木刻','黑底白线的木刻版画：钱形由粗壮的刻线和排线表现（外郭一粗一细的双线，肉上是放射的排线），刀味足、有飞白。', A+'s18-coin-catalogue-woodcut.js'),
 ('g21','g21-rice-grains',3,'米粒','深色的旧木板上，白米一粒粒撒出钱形，边缘有零星散落的米粒；米粒半透明、有投影，木纹清楚。', A+'s13-carved-pattern-coin.js'),
 ('g22','g22-mould-fragments',3,'钱范残片','米白纸上，十几块陶范残片（赤陶色，面上有圆形钱腔和浇道的凹痕）拼成钱形，像考古线图配的彩色照片，边缘是断口。', A+'s12-stack-casting-mould.js'),
 ('g23','g23-ink-wash',3,'水墨','白宣纸上一笔写出的圆（带飞白和起收笔）和中间一个用浓墨留出的方孔——水墨画出的钱形；墨色有浓淡、洇晕。', A+'s35-collector-sketch.js'),
 ('g24','g24-star-chart',3,'星图','深青色的夜空，金色的星点用细线连成钱形的「星座」：外圈一圈星、方孔四角四颗亮星；有淡淡的银河和细小的散星。不写字。', ''),
 ('g25','g25-blueprint',3,'蓝图','蓝晒蓝图：白线画出的钱形工程图——同心圆、方孔、中心线、剖面线和尺寸引线（不写数字），蓝底有晒图的斑驳。', A+'s07-coin-blueprint.js'),
 ('g26','g26-cyanotype',3,'蓝晒','普鲁士蓝的蓝晒照片：一串串铜钱和绳结直接压在相纸上晒出的白色剪影，拼成钱形；边缘有柔和的光晕和药水刷痕。', A+'s26-crayon-rubbing.js'),
 ('g27','g27-gold-leaf',3,'金箔','黑漆底上，一张张方形金箔（约 80 px，边缘破碎、有皱褶和搭接）贴出钱形，金箔的反光深浅不一。', A+'s27-horse-hoof-gold.js'),
 ('g28','g28-false-colour',3,'伪彩扫描','深蓝黑的底上，钱形是一块成分扫描的伪彩图：洋红、橙、黄、绿的等高线色带，边缘有辉光。不写数字和字母。', A+'s23-xrf-false-color.js'),
 ('g29','g29-cowries-yellow',3,'贝币','明黄色的纸上，几十枚小货贝拼成钱形（对应参考片里黄底上的三叶草），腹面朝上露出齿口，大小不一。', A+'s04-cowrie.js'),
 ('g30','g30-red-dots',3,'朱点格纸','白色方格纸上，朱红的圆点按格子排成点阵钱形（对应参考片里的红点 5）：圆点落在格子交点上，印泥有浓淡。', ''),
 ('g31','g31-metallograph',3,'金相','淡紫白的显微照片：钱形里是青铜金相组织（青绿色的多边形晶粒、晶界、枝晶），钱形之外是失焦的浅色背景。不标倍率。', A+'s32-bronze-metallograph.js'),
 ('g32','g32-azurite-blades',3,'锈晶显微','蓝色的偏光显微画面：半透明的蓝铜矿板状晶体和孔雀石针晶交错，拼成钱形，晶体有折射的亮边。', A+'s17-patina-microscopy.js'),
 ('g33','g33-ant-nose-coins',3,'蚁鼻钱','白纸上几十枚小小的蚁鼻钱（绿锈、水滴形）拼成钱形，投影清楚。', A+'s09-green-wuzhu.js'),
 ('g34','g34-openwork-charm',3,'镂空花钱','浅灰纸上只放一枚大的镂空花钱，它本身就是钱形（外圈完整的圆郭、中央方孔带内郭，肉的部分是镂空的缠枝花和双凤，枝条彼此相连）；白铜的冷光，下面有投影。大小与标准符号一致。', A+'s24-openwork-charm.js'),
 ('g35','g35-xray-clump',3,'钱坨 X 光','黑底的 X 光片：一坨锈结的钱，叠压的圆环和方孔影像合起来正好是一个大的钱形；灰白的透射质感，细颗粒。', A+'s08-coin-clump-xray.js'),
 ('g36','g36-go-stones',3,'围棋子','木棋盘（有墨线格子）上，黑白围棋子拼成钱形：外圈黑子、方孔四边白子，或黑白相间；棋子有弧面高光和投影。', ''),
 ('g37','g37-unearthed',3,'出土','深褐色的湿土上，半埋的铜钱（绿锈、沾泥）排成钱形，像考古探方里刚清理出来的样子；土粒、细根清楚。', A+'s29-bone-cowrie.js'),
 ('g38','g38-seal-paste',3,'印泥盒','黑底，俯视一只白瓷印泥盒：圆形的朱砂印泥正中被方印压出一个方形的印痕——圆的印泥、方的印痕，合起来就是钱形；瓷盒口沿有釉光，印泥有油润的颗粒。', A+'s38-none'),
 ('g39','g39-molten-beads',3,'铜珠','纯黑的底上，一颗颗炽热的铜珠（橙黄发光，大小不一，表面有暗色氧化皮）拼成钱形，带柔和辉光。', A+'s16-molten-copper.js'),
 ('g40','g40-cowrie-xray',3,'贝壳 X 光','黑底的 X 光片：货贝的透射影像（壳壁亮线、内部螺旋）拼成钱形。', A+'s08-coin-clump-xray.js'),
]
REPEATS = [('g05', True), ('g28', True), ('g24', True), ('g13', True), ('g26', True)]      # slots 41–45: mirrored repeats, like the reference
HOLDS = [
 ('h1','h1-ginkgo-leaves',6,12.9,'银杏叶','炭黑色的纸上，金黄的银杏叶（扇形、叶脉放射、叶柄细长）拼成钱形，夹着两三片红枫；压花标本的质感，叶片略有卷翘和投影。', ''),
 ('h2','h2-molten-pour',19,13.4,'铜汁入范','这是停留 0.76 秒的重点镜头（对应参考片里的培养皿）：俯视一只圆形的砂范，范里钱形的型腔灌满了炽亮的铜汁——钱形整个在发光（白热到橙黄），范体是暗色的砂和陶，范口有烟熏。19 帧里铜汁的亮度缓慢起伏、表面有细小的流动纹和几片正在形成的暗色氧化皮，辉光柔和。', A+'s16-molten-copper.js、'+A+'s12-stack-casting-mould.js'),
 ('h3','h3-plum-and-coins',22,14.2,'梅枝铜钱','这是停留 0.88 秒的重点镜头（对应参考片里那枝花）：工笔 / 植物图谱画法——一枝老梅弯成一个圆，枝上开着朱砂红的梅花和花苞；圆的中间，四段短枝搭成一个方框；几枚带绿锈的铜钱挂在枝上。合起来是钱形。灰粉色的旧纸。22 帧里有五六片花瓣缓慢飘落。', ''),
 ('z1','z1-hundred-coins',38,14.8,'百钱成钱·飞散','全片的收束（对应参考片里的蝴蝶）：米白旧纸上，几十枚各种各样的古钱（布币、刀币、圜钱、方孔圆钱、贝币、银锭、金饼……颜色各异：青铜绿、红斑、金、银）拼成钱形，彩色图版画法，各带投影。前 12 帧基本静止（个别钱极轻微地晃动）；之后钱一枚枚离开纸面、翻转着朝镜头飞来（越来越大、带运动模糊），最后 3 帧一枚巨大的失焦的钱几乎盖满画面。必须另外具名导出 drawFlyers(ctx, t)：在透明背景上画出 t ∈ [0,1] 期间「还在飞走的十来枚钱」（从画面中部向四周和镜头飞散、逐渐飞出画外），供片名卡叠加在红格纸上；t=1 时画面里已经没有钱。', A+'s10-spade-coins.js、'+A+'s37-fanned-coins.js'),
]
ENDS = [('title','title',58,17.2,'片名卡'), ('brand','brand',41,19.2,'品牌卡')]

shots, board = [], []
for sid, f, n, ref, name, brief, borrow, res in SLOW:
    shots.append(dict(id=sid, scene=f, frames=n, name=name)); board.append(dict(id=sid, file=f, frames=n, kind='slow', ref=ref, name=name, brief=brief, borrow=borrow, research=res))
for k, (sid, f, n, name, brief, borrow) in enumerate(FLASH):
    ref = 7.125 if k == 0 else 7.25 if k == 1 else 7.5 + (k - 2) * 0.125
    shots.append(dict(id=sid, scene=f, frames=n, name=name)); board.append(dict(id=sid, file=f, frames=n, kind='flash', ref=round(ref, 3), name=name, brief=brief + NOTEXT, borrow=borrow.replace(A + 's38-none', ''), research=''))
byid = {b['id']: b for b in board}
for k, (src, flip) in enumerate(REPEATS):
    shots.append(dict(id='r%d' % (k + 1), scene=byid[src]['file'], frames=3, name=byid[src]['name'] + '（重复）', flip=flip))
for sid, f, n, ref, name, brief, borrow in HOLDS:
    shots.append(dict(id=sid, scene=f, frames=n, name=name)); board.append(dict(id=sid, file=f, frames=n, kind='hold', ref=ref, name=name, brief=brief + NOTEXT, borrow=borrow, research=''))
for sid, f, n, ref, name in ENDS:
    shots.append(dict(id=sid, scene=f, frames=n, name=name)); board.append(dict(id=sid, file=f, frames=n, kind='card', ref=ref, name=name, brief='', borrow='', research=''))
total = sum(s['frames'] for s in shots)
assert total == 500, total
js = ['// timeline.js — cut list of the second coin film (film id: coins2), the "collector\'s plate" montage. GENERATED by tools/mk-coins2.py — edit the table there.',
      '// 1080 × 1080, 25 fps, 500 frames. Every glyph plate spells the same square-holed coin (see src/lib/plate.js).',
      'export const FPS = 25;',
      'export const TITLE = { title: "中国古钱币", brand: "志和诚", seal: "通宝", cta: ["物有来处", "人有所守"] };',
      'export const STYLE = { font: \'"GJ WenKai"\' };',
      'const LIST = [']
for s in shots:
    js.append('  { id: %s, scene: %s, frames: %d%s },   // %s' % (json.dumps(s['id']), json.dumps(s['scene']), s['frames'], ', flip: true' if s.get('flip') else '', s['name']))
js += ['];', 'let f = 0;', 'export const SHOTS = LIST.map((s) => { const o = { ...s, start: f, end: f + s.frames }; f += s.frames; return o; });',
       'export const TOTAL_FRAMES = f;', 'export const shotAt = (n) => SHOTS.find((s) => n >= s.start && n < s.end) || SHOTS[SHOTS.length - 1];', '']
open(os.path.join(ROOT, 'src/films/coins2/timeline.js'), 'w', encoding='utf-8').write('\n'.join(js))
json.dump(dict(film='coins2', size=1080, fps=25, frames=total, glyph=dict(cx=540, cy=540, R=360, a=128), shots=board), open(os.path.join(ROOT, 'docs/storyboard-coins2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(ROOT, 'src/films/coins2/PLAYER'), 'w').write('player2.html\n')
print(len(shots), 'shots,', len([b for b in board if b['kind'] != 'card']), 'plates to author,', total, 'frames')
