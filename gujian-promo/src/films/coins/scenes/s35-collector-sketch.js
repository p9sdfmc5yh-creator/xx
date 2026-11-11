// s35 — 泉友手稿. One page of a coin collector's notebook: apricot-yellow old paper, burnt-black ink.
// The arc is the outline of a big round coin thrown down in ONE brush stroke — it presses, lifts, runs dry (飞白) on the
// right, and is re-stated there by a second, wetter stroke that does not quite agree with the first.
// Under it, dashed off at speed and crowding each other: a knife coin (弧背、凹刃、柄端圆环; the blade blacked in with
// racing vertical scribble), a pointed-foot spade coin (平首、方肩、束腰、两尖足、中间一道竖线) and a round coin with a
// round hole (圜钱) beside a few loops of pen-testing. No writing anywhere on the sheet.
// Everything is drawn once in init(): paper → pale wash → pale ink → two dark-ink layers that shiver a pixel or two
// against each other from frame to frame (the hand never traces the same line twice).
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 90;
const INK = '#1a1612', INK_L = '#6b6052';
const LW = 1.6;                               // global line weight: the shot lasts 6 frames, so the hand is bold
const NZ = L.makeNoise('c35pen');
let S = null;

const bump = (x, c, w) => { const d = (x - c) / w; return Math.exp(-d * d); };
const sstep = (a, b, x) => L.smooth((x - a) / (b - a));

// ───────────────────────── the hand ─────────────────────────
/**
 * One pull of the pen: blunt wet head, thinner fast middle, flicked tail; the width breathes, the line may skip.
 * opts: w, seed, prof ('pen' | 'leaf' | 'flat'), tin/tout (taper fractions), head, wob, gap (0..0.5 → skips), jit, step, abs (ignore LW),
 *       sharp (don't round the corners: for zig-zag scribble)
 */
function pen(g, pts, o = {}) {
  const w = (o.w === undefined ? 2.2 : o.w) * (o.abs ? 1 : LW), seed = o.seed === undefined ? 1 : o.seed;
  const p = o.sharp ? densify(pts, o.step || 3) : L.smoothPath(pts, o.step || 3);
  const n = p.length; if (n < 2) return;
  const prof = o.prof || 'pen', tin = o.tin === undefined ? 0.07 : o.tin, tout = o.tout === undefined ? 0.3 : o.tout;
  const head = o.head === undefined ? 1.35 : o.head, wob = o.wob === undefined ? 0.36 : o.wob, gap = o.gap || 0, jit = o.jit || 0;
  const minW = o.minW === undefined ? 0.8 : o.minW, fq = o.freq || 5, sd = seed * 0.731, gf = o.gapFreq || 4;
  g.lineCap = 'round';
  let px = p[0][0], py = p[0][1];
  for (let i = 1; i < n; i++) {
    const u = i / (n - 1);
    let k;
    if (prof === 'leaf') k = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.85) + 0.07;
    else if (prof === 'flat') k = 1;
    else {
      k = u < tin ? L.lerp(head * 0.75, head, u / tin) : u < tin * 3 ? L.lerp(head, 0.86, (u - tin) / (tin * 2)) : 0.86;
      if (tout > 0 && u > 1 - tout) k *= Math.pow((1 - u) / tout, 0.75);
    }
    k *= 1 + wob * NZ.n2(u * fq + sd * 5.3, sd * 2.9);
    const x = p[i][0] + (jit ? jit * NZ.n2(i * 0.17 + sd, 5.5 + sd) : 0), y = p[i][1] + (jit ? jit * NZ.n2(i * 0.17 - sd, 9.5 - sd) : 0);
    if (!(gap > 0 && NZ.n2(u * gf + sd * 7.1, 3.3 + sd) > 1 - gap * 2)) {
      g.lineWidth = Math.max(minW, w * k);
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    }
    px = x; py = y;
  }
}
/** straight-line resample of a polyline (keeps corners pointed, unlike smoothPath) */
function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 1; j <= n; j++) out.push([L.lerp(a[0], b[0], j / n), L.lerp(a[1], b[1], j / n)]);
  }
  return out;
}
/** an ink blot with a lumpy outline */
function blot(g, x, y, rad, seed) {
  g.beginPath();
  for (let i = 0; i <= 22; i++) {
    const a = (i / 22) * L.TAU, rr = rad * (1 + 0.3 * NZ.n2(Math.cos(a) * 1.4 + seed, Math.sin(a) * 1.4 - seed));
    const X = x + Math.cos(a) * rr, Y = y + Math.sin(a) * rr * 0.9;
    if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
  }
  g.closePath(); g.fill();
}
/** droplets flung off the brush in one direction */
function spatter(g, r, x, y, ang, n, reach) {
  for (let i = 0; i < n; i++) {
    const d = reach * Math.pow(r(), 0.7), a = ang + r.gauss() * 0.35;
    blot(g, x + Math.cos(a) * d, y + Math.sin(a) * d, L.lerp(4, 1.1, d / reach) * r.range(0.6, 1.3), i * 3.3 + x);
  }
}
/** zig-zag scribble from A to B (pen never lifted) */
function zig(g, r, x0, y0, x1, y1, amp, pitch, o = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len, sk = o.skew || 0;
  const pts = [];
  for (let d = 0, i = 0; d <= len; d += pitch * r.range(0.55, 1.6), i++) {
    const t = d / len, s = (i % 2 ? 1 : -1) * amp * r.range(0.4, 1.3) * (o.fade ? 1 - t * o.fade : 1);
    pts.push([x0 + ux * d - uy * s + ux * s * sk, y0 + uy * d + ux * s + uy * s * sk]);
  }
  if (pts.length > 1) pen(g, pts, { w: 1.8, tin: 0.03, tout: 0.1, wob: 0.4, freq: 12, sharp: true, jit: 1.3, ...o });
}
/**
 * Parallel hatching over a region. inside(x,y) → bool, bb = [x0,y0,x1,y1], ang = stroke direction, gap = spacing.
 * opts: w, zig (join the strokes into one racing zig-zag), skip, lift (prob. of lifting the pen in zig mode), over (px over/under-shoot;
 *       over0 / over1 set it separately for the start / end of each stroke), wild (prob. that a stroke runs far past its mark)
 */
function hatch(g, r, inside, bb, ang, gap, o = {}) {
  const [x0, y0, x1, y1] = bb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
  const c = Math.cos(ang), s = Math.sin(ang), nx = -s, ny = c;
  const runs = [];
  for (let d = -rad; d <= rad; d += gap * r.range(0.6, 1.4)) {
    let st = null;
    for (let t = -rad; t <= rad + 4; t += 4) {
      const x = cx + nx * d + c * t, y = cy + ny * d + s * t;
      const ins = t <= rad && x >= x0 && x <= x1 && y >= y0 && y <= y1 && inside(x, y);
      if (ins && st === null) st = t;
      else if (!ins && st !== null) { if (t - st > (o.minLen || 8)) runs.push([d, st, t - 4]); st = null; }
    }
  }
  const ov = o.over === undefined ? 4 : o.over, w = o.w || 1.8, seed = o.seed || 1;
  const P = (d, t) => [cx + nx * d + c * t, cy + ny * d + s * t];
  if (o.zig) {
    let pts = [], flip = false, k = 0;
    const flush = () => { if (pts.length > 1) pen(g, pts, { w: w * r.range(0.8, 1.25), seed: seed + (k++) * 3.1, tin: 0.02, tout: 0.05, wob: 0.4, freq: 18, sharp: !o.round, jit: 1.4 }); pts = []; };
    for (const [d, a0, a1] of runs) {
      if (r.chance(o.skip || 0)) { flush(); continue; }
      const wild = o.wild || 0;
      const ovA = o.over0 === undefined ? ov : o.over0, ovB = o.over1 === undefined ? ov : o.over1;
      const A = P(d, a0 - r.range(-ovA * 0.4, ovA) * (r.chance(wild) ? r.range(2, 4) : 1)), B = P(d, a1 + r.range(-ovB * 0.4, ovB) * (r.chance(wild) ? r.range(1.5, 3) : 1));
      if (flip) pts.push(B, A); else pts.push(A, B);
      flip = !flip;
      if (r.chance(o.lift === undefined ? 0.1 : o.lift)) flush();
    }
    flush();
  } else {
    runs.forEach(([d, a0, a1], i) => {
      if (r.chance(o.skip || 0)) return;
      const A = P(d, a0 - r.range(-ov, ov)), B = P(d, a1 + r.range(-ov, ov));
      const m = [(A[0] + B[0]) / 2 + nx * r.range(-2.5, 2.5), (A[1] + B[1]) / 2 + ny * r.range(-2.5, 2.5)];
      pen(g, r.chance(o.rev === undefined ? 0.5 : o.rev) ? [A, m, B] : [B, m, A], { w: w * r.range(0.8, 1.25), seed: seed + i * 1.7, tout: 0.45, head: 1.45 });
    });
  }
}
/** a circle thrown round `turns` times without lifting: the passes never coincide. opts: drift (radius change), sq (squash), slide [dx,dy] */
function loop(g, cx, cy, rad, turns, a0, o = {}) {
  const n = Math.max(14, Math.round(turns * 30)), pts = [], sd = o.seed || 1, drift = o.drift || 0, sq = o.sq === undefined ? 1 : o.sq;
  const sl = o.slide || [0, 0], rough = o.rough === undefined ? 0.04 : o.rough, dir = o.ccw ? -1 : 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + dir * t * turns * L.TAU;
    const k = 1 + drift * (t - 0.5) + rough * NZ.n2(Math.cos(a) * 1.2 + sd * 3.1 + t * 2.3, Math.sin(a) * 1.2 - sd * 1.7);
    pts.push([cx + Math.cos(a) * rad * k + sl[0] * t, cy + Math.sin(a) * rad * k * sq + sl[1] * t]);
  }
  pen(g, pts, { tin: 0.03, tout: 0.12, wob: 0.3, freq: 7, step: 3, ...o });
}
function inPoly(poly, x, y) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}
const fillPoly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };

// ───────────────────────── the arc: one brush stroke, re-stated on the right ─────────────────────────
const T2 = 0.166;                              // where the second stroke (复笔) is set down
function drawArcStroke(g, a) {
  const s = a.span(PAD + 140), NB = 20, dth = 2.4 / a.R;
  const r = L.rng('c35arc');
  // a brush is a bundle of bristles: where the ink load runs low they separate → 飞白
  const pull = (t0, t1, widthAt, loadAt, drAt, key) => {
    for (let b = 0; b < NB; b++) {
      const off = b / (NB - 1) - 0.5, edge = Math.abs(off) * 2, dry = r();
      let prev = null;
      for (let th = t0; th <= t1; th += dth) {
        const w = widthAt(th);
        const q = a.pt(th, drAt(th) + off * w + 0.5 * NZ.n2(th * 230 + b * 5.1, key));
        const ink = loadAt(th) + 0.3 * NZ.n2(th * 34 + key * 3, off * 4.6 + key) + 0.36 * NZ.n2(th * 4.5 + key, off * 6.5 - key * 2) - 0.14 * edge * edge - 0.1 * dry;
        if (prev && ink > 0.3) {
          g.lineWidth = Math.max(0.7, (w / NB) * 2.2 * L.clamp(0.55 + ink * 0.7, 0.5, 1.25));
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(q.x, q.y); g.stroke();
        }
        prev = q;
      }
    }
  };
  g.lineCap = 'round';
  // first pull: set down hard at the far left, presses again near the crest, then the brush empties: past the crest
  // the bristles split (飞白) and the line climbs a little as it runs dry toward the right edge
  pull(-s, s,
    (th) => 14.5 + 7 * bump(th, -0.372, 0.04) + 5 * bump(th, -0.07, 0.07) - 3.6 * bump(th, -0.225, 0.06) + 5.5 * bump(th, 0.095, 0.05) - 5.5 * sstep(0.14, 0.3, th) + 1.6 * NZ.n2(th * 16, 2.2),
    (th) => 1.05 - 0.4 * bump(th, -0.23, 0.05) - 0.72 * sstep(0.02, 0.11, th) + 0.1 * sstep(0.2, 0.3, th),
    (th) => 1.1 * NZ.n2(th * 7, 4.4) - 0.4 + 9.6 * sstep(0.12, 0.3, th), 1.7);
  // second pull (复笔): brush re-charged, set down a little low and carried to the edge; it wanders against the first
  pull(T2, s,
    (th) => 12.6 + 9 * bump(th, T2 + 0.012, 0.016) - 2.6 * bump(th, 0.3, 0.05) + 1.6 * NZ.n2(th * 16, 6.2),
    (th) => 1.1 - 0.26 * bump(th, 0.365, 0.04),
    (th) => -3.2 - 4 * Math.exp(-(th - T2) / 0.04) + 1.9 * Math.sin((th - T2) * 31) + 1.0 * NZ.n2(th * 7, 9.4), 5.3);
  const h = a.pt(T2 + 0.002, -7.6); blot(g, h.x, h.y, 12, 3.1);
  // drops shaken off where the brush came down
  spatter(g, r, h.x - 4, h.y + 20, 1.9, 6, 62);
  const d0 = a.pt(-0.376, 0); spatter(g, r, d0.x + 6, d0.y + 20, 1.2, 5, 56);
}

// ───────────────────────── knife coin (刀币) ─────────────────────────
// The back (弧背) is a shallow convex curve from the ring end to the tip; everything else hangs off it on the inner,
// concave side: the narrow handle, then — after a step — the wider blade whose lower outline is the concave edge (凹刃).
const KP0 = [522, 984], KP1 = [1230, 628], KSAG = 38;
const KDX = KP1[0] - KP0[0], KDY = KP1[1] - KP0[1], KC = Math.hypot(KDX, KDY);
const KD = [KDX / KC, KDY / KC], KNU = [KD[1], -KD[0]];           // chord direction; normal toward the convex (back) side
const kB = (u) => { const b = 4 * KSAG * u * (1 - u); return [KP0[0] + KDX * u + KNU[0] * b, KP0[1] + KDY * u + KNU[1] * b]; };
const kT = (u) => { const k = 4 * KSAG * (1 - 2 * u), tx = KDX + KNU[0] * k, ty = KDY + KNU[1] * k, m = Math.hypot(tx, ty); return [tx / m, ty / m]; };
const kP = (u, w) => { const b = kB(u), t = kT(u); return [b[0] - t[1] * w, b[1] + t[0] * w]; };   // w px in from the back
const U_SH = 0.36, U_END = 0.868, HW = 45, RING = 31;
const kW = (u) => (u < U_SH ? HW : HW + 52 * sstep(U_SH, U_SH + 0.15, u) + 11 * sstep(U_SH + 0.15, 0.86, u));
const kUV = (x, y) => {
  let u = ((x - KP0[0]) * KD[0] + (y - KP0[1]) * KD[1]) / KC;
  for (let i = 0; i < 2; i++) { const b = kB(u), t = kT(u); u += ((x - b[0]) * t[0] + (y - b[1]) * t[1]) / KC; }
  const b = kB(u), t = kT(u);
  return [u, -(x - b[0]) * t[1] + (y - b[1]) * t[0]];
};
const kMaxW = (u) => (u <= U_END ? kW(u) : (kW(U_END) * (1 - u)) / (1 - U_END));
function inBlade(x, y, m = 0) {
  const [u, w] = kUV(x, y);
  if (u < U_SH + 0.05 || u > 1) return false;
  return w > m + 2 && w < kMaxW(u) - m;
}
const kRing = () => { const b = kB(0), t = kT(0); return [b[0] - t[0] * (RING - 4) - t[1] * HW * 0.5, b[1] - t[1] * (RING - 4) + t[0] * HW * 0.5]; };
const knifePoly = () => {
  const pts = [];
  for (let i = 0; i <= 30; i++) pts.push(kP(i / 30, 0));
  for (let i = 0; i <= 30; i++) { const u = L.lerp(U_END, 0, i / 30); pts.push(kP(u, kW(u))); }
  return pts;
};
const bladePoly = (inset = 0) => {
  const pts = [];
  for (let i = 0; i <= 24; i++) pts.push(kP(L.lerp(U_SH + 0.05, 1, i / 24), inset));
  for (let i = 0; i <= 24; i++) { const u = L.lerp(U_END, U_SH + 0.05, i / 24); pts.push(kP(u, kW(u) - inset)); }
  return pts;
};

function drawKnife(g, r) {
  const line = (u0, u1, wf, n, o) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const u = L.lerp(u0, u1, i / n); pts.push(kP(u, typeof wf === 'function' ? wf(u) : wf)); }
    pen(g, pts, o);
  };
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of bladePoly()) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  const bb = [x0 - 4, y0 - 4, x1 + 4, y1 + 4], V = Math.PI / 2;
  // 1) the blade blacked in with racing up-and-down scribble: four goes at it, none tidy. Thinner along the back (paper
  //    still glints through), piled up toward the edge; the last, loosest go loops out past the outline
  hatch(g, r, (x, y) => inBlade(x, y, 0), bb, V + 0.07, 9.4, { w: 2.1, zig: true, lift: 0.08, over0: 9, over1: 4, wild: 0.06, seed: 210 });
  hatch(g, r, (x, y) => { const [u, w] = kUV(x, y); return inBlade(x, y, 2) && w > kW(u) * 0.28; }, bb, V - 0.2, 11, { w: 2.4, zig: true, lift: 0.15, skip: 0.06, over0: 6, over1: 4, wild: 0.04, seed: 230 });
  hatch(g, r, (x, y) => { const [u, w] = kUV(x, y); return inBlade(x, y, 3) && w > kW(u) * 0.5 && u > 0.48 && u < 0.93; }, bb, V + 0.24, 9, { w: 2.8, zig: true, lift: 0.2, over: 6, seed: 250 });
  hatch(g, r, (x, y) => inBlade(x, y, 0), bb, V - 0.06, 15, { w: 1.7, zig: true, round: true, lift: 0.22, skip: 0.2, over0: 22, over1: 7, wild: 0.14, seed: 255 });
  // 2) a few of those strokes got away from the hand altogether
  for (const [u, up, dn, bow, sd] of [[0.5, 66, 14, 10, 1], [0.6, 30, 40, -14, 2], [0.69, 92, 16, 16, 3], [0.78, 44, 46, -8, 4], [0.85, 24, 18, 12, 5]]) {
    const top = kP(u, 8), bot = kP(u + 0.004, kW(u) - 8);
    pen(g, [[bot[0] + bow * 0.4, bot[1] + dn], [(top[0] + bot[0]) / 2 + bow, (top[1] + bot[1]) / 2], [top[0] - bow * 0.3, top[1] - up]], { w: r.range(1.7, 2.5), seed: 260 + sd, tin: 0.05, tout: 0.5, head: 1.3 });
  }
  // 3) outline. the back (弧背): one confident pull from the ring to the point, flicked past it; then a thinner second go
  line(-0.03, 1.035, (u) => -1 + 1.6 * NZ.n2(u * 4, 1.1), 26, { w: 5.4, seed: 201, tin: 0.03, tout: 0.07, head: 1.25, wob: 0.3, freq: 8 });
  line(0.1, 0.985, (u) => -8 + 4 * NZ.n2(u * 3, 3.9), 18, { w: 1.6, seed: 209, tout: 0.3, gap: 0.14, gapFreq: 7 });
  line(U_SH + 0.06, 0.965, (u) => 8 + 2 * NZ.n2(u * 5, 3.3), 16, { w: 1.8, seed: 202, tout: 0.2, gap: 0.1, gapFreq: 8 });   // raised rim just inside the back
  // underside of the handle, swelling out into the long concave edge (凹刃)
  line(-0.02, U_SH + 0.02, (u) => kW(u) + 1.5 * NZ.n2(u * 9, 5.1), 12, { w: 3.6, seed: 203, tin: 0.05, tout: 0.14 });
  line(U_SH - 0.03, U_END + 0.014, (u) => kW(u) + 1.6 * NZ.n2(u * 6, 7.7), 44, { w: 5.2, seed: 204, tin: 0.03, tout: 0.07, head: 1.3, wob: 0.32, freq: 9 });
  line(U_SH + 0.1, U_END - 0.02, (u) => kW(u) + 8 + 3 * NZ.n2(u * 5, 8.8), 14, { w: 1.6, seed: 205, tout: 0.3, gap: 0.2, gapFreq: 7 });   // the edge, re-stated a hair outside
  // the oblique end: from the edge up to the point, which belongs to the back
  {
    const e = kP(U_END, kW(U_END)), tip = kB(1), t = kT(0.95);
    const dx = tip[0] - e[0], dy = tip[1] - e[1], m = Math.hypot(dx, dy);
    pen(g, [[e[0] - (dx / m) * 13, e[1] - (dy / m) * 13], [(e[0] + tip[0]) / 2 - t[0] * 12, (e[1] + tip[1]) / 2 - t[1] * 12], [tip[0] + (dx / m) * 18, tip[1] + (dy / m) * 18]], { w: 5, seed: 206, tin: 0.05, tout: 0.16, head: 1.3 });
  }
  // two raised lines down the handle (they run a little way onto the blade)
  line(0.0, U_SH + 0.07, (u) => 14 + 1.2 * NZ.n2(u * 7, 2.4), 10, { w: 2, seed: 207, tout: 0.25, gap: 0.05, gapFreq: 6 });
  line(0.012, U_SH + 0.05, (u) => 28 + 1.2 * NZ.n2(u * 7, 6.4), 10, { w: 1.8, seed: 208, tout: 0.3, gap: 0.08, gapFreq: 6 });
  // 4) the ring at the end of the handle: thrown round nearly twice — small and round, only a little wider than the handle
  const [rx, ry] = kRing();
  loop(g, rx, ry, RING, 1.8, 0.6, { w: 4.2, seed: 211, drift: 0.06, rough: 0.04 });
  loop(g, rx + 0.5, ry, RING * 0.47, 1.35, 2.2, { w: 2.6, seed: 212, drift: -0.08, rough: 0.06 });
  { const j = kP(0.0, HW * 0.5); blot(g, j[0] - 1, j[1] + 1, 6, 4.4); }
}
/** the shadow the knife throws on the page: short slanting strokes tucked under the edge and the handle (pale ink) */
function drawKnifeShadow(g, r) {
  const KN = knifePoly(), SH = KN.map(([x, y]) => [x + 22, y + 30]), [rx, ry] = kRing();
  hatch(g, r, (x, y) => inPoly(SH, x, y) && !inPoly(KN, x, y) && Math.hypot(x - rx, y - ry) > RING + 4, [KP0[0] - 60, KP1[1] - 40, KP1[0] + 60, KP0[1] + 120], 2.2, 9.5, { w: 1.9, over: 3, skip: 0.08, rev: 0.85, minLen: 6, seed: 270 });
}

// ───────────────────────── pointed-foot spade coin (平首尖足布) ─────────────────────────
const SPX = 318, SPY = 760, SPA = -0.08, SPK = 0.97;
const SPC = Math.cos(SPA) * SPK, SPS = Math.sin(SPA) * SPK;
const sp = (pts) => pts.map(([x, y]) => [SPX + x * SPC - y * SPS, SPY + x * SPS + y * SPC]);
// flat head · square shoulders · waisted sides · two separate pointed feet with an inverted-V crotch (local coords, y down)
const SP_OUT = [[-33, -84], [33, -84], [32, 0], [98, 3], [90, 70], [87, 135], [95, 225], [108, 290], [64, 226], [20, 173], [0, 158],
  [-20, 173], [-64, 226], [-108, 290], [-95, 225], [-87, 135], [-90, 70], [-98, 3], [-32, 0]];
const SP_POLY = sp(SP_OUT);
function drawSpade(g, r) {
  const P = (pts, o) => pen(g, sp(pts), o);
  // head (首): three strokes whose corners overshoot
  P([[-33, 10], [-35, -38], [-34, -92]], { w: 3.6, seed: 301, tout: 0.22 });
  P([[-46, -83], [0, -86], [44, -83]], { w: 4.2, seed: 302, tin: 0.06, tout: 0.25 });
  P([[33, -93], [34, -40], [32, 9]], { w: 3.5, seed: 303, tout: 0.25 });
  // square shoulders (肩)
  P([[-26, 0], [-64, 2], [-107, 4]], { w: 4.2, seed: 304, tout: 0.2 });
  P([[27, 1], [64, 1], [108, 3]], { w: 4, seed: 305, tout: 0.2 });
  // waisted sides (腰) running down into the outer edge of each foot
  P([[-98, -9], [-90, 70], [-86, 135], [-94, 225], [-110, 297]], { w: 4.6, seed: 306, tin: 0.04, tout: 0.12, head: 1.3 });
  P([[99, -8], [90, 70], [87, 135], [95, 225], [111, 299]], { w: 4.8, seed: 307, tin: 0.04, tout: 0.12, head: 1.3 });
  // the crotch (裆): two strokes meeting in an inverted V, so the feet stand apart
  P([[-111, 295], [-64, 226], [-21, 174], [2, 154]], { w: 4, seed: 308, tin: 0.05, tout: 0.14 });
  P([[-5, 155], [20, 173], [64, 226], [113, 298]], { w: 4, seed: 309, tin: 0.05, tout: 0.16 });
  // one vertical line down the middle, from the head to the crotch
  P([[0, -78], [1.5, 40], [0, 154]], { w: 3, seed: 310, tin: 0.05, tout: 0.25 });
  // the raised rim, ticked in just inside the outline where the hand remembered it
  P([[-88, 14], [-79, 132], [-86, 218], [-96, 262]], { w: 1.6, seed: 311, tout: 0.3, gap: 0.12, gapFreq: 6 });
  P([[89, 16], [79, 130], [86, 220], [97, 266]], { w: 1.7, seed: 312, tout: 0.3, gap: 0.1, gapFreq: 6 });
  P([[-96, 260], [-60, 208], [-22, 163]], { w: 1.5, seed: 313, tout: 0.35, gap: 0.14 });
  P([[97, 262], [60, 208], [24, 164]], { w: 1.5, seed: 316, tout: 0.35, gap: 0.14 });
  P([[-24, -74], [-24, -6]], { w: 1.4, seed: 314, tout: 0.4, gap: 0.1 });
  P([[-88, 12], [-30, 10]], { w: 1.4, seed: 315, tout: 0.4, gap: 0.12 });
  P([[30, 11], [88, 12]], { w: 1.4, seed: 317, tout: 0.4, gap: 0.12 });
  // its shadow: slanting strokes hugging the right-hand side, outside the outline — the coin itself stays open paper
  const SH = SP_POLY.map(([x, y]) => [x + 30, y + 13]);
  hatch(g, r, (x, y) => inPoly(SH, x, y) && !inPoly(SP_POLY, x, y), [SPX - 40, SPY - 100, SPX + 190, SPY + 330], 2.2, 8.5, { w: 1.7, over: 3, skip: 0.06, rev: 0.85, minLen: 6, seed: 320 });
  // ground under the feet: tight scribble
  const f = sp([[-140, 304], [40, 310], [70, 300], [200, 296]]);
  zig(g, r, f[0][0], f[0][1], f[1][0], f[1][1], 5, 22, { w: 1.5, seed: 340, fade: 0.4, skew: 0.5 });
  zig(g, r, f[2][0], f[2][1], f[3][0], f[3][1], 8, 12, { w: 1.6, seed: 341, fade: 0.6, skew: 0.8 });
}

// ───────────────────────── round coin with a round hole (圜钱) + loops of pen-testing ─────────────────────────
const HQX = 1418, HQY = 848, HQR = 138, HQH = 28;
function drawHuan(g, r) {
  // the rim, thrown round twice; the hole, small and round, scribbled black
  loop(g, HQX, HQY, HQR, 2.12, -2.3, { w: 4.6, seed: 401, drift: 0.05, rough: 0.035, tout: 0.1 });
  loop(g, HQX + 2, HQY + 1, HQR - 12, 0.62, 0.1, { w: 1.7, seed: 402, rough: 0.04, tout: 0.4, gap: 0.1 });
  loop(g, HQX, HQY, HQH, 1.5, 1.0, { w: 3.8, seed: 403, drift: -0.1, rough: 0.07 });
  loop(g, HQX + 1, HQY + 1, HQH * 0.52, 2.6, 0.3, { w: 3.4, seed: 404, drift: -0.5, rough: 0.12 });
  // shade: a thin crescent of hatching inside the lower-right rim (the coin has thickness), and its shadow outside it
  const bb = [HQX - HQR - 10, HQY - HQR - 10, HQX + HQR + 40, HQY + HQR + 40];
  const cres = (x, y, ox, oy) => { const d = Math.hypot(x - HQX, y - HQY); return d < HQR - 7 && d > HQH + 9 && Math.hypot(x - HQX + ox, y - HQY + oy) > HQR - 4; };
  hatch(g, r, (x, y) => cres(x, y, 15, 17), bb, 2.2, 8.5, { w: 1.6, over: 2, skip: 0.06, rev: 0.85, minLen: 5, seed: 410 });
  hatch(g, r, (x, y) => Math.hypot(x - HQX, y - HQY) > HQR + 5 && Math.hypot(x - HQX - 24, y - HQY - 28) < HQR + 2, bb, 2.2, 9, { w: 1.7, over: 3, skip: 0.08, rev: 0.85, minLen: 6, seed: 430 });
}
function drawTrialLoops(g) {
  // 试笔: coils and single turns, the brush just being run to see how much ink it carries
  loop(g, 1672, 1004, 46, 3.3, 2.6, { w: 2.8, seed: 501, drift: 0.2, rough: 0.06, slide: [76, -12], tout: 0.2 });
  loop(g, 1704, 806, 38, 1.6, -0.4, { w: 3.4, seed: 502, drift: 0.12, rough: 0.06 });
  loop(g, 1276, 1050, 42, 1.45, 3.6, { w: 2.5, seed: 503, drift: -0.1, rough: 0.07, sq: 0.92 });
  loop(g, 1838, 898, 20, 1.25, 1.2, { w: 2.4, seed: 504, rough: 0.09 });
  loop(g, 1872, 1020, 27, 1.35, 4.0, { w: 2.2, seed: 505, rough: 0.08, drift: 0.1 });
}

// ───────────────────────── loose marks: thrown lines, pen-testing slashes, blots ─────────────────────────
const BLOTS = [[118, 846, 9], [488, 694, 6.5], [1296, 770, 8], [1016, 986, 6], [1622, 736, 5.5]];   // x, y, radius of the blots that bled
function drawLooseA(g, a, r) {
  // left margin: quick slashes, the pen being tried
  for (const [x, y, len, an, sd] of [[60, 1056, 262, -1.2, 1], [112, 1064, 190, -1.12, 2], [8, 1000, 150, -1.28, 4]]) {
    const ex = x + Math.cos(an) * len, ey = y + Math.sin(an) * len;
    pen(g, [[x, y], [(x + ex) / 2 + r.range(-8, 8), (y + ey) / 2], [ex, ey]], { w: r.range(2, 3), seed: 600 + sd, tin: 0.05, tout: 0.5, head: 1.4 });
  }
  // a long line thrown up from beside the spade: it clears the arc well left of the caption
  pen(g, [[164, 1000], [172, 850], [204, 700], [250, 566]], { w: 2.1, seed: 620, tin: 0.04, tout: 0.6, head: 1.3 });
  BLOTS.slice(0, 2).forEach(([bx, by, br], i) => blot(g, bx, by, br, 1.1 + i * 1.3));
  spatter(g, r, 118, 846, -0.9, 6, 70);
}
function drawLooseB(g, a, r) {
  // thrown up past the knife's point: it leaves the arc to the right of the caption
  pen(g, [[1262, 904], [1306, 764], [1346, 652], [1376, 566]], { w: 1.9, seed: 631, tin: 0.04, tout: 0.6, head: 1.3 });
  pen(g, [[1560, 1010], [1610, 900], [1640, 800]], { w: 1.6, seed: 632, tin: 0.04, tout: 0.6, head: 1.3 });
  // above the handle: two tall fast strokes, the wrist warming up for the blade
  for (const [x0, y0, x1, y1, bow, sd] of [[566, 912, 560, 664, -16, 1], [612, 880, 640, 690, 14, 2]]) {
    pen(g, [[x0, y0], [(x0 + x1) / 2 + bow, (y0 + y1) / 2], [x1, y1]], { w: r.range(1.8, 2.5), seed: 640 + sd, tin: 0.04, tout: 0.55, head: 1.35 });
  }
  // under the knife: the pen being tried — a racing zig-zag, and a patch of cross-hatching to see how black it goes
  zig(g, r, 722, 1010, 912, 1030, 27, 8.5, { w: 1.8, seed: 650, fade: 0.6, skew: 0.9 });
  const patch = [[1082, 938], [1194, 926], [1206, 1030], [1094, 1040]];
  hatch(g, r, (x, y) => inPoly(patch, x, y), [1070, 916, 1216, 1050], 2.2, 9, { w: 1.7, over: 6, skip: 0.05, rev: 0.85, seed: 660 });
  hatch(g, r, (x, y) => inPoly(patch, x, y) && x + y > 2140, [1070, 916, 1216, 1050], 0.85, 11, { w: 1.7, over: 5, skip: 0.1, rev: 0.2, seed: 670 });
  BLOTS.slice(2).forEach(([bx, by, br], i) => blot(g, bx, by, br, 5.1 + i * 1.3));
  spatter(g, r, 1296, 770, -1.1, 6, 66);
  spatter(g, r, 1016, 986, 0.6, 4, 44);
}

// ───────────────────────── layers ─────────────────────────
/** dark ink, layer A: the arc, the spade coin, the round coin, the left margin */
function buildInkA(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    g.strokeStyle = INK; g.fillStyle = INK; g.lineJoin = 'round';
    drawArcStroke(g, a);
    drawSpade(g, L.rng('c35spade'));
    drawHuan(g, L.rng('c35huan'));
    drawLooseA(g, a, L.rng('c35looseA'));
  });
}
/** dark ink, layer B: the knife coin, the pen-testing loops, the thrown lines */
function buildInkB(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    g.strokeStyle = INK; g.fillStyle = INK; g.lineJoin = 'round';
    drawKnife(g, L.rng('c35knife'));
    drawTrialLoops(g);
    drawLooseB(g, a, L.rng('c35looseB'));
  });
}
/** pale ink: the first, searching lines — axes, a looser go at each shape, a few faint loops */
function buildLight() {
  return L.makeLayer(PAD, (g) => {
    g.strokeStyle = INK_L; g.fillStyle = INK_L; g.lineJoin = 'round';
    // knife: its long axis ruled straight through, and the first go at it — the same knife swung a few degrees higher about its ring
    const A = kP(-0.24, 22), B = kP(1.14, 70);
    pen(g, [A, B], { w: 1.5, seed: 701, tin: 0.03, tout: 0.25, gap: 0.12, gapFreq: 9, jit: 1.2 });
    drawKnifeShadow(g, L.rng('c35kshadow'));
    const [rx, ry] = kRing(), ca = Math.cos(-0.075), sa = Math.sin(-0.075);
    const gh = (u, w) => { const q = kP(u, w), dx = q[0] - rx, dy = q[1] - ry; return [rx + dx * ca - dy * sa, ry + dx * sa + dy * ca]; };
    const ghost = (u0, u1, wf, n, o) => { const pts = []; for (let i = 0; i <= n; i++) { const u = L.lerp(u0, u1, i / n); pts.push(gh(u, wf(u))); } pen(g, pts, o); };
    ghost(0.04, 0.99, (u) => 2 * NZ.n2(u * 5, 1.9), 18, { w: 2.7, seed: 702, tin: 0.04, tout: 0.2, gap: 0.1, gapFreq: 7 });
    ghost(0.3, U_END, (u) => kW(u) + 2 * NZ.n2(u * 5, 4.9), 16, { w: 2.2, seed: 703, tout: 0.3, gap: 0.16, gapFreq: 6 });
    pen(g, [gh(U_END, kW(U_END) + 6), gh(0.94, 44), gh(1.01, -4)], { w: 2.2, seed: 704, tout: 0.3 });
    // spade: centre axis and the two levels (shoulders, feet) ticked across
    pen(g, sp([[1, -150], [0, 60], [-1, 330]]), { w: 1.4, seed: 711, tout: 0.3, gap: 0.14, gapFreq: 8 });
    pen(g, sp([[-150, 2], [0, 0], [156, 1]]), { w: 1.4, seed: 712, tout: 0.35, gap: 0.16, gapFreq: 7 });
    pen(g, sp([[-150, 291], [0, 293], [160, 290]]), { w: 1.3, seed: 713, tout: 0.35, gap: 0.2, gapFreq: 7 });
    pen(g, sp([[-118, -20], [-104, 130], [-116, 280]]), { w: 1.8, seed: 714, tout: 0.4, gap: 0.16 });
    // round coin: cross-hair through the hole, a looser ring outside the rim
    pen(g, [[HQX - 196, HQY + 6], [HQX, HQY], [HQX + 204, HQY - 7]], { w: 1.4, seed: 721, tout: 0.3, gap: 0.12, gapFreq: 8 });
    pen(g, [[HQX - 5, HQY - 186], [HQX, HQY], [HQX + 6, HQY + 190]], { w: 1.4, seed: 722, tout: 0.3, gap: 0.12, gapFreq: 8 });
    loop(g, HQX - 5, HQY + 3, HQR + 15, 0.86, 2.4, { w: 1.9, seed: 723, rough: 0.05, tout: 0.4, gap: 0.12, gapFreq: 6 });
    // faint loops and strokes: a coil run out in the gap above the handle, single turns here and there
    loop(g, 668, 748, 40, 3.2, 2.2, { w: 2.1, seed: 735, drift: 0.16, rough: 0.07, slide: [150, -34], tout: 0.2 });
    loop(g, 1560, 1050, 36, 1.3, 0.4, { w: 1.9, seed: 731, rough: 0.08 });
    loop(g, 96, 934, 38, 1.45, 1.1, { w: 2, seed: 732, rough: 0.07, drift: 0.1 });
    loop(g, 636, 1052, 34, 1.3, 4.1, { w: 1.8, seed: 733, rough: 0.08, sq: 0.9 });
    pen(g, [[474, 640], [500, 780], [512, 900]], { w: 1.6, seed: 741, tout: 0.5, gap: 0.1 });
    pen(g, [[20, 800], [70, 742], [150, 716]], { w: 1.7, seed: 742, tout: 0.5, gap: 0.1 });
  });
}
/** soft grey wash under the drawing: a thumb of thin ink rubbed into the blade, the shaded sides, the cast shadows */
function buildWash() {
  const c = L.makeLayer(PAD, (g) => {
    const full = () => g.rect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    const path = (pts) => { pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    /** a soft shadow lying to the lower right of a shape, never on the shape itself */
    const drop = (poly, dx, dy, al) => {
      g.save(); g.beginPath(); full(); path(poly); g.clip('evenodd');
      g.fillStyle = L.rgba(INK_L, al); fillPoly(g, poly.map(([x, y]) => [x + dx, y + dy]));
      g.restore();
    };
    const KN = knifePoly(), [rx, ry] = kRing();
    // knife: the blade rubbed dark, a breath of tone on the handle and the ring, its shadow
    drop(KN, 22, 30, 0.36);
    g.fillStyle = L.rgba(INK_L, 0.58); fillPoly(g, bladePoly(3));
    g.fillStyle = L.rgba(INK_L, 0.2); { const pts = []; for (let i = 0; i <= 8; i++) pts.push(kP(L.lerp(0.02, U_SH + 0.05, i / 8), 3)); for (let i = 8; i >= 0; i--) { const u = L.lerp(0.02, U_SH + 0.05, i / 8); pts.push(kP(u, kW(u) - 3)); } fillPoly(g, pts); }
    g.fillStyle = L.rgba(INK_L, 0.3); g.beginPath(); g.arc(rx, ry, RING, 0, L.TAU); g.arc(rx, ry, RING * 0.5, 0, L.TAU, true); g.fill('evenodd');
    // spade: shadow down its right side, the faintest tone on its face, a pool under the feet
    drop(SP_POLY, 30, 13, 0.36);
    g.fillStyle = L.rgba(INK_L, 0.1); fillPoly(g, SP_POLY);
    g.fillStyle = L.rgba(INK_L, 0.2); { const q = sp([[30, 308]])[0]; g.beginPath(); g.ellipse(q[0], q[1], 170, 14, -0.03, 0, L.TAU); g.fill(); }
    // round coin: shadow outside the lower-right rim, a crescent of shade inside it, the hole
    g.save(); g.beginPath(); full(); g.moveTo(HQX + HQR, HQY); g.arc(HQX, HQY, HQR, 0, L.TAU); g.clip('evenodd');
    g.fillStyle = L.rgba(INK_L, 0.36); g.beginPath(); g.arc(HQX + 24, HQY + 28, HQR + 2, 0, L.TAU); g.fill();
    g.restore();
    g.save(); g.beginPath(); g.arc(HQX, HQY, HQR - 3, 0, L.TAU); g.clip();
    g.fillStyle = L.rgba(INK_L, 0.34); g.beginPath(); full(); g.moveTo(HQX - 15 + HQR - 2, HQY - 17); g.arc(HQX - 15, HQY - 17, HQR - 2, 0, L.TAU); g.fill('evenodd');
    g.restore();
    g.fillStyle = L.rgba(INK_L, 0.6); g.beginPath(); g.arc(HQX, HQY, HQH - 2, 0, L.TAU); g.fill();
    // blots that bled: a grey ring round each
    for (const [bx, by, br] of BLOTS) { g.fillStyle = L.radial(g, bx, by, br * 0.8, br * 2.7, [[0, L.rgba(INK_L, 0.55)], [0.7, L.rgba(INK_L, 0.3)], [1, L.rgba(INK_L, 0)]]); g.beginPath(); g.arc(bx, by, br * 2.7, 0, L.TAU); g.fill(); }
  });
  // wet edges + granulation
  const out = L.blurred(c, 3.4);
  const g = out.getContext('2d');
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.6;
  g.drawImage(L.noiseTex(out.width, out.height, { seed: 'c35wash', scale: 64, octaves: 3, res: 0.25, contrast: 1.8, ramp: [[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return out;
}

/** apricot-yellow old paper: toned, foxed, water-stained, hairy with fibre — and cleanest where the caption sits */
function buildPaper(env) {
  const a = env.arc, w = W + PAD * 2, h = H + PAD * 2;
  const c = L.paperTex(w, h, { base: '#efd086', seed: 'c35p', tone: '#c08a34', fiber: 1, stain: 0.4, grain: 0.15 });
  c._pad = PAD;
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, PAD, PAD); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const r = L.rng('c35paper');
  const inZone = (x, y) => x > 580 && x < 1340 && y > 250 && y < a.crestY + 6;
  // blotchy age-toning, then the sheet toasting toward its edges
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.3;
  g.drawImage(L.noiseTex(w, h, { seed: 'c35m1', scale: 360, octaves: 4, warp: 0.7, res: 0.2, contrast: 1.3, ramp: [[0, '#e0ac48'], [0.5, '#fbeec6'], [1, '#ffffff']] }), -PAD, -PAD);
  g.globalAlpha = 0.22;
  g.drawImage(L.noiseTex(w, h, { seed: 'c35m2', scale: 38, octaves: 3, res: 0.25, contrast: 1.7, ramp: [[0, '#d9a548'], [0.45, '#fcf2d2'], [1, '#ffffff']] }), -PAD, -PAD);
  g.globalAlpha = 1;
  g.fillStyle = L.radial(g, 950, 520, 560, 1500, [[0, '#ffffff'], [0.5, '#f8e3a8'], [1, '#d09a40']]);
  g.fillRect(-PAD, -PAD, w, h);
  // water stains (水渍): pale pools ringed by a brown tide-line — kept to the sides and the upper corners
  {
    const res = 1 / 3, cw = Math.round(w * res), ch = Math.round(h * res), img = new ImageData(cw, ch), d = img.data, nz = L.makeNoise('c35stain');
    const pools = [[60, 110, 300, 0.9], [1850, 100, 290, 0.85], [1870, 560, 150, 0.55], [60, 600, 130, 0.45], [760, 1110, 200, 0.4], [1560, 1110, 170, 0.4]];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const fx = x / res - PAD, fy = y / res - PAD;
      let al = 0;
      for (let i = 0; i < pools.length; i++) {
        const p = pools[i], dx = fx - p[0], dy = fy - p[1];
        if (Math.abs(dx) > p[2] * 1.5 || Math.abs(dy) > p[2] * 1.5) continue;
        const dd = Math.hypot(dx, dy) / p[2] + 0.3 * nz.fbm(fx / 190 + i * 9.1, fy / 190 - i * 4.7, 3) + 0.035 * nz.n2(fx / 21, fy / 21);
        if (dd < 1) { const e = sstep(0.9, 0.995, dd); al += p[3] * (0.06 + 0.46 * e * e + 0.1 * bump(dd, 0.66, 0.025)); }
      }
      const k = (y * cw + x) * 4; d[k] = 168; d[k + 1] = 108; d[k + 2] = 30; d[k + 3] = Math.min(255, al * 255);
    }
    const sc = L.makeCanvas(cw, ch); sc.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.filter = 'blur(1.6px)'; g.drawImage(sc, -PAD, -PAD, w, h); g.filter = 'none';
  }
  // foxing (霉点): rusty freckles gathered in drifts; almost none where the caption will sit
  const drifts = [[1640, 250, 230], [300, 210, 260], [1780, 880, 220], [110, 560, 190], [1420, 960, 200], [640, 930, 220], [1520, 420, 150]];
  for (let i = 0; i < 340; i++) {
    let x, y;
    if (i % 3) { const dft = drifts[i % drifts.length]; x = dft[0] + r.gauss() * dft[2] * 0.6; y = dft[1] + r.gauss() * dft[2] * 0.6; } else { x = r.range(-PAD, W + PAD); y = r.range(-PAD, H + PAD); }
    const zone = inZone(x, y); if (zone && r.chance(0.88)) continue;
    const rad = L.lerp(2, zone ? 4.5 : 17, Math.pow(r(), 2.6)), al = r.range(0.16, 0.56) * (zone ? 0.4 : 1);
    const col = r.pick(['#a0621e', '#b8924a', '#aa7630', '#8e5a1e']);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al)], [0.5, L.rgba(col, al * 0.7)], [1, L.rgba(col, 0)]]);
    g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.7, 1), r() * 3, 0, L.TAU); g.fill();
  }
  // mildew: dark pepper in the corners
  for (const [mx, my, mr] of [[90, 80, 170], [1850, 1010, 170], [1860, 70, 150], [60, 1040, 130]]) {
    for (let i = 0; i < 70; i++) {
      const x = mx + r.gauss() * mr * 0.55, y = my + r.gauss() * mr * 0.55, rad = L.lerp(1, 5.5, Math.pow(r(), 2));
      g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba('#5a4420', r.range(0.22, 0.55))], [1, L.rgba('#5a4420', 0)]]);
      g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // the caption's patch of paper is the cleanest and brightest on the sheet
  g.save(); g.translate(960, a.crestY - 140); g.scale(1, 0.56);
  g.fillStyle = L.radial(g, 0, 0, 120, 540, [[0, L.rgba('#ecce80', 0.6)], [0.6, L.rgba('#ecce80', 0.34)], [1, L.rgba('#ecce80', 0)]]);
  g.beginPath(); g.arc(0, 0, 540, 0, L.TAU); g.fill(); g.restore();
  L.speckle(g, { seed: 'c35spk', count: 1900, x: -PAD, y: -PAD, w, h, rMin: 0.4, rMax: 1.9, colors: ['#6a4a1c', '#8a6226', '#3e2c12'], alpha: [0.12, 0.6], test: (x, y) => !inZone(x, y) || ((x * 7 + y * 13) | 0) % 4 === 0 });
  // long fibres caught in the sheet
  g.lineCap = 'round';
  for (let i = 0; i < 820; i++) {
    const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(10, 64), an = r() * Math.PI;
    g.strokeStyle = r.chance(0.5) ? L.rgba('#8a5e1c', r.range(0.12, 0.36)) : L.rgba('#fff4cf', r.range(0.16, 0.42));
    g.lineWidth = r.range(0.5, 1.4);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-7, 7), y + Math.sin(an) * len * 0.5 + r.range(-7, 7), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  // paper tooth (a coarser grain than the film's) and the sheet's gentle cockling, lit from the upper left
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(w, h, { seed: 'c35tooth', amount: 0.2, size: 2 }), -PAD, -PAD);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.5;
  g.drawImage(L.bumpLight(L.noiseTex(w, h, { seed: 'c35cockle', scale: 420, sx: 1.7, octaves: 3, res: 0.12 }), { angle: 45, strength: 7, res: 0.25 }), -PAD, -PAD);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

/** what the paper's tooth takes back out of the ink: pinholes and dry patches (a destination-out mask) */
function buildErosion() {
  const w = W + PAD * 2, h = H + PAD * 2, hw = w >> 1, hh = h >> 1;
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  const r = L.rng('c35tooth'), img = new ImageData(hw, hh), d = img.data;
  for (let i = 3; i < d.length; i += 4) { const v = r(); if (v > 0.93) d[i] = 50 + (v - 0.93) * 2000; }
  const pin = L.makeCanvas(hw, hh); pin.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.globalAlpha = 0.75; g.drawImage(pin, 0, 0, w, h); g.globalAlpha = 1;
  g.drawImage(L.noiseTex(w, h, { seed: 'c35dry', scale: 22, octaves: 3, res: 0.33, contrast: 2.1, ramp: [[0, 'rgba(0,0,0,0.4)'], [0.26, 'rgba(0,0,0,0.08)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  g.drawImage(L.noiseTex(w, h, { seed: 'c35dry2', scale: 260, octaves: 3, res: 0.15, contrast: 1.6, ramp: [[0, 'rgba(0,0,0,0.2)'], [0.5, 'rgba(0,0,0,0.03)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  return c;
}
/** ink is not vector: soften the layer a touch, push its edge about with noise, and harden it again */
function roughen(layer) {
  const w = layer.width, h = layer.height, c = L.makeCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.filter = 'blur(1.1px)'; g.drawImage(layer, 0, 0); g.filter = 'none';
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0, i = 3; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    const al = d[i];
    if (al < 6 || al > 249) continue;
    const n = NZ.n2(x * 0.3, y * 0.3) * 0.27 + NZ.n2(x * 0.071 + 40, y * 0.071) * 0.13;
    d[i] = L.clamp((al / 255 - 0.42 + n) * 3.4 + 0.5) * 255;
  }
  g.putImageData(img, 0, 0);
  const lg = layer.getContext('2d');
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, w, h); lg.drawImage(c, 0, 0);
}
function erode(layer, mask, amt) {
  const g = layer.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = amt;
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

// per-frame hand tremor: [A dx, A dy, B dx, B dy, B extra rot] — the two ink layers never sit quite the same way twice
const JIT = [[0, 0, 0, 0, 0], [0.6, -0.4, -1.3, 0.9, 0.0003], [-0.5, 0.5, 1.1, 1.4, -0.0003], [0.4, 0.6, 1.5, -1.0, 0.0002], [-0.7, -0.2, -0.9, -1.5, -0.0003], [0.3, -0.6, 0.8, 1.1, 0.0002]];

export default {
  name: '泉友手稿',
  tone: 'dark',
  init(env) {
    const paper = buildPaper(env), wash = buildWash(), light = buildLight();
    const inkA = buildInkA(env), inkB = buildInkB(env);
    // ink feathering into the fibres (洇): a soft grey breath round every dark line
    const both = L.makeLayer(PAD, (g) => { g.drawImage(inkA, -PAD, -PAD); g.drawImage(inkB, -PAD, -PAD); });
    const halo = L.blurred(both, 5);
    roughen(inkA); roughen(inkB);
    const mask = buildErosion(); erode(inkA, mask, 0.6); erode(inkB, mask, 0.6); erode(light, mask, 1);
    const base = L.makeLayer(PAD, (g) => {
      g.drawImage(paper, -PAD, -PAD);
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.85; g.drawImage(wash, -PAD, -PAD);
      g.globalAlpha = 0.28; g.drawImage(halo, -PAD, -PAD);
      g.globalAlpha = 0.78; g.drawImage(light, -PAD, -PAD);
      g.globalAlpha = 1;
      // raking light across the sheet: warm at the upper left, falling off to the lower right
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = L.linear(g, 0, 0, W, H, [[0, 'rgba(255,238,180,0.3)'], [0.5, 'rgba(128,128,128,0)'], [1, 'rgba(90,50,4,0.16)']]);
      g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    });
    S = { base, inkA, inkB };
  },
  draw(ctx, env, p) {
    // the sheet turns a hair under the camera; the ink shivers a pixel or two on top of it
    const rot = L.lerp(-0.0028, 0.0028, p), zoom = L.lerp(1.0, 1.012, p);
    const j = JIT[Math.round(p * (env.frames - 1)) % JIT.length] || JIT[0];
    L.blit(ctx, env, S.base, { rot, zoom });
    L.blit(ctx, env, S.inkA, { rot, zoom, dx: j[0], dy: j[1] });
    L.blit(ctx, env, S.inkB, { rot: rot + j[4], zoom, dx: j[2], dy: j[3] });
  },
};
