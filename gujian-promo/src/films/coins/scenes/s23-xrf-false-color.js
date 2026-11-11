// s23 — 成分扫描伪彩图. The false-colour map an X-ray fluorescence area scan of a cash coin throws on the screen,
// seen close: a macro of the map where the coin's outer rim crosses the frame.
//   the arc        → the coin's outer edge: the hottest band of the map, a wide glowing magenta rim (外郭)
//   just outside   → a stair-stepped corona of coarse square scan pixels (scatter signal): a quantised glow that hugs
//                    the rim, low over the crest, climbing at the two sides and under the hot spectral lines
//   below the arc  → concentric colour bands, rim inward: magenta · purple · orange · bright yellow · fluorescent green,
//                    wide and narrow by turns. Their borders wander like contour lines; corrosion shows up as islands
//                    with their own colour rings, a few lead-rich specks as hot dots.
//   above the arc  → near-black screen with vertical neon spectral lines (discrete peaks, not a rainbow): a few broad
//                    hot bands and hairlines, dense and bright at the two sides, none above the crest (tagline).
//
// The whole picture is ONE scalar field on a coarse scan grid (1 scan pixel = Q screen px), pushed through a colour LUT —
// the way real false-colour maps are made — so every border gets its natural fringe of in-between colours and the
// counting noise speckles the borders. The field is re-evaluated every frame (cheap at this resolution):
// band borders creep, the noise re-rolls, halo pixels flicker. Focus sits on the crest; the picture melts toward the
// sides and the bottom. No figures, letters or element symbols anywhere.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 60;                         // rot only slides the picture ~±20 px
const Q = 4;                            // one scan pixel = Q screen px
const LW = (W + PAD * 2) / Q, LH = (H + PAD * 2) / Q;
const MW = (W + PAD * 2) / 2, MH = (H + PAD * 2) / 2;   // the frame is composed at half resolution
const CELL = Math.round(40 / Q);        // a halo block ≈ 40 screen px
const NMASK = (1 << 18) - 1;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hsh = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// ── the colour scale (scalar → colour). Outside the coin the signal lives in 0 … 0.3; the rim is the hot magenta peak;
//    the coin's face climbs from purple through orange and yellow to green (and a rare cyan-green hot spot beyond 1). ──
const SMAX = 1.16, NL = 2048;
const LUT_STOPS = [
  [0.000, '#05040a'], [0.045, '#0d0626'], [0.105, '#261069'], [0.175, '#5617bc'], [0.245, '#9c1fdc'], [0.300, '#dc28da'],
  [0.335, '#ff2bd6'], [0.354, '#ff4ede'], [0.372, '#ffb2f4'], [0.390, '#ff56e0'], [0.406, '#ff34d8'], [0.428, '#ee2bd6'],
  [0.470, '#9019d0'], [0.535, '#5413c2'], [0.580, '#7016bc'], [0.612, '#d81f86'], [0.636, '#ff3a5e'],
  [0.675, '#ff8a1f'], [0.720, '#ff9a22'], [0.762, '#ffbe34'], [0.815, '#ffe14a'], [0.870, '#f8ea44'],
  [0.910, '#cfe92e'], [0.945, '#9be81e'], [0.985, '#6fdd24'], [1.030, '#3fd24a'], [1.090, '#22dcae'], [1.160, '#3cf0e6'],
];
// ── depth below the rim (px) → scalar: plateaus (the bands) joined by short ramps (their borders).
//    wide · narrow · wide · narrow · wide, so the rings have a rhythm ──
const PROFILE = [
  [-8, 0.335], [0, 0.335], [10, 0.350], [26, 0.372], [44, 0.385], [62, 0.400], [76, 0.425],    // the rim (外郭): hot magenta
  [88, 0.5], [112, 0.535], [132, 0.56],                                           // purple — a narrow dark ring
  [143, 0.632], [152, 0.682], [200, 0.7], [246, 0.722],                           // a red-pink contour, then orange (wide)
  [260, 0.818], [298, 0.836], [334, 0.856],                                       // bright yellow
  [350, 0.945], [420, 0.965], [520, 0.99], [800, 1.04],                           // fluorescent green
];
const P0 = -8, PSTEP = 0.5;

// the neon spectral lines: each is an intensity profile pushed through its own little colour scale (dark edge → hot core)
const STRIPE_RAMPS = {
  m: [[0, '#000000'], [0.18, '#2a0648'], [0.42, '#a012b0'], [0.68, '#ff2bd6'], [0.9, '#ff8cec'], [1.1, '#ffd4f8']],
  o: [[0, '#000000'], [0.18, '#3c0626'], [0.4, '#c81a58'], [0.62, '#ff6a22'], [0.82, '#ff9a1f'], [1.0, '#ffd640'], [1.1, '#fff0a0']],
  g: [[0, '#000000'], [0.18, '#06301e'], [0.42, '#3f9a26'], [0.68, '#9be81e'], [0.9, '#d0f230'], [1.1, '#f2ff9a']],
  c: [[0, '#000000'], [0.18, '#052a44'], [0.42, '#0d8ab8'], [0.68, '#22d6f2'], [0.9, '#7ef0ff'], [1.1, '#d8fbff']],
};
const RAMP_IDS = ['m', 'o', 'g', 'c'], TMAX = 1.1, TN = 256;
// [side, distance from the centre line, width at half height, colour scale, peak] — a few broad hot bands and hairlines:
// dense and bright at the two sides, thinning out and dimming toward the middle, nothing above the crest
const STRIPES = [
  [-1, 1012, 120, 'o', 1.0], [-1, 902, 8, 'c', 0.9], [-1, 800, 86, 'm', 1.0], [-1, 700, 9, 'g', 0.95],
  [-1, 628, 50, 'o', 0.9], [-1, 548, 7, 'm', 0.7], [-1, 486, 24, 'g', 0.6], [-1, 408, 6, 'c', 0.36],
  [1, 996, 108, 'g', 1.0], [1, 900, 9, 'm', 0.95], [1, 812, 80, 'o', 1.0], [1, 726, 8, 'c', 0.9],
  [1, 648, 58, 'm', 0.92], [1, 570, 7, 'g', 0.72], [1, 504, 22, 'o', 0.58], [1, 426, 6, 'm', 0.34],
];

function build(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const N = LW * LH;
  const nA = L.makeNoise('s23a'), nB = L.makeNoise('s23b');

  // LUT + profile table + noise table
  const ramp = L.makeRamp(LUT_STOPS.map(([t, c]) => [t / SMAX, c]));
  const LR = new Uint8Array(NL), LG = new Uint8Array(NL), LB = new Uint8Array(NL);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); LR[i] = c[0]; LG[i] = c[1]; LB[i] = c[2]; }
  const pf = L.makeRamp(PROFILE.map(([d, s]) => [(d - P0) / 808, [s * 200, 0, 0, 1]]));
  const PN = Math.round(808 / PSTEP) + 1, Ptab = new Float32Array(PN);
  for (let i = 0; i < PN; i++) Ptab[i] = pf(i / (PN - 1))[0] / 200;
  const rn = L.rng('s23noise');
  const NT = new Float32Array(NMASK + 1);
  for (let i = 0; i <= NMASK; i++) NT[i] = (rn() + rn() + rn() + rn() - 2) * 1.73;   // ≈ unit gaussian

  const D = new Float32Array(N), TH = new Float32Array(N), COV = new Float32Array(N);
  const Deff = new Float32Array(N), CA = new Float32Array(N), CB = new Float32Array(N), BL = new Float32Array(N), FN = new Float32Array(N);
  const HV = new Float32Array(N), GL = new Float32Array(N), CID = new Uint16Array(N);
  const ST = new Float32Array(N), SID = new Uint8Array(N), NA = new Float32Array(N);

  // ── stripes: colour scales as flat tables ──
  const TR = new Uint8Array(4 * TN), TG = new Uint8Array(4 * TN), TB = new Uint8Array(4 * TN);
  RAMP_IDS.forEach((id, q) => {
    const f = L.makeRamp(STRIPE_RAMPS[id].map(([t, c]) => [t / TMAX, c]));
    for (let i = 0; i < TN; i++) { const c = f(i / (TN - 1)); TR[q * TN + i] = c[0]; TG[q * TN + i] = c[1]; TB[q * TN + i] = c[2]; }
  });
  const stripes = STRIPES.map(([side, ax, w, id, peak], n) => ({ x: cx + side * ax, hw: w / 2, q: RAMP_IDS.indexOf(id), peak, n }));

  // ── halo blocks: a coarse screen-aligned grid (one grid line sits 12 px above the crest). The corona is a glow that
  //    has been quantised to the grid: block value falls off with distance from the rim, each block a little off its
  //    neighbours, outer ones missing at random. It stays low over the crest and climbs at the sides and under the
  //    broad spectral lines, so the stair-steps show where the arc is steep and the tagline zone stays quiet. ──
  const colOff = ((Math.round((cx - CELL * Q / 2 + PAD) / Q) % CELL) + CELL) % CELL;
  const rowOff = ((Math.round((a.crestY - 12 + PAD) / Q) % CELL) + CELL) % CELL;
  const CW = Math.ceil(LW / CELL) + 2, CH = Math.ceil(LH / CELL) + 2;
  const cellV = new Float32Array(CW * CH);
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CW; ci++) {
    const xc = -PAD + ((ci - 1) * CELL + colOff + CELL / 2) * Q, yc = -PAD + ((cj - 1) * CELL + rowOff + CELL / 2) * Q;
    const dOut = a.drAt(xc, yc), ax = Math.abs(xc - cx);
    const h1 = hsh(ci * 7 + 3, cj * 13 + 1), h2 = hsh(ci * 11 + 5, cj * 3 + 9);
    const side = sstep(230, 640, ax);
    let sb = 0;
    for (const st of stripes) if (st.hw >= 16) { const q = (xc - st.x) / (st.hw * 1.2); sb = Math.max(sb, st.peak * Math.exp(-0.69 * q * q)); }
    const reach = L.lerp(16, 112, side) + 78 * sb * side;
    let v = 0;
    if (dOut > -CELL * Q * 0.75 && dOut < reach) {
      const uu = L.clamp((dOut + 20) / (reach + 20));
      v = 0.3 * Math.pow(1 - uu, 1.2) * L.lerp(0.66, 1.1, h1) * (1 + 0.18 * sb);
      if (h2 < sstep(0.3, 1, uu) * 0.55) v = 0;
      if (v < 0.04) v = 0;
    }
    cellV[cj * CW + ci] = v;
  }

  // ── per-pixel static fields ──
  for (let j = 0; j < LH; j++) {
    const y = -PAD + (j + 0.5) * Q, ddy = cy - y;
    for (let i = 0; i < LW; i++) {
      const k = j * LW + i, x = -PAD + (i + 0.5) * Q, ddx = x - cx;
      const rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr, th = Math.atan2(ddx, ddy), u = th * R;
      D[k] = d; TH[k] = th;
      const cov = L.clamp(0.5 + d / Q); COV[k] = cov;
      FN[k] = NT[(k * 7 + 12345) & NMASK];
      NA[k] = 0.0145 * L.lerp(0.42, 1, sstep(48, 84, d));          // counting noise: the rim is the strongest signal, so the cleanest
      if (cov > 0) {
        const g = sstep(40, 220, d) * (1 + d / 500);
        const wv = g * (14 * nA.n2(u / 520, d / 700 + 3) + 5 * nA.n2(u / 190 + 9, d / 340))
          + sstep(16, 70, d) * (1 - sstep(70, 160, d)) * 6 * nB.n2(u / 130, 7.7);
        Deff[k] = d + wv;
        const cg = sstep(50, 190, d) * 9;
        CA[k] = cg * nB.n2(u / 240 + 31, d / 240); CB[k] = cg * nB.n2(u / 240 - 17, d / 240 + 55);
        BL[k] = 0.012 * nA.fbm(u / 70 + 5, d / 70, 3) + 0.009 * NT[(j * 131 + 77) & NMASK] * sstep(60, 100, d);   // + line-to-line gain wobble of the raster
      }
      if (cov < 1) {
        const ci = Math.floor((i - colOff) / CELL) + 1, cj = Math.floor((j - rowOff) / CELL) + 1, c = cj * CW + ci;
        HV[k] = cellV[c]; CID[k] = c;
        // the rim's own glow on the dark screen: a smooth violet skirt under the blocks
        GL[k] = 0.07 * Math.exp(Math.min(0, d) / 46) * L.lerp(0.5, 1, sstep(230, 640, Math.abs(ddx)));
        // the strongest spectral line at this pixel: soft-edged, a touch wavy, the broad ones swelling and thinning
        // along their length, their strength wandering slowly
        const xw = x + 4 * nB.n2(x / 340, y / 250);
        let best = 0, bq = 0;
        for (const st of stripes) {
          const hw = st.hw >= 16 ? st.hw * (1 + 0.24 * nB.n2(st.n * 5.7 + 0.3, y / 430 + st.n * 1.9)) : Math.max(st.hw, Q * 0.5);
          const dx = Math.abs(xw - st.x); if (dx > hw * 5 + 30) continue;
          const qq = dx / (hw + 1.5);
          const m = L.clamp(0.84 + 0.4 * nB.fbm(st.n * 7.31, y / 560 + st.n * 3.1, 2), 0.45, 1.1);
          const v = st.peak * m * (Math.exp(-0.69 * qq * qq) + 0.1 * Math.exp(-qq / 2.2));
          if (v > best) { best = v; bq = st.n; }
        }
        ST[k] = best * L.lerp(0.74, 1, sstep(-PAD, 300, y)) * (1 - cov); SID[k] = bq;
      }
    }
  }

  // ── corrosion: islands of higher / lower signal, slightly stretched along the bands, ragged outline ──
  const blobs = [
    // theta, depth, along, across, amplitude
    [-0.215, 30, 96, 26, -0.12], [0.335, 34, 70, 22, -0.09], [0.07, 40, 60, 16, -0.05],
    [-0.07, 110, 124, 22, 0.13], [0.26, 108, 84, 20, 0.15], [0.085, 104, 80, 14, -0.09], [-0.31, 112, 76, 20, 0.11],
    [0.13, 204, 176, 32, 0.11], [-0.23, 200, 136, 30, -0.13], [-0.02, 214, 76, 18, -0.09],
    [-0.10, 300, 196, 32, 0.1], [0.2, 296, 124, 28, -0.11],
    [0.03, 468, 176, 40, 0.1], [-0.16, 420, 112, 28, -0.1], [0.14, 400, 92, 24, -0.08],
  ];
  const rb = L.rng('s23blobs');
  for (let n = 0; n < 8; n++) blobs.push([rb.range(-0.44, 0.44), rb.range(96, 520), rb.range(40, 88), rb.range(13, 24), rb.range(0.07, 0.13) * rb.sign()]);
  for (let n = 0; n < 34; n++) blobs.push([rb.range(-0.45, 0.45), rb.range(100, 560), rb.range(9, 20), rb.range(6, 11), rb.range(0.09, 0.2) * (rb.chance(0.75) ? 1 : -1)]);   // segregation specks
  for (const [th0, d0, ru, rv, amp] of blobs) {
    const p = a.pt(th0, -d0), e = Math.max(ru, rv) * 1.5 + Q;
    const i0 = Math.max(0, Math.floor((p.x - e + PAD) / Q)), i1 = Math.min(LW - 1, Math.ceil((p.x + e + PAD) / Q));
    const j0 = Math.max(0, Math.floor((p.y - e + PAD) / Q)), j1 = Math.min(LH - 1, Math.ceil((p.y + e + PAD) / Q));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * LW + i; if (COV[k] <= 0) continue;
      const du = (TH[k] - th0) * (R - d0), dv = D[k] - d0;
      const wob = 1 + 0.3 * nA.n2(du / (ru * 0.6) + th0 * 91, dv / (rv * 0.8) + d0);
      const q2 = ((du * du) / (ru * ru) + (dv * dv) / (rv * rv)) * wob * wob;
      if (q2 >= 1) continue;
      BL[k] += amp * (1 - q2) * (1 - q2) * sstep(-2, 14, D[k]);
    }
  }

  // output buffers
  const small = L.makeCanvas(LW, LH), sg = small.getContext('2d');
  const img = sg.createImageData(LW, LH), px = new Uint32Array(img.data.buffer);
  const half = L.makeCanvas(LW / 2, LH / 2), quart = L.makeCanvas(LW / 4, LH / 4);
  const soft = L.makeCanvas(MW / 2, MH / 2), far = L.makeCanvas(MW / 2, MH / 2), bloom = L.makeCanvas(MW / 8, MH / 8);
  // depth-of-field masks (in layer space): sharp around the crest, soft toward the sides and the bottom, softer still in the corners
  const mkMask = (lo, hi) => {
    const m = L.makeCanvas(MW / 4, MH / 4), mg = m.getContext('2d'), mi = mg.createImageData(m.width, m.height);
    for (let j = 0; j < m.height; j++) for (let i = 0; i < m.width; i++) {
      const x = -PAD + (i + 0.5) * 8, y = -PAD + (j + 0.5) * 8;
      const ex = (x - cx) / 1080, ey = y > a.crestY ? (y - a.crestY) / 640 : (a.crestY - y) / 1000;
      mi.data[(j * m.width + i) * 4 + 3] = 255 * sstep(lo, hi, Math.sqrt(ex * ex + ey * ey));
    }
    mg.putImageData(mi, 0, 0);
    return m;
  };
  const mask1 = mkMask(0.4, 0.9), mask2 = mkMask(0.72, 1.22);
  const cellM = new Float32Array(CW * CH), stripeM = new Float32Array(stripes.length), stripeQ = stripes.map((st) => st.q * TN);
  const mid = L.makeCanvas(MW, MH);
  // a light vignette, baked in layer space
  const vig = L.makeCanvas(MW / 4, MH / 4), vg = vig.getContext('2d');
  vg.fillStyle = L.radial(vg, vig.width / 2, vig.height / 2, vig.height * 0.62, vig.width * 0.62, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.26)']]);
  vg.fillRect(0, 0, vig.width, vig.height);
  return { N, Deff, CA, CB, BL, FN, NA, half, quart, far, mid, vig, stripeM, stripeQ, COV, HV, GL, CID, ST, SID, TR, TG, TB, Ptab, PN, LR, LG, LB, NT, small, sg, img, px, soft, bloom, mask1, mask2, cellM, CW, CH };
}

/** evaluate the field for this frame and write the scan-resolution picture into S.small */
function paint(p, f) {
  const { N, Deff, CA, CB, BL, FN, NA, COV, HV, GL, CID, ST, SID, TR, TG, TB, Ptab, PN, LR, LG, LB, NT, px, cellM, stripeM, stripeQ } = S;
  const ph = p * L.TAU * 0.7, ca = Math.cos(ph), cb = Math.sin(ph);
  const off = (f * 40503 + 977) & NMASK;
  for (let c = 0; c < cellM.length; c++) cellM[c] = 0.86 + 0.3 * Math.sin(hsh(c, 5) * L.TAU + p * L.TAU * (0.6 + hsh(c, 9)));
  for (let q = 0; q < stripeM.length; q++) stripeM[q] = 1 + 0.07 * Math.sin(hsh(q, 21) * L.TAU + p * L.TAU * (0.5 + hsh(q, 33)));
  const K = (NL - 1) / SMAX, KT = (TN - 1) / TMAX;
  for (let k = 0; k < N; k++) {
    const cov = COV[k];
    const n = FN[k] * 0.6 + NT[(k + off) & NMASK] * 0.55;
    let s;
    if (cov >= 1) {
      let di = ((Deff[k] + ca * CA[k] + cb * CB[k] - P0) * 2) | 0; if (di < 0) di = 0; else if (di >= PN) di = PN - 1;
      s = Ptab[di] + BL[k] + NA[k] * n;
    } else {
      const hv = HV[k];
      const so = (hv > 0 ? hv * cellM[CID[k]] + 0.014 * n : 0.011 * n) + GL[k];
      if (cov > 0) {
        let di = ((Deff[k] + ca * CA[k] + cb * CB[k] - P0) * 2) | 0; if (di < 0) di = 0; else if (di >= PN) di = PN - 1;
        s = so + (Ptab[di] + BL[k] + NA[k] * n - so) * cov;
      } else s = so;
    }
    let li = (s * K) | 0; if (li < 0) li = 0; else if (li >= NL) li = NL - 1;
    let r = LR[li], g = LG[li], b = LB[li];
    const t = ST[k];
    if (t > 0.02) {
      const q = SID[k];
      let ti = ((t * (stripeM[q] + 0.1 * n) + 0.012 * n) * KT) | 0; if (ti < 0) ti = 0; else if (ti >= TN) ti = TN - 1;
      ti += stripeQ[q];
      r += TR[ti]; g += TG[ti]; b += TB[ti];
      if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
    }
    px[k] = 0xff000000 | (b << 16) | (g << 8) | r;
  }
  S.sg.putImageData(S.img, 0, 0);
}

const copyInto = (dst, src, filter) => {
  const g = dst.getContext('2d');
  g.globalCompositeOperation = 'copy'; g.imageSmoothingEnabled = true; g.filter = filter || 'none';
  g.drawImage(src, 0, 0, dst.width, dst.height);
  g.filter = 'none';
  return g;
};

export default {
  name: '成分扫描伪彩图',
  tone: 'light',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    const a = env.arc;
    const f = Math.round(p * (env.frames - 1));
    paint(p, f);
    // two out-of-focus copies (masked) and the bloom source, all made by shrinking the scan-resolution picture
    copyInto(S.half, S.small);
    copyInto(S.quart, S.half, 'blur(0.6px)');
    let g = copyInto(S.soft, S.half);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(S.mask1, 0, 0, S.soft.width, S.soft.height);
    g = copyInto(S.far, S.quart);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(S.mask2, 0, 0, S.far.width, S.far.height);
    copyInto(S.bloom, S.half, 'contrast(1.8) brightness(0.82) blur(2.4px)');

    // compose at half resolution: hard scan pixels, the out-of-focus copies over them, bloom, vignette
    const mg = S.mid.getContext('2d');
    mg.globalAlpha = 1; mg.globalCompositeOperation = 'copy'; mg.imageSmoothingEnabled = false;
    mg.drawImage(S.small, 0, 0, MW, MH);
    mg.globalCompositeOperation = 'source-over'; mg.imageSmoothingEnabled = true;
    mg.drawImage(S.soft, 0, 0, MW, MH);
    mg.drawImage(S.far, 0, 0, MW, MH);
    mg.globalCompositeOperation = 'screen'; mg.globalAlpha = 0.36;
    mg.drawImage(S.bloom, 0, 0, MW, MH);
    mg.globalCompositeOperation = 'source-over'; mg.globalAlpha = 1;
    mg.drawImage(S.vig, 0, 0, MW, MH);

    // one blit to the frame: the picture slides a little round the coin's centre (the rim itself stays on the arc);
    // the 2× enlargement softens the pixel edges just enough to read as a photographed screen
    ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.006, 0.006, p);
    ctx.save();
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(S.mid, -PAD, -PAD, W + PAD * 2, H + PAD * 2);
    ctx.restore();

    // the scan line: travels down the coin's face (it starts below the tagline); whatever it has just passed is a little hotter
    const ys = Math.round(L.lerp(a.crestY + 76, H - 26, p) / Q) * Q;
    ctx.save();
    ctx.globalCompositeOperation = 'color-dodge';
    ctx.fillStyle = L.linear(ctx, 0, ys - 60, 0, ys + 4, [[0, '#000000'], [0.7, '#141414'], [0.9, '#4c4c4c'], [0.96, '#5a5a5a'], [1, '#000000']]);
    ctx.fillRect(0, ys - 60, W, 64);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = L.linear(ctx, 0, ys - 10, 0, ys + 6, [[0, 'rgba(255,170,240,0)'], [0.55, 'rgba(255,190,244,0.2)'], [0.7, 'rgba(255,214,248,0.2)'], [1, 'rgba(255,170,240,0)']]);
    ctx.fillRect(0, ys - 10, W, 16);
    ctx.restore();
  },
};
