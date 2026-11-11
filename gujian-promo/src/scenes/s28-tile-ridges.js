// s28 — 月下瓦垄. A macro photograph of an old grey-tile roof (筒瓦屋面) under the moon, almost black & white.
// The arc is the roof's round ridge (过垄脊): the crowns of the 筒瓦 rolling over it make a softly waved edge whose
// crests touch env.arc. Below it only seven or eight FAT tile ridges fill the frame — no two alike: different widths,
// tiles that sit crooked, chipped ends, a broken tile, lime pointing (捉节灰 / 夹垄灰) that has half fallen away,
// crusts of lichen, cushions of moss and a few 瓦松 standing in the troughs.
// Recipe: build a real HEIGHT FIELD of the roof once in init(), light it with a raking moon from the upper left
// (lambert + marched soft shadows; the light gets lower down the slope, so the shadows open into black wedges),
// split-tone it (cold moonlit faces, a breath of warm bounce in the shadows), then give it a lens: sharp at the crest,
// falling out of focus toward the sides and the eaves. draw() only blits that one layer with a small rot.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 80;         // the camera only drifts ~16 px; a small margin keeps the per-pixel pass small
const MT = 36;          // head-room above the ridge in the cropped layer (for the lens blur and the halation)
const TOP = 2;          // dr of the tallest crowns (their bright rim then sits right on the arc)
const HT = 58;          // how far a full 筒瓦 stands above the pan tiles (height units = px)
const PAN = 0.3;        // depth of the 板瓦 trough as a fraction of HT
const FOOT = 0.2;       // the mortar packed along the foot of a tube (夹垄灰), as a fraction of HT
const AMP = 31;         // oblique view: a full tube height shifts this many px up-screen → the wave height at the ridge
const WB = 100;         // near the ridge the mortar packing rounds the cross-section into a soft wave
const W0 = 72, KR = 26; // the roof rolls away over the ridge: width and drop of that roll-off
const WOB = 3.2;        // how far a tile ridge snakes off its line (px)
const STEP = 6;         // the lower end of each 筒瓦 sits this proud of the head of the next one
const PHI = L.deg(38);  // direction the light TRAVELS on screen (0 = → , 90 = ↓): from the upper left
const EL_TOP = L.deg(52), EL_LOW = L.deg(19);   // moon elevation above the tile surface: high at the ridge, raking lower down
const BG = -300;        // height value that marks "sky"
let S = null;

const hash2 = (a, b) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// broken 筒瓦: [tube (relative to the hero tube at the crest), tile number down the ridge, where the break starts (fraction of
// the tile), slant of the fracture, which part is gone (1 = lower, 0 = upper), seed]
const BREAKS = [[-1, 1, 0.38, 0.36, 1, 3.1], [2, 2, 0.55, -0.45, 0, 8.7], [-4, 1, 0.5, 0.2, 1, 5.5], [4, 1, 0.3, 0.4, 1, 1.9]];
// 瓦松 clumps: [tube (relative), where across that tube it roots (in half-widths: −1 = its moonlit left foot), distance
// down the slope, scale, seed]. They are modelled into the height field, so the same moon lights them and they cast shadows.
const WASONG = [[0, -1.02, 300, 1.0, 'a'], [2, -1.0, 236, 0.74, 'b'], [-3, -0.96, 372, 1.15, 'c']];

function makeGeom(env) {
  const a = env.arc, R = a.R;
  const SMAX = 1480;                                        // arc-px half-range covered by the ridges
  const r = L.rng('s28ridges-b');
  const n = 15, mid = 7;
  const thw = new Float32Array(n), gap = new Float32Array(n), tc = new Float32Array(n), thk = new Float32Array(n);
  const tlean = new Float32Array(n), tph = new Float32Array(n), tlt = new Float32Array(n), tjo = new Float32Array(n);
  const tgL = new Float32Array(n), tgR = new Float32Array(n), tlp = new Float32Array(n), tpo = new Float32Array(n);
  for (let i = 0; i < n; i++) { thw[i] = r.range(66, 92); gap[i] = r.range(64, 106); }
  // the ridges at the crest are placed by hand: a big one just left of centre, slighter neighbours either side
  thw[mid] = 93; thw[mid - 1] = 74; thw[mid + 1] = 84; gap[mid - 1] = 92; gap[mid] = 70; gap[mid + 1] = 98; thw[mid + 2] = 70; thw[mid - 2] = 88; gap[mid - 2] = 72;
  tc[mid] = -66;
  for (let i = mid + 1; i < n; i++) tc[i] = tc[i - 1] + thw[i - 1] + gap[i - 1] + thw[i];
  for (let i = mid - 1; i >= 0; i--) tc[i] = tc[i + 1] - thw[i + 1] - gap[i] - thw[i];
  for (let i = 0; i < n; i++) {
    thk[i] = L.clamp(0.9 + ((thw[i] - 66) / 27) * 0.1 + r.range(-0.02, 0.02), 0.87, 1);   // wider tiles stand taller
    tlean[i] = r.range(-0.014, 0.014);
    tph[i] = r.range(0, 100);
    tlt[i] = r.range(198, 252);
    tjo[i] = tlt[i] - r.range(72, 188);                     // the first joint below the ridge falls somewhere else on every ridge
    tgL[i] = i > 0 ? gap[i - 1] : 90; tgR[i] = i < n - 1 ? gap[i] : 90;
    tlp[i] = r.range(58, 82); tpo[i] = r.range(0, tlp[i]);
  }
  thk[mid] = 1; thk[mid + 1] = 0.95; thk[mid - 1] = 0.9;
  /** cross-section of the intact roof at lateral offset d (px) from the axis of tube k: 1 on the crown of a full tile,
   *  FOOT where it beds into the mortar, negative down in the 板瓦 trough */
  const macro = (k, d) => {
    const hw = thw[k], ad = d < 0 ? -d : d;
    if (ad < hw) { const q = ad / hw, t = Math.sqrt(1 - q * q); return (t > FOOT ? t : FOOT) * thk[k]; }
    const dn = ad - hw, g = d > 0 ? tgR[k] : tgL[k]; let u = dn / g; if (u > 0.5) u = 0.5;
    const e = 1 - 2 * u;
    return -PAN * (1 - e * e) + FOOT * thk[k] * Math.exp(-dn / 8);
  };
  // per px along the arc: which tube is nearest (by its edge), the softened section the ridge shows against the sky,
  // and how far each crown sits below the line (they are not all exactly level)
  const NS = 2 * SMAX + 1;
  const nz = L.makeNoise('s28');
  const lut = new Uint8Array(NS), raw = new Float32Array(NS), edgeP = new Float32Array(NS), dcapT = new Float32Array(NS);
  const lumpT = new Float32Array(NS), jwT = new Float32Array(NS);
  for (let si = 0; si < NS; si++) {
    const s = si - SMAX; let best = 0, bd = 1e9;
    for (let k = 0; k < n; k++) { const dd = Math.abs(s - tc[k]) - thw[k]; if (dd < bd) { bd = dd; best = k; } }
    lut[si] = best;
    // the silhouette is rounder than the tile section: mortar is packed over the heads, so each crown reads as a soft hump
    const dE = Math.abs(s - tc[best]), qE = dE / thw[best];
    raw[si] = qE < 1 ? Math.max(macro(best, s - tc[best]) * 0.25, thk[best] * Math.pow(1 - qE * qE, 0.95)) : macro(best, s - tc[best]);
    dcapT[si] = (nz.n2(s / 300, 11.3) * 0.5 + 0.5) * 2.0;
    lumpT[si] = (nz.n2(s / 26, 5.5) * 0.5 + 0.5) * 2.2 + (nz.n2(s / 9, 15.5) * 0.5 + 0.5) * 0.9;   // lumps of lime along the very edge
    jwT[si] = 7 * nz.n2(s * 0.016, 3.1) + 3 * nz.n2(s * 0.055, 8.2);                                 // no joint runs dead straight
  }
  const box = (src, dst, rad) => {
    let acc = 0; const wn = 2 * rad + 1;
    for (let i = -rad; i <= rad; i++) acc += src[L.clamp(i, 0, NS - 1)];
    for (let i = 0; i < NS; i++) { dst[i] = acc / wn; acc += src[Math.min(NS - 1, i + rad + 1)] - src[Math.max(0, i - rad)]; }
  };
  const tmp = new Float32Array(NS);
  box(raw, tmp, 13); box(tmp, edgeP, 9);
  // every ridge snakes a little off its line
  const NVW = 720, wobT = new Float32Array(n * NVW);
  for (let k = 0; k < n; k++) for (let v = 0; v < NVW; v++) wobT[k * NVW + v] = tlean[k] * v + WOB * nz.n2(k * 3.7 + 0.5, v * 0.0045 + tph[k]);
  /** the waved ridge silhouette: dr of the roof's upper edge at angle th */
  const edgeDr = (th) => {
    const sf = th * R + SMAX, si = L.clamp(Math.floor(sf), 0, NS - 2), t = L.clamp(sf - si);
    return TOP - AMP * (1 - (edgeP[si] * (1 - t) + edgeP[si + 1] * t)) - (dcapT[si] * (1 - t) + dcapT[si + 1] * t) - (lumpT[si] * (1 - t) + lumpT[si + 1] * t);
  };
  const thMax = (SMAX - 30) / R;
  const edgePath = (g) => {
    const step = 1.5 / R;
    g.beginPath();
    let first = true;
    for (let th = -thMax; th <= thMax; th += step) {
      const p = a.pt(th, edgeDr(th));
      if (first) { g.moveTo(p.x, p.y); first = false; } else g.lineTo(p.x, p.y);
    }
    g.lineTo(W + PAD + 300, H + PAD + 300); g.lineTo(-PAD - 300, H + PAD + 300); g.closePath();
  };
  return { a, R, n, mid, SMAX, NS, NVW, thw, tc, thk, tlt, tjo, tgL, tgR, tlp, tpo, lut, edgeP, dcapT, jwT, wobT, macro, nz, edgePath };
}

function buildRoof(env) {
  const G = makeGeom(env);
  const { a, R, n, mid, SMAX, NS, NVW, thw, tc, thk, tlt, tjo, tlp, tpo, lut, edgeP, dcapT, jwT, wobT, macro, nz } = G;
  const x0 = -PAD, y0 = Math.floor(a.crestY - 8), x1 = W + PAD, y1 = H + PAD;
  const cw = x1 - x0, ch = y1 - y0, NPX = cw * ch;
  const Hm = new Float32Array(NPX), Dt = new Float32Array(NPX), Al = new Float32Array(NPX), Ao = new Float32Array(NPX);
  const pitH = new Float32Array(NPX);

  // ── stamps (all in map px): moss cushions, pits, chips, a few cracks ──
  /** a spot on the roof → map px. k = tube, lat = px off its axis, w = distance down the slope */
  const toMap = (k, lat, w) => {
    const v = w + AMP * (1 - macro(k, lat));
    const q = a.pt((tc[k] + wobT[k * NVW + Math.min(NVW - 1, Math.max(0, v | 0))] + lat) / R, TOP - v);
    return [q.x - x0, q.y - y0];
  };
  const stamp = (arr, arrA, mx, my, rad, hgt) => {
    const i0 = Math.max(0, Math.floor(mx - rad)), i1 = Math.min(cw - 1, Math.ceil(mx + rad));
    const j0 = Math.max(0, Math.floor(my - rad)), j1 = Math.min(ch - 1, Math.ceil(my + rad));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d2 = ((i - mx) * (i - mx) + (j - my) * (j - my)) / (rad * rad);
      if (d2 >= 1) continue;
      const kk = 1 - d2, idx = j * cw + i;
      if (hgt > 0) { const hh = hgt * Math.sqrt(kk); if (hh > arr[idx]) arr[idx] = hh; const aa = L.clamp(kk * 2.4); if (arrA && aa > arrA[idx]) arrA[idx] = aa; }
      else arr[idx] += hgt * kk;
    }
  };
  const kMin = 1, kMax = n - 2;
  // pits, chips knocked out of tile ends, and a few cracks that run across a tile
  const rp = L.rng('s28pits-b');
  // few but large: under a raking light every pit is a black fleck with a bright lip — the "grain" of this picture
  for (let m = 0; m < 520; m++) {
    const big = rp.chance(0.16), rad = rp.range(2.6, 5.6) * (big ? 2.1 : 1), mx = rp() * cw, my = rp() * ch, dp = -rp.range(1.6, 3.6) * (big ? 1.5 : 1);
    stamp(pitH, null, mx, my, rad, dp);
    if (big) for (let q = 0; q < 3; q++) stamp(pitH, null, mx + rp.range(-1, 1) * rad, my + rp.range(-1, 1) * rad, rad * rp.range(0.4, 0.7), dp * 0.7);
  }
  for (let m = 0; m < 40; m++) {
    const k = rp.int(kMin, kMax), lat = rp.range(-0.9, 0.9) * thw[k];
    const [mx, my] = toMap(k, lat, rp.int(1, 3) * tlt[k] - tjo[k] + rp.range(-2, 9));
    for (let q = 0; q < 4; q++) stamp(pitH, null, mx + rp.range(-10, 10), my + rp.range(-3, 6), rp.range(4, 11), -rp.range(3, 6.5));
  }
  for (let m = 0; m < 3; m++) {
    const k = mid + [-2, 1, 3, -5][m]; let lat = -thw[k] * rp.range(0.5, 0.9), w = [150, 330, 120, 200][m] + rp.range(-20, 20);
    const dl = (thw[k] * rp.range(1.0, 1.5)) / 30; let dw = rp.range(-1.4, 1.4);
    for (let q = 0; q < 30; q++) {
      const [mx, my] = toMap(k, L.clamp(lat, -thw[k], thw[k]), w);
      stamp(pitH, null, mx, my, rp.range(2.3, 3.8), -rp.range(2.6, 4.2));
      lat += dl; w += dw + rp.range(-1.6, 1.6); if (rp.chance(0.2)) dw = rp.range(-2.4, 2.4);
    }
  }
  const brk = new Uint8Array(n * 16);
  BREAKS.forEach((b, i) => { brk[(mid + b[0]) * 16 + b[1]] = i + 1; });

  // ── height field + albedo ──
  // the slow noises are sampled on coarse grids and interpolated: broad blotches / roughness / lichen (1/6), lumps (1/2)
  const GS = 6, gw2 = Math.ceil(cw / GS) + 2, gh2 = Math.ceil(ch / GS) + 2;
  const gA = new Float32Array(gw2 * gh2), gR = new Float32Array(gw2 * gh2), gL = new Float32Array(gw2 * gh2), gD = new Float32Array(gw2 * gh2), gM = new Float32Array(gw2 * gh2);
  for (let j = 0; j < gh2; j++) for (let i = 0; i < gw2; i++) {
    const X = x0 + i * GS, Y = y0 + j * GS, o = j * gw2 + i;
    gA[o] = nz.fbm(X * 0.0085, Y * 0.0085, 3);
    gR[o] = nz.fbm(X * 0.017 + 70, Y * 0.017 - 30, 2);
    gL[o] = nz.fbm(X * 0.0105 - 40, Y * 0.0105 + 90, 4, 2.1, 0.55);        // pale crustose lichen / old limewash
    gD[o] = nz.fbm(X * 0.019 + 140, Y * 0.019 + 10, 3);                    // dark lichen, soot
    gM[o] = nz.fbm(X * 0.0135 + 300, Y * 0.0135 + 77, 3);                  // where moss has taken hold
  }
  const bw2 = (cw >> 1) + 2, bh2 = (ch >> 1) + 2, gB = new Float32Array(bw2 * bh2);
  for (let j = 0; j < bh2; j++) for (let i = 0; i < bw2; i++) gB[j * bw2 + i] = nz.fbm((x0 + i * 2) * 0.062 + 13, (y0 + j * 2) * 0.062, 2);
  let HMAX = 0;
  for (let j = 0; j < ch; j++) {
    const Y = y0 + j + 0.5, dy = a.cy - Y;
    const gy = (j + 0.5) / GS, gj = gy | 0, ty = gy - gj;
    const by = (j + 0.5) * 0.5, bj = by | 0, tby = by - bj;
    for (let i = 0; i < cw; i++) {
      const idx = j * cw + i, X = x0 + i + 0.5, dx = X - a.cx;
      const rr = Math.sqrt(dx * dx + dy * dy);
      const v = R + TOP - rr;                         // px below the crown line
      if (v < -2) { Hm[idx] = BG; continue; }
      const s = Math.atan2(dx, dy) * R;
      let si = (s + SMAX) | 0; if (si < 0) si = 0; else if (si >= NS) si = NS - 1;
      const k = lut[si], hwk = thw[k], lt = tlt[k];
      const vi = v < 0 ? 0 : v >= NVW ? NVW - 1 : v | 0;
      let d = s - tc[k] - wobT[k * NVW + vi];
      const dc = dcapT[si];
      let p = macro(k, d);
      let w = v - AMP * (1 - p) - dc;                 // distance down the slope from the ridge (oblique projection)
      const isTube = (d < 0 ? -d : d) < hwk;
      let jt = 0, r1 = 0.5, r2 = 0.5, r3 = 0.5, r4 = 0.5;
      if (isTube) {
        jt = Math.floor(Math.max(0, (w > 0 ? w : 0) + jwT[si] + tjo[k]) / lt);
        r1 = hash2(k * 31 + 7, jt); r2 = hash2(k * 17 + 3, jt + 91); r3 = hash2(k + 500, jt * 13 + 5); r4 = hash2(k * 5 + 11, jt * 7 + 29);
        if (jt > 0) {
          // each tile sits a little off the line, a little askew, a hair wider or prouder than its neighbours
          const tv0 = w + jwT[si] + tjo[k] - jt * lt;
          d += (r1 - 0.5) * 13 + (r4 - 0.5) * 0.09 * (tv0 - lt * 0.5);
          const q = (d < 0 ? -d : d) / (hwk * (0.95 + 0.1 * r3));
          const t = q < 1 ? Math.sqrt(1 - q * q) : 0;
          p = (t > FOOT ? t : FOOT) * thk[k] * (0.94 + 0.1 * r2);
          w = v - AMP * (1 - p) - dc;
        }
      }
      if (w < WB) {                                   // toward the ridge the section melts into the soft wave of the silhouette
        const bl = sm(w / WB), pe = edgeP[si];
        p = pe + (p - pe) * bl; w = v - AMP * (1 - p) - dc;
      }
      if (w < -14) { Hm[idx] = BG; continue; }
      const wq = w > 0 ? w : 0;
      const gx = (i + 0.5) / GS, gi = gx | 0, tx = gx - gi, g0 = gj * gw2 + gi;
      const nA = (gA[g0] * (1 - tx) + gA[g0 + 1] * tx) * (1 - ty) + (gA[g0 + gw2] * (1 - tx) + gA[g0 + gw2 + 1] * tx) * ty;
      const nR = (gR[g0] * (1 - tx) + gR[g0 + 1] * tx) * (1 - ty) + (gR[g0 + gw2] * (1 - tx) + gR[g0 + gw2 + 1] * tx) * ty;
      const nL = (gL[g0] * (1 - tx) + gL[g0 + 1] * tx) * (1 - ty) + (gL[g0 + gw2] * (1 - tx) + gL[g0 + gw2 + 1] * tx) * ty;
      const nD = (gD[g0] * (1 - tx) + gD[g0 + 1] * tx) * (1 - ty) + (gD[g0 + gw2] * (1 - tx) + gD[g0 + gw2 + 1] * tx) * ty;
      const nM = (gM[g0] * (1 - tx) + gM[g0 + 1] * tx) * (1 - ty) + (gM[g0 + gw2] * (1 - tx) + gM[g0 + gw2 + 1] * tx) * ty;
      const bx = (i + 0.5) * 0.5, bi = bx | 0, tbx = bx - bi, b0 = bj * bw2 + bi;
      const nB = (gB[b0] * (1 - tbx) + gB[b0 + 1] * tbx) * (1 - tby) + (gB[b0 + bw2] * (1 - tbx) + gB[b0 + bw2 + 1] * tbx) * tby;   // lumps 15—25 px
      const nC = nz.n2(X * 0.27 + 40, Y * 0.27);                        // grit
      let h, al, footP = 0, jointP = 0;
      if (isTube) {
        let tv = wq + jwT[si] + tjo[k] - jt * lt; if (tv < 0) tv = 0; else if (tv > lt) tv = lt;
        let tfd = -1;                                                   // > 0: this far past the fracture of a broken tile
        const bi2 = jt < 16 ? brk[k * 16 + jt] : 0;
        if (bi2) {
          const B = BREAKS[bi2 - 1];
          const tf = B[2] * lt + B[3] * d + 17 * nz.n2(d * 0.045 + B[5], 3.3) + 6 * nz.n2(d * 0.19, B[5] + 9);
          tfd = B[4] ? tv - tf : tf - tv;
        }
        if (tfd > 8) {
          // a broken tile: what is left is its bed — a ridge of old mortar and mud with lime lumps in it
          const q = d / (hwk * 0.5), lump = nz.n2(X * 0.035 + 5, Y * 0.035 + 50);
          p = 0.08 + 0.2 * Math.exp(-q * q) + 0.07 * lump;
          h = HT * p + nB * 2.6;
          al = 0.3 + 0.6 * sm(lump * 2.4 + 0.15 + nB * 0.6);
          footP = 0.7;
        } else {
          const dj = jt === 0 ? lt - tv : Math.min(tv, lt - tv);          // distance to the nearest joint
          h = HT * p + STEP * (tv / lt - 0.5) + (r3 - 0.5) * 2.6;
          al = 0.52 + 0.2 * r2 - (r1 > 0.8 ? 0.12 : 0) + (r4 > 0.86 ? 0.12 : 0);
          al *= 0.94 + 0.12 * nz.n2(s * 0.05, wq * 0.006 + 9);            // rain has streaked the tile down the slope
          jointP = Math.exp(-(dj * dj) / 170);
          if (dj < 62) {
            const jid = tv < lt * 0.5 && jt > 0 ? jt : jt + 1;
            const hl = hash2(k * 7 + 1, jid * 3 + 2);
            // 捉节灰: the lime that points each joint — a lumpy white band, part of it long gone
            const bw = 13 + 22 * hl + 7 * nz.n2(d * 0.07 + jid * 7.3, k * 1.7 + 0.3) + nB * 6;
            const pres = nz.n2(d * 0.028 + jid * 3.1, k * 5.3) + (hl < 0.2 ? -0.6 : 0.45);
            const lw = sm((bw - dj) / 5) * sm(pres / 0.12);
            const gapv = Math.exp(-(dj * dj) / 30) * (1 - lw);
            h += lw * (3.2 + nB * 2.2) - 4 * gapv;
            al = (al + (0.98 - al) * lw) * (1 - 0.5 * gapv);
          }
          // lime has leached out of the joint above and run down the tile
          if (jt > 0 && tv < 150 && hash2(k * 7 + 1, jt * 3 + 2) >= 0.2) al += 0.24 * Math.exp(-tv / 60) * sm(nz.n2(d * 0.085 + jt * 5.1, k * 2.2) * 1.5 + 0.2);
          // 夹垄灰 smeared up the foot of the tile
          const q = (d < 0 ? -d : d) / hwk;
          footP = sm((q - 0.6) / 0.4);
          if (q > 0.74) {
            const fl = sm((q - 0.86 - 0.07 * nB) / 0.05) * sm((nz.n2(k * 9.1 + (d > 0 ? 4 : 0), wq * 0.011) + 0.3) / 0.15);
            al += (0.94 - al) * fl; h += 1.4 * fl;
          }
          if (tfd > 0) { h -= 2 + tfd * 1.6; al = 0.8; }                  // the fresh, pale thickness of the broken tile
        }
      } else {
        // 板瓦: concave tiles lapped like scales, each lower edge standing proud of the tile below
        const kt = d > 0 ? k : (k > 0 ? k - 1 : 0), lp = tlp[kt];
        const dn = (d < 0 ? -d : d) - hwk;
        let uu = dn / (d > 0 ? G.tgR[k] : G.tgL[k]); if (uu > 0.5) uu = 0.5;
        // each 板瓦 is a shallow dish: seen from up the slope its lower lip sags in the middle
        const wp = wq + tpo[kt] + 8 * nz.n2(s * 0.012 + kt * 7.7, wq * 0.004) - 15 * 4 * uu * (1 - uu);
        const jp = Math.floor(wp / lp), pv = wp - jp * lp;
        const q1 = hash2(kt * 13 + 1, jp * 7 + 2);
        h = HT * p + 4.2 * (pv / lp) + (q1 - 0.5) * 2.2;
        al = 0.48 + 0.2 * q1;
        footP = Math.exp(-dn / 18) + 0.25;
        if (dn < 18) {                                 // 夹垄灰 along the foot of the tube — or the dark gap where it has dropped out
          const fw = 11 + 6 * nz.n2(wq * 0.02 + k * 3.1, d > 0 ? 6.5 : 5.5);
          if (dn < fw) {
            const t = 1 - dn / fw;
            if (nz.n2(k * 9.1 + (d > 0 ? 4 : 0), wq * 0.011) > -0.3) { h += 3.6 * t; al += (0.93 - al) * sm(t * 2); } else { h -= 0.6 * t; al *= 1 - 0.2 * t; }
          }
        }
      }
      // weathering. The broad forms stay in h (they are softened below); everything granular goes into dt
      const ro = sm(0.5 + 1.6 * nR);                                      // where the surface has gone rough
      h += nA * 2.6;
      let dt = nB * (0.9 + 1.5 * ro) + nC * (0.22 + 0.32 * ro) + pitH[idx];
      al *= 0.95 + 0.12 * nA;
      const e1 = sm((nL - 0.2 + nB * 0.08) / 0.12);                       // pale crust of lichen / old limewash
      if (e1 > 0) { al += (0.95 - al) * 0.8 * e1; dt += e1 * (0.9 + nB * 1.1 + nC * 0.5); }
      const e2 = sm((nD - 0.38 + nB * 0.1) / 0.12);                       // dark lichen, soot
      if (e2 > 0) al *= 1 - 0.3 * e2;
      // moss: ragged cushions where water lingers — along the feet of the tubes, in the joints, on the bed of a broken tile
      const mo = sm((nM + 0.22 * nB + 0.06 * nC + 0.36 * (footP > 1 ? 1 : footP) + 0.3 * jointP - 0.6) / 0.07) * sm((wq - 30) / 50);
      if (mo > 0) {
        const mbp = nz.n2(X * 0.105 + 9, Y * 0.105 + 4);
        dt += mo * (3.4 + 1.7 * mbp + 1.1 * nC + 1.2 * nB);
        al *= 1 - mo * (0.66 + 0.1 * mbp);
      }
      if (w < W0) {                                                       // the ridge rolls over, away from us, into the full moon
        const t = 1 - wq / W0; h -= KR * t * t;
        al = (al + (0.86 - al) * 0.5 * t) * (1 + 0.5 * t * t);
      }
      Hm[idx] = h; Dt[idx] = dt; Al[idx] = al; Ao[idx] = 0.3 + 0.7 * L.clamp((p + PAN) / (1 + PAN));
    }
  }
  // a lens never draws a hairline: soften the built forms and the paint (σ ≈ 1.6 px), then lay the grain back on top
  {
    const tmpB = new Float32Array(NPX);
    const pass = (src, dst, rad, dxy, mask) => {
      const nj = dxy === 1 ? ch : cw, ni = dxy === 1 ? cw : ch;
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const o = dxy === 1 ? j * cw + i : i * cw + j;
        if (mask[o] < -100) { dst[o] = src[o]; continue; }
        let acc = 0, c = 0;
        for (let q = -rad; q <= rad; q++) {
          const ii = i + q; if (ii < 0 || ii >= ni) continue;
          const oo = dxy === 1 ? j * cw + ii : ii * cw + j;
          if (mask[oo] < -100) continue;
          acc += src[oo]; c++;
        }
        dst[o] = acc / c;
      }
    };
    const mask = Hm.slice();
    pass(Hm, tmpB, 2, 1, mask); pass(tmpB, Hm, 2, 0, mask); pass(Hm, tmpB, 1, 1, mask); pass(tmpB, Hm, 1, 0, mask);
    pass(Al, tmpB, 2, 1, mask); pass(tmpB, Al, 2, 0, mask); pass(Al, tmpB, 1, 1, mask); pass(tmpB, Al, 1, 0, mask);
    for (let o = 0; o < NPX; o++) { if (Hm[o] < -100) continue; Hm[o] += Dt[o]; }
  }
  // ── 瓦松 (Orostachys): a rosette of fleshy leaves under scaly, tapering spires — little pagodas rooted where the lime
  //    has held some soil. Each spire is a leaning cone of overlapping bracts added to the height field.
  {
    /** a tapered, scaly body from (bx,by) toward ang. len/wb in px; hTip = how far its tip stands off the roof; pitch = bract tier */
    const spire = (bx, by, ang, len, wb, hTip, pitch, curv, alb, ph) => {
      const ca = Math.cos(ang), sa = Math.sin(ang), m = wb * 1.5 + Math.abs(curv) * len + 4;
      const ex = bx + ca * len, ey = by + sa * len;
      const i0 = Math.max(1, Math.floor(Math.min(bx, ex) - m)), i1 = Math.min(cw - 2, Math.ceil(Math.max(bx, ex) + m));
      const j0 = Math.max(1, Math.floor(Math.min(by, ey) - m)), j1 = Math.min(ch - 2, Math.ceil(Math.max(by, ey) + m));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const idx = j * cw + i; if (Hm[idx] < -100) continue;
        const dx = i - bx, dy = j - by, al = dx * ca + dy * sa, t = al / len;
        if (t < -0.03 || t > 1) continue;
        const tt = t < 0 ? 0 : t;
        const lat = -dx * sa + dy * ca - curv * len * tt * tt;
        const tier = al / pitch + ph + 0.35 * Math.sin(lat * 0.5), f = tier - Math.floor(tier);
        let hw = wb * (1 - 0.84 * tt) * (tt < 0.1 ? 0.45 + 5.5 * tt : 1) * (pitch > 0 ? 0.8 + 0.34 * f : 1) + 0.6;
        if (t < 0) hw *= 1 + t / 0.03;
        const q = lat / hw; if (q <= -1 || q >= 1) continue;
        const e = Math.sqrt(1 - q * q), edge = sm((hw - Math.abs(lat)) / 1.7);
        Hm[idx] += hTip * Math.pow(tt, 0.85) * edge + 0.95 * hw * e + (pitch > 0 ? 2.4 * f * edge : 0);
        const tj = hash2(Math.floor(tier) * 7 + 3, (ph * 977) | 0);
        Al[idx] = Al[idx] + (alb * (0.8 + 0.5 * tj) - Al[idx]) * edge;
      }
    };
    for (const [rk, latF, w0, sc, seed] of WASONG) {
      const k = mid + rk, rw = L.rng('s28ws' + seed);
      const [bx, by] = toMap(k, latF * thw[k], w0);
      const up = -Math.PI / 2 + Math.atan2(bx + x0 - a.cx, a.cy - (by + y0));
      // the rosette: fat leaves splayed on the tile around the root
      for (let e = 0; e < 9; e++) {
        const la = up + L.lerp(-2.3, 2.3, e / 8) + rw.range(-0.15, 0.15);
        spire(bx + rw.range(-7, 7) * sc, by + rw.range(-3, 5) * sc, la, rw.range(17, 30) * sc, rw.range(5.5, 7.5) * sc, 5 * sc, 0, rw.range(-0.2, 0.2), 0.3, rw());
      }
      const cnt = 3, order = [0, 2, 1];
      for (const q of order) {
        const c = q - (cnt - 1) / 2, hero = q === 1;
        const ang = up + c * rw.range(0.2, 0.3) + rw.range(-0.06, 0.06);
        const len = rw.range(78, 102) * sc * (hero ? 1.55 : 1), wb = rw.range(10.5, 13) * sc * (hero ? 1.12 : 1);
        const ox = bx + Math.cos(up + Math.PI / 2) * c * 15 * sc, oy = by + Math.sin(up + Math.PI / 2) * c * 15 * sc + rw.range(-3, 4) * sc;
        spire(ox, oy, ang, len, wb, len * 0.3, rw.range(7.2, 8.6) * sc, rw.range(-0.09, 0.09), 0.34, rw());
      }
    }
    for (let o = 0; o < NPX; o++) { const h = Hm[o]; if (h > HMAX) HMAX = h; }
  }

  // ── the moon: elevation by distance down the slope ──
  const NV = 800, elS = new Float32Array(NV), elC = new Float32Array(NV), elT = new Float32Array(NV);
  for (let i = 0; i < NV; i++) {
    const t = L.clamp(i / 520), el = EL_TOP + (EL_LOW - EL_TOP) * (1 - (1 - t) * (1 - t));
    elS[i] = Math.sin(el); elC[i] = Math.cos(el); elT[i] = Math.tan(el);
  }
  const lx = Math.cos(PHI), ly = Math.sin(PHI);
  // ── cast shadows, marched at half resolution toward the moon; the penumbra widens with distance from the caster ──
  const cw2 = cw >> 1, ch2 = ch >> 1;
  const Hh = new Float32Array(cw2 * ch2), Sh = new Float32Array(cw2 * ch2);
  for (let j = 0; j < ch2; j++) for (let i = 0; i < cw2; i++) {
    const o = (j * 2) * cw + i * 2, h00 = Hm[o], h10 = Hm[o + 1], h01 = Hm[o + cw], h11 = Hm[o + cw + 1];
    Hh[j * cw2 + i] = (h00 < -100 || h10 < -100 || h01 < -100 || h11 < -100) ? BG : (h00 + h10 + h01 + h11) * 0.25;
  }
  for (let j = 0; j < ch2; j++) {
    const Y = y0 + j * 2 + 1, dy = a.cy - Y;
    for (let i = 0; i < cw2; i++) {
      const o = j * cw2 + i, h0 = Hh[o];
      if (h0 < -100) { Sh[o] = 1; continue; }
      const dx = x0 + i * 2 + 1 - a.cx;
      let vi = (R + TOP - Math.sqrt(dx * dx + dy * dy)) | 0; if (vi < 0) vi = 0; else if (vi >= NV) vi = NV - 1;
      const tE = elT[vi];
      let sh = 1;
      for (let t = 1; t < 170; t++) {
        const fx = i - lx * t, fy = j - ly * t;
        if (fx < 0 || fy < 0) break;
        const dist = 2 * t, ray = h0 + dist * tE;
        if (ray > HMAX) break;
        const c = ((ray - Hh[((fy + 0.5) | 0) * cw2 + ((fx + 0.5) | 0)]) / dist) * 6;
        if (c < sh) { sh = c; if (sh <= 0) { sh = 0; break; } }
      }
      Sh[o] = sh;
    }
  }

  // ── lighting + split-tone: cold where the moon falls, a little warm bounce where it does not ──
  const SUN = 1.9, FILL = 0.2;
  const Ux = 0.5, Uy = 0.42, Uz = 0.757;                         // dim warm fill from the lower right (what the courtyard gives back)
  const WR = 168, WG = 128, WB2 = 96;                            // its colour
  const ramp = L.makeRamp([[0, '#040506'], [0.15, '#0b0e12'], [0.34, '#333a43'], [0.56, '#7d838a'], [0.78, '#c6ccd3'], [0.92, '#e8ecf0'], [1, '#f7f9fb']]);
  const cool = new Float32Array(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = ramp(i / 1023); cool[i * 3] = c[0]; cool[i * 3 + 1] = c[1]; cool[i * 3 + 2] = c[2]; }
  const img = new ImageData(cw, ch); const dd = img.data;
  for (let j = 0; j < ch; j++) {
    const Y = y0 + j + 0.5, dy = a.cy - Y;
    const sj = Math.min(ch2 - 1.001, Math.max(0, (j - 0.5) * 0.5)), sj0 = sj | 0, sty = sj - sj0;
    const fy = L.lerp(1, 0.8, sm((Y - a.crestY - 170) / 560));       // it dims a little toward the eaves
    for (let i = 0; i < cw; i++) {
      const idx = j * cw + i, o = idx * 4;
      const h0 = Hm[idx];
      dd[o + 3] = 255;
      if (h0 < -100 || i < 1 || j < 1 || i >= cw - 1 || j >= ch - 1) { dd[o] = 4; dd[o + 1] = 5; dd[o + 2] = 6; continue; }
      let hl = Hm[idx - 1], hr = Hm[idx + 1], hu = Hm[idx - cw], hd = Hm[idx + cw];
      if (hl < -100) hl = h0; if (hr < -100) hr = h0; if (hu < -100) hu = h0 - 1; if (hd < -100) hd = h0;
      const hx = (hr - hl) * 0.5, hy = (hd - hu) * 0.5;
      const nl = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const X = x0 + i + 0.5, dx = X - a.cx;
      let vi = (R + TOP - Math.sqrt(dx * dx + dy * dy)) | 0; if (vi < 0) vi = 0; else if (vi >= NV) vi = NV - 1;
      const cE = elC[vi], sE = elS[vi];
      let dif = (hx * lx * cE + hy * ly * cE + sE) * nl; if (dif < 0) dif = 0;
      const si2 = Math.min(cw2 - 1.001, Math.max(0, (i - 0.5) * 0.5)), si0 = si2 | 0, stx = si2 - si0, so = sj0 * cw2 + si0;
      const sh = (Sh[so] * (1 - stx) + Sh[so + 1] * stx) * (1 - sty) + (Sh[so + cw2] * (1 - stx) + Sh[so + cw2 + 1] * stx) * sty;
      let fil = (-hx * Ux - hy * Uy + Uz) * nl; if (fil < 0) fil = 0;
      const al = Al[idx];
      const fx = L.lerp(1.1, 0.8, sm((X + 100) / (W + 200)));          // the moon is at the upper left: the far right sinks into the night
      // a glint where the tile faces half-way between the moon and the lens
      const Hx = -lx * cE, Hy = -ly * cE, Hz = sE + 1, hm = 1 / Math.sqrt(Hx * Hx + Hy * Hy + Hz * Hz);
      const ndh = (-hx * Hx - hy * Hy + Hz) * hm * nl;
      const spec = ndh > 0 ? Math.pow(ndh, 10) * 0.05 * sh : 0;       // fired clay and lime are chalk-dry: barely a sheen
      let c = al * SUN * dif * sh * fx * fy + spec;
      c = 1.04 * (1 - Math.exp(-1.6 * c)); if (c > 1) c = 1;          // soft shoulder: lit faces reach white without clipping flat
      c = c + (c * c * (3 - 2 * c) - c) * 0.6;                        // …then a print-like S-curve: crisp blacks, clean whites
      const li = ((c * 1023) | 0) * 3;
      const wf = (1 - c) * (1 - c) * FILL * al * Ao[idx] * (0.12 + 0.88 * fil * fil) * fy;   // the warm bounce only shows where the moon does not reach
      dd[o] = cool[li] + WR * wf; dd[o + 1] = cool[li + 1] + WG * wf; dd[o + 2] = cool[li + 2] + WB2 * wf;
    }
  }
  const small = L.makeCanvas(cw, ch);
  small.getContext('2d').putImageData(img, 0, 0);

  // ── the print (cropped to the roof) with its crisp waved silhouette ──
  const chC = ch + MT;
  const sharp = L.makeCanvas(cw, chC);
  {
    const g = sharp.getContext('2d');
    g.translate(-x0, -y0 + MT);
    g.save(); G.edgePath(g); g.clip();
    g.drawImage(small, x0, y0);
    g.restore();
  }

  // ── the lens: in focus at the crest, softer toward the sides and the eaves (weights sum to 1, added with 'lighter') ──
  const b1 = L.blurred(sharp, 2.6), b2 = L.blurred(sharp, 7.5);
  const fxp = a.cx - 40 - x0, fyp = a.crestY + 70 - y0 + MT, RX = 1180, RY = 560;
  const win = (c, r0, r1, mode) => {                      // multiply the canvas alpha by a soft elliptical window (or its inverse)
    const g = c.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = mode;
    g.translate(fxp, fyp); g.scale(1, RY / RX);
    g.fillStyle = L.radial(g, 0, 0, r0 * RX, r1 * RX, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(-5000, -5000, 10000, 10000);
    g.restore();
  };
  win(sharp, 0.4, 0.74, 'destination-in');
  win(b1, 0.74, 1.2, 'destination-in'); win(b1, 0.4, 0.74, 'destination-out');
  win(b2, 0.74, 1.2, 'destination-out');
  const roof = L.makeCanvas(cw, chC);
  const rg = roof.getContext('2d');
  rg.globalCompositeOperation = 'lighter';
  rg.drawImage(b2, 0, 0); rg.drawImage(b1, 0, 0); rg.drawImage(sharp, 0, 0);
  rg.globalCompositeOperation = 'source-over';
  // silver grain over everything, in and out of focus alike — it belongs to the film, not to the roof
  const grain = L.grainTex(cw, chC, { seed: 's28g', amount: 0.5 });
  const gg = grain.getContext('2d');
  gg.globalAlpha = 0.42; gg.drawImage(L.grainTex(cw, chC, { seed: 's28g2', amount: 0.6, size: 3 }), 0, 0); gg.globalAlpha = 1;
  L.overlayOn(roof, grain, { blend: 'overlay', alpha: 0.36 });
  // halation: the moonlit tile blooms a little into the dark around it
  rg.globalCompositeOperation = 'screen'; rg.globalAlpha = 0.11;
  rg.drawImage(L.blurred(roof, 7), 0, 0);
  rg.globalCompositeOperation = 'source-over'; rg.globalAlpha = 1;
  return { roof, x: x0, y: y0 - MT };
}

export default {
  name: '月下瓦垄',
  tone: 'light',
  init(env) {
    S = buildRoof(env);
  },
  draw(ctx, env, p) {
    ctx.fillStyle = '#040506'; ctx.fillRect(0, 0, W, H);
    const a = env.arc;
    const rot = L.lerp(-0.007, 0.007, p), zoom = L.lerp(1.0, 1.01, p);
    L.cam(ctx, env, { rot, zoom }, () => ctx.drawImage(S.roof, S.x, S.y));
    // a breath of brighter moonlight drifting along the ridge: colour-dodge lifts the lit tile and leaves the blacks black
    const q = a.pt(L.lerp(-0.2, -0.06, p), -40);
    ctx.save(); a.clipBelow(ctx, TOP + 2); ctx.globalCompositeOperation = 'color-dodge';
    ctx.fillStyle = L.radial(ctx, q.x, q.y, 0, 640, [[0, '#3c4047'], [0.45, '#17191c'], [1, '#000000']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};
