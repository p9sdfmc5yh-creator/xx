// s22 — 连钱纹织锦. Macro of a seam between two cloths.
// Above the arc: hand-woven indigo cotton (土布), plain weave, slubby yarn, uneven dye.
// Below the arc: a vermilion-ground gold brocade (织金锦) cut on the round and stitched down. Its pattern is 连钱纹:
// equal circles on a square lattice, radius = pitch / √2, so every circle overlaps its four neighbours by a quarter
// arc → four spindle-shaped petals per circle, and in each circle's centre a square "hole" like a cash coin's.
//   · rings and the hole's border  = gold weft (long floats, tied down by red warps in a diagonal twill order)
//   · petals (the ground weave)    = vermilion warp-faced twill (fine vertical ribs, dark knuckles marching diagonally)
//   · the coin's face              = red-orange silk weft
//   · the hole                     = deep crimson
// The arc itself is the brocade's raw cut edge: warp ends frayed into an uneven fringe, with one row of running
// stitches just below it.
//
// Recipe: both cloths are per-pixel "weave shaders" evaluated once in init(). The pattern is looked up per THREAD
// CELL (one warp × one weft), so every outline is stepped the way a jacquard figure is, never a printed line.
// A second image holds only the highlights the threads could give; draw() reveals it through a moving window,
// which reads as lamp-light sliding over the gold.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;                       // the layer only rotates ±0.006 rad about a centre 2400 px away (≈ ±19 px) and zooms in
const LW = W + PAD * 2, LH = H + PAD * 2;

// ── brocade geometry ──
const D = 250;                        // lattice pitch of the coin pattern (px)
const RC = D / Math.SQRT2;            // circle radius → neighbours overlap by exactly a quarter arc
const BW = 17;                        // width of the gold ring
const SQ = 66, SQB = 11;              // the square "hole": outer side, width of its gold border
const PX = 3.0, PY = 4.4;             // warp pitch, weft pitch (px)
const TILT = -0.05;                   // the brocade was not cut square to its weave
const EDGE = -13;                     // dr where the woven cloth stops; the fringe above it carries the visual edge onto the arc
const STITCH = -48;                   // dr of the row of running stitches
// ── indigo cloth ──
const QX = 5.0, QY = 4.6;             // warp / weft pitch of the homespun
const TILT_I = 0.032;

const PETAL = 0, FACE = 1, GOLD = 2, HOLE = 3;   // PETAL = the vermilion ground weave
let S = null;

// ───────────────────────── deterministic helpers ─────────────────────────
function hash2(a, b) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
let NT = null;
function initNoise() {
  if (NT) return;
  const r = L.rng('s22coins-vn');
  NT = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) NT[i] = r();
}
/** cheap value noise 0..1 */
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
  const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
  const a = NT[y0 + x0], b = NT[y0 + x1], c = NT[y1 + x0], d = NT[y1 + x1];
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mod = (n, m) => ((n % m) + m) % m;
const VMAX = 1.5, NL = 512;
/** colour ramp over "light received" 0 … VMAX (≈0.55 = the thread's own colour) */
function lut(stops) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / VMAX, c]));
  const out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

// ───────────────────────── the 连钱 pattern ─────────────────────────
/** which thread shows on the face at fabric point (u, v) */
function patternAt(u, v) {
  const a = u / D, b = v / D;
  const ra = (a - Math.round(a)) * D, rb = (b - Math.round(b)) * D;
  const m = Math.max(Math.abs(ra), Math.abs(rb));
  if (m < SQ / 2) return m > SQ / 2 - SQB ? GOLD : HOLE;
  const i0 = Math.floor(a), j0 = Math.floor(b);
  let inside = 0, ring = false;
  for (let k = 0; k < 4; k++) {
    const du = (a - i0 - (k & 1)) * D, dv = (b - j0 - (k >> 1)) * D;
    const dist = Math.sqrt(du * du + dv * dv);
    if (Math.abs(dist - RC) < BW / 2) ring = true;
    if (dist < RC) inside++;
  }
  return ring ? GOLD : inside >= 2 ? PETAL : FACE;
}

// ───────────────────────── brocade (per pixel) ─────────────────────────
function buildBrocade(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const y0 = Math.floor(a.crestY) - 4;
  const BH = H + PAD - y0;
  const OX = cx - 46, OY = a.crestY + 158;          // a circle centre: one row of whole "coins" sits just under the crest
  const cs = Math.cos(TILT), sn = Math.sin(TILT);

  // jacquard draft: one entry per warp × weft crossing
  let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
  for (const [x, y] of [[-PAD, y0], [W + PAD, y0], [-PAD, H + PAD], [W + PAD, H + PAD]]) {
    const fx = x - OX, fy = y - OY, u = fx * cs + fy * sn, v = -fx * sn + fy * cs;
    umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
  }
  const I0 = Math.floor((umin - 70) / PX), I1 = Math.ceil((umax + 70) / PX);
  const J0 = Math.floor((vmin - 70) / PY), J1 = Math.ceil((vmax + 70) / PY);
  const NI = I1 - I0 + 1, NJ = J1 - J0 + 1;
  const CLS = new Uint8Array(NI * NJ);
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) CLS[j * NI + i] = patternAt((I0 + i + 0.5) * PX, (J0 + j + 0.5) * PY);
  const clsAt = (u, v) => CLS[(Math.floor(v / PY) - J0) * NI + Math.floor(u / PX) - I0];

  const RED = lut([[0, '#300604'], [0.2, '#64100b'], [0.4, '#9e2014'], [0.55, '#c8321f'], [0.72, '#da3b21'], [0.9, '#ea4d2a'], [1.1, '#f86c40'], [1.5, '#ffb48e']]);
  const ORG = lut([[0, '#451405'], [0.2, '#84320c'], [0.4, '#c2531a'], [0.55, '#e06a28'], [0.72, '#ee7e30'], [0.9, '#fb9a48'], [1.1, '#ffc084'], [1.5, '#ffe8cf']]);
  const BARE = lut([[0, '#4c1806'], [0.2, '#8a3a0e'], [0.4, '#c95c1c'], [0.55, '#e8742a'], [0.72, '#f68d3a'], [0.9, '#ffad5c'], [1.1, '#ffcf96'], [1.5, '#fff0d8']]);
  const GLD = lut([[0, '#2a1203'], [0.2, '#6b3a0c'], [0.38, '#a36c18'], [0.52, '#cf9a2c'], [0.66, '#e3b341'], [0.82, '#f5d262'], [1.0, '#ffeb9c'], [1.2, '#fff8dc'], [1.5, '#ffffff']]);
  const CRM = lut([[0, '#190403'], [0.3, '#3e0d0a'], [0.55, '#5a1410'], [0.8, '#7e2219'], [1.1, '#b04a38'], [1.5, '#e09880']]);

  const img = new ImageData(LW, BH), spI = new ImageData(LW, BH);
  const d = img.data, q = spI.data;
  const rMax = R + EDGE + 8, rMax2 = rMax * rMax;
  const PI = Math.PI;
  // slow fields (lie of the cloth, light) are evaluated every 4th pixel of a row and interpolated
  const SS = 4, NF = Math.ceil(LW / SS) + 2;
  const Fwu = new Float32Array(NF), Fwv = new Float32Array(NF), Fmu = new Float32Array(NF), Fmac = new Float32Array(NF),
    Fpool = new Float32Array(NF), FsW = new Float32Array(NF), FsP = new Float32Array(NF);
  for (let Y = 0; Y < BH; Y++) {
    const y = y0 + Y, dyc = cy - y;
    for (let i = 0; i < NF; i++) {
      const x = i * SS - PAD, dxc = x - cx;
      const dr = Math.sqrt(dxc * dxc + dyc * dyc) - R;
      // cloth is never quite square: the thread lines wander a little
      Fwu[i] = (vn(x * 0.0041 + 3.1, y * 0.0041 + 7.7) - 0.5) * 26;
      Fwv[i] = (vn(x * 0.0037 + 11.3, y * 0.0045 + 5.2) - 0.5) * 26;
      // the lie of the cloth: slow undulation + puckers pulled by the stitches
      const sArc = Math.atan2(dxc, dyc) * R;
      const puck = Math.sin(sArc * 0.131 + 3 * vn(sArc * 0.011, 1.3)) * Math.exp(-Math.abs(STITCH - dr) / 60);
      const mu = (vn(x * 0.0026 + 1.3, y * 0.0026 + 4.1) - 0.5) * 2 + 0.6 * puck;
      const mv = (vn(x * 0.0026 + 9.1, y * 0.0026 + 2.7) - 0.5) * 2;
      const gu = (x - 700) / 1500, gv = (y - 680) / 900;
      Fmu[i] = mu;
      Fmac[i] = 1 - 0.24 * (0.6 * mu + 0.8 * mv);
      Fpool[i] = 1.16 - 0.56 * sm((Math.hypot((x - 740) * 0.72, (y - 620) * 1.25) - 180) / 1050);
      const aW = gu + 0.5 * mu, aP = 0.8 * gv + 0.3 * gu + 0.5 * mv;
      FsW[i] = Math.exp(-aW * aW / 0.08); FsP[i] = Math.exp(-aP * aP / 0.08);
    }
    let o = Y * LW * 4;
    for (let X = 0; X < LW; X++, o += 4) {
      const x = X - PAD, dxc = x - cx;
      const r2 = dxc * dxc + dyc * dyc;
      if (r2 > rMax2) continue;
      const dr = Math.sqrt(r2) - R;
      const fi = X >> 2, ft = (X & 3) * 0.25;
      const fx = x - OX, fy = y - OY;
      const u0 = fx * cs + fy * sn, v0 = -fx * sn + fy * cs;
      const u = u0 + Fwu[fi] + (Fwu[fi + 1] - Fwu[fi]) * ft;
      // the picks were not beaten up evenly: rows crowd and open
      const v = v0 + Fwv[fi] + (Fwv[fi + 1] - Fwv[fi]) * ft + (vn(v0 * 0.043 + 3.3, u0 * 0.0016 + 1.1) - 0.5) * 3.4;
      const uu = u / PX, vv = v / PY;
      const ci = Math.floor(uu), cj = Math.floor(vv), fu = uu - ci, fv = vv - cj;
      // ragged cut: every warp end stops at its own height
      if (dr > EDGE + (hash2(ci, 77) - 0.5) * 7) continue;
      const ia = (cj - J0) * NI + (ci - I0);
      const cls = CLS[ia];
      const mu = Fmu[fi] + (Fmu[fi + 1] - Fmu[fi]) * ft, pool = Fpool[fi] + (Fpool[fi + 1] - Fpool[fi]) * ft;
      const sW = FsW[fi] + (FsW[fi + 1] - FsW[fi]) * ft, sP = FsP[fi] + (FsP[fi + 1] - FsP[fi]) * ft;

      let val, T, sp = 0, sr = 255, sg = 236, sb = 180, wear = 0;
      if (cls === PETAL) {
        // warp-faced twill: each warp floats over four picks, then dives under one
        const k = mod(cj + ci, 5);
        const tv = 0.9 + 0.2 * hash2(ci, 3) + 0.12 * (vn(ci * 0.37, v * 0.008) - 0.5);
        if (k === 0) {
          val = (0.36 + 0.2 * Math.sin(PI * fu) * Math.sin(PI * fv)) * tv; T = RED;
        } else {
          const s = (k - 1 + fv) / 4, bul = Math.sin(PI * s), cr = Math.sin(PI * fu);
          val = 0.6 * (0.64 + 0.36 * Math.sqrt(cr)) * (1 + 0.24 * (0.5 - fu)) * (0.8 + 0.2 * Math.sqrt(bul)) * (1 + 0.1 * Math.cos(PI * s)) * tv;
          const she = cr * cr * (0.5 + 0.5 * bul);
          val += 0.36 * sP * she;
          sp = 0.5 * she; sr = 255; sg = 150; sb = 116;
          T = RED;
        }
      } else {
        // weft-faced: gold thread / orange silk / crimson silk floating over the warps
        const gold = cls === GOLD;
        const N = gold ? 6 : 4, k = mod(ci + (gold ? 2 : 1) * cj, N);
        const hr = hash2(cj, 9);
        if (k === 0) {
          // a red binding warp crosses the float
          val = (cls === HOLE ? 0.2 : 0.4) + 0.24 * Math.sin(PI * fu) * Math.sin(PI * fv); T = RED;
        } else {
          const s = (k - 1 + fu) / (N - 1), bul = Math.sin(PI * s), cr = Math.sin(PI * fv);
          // the weft dives to the back where its run ends
          let dip = 1;
          if (CLS[ia - 1] !== cls) dip *= 0.5 + 0.5 * fu;
          if (CLS[ia + 1] !== cls) dip *= 0.5 + 0.5 * (1 - fu);
          val = (0.6 + 0.4 * Math.sqrt(cr)) * (1 + 0.3 * (0.5 - fv)) * (0.74 + 0.26 * Math.sqrt(bul)) * (1 + 0.12 * Math.cos(PI * s)) * dip;
          if (gold) {
            // every gold pick is its own length of thread: some bright, some tarnished
            val *= 0.5 * (hr < 0.12 ? 0.7 : 0.86 + 0.28 * hr);
            const fid = hash2(ci - k, cj * 3 + 1);
            // gilding rubbed off the high spots → the orange core shows
            const wn = vn(u * 0.009 + 2.2, v * 0.009 + 8.8) * 0.55 + vn(u * 0.06, v * 0.05 + 3.3) * 0.25 + fid * 0.3;
            wear = sm((wn - 0.64) / 0.1);
            // metal: whole floats flash where they face the lamp — thick in the pool of light, rare outside it
            const lit = sW * (pool - 0.5) * 1.5;
            const amp = fid > 0.3 ? (fid - 0.3) * 1.43 : 0;
            const sc = (s - 0.4 - 0.18 * mu) / 0.3;
            const gl = Math.exp(-sc * sc) * cr * (0.1 + amp * amp * (0.35 + 1.5 * lit));
            val += gl * 0.75 * (1 - wear);
            const sc2 = (s - 0.45) / 0.3;
            sp = Math.exp(-sc2 * sc2) * cr * (0.25 + 1.2 * fid * fid) * (1 - wear); sr = 255; sg = 238; sb = 176;
            T = GLD;
          } else {
            val *= 0.62 * (0.9 + 0.2 * hr) * (0.95 + 0.1 * vn(u * 0.23 + cj * 7.7, cj * 3.3 + v * 0.7));     // silk filaments
            const she = cr * cr * (0.4 + 0.6 * bul);
            val += 0.32 * sW * she;
            if (cls === FACE) { sp = 0.45 * she; sr = 255; sg = 190; sb = 130; T = ORG; } else { sp = 0.15 * she; sr = 255; sg = 150; sb = 130; T = CRM; }
          }
        }
      }
      // relief: the gold weft lies proud of the ground → lit lip up-left, shadow down-right
      if (cls !== GOLD) {
        if (clsAt(u - 1.6, v - 2.2) === GOLD) val *= 0.7;
        if (clsAt(u - 3.4, v - 4.8) === GOLD) val *= 0.84;
      } else {
        if (clsAt(u - 2.0, v - 2.8) !== GOLD) val += 0.1;
        if (clsAt(u + 2.0, v + 2.8) !== GOLD) val *= 0.82;
      }
      val *= (Fmac[fi] + (Fmac[fi + 1] - Fmac[fi]) * ft) * pool;
      // the stitches press a shallow groove; the weave loosens right at the cut
      const g1 = (dr - STITCH) / 7; val *= 1 - 0.2 * Math.exp(-g1 * g1);
      let loose = 0;
      if (dr > EDGE - 14) { loose = sm((dr - (EDGE - 14)) / 14); val *= 1 - 0.3 * loose * vn(u * 0.4, v * 0.3); }

      let li = (val / VMAX) * (NL - 1); li = li < 0 ? 0 : li > NL - 1 ? NL - 1 : li | 0;
      let cr0 = T[li * 3], cg0 = T[li * 3 + 1], cb0 = T[li * 3 + 2];
      if (wear > 0) {
        let lw = ((val * 0.82) / VMAX) * (NL - 1); lw = lw < 0 ? 0 : lw > NL - 1 ? NL - 1 : lw | 0;
        cr0 += (BARE[lw * 3] - cr0) * wear; cg0 += (BARE[lw * 3 + 1] - cg0) * wear; cb0 += (BARE[lw * 3 + 2] - cb0) * wear;
      }
      d[o] = cr0; d[o + 1] = cg0; d[o + 2] = cb0; d[o + 3] = 255;
      sp *= pool * (1 - loose);
      if (sp > 0.004) { q[o] = sr; q[o + 1] = sg; q[o + 2] = sb; q[o + 3] = sp > 1 ? 255 : sp * 255; }
    }
  }
  const col = L.makeCanvas(LW, BH), spec = L.makeCanvas(LW, BH);
  col.getContext('2d').putImageData(img, 0, 0);
  spec.getContext('2d').putImageData(spI, 0, 0);
  return { col, spec, y0 };
}

// ───────────────────────── indigo homespun (per pixel) ─────────────────────────
function buildIndigo(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const IH = Math.min(LH, Math.ceil(a.yAt(-PAD) + PAD + 26));
  const img = new ImageData(LW, IH), d = img.data;
  const cs = Math.cos(TILT_I), sn = Math.sin(TILT_I);
  const rIn = R + EDGE - 16, rIn2 = rIn * rIn, rAo2 = (R + 60) * (R + 60);
  const IND = lut([[0, '#060f1d'], [0.2, '#0d2038'], [0.4, '#16304f'], [0.55, '#1f3f66'], [0.72, '#2a5080'], [0.9, '#3d689c'], [1.1, '#6388b8'], [1.5, '#a9bfdc']]);
  const SS = 4, NF = Math.ceil(LW / SS) + 2;
  const Fwu = new Float32Array(NF), Fwv = new Float32Array(NF), Flit = new Float32Array(NF), Frub = new Float32Array(NF);
  for (let Y = 0; Y < IH; Y++) {
    const y = Y - PAD, dyc = cy - y;
    for (let i = 0; i < NF; i++) {
      const x = i * SS - PAD;
      Fwu[i] = (vn(x * 0.0031 + 21.3, y * 0.0031 + 3.7) - 0.5) * 18; Fwv[i] = (vn(x * 0.0033 + 5.3, y * 0.0029 + 17.2) - 0.5) * 18;
      // vat dye never takes evenly; lamp from the upper left
      Flit[i] = (0.95 + 0.14 * (vn(x * 0.0021 + 4.4, y * 0.0021 + 1.9) - 0.5)) * (1.1 - 0.4 * sm((Math.hypot((x - 640) * 0.8, (y - 430) * 1.1) - 240) / 1200));
      Frub[i] = sm((vn(x * 0.011 + 3.3, y * 0.011 + 9.9) - 0.42) / 0.3) * 0.16;
    }
    let o = Y * LW * 4;
    for (let X = 0; X < LW; X++, o += 4) {
      const x = X - PAD, dxc = x - cx;
      const r2 = dxc * dxc + dyc * dyc;
      if (r2 < rIn2) continue;
      const fi = X >> 2, ft = (X & 3) * 0.25;
      const u = x * cs + y * sn + Fwu[fi] + (Fwu[fi + 1] - Fwu[fi]) * ft, v = -x * sn + y * cs + Fwv[fi] + (Fwv[fi + 1] - Fwv[fi]) * ft;
      const uu = u / QX, vv = v / QY;
      const ci = Math.floor(uu), cj = Math.floor(vv), fu = uu - ci, fv = vv - cj;
      const au = Math.abs(fu - 0.5) * 2, av = Math.abs(fv - 0.5) * 2;
      let h, dirl, shade;
      if (((ci + cj) & 1) === 0) {
        // warp on top: hand-spun yarn, every end has its own thickness and slubs come and go along it
        const tw = 0.7 + 0.5 * vn(ci * 0.713 + 0.5, v * 0.011 + ci * 3.71);
        const c = 1 - (au / tw) * (au / tw);
        h = c > 0 ? Math.sqrt(c) * (0.45 + 0.55 * Math.cos(av * 1.45)) : 0;
        dirl = 1 + 0.26 * (0.5 - fu) + 0.1 * (0.5 - fv);
        shade = 0.8 + 0.36 * hash2(ci, 1) + 0.18 * (vn(ci * 1.31, v * 0.006) - 0.5);
      } else {
        const tk = 0.7 + 0.5 * vn(u * 0.011 + cj * 5.37, cj * 0.917 + 0.5);
        const c = 1 - (av / tk) * (av / tk);
        h = c > 0 ? Math.sqrt(c) * (0.45 + 0.55 * Math.cos(au * 1.45)) : 0;
        dirl = 1 + 0.26 * (0.5 - fv) + 0.1 * (0.5 - fu);
        shade = 0.84 + 0.36 * hash2(cj, 2) + 0.18 * (vn(u * 0.006, cj * 1.17) - 0.5);
      }
      // the brocade lies on top: contact shadow under its fringe
      let ao = 1;
      if (r2 < rAo2) ao = 1 - 0.55 * Math.exp(-Math.max(0, Math.sqrt(r2) - R - EDGE) / 13);
      const val = (0.2 + 0.4 * Math.sqrt(h)) * dirl * shade * (Flit[fi] + (Flit[fi + 1] - Flit[fi]) * ft) * ao;
      let li = (val / VMAX) * (NL - 1); li = li < 0 ? 0 : li > NL - 1 ? NL - 1 : li | 0;
      let r = IND[li * 3], g = IND[li * 3 + 1], b = IND[li * 3 + 2];
      // rubbed crowns of the yarn go pale (the dye sits on the outside of the fibre); now and then a nep
      const nep = hash2(ci * 3 + 1, cj * 5 + 2);
      const wr = (Frub[fi] + (Frub[fi + 1] - Frub[fi]) * ft + (nep > 0.93 ? (nep - 0.93) * 6 : 0)) * h * h * ao;
      r += (128 - r) * wr; g += (152 - g) * wr; b += (190 - b) * wr;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(LW, IH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ───────────────────────── vector work: lint, stitches, fringe ─────────────────────────
function poly(g, P, ox = 0, oy = 0) {
  g.beginPath(); g.moveTo(P[0][0] + ox, P[0][1] + oy);
  for (let i = 1; i < P.length; i++) g.lineTo(P[i][0] + ox, P[i][1] + oy);
}

function stitchList(env) {
  const a = env.arc, R = a.R, span = a.span(PAD + 60);
  const r = L.rng('s22stitch');
  const out = [];
  let s = -span * R + r.range(0, 20);
  while (s < span * R) {
    const len = r.range(27, 37), gap = r.range(15, 21);
    const p0 = a.pt(s / R, STITCH + r.range(-2, 2)), p1 = a.pt((s + len) / R, STITCH + r.range(-2, 2));
    out.push({ p0, p1, w: r.range(6.4, 7.6), tone: r.range(-0.1, 0.12) });
    s += len + gap;
  }
  return out;
}
/** running stitches in indigo cotton thread, the same yarn as the cloth above */
function drawStitches(g, list) {
  g.save(); g.lineCap = 'round';
  // needle holes and the little dent each stitch presses into the brocade
  for (const t of list) {
    for (const p of [t.p0, t.p1]) {
      g.fillStyle = L.radial(g, p.x, p.y, 0, 10, [[0, 'rgba(34,4,2,0.8)'], [0.45, 'rgba(34,4,2,0.4)'], [1, 'rgba(34,4,2,0)']]);
      g.beginPath(); g.arc(p.x, p.y, 10, 0, L.TAU); g.fill();
    }
    g.strokeStyle = 'rgba(40,5,3,0.42)'; g.lineWidth = t.w + 3.5;
    g.beginPath(); g.moveTo(t.p0.x + 2, t.p0.y + 3.2); g.lineTo(t.p1.x + 2, t.p1.y + 3.2); g.stroke();
  }
  for (const t of list) {
    const dx = t.p1.x - t.p0.x, dy = t.p1.y - t.p0.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    g.strokeStyle = L.shade('#0b1a30', t.tone * 0.4); g.lineWidth = t.w;
    g.beginPath(); g.moveTo(t.p0.x, t.p0.y); g.lineTo(t.p1.x, t.p1.y); g.stroke();
    g.strokeStyle = L.shade('#28507f', t.tone); g.lineWidth = t.w * 0.66;
    g.beginPath(); g.moveTo(t.p0.x + ux, t.p0.y - 0.9 + uy); g.lineTo(t.p1.x - ux, t.p1.y - 0.9 - uy); g.stroke();
    // two-ply twist
    g.lineCap = 'butt';
    for (let s = 3; s < len - 2; s += 3.6) {
      const px = t.p0.x + ux * s, py = t.p0.y + uy * s;
      g.strokeStyle = 'rgba(6,14,30,0.6)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(px - ux * 1.7 + nx * t.w * 0.4, py - uy * 1.7 + ny * t.w * 0.4); g.lineTo(px + ux * 1.7 - nx * t.w * 0.4, py + uy * 1.7 - ny * t.w * 0.4); g.stroke();
    }
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(142,176,224,0.8)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(t.p0.x + ux * 4 - nx * t.w * 0.2, t.p0.y + uy * 4 - ny * t.w * 0.2 - 0.6); g.lineTo(t.p1.x - ux * 5 - nx * t.w * 0.2, t.p1.y - uy * 5 - ny * t.w * 0.2 - 0.6); g.stroke();
  }
  g.restore();
}

/** the frayed cut edge: warp ends standing up over the indigo, a few pulled wefts lying along the cut */
function drawFringe(g, env) {
  const a = env.arc, R = a.R, span = a.span(PAD + 60);
  const r = L.rng('s22fringe');
  const BACK = ['#8f1d12', '#a32315', '#b52a19', '#7a170f'];
  const FRONT = ['#c8321f', '#d23821', '#d23821', '#dc4428', '#e65636', '#ee6c4a', '#b52a19', '#f48a68'];
  const lighter = (c) => L.mix(c, '#ffd2ba', 0.55);
  // pulled weft ends: they keep the crimp the weave pressed into them
  const wefts = [];
  for (let i = 0; i < 20; i++) {
    const t0 = r.range(-span, span), len = r.range(40, 150), dr0 = EDGE + r.range(-4, 8), lift = r.range(-3, 8), ph = r.range(0, 6);
    const P = [];
    for (let s = 0; s <= len; s += 2) {
      const k = s / len, p = a.pt(t0 + s / R, dr0 + lift * k * k + Math.sin(s * 1.05 + ph) * 0.9 + Math.sin(s * 0.07 + ph) * 2);
      P.push([p.x, p.y]);
    }
    wefts.push({ P, c: r.pick(['#e3b341', '#e06a28', '#e3b341', '#a8281a']), w: r.range(1.8, 2.6) });
  }
  // warp ends: a dense short under-layer, then the longer ends that catch the light
  const make = (front) => {
    const n = Math.round((2 * span * R) / (front ? 2.0 : 1.5)), out = [];
    for (let i = 0; i < n; i++) {
      const s = -span * R + ((i + r.range(-0.45, 0.45)) / n) * 2 * span * R, th = s / R;
      const inText = Math.abs(a.pt(th, 0).x - a.cx) < 350;
      // clumps: neighbours lean together, and whole tufts are shorter or longer
      const clump = (vn(s * 0.027 + 7.7, 3.3) - 0.5) * 0.9, tuft = 0.7 + 0.6 * vn(s * 0.019 + 1.1, 8.8);
      let len = front ? (12 + 15 * Math.pow(r(), 1.5)) * tuft : (8 + 9 * r()) * tuft;
      if (front && r.chance(0.04)) len += r.range(8, 20);
      if (inText) len = Math.min(len, 30);
      // warp ends stand along the warp (near-vertical), not along the radius
      const lean = -0.55 * th + clump + r.gauss() * (front ? 0.16 : 0.1);
      const root = EDGE - r.range(1, 9);
      const gold = front && r.chance(0.035);
      out.push({ th, root, len: len + (EDGE - root), lean, bend: r.range(-0.4, 0.4), c: gold ? '#e3b341' : r.pick(front ? FRONT : BACK), w: gold ? 1.3 : front ? r.range(1.5, 2.9) : r.range(2.2, 3.6), fray: front && r.chance(0.35), z: r() });
    }
    return out.sort((p, q2) => p.z - q2.z);
  };
  const back = make(false), front = make(true);
  const path = (t, ox, oy, k0 = 0) => {
    const p = a.pt(t.th, t.root), cs = Math.cos(t.th), sn = Math.sin(t.th);
    const ex = Math.tan(L.clamp(t.lean, -1, 1)) * t.len, ey = -t.len;
    const mx = ex * 0.35 + t.bend * t.len * 0.3, my = ey * 0.55;
    const toX = (lx, ly) => p.x + lx * cs - ly * sn + ox, toY = (lx, ly) => p.y + lx * sn + ly * cs + oy;
    g.beginPath();
    if (k0 > 0) {   // only the outer part of the thread (de Casteljau split of the quadratic at k0)
      const ax = mx * k0, ay = my * k0, bx = mx + (ex - mx) * k0, by = my + (ey - my) * k0, sx = ax + (bx - ax) * k0, sy = ay + (by - ay) * k0;
      g.moveTo(toX(sx, sy), toY(sx, sy)); g.quadraticCurveTo(toX(bx, by), toY(bx, by), toX(ex, ey), toY(ex, ey));
    } else { g.moveTo(toX(0, 0), toY(0, 0)); g.quadraticCurveTo(toX(mx, my), toY(mx, my), toX(ex, ey), toY(ex, ey)); }
    return [toX(ex, ey), toY(ex, ey), Math.atan2(toY(ex, ey) - toY(mx, my), toX(ex, ey) - toX(mx, my))];
  };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // shadows the fringe drops on the cotton (lamp upper-left → they fall down-right, so only a short smear shows)
  g.strokeStyle = 'rgba(4,9,24,0.22)';
  for (const t of front) { g.lineWidth = t.w + 2; path(t, 2.6, 3); g.stroke(); }
  for (const wf of wefts) { g.lineWidth = wf.w + 1.5; poly(g, wf.P, 1.8, 2.4); g.stroke(); }
  for (const t of back) { g.strokeStyle = t.c; g.lineWidth = t.w; path(t, 0, 0); g.stroke(); }
  for (const wf of wefts) {
    g.strokeStyle = L.shade(wf.c, -0.45); g.lineWidth = wf.w; poly(g, wf.P); g.stroke();
    g.strokeStyle = wf.c; g.lineWidth = wf.w * 0.62; poly(g, wf.P, -0.3, -0.45); g.stroke();
    g.strokeStyle = L.rgba(L.shade(wf.c, 0.55), 0.7); g.lineWidth = 0.8; poly(g, wf.P, -0.5, -0.8); g.stroke();
  }
  for (const t of front) {
    g.strokeStyle = L.rgba(L.shade(t.c, -0.35), 0.55); g.lineWidth = t.w + 0.8; path(t, 0.5, 0.5); g.stroke();
    g.strokeStyle = t.c; g.lineWidth = t.w; const tip = path(t, 0, 0); g.stroke();
    // the loose end splays and scatters more light than the tight root
    g.strokeStyle = L.rgba(lighter(t.c), 0.55); g.lineWidth = t.w * 0.9; path(t, 0, 0, 0.5); g.stroke();
    g.strokeStyle = L.rgba(lighter(t.c), 0.7); g.lineWidth = Math.max(0.6, t.w * 0.3); path(t, -0.5, -0.3, 0.15); g.stroke();
    if (t.fray) {
      for (let k = 0; k < 3; k++) {
        const an = tip[2] + r.range(-0.8, 0.8), l2 = r.range(3, 8);
        g.strokeStyle = L.rgba(lighter(t.c), r.range(0.35, 0.7)); g.lineWidth = r.range(0.5, 0.9);
        g.beginPath(); g.moveTo(tip[0], tip[1]); g.lineTo(tip[0] + Math.cos(an) * l2, tip[1] + Math.sin(an) * l2); g.stroke();
      }
    }
  }
  g.restore();
}

/** stray fibres: pale lint caught in the cotton, a few wisps lying on the brocade */
function drawLint(g, env, onBrocade) {
  const a = env.arc, r = L.rng(onBrocade ? 's22lintB' : 's22lint');
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < (onBrocade ? 34 : 420); i++) {
    const x = r.range(-PAD, W + PAD), ya = a.yAt(x), y = onBrocade ? r.range(ya + 70, H + PAD) : r.range(-PAD, ya - 30);
    const len = onBrocade ? r.range(10, 44) : r.range(4, 16), an = r.range(0, Math.PI);
    g.strokeStyle = onBrocade ? L.rgba(r.pick(['#ffd9c2', '#ffe9b8', '#c9d6ee']), r.range(0.12, 0.34)) : L.rgba(r.pick(['#a9c0e6', '#7f9ccb', '#d3e0f6']), r.range(0.05, 0.2));
    g.lineWidth = r.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-6, 6), y + Math.sin(an) * len * 0.5 + r.range(-6, 6), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  g.restore();
}

// ───────────────────────── depth of field ─────────────────────────
/** macro lens focused on the seam: a sharp band across the middle, softening toward the top and the bottom of frame */
function dof(layer) {
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const strip = (Y0, Y1, px, stops) => {
    const hh = Y1 - Y0, c = L.makeCanvas(LW, hh), cg = c.getContext('2d');
    cg.filter = `blur(${px}px)`; cg.drawImage(layer, 0, Y0 - 12, LW, hh + 24, 0, -12, LW, hh + 24); cg.filter = 'none';
    cg.globalCompositeOperation = 'destination-in';
    cg.fillStyle = L.linear(cg, 0, 0, 0, hh, stops); cg.fillRect(0, 0, LW, hh);
    g.drawImage(c, 0, Y0);
  };
  strip(PAD + 820, LH, 2.2, [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']]);
  strip(PAD + 960, LH, 4.2, [[0, 'rgba(0,0,0,0)'], [0.75, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']]);
  strip(0, PAD + 330, 1.5, [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.85)'], [1, 'rgba(0,0,0,0)']]);
  strip(0, PAD + 150, 3, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  g.restore();
}

export default {
  name: '连钱纹织锦',
  tone: 'light',
  init(env) {
    initNoise();
    const t0 = performance.now();
    const indigo = buildIndigo(env);
    const t1 = performance.now();
    const br = buildBrocade(env);
    const t2 = performance.now();
    const stitches = stitchList(env);
    // halation: the gold's highlights bleed a little into the lens
    const bw = Math.round(LW / 4), bh = Math.round(br.col.height / 4);
    const small = L.makeCanvas(bw, bh);
    small.getContext('2d').drawImage(br.spec, 0, 0, bw, bh);
    const bloom = L.blurred(small, 2.5);
    const sharp = L.makeLayer(PAD, (g) => {
      g.drawImage(indigo, -PAD, -PAD);
      drawLint(g, env, false);
      g.drawImage(br.col, -PAD, br.y0);
      g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.4;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(bloom, -PAD, br.y0, LW, br.col.height);
      g.restore();
      drawLint(g, env, true);
      drawStitches(g, stitches);
      drawFringe(g, env);
    });
    // a real lens never resolves thread edges pixel-sharp
    const base = L.blurred(sharp, 0.55);
    const t3 = performance.now();
    dof(base);
    const t4 = performance.now();
    // highlights the threads could give — everything the stitches cover is cut out
    const spec = L.makeLayer(PAD, (g) => {
      g.drawImage(br.spec, -PAD, br.y0);
      g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.strokeStyle = '#000';
      for (const t of stitches) { g.lineWidth = t.w + 2; g.beginPath(); g.moveTo(t.p0.x, t.p0.y); g.lineTo(t.p1.x, t.p1.y); g.stroke(); }
    });
    console.warn(`s22 timing: indigo ${(t1 - t0) | 0}, brocade ${(t2 - t1) | 0}, vector ${(t3 - t2) | 0}, dof ${(t4 - t3) | 0}, spec ${(performance.now() - t4) | 0}`);
    S = { base, spec, tmp: L.makeCanvas(W, H) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.022, p);
    L.blit(ctx, env, S.base, { rot, zoom });
    // lamp-light sliding across the brocade: the baked highlights show only inside a moving window
    const tg = S.tmp.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1;
    tg.clearRect(0, 0, W, H);
    L.blit(tg, env, S.spec, { rot, zoom });
    tg.globalCompositeOperation = 'destination-in';
    const c = a.pt(L.lerp(-0.17, -0.01, p), -200);
    tg.save(); tg.translate(c.x, c.y); tg.rotate(-0.5); tg.scale(1, 1.9);
    tg.fillStyle = L.radial(tg, 0, 0, 30, 360, [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0.06)']]);
    tg.fillRect(-3000, -3000, 6000, 6000);
    tg.restore();
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(S.tmp, 0, 0); ctx.restore();
    L.vignette(ctx, { strength: 0.26, inner: 0.5, outer: 1.1 });
  },
};
