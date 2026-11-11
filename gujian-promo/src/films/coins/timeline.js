// timeline.js — cut list and typography for 《中国古钱币》 (film id: coins).
// Generated from docs/storyboard-coins.json by tools/mk-film.js, then hand-tuned. The cut structure itself is shared: see src/cuts.js.
import { FPS, buildTimeline } from '../../cuts.js';
export { FPS };

// Tagline beats (the reference's "There's / more to / discover" structure)
export const BEATS = {
  1: {"text":"一枚圆钱","size":80,"gap":30,"weight":700,"spacing":9,"stroke":1,"kern":[-6]},
  2: {"text":"藏着","size":112,"gap":30,"weight":600,"spacing":12,"stroke":1},
  3: {"text":"千年","size":160,"sizeEnd":200,"gap":32,"weight":700,"spacing":14,"stroke":0.8},
};

// Typography. `font` is the tagline face (see FONTS in lib/core.js); `title` styles the closing card.
export const STYLE = {
  font: 'serif',
  title: { font: 'serif' },
};

// The closing card
export const TITLE = { title: "中国古钱币", seal: "通宝", cta: ["千年通宝","等你发现"], brand: "志和诚" };

// 37 scene modules (src/films/coins/scenes/<name>.js), in cut order; arcs follow DEFAULT_ARCS in cuts.js unless overridden here
export const { SHOTS, TOTAL_FRAMES, shotAt } = buildTimeline([
  "s01-furnace-rim",   // 炉火映钱郭
  "s02-coin-string",   // 一串铜钱
  "s03-gold-kaiyuan",   // 金开元通宝微距
  "s04-cowrie",   // 贝币
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
  "s29-bone-cowrie",   // 出土骨贝
  "s30-yellow-silk-rubbing",   // 黄绫钱拓
  "s31-papercut-market",   // 剪纸拼贴·钱市
  "s32-bronze-metallograph",   // 青铜金相显微
  "s33-cuprite-dust",   // 红斑锈微粒
  "s34-round-square-geometry",   // 天圆地方几何图
  "s35-collector-sketch",   // 泉友手稿
  "s36-money-tree",   // 摇钱树枝叶
  "s37-fanned-coins",   // 扇形展开的铜钱
]);
