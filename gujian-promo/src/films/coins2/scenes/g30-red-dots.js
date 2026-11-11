// g30 — 朱点格纸: vermilion dots on squared paper, set on the grid, spelling the coin glyph (the reference's red-dot "5").
// Also the worked example for plate authors: paper → objects placed by a rule tied to K.GLYPH → one pre-rendered layer → drawImage.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
let layer = null;

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const STEP = 60;                                                // 540 is a multiple of 60, so grid lines pass through the glyph centre
  g.drawImage(K.gridPaper({ base: '#f6f3ea', line: '#9fb0b8', step: STEP, offset: 0, seed: 'g30paper', lineAlpha: 0.55, tone: '#8b7a55', stain: 0.18, foxing: 0.12 }), 0, 0);
  // dots sit on the grid intersections
  const r = L.rng('g30dots');
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
    const x = K.GLYPH.cx + i * STEP, y = K.GLYPH.cy + j * STEP;
    if (!K.inGlyph(x, y, 14)) continue;
    const rad = 25.5 + r.range(-1.4, 1.4), ox = r.range(-1.8, 1.8), oy = r.range(-1.8, 1.8);
    // seal paste: a dense vermilion disc with a darker rim where the paste piled up, lighter worn patches, and a faint oil halo in the paper
    g.fillStyle = L.radial(g, x + ox, y + oy, rad * 0.9, rad * 1.5, [[0, 'rgba(196,60,36,0.10)'], [1, 'rgba(196,60,36,0)']]);
    g.beginPath(); g.arc(x + ox, y + oy, rad * 1.5, 0, L.TAU); g.fill();
    const d = L.makeCanvas(80, 80), q = d.getContext('2d'); q.translate(40, 40);
    q.fillStyle = L.radial(q, -rad * 0.2, -rad * 0.25, rad * 0.2, rad, [[0, '#d2402a'], [0.75, '#c2331f'], [1, '#a3261a']]);
    q.beginPath();
    for (let k = 0; k <= 40; k++) { const t = (k / 40) * L.TAU, rr = rad * (1 + 0.035 * Math.sin(t * 3 + i) + r.range(-0.012, 0.012)); k ? q.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : q.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
    q.closePath(); q.fill();
    q.globalCompositeOperation = 'destination-out';           // paper tooth showing through where the paste was thin
    for (let k = 0, n = r.int(16, 40); k < n; k++) {
      q.globalAlpha = r.range(0.18, 0.6);
      q.beginPath(); q.ellipse(r.range(-rad, rad), r.range(-rad, rad), r.range(0.5, 1.9), r.range(0.4, 1.2), r() * 3, 0, L.TAU); q.fill();
    }
    g.globalAlpha = r.range(0.86, 0.98); g.drawImage(d, x + ox - 40, y + oy - 40); g.globalAlpha = 1;
  }
  return c;
}

export default {
  name: '朱点格纸',
  init() { layer = build(); },
  draw(ctx, env, p) {
    ctx.drawImage(layer, 0, 0);          // a 3-frame flash: perfectly still
  },
};
