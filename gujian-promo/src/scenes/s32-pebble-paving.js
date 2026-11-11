// s32 — 花街铺地. Straight down onto the rim of a round pebble-mosaic medallion in a Jiangnan garden path.
// The arc = the outer edge of the medallion's rim, two rows of grey roof tiles set on edge (瓦条).
// Inside it: pebbles packed as tightly as cells — two rows of small blue-grey ones under the rim, then a band of
// white pebbles carrying begonia (海棠) quatrefoils outlined with curved tiles and filled with teal / blue-black
// pebbles, then the bigger pebbles of the medallion's interior. Outside (above): pale stone slabs, kept quiet for the text.
//
// Recipe: seeds are dart-thrown per region, relaxed (Lloyd), and every pebble is the rounded power-diagram cell of its
// seed, clipped by the tile strips — so stones never cross an outline and the gaps are only a few px of dark soil.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 120;                       // rot is tiny and zoom ≥ 1, so a modest margin is plenty
const LW = W + PAD * 2, LH = H + PAD * 2;
let S = null;

// ── radial layout (dr in px; negative = inside the medallion) ──
const TILE_W = 9.5;                    // thickness of a roof tile seen on edge
const ROW_A = -6.25, ROW_B = -17.25;   // the two tile rows of the rim; its outer face sits on dr = 0
const RIM_IN = -22;
const R1_ROWS = [-32, -48.5];          // two rows of small blue-grey pebbles
const S1 = -62.5;                      // tile strip closing that ring
const BAND_TOP = -67, BAND_BOT = -363; // the white band that carries the begonias
const S2 = -367.5, RING2 = -386, S3 = -404.5, FIELD_TOP = -409;
const HW = 4.5;                        // half width of a tile strip
// begonia quatrefoil: four round lobes on the tangent / radial axes around a round heart
const F_PITCH = 430;                   // spacing along the arc (px at dr = 0)
const F_DR = -215, F_D = 70, F_RHO = 62, F_RC = 27;

const K_RING1 = 1, K_GROUND = 2, K_PETAL = 3, K_HEART = 4, K_RING2 = 5, K_FIELD = 6;

const WHITE = ['#e6e2d8', '#ece8dc', '#dfdacd', '#e9e0cb', '#dad7ce', '#f0ece2', '#ddd5c3', '#e4e1da'];
const WHITE_ODD = ['#c9c6bc', '#d5c7a7', '#bfc4c0', '#cdbfa4'];
const OCHRE = ['#c9a77c', '#bd9a70', '#d1b48c'];
const GREY = ['#5d6b6e', '#566469', '#687679', '#4f5d61', '#6e7b7d', '#5a6970'];
const DARK = ['#3f4c50', '#465458', '#39464a', '#4d5a5e', '#34403f'];
const TEAL = ['#2f8a80', '#2a7f77', '#37958a', '#278279', '#3a9c8f', '#2c8c86', '#23756d', '#35907f'];
const TILE = ['#2a2c2e', '#2f3235', '#25272a', '#34383b', '#2c2e2d', '#2a2c2e'];

// ───────────────────────── geometry helpers ─────────────────────────
function makeGrid(x0, y0, x1, y1, cs) {
  const nx = Math.ceil((x1 - x0) / cs), ny = Math.ceil((y1 - y0) / cs);
  let cells = new Array(nx * ny);
  return {
    add(i, x, y) {
      const cx = Math.floor((x - x0) / cs), cy = Math.floor((y - y0) / cs);
      if (cx < 0 || cy < 0 || cx >= nx || cy >= ny) return;
      const k = cy * nx + cx; (cells[k] || (cells[k] = [])).push(i);
    },
    each(x, y, rad, fn) {
      const ax = Math.max(0, Math.floor((x - rad - x0) / cs)), bx = Math.min(nx - 1, Math.floor((x + rad - x0) / cs));
      const ay = Math.max(0, Math.floor((y - rad - y0) / cs)), by = Math.min(ny - 1, Math.floor((y + rad - y0) / cs));
      for (let cy = ay; cy <= by; cy++) for (let cx = ax; cx <= bx; cx++) {
        const c = cells[cy * nx + cx]; if (c) for (let q = 0; q < c.length; q++) fn(c[q]);
      }
    },
    clear() { cells = new Array(nx * ny); },
  };
}
/** keep the part of a convex polygon where (q − p)·n ≤ t */
function clipHalf(poly, px, py, nx, ny, t) {
  const n = poly.length; const d = new Array(n); let any = false;
  for (let k = 0; k < n; k++) { d[k] = (poly[k][0] - px) * nx + (poly[k][1] - py) * ny - t; if (d[k] > 0) any = true; }
  if (!any) return poly;
  const out = [];
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n, a = poly[k], b = poly[k2], da = d[k], db = d[k2];
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) { const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
  }
  return out;
}
function centroid(poly, ox, oy) {
  let A = 0, cx = 0, cy = 0; const n = poly.length;
  for (let k = 0; k < n; k++) {
    const x0 = poly[k][0] - ox, y0 = poly[k][1] - oy, x1 = poly[(k + 1) % n][0] - ox, y1 = poly[(k + 1) % n][1] - oy;
    const c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (Math.abs(A) < 1e-6) return [ox, oy, 0];
  return [ox + cx / (3 * A), oy + cy / (3 * A), Math.abs(A) / 2];
}

// ───────────────────────── the paving model: tile strips + pebbles ─────────────────────────
function buildModel(env) {
  const a = env.arc;
  const SP = a.span(PAD + 150);
  const DTH = F_PITCH / a.R;
  const NF = Math.ceil(SP / DTH);
  const X0 = -PAD - 70, X1 = W + PAD + 70, Y0 = a.crestY - 60, Y1 = H + PAD + 70;
  const inBounds = (x, y) => x > X0 && x < X1 && y > Y0 && y < Y1;

  // ── tile strips (polylines sampled every ~2 px) and their "ghost" discs that pebbles may not cross ──
  const strips = [];
  const gx = [], gy = [], ghw = [];
  const ghostGrid = makeGrid(X0, Y0, X1, Y1, 28);
  const addStrip = (pts, o = {}) => {
    const hw = o.hw || HW;
    strips.push({ pts, w: hw * 2, piece: o.piece || 120 });
    for (let i = 0; i < pts.length; i += 2) {
      if (!inBounds(pts[i][0], pts[i][1])) continue;
      ghostGrid.add(gx.length, pts[i][0], pts[i][1]); gx.push(pts[i][0]); gy.push(pts[i][1]); ghw.push(hw);
    }
  };
  const arcLine = (dr, t0 = -SP, t1 = SP) => {
    const n = Math.ceil(((a.R + dr) * (t1 - t0)) / 2); const pts = [];
    for (let i = 0; i <= n; i++) { const p = a.pt(L.lerp(t0, t1, i / n), dr); pts.push([p.x, p.y]); }
    return pts;
  };
  const circLine = (cx, cy, r, a0, a1) => {
    const n = Math.max(4, Math.ceil((r * Math.abs(a1 - a0)) / 2)); const pts = [];
    for (let i = 0; i <= n; i++) { const t = L.lerp(a0, a1, i / n); pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    return pts;
  };
  const segLine = (x0, y0, x1, y1) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)); const pts = [];
    for (let i = 0; i <= n; i++) pts.push([L.lerp(x0, x1, i / n), L.lerp(y0, y1, i / n)]);
    return pts;
  };
  addStrip(arcLine(ROW_A), { hw: TILE_W / 2, piece: 150 });
  addStrip(arcLine(ROW_B), { hw: TILE_W / 2, piece: 150 });
  addStrip(arcLine(S1), { piece: 140 });
  addStrip(arcLine(S2), { piece: 140 });
  addStrip(arcLine(S3), { piece: 140 });
  // begonias
  const hCusp = Math.sqrt(F_RHO * F_RHO - (F_D * F_D) / 2);
  const cusp = F_D / Math.SQRT2 + hCusp;                       // where two neighbouring lobes meet
  const lobeHalf = Math.atan2(F_D / 2 + hCusp / Math.SQRT2, hCusp / Math.SQRT2 - F_D / 2);
  for (let i = -NF; i <= NF; i++) {
    const tc = i * DTH, C = a.pt(tc, F_DR);
    for (let k = 0; k < 4; k++) {
      const b = tc + (k * Math.PI) / 2;
      addStrip(circLine(C.x + F_D * Math.cos(b), C.y + F_D * Math.sin(b), F_RHO, b - lobeHalf, b + lobeHalf), { piece: 112 });
      const bd = b + Math.PI / 4;
      addStrip(segLine(C.x + (F_RC + HW) * Math.cos(bd), C.y + (F_RC + HW) * Math.sin(bd), C.x + (cusp - 3) * Math.cos(bd), C.y + (cusp - 3) * Math.sin(bd)), { piece: 200, hw: 3.6 });
    }
    addStrip(circLine(C.x, C.y, F_RC, tc + 0.5, tc + 0.5 + L.TAU), { piece: 88 });
  }

  // ── which part of the design a point belongs to ──
  const classify = (x, y) => {
    const dx = x - a.cx, dy = a.cy - y, dr = Math.hypot(dx, dy) - a.R;
    if (dr > RIM_IN) return null;
    if (dr > S1 + HW) return { k: K_RING1, dr };
    if (dr > BAND_TOP) return null;
    if (dr > BAND_BOT) {
      const th = Math.atan2(dx, dy), tc = Math.round(th / DTH) * DTH, C = a.pt(tc, F_DR);
      const c = Math.cos(tc), s = Math.sin(tc), ux = x - C.x, uy = y - C.y;
      const lx = ux * c + uy * s, ly = -ux * s + uy * c, fr = Math.hypot(lx, ly);
      if (fr < F_RC) return { k: K_HEART, dr, fr };
      if (fr < F_D + F_RHO) {
        if (Math.hypot(lx - F_D, ly) < F_RHO || Math.hypot(lx + F_D, ly) < F_RHO || Math.hypot(lx, ly - F_D) < F_RHO || Math.hypot(lx, ly + F_D) < F_RHO) return { k: K_PETAL, dr, fr };
      }
      return { k: K_GROUND, dr, fr };
    }
    if (dr > S2 - HW) return null;
    if (dr > S3 + HW) return { k: K_RING2, dr };
    if (dr > FIELD_TOP) return null;
    return { k: K_FIELD, dr };
  };

  // ── seeds ──
  const r = L.rng('s32seeds');
  const px = [], py = [], pr = [], pph = [], pfix = [], ptag = [];
  const pebGrid = makeGrid(X0, Y0, X1, Y1, 28);
  const add = (x, y, rad, fixed = false, tag = 0) => { pebGrid.add(px.length, x, y); px.push(x); py.push(y); pr.push(rad); pph.push(r() * L.TAU); pfix.push(fixed); ptag.push(tag); };
  // set rows: the craftsman's neat courses of small stones between the tile strips
  const row = (dr, lo, hi, phase) => {
    const len = (a.R + dr) * SP; let s = -len + phase;
    while (s < len) {
      const step = r.range(lo, hi), p = a.pt((s + step / 2) / (a.R + dr), dr + r.range(-0.8, 0.8));
      if (inBounds(p.x, p.y)) add(p.x, p.y, step * 0.5);
      s += step;
    }
  };
  row(R1_ROWS[0], 18.2, 21.2, 0); row(R1_ROWS[1], 18.2, 21.2, 9.5);
  row(RING2, 24.5, 29, 0);
  for (let i = -NF; i <= NF; i++) { const C = a.pt(i * DTH, F_DR); if (inBounds(C.x, C.y)) add(C.x, C.y, F_RC - HW - 1.5, true); }
  // between two begonias: a little rosette (梅花点) — one teal stone ringed by six blue-black ones
  for (let i = -NF - 1; i <= NF; i++) {
    const tm = (i + 0.5) * DTH, M = a.pt(tm, F_DR);
    if (!inBounds(M.x, M.y)) continue;
    add(M.x, M.y, 11.5, true, 1);
    for (let k = 0; k < 6; k++) { const b = tm + Math.PI / 6 + (k * Math.PI) / 3; add(M.x + 22.6 * Math.cos(b), M.y + 22.6 * Math.sin(b), 10.8, true, 2); }
  }
  // dart throwing with a size that depends on the region; later passes wedge smaller stones into the holes
  const radiusFor = (c) => (c.k === K_GROUND ? L.lerp(13, 17.5, L.clamp((BAND_TOP - c.dr) / (BAND_TOP - BAND_BOT))) * r.range(0.86, 1.14)
    : c.k === K_PETAL ? r.range(10.4, 13.2)
      : L.lerp(21, 34, L.smooth((FIELD_TOP - c.dr) / 300)) * r.range(0.82, 1.15));
  const darts = (n, dr0, dr1, scale, minR) => {
    for (let q = 0; q < n; q++) {
      const p = a.pt(r.range(-SP, SP), r.range(dr0, dr1));
      if (!inBounds(p.x, p.y)) continue;
      const c = classify(p.x, p.y);
      if (!c || (c.k !== K_GROUND && c.k !== K_PETAL && c.k !== K_FIELD)) continue;
      const rad = Math.max(minR, radiusFor(c) * scale);
      let ok = true;
      ghostGrid.each(p.x, p.y, rad + 8, (j) => { if (ok && Math.hypot(gx[j] - p.x, gy[j] - p.y) < 0.78 * rad + ghw[j]) ok = false; });
      if (!ok) continue;
      pebGrid.each(p.x, p.y, rad + 44, (j) => { if (ok && Math.hypot(px[j] - p.x, py[j] - p.y) < 0.88 * (rad + pr[j])) ok = false; });
      if (ok) add(p.x, p.y, rad);
    }
  };
  darts(60000, BAND_BOT, BAND_TOP, 1, 9);
  darts(26000, BAND_BOT, BAND_TOP, 0.8, 8);
  darts(26000, BAND_BOT, BAND_TOP, 0.62, 6.5);
  darts(26000, BAND_BOT, BAND_TOP, 0.46, 5.2);
  darts(26000, -700, FIELD_TOP, 1, 14);
  darts(14000, -700, FIELD_TOP, 0.75, 12);
  darts(14000, -700, FIELD_TOP, 0.52, 9);

  // ── cells: power diagram between stones, tangent planes against the tile strips ──
  const N = px.length;
  const cell = (i, inset) => {
    const x = px[i], y = py[i], rad = pr[i], w = rad * rad, R0 = 1.75 * rad;
    const ins = inset ? 0.8 + 0.045 * rad : 0;
    let poly = [];
    for (let k = 0; k < 8; k++) { const t = pph[i] + (k / 8) * L.TAU; poly.push([x + R0 * Math.cos(t), y + R0 * Math.sin(t)]); }
    pebGrid.each(x, y, 3.6 * rad + 40, (j) => {
      if (j === i || poly.length < 3) return;
      const dx = px[j] - x, dy = py[j] - y, D2 = dx * dx + dy * dy; if (D2 < 1e-6) return;
      const D = Math.sqrt(D2);
      let t = (D2 + w - pr[j] * pr[j]) / (2 * D) - ins; if (t > R0) return; if (t < 0.5) t = 0.5;
      poly = clipHalf(poly, x, y, dx / D, dy / D, t);
    });
    ghostGrid.each(x, y, R0 + 12, (j) => {
      if (poly.length < 3) return;
      const dx = gx[j] - x, dy = gy[j] - y, D = Math.hypot(dx, dy); if (D < 1e-3) return;
      let t = D - ghw[j] - (inset ? 0.9 : 0); if (t > R0) return; if (t < 0.5) t = 0.5;
      poly = clipHalf(poly, x, y, dx / D, dy / D, t);
    });
    return poly;
  };
  for (let it = 0; it < 3; it++) {
    const nx = new Array(N), ny = new Array(N);
    for (let i = 0; i < N; i++) {
      nx[i] = px[i]; ny[i] = py[i];
      if (pfix[i]) continue;
      const poly = cell(i, false); if (poly.length < 3) continue;
      const c = centroid(poly, px[i], py[i]); if (c[2] <= 0) continue;
      nx[i] = L.lerp(px[i], c[0], 0.8); ny[i] = L.lerp(py[i], c[1], 0.8);
    }
    pebGrid.clear();
    for (let i = 0; i < N; i++) { px[i] = nx[i]; py[i] = ny[i]; pebGrid.add(i, px[i], py[i]); }
  }

  // ── final stones: rounded cells + colour by region ──
  const rc = L.rng('s32colour');
  const pebbles = [];
  for (let i = 0; i < N; i++) {
    const poly = cell(i, true); if (poly.length < 3) continue;
    const [cx, cy, area] = centroid(poly, px[i], py[i]); if (area < 30) continue;
    let inr = 1e9; const n = poly.length;
    for (let k = 0; k < n; k++) {
      const p0 = poly[k], p1 = poly[(k + 1) % n], ex = p1[0] - p0[0], ey = p1[1] - p0[1], el = Math.hypot(ex, ey); if (el < 1e-6) continue;
      inr = Math.min(inr, Math.abs((cx - p0[0]) * ey - (cy - p0[1]) * ex) / el);
    }
    if (inr < 2 || inr > 1e8) continue;
    const lim = inr * 1.36; let maxr = 0;
    const v = poly.map(([vx, vy]) => {
      let dx = vx - cx, dy = vy - cy, d = Math.hypot(dx, dy);
      if (d > lim) { const nd = lim + (d - lim) * 0.22; dx *= nd / d; dy *= nd / d; d = nd; }
      if (d > maxr) maxr = d;
      return [cx + dx, cy + dy];
    });
    const path = new Path2D();
    path.moveTo((v[n - 1][0] + v[0][0]) / 2, (v[n - 1][1] + v[0][1]) / 2);
    for (let k = 0; k < n; k++) { const q = v[(k + 1) % n]; path.quadraticCurveTo(v[k][0], v[k][1], (v[k][0] + q[0]) / 2, (v[k][1] + q[1]) / 2); }
    path.closePath();
    const c = classify(cx, cy) || classify(px[i], py[i]); if (!c) continue;
    let col, light = false;
    const u = rc(), u2 = rc();
    if (ptag[i] === 1) col = rc.pick(TEAL);
    else if (ptag[i] === 2) col = rc.pick(DARK);
    else if (c.k === K_RING1) col = u < 0.2 ? rc.pick(GREY) : L.shade(rc.pick(GREY), 0.1);
    else if (c.k === K_RING2) col = u < 0.6 ? rc.pick(DARK) : rc.pick(GREY);
    else if (c.k === K_PETAL) col = c.fr < 57 ? (u < 0.75 ? rc.pick(DARK) : rc.pick(GREY)) : rc.pick(TEAL);
    else if (c.k === K_HEART) { col = '#efe9d8'; light = true; }
    else if (c.k === K_FIELD) { if (u < 0.06) col = rc.pick(GREY); else { col = u < 0.14 ? rc.pick(WHITE_ODD) : rc.pick(WHITE); light = true; } }
    else { col = u < 0.022 ? rc.pick(OCHRE) : u < 0.07 ? rc.pick(WHITE_ODD) : rc.pick(WHITE); light = true; }
    pebbles.push({ path, cx, cy, inr, maxr, col: L.shade(col, (u2 - 0.5) * 0.1), light, kind: c.k, u: u2 });
  }
  return { pebbles, strips };
}

// ───────────────────────── painting ─────────────────────────
/** the pale stone slabs outside the medallion (kept very quiet: the tagline sits here) */
function buildGround(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const GH = Math.min(LH, Math.round(a.yAt(-PAD, 0) + PAD + 40));   // nothing below the arc's lowest point is ever seen
    g.fillStyle = '#ece7d9'; g.fillRect(-PAD, -PAD, LW, LH);
    // long slabs in concentric courses; the one under the tagline is wide enough that no joint enters the text zone
    const SP = a.span(PAD + 200), CH = 284, SL = 700 / a.R;
    const offs = [0.5, 0.18, 0.66];
    const r = L.rng('s32slab');
    for (let k = 0; k < 3; k++) for (let j = Math.floor(-SP / SL) - 1; j <= Math.ceil(SP / SL); j++) {
      const t0 = (j + offs[k]) * SL;
      const tint = r.chance(0.5) ? L.rgba('#ffffff', r.range(0.02, 0.13)) : L.rgba('#ab9e82', r.range(0.02, 0.11));
      if (k === 0 && j === -1) continue;
      g.fillStyle = tint; a.pathBand(g, (k + 1) * CH, k * CH, t0, t0 + SL); g.fill();
    }
    // broad, very soft tonal drift
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.32;
    g.drawImage(L.noiseTex(LW, GH, { seed: 's32g1', scale: 560, octaves: 3, warp: 0.4, res: 0.2, ramp: [[0, '#d9d1bd'], [0.55, '#f8f5ee'], [1, '#ffffff']] }), -PAD, -PAD);
    // the grain of the stone as micro relief
    const grainH = L.noiseTex(LW, GH, { seed: 's32g2', scale: 7, octaves: 3, res: 0.5, contrast: 1.7 });
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.24;
    g.drawImage(L.bumpLight(grainH, { angle: 45, strength: 0.9, res: 0.5 }), -PAD, -PAD);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.12;
    g.drawImage(grainH, -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    L.speckle(g, { seed: 's32gs', count: 4200, x: -PAD, y: -PAD, w: LW, h: GH, rMin: 0.4, rMax: 1.4, colors: ['#b8ad96', '#fffdf6', '#a39882', '#cfc6b2'], alpha: [0.08, 0.36] });
    // joints: sand-filled, a thin shadowed centre and a lit lower lip
    const groove = (trace) => {
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(110,98,76,0.05)'; g.lineWidth = 16; trace();        // grime creeping out of the joint
      g.strokeStyle = 'rgba(124,112,90,0.26)'; g.lineWidth = 3.4; trace();
      g.strokeStyle = 'rgba(86,76,58,0.3)'; g.lineWidth = 1; trace();
      g.save(); g.translate(1.3, 1.7); g.strokeStyle = 'rgba(255,253,246,0.4)'; g.lineWidth = 1; trace(); g.restore();
    };
    for (let k = 0; k < 3; k++) {
      if (k > 0) groove(() => a.stroke(g, k * CH));
      for (let j = Math.floor(-SP / SL) - 1; j <= Math.ceil(SP / SL); j++) {
        const t = (j + offs[k]) * SL, p0 = a.pt(t, k * CH + (k ? 0 : 1)), p1 = a.pt(t, (k + 1) * CH);
        groove(() => { g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke(); });
      }
    }
    // grime gathering against the rim
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 54, [[0, 'rgba(84,70,48,0.36)'], [0.28, 'rgba(84,70,48,0.13)'], [1, 'rgba(84,70,48,0)']]);
    a.pathBand(g, 54, -2); g.fill();
    // the same low sun that rakes the pebbles: a breath warmer upper left, cooler lower right
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.linear(g, 0, -100, W, H, [[0, 'rgba(255,240,206,0.2)'], [0.5, 'rgba(255,240,206,0)'], [1, 'rgba(24,30,52,0.2)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
  });
}

function tracePiece(g, pts, i0, i1, ox, oy) {
  g.beginPath(); g.moveTo(pts[i0][0] + ox, pts[i0][1] + oy);
  for (let i = i0 + 1; i <= i1; i++) g.lineTo(pts[i][0] + ox, pts[i][1] + oy);
  g.stroke();
}
/** cut every strip into tile-length pieces with an open joint between them */
function tilePieces(strips) {
  const r = L.rng('s32tiles'); const out = [];
  for (const s of strips) {
    const n = s.pts.length; let i0 = 0;
    while (i0 < n - 2) {
      let i1 = Math.min(n - 1, i0 + Math.max(4, Math.round((s.piece * r.range(0.72, 1.2)) / 2)));
      if (n - 1 - i1 < 9) i1 = n - 1;
      out.push({ pts: s.pts, i0, i1, w: s.w * r.range(0.9, 1.06), col: r.chance(0.12) ? '#42474a' : r.pick(TILE), u: r() });
      i0 = i1 + 1;
    }
  }
  return out;
}

function buildPaving(env, model, ground) {
  const a = env.arc; const { pebbles } = model;
  const pieces = tilePieces(model.strips);

  // the stones on their own transparent layer (so they can throw one soft contact shadow together)
  const peb = L.makeLayer(PAD, (g) => {
    const r = L.rng('s32veins');
    for (const p of pebbles) {
      const hi = p.light ? 0.75 : 0.3, lo = p.light ? 0.4 : 0.52;
      const gr = g.createRadialGradient(p.cx - p.inr * 0.36, p.cy - p.inr * 0.4, p.inr * 0.05, p.cx + p.inr * 0.08, p.cy + p.inr * 0.1, p.maxr * 1.1);
      gr.addColorStop(0, L.shade(p.col, hi)); gr.addColorStop(0.42, p.col); gr.addColorStop(0.8, L.shade(p.col, -lo * 0.5)); gr.addColorStop(1, L.shade(p.col, -lo));
      g.fillStyle = gr; g.fill(p.path);
      // a vein or a band of another mineral on some stones
      if (p.inr > 7 && r.chance(0.2)) {
        g.save(); g.clip(p.path);
        const ang = r.range(0, Math.PI), off = r.range(-0.5, 0.5) * p.inr, ca = Math.cos(ang), sa = Math.sin(ang);
        g.strokeStyle = p.light ? L.rgba('#8f8672', r.range(0.16, 0.34)) : L.rgba('#dfe8e4', r.range(0.18, 0.4));
        g.lineWidth = r.range(0.8, 2.6);
        g.beginPath(); g.moveTo(p.cx - ca * 60 - sa * off, p.cy - sa * 60 + ca * off);
        g.quadraticCurveTo(p.cx - sa * (off + r.range(-5, 5)), p.cy + ca * (off + r.range(-5, 5)), p.cx + ca * 60 - sa * off, p.cy + sa * 60 + ca * off);
        g.stroke(); g.restore();
      }
    }
  });

  // tiles on edge (瓦条): shadow, lit upper-left arris, body, then the matte texture of fired clay
  const tiles = L.makeLayer(PAD, (g) => {
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(10,8,6,0.5)';
    for (const t of pieces) { g.lineWidth = t.w + 1.5; tracePiece(g, t.pts, t.i0, t.i1, 1.6, 2.2); }
    for (const t of pieces) {
      g.strokeStyle = L.shade(t.col, 0.34); g.lineWidth = t.w; tracePiece(g, t.pts, t.i0, t.i1, 0, 0);
      g.strokeStyle = L.shade(t.col, (t.u - 0.5) * 0.14); g.lineWidth = t.w - 1.7; tracePiece(g, t.pts, t.i0, t.i1, 0.75, 0.95);
    }
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's32clay', scale: 5, octaves: 2, res: 0.5, contrast: 1.6, ramp: [[0, 'rgba(0,0,0,0.2)'], [0.5, 'rgba(60,66,70,0)'], [1, 'rgba(168,180,184,0.14)']] }), -PAD, -PAD);
  });

  // height map → relief light
  const hm = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, LW, LH);
    for (const p of pebbles) {
      const gr = g.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, p.maxr);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#e2e2e2'); gr.addColorStop(0.85, '#a6a6a6'); gr.addColorStop(1, '#666666');
      g.fillStyle = gr; g.fill(p.path);
    }
    g.strokeStyle = '#4c4c4c'; g.lineCap = 'butt';
    for (const t of pieces) { g.lineWidth = t.w; tracePiece(g, t.pts, t.i0, t.i1, 0, 0); }
    a.fillAbove(g, '#3c3c3c', 0);
  });
  const bump = L.bumpLight(hm, { angle: 45, strength: 1.5, blur: 1.6, res: 0.5 });

  // small wet glints, kept separate so they can shimmer as the camera slides
  const spec = L.makeLayer(PAD, (g) => {
    for (const p of pebbles) {
      const x = p.cx - p.inr * 0.34, y = p.cy - p.inr * 0.42, rr = Math.max(2, p.inr * 0.34);
      g.save(); g.translate(x, y); g.rotate(-0.65); g.scale(1, 0.56);
      g.fillStyle = L.radial(g, 0, 0, 0, rr, [[0, `rgba(255,255,250,${p.light ? 0.6 : 0.72})`], [0.5, `rgba(255,255,250,${p.light ? 0.22 : 0.24})`], [1, 'rgba(255,255,250,0)']]);
      g.beginPath(); g.arc(0, 0, rr, 0, L.TAU); g.fill();
      g.restore();
    }
  });

  const base = L.makeLayer(PAD, (g) => {
    g.drawImage(ground, -PAD, -PAD);
    g.save(); a.clipBelow(g, 0);
    // bedding soil in the joints
    g.fillStyle = '#2f2b26'; g.fillRect(-PAD, -PAD, LW, LH);
    g.globalAlpha = 0.85;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's32soil', scale: 70, octaves: 4, res: 0.33, contrast: 1.5, ramp: [[0, '#1b1815'], [0.5, '#3a3630'], [1, '#574e40']] }), -PAD, -PAD);
    g.globalAlpha = 1;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's32moss', scale: 150, octaves: 4, warp: 0.7, res: 0.25, contrast: 1.6, ramp: [[0, 'rgba(62,78,36,0)'], [0.58, 'rgba(62,78,36,0)'], [0.82, 'rgba(66,84,38,0.8)'], [1, 'rgba(80,98,44,0.9)']] }), -PAD, -PAD);
    L.speckle(g, { seed: 's32grit', count: 9000, x: -PAD, y: a.crestY - 10, w: LW, h: LH, rMin: 0.5, rMax: 1.6, colors: ['#7a705e', '#5c5447', '#8d8470'], alpha: [0.2, 0.7] });
    // stones + their shared contact shadow
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 5; g.shadowOffsetX = 2.2; g.shadowOffsetY = 3;
    g.drawImage(peb, -PAD, -PAD);
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
    // mineral mottling, wear and grain across the stones
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.34;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's32mot', scale: 26, octaves: 4, res: 0.5, contrast: 1.5 }), -PAD, -PAD);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's32dirt', scale: 230, octaves: 4, warp: 0.6, res: 0.25, ramp: [[0, '#8d7f66'], [0.45, '#f4f0e6'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
    g.drawImage(L.grainTex(LW, LH, { seed: 's32grain', amount: 0.2 }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.restore();

    // tiles on edge
    g.drawImage(tiles, -PAD, -PAD);

    // relief light over everything below the arc
    g.save(); a.clipBelow(g, 0);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.7;
    g.drawImage(bump, -PAD, -PAD);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.55;
    g.drawImage(spec, -PAD, -PAD);
    // low sun from the upper left, falling away to the lower right and into the medallion
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 1;
    g.fillStyle = L.linear(g, 0, a.crestY - 100, W, H + 100, [[0, 'rgba(255,244,216,0.5)'], [0.5, 'rgba(255,244,216,0)'], [1, 'rgba(18,22,38,0.5)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 900, a.R - 300, [[0, 'rgba(60,56,50,1)'], [1, 'rgba(255,255,255,1)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.fillStyle = L.radial(g, a.cx - 120, a.crestY + 140, 620, 1500, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(150,146,140,1)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.restore();
  });
  return { base, spec };
}

export default {
  name: '花街铺地',
  tone: 'dark',
  init(env) {
    const model = buildModel(env);
    const ground = buildGround(env);
    S = buildPaving(env, model, ground);
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0065, 0.0065, p), zoom = L.lerp(1.0, 1.012, p);   // keep zoom small: a scaled circle drifts off the shared arc at the frame edges
    L.blit(ctx, env, S.base, { rot, zoom });
    // a patch of sun sliding along the band of begonias
    ctx.save(); a.clipBelow(ctx, -2);
    const gl = a.pt(L.lerp(-0.2, 0.06, p), -200);
    L.glow(ctx, gl.x, gl.y, 600, '#fff2cf', 0.34, 'soft-light');
    ctx.restore();
    // wet glints brighten and creep as the view slides
    L.blit(ctx, env, S.spec, { rot, zoom, dx: L.lerp(-0.9, 0.9, p), dy: L.lerp(-0.5, 0.5, p), alpha: L.lerp(0.35, 0.8, L.smooth(p)), blend: 'screen' });
  },
};
