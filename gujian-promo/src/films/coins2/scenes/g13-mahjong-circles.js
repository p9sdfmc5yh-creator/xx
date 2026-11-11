// g13 — 麻将筒子: ivory mahjong tiles (circle suit only) laid out on dark green baize so that they spell the CURRENT glyph.
// The tiles are laid the way a player would lay them: end to end along the centre line of every stroke — two abreast in a
// big character, one in a small one — and a tile turned across the stroke where a gap is too short for one laid along it.
// Top-down shot, light from the top-left: every tile has a face, a bone side and a bamboo base seen as a sliver on its lower right.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const TW = 64, TH = 86, TR = 7.5;                 // one tile in its own units (face, corner radius); its size on the page follows the stroke width
const DEPTH = 10, OX = 0.62, OY = 0.95;           // thickness of a tile as the camera sees it: the body shows on the lower right
const IV = '#f3ebd3';
const RED = '#b3241b', GRN = '#17603f', BLU = '#1d3d88';
let layer = null;

function rr(q, x, y, w, h, r) {
  q.beginPath();
  q.moveTo(x + r, y); q.lineTo(x + w - r, y); q.quadraticCurveTo(x + w, y, x + w, y + r);
  q.lineTo(x + w, y + h - r); q.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  q.lineTo(x + r, y + h); q.quadraticCurveTo(x, y + h, x, y + h - r);
  q.lineTo(x, y + r); q.quadraticCurveTo(x, y, x + r, y); q.closePath();
}
const disc = (q, x, y, r) => { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); };

// one engraved, paint-filled "筒": concentric rings with a pip in the middle. (lx, ly) points at the lamp, in the tile's own frame
function tong(q, x, y, r, col, lx, ly) {
  q.fillStyle = 'rgba(255,255,255,0.7)'; disc(q, x - lx * 1.15, y - ly * 1.15, r);   // the far lip of the cut catches the light
  q.fillStyle = 'rgba(70,45,12,0.5)'; disc(q, x + lx * 0.85, y + ly * 0.85, r);      // the near lip shades it
  q.fillStyle = col; disc(q, x, y, r);
  q.strokeStyle = IV; q.lineWidth = Math.max(1.15, r * 0.17);
  q.beginPath(); q.arc(x, y, r * 0.68, 0, TAU); q.stroke();
  if (r >= 9) {                                                                       // tiny petals between the rings
    q.fillStyle = IV;
    for (let k = 0; k < 6; k++) { const t = (k / 6) * TAU + 0.3; disc(q, x + Math.cos(t) * r * 0.44, y + Math.sin(t) * r * 0.44, r * 0.075); }
  }
  q.fillStyle = IV; disc(q, x, y, r * 0.30);
  q.fillStyle = col; disc(q, x, y, r * 0.15);
  const la = Math.atan2(ly, lx);
  q.strokeStyle = 'rgba(255,255,255,0.26)'; q.lineWidth = Math.max(0.8, r * 0.09);    // gloss on the lacquer
  q.beginPath(); q.arc(x, y, r * 0.86, la - 0.7, la + 0.7); q.stroke();
}
// the big one-circle
function tongOne(q, lx, ly) {
  const r = 22.5;
  q.fillStyle = 'rgba(255,255,255,0.7)'; disc(q, -lx * 1.25, -ly * 1.25, r);
  q.fillStyle = 'rgba(70,45,12,0.5)'; disc(q, lx * 0.95, ly * 0.95, r);
  q.fillStyle = GRN; disc(q, 0, 0, r);
  q.fillStyle = IV; disc(q, 0, 0, r * 0.80);
  q.fillStyle = RED;
  for (let k = 0; k < 14; k++) { const t = (k / 14) * TAU; disc(q, Math.cos(t) * r * 0.67, Math.sin(t) * r * 0.67, 1.9); }
  q.fillStyle = BLU; disc(q, 0, 0, r * 0.52);
  q.strokeStyle = IV; q.lineWidth = 1.3; q.beginPath(); q.arc(0, 0, r * 0.41, 0, TAU); q.stroke();
  q.fillStyle = IV;
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * TAU; q.save(); q.translate(Math.cos(t) * r * 0.23, Math.sin(t) * r * 0.23); q.rotate(t);
    q.beginPath(); q.ellipse(0, 0, 3.0, 1.5, 0, 0, TAU); q.fill(); q.restore();
  }
  q.fillStyle = RED; disc(q, 0, 0, 2.6);
  const la = Math.atan2(ly, lx);
  q.strokeStyle = 'rgba(255,255,255,0.26)'; q.lineWidth = 1.6; q.beginPath(); q.arc(0, 0, r * 0.9, la - 0.7, la + 0.7); q.stroke();
}
const PIPS = {
  2: [[0, -18, 13, GRN], [0, 18, 13, BLU]],
  3: [[-15, -23, 10.5, BLU], [0, 0, 10.5, RED], [15, 23, 10.5, GRN]],
  4: [[-13.5, -17, 11.5, BLU], [13.5, -17, 11.5, GRN], [-13.5, 17, 11.5, GRN], [13.5, 17, 11.5, BLU]],
  5: [[-15, -23, 9.6, BLU], [15, -23, 9.6, GRN], [0, 0, 9.6, RED], [-15, 23, 9.6, GRN], [15, 23, 9.6, BLU]],
  6: [[-12.5, -25, 9.4, GRN], [12.5, -25, 9.4, GRN], [-12.5, 2, 9.4, RED], [12.5, 2, 9.4, RED], [-12.5, 25, 9.4, RED], [12.5, 25, 9.4, RED]],
  7: [[-16, -30, 7.2, GRN], [0, -22, 7.2, GRN], [16, -14, 7.2, GRN], [-12, 7, 8.8, RED], [12, 7, 8.8, RED], [-12, 27, 8.8, RED], [12, 27, 8.8, RED]],
  8: [[-12, -28.5, 8.2, BLU], [12, -28.5, 8.2, BLU], [-12, -9.5, 8.2, BLU], [12, -9.5, 8.2, BLU], [-12, 9.5, 8.2, BLU], [12, 9.5, 8.2, BLU], [-12, 28.5, 8.2, BLU], [12, 28.5, 8.2, BLU]],
  9: [[-18, -25, 7.9, GRN], [0, -25, 7.9, GRN], [18, -25, 7.9, GRN], [-18, 0, 7.9, RED], [0, 0, 7.9, RED], [18, 0, 7.9, RED], [-18, 25, 7.9, BLU], [0, 25, 7.9, BLU], [18, 25, 7.9, BLU]],
};

// the face of a tile, drawn in the tile's own units around (0, 0) and clipped to its rounded outline
function face(q, n, r, lx, ly) {
  rr(q, -TW / 2, -TH / 2, TW, TH, TR); q.save(); q.clip();
  const warm = r.range(0, 1);
  const gr = q.createLinearGradient(-TW / 2, -TH / 2, TW / 2, TH / 2);
  gr.addColorStop(0, L.mix('#f8f2df', '#f3e9cc', warm)); gr.addColorStop(1, L.mix('#ece2c6', '#e4d6b0', warm));
  q.fillStyle = gr; q.fillRect(-TW / 2, -TH / 2, TW, TH);
  // bone grain: fine long lines down the tile, a few short pores
  q.lineCap = 'round';
  for (let k = 0; k < 30; k++) {
    const x = r.range(-TW / 2, TW / 2), d = r.range(-2.5, 2.5);
    q.strokeStyle = L.rgba('#a98c52', r.range(0.06, 0.18)); q.lineWidth = r.range(0.45, 0.9);
    q.beginPath(); q.moveTo(x, -TH / 2); q.bezierCurveTo(x + d, -TH / 6, x - d, TH / 6, x + d * 0.5, TH / 2); q.stroke();
  }
  for (let k = 0; k < 16; k++) {
    const x = r.range(-TW / 2, TW / 2), y = r.range(-TH / 2, TH / 2);
    q.strokeStyle = L.rgba('#7d6230', r.range(0.12, 0.3)); q.lineWidth = 0.7;
    q.beginPath(); q.moveTo(x, y); q.lineTo(x + r.range(-0.4, 0.4), y + r.range(1.5, 4.5)); q.stroke();
  }
  // handled edges have yellowed
  const eg = q.createRadialGradient(0, 0, 22, 0, 0, 56);
  eg.addColorStop(0, 'rgba(176,134,60,0)'); eg.addColorStop(1, 'rgba(176,134,60,0.26)');
  q.fillStyle = eg; q.fillRect(-TW / 2, -TH / 2, TW, TH);
  if (n === 1) tongOne(q, lx, ly); else for (const [x, y, rad, col] of PIPS[n]) tong(q, x, y, rad, col, lx, ly);
  // paint rubbed thin here and there
  for (let k = 0; k < 9; k++) {
    q.fillStyle = L.rgba(IV, r.range(0.12, 0.3));
    q.beginPath(); q.ellipse(r.range(-24, 24), r.range(-34, 34), r.range(0.6, 1.8), r.range(0.4, 1.1), r() * 3, 0, TAU); q.fill();
  }
  q.restore();
}
// a tile lying face down: the bamboo back
function back(q, r) {
  rr(q, -TW / 2, -TH / 2, TW, TH, TR); q.save(); q.clip();
  const gr = q.createLinearGradient(-TW / 2, -TH / 2, TW / 2, TH / 2);
  gr.addColorStop(0, '#d8b46a'); gr.addColorStop(1, '#b98c45');
  q.fillStyle = gr; q.fillRect(-TW / 2, -TH / 2, TW, TH);
  q.lineCap = 'round';
  for (let k = 0; k < 46; k++) {                                   // bamboo fibre runs the length of the tile
    const x = r.range(-TW / 2, TW / 2), d = r.range(-1.2, 1.2);
    q.strokeStyle = r.chance(0.3) ? L.rgba('#f0d69a', r.range(0.12, 0.3)) : L.rgba('#6e4a1c', r.range(0.1, 0.32)); q.lineWidth = r.range(0.5, 1.3);
    q.beginPath(); q.moveTo(x, -TH / 2); q.bezierCurveTo(x + d, -TH / 6, x - d, TH / 6, x + d * 0.4, TH / 2); q.stroke();
  }
  for (let k = 0; k < 34; k++) {                                   // vascular flecks
    const x = r.range(-TW / 2, TW / 2), y = r.range(-TH / 2, TH / 2);
    q.strokeStyle = L.rgba('#4f3312', r.range(0.25, 0.55)); q.lineWidth = r.range(0.6, 1.0);
    q.beginPath(); q.moveTo(x, y); q.lineTo(x + r.range(-0.3, 0.3), y + r.range(2, 6)); q.stroke();
  }
  q.restore();
}

function felt() {
  const N = L.makeNoise('g13felt');
  // the matted wool itself, computed for every DEVICE pixel: brushed pile, clumps of fibre a pixel or two across, fuzz
  const c = L.pixelCanvas(S, S, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q;
        let h = Math.imul((x * 2) | 0, 374761393) ^ Math.imul((y * 2) | 0, 668265263);
        h = Math.imul(h ^ (h >>> 13), 1274126177); const u = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        const m = N.n2(x * 0.012, y * 0.012) * 0.6 + N.n2(x * 0.05 + 9, y * 0.05) * 0.4;
        const f = N.n2(x * 0.75 + 3, y * 0.75);
        const v = 1 + m * 0.13 + f * 0.12 + (u - 0.5) * 0.18;
        d[k] = 21 * v; d[k + 1] = 61 * v; d[k + 2] = 43 * v; d[k + 3] = 255;
      }
    }
  });
  const g = c.getContext('2d'), r = L.rng('g13felt');
  for (let k = 0; k < 46; k++) {                                     // pile brushed this way and that
    const x = r() * S, y = r() * S, rad = r.range(90, 260);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, r.chance(0.5) ? 'rgba(52,112,78,0.10)' : 'rgba(4,20,12,0.12)'], [1, 'rgba(20,60,40,0)']]);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.lineCap = 'round';
  const cols = ['#2c6448', '#0b2619', '#3a7a56', '#1c4c35', '#0f3022'];
  for (let k = 0; k < 36000; k++) {                                  // felted wool fibres
    const x = r() * S, y = r() * S, a = r() * TAU, len = r.range(2, 7);
    g.strokeStyle = L.rgba(cols[r.int(0, cols.length - 1)], r.range(0.14, 0.42)); g.lineWidth = r.range(0.45, 1.0);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let k = 0; k < 260; k++) {                                    // stray lint
    const x = r() * S, y = r() * S, a = r() * TAU, len = r.range(8, 22), b = r.range(-0.9, 0.9);
    g.strokeStyle = L.rgba(r.chance(0.7) ? '#6aa583' : '#c9d6c2', r.range(0.1, 0.26)); g.lineWidth = r.range(0.5, 0.9);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + b) * len * 0.5, y + Math.sin(a + b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  const lg = g.createLinearGradient(0, 0, S, S);                     // lamp at the top-left
  lg.addColorStop(0, 'rgba(96,160,118,0.20)'); lg.addColorStop(0.5, 'rgba(20,60,40,0)'); lg.addColorStop(1, 'rgba(0,8,4,0.36)');
  g.fillStyle = lg; g.fillRect(0, 0, S, S);
  g.fillStyle = L.radial(g, S * 0.46, S * 0.44, S * 0.38, S * 0.82, [[0, 'rgba(0,8,4,0)'], [1, 'rgba(0,8,4,0.34)']]);   // and its pool of light falls off toward the corners
  g.fillRect(0, 0, S, S);
  return c;
}

// ───────── where the tiles go: nothing here knows which character it is, only K's distance field of the current glyph ─────────
const wrapHalf = (a) => a - Math.PI * Math.round(a / Math.PI);       // an angle mod π, as (−π/2, π/2]

function layout() {
  const info = K.glyphInfo(), sw = info.strokeWidth;
  const two = sw * 0.45 >= 24;                                       // a big character takes two tiles abreast in a stroke, a small one a single tile
  const w = sw * (two ? 0.48 : 0.9), sc = w / TW, hw = w / 2, hl = (TH * sc) / 2;
  const GAP = Math.max(0.6, w * 0.035);                              // air between neighbours
  const TOL = L.clamp(sw * 0.05, 1.5, 4.3), TOL2 = TOL * 1.4;          // how far a tile may stick out of the outline: at the tips, and where a stroke has a waist
  const tiles = [], cell = 2 * Math.hypot(hw, hl) + GAP + 1, hash = new Map();
  const mk = (x, y, a) => ({ x, y, a, ux: Math.cos(a), uy: Math.sin(a) });          // a is the direction of the tile's LONG side
  const apart = (A, B, gap) => {                                     // separating axes of two equal rectangles
    const dx = B.x - A.x, dy = B.y - A.y, c = Math.abs(A.ux * B.ux + A.uy * B.uy), s = Math.abs(A.ux * B.uy - A.uy * B.ux);
    const el = hl + hl * c + hw * s + gap, ew = hw + hl * s + hw * c + gap;
    return Math.abs(dx * A.ux + dy * A.uy) >= el || Math.abs(dy * A.ux - dx * A.uy) >= ew || Math.abs(dx * B.ux + dy * B.uy) >= el || Math.abs(dy * B.ux - dx * B.uy) >= ew;
  };
  const blocked = (t, upto = 1e9) => {                               // does it touch a tile already laid (one of the first `upto`)?
    const cx = Math.floor(t.x / cell), cy = Math.floor(t.y / cell);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const list = hash.get((cx + i) * 8192 + cy + j); if (!list) continue;
      for (const q of list) if (q.id < upto && !apart(t, q, GAP - 0.05)) return true;
    }
    return false;
  };
  const put = (t) => { const k = Math.floor(t.x / cell) * 8192 + Math.floor(t.y / cell); (hash.get(k) || hash.set(k, []).get(k)).push(t); t.id = tiles.length; tiles.push(t); };
  const cr = TR * sc * 0.3;
  const fit = (x, y, a) => {                                         // 2: the whole tile lies within the outline (give or take TOL), 1: nearly (TOL2), 0: no
    const ux = Math.cos(a), uy = Math.sin(a); let m = -1e9;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) {
      const corner = (i === 0 || i === 6) && (j === 0 || j === 4);
      let s = (i / 3 - 1) * hl, t = (j / 2 - 1) * hw;
      if (corner) { s -= Math.sign(s) * cr; t -= Math.sign(t) * cr; }
      const d = K.sdGlyph(x + ux * s - uy * t, y + uy * s + ux * t) / (corner ? 1.4 : 1);
      if (d > m) { m = d; if (m > TOL2) return 0; }
    }
    return m > TOL ? 1 : 2;
  };

  // 1 — the centre line of every stroke, walked along the ridge of the distance field from tip to tip
  const edges = (x, y, a) => {                                       // what the two sides of the stroke say, seen from (x, y) heading a
    const d = -K.sdGlyph(x, y), nx = -Math.sin(a), ny = Math.cos(a), o = Math.max(2, d * 0.55);
    const gl = K.glyphNormal(x + nx * o, y + ny * o), gr = K.glyphNormal(x - nx * o, y - ny * o);
    const tl = wrapHalf(Math.atan2(gl.y, gl.x) - Math.PI / 2 - a), tr = wrapHalf(Math.atan2(gr.y, gr.x) + Math.PI / 2 - a);
    const ok = Math.abs(tl) < 0.45 && gl.x * nx + gl.y * ny > 0 && Math.abs(tr) < 0.45 && gr.x * nx + gr.y * ny < 0;
    const lo = Math.min(Math.abs(tl), Math.abs(tr)), hi = Math.max(Math.abs(tl), Math.abs(tr));
    const curve = ok && tl * tr > 0 && lo > hi * 0.3;               // both sides bend the same way: a curve (a taper is not, nor one side opening into a junction)
    return {
      d, ok, nx, ny, mean: ok ? (tl + tr) / 2 : 0,
      turn: curve ? (Math.abs(tl) < Math.abs(tr) ? tl : tr) : 0,
      shift: ok && (curve || Math.abs(tl + tr) < 0.12) ? (K.sdGlyph(x - nx * o, y - ny * o) - K.sdGlyph(x + nx * o, y + ny * o)) / 2 : 0,   // back to the middle, while the sides can be trusted
    };
  };
  const span = Math.max(2, Math.round(hl)), tip = sw * 0.7;         // (a walk that ends within `tip` of its own stretch ended at a real tip)
  const walk = (x0, y0, a0) => {
    const half = (a) => {
      const pts = []; let x = x0, y = y0;
      for (let n = 0; n < 3 * S; n++) {
        x += Math.cos(a); y += Math.sin(a);
        const e = edges(x, y, a);
        if (e.d < 1.2) break;                                        // out through the tip of the stroke
        a += L.clamp(e.turn * 0.3, -0.03, 0.03);
        const sh = L.clamp(e.shift, -0.5, 0.5); x += e.nx * sh; y += e.ny * sh;
        pts.push({ x, y, ok: e.ok });
      }
      return pts;
    };
    const R = half(a0 + Math.PI).reverse().concat([{ x: x0, y: y0, ok: true }], half(a0)), m = R.length, h = span >> 1, P = [];
    // where the walk crosses another stroke the ridge bulges toward it: run straight across instead, from a little before to a little after
    const mg = Math.round(sw * 0.3), bad = new Uint8Array(m);
    let lo = 0, hi = m - 1; while (lo < m - 1 && !R[lo].ok) lo++; while (hi > lo && !R[hi].ok) hi--;
    for (let j = 0; j < m; j++) if (!R[j].ok && (j > lo ? j < hi || m - 1 - hi > tip : lo > tip)) for (let i = Math.max(0, j - mg); i <= Math.min(m - 1, j + mg); i++) bad[i] = 1;
    for (let j = 0; j < m; j++) {
      if (!bad[j]) continue;
      let b = j; while (b + 1 < m && bad[b + 1]) b++;
      const A = j > 0 ? R[j - 1] : null, B = b < m - 1 ? R[b + 1] : null;
      if (A && B) for (let i = j; i <= b; i++) { const t = (i - j + 1) / (b - j + 2); R[i].x = A.x + (B.x - A.x) * t; R[i].y = A.y + (B.y - A.y) * t; }
      else if (A || B) {                                             // the walk ran on through the stroke its tip touches: straight on from the last sure stretch
        const q = A || B, f = A ? R[Math.max(0, j - 1 - span)] : R[Math.min(m - 1, b + 1 + span)], l = Math.hypot(q.x - f.x, q.y - f.y) || 1;
        for (let i = j; i <= b; i++) { const n = A ? i - j + 1 : b + 1 - i; R[i].x = q.x + ((q.x - f.x) / l) * n; R[i].y = q.y + ((q.y - f.y) / l) * n; }
      }
      j = b;
    }
    for (let j = 0; j < m; j++) {                                    // iron out the wobble a brush leaves in the ridge (the press at the start of a stroke …)
      let x = 0, y = 0, n = 0;
      for (let i = Math.max(0, j - h); i <= Math.min(m - 1, j + h); i++) { x += R[i].x; y += R[i].y; n++; }
      P.push({ x: x / n, y: y / n, a: a0 });
    }
    const far = Math.round(span * 1.2);
    if (m > 1) P.forEach((p, j) => {                                 // a tile centred here lies along the chord of the line under it
      const f = P[Math.min(m - 1, j + far)], b = P[Math.max(0, j - far)];
      p.a = Math.atan2(f.y - b.y, f.x - b.x);
    });
    // the stretch that is this stroke's own: a walk also runs on, through whatever stroke its tip touches, to the far edge of that one
    P.own = 0; P.lo = 0; P.hi = m - 1;
    R.forEach((p, j) => { if (p.ok) { if (!P.own++) P.lo = j; P.hi = j; } });
    return P;
  };
  const lines = [], near = new Map(), nc = Math.max(8, sw * 0.5);
  const traced = (x, y, a, rad) => {
    const cx = Math.floor(x / nc), cy = Math.floor(y / nc);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const list = near.get((cx + i) * 8192 + cy + j); if (!list) continue;
      for (const p of list) if (Math.hypot(p.x - x, p.y - y) < rad && (a === null || Math.abs(wrapHalf(a - p.a)) < 0.5)) return true;
    }
    return false;
  };
  const seeds = K.pack({ seed: 'g13seed', rmax: sw * 0.5, rmin: Math.max(4, w * 0.3), gap: 1 });
  const clean = (s) => {                                             // a seed on a plain stretch of stroke (not a crossing, a corner or a tip): its direction can be trusted
    let x = s.x, y = s.y, a = s.ang, e;
    for (let k = 0; k < 4; k++) { e = edges(x, y, a); if (!e.ok) return null; if (k < 3) { a += e.mean; x += e.nx * e.shift; y += e.ny * e.shift; } }   // onto the middle of the stroke
    for (const k of [-0.7, 0.7]) { const f = edges(x + Math.cos(a) * sw * k, y + Math.sin(a) * sw * k, a); if (!f.ok || f.d < e.d * 0.5 || f.d > e.d * 1.4) return null; }
    return { x, y, a };
  };
  for (const pass of [0, 1]) for (const s of seeds) {
    const q = pass ? { x: s.x, y: s.y, a: s.ang } : clean(s);
    if (pass === 0 ? (!q || traced(q.x, q.y, q.a, sw * 0.42)) : traced(q.x, q.y, null, sw * 0.5)) continue;   // plain stretches first, blobs after
    const P = walk(q.x, q.y, q.a);
    lines.push(P);
    for (const p of P) { const k = Math.floor(p.x / nc) * 8192 + Math.floor(p.y / nc); (near.get(k) || near.set(k, []).get(k)).push(p); }
  }
  lines.sort((p, q) => q.own - p.own);                               // long strokes are laid first and run through the crossings unbroken

  // 2 — tiles end to end along a lane beside (or on) a centre line; every free stretch of the lane is filled and the slack shared out
  const lane = (P, side, o = {}) => {
    const m = P.length, upto = o.upto === undefined ? tiles.length : o.upto, reach = sw * 0.35; if (m < 2) return;
    const C = new Array(m), s = new Float32Array(m), free = new Uint8Array(m), wall = new Uint8Array(m), step = (o.across ? 2 * hw : 2 * hl) + GAP;
    for (let j = 0; j < m; j++) {
      const p = P[j], nx = -Math.sin(p.a), ny = Math.cos(p.a);
      const bend = Math.abs(wrapHalf(P[Math.min(m - 1, j + span)].a - P[Math.max(0, j - span)].a)) / (2 * span);   // curvature: lanes need a little more room on a bend
      const off = side * (hw + GAP / 2 + Math.min(w * 0.2, w * 0.008 + hl * hl * bend * 1.1));
      const t = C[j] = mk(p.x + nx * off, p.y + ny * off, p.a + (o.across ? Math.PI / 2 : 0));
      s[j] = j ? s[j - 1] + Math.hypot(t.x - C[j - 1].x, t.y - C[j - 1].y) : 0;
      wall[j] = blocked(t, upto) ? 1 : 0;
      free[j] = j < P.lo - reach || j > P.hi + reach || wall[j] ? 0 : Math.min(fit(t.x, t.y, t.a), o.pair ? fit(p.x - nx * off, p.y - ny * off, p.a) : 2);
    }
    for (let j0 = 0; j0 < m; j0++) {
      if (!free[j0]) continue;
      let j = j0, b = j0, end = j0; while (end + 1 < m && free[end + 1]) end++;
      const from = j0;
      if (o.loose) b = end;
      else {
        while (j <= end && free[j] < 2) j++;                         // a free stretch starts and ends where the tile fits properly;
        for (let i = j; i <= end; i++) if (free[i] === 2) b = i;       // in between it may hang over the edge of a waist a little
      }
      j0 = end; if (j > end) continue;
      const len = s[b] - s[j], n = Math.floor(len / step) + 1, slack = len - (n - 1) * step;
      // which end to pack the tiles against: tiles already lying there first (a stroke stays joined to the one it meets), else the tip of the stroke
      const wallA = j === from && from > 0 && wall[from - 1], wallB = b === end && end < m - 1 && wall[end + 1];
      const tipA = P.lo < tip && j < P.lo + hl, tipB = m - 1 - P.hi < tip && b > P.hi - hl;
      const to = wallA !== wallB ? (wallA ? -1 : 1) : tipA !== tipB ? (tipA ? -1 : 1) : 0;       // −1: against the start, 1: against the end, 0: no preference
      let st = step, start = s[j];
      if (!o.across && slack >= 2 * hw + GAP) { if (to > 0 || (!to && j < m - 1 - b)) start += slack; }   // room left over for a tile turned across the stroke: keep it in one piece
      else {                                                         // otherwise share the slack out between the tiles, and put what is left at the far end
        st += n > 1 ? Math.min(step * 0.08, slack / (n - 1)) : 0;
        start += (len - (n - 1) * st) * (to + 1) / 2;
      }
      for (let i = 0, k = j, target = start; i < n && target <= s[b] + 0.5; i++) {
        while (k < b && s[k] < target) k++;
        let kk = k; while (kk < b && s[kk] - target < step * 0.5 && blocked(C[kk])) kk++;     // on a bend: slide on until it clears the tile just laid
        if (!blocked(C[kk])) { put(C[kk]); k = kk; target = s[kk] + st; } else target += st;
      }
    }
  };
  if (two) {
    for (const P of lines) { const upto = tiles.length; lane(P, 1, { pair: true, upto }); lane(P, -1, { pair: true, upto }); }   // two abreast wherever the stroke is wide enough
    for (const P of lines) lane(P, 0);                                                      // one down the middle where it narrows
    for (const P of lines) { lane(P, 1); lane(P, -1); }                                     // slanted tips: the longer side gets one more
  } else for (const P of lines) lane(P, 0);
  for (const P of lines) lane(P, 0, { across: true });                                      // a tile turned across the stroke where the gap is too short for one laid along it
  for (const P of lines) {                                                                  // better a tile that hangs over a little than half a stroke left bare
    if (two) { lane(P, 1, { loose: true }); lane(P, -1, { loose: true }); }
    lane(P, 0, { loose: true }); lane(P, 0, { across: true, loose: true });
  }

  // 3 — whatever is still bare and big enough takes one more tile, along the stroke or across it, pushed up against its neighbour
  const under = (x, y) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const list = hash.get((cx + i) * 8192 + cy + j); if (!list) continue;
      for (const q of list) { const dx = x - q.x, dy = y - q.y; if (Math.abs(dx * q.ux + dy * q.uy) < hl + hw * 0.5 && Math.abs(dy * q.ux - dx * q.uy) < hw * 1.5) return true; }
    }
    return false;
  };
  const bb = info.bbox, gp = Math.max(2.5, hw * 0.3), cand = [];
  for (let y = bb.y0; y <= bb.y1; y += gp) for (let x = bb.x0; x <= bb.x1; x += gp) { const d = -K.sdGlyph(x, y); if (d > hw * 0.7) cand.push({ x, y, d }); }
  cand.sort((p, q) => q.d - p.d);
  for (const p of cand) {
    if (under(p.x, p.y)) continue;
    const dirs = [], cx = Math.floor(p.x / nc), cy = Math.floor(p.y / nc);       // the way the strokes run here: the centre lines close by, then the ink itself
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const q of near.get((cx + i) * 8192 + cy + j) || []) {
      if (Math.hypot(q.x - p.x, q.y - p.y) < sw * 0.75 && dirs.length < 4 && !dirs.some((a) => Math.abs(wrapHalf(a - q.a)) < 0.25)) dirs.push(q.a);
    }
    dirs.push(K.strokeAngle(p.x, p.y));
    search: for (const a0 of dirs) for (const a of [a0, a0 + Math.PI / 2]) {
      const sx = Math.cos(a0), sy = Math.sin(a0);
      const ok = (n) => { const t = mk(p.x + sx * n, p.y + sy * n, a); return fit(t.x, t.y, a) && !blocked(t) ? t : null; };
      if (!ok(0)) continue;
      let f = 0, b = 0;
      while (f < 2 * hl && ok(f + 1)) f++;
      while (b < 2 * hl && ok(-b - 1)) b++;
      put(ok(Math.min(f, b) >= 2 * hl ? 0 : f <= b ? f : -b)); break search;
    }
  }
  return { tiles, sc };
}

function build() {
  const info = K.glyphInfo();
  const { tiles, sc } = layout();
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(felt(), 0, 0);
  const r = L.rng('g13tiles' + info.key);
  const NUM = [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 8, 9];   // the crowded faces are kept rare
  tiles.forEach((t, i) => {
    t.x += r.range(-0.25, 0.25) * sc; t.y += r.range(-0.25, 0.25) * sc;
    t.rot = t.a - Math.PI / 2 + r.range(-0.006, 0.006) + (r.chance(0.5) ? Math.PI : 0);
    t.back = r.chance(0.055);
    t.n = NUM[r.int(0, NUM.length - 1)];
    t.r = L.rng('g13t' + info.key + i);
  });
  const ex = DEPTH * sc * OX, ey = DEPTH * sc * OY;                  // the face sits up-left of the base by half of this, the base down-right
  const sil = (t, k, style) => { g.save(); g.translate(t.x + ex * (k - 0.5), t.y + ey * (k - 0.5)); g.rotate(t.rot); g.scale(sc, sc); rr(g, -TW / 2, -TH / 2, TW, TH, TR); g.fillStyle = style; g.fill(); g.restore(); };
  // 1 — shadows on the baize: the dimming all round the pile, the shadow cast toward the lower right, a tight contact line
  const shade = (blur, ox, oy, col) => { for (const t of tiles) { g.save(); g.shadowColor = col; g.shadowBlur = blur * sc; g.shadowOffsetX = ox * sc; g.shadowOffsetY = oy * sc; sil(t, 1, '#07140d'); g.restore(); } };
  shade(30, 5, 8, 'rgba(0,6,3,0.30)');
  shade(14, 12, 17, 'rgba(0,6,3,0.62)');
  shade(4, 2.5, 3.5, 'rgba(0,4,2,0.78)');
  // 2 — the sides: bamboo base below, bone above (reversed for tiles lying face down), shaded because they face away from the lamp
  for (const t of tiles) {
    for (let i = DEPTH; i >= 1; i--) {
      const k = i / DEPTH, low = k > 0.56;
      const bamboo = t.back ? !low : low;
      sil(t, k, i === 6 ? '#6b5326' : bamboo ? L.mix('#a87c3a', '#74501f', k) : L.mix('#d9cba4', '#b3a276', k));
    }
  }
  // 3 — faces, each lit from the page's top-left whatever way the tile is turned
  for (const t of tiles) {
    g.save(); g.translate(t.x - ex * 0.5, t.y - ey * 0.5); g.rotate(t.rot); g.scale(sc, sc);
    const cs = Math.cos(-t.rot), sn = Math.sin(-t.rot);
    const lx = (cs * -1 - sn * -1) * 0.7071, ly = (sn * -1 + cs * -1) * 0.7071;          // the way to the lamp, in the tile's frame
    if (t.back) back(g, t.r); else face(g, t.n, t.r, lx, ly);
    const sh = g.createLinearGradient(lx * 52, ly * 52, -lx * 52, -ly * 52);              // the face is very slightly domed
    sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(84,54,14,0.18)');
    rr(g, -TW / 2, -TH / 2, TW, TH, TR); g.fillStyle = sh; g.fill();
    g.save(); rr(g, -TW / 2, -TH / 2, TW, TH, TR); g.clip();
    g.fillStyle = L.radial(g, lx * TW * 0.22, ly * TH * 0.22, 0, TW * 0.6, [[0, 'rgba(255,255,255,0.20)'], [1, 'rgba(255,255,255,0)']]);   // satin sheen of polished bone
    g.fillRect(-TW / 2, -TH / 2, TW, TH);
    // the highlight's bright core, on the stretch of rounded edge that faces the lamp
    const hx = L.clamp(lx * 1.9, -1, 1) * (TW / 2 - 3.4), hy = L.clamp(ly * 1.9, -1, 1) * (TH / 2 - 3.4);
    g.translate(hx, hy); g.rotate(Math.atan2(ly, lx) + Math.PI / 2); g.scale(2.6, 1);
    g.fillStyle = L.radial(g, 0, 0, 0, 7.5, [[0, 'rgba(255,255,255,0.42)'], [1, 'rgba(255,255,255,0)']]);       // its soft skirt
    g.beginPath(); g.arc(0, 0, 7.5, 0, TAU); g.fill();
    g.fillStyle = L.radial(g, 0, 0, 0, 4.4, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath(); g.arc(0, 0, 4.4, 0, TAU); g.fill();
    g.restore();
    // the rounded edge: lit toward the lamp, falling into shade on the far side
    const rim = g.createLinearGradient(lx * 50, ly * 50, -lx * 50, -ly * 50);
    rim.addColorStop(0, 'rgba(255,255,255,0.95)'); rim.addColorStop(0.42, 'rgba(255,255,255,0.15)'); rim.addColorStop(0.6, 'rgba(96,64,20,0.10)'); rim.addColorStop(1, 'rgba(96,64,20,0.6)');
    g.globalAlpha = 0.3; rr(g, -TW / 2 + 2.6, -TH / 2 + 2.6, TW - 5.2, TH - 5.2, TR - 2); g.strokeStyle = rim; g.lineWidth = 2.2; g.stroke(); g.globalAlpha = 1;
    rr(g, -TW / 2 + 1.1, -TH / 2 + 1.1, TW - 2.2, TH - 2.2, TR - 1); g.strokeStyle = rim; g.lineWidth = 2.0; g.stroke();
    rr(g, -TW / 2 + 0.3, -TH / 2 + 0.3, TW - 0.6, TH - 0.6, TR); g.strokeStyle = 'rgba(70,46,14,0.30)'; g.lineWidth = 0.7; g.stroke();
    g.restore();
  }
  return c;
}

export default {
  name: '麻将筒子',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
