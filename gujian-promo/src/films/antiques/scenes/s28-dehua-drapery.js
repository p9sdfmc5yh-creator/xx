// s28 — 德化白瓷衣褶. Pure black field; under the arc, a close view of the robe of a Dehua "blanc de Chine"
// figure — drapery only, no face, no hands. The arc is the upper contour of the swelling robe, nudged into soft
// little waves where each fold comes over the top.
//
// Everything under the arc is a height field shaded per pixel in init():
//   · every pixel is mapped to fold coordinates (s = position along the arc, fanned out from a point above the crest,
//     d = depth below the arc); a hand-laid list of folds (pipe folds, step folds, pinched ridges; some split, merge,
//     start or die out part-way) is combined with a smooth max, so valleys between neighbours crease sharply;
//   · a raking key light from the upper left: wrapped diffuse, cast shadows swept across the height field,
//     a little bounce light inside the valleys, a tight glaze highlight on the shoulder of each ridge;
//   · the luminance goes through an ivory ramp (black → warm shadow grey → pooled-glaze yellow → ivory → white);
//     the glaze lies thicker and yellower in the hollows and thin and white on the ridges; a few pin-holes (棕眼).
// The key light is rendered at three slightly different azimuths; draw() cross-fades them while the surface slides
// along the arc, so the glaze highlights creep along the ridges and the shadows breathe.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;          // margin for the rot / zoom drift
const TOP = 76;           // rows rendered above the crest: room for the bloom to die out to the pure background
const FAN = 950;          // the folds radiate from a point this far above the arc
const RHO = 74;           // radius of the roll where the robe turns over the top
const E_LO = -4.5, E_HI = 9, E_REF = 46;   // silhouette ripple (px relative to the arc) for fold height 0 … E_REF at the limb
const BG = [4, 4, 4];
const D_MIN = -40, ND = 1100;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ── the folds ──────────────────────────────────────────────────────────────────────────────────────────────
// s: position along the arc at the limb (px from the crest) · wl / wr: half-widths of the left / right flank ·
// a: height · sharp: 0 = round pipe fold, 1 = pinched ridge · in / out: depth where the fold rises / dies ·
// kid: a second ridge that splits off (or runs in and merges) part-way down
const FOLDS = [
  { s: -1340, wl: 140, wr: 34, a: 44, sharp: 0.25 },
  { s: -1135, wl: 46, wr: 60, a: 36, sharp: 0.45, out: 420 },
  { s: -962, wl: 32, wr: 205, a: 46, sharp: 0.3, out: 430, outLen: 260 },
  { s: -704, wl: 205, wr: 32, a: 56, sharp: 0.25 },
  { s: -578, wl: 36, wr: 50, a: 34, sharp: 0.7, in: 60 },
  { s: -424, wl: 56, wr: 70, a: 50, sharp: 0.12, kid: { mode: 'merge', at: 300, len: 260, off: -100, wl: 30, wr: 38, a: 0.6, sharp: 0.6 } },
  { s: -252, wl: 132, wr: 30, a: 54, sharp: 0.3, kid: { mode: 'split', at: 190, len: 270, off: 86, wl: 44, wr: 34, a: 0.8, sharp: 0.45 } },
  { s: -106, wl: 34, wr: 44, a: 32, sharp: 0.65, out: 300, outLen: 230 },
  { s: 34, wl: 36, wr: 210, a: 44, sharp: 0.35 },
  { s: 236, wl: 60, wr: 50, a: 54, sharp: 0.1, kid: { mode: 'merge', at: 350, len: 290, off: 122, wl: 36, wr: 40, a: 0.72, sharp: 0.5 } },
  { s: 542, wl: 172, wr: 30, a: 58, sharp: 0.28 },
  { s: 652, wl: 34, wr: 46, a: 32, sharp: 0.7, in: 110 },
  { s: 802, wl: 112, wr: 32, a: 50, sharp: 0.3, kid: { mode: 'split', at: 235, len: 250, off: -78, wl: 34, wr: 46, a: 0.78, sharp: 0.5 } },
  { s: 944, wl: 34, wr: 170, a: 44, sharp: 0.4 },
  { s: 1122, wl: 56, wr: 52, a: 46, sharp: 0.15 },
  { s: 1292, wl: 140, wr: 32, a: 48, sharp: 0.3 },
  { s: 1440, wl: 50, wr: 60, a: 40, sharp: 0.3 },
];

/** per-fold tables over depth: centre line, height, inverse flank widths */
function buildFolds() {
  const nz = L.makeNoise('s28folds');
  const out = [];
  const add = (f, idx, kid) => {
    const c = new Float32Array(ND), a = new Float32Array(ND), il = new Float32Array(ND), ir = new Float32Array(ND);
    let lo = 1e9, hi = -1e9;
    for (let k = 0; k < ND; k++) {
      const d = k + D_MIN, dd = d < 0 ? 0 : d;
      let cs = f.s + 11 * nz.n2(dd / 310 + idx * 7.31, idx * 3.17 + 0.5);                 // each fold meanders a little on its own
      let env = 1;
      if (f.in !== undefined) env *= sstep(f.in, f.in + (f.inLen || 150), d);
      if (f.out !== undefined) env *= 1 - sstep(f.out, f.out + (f.outLen || 220), d);
      let wl = f.wl, wr = f.wr, amp = f.a;
      if (kid) {
        wl = kid.wl; wr = kid.wr; amp *= kid.a;
        if (kid.mode === 'split') { cs += kid.off * sstep(kid.at, kid.at + kid.len, d); env *= sstep(kid.at - 30, kid.at + 60, d); }
        else { cs += kid.off * (1 - sstep(kid.at - kid.len, kid.at, d)); env *= 1 - sstep(kid.at - 20, kid.at + 70, d); }
      }
      const deepen = 0.8 + 0.5 * sstep(0, 520, d);                                          // folds deepen as they fall
      const swell = 1 + 0.14 * nz.n2(dd / 240 + idx * 11.9, 40.5 + idx);
      const slim = Math.sqrt(FAN / (FAN + dd)) * (1 + 0.1 * nz.n2(dd / 280 - idx * 5.3, 90.5 + idx)); // ridges widen less than the gaps
      c[k] = cs; a[k] = amp * env * deepen * swell; il[k] = 1 / (wl * slim); ir[k] = 1 / (wr * slim);
      if (cs - wl * 1.25 < lo) lo = cs - wl * 1.25; if (cs + wr * 1.25 > hi) hi = cs + wr * 1.25;
    }
    out.push({ c, a, il, ir, sharp: kid ? kid.sharp : f.sharp, lo, hi });
  };
  FOLDS.forEach((f, i) => { add(f, i, null); if (f.kid) add(f, i + 0.5, f.kid); });
  // the minor folds between them: low, soft, coming and going — drapery has a hierarchy, it is not a row of equal ribs
  const r = L.rng('s28minor');
  for (let i = 0, s = -1420; s < 1420; i++) {
    s += r.range(70, 150);
    const f = { s, wl: r.range(34, 105), wr: r.range(34, 105), a: r.range(7, 15), sharp: r.range(0.2, 0.7) };
    if (r.chance(0.45)) { f.in = r.range(30, 300); f.inLen = r.range(90, 220); }
    if (r.chance(0.5)) { f.out = (f.in || 0) + r.range(160, 420); f.outLen = r.range(120, 260); }
    add(f, 40 + i, null);
  }
  return out;
}

/** height of the folded cloth at fold coordinates (s, d): smooth max over the folds */
function makeFoldFn(folds) {
  const n = folds.length, KS = 0.2, EPS = 0.07, VN = 1 / (Math.sqrt(1 + EPS * EPS) - EPS);
  return (s, d) => {
    let fd = d - D_MIN; if (fd < 0) fd = 0; else if (fd > ND - 2) fd = ND - 2;
    const k = fd | 0, t = fd - k;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const f = folds[i];
      if (s < f.lo || s > f.hi) continue;
      const c = f.c[k] + (f.c[k + 1] - f.c[k]) * t;
      let u = s - c; u = u < 0 ? -u * f.il[k] : u * f.ir[k];
      if (u >= 1) continue;
      const a = f.a[k] + (f.a[k + 1] - f.a[k]) * t;
      if (a < 0.02) continue;
      const q = 1 - u * u, v = 1 - (Math.sqrt(u * u + EPS * EPS) - EPS) * VN;    // round pipe · pinched ridge (cusp with a softened tip)
      const h = a * (q * q * (1 - f.sharp) + v * v * f.sharp);
      acc += Math.exp(KS * h) - 1;
    }
    return acc > 0 ? Math.log(1 + acc) / KS : 0;
  };
}

/** separable box blur of a float field, in place (tmp is scratch of the same size) */
function boxBlur(src, w, h, r, tmp) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc * inv;
      const xa = x + r + 1, xb = x - r;
      acc += src[o + (xa >= w ? w - 1 : xa)] - src[o + (xb < 0 ? 0 : xb)];
    }
  }
  const col = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = tmp[y * w + x];
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += col[y < 0 ? 0 : y >= h ? h - 1 : y];
    for (let y = 0; y < h; y++) {
      src[y * w + x] = acc * inv;
      const ya = y + r + 1, yb = y - r;
      acc += col[ya >= h ? h - 1 : ya] - col[yb < 0 ? 0 : yb];
    }
  }
}

/** geometry: height field, coverage, depth below the silhouette, glaze pooling — independent of the light */
function buildFields(arc) {
  const R = arc.R, cx = arc.cx, cy = arc.cy;
  const X0 = -PAD, Y0 = Math.floor(arc.crestY) - TOP;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const foldH = makeFoldFn(buildFolds());
  const nW = L.makeNoise('s28warp'), nF = L.makeNoise('s28fine');
  const warpAt = (s, d) => 54 * nW.fbm(s / 660, d / 540, 2) + 15 * nW.n2(s / 250 + 9.3, d / 400 - 4.1);   // the folds flow, they are not ruled lines

  // slow fields on a coarse grid
  const CS = 8, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const gWarp = new Float32Array(cw * ch), gLump = new Float32Array(cw * ch), gGlaze = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const dx = X0 + i * CS - cx, dy = cy - (Y0 + j * CS), rr = Math.hypot(dx, dy), d = R - rr;
    const s = Math.atan2(dx, dy) * rr * FAN / (FAN + (d > 0 ? d : 0)), w = warpAt(s, d), sw = s + w, k = j * cw + i;
    gWarp[k] = w;
    gLump[k] = 7 * nW.n2(sw / 310 + 50, d / 620) + 2.4 * nW.n2(sw / 120 - 20, d / 330 + 7);       // the modelled clay is never dead flat
    gGlaze[k] = nF.fbm(sw / 150 + 3, d / 520 - 9, 3);                                              // glaze thickness, streaked down the folds
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // the silhouette: each fold lifts the contour a little where it comes over the top
  const E_S0 = -1600, E_N = 3201;
  const eRaw = new Float32Array(E_N), edge = new Float32Array(E_N);
  for (let i = 0; i < E_N; i++) { const sl = E_S0 + i; eRaw[i] = E_LO + (E_HI - E_LO) * Math.min(1.15, foldH(sl + warpAt(sl, 0), 0) / E_REF); }
  for (let pass = 0; pass < 2; pass++) {       // round the waves off
    const src = pass ? edge.slice() : eRaw;
    for (let i = 0; i < E_N; i++) { let a = 0; for (let q = -12; q <= 12; q++) a += src[Math.min(E_N - 1, Math.max(0, i + q))]; edge[i] = a / 25; }
  }

  const Hh = new Float32Array(N).fill(-1000), Hs = new Float32Array(N).fill(-1000), Ff = new Float32Array(N), Al = new Float32Array(N), De = new Float32Array(N), Gz = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, dy = cy - y;
    for (let i = 0; i < RW; i++) {
      const dx = X0 + i - cx, rr = Math.sqrt(dx * dx + dy * dy), d = R - rr;
      if (d < -14) continue;
      const th = Math.atan2(dx, dy);
      let ef = th * R - E_S0; if (ef < 0) ef = 0; else if (ef > E_N - 2) ef = E_N - 2;
      const e0 = ef | 0, de = d + edge[e0] + (edge[e0 + 1] - edge[e0]) * (ef - e0);
      if (de < -3) continue;
      const sw = th * rr * FAN / (FAN + (d > 0 ? d : 0)) + bil(gWarp, i, j);
      const f = foldH(sw, d) + bil(gLump, i, j);
      const fine = 0.07 * nF.n2(sw / 11, d / 420 + 3.3) + 0.05 * nF.n2((X0 + i) / 4.1, y / 4.1 + 70)   // modelling strokes down the folds · orange peel
        + 0.11 * nF.n2((X0 + i) / 17 - 40, y / 17 + 11);                                                 // (too fine to throw shadows: normals only)
      const u = Math.min(de + 5, RHO), k = j * RW + i;
      Ff[k] = f; De[k] = de; Al[k] = de <= -0.5 ? 0 : de >= 0.5 ? 1 : de + 0.5; Gz[k] = bil(gGlaze, i, j);
      Hs[k] = Math.sqrt(RHO * RHO - (RHO - u) * (RHO - u)) + 70 * (1 - Math.exp(-(de > 0 ? de : 0) / 380)) + f
        + 0.52 * nF.n2(sw / 44 + 17, d / 76 - 8);                                                        // the thumb-smoothed clay under the glaze
      Hh[k] = Hs[k] + fine;
    }
  }
  // hollows (where the glaze pools) vs. ridges (where it runs thin): fold height against its own blur
  const Pool = Ff.slice(), tmp = new Float32Array(N);
  boxBlur(Pool, RW, RH, 11, tmp); boxBlur(Pool, RW, RH, 11, tmp);
  for (let k = 0; k < N; k++) Pool[k] -= Ff[k];
  return { X0, Y0, RW, RH, N, Hh, Hs, Al, De, Gz, Pool, tmp, Sh: Ff, Ed: new Float32Array(N), Eb: new Float32Array(N), Sp: new Float32Array(N), Nb: new Float32Array(N), Fl: new Float32Array(N) };
}

// luminance → porcelain colour: black · warm shadow · 影灰 · 积釉暖黄 · 象牙白 · white
const RAMP = (() => {
  const st = [[0, '#040404'], [0.06, '#0d0b08'], [0.16, '#2e281e'], [0.3, '#6f6a5c'], [0.42, '#af9a70'], [0.54, '#d7c291'], [0.64, '#e2d5b0'],
    [0.74, '#ece5cd'], [0.84, '#f3ecd8'], [0.93, '#faf6e9'], [1, '#fffdf6']].map(([t, c]) => [t, hex(c)]);
  const n = 1024, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); let q = 1; while (q < st.length - 1 && st[q][0] < t) q++;
    const a = st[q - 1], b = st[q], k = (t - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * k;
  }
  return out;
})();

const EL = 28, KE = 2.9, KB = 0.3, FILL = 0.035, PEN = 2.2;

/** light one state of the key into RGBA bytes `px` (opaque, on the black field); `bloom` gets the hot parts at quarter size */
function shade(F, az, gx0, px, bloom) {
  const { X0, Y0, RW, RH, Hh, Hs, Al, De, Gz, Pool, tmp, Sh, Ed, Eb, Sp, Nb, Fl } = F;
  const ra = (az * Math.PI) / 180, re = (EL * Math.PI) / 180;
  const lx = -Math.cos(ra) * Math.cos(re), ly = -Math.sin(ra) * Math.cos(re), lz = Math.sin(re);
  const bx = 0.9, by = 0.1, bz = 0.42;        // bounce comes back off the lit flank of the next ridge to the right
  const fx = 0.42, fy = -0.42, fz = 0.8;       // a whisper of fill from the upper right, so the shadow sides still turn

  // 1) cast shadows. March every line that runs with the light (a sheared copy of the field), carrying the shadow
  //    ceiling along it; then read the depth-in-shadow back at the pixels. No smearing, so the edges stay clean.
  const ta = Math.tan(ra), drop = Math.tan(re) / Math.cos(ra);
  const cMin = Math.floor(-ta * (RW - 1)) - 1, nC = RH - cMin + 1;
  if (!F.shear || F.shear.length < nC * RW) F.shear = new Float32Array(nC * RW);
  const D = F.shear;
  for (let ci = 0; ci < nC; ci++) {
    const c = cMin + ci, o = ci * RW; let top = -1e4;
    for (let x = 0; x < RW; x++) {
      const y = c + ta * x;
      if (y < 0 || y >= RH - 1) { D[o + x] = 0; continue; }
      const j = y | 0, k = j * RW + x, h0 = Hs[k], h1 = Hs[k + RW];
      const h = h0 < -500 ? h1 : h1 < -500 ? h0 : h0 + (h1 - h0) * (y - j);
      top -= drop; if (h > top) top = h;
      D[o + x] = h < -500 ? 0 : top - h;
    }
  }
  for (let j = 0; j < RH; j++) for (let x = 0; x < RW; x++) {
    const c = j - ta * x - cMin, ci = c | 0, a0 = D[ci * RW + x];
    Sh[j * RW + x] = a0 + (D[(ci + 1) * RW + x] - a0) * (c - ci);
  }
  // 2) direct light, glaze highlight, bounce weight
  Ed.fill(0); Sp.fill(0);
  for (let j = 1; j < RH - 1; j++) {
    const y = Y0 + j;
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i;
      if (Al[k] <= 0) continue;
      const gx = (Hh[k + 1] - Hh[k - 1]) * 0.5, gy = (Hh[k + RW] - Hh[k - RW]) * 0.5, inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inv, ny = -gy * inv, nzv = inv;
      const sh = 1 - sstep(0.2, PEN, Sh[k]);
      const x = X0 + i, de = De[k];
      const fall = (1 - 0.4 * sstep(0.3, 1.2, Math.hypot(x - 440, (y - 600) * 1.2) / 1700)) * (1 - 0.42 * sstep(100, 600, de));
      const nb = nx * bx + ny * by + nzv * bz;
      Nb[k] = nb > 0 ? nb : 0;
      Fl[k] = (0.5 + 0.5 * (nx * fx + ny * fy + nzv * fz)) * fall;
      if (sh <= 0) continue;
      let wr = (nx * lx + ny * ly + nzv * lz + 0.1) / 1.1; if (wr < 0) wr = 0;
      Ed[k] = wr * sh * fall;
      // the glaze mirrors a tall strip light: a bright line wherever the flank tilts toward it by just the right amount
      const sy = (gy - 0.14) / 0.42, ey = sy * sy;
      if (ey < 6) { const s1 = (gx - gx0) / 0.085, s2 = (gx - gx0) / 0.24; const s3 = (gx - 0.2) / 0.13; Sp[k] = sh * fall * (0.85 * Math.exp(-s1 * s1 - ey) + 0.12 * Math.exp(-s2 * s2 - ey) + 0.07 * Math.exp(-s3 * s3 - ey)); }
    }
  }
  // 3) light bouncing around inside the white valleys
  Eb.set(Ed); boxBlur(Eb, RW, RH, 22, tmp); boxBlur(Eb, RW, RH, 22, tmp);
  // 4) colour
  const bw = bloom.w, BS = bloom.s, bd = bloom.d; bd.fill(0);
  for (let j = 0; j < RH; j++) {
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, o = k * 4, al = Al[k];
      px[o + 3] = 255;
      if (al <= 0) { px[o] = BG[0]; px[o + 1] = BG[1]; px[o + 2] = BG[2]; continue; }
      const de = De[k], conc = Pool[k], gz = Gz[k];
      const ao = 1 - 0.8 * sstep(2, 26, conc);                                   // the hollows see less of everything
      let E = Ed[k] * (1 + 0.05 * gz) + FILL * Fl[k] * ao + KB * Eb[k] * (0.12 + 0.88 * Nb[k] * Nb[k]) * (0.55 + 0.45 * ao);
      if (de < 24) E += 0.05 * Math.exp(-(de > 0 ? de : 0) / 5);                 // a breath of rim light keeps the contour alive inside the shadow notches
      const lum = 1 - Math.exp(-KE * E), li = ((lum * 1023) | 0) * 3;
      let r = RAMP[li], g = RAMP[li + 1], b = RAMP[li + 2];
      let warm = 0.95 * sstep(1.5, 14, conc) + 0.2 * gz + 0.06; warm = warm < 0 ? 0 : warm > 1 ? 1 : warm;
      r *= 1 - 0.09 * warm; g *= 1 - 0.135 * warm; b *= 1 - 0.29 * warm;
      const cv = sstep(2, 13, -conc) * lum * lum * 0.4;
      r += (255 - r) * cv; g += (253 - g) * cv; b += (246 - b) * cv;
      const sp = Sp[k] * (0.25 + 0.75 * sstep(-2, 8, -conc));
      r += 255 * sp; g += 252 * sp; b += 238 * sp;
      px[o] = BG[0] + (r - BG[0]) * al; px[o + 1] = BG[1] + (g - BG[1]) * al; px[o + 2] = BG[2] + (b - BG[2]) * al;
      const hot = (lum > 0.8 ? (lum - 0.8) * 5 : 0) * 0.5 + sp * 1.4;
      if (hot > 0) bd[((j / BS) | 0) * bw + ((i / BS) | 0)] += hot * al;
    }
  }
}

/** pin-holes in the glaze (棕眼): a handful of tiny brown pits on the lit faces */
function pickPits(F, arc) {
  const r = L.rng('s28pits'), pits = [], span = arc.span(PAD - 20);
  for (let n = 0; n < 900 && pits.length < 15; n++) {
    const p = arc.pt(r.range(-span, span), -r.range(22, 600));
    const i = Math.round(p.x - F.X0), j = Math.round(p.y - F.Y0);
    const rad = r.range(0.9, 1.7), k = r.range(0.4, 0.75);
    if (i < 4 || j < 4 || i > F.RW - 5 || j > F.RH - 5) continue;
    if (F.Ed[j * F.RW + i] < 0.34 || F.Al[j * F.RW + i] < 1) continue;
    pits.push({ x: p.x - F.X0, y: p.y - F.Y0, r: rad, k });
    if (r.chance(0.2)) pits.push({ x: p.x - F.X0 + r.range(-16, 16), y: p.y - F.Y0 + r.range(5, 22), r: rad * 0.7, k: k * 0.8 });
  }
  return pits;
}
function stampPits(px, RW, RH, pits) {
  for (const q of pits) {
    const e = Math.ceil(q.r + 3);
    for (let j = Math.max(0, Math.floor(q.y - e)); j <= Math.min(RH - 1, Math.ceil(q.y + e)); j++) {
      for (let i = Math.max(0, Math.floor(q.x - e)); i <= Math.min(RW - 1, Math.ceil(q.x + e)); i++) {
        const dx = i - q.x, dy = j - q.y, o = (j * RW + i) * 4;
        const core = (1 - sstep(q.r - 0.8, q.r + 0.7, Math.hypot(dx, dy))) * q.k;                              // the pit
        const ring = Math.exp(-Math.pow((Math.hypot(dx, dy) - q.r - 1.2) / 1.1, 2)) * 0.16 * q.k;              // glaze drawn thick and yellow round it
        const lip = Math.exp(-((dx - q.r * 0.8) * (dx - q.r * 0.8) + (dy - q.r * 0.7) * (dy - q.r * 0.7)) / (q.r * q.r * 0.35)) * 0.3 * q.k;   // far wall catches the light
        px[o] += (150 - px[o]) * ring; px[o + 1] += (118 - px[o + 1]) * ring; px[o + 2] += (60 - px[o + 2]) * ring;
        px[o] += (66 - px[o]) * core; px[o + 1] += (44 - px[o + 1]) * core; px[o + 2] += (24 - px[o + 2]) * core;
        px[o] += (255 - px[o]) * lip; px[o + 1] += (250 - px[o + 1]) * lip; px[o + 2] += (232 - px[o + 2]) * lip;
      }
    }
  }
}

const AZ = [27, 30.5, 34];        // the key swings a few degrees during the shot …
const GX = [0.45, 0.52, 0.59];    // … and its reflection in the glaze creeps across the shoulders of the ridges

export default {
  name: '德化白瓷衣褶',
  tone: 'light',
  init(env) {
    const F = buildFields(env.arc);
    const BS = 4, bw = Math.ceil(F.RW / BS), bh = Math.ceil(F.RH / BS);
    const bloom = { w: bw, h: bh, s: BS, d: new Float32Array(bw * bh) };
    let pits = null;
    const states = AZ.map((az, q) => {
      const img = new ImageData(F.RW, F.RH);
      shade(F, az, GX[q], img.data, bloom);
      if (!pits) pits = pickPits(F, env.arc);
      stampPits(img.data, F.RW, F.RH, pits);
      const c = L.makeCanvas(F.RW, F.RH), g = c.getContext('2d');
      g.putImageData(img, 0, 0);
      // bloom: the hottest ivory and the glaze highlights spill a soft glow (what makes the glaze read as 莹润)
      const bi = new ImageData(bw, bh), b = bi.data;
      for (let k = 0; k < bw * bh; k++) { const v = Math.min(1, bloom.d[k] / (BS * BS)); b[k * 4] = 255 * v; b[k * 4 + 1] = 244 * v; b[k * 4 + 2] = 216 * v; b[k * 4 + 3] = 255; }
      const bc = L.makeCanvas(bw, bh); bc.getContext('2d').putImageData(bi, 0, 0);
      const bb = L.blurred(bc, 3.6);
      g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.5; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(bb, 0, 0, bw * BS, bh * BS);
      g.restore();
      return c;
    });
    S = { states, X0: F.X0, Y0: F.Y0 };
  },
  draw(ctx, env, p) {
    ctx.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
    ctx.fillRect(0, 0, W, H);
    const n = S.states.length - 1, f = L.clamp(p) * n, i0 = Math.min(n - 1, Math.floor(f)), k = f - i0;
    L.cam(ctx, env, { rot: L.lerp(-0.0055, 0.0055, p), zoom: L.lerp(1, 1.008, p) }, () => {
      ctx.drawImage(S.states[i0], S.X0, S.Y0);
      if (k > 0.002) { ctx.globalAlpha = k; ctx.drawImage(S.states[i0 + 1], S.X0, S.Y0); }
    });
  },
};
