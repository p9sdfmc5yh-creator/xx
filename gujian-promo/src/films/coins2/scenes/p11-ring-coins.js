// p11 — 圜钱: a tinted natural-history plate of Warring-States ring coins (the reference's page of green microbes).
// A dozen-odd flat bronze rings with a ROUND hole (about a third of the diameter) laid out on grey-white paper, some with a thin
// raised outer rim, faces plain. Verdigris all over — malachite to grey-green washes, the red-brown metal and a little earth
// showing through here and there — painted as layered watercolour with a fine pen outline that swells on the shadow side.
// Each coin is shaded per DEVICE pixel (L.pixelCanvas) from a height field, light from the top-left: rounded arrises that catch
// the light on one side and go dark on the other, the wall of the flan seen a little obliquely under the lower-right edge and
// inside the upper-left of the hole, then a contact shadow and two softer cast shadows on the paper.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const TAU = Math.PI * 2;
const LS = 1400;                                  // layer size (160 px margin round the frame)
let layer = null;

const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const LIGHT = (() => { const v = [-0.52, -0.62, 0.59], n = Math.hypot(...v); return v.map((c) => c / n); })();   // toward the light
const LX = LIGHT[0], LY = LIGHT[1], LZ = LIGHT[2];
const L2X = LX / Math.hypot(LX, LY), L2Y = LY / Math.hypot(LX, LY);                                              // the same, on the page
const RAMP = [[0, [18, 54, 46]], [0.22, [34, 98, 78]], [0.45, [70, 146, 114]], [0.68, [124, 184, 152]], [0.86, [188, 220, 198]], [1, [232, 240, 226]]];
function ramp(t, out) {
  t = cl(t);
  for (let k = 1; k < RAMP.length; k++) if (t <= RAMP[k][0]) {
    const a = RAMP[k - 1], b = RAMP[k], u = (t - a[0]) / (b[0] - a[0]);
    out[0] = a[1][0] + (b[1][0] - a[1][0]) * u; out[1] = a[1][1] + (b[1][1] - a[1][1]) * u; out[2] = a[1][2] + (b[1][2] - a[1][2]) * u; return;
  }
}
const NA = 2048, AK = NA / TAU;                   // angular look-up tables (index 0 ↔ angle −π)
let BUF = null, GRAIN = null;                    // scratch planes shared by all the coins; a 256 × 256 tile of pigment grain (cells of half a pixel)
const lut = (fn) => { const a = new Float32Array(NA + 2); for (let i = 0; i < NA + 2; i++) a[i] = fn((i / NA) * TAU - Math.PI); return a; };

/** one ring coin, drawn in page orientation (it is round: nothing to rotate). o: R (outer radius, px), seed, rim,
 *  vis ([x0, y0, x1, y1] round the coin's centre: the part of it the camera can ever see — nothing is computed outside) */
function makeCoin(o) {
  const r = L.rng('hq' + o.seed), nz = L.makeNoise('hq' + o.seed);
  const R = o.R, sin = Math.sin;
  // ── the shape: a cast flan is never a true circle, and the hole sits a little off centre ──
  const h2 = r.range(0.005, 0.017), p2 = r() * TAU, h3 = r.range(0.003, 0.008), p3 = r() * TAU, h5 = r.range(0.0015, 0.0045), p5 = r() * TAU, h8 = r.range(0.0008, 0.0024), p8 = r() * TAU;
  const stub = r.chance(0.35) ? r.range(0.011, 0.02) : 0, stubA = r.range(-Math.PI, Math.PI), stubW = r.range(0.06, 0.1);     // what is left of the casting gate
  const RoL = lut((a) => { let d = a - stubA; d = Math.atan2(sin(d), Math.cos(d)); return R * (1 + h2 * sin(2 * a + p2) + h3 * sin(3 * a + p3) + h5 * sin(5 * a + p5) + h8 * sin(8 * a + p8) + stub * Math.exp(-(d / stubW) * (d / stubW))); });
  const rh = R * r.range(0.305, 0.36), hx = R * 0.022 * r.gauss(), hy = R * 0.022 * r.gauss();
  const b2 = r.range(0.008, 0.026), q2 = r() * TAU, b3 = r.range(0.006, 0.018), q3 = r() * TAU, b5 = r.range(0.003, 0.009), q5 = r() * TAU;
  const RhL = lut((a) => rh * (1 + b2 * sin(2 * a + q2) + b3 * sin(3 * a + q3) + b5 * sin(5 * a + q5)));
  const rim = o.rim, w1 = r() * TAU, w2 = r() * TAU, w3 = r() * TAU;
  const RwL = lut((a) => 0.45 + 0.55 * ss(-0.7, 0.1, 0.6 * sin(a + w1) + 0.45 * sin(2 * a + w2) + 0.25 * sin(5 * a + w3)));          // the rim is worn low in places
  const Tw = R * 0.028 + 1.8, wx = -L2X * Tw, wy = -L2Y * Tw;                         // the wall of the flan, seen a little from the upper left
  const Th = 2.6 + R * 0.006, bw = (4.5 + R * 0.02) * (rim ? 0.82 : 1), bwh = bw * 0.8;   // rounded arrises: height, width (outer / hole)
  const rw = bw + R * r.range(0.035, 0.058), rimH = r.range(1.5, 2.2);
  const depth = r.chance(0.3) ? r.range(-0.25, -0.15) : r.range(-0.1, 0.04), grey = r.chance(0.36) ? r.range(0.36, 0.66) : r.range(0, 0.18), warm = r.range(-0.34, 0.34);
  const cuTh = -0.98 + 0.12 * r(), soilAmt = r.range(0.3, 1), hueSeed = r.range(0, 50);
  const half = Math.ceil(R * 1.06 + Tw + 5), w = half * 2;
  const rMid = (R + rh) / 2, RmaxSq = (R * 1.055 + 2) ** 2, RmaxWSq = (R * 1.055 + Tw + 2) ** 2;
  const rMin = Math.max(0, rh * 0.94 - Math.hypot(hx, hy) - 2.5), RminSq = rMin * rMin, RminWSq = Math.max(0, rMin - Tw) ** 2;
  // ── slow fields on a coarse grid (bilinear), fast ones per pixel ──
  const CS = 3, gw = Math.ceil(w / CS) + 2;
  const field = (fn) => { const F = new Float32Array(gw * gw); for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) F[j * gw + i] = fn(i * CS - half, j * CS - half); return F; };
  const CF = 1.5, gf = Math.ceil(w / CF) + 2, FI = new Float32Array(gf * gf);
  for (let j = 0; j < gf; j++) for (let i = 0; i < gf; i++) FI[j * gf + i] = nz.fbm((i * CF - half) / 11, (j * CF - half) / 11, 2);        // fine grain of the crust
  const sampF = (x, y) => {
    const fx = (x + half) / CF, fy = (y + half) / CF, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * gf + i;
    const a = FI[k], b = FI[k + 1], c = FI[k + gf], d = FI[k + gf + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const samp = (F, x, y) => {
    const fx = (x + half) / CS, fy = (y + half) / CS, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * gw + i;
    const a = F[k], b = F[k + 1], c = F[k + gw], d = F[k + gw + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const UN = field((x, y) => nz.fbm(x / 64, y / 64, 2));                    // the face is not quite flat
  const CR = field((x, y) => nz.fbm(x / 62 + 31, y / 62 + 17, 2));          // thickness of the green crust (low = flaked to the metal)
  const WA = field((x, y) => nz.fbm(x / 95 + 3, y / 95 + 8, 2));            // uneven wash
  const HU = field((x, y) => nz.fbm(x / 60 + hueSeed, y / 60, 3));          // blue verdigris ↔ yellow-green
  const SO = field((x, y) => nz.fbm(x / 48 + 9, y / 48 + 5, 2));            // earth
  const BL = field((x, y) => nz.fbm(x / 55 + 70, y / 55 + 41, 3));          // back-runs in the wash
  const gox = r.int(0, 255), goy = r.int(0, 255);
  const worn = [];                                                          // two or three places where the crust is sure to be thin: on an arris, mostly the outer one
  for (let k = 0, n = r.int(2, 3); k < n; k++) { const a = r() * TAU, rr = r.chance(0.65) ? R - bw * r.range(0.4, 1.6) : rh + bwh * r.range(0.6, 2); worn.push([Math.cos(a) * rr, Math.sin(a) * rr, R * r.range(0.08, 0.15)]); }
  const WO = field((x, y) => { let v = 0; for (const p of worn) v += Math.exp(-((x - p[0]) ** 2 + (y - p[1]) ** 2) / (p[2] * p[2])); return v; });
  let dO = 0, dH = 0, ai = 0;                                               // outputs of ring(): inside-positive distances to the outer edge and to the hole
  const ring = (x, y) => {
    let a = (Math.atan2(y, x) + Math.PI) * AK, i = a | 0;
    ai = i; dO = RoL[i] + (RoL[i + 1] - RoL[i]) * (a - i) - Math.sqrt(x * x + y * y);
    const xh = x - hx, yh = y - hy;
    a = (Math.atan2(yh, xh) + Math.PI) * AK; i = a | 0;
    dH = Math.sqrt(xh * xh + yh * yh) - (RhL[i] + (RhL[i + 1] - RhL[i]) * (a - i));
  };

  const cv = L.pixelCanvas(w, w, (D, pw, ph, q) => {
    const vis = o.vis, px0 = Math.max(0, Math.floor((vis[0] + half) * q)), px1 = Math.min(pw, Math.ceil((vis[2] + half) * q));
    const py0 = Math.max(0, Math.floor((vis[1] + half) * q)), py1 = Math.min(ph, Math.ceil((vis[3] + half) * q));
    const N = pw * ph;
    if (!BUF || BUF[0].length < N) BUF = [0, 1, 2, 3, 4].map(() => new Float32Array(N));
    const [Hf, Df, Of, Ff, Cf] = BUF; Hf.fill(0, 0, N); Df.fill(-9, 0, N);
    // pass 1: the top face — distance to its edge, height, where the crust has flaked
    for (let py = py0; py < py1; py++) {
      const y = (py + 0.5) / q - half;
      for (let px = px0; px < px1; px++) {
        const x = (px + 0.5) / q - half, r2 = x * x + y * y;
        if (r2 > RmaxSq || r2 < RminSq) continue;
        const i = py * pw + px;
        ring(x, y);
        const dT = dO < dH ? dO : dH; Df[i] = dT;
        if (dT <= -1.5) continue;
        Of[i] = dO;
        const u = cl(Math.min(dO / bw, dH / bwh)), pr = 1 - Math.pow(1 - u, 2.3);
        const fine = sampF(x, y); Ff[i] = fine;
        const crust = samp(CR, x, y) + 0.07 * fine;
        const edgeWear = 1 - ss(1, bw * 1.4, dT);                                            // the patina is rubbed off the arrises first
        const rub = ss(0.02, 0.4, samp(WA, y, x));
        const cu = ss(cuTh + 0.045, cuTh - 0.045, crust - (0.3 * edgeWear + 0.5 * (1 - ss(0.8, 3.4, dT))) * rub - 1.2 * samp(WO, x, y)); Cf[i] = cu;
        let H = pr * Th;
        if (rim) H += pr * rimH * RwL[ai] * (1 - ss(rw - 1.2, rw + 1.2, dO));
        H += ss(0, 2.5, dT) * (0.8 * samp(UN, x, y) + 0.11 * fine + 0.028 * nz.n2(x / 2.7 + 50, y / 2.7) + 0.35 * ss(-0.15, 0.45, crust) - 0.3 * cu);
        Hf[i] = H;
      }
    }
    // pass 2: colour
    const col = [0, 0, 0];
    for (let py = Math.max(1, py0); py < Math.min(ph - 1, py1); py++) {
      const y = (py + 0.5) / q - half;
      for (let px = Math.max(1, px0); px < Math.min(pw - 1, px1); px++) {
        const x = (px + 0.5) / q - half, r2 = x * x + y * y;
        if (r2 > RmaxWSq || r2 < RminWSq) continue;
        const i = py * pw + px, dT = Df[i];
        let dW = -9;
        if (dT < 2.8) { ring(x - wx, y - wy); dW = dO < dH ? dO : dH; }
        const dU = dT > dW ? dT : dW, al = dU * q + 0.5;
        if (al <= 0) continue;
        const faceK = cl(dT * q + 0.5), rho = Math.sqrt(r2);
        let shade;                                                                           // +1 where the nearest edge faces away from the light
        if (rho > rMid) shade = -(x * L2X + y * L2Y) / rho;
        else { const xh = x - hx, yh = y - hy; shade = (xh * L2X + yh * L2Y) / (Math.sqrt(xh * xh + yh * yh) + 1e-6); }
        let fr = 0, fg = 0, fb = 0;
        if (faceK > 0) {
          const gx = (Hf[i + 1] - Hf[i - 1]) * 0.5 * q, gy = (Hf[i + pw] - Hf[i - pw]) * 0.5 * q;
          const lam = (-gx * LX - gy * LY + LZ) / Math.sqrt(gx * gx + gy * gy + 1);
          const fine = Ff[i], wash = samp(WA, x, y), bq = samp(BL, x, y) + 0.05 * fine, be = (bq - 0.15) / 0.03;
          let t = ss(-0.15, 1.0, lam) + depth + 0.08 * wash + 0.02 * fine + 0.04 * (x * L2X + y * L2Y) / R;
          if (rim) t += 0.05 * (1 - ss(rw - 1.2, rw + 1.2, Of[i]));                           // the rim is rubbed paler
          t += 0.05 * ss(0.14, 0.24, bq) - 0.075 * Math.exp(-be * be);                       // a back-run: paler inside, a darker crinkled tide line
          const t5 = t * 5, fl = Math.floor(t5); t = t * 0.7 + ((fl + ss(0.3, 0.7, t5 - fl)) / 5) * 0.3;      // layered washes
          t -= (0.04 + 0.1 * cl(shade)) * (1 - ss(0.5, 4.5, dT));                            // pigment pooled inside the pen line
          t += 0.022 * GRAIN[((((y + half) * 2 + goy) & 255) << 8) | (((x + half) * 2 + gox) & 255)];   // granulation
          ramp(t, col);
          const hv = samp(HU, x, y) + warm, hk = Math.abs(hv) * 0.7 * ss(0.1, 0.5, t) * (1 - ss(0.82, 1, t));
          if (hv > 0) { col[0] += (72 - col[0]) * hk; col[1] += (160 - col[1]) * hk; col[2] += (164 - col[2]) * hk; }
          else { col[0] += (148 - col[0]) * hk; col[1] += (170 - col[1]) * hk; col[2] += (98 - col[2]) * hk; }
          const lum = 0.3 * col[0] + 0.55 * col[1] + 0.15 * col[2], gk = cl(grey + 0.2 * wash);                // grey-green
          col[0] += (lum * 0.95 - col[0]) * gk; col[1] += (lum - col[1]) * gk; col[2] += (lum * 0.94 - col[2]) * gk;
          const tl = 0.62 + 0.5 * cl(t);
          let so = ss(0.2, 0.55, samp(SO, x, y) + 0.12 * fine) * 0.42 * soilAmt;                                // earth, and more of it in the angle of the rim
          if (rim) { const e = (Of[i] - rw - 2.2) / 2.6; so = Math.max(so, 0.55 * soilAmt * Math.exp(-e * e) * ss(-0.35, 0.2, wash)); }
          col[0] += (182 * tl - col[0]) * so; col[1] += (156 * tl - col[1]) * so; col[2] += (112 * tl - col[2]) * so;
          const cu = Cf[i], ck = cu * cl(0.8 + 0.22 * fine), tc = cl(t);                                                         // the red-brown metal
          col[0] += (52 + 82 * tc - col[0]) * ck; col[1] += (27 + 44 * tc - col[1]) * ck; col[2] += (23 + 30 * tc - col[2]) * ck;
          const dk = 1 - 0.26 * 4 * cu * (1 - cu);
          const sp = ss(0.9, 0.995, lam) * 0.45;                                                                // the bright core of the lit arris
          fr = col[0] * dk; fg = col[1] * dk; fb = col[2] * dk;
          fr += (250 - fr) * sp; fg += (251 - fg) * sp; fb += (242 - fb) * sp;
        }
        let pr = fr, pg = fg, pb = fb;
        if (faceK < 1) {                                                                     // the wall: in shade, a little light thrown back from the paper at its foot
          const dn = cl(-dT / Tw), wc = ss(-0.1, 0.32, samp(CR, x, y)) * 0.5, st = 1 + 0.1 * nz.n2(x / 1.9 + 7, y / 1.9);
          let wr = 32 + 40 * dn, wg = 72 + 46 * dn, wb = 61 + 38 * dn;
          wr += (86 - wr) * wc; wg += (58 - wg) * wc; wb += (44 - wb) * wc;
          wr *= st; wg *= st; wb *= st;
          pr = wr + (fr - wr) * faceK; pg = wg + (fg - wg) * faceK; pb = wb + (fb - wb) * faceK;
        }
        if (dU < 3.2) {                                                                      // the pen line
          const lw = 0.8 + 1.15 * ss(0.05, 0.9, shade);
          const ik = (1 - ss(lw - 0.45, lw + 0.45, dU)) * (0.74 + 0.2 * nz.n2(x / 9 + 20, y / 9));
          pr += (24 - pr) * ik; pg += (42 - pg) * ik; pb += (40 - pb) * ik;
        }
        const o4 = i * 4; D[o4] = pr; D[o4 + 1] = pg; D[o4 + 2] = pb; D[o4 + 3] = cl(al) * 255;
      }
    }
  });

  // pen work on top of the wash: a few fine scratches, and on some coins a little arc hatching on the side away from the light
  const g = cv.getContext('2d'); g.save(); g.translate(half, half); g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round';
  const rin = rh * 1.04 + Math.hypot(hx, hy) + bwh + 3, rout = R * 0.975 - bw - (rim ? rw - bw + 4 : 2);
  for (let k = 0, n = r.int(3, 7); k < n; k++) {
    const a = r() * TAU, rr = r.range(rin + 3, rout - 3), x = Math.cos(a) * rr, y = Math.sin(a) * rr, da = r() * TAU, len = r.range(7, 22), bx = Math.cos(da) * len, by = Math.sin(da) * len;
    const re = Math.hypot(x + bx, y + by); if (re < rin || re > rout) continue;
    g.strokeStyle = 'rgba(18,52,46,0.34)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bx * 0.5 + by * 0.08, y + by * 0.5 - bx * 0.08, x + bx, y + by); g.stroke();
    g.strokeStyle = 'rgba(226,240,226,0.36)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - L2X, y - L2Y); g.quadraticCurveTo(x + bx * 0.5 + by * 0.08 - L2X, y + by * 0.5 - bx * 0.08 - L2Y, x + bx - L2X, y + by - L2Y); g.stroke();
  }
  if (!rim && r.chance(0.65)) {
    const a0 = Math.atan2(-L2Y, -L2X), n = r.int(3, 5);
    for (let k = 0; k < n; k++) {
      const rr = rout - 1 - k * 3.3 + r.range(-0.5, 0.5), span = r.range(0.34, 0.7) * (1 - k * 0.13), c = a0 + r.range(-0.1, 0.1);
      g.strokeStyle = `rgba(20,56,48,${(0.3 - k * 0.035).toFixed(3)})`; g.lineWidth = r.range(0.7, 1); g.beginPath(); g.arc(0, 0, rr, c - span, c + span); g.stroke();
    }
  }
  g.restore();
  return cv;
}

function silhouette(spr, color) {
  const c = L.makeCanvas(spr.width, spr.height), g = c.getContext('2d');
  g.drawImage(spr, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function build() {
  if (!GRAIN) { const nz = L.makeNoise('p11grain'); GRAIN = new Float32Array(65536); for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) GRAIN[j * 256 + i] = nz.n2(i / 3.2, j / 3.2); }
  const pap = K.paper({ base: '#e7e7e0', tone: '#7b7868', seed: 'p11paper', fiber: 0.55, stain: 0.28, foxing: 0.22, edge: 0.14, size: LS });
  const ink = L.makeCanvas(LS, LS), g = ink.getContext('2d');
  // lay-out: darts thrown over the whole layer, big coins first, the small ones into the gaps (coins run off the edges; none overlap)
  const r = L.rng('p11ring'), spots = [{ x: 652, y: 688, R: 154, gap: 20 }];
  for (const [n, lo, hi] of [[6, 136, 160], [9, 110, 136], [16, 90, 110]]) {
    for (let t = 0, placed = 0; t < 5000 && placed < n; t++) {
      const R = r.range(lo, hi), x = r.range(-40, LS + 40), y = r.range(-40, LS + 40), gap = r.range(12, 34);
      if (spots.some((p) => Math.hypot(p.x - x, p.y - y) < p.R + R + Math.min(gap, p.gap))) continue;
      spots.push({ x, y, R, gap }); placed++;
    }
  }
  const VIS0 = 132, VIS1 = LS - 132, VM = 44;                                // what the camera ever sees of the layer; margin for the shadows
  const coins = [];
  spots.forEach((sp, i) => {
    if (sp.x + sp.R + 30 < VIS0 || sp.x - sp.R - 12 > VIS1 || sp.y + sp.R + 30 < VIS0 || sp.y - sp.R - 12 > VIS1) return;
    const spr = makeCoin({ R: sp.R, seed: i, rim: i % 5 === 1 || i % 5 === 3, vis: [VIS0 - VM - sp.x, VIS0 - VM - sp.y, VIS1 + VM - sp.x, VIS1 + VM - sp.y] });
    coins.push({ spr, x0: Math.round(sp.x - spr.width / 2), y0: Math.round(sp.y - spr.height / 2), R: sp.R });
  });
  // shadows first, all of them on the paper: a wide soft one, the cast shadow, and a tight contact shadow hugging the foot of the wall
  const scr = L.makeCanvas(LS, LS), sg = scr.getContext('2d'), sils = coins.map((c) => silhouette(c.spr, '#39434e'));
  for (const [mul, add, blur, alpha] of [[1.5, 0, 14, 0.15], [1, 0, 5, 0.3], [0, 1.7, 1.4, 0.5]]) {
    sg.clearRect(0, 0, LS, LS);
    coins.forEach((c, i) => { const k = (4 + c.R * 0.034) * mul + add; sg.drawImage(sils[i], c.x0 - L2X * k, c.y0 - L2Y * k); });
    g.save(); g.globalAlpha = alpha; g.filter = `blur(${blur}px)`; g.drawImage(scr, 0, 0); g.restore();
  }
  g.filter = 'none';
  for (const c of coins) g.drawImage(c.spr, c.x0, c.y0);
  // a few drops flicked off the brush
  for (let k = 0; k < 9; k++) {
    const x = r.range(0, LS), y = r.range(0, LS), rr = r.range(1.4, 3.4);
    if (spots.some((p) => Math.hypot(p.x - x, p.y - y) < p.R + 26)) continue;
    g.fillStyle = `rgba(96,160,134,${r.range(0.22, 0.42).toFixed(2)})`; g.beginPath(); g.ellipse(x, y, rr, rr * r.range(0.8, 1), r() * 3, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(52,116,94,0.4)'; g.lineWidth = 0.8; g.stroke();
  }
  BUF = null;
  K.soak(ink, pap, 0.45);
  const out = L.makeCanvas(LS, LS), og = out.getContext('2d');
  og.drawImage(pap, 0, 0); og.drawImage(ink, 0, 0);
  return out;
}

export default {
  name: '圜钱',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.03, x0: 18, y0: 12, x1: -12, y1: -8 });
  },
};
