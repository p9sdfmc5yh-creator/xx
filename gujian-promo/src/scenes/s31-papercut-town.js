// s31 — 剪纸拼贴·水乡. A hand-made paper collage of a Jiangnan water town.
// Cream card above; the arc is the torn top edge of one big sheet of indigo paper (white core showing along the tear).
// On the blue sheet: white-wall / black-roof houses, a pale moon, a brown stone-arch bridge with a boat under it,
// a willow, a few red lanterns and a scrap of pencil hatching — every scrap is its own piece of paper with fibre,
// a thin lit edge and a soft drop shadow, stacked in a clear order.
import * as L from '../lib/core.js';

const { W, H, TAU } = L;
const PAD = 240;
const GW = W + PAD * 2, GH = H + PAD * 2;
let S = null;

const C = {
  card: '#f6b8b2', cardShade: '#9a3f3c', blue: '#1d4995', white: '#faf7ee', black: '#1c1b1a', moon: '#f2e27a',
  red: '#c8261c', green: '#3f9a54', brown: '#623419',
};

// ───────────────────────── shared paper textures (grey, 128 = neutral) ─────────────────────────
function buildTextures() {
  // 1) grain: sugar paper seen close — matte and flat (no embossing), speckled with pulp flecks, clouded by its formation,
  //    and full of loose fibres lying every which way (each long one throws a hair of shadow)
  const grain = L.makeCanvas(GW, GH); const g = grain.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(L.noiseTex(GW, GH, { seed: 's31pulp', scale: 3.4, octaves: 2, gain: 0.55, res: 0.6, contrast: 1.55, ramp: [[0, '#5a5a5a'], [0.5, '#808080'], [1, '#a6a6a6']] }), 0, 0);
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.75; g.drawImage(L.noiseTex(GW, GH, { seed: 's31mot', scale: 240, octaves: 3, res: 0.1, contrast: 1.3, ramp: [[0, '#666666'], [1, '#9a9a9a']] }), 0, 0);
  g.globalAlpha = 0.7; g.drawImage(L.noiseTex(GW, GH, { seed: 's31form', scale: 24, octaves: 2, res: 0.25, contrast: 1.35, ramp: [[0, '#6c6c6c'], [1, '#949494']] }), 0, 0);
  g.globalAlpha = 0.5; g.fillStyle = g.createPattern(L.grainTex(512, 512, { seed: 's31fine', amount: 0.2 }), 'repeat'); g.fillRect(0, 0, GW, GH);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const r = L.rng('s31fib'); g.lineCap = 'round';
  const fibre = (x, y, len, a, bend, w, col) => {
    const mx = x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, my = y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend;
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  };
  // pulp flecks and stubs
  for (let i = 0; i < 26000; i++) {
    const light = r.chance(0.56);
    fibre(r() * GW, r() * GH, r.range(1.5, 8), r() * Math.PI, r.range(-1.5, 1.5), r.range(0.6, 1.5), light ? `rgba(255,255,255,${r.range(0.07, 0.3).toFixed(3)})` : `rgba(0,0,0,${r.range(0.06, 0.24).toFixed(3)})`);
  }
  // fibres
  for (let i = 0; i < 9000; i++) {
    const x = r() * GW, y = r() * GH, len = r.range(9, 34), a = r() * Math.PI, bend = r.range(-0.22, 0.22) * len, w = r.range(0.6, 1.25);
    if (r.chance(0.66)) {
      const al = r.range(0.14, 0.42);
      g.save(); g.translate(0.8, 1.0); fibre(x, y, len, a, bend, w + 0.3, `rgba(0,0,0,${(al * 0.42).toFixed(3)})`); g.restore();
      fibre(x, y, len, a, bend, w, `rgba(255,255,255,${al.toFixed(3)})`);
    } else fibre(x, y, len, a, bend, w, `rgba(0,0,0,${r.range(0.08, 0.26).toFixed(3)})`);
  }
  // the odd long hair
  for (let i = 0; i < 620; i++) {
    const x = r() * GW, y = r() * GH, len = r.range(40, 120), a = r() * Math.PI, bend = r.range(-0.3, 0.3) * len, w = r.range(0.55, 1.0), al = r.range(0.16, 0.4);
    g.save(); g.translate(0.8, 1.0); fibre(x, y, len, a, bend, w + 0.3, `rgba(0,0,0,${(al * 0.4).toFixed(3)})`); g.restore();
    fibre(x, y, len, a, bend, w, `rgba(255,255,255,${al.toFixed(3)})`);
  }
  // 2) crumple: flat-shaded voronoi facets with a thin lit crease between them (paper that was creased, then flattened)
  const res = 0.25, cw = Math.round(GW * res), ch = Math.round(GH * res);
  const nz = L.makeNoise('s31crumple');
  const img = new ImageData(cw, ch); const d = img.data;
  let k = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const u0 = x / res / 210, v0 = y / res / 210;
    const u = u0 + 0.32 * nz.n2(u0 * 0.8 + 3.1, v0 * 0.8), v = v0 + 0.32 * nz.n2(u0 * 0.8 - 5.2, v0 * 0.8 + 9.4);
    const c1 = nz.cell(u, v), c2 = nz.cell(u * 2.4 + 11.3, v * 2.4 + 7.1);
    let s = 128 + (c1.id - 0.5) * 64 + (c2.id - 0.5) * 30;
    s += 13 * Math.exp(-(c1.edge * c1.edge) / 0.0016) + 6 * Math.exp(-(c2.edge * c2.edge) / 0.003);
    d[k++] = s; d[k++] = s; d[k++] = s; d[k++] = 255;
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  const crumple = L.makeCanvas(GW, GH); const cg = crumple.getContext('2d');
  cg.imageSmoothingQuality = 'high'; cg.filter = 'blur(1.4px)';
  cg.drawImage(small, 0, 0, GW, GH);
  return { grain, crumple };
}

// ───────────────────────── geometry helpers ─────────────────────────
function dens(pts, step = 12) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < n; j++) out.push([L.lerp(a[0], b[0], j / n), L.lerp(a[1], b[1], j / n)]);
  }
  return out;
}
/** scissor-cut outline: the polygon, densified, with a slow wander of a pixel or two (amp) — or a ragged tear (torn) */
function cut(pts, seed, amp = 1.5, period = 95, step = 12, torn = 0) {
  const d = dens(pts, torn ? 3.5 : step); const n = d.length; const nz = L.makeNoise('s31cut' + seed);
  const len = [0];
  for (let i = 1; i <= n; i++) len.push(len[i - 1] + Math.hypot(d[i % n][0] - d[i - 1][0], d[i % n][1] - d[i - 1][1]));
  const total = len[n];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = d[(i - 1 + n) % n], b = d[(i + 1) % n];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const s = len[i]; const win = L.smooth(Math.min(s, total - s) / 30);
    let o = amp * nz.n2(s / period, 1.7) + amp * 0.35 * nz.n2(s / (period * 0.2), 8.3);
    if (torn) o += torn * (nz.n2(s / 13, 4.4) + 0.6 * nz.n2(s / 4.6, 6.1));
    out.push([d[i][0] + nx * o * win, d[i][1] + ny * o * win]);
  }
  return out;
}
/**
 * hand-torn outline: `skin` is the ragged coloured face, `core` the white heart of the paper that shows beyond it
 * wherever the tear ran at a slant (fringe px at most; long stretches show none at all)
 */
function tear(pts, seed, rag = 1.5, fringe = 3.2) {
  const d = dens(pts, 3); const n = d.length; const nz = L.makeNoise('s31rip' + seed);
  let area = 0; const len = [0];
  for (let i = 0; i < n; i++) { const a = d[i], b = d[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; len.push(len[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const sg = area > 0 ? -1 : 1, total = len[n];      // → normals point out of the piece
  const skin = [], core = [];
  for (let i = 0; i < n; i++) {
    const a = d[(i - 1 + n) % n], b = d[(i + 1) % n];
    let nx = -(b[1] - a[1]) * sg, ny = (b[0] - a[0]) * sg; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const s = len[i], win = L.smooth(Math.min(s, total - s) / 24);
    const o = rag * win * (0.9 * nz.n2(s / 41, 1.7) + 0.65 * nz.n2(s / 10, 4.4) + 0.4 * nz.n2(s / 3.3, 6.1));
    const f = win * (Math.max(0, 0.1 + nz.n2(s / 52, 9.3) + 0.45 * nz.n2(s / 12, 2.2)) * fringe + 0.45 * (0.5 + 0.5 * nz.n2(s / 2.8, 5.5)));
    skin.push([d[i][0] + nx * o, d[i][1] + ny * o]);
    core.push([d[i][0] + nx * (o + f), d[i][1] + ny * (o + f), nx, ny, f]);
  }
  return { skin, core };
}
function chaikin(pts, k = 0.22) {
  const out = []; const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    out.push([L.lerp(a[0], b[0], k), L.lerp(a[1], b[1], k)], [L.lerp(a[0], b[0], 1 - k), L.lerp(a[1], b[1], 1 - k)]);
  }
  return out;
}
/** a circle the way scissors make it: a many-sided polygon with softened corners */
function roundish(cx, cy, rx, ry, n, seed) {
  const r = L.rng('s31round' + seed); const pts = [];
  const a0 = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + r.range(-0.2, 0.2)) / n) * TAU; const q = r.range(0.965, 1.03);
    pts.push([cx + rx * q * Math.cos(a), cy + ry * q * Math.sin(a)]);
  }
  return chaikin(pts, 0.2);
}
/** tapered strip along a centre line: pts [[x,y]...] (smoothed), wf(t) → full width */
function strip(ctrl, wf, step = 8) {
  const p = L.smoothPath(ctrl, step); const n = p.length; const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const hw = wf(i / (n - 1)) / 2;
    A.push([p[i][0] + nx * hw, p[i][1] + ny * hw]); B.push([p[i][0] - nx * hw, p[i][1] - ny * hw]);
  }
  return A.concat(B.reverse());
}
const quad = (p0, p1, p2, n = 14) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); } return o; };

// ───────────────────────── one piece of paper ─────────────────────────
let T = null;       // textures
let pieceNo = 0;
const SH = (al) => `rgba(5,8,24,${Math.max(0, al).toFixed(3)})`;
/**
 * Glue a piece of paper onto the layer. polys = one closed polyline or several (even-odd → holes).
 * o: color, sh (shadow strength), lift (how far the piece stands off the sheet), tex (fibre strength),
 *    crumple (0..1), edge (lit/shaded rim strength), curl (0..1 light falling across the piece),
 *    peel [[x,y,r]…] corners that have come unstuck, core (outline from tear(): the white heart of a torn piece),
 *    loose (0..1 how much one side of the piece stands off the sheet → its shadow opens up along that side)
 */
function paper(g, polys, o) {
  if (typeof polys[0][0] === 'number') polys = [polys];
  const { color, sh = 1, lift = 1, tex = 0.42, crumple = 0, edge = 1, curl = 1, peel = null, core = null, loose = 1 } = o;
  const r = L.rng('s31pp' + (o.seed !== undefined ? o.seed : pieceNo++));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of polys) for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 + 6, hh = (y1 - y0) / 2 + 6;
  const trace = (pp) => {
    g.beginPath();
    for (const p of pp) { g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }
  };
  const build = () => trace(polys);
  const outline = () => trace(core ? [core] : polys);       // the silhouette that throws the shadow
  // a corner that has come unstuck: a deeper, softer shadow under it …
  if (peel) for (const [px, py, pr] of peel) {
    g.save(); g.filter = 'blur(7px)'; g.translate(9, 14);
    g.fillStyle = L.radial(g, px - 9, py - 14, 0, pr, [[0, SH(0.52)], [0.5, SH(0.26)], [1, SH(0)]]);
    outline(); g.fill('evenodd'); g.restore();
  }
  // … and one side of every piece is never quite stuck down: along it the shadow opens up, toward the glued side it closes
  const la = L.deg(r.range(5, 85)), ldx = Math.cos(la), ldy = Math.sin(la), lrad = Math.abs(ldx) * hw + Math.abs(ldy) * hh;
  if (loose > 0 && lift >= 0.3 && Math.min(hw, hh) > 14) {
    const k = lift * loose;
    g.save(); g.filter = `blur(${(2.2 + 2.6 * k).toFixed(1)}px)`; g.translate(4.5 * k, 8 * k);
    g.fillStyle = L.linear(g, cx - ldx * lrad * 0.5 - 4.5 * k, cy - ldy * lrad * 0.5 - 8 * k, cx + ldx * lrad - 4.5 * k, cy + ldy * lrad - 8 * k, [[0, SH(0)], [0.55, SH(0.16 * sh)], [1, SH(0.42 * sh)]]);
    outline(); g.fill('evenodd'); g.restore();
  }
  // the shadow proper: a wide faint penumbra, the cast shadow, and a tight dark line where paper meets paper
  g.save();
  g.fillStyle = core ? '#f6f3ea' : color;
  g.shadowColor = SH(0.15 * sh); g.shadowBlur = 12 * lift; g.shadowOffsetX = 2.5 * lift; g.shadowOffsetY = 5 * lift;
  outline(); g.fill('evenodd');
  g.shadowColor = SH(0.36 * sh); g.shadowBlur = 0.8 + 3.2 * lift; g.shadowOffsetX = 0.6 + 2.2 * lift; g.shadowOffsetY = 1 + 3.8 * lift;
  outline(); g.fill('evenodd');
  g.shadowColor = SH(0.5 * sh); g.shadowBlur = 1.3; g.shadowOffsetX = 0.8; g.shadowOffsetY = 1.5;
  outline(); g.fill('evenodd');
  g.restore();
  const place = (texCanvas, alpha, mode) => {
    let k = r.int(0, 3); if ((k & 1) && (hw > GH / 2 - 12 || hh > GW / 2 - 12)) k -= 1;
    const aw = (k & 1 ? GH : GW) / 2, ah = (k & 1 ? GW : GH) / 2;
    const ox = r.range(-1, 1) * Math.max(0, aw - hw), oy = r.range(-1, 1) * Math.max(0, ah - hh);
    g.save(); g.globalCompositeOperation = mode; g.globalAlpha = alpha;
    g.translate(cx + ox, cy + oy); g.rotate((k * Math.PI) / 2); if (r.chance(0.5)) g.scale(-1, 1);
    g.drawImage(texCanvas, -GW / 2, -GH / 2);
    g.restore();
  };
  if (core) {
    // the torn heart: white pulp, thinning to nothing at its outer edge, whiskers standing off it; then the coloured face on top
    g.save(); outline(); g.clip(); place(T.grain, 0.5, 'hard-light'); g.restore();
    const rf = L.rng('s31ripfz' + r.int(0, 99999)); g.save(); g.lineCap = 'round';
    for (let i = 0; i < core.length; i++) {
      const q = core[i]; if (!rf.chance(0.16 + 0.22 * Math.min(1, q[4] / 2))) continue;
      const a = Math.atan2(q[3], q[2]) + rf.gauss() * 0.8, len = rf.range(1, 2.2 + Math.min(3, q[4]));
      g.strokeStyle = `rgba(255,254,248,${rf.range(0.3, 0.85).toFixed(3)})`; g.lineWidth = rf.range(0.5, 1.0);
      g.beginPath(); g.moveTo(q[0] - q[2] * 0.8, q[1] - q[3] * 0.8); g.lineTo(q[0] + Math.cos(a) * len, q[1] + Math.sin(a) * len); g.stroke();
    }
    g.restore();
    g.fillStyle = color; build(); g.fill('evenodd');
  }
  // everything else stays inside the piece
  g.save(); build(); g.clip('evenodd');
  if (crumple > 0) place(T.crumple, crumple, 'hard-light');
  if (tex > 0) place(T.grain, tex, 'hard-light');
  if (curl > 0) {
    // the sheet is never perfectly flat: light falls off across it, and the loose side tips up toward the lamp
    const a = L.deg(48) + r.range(-0.6, 0.6), rad = Math.hypot(hw, hh);
    const dx = Math.cos(a) * rad, dy = Math.sin(a) * rad;
    const pc = L.parseColor(color); const lum = (0.299 * pc[0] + 0.587 * pc[1] + 0.114 * pc[2]) / 255;
    g.fillStyle = L.linear(g, cx - dx, cy - dy, cx + dx, cy + dy, [[0, `rgba(255,252,240,${(0.11 * curl * (0.3 + 0.7 * lum)).toFixed(3)})`], [0.45, 'rgba(255,252,240,0)'], [0.6, 'rgba(0,0,20,0)'], [1, `rgba(0,0,20,${(0.11 * curl).toFixed(3)})`]]);
    g.fillRect(x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16);
  }
  // … and the lifted corner itself turns toward the light
  if (peel) for (const [px, py, pr] of peel) {
    g.fillStyle = L.radial(g, px, py, 0, pr * 0.85, [[0, 'rgba(255,255,250,0.22)'], [0.6, 'rgba(255,255,250,0.07)'], [1, 'rgba(255,255,250,0)']]);
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  if (edge > 0) {
    // paper thickness: the cut edge catches a hairline of light on the upper-left and falls into shade on the lower-right
    g.lineJoin = 'round';
    g.save(); g.lineWidth = 1.4; g.translate(0.8, 1.1); g.strokeStyle = `rgba(255,255,255,${(0.46 * edge).toFixed(3)})`; build(); g.stroke(); g.restore();
    g.save(); g.lineWidth = 1.8; g.translate(-1.0, -1.4); g.strokeStyle = `rgba(0,0,10,${(0.2 * edge).toFixed(3)})`; build(); g.stroke(); g.restore();
  }
  g.restore();
}

// ───────────────────────── shapes ─────────────────────────
const box = (x0, y0, x1, y1, r, j = 5) => [[x0 + r.range(-j, j), y0 + r.range(-j, j)], [x1 + r.range(-j, j), y0 + r.range(-j, j)], [x1 + r.range(-j, j), y1], [x0 + r.range(-j, j), y1]];

/** front-facing tiled roof: a black trapezoid whose eave (bottom edge) is cut into a row of scallops (the tile ends) */
function eaveRoof(tl, tr, br, bl, n) {
  const pts = [tl, tr, br];
  const ex = (bl[0] - br[0]) / n, ey = (bl[1] - br[1]) / n; const seg = Math.hypot(ex, ey), rad = seg / 2;
  const ux = ex / seg, uy = ey / seg; const nx = uy, ny = -ux; // points "down" for a right-to-left edge
  for (let i = 0; i < n; i++) {
    const mx = br[0] + ex * (i + 0.5), my = br[1] + ey * (i + 0.5);
    for (let k = 1; k <= 6; k++) { const a = (k / 7) * Math.PI; pts.push([mx - ux * rad * Math.cos(a) - nx * rad * 0.82 * Math.sin(a), my - uy * rad * Math.cos(a) - ny * rad * 0.82 * Math.sin(a)]); }
    pts.push([br[0] + ex * (i + 1), br[1] + ey * (i + 1)]);
  }
  return pts;
}

/** stone arch bridge in side view: flat crown, stepped approaches, near-semicircular opening open to the water */
function bridgeShape(cx, yb, apexY, R0) {
  const r = L.rng('s31bridge'); const n = 12, half = 86, run = 39, total = 264;
  const f = (t) => 0.45 * t + 0.55 * (3 * t * t - 2 * t * t * t);
  const side = (sgn) => {
    const pts = [[cx + sgn * half, apexY + r.range(-1.5, 1.5)]]; let x = cx + sgn * half;
    for (let i = 1; i <= n; i++) {
      const y = apexY + total * f(i / n) + r.range(-1.6, 1.6);
      pts.push([x + r.range(-1.2, 1.2), y]);
      x += sgn * (run + r.range(-2.5, 2.5));
      pts.push([x, y + r.range(-1.2, 1.2)]);
    }
    pts.push([x + sgn * 7, yb]);
    return pts;
  };
  const left = side(-1).reverse(), right = side(1);
  const cyA = yb - 12; const nz = L.makeNoise('s31arch');
  const rad = (ph) => R0 * (1 + 0.011 * nz.n2(ph * 1.4, 2.2));
  const arch = [[cx + rad(0), yb]];
  for (let i = 0; i <= 44; i++) { const ph = (i / 44) * Math.PI; arch.push([cx + rad(ph) * Math.cos(ph), cyA - rad(ph) * Math.sin(ph)]); }
  arch.push([cx - rad(Math.PI), yb]);
  // voussoir ring: a lighter strip glued round the opening
  const ring = [];
  for (let i = 0; i <= 44; i++) { const ph = (i / 44) * Math.PI; ring.push([cx + rad(ph) * Math.cos(ph), cyA - rad(ph) * Math.sin(ph)]); }
  ring.unshift([cx + rad(0), yb]); ring.push([cx - rad(Math.PI), yb]);
  const outer = [];
  for (let i = 44; i >= 0; i--) { const ph = (i / 44) * Math.PI; const q = rad(ph) + 31 + 2.5 * nz.n2(ph * 2.3, 9.9); outer.push([cx + q * Math.cos(ph), cyA - q * Math.sin(ph)]); }
  outer.unshift([cx - rad(Math.PI) - 31, yb]); outer.push([cx + rad(0) + 31, yb]);
  return { body: left.concat(right, arch), ring: ring.concat(outer), cyA, rad };
}

// ───────────────────────── the collage ─────────────────────────
function buildCollage(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    // ── the torn edge of the big blue sheet ──
    // The tear wanders a few px about the arc. The blue face (drB) stops ragged; here and there it has peeled back (bite)
    // and the white heart of the paper (drW) runs on past it — a hairline for long stretches, a feathered band elsewhere.
    const nz = L.makeNoise('s31tear');
    const s = a.span(PAD + 170); const n = Math.ceil((2 * s * a.R) / 1.5);
    const eB = [], eW = [], eT = [], prof = [];
    for (let i = 0; i <= n; i++) {
      const th = L.lerp(-s, s, i / n), al = th * a.R;
      const wander = 2.0 * nz.fbm(al / 74, 1.3, 3) + 1.0 * nz.n2(al / 8.5, 7.7) + 0.55 * nz.n2(al / 2.9, 5.1) + 1.5 * (L.smooth(0.5 + 3.5 * nz.n2(al / 230, 21.3)) - 0.5);
      const bite = 6.5 * L.smooth((nz.n2(al / 150, 4.2) - 0.3) / 0.6) + 3.2 * Math.max(0, nz.n2(al / 34, 9.1) - 0.45);
      const fr = Math.max(0, 0.22 + nz.n2(al / 96, 12.1) + 0.5 * nz.n2(al / 23, 3.3));
      const fringe = 0.35 + 3.4 * fr + (0.5 + 0.5 * nz.n2(al / 3.4, 8.8)) * Math.min(1.1, 0.25 + fr * 2.2);
      const drB = Math.max(-6.5, wander - 0.4 - bite);
      const drW = Math.min(6.5, Math.max(drB + 0.3, wander + fringe));
      const wd = drW - drB;                                              // width of exposed white
      const drT = drW + Math.min(1, wd / 3) * (0.9 + 1.5 * (0.5 + 0.5 * nz.n2(al / 5.3, 15.5)) + 0.8 * nz.n2(al / 1.9, 2.6));   // the last thin veil of pulp
      const pb = a.pt(th, drB), pw = a.pt(th, drW), pt = a.pt(th, drT);
      eB.push([pb.x, pb.y]); eW.push([pw.x, pw.y]); eT.push([pt.x, pt.y]); prof.push([th, drB, drW, wd]);
    }
    const sheet = (e) => { g.beginPath(); g.moveTo(e[0][0], e[0][1]); for (let i = 1; i < e.length; i++) g.lineTo(e[i][0], e[i][1]); g.lineTo(e[e.length - 1][0], H + PAD + 60); g.lineTo(e[0][0], H + PAD + 60); g.closePath(); };
    const line = (e) => { g.beginPath(); g.moveTo(e[0][0], e[0][1]); for (let i = 1; i < e.length; i++) g.lineTo(e[i][0], e[i][1]); };
    // the sheet presses a faint line of shade into the card
    g.save(); g.filter = 'blur(1.8px)'; g.strokeStyle = L.rgba(C.cardShade, 0.34); g.lineWidth = 2.6; g.translate(0, -0.4); line(eW); g.stroke(); g.restore();
    g.save(); g.filter = 'blur(7px)'; g.strokeStyle = L.rgba(C.cardShade, 0.12); g.lineWidth = 12; line(eW); g.stroke(); g.restore();
    // white heart: a thin veil first, then the pulp itself
    g.fillStyle = 'rgba(253,251,246,0.5)'; sheet(eT); g.fill();
    g.fillStyle = '#fcfaf5'; sheet(eW); g.fill();
    g.save(); sheet(eW); g.clip();
    g.globalCompositeOperation = 'hard-light'; g.globalAlpha = 0.55; g.drawImage(T.grain, -PAD, -PAD);
    g.restore();
    // pulp is rough: short grey-blue nicks across the exposed band
    const rf = L.rng('s31fuzz'); g.lineCap = 'round';
    for (let i = 0; i < 5200; i++) {
      const [th, drB, drW, wd] = prof[rf.int(0, n)]; if (wd < 1.6) continue;
      const p = a.pt(th, L.lerp(drB, drW, rf.range(0.05, 0.8))); const dir = th - Math.PI / 2 + rf.gauss() * 0.7, len = rf.range(0.8, 2.6);
      g.strokeStyle = rf.chance(0.5) ? `rgba(96,112,150,${rf.range(0.1, 0.3).toFixed(3)})` : `rgba(255,255,255,${rf.range(0.3, 0.8).toFixed(3)})`;
      g.lineWidth = rf.range(0.5, 1.0);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len); g.stroke();
    }
    // blue face
    g.fillStyle = C.blue; sheet(eB); g.fill();
    g.save(); sheet(eB); g.clip();
    g.globalAlpha = 1;
    g.drawImage(L.noiseTex(GW, GH, { seed: 's31hue', scale: 420, octaves: 3, res: 0.08, contrast: 1.4, ramp: [[0, 'rgba(26,52,138,0.30)'], [0.5, 'rgba(36,80,154,0)'], [1, 'rgba(52,112,186,0.28)']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'hard-light';
    g.globalAlpha = 0.2; g.drawImage(T.crumple, -PAD, -PAD);
    g.globalAlpha = 0.5; g.drawImage(T.grain, -PAD, -PAD);
    // the face is stressed pale right at the tear
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.filter = 'blur(1.4px)'; g.strokeStyle = 'rgba(214,228,255,0.24)'; g.lineWidth = 4.5; g.translate(0, 2.2); line(eB); g.stroke();
    g.restore();
    // fuzz: blue shreds straying onto the pulp, white fibres standing off its edge (thick where the tear feathered, almost none where it ran clean)
    for (let i = 0; i < 9000; i++) {
      const [th, drB, drW, wd] = prof[rf.int(0, n)];
      if (rf.chance(0.36)) {
        if (wd < 1.2) continue;
        const p = a.pt(th, drB + rf.range(-0.6, Math.min(2.6, wd * 0.7)));
        const dir = th - Math.PI / 2 + rf.gauss() * 0.9, len = rf.range(0.8, 3.4);
        g.strokeStyle = L.rgba(rf.chance(0.5) ? '#2b5aa6' : '#4270b6', rf.range(0.45, 0.95)); g.lineWidth = rf.range(0.5, 1.2);
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len); g.stroke();
      } else {
        if (!rf.chance(0.1 + Math.min(0.9, wd / 4.5))) continue;
        const p = a.pt(th, drW + rf.range(-1.4, 0.5));
        const dir = th - Math.PI / 2 + rf.gauss() * 0.95, len = rf.range(1.2, 2.5 + Math.min(4.5, wd));
        g.strokeStyle = L.rgba('#fffefa', rf.range(0.3, 0.9)); g.lineWidth = rf.range(0.5, 1.05);
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len); g.stroke();
      }
    }
    // a few long fibres pulled right out of the sheet, lying loose on the card
    for (let i = 0; i < 150; i++) {
      const [th, , drW, wd] = prof[rf.int(0, n)]; if (wd < 2.2 && !rf.chance(0.25)) continue;
      const p = a.pt(th, drW - 0.8); const dir = th - Math.PI / 2 + rf.gauss() * 1.0, len = rf.range(7, 17), bend = rf.range(-0.45, 0.45) * len;
      const ex = p.x + Math.cos(dir) * len, ey = p.y + Math.sin(dir) * len, mx = (p.x + ex) / 2 - Math.sin(dir) * bend, my = (p.y + ey) / 2 + Math.cos(dir) * bend;
      g.strokeStyle = L.rgba(C.cardShade, 0.2); g.lineWidth = 1.1; g.beginPath(); g.moveTo(p.x + 0.7, p.y + 1); g.quadraticCurveTo(mx + 0.8, my + 1.1, ex + 0.8, ey + 1.1); g.stroke();
      g.strokeStyle = L.rgba('#fffefa', rf.range(0.55, 0.9)); g.lineWidth = rf.range(0.55, 0.95); g.beginPath(); g.moveTo(p.x, p.y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    }

    // ── everything glued on top stays well inside the sheet ──
    g.save(); a.clipBelow(g, -9);
    const r = L.rng('s31town');
    const chalk = (x0, y0, x1, y1, o) => L.chalkStroke(g, [[x0, y0], [x1, y1]], { width: 2.6, color: '#f1ede2', density: 0.92, alpha: 0.9, jitter: 0.7, seed: r.int(1, 9999), ...o });
    const win = (cx, cy, w, h) => {
      paper(g, cut(box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r, 3).map((q, i) => (i > 1 ? [q[0], q[1] + r.range(-3, 3)] : q)), 'w' + cx, 0.8, 60), { color: C.black, lift: 0.35, sh: 0.8, tex: 0.3, curl: 0.5 });
      chalk(cx, cy - h / 2 + 4, cx + r.range(-1.5, 1.5), cy + h / 2 - 4, { width: 2.6 }); chalk(cx - w / 2 + 4, cy, cx + w / 2 - 4, cy + r.range(-1.5, 1.5), { width: 2.6 });
    };
    const lantern = (x, yTop, cy) => {
      g.save(); g.strokeStyle = 'rgba(20,18,18,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, yTop); g.lineTo(x + 0.5, cy - 24); g.stroke(); g.restore();
      paper(g, cut([[x - 2.6, cy + 22], [x + 2.8, cy + 22], [x + 3.4, cy + 50], [x - 2.2, cy + 49]], 'lt' + x, 0.4, 40, 8), { color: '#e9c948', lift: 0.25, sh: 0.7, tex: 0.3, curl: 0 });
      { const t = tear(roundish(x, cy, 22, 26, 9, 'lan' + x), 'lan' + x, 0.8, 2.0); paper(g, t.skin, { color: C.red, core: t.core, lift: 0.5, sh: 0.95, tex: 0.42, curl: 1.2 }); }
      paper(g, cut([[x - 9, cy - 29], [x + 9, cy - 29.5], [x + 10, cy - 21.5], [x - 10, cy - 21]], 'lc' + x, 0.4, 40, 8), { color: C.black, lift: 0.25, sh: 0.7, tex: 0.25, curl: 0 });
      paper(g, cut([[x - 8, cy + 21], [x + 8, cy + 20.5], [x + 7.5, cy + 28], [x - 7.5, cy + 28]], 'lb' + x, 0.4, 40, 8), { color: C.black, lift: 0.25, sh: 0.7, tex: 0.25, curl: 0 });
    };
    const tileLines = (tl, tr, br, bl, nn) => {
      for (let i = 1; i < nn; i++) {
        const u = (i + r.range(-0.15, 0.15)) / nn;
        chalk(L.lerp(tl[0], tr[0], u), L.lerp(tl[1], tr[1], u) + 7, L.lerp(bl[0], br[0], u), L.lerp(bl[1], br[1], u) - 4, { width: 2.0, alpha: 0.5, density: 0.8, color: '#cfcabb' });
      }
    };
    // roof ridge (屋脊): a slate-grey strip along the top of an eave roof, its ends tipped up a little
    const ridge = (tl, tr, seed) => paper(g, cut([[tl[0] - 13, tl[1] - 10], [tl[0] + 22, tl[1] - 4], [tr[0] - 22, tr[1] - 4], [tr[0] + 13, tr[1] - 10], [tr[0] + 11, tr[1] + 3], [tr[0] - 22, tr[1] + 7], [tl[0] + 22, tl[1] + 7], [tl[0] - 11, tl[1] + 3]], seed, 0.6, 80, 10), { color: '#42474d', lift: 0.4, sh: 0.9, tex: 0.4, curl: 0.5 });
    const sliver = (x, y, len, th, tilt, color, seed) => {
      const pts = []; const m = 18;
      for (let i = 0; i <= m; i++) { const u = i / m; pts.push([x + (u - 0.5) * len, y + (u - 0.5) * len * tilt - th * 0.5 * Math.pow(Math.sin(Math.PI * u), 0.55)]); }
      for (let i = m; i >= 0; i--) { const u = i / m; pts.push([x + (u - 0.5) * len, y + (u - 0.5) * len * tilt + th * 0.5 * Math.pow(Math.sin(Math.PI * u), 0.7)]); }
      const t = tear(pts, seed, 0.9, 2.2); paper(g, t.skin, { color, core: t.core, lift: 0.3, sh: 0.8, tex: 0.4, curl: 0.4, edge: 0.7 });
    };

    // moon reflections & far ripples lying directly on the water
    sliver(585, 1041, 128, 13, 0.02, '#eedb72', 'rm1'); sliver(648, 1064, 86, 10, -0.03, '#eedb72', 'rm2');
    sliver(1318, 1049, 132, 12, 0.03, C.white, 'rw0');

    // ── moon ──
    paper(g, cut(roundish(598, 706, 92, 92, 12, 'moon'), 'moon', 1.0, 80, 10), { color: C.moon, lift: 1.2, tex: 0.5, crumple: 0.22, curl: 1.1, peel: [[664, 772, 95]] });

    // ── left bank: gable house (behind) + eave house (front) ──
    paper(g, cut([[250, 1140], [247, 792], [352, 702], [471, 788], [473, 1140]], 'Lb', 1.8), { color: C.white, tex: 0.42, crumple: 0.16 });
    win(362, 872, 42, 54);
    paper(g, cut([[352, 668], [507, 777], [489, 805], [352, 709], [221, 815], [203, 790]], 'Lbr', 1.4, 110), { color: C.black, tex: 0.34, lift: 0.8, crumple: 0.16, peel: [[498, 790, 90]] });
    paper(g, cut([[-95, 1140], [-92, 884], [268, 878], [264, 1140]], 'Lf', 1.8), { color: '#f6f2e6', tex: 0.42, crumple: 0.16 });
    paper(g, cut([[96, 1140], [99, 966], [160, 962], [158, 1140]], 'door', 1.2, 70), { color: C.brown, lift: 0.5, tex: 0.5 });
    {
      const tl = [-78, 806], tr = [236, 798], br = [297, 880], bl = [-116, 886];
      paper(g, cut(eaveRoof(tl, tr, br, bl, 13), 'Lfr', 1.0, 120, 7), { color: C.black, tex: 0.34, lift: 0.9, crumple: 0.16, peel: [[296, 880, 80]] });
      tileLines(tl, tr, br, bl, 13);
      ridge(tl, tr, 'Lfg');
    }
    lantern(41, 890, 938); lantern(229, 888, 936);

    // ── right bank: gable house + low eave house running off frame ──
    paper(g, cut([[1565, 1140], [1563, 824], [1682, 732], [1801, 820], [1803, 1140]], 'Rm', 1.8), { color: C.white, tex: 0.42, crumple: 0.16 });
    win(1694, 888, 38, 50); win(1762, 884, 36, 48);
    paper(g, cut([[1682, 700], [1838, 811], [1821, 839], [1682, 741], [1546, 844], [1527, 818]], 'Rmr', 1.4, 110), { color: C.black, tex: 0.34, lift: 0.8, crumple: 0.16, peel: [[1830, 824, 90]] });
    paper(g, cut([[1796, 1140], [1794, 894], [2030, 892], [2032, 1140]], 'Rs', 1.8), { color: '#f6f2e6', tex: 0.42, crumple: 0.16 });
    {
      const tl = [1808, 824], tr = [2030, 832], br = [2062, 898], bl = [1771, 900];
      paper(g, cut(eaveRoof(tl, tr, br, bl, 9), 'Rsr', 1.0, 120, 7), { color: C.black, tex: 0.34, lift: 0.9, crumple: 0.16 });
      tileLines(tl, tr, br, bl, 9);
      ridge(tl, tr, 'Rsg');
    }
    lantern(1824, 902, 938); lantern(1879, 902, 941);

    // ── the bridge ──
    const BX = 985, YB = 1010;
    const br = bridgeShape(BX, YB, 676, 258);
    paper(g, cut(br.body, 'bridge', 1.0, 140, 9), { color: C.brown, tex: 0.5, crumple: 0.3, lift: 1.1, peel: [[430, 1006, 120]] });
    paper(g, cut(br.ring, 'ring', 0.8, 120, 9), { color: '#a3683a', tex: 0.5, crumple: 0.18, lift: 0.45, sh: 0.9 });
    {
      // crayon joints between the arch stones
      const rr = L.rng('s31vous');
      for (let i = 1; i < 17; i++) {
        const ph = ((i + rr.range(-0.12, 0.12)) / 17) * Math.PI; const q0 = br.rad(ph) + 4, q1 = br.rad(ph) + 28;
        L.sketchLine(g, [[BX + q0 * Math.cos(ph), br.cyA - q0 * Math.sin(ph)], [BX + q1 * Math.cos(ph), br.cyA - q1 * Math.sin(ph)]], { width: 2.2, color: '#3a1c0b', wobble: 0.9, passes: 2, alpha: 0.8, seed: 40 + i });
      }
    }

    // ── pencil-hatched scrap: the stone quay in the corner ──
    {
      const tq = tear([[1492, 1003], [1650, 990], [1657, 978], [2040, 990], [2046, 1150], [1488, 1150]], 'quay', 1.7, 2.6); const poly = tq.skin;
      paper(g, poly, { color: '#ebe6d7', core: tq.core, tex: 0.5, crumple: 0.3, lift: 1.0 });
      const x0 = 1440, y0 = 930, w = 640, h = 240;
      const c = L.makeCanvas(w, h); const k = c.getContext('2d'); k.translate(-x0, -y0);
      const rh = L.rng('s31hatch');
      const scribble = (xa, xb, top, bot, lean, gap, wd, al, sd) => {
        const pts = []; let x = xa;
        while (x < xb) {
          const yb2 = bot + rh.range(-16, 8), yt = top + (x - xa) * -0.045 + rh.range(-8, 16);
          pts.push([x + rh.range(-3, 3), yb2], [x + lean + rh.range(-4, 4), yt]);
          x += gap * rh.range(0.7, 1.35);
        }
        L.sketchLine(k, pts, { width: wd, color: '#34343a', seed: sd, wobble: 1.6, passes: 2, alpha: al });
      };
      scribble(1504, 1790, 1012, 1090, 44, 15, 2.9, 0.85, 3);
      scribble(1700, 2040, 1004, 1094, 56, 19, 2.5, 0.8, 5);
      scribble(1560, 1900, 1000, 1085, -38, 27, 2.1, 0.6, 8);
      k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'destination-out';
      k.drawImage(L.noiseTex(w, h, { seed: 's31graphite', scale: 1.7, octaves: 2, res: 1, contrast: 2.0, ramp: [[0, 'rgba(0,0,0,0.8)'], [0.4, 'rgba(0,0,0,0.22)'], [0.7, 'rgba(0,0,0,0)']] }), 0, 0);
      g.save(); g.beginPath(); g.moveTo(poly[0][0], poly[0][1]); for (const q of poly) g.lineTo(q[0], q[1]); g.closePath(); g.clip();
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.92; g.drawImage(c, x0, y0);
      g.restore();
    }

    // ── the boat under the arch ──
    {
      const bx = 1004, wy = 1002;
      // punting pole, then the arched mat awning with its bamboo hoops
      paper(g, cut([[bx + 86, wy - 24], [bx + 142, wy - 128], [bx + 147, wy - 126], [bx + 92, wy - 21]], 'pole', 0.4, 60, 8), { color: '#3a2413', lift: 0.3, sh: 0.7, tex: 0.3, curl: 0 });
      const can = []; for (let i = 0; i <= 14; i++) { const ph = Math.PI - (i / 14) * Math.PI; can.push([bx - 12 + 62 * Math.cos(ph), wy - 12 - 46 * Math.pow(Math.sin(ph), 0.8)]); }
      paper(g, cut(can, 'awning', 0.8, 70, 8), { color: '#b98a4c', lift: 0.6, tex: 0.5, curl: 1.2 });
      for (const dx of [-36, -12, 12, 36]) {
        const hgt = 46 * Math.pow(Math.sqrt(1 - (dx / 62) ** 2), 0.8) - 3;
        paper(g, cut([[bx - 12 + dx - 2.4, wy - 12], [bx - 12 + dx - 2, wy - 12 - hgt], [bx - 12 + dx + 2.4, wy - 12 - hgt], [bx - 12 + dx + 2.2, wy - 12]], 'hoop' + dx, 0.3, 40, 8), { color: '#4a2c14', lift: 0.2, sh: 0.6, tex: 0.25, curl: 0, edge: 0.6 });
      }
      // hull: a dark crescent, both ends turned up
      const top = L.smoothPath([[-128, -44], [-96, -24], [-40, -13], [42, -13], [98, -25], [128, -46]].map(([x, y]) => [bx + x, wy + y]), 8);
      const bot = L.smoothPath([[128, -46], [108, -6], [62, 14], [0, 19], [-62, 14], [-108, -5], [-128, -44]].map(([x, y]) => [bx + x, wy + y]), 8);
      paper(g, cut(top.concat(bot.slice(1, -1)), 'hull', 0.6, 80, 8), { color: C.black, lift: 0.8, tex: 0.34, curl: 0.8, peel: [[1130, 958, 60]] });
    }
    // ripples in front
    sliver(872, 1044, 124, 11, 0.02, C.white, 'rw1'); sliver(1096, 1050, 150, 12, -0.02, C.white, 'rw2'); sliver(985, 1066, 96, 9, 0.01, '#5f8fd0', 'rw3');
    sliver(760, 1062, 84, 9, -0.02, '#5f8fd0', 'rw4');

    // ── the willow: leaning trunk, five arching boughs, long thin strands weeping straight down from them ──
    {
      const rw = L.rng('s31willow');
      const boughs = [
        [[1486, 814], [1444, 734], [1380, 694], [1322, 712]],
        [[1486, 814], [1466, 722], [1434, 674], [1392, 666]],
        [[1486, 814], [1503, 724], [1532, 680], [1570, 678]],
        [[1486, 814], [1538, 746], [1596, 710], [1644, 732]],
        [[1486, 814], [1487, 742], [1483, 696], [1477, 660]],
      ].map((c) => L.smoothPath(c, 6));
      const strand = (bi, t, green, lift) => {
        const bp = boughs[bi]; const [sx, sy] = bp[Math.min(bp.length - 1, Math.round(t * (bp.length - 1)))];
        const side = bi === 4 ? (t > 0.9 ? -1 : 1) : bi < 2 ? -1 : 1; const outer = bi === 0 || bi === 3;
        const len = (outer ? L.lerp(238, 168, t) : bi === 4 ? 262 : L.lerp(284, 236, t)) * rw.range(0.9, 1.08);
        const c = quad([sx, sy - 3], [sx + side * rw.range(8, 20), sy + len * 0.34], [sx + side * rw.range(-2, 16) + 10, sy + len], 12);
        const wmax = rw.range(12.5, 16.5);
        const poly = strip(c, (u) => 3 + wmax * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.75), 9);
        paper(g, cut(poly, 'st' + bi + '_' + t, 0.5, 60, 8), { color: green, lift, sh: 0.9, tex: 0.5, curl: 0.8, edge: 0.9 });
      };
      for (let bi = 0; bi < 4; bi++) { strand(bi, 0.52, '#2c7a44', 0.4); strand(bi, 0.86, '#2c7a44', 0.4); }
      const trunk = strip([[1518, 1150], [1510, 1000], [1496, 892], [1486, 806]], (t) => L.lerp(42, 19, t), 12);
      { const t = tear(trunk, 'trunk', 1.7, 3.4); paper(g, t.skin, { color: '#44260f', core: t.core, lift: 0.7, tex: 0.5, crumple: 0.2 }); }
      boughs.forEach((bp, bi) => paper(g, cut(strip(bp.filter((_, i) => i % 3 === 0 || i === bp.length - 1), (t) => L.lerp(15, 5, t), 9), 'bough' + bi, 0.5, 70, 8), { color: '#44260f', lift: 0.5, sh: 0.9, tex: 0.45, curl: 0.5 }));
      strand(4, 0.82, C.green, 0.6); strand(4, 1.0, '#62b66c', 0.7);
      for (let bi = 0; bi < 4; bi++) {
        strand(bi, 0.36, C.green, 0.6); strand(bi, 0.7, rw.chance(0.5) ? '#62b66c' : C.green, 0.7); strand(bi, 1.0, bi % 2 ? C.green : '#62b66c', 0.7);
      }
    }
    g.restore();

    // ── one light over the whole sheet: warm from the upper left, falling away to the lower right ──
    g.save(); sheet(eW); g.clip();
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = L.radial(g, 380, 420, 100, 1500, [[0, 'rgba(255,244,220,0.14)'], [1, 'rgba(255,244,220,0)']]);
    g.fillRect(-PAD, -PAD, GW, GH);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, 380, 420, 900, 2100, [[0, 'rgb(255,255,255)'], [1, 'rgb(196,198,222)']]);
    g.fillRect(-PAD, -PAD, GW, GH);
    g.restore();
  });
}

/** the pale peach-pink sugar-paper card everything is mounted on: one flat colour, only its fibre shows (static, so no padding) */
const CARD_H = 830;
function buildCard() {
  const c = L.makeCanvas(W, CARD_H); const g = c.getContext('2d');
  g.fillStyle = C.card; g.fillRect(0, 0, W, CARD_H);
  g.drawImage(L.noiseTex(W, CARD_H, { seed: 's31cardmot', scale: 420, octaves: 3, res: 0.08, contrast: 1.3, ramp: [[0, 'rgba(226,140,136,0.10)'], [0.5, 'rgba(246,184,178,0)'], [1, 'rgba(255,226,220,0.12)']] }), 0, 0);
  g.globalCompositeOperation = 'hard-light'; g.globalAlpha = 0.4;
  g.save(); g.translate(GW - 40, GH - 60); g.rotate(Math.PI); g.drawImage(T.grain, 0, 0); g.restore();
  return c;
}

export default {
  name: '剪纸拼贴·水乡',
  tone: 'dark',
  init(env) {
    T = buildTextures(); pieceNo = 0;
    S = { card: buildCard(), collage: buildCollage(env) };
    T = null;
  },
  draw(ctx, env, p) {
    // 6 frames: the collage slips a few pixels along the arc over a locked-off card
    const a = env.arc;
    const rot = L.lerp(-0.003, 0.003, p), zoom = L.lerp(1.0, 1.007, p);
    ctx.drawImage(S.card, 0, 0);
    // the collage layer is empty above the tear, so only the lower part of the frame needs the (resampled) blit
    ctx.save(); ctx.beginPath(); ctx.rect(0, a.crestY - 36, W, H - a.crestY + 36); ctx.clip();
    L.blit(ctx, env, S.collage, { rot, zoom });
    ctx.restore();
  },
};
