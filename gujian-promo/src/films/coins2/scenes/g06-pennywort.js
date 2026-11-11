// g06 — 铜钱草: round, crenate, peltate pennywort leaves (veins radiating from the petiole point) laid out as the coin glyph.
// Botanical-plate manner on cream paper: watercolour washes inside a fine ink outline, pale veins, engraver's hatching on the
// shaded side. One row of leaves hugs the outer circle, one row lines the square hole (corner leaves touch the four corners),
// a creeping stolon with thin petioles runs in the gap between the two rows.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const GREENS = ['#5f8f3e', '#739d44', '#4c7a3a', '#86a64e', '#3f6a35', '#6a9648', '#557f33', '#95ad58', '#4a7440', '#7c9c3f'];

function leafSprite(rad, seed, base, deep) {
  const r = L.rng(seed);
  const sz = Math.ceil(rad * 2 + 14);
  return K.sprite(sz, sz, (g) => {
    const n = r.int(9, 13), ph = r() * TAU;
    const ox = r.range(-0.07, 0.07) * rad, oy = r.range(-0.07, 0.07) * rad;       // where the petiole joins (peltate: near the middle)
    const wob = [r.range(0, TAU), r.range(0, TAU)];
    const edge = (t) => {
      const s = Math.abs(Math.sin((n * t) / 2 + ph));
      return rad * (0.945 + 0.055 * Math.pow(s, 0.5)) - rad * 0.012 * (1 + Math.sin(t * 2 + wob[0])) * 0.5 - rad * 0.008 * (1 + Math.sin(t * 5 + wob[1])) * 0.5;
    };
    const path = () => {
      g.beginPath();
      for (let k = 0; k <= 220; k++) { const t = (k / 220) * TAU, rr = edge(t); const x = Math.cos(t) * rr, y = Math.sin(t) * rr; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath();
    };
    const lobeT = (j) => (((j + 0.5) * Math.PI - ph) * 2) / n, notchT = (j) => ((j * Math.PI - ph) * 2) / n;
    const dark = L.shade(base, -0.5), pale = L.mix(L.shade(base, 0.5), '#e8e2a8', 0.45);

    // 1 — wash: lit from the upper left, pigment pooled toward the lower right
    path();
    g.fillStyle = L.radial(g, -rad * 0.34, -rad * 0.38, rad * 0.08, rad * 1.35, [[0, L.shade(base, 0.2)], [0.5, base], [1, L.shade(base, -0.34)]]);
    g.fill();
    g.save(); path(); g.clip();
    // watercolour mottling
    for (let k = 0; k < 9; k++) {
      const a = r() * TAU, d = r.range(0.1, 0.8) * rad, x = Math.cos(a) * d, y = Math.sin(a) * d, rr = r.range(0.18, 0.42) * rad;
      const col = r.chance(0.5) ? L.shade(base, 0.35) : L.shade(base, -0.4);
      g.fillStyle = L.radial(g, x, y, 0, rr, [[0, L.rgba(col, r.range(0.08, 0.2))], [1, L.rgba(col, 0)]]);
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // 2 — pleats: the blade dips a little along each notch line and at the petiole point
    g.lineCap = 'round';
    for (let j = 0; j < n; j++) {
      const t = notchT(j), e = edge(t);
      g.strokeStyle = L.linear(g, ox, oy, Math.cos(t) * e, Math.sin(t) * e, [[0, L.rgba(dark, 0)], [0.45, L.rgba(dark, 0.1)], [1, L.rgba(dark, 0.3)]]);
      g.lineWidth = rad * 0.11;
      g.beginPath(); g.moveTo(ox + Math.cos(t) * rad * 0.2, oy + Math.sin(t) * rad * 0.2); g.lineTo(Math.cos(t) * e, Math.sin(t) * e); g.stroke();
    }
    g.fillStyle = L.radial(g, ox, oy, 0, rad * 0.34, [[0, L.rgba(dark, 0.3)], [1, L.rgba(dark, 0)]]);
    g.fillRect(-rad, -rad, rad * 2, rad * 2);
    // rim: darker band inside the margin (stronger lower right), light catching the upper-left rim
    path(); g.strokeStyle = L.rgba(dark, 0.2); g.lineWidth = rad * 0.16; g.stroke();
    g.fillStyle = L.radial(g, rad * 0.5, rad * 0.56, rad * 0.1, rad * 1.0, [[0, L.rgba(deep, 0.34)], [1, L.rgba(deep, 0)]]);
    g.fillRect(-rad, -rad, rad * 2, rad * 2);
    g.globalCompositeOperation = 'screen';
    g.fillStyle = L.radial(g, -rad * 0.42, -rad * 0.46, 0, rad * 0.75, [[0, 'rgba(255,252,220,0.26)'], [1, 'rgba(255,252,220,0)']]);
    g.fillRect(-rad, -rad, rad * 2, rad * 2);
    g.globalCompositeOperation = 'source-over';

    // 3 — engraver's hatching: short concentric strokes on the shaded side
    for (let k = 0; k < 46; k++) {
      const t = r.range(-0.35, 1.9), rr = r.range(0.34, 0.9) * rad, len = r.range(0.1, 0.24);
      g.strokeStyle = L.rgba(dark, r.range(0.14, 0.3)); g.lineWidth = r.range(0.6, 0.95);
      g.beginPath(); g.arc(ox * 0.5, oy * 0.5, rr, t, t + len); g.stroke();
    }
    // veinlets: a fine net between the main veins
    for (let j = 0; j < n; j++) {
      const t0 = lobeT(j), t1 = lobeT(j + 1);
      for (let k = 0; k < 4; k++) {
        const rr = rad * (0.3 + 0.16 * k + r.range(-0.04, 0.04)), b = r.range(0.1, 0.3) * (t1 - t0);
        g.strokeStyle = L.rgba(pale, r.range(0.22, 0.42)); g.lineWidth = 0.7;
        g.beginPath(); g.arc(ox, oy, rr, t0 + b, t1 - b * r.range(0.5, 1.2)); g.stroke();
      }
    }
    // 4 — main veins: pale, tapering, forking toward the margin
    for (let j = 0; j < n; j++) {
      const t = lobeT(j) + r.range(-0.03, 0.03), e = edge(t) * 0.93;
      const bx = ox * 0.3 + Math.cos(t + r.range(-0.05, 0.05)) * e * 0.55, by = oy * 0.3 + Math.sin(t + r.range(-0.05, 0.05)) * e * 0.55;
      const ex = Math.cos(t) * e, ey = Math.sin(t) * e;
      g.strokeStyle = L.rgba(dark, 0.22); g.lineWidth = 2.6;                         // soft dark edge under the vein so it reads on light washes
      g.beginPath(); g.moveTo(ox + 1, oy + 1.2); g.quadraticCurveTo(bx + 1, by + 1.2, ex + 0.6, ey + 0.8); g.stroke();
      g.strokeStyle = L.rgba(pale, 0.9); g.lineWidth = 1.7;
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(bx, by); g.stroke();
      g.lineWidth = 1.05; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
      for (const sgn of [-1, 1]) {
        const tf = t + sgn * (Math.PI / n) * r.range(0.55, 0.8), ef = edge(tf) * 0.9;
        g.strokeStyle = L.rgba(pale, 0.7); g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(Math.cos(t + sgn * 0.08) * e * 0.8, Math.sin(t + sgn * 0.08) * e * 0.8, Math.cos(tf) * ef, Math.sin(tf) * ef); g.stroke();
      }
    }
    // the odd blemish
    if (r.chance(0.3)) {
      const a = r() * TAU, d = r.range(0.4, 0.8) * rad, x = Math.cos(a) * d, y = Math.sin(a) * d, rr = r.range(1.6, 3.4);
      g.fillStyle = L.radial(g, x, y, 0, rr * 2.2, [[0, 'rgba(120,84,30,0.55)'], [0.5, 'rgba(150,120,40,0.25)'], [1, 'rgba(150,120,40,0)']]);
      g.beginPath(); g.arc(x, y, rr * 2.2, 0, TAU); g.fill();
    }
    g.restore();
    // petiole point: a pale boss with a dark ring
    g.fillStyle = L.rgba(dark, 0.55); g.beginPath(); g.arc(ox + 0.5, oy + 0.6, 3.3, 0, TAU); g.fill();
    g.fillStyle = L.rgba(pale, 0.95); g.beginPath(); g.arc(ox, oy, 2.2, 0, TAU); g.fill();
    // 5 — ink outline, heavier on the shadow side
    path(); g.lineJoin = 'round'; g.strokeStyle = L.rgba(L.shade(base, -0.68), 0.7); g.lineWidth = 1.25; g.stroke();
    g.save(); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, rad * 1.2, -0.25, 1.85); g.closePath(); g.clip();
    path(); g.strokeStyle = L.rgba(L.shade(base, -0.75), 0.5); g.lineWidth = 2.1; g.stroke(); g.restore();
  });
}

function stemLine(q, pts, w, r) {
  const draw = () => { q.beginPath(); q.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; q.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); } const e = pts[pts.length - 1]; q.lineTo(e[0], e[1]); };
  q.lineCap = 'round'; q.lineJoin = 'round';
  q.strokeStyle = 'rgba(62,74,30,0.8)'; q.lineWidth = w + 1.5; draw(); q.stroke();
  q.strokeStyle = r.chance(0.5) ? '#a9b56a' : '#9aa85c'; q.lineWidth = w; draw(); q.stroke();
  q.save(); q.translate(-0.6, -0.7); q.strokeStyle = 'rgba(232,236,180,0.6)'; q.lineWidth = Math.max(0.6, w * 0.3); draw(); q.stroke(); q.restore();
}

function build() {
  const G = K.GLYPH;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const paper = K.paper({ base: '#f2ebd9', tone: '#8a6a3a', seed: 'g06paper', fiber: 0.55, stain: 0.3, foxing: 0.22, edge: 0.2 });
  g.drawImage(paper, 0, 0);
  // plate mark: the faint bevel an intaglio plate leaves in the sheet
  g.strokeStyle = 'rgba(110,84,48,0.20)'; g.lineWidth = 1.4; g.strokeRect(46.5, 46.5, S - 93, S - 93);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.strokeRect(48.5, 48.5, S - 93, S - 93);

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  const r = L.rng('g06-pennywort');
  const leaves = [];
  const RM = 243;                                                       // the stolon runs here, between the two rows
  // row hugging the outer circle
  const nR = 27, ph0 = r() * TAU;
  for (let i = 0; i < nR; i++) {
    const rad = r.range(47, 56), t = ph0 + ((i + r.range(-0.1, 0.1)) / nR) * TAU;
    leaves.push({ x: G.cx + Math.cos(t) * (G.R - rad), y: G.cy + Math.sin(t) * (G.R - rad), rad, z: r(), row: 'ring' });
  }
  // row lining the square hole: four leaves a side, tangent to the edge …
  for (const [nx, ny] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) for (const u of [-97, -33, 33, 97]) {
    const rad = r.range(46, 53), d = G.a + rad, uu = u + r.range(-4, 4);
    leaves.push({ x: G.cx + nx * d - ny * uu, y: G.cy + ny * d + nx * uu, rad, z: r(), row: 'square' });
  }
  // … and one in each corner, its margin touching the corner point
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const rad = r.range(49, 54), k = rad * 0.7071;
    leaves.push({ x: G.cx + sx * (G.a + k), y: G.cy + sy * (G.a + k), rad, z: 1 + r(), row: 'square' });
  }
  // smaller, darker leaves underneath in the gap
  const nF = 16, phF = r() * TAU;
  for (let i = 0; i < nF; i++) {
    const rad = r.range(33, 41), t = phF + ((i + r.range(-0.2, 0.2)) / nF) * TAU, rr = RM + r.range(-7, 7);
    leaves.push({ x: G.cx + Math.cos(t) * rr, y: G.cy + Math.sin(t) * rr, rad, z: -1 + r() * 0.5, row: 'fill' });
  }

  // stolon + petioles (drawn first; the blades sit over them)
  const st = [];
  for (let k = 0; k <= 96; k++) { const t = (k / 96) * TAU; const rr = RM + 6 * Math.sin(t * 5 + 1.3) + 3 * Math.sin(t * 11 + 0.4); st.push([G.cx + Math.cos(t) * rr, G.cy + Math.sin(t) * rr]); }
  q.save(); q.shadowColor = 'rgba(45,40,15,0.3)'; q.shadowBlur = 4; q.shadowOffsetX = 2; q.shadowOffsetY = 3;
  stemLine(q, st, 3.4, r);
  for (const lf of leaves) {
    if (lf.row === 'fill') continue;
    const t = Math.atan2(lf.y - G.cy, lf.x - G.cx) + r.range(-0.1, 0.1);
    const bx = G.cx + Math.cos(t) * RM, by = G.cy + Math.sin(t) * RM;
    const mx = (bx + lf.x) / 2 + r.range(-9, 9), my = (by + lf.y) / 2 + r.range(-9, 9);
    stemLine(q, [[bx, by], [mx, my], [lf.x, lf.y]], r.range(1.9, 2.6), r);
    // node with a few hair roots
    q.fillStyle = '#7d8a44'; q.beginPath(); q.arc(bx, by, 3.1, 0, TAU); q.fill();
    for (let k = 0; k < 3; k++) {
      const a = t + Math.PI / 2 + r.range(-1.2, 1.2), len = r.range(7, 15);
      q.strokeStyle = 'rgba(120,96,56,0.7)'; q.lineWidth = 0.8;
      q.beginPath(); q.moveTo(bx, by); q.quadraticCurveTo(bx + Math.cos(a) * len * 0.5 + r.range(-3, 3), by + Math.sin(a) * len * 0.5 + r.range(-3, 3), bx + Math.cos(a) * len, by + Math.sin(a) * len); q.stroke();
    }
  }
  q.restore();

  leaves.sort((a, b) => a.z - b.z);
  leaves.forEach((lf, i) => {
    let base = GREENS[r.int(0, GREENS.length - 1)];
    base = L.mix(base, r.chance(0.5) ? '#2f5a3a' : '#a8b850', r.range(0, 0.22));
    if (lf.row === 'fill') base = L.mix(base, '#2e5230', 0.45);
    const spr = leafSprite(lf.rad, 'g06leaf' + i, base, '#1f3a22');
    K.stamp(q, spr, lf.x, lf.y, { shadow: { dx: 3, dy: 5, blur: 7, color: 'rgba(30,40,14,0.42)' } });
  });

  K.soak(ink, paper, 0.5);                                              // paper tooth shows through the washes
  K.wear(ink, { seed: 'g06wear', amount: 0.1, size: 1.2 });
  g.drawImage(ink, 0, 0);
  return c;
}

export default {
  name: '铜钱草',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },
};
