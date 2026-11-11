// s12 — 青铜云雷纹口沿. Black-ground macro of a bronze rim shard under a warm raking light from the upper left.
// The arc is the upper edge of the rim: thick, chipped, its top face catching the light. Going down from the arc:
// a plain lip, a band of 云雷纹 (S-shaped pairs of squared spirals, line width = groove width), a raised string line
// (凸弦纹) and the plain belly falling away into the dark.
//
// Everything below the arc is shaded per pixel in init(): a float height field (profile + leiwen relief + crust,
// nodules, pits, chips, crack) is built in polar coordinates of the arc (U = px along the rim, v = px below it),
// each pixel gets a material (malachite / azurite / cuprite fringe / bare bronze / soil / fracture), and the field is
// then lit with a low key light plus short ray-marched cast shadows — so every groove has a lit wall and a shadow.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 44;          // only ±0.0075 rad of rot → the far corners travel < 20 px
let S = null;

const clamp = L.clamp;
const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

// ── layout, in px below the arc ──
const UNIT = 15;                           // leiwen line width = groove width
const NS = 10;                             // one squared spiral fills a box of NS units
const HT = 38;                             // how far the rim's top face falls away toward the silhouette
const V_LIP = 108;                         // plain lip ends, the band's sunken ground begins
const V_PAT = 128;                         // upper edge of the leiwen lines
const V_PATB = V_PAT + (NS + 1) * UNIT;    // lower edge of the leiwen lines (293)
const V_GND1 = V_PATB + 12;                // ground ends
const RDG_HW = 17, V_RDG = V_GND1 + RDG_HW + 2;   // the raised string line
const DEPTH = 8;                           // relief of the leiwen lines above their ground

// chips (崩口) knocked out of the rim; `dip` lowers the silhouette, the scoop shows the fractured body
const CHIPS = [
  { U0: -560, ru: 122, rv: 76, v0: -6, dep: 15, dip: 13 },
  { U0: 318, ru: 60, rv: 46, v0: -4, dep: 9, dip: 8 },
  { U0: 826, ru: 86, rv: 58, v0: -5, dep: 12, dip: 11 },
  { U0: -1110, ru: 70, rv: 50, v0: -5, dep: 10, dip: 9 },
  { U0: -138, ru: 46, rv: 25, v0: 31, dep: 7, dip: 0 },     // flakes off the outer corner only
  { U0: 566, ru: 36, rv: 20, v0: 33, dep: 6, dip: 0 },
];

// ── tiny allocation-free worley noise (distance in cD1) ──
let cD1 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d1 = d; id = ((h >>> 20) & 255) / 255; }
  }
  cD1 = Math.sqrt(d1); cId = id;
}

function lut(stops) {
  const f = L.makeRamp(stops), o = new Float32Array(257 * 3);
  for (let i = 0; i <= 256; i++) { const c = f(i / 256); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}
const li = (t) => ((t <= 0 ? 0 : t >= 1 ? 1 : t) * 256 | 0) * 3;

/**
 * One 云雷纹 unit in line-width units: two squared spirals wound the same way and joined by a shared spine, i.e. an
 * "S" whose two ends curl inward. Returns the centre-line as a polyline spanning x ∈ [0, 2n], y ∈ [0, n].
 */
function sPath(n) {
  const Lp = [[n, n]];
  let x0 = 0, y0 = 0, x1 = n, y1 = n;
  for (;;) {
    if (y1 - y0 <= 0) break; Lp.push([x1, y0]);
    if (x1 - x0 <= 0) break; Lp.push([x0, y0]);
    if (y1 - y0 <= 0) break; Lp.push([x0, y1]);
    if (x1 - 2 - x0 <= 0) break; Lp.push([x1 - 2, y1]);
    x1 -= 2; y0 += 2; x0 += 2; y1 -= 2;
  }
  const Rp = Lp.map(([x, y]) => [2 * n - x, n - y]);
  return [...Lp.slice().reverse(), ...Rp.slice(2)];
}

function build(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 70;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s12a'), nB = L.makeNoise('s12b');
  const RM = R - (V_PAT + V_PATB) / 2;

  // ── 1) pattern mask: leiwen lines in the red channel (blurred → a short distance ramp), the crack in blue ──
  const mc = L.makeCanvas(RW, RH), mg = mc.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, RW, RH);
  mg.translate(-X0, -Y0);
  mg.strokeStyle = '#ff0000'; mg.lineWidth = UNIT; mg.lineJoin = 'miter'; mg.lineCap = 'butt';
  const path = sPath(NS), pitchU = 2 * NS + 2, dTh = UNIT / RM;
  const kMax = Math.ceil((0.56 * RM / UNIT) / pitchU) + 1;
  for (let kk = -kMax; kk <= kMax; kk++) {
    const P = (xu, yu) => a.pt((kk * pitchU + xu - NS) * dTh, -(V_PAT + UNIT / 2 + yu * UNIT));
    mg.beginPath();
    for (let s = 0; s < path.length; s++) {
      const [xu, yu] = path[s];
      if (s === 0) { const p = P(xu, yu); mg.moveTo(p.x, p.y); continue; }
      const [px, py] = path[s - 1], n = Math.max(1, Math.round(Math.abs(xu - px)));   // follow the curve of the band
      for (let t = 1; t <= n; t++) { const p = P(px + ((xu - px) * t) / n, py + ((yu - py) * t) / n); mg.lineTo(p.x, p.y); }
    }
    mg.stroke();
  }
  const mb = L.makeCanvas(RW, RH), bg = mb.getContext('2d', { willReadFrequently: true });
  bg.filter = 'blur(2.4px)'; bg.drawImage(mc, 0, 0); bg.filter = 'none';
  // a hairline crack running down from the second chip
  bg.translate(-X0, -Y0); bg.globalCompositeOperation = 'lighter'; bg.strokeStyle = '#0000ff'; bg.lineCap = 'round';
  {
    let prev = null;
    for (let s = 0; s <= 40; s++) {
      const t = s / 40, U = 326 + 52 * t + 9 * nA.n2(t * 7, 60.5) + 3 * nA.n2(t * 23, 11.5), v = 26 + 250 * t;
      const p = a.pt(U / R, -v);
      if (prev) { bg.lineWidth = L.lerp(3.2, 0.9, t); bg.globalAlpha = 1 - 0.5 * t * t; bg.beginPath(); bg.moveTo(prev.x, prev.y); bg.lineTo(p.x, p.y); bg.stroke(); }
      prev = p;
    }
  }
  const md = bg.getImageData(0, 0, RW, RH).data;

  // ── 2) the silhouette and the width of the rim's top face, as functions of U ──
  const UMAX = 1340, SN = UMAX * 4 + 4;
  const silA = new Float32Array(SN), topA = new Float32Array(SN);
  const rn = L.rng('s12nick'), NICKS = [];
  for (let U = -UMAX; U < UMAX; U += 64) NICKS.push([U + rn.range(0, 64), rn.range(4, 15), rn.chance(0.3) ? rn.range(3, 5) : rn.range(0.8, 2.6)]);
  for (let s = 0; s < SN; s++) {
    const U = s / 2 - UMAX;
    let sil = 0.1 + 1.0 * (0.5 + 0.5 * nA.n2(U / 5.5, 3.1)) + 1.6 * Math.max(0, nA.n2(U / 38, 9.7)) + 0.5 * Math.max(0, nB.n2(U / 17, 1.3))
      + 1.3 * (0.5 + 0.5 * nB.n2(U / 120, 44.4));
    for (const nk of NICKS) { const du = (U - nk[0]) / nk[1]; if (du > -1 && du < 1) sil += nk[2] * (1 - du * du); }
    for (const c of CHIPS) {
      if (!c.dip) continue;
      const du = (U - c.U0) / (c.ru * 0.86);
      if (du > -1 && du < 1) sil += c.dip * Math.pow(1 - du * du, 0.8) * (1 + 0.25 * nA.n2(U / 9, 5.5));
    }
    silA[s] = sil;
    topA[s] = 30 + 9 * nA.n2(U / 170, 20.2) + 5 * nA.n2(U / 52, 7.9);
  }

  // ── 3) slow corrosion fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const fE = new Float32Array(CN), fA = new Float32Array(CN), fB = new Float32Array(CN), fS = new Float32Array(CN),
    fC = new Float32Array(CN), fWx = new Float32Array(CN), fWy = new Float32Array(CN);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, V = R - rr, k = j * cw + i;
    fE[k] = nA.fbm(U / 150, V / 150, 3, 2, 0.55);                // where the crust has flaked to bare bronze
    fA[k] = nA.fbm(U / 330 + 40, V / 330 - 13, 3);               // broad swell + tone of the malachite
    fB[k] = nB.fbm(U / 190 - 7, V / 190 + 3, 3);                 // azurite colonies
    fS[k] = nB.fbm(U / 85 + 21, V / 85 + 77, 3);                 // burial soil
    fC[k] = nA.fbm(U / 70 - 55, V / 70 + 31, 3, 2, 0.6);         // crust thickness
    fWx[k] = nB.n2(U / 200 + 5, V / 200); fWy[k] = nB.n2(U / 200 - 31, V / 200 + 19);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── 4) height + material, full resolution ──
  const MAL = lut([[0, '#0b3a34'], [0.3, '#1d7163'], [0.55, '#3f9c8a'], [0.8, '#5cc6aa'], [1, '#8fe2c8']]);
  const AZU = lut([[0, '#102a5a'], [0.45, '#2f6fa8'], [0.8, '#4a93d6'], [1, '#86c0f0']]);
  const BRZ = lut([[0, '#2a190c'], [0.42, '#644528'], [0.78, '#87633b'], [1, '#b49b6e']]);
  const SOIL = lut([[0, '#93835c'], [0.5, '#c2b38c'], [1, '#e6dcba']]);
  const CORE = lut([[0, '#6a4a26'], [0.5, '#a9824a'], [1, '#dcc089']]);
  const Hh = new Float32Array(N), Al = new Float32Array(N), CR = new Float32Array(N), CG = new Float32Array(N), CB = new Float32Array(N),
    SP = new Float32Array(N), LI = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const yy = Y0 + j, ddy = cy - yy;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, xx = X0 + i, ddx = xx - cx;
      const rr = Math.sqrt(ddx * ddx + ddy * ddy), v = R + 1.5 - rr;
      if (v < -3) { Hh[k] = -999; continue; }
      const U = Math.atan2(ddx, ddy) * R;
      const sf = (U + UMAX) * 2, si = sf | 0, sfr = sf - si;
      const sil = silA[si] + (silA[si + 1] - silA[si]) * sfr, T = topA[si] + (topA[si + 1] - topA[si]) * sfr;
      Al[k] = clamp(v - sil + 0.5);
      const eF = bil(fE, i, j), aF = bil(fA, i, j), bF = bil(fB, i, j), sF = bil(fS, i, j), cF = bil(fC, i, j);
      const g1 = nA.n2(U / 7.5, v / 7.5), g2 = nB.n2(U / 2.7 + 50, v / 2.7), g3 = nB.n2(U / 27 - 9, v / 27 + 4);
      cell(U / 21 + bil(fWx, i, j) * 0.45, v / 21 + bil(fWy, i, j) * 0.45);
      const nod = 1 - 2.3 * cD1, nd = cD1;                                   // +1 on a nodule, negative in the seams between

      // profile of the wall
      let h = 3.0 * aF, top = 0;
      if (v < T) { top = 1 - v / T; h -= HT * Math.pow(top, 1.25); }
      const dA = v - T, arris = dA > -10 && dA < 10 ? Math.exp(-dA * dA / 30) : 0;
      if (v >= T && v < V_LIP + 8) h += 2.2 * Math.sin((Math.PI * (v - T)) / (V_LIP + 8 - T));
      const inBand = sstep(V_LIP, V_LIP + 9, v) * (1 - sstep(V_GND1 - 5, V_GND1 + 3, v));
      let mE = 0;
      if (inBand > 0) mE = sstep(0.36, 0.64, md[k * 4] / 255 + 0.2 * g3 + 0.09 * g1);
      const groove = inBand * (1 - mE);
      const rx = (v - V_RDG) / RDG_HW, ridge = rx > -1 && rx < 1 ? Math.pow(1 - rx * rx, 0.65) : 0;
      const belly = v > V_RDG + RDG_HW - 4 ? v - (V_RDG + RDG_HW - 4) : 0;
      h += ridge * 9 - 3 * sstep(0, 10, belly) - 0.0005 * belly * belly;

      // materials: wear strips the crust from whatever stands proud; soil and thick rust settle in the grooves
      const prom = 0.24 * mE * inBand - 0.36 * groove + 0.32 * ridge + 0.3 * arris + (top > 0 ? 0.19 : 0) - 0.07;
      const val = 0.5 + 0.55 * eF + 0.13 * g3 + 0.05 * g1 + prom;
      const ex = sstep(0.585, 0.62, val);
      const fringe = sstep(0.535, 0.585, val) * (1 - ex);
      const ct = clamp(0.5 + 0.62 * cF + 0.22 * aF);
      const crusty = sstep(0.34, 0.56, ct);                          // 0 = smooth enamel-like patina, 1 = powdery nodular crust
      const so = sstep(0.5, 0.6, 0.5 + 0.5 * sF + 0.1 * g3 + 0.27 * groove - 0.28) * (1 - ex);
      const zv = 0.5 + 0.5 * bF + 0.08 * g3;
      const az = clamp(sstep(0.6, 0.66, zv) * (1 - sstep(0.38, 0.56, nd)) + sstep(0.7, 0.75, zv)) * (1 - ex) * (1 - so);
      const cover = (1 - ex) * (1 - 0.6 * fringe);
      const bulge = sstep(0.72 + 0.1 * inBand, 0.97, ct);
      const thin = 1 - 0.5 * groove;
      h += cover * thin * (1.0 + 2.6 * ct + 2.3 * crusty * ct * nod + 4.5 * bulge);
      h += az * (1.8 + 2.6 * nod);
      h += inBand * (-DEPTH + (DEPTH - 0.4) * mE) + 0.9 * arris;
      h += groove * DEPTH * Math.min(0.85, so * (0.36 + 0.14 * g3 + 0.05 * g2) + 0.6 * bulge * (1 - ex));
      h += (0.25 + 0.75 * cover * (0.35 + 0.65 * crusty)) * (1 - 0.6 * so) * (0.45 * g1 + 0.3 * g2) * (0.75 + 0.6 * g3);
      // corrosion pits: round, of every size, gathered in colonies
      const nd1 = cD1; cell(U / 27 + 91.3, v / 27 + 17.7);
      const pe = cId - 0.6, pr = pe > 0 ? 0.05 + 1.1 * pe * pe : 0, pit = (pr > 0 ? 1 - sstep(pr * 0.55, pr, cD1) : 0) * sstep(-0.25, 0.3, nB.n2(U / 90 + 300, v / 90 - 200));
      cD1 = nd1; h -= 3.2 * pit;
      const streak = nB.n2(U / 150 + 9, v / 2.3); h += 0.4 * ex * streak;
      const crk = md[k * 4 + 2] / 255; h -= 4.5 * crk;

      // colour
      let q = li(0.5 + 0.5 * aF + 0.3 * cF + 0.16 * nod * ct * crusty + 0.07 * g1 + 0.12 * bulge + 0.1 * groove);
      let cr = MAL[q], cg = MAL[q + 1], cb = MAL[q + 2], sp = 0.07 + 0.2 * (1 - crusty);
      if (az > 0) { q = li(0.48 + 0.4 * nod + 0.12 * g1); cr += (AZU[q] - cr) * az; cg += (AZU[q + 1] - cg) * az; cb += (AZU[q + 2] - cb) * az; sp += (0.1 - sp) * az; }
      if (fringe > 0) { const f = fringe * 0.85, m = 1 + 0.25 * g1; cr += (118 * m - cr) * f; cg += (46 * m - cg) * f; cb += (27 * m - cb) * f; }
      if (ex > 0) { q = li(0.38 + 0.1 * g3 + 0.3 * eF + 0.14 * aF + 0.1 * streak + 0.08 * mE * inBand + 0.25 * arris + (top > 0 ? 0.14 : 0)); cr += (BRZ[q] - cr) * ex; cg += (BRZ[q + 1] - cg) * ex; cb += (BRZ[q + 2] - cb) * ex; sp += (0.5 + 0.35 * arris - sp) * ex; }
      if (so > 0) { q = li(0.5 + 0.3 * g1 + 0.35 * g3); cr += (SOIL[q] - cr) * so; cg += (SOIL[q + 1] - cg) * so; cb += (SOIL[q + 2] - cb) * so; sp *= 1 - so; }

      // chips: a scooped fracture, cuprite-red at its edge, raw granular metal in the middle
      for (let c = 0; c < CHIPS.length; c++) {
        const cp = CHIPS[c], du = (U - cp.U0) / cp.ru;
        if (du < -1.5 || du > 1.5) continue;
        const dv = (v - cp.v0) / cp.rv;
        if (dv > 1.5) continue;
        const qq = Math.sqrt(du * du + dv * dv) + 0.15 * g3 + 0.05 * g1;
        if (qq >= 1) continue;
        const d = 1 - qq, fr = sstep(0, 0.07, d), core = sstep(0.1, 0.26, d);
        h -= cp.dep * Math.pow(1 - qq * qq, 0.7) - (2.2 * g1 + 1.3 * g2 + 1.6 * g3) * sstep(0, 0.2, d);
        q = li(0.45 + 0.4 * g1 + 0.3 * g2 + 0.2 * g3);
        const fr_ = 118 + (CORE[q] - 118) * core, fg_ = 46 + (CORE[q + 1] - 46) * core, fb_ = 27 + (CORE[q + 2] - 27) * core;
        cr += (fr_ - cr) * fr; cg += (fg_ - cg) * fr; cb += (fb_ - cb) * fr; sp += (0.25 + 0.7 * core - sp) * fr;
      }
      const dark = (1 - 0.45 * pit) * (1 - 0.75 * crk);
      Hh[k] = h; CR[k] = cr * dark; CG[k] = cg * dark; CB[k] = cb * dark; SP[k] = sp * dark;
      // key light pooled left of the crest, dying away to the right and down the belly
      const lx = (xx - 700) / 840;
      LI[k] = (0.62 + 0.7 * Math.exp(-lx * lx)) * (1 - 0.45 * sstep(260, 640, v));
    }
  }

  // ── 5) light it ──
  let Lx = -0.63, Ly = -0.62, Lz = 0.52; { const m = Math.hypot(Lx, Ly, Lz); Lx /= m; Ly /= m; Lz /= m; }
  let Hx = Lx, Hy = Ly, Hz = Lz + 1; { const m = Math.hypot(Hx, Hy, Hz); Hx /= m; Hy /= m; Hz /= m; }
  const tanE = Lz / Math.hypot(Lx, Ly);
  const SD = [1, 2, 3, 5, 7, 10, 14, 19, 26], SO = SD.map((d) => d * RW + d), SL = SD.map((d) => d * Math.SQRT2 * tanE);
  const img = new ImageData(RW, RH), d = img.data;
  const KD = 1.95, AMB = 0.07;
  const shoulder = (x) => (x < 170 ? x : 170 + 85 * (1 - Math.exp(-(x - 170) / 85)));
  for (let j = 1; j < RH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, al = Al[k];
      if (al <= 0) continue;
      const h = Hh[k];
      let hl = Hh[k - 1], hr = Hh[k + 1], hu = Hh[k - RW], hd = Hh[k + RW];
      if (hl < -500) hl = h; if (hr < -500) hr = h; if (hu < -500) hu = h; if (hd < -500) hd = h;
      const hx = (hr - hl) * 0.5, hy = (hd - hu) * 0.5;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const nx = -hx * inv, ny = -hy * inv, nz = inv;
      let diff = nx * Lx + ny * Ly + nz * Lz; if (diff < 0) diff = 0;
      // cast shadow: march toward the light
      let occ = 0;
      for (let s = 0; s < 9; s++) {
        const dd = SD[s]; if (i < dd || j < dd) break;
        const o = Hh[k - SO[s]] - h - SL[s];
        if (o > occ) occ = o;
      }
      const sh = 1 - 0.84 * sstep(0, 2.6, occ);
      const lit = LI[k] * (AMB + KD * diff * sh);
      let ndh = nx * Hx + ny * Hy + nz * Hz; if (ndh < 0) ndh = 0;
      const s2 = ndh * ndh, s8 = s2 * s2 * s2 * s2, spec = s8 * s8 * s8 * SP[k] * sh * LI[k] * 1.5;
      const o = k * 4;
      d[o] = shoulder(CR[k] * lit * 1.0 + 222 * spec);
      d[o + 1] = shoulder(CG[k] * lit * 0.95 + 196 * spec);
      d[o + 2] = shoulder(CB[k] * lit * 0.86 + 142 * spec);
      d[o + 3] = al * 255;
    }
  }
  const raw = L.makeCanvas(RW, RH);
  raw.getContext('2d').putImageData(img, 0, 0);

  // ── 6) grade, shallow depth of field on the belly, bloom ──
  const base = L.filtered(raw, 'saturate(1.14) contrast(1.05)');
  const soft = L.blurred(base, 3.4), sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.radial(sg, cx - X0, cy - Y0, R - 600, R - 350, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  sg.fillRect(0, 0, RW, RH);
  base.getContext('2d').drawImage(soft, 0, 0);
  const bloom = L.blurred(L.filtered(base, 'brightness(0.82) contrast(2.3)'), 15);
  return { base, bloom, X0, Y0 };
}

export default {
  name: '青铜云雷纹口沿',
  tone: 'light',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    // slow slide of the shard along its own rim; the light stays where it is
    const rot = L.lerp(-0.0075, 0.0075, p), zoom = L.lerp(1.0, 1.01, p);
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.base, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.26;
      ctx.drawImage(S.bloom, S.X0, S.Y0);
    });
    // the pool of key light drifts a little along the leiwen band (black stays black under a dodge)
    ctx.save(); a.clipBelow(ctx, 0);
    ctx.globalCompositeOperation = 'color-dodge';
    a.at(ctx, L.lerp(-0.19, -0.1, p), -205, () => {
      ctx.scale(2.3, 1);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 250, [[0, 'rgba(255,214,150,0.34)'], [0.5, 'rgba(255,205,140,0.14)'], [1, 'rgba(255,200,130,0)']]);
      ctx.fillRect(-260, -260, 520, 520);
    });
    ctx.restore();
  },
};
