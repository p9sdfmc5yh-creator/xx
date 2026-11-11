// s05 — 红斑绿锈. Six frames, two colours colliding: a flat field of peacock blue above the arc, and below it the
// rim of an old bronze coin in extreme macro — cuprite-red patina, sugary with crystal grains, orange on the raised
// outer rim (外郭) and deepening to jujube red in the field; a hair-thin crust of malachite green rides the very edge.
//
// The coin is shaded per pixel in init(): a height field (rim profile + crystal grains with randomly tilted facets +
// corrosion lumps + pits + green crust) is lit from the upper left, and facets that happen to face the light flash.
// draw() only slides that layer a hair round the circle's centre and lets a few hundred crystal glints twinkle.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 90;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── allocation-free worley: squared distances cD1/cD2, offset from the nearest feature point cOx/cOy, its hash cHh ──
let cD1 = 0, cD2 = 0, cOx = 0, cOy = 0, cHh = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, bx = 0, by = 0, bh = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = x - (cx + (h & 1023) / 1023), dy = y - (cy + ((h >>> 10) & 1023) / 1023), d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; bx = dx; by = dy; bh = h; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cOx = bx; cOy = by; cHh = bh;
}
const rehash = (h) => { h = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 13)) >>> 0; };

const COS = new Float32Array(1024), SIN = new Float32Array(1024);
for (let i = 0; i < 1024; i++) { COS[i] = Math.cos((i / 1024) * L.TAU); SIN[i] = Math.sin((i / 1024) * L.TAU); }

/** colour ramp over depth below the arc (px) → Float32 LUT, 1 px per entry, starting at V0 */
const V0 = -80, NV = 960;
function depthLut(stops) {
  const f = L.makeRamp(stops.map(([v, c]) => [(v - V0) / NV, c])); const out = new Float32Array(NV * 3);
  for (let i = 0; i < NV; i++) { const c = f(i / NV); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

function buildCoin(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 8;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s05a'), nB = L.makeNoise('s05b');

  // ── 1D profiles along the edge, indexed by arc length (px) ──
  const UMAX = 0.62 * R, NU = Math.ceil(UMAX * 2) + 4;
  const eOut = new Float32Array(NU), thick = new Float32Array(NU), stepV = new Float32Array(NU);
  const rN = L.rng('s05notch');
  const notches = [-1180, -760, -430, 232, 585, 930, 1290].map((u) => ({ u: u + rN.range(-28, 28), w: rN.range(13, 27), d: rN.range(3.0, 4.6) }));
  const creeps = [-1040, -590, -150, 96, 410, 770, 1120].map((u) => ({ u: u + rN.range(-40, 40), w: rN.range(22, 60), d: rN.range(6, 13) }));
  for (let i = 0; i < NU; i++) {
    const U = i - UMAX;
    let nt = 0, ntn = 0, cr = 0;
    for (const q of notches) { const t = (U - q.u) / q.w; if (t > -1 && t < 1) { const f = (1 - t * t) * (1 - t * t) * (0.8 + 0.35 * nB.n2(U / 4.5, q.u)); if (f * q.d > nt) { nt = f * q.d; ntn = L.clamp(f * 1.3); } } }
    for (const q of creeps) { const t = (U - q.u) / q.w; if (t > -1 && t < 1) cr = Math.max(cr, (1 - t * t) * (1 - t * t) * q.d); }
    eOut[i] = -0.7 + 1.0 * nA.n2(U / 120, 1.7) + 0.45 * nA.n2(U / 21, 5.1) - nt;
    thick[i] = L.clamp(8.6 + 3.0 * nA.n2(U / 85, 9.3) + 2.2 * nA.n2(U / 26, 3.3) + 2.4 * Math.abs(nB.n2(U / 9, 7.7)) + cr, 2.5, 30) * (1 - 0.92 * ntn);
    stepV[i] = 148 + 7 * nA.n2(U / 150, 21.3) + 3.5 * nA.n2(U / 37, 13.1);
  }

  // ── slow fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cM1 = new Float32Array(cw * ch), cM2 = new Float32Array(cw * ch), cLump = new Float32Array(cw * ch), cWx = new Float32Array(cw * ch), cWy = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    cM1[k] = nA.fbm(x / 340, y / 340, 3);
    cM2[k] = nB.fbm(x / 84 + 9, y / 84 - 4, 3);
    cLump[k] = nA.fbm(x / 40 - 30, y / 40 + 11, 3, 2, 0.55);
    cWx[k] = nB.n2(x / 36, y / 36); cWy[k] = nB.n2(x / 36 + 50, y / 36 - 20);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── sparse flecks of green rust sitting on the red: rasterise blob profiles ──
  const Gs = new Float32Array(N);
  const rs = L.rng('s05spots');
  let cth = 0, cv = 0, cleft = 0;
  for (let n = 0; n < 96; n++) {
    // flecks come in loose little clusters
    if (cleft <= 0) { cth = rs.range(-0.57, 0.57); cv = rs.chance(0.3) ? 152 + rs.range(-2, 22) : 26 + Math.pow(rs(), 0.8) * 640; cleft = rs.int(1, 4); }
    cleft--;
    const th0 = cth + rs.range(-22, 22) / R, v0 = cv + rs.range(-16, 16);
    const big = rs.chance(0.12);
    const rad = big ? rs.range(5.5, 8) : rs.range(2, 4.6);
    const rr0 = R - v0, px = cx + rr0 * Math.sin(th0) - X0, py = cy - rr0 * Math.cos(th0) - Y0;
    const lobes = [];
    const nl = big ? 3 : rs.int(1, 2);
    for (let l = 0; l < nl; l++) lobes.push([px + (l ? rs.range(-rad, rad) * 0.8 : 0), py + (l ? rs.range(-rad, rad) * 0.6 : 0), rad * (l ? rs.range(0.5, 0.9) : 1)]);
    const e = Math.ceil(rad * 2) + 3;
    for (let j = Math.max(1, Math.floor(py - e)); j <= Math.min(RH - 2, Math.ceil(py + e)); j++) for (let i = Math.max(1, Math.floor(px - e)); i <= Math.min(RW - 2, Math.ceil(px + e)); i++) {
      let f = 0;
      for (const lb of lobes) { const dx = i - lb[0], dy = j - lb[1]; f = Math.max(f, 1 - (dx * dx + dy * dy) / (lb[2] * lb[2])); }
      if (f <= 0) continue;
      f = L.clamp(f + 0.55 * nB.n2(i / 2.6, j / 2.6) * (1 - f) - 0.12);
      const k = j * RW + i; if (f > Gs[k]) Gs[k] = f;
    }
  }

  // ── colours ──
  const FIELD = depthLut([[-80, '#e2401d'], [150, '#dc3c1c'], [215, '#cf361b'], [290, '#bb2c18'], [370, '#a32315'], [460, '#8c1c13'], [550, '#7d1812'], [880, '#701410']]);
  const RIMC = depthLut([[-80, '#fb7a30'], [0, '#fc7d31'], [60, '#f8732d'], [120, '#f36a2a'], [180, '#ea5d26'], [880, '#e05223']]);

  // ── pass 1: height field + albedo ──
  const G1 = 12, G2 = 5.2;
  const RIMH = 5.2, HG = 2.3;
  const Hh = new Float32Array(N), Ar = new Float32Array(N), Ag = new Float32Array(N), Ab = new Float32Array(N), Al = new Float32Array(N), Gt = new Float32Array(N), Gm = new Float32Array(N), Sp = new Float32Array(N), Sh = new Float32Array(N), Sc = new Float32Array(N);
  const G3 = 8.6, cand = [];
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), dr = rr - R;
      if (dr > 4) continue;
      const uf = Math.atan2(ddx, ddy) * R + UMAX, u0 = uf | 0, tu = uf - u0;
      const eo = eOut[u0] + (eOut[u0 + 1] - eOut[u0]) * tu, th = thick[u0] + (thick[u0 + 1] - thick[u0]) * tu, vs = stepV[u0] + (stepV[u0 + 1] - stepV[u0]) * tu;
      const q = eo - dr;                 // depth inside the silhouette (px)
      if (q < -1) continue;
      Al[k] = L.clamp(q + 0.5);
      const V = -dr;
      const m1 = bil(cM1, i, j), m2 = bil(cM2, i, j), lump = bil(cLump, i, j);
      const micro = nB.n2(x / 2.3, y / 2.3);

      // crystal grains: every worley cell is one grain with a domed back and a randomly tilted facet
      cell((x + bil(cWx, i, j) * 5) / G1, (y + bil(cWy, i, j) * 5) / G1);
      let d = Math.sqrt(cD1), s = Math.min(1, d / 0.72);
      const e1 = Math.sqrt(cD2) - d;
      let hh = rehash(cHh);
      const tint = ((hh >>> 20) & 1023) / 1023, tm1 = ((hh >>> 10) & 1023) / 1023, ph1 = hh & 1023;
      let w = (1 - s * s) * (1 - s * s);
      const hg1 = 2.1 * w * ((0.35 + 0.85 * tint) + 1.25 * tm1 * (cOx * COS[ph1] + cOy * SIN[ph1]));
      const crev1 = (1 - sstep(0.0, 0.26, e1)) * 0.75;
      const flash1 = tm1;
      cell(x / G2 + 7.3, y / G2 - 2.1);
      d = Math.sqrt(cD1); s = Math.min(1, d / 0.72);
      const e2 = Math.sqrt(cD2) - d;
      hh = rehash(cHh);
      const tm2 = ((hh >>> 10) & 1023) / 1023, ph2 = hh & 1023, tint2 = ((hh >>> 20) & 1023) / 1023;
      w = (1 - s * s) * (1 - s * s);
      const hg2 = 0.95 * w * ((0.3 + 0.8 * tint2) + 1.2 * tm2 * (cOx * COS[ph2] + cOy * SIN[ph2]));
      const crev2 = 1 - sstep(0.0, 0.3, e2);
      // corrosion pits
      cell(x / 57 + 3.7, y / 57 + 9.1);
      hh = rehash(cHh);
      let pit = 0;
      if ((hh & 7) < 3) { const rp = 0.06 + 0.1 * (((hh >>> 8) & 255) / 255); pit = 1 - sstep(rp * 0.35, rp, Math.sqrt(cD1) + 0.02 * micro); }

      // crystal points: about a quarter of the cells of a third lattice carry one tiny bright crystal; one in nine of those is a big one
      cell(x / G3 - 11.7, y / G3 + 5.9);
      hh = rehash(cHh);
      let spk = 0, spkHalo = 0, spkH = 0, spkW = 0;
      if ((hh & 255) < 64 * L.clamp(0.55 + 1.7 * m2, 0.12, 1.6)) {   // they grow in drifts: dense here, sparse there
        const bigP = ((hh >>> 8) & 255) < 26, u1 = ((hh >>> 16) & 255) / 255, u2 = ((hh >>> 24) & 255) / 255;
        const h3 = rehash(hh), ph3 = h3 & 1023, el = 1 + 0.9 * (((h3 >>> 10) & 255) / 255), u3 = ((h3 >>> 18) & 255) / 255;
        const r0 = bigP ? 1.8 + 1.2 * u1 : 0.85 + 0.75 * u1, b0 = bigP ? 0.8 + 0.2 * u2 : 0.4 + 0.6 * u2;
        // each point is a tiny lozenge-ish facet, not a perfect dot
        const ox = cOx * G3, oy = cOy * G3, ea = (ox * COS[ph3] + oy * SIN[ph3]) / (r0 * el), eb = (oy * COS[ph3] - ox * SIN[ph3]) * Math.sqrt(el) / r0;
        const t2 = ea * ea + eb * eb;
        if (t2 < 20) {
          spk = Math.exp(-t2) * b0;
          spkH = Math.exp(-t2 * 0.4) * (bigP ? 1.5 : 0.8);
          spkW = bigP ? 0.85 + 0.15 * u3 : u3 < 0.42 ? 0.75 + 0.25 * u1 : 0.08 + 0.5 * u3;      // white-hot, or gold-orange
          if (bigP) spkHalo = Math.exp(-t2 * 0.12) * 0.26 * b0;
          if (q > 34 && ox * ox + oy * oy < 0.27) cand.push(x, y, bigP ? 1 : 0.5 * b0);
        }
      }

      // the raised outer rim: shoulder up from the edge, a ragged step down into the field
      const sV = sstep(vs - 8, vs + 11, V + 5 * lump + 1.2 * micro);
      const rimMask = 1 - sV;
      const hRim = (RIMH * sstep(0, 22, q) + 0.42 * nA.n2(uf / 130, V / 2.7) * sstep(4, 20, q)) * rimMask;

      // green: the crust along the very edge + the scattered flecks
      let gR = 0, hCr = 0, tq = 0;
      if (th > 1.2 && q < th + 6) {
        const rag = 1.5 * nB.n2(x / 4.7, y / 4.7) + 0.7 * micro;
        gR = 1 - sstep(th - 1.3, th + 1.3, q + rag);
        tq = L.clamp(q / th);
        hCr = HG * sstep(0, 3.4, q) * (1 - 0.3 * sstep(0.5, 1, tq)) * gR * (0.72 + 0.45 * nA.n2(x / 5.5, y / 5.5));
      }
      const gsf = Gs[k], gS = gsf > 0 ? sstep(0.1, 0.34, gsf) : 0;
      const gm = Math.max(gR, gS);
      const fade = sstep(-0.5, 5, q);
      Hh[k] = hRim + fade * ((1.5 * lump + hg1 + hg2 + spkH + 0.12 * micro) * (1 - 0.55 * gm) - 2.8 * pit) + hCr + 1.5 * Math.sqrt(gsf) * gS;

      // albedo — red
      let vi = (V + 46 * m1 + 16 * m2 - V0) | 0; vi = (vi < 0 ? 0 : vi >= NV ? NV - 1 : vi) * 3;
      let r = FIELD[vi] + (RIMC[vi] - FIELD[vi]) * rimMask, g = FIELD[vi + 1] + (RIMC[vi + 1] - FIELD[vi + 1]) * rimMask, b = FIELD[vi + 2] + (RIMC[vi + 2] - FIELD[vi + 2]) * rimMask;
      const patch = (0.55 * m2 + 0.45 * m1) * (1 - 0.6 * rimMask);      // the rim stays a clean band of orange
      r *= 1 + 0.07 * patch; g *= 1 + 0.5 * patch; b *= 1 + 0.3 * patch;
      const tt = tint - 0.5 + 0.35 * (tint2 - 0.5);
      r *= 1 + 0.14 * tt; g *= 1 + 0.75 * tt; b *= 1 + 0.4 * tt;
      const cv = Math.max(crev1 * 0.6, crev2 * 0.45, pit);
      r *= 1 - 0.26 * cv; g *= 1 - 0.6 * cv; b *= 1 - 0.5 * cv;
      // occlusion under the rim step and under the lip of the green crust
      let ao = V > vs - 6 ? 0.42 * Math.exp(-Math.max(0, V - vs) / 24) * sV : 0;
      if (th > 1.2 && q > th - 2 && q < th + 22) ao = Math.max(ao, 0.3 * Math.exp(-Math.max(0, q - th) / 4.5));
      r *= 1 - 0.55 * ao; g *= 1 - 0.95 * ao; b *= 1 - 0.9 * ao;
      // broad light: brightest upper left of centre, falling away to the right and the lower corners
      const lf = 1.1 - 0.2 * sstep(250, 1750, Math.hypot(x - 700, y - 560));
      r *= lf; g *= lf * lf; b *= lf * lf;
      if (gm > 0) {
        // malachite
        const gv = L.clamp(0.5 + 0.5 * nA.n2(x / 8.3 + 40, y / 8.3) + 0.2 * micro);
        const deep = 1 - 0.22 * sstep(0.6, 1, tq) * gR;
        const mr = (30 + 34 * gv) * deep, mg = (150 + 44 * gv) * deep, mb = (92 + 30 * gv) * deep;
        r += (mr - r) * gm; g += (mg - g) * gm; b += (mb - b) * gm;
      }
      Ar[k] = r; Ag[k] = g; Ab[k] = b; Gm[k] = gm;
      Gt[k] = (1 - gm) * (1 - pit) * fade;
      Sp[k] = spk * Gt[k]; Sh[k] = spkHalo * Gt[k]; Sc[k] = spkW;
    }
  }

  // ── pass 2: light it ──
  const img = new ImageData(RW, RH), o = img.data;
  const LX = 0.5, LY = 0.866, KR = 1.55;
  const SX = LX * 0.17, SY = LY * 0.17, SW = 0.0019;
  for (let j = 1; j < RH - 1; j++) for (let i = 1; i < RW - 1; i++) {
    const k = j * RW + i, al = Al[k];
    if (al <= 0) continue;
    const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
    const gm = Gm[k];
    let sh = 1 + KR * (hx * LX + hy * LY) * (1 - 0.45 * gm); sh = sh < 0.36 ? 0.36 : sh > 1.95 ? 1.95 : sh;
    let r = Ar[k], g = Ag[k], b = Ab[k];
    if (sh < 1) {
      // shadows stay saturated: red holds, green and blue drop faster (on the malachite everything drops together)
      const u = 1 - sh, kr = 0.72 + 0.28 * gm, kg = 1.12 - 0.2 * gm, kb = 1.15 - 0.2 * gm;
      r *= 1 - u * kr; g *= Math.max(0, 1 - u * kg); b *= Math.max(0, 1 - u * kb);
    } else {
      // lit flanks run toward orange-yellow on the red, toward yellow-green on the malachite
      const u = sh - 1;
      r = r * (1 + u * 0.62) + u * (14 + 60 * gm); g = g * (1 + u * (0.36 + 0.14 * gm)) + u * (8 + 30 * gm); b = b * (1 + u * 0.45) + u * 3;
    }
    // crystal facets that face the light flash
    const d1 = hx - SX, d2 = hy - SY, sp = Math.exp(-(d1 * d1 + d2 * d2) / SW) * Gt[k];
    if (sp > 0.02) {
      const v = sp * sp * 300 + sp * 70;
      r += v; g += v * 0.9; b += v * 0.68;
    }
    // the crystal points themselves: white-hot core, a breath of orange around the big ones
    const cp = Sp[k], chl = Sh[k];
    if (cp > 0.01 || chl > 0.01) { const wv = cp * Sc[k], ov = cp - wv; r += wv * 300 + ov * 300 + chl * 255; g += wv * 285 + ov * 175 + chl * 150; b += wv * 235 + ov * 48 + chl * 60; }
    const p = k * 4;
    o[p] = r; o[p + 1] = g; o[p + 2] = b; o[p + 3] = al * 255;
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);
  return { cnv, X0, Y0, cand };
}

/** the flat field of peacock blue: nothing but even fine grain */
function buildSky() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0f8a94'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.42; g.drawImage(L.grainTex(W, H, { seed: 's05sky', amount: 0.22, size: 1 }), 0, 0);
  g.globalAlpha = 0.2; g.drawImage(L.grainTex(W, H, { seed: 's05sky2', amount: 0.22, size: 2 }), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return c;
}

function glintSprite() {
  const n = 64, c = L.makeCanvas(n, n), g = c.getContext('2d');
  g.fillStyle = L.radial(g, n / 2, n / 2, 0, n / 2, [[0, 'rgba(255,252,238,1)'], [0.07, 'rgba(255,240,200,0.95)'], [0.2, 'rgba(255,186,104,0.34)'], [0.5, 'rgba(255,130,50,0.08)'], [1, 'rgba(255,110,40,0)']]);
  g.fillRect(0, 0, n, n);
  return c;
}

export default {
  name: '红斑绿锈',
  tone: 'light',
  init(env) {
    const coin = buildCoin(env);
    // the twinkling glints sit exactly on crystal points of the surface: most of the big ones, a sprinkling of the small
    const r = L.rng('s05glint'), c = coin.cand, n = c.length / 3, glints = [];
    let nBig = 0; for (let i = 0; i < n; i++) if (c[i * 3 + 2] === 1) nBig++;
    const pBig = Math.min(1, 300 / Math.max(1, nBig)), pSmall = Math.min(1, 320 / Math.max(1, n - nBig));
    for (let i = 0; i < n; i++) {
      const big = c[i * 3 + 2] === 1, u = r(), ph = r(), s1 = r(), s2 = r();
      if (u > (big ? pBig : pSmall)) continue;
      glints.push({ x: c[i * 3], y: c[i * 3 + 1], k: big ? 0.75 + 0.25 * s1 : 0.5 + 0.4 * s1, ph, sz: big ? L.lerp(30, 52, s2) : L.lerp(14, 24, s2), sp: L.lerp(1.1, 1.7, s1) });
    }
    S = { coin: coin.cnv, x0: coin.X0, y0: coin.Y0, sky: buildSky(), glints, sprite: glintSprite() };
  },
  draw(ctx, env, p) {
    ctx.drawImage(S.sky, 0, 0);
    const rot = L.lerp(-0.0034, 0.0034, p);
    L.cam(ctx, env, { rot }, () => {
      ctx.drawImage(S.coin, S.x0, S.y0);
      // crystal points flicker on and off as the coin turns under the light
      ctx.globalCompositeOperation = 'lighter';
      for (const q of S.glints) {
        const c = Math.cos((p * q.sp + q.ph) * L.TAU);
        if (c <= 0.3) continue;
        const tw = Math.pow((c - 0.3) / 0.7, 3) * q.k;
        if (tw < 0.04) continue;
        const s = q.sz * (0.7 + 0.3 * tw);
        ctx.globalAlpha = Math.min(1, tw);
        ctx.drawImage(S.sprite, q.x - s / 2, q.y - s / 2, s, s);
      }
    });
  },
};
