// s09 — 翡翠雕叶. A macro photograph of a leaf carved from jadeite, lying on beige silk twill (绫).
// The arc is the leaf's rounded outer margin. Below it: saturated, watery green — thin and glowing at the rim, deep toward
// the heart of the leaf — with a broad carved midrib and a few bold side veins, cloudy / wispy colour, and a drift of
// honey-yellow jadeite (黄翡) that reaches the rim on the right. Above it: the silk, in focus by the rim, dissolving upward.
//
// The stone is shaded per pixel in init(), like a tiny renderer:
//   relief   = pillowy lobes between the veins + U-shaped grooves + a rolled rim + slow polish undulation (a height field)
//   colour   = optical depth τ (thickness from the rim inward × colour concentration) looked up in a green and a yellow ramp
//   light    = one soft-box (upper left) mirrored by every slope that leans toward it, a narrow kicker (upper right),
//              soft form shading that keeps its saturation, and a broad sheen
// then the whole still gets a tilted depth of field (sharp along the rim, soft toward the bottom, the top and the sides).
// draw() only slides the baked picture and lets a window of light travel across the highlights.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 40;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

function quad(P0, C, P1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    out.push([m * m * P0[0] + 2 * m * t * C[0] + t * t * P1[0], m * m * P0[1] + 2 * m * t * C[1] + t * t * P1[1]]);
  }
  return out;
}

/** midrib + side veins, cut by hand: uneven spacing, each with its own bow, reach and stopping point. */
function buildVeins(a) {
  const r = L.rng('s09veins-c');
  const mid = L.smoothPath([[-470, 1226], [130, 1098], [620, 1008], [1130, 946], [1670, 912], [2330, 898]], 8);
  const cum = [0];
  for (let i = 1; i < mid.length; i++) cum.push(cum[i - 1] + Math.hypot(mid[i][0] - mid[i - 1][0], mid[i][1] - mid[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (s) => {
    let i = 1; while (i < mid.length - 1 && cum[i] < s) i++;
    const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), p0 = mid[i - 1], p1 = mid[i];
    const tx = p1[0] - p0[0], ty = p1[1] - p0[1], m = Math.hypot(tx, ty) || 1;
    return { x: L.lerp(p0[0], p1[0], k), y: L.lerp(p0[1], p1[1], k), tx: tx / m, ty: ty / m };
  };
  const wobble = (pts, amp) => {            // the cutting wheel never runs perfectly true
    const ph = r.range(0, 6), f = r.range(0.16, 0.26), n = pts.length;
    return pts.map(([x, y], i) => {
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
      let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      const w = amp * Math.sin(i * f + ph) * Math.sin(Math.PI * Math.min(1, i / (n - 1) * 1.15));
      return [x + nx * w, y + ny * w];
    });
  };
  const veins = [{ pts: mid, w0: 36, w1: 20, depth: 1 }];
  let s = 54;
  while (s < total - 40) {
    // upper side vein: leaves the midrib steeply, sweeps forward (toward the tip, off-frame right), stops short of the rim
    const m = at(s), g = -a.drAt(m.x, m.y);
    const lead = r.range(0.32, 0.46), bow = r.range(0.55, 0.69), run = r.range(0.88, 1.16), stop = r.range(42, 82);
    if (g > 110) {
      const nx = m.ty, ny = -m.tx;
      const C = [m.x + m.tx * lead * g + nx * bow * g, m.y + m.ty * lead * g + ny * bow * g];
      const pol = a.polar(m.x, m.y), e = a.pt(pol.theta + (run * g) / a.R, -(stop + 0.05 * g));
      const pts = wobble(quad([m.x, m.y], C, [e.x, e.y], 36), 2.4);
      const w0 = r.range(20, 25) * L.clamp(g / 300, 0.62, 1);
      veins.push({ pts, w0, w1: 3.5, depth: r.range(0.8, 1) });
    }
    // the far half of the leaf: mostly out of frame and out of focus
    const gap = r.range(214, 322);
    const lo = at(s + gap * r.range(0.4, 0.6)), gl = r.range(300, 360), nlx = -lo.ty, nly = lo.tx;
    veins.push({
      pts: quad([lo.x, lo.y], [lo.x + lo.tx * 0.4 * gl + nlx * 0.62 * gl, lo.y + lo.ty * 0.4 * gl + nly * 0.62 * gl],
        [lo.x + lo.tx * 1.05 * gl + nlx * 0.86 * gl, lo.y + lo.ty * 1.05 * gl + nly * 0.86 * gl], 26),
      w0: r.range(18, 23), w1: 4, depth: 0.85,
    });
    s += gap;
  }
  return veins;
}

/** fill a tapering band along a polyline: width = lerp(w0, w1) * k + add */
function taperPoly(g, pts, w0, w1, k = 1, add = 0) {
  const n = pts.length, A = [], B = [];
  for (let i = 0; i < n; i++) {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
    let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const hw = (L.lerp(w0, w1, Math.pow(i / (n - 1), 0.85)) * k + add) / 2;
    A.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]); B.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
  }
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}

/** separable box blur of radius r on a float field, repeated `passes` times (≈ gaussian) */
function blurF(src, w, h, r, passes = 2) {
  let a = src;
  const inv = 1 / (2 * r + 1), b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
      for (let x = 0; x < w; x++) {
        b[o + x] = s * inv;
        const xo = x - r, xi = x + r + 1;
        s += a[o + (xi >= w ? w - 1 : xi)] - a[o + (xo < 0 ? 0 : xo)];
      }
    }
    const c = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + x];
      for (let y = 0; y < h; y++) {
        c[y * w + x] = s * inv;
        const yo = y - r, yi = y + r + 1;
        s += b[(yi >= h ? h - 1 : yi) * w + x] - b[(yo < 0 ? 0 : yo) * w + x];
      }
    }
    a = c;
  }
  return a;
}

const NL = 1024, TMAX = 1.6;
function lut(stops) {
  const f = L.makeRamp(stops), out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f((i / (NL - 1)) * TMAX); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** the carved jadeite: returns { leaf, spec } — two canvases covering x ∈ [X0, X0+RW), y ∈ [Y0, Y0+RH) (frame coords) */
function buildLeaf(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const veins = buildVeins(a);

  // ── carved grooves (full res): two nested bands, blurred → a rounded U whose depth follows its width ──
  const sharp = L.makeCanvas(RW, RH), sg = sharp.getContext('2d');
  sg.fillStyle = '#000'; sg.fillRect(0, 0, RW, RH);
  sg.translate(-X0, -Y0); sg.fillStyle = '#fff'; sg.globalCompositeOperation = 'lighter';
  for (const v of veins) { sg.globalAlpha = 0.5 * v.depth; taperPoly(sg, v.pts, v.w0, v.w1, 1); taperPoly(sg, v.pts, v.w0, v.w1, 0.5); }
  const gc = L.makeCanvas(RW, RH), gg = gc.getContext('2d', { willReadFrequently: true });
  gg.fillStyle = '#000'; gg.fillRect(0, 0, RW, RH);
  gg.filter = 'blur(3px)'; gg.drawImage(sharp, 0, 0); gg.filter = 'none';
  const Gd = gg.getImageData(0, 0, RW, RH).data;
  let G = new Float32Array(N);
  for (let i = 0; i < N; i++) G[i] = Gd[i * 4] / 255;
  G = blurF(G, RW, RH, 1, 1);                       // irons out the 8-bit steps so the gloss on the groove walls stays clean

  // ── the lobes between the veins (quarter res, float): near blur = the flank by the groove, far blur = the long swell ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const vs = L.makeCanvas(cw, ch), vg = vs.getContext('2d', { willReadFrequently: true });
  vg.fillStyle = '#000'; vg.fillRect(0, 0, cw, ch);
  vg.save(); vg.scale(1 / CS, 1 / CS); vg.translate(-X0 + CS / 2, -Y0 + CS / 2); vg.fillStyle = '#fff';   // pixel centres sit on the coarse nodes
  for (const v of veins) { vg.globalAlpha = 0.5 + 0.5 * v.depth; taperPoly(vg, v.pts, v.w0, v.w1, 2.1, 24 * v.depth); }
  vg.restore();
  const vd = vg.getImageData(0, 0, cw, ch).data;
  const V0 = new Float32Array(CN);
  for (let i = 0; i < CN; i++) V0[i] = vd[i * 4] / 255;
  const Va = blurF(V0, cw, ch, 5, 2), Vb = blurF(V0, cw, ch, 17, 2);
  const Vq = new Float32Array(CN);
  for (let i = 0; i < CN; i++) Vq[i] = 0.5 * Va[i] + 0.5 * Vb[i];

  // ── slow fields on the coarse grid ──
  const nA = L.makeNoise('s09a'), nB = L.makeNoise('s09b');
  const cC = new Float32Array(CN), cY = new Float32Array(CN), cK = new Float32Array(CN), cP = new Float32Array(CN), cT = new Float32Array(CN), Hs = new Float32Array(CN);
  const FC = Math.cos(-0.24), FS = Math.sin(-0.24);     // the "grain" of the stone runs along the leaf
  // the yellow drifts up along the grain and breaks the surface at the rim
  const yel = L.smoothPath([[0.066, -196], [0.105, -128], [0.146, -74], [0.19, -36], [0.236, -16], [0.275, -12]].map(([t, dr]) => { const p = a.pt(t, dr); return [p.x, p.y]; }), 14);
  const ny1 = yel.length - 1;
  const AP = 23;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    const u = x * FC + y * FS, v = -x * FS + y * FC;
    const wx = 0.4 * nA.fbm(x / 700, y / 700, 2), wy = 0.4 * nA.fbm(x / 700 + 31, y / 700 - 17, 2);
    const blotch = nA.fbm(x / 600 + 4, y / 600, 2);                          // big soft clouds of colour
    const drift = nB.fbm(u / 760 + wx + 9, v / 120 + wy, 3);                 // feathery drifts along the grain
    const root = Math.pow(nB.ridged(u / 1000 + wx, v / 150 + wy + 5, 2), 3); // a few broad deeper streaks (色根)
    const mott = nA.fbm(x / 64 + 60, y / 64 - 8, 2);                          // granular clouding
    cC[k] = 0.24 + 0.38 * sstep(-0.5, 0.5, blotch) + 0.3 * drift + 0.34 * root + 0.1 * mott;
    cT[k] = 1 / (100 * (1 + 0.5 * nA.fbm(x / 340 + 70, y / 340 - 20, 2)));   // how far in the blade stays thin
    cK[k] = sstep(0.2, 0.7, nA.fbm(u / 300 + 77, v / 90 + 5, 3));             // pale cottony wisps (棉)
    // relief: lobes + two scales of hand-polish undulation + the blade thickening toward the midrib
    const dd = R - Math.hypot(x - cx, y - cy);
    const lobe = 1 + 0.32 * nB.fbm(x / 520 + 2, y / 520 + 40, 2);
    Hs[k] = -AP * lobe * Vq[k] + 2.2 * nB.fbm(x / 300 + 5, y / 300 - 3, 2) + 0.3 * nA.fbm(x / 84 - 9, y / 84 + 3, 2) + 34 * sstep(-40, 560, dd);
    cP[k] = 0.1 + 0.9 * sstep(-0.42, 0.3, nB.fbm(x / 260 - 30, y / 260 + 12, 2));   // how well each patch of surface took its polish
    // yellow: distance to the drift's centre line, ragged and cloudy
    let ym = 0;
    if (x > 1000 && x < 1900 && y < 960) {
      const nn = nA.fbm(x / 175 + 11, y / 175 + 23, 2), feather = nB.fbm(u / 420 + 3, v / 110 + 8, 2);
      let best = 1e12, bt = 0;
      for (let q = 0; q < ny1; q++) {
        const ax = yel[q][0], ay = yel[q][1], vx = yel[q + 1][0] - ax, vy = yel[q + 1][1] - ay;
        let tt = ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy); tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const ex = x - ax - vx * tt, ey = y - ay - vy * tt, d2 = ex * ex + ey * ey;
        if (d2 < best) { best = d2; bt = (q + tt) / ny1; }
      }
      const hw = L.lerp(30, 76, sstep(0.02, 0.55, bt)) * L.lerp(1, 0.7, sstep(0.7, 1, bt));
      const field = 1.2 - Math.sqrt(best) / hw + 0.46 * nn + 0.36 * feather;      // > 0 inside the cloud
      ym = sstep(0, 0.22, bt) * sstep(1.0, 0.93, bt) * sstep(-0.3, 0.5, field);
      // a fainter fleck further along
      const fx = x - 1716, fy = y - 742;
      ym = Math.max(ym, 0.55 * sstep(1.3, 0.2, Math.hypot(fx * 0.75 + fy * 0.5, fy * 1.2 - fx * 0.3) / (40 * (1 + 0.5 * nn))));
    }
    cY[k] = ym;
  }
  const SX = new Float32Array(CN), SY = new Float32Array(CN);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const k = j * cw + i;
    SX[k] = (Hs[k + (i < cw - 1 ? 1 : 0)] - Hs[k - (i > 0 ? 1 : 0)]) / (2 * CS);
    SY[k] = (Hs[k + (j < ch - 1 ? cw : 0)] - Hs[k - (j > 0 ? cw : 0)]) / (2 * CS);
  }

  // fine field: crystal grain inside the stone (翠性) and the "orange peel" of the polish
  const fine = L.noiseTex(RW, RH, { seed: 's09fine', scale: 13, octaves: 2, res: 0.5, contrast: 1.5 });
  const Pd = fine.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, RW, RH).data;
  const PO1 = (37 + 11 * RW) * 4, PO2 = (211 + 97 * RW) * 4, N4 = N * 4;

  const GRN = lut([[0, '#e2fbe2'], [0.1, '#a9efb6'], [0.2, '#74e19c'], [0.32, '#38cc7e'], [0.46, '#18b166'], [0.6, '#119b57'],
    [0.78, '#0c7c45'], [0.98, '#0a5f36'], [1.2, '#084629'], [1.6, '#052c1a']]);
  const YEL = lut([[0, '#fff8d6'], [0.1, '#fbe9a0'], [0.22, '#f4d66e'], [0.36, '#eac250'], [0.5, '#e0b040'], [0.7, '#d29b30'],
    [0.95, '#b98023'], [1.6, '#8f5c17']]);

  // ── shade ──
  const img = new ImageData(RW, RH), d = img.data;
  const sp = new ImageData(RW, RH), sd = sp.data;
  const LX = -0.6, LY = -0.8;                 // toward the key light (upper left)
  const KX = 0.72, KY = -0.694;               // toward the kicker (upper right, further back)
  const S0 = 0.21, S2 = 0.36;                 // the tilts that mirror each lamp into the lens
  const KP = 0.0002;                         // the soft-box is close: its mirror tilt drifts across the stone
  const RE = 25, RK = 0.72, AG = 7.5;         // rim roll-off: width, steepness; groove depth
  const CSi = 1 / CS;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y, jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    const fy = j * CSi, j0 = fy | 0, ty0 = fy - j0, rowK = j0 * cw;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      let dd = R - rr;
      if (dd < -2) continue;
      if (dd < 0) dd = 0;
      const k = j * RW + i, o = k * 4;
      // bilinear weights on the coarse grid
      const fx = i * CSi, i0 = fx | 0, tx0 = fx - i0, kk = rowK + i0;
      const w00 = (1 - tx0) * (1 - ty0), w10 = tx0 * (1 - ty0), w01 = (1 - tx0) * ty0, w11 = tx0 * ty0;
      const sx = SX[kk] * w00 + SX[kk + 1] * w10 + SX[kk + cw] * w01 + SX[kk + cw + 1] * w11;
      const sy = SY[kk] * w00 + SY[kk + 1] * w10 + SY[kk + cw] * w01 + SY[kk + cw + 1] * w11;
      const val = Vq[kk] * w00 + Vq[kk + 1] * w10 + Vq[kk + cw] * w01 + Vq[kk + cw + 1] * w11;
      const ym = cY[kk] * w00 + cY[kk + 1] * w10 + cY[kk + cw] * w01 + cY[kk + cw + 1] * w11;
      const C0 = cC[kk] * w00 + cC[kk + 1] * w10 + cC[kk + cw] * w01 + cC[kk + cw + 1] * w11;
      const cot = cK[kk] * w00 + cK[kk + 1] * w10 + cK[kk + cw] * w01 + cK[kk + cw + 1] * w11;
      const pol = cP[kk] * w00 + cP[kk + 1] * w10 + cP[kk + cw] * w01 + cP[kk + cw + 1] * w11;
      const thn = cT[kk] * w00 + cT[kk + 1] * w10 + cT[kk + cw] * w01 + cT[kk + cw + 1] * w11;
      const grv = G[k];
      const p0 = (Pd[o] - 128) / 128, p1 = (Pd[(o + PO1) % N4] - 128) / 128, p2 = (Pd[(o + PO2) % N4] - 128) / 128;
      // which way the surface leans (−∇height): lobes, groove walls, the rolled rim, polish
      let ro = 0;
      if (dd < RE) { const u1 = 1 - dd / RE; ro = RK * u1 / Math.sqrt(1 - u1 * u1 + 0.03); }
      const tx = -sx + (G[k + (i < RW - 1 ? 1 : 0)] - G[k - (i > 0 ? 1 : 0)]) * (AG / 2) + (ro * ddx) / rr + 0.0045 * p1;
      const ty = -sy + (G[k + jp] - G[k + jm]) * (AG / 2) - (ro * ddy) / rr + 0.0045 * p2;
      const f = tx * LX + ty * LY;            // > 0: leaning toward the key light
      const fl = f / (0.26 + (f < 0 ? -f : f));
      // optical depth → body colour
      const C = C0 + (0.34 - C0) * 0.75 * ym;  // the yellow is clearer, more even
      const Tb = 0.15 + 0.66 * (1 - Math.exp(-dd * thn)) + 0.62 * sstep(120, 520, dd);
      let tau = Tb * (0.3 + C) * (1 - 1.1 * ym * (1 - ym)) + 0.3 * grv + 0.07 * val - 0.05 * fl;   // a paler seam where yellow meets green
      if (dd < 3) tau += 0.34 * (1 - dd / 3);  // the limb itself: a fine deeper line
      if (tau < 0) tau = 0;
      const li = (Math.min(TMAX, tau) / TMAX * (NL - 1) | 0) * 3, ly = (Math.min(0.7, tau * 0.66) / TMAX * (NL - 1) | 0) * 3;
      let cr = GRN[li] + (YEL[ly] - GRN[li]) * ym, cg = GRN[li + 1] + (YEL[ly + 1] - GRN[li + 1]) * ym, cb = GRN[li + 2] + (YEL[ly + 2] - GRN[li + 2]) * ym;
      const ck = 0.1 * cot * (1 - grv) * (1 - ym);
      cr += (212 - cr) * ck; cg += (244 - cg) * ck; cb += (220 - cb) * ck;
      // form shading: soft, and the shade keeps its colour (light scatters through the stone)
      const dsh = (1 + 0.15 * fl) * (1 - 0.24 * grv) * (1 - 0.07 * val) * (1 + 0.05 * p0) - 1;
      cr *= 1 + 1.25 * dsh; cg *= 1 + 0.85 * dsh; cb *= 1 + 1.12 * dsh;
      // gloss: the soft-box (a window with one glazing bar) mirrored wherever a slope leans the right way
      const qx = tx - (S0 * LX + KP * (x - 660)), qy = ty - (S0 * LY + KP * (y - 700));
      const du = qx * LX + qy * LY, dv = -qx * LY + qy * LX;
      const adu = du < 0 ? -du : du, adv = dv < 0 ? -dv : dv;
      const deep = 1 - 0.8 * sstep(230, 480, dd), flat = 1 - sstep(0.03, 0.22, grv);
      let w1 = 0;
      if (adu < 0.09 && adv < 0.21) w1 = sstep(0.086, 0.018, adu) * sstep(0.2, 0.08, adv) * pol * deep * flat;
      const wall = 0.5 * sstep(0.3, 0.78, f) * sstep(0.04, 0.3, grv) * (0.4 + 0.6 * pol) * deep;   // the lit wall of each groove
      const sheen = Math.exp(-(du * du + 0.4 * dv * dv) / 0.016) * deep;
      const q2x = tx - S2 * KX, q2y = ty - S2 * KY;
      const du2 = q2x * KX + q2y * KY, dv2 = -q2x * KY + q2y * KX;
      const w2 = Math.exp(-(du2 * du2) / 0.0022 - (dv2 * dv2) / 0.02);
      let spec = 0.88 * w1 + wall + 0.4 * w2 * flat + 0.06 * sheen;
      if (spec > 1) spec = 1;
      d[o] = cr + (255 - cr) * spec; d[o + 1] = cg + (254 - cg) * spec; d[o + 2] = cb + (243 - cb) * spec; d[o + 3] = 255;
      const sa = 0.88 * w1 + 0.6 * wall + 0.4 * w2 * flat;
      sd[o] = 240; sd[o + 1] = 255; sd[o + 2] = 236; sd[o + 3] = 255 * (sa > 1 ? 1 : sa);
    }
  }
  const leaf = L.makeCanvas(RW, RH); leaf.getContext('2d').putImageData(img, 0, 0);
  const spec = L.makeCanvas(RW, RH); spec.getContext('2d').putImageData(sp, 0, 0);
  return { leaf, spec, X0, Y0, RW, RH };
}

/**
 * beige silk twill: diagonal ribs with uneven yarns, long soft bands of lustre, light falling off from the upper left,
 * and the leaf's close green-tinged shadow hugging the rim. Covers everything above the arc (plus a margin).
 */
function buildSilk(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = -PAD, RW = W + PAD * 2, RH = Math.ceil(a.yAt(X0)) + 10 - Y0;
  const nz = L.makeNoise('s09silk');
  const CS = 8, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cS = new Float32Array(cw * ch), cF = new Float32Array(cw * ch);
  const CA = Math.cos(L.deg(33)), SA = Math.sin(L.deg(33));
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, u = x * CA + y * SA, v = -x * SA + y * CA;
    cS[j * cw + i] = nz.fbm(u / 3000 + 3, v / 190, 2);
    cF[j * cw + i] = nz.fbm(x / 900 + 40, y / 520 - 7, 2);
  }
  // yarn irregularity along warp and weft
  const r = L.rng('s09yarn'), rowJ = new Float32Array(RH), colJ = new Float32Array(RW);
  let pv = 0; for (let y = 0; y < RH; y++) { pv = pv * 0.6 + r.gauss() * 0.4; rowJ[y] = pv; }
  pv = 0; for (let x = 0; x < RW; x++) { pv = pv * 0.6 + r.gauss() * 0.4; colJ[x] = pv; }
  const img = new ImageData(RW, RH), d = img.data;
  const PITCH = 8.6, CSi = 1 / CS;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    const fy = j * CSi, j0 = fy | 0, ty0 = fy - j0, rowK = j0 * cw;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx;
      const out = Math.sqrt(ddx * ddx + ddy * ddy) - R;      // > 0 above the rim
      if (out < -4) continue;
      const fx = i * CSi, i0 = fx | 0, tx0 = fx - i0, kk = rowK + i0;
      const w00 = (1 - tx0) * (1 - ty0), w10 = tx0 * (1 - ty0), w01 = (1 - tx0) * ty0, w11 = tx0 * ty0;
      const lustre = sstep(-0.55, 0.55, cS[kk] * w00 + cS[kk + 1] * w10 + cS[kk + cw] * w01 + cS[kk + cw + 1] * w11);
      const fold = cF[kk] * w00 + cF[kk + 1] * w10 + cF[kk + cw] * w01 + cF[kk + cw + 1] * w11;
      const up = (-x * SA + y * CA) / PITCH, al = x * CA + y * SA;
      const ridge = Math.sin(L.TAU * up), knot = Math.sin(al * 0.46 + Math.floor(up + 0.25) * 2.4);
      const dl = 0.02 * lustre - 0.008 + 0.024 * fold
        + ridge * (0.024 + 0.026 * lustre) * (0.7 + 0.3 * knot)
        + rowJ[j] * 0.011 + colJ[i] * 0.008
        + 0.04 - 0.075 * ((x / W) * 0.62 + (y / 760) * 0.38);
      let cr = 234 * (1 + dl), cg = 224 * (1 + 1.08 * dl), cb = 199 * (1 + 1.4 * dl);
      if (out < 120) {
        const side = sstep(-0.3, 0.36, ddx / R), dp = out < 0 ? 0 : out;     // the shadow opens out on the side away from the lamp
        const sh = 0.36 * Math.exp(-dp / 4) + (0.08 + 0.2 * side) * Math.exp(-dp / (11 + 24 * side));
        cr *= 1 - 0.66 * sh; cg *= 1 - 0.34 * sh; cb *= 1 - 0.62 * sh;
      }
      const o = (j * RW + i) * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

export default {
  name: '翡翠雕叶',
  tone: 'dark',
  init(env) {
    const a = env.arc;
    const T0 = performance.now();
    const silk = buildSilk(env);
    const T1 = performance.now();
    const { leaf, spec, X0, Y0, RW, RH } = buildLeaf(env);
    const T2 = performance.now();
    // highlights bloom a little in the lens
    const GW = RW >> 1, GH = RH >> 1;
    const glint = L.makeCanvas(GW, GH), gl = glint.getContext('2d');
    gl.imageSmoothingQuality = 'high';
    gl.filter = 'blur(4.5px)'; gl.drawImage(spec, 0, 0, GW, GH); gl.filter = 'none';
    const base = L.makeLayer(PAD, (g) => {
      g.drawImage(silk, -PAD, -PAD);
      g.save(); a.clipBelow(g, 0);
      g.drawImage(leaf, X0, Y0);
      g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.32;
      g.drawImage(glint, X0, Y0, RW, RH);
      g.restore();
    });
    // ── depth of field: the plane of focus lies along the rim; the picture softens toward the bottom, the top and the sides ──
    const bw = base.width, bh = base.height;
    const mask = (src, stops, side) => {
      const m = L.makeCanvas(bw, bh), g = m.getContext('2d');
      const r0 = a.R - 560, r1 = a.R + 640;
      g.fillStyle = L.radial(g, a.cx + PAD, a.cy + PAD, r0, r1, stops.map(([dr, al]) => [(a.R + dr - r0) / (r1 - r0), `rgba(0,0,0,${al})`]));
      g.fillRect(0, 0, bw, bh);
      g.fillStyle = L.linear(g, PAD, 0, PAD + W, 0, [[0, `rgba(0,0,0,${side})`], [0.2, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${side})`]]);
      g.fillRect(0, 0, bw, bh);
      g.globalCompositeOperation = 'source-in';
      g.drawImage(src, 0, 0, bw, bh);
      return m;
    };
    const half = L.makeCanvas(bw >> 1, bh >> 1), hg = half.getContext('2d');
    hg.imageSmoothingQuality = 'high';
    hg.filter = 'blur(4px)'; hg.drawImage(base, 0, 0, bw >> 1, bh >> 1); hg.filter = 'none';
    const soft = mask(L.blurred(base, 2.6), [[-560, 1], [-430, 1], [-250, 0], [46, 0], [170, 1], [640, 1]], 0.55);
    const far = mask(half, [[-560, 1], [-530, 0.9], [-350, 0], [150, 0], [330, 0.85], [640, 1]], 0.3);
    const bg = base.getContext('2d');
    bg.save(); bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.drawImage(soft, 0, 0); bg.drawImage(far, 0, 0);
    bg.restore();
    const scratch = L.makeCanvas(GW, GH);
    S = { base, glint, scratch, sg: scratch.getContext('2d'), X0, Y0, RW, RH, GW, GH };
    console.warn(`s09 timing: silk ${(T1 - T0) | 0}  leaf ${(T2 - T1) | 0}  comp ${(performance.now() - T2) | 0}`);
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0042, 0.0042, p), zoom = L.lerp(1.0, 1.012, p);
    L.blit(ctx, env, S.base, { rot, zoom });
    const br = Math.sin(p * Math.PI);                 // the light inside swells, then settles
    // a window of light travels along the leaf: the highlights under it flare
    const sg = S.sg, pk = L.lerp(0.22, 0.44, p);
    sg.globalCompositeOperation = 'copy'; sg.drawImage(S.glint, 0, 0);
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.linear(sg, 0, 0, S.GW, 0, [[0, 'rgba(0,0,0,0)'], [Math.max(0, pk - 0.2), 'rgba(0,0,0,0.06)'], [pk, 'rgba(0,0,0,1)'], [pk + 0.22, 'rgba(0,0,0,0.08)'], [1, 'rgba(0,0,0,0)']]);
    sg.fillRect(0, 0, S.GW, S.GH);
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.save(); a.clipBelow(ctx, -0.5);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.75; ctx.drawImage(S.scratch, S.X0, S.Y0, S.RW, S.RH); ctx.globalAlpha = 1;
      // transmitted light pooling under the rim
      a.at(ctx, L.lerp(-0.13, -0.05, p), -130, () => {
        ctx.scale(2.7, 1);
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, 290, [[0, L.rgba('#7fe0a0', 0.05 + 0.09 * br)], [0.5, L.rgba('#3fd088', 0.025 + 0.045 * br)], [1, 'rgba(60,200,130,0)']]);
        ctx.fillRect(-310, -310, 620, 620);
      });
      ctx.restore();
    });
  },
};
