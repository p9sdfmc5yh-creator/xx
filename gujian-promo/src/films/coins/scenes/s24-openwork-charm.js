// s24 — 镂空花钱. Macro of the top of one huge openwork charm (镂空花钱 / 玲珑钱), treated silver-white on black
// like a piece of metal lace. The arc is the outer edge of the rim: a broad plain band, a slot, then a thin inner
// line. Inside it the pierced field: a big blossom under the crest, scrolling stems with veined leaves, and — mirrored
// left and right — two phoenixes with spread wings and barbed tail plumes. Everything is fused into one net (anything
// that would hang loose is removed in init), the gaps are plain black. No lettering anywhere.
//
// How it is made (all in init): the pattern is drawn twice with ordinary canvas paths — once as a coverage mask and once
// as a grey relief map (petal over petal, incised veins). The mask is blurred and re-thresholded so every junction gets
// the soft fillet of cast metal; a wider blur gives the round-over of the bars. Height → normals → a silver response
// curve lit from the upper left, plus the grey inner walls of the piercings (the plate has thickness).
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
const G = 1.2;                 // how far the lens is pushed in: design units of the pierced pattern → px
const RIM = 76, GAP = 12, THIN = 15, RING = RIM + GAP + THIN / 2;   // rim band, slot, thin inner line (px, measured inward)
const RING0 = 64.5;            // design-space v of the inner line's centre (the motifs below were laid out against it)
const USHIFT = -20;            // the blossom sits a touch off the crest, as a hand-held macro would frame it
const FAT = 3.5;               // every cast shape is this much fatter than drawn (px): chunky metal, small piercings
const EDGE = 6.4, REL = 9;     // heights (px): round-over of a bar, full range of the relief map
const WALL = 8;                // visible depth of the pierced walls (px)
const D = Math.PI / 180;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const gray = (h) => { const g = Math.round(L.clamp(h) * 255); return `rgb(${g},${g},${g})`; };

// ───────────────────────── drawing state ─────────────────────────
// Pattern space: u = px along the rim (0 under the crest), v = px inward from the rim's outer edge.
// FLIP mirrors u (the right half is the left half drawn again with other random numbers); T is a local frame for motifs.
// RAW = true: u, v are real px (used for the rim); otherwise they are design units, scaled by G about the inner line.
let A = null, NZ = null, MG = null, RG = null, FLIP = 1, RAW = false;
let T = { ou: 0, ov: 0, s: 1, c: 1, sn: 0 };
const setT = (ou = 0, ov = 0, s = 1, rot = 0) => { T = { ou, ov, s, c: Math.cos(rot), sn: Math.sin(rot) }; };
const Q = (u, v) => { const th = u / A.R, r = A.R - v; return [A.cx + r * Math.sin(th), A.cy - r * Math.cos(th)]; };
const P = (x, y) => {
  const u = T.ou + T.s * (x * T.c - y * T.sn), v = T.ov + T.s * (x * T.sn + y * T.c);
  return RAW ? Q(u, v) : Q(USHIFT + FLIP * u * G, RING + (v - RING0) * G);
};
const WS = () => T.s * (RAW ? 1 : G);   // px per local unit, for widths

function polyPath(pts) {
  const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath(); return p;
}
function discPath(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, L.TAU); return p; }

/** ellipse in local units */
function ell(x, y, rx, ry, rot = 0, n = 44) {
  const pts = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const a = (i / n) * L.TAU, ex = rx * Math.cos(a), ey = ry * Math.sin(a); pts.push(P(x + ex * c - ey * s, y + ex * s + ey * c)); }
  return { paths: [polyPath(pts)], base: P(x, y + ry), tip: P(x, y - ry), c: P(x, y), r: Math.max(rx, ry) * WS() };
}

/** a cast bar of varying width through control points (local units) */
function ribbon(ctrl, w0, w1, o = {}) {
  const { pw = 1, wob = 0.1, seed = 1, swell = 0 } = o;
  const uv = L.smoothPath(ctrl, 5 / T.s), n = uv.length;
  const xy = uv.map((q) => P(q[0], q[1]));
  const cum = [0]; let len = 0;
  for (let i = 1; i < n; i++) { len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]); cum.push(len); }
  const lf = [], rt = []; let hwA = 0, hwB = 0;
  for (let i = 0; i < n; i++) {
    const a = xy[Math.max(0, i - 1)], b = xy[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const t = cum[i] / (len || 1);
    let w = L.lerp(w0, w1, Math.pow(t, pw)) * (1 + swell * Math.sin(Math.PI * t)) * WS();
    w *= 1 + wob * NZ.n2(cum[i] / 70 + seed * 3.7, seed * 1.3);
    const hw = Math.max(1.5, w / 2);
    if (i === 0) hwA = hw; if (i === n - 1) hwB = hw;
    lf.push([xy[i][0] + nx * hw, xy[i][1] + ny * hw]); rt.push([xy[i][0] - nx * hw, xy[i][1] - ny * hw]);
  }
  return { paths: [polyPath(lf.concat(rt.reverse())), discPath(xy[0][0], xy[0][1], hwA), discPath(xy[n - 1][0], xy[n - 1][1], hwB)], xy, uv, base: xy[0], tip: xy[n - 1], len };
}

/** leaf / petal / feather blade: pointed at both ends, widest where p puts it (p<1 near the base, p>1 near the tip) */
function blade(bx, by, ang, len, hw, o = {}) {
  const { bend = 0, p = 0.8, q = 0.9, n = 28 } = o;
  const sp = [], nx = [], ny = [], w = []; let x = bx, y = by;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = ang + bend * (t - 0.5) * 2;
    sp.push([x, y]); nx.push(-Math.sin(a)); ny.push(Math.cos(a));
    w.push(hw * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, p))), q));
    x += (Math.cos(a) * len) / n; y += (Math.sin(a) * len) / n;
  }
  const lf = [], rt = [];
  for (let i = 0; i <= n; i++) { lf.push(P(sp[i][0] + nx[i] * w[i], sp[i][1] + ny[i] * w[i])); rt.push(P(sp[i][0] - nx[i] * w[i], sp[i][1] - ny[i] * w[i])); }
  const xy = sp.map((s) => P(s[0], s[1]));
  return { paths: [polyPath(lf.concat(rt.reverse()))], sp, nx, ny, w, xy, base: xy[0], tip: xy[n], ang, bend, len, hw };
}

/** add a shape to the casting: union into the mask, paint its height into the relief map (later shapes lie on top) */
function put(sh, h0, h1 = h0, o = {}) {
  const fat = RAW ? 0 : FAT, ws = Math.max(0.7, T.s) * (RAW ? 1 : G);
  for (const p of sh.paths) MG.fill(p);
  if (fat) { MG.lineWidth = fat * 2; for (const p of sh.paths) MG.stroke(p); }
  // whatever lies underneath gets a groove along this shape's edge
  RG.lineWidth = (o.ow || 5) * ws + fat * 2; RG.strokeStyle = 'rgba(0,0,0,0.5)';
  for (const p of sh.paths) RG.stroke(p);
  const fill = o.fill || (h0 === h1 ? gray(h0) : L.linear(RG, sh.base[0], sh.base[1], sh.tip[0], sh.tip[1], [[0, gray(h0)], [1, gray(h1)]]));
  RG.fillStyle = fill;
  if (fat) { RG.strokeStyle = fill; RG.lineWidth = fat * 2; for (const p of sh.paths) RG.stroke(p); }
  for (const p of sh.paths) RG.fill(p);
  if (sh.paths.length === 1 && o.pillow !== 0) {   // the shape's own edge rolls off a little
    RG.save(); RG.clip(sh.paths[0]); RG.lineWidth = 9 * ws; RG.strokeStyle = `rgba(0,0,0,${o.pillow || 0.2})`; RG.stroke(sh.paths[0]); RG.restore();
  }
  return sh;
}
const dome = (x, y, r, h0, h1) => { const e = ell(x, y, r, r); return put(e, h0, h1, { fill: L.radial(RG, e.c[0], e.c[1], 0, e.r, [[0, gray(h0)], [0.6, gray(L.lerp(h0, h1, 0.35))], [1, gray(h1)]]), pillow: 0 }); };
/** pierce the plate */
function cut(sh) { MG.save(); MG.globalCompositeOperation = 'destination-out'; for (const p of sh.paths) MG.fill(p); MG.restore(); }
/** incised line (frame coords) */
function groove(pts, w, lvl = 0.2, alpha = 0.9) {
  RG.save(); RG.globalAlpha = alpha; RG.strokeStyle = gray(lvl); RG.lineWidth = Math.max(1.8, w * (RAW ? 1 : G)); RG.lineCap = 'round';
  RG.beginPath(); pts.forEach((q, i) => (i ? RG.lineTo(q[0], q[1]) : RG.moveTo(q[0], q[1]))); RG.stroke(); RG.restore();
}
/** incised line running along a blade, f = sideways offset as a fraction of the local half-width */
function inc(sh, f, t0, t1, w, lvl = 0.2) {
  const n = sh.sp.length - 1, pts = [];
  for (let i = Math.round(t0 * n); i <= Math.round(t1 * n); i++) pts.push(P(sh.sp[i][0] + sh.nx[i] * sh.w[i] * f, sh.sp[i][1] + sh.ny[i] * sh.w[i] * f));
  groove(pts, w * T.s, lvl);
}

// ───────────────────────── motifs ─────────────────────────
/** a leaf with a midrib and three pairs of side veins */
function leaf(bx, by, ang, len, hw, o = {}) {
  const sh = blade(bx, by, ang, len, hw, { p: 0.72, q: 0.85, ...o });
  put(sh, o.h0 === undefined ? 0.4 : o.h0, o.h1 === undefined ? 0.72 : o.h1);
  inc(sh, 0, 0.04, 0.88, 3.2, 0.16);
  const n = sh.sp.length - 1;
  if (len * T.s > 48) for (const t of [0.24, 0.42, 0.6]) for (const sd of [-1, 1]) {
    const i = Math.round(t * n), a = sh.ang + sh.bend * (t - 0.5) * 2 + sd * 0.72, wl = sh.w[i] * 0.92, [sx, sy] = sh.sp[i];
    groove([P(sx, sy), P(sx + Math.cos(a) * wl * 0.7, sy + Math.sin(a) * wl * 0.7), P(sx + Math.cos(a - sd * 0.3) * wl * 1.25, sy + Math.sin(a - sd * 0.3) * wl * 1.25)], 2.3 * T.s, 0.24);
  }
  return sh;
}

/** a stem; optional spiral curl at its end ([cx, cy, turns]), a bud, and leaves riding on it ([t, side, len, hw, spread, bend]) */
function vine(ctrl, w0, w1, o = {}) {
  const pts = ctrl.slice();
  if (o.curl) {
    const [cx, cy, turns] = o.curl, last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const rx = last[0] - cx, ry = last[1] - cy, r0 = Math.hypot(rx, ry), a0 = Math.atan2(ry, rx);
    const dir = -ry * (last[0] - prev[0]) + rx * (last[1] - prev[1]) >= 0 ? 1 : -1, m = Math.ceil(turns * 14);
    for (let i = 1; i <= m; i++) { const s = i / m, a = a0 + dir * turns * L.TAU * s, rr = r0 * (0.2 + 0.8 * Math.pow(1 - s, 0.85)); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  }
  const rb = ribbon(pts, w0, w1, { seed: o.seed || 1, wob: 0.13, pw: o.pw || 1 });
  const n = rb.uv.length - 1;
  for (const [t, side, len, hw, da = 0.75, bend = 0.28] of o.leaves || []) {
    const i = Math.round(t * n), q = rb.uv[i], q0 = rb.uv[Math.max(0, i - 2)], q1 = rb.uv[Math.min(n, i + 2)];
    leaf(q[0], q[1], Math.atan2(q1[1] - q0[1], q1[0] - q0[0]) + side * da, len, hw, { bend: -side * bend });
  }
  put(rb, o.h || 0.58);
  if (o.bud) { const e = rb.uv[n]; dome(e[0], e[1], o.bud, 0.9, 0.6); }
  return rb;
}

/** layered blossom seen face-on; its outermost petals reach 198 local units from the centre */
function flower(cx, cy, s, seed, o = {}) {
  const { n1 = 8, rot = 0 } = o, r = L.rng('s24fl' + seed);
  setT(cx, cy, s, rot);
  const ring = (n, r0, len, hw, off, h0, h1, pq, lines) => {
    for (let i = 0; i < n; i++) {
      const first = i === 0 && off === 0;
      const a = -Math.PI / 2 + ((i + off) * L.TAU) / n + (first ? 0 : r.range(-0.055, 0.055));
      const sh = blade(r0 * Math.cos(a), r0 * Math.sin(a), a, len * (first ? 1 : r.range(0.93, 1.03)), hw * r.range(0.9, 1.08), { p: pq[0], q: pq[1], bend: first ? 0 : r.range(-0.08, 0.08) });
      put(sh, h0, h1, { pillow: 0.28 });
      inc(sh, 0, 0.14, 0.8, 3.1, 0.14);
      if (lines) { inc(sh, 0.5, 0.3, 0.88, 2.3, 0.2); inc(sh, -0.5, 0.3, 0.88, 2.3, 0.2); }
    }
  };
  ring(n1, 30, 168, 42, 0, 0.26, 0.72, [1.5, 0.6], true);
  ring(n1, 18, 104, 36, 0.5, 0.4, 0.86, [1.5, 0.6], true);
  ring(6, 10, 62, 27, 0.25, 0.55, 0.96, [1.4, 0.62], false);
  dome(0, 0, 27, 1, 0.66);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * L.TAU + 0.3; dome(16.5 * Math.cos(a), 16.5 * Math.sin(a), 5.6, 1, 0.7); }
  dome(0, 0, 7.5, 1, 0.75);
  setT();
}

/** one tail plume: a tapering shaft, barbs on both sides, an eye at the end */
function plume(ctrl, w0, w1, r, seed) {
  const rb = ribbon(ctrl, w0, w1, { seed: 20 + seed, wob: 0.07 });
  const uv = rb.uv, n = uv.length;
  let tot = 0; for (let i = 1; i < n; i++) tot += Math.hypot(uv[i][0] - uv[i - 1][0], uv[i][1] - uv[i - 1][1]);
  let acc = 0, next = tot * 0.16;
  for (let i = 1; i < n - 2; i++) {
    acc += Math.hypot(uv[i][0] - uv[i - 1][0], uv[i][1] - uv[i - 1][1]);
    if (acc < next || acc > tot * 0.93) continue;
    const t = acc / tot, ta = Math.atan2(uv[i + 1][1] - uv[i - 1][1], uv[i + 1][0] - uv[i - 1][0]);
    for (const sd of [-1, 1]) {
      const sh = blade(uv[i][0], uv[i][1], ta + sd * (0.78 + r.range(-0.1, 0.1)), L.lerp(54, 34, t) * r.range(0.82, 1.14), L.lerp(11, 8.5, t), { bend: -sd * 0.38, p: 0.74, q: 0.8, n: 16 });
      put(sh, 0.36, 0.66);
    }
    next += L.lerp(40, 31, t) * r.range(0.9, 1.12);
  }
  put(rb, 0.7);
  groove(rb.xy.slice(3, -3), 2.6 * T.s, 0.3);
  const e = uv[n - 1], er = 21 * r.range(0.92, 1.1);
  put(ell(e[0], e[1], er, er * 0.92), 0.74);
  cut(ell(e[0], e[1], er * 0.42, er * 0.4));
}

/** a wing: flight feathers fanned from the shoulder, a row of coverts over their roots */
function fan(rx, ry, a0, a1, lens, hw, r, o = {}) {
  const n = lens.length;
  for (let i = n - 1; i >= 0; i--) {
    const a = L.lerp(a0, a1, i / (n - 1)) + r.range(-0.03, 0.03);
    const sh = blade(rx + 8 * Math.cos(a), ry + 8 * Math.sin(a), a, lens[i] * (o.exact ? 1 : r.range(0.95, 1.04)), hw * r.range(0.9, 1.08), { p: 1.15, q: 0.55, bend: o.bend || 0 });
    put(sh, 0.34, 0.78, { pillow: 0.26 });
    inc(sh, 0, 0.1, 0.9, 2.8, 0.18);
    inc(sh, 0.55, 0.42, 0.9, 2.1, 0.26);
  }
  const mean = lens.reduce((s, v) => s + v, 0) / n;
  for (let i = n - 2; i >= 0; i--) {
    const a = L.lerp(a0, a1, (i + 0.5) / (n - 1)) + r.range(-0.04, 0.04);
    const sh = blade(rx + 2 * Math.cos(a), ry + 2 * Math.sin(a), a, mean * r.range(0.34, 0.42), hw * 1.1, { p: 1.6, q: 0.6 });
    put(sh, 0.55, 0.92, { pillow: 0.26 });
    inc(sh, 0, 0.3, 0.85, 2.3, 0.3);
  }
}

/** a phoenix flying toward +x (local units: origin at the shoulder of the raised wing) */
function phoenix(ou, ov, s, rot, seed) {
  const r = L.rng('s24px' + seed), j = (a) => r.range(-a, a);
  const J = (pts, a) => pts.map(([x, y], i) => (i === 0 ? [x, y] : [x + j(a), y + j(a)]));
  setT(ou, ov, s, rot);
  // tail
  plume(J([[-66, 24], [-128, -18], [-200, -84], [-285, -138], [-375, -166], [-452, -150], [-492, -108]], 6), 32, 13, r, 1);
  plume(J([[-74, 38], [-158, 46], [-252, 20], [-348, -20], [-442, -16], [-518, 30], [-588, 60]], 6), 36, 13, r, 2);
  plume(J([[-62, 56], [-128, 110], [-214, 150], [-308, 150], [-384, 114], [-440, 118], [-482, 158]], 6), 32, 13, r, 3);
  // the far wing, swept down and back
  fan(-22, 52, 100 * D, 168 * D, [108, 138, 150, 136, 112], 17, r, { bend: 0.1 });
  // body, with rows of breast feathers
  const body = ell(-12, 30, 88, 50, -0.12);
  put(body, 0.6, 0.6, { fill: L.radial(RG, body.c[0], body.c[1], 0, body.r, [[0, gray(0.86)], [0.7, gray(0.66)], [1, gray(0.5)]]) });
  for (let row = -2; row <= 2; row++) for (let col = -3; col <= 3; col++) {
    const bx = col * 25 + (row & 1) * 12.5, by = row * 18;
    if ((bx / 74) ** 2 + (by / 38) ** 2 > 1) continue;
    const pts = [];
    for (let q = 0; q <= 8; q++) { const a = Math.PI - 1.2 + (2.4 * q) / 8; const lx = bx + 13 * Math.cos(a), ly = by + 12 * Math.sin(a); pts.push(P(-12 + lx * Math.cos(-0.12) - ly * Math.sin(-0.12), 30 + lx * Math.sin(-0.12) + ly * Math.cos(-0.12))); }
    groove(pts, 2.4 * T.s, 0.3);
  }
  // neck
  const neck = ribbon([[50, 16], [98, -16], [130, -56], [150, -98]], 64, 30, { wob: 0.04, seed: 3 });
  put(neck, 0.66);
  for (const t of [0.3, 0.5, 0.7]) {
    const i = Math.round(t * (neck.uv.length - 1)), q = neck.uv[i], q1 = neck.uv[i + 1], ta = Math.atan2(q1[1] - q[1], q1[0] - q[0]), hw = L.lerp(26, 14, t);
    const nx = -Math.sin(ta), ny = Math.cos(ta), fx = Math.cos(ta), fy = Math.sin(ta);
    groove([P(q[0] + nx * hw, q[1] + ny * hw), P(q[0] - fx * 9, q[1] - fy * 9), P(q[0] - nx * hw, q[1] - ny * hw)], 2.4 * T.s, 0.32);
  }
  // the raised wing
  fan(0, 0, -80 * D, -172 * D, o_lens(ov, s, rot), 20, r, { bend: -0.07, exact: true });
  dome(2, 4, 25, 0.98, 0.62);
  { const pts = []; for (let q = 0; q <= 26; q++) { const a = 0.6 + q * 0.42, rr = 17 * (1 - q / 34); pts.push(P(2 + rr * Math.cos(a), 4 + rr * Math.sin(a))); } groove(pts, 2.4 * T.s, 0.34); }
  // crest, head, beak
  for (const [a, len] of [[-158, 50], [-130, 64], [-102, 72]]) {
    const sh = blade(146, -132, (a + j(5)) * D, len * r.range(0.94, 1.08), 10.5, { bend: -0.32, p: 1.2, q: 0.7, n: 16 });
    put(sh, 0.5, 0.8); inc(sh, 0, 0.15, 0.85, 2.2, 0.26);
  }
  put(blade(158, -92, 118 * D, 38, 8.5, { bend: 0.3, n: 14 }), 0.5, 0.7);
  const beak = blade(172, -114, 0.2, 64, 12.5, { bend: 0.34, p: 0.6, q: 0.9, n: 18 });
  put(beak, 0.72, 0.6); inc(beak, 0.1, 0.1, 0.8, 2.2, 0.28);
  dome(158, -112, 27, 0.96, 0.62);
  { const pts = []; for (let q = 0; q <= 14; q++) { const a = (q / 14) * L.TAU; pts.push(P(164 + 7.2 * Math.cos(a), -118 + 6.4 * Math.sin(a))); } groove(pts, 2.3 * T.s, 0.22); }
  setT();
}
/** lengths of the raised wing's feathers: the upright ones are made exactly long enough to fuse with the thin inner line */
function o_lens(ov, s, rot = 0) {
  const reach = (ov - RING0 + 3) / s;
  return [0.84, 1.0, 1.045, 1.0, 0.9, 0.76, 0.6].map((k, i) => { const a = L.lerp(-80, -172, i / 6) * D + rot; return (i === 1 || i === 2) ? (reach - 8) / -Math.sin(a) : reach * k; });
}

/** everything on one side of the central blossom (designed for the left; FLIP = -1 draws the right) */
function half(sd) {
  const r = L.rng('s24half' + sd), j = (a) => r.range(-a, a);
  const J = (pts, a = 4) => pts.map(([x, y], i) => (i === 0 ? [x, y] : [x + j(a), y + j(a)]));
  setT();
  // stem from under the blossom, curling up between blossom and bird
  vine(J([[-14, 440], [-70, 492], [-165, 504], [-255, 482], [-326, 436], [-350, 376]]), 17, 11, { curl: [-300, 374, 1.2], bud: 11, seed: 11 + sd,
    leaves: [[0.14, 1, 92, 25, 0.8, 0.3], [0.3, -1, 96, 26, 0.7, 0.3], [0.44, 1, 74, 21, 0.9, 0.25]] });
  // long stem running on under the bird toward the side blossom
  vine(J([[-250, 484], [-345, 512], [-450, 506], [-545, 478], [-640, 488], [-740, 512], [-850, 486], [-955, 436], [-1040, 372]]), 15, 11, { seed: 21 + sd,
    leaves: [[0.14, -1, 84, 23], [0.3, 1, 62, 18], [0.5, -1, 86, 23], [0.66, 1, 72, 20], [0.85, -1, 82, 22]] });
  // the two birds are not twins: each has its own size and tilt
  const ps = sd > 0 ? 0.9 : 0.855, prot = sd > 0 ? -0.03 : 0.045, pu = -478 + (sd > 0 ? 3 : -9), pv = 284 + (sd > 0 ? -2 : 5);
  const bk = [pu + ps * (233 * Math.cos(prot) + 96 * Math.sin(prot)), pv + ps * (233 * Math.sin(prot) - 96 * Math.cos(prot))];   // beak tip
  // sprig held in the beak
  vine(J([[-182, 262], [L.lerp(-182, bk[0], 0.36), L.lerp(262, bk[1], 0.3)], [L.lerp(-182, bk[0], 0.72), L.lerp(262, bk[1], 0.7)], [bk[0] + 5, bk[1] - 1]], 3), 12, 9, { seed: 31 + sd, leaves: [[0.36, 1, 52, 15, 0.85], [0.62, -1, 46, 14, 0.85]] });
  // tendril hanging from the inner line between blossom and crest
  vine(J([[-208, 62], [-198, 90], [-212, 114]]), 12, 9, { curl: [-240, 116, 1.05], bud: 9, seed: 41 + sd, leaves: [[0.1, -1, 56, 16, 0.9, 0.2]] });
  // spray behind the wing, above the upper tail plume
  vine(J([[-650, 62], [-668, 92], [-722, 106], [-790, 96], [-846, 104]]), 12, 9, { curl: [-864, 130, 0.95], bud: 9, seed: 51 + sd,
    leaves: [[0.2, 1, 64, 18], [0.36, -1, 60, 17], [0.52, 1, 56, 16]] });
  // small leaves hanging from the inner line
  leaf(-96 + j(5), 66, (84 + j(8)) * D, 60, 17, { bend: 0.2 });
  leaf(-152 + j(5), 66, (112 + j(8)) * D, 50, 15, { bend: -0.2 });
  phoenix(pu, pv, ps, prot, sd);
  flower(-1090 + j(8), 208 + j(5), 0.68, 'side' + sd, { rot: j(0.3) });
}

function drawPattern() {
  const UMAX = A.span(PAD + 80) * A.R, r = L.rng('s24rim');
  FLIP = 1; setT(); RAW = true;
  // rim: its outer edge is the arc itself; the inner edge wanders a hair, as hand-finished castings do
  {
    const pts = [], n = 220;
    for (let i = 0; i <= n; i++) pts.push(Q(L.lerp(-UMAX, UMAX, i / n), 0));
    for (let i = n; i >= 0; i--) { const u = L.lerp(-UMAX, UMAX, i / n); pts.push(Q(u, RIM + 2.4 * NZ.n2(u / 150, 3.1) + 1.1 * NZ.n2(u / 37, 6.3))); }
    const path = polyPath(pts);
    MG.fill(path);
    // a flat, worn face between two rounded edges
    RG.fillStyle = L.radial(RG, A.cx, A.cy, A.R - RIM - 3, A.R + 1, [[0, gray(0.5)], [0.14, gray(0.8)], [0.32, gray(0.87)], [0.7, gray(0.88)], [0.88, gray(0.82)], [1, gray(0.56)]]);
    RG.fill(path);
    // years of handling: shallow swells and hollows along the face
    RG.save(); RG.clip(path);
    for (let u = -UMAX; u < UMAX; u += r.range(50, 150)) {
      const [x, y] = Q(u, r.range(14, RIM - 14)), rr = r.range(40, 110), up = r.chance(0.45), al = r.range(0.05, 0.13);
      RG.fillStyle = L.radial(RG, x, y, 0, rr, [[0, up ? `rgba(255,255,255,${al})` : `rgba(0,0,0,${al})`], [1, up ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)']]);
      RG.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    RG.restore();
  }
  // thin inner line, tied to the rim by short bridges at uneven intervals
  { const c = []; for (let u = -UMAX; u <= UMAX + 1; u += 60) c.push([u, RING + 1.2 * NZ.n2(u / 150, 8.8)]); put(ribbon(c, THIN, THIN, { wob: 0.2, seed: 5 }), 0.66, 0.66, { pillow: 0 }); }
  for (let u = -UMAX + r.range(0, 120); u < UMAX; u += r.range(170, 330)) {
    if (Math.abs(u - USHIFT) < 70) continue;
    put(ribbon([[u, RIM - 8], [u + r.range(-4, 4), RING]], r.range(17, 24), r.range(15, 20), { wob: 0 }), 0.62);
  }
  RAW = false;
  for (const f of [1, -1]) { FLIP = f; half(f); }
  FLIP = 1; setT();
  leaf(0, 440, 90 * D, 116, 30, { bend: 0.06 });
  flower(0, RING0 + 196, 1, 'main');
}

// ───────────────────────── casting → lit silver ─────────────────────────
function buildMetal(env) {
  A = env.arc; NZ = L.makeNoise('s24m');
  const X0 = -PAD, Y0 = Math.floor(A.crestY) - 90, RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const mask = L.makeCanvas(RW, RH), relief = L.makeCanvas(RW, RH);
  MG = mask.getContext('2d'); RG = relief.getContext('2d');
  MG.translate(-X0, -Y0); RG.translate(-X0, -Y0);
  MG.fillStyle = MG.strokeStyle = '#fff'; MG.lineJoin = 'round'; RG.lineJoin = 'round';
  RG.fillStyle = gray(0.4); RG.fillRect(X0, Y0, RW, RH);
  drawPattern();

  const grab = (c) => c.getContext('2d').getImageData(0, 0, RW, RH).data;
  const dA = grab(L.blurred(mask, 2.4)), dB = grab(L.blurred(mask, 7.6)), dR = grab(L.blurred(relief, 1.5)), dO = grab(L.blurred(relief, 10));
  MG = RG = null;

  // coverage with filleted junctions
  const cov = new Float32Array(N);
  for (let k = 0; k < N; k++) cov[k] = sstep(0.36, 0.64, dA[k * 4 + 3] / 255);
  // one piece only: drop whatever is not fused (directly or through the pattern) with the rim
  {
    const seen = new Uint8Array(N), st = new Int32Array(N); let sp = 0;
    const push = (k) => { if (!seen[k] && cov[k] > 0.5) { seen[k] = 1; st[sp++] = k; } };
    for (let x = 0; x < RW; x++) push((RH - 1) * RW + x);
    for (let y = 0; y < RH; y++) { push(y * RW); push(y * RW + RW - 1); }
    push(Math.round(A.crestY + RIM / 2 - Y0) * RW + Math.round(A.cx - X0));
    while (sp) { const k = st[--sp], x = k % RW; if (x > 0) push(k - 1); if (x < RW - 1) push(k + 1); if (k >= RW) push(k - RW); if (k < N - RW) push(k + RW); }
    const tmp = new Uint8Array(N);
    for (let pass = 0; pass < 3; pass++) {
      tmp.set(seen);
      for (let y = 1; y < RH - 1; y++) for (let x = 1, k = y * RW + 1; x < RW - 1; x++, k++) if (!tmp[k] && (tmp[k - 1] || tmp[k + 1] || tmp[k - RW] || tmp[k + RW])) seen[k] = 1;
    }
    for (let k = 0; k < N; k++) if (!seen[k]) cov[k] = 0;
  }

  // height field
  const Hh = new Float32Array(N), Rl = new Float32Array(N), Cv = new Float32Array(N);
  for (let y = 0, k = 0; y < RH; y++) for (let x = 0; x < RW; x++, k++) {
    const b = dB[k * 4 + 3] / 255; if (b < 0.02) continue;
    const d = L.clamp((b - 0.5) * 2.3), e = 1 - (1 - d) * (1 - d), rl = dR[k * 4] / 255;
    let h = EDGE * e + REL * rl * (0.3 + 0.7 * e);
    if (cov[k] > 0) {
      // the casting skin: fine tooth in the hollows, rubbed smooth on the high points; slow swells from hand finishing
      const fx = x + X0, fy = y + Y0, pol = sstep(0.58, 0.9, rl);
      h += (0.12 * NZ.n2(fx / 2.7, fy / 2.7) * (1 - 0.85 * pol) + 0.3 * NZ.n2(fx / 15 + 40, fy / 15) * (1 - 0.5 * pol) + 0.75 * NZ.n2(fx / 72 + 9, fy / 72 + 3)) * e;
    }
    Hh[k] = h; Rl[k] = rl;
  }
  {
    const r = L.rng('s24pits');
    const dent = (px, py, rp, depth, cav) => {
      const e = Math.ceil(rp) + 1;
      for (let y = Math.max(1, Math.floor(py - e)); y <= Math.min(RH - 2, Math.ceil(py + e)); y++) for (let x = Math.max(1, Math.floor(px - e)); x <= Math.min(RW - 2, Math.ceil(px + e)); x++) {
        const d2 = ((x - px) * (x - px) + (y - py) * (y - py)) / (rp * rp); if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2), k = y * RW + x;
        Hh[k] -= depth * f; if (cav) Cv[k] = Math.max(Cv[k], Math.min(1, f * 1.5));
      }
    };
    // casting pits (砂眼): they come in loose patches, never evenly peppered
    for (let n = 0; n < 1100; n++) {
      const px = r.range(8, RW - 8), py = r.range(8, RH - 8), big = r.chance(0.07), rp = big ? r.range(3.2, 5.2) : r.range(1.1, 2.5), depth = rp * r.range(0.3, 0.55), keep = r.chance(0.1);
      if (cov[Math.round(py) * RW + Math.round(px)] < 0.95) continue;
      if (NZ.n2((px + X0) / 210 + 5, (py + Y0) / 210 - 8) < 0.12 && !keep) continue;
      dent(px, py, rp, depth, true);
    }
    // knocks on the rim's edges
    for (let n = 0; n < 12; n++) {
      const [qx, qy] = Q(r.range(-1040, 1040), r.chance(0.6) ? r.range(-3, 7) : r.range(RIM - 12, RIM + 2));
      dent(qx - X0, qy - Y0, r.range(6, 15), r.range(1.3, 2.8), false);
    }
  }

  // response of frosted silver to the key light (index = N·L): the faces stay near white, only the turned-away bevels go grey
  const RESP = new Float32Array(513);
  { const f = L.makeRamp([[0, '#333333'], [0.4, '#4a4a4a'], [0.55, '#6a6a6a'], [0.66, '#989898'], [0.76, '#d0d0d0'], [0.83, '#eeeeee'], [0.9, '#ffffff'], [1, '#ffffff']]);
    for (let i = 0; i <= 512; i++) RESP[i] = (f(i / 512)[0] / 255) * (i > 470 ? 1 + (i - 470) / 140 : 1); }
  let lx = -0.42, ly = -0.62, lz = 0.66; { const m = Math.hypot(lx, ly, lz); lx /= m; ly /= m; lz /= m; }
  let hx = lx, hy = ly, hz = lz + 1; { const m = Math.hypot(hx, hy, hz); hx /= m; hy /= m; hz /= m; }
  let gx = -0.1, gy = -0.5, gz = 1.5; { const m = Math.hypot(gx, gy, gz); gx /= m; gy /= m; gz /= m; }
  const pcx = A.cx - 200 - X0, pcy = A.crestY + 150 - Y0;

  const img = new ImageData(RW, RH), o = img.data, gim = new ImageData(RW, RH), go = gim.data;
  for (let y = 1; y < RH - 1; y++) for (let x = 1, k = y * RW + 1; x < RW - 1; x++, k++) {
    const c = cov[k];
    // the grey wall of the piercing, seen below-right of every bar
    let wa = 0, dep = WALL;
    if (c < 1) for (let q = 1; q <= WALL; q++) {
      const yy = y - q, xx = x - (q >> 1); if (yy < 0 || xx < 0) break;
      const c2 = cov[yy * RW + xx]; if (c2 > wa) wa = c2; if (c2 > 0.5 && dep === WALL) { dep = q; }
    }
    const al = c + wa * (1 - c); if (al <= 0.003) continue;
    const fall = 1 - 0.25 * sstep(320, 1400, Math.hypot(x - pcx, (y - pcy) * 1.25));
    let tr = 0, tg = 0, tb = 0;
    if (c > 0) {
      const sx = (Hh[k + 1] - Hh[k - 1]) * 0.5, sy = (Hh[k + RW] - Hh[k - RW]) * 0.5, inv = 1 / Math.sqrt(sx * sx + sy * sy + 1);
      const nx = -sx * inv, ny = -sy * inv, nz = inv, rl = Rl[k];
      const ndl = nx * lx + ny * ly + nz * lz;
      let v = RESP[(L.clamp(ndl * 0.5 + 0.5) * 512) | 0];
      // tarnish stays in whatever lies low (incised lines, the roots of petals and feathers); the high points are rubbed bright
      const alb = (0.93 + 0.07 * sstep(0.4, 0.85, rl)) * (0.6 + 0.4 * sstep(0.13, 0.36, rl));
      const occ = 1 - 1.5 * L.clamp((dO[k * 4] - dR[k * 4]) / 255 - 0.03, 0, 0.3);
      const tone = 1 + 0.05 * NZ.n2((x + X0) / 190, (y + Y0) / 150);
      v *= alb * occ * tone;
      const nh = Math.max(0, nx * hx + ny * hy + nz * hz);
      const sp = 0.45 * Math.pow(nh, 40) + 0.55 * Math.pow(nh, 180) * (0.4 + 0.6 * sstep(0.5, 0.9, rl));
      const fl = Math.max(0, nx * 0.6 + ny * 0.62 - 0.22);
      v = (v + 0.7 * sp) * fall;
      const cav = Cv[k]; if (cav > 0) v *= 1 - 0.5 * cav;
      tr = 238 * v + 14 * fl; tg = 240 * v + 22 * fl; tb = 238 * v + 20 * (1 - Math.min(1, v)) + 34 * fl;
      const g = Math.pow(Math.max(0, nx * gx + ny * gy + nz * gz), 16);
      const ga = c * L.clamp(0.1 + 1.1 * g) * (1 - 0.7 * cav);
      const j = k * 4; go[j] = 232; go[j + 1] = 242; go[j + 2] = 255; go[j + 3] = ga * 255;
    }
    let wr = 0, wg = 0, wb = 0;
    if (wa > 0) { const ws = L.lerp(0.5, 0.14, (dep - 1) / (WALL - 1)) * fall; wr = 222 * ws; wg = 230 * ws; wb = 240 * ws; }
    const j = k * 4, kw = wa * (1 - c);
    o[j] = (tr * c + wr * kw) / al; o[j + 1] = (tg * c + wg * kw) / al; o[j + 2] = (tb * c + wb * kw) / al; o[j + 3] = al * 255;
  }
  const metal = L.makeCanvas(RW, RH); metal.getContext('2d').putImageData(img, 0, 0);
  const glint = L.makeCanvas(RW, RH); glint.getContext('2d').putImageData(gim, 0, 0);

  // depth of field: sharp under the crest, softer toward the sides and the bottom of frame
  const mix = (dst, src, r0, r1) => {
    const fillMask = (g) => {
      g.save(); g.translate(A.cx - X0, A.crestY + 110 - Y0); g.scale(1.75, 1);
      g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); g.fillRect(-3000, -3000, 6000, 6000); g.restore();
    };
    const m = L.makeCanvas(RW, RH), mg = m.getContext('2d');
    mg.drawImage(src, 0, 0); mg.globalCompositeOperation = 'destination-in'; fillMask(mg);
    const g = dst.getContext('2d');
    g.save(); g.globalCompositeOperation = 'destination-out'; fillMask(g); g.globalCompositeOperation = 'lighter'; g.drawImage(m, 0, 0); g.restore();
  };
  const b1 = L.blurred(metal, 2.4), b2 = L.blurred(metal, 6.5);
  mix(metal, b1, 240, 500);
  mix(metal, b2, 400, 760);
  // halation: white metal on black always blooms a little in the lens
  {
    const h1 = L.blurred(metal, 8), h2 = L.blurred(metal, 24), g = metal.getContext('2d');
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.17; g.drawImage(h1, 0, 0);
    g.globalAlpha = 0.07; g.drawImage(h2, 0, 0);
    g.restore();
  }
  return { metal, glint, X0, Y0 };
}

/** black ground with the faintest lint; next to nothing inside the title zone */
function buildBg(env) {
  const a = env.arc, c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#050505'; g.fillRect(0, 0, W, H);
  const zone = (x, y) => x > 590 && x < 1330 && y > a.crestY - 300 && y < a.crestY + 20;
  L.speckle(g, { seed: 's24dust', count: 560, x: 0, y: 0, w: W, h: H, rMin: 0.5, rMax: 1.5, colors: ['#c9ced2', '#9aa0a6'], alpha: [0.03, 0.2], test: (x, y) => !zone(x, y) });
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.028;
  g.drawImage(L.grainTex(W, H, { seed: 24, amount: 0.9 }), 0, 0);
  return c;
}

function blitAt(ctx, env, c, x, y, o = {}) {
  const { rot = 0, zoom = 1, dy = 0, alpha = 1, blend = 'source-over' } = o, a = env.arc;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = blend;
  ctx.translate(a.cx, a.crestY + dy); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(c, x, y);
  ctx.restore();
}

export default {
  name: '镂空花钱',
  tone: 'light',
  init(env) {
    const m = buildMetal(env);
    S = { ...m, bg: buildBg(env), tmp: L.makeCanvas(W, H) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0065, 0.0065, p), zoom = L.lerp(1, 1.022, p), dy = 2 * p;
    ctx.drawImage(S.bg, 0, 0);
    blitAt(ctx, env, S.metal, S.X0, S.Y0, { rot, zoom, dy });
    // a cold highlight wandering along the bars: it lifts the silver it passes over and never fogs the black
    const th = L.lerp(-0.15, 0.07, p);
    const band = (g, al) => {
      a.at(g, th, -175, () => {
        g.rotate(0.32); g.scale(1, 2.5);
        g.fillStyle = L.radial(g, 0, 0, 0, 230, [[0, `rgba(238,246,255,${al})`], [0.45, `rgba(238,246,255,${al * 0.45})`], [1, 'rgba(238,246,255,0)']]);
        g.fillRect(-3000, -3000, 6000, 6000);
      });
    };
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; band(ctx, 0.5); ctx.restore();
    const tg = S.tmp.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1; tg.clearRect(0, 0, W, H);
    blitAt(tg, env, S.glint, S.X0, S.Y0, { rot, zoom, dy });
    tg.globalCompositeOperation = 'destination-in'; band(tg, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9; ctx.drawImage(S.tmp, 0, 0); ctx.restore();
    L.vignette(ctx, { strength: 0.2 });
  },
};
