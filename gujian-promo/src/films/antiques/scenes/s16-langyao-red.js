// s16 — 郎窑红. Black-field macro of the mouth rim of a Langyao copper-red vessel, seen from just below the lip:
// the arc is the near edge of the rim. The glaze has run thin at the mouth and left a line of pale body showing
// (the "灯草口", a white lamp-wick lying on the arc); below it the ruby glass deepens, crazed and full of tiny bubbles,
// a wet highlight band runs across it, and lower down the glaze gathers into a thick rolled edge.
//
// Everything under the arc is shaded per pixel in init(): each pixel is mapped to (U = distance along the rim,
// s = distance down from the rim), a height field (orange-peel pebbling, bubbles, craze grooves, the glaze roll) tilts
// the wall's normal, and the tilted normal looks up a studio softbox. The key light is rendered three times at slightly
// different angles; draw() cross-fades them, so the highlight band creeps and the flecks twinkle while the surface
// slides along the arc.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ── allocation-free worley: squared distances wD1/wD2, vectors to the two nearest points, cell id ──
let wD1 = 0, wD2 = 0, wId = 0, wAx = 0, wAy = 0, wBx = 0, wBy = 0;
function worley(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0, ax = 0, ay = 0, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + 0.1 + 0.8 * ((h & 1023) / 1023) - x, dy = cy + 0.1 + 0.8 * (((h >>> 10) & 1023) / 1023) - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; bx = ax; by = ay; d1 = d; ax = dx; ay = dy; id = ((h >>> 20) & 1023) / 1023; }
    else if (d < d2) { d2 = d; bx = dx; by = dy; }
  }
  wD1 = d1; wD2 = d2; wId = id; wAx = ax; wAy = ay; wBx = bx; wBy = by;
}

// layout down the wall (px below the rim)
const TOP = 44;        // head-room above the crest for the lens bloom
const LIP = 12;        // the rounded lip
const FRONT = 258;     // depth of the thick glaze roll under the crest …
const TILT = 0.125;    // … which climbs toward the rim on the left and sinks out of frame on the right
const WR = 64;         // width of the roll's shoulder
const HR = 9;          // extra glaze height below the roll
const PEB = 26;        // orange-peel grain of the glass skin (noise period; the flecks come out ≈ 20–40 px)
const C1 = 230, C2 = 88; // craze: primary plates, and the finer cracks that stop at their borders
// wall profile: elevation of the surface normal above the view axis (radians)
const B0 = 0.47, K1 = 0.0005, K2 = 0.0011, SB = 300;
const baseBeta = (s) => (s < LIP ? 1.5 + (B0 - 1.5) * Math.pow(s / LIP, 0.8) : s < SB ? B0 - K1 * (s - LIP) : B0 - K1 * (SB - LIP) - K2 * (s - SB));
// key: a tall softbox standing upper left. Its lower edge sits just above the direction the smooth wall mirrors, so the
// glass skin only catches it on the up-and-left-facing side of each pebble → a field of solid wet flecks, not a white sheet.
// (lower edge, edge softness, upper edge, azimuth, azimuth spread, and how far it travels during the shot)
const BKL = 0.485, EK = 0.085, BKH = 0.9, PK = -0.1, SPH = 0.25, DB = 0.02, DP = 0.05;
const SKEY = 84;       // where the flecks are densest (px below the rim)
const BLO = -1.2, BSPAN = 3.0, NB = 2048;

function buildGlaze(env) {
  const T0 = performance.now(), TT = [];
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - TOP;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s16a'), nB = L.makeNoise('s16b');

  // 1) things that only depend on the position along the rim
  const UMAX = 1500, UT = UMAX * 2 + 1;
  const tRim = new Float32Array(UT), tFade = new Float32Array(UT), tFront = new Float32Array(UT);
  for (let k = 0; k < UT; k++) {
    const U = k - UMAX;
    // bare white lip: a thin, uneven wick — never a painted border
    tRim[k] = Math.max(3.2, 7.6 + 4.4 * nA.n2(U / 270, 3.1) + 2.3 * nA.n2(U / 62, 8.7) + 1.1 * nB.n2(U / 17, 1.9));
    tFade[k] = 17 + 9 * nB.n2(U / 210, 5.5);                                                        // how fast the red comes in below it
    tFront[k] = Math.max(96, FRONT + TILT * U + 52 * nA.n2(U / 700 + 0.6, 11.3) + 13 * nB.n2(U / 260, 2.2) + 3 * nB.n2(U / 95, 7.9));
  }

  // 2) slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const mk = () => new Float32Array(cw * ch);
  const cMot = mk(), cUnd = mk(), cFlow = mk(), cWx = mk(), cWy = mk(), cVis = mk(), cClu = mk();
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, s = R - rr, k = j * cw + i;
    cMot[k] = nA.fbm(U / 190, s / 150, 3, 2, 0.55);
    cFlow[k] = nB.fbm(U / 46 + 9, s / 520, 3);
    cUnd[k] = nA.n2(U / 74 + 40, s / 56 - 7);
    cWx[k] = nB.n2(U / 170 + 5, s / 170); cWy[k] = nB.n2(U / 170 - 31, s / 170 + 19);
    cVis[k] = nB.n2(U / 310 + 3.3, s / 310 + 8.1);      // where the craze shows and where it sinks out of sight
    cClu[k] = nA.n2(U / 120 - 12.4, s / 120 + 4.2);     // bubbles come in swarms
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 3) height field + optical depth of the glaze, at full resolution
  const Hh = new Float32Array(N), Tau = new Float32Array(N), Mu = new Float32Array(N), Bub = new Float32Array(N), Gl = new Float32Array(N), Al = new Float32Array(N);
  const Gid = new Uint8Array(N), Thk = new Uint8Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 2.5) continue;
      Al[k] = rr > R + 0.5 ? 0 : rr < R - 0.5 ? 1 : R + 0.5 - rr;
      const s = rr < R ? R - rr : 0;
      const U = Math.atan2(ddx, ddy) * R;
      let ku = (U + UMAX + 0.5) | 0; ku = ku < 0 ? 0 : ku >= UT ? UT - 1 : ku;
      const d = s - tFront[ku];
      // the roll: a rounded shoulder with a soft crease (no knife-cut line where it starts)
      let P = 0; if (d > 0) { const x = d / WR, xs = (x * x) / (x + 0.12); P = xs < 1 ? 1 - Math.pow(1 - xs, 2.2) : 1; }
      const streak = nB.n2(U / 12.5, s / 320 + 3) + 0.4 * nA.n2(U / 5.2 + 7, s / 240);   // 牛毛纹: hair-fine runs down the wall
      const mot = bil(cMot, i, j), fl = bil(cFlow, i, j), wx = bil(cWx, i, j), wy = bil(cWy, i, j);
      const rimT = sstep(0, 1, (s - tRim[ku] - 2.2 * (streak + 1) - 3.4 * (fl + 0.7)) / tFade[ku]);   // 0 = bare lip, 1 = full glaze
      let h = HR * P, tau = 0, mu = 1, bub = 0;
      const thickK = sstep(-8, 30, d);
      Thk[k] = thickK * 255;
      if (rimT > 0.01) {
        const amp = rimT * (1 - 0.9 * thickK) * (0.3 + 0.7 * sstep(12, 72, s));
        // the glass skin: slow liquid undulation under a pebbled orange peel — this is what breaks the key light into flecks
        worley(U / 26 + 0.5 * wx, s / 26 + 0.5 * wy, 1013);
        const dome = Math.exp(-3.2 * wD1) * (0.2 + 1.0 * wId * wId);   // round pebbles, a few tall, most of them low
        h += amp * (0.9 * bil(cUnd, i, j)
          + 0.9 * nA.n2(U / PEB + 0.4 * wx, s / PEB + 9 + 0.4 * wy)
          + 0.07 * nB.n2(U / 7 + 40, s / 7)
          + 2.3 * dome);
        // bubbles in the glass, in swarms, no two the same size
        worley(U / 15 + 7.7, s / 15 + 3.3, 2027);
        if (wId < 0.09 + 0.44 * sstep(-0.25, 0.6, bil(cClu, i, j) + 0.5 * mot)) {
          const f = (wId * 37.7) % 1, rb = 1.2 + 3.6 * f * f, q2 = (wD1 * 225) / (rb * rb);
          if (q2 < 1) {
            const dm = 1 - q2; h += 0.3 * rb * dm * rimT; bub = dm * rimT;
            // every bubble is a tiny mirror ball: a pin-point of the key light sits on its upper-left shoulder
            const gr = Math.max(0.85, 0.5 * rb), gx = -wAx * 15 + 0.3 * rb, gy = -wAy * 15 + 0.34 * rb, g2 = (gx * gx + gy * gy) / (gr * gr);
            if (g2 < 1) { Gl[k] = (1 - g2) * rimT; Gid[k] = (wId * 9973) & 255; }
          }
        }
        // crazing: tall plates following the run of the glaze, finer cracks inside some of them that stop dead at the border;
        // the network fades in and out of sight instead of netting the whole wall
        const vis = (0.45 + 0.55 * sstep(-0.3, 0.35, bil(cVis, i, j))) * (1 - 0.5 * thickK);
        worley((U + 26 * wx) / C1, (s + 26 * wy) / (C1 * 1.45), 3041);
        const id1 = wId;
        const bd1 = ((wD2 - wD1) / (2 * Math.sqrt((wBx - wAx) * (wBx - wAx) + (wBy - wAy) * (wBy - wAy)) + 1e-6)) * C1;
        let cr1 = 1 - sstep(0.2, 2.3, bd1), cs1 = 1 - sstep(0.4, 1.9, bd1), cr2 = 0, cs2 = 0;
        if (id1 < 0.58) {
          worley((U + 9 * wy) / C2 + id1 * 37.1, (s - 9 * wx) / (C2 * 1.2) + id1 * 91.7, 4099);
          const bd2 = ((wD2 - wD1) / (2 * Math.sqrt((wBx - wAx) * (wBx - wAx) + (wBy - wAy) * (wBy - wAy)) + 1e-6)) * C2;
          cr2 = 1 - sstep(0.2, 1.6, bd2); cs2 = 1 - sstep(0.3, 1.1, bd2);
        }
        h -= (0.3 * cr1 + 0.14 * cr2) * rimT * vis;
        mu *= (1 - 0.36 * cs1 * rimT * vis) * (1 - 0.2 * cs2 * rimT * vis);
        const thin = 1 - 0.65 * thickK;
        tau = rimT * (0.43 + 0.17 * sstep(16, 200, s) + 0.13 * mot + 0.11 * fl * thin + 0.06 * streak * thin + 0.04 * (id1 - 0.5))
          + 0.1 * P + 0.3 * sstep(0, 380, d);
        if (d > -16) {
          if (d > 0) { const e = (d - 24) / 17; tau -= 0.17 * Math.exp(-e * e); }   // light gathered inside the roll's shoulder
          const e2 = (d + 1) / 7; mu *= 1 - 0.26 * Math.exp(-e2 * e2);              // soft contact shadow where thin glaze meets the roll
        }
      }
      Hh[k] = h; Tau[k] = tau; Mu[k] = mu; Bub[k] = bub;
    }
  }

  TT.push(performance.now() - T0);
  // 4) a scatter of larger bubbles, mostly down in the thick glaze
  const rb = L.rng('s16bub');
  const span = a.span(PAD + 20);
  for (let n = 0; n < 84; n++) {
    const th0 = rb.range(-span, span), deep = rb.chance(0.78);
    let ku = (th0 * R + UMAX + 0.5) | 0; ku = ku < 0 ? 0 : ku >= UT ? UT - 1 : ku;
    const s0 = deep ? tFront[ku] + 20 + Math.pow(rb(), 1.3) * 330 : rb.range(46, Math.max(60, tFront[ku] - 16));
    const rp = deep ? rb.range(3.2, 7.4) * (rb.chance(0.12) ? 1.6 : 1) : rb.range(2.4, 4.6);
    const rr0 = R - s0, px = cx + rr0 * Math.sin(th0) - X0, py = cy - rr0 * Math.cos(th0) - Y0, e = Math.ceil(rp) + 1;
    for (let j = Math.max(1, Math.floor(py - e)); j <= Math.min(RH - 2, Math.ceil(py + e)); j++) {
      for (let i = Math.max(1, Math.floor(px - e)); i <= Math.min(RW - 2, Math.ceil(px + e)); i++) {
        const k = j * RW + i; if (Al[k] <= 0) continue;
        const q2 = ((i - px) * (i - px) + (j - py) * (j - py)) / (rp * rp);
        if (q2 >= 1) continue;
        const q = Math.sqrt(q2);
        Hh[k] += 0.45 * rp * (1 - q2);
        Mu[k] *= 1 - 0.34 * sstep(0.6, 0.92, q);
        Bub[k] = Math.max(Bub[k], 0.85 * (1 - q2));
        const gx = i - px + 0.32 * rp, gy = j - py + 0.36 * rp, g2 = (gx * gx + gy * gy) / (0.2 * rp * rp);
        if (g2 < 1) { Gl[k] = Math.max(Gl[k], 1 - g2); Gid[k] = (n * 53) & 255; }
      }
    }
  }

  // 5) lookup tables: glaze colour by optical depth; lights by normal elevation
  const TMAX = 1.3, NC = 1024;
  const ramp = L.makeRamp([[0, '#f1ead8'], [0.04, '#f4dfc4'], [0.085, '#f7b994'], [0.13, '#ff8362'], [0.185, '#ff5a4d'], [0.25, '#ee3236'],
    [0.345, '#d41b25'], [0.445, '#b3121d'], [0.57, '#8f0b16'], [0.69, '#6a0710'], [0.81, '#4a0509'], [1, '#2a0306']]);
  const CL = new Float32Array(NC * 3);
  for (let i = 0; i < NC; i++) { const c = ramp(i / (NC - 1)); CL[i * 3] = c[0]; CL[i * 3 + 1] = c[1]; CL[i * 3 + 2] = c[2]; }
  const box = (c, w, e, b) => sstep(c - w - e, c - w + e, b) * (1 - sstep(c + w - e, c + w + e, b));
  const KL = [-1, 0, 1].map((v) => {
    const t = new Float32Array(NB);
    for (let i = 0; i < NB; i++) { const b = BLO + (i / (NB - 1)) * BSPAN, lo = BKL - v * DB; t[i] = sstep(lo, lo + EK, b) * (1 - sstep(BKH, BKH + 0.12, b)); }
    return t;
  });
  const FL = new Float32Array(NB), SK = new Float32Array(NB);
  for (let i = 0; i < NB; i++) {
    const b = BLO + (i / (NB - 1)) * BSPAN;
    FL[i] = 0.13 * box(0.2, 0.1, 0.12, b);   // a big dim window low in the room → a soft sheen lying in the thick glass
    SK[i] = 0.45 * sstep(0.62, 1.25, b);         // grazing light from above → the lip and the tops of bubbles
  }
  const SL = new Uint8ClampedArray(256 * 3);   // specular intensity → warm white (orange-red while still faint)
  for (let i = 0; i < 256; i++) { const v = i / 255; SL[i * 3] = 255 * v; SL[i * 3 + 1] = 246 * Math.pow(v, 1.45); SL[i * 3 + 2] = 236 * Math.pow(v, 1.7); }

  // 6) shade
  const img = new ImageData(RW, RH), d = img.data;
  const sp = [0, 1, 2].map(() => { const im = new ImageData(RW, RH); new Uint32Array(im.data.buffer).fill(0xff000000); return im; });
  const KR = 1.05, bScale = (NB - 1) / BSPAN;
  for (let j = 1; j < RH - 1; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, al = Al[k];
      if (al <= 0) continue;
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), sn = ddx / rr, cs = ddy / rr;
      const s = rr < R ? R - rr : 0;
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      const ht = hx * cs + hy * sn, hv = -hx * sn + hy * cs;      // slope along the rim / down the wall
      const mot = bil(cMot, i, j);
      const beta = baseBeta(s) + 0.96 * hv + 0.26 * ht + 0.07 * mot, phi = ddx / 3000 - ht;
      let bi = ((beta - BLO) * bScale) | 0; bi = bi < 0 ? 0 : bi >= NB ? NB - 1 : bi;
      // body colour
      let t = Tau[k] / TMAX; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const li = ((t * (NC - 1)) | 0) * 3;
      let cr = CL[li], cg = CL[li + 1], cb = CL[li + 2];
      const bub = Bub[k];
      if (bub > 0) { const m = 0.24 * bub; cr += (255 - cr) * m; cg += (128 - cg) * m; cb += (112 - cb) * m; }
      let rel = (hv * 0.85 + ht * 0.5) * KR; rel = rel < -0.5 ? -0.5 : rel > 0.7 ? 0.7 : rel;
      const glazed = Tau[k] > 0.3 ? 1 : Tau[k] / 0.3;
      const thick = Thk[k] / 255;
      // the key stands upper left: the wall falls off toward the right and down into the thick glass
      const slow = (1.0 - 0.2 * (ddx / 1000)) * (1 - 0.37 * sstep(230, 620, s)) * (1 - 0.09 * sstep(4, LIP + 3, s) * (1 - glazed));
      const sh = slow * (1 + rel * glazed) * Mu[k];
      cr *= sh; cg *= sh; cb *= sh;
      const ff = FL[bi] * glazed, sk = SK[bi] * (1 - 0.8 * sstep(22, 64, s) * (1 - bub));
      cr += 255 * ff + 255 * sk; cg += 46 * ff + 236 * sk; cb += 44 * ff + 218 * sk;
      const o = k * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = al * 255;
      // key light, three positions; the bubbles' pin-points take turns flaring as it moves
      const gl = Gl[k], az0 = (ddx / 3000 - PK) / SPH;
      const ge = gl > 0 ? gl * (0.25 + 0.75 * Math.exp(-((s - SKEY) / 120) * ((s - SKEY) / 120))) * (0.35 + 0.65 * Math.exp(-az0 * az0)) : 0;
      const kAtt = (0.35 + 0.65 * glazed) * (1 - 0.5 * thick);
      for (let v = 0; v < 3; v++) {
        const kv = KL[v][bi];
        let I = 0;
        if (kv >= 0.004) { const e = (phi - (PK + (v - 1) * DP)) / SPH; I = kv * (0.2 + 0.7 * Math.exp(-e * e)) * kAtt; }
        if (ge > 0) { const ph = Math.cos((Gid[k] / 255 + v * 0.31) * L.TAU), g = ge * (0.2 + 0.8 * ph * ph); if (g > I) I = g; }
        if (I < 0.004) continue;
        const si = (I >= 1 ? 255 : (I * 255) | 0) * 3, q = sp[v].data;
        q[o] = SL[si]; q[o + 1] = SL[si + 1]; q[o + 2] = SL[si + 2];
      }
    }
  }
  TT.push(performance.now() - T0);
  const toCanvas = (im) => { const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(im, 0, 0); return c; };
  const body = toCanvas(img);

  // 7) lens: a macro lens focused just under the crest — the wall melts out of focus toward both sides and down the frame
  const FX = cx - 70 - X0, FY = a.crestY + 96 - Y0;
  const ring = (r0, r1) => {
    const m = L.makeCanvas(RW, RH), g = m.getContext('2d');
    g.translate(FX, FY); g.scale(1.28, 0.6);
    g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(-4000, -4000, 8000, 8000);
    return m;
  };
  // wide blurs are done at half size (nobody can tell, and they cost a quarter)
  const blurHalf = (c, px) => {
    const hw = Math.ceil(RW / 2), hh = Math.ceil(RH / 2), sm = L.makeCanvas(hw, hh);
    sm.getContext('2d').drawImage(c, 0, 0, hw, hh);
    const sb = L.blurred(sm, px / 2), out = L.makeCanvas(RW, RH), g = out.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(sb, 0, 0, hw * 2, hh * 2);
    return out;
  };
  const LENS = [[ring(350, 770), 2.3], [ring(720, 1180), 6]];
  const dof = (c) => {
    const out = L.makeCanvas(RW, RH), g = out.getContext('2d');
    g.drawImage(c, 0, 0);
    for (const [m, px] of LENS) {
      const b = px > 4 ? blurHalf(c, px) : L.blurred(c, px), bg = b.getContext('2d');
      bg.globalCompositeOperation = 'destination-in'; bg.drawImage(m, 0, 0);
      g.globalCompositeOperation = 'destination-out'; g.drawImage(m, 0, 0);
      g.globalCompositeOperation = 'lighter'; g.drawImage(b, 0, 0);
    }
    g.globalCompositeOperation = 'source-over';
    return out;
  };
  // highlights: sharp core + a tight halo + a wide ruby glow (light scattered inside the glass, back off the white body)
  const spec = sp.map((im) => {
    const sharp = toCanvas(im);
    const out = L.makeCanvas(RW, RH), g = out.getContext('2d');
    const glowC = blurHalf(sharp, 17), gg = glowC.getContext('2d');
    gg.globalCompositeOperation = 'multiply'; gg.fillStyle = '#ff3526'; gg.fillRect(0, 0, RW, RH);
    g.fillStyle = '#000'; g.fillRect(0, 0, RW, RH);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.65; g.drawImage(glowC, 0, 0);
    g.globalAlpha = 0.45; g.drawImage(L.blurred(sharp, 2.6), 0, 0);
    g.globalAlpha = 1; g.drawImage(sharp, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(body, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return dof(out);
  });
  // the body, with a breath of lens bloom spilling off the pale lip onto the black
  const bodyD = dof(body);
  const fin = L.makeCanvas(RW, RH), fg = fin.getContext('2d');
  fg.globalAlpha = 0.34; fg.drawImage(blurHalf(bodyD, 11), 0, 0);
  fg.globalAlpha = 1; fg.drawImage(bodyD, 0, 0);
  TT.push(performance.now() - T0); console.warn('s16 timing ' + TT.map((v) => v | 0).join(' '));
  return { body: fin, spec, X0, Y0 };
}

export default {
  name: '郎窑红',
  tone: 'light',
  init(env) {
    const G = buildGlaze(env);
    // pin-point glints among the flecks of the highlight band; each flares once as the light creeps over it
    const rg = L.rng('s16glint'), glints = [];
    for (let i = 0; i < 16; i++) glints.push({ th: rg.range(-0.4, 0.34), dr: -rg.range(64, 168), ph: rg(), k: rg.range(0.5, 1) });
    S = { ...G, glints };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#040404'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.0055, 0.0055, p);
    L.cam(ctx, env, { rot }, () => {
      ctx.drawImage(S.body, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'lighter';
      const q = L.clamp(p) * 2, i0 = q < 1 ? 0 : 1, f = q < 1 ? q : q - 1;
      if (f < 0.999) { ctx.globalAlpha = 1 - f; ctx.drawImage(S.spec[i0], S.X0, S.Y0); }
      if (f > 0.001) { ctx.globalAlpha = f; ctx.drawImage(S.spec[i0 + 1], S.X0, S.Y0); }
    });
    // a soft hot patch gliding along the highlight band
    ctx.save(); a.clipBelow(ctx, -14); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, L.lerp(-0.17, -0.07, p), -112, () => {
      ctx.scale(3.6, 1);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 120, [[0, 'rgba(255,96,70,0.34)'], [0.45, 'rgba(255,60,44,0.13)'], [1, 'rgba(255,40,30,0)']]);
      ctx.fillRect(-125, -125, 250, 250);
    });
    ctx.restore();
    // pin-point glints
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const g of S.glints) {
      const tw = Math.pow(Math.max(0, Math.cos((p * 0.9 + g.ph) * L.TAU)), 3) * g.k;
      if (tw < 0.04) continue;
      a.at(ctx, g.th + rot, g.dr, () => {
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, 20, [[0, `rgba(255,250,240,${0.95 * tw})`], [0.12, `rgba(255,214,190,${0.5 * tw})`], [0.45, `rgba(255,90,70,${0.12 * tw})`], [1, 'rgba(255,60,40,0)']]);
        ctx.fillRect(-20, -20, 40, 40);
      });
    }
    ctx.restore();
  },
};
