// h1 — 银杏叶: pressed golden ginkgo leaves (fan blades, radiating veins, long thin petioles) laid on charcoal-black paper so that
// together they make the coin glyph; three red maple leaves tucked in. Object-built glyph: a ring of fans whose arcs hug the outer
// circle, a row of fans whose arcs line the square hole, loose leaves filling the body; the collage is trimmed to the glyph outline.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LS = 1240, O = (LS - S) / 2;
let layer = null;

const GOLDS = [
  ['#b98f24', '#e0ad28', '#f2c83c'],
  ['#a9a238', '#dcb52e', '#f0cb44'],
  ['#c08a22', '#e6a926', '#f3bd32'],
  ['#b5962c', '#e8ba34', '#f6d455'],
  ['#b37a1e', '#d99a22', '#e9b22e'],
];

// one ginkgo leaf in local coords: base (petiole joint) at the origin, blade fanning up (−y), petiole hanging down (+y)
function ginkgo(q, rho, r, o) {
  const th = o.th, notch = o.notch, ph = r() * TAU, nw = 0.003 + r() * 0.006;
  const rad = (t) => rho * (1 + 0.03 * Math.sin(t * 9 + ph) + 0.016 * Math.sin(t * 23 + ph * 2) + 0.008 * Math.sin(t * 51 + ph * 3))
    * (1 - notch * Math.exp(-(t * t) / nw)) * (1 - 0.1 * Math.pow(Math.abs(t / th), 5));
  const path = () => {
    q.beginPath(); q.moveTo(0, 0);
    const rl = rad(-th);
    q.quadraticCurveTo(Math.sin(-th * 0.8) * rl * 0.5, -Math.cos(-th * 0.8) * rl * 0.5, Math.sin(-th) * rl, -Math.cos(-th) * rl);
    for (let k = 1; k <= 96; k++) { const t = -th + (2 * th * k) / 96, rr = rad(t); q.lineTo(Math.sin(t) * rr, -Math.cos(t) * rr); }
    const rr2 = rad(th);
    q.quadraticCurveTo(Math.sin(th * 0.8) * rr2 * 0.5, -Math.cos(th * 0.8) * rr2 * 0.5, 0, 0);
    q.closePath();
  };
  const pal = r.pick(GOLDS);
  // petiole first (the blade overlaps its joint)
  const plen = rho * r.range(0.55, 0.8), bend = rho * r.range(-0.22, 0.22);
  q.lineCap = 'round';
  q.strokeStyle = L.shade(pal[0], -0.25); q.lineWidth = 3.4;
  q.beginPath(); q.moveTo(0, -4); q.quadraticCurveTo(bend * 0.2, plen * 0.55, bend, plen); q.stroke();
  q.strokeStyle = L.shade(pal[1], 0.12); q.lineWidth = 1.3;
  q.beginPath(); q.moveTo(-0.7, -4); q.quadraticCurveTo(bend * 0.2 - 0.7, plen * 0.55, bend - 0.7, plen - 1); q.stroke();
  q.fillStyle = L.shade(pal[0], -0.35); q.beginPath(); q.ellipse(bend, plen, 2.6, 2.1, 0, 0, TAU); q.fill();
  // blade
  path();
  q.fillStyle = L.radial(q, 0, 0, 0, rho * 1.05, [[0, pal[0]], [0.3, pal[1]], [0.8, pal[2]], [1, L.shade(pal[2], -0.08)]]);
  q.fill();
  q.save(); path(); q.clip();
  // gentle fold: one half catches the light, the other falls away
  const side = o.flip ? -1 : 1;
  q.fillStyle = L.linear(q, -rho * side, 0, rho * side, 0, [[0, 'rgba(255,244,190,0.20)'], [0.48, 'rgba(255,244,190,0.02)'], [0.52, 'rgba(90,50,0,0.05)'], [1, 'rgba(90,50,0,0.22)']]);
  q.fillRect(-rho * 1.2, -rho * 1.2, rho * 2.4, rho * 1.4);
  // pleats: broad, faint radial undulations of the dried blade
  for (let i = 0, n = r.int(5, 8); i < n; i++) {
    const t = r.range(-th, th), dw = r.range(0.04, 0.13), lite = r() < 0.5;
    q.fillStyle = L.radial(q, 0, 0, rho * 0.15, rho * 1.05, [[0, 'rgba(0,0,0,0)'], [0.5, lite ? 'rgba(255,242,170,0.13)' : 'rgba(104,60,0,0.12)'], [1, lite ? 'rgba(255,242,170,0.05)' : 'rgba(104,60,0,0.16)']]);
    q.beginPath(); q.moveTo(0, 0); q.lineTo(Math.sin(t - dw) * rho * 1.2, -Math.cos(t - dw) * rho * 1.2); q.lineTo(Math.sin(t + dw) * rho * 1.2, -Math.cos(t + dw) * rho * 1.2); q.closePath(); q.fill();
  }
  // veins: straight rays from the joint, forking outward (later rays start further out)
  const N = Math.round(th * 46);
  for (let i = 0; i < N; i++) {
    const t = -th + (2 * th * (i + 0.5 + r.range(-0.25, 0.25))) / N;
    const s0 = (i % 4 === 0 ? 0.02 : i % 2 === 0 ? r.range(0.3, 0.42) : r.range(0.55, 0.7)) * rho, s1 = rad(t) + 2;
    const sx = Math.sin(t), sy = -Math.cos(t);
    q.strokeStyle = 'rgba(122,78,10,0.36)'; q.lineWidth = r.range(0.7, 1.05);
    q.beginPath(); q.moveTo(sx * s0, sy * s0); q.lineTo(sx * s1, sy * s1); q.stroke();
    q.strokeStyle = 'rgba(255,238,160,0.26)'; q.lineWidth = 0.8;
    q.beginPath(); q.moveTo(sx * s0 - sy * 1.0, sy * s0 + sx * 1.0); q.lineTo(sx * s1 - sy * 1.0, sy * s1 + sx * 1.0); q.stroke();
  }
  // browning along the margin, a few age spots
  for (let i = 0, n = r.int(3, 7); i < n; i++) {
    const t = r.range(-th, th), rr = rad(t) * r.range(0.9, 1.02), x = Math.sin(t) * rr, y = -Math.cos(t) * rr, sz = r.range(6, 20);
    q.fillStyle = L.radial(q, x, y, 0, sz, [[0, 'rgba(140,74,12,0.34)'], [1, 'rgba(140,74,12,0)']]); q.fillRect(x - sz, y - sz, sz * 2, sz * 2);
  }
  for (let i = 0, n = r.int(2, 6); i < n; i++) {
    const t = r.range(-th, th) * 0.9, rr = rho * r.range(0.3, 0.9), x = Math.sin(t) * rr, y = -Math.cos(t) * rr, sz = r.range(1.2, 3.6);
    q.fillStyle = L.radial(q, x, y, 0, sz, [[0, 'rgba(96,52,10,0.6)'], [0.6, 'rgba(120,66,12,0.3)'], [1, 'rgba(120,66,12,0)']]); q.fillRect(x - sz, y - sz, sz * 2, sz * 2);
  }
  path(); q.strokeStyle = 'rgba(150,92,14,0.22)'; q.lineWidth = 7; q.stroke();
  path(); q.strokeStyle = 'rgba(112,62,8,0.55)'; q.lineWidth = 1.8; q.stroke();
  q.restore();
}

// a red Japanese maple leaf (seven slender, finely toothed lobes), base at the origin, middle lobe up
function maple(q, rho, r) {
  const lobes = [[-2.3, 0.5], [-1.55, 0.78], [-0.78, 0.95], [0, 1], [0.78, 0.95], [1.55, 0.78], [2.3, 0.5]];
  const P = (A, along, lat) => [Math.sin(A) * along + Math.cos(A) * lat, -Math.cos(A) * along + Math.sin(A) * lat];
  const pts = [], veins = [];
  lobes.forEach(([A0, ln], i) => {
    const A = A0 + r.range(-0.07, 0.07), Ln = rho * ln * r.range(0.93, 1.06), W = Ln * 0.27;
    const prof = (t) => W * 2.1 * Math.pow(t, 0.7) * Math.pow(1 - t, 0.85);
    if (i === 0) pts.push(P(A - 0.5, rho * 0.12, 0));
    const left = [], right = [];
    for (let k = 1; k <= 22; k++) {
      const t = 0.1 + (0.9 * k) / 23, saw = 1 + 0.2 * (k % 3 === 0 ? 1 : k % 3 === 1 ? -0.3 : 0.3);
      left.push(P(A, Ln * t, -prof(t) * saw)); right.unshift(P(A, Ln * t, prof(t) * saw));
    }
    pts.push(...left, P(A, Ln, 0), ...right);
    veins.push([[0, 0], P(A, Ln * 0.97, 0), true]);
    for (let k = 2; k < 9; k++) {
      const t = k / 10;
      veins.push([P(A, Ln * t, 0), P(A, Ln * (t + 0.1), -prof(t + 0.1) * 0.85)], [P(A, Ln * t, 0), P(A, Ln * (t + 0.1), prof(t + 0.1) * 0.85)]);
    }
    pts.push(i < lobes.length - 1 ? P((A0 + lobes[i + 1][0]) / 2, rho * r.range(0.17, 0.22), 0) : P(A + 0.5, rho * 0.12, 0));
  });
  const path = () => { q.beginPath(); pts.forEach((p, k) => (k ? q.lineTo(p[0], p[1]) : q.moveTo(p[0], p[1]))); q.closePath(); };
  const plen = rho * r.range(0.6, 0.8), bend = rho * r.range(-0.2, 0.2);
  q.lineCap = 'round'; q.lineJoin = 'round';
  q.strokeStyle = '#6a1a14'; q.lineWidth = 2.6;
  q.beginPath(); q.moveTo(0, -3); q.quadraticCurveTo(bend * 0.2, plen * 0.5, bend, plen); q.stroke();
  q.strokeStyle = 'rgba(214,110,80,0.7)'; q.lineWidth = 0.9;
  q.beginPath(); q.moveTo(-0.7, -3); q.quadraticCurveTo(bend * 0.2 - 0.7, plen * 0.5, bend - 0.7, plen); q.stroke();
  path();
  q.fillStyle = L.radial(q, 0, -rho * 0.1, 0, rho * 1.05, [[0, '#b9381c'], [0.45, '#a8261b'], [1, '#7c1614']]);
  q.fill();
  q.save(); path(); q.clip();
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, d = rho * r.range(0.15, 0.9), x = Math.sin(a) * d, y = -Math.cos(a) * d, sz = r.range(8, 24);
    q.fillStyle = L.radial(q, x, y, 0, sz, [[0, r() < 0.5 ? 'rgba(226,112,40,0.28)' : 'rgba(78,8,14,0.30)'], [1, 'rgba(0,0,0,0)']]); q.fillRect(x - sz, y - sz, sz * 2, sz * 2);
  }
  for (const [a, b, main] of veins) {
    if (main) { q.strokeStyle = 'rgba(70,8,10,0.4)'; q.lineWidth = 2; q.beginPath(); q.moveTo(a[0] + 0.8, a[1] + 0.8); q.lineTo(b[0] + 0.8, b[1] + 0.8); q.stroke(); }
    q.strokeStyle = main ? 'rgba(236,146,100,0.75)' : 'rgba(232,140,98,0.32)'; q.lineWidth = main ? 1.3 : 0.7;
    q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke();
  }
  path(); q.strokeStyle = 'rgba(70,8,10,0.3)'; q.lineWidth = 4; q.stroke();
  path(); q.strokeStyle = 'rgba(58,6,8,0.5)'; q.lineWidth = 1.1; q.stroke();
  q.restore();
}

// render one leaf at its final rotation into its own canvas, then light it in page space (light from the top-left)
function leafSprite(kind, rho, rot, r, o = {}) {
  const sz = Math.ceil(rho * 2.5);
  const c = L.makeCanvas(sz, sz), q = c.getContext('2d');
  q.translate(sz / 2, sz / 2); q.rotate(rot);
  if (kind === 'maple') maple(q, rho, r); else ginkgo(q, rho, r, o);
  q.setTransform(1, 0, 0, 1, 0, 0);
  q.globalCompositeOperation = 'source-atop';
  q.fillStyle = L.linear(q, sz * 0.15, sz * 0.15, sz * 0.85, sz * 0.85, [[0, 'rgba(255,246,206,0.13)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(38,18,0,0.26)']]);
  q.fillRect(0, 0, sz, sz);
  return c;
}

function build() {
  const G = K.GLYPH, r = L.rng('h1leaves');
  const c = L.makeCanvas(LS, LS), g = c.getContext('2d');
  g.drawImage(K.paper({ size: LS, base: '#262524', tone: '#4b4741', seed: 'h1paper', fiber: 0.22, stain: 0.3, grain: 0.3, edge: 0, foxing: 0.08 }), 0, 0);
  g.fillStyle = L.radial(g, LS / 2, LS / 2, LS * 0.3, LS * 0.75, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]); g.fillRect(0, 0, LS, LS);

  const lv = L.makeCanvas(LS, LS), q = lv.getContext('2d'); q.translate(O, O);
  const put = (kind, x, y, dir, rho, o = {}) => {       // dir: page direction the blade points to (rad)
    const spr = leafSprite(kind, rho, dir + Math.PI / 2, r, o);
    K.stamp(q, spr, x, y, { shadow: { dx: 4, dy: 6, blur: 8, color: 'rgba(20,10,0,0.55)' } });
  };
  const gk = () => ({ th: r.range(1.12, 1.42), notch: r() < 0.25 ? 0 : r.range(0.12, 0.34), flip: r() < 0.5 });

  // 1 · loose leaves filling the body between the two rows
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * TAU + r.range(-0.1, 0.1), rr = r.range(222, 262), rho = r.range(84, 100);
    const dir = t + (i % 2 ? 1 : -1) * r.range(0.9, 2.1);
    put('ginkgo', G.cx + Math.cos(t) * rr - Math.cos(dir) * rho * 0.5, G.cy + Math.sin(t) * rr - Math.sin(dir) * rho * 0.5, dir, rho, gk());
  }
  // 2 · corner leaves: blades over the four corners of the hole
  for (let k = 0; k < 4; k++) {
    const t = Math.PI / 4 + (k * Math.PI) / 2 + r.range(-0.08, 0.08), rho = r.range(96, 108), d = G.a * Math.SQRT2 - 22 + rho;
    put('ginkgo', G.cx + Math.cos(t) * d, G.cy + Math.sin(t) * d, t + Math.PI, rho, { ...gk(), notch: r.range(0, 0.1) });
  }
  // 3 · the hole row: three fans per side, arcs toward the hole, petioles pointing out
  const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  sides.forEach(([nx, ny]) => {
    for (const k of [-1, 1, 0]) {
      const rho = r.range(90, 102), d = G.a - 15 + rho, lat = k * 88 + r.range(-6, 6);
      const x = G.cx + nx * d - ny * lat, y = G.cy + ny * d + nx * lat;
      put('ginkgo', x, y, Math.atan2(-ny, -nx) + r.range(-0.1, 0.1), rho, { ...gk(), notch: r.range(0, 0.1) });
    }
  });
  // 4 · the ring: fans whose arcs hug the outer circle, petioles pointing in
  const NR = 16, ph = r() * TAU;
  const order = []; for (let i = 0; i < NR; i += 2) order.push(i); for (let i = 1; i < NR; i += 2) order.push(i);
  for (const i of order) {
    const t = ph + (i / NR) * TAU + r.range(-0.035, 0.035), rho = r.range(98, 112), d = G.R + 5 - rho;
    put('ginkgo', G.cx + Math.cos(t) * d, G.cy + Math.sin(t) * d, t + r.range(-0.09, 0.09), rho, { ...gk(), notch: r() < 0.4 ? 0 : r.range(0.1, 0.24) });
  }
  // 5 · three red maples tucked in
  for (const [deg, rr, rho] of [[-38, 262, 98], [152, 252, 92], [78, 266, 86]]) {
    const t = (deg * Math.PI) / 180, dir = t + r.range(-0.9, 0.9);
    put('maple', G.cx + Math.cos(t) * rr - Math.cos(dir) * rho * 0.35, G.cy + Math.sin(t) * rr - Math.sin(dir) * rho * 0.35, dir, rho);
  }
  // dried-leaf mottling, then trim the collage to the coin outline
  K.soak(lv, K.paper({ size: LS, base: '#f4ecd6', tone: '#8a5a1e', seed: 'h1mottle', fiber: 0.9, stain: 0.7, grain: 0.3, edge: 0, foxing: 0.5 }), 0.5);
  q.save(); q.globalCompositeOperation = 'destination-in'; K.fillGlyph(q, '#000', { grow: 2, corner: 3 }); q.restore();

  g.save(); g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 14; g.shadowOffsetX = 6; g.shadowOffsetY = 9; g.drawImage(lv, 0, 0); g.restore();
  return c;
}

export default {
  name: '银杏叶',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 0.994, z1: 1.01 });
  },
};
