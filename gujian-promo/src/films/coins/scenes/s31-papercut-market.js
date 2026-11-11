// s31 — 剪纸拼贴·钱市. A hand-made paper collage of a night-market money shop.
// Cream card above; the arc is the torn top edge of one big sheet of indigo paper (white core showing along the tear).
// Glued on the blue sheet, big and naive: a lemon-yellow moon with a square hole cut out of its middle (the moon IS a coin),
// a chestnut-brown timber frame and counter (the shop), an abacus (brown frame, rods, a beam, two black beads above it
// and five red ones below on every rod), a vermilion arc of cord with small yellow cash threaded on it, a torn green
// tree, a deep-purple pitched roof and a scrap of white paper scribbled over in pencil. No writing anywhere.
// Every scrap is its own piece of paper: fibre, a lit cut edge, a crease or two, a soft shadow that shifts a hair as
// the collage slides along the arc.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 90;                 // the move is tiny (≈ ±7 px along the arc), so a slim margin is plenty
const TW = W + PAD * 2;
let S = null, T = null, SIL = null, pieceNo = 0;

const C = {
  card: '#efe9d9', blue: '#1d4d97', yellow: '#f6e36a', red: '#d5281c', green: '#3f9d58', brown: '#54270f',
  purple: '#38205f', black: '#1b1a1e', navy: '#121d44', white: '#f3efe3',
};

// ───────────────────────── layers that only cover the lower part of the frame ─────────────────────────
function mkLayer(Y0, LH, draw) {
  const c = L.makeCanvas(TW, LH); const g = c.getContext('2d');
  g.translate(PAD, -Y0);          // draw in frame coordinates
  if (draw) draw(g, c);
  return c;
}

// ───────────────────────── shared paper textures (grey, 128 = neutral) ─────────────────────────
function buildTextures(TH) {
  // 1) grain: the fine speckle of sugar paper, faint pulp clouds, a scatter of loose fibres — tone only, no relief
  const grain = L.grainTex(TW, TH, { seed: 'c31speck', amount: 0.2, size: 1.25 }); const g = grain.getContext('2d');
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.8;
  g.drawImage(L.noiseTex(TW, TH, { seed: 'c31pulp', scale: 40, octaves: 3, res: 0.25, contrast: 1.2, warp: 0.5, ramp: [[0, '#757575'], [1, '#8b8b8b']] }), 0, 0);
  g.drawImage(L.noiseTex(TW, TH, { seed: 'c31mot', scale: 320, octaves: 3, res: 0.1, contrast: 1.3, ramp: [[0, '#707070'], [1, '#909090']] }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const r = L.rng('c31fib'); g.lineCap = 'round';
  const nFib = Math.round(TW * TH * 0.0034);
  for (let i = 0; i < nFib; i++) {
    const long = i % 17 === 0;
    const x = r() * TW, y = r() * TH, len = long ? r.range(22, 60) : r.range(3, 13), a = r() * Math.PI;
    g.strokeStyle = r.chance(0.7) ? `rgba(255,255,255,${r.range(0.07, 0.26).toFixed(3)})` : `rgba(0,0,0,${r.range(0.05, 0.16).toFixed(3)})`;
    g.lineWidth = r.range(0.45, 0.95);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + r.range(-3, 3), y + Math.sin(a) * len * 0.5 + r.range(-3, 3), x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // 2) crumple: flat-shaded voronoi facets with a thin lit crease between them (paper that was creased, then flattened)
  const res = 0.25, cw = Math.round(TW * res), ch = Math.round(TH * res);
  const nz = L.makeNoise('c31crumple');
  const img = new ImageData(cw, ch); const d = img.data;
  let k = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const u0 = x / res / 230, v0 = y / res / 230;
    const u = u0 + 0.32 * nz.n2(u0 * 0.8 + 3.1, v0 * 0.8), v = v0 + 0.32 * nz.n2(u0 * 0.8 - 5.2, v0 * 0.8 + 9.4);
    const c1 = nz.cell(u, v), c2 = nz.cell(u * 2.4 + 11.3, v * 2.4 + 7.1);
    let s = 128 + (c1.id - 0.5) * 60 + (c2.id - 0.5) * 24;
    s += 12 * Math.exp(-(c1.edge * c1.edge) / 0.0016) + 5 * Math.exp(-(c2.edge * c2.edge) / 0.003);
    d[k++] = s; d[k++] = s; d[k++] = s; d[k++] = 255;
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  const crumple = L.makeCanvas(TW, TH); const cg = crumple.getContext('2d');
  cg.imageSmoothingQuality = 'high'; cg.filter = 'blur(2px)';
  cg.drawImage(small, 0, 0, TW, TH);
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
  const d = dens(pts, torn ? 3.5 : step); const n = d.length; const nz = L.makeNoise('c31cut' + seed);
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
/** the white paper core that outruns the coloured skin along a tear: the outline pushed outward by an uneven few px */
function fringe(p, core, seed) {
  const n = p.length; const nz = L.makeNoise('c31fr' + seed);
  let area = 0;
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1;
  const out = []; let s = 0;
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    s += Math.hypot(p[i][0] - a[0], p[i][1] - a[1]);
    const dd = core * Math.max(0.15, 0.55 + 0.75 * nz.n2(s / 19, 2.2) + 0.4 * nz.n2(s / 5.1, 7.9) + 0.9 * Math.max(0, nz.n2(s / 70, 11.1)));
    out.push([p[i][0] + sg * ty * dd, p[i][1] - sg * tx * dd]);
  }
  return out;
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
function roundish(cx, cy, rx, ry, n, seed, wob = 0.03, k = 0.2) {
  const r = L.rng('c31round' + seed); const pts = [];
  const a0 = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + r.range(-0.2, 0.2)) / n) * TAU; const q = 1 + r.range(-wob, wob);
    pts.push([cx + rx * q * Math.cos(a), cy + ry * q * Math.sin(a)]);
  }
  return chaikin(pts, k);
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
const rotPts = (pts, cx, cy, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
/** a hand-cut square: four corners nudged, sides wandering */
function square(cx, cy, hs, ang, seed, jit = 0.07) {
  const r = L.rng('c31sq' + seed);
  const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [cx + sx * hs * (1 + r.range(-jit, jit)), cy + sy * hs * (1 + r.range(-jit, jit))]);
  return cut(rotPts(q, cx, cy, ang), 'sq' + seed, hs * 0.03, 40, 6);
}
/** pitched roof: ridge tl→tr, eave br→bl cut into n hanging scallops (the tile ends) */
function scallopRoof(tl, tr, br, bl, n, seed) {
  const r = L.rng('c31roof' + seed);
  const pts = [tl, tr, br];
  const ts = [0]; for (let i = 1; i < n; i++) ts.push((i + r.range(-0.16, 0.16)) / n); ts.push(1);
  for (let i = 0; i < n; i++) {
    const p0 = [L.lerp(br[0], bl[0], ts[i]), L.lerp(br[1], bl[1], ts[i])], p1 = [L.lerp(br[0], bl[0], ts[i + 1]), L.lerp(br[1], bl[1], ts[i + 1])];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], seg = Math.hypot(ex, ey), ux = ex / seg, uy = ey / seg, nx = uy, ny = -ux;
    const depth = seg * r.range(0.24, 0.33);
    for (let k = 1; k <= 7; k++) {
      const aa = (k / 8) * Math.PI, f = 0.5 - 0.5 * Math.cos(aa), dp = depth * Math.pow(Math.sin(aa), 0.75);
      pts.push([p0[0] + ex * f + nx * dp, p0[1] + ey * f + ny * dp]);
    }
    pts.push(p1);
  }
  return pts;
}

const tracePoly = (c, pp, begin = true) => {
  if (begin) c.beginPath();
  for (const p of pp) { c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); c.closePath(); }
};

// ───────────────────────── one piece of paper ─────────────────────────
/**
 * Glue a piece of paper onto the layer. polys = one closed polyline or several (even-odd → holes).
 * o: color, sh (shadow strength), lift (how far the piece stands off the sheet), tex (fibre strength), crumple (0..1),
 *    edge (lit/shaded rim strength), curl (0..1 light falling across the piece), peel [[x,y,r]...] (corners come unstuck),
 *    core (px of white paper core showing round a torn outline), folds [[x0,y0,x1,y1,strength]...] (creases)
 */
function paper(g, polys, o) {
  if (typeof polys[0][0] === 'number') polys = [polys];
  const { color, sh = 1, lift = 1, tex = 0.5, crumple = 0, edge = 1, curl = 1, peel = null, core = 0, folds = null } = o;
  const id = pieceNo++;
  const r = L.rng('c31pp' + id);
  const outer = core > 0 ? [fringe(polys[0], core, id)].concat(polys.slice(1)) : polys;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of outer) for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  const bx = x0 - 6, by = y0 - 6, bw = x1 - x0 + 12, bh = y1 - y0 + 12;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const path = (c, pp) => {
    c.beginPath();
    for (const p of pp) { c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); c.closePath(); }
  };
  if (SIL) { path(SIL, outer); SIL.fill('evenodd'); }
  // a corner that has come unstuck: a deeper, softer shadow under it …
  if (peel) for (const [px, py, pr] of peel) {
    g.save(); g.filter = 'blur(8px)'; g.translate(8, 13);
    g.fillStyle = L.radial(g, px - 8, py - 13, 0, pr, [[0, 'rgba(4,8,30,0.5)'], [0.5, 'rgba(4,8,30,0.26)'], [1, 'rgba(4,8,30,0)']]);
    path(g, outer); g.fill('evenodd'); g.restore();
  }
  // soft shadow of the lifted sheet + tight contact shadow
  g.save();
  g.fillStyle = core > 0 ? '#f8f5ec' : color;
  g.shadowColor = `rgba(4,8,30,${(0.2 * sh).toFixed(3)})`; g.shadowBlur = 10 * lift; g.shadowOffsetX = 3 * lift; g.shadowOffsetY = 6 * lift;
  path(g, outer); g.fill('evenodd');
  g.shadowColor = `rgba(4,8,30,${(0.34 * sh).toFixed(3)})`; g.shadowBlur = 2; g.shadowOffsetX = 0.8; g.shadowOffsetY = 1.5;
  path(g, outer); g.fill('evenodd');
  g.restore();
  if (core > 0) { g.fillStyle = color; path(g, polys); g.fill('evenodd'); }
  // everything else stays inside the piece
  g.save(); path(g, outer); g.clip('evenodd');
  const place = (texCanvas, alpha, mode) => {
    const sw = Math.min(texCanvas.width, bw), shh = Math.min(texCanvas.height, bh);
    const sx = Math.floor(r() * (texCanvas.width - sw)), sy = Math.floor(r() * (texCanvas.height - shh));
    g.save(); g.globalCompositeOperation = mode; g.globalAlpha = alpha;
    g.drawImage(texCanvas, sx, sy, sw, shh, bx, by, bw, bh);
    g.restore();
  };
  if (crumple > 0) place(T.crumple, crumple, 'overlay');
  if (tex > 0) place(T.grain, tex, 'overlay');
  const pc = L.parseColor(color); const lum = (0.299 * pc[0] + 0.587 * pc[1] + 0.114 * pc[2]) / 255;
  if (curl > 0) {
    // the sheet is never perfectly flat: light falls off across it
    const a = L.deg(52) + r.range(-0.6, 0.6), rad = Math.hypot(bw, bh) / 2;
    const dx = Math.cos(a) * rad, dy = Math.sin(a) * rad;
    g.fillStyle = L.linear(g, cx - dx, cy - dy, cx + dx, cy + dy, [[0, `rgba(255,252,240,${(0.12 * curl * (0.3 + 0.7 * lum)).toFixed(3)})`], [0.45, 'rgba(255,252,240,0)'], [0.6, 'rgba(0,0,24,0)'], [1, `rgba(0,0,24,${(0.12 * curl).toFixed(3)})`]]);
    g.fillRect(bx, by, bw, bh);
  }
  if (folds) for (const [fx0, fy0, fx1, fy1, st = 1] of folds) {
    // a crease: the facet turned to the light on one side, the facet turned away on the other, a hairline of scuffed fibre between
    const ddx = fx1 - fx0, ddy = fy1 - fy0, len = Math.hypot(ddx, ddy), nx = -ddy / len, ny = ddx / len, wd = 90;
    const mx = (fx0 + fx1) / 2, my = (fy0 + fy1) / 2, ex = (ddx / len) * 600, ey = (ddy / len) * 600;
    g.fillStyle = L.linear(g, mx - nx * wd, my - ny * wd, mx + nx * wd, my + ny * wd, [[0, 'rgba(0,0,24,0)'], [0.42, `rgba(0,0,24,${(0.07 * st).toFixed(3)})`], [0.492, `rgba(0,0,24,${(0.13 * st).toFixed(3)})`],
      [0.508, `rgba(255,255,250,${(0.16 * st * (0.4 + 0.6 * lum)).toFixed(3)})`], [0.58, `rgba(255,255,250,${(0.06 * st * (0.4 + 0.6 * lum)).toFixed(3)})`], [1, 'rgba(255,255,250,0)']]);
    g.beginPath(); g.moveTo(mx - ex - nx * wd, my - ey - ny * wd); g.lineTo(mx + ex - nx * wd, my + ey - ny * wd); g.lineTo(mx + ex + nx * wd, my + ey + ny * wd); g.lineTo(mx - ex + nx * wd, my - ey + ny * wd); g.closePath(); g.fill();
  }
  // … and the lifted corner itself turns toward the light
  if (peel) for (const [px, py, pr] of peel) {
    g.fillStyle = L.radial(g, px, py, 0, pr * 0.85, [[0, 'rgba(255,255,250,0.24)'], [0.6, 'rgba(255,255,250,0.07)'], [1, 'rgba(255,255,250,0)']]);
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  if (edge > 0) {
    // paper thickness: the cut edge catches light on the upper-left and falls into shade on the lower-right
    g.lineJoin = 'round'; g.lineWidth = 1.4;
    g.save(); g.translate(0.8, 1.1); g.strokeStyle = `rgba(255,255,255,${(0.2 * edge * lum).toFixed(3)})`; path(g, outer); g.stroke(); g.restore();
    g.save(); g.translate(-0.8, -1.1); g.strokeStyle = `rgba(0,0,16,${(0.16 * edge).toFixed(3)})`; path(g, outer); g.stroke(); g.restore();
  }
  g.restore();
  if (core > 0) {
    // fuzz: fibres of the white core standing off the tear
    const p = outer[0]; const rf = L.rng('c31fz' + id); g.save(); g.lineCap = 'round';
    for (let i = 0; i < p.length; i += 2) {
      if (rf.chance(0.45)) continue;
      const q = p[i], dir = rf() * TAU, len = rf.range(1, 4.2);
      g.strokeStyle = `rgba(255,254,248,${rf.range(0.3, 0.8).toFixed(3)})`; g.lineWidth = rf.range(0.5, 1);
      g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + Math.cos(dir) * len, q[1] + Math.sin(dir) * len); g.stroke();
    }
    g.restore();
  }
}

// ───────────────────────── the big blue sheet ─────────────────────────
function buildSheet(env, Y0, LH) {
  const a = env.arc;
  return mkLayer(Y0, LH, (g) => {
    // the torn edge: coloured skin (drB) and the white core that outruns it (drW)
    const nz = L.makeNoise('c31tear');
    const s = a.span(PAD + 170); const n = Math.ceil((2 * s * a.R) / 2);
    const eB = [], eW = [], prof = [];
    for (let i = 0; i <= n; i++) {
      const th = L.lerp(-s, s, i / n), al = th * a.R;
      const jog = Math.round(nz.n2(al / 190, 9.9) * 2.4) * 1.5;      // a tear changes its mind: small abrupt steps
      const w0 = 1.9 * nz.fbm(al / 52, 1.3, 3) + 1.1 * nz.n2(al / 6.5, 7.7) + jog;
      // how much white core shows: nothing at all along some stretches, a ragged band of 8 px along others
      const ww = Math.max(0.3, 2.6 + 5.2 * nz.n2(al / 120, 12.1) + 1.6 * nz.n2(al / 23, 5.5) + 1.0 * nz.n2(al / 4.3, 3.3));
      const drW = L.clamp(w0 + ww * 0.45, -4, 6);
      const drB = Math.max(-8.5, drW - ww);
      const pb = a.pt(th, drB), pw = a.pt(th, drW);
      eB.push([pb.x, pb.y]); eW.push([pw.x, pw.y]); prof.push([th, drB, drW]);
    }
    const bottom = H + PAD + 40;
    const sheet = (e) => { g.beginPath(); g.moveTo(e[0][0], e[0][1]); for (let i = 1; i < e.length; i++) g.lineTo(e[i][0], e[i][1]); g.lineTo(e[e.length - 1][0], bottom); g.lineTo(e[0][0], bottom); g.closePath(); };
    const line = (e) => { g.beginPath(); g.moveTo(e[0][0], e[0][1]); for (let i = 1; i < e.length; i++) g.lineTo(e[i][0], e[i][1]); };
    // faint contact shadow of the sheet on the card
    g.save(); g.filter = 'blur(2.2px)'; g.strokeStyle = 'rgba(70,52,26,0.30)'; g.lineWidth = 3.2; g.translate(0, -0.6); line(eW); g.stroke(); g.restore();
    g.save(); g.filter = 'blur(7px)'; g.strokeStyle = 'rgba(70,52,26,0.10)'; g.lineWidth = 12; line(eW); g.stroke(); g.restore();
    // white core
    g.fillStyle = '#fbfaf5'; sheet(eW); g.fill();
    g.save(); sheet(eW); g.clip();
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.6; g.drawImage(T.grain, -PAD, Y0);
    g.restore();
    // blue skin
    g.fillStyle = C.blue; sheet(eB); g.fill();
    g.save(); sheet(eB); g.clip();
    g.drawImage(L.noiseTex(TW, LH, { seed: 'c31hue', scale: 420, octaves: 3, res: 0.08, contrast: 1.4, ramp: [[0, 'rgba(18,54,126,0.30)'], [0.5, 'rgba(29,77,151,0)'], [1, 'rgba(40,94,172,0.2)']] }), -PAD, Y0);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.3; g.drawImage(T.crumple, -PAD, Y0);
    g.save(); g.translate(W + PAD, Y0 + LH); g.scale(-1, -1); g.globalAlpha = 0.9; g.drawImage(T.grain, 0, 0); g.restore();
    // one long soft crease where the sheet was once folded
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    {
      const fx0 = 1180, fy0 = a.crestY - 20, fx1 = 1290, fy1 = H + PAD, ddx = fx1 - fx0, ddy = fy1 - fy0, len = Math.hypot(ddx, ddy), nx = -ddy / len, ny = ddx / len, wd = 110;
      g.fillStyle = L.linear(g, fx0 - nx * wd, fy0 - ny * wd, fx0 + nx * wd, fy0 + ny * wd, [[0, 'rgba(0,0,30,0)'], [0.44, 'rgba(0,0,30,0.07)'], [0.494, 'rgba(0,0,30,0.11)'], [0.506, 'rgba(220,232,255,0.10)'], [0.58, 'rgba(220,232,255,0.04)'], [1, 'rgba(220,232,255,0)']]);
      g.fillRect(-PAD, Y0, TW, LH);
    }
    // the skin is stressed pale right at the tear
    g.filter = 'blur(1.6px)'; g.strokeStyle = 'rgba(214,228,255,0.22)'; g.lineWidth = 5; g.translate(0, 2.5); line(eB); g.stroke();
    g.restore();
    // fuzz: white fibres standing off the core, blue shreds straying onto it
    const rf = L.rng('c31fuzz'); g.lineCap = 'round';
    for (let i = 0; i < 5600; i++) {
      const [th, drB, drW] = prof[rf.int(0, n)];
      const blue = rf.chance(0.42);
      const p = a.pt(th, blue ? drB + rf.range(-0.5, 2.2) : drW + rf.range(-1.2, 0.6));
      const dir = th - Math.PI / 2 + rf.gauss() * 0.9; const len = blue ? rf.range(0.8, 3.2) : rf.range(1.2, 5.5);
      g.strokeStyle = blue ? L.rgba(rf.chance(0.5) ? '#2a5aa6' : '#3a6cb4', rf.range(0.45, 0.95)) : L.rgba('#fffefa', rf.range(0.3, 0.85));
      g.lineWidth = rf.range(0.5, 1.1);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len); g.stroke();
    }
    // one light over the whole sheet: from the upper left, falling away to the lower right
    g.save(); sheet(eW); g.clip();
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = L.radial(g, 520, a.crestY - 60, 100, 1500, [[0, 'rgba(255,246,226,0.10)'], [1, 'rgba(255,246,226,0)']]);
    g.fillRect(-PAD, Y0, TW, LH);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, 520, a.crestY - 60, 900, 2100, [[0, 'rgb(255,255,255)'], [1, 'rgb(196,200,226)']]);
    g.fillRect(-PAD, Y0, TW, LH);
    g.restore();
  });
}

// ───────────────────────── the collage ─────────────────────────
const isect = (p1, p2, p3, p4) => {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  const u = p1[0] * p2[1] - p1[1] * p2[0], v = p3[0] * p4[1] - p3[1] * p4[0];
  return [(u * (p3[0] - p4[0]) - (p1[0] - p2[0]) * v) / d, (u * (p3[1] - p4[1]) - (p1[1] - p2[1]) * v) / d];
};
const offLine = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), nx = (-dy / l) * d, ny = (dx / l) * d; return [[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny]]; };

function buildPieces(env, Y0, LH) {
  const a = env.arc, oy = a.crestY - 560;        // the layout was composed for crestY = 560
  const silC = L.makeCanvas(TW, LH); SIL = silC.getContext('2d'); SIL.translate(PAD, -Y0);
  SIL.save(); a.clipBelow(SIL, -9); SIL.translate(0, oy); SIL.fillStyle = '#000';
  const layer = mkLayer(Y0, LH, (g) => {
    g.save(); a.clipBelow(g, -9); g.translate(0, oy);

    // ── bottom right: a scrap of white paper scribbled over in pencil (it lies under the tree) ──
    {
      const poly = cut([[1546, 966], [1700, 950], [1788, 946], [1798, 900], [2030, 880], [2034, 1200], [1528, 1200]], 'scrap', 2.6, 110);
      paper(g, poly, { color: C.white, tex: 0.7, crumple: 0.5, lift: 1.0, peel: [[1552, 972, 80]] });
      const x0 = 1500, y0 = 830, w = 540, h = 380;
      const c = L.makeCanvas(w, h); const k = c.getContext('2d'); k.translate(-x0, -y0);
      const rh = L.rng('c31hatch');
      // loose zigzags, the pencil never leaving the paper; a few run off the top of the scrap onto the blue
      const scribble = (xa, xb, top, bot, lean, gap, wd, al, sd) => {
        const pts = []; let x = xa;
        while (x < xb) {
          const yb2 = bot(x) + rh.range(-26, 12), yt = top(x) + rh.range(-16, 30);
          pts.push([x + rh.range(-5, 5), yb2], [x + lean + rh.range(-10, 10), yt]);
          x += gap * rh.range(0.6, 1.5);
        }
        L.sketchLine(k, pts, { width: wd, color: '#34343a', seed: sd, wobble: 2.6, passes: 2, alpha: al });
      };
      const topL = (x) => (x < 1770 ? 990 : 928), botL = () => 1090;
      scribble(1560, 2010, topL, botL, 58, 34, 5.2, 0.92, 3);
      scribble(1800, 2020, () => 880, () => 1010, 40, 46, 4.4, 0.85, 4);
      scribble(1575, 1990, (x) => topL(x) + 16, () => 1100, -64, 62, 4.0, 0.7, 5);
      k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'destination-out';
      k.drawImage(L.noiseTex(w, h, { seed: 'c31graphite', scale: 2.2, octaves: 2, res: 1, contrast: 2.0, ramp: [[0, 'rgba(0,0,0,0.8)'], [0.4, 'rgba(0,0,0,0.25)'], [0.7, 'rgba(0,0,0,0)']] }), 0, 0);
      g.save(); tracePoly(g, [poly]); g.clip();
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.92; g.drawImage(c, x0, y0);
      g.restore();
      // graphite on the blue sheet: only a dull dark sheen
      g.save(); g.beginPath(); g.rect(x0, y0, w, h); tracePoly(g, [poly], false); g.clip('evenodd');
      g.globalAlpha = 0.42; g.drawImage(c, x0, y0);
      g.restore();
    }

    // ── the shop: two chestnut posts, a counter, and a deep-purple awning roof with a scalloped eave, pitched along the tear ──
    {
      paper(g, cut([[-36, 880], [52, 884], [58, 1200], [-40, 1200]], 'postL', 2, 110), { color: C.brown, tex: 0.8, crumple: 0.3, lift: 0.8 });
      paper(g, cut([[366, 772], [449, 765], [459, 1200], [361, 1200]], 'postR', 2.4, 120), { color: C.brown, tex: 0.8, crumple: 0.3, lift: 0.9, folds: [[340, 905, 480, 925, 0.8]] });
      paper(g, cut([[-130, 1034], [528, 1018], [534, 1200], [-130, 1200]], 'counter', 2.2, 120), { color: L.shade(C.brown, -0.2), tex: 0.8, crumple: 0.3, lift: 0.8 });
      paper(g, cut([[-130, 1000], [560, 980], [566, 1022], [-130, 1044]], 'ctop', 1.8, 100), { color: '#7d3f1c', tex: 0.8, lift: 0.6, sh: 0.9, peel: [[560, 1000, 70]] });
      paper(g, cut(scallopRoof([-150, 848], [466, 666], [488, 776], [-150, 968], 5, 'r'), 'roof', 2.0, 110, 8), {
        color: C.purple, tex: 0.8, crumple: 0.4, lift: 1.0, curl: 1.2, peel: [[480, 770, 100]], folds: [[150, 700, 215, 960, 0.9]],
      });
    }

    // ── the abacus ──
    abacus(g, 1068, 866, L.deg(2));

    // ── a string of cash: a vermilion sweep of cord, yellow coins threaded on it ──
    {
      const ctrl = [[1330, 628], [1418, 716], [1464, 866], [1436, 1010], [1362, 1190]];
      const back = strip(ctrl.map(([x, y], i) => [x + 50 + i * 3, y + 40]), (t) => L.lerp(22, 70, Math.sin(Math.PI * Math.min(1, t * 1.1))), 10);
      paper(g, cut(back, 'cordB', 1.6, 80, 8), { color: '#4a0e2a', tex: 0.8, lift: 0.5, sh: 0.9 });
      const cord = strip(ctrl, (t) => 26 + 62 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.78)), 0.7), 10);
      paper(g, cut(cord, 'cord', 1.6, 80, 8, 1.2), { color: C.red, tex: 0.8, crumple: 0.5, lift: 0.9, core: 2.0, folds: [[1380, 800, 1520, 830, 0.7]] });
      const cp = L.smoothPath(ctrl, 6);
      const yel = ['#f6e36a', '#f0cf45', '#f8e77a', '#eec93e'];
      [[0.19, 55], [0.44, 60], [0.69, 54], [0.9, 58]].forEach(([t, rr], i) => {
        const [x, y] = cp[Math.round(t * (cp.length - 1))];
        const ang = L.deg([-9, 6, -4, 11][i]), ox = [5, -7, 6, -4][i];
        paper(g, [cut(roundish(x + ox, y, rr, rr, 9, 'cash' + i, 0.03, 0.15), 'cash' + i, 0.7, 50, 7), square(x + ox, y, rr * 0.3, ang, 'cash' + i)],
          { color: yel[i], tex: 0.7, lift: 0.8, curl: 1.1, crumple: 0.25, peel: i === 1 ? [[x + ox + 40, y + 40, 60]] : null });
      });
    }

    // ── the tree: a dark sliver of trunk, a torn, creased lump of green tissue (the trunk shows through it faintly) ──
    {
      const trunk = cut(strip([[1702, 900], [1694, 1000], [1676, 1200]], (t) => L.lerp(34, 62, t), 12), 'trunk', 2.0, 90, 10);
      paper(g, trunk, { color: C.navy, tex: 0.8, lift: 0.6 });
      const crown = cut(roundish(1706, 836, 168, 128, 9, 'tree', 0.06, 0.16), 'tree', 1.8, 120, 9, 1.4);
      paper(g, crown, {
        color: C.green, tex: 0.8, crumple: 0.85, lift: 1.1, core: 2.2, curl: 1.2,
        folds: [[1672, 700, 1716, 980, 1.5], [1560, 800, 1850, 760, 0.8], [1770, 700, 1800, 980, 0.9]], peel: [[1570, 900, 90]],
      });
      g.save(); tracePoly(g, [crown]); g.clip(); g.filter = 'blur(1.2px)';
      g.globalAlpha = 0.2; g.fillStyle = C.navy; tracePoly(g, [trunk]); g.fill();
      g.restore();
    }

    // ── the moon: a round of lemon-yellow paper with a square hole cut out of its middle — a coin ──
    {
      const mx = 700, my = 772, mr = 160;
      paper(g, [cut(roundish(mx, my, mr, mr, 11, 'moon', 0.02, 0.13), 'moon', 0.9, 80, 10), square(mx, my, mr * 0.29, L.deg(3.5), 'moon', 0.05)], {
        color: C.yellow, lift: 1.3, tex: 0.75, crumple: 0.45, curl: 1.2,
        folds: [[596, 650, 800, 900, 0.7]], peel: [[mx + 110, my + 110, 110]],
      });
    }
    g.restore();

    // light, as on the sheet (only where there is paper)
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = L.radial(g, 520, a.crestY - 60, 100, 1500, [[0, 'rgba(255,246,226,0.05)'], [1, 'rgba(255,246,226,0)']]);
    g.fillRect(-PAD, Y0, TW, LH);
    g.fillStyle = L.radial(g, 520, a.crestY - 60, 900, 2100, [[0, 'rgba(8,10,40,0)'], [1, 'rgba(8,10,40,0.14)']]);
    g.fillRect(-PAD, Y0, TW, LH);
    g.globalCompositeOperation = 'source-over';
  });
  SIL.restore(); SIL = null;
  // the loose shadow all the scraps drop on the sheet together (drawn under them, nudged a little every frame)
  const shadow = L.blurred(silC, 8); const sg = shadow.getContext('2d');
  sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgb(4,8,32)'; sg.fillRect(0, 0, TW, LH);
  return { layer, shadow };
}

/** 算盘: oblong wooden frame, one beam, rods; on every rod two beads above the beam and five below */
function abacus(g, cx, cy, ang) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const P = (pts) => pts.map(([x, y]) => [cx + x * cs - y * sn, cy + x * sn + y * cs]);
  const r = L.rng('c31abacus');
  const BH = 40, BW = 90, PITCH = 104, RODS = 4, FT = 34;
  const iw = (RODS * PITCH) / 2, upH = 2 * BH + 24, BEAM = 24, loH = 5 * BH + 34;
  const ih = (upH + BEAM + loH) / 2, HW = iw + FT, HH = ih + FT;
  const beamT = -ih + upH, beamB = beamT + BEAM;
  const jb = (x0, y0, x1, y1, j) => [[x0 + r.range(-j, j), y0 + r.range(-j, j)], [x1 + r.range(-j, j), y0 + r.range(-j, j)], [x1 + r.range(-j, j), y1 + r.range(-j, j)], [x0 + r.range(-j, j), y1 + r.range(-j, j)]];
  // rods first: their ends tuck under the frame
  for (let i = 0; i < RODS; i++) {
    const x = (i - (RODS - 1) / 2) * PITCH + r.range(-3, 3), w = r.range(5, 7);
    paper(g, cut(P([[x - w, -ih - 8], [x + w, -ih - 8], [x + w + r.range(-3, 3), ih + 8], [x - w + r.range(-3, 3), ih + 8]]), 'rod' + i, 0.6, 60, 10), { color: '#24130c', lift: 0.25, sh: 0.8, tex: 0.3, curl: 0, edge: 0.6 });
  }
  // frame: one piece with the window cut out
  paper(g, [cut(P(jb(-HW, -HH, HW, HH, 9)), 'abo', 2.6, 130), cut(P(jb(-iw, -ih, iw, ih, 5)), 'abi', 1.8, 90, 10)], { color: C.brown, tex: 0.8, crumple: 0.3, lift: 1.0, peel: [[cx + HW - 14, cy - HH + 22, 90]] });
  // the beam, glued across
  paper(g, cut(P([[-iw - 14, beamT + r.range(-3, 3)], [iw + 14, beamT + r.range(-3, 3)], [iw + 14, beamB + r.range(-3, 3)], [-iw - 14, beamB + r.range(-3, 3)]]), 'beam', 1.0, 90, 10), { color: '#7d3f1c', tex: 0.8, lift: 0.5, sh: 0.9 });
  // beads: how many of each rod's upper beads sit down on the beam / lower beads are pushed up to it
  const down = [0, 1, 2, 0], up = [2, 0, 3, 1];
  const reds = [C.red, '#cf2418', '#dc3320', '#c9201a'];
  const bead = (x, y, color, seed) => {
    const w = BW / 2 * r.range(0.88, 1.05), h = BH / 2 * r.range(0.86, 1.0);
    const pts = rotPts(roundish(x + r.range(-4, 4), y + r.range(-1, 1), w, h, 9, seed, 0.05, 0.2), x, y, r.range(-0.1, 0.1));
    paper(g, cut(P(pts), seed, 0.5, 40, 5), { color, lift: 0.45, sh: 1, tex: 0.7, curl: 1.3, edge: 0.9 });
  };
  for (let i = 0; i < RODS; i++) {
    const x = (i - (RODS - 1) / 2) * PITCH;
    const ys = [];
    for (let k = 0; k < 2 - down[i]; k++) ys.push([-ih + BH / 2 + 1 + k * BH, 0]);
    for (let k = 0; k < down[i]; k++) ys.push([beamT - BH / 2 - 1 - k * BH, 0]);
    for (let k = 0; k < up[i]; k++) ys.push([beamB + BH / 2 + 1 + k * BH, 1]);
    for (let k = 0; k < 5 - up[i]; k++) ys.push([ih - BH / 2 - 1 - k * BH, 1]);
    ys.forEach(([y, low], j) => bead(x, y, low ? L.shade(r.pick(reds), r.range(-0.06, 0.04)) : L.shade(C.black, r.range(0, 0.07)), 'bd' + i + '_' + j));
  }
}

/** the cream card everything is mounted on (static; only the part above the sheet is ever seen) */
function buildCard(env) {
  const CH = Math.min(H, Math.ceil(env.arc.yAt(0)) + 70);
  const c = L.paperTex(W, CH, { base: C.card, seed: 'c31card', tone: '#ab9d7c', fiber: 0.35, stain: 0.03, grain: 0.08 });
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(T.grain, -40, 0); g.drawImage(T.grain, -70, T.grain.height - 30);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.fillStyle = L.radial(g, 620, 160, 100, 2100, [[0, 'rgba(255,253,244,0.22)'], [0.5, 'rgba(255,253,244,0)'], [1, 'rgba(96,78,48,0.16)']]);
  g.fillRect(0, 0, W, CH);
  return c;
}

export default {
  name: '剪纸拼贴·钱市',
  tone: 'dark',
  init(env) {
    const Y0 = Math.floor(env.arc.crestY) - 40, LH = H - Y0 + PAD;
    const t0 = performance.now();
    T = buildTextures(LH); pieceNo = 0; const t1 = performance.now();
    const sheet = buildSheet(env, Y0, LH); const t2 = performance.now();
    const { layer, shadow } = buildPieces(env, Y0, LH); const t3 = performance.now();
    S = { card: buildCard(env), sheet, pieces: layer, shadow, Y0 };
    console.warn('TIMING tex', (t1 - t0) | 0, 'sheet', (t2 - t1) | 0, 'pieces', (t3 - t2) | 0, 'card', (performance.now() - t3) | 0);
    T = null;
  },
  draw(ctx, env, p) {
    // 6 frames: the collage slips a few pixels along the arc over a locked-off card; the scraps' loose shadow creeps a hair further
    const a = env.arc;
    const rot = L.lerp(-0.003, 0.003, p), zoom = L.lerp(1.0, 1.006, p);
    ctx.drawImage(S.card, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(0, S.Y0 + 10, W, H - S.Y0 - 10); ctx.clip();
    L.cam(ctx, env, { rot, zoom }, () => ctx.drawImage(S.sheet, -PAD, S.Y0));
    ctx.save(); a.clipBelow(ctx, -7);
    L.cam(ctx, env, { rot, zoom, dx: L.lerp(2, 5, p), dy: L.lerp(4, 8, p) }, () => { ctx.globalAlpha = 0.2; ctx.drawImage(S.shadow, -PAD, S.Y0); });
    ctx.restore();
    L.cam(ctx, env, { rot, zoom }, () => ctx.drawImage(S.pieces, -PAD, S.Y0));
    ctx.restore();
  },
};
