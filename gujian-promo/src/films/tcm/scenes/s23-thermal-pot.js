// s23 — 红外热像. A simmering clay decoction pot seen from above through a thermal camera: pure false colour.
// The arc is the outer edge of the scalding rim — the hottest ring in the frame, bright yellow burning out to near white.
// Below it: nested isotherm bands (yellow → orange → magenta → purple → back to yellow where the liquid simmers).
// Above it: cold deep indigo, with columns of hot steam standing on the rim, magenta and orange, fading as they climb.
//
// Nothing here is painted as colour. Every frame we compute ONE scalar "temperature" field on a low-resolution
// sensor grid (3 px bolometer pixels), degrade it the way a cheap thermal camera's video does (macroblocks that
// flatten the field, column fixed-pattern noise, shot noise), and only then look the temperature up in a false-colour
// palette. Because the palette is steep between its plateaus, the noise breaks the isotherms into soft blocky steps.
// The grid is then scaled up with smoothing, defocus and bloom → no vector lines anywhere.
//
// What keeps it from looking computed: nothing repeats. The rim is not a uniform tube but a chain of unequal hot
// beads (wider and whiter where the pot boils hardest, thin and amber between); every steam column has its own
// width, height, heat and bulb at the root, with cold indigo standing between them; the green isotherm only glows
// in the crooks where a column meets the rim.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const SC = 3;                                   // one sensor pixel = 3 × 3 frame pixels
const SW = Math.ceil(W / SC), SH = Math.ceil(H / SC), N = SW * SH;
const MB = 5;                                   // macroblock = 5 × 5 sensor pixels (15 px on screen)
const BW = Math.ceil(SW / MB), BH = Math.ceil(SH / MB);
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ── false-colour palette, cold → hot (task sheet): 深靛紫 #1a0b4a · 洋红 #ff2bd6 · 橙 #ff8a1f · 明黄 #ffe14a → near white.
// The fluorescent green #3ddc84 is used the way thermal cameras mark one isotherm: a contour low on the scale.
const RAMP = [
  [0.00, '#0a0326'], [0.06, '#130640'], [0.11, '#1a0b4a'], [0.165, '#2a1186'], [0.19, '#3518a8'],
  [0.206, '#2fa98c'], [0.221, '#3ddc84'], [0.238, '#3a86b8'],
  [0.26, '#5a16c0'], [0.33, '#8a1ee0'], [0.41, '#cf25e0'],
  [0.47, '#ff2bd6'], [0.55, '#ff2fb0'], [0.63, '#ff4a5e'],
  [0.70, '#ff7a26'], [0.755, '#ff8a1f'], [0.81, '#ffb22c'],
  [0.87, '#ffe14a'], [0.93, '#ffec7c'], [1.00, '#fffbe6'],
];
const NLUT = 2048;
const G_LO = 0.19, G_HI = 0.26;                  // the stretch of the scale that carries the green isotherm
const RAMP_PLAIN = RAMP.filter(([t]) => t <= G_LO || t >= G_HI);

// ── radial temperature profile of the pot, by depth d (px) inside the rim edge (d < 0 is outside, in the cold air):
// a soft glow outside → the rim (hottest) → the pot wall cooling inward → the simmering liquid, hot again → a cooler
// convection ring further in. The half-way point of the outer fall-off sits exactly on the arc.
const PROFILE = [
  [-60, 0], [-27, 0], [-20, 0.10], [-15, 0.19], [-10, 0.27], [-6, 0.40], [-3, 0.56], [0, 0.73], [3, 0.89], [8, 0.975], [15, 1.0],
  [26, 0.97], [40, 0.885], [58, 0.76], [80, 0.60],
  [102, 0.47], [126, 0.37], [152, 0.33], [180, 0.37], [202, 0.48], [224, 0.64], [248, 0.78], [278, 0.87], [320, 0.90],
  [358, 0.84], [394, 0.70], [426, 0.54], [454, 0.44], [484, 0.40], [516, 0.48], [548, 0.66], [582, 0.82], [640, 0.9], [1100, 0.92],
];
const P0 = -60, PSTEP = 0.5;

// ── the steam columns: [x at the root, half-width, height, heat, lean (px per px of height)] — hand-placed so that
// widths, gaps and heights are all different (some pairs merge, some stand apart with cold air between) and the
// caption zone above the crest (x 630…1290) only carries three barely-warm ones. Heights over ~750 leave the frame.
const PLUMES = [
  [-24, 54, 1300, 0.74, 0.004], [150, 20, 500, 0.54, -0.010], [262, 68, 1400, 1.0, 0.003],
  [452, 36, 1300, 0.80, -0.004], [556, 14, 350, 0.47, 0.006],
  [744, 30, 1300, 0.085, 0.0], [918, 54, 1300, 0.07, 0.0], [1112, 24, 1300, 0.08, 0.0],
  [1346, 16, 430, 0.50, -0.008], [1436, 46, 1350, 0.92, 0.004], [1574, 18, 640, 0.56, -0.010],
  [1700, 76, 1400, 0.72, -0.002], [1936, 50, 1000, 0.98, -0.004],
];
const FEXT = 2.0;                               // a column's cross-section reaches this many half-widths from its axis

function buildLut(ramp) {
  const f = L.makeRamp(ramp), lut = new Uint32Array(NLUT);
  for (let i = 0; i < NLUT; i++) { const c = f(i / (NLUT - 1)); lut[i] = (255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]); }
  return lut;
}

function buildProfile() {
  const n = Math.round((PROFILE[PROFILE.length - 1][0] - P0) / PSTEP) + 1, raw = new Float32Array(n), out = new Float32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = P0 + i * PSTEP;
    while (s < PROFILE.length - 2 && d > PROFILE[s + 1][0]) s++;
    const [d0, t0] = PROFILE[s], [d1, t1] = PROFILE[s + 1];
    raw[i] = L.lerp(t0, t1, L.clamp((d - d0) / (d1 - d0)));
  }
  // round the corners of the polyline; hardly at all across the rim edge itself (it has to stay on the arc)
  for (let i = 0; i < n; i++) {
    const d = P0 + i * PSTEP, rad = Math.round((2 + 12 * sstep(20, 90, d)) / PSTEP);
    let a = 0, c = 0;
    for (let k = -rad; k <= rad; k++) { const q = i + k; if (q < 0 || q >= n) continue; a += raw[q]; c++; }
    out[i] = a / c;
  }
  return out;
}

/** the rim as a chain of unequal hot beads: bead strength 0…1 by arc length u (px from the crest) */
function buildBeads(R) {
  const UM = Math.ceil(R * Math.asin(Math.min(1, (W / 2 + 200) / R))) + 8, n = 2 * UM + 1;
  const raw = new Float32Array(n), BD = new Float32Array(n), br = L.rng('s23bead');
  let u = -UM - 90;
  while (u < UM + 90) {
    const hw = br.range(30, 90), amp = br.chance(0.24) ? br.range(0.22, 0.5) : br.range(0.6, 1), uc = u + hw;
    const x0 = Math.max(-UM, Math.ceil(uc - hw)), x1 = Math.min(UM, Math.floor(uc + hw));
    for (let x = x0; x <= x1; x++) { const s = Math.abs((x - uc) / hw), b = amp * Math.sqrt(1 - s * s * s); if (b > raw[x + UM]) raw[x + UM] = b; }
    u = uc + hw * br.range(0.66, 1.0) + (br.chance(0.22) ? br.range(24, 100) : 0);   // mostly touching; now and then a bare stretch of rim
  }
  for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -5; k <= 5; k++) { const q = i + k; if (q < 0 || q >= n) continue; a += raw[q]; c++; } BD[i] = a / c; }
  return { BD, UM };
}

function build(env) {
  const a = env.arc, R = a.R;
  const DR = new Float32Array(N);         // signed distance from the arc (> 0 outside / above)
  const RS = new Float32Array(N);         // rim: depth scale (< 1 under a bead → the hot rim reaches deeper, its glow further out)
  const WSC = new Float32Array(N);        // below: how wide the bands run at this bearing
  const WOB = new Float32Array(N);        // below: wobble of the isotherms (px of depth)
  const TN = new Float32Array(N);         // below: slow blotches of temperature (+ cooler necks between the rim's beads)
  const BG = new Float32Array(N);         // above: the cold air
  const BN = new Float32Array(N);         // sensor: column fixed-pattern noise + a faint value per macroblock
  const FN = new Float32Array(N * 2);     // sensor: shot noise, re-indexed every frame
  const KM = new Float32Array(N);         // how strongly the macroblocks flatten the field here (less across the rim edge)
  const GA = new Float32Array(N);         // how strongly the green isotherm may show: only low over the rim, in patches
  const nA = L.makeNoise('s23a'), nB = L.makeNoise('s23b'), r = L.rng('s23');
  const { BD, UM } = buildBeads(R);
  let upRows = 0;
  const blk = new Float32Array(BW * BH * 2);
  for (let i = 0; i < blk.length; i++) blk[i] = r();
  const col = new Float32Array(SW);
  for (let i = 0; i < SW; i++) col[i] = r.gauss() * 0.5 + (r.chance(0.06) ? r.range(-1.7, 1.7) : 0);
  RS.fill(1);
  for (let j = 0; j < SH; j++) {
    const y = (j + 0.5) * SC, ddy = a.cy - y;
    for (let i = 0; i < SW; i++) {
      const k = j * SW + i, x = (i + 0.5) * SC, ddx = x - a.cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      const dr = rr - R; DR[k] = dr;
      if (dr > -16 && j + 1 > upRows) upRows = j + 1;
      if (dr < 32) {
        const u = Math.atan2(ddx, ddy) * R, d = -dr;
        const B = BD[L.clamp(Math.round(u) + UM, 0, 2 * UM)];
        const stretch = sstep(-0.35, 0.45, nA.fbm(u / 420 - 17, 2.2, 2));     // long stretches where the rim runs cooler
        RS[k] = 1 - 0.42 * B * (1 - sstep(36, 130, d));
        WSC[k] = 1 + 0.24 * nA.fbm(u / 700 + 3.1, 0.7, 2) + 0.08 * nA.n2(u / 190, 5.5);
        WOB[k] = 30 * nA.fbm(u / 520, d / 260 + 9, 2) + 5 * nB.n2(u / 150, d / 90);
        const liquid = sstep(190, 260, d);
        TN[k] = (0.03 + 0.02 * liquid) * nB.fbm(u / (320 - 120 * liquid) + 40, d / (130 - 30 * liquid) - 7, 2) * sstep(34, 90, d)
          - (0.03 + 0.105 * stretch) * (1 - B) * sstep(2, 10, d) * (1 - sstep(30, 66, d));
      }
      if (dr > -16) {
        // cold air: darkest high up, a breath warmer toward the pot, plus slow shapeless variation
        BG[k] = 0.105 - 0.04 * sstep(40, 620, dr) + 0.016 * nB.fbm(x / 520, y / 420, 2) + 0.035 * Math.exp(-Math.max(0, dr) / 46);
      }
      BN[k] = 0.012 * (blk[(j / MB | 0) * BW + (i / MB | 0)] * 2 - 1) + 0.007 * col[i];
      KM[k] = 0.14 + 0.24 * sstep(8, 30, Math.abs(dr + 4));
      GA[k] = (1 - sstep(24, 230, dr)) * (0.3 + 0.7 * sstep(-0.4, 0.25, nA.n2(x / 300 + 7, y / 500 + 1.7)));
    }
  }
  for (let i = 0; i < FN.length; i++) FN[i] = r.range(-1, 1);
  // striation texture for the steam: long vertical streaks, taller than the grid so it can scroll upward
  const NSH = SH + 48, NS = new Float32Array(SW * NSH);
  for (let j = 0; j < NSH; j++) for (let i = 0; i < SW; i++) {
    const x = i * SC, y = j * SC;
    NS[j * SW + i] = 0.7 * nA.n2(x / 34 + 0.2 * nB.n2(x / 90, y / 260), y / 520 + 11) + 0.3 * nB.n2(x / 13, y / 300 - 4);
  }
  // cross-section of a column: a flat-topped core with soft shoulders, standing in a low wide skirt of warmed air
  const FTN = 512, FT = new Float32Array(FTN + 1);
  for (let i = 0; i <= FTN; i++) { const s = (i / FTN) * FEXT; FT[i] = 0.84 * (1 - sstep(0.35, 1.2, s)) + 0.16 * (1 - sstep(0.5, FEXT, s)); }

  const pr = L.rng('s23plume');
  const plumes = PLUMES.map(([x, w, h, heat, lean], i) => {
    const faint = heat < 0.2;
    return { x, w, h, heat, lean, yRoot: a.yAt(x), faint, seed: i * 7.31 + 2,
      sw: pr.range(4, 10) * (faint ? 0.4 : 1), kf: L.TAU / pr.range(300, 480), ph: pr.range(0, L.TAU),
      taper: pr.range(-0.2, 0.1), kp: L.TAU / pr.range(170, 290), rootLen: L.clamp(h * 0.075, 26, 84), drift: pr.range(8, 18),
      bulb: faint ? 0 : pr.range(0.3, 0.7), bulbLen: pr.range(26, 54) };
  });

  // softer toward the corners: sharpest around the crest of the rim (static alpha mask at sensor resolution)
  const mask = L.makeCanvas(SW, SH), mg = mask.getContext('2d');
  mg.save(); mg.translate(a.cx / SC, (a.crestY + 30) / SC); mg.scale(1, 0.72);
  mg.fillStyle = L.radial(mg, 0, 0, 300 / SC, 1180 / SC, [[0, 'rgba(0,0,0,0.42)'], [0.5, 'rgba(0,0,0,0.72)'], [1, 'rgba(0,0,0,0.98)']]);
  mg.fillRect(-SW * 2, -SH * 3, SW * 4, SH * 6); mg.restore();

  const sensor = L.makeCanvas(SW, SH), sg = sensor.getContext('2d');
  const img = sg.createImageData(SW, SH);
  const bloom = L.makeCanvas(SW, SH), soft = L.makeCanvas(SW, SH);
  return { DR, RS, WSC, WOB, TN, BG, BN, FN, KM, GA, NS, FT, FTN, plumes, upRows, nA, blk,
    PL: new Float32Array(N), TF: new Float32Array(N), bs: new Float32Array(BW * BH), bc: new Float32Array(BW * BH),
    prof: buildProfile(), lut: buildLut(RAMP), lutP: buildLut(RAMP_PLAIN), mask,
    sensor, sg, img, px: new Uint32Array(img.data.buffer), bloom, bg: bloom.getContext('2d'), soft, fg: soft.getContext('2d') };
}

/** compute the temperature field for progress p and write it, false-coloured, into the sensor canvas */
function expose(env, p) {
  const { DR, RS, WSC, WOB, TN, BG, BN, FN, KM, GA, NS, FT, FTN, plumes, upRows, nA, blk, PL, TF, bs, bc, prof, lut, lutP, px } = S;
  const t = p * (env.dur || env.frames / 25);        // seconds into the shot
  const rise = 150 * t;                               // the steam climbs ~150 px/s
  const fi = Math.round(p * Math.max(1, env.frames - 1));

  // 1) steam columns → PL (heat each one adds to the cold air; skirts of neighbours add up)
  PL.fill(0, 0, upRows * SW);
  for (const q of plumes) {
    const j1 = Math.min(upRows, Math.ceil((q.yRoot + 70) / SC));
    for (let j = 0; j < j1; j++) {
      const y = (j + 0.5) * SC, h0 = q.yRoot - y;
      if (h0 > q.h) continue;
      const hc = h0 < 0 ? 0 : h0, hn = hc / q.h;
      const xc = q.x + q.lean * hc + q.sw * sstep(0, 170, hc) * Math.sin(hc * q.kf - q.ph - 4.2 * t)
        + q.drift * sstep(40, 420, hc) * nA.n2((hc - rise * 0.6) / 460, q.seed);
      // the column thins to a rounded tip as it cools away (most of the tall ones leave the frame first)
      const cu = hn <= 0.6 ? 0 : (hn - 0.6) / 0.4, dome = cu >= 1 ? 0 : Math.sqrt(1 - cu * cu);
      const w0 = q.w * (1 + q.taper * hn) * (1 + 0.10 * Math.sin(hc * 0.0115 + q.ph * 3 - 1.6 * t))
        * (1 + q.bulb * Math.exp(-hc / q.bulbLen));                   // it swells into a bulb where it sits on the rim
      const w = w0 * (0.35 + 0.65 * dome);
      const puff = 1 + 0.12 * Math.sin((hc - rise) * q.kp + q.ph * 5);
      // it cools as it climbs
      const plat = 0.66 * (1 - 0.42 * sstep(0, 900, hc)) * (1 - sstep(0.4, 1.0, hn)) * puff;
      const rootK = q.faint ? 0 : 0.38, rl = 1 / q.rootLen;
      const ext = FEXT * w;
      const i0 = Math.max(0, Math.floor((xc - ext) / SC)), i1 = Math.min(SW - 1, Math.ceil((xc + ext) / SC));
      const inv = FTN / ext;
      for (let i = i0; i <= i1; i++) {
        const k = j * SW + i, dr = DR[k];
        if (dr < -14) continue;
        let dx = (i + 0.5) * SC - xc; if (dx < 0) dx = -dx;
        const s = dx * inv;
        if (s < FTN) PL[k] += q.heat * FT[s | 0] * (plat + rootK * Math.exp(-(dr > 0 ? dr : 0) * rl));
      }
    }
  }

  // 2) compose the clean field
  const sh = 10 * p;                                  // the isotherms creep outward
  const so = rise / SC, sj = Math.floor(so), sf = so - sj;
  bs.fill(0); bc.fill(0);
  for (let j = 0, k = 0; j < SH; j++) {
    const bj = (j / MB | 0) * BW;
    for (let i = 0; i < SW; i++, k++) {
      const dr = DR[k];
      let T = 0;
      if (dr < 30) {
        const d = -dr;
        let de = d * RS[k];
        if (d > 14) { const m = sstep(14, 84, d); de = (de + sh * m) * (1 + (WSC[k] - 1) * m) + WOB[k] * m; }
        let q = (de - P0) / PSTEP; if (q < 0) q = 0; const qi = q | 0; q -= qi;
        T = prof[qi] + (prof[qi + 1] - prof[qi]) * q + TN[k];
      }
      if (dr > -14) {
        const ns = NS[k + sj * SW] * (1 - sf) + NS[k + (sj + 1) * SW] * sf;
        let Tu = BG[k] + PL[k] * (1 + 0.16 * ns);
        if (Tu > 0.74) Tu = 0.74 + (Tu - 0.74) * 0.25;   // steam never gets as hot as the rim it stands on: the rim stays the brightest line
        Tu *= sstep(-12, 2, dr);
        if (Tu > T) T = Tu;
      }
      TF[k] = T;
      const b = bj + (i / MB | 0); bs[b] += T; bc[b]++;
    }
  }
  for (let b = 0; b < bs.length; b++) bs[b] /= bc[b] || 1;

  // 3) the camera: macroblocks pull every pixel toward its block's mean, then noise, then the palette
  const fo = (fi * 7919) % N, bo = (fi * 131) % (BW * BH);
  const GI0 = (G_LO * (NLUT - 1)) | 0, GI1 = Math.ceil(G_HI * (NLUT - 1));
  for (let j = 0, k = 0; j < SH; j++) {
    const bj = (j / MB | 0) * BW;
    for (let i = 0; i < SW; i++, k++) {
      const b = bj + (i / MB | 0);
      let T = TF[k];
      T += (bs[b] - T) * KM[k] * (0.55 + 0.9 * blk[b + bo]);
      T += BN[k] + FN[k + fo] * (0.004 + 0.007 * sstep(0.24, 0.5, T));
      let li = (T * (NLUT - 1)) | 0; if (li < 0) li = 0; else if (li >= NLUT) li = NLUT - 1;
      if (li > GI0 && li < GI1) {
        // the green isotherm only glows where a column's warm skirt meets the rim: blend the two palettes
        const g = GA[k] * sstep(0.075, 0.13, PL[k]), ca = lut[li], cb = lutP[li];
        const r0 = (cb & 255) + ((ca & 255) - (cb & 255)) * g, g0 = ((cb >> 8) & 255) + (((ca >> 8) & 255) - ((cb >> 8) & 255)) * g,
          b0 = ((cb >> 16) & 255) + (((ca >> 16) & 255) - ((cb >> 16) & 255)) * g;
        px[k] = (255 << 24) | (b0 << 16) | (g0 << 8) | r0;
      } else px[k] = lut[li];
    }
  }
  S.sg.putImageData(S.img, 0, 0);
}

export default {
  name: '红外热像',
  tone: 'light',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    expose(env, p);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.sensor, 0, 0, SW, SH, 0, 0, W, H);
    // softer corners (a cheap germanium lens is only sharp in the middle)
    const f = S.fg;
    f.globalCompositeOperation = 'copy'; f.filter = 'blur(2.6px)'; f.drawImage(S.sensor, 0, 0); f.filter = 'none';
    f.globalCompositeOperation = 'destination-in'; f.drawImage(S.mask, 0, 0);
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(S.soft, 0, 0, SW, SH, 0, 0, W, H);
    // bloom: the hot parts bleed a little into their surroundings, as on a small uncooled sensor
    const b = S.bg;
    b.filter = 'blur(5px)'; b.drawImage(S.sensor, 0, 0); b.filter = 'none';
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.22;
    ctx.drawImage(S.bloom, 0, 0, SW, SH, 0, 0, W, H);
    ctx.restore();
  },
};
