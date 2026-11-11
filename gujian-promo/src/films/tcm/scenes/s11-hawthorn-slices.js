// s11 — 山楂片. Dried hawthorn slices on the lip of a magenta dish, lit from behind on a black ground.
// The arc = the outer edge of the dish (a film of magenta-stained hawthorn juice covers it). Eight cross-cut slices
// sit along the arc, half on the lip, half hanging out over the dark: a thin line of deep-red peel, flesh glowing
// from hawthorn red to orange-red, and in the middle the five seed cavities set radially — real holes in the sprite,
// so the black ground, the pink lip or the magenta juice shows through, whichever happens to lie behind.
//
// Everything that carries texture is shaded per pixel in init():
//   · each slice is its own sprite (transmission map → colour ramp, height map → raking light); every pixel knows
//     its distance from the arc, so the half lying on the dish is lit pinker from below and the lip glows through the flesh;
//   · the dish is a height field in polar coordinates (a fine reticulated film + coarse veins) → diffuse + wet specular.
// draw() only blits: the dish and the slices turn together about the arc's centre (≈2°), the sheen stays with the light.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 110;               // the move is small: ±1° about the arc centre, ±0.5 % zoom
const Q = 1.25;                // frame px per dish-shading px
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const sq = (v) => v * v;

// s = arc length from the crest (px, + = right) · r = radius · dr = radial offset of the centre
// kind 'holes' = five open seed cavities, 'star' = the whole core has dropped out · stone = cavity that still holds its stone
// gain = how much light the cut lets through (a thicker cut is darker and redder)
const SLICES = [
  { s: -960, r: 80, dr: -5, kind: 'holes', gain: 0.98, stone: -1 },
  { s: -670, r: 128, dr: 5, kind: 'holes', gain: 1.0, stone: 3 },
  { s: -392, r: 70, dr: -8, kind: 'star', gain: 1.08, stone: -1 },
  { s: -146, r: 96, dr: 7, kind: 'holes', gain: 0.86, stone: -1 },
  { s: 202, r: 146, dr: 0, kind: 'holes', gain: 1.05, stone: -1, rot: -1.45 },   // the hero, just right of the crest
  { s: 500, r: 74, dr: -7, kind: 'holes', gain: 0.92, stone: 1 },
  { s: 764, r: 110, dr: 6, kind: 'star', gain: 1.0, stone: -1 },
  { s: 1016, r: 86, dr: -3, kind: 'holes', gain: 1.06, stone: -1 },
];

// ── tiny allocation-free worley noise (squared distances in cD1/cD2, cell id in cId) ──
let cD1 = 0, cD2 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 255) / 255; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = id;
}

const NLUT = 512;
function lut(stops) {
  const f = L.makeRamp(stops), out = new Float32Array(NLUT * 3);
  for (let i = 0; i < NLUT; i++) { const c = f(i / (NLUT - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

// ───────────────────────── a slice ─────────────────────────
function buildSlice(a, sp, idx, LUT_A, LUT_B) {
  const R = a.R, r = sp.r;
  const c = a.pt(sp.s / R, sp.dr);
  const half = Math.ceil(r * 1.07) + 4, size = half * 2;
  const ox = Math.round(c.x - half), oy = Math.round(c.y - half);
  const rg = L.rng('s11-slice-' + idx), nz = L.makeNoise('s11-slice-' + idx);
  const rot0 = sp.rot === undefined ? rg.range(0, TAU) : sp.rot + rg.range(0, 0.001);
  const star = sp.kind === 'star';

  // five cavities, radially set: teardrops with the point toward the centre
  const cav = [];
  for (let k = 0; k < 5; k++) {
    const ang = (k * TAU) / 5 + rg.range(-0.05, 0.05);
    cav.push({
      ck: Math.cos(ang), sk: Math.sin(ang),
      qc: (star ? 0.21 : 0.285) + rg.range(-0.01, 0.01),
      la: (star ? 0.21 : 0.158) * rg.range(0.94, 1.06),
      lb: (star ? 0.104 : 0.124) * rg.range(0.92, 1.06),
      stone: sp.stone === k,
    });
  }

  // outline and peel width round the slice (dried slices are round but never true)
  const NT = 512, eTab = new Float32Array(NT + 2), pTab = new Float32Array(NT + 2);
  for (let k = 0; k <= NT + 1; k++) {
    const ph = (k / NT) * TAU, cs = Math.cos(ph), sn = Math.sin(ph);
    const fold = 1 - Math.abs(nz.n2(cs * 3.6 + 23, sn * 3.6));                  // where a radial fold meets the rim it pulls in
    eTab[k] = 1.004 + 0.03 * nz.n2(cs * 1.1 + 5, sn * 1.1) + 0.02 * nz.n2(cs * 2.9 - 7, sn * 2.9 + 2) + 0.007 * nz.n2(cs * 8 + 1, sn * 8 - 4)
      - 0.03 * sstep(0.86, 1, fold);
    pTab[k] = 0.064 + 0.022 * nz.n2(cs * 2.3 + 40, sn * 2.3 - 9);
  }

  const N = size * size;
  const Tt = new Float32Array(N), Hh = new Float32Array(N), Al = new Float32Array(N), Pk = new Float32Array(N),
    Dp = new Float32Array(N), Qe = new Float32Array(N), Dr = new Float32Array(N);
  const St = new Uint8Array(N);
  const gs = 0.07 * r + 4, ms = r * 0.42, hs = r / 110, ws = 0.21 * r;
  for (let j = 0; j < size; j++) {
    const fy = oy + j + 0.5, ly = fy - c.y;
    for (let i = 0; i < size; i++) {
      const fx = ox + i + 0.5, lx = fx - c.x;
      const rho = Math.sqrt(lx * lx + ly * ly);
      if (rho > r * 1.07 + 2) continue;
      let ph = Math.atan2(ly, lx) - rot0; ph -= Math.floor(ph / TAU) * TAU;
      const tf = (ph / TAU) * NT, t0 = tf | 0, tt = tf - t0;
      const e = eTab[t0] + (eTab[t0 + 1] - eTab[t0]) * tt, pw = pTab[t0] + (pTab[t0 + 1] - pTab[t0]) * tt;
      const re = r * e, q = rho / re;
      const aE = L.clamp((re - rho) / 1.3 + 0.5);
      if (aE <= 0) continue;
      const k = j * size + i;
      const cs = Math.cos(ph), sn = Math.sin(ph);

      // cavities
      let sf = 9, kc = 0;
      for (let m = 0; m < 5; m++) {
        const cv = cav[m];
        const xr = q * (cs * cv.ck + sn * cv.sk) - cv.qc, yr = q * (sn * cv.ck - cs * cv.sk);
        let wf = 0.8 + 0.32 * (xr / cv.la); if (wf < 0.3) wf = 0.3;
        const u1 = xr / cv.la, u2 = yr / (cv.lb * wf), f = Math.sqrt(u1 * u1 + u2 * u2);
        if (f < sf) { sf = f; kc = m; }
      }
      let lbm = cav[kc].lb, core = false;
      if (star) { const f0 = q / 0.125; if (f0 < sf) { sf = f0; lbm = 0.125; core = true; } }
      sf *= 1 + 0.055 * nz.n2(lx / gs + 9, ly / gs - 3);
      const dpx = (sf - 1) * lbm * r;                       // ≈ px outside the cavity wall (negative = inside)
      const stone = !star && !core && cav[kc].stone && dpx < 0.6;

      // how much light the flesh lets through
      const mott = nz.fbm(lx / ms + 3, ly / ms, 3);
      const fib = 0.6 * nz.n2(cs * 7 + q * 1.3, sn * 7 - q * 0.9) + 0.4 * nz.n2(cs * 17 - q * 2 + 5, sn * 17 + q * 1.1);
      const r1 = 1 - Math.abs(nz.n2(q * 8.5 + 1.7 * cs + 11, 2.1 * sn - q * 2));        // shrink wrinkles running with the rim
      const r2 = 1 - Math.abs(nz.n2(cs * 3.6 + 23 + q * 0.7, sn * 3.6 - q * 0.5));      // folds running to the rim
      const w1 = sstep(0.5, 0.82, q), w2 = sstep(0.5, 0.8, q), w3 = sstep(0.36, 0.62, q);
      cell(lx / ws + 0.3 * mott + idx * 7.3, ly / ws + idx * 3.9);                      // the dried face puckers into a loose net
      const r3 = 1 - sstep(0, 0.085, Math.sqrt(cD2) - Math.sqrt(cD1));
      cell(lx / 4.6 + idx * 3.1, ly / 4.6);                                             // mealy flesh: fine grains
      const gran = Math.sqrt(cD1);
      const crease = Math.max(0.75 * sstep(0.86, 0.985, r1) * w1, 0.6 * sstep(0.9, 0.99, r2) * w2, 0.85 * r3 * w3);
      const gn = nz.n2(lx / 2.3, ly / 2.3);
      let T = 0.87 - 0.47 * sstep(0.36, 0.97, q);
      T *= 1 - 0.3 * (1 - sstep(0.01 * r, 0.05 * r, dpx));  // the hard wall round each stone is denser
      T *= (1 + 0.22 * mott) * (1 + 0.06 * fib * sstep(0.22, 0.5, q)) * (1 - 0.36 * crease) * (0.92 + 0.16 * gran) * (1 + 0.05 * gn);
      const qp = 1 - pw, pk = sstep(qp - 0.014, qp + 0.014, q);
      T = (T + (0.15 + 0.05 * gn - T) * pk) * sp.gain;

      // surface relief: the peel curls in as a rounded bead, wrinkles stand up between their creases, the wall dips to each hole
      const bead = Math.exp(-sq((q - (1 - pw * 0.55)) / (pw * 0.42)));
      Hh[k] = hs * (1.15 * bead + 0.3 * r1 * w1 + 0.2 * r2 * w2 - 0.55 * crease - 0.7 * (1 - sstep(0, 0.045 * r, dpx)) + 0.06 * gn + 0.1 * (gran - 0.5) + 0.12 * mott);
      Tt[k] = T; Al[k] = aE; Pk[k] = pk; Dp[k] = dpx; Qe[k] = re - rho; St[k] = stone ? 1 : 0;
      Dr[k] = Math.sqrt(sq(fx - a.cx) + sq(fy - a.cy)) - R;
    }
  }

  // shade
  const img = new ImageData(size, size), d = img.data;
  const KR = 2.3;
  for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
    const k = j * size + i, al = Al[k];
    if (al <= 0) continue;
    const dpx = Dp[k], hole = L.clamp(0.5 - dpx / 1.3);
    const st = St[k] === 1;
    const alpha = st ? al : al * (1 - hole);
    if (alpha <= 0.003) continue;
    const gx = (Hh[k + 1] - Hh[k - 1]) * 0.5, gy = (Hh[k + size] - Hh[k - size]) * 0.5;
    let rel = (0.6 * gx + 0.8 * gy) * KR; rel = rel < -0.6 ? -0.6 : rel > 0.9 ? 0.9 : rel;
    const pk = Pk[k], drp = Dr[k], T = Tt[k];
    const od = sstep(3, -3, drp);                                        // 1 where the slice lies on the dish
    const wall = od * (1 - sstep(30, 50, -drp));                          // the pale lip zone of the dish is the brightest thing behind it
    let tv = T * (1 + 0.12 * wall * (1 - pk)); tv = tv < 0 ? 0 : tv > 1 ? 1 : tv;
    const li = ((tv * (NLUT - 1)) | 0) * 3;
    let cr = LUT_A[li] + (LUT_B[li] - LUT_A[li]) * od, cg = LUT_A[li + 1] + (LUT_B[li + 1] - LUT_A[li + 1]) * od, cb = LUT_A[li + 2] + (LUT_B[li + 2] - LUT_A[li + 2]) * od;
    const sh = 1 + 0.3 * rel;
    cr *= sh; cg *= sh; cb *= sh;
    // a little front light from the upper left: it only really shows on the dark peel
    const fl = rel > 0 ? rel * (0.1 + 0.34 * pk) : 0;
    cr += 255 * fl; cg += 150 * fl; cb += 150 * fl;
    const spc = pk * sq(L.clamp((rel - 0.3) / 0.6)) * 0.42;
    cr += 255 * spc; cg += 205 * spc; cb += 200 * spc;
    // the lip of the dish glows through the flesh
    const gl = Math.exp(-sq((drp + 3.5) / 3.2)) * (1 - 0.85 * pk) * 0.3 * (0.35 + tv);
    cr += 255 * gl; cg += 132 * gl; cb += 168 * gl;
    // back-light catching the very edge of the peel, so the dark rim never sinks into the black
    const eg = 1 - sstep(0.6, 3.2, Qe[k]);
    cr += (238 - cr) * 0.62 * eg; cg += (70 - cg) * 0.62 * eg; cb += (40 - cb) * 0.62 * eg;
    // the cut edge of each cavity lights up
    if (dpx < 2.2 && !st) { const he = (1 - dpx / 2.2) * 0.4; cr += 255 * he; cg += 168 * he; cb += 110 * he; }
    if (st) {
      // a stone still in its cavity: pale section, darker toward its skin
      const sd = -dpx, body = 0.7 + 0.3 * sstep(0, 0.05 * r, sd), ring = 1 - sstep(0.4, 3.2, sd + 0.6);
      let pr = 246 * body, pg = 198 * body, pb = 150 * body;
      pr *= 1 + 0.35 * rel; pg *= 1 + 0.35 * rel; pb *= 1 + 0.35 * rel;
      pr += (150 - pr) * 0.75 * ring; pg += (34 - pg) * 0.75 * ring; pb += (22 - pb) * 0.75 * ring;
      const m = L.clamp(0.5 - dpx / 1.2);
      cr += (pr - cr) * m; cg += (pg - cg) * m; cb += (pb - cb) * m;
    }
    const o = k * 4;
    d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = alpha * 255;
  }
  const sprite = L.makeCanvas(size, size), g = sprite.getContext('2d');
  g.putImageData(img, 0, 0);

  // sugar-frost: fine crystals caught in the light, a few darker specks of grit
  g.globalCompositeOperation = 'source-atop';
  const nd = Math.round(r * r * 0.03);
  for (let n = 0; n < nd; n++) {
    const an = rg.range(0, TAU), qq = Math.sqrt(rg()) * 0.97, x = half + Math.cos(an) * qq * r, y = half + Math.sin(an) * qq * r;
    if (nz.fbm(x / (r * 0.3) + 50, y / (r * 0.3), 2) < -0.12) continue;      // the frosting lies in patches
    const rad = 0.5 + 1.25 * Math.pow(rg(), 2.4) * (0.7 + r / 240);
    if (rg.chance(0.24)) g.fillStyle = `rgba(96,8,12,${rg.range(0.25, 0.55).toFixed(3)})`;
    else g.fillStyle = `rgba(255,${rg.int(196, 232)},${rg.int(176, 214)},${rg.range(0.22, 0.85).toFixed(3)})`;
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  // halo: the glow that spills off the slice into the dark (kept out of the slice itself so the holes stay clean)
  const bm = Math.round(r * 0.5) + 10, bs = size + bm * 2;
  const bloom = L.makeCanvas(bs, bs), bg = bloom.getContext('2d');
  bg.filter = `blur(${(r * 0.13).toFixed(1)}px)`; bg.drawImage(sprite, bm, bm); bg.filter = 'none';
  bg.globalCompositeOperation = 'destination-out';
  bg.fillStyle = L.radial(bg, bs / 2 + (c.x - ox - half), bs / 2 + (c.y - oy - half), r * 0.78, r * 1.0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  bg.fillRect(0, 0, bs, bs);

  // outline polygon in frame coordinates (for the contact marks baked into the dish)
  const outline = [];
  for (let k = 0; k < 120; k++) {
    const ph = (k / 120) * TAU, e = eTab[Math.round((k / 120) * NT)];
    outline.push([Math.cos(ph + rot0), Math.sin(ph + rot0), r * e]);
  }
  return { sprite, bloom, x: ox, y: oy, bm, cx: c.x, cy: c.y, r, outline, phase: rg(), amp: rg.range(0.6, 1), speed: rg.range(0.9, 1.5) };
}

// ───────────────────────── the dish ─────────────────────────
const WALL = 40;               // the dish's own rim (px): smooth and edge-lit; the juice starts inside it
function buildDish(env, slices) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 8;
  const FW = W + PAD * 2, FH = H + PAD - Y0;
  const w = Math.ceil(FW / Q) + 2, h = Math.ceil(FH / Q) + 2, N = w * h;
  const nA = L.makeNoise('s11-dishA'), nB = L.makeNoise('s11-dishB');
  const Hh = new Float32Array(N), L1 = new Float32Array(N), L2 = new Float32Array(N), Id = new Float32Array(N), Mo = new Float32Array(N),
    Dv = new Float32Array(N), Sm = new Float32Array(N), Po = new Float32Array(N), Pe = new Float32Array(N), Th = new Float32Array(N), Lq = new Float32Array(N);
  for (let j = 0; j < h; j++) {
    const fy = Y0 + (j + 0.5) * Q, ddy = cy - fy;
    for (let i = 0; i < w; i++) {
      const k = j * w + i, ddx = X0 + (i + 0.5) * Q - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      const v = R - rr;                                     // depth below the lip (px)
      Dv[k] = v;
      if (v < -8) continue;
      const th = Math.atan2(ddx, ddy), u = th * R;
      const mott = nB.fbm(u / 300, v / 300, 3);
      const liquid = sstep(WALL - 3, WALL + 5, v);
      let l1 = 0, l2 = 0, pool = 0, pe = 0;
      Id[k] = 0.5;
      if (liquid > 0) {
        const wx = nA.n2(u / 130, v / 130), wy = nA.n2(u / 130 + 31.7, v / 130 - 17.3);
        cell(u / 15 + wx * 0.5, v / 15 + wy * 0.5);
        const e1 = Math.sqrt(cD2) - Math.sqrt(cD1); Id[k] = cId;
        const patch = sstep(-0.4, 0.3, nB.fbm(u / 170 + 3, v / 170, 3));
        l1 = (1 - sstep(0.02, 0.27, e1)) * (0.3 + 0.7 * patch);      // the fine net: a skin of pulp puckered into small cells
        cell(u / 105 + wx * 0.7 + 9.3, v / 105 + wy * 0.7 + 4.1);
        const e2 = Math.sqrt(cD2) - Math.sqrt(cD1);
        const pv = v + 42 * nA.fbm(u / 240 + 13, v / 240, 2);
        pool = sstep(316, 338, pv);                                   // the deeper pool in the middle of the dish
        pe = sstep(298, 318, pv) * (1 - sstep(320, 346, pv));
        l2 = (1 - sstep(0, 0.085, e2)) * sstep(110, 290, v) * (0.4 + 0.6 * pool);   // coarse veins: darker channels, further in
      }
      L1[k] = l1 * liquid; L2[k] = l2 * liquid; Mo[k] = mott; Po[k] = pool; Pe[k] = pe; Th[k] = th; Lq[k] = liquid;
      Sm[k] = 0.3 + 0.7 * sstep(-0.25, 0.45, nB.fbm(u / 420 + 7, v / 210, 2));
      // the juice climbs the wall in a meniscus; the pool lies a little lower than the film round it
      Hh[k] = 1.5 * (1 - sstep(WALL - 2, WALL + 26, v)) + liquid * (0.7 * l1 - 0.8 * l2 + 0.3 * mott - 0.5 * pool) + 0.05 * nB.n2(u / 5, v / 5);
    }
  }
  const JUICE = lut([[0.05, '#e23c8c'], [0.1, '#d02a7a'], [0.16, '#c2256f'], [0.3, '#a81c63'], [0.42, '#8e1655'], [0.6, '#5e0d3a'], [1, '#2a061c']]);   // v / 800
  const POOL = lut([[0.38, '#84114a'], [0.5, '#660c3c'], [0.62, '#46082c'], [0.78, '#2c061e'], [1, '#1c0414']]);
  const RIM = lut([[0, '#fcc8dc'], [0.2, '#f9acca'], [0.6, '#f386b6'], [1, '#ea62a0']]);                                                              // v / WALL
  const img = new ImageData(w, h), d = img.data;
  const KS = 1.3 * (Q / 1.5);
  for (let j = 1; j < h - 1; j++) {
    const fy = Y0 + (j + 0.5) * Q, floor = 1 - 0.34 * sstep(860, 1130, fy);
    for (let i = 1; i < w - 1; i++) {
      const k = j * w + i, v = Dv[k];
      if (v < -8) continue;
      const liquid = Lq[k], pool = Po[k];
      const gx = (Hh[k + 1] - Hh[k - 1]) * 0.5 * KS / (Q / 1.5), gy = (Hh[k + w] - Hh[k - w]) * 0.5 * KS / (Q / 1.5);
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const dif = (0.38 * gx + 0.62 * gy + 0.69) * inv;                    // key light from the upper left
      const ndh = (0.447 * gy + 0.894) * inv;                              // wet glint: light skimming in over the far lip
      let spec = ndh * ndh; spec *= spec; spec *= spec; spec *= spec; spec *= spec; spec *= ndh * ndh * ndh * ndh;   // ^36
      const li = (L.clamp(v / 800) * (NLUT - 1) | 0) * 3;
      const pm = pool * 0.9;
      const tone = 1 + 0.22 * (Id[k] - 0.5) + 0.13 * Mo[k];
      let cr = (JUICE[li] + (POOL[li] - JUICE[li]) * pm) * tone, cg = (JUICE[li + 1] + (POOL[li + 1] - JUICE[li + 1]) * pm) * tone, cb = (JUICE[li + 2] + (POOL[li + 2] - JUICE[li + 2]) * pm) * tone;
      const near = 1 - sstep(60, 330, v);
      const t1 = L1[k] * (0.2 + 0.3 * near) * (1 - 0.45 * pool);
      cr += (248 - cr) * t1; cg += (128 - cg) * t1; cb += (184 - cb) * t1;
      const t2 = L2[k] * 0.72;
      cr += (72 - cr) * t2; cg += (6 - cg) * t2; cb += (44 - cb) * t2;
      const t3 = Pe[k] * 0.3;
      cr += (242 - cr) * t3; cg += (116 - cg) * t3; cb += (176 - cb) * t3;
      const sh = 1 + 0.5 * (dif / 0.69 - 1);
      cr *= sh; cg *= sh; cb *= sh;
      // wet: pin glints on the threads, and two broken streaks where the surface mirrors a long light
      const sp2 = spec * 0.5 * Sm[k] * (0.3 + 0.7 * (1 - sstep(260, 620, v)));
      const vr = v + 64 * gy, ur = Th[k] + 0.02 * gx;
      const bandA = sstep(150, 166, vr) * (1 - sstep(206, 232, vr)) * sstep(-0.46, -0.34, ur) * (1 - sstep(-0.16, -0.06, ur));
      const bandB = sstep(236, 248, vr) * (1 - sstep(268, 286, vr)) * sstep(0.1, 0.2, ur) * (1 - sstep(0.34, 0.47, ur));
      const gls = sp2 + 0.34 * bandA + 0.22 * bandB;
      cr += 255 * gls; cg += 200 * gls; cb += 226 * gls;
      // the rim itself
      const wi = (L.clamp(v / WALL) * (NLUT - 1) | 0) * 3, wt = 1 + 0.05 * Mo[k];
      cr = RIM[wi] * wt + (cr - RIM[wi] * wt) * liquid; cg = RIM[wi + 1] * wt + (cg - RIM[wi + 1] * wt) * liquid; cb = RIM[wi + 2] * wt + (cb - RIM[wi + 2] * wt) * liquid;
      const o = k * 4;
      d[o] = cr * floor; d[o + 1] = cg * floor; d[o + 2] = cb * floor; d[o + 3] = 255;
    }
  }
  const low = L.makeCanvas(w, h);
  low.getContext('2d').putImageData(img, 0, 0);

  const dish = L.makeCanvas(FW, FH), g = dish.getContext('2d');
  g.translate(-X0, -Y0);
  g.save(); a.clipBelow(g, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(low, 1, 1, w - 2, h - 2, X0 + Q, Y0 + Q, (w - 2) * Q, (h - 2) * Q);
  // crisp full-resolution detail: grain, flecks of pulp, pin-point bubbles
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.4;
  g.fillStyle = g.createPattern(L.grainTex(512, 512, { seed: 's11grain', amount: 0.4 }), 'repeat'); g.fillRect(X0, Y0, FW, FH);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  L.speckle(g, { seed: 's11pulp', count: 2200, x: X0, y: Y0, w: FW, h: FH, rMin: 0.5, rMax: 2, colors: ['#ffc4dc', '#ff9cc4', '#6a0c3c', '#4a0628'], alpha: [0.12, 0.55],
    test: (x, y) => a.drAt(x, y) < -(WALL + 6) });
  const rb = L.rng('s11-bubbles');
  for (let n = 0; n < 110; n++) {
    const th = rb.range(-0.62, 0.62), dd = WALL + 24 + Math.pow(rb(), 1.6) * 520, p = a.pt(th, -dd), br = rb.range(1.5, 4.2);
    g.strokeStyle = 'rgba(70,6,40,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, br, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,214,232,0.75)'; g.beginPath(); g.arc(p.x - br * 0.35, p.y - br * 0.4, br * 0.32, 0, TAU); g.fill();
  }
  g.restore();

  // where each slice rests: it shades what lies under it (so the dish seen through the seed holes is a deeper magenta) …
  g.save(); a.clipBelow(g, -7);
  for (const s of slices) {
    const sx = s.cx + s.r * 0.04, sy = s.cy + s.r * 0.07, sr = s.r * 1.36;
    g.fillStyle = L.radial(g, sx, sy, 0, sr, [[0, 'rgba(96,6,52,0.56)'], [0.6, 'rgba(96,6,52,0.56)'], [0.76, 'rgba(70,4,40,0.44)'], [1, 'rgba(64,4,36,0)']]);
    g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  g.restore();
  // … and the juice wets its edge: a thin bright meniscus
  g.save(); a.clipBelow(g, -(WALL + 3));
  for (const s of slices) {
    const ring = (grow, style, lw) => {
      g.strokeStyle = style; g.lineWidth = lw; g.beginPath();
      s.outline.forEach(([ux, uy, rad], n) => { const x = s.cx + ux * (rad + grow), y = s.cy + uy * (rad + grow); if (n) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath(); g.stroke();
    };
    ring(5, 'rgba(255,140,188,0.26)', 6);
    ring(2.4, 'rgba(255,222,236,0.5)', 1.3);
  }
  g.restore();

  // inner edge of the rim: a hairline of shadow, then the bright line where the juice wets the wall
  g.lineCap = 'butt';
  g.strokeStyle = 'rgba(150,18,90,0.42)'; g.lineWidth = 2.4; a.stroke(g, -(WALL - 1));
  g.strokeStyle = 'rgba(255,226,238,0.5)'; g.lineWidth = 1.4; a.stroke(g, -(WALL + 2.6));
  // the lip: the one hard bright line of the picture, exactly on the arc (it occupies dr −7 … 0)
  g.strokeStyle = 'rgba(255,224,236,0.34)'; g.lineWidth = 12; a.stroke(g, -11);
  g.strokeStyle = L.linear(g, X0, 0, X0 + FW, 0, [[0, '#f29dbc'], [0.5, '#fbbcd2'], [1, '#f29dbc']]); g.lineWidth = 7; a.stroke(g, -3.5);
  g.strokeStyle = '#fff0f5'; g.lineWidth = 2.4; a.stroke(g, -1.6);
  return { canvas: dish, x: X0, y: Y0 };
}

/** black ground with the lip's glow bleeding a little way into it */
function buildBack(env) {
  const a = env.arc;
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#050304'; g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 4, a.R + 96, [[0, 'rgba(226,60,136,0.5)'], [0.1, 'rgba(204,40,116,0.24)'], [0.4, 'rgba(160,22,86,0.07)'], [1, 'rgba(120,10,60,0)']]);
  g.fillRect(0, 0, W, H);
  return c;
}

/** the wet sheen: a soft band of reflected light lying on the juice; it belongs to the light, so it does not turn with the dish */
function buildSheen(env) {
  const a = env.arc, Y0 = Math.floor(a.crestY);
  const c = L.makeCanvas(W, H - Y0), g = c.getContext('2d');
  g.translate(0, -Y0);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 250, a.R - 64, [[0, 'rgba(255,190,222,0)'], [0.42, 'rgba(255,190,222,0.5)'], [0.6, 'rgba(255,214,234,0.62)'], [1, 'rgba(255,190,222,0)']]);
  g.fillRect(0, Y0, W, H - Y0);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 470, a.R - 330, [[0, 'rgba(255,170,214,0)'], [0.5, 'rgba(255,170,214,0.3)'], [1, 'rgba(255,170,214,0)']]);
  g.fillRect(0, Y0, W, H - Y0);
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = L.linear(g, 0, 0, W, 0, [[0, 'rgba(0,0,0,0.05)'], [0.1, 'rgba(0,0,0,0.3)'], [0.27, 'rgba(0,0,0,1)'], [0.4, 'rgba(0,0,0,0.6)'], [0.54, 'rgba(0,0,0,0.06)'],
    [0.68, 'rgba(0,0,0,0.25)'], [0.82, 'rgba(0,0,0,0.62)'], [1, 'rgba(0,0,0,0.1)']]);
  g.fillRect(0, Y0, W, H - Y0);
  return { canvas: c, y: Y0 };
}

/** a few motes of dark-red dust in the black */
function buildDust(env) {
  const a = env.arc, r = L.rng('s11-dust'), out = [];
  while (out.length < 20) {
    const x = r.range(30, W - 30), y = r.range(24, 520);
    if (y > a.yAt(x) - 190) continue;
    const big = r.chance(0.2);
    out.push({ x, y, rad: big ? r.range(7, 13) : r.range(2, 4.4), al: big ? r.range(0.14, 0.26) : r.range(0.3, 0.72), ph: r(), vx: r.range(-9, 9), vy: r.range(-12, -3) });
  }
  const dot = L.makeCanvas(64, 64), g = dot.getContext('2d');
  g.fillStyle = L.radial(g, 32, 32, 0, 32, [[0, 'rgba(168,30,26,1)'], [0.3, 'rgba(130,20,22,0.55)'], [1, 'rgba(110,14,20,0)']]);
  g.fillRect(0, 0, 64, 64);
  return { motes: out, dot };
}

export default {
  name: '山楂片',
  tone: 'light',
  init(env) {
    const a = env.arc;
    // light let through → colour. A: over the black ground (dark field). B: over the lit dish (pinker, a touch hotter).
    const LUT_A = lut([[0, '#140203'], [0.12, '#3a0506'], [0.28, '#760b0d'], [0.45, '#aa1814'], [0.58, '#c8261e'], [0.72, '#e23e24'], [0.84, '#f0562e'], [0.93, '#fb7030'], [1, '#ff9a48']]);
    const LUT_B = lut([[0, '#20030b'], [0.12, '#520716'], [0.28, '#960f24'], [0.45, '#c61e2e'], [0.58, '#de2c36'], [0.72, '#f04a38'], [0.84, '#fb6240'], [0.93, '#ff7e4a'], [1, '#ffa868']]);
    const slices = SLICES.map((sp, i) => buildSlice(a, sp, i, LUT_A, LUT_B));
    S = { slices, dish: buildDish(env, slices), back: buildBack(env), sheen: buildSheen(env), dust: buildDust(env) };
  },
  draw(ctx, env, p) {
    const rot = L.lerp(-0.0175, 0.0175, p);          // 2° in all: the dish turns and carries the slices along the arc
    const zoom = L.lerp(0.996, 1.005, p);
    ctx.drawImage(S.back, 0, 0);
    // dust
    for (const m of S.dust.motes) {
      const tw = 0.62 + 0.38 * Math.sin(TAU * (p * 0.8 + m.ph));
      ctx.globalAlpha = m.al * tw;
      const x = m.x + m.vx * p, y = m.y + m.vy * p;
      ctx.drawImage(S.dust.dot, x - m.rad, y - m.rad, m.rad * 2, m.rad * 2);
    }
    ctx.globalAlpha = 1;
    L.cam(ctx, env, { rot, zoom }, () => ctx.drawImage(S.dish.canvas, S.dish.x, S.dish.y));
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.2;
    ctx.drawImage(S.sheen.canvas, L.lerp(-14, 14, p), S.sheen.y);
    ctx.restore();
    L.cam(ctx, env, { rot, zoom }, () => {
      const fl = S.slices.map((s) => 0.5 + 0.5 * Math.sin(TAU * (p * s.speed + s.phase)));
      ctx.globalCompositeOperation = 'screen';
      S.slices.forEach((s, i) => { ctx.globalAlpha = 0.5 + 0.3 * fl[i] * s.amp; ctx.drawImage(s.bloom, s.x - s.bm, s.y - s.bm); });
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      for (const s of S.slices) ctx.drawImage(s.sprite, s.x, s.y);
      // each slice brightens and dims a little on its own (adding the sprite to itself pushes the reds toward orange)
      ctx.globalCompositeOperation = 'lighter';
      S.slices.forEach((s, i) => { ctx.globalAlpha = 0.02 + 0.14 * fl[i] * s.amp; ctx.drawImage(s.sprite, s.x, s.y); });
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    });
    L.vignette(ctx, { strength: 0.22, inner: 0.55 });
  },
};
