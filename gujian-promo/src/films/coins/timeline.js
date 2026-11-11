// timeline.js — cut list and typography for 《中国古钱币》 (film id: coins).
// Generated from docs/storyboard-coins.json by tools/mk-film.js, then hand-tuned. The cut structure itself is shared: see src/cuts.js.
import { FPS, buildTimeline } from '../../cuts.js';
export { FPS };

// Tagline beats (the reference's "There's / more to / discover" structure)
export const BEATS = {
  1: {"text":"方圆之间","size":92,"gap":30,"weight":400,"spacing":12,"stroke":1.8},
  2: {"text":"阅尽","size":122,"gap":30,"weight":400,"spacing":18,"stroke":2},
  3: {"text":"兴衰","size":164,"sizeEnd":204,"gap":32,"weight":400,"spacing":20,"stroke":2.2},
};

// Typography. `font` is the tagline face (see FONTS in lib/core.js); `title` styles the closing card.
export const STYLE = {
  font: '"GJ WenKai"',                                   // 霞鹜文楷 Medium (SIL OFL 1.1) — 楷体，有书卷气，快切里仍然好读
  title: { font: '"GJ WenKai"', titleWeight: 400, titleSize: 104, titleSpacing: 30, ctaWeights: [400, 400], ctaSize: 58, ctaSpacing: 9,
    brand: { font: '"GJ WenKai"', weight: 400, size: 120, spacing: 48 } },
};

// The closing card
export const TITLE = { title: "中国古钱币", seal: "通宝", cta: ["物有来处","人有所守"], brand: "志和诚" };

// 37 scene modules (src/films/coins/scenes/<name>.js), in cut order; arcs follow DEFAULT_ARCS in cuts.js unless overridden here
export const { SHOTS, TOTAL_FRAMES, shotAt } = buildTimeline([
  "s01-furnace-rim",   // 炉火映钱郭
  "s02-coin-string",   // 一串铜钱
  "s03-gold-kaiyuan",   // 金开元通宝微距
  "s04-cowrie",   // 戥盘碎银（文件名沿用旧题材；贝币的齿口特写已按客户意见撤掉）
  "s05-red-patina",   // 红斑绿锈
  "s06-dragon-dollar-toning",   // 龙洋的虹彩包浆
  "s07-coin-blueprint",   // 方孔圆钱规制图
  "s08-coin-clump-xray",   // 钱坨的X光片
  "s09-green-wuzhu",   // 绿锈五铢
  "s10-spade-coins",   // 布币列阵
  "s11-red-cord-coins",   // 红绳压岁钱
  "s12-stack-casting-mould",   // 叠铸陶范
  "s13-carved-pattern-coin",   // 雕母木样
  "s14-coin-casting-print",   // 铸钱图
  "s15-spinning-banliang",   // 旋转的秦半两
  "s16-molten-copper",   // 铜水
  "s17-patina-microscopy",   // 锈色显微
  "s18-coin-catalogue-woodcut",   // 钱谱木刻
  "s19-black-lacquer-patina",   // 黑漆古
  "s20-furnace-mouth",   // 化铜炉口
  "s21-silk-road-caravan",   // 丝路驼队剪影
  "s22-coin-pattern-brocade",   // 连钱纹织锦
  "s23-xrf-false-color",   // 成分扫描伪彩图
  "s24-openwork-charm",   // 镂空花钱
  "s25-silver-ingot",   // 银锭流银
  "s26-crayon-rubbing",   // 蜡笔拓钱
  "s27-horse-hoof-gold",   // 马蹄金
  "s28-silver-dollar-reeding",   // 一摞银元的边齿
  "s29-bone-cowrie",   // 出土钱缘（文件名沿用旧题材；骨贝已按客户意见撤掉）
  "s30-yellow-silk-rubbing",   // 黄绫钱拓
  "s31-papercut-market",   // 剪纸拼贴·钱市
  "s32-bronze-metallograph",   // 青铜金相显微
  "s33-cuprite-dust",   // 红斑锈微粒
  "s34-round-square-geometry",   // 天圆地方几何图
  "s35-collector-sketch",   // 泉友手稿
  "s36-money-tree",   // 摇钱树枝叶
  "s37-fanned-coins",   // 扇形展开的铜钱
]);
