// p12 — 算盘: a stretch of an old abacus photographed from straight above (the reference's page of sheet music).
// The rods run across the frame like the five lines of a staff; dark lacquered hardwood beads sit on them like notes —
// two-bead deck on the left of the beam (梁), five-bead deck on the right, each rod set to a different count.
// Pale old-yellow back board, dark hardwood frame and beam. Beads are shaded per pixel as a solid of revolution (light from the
// top-left), supersampled 2×, then get drawn wear. Slow plate: one 1400² layer, drifted. No text anywhere.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LS = 1400;
let layer = null;

const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const LIGHT = (() => { const v = [-0.46, -0.56, 0.69], n = Math.hypot(...v); return v.map((c) => c / n); })();
const HALF = (() => { const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], n = Math.hypot(...v); return v.map((c) => c / n); })();

// layout (layer px)
const BT = 94, BH = 178;                 // bead: thickness along the rod, height across it
const ROD0 = 110, RODSTEP = 196, NROD = 7, RODW = 11;
const FRAME_R = 238;                     // right edge of the left frame bar
const BEAM_L = 536, BEAM_R = 610;        // the beam
const FRAME2_L = 1228;                   // left edge of the right frame bar

function hash(ix, iy, s) { let h = (ix * 374761393 + iy * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return ((h >>> 0) % 100000) / 100000; }
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** one abacus bead seen from the side of its axis (axis = x): an oblate bicone with a soft ridge and flat end faces */
function makeBead(seed) {
  const r = L.rng('p12bead' + seed), sd = r.int(1, 9999);
  const SSs = 2, pad = 5, w = BT + pad * 2, h = BH + pad * 2, W2 = w * SSs, H2 = h * SSs;
  const hi = L.makeCanvas(W2, H2), q = hi.getContext('2d'), img = q.createImageData(W2, H2), d = img.data;
  const R = BH / 2 * r.range(0.975, 1), ht = BT / 2 * r.range(0.95, 1), Rf = R * r.range(0.36, 0.42);
  const ea = r.range(1.42, 1.58), eb = r.range(0.72, 0.82);
  const rad = (x) => { const u = Math.abs(x) / ht; return u >= 1 ? 0 : Rf + (R - Rf) * Math.pow(1 - Math.pow(u, ea), eb); };
  const warm = r.range(0, 1), val = r.range(0.85, 1.12);
  const A0 = [(66 + 26 * warm) * val, (33 + 10 * warm) * val, (22 + 4 * warm) * val];     // dark rosewood / lacquered hardwood
  const gph = r.range(0, 50), gl = r.range(0.75, 1.1);
  for (let j = 0; j < H2; j++) {
    const y = (j + 0.5) / SSs - h / 2;
    for (let i = 0; i < W2; i++) {
      const x = (i + 0.5) / SSs - w / 2;
      if (Math.abs(x) >= ht) continue;
      const rr = rad(x); if (Math.abs(y) >= rr) continue;
      const z = Math.sqrt(rr * rr - y * y);
      const dr = (rad(x + 0.35) - rad(x - 0.35)) / 0.7;
      let nx = -rr * dr, ny = y, nzv = z; const nn = Math.hypot(nx, ny, nzv) || 1; nx /= nn; ny /= nn; nzv /= nn;
      const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nzv * LIGHT[2]);
      const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nzv * HALF[2]);
      // turned grain: fine rings round the axis (vertical streaks in this view) + slow figure
      const ang = Math.atan2(y, z);
      const g1 = vnoise(x * 0.9 + gph, ang * 2.2, sd), g2 = vnoise(x * 0.22 + gph, ang * 6 + 9, sd + 7), g3 = vnoise(x * 2.6, ang * 1.1 + 3, sd + 13);
      const grain = 0.72 + 0.34 * g2 + 0.2 * (g1 - 0.5) + 0.12 * (g3 - 0.5);
      const lac = 0.6 + 0.5 * vnoise(x * 0.08 + 4, y * 0.05, sd + 21);                 // where the lacquer is still glossy
      const spec = (Math.pow(nh, 34) * 0.95 + Math.pow(nh, 7) * 0.2) * lac * gl;
      const bounce = Math.max(0, nx * 0.52 + ny * 0.62 + nzv * 0.3) * 0.2;                // warm light thrown back by the pale board
      const edgeAO = cl(z / (R * 0.22)) * 0.5 + 0.5;                                  // darker toward the silhouette
      const k = (0.3 + 0.92 * diff + bounce) * grain * edgeAO;
      const o = (j * W2 + i) * 4;
      d[o] = Math.min(255, A0[0] * k + 255 * spec);
      d[o + 1] = Math.min(255, A0[1] * k + 232 * spec);
      d[o + 2] = Math.min(255, A0[2] * k + 196 * spec);
      d[o + 3] = 255;
    }
  }
  q.putImageData(img, 0, 0);
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(hi, 0, 0, w, h);
  // drawn wear, only on the bead
  g.globalCompositeOperation = 'source-atop'; g.translate(w / 2, h / 2); g.lineCap = 'round';
  // the ridge, rubbed pale by fingers — a broken line down the middle
  for (let k = 0, n = r.int(5, 9); k < n; k++) {
    const y0 = r.range(-R * 0.92, R * 0.8), len = r.range(8, 34);
    g.strokeStyle = `rgba(${r.int(150, 196)},${r.int(98, 128)},${r.int(60, 84)},${r.range(0.16, 0.42)})`; g.lineWidth = r.range(0.9, 1.9);
    g.beginPath(); g.moveTo(r.range(-1.2, 1.2), y0); g.lineTo(r.range(-1.2, 1.2), y0 + len); g.stroke();
  }
  // hairline scratches along the turning direction and a few across
  for (let k = 0, n = r.int(10, 18); k < n; k++) {
    const x0 = r.range(-ht * 0.85, ht * 0.85), y0 = r.range(-R * 0.8, R * 0.8), len = r.range(6, 26), tilt = r.chance(0.75) ? r.range(-0.12, 0.12) : r.range(-1.2, 1.2);
    g.strokeStyle = r.chance(0.6) ? `rgba(226,180,128,${r.range(0.08, 0.22)})` : `rgba(14,6,3,${r.range(0.15, 0.32)})`; g.lineWidth = r.range(0.6, 1.1);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.sin(tilt) * len, y0 + Math.cos(tilt) * len); g.stroke();
  }
  // small dents / dust specks
  for (let k = 0, n = r.int(6, 12); k < n; k++) {
    const x0 = r.range(-ht * 0.8, ht * 0.8), y0 = r.range(-R * 0.85, R * 0.85), rr = r.range(0.7, 1.8);
    g.fillStyle = r.chance(0.5) ? `rgba(240,214,170,${r.range(0.12, 0.3)})` : `rgba(10,4,2,${r.range(0.2, 0.4)})`;
    g.beginPath(); g.ellipse(x0, y0, rr, rr * r.range(0.5, 1), r() * 3, 0, TAU); g.fill();
  }
  // dark seams where the end faces meet the neighbours
  g.fillStyle = L.linear(g, -ht, 0, -ht + 5, 0, [[0, 'rgba(8,3,1,0.55)'], [1, 'rgba(8,3,1,0)']]); g.fillRect(-ht - 1, -R, 6, R * 2);
  g.fillStyle = L.linear(g, ht, 0, ht - 6, 0, [[0, 'rgba(8,3,1,0.7)'], [1, 'rgba(8,3,1,0)']]); g.fillRect(ht - 6, -R, 7, R * 2);
  return c;
}

/** a bar of dark hardwood with bevelled long edges. vertical bar x0..x1 over the whole layer height */
function darkBar(g, x0, x1, seed, o = {}) {
  const w = x1 - x0, r = L.rng('p12bar' + seed);
  const tex = L.woodTex(Math.ceil(w), LS, { base: '#4b2a19', dark: '#1f0f08', light: '#6f4327', seed: 'p12w' + seed, scale: 46, dir: 'v', rings: 0.18 });
  g.save();
  g.shadowColor = 'rgba(40,22,8,0.5)'; g.shadowBlur = o.blur || 16; g.shadowOffsetX = o.dx === undefined ? 10 : o.dx; g.shadowOffsetY = 14;
  g.fillStyle = '#3a2013'; g.fillRect(x0, -40, w, LS + 80);
  g.restore();
  g.drawImage(tex, x0, 0);
  // rounded cross-section: lit toward the left edge, falling off to the right
  g.fillStyle = L.linear(g, x0, 0, x1, 0, [[0, 'rgba(255,214,160,0.20)'], [0.18, 'rgba(255,214,160,0.07)'], [0.5, 'rgba(0,0,0,0)'], [0.86, 'rgba(0,0,0,0.26)'], [1, 'rgba(0,0,0,0.5)']]);
  g.fillRect(x0, 0, w, LS);
  const bev = o.bev || 9;
  if (!o.noLeft) {
    g.fillStyle = L.linear(g, x0, 0, x0 + bev, 0, [[0, 'rgba(236,190,132,0.55)'], [0.35, 'rgba(206,150,96,0.32)'], [1, 'rgba(206,150,96,0)']]); g.fillRect(x0, 0, bev, LS);
  }
  if (!o.noRight) {
    g.fillStyle = L.linear(g, x1 - bev, 0, x1, 0, [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(6,2,0,0.42)'], [1, 'rgba(6,2,0,0.72)']]); g.fillRect(x1 - bev, 0, bev, LS);
  }
  // long drawn grain lines + nicks
  g.lineCap = 'round';
  for (let k = 0, n = Math.round(w / 5); k < n; k++) {
    const x = x0 + r.range(4, w - 4), y = r.range(-50, LS), len = r.range(60, 420);
    g.strokeStyle = r.chance(0.55) ? `rgba(12,5,2,${r.range(0.12, 0.34)})` : `rgba(190,128,78,${r.range(0.06, 0.16)})`; g.lineWidth = r.range(0.7, 1.5);
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + r.range(-2.5, 2.5), y + len * 0.33, x + r.range(-2.5, 2.5), y + len * 0.66, x + r.range(-1.5, 1.5), y + len); g.stroke();
  }
  for (let k = 0, n = Math.round(w / 9); k < n; k++) {
    const x = x0 + r.range(3, w - 3), y = r.range(0, LS), len = r.range(3, 12), a = r.range(-1.3, 1.3);
    g.strokeStyle = `rgba(214,168,116,${r.range(0.14, 0.34)})`; g.lineWidth = r.range(0.7, 1.3);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * len, y + Math.cos(a) * len); g.stroke();
  }
}

function build() {
  const c = L.makeCanvas(LS, LS), g = c.getContext('2d');
  const r = L.rng('p12');
  // ── back board: pale old-yellow softwood, like aged paper with a faint grain
  g.drawImage(K.paper({ base: '#e8d6a6', tone: '#8d6a34', seed: 'p12board', fiber: 0.25, stain: 0.42, foxing: 0.3, edge: 0.1, size: LS }), 0, 0);
  g.save(); g.globalAlpha = 0.34; g.globalCompositeOperation = 'multiply';
  g.drawImage(L.woodTex(LS, LS, { base: '#efe0b6', dark: '#b89858', light: '#fff6dc', seed: 'p12grain', scale: 70, dir: 'h', rings: 0.12 }), 0, 0);
  g.restore();
  g.lineCap = 'round';
  for (let k = 0; k < 150; k++) {                      // drawn grain lines + hairline cracks running with the rods
    const x = r.range(-100, LS), y = r.range(0, LS), len = r.range(120, 620);
    g.strokeStyle = `rgba(${r.int(120, 150)},${r.int(88, 108)},${r.int(40, 58)},${r.range(0.05, 0.17)})`; g.lineWidth = r.range(0.7, 1.6);
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.33, y + r.range(-3, 3), x + len * 0.66, y + r.range(-3, 3), x + len, y + r.range(-2, 2)); g.stroke();
  }
  for (let k = 0; k < 70; k++) {                       // old ink / grime specks and finger-dark patches
    const x = r.range(0, LS), y = r.range(0, LS), rr = r.range(0.8, 2.6);
    g.fillStyle = `rgba(70,44,18,${r.range(0.1, 0.3)})`; g.beginPath(); g.ellipse(x, y, rr, rr * r.range(0.5, 1), r() * 3, 0, TAU); g.fill();
  }
  // a board joint
  g.strokeStyle = 'rgba(84,56,22,0.42)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 796.5); g.lineTo(LS, 797.5); g.stroke();
  g.strokeStyle = 'rgba(255,246,214,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 798.6); g.lineTo(LS, 799.6); g.stroke();

  const rods = []; for (let k = 0; k < NROD; k++) rods.push(ROD0 + k * RODSTEP);
  // ── rods: dark bamboo, each with its shadow on the board
  for (const y of rods) {
    g.save(); g.shadowColor = 'rgba(52,30,10,0.42)'; g.shadowBlur = 9; g.shadowOffsetX = 9; g.shadowOffsetY = 15;
    g.fillStyle = '#4a2f18'; g.fillRect(-20, y - RODW / 2, LS + 40, RODW); g.restore();
    g.fillStyle = L.linear(g, 0, y - RODW / 2, 0, y + RODW / 2, [[0, '#553519'], [0.2, '#b08448'], [0.34, '#80582b'], [0.62, '#472a12'], [1, '#1c0e06']]);
    g.fillRect(0, y - RODW / 2, LS, RODW);
    for (let k = 0; k < 26; k++) {                     // bamboo fibre streaks + worn spots
      const x = r.range(0, LS), len = r.range(20, 140), yy = y + r.range(-RODW / 2 + 1.2, RODW / 2 - 1.2);
      g.strokeStyle = r.chance(0.5) ? `rgba(30,16,6,${r.range(0.2, 0.45)})` : `rgba(232,196,140,${r.range(0.15, 0.4)})`; g.lineWidth = r.range(0.6, 1.1);
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + len, yy + r.range(-0.4, 0.4)); g.stroke();
    }
  }
  // ── beam and frame bars (dark hardwood)
  darkBar(g, BEAM_L, BEAM_R, 'beam', { bev: 8 });
  darkBar(g, -10, FRAME_R, 'fl', { noLeft: true, bev: 12, blur: 20, dx: 13 });
  darkBar(g, FRAME2_L, LS + 10, 'fr', { noRight: true, bev: 12, dx: 0 });
  // sockets where the rods run into the wood: a dark mouth on the entering side, a pale worn lip
  for (const y of rods) {
    for (const [x, dir] of [[FRAME_R, -1], [BEAM_L, 1], [BEAM_R, -1], [FRAME2_L, 1]]) {
      g.fillStyle = 'rgba(8,3,1,0.78)'; g.beginPath(); g.ellipse(x + dir * 2.2, y + 0.5, 3.4, RODW / 2 + 2.2, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(214,166,108,0.4)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x + dir * 2.2, y + 0.5, 4.2, RODW / 2 + 3, 0, Math.PI * 0.9, Math.PI * 1.6); g.stroke();
    }
  }
  // ── beads
  const sprites = []; for (let k = 0; k < 9; k++) sprites.push(makeBead(k));
  const beads = [];
  const upCounts = [1, 0, 2, 1, 0, 1, 2], loCounts = [3, 1, 4, 0, 2, 5, 3];       // beads pushed against the beam, per rod
  rods.forEach((y, ri) => {
    const up = upCounts[ri], lo = loCounts[ri];
    // upper deck (2 beads) between the left frame bar and the beam
    for (let k = 0; k < 2; k++) {
      const atBeam = k >= 2 - up;
      const x = atBeam ? BEAM_L - BT / 2 - (1 - k) * BT - 1 : FRAME_R + BT / 2 + k * BT + 1;
      beads.push({ x: x + r.range(-1.2, 1.2), y: y + r.range(-0.8, 0.8) });
    }
    // lower deck (5 beads) between the beam and the right frame bar
    for (let k = 0; k < 5; k++) {
      const atBeam = k < lo;
      const x = atBeam ? BEAM_R + BT / 2 + k * BT + 1 : FRAME2_L - BT / 2 - (4 - k) * BT - 1;
      beads.push({ x: x + r.range(-1.2, 1.2), y: y + r.range(-0.8, 0.8) });
    }
  });
  beads.forEach((b, i) => {
    const sp = sprites[(i * 5 + r.int(0, 8)) % sprites.length];
    K.stamp(g, sp, b.x, b.y, { flip: r.chance(0.5), shadow: { dx: 12, dy: 19, blur: 15, color: 'rgba(46,26,8,0.5)' } });
  });
  // contact dark between touching beads and at the rod where it enters each bead
  for (const b of beads) {
    for (const sx of [-1, 1]) {
      g.fillStyle = L.radial(g, b.x + sx * (BT / 2 - 1), b.y + 1, 0, 11, [[0, 'rgba(6,2,0,0.5)'], [1, 'rgba(6,2,0,0)']]);
      g.fillRect(b.x + sx * (BT / 2 - 1) - 11, b.y - 10, 22, 22);
    }
  }
  return c;
}

export default {
  name: '算盘',
  init() { layer = build(); },
  draw(ctx, env, p) {
    ctx.fillStyle = '#e2cf9e'; ctx.fillRect(0, 0, S, S);
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.03, x0: 14, y0: 4, x1: -10, y1: -4, r0: -0.012, r1: -0.012 });
  },
};
