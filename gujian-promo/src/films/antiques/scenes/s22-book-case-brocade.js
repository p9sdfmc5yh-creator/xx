// s22 — 书函与织金锦. Textile macro: a strip of red-ground gold brocade (织金锦, lotus scroll 缠枝莲) lies on the indigo
// cotton that covers a book case (函套). The arc is the brocade's raw cut edge: the last picks of weft have dropped out,
// so the red silk warp ends stand up as a ragged fringe and a few gold wefts have worked loose.
//
// Both cloths are WOVEN per pixel in init(), thread by thread:
//   · cotton  — plain weave, every float a little lit bead, slubby yarn, faded in patches;
//   · brocade — a 4 × 7 px pattern grid (one cell = one warp end × one gold pick). The lotus scroll is rasterised onto that
//     grid, so its outline steps the way a woven figure does. Gold cells are flat gilt wefts tied down by every sixth warp
//     in a twill progression; ground cells are a warp-faced satin.
// One composite layer is blitted per frame; a second layer holding only the gold's specular glints is masked by two
// travelling light bands so the gold threads flicker as the cloth slides.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
const LW = W + PAD * 2, LH = H + PAD * 2;
const WP = 4, FP = 7;          // brocade: warp pitch, weft (pick) pitch in px
const NB = 8;                  // every 8th warp binds the gold weft, stepping one warp per pick → twill diagonals in the gold
const CPX = 7.3, CPY = 8.2;     // cotton: warp / weft pitch
let S = null;

// ───────────────────────── small helpers ─────────────────────────
function h2(a, b) { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
/** 1-D value noise along a thread: id picks the thread, t runs along it. 0..1 */
function vn(id, t) { const t0 = Math.floor(t), f = t - t0, s = f * f * (3 - 2 * f); return h2(id, t0) * (1 - s) + h2(id, t0 + 1) * s; }
/** slow field on a coarse grid with a bilinear sampler (grid pixel coords) */
function field(w, h, cs, fn) {
  const cw = Math.ceil(w / cs) + 2, ch = Math.ceil(h / cs) + 2, d = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) d[j * cw + i] = fn(i * cs, j * cs);
  return (px, py) => {
    const gx = px / cs, gy = py / cs, i0 = gx | 0, j0 = gy | 0, tx = gx - i0, ty = gy - j0, k = j0 * cw + i0;
    const a0 = d[k], a1 = d[k + 1], b0 = d[k + cw], b1 = d[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };
}
const NL = 512;
function lut(stops, vmax) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / vmax, c])), o = new Uint8ClampedArray(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}
const VMAX = 1.3;
const li = (v) => (v <= 0 ? 0 : v >= VMAX ? NL - 1 : ((v / VMAX) * (NL - 1)) | 0) * 3;

/** the key light: a broad pool straddling the seam just left of the crest, falling off into the corners */
function lightPool(a) {
  const x0 = a.cx - 170, y0 = a.crestY + 40;
  return (x, y) => { const dx = (x - x0) / 980, dy = (y - y0) / 560; return Math.exp(-(dx * dx + dy * dy)); };
}

// ───────────────────────── indigo cotton (函套蓝布) ─────────────────────────
function buildCloth(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const CH = Math.min(LH, Math.ceil(a.yAt(-PAD) + PAD + 26));
  const img = new ImageData(LW, CH), d = img.data;
  const ang = 0.032, ca = Math.cos(ang), sa = Math.sin(ang);
  const nz = L.makeNoise('s22cloth'), pool = lightPool(a);
  const wu = field(LW, CH, 16, (x, y) => 3.4 * nz.fbm(x / 240 + 3, y / 240, 2));
  const wv = field(LW, CH, 16, (x, y) => 3.4 * nz.fbm(x / 240 - 8, y / 240 + 5, 2));
  // fading: slow blotches + long streaks that follow the warp
  const fade = field(LW, CH, 12, (x, y) => 0.62 * nz.fbm(x / 430, y / 330 + 9, 3) + 0.38 * nz.fbm(x / 42 + 40, y / 760, 2));
  const lp = field(LW, CH, 16, (x, y) => pool(x - PAD, y - PAD));
  const OFF = 64, rw = L.rng('s22warp');
  const nI = Math.ceil((LW + 300) / CPX) + OFF * 2, nJ = Math.ceil((LH + 300) / CPY) + OFF * 2;
  const wB = new Float32Array(nI), fB = new Float32Array(nJ), wW = new Float32Array(nI), fW = new Float32Array(nJ);
  // hand-spun, vat-dyed yarn: every end has its own depth of blue and its own thickness; now and then a thick pale one
  for (let i = 0; i < nI; i++) { wB[i] = 1 + 0.13 * rw.gauss() + (rw.chance(0.06) ? 0.24 : 0); wW[i] = 1 + 0.16 * rw.gauss() + (rw.chance(0.05) ? 0.22 : 0); }
  for (let j = 0; j < nJ; j++) { fB[j] = 1.0 + 0.1 * rw.gauss(); fW[j] = 1 + 0.14 * rw.gauss(); }
  const DEEP = lut([[0, '#03081a'], [0.2, '#081434'], [0.42, '#112656'], [0.6, '#1a3876'], [0.8, '#274f98'], [1.0, '#4270b6'], [1.3, '#84a6dc']], VMAX);
  const PALE = lut([[0, '#050a18'], [0.2, '#0e1c3c'], [0.42, '#1f3868'], [0.6, '#31518a'], [0.8, '#4f71a8'], [1.0, '#7594c4'], [1.3, '#b0c6e6']], VMAX);
  const RIN = (R - 44) * (R - 44);
  for (let py = 0; py < CH; py++) {
    const y = py - PAD, ddy = cy - y;
    for (let px = 0; px < LW; px++) {
      const x = px - PAD, ddx = x - cx;
      if (ddx * ddx + ddy * ddy < RIN) continue;
      const u = x * ca + y * sa + wu(px, py), v = -x * sa + y * ca + wv(px, py);
      const ui = u / CPX + OFF, vj = v / CPY + OFF;
      const i = Math.floor(ui), j = Math.floor(vj), fx = ui - i, fy = vj - j;
      let ac, al, id, run, tb, tw, la, ll, weft;
      if ((i + j) & 1) { ac = fy; al = fx; id = j + 4096; run = u; tb = fB[j]; tw = fW[j]; la = -0.62; ll = -0.78; weft = 1; }   // weft float
      else { ac = fx; al = fy; id = i; run = v; tb = wB[i]; tw = wW[i]; la = -0.78; ll = -0.62; weft = 0; }                       // warp float
      const sl = vn(id, run / 38);                              // slub: the yarn swells and thins along its length
      ac += (vn(id + 911, run / 58) - 0.5) * 0.26;              // … and never lies dead straight
      const ey = (al - 0.5) * 2;
      const hw = (0.46 + 0.13 * sl) * tw * Math.sqrt(1 - 0.78 * ey * ey), ex = (ac - 0.5) / hw;     // each float is a little pointed lens
      const hv = h2(i * 31 + 7, j * 17 + 3);                    // heather: no two floats took the dye alike
      let b, pale = 0;
      if (ex > -1 && ex < 1) {
        const top = Math.sqrt(1 - ex * ex);
        const dif = -(ex * la + ey * 0.5 * ll);
        b = (0.74 + 0.2 * dif) * (0.56 + 0.44 * top) * (0.72 + 0.28 * Math.cos(ey * 1.3));
        b *= 1 + 0.07 * Math.sin((ex * hw * 9 + run * 0.55) * 1.9);                 // twist of the yarn
        b *= 1 + 0.2 * (vn(id * 7 + ((ex * 2.5 + 8) | 0), run / 4.5) - 0.5);       // loose fibres lying along it
        b *= tb * (0.9 + 0.2 * sl) * (0.9 + 0.2 * hv) * (weft ? 1.04 : 1);
        if (hv > 0.97) { b *= 1.1; pale = 0.3; }                                    // a rubbed float: the undyed heart of the yarn shows
      } else b = 0.38 + 0.12 * vn(id + 77, run / 6);
      const fd = fade(px, py);
      b *= (1 + 0.3 * fd) * (0.7 + 0.34 * lp(px, py));
      b += (h2(px, py) - 0.5) * 0.07 + (h2(px >> 1, (py >> 1) + 9000) - 0.5) * 0.05;
      const m = L.clamp(0.16 + 1.3 * fd + pale + 0.1 * weft), q = li(b), o = (py * LW + px) * 4;
      d[o] = DEEP[q] + (PALE[q] - DEEP[q]) * m; d[o + 1] = DEEP[q + 1] + (PALE[q + 1] - DEEP[q + 1]) * m; d[o + 2] = DEEP[q + 2] + (PALE[q + 2] - DEEP[q + 2]) * m; d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(LW, CH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ───────────────────────── the lotus scroll (缠枝莲), drawn as a white-on-black mask in cloth px ─────────────────────────
function petalPath(g, r0, r1, hw) {
  const m = r1 - r0;
  g.beginPath(); g.moveTo(r0, -hw * 0.4);
  g.bezierCurveTo(r0 + m * 0.2, -hw * 1.3, r0 + m * 0.78, -hw * 0.8, r1, 0);
  g.bezierCurveTo(r0 + m * 0.78, hw * 0.8, r0 + m * 0.2, hw * 1.3, r0, hw * 0.4);
  g.closePath();
}
/** a lotus head seen full face: seed pod, a ring of short petals, a ring of broad pointed petals —
 *  solid gold, the red ground showing only as the lines that part one petal from the next */
function lotus(g, x, y, R, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const N = 8, gap = 0.036 * R;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const petal = (k, r0, r1, hw, vein) => {
    g.save(); g.rotate((k / N) * L.TAU);
    petalPath(g, r0, r1, hw);
    g.strokeStyle = '#000'; g.lineWidth = gap * 2; g.stroke();
    g.fillStyle = '#fff'; g.fill();
    if (vein) { g.lineWidth = gap * 1.25; g.beginPath(); g.moveTo(r0 + (r1 - r0) * 0.42, 0); g.lineTo(r1 - (r1 - r0) * 0.2, 0); g.stroke(); }
    g.restore();
  };
  for (let k = 0; k < N; k++) petal(k, 0.4 * R, R, 0.31 * R, true);
  for (let k = 0; k < N; k++) petal(k + 0.5, 0.25 * R, 0.64 * R, 0.2 * R, false);
  g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, 0.33 * R, 0, L.TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 0.26 * R, 0, L.TAU); g.fill();
  g.fillStyle = '#000';
  for (let k = 0; k < 7; k++) {
    const rr = k ? 0.155 * R : 0, an = (k / 6) * L.TAU + 0.3;
    g.beginPath(); g.arc(rr * Math.cos(an), rr * Math.sin(an), 0.05 * R, 0, L.TAU); g.fill();
  }
  g.restore();
}
/** a curled leaf (卷叶): a tapering body that hooks round at the tip, with one smaller lobe curling the other way */
function leafPts(x, y, ang, len, side) {
  const n = 28, pts = [];
  let px = x, py = y, th = ang;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push([px, py, th, t]);
    th += side * (0.0026 + 0.03 * t * t) * (150 / len) * (len / n);
    px += (Math.cos(th) * len) / n; py += (Math.sin(th) * len) / n;
  }
  return pts;
}
function leafFill(g, pts, wmax, side) {
  const wAt = (t) => wmax * (t < 0.3 ? 0.3 + 0.7 * Math.pow(t / 0.3, 0.75) : L.lerp(1, 0.2, Math.pow((t - 0.3) / 0.7, 1.3)));
  g.beginPath();
  for (let k = 0; k < pts.length; k++) { const [x, y, th, t] = pts[k], w = wAt(t) * 0.62; const X = x + Math.sin(th) * w * side, Y = y - Math.cos(th) * w * side; if (k) g.lineTo(X, Y); else g.moveTo(X, Y); }
  for (let k = pts.length - 1; k >= 0; k--) { const [x, y, th, t] = pts[k], w = wAt(t) * 0.38; g.lineTo(x - Math.sin(th) * w * side, y + Math.cos(th) * w * side); }
  g.closePath(); g.fillStyle = '#fff'; g.fill();
  const e = pts[pts.length - 1];
  g.beginPath(); g.arc(e[0], e[1], wmax * 0.11, 0, L.TAU); g.fill();
}
function drawScroll(g) {
  const Rf = 240, rs = 286, HX = 680, DY = 320, PC = 620, xL = 720, yL = 866, SW = 40;
  const r = L.rng('s22scroll');
  const d = Math.hypot(HX, DY), al = Math.asin((2 * rs) / d), hh = Math.sqrt((d * d) / 4 - rs * rs);
  const flowers = [], belts = [];
  for (let c = -1; c <= 1; c++) {
    const pts = [];
    for (let m = -2; m <= 1; m++) {
      const Lc = [xL + m * 2 * HX, yL + c * PC], Uc = [Lc[0] + HX, Lc[1] - DY], L2 = [Lc[0] + 2 * HX, Lc[1]];
      flowers.push({ x: Lc[0], y: Lc[1], up: 0 }, { x: Uc[0], y: Uc[1], up: 1 });
      const t1 = Math.atan2(-DY, HX) - al, t2 = Math.atan2(DY, HX) + al;
      const M1 = [(Lc[0] + Uc[0]) / 2, (Lc[1] + Uc[1]) / 2], M2 = [(Uc[0] + L2[0]) / 2, (Uc[1] + L2[1]) / 2];
      const A = [M1[0] - Math.cos(t1) * hh, M1[1] - Math.sin(t1) * hh], B = [M1[0] + Math.cos(t1) * hh, M1[1] + Math.sin(t1) * hh];
      const C = [M2[0] - Math.cos(t2) * hh, M2[1] - Math.sin(t2) * hh], D = [M2[0] + Math.cos(t2) * hh, M2[1] + Math.sin(t2) * hh];
      // under the lower flower …
      let p0 = Math.atan2(D[1] - L2[1], D[0] - L2[0]); if (p0 < 0) p0 += L.TAU;
      const p1 = Math.atan2(A[1] - Lc[1], A[0] - Lc[0]);
      for (let k = 0; k <= 60; k++) { const ph = L.lerp(p0, p1, k / 60); pts.push([Lc[0] + rs * Math.cos(ph), Lc[1] + rs * Math.sin(ph), 1]); }
      // … up the long S between them …
      for (let k = 1; k < 50; k++) pts.push([L.lerp(A[0], B[0], k / 50), L.lerp(A[1], B[1], k / 50), 0]);
      // … over the upper flower …
      let q0 = Math.atan2(B[1] - Uc[1], B[0] - Uc[0]); if (q0 < 0) q0 += L.TAU;
      let q1 = Math.atan2(C[1] - Uc[1], C[0] - Uc[0]); if (q1 < Math.PI) q1 += L.TAU;
      for (let k = 0; k <= 60; k++) { const ph = L.lerp(q0, q1, k / 60); pts.push([Uc[0] + rs * Math.cos(ph), Uc[1] + rs * Math.sin(ph), 1]); }
      // … and down again
      for (let k = 1; k < 50; k++) pts.push([L.lerp(C[0], D[0], k / 50), L.lerp(C[1], D[1], k / 50), 0]);
    }
    belts.push(pts);
  }
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  for (const pts of belts) { g.lineWidth = SW; g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
  // leaves along the stem, alternating sides, wherever the cloth is still empty
  const placed = [];
  const clear = (lp, wm) => {
    for (const p of lp) {
      if (p[3] < 0.15) continue;
      const need = rs + (p[3] < 0.3 ? 26 : 22 + wm * 0.5);
      for (const f of flowers) if (Math.hypot(p[0] - f.x, p[1] - f.y) < need) return false;
      for (const q of placed) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 34 + wm * 0.75) return false;
    }
    return true;
  };
  for (const pts of belts) {
    let acc = 40, side = 1, next = 90;
    for (let k = 1; k < pts.length - 1; k++) {
      const p = pts[k], q = pts[k + 1];
      acc += Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (acc < next) continue;
      if (p[0] < -420 || p[0] > W + 420 || p[1] < 300 || p[1] > H + 360) { acc = 0; continue; }
      const tang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      let done = false;
      for (let tries = 0; tries < 8 && !done; tries++) {
        const len = r.range(165, 250) * (tries > 3 ? 0.78 : 1), wm = len * r.range(0.34, 0.4);
        const lp = leafPts(p[0], p[1], tang + side * r.range(0.5, 1.05), len, side);
        if (clear(lp, wm)) {
          leafFill(g, lp, wm, side);
          const b = lp[8], lobe = leafPts(b[0], b[1], b[2] - side * 0.95, len * 0.56, -side);
          leafFill(g, lobe, wm * 0.66, -side);
          g.strokeStyle = '#000'; g.lineWidth = 11; g.beginPath();
          for (let i = 5; i <= 18; i++) { if (i === 5) g.moveTo(lp[i][0], lp[i][1]); else g.lineTo(lp[i][0], lp[i][1]); }
          g.stroke();
          for (const s of lp) if (s[3] > 0.15) placed.push(s);
          for (const s of lobe) if (s[3] > 0.3) placed.push(s);
          done = true;
        }
        if (tries & 1) side = -side;
      }
      side = -side;
      acc = 0; next = done ? r.range(150, 210) : 30;
    }
  }
  // flower heads hang from the stem that wraps them
  for (const f of flowers) {
    const dir = f.up ? -1 : 1;
    g.strokeStyle = '#fff'; g.lineWidth = SW * 0.9; g.beginPath(); g.moveTo(f.x, f.y + dir * rs); g.lineTo(f.x, f.y + dir * Rf * 0.92); g.stroke();
    lotus(g, f.x, f.y, Rf, (f.up ? 0 : Math.PI / 8) + (h2(Math.round(f.x), Math.round(f.y)) - 0.5) * 0.3);
  }
}
function buildPattern(U0, V0, GW, GH) {
  const SC = 0.5, MG = 48;          // mask resolution; margin for the wobble below
  const mw = Math.ceil((GW * WP + 2 * MG) * SC), mh = Math.ceil((GH * FP + 2 * MG) * SC);
  const c = L.makeCanvas(mw, mh), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, mw, mh);
  g.scale(SC, SC); g.translate(MG - U0, MG - V0);
  drawScroll(g);
  // the design was drawn by hand before it was woven: let it wander a little, then drop it onto the pick grid
  const src = g.getImageData(0, 0, mw, mh).data, pat = new Uint8Array(GW * GH), nz = L.makeNoise('s22hand');
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const u = U0 + (i + 0.5) * WP, v = V0 + (j + 0.5) * FP;
    const x = u + 26 * nz.fbm(u / 340, v / 340, 2), y = v + 26 * nz.fbm(u / 340 + 40, v / 340 - 17, 2);
    const mx = Math.round((x - U0 + MG) * SC), my = Math.round((y - V0 + MG) * SC);
    pat[j * GW + i] = mx >= 0 && my >= 0 && mx < mw && my < mh && src[(my * mw + mx) * 4] > 120 ? 1 : 0;
  }
  return pat;
}

// ───────────────────────── the brocade (红地织金缠枝莲锦) ─────────────────────────
function buildBrocade(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const Y0 = Math.floor(a.crestY) - 12, BH = H + PAD - Y0;
  const M = 18, U0 = -PAD - M * WP, V0 = Y0 - M * FP;
  const GW = Math.ceil(LW / WP) + 2 * M, GH = Math.ceil(BH / FP) + 2 * M;
  const pat = buildPattern(U0, V0, GW, GH);
  const img = new ImageData(LW, BH), d = img.data, gimg = new ImageData(LW, BH), gd = gimg.data;
  const ang = -0.016, ca = Math.cos(ang), sa = Math.sin(ang), pvx = cx, pvy = a.crestY + 280;
  const nz = L.makeNoise('s22bro'), pool = lightPool(a);
  const wu = field(LW, BH, 12, (x, y) => 2.6 * nz.fbm(x / 210, y / 210, 2));
  const wv = field(LW, BH, 12, (x, y) => 3.0 * nz.fbm(x / 260 + 9, y / 150 + 4, 2));
  const und = field(LW, BH, 12, (x, y) => nz.fbm(x / 420 + 2, y / 300 - 7, 2));                                   // the cloth billows a little → sheen wanders
  const wear = field(LW, BH, 6, (x, y) => 0.6 * nz.fbm(x / 240 - 5, y / 240 + 31, 3) + 0.4 * nz.fbm(x / 26, y / 26 + 3, 2));
  const lp = field(LW, BH, 16, (x, y) => pool(x - PAD, y + Y0));
  const rr = L.rng('s22rows');
  const rowB = new Float32Array(GH), colB = new Float32Array(GW), colE = new Float32Array(GW);
  for (let j = 0; j < GH; j++) rowB[j] = 0.8 + 0.2 * rr() + (rr.chance(0.1) ? -0.1 : 0);
  for (let i = 0; i < GW; i++) { colB[i] = 0.93 + 0.14 * rr(); colE[i] = rr(); }
  const GOLD = lut([[0, '#2c1202'], [0.2, '#6a3806'], [0.4, '#99600f'], [0.56, '#c98d1e'], [0.72, '#e6b236'], [0.88, '#f6d05a'], [1.06, '#ffe796'], [1.3, '#fff8dc']], VMAX);
  const RED = lut([[0, '#240404'], [0.25, '#5a1410'], [0.5, '#98170f'], [0.72, '#c8281e'], [0.9, '#e23c26'], [1.06, '#f6643e'], [1.3, '#ffa67e']], VMAX);
  const FRAY = lut([[0, '#3a0806'], [0.3, '#8c1a12'], [0.55, '#cf3a26'], [0.78, '#f06a4a'], [1.0, '#ff9d7c'], [1.3, '#ffd4bc']], VMAX);
  const WORN = lut([[0, '#220a04'], [0.4, '#6e2c10'], [0.8, '#a8571e'], [1.3, '#d99a58']], VMAX);
  for (let py = 0; py < BH; py++) {
    const y = Y0 + py, ddy = cy - y;
    for (let px = 0; px < LW; px++) {
      const x = px - PAD, ddx = x - cx;
      const dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      if (dr > 8) continue;
      const rx = x - pvx, ry = y - pvy;
      const u = pvx + rx * ca - ry * sa + wu(px, py), v = pvy + rx * sa + ry * ca + wv(px, py);
      let gu = (u - U0) / WP;
      const gv = (v - V0) / FP;
      let gi = Math.floor(gu), fx = gu - gi;
      const gj = Math.floor(gv), fy = gv - gj;
      let alpha = 255, bare = 0;
      if (dr > -52) {
        const s = Math.atan2(ddx, ddy) * R;
        const depth = 17 + 15 * vn(7, s / 85) + 9 * vn(17, s / 19) + 5 * colE[gi];      // the last picks of weft are gone: bare warp ends
        if (dr > -depth) {
          // freed from the weft, the ends lean together into little tufts
          const tt = (dr + depth) / depth;
          gu += tt * tt * (2.6 * (vn(11, s / 44) - 0.5) + 1.5 * (vn(13, s / 13) - 0.5));
          gi = Math.floor(gu); fx = gu - gi; bare = 0.25 + 0.75 * tt;
        }
        const cut = 0.5 + 6.5 * colE[gi] + 3.2 * vn(9, s / 23);       // every warp end stops at its own height
        if (dr > -cut) continue;
        if (dr > -cut - 1.5) alpha *= (-cut - dr) / 1.5;
      }
      const k = gj * GW + gi;
      const lt = lp(px, py), ud = und(px, py);
      const o = (py * LW + px) * 4;
      const cyl = Math.sin(Math.PI * fx);
      let cr, cg, cb;
      if (bare) {
        // loose silk: each end a bright little cylinder, the shadowed cotton showing between them
        const ce = colE[gi], wth = 0.3 + 0.16 * ce, ax = Math.abs(fx - 0.5);
        if (ax > wth) { const ga = L.clamp(1 - (ax - wth) / 0.1); alpha *= ga + (1 - ga) * 0.5 * (1 - bare); }
        if (ce < 0.1 && bare > 0.5) alpha *= 0.25;                     // an end that has pulled right out
        const b = (0.3 + 0.7 * cyl) * colB[gi] * (0.62 + 0.52 * lt) * (0.78 + 0.5 * ce) * (0.9 + 0.25 * bare);
        const q = li(b), m = L.clamp(bare * (0.35 + 0.75 * h2(gi, 77)));
        cr = RED[q] + (FRAY[q] - RED[q]) * m; cg = RED[q + 1] + (FRAY[q + 1] - RED[q + 1]) * m; cb = RED[q + 2] + (FRAY[q + 2] - RED[q + 2]) * m;
      } else if (pat[k]) {
        // ── a gold pick: a flat gilt strip floating over seven ends, tied down by the eighth ──
        const kk = gi - gj, kb = ((kk % NB) + NB) % NB;
        const lite = 0.66 + 0.5 * lt + 0.62 * ud;
        let tf = (kb + fx - 0.5) / NB, fid = (kk - kb) / NB;                // 0..1 along the float, from one tie to the next
        if (tf < 0) { tf += 1; fid -= 1; }
        const hf = h2(gj * 7 + 3, fid), bulge = Math.sin(Math.PI * tf);
        const fyw = fy + 0.16 * (vn(gj * 5 + 1, u / 70) - 0.5);          // the strips are not ruled: their edges waver
        const edge = (fyw < 0.5 ? fyw : 1 - fyw) * FP;                    // px from the pick's edge
        const tie = kb === 0 && Math.abs(fx - 0.5) < 0.36 && fy > 0.06 && fy < 0.94;
        if (tie) {                          // a binding warp crosses over the gold
          const b = (0.5 + 0.5 * Math.sin(Math.PI * (fx - 0.14) / 0.72)) * (0.74 + 0.26 * Math.sin(Math.PI * fy)) * colB[gi] * (0.6 + 0.5 * lt);
          const q = li(b * 0.92); cr = RED[q]; cg = RED[q + 1]; cb = RED[q + 2];
        } else {
          const e = fy - 0.32;
          let pf = 0.74 + 0.34 * Math.exp(-(e * e) / 0.07);
          if (fy > 0.7) pf -= 0.22 * (fy - 0.7) / 0.3;
          let b = rowB[gj] * pf * (0.7 + 0.3 * Math.pow(bulge, 0.4)) * lite;
          b += hf > 0.66 ? (hf - 0.66) * 0.9 * bulge * (0.4 + lt) : hf < 0.16 ? -0.12 : 0;      // some floats flash, some sulk
          if (!pat[k - GW]) b += 0.1 * (1 - fy);                          // the top edge of a figure catches the light
          if (!pat[k + GW]) b -= 0.12 * fy;
          if (!pat[k - 1]) b += 0.08 * (1 - fx); else if (!pat[k + 1]) b -= 0.14 * fx;
          if (edge < 0.8) b *= 0.46 + 0.675 * edge;
          b += (h2(px, py) - 0.5) * 0.06 + (h2(px >> 2, gj * 3 + 5000) - 0.5) * 0.05;
          const q = li(b);
          cr = GOLD[q]; cg = GOLD[q + 1]; cb = GOLD[q + 2];
          // gilding rubbed away in patches: the lacquered paper strip shows through
          const wr = wear(px, py) + 0.16 * (h2(gj, fid + 91) - 0.5);
          if (wr > 0.34) { const m = L.clamp((wr - 0.34) / 0.1) * 0.7; cr += (WORN[q] - cr) * m; cg += (WORN[q + 1] - cg) * m; cb += (WORN[q + 2] - cb) * m; }
          else if (edge >= 0.8) {
            // specular glint, kept on its own layer
            const h3 = h2(gj * 13 + 5, fid * 3 + 1), gl = Math.exp(-(e * e) / 0.03) * bulge * (0.16 + 0.84 * h3 * h3 * h3);
            gd[o] = 255; gd[o + 1] = 240; gd[o + 2] = 178; gd[o + 3] = 255 * L.clamp(gl * 1.25) * (alpha / 255);
          }
        }
      } else {
        // ── satin ground: long warp floats, one tiny tie in five ──
        const s5 = (((gi * 2 + gj) % 5) + 5) % 5;
        let b;
        if (s5 === 0) b = 0.52 + 0.2 * cyl * Math.sin(Math.PI * fy);
        else b = (0.76 + 0.24 * Math.sin((Math.PI * (s5 - 1 + fy)) / 4)) * (0.62 + 0.38 * cyl);
        b *= colB[gi] * (0.5 + 0.47 * lt + 0.4 * ud);
        if (pat[k - GW]) b *= 1 - 0.46 * (1 - fy) * (1 - fy);              // the raised gold drops a little shadow down-right
        if (pat[k - 1]) b *= 1 - 0.32 * (1 - fx);
        b += (h2(px, py) - 0.5) * 0.05;
        const q = li(b); cr = RED[q]; cg = RED[q + 1]; cb = RED[q + 2];
      }
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = alpha;
    }
  }
  const c = L.makeCanvas(LW, BH), gc = L.makeCanvas(LW, BH);
  c.getContext('2d').putImageData(img, 0, 0);
  gc.getContext('2d').putImageData(gimg, 0, 0);
  return { bro: c, glint: gc, Y0 };
}

// ───────────────────────── the frayed edge ─────────────────────────
function makeFringe(env) {
  const a = env.arc, r = L.rng('s22fringe'), nz = L.makeNoise('s22fr');
  const span = a.span(PAD + 40);
  const BASE = ['#c42a1c', '#c42a1c', '#b32216', '#d4361f', '#a81c12'];
  const TIP = ['#f0684a', '#f0684a', '#f88a68', '#f88a68', '#ffab8c', '#ffc8ae', '#e24a30', '#ffd9c6'];
  const silk = [], gold = [], wisps = [];
  const calm = (x) => L.smooth((Math.abs(x - a.cx) - 250) / 150);       // 0 under the tagline (the fringe stays short there) → 1 out to the sides
  // red silk warp ends: a dense comb, leaning together in tufts, a few bald gaps
  for (let th = -span; th < span; th += (2.2 / a.R) * r.range(0.55, 1.45)) {
    const s = th * a.R;
    if (nz.n2(s / 46, 20.2) > 0.56 && r.chance(0.75)) continue;
    const clump = nz.n2(s / 70, 3.1) * 0.5 + 0.5, lean = nz.n2(s / 130, 9.7) + 0.6 * nz.n2(s / 34, 5.5);
    const back = r.chance(0.36);
    const dr0 = -r.range(9, 26);
    let tip = 9 + 22 * clump + r.range(-7, 10);
    if (r.chance(0.06)) tip += r.range(8, 22);
    const p0 = a.pt(th, dr0), cm = calm(p0.x);
    tip = Math.min(tip, L.lerp(10 + r.range(0, 9), 60, cm));
    if (back) tip *= 0.8;
    const len = tip - dr0;
    const dir = th * 0.55 + lean * 0.34 + r.gauss() * 0.11, curl = r.gauss() * 0.34 + lean * 0.3;
    const dx = Math.sin(dir), dy = -Math.cos(dir);
    const t = {
      x0: p0.x, y0: p0.y, x1: p0.x + dx * len * 0.55, y1: p0.y + dy * len * 0.55,
      x2: p0.x + dx * len * 0.5 + Math.sin(dir + curl) * len * 0.5, y2: p0.y + dy * len * 0.5 - Math.cos(dir + curl) * len * 0.5,
      w: r.range(2.0, 3.5), back, k: r(), hi: r(),
      cb: back ? r.pick(['#6c100a', '#84160e', '#7a140c']) : r.pick(BASE), ct: back ? r.pick(['#b83020', '#c63a26', '#a4261a']) : r.pick(TIP),
      splay: null,
    };
    // the very tip of an end untwists into two or three filaments
    if (!back && r.chance(0.3)) {
      t.splay = [];
      for (let n = r.int(2, 3); n > 0; n--) { const an = dir + curl + r.gauss() * 0.55, l = r.range(4, 10) * (0.5 + 0.5 * cm); t.splay.push([t.x2 + Math.sin(an) * l, t.y2 - Math.cos(an) * l]); }
    }
    silk.push(t);
  }
  // a few gold threads have worked loose: each leaves the edge almost along it, lifts, and curls over at its end
  const NG = 8;
  for (let n = 0; n < NG; n++) {
    const th = L.lerp(-span, span, (n + r.range(0.2, 0.8)) / NG), side = r.sign();
    const p0 = a.pt(th, -9), low = calm(p0.x) < 0.7;
    if (r.chance(low ? 0.6 : 0.22)) continue;
    for (let tries = 0; tries < 6; tries++) {
      const len = low ? r.range(40, 80) : r.range(60, 150), lift = low ? r.range(0.06, 0.16) : r.range(0.16, 0.62);
      const c0 = r.gauss() * 0.0035, cEnd = r.sign() * r.range(0.025, 0.06), ph = r.range(0, L.TAU), wf = r.range(0.05, 0.11);
      let x = p0.x, y = p0.y, phi = side > 0 ? th - lift : Math.PI + th + lift, ok = true;
      const pts = [[x, y]], n2 = Math.ceil(len / 3);
      for (let k = 1; k <= n2 && ok; k++) {
        const t = k / n2;
        phi += 3 * (c0 + 0.012 * Math.sin(k * 3 * wf + ph) + cEnd * L.smooth((t - 0.62) / 0.38) * (low ? 0.4 : 1));
        x += 3 * Math.cos(phi); y += 3 * Math.sin(phi);
        const dr = a.drAt(x, y);
        if ((k > 3 && dr < -7) || dr > (low ? 13 : 48)) ok = false;
        pts.push([x, y]);
      }
      if (ok) { gold.push({ pts, w: r.range(2.6, 3.6) }); break; }
    }
  }
  // single filaments of floss
  for (let n = 0; n < 90; n++) {
    const th = r.range(-span, span), p0 = a.pt(th, -4), cm = calm(p0.x);
    const len = L.lerp(r.range(10, 20), r.range(26, 78), cm), dir = th + r.gauss() * 0.6;
    const q = [p0.x + Math.sin(dir) * len * 0.5 + r.range(-14, 14), p0.y - Math.cos(dir) * len * 0.5];
    const e = [p0.x + Math.sin(dir + r.gauss() * 0.9) * len, p0.y - Math.cos(dir) * len * L.lerp(0.8, r.range(0.5, 1), cm)];
    wisps.push({ p0, q, e, c: r.pick(['#ffb9a0', '#f58a6a', '#ffd9a0', '#e86a4c']), a: r.range(0.35, 0.75), w: r.range(0.6, 1.1) });
  }
  return { silk, gold, wisps };
}
function drawFringe(g, F, shadow) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (pts) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
  const end = (t, ox) => { g.beginPath(); g.moveTo(t.x0 + ox, t.y0); g.quadraticCurveTo(t.x1 + ox, t.y1, t.x2 + ox, t.y2); };
  if (shadow) {
    g.strokeStyle = 'rgb(3,6,18)';
    for (const t of F.silk) { g.lineWidth = t.w + 1; end(t, 0); g.stroke(); }
    for (const t of F.gold) { g.lineWidth = t.w + 1.5; path(t.pts); g.stroke(); }
    g.restore(); return;
  }
  for (const t of F.wisps) {
    g.globalAlpha = t.a; g.strokeStyle = t.c; g.lineWidth = t.w;
    g.beginPath(); g.moveTo(t.p0.x, t.p0.y); g.quadraticCurveTo(t.q[0], t.q[1], t.e[0], t.e[1]); g.stroke();
  }
  g.globalAlpha = 1;
  const one = (t) => {
    g.strokeStyle = t.back ? 'rgba(40,5,6,0.5)' : 'rgba(70,8,6,0.6)'; g.lineWidth = t.w + 1.1; end(t, 0.5); g.stroke();
    const gr = g.createLinearGradient(t.x0, t.y0, t.x2, t.y2);
    gr.addColorStop(0, t.cb); gr.addColorStop(0.4, L.mix(t.cb, t.ct, 0.45)); gr.addColorStop(1, t.ct);
    g.strokeStyle = gr; g.lineWidth = t.w; end(t, 0); g.stroke();
    if (!t.back && t.hi > 0.4) { g.strokeStyle = 'rgba(255,226,208,0.55)'; g.lineWidth = t.w * 0.36; end(t, -0.6); g.stroke(); }
    if (t.splay) { g.strokeStyle = t.ct; g.lineWidth = 0.9; for (const e of t.splay) { g.beginPath(); g.moveTo(t.x2, t.y2); g.lineTo(e[0], e[1]); g.stroke(); } }
  };
  const order = F.silk.slice().sort((p, q) => p.k - q.k);
  for (const t of order) if (t.back) one(t);
  for (const t of order) if (!t.back) one(t);
  for (const t of F.gold) {
    // gilt paper wound on a silk core: a dark cord, bright turns of gold, a thread of light along the lit side
    g.strokeStyle = '#3a1f04'; g.lineWidth = t.w + 1.6; path(t.pts); g.stroke();
    g.strokeStyle = '#a87416'; g.lineWidth = t.w; path(t.pts); g.stroke();
    g.lineCap = 'butt'; g.setLineDash([3.2, 1.9]); g.strokeStyle = '#eec555'; g.lineWidth = t.w * 0.82; path(t.pts); g.stroke(); g.setLineDash([]); g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,246,208,0.7)'; g.lineWidth = t.w * 0.3; path(t.pts.map((p) => [p[0] - 0.6, p[1] - 0.9])); g.stroke();
  }
  g.restore();
}

// ───────────────────────── composite ─────────────────────────
function buildScene(env) {
  const a = env.arc;
  const cloth = buildCloth(env), B = buildBrocade(env), F = makeFringe(env);
  const full = (g) => g.fillRect(-PAD, -PAD, LW, LH);
  const scene = L.makeLayer(PAD, (g) => {
    g.drawImage(cloth, -PAD, -PAD);
    // the brocade sits a thread's thickness proud of the cotton: contact shadow hugging its edge
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 6, a.R + 30, [[0, 'rgba(3,6,18,0.62)'], [0.35, 'rgba(3,6,18,0.3)'], [1, 'rgba(3,6,18,0)']]); full(g);
    const sh = L.blurred(L.makeLayer(PAD, (s) => drawFringe(s, F, true)), 2.2);
    g.globalAlpha = 0.55; g.drawImage(sh, -PAD + 3, -PAD + 4); g.globalAlpha = 1;
    g.drawImage(B.bro, -PAD, B.Y0);
    drawFringe(g, F, false);
  });
  // shallow focus: sharp along the seam near the crest, softening toward the corners
  const s1 = L.blurred(scene, 2.2), s2 = L.blurred(scene, 5.5);
  const mask = (c, r0, r1) => {
    const g = c.getContext('2d'); g.save(); g.globalCompositeOperation = 'destination-in';
    g.translate(a.cx + PAD, a.crestY + 30 + PAD); g.scale(1, 0.52);
    g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); g.fillRect(-4000, -4000, 8000, 8000); g.restore();
  };
  mask(s1, 560, 1150); mask(s2, 980, 1500);
  const g = scene.getContext('2d');
  g.drawImage(s1, -PAD, -PAD); g.drawImage(s2, -PAD, -PAD);
  g.fillStyle = L.radial(g, W / 2, H / 2, 560, 1220, [[0, 'rgba(4,3,10,0)'], [1, 'rgba(4,3,10,0.4)']]); g.fillRect(-PAD, -PAD, LW, LH);
  return { scene, glint: B.glint, Y0: B.Y0 };
}

export default {
  name: '书函与织金锦',
  tone: 'light',
  async init(env) {
    S = buildScene(env);
    S.gy = Math.max(0, S.Y0 - 30);                      // the glints only live below the seam: work on that strip of the frame
    S.tmp = L.makeCanvas(W, H - S.gy);
    S.bmp = await createImageBitmap(S.scene);
    S.gbmp = await createImageBitmap(S.glint);
  },
  draw(ctx, env, p) {
    const rot = L.lerp(-0.007, 0.007, p), zoom = L.lerp(1.0, 1.022, p), dy = 2 * p;
    L.cam(ctx, env, { rot, zoom, dy }, () => ctx.drawImage(S.bmp, -PAD, -PAD));
    // the gold flickers: two soft bands of light travel across the cloth and wake the glints they pass over
    const t = S.tmp.getContext('2d');
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H);
    t.translate(0, -S.gy);
    L.cam(t, env, { rot, zoom, dy }, () => t.drawImage(S.gbmp, -PAD, S.Y0));
    t.globalCompositeOperation = 'destination-in';
    const c1 = L.lerp(0.14, 0.46, p), c2 = c1 + 0.44, hw = 0.1, lo = 'rgba(0,0,0,0.06)';
    t.fillStyle = L.linear(t, -200, 0, W + 200, 700, [[0, lo], [c1 - hw, lo], [c1, 'rgba(0,0,0,1)'], [c1 + hw, lo], [c2 - hw, lo], [c2, 'rgba(0,0,0,0.9)'], [c2 + hw, lo], [1, lo]]);
    t.fillRect(0, S.gy, W, H - S.gy);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(S.tmp, 0, S.gy); ctx.restore();
  },
};
