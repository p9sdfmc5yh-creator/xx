// s01 — 炉火映钱郭. The opening image, and the one the film returns to: an eclipse.
// The arc is the top of the raised outer rim (外郭) of one enormous cash coin, seen as a silhouette against the glow of the
// furnace behind it. Above the arc the glow is a pure gradient (white-hot at the edge → 炽橙 → 暗红 → 铜绿黑), laid down in soft
// layers like a horizon seen from orbit, with a breath of copper-green smoke above the red before the dark takes over.
// Below it the coin is almost black: a hair-line of fire on the rounded edge, a little halation, then the broad rim band and
// its inner step barely lifted out of the dark by a cold verdigris-coloured fill light, falling out of focus, then nothing.
// No inscription is shown.
//
// Everything is shaded per pixel once, in init, into one tall dithered plate (frame + the dark space above it that the title
// card tilts up into). Two small plates carry the motion: the same picture with the glow spread out along the arc (cross-
// faded in), and an additive "difference" plate for one slow breath of the hot centre. The coin itself never moves.
import * as L from '../../../lib/core.js';

const { W, H } = L;

export const TITLE_TILT = 720;      // px the title card tilts up
const TOP = TITLE_TILT + 8;         // rows of sky kept above the frame
const GLOW_MAX = 624;               // heat and smoke have died away completely this far above the arc (px)
const HEAT_FADE = 400, HEAT_MAX = 440;   // the heat itself is gone by HEAT_FADE (× the glow's local thickness, at most 1.09)
const RIMW = 250, BEV = 9, STEP = 24, RELIEF = 5;   // outer rim: width, rounded edge, inner step, height (px)
const HMAX = 1.12, NH = 2048;
const FLOOR = [2, 5, 4];            // 钱体黑 #020504
const COOL = [13, 40, 34];          // the cold fill light that finds the rim (copper-green)
const HAZE = [5, 19, 16];           // copper-green smoke hanging above the fire (added to the dark space)
const HOT = -56;                    // the hot centre sits a touch left of the crest (px along the arc)

// heat → colour. The palette anchors: 暗红 #8a1c10 @0.30, 炽橙 #ff7a1a @0.68, 炉心亮 #ffd08a @0.90
const HEAT = [[0, '#000000'], [0.05, '#140509'], [0.10, '#3a0d10'], [0.18, '#54100a'], [0.30, '#8a1c10'], [0.42, '#b82e10'],
  [0.55, '#e04a12'], [0.68, '#ff7a1a'], [0.80, '#ffa340'], [0.90, '#ffd08a'], [1.0, '#fff0cf'], [1.12, '#fff8ea']];
// the dark space, by height above the arc (px): 铜绿黑 #07120f, deeper far up
const SKY = [[0, '#081511'], [650, '#07130f'], [900, '#07120f'], [1200, '#060f0d'], [1700, '#050d0b']];

// embers: [U = px along the arc from the crest, dr = px above the arc, core radius, brightness, soft (out-of-focus radius, 0 = sharp)]
const SPARKS = [
  [-318, 26, 1.4, 1.0, 0], [96, 44, 1.6, 1.0, 0], [432, 20, 1.1, 0.8, 0], [-112, 84, 1.2, 0.85, 0], [-540, 38, 1.0, 0.7, 0],
  [246, 150, 1.0, 0.6, 0],
  // nearer the lens, far out of focus: flat little discs
  [168, 66, 0, 0.55, 5.5], [-402, 132, 0, 0.4, 7.5], [520, 112, 0, 0.3, 9], [-40, 214, 0, 0.3, 6],
  // a very few, far up in the dark (they sit outside the title's place)
  [-648, 612, 0.8, 0.3, 0], [596, 748, 0.8, 0.26, 0],
];

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// tiny allocation-free worley noise (squared distance in cD1, cell id in cId)
let cD1 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const qx = xi + ox, qy = yi + oy;
    let h = (Math.imul(qx, 374761393) + Math.imul(qy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = qx + (h & 1023) / 1023 - x, dy = qy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d1 = d; id = ((h >>> 20) & 255) / 255; }
  }
  cD1 = d1; cId = id;
}

function build(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, crest = a.crestY;
  const nA = L.makeNoise('s01a'), nB = L.makeNoise('s01b'), nS = L.makeNoise('s01s');

  // ── look-up tables ──
  const hf = L.makeRamp(HEAT), heat = new Float32Array(NH * 3);
  for (let i = 0; i < NH; i++) { const c = hf((i / (NH - 1)) * HMAX); heat[i * 3] = c[0]; heat[i * 3 + 1] = c[1]; heat[i * 3 + 2] = c[2]; }
  // how the heat falls off with height above the arc (at the crest; the sides use a compressed copy): a long photographic
  // tail with no outline to it
  const TPN = GLOW_MAX * 4 + 4, TP = new Float32Array(TPN);
  for (let i = 0; i < TPN; i++) { const dd = i / 4; TP[i] = Math.exp(-Math.pow(dd / 95, 0.78)) * (1 - sstep(210, HEAT_FADE, dd)); }
  const BMAX = 1700, bf = L.makeRamp(SKY.map(([dd, c]) => [dd / BMAX, c])), base = new Float32Array((BMAX + 1) * 3);
  for (let i = 0; i <= BMAX; i++) { const c = bf(i / BMAX); base[i * 3] = c[0]; base[i * 3 + 1] = c[1]; base[i * 3 + 2] = c[2]; }
  // the copper-green smoke: a soft band that peaks a few hundred px above the arc and is gone where the title will sit
  const hazeT = new Float32Array(GLOW_MAX + 2);
  for (let i = 0; i < GLOW_MAX + 2; i++) hazeT[i] = (0.4 + 0.6 * sstep(0, 220, i)) * (1 - sstep(270, 540, i));
  // along the arc: amplitude (a*) and thickness (m*) of the glow in three states —
  // A = the opening frame (hot centre, thin embers out to the sides), B = spread wide, C = A with the centre swollen (the breath)
  const UOFF = 1300, UN = UOFF * 2 + 1;
  const aA = new Float32Array(UN), mA = new Float32Array(UN), vA = new Float32Array(UN);
  const aB = new Float32Array(UN), mB = new Float32Array(UN), vB = new Float32Array(UN);
  const aC = new Float32Array(UN), mC = new Float32Array(UN), vC = new Float32Array(UN);
  const hzL = new Float32Array(UN), shL = new Float32Array(UN), eL = new Float32Array(UN), wL = new Float32Array(UN), bdL = new Float32Array(UN);
  const rwL = new Float32Array(UN), dpL = new Float32Array(UN), lyL = new Float32Array(UN);
  const BURR = [[-412, 1.9, 9], [188, 1.5, 7], [655, 2.1, 11], [-770, 1.8, 8], [930, 1.6, 10]];   // [U, height, half-width] px
  for (let i = 0; i < UN; i++) {
    const U = i - UOFF, Uh = U - HOT;
    const g0 = Math.exp(-Math.pow(Uh / (Uh < 0 ? 570 : 670), 2)), g1 = Math.exp(-Math.pow(Uh / 1200, 2)), gb = Math.exp(-Math.pow(Uh / 820, 2));
    aA[i] = 0.74 + 0.38 * g0; mA[i] = 0.55 + 0.45 * g0; vA[i] = g0;
    aB[i] = 0.84 + 0.28 * g1; mB[i] = 0.74 + 0.26 * g1; vB[i] = g1;
    aC[i] = aA[i] + 0.05 * gb; mC[i] = mA[i] * (1 + 0.09 * gb); vC[i] = g0 + 0.3 * gb;
    hzL[i] = 0.5 + 0.5 * Math.exp(-Math.pow((U + 160) / 820, 2));   // the fill light is a little stronger left of centre
    shL[i] = Math.exp(-Math.pow((U + 240) / 560, 2));               // where the rim's dull sheen sits
    // the silhouette: a cast and filed edge is never compass-true (± a pixel or so, far inside the match-cut tolerance)
    let e = 0.8 * nA.n2(U / 230, 3.3) + 0.4 * nB.n2(U / 52, 6.1);
    for (const [u0, hh, ww] of BURR) { const q = (U - u0) / ww; if (q > -3 && q < 3) e += hh * Math.exp(-q * q); }
    eL[i] = e;
    wL[i] = 0.55 + 1.5 * Math.pow(U / 1000, 2);                     // focus is at the crest: the edge softens toward the sides
    bdL[i] = 0.82 + 0.3 * nS.n2(U / 96, 1.7) + 0.14 * nS.n2(U / 15, 9.1);   // the fire-line beads along the edge
    // the inner edge of the rim wanders a little, and its step is worn shallow in places
    rwL[i] = RIMW + 5 * nA.n2(U / 430, 5.5) + 1.8 * nA.n2(U / 130, 2.2) + 0.6 * nB.n2(U / 41, 8.8);
    dpL[i] = 0.42 + 0.58 * sstep(-0.35, 0.3, nB.n2(U / 360 + 3, 12.3));
    lyL[i] = 10 * nS.n2(U / 700, 4.4);                              // the layers of the glow sag and lift a little
  }

  // ── the coin's relief (height in px), everything below the arc ──
  const YC0 = Math.floor(crest) - 8, CH = H - YC0;
  const hgt = new Float32Array(W * CH), vrd = new Float32Array(W * CH), rimM = new Float32Array(W * CH), focM = new Float32Array(W * CH);
  for (let j = 0; j < CH; j++) {
    const ddy = cy - (YC0 + j + 0.5), ddy2 = ddy * ddy;
    for (let i = 0; i < W; i++) {
      const dx = i + 0.5 - cx, V0 = R - Math.sqrt(dx * dx + ddy2);
      if (V0 < -8) continue;
      const U = Math.atan2(dx, ddy) * R, k = j * W + i;
      let ui = Math.round(U) + UOFF; ui = ui < 0 ? 0 : ui >= UN ? UN - 1 : ui;
      const V = V0 + eL[ui], Vc = V < 0 ? 0 : V;
      const rimw = rwL[ui], depth = dpL[ui];
      let prof;
      if (Vc < BEV) { const q = 1 - Vc / BEV; prof = RELIEF * (1 - q * q); }       // the worn, rounded outer edge
      else if (Vc < rimw) prof = RELIEF;                                             // the flat top of the rim
      else prof = RELIEF * (1 - depth * sstep(0, STEP, Vc - rimw));                  // the step down into the field
      const onRim = 1 - sstep(rimw - 3, rimw + STEP, Vc);
      // depth of field: sharp at the crest of the edge, melting away down the face and out to the sides
      const fv = Vc / 95, fu = U / 1300, foc = 1 / (1 + fv * fv) * Math.exp(-fu * fu);
      const g2 = nB.n2(U / 9 + 31, Vc / 9);                                          // sand-cast grain
      const m = nA.fbm(U / 74 + 7, Vc / 74 - 3, 3);                                  // slow swell of the patina crust
      const big = nB.fbm(U / 380 - 11, Vc / 380 + 4, 2);
      const drift = sstep(-0.2, 0.3, big + 0.3 * m);                                 // where the patina crust lies thicker
      // traces of the file that dressed the rim, running round it; the crust has buried most of them
      const file = 0.06 * nB.n2(U / 210, Vc / 3.2 + 77) * onRim * (1 - 0.8 * drift) * sstep(14, 50, Vc) * (0.3 + 0.7 * foc);
      cell(U / 44, Vc / 44);                                                         // rust grains: raised granules, in drifts
      let nod = 0;
      if (cId > 0.5) {
        const e = (cId - 0.5) / 0.5, rad = 0.13 + 0.2 * e, q = 1 - Math.sqrt(cD1) / rad;
        if (q > 0) nod = q * q * (3 - 2 * q) * (0.5 + 0.9 * e) * (0.3 + 0.7 * drift) * (0.35 + 0.65 * foc);
      }
      const fade = sstep(0, 5, Vc);   // roughness grows in from the silhouette, which stays a clean arc
      hgt[k] = prof + fade * (0.26 * g2 * (0.1 + 0.9 * foc) * (0.45 + 0.9 * drift) + 0.5 * m + file + nod);
      vrd[k] = L.clamp(0.45 + 0.8 * big + 0.3 * m + 0.6 * nod);
      rimM[k] = onRim; focM[k] = foc;
    }
  }

  // ── shade: the plate (state A), the spread plate (state B) and the breath's difference plate (C − A) ──
  const PH = H + TOP, img = new ImageData(W, PH), d = img.data;
  const YB0 = Math.floor(crest - GLOW_MAX - 4), BH = H - YB0;
  const i1 = new ImageData(W, BH), e1 = i1.data, i2 = new ImageData(W, BH), e2 = i2.data;
  let oR = 0, oG = 0, oB = 0;
  const sky = (drc, bi, mm, amp, st, hz) => {
    let q = (drc / mm) * 4; if (q > TPN - 2) q = TPN - 2;
    const qi = q | 0;
    let t = (TP[qi] + (TP[qi + 1] - TP[qi]) * (q - qi)) * amp * st; if (t > HMAX) t = HMAX;
    const hi = ((t / HMAX) * (NH - 1) | 0) * 3;
    // the cold smoke only shows where the heat has died away, so the reds stay clean instead of going brown
    const kb = 1 - sstep(0, 0.14, t);
    oR = heat[hi] + (base[bi] + HAZE[0] * hz) * kb; oG = heat[hi + 1] + (base[bi + 1] + HAZE[1] * hz) * kb; oB = heat[hi + 2] + (base[bi + 2] + HAZE[2] * hz) * kb;
  };
  let sd = 0x2545f491 | 0;
  for (let py = 0; py < PH; py++) {
    const yi = py - TOP, ddy = cy - (yi + 0.5), ddy2 = ddy * ddy;
    let j = yi - YC0; if (j < 0) j = 0;
    const bo = (yi - YB0) * W * 4;
    for (let px = 0; px < W; px++) {
      const dx = px + 0.5 - cx, rr = Math.sqrt(dx * dx + ddy2), dr = rr - R;
      let r, g, b, rB = 0, gB = 0, bB = 0, rC = 0, gC = 0, bC = 0, band = false;
      if (dr >= GLOW_MAX) {
        const bi = (dr > BMAX ? BMAX : dr | 0) * 3;
        r = base[bi]; g = base[bi + 1]; b = base[bi + 2];
      } else {
        band = true;
        const U = Math.atan2(dx, ddy) * R;
        let ui = Math.round(U) + UOFF; ui = ui < 0 ? 0 : ui >= UN ? UN - 1 : ui;
        const drc = dr > 0 ? dr : 0, bi = (drc | 0) * 3;
        // the silhouette: anti-aliased at the crest, a few px of defocus out at the sides
        const dre = dr - eL[ui], hw = wL[ui];
        let cov = dre >= hw ? 0 : dre <= -hw ? 1 : (hw - dre) / (2 * hw); cov = cov * cov * (3 - 2 * cov);
        r = g = b = 0;
        if (cov < 1) {
          const hz = hazeT[drc | 0] * (drc > 8 ? 1 + 0.16 * nS.n2(U / 900 + 21, drc / 260 + 2) : 1);
          if (drc > HEAT_MAX) {
            // above the reach of the heat there is only the smoke, the same in every state
            r = rB = rC = base[bi] + HAZE[0] * hz; g = gB = gC = base[bi + 1] + HAZE[1] * hz; b = bB = bC = base[bi + 2] + HAZE[2] * hz;
          } else {
            let st = 1;
            if (drc > 8) {
              // soft layers in the glow, lying along the arc like smoke under a ceiling (never a flame shape)
              const lay = drc + lyL[ui];
              st = 1 + (0.065 * nS.n2(U / 1300, lay / 62) + 0.022 * nS.n2(U / 800 + 9, lay / 27 + 5)) * sstep(8, 60, drc);
            }
            sky(drc, bi, mA[ui], aA[ui], st, hz); r = oR; g = oG; b = oB;
            sky(drc, bi, mB[ui], aB[ui], st, hz); rB = oR; gB = oG; bB = oB;
            sky(drc, bi, mC[ui], aC[ui], st, hz); rC = oR; gC = oG; bC = oB;
          }
        }
        if (cov > 0) {
          const V = dre < 0 ? -dre : 0, k = j * W + px;
          const hx = (hgt[k + (px < W - 1 ? 1 : 0)] - hgt[k - (px > 0 ? 1 : 0)]) * 0.5;
          const hy = (hgt[k + (j < CH - 1 ? W : 0)] - hgt[k - (j > 0 ? W : 0)]) * 0.5;
          const sn = dx / rr, cs = ddy / rr;
          const dV = -hx * sn + hy * cs, dU = hx * cs + hy * sn;   // slope going inward / along the arc
          const foc = focM[k];
          // warm: the furnace light wraps over the rounded edge and rakes a little way down the rim, catching the grain
          let lw = 0.38 + (1.0 + 1.5 * foc) * dV; lw = lw < 0 ? 0 : lw > 1.3 ? 1.3 : lw;
          const line = V < 16 ? 0.42 * Math.exp(-V / 2.6) * bdL[ui] : 0;
          // … and, where the picture is sharp, every grain and rust granule on the way holds a red glint on its far side
          const glint = dV > 0.012 && V > 5 ? (dV - 0.012) * 1.7 * foc * sstep(5, 15, V) * (0.9 * Math.exp(-V / 30) + 0.24 * Math.exp(-V / 100)) : 0;
          const warm = line + glint + (0.21 * Math.exp(-V / 9) + 0.14 * Math.exp(-V / 38) + 0.022 * Math.exp(-V / 140)) * lw;
          // halation: the fire-line bleeds a little red into the black, and a breath of lens glare lies over it
          const halo = 0.085 * Math.exp(-V / 5.5) + 0.036 * Math.exp(-V / 24);
          const veil = 0.03 * Math.exp(-V / 80) + 0.012 * Math.exp(-V / 230);
          // cold: a dim copper-green fill from the front and below finds the rim's flat top and the lip of its inner step
          const onRim = rimM[k], v = vrd[k];
          let lc = 0.38 - 1.15 * dV - 0.32 * dU; lc = lc < 0 ? 0 : lc > 2.2 ? 2.2 : lc;
          const sheenV = (V - 112) / 78;
          lc += 0.58 * Math.exp(-sheenV * sheenV) * shL[ui] * onRim;
          const fld = 0.04 + 0.46 * (1 - sstep(RIMW + 30, RIMW + 250, V));
          const ic = sstep(14, 62, V) * (fld + (1 - fld) * onRim) * hzL[ui] * lc * (0.9 + 0.1 * v);
          const cr = FLOOR[0] + COOL[0] * (0.48 - 0.14 * v) * ic, cg = FLOOR[1] + COOL[1] * (0.7 + 0.26 * v) * ic, cb = FLOOR[2] + COOL[2] * (0.62 + 0.2 * v) * ic;
          const w1 = 1 - cov;
          let t = (0.85 + 0.15 * aA[ui]) * (warm + halo) + veil * vA[ui]; let hi = ((t > HMAX ? HMAX : t) / HMAX * (NH - 1) | 0) * 3;
          r = r * w1 + (cr + heat[hi]) * cov; g = g * w1 + (cg + heat[hi + 1]) * cov; b = b * w1 + (cb + heat[hi + 2]) * cov;
          t = (0.85 + 0.15 * aB[ui]) * (warm + halo) + veil * vB[ui]; hi = ((t > HMAX ? HMAX : t) / HMAX * (NH - 1) | 0) * 3;
          rB = rB * w1 + (cr + heat[hi]) * cov; gB = gB * w1 + (cg + heat[hi + 1]) * cov; bB = bB * w1 + (cb + heat[hi + 2]) * cov;
          t = (0.85 + 0.15 * aC[ui]) * (warm + halo) + veil * vC[ui]; hi = ((t > HMAX ? HMAX : t) / HMAX * (NH - 1) | 0) * 3;
          rC = rC * w1 + (cr + heat[hi]) * cov; gC = gC * w1 + (cg + heat[hi + 1]) * cov; bC = bC * w1 + (cb + heat[hi + 2]) * cov;
        }
      }
      // ordered-noise dither: these gradients are far too slow and dark for 8 bits otherwise
      sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
      const n1 = (sd & 1023) / 1023 - 0.5, n2 = ((sd >>> 10) & 1023) / 1023 - 0.5, n3 = ((sd >>> 20) & 1023) / 1023 - 0.5;
      const o = (py * W + px) * 4;
      d[o] = r + n1; d[o + 1] = g + n2; d[o + 2] = b + n3; d[o + 3] = 255;
      if (yi >= YB0) {
        const q = bo + px * 4;
        if (band) {
          e1[q] = rB + n1; e1[q + 1] = gB + n2; e1[q + 2] = bB + n3;
          e2[q] = rC - r + n3; e2[q + 1] = gC - g + n1; e2[q + 2] = bC - b + n2;
        } else { e1[q] = r + n1; e1[q + 1] = g + n2; e1[q + 2] = b + n3; }
        e1[q + 3] = 255; e2[q + 3] = 255;
      }
    }
  }
  const put = (im) => { const c = L.makeCanvas(im.width, im.height); c.getContext('2d').putImageData(im, 0, 0); return c; };
  return {
    key: `${R}|${crest}|${cx}`, plate: put(img), pSpread: put(i1), dBreath: put(i2), yb0: YB0, heat,
    topCss: `rgb(${Math.round(base[1400 * 3])},${Math.round(base[1400 * 3 + 1])},${Math.round(base[1400 * 3 + 2])})`,
    sparks: SPARKS.map(([U, dr, rad, lum, soft], i) => { const q = L.rng('s01spark' + i); return { U, dr, rad, lum, soft, ph: q() * L.TAU, rise: q.range(12, 30), sway: q.range(3, 8) }; }),
  };
}

/** pre-render the plates (safe to call again and again) */
export function initOpening(env) {
  const a = env.arc, key = `${a.R}|${a.crestY}|${a.cx}`;
  if (!S || S.key !== key) S = build(env);
  return S;
}
let S = null;

/**
 * tilt: px the camera has tilted UP (the whole picture slides down by this much). 0 = the opening framing.
 * k:    0..1 the picture's own time: the glow spreads out along the arc and breathes once, the embers drift up.
 */
export function drawOpening(ctx, env, { tilt = 0, k = 0 } = {}) {
  const a = env.arc, s = initOpening(env);
  k = L.clamp(k);
  ctx.save();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = s.topCss; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(s.plate, 0, tilt - TOP);
  if (k > 0) {
    ctx.globalAlpha = L.smooth(k);                               // the glow runs out along the arc …
    ctx.drawImage(s.pSpread, 0, s.yb0 + tilt);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 - 0.5 * Math.cos(k * L.TAU);            // … and the hot centre takes one slow breath
    ctx.drawImage(s.dBreath, 0, s.yb0 + tilt);
  }
  // embers
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
  ctx.translate(0, tilt);
  const heat = s.heat;
  for (const sp of s.sparks) {
    const dr = sp.dr + sp.rise * k * (sp.dr > 560 ? 0.4 : 1);
    const p = a.pt((sp.U + sp.sway * Math.sin(sp.ph + k * 2.4)) / a.R, dr);
    if (p.y + tilt < -30 || p.y + tilt > H + 30 || p.x < -30 || p.x > W + 30) continue;
    const fl = 0.84 + 0.16 * Math.sin(sp.ph * 3 + k * 8);
    const hot = sp.lum * (1 - 0.7 * sstep(30, 380, dr));
    const hi = ((L.lerp(0.3, 0.84, hot) / HMAX) * (NH - 1) | 0) * 3;
    const col = (al) => `rgba(${heat[hi] | 0},${heat[hi + 1] | 0},${heat[hi + 2] | 0},${al.toFixed(3)})`;
    if (sp.soft) {
      // an ember out of focus: a faint flat disc, a shade brighter at its rim
      const rr = sp.soft, al = 0.2 * sp.lum * fl;
      ctx.fillStyle = L.radial(ctx, p.x, p.y, 0, rr, [[0, col(al * 0.8)], [0.62, col(al * 0.85)], [0.86, col(al)], [1, col(0)]]);
      ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
    } else {
      const rr = sp.rad * 4.5, al = (0.45 + 0.5 * sp.lum) * fl;
      ctx.fillStyle = L.radial(ctx, p.x, p.y, 0, rr, [[0, col(al)], [sp.rad / rr, col(al * 0.8)], [0.4, col(al * 0.14)], [1, col(0)]]);
      ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
    }
  }
  ctx.restore();
}

export default {
  name: '炉火映钱郭',
  tone: 'light',
  init(env) { initOpening(env); },
  draw(ctx, env, p) { drawOpening(ctx, env, { tilt: 0, k: p }); },
};
