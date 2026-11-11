// s25 — 银锭流银. Macro of the domed top face of a cast silver ingot (银锭) on flat rouge-purple paper.
// The arc is the ingot's upper edge: an uneven black crust of tarnish (氧化皮壳) curled up like the lip the
// metal threw as it froze, with one line of bright silver reflection pressed along its top. Below it the
// milk-bright silver face with the concentric swells and fine "silk" ripples (丝纹) left by cooling; hanging
// from the crust, a festoon of drip-shaped stains — the oxide running down and bleeding from black through
// purple-red into pale pink, round-tipped, all different lengths — and a few clusters of honeycomb pores.
// No stamps, no characters.
//
// Everything below the arc is shaded per pixel in init(): each pixel is mapped to (U = px along the arc,
// d = px below it); a height field (crust roll + lumps, swells + silk ripples) is lit from the top of frame,
// and a signed-distance field of crust ∪ drips drives the stain (pigment pooled at the tips → halo → tide ring).
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PADX = 72;      // side margin for the slide along the arc
const PADB = 28;      // bottom margin
const TOPM = 46;      // rows kept above the crest (room for the halation)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function lut(stops) {
  const f = L.makeRamp(stops), out = new Float32Array(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = f(i / 1023); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
const bil = (src, gw, fx, fy) => {
  const i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * gw + i0;
  const a0 = src[k], a1 = src[k + 1], b0 = src[k + gw], b1 = src[k + gw + 1];
  return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
};

function buildIngot(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, TAU = L.TAU;
  const X0 = -PADX, Y0 = Math.floor(a.crestY) - TOPM;
  const RW = W + PADX * 2, RH = H + PADB - Y0, N = RW * RH;
  const nA = L.makeNoise('s25a'), nB = L.makeNoise('s25b');

  // ── 1D profiles along the arc: top-edge wobble, crust thickness, brightness of the silver lip ──
  const UMAX = 1340, NU = UMAX * 2 + 2;
  const E = new Float32Array(NU), TT = new Float32Array(NU), LB = new Float32Array(NU);
  for (let iu = 0; iu < NU; iu++) {
    const U = iu - UMAX;
    E[iu] = 1.7 * nA.n2(U / 90, 3.1) + 0.8 * nA.n2(U / 30, 8.7);
    let t = 88 + 30 * nA.fbm(U / 330, 11.3, 3) + 12 * nB.n2(U / 95, 5.5);
    const bulge = Math.max(0, nA.n2(U / 210 + 50, 2.2)); t += 30 * bulge * bulge;
    TT[iu] = L.clamp(t, 54, 138);
    LB[iu] = 0.83 + 0.09 * nB.n2(U / 130, 7.7) + 0.03 * nA.n2(U / 31, 4.4);
  }
  const prof = (arr, U) => { const f = U + UMAX, i = f | 0; return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };

  // ── the drips, in (U, depth) space: a funnel where the oxide leaves the crust, a thin thread, a round drop at the tip ──
  const r = L.rng('s25drips-b');
  const drips = [];
  let u = -UMAX + 30, lastKind = 0;
  while (u < UMAX - 30) {
    const q = r();
    const kind = q < 0.34 && lastKind !== 2 ? 2 : q < 0.62 ? 1 : 0;
    const avail = R - (cy - H) / Math.cos(u / R);           // depth of the frame's bottom edge along this radius
    const T = prof(TT, u);
    let len, rb, neck, flare;
    if (kind === 2) { len = r.range(140, 250); rb = r.range(22, 34); neck = rb * r.range(0.3, 0.42); flare = rb * r.range(1.1, 1.7); }
    else if (kind === 1) { len = r.range(62, 128); rb = r.range(16, 25); neck = rb * r.range(0.38, 0.55); flare = rb * r.range(0.9, 1.5); }
    else { len = r.range(16, 44); rb = r.range(17, 30); neck = rb * r.range(0.85, 1); flare = rb * r.range(0.3, 0.7); }
    len = Math.max(14, Math.min(len, avail - T - rb - 96));
    const fa = r.range(0, 0.2), fb = fa + r.range(0.28, 0.7);
    const dp = { u, dA: T - 10, len, rb, neck, flare, flLen: 1.2 * rb + 8, lean: r.range(-0.06, 0.06) * len, sway: kind === 0 ? 0 : r.range(-7, 7), wig: r.range(0.9, 1.9),
      tb: 1 - Math.min(0.85, (2.5 * rb) / len), fa, fb, tip: 1, trail: kind === 2 ? r.range(0.5, 1) : kind === 1 ? r.range(0.2, 0.7) : 0 };
    drips.push(dp);
    if (kind !== 0 && r.chance(kind === 2 ? 0.5 : 0.25)) {
      // a drop that has let go and bled on its own
      const rs = r.range(5, 11);
      drips.push({ u: u + dp.lean + r.range(-5, 5), dA: dp.dA + len + rb + rs + r.range(12, 40), len: 2, rb: rs, neck: rs, flare: 0, flLen: 10, lean: 0, sway: 0, wig: 1, tb: 0, fa: -1, fb: -0.5, tip: 1, trail: 0 });
    }
    u += rb * 1.5 + r.range(24, 84) + (kind === 2 ? 14 : 0);
    lastKind = kind;
  }
  const BIN = 64, NBIN = Math.ceil((UMAX * 2) / BIN) + 1, bins = Array.from({ length: NBIN }, () => []);
  for (const dp of drips) {
    dp.reach = dp.rb + dp.flare + Math.abs(dp.lean) + Math.abs(dp.sway) + 76;
    const b0 = Math.max(0, Math.floor((dp.u - dp.reach + UMAX) / BIN)), b1 = Math.min(NBIN - 1, Math.floor((dp.u + dp.reach + UMAX) / BIN));
    for (let b = b0; b <= b1; b++) bins[b].push(dp);
  }

  // ── half-res fields: F = signed distance to (crust ∪ drips), M = how black the stain is, P = "tip-ness", TR = faint run below a tip ──
  const CS = 2, gw = Math.ceil(RW / CS) + 2, gh = Math.ceil(RH / CS) + 2;
  const gF = new Float32Array(gw * gh), gM = new Float32Array(gw * gh), gP = new Float32Array(gw * gh), gT = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.sqrt(ddx * ddx + ddy * ddy);
    const U = Math.atan2(ddx, ddy) * R, dC = R - rr - prof(E, U), T = prof(TT, U);
    let F = dC - T, m = 0, tr = 0, tp = 0, best = 60;
    if (dC > 0 && dC < 640) {
      const list = bins[L.clamp(Math.floor((U + UMAX) / BIN), 0, NBIN - 1)];
      for (let q = 0; q < list.length; q++) {
        const dp = list[q], du = U - dp.u;
        if (du > dp.reach || du < -dp.reach) continue;
        const py = dC - dp.dA;
        let t = (du * dp.lean + py * dp.len) / (dp.lean * dp.lean + dp.len * dp.len); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = du - dp.lean * t - dp.sway * Math.sin(Math.PI * t * dp.wig) * t, qy = py - dp.len * t;
        const rad = dp.neck + (dp.rb - dp.neck) * sstep(dp.tb, 1, t) + dp.flare * Math.exp(-(t * dp.len) / dp.flLen);
        const dist = Math.sqrt(qx * qx + qy * qy) - rad;
        F = smin(F, dist, 16);
        const mk = (1 - sstep(dp.fa, dp.fb, t)) * sstep(6, -3, dist);
        if (mk > m) m = mk;
        if (dist < best) { best = dist; tp = dp.tip * sstep(dp.tb - 0.12, 1, t); }
        const below = py - dp.len;
        if (below > 0 && dp.trail > 0) { const w = Math.exp(-below / 85) * Math.exp(-(qx * qx) / (0.6 * dp.rb * dp.rb)) * dp.trail; if (w > tr) tr = w; }
      }
    }
    const k = j * gw + i; gF[k] = F; gM[k] = m; gP[k] = tp; gT[k] = tr;
  }

  // ── quarter-res slow fields for the silver face ──
  const C4 = 4, cw = Math.ceil(RW / C4) + 2, ch = Math.ceil(RH / C4) + 2;
  const cW0 = new Float32Array(cw * ch), cW1 = new Float32Array(cw * ch), cW2 = new Float32Array(cw * ch), cEnv = new Float32Array(cw * ch), cUnd = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * C4 - cx, ddy = cy - (Y0 + j * C4), rr = Math.sqrt(ddx * ddx + ddy * ddy);
    const U = Math.atan2(ddx, ddy) * R, d = R - rr, k = j * cw + i;
    cW0[k] = 0.55 * nB.fbm(U / 700 + 4, d / 260 + 1, 2);
    cW1[k] = 1.05 * nA.fbm(U / 700, d / 230, 2);
    cW2[k] = 1.3 * nB.fbm(U / 420 + 9, d / 160 - 4, 2);
    cEnv[k] = 0.82 + 0.18 * nA.n2(U / 300 + 3, d / 170 + 8);
    cUnd[k] = nB.fbm(U / 420 - 5, d / 260 + 2, 3);
  }

  // ── pass 1: height field ──
  const Hh = new Float32Array(N), DC = new Float32Array(N), UU = new Float32Array(N), FN = new Float32Array(N), RP = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -7) { DC[k] = -99; continue; }
      const U = Math.atan2(ddx, ddy) * R;
      const dC = d - prof(E, U), T = prof(TT, U);
      DC[k] = dC; UU[k] = U;
      let z = 6 * bil(cUnd, cw, i / C4, j / C4);
      if (dC <= 0) { Hh[k] = z; continue; }
      const fC = dC - T;
      const fn = nB.n2(U / 5.2, d / 5.2); FN[k] = fn;
      if (fC < 0) {
        // the crust: a rolled lip (steep outer shoulder, long back slope) with slow lumps and one wandering fold
        const s = dC / T;
        const envB = sstep(0.02, 0.4, s) * sstep(1, 0.8, s);
        const fold = 1 - Math.abs(nA.n2(U / 230 + 7, dC / 34 - 3));
        z += 0.4 * T * Math.sin(Math.PI * Math.pow(s, 0.7))
          + envB * (4.6 * nA.n2(U / 62, dC / 30) + 0.25 * nB.n2(U / 16, dC / 12) + 3 * (fold * fold - 0.4));
      } else {
        // the silver face: broad swells, then two families of silk ripples, all concentric with the arc
        const fx = i / C4, fy = j / C4, fade = sstep(0, 18, fC);
        const p0 = 0.5 + 0.5 * Math.sin(TAU * (d / 92 + bil(cW0, cw, fx, fy)));
        let p1 = 0.5 + 0.5 * Math.sin(TAU * (d / 11.5 + bil(cW1, cw, fx, fy))); p1 *= p1;
        const p2 = 0.5 + 0.5 * Math.sin(TAU * (d / 4.7 + bil(cW2, cw, fx, fy)));
        RP[k] = p1;
        z += fade * (7.5 * p0 + bil(cEnv, cw, fx, fy) * (1.5 * p1 + 0.42 * p2)) + 0.1 * fn;
      }
      Hh[k] = z;
    }
  }

  // ── pass 2: shade ──
  const SIL = lut([[0, '#84769a'], [0.2, '#b3a6c2'], [0.4, '#d9d0df'], [0.56, '#f1eef0'], [0.72, '#fbfafc'], [0.86, '#ffffff'], [1, '#ffffff']]);
  const STAIN = lut([[0, '#ffffff'], [0.1, '#fcf0f7'], [0.22, '#f5d4e8'], [0.4, '#ea9ccd'], [0.58, '#d955aa'], [0.74, '#cc3898'], [0.86, '#801c5f'], [0.94, '#3d1332'], [1, '#1e1c19']]);
  const img = new ImageData(RW, RH), px = img.data;
  const RHS = Math.min(RH, Math.ceil(a.yAt(X0)) + 170 - Y0);     // the crust never reaches below this row
  const simg = new ImageData(RW, RHS), sx = simg.data;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, dC = DC[k];
      if (dC < -0.5) continue;
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), sn = ddx / rr, cs = ddy / rr, d = R - rr;
      const U = UU[k], T = prof(TT, U), fC = dC - T, fn = FN[k];
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      const ht = hx * cs + hy * sn, hv = -hx * sn + hy * cs;      // slope along the arc / toward the centre
      const und = bil(cUnd, cw, i / C4, j / C4);
      let cr = 0, cg = 0, cb = 0, refl = 0;

      if (fC > -1.2) {
        // silver, lit from the top of frame (and a little from the left)
        const rel = hv * 0.92 + ht * 0.3;
        let v = 0.6 + 0.54 * rel + 0.05 * und - 0.1 * Math.exp(-(fC > 0 ? fC : 0) / 48) - 0.13 * sstep(-250, 1150, U) - 0.05 * sstep(-520, -1150, U); v = v < 0 ? 0 : v > 1 ? 1 : v;
        const li = ((v * 1023) | 0) * 3;
        let sr = SIL[li], sg = SIL[li + 1], sb = SIL[li + 2];
        // stain density
        let F = bil(gF, gw, i / CS, j / CS), rho = 0;
        if (F < 100) {
          const n1 = nA.n2(U / 55, d / 55), n2 = nB.n2(U / 9, d / 9);
          F += 6 * n1 + 0.6 * n2;
          const tp = bil(gP, gw, i / CS, j / CS), edgeK = Math.min(0.84, (0.52 + 0.3 * tp) * (0.9 + 0.28 * nB.n2(U / 70 + 3, d / 70)));
          if (F < 0) {
            let mm = bil(gM, gw, i / CS, j / CS) + 0.1 * n1 + 0.05 * n2; mm = mm < 0 ? 0 : mm > 1 ? 1 : mm;
            const base = 0.68 - 0.19 * tp + 0.05 * n1; let inner = base + (1 - base) * mm - 0.05 * sstep(-6, -22, F) * (1 - mm);
            if (inner > edgeK) inner = edgeK + (inner - edgeK) * sstep(0, -3.5, F);
            const edge = edgeK * sstep(-9 - 6 * tp, -1, F);
            rho = inner > edge ? inner : edge;
          } else {
            const e1 = edgeK * Math.exp(-F / 3.4), e2 = (0.32 + 0.12 * tp) * Math.exp(-F / (20 + 14 * tp)), q = (F - 38) / 5.5;
            rho = (e1 > e2 ? e1 : e2) + (0.07 + 0.08 * tp) * Math.exp(-q * q) * (0.6 + 0.4 * n1);
            rho += 0.22 * bil(gT, gw, i / CS, j / CS);
          }
          if (rho > 0.03 && rho < 0.85) rho *= 1 + (F < 0 ? 0.2 : 0.5) * (0.36 - RP[k]) * (1 - rho) + (F < 0 ? 0.03 : 0.07) * n2;   // pigment settles in the troughs between the ripples
        }
        rho += 0.24 * sstep(350, 640, d);        // a pink blush where the face rolls toward the bottom of frame
        rho = rho < 0 ? 0 : rho > 1 ? 1 : rho;
        const k1 = 0.4 * rho;                    // heavy stain hides the ripples
        sr += (241 - sr) * k1; sg += (238 - sg) * k1; sb += (240 - sb) * k1;
        const si = ((rho * 1023) | 0) * 3;
        cr = sr * STAIN[si] / 255; cg = sg * STAIN[si + 1] / 255; cb = sb * STAIN[si + 2] / 255;
        if (fC < 40) {                           // the lip's contact shadow on the face
          const sh = 0.55 * Math.exp(-(fC > 0 ? fC : 0) / 8);
          cr *= 1 - sh; cg *= 1 - sh * 1.05; cb *= 1 - sh * 0.9;
        }
      }
      if (fC < 1.2) {
        // the crust: glossy tarnish black; its up-facing shoulder mirrors the light as one line of silver
        const s = dC > 0 ? dC / T : 0;
        let br = 28 + 7 * und, bg = 26 + 3 * und, bb = 23 - 3 * und;
        let dif = hv * 0.9 + 0.2; dif = dif < 0 ? 0 : dif > 0.6 ? 0.6 : dif;
        const sheen = dif * 30 + 10 * sstep(0.78, 0.36, s) + (fn > 0.6 ? (fn - 0.6) * 24 : 0);
        br += sheen; bg += sheen * 0.95; bb += sheen * 1.12;
        const rim = sstep(-0.35, -1.0, hv) * sstep(0.7, 0.97, s);         // the silver below bounces pink into the underside
        br += 110 * rim; bg += 30 * rim; bb += 88 * rim;
        refl = sstep(0.27, 0.4, hv + 0.2 * ht + 0.03 * fn);
        const hot = sstep(0.4, 1.2, hv), lb = prof(LB, U);
        let lr = (186 + 69 * hot) * lb, lg = (179 + 76 * hot) * lb, lbb = (196 + 59 * hot) * lb;
        if (hv > 2.4) { const e = 0.3 * sstep(2.4, 4.2, hv); lr += (232 - lr) * e; lg += (190 - lg) * e; lbb += (216 - lbb) * e; }   // grazing edge picks up the paper's colour
        br += (lr - br) * refl; bg += (lg - bg) * refl; bb += (lbb - bb) * refl;
        const wc = fC <= -1.2 ? 1 : sstep(1.2, -1.2, fC);
        cr += (br - cr) * wc; cg += (bg - cg) * wc; cb += (bb - cb) * wc;
        refl *= wc * (0.3 + 0.7 * sstep(0.55, 0.2, s));
      }
      const o = k * 4, al = dC + 0.5;
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = al >= 1 ? 255 : al * 255;
      if (j < RHS && refl > 0.01) { sx[o] = 255; sx[o + 1] = 252; sx[o + 2] = 255; sx[o + 3] = refl * 255 * (al >= 1 ? 1 : al); }
    }
  }
  const cnv = L.makeCanvas(RW, RH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);
  const spec = L.makeCanvas(RW, RHS);
  spec.getContext('2d').putImageData(simg, 0, 0);

  // ── honeycomb pores: a few irregular nests of round casting pits in the clear silver between the drips ──
  g.save();
  g.translate(-X0, -Y0);
  const sampleF = (x, y) => bil(gF, gw, L.clamp((x - X0) / CS, 0, gw - 2), L.clamp((y - Y0) / CS, 0, gh - 2));
  const rp = L.rng('s25pores-b'), clusters = [];
  for (let n = 0; n < 1200 && clusters.length < 6; n++) {
    const U = rp.range(-1150, 1150), dd = prof(TT, U) + rp.range(40, 150);
    const p = a.pt(U / R, -dd), F = sampleF(p.x, p.y);
    if (F < 40 || F > 130) continue;
    if (clusters.some((c) => Math.abs(c.U - U) < 300)) continue;
    clusters.push({ U, dd });
  }
  for (const c of clusters) {
    const count = rp.int(9, 16), blob = rp.range(17, 27), pits = [];
    for (let n = 0; n < count * 12 && pits.length < count; n++) {
      const rad = pits.length === 0 ? rp.range(8, 11) : 2.6 + 6.4 * Math.pow(rp(), 1.7);
      const lx = pits.length === 0 ? 0 : rp.gauss() * blob * 0.55, ly = pits.length === 0 ? 0 : rp.gauss() * blob * 0.42;
      if (pits.some((q) => Math.hypot(q.lx - lx, q.ly - ly) < q.rad + rad + 1.3)) continue;
      const th = (c.U + lx) / R, dd = c.dd + ly, p = a.pt(th, -dd);
      if (sampleF(p.x, p.y) < rad + 6) continue;
      pits.push({ lx, ly, rad, th, dd });
    }
    for (const q of pits) {
      const rad = q.rad;
      a.at(g, q.th, -q.dd, () => {
        // tarnish gathers round the mouth
        g.fillStyle = L.radial(g, 0, rad * 0.3, rad * 0.8, rad * 2.2 + 3, [[0, 'rgba(198,58,150,0.42)'], [0.45, 'rgba(226,150,200,0.2)'], [1, 'rgba(232,195,218,0)']]);
        g.beginPath(); g.arc(0, rad * 0.3, rad * 2.2 + 3, 0, L.TAU); g.fill();
        // the cavity: upper wall in shadow, lower wall catching the light
        g.fillStyle = L.radial(g, 0, -rad * 0.34, rad * 0.1, rad * 1.3, [[0, '#120a10'], [0.5, '#30122a'], [0.8, '#86407a'], [1, '#d3a9c8']]);
        g.beginPath(); g.arc(0, 0, rad, 0, L.TAU); g.fill();
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = Math.max(0.9, rad * 0.2);
        g.beginPath(); g.arc(0, 0, rad * 1.0, 0.16 * Math.PI, 0.84 * Math.PI); g.stroke();
        g.strokeStyle = 'rgba(34,12,30,0.5)'; g.lineWidth = Math.max(0.8, rad * 0.16);
        g.beginPath(); g.arc(0, 0, rad * 1.02, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
      });
    }
  }
  g.restore();

  // a breath of lens softness over everything, so the hairlines read as satin metal rather than pen strokes
  const fine = L.blurred(cnv, 0.7);
  g.globalAlpha = 0.6; g.drawImage(fine, 0, 0); g.globalAlpha = 1;
  // ── shallow depth of field: the face goes soft where it rolls toward the lens at the bottom of frame ──
  const soft = L.blurred(cnv, 2.2), sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.radial(sg, cx - X0, cy - Y0, R - 600, R - 330, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  sg.fillRect(0, 0, RW, RH);
  g.drawImage(soft, 0, 0);
  return { cnv, spec, X0, Y0, RHS };
}

/** flat rouge-purple paper: only a fine grain and a few fibres */
function buildBg() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#a3277f'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.06;
  g.drawImage(L.noiseTex(W, H, { seed: 's25bg', scale: 700, octaves: 2, res: 0.125 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const r = L.rng('s25fib');
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r() * W, y = r() * H, len = r.range(5, 26), an = r() * Math.PI;
    g.strokeStyle = r.chance(0.5) ? `rgba(255,190,235,${r.range(0.03, 0.08)})` : `rgba(70,8,52,${r.range(0.04, 0.09)})`;
    g.lineWidth = r.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-3, 3), y + Math.sin(an) * len * 0.5 + r.range(-3, 3), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(W, H, { seed: 251, amount: 0.2 }), 0, 0);
  g.globalAlpha = 0.3;
  g.drawImage(L.grainTex(W, H, { seed: 252, amount: 0.22, size: 2.5 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

export default {
  name: '银锭流银',
  tone: 'light',
  init(env) {
    const ing = buildIngot(env);
    const tmp = L.makeCanvas(W, ing.RHS), tg = tmp.getContext('2d');
    S = { bg: buildBg(), ingot: ing.cnv, spec: ing.spec, halo: L.blurred(ing.spec, 9), X0: ing.X0, Y0: ing.Y0, RHS: ing.RHS, tmp, tg };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.drawImage(S.bg, 0, 0);
    const rot = L.lerp(-0.0065, 0.0065, p);
    const place = (g, im) => { g.save(); g.translate(a.cx, a.cy); g.rotate(rot); g.translate(-a.cx, -a.cy); g.drawImage(im, S.X0, S.Y0); g.restore(); };
    // halation of the silver lip on the paper, then the ingot itself
    ctx.save(); ctx.globalAlpha = 0.26; place(ctx, S.halo); ctx.restore();
    place(ctx, S.ingot);
    // the silver reflection travelling along the lip
    const glint = (th, wide, k) => {
      const tg = S.tg, gp = a.pt(th, -12);
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, W, S.RHS);
      tg.translate(0, -S.Y0);
      place(tg, S.spec);
      tg.globalCompositeOperation = 'destination-in';
      tg.translate(gp.x, gp.y); tg.rotate(th); tg.scale(wide, 1);
      tg.fillStyle = L.radial(tg, 0, 0, 0, 90, [[0, `rgba(0,0,0,${k})`], [0.5, `rgba(0,0,0,${k * 0.7})`], [1, 'rgba(0,0,0,0)']]);
      tg.fillRect(-3000, -3000, 6000, 6000);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(S.tmp, 0, S.Y0); ctx.restore();
      L.glow(ctx, gp.x, gp.y + 6, 70, '#ffffff', 0.15 * k);
    };
    glint(L.lerp(-0.215, -0.085, p), 3.6, 1);
    glint(L.lerp(0.19, 0.275, p), 2.4, 0.7);
  },
};
