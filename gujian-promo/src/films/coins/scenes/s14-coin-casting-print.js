// s14 — 铸钱图. A corner of an old album leaf painted in the gongbi manner — fine ink line and flat colour on a sized
// sheet — shot on a copy stand: founders seen from the waist down (wide trousers, leg bindings, cloth shoes) pour
// copper from long-handled ladles into a row of upright sand-mould flasks standing on an indigo platform.
// The arc = the ink line along the top edge of the platform.
//
// Everything is drawn the way the painter would have laid it: a flat coat of colour (平涂), graded tone washed out from
// the contours and the folds (分染), then the line drawn over it with a pointed brush — it presses in, runs, swells at
// the turns and trails off (钉头鼠尾). No stipple, no grit: the fine structure is the bast fibre of the paper and the
// hairs of the flat brush in the mineral blue.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 92;
const LW = W + PAD * 2, LH = H + PAD * 2;
const LEAN = 0.5;          // things stand half-way between upright and radial on the curved platform
const SC = 1.22;           // overall figure scale
let S = null;

const C = {
  paper: '#F0E2BC',
  ink: '#2B2118', ink2: '#4B3A2B', ink3: '#8A7458',                    // 浓墨 contours · 淡墨 folds · faint
  white: '#F6EFDA', whiteSh: '#D9CBA8',                                 // 蛤粉 and its shade
  o1: '#DDB67E', o2: '#C98F50', o3: '#AF6B33', o4: '#8C4E22', o5: '#683716',   // 赭石, thin → deep
  b0: '#C4D3D3', b1: '#A0BBC6', b2: '#7299AE', b3: '#427392', b4: '#2E5A7A', b5: '#1F425C',   // 花青 / 石青
  v1: '#F29A66', v2: '#E05C3C', v3: '#B63D24',                          // 朱
  shoe: '#30271F', shoeHi: '#6A5B4E',
};
C.cloth = L.mix(C.b1, C.white, 0.5); C.clothSh = L.mix(C.b2, C.white, 0.25);                 // the short tunic: thin indigo over white
C.o1f = L.mix(C.o1, C.o2, 0.5); C.o2f = L.mix(C.o2, C.o3, 0.6);       // the far leg sits a tone deeper

const NZ = L.makeNoise('s14brush');
let SID = 0;
const lerp = L.lerp;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const mid = (a, b, t = 0.5) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const unit = (x, y) => { const m = Math.hypot(x, y) || 1; return [x / m, y / m]; };
/** piecewise-linear table lookup: [[t, v], …] */
const pw = (arr, t) => {
  if (t <= arr[0][0]) return arr[0][1];
  for (let i = 1; i < arr.length; i++) if (t <= arr[i][0]) { const [t0, v0] = arr[i - 1], [t1, v1] = arr[i]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  return arr[arr.length - 1][1];
};
/** add a polyline to the current path */
const poly = (g, pts) => { for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0], pts[i][1]); else g.moveTo(pts[i][0], pts[i][1]); } };
/**
 * closed Catmull-Rom through pts (repeat a point to make a corner).
 * out.seg(i, j) = the stretch of the outline from control point i to control point j — contours are drawn from the same curve the colour was filled with
 */
function loop(pts, step = 5) {
  const n = pts.length, out = [], at = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    at.push(out.length);
    for (let j = 0; j < m; j++) {
      const t = j / m, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.seg = (i, j) => out.slice(at[i], at[j] + 1);
  return out;
}

/**
 * One line of the pointed brush, as a filled ribbon: it presses in at the start (head), runs with a breathing
 * pressure (wob), leans into the turns (turn) and is lifted off into a point (tail).
 * w = nominal width in px. o: head, tin / tail (fractions of the length that swell in / trail off), wob, turn, col,
 * raw (pts are already dense), prof (u → width factor along the line)
 */
function brush(g, pts, w, o = {}) {
  const { head = 0.3, tin = 0, tail = 0.08, wob = 0.18, turn = 0.35, col = C.ink, raw = false, prof = null } = o;
  const p = raw ? pts : L.smoothPath(pts, 3);
  const n = p.length; if (n < 2) return;
  const id = (++SID) * 3.713;
  const cum = [0]; let len = 0;
  for (let i = 1; i < n; i++) { len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); cum.push(len); }
  if (len < 0.5) return;
  const tinL = tin * len, tailL = tail * len, hl = w * 2.2 + 2;
  const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    const t = unit(b[0] - a[0], b[1] - a[1]), nx = -t[1], ny = t[0], s = cum[i];
    let k = 1;
    if (tinL > 0 && s < tinL) k *= 0.35 + 0.65 * L.smooth(s / tinL);
    if (tailL > 0 && len - s < tailL) k *= Math.pow((len - s) / tailL, 0.8);
    if (head) k *= 1 + head * Math.exp(-Math.pow(s / hl, 2));
    if (prof) k *= prof(s / len);
    k *= 1 + wob * (0.65 * NZ.n2(s / 70 + id, id * 0.7) + 0.35 * NZ.n2(s / 19 + id, 4.1 + id));
    if (turn) {
      const a2 = p[Math.max(0, i - 3)], b2 = p[Math.min(n - 1, i + 3)];
      const u1 = unit(p[i][0] - a2[0], p[i][1] - a2[1]), u2 = unit(b2[0] - p[i][0], b2[1] - p[i][1]);
      k *= 1 + turn * Math.min(1, Math.abs(u1[0] * u2[1] - u1[1] * u2[0]) * 2.2);
    }
    const hw = Math.max(0.42, (w * k) / 2), j = 0.16 * NZ.n2(s / 7, id + 2.2);
    A.push([p[i][0] + nx * (hw + j), p[i][1] + ny * (hw + j)]);
    B.push([p[i][0] - nx * (hw - j), p[i][1] - ny * (hw - j)]);
  }
  g.fillStyle = col === C.ink ? L.mix(C.ink, C.ink2, 0.5 + 0.5 * NZ.n2(id * 1.37, 9.9)) : col === C.ink2 ? L.mix(C.ink2, C.ink3, 0.22 + 0.22 * NZ.n2(id * 1.37, 3.3)) : col;
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}

/** the painted layer (transparent where the paper is left bare) and the three things everything is made of */
function makePainter() {
  const layer = L.makeLayer(PAD);
  const g = layer.getContext('2d');
  const trace = (pts) => { g.beginPath(); poly(g, pts); g.closePath(); };
  return {
    layer, g, trace,
    /** 平涂: a flat coat. Laid by hand it never sits exactly in the line: unless `exact`, it slips by a pixel or so, slowly varying over the sheet */
    fill(pts, col, alpha = 1, exact = false) {
      g.save(); g.globalAlpha = alpha; g.fillStyle = col;
      trace(exact ? pts : pts.map(([x, y]) => [x + 0.5 + 1.2 * NZ.n2(x / 190, y / 190 + 7.7), y + 0.3 + 1.2 * NZ.n2(x / 190 + 53.1, y / 190)]));
      g.fill(); g.restore();
    },
    /** 分染: a soft-edged tone washed inside `clip`. fn(g) adds ONE path; mode = 'fill' or a stroke width */
    shade(clip, col, blur, alpha, mode, fn) {
      g.save(); trace(clip); g.clip();
      g.filter = `blur(${blur.toFixed(1)}px)`; g.globalAlpha = alpha; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); fn(g);
      if (mode === 'fill') { g.fillStyle = col; g.fill(); } else { g.strokeStyle = col; g.lineWidth = mode; g.stroke(); }
      g.restore();
    },
    /** 勾线 */
    line(pts, w, o) { brush(g, pts, w, o); },
    /** run fn with the drawing confined to a shape */
    within(clip, fn) { g.save(); trace(clip); g.clip(); fn(g); g.restore(); },
  };
}

// ───────────────────────── figures ─────────────────────────
const LT = 245, LS = 225, ANK = 72;                                         // thigh, shin, ankle height (× scale)
const TH_F = [[-0.6, 62], [0, 78], [0.38, 84], [0.74, 77], [1, 68]];        // half-widths of the trouser leg, front / back of the bone
const TH_B = [[-0.6, 80], [0, 96], [0.38, 86], [0.74, 70], [1, 60]];
const SH_F = [[0, 36], [0.3, 37], [0.6, 31], [0.85, 25], [1.05, 22]];       // the bound shin: calf swelling behind, tapering to the ankle
const SH_B = [[0, 40], [0.25, 52], [0.5, 49], [0.8, 31], [1.05, 24]];

/** one leg in profile: cloth shoe, sock, leg binding, wide trouser leg bloused over the binding */
function leg(P, o) {
  const { H, foot, f, k, r, gnd = 0, far = false, dye = 0 } = o;
  const tw = (c) => (dye >= 0 ? L.mix(c, C.o4, dye * 0.5) : L.mix(c, '#D9B98A', -dye));   // this man's cloth: a little deeper, or a little more faded
  const lt = LT * k, ls = LS * k;
  const A = [foot[0], foot[1] - ANK * k];
  const dx = A[0] - H[0], dy = A[1] - H[1], d0 = Math.hypot(dx, dy), d = Math.min(d0, lt + ls - 0.5);
  const ux = dx / d0, uy = dy / d0;
  const al = (lt * lt - ls * ls + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, lt * lt - al * al));
  let px = uy, py = -ux; if (px * f < 0) { px = -px; py = -py; }
  const K = [H[0] + ux * al + px * hh, H[1] + uy * al + py * hh];
  const d1 = unit(K[0] - H[0], K[1] - H[1]), d2 = unit(A[0] - K[0], A[1] - K[1]);
  const n1 = [f * d1[1], -f * d1[0]], n2 = [f * d2[1], -f * d2[0]];
  const nk = unit(n1[0] + n2[0], n1[1] + n2[1]);
  const bend = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]);
  const TP = (t, v) => { const wv = (v >= 0 ? pw(TH_F, t) : pw(TH_B, t)) * k; return [H[0] + d1[0] * t * lt + n1[0] * v * wv, H[1] + d1[1] * t * lt + n1[1] * v * wv]; };
  const SP = (s, v) => { const wv = (v >= 0 ? pw(SH_F, s) : pw(SH_B, s)) * k; return [K[0] + d2[0] * s * ls + n2[0] * v * wv, K[1] + d2[1] * s * ls + n2[1] * v * wv]; };
  const KP = (along, across) => [K[0] + d2[0] * along * ls + n2[0] * across * k, K[1] + d2[1] * along * ls + n2[1] * across * k];
  const cg = Math.cos(gnd), sg = Math.sin(gnd);
  const SX = (x, y) => { const X = x * f * k, Y = y * k; return [foot[0] + X * cg - Y * sg, foot[1] + X * sg + Y * cg]; };

  // ── sock: white cloth between the binding and the shoe
  const sock = [SP(0.97, 1.05), SP(0.97, -1.05), SX(-37, -40), SX(22, -36)];
  P.fill(sock, C.white);
  P.shade(sock, C.whiteSh, 4, 0.85, 13 * k, (g) => poly(g, [SP(0.97, -1), SX(-36, -42)]));
  P.line([SP(1.04, 1), SX(24, -44)], 1.8, { head: 0, tail: 0 });
  P.line([SP(1.04, -1), SX(-39, -52)], 1.9, { head: 0, tail: 0 });

  // ── cloth shoe: thick white sole of stitched layers, black upper
  const sole = loop([SX(-43, 1), SX(-43, 1), SX(66, 1), SX(103, -2), SX(113, -11), SX(113, -11), SX(100, -15), SX(60, -14), SX(-43, -14), SX(-43, -14)], 4);
  P.fill(sole, C.white);
  P.shade(sole, C.whiteSh, 2.2, 0.9, 6 * k, (g) => poly(g, [SX(-43, 2), SX(66, 2), SX(103, -1), SX(113, -10)]));
  const upper = loop([SX(-43, -12), SX(-43, -12), SX(-46, -34), SX(-41, -53), SX(-41, -53), SX(-18, -50), SX(4, -44), SX(26, -43), SX(52, -41), SX(80, -33), SX(100, -21), SX(110, -11), SX(110, -11), SX(60, -12)], 4);
  P.fill(upper, C.shoe);
  // the black is laid in washes: it thins over the swell of the toe-box and along the top of the vamp
  P.shade(upper, C.shoeHi, 5, 0.85, 11 * k, (g) => poly(g, L.smoothPath([SX(8, -37), SX(46, -34), SX(84, -24)], 4)));
  P.shade(upper, C.shoeHi, 3, 0.45, 6 * k, (g) => poly(g, [SX(-38, -44), SX(-40, -20)]));
  P.line(upper.seg(4, 11), 1.8, { raw: true, head: 0.2, tail: 0.08, turn: 0 });
  P.line(upper.seg(1, 4), 1.9, { raw: true, head: 0, tail: 0, turn: 0 });
  P.line([SX(-45, 1), SX(20, 2), SX(70, 1), SX(104, -2), SX(114, -11)], 2.7, { head: 0.25, tail: 0.06, wob: 0.22 });
  P.line([SX(-44, 3), SX(-44, -14)], 2.0, { head: 0, tail: 0 });
  P.line([SX(-39, -6.5), SX(30, -6), SX(80, -6.5), SX(107, -9)], 1.3, { head: 0, tail: 0.2, col: C.ink3 });

  // ── leg binding: a long strip of cloth wound down the shin, each turn lapping the one below
  const shin = loop([SP(0.02, 1), SP(0.3, 1), SP(0.6, 1), SP(0.85, 1), SP(1.05, 1), SP(1.05, 1), SP(1.05, -1), SP(1.05, -1), SP(0.8, -1), SP(0.5, -1), SP(0.25, -1), SP(0.02, -1)], 5);
  P.fill(shin, tw(far ? C.o1f : C.o1));
  P.shade(shin, C.o3, 8 * k, 0.6, 30 * k, (g) => poly(g, [SP(0.02, -1.25), SP(0.25, -1.25), SP(0.5, -1.25), SP(0.8, -1.25), SP(1.05, -1.25)]));
  P.shade(shin, C.o3, 5 * k, 0.32, 12 * k, (g) => poly(g, [SP(0.02, 1.15), SP(0.3, 1.15), SP(0.6, 1.15), SP(0.85, 1.15), SP(1.05, 1.15)]));
  const wraps = [];
  for (let q = 0; q < 7; q++) {
    const s0 = 0.2 + q * 0.128 + r.range(-0.018, 0.018);
    if (s0 + 0.1 > 1.0) break;
    wraps.push(L.smoothPath([SP(s0, -1), SP(s0 + 0.062, -0.05), SP(s0 + 0.1, 1)], 4));
  }
  P.shade(shin, C.o3, 3.4 * k, 0.55, 8 * k, (g) => { for (const wp of wraps) poly(g, wp.map((q) => add(q, d2, 5.5 * k))); });
  for (const wp of wraps) P.line(wp, 1.9, { raw: true, head: 0.55, tail: 0.3, wob: 0.22, col: C.ink2 });
  P.line(shin.seg(0, 4), 2.6, { raw: true, head: 0, tail: 0.02 });
  P.line(shin.seg(7, 11), 2.8, { raw: true, head: 0, tail: 0.02 });
  P.line(shin.seg(5, 6), 2.2, { raw: true, head: 0, tail: 0, turn: 0 });

  // ── trouser leg
  const kf = 69 + 10 * bend;
  const KF = add(K, nk, kf * k);
  const PF1 = KP(0.075, 68), PF2 = KP(0.15, 59), HM = KP(0.182, 2), PB2 = KP(0.15, -57);
  const front = [TP(-0.6, 1), TP(0, 1), TP(0.38, 1), TP(0.74, 1), KF, PF1, PF2];                 // control points 0…6
  const hem = [PF2, KP(0.176, 33), HM, KP(0.178, -30), PB2];                                     // 7…11
  // behind a bent knee the cloth of the thigh runs straight down into the binding: no blousing shows there
  const back = [PB2, TP(0.72, -1), TP(0.38, -1), TP(0, -1), TP(-0.6, -1)];                       // 12…16
  const trous = loop([...front, ...hem, ...back], 5);
  P.fill(trous, tw(far ? C.o2f : C.o2));
  // 分染: the shaded back of the thigh, the underside of the blousing, a breath of tone down the front edge
  const sh = [];
  for (let i = 0; i <= 10; i++) { const t = lerp(-0.4, 1.0, i / 10); sh.push(TP(t, -1.2)); }
  for (let i = 10; i >= 0; i--) { const t = lerp(-0.4, 1.0, i / 10); sh.push(TP(t, -0.5 + 0.13 * Math.sin(t * 7 + r() * 0.6) - 0.25 * Math.pow(Math.max(0, t), 3))); }
  P.shade(trous, far ? C.o4 : C.o3, 15 * k, far ? 0.55 : 0.8, 'fill', (g) => poly(g, sh));
  P.shade(trous, C.o3, 9 * k, 0.85, 'fill', (g) => poly(g, [add(PB2, d2, 8 * k), add(HM, d2, 8 * k), add(PF2, d2, 8 * k), KP(0.105, 54), KP(0.125, 4), KP(0.1, -48)]));
  P.shade(trous, C.o3, 6 * k, 0.32, 14 * k, (g) => poly(g, trous.seg(0, 6)));
  // the folds: tension fans out from the hollow of the knee, the slack hangs from the hip, pleats run up from the tie
  const F = (arr) => L.smoothPath(arr.map(([t, v]) => TP(t, v + r.range(-0.04, 0.04))), 4);
  const folds = [
    [F([[0.95, -0.84], [0.8, -0.42], [0.55, 0.05], [0.3, 0.4]]), 2.4],
    [F([[1.02, -0.5], [0.9, -0.08], [0.78, 0.4]]), 2.2],
    [F([[0.9, -0.92], [0.62, -0.66], [0.32, -0.6], [0.06, -0.7]]), 2.1],
    [F([[-0.3, 0.1], [0.08, -0.1], [0.4, 0.0]]), 2.0],
  ];
  for (const x of [-34, 2, 36]) {
    const xx = x + r.range(-6, 6), top = x === 2 ? -0.02 : 0.05;
    folds.push([L.smoothPath([KP(0.172, xx), KP(0.115, xx * 1.14), KP(top + r.range(-0.02, 0.02), xx * 1.3)], 4), 1.9]);
  }
  P.shade(trous, C.o4, 5 * k, 0.5, 13 * k, (g) => { for (const [fl] of folds) poly(g, fl.map((q) => add(q, n1, -6 * k))); });
  // the wash was laid with long pulls of the brush down the leg: a few of its hairs show
  P.within(trous, (g) => {
    for (let i = 0; i < 16; i++) {
      const v0 = r.range(-0.9, 0.9), ta = r.range(-0.45, 0.45), tb = ta + r.range(0.3, 0.62), pts = [];
      for (let j = 0; j <= 12; j++) pts.push(TP(lerp(ta, tb, j / 12), v0 + 0.05 * Math.sin(j * 0.7 + i)));
      brush(g, pts, r.range(1.5, 2.8), { head: 0, tin: 0.3, tail: 0.4, wob: 0.4, turn: 0, col: r.chance(0.55) ? L.rgba(C.o4, r.range(0.06, 0.14)) : L.rgba(C.o1, r.range(0.08, 0.18)) });
    }
  });
  for (const [fl, w] of folds) P.line(fl, w, { raw: true, head: 0.8, tail: 0.6, wob: 0.22, col: C.ink2 });
  P.line(trous.seg(0, 4), 3.0, { raw: true, head: 0, tail: 0.05, wob: 0.2 });
  P.line(trous.seg(4, 6), 2.9, { raw: true, head: 0.45, tail: 0.12, wob: 0.2 });
  P.line(trous.seg(7, 11), 2.4, { raw: true, head: 0.4, tail: 0.15, wob: 0.26 });
  P.line(trous.seg(12, 16), 3.1, { raw: true, head: 0.35, tail: 0, wob: 0.2 });
}

/** the hem of the short tunic hanging over the hips, optionally with its indigo sash */
function tunic(P, H, f, k, lean, r, o = {}) {
  const tl = Math.tan(lean) * f;
  const X = (dx, dy) => [H[0] + (f * dx + -dy * tl) * k, H[1] + dy * k];
  const hemB = X(-108, 40), hemF = X(100, 80);
  // control points: hem 0…4, front edge 5…8, top 9…10, back edge 11…14
  const shape = loop([hemB, X(-62, 60), X(-12, 58), X(40, 74), hemF, hemF, X(98, -40), X(90, -200), X(88, -460), X(88, -460), X(-98, -460), X(-98, -460), X(-100, -220), X(-106, -60), hemB], 6);
  P.fill(shape, C.cloth);
  P.shade(shape, C.clothSh, 10 * k, 0.8, 34 * k, (g) => poly(g, [X(-112, -460), X(-114, -220), X(-120, -60), X(-120, 44)]));
  P.shade(shape, C.clothSh, 7 * k, 0.6, 16 * k, (g) => poly(g, [hemB, X(-62, 60), X(-12, 58), X(40, 74), hemF]));
  const folds = [L.smoothPath([X(-60, 52), X(-50, -30), X(-58, -150)], 4), L.smoothPath([X(34, 66), X(22, -20), X(36, -120)], 4), L.smoothPath([X(-14, 50), X(-10, 10)], 4)];
  P.shade(shape, C.clothSh, 5 * k, 0.7, 12 * k, (g) => { for (const fl of folds) poly(g, fl.map((q) => add(q, [-6 * k * f, 0]))); });
  [1.9, 1.8, 1.6].forEach((w, i) => P.line(folds[i], w, { raw: true, head: 0.6, tail: 0.6, wob: 0.25, col: C.ink2 }));
  P.line(shape.seg(0, 4), 2.5, { raw: true, head: 0.2, tail: 0.03, wob: 0.26 });
  P.line(shape.seg(5, 8), 2.3, { raw: true, head: 0, tail: 0 });
  P.line(shape.seg(11, 14), 2.5, { raw: true, head: 0, tail: 0 });
  if (o.sash) {
    const y0 = -128, y1 = -96;
    const band = [X(-106, y0), X(0, y0 + 6), X(94, y0), X(95, y1), X(0, y1 + 7), X(-105, y1)];
    P.fill(band, C.b3);
    P.shade(band, C.b4, 4 * k, 0.8, 12 * k, (g) => poly(g, [X(-105, y1), X(0, y1 + 7), X(95, y1)]));
    P.line([X(-106, y0), X(0, y0 + 6), X(94, y0)], 1.8, { head: 0, tail: 0 });
    P.line([X(-105, y1), X(0, y1 + 7), X(95, y1)], 2.0, { head: 0, tail: 0 });
  }
}

function figure(P, a, o) {
  const r = L.rng('s14fig' + o.seed), k = o.k || SC, f = o.f || 1;
  const th = o.s / a.R;
  const footAt = (s, dr) => { const t = s / a.R, p = a.pt(t, dr); return { p: [p.x, p.y], t }; };
  const nf = footAt(o.near, o.drNear === undefined ? 6 : o.drNear), ff = footAt(o.far, o.drFar === undefined ? 26 : o.drFar);
  const g0 = a.pt(th, 12), leanA = th * LEAN + (o.lean || 0) * f;
  const Hp = [g0.x + Math.sin(leanA) * o.hh * k, g0.y - Math.cos(leanA) * o.hh * k];
  leg(P, { H: [Hp[0] - f * 9 * k, Hp[1] - 5 * k], foot: ff.p, f, k, r, gnd: ff.t, far: true, dye: o.dye || 0 });
  leg(P, { H: Hp, foot: nf.p, f, k, r, gnd: nf.t, dye: o.dye || 0 });
  tunic(P, Hp, f, k, (o.lean || 0) + 0.04, r, o.tunic || {});
  return Hp;
}

// ───────────────────────── mould flasks & ladles ─────────────────────────
/** an upright two-part sand-mould flask (范箱) in the oblique projection of an album leaf; returns the pouring gate on its top */
function flask(P, a, o) {
  const r = L.rng('s14box' + o.seed);
  const t0 = o.s / a.R, t1 = (o.s + o.w) / a.R;
  const b0 = a.pt(t0, o.dr), b1 = a.pt(t1, o.dr);
  const A0 = [b0.x, b0.y], A1 = [b1.x, b1.y];
  const ang = ((t0 + t1) / 2) * LEAN + (o.tilt || 0);
  const up = [Math.sin(ang) * o.h, -Math.cos(ang) * o.h];
  const A3 = add(A0, up), A2 = add(A1, up);
  const dv = [o.dx || 48, o.dy || -28];
  const T3 = add(A3, dv), T2 = add(A2, dv), R1 = add(A1, dv);
  const front = [A0, A1, A2, A3], side = [A1, R1, T2, A2], top = [A3, A2, T2, T3];
  P.fill(front, C.b1); P.fill(side, C.b2); P.fill(top, C.b0);
  // 分染: the faces deepen toward the ground, the side face turns away from the light
  P.shade(front, C.b2, 20, 0.55, 70, (g) => poly(g, [add(A0, [0, 12]), add(A1, [0, 12])]));
  P.shade(front, C.b2, 9, 0.35, 16, (g) => poly(g, [A1, A2]));
  P.shade(side, C.b3, 18, 0.5, 80, (g) => poly(g, [add(A1, [0, 14]), add(R1, [0, 14])]));
  P.shade(side, C.b3, 7, 0.4, 14, (g) => poly(g, [R1, T2]));
  // ropes binding the two halves together
  const U = (p, fr) => add(p, up, fr);
  for (const fr of [0.24, 0.7]) {
    const fr2 = fr + 14 / o.h;
    const rope = [U(A0, fr), U(A1, fr), U(R1, fr), U(R1, fr2), U(A1, fr2), U(A0, fr2)];
    P.fill(rope, C.o1);
    P.shade(rope, C.o3, 3, 0.55, 8, (g) => poly(g, [U(A0, fr), U(A1, fr), U(R1, fr)]));
    for (const q of [fr, fr2]) { P.line([U(A0, q), U(A1, q)], 1.6, { head: 0, tail: 0, turn: 0 }); P.line([U(A1, q), U(R1, q)], 1.6, { head: 0, tail: 0, turn: 0 }); }
  }
  const j = () => [r.range(-1, 1), r.range(-1, 1)];
  const seg = (p, q, w, oo = {}) => P.line([add(p, j()), add(mid(p, q), j(), 0.7), add(q, j())], w, { head: 0.3, tail: 0.04, wob: 0.22, turn: 0, ...oo });
  seg(A3, A0, 2.9); seg(A0, A1, 3.0); seg(A2, A1, 2.7); seg(A3, A2, 2.6);
  seg(A3, T3, 2.3); seg(T3, T2, 2.3); seg(A2, T2, 2.3); seg(A1, R1, 2.5); seg(T2, R1, 2.6);
  // the parting between the two halves, down the side and across the top
  seg(mid(A2, T2), mid(A1, R1), 1.6, { col: C.ink2, tail: 0.2 });
  seg(mid(A3, T3), mid(A2, T2), 1.6, { col: C.ink2, tail: 0.2 });
  // the pouring gate, brimming
  const c = mid(mid(A3, T3), mid(A2, T2));
  const ell = (rx, ry, n = 28) => { const e = []; for (let i = 0; i < n; i++) { const an = (i / n) * L.TAU; e.push([c[0] + Math.cos(an) * rx + Math.sin(an) * ry * 0.5, c[1] + Math.sin(an) * ry]); } return e; };
  P.fill(ell(20, 8), C.v2);
  P.fill(ell(11, 4), C.v1, 0.8);
  const ring = ell(20, 8); ring.push(ring[0], ring[1]);
  P.line(ring, 1.7, { raw: true, head: 0, tail: 0, wob: 0.25, turn: 0 });
  return { gate: c, top: A3[1] };
}

/** long-handled copper ladle; `target` = where its stream of molten copper lands (omit for a ladle that is not pouring yet) */
function ladle(P, o) {
  const { bowl, from, tilt, f = 1, k = 1, target, seed } = o;
  const g = P.g, r = L.rng('s14ladle' + seed);
  const c = Math.cos(tilt * f), s = Math.sin(tilt * f);
  const B = (x, y) => { const X = x * f * k, Y = y * k; return [bowl[0] + X * c - Y * s, bowl[1] + X * s + Y * c]; };
  const RX = 52, RY = 14, DP = 52;
  // pole
  const at = B(-RX + 4, 6), dir = unit(at[0] - from[0], at[1] - from[1]), nr = [-dir[1], dir[0]], pwid = 8 * k;
  const pole = [add(from, nr, pwid), add(at, nr, pwid), add(at, nr, -pwid), add(from, nr, -pwid)];
  P.fill(pole, C.o1);
  P.shade(pole, C.o3, 3.5, 0.5, 8 * k, (g2) => poly(g2, [add(from, nr, -pwid), add(at, nr, -pwid)]));
  P.line([pole[0], add(mid(pole[0], pole[1]), nr, r.range(-1.2, 1.2)), pole[1]], 2.2, { head: 0, tail: 0, wob: 0.2, turn: 0 });
  P.line([pole[3], add(mid(pole[3], pole[2]), nr, r.range(-1.2, 1.2)), pole[2]], 2.5, { head: 0, tail: 0, wob: 0.2, turn: 0 });
  // the metal socket the pole is driven into
  const q0 = add(at, dir, -74 * k), q1 = add(at, dir, 6 * k);
  const sock = [add(q0, nr, pwid + 3), add(q1, nr, pwid + 5), add(q1, nr, -pwid - 5), add(q0, nr, -pwid - 3)];
  P.fill(sock, C.o3);
  P.shade(sock, C.o5, 4, 0.6, 12 * k, (g2) => poly(g2, [sock[3], sock[2]]));
  P.line([sock[0], sock[1]], 2.2, { head: 0, tail: 0, turn: 0 }); P.line([sock[3], sock[2]], 2.5, { head: 0, tail: 0, turn: 0 });
  P.line([sock[0], sock[3]], 2.0, { head: 0, tail: 0, turn: 0 });
  P.line([mid(sock[0], sock[1], 0.45), mid(sock[3], sock[2], 0.45)], 1.6, { head: 0, tail: 0, turn: 0, col: C.ink2 });
  // bowl
  const body = [];
  for (let i = 0; i <= 18; i++) { const an = Math.PI - (i / 18) * Math.PI; body.push(B(RX * Math.cos(an), DP * Math.pow(Math.sin(an), 0.8))); }
  const far = [];
  for (let i = 1; i < 12; i++) { const an = (i / 12) * Math.PI; far.push(B(RX * Math.cos(an), -RY * Math.sin(an))); }
  const hull = [...body, ...far];
  P.fill(hull, C.o3);
  P.shade(hull, C.o5, 9 * k, 0.6, 26 * k, (g2) => poly(g2, body.slice(7, 19).map((q) => add(q, [2 * k, 5 * k]))));    // the belly turns under
  P.shade(hull, C.o1, 6 * k, 0.5, 10 * k, (g2) => poly(g2, [B(-34, 16), B(-22, 30), B(-4, 38)]));                     // a dull light on the copper
  const rim = [], melt = [];
  for (let i = 0; i < 30; i++) { const an = (i / 30) * L.TAU; rim.push(B(RX * Math.cos(an), RY * Math.sin(an))); melt.push(B((RX - 7) * Math.cos(an) + 1, (RY - 4) * Math.sin(an) + 1)); }
  P.fill(rim, C.o5); P.fill(melt, C.v2);
  P.shade(melt, C.v1, 3 * k, 0.9, 'fill', (g2) => poly(g2, melt.map((q) => mid(q, B(-6, 0), 0.45))));
  P.line(body, 2.8, { head: 0.2, tail: 0.02, wob: 0.22 });
  rim.push(rim[0], rim[1]);
  P.line(rim, 2.0, { raw: true, head: 0, tail: 0, wob: 0.25, turn: 0 });
  // the pour: a rope of copper, drawn out thinner as it falls, outlined in a deeper red rather than in ink
  if (target) {
    const lip = B(RX - 2, 3), pts = [];
    for (let i = 0; i <= 22; i++) {
      const u = i / 22, x = lerp(lip[0], target[0], Math.pow(u, 0.62)), y = lerp(lip[1], target[1], u * u * 0.55 + u * 0.45);
      pts.push([x + 1.2 * NZ.n2(u * 4, seed.length + 3.3), y]);
    }
    const prof = (u) => lerp(1.12, 0.62, L.smooth(u));
    brush(g, pts, 14.5 * k, { raw: true, head: 0, tail: 0, wob: 0.1, turn: 0, col: C.v3, prof });
    brush(g, pts, 11.2 * k, { raw: true, head: 0, tail: 0, wob: 0.1, turn: 0, col: C.v2, prof });
    brush(g, pts.map((q) => [q[0] - 1.6 * k, q[1]]), 4 * k, { raw: true, head: 0, tin: 0.15, tail: 0.3, wob: 0.2, turn: 0, col: C.v1, prof });
  }
}

// ───────────────────────── the platform, the ground ─────────────────────────
function platform(P, a) {
  const g = P.g, s = a.span(PAD + 90);
  const row = (fn, n = 170) => { const out = []; for (let i = 0; i <= n; i++) { const th = lerp(-s, s, i / n), q = a.pt(th, fn(th * a.R)); out.push([q.x, q.y]); } return out; };
  const top = row(() => 0);
  const lowFn = (u) => -88 + 1.4 * NZ.n2(u / 260, 12.1);
  const end = row((u) => -99 + 3.5 * NZ.n2(u / 150, 5.5) + 1.8 * NZ.n2(u / 43, 9.1));
  const face = [...top, ...row(lowFn).reverse()];
  // the colour was not laid quite in register with the line: it runs a little past the lower one
  g.save(); g.filter = 'blur(1.2px)'; P.fill([...row(() => -80), ...end.reverse()], L.mix(C.b2, C.paper, 0.3), 1, true); g.restore();
  P.fill(face, C.b3, 1, true);
  // 分染: deepest under the top line, thinning toward the foot
  P.shade(face, C.b4, 13, 0.95, 40, (g2) => a.trace(g2, -8, -s, s));
  P.shade(face, C.b5, 6, 0.4, 10, (g2) => a.trace(g2, -3, -s, s));
  P.shade(face, C.b2, 12, 0.3, 26, (g2) => a.trace(g2, -76, -s, s));
  P.band = face;
  P.line(row(lowFn, 320), 2.0, { raw: true, head: 0, tail: 0, wob: 0.26, turn: 0 });
  P.line(L.arcPts(a, -1.6, -s, s, 440), 3.3, { raw: true, head: 0, tail: 0, wob: 0.2, turn: 0 });
}

/** the ground under the platform: a pale ochre wash graded off from its foot, and a few dry strokes of a split brush */
function ground(P, a) {
  const g = P.g, s = a.span(PAD + 90);
  g.save(); a.clipBelow(g, -92);
  g.filter = 'blur(26px)'; g.globalAlpha = 0.5; g.strokeStyle = C.o1; g.lineWidth = 60;
  a.stroke(g, -118, -s, s);
  g.restore();
  // the floor of the platform: the thinnest wash, so that feet and flasks stand on something
  g.save(); a.clipAbove(g, 0);
  g.filter = 'blur(15px)'; g.globalAlpha = 0.3; g.strokeStyle = '#CDB286'; g.lineWidth = 34;
  a.stroke(g, 12, -s, s);
  g.restore();
  // and lower down two broad, barely tinted pulls of the same wash: the ground
  for (const [t0, t1, dr, w, al] of [[-0.36, -0.05, -214, 46, 0.2], [0.0, 0.31, -292, 58, 0.17]]) {
    g.save(); g.filter = 'blur(13px)'; g.globalAlpha = al; g.strokeStyle = C.o1; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const u = i / 40, q = a.pt(lerp(t0, t1, u), dr + 9 * NZ.n2(u * 2.3, dr) + 6 * Math.sin(u * Math.PI)); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }
    g.stroke(); g.restore();
  }
}

// ───────────────────────── pigment and paper ─────────────────────────
/** the sheet: `tone` = how unevenly it has browned (to be multiplied in), `fibre` = its bast fibres (a transparent layer) */
function buildPaper(a) {
  const tone = L.noiseTex(LW, LH, { seed: 's14paper', scale: 640, octaves: 3, res: 0.2, contrast: 1.2, ramp: [[0, '#eee0c4'], [0.55, '#fbf5e8'], [1, '#ffffff']] });
  const tg = tone.getContext('2d');
  tg.globalCompositeOperation = 'multiply';
  // formation: the pulp settled a little cloudily on the mould
  tg.drawImage(L.noiseTex(LW, LH, { seed: 's14cloud', scale: 46, octaves: 3, res: 0.5, contrast: 1.2, ramp: [[0, '#f8f2e6'], [0.5, '#fdfbf6'], [1, '#ffffff']] }), 0, 0);
  tg.fillStyle = L.radial(tg, a.cx + PAD - 60, a.crestY + PAD - 40, 520, 1500, [[0, '#ffffff'], [1, '#f1e6cd']]);
  tg.fillRect(0, 0, LW, LH);

  const fibre = L.makeLayer(PAD), g = fibre.getContext('2d'), r = L.rng('s14fibre');
  const pale = (al) => `rgba(255,250,232,${al.toFixed(3)})`, tan = (al) => `rgba(150,112,62,${al.toFixed(3)})`;
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {       // the felt of short fibres
    const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(14, 60), an = r.range(0, Math.PI), bend = r.range(-0.5, 0.5);
    g.strokeStyle = r.chance(0.6) ? pale(r.range(0.06, 0.16)) : tan(r.range(0.03, 0.08));
    g.lineWidth = r.range(1.2, 1.6);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len);
    g.stroke();
  }
  for (let i = 0; i < 110; i++) {       // long strands that did not beat down
    const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(70, 250), an = r.range(0, Math.PI);
    const b1 = r.range(-0.7, 0.7), b2 = r.range(-0.7, 0.7);
    g.strokeStyle = r.chance(0.72) ? pale(r.range(0.08, 0.2)) : tan(r.range(0.04, 0.1));
    g.lineWidth = r.range(1.3, 2.0);
    g.beginPath(); g.moveTo(x, y);
    g.bezierCurveTo(x + Math.cos(an + b1) * len * 0.33, y + Math.sin(an + b1) * len * 0.33, x + Math.cos(an + b2) * len * 0.66, y + Math.sin(an + b2) * len * 0.66, x + Math.cos(an) * len, y + Math.sin(an) * len);
    g.stroke();
  }
  return { tone, fibre };
}

/** what the colours look like close to: washes that did not dry perfectly flat; in the mineral blue of the platform, the hairs of the flat brush and the odd coarse grain of the pigment */
function pigmentTexture(P, env) {
  const g = P.g, a = env.arc;
  L.overlayOn(P.layer, L.noiseTex(LW, LH, { seed: 's14mot', scale: 130, octaves: 3, res: 0.25, contrast: 1.5 }), { blend: 'soft-light', alpha: 0.3 });
  g.save(); P.trace(P.band); g.clip();
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.34;
  g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's14streak', scale: 26, sx: 14, sy: 0.55, octaves: 3, res: 0.5, contrast: 1.6 }), -PAD, -PAD);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const r = L.rng('s14azur'), s = a.span(PAD + 60);
  for (let i = 0; i < 240; i++) {
    const dr = -r.range(4, 84), t0 = r.range(-s, s), len = r.range(0.06, 0.26), n = Math.ceil((len * a.R) / 9), drift = r.range(-3, 3), pts = [];
    for (let j = 0; j <= n; j++) { const q = a.pt(t0 + (len * j) / n, dr + (drift * j) / n + 1.2 * NZ.n2(j * 0.11 + i, i * 3.1)); pts.push([q.x, q.y]); }
    const w = r.range(1.3, 2.6), col = r.chance(0.5) ? L.rgba(C.b2, r.range(0.08, 0.2)) : L.rgba(C.b5, r.range(0.1, 0.24));
    brush(g, pts, w, { raw: true, head: 0, tin: 0.25, tail: 0.35, wob: 0.4, turn: 0, col });
  }
  for (let i = 0; i < 700; i++) {
    const q = a.pt(r.range(-s, s), -r.range(3, 84));
    const light = r.chance(0.35), al = r.range(0.1, 0.26), rx = r.range(0.7, 1.3), ry = r.range(0.6, 1.0), rot = r.range(0, Math.PI);
    if (NZ.n2(q.x / 70, q.y / 70 + 40) < r.range(-0.7, 0.6)) continue;
    g.globalAlpha = al; g.fillStyle = light ? C.b1 : C.b5;
    g.beginPath(); g.ellipse(q.x, q.y, rx, ry, rot, 0, L.TAU); g.fill();
  }
  g.restore();
}

export default {
  name: '铸钱图',
  tone: 'dark',
  init(env) {
    const a = env.arc, P = makePainter(), g = P.g;
    SID = 0;

    ground(P, a);
    platform(P, a);
    // the row of flasks
    const f1 = flask(P, a, { s: -752, dr: 20, w: 116, h: 258, tilt: -0.02, seed: 'a' });
    const f2 = flask(P, a, { s: -50, dr: 22, w: 124, h: 280, tilt: 0.012, seed: 'b' });
    const f3 = flask(P, a, { s: 668, dr: 18, w: 114, h: 254, tilt: 0.03, seed: 'c' });
    // the heat of the pour, washed in pale vermilion round the two gates that are being filled
    const hot = [[f2.gate[0] - 14, f2.gate[1] - 46, 150], [f3.gate[0] - 14, f3.gate[1] - 50, 140], [f1.gate[0] - 30, f1.gate[1] - 150, 84]];
    for (const [x, y, rad] of hot.slice(0, 2)) {
      g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(C.v1, 0.34)], [0.45, L.rgba(C.v1, 0.14)], [1, L.rgba(C.v1, 0)]]);
      g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
    }
    // the founders, back to front
    figure(P, a, { seed: 'D', s: 1050, hh: 492, near: 912, far: 1160, lean: 0.05, dye: 0.3, tunic: { sash: true } });
    const hC = figure(P, a, { seed: 'C', s: 398, hh: 506, near: 318, far: 470, drNear: 5, drFar: 30, lean: 0.03, dye: -0.22, tunic: {} });
    const hB = figure(P, a, { seed: 'B', s: -330, hh: 470, near: -214, far: -478, drNear: 7, drFar: 26, lean: 0.1, dye: 0.12, tunic: {} });
    const hA = figure(P, a, { seed: 'A', s: -1014, hh: 488, near: -926, far: -1150, lean: 0.08, dye: -0.1, tunic: { sash: true } });
    // ladles
    ladle(P, { seed: 'A', k: SC, bowl: [f1.gate[0] - 30, f1.gate[1] - 150], from: [hA[0] + 118, hA[1] - 330], tilt: 0.1 });
    ladle(P, { seed: 'Bb', k: SC, bowl: [f2.gate[0] - 62, f2.gate[1] - 112], from: [hB[0] + 150, hB[1] - 260], tilt: 0.52, target: f2.gate });
    ladle(P, { seed: 'Cc', k: SC, bowl: [f3.gate[0] - 58, f3.gate[1] - 128], from: [hC[0] + 120, hC[1] - 300], tilt: 0.44, target: f3.gate });

    pigmentTexture(P, env);

    // the leaf: browned paper and its fibres, the painting on it, the longest fibres still showing through the colour
    const paper = buildPaper(a);
    const base = L.makeCanvas(LW, LH), bg = base.getContext('2d');
    bg.fillStyle = C.paper; bg.fillRect(0, 0, LW, LH);
    bg.globalCompositeOperation = 'multiply'; bg.drawImage(paper.tone, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    bg.drawImage(paper.fibre, 0, 0);
    bg.drawImage(P.layer, 0, 0);
    bg.globalAlpha = 0.3; bg.drawImage(paper.fibre, 0, 0); bg.globalAlpha = 1;
    const sheet = L.blurred(base, 0.5), sg = sheet.getContext('2d');      // the ink has sunk into the sheet
    // copy-stand lens: sharp round the crest, losing the corners
    const soft = L.blurred(sheet, 3.6), fg = soft.getContext('2d');
    fg.globalCompositeOperation = 'destination-in';
    fg.fillStyle = L.radial(fg, a.cx + PAD, a.crestY + PAD - 20, 700, 1500, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    fg.fillRect(0, 0, LW, LH);
    sg.drawImage(soft, 0, 0);
    sheet._pad = PAD;

    // the glow of the molten copper, kept apart so that it can flicker
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y, rad] of hot) { x0 = Math.min(x0, x - rad); y0 = Math.min(y0, y - rad); x1 = Math.max(x1, x + rad); y1 = Math.max(y1, y + rad); }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    const glow = L.makeCanvas(Math.ceil(x1 - x0), Math.ceil(y1 - y0)), gg = glow.getContext('2d');
    for (const [x, y, rad] of hot) {
      gg.fillStyle = L.radial(gg, x - x0, y - y0, 0, rad, [[0, 'rgba(255,176,96,0.6)'], [0.3, 'rgba(255,150,70,0.26)'], [1, 'rgba(255,140,60,0)']]);
      gg.beginPath(); gg.arc(x - x0, y - y0, rad, 0, L.TAU); gg.fill();
    }
    S = { sheet, glow, gx: x0, gy: y0 };
  },
  draw(ctx, env, p) {
    const fi = Math.round(p * (env.frames - 1)), rr = L.rng('s14f' + fi);
    const rot = lerp(-0.0175, 0.0175, p);          // the leaf slides ~2° round the circle
    L.blit(ctx, env, S.sheet, { rot });
    // the molten copper flickers
    const fl = 0.25 + 0.75 * rr();
    L.cam(ctx, env, { rot }, (c) => { c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.55 * fl; c.drawImage(S.glow, S.gx, S.gy); });
    // copy-stand light: a touch brighter left of centre, falling off warm toward the corners
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.radial(ctx, 840, 430, 320, 1350, [[0, '#ffffff'], [0.55, '#f8f1e2'], [1, '#e7d8b8']]);
    ctx.fillRect(0, 0, W, H); ctx.restore();
  },
};
