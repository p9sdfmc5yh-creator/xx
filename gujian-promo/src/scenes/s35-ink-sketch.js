// s35 — 白描速写. A fast brush sketch on a sheet of yellow-dyed old paper, seen close:
// the arc is ONE loaded brush stroke — the back of a stone arch bridge — with its pressure pulses, a dry "flying white"
// stretch and a re-inked join. Under it, thrown down at speed with a FEW FAT strokes: the arch barrel and its shadow,
// a bamboo clump, the roof of a pavilion with upturned eaves, tall reeds, a few strokes of water. Above it: only paper.
// Everything is drawn once in init() (paper → wash → pale ink → dark ink) and blitted with a tiny rotation.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 72;
const INK = '#0b0806', INK_L = '#5c3416', PAPER = '#f7bf62', RUST = '#b04812';
const AX = 930, AY = 1008, AR = 318;         // arch opening: centre on the waterline, radius
const PVX = 1622, PVY = 948;                 // pavilion: centre of its eave line
const NZ = L.makeNoise('s35pen');
const SEED_BAMBOO = 's35bamboo-2', SEED_REEDS = 's35reeds-2';
let S = null;

const bump = (x, c, w) => { const d = (x - c) / w; return Math.exp(-d * d); };
const sstep = (a, b, x) => L.smooth((x - a) / (b - a));

// ───────────────────────── the hand ─────────────────────────
/**
 * One pull of the pen: blunt wet head, thinner fast middle, flicked tail; width breathes, line may skip.
 * opts: w (px), seed, prof ('pen' | 'leaf' | 'flat'), tin/tout (taper fractions), head, wob, gap (0..0.5 → skips), jit, step
 */
function pen(g, pts, o = {}) {
  const w = o.w === undefined ? 4 : o.w, seed = o.seed === undefined ? 1 : o.seed;
  const p = L.smoothPath(pts, o.step || 3);
  const n = p.length; if (n < 2) return;
  const prof = o.prof || 'pen', tin = o.tin === undefined ? 0.07 : o.tin, tout = o.tout === undefined ? 0.3 : o.tout;
  const head = o.head === undefined ? 1.35 : o.head, wob = o.wob === undefined ? 0.36 : o.wob, gap = o.gap || 0, jit = o.jit || 0;
  const minW = o.minW === undefined ? 1.5 : o.minW, fq = o.freq || 5, sd = seed * 0.731, gf = o.gapFreq || 4;
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
/**
 * A loaded BRUSH dragged along a path: a bundle of bristles that part where the ink runs low (飞白).
 * opts: w (px), seed, prof ('pen' | 'leaf' | 'flat'), tin/tout, head, wob, nb (bristles), step,
 *       load (number | (u) => number; ≈1.1 = soaked, ≈0.6 = streaky, ≈0.4 = nearly dry)
 */
function brush(g, pts, o = {}) {
  const p = L.smoothPath(pts, o.step || 3.5), n = p.length; if (n < 2) return;
  const w0 = o.w || 16, seed = o.seed === undefined ? 1 : o.seed, key = seed * 0.731 + 1.7;
  const NB = o.nb || Math.max(8, Math.round(w0 * 0.85));
  const prof = o.prof || 'pen', tin = o.tin === undefined ? 0.07 : o.tin, tout = o.tout === undefined ? 0.16 : o.tout;
  const head = o.head === undefined ? 1.3 : o.head, wob = o.wob === undefined ? 0.2 : o.wob;
  const loadAt = typeof o.load === 'function' ? o.load : () => (o.load === undefined ? 1.05 : o.load);
  const s = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n), ww = new Float32Array(n), ld = new Float32Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const len = s[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    const x = -(b[1] - a[1]), y = b[0] - a[0], m = Math.hypot(x, y) || 1; nx[i] = x / m; ny[i] = y / m;
    const u = s[i] / len;
    let k;
    if (prof === 'leaf') k = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.85) + 0.05;
    else if (prof === 'flat') k = 1;
    else {
      k = u < tin ? L.lerp(head * 0.7, head, u / tin) : u < tin * 3 ? L.lerp(head, 0.9, (u - tin) / (tin * 2)) : 0.9;
      if (tout > 0 && u > 1 - tout) k *= Math.pow((1 - u) / tout, 0.7);
    }
    ww[i] = w0 * k * (1 + wob * NZ.n2(s[i] * 0.011 + key * 5.3, key * 2.9));
    ld[i] = loadAt(u);
  }
  const r = L.rng('s35br' + seed);
  g.lineCap = 'round';
  for (let b = 0; b < NB; b++) {
    const off = b / (NB - 1) - 0.5, edge = Math.abs(off) * 2, dry = r();
    let px = 0, py = 0, has = false;
    for (let i = 0; i < n; i++) {
      const w = ww[i], d = off * w + 0.5 * NZ.n2(s[i] * 0.096 + b * 5.1, key);
      const x = p[i][0] + nx[i] * d, y = p[i][1] + ny[i] * d;
      const ink = ld[i] + 0.48 * NZ.n2(s[i] * 0.0142 + key * 3, off * 4.6 + key) - 0.14 * edge * edge - 0.1 * dry;
      if (has && ink > 0.3) {
        g.lineWidth = Math.max(0.8, (w / NB) * 2.2 * L.clamp(0.55 + ink * 0.7, 0.5, 1.25));
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      }
      px = x; py = y; has = true;
    }
  }
}
/** an ink blot with a lumpy outline */
function blot(g, x, y, rad, seed) {
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * L.TAU, rr = rad * (1 + 0.3 * NZ.n2(Math.cos(a) * 1.4 + seed, Math.sin(a) * 1.4 - seed));
    const X = x + Math.cos(a) * rr, Y = y + Math.sin(a) * rr * 0.9;
    if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
  }
  g.closePath(); g.fill();
}
/** droplets flung off the brush in one direction */
function spatter(g, r, x, y, ang, n, reach, big = 5) {
  for (let i = 0; i < n; i++) {
    const d = reach * Math.pow(r(), 0.7), a = ang + r.gauss() * 0.35;
    blot(g, x + Math.cos(a) * d, y + Math.sin(a) * d, L.lerp(big, 1.6, d / reach) * r.range(0.6, 1.3), i * 3.3 + x);
  }
}
/** zig-zag scribble from A to B (pen never lifted) */
function zig(g, r, x0, y0, x1, y1, amp, pitch, o = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / pitch));
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len, sk = o.skew || 0;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = (i % 2 ? 1 : -1) * amp * r.range(0.45, 1.25) * (o.fade ? 1 - t * o.fade : 1);
    pts.push([x0 + ux * len * t - uy * s + ux * s * sk, y0 + uy * len * t + ux * s + uy * s * sk]);
  }
  pen(g, pts, { w: 4, tin: 0.03, tout: 0.1, wob: 0.4, freq: 12, ...o });
}
/** a tangle: the pen races back and forth inside an ellipse without lifting — undergrowth, deep shade */
function scrib(g, r, cx, cy, rx, ry, n, o = {}) {
  const pts = [], tilt = o.tilt || 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = rx * (2 * t - 1) + r.range(-1, 1) * rx * (2.4 / n), y = (i % 2 ? 1 : -1) * ry * r.range(0.2, 1) * Math.sqrt(Math.max(0.15, 1 - (2 * t - 1) * (2 * t - 1) * 0.8));
    pts.push([cx + x + y * tilt, cy + y]);
  }
  pen(g, pts, { w: 4, tin: 0.03, tout: 0.1, wob: 0.42, freq: 15, ...o });
}
/**
 * Parallel hatching (排线) over a region. inside(x,y) → bool, bb = [x0,y0,x1,y1], ang = stroke direction, gap = spacing.
 * opts: w, zig (join the strokes into one zig-zag), skip (prob.), lift (prob. of lifting the pen in zig mode), over (px over/under-shoot)
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
  const ov = o.over === undefined ? 4 : o.over, w = o.w || 4, seed = o.seed || 1;
  const P = (d, t) => [cx + nx * d + c * t, cy + ny * d + s * t];
  if (o.zig) {
    let pts = [], flip = false, k = 0;
    const flush = () => { if (pts.length > 1) pen(g, pts, { w: w * r.range(0.8, 1.25), seed: seed + (k++) * 3.1, tin: 0.02, tout: 0.05, wob: 0.4, freq: 18 }); pts = []; };
    for (const [d, a0, a1] of runs) {
      if (r.chance(o.skip || 0)) { flush(); continue; }
      const A = P(d, a0 - r.range(-ov, ov)), B = P(d, a1 + r.range(-ov, ov));
      if (flip) pts.push(B, A); else pts.push(A, B);
      flip = !flip;
      if (r.chance(o.lift === undefined ? 0.1 : o.lift)) flush();
    }
    flush();
  } else {
    runs.forEach(([d, a0, a1], i) => {
      if (r.chance(o.skip || 0)) return;
      const A = P(d, a0 - r.range(-ov, ov)), B = P(d, a1 + r.range(-ov, ov));
      const m = [(A[0] + B[0]) / 2 + nx * r.range(-4, 4), (A[1] + B[1]) / 2 + ny * r.range(-4, 4)];
      pen(g, r.chance(o.rev === undefined ? 0.5 : o.rev) ? [A, m, B] : [B, m, A], { w: w * r.range(0.8, 1.25), seed: seed + i * 1.7, tout: 0.45, head: 1.45 });
    });
  }
}

// ───────────────────────── the arc: one brush stroke ─────────────────────────
const AW = 1.22;   // the stroke's weight
function drawArcStroke(g, a) {
  const s = a.span(PAD + 150), NB = 24, dth = 2.4 / a.R;
  const r = L.rng('s35arc');
  // a brush is a bundle of bristles: where the ink load runs low they separate → 飞白
  const pull = (t0, t1, widthAt, loadAt, drAt, key) => {
    for (let b = 0; b < NB; b++) {
      const off = b / (NB - 1) - 0.5, edge = Math.abs(off) * 2, dry = r();
      let prev = null;
      for (let th = t0; th <= t1; th += dth) {
        const w = widthAt(th) * AW;
        const q = a.pt(th, drAt(th) + off * w + 0.5 * NZ.n2(th * 230 + b * 5.1, key));
        const ink = loadAt(th) + 0.48 * NZ.n2(th * 34 + key * 3, off * 4.6 + key) - 0.14 * edge * edge - 0.1 * dry;
        if (prev && ink > 0.3) {
          g.lineWidth = Math.max(0.7, (w / NB) * 2.2 * L.clamp(0.55 + ink * 0.7, 0.5, 1.25));
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(q.x, q.y); g.stroke();
        }
        prev = q;
      }
    }
  };
  g.lineCap = 'round';
  // first pull: enters from the left, presses twice (顿), then runs dry and lifts off on the right
  pull(-s, 0.356,
    (th) => (15.2 + 7 * bump(th, -0.338, 0.045) + 4.6 * bump(th, -0.03, 0.085) - 3.2 * bump(th, -0.19, 0.06) - 3.6 * sstep(0.12, 0.3, th) + 1.6 * NZ.n2(th * 16, 2.2)) * (1 - 0.72 * sstep(0.318, 0.356, th)),
    (th) => 1.05 - 0.4 * bump(th, -0.2, 0.05) - 0.7 * sstep(0.17, 0.275, th) - 0.25 * sstep(0.33, 0.356, th),
    (th) => 1.1 * NZ.n2(th * 7, 4.4) - 0.6, 1.7);
  // second pull (复笔): brush re-charged, set down again a little low, overlapping the dry tail
  pull(0.308, s,
    (th) => 15.4 + 7.5 * bump(th, 0.32, 0.016) - 2.2 * bump(th, 0.42, 0.05) + 1.6 * NZ.n2(th * 16, 6.2),
    (th) => 1.08 - 0.3 * bump(th, 0.47, 0.05),
    (th) => -4.2 * Math.exp(-(th - 0.308) / 0.045) + 1.0 * NZ.n2(th * 7, 9.4) - 0.5, 5.3);
  const h = a.pt(0.3085, -4.4); blot(g, h.x, h.y, 14, 3.1);
  // drops shaken off where the brush first pressed
  const d0 = a.pt(-0.345, 0); spatter(g, r, d0.x - 6, d0.y + 26, 2.2, 6, 84, 6);
}

/** the second line under the stroke (deck / rail), which closes on it toward the right, and a few posts between the two */
function drawDeck(g, a, r) {
  const s = a.span(PAD + 60);
  const base = (th) => L.lerp(-56, -30, (th + s) / (2 * s));
  let th = -s, i = 0;
  while (th < s) {
    const t1 = Math.min(s, th + r.range(0.13, 0.27)), pts = [];
    for (let k = 0; k <= 8; k++) { const t = L.lerp(th, t1, k / 8), q = a.pt(t, base(t) + 4 * NZ.n2(t * 9, 5.7) + (k === 0 ? r.range(-5, 5) : 0)); pts.push([q.x, q.y]); }
    pen(g, pts, { w: r.range(4.8, 6.6), seed: 228 + i, tout: 0.25, gap: 0.03, gapFreq: 5 });
    th = t1 - r.range(-0.02, 0.04); i++;
  }
  // posts (望柱): fat downward ticks, unevenly spaced, one or two forgotten
  for (let t = -s + 0.03, k = 0; t < s; t += r.range(0.075, 0.115), k++) {
    if (r.chance(0.14)) continue;
    const p0 = a.pt(t + r.range(-0.002, 0.002), -9), p1 = a.pt(t + r.range(-0.003, 0.003), base(t) - r.range(4, 14));
    pen(g, [[p0.x, p0.y], [p1.x, p1.y]], { w: r.range(6, 8.5), seed: 300 + k, tout: 0.35, head: 1.4 });
  }
}

// ───────────────────────── bridge body: arch, shadow ─────────────────────────
const inArch = (x, y, d = 0) => y < AY && (x - AX) * (x - AX) + (y - AY) * (y - AY) < (AR + d) * (AR + d);
const inSoffit = (x, y) => inArch(x, y, -12) && Math.hypot(x - AX - 26, y - AY - 60) > AR - 2;
const ringPts = (rad, t0, t1, ox, oy, sd, amp = 3, n = 44) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = L.lerp(t0, t1, i / n), rr = rad + amp * NZ.n2(t * 2.2, sd); pts.push([AX + ox + Math.cos(t) * rr, AY + oy + Math.sin(t) * rr]); }
  return pts;
};
function drawArch(g, a, r) {
  // the soffit in shadow: a broad, half-dry brush dragged round under the crown…
  brush(g, ringPts(AR - 34, Math.PI + 0.2, L.TAU - 0.95, 6, 8, 25, 4), { w: 46, prof: 'leaf', load: 0.74, seed: 25, nb: 34, wob: 0.16 });
  // …and a few fat zig-zags across the rest of it
  hatch(g, r, inSoffit, [AX - AR, AY - AR, AX + AR, AY], 1.08, 21, { w: 4.4, zig: true, lift: 0.08, over: 6, seed: 600 });
  // the ring: one loaded brush from the left springing over the crown; it runs dry coming down the right side
  brush(g, ringPts(AR, Math.PI - 0.07, L.TAU + 0.07, 0, 0, 21, 4), { w: 22, seed: 21, tin: 0.04, tout: 0.05, head: 1.25, nb: 24, load: (u) => 1.12 - 0.66 * sstep(0.56, 0.9, u) });
  // extrados, broken, and a handful of voussoir joints (拱石缝)
  pen(g, ringPts(AR + 52, Math.PI + 0.03, L.TAU - 0.02, -1, 2, 23, 5), { w: 5, seed: 23, tin: 0.03, tout: 0.2, gap: 0.12, gapFreq: 5 });
  for (let t = Math.PI + 0.2; t < 1.5 * Math.PI + 0.3; t += r.range(0.25, 0.34)) {
    const key = Math.abs(t - 1.5 * Math.PI) < 0.16, tt = t + r.range(-0.02, 0.02);
    pen(g, [[AX + Math.cos(t) * (AR + 15), AY + Math.sin(t) * (AR + 15)], [AX + Math.cos(tt) * (AR + 52 + r.range(-4, 9)), AY + Math.sin(tt) * (AR + 52)]],
      { w: key ? 6 : r.range(3.4, 4.8), seed: 500 + t * 9, tout: 0.3 });
  }
  // piers dropping into the water
  for (const sgn of [-1, 1]) {
    const x = AX + sgn * AR;
    pen(g, [[x + sgn * 3, AY - 40], [x + sgn * 1, AY + 22]], { w: 7, seed: 30 + sgn, tout: 0.3 });
    pen(g, [[x + sgn * 54, AY - 62], [x + sgn * 51, AY + 10]], { w: 4.2, seed: 33 + sgn, tout: 0.4, gap: 0.08 });
  }
  // shade on the wall: long racing strokes to the right of the arch, a lighter patch to its left
  const deck = (x, y) => a.drAt(x, y) < -76;
  const outside = (x, y) => Math.hypot(x - AX, y - AY) > AR + 66;
  hatch(g, r, (x, y) => deck(x, y) && outside(x, y) && y < AY - 16 && x > AX + 150 && x - AX < 170 + (AY - y) * 0.62, [AX + 120, 600, AX + AR + 230, AY], 2.02, 29, { w: 4.4, over: 14, skip: 0.06, rev: 0.85, minLen: 40, seed: 800 });
  hatch(g, r, (x, y) => deck(x, y) && outside(x, y) && y < AY - 96 && y > AY - 262 && x > AX - AR - 150 && x < AX - AR + 60, [AX - AR - 160, 640, AX - 60, AY], 2.02, 27, { w: 4, over: 12, skip: 0.1, rev: 0.85, minLen: 40, seed: 840 });
}

// ───────────────────────── banks & water ─────────────────────────
const BANK_L = [[AX - AR - 16, AY + 4], [560, 1026], [470, 1062], [380, 1112], [270, 1190]];
const BANK_R = [[AX + AR + 16, AY + 4], [1300, 1024], [1372, 1060], [1450, 1112], [1560, 1190]];
function drawBanks(g, r) {
  // where the bridge wall meets the ground
  pen(g, [[-PAD - 20, 1012], [140, 1000], [360, 1008], [AX - AR - 40, AY]], { w: 4.2, seed: 41, tout: 0.2, gap: 0.3, gapFreq: 7, jit: 3 });
  pen(g, [[AX + AR + 40, AY - 1], [1330, 998], [1420, 1004]], { w: 4.2, seed: 42, tout: 0.4, gap: 0.1, jit: 2 });
  // water's edge: one heavy, lumpy stroke each side
  brush(g, BANK_L, { w: 10, seed: 45, tin: 0.05, tout: 0.2, wob: 0.4, nb: 10, load: 0.95 });
  brush(g, BANK_R, { w: 9, seed: 46, tin: 0.05, tout: 0.2, wob: 0.4, nb: 10, load: 0.9 });
}
function drawWater(g, r) {
  // long calm strokes, pulled left to right, each ending dry
  for (const [x0, x1, y, w, sd] of [[AX - 262, AX + 196, AY + 14, 8, 1], [AX - 90, AX + 280, AY + 40, 6, 2], [AX - 300, AX - 30, AY + 62, 6.5, 3], [AX + 20, AX + 250, AY + 78, 5, 4], [AX - 210, AX + 120, AY + 98, 6, 5]]) {
    brush(g, [[x0, y + r.range(-2, 2)], [L.lerp(x0, x1, 0.35), y + r.range(-3, 3)], [L.lerp(x0, x1, 0.7), y + r.range(-3, 3)], [x1, y + r.range(-2, 2)]],
      { w, seed: 1000 + sd, tin: 0.05, tout: 0.3, nb: 8, load: (u) => 1.05 - 0.6 * sstep(0.45, 1, u) });
  }
  // the reflection under each pier: sideways zig-zags that widen as they go down
  for (const sgn of [-1, 1]) {
    let y = AY + 20;
    for (let i = 0; i < 3; i++) {
      const cx = AX + sgn * (AR + 26) + r.range(-10, 10), half = r.range(28, 40) + i * 12;
      zig(g, r, cx - half, y, cx + half, y + r.range(-2, 2), 5 + i, r.range(24, 32), { w: L.lerp(5, 3.6, i / 3), seed: 60 + i + sgn * 20 });
      y += r.range(20, 26);
    }
  }
}

// ───────────────────────── pavilion with upturned eaves (翘角亭): mostly roof, the columns run off the sheet ─────────────────────────
const pv = (pts) => pts.map(([x, y]) => [PVX + x, PVY + y]);
const HIP_R = [[5, -205], [28, -162], [72, -112], [138, -72], [204, -55], [248, -62], [270, -82], [284, -108]];
const HIP_L = HIP_R.map(([x, y]) => [-x, y]);
const RIB_R = [[3, -203], [22, -150], [46, -96], [68, -52], [80, -24]];
const RIB_L = RIB_R.map(([x, y]) => [-x, y]);
const EAVE = [[-282, -104], [-252, -58], [-172, -32], [-62, -20], [62, -20], [172, -32], [252, -58], [282, -104]];
function polyAt(poly, t) { const f = t * (poly.length - 1), i = Math.min(poly.length - 2, Math.floor(f)), k = f - i; return [L.lerp(poly[i][0], poly[i + 1][0], k), L.lerp(poly[i][1], poly[i + 1][1], k)]; }
function drawPavilion(g, r) {
  const P = (pts, o) => pen(g, pv(pts), o), B = (pts, o) => brush(g, pv(pts), o);
  // deep shade tucked under the eave
  B([[-236, -40], [-150, -6], [-40, 8], [60, 9], [160, -6], [238, -40]], { w: 27, prof: 'leaf', seed: 79, load: 0.8, nb: 22, wob: 0.24 });
  // roof: two hip ridges sweeping out in a concave curve and kicking up at the corners
  B(HIP_L, { w: 15, seed: 71, tin: 0.05, tout: 0.14, head: 1.15, nb: 16, load: (u) => 1.08 - 0.4 * sstep(0.6, 1, u) });
  B(HIP_R, { w: 18, seed: 72, tin: 0.05, tout: 0.14, head: 1.15, nb: 18, load: (u) => 1.12 - 0.3 * sstep(0.7, 1, u) });
  // eave edge: sags through the middle, lifts to both corners
  B(EAVE, { w: 12, seed: 73, tin: 0.05, tout: 0.06, head: 1.0, nb: 13, wob: 0.3, load: 1.0 });
  // inner ridges of the facing roof plane
  P(RIB_L, { w: 5.2, seed: 75, tout: 0.25 });
  P(RIB_R, { w: 7, seed: 76, tout: 0.25 });
  // finial (宝顶): a bead on a short neck
  P([[0, -200], [0, -248]], { w: 7, seed: 77, tout: 0.5 });
  blot(g, PVX, PVY - 226, 13, 7.1); blot(g, PVX + 1, PVY - 247, 7, 7.9);
  P([[-18, -200], [0, -210], [18, -200]], { w: 5, seed: 78, tout: 0.2 });
  // tile lines: on each side face they run with the hip and stop on the inner ridge; three short ones stand on the facing eave
  const yOn = (poly, x) => { for (let i = 1; i < poly.length; i++) if (x <= poly[i][0]) { const a = poly[i - 1], b = poly[i]; return L.lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); } return poly[poly.length - 1][1]; };
  const eaveR = EAVE.slice(4);
  const faceRows = (sgn, ts, w2, sd) => ts.forEach((t, k) => {
    const st = polyAt(RIB_R, t), d = st[1] - yOn(HIP_R, st[0]), pts = [];
    for (let x = st[0]; x < 250; x += 14) { const y = yOn(HIP_R, x) + d * (1 - 0.1 * (x - st[0]) / 100); if (y > yOn(eaveR, x) - 5) break; pts.push([sgn * x, y + r.range(-1.5, 1.5)]); }
    if (pts.length > 2) P(pts, { w: w2 * r.range(0.85, 1.15), seed: sd + k, tin: 0.05, tout: 0.35, gap: 0.06 });
  });
  faceRows(1, [0.3, 0.44, 0.58, 0.72, 0.86], 4.2, 980);
  faceRows(-1, [0.4, 0.68], 3.4, 990);
  for (const [x, l, sd] of [[-34, 74, 1], [6, 96, 2], [44, 62, 3]]) P([[x * 0.72, -28 - l], [x, -30]], { w: 3.4, seed: 780 + sd, tout: 0.4, gap: 0.12 });
  // lintel and columns (which run off the bottom of the sheet)
  P([[-204, 28], [-90, 37], [40, 34], [150, 38], [206, 30]], { w: 5.4, seed: 81, tout: 0.15, jit: 1.5 });
  for (const [x, w2, sd] of [[-176, 10, 83], [-62, 8, 84], [62, 8.5, 85], [176, 12, 86]]) {
    B([[x * 0.955 + r.range(-3, 3), 4], [x * 0.99 + r.range(-4, 4), 112], [x * 1.03 + r.range(-4, 4), 232]], { w: w2, seed: sd, tin: 0.06, tout: 0.1, head: 1.25, nb: 10, load: r.range(0.85, 1.1) });
  }
}

// ───────────────────────── bamboo, reeds ─────────────────────────
/** a hand of bamboo leaves: each one a single press-and-flick of the loaded brush */
function leafFan(g, r, x, y, dir, n, len, wid, seed) {
  for (let i = 0; i < n; i++) {
    const an = dir + (i - (n - 1) / 2) * r.range(0.32, 0.5) + r.range(-0.1, 0.1);
    const l = len * r.range(0.6, 1.22), bend = r.range(-0.1, 0.1) * l;
    const ex = x + Math.cos(an) * l, ey = y + Math.sin(an) * l;
    brush(g, [[x, y], [(x + ex) / 2 - Math.sin(an) * bend, (y + ey) / 2 + Math.cos(an) * bend], [ex, ey]],
      { w: wid * r.range(0.82, 1.12) * Math.sqrt(l / len), prof: 'leaf', seed: seed + i * 1.3, wob: 0.1, nb: 15, step: 3, load: r.chance(0.3) ? r.range(0.66, 0.8) : r.range(0.95, 1.15) });
  }
}
function drawBamboo(g, r) {
  const stems = [ // base x, base y, height, lean, width, joints, which side each node leafs on (0 = bare)
    [300, 1140, 424, 0.085, 15.5, 4, [0, 1, -1, 1]],
    [118, 1140, 304, -0.13, 12.5, 3, [0, 1, -1]],
  ];
  stems.forEach(([bx, by, h, lean, w, nseg, sides], si) => {
    let x = bx, y = by, ang = -Math.PI / 2 + lean;
    for (let i = 0; i < nseg; i++) {
      const sl = (h / nseg) * r.range(0.92, 1.08), nx = x + Math.cos(ang) * sl, ny = y + Math.sin(ang) * sl, k = 1 - 0.36 * (i / nseg);
      // one joint of the culm, stopped short of the node; then the node tick
      brush(g, [[x, y], [(x + nx) / 2 + r.range(-2, 2), (y + ny) / 2], [nx - Math.cos(ang) * 10, ny - Math.sin(ang) * 10]], { w: w * k, seed: 1200 + si * 20 + i, tin: 0.1, tout: 0.05, head: 1.22, wob: 0.1, nb: 14, load: r.range(0.78, 1.08) });
      if (i < nseg - 1) pen(g, [[nx - w * k * 0.85 - 3, ny + 3], [nx, ny - 3], [nx + w * k * 0.85 + 3, ny + 2]], { w: w * k * 0.4, seed: 1300 + si * 20 + i, tin: 0.2, tout: 0.3, minW: 2.4 });
      // a twig + a hanging hand of leaves
      const side = sides[i];
      if (side) {
        const top = i === nseg - 1, ta = -Math.PI / 2 + side * r.range(0.75, 1.1), tl = r.range(34, top ? 46 : 74);
        const tx = nx + Math.cos(ta) * tl, ty = ny + Math.sin(ta) * tl;
        pen(g, [[nx, ny], [(nx + tx) / 2 + r.range(-4, 4), (ny + ty) / 2 + 4], [tx, ty]], { w: 3.4, seed: 1400 + si * 30 + i * 3, tout: 0.4 });
        const dir = side > 0 ? r.range(0.66, 1.1) : Math.PI - r.range(0.66, 1.1);
        leafFan(g, r, tx, ty, dir, r.pick([3, 4, 3, 2]), r.range(140, 186), 22, 1500 + si * 40 + i * 5);
      }
      x = nx; y = ny; ang += (lean >= 0 ? 1 : -1) * r.range(0.0, 0.05);
    }
    leafFan(g, r, x, y, Math.PI / 2 + (si ? 0.5 : -0.5) + r.range(-0.15, 0.15), 3, r.range(116, 144), 19, 1700 + si * 9);
  });
  // tangle at the foot of the clump
  scrib(g, r, 250, 1066, 240, 22, 12, { w: 4.2, seed: 1801, tilt: 0.4 });
}
/** a reed leaf thrown up from the root in one sweep: it rises, bows over, and the tip trails */
function blade(g, r, bx, by, len, lean, w, seed, o = {}) {
  const curl = o.curl === undefined ? r.range(0.5, 1.2) : o.curl, dir = lean >= 0 ? 1 : -1, n = 12, pts = [[bx, by]];
  let x = bx, y = by;
  for (let i = 1; i <= n; i++) {
    const ang = -Math.PI / 2 + lean + dir * curl * 1.6 * Math.pow(i / n, 1.9);
    x += (Math.cos(ang) * len) / n; y += (Math.sin(ang) * len) / n;
    pts.push([x, y]);
  }
  brush(g, pts, { w, prof: 'leaf', seed, nb: Math.max(8, Math.round(w)), step: 3, wob: 0.14, load: o.load === undefined ? 1.02 : o.load });
}
/** a tall stalk with its plume (芦花): the fastest strokes on the sheet */
function stalk(g, r, bx, by, h, lean, seed) {
  const tx = bx + Math.sin(lean) * h, ty = by - Math.cos(lean) * h, bow = r.range(-0.05, 0.05) * h, side = lean >= 0 ? 1 : -1;
  pen(g, [[bx, by], [(bx + tx) / 2 + bow, (by + ty) / 2], [tx, ty]], { w: 5.4, seed, tin: 0.04, tout: 0.4, head: 1.2, minW: 2.6 });
  // the plume: one soft nodding press of the brush, and a couple of hairs flying off it
  brush(g, [[tx - side * 4, ty + 10], [tx + side * 22, ty - 14], [tx + side * 58, ty - 2], [tx + side * 86, ty + 36]], { w: 11, prof: 'leaf', seed: seed + 3, nb: 10, load: 0.82, step: 3 });
  for (let j = 0; j < 2; j++) {
    const l = r.range(50, 78);
    pen(g, [[tx + side * 8, ty - 2], [tx + side * l * 0.6, ty - l * r.range(0.25, 0.5)], [tx + side * l * r.range(1.0, 1.3), ty - l * r.range(-0.1, 0.2)]], { w: r.range(3, 3.8), seed: seed + 9 + j, tout: 0.6, head: 1.3, minW: 2 });
  }
}
function drawReeds(g, r) {
  // in front of the arch's right foot
  blade(g, r, 1204, 1130, 310, -0.34, 12, 2001, { curl: 0.5 });
  blade(g, r, 1218, 1130, 350, -0.06, 12.5, 2002, { curl: 0.28 });
  blade(g, r, 1234, 1130, 300, 0.3, 13.5, 2003, { curl: 0.5 });
  blade(g, r, 1248, 1130, 214, 0.64, 10, 2005, { curl: 0.55 });
  stalk(g, r, 1226, 1130, 404, 0.12, 2010);
  // the hand moving faster than the eye: a tangle thrown through the roots
  scrib(g, r, 1226, 1076, 104, 22, 9, { w: 4, seed: 2601, tilt: 0.7 });
}

// ───────────────────────── layers ─────────────────────────
const BLOTS = [[590, 902, 11], [1474, 742, 10], [1128, 1058, 8], [716, 668, 6.5]];   // x, y, radius of the blots that bled
function buildDark(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    g.strokeStyle = INK; g.fillStyle = INK; g.lineJoin = 'round';
    // every motif gets its own random stream, so retouching one never reshuffles the others
    const r = L.rng('s35ink');
    drawArcStroke(g, a);
    drawDeck(g, a, L.rng('s35deck'));
    drawArch(g, a, L.rng('s35arch'));
    drawBanks(g, L.rng('s35bank'));
    drawWater(g, L.rng('s35water'));
    drawPavilion(g, L.rng('s35pavilion'));
    drawBamboo(g, L.rng(SEED_BAMBOO));
    drawReeds(g, L.rng(SEED_REEDS));
    // blots where the brush rested, a couple of flung drops
    BLOTS.forEach(([bx, by, br], i) => blot(g, bx, by, br, 1.1 + i * 1.3));
    spatter(g, r, 1474, 742, -0.5, 6, 78, 5.5); spatter(g, r, 716, 668, 1.9, 5, 64, 5);
    // one long careless flick that strays across the opening
    for (const [x0, y0, x1, y1, bow, sd] of [[1190, 1110, 1112, 836, -40, 1]]) {
      pen(g, [[x0, y0], [(x0 + x1) / 2 + bow, (y0 + y1) / 2], [x1, y1]], { w: r.range(3.6, 4.6), seed: 2800 + sd, tin: 0.04, tout: 0.6, head: 1.3, minW: 2 });
    }
  });
}
/** pale ink: what lies far away */
function buildLight(env) {
  return L.makeLayer(PAD, (g) => {
    g.strokeStyle = INK_L; g.fillStyle = INK_L; g.lineJoin = 'round';
    const r = L.rng('s35light');
    // far shore seen through the arch, and the far water
    pen(g, [[AX - 268, AY - 62], [AX - 120, AY - 68], [AX + 40, AY - 62], [AX + 252, AY - 67]], { w: 4.4, seed: 3001, tout: 0.3, gap: 0.1, gapFreq: 7, jit: 2 });
    for (const [x0, len, y, sd] of [[AX - 210, 190, AY - 40, 1], [AX + 10, 160, AY - 30, 2], [AX - 110, 240, AY - 14, 3]]) pen(g, [[x0, y], [x0 + len * 0.5, y + r.range(-2, 2)], [x0 + len, y + r.range(-2, 2)]], { w: 3.4, seed: 3010 + sd, tout: 0.5, gap: 0.12 });
    // paler leaves and reeds standing further back
    leafFan(g, r, 204, 748, Math.PI - 0.85, 3, 140, 19, 3311);
    blade(g, r, 1190, 1040, 170, 0.16, 8, 3101, { curl: 0.7 }); blade(g, r, 1176, 1040, 140, -0.3, 7, 3102, { curl: 1.0 });
    blade(g, r, 704, 1036, 160, -0.14, 8, 3201, { curl: 0.7 }); blade(g, r, 716, 1036, 130, 0.4, 7, 3202, { curl: 1.0 });
  });
}
/** soft washes: the shadowed soffit, the dark side of the roof, reflections */
function buildWash(env) {
  const c = L.makeLayer(PAD, (g) => {
    const fillPoly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    // soffit
    g.save(); g.beginPath(); g.arc(AX, AY, AR - 4, Math.PI, L.TAU); g.closePath(); g.clip();
    g.beginPath(); g.rect(AX - AR - 10, AY - AR - 10, AR * 2 + 20, AR + 10); g.arc(AX + 26, AY + 60, AR - 2, 0, L.TAU, true);
    g.fillStyle = L.rgba(INK_L, 0.5); g.fill('evenodd');
    g.restore();
    // far bank through the arch: a misty line of trees
    g.save(); g.beginPath(); g.arc(AX, AY, AR - 14, Math.PI, L.TAU); g.closePath(); g.clip();
    for (const [x0, x1, hgt, al] of [[AX - 276, AX - 4, 56, 0.4], [AX + 70, AX + 262, 34, 0.32]]) {
      const pts = [];
      for (let x = x0; x <= x1; x += 7) { const u = (x - x0) / (x1 - x0); pts.push([x, AY - 66 - hgt * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.55 + 0.6 * NZ.n2(x * 0.04, 3.3))]); }
      g.fillStyle = L.rgba(INK_L, al); fillPoly([...pts, [x1, AY - 60], [x0, AY - 60]]);
    }
    g.restore();
    // blots that bled: a brown ring round each
    for (const [bx, by, br] of BLOTS) { g.fillStyle = L.radial(g, bx, by, br * 0.8, br * 2.6, [[0, L.rgba(INK_L, 0.5)], [0.7, L.rgba(INK_L, 0.3)], [1, L.rgba(INK_L, 0)]]); g.beginPath(); g.arc(bx, by, br * 2.6, 0, L.TAU); g.fill(); }
    // roof shade + under-eave
    g.fillStyle = L.rgba(INK_L, 0.4);
    fillPoly(pv([...RIB_R, [172, -32], [252, -58], ...HIP_R.slice(0, 7).reverse()]));
    g.fillStyle = L.rgba(INK_L, 0.34);
    fillPoly(pv([[-230, -40], [-120, -20], [120, -20], [230, -40], [200, 32], [-200, 32]]));
    // pier reflections
    for (const sgn of [-1, 1]) { g.fillStyle = L.linear(g, 0, AY, 0, AY + 130, [[0, L.rgba(INK_L, 0.36)], [1, L.rgba(INK_L, 0)]]); g.fillRect(AX + sgn * (AR + 26) - 50, AY + 4, 100, 130); }
    // a breath of tone behind the bamboo
    g.fillStyle = L.radial(g, 290, 900, 20, 260, [[0, L.rgba(INK_L, 0.2)], [1, L.rgba(INK_L, 0)]]); g.fillRect(-PAD, 560, 760, 620);
  });
  // wet edges + granulation
  const out = L.blurred(c, 3.6);
  const g = out.getContext('2d');
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.6;
  g.drawImage(L.noiseTex(out.width, out.height, { seed: 's35wash', scale: 70, octaves: 3, res: 0.25, contrast: 1.8, ramp: [[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  return out;
}

/** the sheet: yellow-dyed paper, ONE clean colour — its age is in the fibres, the specks and two tide-lines, not in a grey veil */
function buildPaper(env) {
  const a = env.arc, w = W + PAD * 2, h = H + PAD * 2;
  const c = L.makeCanvas(w, h); c._pad = PAD;
  const g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  g.setTransform(1, 0, 0, 1, PAD, PAD);
  const r = L.rng('s35paper');
  const inZone = (x, y) => x > 590 && x < 1330 && y > 250 && y < a.crestY + 4;
  // the dye took unevenly: broad clouds and a finer mottle, both inside the one hue
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.26;
  g.drawImage(L.noiseTex(w, h, { seed: 's35m1', scale: 340, octaves: 4, warp: 0.7, res: 0.2, contrast: 1.4, ramp: [[0, '#f3c98a'], [0.5, '#fff3dc'], [1, '#ffffff']] }), -PAD, -PAD);
  g.globalAlpha = 0.22;
  g.drawImage(L.noiseTex(w, h, { seed: 's35m2', scale: 34, octaves: 3, res: 0.25, contrast: 1.7, ramp: [[0, '#f1bd76'], [0.45, '#fff0d4'], [1, '#ffffff']] }), -PAD, -PAD);
  // rubbed, paler patches
  g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.3;
  g.drawImage(L.noiseTex(w, h, { seed: 's35m3', scale: 190, octaves: 3, warp: 0.5, res: 0.2, contrast: 1.6, ramp: [[0, '#000000'], [0.62, '#000000'], [1, '#3a2c10'] ] }), -PAD, -PAD);
  // toward the edges the sheet only turns more orange, never darker-grey
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1;
  g.fillStyle = L.radial(g, 950, 430, 520, 1500, [[0, '#ffffff'], [0.55, '#fff4dc'], [1, '#f9d39a']]);
  g.fillRect(-PAD, -PAD, w, h);
  // water stains (水渍): pale pools ringed by a rust tide-line — kept to the corners
  {
    const res = 1 / 3, cw = Math.round(w * res), ch = Math.round(h * res), img = new ImageData(cw, ch), d = img.data, nz = L.makeNoise('s35stain');
    const pools = [[1836, 84, 250, 0.42], [1508, 196, 44, 0.6]];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const fx = x / res - PAD, fy = y / res - PAD;
      let al = 0;
      for (let i = 0; i < pools.length; i++) {
        const p = pools[i], dx = fx - p[0], dy = fy - p[1];
        if (Math.abs(dx) > p[2] * 1.5 || Math.abs(dy) > p[2] * 1.5) continue;
        const dd = Math.hypot(dx, dy) / p[2] + 0.3 * nz.fbm(fx / 190 + i * 9.1, fy / 190 - i * 4.7, 3) + 0.035 * nz.n2(fx / 21, fy / 21);
        if (dd < 1) { const e = sstep(0.9, 0.995, dd); al += p[3] * (0.04 + 0.44 * e * e + 0.08 * bump(dd, 0.66, 0.025)); }
      }
      const k = (y * cw + x) * 4; d[k] = 176; d[k + 1] = 72; d[k + 2] = 18; d[k + 3] = Math.min(255, al * 255);
    }
    const sc = L.makeCanvas(cw, ch); sc.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.filter = 'blur(1.6px)'; g.drawImage(sc, -PAD, -PAD, w, h); g.filter = 'none';
  }
  // foxing (霉斑): rusty freckles gathered in a few drifts; none where the caption will sit
  const drifts = [[1640, 250, 230], [330, 150, 240], [1790, 930, 200], [90, 640, 180]];
  for (let i = 0; i < 60; i++) {
    let x, y;
    if (i % 4) { const dft = drifts[i % drifts.length]; x = dft[0] + r.gauss() * dft[2] * 0.6; y = dft[1] + r.gauss() * dft[2] * 0.6; } else { x = r.range(-PAD, W + PAD); y = r.range(-PAD, H + PAD); }
    if (inZone(x, y)) continue;
    const rad = L.lerp(2.5, 15, Math.pow(r(), 2.6)), al = r.range(0.16, 0.5);
    const col = r.pick(['#a8461a', '#b8541c', '#c66a22', '#8a3610']);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al)], [0.5, L.rgba(col, al * 0.7)], [1, L.rgba(col, 0)]]);
    g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.7, 1), r() * 3, 0, L.TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // bits of bark and husk caught in the pulp: fine pepper, and a few specks big enough to see
  L.speckle(g, { seed: 's35spk', count: 1500, x: -PAD, y: -PAD, w, h, rMin: 0.5, rMax: 2, colors: ['#7c3410', '#a04c18', '#3c1c0a'], alpha: [0.12, 0.55], test: (x, y) => !inZone(x, y) || ((x * 7 + y * 13) | 0) % 3 === 0 });
  L.speckle(g, { seed: 's35spk2', count: 90, x: -PAD, y: -PAD, w, h, rMin: 2.2, rMax: 4.6, colors: ['#6a2c0c', '#8c4214', '#3c1c0a'], alpha: [0.3, 0.7], squash: 0.75, test: (x, y) => !inZone(x, y) });
  // long fibres caught in the sheet
  g.lineCap = 'round';
  for (let i = 0; i < 560; i++) {
    const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(12, 60), an = r() * Math.PI;
    g.strokeStyle = r.chance(0.55) ? L.rgba('#a54e18', r.range(0.1, 0.3)) : L.rgba('#ffe3a2', r.range(0.1, 0.3));
    g.lineWidth = r.range(0.6, 1.5);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-7, 7), y + Math.sin(an) * len * 0.5 + r.range(-7, 7), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  // laid lines (帘纹) left by the mould: close, even, barely there; a few chain lines across them
  g.lineCap = 'butt';
  for (let y = -PAD; y < H + PAD; y += r.range(5.2, 6.6)) {
    g.strokeStyle = `rgba(150,66,8,${r.range(0.03, 0.085).toFixed(3)})`; g.lineWidth = r.range(1, 1.8);
    g.beginPath(); g.moveTo(-PAD, y);
    for (let x = -PAD + 160; x <= W + PAD + 160; x += 160) g.lineTo(x, y + 1.6 * NZ.n2(x * 0.004, y * 0.02));
    g.stroke();
  }
  for (let x = -PAD + r.range(0, 200); x < W + PAD; x += r.range(236, 262)) { g.fillStyle = 'rgba(150,66,8,0.05)'; g.fillRect(x, -PAD, 2.2, h); }
  // paper tooth (a coarser grain than the film's) and gentle cockling of the sheet
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(w, h, { seed: 's35tooth', amount: 0.2, size: 2 }), -PAD, -PAD);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.16;
  g.drawImage(L.noiseTex(w, h, { seed: 's35cockle', scale: 460, sx: 1.8, octaves: 3, res: 0.15, contrast: 1.5 }), -PAD, -PAD);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

/** what the paper's tooth takes back out of the ink: pinholes and dry patches (a destination-out mask) */
function buildErosion() {
  const w = W + PAD * 2, h = H + PAD * 2, hw = w >> 1, hh = h >> 1;
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  const r = L.rng('s35tooth'), img = new ImageData(hw, hh), d = img.data;
  for (let i = 3; i < d.length; i += 4) { const v = r(); if (v > 0.93) d[i] = 50 + (v - 0.93) * 2000; }
  const pin = L.makeCanvas(hw, hh); pin.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.globalAlpha = 0.75; g.drawImage(pin, 0, 0, w, h); g.globalAlpha = 1;
  g.drawImage(L.noiseTex(w, h, { seed: 's35dry', scale: 22, octaves: 3, res: 0.33, contrast: 2.1, ramp: [[0, 'rgba(0,0,0,0.4)'], [0.26, 'rgba(0,0,0,0.08)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  g.drawImage(L.noiseTex(w, h, { seed: 's35dry2', scale: 260, octaves: 3, res: 0.15, contrast: 1.6, ramp: [[0, 'rgba(0,0,0,0.2)'], [0.5, 'rgba(0,0,0,0.03)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
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

export default {
  name: '白描速写',
  tone: 'dark',
  init(env) {
    const T = [performance.now()], tk = (n) => { T.push(performance.now()); console.warn('PROF ' + n + ' ' + (T[T.length - 1] - T[T.length - 2]).toFixed(0)); };
    const paper = buildPaper(env); tk('paper'); const wash = buildWash(env); tk('wash'); const light = buildLight(env); tk('light'); const dark = buildDark(env); tk('dark');
    const halo = L.blurred(dark, 4);      // ink feathering into the fibres (洇)
    tk('halo'); roughen(dark); tk('roughen');
    const mask = buildErosion(); erode(dark, mask, 0.38); erode(light, mask, 1);
    const tone = L.noiseTex(dark.width, dark.height, { seed: 's35tone', scale: 150, octaves: 3, res: 0.15, contrast: 1.7, ramp: [[0, 'rgba(0,0,0,0.24)'], [0.34, 'rgba(0,0,0,0.07)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] });
    const tg = tone.getContext('2d');
    tg.translate(PAD, PAD); tg.globalCompositeOperation = 'destination-out'; tg.filter = 'blur(10px)'; tg.lineWidth = 46; env.arc.stroke(tg, 0); tg.filter = 'none';
    erode(dark, tone, 1);
    const pic = L.makeLayer(PAD, (g) => {
      g.drawImage(paper, -PAD, -PAD);
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.85; g.drawImage(wash, -PAD, -PAD);
      g.globalAlpha = 0.22; g.drawImage(halo, -PAD, -PAD);
      g.globalAlpha = 0.78; g.drawImage(light, -PAD, -PAD);
      g.globalAlpha = 1; g.drawImage(dark, -PAD, -PAD);
      // raking light across the sheet: honey at the upper left, a deeper orange at the lower right
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = L.linear(g, 0, 0, W, H, [[0, 'rgba(255,226,150,0.22)'], [0.5, 'rgba(128,128,128,0)'], [1, 'rgba(168,58,0,0.14)']]);
      g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    });
    tk('comp');
    // a close lens: sharp round the crest, a touch soft out at the corners
    const soft = L.blurred(pic, 2.8), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in';
    sg.translate(PAD + 960, PAD + 610); sg.scale(1, 0.66);
    sg.fillStyle = L.radial(sg, 0, 0, 600, 1240, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    sg.fillRect(-2000, -2000, 4000, 4000);
    const pg = pic.getContext('2d');
    pg.globalCompositeOperation = 'source-over'; pg.globalAlpha = 1; pg.drawImage(soft, -PAD, -PAD);
    tk('dof');
    S = { pic };
  },
  draw(ctx, env, p) {
    // the sheet turns a hair under the camera
    L.blit(ctx, env, S.pic, { rot: L.lerp(-0.0028, 0.0028, p), zoom: L.lerp(1.0, 1.012, p) });
  },
};
