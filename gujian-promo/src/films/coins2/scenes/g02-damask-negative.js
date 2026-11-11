// g02 — 连钱纹缎·留白: an ochre-yellow self-patterned satin damask (暗花缎) fills the page, woven with the 连钱 lattice;
// the coin glyph is a patch of PLAIN ground left in the figure (negative form): warp-faced satin, a little lighter than
// the pattern, closed off by a narrow weft-faced selvage line and a hair of ground, the way a woven reserve ends.
// Recipe: a per-pixel weave shader evaluated once in init() at 2 × and box-filtered down. The draft (which face shows)
// is looked up per THREAD CELL (one warp × one weft), so every outline steps like a jacquard figure. Ground = 5-end
// warp satin (vertical floats, glossy), figure = 5-end weft satin (horizontal floats, matte, darker). Light from top-left.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const SS = 2;                                   // supersampling
const PX = 3, PY = 3.6;                         // warp pitch, weft pitch (px)
const D = 120, RC = D / Math.SQRT2;             // 连钱 lattice: equal circles, radius = pitch / √2, one centred on the glyph
const PI = Math.PI;
const PLAIN = 0, FIG = 1, GRD = 2;              // plain reserve (warp face) · figure (weft face) · ground inside the pattern (warp face)
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
  const r = L.rng('g02-vn'); NT = new Float32Array(65536);
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

/** which face shows at cloth point (x, y) */
function draftAt(x, y) {
  const sd = K.sdGlyph(x, y);
  if (sd < -1) return PLAIN;                    // the reserve: plain satin
  if (sd < 6) return FIG;                       // selvage line closing the reserve
  if (sd < 10.5) return GRD;                    // a hair of ground before the pattern starts
  const a = (x - K.GLYPH.cx) / D, b = (y - K.GLYPH.cy) / D;
  const ra = (a - Math.round(a)) * D, rb = (b - Math.round(b)) * D;
  const m = Math.max(Math.abs(ra), Math.abs(rb));
  if (m < 22) return m > 15 ? GRD : m < 5.5 ? GRD : FIG;        // the little square hole of every woven coin: light frame, dark field, a pip
  const i0 = Math.floor(a), j0 = Math.floor(b);
  let inside = 0, e = 1e9;
  for (let k = 0; k < 4; k++) {
    const du = (a - i0 - (k & 1)) * D, dv = (b - j0 - (k >> 1)) * D;
    const dist = Math.sqrt(du * du + dv * dv);
    e = Math.min(e, Math.abs(dist - RC));
    if (dist < RC) inside++;
  }
  if (e < 4.2) return GRD;                      // the circle lines: bright warp-faced bands, interlocking
  if (inside >= 2) {                            // petal where two circles overlap: solid weft face
    const fa = (a - Math.floor(a) - 0.5) * D, fb = (b - Math.floor(b) - 0.5) * D;
    const d1 = Math.hypot(fa, rb), d2 = Math.hypot(ra, fb);
    if (Math.min(d1, d2) < 6.5) return GRD;     // seed in the petal's heart
    return FIG;
  }
  // the coin's face: a twill half-tone (two ends weft face, two ends warp face, stepping one end per pick)
  const ci = Math.floor(x / PX), cj = Math.floor(y / PY);
  return mod(ci + cj, 4) < 2 ? FIG : GRD;
}

function build() {
  initNoise();
  const I0 = -8, J0 = -8, NI = Math.ceil(S / PX) + 16, NJ = Math.ceil(S / PY) + 16;
  const CLS = new Uint8Array(NI * NJ);
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) CLS[j * NI + i] = draftAt((I0 + i + 0.5) * PX, (J0 + j + 0.5) * PY);
  {  // tidy the draft: no stray single crossing on an outline
    const C0 = CLS.slice();
    for (let j = 1; j < NJ - 1; j++) for (let i = 1; i < NI - 1; i++) {
      const o = j * NI + i, c = C0[o], l = C0[o - 1], rr = C0[o + 1], up = C0[o - NI], dn = C0[o + NI];
      if ((l === c) + (rr === c) + (up === c) + (dn === c) > 1) continue;
      if (l === rr && l !== c) CLS[o] = l; else if (up === dn && up !== c) CLS[o] = up;
    }
  }
  const WARP = lut([[0, '#3b2206'], [0.25, '#7c4f10'], [0.45, '#ae7a1e'], [0.62, '#c9952c'], [0.78, '#dcae40'], [0.95, '#ecc65e'], [1.15, '#f8e095'], [1.5, '#fff6d6']]);
  const WEFT = lut([[0, '#301a04'], [0.25, '#6a400c'], [0.45, '#955f16'], [0.62, '#b07a20'], [0.78, '#c48f2c'], [0.95, '#d9aa48'], [1.15, '#eccb7c'], [1.5, '#faeab8']]);
  const HS = S * SS;
  const img = new ImageData(HS, HS), d = img.data;
  // storage folds: [point x, point y, normal x, normal y, half-width, strength]
  const FOLDS = [[0, 372, 0.03, 0.9995, 22, 0.07], [708, 0, 0.9997, 0.025, 20, 0.06]];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // slow fields, once per page pixel
      const dxw = (vn(x * 0.0041 + 3.1, y * 0.0041 + 7.7) - 0.5) * 5;
      const dyw = (vn(x * 0.0037 + 11.3, y * 0.0045 + 5.2) - 0.5) * 5 + (vn(y * 0.043 + 3.3, x * 0.0016 + 1.1) - 0.5) * 1.1;
      const slope = vn(x * 0.0052 + 9.1, y * 0.0046 + 4.3) - 0.5 + (vn(x * 0.013 + 2.2, y * 0.011 + 8.8) - 0.5) * 0.35;
      const glint = sm(vn(x * 0.0034 + 5.2, y * 0.0034 + 2.4) * 1.9 - 0.45);
      let sh = 1.07 - 0.15 * ((x + y) / (2 * S));
      for (const f of FOLDS) {
        const t = ((x - f[0]) * f[2] + (y - f[1]) * f[3]) / f[4];
        if (t > -4 && t < 4) sh *= 1 - f[5] * 2.33 * t * Math.exp(-t * t);
      }
      const lw = sh * (1 + 0.42 * slope), lf = sh * (1 - 0.24 * slope);
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = x + (sx + 0.5) / SS + dxw, v = y + (sy + 0.5) / SS + dyw;
        const uu = u / PX, vv = v / PY, ci = Math.floor(uu), cj = Math.floor(vv), fu = uu - ci, fv = vv - cj;
        const ia = (cj - J0) * NI + (ci - I0);
        const cls = CLS[ia];
        let val, T;
        if (cls !== FIG) {                      // warp-faced satin: vertical floats over four wefts
          const k = mod(cj + 2 * ci, 5), tv = 0.92 + 0.16 * hash2(ci, 3) + 0.1 * (vn(ci * 0.37, v * 0.008) - 0.5);
          if (k === 0) { val = (0.74 + 0.16 * Math.sin(PI * fu) * Math.sin(PI * fv)) * tv * lf; T = WEFT; }
          else {
            const s = (k - 1 + fv) / 4, bul = Math.sin(PI * s), cr = Math.sin(PI * fu);
            let dip = 1;
            if (CLS[ia - NI] === FIG) dip *= 0.55 + 0.45 * fv;
            if (CLS[ia + NI] === FIG) dip *= 0.55 + 0.45 * (1 - fv);
            val = 0.9 * (0.66 + 0.34 * Math.sqrt(cr)) * (1 + 0.22 * (0.5 - fu)) * (0.82 + 0.18 * Math.sqrt(bul)) * (1 + 0.1 * Math.cos(PI * s)) * tv * dip;
            val += 0.2 * glint * cr * cr * (0.5 + 0.5 * bul);
            val *= lw * (cls === PLAIN ? 1.05 : 0.985);
            T = WARP;
          }
        } else {                                // weft-faced satin: horizontal floats over four warps
          const k = mod(ci + 2 * cj, 5), hr = hash2(cj, 9), tv = 0.9 + 0.2 * hr + 0.08 * (vn(u * 0.008, cj * 0.37) - 0.5);
          if (k === 0) { val = (0.4 + 0.2 * Math.sin(PI * fu) * Math.sin(PI * fv)) * tv * lw; T = WARP; }
          else {
            const s = (k - 1 + fu) / 4, bul = Math.sin(PI * s), cr = Math.sin(PI * fv);
            let dip = 1;
            if (CLS[ia - 1] !== FIG) dip *= 0.55 + 0.45 * fu;
            if (CLS[ia + 1] !== FIG) dip *= 0.55 + 0.45 * (1 - fu);
            val = 0.6 * (0.64 + 0.36 * Math.sqrt(cr)) * (1 + 0.26 * (0.5 - fv)) * (0.8 + 0.2 * Math.sqrt(bul)) * (1 + 0.1 * Math.cos(PI * s)) * tv * dip;
            val += 0.08 * glint * cr * cr * bul;
            val *= lf;
            T = WEFT;
          }
        }
        let q = Math.round((val / VMAX) * (NL - 1)); q = q < 0 ? 0 : q > NL - 1 ? NL - 1 : q; q *= 3;
        const o = ((y * SS + sy) * HS + x * SS + sx) * 4;
        d[o] = T[q]; d[o + 1] = T[q + 1]; d[o + 2] = T[q + 2]; d[o + 3] = 255;
      }
    }
  }
  const hi = L.makeCanvas(HS, HS); hi.getContext('2d').putImageData(img, 0, 0);
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(hi, 0, 0, HS, HS, 0, 0, S, S);

  // a few pulled / broken thread ends and lint lying on the satin (each with a small shadow to the lower right)
  const r = L.rng('g02-lint');
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = r.range(30, S - 30), y = r.range(30, S - 30), horiz = r.chance(0.5), len = r.range(9, 30), bow = r.range(-3.5, 3.5);
    const ex = horiz ? len : r.range(-2, 2), ey = horiz ? r.range(-2, 2) : len;
    for (const pass of [0, 1]) {
      g.strokeStyle = pass === 0 ? 'rgba(52,30,6,0.34)' : L.rgba('#f6dc98', r.range(0.4, 0.7));
      g.lineWidth = pass === 0 ? 1.9 : 1.25;
      const ox = pass === 0 ? 1.3 : 0, oy = pass === 0 ? 1.8 : 0;
      g.beginPath(); g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ex * 0.5 + (horiz ? 0 : bow) + ox, y + ey * 0.5 + (horiz ? bow : 0) + oy, x + ex + ox, y + ey + oy); g.stroke();
    }
  }
  return c;
}

export default {
  name: '连钱纹缎·留白',
  init() { layer = build(); },
  draw(ctx) {
    ctx.drawImage(layer, 0, 0);          // a 6-frame flash: perfectly still
  },
};
