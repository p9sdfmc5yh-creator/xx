// s26 — 青黛. Indigo-naturalis powder rubbed across rough pale-blue handmade paper with a fingertip — a macro still.
// The arc is the upper edge of the first, heaviest smear. Below it two more smears follow concentric arcs, each
// starting thick (near blue-black) and breaking up into dry "flying white" and loose dust. Above the arc: only paper.
//
// Everything is rendered once, per pixel, in init():
//   · a paper "tooth" height field (shared by the paper shading and the powder),
//   · for each smear a "load" field in polar coords (u = distance along the arc, d = depth below the smear's top edge);
//     powder only sticks where load beats the tooth → heavy load covers the sheet, light load only dusts the peaks,
//   · a little windrow of powder the finger pushed aside (a real height field),
//   · one raking light from the upper left over the combined relief (tooth + powder thickness + heap), with the heap's
//     cast shadow, then a focus band that hugs the arc (the sheet melts out of focus toward the top, bottom and sides).
// draw() is a single blit with a tiny rotation about the arc centre, so no grain ever flickers.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;
const RW = W + PAD * 2, RH = H + PAD * 2;
const UMAX = 1800;                 // half-range of the 1-D lookup tables along the arc (px of arc length)
const KT = 0.8;                    // paper-tooth relief (px) as the powder sees it
const HK = 15;                     // heap height (px)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// 起笔 u0 → 收笔 u1 (arc-length px from the crest; negative = left). v0 = depth of the smear's top edge below the arc.
const STROKES = [
  { v0: 0, w: 226, core: 0.5, reach: 1.1, soft: 2.2, u0: -1700, u1: 2150, a0: 1.14, a1: 0.6, q0: 0.36, q1: 0.78, fw0: 0.1, fw1: 0.3, ridge: 0.5, jit: 1.2, drift: 0, narrow: 0.82, seed: 3.7, puff: 0, lane: 0.42 },
  { v0: 320, w: 104, core: 0.42, reach: 1.25, soft: 5, u0: 640, u1: -1020, a0: 1.1, a1: 0.48, q0: 0.08, q1: 0.62, fw0: 0.12, fw1: 0.32, ridge: 0.16, jit: 2.4, drift: 9, narrow: 0.7, seed: 19.3, puff: 1, lane: 0 },
  { v0: 464, w: 150, core: 0.4, reach: 1.2, soft: 8, u0: -600, u1: 1400, a0: 0.9, a1: 0.5, q0: 0.05, q1: 0.6, fw0: 0.16, fw1: 0.3, ridge: 0.1, jit: 3, drift: 10, narrow: 0.82, seed: 41.9, puff: 0.7, lane: 0 },
];

function prepStrokes() {
  const nz = L.makeNoise('s26edge');
  return STROKES.map((st) => {
    const dir = st.u1 > st.u0 ? 1 : -1, len = Math.abs(st.u1 - st.u0), n = UMAX * 2 + 2;
    const top = new Float32Array(n), wid = new Float32Array(n), bj = new Float32Array(n), rm = new Float32Array(n), rc = new Float32Array(n), ln = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i - UMAX, q = L.clamp((dir * (u - st.u0)) / len);
      top[i] = st.v0 + st.drift * nz.n2(u / 620 + st.seed, 3.1) + st.jit * (0.6 * nz.n2(u / 44, st.seed * 1.7) + 0.4 * nz.n2(u / 13, st.seed * 2.9));
      wid[i] = st.w * (1 + 0.13 * nz.n2(u / 380 + st.seed * 3.3, 8.8)) * L.lerp(1, st.narrow, q);
      bj[i] = st.w * (0.11 * nz.n2(u / 560, st.seed + 5) + 0.035 * nz.n2(u / 130, st.seed + 9));    // slow wander of the lower limit
      rm[i] = 0.42 + 0.58 * sstep(-0.45, 0.5, 0.65 * nz.n2(u / 120, st.seed + 2) + 0.35 * nz.n2(u / 31, st.seed + 4));   // the ploughed ridge comes and goes
      rc[i] = 6 + 2.5 * nz.n2(u / 85, st.seed + 6);
      ln[i] = st.lane * sstep(-0.1, 0.45, nz.n2(u / 640 + st.seed, 12.5));                          // where a paler lane opens inside the smear
    }
    return { ...st, dir, len, cap: st.w * 0.62, top, wid, bj, rm, rc, ln };
  });
}

/** the little windrow that never got rubbed out: height (0..~1.4) and its cast shadow on a local (u, v) grid */
function buildHeap(a, st) {
  const hu = -520, ui = Math.round(hu + UMAX), hv = st.top[ui] + st.wid[ui] * 0.74, th = hu / a.R;
  const GW = 560, GH = 280, ox = GW / 2, oy = GH / 2 - 14;
  const nz = L.makeNoise('s26heap'), r = L.rng('s26crumb');
  const G = (x, y, sx, sy) => Math.exp(-(x * x) / (sx * sx) - (y * y) / (sy * sy));
  const hgt = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i - ox, y = j - oy;
    let h = G(x + 6, y - 2, 64, 21) + 0.86 * G(x - 62, y - 8, 40, 16) + 0.72 * G(x + 74, y + 7, 44, 15) + 0.46 * G(x - 116, y - 1, 26, 10) + 0.42 * G(x + 132, y + 4, 24, 9) + 0.34 * G(x + 8, y + 20, 46, 9);
    h *= 1 + 0.42 * nz.fbm(x / 26, y / 26, 3);
    h += (0.12 * nz.n2(x / 7 + 9, y / 7) + 0.055 * nz.n2(x / 3 + 3, y / 3 - 8)) * sstep(0.06, 0.35, h);    // clumps and grains on its skin
    hgt[j * GW + i] = h < 0 ? 0 : h;
  }
  // crumbs that rolled off it
  for (let n = 0; n < 60; n++) {
    const cxn = r.gauss() * 130, cyn = 12 + r.gauss() * 36, sg = 2 + 4.4 * Math.pow(r(), 2.2), hh = r.range(0.13, 0.36), el = r.range(0.7, 1.3);
    const i0 = Math.max(1, Math.floor(cxn + ox - sg * 3)), i1 = Math.min(GW - 2, Math.ceil(cxn + ox + sg * 3));
    const j0 = Math.max(1, Math.floor(cyn + oy - sg * 3)), j1 = Math.min(GH - 2, Math.ceil(cyn + oy + sg * 3));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = hh * G(i - ox - cxn, j - oy - cyn, sg * el, sg / el), k = j * GW + i;
      hgt[k] = Math.max(hgt[k], v) + 0.4 * Math.min(hgt[k], v);
    }
  }
  // cast shadow: march from every cell toward the light (upper left on screen, rotated into this frame)
  const lx0 = -0.695, ly0 = -0.719, c = Math.cos(th), s = Math.sin(th);
  const lu = lx0 * c + ly0 * s, lv = -lx0 * s + ly0 * c;
  let shd = new Float32Array(GW * GH);
  const TS = [3, 6, 10, 15, 21, 28, 37, 48];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i, h0 = HK * hgt[k]; let oc = 0;
    for (let n = 0; n < TS.length; n++) {
      const t = TS[n], xi = Math.round(i + lu * t), yj = Math.round(j + lv * t);
      if (xi < 0 || xi >= GW || yj < 0 || yj >= GH) continue;
      const o = sstep(0, 5, HK * hgt[yj * GW + xi] - h0 - t * 0.46);
      if (o > oc) oc = o;
    }
    shd[k] = oc;
  }
  for (let pass = 0; pass < 2; pass++) {             // soften the penumbra
    const b = new Float32Array(GW * GH);
    for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
      const k = j * GW + i;
      b[k] = (shd[k] * 2 + shd[k - 1] + shd[k + 1] + shd[k - GW] + shd[k + GW] + 0.5 * (shd[k - GW - 1] + shd[k - GW + 1] + shd[k + GW - 1] + shd[k + GW + 1])) / 8;
    }
    shd = b;
  }
  return { hu, hv, GW, GH, ox, oy, hgt, shd };
}

/** per-pixel paper + powder → two canvases (RW×RH, origin at −PAD) */
function buildFields(env, strokes) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const nT = L.makeNoise('s26tooth'), nS = L.makeNoise('s26smear'), nD = L.makeNoise('s26dust');
  const N = RW * RH;
  const heap = buildHeap(a, strokes[0]);

  // 1) paper tooth: coarse handmade-paper grain (height, roughly −0.9..0.9) — granules big enough to see
  const T = new Float32Array(N), HF = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = j - PAD;
    for (let i = 0; i < RW; i++) {
      const x = i - PAD, k = j * RW + i;
      const t = 0.54 * nT.n2(x / 8.4, y / 8.4) + 0.3 * nT.n2(x / 3.7 + 31.7, y / 3.7 - 17.3) + 0.24 * nT.n2(x / 22 - 5.1, y / 22 + 44.2) + 0.14 * (hash(i, j) - 0.5);
      T[k] = t; HF[k] = KT * t;
    }
  }

  // powder colour by amount: pale trace → 青黛 → 浓靛 → near blue-black
  const ramp = L.makeRamp([[0, '#7fa0dc'], [0.2, '#3d68c4'], [0.42, '#1f4fb8'], [0.6, '#1a429f'], [0.78, '#152d76'], [0.9, '#111e58'], [1, '#0e1542']]);
  const NL = 512, lut = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const ST = [98, 140, 214];       // the soft stain a rubbed finger leaves in the fibres
  const SH = [14, 30, 92];         // shadow of the heap on the sheet

  // 2) where the powder lies: coverage, amount, stain, shadow, relief
  const AL = new Float32Array(N), MM = new Float32Array(N), SN = new Float32Array(N), SD = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = j - PAD, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const ddx = i - PAD - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), v = R - rr;
      if (v < -14) continue;
      const u = Math.atan2(ddx, ddy) * R, fi = u + UMAX;
      if (fi < 0 || fi >= UMAX * 2) continue;
      const k = j * RW + i, t = T[k], i0 = fi | 0, f = fi - i0;
      let load = 0, haze = 0, dust = 0;
      for (let n = 0; n < strokes.length; n++) {
        const st = strokes[n];
        if (v < st.v0 - 44 || v > st.v0 + st.w * (st.reach + 0.95) + 30) continue;
        const s = st.dir * (u - st.u0);
        if (s < -st.w || s > st.len * 1.2) continue;
        const q = s / st.len;
        const top = st.top[i0] + (st.top[i0 + 1] - st.top[i0]) * f, w = st.wid[i0] + (st.wid[i0 + 1] - st.wid[i0]) * f;
        const d = v - top;
        if (st.puff > 0) {           // loose powder puffed out where the fingertip landed
          const ps = s - 0.2 * st.cap, pd2 = d - 0.5 * w, pf = st.puff * Math.exp(-(ps * ps + pd2 * pd2 * 1.3) / (0.95 * w * w));
          if (pf > dust) dust = pf;
        }
        let dTop = d, capB = 1;
        if (s < st.cap) {            // the fingertip lands: a rounded, ragged start
          const c = 1 - s / st.cap, wob = 7 * nS.n2(d / 17, st.seed + 61.3) + 4 * nS.n2(d / 6, st.seed + 13.7);
          const hh = 0.5 * w * Math.sqrt(c < 1 ? 1 - c * c : 0) + wob;
          dTop = d - (0.5 * w - hh); capB = sstep(-10, 18, 0.5 * w + hh - d) * sstep(-6, 0.45 * st.cap, s + 11 * nS.n2(d / 12, st.seed + 71.7));
        }
        const tj = dTop + 3.1 * t;                                                    // the tooth breaks the edge into grains
        if (tj < -st.soft) {
          if (tj > -11 && capB > 0.2) { const fr = 0.42 * Math.exp(tj / 3.6) * sstep(0.12, 0.45, q) * (1 - sstep(0.9, 1.05, q)); if (fr > dust) dust = fr; }   // a hair of dust above the edge
          continue;
        }
        const eTop = sstep(-st.soft, 1.3 * st.soft, tj);
        const sa = nS.n2(u / 230 + st.seed * 2.1, d / 7.5 + 7.7);                     // striations dragged by the finger
        const sb = nS.n2(u / 95 - st.seed, d / 3.2 + 3.3);
        const sw = nS.n2(u / 390 + st.seed * 5.3, d / 15 - 2.2);                      // some streaks carry further than others
        const db = d + st.bj[i0] - 0.17 * w * sw - 0.05 * w * sa;
        const hz = (1 - sstep(st.core * w, (st.reach + 0.28) * w, db)) * capB;        // how far the finger pad dragged at all
        const dz = (1 - sstep(st.core * w, (st.reach + 0.85) * w, d + st.bj[i0])) * capB;   // …and how far loose grains were shed
        const qe = 1 + 0.12 * nS.n2(d / 10, st.seed + 13.1) + 0.05 * sa;
        const endF = 1 - sstep(qe - 0.32, qe, q);
        const dd0 = 0.62 * dz * (1 - sstep(1.02, 1.2, q)) * (0.55 + 0.45 * sstep(0.3, 0.9, q));
        if (dd0 > dust) dust = dd0;
        if (hz <= 0) continue;
        const fall = (1 - sstep(st.core * w, st.reach * w, db)) * capB;               // pressure dies away toward the lower side
        const band = 0.5 + 0.5 * nS.n2(u / 420 + st.seed, d / 30 + st.seed);           // broad pressure bands
        const cl = nS.n2(u / 30 + 11.1, d / 30 - st.seed);                             // isotropic clumps: what is left when the load runs out
        const A = st.a0 + (st.a1 - st.a0) * sstep(st.q0, st.q1, q);
        const qc = q < 0 ? 0 : q > 1 ? 1 : q, fw = st.fw0 + (st.fw1 - st.fw0) * qc, eT = sstep(0.55, 1, qc) * 0.85;
        let ld = A * (0.8 + 0.2 * band) + fw * ((0.62 * sa + 0.38 * sb) * (1 - eT) + cl * eT * 1.2);
        ld += 0.3 * Math.exp(-Math.max(0, s) / (st.w * 1.5));                          // 起笔: powder lies thickest
        if (st.lane > 0) { const lc = (d - (0.55 + 0.05 * sw) * w) / (0.075 * w); ld -= st.ln[i0] * Math.exp(-lc * lc) * (0.75 + 0.25 * sb); }   // a paler lane between two passes
        const rd = dTop - st.rc[i0];
        ld = ld * fall + st.ridge * st.rm[i0] * Math.exp(-rd * rd / 78);               // + ridge ploughed up along the top edge
        ld *= eTop * endF;                                                             // 收笔: thinning to specks
        if (ld > load) load = ld;
        const h2 = hz * eTop * (1 - sstep(qe - 0.2, qe + 0.06, q)) * Math.min(1, A + 0.25);
        if (h2 > haze) haze = h2;
      }
      // the heap
      let hp = 0, sd = 0;
      const gu = u - heap.hu + heap.ox, gv = v - heap.hv + heap.oy;
      if (gu >= 1 && gu < heap.GW - 2 && gv >= 1 && gv < heap.GH - 2) {
        const gi = gu | 0, gj = gv | 0, fx = gu - gi, fy = gv - gj, gk = gj * heap.GW + gi, GW = heap.GW;
        hp = (heap.hgt[gk] * (1 - fx) + heap.hgt[gk + 1] * fx) * (1 - fy) + (heap.hgt[gk + GW] * (1 - fx) + heap.hgt[gk + GW + 1] * fx) * fy;
        sd = (heap.shd[gk] * (1 - fx) + heap.shd[gk + 1] * fx) * (1 - fy) + (heap.shd[gk + GW] * (1 - fx) + heap.shd[gk + GW + 1] * fx) * fy;
        const lh = 1.32 * sstep(0.03, 0.2, hp); if (lh > load) load = lh;
        const lu2 = (gu - heap.ox) / 215, lv2 = (gv - heap.oy - 12) / 62, au = 0.8 * Math.exp(-lu2 * lu2 - lv2 * lv2);
        if (au > dust) dust = au;
      }
      if (haze < 0.01 && load < 0.02 && dust < 0.03 && sd < 0.01) continue;
      const cov = sstep(-0.19, 0.19, (load - 0.5) * 1.55 + t) * sstep(0.02, 0.1, load);
      let alpha = cov * (0.7 + 0.3 * sstep(0.15, 0.6, load));
      let m = (load + 0.22 * t) / 1.32; m = m < 0 ? 0 : m > 1 ? 1 : m;
      if (hp > 0.05) { const mh = 0.84 + 0.1 * t; if (mh > m) m = mh; }
      let thick = cov * (0.45 + 2.1 * sstep(0.55, 1.6, load));
      if (dust > 0.03 && cov < 0.92) {            // loose grains: irregular specks, denser where more was shed
        const x = i - PAD, sp = 0.62 * nD.n2(x / 2.5, y / 2.5) + 0.38 * nD.n2(x / 5.8 + 9.1, y / 5.8 - 4.3);
        const th = 0.82 - 0.56 * dust, spk = sstep(th, th + 0.1, sp);
        if (spk > 0.01) {
          const as = 0.92 * spk;
          if (as > alpha) { m = (m * alpha + (0.62 + 0.3 * hash(i >> 2, j >> 2)) * (as - alpha)) / as; alpha = as; }
          thick += 1.3 * spk;
        }
      }
      const dense = sstep(0.6, 1.25, load);
      HF[k] = KT * t * (1 - 0.5 * cov * dense) + thick + HK * hp;
      AL[k] = alpha; MM[k] = m; SD[k] = sd;
      SN[k] = 0.34 * sstep(0.02, 0.75, haze) * L.clamp(0.72 + 0.7 * t, 0.2, 1.3);
    }
  }

  // 3) light it: paper by its tooth, powder by the combined relief
  const paper = new ImageData(RW, RH), pd = paper.data;
  const powder = new ImageData(RW, RH), wd = powder.data;
  for (let j = 0; j < RH; j++) {
    const jm = j > 0 ? RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, o = k * 4, t = T[k], im = i > 0 ? 1 : 0, ip = i < RW - 1 ? 1 : 0;
      // paper: raking light from the upper left across the tooth; valleys a shade deeper and bluer
      const gx = T[k + ip] - T[k - im], gy = T[k + jp] - T[k - jm];
      let e = (gx + gy) * 0.17 + t * 0.034; e = e < -0.2 ? -0.2 : e > 0.13 ? 0.13 : e;
      pd[o] = 166 * (1 + 1.3 * e); pd[o + 1] = 198 * (1 + e); pd[o + 2] = 234 * (1 + 0.55 * e); pd[o + 3] = 255;

      const al = AL[k], sn = SN[k], sd = SD[k];
      if (al < 0.004 && sn < 0.004 && sd < 0.01) continue;
      // premultiplied "over": shadow, then stain, then powder
      let pr = 0, pg = 0, pb = 0, pa = 0;
      if (sd >= 0.01) { const a1 = 0.6 * sd; pr = SH[0] * a1; pg = SH[1] * a1; pb = SH[2] * a1; pa = a1; }
      if (sn >= 0.004) { pr = ST[0] * sn + pr * (1 - sn); pg = ST[1] * sn + pg * (1 - sn); pb = ST[2] * sn + pb * (1 - sn); pa = sn + pa * (1 - sn); }
      if (al >= 0.004) {
        const hx = (HF[k + ip] - HF[k - im]) * 0.5, hy = (HF[k + jp] - HF[k - jm]) * 0.5;
        const dif = (0.6 * hx + 0.62 * hy + 0.5) / Math.sqrt(hx * hx + hy * hy + 1);
        let sh = 0.3 + 1.4 * dif; sh = sh < 0.28 ? 0.28 : sh > 1.5 ? 1.5 : sh;
        sh *= 1 - 0.55 * sd;
        const li = ((MM[k] * (NL - 1)) | 0) * 3, gr = 1 + 0.07 * (hash(i + 7919, j + 104729) - 0.5), lift = sh > 1 ? sh - 1 : 0;
        const r = lut[li] * sh * gr + 30 * lift, g = lut[li + 1] * sh * gr + 34 * lift, b = lut[li + 2] * sh * gr + 44 * lift;
        pr = r * al + pr * (1 - al); pg = g * al + pg * (1 - al); pb = b * al + pb * (1 - al); pa = al + pa * (1 - al);
      }
      if (pa <= 0.003) continue;
      wd[o] = pr / pa; wd[o + 1] = pg / pa; wd[o + 2] = pb / pa; wd[o + 3] = pa * 255;
    }
  }
  const pc = L.makeCanvas(RW, RH); pc.getContext('2d').putImageData(paper, 0, 0);
  const wc = L.makeCanvas(RW, RH); wc.getContext('2d').putImageData(powder, 0, 0);
  return { paper: pc, powder: wc };
}

/** fibres and flecks pressed into the sheet (kept faint over the tagline zone) */
function drawFibres(g, a) {
  const r = L.rng('s26fibre');
  const quiet = (x, y) => x > 580 && x < 1340 && y > a.crestY - 310 && y < a.crestY + 20;
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD);
    const long = r.chance(0.05), len = long ? r.range(60, 130) : r.range(6, 30), ang = r.range(0, Math.PI), kind = r();
    const b1 = r.range(-0.45, 0.45), b2 = r.chance(0.4) ? -b1 * r.range(0.4, 1.2) : b1 * r.range(0.3, 1.4);
    const k = quiet(x, y) ? 0.4 : 1;
    let col, lw;
    if (kind < 0.36) { col = L.rgba('#4673c2', r.range(0.3, 0.65) * k); lw = r.range(0.7, 1.4); }
    else if (kind < 0.7) { col = L.rgba('#f3f8ff', r.range(0.3, 0.75) * k); lw = r.range(0.6, 1.5); }
    else { col = L.rgba('#1b3a8c', r.range(0.4, 0.85) * k); lw = r.range(0.7, 1.5); }
    if (long) lw *= 0.8;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x, y);
    g.bezierCurveTo(x + cx * len * 0.33 - cy * len * b1, y + cy * len * 0.33 + cx * len * b1, x + cx * len * 0.66 - cy * len * b2, y + cy * len * 0.66 + cx * len * b2, x + cx * len, y + cy * len);
    g.stroke();
  }
  g.restore();
  L.speckle(g, { seed: 's26fleck', count: 1100, x: -PAD, y: -PAD, w: RW, h: RH, rMin: 0.6, rMax: 2, colors: ['#2f58ad', '#1d3f96', '#4a78c8'], alpha: [0.18, 0.6], test: (x, y) => !quiet(x, y) || hash(x | 0, y | 0) < 0.4 });
  L.speckle(g, { seed: 's26pale', count: 700, x: -PAD, y: -PAD, w: RW, h: RH, rMin: 0.6, rMax: 1.9, colors: ['#f4f9ff', '#dcebfb'], alpha: [0.2, 0.6] });
  L.speckle(g, { seed: 's26bark', count: 30, x: -PAD, y: -PAD, w: RW, h: RH, rMin: 1.8, rMax: 3.6, colors: ['#1d3f96', '#24489c'], alpha: [0.45, 0.8], squash: 0.6, test: (x, y) => !quiet(x, y) });
}

/** shallow depth of field: sharp in a band that hugs the arc, melting away toward the top, the bottom and the sides */
function applyFocus(layer, a) {
  const pass = (px, band) => {
    const soft = L.blurred(layer, px), sg = soft.getContext('2d');
    const m = L.makeCanvas(RW, RH), mg = m.getContext('2d');
    mg.translate(PAD, PAD);
    const r0 = a.R - 900, r1 = a.R + 700, f = (dr) => (a.R + dr - r0) / (r1 - r0);
    mg.fillStyle = L.radial(mg, a.cx, a.cy, r0, r1, [[0, 'rgba(0,0,0,1)'], [f(-band.b1), 'rgba(0,0,0,1)'], [f(-band.b0), 'rgba(0,0,0,0)'], [f(band.t0), 'rgba(0,0,0,0)'], [f(band.t1), 'rgba(0,0,0,' + band.top + ')'], [1, 'rgba(0,0,0,' + band.top + ')']]);
    mg.fillRect(-PAD, -PAD, RW, RH);
    mg.fillStyle = L.linear(mg, 0, 0, W, 0, [[0, 'rgba(0,0,0,' + band.side + ')'], [0.2, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,' + band.side + ')']]);
    mg.fillRect(-PAD, -PAD, RW, RH);
    sg.globalCompositeOperation = 'destination-in'; sg.drawImage(m, 0, 0);
    const g = layer.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(soft, 0, 0); g.restore();
  };
  pass(2.2, { b0: 250, b1: 420, t0: 120, t1: 330, top: 0.85, side: 0.7 });
  pass(5.5, { b0: 370, b1: 600, t0: 280, t1: 560, top: 0.8, side: 0.5 });
}

function buildLayer(env) {
  const a = env.arc;
  const strokes = prepStrokes();
  const f = buildFields(env, strokes);
  const layer = L.makeLayer(PAD, (g) => {
    g.drawImage(f.paper, -PAD, -PAD);
    // the pulp is cloudy: slow drifts and smaller flocks of denser fibre
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.14;
    g.drawImage(L.noiseTex(RW, RH, { seed: 's26pulp', scale: 260, octaves: 4, res: 0.1, contrast: 1.3 }), -PAD, -PAD);
    g.globalAlpha = 0.1;
    g.drawImage(L.noiseTex(RW, RH, { seed: 's26flock', scale: 46, octaves: 3, res: 0.3, contrast: 1.4 }), -PAD, -PAD);
    g.restore();
    drawFibres(g, a);
    g.drawImage(f.powder, -PAD, -PAD);
  });
  applyFocus(layer, a);
  // one soft window light over the whole sheet, from the upper left
  const g = layer.getContext('2d');
  g.save(); g.globalCompositeOperation = 'soft-light';
  g.fillStyle = L.linear(g, 0, -PAD, W, H + PAD, [[0, 'rgba(255,255,255,0.2)'], [0.5, 'rgba(255,255,255,0)'], [0.5, 'rgba(0,16,80,0)'], [1, 'rgba(0,16,80,0.22)']]);
  g.fillRect(-PAD, -PAD, RW, RH);
  g.restore();
  return layer;
}

export default {
  name: '青黛',
  tone: 'dark',
  init(env) {
    S = { layer: buildLayer(env) };
  },
  draw(ctx, env, p) {
    ctx.fillStyle = '#a9c8ea'; ctx.fillRect(0, 0, W, H);
    // the sheet slides a hair along the arc; every grain stays where it fell
    L.blit(ctx, env, S.layer, { rot: L.lerp(-0.0055, 0.0055, p) });
  },
};
