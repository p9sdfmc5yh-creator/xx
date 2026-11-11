# 图版作者指南（《中国古钱币》第二版 · 影片 id `coins2`）

## 这支片子是什么

20 秒、1080×1080、25 fps。结构照着第二支参考片做：**先是十来张慢慢移动的老图版**（越切越快），**然后几十样东西在每一格里拼成同一个符号**（每格只停 3 帧），最后一格的东西飞散开，落到片名卡。
参考片的符号是数字 5；**我们的符号是方孔圆钱的外形——外圆内方**。符号在每一格里的位置、大小完全相同，观众看到的是「一枚钱」在贝币、布币、算珠、拓片、星图之间不停变身。

所有画面都是 Canvas 2D 程序绘制。每个图版是一个独立的 ES module，你只写**一个文件**：`src/films/coins2/scenes/<任务单里的文件名>.js`。

```js
import * as L from '../../../lib/core.js';     // 通用绘图库（随机、噪声、颜色、纹理、笔触）
import * as K from '../../../lib/plate.js';    // 图版工具（符号、排布、纸、物件、镜头）
const { S } = K;                               // 1080
let layer = null;
export default {
  name: '图版中文名',
  init(env) { layer = build(); },              // 只调用一次：把画面预渲染成图层（可以 async）
  draw(ctx, env, p) { ctx.drawImage(layer, 0, 0); },   // 每帧调用，p ∈ [0,1]；env.frame 是镜头内帧号，env.frames 是总帧数
};
```
合成器会在你的画面上叠一层很轻的细颗粒和暗角，你不用画。范例：`src/films/coins2/scenes/g30-red-dots.js`。

## 符号（最重要的规则）

`K.GLYPH = { cx: 540, cy: 540, R: 360, a: 128 }`：圆心在画面正中，外圆半径 360，方孔半边长 128（方孔的四条边**水平、垂直**，不许转成菱形）。不要写死数字，从 `K.GLYPH` 取。

三种拼法，任务单会说明用哪种：

1. **物件拼**：用一批物件摆出钱形。`K.coinLayout({ seed, size })` 给出一圈贴着外圆的位置（row: 'ring'）、沿方孔四边排成直线的位置（row: 'square'）和中间的填充位置（row: 'fill'）。
   **方孔必须读成方的**：内圈的物件要沿四条直边排齐、四个角有物件；外圈物件的外缘贴着外圆。物件之间可以轻微交叠，不要留大空隙。
2. **材质裁切**：一整片材质（织物、图纸、金相……）只出现在钱形里：`ctx.save(); K.clipGlyph(ctx); …; ctx.restore()`（或 `K.fillGlyph`）。
3. **负形**：材质铺满整页，只留出钱形的空。`K.inGlyph(x, y, margin)` / `K.sdGlyph(x, y)`（钱体内为负）可以逐点判断。

验收：把预览图缩成邮票大小，**一眼就是一枚方孔圆钱**；sheet 第 4 格的洋红线是标准符号，你的外轮廓和方孔与它重合（轮廓类 ≤ 6 px；物件类是物件的外包络贴线）。

## 两类镜头

- **闪切格（3 帧，个别 6 帧）**：画面完全静止。所有东西在 `init` 里画进一张 1080×1080 的图层，`draw` 只 `drawImage`。
- **慢图版 / 停留镜头（4—38 帧）**：镜头缓慢移动。把画面画进一张**比画面大**的图层（例如 1400×1400，四周多画 160 px），`draw` 里用 `K.drift(ctx, layer, p, { z0: 1, z1: 1.04, x0, y0, x1, y1 })`。缩放保持在 0.97—1.06（图层按 1:1 画，才不会糊）。慢图版里的东西要**大**（主角 250—500 px）、**裁出画外**，像把一张大图版凑近了看；首帧、末帧都是完整画面，不要淡入淡出。任务单写了动画（翻转、飘落、流动）的，按帧号 `env.frame` 做，动作小而确定。

## 质感（决定成败）

客户的硬要求：**「每一帧要画得够细腻」——放大到原始像素也经得起看**。参考片的每一格都是真实的老图版或俯拍的实物。

1. **两种真实感，选一种做到位**：(a) 老印刷品——铜版 / 木刻的排线、石印的淡彩、套色略有错位、油墨吃进纸里（`K.soak` / `K.wear`），纸有纤维和黄斑；(b) 俯拍实物——物件有体积、材质、高光，落在纸 / 布 / 木 / 土上有柔和的接触投影（`K.stamp` 自带）。不要扁平矢量风，不要 CG 塑料感。
2. **光从左上来**：高光在左上，投影落向右下，全片一致。
3. **三层细节**：大形（体积、明暗）→ 中尺度（纹理、起伏）→ 微观（划痕、细孔、纤维、颗粒）。微观细节是**画出来的结构**，不是随机噪点。
4. **不规整才真实**：每个物件的大小、角度、颜色、磨损都略有不同（用 `L.rng(seed)`），不要复制粘贴感。
5. **物件要够大、够少**：一格里 12—40 个物件，单个 60—150 px；小于 30 px 的东西在 0.12 秒里等于噪点。
6. **边缘干净**：抗锯齿；细线 1.2—3 px；没有锯齿、色带、马赛克块、点阵抖动。
7. **底色按任务单**：相邻两格的底色反差（白纸 / 黑底 / 蓝晒 / 黄纸……）是这支片子的节奏来源。
8. **准确**：形制按任务单；`docs/research/coins-a.json`、`coins-b.json` 里有相关器物的 `depiction` / `pitfalls`（按 `name_zh` 找），画之前看一眼。拿不准的细节宁可简化，不要编造。

## 文字禁令

除任务单明确允许的字以外，画面**不出现任何可读的文字、数字、字母**：钱面只画外郭、内郭和磨平的地章，不写钱文；印章的印文是不可读的篆书式线条；图纸不标尺寸。

## 性能与约束

- `init` ≤ 5 秒，`draw` ≤ 60 ms/帧（预览会打印）。重的东西都放 `init`。
- 禁止 `Math.random()` 和 `Date`（渲染必须可复现），用 `L.rng('种子')`（`.range(a,b) .int(a,b) .pick(arr) .chance(p) .gauss()`，直接调用返回 0..1）。
- 不要对主画布用 `putImageData`；逐像素的东西写进自己的离屏画布再 `drawImage`。
- 只改你自己的文件。`src/lib/`、`player2.js`、`timeline.js`、`tools/`、别人的场景文件都不许动；缺工具就在自己的文件里写局部函数。可以去读第一版的场景（`src/films/coins/scenes/*.js`）学画法、把里面的局部函数抄进自己的文件，但不要 import 它们（它们是 1920×1080、绕弧线构图的）。

## 工具速查

`K`（`src/lib/plate.js`，请直接读，很短）：`GLYPH`、`glyphPath / fillGlyph / clipGlyph / strokeGlyph(ctx, {grow, corner})`、`sdGlyph / inGlyph`、`ringSlots`、`squareSlots`、`scatter`、`coinLayout`、`paper({base, tone, seed, fiber, stain, foxing, edge, size})`、`gridPaper`、`sprite(w, h, draw)`（原点在中心）、`stamp(ctx, sprite, x, y, {rot, scale, shadow})`、`soak`、`wear`、`drift`。

`L`（`src/lib/core.js`）：`rng makeNoise(seed)→{n2,fbm,ridged,cell}`、`clamp lerp smooth ease`、`rgba mix shade hsl makeRamp`、`linear radial`（渐变）、`makeCanvas blurred filtered`、`noiseTex(w,h,opts) grainTex bumpLight(heightCanvas,{angle:45 = 左上来光}) speckle`、`paperTex woodTex stoneTex weaveTex`、`inkStroke chalkStroke sketchLine roughPoly smoothPath`、`glow`、`text(ctx,'字',x,y,{font,size,weight,color})`。注意 `L.W / L.H / makeLayer / blit / vignette / makeArc` 是 1920×1080 弧线片用的，这里不要用。

## 流程（必须照做）

```bash
cd /home/user/xx/gujian-promo
node tools/preview2.js <图版号> --film coins2      # Bash 超时设 600000；前台跑；一次一个
```
机器同时只允许 3 个渲染进程，预览会自动排队（看到 waiting for a turn 是正常的，等着）。

每一轮预览后用 Read 打开三张图：`build/coins2/preview/<图版号>_sheet.jpg`（首 / 中 / 末 / 符号参考线）、`_zoom.jpg`（三处 1:1 原始像素）、`_compare.jpg`（左：参考片的对应图版——我们借的是它的手艺水准和构图密度，不是内容；右：你的）。逐条自问：

- 缩成邮票大小，一眼是方孔圆钱吗？和参考片那一格一样抓眼吗？
- 遮住内容只看质感：像老图版 / 实物照片，还是像矢量图？
- 1:1 下干净吗？有三层细节吗？
- 有没有不该有的字？预览退出码是 0、没有 ERRORS 吗？
