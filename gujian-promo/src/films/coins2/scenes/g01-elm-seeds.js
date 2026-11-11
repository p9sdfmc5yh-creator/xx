// g01 — 榆钱: pale green elm samaras (a round papery wing with one seed in the middle and a notch at the tip), painted like a
// botanical watercolour on off-white paper, laid out as the coin glyph: one row hugging the outer circle, one row lining the square hole.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const WASH = [
  { c: '#e6eec0', m: '#d3e3a4', e: '#b3cf84', rim: '#8fb162', seed: ['#cfcf80', '#9aa850'] },
  { c: '#e9edb8', m: '#dbe3a0', e: '#bfd183', rim: '#98b060', seed: ['#d4cc7a', '#a3a84c'] },
  { c: '#dfeec6', m: '#c8e0a6', e: '#a6c98a', rim: '#82aa66', seed: ['#c6cf86', '#8fa556'] },
  { c: '#ecebb4', m: '#e0dd98', e: '#c8c97c', rim: '#a3a85c', seed: ['#d6c672', '#a89c48'] },
];

// one samara, drawn around (0,0) with its notch pointing along `rot`; all lighting is computed in page space (light from the top-left)
function samara(g, rad, rot, r) {
  const w = r.pick(WASH), cs = Math.cos(rot), sn = Math.sin(rot);
  const loc = (dx, dy) => [dx * cs + dy * sn, -dx * sn + dy * cs];          // page-space vector → local (rotated) frame
  const ph1 = r() * TAU, ph2 = r() * TAU, nd = r.range(0.16, 0.25), nw = r.range(0.06, 0.09);
  const rimR = (t) => {
    let dt = t + Math.PI / 2; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    return rad * (1 + 0.03 * Math.sin(2 * t + ph1) + 0.02 * Math.sin(3 * t + ph2) + 0.009 * Math.sin(7 * t + ph2) + 0.005 * Math.sin(13 * t + ph1)) * (1 - nd * Math.exp(-(dt / nw) * (dt / nw)));
  };
  const outline = () => { g.beginPath(); for (let k = 0; k < 140; k++) { const t = (k / 140) * TAU, rr = rimR(t); k ? g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : g.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); } g.closePath(); };
  const srx = rad * r.range(0.27, 0.31), sry = rad * r.range(0.35, 0.40), sy = rad * 0.04;

  g.save(); g.rotate(rot); g.lineCap = 'round'; g.lineJoin = 'round';
  // stalk + dried calyx under the wing
  const sx = r.range(-3, 3), sl = r.range(5, 9);
  g.strokeStyle = 'rgba(132,112,64,0.85)'; g.lineWidth = 1.7;
  g.beginPath(); g.moveTo(0, rad * 0.9); g.quadraticCurveTo(sx * 0.3, rad + sl * 0.5, sx, rad + sl); g.stroke();
  // wash
  outline(); g.globalAlpha = 0.95;
  g.fillStyle = L.radial(g, 0, 0, rad * 0.12, rad * 1.02, [[0, w.c], [0.55, w.m], [0.9, w.e], [1, w.rim]]); g.fill(); g.globalAlpha = 1;
  g.save(); outline(); g.clip();
  // wet-in-wet blooms
  for (let k = 0; k < 6; k++) {
    const a = r() * TAU, d = rad * r.range(0.25, 0.85), br = rad * r.range(0.25, 0.55), x = Math.cos(a) * d, y = Math.sin(a) * d;
    const col = r.pick(['#b4d184', '#ecebac', '#c2dca2', '#d9d488', '#f4f3d6']);
    g.fillStyle = L.radial(g, x, y, 0, br, [[0, L.rgba(col, r.range(0.22, 0.42))], [1, L.rgba(col, 0)]]); g.fillRect(x - br, y - br, br * 2, br * 2);
  }
  // page-space light: brighter top-left, cooler lower-right
  { const [ax, ay] = loc(-rad, -rad), [bx, by] = loc(rad, rad);
    g.fillStyle = L.linear(g, ax, ay, bx, by, [[0, 'rgba(255,255,236,0.20)'], [0.5, 'rgba(255,255,236,0)'], [1, 'rgba(84,118,60,0.16)']]); g.fillRect(-rad * 1.2, -rad * 1.2, rad * 2.4, rad * 2.4); }
  // radiating veins, forking toward the rim, with a few cross veinlets
  const nv = r.int(22, 28), v0 = r() * TAU, angs = [];
  for (let k = 0; k < nv; k++) {
    const a = v0 + (k / nv) * TAU + r.range(-0.05, 0.05); angs.push(a);
    const r0 = Math.hypot(Math.cos(a) * srx, Math.sin(a) * sry) * 0.98, r1 = rimR(a) * 0.985, bend = r.range(-0.16, 0.16);
    g.strokeStyle = `rgba(98,132,64,${r.range(0.12, 0.34).toFixed(3)})`; g.lineWidth = r.range(0.6, 1.1);
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 + sy * 0.5);
    g.quadraticCurveTo(Math.cos(a + bend) * (r0 + r1) * 0.5, Math.sin(a + bend) * (r0 + r1) * 0.5, Math.cos(a + bend * 0.4) * r1, Math.sin(a + bend * 0.4) * r1); g.stroke();
    if (r.chance(0.6)) {
      const rf = L.lerp(r0, r1, r.range(0.45, 0.7)), fa = a + r.pick([-1, 1]) * r.range(0.07, 0.12);
      g.lineWidth = 0.65; g.beginPath(); g.moveTo(Math.cos(a + bend * 0.6) * rf, Math.sin(a + bend * 0.6) * rf); g.lineTo(Math.cos(fa) * r1, Math.sin(fa) * r1); g.stroke();
    }
  }
  g.lineWidth = 0.55;
  for (let k = 0; k < 34; k++) {
    const i = r.int(0, nv - 1), a0 = angs[i], a1 = a0 + TAU / nv, rr = rad * r.range(0.5, 0.94);
    g.strokeStyle = `rgba(104,138,70,${r.range(0.14, 0.26).toFixed(3)})`;
    g.beginPath(); g.arc(0, 0, rr, a0, a1); g.stroke();
  }
  // pigment pooled along the rim (dark inner edge) and a paler dry band just inside it
  outline(); g.strokeStyle = L.rgba(w.rim, 0.30); g.lineWidth = 7; g.stroke();
  outline(); g.strokeStyle = 'rgba(96,134,62,0.5)'; g.lineWidth = 2.0; g.stroke();
  // tiny rust flecks
  for (let k = 0, n = r.int(2, 6); k < n; k++) {
    const a = r() * TAU, d = rad * r.range(0.45, 0.93);
    g.fillStyle = `rgba(150,112,52,${r.range(0.3, 0.6).toFixed(3)})`;
    g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r.range(0.6, 1.5), r.range(0.5, 1.1), r() * 3, 0, TAU); g.fill();
  }
  // the seed is a low bulge: soft shadow on the wing to its lower-right, then the seed body
  { const [ox, oy] = loc(rad * 0.07, rad * 0.09);
    g.fillStyle = L.radial(g, ox, oy + sy, sry * 0.6, sry * 1.45, [[0, 'rgba(78,104,48,0.34)'], [1, 'rgba(78,104,48,0)']]); g.fillRect(-rad, -rad, rad * 2, rad * 2); }
  // style line from the seed to the notch
  g.strokeStyle = 'rgba(108,128,58,0.55)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, sy - sry * 0.9); g.lineTo(r.range(-1, 1), -rad * (1 - nd) * 0.96); g.stroke();
  { const [ax, ay] = loc(-srx, -sry), [bx, by] = loc(srx, sry);
    g.beginPath(); g.ellipse(0, sy, srx, sry, 0, 0, TAU);
    g.fillStyle = L.linear(g, ax, ay + sy, bx, by + sy, [[0, w.seed[0]], [0.55, L.mix(w.seed[0], w.seed[1], 0.6)], [1, w.seed[1]]]); g.fill();
    g.strokeStyle = 'rgba(104,116,50,0.6)'; g.lineWidth = 1.1; g.stroke();
    g.save(); g.clip();
    for (let k = 0; k < 5; k++) {                                        // faint wrinkles on the seed coat
      const u = (k - 2) * srx * 0.34; g.strokeStyle = 'rgba(118,128,58,0.28)'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(u * 0.5, sy - sry); g.quadraticCurveTo(u * 1.3, sy, u * 0.5, sy + sry); g.stroke();
    }
    const [hx, hy] = loc(-srx * 0.34, -sry * 0.34);
    g.fillStyle = L.radial(g, hx, hy + sy, 0, srx * 0.75, [[0, 'rgba(255,255,226,0.62)'], [1, 'rgba(255,255,226,0)']]); g.fillRect(-rad, -rad, rad * 2, rad * 2);
    g.restore(); }
  g.restore();
  // crisp darker lip at the notch + calyx scar at the base (on top of the wing)
  g.fillStyle = 'rgba(140,112,58,0.8)'; g.beginPath(); g.ellipse(0, rad * 0.955, 3.2, 2.1, 0, 0, TAU); g.fill();
  g.restore();
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const pap = K.paper({ base: '#f4efe2', tone: '#9a8656', seed: 'g01paper', fiber: 0.55, stain: 0.2, foxing: 0.12, edge: 0.16 });
  g.drawImage(pap, 0, 0);
  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  const SIZE = 92, rows = K.coinLayout({ seed: 'g01lay', size: SIZE, jitter: 0.15, fill: false });
  // a third row tucked UNDER the other two, between the rim row and the hole row, so the coin's body reads as one solid mass
  const sq = rows.filter((s) => s.row === 'square');
  for (const s of sq) { s.x = K.GLYPH.cx + (s.x - K.GLYPH.cx) * 0.977; s.y = K.GLYPH.cy + (s.y - K.GLYPH.cy) * 0.977; }   // round wings only touch the hole's edge at one point each: pull the row in 4 px so the edge averages onto the line
  const mid = K.ringSlots({ n: 18, r: K.GLYPH.R - SIZE * 1.27, seed: 'g01mid', jitter: 0.5 })
    .filter((m) => sq.every((s) => Math.hypot(s.x - m.x, s.y - m.y) > 40)).map((m) => ({ ...m, row: 'fill' }));
  const slots = [...mid, ...rows];
  const r = L.rng('g01seeds');
  for (const s of slots) {
    const rad = (SIZE / 2) * (s.row === 'fill' ? r.range(0.93, 1.02) : r.range(0.99, 1.05));
    const rot = r() * TAU, rr = L.rng('g01s' + s.row + s.i);
    const spr = K.sprite(150, 150, (sg) => samara(sg, rad, rot, rr));
    K.stamp(q, spr, s.x, s.y, { alpha: 0.96, shadow: { dx: 3, dy: 5, blur: 7, color: 'rgba(70,74,40,0.20)' } });
  }
  K.soak(ink, pap, 0.55);                                             // paper tooth showing through the washes
  g.drawImage(ink, 0, 0);
  return c;
}

export default {
  name: '榆钱',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                        // 3-frame flash: perfectly still
};
