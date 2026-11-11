// s01 — 炉火映钱郭. The opening image, and the one the film returns to: an eclipse.
// The arc is the top of the raised outer rim (外郭) of one enormous cash coin, seen as a silhouette against the glow of the
// furnace behind it. Above the arc the glow is a pure gradient (white-hot at the edge → 炽橙 → 暗红 → 铜绿黑), laid down in soft
// layers like a horizon seen from orbit, with a breath of copper-green smoke above the red before the dark takes over.
// Below it the coin is almost black: a hair-line of fire on the rounded edge, a little halation, then the broad rim band and
// its inner step barely lifted out of the dark by a cold verdigris-coloured fill light, falling out of focus, then nothing.
// No inscription is shown.
//
// Everything is shaded per pixel once, in init, into one tall dithered plate (frame + the dark space above it that the title
// card tilts up into). Two smaller plates carry the motion: the same picture with the glow spread out along the arc (cross-
// faded in), and an additive "difference" plate for one slow breath of the hot centre. The coin itself never moves.
//
// The plates are computed in DEVICE pixels (L.pixelCanvas): every device pixel is shaded from its own logical coordinate, so a
// 4K master (L.SS = 2) is native, not enlarged. What only a 4K frame can hold — single grains of moulding sand on the edge,
// pin-holes with a lit inner lip, the packed sand skin under the edge — is switched in by `fine` (0 at 1080p, 1 at 4K), so
// the 1080p picture is the one it always was.
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
const US = 8, UOFF = 1300;          // tables along the arc: samples per px, half-length (px)
const VS = 8, VSPAN = 600;          // tables by depth below the edge: samples per px, length (px)
const GRAIN = 2.6;                  // pitch of the packed sand skin (px) — 4K only

// heat → colour. The palette anchors: 暗红 #8a1c10 @0.30, 炽橙 #ff7a1a @0.68, 炉心亮 #ffd08a @0.90
const HEAT = [[0, '#000000'], [0.05, '#140509'], [0.10, '#3a0d10'], [0.18, '#54100a'], [0.30, '#8a1c10'], [0.42, '#b82e10'],
  [0.55, '#e04a12'], [0.68, '#ff7a1a'], [0.80, '#ffa340'], [0.90, '#ffd08a'], [1.0, '#fff0cf'], [1.12, '#fff8ea']];
// the dark space, by height above the arc (px): 铜绿黑 #07120f, deeper far up
const SKY = [[0, '#081511'], [650, '#07130f'], [900, '#07120f'], [1200, '#060f0d'], [1700, '#050d0b']];

// embers: [U = px along the arc from the crest, dr = px above the arc, core radius, brightness, soft (out-of-focus radius, 0 = sharp)]
// Five in all, no more: four small sharp ones low in the glow and one nearer the lens, out of focus.
const SPARKS = [
  [-318, 26, 1.4, 1.0, 0], [96, 44, 1.6, 1.0, 0], [-112, 92, 1.2, 0.85, 0], [452, 30, 1.1, 0.8, 0],
  [226, 134, 0, 0.5, 6],
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

// the sand skin: packed grains of unequal height (gH 0..1, a continuous field of little domes with creases between them) and,
// here and there in place of a grain, a pin-hole (gP 0..1: flat floor, steep wall)
let gH = 0, gP = 0;
function grains(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let hm = 0, pm = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const qx = xi + ox, qy = yi + oy;
    let h = (Math.imul(qx, 0x27d4eb2d) ^ Math.imul(qy, 0x165667b1)) + 0x51ed27 | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
    const dx = qx + (h & 1023) / 1023 - x, dy = qy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    const id = (h >>> 20) & 255;
    if (id >= 252) {
      if (d < 0.2) { const t = (1 - Math.sqrt(d) / 0.447) / 0.5, v = t >= 1 ? 1 : t * t * (3 - 2 * t); if (v > pm) pm = v; }
    } else {
      const r2 = 0.2 + 0.3 * ((h >>> 28) & 15) / 15;
      if (d < r2) { const v = (0.3 + 0.7 * id / 251) * (1 - d / r2); if (v > hm) hm = v; }
    }
  }
  gH = hm; gP = pm;
}

function build(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, crest = a.crestY;
  const nA = L.makeNoise('s01a'), nB = L.makeNoise('s01b'), nS = L.makeNoise('s01s');
  const ss = L.SS, iss = 1 / ss, fine = L.clamp(ss - 1);   // device pixels per px; `fine`: the detail only a 4K frame can hold

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
  const hazeT = new Float32Array(GLOW_MAX + 3);
  for (let i = 0; i < GLOW_MAX + 3; i++) hazeT[i] = (0.4 + 0.6 * sstep(0, 220, i)) * (1 - sstep(270, 540, i));
  // by depth below the edge (V, px): everything the light does that depends on depth alone
  //   [0] the hair-line of fire  [1] the furnace light wrapping over the edge and raking down the rim  [2] reach of the red glints
  //   [3] halation  [4] lens glare  [5] the rim's dull sheen  [6] how much cold light the field below the rim gets  [7] cold light fading in
  const VN = VSPAN * VS + 2, VT = new Float32Array(VN * 8);
  for (let i = 0; i < VN; i++) {
    const V = i / VS, o = i * 8, sv = (V - 112) / 78;
    VT[o] = V < 16 ? 0.42 * Math.exp(-V / 2.6) : 0;
    VT[o + 1] = 0.21 * Math.exp(-V / 9) + 0.14 * Math.exp(-V / 38) + 0.022 * Math.exp(-V / 140);
    VT[o + 2] = V > 5 ? sstep(5, 15, V) * (0.9 * Math.exp(-V / 30) + 0.24 * Math.exp(-V / 100)) : 0;
    VT[o + 3] = 0.085 * Math.exp(-V / 5.5) + 0.036 * Math.exp(-V / 24);
    VT[o + 4] = 0.03 * Math.exp(-V / 80) + 0.012 * Math.exp(-V / 230);
    VT[o + 5] = 0.58 * Math.exp(-sv * sv);
    VT[o + 6] = 0.04 + 0.46 * (1 - sstep(RIMW + 30, RIMW + 250, V));
    VT[o + 7] = sstep(14, 62, V);
  }
  // along the arc (US samples per px): amplitude (a*) and thickness (m*) of the glow in three states —
  // A = the opening frame (hot centre, thin embers out to the sides), B = spread wide, C = A with the centre swollen (the breath)
  const UN = UOFF * 2 * US + 2;
  const aA = new Float32Array(UN), mA = new Float32Array(UN), vA = new Float32Array(UN);
  const aB = new Float32Array(UN), mB = new Float32Array(UN), vB = new Float32Array(UN);
  const aC = new Float32Array(UN), mC = new Float32Array(UN), vC = new Float32Array(UN);
  const hzL = new Float32Array(UN), shL = new Float32Array(UN), eL = new Float32Array(UN), wL = new Float32Array(UN), bdL = new Float32Array(UN);
  const rwL = new Float32Array(UN), dpL = new Float32Array(UN), lyL = new Float32Array(UN), enL = new Float32Array(UN), fuL = new Float32Array(UN);
  const eML = new Float32Array(UN), eFL = new Float32Array(UN), bdFL = new Float32Array(UN);   // the parts of the silhouette that are single grains and nicks (see depth())
  const BURR = [[-412, 1.9, 9], [188, 1.5, 7], [655, 2.1, 11], [-770, 1.8, 8], [930, 1.6, 10]];   // [U, height, half-width] px
  // the cast edge under a loupe: grains of moulding sand standing proud of the silhouette (each one catches a bead of fire),
  // and blow-holes (砂眼) nicked into it. Heights of a pixel or so — far inside the match-cut tolerance.
  const nubL = new Float32Array(UN), nubF = new Float32Array(UN), eq = L.rng('s01edge'), eqF = L.rng('s01edgeFine');
  const nub = (T, u0, hh, ww) => {
    const i0 = Math.max(0, Math.floor((u0 - 3 * ww + UOFF) * US)), i1 = Math.min(UN - 1, Math.ceil((u0 + 3 * ww + UOFF) * US));
    for (let i = i0; i <= i1; i++) { const t = (i / US - UOFF - u0) / ww; T[i] += hh * Math.exp(-t * t); }
  };
  for (let n = 0; n < 64; n++) nub(nubL, eq.range(-1260, 1260), eq.range(0.55, 1.6), eq.range(1.5, 4.0));
  for (let n = 0; n < 22; n++) nub(nubL, eq.range(-1200, 1200), -eq.range(0.8, 2.1), eq.range(2.0, 4.4));
  if (fine > 0) {
    // 4K: single grains (half a pixel proud, a pixel wide) and pin-nicks, between the larger ones
    for (let n = 0; n < 250; n++) nub(nubF, eqF.range(-1120, 1120), eqF.range(0.2, 0.7), eqF.range(0.4, 1.0));
    for (let n = 0; n < 76; n++) nub(nubF, eqF.range(-1120, 1120), -eqF.range(0.35, 1.0), eqF.range(0.5, 1.3));
  }
  for (let i = 0; i < UN; i++) {
    const U = i / US - UOFF, Uh = U - HOT;
    const g0 = Math.exp(-Math.pow(Uh / (Uh < 0 ? 570 : 670), 2)), g1 = Math.exp(-Math.pow(Uh / 1200, 2)), gb = Math.exp(-Math.pow(Uh / 820, 2));
    aA[i] = 0.74 + 0.38 * g0; mA[i] = 0.55 + 0.45 * g0; vA[i] = g0;
    aB[i] = 0.84 + 0.28 * g1; mB[i] = 0.74 + 0.26 * g1; vB[i] = g1;
    aC[i] = aA[i] + 0.05 * gb; mC[i] = mA[i] * (1 + 0.09 * gb); vC[i] = g0 + 0.3 * gb;
    hzL[i] = 0.5 + 0.5 * Math.exp(-Math.pow((U + 160) / 820, 2));   // the fill light is a little stronger left of centre
    shL[i] = Math.exp(-Math.pow((U + 240) / 560, 2));               // where the rim's dull sheen sits
    fuL[i] = Math.exp(-Math.pow(U / 1300, 2));                      // focus falls away out to the sides
    // the silhouette: a cast and filed edge is never compass-true (± a pixel or so, far inside the match-cut tolerance)
    let e = 0.8 * nA.n2(U / 230, 3.3) + 0.4 * nB.n2(U / 52, 6.1);
    for (const [u0, hh, ww] of BURR) { const t = (U - u0) / ww; if (t > -3 && t < 3) e += hh * Math.exp(-t * t); }
    const eM = 0.2 * nS.n2(U / 4.2 + 3, 8.4) + nubL[i];
    e += 0.4 * nB.n2(U / 10 + 17, 4.2) + eM;                                         // the grain of the sand mould
    eML[i] = eM;
    let bd = 0.82 + 0.3 * nS.n2(U / 96, 1.7) + 0.14 * nS.n2(U / 15, 9.1)    // the fire-line beads along the edge,
      + (nubL[i] > 0 ? 0.6 * nubL[i] : 0.22 * nubL[i]);                      // brightest on the proud grains, dim in the nicks
    if (fine > 0) {
      const sharp = fine / (1 + Math.pow(U / 1000, 2));   // (the finest of it softens with the focus, out to the sides)
      eFL[i] = sharp * (0.13 * nA.n2(U / 1.7 + 41, 2.7) + 0.06 * nB.n2(U / 0.75 + 5, 7.9) + nubF[i]);
      e += eFL[i];
      bdFL[i] = sharp * ((nubF[i] > 0 ? 1.3 : 0.6) * nubF[i] + 0.1 * nS.n2(U / 2.1 + 9, 3.3));   // (a bead no taller than its grain: see the shading)
    }
    eL[i] = e; bdL[i] = bd;
    // focus is at the crest: the edge softens toward the sides (at the crest it is one device pixel of anti-aliasing)
    wL[i] = (0.55 + 0.15 * fine) / ss + (1.5 - 0.4 * fine) * Math.pow(U / 1000, 2);
    // the inner edge of the rim wanders a little, and its step is worn shallow in places
    rwL[i] = RIMW + 5 * nA.n2(U / 430, 5.5) + 1.8 * nA.n2(U / 130, 2.2) + 0.6 * nB.n2(U / 41, 8.8);
    dpL[i] = 0.42 + 0.58 * sstep(-0.35, 0.3, nB.n2(U / 360 + 3, 12.3));
    lyL[i] = 10 * nS.n2(U / 700, 4.4);                              // the layers of the glow sag and lift a little
  }
  // 1 / length of the silhouette's normal: turns the radial distance to the edge into the true distance on steep flanks
  for (let i = 0; i < UN; i++) { const s = (eL[i < UN - 1 ? i + 1 : i] - eL[i > 0 ? i - 1 : i]) * US * 0.5; enL[i] = 1 / Math.sqrt(1 + s * s); }
  // depth below the edge as the relief sees it. At 1080p a grain on the silhouette carries the whole edge profile with it; at 4K
  // that would comb the fire-line into streaks, so there a grain is only a grain: its lift dies away a few px in.
  const depth = (V, ui, fu) => {
    if (fine <= 0 || V <= 0) return V;
    const eM = eML[ui] + (eML[ui + 1] - eML[ui]) * fu, eF = eFL[ui] + (eFL[ui + 1] - eFL[ui]) * fu, Vb = V - eM - eF;
    if (Vb > 40) return V - fine * (eM + eF);
    if (Vb <= 0) return V;
    return V - fine * (eM * (1 - Math.exp(-Vb / 5)) + eF * (1 - Math.exp(-Vb / 1.4)));
  };

  // ── the coin's relief (height in px, one sample per DEVICE pixel), everything below the arc ──
  const YC0 = Math.floor(crest) - 8, CH = H - YC0, Wq = W * ss, CHq = CH * ss;
  const hgt = new Float32Array(Wq * CHq), det = new Float32Array(Wq * CHq), vrd = new Float32Array(Wq * CHq);
  for (let j = 0; j < CHq; j++) {
    const ddy = cy - (YC0 + (j + 0.5) * iss), ddy2 = ddy * ddy;
    for (let i = 0; i < Wq; i++) {
      const dx = (i + 0.5) * iss - cx, V0 = R - Math.sqrt(dx * dx + ddy2);
      if (V0 < -8) continue;
      const U = Math.atan2(dx, ddy) * R, k = j * Wq + i;
      let uf = (U + UOFF) * US; uf = uf < 0 ? 0 : uf > UN - 2 ? UN - 2 : uf;
      const ui = uf | 0, fu = uf - ui;
      const V = depth(V0 + eL[ui] + (eL[ui + 1] - eL[ui]) * fu, ui, fu), Vc = V < 0 ? 0 : V;
      const rimw = rwL[ui], worn = dpL[ui];
      let prof;
      if (Vc < BEV) { const t = 1 - Vc / BEV; prof = RELIEF * (1 - t * t); }        // the worn, rounded outer edge
      else if (Vc < rimw) prof = RELIEF;                                             // the flat top of the rim
      else prof = RELIEF * (1 - worn * sstep(0, STEP, Vc - rimw));                  // the step down into the field
      const onRim = Vc < rimw - 3 ? 1 : 1 - sstep(rimw - 3, rimw + STEP, Vc);
      // depth of field: sharp at the crest of the edge, melting away down the face and out to the sides
      const fv = Vc / 95, foc = fuL[ui] / (1 + fv * fv);
      const g2 = nB.n2(U / 9 + 31, Vc / 9);                                          // sand-cast grain
      const m = nA.fbm(U / 74 + 7, Vc / 74 - 3, 3);                                  // slow swell of the patina crust
      const big = nB.fbm(U / 380 - 11, Vc / 380 + 4, 2);
      const drift = sstep(-0.2, 0.3, big + 0.3 * m);                                 // where the patina crust lies thicker
      // traces of the file that dressed the rim, running round it; the crust has buried most of them
      const file = 0.06 * nB.n2(U / 210, Vc / 3.2 + 77) * onRim * (1 - 0.8 * drift) * sstep(14, 50, Vc) * (0.3 + 0.7 * foc);
      cell(U / 44, Vc / 44);                                                         // rust grains: raised granules, in drifts
      let nod = 0;
      if (cId > 0.5) {
        const e = (cId - 0.5) / 0.5, rad = 0.13 + 0.2 * e, t = 1 - Math.sqrt(cD1) / rad;
        if (t > 0) nod = t * t * (3 - 2 * t) * (0.5 + 0.9 * e) * (0.3 + 0.7 * drift) * (0.35 + 0.65 * foc);
      }
      // the sand-cast skin close under the edge, where the fire rakes it: blow-holes (砂眼) with a lit far lip, and proud
      // grains of moulding sand. Kept to the first few dozen px: the place of the brand name below stays calm.
      let sand = 0;
      if (Vc > 1.5 && Vc < 92) {
        const near = sstep(1.5, 6, Vc) * (1 - sstep(44, 92, Vc)) * (0.22 + 0.78 * foc);
        cell(U / 12 + 5.5, Vc / 12 + 1.5);
        if (cId > 0.88) {
          const e = (cId - 0.88) / 0.12, rad = 0.15 + 0.15 * e, t = 1 - Math.sqrt(cD1) / rad;
          if (t > 0) {
            let p = t * t * (3 - 2 * t);
            if (fine > 0) p += fine * (sstep(0, 0.45, t) - p);    // 4K: a flat floor and a crisp wall, so the far lip is a clean crescent
            sand = -p * (0.4 + 0.55 * e) * near;
          }
        } else if (cId < 0.42) {
          const e = cId / 0.42, rad = 0.09 + 0.1 * e, t = 1 - Math.sqrt(cD1) / rad;
          if (t > 0) sand = t * t * (3 - 2 * t) * (0.26 + 0.34 * e) * near;
        }
      }
      // 4K: the sand skin itself — packed grains, a pin-hole here and there — from the very edge down to where the brand name sits
      let skin = 0;
      if (fine > 0 && Vc > 0.2 && Vc < 114) {
        const patch = 0.25 + 0.75 * sstep(-0.35, 0.4, nA.n2(U / 37 + 3.3, Vc / 37 + 8.1));   // rougher in drifts, smoother between
        const wF = fine * sstep(0.2, 1.8, Vc) * (1 - sstep(64, 114, Vc)) * (0.2 + 0.8 * foc);
        grains(U / GRAIN + 9.1, Vc / GRAIN + 4.7);
        skin = wF * (0.23 * patch * gH * (1 - gP) - 0.7 * gP);
      }
      const fade = sstep(0, 5, Vc);   // roughness grows in from the silhouette
      hgt[k] = prof + fade * (0.19 * g2 * (0.1 + 0.9 * foc) * (0.45 + 0.9 * drift) + 0.5 * m + file + nod) + sand + skin;
      det[k] = sand + skin;
      vrd[k] = L.clamp(0.45 + 0.8 * big + 0.3 * m + 0.6 * nod);
    }
  }

  // ── shade: the plate (state A), the spread plate (state B) and the breath's difference plate (C − A) ──
  // B and C only differ from A where there is heat: the two motion plates start HEAT_MAX above the crest
  const PH = H + TOP, YB0 = Math.floor(crest - HEAT_MAX) - 2, BH = H - YB0;
  let brA = BH * ss, brB = -1;   // device rows of the breath plate that hold anything at all
  let oR = 0, oG = 0, oB = 0;
  const sky = (drc, bi, mm, amp, st, hz) => {
    let t = (drc / mm) * 4; if (t > TPN - 2) t = TPN - 2;
    const ti = t | 0;
    t = (TP[ti] + (TP[ti + 1] - TP[ti]) * (t - ti)) * amp * st; if (t > HMAX) t = HMAX;
    const hi = ((t / HMAX) * (NH - 1) | 0) * 3;
    // the cold smoke only shows where the heat has died away, so the reds stay clean instead of going brown
    const kb = 1 - sstep(0, 0.14, t);
    oR = heat[hi] + (base[bi] + HAZE[0] * hz) * kb; oG = heat[hi + 1] + (base[bi + 1] + HAZE[1] * hz) * kb; oB = heat[hi + 2] + (base[bi + 2] + HAZE[2] * hz) * kb;
  };
  const shade = (d, e1, e2, pw, ph) => {
    let sd = 0x2545f491 | 0;
    for (let py = 0; py < ph; py++) {
      const ddy = cy - ((py + 0.5) * iss - TOP), ddy2 = ddy * ddy;
      let j = py - (TOP + YC0) * ss; if (j < 0) j = 0;
      const pb = py - (TOP + YB0) * ss, bo = pb * pw * 4;
      let lit = false;
      for (let px = 0; px < pw; px++) {
        const dx = (px + 0.5) * iss - cx, rr = Math.sqrt(dx * dx + ddy2), dr = rr - R;
        let r, g, b, rB = 0, gB = 0, bB = 0, rC = 0, gC = 0, bC = 0, band = false;
        if (dr >= GLOW_MAX) {
          const bi = (dr > BMAX ? BMAX : dr | 0) * 3;
          r = base[bi]; g = base[bi + 1]; b = base[bi + 2];
        } else {
          band = true;
          const U = Math.atan2(dx, ddy) * R;
          let uf = (U + UOFF) * US; uf = uf < 0 ? 0 : uf > UN - 2 ? UN - 2 : uf;
          const ui = uf | 0, fu = uf - ui;
          const drc = dr > 0 ? dr : 0, di = drc | 0, bi = di * 3;
          // the silhouette: anti-aliased at the crest, a few px of defocus out at the sides
          const dre = dr - (eL[ui] + (eL[ui + 1] - eL[ui]) * fu), dn = dre * enL[ui], hw = wL[ui];
          let cov = dn >= hw ? 0 : dn <= -hw ? 1 : (hw - dn) / (2 * hw); cov = cov * cov * (3 - 2 * cov);
          r = g = b = 0;
          if (cov < 1) {
            const hz = (hazeT[di] + (hazeT[di + 1] - hazeT[di]) * (drc - di)) * (drc > 8 ? 1 + 0.16 * nS.n2(U / 900 + 21, drc / 260 + 2) : 1);
            if (drc > HEAT_MAX) {
              // above the reach of the heat there is only the smoke, the same in every state
              r = rB = rC = base[bi] + HAZE[0] * hz; g = gB = gC = base[bi + 1] + HAZE[1] * hz; b = bB = bC = base[bi + 2] + HAZE[2] * hz;
            } else {
              let st = 1;
              if (drc > 8) {
                // soft layers in the glow, lying along the arc like smoke under a ceiling (never a flame shape)
                const lay = drc + lyL[ui];
                st = 1 + (0.034 * nS.n2(U / 820, lay / 62) + 0.012 * nS.n2(U / 460 + 9, lay / 27 + 5)) * sstep(8, 60, drc);
              }
              sky(drc, bi, mA[ui], aA[ui], st, hz); r = oR; g = oG; b = oB;
              sky(drc, bi, mB[ui], aB[ui], st, hz); rB = oR; gB = oG; bB = oB;
              sky(drc, bi, mC[ui], aC[ui], st, hz); rC = oR; gC = oG; bC = oB;
            }
          }
          if (cov > 0) {
            const V = dre < 0 ? depth(-dre, ui, fu) : 0, k = j * Wq + px;
            const hx = (hgt[k + (px < Wq - 1 ? 1 : 0)] - hgt[k - (px > 0 ? 1 : 0)]) * 0.5 * ss;
            const hy = (hgt[k + (j < CHq - 1 ? Wq : 0)] - hgt[k - (j > 0 ? Wq : 0)]) * 0.5 * ss;
            const sn = dx / rr, cs = ddy / rr;
            const dV = -hx * sn + hy * cs, dU = hx * cs + hy * sn;   // slope going inward / along the arc
            let vq = V * VS; if (vq > VN - 2) vq = VN - 2;
            const v0 = vq | 0, vf = vq - v0, o = v0 * 8;
            const fv = V / 95, foc = fuL[ui] / (1 + fv * fv);
            // warm: the furnace light wraps over the rounded edge and rakes a little way down the rim, catching the grain
            let lw = 0.38 + (1.0 + 1.5 * foc) * dV; lw = lw < 0 ? 0 : lw > 1.3 ? 1.3 : lw;
            let bd = bdL[ui] + (bdL[ui + 1] - bdL[ui]) * fu;
            if (fine > 0 && V < 6) bd += (bdFL[ui] + (bdFL[ui + 1] - bdFL[ui]) * fu) * Math.exp(-V / 0.9);
            let line = (VT[o] + (VT[o + 8] - VT[o]) * vf) * bd;
            let wrap = (VT[o + 1] + (VT[o + 9] - VT[o + 1]) * vf) * lw;
            if (fine > 0) {
              // 4K: the fire picks out every proud grain on the edge and loses the pin-holes
              let lm = 1 + 1.4 * det[k]; lm = lm < 0.2 ? 0.2 : lm > 1.9 ? 1.9 : lm;
              lm = 1 + fine * (lm - 1);
              line *= lm; wrap *= 0.5 + 0.5 * lm;
              if (V < 14 && j > 0 && j < CHq - 1 && px > 0 && px < Wq - 1) {
                // on the rounded edge itself the wrap light is burnt out, so the grains would vanish just where they matter
                // most: give each one its lit face and its shadowed back there
                const sl = (-(det[k + 1] - det[k - 1]) * sn + (det[k + Wq] - det[k - Wq]) * cs) * 0.5 * ss;
                let sh = 1 + 1.5 * fine * sl * (1 - sstep(8, 14, V)); sh = sh < 0.5 ? 0.5 : sh > 1.5 ? 1.5 : sh;
                wrap *= sh;
              }
            }
            // … and, where the picture is sharp, every grain and rust granule on the way holds a red glint on its far side
            const glint = dV > 0.012 && V > 5 ? (dV - 0.012) * 1.7 * foc * (VT[o + 2] + (VT[o + 10] - VT[o + 2]) * vf) : 0;
            const warm = line + glint + wrap;
            // halation: the fire-line bleeds a little red into the black, and a breath of lens glare lies over it
            const halo = VT[o + 3] + (VT[o + 11] - VT[o + 3]) * vf;
            const veil = VT[o + 4] + (VT[o + 12] - VT[o + 4]) * vf;
            // cold: a dim copper-green fill from the front and below finds the rim's flat top and the lip of its inner step
            const rimw = rwL[ui], onRim = V < rimw - 3 ? 1 : 1 - sstep(rimw - 3, rimw + STEP, V), v = vrd[k];
            let lc = 0.38 - 1.15 * dV - 0.32 * dU; lc = lc < 0 ? 0 : lc > 2.2 ? 2.2 : lc;
            lc += (VT[o + 5] + (VT[o + 13] - VT[o + 5]) * vf) * shL[ui] * onRim;
            const fld = VT[o + 6] + (VT[o + 14] - VT[o + 6]) * vf;
            const ic = (VT[o + 7] + (VT[o + 15] - VT[o + 7]) * vf) * (fld + (1 - fld) * onRim) * hzL[ui] * lc * (0.9 + 0.1 * v);
            const cr = FLOOR[0] + COOL[0] * (0.48 - 0.14 * v) * ic, cg = FLOOR[1] + COOL[1] * (0.7 + 0.26 * v) * ic, cb = FLOOR[2] + COOL[2] * (0.62 + 0.2 * v) * ic;
            const w1 = 1 - cov;
            let t = (0.85 + 0.15 * aA[ui]) * (warm + halo) + veil * vA[ui]; let hi = ((t > HMAX ? HMAX : t) / HMAX * (NH - 1) | 0) * 3;
            r = r * w1 + (cr + heat[hi]) * cov; g = g * w1 + (cg + heat[hi + 1]) * cov; b = b * w1 + (cb + heat[hi + 2]) * cov;
            t = (0.85 + 0.15 * aB[ui]) * (warm + halo) + veil * vB[ui]; hi = ((t > HMAX ? HMAX : t) / HMAX * (NH - 1) | 0) * 3;
            rB = rB * w1 + (cr + heat[hi]) * cov; gB = gB * w1 + (cg + heat[hi + 1]) * cov; bB = bB * w1 + (cb + heat[hi + 2]) * cov;
            t = (0.85 + 0.15 * aC[ui]) * (warm + halo) + veil * vC[ui]; hi = ((t > HMAX ? HMAX : t) / HMAX * (NH - 1) | 0) * 3;
            rC = rC * w1 + (cr + heat[hi]) * cov; gC = gC * w1 + (cg + heat[hi + 1]) * cov; bC = bC * w1 + (cb + heat[hi + 2]) * cov;
          }
          if (!lit && (rC - r > 0.4 || gC - g > 0.4 || bC - b > 0.4)) lit = true;
        }
        // ordered-noise dither: these gradients are far too slow and dark for 8 bits otherwise
        sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
        const n1 = (sd & 1023) / 1023 - 0.5, n2 = ((sd >>> 10) & 1023) / 1023 - 0.5, n3 = ((sd >>> 20) & 1023) / 1023 - 0.5;
        const o = (py * pw + px) * 4;
        d[o] = r + n1; d[o + 1] = g + n2; d[o + 2] = b + n3; d[o + 3] = 255;
        if (pb >= 0) {
          const p = bo + px * 4;
          if (band) {
            e1[p] = rB + n1; e1[p + 1] = gB + n2; e1[p + 2] = bB + n3;
            e2[p] = rC - r + n3; e2[p + 1] = gC - g + n1; e2[p + 2] = bC - b + n2;
          } else { e1[p] = r + n1; e1[p + 1] = g + n2; e1[p + 2] = b + n3; }
          e1[p + 3] = 255; e2[p + 3] = 255;
        }
      }
      if (lit && pb >= 0) { if (pb < brA) brA = pb; if (pb > brB) brB = pb; }
    }
  };
  let plate = null, pSpread = null, dBreath = null;
  plate = L.pixelCanvas(W, PH, (d, pw, ph) => {
    pSpread = L.pixelCanvas(W, BH, (e1) => { dBreath = L.pixelCanvas(W, BH, (e2) => shade(d, e1, e2, pw, ph)); });
  });
  const by0 = brB < 0 ? 0 : Math.floor(brA / ss), bh = brB < 0 ? 0 : Math.ceil((brB + 1) / ss) - by0;
  return {
    key: `${R}|${crest}|${cx}`, plate, pSpread, dBreath, yb0: YB0, by0, bh, heat,
    topCss: `rgb(${Math.round(base[1400 * 3])},${Math.round(base[1400 * 3 + 1])},${Math.round(base[1400 * 3 + 2])})`,
    sparks: SPARKS.map(([U, dr, rad, lum, soft], i) => { const rq = L.rng('s01spark' + i); return { U, dr, rad, lum, soft, ph: rq() * L.TAU, rise: rq.range(12, 30), sway: rq.range(3, 8) }; }),
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
  // the plate covers the whole frame for any tilt from 0 to TOP; only outside that is there anything left to fill
  if (!(tilt >= 0 && tilt <= TOP)) { ctx.fillStyle = s.topCss; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(s.plate, 0, tilt - TOP);
  if (k > 0) {
    ctx.globalAlpha = L.smooth(k);                               // the glow runs out along the arc …
    ctx.drawImage(s.pSpread, 0, s.yb0 + tilt);
    if (s.bh > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 - 0.5 * Math.cos(k * L.TAU);          // … and the hot centre takes one slow breath
      ctx.drawImage(s.dBreath, 0, s.by0, W, s.bh, 0, s.yb0 + s.by0 + tilt, W, s.bh);
    }
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
