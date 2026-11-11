// s17 — 矿物药色谱. Mineral drugs ground to powder and spread edge to edge, shot from straight above.
// Above the arc: cinnabar (朱砂, vermilion) and realgar (雄黄, orange-yellow) dragged into diagonal smears by a palette knife,
// with slivers of indigo (青黛) between them and a spatter of realgar dots. Below the arc: a levelled bed of malachite
// green (石绿) flecked with yellow-green. The arc is the crumbly edge where the green bed lies over the smears.
//
// Everything is shaded per pixel in init(): each powder keeps its OWN hue (grains are dithered against each other,
// never alpha-blended into mud), a height field (smear thickness, knife striations, grain clumps) is lit from the upper left.
// The words sit over a deliberately quiet reach of deep cinnabar right above the crest.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 96;                       // the move is only ~1° about the circle centre (≈ 25 px at the frame corners) plus a few px of jitter
const LW = W + PAD * 2, LH = H + PAD * 2;
const PHI = L.deg(-36);               // direction of the knife smears on screen (rising to the right)
const CU = Math.cos(PHI), SU = Math.sin(PHI);
let S = null;

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

// ── cheap deterministic lattice noise (much faster than simplex for the per-pixel passes) ──
function hi(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const h01 = (x, y) => hi(x, y) / 4294967296;
/** value noise, 0..1 */
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hi(xi, yi), b = hi(xi + 1, yi), c = hi(xi, yi + 1), d = hi(xi + 1, yi + 1);
  return ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) / 4294967296;
}
function lut(stops) {
  const f = L.makeRamp(stops), o = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) { const c = f(i / 255); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}

// each powder's own colour, dark grain → bright grain
const CINN_DEEP = [[0, '#6a0c0a'], [0.3, '#96130e'], [0.55, '#b61c14'], [0.8, '#cf261b'], [1, '#e83a24']];   // packed cinnabar ground
const CINN = [[0, '#9a140e'], [0.3, '#c8221a'], [0.55, '#de2c1f'], [0.8, '#f1432a'], [1, '#ff6a45']];        // fresh cinnabar smear
const REALGAR = [[0, '#b9520a'], [0.3, '#e07d10'], [0.55, '#f29a1c'], [0.8, '#ffb62e'], [1, '#ffd55a']];
const INDIGO = [[0, '#0b1740'], [0.3, '#172c74'], [0.55, '#1f3a8a'], [0.8, '#2d50b4'], [1, '#4d74dc']];
const MALA = [[0, '#0a6a56'], [0.28, '#129a7c'], [0.5, '#1fae8c'], [0.72, '#33c9a1'], [0.9, '#60e0bc'], [1, '#9af2d6']];
const YG = [[0, '#93b624'], [0.5, '#c8d83a'], [1, '#eef27a']];

/** slow fields on a coarse grid, sampled bilinearly by the per-pixel passes */
function buildFields(env) {
  const a = env.arc;
  const CS = 4, cw = Math.ceil(LW / CS) + 2, ch = Math.ceil(LH / CS) + 2, n = cw * ch;
  const nA = L.makeNoise('s17a'), nB = L.makeNoise('s17b');
  const warp = new Float32Array(n), blot = new Float32Array(n), mask = new Float32Array(n), cloud = new Float32Array(n), clus = new Float32Array(n), drift = new Float32Array(n);
  const zx = a.cx, zy = a.crestY - 135;      // centre of the text-safe box (660 × 250)
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = i * CS - PAD, y = j * CS - PAD, k = j * cw + i;
    const u = x * CU + y * SU, v = -x * SU + y * CU;
    warp[k] = nA.fbm(u / 640, v / 250, 3);                 // the smears are not ruler-straight
    blot[k] = nA.fbm(x / 360 + 9, y / 360 - 4, 3);         // slow tonal blotches
    cloud[k] = nB.fbm(x / 340 + 50, y / 340 + 20, 4);      // soft light/deep drifts in the green bed
    clus[k] = nB.fbm(x / 95 - 20, y / 95 + 70, 3);         // where the yellow-green flecks gather
    drift[k] = nA.fbm(x / 230 + 61, y / 230 - 37, 3);      // … in broad drifts
    // calm mask: 1 over the text box, falling to 0 some 60–90 px outside it (ragged)
    const dist = Math.hypot(Math.max(Math.abs(x - zx) - 330, 0), Math.max(Math.abs(y - zy) - 125, 0));
    mask[k] = 1 - sstep(30, 88, dist + 22 * nB.fbm(x / 130, y / 130, 2));
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };
  return { warp, blot, mask, cloud, clus, drift, bil };
}

/** the smears, as lookup tables across the stripe direction: a wide tone-on-tone cinnabar ground + narrower strokes laid over it */
const V0 = -320, V1 = 2440, VN = V1 - V0;
function buildBands() {
  const r = L.rng('s17bands');
  const tIdx = new Int16Array(VN), uIdx = new Int16Array(VN);
  const tMat = [], tTone = [], tSeed = [], tLen = [], tThr = [], tMA = [], tMB = [], uTone = [];
  // top strokes. mat: 0 = none (ground shows), 1 = fresh cinnabar, 2 = realgar, 3 = indigo
  const NEXT = {
    O: [['I', 0.42], ['_', 0.33], ['C', 0.25]],
    o: [['_', 0.5], ['I', 0.2], ['C', 0.3]],
    C: [['I', 0.3], ['O', 0.4], ['_', 0.3]],
    I: [['O', 0.5], ['C', 0.25], ['o', 0.25]],
    _: [['O', 0.48], ['o', 0.18], ['C', 0.14], ['I', 0.2]],
  };
  let v = 0, prev = '_';
  while (v < VN) {
    let q = r(), kind = '_';
    for (const [k, pr] of NEXT[prev]) { if (q < pr) { kind = k; break; } q -= pr; }
    let w, mat, tone, thr;
    if (kind === 'O') { w = r.range(48, 120); mat = 2; tone = r.range(0.5, 0.64); thr = r.range(0.14, 0.28); }
    else if (kind === 'o') { w = r.range(10, 22); mat = 2; tone = r.range(0.58, 0.74); thr = r.range(0.24, 0.38); }
    else if (kind === 'C') { w = r.range(26, 66); mat = 1; tone = r.range(0.56, 0.72); thr = r.range(0.2, 0.34); }
    else if (kind === 'I') { w = r.range(10, 30); mat = 3; tone = r.range(0.48, 0.7); thr = r.range(0.18, 0.32); }
    else { w = r.range(26, 90); mat = 0; tone = 0; thr = 0; }
    const id = tMat.length;
    tMat.push(mat); tTone.push(tone); tSeed.push(r.range(0, 90)); tLen.push(r.range(360, 820)); tThr.push(thr);
    tMA.push(r.range(24, 190) + (r.chance(0.25) ? 110 : 0)); tMB.push(r.range(24, 190) + (r.chance(0.25) ? 110 : 0));   // how far short of the calm box this stroke stops / restarts
    for (let k = Math.floor(v); k < Math.min(VN, Math.floor(v + w)); k++) tIdx[k] = id;
    v += w; prev = kind;
  }
  // the ground: broad bands of packed cinnabar, a few close tones
  v = 0; let k2 = 0;
  const tones = [0.5, 0.64, 0.44, 0.58, 0.68, 0.42, 0.56];
  while (v < VN) {
    const w = r.range(105, 190), id = uTone.length;
    uTone.push(tones[k2++ % tones.length] + r.range(-0.03, 0.03));
    for (let k = Math.floor(v); k < Math.min(VN, Math.floor(v + w)); k++) uIdx[k] = id;
    v += w;
  }
  return { tIdx, uIdx, tMat: Int8Array.from(tMat), tTone: Float32Array.from(tTone), tSeed: Float32Array.from(tSeed), tLen: Float32Array.from(tLen), tThr: Float32Array.from(tThr), tMA: Float32Array.from(tMA), tMB: Float32Array.from(tMB), uTone: Float32Array.from(uTone) };
}

/**
 * relief lighting from the upper left, applied in place to every opaque pixel.
 * Ht (optional) = thickness of whatever lies on top: a pixel whose upper-left neighbour is thicker sits in its cast shadow.
 */
function shade(d, Hh, K, lift, Ht) {
  const SO = 4 + 4 * LW;
  for (let j = 4; j < LH - 1; j++) for (let i = 4; i < LW - 1; i++) {
    const k = j * LW + i, o = k * 4;
    if (d[o + 3] < 255) continue;
    let rel = (Hh[k + 1] - Hh[k - 1] + Hh[k + LW] - Hh[k - LW]) * K;
    rel = rel < -0.34 ? -0.34 : rel > 0.4 ? 0.4 : rel;
    let m = 1 + rel;
    if (Ht) { const sh = Ht[k - SO] - Ht[k]; if (sh > 0) m *= 1 - 0.115 * (sh > 3 ? 3 : sh); }
    const add = rel > 0 ? rel * lift : 0;
    d[o] = d[o] * m + add; d[o + 1] = d[o + 1] * m + add * 0.9; d[o + 2] = d[o + 2] * m + add * 0.75;
  }
}

/** everything above the arc: knife smears of cinnabar / realgar / indigo */
function buildUpper(env, F, B) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const img = new ImageData(LW, LH), d = img.data, Hh = new Float32Array(LW * LH), Ht = new Float32Array(LW * LH);
  // the text-safe box, a little enlarged: strokes whose line would cross it stop short of it and pick up again beyond it
  const BX0 = a.cx - 330 - 26, BX1 = a.cx + 330 + 26, BY0 = a.crestY - 260 - 26, BY1 = a.crestY - 10 + 26, ICU = 1 / CU, ISU = 1 / SU;
  const LUTS = [lut(CINN_DEEP), lut(CINN), lut(REALGAR), lut(INDIGO)];
  const lim2 = (R - 48) * (R - 48);
  const { tIdx, uIdx, tMat, tTone, tSeed, tLen, tThr, tMA, tMB, uTone } = B;
  for (let j = 0; j < LH; j++) {
    const y = j - PAD, ddy = cy - y;
    for (let i = 0; i < LW; i++) {
      const x = i - PAD, ddx = x - cx;
      if (ddx * ddx + ddy * ddy < lim2) continue;           // hidden under the green bed
      const k = j * LW + i;
      const u = x * CU + y * SU, v = -x * SU + y * CU + 18 * F.bil(F.warp, i, j);
      const M = F.bil(F.mask, i, j), bl = F.bil(F.blot, i, j);
      const s1 = vn(u / 240, v / 2.6);                       // fine striations left by the blade
      const s2 = vn(u / 480 + 11.3, v / 9.5);                // drag streaks
      const s3 = vn(u / 900 + 5.1, v / 34);                  // broad passes
      const g2 = vn(x * 0.42, y * 0.42);                     // grain clumps (~2–3 px)
      const gr = h01(i, j);                                  // single grains
      // ground band
      let tone = uTone[uIdx[(v + 16 * (s3 - 0.5) + 7 * (s2 - 0.5) + 3 * (g2 - 0.5) - V0) | 0]];
      let mat = 0, hgt = 0;
      // top stroke: present where its (dry-brush) coverage holds, and never inside the calm reach
      const bi = tIdx[(v + 8 * (s2 - 0.5) + 5 * (g2 - 0.5) + 2.4 * (gr - 0.5) - V0) | 0];
      // slab test along the smear direction: does this stroke's line cross the calm box, and how far along it are we from the box?
      const tx1 = (BX0 - x) * ICU, tx2 = (BX1 - x) * ICU, ty1 = (BY1 - y) * ISU, ty2 = (BY0 - y) * ISU;
      const t0 = tx1 > ty1 ? tx1 : ty1, t1 = tx2 < ty2 ? tx2 : ty2, hit = t0 <= t1;
      const fray = 0.95 * (s1 - 0.5) + 0.7 * (s2 - 0.5) + 0.3 * (g2 - 0.5);                              // frayed, dry-brush ends
      if (tMat[bi]) {
        const cov = vn(u / tLen[bi] + tSeed[bi], tSeed[bi] * 3.7);
        let c = cov + 0.42 * (s1 - 0.5) + 0.3 * (s2 - 0.5) + 0.22 * (g2 - 0.5) + 0.1 * (gr - 0.5) - tThr[bi]
          - 0.42 * sstep(0.52, 0.92, vn(u / 80 + 3.3, v / 24 + 9.1));          // patches where the powder was dragged thin and the ground grins through
        if (c > 0 && hit && (t0 > 0 ? t0 - tMA[bi] : t1 < 0 ? -t1 - tMB[bi] : -1e4) / 120 + fray < 0) c = -1;
        if (c > 0) { mat = tMat[bi]; tone = tTone[bi]; hgt = mat === 2 ? 3.0 : 2.4; }
      }
      if (!mat) {
        // loose grains shed beside every stroke (it is powder, not paint): thinning out over ~20 px
        const hs = hi((i >> 1) + 39, (j >> 1) + 611);
        if ((hs & 255) < 44) {
          const off = (((hs >>> 8) & 1023) / 1023 - 0.5) * 46, far = (off < 0 ? -off : off) / 23;
          if (((hs >>> 18) & 255) / 255 > far * 1.15) {
            const b2 = tIdx[(v + off - V0) | 0];
            if (tMat[b2] && vn(u / tLen[b2] + tSeed[b2], tSeed[b2] * 3.7) > tThr[b2] + 0.06
              && !(hit && (t0 > 0 ? t0 - tMA[b2] : t1 < 0 ? -t1 - tMB[b2] : -1e4) / 120 + fray < 0.25)) {
              mat = tMat[b2]; tone = tTone[b2] + 0.12; hgt = 1.5;
            }
          }
        }
      }
      Ht[k] = hgt;
      const calm = 1 - 0.42 * M;
      tone += calm * (0.24 * (s1 - 0.5) + 0.22 * (s2 - 0.5) + 0.14 * (s3 - 0.5) + 0.16 * bl) + 0.16 * (g2 - 0.5) + 0.2 * (gr - 0.5)
        + (1 - 0.8 * M) * 0.17 * (vn(u / 90 + 40.7, v / 36 + 3.9) - 0.5);                     // mottling: the powder never packs evenly
      // coarser crystals: one possible grain per 7 px cell, a few of them glint
      let spark = 0;
      const qx = Math.floor(x / 7), qy = Math.floor(y / 7), hq = hi(qx, qy);
      if ((hq & 255) > 128) {
        const px = (qx + 0.25 + 0.5 * ((hq >>> 8) & 255) / 255) * 7 - x, py = (qy + 0.25 + 0.5 * ((hq >>> 16) & 255) / 255) * 7 - y;
        const rad = 1.0 + 1.9 * ((hq >>> 24) / 255), dd = (px * px + py * py) / (rad * rad);
        if (dd < 1) { const b = 1 - dd; hgt += 1.6 * b; tone += 0.16 * b; if ((hq & 255) > 250 && mat !== 3) spark = b * (1 - 0.7 * M); }
      }
      Hh[k] = hgt + calm * (2.0 * s1 + 1.6 * s2) + 1.0 * g2 + 0.5 * gr;
      const lu = LUTS[mat], li = (tone <= 0 ? 0 : tone >= 1 ? 255 : (tone * 255) | 0) * 3, o = k * 4;
      d[o] = lu[li] + 110 * spark; d[o + 1] = lu[li + 1] + 150 * spark; d[o + 2] = lu[li + 2] + 130 * spark; d[o + 3] = 255;
    }
  }
  shade(d, Hh, 0.115, 46, Ht);
  const c = L.makeCanvas(LW, LH);
  c.getContext('2d').putImageData(img, 0, 0);
  c._pad = PAD;
  return c;
}

/** everything below the arc: the malachite bed, its crumbly edge, and the grains the two powders trade across it */
function buildGreen(env, F) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const img = new ImageData(LW, LH), d = img.data, Hh = new Float32Array(LW * LH);
  const MAL = lut(MALA), YGL = lut(YG), CIN = lut(CINN), REA = lut(REALGAR);
  const out2 = (R + 44) * (R + 44);
  for (let j = 0; j < LH; j++) {
    const y = j - PAD, ddy = cy - y;
    for (let i = 0; i < LW; i++) {
      const x = i - PAD, ddx = x - cx, rr2 = ddx * ddx + ddy * ddy;
      if (rr2 > out2) continue;
      const k = j * LW + i, o = k * 4;
      const dr = Math.sqrt(rr2) - R;
      const al = Math.atan2(ddx, ddy) * R;                   // arc length from the crest
      const gr = h01(i + 7777, j);
      let near = 0;                                          // 0 = bed, 1 = green crumb, 2 = red/orange crumb
      let tone = 0, hgt = 0, lu = MAL;
      if (dr > -260) {
        // loose crumbs (≈ 3–6 px) thrown either way across the line; a thin sprinkle of the red powders carries further into the bed
        const qx = Math.floor(x / 6), qy = Math.floor(y / 6), hq = hi(qx + 91, qy + 57);
        const px = (qx + 0.25 + 0.5 * ((hq >>> 8) & 255) / 255) * 6, py = (qy + 0.25 + 0.5 * ((hq >>> 16) & 255) / 255) * 6;
        const rad = 1.3 + 2.1 * ((hq >>> 24) / 255);
        const q2 = ((x - px) * (x - px) + (y - py) * (y - py)) / (rad * rad);
        if (q2 < 1) {
          const drC = Math.hypot(px - cx, py - cy) - R, pr = (hq & 255) / 255;
          if (drC > 1 && pr < 0.46 * Math.exp(-drC / 9)) { near = 1; hgt = 3 + 2.4 * (1 - q2); tone = 0.6 + 0.22 * (1 - q2); }
          else if (drC < -2 && pr < 0.4 * Math.exp(drC / 11) + 0.05 * Math.exp(drC / 70)) { near = 2; hgt = 2.4 * (1 - q2); tone = 0.56 + 0.26 * (1 - q2); lu = (hq & 3) === 0 ? REA : CIN; }
        }
        if (dr > -46) {
          // ragged edge of the bed: ± a few px of crumbs, centred on the arc
          const e = -0.6 + 6.0 * (vn(al / 7.5, 3.1) - 0.5) + 3.0 * (vn(al / 2.4, 9.7) - 0.5);
          const dd = dr - e;
          if (!near) {
            const hg = h01((i >> 1) + 401, (j >> 1) + 77);              // single 2 px grains
            if (dd > 0) {
              if (hg < 0.62 * Math.exp(-dd / 4.6)) { near = 1; hgt = 2.2; tone = 0.52 + 0.3 * hg; }
              else {
                // above the edge and no grain here: only the contact shadow the bed throws onto the smears
                const sh = 0.6 * Math.exp(-dd / 6.5);
                if (sh > 0.012) { d[o] = 58; d[o + 1] = 4; d[o + 2] = 10; d[o + 3] = sh * 255; }
                continue;
              }
            } else if (hg < 0.4 * Math.exp(dd / 6.5)) { near = 2; hgt = 1.6; tone = 0.5 + 0.4 * hg; lu = (hi(i >> 1, j >> 1) & 3) === 0 ? REA : CIN; }
          }
          if (near === 1 && dd <= 0) near = 0;                     // a green crumb inside the bed is just bed
          if (!near && dd <= 0) tone += 0.3 * Math.exp(dd / 6);   // the lip of the bed catches the light
        }
      }
      if (near) {
        tone += 0.24 * (gr - 0.5);
        Hh[k] = hgt + gr;
      } else {
        const depth = -dr;
        const g2 = vn(x * 0.45 + 31, y * 0.45 + 7), g4 = vn(x * 0.21 + 3, y * 0.21 + 91), g9 = vn(x * 0.11 + 17, y * 0.11 + 53);
        const ps = vn(al / 260, dr / 7.5 + 40), ps2 = vn(al / 90 + 7, dr / 22);     // the bed was levelled with a sweep that follows the arc
        const cl = F.bil(F.cloud, i, j);
        tone += 0.64 + 0.2 * cl + 0.18 * (ps - 0.5) + 0.15 * (ps2 - 0.5) + 0.13 * (vn(x * 0.043 + 9, y * 0.043 + 77) - 0.5) + 0.2 * (g2 - 0.5) + 0.24 * (gr - 0.5) - 0.13 * sstep(140, 900, depth);
        // soft ridges left by the levelling sweep, concentric with the arc: their outward faces catch the light
        tone += 0.95 * (vn(al / 700 + 3, (dr + 3) / 38 + 11) - vn(al / 700 + 3, (dr - 3) / 38 + 11));
        hgt = 1.6 * g2 + 0.6 * gr + 1.3 * g4 + 0.8 * ps;
        // yellow-green flecks: separate grains of a second colour (fine ones, coarser ones, a few loose clots) — never a stain
        const cb = F.bil(F.clus, i, j) + 0.9 * F.bil(F.drift, i, j);
        let fl = 0;
        const ax = Math.floor(x / 8), ay = Math.floor(y / 8), ha = hi(ax + 311, ay + 173);
        if ((ha & 1023) / 1023 < 0.3 + 0.36 * cb) {
          const px = (ax + 0.25 + 0.5 * ((ha >>> 10) & 255) / 255) * 8 - x, py = (ay + 0.25 + 0.5 * ((ha >>> 18) & 255) / 255) * 8 - y;
          const rad = 1.0 + 1.0 * ((ha >>> 26) / 63), q2 = ((px * px + py * py) / (rad * rad)) * (0.7 + 0.6 * g2);
          if (q2 < 1) fl = 1 - q2;
        }
        if (!fl) {
          const bx = Math.floor(x / 22), by = Math.floor(y / 22), hb = hi(bx + 71, by + 919);
          if ((hb & 1023) / 1023 < 0.34 + 0.5 * cb) {
            const px = (bx + 0.25 + 0.5 * ((hb >>> 10) & 255) / 255) * 22 - x, py = (by + 0.25 + 0.5 * ((hb >>> 18) & 255) / 255) * 22 - y;
            const rad = 2.4 + 3.1 * ((hb >>> 26) / 63), q2 = ((px * px + py * py) / (rad * rad)) * (0.45 + 1.1 * g4);
            if (q2 < 1 && gr > 0.08) fl = 1 - q2;
          }
        }
        if (!fl && 0.55 * g4 + 0.45 * g9 + 0.2 * cb > 0.74 && h01((i >> 1) + 5, (j >> 1) + 9) < 0.72) fl = 0.4;
        if (fl) { lu = YGL; tone = 0.3 + 0.42 * fl + 0.3 * (g2 - 0.5) + 0.24 * (gr - 0.5); hgt += 1.0 + 1.6 * fl; }
        else {
          const g3 = vn(x * 0.31 + 50, y * 0.31 + 9);
          if (g3 > 0.82) tone -= 0.24; else if (g3 < 0.15) tone += 0.2;       // deeper and paler grains of the same green
        }
        Hh[k] = hgt;
      }
      const li = (tone <= 0 ? 0 : tone >= 1 ? 255 : (tone * 255) | 0) * 3;
      d[o] = lu[li]; d[o + 1] = lu[li + 1]; d[o + 2] = lu[li + 2]; d[o + 3] = 255;
    }
  }
  shade(d, Hh, 0.12, 40);
  const c = L.makeCanvas(LW, LH);
  c.getContext('2d').putImageData(img, 0, 0);
  c._pad = PAD;
  return c;
}

/** realgar flicked off the knife: fat drops with satellites, and sprays of small dots — kept out of the calm reach */
function buildSplatter(env) {
  const a = env.arc, r = L.rng('s17splat');
  const zx = a.cx, zy = a.crestY - 135;
  const calm = (x, y, m) => Math.abs(x - zx) < 330 + m && Math.abs(y - zy) < 125 + m;
  const layer = L.makeLayer(PAD, (g) => {
    const blob = (x, y, rad) => {
      const n = Math.max(9, Math.round(9 + rad * 0.5)), ph = r() * 9, pts = [];
      for (let q = 0; q < n; q++) {
        const t = (q / n) * L.TAU, rr = rad * (1 + 0.14 * Math.sin(t * 2 + ph) + 0.09 * Math.sin(t * 5 + ph * 2.3) + r.range(-0.07, 0.07));
        pts.push([x + Math.cos(t) * rr, y + Math.sin(t) * rr]);
      }
      const path = (ox, oy) => {
        g.beginPath();
        for (let q = 0; q <= n; q++) {
          const p0 = pts[q % n], p1 = pts[(q + 1) % n], mx = (p0[0] + p1[0]) / 2 + ox, my = (p0[1] + p1[1]) / 2 + oy;
          if (q === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p0[0] + ox, p0[1] + oy, mx, my);
        }
        g.closePath();
      };
      g.fillStyle = 'rgba(84,6,6,0.42)'; path(rad * 0.08 + 1.2, rad * 0.11 + 1.6); g.fill();
      g.fillStyle = L.radial(g, x - rad * 0.3, y - rad * 0.35, rad * 0.1, rad * 1.5, [[0, '#ffbe36'], [0.55, '#f7a41d'], [1, '#e8870f']]);
      path(0, 0); g.fill();
      // crumbly rim: loose grains around the outline
      const COL = ['#ffb62e', '#f6a21e', '#ffc94a', '#f29a1c', '#e8860f'];
      for (let q = 0, ng = Math.round(rad * 5.5); q < ng; q++) {
        const t = r() * L.TAU, rr = rad * r.range(0.8, 1.3), sz = r.range(0.6, 1.9), gx = x + Math.cos(t) * rr, gy = y + Math.sin(t) * rr;
        g.fillStyle = 'rgba(84,6,6,0.35)'; g.beginPath(); g.arc(gx + 0.7, gy + 0.9, sz, 0, L.TAU); g.fill();
        g.fillStyle = r.pick(COL); g.beginPath(); g.arc(gx, gy, sz, 0, L.TAU); g.fill();
      }
      // grains heaped on top: paler toward the light, deeper away from it
      for (let q = 0, ng = Math.round(rad * rad * 0.22); q < ng; q++) {
        const t = r() * L.TAU, rr = rad * Math.sqrt(r()) * 0.86, sz = r.range(0.7, 1.7), lit = -(Math.cos(t) + Math.sin(t)) * 0.5 + r.range(-0.6, 0.6);
        g.fillStyle = lit > 0 ? 'rgba(255,214,96,0.6)' : 'rgba(214,108,10,0.5)'; g.beginPath(); g.arc(x + Math.cos(t) * rr, y + Math.sin(t) * rr, sz, 0, L.TAU); g.fill();
      }
    };
    const dot = (x, y, rad) => {
      if (calm(x, y, 46)) return;
      if (rad > 3.2) { blob(x, y, rad); return; }
      g.fillStyle = 'rgba(84,6,6,0.5)'; g.beginPath(); g.arc(x + 0.9, y + 1.1, rad + 0.3, 0, L.TAU); g.fill();
      g.fillStyle = r.pick(['#ffb62e', '#ffc23a', '#ffd257', '#f8a820', '#ffdc6a']); g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
    };
    // heroes with satellites flung outward
    const heroes = [[1228, 92, 19], [348, 236, 15], [1648, 372, 13], [112, 508, 11], [742, 138, 9], [1836, 118, 12], [1470, 196, 8], [560, 60, 8], [226, 86, 10]];
    for (const [x, y, rad] of heroes) {
      const ns = Math.round(rad * 1.1) + 5;
      for (let q = 0; q < ns; q++) {
        const t = r() * L.TAU, dist = rad * r.range(1.5, 6);
        dot(x + Math.cos(t) * dist, y + Math.sin(t) * dist, Math.max(1, rad * r.range(0.07, 0.3) * (1.5 - dist / (rad * 6))));
      }
      dot(x, y, rad);
    }
    // sprays: a run of dots thinning out along one direction
    for (let s = 0; s < 14; s++) {
      let x = r.range(-40, W + 40), y = r.range(-40, 560);
      const t = PHI + Math.PI / 2 + r.range(-0.5, 0.5) + (r.chance(0.5) ? Math.PI : 0), n = r.int(9, 20);
      for (let q = 0; q < n; q++) {
        const f = q / n;
        dot(x + r.gauss() * (4 + 26 * f), y + r.gauss() * (4 + 26 * f), Math.max(0.9, r.range(2, 7.5) * (1 - 0.75 * f)));
        const st = r.range(14, 46); x += Math.cos(t) * st; y += Math.sin(t) * st;
      }
    }
    // loose singles
    for (let q = 0; q < 300; q++) dot(r.range(-PAD, W + PAD), r.range(-PAD, 760), r.chance(0.12) ? r.range(3.4, 8) : r.range(0.9, 3));
  });
  // the drops are powder too: grain them
  L.overlayOn(layer, L.grainTex(LW, LH, { seed: 's17sg', amount: 0.55 }), { blend: 'overlay', alpha: 0.75 });
  return layer;
}

export default {
  name: '矿物药色谱',
  tone: 'light',
  init(env) {
    const F = buildFields(env), B = buildBands();
    const upper = buildUpper(env, F, B);
    const green = buildGreen(env, F);
    const spl = buildSplatter(env);
    // stop-motion: every frame the smears, the drops and the grain sit a hair differently
    const r = L.rng('s17jit'), jit = [];
    for (let f = 0; f < Math.max(8, env.frames); f++) {
      jit.push({ x1: r.range(-2.4, 2.4), y1: r.range(-2.4, 2.4), r1: r.range(-0.0005, 0.0005), x2: r.range(-2, 2), y2: r.range(-2, 2), r2: r.range(-0.0006, 0.0006), r3: r.range(-0.0004, 0.0004), bx: r.int(0, 180), by: r.int(0, 180) });
    }
    const boil = L.grainTex(W + 192, H + 192, { seed: 's17boil', amount: 0.5, size: 3 });
    S = { upper, green, spl, jit, boil };
  },
  draw(ctx, env, p) {
    const f = Math.min(S.jit.length - 1, Math.max(0, Math.round(p * (env.frames - 1))));
    const J = S.jit[f];
    const rot = L.lerp(-0.0087, 0.0087, p);     // ≈ 1° about the circle centre: everything slides along the arc, the arc stays put
    L.blit(ctx, env, S.upper, { rot: rot + J.r1, dx: J.x1, dy: J.y1 });
    L.blit(ctx, env, S.spl, { rot: rot + J.r2, dx: J.x2, dy: J.y2 });
    L.blit(ctx, env, S.green, { rot: rot + J.r3 });
    // grain "boil"
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.28;
    ctx.drawImage(S.boil, -J.bx, -J.by);
    // one fixed raking light from the upper left (the powders slide under it)
    ctx.globalAlpha = 1;
    ctx.fillStyle = L.linear(ctx, 0, 0, W, H, [[0, 'rgba(255,255,255,0.16)'], [0.45, 'rgba(128,128,128,0)'], [1, 'rgba(0,0,0,0.13)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};
