// g11 — 钱串: strings of cash seen from the side (stacks of coin rims, like ribbed short rods) laid on grey-blue paper so that
// they spell the coin glyph: arc-shaped strings hug the outer circle, four straight strings line the square hole (pinwheel, so
// every corner is covered), four short arcs fill the body in between. Bronze with verdigris, hemp cords, light from top-left.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const G = K.GLYPH, TAU = Math.PI * 2, RAD = Math.PI / 180;
const W = 68;                                   // coin diameter = width of a string seen from the side
const LXY = 0.53, LZ = 0.66;                    // light from the top-left, raised
let layer = null;

const BRONZE = ['#8b6b3d', '#7c5c33', '#9a7a47', '#6d5230', '#a48550', '#5f492c', '#876a45', '#93703a'];
const GREEN = ['#5f9c86', '#4d8a78', '#79b09b', '#3f7566', '#6aa58a', '#8bbfaa'];

function arcString(r, a0, a1, hug, o = {}) {
  return { len: r * (a1 - a0), hug, ...o, at: (s) => { const f = a0 + s / r; return { x: G.cx + Math.cos(f) * r, y: G.cy + Math.sin(f) * r, th: f + Math.PI / 2 }; } };
}
function lineString(x0, y0, x1, y1, hug, o = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0), th = Math.atan2(y1 - y0, x1 - x0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  return { len, hug, ...o, at: (s) => ({ x: x0 + ux * s, y: y0 + uy * s, th }) };
}
function tracePath(g, st, s0, s1, step = 4) {
  g.beginPath();
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) { const p = st.at(s0 + ((s1 - s0) * i) / n); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }
}

// twisted hemp cord along a list of points
function cord(g, pts, r, wd = 5) {
  const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(22,30,42,0.45)'; g.shadowBlur = 4; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
  path(); g.strokeStyle = '#4c3a24'; g.lineWidth = wd + 1.6; g.stroke();
  g.shadowColor = 'transparent';
  path(); g.strokeStyle = '#b89c6a'; g.lineWidth = wd; g.stroke();
  // twist: short diagonal plies
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dl = Math.hypot(b.x - a.x, b.y - a.y), th = Math.atan2(b.y - a.y, b.x - a.x);
    for (let s = acc; s < dl; s += 3.1) {
      const x = a.x + Math.cos(th) * s, y = a.y + Math.sin(th) * s, k = th + 0.95;
      g.strokeStyle = L.rgba('#6b5232', r.range(0.55, 0.85)); g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x - Math.cos(k) * wd * 0.5, y - Math.sin(k) * wd * 0.5); g.lineTo(x + Math.cos(k) * wd * 0.5, y + Math.sin(k) * wd * 0.5); g.stroke();
      g.strokeStyle = 'rgba(240,222,180,0.5)'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x + 1.3 - Math.cos(k) * wd * 0.3, y - Math.sin(k) * wd * 0.3); g.lineTo(x + 1.3, y); g.stroke();
    }
    acc = (acc + 3.1 * Math.ceil((dl - acc) / 3.1)) - dl; if (acc < 0) acc = 0;
  }
  g.restore();
}
function knot(g, x, y, th, r, sz = 6.5) {
  g.save(); g.translate(x, y); g.rotate(th);
  g.shadowColor = 'rgba(22,30,42,0.5)'; g.shadowBlur = 5; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
  g.fillStyle = '#4c3a24'; g.beginPath(); g.ellipse(0, 0, sz + 0.9, sz * 0.82 + 0.9, 0, 0, TAU); g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = L.radial(g, -sz * 0.3, -sz * 0.3, 0.5, sz * 1.2, [[0, '#d2b885'], [0.6, '#b0935f'], [1, '#7c6340']]);
  g.beginPath(); g.ellipse(0, 0, sz, sz * 0.82, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(84,62,36,0.8)'; g.lineWidth = 0.9; g.lineCap = 'round';
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 2.3 - 1.6, -sz * 0.62); g.quadraticCurveTo(k * 2.3 + 1.2, 0, k * 2.3 - 1.2, sz * 0.62); g.stroke(); }
  g.restore();
}
// a free cord tail leaving the end of a string: short curl, a knot, a frayed tip
function tail(g, p, dir, r) {
  const th = p.th + (dir < 0 ? Math.PI : 0), bend = r.range(-0.9, 0.9), len = r.range(17, 24), pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, a = th + bend * t * t; pts.push({ x: p.x + Math.cos(th) * -4 + Math.cos(a) * len * t, y: p.y + Math.sin(th) * -4 + Math.sin(a) * len * t }); }
  cord(g, pts, r, 4.6);
  const e = pts[8], ea = th + bend;
  g.save(); g.lineCap = 'round';
  for (let k = 0; k < 5; k++) { const a = ea + r.range(-0.6, 0.6), l = r.range(4, 8); g.strokeStyle = L.rgba(k % 2 ? '#c9b07c' : '#7c6340', 0.85); g.lineWidth = r.range(0.7, 1.1); g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + Math.cos(a) * l, e.y + Math.sin(a) * l); g.stroke(); }
  g.restore();
  const m = pts[4]; knot(g, m.x, m.y, th + bend * 0.25, r, 5.6);
}

const SV = [-1, -0.94, -0.82, -0.64, -0.44, -0.22, 0, 0.22, 0.44, 0.64, 0.82, 0.94, 1];
function drawString(g, st, seed, nz) {
  const r = L.rng(seed), h = st.hug, nOff = r.range(0, 500);
  // cast shadow + the dark core seen between the coins
  g.save(); g.lineCap = 'butt';
  g.shadowColor = 'rgba(18,26,38,0.55)'; g.shadowBlur = 14; g.shadowOffsetX = 7; g.shadowOffsetY = 10;
  tracePath(g, st, 1, st.len - 1); g.strokeStyle = '#33281b'; g.lineWidth = W - 15; g.stroke();
  g.shadowBlur = 4; g.shadowOffsetX = 2; g.shadowOffsetY = 3; g.shadowColor = 'rgba(14,20,30,0.5)'; g.stroke();
  g.restore();
  // coin thicknesses, scaled so the stack fills the string exactly
  const steps = []; let sum = 0;
  while (sum < st.len) { const t = r.range(5.3, 7.7) * (r.chance(0.08) ? 1.25 : 1); steps.push(t); sum += t; }
  const k = st.len / sum; let s = 0;
  const specks = [];
  steps.forEach((t0, idx) => {
    const t = t0 * k, p = st.at(s + t / 2); s += t;
    const d = W - (r.chance(0.12) ? r.range(6.5, 10.5) : r.range(0, 5));
    const off = h ? h * (W / 2 - d / 2) - h * r.range(0, 1.4) : (W - d) * r.range(-0.4, 0.4) + r.range(-1.6, 1.6);
    const th = p.th, tilt = r.gauss() * 0.028;
    const ly = LXY * (Math.sin(th) - Math.cos(th)), bmax = Math.hypot(ly, LZ);
    const base = L.shade(r.pick(BRONZE), r.range(-0.12, 0.1)), grn = r.pick(GREEN);
    const bias = r.range(-0.3, 0.16) + (r.chance(0.07) ? 0.7 : 0);
    const y0 = off - d / 2, w = t - 0.55;
    g.save(); g.translate(p.x, p.y); g.rotate(th + tilt);
    g.beginPath();
    const rr = Math.min(2.2, w * 0.4);
    g.moveTo(-w / 2 + rr, y0); g.lineTo(w / 2 - rr, y0); g.quadraticCurveTo(w / 2, y0, w / 2, y0 + rr);
    g.lineTo(w / 2, y0 + d - rr); g.quadraticCurveTo(w / 2, y0 + d, w / 2 - rr, y0 + d);
    g.lineTo(-w / 2 + rr, y0 + d); g.quadraticCurveTo(-w / 2, y0 + d, -w / 2, y0 + d - rr);
    g.lineTo(-w / 2, y0 + rr); g.quadraticCurveTo(-w / 2, y0, -w / 2 + rr, y0); g.closePath();
    g.fillStyle = base; g.fill();
    // verdigris: coherent blotches that run across neighbouring coins
    const pg = g.createLinearGradient(0, y0, 0, y0 + d);
    for (let j = 0; j <= 12; j++) {
      const v = y0 + (d * j) / 12, pn = nz.fbm((nOff + s) * 0.021, v * 0.034 + nOff, 3);
      const a = L.clamp((pn + 0.02) * 2.7 + bias, 0, 0.93);
      pg.addColorStop(j / 12, L.rgba(grn, a));
      if (a > 0.35 && r.chance(0.16)) specks.push({ x: p.x, y: p.y, th, v: v + r.range(-2, 2), u: r.range(-t, t) * 0.6, lt: r.chance(0.7) });
    }
    g.fillStyle = pg; g.fill();
    // the stack is a cylinder: shade across the diameter
    const dg = g.createLinearGradient(0, y0, 0, y0 + d), hg = g.createLinearGradient(0, y0, 0, y0 + d);
    for (const sv of SV) {
      const b = Math.max(0, sv * ly + Math.sqrt(1 - sv * sv) * LZ), tt = (sv + 1) / 2;
      dg.addColorStop(tt, `rgba(16,12,10,${L.clamp(0.98 - (0.3 + 0.84 * b), 0, 0.82).toFixed(3)})`);
      hg.addColorStop(tt, `rgba(255,238,200,${(0.42 * Math.pow(b / bmax, 12) * (0.45 + 0.55 * bmax / 0.85)).toFixed(3)})`);
    }
    g.fillStyle = dg; g.fill(); g.fillStyle = hg; g.fill();
    // each rim is rounded: dark at both faces, a soft glint along its crown
    const lit = Math.cos(th) * -1 + Math.sin(th) * -1 > 0 ? 1 : -1;       // which face looks toward the light
    g.fillStyle = L.linear(g, -w / 2, 0, w / 2, 0, [[0, `rgba(10,8,6,${lit > 0 ? 0.5 : 0.28})`], [0.28, 'rgba(10,8,6,0)'], [0.5, 'rgba(255,236,196,0.10)'], [0.72, 'rgba(10,8,6,0)'], [1, `rgba(10,8,6,${lit > 0 ? 0.28 : 0.5})`]]);
    g.fill();
    // worn bright metal on the crown of some rims, on the lit flank only
    if (r.chance(0.3)) {
      const sv = L.clamp(-ly / bmax * 0.75 + r.range(-0.2, 0.2), -0.9, 0.9), yc = off + sv * d / 2, hl = r.range(5, 13);
      g.strokeStyle = `rgba(236,200,138,${r.range(0.25, 0.55).toFixed(2)})`; g.lineWidth = r.range(0.8, 1.4); g.lineCap = 'round';
      g.beginPath(); g.moveTo(r.range(-0.6, 0.6), yc - hl / 2); g.lineTo(r.range(-0.6, 0.6), yc + hl / 2); g.stroke();
    }
    // a nick or casting flaw
    if (r.chance(0.22)) {
      const yc = off + r.range(-0.42, 0.42) * d;
      g.fillStyle = 'rgba(20,14,8,0.6)'; g.beginPath(); g.ellipse(r.range(-w, w) * 0.3, yc, r.range(0.6, 1.3), r.range(0.9, 2.2), 0, 0, TAU); g.fill();
    }
    g.restore();
  });
  // encrustation specks sitting on the patina, bridging the gaps between coins
  for (const q of specks) {
    const c = Math.cos(q.th), sn = Math.sin(q.th), x = q.x + c * q.u - sn * q.v, y = q.y + sn * q.u + c * q.v;
    const rad = r.range(0.7, 1.9);
    g.fillStyle = 'rgba(14,26,24,0.35)'; g.beginPath(); g.ellipse(x + 0.7, y + 0.9, rad, rad * 0.8, r() * 3, 0, TAU); g.fill();
    g.fillStyle = q.lt ? L.rgba(r.pick(['#a9d3c0', '#8fc4ad', '#c4e0d2']), r.range(0.55, 0.9)) : L.rgba('#2f5a4e', r.range(0.5, 0.8));
    g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.6, 0.9), r() * 3, 0, TAU); g.fill();
  }
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#8d9eac', tone: '#3b4a5b', seed: 'g11paper', fiber: 0.7, stain: 0.3, foxing: 0.12, edge: 0.3 }), 0, 0);
  const nz = L.makeNoise('g11patina'), r = L.rng('g11');
  const rc = G.R - W / 2, d = G.a + W / 2, rm = 246;

  // ── middle: four short arcs filling the body between the hole's strings and the rim's
  for (let q = 0; q < 4; q++) {
    const a0 = q * 90 * RAD - (20 + r.range(-1.5, 1.5)) * RAD, a1 = q * 90 * RAD + (20 + r.range(-1.5, 1.5)) * RAD;
    const st = arcString(rm, a0, a1, 0);
    tail(g, st.at(0), -1, r); tail(g, st.at(st.len), 1, r);
    drawString(g, st, 'g11m' + q, nz);
  }
  // ── the square hole: four straight strings in a pinwheel, inner edges on the hole
  const sq = [
    lineString(G.cx - G.a - W, G.cy - d, G.cx + G.a, G.cy - d, 1),
    lineString(G.cx + d, G.cy - G.a - W, G.cx + d, G.cy + G.a, 1),
    lineString(G.cx + G.a + W, G.cy + d, G.cx - G.a, G.cy + d, 1),
    lineString(G.cx - d, G.cy + G.a + W, G.cx - d, G.cy - G.a, 1),
  ];
  sq.forEach((st) => tail(g, st.at(0), -1, r));
  sq.forEach((st, i) => drawString(g, st, 'g11s' + i, nz));
  // ── the rim: five arc-shaped strings on one cord, knots showing in the gaps
  const gaps = [14, 83, 152, 224, 296];
  const cpts = []; for (let i = 0; i <= 240; i++) { const f = (i / 240) * TAU; cpts.push({ x: G.cx + Math.cos(f) * (rc + Math.sin(f * 5) * 1.5), y: G.cy + Math.sin(f) * (rc + Math.sin(f * 5) * 1.5) }); }
  cord(g, cpts, r, 5);
  gaps.forEach((gd) => { const f = gd * RAD; knot(g, G.cx + Math.cos(f) * rc, G.cy + Math.sin(f) * rc, f + Math.PI / 2, r, 6.6); });
  gaps.forEach((gd, i) => {
    const a0 = (gd + 2.3) * RAD, a1 = ((gaps[(i + 1) % gaps.length] + (i === gaps.length - 1 ? 360 : 0)) - 2.3) * RAD;
    drawString(g, arcString(rc, a0, a1, -1), 'g11r' + i, nz);
  });
  return c;
}

export default {
  name: '钱串',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
