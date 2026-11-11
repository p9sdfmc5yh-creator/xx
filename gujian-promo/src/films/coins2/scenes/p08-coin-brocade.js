// p08 — 连钱纹织锦: a vermilion-ground gold brocade (连钱纹) cut into one huge square-holed coin and laid on orange paper.
// The camera is so close that only a stretch of the round cut edge and one right-angle corner of the square hole are in
// frame (the coin is 2.2 × the standard glyph, its centre below-left of the frame).
// Recipe: the cloth is a per-pixel weave shader evaluated once in init() — the pattern is looked up per THREAD CELL
// (one warp × one weft), so outlines step like a jacquard figure. Cut edges are ragged thread by thread, with a fringe
// of loose warp / weft ends drawn as strokes, and the whole piece casts a soft contact shadow to the lower right.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const LS = 1400, PAD = (LS - S) / 2;
const G = { cx: PAD - 8, cy: PAD + 1088, R: K.COIN.R * 2.3, a: K.COIN.a * 2.3 };   // the big coin, in layer coordinates

const D = 138, RC = D / Math.SQRT2, BW = 11, SQ = 40, SQB = 7, FIL = 6;   // 连钱 lattice
const PX = 3.0, PY = 4.2, TILT = -0.06;                                   // warp pitch, weft pitch, the cloth is not cut square
const OX = PAD + 318, OY = PAD + 596;
const PETAL = 0, FACE = 1, GOLD = 2, HOLE = 3;
// fold lines: [point x, point y, normal x, normal y, half-width, strength]
const FOLDS = [[PAD + 250, PAD + 560, 0.36, 0.933, 15, 0.2], [PAD + 520, PAD + 900, 0.966, -0.259, 13, 0.16]];
const PI = Math.PI;
let layer = null;

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
  const r = L.rng('p08-vn'); NT = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) NT[i] = r();
}
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
  const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
  const a = NT[y0 + x0], b = NT[y0 + x1], c = NT[y1 + x0], d = NT[y1 + x1];
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mod = (n, m) => ((n % m) + m) % m;
const VMAX = 1.5, NL = 512;
function lut(stops) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / VMAX, c]));
  const out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** which thread shows on the face at fabric point (u, v): equal circles on a square lattice, radius = pitch / √2 */
function patternAt(u, v) {
  const a = u / D, b = v / D;
  const ra = (a - Math.round(a)) * D, rb = (b - Math.round(b)) * D;
  const m = Math.max(Math.abs(ra), Math.abs(rb));
  if (m < SQ / 2) return m > SQ / 2 - SQB ? GOLD : HOLE;
  const i0 = Math.floor(a), j0 = Math.floor(b);
  let inside = 0, e = 1e9;
  for (let k = 0; k < 4; k++) {
    const du = (a - i0 - (k & 1)) * D, dv = (b - j0 - (k >> 1)) * D;
    const dist = Math.sqrt(du * du + dv * dv);
    const ek = Math.abs(dist - RC), h = FIL - Math.abs(e - ek);
    e = Math.min(e, ek) - (h > 0 ? (h * h) / (4 * FIL) : 0);
    if (dist < RC) inside++;
  }
  return e < BW / 2 ? GOLD : inside >= 2 ? PETAL : FACE;
}

function buildCloth() {
  const cs = Math.cos(TILT), sn = Math.sin(TILT);
  let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
  for (const [x, y] of [[0, 0], [LS, 0], [0, LS], [LS, LS]]) {
    const fx = x - OX, fy = y - OY, u = fx * cs + fy * sn, v = -fx * sn + fy * cs;
    umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
  }
  const I0 = Math.floor((umin - 60) / PX), I1 = Math.ceil((umax + 60) / PX);
  const J0 = Math.floor((vmin - 60) / PY), J1 = Math.ceil((vmax + 60) / PY);
  const NI = I1 - I0 + 1, NJ = J1 - J0 + 1;
  const CLS = new Uint8Array(NI * NJ);
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) CLS[j * NI + i] = patternAt((I0 + i + 0.5) * PX, (J0 + j + 0.5) * PY);
  {  // tidy the draft: no stray single crossing on an outline
    const C0 = CLS.slice();
    for (let j = 1; j < NJ - 1; j++) for (let i = 1; i < NI - 1; i++) {
      const o = j * NI + i, c = C0[o], l = C0[o - 1], rr = C0[o + 1], up = C0[o - NI], dn = C0[o + NI];
      if ((l === c) + (rr === c) + (up === c) + (dn === c) > 1) continue;
      if (l === rr && l !== c) CLS[o] = l; else if (up === dn && up !== c) CLS[o] = up;
    }
  }
  const RED = lut([[0, '#300604'], [0.2, '#64100b'], [0.4, '#9e2014'], [0.55, '#c8321f'], [0.72, '#da3b21'], [0.9, '#ea4d2a'], [1.1, '#f86c40'], [1.5, '#ffb48e']]);
  const ORG = lut([[0, '#451405'], [0.2, '#84320c'], [0.4, '#c2531a'], [0.55, '#e06a28'], [0.72, '#ee7e30'], [0.9, '#fb9a48'], [1.1, '#ffc084'], [1.5, '#ffe8cf']]);
  const BARE = lut([[0, '#4c1806'], [0.2, '#8a3a0e'], [0.4, '#c95c1c'], [0.55, '#e8742a'], [0.72, '#f68d3a'], [0.9, '#ffad5c'], [1.1, '#ffcf96'], [1.5, '#fff0d8']]);
  const GLD = lut([[0, '#2a1203'], [0.2, '#6b3a0c'], [0.38, '#a36c18'], [0.52, '#cf9a2c'], [0.66, '#e3b341'], [0.82, '#f5d262'], [1.0, '#ffeb9c'], [1.2, '#fff8dc'], [1.5, '#ffffff']]);
  const CRM = lut([[0, '#190403'], [0.3, '#3e0d0a'], [0.55, '#5a1410'], [0.8, '#7e2219'], [1.1, '#b04a38'], [1.5, '#e09880']]);

  const img = new ImageData(LS, LS), d = img.data;
  for (let y = 0; y < LS; y++) {
    const dy = y - G.cy;
    let o = y * LS * 4;
    for (let x = 0; x < LS; x++, o += 4) {
      const dx = x - G.cx, rr = Math.sqrt(dx * dx + dy * dy);
      const sdC = rr - G.R, adx = Math.abs(dx), ady = Math.abs(dy), sdH = G.a - Math.max(adx, ady);
      const sd = Math.max(sdC, sdH);
      if (sd > 1) continue;
      const fx = x - OX, fy = y - OY, u0 = fx * cs + fy * sn, v0 = -fx * sn + fy * cs;
      const u = u0 + (vn(x * 0.0041 + 3.1, y * 0.0041 + 7.7) - 0.5) * 16;
      const v = v0 + (vn(x * 0.0037 + 11.3, y * 0.0045 + 5.2) - 0.5) * 16 + (vn(v0 * 0.043 + 3.3, u0 * 0.0016 + 1.1) - 0.5) * 3.0;
      const uu = u / PX, vv = v / PY, ci = Math.floor(uu), cj = Math.floor(vv), fu = uu - ci, fv = vv - cj;
      // ragged cut: every warp / weft end stops at its own depth, depending on which way the edge runs
      let nx, ny;
      if (sdC > sdH) { nx = dx / rr; ny = dy / rr; } else if (adx > ady) { nx = -Math.sign(dx); ny = 0; } else { nx = 0; ny = -Math.sign(dy); }
      const rag = Math.abs(ny) * hash2(ci, 77) * 6.5 + Math.abs(nx) * hash2(cj, 31) * 6.5;
      const al = -sd - rag + 0.5;
      if (al <= 0) continue;
      const ia = (cj - J0) * NI + (ci - I0);
      const cls = CLS[ia];
      const glint = sm(vn(x * 0.0032 + 5.2, y * 0.0032 + 2.4) * 1.9 - 0.45);
      let val, T;
      if (cls === PETAL) {
        const k = mod(cj + ci, 5), tv = 0.9 + 0.2 * hash2(ci, 3) + 0.12 * (vn(ci * 0.37, v * 0.008) - 0.5);
        if (k === 0) val = (0.36 + 0.2 * Math.sin(PI * fu) * Math.sin(PI * fv)) * tv;
        else {
          const s = (k - 1 + fv) / 4, bul = Math.sin(PI * s), cr = Math.sin(PI * fu);
          val = 0.6 * (0.64 + 0.36 * Math.sqrt(cr)) * (1 + 0.24 * (0.5 - fu)) * (0.8 + 0.2 * Math.sqrt(bul)) * (1 + 0.1 * Math.cos(PI * s)) * tv;
          val += 0.2 * glint * cr * cr * (0.5 + 0.5 * bul);
        }
        T = RED;
      } else {
        const gold = cls === GOLD, N = gold ? 6 : 4, k = mod(ci + (gold ? 2 : 1) * cj, N), hr = hash2(cj, 9);
        if (k === 0) { val = (cls === HOLE ? 0.2 : 0.4) + 0.24 * Math.sin(PI * fu) * Math.sin(PI * fv); T = RED; }
        else {
          const s = (k - 1 + fu) / (N - 1), bul = Math.sin(PI * s), cr = Math.sin(PI * fv);
          let dip = 1;
          if (CLS[ia - 1] !== cls) dip *= 0.5 + 0.5 * fu;
          if (CLS[ia + 1] !== cls) dip *= 0.5 + 0.5 * (1 - fu);
          val = (0.6 + 0.4 * Math.sqrt(cr)) * (1 + 0.3 * (0.5 - fv)) * (0.74 + 0.26 * Math.sqrt(bul)) * (1 + 0.12 * Math.cos(PI * s)) * dip;
          if (gold) {
            val *= 0.66 * (hr < 0.12 ? 0.7 : 0.86 + 0.28 * hr);
            val += 0.5 * glint * cr * cr * bul;
            T = hash2(ci - k, cj * 3 + 1) < 0.06 ? BARE : GLD;      // gilding rubbed off → the orange core shows
          } else if (cls === FACE) { val *= 0.62 * (0.9 + 0.2 * hr); T = ORG; }
          else { val *= 0.6 * (0.9 + 0.2 * hr); T = CRM; }
        }
      }
      // the lie of the cloth + light pooling from the upper left + a lit / shaded lip along the cut
      const mac = 1 - 0.2 * ((vn(x * 0.0026 + 1.3, y * 0.0026 + 4.1) - 0.5) * 1.2 + (vn(x * 0.0026 + 9.1, y * 0.0026 + 2.7) - 0.5) * 1.6);
      const pool = 1.14 - 0.34 * sm(Math.hypot(x - PAD - 260, y - PAD - 420) / 1150);
      const lip = 1 + 0.16 * (-(nx + ny) * 0.707) * sm((sd + 7) / 7);
      // two old fold lines pressed into the cloth: a low ridge, lit on the side that faces the upper left
      let fold = 1;
      for (let q = 0; q < 2; q++) {
        const F = FOLDS[q], dd = ((x - F[0]) * F[2] + (y - F[1]) * F[3]) / F[4] + (vn(x * 0.006 + q * 7, y * 0.006) - 0.5) * 0.7;
        fold += F[5] * dd * Math.exp(-dd * dd) * (-(F[2] + F[3]) * 0.707) * 2;
      }
      let t = (val * mac * pool * lip * fold) / VMAX; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const li = Math.round(t * (NL - 1)) * 3;
      d[o] = T[li]; d[o + 1] = T[li + 1]; d[o + 2] = T[li + 2]; d[o + 3] = al >= 1 ? 255 : al * 255;
    }
  }
  const c = L.makeCanvas(LS, LS); c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

function thread(f, r, x, y, dx, dy, len, col, w) {
  const bx = -dy, by = dx, b = r.range(-0.4, 0.4) * len, mb = b * r.range(-0.3, 0.7);
  const ex = x + dx * len + bx * b, ey = y + dy * len + by * b, mx = x + dx * len * 0.5 + bx * mb, my = y + dy * len * 0.5 + by * mb;
  f.strokeStyle = L.shade(col, -0.28); f.lineWidth = w + 0.7; f.beginPath(); f.moveTo(x, y); f.quadraticCurveTo(mx, my, ex, ey); f.stroke();
  f.strokeStyle = col; f.lineWidth = w; f.beginPath(); f.moveTo(x - 0.25, y - 0.25); f.quadraticCurveTo(mx - 0.25, my - 0.25, ex - 0.25, ey - 0.25); f.stroke();
  f.strokeStyle = 'rgba(255,236,200,0.38)'; f.lineWidth = w * 0.36; f.beginPath(); f.moveTo(x - 0.5, y - 0.5); f.quadraticCurveTo(mx - 0.5, my - 0.5, ex - 0.5, ey - 0.5); f.stroke();
}

function buildFringe() {
  const c = L.makeCanvas(LS, LS), f = c.getContext('2d'); f.lineCap = 'round';
  const r = L.rng('p08fringe');
  const cs = Math.cos(TILT), sn = Math.sin(TILT);
  const WARP = ['#c8321f', '#b82a1a', '#d63c22', '#a82416'], WEFT = ['#d9a534', '#e8bc4a', '#c98f24', '#e06a28', '#ee7e30', '#7e2219'];
  const emit = (x, y, nx, ny, k = 1) => {
    const wv = nx * -sn + ny * cs, wu = nx * cs + ny * sn;       // how much the warp / weft direction points out of the cloth
    if (r() < 0.62 * Math.abs(wv)) { const s = Math.sign(wv); thread(f, r, x - nx * 5, y - ny * 5, -sn * s, cs * s, (5 + r.range(3, 15) * Math.abs(wv)) * k, r.pick(WARP), r.range(1.3, 1.9)); }
    if (r() < 0.55 * Math.abs(wu)) { const s = Math.sign(wu); thread(f, r, x - nx * 5, y - ny * 5, cs * s, sn * s, (5 + r.range(3, 18) * Math.abs(wu)) * k, r.pick(WEFT), r.range(1.4, 2.2)); }
  };
  for (let t = -PI / 2 - 0.2; t < 0.2; t += 2.1 / G.R) emit(G.cx + Math.cos(t) * G.R, G.cy + Math.sin(t) * G.R, Math.cos(t), Math.sin(t));
  for (let x = G.cx - G.a; x < G.cx + G.a - 2; x += 2.1) emit(x, G.cy - G.a, 0, 1, 0.9);
  for (let y = G.cy - G.a + 2; y < G.cy + G.a; y += 2.1) emit(G.cx + G.a, y, -1, 0, 0.9);
  // a few long pulled threads that curl away from the cut
  const long = (x, y, nx, ny) => {
    const tx = -ny, ty = nx, sgn = r() < 0.5 ? -1 : 1, len = r.range(34, 96), out = r.range(0.25, 0.75);
    const dx = tx * sgn * (1 - out) + nx * out, dy = ty * sgn * (1 - out) + ny * out, col = r.pick(r() < 0.5 ? WARP : WEFT), w = r.range(1.4, 2.0);
    const x0 = x - nx * 6, y0 = y - ny * 6, c1 = r.range(-0.5, 0.5) * len, c2 = r.range(-0.5, 0.5) * len;
    const p = (ox, oy) => { f.beginPath(); f.moveTo(x0 + ox, y0 + oy); f.bezierCurveTo(x0 + dx * len * 0.35 + nx * c1 + ox, y0 + dy * len * 0.35 + ny * c1 + oy, x0 + dx * len * 0.7 - nx * c2 + ox, y0 + dy * len * 0.7 - ny * c2 + oy, x0 + dx * len + ox, y0 + dy * len + oy); f.stroke(); };
    f.strokeStyle = L.shade(col, -0.3); f.lineWidth = w + 0.7; p(0, 0);
    f.strokeStyle = col; f.lineWidth = w; p(-0.25, -0.25);
    f.strokeStyle = 'rgba(255,236,200,0.4)'; f.lineWidth = w * 0.36; p(-0.5, -0.5);
  };
  for (let i = 0; i < 16; i++) { const t = -PI / 2 + r.range(0.02, 0.98) * PI / 2; long(G.cx + Math.cos(t) * G.R, G.cy + Math.sin(t) * G.R, Math.cos(t), Math.sin(t)); }
  for (let i = 0; i < 4; i++) long(G.cx + r.range(-G.a * 0.5, G.a * 0.95), G.cy - G.a, 0, 1);
  for (let i = 0; i < 4; i++) long(G.cx + G.a, G.cy - r.range(-G.a * 0.1, G.a * 0.95), -1, 0);
  return c;
}

function build() {
  initNoise();
  const c = L.makeCanvas(LS, LS), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#eaa232', tone: '#a2520f', seed: 'p08paper', fiber: 0.7, stain: 0.32, grain: 0.13, foxing: 0.16, edge: 0.16, size: LS }), 0, 0);
  const cloth = buildCloth(), fringe = buildFringe();
  // broad soft shadow of the whole piece, then the fringe with its own tight shadow, then the cloth with a contact shadow
  g.save(); g.shadowColor = 'rgba(96,40,4,0.30)'; g.shadowBlur = 34; g.shadowOffsetX = 13; g.shadowOffsetY = 19; g.drawImage(cloth, 0, 0); g.restore();
  g.save(); g.shadowColor = 'rgba(84,34,4,0.5)'; g.shadowBlur = 3.5; g.shadowOffsetX = 2.2; g.shadowOffsetY = 3.4; g.drawImage(fringe, 0, 0); g.restore();
  g.save(); g.shadowColor = 'rgba(70,26,2,0.55)'; g.shadowBlur = 9; g.shadowOffsetX = 4.5; g.shadowOffsetY = 7; g.drawImage(cloth, 0, 0); g.restore();
  return c;
}

export default {
  name: '连钱纹织锦',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.04, x0: 8, y0: -6, x1: -10, y1: 8 });
  },
};
