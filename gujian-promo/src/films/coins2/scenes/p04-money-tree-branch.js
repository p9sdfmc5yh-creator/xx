// p04 — 摇钱树枝: a hand-coloured specimen plate of one branch of a Han bronze money tree. Flat cast blades with awned edges,
// square-holed coins cast in one piece with the branch (plain raised rim, upright square hole, no legend; two of them keep a few
// thin awns on the upper edge), malachite green with flaked patches of cuprite red, on kraft-brown paper. The branch runs from
// the lower left to the upper right and is cropped by the frame.
// Built as a print of a thin casting lying on the sheet: silhouette mask → watercolour wash (noise ramp) → corrosion map computed
// per DEVICE pixel (flake edges are drawn contours, the red lies one layer below the green) → relief shading from offset masks
// (light from the top-left: lit arris, shaded flank) → visible side wall, contact shadow and soft cast shadow on the paper
// → engraved outline and veins → soaked into the paper.
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
  const fills = [], holes = [], reliefs = [], lines = [], veinsAll = [], grounds = [], shades = [], hair = [], anchors = [];
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

  // a coin: plain raised outer rim, square hole set upright (its sides horizontal / vertical, ±2.5° at most) with a raised inner rim,
  // worn flat field. awn > 0 leaves that many thin awns of unequal length on the upper edge.
  function addCoin(cx, cy, r, seed, awn = 0, awnAt = -Math.PI / 2) {
    const rr = L.rng(seed), rot = rr.range(-0.044, 0.044), a = r * 0.34, wr = r * 0.125, wi = r * 0.08;
    const tri = [], LEN = [0.19, 0.33, 0.13, 0.27, 0.16];
    for (let k = 0; k < awn; k++) {
      const an = awnAt + (k - (awn - 1) / 2) * 0.23 + rr.range(-0.045, 0.045), tip = an + rr.range(-0.02, 0.02);
      const h = r * LEN[(k + awn) % 5] * rr.range(0.9, 1.12), da = 3.1 / r;
      tri.push([[cx + Math.cos(an - da) * (r - 2), cy + Math.sin(an - da) * (r - 2)], [cx + Math.cos(tip) * (r + h), cy + Math.sin(tip) * (r + h)], [cx + Math.cos(an + da) * (r - 2), cy + Math.sin(an + da) * (r - 2)]]);
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
      g.lineWidth = 0.9; g.beginPath(); g.arc(cx, cy, r - wr, 0, TAU); g.stroke();
      g.beginPath(); sq(g, a + wi); g.stroke();
    });
    // hairline wear scratches on the field
    const scr = [];
    for (let k = 0; k < 16; k++) { const an = rr() * TAU, d = rr.range(a * 1.2, r - wr - 4), l = rr.range(5, 17), dir = rr() * TAU; scr.push([cx + Math.cos(an) * d, cy + Math.sin(an) * d, Math.cos(dir) * l, Math.sin(dir) * l, rr.range(-2, 2), rr.chance(0.6), rr.range(0.2, 0.42)]); }
    hair.push((g) => {
      g.save(); g.beginPath(); g.arc(cx, cy, r - wr - 2, 0, TAU); sq(g, a + wi + 2); g.clip('evenodd'); g.lineWidth = 0.6;
      for (const s of scr) { g.strokeStyle = s[5] ? `rgba(214,236,206,${s[6]})` : `rgba(16,52,42,${s[6]})`; g.beginPath(); g.moveTo(s[0], s[1]); g.quadraticCurveTo(s[0] + s[2] * 0.5 - s[3] * 0.1 * s[4], s[1] + s[3] * 0.5 + s[2] * 0.1 * s[4], s[0] + s[2], s[1] + s[3]); g.stroke(); }
      g.restore();
    });
    for (let k = 0; k < 2; k++) { const an = rr() * TAU; anchors.push({ x: cx + Math.cos(an) * r * 0.66, y: cy + Math.sin(an) * r * 0.66, r: r * 0.42 }); }
  }
  function hang(t, side, r, stalk, seed, awn = 0, awnAt) {
    const p = at(t), d = hw(t) + stalk + r, cx = p.x + p.nx * side * d, cy = p.y + p.ny * side * d;
    const A = [p.x, p.y], B = [cx - p.nx * side * (r - 5), cy - p.ny * side * (r - 5)];
    const nk = band([A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], B], (s) => L.lerp(12, 8, s));
    fills.push((g) => { poly(g, nk); g.fill(); });
    addCoin(cx, cy, r, seed, awn, awnAt);
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
    const sA = sideP(1), sB = sideP(-1), P = sA.concat(sB.slice().reverse());
    fills.push((g) => { poly(g, P); g.fill(); });
    // the half of the blade that turns away from the light (the blade is very slightly creased along its midrib)
    const [mx, my] = tan(c, n >> 1), half = (-my * 0.62 + mx * 0.78 > 0 ? sA : sB).concat(c.slice().reverse());
    shades.push((g) => { poly(g, half); g.fill(); });
    const mid = c.slice(0, Math.round(n * 0.94)), midP = band(mid, (s) => L.lerp(3.4, 1, s));
    reliefs.push((g) => { poly(g, midP); g.fill(); });
    const veins = [], forks = [];
    for (let i = 5; i < n * 0.86; i += 6) for (const sgn of [1, -1]) {
      const [tx, ty] = tan(c, i), s = i / (n - 1), w = W * prof(s) * 0.86, fx = w * 0.75;
      const v = [c[i][0], c[i][1], c[i][0] - ty * w * sgn * 0.5 + tx * fx * 0.35, c[i][1] + tx * w * sgn * 0.5 + ty * fx * 0.35, c[i][0] - ty * w * sgn + tx * fx, c[i][1] + tx * w * sgn + ty * fx];
      veins.push(v);
      if (w > 15) {                                                      // a veinlet forking off towards the tip
        const u = r.range(0.5, 0.66), bx = (1 - u) * (1 - u) * v[0] + 2 * (1 - u) * u * v[2] + u * u * v[4], by = (1 - u) * (1 - u) * v[1] + 2 * (1 - u) * u * v[3] + u * u * v[5];
        forks.push([bx, by, bx + tx * w * 0.2 - ty * sgn * w * 0.1, by + ty * w * 0.2 + tx * sgn * w * 0.1, bx + tx * w * 0.36 - ty * sgn * w * 0.3, by + ty * w * 0.36 + tx * sgn * w * 0.3]);
      }
    }
    veinsAll.push((g) => {
      g.lineWidth = 1.1; for (const v of veins) { g.beginPath(); g.moveTo(v[0], v[1]); g.quadraticCurveTo(v[2], v[3], v[4], v[5]); g.stroke(); }
      g.lineWidth = 0.65; for (const v of forks) { g.beginPath(); g.moveTo(v[0], v[1]); g.quadraticCurveTo(v[2], v[3], v[4], v[5]); g.stroke(); }
    });
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
  hang(0.08, -1, 100, 10, 'c1'); hang(0.47, -1, 128, 10, 'c2', 5, -Math.PI / 2 - 0.22); hang(0.80, -1, 108, 12, 'c3');
  hang(0.21, 1, 118, 13, 'c4'); hang(0.60, 1, 135, 16, 'c5'); hang(0.90, 1, 112, 14, 'c6');
  leafOn(0.165, -1, 0.95, 250, 46, 'l1'); tendrilOn(0.255, -1, 1.25, 250); leafOn(0.31, -1, 1.2, 205, 40, 'l2');
  leafOn(0.56, -1, 0.9, 235, 44, 'l3'); tendrilOn(0.635, -1, 1.3, 230); leafOn(0.675, -1, 1.3, 170, 34, 'l4');
  leafOn(0.878, -1, 0.9, 240, 44, 'l5'); tendrilOn(0.95, -1, 1.2, 220);
  leafOn(0.07, 1, 0.75, 200, 38, 'l6');
  leafOn(0.30, 1, 0.95, 250, 46, 'l7'); tendrilOn(0.372, 1, 1.25, 260); leafOn(0.43, 1, 1.25, 190, 38, 'l8');
  leafOn(0.69, 1, 0.95, 240, 44, 'l9'); tendrilOn(0.755, 1, 1.3, 230); leafOn(0.975, 1, 0.9, 220, 40, 'l10');
  // detached studies, as on a botanical plate: one coin with a broken stalk (top-left), one blade (lower-right)
  addCoin(330, 345, 96, 'd1', 3, -Math.PI / 2 + 0.2);
  { const nk = band([[330 - 62, 345 - 70], [330 - 80, 345 - 92], [330 - 92, 345 - 118]], (s) => L.lerp(9, 7, s)); fills.push((g) => { poly(g, nk); g.fill(); }); }
  addLeaf(1010, 1215, -0.5, 250, 44, 0.0012, 'd2');
  addTendril(1010, 1215, 2.4, 150, 0.085);

  // ── masks ──
  const mk = () => { const c = L.makeCanvas(N, N); return [c, c.getContext('2d')]; };
  const [sil, sg] = mk(); sg.fillStyle = '#fff'; fills.forEach((f) => f(sg));
  sg.globalCompositeOperation = 'destination-out'; holes.forEach((f) => f(sg)); sg.globalCompositeOperation = 'source-over';
  const [rel, rg] = mk(); rg.fillStyle = '#fff'; reliefs.forEach((f) => f(rg)); rg.globalCompositeOperation = 'destination-in'; rg.drawImage(sil, 0, 0);
  // cut(dst, mask, ax, ay, bx, by, …): paint [mask placed at a] minus [mask placed at b] in one flat colour onto dst.
  // a = (0,0), b = (dx,dy) → the band of the mask whose neighbour towards (dx,dy) is empty (an edge); a = (dx,dy), b = (0,0) → what it casts.
  const [tmp, tg] = mk();
  const cut = (dst, mask, ax, ay, bx, by, color, alpha, blur = 0, op = 'source-over', brk = null) => {
    tg.globalCompositeOperation = 'copy'; tg.fillStyle = color; tg.fillRect(0, 0, N, N);
    tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, ax, ay);
    if (bx !== null) { tg.globalCompositeOperation = 'destination-out'; tg.drawImage(mask, bx, by); }
    if (brk) { tg.globalCompositeOperation = 'destination-out'; tg.drawImage(brk, 0, 0); }
    dst.save(); dst.globalAlpha = alpha; dst.globalCompositeOperation = op; if (blur) dst.filter = `blur(${blur}px)`; dst.drawImage(tmp, 0, 0); dst.restore();
  };

  // ── corrosion map, computed per DEVICE pixel: pale bloom, and flakes where the green has come off and the cuprite shows ──
  const patina = L.pixelCanvas(N, N, (d, pw, ph, q) => {
    const m = L.getRaw(sil).data, F = new Float32Array(pw * ph).fill(NaN);
    const nr = L.makeNoise('p04red'), np = L.makeNoise('p04pale'), ng = L.makeNoise('p04grain');
    const T = 0.37, T2 = T + 0.1, T3 = T + 0.21, TH = T - 0.06, iq = 1 / q, cl = L.clamp;
    for (let j = 0, i = 0; j < ph; j++) {
      const y = (j + 0.5) * iq;
      for (let k = 0; k < pw; k++, i++) { if (!m[i * 4 + 3]) continue; const x = (k + 0.5) * iq; F[i] = nr.fbm(x / 124, y / 124, 3) + 0.3 * nr.fbm(x / 18, y / 18, 3); }
    }
    // offsets towards the light (top-left), in device pixels
    const o1 = Math.round(2.6 * q) * pw + Math.round(2.0 * q), o2 = Math.round(5.6 * q) * pw + Math.round(4.4 * q), o3 = Math.round(2.2 * q) * pw + Math.round(1.7 * q);
    const B = Math.round(6 * q) + 1;
    let r = 0, g = 0, b = 0, a = 0;
    const over = (R, G, Bl, A) => { if (!(A > 0)) return; const na = A + a * (1 - A); r = (R * A + r * a * (1 - A)) / na; g = (G * A + g * a * (1 - A)) / na; b = (Bl * A + b * a * (1 - A)) / na; a = na; };
    for (let j = B; j < ph - B; j++) {
      const y = (j + 0.5) * iq;
      for (let k = B, i = j * pw + B; k < pw - B; k++, i++) {
        const f = F[i]; if (f !== f) continue;
        const x = (k + 0.5) * iq;
        r = g = b = a = 0;
        // powdery pale bloom: a flat wash with a firm edge where the pigment collected
        const w = np.fbm(x / 96, y / 96, 3) + 0.25 * np.fbm(x / 14, y / 14, 2);
        if (w > 0.25) { const c1 = cl((w - 0.27) / 0.014 + 0.5), rim = 1 - cl((w - 0.298) / 0.014 + 0.5), c2 = cl((w - 0.43) / 0.07 + 0.5); over(196, 226, 200, c1 * (0.36 + 0.16 * rim + 0.2 * c2)); }
        if (f > T - 0.25) {
          const fl = F[i - 1], fr = F[i + 1], fu = F[i - pw], fd = F[i + pw];
          const gx = ((fr === fr ? fr : f) - (fl === fl ? fl : f)) * 0.5, gy = ((fd === fd ? fd : f) - (fu === fu ? fu : f)) * 0.5;
          const gm = Math.hypot(gx, gy) + 1e-5;                           // slope per device pixel
          const dT = (f - T) / gm;                                        // signed distance to the flake edge in device pixels (inside > 0)
          over(176, 212, 176, 0.55 * cl((f - TH) / gm + 0.5) * cl(0.5 - dT));          // pale rim of loosened patina round the flake
          if (dT > -0.5) {
            const c2 = cl((f - T2) / gm + 0.5), c3 = cl((f - T3) / gm + 0.5);            // strata: orange-red → cuprite → dark core
            const gr = 1 + 0.09 * ng.n2(x / 1.9, y / 1.9) + 0.07 * ng.n2(x / 7, y / 7);
            const s1 = F[i - o1], s2 = F[i - o2];                         // the green layer above shades the red along its top-left edge
            let sh = gr;
            if (s1 === s1) sh *= 1 - 0.42 * cl((T - s1) / gm + 0.5);
            if (s2 === s2) sh *= 1 - 0.2 * cl((T - s2) / gm + 0.5);
            over((186 - 38 * c2 - 40 * c3) * sh, (93 - 33 * c2 - 18 * c3) * sh, (58 - 18 * c2 - 8 * c3) * sh, 0.95 * cl(dT + 0.5));
            over(70, 28, 20, 0.4 * (cl(0.35 * q - Math.abs(f - T2) / gm + 0.5) + cl(0.35 * q - Math.abs(f - T3) / gm + 0.5)));
          }
          if (dT < 0.5) { const h1 = F[i - o3]; if (h1 === h1) over(238, 246, 218, 0.72 * cl((h1 - T) / gm + 0.5) * cl(0.5 - dT)); }   // lit lip on the far side
          over(50, 25, 16, 0.85 * cl((0.5 + 0.28 * ng.n2(x / 29, y / 29)) * q - Math.abs(dT) + 0.5));                              // drawn boundary
        }
        const p = i * 4; d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = a * 255;
      }
    }
  });

  // ── colour wash ──
  const col = L.noiseTex(N, N, { seed: 'p04mal', scale: 170, octaves: 5, warp: 0.5, res: 0.25, ramp: [[0, '#2b6455'], [0.3, '#3b8169'], [0.52, '#559a7c'], [0.74, '#83b693'], [1, '#b9d3ab']] });
  const cg = col.getContext('2d');
  cg.globalAlpha = 0.6; cg.globalCompositeOperation = 'soft-light';
  cg.drawImage(L.noiseTex(N, N, { seed: 'p04mot', scale: 26, octaves: 4, res: 0.5, ramp: [[0, '#0c2a22'], [1, '#e2f4e2']] }), 0, 0);
  cg.globalAlpha = 1; cg.globalCompositeOperation = 'multiply';
  cg.fillStyle = 'rgba(40,96,82,0.55)'; grounds.forEach((f) => f(cg));
  cg.fillStyle = 'rgba(52,112,94,0.34)'; shades.forEach((f) => f(cg));
  cg.globalCompositeOperation = 'source-over';
  cut(cg, rel, 0, 0, null, null, '#dcebc6', 0.12);                      // worn tops of the raised parts are a shade paler
  cg.drawImage(patina, 0, 0);
  anchors.forEach((a) => {                                              // flecks of bare copper and dark cuprite, clustered
    if (!rnd.chance(0.3)) return;
    for (let j = 0; j < 10; j++) { cg.fillStyle = L.rgba(rnd.chance(0.5) ? '#7c2f20' : '#c0623a', rnd.range(0.4, 0.8)); cg.beginPath(); cg.ellipse(a.x + rnd.range(-a.r, a.r) * 1.2, a.y + rnd.range(-a.r, a.r) * 1.2, rnd.range(0.8, 2.6), rnd.range(0.6, 1.8), rnd() * 3, 0, TAU); cg.fill(); }
  });
  // drawn micro-structure: pitting dots (each with a lit lower-right lip), pale bloom specks, hairline scratches
  for (let i = 0; i < 11000; i++) {
    const x = rnd() * N, y = rnd() * N, rx = rnd.range(0.5, 1.7), ry = rnd.range(0.45, 1.2), ro = rnd() * 3;
    if (rnd.chance(0.6)) { cg.fillStyle = L.rgba('#d6ecd0', 0.4); cg.beginPath(); cg.ellipse(x + 0.5, y + 0.65, rx, ry, ro, 0, TAU); cg.fill(); cg.fillStyle = L.rgba('#123a30', rnd.range(0.35, 0.7)); }
    else cg.fillStyle = L.rgba('#cfeeda', rnd.range(0.3, 0.7));
    cg.beginPath(); cg.ellipse(x, y, rx, ry, ro, 0, TAU); cg.fill();
  }
  cg.lineCap = 'round'; hair.forEach((f) => f(cg));
  // veins stand a little proud: a light line on the lit side of each inked one
  cg.save(); cg.translate(-0.9, -1.15); cg.strokeStyle = 'rgba(232,244,214,0.5)'; veinsAll.forEach((f) => f(cg)); cg.restore();

  // ── relief (light from the top-left). The casting is a thin flat sheet: flat faces, crisp edges ──
  const brk = L.noiseTex(N, N, { seed: 'p04brk', scale: 30, octaves: 2, res: 0.25, ramp: [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [0.68, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0.75)']] });
  cut(cg, sil, 0, 0, -10, -13, '#1c4a40', 0.44, 5, 'multiply');        // the face falls off a little towards its shadow side
  // raised parts (outer rim, inner rim, ribs): shadow cast on the ground, dark flank, lit flank with a bright arris
  cut(cg, rel, 3.4, 4.4, 0, 0, '#123a30', 0.5, 1.4, 'multiply');
  cut(cg, rel, 1.3, 1.7, 0, 0, '#0d2a23', 0.62, 0.3, 'multiply');
  cut(cg, rel, 0, 0, -2.2, -2.8, '#0f3029', 0.55, 0.5, 'multiply');
  cut(cg, rel, 0, 0, 3.6, 4.6, '#d5e8c4', 0.3, 1.2);
  cut(cg, rel, 0, 0, 1.3, 1.7, '#f4f8e4', 0.8, 0.25, 'source-over', brk);
  // the edge of the sheet itself: chamfer lit on the top-left (soft band + bright arris), in shade on the lower-right
  cut(cg, sil, 0, 0, -4.6, -5.9, '#0c2b24', 0.55, 1.2, 'multiply');
  cut(cg, sil, 0, 0, -1.6, -2.1, '#081f1a', 0.7, 0.3, 'multiply');
  cut(cg, sil, 0, 0, 4.4, 5.6, '#cfe6c4', 0.4, 1.2);
  cut(cg, sil, 0, 0, 1.5, 1.9, '#f6fae8', 0.88, 0.25, 'source-over', brk);
  cg.globalAlpha = 1; cg.globalCompositeOperation = 'destination-in'; cg.drawImage(sil, 0, 0); cg.globalCompositeOperation = 'source-over';

  // ── thickness: the solid = the face plus its side wall, seen on the side turned away from the light ──
  const TX = 3.1, TY = 4.0;
  const [uni, ug] = mk(); for (let k = 0; k <= 8; k++) ug.drawImage(sil, (TX * k) / 8, (TY * k) / 8);

  // ── ink: outline round the solid, inner lines (no hatching: regular short strokes along a rim read as milling) ──
  const INK = '#2b2616';
  const [ink, ig] = mk();
  for (let k = 0; k < 8; k++) ig.drawImage(uni, Math.cos((k / 8) * TAU) * 1.1, Math.sin((k / 8) * TAU) * 1.1);
  ig.globalCompositeOperation = 'source-in'; ig.fillStyle = INK; ig.fillRect(0, 0, N, N);
  ig.globalCompositeOperation = 'destination-out'; ig.drawImage(uni, 0, 0); ig.globalCompositeOperation = 'source-over';
  const [inn, ng] = mk(); ng.strokeStyle = INK; ng.lineCap = 'round'; ng.globalAlpha = 0.8; lines.forEach((f) => f(ng)); veinsAll.forEach((f) => f(ng));
  ng.globalAlpha = 1; ng.globalCompositeOperation = 'destination-in'; ng.drawImage(sil, 0, 0);

  // ── page ──
  const lay = K.paper({ base: '#c4a77c', tone: '#6a4622', seed: 'p04paper', size: N, fiber: 0.75, stain: 0.4, foxing: 0.3, edge: 0.24 });
  const g = lay.getContext('2d');
  K.soak(col, lay, 0.5); K.wear(col, { seed: 'p04w', amount: 0.18, size: 1.3 });
  // shadows on the paper: a soft cast shadow thrown to the lower right, and a tight dark contact shadow under the edge
  const [shd, sh] = mk(); sh.drawImage(uni, 0, 0); sh.globalCompositeOperation = 'source-in'; sh.fillStyle = '#4b3414'; sh.fillRect(0, 0, N, N);
  g.save(); g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.56; g.filter = 'blur(8.5px)'; g.drawImage(shd, 10, 13);
  g.globalAlpha = 0.62; g.filter = 'blur(1.6px)'; g.drawImage(shd, 2, 2.6);
  g.restore();
  // side wall (in shade; its foot picks up a little light bounced off the paper)
  sh.fillStyle = '#143029'; sh.fillRect(0, 0, N, N); g.drawImage(shd, 0, 0);
  cut(g, uni, 0, 0, -1.2, -1.55, '#6a6a45', 0.4, 0.4);
  g.globalAlpha = 0.98; g.drawImage(col, 0, 0);
  g.globalAlpha = 0.9; g.drawImage(inn, 0, 0);
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
