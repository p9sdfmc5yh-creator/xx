// s29 — 甜白釉碗与紫檀. Straight down on a sweet-white (甜白) bowl standing upside-down on a zitan table, pushed in to
// extreme macro: the arc is the bowl's outline where its lip meets the wood. Below the arc the glazed wall climbs toward
// the lens; above it lies the polished zitan top.
//
// The bowl is shaded per pixel in init(): every pixel under the arc is mapped onto a surface of revolution (a rolled lip,
// a flaring rim, then the steeper wall), so throwing rings, orange-peel, pinholes and one glaze crawl are foreshortened the
// way they are on a real wall. Two versions are baked — in the key light and in shade — and draw() joins them through a
// soft, moving light mask, so the cast shadow slides over the glaze instead of being painted on it. The window reflections
// live on a third layer that lags behind the surface.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 88;
const RAD = Math.PI / 180;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** draw a cropped canvas whose top-left corner sits at frame (ox, oy), rotated about the arc's circle centre */
function put(ctx, a, cnv, ox, oy, rot = 0, blend = 'source-over', alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = blend; ctx.globalAlpha *= alpha;
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(cnv, ox, oy);
  ctx.restore();
}

// ── the cast shadow's edge: leaves the lip just right of the crest, runs out flat, then falls away to the lower right ──
let eW = 0;   // penumbra half-width at the last point asked for
function edgeS(a, x, y) {
  const yy = y - a.crestY, x0 = a.cx + 8;
  let xe, sl;
  if (yy > 0) { const e = Math.exp(-yy / 125); xe = x0 + 0.86 * yy + 150 * (1 - e); sl = 0.86 + 1.2 * e; } else { xe = x0 + 2.06 * yy; sl = 2.06; }
  eW = 20 + 0.19 * (yy > 0 ? yy : 0);
  return (xe - x) / Math.sqrt(1 + sl * sl);   // > 0 on the lit side
}

// ───────────────────────── zitan table top ─────────────────────────
// At this magnification (about 30 px to the millimetre) polished zitan is a dark, glassy ground streaked along the grain,
// its vessels cut open into fine crinkled hairs (牛毛纹) — each one tapered like a hair, some empty and dark, some packed
// with a paler deposit. Nothing is embossed: the surface is flat and waxed, and what tells you so is the sheen that comes
// in from the window side and is combed by the fibre. Focus sits on the bowl's lip; the table melts as it runs away from it.
function buildWood(env) {
  const a = env.arc;
  const ox = -PAD, oy = -PAD;
  const yBot = Math.ceil(a.yAt(W + PAD)) + 30;
  const ww = W + PAD * 2, wh = yBot - oy;
  const nF = L.makeNoise('s29flow');
  // the grain runs across the frame but never dead straight: it drifts, and tips a hair down to the right
  const flow = (x) => 7 * nF.n2(x / 640, 1.7) + 2.4 * nF.n2(x / 190, 9.2) - 0.011 * (x - 960);
  const MV = 28, TH = wh + MV * 2, SL = 16;
  const wavy = (g, tex, alpha, blend) => {
    g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = blend;
    for (let sx = 0; sx < ww; sx += SL) g.drawImage(tex, sx, 0, SL, TH, ox + sx, oy - MV + flow(ox + sx + SL / 2), SL, TH);
    g.restore();
  };
  const c = L.makeCanvas(ww, wh), g = c.getContext('2d');
  g.translate(-ox, -oy);
  const full = (gg) => gg.fillRect(ox, oy, ww, wh);
  g.fillStyle = '#451c18'; full(g);
  // figure: long slow bands of darker and redder wood
  wavy(g, L.noiseTex(ww, TH, { seed: 's29fig', scale: 118, sx: 16, sy: 0.5, octaves: 4, gain: 0.55, warp: 0.25, res: 0.3, contrast: 1.3,
    ramp: [[0, '#260f0e'], [0.38, '#411a16'], [0.7, '#55231b'], [1, '#6c2e22']] }), 0.94, 'source-over');
  // fibre: two scales of fine lines
  const fib1 = L.noiseTex(ww, TH, { seed: 's29fib1', scale: 56, sx: 20, sy: 0.3, octaves: 3, gain: 0.5, res: 0.5, contrast: 1.5 });
  const fib2 = L.noiseTex(ww, TH, { seed: 's29fib2', scale: 30, sx: 34, sy: 0.2, octaves: 3, gain: 0.55, res: 0.5, contrast: 1.7 });
  wavy(g, fib1, 0.3, 'overlay');
  wavy(g, fib2, 0.36, 'soft-light');

  // a few dark streaks (深色纹理): heavy ones up top and out at the sides, only hairlines behind the tagline
  const st = L.makeCanvas(ww, wh), sg = st.getContext('2d'); sg.translate(-ox, -oy);
  const rs = L.rng('s29streak');
  const streak = (y0, wdt, al, x0 = ox - 60, x1 = ox + ww + 60) => {
    const pts = [], ph = rs.range(0, 99);
    for (let x = x0; x <= x1 + 1; x += 90) pts.push([x, y0 + flow(x) + 5 * nF.n2(x / 800, ph)]);
    L.inkStroke(sg, pts, { width: wdt, color: '#190908', seed: 's29st' + Math.round(y0 * 7 + wdt), taper: [0.12, 0.18], wobble: 0.6, alpha: al });
  };
  streak(-52, 16, 0.7); streak(22, 11, 0.62); streak(41, 3, 0.5); streak(104, 5, 0.5); streak(171, 26, 0.62); streak(196, 4, 0.55);
  streak(247, 5, 0.4); streak(292, 8, 0.36); streak(418, 2.6, 0.26); streak(503, 3.2, 0.24);
  streak(628, 13, 0.6, ox - 60, 520); streak(668, 4, 0.5, ox - 60, 380); streak(655, 10, 0.55, 1500); streak(742, 6, 0.5, 1640); streak(790, 14, 0.6, 1700);
  for (let i = 0; i < 16; i++) {
    const x0 = rs.range(ox - 60, W - 300), y0 = rs.range(oy, wh + oy);
    streak(y0, rs.range(1.4, 3.2), rs.range(0.16, 0.32), x0, x0 + rs.range(500, 1500));
  }
  g.drawImage(L.blurred(st, 2.2), ox, oy);

  // 包浆: the wax throws back the window — a cool, greyed rose coming in from the upper left, combed into streaks by the fibre
  const sh = L.makeCanvas(ww, wh), hg0 = sh.getContext('2d'); hg0.translate(-ox, -oy);
  hg0.fillStyle = '#000'; hg0.fillRect(ox, oy, ww, wh);
  hg0.save(); hg0.translate(-40, -30); hg0.rotate(-0.42); hg0.scale(0.62, 1);
  hg0.fillStyle = L.radial(hg0, 0, 0, 0, 1180, [[0, 'rgb(156,100,88)'], [0.25, 'rgb(114,70,60)'], [0.5, 'rgb(60,34,30)'], [0.78, 'rgb(18,9,8)'], [1, 'rgb(0,0,0)']]);
  hg0.fillRect(-2600, -2600, 5200, 5200); hg0.restore();
  const comb = L.makeCanvas(ww, wh), cg = comb.getContext('2d'); cg.translate(-ox, -oy);
  wavy(cg, fib2, 1, 'source-over'); wavy(cg, fib1, 0.4, 'source-over');
  cg.fillStyle = 'rgba(255,255,255,0.3)'; cg.fillRect(ox, oy, ww, wh);
  hg0.globalCompositeOperation = 'multiply'; hg0.drawImage(comb, ox, oy);
  g.globalCompositeOperation = 'screen'; g.drawImage(sh, ox, oy); g.globalCompositeOperation = 'source-over';

  // 牛毛纹: short crinkled vessel lines lying along the grain, each tapered like a hair
  const rp = L.rng('s29pore'), nP = L.makeNoise('s29pore');
  const HX = new Float32Array(44), HY = new Float32Array(44), HW = new Float32Array(44);
  const hair = (n, wd, dx, dy) => {
    g.beginPath();
    for (let q = 0; q <= n; q++) { const X = HX[q] + dx, Y = HY[q] + dy - HW[q] * wd; if (q) g.lineTo(X, Y); else g.moveTo(X, Y); }
    for (let q = n; q >= 0; q--) g.lineTo(HX[q] + dx, HY[q] + dy + HW[q] * wd);
    g.closePath(); g.fill();
  };
  for (let n = 0; n < 4300; n++) {
    const x = rp.range(ox - 140, ox + ww + 10), y = rp.range(oy - 10, oy + wh + 10);
    const drift = 0.5 + 0.5 * nP.n2(x / 900, y / 46);   // pores gather in drifts along the grain
    if (rp() > 0.2 + 0.8 * drift) continue;
    const big = rp.chance(0.075);
    const len = (16 + 128 * Math.pow(rp(), 1.8)) * (big ? 1.5 : 1), wd = rp.range(1.1, 2.7) * (big ? 1.7 : 1);
    const amp = rp.range(0.8, 3.8), k = rp.range(0.04, 0.13), ph = rp.range(0, 6.28), sl = rp.range(-0.05, 0.05), fat = rp.range(0.25, 0.75);
    const nseg = Math.min(42, Math.max(4, Math.ceil(len / 6)));
    for (let q = 0; q <= nseg; q++) {
      const t = q / nseg, xx = x + len * t;
      HX[q] = xx; HY[q] = y + flow(xx) + sl * (xx - x) + amp * Math.sin(ph + (xx - x) * k) + 0.7 * nP.n2(xx / 7, n * 0.37);
      // the belly of the hair sits off-centre, and the line pinches now and then
      const tt = t < fat ? 0.5 * t / fat : 0.5 + 0.5 * (t - fat) / (1 - fat);
      HW[q] = 0.5 * Math.pow(Math.sin(Math.PI * tt), 0.7) * (0.8 + 0.2 * nP.n2(xx / 11, n * 0.61));
    }
    const calm = x + len > 590 && x < 1330 && y > 270 && y < 566 ? 0.58 : 1;   // behind the tagline: lower contrast, no bright lines
    if (rp.chance(0.2)) {   // a vessel packed with pale deposit
      g.fillStyle = L.rgba(rp.chance(0.5) ? '#8c4835' : '#7a3a2c', rp.range(0.3, 0.6) * calm); hair(nseg, wd * 0.75, 0, 0);
    } else {                // an open one: a dark slit whose lower lip catches the light
      g.fillStyle = L.rgba('#8f4636', rp.range(0.1, 0.28) * calm); hair(nseg, wd, 0.6, 1.15);
      g.fillStyle = L.rgba('#110505', rp.range(0.4, 0.88) * (0.62 + 0.38 * calm)); hair(nseg, wd, 0, 0);
    }
  }

  // light: the table falls into shade toward the right; the lit bowl throws a little warmth back onto the wood at left
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, 0, 0, W, 0, [[0, '#ffffff'], [0.4, '#f1e4e1'], [0.7, '#bfaeae'], [1, '#93828a']]); full(g);
  g.fillStyle = L.radial(g, 560, 440, 480, 1500, [[0, '#ffffff'], [1, '#ad9c9c']]); full(g);
  g.globalCompositeOperation = 'source-over';
  const bn = L.makeCanvas(ww, wh), bg = bn.getContext('2d'); bg.translate(-ox, -oy);
  bg.fillStyle = L.radial(bg, a.cx, a.cy, a.R + 4, a.R + 190, [[0, 'rgba(206,112,82,0.4)'], [0.3, 'rgba(176,86,60,0.18)'], [1, 'rgba(160,74,50,0)']]); bg.fillRect(ox, oy, ww, wh);
  bg.globalCompositeOperation = 'destination-in';
  bg.fillStyle = L.linear(bg, 0, 0, 700, 0, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]); bg.fillRect(ox, oy, ww, wh);
  g.globalCompositeOperation = 'screen'; g.drawImage(bn, ox, oy); g.globalCompositeOperation = 'source-over';

  // depth of field: sharp along the lip, melting toward the top of frame
  const dofMask = (src, r0, r1) => {
    const sg2 = src.getContext('2d');
    sg2.globalCompositeOperation = 'destination-in';
    sg2.fillStyle = L.radial(sg2, a.cx - ox, a.cy - oy, a.R + r0, a.R + r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    sg2.fillRect(0, 0, ww, wh);
    return src;
  };
  const mid = dofMask(L.blurred(c, 1.7), 46, 210), far = dofMask(L.blurred(c, 4.4), 180, 440), xfar = dofMask(L.blurred(c, 8.5), 400, 780);
  g.drawImage(mid, ox, oy); g.drawImage(far, ox, oy); g.drawImage(xfar, ox, oy);
  return { cnv: c, ox, oy };
}

// ───────────────────────── the bowl ─────────────────────────
function buildBowl(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s29a'), nB = L.makeNoise('s29b');

  // 1) profile of the wall, indexed by plan distance d inside the outline: tilt of the surface normal away from the lens
  //    (90° at the outline, a tight roll over the lip, ~30° on the flaring rim, steepening to ~52° on the wall), and the
  //    distance travelled on the surface (so that surface detail is foreshortened where the wall is steep)
  const PS = 4, DMAX = 680, NP = DMAX * PS + 4;
  const AL = new Float32Array(NP), SM = new Float32Array(NP);
  for (let i = 0, s = 0; i < NP; i++) {
    const d = i / PS;
    const ab = d < 330 ? 30 + 22 * Math.pow(Math.sin((Math.PI / 2) * d / 330), 2) : 52 - 9 * sstep(330, 700, d);
    let al = ab;
    if (d < 34) { const q = 1 - Math.sqrt(d / 34); al = ab + (90 - ab) * q * q; }
    AL[i] = al * RAD; SM[i] = s;
    s += (1 / PS) / Math.max(0.14, Math.cos(al * RAD));
  }
  const SMAX = SM[NP - 1];

  // 2) throwing rings (弦痕): a 1-D profile along the meridian — irregular ridges and grooves, a few of them doubled
  const RS = 4, NR = Math.ceil((SMAX + 60) * RS) + 4;
  const RG = new Float32Array(NR);
  {
    const r = L.rng('s29ring');
    let s = 58;
    while (s < SMAX + 40) {
      const w = r.range(2.4, 9) * (r.chance(0.22) ? 2.4 : 1);
      const slope = r.range(0.010, 0.040) * (r.chance(0.18) ? 1.6 : 1);
      const amp = (r.chance(0.6) ? -1 : 1) * slope * w / 0.6;
      const i0 = Math.max(0, Math.floor((s - w * 3.2) * RS)), i1 = Math.min(NR - 1, Math.ceil((s + w * 3.2) * RS));
      for (let i = i0; i <= i1; i++) { const q = (i / RS - s) / w; RG[i] += amp * Math.exp(-0.5 * q * q); }
      s += r.range(12, 70) * (r.chance(0.25) ? 0.35 : 1);
    }
    for (let i = 0; i < NR; i++) { const s2 = i / RS; RG[i] += 0.028 * nB.n2(s2 / 5.2, 3.3) + 0.2 * nB.n2(s2 / 41, 11.7); }
  }

  // 3) slow fields on a coarse grid
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWob = new Float32Array(cw * ch), cAm = new Float32Array(cw * ch), cCl = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const d = Math.min(DMAX, Math.max(0, R - rr)), sm = SM[(d * PS) | 0], U = Math.atan2(ddx, ddy) * rr, k = j * cw + i;
    cWob[k] = 4.5 * nA.fbm(U / 820, sm / 300, 2) + 1.2 * nA.n2(U / 210 + 9, sm / 140);   // the rings are never quite concentric
    cAm[k] = nB.fbm(U / 560 + 4, sm / 90 - 2, 2);
    cCl[k] = nA.fbm(U / 260 - 13, sm / 200 + 31, 3);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 4) height field
  const Hh = new Float32Array(N), Rg = new Float32Array(N), Dp = new Float32Array(N), Cv = new Float32Array(N), Bq = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      Dp[k] = d;
      if (d < -1.5) continue;
      const fi = (d < 0 ? 0 : d > DMAX ? DMAX : d) * PS, i0 = fi | 0, sm = SM[i0] + (SM[i0 + 1] - SM[i0]) * (fi - i0);
      const U = Math.atan2(ddx, ddy) * rr;
      const fr = (sm + bil(cWob, i, j)) * RS, r0 = fr < 0 ? 0 : fr | 0;
      const ring = (RG[r0] + (RG[r0 + 1] - RG[r0]) * (fr - r0)) * (0.74 + 0.42 * bil(cAm, i, j));
      const peel = 0.034 * nA.n2(U / 21, sm / 21) + 0.012 * nB.n2(U / 8.5 + 40, sm / 8.5 - 7);   // orange-peel of a fat glaze
      const fade = sstep(2, 26, d);
      Hh[k] = (ring + peel) * fade; Rg[k] = ring * fade;
    }
  }

  // 5) flaws, round on the surface (so squashed where the wall is steep)
  const eachNear = (th0, d0, rad, fn) => {
    const rr0 = R - d0, px = cx + rr0 * Math.sin(th0) - X0, py = cy - rr0 * Math.cos(th0) - Y0;
    const S0 = SM[Math.round(d0 * PS)], e = Math.ceil(rad) + 3;
    for (let j = Math.max(1, Math.floor(py - e)); j <= Math.min(RH - 2, Math.ceil(py + e)); j++) {
      for (let i = Math.max(1, Math.floor(px - e)); i <= Math.min(RW - 2, Math.ceil(px + e)); i++) {
        const k = j * RW + i, d = Dp[k]; if (d < 1) continue;
        const ddx = X0 + i + 0.5 - cx, ddy = cy - (Y0 + j + 0.5), rr = Math.sqrt(ddx * ddx + ddy * ddy);
        const fi = Math.min(DMAX, d) * PS, i0 = fi | 0, sm = SM[i0] + (SM[i0 + 1] - SM[i0]) * (fi - i0);
        fn(k, (Math.atan2(ddx, ddy) - th0) * rr, sm - S0);
      }
    }
  };
  // 棕眼: a handful of pinholes, each a tiny crater with a brown floor
  const pins = [[-0.318, 96, 6.4], [-0.238, 312, 4.4], [-0.131, 64, 3.8], [-0.052, 402, 8.6], [0.031, 208, 5.2], [0.094, 121, 3.4], [0.205, 268, 7], [0.302, 148, 4.4], [-0.192, 478, 9.4], [0.018, 536, 5.8], [-0.346, 232, 3.6], [-0.071, 138, 2.6], [0.152, 452, 4.6]];
  for (const [th0, d0, rp] of pins) {
    eachNear(th0, d0, rp, (k, du, ds) => {
      const d2 = (du * du + ds * ds) / (rp * rp); if (d2 >= 1) return;
      const f = (1 - d2) * (1 - d2);
      Hh[k] -= rp * 0.34 * f; Cv[k] = Math.max(Cv[k], sstep(0.3, 0.85, f));
    });
  }
  // 缩釉: the glaze has crawled back from two small patches, leaving bare biscuit ringed by a fat rolled edge
  const crawls = [[-0.104, 214, 22, 11, 1.3], [0.117, 366, 14, 8, 7.9]];
  for (const [th0, d0, au, as, seed] of crawls) {
    eachNear(th0, d0, au * 1.5, (k, du, ds) => {
      const q = 1 - Math.sqrt((du * du) / (au * au) + (ds * ds) / (as * as)) + 0.2 * nA.n2(du / 15 + seed, ds / 15 - seed) + 0.05 * nB.n2(du / 5, ds / 5 + seed);
      if (q < -0.5) return;
      const bead = (q + 0.2) / 0.14;
      Hh[k] += 0.9 * Math.exp(-bead * bead) - 2.3 * sstep(-0.12, 0.16, q);
      Bq[k] = Math.max(Bq[k], sstep(-0.05, 0.1, q));
    });
  }

  // 6) shade: in the key light, in shade, and the window reflections on their own
  const lit = new ImageData(RW, RH), shd = new ImageData(RW, RH), spc = new ImageData(RW, RH);
  const dl = lit.data, ds = shd.data, dp = spc.data;
  const KX = -0.5, KY = -0.55, KZ = 0.67;          // key light: a window up and to the left
  const FX = 0.3, FY = 0.22, FZ = 0.93;            // fill: the room, from above
  const tm = (v) => (v < 0.88 ? v : 0.88 + 0.12 * (1 - Math.exp(-(v - 0.88) / 0.12))) * 255;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j + 0.5, ddy = cy - y, jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, d = Dp[k];
      if (d < -1.5) continue;
      const x = X0 + i + 0.5, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), sn = ddx / rr, cs = ddy / rr;
      const fi = (d < 0 ? 0 : d > DMAX ? DMAX : d) * PS, i0 = fi | 0, al = AL[i0] + (AL[i0 + 1] - AL[i0]) * (fi - i0);
      const sa = Math.sin(al), ca = Math.cos(al);
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      const ht = hx * cs + hy * sn, hs = (-hx * sn + hy * cs) * ca;      // slope along the arc / up the meridian
      // smooth frame: normal, meridian tangent (inward and up), tangent along the arc
      const n0x = sa * sn, n0y = -sa * cs, n0z = ca, mx = -ca * sn, my = ca * cs, mz = sa, tx = cs, ty = sn;
      let dif = (n0x * KX + n0y * KY + n0z * KZ + 0.3) / 1.3; if (dif < 0) dif = 0;
      let rel = -(ht * (tx * KX + ty * KY) + hs * (mx * KX + my * KY + mz * KZ)) * 3.2; rel = rel < -0.42 ? -0.42 : rel > 0.42 ? 0.42 : rel;
      let relS = -(ht * (tx * FX + ty * FY) + hs * (mx * FX + my * FY + mz * FZ)) * 1.1; relS = relS < -0.3 ? -0.3 : relS > 0.3 ? 0.3 : relS;
      // bumped normal → what the glaze mirrors
      let nx = n0x - ht * tx - hs * mx, ny = n0y - ht * ty - hs * my, nz = n0z - hs * mz;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= inv; ny *= inv; nz *= inv;
      const rz = 2 * nz * nz - 1, zen = Math.acos(rz < -1 ? -1 : rz > 1 ? 1 : rz) / RAD, az = Math.atan2(nx, -ny);
      let fr = 1 - nz; fr = 0.045 + 0.955 * fr * fr * fr * fr * fr; if (fr > 0.3) fr = 0.3;
      const cav = Cv[k], bq = Bq[k], gloss = (1 - cav) * (1 - bq);
      const room = ((0.5 + 1.2 * sstep(70, 80, zen)) * (1 - sstep(88, 93, zen)) + 0.04) * fr * gloss;
      let w1 = sstep(62.5, 67, zen) * (1 - sstep(78.5, 84, zen));
      if (w1 > 0) {
        w1 *= sstep(-0.44, -0.37, az) * (1 - sstep(-0.19, -0.115, az));
        w1 *= 0.25 + 0.75 * sstep(0.004, 0.016, Math.abs(az + 0.292));     // glazing bars
        w1 *= 0.3 + 0.7 * sstep(0.4, 1.3, Math.abs(zen - 71.5));
      }
      let w2 = sstep(64, 68.5, zen) * (1 - sstep(76, 81, zen));
      if (w2 > 0) w2 *= sstep(0.2, 0.25, az) * (1 - sstep(0.27, 0.33, az));

      // glaze colour: sugar-white, creamier where it pools in a groove, whiter over a ridge
      const ring = Rg[k], cl = bil(cCl, i, j);
      const pool = ring < 0 ? (ring < -0.45 ? 1 : -ring / 0.45) : 0, rdg = ring > 0 ? (ring > 0.45 ? 1 : ring / 0.45) : 0;
      const lipc = sstep(18, 40, d) * (1 - sstep(48, 120, d));
      let ar = 0.972 * (1 - 0.034 * pool + 0.012 * rdg) * (1 + 0.01 * cl);
      let ag = 0.957 * (1 - 0.05 * pool + 0.014 * rdg) * (1 + 0.012 * cl) * (1 - 0.012 * lipc);
      let ab = 0.915 * (1 - 0.095 * pool + 0.02 * rdg) * (1 + 0.022 * cl) * (1 - 0.036 * lipc);
      if (bq > 0) { const gr = 1 + 0.05 * nB.n2(x / 2.3, y / 2.3); ar += (0.905 * gr - ar) * bq; ag += (0.845 * gr - ag) * bq; ab += (0.735 * gr - ab) * bq; }
      if (cav > 0) { const m = cav * 0.86; ar += (0.4 - ar) * m; ag += (0.27 - ag) * m; ab += (0.17 - ab) * m; }

      // shade: room fill from above, minus what the table blocks, plus the wood's own red bounce close to the lip
      let nf = n0x * FX + n0y * FY + n0z * FZ; if (nf < 0) nf = 0;
      const bw = (1 - n0z) * 0.5 * (0.55 + 0.45 * Math.exp(-d / 220));
      const es = edgeS(a, x, y);
      const amb = (0.42 + 0.22 * nf) * (1 - 0.5 * bw) * (1 - 0.2 * sstep(40, 760, -es));
      const sr = ar * (amb + 0.5 * bw) * (1 + relS) + room * 0.85;
      const sg = ag * (amb * 0.965 + 0.2 * bw) * (1 + relS) + room * 0.84;
      const sb = ab * (amb * 0.925 + 0.14 * bw) * (1 + relS) + room * 0.8;
      // key light on top of it
      const fall = 1 - 0.2 * sstep(220, 1600, Math.hypot(x - 200, y - 600));
      const key = dif * fall;
      const lr = ar * (amb + 0.5 * bw + 0.44 * key) * (1 + rel) + room;
      const lg = ag * (amb * 0.965 + 0.2 * bw + 0.468 * key) * (1 + rel) + room * 0.99;
      const lb = ab * (amb * 0.925 + 0.14 * bw + 0.497 * key) * (1 + rel) + room * 0.95;

      const o = k * 4, cov = d >= 0.5 ? 255 : (d + 0.5 < 0 ? 0 : (d + 0.5) * 255);
      dl[o] = tm(lr); dl[o + 1] = tm(lg); dl[o + 2] = tm(lb); dl[o + 3] = cov;
      ds[o] = tm(sr); ds[o + 1] = tm(sg); ds[o + 2] = tm(sb); ds[o + 3] = cov;
      const sp = fr * gloss * (8 * w1 + 1.5 * w2);
      if (sp > 0.004) { dp[o] = 255; dp[o + 1] = 253; dp[o + 2] = 246; dp[o + 3] = (sp > 1 ? 1 : sp) * cov; }
    }
  }

  const toCanvas = (img) => { const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(img, 0, 0); return c; };
  // depth of field: sharp at the lip (the far edge), softening as the wall climbs toward the lens at the bottom of frame
  const dof = (cnv) => {
    const g = cnv.getContext('2d');
    for (const [px, r0, r1] of [[2, 330, 120], [5.5, 620, 300]]) {
      const b = L.blurred(cnv, px), bg = b.getContext('2d');
      bg.globalCompositeOperation = 'destination-in';
      bg.fillStyle = L.radial(bg, cx - X0, cy - Y0, R - r0, R - r1, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
      bg.fillRect(0, 0, RW, RH);
      g.drawImage(b, 0, 0);
    }
    return cnv;
  };
  const spec = toCanvas(spc), sg2 = spec.getContext('2d');
  // a breath of bloom round the reflections: the glaze is thick and a little milky
  sg2.globalAlpha = 0.5; sg2.drawImage(L.blurred(spec, 13), 0, 0); sg2.globalAlpha = 1;
  return { lit: dof(toCanvas(lit)), shade: dof(toCanvas(shd)), spec, X0, Y0, RW, RH };
}

/** the light mask (white where the key light reaches) and the warm fringe that runs along its penumbra */
function buildLight(env, Y0) {
  const a = env.arc, MS = 3, mx0 = -96, my0 = Y0 - 36, mw = W + 192, mh = H - my0 + 48;
  const cw = Math.ceil(mw / MS), ch = Math.ceil(mh / MS);
  const im = new ImageData(cw, ch), fr = new ImageData(cw, ch), dm = im.data, df = fr.data;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const s = edgeS(a, mx0 + (i + 0.5) * MS, my0 + (j + 0.5) * MS), m = sstep(-eW, eW, s), o = (j * cw + i) * 4;
    dm[o] = dm[o + 1] = dm[o + 2] = 255; dm[o + 3] = m * 255;
    const f = sstep(-eW * 1.25, -eW * 0.2, s) * (1 - sstep(-eW * 0.2, eW * 0.7, s));   // sits on the shadow side of the edge
    df[o] = 255; df[o + 1] = 204; df[o + 2] = 164; df[o + 3] = f * 0.26 * 255;
  }
  const mk = (img) => { const c = L.makeCanvas(cw, ch); c.getContext('2d').putImageData(img, 0, 0); return c; };
  return { mask: mk(im), fringe: mk(fr), mx0, my0, mw: cw * MS, mh: ch * MS };
}

export default {
  name: '甜白釉碗与紫檀',
  tone: 'light',
  init(env) {
    const wood = buildWood(env), bowl = buildBowl(env), light = buildLight(env, bowl.Y0);
    const tmp = L.makeCanvas(W, H - bowl.Y0);
    S = { wood, bowl, light, tmp, tg: tmp.getContext('2d') };
  },
  draw(ctx, env, p) {
    const a = env.arc, B = S.bowl, M = S.light;
    const rot = L.lerp(-0.0052, 0.0052, p);          // table and bowl slide together round the bowl's centre …
    const mdx = L.lerp(-20, 20, p), mdy = L.lerp(-3, 3, p);   // … the shadow's edge drifts a little further …
    const rotS = rot * 0.35;                         // … and the window reflections lag behind the glaze

    put(ctx, a, S.wood.cnv, S.wood.ox, S.wood.oy, rot);

    // the bowl's own narrow shadow, tucked under the lip and fattening toward the shaded side
    ctx.save();
    ctx.fillStyle = L.radial(ctx, a.cx + 15, a.cy - 6, a.R - 6, a.R + 62, [[0, 'rgba(12,4,3,0.92)'], [0.12, 'rgba(12,4,3,0.86)'], [0.3, 'rgba(12,4,3,0.5)'], [0.58, 'rgba(12,4,3,0.18)'], [1, 'rgba(12,4,3,0)']]);
    ctx.fillRect(0, 0, W, a.yAt(0) + 80);
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 2, a.R + 9, [[0, 'rgba(8,2,2,0.85)'], [1, 'rgba(8,2,2,0)']]);
    ctx.fillRect(0, 0, W, a.yAt(0) + 30);
    ctx.restore();

    // the bowl in shade, then the lit bowl through the light mask
    put(ctx, a, B.shade, B.X0, B.Y0, rot);
    const tg = S.tg;
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, W, S.tmp.height);
    tg.translate(0, -B.Y0);
    put(tg, a, B.lit, B.X0, B.Y0, rot);
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(M.mask, M.mx0 + mdx, M.my0 + mdy, M.mw, M.mh);
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over';
    ctx.drawImage(S.tmp, 0, B.Y0);

    // light bleeding through the porcelain warms the shadow's edge
    ctx.save(); a.clipBelow(ctx, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(M.fringe, M.mx0 + mdx, M.my0 + mdy, M.mw, M.mh);
    ctx.restore();

    // window reflections riding the lip
    put(ctx, a, B.spec, B.X0, B.Y0, rotS, 'lighter');
  },
};
