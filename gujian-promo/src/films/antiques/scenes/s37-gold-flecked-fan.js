// s37 — 泥金朱红折扇. Macro of the upper edge of an opened vermilion folding fan against pure black: the arc is the
// top edge of the leaf (扇面上缘), bound with a narrow strip of gold-powder paper (泥金镶边) whose cut edge has gone
// pale and fuzzy. Below it the leaf is pleated — mountain and valley folds alternate at equal angles and every fold
// line runs down toward the rivet (扇钉), i.e. toward the arc's own centre — and sprinkled with gold-leaf flakes (洒金).
// No writing, no seal: the leaf is plain.
//
// Everything under the arc is shaded per pixel in init(): each pixel is mapped to (pleat, position across the face,
// depth below the edge); the pleat is a real zig-zag height field lit by one raking key light from the upper left, so
// the faces turned to the light glow vermilion → orange, the ridge throws a cast shadow into the next valley, and the
// faces turned away sit in deep crimson, warmed only by the red light bounced off their neighbour.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;        // the move is tiny (5 frames) → a small margin is plenty
const TOP = 84;        // the baked picture starts this far above the crest (room for the fuzz and the bloom)
const PITCH = 116;     // ridge-to-ridge distance along the top edge (px)
const EZ = 4.0;        // the pleats make the top edge a shallow zig-zag: ± this many px around the arc
const STRIP = 17;      // width of the gold binding strip
const RHO = 3.0;       // radius of the rounded mountain fold
const IMAX = 1.7, NLUT = 1024;
const BLACK = '#040303';
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** colour ramp over illumination 0..IMAX → flat Float32 LUT */
function lut(stops) {
  const f = L.makeRamp(stops.map(([i, c]) => [i / IMAX, c]));
  const out = new Float32Array(NLUT * 3);
  for (let i = 0; i < NLUT; i++) { const c = f(i / (NLUT - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** separable box blur of a Float32 field (in place, `tmp` is scratch) */
function boxBlur(src, tmp, w, h, r) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[o + (x < 0 ? 0 : x)];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc * k; const a = x - r, b = x + r + 1; acc += src[o + (b >= w ? w - 1 : b)] - src[o + (a < 0 ? 0 : a)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[(y < 0 ? 0 : y) * w + x];
    for (let y = 0; y < h; y++) { src[y * w + x] = acc * k; const a = y - r, b = y + r + 1; acc += tmp[(b >= h ? h - 1 : b) * w + x] - tmp[(a < 0 ? 0 : a) * w + x]; }
  }
}

/** the pleats: valley → ridge → valley …, equal angles with the unevenness of an old fan opened by hand */
function buildFolds(a) {
  const r = L.rng('s37folds'), nz = L.makeNoise('s37fold');
  const thS = Math.atan2(W / 2 + PAD, a.cy - (H + PAD)) + 0.05;   // widest angle the picture reaches (its bottom corners)
  const P = PITCH / a.R;
  const pit = [];
  let t = -thS - P * 1.37;
  while (t < thS + P * 1.4) {
    const w = P * (1 + r.range(-0.1, 0.1));
    const u = L.clamp(t / thS, -1, 1);
    // the face turned to the light also turns a little toward the lens → it looks wider than the shaded one
    const af = L.clamp(0.61 - 0.035 * u + r.range(-0.08, 0.08), 0.48, 0.72);
    pit.push({
      v0: t, rg: t + w * af, A: PITCH * r.range(0.34, 0.5), gain: r.range(0.88, 1.08), bowL: r.range(0.0, 0.4), bowS: r.range(-0.2, 0.2),
      hue: r.range(-1, 1), ribTip: r.range(70, 220), ribC: r.range(0.44, 0.58), seed: r.range(0, 200), ez: r.range(0.75, 1.2), tip: r.chance(0.65) ? r.range(0.3, 1) : 0,
    });
    t += w;
  }
  const n = pit.length;
  const base = new Float32Array(n * 2 + 1);
  for (let i = 0; i < n; i++) { base[i * 2] = pit[i].v0; base[i * 2 + 1] = pit[i].rg; }
  base[n * 2] = t;
  // every fold line wanders a little on its way down; a few have a soft kink where the leaf was once pinched
  const NQ = 190, QS = 4, D0 = -28;
  const off = new Float32Array((n * 2 + 1) * NQ);
  for (let f = 0; f <= n * 2; f++) {
    const kink = r.chance(0.25) ? r.range(-7, 7) : 0, kd = r.range(120, 480);
    for (let q = 0; q < NQ; q++) {
      const d = D0 + q * QS;
      off[f * NQ + q] = (3.8 * nz.n2(f * 13.7, d / 230) + 1.4 * nz.n2(f * 5.1 + 40, d / 70) + kink * sstep(kd - 80, kd + 80, d)) * sstep(-10, 60, d) / a.R;
    }
  }
  return { n, pit, base, off, NQ, QS, D0, thS, thMin: base[0], thEnd: base[n * 2] };
}

/** which pleat face is at (theta, depth)? (slow path, used for the handful of things placed by hand) */
function faceAt(F, th, d) {
  const { base, off, NQ, QS, D0, n } = F;
  let q = (d - D0) / QS; q = q < 0 ? 0 : q > NQ - 1.001 ? NQ - 1.001 : q;
  const q0 = q | 0, qf = q - q0;
  const FT = (f) => base[f] + off[f * NQ + q0] + (off[f * NQ + q0 + 1] - off[f * NQ + q0]) * qf;
  let idx = L.clamp(Math.floor(((th - F.thMin) / (F.thEnd - F.thMin)) * n), 1, n - 2);
  while (idx > 1 && th < FT(idx * 2)) idx--;
  while (idx < n - 2 && th >= FT(idx * 2 + 2)) idx++;
  const v0 = FT(idx * 2), rg = FT(idx * 2 + 1), v1 = FT(idx * 2 + 2);
  const lit = th < rg, s = lit ? (th - v0) / (rg - v0) : (th - rg) / (v1 - rg);
  return { idx, lit, s, hn: lit ? s : 1 - s };
}

/** gold-leaf flakes and gold dust, drawn into a mask (alpha = coverage, red = how brightly this flake answers the light) */
function buildFlakes(a, F, RW, RH, X0, Y0) {
  const c = L.makeCanvas(RW, RH), g = c.getContext('2d', { willReadFrequently: true });
  g.translate(-X0, -Y0);
  const r = L.rng('s37gold'), nz = L.makeNoise('s37dens');
  const thS = F.thS;
  // sprinkled by hand: drifts and bare patches
  const dens = (th, d) => L.clamp(0.42 + 1.05 * nz.fbm((th * a.R) / 520 + 3, d / 330 - 1, 2) + 0.22 * nz.n2((th * a.R) / 110, d / 110), 0, 1);
  const glints = [];
  // dust
  for (let n = 0; n < 22000; n++) {
    const th = r.range(-thS, thS), d = STRIP + 5 + r() * 660, dn = dens(th, d), rad = 0.7 + 1.5 * Math.pow(r(), 2.6), v = Math.round(255 * Math.pow(r(), 1.5)), al = r.range(0.45, 1);
    if (r() > dn * dn * 1.3 + 0.02) continue;
    const p = a.pt(th, -d);
    g.globalAlpha = al; g.fillStyle = `rgb(${v},0,0)`;
    g.beginPath(); g.arc(p.x, p.y, rad, 0, L.TAU); g.fill();
  }
  g.globalAlpha = 1;
  // torn flakes of leaf: small ones first, the big ones on top
  const flake = (big) => {
    const th = r.range(-thS, thS), d = STRIP + 10 + r() * 650, dn = dens(th, d);
    const rad = big ? 5.5 + 12 * Math.pow(r(), 2.0) : 2.0 + 3.6 * Math.pow(r(), 1.4);
    const nv = r.int(5, 8), rotA = r.range(0, L.TAU), sq = r.range(0.45, 1), v = Math.round(255 * Math.pow(r(), 1.7));
    const pts = [];
    for (let k = 0; k < nv; k++) {
      const an = (k / nv) * L.TAU + r.range(-0.35, 0.35), rr = rad * r.range(0.5, 1.15);
      const lx = Math.cos(an) * rr, ly = Math.sin(an) * rr * sq;
      pts.push([lx * Math.cos(rotA) - ly * Math.sin(rotA), lx * Math.sin(rotA) + ly * Math.cos(rotA)]);
    }
    if (r() > dn * (big ? 1.1 : 1.25)) return;
    const p = a.pt(th, -d);
    g.fillStyle = `rgb(${v},0,0)`;
    g.beginPath(); pts.forEach((q, k) => (k ? g.lineTo(p.x + q[0], p.y + q[1]) : g.moveTo(p.x + q[0], p.y + q[1]))); g.closePath(); g.fill();
    const fc = faceAt(F, th, d);
    if (rad > 2.6 && fc.lit && fc.s > 0.4 && fc.s < 0.95) glints.push({ th, d, rad, pts, k: v / 255, ph: r(), ph2: r() });
  };
  for (let n = 0; n < 3600; n++) flake(false);
  for (let n = 0; n < 560; n++) flake(true);
  return { data: g.getImageData(0, 0, RW, RH).data, glints };
}

/** paper fibres and a few handling creases as a little height map (128 = flat) */
function buildDetail(a, RW, RH, X0, Y0) {
  const c = L.makeCanvas(RW, RH), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#808080'; g.fillRect(0, 0, RW, RH);
  g.translate(-X0, -Y0);
  const r = L.rng('s37fibre');
  g.lineCap = 'round';
  for (let n = 0; n < 3400; n++) {
    const x = r.range(X0, X0 + RW), y = r.range(Y0, Y0 + RH), len = r.range(10, 70), an = r.range(0, Math.PI), bend = r.range(-0.5, 0.5);
    const up = r.chance(0.78);
    g.strokeStyle = up ? `rgba(255,255,255,${r.range(0.15, 0.7)})` : `rgba(0,0,0,${r.range(0.1, 0.45)})`;
    g.lineWidth = r.range(0.7, 1.8);
    const mx = x + Math.cos(an) * len * 0.5 + Math.cos(an + 1.57) * len * bend * 0.4, my = y + Math.sin(an) * len * 0.5 + Math.sin(an + 1.57) * len * bend * 0.4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  // soft creases running across a pleat or two (the leaf has been opened and shut many times)
  const s = a.span(PAD);
  for (let n = 0; n < 22; n++) {
    const t0 = r.range(-s, s), dl = r.range(0.02, 0.075), d0 = r.range(40, 620), tilt = r.range(-34, 34);
    const pts = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8, p = a.pt(t0 + dl * u, -(d0 + tilt * u + r.range(-3, 3))); pts.push([p.x, p.y]); }
    const sp = L.smoothPath(pts, 5), al = r.range(0.3, 0.75);
    for (const [dy, col, lw] of [[1.3, `rgba(0,0,0,${al})`, 2.6], [-0.9, `rgba(255,255,255,${al * 0.8})`, 1.8]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); sp.forEach((p, k) => (k ? g.lineTo(p[0], p[1] + dy) : g.moveTo(p[0], p[1] + dy))); g.stroke();
    }
  }
  return g.getImageData(0, 0, RW, RH).data;
}

function buildFan(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  let _t = performance.now(); const _mark = (nm) => { const t2 = performance.now(); console.warn('s37 ' + nm + ' ' + (t2 - _t).toFixed(0)); _t = t2; };   // TEMP-TIMING
  const F = buildFolds(a);
  const { n, pit, base, off, NQ, QS, D0 } = F;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 18;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s37a'), nB = L.makeNoise('s37b');

  const PAPER = lut([[0, '#060101'], [0.07, '#170403'], [0.16, '#300705'], [0.28, '#5a0f0b'], [0.42, '#82160d'], [0.58, '#ab1f11'], [0.74, '#ca2916'],
    [0.88, '#dc331b'], [1.0, '#ec4020'], [1.12, '#f9562b'], [1.25, '#ff6e3c'], [1.42, '#ff8f5c'], [1.7, '#ffbd96']]);
  const GOLD = lut([[0, '#0e0602'], [0.12, '#2e1806'], [0.3, '#6a3f10'], [0.5, '#a8741f'], [0.7, '#d19a32'], [0.9, '#e6b84a'], [1.05, '#f1c654'], [1.25, '#ffdc78'], [1.7, '#fff3c0']]);

  // theta → pleat index
  const NL = 4096, thMin = base[0], thEnd = base[n * 2], invStep = NL / (thEnd - thMin);
  const plut = new Uint16Array(NL);
  for (let q = 0, i = 0; q < NL; q++) { const th = thMin + (q + 0.5) / invStep; while (i < n - 1 && th >= base[i * 2 + 2]) i++; plut[q] = i; }
  const pA = new Float32Array(n), pGain = new Float32Array(n), pBowL = new Float32Array(n), pBowS = new Float32Array(n), pHue = new Float32Array(n),
    pRibT = new Float32Array(n), pRibC = new Float32Array(n), pSeed = new Float32Array(n), pEz = new Float32Array(n), pTip = new Float32Array(n);
  pit.forEach((p, i) => { pA[i] = p.A; pGain[i] = p.gain; pBowL[i] = p.bowL; pBowS[i] = p.bowS; pHue[i] = p.hue; pRibT[i] = p.ribTip; pRibC[i] = p.ribC; pSeed[i] = p.seed; pEz[i] = p.ez; pTip[i] = p.tip; });

  // 1) slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWarp = new Float32Array(cw * ch), cSlope = new Float32Array(cw * ch), cMott = new Float32Array(cw * ch), cAmp = new Float32Array(cw * ch),
    cPool = new Float32Array(cw * ch), cEdge = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, ddx = x - cx, ddy = cy - y, rr = Math.hypot(ddx, ddy);
    const th = Math.atan2(ddx, ddy), U = th * R, d = R - rr, k = j * cw + i;
    cWarp[k] = 1.6 * nA.n2(U / 380, d / 240) + 0.8 * nA.n2(U / 140 + 31, d / 110 + 5);                     // the whole sheet is not quite true (px)
    cSlope[k] = 0.26 * nA.fbm(U / 70 + 80, d / 170 - 20, 2) + 0.1 * nB.n2(U / 23, d / 58);               // paper cockles between the ribs
    cMott[k] = nB.fbm(U / 120 - 7, d / 140 + 3, 3);                                                     // the vermilion wash is not perfectly even
    cAmp[k] = nB.n2(U / 260 + 50, d / 300);
    const px = (x - 700) / 760, py = (y - (a.crestY + 150)) / 430;
    cPool[k] = (0.88 + 0.34 * Math.exp(-(px * px + py * py))) * (1 - 0.16 * sstep(0.12, 0.5, th)) * (1 - 0.24 * sstep(240, 660, d));   // the key light's pool
    cEdge[k] = 1.1 * nB.n2(U / 26, 3.3) + 0.6 * nB.n2(U / 7, 9.1);                                       // raggedness of the cut edge
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  _mark('coarse');
  // 2) fine relief: paper tooth (two grain sizes) + fibres + creases
  const wh = new Float32Array(N), sm = new Float32Array(N), md = new Float32Array(N), tmp = new Float32Array(N), Hd = new Float32Array(N);
  const rw = L.rng('s37grain');
  for (let k = 0; k < N; k++) { wh[k] = rw() - 0.5; md[k] = rw() - 0.5; }
  sm.set(wh); boxBlur(sm, tmp, RW, RH, 1);      // σ ≈ 0.1
  boxBlur(md, tmp, RW, RH, 2); boxBlur(md, tmp, RW, RH, 2);   // clumps a few px across, σ ≈ 0.03
  _mark('grain');
  const dpx = buildDetail(a, RW, RH, X0, Y0);
  _mark('detail');
  for (let k = 0; k < N; k++) Hd[k] = 2.0 * sm[k] + 14 * md[k] + 0.85 * (dpx[k * 4] - 128) / 127;
  const FLK = buildFlakes(a, F, RW, RH, X0, Y0), FL = FLK.data;

  _mark('flakes');
  // 3) shade
  const img = new ImageData(RW, RH), out = img.data;
  let Lx = -0.83, Ly = -0.27, Lz = 0.53; { const m = Math.hypot(Lx, Ly, Lz); Lx /= m; Ly /= m; Lz /= m; }
  let Hx = Lx, Hy = Ly, Hz = Lz + 1; { const m = Math.hypot(Hx, Hy, Hz); Hx /= m; Hy /= m; Hz /= m; }
  const BNC = 0.46;
  for (let j = 1; j < RH - 1; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 1; i < RW - 1; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -8) continue;
      const k = j * RW + i, sn = ddx / rr, cs = ddy / rr;
      const warp = bil(cWarp, i, j);
      const th = Math.atan2(ddx, ddy) + warp / R;
      // ── which pleat, which face ──
      let q = (d - D0) / QS; if (q < 0) q = 0; else if (q > NQ - 1.001) q = NQ - 1.001;
      const q0 = q | 0, qf = q - q0;
      let li = ((th - thMin) * invStep) | 0; li = li < 0 ? 0 : li >= NL ? NL - 1 : li;
      let idx = plut[li]; if (idx < 1) idx = 1; else if (idx > n - 2) idx = n - 2;
      let f0 = idx * 2, o = f0 * NQ + q0;
      let v0 = base[f0] + off[o] + (off[o + 1] - off[o]) * qf;
      if (th < v0 && idx > 1) { idx--; f0 -= 2; o = f0 * NQ + q0; v0 = base[f0] + off[o] + (off[o + 1] - off[o]) * qf; }
      o = (f0 + 2) * NQ + q0;
      let v1 = base[f0 + 2] + off[o] + (off[o + 1] - off[o]) * qf;
      if (th >= v1 && idx < n - 2) { idx++; f0 += 2; v0 = v1; o = (f0 + 2) * NQ + q0; v1 = base[f0 + 2] + off[o] + (off[o + 1] - off[o]) * qf; }
      o = (f0 + 1) * NQ + q0;
      const rg = base[f0 + 1] + off[o] + (off[o + 1] - off[o]) * qf;
      const wl = rr * (rg - v0), ws = rr * (v1 - rg);
      let lit, s, xv, xs;
      if (th < rg) { lit = 1; s = (th - v0) / (rg - v0); xv = s * wl; xs = -(1 - s) * wl; } else { lit = 0; s = (th - rg) / (v1 - rg); xv = (1 - s) * ws; xs = s * ws; }
      const hn = lit ? s : 1 - s;
      // ── the top edge: a shallow zig-zag (ridges stand a little proud), slightly ragged ──
      const de = d + EZ * pEz[idx] * (2 * hn - 1) + bil(cEdge, i, j) * 0.8;
      if (de < -0.5) continue;
      const cov = de < 0.5 ? de + 0.5 : 1;
      // ── relief ──
      const ampN = bil(cAmp, i, j);
      const amp = pA[idx] * (1 + 0.14 * ampN);
      const ml = amp / wl, ms = amp / ws;
      const tb = sstep(-RHO, RHO, xs);
      const mLe = lit ? ml * (1 + pBowL[idx] * (2 * s - 1)) : ml * (1 + pBowL[idx]);
      const mSe = lit ? ms * (1 - pBowS[idx]) : ms * (1 + pBowS[idx] * (2 * s - 1));
      const m = mLe * (1 - tb) - mSe * tb + bil(cSlope, i, j);
      const gx = (Hd[k + 1] - Hd[k - 1]) * 0.5, gy = (Hd[k + RW] - Hd[k - RW]) * 0.5;
      const Gx = m * cs + gx, Gy = m * sn + gy, inv = 1 / Math.sqrt(1 + Gx * Gx + Gy * Gy);
      const ndl = (Lz - Gx * Lx - Gy * Ly) * inv, ndh = (Hz - Gx * Hx - Gy * Hy) * inv;
      // ── cast shadow of the previous ridge across the valley ──
      let shf = 1;
      if (lit) {
        const Lt = Lx * cs + Ly * sn, kk = Lz / (Lt < -0.2 ? -Lt : 0.2);
        o = (f0 - 1) * NQ + q0;
        const rgP = base[f0 - 1] + off[o] + (off[o + 1] - off[o]) * qf;
        const hv = pA[idx - 1] * (1 + 0.14 * ampN) - kk * rr * (v0 - rgP);
        if (hv > 0) { const ssh = hv / ((ml + kk) * wl), pen = 0.04 + 0.12 * ssh; shf = sstep(ssh - pen, ssh + pen, s + 0.08 * sm[k]); }
      }
      const pool = bil(cPool, i, j) * pGain[idx];
      const ao = 0.1 + 0.9 * sstep(0, 26, xv);
      // the deeper into the V, the less of the light a point sees → every lit face grades from vermilion to orange at its ridge
      const open = lit ? 0.7 + 0.3 * s : 1;
      const edgeGlow = lit && s > 0.5 ? (s - 0.5) * (s - 0.5) * 1.1 * shf * pool : 0;   // 橘色亮边: the paper is thin and bright where it turns over the ridge
      const diff = (ndl > 0 ? ndl : 0) * shf * pool * open + edgeGlow;
      let spec = 0;
      if (ndh > 0) { const h2 = ndh * ndh, h4 = h2 * h2, h8 = h4 * h4, h16 = h8 * h8; spec = h16 * h4 * h2 * 0.26 * shf * pool; }
      // the shaded face is lit only by its red neighbour across the valley: strongest near the ridge, gone in the valley
      const bnc = lit ? 0.04 * (1 - shf) : BNC * (0.15 + 0.85 * (1 - s)) * pool;
      const amb = (0.05 + 0.05 * inv) * ao;
      const mott = bil(cMott, i, j);
      let I = (amb + diff + spec + bnc * ao) * (1 + 0.08 * mott + 0.22 * sm[k]);
      // ── bamboo ribs inside the leaf: a faint darker, slightly raised strip down every lit face ──
      if (lit && de > pRibT[idx]) {
        const dd = de - pRibT[idx], hw = 2.5 + dd * 0.021, xc = (s - pRibC[idx]) * wl, ax = xc < 0 ? -xc : xc;
        if (ax < hw + 5) {
          const vis = sstep(0, 70, dd) * (0.45 + 0.55 * sstep(200, 620, de));
          const e = Math.exp(-((ax - hw) * (ax - hw)) / 4.5);
          I *= 1 - 0.2 * sstep(hw + 1.5, hw - 1.5, ax) * vis;
          I += (xc < 0 ? 0.1 : -0.13) * e * vis * shf;
        }
      }
      if (I < 0) I = 0;
      let ci = ((I / IMAX) * (NLUT - 1)) | 0; if (ci > NLUT - 1) ci = NLUT - 1; ci *= 3;
      let cr = PAPER[ci], cg = PAPER[ci + 1] * (1 + 0.08 * pHue[idx] + 0.07 * mott), cb = PAPER[ci + 2];
      // ── the mountain folds are rubbed: a broken pale line along each ridge ──
      const axs = xs < 0 ? -xs : xs;
      if (axs < 3.4 && de > STRIP) {
        const wn = 0.5 + 0.5 * nA.n2(pSeed[idx], d / 46) + 0.3 * nB.n2(pSeed[idx] + 7, d / 9);
        const wr = sstep(3.4, 0.8, axs) * sstep(0.36, 0.8, wn) * 0.8;
        if (wr > 0) { const tl = 0.5 + 0.55 * (I < 1 ? I : 1); cr += (255 * tl - cr) * wr; cg += (172 * tl - cg) * wr; cb += (124 * tl - cb) * wr; }
      }
      // ── sprinkled gold ──
      const fa = FL[k * 4 + 3];
      if (fa > 0 && de > STRIP) {
        const fg = 0.78 + (FL[k * 4] / 255) * 0.9;
        const Ig = (diff * 1.0 * fg + spec * 3 * fg + amb * 1.4 + bnc * ao * 2.2 * fg) * (1 + 0.9 * sm[k] + 0.1 * mott);
        let gi = ((Ig / IMAX) * (NLUT - 1)) | 0; gi = gi < 0 ? 0 : gi > NLUT - 1 ? NLUT - 1 : gi; gi *= 3;
        const dark = 1 - (lit ? shf : 0), al = (fa / 255) * 0.96;   // in the shade the leaf mirrors the red face opposite
        cr += (GOLD[gi] - cr) * al; cg += (GOLD[gi + 1] * (1 - 0.2 * dark) - cg) * al; cb += (GOLD[gi + 2] * (1 - 0.4 * dark) - cb) * al;
      }
      // ── the gold binding strip and the fuzzy cut edge ──
      if (de < STRIP + 5) {
        const sw = STRIP + 0.6 * warp + 0.9 * nB.n2(th * R / 17, 5.5);
        if (de > sw) { const sh = 1 - 0.4 * sstep(sw + 3, sw, de); cr *= sh; cg *= sh; cb *= sh; }
        const m1 = sstep(sw + 0.6, sw - 0.6, de);
        if (m1 > 0) {
          const fine = nB.n2(th * R / 6, d / 6);
          let Ig = ((ndl > 0 ? ndl : 0) * shf * pool * (lit ? 0.8 + 0.2 * s : 1) + spec * 2 + amb * 1.6 + bnc * ao * 1.9) * (1 + 1.1 * sm[k] + 0.14 * fine + 0.08 * mott);
          if (de > sw - 1.6) Ig += 0.1;
          let gi = ((Ig / IMAX) * (NLUT - 1)) | 0; gi = gi < 0 ? 0 : gi > NLUT - 1 ? NLUT - 1 : gi; gi *= 3;
          const dark = 1 - (lit ? shf : 0);
          let gr = GOLD[gi], gg = GOLD[gi + 1] * (1 - 0.16 * dark), gb = GOLD[gi + 2] * (1 - 0.34 * dark);
          // gold powder rubbed off the ridge corners and in small patches → the buff paper underneath
          const tipW = pTip[idx] * sstep(8, 2, axs) * sstep(STRIP, 3, de);
          const wsp = sstep(0.62, 0.86, 0.5 + 0.4 * fine + 0.3 * mott + tipW * 0.5);
          if (wsp > 0) { const tl = 0.36 + 0.64 * (I < 1 ? I : 1), w2 = wsp * 0.8; gr += (250 * tl - gr) * w2; gg += (210 * tl - gg) * w2; gb += (160 * tl - gb) * w2; }
          cr += (gr - cr) * m1; cg += (gg - cg) * m1; cb += (gb - cb) * m1;
        }
        if (de < 2.6) {   // the cut edge itself faces up into the light all the way along
          const el = sstep(2.6, 0.8, de) * 0.92, tl = L.clamp(0.3 + (ndl > 0 ? ndl : 0) * shf * pool + 0.8 * sm[k], 0, 1);
          cr += (176 + 79 * tl - cr) * el; cg += (104 + 138 * tl - cg) * el; cb += (58 + 150 * tl - cb) * el;
        }
      }
      const o4 = k * 4;
      out[o4] = cr; out[o4 + 1] = cg; out[o4 + 2] = cb; out[o4 + 3] = cov * 255;
    }
  }
  _mark('shade');
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);

  // 4) assemble on a canvas that only covers the picture from just above the arc down (frame coords via translate)
  const Y1 = Math.floor(a.crestY) - TOP, FH = H + PAD - Y1;
  const fan = L.makeCanvas(RW, FH), g = fan.getContext('2d');
  g.translate(-X0, -Y1);
  g.drawImage(cnv, X0, Y0);
  // fibres standing up out of the cut edge (纸边起毛): tufts at the worn ridge corners, a thin fuzz in between
  {
    const r = L.rng('s37fuzz');
    const s = a.span(PAD + 10);
    g.lineCap = 'round';
    for (let nI = 0; nI < 3000; nI++) {
      const th = r.range(-s, s), fc = faceAt(F, th, 0), p = F.pit[fc.idx];
      const near = Math.pow(fc.hn, 5);                    // 1 at a ridge corner
      const base0 = EZ * p.ez * (2 * fc.hn - 1), big = r.chance(0.07);
      const len = (big ? r.range(7, 17) : r.range(1.5, 6.5)) * (0.7 + 0.9 * near * p.tip), tilt = r.range(-1.1, 1.1), bend = r.range(-0.6, 0.6);
      const al = (fc.lit ? r.range(0.3, 0.85) : r.range(0.12, 0.4)) * (big ? 0.6 : 1), lw = r.range(0.5, 1.1), pale = r.chance(0.6);
      if (!r.chance(0.3 + 0.7 * near * (0.3 + p.tip))) continue;
      a.at(g, th, base0 - 0.5, () => {
        g.strokeStyle = L.rgba(pale ? '#ffe8c2' : '#f6c471', al); g.lineWidth = lw;
        const ex = Math.sin(tilt) * len, ey = -Math.cos(tilt) * len;
        g.beginPath(); g.moveTo(0, 1); g.quadraticCurveTo(ex * 0.5 + bend * len * 0.5, ey * 0.5, ex, ey); g.stroke();
      });
    }
  }
  _mark('fuzz');
  // depth of field: sharp around the crest, softening toward the far ends of the edge and toward the bottom of frame
  const side = L.blurred(fan, 2.6), sg = side.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.linear(sg, 0, 0, RW, 0, [[0, 'rgba(0,0,0,1)'], [0.1, 'rgba(0,0,0,0.9)'], [0.3, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [0.9, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,1)']]);
  sg.fillRect(0, 0, RW, FH);
  const deep = L.blurred(fan, 4.2), dg = deep.getContext('2d');
  dg.globalCompositeOperation = 'destination-in';
  dg.fillStyle = L.radial(dg, cx - X0, cy - Y1, R - 640, R - 270, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  dg.fillRect(0, 0, RW, FH);
  g.drawImage(side, X0, Y1); g.drawImage(deep, X0, Y1);

  _mark('dof');
  // bloom (only the hot vermilion and the gold, built at quarter size), then flatten onto the black
  const bw = Math.round(RW / 4), bh = Math.round(FH / 4);
  const b0 = L.makeCanvas(bw, bh), bg = b0.getContext('2d');
  bg.fillStyle = '#000'; bg.fillRect(0, 0, bw, bh);
  bg.filter = 'brightness(0.82) contrast(2.3) saturate(1.25)';
  bg.drawImage(fan, 0, 0, bw, bh);
  bg.filter = 'none';
  const bloom = L.blurred(b0, 5);
  const fin = L.makeCanvas(RW, FH), fg2 = fin.getContext('2d');
  fg2.fillStyle = BLACK; fg2.fillRect(0, 0, RW, FH);
  fg2.drawImage(fan, 0, 0);
  fg2.globalCompositeOperation = 'screen'; fg2.globalAlpha = 0.3;
  fg2.imageSmoothingQuality = 'high';
  fg2.drawImage(bloom, 0, 0, RW, FH);

  _mark('bloom');
  return { fin, X0, Y1, glints: FLK.glints.filter((f) => f.k > 0.35) };
}

export default {
  name: '泥金朱红折扇',
  tone: 'light',
  init(env) {
    S = buildFan(env);
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
    // a breath of slide along the arc and the slightest push-in
    const rot = L.lerp(-0.0035, 0.0035, p), zoom = L.lerp(1.0, 1.008, p), dy = 0.8 * p;
    L.cam(ctx, env, { rot, zoom, dy }, () => {
      ctx.drawImage(S.fin, S.X0, S.Y1);
      // the gold flakes answer the light one after another as the leaf turns
      ctx.globalCompositeOperation = 'lighter';
      const c = L.lerp(-0.27, 0.2, p);
      for (const f of S.glints) {
        const e = (f.th - c - (f.ph - 0.5) * 0.1) / 0.075;
        const tw = Math.max(Math.exp(-e * e) * f.k, 0.7 * Math.pow(Math.max(0, Math.cos((p * 1.3 + f.ph2) * L.TAU)), 12));
        if (tw < 0.05) continue;
        const q = a.pt(f.th, -f.d);
        ctx.fillStyle = `rgba(255,214,120,${(0.6 * tw).toFixed(3)})`;
        ctx.beginPath(); f.pts.forEach((v, k) => (k ? ctx.lineTo(q.x + v[0], q.y + v[1]) : ctx.moveTo(q.x + v[0], q.y + v[1]))); ctx.closePath(); ctx.fill();
        const gr = f.rad * 2.6;
        ctx.fillStyle = L.radial(ctx, q.x, q.y, 0, gr, [[0, `rgba(255,220,140,${(0.32 * tw).toFixed(3)})`], [0.4, `rgba(255,170,80,${(0.1 * tw).toFixed(3)})`], [1, 'rgba(255,140,60,0)']]);
        ctx.fillRect(q.x - gr, q.y - gr, gr * 2, gr * 2);
      }
    });
  },
};
