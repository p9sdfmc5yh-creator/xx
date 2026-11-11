// timeline.js — cut list and typography for 《中国古玩》 (film id: antiques).
// Generated from docs/storyboard-antiques.json by tools/mk-film.js, then hand-tuned. The cut structure itself is shared: see src/cuts.js.
import { FPS, buildTimeline } from '../../cuts.js';
export { FPS };

// Tagline beats (the reference's "There's / more to / discover" structure)
export const BEATS = {
  1: {"text":"一层包浆","size":80,"gap":30,"weight":700,"spacing":9,"stroke":1,"kern":[-6]},
  2: {"text":"藏着","size":112,"gap":30,"weight":600,"spacing":12,"stroke":1},
  3: {"text":"千年","size":160,"sizeEnd":200,"gap":32,"weight":700,"spacing":14,"stroke":0.8},
};

// Typography. `font` is the tagline face (see FONTS in lib/core.js); `title` styles the closing card.
export const STYLE = {
  font: 'serif',
  title: { font: 'serif' },
};

// The closing card
export const TITLE = { title: "中国古玩", seal: "雅玩", cta: ["千年雅玩","等你发现"], brand: "志和诚" };

// 37 scene modules (src/films/antiques/scenes/<name>.js), in cut order; arcs follow DEFAULT_ARCS in cuts.js unless overridden here
export const { SHOTS, TOTAL_FRAMES, shotAt } = buildTimeline([
  "s01-celadon-rim-dawn",   // 天青碗沿晨光
  "s02-amber-beads",   // 蜜蜡朝珠
  "s03-tianhuang-seal",   // 田黄印石
  "s04-walnut",   // 文玩核桃
  "s05-coral-red-turquoise",   // 珊瑚红撞松石绿
  "s06-mother-of-pearl",   // 螺钿
  "s07-meiping-blueprint",   // 梅瓶器型线图
  "s08-bronze-ding-xray",   // 青铜鼎X光片
  "s09-jadeite-leaf",   // 翡翠雕叶
  "s10-curio-shelf-silhouette",   // 博古架剪影
  "s11-seal-impressions",   // 印蜕
  "s12-bronze-leiwen-rim",   // 青铜云雷纹口沿
  "s13-thread-bound-book",   // 线装书
  "s14-famille-rose-children",   // 粉彩婴戏图
  "s15-jian-hare-fur",   // 建盏兔毫
  "s16-langyao-red",   // 郎窑红
  "s17-jun-flambe",   // 钧窑窑变
  "s18-bogu-woodcut-ding",   // 博古图录·木刻鼎
  "s19-duan-inkstone",   // 端砚墨池
  "s20-censer-glow",   // 宣德炉香火
  "s21-scholar-rock-silhouette",   // 供石盆景剪影
  "s22-book-case-brocade",   // 书函与织金锦
  "s23-multispectral-vase",   // 多光谱下的瓷瓶
  "s24-white-jade-openwork",   // 白玉透雕
  "s25-banded-agate",   // 缠丝玛瑙
  "s26-qinghua-fenshui",   // 青花分水
  "s27-gold-filigree",   // 累丝金器
  "s28-dehua-drapery",   // 德化白瓷衣褶
  "s29-sweet-white-bowl",   // 甜白釉碗与紫檀
  "s30-yellow-glaze-cizhou",   // 娇黄釉与白地黑花
  "s31-bogu-collage",   // 博古图剪纸拼贴
  "s32-ge-crackle",   // 哥窑金丝铁线
  "s33-chicken-blood-stone",   // 鸡血石
  "s34-round-back-chair-plan",   // 明式圈椅线图
  "s35-qinggong-sketch",   // 清供白描稿
  "s36-goat-hair-brush",   // 羊毫笔锋
  "s37-gold-flecked-fan",   // 泥金朱红折扇
]);
