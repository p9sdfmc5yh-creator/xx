// brand — 品牌卡: the house name in ink on white squared paper (the reference's second card), with a small seal and the motto.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
import { drawSeal } from '../../../lib/titlecard.js';
import { TITLE, STYLE } from '../timeline.js';
const { S } = K;
const PAD = 60, SZ = S + PAD * 2;
let bg = null, txt = null;

export default {
  name: '品牌卡',
  init() {
    bg = K.gridPaper({ size: SZ, base: '#f4f1e8', tone: '#95896c', line: '#bcc7c4', lineAlpha: 0.62, step: 60, offset: (SZ / 2) % 60, seed: 'coins2-brand',
      stain: 0.14, fiber: 0.45, foxing: 0.1, edge: 0.1, grain: 0.2 });
    txt = L.makeCanvas(SZ, SZ);
    const g = txt.getContext('2d');
    const INK = '#17130f';
    L.text(g, TITLE.brand, SZ / 2, SZ / 2 - 44, { font: STYLE.font, size: 176, weight: 400, spacing: 50, color: INK, stroke: { color: INK, width: 2.6 } });
    // motto row: [seal] 物有来处  人有所守 — measured so the group is centred as a whole
    const size = 44, sp = 9, seal = 62, fam = L.FONTS[STYLE.font] || STYLE.font;
    g.font = `400 ${size}px ${fam}`;
    const w = (s) => Array.from(s).reduce((a, ch) => a + g.measureText(ch).width, 0) + sp * (Array.from(s).length - 1);
    const w0 = w(TITLE.cta[0]), w1 = w(TITLE.cta[1]), gapSeal = 24, gapMid = 34;
    const total = seal + gapSeal + w0 + gapMid + w1, x0 = SZ / 2 - total / 2, y = SZ / 2 + 122;
    drawSeal(g, x0 + seal / 2, y + 1, seal, TITLE.seal, { color: '#b3261e', ink: '#f7f2e8', font: 'serif', weight: 900, seed: 'coins2-seal' });
    const c2 = '#3c342b';
    L.text(g, TITLE.cta[0], x0 + seal + gapSeal, y, { font: STYLE.font, size, weight: 400, color: c2, align: 'left', spacing: sp });
    L.text(g, TITLE.cta[1], x0 + seal + gapSeal + w0 + gapMid, y, { font: STYLE.font, size, weight: 400, color: c2, align: 'left', spacing: sp });
    K.wear(txt, { seed: 'coins2-brand-wear', amount: 0.08, size: 1.0 });
  },
  draw(ctx, env, p) {
    const move = { z0: 1.0, z1: 1.025 };
    K.drift(ctx, bg, p, move);
    K.drift(ctx, txt, p, move);
  },
};
