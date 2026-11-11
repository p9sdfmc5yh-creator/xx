// s35 — 处方笺与药篮速写. Brush hand on an apricot-yellow slip of old letter paper (笺), seen close under a lamp.
// The arc is one pull of scorched ink (焦墨): the hoop handle (提梁) of a herb basket — pressed, lifted, run dry into
// flying-white (飞白), then the brush re-charged and set down again over its own dry tail (复笔). The stroke's UPPER edge
// rides env.arc; pressure only swells it downward. A leaner second line under it gives the hoop its thickness.
// Under it, in the middle: a sheaf of herbs standing out of the basket — fast stalks, pressed leaves, scribble, a few
// blots that bled. Left and right: columns of running script, herb name above, dose in small characters at its lower
// right (当归 三钱 …): the writing sample fixed by the storyboard, simplified characters throughout, nothing else.
// Above the handle: nothing but paper — laid lines, chain lines, fibre, foxing and tide-lines kept out to the sides.
// Everything is drawn once in init() and blitted with a hair of rotation about the arc's centre; a lamp pool drifts over it.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
const FW = W + PAD * 2, FH = H + PAD * 2;
const INK = '#1d1a16', SPOT = '#b8904a';
// pale ink (淡墨 #6a6258 as it reads ON the apricot sheet) is laid down as a multiply colour, so the paper's grain shows through the wash
const INK_L = '#767eb2';
const HAND = '"GJ ZhiMang", "GJ Brush", cursive';   // 志莽行书 (falls back to 马善政 if the optional face is missing)
const NZ = L.makeNoise('s35rx');
let S = null;

const bump = (x, c, w) => { const d = (x - c) / w; return Math.exp(-d * d); };
const sstep = (a, b, x) => L.smooth((x - a) / (b - a));

// ───────────────────────── the brush ─────────────────────────
const _lx = [], _ly = [], _rx = [], _ry = [];
function fillRun(g, m) {
  if (m < 2) return;
  g.beginPath(); g.moveTo(_lx[0], _ly[0]);
  for (let k = 1; k < m; k++) g.lineTo(_lx[k], _ly[k]);
  for (let k = m - 1; k >= 0; k--) g.lineTo(_rx[k], _ry[k]);
  g.closePath(); g.fill();
}
/**
 * One stroke = a bundle of bristles. Pressure shapes the width; where the ink load runs low the bristles part and skip.
 * opts: w (px), seed, prof ('ding' pressed head, tapering tail | 'lan' thin-fat-thin, a leaf | 'flat'), head, tin, tout,
 *       wob, wlen, dry (0 loaded … 0.8 scorched), jit (hand tremor px), wf(u) custom width factor, load(u) custom ink load
 */
function brush(g, pts, o = {}) {
  const p = L.smoothPath(pts, o.step || 3);
  const n = p.length; if (n < 2) return;
  const w = o.w === undefined ? 5 : o.w, seed = o.seed === undefined ? 1 : o.seed, sd = ((seed * 0.731) % 97.3) + 0.37;
  const prof = o.prof || 'ding';
  const tin = o.tin === undefined ? 0.07 : o.tin, tout = o.tout === undefined ? 0.4 : o.tout, head = o.head === undefined ? 1.3 : o.head;
  const wob = o.wob === undefined ? 0.26 : o.wob, wl = o.wlen || 90, dry = o.dry === undefined ? 0.2 : o.dry, jit = o.jit || 0;
  const minW = o.minW === undefined ? 1 : o.minW;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const len = cum[n - 1] || 1;
  const X = new Float32Array(n), Y = new Float32Array(n), NX = new Float32Array(n), NY = new Float32Array(n), WD = new Float32Array(n);
  let wmax = 0;
  for (let i = 0; i < n; i++) {
    const u = cum[i] / len, s = cum[i];
    let k;
    if (o.wf) k = o.wf(u);
    else if (prof === 'lan') k = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.85) + 0.07;
    else if (prof === 'flat') k = 1;
    else {
      k = u < tin ? L.lerp(head * 0.8, head, u / tin) : u < tin * 3 ? L.lerp(head, 0.9, (u - tin) / (tin * 2)) : L.lerp(0.9, 0.72, (u - tin * 3) / (1 - tin * 3));
      if (tout > 0 && u > 1 - tout) k *= Math.pow((1 - u) / tout, 0.8);
    }
    k *= 1 + wob * NZ.n2(s / wl + sd * 5.3, sd * 2.9);
    const wd = Math.max(minW, w * k); WD[i] = wd; if (wd > wmax) wmax = wd;
    X[i] = p[i][0] + (jit ? jit * NZ.n2(s / 55 + sd, 5.5 + sd) : 0);
    Y[i] = p[i][1] + (jit ? jit * NZ.n2(s / 55 - sd, 9.5 - sd) : 0);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const nx = -(Y[b] - Y[a]), ny = X[b] - X[a], m = Math.hypot(nx, ny) || 1; NX[i] = nx / m; NY[i] = ny / m;
  }
  const NB = wmax < 3.6 ? 1 : Math.min(26, Math.max(2, Math.round(wmax / 1.7)));
  for (let b = 0; b < NB; b++) {
    const off = NB === 1 ? 0 : (b + 0.5) / NB - 0.5, edge = Math.abs(off) * 2;
    const db = NZ.n2(b * 7.31 + sd * 11.1, sd * 3.7) * 0.5 + 0.5;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const u = cum[i] / len, s = cum[i];
      const load = o.load ? o.load(u) : 1.1 - dry * (0.5 + 0.95 * u);
      const ink = load + 0.5 * NZ.n2(s / 46 + sd * 3.1, off * 6.3 + b * 1.7 + sd) + 0.22 * NZ.n2(s / 150 + sd, off * 1.3 - sd * 2) - 0.3 * dry * edge * edge - 0.3 * dry * db;
      if (ink > 0.4) {
        const hb = NB === 1 ? WD[i] / 2 : (WD[i] / NB) * 0.5 * L.clamp(0.55 + (ink - 0.4) * 1.7, 0.5, 1.32);
        const cx = X[i] + NX[i] * off * WD[i], cy = Y[i] + NY[i] * off * WD[i];
        _lx[m] = cx + NX[i] * hb; _ly[m] = cy + NY[i] * hb; _rx[m] = cx - NX[i] * hb; _ry[m] = cy - NY[i] * hb; m++;
      } else { fillRun(g, m); m = 0; }
    }
    fillRun(g, m);
  }
  // where the brush is set down the head is round and full
  if (o.cap !== false && prof !== 'lan' && dry < 0.6) { g.beginPath(); g.arc(X[0], Y[0], WD[0] * 0.5, 0, L.TAU); g.fill(); }
}
/** an ink blot with a lumpy outline */
function blot(g, x, y, rad, seed, sq = 0.9) {
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * L.TAU, rr = rad * (1 + 0.3 * NZ.n2(Math.cos(a) * 1.4 + seed, Math.sin(a) * 1.4 - seed));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * sq;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath(); g.fill();
}
/** the skirt of a dab that bled into the paper (洇): a lobed, ragged puddle */
function skirt(g, x, y, rad, seed) {
  g.beginPath();
  for (let i = 0; i <= 44; i++) {
    const a = (i / 44) * L.TAU;
    const rr = rad * (1 + 0.36 * NZ.n2(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6 - seed) + 0.15 * NZ.n2(Math.cos(a) * 5.5 + seed * 2, Math.sin(a) * 5.5));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.92;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath(); g.fill();
}
/** drops flung off the brush in one direction: bigger near the hand, stretched along the throw */
function spatter(g, r, x, y, ang, n, reach, big = 4.2) {
  for (let i = 0; i < n; i++) {
    const d = reach * Math.pow(r(), 0.7), a = ang + r.gauss() * 0.3, rad = L.lerp(big, 1.2, d / reach) * r.range(0.55, 1.3);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    g.save(); g.translate(px, py); g.rotate(a); g.scale(r.range(1, 1.9), 1); blot(g, 0, 0, rad, i * 3.3 + x, 1); g.restore();
  }
}
/** one pull of the big brush along the arc, in polar coordinates: widthAt / loadAt / drOf are functions of theta */
function arcPull(g, a, t0, t1, widthAt, loadAt, drOf, key, NB = 24) {
  const dth = 2.5 / a.R, r = L.rng('s35rx-pull' + key);
  for (let b = 0; b < NB; b++) {
    const off = (b + 0.5) / NB - 0.5, edge = Math.abs(off) * 2, dryB = r();
    let m = 0;
    for (let th = t0; th <= t1; th += dth) {
      const w = widthAt(th);
      const ink = loadAt(th) + 0.48 * NZ.n2(th * 34 + key * 3, off * 4.6 + key) + 0.16 * NZ.n2(th * 120 + key, b * 3.3) - 0.14 * edge * edge - 0.1 * dryB;
      if (ink > 0.3) {
        const hb = (w / NB) * 0.5 * L.clamp(0.6 + ink * 0.8, 0.55, 1.4);
        const dr = drOf(th) + off * w + 0.5 * NZ.n2(th * 230 + b * 5.1, key);
        const sn = Math.sin(th), cs = Math.cos(th), r1 = a.R + dr + hb, r2 = a.R + dr - hb;
        _lx[m] = a.cx + r1 * sn; _ly[m] = a.cy - r1 * cs; _rx[m] = a.cx + r2 * sn; _ry[m] = a.cy - r2 * cs; m++;
      } else { fillRun(g, m); m = 0; }
    }
    fillRun(g, m);
  }
}
/** walk from (x0,y0) toward (x1,y1) and stop where the point would climb past dr = lim(x) */
function capTo(a, x0, y0, x1, y1, lim) {
  let bx = x0, by = y0;
  for (let i = 1; i <= 36; i++) {
    const t = i / 36, x = L.lerp(x0, x1, t), y = L.lerp(y0, y1, t);
    if (a.drAt(x, y) > lim(x)) break;
    bx = x; by = y;
  }
  return [bx, by];
}

// ───────────────────────── the arc: the basket's hoop handle (提梁) ─────────────────────────
function drawHandle(g, gl, a) {
  const s = a.span(PAD + 140);
  const r = L.rng('s35rx-handle');
  const TOP = 2.5;   // the stroke's upper edge is steered along the arc
  // first pull: set down hard at the far left (顿), lifted, pressed again, thinned over the crest, run dry and lifted off
  const w1 = (th) => (27 + 13 * bump(th, -0.372, 0.03) + 9 * bump(th, -0.15, 0.055) - 9 * bump(th, -0.265, 0.05) + 5 * bump(th, 0.02, 0.03)
    - 5 * sstep(0.06, 0.2, th) + 2.2 * NZ.n2(th * 16, 2.2)) * (1 - 0.72 * sstep(0.215, 0.25, th));
  arcPull(g, a, -s, 0.25, w1,
    (th) => 1.1 - 0.34 * bump(th, -0.265, 0.045) - 0.56 * sstep(0.05, 0.17, th) - 0.2 * sstep(0.21, 0.25, th),
    (th) => TOP - w1(th) / 2 + 0.7 * NZ.n2(th * 7, 4.4), 1.7, 30);
  // second pull (复笔): brush re-charged, set down a touch low over the dry tail, carried off to the right
  const w2 = (th) => 30 + 14 * bump(th, 0.214, 0.015) - 8 * bump(th, 0.31, 0.045) + 6 * bump(th, 0.385, 0.03) + 2.2 * NZ.n2(th * 16, 6.2);
  arcPull(g, a, 0.2, s, w2,
    (th) => 1.12 - 0.34 * bump(th, 0.31, 0.04),
    (th) => TOP - w2(th) / 2 - 6 * Math.exp(-(th - 0.2) / 0.03) + 0.7 * NZ.n2(th * 7, 9.4), 5.3, 30);
  const h = a.pt(0.2, -20); blot(g, h.x, h.y, 17, 3.1);
  // the hoop's inner edge: a second, leaner line under the big stroke (the two never quite parallel), broken where the herbs stand
  const inner = (t0, t1, d0, d1, key) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const th = L.lerp(t0, t1, i / 40), q = a.pt(th, L.lerp(d0, d1, sstep(0, 1, i / 40)) + 3.5 * NZ.n2(th * 8, key)); pts.push([q.x, q.y]); }
    return pts;
  };
  brush(g, inner(-s, -0.1, -66, -40, 3.8), { w: 13.5, seed: 12, head: 1.45, tin: 0.03, tout: 0.2, dry: 0.36, wob: 0.42, wlen: 130, step: 4 });
  brush(g, inner(0.105, 0.26, -38, -52, 5.1), { w: 10.5, seed: 13, head: 1.2, tin: 0.05, tout: 0.3, dry: 0.52, wob: 0.42, wlen: 130, step: 4 });
  brush(g, inner(0.235, s, -58, -50, 6.6), { w: 13, seed: 14, head: 1.5, tin: 0.03, tout: 0.02, dry: 0.3, wob: 0.42, wlen: 130, step: 4 });
  // … and felt for once more in pale ink
  brush(gl, inner(-0.36, -0.16, -84, -62, 7.7), { w: 8, seed: 15, tin: 0.04, tout: 0.3, dry: 0.3, wob: 0.4, step: 4 });
  // drops shaken off where the brush pressed
  const d0 = a.pt(-0.36, -30); spatter(g, r, d0.x, d0.y + 24, 1.9, 5, 80, 5.5);
  spatter(g, r, h.x + 10, h.y + 30, 1.25, 5, 70, 5);
}

// ───────────────────────── the herbs standing out of the basket ─────────────────────────
function sampler(ctrl, step = 6) {
  const p = L.smoothPath(ctrl, step), n = p.length;
  return { p, at(t) { const i = Math.min(n - 2, Math.max(1, Math.round(t * (n - 1)))); const a0 = p[i - 1], b0 = p[i + 1]; return { x: p[i][0], y: p[i][1], ang: Math.atan2(b0[1] - a0[1], b0[0] - a0[0]) }; } };
}
const DOTS = [[1092, 768, 16], [866, 742, 12], [1014, 690, 10], [752, 830, 13], [1200, 812, 11], [1240, 948, 10], [684, 952, 9]];
function drawHerbs(g, gl, a) {
  const r = L.rng('s35rx-herb-2');
  const lim = () => -26;                // nothing climbs over the handle: the tallest tips stop just under the big stroke
  const tip = (x, d) => [x, a.yAt(x) + d];
  const STEMS = [
    { c: [[944, 1210], [920, 1050], [882, 905], [838, 770], tip(806, 40)], w: 17, dry: 0.3 },
    { c: [[968, 1210], [976, 1040], [958, 880], [972, 730], tip(966, 24)], w: 19, dry: 0.2 },
    { c: [[994, 1210], [1030, 1050], [1080, 905], [1122, 770], tip(1150, 54)], w: 16, dry: 0.38 },
    { c: [[916, 1210], [864, 1085], [790, 975], [726, 880], tip(686, 150)], w: 14, dry: 0.44 },
    { c: [[1020, 1210], [1088, 1090], [1168, 990], [1228, 905], tip(1264, 170)], w: 14, dry: 0.4 },
  ];
  const LEAVES = [   // stem, t along it, side, spread (rad), length, width, pale?
    [0, 0.34, -1, 0.85, 250, 52, 0], [0, 0.62, -1, 0.6, 195, 42, 0], [0, 0.8, 1, 0.5, 135, 32, 0],
    [1, 0.5, 1, 0.55, 215, 46, 0], [1, 0.7, -1, 0.45, 165, 36, 1],
    [2, 0.36, 1, 0.9, 255, 54, 0], [2, 0.6, 1, 0.6, 195, 42, 1], [2, 0.8, -1, 0.5, 135, 32, 0],
    [3, 0.6, -1, 0.7, 190, 42, 0], [3, 0.97, -1, 0.2, 140, 34, 1],
    [4, 0.58, 1, 0.75, 195, 44, 0], [4, 0.97, 1, 0.25, 145, 34, 0],
  ];
  const SP = STEMS.map((s) => sampler(s.c));
  // leaves: one pressed stroke each — set down thin at the stalk, pressed, lifted to a point (撇叶)
  LEAVES.forEach(([si, t, side, spread, len, wid, pale], k) => {
    const q = SP[si].at(t), ang = q.ang + side * spread + r.range(-0.08, 0.08);
    const [tx, ty] = capTo(a, q.x, q.y, q.x + Math.cos(ang) * len, q.y + Math.sin(ang) * len, lim);
    const l = Math.hypot(tx - q.x, ty - q.y); if (l < 50) return;
    const cs = Math.cos(ang), sn = Math.sin(ang), bend = side * r.range(0.03, 0.14) * l;
    const P = (u) => [q.x + cs * l * u - sn * bend * Math.sin(Math.PI * u), q.y + sn * l * u + cs * bend * Math.sin(Math.PI * u)];
    const wd = wid * Math.min(1, l / len + 0.25);
    if (pale) {
      brush(gl, [P(0), P(0.3), P(0.65), P(1)], { w: wd * 1.08, prof: 'lan', dry: r.range(0.02, 0.14), seed: 900 + k, wob: 0.14, step: 3 });
      brush(g, [P(0.02), P(0.4), P(0.86)], { w: 6.5, seed: 950 + k, head: 1.3, tin: 0.08, tout: 0.6, dry: 0.3, wob: 0.3 });   // midrib in dark ink
    } else {
      brush(g, [P(0), P(0.3), P(0.65), P(1)], { w: wd, prof: 'lan', dry: r.range(0.24, 0.58), seed: 900 + k, wob: 0.16, step: 3 });
    }
  });
  // stalks: fast, a whip of a line each
  STEMS.forEach((s, i) => brush(g, SP[i].p, { w: s.w, seed: 400 + i, head: 1.5, tin: 0.04, tout: 0.5, dry: s.dry, wob: 0.34, jit: 2.5, step: 6 }));
  // blades shot up from the root of the sheaf
  for (let i = 0; i < 18; i++) {
    const bx = 968 + r.gauss() * 46;
    const ex = L.clamp(968 + (bx - 968) * r.range(2.2, 4.2) + r.gauss() * 70, 706, 1246);
    const ey = a.yAt(ex) + r.pick([34, 46, 60, 84, 120, 170, 230]);
    const mx = L.lerp(bx, ex, 0.45) + r.range(-34, 34), my = L.lerp(1200, ey, 0.5);
    brush(i % 6 === 1 ? gl : g, [[bx, 1200], [mx, my], [ex, ey]], { w: r.range(7, 14), seed: 500 + i, head: 1.35, tin: 0.05, tout: 0.72, dry: r.range(0.15, 0.55), wob: 0.3 });
  }
  // scribble (乱线): the brush races up to the handle, back down and up again without lifting
  const zig = (c, x0, x1, yb, n, w, sd) => {
    const pts = [];
    let x = x0;
    for (let i = 0; i <= n; i++) {
      if (i % 2 === 0) pts.push([x + r.range(-8, 8), yb + r.range(-70, 50) * (i ? 1 : 0.3)]);
      else { const xx = x + r.range(-26, 26); pts.push([xx, a.yAt(xx) + r.pick([36, 52, 76, 108, 150])]); }
      x += ((x1 - x0) / n) * r.range(0.5, 1.5);
    }
    brush(c, pts, { w, seed: sd, head: 1.3, tin: 0.03, tout: 0.1, dry: 0.4, wob: 0.5, wlen: 70, step: 3 });
  };
  zig(g, 836, 940, 880, 6, 10.5, 801);
  zig(g, 1014, 1120, 866, 6, 10, 802);
  zig(gl, 1150, 1226, 846, 4, 8.5, 803);
  // dots dabbed among the tips; each bled a pale skirt into the paper (洇)
  DOTS.forEach(([x, y, rad], i) => {
    blot(g, x, y, rad, 2.2 + i * 1.7, r.range(0.75, 1));
    skirt(gl, x + r.range(-2, 3), y + r.range(1, 4), rad * r.range(1.75, 2.2), 7.1 + i * 2.3);
  });
  spatter(g, r, 1092, 768, -0.6, 5, 84, 5);
  spatter(g, r, 752, 830, -2.5, 4, 70, 4.6);
}

// ───────────────────────── running script: herb name, dose in small characters at its lower right ─────────────────────────
// Writing order right → left. `load` = ink on the brush (1 = just dipped): fat and black, then leaner and scratchier.
const COLS = [
  { x: 1900, name: '黄芪', dose: '三钱', size: 132, load: 1.0 },
  { x: 1614, name: '陈皮', dose: '二钱', size: 124, load: 0.62 },
  { x: 1388, name: '茯苓', dose: '三钱', size: 128, load: 0.34 },
  { x: 522, name: '当归', dose: '三钱', size: 134, load: 0.96 },
  { x: 286, name: '甘草', dose: '一钱', size: 124, load: 0.52 },
];
function drawScript(g, a) {
  const r = L.rng('s35rx-script');
  // bristle tracks: thin streaks gathered in patches, scratched out of a character when the brush is running dry
  const streak = L.noiseTex(640, 640, { seed: 's35rx-streak', scale: 10, sx: 10, sy: 0.42, octaves: 3, contrast: 2.6, res: 0.5,
    ramp: [[0, 'rgba(0,0,0,1)'], [0.3, 'rgba(0,0,0,0.75)'], [0.46, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] });
  const sg = streak.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.drawImage(L.noiseTex(640, 640, { seed: 's35rx-patch', scale: 70, octaves: 2, contrast: 2.2, res: 0.25, ramp: [[0, 'rgba(0,0,0,0)'], [0.4, 'rgba(0,0,0,0.15)'], [0.62, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
  const TS = 340, T = L.makeCanvas(TS, TS), t = T.getContext('2d'), c = TS / 2;
  const glyph = (ch, x, y, size, load) => {
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, TS, TS);
    t.font = `400 ${size}px ${HAND}`; t.textAlign = 'center'; t.textBaseline = 'middle'; t.fillStyle = INK; t.strokeStyle = INK;
    t.fillText(ch, c, c);
    const fat = L.lerp(0, size * 0.036, load);
    if (fat > 0.6) { t.lineWidth = fat; t.lineJoin = 'round'; t.strokeText(ch, c, c); }
    const dry = L.lerp(0.62, 0.1, load);
    t.globalCompositeOperation = 'destination-out'; t.globalAlpha = dry;
    t.translate(c, c); t.rotate(-0.62 + r.range(-0.25, 0.25));
    t.drawImage(streak, -320 + r.range(-55, 55), -320 + r.range(-55, 55));
    g.save();
    g.translate(x, y); g.rotate(r.range(-0.06, 0.05)); g.transform(1, 0, r.range(-0.1, 0.02), 1, 0, 0); g.scale(r.range(0.95, 1.05), r.range(0.97, 1.06));
    g.globalAlpha = L.lerp(0.84, 1, load);
    g.drawImage(T, -c, -c);
    g.restore();
  };
  for (const col of COLS) {
    let y = a.yAt(col.x) + 72, x = col.x, load = col.load;
    Array.from(col.name).forEach((ch, i) => {
      const sz = col.size * (i ? 0.95 : 1) * r.range(0.97, 1.03);
      y += sz * 0.5; glyph(ch, x + r.range(-5, 5), y, sz, load); y += sz * 0.45;
      x += r.range(-7, 3); load = Math.max(0.05, load - 0.13);
    });
    y += 10; x += col.size * 0.25;
    Array.from(col.dose).forEach((ch) => {
      const sz = col.size * 0.5 * r.range(0.96, 1.04);
      y += sz * 0.5; glyph(ch, x + r.range(-3, 3), y, sz, Math.max(0.05, load)); y += sz * 0.47;
      load -= 0.1;
    });
  }
}
/** the corner: one pale-ink ring and a dot (圈点) */
function drawMarks(gl) {
  const cx = 108, cy = 950, R = 58, pts = [];
  for (let i = 0; i <= 26; i++) { const t = -2.3 + (i / 26) * (L.TAU + 0.55), rr = R * (1 + 0.07 * NZ.n2(i * 0.3, 8.8)) * L.lerp(1, 0.9, i / 26); pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.9]); }
  brush(gl, pts, { w: 14, seed: 41, head: 1.3, tin: 0.05, tout: 0.3, dry: 0.16, wob: 0.3, step: 3 });
  blot(gl, cx + 100, cy + 64, 9.5, 4.4);
}

// ───────────────────────── paper ─────────────────────────
const CREASE = [1508, -PAD, 1490, H + PAD];
function alongCrease(g, fn) {
  const [x0, y0, x1, y1] = CREASE, len = Math.hypot(x1 - x0, y1 - y0);
  g.save(); g.translate(x0, y0); g.rotate(Math.atan2(y1 - y0, x1 - x0)); fn(len); g.restore();   // local +y = screen left
}
function buildPaper(env) {
  const a = env.arc;
  const r = L.rng('s35rx-paper');
  const inZone = (x, y) => x > 570 && x < 1350 && y > 230 && y < a.yAt(x) - 4;
  const laidY = [], chainX = [];
  for (let y = -PAD - 6; y < H + PAD + 12; y += 11.5 + r.range(-0.9, 0.9)) laidY.push(y);
  for (let x = -PAD + 41; x < W + PAD; x += 214 + r.range(-12, 12)) chainX.push(x);
  // relief a low lamp picks out of the sheet: laid lines (帘纹), chain lines, raised fibres, tooth
  const hm = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#808080'; g.fillRect(-PAD, -PAD, FW, FH);
    g.globalAlpha = 0.14; g.drawImage(L.noiseTex(FW, FH, { seed: 's35rx-tooth', scale: 5, octaves: 2, res: 0.5, contrast: 1.6 }), -PAD, -PAD); g.globalAlpha = 1;
    g.lineCap = 'round';
    for (const y0 of laidY) {
      g.strokeStyle = `rgba(255,255,255,${r.range(0.06, 0.19).toFixed(3)})`; g.lineWidth = r.range(3, 5.2);
      g.beginPath();
      for (let x = -PAD; x <= W + PAD + 60; x += 60) { const y = y0 + 1.7 * NZ.n2(x / 420, y0 * 0.05) + 0.5 * NZ.n2(x / 70, y0); if (x === -PAD) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    for (const x0 of chainX) {
      g.strokeStyle = 'rgba(0,0,0,0.11)'; g.lineWidth = 5;
      g.beginPath();
      for (let y = -PAD; y <= H + PAD + 80; y += 80) { const x = x0 + 3 * NZ.n2(y / 500, x0 * 0.03); if (y === -PAD) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 900; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(16, 90), an = r() * Math.PI;
      g.strokeStyle = `rgba(255,255,255,${r.range(0.08, 0.3).toFixed(3)})`; g.lineWidth = r.range(1.4, 3);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-9, 9), y + Math.sin(an) * len * 0.5 + r.range(-9, 9), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
    }
  });
  const relief = L.bumpLight(hm, { angle: 45, strength: 2.8, res: 0.5 });

  const paper = L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, FW, FH);
    // apricot-yellow sheet: one clean hue, more luminous under the lamp, deeper toward the far corners
    g.fillStyle = L.radial(g, 900, 380, 160, 1500, [[0, '#f6de96'], [0.42, '#eed388'], [0.78, '#e7c778'], [1, '#dcb662']]); full();
    // slow clouding inside the same hue (no brown veil)
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.5;
    g.drawImage(L.noiseTex(FW, FH, { seed: 's35rx-m1', scale: 430, octaves: 3, warp: 0.6, res: 0.2, contrast: 1.4, ramp: [[0, '#ead093'], [0.5, '#fbf2d6'], [1, '#fffdf0']] }), -PAD, -PAD);
    g.globalAlpha = 0.22;
    g.drawImage(L.noiseTex(FW, FH, { seed: 's35rx-m2', scale: 38, octaves: 3, res: 0.25, contrast: 1.6, ramp: [[0, '#dfc084'], [0.45, '#fbf4e0'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalAlpha = 1;
    // water stains (水渍): pale pools ringed by a tide-line — lower-left corner, upper right, two small rings
    {
      const res = 1 / 3, cw = Math.round(FW * res), ch = Math.round(FH * res), img = new ImageData(cw, ch), d = img.data, nz = L.makeNoise('s35rx-stain');
      const pools = [[120, 1020, 310, 0.7], [1850, 90, 280, 0.3], [1716, 668, 46, 0.5], [60, 330, 150, 0.4], [1300, 1010, 54, 0.55]];
      const sc0 = L.parseColor(SPOT);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const fx = x / res - PAD, fy = y / res - PAD;
        let al = 0;
        for (let i = 0; i < pools.length; i++) {
          const p = pools[i], dx = fx - p[0], dy = fy - p[1];
          if (Math.abs(dx) > p[2] * 1.5 || Math.abs(dy) > p[2] * 1.5) continue;
          const dd = Math.hypot(dx, dy) / p[2] + 0.26 * nz.fbm(fx / 190 + i * 9.1, fy / 190 - i * 4.7, 3) + 0.035 * nz.n2(fx / 21, fy / 21);
          if (dd < 1) { const e = sstep(0.9, 0.995, dd); al += p[3] * (0.06 + 0.55 * e * e + 0.1 * bump(dd, 0.66, 0.025)); }
        }
        const k = (y * cw + x) * 4; d[k] = sc0[0] * 0.92; d[k + 1] = sc0[1] * 0.84; d[k + 2] = sc0[2] * 0.62; d[k + 3] = Math.min(255, al * 255);
      }
      const sc = L.makeCanvas(cw, ch); sc.getContext('2d').putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.filter = 'blur(1.5px)'; g.drawImage(sc, -PAD, -PAD, FW, FH); g.filter = 'none';
    }
    // foxing (霉点): rusty freckles gathered in drifts out at the sides; none where the caption sits
    const drifts = [[1660, 250, 150], [270, 170, 160], [1800, 930, 180], [120, 690, 150], [1500, 560, 110], [420, 1010, 150]];
    for (let i = 0; i < 130; i++) {
      let x, y;
      if (i % 4) { const dft = drifts[i % drifts.length]; x = dft[0] + r.gauss() * dft[2] * 0.6; y = dft[1] + r.gauss() * dft[2] * 0.6; } else { x = r.range(-PAD, W + PAD); y = r.range(-PAD, H + PAD); }
      if (inZone(x, y)) continue;
      const above = a.drAt(x, y) > 0;
      const rad = L.lerp(2.5, above ? 11 : 16, Math.pow(r(), 2.4)), al = r.range(0.25, 0.65) * (above ? 0.7 : 1);
      const col = r.pick(['#b06c1e', '#b97a2c', SPOT, '#a2601c']);
      g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al)], [0.5, L.rgba(col, al * 0.7)], [1, L.rgba(col, 0)]]);
      g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.7, 1), r() * 3, 0, L.TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // the sheet's own fibre: long strands, light and dark, lying every which way
    g.lineCap = 'round';
    for (let i = 0; i < 1000; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(14, 90) * (r.chance(0.08) ? 2 : 1), an = r() * Math.PI;
      g.strokeStyle = r.chance(0.5) ? L.rgba('#a67626', r.range(0.08, 0.26)) : L.rgba('#fff8de', r.range(0.14, 0.36));
      g.lineWidth = r.range(0.7, 1.9);
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + Math.cos(an) * len * 0.33 + r.range(-9, 9), y + Math.sin(an) * len * 0.33 + r.range(-9, 9), x + Math.cos(an) * len * 0.66 + r.range(-9, 9), y + Math.sin(an) * len * 0.66 + r.range(-9, 9), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
    }
    // flecks of bark and grit in the pulp (thinned out under the caption)
    L.speckle(g, { seed: 's35rx-spk', count: 1700, x: -PAD, y: -PAD, w: FW, h: FH, rMin: 0.6, rMax: 2.7, colors: ['#6a4a1e', '#8a5e24', '#4a3216'], alpha: [0.14, 0.6], test: (x, y) => !inZone(x, y) || ((x * 7 + y * 13) | 0) % 3 === 0 });
    // the fold (折痕): a ridge standing toward the lamp — lit flank on the left, shaded flank on the right, fibres worn white along it
    alongCrease(g, (len) => {
      g.fillStyle = L.linear(g, 0, 0, 0, 34, [[0, 'rgba(255,247,214,0.1)'], [1, 'rgba(255,247,214,0)']]); g.fillRect(0, 0, len, 34);
      g.fillStyle = L.linear(g, 0, -40, 0, 0, [[0, 'rgba(150,98,22,0)'], [0.6, 'rgba(150,98,22,0.03)'], [1, 'rgba(140,90,18,0.09)']]); g.fillRect(0, -40, len, 40);
      for (let x = 0; x < len; x += 5) {
        const n = NZ.n2(x * 0.012, 6.6), yy = 2.6 * NZ.n2(x * 0.004, 8);
        g.fillStyle = `rgba(116,72,14,${Math.max(0, 0.22 + 0.22 * n).toFixed(3)})`; g.fillRect(x, yy - 1.4, 5.5, 1.4);
        g.fillStyle = `rgba(255,249,226,${Math.max(0, 0.34 + 0.3 * n).toFixed(3)})`; g.fillRect(x, yy, 5.5, 1.7);
      }
      for (let i = 0; i < len * 0.32; i++) { g.fillStyle = L.rgba('#fff7dc', r.range(0.1, 0.45)); g.fillRect(r() * len, r.gauss() * 3, r.range(1, 4), r.range(0.6, 1.6)); }
    });
    // raking light on the relief, paper tooth, and a gentle cockling of the sheet
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.6;
    g.drawImage(relief, -PAD, -PAD);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.45;
    g.drawImage(L.grainTex(FW, FH, { seed: 's35rx-grain', amount: 0.2, size: 2 }), -PAD, -PAD);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.2;
    g.drawImage(L.noiseTex(FW, FH, { seed: 's35rx-cockle', scale: 460, sx: 1.8, octaves: 3, res: 0.15, contrast: 1.5 }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
  return { paper, laidY };
}

/** what the paper takes back out of the ink: pinholes, dry patches, the laid lines' furrows, wear along the fold (a destination-out mask) */
function buildErosion(laidY) {
  const hw = FW >> 1, hh = FH >> 1;
  const c = L.makeCanvas(FW, FH), g = c.getContext('2d');
  const r = L.rng('s35rx-ero'), img = new ImageData(hw, hh), d = img.data;
  for (let i = 3; i < d.length; i += 4) { const v = r(); if (v > 0.93) d[i] = 50 + (v - 0.93) * 2000; }
  const pin = L.makeCanvas(hw, hh); pin.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.globalAlpha = 0.75; g.drawImage(pin, 0, 0, FW, FH); g.globalAlpha = 1;
  g.drawImage(L.noiseTex(FW, FH, { seed: 's35rx-dry', scale: 22, octaves: 3, res: 0.33, contrast: 2.1, ramp: [[0, 'rgba(0,0,0,0.42)'], [0.26, 'rgba(0,0,0,0.08)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  g.drawImage(L.noiseTex(FW, FH, { seed: 's35rx-dry2', scale: 260, octaves: 3, res: 0.15, contrast: 1.6, ramp: [[0, 'rgba(0,0,0,0.2)'], [0.5, 'rgba(0,0,0,0.03)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  g.translate(PAD, PAD);
  // the brush skips the furrows between the laid lines
  g.lineCap = 'butt';
  for (const y0 of laidY) {
    for (let x = -PAD; x < W + PAD; x += 46) {
      const n = NZ.n2(x / 120 + 3, y0 / 37);
      if (n < 0.1) continue;
      g.strokeStyle = `rgba(0,0,0,${(0.5 * (n - 0.1)).toFixed(3)})`; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y0 + 5.5 + 1.7 * NZ.n2(x / 420, y0 * 0.05)); g.lineTo(x + 46, y0 + 5.5 + 1.7 * NZ.n2((x + 46) / 420, y0 * 0.05)); g.stroke();
    }
  }
  alongCrease(g, (len) => {
    for (let i = 0; i < len * 0.8; i++) { g.fillStyle = `rgba(0,0,0,${r.range(0.3, 1).toFixed(2)})`; g.fillRect(r() * len, r.gauss() * 1.8 - 0.5, r.range(1, 4.5), r.range(0.8, 2.4)); }
  });
  return c;
}
/** ink is not vector: soften the layer a touch, push its edge about with noise, and harden it again (rows from y0 down) */
function roughen(layer, y0) {
  const w = layer.width, h = layer.height - y0, c = L.makeCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.filter = 'blur(1.1px)'; g.drawImage(layer, 0, -y0); g.filter = 'none';
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0, i = 3; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    const al = d[i];
    if (al < 6 || al > 249) continue;
    const n = NZ.n2(x * 0.3, y * 0.3) * 0.27 + NZ.n2(x * 0.071 + 40, y * 0.071) * 0.13;
    d[i] = L.clamp((al / 255 - 0.42 + n) * 3.4 + 0.5) * 255;
  }
  g.putImageData(img, 0, 0);
  const lg = layer.getContext('2d');
  lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, y0, w, h); lg.drawImage(c, 0, y0); lg.restore();
}
function erode(layer, mask, amt) {
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = amt;
  g.drawImage(mask, 0, 0);
  g.restore();
}

export default {
  name: '处方笺与药篮速写',
  tone: 'dark',
  init(env) {
    const a = env.arc;
    const { paper, laidY } = buildPaper(env);
    const light = L.makeLayer(PAD), dark = L.makeLayer(PAD);
    const gl = light.getContext('2d'), g = dark.getContext('2d');
    gl.fillStyle = INK_L; g.fillStyle = INK;
    drawHandle(g, gl, a);
    drawHerbs(g, gl, a);
    drawMarks(gl);
    g.fillStyle = INK;
    drawScript(g, a);
    const halo = L.blurred(dark, 5);
    const y0 = PAD + 430;
    roughen(dark, y0); roughen(light, y0);
    const mask = buildErosion(laidY); erode(dark, mask, 0.55); erode(light, mask, 0.4);
    // pale ink is a wash: it pools and thins inside the stroke …
    erode(light, L.noiseTex(FW, FH, { seed: 's35rx-pool', scale: 46, octaves: 3, res: 0.25, contrast: 1.8, ramp: [[0, 'rgba(0,0,0,0.5)'], [0.5, 'rgba(0,0,0,0.16)'], [0.75, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), 1);
    // … and dries with a darker rim where the water carried the carbon to its edge
    const rim = L.makeCanvas(FW, FH), rg = rim.getContext('2d');
    rg.drawImage(light, 0, 0); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(L.blurred(light, 2.6), 0, 0);
    // the thickest ink is not one flat black either
    L.overlayOn(dark, L.noiseTex(FW, FH, { seed: 's35rx-inkvar', scale: 60, octaves: 3, res: 0.25, contrast: 1.7, ramp: [[0, 'rgba(120,96,60,0.3)'], [0.4, 'rgba(120,96,60,0.06)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.25)']] }), { blend: 'source-atop', alpha: 1 });

    const pic = L.makeLayer(PAD, (c) => {
      const full = () => c.fillRect(-PAD, -PAD, FW, FH);
      c.drawImage(paper, -PAD, -PAD);
      c.globalCompositeOperation = 'multiply';
      c.globalAlpha = 0.2; c.drawImage(halo, -PAD, -PAD);
      c.globalAlpha = 0.9; c.drawImage(light, -PAD, -PAD);
      c.globalAlpha = 0.5; c.drawImage(rim, -PAD, -PAD);
      c.globalAlpha = 1; c.drawImage(dark, -PAD, -PAD);
      // lamp from the upper left: the sheet is brightest there and deepens — same hue, no brown — toward the far corners
      c.fillStyle = L.radial(c, 860, 400, 300, 1750, [[0, 'rgba(226,176,70,0)'], [0.5, 'rgba(226,176,70,0.07)'], [1, 'rgba(220,168,62,0.25)']]); full();
      c.globalCompositeOperation = 'soft-light';
      c.fillStyle = L.linear(c, 0, 0, W, H, [[0, 'rgba(255,242,200,0.22)'], [0.5, 'rgba(128,128,128,0)'], [1, 'rgba(110,64,10,0.12)']]); full();
      c.globalCompositeOperation = 'source-over';
    });
    // lens: sharp round the crest, a touch soft toward the far corners and the foot of the frame
    const soft = L.blurred(pic, 3.2), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in';
    sg.translate(PAD, PAD);
    sg.fillStyle = L.radial(sg, a.cx, a.crestY + 40, 620, 1250, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    sg.fillRect(-PAD, -PAD, FW, FH);
    const pg = pic.getContext('2d');
    pg.drawImage(soft, -PAD, -PAD);
    S = { pic };
  },
  draw(ctx, env, p) {
    // the slip turns a hair under the lamp; the ink does not deform
    L.blit(ctx, env, S.pic, { rot: L.lerp(-0.0034, 0.0034, p), zoom: L.lerp(1.0, 1.008, p) });
    // the lamp pool drifts the other way across the sheet
    const lx = L.lerp(700, 860, p), ly = L.lerp(350, 330, p);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = L.radial(ctx, lx, ly, 60, 1150, [[0, 'rgba(255,246,214,0.3)'], [0.45, 'rgba(255,240,200,0.07)'], [1, 'rgba(96,54,6,0.13)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};
