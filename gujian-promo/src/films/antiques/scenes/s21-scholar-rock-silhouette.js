// s21 — 供石盆景剪影. Dusk on the scholar's desk, shot like a macro photograph against the light: the arc is the upper edge
// of a round incense stand dressed with moss and gravel. Everything below it is ink-black; against a rouge → aubergine
// glow stand a slender, perforated scholar's rock (瘦、皱、漏、透) on its fitted wooden stand and, beside it, a dwarf pine
// in a shallow pot on a low table. Nothing else.
//
// Recipe
//   sky   : per-pixel ramp of the distance above the arc (the glow hugs the table), taller and hotter behind the rock,
//           sinking toward aubergine on the right; dithered so the dark end never bands. Static.
//   ground: big pebbles and moss cushions painted far → near; every grain is a dark body whose top catches the glow as a
//           crescent — most of them dim, a few hot — so the horizon reads as backlit granules, not as a drawn line.
//   rock  : implicit field (knobby blobs along an S-shaped spine + crags + scooped hollows − through-holes) shaded per
//           pixel: grazing light on the up-left flanks and on the far walls of the holes, breaking up along the edge.
//   pine  : spline trunk and branches, three pads built from fans of single needles.
//   finish: rim light = shape minus the shape shifted away from the light; halation (the glow bleeding a few px into every
//           edge); depth of field (sharp on the rock and the crest, falling away to the right and toward the lens);
//           a bloom of the highlights added on top in draw().
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;
const FW = W + PAD * 2, FH = H + PAD * 2;
let S = null;

const INK = '#07040a';
const WINE = '#2d0719';          // what the black lifts to where the glow grazes it
const ROUGE = '#d81e4a';
const ROUGE_DIM = '#8a1436';
const HOT = '#f23f65';
const GLINT = '#ff8399';
const SINK = -3;                 // every foot stands 3 px into the gravel
const GROUP = { x: -40, y: 20, w: 740, h: 760 };     // frame rect holding the rock and the pine
const RK = 1.22;                 // scale of the rock's stand
const PK = 1.26;                 // scale of the pine, its pot and its table

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ───────────────────────── sky ─────────────────────────
function buildSky(env) {
  const a = env.arc, N = 1024, UMAX = 3.6;
  const ramp = L.makeRamp([[0, '#f3335c'], [0.07, '#e5254f'], [0.3, '#d41d4a'], [0.7, '#aa174e'], [1.15, '#7a1552'], [1.7, '#4b0f41'], [2.4, '#24082c'], [3.6, '#16051c']]
    .map(([t, c]) => [t / UMAX, c]));
  const lut = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const c = ramp(i / (N - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const img = new ImageData(W, H), d = img.data;
  let seed = 0x2545f491 | 0;
  for (let y = 0; y < H; y++) {
    const dy = y - a.cy;
    for (let x = 0; x < W; x++) {
      const dx = x - a.cx;
      const dr = Math.sqrt(dx * dx + dy * dy) - a.R;
      const bx = (x - 480) / 720, b = Math.exp(-bx * bx);          // the glow stands taller behind the rock and the pine
      let u = (dr > 0 ? dr : 0) / (290 * (0.7 + 0.68 * b));
      const rx = (x - 1100) / 900; u += 0.62 * (rx <= 0 ? 0 : rx >= 1 ? 1 : rx * rx * (3 - 2 * rx));   // … and sinks on the right
      let f = (u / UMAX) * (N - 1); if (f > N - 2) f = N - 2;
      const i0 = f | 0, t = f - i0, q = i0 * 3, o = (y * W + x) * 4;
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const dn = (((seed >>> 9) & 0xffff) / 65535 - 0.5) * 1.7;
      d[o] = lut[q] + (lut[q + 3] - lut[q]) * t + dn;
      d[o + 1] = lut[q + 1] + (lut[q + 4] - lut[q + 1]) * t + dn;
      d[o + 2] = lut[q + 2] + (lut[q + 5] - lut[q + 2]) * t + dn;
      d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(W, H);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ───────────────────────── ground: gravel + moss ─────────────────────────
/** one pebble: an irregular rounded blob; its body lifts toward wine near the glow, its top-left catches a rouge crescent */
function drawGrain(g, r, x, y, rad, lit, amb) {
  const n = r.int(6, 9), sq = r.range(0.62, 1), phi = r.range(-0.6, 0.6), cs = Math.cos(phi), sn = Math.sin(phi);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = ((i + r.range(-0.32, 0.32)) / n) * L.TAU, rr = rad * r.range(0.76, 1.14);
    const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * sq;
    pts.push([x + px * cs - py * sn, y + px * sn + py * cs]);
  }
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n], p2 = pts[(i + 2) % n];
    if (i === 0) g.moveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
    g.quadraticCurveTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
  }
  g.closePath();
  const body = amb > 0.02 ? L.mix(INK, WINE, L.clamp(amb)) : INK;
  const thin = r.range(0.42, 0.64);
  if (lit > 0.03) {
    const ox = x + rad * 0.36, oy = y + rad * 0.58;
    const gr = g.createRadialGradient(ox, oy, rad * 0.55, ox, oy, rad * 1.72);
    gr.addColorStop(0, body); gr.addColorStop(thin, body);
    gr.addColorStop(thin + 0.2, L.mix(body, ROUGE_DIM, L.clamp(lit * 1.3)));
    gr.addColorStop(0.9, L.mix(body, ROUGE, L.clamp(lit)));
    gr.addColorStop(1, L.mix(body, lit > 1 ? GLINT : HOT, L.clamp(lit)));
    g.fillStyle = gr;
  } else g.fillStyle = body;
  g.fill();
}

/** one moss cushion in a frame standing on the arc: a low dome bristling with leaf tips, some of them catching the light */
function drawMoss(g, r, w, hgt, lit, amb = 0) {
  const body = amb > 0.02 ? L.mix(INK, WINE, L.clamp(amb)) : INK;
  g.lineCap = 'round'; g.fillStyle = body;
  g.beginPath(); g.ellipse(0, 1, w / 2, hgt + 1, 0, Math.PI, L.TAU); g.lineTo(w / 2, hgt + 9); g.lineTo(-w / 2, hgt + 9); g.closePath(); g.fill();
  const n = Math.round(w * 1.25);
  for (let i = 0; i < n; i++) {
    const u = r(), ang = Math.PI * (1 + u), sx = (Math.cos(ang) * w) / 2, sy = Math.sin(ang) * hgt;
    const dir = -Math.PI / 2 + (u - 0.5) * 1.5 + r.gauss() * 0.42, len = r.range(2.5, 8.5) * (0.5 + 0.5 * Math.sin(Math.PI * u));
    const ex = sx + Math.cos(dir) * len, ey = sy + Math.sin(dir) * len;
    g.strokeStyle = body; g.lineWidth = r.range(1.2, 2.5);
    g.beginPath(); g.moveTo(sx, sy + 2); g.lineTo(ex, ey); g.stroke();
    if (lit > 0.05 && u < 0.7 && r.chance(0.55)) {
      const k = lit * r.range(0.3, 1.25);
      g.strokeStyle = L.rgba(k > 0.85 ? HOT : k > 0.45 ? ROUGE : ROUGE_DIM, L.clamp(k + 0.15));
      g.lineWidth = r.range(0.9, 1.7);
      g.beginPath(); g.moveTo(L.lerp(sx, ex, 0.3), L.lerp(sy, ey, 0.3)); g.lineTo(ex, ey); g.stroke();
    }
  }
}

/** how strongly the glow grazes the table top at theta: strongest from the pine to just past the crest */
const sideAt = (th) => L.lerp(0.1, 1, L.smooth((0.2 - th) / 0.3));

function makeGround(env) {
  const a = env.arc, r = L.rng('s21ground'), nz = L.makeNoise('s21g');
  const half = a.span(PAD + 60) * a.R;
  const patch = (th) => sideAt(th) * (0.3 + 0.7 * sstep(-0.35, 0.4, nz.n2((th * a.R) / 190, 4.2)));   // the sheen comes in patches
  const lump = (s) => 3.2 * nz.fbm(s / 180, 0.3, 2);                 // the horizon is lumpy, not ruled
  const items = [];
  // rows of grains: packed tight at the horizon (we look across the surface), opening up and growing toward the lens
  const rows = [0, 3, 7, 12, 18, 25, 33, 42, 53, 66, 81, 99, 120, 145, 175, 210, 250, 300];
  rows.forEach((d, k) => {
    const size = 10.5 + d * 0.13;
    let s = -half + r.range(0, size);
    while (s < half) {
      let rad = size * Math.exp(r.gauss() * 0.46);
      if (r.chance(0.09)) rad *= r.range(1.6, 2.3);                    // the odd big pebble
      rad = L.clamp(rad, 4.5, 46 + d * 0.1);
      const th = s / a.R;
      let top = -d + lump(s) * Math.exp(-d / 40) + (rad - size) * 0.22 + r.range(-2.6, 2.4);
      if (k < 3) top = L.clamp(top, -9, 7.5);                           // the edge itself stays on the arc
      const fall = Math.exp(-d / 30);
      items.push({ kind: 'g', d, th, rad, top, lit: patch(th) * fall * (0.14 + 1.55 * Math.pow(r(), 2.4)), amb: sideAt(th) * Math.exp(-d / 80) * r.range(0.4, 1) });
      s += rad * r.range(1.0, 1.8);
    }
  });
  // moss cushions scattered over the gravel
  for (const d of [0, 3, 7, 14, 25, 42]) {
    let s = -half + r.range(0, 260);
    while (s < half) {
      const w = r.range(54, 176) * (1 + d / 90), hgt = r.range(4, 9.5), th = s / a.R;
      if (nz.fbm(s / 330 + 3, d / 9 + 1.7, 2) > -0.02) {
        items.push({ kind: 'm', d, th, w, hgt, top: Math.min(2.2, -d + lump(s) * Math.exp(-d / 40) + r.range(-2, 1.5)), lit: patch(th) * Math.exp(-d / 30), amb: sideAt(th) * Math.exp(-d / 80) * 0.8 });
      }
      s += w * r.range(1.0, 2.6);
    }
  }
  items.sort((p, q) => p.d - q.d);
  return items;
}
function drawGround(g, env, items, seed) {
  const a = env.arc, r = L.rng(seed);
  for (const it of items) {
    if (it.kind === 'g') { const p = a.pt(it.th, it.top - it.rad * 0.85); drawGrain(g, r, p.x, p.y, it.rad, it.lit, it.amb); }
    else a.at(g, it.th, it.top - it.hgt, () => drawMoss(g, r, it.w, it.hgt, it.lit, it.amb));
  }
}

// ───────────────────────── scholar's rock ─────────────────────────
const ROX = 180, ROY = 505, RKW = 360, RKH = 535;   // the rock patch; its base (centre of the stand's top) sits at (ROX, ROY)
function buildRock(th) {
  const nA = L.makeNoise('s21rkA'), nB = L.makeNoise('s21rkB');
  const pre = (arr) => arr.map(([cx, cy, rx, ry, rot = 0]) => ({ cx, cy, rx, ry, c: Math.cos(rot), s: Math.sin(rot), m: Math.min(rx, ry) }));
  // x to the right, y UP from the base. 云头雨脚: a narrow foot, a wandering waist, a heavy overhanging head
  const blobs = pre([
    [6, 30, 40, 44], [-12, 98, 35, 50, -0.2], [-34, 162, 45, 40], [8, 212, 36, 44], [44, 262, 45, 34, 0.4],
    [12, 310, 33, 44], [-18, 374, 66, 54, -0.3], [38, 410, 37, 36], [0, 450, 25, 28, 0.2], [-74, 352, 32, 19, 0.35],
  ]);
  const holes = pre([[-18, 370, 22, 29, -0.4], [34, 276, 12, 19, 0.5], [-30, 158, 16, 23, 0.2], [8, 76, 7, 12], [36, 412, 8, 11]]);
  const F = new Float32Array(RKW * RKH).fill(-40), K = 7.5;
  for (let j = 0; j < RKH; j++) for (let i = 0; i < RKW; i++) {
    const x = i - ROX, y = ROY - j;
    const wx = x + 8 * nA.n2(x / 72 + 3.1, y / 72), wy = y + 8 * nA.n2(x / 72 - 9.4, y / 72 + 5.2);
    let acc = 1e-30;
    for (const b of blobs) {
      const dx = wx - b.cx, dy = wy - b.cy, u = (dx * b.c + dy * b.s) / b.rx, v = (-dx * b.s + dy * b.c) / b.ry;
      acc += Math.exp(((1 - Math.sqrt(u * u + v * v)) * b.m) / K);
    }
    let f = K * Math.log(acc);
    if (f < -26) continue;
    f += 11 * (nA.ridged(wx / 62, wy / 78, 2) - 0.5) + 1.5 * nB.fbm(wx / 21, wy / 21, 2);   // crags
    f -= 7 * L.smooth(1 - nB.cell(wx / 46 + 9.2, wy / 54 + 4.6).d * 1.9);                    // scooped hollows (弹窝)
    f -= 4 * Math.pow(nB.ridged(wx / 22 + 20, wy / 120, 2), 3);                             // upright furrows (皱)
    for (const h of holes) {
      const dx = wx - h.cx, dy = wy - h.cy, u = (dx * h.c + dy * h.s) / h.rx, v = (-dx * h.s + dy * h.c) / h.ry;
      const hd = (Math.sqrt(u * u + v * v) - 1) * h.m + 2.2 * nB.n2(wx / 14, wy / 14 + 40);
      if (hd < f) f = hd;
    }
    F[j * RKW + i] = f;
  }
  const img = new ImageData(RKW, RKH), d = img.data;
  const ink = L.parseColor(INK), hot = L.parseColor(HOT), dim = L.parseColor(ROUGE_DIM), wine = L.parseColor(WINE);
  const cs = Math.cos(th), sn = Math.sin(th);
  for (let j = 1; j < RKH - 1; j++) for (let i = 1; i < RKW - 1; i++) {
    const k = j * RKW + i, f = F[k];
    if (f < -3) continue;
    if (-(i - ROX) * sn + (j - ROY) * cs > 4) continue;            // the foot disappears into the stand
    const gx = (F[k + 1] - F[k - 1]) * 0.5, gy = (F[k + RKW] - F[k - RKW]) * 0.5, gm = Math.hypot(gx, gy) + 1e-3;
    const dist = f / gm;
    let al = dist / 1.3 + 0.5; if (al <= 0) continue; if (al > 1) al = 1;
    const o = k * 4, dd = dist > 0 ? dist : 0;
    let r0 = ink[0], g0 = ink[1], b0 = ink[2];
    if (dd < 60) {
      const ndl = Math.max(0, (gx * 0.8 + gy * 0.6) / gm);         // faces the glow (up and to the left)
      const tex = 0.35 + 1.15 * nB.ridged(i / 8, j / 11, 2);
      const vary = 0.12 + 0.88 * sstep(-0.3, 0.35, nA.n2(i / 58 + 7, j / 58));      // the rim comes and goes
      const core = Math.pow(ndl, 1.25) * Math.exp(-dd / 3.1) * vary;
      const sheen = ndl * Math.exp(-dd / 15) * tex * 0.5 * vary;
      const wrap = Math.exp(-dd / 1.5) * 0.22;                       // a hair of light bends round every edge
      const a0 = Math.min(1, sheen * 1.6), a1 = Math.min(1, sheen * 0.75 + core * 0.95 + wrap), a2 = Math.min(1, core * core);
      r0 += (wine[0] - r0) * a0; g0 += (wine[1] - g0) * a0; b0 += (wine[2] - b0) * a0;
      r0 += (dim[0] - r0) * a1; g0 += (dim[1] - g0) * a1; b0 += (dim[2] - b0) * a1;
      r0 += (hot[0] - r0) * a2; g0 += (hot[1] - g0) * a2; b0 += (hot[2] - b0) * a2;
    }
    d[o] = r0; d[o + 1] = g0; d[o + 2] = b0; d[o + 3] = al * 255;
  }
  const c = L.makeCanvas(RKW, RKH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ───────────────────────── furniture (paths in a frame standing on the arc: −y is up) ─────────────────────────
/** 随形木座: lipped top, recessed waist, cusped apron, two short hoof feet */
function standPath(g, hw, hgt) {
  const top = -hgt;
  g.beginPath();
  g.moveTo(-hw, top + 3); g.quadraticCurveTo(-hw, top, -hw + 4, top); g.lineTo(hw - 5, top - 1); g.quadraticCurveTo(hw, top - 1, hw, top + 3);
  g.lineTo(hw - 1, top + 7); g.lineTo(hw - 7, top + 8); g.lineTo(hw - 8, top + 13); g.lineTo(hw - 2, top + 15);
  g.quadraticCurveTo(hw + 1, -8, hw - 3, 0); g.lineTo(hw - 15, 0); g.quadraticCurveTo(hw - 13, -7, hw - 20, top + 21);
  g.quadraticCurveTo(0, top + 16, -hw + 20, top + 21);
  g.quadraticCurveTo(-hw + 13, -7, -hw + 15, 0); g.lineTo(-hw + 3, 0); g.quadraticCurveTo(-hw - 1, -8, -hw + 2, top + 15);
  g.lineTo(-hw + 8, top + 13); g.lineTo(-hw + 7, top + 8); g.lineTo(-hw + 1, top + 7);
  g.closePath();
}
/** 矮几: a thin top, a narrow apron, two legs turning in at the foot */
function tablePath(g, hw, hgt) {
  const top = -hgt;
  g.beginPath();
  g.moveTo(-hw - 3, top); g.lineTo(hw + 3, top); g.lineTo(hw + 3, top + 5); g.lineTo(hw - 4, top + 6);
  g.lineTo(hw - 3, -5); g.quadraticCurveTo(hw - 3, -1, hw - 9, 0); g.lineTo(hw - 14, 0); g.lineTo(hw - 12, top + 13);
  g.quadraticCurveTo(hw - 14, top + 10, hw - 26, top + 10); g.lineTo(-hw + 26, top + 10);
  g.quadraticCurveTo(-hw + 14, top + 10, -hw + 12, top + 13); g.lineTo(-hw + 14, 0); g.lineTo(-hw + 9, 0); g.quadraticCurveTo(-hw + 3, -1, -hw + 3, -5);
  g.lineTo(-hw + 4, top + 6); g.lineTo(-hw - 3, top + 5);
  g.closePath();
}
/** 浅盆: a shallow rectangular pot, sides leaning out to a lipped rim, on two small feet */
function potPath(g, y0) {
  g.beginPath();
  g.rect(-44, y0 - 4, 16, 5); g.rect(28, y0 - 4, 16, 5);
  g.moveTo(-50, y0 - 4); g.quadraticCurveTo(-56, y0 - 14, -58, y0 - 26); g.lineTo(-63, y0 - 27); g.lineTo(-63, y0 - 31);
  g.lineTo(63, y0 - 31); g.lineTo(63, y0 - 27); g.lineTo(58, y0 - 26); g.quadraticCurveTo(56, y0 - 14, 50, y0 - 4);
  g.closePath();
}

// ───────────────────────── pine ─────────────────────────
/** Catmull-Rom through [[x, y, width] …] → dense [[x, y, width] …] */
function spline(pts, step = 3) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const c = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1), Math.max(0.8, c(2))]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
/** a gnarled limb: the spline swept with its width, bark wobbling along both edges */
function limb(g, pts, seed, wob = 0.13) {
  const P = spline(pts), n = P.length, nz = L.makeNoise(seed), A = [], B = [];
  for (let i = 0; i < n; i++) {
    const p = P[Math.max(0, i - 2)], q = P[Math.min(n - 1, i + 2)];
    let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const w = P[i][2] * 0.5 * (1 + wob * nz.n2(i * 0.09, 1.3) + wob * 0.7 * nz.n2(i * 0.31, 7.7));
    const k = P[i][2] * 0.12 * nz.n2(i * 0.05, 21.4);
    A.push([P[i][0] + nx * (w + k), P[i][1] + ny * (w + k)]); B.push([P[i][0] - nx * (w - k), P[i][1] - ny * (w - k)]);
  }
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}
/** a pad of foliage (云片): tufts of single needles fanning up from twigs stacked into a flat-bottomed dome */
function pinePad(g, r, cx, cy, w, tilt, k) {
  const n = Math.max(4, Math.round(w / (14 * k))), cs = Math.cos(tilt), sn = Math.sin(tilt);
  g.lineCap = 'round'; g.strokeStyle = INK; g.fillStyle = INK;
  for (const [reach, lift] of [[1, 0], [0.7, 13], [0.36, 25]]) for (let i = 0; i <= n; i++) {
    const u = i / n + r.range(-0.035, 0.035), e = 2 * u - 1;
    if (Math.abs(e) > reach) continue;
    const lx = (e * w) / 2, ly = -(1 - e * e) * w * 0.09 - lift * k + r.range(-3, 3) * k;
    const tx = cx + lx * cs - ly * sn, ty = cy + lx * sn + ly * cs;
    g.beginPath(); g.ellipse(tx, ty, r.range(7, 10.5) * k, r.range(4.5, 7) * k, tilt, 0, L.TAU); g.fill();
    const cnt = Math.round(r.range(24, 36)), lean = e * 0.85 + tilt;
    for (let j = 0; j < cnt; j++) {
      const ang = -Math.PI / 2 + L.clamp(lean + r.gauss() * 0.55, -1.8, 1.8);
      const len = r.range(14, 26) * k, bend = r.range(-0.2, 0.2);
      g.lineWidth = r.range(1.1, 1.9) * k;
      g.beginPath(); g.moveTo(tx + r.range(-3, 3) * k, ty + r.range(-2, 2) * k);
      g.quadraticCurveTo(tx + Math.cos(ang + bend) * len * 0.55, ty + Math.sin(ang + bend) * len * 0.55, tx + Math.cos(ang) * len, ty + Math.sin(ang) * len);
      g.stroke();
    }
  }
}

// ───────────────────────── compositing helpers ─────────────────────────
/** a canvas covering the frame rect q = {x, y, w, h}; draw into it with frame coordinates */
function crop(q, draw) {
  const c = L.makeCanvas(q.w, q.h), g = c.getContext('2d');
  g.translate(-q.x, -q.y);
  if (draw) draw(g);
  return c;
}
/** rim light: the part of `layer` that is not covered by the same shapes (plus `occluder`) shifted away from the light */
function addRim(layer, occluder, sx, sy, color, alpha, soft, breakup) {
  const c = L.makeCanvas(layer.width, layer.height), g = c.getContext('2d');
  g.drawImage(layer, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(layer, sx, sy);
  if (occluder) g.drawImage(occluder, sx, sy);
  if (breakup) { g.globalCompositeOperation = 'destination-in'; g.drawImage(breakup, 0, 0, c.width, c.height); }
  const out = soft ? L.blurred(c, soft) : c;
  const lg = layer.getContext('2d');
  lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-atop'; lg.globalAlpha = alpha; lg.drawImage(out, 0, 0); lg.restore();
}
/** halation: the glow behind bleeds a few px into every edge of a padded layer (thin things — needles, twigs — soak up the most) */
function addWrap(layer, sky, soft, alpha) {
  const c = L.makeCanvas(FW, FH), g = c.getContext('2d');
  g.filter = 'blur(12px)';
  g.drawImage(sky, 0, 0, W, H, 0, 0, FW, FH);            // stretched a hair so the padding has glow behind it too
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-in'; g.drawImage(layer, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(L.blurred(layer, soft), 0, 0);
  const lg = layer.getContext('2d');
  lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalAlpha = alpha; lg.drawImage(c, 0, 0); lg.restore();
}
/** depth of field: three copies of the padded layer (sharp / soft / very soft) mixed by a per-pixel focus map */
function focusMix(layer, env) {
  const a = env.arc, q = 8, mw = Math.ceil(FW / q) + 1, mh = Math.ceil(FH / q) + 1;
  const maps = [0, 1, 2].map(() => new ImageData(mw, mh));
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const x = i * q - PAD, y = j * q - PAD, dr = a.drAt(x, y);
    // in focus from the pine to past the crest; the right-hand side and everything toward the lens fall away
    const t = Math.max(sstep(1120, 1940, x), 0.45 * sstep(120, -60, x), dr < 0 ? sstep(22, 240, -dr) : 0);
    const w0 = 1 - sstep(0, 0.5, t), w2 = sstep(0.5, 1, t), o = (j * mw + i) * 4;
    maps[0].data[o + 3] = Math.round(w0 * 255); maps[2].data[o + 3] = Math.round(w2 * 255);
    maps[1].data[o + 3] = 255 - maps[0].data[o + 3] - maps[2].data[o + 3];
  }
  const out = L.makeCanvas(FW, FH), og = out.getContext('2d');
  og.globalCompositeOperation = 'lighter';
  [0.7, 2.8, 7.5].forEach((px, k) => {
    const m = L.makeCanvas(mw, mh); m.getContext('2d').putImageData(maps[k], 0, 0);
    const c = L.blurred(layer, px), g = c.getContext('2d');
    g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(m, 0, 0, mw * q, mh * q);
    og.drawImage(c, 0, 0);
  });
  out._pad = PAD;
  return out;
}

function buildSilhouette(env, sky) {
  const a = env.arc;
  const thR = a.thetaAtX(502), thP = a.thetaAtX(290);
  const loc = (th, lx, ly) => { const p = a.pt(th, SINK), c = Math.cos(th), s = Math.sin(th); return [p.x + lx * c - ly * s, p.y + lx * s + ly * c]; };
  const STAND_H = 32;

  // ── the rock, upright on its tilted stand ──
  const rb = loc(thR, 0, -STAND_H * RK), base = { x: Math.round(rb[0]), y: Math.round(rb[1]) };
  const rock = crop(GROUP, (g) => g.drawImage(buildRock(thR), base.x - ROX, base.y - ROY));

  // ── stand, low table, pot, trunk and branches ──
  const B = loc(thP, 16 * PK, -61 * PK);
  const T = (pts) => pts.map(([x, y, w]) => [B[0] + x * PK, B[1] + y * PK, w * PK]);
  const vec = crop(GROUP, (g) => {
    g.fillStyle = INK;
    a.at(g, thR, SINK, () => { g.scale(RK, RK); standPath(g, 57, STAND_H); g.fill(); });
    a.at(g, thP, SINK, () => {
      g.scale(PK, PK);
      tablePath(g, 76, 24); g.fill(); potPath(g, -24); g.fill();
      g.translate(5, -55); drawMoss(g, L.rng('s21potmoss'), 104, 8, 0);
    });
    g.fillStyle = INK;
    limb(g, T([[5, 10, 46], [0, 0, 36], [-9, -30, 28], [-36, -56, 23], [-53, -92, 20], [-38, -128, 17], [-40, -164, 13], [-60, -192, 9], [-80, -212, 5]]), 's21trunk');
    limb(g, T([[-48, -88, 13], [-90, -100, 9], [-128, -96, 7], [-170, -90, 3.5]]), 's21br1');
    limb(g, T([[-40, -124, 11.5], [-10, -134, 8], [18, -128, 6], [46, -118, 3]]), 's21br2');
    limb(g, T([[-56, -186, 6.5], [-84, -200, 4.5], [-108, -204, 2.5]]), 's21br3');
    limb(g, T([[-62, -194, 5.5], [-50, -210, 3.5], [-36, -214, 2.5]]), 's21br4');
    // exposed roots gripping the soil
    limb(g, T([[-6, -9, 12], [-24, 0, 7.5], [-38, 5, 3]]), 's21root1', 0.1);
    limb(g, T([[8, -7, 11], [22, 1, 6.5], [33, 5, 3]]), 's21root2', 0.1);
  });
  const breakup = L.noiseTex(GROUP.w, GROUP.h, { seed: 's21brk', scale: 52, octaves: 2, res: 0.5, contrast: 1.9, ramp: [[0, 'rgba(0,0,0,0.06)'], [0.45, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']] });
  addRim(vec, rock, 6, 4.6, ROUGE_DIM, 0.55, 2.4, breakup);
  addRim(vec, rock, 2.2, 1.7, HOT, 0.9, 0.7, breakup);

  const needles = crop(GROUP, (g) => {
    const r = L.rng('s21needles');
    pinePad(g, r, B[0] - 138 * PK, B[1] - 100 * PK, 128 * PK, -0.04, PK);
    pinePad(g, r, B[0] + 20 * PK, B[1] - 132 * PK, 84 * PK, 0.12, PK);
    pinePad(g, r, B[0] - 72 * PK, B[1] - 216 * PK, 104 * PK, 0.03, PK);
  });
  addRim(needles, null, 1.7, 1.3, '#c21c45', 0.42, 0.6, breakup);

  // ── ground + objects, far to near ──
  const items = makeGround(env), far = items.filter((it) => it.d < 1.5), near = items.filter((it) => it.d >= 1.5);
  const sil = L.makeLayer(PAD, (g) => {
    // the table: ink, lifting to wine just under the lit edge on the side the glow comes from
    a.fillBelow(g, INK, -5);
    g.save(); a.clipBelow(g, -5);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 220, a.R, [[0, L.rgba(WINE, 0)], [0.6, L.rgba(WINE, 0.22)], [1, L.rgba(WINE, 0.7)]]);
    g.fillRect(-PAD, -PAD, FW, FH);
    g.fillStyle = L.linear(g, 800, 0, W + PAD, 0, [[0, L.rgba(INK, 0)], [1, L.rgba(INK, 0.9)]]);
    g.fillRect(-PAD, -PAD, FW, FH);
    g.restore();
    drawGround(g, env, far, 's21far');
    g.drawImage(rock, GROUP.x, GROUP.y); g.drawImage(vec, GROUP.x, GROUP.y); g.drawImage(needles, GROUP.x, GROUP.y);
    drawGround(g, env, near, 's21near');
  });
  addWrap(sil, sky, 9, 0.5);
  addWrap(sil, sky, 3, 0.3);
  return focusMix(sil, env);
}

/** the highlights only (the layer multiplied by itself drops everything dark), blurred: added back in draw() as bloom */
function buildBloom(sil) {
  const c = L.makeCanvas(FW, FH), g = c.getContext('2d');
  g.drawImage(sil, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.drawImage(sil, 0, 0);
  const out = L.blurred(c, 10);
  out._pad = PAD;
  return out;
}

export default {
  name: '供石盆景剪影',
  tone: 'light',
  init(env) {
    const sky = buildSky(env);
    const sil = buildSilhouette(env, sky);
    S = { sky, sil, bloom: buildBloom(sil) };
  },
  draw(ctx, env, p) {
    // the sky holds still; rock, pine and the grains of the table top slide along the arc
    const rot = L.lerp(-0.0045, 0.0045, p);
    ctx.drawImage(S.sky, 0, 0);
    L.blit(ctx, env, S.sil, { rot });
    L.blit(ctx, env, S.bloom, { rot, blend: 'lighter', alpha: 0.6 });
  },
};
