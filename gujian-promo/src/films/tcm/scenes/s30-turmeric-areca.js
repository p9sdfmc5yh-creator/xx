// s30 — 姜黄与槟榔纹. A slice of areca nut (槟榔) blown up until its outer edge fills the frame, standing in front of
// a wall of pressed turmeric powder.
// The arc = the outer edge of the slice: a thin, very dark seed coat. Below it the cut face shows the "槟榔纹":
// red-brown folds of the seed coat running in from the edge into ivory endosperm — they start out roughly radial,
// then bend over and run on as wavy, forking bands that get coarser toward the bottom (never rings, never parallel lines).
// Above the arc: saturated turmeric yellow, trowelled flat, with fingernail scratches and two small bare patches (kept to the sides).
//
// How the marbling is made (all in init):
//   · a "phasor noise" field — a few thousand small oriented wave packets, each taking its direction and wavelength from
//     an orientation field (radial at the rim → swept sideways deeper in) — gives stripes that fork and merge like sand ripples;
//   · its phase is turned into a signed distance (px) from the brown/white boundary, joined to the seed coat with a smooth union;
//   · that distance drives colour (dark edge → red-brown core, tannin stain bleeding into the ivory) and a height field
//     (the hard endosperm stands a hair proud of the shrunken brown tissue) that is lit from the upper left.
// draw() only blits: the wall stays put (its grain flickers), the slice turns a fraction of a degree about the arc's centre.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;                // the slice only turns ±0.43° → 64 px of spare canvas is plenty
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ───────────────────────── the areca slice ─────────────────────────
function buildSlice(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 4;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s30a'), nB = L.makeNoise('s30b');
  // (s, d): s = distance along the arc from the crest (px, + = right), d = depth below the arc (px)

  // wavelength of the marbling: fine at the rim, coarse deep inside
  const lamBase = (d) => 40 + 80 * Math.pow(sstep(0, 560, d), 1.1);
  const lamAt = (s, d) => lamBase(d) * (1 + 0.2 * nA.n2(s / 430 + 3.1, d / 430 - 8.2) + 0.21 * nB.n2(s / 130 - 6, d / 220 + 1.5));
  // The folds run straight in at the rim, then bend over and run on as tilted, wavy layers. Their normal is
  // N = (cos θ, sin θ): θ = 0 at the rim (N along the arc → radial folds), turning to ≈ 90° ∓ 17° deep inside (N nearly inward → layers).
  // `tilt` says which way the deep layers dip: they sag into a valley around s ≈ -300 and ride over a crest around s ≈ +560,
  // like swell. The field is continuous everywhere and N never points outward, so the phase has a direction:
  // every fold has an outer (soft) flank and an inner (crisp) edge.
  const tiltAt = (s, d) => Math.sin((Math.PI * (s + 300 + 150 * nB.n2(d / 360 + 11, 2.7))) / 860);
  const thAt = (s, d) => {
    const t = sstep(0, 250 + 105 * nA.n2(s / 230 + 50, 1.7), d);          // some folds reach far in before they turn, some turn at once
    return t * (Math.PI / 2 - 0.3 * tiltAt(s, d)) + 0.4 * nA.n2(s / 250 - 17, d / 210 + 5) * (0.4 + 0.6 * t) + 0.16 * nB.n2(s / 90, d / 90);
  };

  // wave packets, laid out in rows whose cell size follows the local wavelength
  const K = 2, SMAX = 1560, rows = [];
  for (let D = -90; D < 780;) {
    const h = 2.5 * lamBase(Math.max(0, D + 50));
    const nc = Math.ceil((2 * SMAX) / h);
    const row = { d0: D, h, inv: 1 / (h * h), nc, ks: new Float32Array(nc * K), kd: new Float32Array(nc * K), kfx: new Float32Array(nc * K), kfy: new Float32Array(nc * K) };
    const r = L.rng('s30k' + rows.length);
    for (let c = 0; c < nc; c++) for (let k = 0; k < K; k++) {
      const s = -SMAX + (c + r()) * h, d = D + r() * h, dd = Math.max(0, d);
      const f = (2 * Math.PI) / lamAt(s, dd), th = thAt(s, dd), i = c * K + k;
      row.ks[i] = s; row.kd[i] = d; row.kfx[i] = Math.cos(th) * f; row.kfy[i] = Math.sin(th) * f;
    }
    rows.push(row); D += h;
  }
  let pRe = 0, pIm = 0;
  const phasor = (s, d) => {
    let j = 0; while (j < rows.length - 1 && d >= rows[j].d0 + rows[j].h) j++;
    let re = 0, im = 0;
    for (let jj = Math.max(0, j - 1); jj <= Math.min(rows.length - 1, j + 1); jj++) {
      const r = rows[jj], c = Math.floor((s + SMAX) / r.h);
      for (let cc = Math.max(0, c - 1); cc <= Math.min(r.nc - 1, c + 1); cc++) {
        for (let k = 0; k < K; k++) {
          const i = cc * K + k, dx = s - r.ks[i], dy = d - r.kd[i], q = (dx * dx + dy * dy) * r.inv;
          if (q >= 1) continue;
          const w = (1 - q) * (1 - q) * (1 - q), ph = r.kfx[i] * dx + r.kfy[i] * dy;
          re += w * Math.cos(ph); im += w * Math.sin(ph);
        }
      }
    }
    pRe = re; pIm = im;
  };

  // 1) the complex field on a half-resolution grid (it is smooth; the crisp edges come from thresholding its phase at full res)
  const CS = 2, gw = Math.ceil(RW / CS) + 2, gh = Math.ceil(RH / CS) + 2;
  const Re = new Float32Array(gw * gh), Im = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), d = R - Math.hypot(ddx, ddy);
    if (d < -12) continue;
    const s = Math.atan2(ddx, ddy) * R;
    const wx = 6 * nA.n2(s / 48, d / 48) + 15 * nB.n2(s / 160 + 9, d / 160);
    const wy = 6 * nA.n2(s / 48 + 40, d / 48 - 23) + 15 * nB.n2(s / 160 - 31, d / 160 + 17);
    phasor(s + wx, d + wy);
    Re[j * gw + i] = pRe; Im[j * gw + i] = pIm;
  }

  // 2) slow fields on a coarse grid
  const C2 = 8, cw = Math.ceil(RW / C2) + 2, ch = Math.ceil(RH / C2) + 2;
  const cLam = new Float32Array(cw * ch), cPe = new Float32Array(cw * ch), cTone = new Float32Array(cw * ch), cTone2 = new Float32Array(cw * ch), cCoat = new Float32Array(cw * ch), cVein = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * C2 - cx, ddy = cy - (Y0 + j * C2), d = R - Math.hypot(ddx, ddy), s = Math.atan2(ddx, ddy) * R, k = j * cw + i;
    cLam[k] = lamAt(s, Math.max(0, d));
    cPe[k] = Math.PI * (0.46 + 0.15 * nB.fbm(s / 210 + 5, d / 210 - 9, 2) + 0.06 * nA.n2(s / 64 - 3, d / 64 + 12));   // how much of each period is brown
    cTone[k] = nA.fbm(s / 330 - 20, d / 330 + 4, 3);
    cTone2[k] = nB.fbm(s / 120 + 60, d / 120 - 40, 2);
    cVein[k] = nA.ridged(s / 150 + 13, d / 60 - 7, 2);                              // faint horny streaks in the endosperm
    cCoat[k] = 11 + 3.5 * nA.n2(s / 85 + 70, 3.3) + 1.5 * nB.n2(s / 40, 9.1);      // thickness of the seed coat
  }
  const bil = (src, gwid, cs, i, j) => {
    const fx = i / cs, fy = j / cs, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * gwid + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + gwid], b1 = src[k + gwid + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // faint knife marks: straight parallel lines across the whole cut face
  const KA = L.deg(13), ksn = Math.sin(KA), kcs = Math.cos(KA), KOFF = 380, KN = new Float32Array(1500);
  {
    const r = L.rng('s30knife');
    for (let n = 0; n < 150; n++) {
      const pos = r.range(0, 1500), wd = r.range(0.7, 2.4), amp = r.range(-1, 0.55) * (r.chance(0.15) ? 1.6 : 0.7);
      for (let u = Math.max(0, Math.floor(pos - wd * 3)); u <= Math.min(1499, Math.ceil(pos + wd * 3)); u++) KN[u] += amp * Math.exp(-((u - pos) * (u - pos)) / (2 * wd * wd));
    }
    for (let u = 0; u < 1500; u++) KN[u] += 0.35 * nA.n2(u / 38, 77.7);
  }

  // 3) full resolution: signed distance to the brown/white boundary, height
  const SD = new Float32Array(N), Hh = new Float32Array(N), Dd = new Float32Array(N), Fn = new Float32Array(N), Kn = new Float32Array(N), PH = new Float32Array(N), PE = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, x = X0 + i, ddx = x - cx, d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < -4) { Dd[k] = -9; continue; }
      const s = Math.atan2(ddx, ddy) * R;
      const re = bil(Re, gw, CS, i, j), im = bil(Im, gw, CS, i, j);
      const phs = Math.atan2(im, re), ph = Math.abs(phs);                  // |phase|: 0 = middle of a brown fold, π = middle of the white
      const lam = bil(cLam, cw, C2, i, j);
      const pe = bil(cPe, cw, C2, i, j) + (d < 160 ? 0.38 * Math.exp(-Math.max(d, 0) / 24) : 0);   // folds flare where they join the seed coat
      let sd = (ph - pe) * lam * 0.159155;
      const f1 = nA.n2(s / 5.5, d / 5.5), f2 = nB.n2(s / 24 + 7, d / 24);
      sd += 0.5 * f1 + 1.0 * f2;
      const sc = d - bil(cCoat, cw, C2, i, j);
      const hk = Math.max(10 - Math.abs(sd - sc), 0) / 10; sd = Math.min(sd, sc) - hk * hk * 2.5;   // smooth union with the seed coat
      const u = x * ksn + y * kcs - KOFF, u0 = u | 0, kn = u0 >= 0 && u0 < 1499 ? KN[u0] + (KN[u0 + 1] - KN[u0]) * (u - u0) : 0;
      SD[k] = sd; Dd[k] = d; Fn[k] = f1 * 0.6 + f2 * 0.4; Kn[k] = kn; PH[k] = phs; PE[k] = pe;
      Hh[k] = sstep(-3.5, 4, sd) + 0.06 * f1 + 0.04 * f2 + 0.1 * kn;
    }
  }

  // 4) shade
  const img = new ImageData(RW, RH), px = img.data;
  for (let j = 1; j < RH - 1; j++) {
    const y = Y0 + j;
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, d = Dd[k];
      if (d < -1.2) continue;
      const x = X0 + i, sd = SD[k], fn = Fn[k], kn = Kn[k];
      const phs = PH[k], pe = PE[k];
      // across the white: 0 just under a fold's crisp inner edge → 1 where it runs into the soft outer flank of the next fold
      const cc = L.clamp(((phs >= 0 ? phs : phs + 6.2832) - pe) / (6.2832 - 2 * pe));
      // across a fold: 0 at its soft outer flank → 1 at its crisp inner edge
      const bt = L.clamp((phs + pe) / (2 * pe));
      const ew = phs < 0 ? 2.2 : 1.1, b = 1 - sstep(-ew, ew, sd);
      // ivory endosperm: brightest under the crisp edge, tannin-stained as it nears the next fold
      const tn = bil(cTone, cw, C2, i, j);
      let er = 243 + 5 * tn, eg = 235 + 7 * tn, eb = 216 + 12 * tn;
      const s2 = Math.pow(sstep(0.36, 1, cc), 1.4) * 0.42, s1 = phs >= 0 ? Math.exp(-Math.max(sd, 0) / 3.5) * 0.4 : 0;
      er += (210 - er) * s2; eg += (170 - eg) * s2; eb += (122 - eb) * s2;
      er += (196 - er) * s1; eg += (146 - eg) * s1; eb += (100 - eb) * s1;
      const hv = sstep(0.62, 0.9, bil(cVein, cw, C2, i, j)) * 0.5;
      er -= 13 * hv; eg -= 15 * hv; eb -= 17 * hv;
      er += 6 * fn; eg += 6 * fn; eb += 8 * fn;
      // red-brown fold: warm and light on the outer flank, deepening to a dark crisp inner edge
      const t2 = bil(cTone2, cw, C2, i, j);
      let br, bg, bb;
      if (bt < 0.3) { const q = bt / 0.3; br = 142 + (118 - 142) * q; bg = 75 + (55 - 75) * q; bb = 38 + (29 - 38) * q; }
      else if (bt < 0.75) { const q = (bt - 0.3) / 0.45; br = 118 + (86 - 118) * q; bg = 55 + (40 - 55) * q; bb = 29 + (23 - 29) * q; }
      else { const q = (bt - 0.75) / 0.25; br = 86 + (58 - 86) * q; bg = 40 + (26 - 40) * q; bb = 23 + (15 - 23) * q; }
      br += 24 * t2 + 14 * fn; bg += 9 * t2 + 7 * fn; bb += 4 * t2 + 4 * fn;
      // seed coat: nearly black-brown
      const coat = 1 - sstep(4, 20, d);
      if (coat > 0) { br += (42 - br) * coat * 0.92; bg += (24 - bg) * coat * 0.92; bb += (16 - bb) * coat * 0.92; }
      let cr = er + (br - er) * b, cg = eg + (bg - eg) * b, cb = eb + (bb - eb) * b;
      // relief, lit from the upper left
      const gx = (Hh[k + 1] - Hh[k - 1]) * 0.5, gy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      let lit = (gx * 0.6 + gy * 0.8) * 1.45; lit = lit < -0.5 ? -0.5 : lit > 0.5 ? 0.5 : lit;
      const tg = L.clamp((x * 0.8 + (y - a.crestY) * 1.2) / 2200), gl = (1.05 - 0.16 * tg) * (1 + 0.05 * kn);
      let hsh = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177); hsh ^= hsh >>> 16;
      const sh = (1 + lit) * gl * (0.975 + 0.05 * ((hsh & 1023) / 1023));
      cr *= sh; cg *= sh; cb *= sh;
      // the rim of the slice catches a little light
      const rim = (1 - sstep(0.4, 3.4, d)) * (1 - 0.6 * tg);
      cr += 70 * rim; cg += 40 * rim; cb += 20 * rim;
      const o = k * 4;
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = L.clamp(d + 0.5) * 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);
  // pores and specks, only where the slice is
  g.globalCompositeOperation = 'source-atop';
  L.speckle(g, { seed: 's30pore', count: 2600, x: 0, y: 0, w: RW, h: RH, rMin: 0.5, rMax: 1.7, colors: ['#8a5a36', '#6a4026', '#b98a5c'], alpha: [0.12, 0.45] });
  L.speckle(g, { seed: 's30pore2', count: 900, x: 0, y: 0, w: RW, h: RH, rMin: 0.5, rMax: 1.3, colors: ['#fff8e6'], alpha: [0.15, 0.4] });
  return { slice: cnv, X0, Y0 };
}

// ───────────────────────── the turmeric wall ─────────────────────────
function offsetPts(pts, o) {
  const p = L.smoothPath(pts, 8), out = [];
  for (let i = 0; i < p.length; i++) {
    const q0 = p[Math.max(0, i - 1)], q1 = p[Math.min(p.length - 1, i + 1)];
    let nx = -(q1[1] - q0[1]), ny = q1[0] - q0[0]; const m = Math.hypot(nx, ny) || 1;
    out.push([p[i][0] + (nx / m) * o, p[i][1] + (ny / m) * o]);
  }
  return out;
}

function buildWall(env) {
  const a = env.arc;
  const HW = Math.min(H, Math.ceil(a.yAt(0)) + 16);
  const col = L.makeCanvas(W, HW), g = col.getContext('2d');
  const hgt = L.makeCanvas(W, HW), hg = hgt.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, HW);

  // 1) base: saturated turmeric, key light from the upper left
  g.fillStyle = L.linear(g, 0, 0, W * 0.3, HW, [[0, '#f3c62e'], [0.5, '#e9b01a'], [1, '#e2a212']]);
  g.fillRect(0, 0, W, HW);
  g.fillStyle = L.radial(g, 620, 170, 0, 1450, [[0, 'rgba(249,218,88,0.95)'], [0.5, 'rgba(244,207,74,0.45)'], [1, 'rgba(244,207,74,0)']]);
  g.fillRect(0, 0, W, HW);
  // thicker / thinner powder
  g.globalAlpha = 0.55;
  g.drawImage(L.noiseTex(W, HW, { seed: 's30m1', scale: 300, octaves: 4, warp: 0.6, res: 0.25, ramp: [[0, 'rgba(206,136,6,0.6)'], [0.42, 'rgba(226,168,20,0)'], [0.62, 'rgba(244,207,74,0)'], [1, 'rgba(251,224,104,0.65)']] }), 0, 0);
  g.globalAlpha = 0.4;
  g.drawImage(L.noiseTex(W, HW, { seed: 's30m2', scale: 54, octaves: 3, res: 0.5, contrast: 1.3, ramp: [[0, 'rgba(200,128,6,0.5)'], [0.5, 'rgba(226,168,20,0)'], [1, 'rgba(252,228,112,0.5)']] }), 0, 0);
  g.globalAlpha = 1;

  // 2) trowel sweeps: wide arcs pressed flat, each with a crisp leading edge and drag lines inside
  const sweeps = [
    { x: 380, y: 1620, r: 1540, w: 260, a0: -2.05, a1: -1.2, k: 1.0 },
    { x: 1500, y: 1900, r: 1700, w: 300, a0: -1.95, a1: -1.25, k: 0.8 },
    { x: 2300, y: 1150, r: 1120, w: 220, a0: -2.95, a1: -2.2, k: 1.0 },
    { x: -500, y: 900, r: 1010, w: 200, a0: -0.75, a1: 0.05, k: 0.9 },
    { x: 900, y: -1500, r: 1830, w: 240, a0: 1.2, a1: 1.95, k: 0.7 },
  ];
  const rs = L.rng('s30sweep');
  for (const sw of sweeps) {
    const band = (c) => { c.beginPath(); c.arc(sw.x, sw.y, sw.r, sw.a0, sw.a1, false); c.arc(sw.x, sw.y, sw.r - sw.w, sw.a1, sw.a0, true); c.closePath(); };
    // burnished: a little deeper and more orange toward the leading edge
    g.save(); band(g); g.clip();
    g.fillStyle = L.radial(g, sw.x, sw.y, sw.r - sw.w, sw.r, [[0, 'rgba(214,140,6,0)'], [0.7, `rgba(214,140,6,${0.16 * sw.k})`], [1, `rgba(206,128,4,${0.34 * sw.k})`]]);
    g.fillRect(0, 0, W, HW);
    g.restore();
    hg.save(); band(hg); hg.clip();
    hg.fillStyle = L.radial(hg, sw.x, sw.y, sw.r - sw.w, sw.r, [[0, 'rgba(100,100,100,0)'], [1, `rgba(96,96,96,${0.75 * sw.k})`]]);
    hg.fillRect(0, 0, W, HW);
    // drag lines left by grit under the trowel
    for (let n = 0; n < 70; n++) {
      const rr = sw.r - Math.pow(rs(), 1.4) * sw.w, m = rs.range(sw.a0, sw.a1), len = rs.range(0.05, 0.3);
      hg.strokeStyle = rs.chance(0.5) ? `rgba(60,60,60,${rs.range(0.1, 0.4)})` : `rgba(200,200,200,${rs.range(0.1, 0.35)})`;
      hg.lineWidth = rs.range(0.8, 2.6);
      hg.beginPath(); hg.arc(sw.x, sw.y, rr, m - len, m + len); hg.stroke();
    }
    hg.restore();
    // the ridge of powder pushed up along the leading edge
    hg.strokeStyle = `rgba(214,214,214,${0.8 * sw.k})`; hg.lineWidth = 3;
    hg.beginPath(); hg.arc(sw.x, sw.y, sw.r + 2, sw.a0, sw.a1); hg.stroke();
    g.strokeStyle = `rgba(250,222,110,${0.45 * sw.k})`; g.lineWidth = 2.5;
    g.beginPath(); g.arc(sw.x, sw.y, sw.r + 2, sw.a0, sw.a1); g.stroke();
  }

  // 3) two small patches where the powder has flaked off the pale ground
  const flakes = [
    { seed: 'fa', pts: [[176, 118], [214, 96], [262, 112], [274, 168], [258, 226], [266, 282], [236, 318], [196, 300], [186, 244], [164, 190]] },
    { seed: 'fb', pts: [[1668, 150], [1712, 132], [1756, 150], [1764, 186], [1728, 206], [1684, 196]] },
    { seed: 'fc', pts: [[1802, 232], [1822, 224], [1834, 244], [1816, 258]] },
    { seed: 'fd', pts: [[300, 352], [318, 344], [326, 364], [308, 372]] },
  ];
  for (const f of flakes) {
    const path = (c) => L.roughPoly(c, f.pts, { rough: 5, seed: 's30' + f.seed, step: 7 });
    g.save(); path(g); g.clip();
    g.fillStyle = '#f1e5c0'; g.fillRect(0, 0, W, HW);
    const xs = f.pts.map((q) => q[0]), ys = f.pts.map((q) => q[1]);
    const bx = Math.min(...xs) - 12, by = Math.min(...ys) - 12, bw = Math.max(...xs) - bx + 12, bh = Math.max(...ys) - by + 12;
    g.globalAlpha = 0.7;
    g.drawImage(L.noiseTex(Math.ceil(bw), Math.ceil(bh), { seed: 's30' + f.seed, scale: 30, octaves: 3, res: 0.5, ramp: [[0, 'rgba(214,190,130,0.9)'], [0.5, 'rgba(236,222,184,0)'], [1, 'rgba(255,250,236,0.7)']] }), bx, by);
    g.globalAlpha = 1;
    // turmeric still clinging to the ground
    L.speckle(g, { seed: 's30dust' + f.seed, count: Math.round(bw * bh / 14), x: bx, y: by, w: bw, h: bh, rMin: 0.5, rMax: 2.2, colors: ['#e8b21c', '#f0c53a', '#d99a10'], alpha: [0.25, 0.8] });
    // the powder layer has a thickness: its upper-left lip throws a shadow onto the ground
    g.shadowColor = 'rgba(120,66,4,0.7)'; g.shadowBlur = 5; g.shadowOffsetX = 4; g.shadowOffsetY = 5;
    g.strokeStyle = '#e9b21c'; g.lineWidth = 3; path(g); g.stroke();
    g.restore();
    hg.fillStyle = '#3e3e3e'; path(hg); hg.fill();
  }

  // 4) fingernail scratches (kept to the sides, clear of the text zone)
  const scratches = [
    // three nails dragged up the left side
    { w: 5.0, pts: [[318, 560], [372, 470], [452, 372], [520, 262], [556, 168]] },
    { w: 4.2, pts: [[366, 584], [420, 486], [494, 396], [558, 296], [590, 214]] },
    { w: 3.4, pts: [[290, 498], [340, 420], [410, 332], [470, 244]] },
    // right side
    { w: 4.6, pts: [[1392, 66], [1430, 160], [1492, 262], [1538, 370], [1556, 470]] },
    { w: 3.8, pts: [[1436, 48], [1474, 140], [1534, 240], [1578, 338], [1596, 420]] },
    { w: 3.0, pts: [[1640, 590], [1716, 500], [1790, 380], [1852, 286], [1900, 240]] },
    // a long hairline high up
    { w: 2.4, pts: [[742, 60], [900, 86], [1060, 78], [1230, 118], [1330, 104]] },
    { w: 2.6, pts: [[40, 610], [96, 520], [120, 430], [112, 372]] },
  ];
  scratches.forEach((sc, n) => {
    const seed = 's30sc' + n;
    L.inkStroke(hg, sc.pts, { width: sc.w, color: '#2a2a2a', seed, taper: [0.2, 0.4], wobble: 0.5 });
    L.inkStroke(hg, offsetPts(sc.pts, -sc.w * 0.95), { width: sc.w * 0.7, color: 'rgba(205,205,205,0.85)', seed: seed + 'a', taper: [0.3, 0.45], wobble: 0.9 });
    L.inkStroke(hg, offsetPts(sc.pts, sc.w * 0.95), { width: sc.w * 0.7, color: 'rgba(205,205,205,0.85)', seed: seed + 'b', taper: [0.3, 0.45], wobble: 0.9 });
    L.inkStroke(g, sc.pts, { width: sc.w * 0.85, color: 'rgba(160,88,4,0.85)', seed, taper: [0.2, 0.4], wobble: 0.5 });
    // crumbs of loosened powder along the lips
    const r = L.rng(seed), dense = L.smoothPath(sc.pts, 5);
    for (let i = 2; i < dense.length - 2; i++) {
      if (!r.chance(0.7)) continue;
      const o = r.sign() * r.range(sc.w * 0.8, sc.w * 2.6), q0 = dense[i - 1], q1 = dense[i + 1];
      let nx = -(q1[1] - q0[1]), ny = q1[0] - q0[0]; const m = Math.hypot(nx, ny) || 1;
      const x = dense[i][0] + (nx / m) * o + r.range(-2, 2), y = dense[i][1] + (ny / m) * o + r.range(-2, 2), rad = r.range(0.6, 1.9);
      g.fillStyle = L.rgba('#fbe88e', r.range(0.45, 0.9)); g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
      hg.fillStyle = 'rgba(225,225,225,0.8)'; hg.beginPath(); hg.arc(x, y, rad + 0.4, 0, L.TAU); hg.fill();
    }
  });

  // 5) calm the text zone: flatten the relief above the crest
  const calm = (c, style) => { c.save(); c.translate(W / 2, a.crestY - 140); c.scale(1.35, 0.72); c.fillStyle = style(c); c.beginPath(); c.arc(0, 0, 400, 0, L.TAU); c.fill(); c.restore(); };
  calm(hg, (c) => L.radial(c, 0, 0, 150, 400, [[0, 'rgba(128,128,128,0.8)'], [1, 'rgba(128,128,128,0)']]));
  calm(g, (c) => L.radial(c, 0, 0, 150, 400, [[0, 'rgba(232,176,26,0.5)'], [1, 'rgba(232,176,26,0)']]));

  // 6) powder grain and pits (everywhere, so the calm zone is still powder)
  const inText = (x, y) => x > 600 && x < 1320 && y > a.crestY - 290;
  L.speckle(hg, { seed: 's30pit', count: 900, x: 0, y: 0, w: W, h: HW, rMin: 0.7, rMax: 2.6, colors: ['#303030'], alpha: [0.3, 0.9], test: (x, y) => !inText(x, y) });
  L.speckle(hg, { seed: 's30bump', count: 1400, x: 0, y: 0, w: W, h: HW, rMin: 0.6, rMax: 2.0, colors: ['#d8d8d8'], alpha: [0.3, 0.8], test: (x, y) => !inText(x, y) });
  hg.globalAlpha = 0.2;
  hg.drawImage(L.noiseTex(W, HW, { seed: 's30hf', scale: 7, octaves: 2, res: 0.5, contrast: 1.7 }), 0, 0);
  hg.globalAlpha = 0.22;
  hg.drawImage(L.noiseTex(W, HW, { seed: 's30hm', scale: 46, sx: 5, sy: 0.7, octaves: 3, res: 0.5, contrast: 1.5 }), 0, 0);
  hg.globalAlpha = 1;
  hg.globalCompositeOperation = 'overlay'; hg.globalAlpha = 0.34;
  hg.drawImage(L.grainTex(W, HW, { seed: 's30hg', amount: 0.5 }), 0, 0);
  hg.globalCompositeOperation = 'source-over'; hg.globalAlpha = 1;

  // 7) light the relief from the upper left
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.9;
  g.drawImage(L.bumpLight(hgt, { angle: 45, strength: 3.2, res: 1 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  L.speckle(g, { seed: 's30fleck', count: 1500, x: 0, y: 0, w: W, h: HW, rMin: 0.5, rMax: 1.6, colors: ['#fbe480', '#c98206', '#f6d250'], alpha: [0.2, 0.6] });

  // 8) the slice stands just in front of the wall: a tight contact shadow hugging the arc
  g.save(); g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 2, a.R + 30, [[0, 'rgba(150,74,0,0.62)'], [0.3, 'rgba(176,96,0,0.3)'], [1, 'rgba(200,120,0,0)']]);
  g.fillRect(0, 0, W, HW);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 90, [[0, 'rgba(196,112,0,0.2)'], [1, 'rgba(196,112,0,0)']]);
  g.fillRect(0, 0, W, HW);
  g.restore();
  return col;
}

export default {
  name: '姜黄与槟榔纹',
  tone: 'dark',
  init(env) {
    const wall = buildWall(env);
    S = { ...buildSlice(env), wall, grain: L.grainTex(W + 160, wall.height + 160, { seed: 's30g', amount: 0.6 }) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#e2a814'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(S.wall, 0, 0);
    // the wall itself never moves: only its powder grain flickers
    const f = env.frame | 0;
    ctx.save(); a.clipAbove(ctx, 0);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.2;
    ctx.drawImage(S.grain, -((f * 67) % 160), -((f * 109) % 160));
    ctx.restore();
    // the slice turns a fraction of a degree about the arc's centre: the marbling slides along the rim
    const rot = L.lerp(-0.0075, 0.0075, p);
    L.cam(ctx, env, { rot }, () => ctx.drawImage(S.slice, S.X0, S.Y0));
  },
};
