// s22 — 鱼鳞瓦·刺绣. Macro of an old embroidery: ultramarine plain-weave ground above the arc; below it a roof of
// fish-scale tiles (鱼鳞瓦) worked in silk — every tile a block of satin stitches shaded gold → orange → vermilion,
// edged with a dark twisted thread. The arc itself is a couched pair of gold threads (盘金绣).
//
// Nothing here is a repeated unit: every tile has its own size, lean, shape, dye lot, thread gauge and sheen, the
// rows wander, the silk is worn through to its cotton padding and to the blue ground in places, and two tide-marks
// of an old water stain cross the work.
//
// Recipe: the tiles are a per-pixel "shader" evaluated once in init() in a conformal (s, v) space
// (s = arc length, v = R·ln(R/r) = depth below the arc). A table of per-tile parameters drives the coverage test
// (upper rows overlap lower rows), the satin threads, the edging thread, the wear and the sheen. Gold cord, fuzz
// and loose ends are vector strokes on top. Two complete layers are baked (sheen at two positions along the
// stitches) and cross-faded while the camera drifts, which reads as the sheen sliding over the silk.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 40;                        // camera only rotates ±0.006 rad (≤ 19 px at the corners) and pushes in
const LW = W + PAD * 2, LH = H + PAD * 2;

const PITCH = 290;                     // nominal tile width along the arc (px at the arc) — a macro: ~6½ tiles across
const RAD = PITCH / 2;
const ROW = RAD * 1.1;                 // nominal row spacing
const KS = PITCH / 236;                // scale of the hand-drift terms that were tuned at the old tile size
const REACH = RAD * 1.5;               // how far below its centre a tile can possibly reach
const V0 = 30;                         // depth of the first row's centres (its joints hide under the cord)
const CORD_TOP = 0;                    // dr of the gold band's upper edge  → the dominant edge sits on the arc
const CORD_W = 19;                     // width of each of the two gold threads
const CORD_V = CORD_W * 2 - CORD_TOP - 1; // depth at which the silk emerges from under the gold
const CLOTH_P = 9;                     // thread pitch of the ground cloth

// places where the silk has been rubbed through: [s, v, radius, amount]
const SPOTS = [[-560, 270, 84, 0.38], [650, 330, 104, 0.44], [150, 440, 52, 0.3], [-1040, 150, 70, 0.34]];
// old water stains (frame coords): [x, y, radius, aspect, strength] — big soft tide-marks, mostly off the bottom edge
const STAINS = [[300, 1040, 330, 1.25, 0.9], [1470, 800, 150, 1.12, 0.7]];
// 退晕 skeins, by q (0 at the tile's rim → larger toward its hidden top)
const BANDS = [[-9, '#ffdc6e'], [-0.1, '#f4bc2e'], [0.2, '#ec8422'], [0.36, '#d93a1a'], [0.92, '#ae2018'], [1.3, '#80140f']];
const QB1 = 0.2, QB2 = 0.36, QB3 = 0.92; // the joins where one skein ends and the next begins

let S = null;

// ───────────────────────── tiny deterministic helpers ─────────────────────────
function hash2(a, b) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
let NT = null;
function initNoise() {
  const r = L.rng('s22vn');
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
const wearN = (s, v) => vn(s * 0.0156 + 11.3, v * 0.0114 + 4.1) * 0.6 + vn(s * 0.047 + 1.7, v * 0.033 + 8.2) * 0.4;
const cl = (x, a, b) => (x < a ? a : x > b ? b : x);

// silk colour by q (0 at the tile's rim → larger toward its hidden top): bright gold → narrow orange → vermilion → deep red
const QMIN = -0.45, QSPAN = 2.4, NL = 512;
function silkLut() {
  // 退晕: stepped shading with a handful of skeins — each band one dye, the joins ragged (long-and-short stitch)
  const bands = BANDS.map(([q, c]) => [q, L.parseColor(c)]);
  const BL = 0.02;
  const lut = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) {
    const q = QMIN + (QSPAN * i) / (NL - 1);
    let b = 0; while (b < bands.length - 1 && bands[b + 1][0] <= q) b++;
    let c = bands[b][1];
    if (b < bands.length - 1 && bands[b + 1][0] - q < BL) { const t = 1 - (bands[b + 1][0] - q) / BL, n = bands[b + 1][1]; c = [c[0] + (n[0] - c[0]) * t * 0.5, c[1] + (n[1] - c[1]) * t * 0.5, c[2] + (n[2] - c[2]) * t * 0.5]; }
    lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2];
  }
  return lut;
}

// ───────────────────────── per-tile parameters: no two tiles alike ─────────────────────────
const NF = 28;
//  0 sc   1 vc   2 rx   3 ry   4 cos   5 sin   6 skew   7 pointedness   8 priority (which neighbour lies on top)
//  9 qshift (dye lot)  10 rim scale  11 fade  12 brightness  13 warm/cool  14 sheen gain  15 thread gauge
// 16 thread phase  17 fan  18 wear  19 padding depth  20 sheen position  21 edging width  22 edging tone
// 23 sheen width  24 sheen shape (0 straight band … 1 crescent that follows the rim)  25 sheen slant
function buildTiles(env) {
  const a = env.arc, R = a.R;
  const iMax = Math.ceil((a.span(PAD + 140) * R) / PITCH) + 3;
  const vMax = R * Math.log(R / (R - (H + PAD - a.crestY))) + RAD * 2;
  const kN = Math.ceil((vMax - V0) / ROW) + 3, iN = iMax * 2 + 1;
  const T = new Float32Array(kN * iN * NF);
  for (let k = 0; k < kN; k++) {
    for (let i = -iMax; i <= iMax; i++) {
      const o = (k * iN + i + iMax) * NF;
      const h = (n) => hash2(i * 31 + n * 977 + 5, k * 57 + n * 131 + 3);
      const sc0 = (i + (k & 1) * 0.5) * PITCH, vc0 = V0 + k * ROW;
      // the rows wander and the spacing breathes (slow drift) + every tile sits a little off its place
      T[o] = sc0 + (vn(sc0 / 640 + 2.3, vc0 / 480 + 7.7) - 0.5) * 30 * KS + (h(1) - 0.5) * 0.11 * PITCH;
      T[o + 1] = vc0 + (vn(sc0 / 750 + 9.1, vc0 / 370 + 1.2) - 0.5) * 26 * KS + (h(2) - 0.5) * 0.16 * ROW;
      T[o + 2] = RAD * (0.93 + 0.2 * h(3));
      T[o + 3] = RAD * (0.96 + 0.24 * h(4));
      const tilt = (h(5) - 0.5) * 0.34 + (h(6) > 0.84 ? (h(7) - 0.5) * 0.36 : 0);
      T[o + 4] = Math.cos(tilt); T[o + 5] = Math.sin(tilt);
      T[o + 6] = (h(8) - 0.5) * 0.16;
      T[o + 7] = (h(9) - 0.35) * 0.2;                                                         // 鱼鳞瓦 are half-rounds: barely pointed
      T[o + 8] = h(10);
      // dye lot: big soft zones (more gold up in the light, redder further down) + the odd tile from another skein
      // (the field stays vermilion: gold is a rim, never the body — two big values, blue above, red below)
      const zone = vn(sc0 / 860 + 4.4, vc0 / 520 + 3.3);
      const base = (zone - 0.5) * 0.18 + k * 0.02 + 0.04;
      const lot = h(11);
      let qs, rim;
      if (lot < 0.09) { qs = base - 0.15 - 0.07 * h(12); rim = 0.85 + 0.2 * h(13); }          // a broad gold rim
      else if (lot < 0.27) { qs = base + 0.16 + 0.2 * h(12); rim = 1.0 + 0.3 * h(13); }       // deep red, thin orange rim
      else if (lot < 0.39) { qs = base + 0.05; rim = 0.6 + 0.2 * h(13); }                     // long orange passage
      else { qs = base + (h(12) - 0.5) * 0.12; rim = 0.85 + 0.4 * h(13); }
      T[o + 9] = qs; T[o + 10] = rim;
      T[o + 11] = h(14) > 0.94 ? 0.14 + 0.14 * h(15) : 0.07 * h(15) * h(15);                    // a few sun-bleached tiles
      T[o + 12] = 0.89 + 0.22 * h(16);
      T[o + 13] = (h(17) - 0.5) * 0.16;
      // satin is anisotropic: how much a tile shines depends on which way its stitches lean
      T[o + 14] = cl(0.8 + tilt * 4.4 + (h(18) - 0.5) * 1.5, 0.05, 2.2);
      T[o + 15] = 6.3 * (0.88 + 0.26 * h(19));
      T[o + 16] = h(20) * 7;
      T[o + 17] = (h(21) - 0.3) * 0.22;
      T[o + 18] = h(22) > 0.91 ? 0.2 + 0.12 * h(23) : h(22) < 0.07 ? 0.13 + 0.06 * h(23) : 0;
      T[o + 19] = 0.06 + 0.24 * h(24);
      T[o + 20] = 0.26 + 0.42 * h(25);
      T[o + 21] = 5.6 + 3.2 * h(26);
      T[o + 22] = h(27);
      T[o + 23] = 0.1 + 0.14 * h(28);
      T[o + 24] = h(29);
      T[o + 25] = (h(30) - 0.5) * 0.5 + tilt * 1.5;
    }
  }
  return { T, iMax, iN, kN };
}

// ───────────────────────── the satin-stitched tiles (per-pixel) ─────────────────────────
function buildSilk(env, TB) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const { T, iMax, iN, kN } = TB;
  const imA = new ImageData(LW, LH), imB = new ImageData(LW, LH);
  const A = imA.data, B = imB.data;
  const lut = silkLut();
  const r2max = (R + CORD_TOP - 1) * (R + CORD_TOP - 1);
  const lx0 = cx - 170, ly0 = a.crestY + 110;   // centre of the pool of light
  const PI = Math.PI;
  const LDS = 0.5, LDV = 0.866;                  // direction the light travels in (s, v): from the upper left
  const NSP = SPOTS.length;
  for (let Y = 0; Y < LH; Y++) {
    const y = Y - PAD, dy = cy - y;
    let o = Y * LW * 4;
    for (let X = 0; X < LW; X++, o += 4) {
      const x = X - PAD, dx = x - cx;
      const r2 = dx * dx + dy * dy;
      if (r2 > r2max) continue;
      const rad = Math.sqrt(r2);
      const s = Math.atan2(dx, dy) * R;
      const v = R * Math.log(R / rad);

      // ── which tile? rows are scanned from the top: the first tile that covers the point lies on top ──
      const wobE = (vn(s * 0.017 + 7.7, v * 0.017 + 2.2) - 0.5) * 11 + (vn(s * 0.07 + 1.3, v * 0.07 + 5.9) - 0.5) * 2.6;   // hand-worked edge
      let kk = Math.ceil((v - V0 - REACH) / ROW); if (kk < 0) kk = 0;
      let to = -1, ap = 0, bp = 0, An = 0, Bn = 0, dd = 0;
      let du = v - CORD_V, dnx = 0, dny = 1;       // nearest edge lying over this point (starts with the gold cord)
      for (; kk < kN; kk++) {
        const u = s / PITCH - (kk & 1) * 0.5;
        const i0 = Math.round(u), i1 = u > i0 ? i0 + 1 : i0 - 1;
        let bestP = -1;
        for (let c = 0; c < 2; c++) {
          const ii = (c ? i1 : i0) + iMax; if (ii < 0 || ii >= iN) continue;
          const t = (kk * iN + ii) * NF;
          const ds = s - T[t], dv = v - T[t + 1];
          const b0 = dv * T[t + 4] - ds * T[t + 5];
          const a0 = ds * T[t + 4] + dv * T[t + 5] + T[t + 6] * b0;
          const rx = T[t + 2], ry = T[t + 3];
          const A0 = a0 / rx; let B0, d;
          if (b0 <= 0) { B0 = b0 / ry; d = (Math.abs(A0) - 1) * rx; } else {
            B0 = (b0 * (1 + T[t + 7] * Math.abs(A0))) / ry;
            d = (Math.sqrt(A0 * A0 + B0 * B0) - 1) * (rx + ry) * 0.5;
          }
          d += wobE;
          if (d <= 0) { if (T[t + 8] > bestP) { bestP = T[t + 8]; to = t; ap = a0; bp = b0; An = A0; Bn = B0; dd = d; } }
          else if (d < du) { du = d; dnx = ds; dny = dv; }
        }
        if (to >= 0) break;
      }
      if (to < 0) { A[o] = B[o] = 70; A[o + 1] = B[o + 1] = 14; A[o + 2] = B[o + 2] = 10; A[o + 3] = B[o + 3] = 255; continue; }
      const e = -dd;                               // how far inside this tile's own rim
      const tid = to / NF;

      // ── light: occlusion + cast shadow from whatever lies over this tile, and the lamp's pool ──
      if (du < 0) du = 0;
      const dnl = Math.sqrt(dnx * dnx + dny * dny) || 1;
      const facing = Math.max(0, (dnx * LDS + dny * LDV) / dnl);
      // (embroidery has a millimetre of relief, not a centimetre: tight contact shadow, short cast shadow)
      const ao = 1 - 0.42 * Math.exp(-du / 7);
      const sh = 1 - 0.5 * sm(1 - du / (5 + 20 * facing));
      const lm = 1.08 - 0.18 * sm((Math.hypot((x - lx0) * 0.8, (y - ly0) * 1.25) - 280) / 1050);

      // ── wear: where the silk is rubbed away ──
      let wl = T[to + 18];
      for (let q = 0; q < NSP; q++) {
        const sp = SPOTS[q], ex = (s - sp[0]) / sp[2], ey = (v - sp[1]) / sp[2], d2 = ex * ex + ey * ey;
        if (d2 < 6) wl += sp[3] * Math.exp(-d2);
      }
      let dep = -1;
      if (wl > 0.08) dep = wl - wearN(s, v);

      // ── the dark twisted thread that edges every tile (it frays away where the work is worn) ──
      let OWl = T[to + 21] * (0.7 + 0.6 * vn(s * 0.045 + 3.3, v * 0.045 + 8.8));
      if (dep > -0.03) OWl *= 1 - sm((dep + 0.03) / 0.07);
      if (e < OWl) {
        const xo = e / OWl, rm = (T[to + 2] + T[to + 3]) * 0.5;
        const along = bp > 0 ? Math.atan2(An, Bn) * rm : (An > 0 ? 1 : -1) * (1.5708 * rm - bp);
        const tw = 0.5 + 0.5 * Math.sin((along + xo * OWl * 0.9) * 0.84);
        const cyo = Math.sin(PI * (0.06 + 0.9 * xo));
        const tone = T[to + 22];
        const lo = (0.32 + 0.82 * Math.pow(cyo, 0.75)) * (0.7 + 0.3 * tw) * ao * sh * lm;
        const sp2 = cyo * cyo * tw * tw * 0.22 * ao * sh;
        const or = (98 + 46 * tone) * lo + 255 * sp2, og = (22 + 16 * tone) * lo + 168 * sp2, ob = (16 + 9 * tone) * lo + 126 * sp2;
        A[o] = B[o] = or; A[o + 1] = B[o + 1] = og; A[o + 2] = B[o + 2] = ob; A[o + 3] = B[o + 3] = 255;
        continue;
      }

      // ── satin threads: parallel to the tile's own axis, a little wavy, fanning slightly; own gauge and phase ──
      const wob = (vn(s * 0.017 + 3.1, v * 0.036 + 1.7) - 0.5) * 5 + (vn(s * 0.1, v * 0.017 + 9.2) - 0.5) * 1.7;
      const tj = (ap * (1 - T[to + 17] * (Bn - 0.2)) + wob) / T[to + 15] + T[to + 16];
      const j = Math.floor(tj), f = tj - j;
      const cyl = Math.sin(PI * f);
      const prof = Math.sqrt(cyl);                 // flat floss lying snug: a broad crown and a tight dark crevice
      const jh = j + tid * 257;
      const hj1 = hash2(jh, 11), hj2 = hash2(jh, 29), hj3 = hash2(jh, 53);

      // colour zone: follows the rim (U-shaped bands); long-and-short stitches → the boundary is ragged per thread
      // (a gold crescent hugging the lower rim, tapering away toward the shoulders; the hidden top is darkest)
      const rr = bp > 0 ? Math.sqrt(An * An + Bn * Bn) : Math.abs(An);
      const q = 0.5 * (1 - rr) + 0.6 * (0.5 - 0.5 * Bn);
      const qm = q * T[to + 10] + T[to + 9] + ((j & 1) ? 0.05 : -0.05) + (hj1 - 0.5) * 0.16;
      let li = ((qm - QMIN) / QSPAN) * (NL - 1); li = li < 0 ? 0 : li > NL - 1 ? NL - 1 : li | 0;
      let cr = lut[li * 3], cg = lut[li * 3 + 1], cb = lut[li * 3 + 2];
      const fd = T[to + 11];
      cr += (243 - cr) * fd; cg += (208 - cg) * fd; cb += (168 - cb) * fd;
      cg *= 1 + T[to + 13];

      // damage: abraded silk goes matt and pale, then the threads thin to frayed points, baring the cotton
      // padding and finally the ground cloth
      let dull = 0;
      if (dep > -0.12) {
        const depT = dep - (hj3 - 0.5) * 0.16 - (vn(jh * 0.731 + 3.3, v * 0.03 + tid) - 0.5) * 0.16;
        dull = sm((depT + 0.12) / 0.12);
        const cover = 1 - sm(depT / 0.07);
        if (cover < 1 && Math.abs(f - 0.5) > 0.5 * cover) {
          const sf = sm(1 - (wl - wearN(s - 5, v - 8)) / 0.07);   // shadow thrown into the hole by silk standing on its lit side
          if (dep < T[to + 19] + (vn(s * 0.09 + 4.4, v * 0.09 + 7.1) - 0.5) * 0.08) {
            // cotton padding laid across the stitch direction, tinted by the silk that used to cover it
            const pj = bp / 4.4 + 0.4 * Math.sin(ap * 0.05 + tid);
            const cp = Math.sin(PI * (pj - Math.floor(pj)));
            const lp = (0.72 + 0.28 * cp) * (1 - 0.5 * sf) * ao * sh * lm * (0.88 + 0.2 * vn(s * 0.21, v * 0.21));
            const pr = (204 * 0.58 + cr * 0.42) * lp, pg = (164 * 0.58 + cg * 0.42) * lp, pb = (118 * 0.58 + cb * 0.42) * lp;
            A[o] = B[o] = pr; A[o + 1] = B[o + 1] = pg; A[o + 2] = B[o + 2] = pb; A[o + 3] = B[o + 3] = 255;
          } else {
            // right through to the ground cloth: the same plain weave, sunk in shadow
            const gx = x / CLOTH_P, gy = y / CLOTH_P, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
            const wv = ((ix + iy) & 1) ? Math.sin(PI * fx) * (0.55 + 0.45 * Math.sin(PI * fy)) : 0.22 + 0.3 * Math.sin(PI * fy);
            const gl = (0.26 + 0.42 * wv) * (1 - 0.55 * sf) * lm;
            A[o] = B[o] = 40 * gl; A[o + 1] = B[o + 1] = 74 * gl; A[o + 2] = B[o + 2] = 168 * gl; A[o + 3] = B[o + 3] = 255;
          }
          continue;
        }
        cr += (236 - cr) * 0.2 * dull; cg += (200 - cg) * 0.2 * dull; cb += (164 - cb) * 0.2 * dull;
      }

      // the shading is in the dye (the skeins above), not airbrushed on: only a little form from the padding
      const Dtop = 0.8 + 0.2 * sm(du / 60);                              // the tile dives under the row above
      const Drim = 1 - 0.22 * sm(1 - (e - OWl) / 13);                    // and rolls over at its padded rim
      const Dx = 1 - 0.1 * An;
      const Tm = 0.5 + 0.52 * prof;
      // where one skein ends and the next begins every stitch dives into the cloth: a tiny pit at the ragged join
      const d1 = qm - QB1, d2 = qm - QB2, d3 = qm - QB3;
      let dq = d1 < 0 ? -d1 : d1; const dq2 = d2 < 0 ? -d2 : d2, dq3 = d3 < 0 ? -d3 : d3;
      if (dq2 < dq) dq = dq2; if (dq3 < dq) dq = dq3;
      const dpx = (dq * 185) / T[to + 10];
      const pit = dpx < 6 ? 1 - 0.3 * Math.exp(-dpx * dpx / 5) : 1;
      const Bj = (0.83 + 0.34 * hj2) * (hj3 < 0.03 && vn(jh * 1.37, v * 0.02) > 0.5 ? 0.6 : 1);    // no two stitches alike; here and there a pulled thread
      const Fs = 0.9 + 0.2 * vn(tj * 2.9 + tid * 3.1, bp * 0.03 + tid * 1.7);                       // the filaments inside each strand of floss
      const Fn = (0.94 + 0.12 * vn(j * 5.37 + tid * 1.3, v * 0.2)) * (0.95 + 0.1 * hash2(X, Y));    // slubs + fibre grain
      const lum = Dtop * Drim * Dx * Tm * pit * Bj * Fs * Fn * ao * sh * lm * T[to + 12] * 1.1;

      // silk sheen: a broken band across the stitches — every tile has its own place, width, slant and strength,
      // every stitch catches it a little higher or lower, and it breaks into streaks that run with the thread
      const mixk = T[to + 24];
      const cA = q > 1.2 ? 1.2 : q, cB = 0.5 - 0.5 * Bn;
      const tt = cB + (cA - cB) * mixk + T[to + 25] * An + (hj1 - 0.5) * 0.2 + (vn(ap * 0.028 + tid * 5.5, bp * 0.011 + 1.1) - 0.5) * 0.3;
      const patch = sm((vn(ap * 0.045 + tid * 9.9, bp * 0.0105 + 6.1) - 0.3) / 0.3);   // the band breaks into islands
      const spb = cyl * prof * ao * sh * lm * (0.55 + 0.9 * hj2) * T[to + 14] * patch * 1.45 * (1 - dull);
      const sw = T[to + 23], sp0 = T[to + 20];
      const ta = (tt - sp0) / sw, tb = (tt - sp0 - 0.15) / sw;
      const sA = Math.exp(-ta * ta) * spb, sB = Math.exp(-tb * tb) * spb;
      const tr = cr * 0.5 + 255 * 0.5, tg = cg * 0.5 + 238 * 0.5, tb2 = cb * 0.5 + 200 * 0.5;

      // shade toward orange-red, never toward olive
      const wsh = sm((0.92 - lum) / 0.55);
      const br = cr * lum, bg = cg * lum * (1 - 0.2 * wsh), bb = cb * lum * (1 - 0.45 * wsh);
      A[o] = br + tr * sA; A[o + 1] = bg + tg * sA; A[o + 2] = bb + tb2 * sA; A[o + 3] = 255;
      B[o] = br + tr * sB; B[o + 1] = bg + tg * sB; B[o + 2] = bb + tb2 * sB; B[o + 3] = 255;
    }
  }
  const ca = L.makeCanvas(LW, LH), cb2 = L.makeCanvas(LW, LH);
  ca.getContext('2d').putImageData(imA, 0, 0);
  cb2.getContext('2d').putImageData(imB, 0, 0);
  return [ca, cb2];
}

// ───────────────────────── the ultramarine ground cloth ─────────────────────────
function buildCloth(env) {
  const a = env.arc;
  const p = CLOTH_P, M = 20;
  const CHL = Math.min(LH, Math.ceil(PAD + a.yAt(-PAD, 0) + 30));   // layer rows that can show cloth
  const weave = L.weaveTex(LW + M * 2, CHL + M * 2, { base: '#23479a', warp: '#4270cf', weft: '#142a68', seed: 's22w', pitch: p, slub: 0.36 });
  const wg = weave.getContext('2d');
  // plain-weave floats: at every crossing either the warp or the weft is on top
  const tile = L.makeCanvas(p * 2, p * 2), tg = tile.getContext('2d');
  for (let i = -1; i <= 3; i++) for (let j = -1; j <= 3; j++) {
    const x = i * p, y = j * p;
    if ((i + j) & 1) { // weft float (dark, horizontal)
      tg.fillStyle = 'rgba(10,22,64,0.5)'; tg.beginPath(); tg.ellipse(x, y + 0.5, p * 0.6, p * 0.33, 0, 0, L.TAU); tg.fill();
      tg.fillStyle = 'rgba(84,124,214,0.28)'; tg.beginPath(); tg.ellipse(x, y - 0.8, p * 0.42, p * 0.14, 0, 0, L.TAU); tg.fill();
    } else {           // warp float (lighter, vertical)
      tg.fillStyle = 'rgba(86,132,226,0.5)'; tg.beginPath(); tg.ellipse(x - 0.3, y, p * 0.3, p * 0.6, 0, 0, L.TAU); tg.fill();
      tg.fillStyle = 'rgba(170,200,255,0.3)'; tg.beginPath(); tg.ellipse(x - 0.9, y - 0.4, p * 0.12, p * 0.4, 0, 0, L.TAU); tg.fill();
    }
  }
  wg.globalCompositeOperation = 'source-over'; wg.globalAlpha = 0.6;
  wg.fillStyle = wg.createPattern(tile, 'repeat'); wg.fillRect(0, 0, LW + M * 2, CHL + M * 2);
  wg.globalAlpha = 1;

  // real cloth is never a ruled grid: let the wefts bow and the warps drift (two cheap strip passes)
  const t1 = L.makeCanvas(LW + M * 2, CHL), g1 = t1.getContext('2d');
  for (let x = 0; x < LW + M * 2; x += 4) {
    const oy = 5.5 * Math.sin(x / 263 + 1.3) + 3.2 * Math.sin(x / 97 + 0.4) + 1.6 * Math.sin(x / 41 + 2.2);
    g1.drawImage(weave, x, 0, 4, CHL + M * 2, x, oy - M, 4, CHL + M * 2);
  }
  const c = L.makeCanvas(LW, CHL); c._pad = PAD;
  const g = c.getContext('2d');
  for (let y = 0; y < CHL; y += 4) {
    const ox = 5 * Math.sin(y / 231 + 0.7) + 3 * Math.sin(y / 83 + 2.9) + 1.5 * Math.sin(y / 37 + 0.3);
    g.drawImage(t1, 0, y, LW + M * 2, 4, ox - M, y, LW + M * 2, 4);
  }
  g.translate(PAD, PAD);
  // uneven dye + wear
  g.globalCompositeOperation = 'multiply'; g.fillStyle = '#f0f3fb'; g.fillRect(-PAD, -PAD, LW, CHL);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.08;
  g.drawImage(L.noiseTex(LW, CHL, { seed: 's22dye', scale: 420, octaves: 4, warp: 0.5, res: 0.2, contrast: 1.5 }), -PAD, -PAD);
  g.globalAlpha = 0.12;
  g.drawImage(L.noiseTex(LW, CHL, { seed: 's22dye2', scale: 46, sx: 0.5, sy: 7, octaves: 3, res: 0.33, contrast: 1.6 }), -PAD, -PAD);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // lint: stray pale fibres caught in the weave
  const r = L.rng('s22lint');
  const CH = CHL - PAD;
  g.lineCap = 'round';
  for (let i = 0; i < 230; i++) {
    const x = r.range(-PAD, W + PAD), y = r.range(-PAD, CH), len = r.range(6, 26), an = r.range(0, Math.PI);
    g.strokeStyle = L.rgba(r.pick(['#b9cdf0', '#8fa9d6', '#dfe8fa']), r.range(0.05, 0.2)); g.lineWidth = r.range(0.6, 1.3);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-4, 4), y + Math.sin(an) * len * 0.5 + r.range(-4, 4), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  // the embroidery pulls the ground: faint puckers radiating a little way up from the edge
  for (let i = 0; i < 120; i++) {
    const th = r.range(-0.52, 0.52), len = r.range(18, 48), lean = r.range(-10, 10), wd = r.range(6, 13), al = r.range(0.07, 0.17);
    a.at(g, th, CORD_TOP, () => {
      g.strokeStyle = L.linear(g, 0, 0, lean, -len, [[0, `rgba(4,8,30,${al})`], [1, 'rgba(4,8,30,0)']]); g.lineWidth = wd;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(lean, -len); g.stroke();
      g.strokeStyle = L.linear(g, 0, 0, lean, -len, [[0, `rgba(150,180,240,${al * 0.6})`], [1, 'rgba(150,180,240,0)']]); g.lineWidth = wd * 0.6;
      g.beginPath(); g.moveTo(-wd * 0.8, 0); g.lineTo(lean - wd * 0.8, -len * 0.9); g.stroke();
    });
  }
  // raking light from the upper left, falling away gently to the right and to the top
  g.fillStyle = L.linear(g, -PAD, -PAD, W + PAD, CH, [[0, 'rgba(130,170,240,0.13)'], [0.45, 'rgba(130,170,240,0)'], [0.55, 'rgba(6,12,40,0)'], [1, 'rgba(6,12,40,0.16)']]);
  g.fillRect(-PAD, -PAD, LW, CHL);
  g.fillStyle = L.linear(g, 0, -PAD, 0, 330, [[0, 'rgba(6,12,40,0.2)'], [1, 'rgba(6,12,40,0)']]);
  g.fillRect(-PAD, -PAD, LW, CHL);
  return c;
}

// ───────────────────────── vector work: couched gold, fuzz, loose ends ─────────────────────────
/** short diagonal strokes across a polyline → twisted-thread / rope texture */
function ticks(g, P, half, slant, step, style, lw) {
  g.beginPath();
  let acc = step * 0.5;
  for (let i = 1; i < P.length - 1; i++) {
    acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (acc < step) continue;
    acc -= step;
    const tx = P[i + 1][0] - P[i - 1][0], ty = P[i + 1][1] - P[i - 1][1], m = Math.hypot(tx, ty) || 1;
    const ux = tx / m, uy = ty / m, nx = -uy, ny = ux;
    g.moveTo(P[i][0] - ux * slant - nx * half, P[i][1] - uy * slant - ny * half);
    g.lineTo(P[i][0] + ux * slant + nx * half, P[i][1] + uy * slant + ny * half);
  }
  g.strokeStyle = style; g.lineWidth = lw; g.stroke();
}
function poly(g, P, ox = 0, oy = 0) {
  g.beginPath(); g.moveTo(P[0][0] + ox, P[0][1] + oy);
  for (let i = 1; i < P.length; i++) g.lineTo(P[i][0] + ox, P[i][1] + oy);
}
/** a loose thread lying on the work: soft shadow, round body, highlight, twist marks, frayed tip */
function looseThread(g, pts, o) {
  const { width, dark, mid, light, seed, fray = 3, shadow = 'rgba(3,6,22,0.6)' } = o;
  const P = L.smoothPath(pts, 2.5);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.save();
  g.shadowColor = shadow; g.shadowBlur = 6; g.shadowOffsetX = 4; g.shadowOffsetY = 6;
  g.strokeStyle = dark; g.lineWidth = width; poly(g, P); g.stroke();
  g.restore();
  g.strokeStyle = mid; g.lineWidth = width * 0.66; poly(g, P, -width * 0.06, -width * 0.08); g.stroke();
  g.globalAlpha = 0.75; g.strokeStyle = light; g.lineWidth = Math.max(0.7, width * 0.2); poly(g, P, -width * 0.2, -width * 0.22); g.stroke();
  g.globalAlpha = 1;
  g.lineCap = 'butt';
  ticks(g, P, width * 0.42, width * 0.3, Math.max(2.4, width * 0.7), L.rgba(dark, 0.6), Math.max(0.7, width * 0.16));
  // frayed tip
  const r = L.rng('fray' + seed), n = P.length, e = P[n - 1], b = P[n - 6] || P[0];
  const ang = Math.atan2(e[1] - b[1], e[0] - b[0]);
  g.lineCap = 'round';
  for (let i = 0; i < fray; i++) {
    const an = ang + r.range(-0.7, 0.7), len = r.range(width * 1.6, width * 4.5);
    g.strokeStyle = L.rgba(r.chance(0.5) ? mid : light, r.range(0.5, 0.9)); g.lineWidth = r.range(0.7, 1.3);
    g.beginPath(); g.moveTo(e[0], e[1]);
    g.quadraticCurveTo(e[0] + Math.cos(an) * len * 0.5 + r.range(-2, 2), e[1] + Math.sin(an) * len * 0.5 + r.range(-2, 2), e[0] + Math.cos(an + r.range(-0.4, 0.4)) * len, e[1] + Math.sin(an + r.range(-0.4, 0.4)) * len);
    g.stroke();
  }
  g.restore();
}

function buildOver(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const span = a.span(PAD + 100);
  const mapSV = (s, v) => { const rad = R * Math.exp(-v / R), th = s / R; return [cx + rad * Math.sin(th), cy - rad * Math.cos(th)]; };
  /** local (along-arc, inward) offsets from the arc at theta → frame coords */
  const local = (theta, pts) => { const p = a.pt(theta, 0), c = Math.cos(theta), s = Math.sin(theta); return pts.map(([lx, ly]) => [p.x + lx * c - ly * s, p.y + lx * s + ly * c]); };

  return L.makeLayer(PAD, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';

    // ── 1. broken silk standing up out of the worn patches, and a few fly-away fibres ──
    const rf = L.rng('s22fly');
    const vMax = R * Math.log(R / (R - (H + PAD - a.crestY)));
    for (const sp of SPOTS) {
      const n = Math.round(sp[2] / 17);
      for (let i = 0; i < n; i++) {
        const an0 = rf.range(0, L.TAU), rr = sp[2] * rf.range(0.25, 1.0);
        const s0 = sp[0] + Math.cos(an0) * rr, v0 = sp[1] + Math.sin(an0) * rr * 0.9;
        const len = rf.range(12, 34), an = rf.range(-1.3, 1.3) - Math.PI / 2, curl = rf.range(-0.9, 0.9);
        const P = [];
        for (let q = 0; q <= 8; q++) { const u = q / 8, aa = an + curl * u * u * 2.2; P.push(mapSV(s0 + Math.cos(aa) * len * u, v0 + Math.sin(aa) * len * u)); }
        const col = rf.pick(['#ffe9a8', '#ffcf7a', '#ff9d6a', '#f3e2bc', '#ffb98a']);
        g.strokeStyle = 'rgba(40,6,4,0.3)'; g.lineWidth = rf.range(1.3, 2.0); poly(g, P, 2, 3); g.stroke();
        g.strokeStyle = L.rgba(col, rf.range(0.6, 0.9)); g.lineWidth = rf.range(0.9, 1.6); poly(g, P); g.stroke();
      }
    }
    for (let i = 0; i < 60; i++) {
      const s0 = rf.range(-span * R, span * R), v0 = rf.range(50, vMax), len = rf.range(18, 70), an = rf.range(-0.5, 0.5) + Math.PI / 2;
      const p0 = mapSV(s0, v0), p1 = mapSV(s0 + Math.cos(an) * len * 0.5 + rf.range(-8, 8), v0 + Math.sin(an) * len * 0.5), p2 = mapSV(s0 + Math.cos(an) * len + rf.range(-10, 10), v0 + Math.sin(an) * len);
      g.strokeStyle = L.rgba(rf.pick(['#ffe9b0', '#ffc27a', '#ffd9c2']), rf.range(0.14, 0.42)); g.lineWidth = rf.range(0.7, 1.4);
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); g.stroke();
    }

    // ── 2. the ground cloth sinks a little where the gold is pulled tight ──
    g.fillStyle = L.radial(g, cx, cy, R + CORD_TOP - 2, R + CORD_TOP + 24, [[0, 'rgba(4,8,30,0.6)'], [0.35, 'rgba(4,8,30,0.28)'], [1, 'rgba(4,8,30,0)']]);
    a.pathBand(g, CORD_TOP + 24, CORD_TOP - 2, -span, span); g.fill();

    // ── 3. 盘金: two gold threads laid side by side along the arc ──
    const rc = L.rng('s22gold');
    for (let c = 0; c < 2; c++) {
      const top = CORD_TOP - c * CORD_W, bot = top - CORD_W, mid = (top + bot) / 2, hw = CORD_W / 2;
      g.fillStyle = L.radial(g, cx, cy, R + bot, R + top, [[0, '#2a1802'], [0.13, '#6a4208'], [0.36, '#c48a12'], [0.58, '#f0b92a'], [0.73, '#fff3b8'], [0.85, '#d9a428'], [1, '#553604']]);
      a.pathBand(g, top, bot, -span, span); g.fill();
      // the gilt strip is wound spirally round a silk core → slanted wraps, each facet catching the light differently
      const step = 5.6, n = Math.ceil((span * R) / step);
      for (let i = -n; i <= n; i++) {
        const th = (i * step + c * 2.1) / R;
        const hsh = hash2(i * 3 + 17, c * 101 + 7);
        a.at(g, th, mid, () => {
          if (hsh > 0.66) { g.fillStyle = `rgba(255,226,130,${((hsh - 0.66) * 0.7).toFixed(3)})`; g.beginPath(); g.moveTo(-3.5, hw - 1.5); g.lineTo(3.5, -hw + 1.5); g.lineTo(3.5 + step, -hw + 1.5); g.lineTo(-3.5 + step, hw - 1.5); g.closePath(); g.fill(); }
          else if (hsh < 0.3) { g.fillStyle = `rgba(74,42,2,${((0.3 - hsh) * 1.3).toFixed(3)})`; g.beginPath(); g.moveTo(-3.5, hw - 1); g.lineTo(3.5, -hw + 1); g.lineTo(3.5 + step, -hw + 1); g.lineTo(-3.5 + step, hw - 1); g.closePath(); g.fill(); }
          g.strokeStyle = 'rgba(64,36,3,0.62)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-3.5, hw - 0.6); g.lineTo(3.5, -hw + 0.6); g.stroke();
          g.strokeStyle = 'rgba(255,246,200,0.18)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-1.8, hw - 3); g.lineTo(4.8, -hw + 2.4); g.stroke();
        });
      }
      // tarnish: stretches where the gilt has gone dull and brown, and a few where it has worn to the red silk core
      for (let i = 0; i < 26; i++) {
        const th = rc.range(-span, span), len = rc.range(30, 150) / R, al = rc.range(0.14, 0.4);
        g.save(); a.clipBand(g, top - 0.5, bot + 0.5, th - len, th + len);
        const p0 = a.pt(th - len, mid), p1 = a.pt(th + len, mid);
        g.fillStyle = L.linear(g, p0.x, p0.y, p1.x, p1.y, [[0, 'rgba(70,38,6,0)'], [0.3, `rgba(70,38,6,${al})`], [0.7, `rgba(70,38,6,${al})`], [1, 'rgba(70,38,6,0)']]);
        g.fillRect(p0.x - 20, Math.min(p0.y, p1.y) - 40, p1.x - p0.x + 40, Math.abs(p1.y - p0.y) + 80);
        g.restore();
      }
      for (let i = 0; i < 7; i++) {
        const th = rc.range(-span, span), len = rc.range(9, 26) / R;
        g.save(); a.clipBand(g, top - 2.5, bot + 2.5, th - len, th + len);
        g.fillStyle = L.radial(g, cx, cy, R + bot, R + top, [[0, '#4a0e08'], [0.4, '#b23a1a'], [0.7, '#e8743a'], [1, '#6a160c']]);
        a.pathBand(g, top - 2.5, bot + 2.5, th - len, th + len); g.fill();
        g.restore();
      }
      // crisp specular along the crown of the thread, broken up like real gilt
      g.save(); g.lineCap = 'butt';
      g.setLineDash([rc.range(6, 14), rc.range(3, 7), rc.range(12, 30), rc.range(5, 12), rc.range(4, 9), rc.range(8, 19), rc.range(20, 44), rc.range(4, 30)]);
      g.strokeStyle = 'rgba(255,253,236,0.82)'; g.lineWidth = 2.4; a.stroke(g, top - CORD_W * 0.27, -span, span);
      g.restore();
      g.strokeStyle = 'rgba(40,22,2,0.75)'; g.lineWidth = 1.7; a.stroke(g, bot + 0.3, -span, span);
    }
    g.strokeStyle = 'rgba(46,28,4,0.6)'; g.lineWidth = 1.2; a.stroke(g, CORD_TOP - 0.2, -span, span);
    // sparks where a facet of the gilt faces the lamp
    for (let i = 0; i < 64; i++) {
      const th = rc.range(-span, span), dr = CORD_TOP - rc.int(0, 1) * CORD_W - CORD_W * 0.27, len = rc.range(3, 10);
      a.at(g, th, dr, () => {
        g.fillStyle = L.radial(g, 0, 0, 0, len * 1.7, [[0, 'rgba(255,244,196,0.5)'], [1, 'rgba(255,244,196,0)']]);
        g.beginPath(); g.arc(0, 0, len * 1.7, 0, L.TAU); g.fill();
        g.fillStyle = 'rgba(255,255,244,0.95)'; g.beginPath(); g.ellipse(0, 0, len, 1.7, 0, 0, L.TAU); g.fill();
      });
    }

    // ── 4. couching stitches: short silk stitches that pin the pair of gold threads down (hand-spaced) ──
    const SP = 55, nS = Math.ceil((span * R) / SP), midc = CORD_TOP - CORD_W, half = CORD_W + 4.4;
    for (let i = -nS; i <= nS; i++) {
      const th = ((i + 0.37) * SP + rc.range(-9, 9)) / R;
      const tilt = 0.1 + rc.range(-0.18, 0.18), wS = 8.4 + rc.range(-1.6, 1.8), kind = rc();
      if (kind < 0.05) continue;                                   // one has come undone
      const cols = kind > 0.8 ? ['#8a3c0c', '#f08a2c', '#ffc98a', '#e8742a', '#6a2c08'] : kind > 0.68 ? ['#6a140e', '#c23a26', '#f08c70', '#aa2a1c', '#4f0d09'] : ['#7c150e', '#e1492d', '#ff9a73', '#c8321f', '#5f100b'];
      a.at(g, th, midc, () => {
        g.rotate(tilt);
        // the stitch bites into the gold: a pinch of shadow on its lee side, needle holes at both ends
        g.fillStyle = 'rgba(40,20,0,0.5)'; g.beginPath(); g.ellipse(3, 1, wS * 0.75, half - 4, 0, 0, L.TAU); g.fill();
        g.fillStyle = 'rgba(3,6,22,0.7)'; g.beginPath(); g.ellipse(0.6, -half - 0.2, 3, 2.2, 0, 0, L.TAU); g.fill();
        g.fillStyle = 'rgba(40,4,2,0.7)'; g.beginPath(); g.ellipse(0.6, half + 0.4, 3, 2.2, 0, 0, L.TAU); g.fill();
        g.lineCap = 'round';
        g.strokeStyle = L.linear(g, -wS / 2, 0, wS / 2, 0, [[0, cols[0]], [0.3, cols[1]], [0.46, cols[2]], [0.66, cols[3]], [1, cols[4]]]);
        g.lineWidth = wS; g.beginPath(); g.moveTo(0, -half + 1.5); g.lineTo(0, half - 1.5); g.stroke();
        // it rides over two round threads: dark at both ends and in the crease between them
        g.strokeStyle = L.linear(g, 0, -half, 0, half, [[0, 'rgba(40,4,2,0.75)'], [0.2, 'rgba(40,4,2,0)'], [0.44, 'rgba(40,4,2,0)'], [0.52, 'rgba(40,4,2,0.42)'], [0.6, 'rgba(40,4,2,0)'], [0.82, 'rgba(40,4,2,0)'], [1, 'rgba(40,4,2,0.8)']]);
        g.beginPath(); g.moveTo(0, -half + 1.5); g.lineTo(0, half - 1.5); g.stroke();
        g.strokeStyle = 'rgba(255,226,206,0.7)'; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(-1, -half + 7); g.lineTo(-1, -4); g.moveTo(-1, 4); g.lineTo(-1, half - 8); g.stroke();
      });
    }

    // ── 5. 毛边: silk fuzz standing up from the edge onto the cloth (kept short under the tagline) ──
    const rz = L.rng('s22fuzz');
    for (let i = 0; i < 1700; i++) {
      const th = rz.range(-span, span), quiet = Math.abs(th) < 0.15;
      let len = 4 + 28 * Math.pow(rz(), 2.4); if (quiet && len > 12) len = 12;
      const an = rz.range(-1.1, 1.1);
      a.at(g, th, CORD_TOP - rz.range(0, 3), () => {
        g.strokeStyle = L.rgba(rz.pick(['#ffe9a8', '#f6c32b', '#ff9a5a', '#fff0c4', '#ffe9a8', '#f08a4a']), rz.range(0.25, 0.75)); g.lineWidth = rz.range(0.6, 1.3);
        const ex = Math.sin(an) * len, ey = -Math.cos(an) * len;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(ex * 0.3 + rz.range(-3, 3), ey * 0.6, ex, ey); g.stroke();
      });
    }

    // ── 6. 线头: a few ends that have worked loose (all kept clear of the text-safe zone) ──
    const K = 1.22, sc = (pts) => pts.map(([px, py]) => [px * K, py * K]);
    looseThread(g, local(-0.302, sc([[0, -5], [-5, -20], [-20, -47], [-50, -68], [-86, -64], [-104, -40], [-97, -17]])),
      { width: 7.0, dark: '#6a4508', mid: '#e3b341', light: '#fff3c0', seed: 1, fray: 5 });
    looseThread(g, local(0.212, sc([[0, -4], [6, -16], [20, -30], [38, -30], [46, -18]])),
      { width: 3.8, dark: '#7a160f', mid: '#e0502e', light: '#ffb394', seed: 2, fray: 4 });
    looseThread(g, local(0.338, sc([[0, -4], [9, -20], [30, -34], [62, -36], [92, -22], [118, -26]])),
      { width: 4.6, dark: '#8a7a56', mid: '#f3e6c0', light: '#ffffff', seed: 4, fray: 4 });
  });
}

// ───────────────────────── water stains: tide-marks that cross silk, gold and cloth alike ─────────────────────────
function buildStains() {
  return STAINS.map(([x0, y0, r, asp, str], n) => {
    const hw = Math.ceil(r * 1.75 * asp), hh = Math.ceil(r * 1.75), w = hw * 2, h = hh * 2;
    const im = new ImageData(w, h), d = im.data, sd = n * 37.7;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const wx = x0 - hw + px, wy = y0 - hh + py;
      const dn = Math.hypot((wx - x0) / asp, wy - y0) / r + (vn(wx / 190 + sd, wy / 190 + 3.3) - 0.5) * 0.5 + (vn(wx / 46 + 1.1, wy / 46 + sd) - 0.5) * 0.1;
      if (dn > 1.08) continue;
      // a tide-mark is a soft brown line where the dirty water stopped: firm on the outside, bleeding a long way inward
      const t1 = dn - 0.975, rim = t1 > 0 ? Math.exp(-(t1 * t1) / 0.0005) : Math.exp(-(t1 * t1) / 0.007);
      const t2 = dn - 0.66, rim2 = t2 > 0 ? Math.exp(-(t2 * t2) / 0.0006) : Math.exp(-(t2 * t2) / 0.005);     // an older, fainter one
      const inside = dn < 0.975 ? 0.4 + 0.6 * sm((dn - 0.2) / 0.75) : 0;
      const al = str * (0.2 * inside + 0.36 * rim + 0.1 * rim2) * (0.75 + 0.5 * vn(wx / 23 + sd, wy / 23));
      const o = (py * w + px) * 4;
      d[o] = 128; d[o + 1] = 74; d[o + 2] = 46; d[o + 3] = Math.min(255, al * 255);
    }
    const c = L.makeCanvas(w, h); c.getContext('2d').putImageData(im, 0, 0);
    return { c, x: x0 - hw, y: y0 - hh };
  });
}
function stainOn(layer, arc, stains) {
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply';
  for (const st of stains) {   // full strength on the embroidery, only a ghost of it on the cloth
    g.save(); g.translate(PAD, PAD); arc.clipBelow(g, CORD_TOP); g.drawImage(st.c, st.x, st.y); g.restore();
    g.save(); g.translate(PAD, PAD); arc.clipAbove(g, CORD_TOP); g.globalAlpha = 0.4; g.drawImage(st.c, st.x, st.y); g.restore();
  }
  g.restore();
}

// ───────────────────────── finishing: shallow depth of field baked into the layer ─────────────────────────
function dof(layer, env) {
  const a = env.arc;
  const g = layer.getContext('2d');
  const hw = LW >> 1, hh = LH >> 1;
  const half = L.makeCanvas(hw, hh), hg = half.getContext('2d');
  hg.imageSmoothingQuality = 'high'; hg.drawImage(layer, 0, 0, hw, hh);
  const fx = (a.cx + PAD - 40) / 2, fy = (a.crestY + PAD + 70) / 2;   // the focus sits on the crest of the arc
  const pass = (px, r0, r1) => {
    const c = L.makeCanvas(hw, hh), cg = c.getContext('2d');
    cg.filter = `blur(${px / 2}px)`; cg.drawImage(half, 0, 0); cg.filter = 'none';
    cg.globalCompositeOperation = 'destination-in';
    cg.save(); cg.translate(fx, fy); cg.scale(1, 0.62); // the sharp zone is a wide ellipse lying along the arc
    cg.fillStyle = L.radial(cg, 0, 0, r0 / 2, r1 / 2, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    cg.fillRect(-LW * 2, -LH * 3, LW * 4, LH * 6);
    cg.restore();
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, LW, LH);
    g.restore();
  };
  pass(1.7, 470, 860);
  pass(4.4, 800, 1300);
}

export default {
  name: '鱼鳞瓦·刺绣',
  tone: 'light',
  init(env) {
    initNoise();
    const T0 = performance.now(); const TM = [];
    const TB = buildTiles(env);
    const cloth = buildCloth(env); TM.push('cloth ' + (performance.now() - T0).toFixed(0));
    const [silkA, silkB] = buildSilk(env, TB); TM.push('silk ' + (performance.now() - T0).toFixed(0));
    const over = buildOver(env); TM.push('over ' + (performance.now() - T0).toFixed(0));
    const stains = buildStains();
    const compose = (silk) => {
      const c = L.makeLayer(PAD, (g) => {
        g.drawImage(cloth, -PAD, -PAD);
        g.filter = 'blur(0.5px)'; g.drawImage(silk, -PAD, -PAD); g.filter = 'none';
        g.drawImage(over, -PAD, -PAD);
      });
      stainOn(c, env.arc, stains);
      dof(c, env);
      return c;
    };
    S = { A: compose(silkA), B: compose(silkB) };
    S.A.getContext('2d').getImageData(0, 0, 1, 1); S.B.getContext('2d').getImageData(0, 0, 1, 1);
    TM.push('compose ' + (performance.now() - T0).toFixed(0)); console.warn('TIMING ' + TM.join(' | '));
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.025, p);
    // the two bakes differ only in where the silk sheen sits along the stitches → cross-fade = the sheen slides
    L.blit(ctx, env, S.A, { rot, zoom });
    if (p > 0) L.blit(ctx, env, S.B, { rot, zoom, alpha: L.smooth(p) });
    // a glint travelling along the gold
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.save(); a.clipBand(ctx, CORD_TOP + 1, CORD_TOP - CORD_W * 2 - 1);
      const q = a.pt(L.lerp(-0.15, 0.05, p), -10);
      L.glow(ctx, q.x, q.y, 360, '#fff2c2', 0.85, 'overlay');
      L.glow(ctx, q.x, q.y, 130, '#fff8dc', 0.22, 'screen');
      ctx.restore();
    });
    // warm pool of light on the silk drifting with the camera
    const w = a.pt(L.lerp(-0.1, 0.02, p), -160);
    L.glow(ctx, w.x, w.y, 640, '#ffb066', 0.1, 'soft-light');
    L.vignette(ctx, { strength: 0.15, inner: 0.5, outer: 1.08 });
  },
};
