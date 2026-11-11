// s05 — 珊瑚红撞松石绿. Six frames, two colours: a macro of the gilt lip of a coral-red (珊瑚红) vessel in front of a
// flat, out-of-focus turquoise (松石绿) ground. The arc is the lip.
//
// Everything below the arc is shaded per pixel once in init(), the way a lens would see a real glaze:
//   · the glaze is glass. Its relief — a slow swell, orange peel, shallow dimples, a scatter of pinholes (棕眼) —
//     barely shades the colour underneath; it shows in what the surface mirrors;
//   · glaze thickness drives the colour: thin and orange where it breaks over the lip (there the blown-on mist of
//     pigment stands apart as single red points), deeper and redder where it pooled, darkest in the dimples;
//   · a window lies slantwise across the glaze — a pane in perspective, split by one glazing bar — looked up through
//     the relief, so its edges crumble into the orange peel, sparks of it scatter round it and every pinhole inside
//     it stays dark; the wall round the window leaves a faint warm veil that the orange peel dapples;
//   · the lip: gilding (描金) burnished along the rim, worn in streaks and in whole stretches, rubbed through to a
//     thread of white porcelain on the crown, and a hairline of deep green where the lip turns away from us;
//   · depth of field: sharp under the crest, going soft toward the sides and the bottom; highlights bloom a little.
// draw() only slides that layer a few pixels round the circle while points of light on the gilding flare and fade
// (sharp sparks in the plane of focus, a soft glow out of it).
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 56;          // the slide is ±11 px along the arc; the rest of the margin keeps the blur clean at the borders
let S = null;

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── allocation-free worley noise: squared distance to the nearest point in cD1, the offset to it in (cDx, cDy), two ids ──
let cD1 = 0, cDx = 0, cDy = 0, cId = 0, cId2 = 0;
function cell(x, y, salt) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, id = 0, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263) + salt) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d1 = d; id = h; bx = dx; by = dy; }
  }
  cD1 = d1; cDx = bx; cDy = by;
  cId = ((id >>> 20) & 255) / 255;
  cId2 = ((Math.imul(id ^ 0x5bd1e995, 0x27d4eb2f) >>> 9) & 4095) / 4095;
}

function lut(stops, n = 512) {
  const f = L.makeRamp(stops), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
const rgb = (c) => L.parseColor(c);

// where the key light finds the rim (theta from the crest): strongest left of centre, a second catch on the right
const gauss = (v) => Math.exp(-v * v);
const rimKey = (th) => Math.min(1, 0.3 + 0.7 * gauss((th + 0.11) / 0.17) + 0.42 * gauss((th - 0.26) / 0.07));

/** how the gilding has worn: `wear` along the rim (0 fresh … 1 rubbed), and what share of the gold is left at (U, d) */
const makeGild = (nA, nB) => ({
  wear: (U) => c01(0.5 + 0.46 * nA.n2(U / 430 + 2.2, 9.1) + 0.3 * nB.n2(U / 97 - 7.1, 3.3) + 0.1 * nA.n2(U / 24 + 4.4, 6.6)),
  left(U, d, wear) {
    // rubbed thin in streaks that follow the rim …
    const fn = 0.6 * nA.n2(U / 58 + 3, d / 3.3 + 11) + 0.4 * nB.n2(U / 19, d / 4.2 - 5);
    // … and, here and there, a stretch where it is all but gone: a few of them, of unequal length, none at the crest
    const gone = sstep(0.4, 0.62, nA.n2(U / 210 + 88.8, 2.9) * (0.75 + 0.35 * nB.n2(U / 520 + 32.9, 6.1)) + 0.2 * nB.n2(U / 23, d / 5 + 1.1));
    return (1 - 0.8 * sstep(0.56 - 0.3 * wear, 0.84 - 0.3 * wear, fn)) * (1 - 0.86 * gone);
  },
});

/** defocus (px of blur) at a point of the frame: the plane of focus runs along the lip under the crest */
function defocus(a, x, y) {
  const d = Math.max(0, a.R - Math.hypot(x - a.cx, a.cy - y));
  const ex = (x - a.cx + 30) / 1040, ey = Math.max(0, d - 120) / 420;
  return 9.5 * sstep(0.3, 1.15, Math.sqrt(0.55 * ex * ex + ey * ey));
}

/** the vessel: lip, gilding and coral-red glaze, everything under the arc. Returns { cnv, x0, y0 } in frame coordinates. */
function buildDish(env, nA, nB, rimDash, gild) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const TOP = 30;                                   // rows kept above the crest: bloom and defocus spill over the edge
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - TOP;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const NL = 512;

  // ── pass 1: polar coordinates and the relief of the glaze skin ──
  const dd = new Float32Array(N), uu = new Float32Array(N), hgt = new Float32Array(N), pit = new Float32Array(N), dim = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i - cx, o = j * RW + i;
      const d = R - Math.sqrt(ddx * ddx + ddy * ddy);      // px below the arc
      dd[o] = d;
      if (d < -2.5) continue;
      const U = Math.atan2(ddx, ddy) * R;                  // px along the arc
      uu[o] = U;
      const dc = d < 0 ? 0 : d;
      const V = dc + 46 * (1 - Math.exp(-dc / 38));        // the wall turns over at the lip: relief is foreshortened there
      // a slow swell (thrown by hand, never a true surface), orange peel, its finer ripple
      let h = 0.26 * nA.n2(U / 230 + 1.1, V / 190 + 5.5) + 0.12 * nA.n2(U / 52 + 7.3, V / 47 - 2.1) + 0.13 * nB.n2(U / 23 - 3.7, V / 21 + 9.4) + 0.045 * nA.n2(U / 11 + 4.9, V / 10 - 6.3);
      // shallow dimples where bubbles healed over: small, rounded, never two alike
      cell(U / 26 + 3.1, V / 26 + 8.7, 517);
      if (cId > 0.5) {
        const k = (cId - 0.5) * 2, rad = 0.13 + 0.15 * cId2, m = 1 - sstep(0, rad * rad, cD1), dp = (0.05 + 0.34 * k * k) * m * m;
        h -= dp; dim[o] = dp;
      }
      // pinholes (棕眼): sparse, in loose clusters
      cell(U / 78 + 13.1, V / 78 - 8.2, 733);
      if (cId > 0.36) {
        const clus = nB.n2(U / 340 - 9.2, V / 300 + 4.4);
        if (cId > 0.64 - 0.24 * clus) {
          const rpx = 1.5 + 2.6 * cId2 * cId2, q = cD1 / ((rpx / 78) * (rpx / 78));
          if (q < 1) { const m = 1 - sstep(0.06, 1, q); pit[o] = m; h -= (1.1 + 0.3 * rpx) * m; }
        }
      }
      hgt[o] = h;
    }
  }

  // glaze by thickness: a thin wash over the white body → orange → the body colour → deep iron red where it pooled
  const GLAZE = lut([[0, '#ffd9b4'], [0.1, '#fdb07a'], [0.24, '#f98a55'], [0.4, '#f26b43'], [0.58, '#e8543a'], [0.76, '#db4530'], [0.9, '#c93a26'], [1, '#b8341f']], NL);
  // gilding from its shaded, worn tone to the burnished crown
  const GOLD = lut([[0, '#7a3f0a'], [0.18, '#a8620f'], [0.38, '#d18f1c'], [0.56, '#eab23a'], [0.72, '#f8cf62'], [0.87, '#fde79c'], [1, '#fffbe6']], NL);
  const PITC = rgb('#7d1e0f'), HL = rgb('#fff1e4'), VEIL = rgb('#ffd2aa');

  const LX = -0.57, LY = -0.82;                    // toward the key light (upper left), on screen
  const KD = 0.9;                                  // how much the relief shades the colour under the glass: very little
  const KG = 9, SHEEN = 0.19;                      // the bright wall round the window: a veil, stronger on slopes that lean to it
  const KG2 = 22, DAPPLE = 0.16;                   // … and, further out, only the orange peel's lit flanks catch it
  const KS = 900;                                  // lever of the reflection through the relief
  const PHI = L.deg(13), CA = Math.cos(PHI), SA = Math.sin(PHI);
  // the window: centre, half-length, half-width, corner radius, slant of its ends, softness of its upper / lower edge,
  // where the glazing bar crosses it, and how much the wall bows it
  const HX = cx - 128, HY = a.crestY + 205, LH = 322, WH = 33, RC = 12, SK = 0.5, SVA = 6, SVB = 10, MU = 100, BEND = 0.00022;
  const LIP = 46;

  // ── pass 2: shade ──
  const img = new ImageData(RW, RH), px = img.data;
  const spI = new ImageData(RW, RH), sp = spI.data;      // what the glass mirrors: laid over the colour a hair soft, as a lens draws it
  const hlI = new ImageData(RW, RH), hp = hlI.data;      // the highlights alone, for the bloom
  for (let j = 1; j < RH - 1; j++) {
    const y = Y0 + j;
    for (let i = 1; i < RW - 1; i++) {
      const o = j * RW + i, d = dd[o];
      if (d < -0.5) continue;
      const x = X0 + i, U = uu[o];
      const dc = d < 0 ? 0 : d;
      const V = dc + 46 * (1 - Math.exp(-dc / 38));
      const h = hgt[o], pt = pit[o];
      const gx = (hgt[o + 1] - hgt[o - 1]) * 0.5, gy = (hgt[o + RW] - hgt[o - RW]) * 0.5;

      // ── glaze: thickness → colour ──
      const cloud = 0.26 * nB.n2(U / 310 + 3.3, V / 200 - 7.7) + 0.4 * nA.n2(U / 112 - 11, V / 80 + 2) + 0.34 * nB.n2(U / 44 + 8.8, V / 37 - 4.1);
      let t = 0.6 + 0.13 * (dc / 520) + 0.15 * cloud - 0.075 * (h < -1.6 ? -1.6 : h > 1.4 ? 1.4 : h) + 0.42 * dim[o];
      let thin = 0;
      if (dc < 400) {                                      // it breaks thin over the lip, to an uneven depth
        const ln = 54 * (1 + 0.42 * nA.n2(U / 150 + 5, 1.2) + 0.2 * nB.n2(U / 41 - 3, 7.7));
        thin = Math.exp(-Math.max(0, dc - 12) / ln);
        t -= 0.5 * thin;
      }
      // the blown-on mist: droplets of pigment a couple of px across over a softer speckle where they merged;
      // where the coat is thin they stand apart, each its own red point on the paler ground
      let f = 1;
      const ma = 1 + 1.3 * thin;
      cell(U / 4.6, V / 4.6, 11);
      { const rad = 0.2 + 0.22 * cId2, m = (1 - sstep(rad * 0.3, rad, Math.sqrt(cD1))) * (cId * 2 - 1); t += 0.135 * ma * m; f -= 0.052 * m; }
      cell(U / 10.5 + 31, V / 10.5 - 17, 97);
      { const m = (1 - sstep(0.02, 0.25, cD1)) * (cId - 0.5); t += 0.145 * ma * m; f -= 0.058 * m; }
      t = t < 0.1 ? 0.1 : t > 1 ? 1 : t;
      const li = ((t * (NL - 1)) | 0) * 3;
      let r = GLAZE[li], g = GLAZE[li + 1], b = GLAZE[li + 2];
      // light: a whisper of the relief, then the broad fall-off from the upper left into the depth of the wall
      const lam = -(gx * LX + gy * LY);                    // > 0 on slopes that face the light
      let sh = lam * KD; sh = sh < -0.14 ? -0.14 : sh > 0.1 ? 0.1 : sh;
      f *= (1 + sh) * (1.04 - 0.05 * ((x - 960) / 960) - 0.11 * (dc / 520) + 0.06 * Math.exp(-dc / 30));
      r *= f; g *= f; b *= f;
      if (pt > 0) {
        const k = 0.6 * pt * c01(0.75 - lam * 2.2); r += (PITC[0] - r) * k; g += (PITC[1] - g) * k; b += (PITC[2] - b) * k;
        const lit = 0.5 * pt * c01(lam * 1.8 - 0.1); r += (255 - r) * lit; g += (214 - g) * lit; b += (180 - b) * lit;
      }

      // ── what the glass mirrors ──
      const bx = x - HX, by = y - HY, ax = bx * CA + by * SA, ay = by * CA - bx * SA;   // along / across the window
      const near = Math.exp(-((ax / 400) ** 2 + (ay / 130) ** 2)), wide = Math.exp(-((ax / 760) ** 2 + (ay / 270) ** 2));
      // the bright wall around the window: a warm veil, a little stronger on slopes that lean toward it
      let gl = 0.5 + lam * KG; gl = gl < 0 ? 0 : gl > 1 ? 1 : gl;
      let gd = lam * KG2; gd = gd < 0 ? 0 : gd > 1 ? 1 : gd;
      const veil = SHEEN * near * gl + DAPPLE * wide * gd * gd;
      r += (VEIL[0] - r) * veil; g += (VEIL[1] - g) * veil; b += (VEIL[2] - b) * veil;
      // pin-pricks: tiny burst bubbles, each a dark nick with a point of light on its far wall
      let glint = 0;
      cell(U / 34 - 5.5, V / 34 + 1.9, 911);
      if (cId > 0.5) {
        const rpx = 0.9 + 1.1 * cId2 * cId2, sx = -cDx * 34, sy = -cDy * 34;      // px from the nick's centre
        const dk = Math.exp(-((sx + 0.35 * rpx) ** 2 + (sy + 0.5 * rpx) ** 2) / (rpx * rpx));
        const br = Math.exp(-((sx - 0.4 * rpx) ** 2 + (sy - 0.55 * rpx) ** 2) / (0.5 * rpx * rpx));
        const amp = ((cId - 0.5) * 2) ** 2 * (0.12 + 0.2 * wide + 0.68 * near);
        const kd = 0.34 * dk * (1 - br); r -= r * kd * 0.8; g -= g * kd; b -= b * kd;
        glint = 0.95 * br * amp;
      }
      // the window itself, seen through the relief
      let win = 0;
      {
        const reach = KS * (Math.abs(gx) + Math.abs(gy));
        if (ax > -LH - 40 - reach && ax < LH + 40 + reach && ay > -WH - 45 - reach && ay < WH + 50 + reach) {
          const qx = bx - KS * gx, qy = by - KS * gy;
          const du0 = qx * CA + qy * SA, dv = qy * CA - qx * SA - BEND * du0 * du0, du = du0 + SK * dv;
          const wh = WH * (1 - 0.2 * du / LH);                             // the far end of the window is narrower
          const ex = Math.abs(du) - (LH - RC), ey = Math.abs(dv) - (wh - RC);
          const sd = Math.min(Math.max(ex, ey), 0) + Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) - RC;
          let w = 1 - sstep(-SVA, dv > 0 ? SVB : SVA, sd);
          if (w > 0) {
            w *= 0.06 + 0.94 * sstep(7, 15, Math.abs(du - MU));           // the glazing bar
            // the pane is sky: brightest at the end nearer the light and along its upper edge
            w *= (1 - 0.42 * c01((du + LH) / (2 * LH))) * (1 - 0.2 * c01((dv + wh) / (2 * wh)));
            win = 0.97 * w;
          }
        }
      }
      const spec = glint > win ? glint : win;
      let bloom = spec * 0.7;

      // ── the lip: white porcelain, the red feathering out on it, worn gilding over both ──
      if (d < LIP) {
        const th = U / R;
        const wear = gild.wear(U);
        const gw = 23 + 2.6 * nB.n2(U / 260, 1.7) + 1.1 * nB.n2(U / 70, 5.1) + 0.4 * nB.n2(U / 17, 8.3);   // inner edge of the gilding
        const dRed = 12.5 + 2.2 * nA.n2(U / 77, 3.9) + 1.2 * nB.n2(U / 19, 8.2);            // where the red stops short of the crown
        const wEdge = 3.4 + 7.6 * sstep(0.3, 0.92, wear) + 1.1 * nA.n2(U / 9, 1.3 + d / 4); // how far the gold has rubbed back
        // white porcelain: clean where it faces us; where the lip turns away it mirrors the ground — a hairline of deep green
        const eq = dc / (1.9 + 0.5 * nA.n2(U / 61 + 4.1, 7.7)), edge = Math.exp(-eq * eq) * (0.8 + 0.2 * nB.n2(U / 37 + 1.9, 2.2)), cool = Math.exp(-dc / 4.2);
        const wv = 0.97 + 0.03 * nB.n2(U / 30, d / 6);
        const wr = (251 - 30 * cool - 191 * edge) * wv, wg = (248 - 11 * cool - 119 * edge) * wv, wb = (240 - 8 * cool - 122 * edge) * wv;
        const kred = sstep(dRed - 2.6, dRed + 2.6, d + 1.4 * nA.n2(U / 5.1, d / 5.1));
        r = wr + (r - wr) * kred; g = wg + (g - wg) * kred; b = wb + (b - wb) * kred;
        // gold: a band from the rubbed crown to its wavering inner edge, worn as makeGild says
        let cov = sstep(wEdge - 1.3, wEdge + 1.3, d) * (1 - sstep(gw - 1.1, gw + 1.1, d));
        if (cov > 0) cov *= gild.left(U, d, wear);
        if (d > 1.6 && d < wEdge + 1.5) {                  // what is left of it on the crown
          const rem = 0.6 * sstep(0.22, 0.55, nB.n2(U / 21 - 2, d / 1.9 + 4)) * sstep(1.6, 3, d);
          if (rem > cov) cov = rem;
        }
        if (cov > 0.003) {
          // burnished along the rim: long streaks, a bright run high on the band, amber where it meets the red
          const q = (d - 8.2 - 1.3 * nA.n2(U / 88 + 9.9, 3.1)) / 3.3;
          let lg = 0.37 + 0.31 * Math.exp(-q * q) + 0.11 * nA.n2(U / 120 - 4, d / 2.7 + 6.6) + 0.05 * nB.n2(U / 26, d / 1.9 + 3)
            + 0.14 * rimKey(th) - 0.16 * sstep(gw - 5, gw, d);
          // sparks where a burnished grain faces the lamp
          cell(U / 11 + 2.2, d / 3.4 + 7.7, 389);
          if (cId > 0.8) lg += 0.55 * (cId - 0.8) * 5 * (1 - sstep(0, 0.07 + 0.08 * cId2, cD1)) * (0.35 + 0.65 * rimKey(th));
          lg = c01(lg);
          const gi = ((lg * (NL - 1)) | 0) * 3, k = 0.97 * cov;
          r += (GOLD[gi] - r) * k; g += (GOLD[gi + 1] - g) * k; b += (GOLD[gi + 2] - b) * k;
          if (lg > 0.9 && (lg - 0.9) * 5 * cov > bloom) bloom = (lg - 0.9) * 5 * cov;
        }
        // the crown of the lip turns through the light: one thin, broken line of it
        const q = (d - 4.9 - 0.8 * nB.n2(U / 33, 4.4)) / 1.35;
        const sl = Math.exp(-q * q) * (0.22 + 0.78 * rimKey(th)) * (0.2 + 0.8 * rimDash(U));
        r += (255 - r) * sl; g += (255 - 9 * cov - g) * sl; b += (250 - 52 * cov - b) * sl;
        if (sl * 0.8 > bloom) bloom = sl * 0.8;
      }

      const o4 = o * 4, al = d >= 0.5 ? 255 : (d + 0.5) * 255;
      px[o4] = r; px[o4 + 1] = g; px[o4 + 2] = b; px[o4 + 3] = al;
      if (spec > 0.004) { sp[o4] = HL[0]; sp[o4 + 1] = HL[1]; sp[o4 + 2] = HL[2]; sp[o4 + 3] = spec * al; }
      if (bloom > 0.02) { hp[o4] = 255; hp[o4 + 1] = 240; hp[o4 + 2] = 224; hp[o4 + 3] = bloom * al; }
    }
  }
  const sharp = L.makeCanvas(RW, RH), sg = sharp.getContext('2d');
  sg.putImageData(img, 0, 0);
  const sc = L.makeCanvas(RW, RH);
  sc.getContext('2d').putImageData(spI, 0, 0);
  sg.drawImage(L.blurred(sc, 1.1), 0, 0);

  // ── depth of field: the plane of focus runs along the lip under the crest; blur grows to the sides and into the depth ──
  const out = L.makeCanvas(RW, RH), og = out.getContext('2d');
  og.drawImage(sharp, 0, 0);
  const LEV = [1.5, 4, 9.5], MS = 8, mw = Math.ceil(RW / MS), mh = Math.ceil(RH / MS);
  const masks = LEV.map(() => new ImageData(mw, mh));
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const beta = defocus(a, X0 + (i + 0.5) * MS, Y0 + (j + 0.5) * MS);
    for (let k = 0; k < 3; k++) {
      const lo = k ? LEV[k - 1] : 0;
      masks[k].data[(j * mw + i) * 4 + 3] = 255 * c01((beta - lo) / (LEV[k] - lo));
    }
  }
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  LEV.forEach((bpx, k) => {
    const mc = L.makeCanvas(mw, mh); mc.getContext('2d').putImageData(masks[k], 0, 0);
    const bl = L.blurred(sharp, bpx), bg = bl.getContext('2d');
    bg.globalCompositeOperation = 'destination-in'; bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    bg.drawImage(mc, 0, 0, mw * MS, mh * MS);
    // a true cross-fade (what is there gives way by the same share), so no sharp ghost of the lip survives under the blur
    og.globalCompositeOperation = 'destination-out'; og.drawImage(mc, 0, 0, mw * MS, mh * MS);
    og.globalCompositeOperation = 'lighter'; og.drawImage(bl, 0, 0);
  });
  // ── halation: only the highlights bloom ──
  const hc = L.makeCanvas(RW, RH);
  hc.getContext('2d').putImageData(hlI, 0, 0);
  og.globalCompositeOperation = 'screen';
  og.globalAlpha = 0.5; og.drawImage(L.blurred(hc, 6), 0, 0);
  og.globalAlpha = 0.3; og.drawImage(L.blurred(hc, 20), 0, 0);
  og.globalAlpha = 1; og.globalCompositeOperation = 'source-over';
  return { cnv: out, x0: X0, y0: Y0 };
}

/** the ground: flat turquoise, far out of focus — one slow gradient from the light and a little tooth, nothing else */
function buildBack(env) {
  const a = env.arc;
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  const TH = Math.ceil(a.yAt(0)) + 40;                    // nothing of the ground shows below this
  g.fillStyle = '#2fb5a8'; g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, 430, -120, 160, 2150, [[0, 'rgba(116,234,218,0.085)'], [0.5, 'rgba(60,196,182,0.01)'], [1, 'rgba(6,112,104,0.11)']]);
  g.fillRect(0, 0, W, TH);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.25;
  g.drawImage(L.grainTex(W, TH, { seed: 's05g', amount: 0.1 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

export default {
  name: '珊瑚红撞松石绿',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const nA = L.makeNoise('s05a'), nB = L.makeNoise('s05b');
    const gild = makeGild(nA, nB);
    // how readily each stretch of the rim throws the light back (shared by the baked rim line and the live glints)
    const rimDash = (U) => sstep(-0.05, 0.5, 0.6 * nA.n2(U / 44 + 8.3, 0.5) + 0.4 * nB.n2(U / 15, 2.1));
    // points of light on the gilding: they stay where the lamp puts them while the rim slides underneath
    const rg = L.rng('s05glint'), glints = [];
    const N = 11;
    for (let i = 0; i < N; i++) {
      const th = -0.4 + 0.8 * (i + rg.range(0.15, 0.85)) / N, pt = a.pt(th, -8.5);
      glints.push({ th, k: rg.range(0.5, 1) * rimKey(th), ph: rg(), len: rg.range(1.6, 2.6), blur: defocus(a, pt.x, pt.y) });
    }
    S = { back: buildBack(env), dish: buildDish(env, nA, nB, rimDash, gild), glints, rimDash, gild };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0046, 0.0046, p);
    ctx.drawImage(S.back, 0, 0);
    // the vessel turns a hair under the lens
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';      // the slide resamples the layer: keep its finest grain
    L.cam(ctx, env, { rot }, () => ctx.drawImage(S.dish.cnv, S.dish.x0, S.dish.y0));
    // each point flares as a burnished, still-gilded stretch slides under it; out of the plane of focus it spreads into a soft glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const q of S.glints) {
      const U = (q.th - rot) * a.R;
      const tw = Math.min(1, 3 * q.k * S.gild.left(U, 8.5, S.gild.wear(U)) * (0.2 + 0.8 * S.rimDash(U)) * (0.6 + 0.4 * Math.cos((p * 0.8 + q.ph) * L.TAU)));
      if (tw < 0.04) continue;
      a.at(ctx, q.th, -8.5, () => {
        if (q.blur < 1.2) {
          // in focus: a hot core drawn out along the rim, in a small warm bloom
          ctx.scale(q.len, 1);
          ctx.fillStyle = L.radial(ctx, 0, 0, 0, 9, [[0, `rgba(255,252,236,${Math.min(1, 1.25 * tw)})`], [0.2, `rgba(255,240,190,${0.8 * tw})`], [0.5, `rgba(255,214,130,${0.22 * tw})`], [1, 'rgba(255,200,110,0)']]);
          ctx.fillRect(-9, -9, 18, 18);
        } else {
          // out of focus: the same light spread into a soft warm glow, wider and fainter the further from the plane
          const rr = 7 + 2.6 * q.blur, al = Math.min(0.5, 1.5 * tw / (1 + 0.22 * q.blur));
          ctx.fillStyle = L.radial(ctx, 0, 0, 0, rr, [[0, `rgba(255,240,186,${al})`], [0.3, `rgba(255,232,168,${0.62 * al})`], [0.62, `rgba(255,226,156,${0.2 * al})`], [1, 'rgba(255,220,150,0)']]);
          ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
        }
      });
    }
    ctx.restore();
  },
};
