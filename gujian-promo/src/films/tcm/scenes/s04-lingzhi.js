// s04 — 灵芝. Macro, straight down onto the cap of a red reishi (赤芝): the arc is the cap's outer rim.
// Below the arc: lacquered red-brown surface — concentric growth rings (环沟 / 环棱) crossed by fine radial wrinkles,
// a pale apricot growing margin hugging the arc, and a slanting knife cut in the lower right that shows the pale,
// finely layered context (菌肉) under the thin dark crust. Above the arc: clean moon-white paper with a soft contact shadow.
//
// The cap is shaded per pixel in init(): a height field in polar coordinates (u = along the rim, d = depth inside the rim)
// → normals → matte body colour + a strip-light reflection that only catches the shoulders of the ring ridges.
// Two reflection layers (strip light at two positions) are cross-faded in draw(), so the narrow highlights slide along the rings.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── the radial profile of the cap: a rounded pale lip, then irregular concentric ridges separated by furrows ──
const LIP = 46;                              // radial width of the pale growing margin (px)
const RSTEP = 0.5, RMIN = -10, RMAX = 1100;
function buildRings() {
  const n = Math.round((RMAX - RMIN) / RSTEP) + 1;
  const prof = new Float32Array(n), tone = new Float32Array(n), groove = new Float32Array(n), crest = new Float32Array(n);
  const r = L.rng('s04rings');
  const list = [];
  let d = LIP, k = 0;
  while (d < RMAX + 60) {
    let w = L.lerp(24, 98, sstep(0, 560, d)) * r.range(0.7, 1.4);
    if (k > 1 && r.chance(0.22)) w *= 0.55;
    list.push({ d0: d, w, amp: Math.min(w * 0.14, 6.4) * r.range(0.7, 1.25), pw: r.range(3.2, 5), tilt: r.range(-0.4, 1) * 0.028 * w,
      tone: r.chance(0.16) ? -1.7 : ((k & 1) ? -1 : 1) * r.range(0.3, 1), skew: r.range(0.8, 1.1), nr: w > 50 ? Math.max(2, Math.round(w / 24)) : 0, ph: r.range(0, L.TAU) });
    d += w; k++;
  }
  const DC = 22, A0 = 6.5, ZB = 15;          // lip: crest position, crest height, drop to the underside
  let ri = 0;
  for (let i = 0; i < n; i++) {
    const dd = RMIN + i * RSTEP;
    if (dd < LIP) {
      let z;
      if (dd <= 0) z = -ZB + dd * 2.5;
      else if (dd <= DC) { const x = 1 - dd / DC; z = -ZB + (A0 + ZB) * Math.sqrt(1 - x * x); }
      else { const x = (dd - DC) / (LIP - DC); z = A0 * (1 - Math.pow(x, 2)); }
      prof[i] = z; tone[i] = 0; groove[i] = Math.exp(-(LIP - dd) / 3.5); crest[i] = 0;
    } else {
      while (dd >= list[ri].d0 + list[ri].w) ri++;
      const q = list[ri], ph = (dd - q.d0) / q.w, x = Math.abs(2 * Math.pow(ph, q.skew) - 1);
      // a broad, nearly flat band that dips sharply into the furrow on either side; slightly shingled; faint secondary lines
      let z = q.amp * (1 - Math.pow(x, q.pw)) + q.tilt * (ph - 0.5) * 2 * (1 - Math.pow(x, 6));
      if (q.nr) z += q.w * 0.011 * Math.sin(L.TAU * q.nr * ph + q.ph) * Math.sin(Math.PI * ph);
      prof[i] = z; tone[i] = q.tone; groove[i] = Math.exp(-Math.min(ph, 1 - ph) * q.w / 3.5); crest[i] = 1 - x * x;
    }
  }
  const box = (src, rad) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let o = -rad; o <= rad; o++) { const q = i + o; if (q >= 0 && q < n) { s += src[q]; c++; } } out[i] = s / c; }
    return out;
  };
  return { prof: box(prof, 3), tone: box(tone, 7), groove, crest, n };
}

function lut3(stops, count, scale) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / scale, c])); const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { const c = f(i / (count - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** the cap: everything below the arc. Returns cropped canvases (frame x from X0, y from Y0). */
function buildCap(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 4;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s04a'), nB = L.makeNoise('s04b'), nC = L.makeNoise('s04c');
  const { prof, tone, groove, crest, n: RN } = buildRings();

  // body colour by depth inside the rim (px): apricot margin → orange → 赤褐 → 深栗
  const AN = 1101;
  const ALB = lut3([[0, '#f9d79a'], [14, '#f3bf6a'], [30, '#e8a24c'], [46, '#da7c30'], [62, '#c8561f'], [84, '#b3411b'], [120, '#a23819'],
    [200, '#8f2d15'], [300, '#732211'], [390, '#571a0d'], [480, '#45160b'], [1100, '#36110a']], AN, 1100);
  // cut face by depth under the skin (height px ×10): dark crust → stained zone → pale wood context
  const FN = 801;
  const FAC = lut3([[0, '#260804'], [1.25, '#431107'], [1.7, '#7e3a18'], [2.7, '#bd8650'], [4.3, '#e8d2aa'], [6.5, '#f1e0be'], [13, '#edd9b5'], [30, '#e8d0a7'], [54, '#e2c69a'], [80, '#dcbd90']], FN, 80);

  // 1) slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const gWob = new Float32Array(cw * ch), gWarp = new Float32Array(cw * ch), gFold = new Float32Array(cw * ch), gMot = new Float32Array(cw * ch), gDust = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const u = Math.atan2(ddx, ddy) * R, d = R - rr, k = j * cw + i;
    gWob[k] = 10 * nA.fbm(u / 480, d / 340, 2) + 1.8 * nA.n2(u / 160 + 7, d / 220) + 8 * nB.n2(u / 230 - 60, 2.5) * sstep(6, 34, d) * (1 - sstep(70, 130, d));
    gWarp[k] = nB.fbm(u / 170 + 3, d / 130, 2);
    gFold[k] = nB.fbm(u / 120 - 20, d / 460 + 5, 2);
    gMot[k] = nC.fbm(u / 240, d / 170, 3);
    gDust[k] = nC.fbm(u / 380 + 40, d / 300 - 9, 2);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 2) height field (px) at full resolution
  const Hh = new Float32Array(N), Pp = new Float32Array(N), Dd = new Float32Array(N), Dp = new Float32Array(N), Wr = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      Dd[k] = d;
      if (d < RMIN + 1) { Hh[k] = -15 + d * 2.5; Dp[k] = d; continue; }
      const u = Math.atan2(ddx, ddy) * R;
      const dp = d + bil(gWob, i, j) * sstep(6, 80, d);
      Dp[k] = dp;
      let f = (dp - RMIN) / RSTEP; if (f < 0) f = 0; else if (f > RN - 2) f = RN - 2;
      const f0 = f | 0, P = prof[f0] + (prof[f0 + 1] - prof[f0]) * (f - f0);
      Pp[k] = P;
      if (d < 0) { Hh[k] = P; continue; }
      const warp = bil(gWarp, i, j);
      const wr = nA.fbm(u / 15 + 0.55 * warp, d / 520, 3, 2.1, 0.5);         // fine radial wrinkles
      let cr = 1 - Math.abs(nB.n2(u / 34 + 0.5 * warp, d / 300 + 11)); cr *= cr * cr;   // sparser, sharper creases
      const deepK = sstep(240, 560, d), wAmp = (0.35 + 0.65 * sstep(14, 80, d)) * (1 - 0.55 * deepK);
      Wr[k] = wr;
      Hh[k] = P + wAmp * (0.85 * wr + 0.9 * (cr - 0.3)) + 2.2 * bil(gFold, i, j) * sstep(20, 120, d) + 0.13 * (1 - 0.7 * deepK) * nC.n2(u / 3.1, d / 3.1);
    }
  }

  // 3) the knife cut: a shallow planar slice whose edge is a big circle arc bulging to the upper left.
  //    cdist > 0 inside the cut; the plane sinks TB px per px, so ridges are cut earlier than furrows → a scalloped edge.
  const Ax = 930, Ay = H, Bx = W, By = a.yAt(W) + 96, chord = Math.hypot(Bx - Ax, By - Ay), sag = 44;
  const Rc = (chord * chord / 4 + sag * sag) / (2 * sag);
  const ux = (Bx - Ax) / chord, uy = (By - Ay) / chord;
  const ccx = (Ax + Bx) / 2 - uy * (Rc - sag), ccy = (Ay + By) / 2 + ux * (Rc - sag);
  const TB = 0.45, SC = 0.5;

  // 4) shade
  const LXr = -0.38, LYr = -0.6, LZr = 0.7, LN = Math.hypot(LXr, LYr, LZr), LX = LXr / LN, LY = LYr / LN, LZ = LZr / LN;
  const AMB = 0.4;
  const PYS = -0.4, WYS = 0.1, SXS = 0.2, PXA = -0.15, PXB = -0.03;         // strip light: slope it reflects at, widths, two x positions
  const capI = new ImageData(RW, RH), spA = new ImageData(RW, RH), spB = new ImageData(RW, RH);
  const cd = capI.data, ad = spA.data, bd = spB.data;
  for (let i = 3; i < ad.length; i += 4) { ad[i] = 255; bd[i] = 255; }
  for (let j = 1; j < RH - 1; j++) {
    const Y = Y0 + j;
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, d = Dd[k];
      if (d < -1) continue;
      const X = X0 + i;
      const sx = -(Hh[k + 1] - Hh[k - 1]) * 0.5, sy = -(Hh[k + RW] - Hh[k - RW]) * 0.5;      // the way the normal leans
      const inv = 1 / Math.sqrt(sx * sx + sy * sy + 1);
      let nl = (sx * LX + sy * LY + LZ) * inv; if (nl < 0) nl = 0;
      let sh = AMB + (0.94 - AMB) * nl / LZ; if (sh > 1.3) sh = 1.3;
      const dp = Dp[k];
      let f = (dp - RMIN) / RSTEP; f = f < 0 ? 0 : f > RN - 1 ? RN - 1 : f; const ri = f | 0;
      const tk = tone[ri], gr = groove[ri], crs = crest[ri];
      const mot = bil(gMot, i, j), lac = sstep(LIP - 10, LIP + 34, dp);     // 0 on the matte margin → 1 on the lacquered zones
      // the colour zones follow the rings loosely, not slavishly
      let ai = dp + 13 * mot * sstep(10, 40, dp); ai = ai < 0 ? 0 : ai > AN - 2 ? AN - 2 : ai;
      const a0 = ai | 0, at = ai - a0, q = a0 * 3;
      let r = ALB[q] + (ALB[q + 3] - ALB[q]) * at, g = ALB[q + 1] + (ALB[q + 4] - ALB[q + 1]) * at, b = ALB[q + 2] + (ALB[q + 5] - ALB[q + 2]) * at;
      r *= 1 + (0.12 * tk + 0.07 * mot) * lac; g *= 1 + (0.2 * tk + 0.15 * mot) * lac; b *= 1 + (0.16 * tk + 0.1 * mot) * lac;
      const gk = gr * (0.12 + 0.88 * lac); r *= 1 - 0.45 * gk; g *= 1 - 0.6 * gk; b *= 1 - 0.6 * gk;
      r += 12 * crs * lac; g += 5 * crs * lac;
      const st = Wr[k]; r *= 1 + 0.05 * st; g *= 1 + 0.08 * st; b *= 1 + 0.08 * st;
      const lim = 1 - sstep(0, 8, d);                                        // the rim turns edge-on: deeper, warmer
      r *= 1 - 0.12 * lim; g *= 1 - 0.3 * lim; b *= 1 - 0.46 * lim;
      const fall = 1.05 - 0.00009 * (X - 200) - 0.00012 * (Y - a.crestY);   // key light sits upper left
      sh *= fall;
      const gs = 0.6 + 0.2 * lac;                                            // shadows stay red (orange on the yellow margin, never olive)
      r *= sh; g *= sh * (gs + (1 - gs) * sh); b *= sh * (0.6 + 0.4 * sh);
      // gloss: dusty patches and the young margin are duller
      const SM = (0.5 + 0.5 * sstep(-0.3, 0.15, bil(gDust, i, j))) * (0.35 + 0.65 * sstep(10, 76, d));
      const e1 = sy + 0.14, e2 = sx + 0.06, sheen = Math.exp(-(e1 * e1 / 0.03 + e2 * e2 / 0.14)) * 0.17 * SM * (1 - 0.75 * sstep(280, 520, d));
      r += 255 * sheen; g += 196 * sheen; b += 146 * sheen;
      const ey = (sy - PYS) / WYS, ey2 = ey * ey, ly = Math.exp(-ey2 * ey2) * 1.5;
      const eh = (sy - PYS) / 0.24, lh = Math.exp(-eh * eh) * 0.17;
      const xa = (sx - PXA) / SXS, xb = (sx - PXB) / SXS, la = Math.exp(-xa * xa), lb = Math.exp(-xb * xb);
      let cA = ly * la * SM, hA = lh * Math.exp(-xa * xa * 0.25) * SM, cB = ly * lb * SM, hB = lh * Math.exp(-xb * xb * 0.25) * SM;

      // the cut face
      const qx = X - ccx, qy = Y - ccy, cdist = Rc - Math.sqrt(qx * qx + qy * qy);
      if (cdist > -40) {
        const tt = cdist * TB + SC * Pp[k];
        if (tt > 0) {
          const sc = Math.atan2(qx, -qy) * Rc, e = tt / TB;                  // e: px in from the cut edge
          const lay = cdist * TB + SC * Pp[k] * Math.exp(-tt / 12) + 1.6 * nB.fbm(sc / 320, cdist / 260, 2);
          const v1 = nA.n2(lay / 1.5 + 50, sc / 900), v2 = nB.n2(lay / 6 - 20, sc / 1600 + 3), v3 = nC.n2(sc / 30, lay / 0.5 + 7);
          let hl = 1 - Math.abs(nC.n2(lay / 2.1 + 9, sc / 1200 - 4)); hl *= hl; hl *= hl; hl *= hl;     // hairline partings between layers
          let ti = tt * 10; if (ti > FN - 2) ti = FN - 2; const t0 = ti | 0, tf = ti - t0, fq = t0 * 3;
          let fr = FAC[fq] + (FAC[fq + 3] - FAC[fq]) * tf, fg = FAC[fq + 1] + (FAC[fq + 4] - FAC[fq + 1]) * tf, fb = FAC[fq + 2] + (FAC[fq + 5] - FAC[fq + 2]) * tf;
          const deep = sstep(3.5, 7, tt);
          const dk = (sstep(0.05, 0.7, v1) * 0.1 + sstep(0.1, 0.8, v2) * 0.08 + hl * 0.2) * deep;      // growth layers
          fr *= 1 - dk * 0.5; fg *= 1 - dk * 0.78; fb *= 1 - dk;
          // matte, corky: soft mottling + pin-prick pores; the skin's lip throws a soft shadow onto the face
          const cork = 1 + (0.035 * v3 + 0.03 * nB.fbm(X / 70, Y / 70, 2) + 0.022 * nC.n2(X / 2.3, Y / 2.3)) * deep;
          const shd = 1 - sstep(4, 30 + 6 * v2, e);
          const fs = cork * (1 - 0.05 * sstep(0, 170, cdist));
          fr *= fs * (1 - 0.34 * shd); fg *= fs * (1 - 0.48 * shd); fb *= fs * (1 - 0.58 * shd);
          const m = tt < TB ? tt / TB : 1;
          r += (fr - r) * m; g += (fg - g) * m; b += (fb - b) * m;
          cA *= 1 - m; hA *= 1 - m; cB *= 1 - m; hB *= 1 - m;
        }
      }
      const o = k * 4;
      cd[o] = r; cd[o + 1] = g; cd[o + 2] = b; cd[o + 3] = d >= 0.5 ? 255 : (d + 0.5) * 255;
      ad[o] = 255 * (cA + hA); ad[o + 1] = 246 * cA + 150 * hA; ad[o + 2] = 226 * cA + 70 * hA;
      bd[o] = 255 * (cB + hB); bd[o + 1] = 246 * cB + 150 * hB; bd[o + 2] = 226 * cB + 70 * hB;
    }
  }
  const toCanvas = (img) => { const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(img, 0, 0); return c; };
  const cap = toCanvas(capI);
  // a little bloom on the reflections
  const bloom = (c) => { const g = c.getContext('2d'), b = L.blurred(c, 6); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.7; g.drawImage(b, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; return c; };
  return { cap, specA: bloom(toCanvas(spA)), specB: bloom(toCanvas(spB)), X0, Y0 };
}

/** moon-white paper with the faintest grain, and the soft shadow the cap drops around its rim */
function buildBack(env) {
  const a = env.arc, R = a.R;
  return L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.fillStyle = '#e9eef0'; full();
    g.fillStyle = L.radial(g, 560, 140, 80, 1500, [[0, 'rgba(250,253,254,0.75)'], [1, 'rgba(250,253,254,0)']]); full();
    g.fillStyle = L.linear(g, 0, 0, W, H * 0.8, [[0, 'rgba(206,220,228,0)'], [1, 'rgba(206,220,228,0.2)']]); full();
    // paper: the faintest cloudiness + fine tooth
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3;
    g.drawImage(L.noiseLayer(PAD, { seed: 's04paper', scale: 520, octaves: 3, res: 0.15, ramp: [[0, '#e3eaee'], [0.55, '#ffffff'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalAlpha = 0.55;
    g.drawImage(L.noiseLayer(PAD, { seed: 's04tooth', scale: 4, octaves: 2, res: 0.5, contrast: 1.5, ramp: [[0, '#e9eef0'], [0.6, '#ffffff'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // contact shadow hugging the rim: cool penumbra, a touch of warm bounce right at the edge, denser on the side away from the light
    g.fillStyle = L.radial(g, a.cx, a.cy, R - 6, R + 74, [[0, 'rgba(66,84,110,0.5)'], [0.1, 'rgba(70,88,114,0.36)'], [0.24, 'rgba(84,102,128,0.17)'], [0.5, 'rgba(100,118,142,0.055)'], [1, 'rgba(110,128,150,0)']]); full();
    g.fillStyle = L.radial(g, a.cx + 36, a.cy + 6, R - 6, R + 40, [[0, 'rgba(58,74,100,0.34)'], [0.35, 'rgba(58,74,100,0.16)'], [1, 'rgba(58,74,100,0)']]); full();
    g.fillStyle = L.radial(g, a.cx, a.cy, R - 4, R + 26, [[0, 'rgba(232,132,58,0.24)'], [0.4, 'rgba(232,132,58,0.07)'], [1, 'rgba(232,132,58,0)']]); full();
  });
}

export default {
  name: '灵芝',
  tone: 'dark',
  init(env) {
    S = { back: buildBack(env), ...buildCap(env) };
  },
  draw(ctx, env, p) {
    // a slight push-in (centred on zoom = 1 so the rim stays on the arc), a breath of drift along the rim
    const zoom = L.lerp(0.99, 1.016, p), rot = L.lerp(-0.003, 0.003, p);
    L.blit(ctx, env, S.back, { rot, zoom });
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.cap, S.X0, S.Y0);
      // the strip light slides: its narrow reflections wander along the ring ridges
      const e = L.smooth(p);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 1 - e; ctx.drawImage(S.specA, S.X0, S.Y0);
      ctx.globalAlpha = e; ctx.drawImage(S.specB, S.X0, S.Y0);
    });
  },
};
