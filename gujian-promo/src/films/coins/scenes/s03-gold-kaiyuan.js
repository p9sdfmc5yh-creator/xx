// s03 — 金开元通宝微距. "A golden planet on black": the arc is the outer edge of a gold 開元通寶 seen face-on in extreme macro.
// Hugging the arc runs the raised outer rim (外郭); inside it the flat field (钱肉) falls from bright gold into deep orange gold
// like the lit side of a sphere. Sparse sand holes, handling hairlines, the faintest concentric polishing lines, and — just
// rising over the bottom of frame — the tops of the two door-leaves of 開 (the top character of the legend).
//
// Everything under the arc is a height field shaded per pixel in init(): an analytic rim profile (rounded shoulder → domed
// top → inner wall with a fillet at its foot) plus a micro relief that is *drawn*, not noise — irregular sand holes, shallow
// casting dimples, pin-head beads, hairline scratches cut as grooves, the strokes of the legend with their rolled-over
// shoulders and faintly crowned tops. It is lit from above the frame: soft shadows are found by marching every pixel toward
// the light; hollows gather a darker, redder tone while proud edges are rubbed bright (the patina logic of handled gold);
// walls that face away pick up the glow of the lit field below them. The result is looked up in a gold ramp that stays
// saturated all the way down (shadows go red-orange, never grey). A second "sheen" layer stores how strongly each pixel
// answers a moving light; draw() reveals it through a soft window that travels along the rim.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 48;            // the camera only pushes in (zoom ≥ 1), so a small safety margin is enough
const RIM = 168;           // foot of the raised outer rim, px below the arc
const EDGE = 30;           // rounded outer shoulder of the rim
const W0 = 150, W1 = 174;  // the rim's inner wall drops to the field between these two depths
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const unit = (x, y, z) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; };

const [KX, KY, KZ] = unit(0.72, -0.5, 0.48);     // kicker: low on the right, red-orange (only steep right-facing slopes see it)
const [LX, LY, LZ] = unit(-0.06, -0.75, 0.66);   // key light: high above the frame, a touch to the left, leaning toward the lens
const [HX, HY, HZ] = unit(LX, LY, LZ + 1);       // its half vector
const [BX, BY, BZ] = unit(0.05, 0.85, 0.53);     // bounce: the lit field throws a warm glow back up at whatever faces it

/** slope of the rim profile along the inward radius (d = depth below the arc); > 0 = rising toward the coin's centre.
 *  E = how far in the rounded shoulder reaches (wear has made it a little broader here, a little tighter there) */
function macroSlope(d, E = EDGE) {
  if (d < 0) d = 0;
  if (d < E) return 0.1 + 1.5 * Math.pow(1 - d / E, 1.7);
  if (d < W0) return L.lerp(0.1, -0.16, (d - E) / (W0 - E));
  // the wall: a worn, fairly tight corner at the top, steepest a third of the way down, a longer fillet into the field
  if (d < W1) { const t = (d - W0) / (W1 - W0), s = Math.sin(Math.PI * Math.pow(t, 0.8)); return -0.16 * (1 - t) - 1.7 * s * s; }
  return 0;
}

/** piecewise-smooth 1D curve through [[x, v], …] */
function curve(pts) {
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return L.lerp(pts[i - 1][1], pts[i][1], sstep(pts[i - 1][0], pts[i][0], x));
    return pts[pts.length - 1][1];
  };
}

// the tops of 開: the two leaves of 門 (丨 + ㇕ on the left, 丨 + ㇆ on the right). Only their upper ~70 px ever enter the frame.
const GLY = { yT: 1010, sw: 66, A: 400, G: 46, GH: 11.5, GE: 14, CR: 2.6 };
function glyphBoxes(cx) {
  const { yT, sw, A, G } = GLY, hw = sw * 0.8, far = H + PAD + 300;
  return [
    [cx - A, yT - 4, cx - A + sw, far], [cx - A, yT, cx - G, yT + hw], [cx - G - sw * 0.94, yT, cx - G, yT + 236], [cx - A, yT + 150, cx - G, yT + 150 + hw * 0.85],
    [cx + G, yT - 3, cx + G + sw * 0.94, yT + 236], [cx + G, yT, cx + A, yT + hw], [cx + A - sw, yT, cx + A, far], [cx + G, yT + 150, cx + A, yT + 150 + hw * 0.85],
  ];
}

/** the whole coin face as pixels (pure arithmetic, no canvas): { RW, RH, X0, Y0, rgba, sheen } */
function shadeCoin(a) {
  const R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('c03a'), nB = L.makeNoise('c03b'), nC = L.makeNoise('c03c');

  // gold ramp, indexed by intensity 0 … 1.5
  const IMAX = 1.5, NL = 1024;
  const rampFn = L.makeRamp([[0, '#070100'], [0.07, '#300802'], [0.15, '#681a04'], [0.25, '#96380a'], [0.4, '#b5610c'], [0.54, '#dc7e10'],
    [0.7, '#f2a51e'], [0.84, '#ffc23c'], [1.0, '#ffd76a'], [1.16, '#ffe088'], [1.32, '#ffe9a6'], [1.5, '#fff3c8']].map(([t, c]) => [t / IMAX, hex(c)]));
  const RAMP = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = rampFn(i / (NL - 1)); RAMP[i * 3] = c[0]; RAMP[i * 3 + 1] = c[1]; RAMP[i * 3 + 2] = c[2]; }

  // "planet" falloff: brightest on the rim, deepening toward the bottom of frame
  const fd = curve([[0, 1.3], [90, 1.27], [RIM, 1.17], [240, 1.05], [340, 0.83], [450, 0.63], [540, 0.5], [720, 0.4]]);
  const FD = new Float32Array(800); for (let i = 0; i < 800; i++) FD[i] = fd(i);
  // the cast rim's inner edge is never a perfect circle; nor is the thread of light on its corner even
  const UM = 1500, WOB = new Float32Array(UM * 2 + 1), THR = new Float32Array(UM * 2 + 1), EDG = new Float32Array(UM * 2 + 1), BNC = new Float32Array(UM * 2 + 1);
  for (let i = 0; i <= UM * 2; i++) {
    const u = i - UM;
    WOB[i] = 1.5 * nA.n2(u / 190, 1.7) + 0.45 * nB.n2(u / 47, 5.1);
    THR[i] = 0.16 * (1 + 0.4 * nC.n2(u / 120, 3.3) + 0.22 * nC.n2(u / 27, 8.1));
    EDG[i] = EDGE * (1 + 0.11 * nC.n2(u / 430, 11.3) + 0.035 * nC.n2(u / 140, 4.4));
    BNC[i] = 0.088 * (1 + 0.28 * nC.n2(u / 150, 21.7) + 0.07 * nC.n2(u / 46, 15.2));
  }
  // integrated rim profile (height above the outer edge), 0.25 px steps
  const MHS = 4, MHN = 220 * MHS, MH = new Float32Array(MHN + 1);
  for (let i = 1; i <= MHN; i++) MH[i] = MH[i - 1] + macroSlope((i - 0.5) / MHS) / MHS;
  const mh = (d) => { if (d <= 0) return 1.6 * d; const f = d * MHS; if (f >= MHN) return MH[MHN]; const i = f | 0; return MH[i] + (MH[i + 1] - MH[i]) * (f - i); };
  // slow unevenness of the metal on a coarse grid
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, cMed = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const uu = Math.atan2(ddx, ddy) * R, dq = R - rr;
    cMed[j * cw + i] = nA.fbm(uu / 330 + 11, dq / 210 - 4, 3) + 0.55 * nB.fbm(uu / 90 - 5, dq / 70 + 8, 2) + 0.35 * nB.n2(uu / 2600 + 2, dq / 34);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  const Dd = new Float32Array(N), Uu = new Float32Array(N), Dw = new Float32Array(N), Hh = new Float32Array(N), St = new Float32Array(N);
  const Cv = new Float32Array(N), Gh = new Float32Array(N), Sc = new Float32Array(N), Gl = new Float32Array(N);

  // 1) polar coordinates
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      Dd[k] = d; Dw[k] = d;
      if (d < -1.5) continue;
      const u = Math.atan2(ddx, ddy) * R; Uu[k] = u;
      // the rim's inner wall wanders a little; the outer edge is exact
      Dw[k] = d + WOB[Math.max(0, Math.min(UM * 2, Math.round(u) + UM))] * sstep(RIM - 70, RIM - 30, d);
    }
  }

  // 2) the raised strokes at the bottom of frame: a signed distance to the union of rounded bars, turned into a worn
  //    section (crisp at the foot, a shoulder that rolls over, a top that is very slightly crowned — not a punched-out block)
  const boxes = glyphBoxes(cx), { GH, GE, CR } = GLY, RC = 17;
  const PGN = 256, PG = new Float32Array(PGN + 1);
  { let acc = 0; for (let i = 1; i <= PGN; i++) { const t = (i - 0.5) / PGN; acc += Math.pow(t, 0.5) * Math.pow(1 - t, 1.2); PG[i] = acc; } for (let i = 1; i <= PGN; i++) PG[i] /= acc; }
  const GhH = new Float32Array(N);
  for (let j = Math.max(0, GLY.yT - 40 - Y0); j < RH; j++) {
    const y = Y0 + j;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i;
      if (x < cx - GLY.A - 40 || x > cx + GLY.A + 40) continue;
      let sd = 1e9;
      for (const b of boxes) {
        const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
        const qx = Math.abs(x - mx) - ((b[2] - b[0]) / 2 - RC), qy = Math.abs(y - my) - ((b[3] - b[1]) / 2 - RC);
        const s = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RC;
        const hk = Math.max(9 - Math.abs(sd - s), 0) / 9;       // smooth union: inside corners get a fillet
        sd = Math.min(sd, s) - hk * hk * 9 * 0.25;
      }
      if (sd > 8) continue;
      sd += 1.1 * nA.n2(x / 150 + 3, y / 150) + 0.55 * nA.n2(x / 46 - 7, y / 46) + 0.2 * nB.n2(x / 15, y / 15 + 9);
      const ge = GE * (1 + 0.2 * nB.n2(x / 170 + 31, y / 170)), gh = GH * (1 + 0.08 * nA.n2(x / 260 + 5, y / 260 - 2));
      const tf = L.clamp(-sd / ge) * PGN, ti = tf | 0, p = ti >= PGN ? 1 : PG[ti] + (PG[ti + 1] - PG[ti]) * (tf - ti);
      const k = j * RW + i; Gh[k] = p; GhH[k] = gh * p + CR * sstep(0, 30, -sd);
    }
  }

  // 3) cast skin + polishing lines
  for (let k = 0; k < N; k++) {
    const d = Dd[k]; if (d < -1.5) continue;
    const u = Uu[k];
    // "orange peel": quieter on the rim and on the stroke tops, which handling has burnished
    const onRim = 1 - sstep(RIM - 30, RIM + 10, d);
    const peel = 0.5 * nA.n2(u / 13, d / 13) + 0.16 * nB.n2(u / 5.2 + 40, d / 5.2) + 0.3 * nB.n2(u / 41 - 8, d / 41 + 3);
    Hh[k] = peel * L.lerp(0.15, 0.08, onRim) * (1 - 0.6 * Gh[k]) + GhH[k];
    // concentric polishing lines: long along the arc, a pixel or two across
    St[k] = 0.6 * nB.n2(u / 560 + 9, d / 1.9) + 0.4 * nA.n2(u / 1500 - 3, d / 4.9 + 70);
  }

  // 4) stamped relief
  const toPx = (u, d) => { const th = u / R, rr = R - d; return [cx + rr * Math.sin(th) - X0, cy - rr * Math.cos(th) - Y0]; };
  /** dent (depth > 0) or bump (depth < 0) with an optional lobed outline; `dark` = how black its bottom is */
  const stamp = (px, py, rx, ry, ang, depth, o = {}) => {
    const { dark = 0, pw = 1.4, l2 = 0, p2 = 0, l3 = 0, p3 = 0, minD = 2 } = o;
    const lob = l2 !== 0 || l3 !== 0, e = Math.ceil(Math.max(rx, ry) * (1 + Math.abs(l2) + Math.abs(l3))) + 2, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let j = Math.max(1, Math.floor(py - e)); j <= Math.min(RH - 2, Math.ceil(py + e)); j++) {
      for (let i = Math.max(1, Math.floor(px - e)); i <= Math.min(RW - 2, Math.ceil(px + e)); i++) {
        const k = j * RW + i; if (Dd[k] < minD) continue;
        const dx = i - px, dy = j - py, lx = (dx * ca + dy * sa) / rx, ly = (-dx * sa + dy * ca) / ry;
        let q = Math.sqrt(lx * lx + ly * ly);
        if (lob && q > 1e-3) { const ph = Math.atan2(ly, lx); q /= 1 + l2 * Math.cos(2 * ph + p2) + l3 * Math.cos(3 * ph + p3); }
        if (q >= 1) continue;
        Hh[k] -= depth * Math.pow(1 - q * q, pw);
        if (dark > 0) { const c = dark * (1 - sstep(0.5, 1, q)); if (c > Cv[k]) Cv[k] = c; }
      }
    }
  };
  /** a fine line laid into `buf` (max-blended gaussian tube along a gently bent path); zone 0 = field, 1 = rim top, 2 = anywhere */
  const line = (buf, x0, y0, x1, y1, bend, sig, amp, zone, seed) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 2) return;
    const mx = (x0 + x1) / 2 - (dy / len) * bend, my = (y0 + y1) / 2 + (dx / len) * bend;
    const n = Math.ceil(len / 0.7), rad = Math.ceil(sig * 2.6), i2 = 1 / (2 * sig * sig);
    for (let s = 0; s <= n; s++) {
      const t = s / n, mt = 1 - t, px = mt * mt * x0 + 2 * mt * t * mx + t * t * x1, py = mt * mt * y0 + 2 * mt * t * my + t * t * y1;
      // bites in quickly, feathers out; skips a little along the way
      const dp = amp * Math.min(1, t * 7, mt * 4) * (seed < 0 ? 1 : 0.64 + 0.36 * nC.n2(seed + (t * len) / 24, seed * 1.7));
      if (dp < 0.004) continue;
      const ic = Math.round(px), jc = Math.round(py);
      for (let j = Math.max(0, jc - rad); j <= Math.min(RH - 1, jc + rad); j++) {
        for (let i = Math.max(0, ic - rad); i <= Math.min(RW - 1, ic + rad); i++) {
          const k = j * RW + i, ex = i - px, ey = j - py;
          let v = dp * Math.exp(-(ex * ex + ey * ey) * i2);
          if (zone === 0) v *= L.clamp((Dd[k] - (W1 + 2)) / 12);
          else if (zone === 1) v *= L.clamp((Dd[k] - 16) / 14) * L.clamp((W0 - 4 - Dd[k]) / 8);
          if (v > buf[k]) buf[k] = v;
        }
      }
    }
  };

  // sand holes (砂眼): each its own shape — ovals, beans, rounded triangles — dark at the bottom, never a printed dot
  const r = L.rng('c03pits'), rq = L.rng('c03pitshape');
  const pits = [];
  for (let n = 0; n < 58; n++) pits.push([r.range(-1090, 1090), 14 + Math.pow(r(), 0.9) * 540, r.chance(0.13) ? r.range(4.6, 7.6) : r.range(1.3, 3.5)]);
  for (const [cu, cd] of [[-610, 318], [352, 246], [760, 402]]) for (let n = 0; n < 6; n++) pits.push([cu + r.gauss() * 26, cd + r.gauss() * 17, r.range(1.1, 2.6)]);
  pits.push([214, 338, 9.5], [-388, 246, 7]);
  for (const [u0, d0, rp0] of pits) {
    if (d0 > W0 - 12 && d0 < W1 + 10) continue;               // keep the rim's inner wall clean
    const [px, py] = toPx(u0, d0), big = rp0 > 4.4, rp = Math.max(1.75, rp0 * (big ? 0.92 : 1));
    stamp(px, py, rp, rp * rq.range(0.66, 1.08), rq.range(0, Math.PI), rp * rq.range(0.5, 0.9), {
      dark: big ? rq.range(0.86, 0.95) : rq.range(0.55, 0.93), pw: rq.range(1.2, 1.7),
      l2: rq.range(0.05, big ? 0.3 : 0.2), p2: rq.range(0, L.TAU), l3: rq.range(0, big ? 0.16 : 0.1), p3: rq.range(0, L.TAU),
    });
    // the larger holes break down at one side: a smaller, shallower bite out of the lip
    if (big) { const an = rq.range(0, L.TAU), rb = rp * rq.range(0.42, 0.6); stamp(px + Math.cos(an) * rp * 0.8, py + Math.sin(an) * rp * 0.62, rb, rb * 0.8, an, rb * 0.5, { dark: 0.7, pw: 1.5 }); }
  }
  const rk = L.rng('c03knock');
  for (let n = 0; n < 6; n++) {                                // knocks: short, shallow dents that only the light gives away
    const [px, py] = toPx(rk.range(-1000, 1000), rk.chance(0.35) ? rk.range(44, W0 - 40) : rk.range(W1 + 40, 500));
    stamp(px, py, rk.range(6, 12), rk.range(2.6, 4), rk.range(0, Math.PI), rk.range(0.5, 0.9), { dark: rk.range(0, 0.1), pw: 1.6 });
  }
  for (let n = 0; n < 18; n++) {                               // pin-head casting beads (raised)
    const [px, py] = toPx(rk.range(-1080, 1080), 20 + rk() * 520), rb = rk.range(1.7, 2.8);
    stamp(px, py, rb, rb * rk.range(0.8, 1), rk.range(0, Math.PI), -rb * 0.42, { pw: 1.3 });
  }
  for (let n = 0; n < 190; n++) {                              // casting dimples: broad and barely there — they only bend the light
    const onRim = n >= 150, [px, py] = toPx(rk.range(-1080, 1080), onRim ? rk.range(40, W0 - 22) : rk.range(W1 + 26, 560));
    const rd = onRim ? rk.range(8, 20) : rk.range(6, 18);
    stamp(px, py, rd, rd * rk.range(0.6, 1), rk.range(0, Math.PI), (onRim ? rk.range(0.1, 0.24) : rk.range(0.16, 0.46)) * (rk.chance(0.25) ? -0.6 : 1), { pw: 2, l2: rk.range(0, 0.2), p2: rk.range(0, L.TAU) });
  }
  for (const u0 of [-812, -296, 118, 506, 884]) {              // the inner corner of the rim has taken a few knocks
    const uu = u0 + rk.range(-40, 40), [px, py] = toPx(uu, W0 + rk.range(-2, 3));
    stamp(px, py, rk.range(5, 9), rk.range(2.4, 3.6), uu / R + rk.range(-0.15, 0.15), rk.range(1.0, 1.7), { pw: 1.5, l2: 0.15, p2: rk.range(0, L.TAU) });
  }
  for (const u0 of [-704, -168, 342, 806]) {                   // … so has the outer shoulder (the silhouette itself stays exact)
    const uu = u0 + rk.range(-60, 60), [px, py] = toPx(uu, rk.range(11, 22));
    stamp(px, py, rk.range(7, 13), rk.range(3, 4.6), uu / R + rk.range(-0.12, 0.12), rk.range(1.4, 2.6), { pw: 1.6, l2: 0.12, p2: rk.range(0, L.TAU), minD: 4 });
  }
  for (const [gx, gy] of [[-262, 3], [228, 4]]) {              // … and so have the upper edges of the strokes
    stamp(cx + gx + rk.range(-12, 12) - X0, GLY.yT + gy - Y0, rk.range(4, 6), rk.range(2.2, 3), rk.range(-0.3, 0.3), rk.range(0.9, 1.4), { pw: 1.6 });
  }
  for (let n = 0; n < 64; n++) {                               // their lit shoulders are nibbled all along by fine wear
    const sgn = rk.sign(), rn = rk.range(2.2, 4.4);
    stamp(cx + sgn * rk.range(GLY.G + 6, GLY.A - 6) - X0, GLY.yT + rk.range(2, 13) - Y0, rn * rk.range(1, 2.2), rn * 0.8, rk.range(-0.25, 0.25), rk.range(0.22, 0.5) * (rk.chance(0.3) ? -0.7 : 1), { pw: 1.8 });
  }

  // hairlines: grooves cut into the height field, so each one shows a lit lip and a shaded lip — or nothing, if it runs toward the light
  const rs = L.rng('c03hair');
  const seg = (px, py, ang, len, bend, sig, amp, zone) => { const c = Math.cos(ang) * len / 2, s = Math.sin(ang) * len / 2; line(Sc, px - c, py - s, px + c, py + s, bend, sig, amp, zone, rs.range(0, 900)); };
  for (let n = 0; n < 190; n++) {                              // field: handling marks in every direction
    const [px, py] = toPx(rs.range(-1060, 1060), W1 + 18 + Math.pow(rs(), 0.8) * 400), len = 24 + Math.pow(rs(), 1.7) * 150;
    seg(px, py, rs.range(0, Math.PI), len, rs.range(-0.06, 0.06) * len, rs.range(0.7, 0.92), rs.range(0.055, 0.17), 0);
  }
  for (let b = 0; b < 5; b++) {                                // field: a few wipes — bundles of near-parallel lines
    const [bx, by] = toPx(rs.range(-900, 900), rs.range(W1 + 60, 470)), ang = rs.range(-0.6, 0.6) + (rs.chance(0.3) ? 1.1 : 0), nn = rs.int(5, 9);
    for (let n = 0; n < nn; n++) {
      const off = (n - nn / 2) * rs.range(3.5, 8), len = rs.range(70, 230);
      seg(bx - Math.sin(ang) * off + rs.range(-30, 30), by + Math.cos(ang) * off + rs.range(-8, 8), ang + rs.range(-0.035, 0.035), len, rs.range(-0.02, 0.02) * len, rs.range(0.7, 0.85), rs.range(0.045, 0.11), 0);
    }
  }
  for (let n = 0; n < 6; n++) {                                // field: the odd deeper scratch
    const [px, py] = toPx(rs.range(-960, 960), rs.range(W1 + 40, 430)), len = rs.range(70, 230);
    seg(px, py, rs.range(-0.75, 0.75), len, rs.range(-0.08, 0.08) * len, rs.range(0.95, 1.2), rs.range(0.2, 0.34), 0);
  }
  for (let n = 0; n < 60; n++) {                               // rim: long lines that follow the circumference, a few of them bolder
    const bold = n >= 52, u0 = rs.range(-1090, 1000), d0 = rs.range(EDGE + 6, W0 - 9), ln = bold ? rs.range(160, 520) : 70 + Math.pow(rs(), 1.4) * 380;
    const [xa, ya] = toPx(u0, d0), [xb, yb] = toPx(u0 + ln, d0 + (bold ? rs.range(-6, 6) : rs.range(-2.5, 2.5))), cl = Math.hypot(xb - xa, yb - ya);
    line(Sc, xa, ya, xb, yb, -(cl * cl) / (4 * (R - d0)), rs.range(0.7, 0.9), bold ? rs.range(0.18, 0.3) : rs.range(0.07, 0.2), 1, rs.range(0, 900));
  }
  for (let n = 0; n < 14; n++) {                               // rim: short ones that cut across
    const [px, py] = toPx(rs.range(-1050, 1050), rs.range(EDGE + 14, W0 - 16)), len = rs.range(36, 120);
    seg(px, py, rs.range(0.14, 0.6) * rs.sign() + (px + X0 - cx) / R, len, rs.range(-0.05, 0.05) * len, rs.range(0.7, 0.9), rs.range(0.09, 0.22), 1);
  }
  for (let n = 0; n < 46; n++) {                               // the stroke tops are the high points: fine wear, mostly along the stroke
    const sgn = rs.sign(), px = cx + sgn * rs.range(GLY.G + 14, GLY.A - 14) - X0, py = GLY.yT + rs.range(9, 46) - Y0, along = rs.chance(0.75);
    const len = along ? rs.range(30, 120) : rs.range(12, 40);
    seg(px, py, along ? rs.range(-0.12, 0.12) : rs.range(0, Math.PI), len, rs.range(-0.04, 0.04) * len, rs.range(0.85, 1.1), rs.range(0.1, 0.24), 2);
  }
  // micro-glints for the travelling light: short bright dashes lying along the polishing direction
  for (let n = 0; n < 760; n++) {
    const u0 = rs.range(-1080, 1080), d0 = n < 560 ? rs.range(20, W0 - 6) : rs.range(W1 + 6, W1 + 150), ln = rs.range(3, 11);
    const [xa, ya] = toPx(u0, d0), [xb, yb] = toPx(u0 + ln, d0);
    line(Gl, xa, ya, xb, yb, 0, 0.78, rs.range(0.2, 0.7) * (n < 560 ? 1 : 0.6), 2, -1);
  }
  for (let k = 0; k < N; k++) if (Sc[k] > 0) { const g = Gh[k]; Hh[k] -= Sc[k] * (1 - 3.2 * g * (1 - g)); }   // scratches skip the flanks of the strokes

  // 5) total height → soft shadows (march toward the light) and a hollows / proud-edges map (height against its own blur)
  const HT = new Float32Array(N);
  for (let k = 0; k < N; k++) HT[k] = mh(Dw[k]) + Hh[k];
  const boxBlur = (src, rad) => {
    const tmp = new Float32Array(N), out = new Float32Array(N), iw = 1 / (2 * rad + 1);
    for (let j = 0; j < RH; j++) {
      const o = j * RW; let acc = 0;
      for (let i = -rad; i <= rad; i++) acc += src[o + Math.min(RW - 1, Math.max(0, i))];
      for (let i = 0; i < RW; i++) { tmp[o + i] = acc * iw; acc += src[o + Math.min(RW - 1, i + rad + 1)] - src[o + Math.max(0, i - rad)]; }
    }
    for (let i = 0; i < RW; i++) {
      let acc = 0;
      for (let j = -rad; j <= rad; j++) acc += tmp[Math.min(RH - 1, Math.max(0, j)) * RW + i];
      for (let j = 0; j < RH; j++) { out[j * RW + i] = acc * iw; acc += tmp[Math.min(RH - 1, j + rad + 1) * RW + i] - tmp[Math.max(0, j - rad) * RW + i]; }
    }
    return out;
  };
  const HB = boxBlur(boxBlur(HT, 6), 6), HW = boxBlur(boxBlur(HB, 15), 15);
  const SMAX = 86, OX = new Int32Array(SMAX + 1), OY = new Int32Array(SMAX + 1), OF = new Int32Array(SMAX + 1), IV = new Float32Array(SMAX + 1);
  { const sn = Math.hypot(LX, LY); for (let s = 1; s <= SMAX; s++) { OX[s] = Math.round((s * LX) / sn); OY[s] = Math.round((s * LY) / sn); OF[s] = OY[s] * RW + OX[s]; IV[s] = 1 / Math.hypot(OX[s], OY[s]); } }
  let SH = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const inGly = Y0 + j > GLY.yT - 8;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i; if (Dd[k] < 0) continue;
      const dw = Dw[k], lim = dw > W0 - 4 && dw < W1 + 84 ? SMAX : inGly && Math.abs(X0 + i - cx) < GLY.A + 44 ? 38 : 10;
      const h0 = HT[k]; let m = 0;
      for (let s = 1; s <= lim; s++) {
        const jj = j + OY[s]; if (jj < 0) break;
        const ii = i + OX[s]; if (ii < 0 || ii >= RW) break;
        const sl = (HT[k + OF[s]] - h0) * IV[s]; if (sl > m) m = sl;
      }
      SH[k] = sstep(0.3, 1.2, m);                              // a broad soft source: penumbra from 17° to 50° of horizon
    }
  }
  SH = boxBlur(SH, 1);

  // 6) shade → base colour + "sheen" (response to the travelling light)
  const d8 = new Uint8ClampedArray(N * 4), s8 = new Uint8ClampedArray(N * 4);
  const U0 = -140, SIG = 1650, AMB = 0.13, HZ7 = Math.pow(HZ, 7);
  const PN = 4096, P46 = new Float32Array(PN + 1), P20 = new Float32Array(PN + 1);
  for (let i = 0; i <= PN; i++) { P46[i] = Math.pow(i / PN, 46); P20[i] = Math.pow(i / PN, 20); }
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, dd = Dd[k];
      if (dd < -1.5) continue;
      const ddx = X0 + i - cx, rr = R - dd, sn = ddx / rr, cs = ddy / rr, u = Uu[k], dW = Dw[k];
      let hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      const ui = Math.max(0, Math.min(UM * 2, Math.round(u) + UM)), ms = macroSlope(dW, EDG[ui]);
      hx -= ms * sn; hy += ms * cs;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const nl = (-hx * LX - hy * LY + LZ) * inv, nh = (-hx * HX - hy * HY + HZ) * inv, nb = (-hx * BX - hy * BY + BZ) * inv;
      const lat = (u - U0) / SIG, F = FD[Math.max(0, Math.min(799, dd | 0))] * Math.exp(-lat * lat);
      const gh = Gh[k], cav = Cv[k], sh = SH[k], st = St[k];
      // hollows (the foot of the wall, the feet of the strokes, the holes) and proud edges, away from the limb
      const lm = sstep(24, 60, dd), dv = HT[k] - HB[k];
      const occ = dv < 0 ? Math.min(1, -dv / 5.2) * lm : 0, wear = dv > 0 ? Math.min(1, dv / 4) * lm : 0;
      // key light, taken away by the soft shadow
      let I = F * (AMB + (Math.max(AMB, 0.7 + 1.15 * (nl - LZ)) - AMB) * (1 - 0.95 * sh));
      // the shoulder turns edge-on at the limb and mirrors the dark around it
      I *= 0.4 + 0.6 * sstep(-1, 10, dd);
      // what faces the lit field glows with it (the wall of the rim, the lower flanks of the strokes)
      if (nb > BZ) I += F * BNC[ui] * Math.pow((nb - BZ) / (1 - BZ), 1.3) * sstep(2.5, -1.5, dv) * (1 - 0.8 * occ);
      I *= 1 - 0.6 * occ;
      // the rim keeps a little of the light off the field for a long way in
      if (dW > RIM) I *= 1 - 0.13 * (1 - sstep(RIM, RIM + 150, dW));
      // the worn inner corner of the rim catches a thread of light
      const ce = (dW - (W0 - 1)) / 3.4;
      if (ce > -3 && ce < 3) I += F * THR[ui] * Math.exp(-ce * ce) * (1 - Math.min(1, cav * 4));
      // high points are rubbed brighter
      I *= 1 + 0.2 * gh + 0.1 * wear;
      const top = sstep(EDGE - 12, EDGE + 8, dd) * (1 - sstep(W0 - 6, W0 + 6, dW));
      I += F * st * L.lerp(0.032, 0.085, top);
      const cm = bil(cMed, i, j);
      I *= 1 + L.lerp(0.075, 0.1, top) * cm;
      // toning: where relief shelters the surface from handling (along the foot of the rim, around the strokes) the gold
      // has kept a deeper, redder skin; out in the open it is rubbed paler
      const dv2 = HT[k] - HW[k], tone = dv2 < 0 ? Math.min(1, -dv2 / 7) * lm : 0;
      I *= 1 - 0.07 * tone;
      // a tight glint + the broad, soft lustre of a surface polished by handling
      const ni = nh > 0 ? (nh * PN + 0.5) | 0 : 0, sp = P46[ni], lit = 1 - 0.9 * sh;
      I += sp * 0.32 * F * lit;
      if (gh > 0 && nh > HZ) I += F * 0.26 * gh * ((Math.pow(nh, 7) - HZ7) / (1 - HZ7)) * lit;
      if (cav > 0) I *= 1 - cav;
      const li = Math.max(0, Math.min(NL - 1, (I / IMAX) * (NL - 1) | 0)) * 3, o = k * 4;
      const al = L.clamp(dd + 0.75);
      // the field runs a shade hotter (more orange) than the burnished rim and stroke tops; hollows run redder still
      const ft = sstep(RIM - 8, RIM + 4, dW) * (1 - 0.55 * gh);
      const nk = (-hx * KX - hy * KY + KZ) * inv, kick = nk > 0 ? Math.min(1, Math.pow(nk, 6) * 1.5) * (1 - cav) : 0;
      const warm = L.clamp(0.5 * tone - 0.3 * cm, -0.5, 1);
      const gm = (1 - 0.05 * ft) * (1 - 0.3 * kick) * (1 - 0.07 * occ) * (1 - 0.045 * warm), bm = (1 - 0.16 * ft) * (1 - 0.62 * kick) * (1 - 0.2 * occ) * (1 - 0.16 * warm);
      d8[o] = RAMP[li]; d8[o + 1] = RAMP[li + 1] * gm; d8[o + 2] = RAMP[li + 2] * bm; d8[o + 3] = al * 255;
      // sheen: broad lobe + sparkle of the polishing lines + drawn micro-glints
      let sb = P20[ni] * (0.8 + 0.9 * Math.max(0, st)) + top * 0.42 * (1 + 0.9 * st) + Gl[k] * (0.3 + 0.5 * top);
      sb *= (1 - cav) * al * sstep(-1, 7, dd) * (1 - 0.8 * sh);
      s8[o] = 255; s8[o + 1] = 216; s8[o + 2] = 124; s8[o + 3] = L.clamp(sb) * 255;
    }
  }
  return { RW, RH, X0, Y0, rgba: d8, sheen: s8 };
}

function buildCoin(env) {
  const a = env.arc, R = a.R;
  const px = shadeCoin(a), { RW, RH, X0, Y0 } = px, cxl = a.cx - X0, cyl = a.cy - Y0;
  const coin = L.makeCanvas(RW, RH), g = coin.getContext('2d');
  g.putImageData(new ImageData(px.rgba, RW, RH), 0, 0);
  const sheen = L.makeCanvas(RW, RH);
  sheen.getContext('2d').putImageData(new ImageData(px.sheen, RW, RH), 0, 0);

  // shallow depth of field: the bottom of frame (nearest the lens) softens in two steps, never to mush —
  // the bevels of the strokes must still read
  const soften = (blur, d0, d1) => {
    const b = L.blurred(coin, blur), bg = b.getContext('2d');
    bg.globalCompositeOperation = 'destination-in';
    bg.fillStyle = L.radial(bg, cxl, cyl, R - d1, R - d0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    bg.fillRect(0, 0, RW, RH);
    g.drawImage(b, 0, 0);
  };
  soften(1.2, 340, 460); soften(2.2, 470, 600);
  // … and so does the far limb (a true cross-fade: the soft copy replaces the sharp one, alpha edge included)
  const far = L.blurred(coin, 2.3), fg = far.getContext('2d');
  const limbMask = (c) => { c.fillStyle = L.radial(c, cxl, cyl, R - 92, R - 10, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); c.fillRect(0, 0, RW, RH); };
  fg.globalCompositeOperation = 'destination-in'; limbMask(fg);
  g.globalCompositeOperation = 'destination-out'; limbMask(g);
  g.globalCompositeOperation = 'lighter'; g.drawImage(far, 0, 0);
  g.globalCompositeOperation = 'source-over';

  // bloom: the bright metal glows into itself
  const bw = Math.ceil(RW / 4), bh = Math.ceil(RH / 4);
  const b1 = L.makeCanvas(bw, bh), bg = b1.getContext('2d');
  bg.fillStyle = '#000'; bg.fillRect(0, 0, bw, bh);
  bg.filter = 'blur(5px)'; bg.drawImage(coin, 0, 0, bw, bh); bg.filter = 'none';
  const b2 = L.makeCanvas(bw, bh), b2g = b2.getContext('2d');
  b2g.drawImage(b1, 0, 0); b2g.globalCompositeOperation = 'multiply'; b2g.drawImage(b1, 0, 0); b2g.fillStyle = '#ffb45a'; b2g.fillRect(0, 0, bw, bh);
  const bloom = L.makeCanvas(RW, RH), blg = bloom.getContext('2d');
  blg.imageSmoothingQuality = 'high'; blg.drawImage(b2, 0, 0, RW, RH);
  L.overlayOn(coin, bloom, { blend: 'screen', alpha: 0.28 });

  return { coin, sheen, X0, Y0 };
}

export default {
  name: '金开元通宝微距',
  tone: 'light',
  init(env) {
    const built = buildCoin(env);
    const TY = built.Y0 - 2;
    // pin-point glints on the rim that flare as the highlight passes over them
    const rg = L.rng('c03glint'), glints = [];
    for (let i = 0; i < 9; i++) glints.push({ th: L.lerp(-0.2, 0.06, (i + rg.range(0.1, 0.9)) / 9), d: rg.range(16, RIM - 50), k: rg.range(0.5, 1), sx: rg.range(1.5, 3.4), sy: rg.range(0.3, 0.52), tilt: rg.range(-0.03, 0.03) });
    S = { ...built, TY, tmp: L.makeCanvas(W, H - TY), glints };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const z = L.lerp(1, 1.04, p);
    const thH = L.lerp(-0.14, -0.012, p);                     // where the travelling highlight sits
    const zx = (x) => a.cx + (x - a.cx) * z, zy = (y) => a.crestY + (y - a.crestY) * z;

    ctx.fillStyle = '#030201'; ctx.fillRect(0, 0, W, H);
    // a thread of dark-red glow outside the limb, gone into black at once
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 2, a.R + 96, [[0, 'rgba(190,52,10,0.95)'], [0.06, 'rgba(140,34,8,0.9)'], [0.22, 'rgba(86,20,6,0.62)'], [0.5, 'rgba(56,12,4,0.24)'], [1, 'rgba(20,4,1,0)']]);
    ctx.fillRect(0, 0, W, H);
    // … swelling a little where the highlight rides the rim
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, thH, 6, () => {
      ctx.scale(3.2, 0.62);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 150, [[0, 'rgba(226,80,16,0.62)'], [0.4, 'rgba(156,42,10,0.26)'], [1, 'rgba(74,18,6,0)']]);
      ctx.fillRect(-150, -150, 300, 300);
    });
    ctx.restore();

    // the coin: pushed in about the crest, then trimmed to the true arc so the edge never drifts
    const camT = (c) => { c.translate(a.cx, a.crestY); c.scale(z, z); c.translate(-a.cx, -a.crestY); };
    ctx.save(); a.clipBelow(ctx, 3);                          // 3 px of grace for the limb's soft (defocused) falloff
    camT(ctx); ctx.drawImage(S.coin, S.X0, S.Y0);
    ctx.restore();

    // travelling highlight: the sheen layer seen through a soft window sliding along the rim
    const t = S.tmp.getContext('2d');
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, S.tmp.width, S.tmp.height);
    t.translate(0, -S.TY); t.save(); camT(t); t.drawImage(S.sheen, S.X0, S.Y0); t.restore();
    t.globalCompositeOperation = 'destination-in';
    a.at(t, thH, -RIM * 0.4, () => {
      t.scale(1, 0.6);
      t.fillStyle = L.radial(t, 0, 0, 0, 470, [[0, 'rgba(0,0,0,0.9)'], [0.3, 'rgba(0,0,0,0.6)'], [0.62, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]);
      t.fillRect(-4000, -4000, 8000, 8000);
    });
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(S.tmp, 0, S.TY);
    ctx.restore();

    // the light itself: a broad warm lift that follows the highlight across rim and field
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'overlay';
    a.at(ctx, thH, -RIM * 0.6, () => {
      ctx.scale(1.25, 0.8);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 560, [[0, 'rgba(255,238,176,0.3)'], [0.45, 'rgba(255,226,150,0.13)'], [1, 'rgba(255,220,140,0)']]);
      ctx.fillRect(-560, -560, 1120, 1120);
    });
    // concentric polishing throws the highlight into a soft spoke pointing at the coin's centre
    a.at(ctx, thH, -190, () => {
      ctx.scale(0.36, 1.7);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 420, [[0, 'rgba(255,242,186,0.26)'], [0.5, 'rgba(255,230,160,0.1)'], [1, 'rgba(255,220,140,0)']]);
      ctx.fillRect(-420, -420, 840, 840);
    });
    ctx.restore();

    // rim light on the shoulder, hottest under the highlight
    const hx = a.pt(thH, 0).x / W;
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'butt';
    ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(255,190,90,0.05)'], [L.clamp(hx - 0.22), 'rgba(255,214,130,0.18)'], [L.clamp(hx), 'rgba(255,240,190,0.7)'], [L.clamp(hx + 0.22), 'rgba(255,214,130,0.18)'], [1, 'rgba(255,190,90,0.05)']]);
    for (const [lw, al] of [[14, 0.3], [8, 0.4], [3.5, 0.55]]) { ctx.globalAlpha = al; ctx.lineWidth = lw; a.stroke(ctx, -15 * z); }
    ctx.restore();

    // pin-point glints
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of S.glints) {
      const w = Math.exp(-Math.pow((q.th - thH) / 0.045, 2)) * q.k;
      if (w < 0.04) continue;
      const pt = a.pt(q.th, -q.d), rr = 18;
      ctx.save(); ctx.translate(zx(pt.x), zy(pt.y)); ctx.rotate(q.th + q.tilt);
      // a polishing line catching the light: a small soft flare …
      ctx.save(); ctx.scale(q.sx, q.sy);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, rr, [[0, `rgba(255,246,214,${0.5 * w})`], [0.2, `rgba(255,236,170,${0.26 * w})`], [0.55, `rgba(255,206,110,${0.06 * w})`], [1, 'rgba(255,190,90,0)']]);
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ctx.restore();
      // … around a thin bright core
      ctx.scale(q.sx * 1.15, 0.11);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, rr, [[0, `rgba(255,252,236,${0.95 * w})`], [0.35, `rgba(255,240,190,${0.5 * w})`], [1, 'rgba(255,220,140,0)']]);
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ctx.restore();
    }
    ctx.restore();
    L.vignette(ctx, { strength: 0.2 });
  },
};
