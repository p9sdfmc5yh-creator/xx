// title — 片名卡: the film's name on coral-red squared paper (the reference's first card). The last coins of the final plate
// are still flying off as it cuts in; z1-hundred-coins.js supplies them through its named export drawFlyers(ctx, t).
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
import { TITLE, STYLE } from '../timeline.js';
const { S } = K;
const PAD = 60, SZ = S + PAD * 2;
let bg = null, txt = null, flyers = null;

export default {
  name: '片名卡',
  async init() {
    bg = K.gridPaper({ size: SZ, base: '#d45e4b', tone: '#6a2214', line: '#f2ab99', lineAlpha: 0.4, step: 60, offset: (SZ / 2) % 60, seed: 'coins2-title',
      stain: 0.22, fiber: 0.35, foxing: 0.06, edge: 0.18, grain: 0.18 });
    txt = L.makeCanvas(SZ, SZ);
    const g = txt.getContext('2d');
    const opts = { font: STYLE.font, size: 140, weight: 400, spacing: 22 };
    // a breath of darker red under the letters so they sit in the paper, then the letters in warm white
    g.save(); g.filter = 'blur(10px)'; g.globalAlpha = 0.28;
    L.text(g, TITLE.title, SZ / 2, SZ / 2 - 18, { ...opts, color: '#5a140a', stroke: { color: '#5a140a', width: 10 } });
    g.restore();
    L.text(g, TITLE.title, SZ / 2, SZ / 2 - 18, { ...opts, color: '#fbf4e8', stroke: { color: '#fbf4e8', width: 2.4 } });
    K.wear(txt, { seed: 'coins2-title-wear', amount: 0.1, size: 1.1 });
    try { const m = await import('./z1-hundred-coins.js'); flyers = typeof m.drawFlyers === 'function' ? m.drawFlyers : null; } catch (e) { flyers = null; }
  },
  draw(ctx, env, p) {
    const move = { z0: 1.0, z1: 1.03 };
    K.drift(ctx, bg, p, move);
    K.drift(ctx, txt, p, move);
    if (flyers) {
      const t = L.clamp(env.frame / 26);
      if (t < 1) { ctx.save(); try { flyers(ctx, t, env); } finally { ctx.restore(); } }
    }
  },
};
