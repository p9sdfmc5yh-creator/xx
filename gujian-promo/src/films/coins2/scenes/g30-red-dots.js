// g30 — 朱点格纸: vermilion dots on squared paper, set on the grid, spelling the current glyph (the reference's red-dot "5").
// Also the worked example for plate authors: paper → objects placed by a rule tied to the CURRENT GLYPH (K.inGlyph / K.pack /
// K.outline / K.glyphPath) → one pre-rendered layer → drawImage. Nothing here knows which character it is spelling.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
let layer = null;

/** one dab of seal paste as a sprite, drawn with paths so it is rasterised at device resolution */
function dab(rad, r) {
  return K.sprite(rad * 2 + 16, rad * 2 + 16, (q) => {
    q.fillStyle = L.radial(q, -rad * 0.25, -rad * 0.3, rad * 0.15, rad, [[0, '#d8462e'], [0.7, '#c2331f'], [1, '#9f2417']]);   // lit from the top-left
    q.beginPath();
    const ph = r() * 9;
    for (let k = 0; k <= 48; k++) { const t = (k / 48) * L.TAU, rr = rad * (1 + 0.035 * Math.sin(t * 3 + ph) + r.range(-0.012, 0.012)); k ? q.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : q.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
    q.closePath(); q.fill();
    q.strokeStyle = 'rgba(120,20,12,0.35)'; q.lineWidth = Math.max(0.8, rad * 0.06); q.stroke();                              // the rim where the paste piled up
    q.fillStyle = 'rgba(255,214,190,0.22)'; q.beginPath(); q.ellipse(-rad * 0.3, -rad * 0.36, rad * 0.34, rad * 0.2, -0.6, 0, L.TAU); q.fill();   // a soft oily sheen
    q.globalCompositeOperation = 'destination-out';                                                                            // paper tooth where the paste was thin
    for (let k = 0, n = r.int(14, 34); k < n; k++) {
      q.globalAlpha = r.range(0.2, 0.65);
      q.beginPath(); q.ellipse(r.range(-rad, rad), r.range(-rad, rad), r.range(0.3, rad * 0.07), r.range(0.3, rad * 0.05), r() * 3, 0, L.TAU); q.fill();
    }
  });
}

function build() {
  const info = K.glyphInfo();
  // the grid pitch follows the stroke width, so that a stroke is about two dots wide whichever glyph this is
  const STEP = Math.max(16, Math.round(info.strokeWidth * 0.46)), rad = STEP * 0.43;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.gridPaper({ base: '#f6f3ea', line: '#9fb0b8', step: STEP, offset: (S / 2) % STEP, seed: 'g30paper', lineAlpha: 0.55, tone: '#8b7a55', stain: 0.18, foxing: 0.12 }), 0, 0);
  const r = L.rng('g30dots' + info.key), n = Math.ceil(S / STEP);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = S / 2 + i * STEP, y = S / 2 + j * STEP;                   // dots sit on the grid intersections
    if (!K.inGlyph(x, y, rad * 0.35)) continue;
    const ox = r.range(-0.05, 0.05) * STEP, oy = r.range(-0.05, 0.05) * STEP, rr = rad * r.range(0.94, 1.05);
    g.fillStyle = L.radial(g, x + ox, y + oy, rr * 0.9, rr * 1.5, [[0, 'rgba(196,60,36,0.10)'], [1, 'rgba(196,60,36,0)']]);    // oil halo in the paper
    g.beginPath(); g.arc(x + ox, y + oy, rr * 1.5, 0, L.TAU); g.fill();
    K.stamp(g, dab(rr, r), x + ox, y + oy, { alpha: r.range(0.86, 0.98), shadow: { dx: 0.6, dy: 1.2, blur: 1.6, color: 'rgba(90,30,10,0.28)' } });
  }
  return c;
}

export default {
  name: '朱点格纸',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
