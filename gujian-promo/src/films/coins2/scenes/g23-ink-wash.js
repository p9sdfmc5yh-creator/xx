// g23 — 水墨: on white xuan paper, a circle written in ONE brush stroke (press-in head at 7 o'clock, clockwise, drying into
// flying-white, a lifting tail), a pale wet wash inside it, and four dense-ink strokes laid round the square hole so the
// hole is the paper left blank. The whole ink body is computed per pixel as an optical density field (bristle streaks in
// stroke coordinates, paper tooth breaking the dry passages, pooled rims, tide lines), then multiplied into the paper.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;
const sst = (a, b, x) => { const t = L.clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function inkField() {
  const { cx, cy, R, a } = K.GLYPH;
  const nz = L.makeNoise('g23ink'), nt = L.makeNoise('g23tooth');
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const A0 = 2.04;                         // the stroke starts at about 7 o'clock and runs clockwise
  const ARC = TAU * (R - 40);              // px travelled by the brush
  const NT = 4096;
  const ROUT = new Float32Array(NT + 2), WID = new Float32Array(NT + 2), DRY = new Float32Array(NT + 2), RW = new Float32Array(NT + 2);
  for (let i = 0; i <= NT + 1; i++) {
    const u = Math.min(1, i / NT);
    ROUT[i] = R - 0.6 + 2.0 * nz.n2(u * 5, 3.3) + 0.9 * nz.n2(u * 23, 8.1);
    WID[i] = 88 + 11 * nz.n2(u * 3.1, 5.5) - 24 * u + 15 * Math.exp(-u / 0.035);
    DRY[i] = L.clamp(sst(0.26, 0.96, u) * 0.92 + 0.2 * nz.n2(u * 6.5, 1.1) * sst(0.15, 0.4, u), 0, 1);
    RW[i] = ROUT[i] - WID[i] - 4 + 13 * nz.n2(u * 2.4 + 4, 7.7) + 4 * nz.n2(u * 11, 2.2);
  }
  const TAIL = 0.085;                      // the tail runs this far past the head, drifting inward as the brush lifts
  const bars = [                           // four strokes round the hole: [width, start overrun, end overrun]
    [66, 20, 40], [60, 26, 34], [70, 16, 46], [62, 24, 30],
  ];
  // one pass of the ring stroke at brush progress uu (may exceed 1 in the tail)
  function ring(r, x, y, uu, rout, w, dry, tooth) {
    const rin = rout - w;
    if (r < rin - 2 || r > rout + 2 || w < 2) return 0;
    const v = (r - rin) / w, s = uu * ARC;
    const b = nz.fbm(v * 22 + 1.7, s / 380, 2) * 0.8 + nz.n2(v * 64 + 9, s / 150) * 0.42;
    const e = Math.abs(2 * v - 1), edgeDry = e * e * e * (v < 0.5 ? 1 : 0.4);
    const dl = L.clamp(dry * (0.78 + 0.55 * edgeDry) - (v > 0.8 ? 0.12 : 0), 0, 1.15);
    const T = L.lerp(-1.4, 0.1, dl);
    const cov = sst(T - 0.1, T + 0.1, b + 0.3 * tooth * dl);
    const eo = sst(1.0, -1.0, r - rout), ei = sst(-1.0, 1.0, r - rin);
    const rim = 0.05 * (Math.exp(-(rout - r) / 2.6) + Math.exp(-(r - rin) / 2.6));
    const dens = L.lerp(0.955, 0.8, dry) * (0.93 + 0.07 * L.clamp(b * 2, -1, 1)) + rim;
    return cov * eo * ei * Math.min(0.985, dens);
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
      if (r > R + 30) continue;
      let u = (Math.atan2(dy, dx) - A0) / TAU; u -= Math.floor(u);
      const fi = u * NT, i0 = fi | 0, ft = fi - i0;
      const rout = ROUT[i0] + (ROUT[i0 + 1] - ROUT[i0]) * ft, w = WID[i0] + (WID[i0 + 1] - WID[i0]) * ft;
      const dry = DRY[i0] + (DRY[i0 + 1] - DRY[i0]) * ft, rw = RW[i0] + (RW[i0 + 1] - RW[i0]) * ft;
      const tooth = nt.n2(x * 0.47, y * 0.47) * 0.6 + nt.n2(x * 0.21 + 31, y * 0.21) * 0.4;
      const adx = Math.abs(dx), ady = Math.abs(dy), sq = Math.max(adx, ady) - a;
      // ── the ring stroke
      let Ds = 0;
      if (r > rout - w - 3) {
        const v = (r - (rout - w)) / w, us = 0.017 * (2 * v - 1) * (2 * v - 1);   // rounded press-in head
        Ds = ring(r, x, y, u, rout, w, dry, tooth) * sst(us - 0.0008, us + 0.0008, u);
      }
      if (u < TAIL) {
        const t = u / TAIL;
        const dt = ring(r, x, y, 1 + u, ROUT[NT] - 30 * Math.pow(t, 1.3), WID[NT] * (1 - Math.pow(t, 1.7)), Math.min(1.1, DRY[NT] + 0.25 * t), tooth);
        if (dt > Ds) Ds = dt;
      }
      // wet bleed just outside both edges of the stroke where it was loaded
      let Dh = 0;
      if (r > rout) Dh = 0.15 * (1 - dry) * Math.exp(-(r - rout) / 4.2) * (0.65 + 0.35 * nz.n2(u * 46, 2));
      else if (r < rout - w) Dh = 0.13 * (1 - dry) * Math.exp(-(rout - w - r) / 6);
      // ── the pale wash inside the ring
      let Dw = 0;
      if (r < rw + 1.5 && sq > -2) {
        const cloud = nz.fbm(x / 150 + 3, y / 150 + 7, 4);
        const tide = nz.fbm(x / 70 + 40, y / 70, 3), tl = (tide - 0.08) / 0.035;
        const base = L.lerp(0.37, 0.13, sst(175, 290, r)) + 0.1 * cloud;
        Dw = sst(1.2, -1.2, r - rw) * L.clamp(base + 0.075 * Math.exp(-tl * tl) + 0.11 * Math.exp(-(rw - r) / 2.4), 0, 0.62);
      }
      // ── dense ink round the hole: four strokes, each running clockwise along one side
      let Db = 0;
      if (sq > -2 && sq < 130) {
        for (let k = 0; k < 4; k++) {
          const cc = k === 0 ? -dy - a : k === 1 ? dx - a : k === 2 ? dy - a : -dx - a;
          const l = k === 0 ? dx : k === 1 ? dy : k === 2 ? -dx : -dy;
          const [wB, e1, e2] = bars[k];
          if (cc < -2 || cc > wB + 60 || l < -a - e1 - 16 || l > a + e2 + 16) continue;
          const wb = wB + 7 * nz.n2(l / 60 + k * 13, 4.4);
          const q = (cc - wb * 0.5) / (wb * 0.5), round = 9 * q * q;                       // rounded stroke ends
          const al = sst(-a - e1 - 3 + round, -a - e1 + 4 + round, l) * sst(a + e2 + 6 - round, a + e2 - 8 - round, l);
          const core = sst(wb + 3, wb - 9, cc) * sst(-1, 1, cc);
          const bleed = sst(wb + 36 + 16 * nz.n2(x / 33, y / 33 + k * 5), wb - 6, cc) * sst(-1, 1, cc);
          const st = nz.n2(cc * 0.26 + k * 9.3, l / 150) * 0.8 + 0.3 * nz.n2(cc * 0.62 + 5, l / 60 + k);
          const dk = sst(a - 30, a + e2, l) * 0.95;
          const T = L.lerp(-1.4, 0.12, dk);
          const cov = sst(T - 0.1, T + 0.1, st + 0.3 * tooth * dk);
          const dens = Math.max(core * cov * (0.94 + 0.045 * st), bleed * bleed * 0.5) * al;
          Db = 1 - (1 - Db) * (1 - dens);
        }
      }
      let D = 1 - (1 - Dw) * (1 - Ds) * (1 - Db) * (1 - Dh);
      // the hole: paper left blank, a hand-held edge (≈1 px of wander) and a hair of bleed into it
      const lsel = adx > ady ? dy : dx, side = adx > ady ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      const H = sst(-0.9, 0.9, sq + 1.1 * nz.n2(lsel / 45 + side * 7, 2.2));
      D = D * H + (sq < 0 ? 0.15 * Math.exp(sq / 2.2) * (1 - H) : 0);
      if (D <= 0.002) continue;
      const t = 1 - Math.min(0.99, D);
      d[o] = 20 + 235 * t; d[o + 1] = 18 + 237 * Math.pow(t, 1.01); d[o + 2] = 17 + 238 * Math.pow(t, 0.965);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function build() {
  const { cx, cy, R } = K.GLYPH;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#f3f0e6', tone: '#a39474', seed: 'g23paper', fiber: 0.9, stain: 0.14, foxing: 0.06, edge: 0.1, grain: 0.18 }), 0, 0);
  const ink = inkField();
  // 洇: the ink creeps a little way into the damp paper round every edge
  g.save(); g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.2; g.drawImage(L.blurred(ink, 5), 0, 0);
  g.globalAlpha = 1; g.drawImage(ink, 0, 0);
  g.restore();
  const r = L.rng('g23bits');
  // a few flung droplets by the press-in head and along the first, loaded stretch of the stroke
  for (let i = 0; i < 9; i++) {
    const th = 2.04 + r.range(-0.1, 0.5), rr = R + r.range(14, 46) * (r.chance(0.3) ? -3.4 : 1);
    const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr, s = r.range(1.4, 4.6);
    g.fillStyle = L.radial(g, x, y, s * 0.6, s * 2.4, [[0, 'rgba(30,27,25,0.16)'], [1, 'rgba(30,27,25,0)']]);
    g.beginPath(); g.arc(x, y, s * 2.4, 0, TAU); g.fill();
    g.fillStyle = L.rgba('#191715', r.range(0.72, 0.92));
    g.beginPath(); g.ellipse(x, y, s, s * r.range(0.7, 0.95), r() * 3, 0, TAU); g.fill();
  }
  // xuan fibres that took less ink: long pale hairs lying across the washes
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const th = r() * TAU, rr = R * Math.sqrt(r()), x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
    if (!K.inGlyph(x, y, 4)) continue;
    const len = r.range(18, 70), an = r() * TAU, bend = r.range(-0.7, 0.7);
    g.strokeStyle = L.rgba('#f4f1e8', r.range(0.05, 0.13)); g.lineWidth = r.range(0.6, 1.2);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  return c;
}

export default {
  name: '水墨',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
