// s02 — 一串铜钱. Macro of a string of cash (一贯): square-holed coins threaded on a hemp cord, seen from the side.
// The roll of coins is a tube lying under the arc and its outer limb IS the arc. Every coin stands on edge across the
// cord, so along the limb the lens meets one rim (钱缘) after another: narrow, thick slips of brass with worn round
// corners, rubbed-bright arrises and a dark seam between neighbours — a row of beads. Below the limb the same rims turn
// toward the lens and drift out of focus; the lights of the studio are mirrored at the same height on every coin, so they
// line up as honey-coloured bands concentric with the arc, bright and dark by turns, sinking into brown toward the bottom.
// So that the roll reads as COINS at a glance, the string has gone slack right of the crest: both halves lean in toward
// that spot, and the first coins of the right half have swung round on the cord like a fanned deck. The first of them shows
// its back (光背: outer rim, plain field, inner rim, square hole — no inscription anywhere) with the hemp cord running
// through the hole; behind it the rims of the next ones curve away as arcs of an ellipse.
//
// Nothing is drawn with paths: every pixel under the arc is ray-cast in init(). A pixel is mapped into "string space"
// (s along the arc, d below it), the coins it could meet are intersected analytically (rim cylinders with a rounded edge
// profile, the turned faces as planes with a relief that is ray-marched, the hole, the cord), the fragments are sorted
// by depth and composited with analytic coverage, and each visible fragment is shaded: a height field (casting skin,
// filing marks round the rim, pores, knocks) bends the normal, the mirrored ray looks up a small painted studio, and
// the patina decides how much of that mirror survives. Depth of field, bloom and the travelling glint come afterwards.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 64;                     // the string only slides ±20 px, a small margin is enough
const A0 = 320;                     // mean coin radius on screen (px): a coin about nine times as wide as it is thick
const HERO_S = 150;                 // where the top of the turned coin sits along the arc (px right of the crest)
const HERO_YAW = 36;                // how far it has swung round (degrees)
const RELIEF = 9, BEV = 7;          // a face: how far the field lies below the rims, and the width of the slope between them
const AMAX = 2.5, QMIN = Math.cos(AMAX);
const NP = 512, NT = 96, PMAX = 4.5, PK = (NP - 1) / PMAX;   // the painted studio: NP steps over the elevation ψ of the mirrored ray, NT across
const DOF_Z0 = 185, DOF_Z1 = 338, DOF_MAX = 5.2;             // blur (px) as a function of the distance from the plane of focus
const T_RIM = 1, T_FACE = 2, T_WALL = 3, T_CORD = 4, T_SEAM = 5;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// the string, left to right: [thickness px, kind, top (px below the arc), edge profile, lean, yaw°]
// kinds: B rubbed bright brass · H honey-toned · C chocolate patina · R redder alloy · G chocolate with verdigris
// lean > 0: the foot of the coin swings to the right. The left half leans toward the slack spot, the right half too.
const LEFT = [
  [74, 'H', 2, 'soft', -0.105], [62, 'C', 4, 'round', -0.115], [82, 'B', -1, 'round', -0.12], [60, 'H', 2, 'flat', -0.13],
  [72, 'R', 0, 'soft', -0.125], [66, 'G', 5, 'round', -0.16], [84, 'H', -2, 'round', -0.15], [58, 'B', 3, 'soft', -0.14],
  [70, 'H', 0, 'round', -0.135], [78, 'C', -1, 'flat', -0.13], [62, 'B', 4, 'round', -0.1], [80, 'H', -2, 'soft', -0.115],
  [66, 'B', 1, 'round', -0.135], [72, 'H', 2, 'soft', -0.155], [60, 'C', 3, 'round', -0.175], [70, 'B', -1, 'round', -0.2],
];
// — the string is slack here: these have swung round on the cord —
const FAN = [[66, 'H', -2, 'soft', 0.18, HERO_YAW], [70, 'B', 1, 'round', 0.17, 22], [62, 'H', 0, 'soft', 0.16, 11], [76, 'C', 2, 'round', 0.15, 4]];
const RIGHT = [
  [68, 'B', 0, 'round', 0.14], [80, 'H', -2, 'soft', 0.13], [60, 'G', 4, 'round', 0.135], [74, 'B', 1, 'flat', 0.11], [66, 'H', 2, 'round', 0.12],
  [84, 'C', -1, 'soft', 0.13], [62, 'B', 3, 'round', 0.1], [72, 'R', 0, 'soft', 0.105], [78, 'H', 1, 'round', 0.11], [64, 'B', 2, 'soft', 0.1],
];
const KIND = {
  B: { pat: 0.12, pv: 0.22, rough: 0.1, wear: 0.15, tint: [1.0, 0.78, 0.32], file: 0.9, lump: 0.7 },
  H: { pat: 0.44, pv: 0.32, rough: 0.16, wear: 0.38, tint: [1.0, 0.74, 0.27], file: 1.0, lump: 0.9 },
  C: { pat: 0.86, pv: 0.22, rough: 0.22, wear: 0.8, tint: [1.0, 0.74, 0.28], file: 0.6, lump: 1.1 },
  R: { pat: 0.36, pv: 0.3, rough: 0.14, wear: 0.34, tint: [1.0, 0.68, 0.24], file: 0.8, lump: 0.8 },
  G: { pat: 0.74, pv: 0.26, rough: 0.22, wear: 0.62, tint: [1.0, 0.74, 0.28], file: 0.6, lump: 1.1, verd: 0.3 },
};
// corner of the rim as fractions of the thickness: [rw min, rw max, rh min, rh max]
const SHAPE = { round: [0.36, 0.44, 0.22, 0.3], soft: [0.27, 0.35, 0.16, 0.23], flat: [0.17, 0.24, 0.09, 0.14] };

// ── allocation-free noise ──
// worley: squared distance in cD1, cell id in cId, offset from the feature point in cPx / cPy
let cD1 = 0, cId = 0, cPx = 0, cPy = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, id = 0, px = 0, py = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = x - cx - (h & 1023) / 1023, dy = y - cy - ((h >>> 10) & 1023) / 1023, d = dx * dx + dy * dy;
    if (d < d1) { d1 = d; id = ((h >>> 20) & 255) / 255; px = dx; py = dy; }
  }
  cD1 = d1; cId = id; cPx = px; cPy = py;
}
// gradient noise with analytic derivatives: value in gV (about ±1), slopes in gX / gY
const G16X = new Float32Array(16), G16Y = new Float32Array(16);
for (let i = 0; i < 16; i++) { const a = ((i + 0.37) * TAU) / 16; G16X[i] = Math.cos(a); G16Y[i] = Math.sin(a); }
let gV = 0, gX = 0, gY = 0;
function gn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const hx0 = Math.imul(xi, 374761393), hx1 = Math.imul(xi + 1, 374761393), hy0 = Math.imul(yi, 668265263), hy1 = Math.imul(yi + 1, 668265263);
  let h = (hx0 + hy0) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); const i00 = (h ^ (h >>> 16)) & 15;
  h = (hx1 + hy0) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); const i10 = (h ^ (h >>> 16)) & 15;
  h = (hx0 + hy1) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); const i01 = (h ^ (h >>> 16)) & 15;
  h = (hx1 + hy1) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); const i11 = (h ^ (h >>> 16)) & 15;
  const ax = G16X[i00], ay = G16Y[i00], bx = G16X[i10], by = G16Y[i10], cx = G16X[i01], cy = G16Y[i01], dx = G16X[i11], dy = G16Y[i11];
  const a = ax * fx + ay * fy, b = bx * (fx - 1) + by * fy, c = cx * fx + cy * (fy - 1), d = dx * (fx - 1) + dy * (fy - 1), k = a - b - c + d;
  gV = (a + ux * (b - a) + uy * (c - a) + ux * uy * k) * 1.5;
  gX = (ax + ux * (bx - ax) + uy * (cx - ax) + ux * uy * (ax - bx - cx + dx) + dux * (b - a + uy * k)) * 1.5;
  gY = (ay + ux * (by - ay) + uy * (cy - ay) + ux * uy * (ay - by - cy + dy) + duy * (c - a + ux * k)) * 1.5;
}

/** piecewise-linear scalar profile from [[x, v], …] */
function pl(stops) {
  return (x) => {
    if (x <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) { const a = stops[i - 1], b = stops[i]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]); }
    return stops[stops.length - 1][1];
  };
}

/**
 * What the brass mirrors. Rows: ψ = elevation of the mirrored ray (0° = straight behind the string, 90° = overhead,
 * 180° = the lens, beyond that the table; on a plain rim ψ = 2α, α being the angle round the rim from its top).
 * Columns: how far the ray leans left/right. `sharp` is the studio itself, `rough` the same studio in a matte surface.
 * The lights are stacked so that a rim shows, from the limb down: a lit cap · a dark line · the broad key (a soft box
 * with one glazing bar) · dark · a fill above the lens · the dark lens itself · a dim warm bounce off the table.
 */
function makeEnv() {
  const sharp = new Float32Array(NP * NT * 3), rough = new Float32Array(NP * NT * 3), tmp = new Float32Array(NP * NT * 3);
  const box = (v, a, b, e) => sstep(a - e, a + e, v) * (1 - sstep(b - e, b + e, v));
  const back = pl([[0, 1.5], [6, 2.2], [24, 2.45], [33, 1.7], [41, 0.55], [49, 0.14], [60, 0]]);
  for (let ip = 0; ip < NP; ip++) {
    const pd = ((ip / (NP - 1)) * PMAX * 180) / Math.PI;
    const bk = back(pd), keyP = box(pd, 63, 111, 3.5) * (1 - 0.5 * Math.exp(-(((pd - 91) / 1.7) ** 2))), fillP = box(pd, 135, 160, 5),
      lowP = box(pd, 205, 246, 9), kickP = box(pd, 40, 125, 14);
    for (let it = 0; it < NT; it++) {
      const rt = (it / (NT - 1)) * 2 - 1, o = (ip * NT + it) * 3;
      let r = 0.075, g = 0.05, b = 0.028;
      const bA = bk * (0.3 + 0.7 * Math.exp(-(((rt + 0.1) / 0.75) ** 2)));                 // broad light behind → the lit cap of every bead
      r += bA; g += bA * 0.93; b += bA * 0.76;
      const kA = 1.75 * keyP * box(rt, -0.88, 0.42, 0.14);                                // the key, overhead and a little to the left
      r += kA; g += kA * 0.9; b += kA * 0.7;
      const fA = 0.78 * fillP * (0.45 + 0.55 * Math.exp(-(((rt + 0.05) / 0.7) ** 2)));     // fill above the lens
      r += fA; g += fA * 0.86; b += fA * 0.62;
      const lA = 0.36 * lowP;                                                             // bounce off the table
      r += lA; g += lA * 0.72; b += lA * 0.42;
      const cA = 0.95 * kickP * sstep(0.5, 0.9, rt);                                      // warm kicker from the right
      r += cA; g += cA * 0.6; b += cA * 0.24;
      sharp[o] = r; sharp[o + 1] = g; sharp[o + 2] = b;
    }
  }
  // rough = gaussian blur of sharp (separable)
  const blur1 = (src, dst, n, stride, lines, lineStride, sigma) => {
    const rad = Math.ceil(sigma * 2.5), kern = new Float32Array(rad * 2 + 1);
    let ks = 0; for (let i = -rad; i <= rad; i++) { kern[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma)); ks += kern[i + rad]; }
    for (let ln = 0; ln < lines; ln++) for (let i = 0; i < n; i++) {
      let r = 0, g = 0, b = 0;
      for (let q = -rad; q <= rad; q++) { let j = i + q; j = j < 0 ? 0 : j >= n ? n - 1 : j; const o = (ln * lineStride + j * stride) * 3, kv = kern[q + rad]; r += src[o] * kv; g += src[o + 1] * kv; b += src[o + 2] * kv; }
      const o = (ln * lineStride + i * stride) * 3; dst[o] = r / ks; dst[o + 1] = g / ks; dst[o + 2] = b / ks;
    }
  };
  blur1(sharp, tmp, NP, NT, NT, 1, 30);     // along ψ
  blur1(tmp, rough, NT, 1, NP, NT, 13);     // across
  return { sharp, rough };
}

/**
 * The coins. `reg` stand on edge and only lean; `fan` have also swung round on the cord (yaw), so one face shows.
 * A coin's centre line runs s + L·(d − dtop) in string space; its top sits dtop px below the arc.
 */
function makeString() {
  const r = L.rng('coins-s02-guan-d');
  const mk = ([t, kind, top, shape, lean, yawDeg = 0]) => {
    const K = KIND[kind], sh = SHAPE[shape], w = t / 2, yaw = (yawDeg * Math.PI) / 180, dark = kind === 'C' || kind === 'G';
    const c = {
      s: 0, w, L: lean, dtop: top + r.range(-1, 1), a: A0 * r.range(0.975, 1.03), kind, sy: Math.sin(yaw), cyw: Math.cos(yaw),
      gL0: 3, gLk: 0, gR0: 3, gRk: 0,
      crown: r.range(1.5, 5), taper: r.range(-0.025, 0.025),
      rwL: t * r.range(sh[0], sh[1]), rhL: t * r.range(sh[2], sh[3]), rwR: t * r.range(sh[0], sh[1]), rhR: t * r.range(sh[2], sh[3]),
      wavA: r.range(0.3, 0.9), wavF: TAU / r.range(34, 60), wavP: r.range(0, TAU),
      nick: r.chance(0.4) ? { u: r.range(-0.7, 0.7) * w, wd: r.range(6, 12), dep: r.range(2, 4.5) } : null,   // a knock in the edge
      dents: [],
      pat: K.pat + r.range(-0.06, 0.06), pv: K.pv, rough: K.rough, wear: K.wear,
      tr: K.tint[0], tg: K.tint[1] * r.range(0.97, 1.03), tb: K.tint[2] * r.range(0.92, 1.08),
      pr: 0.93, pg: kind === 'R' ? 0.5 : 0.58, pb: kind === 'R' ? 0.14 : 0.155,                              // toned (thin patina) tint
      ar: dark ? 0.28 : 0.4, ag: dark ? 0.155 : 0.23, ab: dark ? 0.055 : 0.078,                             // matte patina
      kb: r.range(0.8, 1.1), file: K.file * r.range(0.7, 1.2), lump: K.lump * r.range(0.8, 1.2),
      su: r.range(0, 4000), sv: r.range(0, 4000), pitTh: kind === 'B' ? 0.975 : r.range(0.92, 0.965),
      aoff: r.range(-0.05, 0.05), tone: r.range(0.92, 1.08), verd: K.verd ? K.verd * r.range(0.85, 1.15) : 0, dirt: r.range(0.4, 1),
      ridge: r.chance(0.45) ? r.range(0.5, 1.1) * r.sign() : 0, ur: r.range(-0.3, 0.3) * w,                 // trace of the mould seam round the edge
      edgeWear: r.range(0.25, 0.6),
    };
    for (let k = r.int(0, 2); k > 0; k--) c.dents.push({ u: r.range(-0.8, 0.8) * w, v: r.range(30, 420), rad: r.range(10, 22), dep: r.range(1.2, 3.2) });
    if (yawDeg) {
      // the face that shows: outer rim (外郭), plain field, inner rim (内郭) round the square hole
      c.af = c.a - c.rhL; c.rho1 = c.af - 0.168 * c.a; c.hh = 0.27 * c.a; c.wi = 15;
      const hr = r.range(0.06, 0.1) * r.sign(); c.hc = Math.cos(hr); c.hs = Math.sin(hr);
      c.ext = c.a * c.sy + w + 6; c.fPat = 0.8; c.rPat = 0.2; c.gL0 = 99;
    }
    return c;
  };
  const left = LEFT.map(mk), fan = FAN.map(mk), right = RIGHT.map(mk);
  const gapTop = (cl, cr) => r.range(2, 4.5) + Math.max(0, cl.L - cr.L) * 620;     // leaning apart at the top → a dark V between two beads
  const link = (cl, cr, g) => { cl.gR0 = g; cl.gRk = cr.L - cl.L; cr.gL0 = g; cr.gLk = cr.L - cl.L; };
  // the turned coin first, then outward both ways
  const hero = fan[0], A = left[left.length - 1];
  hero.s = HERO_S; hero.dtop = -2;
  A.s = hero.s - hero.w * hero.cyw - 8 - A.w; A.gR0 = 8; A.gRk = hero.L - A.L;
  for (let i = left.length - 2; i >= 0; i--) { const g = gapTop(left[i], left[i + 1]); left[i].s = left[i + 1].s - left[i + 1].w - g - left[i].w; link(left[i], left[i + 1], g); }
  // a fanned coin touches the next one where both come nearest the lens (at the height of the cord)
  const seq = fan.concat(right[0]);
  for (let k = 1; k < seq.length; k++) {
    const p = seq[k - 1], c = seq[k], dref = A0;
    const xr = p.s + p.L * (dref - p.dtop) + p.w * p.cyw + p.a * p.sy + 3 + c.w * c.cyw - c.a * c.sy;
    c.s = xr - c.L * (dref - c.dtop); p.gR0 = 6; p.gRk = 0; if (k < fan.length) c.gL0 = 99; else { c.gL0 = 14; c.gLk = -0.04; }
  }
  for (let i = 1; i < right.length; i++) { const g = gapTop(right[i - 1], right[i]); right[i].s = right[i - 1].s + right[i - 1].w + g + right[i].w; link(right[i - 1], right[i], g); }
  const reg = left.concat(right);
  // the cord rides against the top of the square holes
  const dCord = hero.dtop + hero.a - hero.hh + 30 + 5;
  const cord = { rc: 30, d0: dCord, sag: 0.035, s0: A.s + A.L * (dCord - A.dtop), s1: hero.s + hero.L * (dCord - hero.dtop) + 70 };
  cord.sm = (cord.s0 + cord.s1) / 2;
  return { reg, fan, cord, A, hero };
}

// rim profile across the thickness: a low crown with worn, rounded corners, a little waviness and the odd knock
let pDrop = 0, pSlope = 0, pXs = 0;
function profile(c, u) {
  const w = c.w, uw = u / w;
  let drop = c.crown * uw * uw + c.taper * u + c.wavA * (1 + Math.sin(u * c.wavF + c.wavP));
  let slope = (2 * c.crown * u) / (w * w) + c.taper + c.wavA * c.wavF * Math.cos(u * c.wavF + c.wavP);
  let xs = 0;
  if (u > w - c.rwR) {
    xs = (u - (w - c.rwR)) / c.rwR; if (xs > 0.985) xs = 0.985;
    const sq = Math.sqrt(1 - xs * xs); drop += c.rhR * (1 - sq); slope += ((c.rhR / c.rwR) * xs) / sq;
  } else if (u < -(w - c.rwL)) {
    xs = (-u - (w - c.rwL)) / c.rwL; if (xs > 0.985) xs = 0.985;
    const sq = Math.sqrt(1 - xs * xs); drop += c.rhL * (1 - sq); slope -= ((c.rhL / c.rwL) * xs) / sq;
  }
  if (c.nick) { const t = (u - c.nick.u) / c.nick.wd, e = c.nick.dep * Math.exp(-t * t); drop += e; slope -= (2 * t * e) / c.nick.wd; }
  pDrop = drop; pSlope = slope; pXs = xs;
}

// relief of a face at (p, q): 0 on the rims … RELIEF on the field. Also leaves the hole's box distance in rcSd and the radius in rcRho.
let rcSd = 0, rcRho = 0, rcAx = 0;
function recess(f, p, q) {
  const rho = Math.sqrt(p * p + q * q);
  const so = sstep(f.rho1 - BEV, f.rho1, rho);
  const a1 = p * f.hc + q * f.hs, a2 = -p * f.hs + q * f.hc;
  const ax = (a1 < 0 ? -a1 : a1) - f.hh, ay = (a2 < 0 ? -a2 : a2) - f.hh;
  const sd = ax > 0 && ay > 0 ? Math.sqrt(ax * ax + ay * ay) : ax > ay ? ax : ay;
  const si = 1 - sstep(f.wi, f.wi + BEV, sd);
  rcSd = sd; rcRho = rho; rcAx = ax > ay ? 1 : 0;
  return RELIEF * (1 - (so > si ? so : si));
}

/**
 * Ray-cast and shade everything under the arc. Pure arithmetic (no canvas), so it can be run and inspected outside the browser.
 * Returns { LW, LH, X0, Y0, rgba (straight alpha), coc (blur px × 40), hot (glint alpha), boxes }.
 */
function renderString(arc) {
  const R = arc.R, cx = arc.cx, cy = arc.cy;
  const X0 = -PAD, Y0 = Math.floor(arc.crestY) - 48, LW = W + PAD * 2, LH = H + PAD - Y0, N = LW * LH;
  const envm = makeEnv(), ES = envm.sharp, ER = envm.rough;
  const { reg, fan, cord, A, hero } = makeString();
  const nR = reg.length, nF = fan.length;
  // s → nearest coin on edge (taken at mid depth, so the leaning ones are still found)
  const sMin = -1320, NB = 660, lut = new Uint8Array(NB);
  for (let b = 0; b < NB; b++) {
    const sv = sMin + (b + 0.5) * 4; let best = 0, bm = -1e9;
    for (let i = 0; i < nR; i++) { const c = reg[i], m = c.w - Math.abs(sv - c.s - c.L * (220 - c.dtop)); if (m > bm) { bm = m; best = i; } }
    lut[b] = best;
  }
  const colFall = new Float32Array(LW);
  for (let i = 0; i < LW; i++) { const t = (X0 + i + 0.5 - 900) / 800; colFall[i] = 0.56 + 0.52 * Math.exp(-t * t); }
  const rgba = new Uint8ClampedArray(N * 4), coc = new Uint8ClampedArray(N), hot = new Uint8ClampedArray(N);

  // ── shading ── (results in oR, oG, oB, oH)
  let oR = 0, oG = 0, oB = 0, oH = 0;
  const LKx = -0.33, LKy = 0.94, LKz = 0.05, LBx = -0.1, LBy = 0.3, LBz = -0.95, LFy = 0.55, LFz = 0.83, LWy = -0.75, LWz = 0.66;
  /** brass with patina P seen along the normal n: the mirrored studio for the metal, matte light for patina, verdigris and grime */
  const finish = (c, nx, ny, nz, P, occ, ao, grime, verd, vn, xcol) => {
    if (nz < 0.015) nz = 0.015;
    const rT = 2 * nz * nx, rR = 2 * nz * ny, rZ = 2 * nz * nz - 1;
    let psi = Math.atan2(rR, -rZ) + c.aoff; if (psi < -0.6) psi += TAU;
    psi = psi < 0 ? 0 : psi > PMAX ? PMAX : psi;
    P = P < 0 ? 0 : P > 1 ? 1 : P;
    let rough = c.rough + 0.72 * sstep(0.12, 0.92, P); if (rough > 1) rough = 1;
    let ft = (rT * 0.5 + 0.5) * (NT - 1); ft = ft < 0 ? 0 : ft > NT - 1.001 ? NT - 1.001 : ft;
    const it = ft | 0, kf = ft - it, o = (((psi * PK) | 0) * NT + it) * 3;
    const sr = ES[o] + (ES[o + 3] - ES[o]) * kf, sg = ES[o + 1] + (ES[o + 4] - ES[o + 1]) * kf, sb = ES[o + 2] + (ES[o + 5] - ES[o + 2]) * kf;
    const qr = ER[o] + (ER[o + 3] - ER[o]) * kf, qg = ER[o + 1] + (ER[o + 4] - ER[o + 1]) * kf, qb = ER[o + 2] + (ER[o + 5] - ER[o + 2]) * kf;
    const er = sr + (qr - sr) * rough, eg = sg + (qg - sg) * rough, eb = sb + (qb - sb) * rough;
    const tt = sstep(0.05, 0.8, P), metal = 1 - 0.78 * sstep(0.62, 1.0, P);
    const tr = c.tr + (c.pr - c.tr) * tt, tg = c.tg + (c.pg - c.tg) * tt, tb = c.tb + (c.pb - c.tb) * tt;
    let dk = nx * LKx + ny * LKy + nz * LKz, db = nx * LBx + ny * LBy + nz * LBz, df = ny * LFy + nz * LFz, dw = ny * LWy + nz * LWz;
    dk = dk < 0 ? 0 : dk; db = db < 0 ? 0 : db; df = df < 0 ? 0 : df; dw = dw < 0 ? 0 : dw;
    const D = (0.14 + 1.0 * dk + 0.45 * db + 0.5 * df + 0.22 * dw) * (0.4 + 0.6 * occ);
    let cr = er * tr * metal * occ + D * c.ar * (1 - metal), cg = eg * tg * metal * occ + D * c.ag * (1 - metal), cb = eb * tb * metal * occ + D * c.ab * (1 - metal);
    if (grime > 0) { cr += (0.1 * D - cr) * grime; cg += (0.055 * D - cg) * grime; cb += (0.02 * D - cb) * grime; }
    if (verd > 0) { const vm = verd * 0.9, vs = D * (0.75 + 0.5 * vn); cr += ((0.2 + 0.24 * vn) * vs - cr) * vm; cg += ((0.44 + 0.26 * vn) * vs - cg) * vm; cb += ((0.3 + 0.2 * vn) * vs - cb) * vm; }
    const mlt = c.tone * colFall[xcol] * ao;
    cr *= mlt; cg *= mlt; cb *= mlt;
    // film shoulder on the brightest channel: golds stay saturated, only the hottest cores bleach toward #ffe9a8
    let mx = cr > cg ? cr : cg; if (cb > mx) mx = cb;
    if (mx > 0.55) {
      const kk = (0.55 + 0.45 * (1 - Math.exp(-(mx - 0.55) / 0.45))) / mx; cr *= kk; cg *= kk; cb *= kk;
      if (mx > 1.1) { const wv = (1 - Math.exp(-(mx - 1.1) / 1.6)) * 0.85; cr += (1 - cr) * wv; cg += (1 - cg) * wv * 0.96; cb += (1 - cb) * wv * 0.8; }
    }
    oR = cr; oG = cg; oB = cb;
    // a small hard light just behind the string: its glint sits on the shoulder of each bead and is switched on, coin by coin, in draw()
    const tp = (psi - 0.74) / 0.15, ta = (rT + 0.05) / 0.22;
    oH = Math.exp(-tp * tp - ta * ta) * metal * (1 - 0.8 * rough) * (1 - 0.9 * verd) * occ * 1.5;
  };
  /** a rim: u across the thickness, al round the rim from its top */
  const shadeRim = (c, u, al, slope, xs, dp, deep, xcol, fine) => {
    const sinA = Math.sin(al), cosA = Math.cos(al);
    const V0 = c.a * al, U = u + c.su, V = V0 + c.sv, fade = sstep(0.04, 0.22, sinA) * c.kb;     // relief foreshortens to nothing at the limb
    gn(U / 64, V / 118); const m1 = gV; let hU = (c.lump * 1.3 * gX) / 64, hV = (c.lump * 1.3 * gY) / 118;      // uneven casting skin
    gn(U / 24 + 9.3, V / 40 - 3.1); const m2 = gV; hU += (c.lump * 0.6 * gX) / 24; hV += (c.lump * 0.6 * gY) / 40;
    gn(U / 5.3 - 7.7, V / 240 + 4.4); const st = gV; hU += (c.file * 0.34 * gX) / 5.3;                         // wear streaks running round the rim
    let groove = 0;
    if (fine) {
      gn(U / 2.4 + 5.5, V / 130 + 2.2); hU += (c.file * 0.17 * gX) / 2.4; if (gV < 0) groove = -gV * c.file * 0.5;   // filing marks (锉痕)
      cell(U / 15, V / 15);
      if (cId > c.pitTh) {                                                                                        // the odd casting pore
        const rad = 0.12 + (0.2 * (cId - c.pitTh)) / (1 - c.pitTh), r2 = rad * rad;
        if (cD1 < r2) { const f = 1 - cD1 / r2, k = (rad * 28 * f) / (r2 * 15); hU += k * cPx; hV += k * cPy; groove += f; }
      }
    }
    for (let n = 0; n < c.dents.length; n++) {
      const dn = c.dents[n], du = u - dn.u, dv = V0 - dn.v, i2 = 1 / (dn.rad * dn.rad), r2 = (du * du + dv * dv) * i2;
      if (r2 < 4) { const e = dn.dep * Math.exp(-r2 * 1.2) * 2.4 * i2; hU += e * du; hV += e * dv; }
    }
    if (c.ridge !== 0) { const t = (u - c.ur) / 5; if (t > -3 && t < 3) hU -= 0.4 * t * c.ridge * Math.exp(-t * t) * (0.65 + 0.35 * m2); }
    hU *= fade; hV *= fade;
    // normal: across the thickness / up / toward the lens (coin frame), then the coin's yaw and lean
    const na = slope - hU, nb = cosA + hV * sinA, nc = sinA - hV * cosA, il = 1 / Math.sqrt(na * na + nb * nb + nc * nc);
    let nx = (na * c.cyw + nc * c.sy) * il, ny = nb * il;
    const nz = (-na * c.sy + nc * c.cyw) * il, nx0 = nx;
    nx -= c.L * ny; ny += c.L * nx0;
    // surface state
    const right = u > 0, gw = right ? c.gR0 + c.gRk * dp : c.gL0 + c.gLk * dp;         // width of the gap on this side, here
    const tight = (1 - sstep(4, 34, gw)) * sstep(0, 46, dp + 12);                      // shut in by the neighbour (not at the open top of a notch)
    const ew = xs > 0.02 && xs < 0.62 ? c.edgeWear * Math.sin(((xs - 0.02) / 0.6) * Math.PI) : 0;   // arrises rubbed bright by the neighbours
    const P = c.pat + c.pv * (0.7 * st + 0.4 * m2) + 0.8 * groove + 0.4 * xs * xs * c.dirt - 0.55 * c.wear * sstep(0.05, 0.7, m1) * (1 - 0.5 * xs) - ew;
    const occ = 1 - 0.85 * xs * xs * xs * tight;
    const ao = (1 - 0.72 * Math.pow(xs, 2.6) * tight) * (1 - 0.5 * (groove > 1 ? 1 : groove)) * deep;
    const grime = sstep(0.5, 1, xs) * c.dirt * 0.6 * tight;
    let verd = 0, vn = 0;
    if (c.verd > 0) {
      // verdigris: matte green crust, thickest in the corners beside a seam, rubbed off the crown
      gn(U / 26 + 3, V / 40 + 9);
      verd = sstep(0.58, 0.72, gV * 0.5 + 0.5 + 0.5 * xs + 0.3 * Math.exp(-V0 / 210) + c.verd - 0.55);
      if (verd > 0) { gn(U / 6, V / 8); vn = gV * 0.5 + 0.5; }
    }
    finish(c, nx, ny, nz, P, occ, ao, grime, verd, vn, xcol);
  };
  /** a face (back of the coin: no inscription): toned field with its sand-cast skin, rims rubbed bright */
  const shadeFace = (f, p, q, shade, deep, xcol, fine) => {
    const Rv = recess(f, p, q), rho = rcRho, raised = 1 - Rv / RELIEF;
    const Rp = (recess(f, p + 0.8, q) - recess(f, p - 0.8, q)) / 1.6, Rq = (recess(f, p, q + 0.8) - recess(f, p, q - 0.8)) / 1.6;
    gn(p / 46 + f.su, q / 46 + f.sv); const b1 = gV; let Hp = (0.9 * gX) / 46 - Rp, Hq = (0.9 * gY) / 46 - Rq;
    let grain = 0;
    if (fine) { gn(p / 4.6 + 3.3, q / 4.6 - 8.1); grain = gV; const ga = 0.36 * (1 - 0.8 * raised); Hp += (ga * gX) / 4.6; Hq += (ga * gY) / 4.6; }
    const e = rho - (f.af - 6); if (e > 0) { const k = (e / 6) * 0.9; Hp -= (k * p) / rho; Hq -= (k * q) / rho; }      // the worn outer edge rolls over
    let nx = -f.cyw - Hp * f.sy, ny = -Hq, nz = f.sy - Hp * f.cyw;
    const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= il; ny *= il; nz *= il;
    const nx0 = nx; nx -= f.L * ny; ny += f.L * nx0;
    gn(rho / 3.4 + 11, (p - q) / 70); const ring = gV;                                                                  // fine scratches round the outer rim
    // dirt settles at the foot of the rims
    const foot = sstep(f.rho1 - BEV - 16, f.rho1 - BEV, rho) + (1 - sstep(f.wi + BEV, f.wi + BEV + 14, rcSd));
    const P = f.fPat + (f.rPat - f.fPat) * raised + 0.14 * b1 + (1 - raised) * (0.1 * grain + 0.12 * (foot > 1 ? 1 : foot)) + raised * 0.16 * ring;
    const grime = (1 - raised) * 0.45 * (foot > 1 ? 1 : foot);
    finish(f, nx, ny, nz, P, shade, deep * (0.86 + 0.14 * raised), grime, 0, 0, xcol);
  };
  /** the hemp cord: three twisted strands, fibres running along them */
  const shadeCord = (sl, q, lit0, xcol) => {
    const rc = cord.rc; let dd = q / rc; dd = dd < -1 ? -1 : dd > 1 ? 1 : dd;
    const phi = Math.asin(dd), vv = phi * rc;
    gn(sl / 60, vv / 60);
    const ph = sl / 48 + (phi * 3) / TAU + 0.1 * gV + 0.37, fr = ph - Math.floor(ph);
    const ridge = Math.pow(Math.sin(Math.PI * fr), 0.62), nz = Math.sqrt(1 - dd * dd), flank = (0.5 - fr) * 2;     // each strand is a rounded ridge
    let lit = 0.16 + 0.6 * nz + 0.34 * -dd + 0.24 * flank * (1 - ridge * 0.4); lit = lit < 0.04 ? 0.04 : lit;
    const al2 = sl * 0.57 + vv * 0.41, ac2 = vv - sl * 0.12;                                                        // yarns and fibres, slightly twisted
    gn(al2 / 80 + 7, ac2 / 6.5); const yarn = gV * 0.5 + 0.5;
    gn(al2 / 40 + 13, ac2 / 2.6); const fib = gV * 0.5 + 0.5;
    const v = lit * (0.22 + 0.78 * ridge) * (0.6 + 0.3 * yarn + 0.34 * fib) * lit0 * colFall[xcol] * 1.08;
    const sat = 0.5 + 0.5 * fib;
    oR = 0.03 + v * (0.84 + 0.08 * sat); oG = 0.018 + v * (0.62 + 0.12 * sat); oB = 0.01 + v * (0.33 + 0.14 * sat); oH = 0;
    if (oR > 1) oR = 1; if (oG > 1) oG = 1;
  };

  // ── fragments of one pixel ──
  const FZ = new Float64Array(16), FC = new Float64Array(16), FP = new Float64Array(16 * 8), FT = new Int8Array(16), FK = new Int16Array(16), ORD = new Int8Array(16);
  const tanH = hero.sy / hero.cyw;
  for (let j = 0; j < LH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < LW; i++) {
      const ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -16) continue;
      const s = Math.atan2(ddx, ddy) * R, k = j * LW + i;
      let nf = 0;

      // the coins that stand on edge
      let b = ((s - sMin) * 0.25) | 0; b = b < 0 ? 0 : b >= NB ? NB - 1 : b;
      const c0 = lut[b];
      let ci = c0, m = -1e9, u = 0;
      for (let q = c0 - 2; q <= c0 + 2; q++) {
        if (q < 0 || q >= nR) continue;
        const cq = reg[q], uu = s - cq.s - cq.L * (d - cq.dtop), mm = cq.w - (uu < 0 ? -uu : uu);
        if (mm > m) { m = mm; ci = q; u = uu; }
      }
      const c = reg[ci], dp = d - c.dtop;
      if (m > -0.5) {
        profile(c, u);
        const aL = c.a - pDrop, Y = c.a - dp;
        let cov = (aL - Y) / Math.sqrt(1 + (pSlope * pSlope > 9 ? 9 : pSlope * pSlope)) + 0.5;
        if (cov > 0) {
          const cs2 = m + 0.5; if (cs2 < cov) cov = cs2; if (cov > 1) cov = 1;
          let q = Y / aL; q = q > 1 ? 1 : q < QMIN ? QMIN : q;
          const al = Math.acos(q), o = nf * 8;
          FT[nf] = T_RIM; FK[nf] = ci; FZ[nf] = aL * Math.sin(al); FC[nf] = cov;
          FP[o] = u; FP[o + 1] = al; FP[o + 2] = pSlope; FP[o + 3] = pXs; FP[o + 4] = dp; nf++;
        }
      }
      if (m < 0.5) {
        // between two coins: a seam, dusk just under the notch and darkness below; a wide opening shows the dark only well inside the string
        const cj = u > 0 ? ci + 1 : ci - 1; let g = -m;
        if (cj >= 0 && cj < nR) { const n = reg[cj], u2 = s - n.s - n.L * (d - n.dtop); g += (u2 < 0 ? -u2 : u2) - n.w; } else g = 99;
        const dq = dp - (u > 0 ? c.rhR : c.rhL);
        let al = sstep(-4, 12, dq);
        if (g > 30) al *= 1 - sstep(30, 58, g) * (1 - sstep(70, 250, d));
        if (al > 0.003) {
          const o = nf * 8; FT[nf] = T_SEAM; FK[nf] = ci; FZ[nf] = -1e6; FC[nf] = al; FP[o] = g; FP[o + 1] = dq;
          const zz = 2 * c.a * dp - dp * dp; FP[o + 2] = g < 30 && zz > 0 ? Math.sqrt(zz) : 0; nf++;
        }
      }

      // the coins that have swung round
      for (let kf = 0; kf < nF; kf++) {
        const f = fan[kf], dpf = d - f.dtop, X = s - f.s - f.L * dpf;
        if (X < -f.ext || X > f.ext) continue;
        const Y = f.a - dpf;
        // the rim, where it comes round toward the lens
        let aL = f.a - f.rhL, p = 0, tau = 0;
        for (let it = 0; it < 3; it++) {
          const pp = aL * aL - Y * Y; p = pp > 0 ? Math.sqrt(pp) : 0;
          tau = (X - p * f.sy) / f.cyw;
          profile(f, tau < -f.w ? -f.w : tau > f.w ? f.w : tau); aL = f.a - pDrop;
        }
        if (tau > -f.w - 1 && tau < f.w + 0.6) {
          const sl = pSlope / f.cyw;
          let cov = (aL - Y) / Math.sqrt(1 + (sl * sl > 9 ? 9 : sl * sl)) + 0.5;
          const cs2 = (f.w - tau) * f.cyw + 0.5; if (cs2 < cov) cov = cs2; if (cov > 1) cov = 1;
          if (cov > 0) {
            const o = nf * 8;
            FT[nf] = T_RIM; FK[nf] = -1 - kf; FZ[nf] = p * f.cyw - tau * f.sy; FC[nf] = cov;
            FP[o] = tau; FP[o + 1] = Math.atan2(p, Y); FP[o + 2] = pSlope; FP[o + 3] = pXs; FP[o + 4] = dpf; nf++;
          }
        }
        // the face that is turned to the lens: a plane, with a relief that the oblique ray is marched over
        const p0 = (X + f.w * f.cyw) / f.sy;
        if (p0 * p0 + Y * Y < (f.af + 3) * (f.af + 3)) {
          const tanY = f.sy / f.cyw; let uMax = RELIEF / tanY; if (uMax > 44) uMax = 44;
          let uu = 0;
          if (recess(f, p0, Y) > 0.02) {
            let lo = 0, hi = uMax;
            for (uu = 2; uu < uMax; uu += 2) { if (uu * tanY >= recess(f, p0 - uu, Y)) { hi = uu; break; } lo = uu; }
            for (let it = 0; it < 4; it++) { const mid = (lo + hi) / 2; if (mid * tanY >= recess(f, p0 - mid, Y)) hi = mid; else lo = mid; }
            uu = hi;
          }
          const pf = p0 - uu; recess(f, pf, Y);
          const rho = rcRho, sd = rcSd, z0 = (X * f.cyw + f.w) / f.sy;
          let cov = (f.af - rho) / Math.sqrt((pf * pf) / (rho * rho * f.sy * f.sy) + (Y * Y) / (rho * rho) + 1e-6) + 0.5; if (cov > 1) cov = 1;
          if (cov > 0) {
            if (sd < 1.5) {
              // the square hole: the ray runs down the hole and meets one of its walls, or goes right through
              const gs = rcAx ? Math.sqrt((f.hc * f.hc) / (f.sy * f.sy) + f.hs * f.hs) : Math.sqrt((f.hs * f.hs) / (f.sy * f.sy) + f.hc * f.hc);
              const ch = sd / gs + 0.5;
              const a1 = pf * f.hc + Y * f.hs, a2 = -pf * f.hs + Y * f.hc;
              let ue = (a1 + f.hh) / f.hc;
              if (f.hs > 1e-4) { const u2 = (f.hh - a2) / f.hs; if (u2 < ue) ue = u2; } else if (f.hs < -1e-4) { const u2 = (f.hh + a2) / -f.hs; if (u2 < ue) ue = u2; }
              if (ue < 0) ue = 0;
              if (ue * tanY < 2 * f.w) { const o = nf * 8; FT[nf] = T_WALL; FK[nf] = -1 - kf; FZ[nf] = z0 - ue / f.cyw; FC[nf] = cov; FP[o] = ue * tanY; nf++; }
              cov *= ch < 0 ? 0 : ch > 1 ? 1 : ch;
            }
            if (cov > 0.003) { const o = nf * 8; FT[nf] = T_FACE; FK[nf] = -1 - kf; FZ[nf] = z0 - uu / f.cyw; FC[nf] = cov; FP[o] = pf; FP[o + 1] = Y; FP[o + 2] = X; nf++; }
          }
        }
      }

      // the cord
      if (s > cord.s0 && s < cord.s1) {
        const dl = d - (cord.d0 + cord.sag * (s - cord.sm)), adl = dl < 0 ? -dl : dl;
        if (adl < cord.rc + 0.5) {
          const o = nf * 8, zz = cord.rc * cord.rc - dl * dl;
          FT[nf] = T_CORD; FK[nf] = 0; FZ[nf] = zz > 0 ? Math.sqrt(zz) : 0; FC[nf] = cord.rc - adl + 0.5 > 1 ? 1 : cord.rc - adl + 0.5; FP[o] = s; FP[o + 1] = dl; nf++;
        }
      }
      if (nf === 0) continue;

      // nearest first, then "over"
      for (let a = 0; a < nf; a++) ORD[a] = a;
      for (let a = 1; a < nf; a++) { const v = ORD[a]; let q = a - 1; while (q >= 0 && FZ[ORD[q]] < FZ[v]) { ORD[q + 1] = ORD[q]; q--; } ORD[q + 1] = v; }
      let aR = 0, aG = 0, aB = 0, aH = 0, T = 1, zOut = 0, zSet = false;
      const deep = 1 - 0.55 * sstep(360, 640, d);           // everything sinks into the dark toward the bottom of frame
      for (let a = 0; a < nf && T > 0.004; a++) {
        const q = ORD[a], cov = FC[q], o = q * 8, ty = FT[q];
        if (cov <= 0.003) continue;
        let z = FZ[q];
        if (ty === T_SEAM) z = FP[o + 2];
        const az = z < 0 ? -z : z, blur = DOF_MAX * sstep(DOF_Z0, DOF_Z1, az), fine = blur < 2.4;
        if (ty === T_RIM) {
          const kk = FK[q], cc = kk >= 0 ? reg[kk] : fan[-1 - kk];
          shadeRim(cc, FP[o], FP[o + 1], FP[o + 2], FP[o + 3], FP[o + 4], deep, i, fine);
        } else if (ty === T_FACE) {
          const f = fan[-1 - FK[q]];
          // shade from the coin leaning over it on the left, and from the cord
          let sh = 1;
          if (f === hero) {
            const eA = s - (A.s + A.w + A.L * (d - A.dtop)); if (eA > 0) sh *= 1 - 0.5 * Math.exp(-eA / 40);
            const dl = d - (cord.d0 + cord.sag * (s - cord.sm)) - cord.rc + 8;
            if (dl > 0 && FP[o + 2] < 24) sh *= 1 - 0.55 * Math.exp(-dl / 26) * (1 - sstep(0, 24, FP[o + 2]));
          } else sh = 0.5 + 0.5 * sstep(f.rho1 - 70, f.af - 8, Math.sqrt(FP[o] * FP[o] + FP[o + 1] * FP[o + 1]));   // … from the rim of the coin before it
          shadeFace(f, FP[o], FP[o + 1], sh, deep, i, fine);
        } else if (ty === T_WALL) {
          const kq = (0.22 + 0.9 * Math.exp(-FP[o] / 20)) * colFall[i] * deep;
          oR = 0.2 * kq; oG = 0.105 * kq; oB = 0.035 * kq; oH = 0;
        } else if (ty === T_CORD) {
          // lit in the open, dim where it runs down the hole of the turned coin
          const Xh = FP[o] - hero.s - hero.L * (d - hero.dtop), tin = Xh * hero.cyw - z * hero.sy + hero.w;
          shadeCord(FP[o] - cord.sm, FP[o + 1], (tin > 0 ? 0.25 + 0.75 * Math.exp(-tin / 16) : 1) * deep, i);
        } else {
          const g = FP[o], dq = FP[o + 1], bn = Math.exp(-(dq > 0 ? dq : 0) / 34) * 0.5 * sstep(1, 7, g) * colFall[i];
          oR = 0.022 + 0.4 * bn; oG = 0.013 + 0.19 * bn; oB = 0.008 + 0.035 * bn; oH = 0;
        }
        const wgt = T * cov;
        aR += wgt * oR; aG += wgt * oG; aB += wgt * oB; aH += wgt * oH;
        if (!zSet && cov > 0.4) { zOut = blur; zSet = true; }
        T *= 1 - cov;
      }
      const alpha = 1 - T;
      if (alpha < 0.003) continue;
      const o4 = k * 4, ia = 255 / alpha;
      rgba[o4] = aR * ia; rgba[o4 + 1] = aG * ia; rgba[o4 + 2] = aB * ia; rgba[o4 + 3] = 255 * alpha;
      const as = s < 0 ? -s : s;
      coc[k] = (zOut + 2.8 * sstep(700, 1090, as)) * 40;
      hot[k] = aH > 1 ? 255 : 255 * aH;
    }
  }
  // where the travelling light may switch a glint on: one box per coin
  const boxes = reg.concat(fan).map((c) => {
    const p = arc.pt(c.s / R, -c.dtop), hw = c.w + 34 + (c.ext ? c.ext * 0.5 : 0);
    const x = Math.max(0, Math.floor(p.x - hw - X0)), y = Math.max(0, Math.floor(p.y - 30 - Y0));
    return { s: c.s, x, y, w: Math.min(LW - x, Math.ceil(hw * 2)), h: Math.min(LH - y, 210) };
  }).filter((b) => b.w > 0 && b.h > 0);
  return { LW, LH, X0, Y0, rgba, coc, hot, boxes };
}

/** everything below the arc → one layer (plus the glint layer for the travelling light) */
async function buildString(env) {
  const a = env.arc, R = a.R;
  const out = renderString(a), { LW, LH, X0, Y0 } = out, N = LW * LH;
  const ax = a.cx - X0, ay = a.cy - Y0;                  // arc centre in layer pixels
  const fromData = (data) => { const c = L.makeCanvas(LW, LH); c.getContext('2d').putImageData(new ImageData(data, LW, LH), 0, 0); return c; };
  const sharp = fromData(out.rgba);
  const mixIn = (dst, src, mask) => {                    // dst = dst·(1 − mask) + src·mask
    const t = L.makeCanvas(LW, LH), tg = t.getContext('2d');
    tg.drawImage(src, 0, 0); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, 0, 0);
    const g = dst.getContext('2d');
    g.save(); g.globalCompositeOperation = 'destination-out'; g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'lighter'; g.drawImage(t, 0, 0); g.restore();
  };
  // depth of field: three pre-blurred copies, each mixed in where the circle of confusion calls for it
  const layer = L.makeCanvas(LW, LH), lg = layer.getContext('2d');
  lg.drawImage(sharp, 0, 0);
  const LEV = [0.35, 1.5, 3.2, 5.8];
  for (let k = 1; k < LEV.length; k++) {
    const md = new Uint8ClampedArray(N * 4), lo = LEV[k - 1] * 40, sc = 255 / ((LEV[k] - LEV[k - 1]) * 40), cc = out.coc;
    for (let i = 0; i < N; i++) md[i * 4 + 3] = (cc[i] - lo) * sc;
    mixIn(layer, L.blurred(sharp, LEV[k]), L.blurred(fromData(md), 1.2));
  }
  // bloom: only the hot parts, from a quarter-size copy; it also puts a breath of halation over the limb
  const bw = Math.round(LW / 4), bh = Math.round(LH / 4);
  const bloom = L.makeCanvas(bw, bh), bg = bloom.getContext('2d');
  bg.filter = 'brightness(0.62) contrast(2.8) blur(5px)';
  bg.drawImage(layer, 0, 0, bw, bh);
  bg.filter = 'none';
  bg.globalCompositeOperation = 'destination-in';
  bg.fillStyle = L.radial(bg, ax / 4, ay / 4, (R + 20) / 4, (R + 42) / 4, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  bg.fillRect(0, 0, bw, bh);
  lg.save(); lg.globalCompositeOperation = 'screen'; lg.globalAlpha = 0.3;
  lg.imageSmoothingEnabled = true; lg.imageSmoothingQuality = 'high';
  lg.drawImage(bloom, 0, 0, LW, LH);
  lg.restore();

  // glints for the travelling light
  const hd = new Uint8ClampedArray(N * 4), ha = out.hot;
  for (let i = 0; i < N; i++) if (ha[i]) { const o = i * 4; hd[o] = 255; hd[o + 1] = 232; hd[o + 2] = 170; hd[o + 3] = ha[i]; }
  const hot0 = fromData(hd), hot = L.blurred(hot0, 5), hg = hot.getContext('2d');
  hg.globalCompositeOperation = 'lighter'; hg.drawImage(hot0, 0, 0);
  const [layerBmp, hotBmp] = await Promise.all([createImageBitmap(layer), createImageBitmap(hot)]);
  return { layer: layerBmp, hot: hotBmp, boxes: out.boxes, X0, Y0 };
}

/** soft round sprite */
function dotSprite(color, stops) {
  const c = L.makeCanvas(64, 64), g = c.getContext('2d');
  g.fillStyle = L.radial(g, 32, 32, 0, 32, stops.map(([t, al]) => [t, L.rgba(color, al)]));
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** dust hanging in the dark above the string: a few sharp motes, fewer that are out of focus */
function makeDust(a) {
  const r = L.rng('coins-s02-dust-c'), nz = L.makeNoise('s02-dust'), out = [];
  let guard = 0;
  while (out.length < 30 && guard++ < 6000) {
    const x = r.range(-40, W + 40), y = r.range(-30, 760);
    const clear = a.yAt(L.clamp(x, 0, W)) - y;                 // px above the rim tops
    if (clear < 40) continue;
    // drifts in loose clouds, thicker toward the upper left where the light comes in, thin just above the coins
    const dens = (0.25 + 0.75 * L.clamp(clear / 420)) * (0.35 + 0.65 * (nz.fbm(x / 420, y / 300, 2) * 0.5 + 0.5)) * (0.55 + 0.45 * L.clamp(1 - x / 1500));
    if (r() > dens) continue;
    const cls = r();
    const m = { x, y, ph: r(), f: r.range(0.5, 1.6), spr: r.int(0, 2) };
    if (cls < 0.68) { m.r = r.range(1.0, 2.3); m.al = r.range(0.3, 0.9); m.k = 1; }
    else if (cls < 0.9) { m.r = r.range(3.5, 7); m.al = r.range(0.1, 0.26); m.k = 1.6; }
    else { m.r = r.range(14, 26); m.al = r.range(0.035, 0.07); m.k = 2.4; m.spr = 3; }
    m.vx = r.range(4, 14) * m.k; m.vy = -r.range(2, 8) * m.k;
    out.push(m);
  }
  return out;
}

export default {
  name: '一串铜钱',
  tone: 'light',
  async init(env) {
    const a = env.arc;
    const str = await buildString(env);
    // the dark behind: not quite dead black — a breath of warm haze low down, and a thin veil of far dust
    const back = L.makeCanvas(W, H), g = back.getContext('2d');
    g.fillStyle = '#050403'; g.fillRect(0, 0, W, H);
    g.fillStyle = L.radial(g, a.cx - 120, a.crestY + 240, 120, 980, [[0, 'rgba(70,40,10,0.24)'], [0.5, 'rgba(50,28,8,0.09)'], [1, 'rgba(40,22,6,0)']]);
    g.fillRect(0, 0, W, H);
    g.fillStyle = L.radial(g, 380, 150, 0, 760, [[0, 'rgba(64,52,38,0.1)'], [1, 'rgba(64,52,38,0)']]);
    g.fillRect(0, 0, W, H);
    const nz = L.makeNoise('s02-far');
    L.speckle(g, { seed: 'coins-s02-far-c', count: 300, x: 0, y: 0, w: W, h: 740, rMin: 0.6, rMax: 1.3, colors: ['#ffe9a8', '#d9a441', '#fff4d6'], alpha: [0.05, 0.24],
      test: (x, y) => y < a.yAt(x) - 44 && nz.fbm(x / 300, y / 220, 3) > 0.1 - 0.3 * L.clamp(1 - x / 1300) });
    const sprites = [
      dotSprite('#ffe9a8', [[0, 1], [0.22, 0.6], [0.5, 0.16], [1, 0]]),
      dotSprite('#fff6dc', [[0, 1], [0.22, 0.6], [0.5, 0.16], [1, 0]]),
      dotSprite('#ffc66a', [[0, 1], [0.22, 0.6], [0.5, 0.16], [1, 0]]),
      dotSprite('#ffd98a', [[0, 0.8], [0.7, 0.8], [0.88, 1], [0.95, 0.4], [1, 0]]),   // out-of-focus disc
    ];
    S = { ...str, back, sprites, dust: makeDust(a) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0085, 0.0085, p), zoom = L.lerp(1.0, 1.012, p);
    ctx.drawImage(S.back, 0, 0);

    // dust: slow drift, each mote breathing at its own rate
    ctx.save();
    for (const m of S.dust) {
      const tw = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(TAU * (p * m.f + m.ph)));
      const x = m.x + m.vx * p, y = m.y + m.vy * p, s = m.r * 5;
      ctx.globalAlpha = m.al * tw;
      ctx.drawImage(S.sprites[m.spr], x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();

    // the string slides round its centre; a light travels along it and rim after rim flares as it passes
    const sw = L.lerp(-520, 330, L.ease.inOutQuad(p));
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.layer, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of S.boxes) {
        const t = (b.s - sw) / 210, al = Math.exp(-t * t);
        if (al < 0.03) continue;
        ctx.globalAlpha = al;
        ctx.drawImage(S.hot, b.x, b.y, b.w, b.h, S.X0 + b.x, S.Y0 + b.y, b.w, b.h);
      }
    });
    // … and a sheen follows the light over the body
    ctx.save(); a.clipBelow(ctx, 4);
    const sh = a.pt(sw / a.R, -150);
    L.glow(ctx, sh.x, sh.y, 420, '#ffb648', 0.08);
    ctx.restore();
  },
};
