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
//
// Resolution: both layers are shaded in DEVICE pixels (L.pixelCanvas), so a 4K master (L.SS = 2) gets native relief rather than
// an enlarged 1080p bitmap. All lengths stay in logical pixels; a last generation of detail narrower than a logical pixel —
// turning threads on the rim, needle-point sand holes, the tooth of the cast skin — exists only where the grid can carry it.
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
const GLY = { yT: 1010, sw: 66, A: 400, G: 46, GH: 11.5, GE: 17, CR: 4.0 };
function glyphBoxes(cx) {
  const { yT, sw, A, G } = GLY, hw = sw * 0.8, far = H + PAD + 300;
  return [
    [cx - A, yT - 4, cx - A + sw, far], [cx - A, yT, cx - G, yT + hw], [cx - G - sw * 0.94, yT, cx - G, yT + 236], [cx - A, yT + 150, cx - G, yT + 150 + hw * 0.85],
    [cx + G, yT - 3, cx + G + sw * 0.94, yT + 236], [cx + G, yT, cx + A, yT + hw], [cx + A - sw, yT, cx + A, far], [cx + G, yT + 150, cx + A, yT + 150 + hw * 0.85],
  ];
}

/** the whole coin face as DEVICE pixels (pure arithmetic, no canvas). q = device pixels per logical pixel (L.SS); every length
 *  below stays in logical pixels — device pixel (i, j) is the logical point ((i + 0.5) / q, (j + 0.5) / q) — so the picture is
 *  the same at any q, only finer. A last generation of detail that is smaller than a logical pixel (turning threads, needle-point
 *  sand holes, the tooth of the cast skin) is laid in only when the grid can carry it (`hi`).
 *  `d8` (optional) receives the base colour; returns { RW, RH, PW, PH, X0, Y0, rgba, sheen } */
function shadeCoin(a, q = 1, d8 = null) {
  const R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, PW = RW * q, PH = RH * q, N = PW * PH, iq = 1 / q;
  const hi = L.clamp(q - 1);
  const nA = L.makeNoise('c03a'), nB = L.makeNoise('c03b'), nC = L.makeNoise('c03c'), nD = L.makeNoise('c03d');

  // gold ramp, indexed by intensity 0 … 1.5
  const IMAX = 1.5, NL = 1024;
  const rampFn = L.makeRamp([[0, '#070100'], [0.07, '#300802'], [0.15, '#681a04'], [0.25, '#96380a'], [0.4, '#b5610c'], [0.54, '#dc7e10'],
    [0.7, '#f2a51e'], [0.84, '#ffc23c'], [1.0, '#ffd76a'], [1.16, '#ffe088'], [1.32, '#ffe9a6'], [1.5, '#fff3c8']].map(([t, c]) => [t / IMAX, hex(c)]));
  const RAMP = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = rampFn(i / (NL - 1)); RAMP[i * 3] = c[0]; RAMP[i * 3 + 1] = c[1]; RAMP[i * 3 + 2] = c[2]; }

  // "planet" falloff: brightest on the rim, deepening toward the bottom of frame
  const fd = curve([[0, 1.3], [90, 1.27], [RIM, 1.17], [240, 1.05], [340, 0.83], [450, 0.63], [540, 0.5], [720, 0.4]]);
  const FD = new Float32Array(801); for (let i = 0; i <= 800; i++) FD[i] = fd(i);
  // the cast rim's inner edge is never a perfect circle; nor is the thread of light on its corner even
  const UM = 1500, WOB = new Float32Array(UM * 2 + 2), THR = new Float32Array(UM * 2 + 2), EDG = new Float32Array(UM * 2 + 2), BNC = new Float32Array(UM * 2 + 2);
  for (let i = 0; i <= UM * 2 + 1; i++) {
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
  // slow unevenness of the metal on a coarse grid (logical pixels) …
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, cMed = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const uu = Math.atan2(ddx, ddy) * R, dq = R - rr;
    cMed[j * cw + i] = nA.fbm(uu / 330 + 11, dq / 210 - 4, 3) + 0.55 * nB.fbm(uu / 90 - 5, dq / 70 + 8, 2) + 0.35 * nB.n2(uu / 2600 + 2, dq / 34);
  }
  // … and, on a finer one, how even the satin of the handled skin is: lanes that run with the polishing, brighter where a
  // thumb has kept the metal clean, duller where the patina has been left alone
  const CG = 3, gw = Math.ceil(RW / CG) + 2, gh2 = Math.ceil(RH / CG) + 2, cGl = new Float32Array(gw * gh2);
  for (let j = 0; j < gh2; j++) for (let i = 0; i < gw; i++) {
    const ddx = X0 + i * CG - cx, ddy = cy - (Y0 + j * CG), rr = Math.hypot(ddx, ddy);
    const uu = Math.atan2(ddx, ddy) * R, dq = R - rr;
    cGl[j * gw + i] = 0.62 * nD.n2(uu / 170 + 5, dq / 24 - 3) + 0.38 * nD.n2(uu / 64 - 21, dq / 10.5 + 14);
  }
  const bil = (src, sw, cs, x, y) => {
    const fx = x / cs, fy = y / cs, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * sw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + sw], b1 = src[k + sw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  const Dd = new Float32Array(N), Uu = new Float32Array(N), Dw = new Float32Array(N), Hh = new Float32Array(N), St = new Float32Array(N);
  const Cv = new Float32Array(N), Gh = new Float32Array(N), Gl = new Float32Array(N), Lp = new Float32Array(N), Gf = new Float32Array(N);
  let Sc = new Float32Array(N);

  // 1) polar coordinates of every device pixel
  for (let j = 0; j < PH; j++) {
    const ddy = cy - (Y0 + (j + 0.5) * iq);
    for (let i = 0; i < PW; i++) {
      const k = j * PW + i, ddx = X0 + (i + 0.5) * iq - cx, d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      Dd[k] = d; Dw[k] = d;
      if (d < -1.5) continue;
      const u = Math.atan2(ddx, ddy) * R; Uu[k] = u;
      // the rim's inner wall wanders a little; the outer edge is exact
      if (d > RIM - 70) { const f = Math.max(0, Math.min(UM * 2, u + UM)), ui = f | 0; Dw[k] = d + (WOB[ui] + (WOB[ui + 1] - WOB[ui]) * (f - ui)) * sstep(RIM - 70, RIM - 30, d); }
    }
  }

  // 2) the raised strokes at the bottom of frame: a signed distance to the union of rounded bars, turned into a worn
  //    section (crisp at the foot, a shoulder that rolls over, a top that is very slightly crowned — not a punched-out block)
  const boxes = glyphBoxes(cx), { GH, GE, CR } = GLY, RC = 17;
  const PGN = 256, PG = new Float32Array(PGN + 1);
  { let acc = 0; for (let i = 1; i <= PGN; i++) { const t = (i - 0.5) / PGN; acc += Math.pow(t, 0.5) * Math.pow(1 - t, 1.2); PG[i] = acc; } for (let i = 1; i <= PGN; i++) PG[i] /= acc; }
  const seamW = 1.05 + 0.45 * (1 - hi);                         // the hairline of dirt in the crease: as fine as the grid can hold
  {
    const iA = Math.max(0, Math.floor((cx - GLY.A - 40 - X0) * q)), iB = Math.min(PW - 1, Math.ceil((cx + GLY.A + 40 - X0) * q));
    for (let j = Math.max(0, Math.floor((GLY.yT - 40 - Y0) * q)); j < PH; j++) {
      const y = Y0 + (j + 0.5) * iq;
      for (let i = iA; i <= iB; i++) {
        const x = X0 + (i + 0.5) * iq;
        let sd = 1e9;
        for (const b of boxes) {
          const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
          const qx = Math.abs(x - mx) - ((b[2] - b[0]) / 2 - RC), qy = Math.abs(y - my) - ((b[3] - b[1]) / 2 - RC);
          const s = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RC;
          const hk = Math.max(9 - Math.abs(sd - s), 0) / 9;       // smooth union: inside corners get a fillet
          sd = Math.min(sd, s) - hk * hk * 9 * 0.25;
        }
        if (sd > 8) continue;
        sd += 1.5 * nA.n2(x / 150 + 3, y / 150) + 0.55 * nA.n2(x / 46 - 7, y / 46) + 0.2 * nB.n2(x / 15, y / 15 + 9);
        const ge = GE * (1 + 0.2 * nB.n2(x / 170 + 31, y / 170)), gh = GH * (1 + 0.13 * nA.n2(x / 260 + 5, y / 260 - 2));
        const tf = L.clamp(-sd / ge) * PGN, ti = tf | 0, p = ti >= PGN ? 1 : PG[ti] + (PG[ti + 1] - PG[ti]) * (tf - ti);
        // … and the top is a low continuous dome (no flat plateau): the bevel rolls straight into it
        const ct = L.clamp(-sd / 24);
        const k = j * PW + i; Gh[k] = p; Hh[k] = gh * p + CR * ct * (2 - ct);
        // the seam where stroke meets field: a soft band of deeper tone and, right in the crease, a broken dark hairline
        const fq = (sd - 1.2) / 3.2, fc = (sd - 0.6) / seamW;
        Gf[k] = Math.exp(-fq * fq) + (fc > -3 && fc < 3 ? 1.7 * Math.exp(-fc * fc) * (0.62 + 0.38 * nC.n2(x / 11 + 3, y / 11 - 8)) : 0);
      }
    }
  }

  // 3) cast skin + polishing lines
  for (let k = 0; k < N; k++) {
    const d = Dd[k]; if (d < -1.5) continue;
    const u = Uu[k], g = Gh[k];
    // "orange peel": quieter on the rim and on the stroke tops, which handling has burnished
    const onRim = 1 - sstep(RIM - 30, RIM + 10, d);
    const peel = 0.5 * nA.n2(u / 13, d / 13) + 0.16 * nB.n2(u / 5.2 + 40, d / 5.2) + 0.3 * nB.n2(u / 41 - 8, d / 41 + 3);
    let h = peel * L.lerp(0.15, 0.08, onRim) * (1 - 0.6 * g);
    // concentric polishing lines: long along the arc, a pixel or two across
    let st = 0.6 * nB.n2(u / 560 + 9, d / 1.9) + 0.4 * nA.n2(u / 1500 - 3, d / 4.9 + 70);
    if (hi > 0) {
      // the tooth of the cast skin, finer than a 1080p pixel: the field keeps it, the turned rim and the rubbed stroke tops have lost most of it
      h += hi * (0.026 * nC.n2(u / 2.4 + 13, d / 2.4 - 7) + 0.014 * nD.n2(u / 1.15 - 31, d / 1.15 + 17)) * L.lerp(1, 0.3, onRim) * (1 - 0.7 * g);
      // … and the turning lines have a finer generation of their own
      if (onRim > 0) st += hi * onRim * (0.5 * nD.n2(u / 420 + 3, d / 0.92 + 40) + 0.17 * nC.n2(u / 260 - 15, d / 0.76 - 9));
    }
    Hh[k] += h; St[k] = st;
  }

  // 4) stamped relief (positions and sizes in logical pixels of this canvas)
  const toPx = (u, d) => { const th = u / R, rr = R - d; return [cx + rr * Math.sin(th) - X0, cy - rr * Math.cos(th) - Y0]; };
  const LDn = Math.hypot(LX, LY), LDX = -LX / LDn, LDY = -LY / LDn;     // straight away from the light, in the picture plane
  /** dent (depth > 0) or bump (depth < 0) with an optional lobed outline; `dark` = how black its bottom is;
   *  `lip` = how brightly the far wall of the hole — the one that faces the light — shows as a crescent inside its lower lip */
  const stamp = (px, py, rx, ry, ang, depth, o = {}) => {
    const { dark = 0, pw = 1.4, l2 = 0, p2 = 0, l3 = 0, p3 = 0, minD = 2, lip = 0 } = o;
    const lob = l2 !== 0 || l3 !== 0, e = Math.max(rx, ry) * (1 + Math.abs(l2) + Math.abs(l3)) * (lip > 0 ? 1.4 : 1) + 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const rmin = Math.min(rx, ry), oy = 0.26 * rmin, fw = Math.min(0.5, (1.1 - 0.35 * hi) / rmin), lw = Math.max(0.2, 0.62 / (rmin * q)), qmax = lip > 0 ? 1.4 : 1;
    for (let j = Math.max(1, Math.floor((py - e) * q)); j <= Math.min(PH - 2, Math.ceil((py + e) * q)); j++) {
      for (let i = Math.max(1, Math.floor((px - e) * q)); i <= Math.min(PW - 2, Math.ceil((px + e) * q)); i++) {
        const k = j * PW + i; if (Dd[k] < minD) continue;
        const dx = (i + 0.5) * iq - px, dy = (j + 0.5) * iq - py, lx = (dx * ca + dy * sa) / rx, ly = (-dx * sa + dy * ca) / ry;
        let qn = Math.sqrt(lx * lx + ly * ly);
        if (lob && qn > 1e-3) { const ph = Math.atan2(ly, lx); qn /= 1 + l2 * Math.cos(2 * ph + p2) + l3 * Math.cos(3 * ph + p3); }
        if (qn >= qmax) continue;
        if (lip > 0 && qn > 0.4) {
          const cl = (dx * LDX + dy * LDY) / (Math.hypot(dx, dy) + 1e-6);
          if (cl > 0) { const le = (qn - 0.9) / lw, v = lip * cl * Math.sqrt(cl) * Math.exp(-le * le); if (v > Lp[k]) Lp[k] = v; }
        }
        if (qn >= 1) continue;
        Hh[k] -= depth * Math.pow(1 - qn * qn, pw);
        if (dark > 0) {
          // the darkness sits toward the light (the top of frame), tucked under the near lip; the far wall climbs back into the light
          const ey = dy + oy, mx = (dx * ca + ey * sa) / rx, my = (-dx * sa + ey * ca) / ry;
          let qc = Math.sqrt(mx * mx + my * my);
          if (lob && qc > 1e-3) { const ph = Math.atan2(my, mx); qc /= 1 + l2 * Math.cos(2 * ph + p2) + l3 * Math.cos(3 * ph + p3); }
          const c = dark * (1 - sstep(0.46, 0.96, qc)) * Math.min(1, (1 - qn) / fw);
          if (c > Cv[k]) Cv[k] = c;
        }
      }
    }
  };
  /** a fine line laid into `buf` (max-blended gaussian tube along a gently bent path); zone 0 = field, 1 = rim top, 2 = anywhere */
  const line = (buf, x0, y0, x1, y1, bend, sig, amp, zone, seed) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 2) return;
    const mx = (x0 + x1) / 2 - (dy / len) * bend, my = (y0 + y1) / 2 + (dx / len) * bend;
    const n = Math.ceil(len / Math.min(0.7 * iq, 0.75 * sig)), rad = Math.ceil(sig * 2.6 * q), i2 = 1 / (2 * sig * sig);
    for (let s = 0; s <= n; s++) {
      const t = s / n, mt = 1 - t, px = mt * mt * x0 + 2 * mt * t * mx + t * t * x1, py = mt * mt * y0 + 2 * mt * t * my + t * t * y1;
      // bites in quickly, feathers out; skips a little along the way
      const dp = amp * Math.min(1, t * 7, mt * 4) * (seed < 0 ? 1 : 0.64 + 0.36 * nC.n2(seed + (t * len) / 24, seed * 1.7));
      if (dp < 0.004) continue;
      const ic = Math.floor(px * q), jc = Math.floor(py * q);
      for (let j = Math.max(0, jc - rad); j <= Math.min(PH - 1, jc + rad); j++) {
        for (let i = Math.max(0, ic - rad); i <= Math.min(PW - 1, ic + rad); i++) {
          const k = j * PW + i, ex = (i + 0.5) * iq - px, ey = (j + 0.5) * iq - py;
          let v = dp * Math.exp(-(ex * ex + ey * ey) * i2);
          if (v <= buf[k]) continue;
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
      l2: rq.range(0.05, big ? 0.3 : 0.2), p2: rq.range(0, L.TAU), l3: rq.range(0, big ? 0.16 : 0.1), p3: rq.range(0, L.TAU), lip: big ? 0.6 : 0.85,
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
  // a finer generation under all of those: the faintest handling hairlines — a pixel wide, a few percent deep, most of
  // them sharing the direction the coin was last wiped in — and, on the rim, short threads that follow the circumference
  const rf = L.rng('c03fine');
  for (let n = 0; n < 300; n++) {
    const [px, py] = toPx(rf.range(-1070, 1070), W1 + 14 + Math.pow(rf(), 0.85) * 420), len = 12 + Math.pow(rf(), 1.5) * 84;
    const ang = rf.chance(0.6) ? -0.5 + rf.gauss() * 0.22 : rf.range(0, Math.PI), c = Math.cos(ang) * len / 2, sn = Math.sin(ang) * len / 2;
    line(Sc, px - c, py - sn, px + c, py + sn, rf.range(-0.05, 0.05) * len, rf.range(0.52, 0.66), rf.range(0.028, 0.075), 0, rf.range(0, 900));
  }
  for (let n = 0; n < 120; n++) {
    const u0 = rf.range(-1090, 1060), d0 = rf.range(EDGE + 4, W0 - 8), ln = 20 + Math.pow(rf(), 1.6) * 150;
    const [xa, ya] = toPx(u0, d0), [xb, yb] = toPx(u0 + ln, d0 + rf.range(-1.5, 1.5)), cl = Math.hypot(xb - xa, yb - ya);
    line(Sc, xa, ya, xb, yb, -(cl * cl) / (4 * (R - d0)), rf.range(0.52, 0.64), rf.range(0.035, 0.085), 1, rf.range(0, 900));
  }
  // pin-pricks: the finest sand holes, a pixel or two across, lying in loose drifts where the mould shed its sand —
  // more felt than seen, each still a real hollow with a lit lip
  const drifts = []; for (let n = 0; n < 9; n++) drifts.push([rf.range(-1000, 1000), rf.range(W1 + 30, 500)]);
  for (let n = 0; n < 84; n++) {
    let u0, d0;
    if (n < 54) { const c = drifts[rf.int(0, 8)]; u0 = c[0] + rf.gauss() * 46; d0 = c[1] + rf.gauss() * 24; }
    else { u0 = rf.range(-1080, 1080); d0 = rf.chance(0.3) ? rf.range(26, W0 - 16) : rf.range(W1 + 14, 540); }
    const rp = rf.range(0.95, 1.6), ry = rp * rf.range(0.7, 1), an = rf.range(0, Math.PI), dp = rp * rf.range(0.35, 0.6), dk = rf.range(0.22, 0.5);
    if (d0 < 22 || (d0 > W0 - 12 && d0 < W1 + 12)) continue;
    const [px, py] = toPx(u0, d0);
    stamp(px, py, rp, ry, an, dp, { dark: dk, pw: 1.3, lip: 0.7 });
  }
  // micro-glints for the travelling light: short bright dashes lying along the polishing direction
  for (let n = 0; n < 760; n++) {
    const u0 = rs.range(-1080, 1080), d0 = n < 560 ? rs.range(20, W0 - 6) : rs.range(W1 + 6, W1 + 150), ln = rs.range(3, 11);
    const [xa, ya] = toPx(u0, d0), [xb, yb] = toPx(u0 + ln, d0);
    line(Gl, xa, ya, xb, yb, 0, 0.78 - 0.26 * hi, rs.range(0.2, 0.7) * (n < 560 ? 1 : 0.6) * (1 + 0.25 * hi), 2, -1);   // (slimmer where the grid allows)
  }

  // the generation only a 4K grid can hold (everything here is narrower than a logical pixel)
  if (hi > 0) {
    const rm = L.rng('c03micro');
    // turning threads on the top of the rim: hair-fine grooves that follow the circumference exactly, a few long, most short,
    // gathered into lanes where the tool chattered
    const lanes = []; for (let n = 0; n < 11; n++) lanes.push([rm.range(EDGE + 2, W0 - 8), rm.range(2.5, 9)]);
    for (let n = 0; n < 760; n++) {
      const inLane = n < 430, ln0 = lanes[rm.int(0, 10)];
      const d0 = inLane ? ln0[0] + rm.gauss() * ln0[1] : rm.range(EDGE - 8, W0 - 5), ln = 26 + Math.pow(rm(), 2.1) * 560, u0 = rm.range(-1120, 1090);
      const sg = rm.range(0.28, 0.42), am = 0.02 + Math.pow(rm(), 2.2) * 0.09, dr = rm.range(-0.7, 0.7), sd0 = rm.range(0, 900);
      if (d0 < EDGE - 10 || d0 > W0 - 4) continue;
      const [xa, ya] = toPx(u0, d0), [xb, yb] = toPx(u0 + ln, d0 + dr), cl = Math.hypot(xb - xa, yb - ya);
      line(Sc, xa, ya, xb, yb, -(cl * cl) / (4 * (R - d0)), sg, am * hi, 1, sd0);
    }
    // the faintest scratches of handling: across the turning on the rim …
    for (let n = 0; n < 150; n++) {
      const [px, py] = toPx(rm.range(-1080, 1080), rm.range(EDGE + 6, W0 - 10)), len = 7 + Math.pow(rm(), 1.6) * 62;
      const ang = (rm.chance(0.6) ? rm.range(0.18, 0.75) * rm.sign() : rm.range(0, Math.PI)) + (px + X0 - cx) / R, c = Math.cos(ang) * len / 2, sn = Math.sin(ang) * len / 2;
      line(Sc, px - c, py - sn, px + c, py + sn, rm.range(-0.05, 0.05) * len, rm.range(0.26, 0.38), (0.02 + Math.pow(rm(), 1.8) * 0.07) * hi, 1, rm.range(0, 900));
    }
    // … and any way they fell on the field, many of them sharing the last wipe
    for (let n = 0; n < 560; n++) {
      const [px, py] = toPx(rm.range(-1080, 1080), W1 + 10 + Math.pow(rm(), 0.9) * 420), len = 6 + Math.pow(rm(), 1.7) * 66;
      const ang = rm.chance(0.5) ? -0.5 + rm.gauss() * 0.25 : rm.range(0, Math.PI), c = Math.cos(ang) * len / 2, sn = Math.sin(ang) * len / 2;
      line(Sc, px - c, py - sn, px + c, py + sn, rm.range(-0.06, 0.06) * len, rm.range(0.26, 0.4), (0.02 + Math.pow(rm(), 1.8) * 0.065) * hi, 0, rm.range(0, 900));
    }
    // needle-point sand holes: a device pixel or two of true hollow, shadow under the near lip, a spark of light on the far one
    const nests = []; for (let n = 0; n < 18; n++) nests.push([rm.range(-1060, 1060), rm.chance(0.4) ? rm.range(44, W0 - 26) : rm.range(W1 + 26, 520)]);
    for (let n = 0; n < 380; n++) {
      let u0, d0;
      if (n < 210) { const c = nests[rm.int(0, 17)]; u0 = c[0] + rm.gauss() * 40; d0 = c[1] + rm.gauss() * 15; }
      else { u0 = rm.range(-1100, 1100); d0 = rm.chance(0.32) ? rm.range(24, W0 - 14) : rm.range(W1 + 12, 548); }
      const rp = rm.range(0.5, 1.02), ry = rp * rm.range(0.72, 1), an = rm.range(0, Math.PI), dp = rp * rm.range(0.4, 0.7), dk = rm.range(0.42, 0.85), lp = rm.range(0.55, 1);
      if (d0 < 22 || (d0 > W0 - 10 && d0 < W1 + 10)) continue;
      const [px, py] = toPx(u0, d0);
      stamp(px, py, rp, ry, an, dp, { dark: dk * hi, pw: 1.3, lip: lp * hi });
    }
    // the worn inner corner of the rim is nicked all along
    for (let n = 0; n < 150; n++) {
      const uu = rm.range(-1100, 1100), [px, py] = toPx(uu, W0 + rm.range(-1.6, 1.2)), rn = rm.range(0.7, 1.9);
      stamp(px, py, rn * rm.range(1, 2.6), rn * 0.55, uu / R + rm.range(-0.2, 0.2), rn * rm.range(0.12, 0.3) * hi * (rm.chance(0.25) ? -0.6 : 1), { pw: 1.5 });
    }
    // sparks for the travelling light: finer than the dashes above
    for (let n = 0; n < 1300; n++) {
      const u0 = rm.range(-1090, 1090), d0 = n < 950 ? rm.range(18, W0 - 5) : rm.range(W1 + 6, W1 + 170), ln = rm.range(2.2, 7);
      const [xa, ya] = toPx(u0, d0), [xb, yb] = toPx(u0 + ln, d0);
      line(Gl, xa, ya, xb, yb, 0, 0.36, rm.range(0.25, 0.8) * (n < 950 ? 1 : 0.6) * hi, 2, -1);
    }
  }
  for (let k = 0; k < N; k++) if (Sc[k] > 0) { const g = Gh[k]; Hh[k] -= Sc[k] * (1 - 3.2 * g * (1 - g)); }   // scratches skip the flanks of the strokes
  Sc = null;

  // 5) total height → soft shadows (march toward the light) and a hollows / proud-edges map (height against its own blur)
  const HT = new Float32Array(N);
  for (let k = 0; k < N; k++) HT[k] = mh(Dw[k]) + Hh[k];
  const bTmp = new Float32Array(N);
  const boxBlur = (src, rad, out = new Float32Array(N)) => {
    const tmp = bTmp, iw = 1 / (2 * rad + 1);
    for (let j = 0; j < PH; j++) {
      const o = j * PW; let acc = 0;
      for (let i = -rad; i <= rad; i++) acc += src[o + Math.min(PW - 1, Math.max(0, i))];
      for (let i = 0; i < PW; i++) { tmp[o + i] = acc * iw; acc += src[o + Math.min(PW - 1, i + rad + 1)] - src[o + Math.max(0, i - rad)]; }
    }
    // columns, a strip of them at a time (kind to the cache on a 4K-wide grid)
    const BS = 64, acc = new Float64Array(BS);
    for (let i0 = 0; i0 < PW; i0 += BS) {
      const bn = Math.min(BS, PW - i0);
      acc.fill(0, 0, bn);
      for (let j = -rad; j <= rad; j++) { const o = Math.min(PH - 1, Math.max(0, j)) * PW + i0; for (let b = 0; b < bn; b++) acc[b] += tmp[o + b]; }
      for (let j = 0; j < PH; j++) {
        const o = j * PW + i0, oa = Math.min(PH - 1, j + rad + 1) * PW + i0, ob = Math.max(0, j - rad) * PW + i0;
        for (let b = 0; b < bn; b++) { out[o + b] = acc[b] * iw; acc[b] += tmp[oa + b] - tmp[ob + b]; }
      }
    }
    return out;
  };
  const HB = boxBlur(boxBlur(HT, 6 * q), 6 * q), HW = boxBlur(boxBlur(HB, 15 * q), 15 * q);
  // steps of the march: every device pixel near the point, every logical pixel further out (the far occluder is the rim, and it is smooth)
  const SMAX = 86, SD = [];
  for (let s = 1; s <= SMAX * q; s++) if (s <= 14 * q || s % q === 0) SD.push(s);
  const NS = SD.length, OX = new Int32Array(NS), OY = new Int32Array(NS), OF = new Int32Array(NS), IV = new Float32Array(NS);
  let nGly = 0, nDef = 0;
  { const sn = Math.hypot(LX, LY); for (let n = 0; n < NS; n++) { const s = SD[n]; OX[n] = Math.round((s * LX) / sn); OY[n] = Math.round((s * LY) / sn); OF[n] = OY[n] * PW + OX[n]; IV[n] = q / Math.hypot(OX[n], OY[n]); if (s <= 38 * q) nGly = n + 1; if (s <= 10 * q) nDef = n + 1; } }
  let SH = new Float32Array(N);
  for (let j = 0; j < PH; j++) {
    const inGly = Y0 + (j + 0.5) * iq > GLY.yT - 8;
    for (let i = 0; i < PW; i++) {
      const k = j * PW + i; if (Dd[k] < 0) continue;
      const dw = Dw[k], lim = dw > W0 - 4 && dw < W1 + 84 ? NS : inGly && Math.abs(X0 + (i + 0.5) * iq - cx) < GLY.A + 44 ? nGly : nDef;
      const h0 = HT[k]; let m = 0;
      for (let n = 0; n < lim; n++) {
        const jj = j + OY[n]; if (jj < 0) break;
        const ii = i + OX[n]; if (ii < 0 || ii >= PW) break;
        const sl = (HT[k + OF[n]] - h0) * IV[n]; if (sl > m) m = sl;
      }
      SH[k] = sstep(0.3, 1.2, m);                              // a broad soft source: penumbra from 17° to 50° of horizon
    }
  }
  SH = boxBlur(SH, 1);

  // 6) shade → base colour + "sheen" (response to the travelling light)
  if (!d8) d8 = new Uint8ClampedArray(N * 4);
  const s8 = new Uint8ClampedArray(N * 4);
  const U0 = -140, SIG = 1650, AMB = 0.13, HZ7 = Math.pow(HZ, 7);
  const PN = 4096, P46 = new Float32Array(PN + 1), P20 = new Float32Array(PN + 1);
  for (let i = 0; i <= PN; i++) { P46[i] = Math.pow(i / PN, 46); P20[i] = Math.pow(i / PN, 20); }
  for (let j = 0; j < PH; j++) {
    const ly = (j + 0.5) * iq, ddy = cy - (Y0 + ly), jm = j > 0 ? -PW : 0, jp = j < PH - 1 ? PW : 0;
    for (let i = 0; i < PW; i++) {
      const k = j * PW + i, dd = Dd[k];
      if (dd < -1.5) continue;
      const lx = (i + 0.5) * iq, ddx = X0 + lx - cx, rr = R - dd, sn = ddx / rr, cs = ddy / rr, u = Uu[k], dW = Dw[k];
      let hx = (Hh[k + (i < PW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5 * q, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5 * q;
      const ui = Math.max(0, Math.min(UM * 2, Math.round(u) + UM)), ms = macroSlope(dW, EDG[ui]);
      hx -= ms * sn; hy += ms * cs;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const nl = (-hx * LX - hy * LY + LZ) * inv, nh = (-hx * HX - hy * HY + HZ) * inv, nb = (-hx * BX - hy * BY + BZ) * inv;
      const fdf = Math.max(0, Math.min(799.99, dd)), fdi = fdf | 0;
      const lat = (u - U0) / SIG, F = (FD[fdi] + (FD[fdi + 1] - FD[fdi]) * (fdf - fdi)) * Math.exp(-lat * lat);
      const gh = Gh[k], cav = Cv[k], sh = SH[k], st = St[k];
      // hollows (the foot of the wall, the feet of the strokes, the holes) and proud edges, away from the limb
      const lm = sstep(24, 60, dd), dv = HT[k] - HB[k];
      const occ = dv < 0 ? Math.min(1, -dv / 5.2) * lm : 0, wear = dv > 0 ? Math.min(1, dv / 4) * lm : 0;
      // key light, taken away by the soft shadow
      let I = F * (AMB + (Math.max(AMB, 0.7 + 1.15 * (nl - LZ)) - AMB) * (1 - 0.95 * sh));
      // the shoulder turns edge-on at the limb and mirrors the dark around it
      I *= 0.4 + 0.6 * sstep(-1, 10, dd);
      // what faces the lit field glows with it (the wall of the rim, the lower flanks of the strokes): on the wall this is
      // what makes it a face of its own — dark under the corner, warming toward its foot
      const wall = sstep(W0 - 1, W0 + 5, dW) * (1 - sstep(W1 - 3, W1 + 3, dW));
      if (nb > BZ) I += F * BNC[ui] * (1 + 1.05 * wall) * Math.pow((nb - BZ) / (1 - BZ), 1.3) * sstep(2.5 + 2.5 * wall, -1.5, dv) * (1 - (0.8 - 0.25 * wall) * occ);
      I *= 1 - 0.6 * occ;
      // the rim keeps a little of the light off the field for a long way in
      if (dW > RIM) I *= 1 - 0.13 * (1 - sstep(RIM, RIM + 150, dW));
      // … and the shadow at the foot of its wall has two parts: an umbra — a firm dark core in the crease and a few pixels
      // out onto the field, where none of the source is seen — and a penumbra that thins away for a long way, its reach
      // wandering along the rim
      let pen = 0, umb = 0;
      if (dW > W1 - 10) {
        const bw = BNC[ui] / 0.088, qd = dW - (W1 - 5);
        if (qd > 0) pen = (0.16 * Math.exp(-qd / 15) + 0.08 * Math.exp(-qd / 56)) * bw;
        umb = sstep(W1 - 10, W1 - 3.5, dW) * (0.3 + 0.24 * sstep(W1 - 3, W1 + 1, dW)) * (1 - sstep(W1 + 2.5 * bw, W1 + 10 * bw, dW));
        I *= (1 - pen) * (1 - umb);
      }
      // the worn inner corner of the rim catches a thread of light
      const ce = (dW - (W0 - 1)) / 3.4;
      if (ce > -3 && ce < 3) {
        let th = Math.exp(-ce * ce);
        // (4K) … with a hair-fine core that breaks into dashes where the corner is nicked
        if (hi > 0) { const cf = (dW - (W0 - 0.7)) / 0.8; th += hi * 0.9 * Math.exp(-cf * cf) * L.clamp(0.55 + 0.75 * nD.n2(u / 6.5, 2.7) + 0.3 * nD.n2(u / 31, 9.1)); }
        I += F * THR[ui] * th * (1 - Math.min(1, cav * 4));
      }
      // high points are rubbed brighter
      I *= 1 + 0.15 * gh + 0.1 * wear;
      const top = sstep(EDGE - 12, EDGE + 8, dd) * (1 - sstep(W0 - 6, W0 + 6, dW));
      const cm = bil(cMed, cw, CS, lx, ly), gl = bil(cGl, gw, CG, lx, ly);
      // the turning lines belong to the light that falls on them (in shadow they sink with it, and the cast wall has none);
      // they show best where the satin is brightest
      I *= 1 + st * L.lerp(0.046, 0.12, top) * (1 + 0.4 * gl * top) * (1 - wall);
      I *= 1 + L.lerp(0.075, 0.1, top) * cm + 0.028 * gl;
      // toning: where relief shelters the surface from handling (along the foot of the rim, around the strokes) the gold
      // has kept a deeper, redder skin; out in the open it is rubbed paler
      const dv2 = HT[k] - HW[k], tone = dv2 < 0 ? Math.min(1, -dv2 / 7) * lm : 0;
      I *= 1 - 0.07 * tone;
      // … and a thin, uneven seam of that skin hugs the foot of every stroke, on the lit side too — it is what stands the
      // relief off the field
      const gf = Gf[k] * (0.65 + 0.5 * L.clamp(0.5 + cm));
      if (gf > 0) I *= 1 - 0.15 * gf;
      // a tight glint + the broad, soft lustre of a surface polished by handling (uneven, like the satin itself)
      const ni = nh > 0 ? (nh * PN + 0.5) | 0 : 0, sp = P46[ni], lit = 1 - 0.9 * sh;
      I += sp * 0.32 * F * lit * (1 + 0.55 * gl);
      if (gh > 0 && nh > HZ) I += F * 0.38 * gh * (1 + 0.45 * cm) * ((Math.pow(nh, 7) - HZ7) / (1 - HZ7)) * lit;   // the satin lustre of handled gold, never quite even
      if (cav > 0) I *= 1 - cav;
      // the far wall of every sand hole looks straight at the light
      const lp = Lp[k];
      if (lp > 0) I += F * 0.3 * lp * (1 - 0.6 * sh);
      const li = Math.max(0, Math.min(NL - 1, (I / IMAX) * (NL - 1) | 0)) * 3, o = k * 4;
      const al = L.clamp(dd * q + 0.5);
      // the field runs a shade hotter (more orange) than the burnished rim and stroke tops; hollows run redder still
      const ft = sstep(RIM - 8, RIM + 4, dW) * (1 - 0.55 * gh);
      const nk = (-hx * KX - hy * KY + KZ) * inv, kick = nk > 0 ? Math.min(1, Math.pow(nk, 6) * 1.5) * (1 - cav) * (1 - 0.45 * sstep(0.04, 0.4, gh)) : 0;
      const warm = L.clamp(0.5 * tone - 0.3 * cm - 0.12 * gl, -0.5, 1), ps = pen + 0.7 * umb;
      const gm = (1 - 0.05 * ft) * (1 - 0.3 * kick) * (1 - 0.07 * occ) * (1 - 0.045 * warm) * (1 - 0.28 * ps) * (1 - 0.06 * gf), bm = (1 - 0.16 * ft) * (1 - 0.62 * kick) * (1 - 0.2 * occ) * (1 - 0.16 * warm) * (1 - 0.8 * ps) * (1 - 0.2 * gf);
      d8[o] = RAMP[li]; d8[o + 1] = RAMP[li + 1] * gm; d8[o + 2] = RAMP[li + 2] * bm; d8[o + 3] = al * 255;
      // sheen: broad lobe + sparkle of the polishing lines + drawn micro-glints
      let sb = P20[ni] * (0.8 + 0.9 * Math.max(0, st)) + top * 0.42 * (1 + 0.9 * st) * (1 + 0.35 * gl) + Gl[k] * (0.3 + 0.5 * top);
      sb *= (1 - cav) * al * sstep(-1, 7, dd) * (1 - 0.8 * sh);
      s8[o] = 255; s8[o + 1] = 216; s8[o + 2] = 124; s8[o + 3] = L.clamp(sb) * 255;
    }
  }
  // (4K) the slow push-in re-samples this bitmap on every frame, and that softens exactly the finest generation of detail:
  // lift it a little beforehand (a 3 × 3 unsharp; the limb, which is thrown out of focus anyway, is left alone)
  if (hi > 0) {
    const am = 0.34 * hi, A = St, B = Lp;
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < N; k++) A[k] = d8[k * 4 + c];
      boxBlur(A, 1, B);
      for (let k = 0; k < N; k++) if (Dd[k] > 5) d8[k * 4 + c] = A[k] + am * (A[k] - B[k]);
    }
  }
  return { RW, RH, PW, PH, X0, Y0, rgba: d8, sheen: s8 };
}

function buildCoin(env) {
  const a = env.arc, R = a.R;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3, RW = W + PAD * 2, RH = H + PAD - Y0, cxl = a.cx - X0, cyl = a.cy - Y0;
  // both layers are computed and written in device pixels: at 4K the relief is shaded natively, not enlarged
  let px = null;
  const coin = L.pixelCanvas(RW, RH, (data, pw, ph, q) => { px = shadeCoin(a, q, data); }), g = coin.getContext('2d');
  const sheen = L.pixelCanvas(RW, RH, (data) => { data.set(px.sheen); });
  px = null;

  // shallow depth of field: the bottom of frame (nearest the lens) softens in two steps, never to mush —
  // the bevels of the strokes and the seam at their feet must still read
  const soften = (blur, d0, d1) => {
    const b = L.blurred(coin, blur), bg = b.getContext('2d');
    bg.globalCompositeOperation = 'destination-in';
    bg.fillStyle = L.radial(bg, cxl, cyl, R - d1, R - d0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    bg.fillRect(0, 0, RW, RH);
    g.drawImage(b, 0, 0);
  };
  soften(1.0, 380, 520); soften(2.0, 500, 640);
  // … and so does the far limb (a true cross-fade: the soft copy replaces the sharp one, alpha edge included): the rounded
  // shoulder is out of focus, the top face of the rim comes sharp quickly below it
  const far = L.blurred(coin, 2.3), fg = far.getContext('2d');
  const limbMask = (c) => { c.fillStyle = L.radial(c, cxl, cyl, R - 58, R - 7, [[0, 'rgba(0,0,0,0)'], [0.4, 'rgba(0,0,0,0.14)'], [0.75, 'rgba(0,0,0,0.58)'], [1, 'rgba(0,0,0,1)']]); c.fillRect(0, 0, RW, RH); };
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
    // (painted only in the band where it can show: above it the glow has died, below it the coin is opaque)
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 2, a.R + 96, [[0, 'rgba(190,52,10,0.95)'], [0.06, 'rgba(140,34,8,0.9)'], [0.22, 'rgba(86,20,6,0.62)'], [0.5, 'rgba(56,12,4,0.24)'], [1, 'rgba(20,4,1,0)']]);
    const gy0 = Math.max(0, Math.floor(a.crestY - 100)), gy1 = Math.min(H, Math.ceil(Math.max(a.yAt(0), a.yAt(W)) + 24));
    ctx.fillRect(0, gy0, W, gy1 - gy0);
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

    // travelling highlight: the sheen layer seen through a soft window sliding along the rim (only the window's own box —
    // a 470 × 282 ellipse, tilted by at most the highlight's angle — is ever touched)
    const t = S.tmp.getContext('2d');
    const wc = a.pt(thH, -RIM * 0.4);
    const bx0 = Math.max(0, Math.floor(wc.x - 474)), bx1 = Math.min(W, Math.ceil(wc.x + 474)), by0 = Math.max(S.TY, Math.floor(wc.y - 294)), by1 = Math.min(H, Math.ceil(wc.y + 294));
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, S.tmp.width, S.tmp.height);
    if (bx1 > bx0 && by1 > by0) {
      t.translate(0, -S.TY);
      t.save(); t.beginPath(); t.rect(bx0, by0, bx1 - bx0, by1 - by0); t.clip();
      t.save(); camT(t); t.drawImage(S.sheen, S.X0, S.Y0); t.restore();
      t.globalCompositeOperation = 'destination-in';
      a.at(t, thH, -RIM * 0.4, () => {
        t.scale(1, 0.6);
        t.fillStyle = L.radial(t, 0, 0, 0, 470, [[0, 'rgba(0,0,0,0.9)'], [0.3, 'rgba(0,0,0,0.6)'], [0.62, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]);
        t.fillRect(-4000, -4000, 8000, 8000);
      });
      t.restore();
      ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(S.tmp, bx0, by0 - S.TY, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
      ctx.restore();
    }

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
