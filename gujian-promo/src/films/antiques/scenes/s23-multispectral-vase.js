// s23 — 多光谱下的瓷瓶. A conservation-lab false-colour capture of a porcelain vase seen from straight above, pushed in
// until only the round outline of the shoulder is left in frame. The lit backdrop answers strongly in every band, so it
// sits high on the colour scale (lemon); the painted, glazed body absorbs and drops into magenta and purple. The arc is
// that outline: the place where the signal falls off the backdrop, through amber and orange, onto the object.
// Below it: a ring of lotus lappets (莲瓣) under the rim, string lines (弦纹), a lemon band carrying a lotus scroll
// (缠枝莲), and one shard-shaped patch where every colour jumps to cyan-green — an old repair showing up under the lamp.
// Above it: the lemon backdrop, with the uneven column striping of a line scanner hanging down from the top of the frame.
//
// How it is made: the whole frame is ONE scalar field ("signal strength") computed in init() at half resolution —
// backdrop + column striping above the arc; band profile + pattern masks drawn on an unrolled (arc length × depth)
// canvas + mottling + lamp falloff below it — softened the way a low-resolution imager softens (in signal space, more
// so away from the crest), sharpened back a little the way such cameras do (which is what puts a thin green fringe
// round every dark shape), and only then pushed through a single colour ramp. That is what false colour is: the hue
// says nothing but how strong the signal is, so every soft edge turns into a little rainbow by itself.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 48;      // the whole plate turns ±0.0065 rad about the arc centre: at most 20 px of travel anywhere in frame
const CS = 2;        // the field is computed on 2 px cells
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const ihash = (n) => { n |= 0; n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
const hash2 = (x, y) => ihash((Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0);

// the palette of the task sheet, and where each colour sits on the signal axis
const PAL = { K: '#030406', P: '#7a2bff', M: '#ff2bd6', O: '#ff7a1f', Y: '#e6ff3a', G: '#2de2a6' };
const SV = { P: 0.2, M: 0.42, O: 0.58, Y: 0.74, G: 0.92 };
const RAMP = [[0, '#0a0418'], [0.07, '#200a5c'], [0.14, '#4c18bd'], [SV.P, PAL.P], [0.31, '#c22cf0'], [SV.M, PAL.M], [0.5, '#ff3a7c'],
  [SV.O, PAL.O], [0.66, '#ffc42a'], [SV.Y, PAL.Y], [0.83, '#9cf04c'], [SV.G, PAL.G], [1, '#a4ece2']];
const G0 = SV.Y;     // the backdrop

// radial band profile: [depth below the arc where the plateau starts, signal, half-width of the transition into it]
const BANDS = [
  [-1e9, 0.43, 0],                       // under the rim: magenta (the lappets stand in this band)
  [114, 0.235, 7], [137, 0.455, 6],      // string line, then a plain hot-pink band
  [206, 0.25, 7], [229, SV.Y - 0.045, 8],  // string line, then the lemon band (lotus scroll)
  [366, 0.33, 9],                        // magenta-purple
  [452, 0.23, 8], [476, 0.66, 7], [530, 0.26, 9],
];
// the wide bands answer a little stronger along their middle, like a tube: [from, to, extra signal]
const TUBES = [[137, 206, 0.035], [229, 366, 0.015], [366, 452, 0.05]];
const D0 = -10;

function buildProfile(dmax) {
  const n = (dmax - D0) * 2 + 4, out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const d = D0 + k / 2; let v = BANDS[0][1];
    for (let s = 1; s < BANDS.length; s++) { const b = BANDS[s]; if (d < b[0] - b[2]) break; v = L.lerp(v, b[1], sstep(b[0] - b[2], b[0] + b[2], d)); }
    for (const [d0, d1, amp] of TUBES) if (d > d0 && d < d1) v += amp * Math.sin((Math.PI * (d - d0)) / (d1 - d0));
    out[k] = v;
  }
  return out;
}

// ── pattern masks, drawn on an unrolled strip: x = arc length u (px at the rim), y = depth d below the arc ──
function leaf(g, x, y, ang, len, wid) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid * 0.85, len, 0);
  g.bezierCurveTo(len * 0.7, wid * 0.5, len * 0.3, wid * 0.55, 0, 0);
  g.fill(); g.restore();
}
/** a lotus head seen full-face, as the imager sees it: one scalloped mass */
function flower(g, x, y, r, turn, lvl) {
  g.save(); g.translate(x, y); g.rotate(turn);
  g.fillStyle = lvl;
  for (let i = 0; i < 7; i++) { g.save(); g.rotate((i * L.TAU) / 7); g.beginPath(); g.ellipse(0, -r * 0.56, r * 0.36, r * 0.5, 0, 0, L.TAU); g.fill(); g.restore(); }
  g.beginPath(); g.arc(0, 0, r * 0.62, 0, L.TAU); g.fill();
  g.restore();
}
/** 缠枝: an undulating stem, a flower head in every hollow, fat leaves where the stem crosses the middle of the band */
function scroll(g, um, mid, A, lam, phase, fr) {
  const stem = (u) => mid + A * Math.sin((L.TAU * (u - phase)) / lam);
  const grey = (k, lo, hi) => { const v = Math.round(L.lerp(lo, hi, ihash(k * 131 + 9))); return `rgb(${v},${v},${v})`; };
  g.strokeStyle = 'rgb(190,190,190)'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = fr * 0.5; g.beginPath();
  for (let u = -um; u <= um; u += 5) { if (u === -um) g.moveTo(u, stem(u)); else g.lineTo(u, stem(u)); }
  g.stroke();
  const k0 = Math.floor((-um - phase) / (lam / 2)) - 1, k1 = Math.ceil((um - phase) / (lam / 2)) + 1;
  for (let k = k0; k <= k1; k++) {
    const u = phase + lam / 4 + (k * lam) / 2 + 22 * (ihash(k * 7 + 1) - 0.5), sgn = k % 2 === 0 ? 1 : -1;      // sgn = 1: the stem runs on the inner (deeper) side here
    const fk = 0.82 + 0.34 * ihash(k * 53 + 11);
    flower(g, u, mid - sgn * A * 0.5, fr * fk, k * 0.7, grey(k + 40, 175, 255));
    const ux = phase + (k * lam) / 2, dir = Math.atan((sgn * A * L.TAU) / lam);
    g.fillStyle = grey(k + 80, 150, 240);
    leaf(g, ux - 22, stem(ux - 22), dir - 0.95, fr * (1.1 + 0.4 * ihash(k * 17 + 3)), fr * 0.62);
    leaf(g, ux + 18, stem(ux + 18), dir + 0.9, fr * (1.1 + 0.4 * ihash(k * 29 + 5)), fr * 0.62);
  }
}
/** a ring of lotus lappets (莲瓣) under the rim, tips toward it: no two the same width, the same strength, or quite upright */
function lappets(g, um) {
  const rs = L.rng('s23lappets');
  let u = -um - 150;
  while (u < um + 200) {
    const pitch = rs.range(156, 198), w = pitch / 2 - rs.range(9, 18), uc = u + pitch / 2;
    const tip = rs.range(12, 27), sh = tip + rs.range(26, 40), base = 113, lean = rs.range(-9, 9);
    let lvl = rs.range(0.62, 1); if (rs.chance(0.14)) lvl *= 0.45;      // now and then one has all but worn away
    const v = Math.round(255 * lvl);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(uc - w, base); g.lineTo(uc - w, sh);
    g.bezierCurveTo(uc - w, sh - 22, uc - w * 0.4 + lean, tip + 5, uc + lean, tip);
    g.bezierCurveTo(uc + w * 0.4 + lean, tip + 5, uc + w, sh - 22, uc + w, sh);
    g.lineTo(uc + w, base); g.closePath(); g.fill();
    // the pigment sits thinner in the heart of the petal
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(uc + lean * 0.4 + rs.range(-8, 8), L.lerp(sh, base, 0.55), w * rs.range(0.34, 0.5), 24, 0, 0, L.TAU); g.fill();
    u += pitch;
  }
}

function buildMasks(UM, DH) {
  const UW = Math.ceil(UM * 2);
  const mk = () => { const c = L.makeCanvas(UW, DH); const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, UW, DH); g.translate(UM, -D0); return [c, g]; };
  const read = (c, px) => L.blurred(c, px).getContext('2d').getImageData(0, 0, UW, DH).data;
  // decoration (how much signal the painted pattern takes away); blurred — the sensor never sees a crisp brush line
  const [cL, gl] = mk(); lappets(gl, UM);
  const [cS, gs] = mk(); scroll(gs, UM, 297, 34, 520, 110, 47);
  // the repair: R = filled-in shard, G = glue seams and the hairline breaks running away from it
  const [cQ, q] = mk();
  const shard = [[322, 136], [452, 120], [548, 204], [496, 262], [474, 342], [374, 290]];
  q.globalCompositeOperation = 'lighter';
  q.fillStyle = '#f00'; L.roughPoly(q, shard, { rough: 2.6, seed: 's23shard', step: 13 }); q.fill();
  q.strokeStyle = '#0f0'; q.lineJoin = 'round'; q.lineCap = 'round';
  q.lineWidth = 5; L.roughPoly(q, shard, { rough: 2.6, seed: 's23shard', step: 13 }); q.stroke();
  const crack = (pts, w0, w1) => {
    const p = L.smoothPath(pts, 5);
    for (let i = 1; i < p.length; i++) { q.lineWidth = L.lerp(w0, w1, i / p.length); q.beginPath(); q.moveTo(p[i - 1][0], p[i - 1][1]); q.lineTo(p[i][0], p[i][1]); q.stroke(); }
  };
  crack([[322, 136], [306, 90], [300, 44], [286, -10]], 9, 8);                       // out through the rim
  crack([[474, 342], [494, 402], [508, 476], [536, 620]], 9, 6);                    // down toward the belly
  crack([[374, 290], [318, 268], [246, 262], [150, 276]], 8, 1);                     // a hairline dying out to the left
  crack([[548, 204], [604, 190], [656, 200]], 7, 1);
  return { UW, lap: read(cL, 4), scr: read(cS, 9), rep: read(cQ, 3.2) };
}

/** three box passes ≈ a gaussian of σ ≈ r cells (edges clamped) */
function blur3(src, w, h, r) {
  const out = new Float32Array(src), tmp = new Float32Array(w * h), win = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let acc = 0;
      for (let k = -r; k <= r; k++) acc += out[o + (k < 0 ? 0 : k >= w ? w - 1 : k)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = acc / win;
        const xa = x + r + 1, xb = x - r;
        acc += out[o + (xa >= w ? w - 1 : xa)] - out[o + (xb < 0 ? 0 : xb)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(k < 0 ? 0 : k >= h ? h - 1 : k) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / win;
        const ya = y + r + 1, yb = y - r;
        acc += tmp[(ya >= h ? h - 1 : ya) * w + x] - tmp[(yb < 0 ? 0 : yb) * w + x];
      }
    }
  }
  return out;
}

// column striping of the line scanner: [x, half-width, signal change (− absorbing → orange / magenta, + → green), edge softness]
const STRIPES = [
  [-14, 50, -0.22, 16], [108, 21, -0.17, 9], [206, 62, -0.24, 20], [316, 15, 0.13, 8], [392, 36, -0.21, 13], [500, 54, -0.16, 20], [588, 15, -0.12, 8],
  [704, 30, -0.2, 14], [842, 17, 0.1, 9], [1016, 40, -0.17, 18], [1152, 22, -0.21, 11], [1262, 14, 0.1, 8],      // over the tagline: they die out well above it
  [1352, 42, -0.21, 15], [1452, 17, -0.14, 8], [1538, 64, -0.24, 22], [1652, 25, 0.14, 11], [1718, 46, -0.19, 16], [1832, 30, -0.22, 12], [1930, 52, -0.18, 18],
];

/** the two plates (as read, and read a notch higher behind the scan line): per-pixel signal → colour ramp */
function buildPlates(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, crestY = a.crestY;
  const PW = W + PAD * 2, PH = H + PAD * 2, FW = PW / CS, FH = PH / CS;
  const DMAX = Math.ceil(R - (cy - (H + PAD))) + 24, DH = DMAX - D0;
  const UM = Math.ceil(Math.atan2(W / 2 + PAD + 8, cy - (H + PAD)) * R) + 24;
  const { UW, lap, scr, rep } = buildMasks(UM, DH);
  const PROF = buildProfile(DMAX);
  const nA = L.makeNoise('s23a'), nB = L.makeNoise('s23b'), nS = L.makeNoise('s23stripes');

  const F = new Float32Array(FW * FH), IN = new Float32Array(FW * FH), LM = new Float32Array(FW * FH), row = new Float32Array(FW);
  for (let j = 0; j < FH; j++) {
    const y = -PAD + (j + 0.5) * CS, ddy = cy - y;
    // the stripes of this row
    row.fill(0);
    const zy = 1 - sstep(130, 300, y);
    for (let k = 0; k < STRIPES.length; k++) {
      const [sx, hw, amp, soft] = STRIPES[k];
      const z = Math.max(sstep(340, 470, Math.abs(sx - cx)), 0.8 * zy);      // 0 over the tagline
      if (z < 0.02) continue;
      const yArc = a.yAt(sx);
      const n1 = 0.5 + 0.5 * nS.n2(y / 330 + k * 7.3, k * 1.7), n2 = 0.5 + 0.5 * nS.n2(y / 430 - k * 3.1, 20 + k);
      const gate = sstep(0.12, 0.36, 0.5 + 0.5 * nS.n2(y / 520 + k * 2.9, 50 + k));      // long drop-outs
      // absorbing columns pool a little as they come down toward the object, then let go just short of it; the green ones live at the top
      const gap = 16 + 120 * ihash(k * 577 + 3) ** 2, fall = 34 + 110 * ihash(k * 331 + 8);
      const run = amp < 0 ? (1 + 0.45 * sstep(yArc - 300, yArc - gap - fall, y)) * (1 - sstep(yArc - gap - fall, yArc - gap, y)) : 1 - 0.8 * sstep(60, 520, y);
      const A = amp * (0.5 + 0.5 * n1) * (0.3 + 0.7 * gate) * run * z;
      const core = amp < 0 ? amp * 0.5 * sstep(0.5, 0.9, n2) * gate * run * z : 0;
      const c = sx + 7 * nS.n2(y / 380 + k * 5, 90 + k) + (ihash(k * 911 + 5) - 0.5) * 0.03 * (y - 400);
      const w = hw * (0.84 + 0.3 * (0.5 + 0.5 * nS.n2(y / 260 + k * 4.1, 70 + k)));
      const i0 = Math.max(0, Math.floor((c - w - soft - 20 + PAD) / CS)), i1 = Math.min(FW - 1, Math.ceil((c + w + soft + 20 + PAD) / CS));
      for (let i = i0; i <= i1; i++) {
        const ax = Math.abs(-PAD + (i + 0.5) * CS - c);
        const fx = (ax - w - soft - 3) / 6;
        row[i] += A * (1 - sstep(w - soft, w + soft, ax)) + core * (1 - sstep(w * 0.1, w * 0.8, ax)) - (amp < 0 ? 0.42 * A * n2 * Math.exp(-fx * fx) : 0);
      }
    }
    for (let i = 0; i < FW; i++) {
      const x = -PAD + (i + 0.5) * CS, ddx = x - cx, d = R - Math.sqrt(ddx * ddx + ddy * ddy), k = j * FW + i;
      let u = 0, e = 0;
      if (d > -8) {
        u = Math.atan2(ddx, ddy) * R;
        // stair-stepped edge: sensor cells 18 px long, a step of 3 px here and there, a 1 px shiver in between (never more than 4 px off the arc)
        const h = ihash(Math.floor(u / 18) * 7919 + 13), h2 = ihash(Math.floor(u / 6) * 104729 + 71);
        e = (h < 0.22 ? 3 : h < 0.44 ? -3 : 0) + (h2 < 0.25 ? 1 : h2 < 0.5 ? -1 : 0);
      }
      if (d + e < 0) {
        // the backdrop: lemon, greener toward the top of the frame, warmer out toward the ends of the arc
        const zx = sstep(340, 470, Math.abs(ddx));
        let v = G0 + (0.4 + 0.6 * zx) * (0.034 * nA.fbm(x / 480, y / 820, 2) + 0.02 * nB.n2(x / 70 + 9, y / 300))
          + zx * 0.03 * nB.n2(x / 38 - 5, y / 700 + 3)
          + 0.035 * (1 - sstep(0, 430, y)) - 0.05 * zx * sstep(-330, -30, d) + row[i];
        if (v < 0.45) v = 0.45 + (v - 0.45) * 0.3;
        v -= 0.095 * Math.exp(d / 21);
        F[k] = v; IN[k] = 0; LM[k] = 1;
      } else {
        const body = sstep(26, 70, d);
        const fin = nA.n2(u / 34 + 40, d / 34 - 7);
        const dp = d + (9 * nB.fbm(u / 330, d / 210, 2) + 3 * nB.n2(u / 90 + 5, d / 120)) * body;                  // the bands breathe a few px in width; the rim itself does not
        let s = PROF[((dp - D0) * 2) | 0];
        const mi = (((dp - D0) | 0) * UW + ((u + UM) | 0)) * 4;
        s -= 0.25 * (lap[mi] / 255);
        s += (0.055 * nA.fbm(u / 230, d / 105, 3, 2, 0.55) + 0.02 * fin + 0.055 * nB.n2(u / 400 + 3, d / 95 + 11)) * body;
        // two lamps, one at either side (the usual copy-stand set-up), leave two broad lobes; the far flank reads cooler
        const l1 = Math.exp(-(((u + 520) / 380) ** 2) - (((d - 170) / 190) ** 2)), l2 = Math.exp(-(((u - 760) / 300) ** 2) - (((d - 150) / 160) ** 2));
        const far = sstep(330, 640, d), flank = sstep(620, 1180, Math.abs(u + 60));
        s += (0.045 * l1 + 0.035 * l2 - 0.06 * far - 0.04 * flank) * sstep(6, 40, d);
        // the lemon band stays lemon (no drifting off into green); the scroll painted on it only ghosts through, as amber masses
        if (dp > 222 && dp < 372) { if (s > 0.735) s = 0.735 + (s - 0.735) * 0.3; s -= 0.165 * (scr[mi] / 255); }
        // glare of the left lamp on the glaze: a narrow crescent that follows the curve of the shoulder
        s += 0.27 * Math.exp(-(((u + 455) / 170) ** 2) - (((d - 171) / 12) ** 2));
        const qm = rep[mi] / 255, qs = rep[mi + 1] / 255;
        if (qm > 0) s = L.lerp(s, 0.875 + 0.2 * (s - 0.45) + 0.03 * fin, qm);   // the fill answers flat and strong; the retouching over it only ghosts through
        if (qs > 0) s = Math.max(s, L.lerp(s, 0.99, qs * (0.55 + 0.45 * nA.n2(u / 46 + 7, d / 46))));      // the glue line answers strongest of all, where it is not worn
        if (d < 16) s = L.lerp(0.47, s, sstep(5, 16, d));                        // the skin of the rim runs a touch hotter
        F[k] = s; IN[k] = 1;
        LM[k] = 0.93 + 0.1 * l1 + 0.07 * l2 - 0.2 * far - 0.08 * flank;
      }
    }
  }

  // imager softness: tight where the lens is focused (the rim, at the crest), loose away from it; then the camera's own sharpening
  const F1 = blur3(F, FW, FH, 2), F2 = blur3(F, FW, FH, 5), F3 = blur3(F, FW, FH, 11), IN1 = blur3(IN, FW, FH, 2), LM1 = blur3(LM, FW, FH, 3);
  const fxc = (cx + PAD) / CS, fyc = (crestY + 50 + PAD) / CS;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const k = j * FW + i, m = sstep(150, 520, Math.hypot(i - fxc, (j - fyc) * 1.35));
    F[k] = L.lerp(F1[k], F2[k], m) + 0.4 * (F1[k] - F3[k]);
  }

  const rampFn = L.makeRamp(RAMP), LUT = new Uint8ClampedArray(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = rampFn(i / 1023); LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2]; }
  // sensor noise: a tile of soft-edged cells about 7 px across
  const NZ = new Float32Array(256 * 256), nC = L.makeNoise('s23cells');
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) NZ[j * 256 + i] = nC.n2(i / 3.4, j / 3.4) + 0.6 * nC.n2(i / 9 + 31, j / 9 - 17);
  const COL = new Float32Array(PW);
  for (let X = 0; X < PW; X++) COL[X] = 0.011 * (ihash((X >> 1) * 7 + 5) - 0.5) + 0.008 * nC.n2(X / 11, 77);
  const HOT = 0.075;       // how far the signal lifts behind the scan line (second copy of the plate)
  const img = new ImageData(PW, PH), px = img.data, img2 = new ImageData(PW, PH), px2 = img2.data;
  for (let Y = 0; Y < PH; Y++) {
    const fy = Y / CS - 0.5; let j0 = Math.floor(fy); if (j0 < 0) j0 = 0; else if (j0 > FH - 2) j0 = FH - 2;
    const ty = L.clamp(fy - j0), r0 = j0 * FW, r1 = r0 + FW;
    for (let X = 0; X < PW; X++) {
      const fx = X / CS - 0.5; let i0 = Math.floor(fx); if (i0 < 0) i0 = 0; else if (i0 > FW - 2) i0 = FW - 2;
      const tx = L.clamp(fx - i0), w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const k0 = r0 + i0, k1 = r1 + i0;
      let s = F[k0] * w00 + F[k0 + 1] * w10 + F[k1] * w01 + F[k1 + 1] * w11;
      const inn = IN1[k0] * w00 + IN1[k0 + 1] * w10 + IN1[k1] * w01 + IN1[k1 + 1] * w11;
      const lum = LM1[k0] * w00 + LM1[k0 + 1] * w10 + LM1[k1] * w01 + LM1[k1 + 1] * w11;
      // sensor noise: 5 px cells and single pixels, in the signal; and a little shot noise in the brightness
      s += 0.016 * NZ[((Y >> 1) & 255) * 256 + ((X >> 1) & 255)] + 0.007 * (hash2(X + 3000, Y + 7000) - 0.5) + COL[X];
      const gr = (0.975 + 0.05 * hash2(X + 9000, Y + 5000)) * lum;
      const o = (Y * PW + X) * 4;
      let li = ((s < 0 ? 0 : s > 1 ? 1 : s) * 1023 | 0) * 3;
      px[o] = LUT[li] * gr; px[o + 1] = LUT[li + 1] * gr; px[o + 2] = LUT[li + 2] * gr; px[o + 3] = 255;
      const s2 = s + HOT * inn * (1 - 0.8 * sstep(0.76, 0.94, s));
      li = ((s2 < 0 ? 0 : s2 > 1 ? 1 : s2) * 1023 | 0) * 3;
      const gr2 = gr * (1 + 0.05 * inn);
      px2[o] = LUT[li] * gr2; px2[o + 1] = LUT[li + 1] * gr2; px2[o + 2] = LUT[li + 2] * gr2; px2[o + 3] = 255;
    }
  }
  // the lens: depth of field is shallow this close, so the far bands and the corners of the backdrop go properly soft
  const finish = (im) => {
    const c = L.makeCanvas(PW, PH), g = c.getContext('2d');
    g.putImageData(im, 0, 0);
    const soft = L.blurred(c, 6), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.radial(sg, cx + PAD, crestY + 50 + PAD, 380, 1120, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    sg.fillRect(0, 0, PW, PH);
    g.drawImage(soft, 0, 0);
    return c;
  };
  return { plate: finish(img), hot: finish(img2), PW, PH };
}

export default {
  name: '多光谱下的瓷瓶',
  tone: 'dark',
  init(env) {
    const P = buildPlates(env);
    // halation: a quarter-size blurred copy, screened back on
    const bw = Math.round(P.PW / 4), bh = Math.round(P.PH / 4);
    const small = L.makeCanvas(bw, bh); small.getContext('2d').drawImage(P.plate, 0, 0, bw, bh);
    const bloom = L.blurred(small, 6);
    const TW = 400, tmp = L.makeCanvas(TW, H), tg = tmp.getContext('2d');
    const LINE = TW - 20;       // x of the scan line inside the window canvas
    const win = L.linear(tg, 0, 0, TW, 0, [[0, 'rgba(0,0,0,0)'], [0.4, 'rgba(0,0,0,0.25)'], [(LINE - 60) / TW, 'rgba(0,0,0,0.8)'], [(LINE - 2) / TW, 'rgba(0,0,0,1)'], [(LINE + 2) / TW, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']]);
    S = { ...P, bloom, tmp, tg, win, TW, LINE };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0065, 0.0065, p);
    const xs = L.lerp(150, 1690, p);                           // the scan line sweeps left → right
    const pulse = 0.5 + 0.5 * Math.sin(p * L.TAU * 1.5 - 0.5);

    ctx.fillStyle = PAL.Y; ctx.fillRect(0, 0, W, H);
    // the plate: everything slides a little along the arc
    L.cam(ctx, env, { rot }, () => ctx.drawImage(S.plate, -PAD, -PAD));

    // behind the scan line the signal is still up: the same plate, read a notch higher on the colour scale (the object only)
    const tg = S.tg, x0 = Math.round(xs - S.LINE);
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, S.TW, H);
    tg.translate(-x0, 0); tg.translate(a.cx, a.cy); tg.rotate(rot); tg.translate(-a.cx, -a.cy);
    tg.drawImage(S.hot, -PAD, -PAD);
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'destination-in';
    tg.fillStyle = S.win; tg.fillRect(0, 0, S.TW, H);
    ctx.drawImage(S.tmp, x0, 0);

    // halation of the whole plate, breathing with the sweep
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.1 + 0.06 * pulse;
    L.cam(ctx, env, { rot }, () => ctx.drawImage(S.bloom, -PAD, -PAD, S.PW, S.PH));
    ctx.restore();

    // the line itself, on the object only
    const ya = a.yAt(xs);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = L.linear(ctx, xs - 46, 0, xs + 10, 0, [[0, 'rgba(255,214,240,0)'], [0.6, 'rgba(255,214,240,0.16)'], [0.84, 'rgba(250,240,250,0.4)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(xs - 46, ya + 3, 56, H - ya);
    ctx.restore();
  },
};
