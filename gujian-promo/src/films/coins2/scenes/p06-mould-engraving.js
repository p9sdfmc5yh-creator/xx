// p06 — 叠铸范线刻: a copper-plate engraving of coin-mould slabs laid out in oblique projection. Rows of round coin cavities
// (the square core stands UP inside each cavity — a mould is the negative of the coin) hang off a central runner; some slabs
// are stacked two and three high. Pure black line + hatching on cream paper, light from the upper-left. No lettering anywhere.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const LS = 1400, INK = '#1a1612', TAU = Math.PI * 2;
const UX = 0.94, UY = -0.30, VX = 0.36, VY = 0.60;          // oblique projection: U runs along a slab, V across it, height is screen-up
const AU = Math.atan2(UY, UX), AV = Math.atan2(VY, VX);
const W = 430, RC = 76, OFF = 112, STEP = 200;              // slab width, cavity radius, cavity offset from the runner, cavity pitch
const P = (u, v, h = 0) => [u * UX + v * VX, u * UY + v * VY - h];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
let layer = null;

function bbOf(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [Math.max(-20, x0), Math.max(-20, y0), Math.min(LS + 20, x1), Math.min(LS + 20, y1)];
}
const polyFn = (pts) => (g) => { pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };

// engraver's hatching: parallel burin lines on a GLOBAL lattice (so neighbouring patches line up), each slightly wavy and of its own weight
function hatch(g, pathFn, bb, ang, sp, lw, key, o = {}) {
  const [x0, y0, x1, y1] = bb; if (x1 <= x0 || y1 <= y0) return;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  let nmin = 1e9, nmax = -1e9, tmin = 1e9, tmax = -1e9;
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
    const n = x * nx + y * ny, t = x * dx + y * dy;
    nmin = Math.min(nmin, n); nmax = Math.max(nmax, n); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
  }
  g.save(); g.beginPath(); pathFn(g); g.clip();
  g.strokeStyle = INK; g.lineCap = 'butt'; g.lineJoin = 'round';
  const T0 = Math.floor(tmin / 36) * 36 - 36;
  for (let i = Math.floor(nmin / sp); i <= Math.ceil(nmax / sp); i++) {
    const h1 = hash(i, key), h2 = hash(i + 0.5, key);
    if (o.skip && h1 < o.skip) continue;
    const n = (i + (h1 - 0.5) * 0.28) * sp;
    g.lineWidth = lw * (0.78 + 0.44 * h2);
    g.beginPath();
    for (let t = T0; t <= tmax + 36; t += 36) {
      const w = Math.sin(t * 0.021 + h1 * 40) * 0.5 + Math.sin(t * 0.0067 + h2 * 20) * 0.45;
      const x = dx * t + nx * (n + w), y = dy * t + ny * (n + w);
      if (t === T0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
}
const hatchPoly = (g, pts, ang, sp, lw, key, o) => hatch(g, polyFn(pts), bbOf(pts), ang, sp, lw, key, o);

// a hand-drawn contour: straight runs broken every ~26 px with a hair of wobble
function wl(g, pts, lw, key = 1, closed = false) {
  g.strokeStyle = INK; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  const n = pts.length, m = closed ? n : n - 1;
  for (let s = 0; s < m; s++) {
    const a = pts[s], b = pts[(s + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.max(1, Math.round(len / 26));
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    for (let j = s === 0 ? 0 : 1; j <= k; j++) {
      const t = j / k, w = j === 0 || j === k ? 0 : (hash(s * 53 + j, key) - 0.5) * 0.9;
      const x = a[0] + (b[0] - a[0]) * t + nx * w, y = a[1] + (b[1] - a[1]) * t + ny * w;
      if (s === 0 && j === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
  if (closed) g.closePath();
  g.stroke();
}
function knock(g, fn) { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); fn(g); g.fill(); g.restore(); }

function slab(g, tmp, s, r, key) {
  const { u0, u1, v0, H, funnel } = s; const v1 = v0 + W, vc = v0 + W / 2;
  const t = tmp.getContext('2d');
  const sh = [H * 1.15 + 4, H * 0.42 + 3];
  const A = P(u0, v0), B = P(u1, v0), C = P(u1, v1), D = P(u0, v1);
  const At = P(u0, v0, H), Bt = P(u1, v0, H), Ct = P(u1, v1, H), Dt = P(u0, v1, H);
  // cast shadow on the ground, falling to the lower-right
  for (const q of [[D, C, add(C, sh), add(D, sh)], [B, C, add(C, sh), add(B, sh)]]) {
    hatchPoly(g, q, AU, 2.7, 1.3, 11); hatchPoly(g, q, AU + 1.1, 3.3, 1.05, 12);
  }
  knock(g, polyFn([At, Bt, Ct, C, D, A]));
  // side faces: the long front face is in shade (upright hatch + a second set low down), the left end catches the light
  hatchPoly(g, [Dt, Ct, C, D], Math.PI / 2 + 0.05, 3.2, 1.0, 21);
  hatchPoly(g, [P(u0, v1, H * 0.5), P(u1, v1, H * 0.5), C, D], AU, 4.0, 0.9, 22);
  hatchPoly(g, [At, Dt, D, A], AV, 5.5, 0.8, 23, { skip: 0.12 });
  hatchPoly(g, [P(u0, v0, 9), P(u0, v1, 9), D, A], Math.PI / 2, 4.2, 0.7, 24);
  for (let h = 40; h < H; h += 40) {                       // seams between stacked slabs
    wl(g, [P(u0, v0, h), P(u0, v1, h), P(u1, v1, h)], 1.7, h + key);
    wl(g, [P(u0, v0, h - 3.5), P(u0, v1, h - 3.5), P(u1, v1, h - 3.5)], 0.8, h + key + 1);
  }
  // top face: stipple (denser toward the front edge), short scraper marks, a few hairline cracks
  const uLo = Math.max(u0, -1000), uHi = Math.min(u1, 1500);
  const onPage = (p) => p[0] > -8 && p[0] < LS + 8 && p[1] > -8 && p[1] < LS + 8;
  g.fillStyle = INK; g.beginPath();
  for (let i = 0, n = Math.round((uHi - uLo) * 1.7); i < n; i++) {
    const p = P(r.range(uLo, uHi), v0 + Math.pow(r(), 0.62) * W, H); const rad = r.range(0.45, 1.05);
    if (!onPage(p)) continue;
    g.moveTo(p[0] + rad, p[1]); g.arc(p[0], p[1], rad, 0, TAU);
  }
  g.fill();
  g.strokeStyle = INK; g.lineCap = 'round';
  for (let i = 0, n = Math.round((uHi - uLo) * 0.11); i < n; i++) {
    const p = P(r.range(uLo, uHi), v0 + r() * W, H), len = r.range(6, 22), a = AU + r.range(-0.22, 0.22);
    if (!onPage(p)) continue;
    g.lineWidth = r.range(0.55, 0.95); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0; i < 7; i++) {
    let p = P(r.range(uLo, uHi), v0 + r() * W, H), a = r() * TAU; if (!onPage(p)) continue;
    g.lineWidth = 0.85; g.beginPath(); g.moveTo(p[0], p[1]);
    for (let k = 0, n = r.int(4, 9); k < n; k++) { a += r.range(-0.7, 0.7); const l = r.range(8, 20); p = [p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l * 0.6]; g.lineTo(p[0], p[1]); }
    g.stroke();
  }
  hatchPoly(g, [P(u0, v1 - 15, H), P(u1, v1 - 15, H), Ct, Dt], AU, 3.6, 0.65, 25, { skip: 0.1 });   // the front arris turning away
  // the casting system: runner + gates + cavities as ONE sunk shape
  const cav = [];
  for (let cu = u0 + (funnel ? 270 : 130 + s.phase); cu < u1 - RC - 40; cu += STEP) cav.push(cu);
  const ua = funnel ? u0 + 150 : u0 - 10, ub = u1 > 1600 ? u1 : u1 - 70;
  const buildAt = (q, dx, dy) => {
    q.setTransform(UX, UY, VX, VY, dx, -H + dy);
    if (funnel) { q.moveTo(u0 - 2, vc - 50); q.lineTo(u0 + 152, vc - 18); q.lineTo(u0 + 152, vc + 18); q.lineTo(u0 - 2, vc + 50); q.closePath(); }
    q.rect(ua, vc - 18, ub - ua, 36);
    for (const cu of cav) {
      q.rect(cu - 11, vc - 46, 22, 92);
      q.moveTo(cu + RC, vc - OFF); q.arc(cu, vc - OFF, RC, 0, TAU);
      q.moveTo(cu + RC, vc + OFF); q.arc(cu, vc + OFF, RC, 0, TAU);
    }
    q.setTransform(1, 0, 0, 1, 0, 0);
  };
  const here = (q) => buildAt(q, 0, 0);
  const tb = bbOf([At, Bt, Ct, Dt]);
  g.strokeStyle = INK; g.lineWidth = 3.8; g.lineJoin = 'round'; g.beginPath(); here(g); g.stroke();
  knock(g, here);
  hatch(g, here, tb, AU, 4.4, 0.72, 31);                  // floor of the cavities: one light tone
  const shadow = (sx, sy, passes) => {                    // shadow thrown into the recess by its upper-left lip
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, LS, LS);
    for (const [ang, sp, lw, k] of passes) hatch(t, here, tb, ang, sp, lw, k);
    t.globalCompositeOperation = 'destination-out'; t.fillStyle = '#000'; t.beginPath(); buildAt(t, sx, sy); t.fill();
    t.globalCompositeOperation = 'source-over';
    g.drawImage(tmp, 0, 0);
  };
  shadow(27, 19, [[AU + 1.12, 3.5, 0.9, 32]]);
  shadow(14, 10, [[AU + 1.12, 2.5, 1.25, 33], [AU, 3.0, 1.0, 34]]);
  // inside each cavity: the rim groove, the inner-rim square, and the raised square core with its own shadow
  const ell = (cu, cv, rr, a0, a1, lw) => {
    g.beginPath(); g.setTransform(UX, UY, VX, VY, 0, -H); g.arc(cu, cv, rr, a0, a1); g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = INK; g.lineWidth = lw; g.lineCap = 'round'; g.stroke();
  };
  for (const cu of cav) for (const sgn of [-1, 1]) {
    const cv = vc + sgn * OFF, c = P(cu, cv, H);
    if (c[0] < -140 || c[0] > LS + 140 || c[1] < -120 || c[1] > LS + 120) continue;
    ell(cu, cv, RC * 0.87, 0, TAU, 0.9); ell(cu, cv, RC * 0.79, 0, TAU, 0.75);
    ell(cu, cv, RC * 0.83, -2.85, -0.7, 2.7);             // the groove is deepest in shade on the upper-left
    ell(cu, cv, RC * 0.83, -2.2, -1.3, 3.6);
    const a = 27, b = 40, d = 9;
    const sq = [P(cu - b, cv - b, H), P(cu + b, cv - b, H), P(cu + b, cv + b, H), P(cu - b, cv + b, H)];
    wl(g, sq, 0.8, cu + cv, true); wl(g, [sq[3], sq[0], sq[1]], 1.7, cu + cv + 2);
    const T = [P(cu - a, cv - a, H), P(cu + a, cv - a, H), P(cu + a, cv + a, H), P(cu - a, cv + a, H)];
    const F = T.map((p) => [p[0], p[1] + d]), F2 = F.map((p) => add(p, [14, 10]));
    const shp = [F2]; for (let i = 0; i < 4; i++) shp.push([F[i], F[(i + 1) % 4], F2[(i + 1) % 4], F2[i]]);
    for (const q of shp) { hatchPoly(g, q, AU + 1.12, 2.5, 1.25, 33); hatchPoly(g, q, AU, 3.0, 1.0, 34); }
    knock(g, polyFn([T[0], T[1], T[2], F[2], F[3], F[0]]));
    hatchPoly(g, [T[3], T[2], F[2], F[3]], Math.PI / 2, 2.3, 1.05, 41); hatchPoly(g, [T[3], T[2], F[2], F[3]], AU, 3.0, 0.9, 42);
    hatchPoly(g, [T[0], T[3], F[3], F[0]], AV, 3.4, 0.7, 43);
    wl(g, T, 1.4, cu - cv, true); wl(g, [T[2], F[2], F[3], F[0], T[0]], 1.7, cu - cv + 1); wl(g, [T[3], F[3]], 1.2, cu - cv + 2);
    g.fillStyle = INK; g.beginPath();
    for (let i = 0; i < 9; i++) { const p = P(cu + r.range(-a, a) * 0.8, cv + r.range(0, a) * 0.85, H); g.moveTo(p[0] + 0.7, p[1]); g.arc(p[0], p[1], 0.7, 0, TAU); }
    g.fill();
  }
  // pouring cup notched into the left end; register notches cut into the front arris
  if (funnel) {
    const N = [P(u0, vc - 50, H), P(u0, vc + 50, H), P(u0, vc + 30, H - 15), P(u0, vc - 30, H - 15)];
    knock(g, polyFn(N)); hatchPoly(g, N, AU + 1.12, 2.4, 1.25, 51); hatchPoly(g, N, AV, 2.8, 1.0, 52); wl(g, N, 1.5, key + 5, true);
  }
  for (let um = u0 + 230 + s.phase; um < u1 - 60; um += 400) {
    const tri = [P(um - 15, v1, H), P(um + 15, v1, H), P(um, v1 - 30, H)];
    if (!onPage(tri[2])) continue;
    knock(g, polyFn(tri)); hatchPoly(g, tri, AU + 1.12, 2.4, 1.2, 53); wl(g, tri, 1.3, um, true);
    hatchPoly(g, [tri[0], tri[1], P(um + 4, v1, H - 16)], AU, 2.0, 1.2, 54);
  }
  // contours last: light on the lit edges, heavy along the foot
  wl(g, [At, Bt, Ct, Dt], 1.9, key, true);
  wl(g, [At, A], 1.6, key + 1); wl(g, [Dt, D], 1.9, key + 2); wl(g, [Ct, C], 2.1, key + 3);
  wl(g, [A, D, C], 2.9, key + 4);
}

function build() {
  const c = L.makeCanvas(LS, LS), cg = c.getContext('2d');
  cg.drawImage(K.paper({ base: '#ece3cf', tone: '#8a6a3a', seed: 'p06paper', fiber: 0.5, stain: 0.3, foxing: 0.3, edge: 0.14, size: LS }), 0, 0);
  const ink = L.makeCanvas(LS, LS), g = ink.getContext('2d'), tmp = L.makeCanvas(LS, LS);
  const r = L.rng('p06');
  // the floor of the foundry: broken ruled lines and grit
  g.strokeStyle = INK; g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = r() * LS, y = r() * LS, len = r.range(14, 80), a = AU + r.range(-0.05, 0.05);
    g.lineWidth = r.range(0.55, 1.0); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  g.fillStyle = INK; g.beginPath();
  for (let i = 0; i < 2600; i++) { const x = r() * LS, y = r() * LS, rad = r.range(0.4, 1.1); g.moveTo(x + rad, y); g.arc(x, y, rad, 0, TAU); }
  g.fill();
  const rows = [
    [{ u0: -1200, u1: 1700, v0: -560, H: 40, phase: 40 }],
    [{ u0: -1200, u1: 1700, v0: 0, H: 80, phase: 150 }],
    [{ u0: -1200, u1: 600, v0: 560, H: 120, phase: 20 }, { u0: 740, u1: 1700, v0: 560, H: 40, phase: 0, funnel: true }],
    [{ u0: -1200, u1: 1700, v0: 1120, H: 40, phase: 110 }],
    [{ u0: -1200, u1: -110, v0: 1680, H: 80, phase: 60 }, { u0: 60, u1: 1700, v0: 1680, H: 40, phase: 0, funnel: true }],
    [{ u0: -1200, u1: 1700, v0: 2240, H: 40, phase: 170 }],
    [{ u0: -1200, u1: 1700, v0: 2800, H: 40, phase: 90 }],
  ];
  let key = 100;
  for (const row of rows) for (const s of row) slab(g, tmp, s, r, (key += 17));
  K.wear(ink, { seed: 'p06wear', amount: 0.2, size: 1.2 });
  cg.globalAlpha = 0.26; cg.drawImage(L.blurred(ink, 1.5), 0, 0);        // ink bleeding a hair into the paper
  cg.globalAlpha = 0.94; cg.globalCompositeOperation = 'multiply'; cg.drawImage(ink, 0, 0);
  cg.globalAlpha = 1; cg.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '叠铸范线刻',
  init() { layer = build(); },
  draw(ctx, env, p) { K.drift(ctx, layer, p, { z0: 1.0, z1: 1.035, x0: 34, y0: -11, x1: -34, y1: 11 }); },
};
