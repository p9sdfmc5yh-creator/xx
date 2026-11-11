// g24 — 星图: an old celestial-atlas plate. Deep teal printed sky, a stippled Milky Way, and gilt stars joined by fine
// lines into a coin-shaped "constellation": a ring of stars on the outer circle, four bright stars on the corners of the square hole.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

function starPath(g, x, y, r, n, rot, inner) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const t = rot + (i * Math.PI) / n, rr = i % 2 ? r * inner : r;
    i ? g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) : g.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
  }
  g.closePath();
}
// a gilt star symbol: lit from the top-left, a darker lower-right edge, a pale core
function giltStar(g, x, y, r, n, rot, inner = 0.46) {
  starPath(g, x, y, r, n, rot, inner);
  g.fillStyle = L.linear(g, x - r, y - r, x + r, y + r, [[0, '#fff4c8'], [0.42, '#ecc76c'], [1, '#a06c24']]);
  g.fill();
  g.strokeStyle = 'rgba(70,42,8,0.55)'; g.lineWidth = Math.max(0.7, r * 0.05); g.lineJoin = 'round'; g.stroke();
  if (r > 8) {                                               // facet lines from the centre to each point, like an engraved star
    g.strokeStyle = 'rgba(110,70,16,0.38)'; g.lineWidth = Math.max(0.6, r * 0.035);
    g.beginPath();
    for (let i = 0; i < n; i++) { const t = rot + (i * TAU) / n; g.moveTo(x, y); g.lineTo(x + Math.cos(t) * r * 0.86, y + Math.sin(t) * r * 0.86); }
    g.stroke();
  }
  g.fillStyle = L.radial(g, x - r * 0.1, y - r * 0.12, 0, r * 0.42, [[0, 'rgba(255,252,232,0.95)'], [1, 'rgba(255,240,190,0)']]);
  g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fill();
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const G = K.GLYPH, r = L.rng('g24sky');

  // 1 ── the printed sky: deep teal ink, mottled where the stone took it unevenly
  g.drawImage(L.noiseTex(S, S, { seed: 'g24ink', scale: 520, octaves: 5, res: 0.5,
    ramp: [[0, '#07242b'], [0.5, '#0c343c'], [1, '#14505a']] }), 0, 0, S, S);
  g.fillStyle = L.radial(g, G.cx - 120, G.cy - 140, 80, 820, [[0, 'rgba(40,120,125,0.16)'], [1, 'rgba(3,14,18,0.34)']]);
  g.fillRect(0, 0, S, S);

  // 2 ── the Milky Way: a soft pale band from lower-left to upper-right, cloud first, then engraver's stipple
  const mw = L.makeCanvas(S, S), m = mw.getContext('2d');
  m.drawImage(L.noiseTex(S, S, { seed: 'g24mw', scale: 210, octaves: 5, res: 0.5, warp: 0.18, contrast: 1.25,
    ramp: [[0, '#000000'], [0.4, '#020a0b'], [0.75, '#183f40'], [1, '#3f7f7a']] }), 0, 0, S, S);
  m.save(); m.translate(S / 2, S / 2); m.rotate(-0.72);
  m.fillStyle = L.linear(m, 0, -330, 0, 330, [[0, '#000'], [0.3, 'rgba(0,0,0,0.5)'], [0.5, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0.5)'], [1, '#000']]);
  m.fillRect(-900, -330, 1800, 660); m.fillStyle = '#000'; m.fillRect(-900, -1200, 1800, 871); m.fillRect(-900, 329, 1800, 871);
  m.restore();
  g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.8; g.drawImage(mw, 0, 0); g.restore();
  const nz = L.makeNoise('g24st');
  for (let i = 0; i < 9000; i++) {
    const u = r.range(-780, 780), v = r.gauss() * 105;                        // band coordinates
    const x = S / 2 + u * Math.cos(-0.72) - v * Math.sin(-0.72), y = S / 2 + u * Math.sin(-0.72) + v * Math.cos(-0.72);
    if (x < 0 || y < 0 || x > S || y > S) continue;
    if (nz.fbm(x / 150, y / 150) < r.range(-0.25, 0.3)) continue;             // stipple gathers into clouds
    g.fillStyle = L.rgba(r() < 0.3 ? '#f1dfa6' : '#cfe6dc', r.range(0.16, 0.5));
    g.beginPath(); g.arc(x, y, r.range(0.6, 1.5), 0, TAU); g.fill();
  }

  // 3 ── atlas furniture in pale teal: hour lines, declination circles, a graduated scale ring (no numerals)
  g.save(); g.translate(G.cx, G.cy); g.lineCap = 'butt';
  g.strokeStyle = 'rgba(150,205,198,0.17)'; g.lineWidth = 1.2;
  for (const rad of [G.R + 64, G.R + 92, 610, 760]) { g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke(); }
  for (let k = 0; k < 24; k++) {
    const t = (k / 24) * TAU + 0.131;
    g.beginPath(); g.moveTo(Math.cos(t) * (G.R + 92), Math.sin(t) * (G.R + 92)); g.lineTo(Math.cos(t) * 800, Math.sin(t) * 800); g.stroke();
  }
  for (let k = 0; k < 360; k++) {
    const t = (k / 360) * TAU, long = k % 10 === 0, mid = k % 5 === 0;
    const r0 = G.R + 64, r1 = r0 + (long ? 28 : mid ? 19 : 12);
    g.strokeStyle = `rgba(165,215,206,${long ? 0.42 : 0.26})`; g.lineWidth = long ? 1.5 : 1.1;
    g.beginPath(); g.moveTo(Math.cos(t) * r0, Math.sin(t) * r0); g.lineTo(Math.cos(t) * r1, Math.sin(t) * r1); g.stroke();
  }
  g.restore();

  // 4 ── the coin body: a breath lighter, as if the constellation's field were tinted on the plate
  g.save(); g.globalCompositeOperation = 'screen';
  K.fillGlyph(g, 'rgba(36,92,96,0.30)');
  g.restore();

  // 5 ── ink drop-outs and paper fibres showing through the dark ink
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(190,222,212,${r.range(0.05, 0.2).toFixed(3)})`;
    g.beginPath(); g.ellipse(r() * S, r() * S, r.range(0.5, 1.5), r.range(0.4, 1.0), r() * 3, 0, TAU); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, len = r.range(10, 46), a = r() * TAU, b = r.range(-0.7, 0.7);
    g.strokeStyle = `rgba(175,215,205,${r.range(0.035, 0.09).toFixed(3)})`; g.lineWidth = r.range(0.6, 1.2);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + b) * len * 0.5, y + Math.sin(a + b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }

  // 6 ── gold: everything gilt goes on its own layer so it can be worn like old leaf
  const gold = L.makeCanvas(S, S), q = gold.getContext('2d');
  const ring = [], N = 28;
  for (let i = 0; i < N; i++) {
    const t = -Math.PI / 2 + ((i + r.range(-0.2, 0.2)) / N) * TAU, rr = G.R + r.range(-1.5, 1.5);
    ring.push({ x: G.cx + Math.cos(t) * rr, y: G.cy + Math.sin(t) * rr, big: i % 7 === 0, mid: i % 7 === 3 || i % 7 === 5 });
  }
  const sq = [];
  [[-1, -1, 1, 0], [1, -1, 0, 1], [1, 1, -1, 0], [-1, 1, 0, -1]].forEach(([sx, sy, dx, dy]) => {
    sq.push({ x: G.cx + sx * G.a, y: G.cy + sy * G.a, corner: true });
    for (const f of [0.68, 1.34]) { const d = G.a * (f + r.range(-0.08, 0.08)); sq.push({ x: G.cx + sx * G.a + dx * d, y: G.cy + sy * G.a + dy * d }); }
  });
  const poly = (pts, w, style) => { q.strokeStyle = style; q.lineWidth = w; q.lineJoin = 'round'; q.beginPath(); pts.forEach((p, i) => (i ? q.lineTo(p.x, p.y) : q.moveTo(p.x, p.y))); q.closePath(); q.stroke(); };
  // inner rims of the coin as dotted boundary lines (the 外郭 / 内郭 of the coin, drawn the way atlases dot constellation borders)
  q.save(); q.setLineDash([1.5, 8]); q.lineCap = 'round'; q.strokeStyle = 'rgba(232,196,110,0.62)'; q.lineWidth = 2.2;
  q.beginPath(); q.arc(G.cx, G.cy, G.R - 36, 0, TAU); q.stroke();
  q.strokeRect(G.cx - G.a - 28, G.cy - G.a - 28, (G.a + 28) * 2, (G.a + 28) * 2);
  q.restore();
  // field stars inside the coin body, a few joined by hair-lines to the rim stars
  const field = K.scatter({ seed: 'g24field', spacing: 74, margin: 52, max: 34 });
  field.forEach((p, i) => { p.r = i % 5 === 0 ? r.range(8.5, 11) : r.range(4.5, 7.5); });
  // the constellation lines
  poly(ring, 7, 'rgba(240,205,120,0.13)'); poly(sq, 7, 'rgba(240,205,120,0.13)');
  poly(ring, 2.4, 'rgba(236,202,116,0.95)'); poly(sq, 2.4, 'rgba(236,202,116,0.95)');
  field.forEach((p) => giltStar(q, p.x, p.y, p.r, p.r > 8 ? 6 : 5, r() * TAU, 0.44));
  ring.forEach((p) => { const rad = p.big ? r.range(19, 22) : p.mid ? r.range(14, 16) : r.range(10, 12.5); p.r = rad; giltStar(q, p.x, p.y, rad, p.big ? 8 : 6, r() * TAU, p.big ? 0.42 : 0.46); });
  sq.forEach((p) => { p.r = p.corner ? r.range(31, 34) : r.range(10, 12.5); giltStar(q, p.x, p.y, p.r, p.corner ? 8 : 6, p.corner ? Math.PI / 8 + r.range(-0.05, 0.05) : r() * TAU, p.corner ? 0.4 : 0.46); });
  // loose small stars over the rest of the sky
  for (let i = 0; i < 150; i++) {
    const x = r() * S, y = r() * S; if (K.sdGlyph(x, y) < 26 && K.sdGlyph(x, y) > -400) { if (Math.abs(K.sdGlyph(x, y)) < 26 || K.inGlyph(x, y)) continue; }
    if (Math.max(Math.abs(x - G.cx), Math.abs(y - G.cy)) < G.a - 30 && r() < 0.6) continue;      // keep the hole quiet
    const rad = r() < 0.15 ? r.range(5.5, 8) : r.range(2.2, 4.6);
    q.globalAlpha = r.range(0.7, 1); giltStar(q, x, y, rad, rad > 5 ? 6 : 4, r() * TAU, rad > 5 ? 0.45 : 0.4); q.globalAlpha = 1;
  }
  K.wear(gold, { seed: 'g24wear', amount: 0.22, size: 1.3 });

  // soft halos under the gilt (screened onto the ink), then the gilt itself
  [...ring, ...sq].forEach((p) => L.glow(g, p.x, p.y, p.r * (p.corner ? 3.4 : 2.8), '#f3d58a', p.corner ? 0.42 : 0.26));
  field.forEach((p) => L.glow(g, p.x, p.y, p.r * 2.6, '#f3d58a', 0.16));
  g.save(); g.shadowColor = 'rgba(2,10,12,0.55)'; g.shadowBlur = 2.5; g.shadowOffsetX = 0.8; g.shadowOffsetY = 1.2;   // leaf sits a hair proud of the paper
  g.drawImage(gold, 0, 0); g.restore();

  // 7 ── the sheet darkens toward its edges
  g.fillStyle = L.radial(g, S / 2, S / 2, S * 0.46, S * 0.82, [[0, 'rgba(2,10,13,0)'], [1, 'rgba(2,10,13,0.42)']]);
  g.fillRect(0, 0, S, S);
  return c;
}

export default {
  name: '星图',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },             // a 3-frame flash: perfectly still
};
