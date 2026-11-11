// s07 — 方孔圆钱规制图. A chalk working drawing of a round coin with a square hole, on Prussian-blue cyanotype paper.
// The shared arc is the OUTER EDGE of the coin (the boldest chalk line); a second concentric line 66 px inside it
// marks the width of the raised outer rim (外郭). Below: radial construction lines from the centre of the circle,
// the dash-dot centre axis, and — at the bottom of frame — the top of the square hole (穿) wrapped by the double
// line of the inner rim (内郭). The flat field between the two rims is the 肉.
// NOTE: schematic, not to scale — the field is foreshortened so the hole fits in a 16:9 close-up of the rim.
// Only the four part names are written; no dimensions, figures or dates anywhere.
//
// How the chalk is made (all in init): the sheet has ONE tooth — a band-limited height field a few pixels across.
// Every line is first drawn as chalk *pressure* (a faint full-width pass plus narrower "lanes" whose pressure drifts
// independently, because the face of a chalk stick is never flat), and the pressure is then developed against the tooth:
// chalk catches on the high points first, so heavy strokes close up into a dense core with a nibbled edge and light
// strokes break into clumps and long skips. The same tooth shades the paper and decides where the folds have rubbed
// the blue away, so chalk, paper grain and wear all agree with each other pixel for pixel.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 120, LW = W + PAD * 2, LH = H + PAD * 2;
const CHALK = '#f3f6f8', BLUE = '#1b4f8a', DEEP = '#123a69', WORN = '#3f73ab';

const RIM = 66;            // 外郭: width of the outer rim (arc → second concentric line)
const STEP = 0.09;         // angular pitch of the radial construction lines (rad)
const HOLE_TOP = 350;      // 穿: top edge of the square hole, px below the crest
const HOLE_HALF = 430;     // 穿: half-width of the hole
const NEI = 46;            // 内郭: width of the inner rim
const CREASE_X = [318, 1742], CREASE_Y = 306;
// fold lines (slightly off-square to the drawing, as a folded sheet always is): [x0, y0, x1, y1, seed]
const FOLDS = [[318 - 9, -PAD, 318 + 9, H + PAD, 'v0'], [1742 + 6, -PAD, 1742 - 6, H + PAD, 'v1'], [-PAD, CREASE_Y + 8, W + PAD, CREASE_Y - 8, 'h']];
let S = null;

const WHITE = (a) => `rgba(255,255,255,${L.clamp(a).toFixed(3)})`;

// ───────────────────────── paper tooth ─────────────────────────
const TN = 1024, TM = TN - 1, TSH = 10;   // the tooth is a seamless 1024² tile
/** separable Gaussian blur of a TN×TN field with wrap-around (keeps the tile seamless) */
function gaussWrap(src, sigma) {
  const rad = Math.ceil(sigma * 3), k = new Float32Array(rad * 2 + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) sum += (k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma)));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(TN * TN), out = new Float32Array(TN * TN);
  for (let y = 0; y < TN; y++) {
    const o = y << TSH;
    for (let x = 0; x < TN; x++) { let acc = 0; for (let i = -rad; i <= rad; i++) acc += k[i + rad] * src[o | ((x + i) & TM)]; tmp[o | x] = acc; }
  }
  for (let y = 0; y < TN; y++) {
    const o = y << TSH;
    for (let x = 0; x < TN; x++) { let acc = 0; for (let i = -rad; i <= rad; i++) acc += k[i + rad] * tmp[(((y + i) & TM) << TSH) | x]; out[o | x] = acc; }
  }
  return out;
}
function unit(v) {
  let m = 0, s = 0;
  for (let i = 0; i < v.length; i++) m += v[i];
  m /= v.length;
  for (let i = 0; i < v.length; i++) { v[i] -= m; s += v[i] * v[i]; }
  s = Math.sqrt(s / v.length) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}
/** remap a field to a uniform distribution on [0,1) — then "pressure p" covers exactly the fraction p of the sheet */
function equalize(v) {
  const N = v.length, B = 8192, hist = new Uint32Array(B), cum = new Float32Array(B + 1);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
  const sc = (B - 0.001) / (hi - lo || 1);
  for (let i = 0; i < N; i++) hist[((v[i] - lo) * sc) | 0]++;
  let acc = 0;
  for (let b = 0; b < B; b++) { cum[b] = acc / N; acc += hist[b]; }
  cum[B] = 1;
  for (let i = 0; i < N; i++) { const f = (v[i] - lo) * sc, b = f | 0; v[i] = cum[b] + (cum[b + 1] - cum[b]) * (f - b); }
  return v;
}
/** a seamless band-limited field, uniform on [0,1): octaves = [[sigma px, weight]…] */
function makeField(seed, octaves) {
  const r = L.rng(seed), N = TN * TN, out = new Float32Array(N), white = new Float32Array(N);
  for (const [sigma, wgt] of octaves) {
    for (let i = 0; i < N; i++) white[i] = r();
    const f = unit(gaussWrap(white, sigma));
    for (let i = 0; i < N; i++) out[i] += wgt * f[i];
  }
  return equalize(out);
}
/** the tooth of the sheet: 0 = the highest points of the grain (chalk catches there first), 1 = the deepest pores.
 *  Clumps of fibre a few pixels across, carrying a finer grit — so a light stroke breaks into clumps whose edges are nibbled. */
const makeTooth = (seed) => makeField(seed, [[2.6, 0.4], [1.2, 0.4], [0.6, 0.2]]);
function tileCanvas(fill) {
  const c = L.makeCanvas(TN, TN), g = c.getContext('2d'), img = g.createImageData(TN, TN);
  fill(img.data);
  g.putImageData(img, 0, 0);
  return c;
}
/** the tooth as it looks on the bare sheet: the coating lies thinner on the high points, and every bump has a lit and a shaded flank */
function reliefTile(T) {
  return tileCanvas((d) => {
    for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++) {
      const o = y << TSH, i = o | x;
      const tx = T[o | ((x + 1) & TM)] - T[o | ((x - 1) & TM)], ty = T[(((y + 1) & TM) << TSH) | x] - T[(((y - 1) & TM) << TSH) | x];
      let v = 0.45 * (0.5 - T[i]) - 1.3 * (tx + ty);   // height falls where T rises, so a flank facing the top-left light has tx + ty < 0
      v = v < -1 ? -1 : v > 1 ? 1 : v;
      const k = i << 2;
      if (v > 0) { d[k] = 104; d[k + 1] = 166; d[k + 2] = 240; d[k + 3] = 255 * 0.1 * v; }
      else { d[k] = 7; d[k + 1] = 28; d[k + 2] = 64; d[k + 3] = 255 * 0.12 * -v; }
    }
  });
}

// ───────────────────────── chalk pressure (white alpha = how hard the stick was pressed) ─────────────────────────
/** a straight line as a polyline the hand can wander along: hand 0 = ruled against the straightedge, 1 = freehand */
function seg(x0, y0, x1, y1, seed, hand = 0.2) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return [[x0, y0], [x1, y1]];
  const n = Math.max(1, Math.round(len / 22)), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nz = L.makeNoise('s07sg' + seed);
  const bow = hand * len * 0.05 * nz.n2(3.3, 8.8), amp = hand * Math.min(1, len / 60), pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, d = t * len, o = amp * (0.9 * nz.n2(d / 70, 1.7) + 0.5 * nz.n2(d / 23, 6.1)) + bow * t * (1 - t);
    pts.push([x0 + ux * d - uy * o, y0 + uy * d + ux * o]);
  }
  return pts;
}
/**
 * One chalk stroke along a polyline. o: a (overall pressure 0..1), lo (how far the pressure sags along the stroke),
 * vary (how much the width breathes), lanes (false = a single pass), caps (false = the stroke runs on out of frame),
 * g0/g1 (ends of the pressure gradient, default first/last point).
 */
function stroke(g, pts, width, seed, o = {}) {
  const a = o.a === undefined ? 1 : o.a, lo = o.lo === undefined ? 0.72 : o.lo, vary = o.vary === undefined ? 0.07 : o.vary, caps = o.caps !== false;
  const n = pts.length, r = L.rng('s07k' + seed), nz = L.makeNoise('s07kn' + seed);
  const cum = new Float32Array(n), NX = new Float32Array(n), NY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)], e = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    NX[i] = -(q[1] - p[1]) / e; NY[i] = (q[0] - p[0]) / e;
  }
  const len = cum[n - 1]; if (len < 0.5) return;
  const p0 = o.g0 || pts[0], p1 = o.g1 || pts[n - 1];
  // pressure along the stroke: set down, drifting, and lifting off at the end
  const grad = (amp, floor, pitch) => {
    const gr = g.createLinearGradient(p0[0], p0[1], p1[0], p1[1]), m = Math.max(2, Math.round(len / pitch));
    for (let i = 0; i <= m; i++) {
      let v = amp * (floor + (1 - floor) * r());
      if (caps && i === m) v *= 0.45;
      gr.addColorStop(i / m, WHITE(v));
    }
    return gr;
  };
  g.save();
  // the full width of the stick, its two edges breathing separately
  g.fillStyle = grad(a * (width < 8 ? 0.74 : 0.66), lo, 64);
  g.beginPath();
  const B = [];
  for (let i = 0; i < n; i++) {
    const d = cum[i], hw = (width / 2) * (1 + vary * nz.n2(d / 210, 1.3) + vary * 0.5 * nz.n2(d / 55, 7.7)), sk = 0.75 * vary * width * nz.n2(d / 320, 4.1);
    const x = pts[i][0] + NX[i] * (hw + sk), y = pts[i][1] + NY[i] * (hw + sk);
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
    B.push(pts[i][0] - NX[i] * (hw - sk), pts[i][1] - NY[i] * (hw - sk));
  }
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i * 2], B[i * 2 + 1]);
  g.closePath(); g.fill();
  // the ridges of the stick's worn face: narrow lanes, each pressing and lifting on its own
  if (o.lanes !== false) {
    const nl = width >= 17 ? 5 : width >= 11 ? 4 : width >= 7 ? 3 : 2, lw = (width / nl) * 1.55;
    g.lineCap = 'butt'; g.lineJoin = 'round'; g.lineWidth = lw;
    for (let k = 0; k < nl; k++) {
      const off = ((k + 0.5) / nl - 0.5) * (width - lw * 0.8) + r.range(-0.04, 0.04) * width;
      g.strokeStyle = grad(a * 0.52, 0.12, 30);
      g.beginPath();
      for (let i = 0; i < n; i++) { const x = pts[i][0] + NX[i] * off, y = pts[i][1] + NY[i] * off; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
  }
  // the grain of the stick itself: hairline striations along the stroke, where a hard grit dragged a groove (or a ridge pressed harder)
  if (o.grain !== false && g.globalCompositeOperation === 'source-over' && width >= 5 && len > 30) {
    const ns = Math.round((len / 70) * (width / 9) * (o.grain === undefined ? 1 : o.grain));   // ≈ one striation in play per 9 px of width
    g.lineCap = 'round';
    for (let k = 0; k < ns; k++) {
      const off = r.range(-0.44, 0.44) * width, d0 = r.range(-0.1, 1) * len, d1 = d0 + r.range(20, 120), cut = r.chance(0.8);
      g.globalCompositeOperation = cut ? 'destination-out' : 'source-over';
      g.strokeStyle = WHITE(cut ? r.range(0.22, 0.62) * (width < 8 ? 0.6 : 1) : a * r.range(0.12, 0.3)); g.lineWidth = r.range(1.4, width < 8 ? 2 : 2.6);
      g.beginPath();
      let on = false;
      for (let i = 0; i < n; i++) {
        if (cum[i] < d0 || cum[i] > d1) continue;
        const x = pts[i][0] + NX[i] * off, y = pts[i][1] + NY[i] * off;
        if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; }
      }
      if (on) g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (caps) {   // the blunt end of the stick where it was set down, and a lighter touch where it left the paper
    g.fillStyle = WHITE(a * 0.5); g.beginPath(); g.arc(pts[0][0], pts[0][1], width * 0.5, 0, L.TAU); g.fill();
    g.fillStyle = WHITE(a * 0.2); g.beginPath(); g.arc(pts[n - 1][0], pts[n - 1][1], width * 0.46, 0, L.TAU); g.fill();
  }
  g.restore();
}
const rule = (g, x0, y0, x1, y1, width, seed, o = {}) => stroke(g, seg(x0, y0, x1, y1, seed, o.hand === undefined ? 0.2 : o.hand), width, seed, o);
/** dashed / dash-dot ruled line. pat = [on, off, on, off…]; the short "on"s are dabs of the stick */
function dash(g, x0, y0, x1, y1, pat, width, seed, o = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, r = L.rng('s07ds' + seed), a = o.a === undefined ? 1 : o.a;
  let d = o.phase || 0, i = 0;
  while (d < len) {
    const sg = pat[i % pat.length] * (i % 2 === 0 ? r.range(0.94, 1.06) : 1);
    if (i % 2 === 0) {
      const s0 = Math.max(0, d), e = Math.min(len, d + sg);
      if (e - s0 > width * 2.2) rule(g, x0 + ux * s0, y0 + uy * s0, x0 + ux * e, y0 + uy * e, width, seed + '_' + i, o);
      else if (e - s0 > 2) {
        const m = (s0 + e) / 2, j = r.range(-1, 1);
        g.save(); g.fillStyle = WHITE(a * r.range(0.72, 0.95));
        g.beginPath(); g.ellipse(x0 + ux * m - uy * j, y0 + uy * m + ux * j, Math.max(e - s0, width) * 0.5 + 0.5, width * 0.5, Math.atan2(uy, ux), 0, L.TAU); g.fill();
        g.restore();
      }
    }
    d += sg; i++;
  }
}
/** hand-drawn arrowhead: two quick barbs flicked back from the tip (x,y); the arrow points along `ang` */
function arrow(g, x, y, ang, size, seed) {
  const r = L.rng('s07ar' + seed);
  for (const sg of [-1, 1]) {
    const b = ang + Math.PI + sg * (0.4 + r.range(-0.05, 0.05)), l = size * r.range(0.92, 1.1);
    rule(g, x + Math.cos(ang) * 2, y + Math.sin(ang) * 2, x + Math.cos(b) * l, y + Math.sin(b) * l, 5, 'ar' + seed + sg, { a: 1, lo: 0.85, hand: 0.5 });
  }
}
function ring(g, x, y, rad, width, seed) {
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = (i / 40) * L.TAU + 0.6; pts.push([x + rad * Math.cos(t), y + rad * 1.04 * Math.sin(t)]); }
  stroke(g, pts, width, seed, { a: 0.92, lo: 0.75, lanes: false, caps: false, g0: [x - rad, y - rad], g1: [x + rad, y + rad] });
}
/** registration mark: cross-hair through a small circle */
function regMark(g, x, y, rad, seed) {
  rule(g, x - rad * 2.1, y + 1, x + rad * 2.1, y - 1, 5.5, seed + 'h', { a: 0.92 }); rule(g, x + 1, y - rad * 2.1, x - 0.5, y + rad * 2.1, 5.5, seed + 'v', { a: 0.92 });
  ring(g, x, y, rad, 5.5, seed + 'o');
}
function creasePts(x0, y0, x1, y1, seed) {
  const len = Math.hypot(x1 - x0, y1 - y0), nz = L.makeNoise('s07cr' + seed), pts = [];
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  for (let d = 0; d <= len; d += 26) { const o = 1.8 * nz.n2(d * 0.012, 1.7); pts.push([x0 + ((x1 - x0) * d) / len + nx * o, y0 + ((y1 - y0) * d) / len + ny * o]); }
  return pts;
}

function buildMask(env) {
  const a = env.arc, s = a.span(PAD + 170), cx = a.cx, oy = a.crestY - 560;
  const P = (th, dr) => { const q = a.pt(th, dr); return [q.x, q.y]; };
  const yo = a.crestY + HOLE_TOP - NEI, yi = a.crestY + HOLE_TOP, xo = HOLE_HALF + NEI, xi = HOLE_HALF;
  const BOT = H + PAD + 30, TOP = -PAD - 30;
  const dimO = { th: 2.5 * STEP }; dimO.q0 = P(dimO.th, -RIM - 62); dimO.q1 = P(dimO.th, 132);   // 外郭 dimension
  const dimN = cx + 303;                                                                        // 内郭 dimension

  // the two raised rims, rubbed in with a chalky finger before they were hatched
  const veil = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#fff';
    a.pathBand(g, 0, -RIM, -s, s); g.fill();
    g.beginPath(); g.rect(cx - xo, yo, xo * 2, BOT - yo); g.rect(cx - xi, yi, xi * 2, BOT - yi); g.fill('evenodd');
  });

  const line = L.makeLayer(PAD, (g) => {
    // ── hatching on the two raised rims: quick strokes, no two alike ──
    const hr = L.rng('s07hatch');
    for (let th = -s, i = 0; th < s; th += (40 + hr.range(-7, 7)) / a.R, i++) {
      if (hr.chance(0.05)) continue;
      const x0 = -19 + hr.range(-4, 4), y0 = 10 + hr.range(-2, 6), x1 = 19 + hr.range(-4, 4), y1 = RIM - 5 + hr.range(-8, 3), w = hr.range(5.2, 7), pr = hr.range(0.42, 0.68);
      a.at(g, th, 0, () => rule(g, x0, y0, x1, y1, w, 'ha' + i, { a: pr, lo: 0.5, hand: 0.8, grain: 0.5 }));
    }
    for (let c = cx - xo + yo + 14, i = 0; c < cx + xo + BOT; c += 44 + hr.range(-6, 6), i++) {
      const lo = Math.max(cx - xo, c - BOT), hi = Math.min(cx + xo, c - yo), e0 = cx - xi, e1 = Math.min(cx + xi, c - yi);
      const runs = e1 > e0 ? [[lo, Math.min(hi, e0)], [Math.max(lo, e1), hi]] : [[lo, hi]];
      runs.forEach(([xa, xb], j) => {
        xa += hr.range(1, 6) * 0.7; xb -= hr.range(1, 7) * 0.7;
        if (xb - xa < 9) return;
        rule(g, xa, c - xa, xb, c - xb, hr.range(5.2, 7), 'hb' + i + '_' + j, { a: hr.range(0.46, 0.7), lo: 0.55, hand: 0.8, grain: 0.5 });
      });
    }

    // ── radial construction lines from the centre of the circle ──
    const RAD = [
      { k: -6, top: 0, w: 11.5 }, { k: -5, top: 0, w: 10.5 }, { k: -4, top: 46, w: 14.5 }, { k: -3, top: 28, w: 9.5, dd: 1 },
      { k: -2, top: 84, w: 16 }, { k: -1, top: -RIM, w: 10 }, { k: 1, top: 52, w: 13 }, { k: 2, top: -RIM, w: 9.5, dd: 1 },
      { k: 3, top: 68, w: 16 }, { k: 4, top: -RIM, w: 10 }, { k: 5, top: 0, w: 10, dd: 1 }, { k: 6, top: 0, w: 11.5 },
    ];
    for (const q of RAD) {
      const th = q.k * STEP, yEnd = Math.abs(q.k) <= 2 ? yo : BOT;
      const p0 = P(th, q.top), rEnd = (a.cy - yEnd) / Math.cos(th), p1 = P(th, rEnd - a.R);
      if (q.dd) dash(g, p0[0], p0[1], p1[0], p1[1], [104, 15, 12, 15], q.w, 'rd' + q.k, { phase: -((q.k * 37 + 200) % 70), a: 0.9 });
      else rule(g, p0[0], p0[1], p1[0], p1[1], q.w, 'rd' + q.k, { lo: 0.74, a: q.w >= 13 ? 1 : q.k === -5 || q.k === 4 ? 0.8 : 0.9 });
    }
    // lines that were struck twice / abandoned
    { const t1 = STEP + 0.011, q0 = P(t1, -RIM - 26), q1 = P(t1, -RIM - 236); rule(g, q0[0], q0[1], q1[0], q1[1], 5.5, 'gh1', { a: 0.6, lo: 0.3 });
      const t2 = -2 * STEP - 0.012, r0 = P(t2, 40), r1 = P(t2, -210); rule(g, r0[0], r0[1], r1[0], r1[1], 5.5, 'gh2', { a: 0.58, lo: 0.3 }); }
    // short half-step divisions hanging inside the rim
    for (let k = -6; k <= 5; k++) {
      if (k === 2) continue; // the rim-width dimension sits here
      const th = (k + 0.5) * STEP, q0 = P(th, -RIM - 2), q1 = P(th, -RIM - 34 + hr.range(-4, 4));
      rule(g, q0[0], q0[1], q1[0], q1[1], 7.5, 'hf' + k, { lo: 0.6, a: 0.95, hand: 0.5 });
    }
    // 中轴线: long-dash / dot, right through the sheet
    dash(g, cx, TOP, cx, BOT, [150, 18, 14, 18], 8, 'axis', { phase: -64, lo: 0.74, a: 0.97 });
    // angle between two radii (bottom left)
    { const t0 = -4 * STEP, t1 = -3 * STEP, dr = -238;
      stroke(g, L.arcPts(a, dr, t0 + 0.004, t1 - 0.004, 30), 5.5, 'ang', { lo: 0.7, a: 0.9, caps: false });
      const q0 = P(t0, dr), q1 = P(t1, dr); arrow(g, q0[0] + 3, q0[1], t0 + Math.PI, 32, 'a0'); arrow(g, q1[0] - 3, q1[1], t1, 32, 'a1'); }

    // ── 外郭: the coin's edge (on the shared arc) and the inner line of the rim ──
    stroke(g, L.arcPts(a, -RIM, -s, s, 220), 9, 'rimIn', { lo: 0.66, a: 0.84, caps: false });
    stroke(g, L.arcPts(a, 0, -s, s, 320), 22, 'edge', { lo: 0.9, vary: 0.16, caps: false, grain: 0.75 });
    stroke(g, L.arcPts(a, 0, -s, s, 220), 13, 'edge2', { lo: 0.8, a: 0.86, lanes: false, caps: false, grain: false });
    stroke(g, L.arcPts(a, 6.5, -s, -0.06, 100), 5, 'edge3', { a: 0.58, lo: 0.2, caps: false });   // the compass went round twice
    stroke(g, L.arcPts(a, -7, 0.13, s, 100), 5, 'edge4', { a: 0.58, lo: 0.2, caps: false });

    // ── 内郭 + 穿: the square hole, its sides parallel to the axis ──
    rule(g, cx - xo - 20, yo, cx + xo + 20, yo, 10, 'no', { lo: 0.75, a: 0.92 });
    rule(g, cx - xi - 14, yi, cx + xi + 14, yi, 14, 'ni', { lo: 0.86 });
    for (const sg of [-1, 1]) {
      rule(g, cx + sg * xo, yo - 20, cx + sg * xo, BOT, 10, 'so' + sg, { lo: 0.75, a: 0.92 });
      rule(g, cx + sg * xi, yi - 14, cx + sg * xi, BOT, 14, 'si' + sg, { lo: 0.86 });
      rule(g, cx + sg * (xo + 5), yo - 5, cx + sg * (xi - 5), yi + 5, 5.5, 'mi' + sg, { lo: 0.7, a: 0.88 });   // mitre of the corner
    }
    // the hole's top edge is square to the axis
    rule(g, cx, yo - 36, cx + 36, yo - 36, 5, 'sq1', { a: 0.9, hand: 0.5 }); rule(g, cx + 36, yo - 38, cx + 36, yo, 5, 'sq2', { a: 0.9, hand: 0.5 });

    // ── width of the outer rim (labelled 外郭) ──
    { const th = dimO.th, q0 = dimO.q0, q1 = dimO.q1;
      rule(g, q0[0], q0[1], q1[0], q1[1], 6, 'dw', { lo: 0.72, a: 0.92 });
      const t0 = P(th, 9), t1 = P(th, -RIM - 5);
      arrow(g, t0[0], t0[1], th + Math.PI / 2, 38, 'w0'); arrow(g, t1[0], t1[1], th - Math.PI / 2, 38, 'w1');
      rule(g, q1[0] - 3, q1[1], q1[0] + 236, q1[1], 6, 'dws', { lo: 0.72, a: 0.92 }); }
    // ── width of the inner rim (labelled 内郭) ──
    { const x = dimN;
      rule(g, x, yo - 58, x, yi + 56, 6, 'dn', { lo: 0.72, a: 0.92 });
      arrow(g, x, yo - 5, Math.PI / 2, 34, 'n0'); arrow(g, x, yi + 8, -Math.PI / 2, 34, 'n1'); }

    // ── above the coin: a few oblique dimension lines, graduations, registration marks, a corner of the title block ──
    { const an = L.deg(-38), ux = Math.cos(an), uy = Math.sin(an), nx = -uy, ny = ux, bx = 250, by = 172 + oy;
      const sgm = (off, t0, t1, w, seed, o) => rule(g, bx + nx * off + ux * t0, by + ny * off + uy * t0, bx + nx * off + ux * t1, by + ny * off + uy * t1, w, seed, o);
      sgm(0, -460, 470, 14.5, 'oa', { lo: 0.82 });
      sgm(-62, -300, 470, 9, 'ob', { lo: 0.7, a: 0.93 });
      sgm(-104, -230, 470, 6.5, 'oc', { lo: 0.65, a: 0.9 });
      for (let i = 0, t = -310; t <= 300; t += 61, i++) {
        const major = i % 5 === 0;
        rule(g, bx + ux * t + nx * (-62 - (major ? 18 : 0)), by + uy * t + ny * (-62 - (major ? 18 : 0)), bx + ux * t + nx * (major ? 34 : -22), by + uy * t + ny * (major ? 34 : -22), major ? 8.5 : 6, 'ot' + i, { lo: 0.7, a: 0.94, hand: 0.5 });
      } }
    { const an = L.deg(35), ux = Math.cos(an), uy = Math.sin(an), nx = -uy, ny = ux, bx = 1756, by = 268 + oy;
      rule(g, bx - ux * 310, by - uy * 310, bx + ux * 380, by + uy * 380, 11.5, 'pa', { lo: 0.8 });
      rule(g, bx - ux * 60 + nx * 50, by - uy * 60 + ny * 50, bx + ux * 380 + nx * 50, by + uy * 380 + ny * 50, 6.5, 'pb', { lo: 0.65, a: 0.9 });
      for (const [t, l0, l1, w] of [[-196, -44, 44, 8.5], [-52, -40, 86, 8.5], [96, -30, 80, 6.5]]) rule(g, bx + ux * t + nx * l0, by + uy * t + ny * l0, bx + ux * t + nx * l1, by + uy * t + ny * l1, w, 'pt' + t, { lo: 0.7, a: 0.95, hand: 0.5 }); }
    regMark(g, cx - 296, 226 + oy, 19, 'rg0'); regMark(g, cx + 862, 962 + oy, 19, 'rg1');
    { const bx = 1672, by = 124 + oy;   // 图签框: only its lower-left corner is in shot, left blank
      rule(g, bx, TOP, bx, by + 12, 11, 'tb0', { lo: 0.8 }); rule(g, bx - 12, by, W + PAD + 30, by, 11, 'tb1', { lo: 0.8 });
      rule(g, bx, by - 62, W + PAD + 30, by - 62, 6.5, 'tb2', { a: 0.92 }); rule(g, bx + 136, by - 62, bx + 136, by, 6.5, 'tb3', { a: 0.92 }); }

    // ── lines the draughtsman rubbed out again: only a ghost of dust is left in the grain ──
    for (const [i, l] of ghostLines(env).entries()) rule(g, l[0][0], l[0][1], l[1][0], l[1][1], 10, 'gho' + i, { a: 0.2, lo: 0.4, caps: false });

    // the folds have taken some of the chalk with them
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (const f of FOLDS) stroke(g, creasePts(...f), 6, 'er' + f[4], { a: 0.9, lo: 0.3, caps: false });
    g.restore();
  });

  // the four part names, written with the corner of the stick (positions and face are fixed — they have been checked)
  const text = L.makeLayer(PAD, (g) => {
    L.text(g, '外郭', dimO.q1[0] + 124, dimO.q1[1] - 50, { font: '"GJ WenKai", "GJ Brush", cursive', size: 80, weight: 400, color: '#fff', spacing: 8, stroke: { color: '#fff', width: 2.2 } });
    L.text(g, '内郭', dimN - 4, yo - 104, { font: '"GJ WenKai", "GJ Brush", cursive', size: 72, weight: 400, color: '#fff', spacing: 6, stroke: { color: '#fff', width: 1.7 } });
    L.text(g, '肉', cx - 302, yo - 104, { font: '"GJ WenKai", "GJ Brush", cursive', size: 86, weight: 400, color: '#fff', stroke: { color: '#fff', width: 2.2 } });
    L.text(g, '穿', cx - 130, yi + 92, { font: '"GJ WenKai", "GJ Brush", cursive', size: 90, weight: 400, color: '#fff', stroke: { color: '#fff', width: 2.2 } });
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (const f of FOLDS) stroke(g, creasePts(...f), 6, 'er' + f[4], { a: 0.9, lo: 0.3, caps: false });
    g.restore();
  });
  return { line, text, veil };
}

/** the two lines that were rubbed out: a first, longer setting-out line parallel to the graduated one, and a radius struck on the wrong division */
function ghostLines(env) {
  const a = env.arc, P = (th, dr) => { const q = a.pt(th, dr); return [q.x, q.y]; };
  const an = L.deg(-38), ux = Math.cos(an), uy = Math.sin(an), bx = 344, by = 292 + (a.crestY - 560);
  return [[[bx - ux * 470, by - uy * 470], [bx + ux * 540, by + uy * 540]], [P(3.5 * STEP, -RIM - 14), P(3.5 * STEP, -760)]];
}

// ───────────────────────── wear: where the blue has been rubbed off the high points of the grain ─────────────────────────
function buildWearMask() {
  const m = L.makeLayer(PAD, (g) => {
    // scuffed fields, strongest where the folds cross
    for (const x of CREASE_X) {
      g.fillStyle = L.radial(g, x, CREASE_Y, 0, 260, [[0, 'rgba(0,0,0,0.66)'], [0.4, 'rgba(0,0,0,0.33)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - 260, CREASE_Y - 260, 520, 520);
      g.fillStyle = L.linear(g, x - 54, 0, x + 54, 0, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - 54, -PAD, 108, LH);
    }
    g.fillStyle = L.linear(g, 0, CREASE_Y - 54, 0, CREASE_Y + 54, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(-PAD, CREASE_Y - 54, LW, 108);
    const r = L.rng('s07scf');
    for (let i = 0; i < 7; i++) { const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), rad = r.range(150, 340); g.fillStyle = L.radial(g, x, y, 0, rad, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  });
  const g = m.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in';
  g.drawImage(L.noiseTex(LW, LH, { seed: 's07scuff', scale: 240, octaves: 5, gain: 0.6, res: 0.2, contrast: 2.0,
    ramp: [[0, 'rgba(0,0,0,0)'], [0.46, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0.8)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
  g.restore();
  // the folds themselves: the coating has cracked along the ridge and flaked off beside it
  for (const f of FOLDS) {
    const pts = creasePts(...f);
    stroke(g, pts, 7, 'cw' + f[4], { a: 0.42, lo: 0.2, caps: false, grain: false });
    stroke(g, pts, 2.8, 'cx' + f[4], { a: 0.85, lo: 0.3, caps: false, lanes: false, grain: false });
  }
  return m;
}
/** the fold as relief: the sheet no longer lies flat — a broad roll of light one side, shade the other, and the sharp ridge itself */
function creaseRelief(g, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
  g.save(); g.translate(x0, y0); g.rotate(ang);
  g.fillStyle = L.linear(g, 0, -190, 0, 190, [[0, 'rgba(150,196,246,0)'], [0.5, 'rgba(150,196,246,0.05)'], [0.5, 'rgba(4,16,40,0.075)'], [1, 'rgba(4,16,40,0)']]);
  g.fillRect(0, -190, len, 380);
  g.fillStyle = L.linear(g, 0, -9, 0, 9, [[0, 'rgba(190,220,250,0)'], [0.4, 'rgba(190,220,250,0.2)'], [0.5, 'rgba(3,12,30,0.3)'], [0.66, 'rgba(3,12,30,0.08)'], [1, 'rgba(3,12,30,0)']]);
  g.fillRect(0, -9, len, 18);
  g.restore();
}

// ───────────────────────── develop pressure against the tooth ─────────────────────────
const SOFT = 0.19;   // width of the catch/no-catch transition in tooth units (≈ 1 px on the sheet: every grain edge is anti-aliased)
function develop(line, text, wearM, T, F) {
  const w = line.width, h = line.height;
  const rd = (c) => c.getContext('2d').getImageData(0, 0, w, h).data;
  const md = rd(L.blurred(line, 1.5)), td = rd(L.blurred(text, 0.9)), wd = rd(wearM);
  const pd = rd(L.noiseTex(w, h, { seed: 's07press', scale: 170, octaves: 3, res: 0.125, contrast: 1.8 }));
  const chalk = L.makeCanvas(w, h), cg = chalk.getContext('2d'), ci = cg.createImageData(w, h), cd = ci.data;
  const wear = L.makeCanvas(w, h), wg = wear.getContext('2d'), wi = wg.createImageData(w, h), wo = wi.data;
  const inv = 1 / SOFT;
  for (let y = 0; y < h; y++) {
    const ty = (y & TM) << TSH;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) << 2, m = md[k + 3], mt = td[k + 3], wv = wd[k + 3];
      if (m < 3 && mt < 3 && wv < 3) continue;
      const ti = ty | (x & TM), t = T[ti], pn = pd[k] / 255;
      if (m >= 3 || mt >= 3) {
        const pl = (m / 255) * 1.3 * (0.84 + 0.3 * pn), pt = (mt / 255) * 1.16 * (0.9 + 0.2 * pn), p = pl > pt ? pl : pt;
        const u = (p - t) * inv + 0.5;
        if (u > 0) {
          const al = u >= 1 ? 1 : u * u * (3 - 2 * u);
          let b = (p - t) / 0.8; b = b < 0 ? 0 : b > 1 ? 1 : b;       // how thickly the chalk lies: thin over the pores and under a lane that lifted — the blue still glimmers through
          const th = p > 0.85 ? 1 : p / 0.85;                          // a light touch leaves a thinner film everywhere
          cd[k] = 243; cd[k + 1] = 246; cd[k + 2] = 248; cd[k + 3] = 255 * al * (0.8 + 0.2 * b) * (0.62 + 0.38 * th) * (0.9 + 0.1 * F[ti]);   // F: the powder itself is not even
        }
      }
      if (wv >= 3) {
        const f = 0.65 * F[ti] + 0.35 * t, p = (wv / 255) * 0.9, u = (p - f) / 0.34 + 0.5;   // abrasion takes the fine grit first
        if (u > 0) {
          const al = u >= 1 ? 1 : u * u * (3 - 2 * u);
          let b = (p - f) / 0.5; b = b < 0 ? 0 : b > 1 ? 1 : b;       // rubbed harder → paler
          wo[k] = 92 + 70 * b; wo[k + 1] = 150 + 56 * b; wo[k + 2] = 214 + 26 * b; wo[k + 3] = 255 * al * (0.16 + 0.34 * b);
        }
      }
    }
  }
  cg.putImageData(ci, 0, 0); wg.putImageData(wi, 0, 0);
  chalk._pad = wear._pad = PAD;
  return { chalk, wear };
}

/** loose chalk: fine powder shaken off the stick beside the strokes, a thinner scatter a finger's width away, a few crumbs */
function strewDust(g, chalk) {
  const w = chalk.width, h = chalk.height;
  const rd = (c) => c.getContext('2d').getImageData(0, 0, w, h).data;
  const near = rd(L.blurred(chalk, 6)), far = rd(L.blurred(chalk, 22));
  const r = L.rng('s07dust');
  g.save(); g.fillStyle = CHALK;
  for (let i = 0; i < 80000; i++) {
    const x = r() * w, y = r() * h, k = ((y | 0) * w + (x | 0)) << 2, nv = near[k + 3] / 255, fv = far[k + 3] / 255;
    if (r() > 1.5 * nv * (1 - nv) + 0.22 * fv + 0.0035) continue;
    g.globalAlpha = 0.22 + 0.6 * r();
    g.beginPath(); g.arc(x, y, 0.55 + 0.95 * Math.pow(r(), 2.4), 0, L.TAU); g.fill();
  }
  for (let i = 0; i < 9000; i++) {   // crumbs broken off the stick: small irregular chips lying close to the heavy strokes
    const x = r() * w, y = r() * h, k = ((y | 0) * w + (x | 0)) << 2, nv = near[k + 3] / 255;
    if (nv < 0.12 || nv > 0.5 || r() > 0.08) continue;
    const rad = r.range(1.3, 2.5), rot = r() * L.TAU;
    g.globalAlpha = r.range(0.6, 0.95);
    g.beginPath();
    for (let j = 0; j < 5; j++) { const an = rot + (j / 5) * L.TAU, rr = rad * r.range(0.6, 1.1); if (j) g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.8); else g.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.8); }
    g.closePath(); g.fill();
  }
  g.restore();
}

// ───────────────────────── paper ─────────────────────────
function buildPaper(T) {
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = BLUE; g.fillRect(-PAD, -PAD, LW, LH);
    // uneven exposure of the cyanotype: slow pools of deeper pigment, a few paler fields
    g.drawImage(L.noiseTex(LW, LH, { seed: 's07cA', scale: 880, octaves: 3, res: 0.125, warp: 0.5, contrast: 1.6,
      ramp: [[0, L.rgba(DEEP, 0.7)], [0.42, L.rgba(DEEP, 0.1)], [0.6, L.rgba(WORN, 0)], [1, L.rgba(WORN, 0.26)]] }), -PAD, -PAD);
    // brush streaks of the hand-coated sensitiser
    g.globalAlpha = 0.11;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's07cB', scale: 26, sx: 50, sy: 1, octaves: 3, res: 0.33, contrast: 1.7,
      ramp: [[0, L.rgba('#0d2c57', 0.6)], [0.45, 'rgba(13,44,87,0)'], [0.62, 'rgba(90,146,208,0)'], [1, L.rgba('#5a92d0', 0.45)]] }), -PAD, -PAD);
    g.globalAlpha = 1;
    // paper fibres lying in the surface: some took the blue more deeply, some less
    const r = L.rng('s07fib');
    g.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(8, 40), an = r() * Math.PI;
      g.strokeStyle = r.chance(0.5) ? L.rgba('#7db4f3', r.range(0.04, 0.13)) : L.rgba('#0b2648', r.range(0.05, 0.16));
      g.lineWidth = r.range(1.2, 1.9);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-6, 6), y + Math.sin(an) * len * 0.5 + r.range(-6, 6), x + Math.cos(an) * len, y + Math.sin(an) * len);
      g.stroke();
    }
    // the tooth of the sheet (same field, same registration, as the one the chalk is developed against)
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = g.createPattern(reliefTile(T), 'repeat'); g.fillRect(0, 0, LW, LH);
    g.restore();
  });
}

export default {
  name: '方孔圆钱规制图',
  tone: 'light',
  init(env) {
    const T = makeTooth('s07tooth'), F = makeField('s07powder', [[0.7, 1]]);
    const paper = buildPaper(T);
    const { line, text, veil } = buildMask(env);
    const { chalk, wear } = develop(line, text, buildWearMask(), T, F);
    // flatten into one sheet: paper → rubbed tone → smears and loose dust → chalk → wear
    const g = paper.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    { // the rubbed-in tone of the two rims: streaky along the rim, and thinner where the finger passed over the high grain
      const v = L.blurred(veil, 2.2), vg = v.getContext('2d');
      vg.globalCompositeOperation = 'destination-in';
      vg.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's07veil', scale: 34, sx: 5, sy: 1, octaves: 3, res: 0.25, contrast: 1.5, ramp: [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
      vg.fillStyle = vg.createPattern(tileCanvas((d) => { for (let i = 0; i < TN * TN; i++) d[i * 4 + 3] = 255 * (0.5 + 0.5 * T[i]); }), 'repeat'); vg.fillRect(0, 0, LW, LH);
      g.globalAlpha = 0.2; g.drawImage(v, 0, 0);
    }
    { // where the two rubbed-out lines were: the smear of the cloth
      const smear = L.makeLayer(PAD, (sg) => {
        sg.strokeStyle = L.rgba(CHALK, 0.5); sg.lineCap = 'round'; sg.lineWidth = 50;
        for (const l of ghostLines(env)) { sg.beginPath(); sg.moveTo(l[0][0], l[0][1]); sg.lineTo(l[1][0], l[1][1]); sg.stroke(); }
      });
      g.globalAlpha = 0.16; g.drawImage(L.blurred(smear, 16), 0, 0);
    }
    g.globalAlpha = 0.09; g.drawImage(L.blurred(chalk, 4), 0, 0);       // powder worked into the grain beside every stroke
    g.globalAlpha = 0.08; g.drawImage(L.blurred(chalk, 20), 12, 5);     // a smear from the draughtsman's sleeve
    g.globalAlpha = 1;
    strewDust(g, chalk);
    { // the chalk lies ON the sheet: a hairline of shade along the side turned away from the light
      const sh = L.makeCanvas(LW, LH), hg = sh.getContext('2d');
      hg.drawImage(chalk, 0, 0); hg.globalCompositeOperation = 'source-in'; hg.fillStyle = '#06183a'; hg.fillRect(0, 0, LW, LH);
      g.globalAlpha = 0.3; g.drawImage(L.blurred(sh, 1.1), 1.3, 1.5); g.globalAlpha = 1;
    }
    g.drawImage(chalk, 0, 0);
    g.drawImage(wear, 0, 0);
    g.translate(PAD, PAD);
    { // opened out again, the folded sheet no longer lies flat: each panel leans a little differently to the light
      const [v0, v1, hz] = FOLDS, poly = (pts, style) => { g.fillStyle = style; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill(); };
      poly([[-PAD, -PAD], [v0[0], v0[1]], [v0[2], v0[3]], [-PAD, H + PAD]], 'rgba(150,196,246,0.04)');
      poly([[v1[0], v1[1]], [W + PAD, -PAD], [W + PAD, H + PAD], [v1[2], v1[3]]], 'rgba(4,16,40,0.07)');
      poly([[-PAD, -PAD], [W + PAD, -PAD], [hz[2], hz[3]], [hz[0], hz[1]]], 'rgba(4,16,40,0.05)');
    }
    for (const f of FOLDS) creaseRelief(g, f[0], f[1], f[2], f[3]);
    for (const x of CREASE_X) L.speckle(g, { seed: 's07fl' + x, count: 110, x: x - 64, y: CREASE_Y - 64, w: 128, h: 128, rMin: 0.7, rMax: 2.2, colors: ['#c4daf0', '#8fb8e4'], alpha: [0.3, 0.8] });
    S = { sheet: L.filtered(paper, 'saturate(1.2) contrast(1.04)') };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H);
    // the camera pushes in across the drawing and slides a touch along the rim; zoom passes through 1.0 mid-shot so the edge stays on the shared arc
    const zoom = L.lerp(0.9756, 1.0244, p), rot = L.lerp(-0.004, 0.004, p);
    L.blit(ctx, env, S.sheet, { rot, zoom });
    // fixed raking light — the sheet slides underneath it
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = L.radial(ctx, 620, 260, 0, 1500, [[0, 'rgba(255,255,255,0.22)'], [0.5, 'rgba(255,255,255,0.03)'], [1, 'rgba(0,0,0,0.3)']]);
    ctx.fillRect(0, 0, W, H); ctx.restore();
    const gl = a.pt(L.lerp(-0.2, 0.14, p), 20);
    L.glow(ctx, gl.x, gl.y, 560, '#9cc8fa', 0.1);
    L.vignette(ctx, { strength: 0.22, color: '#04122a' });
  },
};
