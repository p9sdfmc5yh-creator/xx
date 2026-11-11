// g36 — 围棋子: slate-black go stones on a kaya board with lacquer grid lines, spelling the CURRENT glyph; a few white stones
// lie scattered well outside it. Nothing here knows which character it is: the grid pitch follows K.glyphInfo().strokeWidth
// (a stroke is about two stones wide), the grid is slid to the phase where the stones fit the strokes best, and a stone sits
// on every intersection that K.inGlyph accepts. Top view, light from the top-left: lens-shaped stones shaded per device
// pixel (L.pixelCanvas), contact + cast shadows on the board, a little occlusion where a stone stands in its neighbour's light.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
// key light (from the top-left, fairly high) and the half vector towards the camera, which looks straight down
const LX = -0.36, LY = -0.43, LZ = 0.83, HX = -0.188, HY = -0.2247, HZ = 0.956;
let layer = null;

// ───────────────────────── where the stones go ─────────────────────────
function layout(info) {
  const sw = info.strokeWidth, STEP = Math.max(16, Math.round(sw * 0.43)), rad = STEP * 0.462, margin = rad * 0.45;
  const b = info.bbox, P = 4, sx0 = b.x0 - STEP, sy0 = b.y0 - STEP;
  const cols = Math.ceil((b.x1 - b.x0 + 2 * STEP) / P), rows = Math.ceil((b.y1 - b.y0 + 2 * STEP) / P);
  const ins = new Uint8Array(cols * rows);                                  // the glyph, sampled every P px
  for (let j = 0, k = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) ins[k] = K.inGlyph(sx0 + (i + 0.5) * P, sy0 + (j + 0.5) * P) ? 1 : 0;
  const n = Math.ceil(S / STEP) + 5, kind = new Uint8Array(n * n);          // lattice index i = -2 … n - 3 ; 0 empty, 1 black, 2 white
  const at = (i, j) => (j + 2) * n + i + 2;
  const pick = (ox, oy) => { for (let j = -2; j < n - 2; j++) for (let i = -2; i < n - 2; i++) kind[at(i, j)] = K.inGlyph(ox + i * STEP, oy + j * STEP, margin) ? 1 : 0; };
  // slide the grid: of M × M phases keep the one whose stones cover the strokes best and spill least into the gaps
  let best = null; const M = 10;
  for (let a = 0; a < M; a++) for (let c = 0; c < M; c++) {
    const ox = (a / M) * STEP, oy = (c / M) * STEP; pick(ox, oy);
    let miss = 0, spill = 0;
    for (let j = 0, k = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) {
      const px = sx0 + (i + 0.5) * P, py = sy0 + (j + 0.5) * P, li = Math.round((px - ox) / STEP), lj = Math.round((py - oy) / STEP);
      let cov = false;
      if (li >= -2 && li < n - 2 && lj >= -2 && lj < n - 2 && kind[at(li, lj)]) { const dx = px - ox - li * STEP, dy = py - oy - lj * STEP; cov = dx * dx + dy * dy < rad * rad; }
      if (ins[k]) { if (!cov) miss++; } else if (cov) spill++;
    }
    const score = miss + spill * 3.2;                                      // a stone in a gap costs more than a bare bit of stroke: counters must stay open
    if (!best || score < best.score) best = { score, ox, oy };
  }
  const { ox, oy } = best; pick(ox, oy);
  // no stroke may fall between the lines: every bead on a stroke's centre line needs a stone on one of the four intersections around it
  for (const bd of K.pack({ seed: 'g36beads', rmin: sw * 0.2 })) {
    const i0 = Math.floor((bd.x - ox) / STEP), j0 = Math.floor((bd.y - oy) / STEP);
    let any = false, bi = 0, bj = 0, bsd = -1;
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const i = i0 + di, j = j0 + dj;
      if (kind[at(i, j)]) any = true; else { const sd = K.sdGlyph(ox + i * STEP, oy + j * STEP); if (sd < bsd) { bsd = sd; bi = i; bj = j; } }
    }
    if (!any && bsd < -1) kind[at(bi, bj)] = 1;
  }
  // a handful of white stones far from the strokes (never inside a counter), some of them in pairs, as in a game
  const r = L.rng('g36white' + info.key), free = [];
  const ok = (i, j) => { const x = ox + i * STEP, y = oy + j * STEP; return x > rad + 10 && x < S - rad - 10 && y > rad + 10 && y < S - rad - 10 && !kind[at(i, j)] && K.sdGlyph(x, y) > STEP * 2.6; };
  for (let j = -1; j < n - 3; j++) for (let i = -1; i < n - 3; i++) if (ok(i, j)) free.push([i, j]);
  const want = Math.min(free.length, L.clamp(Math.round(free.length * 0.04), 4, 11));
  for (let k = 0, guard = 0; k < want && guard < 400; guard++) {
    const [i, j] = r.pick(free); if (!ok(i, j)) continue;
    kind[at(i, j)] = 2; k++;
    if (r() < 0.6) { const [di, dj] = r.pick([[1, 1], [1, -1], [2, 0], [0, 2], [2, 1], [1, 2], [1, 0], [0, 1]]); if (ok(i + di, j + dj)) kind[at(i + di, j + dj)] = 2; }
  }
  return { STEP, rad, ox, oy, n, kind, at };
}

// ───────────────────────── the board ─────────────────────────
/** straight-grained kaya, computed per device pixel: fine growth rings running down the board, fibre streaks, a few pores */
function kaya() {
  const nz = L.makeNoise('g36kaya'), tr = L.rng('g36rings'), tone = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) tone[i] = tr.range(-1, 1);
  const D = [166, 114, 52], M = [217, 171, 97], T = [241, 209, 144];
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q;
        const u = x + nz.n2(x / 560, y / 1700) * 18 + nz.n2(x / 120 + 9.1, y / 640) * 3;       // the grain wanders a little
        const v = u / 5.6 + nz.n2(u / 150 + 3.3, y / 2800) * 2.2;                              // ring coordinate: rings of uneven width
        const vi = Math.floor(v), f = v - vi, rt = tone[vi & 1023];
        const late = f * f * f * (f > 0.86 ? 1 - ((f - 0.86) / 0.14) ** 2 : 1) * (0.65 + 0.35 * rt);   // latewood: darkens, then stops short
        const fibre = nz.n2(u / 1.4, y / 60), pore = nz.n2(u / 0.8 + 40, y / 12), mott = nz.n2(x / 240 + 5, y / 1000 - 3);
        let t = 0.58 + mott * 0.09 + rt * 0.04 - late * 0.39 + fibre * 0.045;
        if (pore > 0.7) t -= (pore - 0.7) * 0.6;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const a = t < 0.5 ? D : M, b = t < 0.5 ? M : T, m = t < 0.5 ? t * 2 : t * 2 - 1;
        d[k] = a[0] + (b[0] - a[0]) * m; d[k + 1] = a[1] + (b[1] - a[1]) * m; d[k + 2] = a[2] + (b[2] - a[2]) * m; d[k + 3] = 255;
      }
    }
  });
}

function board(g, lat) {
  const { STEP, ox, oy } = lat;
  g.drawImage(kaya(), 0, 0);
  const r = L.rng('g36grain');
  g.lineCap = 'round';
  for (let i = 0; i < 280; i++) {                                              // long straight-grain lines
    const x = r() * S, y = r() * S - 80, len = r.range(80, 340), w = r.range(-3, 3);
    g.strokeStyle = r() < 0.6 ? `rgba(122,74,26,${r.range(0.05, 0.14).toFixed(3)})` : `rgba(255,234,184,${r.range(0.05, 0.14).toFixed(3)})`;
    g.lineWidth = r.range(0.5, 1.2);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w, y + len * 0.5, x + w * 0.4, y + len); g.stroke();
  }
  for (let i = 0; i < 420; i++) {                                              // a few short dark flecks along the grain
    const x = r() * S, y = r() * S, len = r.range(3, 9);
    g.strokeStyle = `rgba(98,58,20,${r.range(0.06, 0.16).toFixed(3)})`; g.lineWidth = r.range(0.4, 0.8);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-0.4, 0.4), y + len); g.stroke();
  }
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,242,205,0.16)'], [0.5, 'rgba(255,242,205,0)'], [1, 'rgba(70,36,8,0.22)']]);
  g.fillRect(0, 0, S, S);
  // lacquer grid: slightly raised lines — a thin shadow on the lower-right, a sheen on the upper-left edge, uneven loading along the stroke
  const lw = Math.max(1.1, STEP * 0.048), i1 = Math.ceil(S / STEP) + 1, offs = [];
  for (let k = -1; k <= i1; k++) offs.push([r.range(-0.3, 0.3), r.range(-0.3, 0.3)]);
  g.lineCap = 'butt';
  for (let pass = 0; pass < 3; pass++) for (let k = -1; k <= i1; k++) for (const vert of [false, true]) {
    const p = (vert ? ox : oy) + k * STEP + offs[k + 1][vert ? 1 : 0], o2 = vert ? oy : ox;
    for (let s = -1; s < i1; s++) {
      const t0 = o2 + s * STEP - 0.6, t1 = o2 + (s + 1) * STEP + 0.6;
      let d = 0;
      if (pass === 0) { g.strokeStyle = 'rgba(74,40,10,0.24)'; g.lineWidth = lw + 0.9; d = lw * 0.45; }
      else if (pass === 1) { g.strokeStyle = `rgba(22,15,10,${r.range(0.80, 0.94).toFixed(3)})`; g.lineWidth = lw + r.range(-0.12, 0.16); }
      else { g.strokeStyle = `rgba(150,124,96,${r.range(0.14, 0.32).toFixed(3)})`; g.lineWidth = Math.max(0.35, lw * 0.26); d = -lw * 0.2; }
      g.beginPath();
      if (vert) { g.moveTo(p + d, t0 + d); g.lineTo(p + d, t1 + d); } else { g.moveTo(t0 + d, p + d); g.lineTo(t1 + d, p + d); }
      g.stroke();
    }
  }
  const ic = Math.round((S / 2 - ox) / STEP), jc = Math.round((S / 2 - oy) / STEP);                      // star points, every sixth line
  for (let j = -1; j <= i1; j++) for (let i = -1; i <= i1; i++) {
    if ((i - ic) % 6 || (j - jc) % 6) continue;
    g.fillStyle = 'rgba(20,13,8,0.92)'; g.beginPath(); g.arc(ox + i * STEP, oy + j * STEP, STEP * 0.1, 0, TAU); g.fill();
  }
}

// ───────────────────────── the stones ─────────────────────────
/** one go stone seen from above: a lens (flat dome, edge rolling over), lit from the top-left. Body shaded per device pixel, wear drawn on top. */
function stoneSprite(rad, white, seed) {
  const r = L.rng(seed), nz = L.makeNoise(seed), w = Math.ceil(rad * 2) + 6;
  const phi = r() * Math.PI, cs = Math.cos(phi), sn = Math.sin(phi), bow = r.range(0.3, 1.1), lam = Math.max(2.4, rad * r.range(0.16, 0.22)), ph0 = r() * TAU;
  const c = L.pixelCanvas(w, w, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) for (let i = 0; i < pw; i++, k += 4) {
      const x = (i + 0.5) / q - w / 2, y = (j + 0.5) / q - w / 2, dist = Math.hypot(x, y), al = L.clamp((rad - dist) * q + 0.5);
      if (al <= 0) continue;
      const rho = Math.min(1, dist / rad), s = 0.54 * rho + 0.46 * rho ** 6, inv = dist > 1e-6 ? s / dist : 0;   // sin of the surface tilt
      const along = x * cs + y * sn, across = -x * sn + y * cs;
      let nx = x * inv, ny = y * inv;
      if (!white) { nx += nz.n2(x / 1.3 + 7, y / 1.3) * 0.022; ny += nz.n2(x / 1.3, y / 1.3 + 13) * 0.022; }       // slate is matt: a fine tooth breaks the sheen
      const nn = nx * nx + ny * ny, nzz = nn < 1 ? Math.sqrt(1 - nn) : 0;
      const sh = (0.5 + 0.5 * (nx * LX + ny * LY + nzz * LZ)) ** 2;                                                // wrapped diffuse: lit flank → form shadow
      const nh = Math.max(0, nx * HX + ny * HY + nzz * HZ), spec = Math.pow(nh, 170) * 0.95 + Math.pow(nh, 40) * 0.30;   // hot core + soft bloom
      const fr = (1 - nzz) ** 3, side = -(nx * 0.64 + ny * 0.77);
      const rimL = fr * Math.max(0, side), rimB = fr * Math.max(0, -side);                                         // rim catching the sky / the board's warm bounce
      let R, G, B;
      if (white) {
        const line = 0.5 + 0.5 * Math.sin(((along + bow * across * across / rad) * TAU) / lam + ph0 + 1.4 * nz.n2(along / 9, across / 30));
        const alb = 1 - 0.045 * line * line + 0.02 * nz.n2(x / 5, y / 5);                                           // faint parallel grain in the white
        R = 0.955 * alb * (0.47 + 0.55 * sh) + spec * 0.9 + rimL * 0.30 + rimB * 0.20;
        G = 0.940 * alb * (0.44 + 0.56 * sh) + spec * 0.9 + rimL * 0.30 + rimB * 0.12;
        B = 0.895 * alb * (0.38 + 0.57 * sh) + spec * 0.9 + rimL * 0.30 + rimB * 0.04;
      } else {
        const alb = (1 + 0.26 * nz.n2(along / 1.2, across / 34) + 0.12 * nz.n2(x / 6 + 3, y / 6)) * (0.22 + sh);   // cleavage striae of the slate
        const sheen = Math.pow(nh, 16) * 0.13;
        R = 0.135 * alb + sheen * 0.90 + spec * 0.92 + rimL * 0.26 + rimB * 0.25;
        G = 0.138 * alb + sheen * 0.94 + spec * 0.95 + rimL * 0.29 + rimB * 0.17;
        B = 0.152 * alb + sheen * 1.00 + spec * 1.00 + rimL * 0.34 + rimB * 0.08;
      }
      d[k] = R * 255; d[k + 1] = G * 255; d[k + 2] = B * 255; d[k + 3] = al * 255;
    }
  });
  const q = c.getContext('2d'), u = rad / 22.6;
  q.translate(w / 2, w / 2); q.globalCompositeOperation = 'source-atop';
  if (!white) {                                                  // a few pale dust specks
    for (let k = 0, n = r.int(2, 5); k < n; k++) {
      const a = r() * TAU, d = rad * Math.sqrt(r()) * 0.9;
      q.fillStyle = `rgba(206,200,188,${r.range(0.14, 0.32).toFixed(3)})`;
      q.beginPath(); q.ellipse(Math.cos(a) * d, Math.sin(a) * d, r.range(0.5, 1.0) * u, r.range(0.4, 0.8) * u, r() * 3, 0, TAU); q.fill();
    }
  }
  for (let k = 0, n = r.int(1, 3); k < n; k++) {                  // hairline scuffs from the bowl
    const a = r() * TAU, d = rad * r() * 0.6, len = r.range(5, 13) * u, t = r() * TAU;
    q.strokeStyle = white ? `rgba(120,104,78,${r.range(0.10, 0.20).toFixed(3)})` : `rgba(170,176,190,${r.range(0.10, 0.20).toFixed(3)})`; q.lineWidth = Math.max(0.35, 0.6 * u);
    q.beginPath(); q.moveTo(Math.cos(a) * d, Math.sin(a) * d); q.lineTo(Math.cos(a) * d + Math.cos(t) * len, Math.sin(a) * d + Math.sin(t) * len); q.stroke();
  }
  return { c, rad };
}

function build() {
  const info = K.glyphInfo(), lat = layout(info), { STEP, rad, ox, oy, n, kind, at } = lat;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  board(g, lat);
  const r = L.rng('g36stones' + info.key);
  const blacks = [], whites = [];
  for (let k = 0; k < 30; k++) blacks.push(stoneSprite(rad * r.range(0.975, 1.02), false, 'g36b' + k));
  for (let k = 0; k < 10; k++) whites.push(stoneSprite(rad * r.range(0.975, 1.02), true, 'g36w' + k));
  const stones = new Map();                                       // row by row from the top-left, the order they are drawn in
  for (let j = -2; j < n - 2; j++) for (let i = -2; i < n - 2; i++) {
    const kd = kind[at(i, j)]; if (!kd) continue;
    const spr = r.pick(kd === 2 ? whites : blacks);
    stones.set(at(i, j), { i, j, x: ox + i * STEP + r.range(-0.028, 0.028) * STEP, y: oy + j * STEP + r.range(-0.028, 0.028) * STEP, rad: spr.rad, spr: spr.c });
  }
  // shadows on the board: the union of all the stones, blurred — a wide soft one, the cast shadow, and a tight dark contact line
  const shadow = (dx, dy, k, blur, alpha, col) => {
    const sc = L.makeCanvas(S, S), q = sc.getContext('2d'); q.fillStyle = col;
    for (const s of stones.values()) { q.beginPath(); q.arc(s.x + dx * STEP, s.y + dy * STEP, s.rad * k, 0, TAU); q.fill(); }
    g.save(); g.globalAlpha = alpha; g.filter = `blur(${(blur * STEP).toFixed(2)}px)`; g.drawImage(sc, 0, 0); g.restore();
  };
  shadow(0.11, 0.14, 1.06, 0.22, 0.32, '#2a1605');
  shadow(0.13, 0.165, 0.985, 0.07, 0.62, '#221003');
  shadow(0.03, 0.04, 0.975, 0.03, 0.62, '#160a02');
  for (const s of stones.values()) {
    K.stamp(g, s.spr, s.x, s.y, { shadow: false });
    for (const nb of [stones.get(at(s.i - 1, s.j)), stones.get(at(s.i, s.j - 1))]) {     // the neighbour on the lit side takes some of its light
      if (!nb) continue;
      const cx = nb.x + 0.11 * STEP, cy = nb.y + 0.14 * STEP;
      g.save(); g.beginPath(); g.arc(s.x, s.y, s.rad - 0.3, 0, TAU); g.clip();
      g.fillStyle = L.radial(g, cx, cy, nb.rad * 0.9, nb.rad * 1.32, [[0, 'rgba(8,5,2,0.5)'], [1, 'rgba(8,5,2,0)']]);
      g.fillRect(s.x - s.rad, s.y - s.rad, s.rad * 2, s.rad * 2);
      g.restore();
    }
  }
  return c;
}

export default {
  name: '围棋子',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
