// s21 — 丝路驼队剪影. Just after sunset in the desert, shot long and against the light.
// The arc is the crest line of one big dune. Above it nothing but the afterglow: 炽橙 low on the left where the sun went
// down behind the crest → 胭脂 → 凝夜紫 → black in the upper right. Below it the dune is 剪影黑, only its wind ripples
// faintly picked out by the violet sky. The crest itself is a little ragged (sand lumps, the hoof prints of the caravan),
// carries a thread of back-light and trails a line of blown sand that glows where it crosses the bright part of the sky.
// On the left a string of four loaded Bactrian camels, roped nose to pack, follows a camel puller up the crest.
//
// Recipe: sky, dune and blown sand are shaded per pixel once in init (polar coordinates of the arc: u = px along the
// crest, v = px above it). Each frame the dune slides a few px along the arc, the dust drifts a little faster, the caravan
// is redrawn as live silhouettes (the legs really take a quarter of a stride), and a veil of lens glare is screened on top.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 64;                 // the plates only ever slide ~25 px along the arc
const PXM = 38.5;               // caravan scale: px per metre
const INK = '#0a0507';          // 剪影黑
const GLOW = { x: 280, below: 56, stretch: 1.45 };   // where the sun went down: just behind the crest, left of frame
// afterglow, by (stretched) distance from the glow centre in px. 落日橙 #f2601c @160, 胭脂 #9d2933 @540, 凝夜紫 #422256 @960
const SKY = [[0, '#ffab4d'], [70, '#fb7e2a'], [160, '#f2601c'], [250, '#e24a1e'], [340, '#cc3826'], [440, '#b42c2e'], [540, '#9d2933'],
  [650, '#7e2546'], [760, '#612355'], [870, '#4a2258'], [960, '#422256'], [1080, '#2e1842'], [1200, '#1c0f2b'], [1350, '#0f0818'], [1500, '#0a0507']];
const DMAX = 1500;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** how strongly the back-light reaches a point of the crest, by screen x: full on the left, gone on the right */
const sunK = (x) => (x < 520 ? 1 : x < 960 ? L.lerp(1, 0.75, (x - 520) / 440) : x < 1350 ? L.lerp(0.75, 0.4, (x - 960) / 390) : x < 1650 ? L.lerp(0.4, 0.12, (x - 1350) / 300) : x < 1900 ? L.lerp(0.12, 0.03, (x - 1650) / 250) : 0.03);

// ───────────────────────── caravan geometry (metres; +x = direction of travel, +y = up, ground at 0) ─────────────────────────
/** closed Catmull-Rom loop through pts → dense polygon */
function loop(pts, sub = 5) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let j = 0; j < sub; j++) {
      const t = j / sub, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
/** tapered capsule between two joints */
function capsule(x0, y0, r0, x1, y1, r1) {
  const a = Math.atan2(y1 - y0, x1 - x0), out = [];
  for (let i = 0; i <= 6; i++) { const t = a + Math.PI / 2 + (Math.PI * i) / 6; out.push([x0 + Math.cos(t) * r0, y0 + Math.sin(t) * r0]); }
  for (let i = 0; i <= 6; i++) { const t = a - Math.PI / 2 + (Math.PI * i) / 6; out.push([x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1]); }
  return out;
}
/** a little disc: the knobby joints of a camel's leg */
function knob(x, y, r) {
  const out = [];
  for (let i = 0; i < 14; i++) { const t = (TAU * i) / 14; out.push([x + Math.cos(t) * r, y + Math.sin(t) * r]); }
  return out;
}
function leg(P, front, ph, dx) {
  const a = 0.33 * Math.sin(ph), lift = Math.max(0, Math.cos(ph));
  let J, K, F, r0, r1, r2, rk;
  if (front) {
    J = [0.73 + dx, 1.24]; r0 = 0.122; r1 = 0.054; r2 = 0.045; rk = 0.061;
    const t1 = a + 0.20 * lift, t2 = t1 - 0.55 * lift;
    K = [J[0] + 0.58 * Math.sin(t1), J[1] - 0.58 * Math.cos(t1)];
    F = [K[0] + 0.56 * Math.sin(t2), K[1] - 0.56 * Math.cos(t2)];
  } else {
    J = [-0.80 + dx, 1.32]; r0 = 0.195; r1 = 0.058; r2 = 0.045; rk = 0.064;
    const t1 = -0.34 + a * 0.8 + 0.22 * lift, t2 = 0.12 + a * 1.05 - 0.5 * lift;
    K = [J[0] + 0.68 * Math.sin(t1), J[1] - 0.68 * Math.cos(t1)];
    F = [K[0] + 0.60 * Math.sin(t2), K[1] - 0.60 * Math.cos(t2)];
  }
  if (lift < 0.02 || F[1] < 0.10) F[1] = 0.10;
  // long forearm / gaskin tapering fast to a slim cannon, a knobby knee or hock between them
  const mx = J[0] + (K[0] - J[0]) * 0.42, my = J[1] + (K[1] - J[1]) * 0.42;
  P.push(capsule(J[0], J[1], r0, mx, my, r0 * 0.5 + r1 * 0.5));
  P.push(capsule(mx, my, r0 * 0.5 + r1 * 0.5, K[0], K[1], r1));
  P.push(knob(K[0] + (front ? 0.008 : -0.012), K[1], rk));
  P.push(capsule(K[0], K[1], r1, F[0], F[1], r2));
  // the broad two-toed pad, splayed flat on the sand, tipped toe-down when lifted
  const up = F[1] - 0.10, tilt = -Math.min(0.8, up * 3.0);
  P.push(capsule(F[0] - 0.03, F[1] - 0.052, 0.048, F[0] + 0.125 * Math.cos(tilt), F[1] - 0.064 + 0.125 * Math.sin(tilt), 0.034));
}
/**
 * one loaded Bactrian camel (双峰驼) walking toward +x: two separate humps, always clear above the load.
 * o: ph (gait phase), neck (−1 low … +1 high), h1/h2 (rear/front hump height), l1/l2 (hump lean),
 *    load (1 bales slung on both flanks, 2 bales + a felt roll between the humps, 3 soft sacks)
 */
function camel(o) {
  const { ph = 0, neck = 0, h1 = 0.47, h2 = 0.45, l1 = 0, l2 = 0, load = 1 } = o;
  const P = [];
  const n = neck, hy = 2.29 + 0.15 * n, hx = 1.60 - 0.06 * n, tl = 0.10 + 0.07 * n;   // poll, head tilt (camels carry the nose high)
  const ct = Math.cos(tl), st = Math.sin(tl);
  const hd = (dx, dy) => [hx + 1.19 * (dx * ct - dy * st), hy + 1.19 * (dx * st + dy * ct)];
  const t1 = 1.86 + h1, t2 = 1.86 + h2, c1 = -0.42, c2 = 0.36;
  // a plump, rounded hump: broad base, domed top, leaning a little (l)
  const hump = (c, t, l) => [[c - 0.29, 1.95], [c - 0.215 + l * 0.3, 2.105], [c - 0.125 + l * 0.8, t - 0.06], [c + l, t], [c + 0.125 + l * 0.8, t - 0.065], [c + 0.21 + l * 0.3, 2.095], [c + 0.28, 1.94]];
  P.push(loop([
    // rump and croup
    [-1.14, 1.46], [-1.115, 1.64], [-1.02, 1.775], [-0.87, 1.86],
    ...hump(c1, t1, l1),
    [-0.03, 1.88],
    ...hump(c2, t2, l2),
    // withers, then the neck: it dips in a U before it rises, long and slender
    [0.76, 1.83], [0.92, 1.715], [1.08, 1.635], [1.23, 1.63], [1.36, 1.74 + 0.03 * n], [1.458 - 0.02 * n, 1.93 + 0.08 * n], [1.532 - 0.04 * n, 2.12 + 0.12 * n],
    // head: nape, poll, ear, brow, the long nose, split lip, chin, deep jaw
    hd(-0.03, -0.03), hd(0.0, 0.065), hd(0.018, 0.158), hd(0.072, 0.082), hd(0.16, 0.098), hd(0.28, 0.064), hd(0.40, 0.042), hd(0.50, 0.026), hd(0.558, -0.018),
    hd(0.56, -0.08), hd(0.525, -0.128), hd(0.47, -0.158), hd(0.385, -0.136), hd(0.28, -0.15), hd(0.185, -0.195), hd(0.115, -0.225),
    // throat, under-neck, breast
    [1.648 - 0.05 * n, 1.87 + 0.07 * n], [1.605 - 0.02 * n, 1.60 + 0.03 * n], [1.505, 1.365], [1.37, 1.20], [1.19, 1.09], [0.98, 1.04],
    // belly, tucked up toward the flank; thigh
    [0.68, 1.05], [0.28, 1.075], [-0.12, 1.115], [-0.46, 1.205], [-0.72, 1.30], [-0.96, 1.255], [-1.11, 1.30],
  ], 6));
  // tail: thin, tufted, swinging a little
  const sw = 0.05 * Math.sin(ph * 2);
  P.push(capsule(-1.12, 1.58, 0.028, -1.18 - sw * 0.5, 1.30, 0.022)); P.push(capsule(-1.18 - sw * 0.5, 1.30, 0.024, -1.20 - sw, 1.06, 0.044));
  // legs: the far pair first, half a cycle out of step with the near pair (camels pace)
  leg(P, true, ph + Math.PI, 0.09); leg(P, false, ph + Math.PI + 0.4, 0.09);
  leg(P, true, ph, 0); leg(P, false, ph + 0.4, 0);
  // the load, slung on both flanks from a pack frame between the humps: kept small, so both humps stand clear above it
  // and daylight shows under the belly
  let hitch = [-0.47, 1.36];
  if (load === 1 || load === 2) P.push(loop([[-0.44, 1.80], [-0.40, 1.90], [-0.05, 1.925], [0.33, 1.90], [0.37, 1.80], [0.395, 1.42], [0.375, 1.05], [0.31, 0.975], [-0.04, 0.955], [-0.40, 0.985], [-0.455, 1.06], [-0.47, 1.42]], 5));
  if (load === 2) P.push(loop([[-0.22, 1.93], [-0.17, 2.03], [0.0, 2.06], [0.17, 2.03], [0.21, 1.93], [0.0, 1.90]], 5));
  if (load === 3) {
    P.push(loop([[-0.50, 1.70], [-0.37, 1.82], [-0.10, 1.80], [-0.05, 1.42], [-0.08, 1.06], [-0.28, 0.965], [-0.49, 1.03], [-0.555, 1.36]], 6));
    P.push(loop([[-0.02, 1.80], [0.27, 1.82], [0.41, 1.70], [0.46, 1.34], [0.40, 1.02], [0.21, 0.955], [0.03, 1.04], [-0.02, 1.42]], 6));
    hitch = [-0.555, 1.34];
  }
  return { polys: P, nose: hd(0.52, -0.08), hitch };
}
/** the camel puller, walking toward +x with a staff; the lead rope runs back from his trailing hand */
function man(o) {
  const { ph = 0 } = o, P = [];
  const s = Math.sin(ph);
  P.push(capsule(0.04, 0.62, 0.085, 0.04 + 0.26 * s, 0.07, 0.05));
  P.push(capsule(-0.04, 0.62, 0.085, -0.04 - 0.26 * s, 0.07, 0.05));
  P.push(capsule(0.04 + 0.26 * s, 0.045, 0.045, 0.04 + 0.26 * s + 0.13, 0.04, 0.035));
  P.push(capsule(-0.04 - 0.26 * s, 0.045, 0.045, -0.04 - 0.26 * s + 0.13, 0.04, 0.035));
  // belted knee-length robe, the hem blown back a little
  P.push(loop([[-0.16, 1.42], [0.0, 1.47], [0.15, 1.42], [0.20, 1.16], [0.16, 0.96], [0.22, 0.70], [0.27, 0.46], [0.02, 0.50], [-0.24, 0.44], [-0.34, 0.50], [-0.24, 0.74], [-0.17, 0.98], [-0.20, 1.20]], 5));
  // head and a soft felt cap
  P.push(loop([[-0.10, 1.56], [-0.09, 1.66], [0.0, 1.70], [0.10, 1.66], [0.12, 1.57], [0.08, 1.47], [-0.04, 1.45]], 5));
  P.push(loop([[-0.15, 1.62], [-0.12, 1.74], [-0.04, 1.83], [0.05, 1.81], [0.12, 1.72], [0.16, 1.63], [0.0, 1.66]], 4));
  // trailing arm with the rope, leading arm on the staff
  P.push(capsule(-0.10, 1.36, 0.06, -0.26, 1.12, 0.045)); P.push(capsule(-0.26, 1.12, 0.045, -0.38, 1.00, 0.04));
  P.push(capsule(0.10, 1.36, 0.06, 0.24, 1.14, 0.045)); P.push(capsule(0.24, 1.14, 0.045, 0.36, 1.16, 0.04));
  P.push(capsule(0.37, 1.74, 0.016, 0.43, 0.0, 0.016));
  return { polys: P, hand: [-0.38, 1.00] };
}
// the string, front to back. x = metres behind the tip of the leader's staff, k = size, then the camel's own parameters
const TRAIN = [
  { x: -3.75, k: 1.0, ph: 0.4, neck: 0.25, load: 1, h1: 0.46, h2: 0.44 },
  { x: -6.9, k: 1.06, ph: 2.3, neck: -0.45, load: 3, l1: -0.05 },
  { x: -10.2, k: 0.94, ph: 4.1, neck: 0.7, load: 2, h2: 0.5 },
  { x: -13.25, k: 1.02, ph: 5.6, neck: -0.1, load: 1, h1: 0.5, l2: 0.04 },
  { x: -16.45, k: 0.98, ph: 1.2, neck: 0.35, load: 3, h2: 0.47 },   // the fifth is still walking into frame
];
const FRONT_X = 602;            // screen x of the staff tip at mid-shot (the string stays left of the text zone, x < 630)

// ───────────────────────── plates ─────────────────────────
/** the crest profile: px the sand stands above (+) or below (−) the ideal arc, sampled every 0.5 px along the crest */
function buildEdge(env) {
  const a = env.arc, R = a.R;
  const UH = R * 0.54, N = Math.ceil(UH * 4) + 4;
  const e = new Float32Array(N), nz = L.makeNoise('s21edge');
  const uLead = R * Math.asin((FRONT_X - 30 - a.cx) / R);
  for (let i = 0; i < N; i++) {
    const u = -UH + i * 0.5;
    const lump = 1 - Math.abs(nz.n2(u / 66, 7.7));                    // scalloped by the wind: long round backs, soft notches
    e[i] = 1.5 * nz.n2(u / 230, 1.3) + 2.3 * (lump - 0.62) + 0.5 * nz.n2(u / 19, 3.1) + 0.14 * nz.n2(u / 6.5, 5.9);
  }
  // hoof prints where the caravan has already walked: a notch and the little lip of sand pushed up beside it
  const r = L.rng('s21prints');
  for (let u = -UH; u < uLead; u += r.range(12, 26)) {
    const depth = r.range(0.5, 1.5), sg = r.range(3.4, 5.6);
    const i0 = Math.max(0, Math.floor((u - 16 + UH) * 2)), i1 = Math.min(N - 1, Math.ceil((u + 16 + UH) * 2));
    for (let i = i0; i <= i1; i++) {
      const du = -UH + i * 0.5 - u;
      e[i] += -depth * Math.exp(-(du * du) / (sg * sg)) + 0.45 * depth * Math.exp(-((du - 1.9 * sg) * (du - 1.9 * sg)) / (sg * sg));
    }
  }
  // round every corner off: at 1:1 the crest must read as a drawn line, not as teeth
  const tmp = new Float32Array(N);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < N; i++) tmp[i] = (e[Math.max(0, i - 2)] + 2 * e[Math.max(0, i - 1)] + 3 * e[i] + 2 * e[Math.min(N - 1, i + 1)] + e[Math.min(N - 1, i + 2)]) / 9;
    e.set(tmp);
  }
  let m = 0; for (let i = 0; i < N; i++) m += e[i]; m /= N;
  for (let i = 0; i < N; i++) { const q = (e[i] - m + 0.3) / 3.8; e[i] = 3.8 * q / Math.sqrt(1 + q * q); }
  const at = (u) => { const f = L.clamp((u + UH) * 2, 0, N - 2), i = f | 0; return e[i] + (e[i + 1] - e[i]) * (f - i); };
  return { e, UH, N, at };
}

/** afterglow sky (frame-sized, static) + the hottest part of it, blurred, to bloom over the crest. */
function buildSky(env) {
  const a = env.arc, SH = Math.min(H, Math.ceil(a.yAt(0)) + 44);
  const NL = 2048, lut = new Float32Array(NL * 3), rf = L.makeRamp(SKY.map(([d, c]) => [d / DMAX, c]));
  for (let i = 0; i < NL; i++) { const c = rf(i / (NL - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  // the stops are joined by straight segments; far from the glow the iso-distance lines stand almost upright, so every kink in
  // slope (the 凝夜紫 plateau at 870–960 above all) read as an upright band in the violet sky. Round the far ramp off with a
  // wide kernel (3 box passes ≈ gaussian, σ ≈ 115 px of distance), faded in beyond the text zone; the hot part stays as it was
  {
    const src = lut.slice(), tmp = new Float32Array(NL * 3), RAD = Math.round((NL * 115) / DMAX);
    const box = (s, dst) => {
      for (let ch = 0; ch < 3; ch++) {
        let acc = 0;
        for (let i = -RAD; i <= RAD; i++) acc += s[Math.min(NL - 1, Math.max(0, i)) * 3 + ch];
        for (let i = 0; i < NL; i++) { dst[i * 3 + ch] = acc / (2 * RAD + 1); acc += s[Math.min(NL - 1, i + RAD + 1) * 3 + ch] - s[Math.max(0, i - RAD) * 3 + ch]; }
      }
    };
    box(src, tmp); box(tmp, lut); box(lut, tmp);
    for (let i = 0; i < NL; i++) {
      const w = sstep(560, 820, (i / (NL - 1)) * DMAX);
      for (let ch = 0; ch < 3; ch++) lut[i * 3 + ch] = src[i * 3 + ch] + (tmp[i * 3 + ch] - src[i * 3 + ch]) * w;
    }
  }
  const gx = GLOW.x, gy = a.yAt(GLOW.x) + GLOW.below;
  const HX1 =Math.min(W, Math.ceil(gx + 290 * GLOW.stretch)), HY0 = Math.max(0, Math.floor(gy - 320)), HW = HX1, HH = SH - HY0;
  const img = new ImageData(W, SH), d = img.data, him = new ImageData(HW, HH), hd = him.data;
  let hsh = 0x9e3779b9 | 0;
  for (let y = 0; y < SH; y++) {
    const ey = y - gy, dyp = a.cy - y;
    for (let x = 0; x < W; x++) {
      const ex = (x - gx) / GLOW.stretch, dxp = x - a.cx;
      let dd = Math.sqrt(ex * ex + ey * ey);
      const v = Math.sqrt(dxp * dxp + dyp * dyp) - a.R;
      if (v > 0) dd -= 38 * Math.exp(-v / 105) * sstep(60, 520, dd);   // the glow hugs the crest a little
      const f = L.clamp(dd / DMAX) * (NL - 1), i0 = f | 0, ft = f - i0, k = i0 * 3, k2 = i0 < NL - 1 ? k + 3 : k;
      // dither, so the long dark gradient never bands
      hsh = Math.imul(hsh ^ (hsh >>> 15), 0x2c1b3c6d) + 0x297a2d39 | 0;
      const n1 = ((hsh >>> 8) & 255) / 255 + ((hsh >>> 16) & 255) / 255 - 1;
      const o = (y * W + x) * 4;
      const cr = lut[k] + (lut[k2] - lut[k]) * ft, cg = lut[k + 1] + (lut[k2 + 1] - lut[k + 1]) * ft, cb = lut[k + 2] + (lut[k2 + 2] - lut[k + 2]) * ft;
      d[o] = cr + n1 * 1.1; d[o + 1] = cg + n1 * 1.1; d[o + 2] = cb + n1 * 1.1; d[o + 3] = 255;
      if (v > 0 && cg > 62 && x < HX1 && y >= HY0) { const ho = ((y - HY0) * HW + x) * 4; hd[ho] = cr; hd[ho + 1] = cg; hd[ho + 2] = cb; hd[ho + 3] = 255 * sstep(62, 112, cg); }
    }
  }
  const sky = L.makeCanvas(W, SH), hal = L.makeCanvas(HW, HH);
  sky.getContext('2d').putImageData(img, 0, 0);
  hal.getContext('2d').putImageData(him, 0, 0);
  return { sky, hal: { c: L.blurred(hal, 7), x: 0, y: HY0 }, gx, gy };
}

/** the dune: everything below the crest. Returns a cropped plate {c, x, y} in frame coordinates */
function buildDune(env, E) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 10, RW = W + PAD * 2, RH = H + PAD - Y0;
  const nA = L.makeNoise('s21a'), nB = L.makeNoise('s21b');
  // per-u tables: strength and colour of the back-light on the crest
  const N = E.N, rimK = new Float32Array(N), rimS = new Float32Array(N), rimC = new Float32Array(N * 3), warm = new Float32Array(N);
  const rimRamp = L.makeRamp([[0, '#ffd08c'], [0.25, '#ffa450'], [0.45, '#ff6a30'], [0.62, '#e23c2c'], [0.8, '#a82a3a'], [1, '#5a2046']]);
  for (let i = 0; i < N; i++) {
    const u = -E.UH + i * 0.5, x = cx + R * Math.sin(u / R);
    const slope = (E.e[Math.min(N - 1, i + 8)] - E.e[Math.max(0, i - 8)]) / 8 * 2.2;     // + where the sand faces the light
    const patch = sstep(0.25, 0.7, 0.5 + 0.5 * nA.n2(u / 64, 11.3)) * (0.75 + 0.25 * nA.n2(u / 11, 2.2));
    rimK[i] = sunK(x) * L.clamp(0.36 + 0.64 * patch) * L.clamp(0.85 + 0.9 * slope, 0.5, 1.45);
    const c = rimRamp(L.clamp(x / W));
    rimC[i * 3] = c[0]; rimC[i * 3 + 1] = c[1]; rimC[i * 3 + 2] = c[2];
    warm[i] = 1 - sstep(300, 1050, x);
  }
  // running means: a short one for the thread of light on the very edge, a long one for the light that spills onto the ripples
  const smooth = (src, dst, rad) => {
    let acc = 0, cnt = 0;
    for (let i = 0; i < Math.min(N, rad); i++) { acc += src[i]; cnt++; }
    for (let i = 0; i < N; i++) {
      if (i + rad < N) { acc += src[i + rad]; cnt++; }
      if (i - rad - 1 >= 0) { acc -= src[i - rad - 1]; cnt--; }
      dst[i] = acc / cnt;
    }
  };
  smooth(rimK, rimS, 6); smooth(rimS, rimK, 6);
  smooth(rimK, rimS, 44); { const t2 = new Float32Array(N); smooth(rimS, t2, 44); rimS.set(t2); }
  const img = new ImageData(RW, RH), d = img.data;
  let hsh = 0x51ed270b | 0;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, dy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, dx = x - cx, rr = Math.sqrt(dx * dx + dy * dy), v = rr - R;
      if (v > 6) continue;
      const u = Math.atan2(dx, dy) * R;
      const f = L.clamp((u + E.UH) * 2, 0, N - 2), i0 = f | 0, ft = f - i0;
      const s = E.e[i0] + (E.e[i0 + 1] - E.e[i0]) * ft - v;        // px below the sand's edge
      if (s <= -0.5) continue;
      const o = (j * RW + i) * 4;
      d[o + 3] = s >= 0.5 ? 255 : 255 * (s + 0.5);
      let cr = 10, cg = 5, cb = 7;
      if (s < 560) {
        hsh = Math.imul(hsh ^ (hsh >>> 15), 0x2c1b3c6d) + 0x297a2d39 | 0;
        const gr = 0.82 + 0.18 * (((hsh >>> 9) & 1023) / 1023);
        // wind ripples run with the crest and open up toward the lens (the bottom of frame): sp = depth in "far" px
        const sp = 110 * Math.log(1 + s / 110);
        // drawn as continuous, gently wandering lines (a warped phase), each with a soft windward face and a crisper lee;
        // they thin out and swell along their length
        const wr = 12 * nA.n2(u / 240 + 3, sp / 330) + 6.5 * nB.n2(u / 92 + 5, sp / 120 + 3) + 1.3 * nA.n2(u / 31 + 9, sp / 48 + 1);
        const phs = (sp + wr) * (TAU / 6.6);
        const ph2 = (sp * 1.17 + 0.8 * wr + 11) * (TAU / 6.6);
        const mx = sstep(0.4, 0.6, 0.5 + 0.5 * nA.n2(u / 380 + 20, sp / 64 + 4));
        const sn = L.lerp(Math.sin(phs + 0.55 * Math.cos(phs)), Math.sin(ph2 + 0.55 * Math.cos(ph2)), mx);
        const brk = 0.6 + 0.4 * nB.n2(u / 210 + 2, sp / 19 + 7);
        const rp = sstep(-0.7, 0.95, sn) * brk + 0.12;
        const patch = 0.3 + 0.7 * sstep(0.3, 0.75, 0.5 + 0.5 * nB.n2(u / 520 + 3, s / 240));
        const sheen = (1 - Math.exp(-s / 8)) * Math.exp(-s / 190) * patch * rp * gr * 0.4;
        const big = sstep(0.45, 0.85, 0.5 + 0.5 * nB.n2(u / 700 + 1, s / 380)) * (1 - Math.exp(-s / 200)) * Math.exp(-s / 420);
        const wm = warm[i0];
        cr += (wm * 96 + (1 - wm) * 58) * sheen + 8 * big; cg += (wm * 26 + (1 - wm) * 30) * sheen + 4 * big; cb += (wm * 24 + (1 - wm) * 88) * sheen + 13 * big;
        // back-light: a bright thread on the very edge, and some of it spilling over onto the first ripples
        if (s < 70) {
          const k = rimK[i0] + (rimK[i0 + 1] - rimK[i0]) * ft, spill = (rimS[i0] + (rimS[i0 + 1] - rimS[i0]) * ft) * Math.exp(-s / 14) * (0.25 + 0.75 * rp) * gr * 0.6;
          cr += 200 * spill; cg += 54 * spill; cb += 22 * spill;
          if (s < 16) { const rim = 1.5 * k * Math.exp(-Math.max(0, s - 0.3) / 2.0); cr += rimC[i0 * 3] * rim; cg += rimC[i0 * 3 + 1] * rim; cb += rimC[i0 * 3 + 2] * rim; }
        }
      }
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb;
    }
  }
  const c = L.makeCanvas(RW, RH), g = c.getContext('2d');
  g.putImageData(img, 0, 0);
  // depth of field: focus is on the caravan and the crest; the dune softens toward the right and toward the lens
  const far = L.blurred(c, 4), fg = far.getContext('2d');
  fg.globalCompositeOperation = 'destination-in';
  fg.fillStyle = L.linear(fg, 1080 - X0, 0, 1800 - X0, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); fg.fillRect(0, 0, RW, RH);
  const near = L.blurred(c, 7), ng = near.getContext('2d');
  ng.globalCompositeOperation = 'destination-in';
  ng.fillStyle = L.linear(ng, 0, 740 - Y0, 0, 1020 - Y0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); ng.fillRect(0, 0, RW, RH);
  g.drawImage(far, 0, 0); g.drawImage(near, 0, 0);
  return { c, x: X0, y: Y0 };
}

/** sand blown off the crest and kicked up by the caravan: a glowing veil, taller in gusts, with saltating grains. Cropped plate */
function buildDust(env, E) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, VMAX = 150;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - VMAX - 4, RW = W + PAD * 2, RH = Math.ceil(a.yAt(-PAD)) + 14 - Y0;
  const nA = L.makeNoise('s21dustA'), nB = L.makeNoise('s21dustB');
  const N = E.N, hgt = new Float32Array(N), amp = new Float32Array(N), col = new Float32Array(N * 3);
  const ramp = L.makeRamp([[0, '#ffd89a'], [0.2, '#ffc078'], [0.36, '#ff8e48'], [0.5, '#f65c36'], [0.72, '#c0323e'], [1, '#70284c']]);
  for (let i = 0; i < N; i++) {
    const u = -E.UH + i * 0.5, x = cx + R * Math.sin(u / R);
    const gust = sstep(0.2, 0.8, 0.5 + 0.5 * nA.n2(u / 300 + 5, 3));
    // tall only where it cannot disturb the tagline: around the caravan on the left, and far right. x 630…1290 keeps a hair-line
    const left = 1 - sstep(520, 660, x), right = sstep(1260, 1430, x);
    hgt[i] = 5 + 2.5 * gust + left * (9 + 34 * gust) + right * 18 * gust;
    amp[i] = sunK(x) * (0.5 + 0.5 * gust) * (1 + 0.2 * left);
    const c = ramp(L.clamp(x / W));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, dy = cy - y;
    for (let i = 0; i < RW; i++) {
      const dx = X0 + i - cx, v = Math.sqrt(dx * dx + dy * dy) - R;
      if (v < -5 || v > VMAX) continue;
      const u = Math.atan2(dx, dy) * R;
      const i0 = L.clamp(((u + E.UH) * 2) | 0, 0, N - 1), am = amp[i0];
      const hh = v < 0 ? 0 : v, fall = Math.exp(-hh / hgt[i0]);
      if (fall * am < 0.006) continue;
      // streamers leaning down-wind (to the right) as they rise
      const w = 0.5 + 0.5 * nA.fbm((u - 2.6 * hh) / 110 + 9.2, hh / 9 + 1.7, 3, 2, 0.55);
      let D = fall * (0.25 + 1.3 * w * w) * am;
      const sg = nB.n2(u / 6.5 + 40, hh / 1.3 - 7);
      if (sg > 0.6) D += (sg - 0.6) * 2.2 * fall * am;
      const o = (j * RW + i) * 4;
      d[o] = col[i0 * 3]; d[o + 1] = col[i0 * 3 + 1]; d[o + 2] = col[i0 * 3 + 2]; d[o + 3] = 255 * L.clamp(D);
    }
  }
  const c = L.makeCanvas(RW, RH);
  c.getContext('2d').putImageData(img, 0, 0);
  return { c, x: X0, y: Y0 };
}

/** draw a cropped plate, slid along the arc by `rot` */
function put(ctx, a, pl, rot, alpha = 1, blend = 'source-over') {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(pl.c, pl.x, pl.y);
  ctx.restore();
}

/** the caravan as live silhouettes. sF = arc-length position (px from the crest) of the staff tip, t = shot progress */
function drawCaravan(g, a, sF, t, ox, oy) {
  const R = a.R, SINK = 1.6;
  const map = (s0, k) => (q) => { const th = (s0 + q[0] * PXM * k) / R; return [a.cx + (R - SINK) * Math.sin(th) - ox, a.cy - (R - SINK) * Math.cos(th) - q[1] * PXM * k - oy]; };
  const fill = (polys, m) => {
    for (const poly of polys) {
      g.beginPath();
      for (let i = 0; i < poly.length; i++) { const q = m(poly[i]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.closePath(); g.fill();
    }
  };
  const rope = (p0, p1, sag) => { g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + sag, p1[0], p1[1]); g.stroke(); };
  g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = 1.3; g.lineCap = 'round';
  // the leader
  const mm = map(sF - 0.45 * PXM, 1), M = man({ ph: 0.9 + 2.2 * t });
  fill(M.polys, mm);
  let tie = mm(M.hand);
  TRAIN.forEach((c, i) => {
    const m = map(sF + c.x * PXM, c.k), C = camel({ ...c, ph: c.ph + 1.4 * t });
    fill(C.polys, m);
    rope(m(C.nose), tie, i ? 5 + 2 * Math.sin(c.ph + 3 * t) : 7);
    tie = m(C.hitch);
  });
}

const CV = { x: -24, y: 420, w: 760, h: 380 };   // where the caravan's scratch canvas sits in the frame

export default {
  name: '丝路驼队剪影',
  tone: 'light',
  async init(env) {
    const a = env.arc, E = buildEdge(env);
    const sk = buildSky(env), dune = buildDune(env, E), dust = buildDust(env, E);
    // grains of sand on the crest that catch the back-light and twinkle
    const r = L.rng('s21spark'), sparks = [];
    for (let i = 0; i < 420; i++) {
      const x = r.range(-PAD, W + PAD), k = sunK(x);
      if (r() > k) continue;
      const u = a.R * Math.asin((x - a.cx) / a.R);
      sparks.push({ th: u / a.R, dr: E.at(u) - 0.5 - 5 * Math.pow(r(), 2.2), rad: r.range(0.5, 1.15), ph: r(), k: k * r.range(0.5, 1), hot: r() });
    }
    // bake the plates into bitmaps: drawing canvas-backed plates every frame stalls the headless rasteriser
    const bake = async (pl) => ({ ...pl, c: await createImageBitmap(pl.c) });
    S = {
      E, sky: await createImageBitmap(sk.sky), hal: await bake(sk.hal), gx: sk.gx, gy: sk.gy, dune: await bake(dune), dust: await bake(dust), sparks,
      cv: L.makeCanvas(CV.w, CV.h), sMid: a.R * Math.asin((FRONT_X - a.cx) / a.R),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.004, 0.004, p);                     // the dune slides ~19 px along the arc
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(S.sky, 0, 0);
    // blown sand behind the crest; it drifts down-wind a little faster than the dune slides, and breathes
    const rotD = rot + 0.005 * p, flick = 0.88 + 0.12 * Math.sin(TAU * (p * 1.3 + 0.1));
    put(ctx, a, S.dust, rotD, 0.8 * flick, 'screen');
    put(ctx, a, S.dune, rot);
    put(ctx, a, S.hal, 0, 0.4, 'screen');                      // the hottest sky blooms over the crest
    // twinkling grains on the lit edge
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of S.sparks) {
      const tw = Math.pow(Math.max(0, Math.cos(TAU * (p * 1.1 + q.ph))), 2) * q.k;
      if (tw < 0.04) continue;
      const pt = a.pt(q.th + rot, q.dr);
      ctx.fillStyle = `rgba(255,${Math.round(120 + 60 * q.hot)},${Math.round(50 + 40 * q.hot)},${(0.6 * tw).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, q.rad, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // the caravan: rides the dune and walks on (about half a metre in these 0.4 s)
    const sF = S.sMid + rot * a.R + L.lerp(-8, 8, p);
    const g = S.cv.getContext('2d');
    g.clearRect(0, 0, CV.w, CV.h);
    drawCaravan(g, a, sF, p, CV.x, CV.y);
    ctx.save(); ctx.filter = 'blur(0.6px)'; ctx.drawImage(S.cv, CV.x, CV.y); ctx.restore();
    // … the low veil of blown sand again, in front of their feet, and a touch of bloom eating into their outlines
    put(ctx, a, S.dust, rotD, 0.34 * flick, 'screen');
    put(ctx, a, S.hal, 0, 0.1, 'screen');
    // lens: a veil of glare hangs around where the sun went down
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = L.radial(ctx, S.gx, S.gy - 30, 0, 600, [[0, 'rgba(255,120,40,0.14)'], [0.4, 'rgba(242,96,28,0.06)'], [1, 'rgba(200,50,30,0)']]);
    ctx.fillRect(0, Math.max(0, S.gy - 630), Math.min(W, S.gx + 600), 1230);
    ctx.restore();
  },
};
