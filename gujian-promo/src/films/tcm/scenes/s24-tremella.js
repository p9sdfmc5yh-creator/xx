// s24 — 银耳. Macro of a soaked snow fungus (Tremella fuciformis) on black: it reads like a piece of white lace.
// The arc is the upper silhouette of the whole cluster, made of the ruffled rims of its upright lobes.
//
// How it is drawn: every lobe (瓣片) is a thin translucent sheet, a frill growing from a broad base to a ruffled rim.
// In init() each sheet is sampled densely in its own (u, v) surface coordinates and the samples are splatted into a
// float "optical thickness" buffer — so wherever the sheet folds over itself or turns edge-on to the lens the jelly
// piles up along the line of sight and goes milk-white, exactly like real gauze or a jellyfish. A thicker rolled lip
// is splatted along the rim (the bright white line of every lobe), pleats come from a "ribbon-candy" ruffle that grows
// toward the rim, and lens-shaped slits between the pleats let the black through (the openwork). Lobes are composited
// far → near; each one darkens the crevice behind its own rim. A final per-pixel pass applies the top light and the palette.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 90;
const K = 0.55;                // optical thickness → opacity: one sheet ≈ 42 %, three ≈ 80 %, the rolled lip ≈ white
const NTW = 1024, NTH = 512;   // surface-noise table
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = L.clamp(0.5 + 0.5 * (b - a) / k); return L.lerp(b, a, h) - k * h * (1 - h); };

/**
 * Every lobe of the cluster, in unrolled arc coordinates: s = px along the arc from the crest, d = px below the arc.
 * A lobe is a truncated fan: (s0, d0) is its virtual centre, rv the radius of its rim, Ls the length of the sheet.
 */
function layout() {
  const r = L.rng('s24-tremella');
  const out = [];
  // the lobes fan out from the heart of the cluster, far below the frame and a little left of centre
  const lean = (s, d, k) => k * Math.atan2(s + 140, 1500 - d);
  const common = () => ({ ph1: r.range(0, L.TAU), ph2: r.range(0, L.TAU), seed: r.range(0, 900), nox: r.range(-150, 150), noy: r.range(0, 290), nox2: r.range(0, 1000), noy2: r.range(0, 400) });
  // the skyline: staggered rows of upright lobes whose rims lie along the arc
  const sky = (start, flat, shade, thick, z) => {
    for (let s = start; s < 1560;) {
      const rv = r.range(600, 780), w = r.range(300, 440), phi = w / (2 * rv), Ls = r.range(190, 260), lam = r.range(52, 90), lam2 = r.range(15, 24);
      out.push({
        z: z + r() * 0.5, sky: true, s0: s, d0: rv + flat, rv, flat: flat + r.range(-0.8, 0.8), ax: lean(s, 0, 0.12) + r.range(-0.05, 0.05), phi, Ls, pw: 3.5,
        lam, Az: r.range(9, 13), At: lam * r.range(0.07, 0.13), lam2, Az2: r.range(0.8, 1.5), At2: lam2 * r.range(0.03, 0.08),
        thick: thick * r.range(0.9, 1.2), shade: shade * r.range(0.94, 1), rim: 15, lip: 1.9, hole: r.range(0.6, 1), holeTh: r.range(0.5, 0.58), sc: 1, notches: [], ...common(),
      });
      s += w * r.range(0.52, 0.78);
    }
  };
  sky(-1700, -5, 0.9, 0.9, 0);
  sky(-1810, -4, 1, 1, 1);
  // the lobes in front of them, nearer and nearer the lens; `dr` is how far below the arc their rims sit
  const tier = (z, n, sMax, drLo, drHi, sc, wob) => {
    for (let i = 0; i < n; i++) {
      const sr = L.lerp(-sMax, sMax, (i + r.range(0.1, 0.9)) / n), dr = r.range(drLo, drHi);
      const big = r.range(0.75, 1.3), rv = r.range(330, 620), w = r.range(230, 400) * big, phi = Math.min(1.05, w / (2 * rv)), Ls = Math.min(rv * 0.72, r.range(150, 235) * big);
      const ax = lean(sr, dr, 0.5) + r.range(-wob, wob);
      const lam = r.range(60, 112), lam2 = r.range(16, 26), notches = [];
      for (let k = r.int(0, 2); k > 0; k--) notches.push({ u: r.range(-0.62, 0.62), w: r.range(0.04, 0.08), depth: r.range(0.15, 0.5) });
      out.push({
        z: z + r(), sky: false, s0: sr - rv * Math.sin(ax), d0: dr + rv * Math.cos(ax), rv, flat: 0, ax, phi, Ls, pw: r.range(2.4, 3.6),
        lam, Az: r.range(9, 20), At: lam * r.range(0.08, 0.17), lam2, Az2: r.range(1, 2), At2: lam2 * r.range(0.03, 0.09),
        thick: r.range(0.9, 1.25), shade: r.range(0.9, 1), rim: 15, lip: 1.7, hole: r.range(0.5, 1), holeTh: r.range(0.5, 0.6), sc, notches, ...common(),
      });
    }
  };
  tier(2, 9, 1560, 34, 76, 1, 0.3);
  tier(3, 9, 1560, 100, 152, 1, 0.4);
  tier(4, 9, 1560, 176, 236, 1, 0.45);
  tier(5, 8, 1500, 258, 330, 1, 0.5);
  tier(6, 7, 1180, 352, 430, 0.75, 0.5);
  tier(7, 5, 950, 455, 545, 0.5, 0.5);
  out.sort((p, q) => p.z - q.z);
  return out;
}

/** per-lobe tables along the rim parameter u ∈ [−1, 1] */
function tabulate(lb, NU, nz) {
  const n = NU + 1, f = () => new Float32Array(n);
  const T = { sa: f(), ca: f(), ets: f(), etd: f(), Hh: f(), Z1: f(), T1: f(), Z2: f(), T2: f(), DZ1: f(), DZ2: f(), side: f(), zr: f(), PH: f(), hMax: 0 };
  const rb = lb.rv - lb.Ls;
  const N1 = (2 * lb.phi * lb.rv) / lb.lam, N2 = (2 * lb.phi * lb.rv) / lb.lam2;
  for (let iu = 0; iu < n; iu++) {
    const u = -1 + (2 * iu) / NU, au = Math.abs(u), ang = lb.ax + lb.phi * u;
    const sa = Math.sin(ang), ca = Math.cos(ang);
    T.sa[iu] = sa; T.ca[iu] = ca;
    let o = Math.sqrt(Math.max(0, 1 - Math.pow(au, lb.pw))), hh;
    if (lb.sky) {
      // flat-topped: the rim follows the arc until the rounded shoulders take over; the fold slides sideways only
      hh = smin((lb.d0 - lb.flat) / Math.max(0.4, ca) - rb, lb.Ls * 1.45 * o, 26);
      T.ets[iu] = 1; T.etd[iu] = 0;
    } else {
      o *= 1 + 0.12 * nz.n2(u * 1.5 + lb.seed, 3.1) + 0.05 * nz.n2(u * 4.3 + lb.seed, 9.4);
      for (const nt of lb.notches) { const q = (u - nt.u) / nt.w; o *= 1 - nt.depth * Math.exp(-q * q); }   // a lobe forks like seaweed
      hh = lb.Ls * o;
      T.ets[iu] = ca; T.etd[iu] = sa;
    }
    T.Hh[iu] = Math.max(0, hh); if (hh > T.hMax) T.hMax = hh;
    // the ruffle: z swings toward / away from the lens while the sheet doubles back sideways (ribbon candy)
    const env1 = 0.35 + 0.65 * sstep(-0.55, 0.45, nz.n2(u * 1.25 + lb.seed * 1.7, 5.5));
    const psi = N1 * Math.PI * u + lb.ph1 + 1.5 * nz.n2(u * 1.3 + lb.seed, 7.7);
    const z1 = env1 * (lb.sky ? 0.5 + 0.5 * Math.sin(psi) : Math.sin(psi));
    T.Z1[iu] = lb.Az * z1; T.T1[iu] = -lb.At * env1 * Math.sin(2 * psi); T.zr[iu] = env1 * Math.sin(psi);
    const env2 = sstep(-0.25, 0.5, nz.n2(u * 2.1 + lb.seed, 11.3));
    const psi2 = N2 * Math.PI * u + lb.ph2 + 1.6 * nz.n2(u * 2.9 + lb.seed, 13.1);
    T.Z2[iu] = lb.Az2 * env2 * Math.sin(psi2); T.T2[iu] = -lb.At2 * env2 * Math.sin(2 * psi2);
    T.PH[iu] = psi2 / L.TAU - 0.25 + 64;   // slits open in the valleys of the fine pleats
    T.side[iu] = 1 - sstep(0.9, 1, au);
  }
  // true slope of the sheet toward the lens, per px of surface (drives thickness along the line of sight and the shading)
  const kz = (lb.sky ? 2.6 : 2.2) / (lb.phi * (2 / NU) * lb.rv);
  for (let iu = 0; iu < n; iu++) {
    const i0 = Math.max(0, iu - 1), i1 = Math.min(NU, iu + 1), q = kz / (i1 - i0);
    T.DZ1[iu] = q * (T.Z1[i1] - T.Z1[i0]); T.DZ2[iu] = q * (T.Z2[i1] - T.Z2[i0]);
  }
  return T;
}

function buildCluster(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, invR = 1 / R;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 70;
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  const nz = L.makeNoise('s24');
  const T0 = performance.now();
  // surface noise shared by every lobe: wandering of the pleats, fibres, slits
  const NT = new Float32Array(NTW * NTH);
  for (let j = 0; j < NTH; j++) for (let i = 0; i < NTW; i++) NT[j * NTW + i] = nz.fbm(i / 13, j / 13, 3, 2, 0.5) * 0.5 + 0.5;
  const T1 = performance.now();

  const acc = L.makeCanvas(RW, RH), ag = acc.getContext('2d', { willReadFrequently: true });
  // the depths of the cluster: a dim veil far behind everything, absent near the skyline so the slits there stay black
  {
    const fill = L.noiseTex(RW, RH, { seed: 's24fill', scale: 150, octaves: 4, warp: 0.5, res: 0.2, ramp: [[0.25, 'rgba(170,170,170,0)'], [0.6, 'rgba(170,170,170,0.5)'], [1, 'rgba(170,170,170,0.6)']] });
    const fg = fill.getContext('2d');
    fg.globalCompositeOperation = 'destination-in';
    fg.fillStyle = L.radial(fg, cx - X0, cy - Y0, R - 300, R - 80, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    fg.fillRect(0, 0, RW, RH);
    ag.drawImage(fill, 0, 0);
  }

  const buf = new Float32Array(RW * RH), sbuf = new Float32Array(RW * RH);
  const tmp = L.makeCanvas(RW, RH), tg = tmp.getContext('2d');
  const small = L.makeCanvas(Math.ceil(RW / 6) + 2, Math.ceil(RH / 6) + 2), smg = small.getContext('2d');
  smg.imageSmoothingQuality = 'high';
  const toX = (s, d) => cx + (R - d) * Math.sin(s * invR), toY = (s, d) => cy - (R - d) * Math.cos(s * invR);
  let tSplat = 0, tComp = 0, nSamp = 0;

  for (const lb of layout()) {
    const tA = performance.now();
    const sc = lb.sc, rv = lb.rv, rb = rv - lb.Ls;
    const NU = Math.max(80, Math.ceil((2 * lb.phi * rv * sc) / 0.5));
    const T = tabulate(lb, NU, nz);
    const NV = Math.max(60, Math.ceil((T.hMax * sc) / 0.55));
    const { sa, ca, ets, etd, Hh, Z1, T1: Tt1, Z2, T2: Tt2, DZ1, DZ2, side, zr, PH } = T;
    const sAx = Math.sin(lb.ax), cAx = Math.cos(lb.ax), phi = lb.phi, s0 = lb.s0, d0 = lb.d0, Ls = lb.Ls;
    // bounding box on screen (buffer px)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let iu = 0; iu <= NU; iu += 4) {
      for (let e = 0; e < 2; e++) {
        const rr = rb + e * Hh[iu], s = s0 + rr * sa[iu], d = d0 - rr * ca[iu], x = toX(s, d), y = toY(s, d);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const mg = lb.Az + lb.At + lb.Az2 + lb.At2 + 30;
    const bx = Math.max(0, Math.floor((x0 - mg - X0) * sc)), by = Math.max(0, Math.floor((y0 - mg - Y0) * sc));
    const bw = Math.min(Math.ceil(RW * sc), Math.ceil((x1 + mg - X0) * sc)) - bx, bh = Math.min(Math.ceil(RH * sc), Math.ceil((y1 + mg - Y0) * sc)) - by;
    if (bw < 8 || bh < 8) continue;
    buf.fill(0, 0, bw * bh); sbuf.fill(0, 0, bw * bh);

    // ── the sheet ──
    const dU = 2 / NU, dV = 1 / NV, areaK = phi * dU * dV * sc * sc;
    const ox = 512 + lb.nox, oy = lb.noy, ox2 = lb.nox2, oy2 = lb.noy2, th = lb.holeTh;
    let seed = (lb.seed * 7919 + 13) | 0;
    for (let iv = 1; iv <= NV; iv++) {
      const v0 = iv / NV, stride = v0 < 0.12 ? 2 : 1;
      const tv = lb.thick * sstep(0, 0.3, v0) * (1 + lb.lip * Math.exp((-(1 - v0) * Ls) / 9)) * stride * areaK;
      const zn = sstep(0.1, 0.3, v0) * (1 - sstep(1 - 30 / Ls, 1 - 12 / Ls, v0)) * lb.hole;
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      for (let iu = (seed >>> 8) % stride; iu <= NU; iu += stride) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const v = v0 + ((seed >>> 9) * (1 / 8388608) - 0.5) * dV;
        const hh = Hh[iu], rr = rb + v * hh, q = v * hh;
        const p = rr * phi * (-1 + iu * dU);
        // slow noise: the pleats wander and their strength comes and goes
        const nA = NT[(((p * 0.2 + ox) | 0) & 1023) + ((((q * 0.2 + oy) | 0) & 511) << 10)] - 0.5;
        const g1 = v * v * (1 + 1.5 * nA), wob = nA * 0.2 * v;
        const hz = g1 * Z1[iu] + v * Z2[iu], ht = g1 * Tt1[iu] + v * Tt2[iu];
        const sA = sa[iu] + wob * ca[iu], cA = ca[iu] - wob * sa[iu];
        const s = s0 + rr * sA + ht * ets[iu] - hz * sAx;
        const d = d0 - rr * cA + ht * etd[iu] + hz * cAx;
        const t = s * invR, t2 = t * t, rad = R - d;
        const fx = (cx + rad * t * (1 - t2 * (1 / 6) * (1 - t2 * 0.05)) - X0) * sc - bx;
        const fy = (cy - rad * (1 - t2 * 0.5 * (1 - t2 * (1 / 12) * (1 - t2 * (1 / 30)))) - Y0) * sc - by;
        if (fx < 0 || fy < 0 || fx >= bw - 1 || fy >= bh - 1) continue;
        // fibres running down the sheet
        const nB = NT[(((p * 2.3 + ox2) | 0) & 1023) + ((((q * 0.25 + oy2) | 0) & 511) << 10)];
        let m = tv * rr * hh * side[iu] * (0.62 + 0.76 * nB);
        if (zn > 0) {
          // a lens-shaped slit in the valley between two fine pleats
          const c = PH[iu], ci = c | 0, f = Math.abs(c - ci - 0.5);
          const w = (NT[((ci * 37 + (ox2 | 0)) & 1023) + ((((q * 0.11 + oy) | 0) & 511) << 10)] - th) * 1.7;
          if (w > 0) {
            const e = (w > 0.3 ? 0.3 : w) - f;
            if (e > 0) m *= 1 - zn * (e > 0.07 ? 1 : e * (1 / 0.07));
            else if (e > -0.1) m *= 1 + 0.8 * zn * (1 + e * 10);      // its slightly rolled edge
          }
        }
        const sl = g1 * DZ1[iu] + v * DZ2[iu], asl = sl < 0 ? -sl : sl;
        m *= 1 + 0.5 * (asl > 2.6 ? 2.6 : asl);
        const sh = 0.86 + (0.2 * sl) / (1 + asl);
        const ix = fx | 0, iy = fy | 0, wx = fx - ix, wy = fy - iy, k = iy * bw + ix;
        const m00 = m * (1 - wx) * (1 - wy), m10 = m * wx * (1 - wy), m01 = m * (1 - wx) * wy, m11 = m * wx * wy;
        buf[k] += m00; buf[k + 1] += m10; buf[k + bw] += m01; buf[k + bw + 1] += m11;
        sbuf[k] += m00 * sh; sbuf[k + 1] += m10 * sh; sbuf[k + bw] += m01 * sh; sbuf[k + bw + 1] += m11 * sh;
        nSamp++;
      }
    }

    // ── the rolled lip along the rim, with a few wet glints ──
    const rg = L.rng('s24g' + lb.seed), glints = [];
    for (let i = rg.int(3, 6); i > 0; i--) glints.push(rg.range(0.12, 0.88) * NU * 2);
    const sig = 1.15 * (sc < 1 ? 0.85 : 1), i2s = 1 / (2 * sig * sig), nrm = 1 / (L.TAU * sig * sig);
    let px = 0, py = 0;
    for (let k = 0; k <= NU * 2; k++) {
      const f = k * 0.5, i0 = f | 0, i1 = Math.min(NU, i0 + 1), w = f - i0, w0 = 1 - w;
      const hh = Hh[i0] * w0 + Hh[i1] * w, rr = rb + hh;
      const p = rr * phi * (-1 + f * dU);
      const nA = NT[(((p * 0.2 + ox) | 0) & 1023) + ((((hh * 0.2 + oy) | 0) & 511) << 10)] - 0.5;
      const g1 = 1 + 1.5 * nA, wob = nA * 0.2;
      const sA0 = sa[i0] * w0 + sa[i1] * w, cA0 = ca[i0] * w0 + ca[i1] * w, sA = sA0 + wob * cA0, cA = cA0 - wob * sA0;
      const hz = g1 * (Z1[i0] * w0 + Z1[i1] * w) + Z2[i0] * w0 + Z2[i1] * w, ht = g1 * (Tt1[i0] * w0 + Tt1[i1] * w) + Tt2[i0] * w0 + Tt2[i1] * w;
      const s = s0 + rr * sA + ht * (ets[i0] * w0 + ets[i1] * w) - hz * sAx, d = d0 - rr * cA + ht * (etd[i0] * w0 + etd[i1] * w) + hz * cAx;
      const fx = (toX(s, d) - X0) * sc - bx, fy = (toY(s, d) - Y0) * sc - by;
      const ds = Math.hypot(fx - px, fy - py); px = fx; py = fy;
      if (k === 0 || fx < 3 || fy < 3 || fx >= bw - 3 || fy >= bh - 3) continue;
      let gl = 0;
      for (const kg of glints) { const e = (k - kg) / 7; gl += Math.exp(-e * e); }
      const wgt = lb.rim * Math.min(ds, 1.6) * side[i0] * (0.82 + 0.3 * zr[i0]) * (1 + 3.5 * gl) * nrm;
      const ix = Math.round(fx), iy = Math.round(fy);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const ex = ix + i - fx, ey = iy + j - fy, m = wgt * Math.exp(-(ex * ex + ey * ey) * i2s), e = (iy + j) * bw + ix + i;
        buf[e] += m; sbuf[e] += m * 1.12;
      }
    }

    // ── thickness → a white, translucent sprite; composite it over what lies behind ──
    const img = new ImageData(bw, bh), dd = img.data;
    for (let i = 0, nn = bw * bh; i < nn; i++) {
      const D = buf[i]; if (D < 0.004) continue;
      const o = i * 4, g = (sbuf[i] / D) * lb.shade * 255;
      dd[o] = dd[o + 1] = dd[o + 2] = g; dd[o + 3] = (1 - Math.exp(-K * D)) * 255;
    }
    const tB = performance.now();
    tg.putImageData(img, 0, 0);
    const ax0 = bx / sc, ay0 = by / sc, aw = bw / sc, ah = bh / sc;
    // the crevice behind this lobe's rim falls into shadow (a cheap blur: down to 1/6 size and back up)
    const sw = Math.ceil(bw / (6 * sc)), sh2 = Math.ceil(bh / (6 * sc));
    smg.clearRect(0, 0, sw + 2, sh2 + 2);
    smg.drawImage(tmp, 0, 0, bw, bh, 1, 1, sw, sh2);
    ag.save(); ag.globalCompositeOperation = 'destination-out'; ag.globalAlpha = 0.36;
    ag.drawImage(small, 0, 0, sw + 2, sh2 + 2, ax0 - aw / sw, ay0 - 4 - ah / sh2, aw + (2 * aw) / sw, ah + (2 * ah) / sh2);
    ag.restore();
    ag.drawImage(tmp, 0, 0, bw, bh, ax0, ay0, aw, ah);
    tSplat += tB - tA; tComp += performance.now() - tB;
  }
  const T2 = performance.now();

  // ── light and colour ──
  const src = ag.getImageData(0, 0, RW, RH).data;
  const out = new ImageData(RW, RH), od = out.data, hl = new ImageData(RW, RH), hd = hl.data;
  const lut = (stops) => { const f = L.makeRamp(stops), t = new Float32Array(1024 * 3); for (let i = 0; i < 1024; i++) { const c = f(i / 1023); t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2]; } return t; };
  // near the light: neutral grey veil → milk white. deeper down the dense jelly turns warm ivory
  const TOP = lut([[0, '#050505'], [0.1, '#1d1c1a'], [0.3, '#5f5c55'], [0.5, '#a5a197'], [0.68, '#dcd6c6'], [0.84, '#f4efe2'], [1, '#fffdf8']]);
  const DEEP = lut([[0, '#050505'], [0.1, '#1e1c18'], [0.3, '#625c4c'], [0.5, '#aa9f84'], [0.68, '#e6d9b8'], [0.84, '#f4ecd6'], [1, '#fffaf0']]);
  for (let y = 0; y < RH; y++) {
    const dyc = cy - (Y0 + y);
    for (let x = 0; x < RW; x++) {
      const o = (y * RW + x) * 4, al = src[o + 3];
      od[o + 3] = 255;
      if (!al) { od[o] = od[o + 1] = od[o + 2] = 5; continue; }
      const dxc = X0 + x - cx, d = R - Math.sqrt(dxc * dxc + dyc * dyc);
      const lum = (al * src[o]) * (1 / 65025);
      const light = (1.06 - 0.44 * sstep(40, 600, d)) * (1 - 0.00006 * dxc);
      let v = lum * light; if (v > 1) v = 1;
      const li = ((v * 1023) | 0) * 3, wd = sstep(120, 540, d) * 0.85;
      od[o] = TOP[li] + (DEEP[li] - TOP[li]) * wd; od[o + 1] = TOP[li + 1] + (DEEP[li + 1] - TOP[li + 1]) * wd; od[o + 2] = TOP[li + 2] + (DEEP[li + 2] - TOP[li + 2]) * wd;
      // the wet highlights: only the rims and the densest folds, strongest near the skyline
      const h = sstep(0.6, 0.93, lum) * (1 - 0.7 * sstep(60, 420, d));
      hd[o] = 255; hd[o + 1] = 252; hd[o + 2] = 244; hd[o + 3] = h * 255;
    }
  }
  const main = L.makeCanvas(RW, RH), mg = main.getContext('2d');
  mg.putImageData(out, 0, 0);
  const hlc = L.makeCanvas(RW, RH); hlc.getContext('2d').putImageData(hl, 0, 0);
  // depth of field: sharp along the skyline, softening toward the bottom of frame and the far sides
  const soft = L.blurred(main, 5), sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.radial(sg, cx - X0, cy - Y0, R - 560, R - 220, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  sg.fillRect(0, 0, RW, RH);
  // the jelly glows: a little light bleeds out of the white into its surroundings
  const bloom = L.blurred(main, 12);
  mg.drawImage(soft, 0, 0);
  mg.globalCompositeOperation = 'screen'; mg.globalAlpha = 0.22; mg.drawImage(bloom, 0, 0);
  mg.globalCompositeOperation = 'source-over'; mg.globalAlpha = 1;
  console.warn(`s24 timing: noise ${(T1 - T0) | 0}, lobes ${(T2 - T1) | 0} (splat ${tSplat | 0}, comp ${tComp | 0}, ${(nSamp / 1e6).toFixed(1)}M samples), post ${(performance.now() - T2) | 0}`);
  return { main, hl: hlc, X0, Y0, RW, RH };
}

export default {
  name: '银耳',
  tone: 'light',
  init(env) {
    const c = buildCluster(env);
    const BW = 820;
    const rd = L.rng('s24dust'), dust = [];
    for (let i = 0; i < 15; i++) {
      let x, y;
      do { x = rd.range(40, W - 40); y = rd.range(40, 500); } while ((x > 560 && x < 1360 && y > 250) || env.arc.drAt(x, y) < 40);
      dust.push({ x, y, r: i < 3 ? rd.range(3.5, 6.5) : rd.range(0.7, 1.7), al: i < 3 ? rd.range(0.05, 0.09) : rd.range(0.16, 0.5), k: rd.range(0.4, 1.3) });
    }
    S = { ...c, BW, band: L.makeCanvas(BW, c.RH), dust };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    // a few motes of dust hanging in the dark
    for (const q of S.dust) {
      const x = q.x + 5 * p * q.k, y = q.y - 7 * p * q.k;
      ctx.fillStyle = L.radial(ctx, x, y, 0, q.r, [[0, L.rgba('#f4efe2', q.al)], [0.5, L.rgba('#f4efe2', q.al * 0.6)], [1, L.rgba('#f4efe2', 0)]]);
      ctx.fillRect(x - q.r, y - q.r, q.r * 2, q.r * 2);
    }
    // the cluster slides along the arc while we creep closer
    const cam = { rot: L.lerp(-0.0065, 0.0065, p), zoom: L.lerp(1, 1.022, p), dy: -2.2 * p };
    L.cam(ctx, env, cam, () => ctx.drawImage(S.main, S.X0, S.Y0));
    // the light catches the wet rims and travels along them
    const bx = Math.round(a.pt(L.lerp(-0.2, 0.0, p), 0).x - S.X0 - S.BW / 2);
    const bg = S.band.getContext('2d');
    bg.globalCompositeOperation = 'copy';
    bg.drawImage(S.hl, bx, 0, S.BW, S.RH, 0, 0, S.BW, S.RH);
    bg.globalCompositeOperation = 'destination-in';
    bg.fillStyle = L.linear(bg, 0, 0, S.BW, 0, [[0, 'rgba(0,0,0,0)'], [0.3, 'rgba(0,0,0,0.5)'], [0.5, 'rgba(0,0,0,1)'], [0.7, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    bg.fillRect(0, 0, S.BW, S.RH);
    bg.globalCompositeOperation = 'source-over';
    L.cam(ctx, env, cam, () => { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6; ctx.drawImage(S.band, S.X0 + bx, S.Y0); });
    L.vignette(ctx, { strength: 0.22, inner: 0.5 });
  },
};
