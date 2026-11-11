// plate.js — helpers for the square "collector's plate" films (1080 × 1080 logical; rendered at 2160 × 2160 with ?ss=2):
// the GLYPH every glyph plate spells (the house name 志和诚, one big character at a time or all three in a row), layouts that
// place objects along its strokes, aged papers, sprites with soft contact shadows, and a slow camera drift.
// Scene modules import this as K and core.js as L. Nothing here touches the 1920 × 1080 arc films.
import * as L from './core.js';

export const S = 1080;                                   // frame is S × S logical pixels
const TAU = Math.PI * 2;

// ═════════════════════════ the glyph ═════════════════════════
// The player calls useGlyph(key) before a plate's init() and draw(): key is '志', '和', '诚' (one character filling the frame)
// or '志和诚' (the three in a row). A plate must NOT assume which one it gets — everything below adapts to the current glyph.
const GLYPH_FONT = '"GJ WenKai"';      // 霞鹜文楷 Medium, thickened into a bold Kai so that objects can spell it
const GLYPH_WEIGHT = 0.0185;           // round thickening, as a fraction of the em
const GRID = 2160, GK = GRID / S;      // the distance field has 2 cells per logical pixel
const glyphs = new Map();
let cur = null;

function edt1d(f, n, d, v, z) {         // Felzenszwalb & Huttenlocher: 1-D squared distance transform of f[0..n)
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s;
    do { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); } while (s <= z[k] && --k >= 0);
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
function edt(inside, n, wantInside) {    // distance (in cells) from every cell to the nearest cell whose flag === wantInside
  const INF = 1e12, out = new Float32Array(n * n), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = (inside[y * n + x] === wantInside) ? 0 : INF;
    edt1d(f, n, d, v, z);
    for (let y = 0; y < n; y++) out[y * n + x] = d[y];
  }
  for (let y = 0; y < n; y++) {
    const o = y * n;
    for (let x = 0; x < n; x++) f[x] = out[o + x];
    edt1d(f, n, d, v, z);
    for (let x = 0; x < n; x++) out[o + x] = Math.sqrt(d[x]);
  }
  return out;
}
function buildGlyph(key) {
  const chars = Array.from(key), n = chars.length;
  const em = n === 1 ? 850 : Math.min(330, Math.floor((S - 96 - (n - 1) * 26) / n)), gap = n === 1 ? 0 : 26;
  const c = L.makeCanvas(GRID, GRID), g = c.getContext('2d', { willReadFrequently: true });
  g.scale(GK, GK);
  g.font = `400 ${em}px ${GLYPH_FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const m = chars.map((ch) => g.measureText(ch));
  const asc = Math.max(...m.map((t) => t.actualBoundingBoxAscent)), dsc = Math.max(...m.map((t) => t.actualBoundingBoxDescent));
  const baseY = S / 2 + (asc - dsc) / 2, total = n * em + (n - 1) * gap, x0 = S / 2 - total / 2;
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 2 * GLYPH_WEIGHT * em;
  const cells = [];
  chars.forEach((ch, i) => {
    const t = m[i], ink = t.actualBoundingBoxLeft + t.actualBoundingBoxRight;
    const cx = x0 + i * (em + gap) + em / 2, x = cx - ink / 2 + t.actualBoundingBoxLeft;       // centre the INK of each character in its cell
    g.strokeText(ch, x, baseY); g.fillText(ch, x, baseY);
    cells.push({ ch, cx, cy: S / 2, em, x0: cx - em / 2, x1: cx + em / 2 });
  });
  const data = g.getImageData(0, 0, GRID, GRID).data, inside = new Uint8Array(GRID * GRID);
  let bx0 = GRID, by0 = GRID, bx1 = 0, by1 = 0;
  for (let i = 0, y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++, i++) {
    if (data[i * 4 + 3] > 127) { inside[i] = 1; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  }
  const dOut = edt(inside, GRID, 1), dIn = edt(inside, GRID, 0), sd = dOut;                      // reuse dOut's buffer for the signed field
  for (let i = 0; i < sd.length; i++) sd[i] = (inside[i] ? -(dIn[i] - 0.5) : dOut[i] - 0.5) / GK;
  let width = 0;                                                                                 // typical stroke width: the 90th percentile of 2·depth
  { const h = []; for (let i = 0; i < sd.length; i += 37) if (sd[i] < -2) h.push(-sd[i]); h.sort((a, b) => a - b); width = h.length ? 2 * h[Math.floor(h.length * 0.9)] : 40; }
  return { key, chars: cells, em, sd, strokeWidth: width, bbox: { x0: bx0 / GK, y0: by0 / GK, x1: (bx1 + 1) / GK, y1: (by1 + 1) / GK }, contours: new Map() };
}
/** select the glyph the following K calls refer to (the player does this for you). */
export function useGlyph(key) {
  key = key || '志';
  if (!glyphs.has(key)) glyphs.set(key, buildGlyph(key));
  cur = glyphs.get(key);
  return glyphInfo();
}
const G = () => cur || (useGlyph('志'), cur);
/** { key, chars: [{ ch, cx, cy, em, x0, x1 }], em, strokeWidth (typical width of a stroke, px), bbox: { x0, y0, x1, y1 } } */
export function glyphInfo() { const f = G(); return { key: f.key, chars: f.chars, em: f.em, strokeWidth: f.strokeWidth, bbox: f.bbox }; }

/** signed distance to the glyph's outline in logical px: NEGATIVE inside the strokes, positive outside. Smooth, sub-pixel accurate. */
export function sdGlyph(x, y) {
  const f = G(); let u = x * GK - 0.5, v = y * GK - 0.5;
  if (u < 0) u = 0; else if (u > GRID - 1.001) u = GRID - 1.001;
  if (v < 0) v = 0; else if (v > GRID - 1.001) v = GRID - 1.001;
  const i = u | 0, j = v | 0, a = u - i, b = v - j, o = j * GRID + i, d = f.sd;
  return (d[o] * (1 - a) + d[o + 1] * a) * (1 - b) + (d[o + GRID] * (1 - a) + d[o + GRID + 1] * a) * b;
}
/** true if (x, y) is inside the strokes and at least `margin` px from the outline */
export const inGlyph = (x, y, margin = 0) => sdGlyph(x, y) < -margin;
/** outward unit normal of the outline near (x, y) (the gradient of the distance field) */
export function glyphNormal(x, y, h = 1.5) {
  const gx = sdGlyph(x + h, y) - sdGlyph(x - h, y), gy = sdGlyph(x, y + h) - sdGlyph(x, y - h), l = Math.hypot(gx, gy) || 1;
  return { x: gx / l, y: gy / l };
}
/** direction ALONG the stroke at (x, y), in radians (mod π): the principal axis of the glyph's ink around the point */
export function strokeAngle(x, y, radius = null) {
  const R = radius || Math.max(18, G().strokeWidth * 0.9), n = 9; let sxx = 0, syy = 0, sxy = 0, mx = 0, my = 0, w = 0; const pts = [];
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const dx = (i / n) * R, dy = (j / n) * R; if (dx * dx + dy * dy > R * R) continue;
    if (sdGlyph(x + dx, y + dy) < 0) { pts.push(dx, dy); mx += dx; my += dy; w++; }
  }
  if (w < 6) return 0;
  mx /= w; my /= w;
  for (let k = 0; k < pts.length; k += 2) { const dx = pts[k] - mx, dy = pts[k + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

// ── the outline as closed polylines (marching squares on the distance field), at any offset ──
function contours(grow = 0) {
  const f = G(), key = Math.round(grow * 4) / 4;
  if (f.contours.has(key)) return f.contours.get(key);
  const N = S + 1, val = new Float32Array(N * N);
  for (let j = 0, o = 0; j < N; j++) for (let i = 0; i < N; i++, o++) val[o] = sdGlyph(i, j) - key;
  const pt = new Map(), adj = new Map();
  const P = (i, j, horiz) => {                       // the crossing on the edge that starts at node (i, j) and runs right (horiz) or down
    const k = (j * N + i) * 2 + (horiz ? 0 : 1);
    if (!pt.has(k)) { const a = val[j * N + i], b = horiz ? val[j * N + i + 1] : val[(j + 1) * N + i], t = a / (a - b); pt.set(k, horiz ? [i + t, j] : [i, j + t]); }
    return k;
  };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const o = j * N + i, tl = val[o] < 0, tr = val[o + 1] < 0, bl = val[o + N] < 0, br = val[o + N + 1] < 0;
    const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = () => P(i, j, true), B = () => P(i, j + 1, true), Lf = () => P(i, j, false), Rt = () => P(i + 1, j, false);
    switch (c) {
      case 1: case 14: link(Lf(), B()); break;
      case 2: case 13: link(B(), Rt()); break;
      case 3: case 12: link(Lf(), Rt()); break;
      case 4: case 11: link(T(), Rt()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(Lf(), T()); break;
      case 5: case 10: {                              // saddle: decide by the centre value
        const inC = (val[o] + val[o + 1] + val[o + N] + val[o + N + 1]) / 4 < 0;
        if ((c === 5) === inC) { link(Lf(), T()); link(B(), Rt()); } else { link(Lf(), B()); link(T(), Rt()); }
        break;
      }
    }
  }
  const loops = [], seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let a = start, prev = -1;
    while (a !== undefined && !seen.has(a)) { seen.add(a); loop.push(pt.get(a)); const nb = adj.get(a); const nx = nb[0] !== prev ? nb[0] : nb[1]; prev = a; a = nx; }
    if (loop.length > 8) loops.push(loop);
  }
  f.contours.set(key, loops);
  return loops;
}
/** Path of the glyph. Fill / clip with the 'evenodd' rule (fillGlyph / clipGlyph do). opts: grow (px; > 0 fattens the strokes, < 0 thins them) */
export function glyphPath(ctx, o = {}) {
  ctx.beginPath();
  for (const loop of contours(o.grow || 0)) { ctx.moveTo(loop[0][0], loop[0][1]); for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i][0], loop[i][1]); ctx.closePath(); }
}
export function fillGlyph(ctx, style, o) { glyphPath(ctx, o); ctx.fillStyle = style; ctx.fill('evenodd'); }
export function clipGlyph(ctx, o) { glyphPath(ctx, o); ctx.clip('evenodd'); }
export function strokeGlyph(ctx, o) { glyphPath(ctx, o); ctx.stroke(); }
/** the outline as arrays of [x, y] (closed loops), e.g. to lay a rope or a row of stars along it. opts: grow */
export const glyphLoops = (o = {}) => contours(o.grow || 0);
/**
 * Evenly spaced points ALONG the outline (offset by `grow` px: negative = inside the strokes), for objects that hug the edge.
 * Returns [{ x, y, ang (direction pointing OUT of the stroke, rad), tan (direction along the outline), loop, i }].
 */
export function outline({ grow = 0, spacing = 40, seed = 'outline', jitter = 0 } = {}) {
  const r = L.rng(seed + G().key), out = [];
  contours(grow).forEach((loop, li) => {
    let len = 0; const seg = [];
    for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); len += l; }
    const n = Math.max(1, Math.round(len / spacing)); if (len < spacing * 0.6) return;
    const step = len / n; let target = r() * step, acc = 0, k = 0;
    for (let i = 0; i < loop.length && k < n; i++) {
      while (acc + seg[i] >= target && k < n) {
        const t = (target - acc) / (seg[i] || 1), a = loop[i], b = loop[(i + 1) % loop.length];
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, nn = glyphNormal(x, y);
        out.push({ x, y, ang: Math.atan2(nn.y, nn.x), tan: Math.atan2(b[1] - a[1], b[0] - a[0]), loop: li, i: out.length });
        k++; target += step * (1 + (r() - 0.5) * jitter);
      }
      acc += seg[i];
    }
  });
  return out;
}
/**
 * THE way to make objects spell the glyph: pack discs into its strokes, biggest first. The biggest discs end up on the centre
 * line of each stroke, each one as wide as the stroke (like beads on a string); smaller ones fill what is left.
 *   rmax / rmin  largest / smallest disc radius (default: half the stroke width … a quarter of that)
 *   gap          1 = discs just touch; 0.9 lets them overlap a little (denser); 1.1 leaves air
 *   margin       keep this far inside the outline (use a negative value to let objects stick out a little)
 * Returns [{ x, y, r, ang (direction ALONG the stroke, rad), i }], largest first. Draw the small ones first if objects overlap.
 */
export function pack({ seed = 'pack', rmax = null, rmin = null, gap = 1, margin = 0, max = 4000 } = {}) {
  const f = G(), R1 = rmax || f.strokeWidth * 0.5, R0 = rmin || Math.max(6, R1 * 0.28), r = L.rng(seed + f.key);
  const pitch = Math.max(2.5, R0 * 0.45), cand = [], b = f.bbox;
  for (let y = b.y0; y <= b.y1; y += pitch) for (let x = b.x0; x <= b.x1; x += pitch) {
    let px = x + (r() - 0.5) * pitch, py = y + (r() - 0.5) * pitch, d = -sdGlyph(px, py) - margin;
    if (d < R0 * 0.6) continue;
    for (let k = 0; k < 4 && d < R1; k++) {                       // climb toward the centre line of the stroke
      const nn = glyphNormal(px, py, 2), qx = px - nn.x * 1.5, qy = py - nn.y * 1.5, d2 = -sdGlyph(qx, qy) - margin;
      if (d2 <= d) break; px = qx; py = qy; d = d2;
    }
    if (d >= R0) cand.push({ x: px, y: py, r: Math.min(R1, d), k: r() });
  }
  cand.sort((p, q) => (q.r - p.r) || (p.k - q.k));
  const cell = R1 * 2 + 1, hash = new Map(), out = [];
  const near = (p) => {
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const list = hash.get((cx + i) * 4096 + cy + j); if (!list) continue;
      for (const q of list) if (Math.hypot(q.x - p.x, q.y - p.y) < (q.r + p.r) * gap) return true;
    }
    return false;
  };
  for (const p of cand) {
    if (out.length >= max) break;
    if (near(p)) continue;
    const key = Math.floor(p.x / cell) * 4096 + Math.floor(p.y / cell);
    (hash.get(key) || hash.set(key, []).get(key)).push(p);
    out.push({ x: p.x, y: p.y, r: p.r, ang: strokeAngle(p.x, p.y, Math.max(p.r * 1.7, 16)), i: out.length });
  }
  return out;
}
/** an alpha mask of the glyph at device resolution (white inside), e.g. for 'destination-in'. opts: grow, feather (px of soft edge) */
export function glyphMask(o = {}) {
  const { grow = 0, feather = 0 } = o;
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const soft = Math.max(feather, 0.75 / q);
    for (let j = 0, k = 0; j < ph; j++) for (let i = 0; i < pw; i++, k += 4) {
      const a = L.clamp(0.5 - (sdGlyph((i + 0.5) / q, (j + 0.5) / q) - grow) / (2 * soft));
      d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = a * 255;
    }
  });
}

// ═════════════════════════ the coin shape (for plates that show an actual coin, not the glyph) ═════════════════════════
export const COIN = Object.freeze({ cx: 540, cy: 540, R: 360, a: 128 });   // a = HALF the side of the square hole
export const GLYPH = COIN;                                                 // old name, kept for the slow plates written before the switch
/** Path of a square-holed round coin (disc of radius R with an axis-aligned square hole). Fill / clip with 'evenodd'. opts: cx, cy, R, a, grow, corner */
export function coinPath(ctx, o = {}) {
  const { cx, cy, R, a } = { ...COIN, ...o };
  const grow = o.grow || 0;
  const h = Math.max(1, a - grow), r = Math.min(o.corner === undefined ? 5 : o.corner, h);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, R + grow), 0, TAU);
  ctx.moveTo(cx - h, cy - h + r);
  ctx.lineTo(cx - h, cy + h - r); ctx.quadraticCurveTo(cx - h, cy + h, cx - h + r, cy + h);
  ctx.lineTo(cx + h - r, cy + h); ctx.quadraticCurveTo(cx + h, cy + h, cx + h, cy + h - r);
  ctx.lineTo(cx + h, cy - h + r); ctx.quadraticCurveTo(cx + h, cy - h, cx + h - r, cy - h);
  ctx.lineTo(cx - h + r, cy - h); ctx.quadraticCurveTo(cx - h, cy - h, cx - h, cy - h + r);
  ctx.closePath();
}
export function fillCoin(ctx, style, o) { coinPath(ctx, o); ctx.fillStyle = style; ctx.fill('evenodd'); }
export function clipCoin(ctx, o) { coinPath(ctx, o); ctx.clip('evenodd'); }
/** signed distance to the coin shape: negative inside the coin's body, positive in the hole and outside the disc */
export function sdCoin(x, y, o = {}) {
  const { cx, cy, R, a } = { ...COIN, ...o };
  return Math.max(Math.hypot(x - cx, y - cy) - R, a - Math.max(Math.abs(x - cx), Math.abs(y - cy)));
}
export const inCoin = (x, y, margin = 0, o) => sdCoin(x, y, o) < -margin;
/** n slots on a circle of radius r. Each: { x, y, ang (direction pointing away from the centre, rad), i, u } */
export function ringSlots({ n, r, seed = 'ring', jitter = 0, phase = null, cx = COIN.cx, cy = COIN.cy }) {
  const rnd = L.rng(seed); const ph = phase === null ? rnd() * TAU : phase; const out = [];
  for (let i = 0; i < n; i++) {
    const t = ph + (i / n) * TAU + (rnd() - 0.5) * jitter * (TAU / n);
    const rr = r + (rnd() - 0.5) * jitter * 14;
    out.push({ x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr, ang: t, i, u: i / n, row: 'ring' });
  }
  return out;
}

// ───────────────────────── papers ─────────────────────────
/** aged paper, S × S (or opts.size). opts: base, tone (stain colour), seed, fiber, stain, grain, edge (0..1 darkened edges), foxing (0..1) */
export function paper(o = {}) {
  const { base = '#efe6d3', tone = '#8a6a3a', seed = 'paper', fiber = 0.5, stain = 0.35, grain = 0.2, edge = 0.22, foxing = 0.25, size = S } = o;
  const c = L.paperTex(size, size, { base, seed, tone, fiber, stain, grain });
  const g = c.getContext('2d'); const r = L.rng(seed + 'fx');
  // foxing: a few soft rust-brown spots, mostly near the edges
  const n = Math.round(foxing * 60);
  for (let i = 0; i < n; i++) {
    const ang = r() * TAU, rad = size * (0.25 + 0.5 * Math.sqrt(r()));
    const x = size / 2 + Math.cos(ang) * rad, y = size / 2 + Math.sin(ang) * rad, rr = r.range(1.2, 6) * (r() < 0.12 ? 2.4 : 1);
    g.fillStyle = L.radial(g, x, y, 0, rr, [[0, L.rgba(tone, r.range(0.10, 0.28))], [1, L.rgba(tone, 0)]]);
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // long loose fibres
  g.lineCap = 'round';
  for (let i = 0; i < Math.round(fiber * 90); i++) {
    const x = r() * size, y = r() * size, len = r.range(14, 60), a = r() * TAU, bend = r.range(-0.6, 0.6);
    g.strokeStyle = L.rgba(r() < 0.5 ? '#ffffff' : tone, r.range(0.05, 0.14)); g.lineWidth = r.range(0.6, 1.3);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  if (edge > 0) {
    g.fillStyle = L.radial(g, size / 2, size / 2, size * 0.42, size * 0.8, [[0, L.rgba(tone, 0)], [1, L.rgba(tone, edge)]]);
    g.fillRect(0, 0, size, size);
  }
  return c;
}
/** squared paper (used by the title cards and available to plates). opts: base, line, step, seed, lineAlpha + paper opts */
export function gridPaper(o = {}) {
  const { line = '#b9b09a', step = 54, seed = 'grid', lineAlpha = 0.5, size = S } = o;   // offset: where the first line sits (default step / 2)
  const c = paper({ foxing: 0.1, edge: 0.12, ...o, seed, size }); const g = c.getContext('2d'); const r = L.rng(seed + 'g');
  const off = o.offset === undefined ? step * 0.5 : o.offset;
  for (let k = -1; k <= size / step + 1; k++) {
    for (const vertical of [false, true]) {
      const p = off + k * step + r.range(-0.4, 0.4);
      g.strokeStyle = L.rgba(line, lineAlpha * r.range(0.65, 1)); g.lineWidth = r.range(0.9, 1.5);
      g.beginPath();
      for (let t = 0; t <= size; t += 36) {
        const w = Math.sin(t * 0.011 + k) * 0.5 + r.range(-0.25, 0.25);
        if (vertical) (t ? g.lineTo(p + w, t) : g.moveTo(p + w, t)); else (t ? g.lineTo(t, p + w) : g.moveTo(t, p + w));
      }
      g.stroke();
    }
  }
  return c;
}

// ───────────────────────── sprites ─────────────────────────
/** a w × h canvas whose context is translated to its centre: draw(g, w, h) paints one object around (0, 0) */
export function sprite(w, h, draw) {
  const c = L.makeCanvas(w, h); const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  if (draw) draw(g, c.width, c.height);
  return c;
}
/** put a sprite on the page, centred at (x, y). opts: rot, scale, alpha, flip, shadow ({ dx, dy, blur, color } or false).
 *  The shadow is cast in page space (light from the top-left by default), whatever the sprite's rotation. */
export function stamp(ctx, spr, x, y, o = {}) {
  const { rot = 0, scale = 1, alpha = 1, flip = false } = o;
  const sh = o.shadow === false ? null : { dx: 4, dy: 7, blur: 9, color: 'rgba(45,28,12,0.36)', ...(o.shadow || {}) };
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (sh) { ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur; ctx.shadowOffsetX = sh.dx; ctx.shadowOffsetY = sh.dy; }
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(flip ? -scale : scale, scale);
  ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
  ctx.restore();
}
/** multiply a paper (or any texture) over what is already on a canvas, only where it has pixels — makes printed ink sit IN the paper */
export function soak(layer, tex, alpha = 0.6, blend = 'multiply') {
  const tmp = L.makeCanvas(layer.width, layer.height); const t = tmp.getContext('2d');
  t.drawImage(tex, 0, 0, layer.width, layer.height);
  t.globalCompositeOperation = 'destination-in'; t.drawImage(layer, 0, 0);
  const g = layer.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha; g.globalCompositeOperation = blend; g.drawImage(tmp, 0, 0); g.restore();
  return layer;
}
/** rub tiny holes into printed ink (worn litho / letterpress). amount 0..1 */
export function wear(layer, { seed = 'wear', amount = 0.3, size = 1.6 } = {}) {
  const g = layer.getContext('2d'); const r = L.rng(seed); const n = Math.round(layer.width * layer.height * 0.00035 * amount * 10);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    g.globalAlpha = r.range(0.15, 0.7);
    g.beginPath(); g.ellipse(r() * layer.width, r() * layer.height, r.range(0.4, size), r.range(0.4, size * 0.7), r() * 3, 0, TAU); g.fill();
  }
  g.restore(); return layer;
}

// ───────────────────────── camera ─────────────────────────
/** draw a pre-rendered layer (any size ≥ S; its centre is the pivot) with a slow move. o: z0, z1 (zoom), x0, y0, x1, y1 (px offset of the
 *  layer centre from the frame centre), r0, r1 (rad), ease. Keep zoom within 0.96–1.06 so the layer is shown at ≈1:1 and stays crisp. */
export function drift(ctx, layer, p, o = {}) {
  const { z0 = 1, z1 = 1.04, x0 = 0, y0 = 0, x1 = 0, y1 = 0, r0 = 0, r1 = 0, ease = null } = o;
  const t = ease ? ease(p) : p; const z = L.lerp(z0, z1, t);
  ctx.save();
  ctx.translate(S / 2 + L.lerp(x0, x1, t), S / 2 + L.lerp(y0, y1, t)); ctx.rotate(L.lerp(r0, r1, t)); ctx.scale(z, z);
  ctx.drawImage(layer, -layer.width / 2, -layer.height / 2);
  ctx.restore();
}
/** preview overlay: the outline of the current glyph, which every glyph plate has to hit */
export function guide(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,0,255,0.9)'; ctx.lineWidth = 2.5; glyphPath(ctx); ctx.stroke();
  ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(0,255,255,0.7)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, S - 80, S - 80);
  ctx.restore();
}
