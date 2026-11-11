// s16 — 铜水. Macro photograph across a crucible of molten copper: the arc is the upper edge of the melt, where surface
// tension humps the liquid into a meniscus; the limb is the brightest line of the picture, against pure black.
// Three big shapes only (the reference is a wet, cut tomato against black):
//   · black above the arc,
//   · a wide band of wet, lumpy, hot-red skin under the limb — the oxide film breaking up, every lump with its own
//     irregular glint — thin on the left, sweeping down and out of frame on the right,
//   · the clear orange-red depth of the melt below it, smooth and out of focus, with two rafts of dark slag and a few
//     bubbles low in the frame.
// Everything under the arc is shaded per pixel in init(): each pixel gets surface coordinates (U along the limb, Sv down
// the bulge, compressed toward the limb like a drop seen edge-on), a height field gives the lumps, and the glints come
// from matching the slope of that field against one light (upper left). A depth-of-field pass then melts the sides and
// the foreground. draw() only flickers the in-focus glints, breathes the bloom and swells one bubble.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 40;         // the camera barely moves (liquid, not landscape) → a small margin is enough
const KF = 11;          // foreshortening: Sv = d + KF·√d  (d = px below the limb)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const fore = (d) => d + KF * Math.sqrt(d);
const squash = (d) => 1 / (1 + KF / (2 * Math.sqrt(Math.max(d, 1))));   // local vertical compression of the surface on screen
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

// rafts of slag (渣皮) on the clear melt, low in the frame and cropped by it: frame position of the centre, half-sizes on the surface
const SLAGS = [
  { x: 486, y: 992, ax: 188, ay: 62, seed: 1 },
  { x: 738, y: 1022, ax: 42, ay: 21, seed: 2 },      // a chip that has broken off it
];
// bubbles: frame position of the foot, radius; the first one swells during the shot
const BUBBLES = [
  { x: 1052, y: 968, r: 64, grow: true },
  { x: 1186, y: 1030, r: 30 },
  { x: 1262, y: 1002, r: 11 },
];
// a very few embers, far out to the sides and out of focus (the tagline sits over the crest)
const SPARKS = [
  { x: 214, y: 502, r: 4.6, vx: -20, vy: -34, a: 0.9 },
  { x: 1724, y: 408, r: 3.2, vx: 18, vy: -30, a: 1 },
  { x: 1606, y: 214, r: 7.5, vx: 10, vy: -22, a: 0.42 },
];

/** a bubble: a dome of the same liquid — its upper edge mirrors the black above, its belly glows, one soft glint */
function paintBubble(ctx, bx, by, r, fz, k) {
  const hb = r * fz * 0.9, ht = r * L.lerp(0.42, 0.96, k);
  ctx.save(); ctx.translate(bx, by);
  // the pool dips round the foot
  ctx.save(); ctx.scale(1, fz);
  ctx.fillStyle = L.radial(ctx, 0, 0, r * 0.9, r * 1.7, [[0, 'rgba(124,14,8,0.5)'], [0.5, 'rgba(160,22,10,0.18)'], [1, 'rgba(160,22,10,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, L.TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,196,128,0.5)'; ctx.lineWidth = Math.max(1.6, r * 0.06); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0.5, Math.PI - 0.9); ctx.stroke();
  ctx.restore();
  const dome = () => { ctx.beginPath(); ctx.ellipse(0, 0, r, ht, 0, Math.PI, L.TAU); ctx.ellipse(0, 0, r, hb, 0, 0, Math.PI); ctx.closePath(); };
  dome();
  ctx.fillStyle = L.linear(ctx, 0, -ht, 0, hb, [[0, '#8a120b'], [0.2, '#c21c12'], [0.5, '#ea3a1a'], [0.8, '#fb6a20'], [1, '#ff9a40']]);
  ctx.fill();
  ctx.save(); dome(); ctx.clip();
  ctx.fillStyle = L.radial(ctx, r * 0.1, hb * 0.2, r * 0.5, r * 1.05, [[0, 'rgba(110,14,8,0)'], [0.7, 'rgba(110,14,8,0.2)'], [1, 'rgba(84,10,6,0.8)']]);
  ctx.fillRect(-r - 2, -ht - 2, r * 2 + 4, ht + hb + 4);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = L.radial(ctx, r * 0.16, hb * 0.35, 0, r * 0.8, [[0, 'rgba(255,150,60,0.34)'], [1, 'rgba(255,110,30,0)']]);
  ctx.fillRect(-r - 2, -ht - 2, r * 2 + 4, ht + hb + 4);
  ctx.restore();
  // the glint: one soft-edged window of light on the upper-left shoulder
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(-r * 0.36, -ht * 0.5); ctx.rotate(-0.6); ctx.scale(1, 0.5);
  ctx.fillStyle = L.radial(ctx, 0, 0, 0, r * 0.6, [[0, 'rgba(255,170,80,0.5)'], [1, 'rgba(255,120,40,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, L.TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = L.radial(ctx, 0, 0, 0, r * 0.3, [[0, '#fff2dc'], [0.55, 'rgba(255,222,168,0.92)'], [1, 'rgba(255,190,110,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, L.TAU); ctx.fill();
  ctx.restore();
  ctx.restore();
}

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
    Ll[i] = (0.6 + 0.4 * sstep(-0.5, 0.45, g1(u / 230 + 8.4, 6.6) + 0.35 * g3(u / 60, 1.9)) - 0.22 * sstep(700, 1150, Math.abs(u + 60))) * (1 - 0.8 * nick);
    Kl[i] = 2.3 + 2.4 * sstep(-0.4, 0.5, g2(u / 95 + 40.5, 8.8));
  }
  const slags = SLAGS.map((s) => { const pl = a.polar(s.x, s.y); return { th: pl.theta, S: fore(-pl.dr), ax: s.ax, ay: s.ay, seed: s.seed }; });

  // colour of the clear melt by depth below the skin's edge: hottest orange right under the lip, redder further in
  const rampF = L.makeRamp([[0, '#ff8e32'], [12 / 520, '#fc7224'], [50 / 520, '#f2521c'], [130 / 520, '#e83c19'], [270 / 520, '#db2a17'], [1, '#c41e13']]);
  const RAMP = new Float32Array(521 * 3);
  for (let i = 0; i <= 520; i++) { const c = rampF(i / 520); RAMP[i * 3] = c[0]; RAMP[i * 3 + 1] = c[1]; RAMP[i * 3 + 2] = c[2]; }

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

  // 2) material pass: colour, height, glint weights
  const Hh = new Float32Array(N), Cr = new Float32Array(N), Cg = new Float32Array(N), Cb = new Float32Array(N);
  const Wa = new Float32Array(N), Wt = new Float32Array(N), Al = new Float32Array(N), Gb = new Float32Array(N), Tp = new Float32Array(N), Gp = new Uint8Array(N);
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
      const t = d - (Bl[ib] + (Bl[ib + 1] - Bl[ib]) * ff);
      let r = 0, g = 0, b = 0, h = 0, wa = 0, wt = 0, grp = 0;
      if (t < 0) {
        // ── the wet skin: a smooth, lumpy, glistening surface (warped so no two lumps are alike)
        const pu = U + bil(cWx, i, j) * 10, pv = Sv + bil(cWy, i, j) * 10;
        const n1 = sn(pu / 56, pv / 56), n2 = sn((pu * 0.825 - pv * 0.565) / 27 + 7.3, (pu * 0.565 + pv * 0.825) / 27 - 3.1), n3 = g3(U / 7 + 1.7, Sv / 7);
        const tone = bil(cTone, i, j);
        const fin = sstep(2, 15, d);                  // the lumps melt into a smooth glowing lip at the very limb
        const gr = sstep(-18, -2, t);                 // … and sink into a shallow groove where the skin ends
        const flat = fin * (1 - gr);
        const hh = n1 + 0.5 * n2;
        h = (hh + 0.02 * n3) * flat;
        const tv = 1 + 0.07 * tone + 0.05 * hh;
        r = 229 * tv; g = (37 + 13 * tone + 9 * hh) * tv; b = 25 * tv;
        r *= 1 - 0.2 * gr; g *= 1 - 0.46 * gr; b *= 1 - 0.42 * gr;
        wa = flat * (0.5 + 0.5 * sstep(-0.75, 0.55, bil(cDens, i, j)));
        Tp[k] = sstep(0.0, 0.34, hh);
        const gq = g3(U / 31 + 50.5, Sv / 31 - 8.2);
        grp = gq < -0.14 ? 0 : gq < 0.14 ? 1 : 2;
        Gb[k] = 0.55 + 0.45 * sstep(-0.35, 0.3, g2(U / 36 - 20.5, Sv / 36 + 3.3));
      } else {
        // ── the clear melt
        const ti = (t > 519 ? 519 : t | 0) * 3;
        r = RAMP[ti]; g = RAMP[ti + 1]; b = RAMP[ti + 2];
        const m = bil(cMarb, i, j);
        if (m > 0) { const q = m > 1 ? 0.2 : 0.2 * m; r += (255 - r) * q; g += (122 - g) * q; b += (38 - b) * q; }
        else { const q = m < -1 ? 0.3 : -0.3 * m; r += (204 - r) * q; g += (30 - g) * q; b += (20 - b) * q; }
        const occ = (1 - sstep(0, 10, t)) * 0.6;                    // the melt tucks under the skin's edge …
        r += (156 - r) * occ; g += (18 - g) * occ; b += (10 - b) * occ;
        const hl = Math.exp(-((t - 7.5) * (t - 7.5)) / 4.5) * (0.14 + 0.8 * sstep(-0.25, 0.4, g1(U / 130 + 2.2, 3.3) + 0.3 * g3(U / 31, 7.7)));   // … and bulges out again with a long, broken glint
        r += (255 - r) * hl; g += (216 - g) * hl; b += (156 - b) * hl;
        h = 3.2 * bil(cSw, i, j) * sstep(0, 34, t);                 // slow swell of the liquid surface
        wt = (0.25 + 0.75 * (1 - sstep(90, 300, t))) * sstep(26, 60, t);
        // rafts of slag
        for (let n = 0; n < slags.length; n++) {
          const P = slags[n], du = (th - P.th) * rr, dv = Sv - P.S;
          if (du > P.ax * 1.8 || du < -P.ax * 1.8 || dv > P.ay * 1.9 || dv < -P.ay * 1.9) continue;
          const nd = Math.sqrt((du * du) / (P.ax * P.ax) + (dv * dv) / (P.ay * P.ay));
          const wob = 0.3 * g1(du / (P.ax * 0.62) + P.seed * 13.7, dv / (P.ay * 1.0) - P.seed * 5.1) + 0.2 * g2(du / 46 + P.seed * 3.3, dv / 30) + 0.05 * g3(du / 14 + P.seed, dv / 12);
          const fp = (1 - nd + wob) * P.ay;       // ≈ surface px inside (+) / outside (−) the raft's edge
          if (fp < -60) continue;
          // the melt round a raft is a little cooler; right at the edge it climbs the crust and catches the light
          const halo = sstep(-50, 0, fp);
          r *= 1 - 0.1 * halo; g *= 1 - 0.34 * halo; b *= 1 - 0.3 * halo;
          const lit = 0.3 + 0.7 * sstep(0.5, -0.7, dv / P.ay + (0.5 * du) / P.ax);
          const men = Math.exp(-((fp + 3) * (fp + 3)) / 5) * 0.52 * lit * (0.25 + 0.75 * sstep(-0.3, 0.35, g2(du / 38 + P.seed * 2.2, dv / 30 + 6.6)));
          r += (255 - r) * men; g += (176 - g) * men; b += (96 - b) * men;
          h += 1.8 * sstep(-10, 0, fp);
          if (fp > 0) {
            // a matt crust: dark red, mottled, thinner (so warmer) toward its edge
            const mot = g2(du / 34 + P.seed * 9.1, dv / 26 + P.seed * 4.3) + 0.5 * g3(du / 11, dv / 9);
            const tone = 0.86 + 0.2 * mot;
            const thin = 1 - sstep(0, 24, fp);
            let sr = 96 * tone, sg = 15 * tone, sb = 10 * tone;
            sr += (186 - sr) * 0.7 * thin; sg += (27 - sg) * 0.7 * thin; sb += (16 - sb) * 0.7 * thin;
            const inn = sstep(0, 2.5, fp);
            r += (sr - r) * inn; g += (sg - g) * inn; b += (sb - b) * inn;
            h = h * (1 - inn) + inn * (2.2 + 1.6 * sstep(0, 7, fp) + 0.5 * mot);
            wt *= 1 - inn;
          }
        }
      }
      // falloff toward the sides (the crest is where the light is)
      const sv = 1 - 0.17 * sstep(560, 1120, ddx < 0 ? -ddx : ddx); r *= sv; g *= sv * sv; b *= sv;
      // the limb: brightest line of the picture, hotter in some stretches than in others
      const lp = Ll[ib] + (Ll[ib + 1] - Ll[ib]) * ff;
      const rim2 = Math.exp(-d / 12) * (0.5 + 0.16 * lp), rim1 = Math.exp(-d / (Kl[ib] + (Kl[ib + 1] - Kl[ib]) * ff)) * lp;
      r += (255 - r) * rim2; g += (118 - g) * rim2; b += (30 - b) * rim2;
      r += (255 - r) * rim1; g += (224 - g) * rim1; b += (172 - b) * rim1;
      Hh[k] = h; Cr[k] = r; Cg[k] = g; Cb[k] = b; Wa[k] = wa; Wt[k] = wt; Gp[k] = grp;
    }
  }

  // 3) relief + glints → pixels (one light, upper left)
  const img = new ImageData(RW, RH), o = img.data;
  const sImg = [new ImageData(RW, RH), new ImageData(RW, RH), new ImageData(RW, RH)];
  const GXa = 0.006, GYa = 0.014, GWa = 0.002;           // slope the skin must have to mirror the light, and the lobe's width
  const GX = 0.011, GY = 0.02, GW = 0.00006;              // the same for the clear melt (much calmer)
  for (let j = 0; j < RH; j++) {
    const jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, al = Al[k];
      if (al <= 0) continue;
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      let r = Cr[k], g = Cg[k], b = Cb[k], sp = 0;
      const wa = Wa[k], wt = Wt[k];
      if (wa > 0) {
        let rel = (hx * 0.5 + hy * 0.86) * 1.7; rel = rel < -0.14 ? -0.14 : rel > 0.2 ? 0.2 : rel;
        const up = rel > 0 ? rel : 0;
        r = r * (1 + rel * 0.8) + up * 14; g = g * (1 + rel * 1.3) + up * 40; b = b * (1 + rel) + up * 12;
        const e1 = hx - GXa, e2 = hy - GYa, s = Math.exp(-(e1 * e1 + e2 * e2) / GWa) * Tp[k];
        const thr = 0.8 - 0.46 * wa;
        sp = sstep(thr, thr + 0.16, s) * (wa > 0.5 ? 1 : wa * 2) * Gb[k];
        const sh = sstep(thr - 0.36, thr + 0.12, s) * 0.3 * wa;  // the hot sheen each glint sits in
        r += (255 - r) * sh; g += (124 - g) * sh; b += (44 - b) * sh;
      } else if (wt > 0 || Hh[k] !== 0) {
        let rel = (hx * 0.5 + hy * 0.86) * 1.4; rel = rel < -0.4 ? -0.4 : rel > 0.5 ? 0.5 : rel;
        const up = rel > 0 ? rel : 0;
        r = r * (1 + rel) + up * 24; g = g * (1 + rel * 1.15) + up * 56; b = b * (1 + rel) + up * 16;
        if (wt > 0) {
          const e1 = hx - GX, e2 = hy - GY, s = Math.exp(-(e1 * e1 + e2 * e2) / GW) * wt * 0.2;
          r += (255 - r) * s; g += (188 - g) * s; b += (112 - b) * s;
        }
      }
      const q = k * 4;
      if (sp > 0.02) {
        const s = sp > 1 ? 1 : sp, bk = s * 0.7;
        r += (255 - r) * bk; g += (208 - g) * bk; b += (146 - b) * bk;
        const sd = sImg[Gp[k]].data;
        sd[q] = 255; sd[q + 1] = 226; sd[q + 2] = 176; sd[q + 3] = s * 255 * al;
      }
      o[q] = r; o[q + 1] = g; o[q + 2] = b; o[q + 3] = al * 255;
    }
  }
  const toCanvas = (im) => { const c = L.makeCanvas(im.width, im.height); c.getContext('2d').putImageData(im, 0, 0); return c; };
  const surf = toCanvas(img), spec = sImg.map((im) => L.blurred(toCanvas(im), 0.6));

  // the still bubbles go into the picture before the lens does
  const sg = surf.getContext('2d');
  sg.save(); sg.translate(-X0, -Y0);
  for (const q of BUBBLES) if (!q.grow) paintBubble(sg, q.x, q.y, q.r, squash(-a.drAt(q.x, q.y)), 0.9);
  sg.restore();

  // 4) depth of field: sharp on the skin under the crest, melting toward the sides and the foreground
  const mw = Math.ceil(RW / 4), mh = Math.ceil(RH / 4);
  const mk = [new ImageData(mw, mh), new ImageData(mw, mh)];
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const x = X0 + i * 4 + 2, y = Y0 + j * 4 + 2, d = R - Math.hypot(x - cx, cy - y);
    const sx = sstep(400, 1010, Math.abs(x - 920)), sy = sstep(230, 560, d);
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
  // only the glints that are in focus flicker
  for (const c of spec) { const g = c.getContext('2d'); g.globalCompositeOperation = 'destination-out'; g.drawImage(mask[0], 0, 0, RW, RH); g.globalCompositeOperation = 'source-over'; }

  // bloom: only the hot parts, blurred wide, kept at quarter size
  const BM = 160, bw = Math.round(RW / 4), bh = Math.round((RH + BM) / 4);
  const bloom = L.makeCanvas(bw, bh), bg = bloom.getContext('2d');
  bg.filter = 'brightness(0.62) contrast(2.8) blur(8px)';
  bg.drawImage(surf, 0, BM / 4, bw, RH / 4);
  bg.filter = 'none';
  return { surf, spec, bloom, X0, Y0, RW, RH, BM };
}

export default {
  name: '铜水',
  tone: 'light',
  init(env) {
    const a = env.arc;
    S = buildSurface(env);
    // the swelling bubble: one small sprite per frame, already a little out of focus
    const q = BUBBLES.find((b) => b.grow), fz = squash(-a.drAt(q.x, q.y)), M = Math.ceil(q.r * 1.9);
    S.grow = { x: q.x, y: q.y, M, frames: [] };
    for (let f = 0; f < env.frames; f++) {
      const e = L.ease.inOutQuad(env.frames > 1 ? f / (env.frames - 1) : 1);
      const c = L.makeCanvas(M * 2, M * 2), g = c.getContext('2d');
      paintBubble(g, M, M + 3 * (1 - e), q.r * L.lerp(0.8, 1, e), fz, L.lerp(0.3, 1, e));
      S.grow.frames.push(L.blurred(c, 2.2));
    }
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
      // glints in focus: three groups, each with its own brightness this frame
      const sx = 300, sw = 1500, sh = 340;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.1 + 0.9 * (((rehash(fi * 7 + i * 13 + 1, 0x7f4a7c15) >>> 8) & 255) / 255);
        ctx.drawImage(S.spec[i], sx, 0, sw, sh, S.X0 + sx, S.Y0, sw, sh);
      }
      ctx.globalAlpha = 1;
      const G = S.grow;
      ctx.drawImage(G.frames[fi], G.x - G.M, G.y - G.M);
      // heat bloom
      ctx.save(); a.clipBelow(ctx, 0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.12 + 0.26 * breath;
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
