// p09 — 金银锭线刻: a copper-plate style page of gold cakes, silver ingots and bars drawn like geometric solids (the reference's crystal page).
// Everything is line work: contours, vertical wall hatching that thickens toward the lower right, horizontal cast-shadow hatching. No lettering.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const TAU = Math.PI * 2, W = 1400, INK = '#2a2018';
let layer = null;

const ell = (rx, ry, n = 72) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU) * rx, Math.sin((i / n) * TAU) * ry]);
const rect = (a, b) => [[-a, -b], [a, -b], [a, b], [-a, b]];
function waist(Lh, We, wa, b) {                       // 弧首束腰银铤: half length, end half-width, waist half-width, cap bulge (clockwise on screen)
  const p = [], n = 18, hw = (y) => wa + (We - wa) * Math.pow(Math.abs(y) / Lh, 1.7);
  for (let i = 0; i <= n; i++) { const y = -Lh + (2 * Lh * i) / n; p.push([hw(y), y]); }
  for (let i = 1; i < n; i++) { const x = We - (2 * We * i) / n; p.push([x, Lh + b * (1 - (x / We) ** 2)]); }
  for (let i = 0; i <= n; i++) { const y = Lh - (2 * Lh * i) / n; p.push([-hw(y), y]); }
  for (let i = 1; i < n; i++) { const x = -We + (2 * We * i) / n; p.push([x, -Lh - b * (1 - (x / We) ** 2)]); }
  return p;
}
const xf = (pts, rot, ky = 1) => { const c = Math.cos(rot), s = Math.sin(rot); return pts.map(([x, y]) => [x * c - y * s, (x * s + y * c) * ky]); };
function trace(g, pts, close = true, dx = 0, dy = 0) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); if (close) g.closePath(); }
function line(g, pts, lw, r, close = true, a = 0.94) {   // an engraved contour: a firm line and a thinner re-cut riding beside it
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = L.rgba(INK, a); g.lineWidth = lw; trace(g, pts, close); g.stroke();
  g.strokeStyle = L.rgba(INK, 0.3); g.lineWidth = lw * 0.5; trace(g, pts, close, r.range(-0.8, 0.8), r.range(-0.8, 0.8)); g.stroke();
}
function hatch(g, clipFn, r, { ang = 0, gap = 4, lw = 1, a = 0.8, R = 260 }) {
  g.save(); clipFn(); g.clip(); g.rotate(ang); g.lineCap = 'round';
  for (let y = -R; y <= R; y += gap * r.range(0.86, 1.14)) {
    g.strokeStyle = L.rgba(INK, a * r.range(0.7, 1)); g.lineWidth = lw * r.range(0.8, 1.2);
    g.beginPath(); g.moveTo(-R, y + r.range(-0.5, 0.5)); g.lineTo(R, y + r.range(-0.5, 0.5)); g.stroke();
  }
  g.restore();
}
function erase(g, pathFn) { g.save(); g.globalCompositeOperation = 'destination-out'; pathFn(); g.fill(); g.restore(); }

// the cast face of an ingot: an inner rim line, broken cooling ripples, a crescent of shade toward the lower right
function face(g, poly, r, bare, rim = 0.88) {
  const R = Math.max(...poly.map((p) => Math.hypot(p[0], p[1]))) * 1.2;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const sc = (k, o = 0) => poly.map(([x, y]) => [x * k - o, (y - cy) * k + cy - o * 0.6]);
  const inner = sc(rim, 2);
  line(g, inner, 1.1, r, true, 0.75);
  if (!bare) {
    hatch(g, () => { trace(g, poly); g.clip(); g.beginPath(); g.rect(-R * 2, -R * 2, R * 4, R * 4); g.arc(-R * 0.16, cy - R * 0.1, R * 0.8, 0, TAU, true); }, r, { ang: -0.78, gap: 3, lw: 1.1, a: 0.85, R: R * 1.3 });
    hatch(g, () => { trace(g, inner); g.clip(); g.beginPath(); g.rect(-R * 2, -R * 2, R * 4, R * 4); g.arc(-R * 0.34, cy - R * 0.22, R * 0.8, 0, TAU, true); }, r, { ang: 0.78, gap: 4.2, lw: 0.9, a: 0.7, R: R * 1.3 });
  }
  g.save(); g.lineCap = 'round';
  for (let k = rim - 0.16; k > 0.2; k -= r.range(0.14, 0.2)) {
    g.setLineDash([r.range(26, 70), r.range(5, 12), r.range(8, 30), r.range(4, 9)]); g.lineDashOffset = r.range(0, 90);
    g.strokeStyle = L.rgba(INK, 0.7); g.lineWidth = 1; trace(g, sc(k, (1 - k) * 5)); g.stroke();
  }
  g.restore();
}
function flat(g, poly, r, o = {}) {                   // plan view
  const R = Math.max(...poly.map((p) => Math.hypot(p[0], p[1]))) * 1.3;
  if (!o.bare) hatch(g, () => trace(g, poly, true, 9, 10), r, { ang: 0, gap: 3.2, lw: 1.05, a: 0.8, R });
  erase(g, () => trace(g, poly));
  line(g, poly, 2.3, r); face(g, poly, r, o.bare, o.rim);
}
function prism(g, top, h, r, o = {}) {                // oblique view of a slab: top face + the walls that face the viewer
  const n = top.length, vis = [], runs = [];
  for (let i = 0; i < n; i++) vis.push(top[(i + 1) % n][0] - top[i][0] < -1e-6);
  for (let i = 0; i < n; i++) if (vis[i] && !vis[(i - 1 + n) % n]) { const run = [i]; let k = i; while (vis[k % n] && run.length <= n) { k++; run.push(k % n); } runs.push(run); }
  const side = () => { g.beginPath(); for (const run of runs) { run.forEach((k, j) => (j ? g.lineTo(top[k][0], top[k][1]) : g.moveTo(top[k][0], top[k][1]))); for (let j = run.length - 1; j >= 0; j--) g.lineTo(top[run[j]][0], top[run[j]][1] + h); g.closePath(); } };
  const xs = top.map((p) => p[0]), ys = top.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys) + h, R = Math.max(x1 - x0, y1 - y0);
  if (!o.bare) hatch(g, () => trace(g, top, true, h * 0.45 + 12, h + 5), r, { ang: 0, gap: 3.4, lw: 1.05, a: 0.8, R });
  erase(g, () => trace(g, top)); erase(g, side);
  if (!o.bare) {
    g.save(); side(); g.clip(); g.lineCap = 'butt';
    for (let x = x0; x <= x1;) { const t = (x - x0) / (x1 - x0); g.strokeStyle = L.rgba(INK, r.range(0.6, 0.9)); g.lineWidth = L.lerp(0.8, 1.35, t) * r.range(0.85, 1.15); g.beginPath(); g.moveTo(x, y0); g.lineTo(x + r.range(-0.5, 0.5), y1); g.stroke(); x += L.lerp(5, 2.5, t) * r.range(0.9, 1.1); }
    g.restore();
    hatch(g, () => { side(); g.clip(); g.beginPath(); g.rect(L.lerp(x0, x1, 0.6), y0 - 5, x1 - x0, y1 - y0 + 10); }, r, { ang: -0.5, gap: 4.4, lw: 0.9, a: 0.7, R });
  }
  line(g, top, 2.2, r);
  g.strokeStyle = L.rgba(INK, 0.94); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const run of runs) {
    g.beginPath(); run.forEach((k, j) => (j ? g.lineTo(top[k][0], top[k][1] + h) : g.moveTo(top[k][0], top[k][1] + h))); g.stroke();
    run.forEach((k, j) => {
      let edge = j === 0 || j === run.length - 1;
      if (!edge) { const a = top[(k - 1 + n) % n], b = top[k], c = top[(k + 1) % n]; let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]); d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); edge = d > 0.45; }
      if (edge) { g.beginPath(); g.moveTo(top[k][0], top[k][1]); g.lineTo(top[k][0], top[k][1] + h); g.stroke(); }
    });
  }
  face(g, top, r, o.bare, o.rim);
}
function frustum(g, rT, rB, ky, h, r, o = {}) {       // round tapering body seen obliquely (hoof gold, the bowl of a sycee); base at y = 0, top at y = -h
  const arc = (rad, y, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const t = L.lerp(a0, a1, i / n); return [Math.cos(t) * rad, y + Math.sin(t) * rad * ky]; });
  const wall = [...arc(rB, 0, Math.PI, 0), ...arc(rT, -h, 0, Math.PI)], topE = arc(rT, -h, 0, TAU, 72).slice(0, 72), botE = arc(rB, 0, 0, TAU, 72).slice(0, 72);
  const Rm = Math.max(rT, rB);
  if (!o.bare) hatch(g, () => trace(g, botE, true, h * 0.4 + 14, 5), r, { ang: 0, gap: 3.4, lw: 1.05, a: 0.8, R: Rm * 2.6 });
  erase(g, () => trace(g, wall)); erase(g, () => trace(g, topE));
  if (!o.bare) {
    g.save(); trace(g, wall); g.clip();
    for (let u = -1; u <= 1;) { const t = (u + 1) / 2; g.strokeStyle = L.rgba(INK, r.range(0.6, 0.9)); g.lineWidth = L.lerp(0.8, 1.35, t) * r.range(0.85, 1.15); g.beginPath(); g.moveTo(u * rT, -h - rT * ky); g.lineTo(u * rB, rB * ky); g.stroke(); u += L.lerp(0.05, 0.022, t) * r.range(0.9, 1.1); }
    g.restore();
    hatch(g, () => { trace(g, wall); g.clip(); g.beginPath(); g.rect(Rm * 0.25, -h - Rm, Rm, h + Rm * 2); }, r, { ang: -0.5, gap: 4.2, lw: 0.9, a: 0.7, R: Rm * 1.6 + h });
  }
  line(g, wall, 2.2, r); line(g, topE, 1.9, r);
  return { arc, topE };
}
function hoof(g, r, bare) {                           // 马蹄金: hollow, walls leaning in, a filigree band under the mouth, ripples near the foot
  const rT = 74, rB = 108, ky = 0.42, h = 96;
  g.save(); g.translate(0, 40);
  const { arc } = frustum(g, rT, rB, ky, h, r, { bare });
  const mouth = arc(rT * 0.8, -h + 2, 0, TAU, 60).slice(0, 60);
  hatch(g, () => trace(g, mouth), r, { ang: 0.5, gap: bare ? 6 : 3, lw: 1, a: 0.85, R: 120 });
  if (!bare) hatch(g, () => { trace(g, mouth); g.clip(); g.beginPath(); g.rect(-200, -h - 60, 200, 120); }, r, { ang: -0.6, gap: 3.4, lw: 1, a: 0.8, R: 160 });
  line(g, mouth, 1.3, r);
  const b1 = arc(L.lerp(rT, rB, 0.12), -h * 0.88, 0.06, Math.PI - 0.06), b2 = arc(L.lerp(rT, rB, 0.26), -h * 0.74, 0.04, Math.PI - 0.04);
  erase(g, () => trace(g, [...b1, ...b2.slice().reverse()]));
  line(g, b1, 1.2, r, false); line(g, b2, 1.2, r, false);
  g.strokeStyle = L.rgba(INK, 0.8); g.lineWidth = 1;
  for (let i = 1; i < 40; i++) { g.beginPath(); g.moveTo(b1[i][0], b1[i][1] + 1.5); g.quadraticCurveTo((b1[i][0] + b2[i][0]) / 2 + 3, (b1[i][1] + b2[i][1]) / 2, b2[i][0], b2[i][1] - 1.5); g.stroke(); }
  g.save(); g.setLineDash([34, 7, 16, 6]);
  for (const k of [0.8, 0.9]) { g.lineDashOffset = k * 77; trace(g, arc(L.lerp(rT, rB, k) + 1, -h * (1 - k), 0.12, Math.PI - 0.12), false); g.strokeStyle = L.rgba(INK, 0.75); g.lineWidth = 1.1; g.stroke(); }
  g.restore(); g.restore();
}
function sycee(g, r, bare) {                          // 元宝: an oval bowl-shaped body with a flange rising at each end, ripples on the sunk face
  const rT = 124, rB = 86, ky = 0.34, h = 54, H = 60;
  g.save(); g.translate(0, 52);
  const { arc, topE } = frustum(g, rT, rB, ky, h, r, { bare });
  face(g, topE, r, bare, 0.84);
  { const dome = ell(44, 44 * ky + 7, 40).map(([x, y]) => [x, y - h - 5]); erase(g, () => trace(g, dome)); if (!bare) hatch(g, () => { trace(g, dome); g.clip(); g.beginPath(); g.rect(-300, -300, 600, 600); g.arc(-12, -h - 12, 40, 0, TAU, true); }, r, { ang: -0.78, gap: 3, lw: 1, a: 0.85, R: 200 }); line(g, dome, 1.4, r); }
  for (const sgn of [-1, 1]) {
    const ce = sgn > 0 ? 0 : Math.PI, a0 = ce - (sgn > 0 ? 1.3 : 0.5), a1 = ce + (sgn > 0 ? 0.5 : 1.3), rimA = arc(rT, -h, a0, a1, 30);
    const up = rimA.map(([x, y], i) => { const d = L.lerp(a0, a1, i / 30) - ce, k = Math.pow(Math.max(0, Math.cos(((Math.PI / 2) * d) / (d < 0 ? ce - a0 : a1 - ce))), 0.8); return [x * (1 + 0.1 * k), y - H * k]; });
    const wing = [...rimA, ...up.slice().reverse()];
    erase(g, () => trace(g, wing));
    if (!bare) hatch(g, () => trace(g, wing), r, { ang: sgn < 0 ? 1.2 : 1.9, gap: sgn < 0 ? 3.2 : 6, lw: 1, a: 0.8, R: 220 });
    if (!bare && sgn < 0) hatch(g, () => trace(g, wing), r, { ang: -0.3, gap: 4.6, lw: 0.9, a: 0.6, R: 220 });
    line(g, wing, 1.8, r);
    line(g, up.map(([x, y]) => [x - sgn * 5, y + 5]).slice(4, 27), 1, r, false, 0.7);
  }
  g.restore();
}

const KINDS = ['cakeTop', 'waistObl', 'sycee', 'barObl', 'hoof', 'waistTop', 'cakeObl', 'syceeTop', 'barTop', 'waistObl', 'hoof', 'cakeObl', 'sycee', 'waistTop', 'barObl', 'cakeTop', 'sycee', 'waistObl', 'hoof', 'syceeTop', 'cakeObl', 'barObl', 'waistTop', 'sycee', 'cakeTop'];
const BARE = new Set([5, 8, 11, 16, 19, 21]);        // these are left as bare outlines, as on a real plate of solids

function drawOne(g, kind, r, bare) {
  const rot = r.range(-0.5, 0.5);
  if (kind === 'cakeTop') {
    const p = ell(108, 104).map(([x, y], i) => { const k = 1 + 0.02 * Math.sin(i * 0.31 + rot * 9) + 0.012 * Math.sin(i * 0.9); return [x * k, y * k]; });
    flat(g, p, r, { bare, rim: 0.9 });
    g.strokeStyle = L.rgba(INK, 0.75); g.lineWidth = 1; g.lineCap = 'round';   // shrinkage cracks of the cast face
    for (let i = 0; i < 9; i++) { let a = r() * TAU, x = Math.cos(a) * r.range(10, 60), y = Math.sin(a) * r.range(10, 60); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { a += r.range(-0.9, 0.9); x += Math.cos(a) * r.range(7, 16); y += Math.sin(a) * r.range(7, 16); g.lineTo(x, y); } g.stroke(); }
  } else if (kind === 'cakeObl') { g.translate(0, -12); prism(g, xf(ell(116, 116), 0, 0.46), 24, r, { bare, rim: 0.9 }); }
  else if (kind === 'waistTop') flat(g, xf(waist(112, 70, 44, 15), rot), r, { bare, rim: 0.86 });
  else if (kind === 'waistObl') { g.translate(0, -16); prism(g, xf(waist(118, 72, 46, 16), rot + 1.1, 0.5), 30, r, { bare, rim: 0.86 }); }
  else if (kind === 'barObl') { g.translate(0, -18); prism(g, xf(rect(122, 40), rot * 0.8 - 0.3, 0.52), 36, r, { bare, rim: 0.84 }); }
  else if (kind === 'barTop') flat(g, xf(rect(124, 44), rot * 0.6), r, { bare, rim: 0.84 });
  else if (kind === 'syceeTop') flat(g, xf(ell(124, 84).map(([x, y]) => [x, y * (1 - 0.13 * Math.exp(-((x / 50) ** 2)))]), rot * 0.5), r, { bare, rim: 0.82 });
  else if (kind === 'hoof') hoof(g, r, bare);
  else sycee(g, r, bare);
}

function build() {
  const c = L.makeCanvas(W, W), g = c.getContext('2d');
  const pap = K.paper({ base: '#ecdcb6', tone: '#8a6a3a', seed: 'p09paper', fiber: 0.6, stain: 0.42, foxing: 0.3, edge: 0.2, size: W });
  g.drawImage(pap, 0, 0);
  const ink = L.makeCanvas(W, W), q = ink.getContext('2d');
  let idx = 0;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++, idx++) {
    const r = L.rng('p09o' + idx);
    const x = 110 + i * 300 + (j % 2 ? 150 : 0) + r.range(-10, 10), y = 100 + j * 300 + r.range(-8, 8);
    q.save(); q.translate(x, y); const s = r.range(1.06, 1.17); q.scale(s, s);
    drawOne(q, KINDS[idx], r, BARE.has(idx));
    q.restore();
  }
  K.soak(ink, pap, 0.45); K.wear(ink, { seed: 'p09wear', amount: 0.22, size: 1.2 });
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.95; g.drawImage(ink, 0, 0);
  g.globalAlpha = 0.18; g.drawImage(ink, 0.7, 0.6);   // a breath of plate tone beside every line: ink pressed into soft paper
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '金银锭线刻',
  init() { layer = build(); },
  draw(ctx, env, p) { K.drift(ctx, layer, p, { z0: 1.0, z1: 1.03, x0: 16, y0: 10, x1: -16, y1: -10 }); },
};
