// g02 — 连钱纹缎·留白: an ochre-yellow self-patterned satin damask (暗花缎) fills the page, woven with the 连钱 lattice;
// the CURRENT GLYPH is a patch of PLAIN ground left in the figure (negative form): warp-faced satin, clearly paler and
// brighter than the pattern, closed off by a narrow weft-faced selvage line, the way a woven reserve ends.
// Recipe: a per-pixel weave shader evaluated once in init() at DEVICE resolution (L.pixelCanvas, supersampled per device
// pixel). The draft (which face shows) is looked up per THREAD CELL (one warp × one weft) from K.sdGlyph, so every outline
// steps like a jacquard figure. Ground = 5-end warp satin (vertical floats, glossy), figure = 5-end weft satin (horizontal
// floats, matte, darker). The figured cloth stands a little proud of the reserve: it throws a soft shadow into the plain
// ground along the upper-left edges and catches the light on the lower-right ones. Light from top-left.
// Nothing here knows which character it is: thread pitch, lattice pitch, selvage and relief all follow glyphInfo().strokeWidth.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
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
const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);
const VMAX = 1.5, NL = 512;
function lut(stops) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / VMAX, c]));
  const out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
// the cloth does not lie perfectly square on the table: slow drift of the threads (px), as functions of the page position
const dxwF = (x, y) => (vn(x * 0.0041 + 3.1, y * 0.0041 + 7.7) - 0.5) * 5;
const dywF = (x, y) => (vn(x * 0.0037 + 11.3, y * 0.0045 + 5.2) - 0.5) * 5 + (vn(y * 0.043 + 3.3, x * 0.0016 + 1.1) - 0.5) * 1.1;
const toneF = (x, y) => 0.955 + 0.075 * vn(x * 0.0068 + 31.4, y * 0.0074 + 17.9) + 0.035 * (vn(x * 0.031 + 4.4, y * 0.027 + 12.6) - 0.5);   // old cloth: faint toning
const slopeF = (x, y) => vn(x * 0.0052 + 9.1, y * 0.0046 + 4.3) - 0.5 + (vn(x * 0.013 + 2.2, y * 0.011 + 8.8) - 0.5) * 0.35;
const glintF = (x, y) => sm(vn(x * 0.0034 + 5.2, y * 0.0034 + 2.4) * 1.9 - 0.45);

function build() {
  initNoise();
  const info = K.glyphInfo(), sw = info.strokeWidth;
  // everything is sized from the stroke width of whatever glyph this is
  const PX = Math.round(clampf(sw / 30, 1.5, 2) * 2) / 2, PY = PX * 1.2;    // warp pitch, weft pitch (px); 6 warps = 5 wefts
  const D = 6 * PX * Math.max(3, Math.round((sw * 1.62) / (6 * PX)));       // 连钱 lattice pitch: a whole number of threads both ways
  const RC = D / Math.SQRT2;                                                // equal circles, radius = pitch / √2
  const C = S / 2;                                                          // a coin of the lattice sits on the page centre
  const BAND = clampf(sw * 0.085, 2.6, 6.5);                                // the weft-faced selvage line that closes the reserve
  const LINE = Math.max(D * 0.03, PX * 0.8);                                // half-width of the circle lines
  const FLO = D * 0.13;                                                     // the floret in a coin's centre
  const SL = Math.max(1.8, sw * 0.07);                                      // length of the shadow the figured cloth throws into the reserve
  const LX = -Math.SQRT1_2, LY = -Math.SQRT1_2;                             // toward the light (top-left)

  /** which face shows at the crossing whose centre is cloth point (u, v) */
  const draftAt = (u, v, ci, cj) => {
    const sd = K.sdGlyph(u - dxwF(u, v), v - dywF(u, v));                   // the glyph is registered to the PAGE, not to the drifting cloth
    if (sd < 0) return PLAIN;                                               // the reserve: plain satin
    if (sd < BAND) return FIG;                                              // selvage line closing the reserve
    const a = (u - C) / D, b = (v - C) / D;
    const ra = (a - Math.round(a)) * D, rb = (b - Math.round(b)) * D;
    if (Math.abs(ra) + Math.abs(rb) < FLO) return GRD;                      // a small light floret in the heart of every woven coin
    const i0 = Math.floor(a), j0 = Math.floor(b);
    let inside = 0, e = 1e9;
    for (let k = 0; k < 4; k++) {
      const du = (a - i0 - (k & 1)) * D, dv = (b - j0 - (k >> 1)) * D;
      const dist = Math.sqrt(du * du + dv * dv);
      e = Math.min(e, Math.abs(dist - RC));
      if (dist < RC) inside++;
    }
    if (e < LINE) return GRD;                                               // the circle lines: warp-faced bands, interlocking
    if (inside >= 2) return FIG;                                            // petal where two circles overlap: solid weft face, left plain
    return (mod(ci + cj, 4) < 2 ? FIG : GRD) | 4;                           // the coin's face: a twill half-tone (flagged with bit 2)
  };

  // ── the draft, one entry per thread crossing ──
  const I0 = -(Math.ceil((C + 6) / PX) + 2), NI = -2 * I0 + 1, J0 = -(Math.ceil((C + 6) / PY) + 2), NJ = -2 * J0 + 1;
  const CLS = new Uint8Array(NI * NJ), HALF = new Uint8Array(NI * NJ);
  for (let j = 0, o = 0; j < NJ; j++) for (let i = 0; i < NI; i++, o++) {
    const c = draftAt(C + (I0 + i + 0.5) * PX, C + (J0 + j + 0.5) * PY, I0 + i, J0 + j);
    CLS[o] = c & 3; HALF[o] = c >> 2;
  }
  {  // tidy the draft: no stray single crossing on an outline
    const C0 = CLS.slice();
    for (let j = 1; j < NJ - 1; j++) for (let i = 1; i < NI - 1; i++) {
      const o = j * NI + i, c = C0[o], l = C0[o - 1], rr = C0[o + 1], up = C0[o - NI], dn = C0[o + NI];
      if ((l === c) + (rr === c) + (up === c) + (dn === c) > 1) continue;
      if (l === rr && l !== c) CLS[o] = l; else if (up === dn && up !== c) CLS[o] = up;
    }
  }
  // thread-level relief: weft-faced figure stands a hair proud — lit on its upper-left steps, shading what lies to its lower right
  const REL = new Float32Array(NI * NJ).fill(1);
  for (let j = 1; j < NJ - 1; j++) for (let i = 1; i < NI - 1; i++) {
    const o = j * NI + i, c = CLS[o], l = CLS[o - 1] === FIG, rr = CLS[o + 1] === FIG, up = CLS[o - NI] === FIG, dn = CLS[o + NI] === FIG;
    const A = HALF[o] ? 0.3 : 1;                                            // (kept faint inside the half-tone, where every crossing is an edge)
    REL[o] = c === FIG ? 1 + A * (0.1 * (!l + !up) - 0.08 * (!rr + !dn)) : 1 + A * (-0.09 * (l + up) + 0.03 * (rr + dn));
  }
  const TVC = new Float32Array(NI), TVR = new Float32Array(NJ);             // every thread has its own thickness / dye uptake
  for (let i = 0; i < NI; i++) TVC[i] = 0.92 + 0.16 * hash2(I0 + i, 3);
  for (let j = 0; j < NJ; j++) TVR[j] = 0.9 + 0.2 * hash2(J0 + j, 9);
  const FIB = new Float32Array(1024);                                       // filaments inside a thread
  for (let i = 0; i < 1024; i++) FIB[i] = 1 + 0.07 * (hash2(i, 17) - 0.5);
  const NU = 256, SIN = new Float32Array(NU), SQ = new Float32Array(NU), COS = new Float32Array(NU), SPC = new Float32Array(NU);
  for (let i = 0; i < NU; i++) {
    const t = (i + 0.5) / NU;
    SIN[i] = Math.sin(PI * t); SQ[i] = Math.sqrt(SIN[i]); COS[i] = Math.cos(PI * t); SPC[i] = Math.exp(-(((t - 0.36) / 0.14) ** 2));
  }
  // slow fields on a coarse grid (bilinear in the pixel loop)
  const GS = 4, GN = Math.ceil(S / GS) + 2;
  const gDX = new Float32Array(GN * GN), gDY = new Float32Array(GN * GN), gSL = new Float32Array(GN * GN), gGL = new Float32Array(GN * GN), gTN = new Float32Array(GN * GN);
  for (let j = 0, o = 0; j < GN; j++) for (let i = 0; i < GN; i++, o++) {
    const x = i * GS, y = j * GS;
    gDX[o] = dxwF(x, y); gDY[o] = dywF(x, y); gSL[o] = slopeF(x, y); gGL[o] = glintF(x, y); gTN[o] = toneF(x, y);
  }
  const WARP = lut([[0, '#3b2206'], [0.25, '#7c4f10'], [0.45, '#ae7a1e'], [0.62, '#c9952c'], [0.78, '#dcae40'], [0.95, '#ecc65e'], [1.15, '#f8e095'], [1.5, '#fff6d6']]);
  const WEFT = lut([[0, '#301a04'], [0.25, '#6a400c'], [0.45, '#955f16'], [0.62, '#b07a20'], [0.78, '#c48f2c'], [0.95, '#d9aa48'], [1.15, '#eccb7c'], [1.5, '#faeab8']]);
  const F_PLAIN = 1.34, F_GRD = 0.74, F_FIG = 0.92;                         // the reserve reads clearly paler than the figured cloth
  // storage folds: [point x, point y, normal x, normal y, half-width, strength]
  const FOLDS = [[0, 372, 0.03, 0.9995, 30, 0.085], [708, 0, 0.9997, 0.025, 28, 0.075]];
  const QS = (NL - 1) / VMAX;

  const weave = L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const SUB = q >= 2 ? 2 : 3, inv = 1 / (SUB * SUB);
    const offs = new Float32Array(SUB);
    for (let k = 0; k < SUB; k++) offs[k] = ((k + 0.5) / SUB - 0.5) / q;
    for (let j = 0; j < ph; j++) {
      const y = (j + 0.5) / q, gy = y / GS, gj = gy | 0, fy = gy - gj, o0 = gj * GN, o1 = o0 + GN;
      for (let i = 0; i < pw; i++) {
        const x = (i + 0.5) / q, gx = x / GS, gi = gx | 0, fx = gx - gi;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy, a0 = o0 + gi, a1 = o1 + gi;
        const dxw = gDX[a0] * w00 + gDX[a0 + 1] * w10 + gDX[a1] * w01 + gDX[a1 + 1] * w11;
        const dyw = gDY[a0] * w00 + gDY[a0 + 1] * w10 + gDY[a1] * w01 + gDY[a1 + 1] * w11;
        const slope = gSL[a0] * w00 + gSL[a0 + 1] * w10 + gSL[a1] * w01 + gSL[a1 + 1] * w11;
        const glint = gGL[a0] * w00 + gGL[a0 + 1] * w10 + gGL[a1] * w01 + gGL[a1 + 1] * w11;
        let sh = (1.07 - 0.15 * ((x + y) / (2 * S))) * (gTN[a0] * w00 + gTN[a0 + 1] * w10 + gTN[a1] * w01 + gTN[a1 + 1] * w11);
        for (let f = 0; f < FOLDS.length; f++) {
          const F = FOLDS[f], t = ((x - F[0]) * F[2] + (y - F[1]) * F[3]) / F[4];
          if (t > -4 && t < 4) sh *= 1 - F[5] * 2.33 * t * Math.exp(-t * t);
        }
        // the step between the figured cloth and the reserve
        const sd = K.sdGlyph(x, y);
        if (sd > -SL * 2.6 && sd < SL * 1.2) {
          const s2 = K.sdGlyph(x + LX * SL, y + LY * SL);                   // look toward the light
          if (sd < 2) sh *= 1 - 0.36 * sm((s2 + SL * 0.3) / (SL * 0.9)) * (sd < 0 ? 1 : 1 - sd / 2);      // cast shadow inside the upper-left edges
          if (sd < 0) sh *= 1 - 0.08 * sm(1 + sd / (SL * 1.6));                                          // the sunk ground is a little occluded all round its rim
          if (sd > -1) sh *= 1 + 0.42 * sm(-s2 / (SL * 0.6)) * sm(1 - Math.max(0, sd) / (SL * 0.8));     // lit lip on the lower-right edges
        }
        const lw = sh * (1 + 0.36 * slope), lf = sh * (1 - 0.22 * slope);
        const uc = x + dxw - C, vc = y + dyw - C;                           // cloth coordinates, measured from the page centre
        const cic = Math.floor(uc / PX), cjc = Math.floor(vc / PY);
        const tw = 0.1 * (vn(cic * 0.37 + 40.5, vc * 0.008 + 9.5) - 0.5), tf = 0.08 * (vn(uc * 0.008 + 21.5, cjc * 0.37 + 60.5) - 0.5);
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < SUB; sy++) {
          const vv = (vc + offs[sy]) / PY, cj = Math.floor(vv), fv = vv - cj, vi = (fv * NU) | 0, jr = (cj - J0) * NI - I0;
          for (let sx = 0; sx < SUB; sx++) {
            const uu = (uc + offs[sx]) / PX, ci = Math.floor(uu), fu = uu - ci, ui = (fu * NU) | 0;
            const ia = jr + ci, cls = CLS[ia];
            let val, T;
            if (cls !== FIG) {                    // warp-faced satin: vertical floats over four wefts
              const n = cj + 2 * ci; let k = n % 5; if (k < 0) k += 5;
              const tv = TVC[ci - I0] + tw;
              if (k === 0) { val = (0.74 + 0.16 * SIN[ui] * SIN[vi]) * tv * lf * (cls === PLAIN ? 1.3 : 0.86); T = WEFT; }
              else {
                const s = (k - 1 + fv) * 0.25, si = (s * NU) | 0, bul = SIN[si], cr = SIN[ui];
                let dip = 1;
                if (CLS[ia - NI] === FIG) dip *= 0.55 + 0.45 * fv;
                if (CLS[ia + NI] === FIG) dip *= 0.55 + 0.45 * (1 - fv);
                val = 0.9 * (0.66 + 0.34 * SQ[ui]) * (1 + 0.22 * (0.5 - fu)) * (0.82 + 0.18 * SQ[si]) * (1 + 0.1 * COS[si]) * tv * dip;
                val *= FIB[((ci & 255) << 2) | ((fu * 3) | 0)] * (0.96 + 0.08 * hash2(ci, (n - k) / 5));
                val += (0.2 * glint * cr * cr + 0.07 * SPC[ui]) * (0.5 + 0.5 * bul);        // the sheen of the float, with a bright core left of its ridge
                val *= lw * (cls === PLAIN ? F_PLAIN : F_GRD) * REL[ia];
                T = WARP;
              }
            } else {                              // weft-faced satin: horizontal floats over four warps
              const n = ci + 2 * cj; let k = n % 5; if (k < 0) k += 5;
              const tv = TVR[cj - J0] + tf;
              if (k === 0) { val = (0.4 + 0.2 * SIN[ui] * SIN[vi]) * tv * lw; T = WARP; }
              else {
                const s = (k - 1 + fu) * 0.25, si = (s * NU) | 0, bul = SIN[si], cr = SIN[vi];
                let dip = 1;
                if (CLS[ia - 1] !== FIG) dip *= 0.55 + 0.45 * fu;
                if (CLS[ia + 1] !== FIG) dip *= 0.55 + 0.45 * (1 - fu);
                val = 0.62 * (0.56 + 0.44 * SQ[vi]) * (1 + 0.26 * (0.5 - fv)) * (0.8 + 0.2 * SQ[si]) * (1 + 0.1 * COS[si]) * tv * dip;
                val *= FIB[(((cj + 77) & 255) << 2) | ((fv * 3) | 0)] * (0.96 + 0.08 * hash2((n - k) / 5, cj));
                val += (0.08 * glint * cr * cr + 0.03 * SPC[vi]) * bul;
                val *= lf * F_FIG * REL[ia];
                T = WEFT;
              }
            }
            let qi = (val * QS + 0.5) | 0; qi = (qi < 0 ? 0 : qi > NL - 1 ? NL - 1 : qi) * 3;
            r += T[qi]; g += T[qi + 1]; b += T[qi + 2];
          }
        }
        const o = (j * pw + i) * 4;
        d[o] = r * inv; d[o + 1] = g * inv; d[o + 2] = b * inv; d[o + 3] = 255;
      }
    }
  });

  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(weave, 0, 0);
  // a few pulled / broken thread ends and lint lying on the satin (each with a small shadow to the lower right)
  const r = L.rng('g02-lint'), ls = PX / 3;
  g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const x = r.range(30, S - 30), y = r.range(30, S - 30), horiz = r.chance(0.5), len = r.range(12, 34) * ls, bow = r.range(-6, 6) * ls;
    const ex = horiz ? len : r.range(-2, 2), ey = horiz ? r.range(-2, 2) : len, a = r.range(0.4, 0.7);
    const mx = x + ex * 0.5 + (horiz ? 0 : bow), my = y + ey * 0.5 + (horiz ? bow : 0);
    const passes = [[1.5, 2.1, 2.4, 'rgba(52,30,6,0.1)'], [1.1, 1.6, 1.4, 'rgba(52,30,6,0.2)'], [0, 0, 1.1, L.rgba('#f1d58c', a)], [-0.25, -0.3, 0.45, L.rgba('#fff3cc', a * 0.8)]];
    for (const [ox, oy, lwid, col] of passes) {                             // soft shadow · contact shadow · the thread · its lit ridge
      g.strokeStyle = col; g.lineWidth = lwid;
      g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(mx + ox, my + oy, x + ex + ox, y + ey + oy); g.stroke();
    }
  }
  return c;
}

export default {
  name: '连钱纹缎·留白',
  init() { layer = build(); },
  draw(ctx) {
    ctx.drawImage(layer, 0, 0);          // a flash frame: perfectly still
  },
};
