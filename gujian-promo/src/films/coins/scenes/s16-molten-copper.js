// s16 — 铜水. Macro photograph across a crucible of molten copper: the arc is the upper edge of the melt, where surface
// tension humps the liquid into a meniscus; the limb is the brightest line of the picture, against pure black.
// Three big shapes only:
//   · black above the arc,
//   · the melt itself: smooth, self-luminous, orange-yellow in the hot middle, orange-red and darker toward the sides and
//     the near corners, with slow flow bands that crowd together toward the limb (the surface is seen edge-on there),
//   · rafts of dark oxide skin and dross floating on it, every one ringed by a bright line where the melt climbs its edge.
// Everything under the arc is shaded per pixel in init(): each pixel gets surface coordinates (U along the limb, Sv down
// the bulge, compressed toward the limb like a drop seen edge-on); a heat field picks the colour, a gentle height field
// gives the swell. A depth-of-field pass then melts the sides and the foreground. draw() only breathes the glow.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 40;         // the camera barely moves (liquid, not landscape) → a small margin is enough
const KF = 11;          // foreshortening: Sv = d + KF·√d  (d = px below the limb)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const fore = (d) => d + KF * Math.sqrt(d);
const rehash = (h, salt) => { let v = Math.imul(h ^ salt, 0x45d9f3b); v ^= v >>> 15; v = Math.imul(v, 0x2c1b3c6d); return v ^ (v >>> 12); };

/** small, fast gradient noise (≈ −1…1); the shading loop calls it several million times */
function gradNoise(seed) {
  const r = L.rng(seed), P = new Uint8Array(514), GX = new Float32Array(256), GY = new Float32Array(256), perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 514; i++) P[i] = perm[i & 255];
  for (let i = 0; i < 256; i++) { const an = r() * L.TAU; GX[i] = Math.cos(an) * 1.6; GY[i] = Math.sin(an) * 1.6; }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, X = xi & 255, Y = yi & 255;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = P[P[X] + Y], b = P[P[X + 1] + Y], c = P[P[X] + Y + 1], e = P[P[X + 1] + Y + 1];
    const n00 = GX[a] * fx + GY[a] * fy, n10 = GX[b] * (fx - 1) + GY[b] * fy;
    const n01 = GX[c] * fx + GY[c] * (fy - 1), n11 = GX[e] * (fx - 1) + GY[e] * (fy - 1);
    const p0 = n00 + (n10 - n00) * u, p1 = n01 + (n11 - n01) * u;
    return p0 + (p1 - p0) * v;
  };
}

// rafts of oxide skin and dross (氧化皮 / 浮渣) on the melt: frame position of the centre, half-sizes on the surface
const SLAGS = [
  { x: 486, y: 992, ax: 188, ay: 62, seed: 1 },
  { x: 738, y: 1022, ax: 42, ay: 21, seed: 2 },      // a chip that has broken off it
  { x: 1316, y: 908, ax: 150, ay: 46, seed: 3 },
  { x: 985, y: 818, ax: 62, ay: 24, seed: 4 },
  { x: 604, y: 704, ax: 124, ay: 36, seed: 5 },      // slivers near the limb, foreshortened
  { x: 1432, y: 696, ax: 92, ay: 28, seed: 6 },
  { x: 1668, y: 1012, ax: 132, ay: 44, seed: 7 },
  { x: 1122, y: 992, ax: 36, ay: 16, seed: 8 },
  { x: 286, y: 852, ax: 66, ay: 24, seed: 9 },
  { x: 1572, y: 808, ax: 40, ay: 15, seed: 10 },
  { x: 852, y: 928, ax: 28, ay: 12, seed: 11 },
  { x: 1188, y: 744, ax: 46, ay: 17, seed: 12 },
  { x: 806, y: 662, ax: 70, ay: 20, seed: 13 },
];
// a very few embers, far out to the sides and out of focus (the tagline sits over the crest)
const SPARKS = [
  { x: 214, y: 502, r: 4.6, vx: -20, vy: -34, a: 0.9 },
  { x: 1724, y: 408, r: 3.2, vx: 18, vy: -30, a: 1 },
  { x: 1606, y: 214, r: 7.5, vx: 10, vy: -22, a: 0.42 },
];

function buildSurface(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 4;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const g1 = gradNoise('s16-a'), g2 = gradNoise('s16-b'), g3 = gradNoise('s16-c');
  const sn = L.makeNoise('s16-h').n2;      // simplex for the height field: lattice noise lines its flat spots up in rows, and the glints sit on flat spots

  // along the limb (tables over the angle): where the skin ends, a 1–2 px unevenness of the edge, how hot the lip runs
  const TH = Math.atan2(W / 2 + PAD + 4, cy - (H + PAD)) + 0.012, NB = 4096;
  const Bl = new Float32Array(NB + 2), El = new Float32Array(NB + 2), Ll = new Float32Array(NB + 2), Kl = new Float32Array(NB + 2);
  for (let i = 0; i < NB + 2; i++) {
    const u = L.lerp(-TH, TH, i / NB) * R;
    // thin on the left, deep on the right (it leaves the frame through the bottom edge), slow waves, small scallops
    Bl[i] = 214 + 0.19 * u + 0.00009 * u * u + 30 * g1(u / 410 + 3.1, 0.7) + 11 * g2(u / 140, 5.5) + 3.5 * g3(u / 44, 9.1);
    El[i] = 2.1 * g2(u / 150 + 20, 2.2) + 1.1 * g3(u / 46, 4.4);
    // the lip: hot stretches and duller ones, a few short gaps where a crumb of the skin rides the edge, thick here and thin there
    const nick = sstep(0.46, 0.7, g3(u / 26 + 3.3, 7.7) + 0.4 * g2(u / 9 + 1.1, 2.1));
    Ll[i] = (0.6 + 0.4 * sstep(-0.5, 0.45, g1(u / 230 + 8.4, 6.6) + 0.35 * g3(u / 60, 1.9)) - 0.22 * sstep(700, 1150, Math.abs(u + 60))) * (1 - 0.45 * nick);
    Kl[i] = 2.3 + 2.4 * sstep(-0.4, 0.5, g2(u / 95 + 40.5, 8.8));
  }
  const slags = SLAGS.map((s) => { const pl = a.polar(s.x, s.y); return { th: pl.theta, S: fore(-pl.dr), ax: s.ax, ay: s.ay, seed: s.seed }; });

  // colour of the melt by heat: dark red where it is coolest, through orange-red and orange to a near-white yellow
  const rampF = L.makeRamp([[0, '#2e0604'], [0.2, '#7c1109'], [0.36, '#bf200f'], [0.5, '#e63c14'], [0.62, '#fb6318'], [0.74, '#ff8a1e'], [0.84, '#ffaa2c'], [0.92, '#ffc852'], [1, '#ffe6a0']]);
  const RAMP = new Float32Array(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = rampF(i / 1023); RAMP[i * 3] = c[0]; RAMP[i * 3 + 1] = c[1]; RAMP[i * 3 + 2] = c[2]; }

  // 1) slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const cWx = new Float32Array(CN), cWy = new Float32Array(CN), cTone = new Float32Array(CN), cDens = new Float32Array(CN), cMarb = new Float32Array(CN), cSw = new Float32Array(CN);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const d = Math.max(0, R - rr), U = Math.atan2(ddx, ddy) * R, Sv = fore(d), k = j * cw + i;
    cWx[k] = g1(U / 84 + 5, Sv / 84); cWy[k] = g2(U / 84 - 31, Sv / 84 + 19);
    cTone[k] = g2(U / 210 + 11, Sv / 150 + 4) + 0.5 * g3(U / 74 - 6, Sv / 60 + 2);
    cDens[k] = g3(U / 250 + 31, Sv / 150 - 2) + 0.45 * g1(U / 96 + 9, Sv / 80 - 17);
    cMarb[k] = g1(U / 520 + 3, Sv / 300 - 8) + 0.4 * g2(U / 190 - 2, Sv / 130 + 6);
    cSw[k] = sn(U / 400 + 9, Sv / 230 - 4) + 0.4 * sn(U / 170 + 2, Sv / 110 + 13);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 2) material pass: colour, height, glint weight
  const Hh = new Float32Array(N), Cr = new Float32Array(N), Cg = new Float32Array(N), Cb = new Float32Array(N);
  const Wt = new Float32Array(N), Al = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 4) continue;
      const th = Math.atan2(ddx, ddy);
      const fb = ((th + TH) / (2 * TH)) * NB, ib = fb < 0 ? 0 : fb > NB ? NB : fb | 0, ff = fb - ib;
      const cov = R + El[ib] + (El[ib + 1] - El[ib]) * ff + 0.5 - rr;
      if (cov <= 0) continue;
      const k = j * RW + i;
      Al[k] = cov > 1 ? 1 : cov;
      const d = cov > 0.5 ? cov - 0.5 : 0, U = th * R, Sv = d + KF * Math.sqrt(d);
      // ── the melt: smooth and self-luminous. Slow flow bands (warped, long along the limb), a hot middle, cooler sides
      const sw = bil(cSw, i, j), mb = bil(cMarb, i, j);
      const pu = U + bil(cWx, i, j) * 16 + mb * 90, pv = Sv + bil(cWy, i, j) * 5 + sw * 34;
      const f1 = sn(pu / 640 + 2.3, pv / 118), f2 = sn(pu / 330 - 6.1, pv / 54 + 4.4), f3 = g3(pu / 120 + 1.7, pv / 17);
      const flow = 0.6 * f1 + 0.33 * f2 + 0.07 * f3;
      const ex = (ddx + 40) / 980, ey = (d - 230) / 520;
      const core = 1 - sstep(0.2, 1.2, Math.sqrt(ex * ex + ey * ey));
      let T = 0.43 + 0.4 * core + 0.11 * flow + 0.04 * mb - 0.09 * Math.exp(-d / 40);
      T = T < 0 ? 0 : T > 1 ? 1 : T;
      const ti = ((T * 1023) | 0) * 3;
      let r = RAMP[ti], g = RAMP[ti + 1], b = RAMP[ti + 2];
      let h = (3.2 * sw + 0.7 * flow) * sstep(0, 34, d);          // slow swell of the liquid surface
      let wt = (0.25 + 0.75 * (1 - sstep(90, 300, d))) * sstep(26, 60, d);
      // rafts of oxide skin
      for (let n = 0; n < slags.length; n++) {
        const P = slags[n], du = (th - P.th) * rr, dv = Sv - P.S;
        if (du > P.ax * 1.8 || du < -P.ax * 1.8 || dv > P.ay * 1.9 || dv < -P.ay * 1.9) continue;
        const nd = Math.sqrt((du * du) / (P.ax * P.ax) + (dv * dv) / (P.ay * P.ay));
        const wob = 0.3 * g1(du / (P.ax * 0.62) + P.seed * 13.7, dv / (P.ay * 1.0) - P.seed * 5.1) + 0.2 * g2(du / 46 + P.seed * 3.3, dv / 30) + 0.05 * g3(du / 14 + P.seed, dv / 12);
        const fp = (1 - nd + wob) * P.ay;       // ≈ surface px inside (+) / outside (−) the raft's edge
        if (fp < -60) continue;
        // the melt round a raft is a little cooler; right at the edge it climbs the crust and glows brightest
        const halo = sstep(-Math.min(46, 0.42 * P.ay), 0, fp);
        r *= 1 - 0.05 * halo; g *= 1 - 0.26 * halo; b *= 1 - 0.3 * halo;
        const lit = 0.55 + 0.45 * sstep(0.5, -0.7, dv / P.ay + (0.5 * du) / P.ax);
        const men = Math.exp(-((fp + 2.6) * (fp + 2.6)) / 6.5) * 0.86 * lit * (0.5 + 0.5 * sstep(-0.4, 0.3, g2(du / 38 + P.seed * 2.2, dv / 30 + 6.6)));
        r += (255 - r) * men; g += (224 - g) * men; b += (150 - b) * men;
        h += 1.8 * sstep(-Math.min(10, 0.4 * P.ay), 0, fp);
        if (fp > 0) {
          // a matt crust: dark red-brown, mottled and grained; thinner (so hotter) toward its edge; a few dull glowing cracks
          const mot = g2(du / 34 + P.seed * 9.1, dv / 26 + P.seed * 4.3) + 0.5 * g3(du / 11, dv / 9) + 0.22 * g1(du / 4.6 + 7.1, dv / 4.1 + P.seed);
          const tone = 0.8 + 0.22 * mot;
          let thin = 1 - sstep(0, 22, fp); thin *= thin;
          let sr = 80 * tone, sg = 13 * tone, sb = 9 * tone;
          sr += (222 - sr) * 0.8 * thin; sg += (62 - sg) * 0.8 * thin; sb += (20 - sb) * 0.8 * thin;
          const cn = g1(du / 54 + P.seed * 3.9, dv / 38 - P.seed * 1.3) + 0.3 * g2(du / 17 + 2.2, dv / 13 + P.seed);
          const ck = (1 - sstep(0.0, 0.05, cn < 0 ? -cn : cn)) * sstep(9, 24, fp) * 0.6;
          sr += (214 - sr) * ck; sg += (56 - sg) * ck; sb += (16 - sb) * ck;
          const inn = sstep(0, 2.5, fp);
          r += (sr - r) * inn; g += (sg - g) * inn; b += (sb - b) * inn;
          h = h * (1 - inn) + inn * (2.2 + 1.6 * sstep(0, 7, fp) + 0.5 * mot - 0.9 * ck);
          wt *= 1 - inn;
        }
      }
      // falloff toward the sides (the crest is where the heat is)
      const sv = 1 - 0.17 * sstep(560, 1120, ddx < 0 ? -ddx : ddx); r *= sv; g *= sv * sv; b *= sv;
      // the limb: brightest line of the picture, hotter in some stretches than in others
      const lp = Ll[ib] + (Ll[ib + 1] - Ll[ib]) * ff;
      const rim2 = Math.exp(-d / 12) * 0.6, rim1 = Math.exp(-d / (Kl[ib] + (Kl[ib + 1] - Kl[ib]) * ff)) * lp;
      r += (255 - r) * rim2; g += (150 - g) * rim2; b += (44 - b) * rim2;
      r += (255 - r) * rim1; g += (232 - g) * rim1; b += (180 - b) * rim1;
      Hh[k] = h; Cr[k] = r; Cg[k] = g; Cb[k] = b; Wt[k] = wt;
    }
  }

  // 3) relief + a calm sheen → pixels (one light, upper left)
  const img = new ImageData(RW, RH), o = img.data;
  const GX = 0.011, GY = 0.02, GW = 0.00006;              // slope the melt must have to mirror the light, and the lobe's width
  for (let j = 0; j < RH; j++) {
    const jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, al = Al[k];
      if (al <= 0) continue;
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      let r = Cr[k], g = Cg[k], b = Cb[k];
      const wt = Wt[k];
      let rel = (hx * 0.5 + hy * 0.86) * 1.4; rel = rel < -0.4 ? -0.4 : rel > 0.5 ? 0.5 : rel;
      const up = rel > 0 ? rel : 0;
      if (rel < 0) { r *= 1 + rel * 0.55; g *= 1 + rel * 1.5; b *= 1 + rel * 1.9; }
      else { r = r * (1 + rel) + up * 24; g = g * (1 + rel * 1.15) + up * 56; b = b * (1 + rel) + up * 16; }
      if (wt > 0) {
        const e1 = hx - GX, e2 = hy - GY, s = Math.exp(-(e1 * e1 + e2 * e2) / GW) * wt * 0.2;
        r += (255 - r) * s; g += (214 - g) * s; b += (140 - b) * s;
      }
      const q = k * 4;
      o[q] = r; o[q + 1] = g; o[q + 2] = b; o[q + 3] = al * 255;
    }
  }
  const toCanvas = (im) => { const c = L.makeCanvas(im.width, im.height); c.getContext('2d').putImageData(im, 0, 0); return c; };
  const surf = toCanvas(img);

  const sg = surf.getContext('2d');

  // 4) depth of field: sharp across the middle of the melt, melting toward the sides and the foreground
  const mw = Math.ceil(RW / 4), mh = Math.ceil(RH / 4);
  const mk = [new ImageData(mw, mh), new ImageData(mw, mh)];
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const x = X0 + i * 4 + 2, y = Y0 + j * 4 + 2, d = R - Math.hypot(x - cx, cy - y);
    const sx = sstep(520, 1100, Math.abs(x - 940)), sy = sstep(330, 760, d);
    let bl = (sx > sy ? sx : sy) + 0.4 * sx * sy; bl = bl > 1 ? 1 : bl;
    const q = (j * mw + i) * 4;
    mk[0].data[q + 3] = sstep(0.04, 0.5, bl) * 255; mk[1].data[q + 3] = sstep(0.42, 1, bl) * 255;
  }
  const mask = mk.map(toCanvas);
  const lens = (px, m) => {
    const bl = L.blurred(surf, px), bg = bl.getContext('2d');
    bg.globalCompositeOperation = 'destination-in'; bg.drawImage(m, 0, 0, RW, RH);
    sg.globalCompositeOperation = 'destination-out'; sg.drawImage(m, 0, 0, RW, RH);
    sg.globalCompositeOperation = 'lighter'; sg.drawImage(bl, 0, 0);
    sg.globalCompositeOperation = 'source-over';
  };
  { const soft = L.blurred(surf, 0.6); sg.globalCompositeOperation = 'copy'; sg.drawImage(soft, 0, 0); sg.globalCompositeOperation = 'source-over'; }   // no lens is pixel-sharp
  lens(2.6, mask[0]); lens(7.5, mask[1]);
  // bloom: only the hot parts, blurred wide, kept at quarter size
  const BM = 160, bw = Math.round(RW / 4), bh = Math.round((RH + BM) / 4);
  const bloom = L.makeCanvas(bw, bh), bg = bloom.getContext('2d');
  bg.filter = 'brightness(0.62) contrast(2.8) blur(8px)';
  bg.drawImage(surf, 0, BM / 4, bw, RH / 4);
  bg.filter = 'none';
  return { surf, bloom, X0, Y0, RW, RH, BM };
}

export default {
  name: '铜水',
  tone: 'light',
  init(env) {
    S = buildSurface(env);
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const breath = Math.sin(Math.PI * L.clamp(p));          // one slow swell of brightness
    const fi = Math.round(p * (env.frames - 1));            // frame index within the shot → per-frame flicker
    const rot = L.lerp(-0.0014, 0.0014, p), zoom = L.lerp(1, 1.008, p);

    // the dark: black, the faintest veil of heat hugging the limb, a very few embers out of focus
    ctx.fillStyle = '#040202'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 2, a.R + 26, [[0, `rgba(255,84,26,${0.15 + 0.07 * breath})`], [0.35, 'rgba(226,38,26,0.045)'], [1, 'rgba(150,16,10,0)']]);
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < SPARKS.length; i++) {
      const s = SPARKS[i], x = s.x + s.vx * p, y = s.y + s.vy * p;
      const tw = s.a * (0.65 + 0.35 * (((rehash(fi * 31 + i * 7 + 3, 0x9e3779b1) >>> 8) & 255) / 255));
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(s.vy, s.vx)); ctx.scale(1.7, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, s.r * 3.2, [[0, `rgba(255,122,31,${0.5 * tw})`], [0.4, `rgba(226,60,22,${0.16 * tw})`], [1, 'rgba(226,38,26,0)']]);
      ctx.beginPath(); ctx.arc(0, 0, s.r * 3.2, 0, L.TAU); ctx.fill();
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, s.r, [[0, `rgba(255,226,180,${0.95 * tw})`], [0.6, `rgba(255,170,90,${0.7 * tw})`], [1, 'rgba(255,122,31,0)']]);
      ctx.beginPath(); ctx.arc(0, 0, s.r, 0, L.TAU); ctx.fill();
      ctx.restore();
    }

    // the melt
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.surf, S.X0, S.Y0);
      // heat bloom
      ctx.save(); a.clipBelow(ctx, 0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.14 + 0.2 * breath;
      ctx.drawImage(S.bloom, S.X0, S.Y0 - S.BM, S.RW, S.RH + S.BM);
      ctx.restore();
    });

    // the limb breathes: a thin additive line exactly on the arc, strongest over the crest
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.1 + 0.3 * breath;
    ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(255,150,60,0.2)'], [0.3, 'rgba(255,217,160,0.7)'], [0.48, 'rgba(255,232,186,1)'], [0.72, 'rgba(255,205,136,0.6)'], [1, 'rgba(255,150,60,0.2)']]);
    ctx.lineWidth = 2; a.stroke(ctx, -1.4);
    ctx.restore();
  },
};
