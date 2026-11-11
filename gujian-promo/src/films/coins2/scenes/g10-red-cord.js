// g10 — 红绳: one red silk cord laid on cream paper, tracing the coin glyph in a single run: round the square hole, down a short
// connector, round the outer circle, and back to a wrapped knot at the bottom from which a tassel hangs.
// The cord is shaded per pixel (2× supersampled): a three-ply twisted cylinder lit from the top-left, with fibre lines in each ply.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const SS = 2;                 // supersampling of the cord buffer
const HW = 7.6;               // cord half-width (px, 1×) → ≈15 px cord
const LAY = 27;               // lay length of the twist (px, 1×); three plies → a ply every 9 px
let layer = null;

// ── the path: flat list of samples [x, y, tx, ty, s, hw, bend] at ≈0.25 px spacing ──
function makePath() {
  const out = []; let s = 0; const STEP = 0.25;
  const push = (x, y, tx, ty, ds, hw = HW, bend = 0) => { out.push(x, y, tx, ty, s, hw, bend); s += ds; };
  const line = (x0, y0, x1, y1) => {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / STEP)), tx = (x1 - x0) / d, ty = (y1 - y0) / d;
    for (let i = 0; i < n; i++) { const t = i / n; push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, tx, ty, d / n); }
  };
  const arc = (cx, cy, r, a0, a1) => {
    const d = Math.abs(a1 - a0) * r, n = Math.max(1, Math.ceil(d / STEP)), dir = Math.sign(a1 - a0);
    for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, -Math.sin(a) * dir, Math.cos(a) * dir, d / n); }
  };
  const { cx, cy, R, a } = K.GLYPH; const rc = 11, rt = 13, rj = 16, H = Math.PI / 2;
  // the square hole, starting just left of bottom-centre and running anticlockwise on screen
  line(cx - 24, cy + a, cx + a - rc, cy + a);
  arc(cx + a - rc, cy + a - rc, rc, H, 0);
  line(cx + a, cy + a - rc, cx + a, cy - a + rc);
  arc(cx + a - rc, cy - a + rc, rc, 0, -H);
  line(cx + a - rc, cy - a, cx - a + rc, cy - a);
  arc(cx - a + rc, cy - a + rc, rc, -H, -Math.PI);
  line(cx - a, cy - a + rc, cx - a, cy + a - rc);
  arc(cx - a + rc, cy + a - rc, rc, Math.PI, H);
  line(cx - a + rc, cy + a, cx - rt, cy + a);
  const sSq = s;
  // turn down, run to the outer circle, turn into it
  arc(cx - rt, cy + a + rt, rt, -H, 0);
  line(cx, cy + a + rt, cx, cy + R - rj);
  arc(cx + rj, cy + R - rj, rj, Math.PI, H);
  // the outer circle, all the way round and a little past the knot
  const a0 = H - Math.asin(rj / R);
  arc(cx, cy, R, a0, H - TAU - 0.05);
  const mainEnd = out.length, sEnd = s;
  // laid by hand: the run wanders a pixel or two off the ideal line (none where runs meet, so the joins stay clean)
  for (let i = 0; i < mainEnd; i += 7) {
    const q = out[i + 4];
    const env = q < sSq ? Math.max(0, Math.min(1, q / 90, (sSq - q) / 90)) * 0.9 : Math.max(0, Math.min(1, (q - sSq - 20) / 90, (sEnd - q - 30) / 140)) * 2.3;
    const w = env * (Math.sin(q * 0.0213 + 0.7) * 0.62 + Math.sin(q * 0.0471 + 2.1) * 0.38 + Math.sin(q * 0.0089 + 4.0) * 0.5);
    out[i] += -out[i + 3] * w; out[i + 1] += out[i + 2] * w;
  }
  // the knot: three wraps of the cord round the junction (a whipping), each seen as half a turn
  for (let w = 0; w < 3; w++) {
    const y = cy + R - 12 + w * 12, x0 = cx - 19.5 + (w === 1 ? -1.5 : 0), x1 = cx + 19.5 + (w === 1 ? 1.5 : 0), n = 170;
    s += 37;
    for (let i = 0; i <= n; i++) {
      const v = (i / n) * 2 - 1, t = i / n;
      push(x0 + (x1 - x0) * t, y - 1.6 + 3.2 * t, 0.995, 0.0995, (x1 - x0) / n, 6.9 * Math.sqrt(Math.max(0.02, 1 - Math.pow(Math.abs(v), 5))), v);
    }
  }
  return { p: out, mainEnd };
}

// ── per-pixel cord ──
function renderCord(path) {
  const W = S * SS, img = new ImageData(W, W), d = img.data, cov = new Float32Array(W * W), p = path.p;
  const LX = -0.5014, LY = -0.6217, LZ = 0.6017, HX = -0.2801, HY = -0.3474, HZ = 0.8949;
  for (let i = 0; i < p.length; i += 7) {
    const px = p[i] * SS, py = p[i + 1] * SS, tx = p[i + 2], ty = p[i + 3], s = p[i + 4], hw = p[i + 5] * SS, bend = p[i + 6];
    const rb = hw + 2, x0 = Math.max(0, Math.floor(px - rb)), x1 = Math.min(W - 1, Math.ceil(px + rb)), y0 = Math.max(0, Math.floor(py - rb)), y1 = Math.min(W - 1, Math.ceil(py + rb));
    for (let yy = y0; yy <= y1; yy++) {
      const dy = yy + 0.5 - py;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx + 0.5 - px, al = dx * tx + dy * ty;
        if (al > 0.62 || al < -0.62) continue;
        const lat = -dx * ty + dy * tx, c = Math.min(1, hw - Math.abs(lat) + 0.5);
        if (c <= 0) continue;
        const o = yy * W + xx;
        if (c < cov[o] - 0.001) continue;
        cov[o] = c;
        // cylinder + three twisted plies
        const u = Math.max(-0.995, Math.min(0.995, lat / hw)), nz0 = Math.sqrt(1 - u * u);
        const sa = s + al / SS, ph = 3 * (sa / LAY + Math.asin(u) / TAU), kf = Math.floor(ph), f = ph - kf;
        const bump = Math.sin(Math.PI * f), tilt = -Math.cos(Math.PI * f) * 0.62 * nz0 + bend * 0.9;
        let nx = -ty * u + tx * tilt, ny = tx * u + ty * tilt, nz = nz0;
        const nl = 1 / Math.hypot(nx, ny, nz); nx *= nl; ny *= nl; nz *= nl;
        const diff = Math.max(0, nx * LX + ny * LY + nz * LZ), sp = Math.max(0, nx * HX + ny * HY + nz * HZ);
        const ao = 0.46 + 0.54 * Math.pow(bump, 0.55);
        const fib = 1 + 0.085 * Math.sin(f * TAU * 4.5 + kf * 1.7 + sa * 0.045) + 0.05 * Math.sin(f * TAU * 10.5 + kf * 3.1 - sa * 0.02);
        const dye = 1 + 0.05 * Math.sin(sa * 0.013 + 1.3) + 0.03 * Math.sin(sa * 0.071);
        const t = Math.max(0, Math.min(1, ((0.26 + 0.92 * diff) * ao * fib * dye * (1 - 0.35 * bend * bend)) / 1.08));
        const spec = Math.pow(sp, 22) * 0.55 * bump * fib;
        const q = o * 4;
        d[q] = 58 + 170 * Math.pow(t, 0.85) + spec * 40;
        d[q + 1] = 5 + 46 * Math.pow(t, 1.7) + spec * 150;
        d[q + 2] = 14 + 36 * Math.pow(t, 1.4) + spec * 120;
        d[q + 3] = c * 255;
      }
    }
  }
  const big = L.makeCanvas(W, W); big.getContext('2d').putImageData(img, 0, 0);
  const c1 = L.makeCanvas(S, S), g = c1.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(big, 0, 0, W, W, 0, 0, S, S);
  return c1;
}

// ── stray silk fuzz along the cord: short hairs leaving its edge ──
function fuzz(g, path) {
  const r = L.rng('g10fuzz'), p = path.p, n = path.mainEnd / 7;
  g.lineCap = 'round';
  for (let k = 0; k < 150; k++) {
    const i = r.int(40, n - 40) * 7, side = r() < 0.5 ? -1 : 1;
    const x = p[i] + -p[i + 3] * side * (HW - 0.8), y = p[i + 1] + p[i + 2] * side * (HW - 0.8);
    const dirx = -p[i + 3] * side * 0.55 + p[i + 2] * r.range(0.4, 1) * (r() < 0.5 ? -1 : 1), diry = p[i + 2] * side * 0.55 + p[i + 3] * r.range(0.4, 1) * (r() < 0.5 ? -1 : 1);
    const len = r.range(3, 8.5);
    g.strokeStyle = L.rgba(r() < 0.6 ? '#b3202a' : '#d9564c', r.range(0.35, 0.7)); g.lineWidth = r.range(0.6, 1.0);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + dirx * len * 0.5 + r.range(-1.2, 1.2), y + diry * len * 0.5 + r.range(-1.2, 1.2), x + dirx * len, y + diry * len); g.stroke();
  }
}

// ── the tassel: a bound bundle of loose silk threads lying on the paper below the knot ──
function tassel() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d'), r = L.rng('g10tassel');
  const { cx, cy, R } = K.GLYPH; const yTop = cy + R + 10, yBind = cy + R + 43, yEnd = cy + R + 137;
  g.lineCap = 'round'; g.lineJoin = 'round';
  // dark body under the threads
  g.fillStyle = '#6f0c15';
  g.beginPath(); g.moveTo(cx - 9, yTop); g.bezierCurveTo(cx - 13, yTop + 12, cx - 9, yBind - 4, cx - 8, yBind);
  g.bezierCurveTo(cx - 12, yBind + 40, cx - 25, yEnd - 40, cx - 22, yEnd - 8); g.lineTo(cx + 31, yEnd - 8);
  g.bezierCurveTo(cx + 30, yEnd - 40, cx + 12, yBind + 40, cx + 8, yBind); g.bezierCurveTo(cx + 9, yBind - 4, cx + 13, yTop + 12, cx + 9, yTop); g.closePath(); g.fill();
  const thread = (u, dark) => {
    const xh = cx + u * 8.5, xm = cx + u * 12.5, xb = cx + u * 8, sway = 5 + r.range(-2.5, 2.5), xe = cx + u * 27 + sway + r.range(-2, 2);
    const ye = yEnd + r.range(-9, 4) - Math.abs(u) * 5;
    const t = L.clamp(0.52 - 0.34 * u + r.range(-0.2, 0.2) - dark, 0, 1);
    g.strokeStyle = L.mix('#7d0e18', '#e24a3e', t); g.lineWidth = r.range(1.1, 2.1); g.globalAlpha = r.range(0.82, 1);
    g.beginPath(); g.moveTo(xh, yTop);
    g.bezierCurveTo(xm, yTop + 8, xm, yBind - 8, xb, yBind);
    g.bezierCurveTo(xb + u * 3, yBind + 34 + r.range(-6, 6), xe - u * 5 + r.range(-2, 2), ye - 44, xe, ye); g.stroke();
  };
  for (let i = 0; i < 46; i++) thread(((i + r()) / 46) * 2 - 1, 0.3);
  for (let i = 0; i < 40; i++) thread(r.range(-1, 1), 0);
  for (let i = 0; i < 9; i++) { g.save(); thread(r.range(-0.9, 0.1), -0.25); g.restore(); }       // a few catching the light
  g.globalAlpha = 1;
  // binding: fine gold thread wound round the neck
  for (let k = 0; k < 5; k++) {
    const y = yBind - 4.2 + k * 2.1;
    g.strokeStyle = L.linear(g, cx - 10, 0, cx + 10, 0, [[0, '#a8842f'], [0.28, '#f0d488'], [0.6, '#c39a3c'], [1, '#6e5218']]);
    g.lineWidth = 1.7; g.beginPath(); g.moveTo(cx - 9.6, y - 0.6); g.quadraticCurveTo(cx, y + 1.9, cx + 9.6, y - 0.2); g.stroke();
    g.strokeStyle = 'rgba(70,40,8,0.55)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(cx - 9.6, y + 0.5); g.quadraticCurveTo(cx, y + 3, cx + 9.6, y + 0.9); g.stroke();
  }
  return c;
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#f2ead8', tone: '#8a6a3a', seed: 'g10paper', fiber: 0.65, stain: 0.26, foxing: 0.14, edge: 0.2 }), 0, 0);
  const path = makePath(), cord = renderCord(path), tas = tassel();
  const cast = (img, dx, dy, blur, color) => { g.save(); g.shadowColor = color; g.shadowBlur = blur; g.shadowOffsetX = dx; g.shadowOffsetY = dy; g.drawImage(img, 0, 0); g.restore(); };
  cast(tas, 4, 6, 9, 'rgba(60,28,12,0.34)'); cast(tas, 1.2, 1.8, 2.5, 'rgba(50,16,8,0.4)');
  cast(cord, 4.5, 7, 9, 'rgba(60,28,12,0.36)'); cast(cord, 1.3, 2, 2.6, 'rgba(50,16,8,0.42)');
  fuzz(g, path);
  return c;
}

export default {
  name: '红绳',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
