// s14 — 采药图. A macro photograph of an old hand-coloured print: key lines printed in ink, colour brushed on by hand.
// The arc is the ridge of a stone-green hillside (ink key line on the arc, a thick band of green wash under it, a deep-green
// brush line pressed along the band's lower edge). A herb gatherer strides over the ridge; the camera sits so low that only
// the waist-down is in frame: ochre tunic hem, trousers, yellow cloth leg-wraps (绑腿), black cloth shoes with white soles,
// the bottom of a bamboo back-basket (背篓) with sprigs of leaves hanging over it, and a short herb hoe (药锄) slung on a cord.
//
// Animation "on threes": five separate drawings (one walking step), each held three frames; every drawing is re-inked with
// its own hand wobble, so the lines boil like a filmed stack of prints. The sheet itself only twitches a pixel or so.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;            // nothing rotates here — the sheet only shakes ±1.5 px and creeps 1 % closer
let S = null;

// Pigments are pre-divided by the paper colour: every wash is MULTIPLIED onto the sheet and lands on the palette value there.
const PAPER = '#e6d6ae';
const INK = '#302926';
const DEEP = '#3f7a38';                    // 深绿 brush line (over the paper ≈ #396632)
const PIG = {                              // [wash, the same pigment where it pooled]
  green: ['#8dc66c', '#4a8a3c'],
  ochre: ['#c9783e', '#8c401c'],
  umber: ['#a9602f', '#6e3416'],           // 赭 laid on twice → the trousers
  yellow: ['#f8d255', '#c98d24'],
  wood: ['#ecc79a', '#b07a40'],
};
const FAR = { umber: ['#98552b', '#653014'], yellow: ['#ebc04a', '#bd8322'] };   // the far leg sits a tone lower

// ───────────────────────── small vector helpers ─────────────────────────
const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
const at = (p, d, n, t, v) => [p[0] + d[0] * t + n[0] * v, p[1] + d[1] * t + n[1] * v];
const unit = (a, b) => { const x = b[0] - a[0], y = b[1] - a[1], m = Math.hypot(x, y) || 1; return [x / m, y / m]; };
const frontOf = (d) => [d[1], -d[0]];      // for a limb pointing down the page, "front" = the walking direction (+x)
const tab = (T, t) => {                    // piecewise-linear lookup in [[t, v], …]
  if (t <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (t <= T[i][0]) return L.remap(t, T[i - 1][0], T[i][0], T[i - 1][1], T[i][1]);
  return T[T.length - 1][1];
};
/** several open splines joined end to end (sharp corners at the joints) → dense closed outline */
const chain = (segs) => { let out = []; for (const s of segs) out = out.concat(L.smoothPath(s, 5)); return out; };
function trace(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

// ───────────────────────── the colourist's and the printer's hands ─────────────────────────
// B = { cg (colour washes), ig (ink), r (per-drawing jitter), seed, n }
function knock(B, outline) {
  for (const g of [B.cg, B.ig]) { g.save(); g.globalCompositeOperation = 'destination-out'; trace(g, outline); g.fill(); g.restore(); }
}
/** a brushed wash: never quite on the printed line, pigment pooled along its rim */
function wash(B, outline, pig, o = {}) {
  const g = B.cg, r = B.r, { alpha = 0.95, amp = 2.4, off = [2, -1.5], pool = 0.34 } = o;
  const ph = r.range(0, 9);
  const pts = outline.map(([x, y], i) => [x + off[0] + amp * Math.sin(i * 0.13 + ph), y + off[1] + amp * Math.cos(i * 0.091 + ph * 1.7)]);
  g.save();
  trace(g, pts); g.globalAlpha = alpha; g.fillStyle = pig[0]; g.fill();
  if (pool > 0) {
    g.clip(); g.lineJoin = 'round'; g.strokeStyle = pig[1];
    g.globalAlpha = pool * 0.45; g.lineWidth = 18; g.stroke();
    g.globalAlpha = pool; g.lineWidth = 6; g.stroke();
  }
  g.restore();
}
/** knock the shape out of everything behind it, then colour it */
function part(B, segs, pig, o) {
  const out = chain(segs);
  knock(B, out);
  if (pig) wash(B, out, pig, o);
  return out;
}
/** a second, darker touch of pigment (only lands where there is already colour) */
function glaze(B, pts, col, w, alpha) {
  const g = B.cg, p = L.smoothPath(pts, 6);
  g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); g.restore();
}
/** a printed key line: even, a little rough, re-cut slightly differently for every drawing */
function ink(B, pts, w = 6.5, o = {}) {
  const r = B.r, j = o.jit === undefined ? 1.2 : o.jit;
  const p = pts.map(([x, y]) => [x + r.range(-j, j), y + r.range(-j, j)]);
  L.inkStroke(B.ig, p, { width: w, color: o.color || INK, seed: B.seed + (B.n++), taper: o.taper || [0.05, 0.1], wobble: o.wobble === undefined ? 0.2 : o.wobble, smoothStep: 4 });
}
function solid(B, outline) { const g = B.ig; g.save(); g.fillStyle = INK; trace(g, outline); g.fill(); g.restore(); }
/** scratch a sliver of bare paper back out of a solid ink area */
function reserve(B, pts, w, alpha = 0.85) {
  const g = B.ig, p = L.smoothPath(pts, 5);
  g.save(); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = alpha; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); g.restore();
}

// ───────────────────────── the walk ─────────────────────────
const TH = 240, SH = 228;                       // thigh, shin (px) — hip joint ≈ 505 px above the ground
const SOLE = [[-42, 45], [20, 45], [72, 45], [104, 38]];
// one step in five drawings. n / f = near / far ankle: [x from the hip, foot pitch (rad, + = toes up), lift above the ground]
const POSES = [
  { hh: 500, n: [-75, -0.5, 42], f: [-10, 0, 0], sw: 0.5 },        // far leg carries, near leg swings through
  { hh: 490, n: [110, 0.12, 30], f: [-100, -0.12, 0], sw: 1 },     // near leg reaches
  { hh: 478, n: [170, 0.36, 0], f: [-177, -0.4, 0], sw: 0.3 },     // heel strike — the stride at its widest (mid-shot)
  { hh: 470, n: [95, 0, 0], f: [-235, -0.85, 33], sw: -0.6 },      // weight rolls onto the near leg, far foot peels off
  { hh: 504, n: [0, 0, 0], f: [-40, -0.35, 30], sw: -1 },          // near leg carries, far leg swings through
];
const FS = 1.3;                                 // the figure is drawn in its own units and printed 1.3× — the camera sits close
const TOP = -PAD / FS - 12;                     // top of the sheet, in figure units
const HEM = 205;                                // the tunic's hem hangs this far below the hip joint (just above the knee)
const HX = [-2, -1, 0, 1, 2].map((i) => 960 + i * 95 * FS);   // hip x (px) of each drawing: the planted foot stays put, the body advances one step
const CEL_L = 620, CEL_W = 968, CEL_H = 724;    // each drawing lives on its own small sheet that travels with the hip (L, W in figure units)

function knee(Hp, A) {
  const dx = A[0] - Hp[0], dy = A[1] - Hp[1], d = Math.hypot(dx, dy), dm = Math.min(d, TH + SH - 1);
  const a = (TH * TH - SH * SH + dm * dm) / (2 * dm), h = Math.sqrt(Math.max(0, TH * TH - a * a));
  const ux = dx / d, uy = dy / d;
  return [Hp[0] + ux * a + uy * h, Hp[1] + uy * a - ux * h];
}

function drawLeg(B, G, far, sw) {
  const { H: Hp, K, A, ang } = G;
  const pg = far ? { ...PIG, ...FAR } : PIG;
  const d = unit(Hp, K), n = frontOf(d), ds = unit(K, A), ns = frontOf(ds);
  const beta = Math.acos(L.clamp(d[0] * ds[0] + d[1] * ds[1], -1, 1)), hb = beta / 2;
  let nb = [n[0] + ns[0], n[1] + ns[1]]; { const m = Math.hypot(nb[0], nb[1]) || 1; nb = [nb[0] / m, nb[1] / m]; }
  const sp = (t, v) => at(K, ds, ns, t, v), tp = (t, v) => at(Hp, d, n, t, v);

  // ── 绑腿: a long strip of cloth wound from the ankle to just under the knee ──
  const WF = [[40, 44], [95, 42], [160, 34], [SH, 26]], WB = [[40, 46], [105, 53], [170, 38], [SH, 27]];
  const wf = WF.map(([t, v]) => sp(t, v)), wb = WB.map(([t, v]) => sp(t, -v)).reverse();   // wb runs ankle → knee
  part(B, [wf, [wf[3], wb[0]], wb, [wb[3], wf[0]]], pg.yellow);
  wash(B, chain([wb, [sp(40, -46), sp(40, -16)], [sp(40, -16), sp(110, -20), sp(170, -11), sp(SH, -6)], [sp(SH, -6), sp(SH, -27)]]),
    [pg.yellow[1], pg.yellow[1]], { alpha: 0.5, pool: 0, amp: 1.2, off: [0, 0] });   // the calf turns away from the light
  ink(B, wf, 6.2); ink(B, wb, 6.2);
  for (let i = 0; i < 5; i++) {
    const t = 70 + i * 33;
    ink(B, [sp(t - 6, -tab(WB, t - 6)), sp(t + 12, -6), sp(t + 22, tab(WF, t + 22))], 4.2, { taper: [0.04, 0.04] });
  }
  ink(B, [sp(48, -47), sp(52, 0), sp(48, 44)], 4.2, { taper: [0.03, 0.03] });
  const kn = sp(50, -47);                       // the tie, its two ends flying behind
  ink(B, [kn, add(kn, [-22 - 10 * sw, 12]), add(kn, [-42 - 16 * sw, 30])], 5, { taper: [0, 0.6] });
  ink(B, [kn, add(kn, [-10 - 6 * sw, 22]), add(kn, [-20 - 12 * sw, 48])], 5, { taper: [0, 0.6] });

  // ── trouser leg, bloused over the top of the wrap ──
  const kc = 62 / Math.max(0.8, Math.cos(hb)), ki = 54 * Math.cos(hb);
  const front = [tp(-30, 68), tp(90, 70), tp(176, 66), add(K, nb, kc), sp(34, 57), sp(60, 47)];
  const hemT = [sp(60, 47), sp(71, 14), sp(69, -18), sp(58, -50)];
  const back = [sp(58, -50), add(K, nb, -ki), tp(150 - 44 * Math.sin(beta), -72), tp(70, -80), tp(-30, -82)];
  part(B, [front, hemT, back, [tp(-30, -82), tp(-30, 68)]], pg.umber);
  glaze(B, [tp(40, -52), tp(130, -48), add(K, nb, -ki + 22)], pg.umber[1], 40, 0.28);     // shadow down the back of the thigh
  ink(B, front, 6.5); ink(B, back, 6.5); ink(B, hemT, 5);
  ink(B, [add(K, nb, -ki + 2), add(add(K, nb, -18), d, -10), add(add(K, nb, 12), d, -22)], 4.2, { taper: [0.02, 0.55] });
  if (beta > 0.35) ink(B, [tp(TH - 78, -70), tp(TH - 52, -34), tp(TH - 46, 4)], 4, { taper: [0.02, 0.6] });
  ink(B, [tp(64, 22), tp(132, 40), tp(196, 50)], 4, { taper: [0.1, 0.5] });
  for (const v of [-28, 2, 30]) ink(B, [sp(66, v * 0.9), sp(50, v * 1.05), sp(32, v * 1.2)], 3.4, { taper: [0, 0.6] });

  // ── 布鞋: black cloth upper with a round mouth, thick white 千层底 sole ──
  const c = Math.cos(ang), s = Math.sin(ang), Lw = (x, y) => [A[0] + x * c - y * s, A[1] + x * s + y * c];
  const mouth = [Lw(-40, -13), Lw(-14, 0), Lw(10, 1), Lw(36, -15)];
  const vamp = [Lw(36, -15), Lw(58, -6), Lw(82, 5), Lw(99, 15), Lw(107, 29)];
  const welt = [Lw(107, 29), Lw(70, 30), Lw(-44, 30)];
  const heel = [Lw(-44, 30), Lw(-48, 8), Lw(-40, -13)];
  const toe = [Lw(107, 29), Lw(110, 34), Lw(105, 39)];
  const tread = [Lw(105, 39), Lw(72, 45), Lw(20, 45), Lw(-42, 45)];
  const heelB = [Lw(-42, 45), Lw(-47, 38), Lw(-44, 30)];
  knock(B, chain([mouth, vamp, toe, tread, heelB, heel]));
  solid(B, chain([mouth, vamp, welt, heel]));
  reserve(B, [Lw(46, -3), Lw(70, 4), Lw(93, 16)], 3.4);                 // sheen along the vamp
  reserve(B, [Lw(-35, -6), Lw(-13, 6), Lw(10, 7), Lw(32, -7)], 2.6, 0.7);   // the bound edge of the mouth
  ink(B, tread, 6.5, { taper: [0.03, 0.03] }); ink(B, toe, 5, { taper: [0, 0] }); ink(B, heelB, 5, { taper: [0, 0] });
  ink(B, [Lw(-40, 38), Lw(30, 38), Lw(98, 35)], 2.6, { taper: [0.1, 0.3] });
}

/** the short tunic's hem: one big ochre shape, slit at the side seam */
function drawTunic(B, hx, hy, GN, GF, sw) {
  const cen = (G) => { const d = unit(G.H, G.K); return add(G.H, d, HEM - 4); };
  const cN = cen(GN), cF = cen(GF), top = TOP, yh = hy + HEM;
  const xf = Math.max(Math.max(cN[0], cF[0]) + 92, hx + 124);
  const xb = Math.min(Math.min(cN[0], cF[0]) - 100, hx - 122) - 12 - 9 * sw;
  const xs = hx * 0.4 + cN[0] * 0.6, lift = 10 + 8 * sw;
  const front = [[hx + 84, top], [hx + 90, hy - 60], [hx + 96, hy + 40], [xf - 8, yh - 62], [xf, yh - 6]];
  const hemA = [[xf, yh - 6], [xf - 50, yh + 8], [xs + 42, yh + 12], [xs + 14, yh + 6]];
  const slitA = [[xs + 14, yh + 6], [xs + 5, yh - 40], [xs, yh - 88]];
  const slitB = [[xs, yh - 88], [xs - 10, yh - 30], [xs - 22, yh + 12]];
  const hemB = [[xs - 22, yh + 12], [xs - 72, yh + 19], [xb + 52, yh + 13], [xb, yh + 2 - lift]];
  const back = [[xb, yh + 2 - lift], [xb + 24, yh - 78], [hx - 100, hy + 26], [hx - 92, hy - 60], [hx - 88, top]];
  part(B, [front, hemA, slitA, slitB, hemB, back, [[hx - 88, top], [hx + 84, top]]], PIG.ochre, { pool: 0.4 });
  const f1 = [[hx + 34, top], [hx + 50, hy + 16], [xf - 48, yh - 28]];
  const f2 = [[hx - 16, hy - 80], [xs - 4, hy + 24], [xs, yh - 88]];
  const f3 = [[hx - 58, hy - 40], [hx - 82, hy + 64], [xb + 46, yh - 22]];
  glaze(B, f1.map(([x, y]) => [x - 14, y]), PIG.ochre[1], 26, 0.3);
  glaze(B, f3.map(([x, y]) => [x - 12, y]), PIG.ochre[1], 30, 0.34);
  glaze(B, [[xb + 30, yh - 62], [xb + 16, yh - 8]], PIG.ochre[1], 34, 0.3);
  ink(B, front, 6.8); ink(B, hemA, 6.5); ink(B, slitA, 5); ink(B, slitB, 5); ink(B, hemB, 6.5); ink(B, back, 6.8);
  ink(B, f1, 4.6, { taper: [0.05, 0.4] }); ink(B, f2, 4.4, { taper: [0.3, 0.05] }); ink(B, f3, 4.6, { taper: [0.05, 0.4] });
}

/** the bottom of the bamboo back-basket: split-bamboo strips plaited on the two diagonals (big open diamonds), a stout foot hoop */
function drawBasket(B, O, tau) {
  const u = [Math.sin(tau), -Math.cos(tau)], rt = [Math.cos(tau), Math.sin(tau)];
  const Pb = (v, s) => [O[0] + rt[0] * v + u[0] * s, O[1] + rt[1] * v + u[1] * s];
  const hw = (s) => 112 + 0.14 * s, sag = (f) => -8 * (1 - f * f), ST = 430;
  const left = [Pb(-hw(ST), ST), Pb(-hw(160), 160), Pb(-hw(40), 40), Pb(-hw(0) + 6, 10)];
  const bottom = [Pb(-hw(0) + 6, 10), Pb(-84, -10), Pb(0, -15), Pb(84, -10), Pb(hw(0) - 6, 10)];
  const right = [Pb(hw(0) - 6, 10), Pb(hw(40), 40), Pb(hw(160), 160), Pb(hw(ST), ST)];
  const out = part(B, [left, bottom, right, [Pb(hw(ST), ST), Pb(-hw(ST), ST)]], PIG.yellow, { pool: 0.4 });
  // the basket is round: a strip at angle phi round the wall sits at sin(phi) across the drawing
  const Q = (phi, s) => { const f = Math.sin(phi); return Pb(f * hw(s), s + sag(f)); };
  const PITCH = 0.52, RISE = 132, S0 = 30, HP = Math.PI / 2 - 0.03;
  const fr = L.rng('s14weave'), g = B.cg;
  g.save(); trace(g, out); g.clip();
  // some strips took the pigment darker, some went ochre with age
  for (let i = -9; i <= 3; i++) for (let j = -3; j <= 9; j++) {
    const roll = fr();
    if (roll > 0.4) continue;
    const c0 = (i + 0.3) * PITCH, c1 = c0 + PITCH, d0 = (j + 0.1) * PITCH, d1 = d0 + PITCH;
    const cor = [[c0, d0], [c1, d0], [c1, d1], [c0, d1]].map(([c, d]) => [(c + d) / 2, ((d - c) * RISE) / 2]);
    if (cor.some(([ph, sv]) => Math.abs(ph) > HP || sv < S0 - 8 || sv > ST)) continue;
    g.globalAlpha = roll < 0.14 ? 0.42 : 0.24; g.fillStyle = roll < 0.14 ? PIG.ochre[0] : PIG.yellow[1];
    g.beginPath(); cor.forEach(([ph, sv], q) => { const p = Q(ph, sv); if (q) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath(); g.fill();
  }
  // both flanks turn away from the lamp
  g.globalAlpha = 1;
  const pl = Pb(-hw(100), 100), pr = Pb(hw(100), 100);
  g.fillStyle = L.linear(g, pl[0], pl[1], pr[0], pr[1], [[0, L.rgba(PIG.yellow[1], 0.62)], [0.3, L.rgba(PIG.yellow[1], 0)], [0.7, L.rgba(PIG.yellow[1], 0)], [1, L.rgba(PIG.ochre[1], 0.46)]]);
  g.fillRect(O[0] - 500, O[1] - 700, 1000, 900);
  g.restore();
  ink(B, left, 6.8); ink(B, right, 6.8); ink(B, bottom, 7.4);
  for (const dir of [1, -1]) for (let i = -9; i <= 9; i++) {
    const c = (i + (dir > 0 ? 0.3 : 0.1)) * PITCH, pts = [];
    for (let sv = S0; sv <= ST; sv += 22) { const ph = c + (dir * sv) / RISE; if (Math.abs(ph) <= HP) pts.push(Q(ph, sv)); }
    if (pts.length >= 2) ink(B, pts, 4.6, { taper: [0.02, 0.02], jit: 1 });
  }
  // the foot hoop, lashed on with cane
  ink(B, [-1, -0.5, 0, 0.5, 1].map((f) => Pb(f * hw(S0), S0 + sag(f))), 6, { taper: [0.02, 0.02] });
  for (let v = -88; v <= 90; v += 44) ink(B, [Pb(v, S0 - 2 + sag(v / 112)), Pb(v + 13, -8 + (v * v) / 1500)], 3.8, { taper: [0.05, 0.2] });
}

function drawLeaf(B, base, ang, len, wid, bend, pig) {
  const mid = [base]; let a2 = ang, p = base;
  for (let i = 0; i < 6; i++) { p = [p[0] + (Math.cos(a2) * len) / 6, p[1] + (Math.sin(a2) * len) / 6]; a2 += bend / 6; mid.push(p); }
  const Ls = [], Rs = [];
  mid.forEach((q, i) => {
    const t = i / 6, w = (wid / 2) * 2.75 * Math.pow(t, 0.6) * Math.pow(1 - t, 0.9);
    const d = unit(mid[Math.max(0, i - 1)], mid[Math.min(6, i + 1)]);
    Ls.push([q[0] - d[1] * w, q[1] + d[0] * w]); Rs.push([q[0] + d[1] * w, q[1] - d[0] * w]);
  });
  part(B, [Ls, Rs.slice().reverse()], pig, { amp: 1.8, pool: 0.36 });
  ink(B, Ls, 4, { taper: [0.02, 0.08], jit: 0.9 }); ink(B, Rs, 4, { taper: [0.02, 0.08], jit: 0.9 });
  ink(B, mid.slice(0, 6), 3.2, { taper: [0.02, 0.5], jit: 0.8 });
}
/** a sprig hanging out of the basket: stem first, then its leaves from the top down so the lower ones lie on top */
function drawSprig(B, pts, leaves, sway) {
  const st = L.smoothPath(pts, 6);
  ink(B, pts, 4.4, { taper: [0.02, 0.2] });
  for (const [t, side, len, wid, tw, yel] of leaves) {
    const i = Math.min(st.length - 2, Math.floor(t * (st.length - 1))), d = unit(st[i], st[i + 1]);
    const a0 = Math.atan2(d[1], d[0]) + side * tw + sway * 0.16;
    drawLeaf(B, st[i], a0, len, wid, (Math.PI / 2 - a0) * 0.55, yel ? [L.mix(PIG.green[0], PIG.yellow[0], 0.55), PIG.green[1]] : PIG.green);
  }
}

/** 药锄: short wooden handle, narrow iron blade; it hangs head-down on a cord and swings as he walks */
function drawHoe(B, pv, psi) {
  const d = [-Math.sin(psi), Math.cos(psi)], n = frontOf(d);
  const T0 = add(pv, d, 84), q = (t, v) => at(T0, d, n, t, v);
  ink(B, [pv, q(-30, 2), q(4, 0)], 3.4, { taper: [0, 0], jit: 0.6 });                       // the cord
  const hl = [q(0, -9), q(120, -10), q(250, -12)], hr = [q(250, 12), q(120, 10), q(0, 9)];
  part(B, [hl, [q(250, -12), q(250, 12)], hr, [q(0, 9), q(-7, 0), q(0, -9)]], PIG.wood, { pool: 0.5, amp: 1.2 });
  ink(B, hl, 5.6); ink(B, hr, 5.6); ink(B, [q(0, 9), q(-7, 0), q(0, -9)], 5, { taper: [0, 0] }); ink(B, [q(250, -12), q(250, 12)], 5, { taper: [0, 0] });
  ink(B, [q(40, 2), q(120, -2), q(190, 3)], 2.8, { taper: [0.1, 0.5] });                    // one line of grain
  for (const t of [12, 20, 28]) ink(B, [q(t, -11), q(t + 3, 11)], 3.2, { taper: [0, 0], jit: 0.5 });
  // the iron head: eye round the handle, blade drawn back toward the hand like a small mattock, a stub of a poll behind
  const top = [q(203, 15), q(200, -16), q(192, -62), q(178, -106), q(160, -134)];
  const edge = [q(160, -134), q(190, -104), q(215, -60), q(232, -16), q(233, 15)];
  const poll = [q(233, 15), q(232, 36), q(205, 36), q(203, 15)];
  const head = chain([top, edge, poll]);
  knock(B, head); solid(B, head);
  reserve(B, [q(204, -20), q(197, -62), q(184, -100)], 3.2, 0.8);
  reserve(B, [q(208, 6), q(228, 6)], 2.4, 0.6);
}

function buildCel(env, k, tex) {
  const a = env.arc, P = POSES[k], hx = HX[k] / FS, sw = P.sw;
  const gy = (x) => a.yAt(x * FS) / FS, hy = gy(hx) - P.hh;      // the ridge, in figure units
  const x0 = Math.round(HX[k] - CEL_L * FS), y0 = -PAD, cw = Math.ceil(CEL_W * FS);
  const cc = L.makeCanvas(cw, CEL_H), ic = L.makeCanvas(cw, CEL_H);
  const cg = cc.getContext('2d'), ig = ic.getContext('2d');
  cg.translate(-x0, -y0); cg.scale(FS, FS); ig.translate(-x0, -y0); ig.scale(FS, FS);
  const B = { cg, ig, r: L.rng('s14jit' + k), seed: 's14k' + k + '_', n: 0 };

  const solve = (Hp, spec) => {
    const ax = hx + spec[0], ang = Math.atan2(gy(ax + 40) - gy(ax - 40), 80) - spec[1];
    const c = Math.cos(ang), s = Math.sin(ang);
    let ay = 1e9;
    for (const [x, y] of SOLE) ay = Math.min(ay, gy(ax + x * c - y * s) - (x * s + y * c));
    const A = [ax, ay - spec[2]];
    return { H: Hp, A, K: knee(Hp, A), ang };
  };
  const GN = solve([hx + 4, hy], P.n), GF = solve([hx - 8, hy - 2], P.f);

  // back to front: hoe · basket · herbs · far leg · near leg · tunic
  drawHoe(B, [hx - 418, TOP - 20 + (hy + 60) * 0.5], 0.09 + 0.08 * sw);
  const O = [hx - 232, hy + 158 - 5 * sw];
  drawBasket(B, O, 0.06 + 0.014 * sw);
  const up = (v, s) => [O[0] + v + 0.06 * s, O[1] - s];
  drawSprig(B, [up(-54, 420), up(-70, 250), up(-92 - 10 * sw, 120), up(-128 - 26 * sw, 10)],
    [[0.52, -1, 116, 46, 0.8, 0], [0.66, 1, 124, 48, 0.7, 0], [0.8, -1, 112, 44, 0.75, 1], [0.99, -1, 122, 42, 0.1, 0]], sw);
  drawSprig(B, [up(30, 420), up(22, 260), up(30 - 8 * sw, 130), up(8 - 22 * sw, 40)],
    [[0.5, 1, 112, 46, 0.75, 0], [0.66, -1, 120, 46, 0.8, 1], [0.82, 1, 116, 46, 0.7, 0], [0.99, -1, 126, 44, 0.05, 0]], sw);
  drawLeg(B, GF, true, sw);
  drawLeg(B, GN, false, sw);
  drawTunic(B, hx, hy, GN, GF, sw);

  // pigment granulation / starved ink, then press the ink onto the colour
  cg.setTransform(1, 0, 0, 1, 0, 0); cg.globalCompositeOperation = 'destination-out';
  cg.drawImage(tex.gran, -((k * 173) % 400), -((k * 97) % 300));
  ig.setTransform(1, 0, 0, 1, 0, 0); ig.globalCompositeOperation = 'destination-out';
  ig.fillStyle = ig.createPattern(tex.pin, 'repeat'); ig.translate(k * 61, k * 37); ig.fillRect(-400, -300, cw + 400, CEL_H + 300);
  const out = L.makeCanvas(cw, CEL_H), og = out.getContext('2d');
  og.filter = 'blur(0.7px)'; og.drawImage(cc, 0, 0);
  og.globalCompositeOperation = 'multiply';
  og.filter = 'blur(3px)'; og.globalAlpha = 0.32; og.drawImage(ic, 0, 0);     // ink soaking a little way into the paper
  og.filter = 'blur(0.5px)'; og.globalAlpha = 1; og.drawImage(ic, 0, 0);
  og.filter = 'none'; og.globalCompositeOperation = 'source-over';
  // shallow focus: sharp on the ridge, a touch soft toward the top of the frame
  const soft = L.blurred(out, 2.6), sg = soft.getContext('2d');
  const mask = (g) => L.radial(g, a.cx - x0, a.cy - y0, a.R + 200, a.R + 620, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = mask(sg); sg.fillRect(0, 0, cw, CEL_H);
  og.globalCompositeOperation = 'destination-out'; og.fillStyle = mask(og); og.fillRect(0, 0, cw, CEL_H);
  og.globalCompositeOperation = 'lighter'; og.drawImage(soft, 0, 0);
  return { img: out, x0, y0 };
}

// ───────────────────────── the sheet ─────────────────────────
function tide(g, cx, cy, rx, ry, seed, strength = 1) {
  const nz = L.makeNoise(seed), pts = [];
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * L.TAU, k = 1 + 0.34 * nz.fbm(Math.cos(t) * 0.9 + 5, Math.sin(t) * 0.9, 2) + 0.05 * nz.n2(Math.cos(t) * 3.2, Math.sin(t) * 3.2);
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  g.save();
  trace(g, pts); g.fillStyle = L.rgba('#b98a44', 0.06 * strength); g.fill(); g.clip();
  g.strokeStyle = '#a06c2a'; g.lineJoin = 'round';
  for (const [lw, al] of [[70, 0.03], [30, 0.05], [12, 0.08], [4.5, 0.13]]) { g.lineWidth = lw; g.globalAlpha = al * strength; g.stroke(); }
  g.restore();
}
function crease(g, x0, y0, x1, y1, seed) {
  const nz = L.makeNoise(seed), n = 70, len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const pt = (t, o) => { const w = 1.8 * nz.n2(t * 9, 7.7) + o; return [L.lerp(x0, x1, t) + nx * w, L.lerp(y0, y1, t) + ny * w]; };
  const seg = (t0, t1, o, style, lw) => { const p = pt(t0, o), q = pt(t1, o); g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1.2) / n, k = L.clamp(0.5 + 0.7 * nz.n2(i * 0.23, 2.2));
    seg(t0, t1, 0, `rgba(255,249,228,${(0.14 * k).toFixed(3)})`, 12);        // the fibres are rubbed pale along the fold
    seg(t0, t1, -1.4, `rgba(255,251,236,${(0.15 + 0.4 * k).toFixed(3)})`, 1.7);
    seg(t0, t1, 1.3, `rgba(98,66,28,${(0.1 + 0.26 * k).toFixed(3)})`, 1.5);
  }
  g.restore();
}
function foxing(g) {
  const r = L.rng('s14fox');
  const clusters = [[250, 930, 190], [1700, 960, 210], [1180, 1010, 170], [640, 880, 150], [1840, 300, 150]];
  for (let i = 0; i < 40; i++) {
    let x, y;
    if (r.chance(0.78)) { const c = r.pick(clusters); x = c[0] + r.gauss() * c[2]; y = c[1] + r.gauss() * c[2] * 0.7; } else { x = r.range(-PAD, W + PAD); y = r.range(-PAD, H + PAD); }
    const big = r.chance(0.12), rad = big ? r.range(16, 30) : r.range(3, 11), al = r.range(0.1, 0.34) * (big ? 0.45 : 1);
    for (let j = 0; j < 3; j++) {
      const ox = r.gauss() * rad * 0.35, oy = r.gauss() * rad * 0.35, rr = rad * r.range(0.6, 1);
      g.fillStyle = L.radial(g, x + ox, y + oy, 0, rr, [[0, L.rgba('#a2622a', al)], [0.55, L.rgba('#a86c30', al * 0.6)], [1, L.rgba('#a86c30', 0)]]);
      g.beginPath(); g.arc(x + ox, y + oy, rr, 0, L.TAU); g.fill();
    }
  }
}

/** the printed-and-coloured hillside: returns [wash layer, ink layer], both to be multiplied onto the paper */
function buildHill(env, tex) {
  const a = env.arc, s = a.span(PAD + 90), N = 170;
  const nz = L.makeNoise('s14hill'), r = L.rng('s14hill');
  const thick = (th) => 150 + 13 * nz.fbm((th * a.R) / 330, 8.4, 2) - 30 * Math.pow(Math.abs(th) / s, 1.5);
  const topPts = [], botPts = [];
  for (let i = 0; i <= N; i++) {
    const th = L.lerp(-s, s, i / N), u = th * a.R;
    const p = a.pt(th, 2 + 5 * nz.fbm(u / 230, 3.1, 2)); topPts.push([p.x, p.y]);                 // the brush never quite keeps to the printed line
    const q = a.pt(th, -thick(th) + 8 * nz.fbm(u / 120, 5.5, 2) + 3 * nz.n2(u / 26, 1.3)); botPts.push([q.x, q.y]);
  }
  const band = topPts.concat(botPts.slice().reverse());
  const wl = L.makeLayer(PAD, (g) => {
    trace(g, band); g.globalAlpha = 0.96; g.fillStyle = PIG.green[0]; g.fill();
    g.save(); g.clip(); g.globalAlpha = 1;
    // the brush was loaded heavier along the foot of the slope
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 170, a.R - 40, [[0, L.rgba(PIG.green[1], 0.55)], [0.42, L.rgba(PIG.green[1], 0.26)], [0.7, L.rgba(PIG.green[1], 0.06)], [1, L.rgba(PIG.green[1], 0)]]);
    g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.strokeStyle = PIG.green[1]; g.lineJoin = 'round';
    g.globalAlpha = 0.15; g.lineWidth = 26; g.stroke(); g.globalAlpha = 0.28; g.lineWidth = 8; g.stroke();
    g.restore();
  });
  const wg = wl.getContext('2d');
  // long brush drags following the slope, then granulation; a few pale blooms where water ran back in
  wg.save(); wg.setTransform(1, 0, 0, 1, 0, 0); wg.globalCompositeOperation = 'destination-out';
  wg.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's14drag', scale: 30, sx: 11, sy: 0.6, octaves: 3, res: 0.4, contrast: 1.6, ramp: [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.04)'], [1, 'rgba(0,0,0,0.4)']] }), 0, 0);
  wg.drawImage(tex.base, 0, 0);
  wg.restore();
  wg.save(); wg.globalCompositeOperation = 'destination-out';
  for (const [th, dr, rad, al] of [[-0.27, -62, 120, 0.3], [-0.07, -48, 90, 0.2], [0.14, -74, 140, 0.3], [0.31, -52, 100, 0.26]]) {
    const p = a.pt(th, dr);
    wg.fillStyle = L.radial(wg, p.x, p.y, 0, rad, [[0, `rgba(0,0,0,${al})`], [0.7, `rgba(0,0,0,${al * 0.5})`], [1, 'rgba(0,0,0,0)']]);
    wg.save(); wg.translate(p.x, p.y); wg.rotate(th); wg.scale(1.9, 0.5); wg.translate(-p.x, -p.y); wg.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2); wg.restore();
  }
  wg.restore();
  // wet edge: the wash feathers a few px into the paper
  const feather = L.blurred(wl, 4.5);
  wg.save(); wg.setTransform(1, 0, 0, 1, 0, 0); wg.globalCompositeOperation = 'destination-over'; wg.globalAlpha = 0.55; wg.drawImage(feather, 0, 0); wg.restore();

  // deep-green brush work, on its own sheet so the dry-brush scratches don't bite into the wash
  const dl = L.makeLayer(PAD, (g) => {
    const lineAt = (t0, t1, off, n) => { const o = []; for (let i = 0; i <= n; i++) { const th = L.lerp(t0, t1, i / n); const p = a.pt(th, -thick(th) + 24 + off + 3 * nz.n2(th * 40, 1.7)); o.push([p.x, p.y]); } return o; };
    // the line pressed along the lower edge: four loads of the brush, overlapping where it was re-charged
    [[-s, -0.185], [-0.2, 0.07], [0.058, 0.262], [0.25, s]].forEach(([t0, t1], i) => {
      L.inkStroke(g, lineAt(t0, t1, r.range(-2, 2), 16), { width: 13, color: DEEP, seed: 's14deep' + i, taper: [0.03, 0.08], wobble: 0.5, dry: 0.3, smoothStep: 5 });
    });
    // grass: a few fans of short strokes flicked up the slope
    for (const [th0, dr0, sc] of [[-0.335, -70, 1.05], [-0.212, -84, 0.9], [-0.118, -62, 1.1], [0.018, -88, 0.95], [0.105, -60, 1], [0.228, -80, 1.1], [0.325, -66, 0.9]]) {
      const n = r.int(3, 4);
      for (let i = 0; i < n; i++) {
        const lean = L.lerp(-0.55, 0.75, (i + r.range(-0.2, 0.2)) / (n - 1)), len = sc * r.range(34, 50);
        const b = a.pt(th0 + ((i - (n - 1) / 2) * 13 * sc) / a.R, dr0 + r.range(-3, 3)), ang = -Math.PI / 2 + lean + th0;
        const pts = [[b.x, b.y], [b.x + Math.cos(ang - 0.12) * len * 0.5, b.y + Math.sin(ang - 0.12) * len * 0.5], [b.x + Math.cos(ang + 0.1) * len, b.y + Math.sin(ang + 0.1) * len]];
        L.inkStroke(g, pts, { width: sc * r.range(6, 8), color: DEEP, seed: 's14cun' + th0 + '_' + i, taper: [0.02, 0.8], wobble: 0.35, alpha: r.range(0.6, 0.9) });
      }
    }
  });
  wg.save(); wg.setTransform(1, 0, 0, 1, 0, 0); wg.globalCompositeOperation = 'multiply'; wg.filter = 'blur(0.6px)'; wg.drawImage(dl, 0, 0); wg.restore();

  // the printed key line of the ridge — this is THE arc — and a few tufts of grass
  const il = L.makeLayer(PAD, (g) => {
    const ridge = (t0, t1, n) => { const o = []; for (let i = 0; i <= n; i++) { const p = a.pt(L.lerp(t0, t1, i / n), -1.6 + r.range(-0.7, 0.7)); o.push([p.x, p.y]); } return o; };
    [[-s, -0.128], [-0.133, 0.212], [0.206, s]].forEach(([t0, t1], i) => {
      L.inkStroke(g, ridge(t0, t1, 22), { width: 9.6, color: INK, seed: 's14ridge' + i, taper: [0.012, 0.02], wobble: 0.3, smoothStep: 5 });
    });
    for (const [x, sc] of [[196, 1.9], [452, 1.45], [1492, 1.6], [1752, 2.05]]) {
      const th = a.thetaAtX(x), n = r.int(4, 6);
      for (let i = 0; i < n; i++) {
        const lean = L.lerp(-0.8, 0.8, (i + r.range(-0.3, 0.3)) / (n - 1)) + 0.16;
        const len = sc * r.range(36, 66) * (1 - 0.35 * Math.abs(lean));
        const b = a.pt(th + ((i - (n - 1) / 2) * 9 * sc) / a.R, -9), bend = r.range(-0.3, 0.3) + lean * 0.6;
        const pts = [[b.x, b.y]]; let ang = -Math.PI / 2 + lean + th, px = b.x, py = b.y;
        for (let q = 0; q < 3; q++) { px += (Math.cos(ang) * len) / 3; py += (Math.sin(ang) * len) / 3; ang += bend / 3; pts.push([px, py]); }
        L.inkStroke(g, pts, { width: sc * r.range(4.6, 6.4), color: i % 3 === 1 ? INK : DEEP, seed: 's14tuft' + x + '_' + i, taper: [0, 0.85], wobble: 0.25 });
      }
    }
  });
  const ig = il.getContext('2d');
  ig.save(); ig.setTransform(1, 0, 0, 1, 0, 0); ig.globalCompositeOperation = 'destination-out';
  ig.fillStyle = ig.createPattern(tex.pin, 'repeat'); ig.fillRect(0, 0, il.width, il.height); ig.restore();
  return [wl, il];
}

function buildPage(env, tex) {
  const a = env.arc, w = W + PAD * 2, h = H + PAD * 2;
  const full = (g) => g.fillRect(-PAD, -PAD, w, h);
  const page = L.makeLayer(PAD, (g) => {
    g.drawImage(L.paperTex(w, h, { base: '#eddfb5', seed: 's14paper', tone: '#b0863e', fiber: 0.6, stain: 0.24, grain: 0.17 }), -PAD, -PAD);
    // long fibres and the odd fleck of bark caught in the pulp
    const r = L.rng('s14fibre'); g.lineCap = 'round';
    for (let i = 0; i < 220; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(50, 190), an = r.range(0, Math.PI), cv = r.range(-0.5, 0.5);
      g.strokeStyle = r.chance(0.55) ? L.rgba('#fff8e2', r.range(0.1, 0.3)) : L.rgba('#8a6430', r.range(0.05, 0.16));
      g.lineWidth = r.range(0.6, 1.7);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an + cv) * len * 0.5, y + Math.sin(an + cv) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
    }
    L.speckle(g, { seed: 's14fleck', count: 340, x: -PAD, y: -PAD, w, h, rMin: 0.6, rMax: 2.6, colors: ['#7a5424', '#9a7436', '#5e3f1a'], alpha: [0.1, 0.5], squash: 0.6 });
    // laid lines of the papermaker's screen, barely there
    g.strokeStyle = 'rgba(120,88,40,0.045)'; g.lineWidth = 1.2;
    g.beginPath(); for (let y = -PAD; y < H + PAD; y += 7) { g.moveTo(-PAD, y + 0.5); g.lineTo(W + PAD, y + 3.5); } g.stroke();
    // old water stains with their tide lines
  });
  // old water stains with their tide lines — under the hill only; the sheet above it is left clean
  const stains = L.makeLayer(PAD, (c) => {
    tide(c, 1610, 1075, 500, 250, 's14tideA', 1);
    tide(c, 190, 1120, 380, 210, 's14tideB', 0.8);
  });
  const g = page.getContext('2d');
  g.save(); g.filter = 'blur(1.6px)'; g.drawImage(stains, -PAD, -PAD); g.restore();
  const [wl, il] = buildHill(env, tex);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(wl, -PAD, -PAD);
  g.save(); g.globalAlpha = 0.3; g.filter = 'blur(3px)'; g.drawImage(il, -PAD, -PAD); g.restore();
  g.save(); g.filter = 'blur(0.5px)'; g.drawImage(il, -PAD, -PAD); g.restore();
  g.globalCompositeOperation = 'source-over';
  // the sheet was folded in four once; the folds have rubbed the colour thin where they cross the hill
  crease(g, -PAD, 906, W + PAD, 890, 's14foldH');
  crease(g, 1490, -PAD, 1506, H + PAD, 's14foldV');
  g.globalCompositeOperation = 'multiply'; foxing(g);
  // warm lamp from the upper left: the sheet falls off toward the right and the lower corners; it also cockles a little
  g.fillStyle = L.radial(g, 780, 400, 260, 1500, [[0, '#ffffff'], [0.5, '#f8f0dc'], [1, '#e2d0a4']]); full(g);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.22;
  const cockle = L.bumpLight(L.noiseTex(w, h, { seed: 's14cockle', scale: 420, octaves: 3, res: 0.12, sx: 1.6 }), { angle: 45, strength: 9, res: 0.2 });
  g.drawImage(cockle, -PAD, -PAD);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // shallow focus: sharp along the ridge, softening toward the top, the bottom and the two ends
  const soft = L.blurred(page, 3.4), sg = soft.getContext('2d');
  const m = L.makeLayer(PAD, (c) => {
    c.fillStyle = L.radial(c, a.cx, a.cy, a.R - 640, a.R + 640, [[0, 'rgba(0,0,0,1)'], [0.32, 'rgba(0,0,0,0)'], [0.66, 'rgba(0,0,0,0)'], [0.97, 'rgba(0,0,0,1)']]); full(c);
    c.fillStyle = L.linear(c, -PAD, 0, W + PAD, 0, [[0, 'rgba(0,0,0,0.8)'], [0.17, 'rgba(0,0,0,0)'], [0.83, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.8)']]); full(c);
  });
  sg.globalCompositeOperation = 'destination-in'; sg.drawImage(m, 0, 0);
  g.drawImage(soft, -PAD, -PAD);
  return page;
}

function buildTextures() {
  const w = W + PAD * 2, h = H + PAD * 2, T = 'rgba(0,0,0,0)';
  // alpha in these is what gets taken OUT of a wash (the paper shows through where the colour lies thin):
  // the uneven load of the brush + the grain of the pigment in the paper's tooth …
  const base = L.makeCanvas(w, h), bg = base.getContext('2d');
  bg.drawImage(L.noiseTex(w, h, { seed: 's14load', scale: 190, octaves: 3, res: 0.2, contrast: 1.6, ramp: [[0, T], [0.48, 'rgba(0,0,0,0.03)'], [1, 'rgba(0,0,0,0.3)']] }), 0, 0);
  bg.drawImage(L.noiseTex(w, h, { seed: 's14gran', scale: 6, octaves: 2, res: 0.6, contrast: 1.7, ramp: [[0, T], [0.56, T], [1, 'rgba(0,0,0,0.17)']] }), 0, 0);
  // … and, on the figure, the drag of the bristles (the colourist pulls the brush down to the left)
  const gran = L.makeCanvas(w, h), gg = gran.getContext('2d'), dw = Math.ceil(Math.hypot(w, h));
  gg.drawImage(base, 0, 0);
  const drag = L.noiseTex(dw, dw, { seed: 's14bristle', scale: 20, sx: 11, sy: 0.5, octaves: 3, res: 0.4, contrast: 1.7, ramp: [[0, T], [0.56, 'rgba(0,0,0,0.02)'], [1, 'rgba(0,0,0,0.3)']] });
  gg.translate(w / 2, h / 2); gg.rotate(-0.95); gg.drawImage(drag, -dw / 2, -dw / 2);
  // the odd void and starved patch in the printed line
  const pin = L.noiseTex(900, 700, { seed: 's14pin', scale: 6, octaves: 2, res: 0.6, contrast: 2.1, ramp: [[0, T], [0.76, T], [0.9, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0.85)']] });
  return { base, gran, pin };
}

// per-drawing gate weave of the sheet under the rostrum camera: [dx, dy, rotation, exposure]
const SHAKE = [[0, 0, 0, 0], [1.3, -0.8, 0.0005, 0.012], [-0.9, 0.7, -0.0004, -0.01], [0.7, 1.1, 0.0003, 0.008], [-1.2, -0.5, -0.0005, -0.006]];

export default {
  name: '采药图',
  tone: 'dark',
  init(env) {
    const tex = buildTextures();
    const page = buildPage(env, tex);
    const cels = [];
    for (let k = 0; k < POSES.length; k++) cels.push(buildCel(env, k, tex));
    S = { page, cels };
  },
  draw(ctx, env, p) {
    const a = env.arc, n = env.frames || 15;
    const f = env.frame === undefined ? Math.round(p * (n - 1)) : env.frame;
    const k = Math.min(POSES.length - 1, Math.floor((f * POSES.length) / n));
    const [jx, jy, jr, ex] = SHAKE[k], zoom = 1 + 0.012 * p;
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(a.cx + jx, a.crestY + jy); ctx.rotate(jr); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
    ctx.drawImage(S.page, -PAD, -PAD);
    ctx.globalCompositeOperation = 'multiply';
    const c = S.cels[k]; ctx.drawImage(c.img, c.x0, c.y0);
    ctx.restore();
    // the lamp flickers a hair between exposures
    if (ex) { ctx.fillStyle = ex > 0 ? `rgba(255,246,220,${ex})` : `rgba(60,40,10,${-ex})`; ctx.fillRect(0, 0, W, H); }
  },
};
