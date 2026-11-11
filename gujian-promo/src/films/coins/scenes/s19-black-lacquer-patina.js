// s19 — 黑漆古. The upper edge of one cash coin whose patina has gone glossy black ("black-lacquer" patina),
// seen like a planet at night: the arc is the coin's outer edge, drawn by an iridescent rim light
// (orange-red → warm white → violet → cobalt, outside → inside). Below it the black, blue-grey face:
// the slightly raised outer rim (外郭), the field with cloud-soft sheen, hairline scratches, a breath of
// blue-green rust, and — at the very bottom — one corner of the inner rim and the square hole falling into shadow.
// No inscription. Above the arc: pure black.
//
// Everything is shaded per pixel in init() (height field → relief light → blue-grey ramp), the rim light is a
// colour profile looked up by radial distance, so its outer edge sits exactly on env.arc.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 150;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash2 = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ───────────── rim-light colour profile: t = px inward from the arc (at the widest point) ─────────────
const T0 = -52, T1 = 264, TSTEP = 0.25, TN = Math.round((T1 - T0) / TSTEP) + 1;
const HEAD = [[-52, '#000000'], [-34, '#000000'], [-20, '#0c0201'], [-9, '#2c0803'], [-2, '#6e1608'], [2, '#cf3a16'], [5, '#f25220'], [9, '#ff6426'], [16, '#ff6a2a'], [26, '#ff7030'], [33, '#ff8444']];
const HEAD_GLOW = [[-52, '#000000'], [-40, '#050100'], [-26, '#1a0502'], [-14, '#4a1006'], [-5, '#8c220a'], [2, '#cf3a16'], [5, '#f25220'], [9, '#ff6426'], [16, '#ff6a2a'], [26, '#ff7030'], [33, '#ff8444']];
const CORE_HOT = [[39, '#ffb07c'], [45, '#ffdcbc'], [51, '#fff3e4'], [57, '#fbe3ea'], [63, '#e2b6f0']];
const CORE_SIDE = [[39, '#ff966a'], [45, '#ffb090'], [51, '#fbaab4'], [57, '#e99ad6'], [63, '#cc88e8']];
const TAIL = [[71, '#b27aea'], [81, '#8a4fe0'], [93, '#6a54ea'], [104, '#3f66fa'], [114, '#2f6bff'], [126, '#2759e4'], [138, '#1c44b8'], [152, '#112c80'], [168, '#09184a'], [186, '#030a22'], [208, '#000000'], [264, '#000000']];

function profile(stops, soft = 2.5) {
  let cur = new Float32Array(TN * 3), k = 0;
  const cols = stops.map((s) => L.parseColor(s[1]));
  for (let i = 0; i < TN; i++) {
    const t = T0 + i * TSTEP;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const u = L.clamp((t - stops[k][0]) / (stops[k + 1][0] - stops[k][0]));
    for (let c = 0; c < 3; c++) cur[i * 3 + c] = cols[k][c] + (cols[k + 1][c] - cols[k][c]) * u;
  }
  const rad = Math.round(soft / TSTEP);
  for (let pass = 0; pass < 2; pass++) {       // two box blurs → no visible kinks between the stops
    const out = new Float32Array(TN * 3);
    for (let c = 0; c < 3; c++) for (let i = 0; i < TN; i++) {
      let acc = 0;
      for (let q = -rad; q <= rad; q++) { const ii = i + q < 0 ? 0 : i + q >= TN ? TN - 1 : i + q; acc += cur[ii * 3 + c]; }
      out[i * 3 + c] = acc / (rad * 2 + 1);
    }
    cur = out;
  }
  return cur;
}

/**
 * The rim light as an additive layer (black = nothing). o: { res, sigma (rad; width of the bright zone along the arc),
 * sMin/sMax (band width scale at the sides / at the peak), bMin/bMax (brightness), lutA (sides), lutB (peak), streak }
 */
function buildRim(env, o) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, res = o.res;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 72;
  const Y1 = Math.min(H + PAD, Math.ceil(a.yAt(-PAD)) + 210);
  const RW = Math.ceil((W + PAD * 2) * res), RH = Math.ceil((Y1 - Y0) * res);
  const img = new ImageData(RW, RH), d = img.data;
  const nz = L.makeNoise('s19rim');
  const DMAX = -T0 * o.sMax * 1.1, DMIN = -T1 * o.sMax * 1.1;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + (j + 0.5) / res);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + (i + 0.5) / res - cx, dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      if (dr > DMAX || dr < DMIN) continue;
      const th = Math.atan2(ddx, ddy), q = th / o.sigma, b = Math.exp(-q * q);
      let s = o.sMin + (o.sMax - o.sMin) * b, br = o.bMin + (o.bMax - o.bMin) * b;
      if (o.streak) { s *= 1 + 0.05 * nz.n2(th * 6.5, 1.7); br *= 1 + 0.05 * nz.n2(th * 10 + 40, 5.3); }
      const f = (-dr / s - T0) / TSTEP;
      if (f <= 0 || f >= TN - 1) continue;
      const i0 = f | 0, u = f - i0, p0 = i0 * 3, k = (j * RW + i) * 4, m = Math.pow(b, 0.8);
      const dn = hash2(i, j) - 0.5;
      for (let c = 0; c < 3; c++) {
        const va = o.lutA[p0 + c] + (o.lutA[p0 + 3 + c] - o.lutA[p0 + c]) * u, vb = o.lutB[p0 + c] + (o.lutB[p0 + 3 + c] - o.lutB[p0 + c]) * u;
        const v = (va + (vb - va) * m) * br;
        d[k + c] = v > 0.7 ? v + dn : v;       // dither only where there is light: the black above stays exactly black
      }
      d[k + 3] = 255;
    }
  }
  const c = L.makeCanvas(RW, RH);
  c.getContext('2d').putImageData(img, 0, 0);
  return { c, x: X0, y: Y0, w: RW / res, h: RH / res };
}

/** the coin's face: everything below the arc */
function buildFace(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 4;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s19a'), nB = L.makeNoise('s19b');
  const DEPTH = H - a.crestY;                       // how far below the crest the frame reaches
  const V1 = 0.43 * DEPTH, V2 = V1 + 28;            // inner bevel of the raised outer rim (外郭)
  const DC = R - 0.77 * DEPTH, THA = 0.2, LW = 58; // square hole: distance of its nearest corner from the coin's centre, its bearing; width of the inner rim (内郭)
  const U0 = -0.09 * R, SU = 0.42 * R, VS0 = 0.76 * DEPTH, SV = 0.5 * DEPTH; // soft-box reflection on the lacquer-black surface
  const AR = 1.0, AL = 0.5, AU = 0.55, AG1 = 0.011, AG2 = 0.0035, KREL = 28;

  // 1) slow fields on a coarse grid (clouds, mottling, undulation, rust, hue drift)
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const fC1 = new Float32Array(CN), fC2 = new Float32Array(CN), fHl = new Float32Array(CN), fPt = new Float32Array(CN), fHu = new Float32Array(CN);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS);
    const U = Math.atan2(ddx, ddy) * R, V = R - Math.hypot(ddx, ddy), k = j * cw + i;
    const wx = nB.fbm(U / 880 + 3.1, V / 640 - 8.2, 2), wy = nB.fbm(U / 880 - 14.7, V / 640 + 5.5, 2);
    fC1[k] = nA.fbm(U / 600 + 0.9 * wx, V / 340 + 0.9 * wy, 3, 2, 0.45);
    fC2[k] = nA.fbm(U / 150 + 40 + 0.5 * wx, V / 110 - 13 + 0.5 * wy, 3, 2, 0.45);
    fHl[k] = nB.fbm(U / 300 - 7, V / 300 + 3, 3);
    fPt[k] = nB.fbm(U / 190 + 21, V / 190 + 77, 4, 2, 0.55);
    fHu[k] = nA.fbm(U / 520 - 30, V / 520 + 60, 2);
  }
  const fGx = new Float32Array(CN), fGy = new Float32Array(CN);   // slope of the slow undulation, per screen px
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const k = j * cw + i, il = i > 0 ? 1 : 0, ir = i < cw - 1 ? 1 : 0, ju = j > 0 ? cw : 0, jd = j < ch - 1 ? cw : 0;
    fGx[k] = AU * (fHl[k + ir] - fHl[k - il]) / ((il + ir) * CS); fGy[k] = AU * (fHl[k + jd] - fHl[k - ju]) / (((ju + jd) / cw) * CS);
  }
  const bil = (src, i, j) => {
    const fx = (i + 0.5) / CS, fy = (j + 0.5) / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 2) height field at full resolution
  const Hh = new Float32Array(N), Ua = new Float32Array(N), Va = new Float32Array(N), Sd = new Float32Array(N), G1 = new Float32Array(N), G2 = new Float32Array(N), Pm = new Float32Array(N), Cv = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), V = R - rr;
      Va[k] = V;
      if (V < -9) continue;
      const th = Math.atan2(ddx, ddy), U = th * R;
      Ua[k] = U;
      // outer rim: a plateau with a worn, rounded outer edge and a bevel down to the field
      const plat = 1 - sstep(V1, V2, V);
      let h = AR * plat * (0.55 + 0.45 * sstep(0, 18, V));
      // inner rim round the square hole (only one corner reaches the frame)
      const psi = th - THA, sd = (rr * Math.cos(psi) + Math.sqrt(rr * rr * Math.sin(psi) * Math.sin(psi) + 120) - DC) * 0.70711;
      Sd[k] = sd;
      if (sd < LW + 12) h += AL * sstep(-3, 8, sd) * (1 - sstep(LW - 16, LW + 8, sd));
      const g1 = nA.n2(U / 21, V / 21), g2 = nB.n2(U / 4.1 + 50, V / 4.1);   // faint orange-peel of the casting + micro-grain
      // thin blue-green rust: a few patches, gathering where rim meets field
      const pt = bil(fPt, i, j) + 0.14 * Math.exp(-Math.abs(V - V2 - 14) / 30) + 0.1 * nA.n2(U / 30 + 9, V / 30 - 4) + 0.07 * g2;
      const pm = sstep(0.47, 0.63, pt) * sstep(V1 - 40, V1 + 14, V);
      Pm[k] = pm; G1[k] = g1;
      Hh[k] = h + AG1 * g1 + AG2 * g2 + pm * 0.012 * g2;
      G2[k] = g2;
    }
  }

  // 3) casting pores and tiny knocks
  const r = L.rng('s19pits'), span = a.span(PAD + 20);
  for (let n = 0; n < 150; n++) {
    const th0 = r.range(-span, span), v0 = 24 + r() * (DEPTH + PAD - 30);
    const rp = r.chance(0.04) ? r.range(4.5, 6.5) : r.chance(0.15) ? r.range(2.6, 4.2) : r.range(1.0, 2.6), depth = rp * r.range(0.06, 0.16);
    const px = cx + (R - v0) * Math.sin(th0) - X0, py = cy - (R - v0) * Math.cos(th0) - Y0, e = Math.ceil(rp) + 1;
    for (let j = Math.max(1, Math.floor(py - e)); j <= Math.min(RH - 2, Math.ceil(py + e)); j++) {
      for (let i = Math.max(1, Math.floor(px - e)); i <= Math.min(RW - 2, Math.ceil(px + e)); i++) {
        const dx = i + 0.5 - px, dy = j + 0.5 - py, d2 = (dx * dx + dy * dy) / (rp * rp);
        if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2), k = j * RW + i;
        Hh[k] -= depth * f; Cv[k] = Math.max(Cv[k], Math.min(1, f * 1.5));
      }
    }
  }

  // 4) shade. luminance → blue-black ramp (乌黑 #0A0C12 … 钱面灰蓝 #2A3442 … cool highlights)
  const NL = 1024, LMAX = 2.3, ramp = L.makeRamp([[0, '#030407'], [0.12 / LMAX, '#07090d'], [0.25 / LMAX, '#0a0c12'], [0.45 / LMAX, '#131a26'], [0.65 / LMAX, '#1e2837'],
    [0.85 / LMAX, '#2a3442'], [1.05 / LMAX, '#3a485b'], [1.3 / LMAX, '#566a84'], [1.6 / LMAX, '#7f96b4'], [2.0 / LMAX, '#b6cae4'], [1, '#d8e6f6']]);
  const lut = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 1; j < RH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, V = Va[k];
      if (V < -2.5) continue;
      const U = Ua[k], th = U / R, sd = Sd[k];
      const fx = (Hh[k + 1] - Hh[k - 1]) * 0.5, fy = (Hh[k + RW] - Hh[k - RW]) * 0.5, gx = bil(fGx, i, j), gy = bil(fGy, i, j), hx = fx + gx, hy = fy + gy;
      // cool fill light from the lower left of frame: slopes facing it brighten
      let shade = 1 + KREL * (0.5 * hx - 0.8 * hy); shade = shade < 0.4 ? 0.4 : shade > 2.1 ? 2.1 : shade;
      const plat = 1 - sstep(V1, V2, V), lip = sd < LW + 12 ? sstep(-3, 8, sd) * (1 - sstep(LW - 16, LW + 8, sd)) : 0;
      const g1 = G1[k], c1 = bil(fC1, i, j), c2 = bil(fC2, i, j);
      const alb = 0.4 + 0.52 * sstep(-0.5, 0.55, c1) + 0.09 * c2 + 0.025 * g1 + 0.02 * G2[k];
      const eu = (U - U0) / SU, ev = (V - VS0) / SV, E = 0.17 + 0.83 * Math.exp(-eu * eu - ev * ev);
      const ao = (1 - 0.42 * sstep(V1 + 8, V2, V) * Math.exp(-Math.max(0, V - V2) / 22)) * (sd > LW ? 1 - 0.3 * Math.exp(-(sd - LW) / 18) : 1);
      const wearHi = 1 + 0.16 * lip + 0.14 * plat * sstep(V1 - 34, V1, V);       // high points rubbed a little brighter
      let lum = alb * E * (1 - 0.5 * plat) * ao * wearHi * shade;
      const e1 = fx - 0.012, e2 = fy + 0.02, s1 = gx - 0.003, s2 = gy + 0.005;
      lum += Math.exp(-(e1 * e1 + e2 * e2) / 3.2e-5) * E * 1.1 * (1 - Pm[k]);                   // pin-point glints on pore walls that face the light
      lum += Math.exp(-(s1 * s1 + s2 * s2) / 3e-5) * E * 0.2 * (1 - 0.6 * Pm[k]);            // the gentle swell of the surface gathers a little extra sheen
      const cav = Cv[k]; if (cav > 0) lum *= 1 - 0.7 * cav;
      const lf = Math.min(NL - 1.001, (lum / LMAX) * (NL - 1)), l0 = lf | 0, lu = lf - l0, o = l0 * 3;
      let cr = lut[o] + (lut[o + 3] - lut[o]) * lu, cg = lut[o + 1] + (lut[o + 4] - lut[o + 1]) * lu, cb = lut[o + 2] + (lut[o + 5] - lut[o + 2]) * lu;
      const hu = bil(fHu, i, j);
      cr *= 1 - 0.1 * hu; cg *= 1 + 0.02 * hu; cb *= 1 + 0.12 * hu;
      // thin blue-green rust, matte
      const pm = Pm[k];
      if (pm > 0) {
        const m = 0.62 * pm;     // a tint of the surface it sits on, never brighter than its surroundings by much
        cr += (cr * 0.5 + 2 - cr) * m; cg += (cg * 1.42 + 12 - cg) * m; cb += (cb * 1.2 + 9 - cb) * m;
      }
      // the rim light rakes across the outer rim: micro-relief facing outward picks up cobalt
      const relR = -hx * Math.sin(th) + hy * Math.cos(th);
      const rk = Math.exp(-Math.max(0, V - 60) / 75) * Math.min(0.4, Math.max(0, 0.16 + 9 * relR)) * 0.5;
      cr += 47 * rk; cg += 107 * rk; cb += 255 * rk;
      if (sd < 3) { const hm = sstep(-3.5, 2.5, sd); cr *= hm; cg *= hm; cb *= hm; }   // through the hole: the black backdrop
      const dn = hash2(i, j) - 0.5, q = k * 4;
      d[q] = cr + dn; d[q + 1] = cg + dn; d[q + 2] = cb + dn; d[q + 3] = 255 * sstep(-2.5, 0.5, V);
    }
  }
  const cnv = L.makeCanvas(RW, RH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);

  // 5) hairline scratches: they only light up where the surface itself is lit (colour-dodge)
  g.save();
  g.translate(-X0, -Y0);
  a.clipBelow(g, -4);
  g.globalCompositeOperation = 'color-dodge'; g.lineCap = 'round';
  const rs = L.rng('s19scratch');
  for (let n = 0; n < 300; n++) {
    const x0 = rs.range(-PAD, W + PAD), y0 = rs.range(a.crestY, H + PAD), fam = rs();
    const ang = fam < 0.38 ? -0.5 + rs.gauss() * 0.1 : fam < 0.62 ? 0.95 + rs.gauss() * 0.13 : rs.range(0, Math.PI);
    const len = rs.range(30, 220) * (rs.chance(0.07) ? 2.4 : 1), bend = rs.range(-0.07, 0.07) * len, al = rs.range(0.08, 0.5), lw = rs.range(0.5, 1.0);
    if (a.drAt(x0, y0) > -30) continue;
    const dx = Math.cos(ang) * len * 0.5, dy = Math.sin(ang) * len * 0.5, nx = -Math.sin(ang) * bend, ny = Math.cos(ang) * bend;
    for (const [f, aa] of [[1, 0.45], [0.55, 0.55]]) {      // faint full length + stronger middle → tapered ends
      g.strokeStyle = `rgba(150,168,196,${(al * aa).toFixed(3)})`; g.lineWidth = lw;
      g.beginPath(); g.moveTo(x0 - dx * f, y0 - dy * f); g.quadraticCurveTo(x0 + nx, y0 + ny, x0 + dx * f, y0 + dy * f); g.stroke();
    }
  }
  g.restore();
  return { c: cnv, x: X0, y: Y0 };
}

export default {
  name: '黑漆古',
  tone: 'light',
  init(env) {
    const hot = profile([...HEAD, ...CORE_HOT, ...TAIL]), side = profile([...HEAD, ...CORE_SIDE, ...TAIL]), glow = profile([...HEAD_GLOW, ...CORE_HOT, ...TAIL], 3.5);
    S = {
      face: buildFace(env),
      // the rim light: widest and brightest at its centre, thinning toward both sides
      rim: buildRim(env, { res: 1, sigma: 0.42, sMin: 0.52, sMax: 1, bMin: 0.8, bMax: 1, lutA: side, lutB: hot, streak: true }),
      // its hottest stretch: a wider, bloomed copy that travels along the arc
      hot: buildRim(env, { res: 0.5, sigma: 0.085, sMin: 1.3, sMax: 1.3, bMin: 0, bMax: 0.55, lutA: glow, lutB: glow, streak: false }),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const zoom = L.lerp(0.994, 1.016, p);
    // the coin's face drifts a hair along the arc
    L.cam(ctx, env, { rot: L.lerp(-0.005, 0.005, p), zoom }, () => ctx.drawImage(S.face.c, S.face.x, S.face.y));
    // a soft sheen slides over the lacquer-black surface (dodge: black stays black, lit detail flares)
    L.cam(ctx, env, { zoom }, () => {
      ctx.globalCompositeOperation = 'color-dodge';
      a.at(ctx, L.lerp(-0.2, 0.0, p), -0.62 * (H - a.crestY), () => {
        ctx.scale(3.1, 1);
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, 250, [[0, 'rgba(128,134,146,0.44)'], [0.5, 'rgba(128,134,146,0.2)'], [1, 'rgba(128,134,146,0)']]);
        ctx.fillRect(-250, -250, 500, 500);
      });
    });
    // iridescent rim light: its outer edge is the arc
    L.cam(ctx, env, { rot: L.lerp(-0.02, 0.012, p), zoom }, () => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(S.rim.c, S.rim.x, S.rim.y);
    });
    L.cam(ctx, env, { rot: L.lerp(-0.06, 0.03, p), zoom }, () => {
      ctx.globalCompositeOperation = 'screen';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(S.hot.c, S.hot.x, S.hot.y, S.hot.w, S.hot.h);
    });
  },
};
