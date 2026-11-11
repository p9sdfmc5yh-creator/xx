// timeline.js — cut list and typography for 《中国中医药》 (film id: tcm).
// Generated from docs/storyboard-tcm.json by tools/mk-film.js, then hand-tuned. The cut structure itself is shared: see src/cuts.js.
import { FPS, buildTimeline } from '../../cuts.js';
export { FPS };

// Tagline beats (the reference's "There's / more to / discover" structure)
export const BEATS = {
  1: {"text":"一味草木","size":80,"gap":30,"weight":700,"spacing":9,"stroke":1,"kern":[-6]},
  2: {"text":"藏着","size":112,"gap":30,"weight":600,"spacing":12,"stroke":1},
  3: {"text":"千年","size":160,"sizeEnd":200,"gap":32,"weight":700,"spacing":14,"stroke":0.8},
};

// Typography. `font` is the tagline face (see FONTS in lib/core.js); `title` styles the closing card.
export const STYLE = {
  font: 'serif',
  title: { font: 'serif' },
};

// The closing card
export const TITLE = { title: "中国中医药", seal: "本草", cta: ["千年本草","等你发现"] };

// 37 scene modules (src/films/tcm/scenes/<name>.js), in cut order; arcs follow DEFAULT_ARCS in cuts.js unless overridden here
export const { SHOTS, TOTAL_FRAMES, shotAt } = buildTimeline([
  "s01-leaf-dawn",   // 草木晨光
  "s02-wax-pills",   // 蜡丸
  "s03-tangerine-peel",   // 橘皮
  "s04-lingzhi",   // 灵芝
  "s05-goji",   // 枸杞
  "s06-abalone-shell",   // 石决明
  "s07-meridian-blueprint",   // 经络图蓝晒
  "s08-ginseng-negative",   // 人参负片
  "s09-ginkgo-leaf",   // 银杏叶
  "s10-herb-silhouettes",   // 百草剪影
  "s11-hawthorn-slices",   // 山楂片
  "s12-clay-decoction-pot",   // 砂锅药罐口沿
  "s13-needle-roll",   // 针包
  "s14-herb-gatherer-illustration",   // 采药图
  "s15-medicine-roller-wheel",   // 药碾轮
  "s16-red-jujube",   // 大枣
  "s17-mineral-pigment-spectrum",   // 矿物药色谱
  "s18-bencao-woodcut",   // 本草木刻插图
  "s19-decoction-surface",   // 汤药液面
  "s20-moxa-ember",   // 艾灸火头
  "s21-herb-gatherer",   // 采药人剪影
  "s22-sachet-brocade",   // 香囊织锦
  "s23-thermal-pot",   // 红外热像
  "s24-tremella",   // 银耳
  "s25-poria-slice",   // 茯苓片
  "s26-qingdai-smear",   // 青黛
  "s27-pine-pollen",   // 松花粉
  "s28-gypsum-fibre",   // 生石膏
  "s29-porcelain-mortar",   // 白瓷研钵
  "s30-turmeric-areca",   // 姜黄与槟榔纹
  "s31-papercut-pharmacy",   // 剪纸拼贴·药铺
  "s32-stem-microscopy",   // 药材显微·茎横切
  "s33-cinnabar",   // 朱砂
  "s34-wuxing-diagram",   // 五行生克图
  "s35-prescription-slip",   // 处方笺与药篮速写
  "s36-dandelion-clock",   // 蒲公英绒球
  "s37-safflower",   // 红花
]);
