// s26 — 蜡笔拓钱. A sheet of rough light-blue paper laid over the back of a cash coin and rubbed with the side of an
// ultramarine crayon, the way children take rubbings of coins. The arc is the coin's outer rim (外郭) coming up
// through the paper; below it, across the blank field (肉), a slim crescent (月纹) and one straight edge of the
// square hole's inner rim (内郭). No inscription is rubbed.
//
// The rubbing is simulated per pixel in init():
//   tooth    – the paper's grain as a percentile field U (which pixels are peaks), dragged a little along the arc so the
//              wax breaks into flakes rather than dots
//   contact  – how firmly the paper is backed at each pixel: raised parts of the coin ≈ 1, the sunken field barely,
//              a "tent" gap right beside every raised edge, nothing off the coin or over the hole
//   pressure – the sum of a few dozen broad crayon pulls, each with the streaky footprint of a worn crayon side
// A pixel takes wax when its tooth percentile clears 1 − coverage(pressure × contact), so colour only ever sits on the
// peaks of the grain: flakes, dry gaps and all. Strokes added during the shot are small patches computed the same way.
// Light (soft daylight from the upper left, the sheet falling into deeper blue toward the corners, the faint swell of
// the coin under the paper) is shaded per pixel too; a shallow depth of field is mixed in at the end.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 48;
const LW = W + PAD * 2, LH = H + PAD * 2, N = LW * LH;
let S = null;

const RIM = 124;                 // width of the outer rim band, px
const FIELD = 0.15;              // contact in the sunken field (raised = 1)
const COVMAX = 0.97, SOFT = 0.085, KP = 1.9;
const MID = [34, 90, 210];       // 群青
const DEEP = [25, 66, 176];      // 浓处

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const sq = (v) => v * v;
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** where the coin's relief sits, all derived from the shared arc */
function geometry(a) {
  const mTop = a.crestY + 236, mT = 60, mL = 500, mRa = 1480;        // crescent: top of its back, thickness, half-length, radius of its back
  const sagA = mRa - Math.sqrt(mRa * mRa - mL * mL), sagB = sagA - mT;
  const mRb = (mL * mL + sagB * sagB) / (2 * sagB);                  // radius of its belly, so that both curves meet at the horns
  const mRot = -0.02;                                                // it was never cut quite level in the mould
  return { mTop, mT, mL, mRa, mRb, mcyA: mTop + mRa, mcyB: mTop + mT + mRb, mEx: 46, mPx: a.cx - 30, mPy: mTop + 40,
    mCos: Math.cos(mRot), mSin: Math.sin(mRot),
    hTop: a.crestY + 432, hW: 50, hHalf: 650, hRc: 16 };              // inner rim: top edge, width, half-side of its outer square
}

// ───────────────────────── paper ─────────────────────────
function buildPaper(a) {
  const c = L.makeCanvas(LW, LH), g = c.getContext('2d');
  g.fillStyle = 'rgb(160,191,237)'; g.fillRect(0, 0, LW, LH);
  // pulp: broad drifts and a finer mottling, all in the same blue
  g.drawImage(L.noiseTex(LW, LH, { seed: 's26cloud', scale: 360, octaves: 3, res: 0.125,
    ramp: [[0, 'rgba(112,154,222,0.17)'], [0.5, 'rgba(160,191,237,0)'], [1, 'rgba(214,230,251,0.17)']] }), 0, 0);
  g.drawImage(L.noiseTex(LW, LH, { seed: 's26cloud2', scale: 18, octaves: 3, res: 0.5, contrast: 1.35,
    ramp: [[0, 'rgba(106,148,218,0.2)'], [0.5, 'rgba(160,191,237,0)'], [1, 'rgba(224,237,253,0.17)']] }), 0, 0);
  const r = L.rng('s26paper');
  const inText = (x, y, m) => x > 600 - m + PAD && x < 1320 + m + PAD && y > a.crestY - 292 - m + PAD && y < a.crestY + 6 + PAD;
  // fibres: short dark hairs pressed into the sheet, a few pale ones
  g.lineCap = 'round';
  for (let i = 0; i < 430; i++) {
    const x = r() * LW, y = r() * LH, len = 5 + Math.pow(r(), 2.2) * 40, ang = r() * Math.PI, bend = r.range(-0.6, 0.6) * len * 0.5;
    const dark = r.chance(0.84), calm = inText(x, y, 16) ? 0.55 : 1;
    g.strokeStyle = dark ? L.rgba(L.mix('#6f8fc4', '#2f4f9a', r() * 0.8), r.range(0.45, 0.95) * calm) : L.rgba('#eaf2fe', r.range(0.35, 0.75) * calm);
    g.lineWidth = r.range(0.7, 1.5);
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo((x + ex) / 2 - Math.sin(ang) * bend, (y + ey) / 2 + Math.cos(ang) * bend, ex, ey);
    g.stroke();
  }
  // specks of darker pulp, a few flecks of white
  for (let i = 0; i < 6200; i++) {
    const x = r() * LW, y = r() * LH, rad = 0.5 + Math.pow(r(), 3) * 1.4;
    g.fillStyle = r.chance(0.76) ? L.rgba(L.mix('#6f8fc4', '#3a5cab', r() * 0.7), r.range(0.3, 0.9)) : L.rgba('#f1f7ff', r.range(0.3, 0.8));
    g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
  }
  for (let i = 0; i < 96; i++) {
    const x = r() * LW, y = r() * LH, rad = r.range(1.6, 3.4) * (r.chance(0.18) ? 1.5 : 1), white = r.chance(0.2);
    if (inText(x, y, 12)) continue;
    g.fillStyle = white ? L.rgba('#f4f9ff', r.range(0.6, 0.9)) : L.rgba(L.mix('#6f8fc4', '#1f48a8', r.range(0.2, 0.8)), r.range(0.65, 0.95));
    g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.65, 1), r() * Math.PI, 0, L.TAU); g.fill();
  }
  return g.getImageData(0, 0, LW, LH).data;
}

// ───────────────────────── crayon strokes ─────────────────────────
/** the uneven face of a worn crayon: pressure across the width of a stroke (each step prints as one long track) */
function tipLut(r, w) {
  const K = Math.max(5, Math.round(w / 8)), a = new Float32Array(K + 1);
  let v = r.range(0.8, 1.1);
  for (let i = 0; i <= K; i++) { v = L.clamp(v + r.range(-0.32, 0.32), 0.42, 1.25); a[i] = r.chance(0.17) ? v * 0.2 : v; }
  return a;
}

/** pressure footprint of one stroke (frame coords in, layer-pixel bbox + Float32 buffer out) */
function footprint(st) {
  const ax = st.x0 + PAD, ay = st.y0 + PAD, bx = st.x1 + PAD, by = st.y1 + PAD;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const w = st.w, hw = w / 2, bow = st.bow || 0, m = hw + Math.abs(bow) + 2;
  const X0 = Math.max(0, Math.floor(Math.min(ax, bx) - m)), X1 = Math.min(LW - 1, Math.ceil(Math.max(ax, bx) + m));
  const Y0 = Math.max(0, Math.floor(Math.min(ay, by) - m)), Y1 = Math.min(LH - 1, Math.ceil(Math.max(ay, by) + m));
  if (X1 < X0 || Y1 < Y0) return null;
  const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, d = new Float32Array(bw * bh);
  const lut = st.lut, K = lut.length - 1;
  const tailLen = Math.max(hw * 0.5, (st.tail || 0) * len), ph = st.ph || 0;
  for (let yy = 0; yy < bh; yy++) {
    const py = Y0 + yy - ay;
    for (let xx = 0; xx < bw; xx++) {
      const px = X0 + xx - ax;
      const s = px * ux + py * uy;
      if (s < -hw || s > len + hw) continue;
      const q = (2 * s) / len - 1;
      const t = -px * uy + py * ux + bow * (1 - q * q);
      const at = t < 0 ? -t : t;
      if (at >= hw) continue;
      const f = (t / w + 0.5) * K, fi = f | 0;
      let v = lut[fi] + (lut[fi + 1 > K ? K : fi + 1] - lut[fi]) * (f - fi);
      v *= (0.28 + 0.72 * sstep(hw, hw * 0.3, at)) * sstep(hw, hw - 5, at);                // a loaded core, thin grainy shoulders
      v *= sstep(-hw * 0.7, hw * 0.6, s) * (1 - sstep(len - tailLen, len + hw * 0.7, s));    // touch-down and lift-off
      v *= 0.84 + 0.12 * Math.sin(s * 0.031 + ph) + 0.08 * Math.sin(s * 0.083 + 2.1 * ph);   // the hand never presses evenly
      d[yy * bw + xx] = st.press * v;
    }
  }
  return { X0, Y0, bw, bh, d };
}

function buildStrokes(a, G) {
  const list = [], r = L.rng('s26strokes'), R = a.R;
  const push = (x0, y0, x1, y1, o) => {
    const fwd = r.chance(0.5), w = o.w, bow = (o.bow || 0) + r.range(-4, 4);
    list.push({ x0: fwd ? x0 : x1, y0: fwd ? y0 : y1, x1: fwd ? x1 : x0, y1: fwd ? y1 : y0, w, press: o.press, bow: fwd ? bow : -bow,
      lut: tipLut(r, w), tail: o.tail === undefined ? r.range(0.06, 0.32) : o.tail, ph: r.range(0, 6.28), frame: o.frame || 0 });
  };
  const xOf = (th) => a.cx + R * Math.sin(th), thOf = (x) => Math.asin((x - a.cx) / R);
  // a pull that follows the rim: centred at theta `th`, `dr` inside the arc; `tilt` > 0 lets its right end drift outward
  const rimPull = (o) => {
    const h = o.len / 2 / R, off = (o.len / 2) * Math.sin(o.tilt || 0);
    const A = a.pt(o.th - h, o.dr - off), B = a.pt(o.th + h, o.dr + off);
    push(A.x, A.y, B.x, B.y, { ...o, bow: (o.len * o.len) / (8 * R) });
  };
  const sEnd = a.span(PAD + 140);
  const fade = (x) => L.lerp(1, 0.66, sstep(430, 1000, Math.abs(x - 985)));          // 两端渐渐涂淡

  // ── outer rim ──
  // along the edge itself: one unbroken chain of overlapping pulls, the crayon riding half off the coin
  for (let th = -sEnd; th < sEnd;) {
    const len = r.range(420, 780), h = len / R / 2, c = th + h;
    rimPull({ th: c, dr: -r.range(4, 14), len, tilt: r.range(-0.012, 0.012), w: r.range(70, 88), press: r.range(1.12, 1.45) * fade(xOf(c)), tail: r.range(0.05, 0.2) });
    th += 2 * h * r.range(0.55, 0.75);
  }
  // through the middle of the band: looser, with dry stretches (one of them is filled while we watch)
  for (let th = -sEnd; th < sEnd;) {
    const len = r.range(300, 640), h = len / R / 2, c = th + h, x = xOf(c);
    if (!(r.chance(0.14) || (x > 1150 && x < 1390)))
      rimPull({ th: c, dr: -r.range(50, 72), len, tilt: r.range(-0.03, 0.03), w: r.range(58, 78), press: r.range(0.85, 1.3) * fade(x) });
    th += 2 * h * r.range(0.6, 0.95);
  }
  // along the inner side: fewer still, wandering off into the field
  for (let th = -sEnd; th < sEnd;) {
    const len = r.range(240, 520), h = len / R / 2, c = th + h, x = xOf(c);
    if (!(r.chance(0.3) || (x > 590 && x < 830) || (x > 1170 && x < 1380)))
      rimPull({ th: c, dr: -r.range(90, 112), len, tilt: r.range(-0.05, 0.05), w: r.range(50, 70), press: r.range(0.7, 1.2) * fade(x) });
    th += 2 * h * r.range(0.65, 1.05);
  }
  // back-and-forth scribble, slanted the way a right hand slants it: its lower ends fray the band's inner edge
  const scribble = (x0, x1, step, o = {}) => {
    for (let x = x0; x < x1; x += step * r.range(0.7, 1.3))
      rimPull({ th: thOf(x), dr: -r.range(68, 96), len: r.range(250, 370), tilt: r.range(0.3, 0.46), w: r.range(40, 56), press: r.range(0.7, 1.05) * (o.press || 1), frame: o.frame });
  };
  scribble(470, 860, 58); scribble(1130, 1640, 62); scribble(60, 300, 80, { press: 0.6 });
  // two pulls that left the rim altogether and trail across the field
  rimPull({ th: thOf(1450), dr: -150, len: 640, tilt: -0.25, w: 62, press: 1.25, tail: 0.4 });
  rimPull({ th: thOf(470), dr: -146, len: 540, tilt: 0.24, w: 58, press: 1.1, tail: 0.4 });

  // ── crescent ──
  const moonPt = (X) => {
    const yB = G.mcyA - Math.sqrt(G.mRa * G.mRa - X * X);
    const e = X - G.mEx, yL = G.mcyB - Math.sqrt(G.mRb * G.mRb - e * e);
    const lx = a.cx + X - G.mPx, ly = (yL > yB ? (yB + yL) / 2 : yB) - G.mPy;
    return [G.mPx + lx * G.mCos - ly * G.mSin, G.mPy + lx * G.mSin + ly * G.mCos];
  };
  const moonPull = (X0, X1, o) => {
    const A = moonPt(X0), B = moonPt(X1), len = Math.hypot(B[0] - A[0], B[1] - A[1]), dy = o.dy || 0;
    push(A[0], A[1] + dy, B[0], B[1] + dy, { ...o, bow: (len * len) / (8 * 2200) });
  };
  moonPull(-575, 70, { w: 62, press: 1.3 });
  moonPull(-330, 300, { w: 56, press: 1.05, dy: -6 });
  moonPull(-520, -150, { w: 54, press: 0.9, dy: 9 });
  moonPull(30, 545, { w: 56, press: 0.5 });                                         // the right half is only touched in so far
  for (let X = -430; X < -40; X += r.range(60, 100)) {
    const p = moonPt(X), l = r.range(130, 190), ca = Math.cos(0.5), sa = Math.sin(0.5);
    push(p[0] - ca * l / 2, p[1] + sa * l / 2, p[0] + ca * l / 2, p[1] - sa * l / 2, { w: r.range(38, 50), press: r.range(0.6, 0.9) });
  }

  // ── inner rim of the square hole: only lightly gone over (隐约) ──
  const barPull = (X0, X1, o) => { const y = G.hTop + G.hW / 2 + (o.dy || 0); push(a.cx + X0, y + r.range(-4, 4), a.cx + X1, y + r.range(-4, 4), { ...o, bow: 0 }); };
  barPull(-590, -110, { w: 62, press: 1.0 });
  barPull(-300, 210, { w: 58, press: 0.8, dy: 4 });

  // ── strokes added while we watch (all inside the sharp part of the picture) ──
  rimPull({ th: thOf(1270), dr: -60, len: 400, tilt: 0.01, w: 78, press: 1.5, frame: 1 });
  rimPull({ th: thOf(1290), dr: -102, len: 300, tilt: -0.03, w: 62, press: 1.2, frame: 1 });
  moonPull(50, 500, { w: 60, press: 1.5, frame: 2 });
  rimPull({ th: thOf(700), dr: -98, len: 360, tilt: 0.03, w: 66, press: 1.35, frame: 2 });
  scribble(985, 1110, 60, { press: 1.3, frame: 3 });
  barPull(70, 500, { w: 60, press: 1.05, frame: 3 });
  moonPull(240, 560, { w: 54, press: 1.3, dy: 5, frame: 4 });
  rimPull({ th: thOf(880), dr: -40, len: 420, tilt: -0.015, w: 76, press: 1.3, frame: 4 });
  moonPull(-170, 320, { w: 56, press: 1.2, dy: 3, frame: 5 });
  rimPull({ th: thOf(1080), dr: -84, len: 380, tilt: 0.04, w: 68, press: 1.3, frame: 5 });
  return list;
}

/** mix `src` (a blurred copy) into `dst`, more and more with distance from the point of focus */
function dofMix(dst, src, d0, d1) {
  const m = L.makeCanvas(LW, LH), g = m.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.translate(1040 + PAD, 590 + PAD); g.scale(1150, 1500);
  const gr = g.createRadialGradient(0, 0, d0, 0, 0, d1);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(-4, -4, 8, 8);
  dst.getContext('2d').drawImage(m, 0, 0);
}

// ───────────────────────── the rubbing ─────────────────────────
function buildRubbing(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const G = geometry(a);
  const TM = [performance.now()], tick = () => TM.push(performance.now());
  const pd = buildPaper(a); tick();

  // 1) paper tooth → percentile field
  const nT = L.makeNoise('s26tooth');
  const T = new Float32Array(N), U = new Float32Array(N);
  let mn = 1e9, mx = -1e9;
  for (let yy = 0, i = 0; yy < LH; yy++) {
    const ddy = cy - (yy - PAD);
    for (let xx = 0; xx < LW; xx++, i++) {
      const ddx = xx - PAD - cx;
      const t = 0.6 * nT.n2(xx / 10.5, yy / 10.5) + 0.4 * nT.n2(xx / 23 + 31.7, yy / 23 - 17.3) + 0.14 * (hash2(xx, yy) - 0.5);
      T[i] = t;
      // the crayon travels round the coin, so the wax drags into short flakes along the arc
      const s = Math.atan2(ddx, ddy) * R, v = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      const w = t + 0.58 * nT.n2(s / 25 + 80, v / 6.6) + 0.3 * nT.n2(s / 56 - 40, v / 14 + 13) + 0.3 * nT.n2(s / 190 + 7, v / 5.4 - 21) + 0.14 * nT.n2(xx / 70 - 5.1, yy / 70 + 9.3);
      U[i] = w; if (w < mn) mn = w; if (w > mx) mx = w;
    }
  }
  const BINS = 4096, hist = new Uint32Array(BINS), sc = (BINS - 1) / (mx - mn), cdf = new Float32Array(BINS);
  for (let i = 0; i < N; i++) hist[((U[i] - mn) * sc) | 0]++;
  for (let b = 0, acc = 0; b < BINS; b++) { acc += hist[b]; cdf[b] = acc / N; }
  for (let i = 0; i < N; i++) U[i] = cdf[((U[i] - mn) * sc) | 0];
  tick();

  // 2) contact with the coin underneath, and the paper's own height (for a faint emboss)
  const nG = L.makeNoise('s26coin');
  const Cn = new Float32Array(N), Hh = new Float32Array(N);
  for (let yy = 0; yy < LH; yy++) {
    const y = yy - PAD, ddy = cy - y;
    const moonRow = y > G.mTop - 60 && y < G.mTop + 190, holeRow = y > G.hTop - 40;
    for (let xx = 0; xx < LW; xx++) {
      const x = xx - PAD, ddx = x - cx, i = yy * LW + xx;
      const dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      if (dr > 34) continue;
      const body = sstep(34, -3, dr);            // the sheet drapes from the coin's edge down to the table
      if (dr > 4) { Hh[i] = body * 0.75; continue; }
      let raised = 0, boost = 0, dE = 1e9, swell = 0;
      // outer rim
      const below = -(dr + RIM);                 // > 0 once we are under the band, in the field
      if (below < 36) {
        let ew = 0, nick = 0, es = 0;
        if (dr > -9 || below > -36) {
          const sA = Math.atan2(ddx, ddy) * R;
          if (dr > -9) { ew = nG.n2(sA / 36, 1.7) * 0.9 + nG.n2(sA / 6.5, 5.3) * 0.45; nick = 4.5 * sstep(0.6, 0.92, nG.n2(sA / 80, 9.9)); }   // small dents in an old rim
          else es = nG.n2(sA / 95, 3.3) * 13 + nG.n2(sA / 24, 8.1) * 5;
        }
        // the outer edge is a sharp step (crisp line on the arc); the inner side slopes gently into the field (soft, woolly edge)
        const inner = sstep(17, -15, below + es);
        raised = sstep(1.5, -1.5, dr + nick - ew) * inner;
        boost = 0.5 * Math.exp(-sq((dr + nick + 5) / 6));
        swell = 0.25 * sstep(4, -12, dr) * inner;
      }
      // crescent, in its own slightly tilted frame: a low rounded ridge, so its edges print soft
      if (moonRow && ddx > -640 && ddx < 620) {
        const qx = x - G.mPx, qy = y - G.mPy;
        const lx = G.mPx + qx * G.mCos + qy * G.mSin - cx, ly = G.mPy - qx * G.mSin + qy * G.mCos;
        const dm = Math.min(G.mRa - Math.hypot(lx, ly - G.mcyA), Math.hypot(lx - G.mEx, ly - G.mcyB) - G.mRb);   // > 0 inside
        if (dm > -8) {
          const ew = nG.n2(x / 44, y / 44) * 3.2 + nG.n2(x / 9 + 3, y / 9) * 1.3;
          const m = sstep(-2, 9, dm + ew);
          if (m > raised) { raised = m; boost = 0.16 * m; swell = 0.15 * m; }
          if (m < 0.02 && -dm < dE) dE = -dm;
        } else if (-dm < dE) dE = -dm;
      }
      // inner rim + hole
      let hole = 0, innerM = 0;
      if (holeRow) {
        const X = ddx < 0 ? -ddx : ddx;
        let dO = Math.min(G.hHalf - X, y - G.hTop), dH = Math.min(G.hHalf - G.hW - X, y - G.hTop - G.hW);
        { const qx = X - (G.hHalf - G.hRc), qy = G.hTop + G.hRc - y; if (qx > 0 && qy > 0) dO = G.hRc - Math.hypot(qx, qy); }   // slightly rounded outer corners
        if (dO > -8) {
          const ew = nG.n2(x / 40 + 50, y / 40) * 2.6 + nG.n2(x / 9 + 50, y / 9) * 1.1;
          hole = sstep(-2.5, 2.5, dH + ew);
          innerM = sstep(-2, 4.5, dO + ew) * (1 - hole);
          if (innerM > raised) { raised = innerM; boost = 0.12 * innerM; swell = 0.05 * innerM; } else innerM = 0;
          if (dO < 0 && -dO < dE) dE = -dO;
        } else if (-dO < dE) dE = -dO;
      }
      let c = 0;
      if (raised > 0.004) {
        const pit = sstep(0.5, 0.8, nG.n2(x / 13 + 7.3, y / 13 - 3.1));             // corrosion pits print as blanks
        c = raised * Math.max(0.05, 0.94 + 0.22 * nG.fbm(x / 80, y / 80, 2) + boost - 0.8 * pit);
        if (innerM > 0) c *= L.clamp(0.74 + 0.6 * nG.fbm(x / 150 + 9, y / 150, 2), 0.22, 1);   // the worn inner rim only half prints
      }
      if (raised < 1 && hole < 1)                                                    // the sheet sags a little into the field, unevenly
        c += (1 - raised) * (1 - hole) * FIELD * sstep(9, 30, dE) * (0.95 + 0.6 * nG.n2(x / 170 + 4.2, y / 170 - 6.6));
      Cn[i] = c;
      Hh[i] = body * (0.75 + swell - 0.02 * hole);
    }
  }

  tick();
  // 3) grain relief (Sh) and light (Lt): daylight from the upper left, deeper blue toward the corners, plus the
  //    faint emboss of the coin under the sheet — a soft edge light where the paper climbs onto the rim
  const Sh = new Float32Array(N), Lt = new Float32Array(N);
  for (let yy = 3; yy < LH - 3; yy++) {
    const y = yy - PAD;
    for (let xx = 3; xx < LW - 3; xx++) {
      const i = yy * LW + xx, x = xx - PAD;
      Sh[i] = 0.036 * (T[i + 1 + LW] - T[i - 1 - LW]);
      const hl = 0.55 * (1 - sstep(200, 1300, Math.hypot(x - 640, (y - 300) * 1.15)));
      const vg = sstep(0.62, 1.3, Math.hypot((x - 860) / 1250, (y - 420) / 800));
      Lt[i] = hl * (1 - vg) - 0.75 * vg + 2.8 * (Hh[i + 3 + 3 * LW] - Hh[i - 3 - 3 * LW]);
    }
  }

  tick();
  // 4) pressure
  const P = new Float32Array(N);
  const strokes = buildStrokes(a, G);
  const shadeInto = (i, p, out, o) => {
    const k = i * 4;
    let r = pd[k], g = pd[k + 1], b = pd[k + 2], sh = Sh[i], tone = 0.016 * T[i];
    const c = Cn[i];
    if (c > 0 && p > 0.004) {
      const pc = p * c, cov = COVMAX * (1 - Math.exp(-KP * pc)), e = U[i] - (1 - cov);
      let al = 0.5 * sstep(0.25, 0.9, cov), d = 0;        // once the peaks are loaded, a thin smear of wax reaches the valleys
      if (e > -SOFT) {
        let a2 = e >= SOFT ? 1 : (e + SOFT) / (2 * SOFT); a2 = a2 * a2 * (3 - 2 * a2);
        const thick = e > 0.35 ? 1 : e < 0 ? 0 : e / 0.35;
        d = 0.55 * thick * sstep(2.2, 5.2, pc);
        a2 *= 0.62 + 0.38 * thick;                           // thin wax at the rim of each flake lets the paper through
        al += (1 - al) * a2;
      }
      r += (MID[0] + (DEEP[0] - MID[0]) * d - r) * al;
      g += (MID[1] + (DEEP[1] - MID[1]) * d - g) * al;
      b += (MID[2] + (DEEP[2] - MID[2]) * d - b) * al;
      sh *= 1 + 2.6 * al; tone *= 1 - al;
    }
    const lv = Lt[i], m = 1 + sh + tone;
    if (lv >= 0) { r += (250 - r) * 0.16 * lv; g += (252 - g) * 0.14 * lv; b += (255 - b) * 0.1 * lv; }
    else { r *= 1 + 0.22 * lv; g *= 1 + 0.15 * lv; b *= 1 + 0.05 * lv; }
    out[o] = r * m; out[o + 1] = g * m; out[o + 2] = b * m; out[o + 3] = 255;
  };

  for (const st of strokes) {
    if (st.frame) continue;
    const f = footprint(st); if (!f) continue;
    for (let yy = 0; yy < f.bh; yy++) { const row = (f.Y0 + yy) * LW + f.X0, o = yy * f.bw; for (let xx = 0; xx < f.bw; xx++) P[row + xx] += f.d[o + xx]; }
  }
  tick();
  const img = new ImageData(LW, LH), od = img.data;
  for (let i = 0; i < N; i++) shadeInto(i, P[i], od, i * 4);
  tick();
  const raw = L.makeCanvas(LW, LH);
  raw.getContext('2d').putImageData(img, 0, 0);
  // a lens, not a scanner: take the pixel edge off everything, then let the sheet go soft away from the crest
  const base = L.blurred(raw, 0.55);
  dofMix(base, L.blurred(raw, 1.7), 0.66, 0.96);
  dofMix(base, L.blurred(raw, 3.8), 0.9, 1.22);
  base._pad = PAD;
  tick();

  // 5) the strokes that arrive during the shot: patches of exactly the pixels they change
  const patches = [];
  for (const st of strokes.filter((s) => s.frame).sort((p, q) => p.frame - q.frame)) {
    const f = footprint(st); if (!f) continue;
    const pi = new ImageData(f.bw, f.bh), q = pi.data;
    let any = false;
    for (let yy = 0; yy < f.bh; yy++) {
      const row = (f.Y0 + yy) * LW + f.X0, o = yy * f.bw;
      for (let xx = 0; xx < f.bw; xx++) {
        const dp = f.d[o + xx]; if (dp < 0.004) continue;
        const i = row + xx; P[i] += dp;
        if (Cn[i] > 0) { shadeInto(i, P[i], q, (o + xx) * 4); any = true; }
      }
    }
    if (!any) continue;
    const c = L.makeCanvas(f.bw, f.bh);
    c.getContext('2d').putImageData(pi, 0, 0);
    patches.push({ c: L.blurred(c, 0.55), x: f.X0 - PAD, y: f.Y0 - PAD, frame: st.frame });
  }
  tick();
  console.warn('s26 phases ' + TM.slice(1).map((t, i) => (t - TM[i]).toFixed(0)).join(' '));
  return { base, patches };
}

export default {
  name: '蜡笔拓钱',
  tone: 'dark',
  init(env) {
    S = buildRubbing(env);
  },
  draw(ctx, env, p) {
    const k = Math.round(p * (env.frames - 1));
    const rot = L.lerp(-0.0034, 0.0034, p);       // the sheet slides a few pixels along the arc
    L.blit(ctx, env, S.base, { rot });
    L.cam(ctx, env, { rot }, () => { for (const q of S.patches) if (q.frame <= k) ctx.drawImage(q.c, q.x, q.y); });
  },
};
