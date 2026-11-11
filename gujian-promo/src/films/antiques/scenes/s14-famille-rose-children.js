// s14 — 粉彩婴戏图. Macro of the glazed wall of a famille-rose (粉彩) vessel: the arc is the upper edge of a painted
// green bank; behind it two children at play, drawn the way a Qing enameller drew them — one astride a bamboo horse (竹马),
// one holding up a round lantern on a stick, the lantern hanging between them over the crest. Milk-white glaze all round,
// a window mirrored in the empty upper left, a long soft light lying across the bare wall under the bank.
//
// How it is painted (everything at full resolution, nothing is scaled up):
//  · every patch of enamel is a filled shape: a pale 玻璃白-bodied base, colour washed in from one side of each fold
//    (洗染: crisp at the fold, fading away from it), pooled a little inside the rim that faces away from the light,
//    faint drags of the brush, then its fine line (勾线: 1.3–2 px, set down with a touch of pressure, lifted to a point);
//  · alongside the colour a HEIGHT map is painted (how far each enamel stands proud of the glaze). It is lit once from the
//    upper left: a thin glint just inside the edges that face the light, a hair of shadow beyond the edges that do not;
//  · in draw() the painted wall turns about the arc's centre while the light (falloff + reflections) stays where it is.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 200;
let S = null;
let SEED = 0;
let G = null, HG = null;   // the colour / height contexts being painted on (both in frame coordinates)
let RX = 0, RY = 0;        // frame position of the region those contexts cover
let KS = 1, MIR = 1;       // scale and mirroring of the figure being painted (line weights and blurs are given in final pixels)

const C = { cream: '#f5efe0', ink: '#2b2620' };
// enamel families: lt = 玻璃白 showing through, base = the wash, mid / deep = colour gathered in folds and rims, line = its drawing colour
const F = {
  pink: { lt: '#fff5f1', base: '#f8d0d2', mid: '#ea8ca2', deep: '#cf5275', line: '#8a2b46' },
  rouge: { lt: '#fde0dc', base: '#ec8497', mid: '#d5506f', deep: '#b22c50', line: '#741c36' },
  red: { lt: '#f9c4b4', base: '#d9553e', mid: '#c23c2b', deep: '#9a2518', line: '#6e1c12' },
  green: { lt: '#f0f8de', base: '#bfe0a6', mid: '#8cc27a', deep: '#559a56', line: '#2b5a33' },
  yellow: { lt: '#fffbe6', base: '#fbeeb2', mid: '#f0c552', deep: '#d4992b', line: '#7c5119' },
  blue: { lt: '#f0f8f9', base: '#b9d9e5', mid: '#86b7d0', deep: '#5289ad', line: '#2c4b66' },
  ochre: { lt: '#f6e0be', base: '#dba562', mid: '#bf7a3c', deep: '#96552a', line: '#5a3016' },
  flesh: { lt: '#fffdf8', base: '#fff6ec', mid: '#f6c4bb', deep: '#ec9494', line: '#9a4a36' },
  bamboo: { lt: '#f0f7d6', base: '#b6d892', mid: '#86b96d', deep: '#4f8d4c', line: '#2c5a30' },
  ink: { lt: '#77716c', base: '#2b2620', mid: '#1a1613', deep: '#0b0908', line: '#16120f' },
};

// ───────────────────────── small geometry helpers ─────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const nrm = (a) => { const m = Math.hypot(a[0], a[1]) || 1; return [a[0] / m, a[1] / m]; };
const mixP = (a, b, t) => [L.lerp(a[0], b[0], t), L.lerp(a[1], b[1], t)];
const xy = (p) => [p[0], p[1]];
const ss = (e0, e1, v) => { const t = L.clamp((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const zc = (z) => { const v = Math.round(L.clamp(z) * 255); return `rgb(${v},${v},${v})`; };

/** Catmull-Rom through pts (open or closed) → dense [[x, y, u]] where u is the control-point parameter */
function cr(pts, closed = false, step = 5) {
  const n = pts.length, out = [];
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < m; j++) {
      const t = j / m, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        i + t,
      ]);
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1], n - 1]);
  return out;
}
/** straight-edged polyline → dense points (corners stay sharp) */
function dense(pts, closed = true, step = 5) {
  const out = [], n = pts.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < m; j++) out.push(mixP(a, b, j / m));
  }
  if (!closed) out.push(xy(pts[n - 1]));
  return out;
}
const ell = (cx, cy, rx, ry, n = 14, rot = 0) => {
  const o = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const t = (i / n) * L.TAU, x = Math.cos(t) * rx, y = Math.sin(t) * ry; o.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return o;
};
const bbox = (pts) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return [x0, y0, x1, y1];
};
function addLine(g, pts) { for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0], pts[i][1]); else g.moveTo(pts[i][0], pts[i][1]); } }
function addPoly(g, pts) { addLine(g, pts); g.closePath(); }
function trace(g, pts, close) { g.beginPath(); addLine(g, pts); if (close) g.closePath(); }
/** run fn in a moved / turned frame on BOTH the colour and the height context */
function xf(x, y, ang, fn) {
  for (const c of [G, HG]) { c.save(); c.translate(x, y); if (ang) c.rotate(ang); }
  fn();
  for (const c of [G, HG]) c.restore();
}
/** run fn scaled by k about (x, y) on both contexts; line weights stay in final pixels */
function sc(x, y, k, fn) {
  const ks = KS; KS *= k;
  for (const c of [G, HG]) { c.save(); c.translate(x, y); c.scale(k, k); c.translate(-x, -y); }
  fn();
  for (const c of [G, HG]) c.restore();
  KS = ks;
}
/** the hand is not a ruler: push a polyline slowly off its true course */
const SHK = L.makeNoise('s14shake');
function shake(pts, amp, id) {
  let t = 0; const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (i) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    out.push([pts[i][0] + amp * SHK.n2(t / 60, id * 7.31), pts[i][1] + amp * SHK.n2(t / 60 + 31.7, id * 3.17)]);
  }
  return out;
}
/** a limb / ribbon / stick: polygon of varying width round a smooth centre line */
function tube(center, widths, step = 4) {
  const c = cr(center, false, step), n = c.length, Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const u = Math.min(widths.length - 1 - 1e-6, c[i][2]), k = Math.floor(u), t = u - k;
    const hw = L.lerp(widths[k], widths[k + 1], L.smooth(t)) / 2;
    Lf.push([c[i][0] + nx * hw, c[i][1] + ny * hw]); Rt.push([c[i][0] - nx * hw, c[i][1] - ny * hw]);
  }
  return { poly: Lf.concat(Rt.slice().reverse()), left: Lf, right: Rt, c: c.map(xy) };
}
/** the band between two offsets on ONE side of a polyline, swelling from nothing and dying away again: the footprint of a graded wash */
function wedge(p, side, w0, w1) {
  const n = p.length, a = [], b = [];
  for (let i = 0; i < n; i++) {
    const q0 = p[Math.max(0, i - 1)], q1 = p[Math.min(n - 1, i + 1)];
    let nx = -(q1[1] - q0[1]), ny = q1[0] - q0[0]; const m = Math.hypot(nx, ny) || 1; nx = (nx / m) * side; ny = (ny / m) * side;
    const pr = Math.pow(Math.sin(Math.PI * L.clamp(0.05 + 0.9 * (i / (n - 1)))), 0.7), w = w0 + (w1 - w0) * pr;
    a.push([p[i][0] + nx * w0, p[i][1] + ny * w0]); b.push([p[i][0] + nx * w, p[i][1] + ny * w]);
  }
  return a.concat(b.reverse());
}
function bloomAt(g, x, y, r, col, al) {
  g.fillStyle = L.radial(g, x, y, 0, r, [[0, L.rgba(col, al)], [0.25, L.rgba(col, al * 0.86)], [0.5, L.rgba(col, al * 0.5)], [0.75, L.rgba(col, al * 0.15)], [1, L.rgba(col, 0)]]);
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// ───────────────────────── the enameller's two tools: the line and the wash ─────────────────────────
/**
 * 勾线 — one fine brush line. px = its weight in final pixels. The brush is set down with a touch of pressure (起笔),
 * runs even, and is lifted to a point (收笔). o.spindle: fine at both ends, fullest in the middle (lids, brows).
 * o: alpha, head, tin / tout (px of set-down / lift-off), tail, shake, z (height it adds)
 */
function line(pts, px, color, o = {}) {
  const id = SEED++;
  let p = (pts.length > 2 ? cr(pts, false, 2.5) : dense(pts, false, 2.5)).map(xy);
  const amp = o.shake === undefined ? 0.45 : o.shake;
  if (amp) p = shake(p, amp, id);
  const n = p.length; if (n < 2) return;
  const s = new Array(n); s[0] = 0;
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const len = s[n - 1] || 1, w0 = px / KS;
  const tin = Math.min(len * 0.3, (o.tin === undefined ? 6 : o.tin) / KS), tout = Math.min(len * 0.6, (o.tout === undefined ? 24 : o.tout) / KS);
  const head = o.head === undefined ? 1.3 : o.head, tail = o.tail === undefined ? Math.max(0.3, 0.95 / px) : o.tail;
  const Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const d0 = s[i], d1 = len - s[i];
    let wv = 1 + 0.09 * SHK.n2((s[i] * KS) / 34, id * 5.3);                      // the pressure breathes a little
    if (o.spindle) wv *= 0.42 + 0.58 * Math.pow(Math.sin(Math.PI * L.clamp(d0 / len)), 0.7);
    else {
      if (tin > 0 && d0 < tin * 2) wv *= L.lerp(head, 1, L.smooth(d0 / (tin * 2)));
      if (tout > 0 && d1 < tout) wv *= L.lerp(tail, 1, Math.pow(d1 / tout, 0.7));
    }
    const hw = (w0 * wv) / 2;
    Lf.push([p[i][0] + nx * hw, p[i][1] + ny * hw]); Rt.push([p[i][0] - nx * hw, p[i][1] - ny * hw]);
  }
  const g = G, ch = Math.hypot(p[n - 1][0] - p[0][0], p[n - 1][1] - p[0][1]);
  g.save(); g.globalAlpha *= o.alpha === undefined ? 0.9 : o.alpha;
  // the ink runs a little thinner toward the end of the pull
  g.fillStyle = ch > 8 / KS ? L.linear(g, p[0][0], p[0][1], p[n - 1][0], p[n - 1][1], [[0, color], [0.55, L.rgba(color, 0.92)], [1, L.rgba(color, 0.7)]]) : color;
  trace(g, Lf.concat(Rt.reverse()), true); g.fill();
  if (!o.spindle && head >= 1) { g.beginPath(); g.arc(p[0][0], p[0][1], (w0 * head) / 2, 0, L.TAU); g.fill(); }
  g.restore();
  if (o.z) { HG.save(); HG.strokeStyle = zc(o.z); HG.lineWidth = w0 * 1.2; HG.lineCap = 'round'; HG.lineJoin = 'round'; trace(HG, p, false); HG.stroke(); HG.restore(); }
}
/** an open contour drawn in several pulls of the brush; cuts = fractions along it where the brush was lifted */
function pulls(d, cuts, px, color, o = {}) {
  const n = d.length, idx = [0].concat(cuts.map((c) => Math.round(c * (n - 1))), [n - 1]);
  for (let k = 0; k < idx.length - 1; k++) {
    const seg = d.slice(Math.max(0, idx[k] - (k ? 2 : 0)), idx[k + 1] + 1);
    if (seg.length > 2) line(seg, px, color, o);
  }
}
/** a closed contour: two or three pulls that do not quite meet */
function outline(poly, px, color, o = {}) {
  const n = poly.length, r = L.rng('s14o' + (SEED++));
  const parts = o.parts || (n > 150 ? 3 : n > 50 ? 2 : 1), start = o.start === undefined ? r.int(0, n - 1) : Math.round(o.start * n);
  for (let k = 0; k < parts; k++) {
    const i0 = start + Math.round((n * k) / parts), i1 = start + Math.round((n * (k + 1)) / parts) - (parts > 1 ? 1 : -1), seg = [];
    for (let i = i0; i <= i1; i++) seg.push(poly[((i % n) + n) % n]);
    if (seg.length > 2) line(seg, px * r.range(0.95, 1.06), color, { tout: 16, ...o });
  }
}
/**
 * One patch of enamel. poly = dense closed outline (figure units), fam = colour family.
 * o.z      height above the glaze (0..1)
 * o.grad   0..1: 玻璃白 on the side toward the light, colour gathering on the side away from it
 * o.rim    0..1: colour pooled just inside the rim that faces away from the light
 * o.folds  [{p, side: ±1 (which side of the line the wash lies on, +1 = to the right of travel), w, line (px, 0 = none), la}]; o.fw wash width px, o.fa alpha
 * o.hi     [[pts]…] 玻璃白 left showing; o.hw width px, o.ha alpha
 * o.drag   0..1 faint drags of the brush; o.dir their direction
 * o.pattern(g) drawn clipped; o.outline px (0 = none); o.mis colour-to-line misregistration px
 */
function patch(poly, fam, o = {}) {
  const g = G, id = SEED++, u = 1 / KS, z = o.z === undefined ? 0.5 : o.z;
  const [x0, y0, x1, y1] = bbox(poly), bw = x1 - x0, bh = y1 - y0;
  const r = L.rng('s14p' + id), mis = o.mis === undefined ? 0.7 : o.mis;
  g.save();
  g.translate(r.range(-1, 1) * mis * u, r.range(-1, 1) * mis * u);            // colour never sits exactly inside its line
  trace(g, poly, true); g.fillStyle = o.fill || fam.base; g.fill(); g.clip();
  g.lineJoin = 'round'; g.lineCap = 'round';
  const gr = o.grad === undefined ? 1 : o.grad;
  if (gr) {
    const ax = MIR > 0 ? x0 : x1, bx = MIR > 0 ? x1 : x0;
    g.fillStyle = L.linear(g, ax, y0, bx, y1, [[0, L.rgba(fam.lt, 0.82 * gr)], [0.3, L.rgba(fam.lt, 0.4 * gr)], [0.62, L.rgba(fam.lt, 0)]]);
    g.fillRect(x0 - 2, y0 - 2, bw + 4, bh + 4);
    g.fillStyle = L.linear(g, ax, y0, bx, y1, [[0.4, L.rgba(fam.mid, 0)], [0.8, L.rgba(fam.mid, 0.3 * gr)], [1, L.rgba(fam.mid, 0.5 * gr)]]);
    g.fillRect(x0 - 2, y0 - 2, bw + 4, bh + 4);
  }
  const rim = o.rim === undefined ? 1 : o.rim;
  if (rim) {
    g.save(); g.translate(-5 * u * MIR, -6 * u);
    g.filter = 'blur(4.5px)'; g.strokeStyle = L.rgba(fam.mid, 0.6 * rim); g.lineWidth = 14 * u; trace(g, poly, true); g.stroke();
    g.restore();
    g.filter = 'blur(1.2px)'; g.strokeStyle = L.rgba(fam.deep, 0.2 * rim); g.lineWidth = 4 * u; trace(g, poly, true); g.stroke();
    g.filter = 'none';
  }
  const folds = o.folds || [];
  if (folds.length) {
    const fpx = o.fw || 26, fw = fpx * u, fa = o.fa === undefined ? 0.6 : o.fa, ds = folds.map((f) => cr(f.p, false, 4));
    g.filter = `blur(${(fpx * 0.2).toFixed(1)}px)`; g.fillStyle = L.rgba(fam.mid, fa);
    g.beginPath(); ds.forEach((d, i) => addPoly(g, wedge(d, folds[i].side || 1, fw * 0.05, fw * (folds[i].w || 1)))); g.fill();
    g.filter = `blur(${(fpx * 0.07).toFixed(1)}px)`; g.fillStyle = L.rgba(fam.deep, fa * 0.5);
    g.beginPath(); ds.forEach((d, i) => addPoly(g, wedge(d, folds[i].side || 1, 0, fw * 0.3 * (folds[i].w || 1)))); g.fill();
    g.filter = 'none';
  }
  if (o.hi) {
    g.filter = `blur(${((o.hw || 12) * 0.4).toFixed(1)}px)`; g.strokeStyle = L.rgba(fam.lt, o.ha === undefined ? 0.75 : o.ha); g.lineWidth = (o.hw || 12) * u;
    g.beginPath(); for (const hp of o.hi) addLine(g, cr(hp, false, 5)); g.stroke(); g.filter = 'none';
  }
  if (o.pattern) o.pattern(g);
  const dg = o.drag === undefined ? 1 : o.drag;
  if (dg) {
    // the wash was drawn on with a soft brush: hair-fine streaks, barely lighter or deeper, all running one way
    const dir = nrm(o.dir || [0.25, 1]), q = [-dir[1], dir[0]], cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, m = Math.hypot(bw, bh) / 2;
    const n = Math.round(L.clamp((bw * bh * KS * KS) / 900, 5, 46) * dg);
    for (let i = 0; i < n; i++) {
      const off = r.range(-m, m), s0 = r.range(-m, m * 0.3), s1 = s0 + r.range(m * 0.35, m * 1.0), bend = r.range(-0.1, 0.1) * m;
      const a = [cx + q[0] * off + dir[0] * s0, cy + q[1] * off + dir[1] * s0], b = [cx + q[0] * off + dir[0] * s1, cy + q[1] * off + dir[1] * s1];
      g.strokeStyle = L.rgba(r.chance(0.5) ? fam.lt : fam.mid, r.range(0.07, 0.16)); g.lineWidth = r.range(1.5, 4.2) * u;
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2 + q[0] * bend, (a[1] + b[1]) / 2 + q[1] * bend, b[0], b[1]); g.stroke();
    }
  }
  g.restore();
  HG.fillStyle = zc(z); trace(HG, poly, true); HG.fill();
  for (const f of folds) if (f.line !== 0) line(f.p, f.line || 1.5, fam.line, { alpha: f.la === undefined ? 0.8 : f.la, tout: 30 });
  if (o.outline) outline(poly, o.outline, o.lineCol || fam.line, { alpha: 0.9 });
}
/** a border band (collar, cuff) round a centre line */
function band(centre, w, fam, z) {
  const t = tube(centre, centre.map(() => w), 3);
  patch(t.poly, fam, { z, grad: 0.8, rim: 0.8, drag: 0.5, dir: sub(centre[centre.length - 1], centre[0]) });
  line(t.left, 1.6, fam.line, { tout: 8 }); line(t.right, 1.6, fam.line, { tout: 8 });
}
/** a small pool of black enamel (hair): dense, a little glossy, its edge softened where the brush left hairs */
function inkMass(poly, wisps = []) {
  const g = G;
  g.save(); g.filter = 'blur(1.4px)'; g.fillStyle = L.rgba(C.ink, 0.55); trace(g, poly, true); g.fill(); g.filter = 'none'; g.restore();
  patch(poly, F.ink, { z: 0.82, grad: 0.32, rim: 0.7, drag: 0.6, mis: 0 });
  for (const w of wisps) line(w, 1.4, C.ink, { alpha: 0.85, head: 1, tin: 0, tout: 12, tail: 0.5 });
}
/** 团花: a faint roundel, white-petalled, on the pink */
function roundel(g, x, y, r, fam) {
  const u = 1 / KS;
  g.strokeStyle = L.rgba(fam.deep, 0.4); g.lineWidth = 1.3 * u; g.beginPath(); g.arc(x, y, r, 0, L.TAU); g.stroke();
  g.strokeStyle = L.rgba(fam.deep, 0.28); g.beginPath(); g.arc(x, y, r * 0.4, 0, L.TAU); g.stroke();
  g.fillStyle = L.rgba('#fffaf4', 0.86);
  for (let i = 0; i < 8; i++) { const t = (i / 8) * L.TAU + 0.3; g.beginPath(); g.ellipse(x + Math.cos(t) * r * 0.7, y + Math.sin(t) * r * 0.7, r * 0.18, r * 0.13, t, 0, L.TAU); g.fill(); }
  g.fillStyle = L.rgba(fam.deep, 0.5); g.beginPath(); g.arc(x, y, r * 0.15, 0, L.TAU); g.fill();
}
/** a small five-petalled flower scattered on the yellow */
function floret(g, x, y, r, col) {
  g.fillStyle = L.rgba(col, 0.6);
  for (let i = 0; i < 5; i++) { const t = (i / 5) * L.TAU - 1.57; g.beginPath(); g.arc(x + Math.cos(t) * r * 0.62, y + Math.sin(t) * r * 0.62, r * 0.36, 0, L.TAU); g.fill(); }
  g.fillStyle = L.rgba('#fffbe6', 0.92); g.beginPath(); g.arc(x, y, r * 0.24, 0, L.TAU); g.fill();
}

// ───────────────────────── the children (figure units: the head is 200 across, centred on the origin, facing +x) ─────────────────────────
/** a hair knot tied with red thread */
function knot(x, y, r) {
  const rr = L.rng('s14k' + (SEED++)), d = nrm([-x, -y]), q = [-d[1], d[0]];       // d: toward the crown, where it is tied
  const bx = x + d[0] * r * 0.9, by = y + d[1] * r * 0.9;
  for (const s of [-1, 1]) {
    const e0 = [bx + q[0] * s * r * 0.45, by + q[1] * s * r * 0.45];
    const e1 = [e0[0] + q[0] * s * r * 0.8 - d[0] * r * 0.25, e0[1] + q[1] * s * r * 0.8 - d[1] * r * 0.25];
    const e2 = [e1[0] + q[0] * s * r * 0.6 + d[0] * r * 0.45, e1[1] + q[1] * s * r * 0.6 + d[1] * r * 0.45];
    line([e0, e1, e2], 3.2, F.red.base, { alpha: 0.92, head: 1, tin: 2, tout: r * KS * 0.9, tail: 0.32, z: 0.62 });
  }
  const blob = cr(ell(x, y, r, r * 0.9, 9).map((p) => [p[0] + rr.range(-1.5, 1.5), p[1] + rr.range(-1.5, 1.5)]), true, 2.5);
  inkMass(blob);
  // a soft light on the knot, and the thread
  G.save(); G.filter = 'blur(1.6px)'; G.strokeStyle = 'rgba(190,186,182,0.5)'; G.lineWidth = 2.6 / KS; G.lineCap = 'round';
  G.beginPath(); G.arc(x, y, r * 0.55, Math.PI * (MIR > 0 ? 1.05 : 1.45), Math.PI * (MIR > 0 ? 1.55 : 1.95)); G.stroke(); G.filter = 'none'; G.restore();
  patch(cr(ell(bx, by, r * 0.6, r * 0.24, 8, Math.atan2(q[1], q[0])), true, 2), F.red, { z: 0.7, grad: 0.6, rim: 0.8, drag: 0, outline: 1.3, mis: 0 });
}
/**
 * The head, three-quarter view: broad and round, the brow high, the features small and gathered low in the face —
 * fine arched brows, narrow smiling eyes with a bead of a pupil, a hook of a nose, a small mouth touched with red.
 * o.hair: 'buns' (总角) | 'peach' (a tuft left on the shaved crown, another over the ear)
 */
function head(o = {}) {
  const FL = F.flesh, LC = FL.line, INK = C.ink, u = 1 / KS, g = G;
  if (o.hair === 'buns') knot(57, -87, 16);                                       // the far knot sits behind the crown
  const skullPts = [[4, -92], [40, -87], [70, -70], [89, -44], [95, -14], [96, 12], [100, 36], [95, 58], [80, 77], [56, 90], [26, 96], [-6, 92], [-38, 80], [-64, 60], [-84, 32], [-96, 0], [-98, -32], [-86, -62], [-60, -82], [-28, -91]];
  const skull = cr(skullPts, true, 3);
  const peach = cr([[4, -91], [30, -95], [54, -86], [65, -68], [58, -53], [43, -43], [29, -51], [13, -59], [2, -76]], true, 2.5);
  const tuft = cr(ell(-62, -20, 12, 16, 9, 0.1), true, 2.5);
  patch(skull, FL, {
    z: 0.56, grad: 0, rim: 0, drag: 0, mis: 0,
    pattern: () => {
      // 淡粉层层渲染: a breath of pink inside the contour on the side away from the light, then the cheeks, lids, chin
      g.save(); g.translate(-7 * u * MIR, -8 * u);
      g.filter = 'blur(9px)'; g.strokeStyle = L.rgba('#f3b0a8', 0.55); g.lineWidth = 20 * u; trace(g, skull, true); g.stroke(); g.filter = 'none';
      g.restore();
      bloomAt(g, 22, 44, 45, '#f19aa2', 0.5); bloomAt(g, 21, 45, 23, '#ea7d8e', 0.3);
      bloomAt(g, 87, 42, 25, '#f19aa2', 0.44);
      bloomAt(g, 26, 0, 22, '#f6b9b2', 0.24); bloomAt(g, 76, -2, 16, '#f6b9b2', 0.22);
      bloomAt(g, 54, 78, 20, '#f6b9b2', 0.28);
      bloomAt(g, 59, 37, 9, '#f19aa2', 0.3);
      // where the hair springs from the scalp
      if (o.hair === 'buns') { bloomAt(g, -50, -84, 36, '#5d5650', 0.26); bloomAt(g, 57, -82, 27, '#5d5650', 0.22); }
      else {
        g.filter = 'blur(5px)'; g.fillStyle = L.rgba('#5d5650', 0.34);
        g.beginPath(); addPoly(g, peach); addPoly(g, tuft); g.fill(); g.filter = 'none';
      }
    },
  });
  // the contour: forehead – cheek – chin in one pull, the back of the skull in another
  line(skullPts.slice(-1).concat(skullPts.slice(0, 13)), 1.9, LC, { tout: 30 });
  line([[-34, -90], [-60, -82], [-86, -62], [-98, -32], [-96, 0], [-84, 32], [-64, 60], [-48, 73]], 1.8, LC, { tout: 30 });
  // ear
  const ear = cr([[-46, 8], [-57, 1], [-68, 8], [-72, 24], [-67, 40], [-57, 48], [-48, 41], [-44, 24]], true, 2.5);
  patch(ear, FL, { z: 0.61, grad: 0, rim: 0.9, drag: 0, mis: 0, pattern: () => bloomAt(g, -60, 30, 18, '#f19aa2', 0.42) });
  line([[-45.5, 9], [-57, 1], [-68, 8], [-72, 24], [-67, 40], [-57, 48], [-49, 42]], 1.7, LC, { tout: 12 });
  line([[-61, 12], [-64.5, 25], [-59, 38]], 1.3, LC, { alpha: 0.7, tout: 10 });
  // brows: fine, pale, arched
  line([[4, -3], [20, -12], [42, -6.5]], 1.4, INK, { alpha: 0.6, spindle: 1 });
  line([[60, -8], [72, -14], [86, -8.5]], 1.3, INK, { alpha: 0.58, spindle: 1 });
  // eyes: one slender arched lid each (the child is smiling), the pupil a small dark bead under it, a whisper of lower lid
  line([[9, 18.5], [18, 11], [30, 10], [43, 16.5]], 2.0, INK, { alpha: 0.95, spindle: 1, shake: 0.2 });
  line([[61, 14.5], [69, 8.5], [79, 8.5], [89, 13.5]], 1.8, INK, { alpha: 0.95, spindle: 1, shake: 0.2 });
  g.fillStyle = L.rgba(INK, 0.96);
  g.beginPath(); g.ellipse(30.5, 14.5, 3.0, 2.9, 0, 0, L.TAU); g.fill();
  g.beginPath(); g.ellipse(78, 12.5, 2.7, 2.6, 0, 0, L.TAU); g.fill();
  line([[18, 21.5], [28, 23.5], [38, 21]], 1.2, LC, { alpha: 0.4, spindle: 1 });
  line([[66, 18], [75, 20], [84, 17.5]], 1.2, LC, { alpha: 0.36, spindle: 1 });
  // nose: one small hook; mouth: a short smiling line, touched with red above and below (点朱); a dimple, the plump chin
  line([[56, 24], [62, 35], [59, 40], [52, 40.5]], 1.4, LC, { alpha: 0.86, tout: 8 });
  g.fillStyle = L.rgba('#cf3f30', 0.84);
  g.beginPath(); g.ellipse(50.6, 56.1, 3.3, 1.6, -0.25, 0, L.TAU); g.fill();
  g.beginPath(); g.ellipse(57.6, 55.8, 3.3, 1.6, 0.25, 0, L.TAU); g.fill();
  g.beginPath(); g.ellipse(54.2, 63.2, 5.0, 2.7, 0, 0, L.TAU); g.fill();
  line([[42, 54.5], [48, 58.5], [54, 59.8], [60, 58.3], [65, 54]], 1.5, '#7c241c', { alpha: 0.92, spindle: 1, shake: 0.2 });
  line([[38, 50], [36, 55], [38.5, 60]], 1.2, LC, { alpha: 0.36, spindle: 1 });
  line([[42, 80], [54, 84], [66, 79]], 1.2, LC, { alpha: 0.42, spindle: 1 });
  // hair: small masses of ink
  if (o.hair === 'buns') knot(-50, -90, 20);
  else {
    inkMass(peach, [[[43, -43], [44, -37], [42.5, -32]], [[30, -50], [30, -44], [31.5, -40]], [[53, -48], [55, -42], [54, -38]]]);
    inkMass(tuft, [[[-58, -5], [-57, 1], [-58.5, 5]], [[-66, -5], [-67, 1], [-65.5, 4]]]);
    G.save(); G.filter = 'blur(2px)'; G.strokeStyle = 'rgba(190,186,182,0.42)'; G.lineWidth = 3 / KS; G.lineCap = 'round';
    trace(G, cr(MIR > 0 ? [[10, -77], [22, -86], [38, -88]] : [[38, -88], [52, -81], [59, -69]], false, 3), false); G.stroke(); G.filter = 'none'; G.restore();
  }
}
/** a small plump fist closed round a stick that runs along the local x axis */
function fist(x, y, ang) {
  xf(x, y, ang, () => {
    const FL = F.flesh;
    patch(cr([[-13, -8], [-4, -13.5], [8, -13], [15.5, -6], [16.5, 5], [10, 13], [-3, 14.5], [-12.5, 9.5]], true, 2), FL, {
      z: 0.66, grad: 0, rim: 0.8, drag: 0, mis: 0, outline: 1.7, pattern: (g) => { bloomAt(g, 8, -8, 12, '#f19aa2', 0.42); bloomAt(g, -6, 8, 10, '#f3b0a8', 0.3); },
    });
    line([[7, -12], [10.5, -4.5], [8.5, 3.5]], 1.3, FL.line, { alpha: 0.8, tout: 6 });
    line([[1, -13], [4, -5.5], [2, 2]], 1.3, FL.line, { alpha: 0.75, tout: 6 });
    line([[-5.5, -12.5], [-2.5, -6], [-4.5, 0]], 1.2, FL.line, { alpha: 0.65, tout: 6 });
    line([[-10, 5], [-2, 8], [6.5, 6]], 1.3, FL.line, { alpha: 0.75, tout: 6 });
  });
}
/** a stick of some thickness: bamboo (with nodes) or a plain cane */
function stick(p0, p1, w, fam, nodes = []) {
  const t = tube([p0, mixP(p0, p1, 0.5), p1], [w, w * 1.05, w * 0.94], 3), n = t.c.length;
  const lit = t.right.map((p, i) => mixP(p, t.left[i], 0.3)), dark = t.right.map((p, i) => mixP(p, t.left[i], 0.82));
  patch(t.poly, fam, {
    z: 0.64, grad: 0, rim: 0, drag: 0, mis: 0,
    pattern: (g) => {
      g.lineCap = 'butt';
      g.strokeStyle = L.rgba(fam.mid, 0.75); g.lineWidth = w * 0.36; trace(g, dark, false); g.stroke();
      g.strokeStyle = L.rgba(fam.lt, 0.9); g.lineWidth = w * 0.26; trace(g, lit, false); g.stroke();
    },
  });
  line(t.left, 1.6, fam.line, { tout: 0, tin: 0, head: 1 }); line(t.right, 1.5, fam.line, { tout: 0, tin: 0, head: 1, alpha: 0.8 });
  line([t.left[n - 1], t.right[n - 1]], 1.5, fam.line, { tout: 0, tin: 0, head: 1 });
  for (const f of nodes) {
    const i = Math.round(f * (n - 1));
    line([mixP(t.left[i], t.right[i], -0.12), mixP(t.left[i], t.right[i], 1.12)], 1.8, fam.line, { tout: 0, tin: 0, head: 1 });
    const j = Math.min(n - 1, i + 2);
    line([t.left[j], t.right[j]], 1.2, fam.line, { tout: 0, tin: 0, head: 1, alpha: 0.5 });
  }
}
/** the round lantern, hanging by a cord from (x, y) */
function lantern(x, y) {
  const R = F.rouge, O = F.ochre, rx = 62, ry = 66, cy = y + 32 + ry, g = G, r = L.rng('s14tassel');
  line([[x, y], [x + 0.5, y + 21]], 1.5, C.ink, { tout: 0, alpha: 0.85 });
  // tassel: fine threads, red and yellow by turns
  for (let i = -3; i <= 3; i++) {
    line([[x + i * 1.5, cy + ry + 21], [x + i * 2.5 + r.range(-1, 1), cy + ry + 42], [x + i * 3.3 + r.range(-2, 2), cy + ry + 62 + r.range(-6, 4)]], 1.7, i & 1 ? '#c8452f' : '#d9912e', { alpha: 0.92, tout: 22, tail: 0.55, z: 0.5 });
  }
  patch(cr(ell(x, cy + ry + 17, 5.6, 5.4, 8), true, 1.5), F.red, { z: 0.72, grad: 0.7, rim: 0.8, drag: 0, mis: 0, outline: 1.4 });
  const ball = cr(ell(x, cy, rx, ry, 18), true, 3);
  patch(ball, R, {
    z: 0.6, grad: 0, rim: 0.8, drag: 0.7, dir: [0.05, 1], outline: 1.9, mis: 0,
    pattern: () => {
      // round: 玻璃白 swelling toward the light, the rouge deepening away from it
      const hx = x - MIR * 19, hy = cy - 22;
      g.fillStyle = L.radial(g, hx, hy, 2, rx * 1.25, [[0, L.rgba(R.lt, 0.96)], [0.3, L.rgba(R.lt, 0.62)], [0.62, L.rgba(R.lt, 0.16)], [0.85, L.rgba(R.lt, 0)]]);
      g.fillRect(x - rx - 4, cy - ry - 4, rx * 2 + 8, ry * 2 + 8);
      g.fillStyle = L.radial(g, hx, hy, rx * 0.7, rx * 1.75, [[0, L.rgba(R.deep, 0)], [0.55, L.rgba(R.deep, 0.34)], [1, L.rgba(R.deep, 0.72)]]);
      g.fillRect(x - rx - 4, cy - ry - 4, rx * 2 + 8, ry * 2 + 8);
    },
  });
  // ribs: fine lines along the meridians
  for (const k of [-0.76, -0.4, 0, 0.4, 0.76]) {
    line([[x + k * rx * 0.3, cy - ry * 0.97], [x + k * rx * 0.86, cy - ry * 0.5], [x + k * rx, cy], [x + k * rx * 0.86, cy + ry * 0.5], [x + k * rx * 0.3, cy + ry * 0.97]], 1.4, R.line, { alpha: 0.62, tout: 0, tin: 0, head: 1 });
  }
  // a glint where the enamel stands thickest
  g.save(); g.filter = 'blur(2.2px)'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(x - MIR * 23, cy - 30, 9, 5, -0.6 * MIR, 0, L.TAU); g.fill(); g.filter = 'none'; g.restore();
  // caps
  patch(dense([[x - 15, y + 20], [x + 15, y + 20], [x + 19, y + 34], [x - 19, y + 34]], true, 3), O, { z: 0.72, grad: 0.8, rim: 0.9, drag: 0, mis: 0, outline: 1.6 });
  patch(dense([[x - 19, cy + ry - 3], [x + 19, cy + ry - 3], [x + 15, cy + ry + 11], [x - 15, cy + ry + 11]], true, 3), O, { z: 0.72, grad: 0.8, rim: 0.9, drag: 0, mis: 0, outline: 1.6 });
}
/** the flesh showing in the V of the collar, with the shadow of the chin, and the back of the neck */
function throat(pts) {
  patch(dense(pts, true, 4), F.flesh, {
    z: 0.5, grad: 0, rim: 0, drag: 0, mis: 0,
    pattern: (g) => { g.filter = 'blur(6px)'; g.fillStyle = L.rgba('#eaa79c', 0.62); g.beginPath(); g.ellipse(12, 96, 54, 13, 0.05, 0, L.TAU); g.fill(); g.filter = 'none'; },
  });
  line([[-37, 83], [-39.5, 91], [-42, 99]], 1.5, F.flesh.line, { tout: 0, alpha: 0.8 });
}
const HEAD_K = 0.85;   // the head is drawn on a 200-unit grid and set on the shoulders a little smaller: a child of four heads, not a doll

/** astride the bamboo horse, both fists on the pole, leaning into the gallop (the bank hides the legs and the pole's trailing end) */
function kidA() {
  const P = F.pink, T = F.green;
  const dots = (g) => { for (const [x, y] of [[-78, 178], [-36, 248], [18, 254], [50, 178], [86, 254], [130, 178]]) roundel(g, x, y, 14, P); };
  // far sleeve, reaching forward to the pole, with its cuff
  patch(cr([[58, 126], [94, 133], [126, 160], [147, 196], [151, 222], [117, 236], [104, 212], [88, 190], [62, 172]], true, 4), P, {
    z: 0.47, fw: 30, fa: 0.85, folds: [{ p: [[98, 142], [122, 176], [135, 214]], side: 1 }], pattern: dots, dir: [0.4, 1],
    hi: [[[100, 138], [128, 166], [144, 200]]], hw: 9,
  });
  line([[72, 126], [94, 133], [126, 160], [147, 196], [151, 221]], 1.9, P.line, { tout: 8 });
  line([[117, 235], [104, 212], [91, 193]], 1.7, P.line, { tout: 14 });
  patch(dense([[152, 221], [117, 236.5], [113, 224], [148, 208.5]], true, 3), T, { z: 0.58, grad: 0.8, rim: 0.8, drag: 0.5, outline: 1.6 });
  // the jacket
  patch(cr([[-40, 100], [-78, 115], [-102, 146], [-104, 204], [-92, 262], [-96, 330], [-104, 400], [70, 404], [96, 330], [102, 262], [95, 200], [86, 152], [72, 123], [50, 104], [30, 112], [0, 112], [-25, 106]], true, 5), P, {
    z: 0.5, fw: 36, fa: 0.85, pattern: dots, dir: [0.1, 1],
    folds: [{ p: [[46, 152], [60, 204], [58, 258], [46, 318]], side: -1 }, { p: [[14, 168], [26, 214], [22, 266], [8, 320]], side: -1, la: 0.6 }, { p: [[86, 178], [76, 208], [74, 254], [82, 318]], side: 1, w: 0.7, la: 0.6 }],
    hi: [[[72, 142], [86, 192], [92, 252]]], hw: 13,
  });
  line([[52, 104], [72, 123], [86, 152], [95, 200], [102, 262], [96, 330]], 2.0, P.line, { tout: 0 });
  line([[-42, 100], [-78, 115], [-102, 146], [-104, 204], [-92, 262], [-96, 330]], 2.0, P.line, { tout: 0 });
  // the bamboo horse, then the far fist over it
  stick([-62, 302], [184, 223.2], 11, F.bamboo, [0.16, 0.44, 0.92]);
  fist(131, 239.5, -0.31);
  // collar: crossed, the left lapel over the right (右衽)
  throat([[-38, 84], [48, 88], [52, 105], [12, 148], [-42, 99]]);
  band([[-42, 97], [-20, 118], [8, 142]], 13, T, 0.6);
  band([[52, 103], [36, 128], [8, 157], [-26, 184]], 13.5, T, 0.64);
  // near sleeve: hanging from the forearm, pushed into folds at the crook of the elbow
  const sl = cr([[56, 238], [30, 228], [4, 220], [-22, 206], [-40, 172], [-50, 134], [-76, 115], [-103, 138], [-112, 188], [-98, 238], [-60, 269], [-8, 279], [44, 273]], false, 4).map(xy);
  patch(sl, P, {
    z: 0.57, fw: 34, fa: 0.85, pattern: dots, dir: [0.5, 1],
    folds: [{ p: [[-84, 130], [-93, 174], [-86, 216]], side: -1, la: 0.6 }, { p: [[-24, 209], [-50, 228], [-82, 240]], side: 1 }, { p: [[-19, 213], [-30, 241], [-52, 263]], side: -1 }, { p: [[-6, 223], [8, 250], [30, 267]], side: 1, w: 0.8 }],
    hi: [[[-70, 125], [-97, 148], [-104, 188]], [[-8, 226], [22, 234], [44, 240]]], hw: 12,
  });
  pulls(sl, [0.42, 0.7], 2.0, P.line, { tout: 20 });
  patch(dense([[57, 237.5], [44.5, 274], [31, 272.5], [43.5, 233.5]], true, 3), T, { z: 0.66, grad: 0.8, rim: 0.8, drag: 0.5, outline: 1.6 });
  fist(67, 257.5, -0.31);
  sc(10, 96, HEAD_K, () => xf(0, 0, 0.05, () => head({ hair: 'buns' })));
}
/** holding the lantern up on its stick (drawn facing +x, placed mirrored) */
function kidB() {
  const Y = F.yellow, T = F.blue, RED = '#cf5a3c';
  const dots = (g) => { for (const [x, y] of [[-80, 170], [-60, 230], [-18, 247], [28, 227], [54, 209], [-8, 160], [64, 150], [86, 238], [-48, 292], [32, 292], [78, 290]]) floret(g, x, y, 6.5, RED); };
  patch(cr([[-40, 100], [-78, 115], [-102, 146], [-102, 204], [-88, 262], [-92, 330], [-100, 400], [70, 404], [90, 330], [95, 262], [92, 200], [85, 152], [72, 123], [50, 104], [30, 112], [0, 112], [-25, 106]], true, 5), Y, {
    z: 0.5, fw: 36, fa: 0.85, pattern: dots, dir: [0.1, 1],
    folds: [{ p: [[42, 128], [64, 150], [80, 188]], side: 1, la: 0.6 }, { p: [[82, 198], [74, 248], [82, 304]], side: 1, w: 0.8 }, { p: [[20, 272], [30, 292], [26, 316]], side: -1, la: 0.6 }, { p: [[-40, 274], [-34, 294], [-40, 316]], side: -1, la: 0.6 }],
    hi: [[[68, 138], [82, 188], [88, 252]]], hw: 13,
  });
  line([[52, 104], [72, 123], [85, 152], [92, 200], [95, 262], [90, 330]], 2.0, Y.line, { tout: 0 });
  line([[-42, 100], [-78, 115], [-102, 146], [-102, 204], [-88, 262], [-92, 330]], 2.0, Y.line, { tout: 0 });
  // the lantern's stick and the lantern
  stick([62, 251], [246, 22], 5.4, F.ochre);
  lantern(246, 22);
  // collar (drawn so that, mirrored on the wall, it still closes to the wearer's right)
  throat([[-38, 84], [48, 88], [52, 105], [30, 141], [-42, 99]]);
  band([[52, 103], [42, 121], [30, 139]], 13, T, 0.6);
  band([[-42, 97], [-14, 120], [22, 150], [60, 184]], 13.5, T, 0.64);
  // near sleeve, the forearm lifted
  const sl = cr([[74, 188], [44, 190], [10, 196], [-20, 200], [-40, 170], [-50, 134], [-76, 115], [-103, 138], [-113, 190], [-100, 242], [-64, 271], [-10, 274], [40, 260], [88, 236]], false, 4).map(xy);
  patch(sl, Y, {
    z: 0.57, fw: 34, fa: 0.85, pattern: dots, dir: [0.5, 1],
    folds: [{ p: [[-84, 130], [-94, 176], [-88, 220]], side: -1, la: 0.6 }, { p: [[-22, 203], [-50, 227], [-84, 242]], side: 1 }, { p: [[-17, 207], [-26, 238], [-46, 263]], side: -1 }, { p: [[0, 204], [20, 232], [50, 250]], side: 1, w: 0.8 }],
    hi: [[[-70, 125], [-97, 148], [-105, 190]], [[0, 203], [34, 198], [64, 196]]], hw: 12,
  });
  pulls(sl, [0.42, 0.7], 2.0, Y.line, { tout: 20 });
  patch(dense([[74, 188], [88, 236], [75.3, 238.8], [61.3, 190.8]], true, 3), T, { z: 0.66, grad: 0.8, rim: 0.8, drag: 0.5, outline: 1.6 });
  fist(100, 204, Math.atan2(-182, 146));
  sc(10, 96, HEAD_K, () => xf(0, 0, -0.05, () => head({ hair: 'peach' })));
}
/** stand a figure on the wall: (x, y) = centre of its head in the frame, k = scale, mir = −1 to face left, lean = radians forward */
function place(x, y, k, mir, lean, fn) {
  KS = k; MIR = mir;
  for (const c of [G, HG]) { c.save(); c.translate(x, y); c.rotate(lean * mir); c.scale(k * mir, k); }
  fn();
  for (const c of [G, HG]) c.restore();
  KS = 1; MIR = 1;
}

// ───────────────────────── the green bank ─────────────────────────
const GCOLS = ['#2c5231', '#274a2c', '#2f4a2a'];
const TUFTS = [[-1250, -36, 1.15], [-860, -14, 1.0], [-560, -52, 1.2], [-215, -18, 0.95], [150, -58, 1.15], [470, -10, 1.0], [760, -48, 1.2], [1100, -22, 1.1], [1380, -50, 1.2]];
const MOSS = [[-1040, -70], [-420, -84], [-40, -40], [330, -88], [620, -30], [1240, -76]];
function slope(env) {
  const g = G, a = env.arc, sp = a.span(PAD + 180), nz = L.makeNoise('s14slope'), r = L.rng('s14grass');
  const cw = g.canvas.width, chh = g.canvas.height;
  const sheet = () => { const c = L.makeCanvas(cw, chh), x = c.getContext('2d'); x.translate(-RX, -RY); x.lineCap = 'round'; x.lineJoin = 'round'; return [c, x]; };
  const stamp = (dst, c, op, filter) => { dst.save(); dst.setTransform(1, 0, 0, 1, 0, 0); if (op) dst.globalCompositeOperation = op; if (filter) dst.filter = filter; dst.drawImage(c, 0, 0); dst.filter = 'none'; dst.restore(); };
  // how far down the bank the green wash reaches, and the thinner first wash that shows below it here and there
  const depth = (u) => 112 + 44 * nz.fbm(u / 760, 1.3, 3) + 9 * nz.n2(u / 170, 7.7) + 2.2 * nz.n2(u / 56, 2.2);
  const N = 560, low = [], low2 = [];
  for (let i = 0; i <= N; i++) {
    const th = L.lerp(sp, -sp, i / N), u = th * a.R, d = depth(u), d2 = d + 6 + 18 * nz.n2(u / 260, 11.3) + 5 * nz.n2(u / 70, 15.9);
    const p = a.pt(th, -d), p2 = a.pt(th, -d2);
    low.push([p.x, p.y]); low2.push([p2.x, p2.y]);
  }
  const bandPath = (c, pts) => { c.beginPath(); a.trace(c, 0, -sp, sp); for (const p of pts) c.lineTo(p[0], p[1]); c.closePath(); };
  // the footprint of the wash: crisp where the enamel stopped in a bead, feathered away in the stretches where the brush ran dry
  const [mc, mg] = sheet(), [ec, eg] = sheet();
  bandPath(mg, low); mg.fillStyle = '#000000'; mg.fill();
  for (let i = 0; i < 10; i++) {
    const t0 = L.lerp(-sp, sp, (i + r.range(0.1, 0.9)) / 10), ln = r.range(110, 340) / a.R, pts = [];
    for (let k = 0; k <= 12; k++) { const th = t0 + (ln * k) / 12, p = a.pt(th, -(depth(th * a.R) + 3)); pts.push([p.x, p.y]); }
    eg.strokeStyle = `rgba(0,0,0,${r.range(0.5, 0.95).toFixed(3)})`; eg.lineWidth = r.range(14, 30); trace(eg, pts, false); eg.stroke();
  }
  stamp(mg, ec, 'destination-out', 'blur(7px)');
  // the colour, on its own sheet: pale watery green, deepest where it pooled under the crest line
  const [bc, bg] = sheet();
  bg.fillStyle = L.radial(bg, a.cx, a.cy, a.R - 170, a.R, [[0, '#cfe8b6'], [0.35, '#bcdea2'], [0.7, '#a5d08c'], [0.93, '#93c47c'], [1, '#88bc72']]);
  bg.fillRect(RX, RY, cw, chh);
  // a second, deeper wash laid in long drifting patches
  bg.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's14w2', scale: 230, sx: 3.4, sy: 0.7, octaves: 3, res: 0.25, contrast: 1.5,
    ramp: [[0, L.rgba('#f0f9df', 0.36)], [0.36, L.rgba('#f0f9df', 0)], [0.54, L.rgba('#5aa257', 0)], [0.66, L.rgba('#5aa257', 0.14)], [1, L.rgba('#3f8a45', 0.3)]] }), -PAD, -PAD);
  // everything soft goes on one sheet that is blurred once: broad pulls of the brush along the bank, colour pooled under the
  // crest line and along the lower rim of the wash
  const [softC, sg] = sheet();
  for (const [n, col, a0, a1, w0, w1] of [[16, '#4c9f55', 0.1, 0.2, 12, 34], [12, '#eef8d6', 0.16, 0.3, 10, 26]]) {
    for (let i = 0; i < n; i++) {
      const t0 = L.lerp(-sp, sp, (i + r.range(0, 0.8)) / n), ln = ((2 * sp) / n) * r.range(0.7, 1.9), dr = -r.range(24, 124), tilt = r.range(-14, 14), pts = [];
      for (let k = 0; k <= 14; k++) { const p = a.pt(t0 + (ln * k) / 14, dr + tilt * (k / 14 - 0.5) + 5 * nz.n2(i * 3.1, k * 0.4)); pts.push([p.x, p.y]); }
      sg.strokeStyle = L.rgba(col, r.range(a0, a1)); sg.lineWidth = r.range(w0, w1); trace(sg, pts, false); sg.stroke();
    }
  }
  sg.strokeStyle = L.rgba('#3f8a47', 0.36); sg.lineWidth = 22; a.stroke(sg, -9, -sp, sp);
  sg.strokeStyle = L.rgba('#4c9a53', 0.4); sg.lineWidth = 10; trace(sg, low, false); sg.stroke();
  stamp(bg, softC, null, 'blur(4.5px)');
  // hair-fine streaks of the brush, running with the bank
  for (let i = 0; i < 160; i++) {
    const t0 = r.range(-sp, sp), ln = r.range(50, 240) / a.R, dr = -r.range(8, 150), tilt = r.range(-6, 6), pts = [];
    for (let k = 0; k <= 8; k++) { const p = a.pt(t0 + (ln * k) / 8, dr + tilt * (k / 8 - 0.5)); pts.push([p.x, p.y]); }
    bg.strokeStyle = L.rgba(r.chance(0.5) ? '#f2fae0' : '#3f8f49', r.range(0.06, 0.14)); bg.lineWidth = r.range(1.4, 3.4); trace(bg, pts, false); bg.stroke();
  }
  // the rim where the wash stopped and dried a shade deeper
  bg.strokeStyle = L.rgba('#4a9650', 0.32); bg.lineWidth = 4.2; trace(bg, low, false); bg.stroke();
  // pin-point bubbles in the thick green
  for (let i = 0; i < 56; i++) {
    const p = a.pt(r.range(-sp, sp), -r.range(10, 130)), rad = r.range(0.9, 1.6);
    bg.fillStyle = L.rgba('#2f7a3c', r.range(0.16, 0.32)); bg.beginPath(); bg.arc(p.x, p.y, rad + 0.7, 0, L.TAU); bg.fill();
    bg.fillStyle = L.rgba('#f2fbe2', r.range(0.4, 0.7)); bg.beginPath(); bg.arc(p.x - 0.4, p.y - 0.5, rad * 0.62, 0, L.TAU); bg.fill();
  }
  stamp(bg, mc, 'destination-in');
  // lay it on the wall: the thin first wash, then the green; and their heights
  bandPath(g, low2); g.fillStyle = L.rgba('#d6ecc0', 0.6); g.fill();
  bandPath(HG, low2); HG.fillStyle = zc(0.16); HG.fill();
  g.drawImage(bc, RX, RY);
  const [hc, hx] = sheet();
  hx.fillStyle = L.radial(hx, a.cx, a.cy, a.R - 170, a.R, [[0, zc(0.3)], [0.7, zc(0.42)], [1, zc(0.5)]]); hx.fillRect(RX, RY, cw, chh);
  stamp(hx, mc, 'destination-in');
  HG.drawImage(hc, RX, RY);

  // the brush contour ON the arc: its upper edge is fixed, the brush swells downward and now and then runs thin
  const M = 700, up = [], dn = [];
  for (let i = 0; i <= M; i++) {
    const th = L.lerp(-sp, sp, i / M), u = th * a.R;
    const w = Math.max(2.3, 5.6 + 2.7 * nz.n2(u / 150, 3.1) + 1.2 * nz.n2(u / 31, 8.8));
    const p0 = a.pt(th, 1.4), p1 = a.pt(th, 1.4 - w);
    up.push([p0.x, p0.y]); dn.push([p1.x, p1.y]);
  }
  const edge = up.concat(dn.reverse());
  g.fillStyle = L.rgba('#232d1c', 0.93); trace(g, edge, true); g.fill();
  HG.fillStyle = zc(0.64); trace(HG, edge, true); HG.fill();
  // the doubled line under it: a softer green, in long broken runs that wander a little
  for (let i = 0; i < 9; i++) {
    const t0 = L.lerp(-sp, sp, (i + r.range(0.0, 0.35)) / 9), ln = ((2 * sp) / 9) * r.range(0.5, 0.9), dr = -r.range(13, 19), pts = [];
    for (let k = 0; k <= 30; k++) { const th = t0 + (ln * k) / 30, p = a.pt(th, dr + 2.2 * nz.n2(th * a.R / 90, i * 4.7)); pts.push([p.x, p.y]); }
    line(pts, r.range(1.9, 2.5), '#3a6a3c', { alpha: 0.52, tin: 8, tout: 80, tail: 0.3, shake: 0.6 });
  }
  // grass: a few springy tufts drawn under the green (px along the arc from the crest, depth, size)
  for (const [u0, dr, k] of TUFTS) {
    const th = u0 / a.R, base = a.pt(th, dr), nb = r.int(4, 6), col = r.pick(GCOLS);
    xf(base.x, base.y, th, () => {
      for (let b = 0; b < nb; b++) {
        const t = ((b + r.range(-0.25, 0.25)) / (nb - 1)) * 2 - 1;                      // −1 … 1 across the fan
        const lean = t * 0.6, len = k * r.range(46, 82) * (1 - 0.35 * Math.abs(t)), bx = t * 5 * k + r.range(-2, 2), droop = t * r.range(0.25, 0.6);
        line([[bx, 3], [bx + Math.sin(lean) * len * 0.5, -Math.cos(lean) * len * 0.5], [bx + Math.sin(lean + droop) * len, -Math.cos(lean + droop * 0.6) * len * 0.98]],
          k * r.range(1.9, 2.5), col, { alpha: 0.84, head: 1.25, tin: 4, tout: len * 0.8, tail: 0.3, shake: 0.3, z: 0.6 });
      }
    });
  }
  // moss dots (苔点): a few fat clusters, each dot a bead of dark enamel
  for (const [u0, dr] of MOSS) {
    const n = r.int(3, 5);
    for (let k = 0; k < n; k++) {
      const th = (u0 + r.range(-36, 36)) / a.R, c = a.pt(th, dr + r.range(-13, 13)), rx = r.range(7, 12), ry = rx * r.range(0.6, 0.85);
      const blob = cr(ell(c.x, c.y, rx, ry, 7, th + r.range(-0.4, 0.4)).map((p) => [p[0] + r.range(-1.2, 1.2), p[1] + r.range(-1.2, 1.2)]), true, 2);
      g.fillStyle = L.rgba(r.pick(['#234a2a', '#1f3a22', '#2a3324']), r.range(0.8, 0.92)); trace(g, blob, true); g.fill();
      HG.fillStyle = zc(0.8); trace(HG, blob, true); HG.fill();
    }
  }
}

// ───────────────────────── layers ─────────────────────────
/** paint fn on a small sheet covering one part of the wall (blurred washes stay cheap there), then lay it into the big layers */
function region(paint, hmap, x0, y0, w, h, fn) {
  const c = L.makeCanvas(w, h), hc = L.makeCanvas(w, h);
  G = c.getContext('2d'); HG = hc.getContext('2d'); RX = x0; RY = y0;
  G.translate(-x0, -y0); HG.translate(-x0, -y0);
  fn();
  paint.getContext('2d').drawImage(c, x0, y0); hmap.getContext('2d').drawImage(hc, x0, y0);
  G = null; HG = null;
}
/** light the height map once from the upper left → a transparent sheet of glints (white) and shade (warm dark) */
function reliefLight(hmap) {
  const w = hmap.width, h = hmap.height;
  const tmp = L.makeCanvas(w, h), tg = tmp.getContext('2d', { willReadFrequently: true });
  tg.filter = 'blur(1.25px)'; tg.drawImage(hmap, 0, 0); tg.filter = 'none';
  const src = tg.getImageData(0, 0, w, h).data, hg = new Float32Array(w * h);
  for (let i = 0, k = 0; i < hg.length; i++, k += 4) hg[i] = (src[k] * src[k + 3]) / 255;
  const img = new ImageData(w, h), o = img.data, nz = L.makeNoise('s14glint');
  const s = 0.014, lx = -0.35, ly = -0.75, lz = 0.56;
  let hx = lx, hy = ly, hz = lz + 1; const hm = Math.hypot(hx, hy, hz); hx /= hm; hy /= hm; hz /= hm;
  for (let y = 1; y < h - 1; y++) {
    let i = y * w + 1;
    for (let x = 1; x < w - 1; x++, i++) {
      const gx = hg[i + 1] - hg[i - 1], gy = hg[i + w] - hg[i - w];
      if (gx === 0 && gy === 0) continue;
      const nx = -gx * 0.5 * s, ny = -gy * 0.5 * s, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const dif = (nx * lx + ny * ly + lz) * inv - lz;
      let v = dif > 0 ? dif * 0.5 : dif * 0.42;
      const sd = (nx * hx + ny * hy + hz) * inv - 0.955;
      if (sd > 0) { const t = sd / 0.045; v += t * t * 0.7 * (0.15 + 0.85 * ss(-0.35, 0.4, nz.n2(x / 64, y / 64))); }   // the glint comes and goes along an edge
      const k = i * 4;
      if (v > 0.004) { o[k] = 255; o[k + 1] = 253; o[k + 2] = 244; o[k + 3] = v >= 1 ? 255 : v * 255; }
      else if (v < -0.004) { o[k] = 78; o[k + 1] = 44; o[k + 2] = 30; o[k + 3] = v <= -1 ? 255 : -v * 255; }
    }
  }
  tg.clearRect(0, 0, w, h); tg.putImageData(img, 0, 0);
  return tmp;
}
function buildPaint(env) {
  const a = env.arc, paint = L.makeLayer(PAD), hmap = L.makeLayer(PAD);
  // the two children come up from behind the bank: painted only above its contour, then the bank is laid over them
  region(paint, hmap, 320, -10, 540, 670, () => { a.clipAbove(G, -3); a.clipAbove(HG, -3); place(530, 152, 1.5, 1, 0.035, kidA); });
  region(paint, hmap, 840, -10, 690, 670, () => { a.clipAbove(G, -3); a.clipAbove(HG, -3); place(1330, 150, 1.48, -1, 0.02, kidB); });
  region(paint, hmap, -PAD, 480, W + PAD * 2, 620, () => slope(env));
  // enamel is never laid perfectly even
  L.overlayOn(paint, L.noiseLayer(PAD, { seed: 's14en', scale: 120, octaves: 3, contrast: 1.4, res: 0.25 }), { blend: 'soft-light', alpha: 0.1 });
  // nor is its surface dead flat
  const hg = hmap.getContext('2d');
  hg.save(); hg.setTransform(1, 0, 0, 1, 0, 0); hg.globalCompositeOperation = 'source-atop'; hg.globalAlpha = 0.12;
  hg.drawImage(L.noiseLayer(PAD, { seed: 's14wav', scale: 26, octaves: 2, res: 0.5 }), 0, 0); hg.restore();
  return { paint, light: reliefLight(hmap) };
}
function buildSurface(env, paint, light) {
  const surf = L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.fillStyle = C.cream; full();
    // slow drift in the glaze thickness
    g.globalAlpha = 0.55;
    g.drawImage(L.noiseLayer(PAD, { seed: 's14glaze', scale: 460, octaves: 3, res: 0.2, ramp: [[0, '#efe7d2'], [0.5, '#f5efe0'], [1, '#fbf8ee']] }), -PAD, -PAD);
    g.globalAlpha = 1;
    // pin-holes (棕眼): a dark speck in a paler dimple, lit on the wall that faces the light; the odd iron spot
    const r = L.rng('s14pin');
    for (let i = 0; i < 30; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), rad = r.range(1.1, 2.0) * (r.chance(0.15) ? 1.6 : 1), iron = r.chance(0.22);
      bloomAt(g, x, y, rad * 4.2, '#fffdf6', 0.75);
      g.fillStyle = L.rgba(iron ? '#3a2a1c' : '#8a6238', r.range(0.5, 0.82)); g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
      g.fillStyle = L.rgba('#fffdf6', 0.8); g.beginPath(); g.arc(x + rad * 0.7, y + rad * 0.8, rad * 0.55, 0, L.TAU); g.fill();
    }
    // a breath of colour in the glaze round the enamel, the enamel with a hair of shadow under its lower-right rim, then its light
    g.globalAlpha = 0.07; g.drawImage(L.blurred(paint, 9), -PAD, -PAD); g.globalAlpha = 1;
    g.shadowColor = 'rgba(105,70,40,0.26)'; g.shadowBlur = 2.6; g.shadowOffsetX = 1.4; g.shadowOffsetY = 2.0;
    g.drawImage(paint, -PAD, -PAD);
    g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
    g.drawImage(light, -PAD + 2.0, -PAD + 2.4);
  });
  // macro lens: focus sits on the crest, the lantern and the two faces; the wall falls out of focus toward the frame's ends and its foot
  const sg0 = surf.getContext('2d');
  for (const [px, r0, r1] of [[2.2, 600, 940], [5.5, 900, 1340]]) {
    const soft = L.blurred(surf, px), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.radial(sg, 960 + PAD, 400 + PAD, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    sg.fillRect(0, 0, soft.width, soft.height);
    sg0.drawImage(soft, -PAD, -PAD);
  }
  return surf;
}
/**
 * Reflections on the glaze (half-res, padded; they are out of focus — the lens is focused on the painted surface, not on what it mirrors):
 * a four-paned window in the empty upper left, bowed by the wall's curve; a long soft light lying across the bare wall below
 * the bank; a broken glint where the green enamel stands thick. The glaze's faint orange-peel ruffles their edges.
 */
function buildGloss(env) {
  const a = env.arc, res = 0.5, GW = Math.round((W + PAD * 2) * res), GH = Math.round((H + PAD * 2) * res);
  const img = new ImageData(GW, GH), d = img.data, nz = L.makeNoise('s14gloss');
  for (let j = 0; j < GH; j++) {
    const y = j / res - PAD;
    for (let i = 0; i < GW; i++) {
      const x = i / res - PAD, ddx = x - a.cx, ddy = a.cy - y, rr = Math.sqrt(ddx * ddx + ddy * ddy), dr = rr - a.R;
      let v = 0;
      if (dr < -24 && dr > -100) {
        // light catching the thickness of the green enamel: a broken streak that follows the bank
        const u = Math.atan2(ddx, ddy) * a.R, d0 = dr + 46 + 6 * nz.n2(u / 140, 4.4);
        const brk = ss(-0.2, 0.4, nz.n2(u / 60, dr / 18 + 30));
        v = 0.26 * Math.exp(-(d0 * d0) / (2 * 6 * 6)) * brk * Math.exp(-Math.pow((u + 300) / 640, 2));
      } else if (dr < -170) {
        // the long light on the bare wall: it lies on a flatter curve than the bank, fattest left of centre where the light
        // comes from, dying away at both ends
        const u = Math.atan2(ddx, ddy) * a.R, R2 = 4200;
        const yc = 886 + R2 - Math.sqrt(R2 * R2 - ddx * ddx) - 0.02 * ddx;
        const op = 4.5 * nz.n2(u / 90, dr / 90) + 1.5 * nz.n2(u / 17 + 9, dr / 17);
        const along = Math.exp(-Math.pow((x - 720) / 800, 2));
        const hw = 9 + 25 * along;
        const e = yc - y + op;                                                             // > 0 above the middle of the light
        const core = (1 - ss(hw - 8, hw + 26, e)) * ss(-hw - 42, -hw + 6, e);
        const halo = Math.exp(-(e * e) / (2 * 150 * 150));
        v = (0.6 * core + 0.15 * halo) * along * ss(-172, -236, dr);                        // nothing of it reaches the bank
      } else if (dr > 24 && x < 470 && y < 440) {
        // the window: two by two panes, soft
        const wx = x - 198, wy = y - 196, op = 3.0 * nz.n2(x / 80, y / 80) + 1.2 * nz.n2(x / 19 + 5, y / 19);
        const bx = wx - 0.00045 * wy * wy + 0.05 * wy + op, by = wy + 0.1 * wx + op * 0.6;
        const px = Math.max(1 - ss(33, 52, Math.abs(bx + 57)), 1 - ss(33, 52, Math.abs(bx - 57)));
        const py = Math.max(1 - ss(50, 69, Math.abs(by + 73)), 1 - ss(50, 69, Math.abs(by - 73)));
        const bloom = Math.exp(-(bx * bx) / (2 * 115 * 115) - (by * by) / (2 * 165 * 165));
        v = 0.52 * px * py * (0.72 + 0.28 * L.clamp(1 - (by + 130) / 300)) + 0.08 * bloom;
      }
      if (v <= 0.003) continue;
      const k = (j * GW + i) * 4;
      d[k] = 253; d[k + 1] = 253; d[k + 2] = 250; d[k + 3] = L.clamp(v) * 255;
    }
  }
  const c = L.makeCanvas(GW, GH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

export default {
  name: '粉彩婴戏图',
  tone: 'dark',
  init(env) {
    SEED = 0;
    const t0 = performance.now();
    const { paint, light } = buildPaint(env);
    const t1 = performance.now();
    const surface = buildSurface(env, paint, light);
    const t2 = performance.now();
    const gloss = buildGloss(env);
    console.warn(`s14 timing: paint ${(t1 - t0) | 0} surface ${(t2 - t1) | 0} gloss ${(performance.now() - t2) | 0}`);
    S = { surface, gloss };
  },
  draw(ctx, env, p) {
    // the painted wall turns slowly: children and bank slide along the arc
    const rot = L.lerp(-0.012, 0.012, p);
    L.blit(ctx, env, S.surface, { rot, zoom: L.lerp(1.0, 1.012, p) });
    // the light does not turn with it: it comes from the upper left, and the wall rolls away toward its foot and the far corners …
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const a = env.arc;
    ctx.fillStyle = L.radial(ctx, 640, 210, 280, 1850, [[0, '#ffffff'], [0.5, '#fbf7ee'], [1, '#ebe3d4']]);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 720, a.R - 170, [[0, '#ece5d6'], [0.45, '#f6f1e7'], [0.75, '#fcfaf5'], [1, '#ffffff']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // … and the reflections lie still on the glaze
    L.cam(ctx, env, { rot: -rot * 0.35 }, () => ctx.drawImage(S.gloss, -PAD, -PAD, W + PAD * 2, H + PAD * 2));
  },
};
