// s15 — 药碾轮. Macro, level with the rim of the cast-iron wheel (碾轮) of a medicine roller (药碾) while it is rolling:
// the arc is the wheel's upper edge. Below it the disc face is one broad, matte, lit mass dragged sideways by motion blur —
// big ragged patches of rust brown and dark orange, a pale burnished band dusted with herb powder part-way in, a few
// streaks of darker iron, the ground rim (刃口) lighter than the rest. The patches feather into each other in long
// "dry-brush" fingers of finite length (nothing runs the whole way round, so it reads as a smeared surface, not as a
// turned record). A soft violet → cold-blue rim light hugs the edge and dies away to both sides; on the left a plume of
// herb dust is thrown up and drawn into fine upright streaks. Above the arc: warm charcoal with the faintest drag marks.
//
// How it is built: the wheel face is painted once as a flat "strip" (x = distance along the rim, y = depth below it)
// where motion blur is simply horizontal smear, then bent onto the arc per pixel in init(). Two such layers turn about
// the arc's centre at different speeds (so the smears flow) under lights that stay fixed to the frame.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 260;        // room at the sides / bottom for the rotation
const SU = 4;           // rim px per strip px (everything is smeared along the rim, so the strip can be coarse that way)
const BX = 60;          // side margin of the drifting background streaks
const VIOLET = '#7a4fd0', BLUE = '#3aa0d8';
const DUST_TH = -0.19; // where on the rim the dust is kicked up (radians from the crest)
const RPX = 90;         // side margin of the rim-light layer
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function lut(stops, n = 512) {
  const f = L.makeRamp(stops), o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}

// ───────────────────────── geometry: frame pixel → (distance along rim, depth below rim) ─────────────────────────
function buildMap(env) {
  const a = env.arc, R = a.R;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const LW = W + PAD * 2, LH = H + PAD - Y0;
  const SH = Math.ceil(R - (a.cy - (H + PAD))) + 6;                       // deepest point the layer reaches
  const thMax = Math.atan2(W / 2 + PAD, a.cy - (H + PAD)) + 0.012;
  const SW = Math.ceil((thMax * R) / SU) * 2 + 6;
  const mx = new Float32Array(LW * LH), my = new Float32Array(LW * LH);
  for (let j = 0; j < LH; j++) {
    const ddy = a.cy - (Y0 + j + 0.5);
    for (let i = 0; i < LW; i++) {
      const ddx = X0 + i + 0.5 - a.cx, k = j * LW + i;
      mx[k] = (Math.atan2(ddx, ddy) * R) / SU + SW / 2 - 0.5;
      my[k] = R - Math.sqrt(ddx * ddx + ddy * ddy);
    }
  }
  return { X0, Y0, LW, LH, SH, SW, mx, my };
}

/** bend a strip (ImageData) onto the arc → canvas covering x ∈ [X0, X0+LW), y ∈ [Y0, Y0+LH); crisp anti-aliased rim */
function warp(M, strip, premul) {
  const { LW, LH, SW, SH, mx, my } = M, src = strip.data;
  const img = new ImageData(LW, LH), d = img.data, row = SW * 4;
  const xMax = SW - 1.001, yMax = SH - 1.001;
  for (let k = 0, n = LW * LH; k < n; k++) {
    const v = my[k]; if (v <= -0.5) continue;
    let fx = mx[k], fy = v - 0.5;
    if (fx < 0) fx = 0; else if (fx > xMax) fx = xMax;
    if (fy < 0) fy = 0; else if (fy > yMax) fy = yMax;
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const p = (y0 * SW + x0) * 4, q = p + row, o = k * 4;
    let w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    const cov = v >= 0.5 ? 1 : v + 0.5;
    if (premul) {
      w00 *= src[p + 3]; w10 *= src[p + 7]; w01 *= src[q + 3]; w11 *= src[q + 7];
      const al = w00 + w10 + w01 + w11; if (al < 0.5) continue;
      d[o] = (src[p] * w00 + src[p + 4] * w10 + src[q] * w01 + src[q + 4] * w11) / al;
      d[o + 1] = (src[p + 1] * w00 + src[p + 5] * w10 + src[q + 1] * w01 + src[q + 5] * w11) / al;
      d[o + 2] = (src[p + 2] * w00 + src[p + 6] * w10 + src[q + 2] * w01 + src[q + 6] * w11) / al;
      d[o + 3] = al * cov;
    } else {
      d[o] = src[p] * w00 + src[p + 4] * w10 + src[q] * w01 + src[q + 4] * w11;
      d[o + 1] = src[p + 1] * w00 + src[p + 5] * w10 + src[q + 1] * w01 + src[q + 5] * w11;
      d[o + 2] = src[p + 2] * w00 + src[p + 6] * w10 + src[q + 2] * w01 + src[q + 6] * w11;
      d[o + 3] = 255 * cov;
    }
  }
  const c = L.makeCanvas(LW, LH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ───────────────────────── the wheel face, unrolled ─────────────────────────
/** horizontally smeared marks drawn onto a strip: each fades in fast at its leading (left) end and trails off */
function paintStreaks(g, SW, SH, seed, dens, over) {
  const r = L.rng(seed);
  const mark = (y, len, th, col, al, soft) => {
    const x = r.range(-len * 0.6, SW - len * 0.4);
    g.fillStyle = L.linear(g, x, 0, x + len, 0, [[0, L.rgba(col, 0)], [0.15, L.rgba(col, al)], [0.45, L.rgba(col, al * 0.85)], [1, L.rgba(col, 0)]]);
    if (soft) {
      g.globalAlpha = 0.35; g.fillRect(x, y - th * 0.5, len, th);
      g.globalAlpha = 0.5; g.fillRect(x, y - th * 0.32, len, th * 0.64);
      g.globalAlpha = 0.7; g.fillRect(x, y - th * 0.14, len, th * 0.28);
      g.globalAlpha = 1;
    } else g.fillRect(x, y - th * 0.5, len, th);
  };
  const anyV = () => 40 + Math.pow(r(), 1.2) * (SH - 44);
  // broad soft smears: powder, rust blooms and darker iron dragged a little way round the wheel
  for (let i = 0; i < 48 * dens; i++) mark(anyV(), r.range(50, 190), r.range(8, 36), r.pick(['#f0c890', '#d98a44', '#6a3216', '#e8b47c', '#4a2010', '#c8742e']), r.range(0.1, 0.24), true);
  // deep-brown threads (never black: the shadows stay warm)
  for (let i = 0; i < (over ? 12 : 44) * dens; i++) mark(anyV(), r.range(30, 150), r.range(1, 3.8), r.pick(['#2a1208', '#3a1a0c', '#4a2210']), r.range(0.22, 0.5));
  // dark-orange threads
  for (let i = 0; i < 46 * dens; i++) mark(anyV(), r.range(30, 130), r.range(0.9, 3.2), r.pick(['#d98a44', '#c8742e', '#b0602a', '#e8a05a']), r.range(0.2, 0.5));
  // herb powder caught on the face, flung into pale trails
  for (let i = 0; i < 56 * dens; i++) {
    const y = r.chance(0.5) ? r.range(40, 170) : r.range(170, 560);
    mark(y, r.range(16, 96), r.range(0.8, 2.8), r.pick(['#fbe6c0', '#f2d8ac', '#fff2da']), r.range(0.28, 0.72));
  }
  // … and more of them, longer and finer, in the shoulder just under the ground rim
  for (let i = 0; i < 36 * dens; i++) mark(r.range(30, 130), r.range(40, 170), r.range(0.8, 2.2), r.pick(['#fbe6c0', '#f6d6a4', '#f0b874', '#e8a05a']), r.range(0.3, 0.7));
  // hairline glints on the ground rim
  for (let i = 0; i < 40 * dens; i++) mark(r.range(5, 27), r.range(30, 150), r.range(0.7, 1.6), r.pick(['#fff4de', '#ffe2ba', '#8a4a22', '#6a3216']), r.range(0.22, 0.5));
}

function buildFaceStrip(M) {
  const { SW, SH } = M;
  const nA = L.makeNoise('s15tcm-a'), nB = L.makeNoise('s15tcm-b'), nC = L.makeNoise('s15tcm-c');
  // three materials, each a ramp in ONE hue family (clean colour: texture is value/saturation, not complementary speckle)
  const RUST = lut([[0, '#1c0c06'], [0.2, '#4a2010'], [0.42, '#8a4a22'], [0.64, '#c8742e'], [0.84, '#e39a52'], [1, '#f4c088']]);   // rusted as-cast face
  const PALE = lut([[0, '#5e3418'], [0.25, '#a66a3a'], [0.5, '#d49a64'], [0.72, '#e9c094'], [0.9, '#f6dab6'], [1, '#fff0d8']]);   // burnished + dusted with powder
  const IRON = lut([[0, '#0c0605'], [0.35, '#2a140b'], [0.7, '#5a3018'], [1, '#8a5630']]);                                         // bare dark iron
  const BEV = lut([[0, '#6a3a1a'], [0.3, '#b87238'], [0.55, '#e0a466'], [0.78, '#f2cc98'], [1, '#fff0d6']]);                        // the ground rim: warm, bright
  const img = new ImageData(SW, SH), d = img.data;
  for (let j = 0; j < SH; j++) {
    const v = j + 0.5;
    const band = Math.exp(-Math.pow((v - 225) / 112, 2));          // the burnished band rubbed by the trough
    const deep = sstep(380, 650, v);                               // toward the hub
    const under = Math.exp(-Math.pow((v - 70) / 30, 2));           // the as-cast shoulder just under the ground rim
    const biasA = 0.7 * band - 0.27 - 0.08 * deep;
    const biasD = 0.1 * under + 0.15 * deep - 0.32 * band - 0.2;
    const tv = 0.04 * band + 0.03 * under - 0.07 * deep;
    for (let i = 0; i < SW; i++) {
      const u = (i + 0.5 - SW / 2) * SU;
      const vv = v + (4 + 7 * deep) * nC.n2(u / 760 + 5, v / 210);                                          // the smears wander a little: nothing is ruler-straight
      const wu = u + 240 * nC.n2(u / 1700 + 3, v / 420 - 8), wv = v + 46 * nC.n2(u / 1300 - 14, v / 300 + 21);
      const P = 0.76 * nA.n2(wu / 1250, wv / 320) + 0.24 * nA.n2(wu / 560 + 40, wv / 150 - 7);               // where the pale powder / polish sits (big patches)
      const Q = 0.6 * nB.n2(wu / 1400 + 9, wv / 250 + 33) + 0.4 * nB.n2(wu / 600 - 21, wv / 110 + 5);         // where the bare iron shows
      // "bristles": finite smears a few hundred px long, 2–12 px thick — they tear the patch edges into dry-brush fingers
      const f1 = nA.n2(u / 430 + 71, vv / 13), f2 = nB.n2(u / 260 - 18, vv / 5.6 + 50), f3 = nA.n2(u / 150 - 55, vv / 2.5 + 9);
      const g1 = nB.n2(u / 520 + 7, vv / 15 - 30), g2 = nA.n2(u / 340 + 23, vv / 5.6 + 77);
      const F = 0.42 * f1 + 0.4 * f2 + 0.18 * f3, G = 0.55 * g1 + 0.45 * g2;
      const B = nC.n2(u / 900 - 31, vv / 38 + 13), lo = nC.n2(u / 1000 + 50, v / 190 - 40);
      const A = sstep(-0.24, 0.3, P + biasA + 0.38 * F + 0.1 * B);
      const D = 0.72 * sstep(0.18, 0.5, Q + biasD + 0.36 * G) * (1 - 0.6 * A);
      let tr = 0.57 + tv + 0.14 * F + 0.11 * B + 0.08 * lo;
      let tp = 0.7 + tv + 0.075 * F + 0.06 * B + 0.08 * lo;
      let ti = 0.55 + 0.3 * G + 0.1 * B;
      tr = tr < 0 ? 0 : tr > 1 ? 1 : tr; tp = tp < 0 ? 0 : tp > 1 ? 1 : tp; ti = ti < 0 ? 0 : ti > 1 ? 1 : ti;
      const a3 = ((tr * 511) | 0) * 3, b3 = ((tp * 511) | 0) * 3, c3 = ((ti * 511) | 0) * 3;
      let R = RUST[a3] + (PALE[b3] - RUST[a3]) * A, Gc = RUST[a3 + 1] + (PALE[b3 + 1] - RUST[a3 + 1]) * A, Bc = RUST[a3 + 2] + (PALE[b3 + 2] - RUST[a3 + 2]) * A;
      R += (IRON[c3] - R) * D; Gc += (IRON[c3 + 1] - Gc) * D; Bc += (IRON[c3 + 2] - Bc) * D;
      // the ground rim (刃口): worn bright, streaky, its lower limit torn into the face (no ruled line)
      if (v < 64) {
        const vb = 26 + 7 * nC.n2(u / 620 + 90, 3.3);
        const bev = (1 - sstep(vb - 12, vb + 12, v + 13 * F)) * (0.72 + 0.28 * sstep(-0.5, 0.3, lo + 0.5 * B));
        if (bev > 0) {
          let tb = 0.66 + 0.13 * f3 + 0.15 * f2 + 0.07 * B + 0.14 * (1 - sstep(1.5, 6, v));
          tb = tb < 0 ? 0 : tb > 1 ? 1 : tb;
          const e3 = ((tb * 511) | 0) * 3;
          R += (BEV[e3] - R) * bev; Gc += (BEV[e3 + 1] - Gc) * bev; Bc += (BEV[e3 + 2] - Bc) * bev;
        }
      }
      const o = (j * SW + i) * 4;
      d[o] = R; d[o + 1] = Gc; d[o + 2] = Bc; d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(SW, SH), g = c.getContext('2d', { willReadFrequently: true });
  g.putImageData(img, 0, 0);
  paintStreaks(g, SW, SH, 's15tcm-marks', 1, false);
  // depth of field: the plane of focus is the rim; toward the hub the smears go soft
  const soft = L.makeCanvas(SW, SH), sg = soft.getContext('2d');
  sg.filter = 'blur(5px)'; sg.drawImage(c, 0, 0); sg.filter = 'none';
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.linear(sg, 0, 0, 0, SH, [[0, 'rgba(0,0,0,0)'], [330 / SH, 'rgba(0,0,0,0)'], [620 / SH, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']]);
  sg.fillRect(0, 0, SW, SH);
  g.drawImage(soft, 0, 0);
  return g.getImageData(0, 0, SW, SH);
}

/** a second, sparser sheet of marks on transparent ground: it turns faster than the face, so the blur shimmers */
function buildOverStrip(M) {
  const { SW, SH } = M;
  const c = L.makeCanvas(SW, SH), g = c.getContext('2d', { willReadFrequently: true });
  paintStreaks(g, SW, SH, 's15tcm-over', 0.4, true);
  return g.getImageData(0, 0, SW, SH);
}

// ───────────────────────── fixed light ─────────────────────────
/** multiply layer: one soft key from the upper left; the face stays ONE lit mass and only eases off toward the sides and the hub */
function buildShade(env) {
  const a = env.arc, Y0 = Math.floor(a.crestY) - 2;
  const c = L.makeCanvas(W, H - Y0), g = c.getContext('2d');
  g.translate(0, -Y0);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.save(); a.clipBelow(g, 0);
  g.fillStyle = L.linear(g, 0, 0, W, 0, [[0, '#c69a84'], [0.2, '#e6c8b4'], [0.42, '#ffffff'], [0.58, '#fbeee4'], [0.8, '#dcb8a2'], [1, '#bc8e78']]);
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 640, a.R - 300, [[0, '#b08670'], [1, '#ffffff']]);
  g.fillRect(0, 0, W, H);
  g.restore();
  return c;
}
/** screen layer: the matte sheen where the key crosses the burnished band — broad and low, never a glow */
function buildSheen(env) {
  const a = env.arc, Y0 = Math.floor(a.crestY) - 2;
  const c = L.makeCanvas(W, H - Y0), g = c.getContext('2d');
  g.translate(0, -Y0);
  g.save(); a.clipBelow(g, 0);
  a.at(g, -0.07, -215, () => {
    g.scale(4.4, 1);
    g.fillStyle = L.radial(g, 0, 0, 0, 170, [[0, 'rgba(255,214,160,0.2)'], [0.5, 'rgba(255,196,136,0.08)'], [1, 'rgba(255,190,130,0)']]);
    g.fillRect(-180, -180, 360, 360);
  });
  g.restore();
  return c;
}

// ───────────────────────── rim light ─────────────────────────
/** the violet → cold-blue edge light, pre-rendered: soft, uneven along its length, feathered upward — light on an edge, not a neon tube */
function buildRim(env) {
  const a = env.arc;
  const Y0 = Math.floor(a.crestY) - 110, RH = Math.ceil(a.yAt(-RPX)) + 70 - Y0, RW = W + RPX * 2;
  const c = L.makeCanvas(RW, RH), g = c.getContext('2d');
  g.translate(RPX, -Y0);
  const grad = (al, c1 = '#8a5fe6', c2 = '#946cf0') => L.linear(g, 0, 0, W, 0, [
    [0.02, L.rgba(VIOLET, 0)], [0.14, L.rgba(VIOLET, 0.3 * al)], [0.33, L.rgba(c1, al)], [0.52, L.rgba(c2, al)],
    [0.66, L.rgba('#4f8fe2', 0.9 * al)], [0.8, L.rgba(BLUE, 0.55 * al)], [0.93, L.rgba(BLUE, 0.12 * al)], [0.99, L.rgba(BLUE, 0)]]);
  // a soft band of light sitting on the edge, spilling a little onto the ground rim below it (one smooth falloff, no steps)
  const IN = 30, OUT = 50, t = (dr) => (dr + IN) / (IN + OUT);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - IN, a.R + OUT, [[0, 'rgba(0,0,0,0)'], [t(-16), 'rgba(0,0,0,0.07)'], [t(-6), 'rgba(0,0,0,0.22)'], [t(-1), 'rgba(0,0,0,0.44)'],
    [t(2.5), 'rgba(0,0,0,0.7)'], [t(7), 'rgba(0,0,0,0.6)'], [t(13), 'rgba(0,0,0,0.42)'], [t(22), 'rgba(0,0,0,0.22)'], [t(34), 'rgba(0,0,0,0.08)'], [1, 'rgba(0,0,0,0)']]);
  a.pathBand(g, OUT, -IN); g.fill();
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = grad(1); g.fillRect(-RPX, Y0, RW, RH);
  g.globalCompositeOperation = 'source-over';
  // the lit edge itself: thin, pale lilac, well under white
  g.strokeStyle = grad(0.45, '#b79cff', '#bea6ff'); g.lineWidth = 2; a.stroke(g, 0.8);
  // uneven along its length (columns of slow noise), so it reads as light catching a worn edge
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(L.noiseTex(RW, RH, { seed: 's15tcm-rimvar', scale: 190, sx: 1, sy: 60, octaves: 3, contrast: 1.4, res: 0.25,
    ramp: [[0, 'rgba(0,0,0,0.52)'], [0.45, 'rgba(0,0,0,0.82)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
  // fine upright wisps feathering off the edge (clumped; nothing over the crest where the tagline sits)
  const w = L.makeCanvas(RW, RH), wg = w.getContext('2d');
  wg.drawImage(L.noiseTex(RW, RH, { seed: 's15tcm-wisp', scale: 2.6, sx: 1, sy: 30, octaves: 2, contrast: 2.4, res: 1,
    ramp: [[0, 'rgba(140,110,240,0)'], [0.55, 'rgba(140,110,240,0)'], [1, 'rgba(160,132,250,0.26)']] }), 0, 0);
  wg.globalCompositeOperation = 'destination-in';
  wg.drawImage(L.noiseTex(RW, RH, { seed: 's15tcm-wispclump', scale: 150, sx: 1, sy: 60, octaves: 2, contrast: 2.2, res: 0.25,
    ramp: [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0.15)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
  wg.translate(RPX, -Y0);
  wg.fillStyle = L.radial(wg, a.cx, a.cy, a.R - 2, a.R + 40, [[0, 'rgba(0,0,0,0)'], [0.05, 'rgba(0,0,0,1)'], [0.3, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
  wg.fillRect(-RPX, Y0, RW, RH);
  wg.fillStyle = L.linear(wg, 0, 0, W, 0, [[0.03, 'rgba(0,0,0,0)'], [0.2, 'rgba(0,0,0,0.9)'], [0.36, 'rgba(0,0,0,0.45)'], [0.5, 'rgba(0,0,0,0.25)'], [0.7, 'rgba(0,0,0,0.4)'], [0.97, 'rgba(0,0,0,0)']]);
  wg.fillRect(-RPX, Y0, RW, RH);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(w, 0, 0);
  return { c, Y0 };
}

// ───────────────────────── herb dust ─────────────────────────
/** a plume of powder thrown off the rim, drawn out by the exposure into fine upright streaks (bright at the foot, lilac at the tips) */
function buildPlume() {
  const PW = 620, PH = 330, ox = 320, oy = 306;
  const nz = L.makeNoise('s15tcm-plume');
  const img = new ImageData(PW, PH), d = img.data;
  for (let i = 0; i < PW; i++) {
    const x = i - ox;
    const core = Math.exp(-Math.pow(x / 88, 2)), skirt = 0.3 * Math.exp(-Math.pow((x + 28) / 190, 2));     // a bright core and a wide dim skirt
    const env = Math.min(1, core + skirt);
    const br = 0.5 + 0.5 * (0.55 * nz.n2(i / 2.6, 1.7) + 0.45 * nz.n2(i / 6.5, 3.9));                       // bristle to bristle
    const cl = 0.5 + 0.5 * nz.n2(i / 15, 9.1), cl2 = 0.5 + 0.5 * nz.n2(i / 52, 4.4);                       // clumps
    const top = 0.5 + 0.5 * (0.6 * nz.n2(i / 3.4, 5.3) + 0.4 * nz.n2(i / 9, 8.8));
    const hgt = 205 * (core + 0.5 * skirt) * (0.42 + 0.58 * Math.pow(top, 1.15)) * (0.56 + 0.44 * cl) * (0.66 + 0.34 * cl2) + 4;
    const colA = env * (0.42 + 0.58 * br) * (0.55 + 0.45 * cl);
    for (let j = 0; j < PH; j++) {
      const y = oy - j;                                             // height above the rim
      if (y < -2 || y > hgt) continue;
      const k = y < 0 ? 1 : 1 - y / hgt;
      const al = colA * Math.pow(k, 1.5) * (0.82 + 0.18 * nz.n2(i / 2.6, j / 30));
      const w = Math.pow(k, 0.9);                                   // pale at the foot → lilac toward the tips
      const o = (j * PW + i) * 4;
      d[o] = 170 + (255 - 170) * w; d[o + 1] = 146 + (240 - 146) * w; d[o + 2] = 246 + (222 - 246) * w; d[o + 3] = 255 * Math.min(1, al * 1.2);
    }
  }
  const raw = L.makeCanvas(PW, PH); raw.getContext('2d').putImageData(img, 0, 0);
  const c = L.makeCanvas(PW, PH), g = c.getContext('2d');
  // the powder lying along the rim where it lifts off: a low bright smear
  g.save(); g.translate(ox, oy - 3); g.scale(1, 0.085);
  g.fillStyle = L.radial(g, 0, 0, 0, 160, [[0, 'rgba(255,240,220,0.85)'], [0.4, 'rgba(240,220,236,0.4)'], [1, 'rgba(180,150,255,0)']]);
  g.fillRect(-170, -170, 340, 340);
  g.restore();
  g.save(); g.translate(ox, oy - 14); g.scale(2.3, 1);
  g.fillStyle = L.radial(g, 0, 0, 0, 62, [[0, 'rgba(255,232,206,0.2)'], [0.45, 'rgba(190,160,255,0.09)'], [1, 'rgba(150,130,255,0)']]);
  g.fillRect(-70, -70, 140, 140);
  g.restore();
  g.globalCompositeOperation = 'lighter';
  g.filter = 'blur(1px)'; g.drawImage(raw, 0, 0);
  g.filter = 'blur(8px)'; g.globalAlpha = 0.6; g.drawImage(raw, 0, 0);
  g.filter = 'none'; g.globalAlpha = 1;
  return { c, ox, oy };
}

// ───────────────────────── background ─────────────────────────
function buildBack(env) {
  const a = env.arc;
  const BH = Math.ceil(a.yAt(0)) + 30;
  const c = L.makeCanvas(W, BH), g = c.getContext('2d');
  g.fillStyle = L.linear(g, 0, 0, 0, BH, [[0, '#060404'], [0.38, '#0b0706'], [0.7, '#150c08'], [1, '#1b0f09']]);
  g.fillRect(0, 0, W, BH);
  // the wheel is rolling sideways: its silhouette smears along its travel → nothing above the level crest, a soft brown bleed above the falling shoulders
  const gh = L.makeCanvas(W, BH), gg = gh.getContext('2d');
  for (let k = 1; k <= 14; k++) {
    const s = k * 13, al = 0.05 * (1 - k / 15);
    for (const sg of [-1, 1]) {
      gg.save(); gg.translate(sg * s, 0); gg.globalAlpha = al;
      gg.fillStyle = L.radial(gg, a.cx, a.cy, a.R - 220, a.R, [[0, '#2a1108'], [0.7, '#6b3a1c'], [1, '#a2643a']]);
      a.pathBelow(gg, 0); gg.fill(); gg.restore();
    }
  }
  g.filter = 'blur(2.5px)'; g.drawImage(gh, 0, 0); g.filter = 'none';
  // a breath of warm bounce hugging the rim
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 4, a.R + 190, [[0, 'rgba(96,48,22,0.3)'], [0.3, 'rgba(62,30,14,0.12)'], [1, 'rgba(40,16,8,0)']]);
  g.fillRect(0, 0, W, BH);
  return c;
}
/** the faintest horizontal drag marks in the dark (drifts sideways); kept quieter still where the tagline sits */
function buildDrag(env) {
  const a = env.arc;
  const BW = W + BX * 2, BH = Math.ceil(a.yAt(0)) + 30;
  const c = L.makeCanvas(BW, BH), g = c.getContext('2d');
  g.drawImage(L.noiseTex(BW, BH, { seed: 's15tcm-drag1', scale: 7, sx: 90, sy: 1, octaves: 3, contrast: 1.7, res: 0.5,
    ramp: [[0, 'rgba(0,0,0,0.4)'], [0.42, 'rgba(20,10,6,0)'], [0.7, 'rgba(80,44,26,0)'], [1, 'rgba(118,70,42,0.09)']] }), 0, 0);
  g.drawImage(L.noiseTex(BW, BH, { seed: 's15tcm-drag2', scale: 44, sx: 30, sy: 1, octaves: 3, contrast: 1.5, res: 0.25,
    ramp: [[0, 'rgba(0,0,0,0.3)'], [0.5, 'rgba(40,20,11,0)'], [1, 'rgba(100,58,34,0.09)']] }), 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.save(); g.translate(BX + a.cx, a.crestY - 140); g.scale(2.1, 1);
  g.fillStyle = L.radial(g, 0, 0, 60, 250, [[0, 'rgba(0,0,0,0.72)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(-300, -300, 600, 600);
  g.restore();
  // darker toward the top
  g.fillStyle = L.linear(g, 0, 0, 0, BH, [[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, 0, BW, BH);
  return c;
}

function blitLow(ctx, env, M, layer, rot, alpha = 1) {
  const a = env.arc;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
  ctx.drawImage(layer, M.X0, M.Y0);
  ctx.restore();
}

export default {
  name: '药碾轮',
  tone: 'light',
  init(env) {
    const M = buildMap(env);
    const face = warp(M, buildFaceStrip(M), false);
    const over = warp(M, buildOverStrip(M), true);
    // depth of field across the frame: a pre-softened copy of the face is mixed in toward the left and right edges (see draw).
    // Only the two side strips are composited each frame, so the cost stays small.
    const soft = L.blurred(face, 5);
    const sides = [[0, Math.ceil(W * 0.27), 1], [Math.floor(W * 0.74), W, 0]].map(([x0, x1, leftSide]) => {
      const y0 = Math.floor(env.arc.yAt(leftSide ? x1 : x0)) - 10, w = x1 - x0, h = H - y0;
      const mask = L.makeCanvas(w, h), mg = mask.getContext('2d');
      mg.fillStyle = L.linear(mg, 0, 0, w, 0, leftSide ? [[0, 'rgba(0,0,0,1)'], [0.37, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']] : [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,1)']]);
      mg.fillRect(0, 0, w, h);
      return { x0, y0, mask, tmp: L.makeCanvas(w, h) };
    });
    S = { M: { X0: M.X0, Y0: M.Y0 }, face, over, soft, sides, shade: buildShade(env), sheen: buildSheen(env), rim: buildRim(env), plume: buildPlume(), back: buildBack(env), drag: buildDrag(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // ── the dark behind ──
    ctx.fillStyle = '#1b0f09'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(S.back, 0, 0);
    ctx.drawImage(S.drag, -BX + L.lerp(34, -34, p), 0);

    // ── the wheel: the smears stream to the left, the two sheets at different speeds ──
    const flow = L.lerp(0.5, -0.5, p);
    blitLow(ctx, env, S.M, S.face, flow * 0.08);
    blitLow(ctx, env, S.M, S.over, flow * 0.15, 0.85);
    for (const sd of S.sides) {
      const tg = sd.tmp.getContext('2d');
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'copy'; tg.drawImage(sd.mask, 0, 0);
      tg.globalCompositeOperation = 'source-in';
      tg.translate(-sd.x0, -sd.y0); blitLow(tg, env, S.M, S.soft, flow * 0.08);
      ctx.drawImage(sd.tmp, sd.x0, sd.y0);
    }
    const ly = Math.floor(a.crestY) - 2;
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(S.shade, 0, ly);
    ctx.globalCompositeOperation = 'screen'; ctx.drawImage(S.sheen, L.lerp(14, -14, p), ly);
    ctx.globalCompositeOperation = 'source-over';

    // ── herb dust: a plume kicked up off the rim on the left, drawn upright by the exposure; it lifts a little ──
    const o0 = a.pt(DUST_TH, 0);
    ctx.save();
    a.clipAbove(ctx, -2.5);
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(o0.x, o0.y);
    ctx.transform(1, Math.tan(DUST_TH) * 0.9, -0.1 - 0.05 * (p - 0.5), 0.9 + 0.2 * p, 0, 0);   // foot follows the slope of the rim, streaks stay near-upright
    ctx.globalAlpha = 0.84 + 0.16 * Math.sin(p * Math.PI);
    ctx.drawImage(S.plume.c, -S.plume.ox, -S.plume.oy);
    ctx.restore();

    // ── rim light: soft violet at the crest, turning cold blue to the right, dying away to both sides; it breathes ──
    const br = 0.8 + 0.2 * Math.sin(p * Math.PI);
    ctx.save();
    ctx.translate(a.cx, a.cy); ctx.rotate(L.lerp(-0.006, 0.006, p)); ctx.translate(-a.cx, -a.cy);
    ctx.globalAlpha = 0.8 * br; ctx.drawImage(S.rim.c, -RPX, S.rim.Y0);                          // laid on as a matte band so it stays violet over the bright iron
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.45 * br; ctx.drawImage(S.rim.c, -RPX, S.rim.Y0);
    ctx.restore();

    L.vignette(ctx, { strength: 0.2 });
  },
};
