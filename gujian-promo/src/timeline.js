// timeline.js — the cut list. 25 fps, 500 frames = 20.00 s.
// Shot lengths follow the reference film frame-for-frame: three ~1 s holds, a quick triple,
// eight ~0.55 s shots, then the cuts tighten to 0.2–0.3 s while the tagline lands in three beats.

export const FPS = 25;

// Tagline beats (the reference's "There's / more to / discover" structure)
export const BEATS = {
  // weights are graded by stroke density (dense glyphs lighter, sparse glyphs heavier); `stroke` thickens the hairlines of the Song face;
  // `kern` pulls 道 toward the stroke-poor 一 so the line does not open with what looks like a dash
  1: { text: '一道弧线', size: 80, gap: 30, weight: 700, spacing: 9, stroke: 1.0, kern: [-6] },
  2: { text: '藏着', size: 112, gap: 30, weight: 600, spacing: 12, stroke: 1.0 },
  3: { text: '千年', size: 160, sizeEnd: 200, gap: 32, weight: 700, spacing: 14, stroke: 0.8 },
};

// Typography — 思源宋体 throughout (chosen by a three-judge panel over eight other open-licensed faces).
// `font` is the tagline face (see FONTS in lib/core.js); `title` styles the closing card (defaults in lib/titlecard.js).
export const STYLE = {
  font: 'serif',
  title: { font: 'serif' },
};

// arc presets — every shot's dominant curve is a circle arc cresting at frame centre.
// Small variations between shots keep the match-cut alive, exactly as in the reference.
const A = { R: 2400, crestY: 560 };   // default
const TIGHT = { R: 1900, crestY: 548 };
const WIDE = { R: 3100, crestY: 566 };
const LOW = { R: 2400, crestY: 600 };

// id, scene module (src/scenes/<scene>.js), frames, text beat, arc
export const SHOTS = [
  { id: 's01', scene: 's01-great-wall-dawn', frames: 31, arc: { R: 2600, crestY: 585 } },
  { id: 's02', scene: 's02-liuli-wadang', frames: 26, arc: A },
  { id: 's03', scene: 's03-door-stud', frames: 26, arc: WIDE },
  { id: 's04', scene: 's04-tulou', frames: 11, arc: TIGHT },
  { id: 's05', scene: 's05-red-wall', frames: 6, arc: A },
  { id: 's06', scene: 's06-caisson', frames: 6, arc: TIGHT },
  { id: 's07', scene: 's07-zhaozhou-blueprint', frames: 13, arc: A },
  { id: 's08', scene: 's08-wadang-rubbing', frames: 15, arc: TIGHT },
  { id: 's09', scene: 's09-qinglv-shanshui', frames: 13, arc: A },
  { id: 's10', scene: 's10-matou-wall', frames: 14, arc: A },
  { id: 's11', scene: 's11-lantern-bridge', frames: 15, arc: TIGHT },
  { id: 's12', scene: 's12-drum-stone', frames: 13, arc: A },
  { id: 's13', scene: 's13-dougong', frames: 14, arc: WIDE },
  { id: 's14', scene: 's14-rainbow-bridge', frames: 15, arc: A },
  // beat 1
  { id: 's15', scene: 's15-bronze-bell', frames: 8, beat: 1, arc: A },
  { id: 's16', scene: 's16-red-drum', frames: 10, beat: 1, arc: A },
  { id: 's17', scene: 's17-caihua', frames: 8, beat: 1, arc: A },
  { id: 's18', scene: 's18-yuanqiu-woodcut', frames: 11, beat: 1, arc: A },
  { id: 's19', scene: 's19-moon-gate', frames: 12, beat: 1, arc: TIGHT },
  // beat 2
  { id: 's20', scene: 's20-yaodong', frames: 8, beat: 2, arc: A },
  { id: 's21', scene: 's21-pagoda-sunset', frames: 10, beat: 2, arc: A },
  { id: 's22', scene: 's22-embroidery-tiles', frames: 8, beat: 2, arc: A },
  { id: 's23', scene: 's23-point-cloud', frames: 8, beat: 2, arc: A },
  { id: 's24', scene: 's24-lattice', frames: 11, beat: 2, arc: A },
  // beat 3
  { id: 's25', scene: 's25-snow-roof', frames: 7, beat: 3, arc: A },
  { id: 's26', scene: 's26-qinghua', frames: 6, beat: 3, arc: A },
  { id: 's27', scene: 's27-gilded-finial', frames: 8, beat: 3, arc: TIGHT },
  { id: 's28', scene: 's28-tile-ridges', frames: 8, beat: 3, arc: A },
  { id: 's29', scene: 's29-white-dagoba', frames: 7, beat: 3, arc: A },
  { id: 's30', scene: 's30-glazed-waves', frames: 8, beat: 3, arc: A },
  { id: 's31', scene: 's31-papercut-town', frames: 6, beat: 3, arc: A },
  { id: 's32', scene: 's32-pebble-paving', frames: 7, beat: 3, arc: A },
  { id: 's33', scene: 's33-iron-sparks', frames: 7, beat: 3, arc: A },
  { id: 's34', scene: 's34-qinian-plan', frames: 7, beat: 3, arc: A },
  { id: 's35', scene: 's35-ink-sketch', frames: 6, beat: 3, arc: A },
  { id: 's36', scene: 's36-grotto-flame', frames: 5, beat: 3, arc: A },
  { id: 's37', scene: 's37-qinian-eaves', frames: 5, beat: 3, arc: A },
  // title card: 中国古建筑 → 千年营造·等你发现 → tilt back down to the opening dawn (loops)
  { id: 'title', scene: 'title', frames: 101, arc: { R: 2600, crestY: 585 } },
];

let f = 0;
for (const s of SHOTS) { s.start = f; f += s.frames; s.end = f; }
export const TOTAL_FRAMES = f; // 500

export function shotAt(frame) {
  for (const s of SHOTS) if (frame >= s.start && frame < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}
