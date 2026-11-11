// g07 — 钱背墨拓: a few dozen ink rubbings of coin backs on xuan paper, spelling the coin glyph.
// Each rubbing is a black dabbed disc: the rim and the inner rim struck solid, the flat field stippled through the paper tooth,
// and thin WHITE lines where the paper dipped beside the relief (outer rim line + the square hole). No inscriptions at all.
// Outer row: discs tangent to the glyph's circle. Inner row: discs tangent to the four straight sides of the hole (+ one per corner).
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const PAPER = '#ebe6d8';
const INK = [21, 20, 19], GREY = [104, 99, 91];

// ───────────── where the rubbings go ─────────────
function layout() {
  const g = K.GLYPH, r = L.rng('g07lay'), out = [];
  // 1) outer row: varied discs, each tangent to the circle from inside, chained round it
  const N = 23, ring = [];
  for (let i = 0; i < N; i++) ring.push(r.range(36.5, 46.5));
  const gap = 3;
  for (let it = 0; it < 4; it++) {
    let sum = 0;
    for (let i = 0; i < N; i++) { const a = ring[i], b = ring[(i + 1) % N]; sum += (a + b + gap) / (g.R - 1 - (a + b) / 2); }
    const f = Math.pow(TAU / sum, 0.9);
    for (let i = 0; i < N; i++) ring[i] *= f;
  }
  let t = -Math.PI / 2 + 0.11;
  for (let i = 0; i < N; i++) {
    const rad = ring[i], rr = g.R - 1 - rad;
    out.push({ x: g.cx + Math.cos(t) * rr, y: g.cy + Math.sin(t) * rr, rad, row: 'ring' });
    const b = ring[(i + 1) % N]; t += (rad + b + gap) / (g.R - 1 - (rad + b) / 2);
  }
  // 2) inner row: three discs tangent to each side of the hole + one in each corner
  const sides = [[1, 0, 0, -1], [0, 1, 1, 0], [-1, 0, 0, 1], [0, -1, -1, 0]];   // along (dx,dy), outward normal (nx,ny)
  for (const [dx, dy, nx, ny] of sides) {
    const w = [r.range(0.86, 1.14), r.range(0.92, 1.2), r.range(0.86, 1.14)], ws = w[0] + w[1] + w[2];
    let p = -g.a + 1;
    for (let k = 0; k < 3; k++) {
      const dia = (w[k] / ws) * (2 * g.a - 6), rad = dia / 2; p += rad;
      out.push({ x: g.cx + dx * p + nx * (g.a + rad + 1), y: g.cy + dy * p + ny * (g.a + rad + 1), rad, row: 'square' });
      p += rad + 2;
    }
    const rc = r.range(35, 38.5);                                                // the corner that follows this side
    out.push({ x: g.cx + (dx + nx) * (g.a + rc + 1), y: g.cy + (dy + ny) * (g.a + rc + 1), rad: rc, row: 'square' });
  }
  // 3) fill: greedily drop the biggest disc that still fits, until only slivers are left
  const step = 3, cand = [];
  for (let y = g.cy - g.R; y <= g.cy + g.R; y += step) for (let x = g.cx - g.R; x <= g.cx + g.R; x += step) {
    let best = -K.sdGlyph(x, y) - 2.5; if (best < 15) continue;
    for (const d of out) { const m = Math.hypot(d.x - x, d.y - y) - d.rad - 2.5; if (m < best) best = m; }
    if (best >= 15) cand.push({ x, y, best });
  }
  for (let guard = 0; guard < 60; guard++) {
    const cap = r.range(25, 35); let bi = -1, bv = 18;
    for (let i = 0; i < cand.length; i++) { const v = Math.min(cand[i].best, cap) + hash2(cand[i].x, cand[i].y) * 0.5; if (v > bv) { bv = v; bi = i; } }
    if (bi < 0) break;
    const c = cand[bi], d = { x: c.x + r.range(-0.8, 0.8), y: c.y + r.range(-0.8, 0.8), rad: Math.min(c.best, cap), row: 'fill' };
    out.push(d);
    for (const q of cand) { const m = Math.hypot(d.x - q.x, d.y - q.y) - d.rad - 2.5; if (m < q.best) q.best = m; }
  }
  return out;
}

// ───────────── one rubbing: ink density + relief height into the page buffers ─────────────
function rub(D, Hh, c, idx, nA, nB) {
  const r = L.rng('g07coin' + idx), rad = c.rad, k40 = rad / 40;
  const rimW = rad * r.range(0.13, 0.2), h = rad * r.range(0.235, 0.3), iw = rad * r.range(0.075, 0.11);
  const rot = r.range(-0.085, 0.085), cs = Math.cos(rot), sn = Math.sin(rot);
  const pale = r.chance(0.26), base = pale ? r.range(0.44, 0.58) : r.range(0.62, 0.98), so = r.range(0, 900), hw = r.range(3, 7) * (r.chance(0.55) ? 1 : 0.3), haloS = r.range(0.14, 0.27);
  const rimD = pale ? r.range(0.8, 0.94) : r.range(1.02, 1.16), dry = r.range(0.2, 0.42);
  const mark = r.chance(0.34) && rad > 30 ? (r.chance(0.55) ? 'moon' : 'star') : null;
  const mside = r.int(0, 3), mdist = h + iw + (rad - rimW - h - iw) * 0.52;
  const mx = [0, 1, 0, -1][mside] * mdist, my = [-1, 0, 1, 0][mside] * mdist, cr = rad * 0.15;
  const E = Math.ceil(rad + hw + 3);
  const x0 = Math.max(1, Math.floor(c.x - E)), x1 = Math.min(S - 2, Math.ceil(c.x + E));
  const y0 = Math.max(1, Math.floor(c.y - E)), y1 = Math.min(S - 2, Math.ceil(c.y + E));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - c.x, dy = y - c.y, rd = Math.hypot(dx, dy);
    if (rd > E) continue;
    const ang = Math.atan2(dy, dx), arc = ang * rad;
    const edge = rad + 0.55 * nB.n2(arc / 46 + so, so * 0.37) + 0.22 * nA.n2(arc / 7 + so, 1.7);
    const out = sstep(edge - 0.8, edge + 0.8, rd);
    let d = 0, hh = 0;
    if (out < 1) {
      const ux = dx * cs + dy * sn, uy = -dx * sn + dy * cs, sq = Math.max(Math.abs(ux), Math.abs(uy));
      const lo = nA.n2(x / 17 + so, y / 17);
      const moat = Math.max(1.25, (2.1 + 0.9 * lo) * k40), moat2 = Math.max(1.2, (1.9 - 0.8 * lo) * k40);
      const rimIn = rad - rimW + 0.7 * nB.n2(arc / 14 + so, 7.3);
      const rim = sstep(rimIn - 0.7, rimIn + 0.7, rd);
      const inner = sstep(h - 0.7, h + 0.7, sq) * (1 - sstep(h + iw - 0.7, h + iw + 0.7, sq));
      let fmask = (1 - sstep(rimIn - moat - 0.7, rimIn - moat + 0.7, rd)) * sstep(h + iw + moat2 - 0.7, h + iw + moat2 + 0.7, sq);
      let mk = 0;
      if (mark) {
        let sdm;
        if (mark === 'star') sdm = Math.hypot(ux - mx, uy - my) - rad * 0.065;
        else {
          const ox = mx * 0.5 / mdist * cr, oy = my * 0.5 / mdist * cr;       // crescent opens towards the rim
          sdm = Math.max(Math.hypot(ux - mx, uy - my) - cr, -(Math.hypot(ux - mx - ox, uy - my - oy) - cr * 0.9));
        }
        mk = 1 - sstep(-0.7, 0.7, sdm);
        fmask *= sstep(moat2 - 0.6, moat2 + 0.8, sdm);
      }
      // the flat field: dabbed unevenly — cloudy pressure, plus drier streaks
      const cloud = nB.fbm(x / 46 + so, y / 46 - so, 2), fine = nA.n2(x / 10.5 - so, y / 10.5);
      const fd = base + 0.3 * cloud + 0.12 * fine - dry * sstep(0.25, 0.8, nA.n2(x / 60 + so * 2, y / 23 + so));
      // relief: dense, but a dry dab bites pale patches into a rim here and there
      const rd2 = rimD - 0.5 * sstep(0.42, 0.9, nB.n2(arc / 26 + so * 3, rd / 30 + so)) + 0.05 * fine;
      d = Math.max(rim * rd2, inner * (rd2 - 0.02), mk * 1.05, fmask * fd) * (1 - out);
      hh = Math.max(rim, inner, mk) * (1 - out);
    }
    if (out > 0 && hw > 1) {
      const hd = haloS * (1 - sstep(0, hw, rd - edge)) * sstep(0.05, 0.75, nB.n2(arc / 75 + so, 3.1 + so)) * out;
      if (hd > d) d = hd;
    }
    const k = y * S + x;
    if (d > D[k]) D[k] = d;
    if (hh > Hh[k]) Hh[k] = hh;
  }
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const paper = K.paper({ base: PAPER, tone: '#8d7b58', seed: 'g07xuan', fiber: 0.95, stain: 0.26, grain: 0.18, foxing: 0.14, edge: 0.16 });
  g.drawImage(paper, 0, 0);
  // xuan paper: faint chain lines left by the papermaker's screen
  const pr = L.rng('g07chain');
  for (let x = 23; x < S; x += 41) {
    g.strokeStyle = L.rgba('#7d6c4c', pr.range(0.03, 0.055)); g.lineWidth = pr.range(1.2, 2);
    g.beginPath(); g.moveTo(x + pr.range(-1, 1), 0); g.lineTo(x + pr.range(-1.5, 1.5), S); g.stroke();
  }

  const D = new Float32Array(S * S), Hh = new Float32Array(S * S);
  const nA = L.makeNoise('g07a'), nB = L.makeNoise('g07b'), nC = L.makeNoise('g07c');
  const coins = layout();
  coins.forEach((cn, i) => rub(D, Hh, cn, i, nA, nB));

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  const img = q.createImageData(S, S), px = img.data;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const k = y * S + x, d = D[k];
    const sh = ((Hh[k + 1] - Hh[k - 1]) + (Hh[k + S] - Hh[k - S])) * 0.5;
    if (d < 0.004 && sh === 0) continue;
    // paper tooth (≈1–2 px particles) + the weave of the dabber's cloth + a pinch of white noise
    const gf = nC.n2(x / 1.3 + 5.5, y / 1.3 - 3.5), gm = nB.n2(x / 1.9 - 21, y / 1.9 + 8);
    const g1 = nA.n2(x / 2.4, y / 2.4), g2 = nB.n2(x / 6.5 + 11, y / 6.5), wh = hash2(x, y);
    const grain = 0.5 + 0.22 * gf + 0.14 * gm + 0.1 * g1 + 0.07 * g2 + 0.12 * (wh - 0.5);
    const G = d > 1 ? 0.5 : 0.84;
    const ia = sstep(0.4, 0.6, d + (grain - 0.5) * G);
    let tone = ia * (0.76 + 0.24 * sstep(0.3, 0.9, d)) + 0.2 * sstep(0.1, 0.8, d) * (1 - ia);
    const deep = sstep(0.35, 0.85, d);
    let cr = GREY[0] + (INK[0] - GREY[0]) * deep, cg = GREY[1] + (INK[1] - GREY[1]) * deep, cb = GREY[2] + (INK[2] - GREY[2]) * deep;
    // the emboss the paper kept from the coin, lit from the upper left
    if (sh < 0) { const s = Math.min(0.5, -sh) * 0.42 * (1 - tone); tone += s; }
    else if (sh > 0) { tone *= 1 - Math.min(0.5, sh) * 0.3; }
    const o = k * 4;
    px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = Math.max(0, Math.min(255, tone * 255));
  }
  q.putImageData(img, 0, 0);

  // pale paper fibres that refused the ink
  const fib = L.makeCanvas(S, S), f = fib.getContext('2d'), fr = L.rng('g07fib');
  f.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = fr() * S, y = fr() * S, len = fr.range(8, 34), a = fr() * TAU, bend = fr.range(-0.7, 0.7);
    f.strokeStyle = L.rgba('#efe9da', fr.range(0.1, 0.34)); f.lineWidth = fr.range(0.6, 1.2);
    f.beginPath(); f.moveTo(x, y);
    f.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); f.stroke();
  }
  f.globalCompositeOperation = 'destination-in'; f.drawImage(ink, 0, 0);

  // a breath of ink oil in the paper round each rubbing, then the ink, then the fibres
  g.save(); g.globalAlpha = 0.16; g.globalCompositeOperation = 'multiply'; g.drawImage(L.blurred(ink, 7), 0, 0); g.restore();
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.97; g.drawImage(ink, 0, 0); g.restore();
  g.drawImage(fib, 0, 0);
  return c;
}

export default {
  name: '钱背墨拓',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
