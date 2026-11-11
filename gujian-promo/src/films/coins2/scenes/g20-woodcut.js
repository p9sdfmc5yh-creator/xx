// g20 — 木刻: a white-line woodcut pulled from a black-inked block, spelling the CURRENT glyph (whichever the player selected).
// The character is cut with the knife: a heavy line whose outer edge is the glyph outline, a thin companion line inside it, and
// hatching that runs ALONG the strokes (K.strokeAngle) — fat on the side that faces the light, hair-thin on the shadow side, so
// the strokes read as rounded bodies lit from the top-left. Everything white is paper showing where the wood was cut away; the
// black is ink, pressed into the sheet (raking-light relief), with dry "flying white" along the grain of the block.
// Nothing here knows which character it is: every size derives from K.glyphInfo().strokeWidth.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LX = -Math.SQRT1_2, LY = -Math.SQRT1_2;       // unit vector pointing TOWARDS the light (top-left)
let layer = null;

// ───────────────────────── knife cuts ─────────────────────────
// one knife cut: a tapered polygon along pts ([x, y] samples), full width w. Pointed entry, longer pointed exit, faceted edges.
// o.ws: optional per-sample width factors (the cut swells and thins along its length).
function gouge(g, pts, w, r, o = {}) {
  const n = pts.length; if (n < 3) return;
  const { t0 = 0.1, t1 = 0.22, wob = 0.13, ws = null } = o;
  const A = [], B = []; const ph = r() * 10;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const t = i / (n - 1);
    const tp = Math.pow(Math.min(1, t / t0), 0.7) * Math.pow(Math.min(1, (1 - t) / t1), 0.6) * (ws ? ws[i] : 1);
    const ha = w * 0.5 * tp * (1 + wob * Math.sin(ph + i * 0.9) + r.range(-0.05, 0.05));
    const hb = w * 0.5 * tp * (1 + wob * Math.sin(ph * 1.7 + i * 0.63) + r.range(-0.05, 0.05));
    A.push([pts[i][0] - dy * ha, pts[i][1] + dx * ha]);
    B.push([pts[i][0] + dy * hb, pts[i][1] - dx * hb]);
  }
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}
// samples along a straight cut with a slight hand drift
function seg(x0, y0, x1, y1, r, drift = 0.7) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(4, Math.round(len / 7));
  const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1); const ph = r() * 9, k = r.range(2, 5);
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, o = Math.sin(ph + t * k) * drift; out.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]); }
  return out;
}
// evenly spaced samples along a polyline (closed: a ring)
function resample(pts, step, closed = false) {
  const src = closed ? pts.concat([pts[0]]) : pts, out = [src[0]]; let need = step;
  for (let i = 1; i < src.length; i++) {
    let a = src[i - 1]; const b = src[i]; let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (d >= need) { const t = need / d; a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(a); d -= need; need = step; }
    need -= d;
  }
  if (!closed) { const e = src[src.length - 1], l = out[out.length - 1]; if (Math.hypot(e[0] - l[0], e[1] - l[1]) > step * 0.4) out.push(e); }
  return out;
}
// a closed outline reduced to straight facets (Douglas–Peucker, at most tol px off): the knife cuts curves as a run of flats
function facet(loop, tol) {
  const n = loop.length; if (n < 8) return loop;
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop(); if (b - a < 2) continue;
    const A = loop[a], B = loop[b % n], dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy || 1e-9;
    let md = tol, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = loop[i][0] - A[0], py = loop[i][1] - A[1], t = L.clamp((px * dx + py * dy) / l2), d = Math.hypot(px - dx * t, py - dy * t);
      if (d > md) { md = d; mi = i; }
    }
    if (mi >= 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return loop.filter((_, i) => keep[i]);
}
// 0 … 1: how much the stroke's surface at (x, y) faces the light, read off the distance field (0.5 on the stroke's centre line)
const litAt = (x, y, k) => L.clamp(0.5 + 0.58 * (K.sdGlyph(x + LX * k, y + LY * k) - K.sdGlyph(x - LX * k, y - LY * k)) / (2 * k));

// ── the heavy line: its OUTER edge is the glyph outline, cut facet by facet; a little wider where the edge faces the light
function cutOutline(g, r, P) {
  const loops = K.glyphLoops({ grow: 0 }).map((lp) => facet(lp, P.tol));
  g.save();
  g.beginPath();
  for (const lp of loops) { lp.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
  g.clip('evenodd');
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (const lp of loops) for (let i = 0; i < lp.length; i++) {
    const a = lp[i], b = lp[(i + 1) % lp.length], nn = K.glyphNormal((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 2);
    g.lineWidth = 2 * P.wH * (1 + 0.24 * (nn.x * LX + nn.y * LY)) * r.range(0.93, 1.07);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  g.restore();
  // at the sharp corners one of the two cuts runs a few px past the other
  for (const lp of loops) {
    const n = lp.length;
    for (let i = 0; i < n; i++) {
      const p = lp[(i + n - 1) % n], v = lp[i], q = lp[(i + 1) % n];
      let ax = v[0] - p[0], ay = v[1] - p[1], bx = q[0] - v[0], by = q[1] - v[1]; const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 2.5 * P.wH || lb < 2.5 * P.wH) continue;
      ax /= la; ay /= la; bx /= lb; by /= lb;
      if (ax * bx + ay * by > 0.72 || !r.chance(0.6)) continue;
      const [ux, uy] = r.chance(0.5) ? [ax, ay] : [-bx, -by];
      const back = P.wH * 2.2, out = Math.min(6, r.range(0.035, 0.075) * P.sw);
      const nn = K.glyphNormal(v[0] - ux * back * 0.7, v[1] - uy * back * 0.7, 2), ox = -nn.x * P.wH * 0.3, oy = -nn.y * P.wH * 0.3;
      gouge(g, seg(v[0] - ux * back + ox, v[1] - uy * back + oy, v[0] + ux * out + ox, v[1] + uy * out + oy, r, 0.2), P.wH * 0.55, r, { t0: 0.4, t1: 0.5 });
    }
  }
}

// ── the thin companion line, a fixed depth inside the outline, cut in a run of separate strokes (the knife is lifted and re-entered)
function cutCompanion(g, r, P) {
  const step = P.step;
  for (const lp of K.glyphLoops({ grow: -P.dT })) {
    const pts = resample(facet(lp, P.tol * 0.6), step, true), n = pts.length; if (n < 4) continue;
    let i = r.int(0, n - 1), left = n;
    while (left > 0) {
      let cnt = Math.min(left, Math.max(4, Math.round(r.range(0.9, 2.8) * P.sw / step))); if (left - cnt < 4) cnt = left;
      const piece = []; for (let k = -1; k <= cnt; k++) piece.push(pts[(i + k + n) % n]);
      const len = (piece.length - 1) * step, ws = piece.map((p) => 0.68 + 0.6 * litAt(p[0], p[1], P.lk));
      gouge(g, piece, P.wT, r, { t0: L.clamp(1.5 * P.wT / len, 0.02, 0.3), t1: L.clamp(3.5 * P.wT / len, 0.04, 0.4), ws, wob: 0.1 });
      i = (i + cnt) % n; left -= cnt;
    }
  }
}

// ── hatching: evenly spaced streamlines of the stroke-direction field, kept inside the companion line
function hatchLines(P, r) {
  const b = P.bbox, gp = P.gp;
  const nx = Math.ceil((b.x1 - b.x0) / gp) + 2, ny = Math.ceil((b.y1 - b.y0) / gp) + 2;
  const fc = new Float32Array(nx * ny).fill(2), fs = new Float32Array(nx * ny);          // cos 2θ, sin 2θ per node (2 = not computed yet)
  const node = (i, j) => { const k = j * nx + i; if (fc[k] === 2) { const a = 2 * K.strokeAngle(b.x0 + i * gp, b.y0 + j * gp); fc[k] = Math.cos(a); fs[k] = Math.sin(a); } return k; };
  const dir = (x, y) => {
    const u = L.clamp((x - b.x0) / gp, 0, nx - 1.001), v = L.clamp((y - b.y0) / gp, 0, ny - 1.001), i = u | 0, j = v | 0, a = u - i, c = v - j;
    const k00 = node(i, j), k10 = node(i + 1, j), k01 = node(i, j + 1), k11 = node(i + 1, j + 1);
    return 0.5 * Math.atan2((fs[k00] * (1 - a) + fs[k10] * a) * (1 - c) + (fs[k01] * (1 - a) + fs[k11] * a) * c,
      (fc[k00] * (1 - a) + fc[k10] * a) * (1 - c) + (fc[k01] * (1 - a) + fc[k11] * a) * c);
  };
  const inside = (x, y) => K.sdGlyph(x, y) < -P.m - P.wh * 0.55;
  const cell = P.dsep, hash = new Map();
  const far = (x, y, d) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), d2 = d * d;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const list = hash.get((cx + i) * 8192 + cy + j); if (!list) continue;
      for (let k = 0; k < list.length; k += 2) { const dx = list[k] - x, dy = list[k + 1] - y; if (dx * dx + dy * dy < d2) return false; }
    }
    return true;
  };
  const add = (line) => { for (const p of line) { const k = Math.floor(p[0] / cell) * 8192 + Math.floor(p[1] / cell); (hash.get(k) || hash.set(k, []).get(k)).push(p[0], p[1]); } };
  const h = P.h, back = Math.ceil(2.5 * P.dsep / h), selfD2 = (P.dsep * 0.72) ** 2;
  const trace = (x0, y0) => {
    if (!inside(x0, y0) || !far(x0, y0, P.dsep * 0.9)) return null;
    const parts = [];
    for (const sgn of [1, -1]) {
      const a0 = dir(x0, y0), part = []; let x = x0, y = y0, dx = Math.cos(a0) * sgn, dy = Math.sin(a0) * sgn, len = 0;
      walk: while (len < P.maxLen) {
        const a = dir(x + dx * h * 0.5, y + dy * h * 0.5); let ex = Math.cos(a), ey = Math.sin(a);
        if (ex * dx + ey * dy < 0) { ex = -ex; ey = -ey; }
        if (ex * dx + ey * dy < 0.86) break;                                    // the direction field turns too sharply here
        const px = x + ex * h, py = y + ey * h;
        if (!inside(px, py) || !far(px, py, P.dsep * 0.72)) break;
        for (let k = part.length - back - 1; k >= 0; k--) if ((part[k][0] - px) ** 2 + (part[k][1] - py) ** 2 < selfD2) break walk;   // its own tail
        if (sgn === -1) for (let k = back; k < parts[0].length; k++) if ((parts[0][k][0] - px) ** 2 + (parts[0][k][1] - py) ** 2 < selfD2) break walk;
        x = px; y = py; dx = ex; dy = ey; part.push([x, y]); len += h;
      }
      parts.push(part);
    }
    return parts[1].reverse().concat([[x0, y0]], parts[0]);
  };
  const lines = [], queue = [];
  const tryLine = (x, y) => { const ln = trace(x, y); if (!ln || (ln.length - 1) * h < P.minLen) return; add(ln); lines.push(ln); queue.push(ln); };
  const seeds = [];
  for (let y = b.y0; y <= b.y1; y += P.dsep) for (let x = b.x0; x <= b.x1; x += P.dsep) {
    const px = x + r.range(-0.3, 0.3) * P.dsep, py = y + r.range(-0.3, 0.3) * P.dsep, d = K.sdGlyph(px, py);
    if (d < -P.m - P.wh * 0.55) seeds.push([px, py, d + r() * 2]);
  }
  seeds.sort((p, q) => p[2] - q[2]);                                           // start on the centre lines of the fattest strokes
  const every = Math.max(1, Math.round(P.dsep * 0.5 / h));
  for (const sd of seeds) {
    tryLine(sd[0], sd[1]);
    while (queue.length) {                                                     // grow neighbours one spacing to either side
      const ln = queue.shift();
      for (let i = 0; i < ln.length; i += every) {
        const p = ln[i], a = ln[Math.max(0, i - 1)], c = ln[Math.min(ln.length - 1, i + 1)];
        let tx = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        tryLine(p[0] - ty * P.dsep, p[1] + tx * P.dsep); tryLine(p[0] + ty * P.dsep, p[1] - tx * P.dsep);
      }
    }
  }
  return lines;
}
function cutHatch(g, r, P) {
  for (const ln of hatchLines(P, r)) {
    const total = (ln.length - 1) * P.h, step = Math.min(P.step, total / 4), pts = resample(ln, step), n = pts.length; if (n < 3) continue;
    const a = pts[0], z = pts[n - 1]; if (((z[0] - a[0]) + (z[1] - a[1]) < 0) !== r.chance(0.15)) pts.reverse();   // the knife is pushed mostly one way
    const tier = r.range(0.8, 1.12);
    let i0 = 0;
    while (i0 < n - 2) {
      let i1 = i0 + Math.max(3, Math.round(r.range(1.4, 4.6) * P.sw / step)); if (i1 > n - 5) i1 = n - 1;
      const piece = pts.slice(i0, i1 + 1), m = piece.length - 1, len = m * step;
      const dip = r.chance(0.3) ? r.range(0.25, 0.75) : -1;                     // a dry stretch: the cut thins to a hair and recovers
      const ws = piece.map((p, k) => {
        let w = 0.58 + 0.88 * litAt(p[0], p[1], P.lk);
        if (dip >= 0) w *= 1 - 0.72 * Math.exp(-((k / m - dip) ** 2) / 0.012);
        return w;
      });
      gouge(g, piece, P.wh * tier, r, { t0: L.clamp(1.6 * P.wh / len, 0.03, 0.35), t1: L.clamp(r.range(3, 6) * P.wh / len, 0.06, 0.5), ws, wob: 0.1 });
      i0 = i1 + (r.chance(0.5) ? 1 : 0);
    }
  }
}

// ── the block's double border (heavy outside, thin inside) and a few stray tool marks in the uncut ground, well away from the glyph
function cutGround(g, r, P) {
  const b = P.bbox, room = Math.min(b.x0, b.y0, S - b.x1, S - b.y1);
  const e = L.clamp(room - 0.75 * P.sw, 14, 44), thin = room - e - 13 > 0.5 * P.sw + 4;
  const frame = (d, w, over) => {
    for (const [x0, y0, x1, y1] of [[d, d, S - d, d], [S - d, d, S - d, S - d], [S - d, S - d, d, S - d], [d, S - d, d, d]]) {
      const len = Math.hypot(x1 - x0, y1 - y0), end = 1 + over * r.range(0.4, 1) / len;
      let t = -over * r.range(0.4, 1) / len;
      for (;;) {
        const u = Math.min(end, t + r.range(0.18, 0.4));
        gouge(g, seg(L.lerp(x0, x1, t), L.lerp(y0, y1, t), L.lerp(x0, x1, u), L.lerp(y0, y1, u), r, 0.6), w * r.range(0.9, 1.1), r, { t0: 0.03, t1: 0.06 });
        if (u >= end) break;
        t = u - 0.005;
      }
    }
  };
  frame(e, 6, 8); if (thin) frame(e + 13, 2.3, 6);
  const keepOff = Math.max(40, 0.8 * P.sw), lo = e + (thin ? 34 : 22);
  for (let i = 0, n = 0; i < 2400 && n < 46; i++) {
    const x = r.range(lo, S - lo - 34), y = r.range(lo, S - lo), len = r.range(12, 34), an = r.range(-0.22, 0.22) + (r.chance(0.15) ? 0.6 : 0);
    const x1 = x + Math.cos(an) * len, y1 = y + Math.sin(an) * len;
    if (K.sdGlyph(x, y) < keepOff || K.sdGlyph(x1, y1) < keepOff) continue;
    gouge(g, seg(x, y, x1, y1, r, 0.4), r.range(1.8, 3.2), r, { t0: 0.2, t1: 0.4 }); n++;
  }
}

// ── what the knife left behind: thin slivers of wood standing in the heavy line, and specks of ink on the cleared wood
function leftovers(g, r, P) {
  g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.strokeStyle = '#000'; g.fillStyle = '#000';
  for (const p of K.outline({ grow: -P.wH * 0.5, spacing: 0.8 * P.sw, seed: 'g20sliver', jitter: 0.8 })) {
    if (r.chance(0.45)) continue;
    const off = r.range(-0.3, 0.3) * P.wH, len = r.range(0.15, 0.45) * P.sw, ca = Math.cos(p.tan), sa = Math.sin(p.tan);
    const x = p.x + Math.cos(p.ang) * off, y = p.y + Math.sin(p.ang) * off;
    g.globalAlpha = r.range(0.5, 0.95); g.lineWidth = L.clamp(P.wH * r.range(0.09, 0.19), 0.5, 1.5);
    g.beginPath(); g.moveTo(x - ca * len / 2, y - sa * len / 2); g.lineTo(x + ca * len / 2, y + sa * len / 2); g.stroke();
  }
  const big = 0.6 + 0.9 * Math.min(1, P.sw / 75);
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = r.range(0.25, 0.85);
    g.beginPath(); g.ellipse(r() * S, r() * S, r.range(0.4, big), r.range(0.3, big * 0.7), r() * 3, 0, TAU); g.fill();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

function buildCut(P) {
  const c = L.makeCanvas(S, S), g = c.getContext('2d'); const r = L.rng('g20cut' + P.key);
  g.fillStyle = '#fff';
  cutOutline(g, r, P); cutCompanion(g, r, P); cutHatch(g, r, P); cutGround(g, r, P); leftovers(g, r, P);
  return c;
}

// ───────────────────────── per-pixel passes (device resolution) ─────────────────────────
// where the ink did not take: dry streaks along the (horizontal) grain of the block and the tooth of the paper, gathered in
// patches and towards the block's edges; the ground right around the glyph stays well inked so that the character keeps its contrast
function dryMask(P, nz) {
  const CG = 12, cn = Math.ceil(S / CG) + 2, dryF = new Float32Array(cn * cn), keepF = new Float32Array(cn * cn);
  for (let j = 0, o = 0; j < cn; j++) for (let i = 0; i < cn; i++, o++) {
    const x = i * CG, y = j * CG, edge = Math.max(0, 1 - Math.min(x, y, S - x, S - y) / 64), sd = K.sdGlyph(x, y);
    dryF[o] = 0.55 * nz.fbm(x * 0.0045 + 11, y * 0.0045 + 5, 3) + 0.5 * edge * edge;
    keepF[o] = sd < 0 ? 0.5 : 0.3 + 0.7 * L.smooth((sd - 0.2 * P.sw) / (1.5 * P.sw));
  }
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q, v = y / CG, cj = v | 0, b = v - cj;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q, u = x / CG, ci = u | 0, a = u - ci, o = cj * cn + ci;
        const dry = (dryF[o] * (1 - a) + dryF[o + 1] * a) * (1 - b) + (dryF[o + cn] * (1 - a) + dryF[o + cn + 1] * a) * b;
        let val = dry + 0.5 * nz.n2(x * 0.0045 + 3.1, y * 0.33 + 1.7);
        if (val < -0.03) continue;                                               // cannot reach the threshold any more
        val += 0.3 * nz.n2(x * 0.021 + 9.2, y * 1.15 - 4.1) + 0.3 * nz.n2(x * 0.85 + 5.3, y * 0.85 - 3.9);
        if (val <= 0.57) continue;
        const keep = (keepF[o] * (1 - a) + keepF[o + 1] * a) * (1 - b) + (keepF[o + cn] * (1 - a) + keepF[o + cn + 1] * a) * b;
        d[k + 3] = L.smooth((val - 0.57) / 0.16) * keep * 255;
      }
    }
  });
}
// raking light from the top-left over the printed sheet: the block pressed the inked areas INTO the paper, so every white line
// stands a little proud — its lower-right edge falls into shade, the ink's edge facing the light glints; the ink film itself
// shows the tooth of the paper and the grain of the block as a faint sheen, stronger towards the light
function relief(ink, nz) {
  const src = L.getRaw(L.blurred(ink, 0.8)).data;
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const A = (i, j) => src[((j < 0 ? 0 : j >= ph ? ph - 1 : j) * pw + (i < 0 ? 0 : i >= pw ? pw - 1 : i)) * 4 + 3];
    for (let j = 0, k = 0; j < ph; j++) for (let i = 0; i < pw; i++, k += 4) {
      const x = (i + 0.5) / q, y = (j + 0.5) / q, a = src[k + 3] / 255;
      let v = -((A(i + 1, j) - A(i - 1, j)) + (A(i, j + 1) - A(i, j - 1))) * q / 510 * 0.62;   // slope of the sheet along the light
      if (a > 0.1) {
        const t = 0.6 * nz.n2(x * 0.9 + 2.3, y * 0.9 + 7.1) + 0.4 * nz.n2(x * 0.05 - 6.4, y * 2.1 + 0.8);
        v += a * (0.07 * Math.max(0, t) + 0.022 * (1 - (x + y) / (2 * S)));
      }
      if (v > 0) { d[k] = 246; d[k + 1] = 236; d[k + 2] = 216; d[k + 3] = Math.min(0.6, v) * 255; }
      else { d[k] = 30; d[k + 1] = 17; d[k + 2] = 6; d[k + 3] = Math.min(0.66, -v * 1.5) * 255; }
    }
  });
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, dsep = Math.max(3, 0.098 * sw);
  const P = {
    key: info.key, sw, bbox: info.bbox,
    wH: Math.max(2.4, 0.10 * sw),                  // the heavy outline cut
    dT: 0.185 * sw, wT: Math.max(1, 0.036 * sw),   // depth and width of the thin companion line
    m: 0.245 * sw,                                 // the hatching stays this deep inside the outline
    dsep, wh: dsep * 0.56,                         // pitch and nominal width of the hatching
    h: Math.max(1.4, 0.03 * sw), step: Math.max(3, 0.08 * sw), gp: Math.max(3, 0.08 * sw),
    maxLen: 9 * sw, minLen: 0.9 * dsep, tol: Math.max(0.6, 0.016 * sw), lk: 0.3 * sw,
  };
  const nz = L.makeNoise('g20woodcut');
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#eee5d0', tone: '#8a6a3a', seed: 'g20paper', fiber: 0.6, stain: 0.3, foxing: 0.12, edge: 0.1 }), 0, 0);

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d'); const r = L.rng('g20ink' + info.key);
  q.fillStyle = '#110e0c'; q.fillRect(0, 0, S, S);
  for (let i = 0; i < 240; i++) {                                 // uneven inking: slightly greyer, warmer patches
    const x = r() * S, y = r() * S, rr = r.range(30, 150);
    q.fillStyle = L.radial(q, x, y, 0, rr, [[0, `rgba(74,62,50,${r.range(0.03, 0.1).toFixed(3)})`], [1, 'rgba(74,62,50,0)']]);
    q.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  q.globalCompositeOperation = 'destination-out';
  q.drawImage(buildCut(P), 0, 0);
  // flying white: dry streaks along the (horizontal) wood grain, gathered in patches and towards the block's edges
  q.lineCap = 'round'; q.strokeStyle = '#000';
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S;
    const patch = 0.5 + 0.5 * Math.sin(x * 0.0061 + 1.3 + Math.sin(y * 0.004) * 1.5) * Math.sin(y * 0.0093 + 0.4 + Math.sin(x * 0.003) * 1.2);
    const edge = Math.max(0, 1 - Math.min(x, y, S - x, S - y) / 70);
    const dens = Math.max(patch * patch * patch * 0.6, edge * 0.7);
    if (r() > dens) continue;
    const len = r.range(14, 120), wv = r.range(-1.2, 1.2);
    q.globalAlpha = r.range(0.05, 0.3) * (0.5 + dens); q.lineWidth = r.range(0.5, 1.4);
    q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + len * 0.5, y + wv, x + len, y + r.range(-0.8, 0.8)); q.stroke();
  }
  q.globalAlpha = 1;
  q.drawImage(dryMask(P, nz), 0, 0);                              // the tooth of the paper / grain of the block, per device pixel
  q.globalCompositeOperation = 'source-over';

  // the oil of the ink creeps a little way into the paper around every printed edge
  const halo = L.blurred(ink, 1.1), hq = halo.getContext('2d');
  hq.globalCompositeOperation = 'source-in'; hq.fillStyle = '#4b3520'; hq.fillRect(0, 0, S, S);
  g.globalAlpha = 0.3; g.drawImage(halo, 0, 0); g.globalAlpha = 1;
  g.drawImage(ink, 0, 0);
  g.drawImage(relief(ink, nz), 0, 0);
  // the sheet as an object under one lamp: a touch brighter towards the light, falling off to the lower right
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,246,226,0.05)'], [0.45, 'rgba(255,246,226,0)'], [0.55, 'rgba(12,7,2,0)'], [1, 'rgba(12,7,2,0.22)']]);
  g.fillRect(0, 0, S, S);
  return c;
}

export default {
  name: '木刻',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                      // a 3-frame flash: perfectly still
};
