// g34 — 镂空花钱: one big openwork charm (玲珑钱) of cold white copper lying on pale grey paper. The charm IS the glyph:
// a full round rim, a framed square hole, and between them a pierced field — a blossom above and below, scrolling stems,
// and two phoenixes facing the upper blossom, wings fused to rim and frame, barbed tail plumes sweeping down. No lettering.
// Made in init: the pattern is drawn as a coverage mask and a grey relief map with ordinary paths; the mask is blurred and
// re-thresholded (cast fillets), loose bits are dropped (one casting), height → normals → white-metal response lit from the
// upper left, tarnish in the hollows; the paper shows through the piercings with the charm's shadow on it.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const G = K.GLYPH, TAU = Math.PI * 2, D = Math.PI / 180;
const RIMW = 33, FRAME = 21;       // outer rim band, inner frame round the hole (px)
const FAT = 2.4;                    // every cast shape is this much fatter than drawn
const EDGE = 3.4, REL = 4.6;        // heights (px): round-over of a bar, range of the relief map
let layer = null;
let MG = null, RG = null, FX = 1, NZ = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const gray = (h) => { const g = Math.round(L.clamp(h) * 255); return `rgb(${g},${g},${g})`; };
const P = (x, y) => [G.cx + FX * x, G.cy + y];                       // local (centre origin, mirrored by FX) → page
const pol = (deg, r) => [r * Math.cos(deg * D), r * Math.sin(deg * D)];

function polyPath(pts) {
  const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath(); return p;
}
function discPath(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
function ell(x, y, rx, ry, rot = 0, n = 36) {
  const pts = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, ex = rx * Math.cos(a), ey = ry * Math.sin(a); pts.push(P(x + ex * c - ey * s, y + ex * s + ey * c)); }
  return { paths: [polyPath(pts)], base: P(x, y + ry), tip: P(x, y - ry), c: P(x, y), r: Math.max(rx, ry) };
}
/** a cast bar of varying width through control points (local) */
function ribbon(ctrl, w0, w1, o = {}) {
  const { pw = 1, wob = 0.1, seed = 1 } = o;
  const uv = L.smoothPath(ctrl, 4), n = uv.length, xy = uv.map((q) => P(q[0], q[1]));
  const cum = [0]; let len = 0;
  for (let i = 1; i < n; i++) { len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]); cum.push(len); }
  const lf = [], rt = []; let hwA = 0, hwB = 0;
  for (let i = 0; i < n; i++) {
    const a = xy[Math.max(0, i - 1)], b = xy[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const t = cum[i] / (len || 1);
    let w = L.lerp(w0, w1, Math.pow(t, pw)) * (1 + wob * NZ.n2(cum[i] / 40 + seed * 3.7, seed * 1.3));
    const hw = Math.max(1.5, w / 2);
    if (i === 0) hwA = hw; if (i === n - 1) hwB = hw;
    lf.push([xy[i][0] + nx * hw, xy[i][1] + ny * hw]); rt.push([xy[i][0] - nx * hw, xy[i][1] - ny * hw]);
  }
  return { paths: [polyPath(lf.concat(rt.reverse())), discPath(xy[0][0], xy[0][1], hwA), discPath(xy[n - 1][0], xy[n - 1][1], hwB)], xy, uv, base: xy[0], tip: xy[n - 1], len };
}
/** leaf / petal / feather blade (local): pointed at both ends, widest where p puts it */
function blade(bx, by, ang, len, hw, o = {}) {
  const { bend = 0, p = 0.8, q = 0.9, n = 22 } = o;
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
/** add a shape to the casting: union into the mask, paint its height into the relief (later shapes lie on top) */
function put(sh, h0, h1 = h0, o = {}) {
  const fat = o.fat === undefined ? FAT : o.fat;
  MG.lineWidth = fat * 2;
  for (const p of sh.paths) { MG.fill(p); if (fat) MG.stroke(p); }
  RG.lineWidth = (o.ow || 4) + fat * 2; RG.strokeStyle = 'rgba(0,0,0,0.5)';
  for (const p of sh.paths) RG.stroke(p);
  const fill = o.fill || (h0 === h1 ? gray(h0) : L.linear(RG, sh.base[0], sh.base[1], sh.tip[0], sh.tip[1], [[0, gray(h0)], [1, gray(h1)]]));
  RG.fillStyle = fill; RG.strokeStyle = fill; RG.lineWidth = fat * 2;
  for (const p of sh.paths) { if (fat) RG.stroke(p); RG.fill(p); }
  if (sh.paths.length === 1 && o.pillow !== 0) { RG.save(); RG.clip(sh.paths[0]); RG.lineWidth = 6; RG.strokeStyle = `rgba(0,0,0,${o.pillow || 0.2})`; RG.stroke(sh.paths[0]); RG.restore(); }
  return sh;
}
const dome = (x, y, r, h0, h1) => { const e = ell(x, y, r, r); return put(e, h0, h1, { fill: L.radial(RG, e.c[0], e.c[1], 0, e.r + FAT, [[0, gray(h0)], [0.6, gray(L.lerp(h0, h1, 0.35))], [1, gray(h1)]]), pillow: 0 }); };
function cut(sh) { MG.save(); MG.globalCompositeOperation = 'destination-out'; for (const p of sh.paths) MG.fill(p); MG.restore(); }
function groove(pts, w, lvl = 0.2, alpha = 0.9) {
  RG.save(); RG.globalAlpha = alpha; RG.strokeStyle = gray(lvl); RG.lineWidth = Math.max(1.5, w); RG.lineCap = 'round';
  RG.beginPath(); pts.forEach((q, i) => (i ? RG.lineTo(q[0], q[1]) : RG.moveTo(q[0], q[1]))); RG.stroke(); RG.restore();
}
function inc(sh, f, t0, t1, w, lvl = 0.2) {
  const n = sh.sp.length - 1, pts = [];
  for (let i = Math.round(t0 * n); i <= Math.round(t1 * n); i++) pts.push(P(sh.sp[i][0] + sh.nx[i] * sh.w[i] * f, sh.sp[i][1] + sh.ny[i] * sh.w[i] * f));
  groove(pts, w, lvl);
}

// ───────────────────────── motifs ─────────────────────────
function leaf(bx, by, ang, len, hw, o = {}) {
  const sh = blade(bx, by, ang, len, hw, { p: 0.72, q: 0.85, ...o });
  put(sh, 0.4, 0.74);
  inc(sh, 0, 0.05, 0.88, 2.2, 0.16);
  const n = sh.sp.length - 1;
  if (len > 44) for (const t of [0.26, 0.44, 0.62]) for (const sd of [-1, 1]) {
    const i = Math.round(t * n), a = sh.ang + sh.bend * (t - 0.5) * 2 + sd * 0.72, wl = sh.w[i] * 0.9, [sx, sy] = sh.sp[i];
    groove([P(sx, sy), P(sx + Math.cos(a) * wl * 0.7, sy + Math.sin(a) * wl * 0.7), P(sx + Math.cos(a - sd * 0.3) * wl * 1.2, sy + Math.sin(a - sd * 0.3) * wl * 1.2)], 1.6, 0.24);
  }
  return sh;
}
function vine(ctrl, w0, w1, o = {}) {
  const rb = ribbon(ctrl, w0, w1, { seed: o.seed || 1, wob: 0.12 });
  const n = rb.uv.length - 1;
  for (const [t, side, len, hw, da = 0.75, bend = 0.28] of o.leaves || []) {
    const i = Math.round(t * n), q = rb.uv[i], q0 = rb.uv[Math.max(0, i - 2)], q1 = rb.uv[Math.min(n, i + 2)];
    leaf(q[0], q[1], Math.atan2(q1[1] - q0[1], q1[0] - q0[0]) + side * da, len, hw, { bend: -side * bend });
  }
  put(rb, o.h || 0.6);
  groove(rb.xy.slice(2, -2), 1.6, 0.36, 0.7);
  if (o.bud) { const e = rb.uv[n]; dome(e[0], e[1], o.bud, 0.92, 0.6); }
  return rb;
}
/** layered blossom seen face-on; outermost petals reach R from the centre */
function flower(cx, cy, R, seed, o = {}) {
  const { n1 = 8, rot = 0, wide = 1 } = o, r = L.rng('g34fl' + seed), s = R / 198;
  const ring = (n, r0, len, hw, off, h0, h1, lines) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rot + ((i + off) * TAU) / n + r.range(-0.05, 0.05);
      const sh = blade(cx + r0 * s * Math.cos(a), cy + r0 * s * Math.sin(a), a, len * s * r.range(0.95, 1.03), hw * s * wide * r.range(0.92, 1.08), { p: 1.5, q: 0.6, bend: r.range(-0.08, 0.08) });
      put(sh, h0, h1, { pillow: 0.28 });
      inc(sh, 0, 0.14, 0.8, 1.9, 0.14);
      if (lines) { inc(sh, 0.5, 0.3, 0.88, 1.5, 0.22); inc(sh, -0.5, 0.3, 0.88, 1.5, 0.22); }
    }
  };
  ring(n1, 30, 168, 42, 0, 0.26, 0.74, R > 60);
  ring(n1, 18, 104, 36, 0.5, 0.4, 0.88, R > 60);
  if (R > 60) ring(6, 10, 62, 27, 0.25, 0.55, 0.96, false);
  dome(cx, cy, 27 * s * (R > 60 ? 1 : 1.5), 1, 0.66);
  if (R > 60) for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; dome(cx + 16.5 * s * Math.cos(a), cy + 16.5 * s * Math.sin(a), 5.6 * s, 1, 0.7); }
}
/** one tail plume: tapering shaft, barbs both sides, a pierced eye at the end */
function plume(ctrl, w0, w1, r, seed) {
  const rb = ribbon(ctrl, w0, w1, { seed: 20 + seed, wob: 0.07 });
  const uv = rb.uv, n = uv.length;
  let tot = 0; for (let i = 1; i < n; i++) tot += Math.hypot(uv[i][0] - uv[i - 1][0], uv[i][1] - uv[i - 1][1]);
  let acc = 0, next = tot * 0.2;
  for (let i = 1; i < n - 2; i++) {
    acc += Math.hypot(uv[i][0] - uv[i - 1][0], uv[i][1] - uv[i - 1][1]);
    if (acc < next || acc > tot * 0.9) continue;
    const t = acc / tot, ta = Math.atan2(uv[i + 1][1] - uv[i - 1][1], uv[i + 1][0] - uv[i - 1][0]);
    for (const sd of [-1, 1]) put(blade(uv[i][0], uv[i][1], ta + sd * (0.8 + r.range(-0.1, 0.1)), L.lerp(30, 21, t) * r.range(0.85, 1.12), L.lerp(6.2, 5, t), { bend: -sd * 0.38, p: 0.74, q: 0.8, n: 12 }), 0.36, 0.68);
    next += L.lerp(21, 17, t) * r.range(0.92, 1.1);
  }
  put(rb, 0.72);
  groove(rb.xy.slice(3, -3), 1.7, 0.3);
  const e = uv[n - 1], er = 12.5 * r.range(0.95, 1.08);
  put(ell(e[0], e[1], er, er * 0.92), 0.78);
  cut(ell(e[0], e[1], er * 0.36, er * 0.34));
}
/** a wing: flight feathers fanned from the shoulder, coverts over their roots */
function fan(rx, ry, a0, a1, lens, hw, r) {
  const n = lens.length;
  for (let i = n - 1; i >= 0; i--) {
    const a = L.lerp(a0, a1, i / (n - 1)) + r.range(-0.03, 0.03);
    const sh = blade(rx + 5 * Math.cos(a), ry + 5 * Math.sin(a), a, lens[i], hw * r.range(0.92, 1.08), { p: 1.15, q: 0.55 });
    put(sh, 0.34, 0.8, { pillow: 0.26 });
    inc(sh, 0, 0.1, 0.9, 1.8, 0.18);
    inc(sh, 0.55, 0.42, 0.9, 1.5, 0.28);
  }
  const mean = lens.reduce((s, v) => s + v, 0) / n;
  for (let i = n - 2; i >= 0; i--) {
    const a = L.lerp(a0, a1, (i + 0.5) / (n - 1));
    const sh = blade(rx + Math.cos(a), ry + Math.sin(a), a, mean * 0.42, hw * 1.1, { p: 1.6, q: 0.6 });
    put(sh, 0.55, 0.92, { pillow: 0.26 });
    inc(sh, 0, 0.3, 0.85, 1.5, 0.3);
  }
}
function phoenix(r) {
  // tail plumes sweep down toward the lower blossom
  plume([pol(18, 246), pol(32, 284), pol(46, 297), pol(58, 294), pol(66, 286)], 11, 7, r, 1);
  plume([pol(18, 236), pol(32, 240), pol(46, 250), pol(57, 244), pol(63, 232)], 11, 7, r, 2);
  plume([pol(20, 226), pol(27, 206), pol(31, 196)], 10, 7.5, r, 3);
  // wings: one out to the rim, one in to the frame of the hole
  const sh = pol(-3, 256), si = pol(-3, 228);
  fan(sh[0], sh[1], -42 * D, 34 * D, [62, 70, 74, 70, 62], 10.5, r);
  fan(si[0], si[1], 222 * D, 150 * D, [60, 70, 76, 74, 66], 10.5, r);
  // body, neck, head
  const b0 = pol(17, 240);
  const body = put(blade(b0[0], b0[1], -76 * D, 104, 27, { bend: -0.22, p: 0.9, q: 0.7 }), 0.6, 0.95, { pillow: 0.3 });
  for (const t of [0.3, 0.42, 0.54, 0.66]) {                      // scale-feathers across the breast
    const i = Math.round(t * 22), pts = [];
    for (let k = -6; k <= 6; k++) { const f = k / 6 * 0.8, bow = (1 - f * f) * 5; pts.push(P(body.sp[i][0] + body.nx[i] * body.w[i] * f + Math.cos(body.ang) * bow, body.sp[i][1] + body.ny[i] * body.w[i] * f + Math.sin(body.ang) * bow)); }
    groove(pts, 1.5, 0.42, 0.8);
  }
  const neck = ribbon([pol(-7, 244), pol(-16, 263), pol(-26, 270), pol(-34, 258)], 25, 15, { seed: 7, wob: 0.05 });
  put(neck, 0.82); groove(neck.xy.slice(3, -2), 1.5, 0.5, 0.6);
  const hd = pol(-35, 255);
  for (const a of [-70, -42, -14]) leaf(hd[0], hd[1], a * D, 36, 6.5, { bend: 0.25, p: 1.1 });   // crest
  put(blade(hd[0], hd[1], -147 * D, 38, 7.5, { p: 0.6, q: 0.8, bend: 0.12 }), 0.9, 0.6);            // beak
  dome(hd[0], hd[1], 15.5, 1, 0.7);
  const ey = P(hd[0] - 4, hd[1] - 3); groove([ey, [ey[0] + 0.5, ey[1] + 0.5]], 4.2, 0.2, 1);
  // the spray it holds: a short stem from the beak to a small blossom in the corner
  vine([[182, -166], [174, -188], [156, -208]], 9, 8, { seed: 9 });
}
function half(side) {
  FX = side; const r = L.rng('g34half' + side);
  // upper stem: from the top blossom along the rim, curling down into the corner blossom
  vine([[44, -276], [96, -297], [146, -288], [188, -254], [182, -222], [158, -210]], 13, 9, { seed: 3 + side, leaves: [[0.2, -1, 46, 12, 0.7], [0.36, 1, 58, 15, 0.8], [0.6, -1, 44, 11.5, 0.75], [0.74, 1, 40, 11, 0.9]] });
  leaf(28, -186, 13 * D, 100, 19, { bend: -0.1 });           // along the top of the frame
  leaf(40, -214, -8 * D, 78, 16, { bend: 0.2 });
  // lower stems and leaves from the bottom blossom up toward the plume tips
  vine([[40, 268], [84, 292], [126, 286], [150, 262]], 12, 9, { seed: 5 + side, leaves: [[0.3, 1, 44, 12, 0.7], [0.62, -1, 50, 13, 0.8]], bud: 9.5 });
  leaf(30, 188, -13 * D, 98, 18, { bend: 0.1 });
  leaf(46, 222, -4 * D, 84, 16, { bend: -0.22 });
  phoenix(r);
  flower(153, -211, 37, 'c' + side, { n1: 6, wide: 1.5, rot: 0.3 });
}
function drawPattern() {
  // rim and frame (drawn exact; the glyph outline is enforced analytically later)
  MG.beginPath(); MG.arc(G.cx, G.cy, G.R + 4, 0, TAU); MG.arc(G.cx, G.cy, G.R - RIMW, 0, TAU, true); MG.fill('evenodd');
  MG.beginPath(); MG.rect(G.cx - G.a - FRAME, G.cy - G.a - FRAME, 2 * (G.a + FRAME), 2 * (G.a + FRAME)); MG.rect(G.cx - G.a + 4, G.cy - G.a + 4, 2 * G.a - 8, 2 * G.a - 8); MG.fill('evenodd');
  for (const s of [1, -1]) half(s);
  FX = 1;
  flower(0, -237, 90, 'top');
  flower(0, 237, 90, 'bot', { rot: Math.PI / 8 });
  // rim and frame stand proud of the pierced work
  RG.fillStyle = gray(0.97);
  RG.beginPath(); RG.arc(G.cx, G.cy, G.R + 4, 0, TAU); RG.arc(G.cx, G.cy, G.R - RIMW, 0, TAU, true); RG.fill('evenodd');
  RG.beginPath(); RG.rect(G.cx - G.a - FRAME, G.cy - G.a - FRAME, 2 * (G.a + FRAME), 2 * (G.a + FRAME)); RG.rect(G.cx - G.a + 4, G.cy - G.a + 4, 2 * G.a - 8, 2 * G.a - 8); RG.fill('evenodd');
  RG.strokeStyle = gray(0.62); RG.lineWidth = 2.2;                 // a fine incised line doubles the rim and the frame
  RG.beginPath(); RG.arc(G.cx, G.cy, G.R - RIMW + 7.5, 0, TAU); RG.stroke();
  RG.strokeRect(G.cx - G.a - FRAME + 6.5, G.cy - G.a - FRAME + 6.5, 2 * (G.a + FRAME - 6.5), 2 * (G.a + FRAME - 6.5));
}

// ───────────────────────── casting → lit white copper ─────────────────────────
function buildMetal() {
  NZ = L.makeNoise('g34m');
  const mask = L.makeCanvas(S, S), relief = L.makeCanvas(S, S);
  MG = mask.getContext('2d'); RG = relief.getContext('2d');
  MG.fillStyle = MG.strokeStyle = '#fff'; MG.lineJoin = 'round'; RG.lineJoin = 'round';
  RG.fillStyle = gray(0.4); RG.fillRect(0, 0, S, S);
  drawPattern();
  const X0 = G.cx - G.R - 8, Y0 = G.cy - G.R - 8, RW = 2 * G.R + 16, RH = RW, N = RW * RH;
  const grab = (c) => c.getContext('2d').getImageData(X0, Y0, RW, RH).data;
  const dA = grab(L.blurred(mask, 1.7)), dB = grab(L.blurred(mask, 4.2)), dR = grab(L.blurred(relief, 1.0)), dO = grab(L.blurred(relief, 6));
  MG = RG = null;

  const cov = new Float32Array(N);
  for (let y = 0, k = 0; y < RH; y++) for (let x = 0; x < RW; x++, k++) {
    const sd = K.sdGlyph(x + X0 + 0.5, y + Y0 + 0.5);
    cov[k] = sstep(0.36, 0.64, dA[k * 4 + 3] / 255) * L.clamp(0.5 - sd);
  }
  { // one casting: drop whatever is not fused with the rim
    const seen = new Uint8Array(N), st = new Int32Array(N); let sp = 0;
    const push = (k) => { if (!seen[k] && cov[k] > 0.5) { seen[k] = 1; st[sp++] = k; } };
    push(Math.round(G.cy - G.R + RIMW / 2 - Y0) * RW + Math.round(G.cx - X0));
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
      const fx = x + X0, fy = y + Y0, pl = sstep(0.58, 0.9, rl);
      h += (0.07 * NZ.n2(fx / 2.6, fy / 2.6) * (1 - 0.85 * pl) + 0.16 * NZ.n2(fx / 11 + 40, fy / 11) * (1 - 0.5 * pl) + 0.34 * NZ.n2(fx / 60 + 9, fy / 60 + 3)) * e;
      const rr = Math.hypot(fx - G.cx, fy - G.cy);                  // the rim's face: hair-fine turning lines
      if (rr > G.R - RIMW + 12) h += 0.035 * NZ.n2(rr / 1.5 + 3, Math.atan2(fy - G.cy, fx - G.cx) * 1.4) * sstep(G.R - 2, G.R - 8, rr);
    }
    Hh[k] = h; Rl[k] = rl;
  }
  { // casting pits in loose patches, a few knocks on the rim
    const r = L.rng('g34pits');
    const dent = (px, py, rp, depth, cav) => {
      const e = Math.ceil(rp) + 1;
      for (let y = Math.max(1, Math.floor(py - e)); y <= Math.min(RH - 2, Math.ceil(py + e)); y++) for (let x = Math.max(1, Math.floor(px - e)); x <= Math.min(RW - 2, Math.ceil(px + e)); x++) {
        const d2 = ((x - px) * (x - px) + (y - py) * (y - py)) / (rp * rp); if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2), k = y * RW + x;
        Hh[k] -= depth * f; if (cav) Cv[k] = Math.max(Cv[k], Math.min(1, f * 1.5));
      }
    };
    for (let n = 0; n < 520; n++) {
      const px = r.range(8, RW - 8), py = r.range(8, RH - 8), rp = r.chance(0.08) ? r.range(2.4, 3.6) : r.range(1.1, 2.0), depth = rp * r.range(0.3, 0.5), keep = r.chance(0.12);
      if (cov[Math.round(py) * RW + Math.round(px)] < 0.95) continue;
      if (NZ.n2((px + X0) / 150 + 5, (py + Y0) / 150 - 8) < 0.1 && !keep) continue;
      dent(px, py, rp, depth, true);
    }
    for (let n = 0; n < 9; n++) { const a = r() * TAU, rr = r.chance(0.6) ? G.R - r.range(0, 5) : G.R - RIMW + r.range(0, 5); dent(G.cx + Math.cos(a) * rr - X0, G.cy + Math.sin(a) * rr - Y0, r.range(4, 9), r.range(0.9, 1.8), false); }
  }
  // response of white metal to the key light (index = N·L)
  const RESP = new Float32Array(513);
  { const pts = [[0, 0.16], [0.38, 0.22], [0.5, 0.28], [0.62, 0.38], [0.72, 0.53], [0.8, 0.7], [0.83, 0.77], [0.87, 0.85], [0.92, 0.915], [1, 0.97]];
    for (let i = 0, q = 1; i <= 512; i++) {
      const t = i / 512; while (q < pts.length - 1 && t > pts[q][0]) q++;
      const a = pts[q - 1], b = pts[q]; RESP[i] = a[1] + (b[1] - a[1]) * L.clamp((t - a[0]) / (b[0] - a[0]));
    } }
  let lx = -0.44, ly = -0.6, lz = 0.66; { const m = Math.hypot(lx, ly, lz); lx /= m; ly /= m; lz /= m; }
  let hx = lx, hy = ly, hz = lz + 1; { const m = Math.hypot(hx, hy, hz); hx /= m; hy /= m; hz /= m; }
  const img = new ImageData(RW, RH), o = img.data;
  for (let y = 1; y < RH - 1; y++) for (let x = 1, k = y * RW + 1; x < RW - 1; x++, k++) {
    const c = cov[k]; if (c <= 0.003) continue;
    const sx = (Hh[k + 1] - Hh[k - 1]) * 0.5, sy = (Hh[k + RW] - Hh[k - RW]) * 0.5, inv = 1 / Math.sqrt(sx * sx + sy * sy + 1);
    const nx = -sx * inv, ny = -sy * inv, nz = inv, rl = Rl[k];
    let v = RESP[(L.clamp((nx * lx + ny * ly + nz * lz) * 0.5 + 0.5) * 512) | 0];
    // tarnish stays in whatever lies low (incised lines, roots of petals and feathers); the high points are rubbed bright
    const fx = x + X0, fy = y + Y0, pl = sstep(0.52, 0.92, rl);
    const hol = L.clamp(((dO[k * 4] - dR[k * 4]) / 255 - 0.015) / 0.2), low = 1 - sstep(0.13, 0.5, rl);
    let pat = Math.max(low, 0.85 * hol) + 0.3 * low * hol;
    pat = L.clamp(pat * (0.84 + 0.3 * NZ.n2(fx / 9 + 7, fy / 9 - 2) + 0.16 * NZ.n2(fx / 47 - 4, fy / 47 + 9)));
    const tone = 1 + 0.06 * NZ.n2(fx / 150, fy / 120) + 0.035 * NZ.n2(fx / 31 + 12, fy / 31);
    const fall = 1.05 - 0.14 * sstep(120, 760, Math.hypot(fx - 330, fy - 300));
    v *= (0.88 + 0.17 * pl) * (1 - 0.62 * pat) * tone;
    const nh = Math.max(0, nx * hx + ny * hy + nz * hz);
    const sp = 0.4 * Math.pow(nh, 30) + 0.9 * Math.pow(nh, 160) * (0.45 + 0.55 * pl);
    v = (v + sp * (1 - 0.7 * pat)) * fall;
    const cav = Cv[k]; if (cav > 0) v *= 1 - 0.5 * cav;
    const fl = sstep(0.24, 0.8, nx * 0.6 + ny * 0.62) * (1 - 0.5 * pat);   // cold light bounced into the bevels facing away
    const vc = Math.min(1, v), wm = pat * (1 - vc);
    const j = k * 4;
    o[j] = 238 * v + 6 * vc * vc + 12 * wm + 14 * fl; o[j + 1] = 240 * v + 5 * wm + 24 * fl; o[j + 2] = 236 * v + 10 * (1 - vc) - 10 * wm + 36 * fl; o[j + 3] = c * 255;
  }
  const metal = L.makeCanvas(RW, RH); metal.getContext('2d').putImageData(img, 0, 0);
  return { metal, X0, Y0 };
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#dcdcd8', tone: '#77766e', seed: 'g34paper', fiber: 0.5, stain: 0.2, grain: 0.18, foxing: 0.06, edge: 0.16 }), 0, 0);
  const { metal, X0, Y0 } = buildMetal();
  // silhouette → shadows on the paper (they show through every piercing)
  const sil = L.makeCanvas(S, S), sg = sil.getContext('2d');
  sg.drawImage(metal, X0, Y0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgb(34,36,44)'; sg.fillRect(0, 0, S, S);
  g.globalAlpha = 0.3; g.drawImage(L.blurred(sil, 13), 12, 17);
  g.globalAlpha = 0.34; g.drawImage(L.blurred(sil, 5), 6, 9);
  g.globalAlpha = 0.5; g.drawImage(L.blurred(sil, 1.6), 2, 3);
  g.globalAlpha = 1;
  // hairline handling scratches on the rim, only on the metal
  const mg = metal.getContext('2d'), r = L.rng('g34scr');
  mg.save(); mg.globalCompositeOperation = 'source-atop'; mg.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, rr = G.R - r.range(5, RIMW - 5), len = r.range(0.02, 0.09), tilt = r.range(-3, 3);
    mg.strokeStyle = r.chance(0.5) ? L.rgba('#ffffff', r.range(0.1, 0.26)) : L.rgba('#30343a', r.range(0.08, 0.2)); mg.lineWidth = r.range(1.1, 1.5);
    mg.beginPath(); mg.moveTo(G.cx - X0 + Math.cos(a) * rr, G.cy - Y0 + Math.sin(a) * rr); mg.lineTo(G.cx - X0 + Math.cos(a + len) * (rr + tilt), G.cy - Y0 + Math.sin(a + len) * (rr + tilt)); mg.stroke();
  }
  mg.restore();
  g.drawImage(metal, X0, Y0);
  return c;
}

export default {
  name: '镂空花钱',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
