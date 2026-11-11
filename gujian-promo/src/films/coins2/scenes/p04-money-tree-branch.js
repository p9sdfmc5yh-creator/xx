// p04 — 摇钱树枝: a hand-coloured specimen plate of one branch of a Han bronze money tree. Flat cast blades with awned edges,
// square-holed coins cast in one piece with the branch (short awns round every coin, no legend), malachite green with patches of
// cuprite red, on kraft-brown paper. The branch runs from the lower left to the upper right and is cropped by the frame.
// Built as a print: silhouette mask → watercolour wash (noise ramp) → relief shading from offset masks (light from the top-left)
// → engraved outline, inner lines and shadow-side hatching → soaked into the paper.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const N = 1400, TAU = Math.PI * 2;
let layer = null;

const poly = (g, P) => { g.beginPath(); for (let i = 0; i < P.length; i++) (i ? g.lineTo(P[i][0], P[i][1]) : g.moveTo(P[i][0], P[i][1])); g.closePath(); };
const tan = (pts, i) => { const n = pts.length, a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
function band(pts, hwFn) {
  const A = [], B = [], n = pts.length;
  for (let i = 0; i < n; i++) { const [tx, ty] = tan(pts, i), w = hwFn(i / (n - 1)); A.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); B.push([pts[i][0] + ty * w, pts[i][1] - tx * w]); }
  return A.concat(B.reverse());
}
function curve(x, y, ang, len, k0, k1, step = 4) {
  const pts = [[x, y]], n = Math.ceil(len / step);
  for (let i = 1; i <= n; i++) { const s = i / n; ang += (k0 + (k1 - k0) * s * s) * step; x += Math.cos(ang) * step; y += Math.sin(ang) * step; pts.push([x, y]); }
  return pts;
}
const prof = (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.955 + 0.045)), 0.8) * (1 - 0.3 * s);

function build() {
  const rnd = L.rng('p04');
  const fills = [], holes = [], reliefs = [], lines = [], grounds = [], anchors = [];
  const spine = L.smoothPath([[-80, 1310], [200, 1110], [470, 905], [720, 750], [975, 560], [1215, 395], [1480, 170]], 5);
  const M = spine.length;
  const at = (t) => { const i = Math.round(L.clamp(t) * (M - 1)), [tx, ty] = tan(spine, i); return { x: spine[i][0], y: spine[i][1], tx, ty, nx: -ty, ny: tx, ang: Math.atan2(ty, tx) }; };
  const hw = (t) => L.lerp(27, 14, t) + 2.5 * Math.sin(t * 46);

  // main branch: a flat band with a raised central rib
  const bandP = band(spine, hw);
  fills.push((g) => { poly(g, bandP); g.fill(); });
  const ribP = band(spine, (t) => hw(t) * 0.26);
  reliefs.push((g) => { poly(g, ribP); g.fill(); });
  for (let t = 0.06; t < 1; t += 0.06) { const p = at(t); anchors.push({ x: p.x, y: p.y, r: 26 }); }

  function addCoin(cx, cy, r, att, seed) {
    const rr = L.rng(seed), rot = att + rr.range(-0.45, 0.45), a = r * 0.34, wr = r * 0.12, wi = r * 0.075;
    const n = Math.round((TAU * r) / 12.5), tri = [];
    for (let k = 0; k < n; k++) {
      const an = (k / n) * TAU + 0.1, d = Math.abs(((an - att + Math.PI * 3) % TAU) - Math.PI);
      if (att !== null && d < 0.28) continue;
      const h = r * 0.1 + rr.range(2, 6), da = 2.9 / r;
      tri.push([[cx + Math.cos(an - da) * (r - 2), cy + Math.sin(an - da) * (r - 2)], [cx + Math.cos(an) * (r + h), cy + Math.sin(an) * (r + h)], [cx + Math.cos(an + da) * (r - 2), cy + Math.sin(an + da) * (r - 2)]]);
    }
    const sq = (g, h) => { g.save(); g.translate(cx, cy); g.rotate(rot); g.rect(-h, -h, 2 * h, 2 * h); g.restore(); };
    fills.push((g) => { for (const T of tri) { poly(g, T); g.fill(); } g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); });
    holes.push((g) => { g.beginPath(); sq(g, a); g.fill(); });
    reliefs.push((g) => {
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.moveTo(cx + r - wr, cy); g.arc(cx, cy, r - wr, 0, TAU); g.fill('evenodd');
      g.beginPath(); sq(g, a + wi); sq(g, a); g.fill('evenodd');
    });
    grounds.push((g) => { g.beginPath(); g.arc(cx, cy, r - wr, 0, TAU); sq(g, a + wi); g.fill('evenodd'); });
    lines.push((g) => {
      g.lineWidth = 1.3; g.beginPath(); g.arc(cx, cy, r - wr, 0, TAU); g.stroke();
      g.beginPath(); sq(g, a + wi); g.stroke();
      g.save(); g.globalAlpha *= 0.55; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r - 1.5, 0, TAU); g.stroke(); g.restore();
    });
    for (let k = 0; k < 2; k++) { const an = rr() * TAU; anchors.push({ x: cx + Math.cos(an) * r * 0.66, y: cy + Math.sin(an) * r * 0.66, r: r * 0.42 }); }
  }
  function hang(t, side, r, stalk, seed) {
    const p = at(t), d = hw(t) + stalk + r, cx = p.x + p.nx * side * d, cy = p.y + p.ny * side * d;
    const A = [p.x, p.y], B = [cx - p.nx * side * (r - 5), cy - p.ny * side * (r - 5)];
    const nk = band([A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], B], (s) => L.lerp(12, 8, s));
    fills.push((g) => { poly(g, nk); g.fill(); });
    addCoin(cx, cy, r, Math.atan2(-p.ny * side, -p.nx * side), seed);
  }
  function addLeaf(x, y, ang, len, W, bend, seed) {
    const c = curve(x, y, ang, len, bend, bend * 2.2), n = c.length, r = L.rng(seed);
    const sideP = (sgn) => {
      const out = [], teeth = Math.round(len / 15);
      for (let k = 0; k <= teeth * 2; k++) {
        const s = k / (teeth * 2), i = Math.min(n - 1, Math.round(s * (n - 1))), [tx, ty] = tan(c, i);
        let w = W * prof(s), fx = 0;
        if (k % 2 === 1 && s > 0.05 && s < 0.9) { w += r.range(7, 12.5) * Math.min(1, prof(s) * 1.7); fx = 6.5; }
        out.push([c[i][0] - ty * w * sgn + tx * fx, c[i][1] + tx * w * sgn + ty * fx]);
      }
      return out;
    };
    const P = sideP(1).concat(sideP(-1).reverse());
    fills.push((g) => { poly(g, P); g.fill(); });
    const mid = c.slice(0, Math.round(n * 0.94)), midP = band(mid, (s) => L.lerp(3.4, 1, s));
    reliefs.push((g) => { poly(g, midP); g.fill(); });
    const veins = [];
    for (let i = 5; i < n * 0.86; i += 6) for (const sgn of [1, -1]) {
      const [tx, ty] = tan(c, i), s = i / (n - 1), w = W * prof(s) * 0.86, fx = w * 0.75;
      veins.push([c[i][0], c[i][1], c[i][0] - ty * w * sgn * 0.5 + tx * fx * 0.35, c[i][1] + tx * w * sgn * 0.5 + ty * fx * 0.35, c[i][0] - ty * w * sgn + tx * fx, c[i][1] + tx * w * sgn + ty * fx]);
    }
    lines.push((g) => { g.lineWidth = 1.1; for (const v of veins) { g.beginPath(); g.moveTo(v[0], v[1]); g.quadraticCurveTo(v[2], v[3], v[4], v[5]); g.stroke(); } });
    anchors.push({ x: c[n >> 1][0], y: c[n >> 1][1], r: W * 0.6 }, { x: c[(n * 0.8) | 0][0], y: c[(n * 0.8) | 0][1], r: W * 0.4 });
  }
  function addTendril(x, y, ang, len, curl) {
    const c = curve(x, y, ang, len, -curl * 0.02, curl), P = band(c, (s) => L.lerp(8.5, 2.4, s));
    fills.push((g) => { poly(g, P); g.fill(); });
    const e = c[c.length - 1];
    fills.push((g) => { g.beginPath(); g.arc(e[0], e[1], 5, 0, TAU); g.fill(); });
  }
  const leafOn = (t, side, off, len, W, seed) => { const p = at(t); addLeaf(p.x + p.nx * side * hw(t) * 0.4, p.y + p.ny * side * hw(t) * 0.4, p.ang + side * off, len, W, -side * 0.0011, seed); };
  const tendrilOn = (t, side, off, len) => { const p = at(t); addTendril(p.x + p.nx * side * hw(t) * 0.5, p.y + p.ny * side * hw(t) * 0.5, p.ang + side * off, len, side * 0.07); };

  // upper side (side −1) and lower side (side +1): coin · blade · tendril · blade · coin …
  hang(0.08, -1, 100, 10, 'c1'); hang(0.47, -1, 128, 10, 'c2'); hang(0.80, -1, 108, 12, 'c3');
  hang(0.21, 1, 118, 13, 'c4'); hang(0.60, 1, 135, 16, 'c5'); hang(0.90, 1, 112, 14, 'c6');
  leafOn(0.165, -1, 0.95, 250, 46, 'l1'); tendrilOn(0.255, -1, 1.25, 250); leafOn(0.31, -1, 1.2, 205, 40, 'l2');
  leafOn(0.56, -1, 0.9, 235, 44, 'l3'); tendrilOn(0.635, -1, 1.3, 230); leafOn(0.675, -1, 1.3, 170, 34, 'l4');
  leafOn(0.878, -1, 0.9, 240, 44, 'l5'); tendrilOn(0.95, -1, 1.2, 220);
  leafOn(0.07, 1, 0.75, 200, 38, 'l6');
  leafOn(0.30, 1, 0.95, 250, 46, 'l7'); tendrilOn(0.372, 1, 1.25, 260); leafOn(0.43, 1, 1.25, 190, 38, 'l8');
  leafOn(0.69, 1, 0.95, 240, 44, 'l9'); tendrilOn(0.755, 1, 1.3, 230); leafOn(0.975, 1, 0.9, 220, 40, 'l10');
  // detached studies, as on a botanical plate: one coin with a broken stalk (top-left), one blade (lower-right)
  addCoin(330, 345, 96, -2.3, 'd1');
  { const nk = band([[330 - 62, 345 - 70], [330 - 80, 345 - 92], [330 - 92, 345 - 118]], (s) => L.lerp(9, 7, s)); fills.push((g) => { poly(g, nk); g.fill(); }); }
  addLeaf(1010, 1215, -0.5, 250, 44, 0.0012, 'd2');
  addTendril(1010, 1215, 2.4, 150, 0.085);

  // ── masks ──
  const mk = () => { const c = L.makeCanvas(N, N); return [c, c.getContext('2d')]; };
  const [sil, sg] = mk(); sg.fillStyle = '#fff'; fills.forEach((f) => f(sg));
  sg.globalCompositeOperation = 'destination-out'; holes.forEach((f) => f(sg)); sg.globalCompositeOperation = 'source-over';
  const [rel, rg] = mk(); rg.fillStyle = '#fff'; reliefs.forEach((f) => f(rg)); rg.globalCompositeOperation = 'destination-in'; rg.drawImage(sil, 0, 0);
  const edgeBand = (mask, dx, dy, color, blur) => { const [c, g] = mk(); g.fillStyle = color; g.fillRect(0, 0, N, N); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(mask, dx, dy); return blur ? L.blurred(c, blur) : c; };
  const castBand = (mask, dx, dy, color, blur) => { const [c, g] = mk(); g.fillStyle = color; g.fillRect(0, 0, N, N); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, dx, dy); g.globalCompositeOperation = 'destination-out'; g.drawImage(mask, 0, 0); return blur ? L.blurred(c, blur) : c; };

  // ── colour wash ──
  const col = L.noiseTex(N, N, { seed: 'p04mal', scale: 170, octaves: 5, warp: 0.5, res: 0.5, ramp: [[0, '#2b6455'], [0.3, '#3b8169'], [0.52, '#559a7c'], [0.74, '#83b693'], [1, '#b9d3ab']] });
  const cg = col.getContext('2d');
  cg.globalAlpha = 0.6; cg.globalCompositeOperation = 'soft-light';
  cg.drawImage(L.noiseTex(N, N, { seed: 'p04mot', scale: 26, octaves: 4, res: 0.5, ramp: [[0, '#0c2a22'], [1, '#e2f4e2']] }), 0, 0);
  cg.globalAlpha = 1; cg.globalCompositeOperation = 'multiply'; cg.fillStyle = 'rgba(40,96,82,0.55)'; grounds.forEach((f) => f(cg));
  cg.globalCompositeOperation = 'source-over';
  // cuprite red where the patina has flaked, powdery pale green where it has bloomed
  {
    const H = N / 2, pc = L.makeCanvas(H, H), pg = pc.getContext('2d'), im = pg.createImageData(H, H), d = im.data;
    const pc2 = L.makeCanvas(H, H), pg2 = pc2.getContext('2d'), im2 = pg2.createImageData(H, H), d2 = im2.data;
    const nz = L.makeNoise('p04red'), nz2 = L.makeNoise('p04pale'), ss = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < H; x++, i += 4) {
      const v = nz.fbm(x / 62, y / 62, 3) + 0.3 * nz.fbm(x / 9, y / 9, 2), e = ss(0.33, 0.43, v), dk = ss(0.52, 0.8, v);
      d[i] = 168 - 60 * dk; d[i + 1] = 78 - 34 * dk; d[i + 2] = 46 - 18 * dk; d[i + 3] = 235 * e;
      const w = nz2.fbm(x / 48, y / 48, 3) + 0.25 * nz2.fbm(x / 7, y / 7, 2), e2 = ss(0.2, 0.4, w);
      d2[i] = 196; d2[i + 1] = 226; d2[i + 2] = 200; d2[i + 3] = 150 * e2;
    }
    pg.putImageData(im, 0, 0); pg2.putImageData(im2, 0, 0);
    cg.imageSmoothingQuality = 'high'; cg.drawImage(pc2, 0, 0, N, N); cg.drawImage(pc, 0, 0, N, N);
  }
  anchors.forEach((a) => {                                              // flecks of bare copper and dark cuprite, clustered
    if (!rnd.chance(0.4)) return;
    for (let j = 0; j < 12; j++) { cg.fillStyle = L.rgba(rnd.chance(0.5) ? '#7c2f20' : '#c0623a', rnd.range(0.4, 0.8)); cg.beginPath(); cg.ellipse(a.x + rnd.range(-a.r, a.r) * 1.2, a.y + rnd.range(-a.r, a.r) * 1.2, rnd.range(1, 3.4), rnd.range(0.8, 2.2), rnd() * 3, 0, TAU); cg.fill(); }
  });
  // drawn micro-structure: pitting dots and pale bloom specks
  for (let i = 0; i < 9000; i++) { const x = rnd() * N, y = rnd() * N; cg.fillStyle = rnd.chance(0.6) ? L.rgba('#123a30', rnd.range(0.25, 0.6)) : L.rgba('#cfeeda', rnd.range(0.3, 0.7)); cg.beginPath(); cg.ellipse(x, y, rnd.range(0.6, 1.9), rnd.range(0.5, 1.3), rnd() * 3, 0, TAU); cg.fill(); }
  // relief: soft form shadow on the lower-right, crisp edge shadows / highlights on every raised part
  cg.globalCompositeOperation = 'multiply';
  cg.globalAlpha = 0.5; cg.drawImage(edgeBand(sil, -13, -17, '#1c4a40', 7), 0, 0);
  cg.globalAlpha = 0.5; cg.drawImage(castBand(rel, 3.5, 4.5, '#143a31', 1.2), 0, 0);
  cg.globalAlpha = 0.7; cg.drawImage(edgeBand(rel, -2.5, -3, '#0f3029', 0.7), 0, 0);
  cg.globalAlpha = 0.65; cg.drawImage(edgeBand(sil, -3.5, -4.5, '#0f3029', 0.9), 0, 0);
  cg.globalCompositeOperation = 'source-over';
  cg.globalAlpha = 0.5; cg.drawImage(edgeBand(rel, 2.2, 2.8, '#e6efd2', 0.6), 0, 0);
  cg.globalAlpha = 0.42; cg.drawImage(edgeBand(sil, 3, 4, '#e6efd2', 0.8), 0, 0);
  cg.globalAlpha = 1; cg.globalCompositeOperation = 'destination-in'; cg.drawImage(sil, 0, 0); cg.globalCompositeOperation = 'source-over';

  // ── ink: outline (heavier on the shadow side), inner lines, hatching ──
  const INK = '#2b2616';
  const [ink, ig] = mk();
  for (let k = 0; k < 8; k++) ig.drawImage(sil, Math.cos((k / 8) * TAU) * 1.25, Math.sin((k / 8) * TAU) * 1.25);
  ig.drawImage(sil, 1.9, 2.3);
  ig.globalCompositeOperation = 'source-in'; ig.fillStyle = INK; ig.fillRect(0, 0, N, N);
  ig.globalCompositeOperation = 'destination-out'; ig.drawImage(sil, 0, 0); ig.globalCompositeOperation = 'source-over';
  const [inn, ng] = mk(); ng.strokeStyle = INK; ng.lineCap = 'round'; ng.globalAlpha = 0.8; lines.forEach((f) => f(ng));
  ng.globalAlpha = 1; ng.globalCompositeOperation = 'destination-in'; ng.drawImage(sil, 0, 0);
  const [hat, hg] = mk(); hg.strokeStyle = INK; hg.lineCap = 'round';
  for (let o = -N; o < N; o += 4.6) { hg.globalAlpha = rnd.range(0.6, 0.92); hg.lineWidth = rnd.range(0.85, 1.2); const j = rnd.range(-0.8, 0.8); hg.beginPath(); hg.moveTo(o + j + N, 0); hg.lineTo(o + j, N); hg.stroke(); }
  hg.globalAlpha = 1; hg.globalCompositeOperation = 'destination-in'; hg.drawImage(edgeBand(sil, -15, -19, '#fff', 0), 0, 0);

  // ── page ──
  const lay = K.paper({ base: '#c4a77c', tone: '#6a4622', seed: 'p04paper', size: N, fiber: 0.75, stain: 0.4, foxing: 0.3, edge: 0.24 });
  const g = lay.getContext('2d');
  K.soak(col, lay, 0.55); K.wear(col, { seed: 'p04w', amount: 0.22, size: 1.5 });
  const [halo, hl] = mk(); hl.drawImage(sil, 0, 0); hl.globalCompositeOperation = 'source-in'; hl.fillStyle = '#5a4520'; hl.fillRect(0, 0, N, N);
  g.globalAlpha = 0.11; g.drawImage(L.blurred(halo, 7), 2, 3);
  g.globalAlpha = 0.96; g.drawImage(col, 1.2, 0.8);                    // wash sits a hair off the key plate
  g.globalAlpha = 0.9; g.drawImage(hat, 0, 0); g.drawImage(inn, 0, 0);
  g.globalAlpha = 1; g.drawImage(ink, 0, 0);
  return lay;
}

export default {
  name: '摇钱树枝',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.045, x0: 24, y0: -16, x1: -24, y1: 16 });
  },
};
