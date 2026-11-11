// s10 — 布币列阵. A row of pointed-shoulder, pointed-foot hollow-handle spades (耸肩尖足空首布) fanned out along the arc,
// handles outward, like a bronze battlement against a flat cyan sky.
//   arc  = the line through the upswept shoulder points of every spade
//   above = each long hollow handle (銎) rises over the arc as a "merlon"; a narrow slit of sky separates neighbours
//   below = the thin blades shoulder to shoulder, each lapping over its left neighbour; near-silhouette oxblood bronze with a
//           coarse corrosion crust, the three parallel raised lines of the type, a few pale loess patches, and a thread of
//           red copper on every edge that faces the light (upper left).
//
// Everything bronze is shaded per pixel in init(): one signed-distance "stamp" of the spade outline is shared by all spades;
// each pixel finds the top-most spade covering it, builds a height value (handle tube, raised lines, rim, crust grains, mud),
// and a second pass turns the height field into relief light. draw() only blits the result with a slow slide round the centre
// and lets a band of brighter rim light drift along the edge.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 140;
const PITCH = 300;            // spacing of the spades along the arc (px)

// outline of one spade in its own frame: x across, y toward the circle centre, origin on the arc at the spade's axis
const HW = 143, TIP_Y = 3.3;                 // shoulder points (x = ±HW): TIP_Y cancels the arc's sag so the points sit on the arc
const ROOT_X = 53, ROOT_Y = 32;              // where the handle meets the shoulders
const TOP_X = 44, TOP_Y = -172;              // handle top
const LB = 492, APEX_Y = 330;                // foot tips / top of the crotch arch
const LINE_X = 72, WEDGE = 112;              // side lines; length of the socket wedge that runs into the blade
const SY_MIN = TOP_Y - 26, SW = 176, SH = LB + 26 - SY_MIN + 2;
const KO = 7;                                // spades per row = 2·KO + 1
const BACK_DR = -296;                        // the second, shadowed row lies this far inside the arc

let S = null;
let SD = null, GX = null, GY = null;         // stamp: signed distance and its gradient
let TF = null, TS = null, TC = null;         // noise tiles: detailed fbm, smooth fbm, worley grains

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ── noise tiles (mirror-wrapped, bilinear) ──
const TN = 512, TM = TN * 2 - 1;
function tex(T, x, y) {
  const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
  let xa = xf & TM, xb = (xf + 1) & TM, ya = yf & TM, yb = (yf + 1) & TM;
  if (xa >= TN) xa = TM - xa; if (xb >= TN) xb = TM - xb; if (ya >= TN) ya = TM - ya; if (yb >= TN) yb = TM - yb;
  ya *= TN; yb *= TN;
  const a = T[ya + xa], b = T[ya + xb], c = T[yb + xa], d = T[yb + xb];
  const top = a + (b - a) * fx;
  return top + (c + (d - c) * fx - top) * fy;
}
function worley(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) d1 = d;
  }
  return Math.sqrt(d1);
}
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function buildTiles() {
  const nA = L.makeNoise('s10a'), nB = L.makeNoise('s10b');
  TF = new Float32Array(TN * TN); TS = new Float32Array(TN * TN); TC = new Float32Array(TN * TN);
  for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++) {
    const k = y * TN + x;
    TF[k] = nA.fbm(x / 70, y / 70, 5, 2, 0.56);
    TS[k] = nB.fbm(x / 60, y / 60, 2, 2, 0.5);
    TC[k] = worley(x / 11, y / 11);
  }
}

// ── the spade outline as a signed-distance stamp (right half; the shape is symmetric) ──
function buildStamp() {
  const pts = [];
  const quad = (p0, p1, p2, n, from) => {
    for (let i = from; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; pts.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]); }
  };
  pts.push([0, TOP_Y]); pts.push([TOP_X - 4, TOP_Y]); pts.push([TOP_X, TOP_Y + 4]);       // flat top of the long rectangular handle
  pts.push([ROOT_X, ROOT_Y - 8]);                                                          // handle side, widening a little toward the blade
  quad([ROOT_X, ROOT_Y - 8], [ROOT_X + 1, ROOT_Y + 1], [ROOT_X + 12, ROOT_Y + 2], 4, 1);  // small fillet
  quad([ROOT_X + 12, ROOT_Y + 2], [102, ROOT_Y + 4], [HW, TIP_Y], 16, 1);                  // the shoulder sweeps up to its point (耸肩)
  for (let i = 1; i <= 20; i++) pts.push([HW - 6 * Math.sin((Math.PI * i) / 20), L.lerp(TIP_Y, LB, i / 20)]);   // slightly waisted side down to the foot tip
  quad([HW - 2.5, LB], [36, APEX_Y], [0, APEX_Y], 26, 0);                            // inner edge of the pointed foot up to the crotch
  const n = pts.length;
  SD = new Float32Array(SW * SH); GX = new Float32Array(SW * SH); GY = new Float32Array(SW * SH);
  for (let j = 0; j < SH; j++) {
    const y = SY_MIN + j;
    for (let i = 0; i < SW; i++) {
      const x = i;
      let dm = 1e12, cross = 0;
      for (let s = 0; s < n - 1; s++) {
        const ax = pts[s][0], ay = pts[s][1], bx = pts[s + 1][0], by = pts[s + 1][1];
        const ex = bx - ax, ey = by - ay, px = x - ax, py = y - ay;
        let t = (px * ex + py * ey) / (ex * ex + ey * ey || 1); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - ex * t, qy = py - ey * t, d2 = qx * qx + qy * qy;
        if (d2 < dm) dm = d2;
        if ((ay > y) !== (by > y) && x < ax + ((y - ay) / (by - ay)) * ex) cross++;
      }
      SD[j * SW + i] = (cross & 1 ? -1 : 1) * Math.sqrt(dm);
    }
  }
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const k = j * SW + i;
    const xl = i > 0 ? SD[k - 1] : SD[k + 1], xr = i < SW - 1 ? SD[k + 1] : SD[k];   // mirror across the axis at i = 0
    GX[k] = i === 0 ? 0 : (xr - xl) * (i < SW - 1 ? 0.5 : 1);
    GY[k] = ((j < SH - 1 ? SD[k + SW] : SD[k]) - (j > 0 ? SD[k - SW] : SD[k])) * (j > 0 && j < SH - 1 ? 0.5 : 1);
  }
}
function stamp(T, x, y) {
  let fx = x, fy = y - SY_MIN;
  if (fx > SW - 1.001) fx = SW - 1.001;
  if (fy < 0) fy = 0; else if (fy > SH - 1.001) fy = SH - 1.001;
  const x0 = fx | 0, y0 = fy | 0; fx -= x0; fy -= y0;
  const k = y0 * SW + x0;
  const a = T[k], b = T[k + 1], c = T[k + SW], d = T[k + SW + 1];
  const top = a + (b - a) * fx;
  return top + (c + (d - c) * fx - top) * fy;
}

// ── one row of spades ──
function makeRow(env, seed, dR, shift, dim) {
  const a = env.arc, R = a.R + dR, dth = PITCH / a.R, r = L.rng(seed), rm = L.rng(seed + 'mouth');
  const coins = [];
  for (let k = -KO; k <= KO; k++) {
    const th = (k + 0.5 + shift) * dth + r.range(-0.001, 0.001);
    const tilt = th + r.range(-0.01, 0.01);
    const sc = r.range(0.982, 1.012), hs = r.range(0.87, 1.09);
    const c = {
      ax: a.cx + R * Math.sin(th), ay: a.cy - R * Math.cos(th),
      tx: Math.cos(tilt), ty: Math.sin(tilt), nx: -Math.sin(tilt), ny: Math.cos(tilt),
      sc, hs, bx: 172 * sc, by0: (TOP_Y * hs - 20) * sc, by1: (LB + 20) * sc,
      ox: r.range(0, 4000), oy: r.range(0, 4000), tone: r.range(0.92, 1.12) * dim, crust: r.range(-0.12, 0.1),
      chips: [], blobs: [],
      // on some spades the front wall of the socket has broken away at the mouth: the hollow shows, with casting core still packed inside
      mouth: rm.chance(0.62) ? { x: rm.range(-8, 8), w: rm.range(15, 27), d: rm.range(15, 34), clay: rm.range(0.35, 0.8) } : null,
    };
    // knocks: a broken corner on the handle mouth, a bite out of a side
    const nc = r.int(1, 3);
    for (let q = 0; q < nc; q++) {
      const kind = r();
      if (kind < 0.4) c.chips.push({ x: r.sign() * (TOP_X - r.range(0, 5)), y: TOP_Y + r.range(-2, 6), r: r.range(6, 13) });
      else if (kind < 0.62) c.chips.push({ x: r.sign() * r.range(46, 50), y: r.range(TOP_Y + 40, -20), r: r.range(4, 7) });
      else c.chips.push({ x: r.sign() * (HW - 4), y: r.range(110, 430), r: r.range(5, 10) });
    }
    // loess still clinging in patches
    const nb = r.chance(0.3) ? 0 : r.chance(0.55) ? 1 : 2;
    for (let q = 0; q < nb; q++) {
      const kind = r();
      if (kind < 0.62) c.blobs.push({ x: r.range(-104, 104), y: r.range(70, 400), rx: r.range(22, 52), ry: r.range(30, 84), k: r.range(0.52, 0.95) });
      else if (kind < 0.84) c.blobs.push({ x: r.sign() * r.range(62, 104), y: r.range(40, 86), rx: r.range(24, 40), ry: r.range(18, 30), k: r.range(0.55, 0.9) });
      else c.blobs.push({ x: r.range(-12, 12), y: r.range(TOP_Y * hs + 26, -40), rx: r.range(16, 24), ry: r.range(26, 52), k: r.range(0.6, 0.9) });
    }
    coins.push(c);
  }
  return coins;
}

let qy = 0;   // stamp-space y of the last coinSD() query
/** signed distance (px, < 0 inside) from frame-space local point (lx, ly) to spade c's edge, with casting waviness and knocks */
function coinSD(c, lx, ly) {
  const sx = lx / c.sc; let y = ly / c.sc;
  if (y < -12) y = -12 + (y + 12) / c.hs;      // handles differ in length
  qy = y;
  let sd = stamp(SD, sx < 0 ? -sx : sx, y) * c.sc;
  if (sd < 16 && sd > -16) {
    const u = lx + c.ox, v = ly + c.oy;
    sd += 3 * tex(TS, u * 0.5, v * 0.5) + 0.9 * tex(TF, u * 2.1 + 57, v * 2.1 + 133);
    const ch = c.chips;
    for (let q = 0; q < ch.length; q++) {
      const ex = sx - ch[q].x, ey = y - ch[q].y, dd = ch[q].r - Math.sqrt(ex * ex + ey * ey);
      if (dd > -6) { const d2 = dd + 2.4 * tex(TF, u * 3 + 9, v * 3 + 77); if (d2 > sd) sd = d2; }
    }
  }
  return sd;
}

// results of evalFrag()
let oH = 0, oR = 0, oG = 0, oB = 0, oM = 0, oRim = 0;
/** height + material of spade c at local (lx, ly); sd from coinSD, sy = stamp-space y */
function evalFrag(c, lx, ly, sd, sy) {
  const din = -sd, ax = Math.abs(lx) / c.sc;
  const u = lx + c.ox, v = ly + c.oy;
  const sN = tex(TS, u * 0.42, v * 0.42);
  const n1 = tex(TF, u, v), n2 = tex(TF, u * 3.3 + 311.3, v * 3.3 + 97.1), n3 = tex(TF, u * 8.7 + 71, v * 8.7 + 205);
  const nw = tex(TF, u * 1.6 + 523.7, v * 1.6 + 911.3);
  const cl = tex(TC, u, v), cl2 = tex(TC, u * 2.4 + 40.5, v * 2.4 + 11.5);

  // structure: the hollow handle is a faceted tube whose socket runs a little way into the blade as a wedge
  let hs = 0;
  if (sy < ROOT_Y + WEDGE) {
    let wv, amp;
    if (sy <= ROOT_Y) { wv = TOP_X + ((ROOT_X - TOP_X) * (sy - TOP_Y)) / (ROOT_Y - TOP_Y); amp = 1; }
    else { amp = 1 - (sy - ROOT_Y) / WEDGE; wv = ROOT_X * (0.22 + 0.78 * amp); }
    const uu = ax / wv;
    if (uu < 1) { const f = (1 - uu) / 0.58; hs += 20 * (f > 1 ? 1 : f * (1.15 - 0.15 * f)) * Math.pow(amp, 0.8); }   // flat front facet, two slanting side facets
  }
  // the three parallel raised lines of the type
  let ln = Math.exp(-((ax - LINE_X) * (ax - LINE_X)) / 7.5);
  if (sy > ROOT_Y + 56) ln += Math.exp(-(ax * ax) / 7.5) * sstep(ROOT_Y + 56, ROOT_Y + WEDGE, sy);
  hs += 2.7 * ln;
  // thin edge: a rounded arris with a faint raised rim just inside it
  hs += -2.6 * (1 - sstep(0, 3.4, din)) + 0.9 * Math.exp(-((din - 6.5) * (din - 6.5)) / 7);

  // corrosion crust: crisp-edged islands of thicker scale, warts in clusters, pits; smooth dark patina in between
  const big = tex(TS, u * 0.15 + 77.7, v * 0.15 + 303.1);
  const isl = sstep(0.0, 0.06, n1 * 0.8 + sN * 0.22 + n2 * 0.16 + big * 0.42 + c.crust);
  const wart = sstep(0.04, 0.3, nw + 0.25 * isl - 0.1);
  const grain = 1 - sstep(0.1, 0.72, cl), fine = 1 - sstep(0.1, 0.75, cl2);
  const pit = sstep(0.34, 0.6, -n2 * 0.85 - n3 * 0.4);
  const hc = 2.1 * isl + 1.8 * wart * grain + 0.36 * fine * (0.3 + 0.7 * wart) + 0.6 * n2 + 0.26 * n3 - 1.6 * pit;

  // loess patches
  let mf = 0;
  const bl = c.blobs;
  for (let q = 0; q < bl.length; q++) { const ex = (lx - bl[q].x) / bl[q].rx, ey = (ly - bl[q].y) / bl[q].ry; mf += bl[q].k * Math.exp(-(ex * ex + ey * ey)); }
  const mr = mf * (1 + 0.25 * ln) + 0.4 * sN + 0.2 * n2 + 0.12 * (cl - 0.4);
  const mud = sstep(0.5, 0.6, mr), stain = sstep(0.24, 0.5, mr) * (1 - mud);

  oH = hs * (1 - 0.55 * mud) + hc * (1 - mud) + mud * (1.5 + 0.7 * sN + 0.3 * n2 + 0.3 * n3 + 0.5 * fine);

  // patina colour: deep oxblood brown; the smooth low patina goes almost black, the scale islands run redder
  const low = (1 - isl) * (0.5 + 0.3 * sstep(-0.1, 0.3, -sN)) + 0.3 * isl * sstep(0.05, 0.4, -sN - n1 * 0.4);
  const red = isl * (0.2 + 0.8 * sstep(-0.1, 0.4, n2 * 0.7 + nw * 0.6)) * 0.5;
  let r = 58, g = 24, b = 19;
  r += (24 - r) * low; g += (8 - g) * low; b += (10 - b) * low;
  r += (124 - r) * red; g += (35 - g) * red; b += (22 - b) * red;
  const ex0 = (lx + 84) / 78, ey0 = (ly - 96) / 120, sheen = sy > ROOT_Y ? Math.exp(-(ex0 * ex0 + ey0 * ey0)) : 0;
  const xn = lx / (HW * 2) + 0.5;
  const tv = c.tone * (0.86 + 0.26 * (0.5 + n3) + 0.2 * wart * (grain - 0.35) - 0.3 * pit) * (1.2 - 0.46 * xn - 0.22 * xn * xn * xn + 0.3 * sheen);
  r *= tv; g *= tv; b *= tv;
  // a dusting of loess in the hollows, a stain round every patch
  const dust = (1 - isl) * sstep(0.1, 0.5, n2 * 0.6 + nw * 0.5 + 0.3 * sN) * 0.3 + 0.6 * stain;
  if (dust > 0) { r += (132 - r) * dust; g += (80 - g) * dust; b += (48 - b) * dust; }
  if (mud > 0) {
    const mv = (0.8 + 0.16 * sN + 0.14 * n3 + 0.1 * (fine - 0.5)) * (0.9 + 0.1 * c.tone);
    r += (204 * mv - r) * mud; g += (160 * mv - g) * mud; b += (98 * mv - b) * mud;
  }
  let mudOut = mud;
  const mo = c.mouth;
  if (mo !== null && sy < TOP_Y + mo.d + 10) {
    const q = (lx / c.sc - mo.x) / mo.w, top = sy - TOP_Y;
    const f = mo.d * (1 - q * q) - top + 3.5 * n2 + 1.5 * n3;          // > 0 inside the break
    if (f > 0) {
      const e = sstep(0, 2.6, f);
      const clay = sstep(-1.5, 1.5, top - mo.d * (1 - mo.clay) - 4 * sN - 2 * n2);   // the core fills the lower part of the opening
      const side = 0.5 + 0.5 * sstep(-0.7, 0.5, q);                    // the left wall shades the hollow
      const mv = (0.8 + 0.14 * n3 + 0.1 * (fine - 0.5)) * side;
      const ir = 17 * side + clay * (198 * mv - 17 * side), ig = 7 * side + clay * (152 * mv - 7 * side), ib = 7 * side + clay * (92 * mv - 7 * side);
      r += (ir - r) * e; g += (ig - g) * e; b += (ib - b) * e;
      oH += (-7 + 0.8 * n2 + clay * (2.4 + 0.8 * n3 + 0.7 * fine) - oH) * e;
      mudOut += (clay * 0.85 - mudOut) * e;
    }
  }
  oR = r; oG = g; oB = b; oM = mudOut;

  // which way does the nearest edge face? (for the copper thread on edges turned to the light)
  let gx = stamp(GX, ax, sy); const gy = stamp(GY, ax, sy); if (lx < 0) gx = -gx;
  const facing = -((gx * c.tx + gy * c.nx) * 0.64 + (gx * c.ty + gy * c.ny) * 0.77);
  oRim = facing > 0 ? (1 - sstep(1.0, 5.4, din)) * Math.pow(facing, 0.6) : 0;
}

/** rasterise both rows → { coins, rim, x0, y0 } (canvases cropped to the bronze, positioned at frame coords x0, y0) */
function buildCoins(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, dth = PITCH / R;
  const X0 = -PAD, Y0 = Math.floor(a.crestY + TOP_Y * 1.12 - 14), RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const front = makeRow(env, 's10front', 0, 0, 1), back = makeRow(env, 's10back', BACK_DR, 0.1, 1);
  const HMAX = -TOP_Y * 1.12 + 16;
  const Hh = new Float32Array(N), ID = new Int16Array(N), AA = new Float32Array(N), LM = new Float32Array(N);
  const CR = new Float32Array(N), CG = new Float32Array(N), CB = new Float32Array(N), MU = new Float32Array(N), RM = new Float32Array(N);
  const img = new ImageData(RW, RH), d8 = img.data;
  const rimImg = new ImageData(RW, RH), r8 = rimImg.data;
  const GR = 22, GG = 10, GB = 9;                      // the dark between and behind (#1A0C0A, a touch deeper)
  const LX = -0.64 * 17, LY = -0.77 * 17;              // offset toward the light, for the front row's shadow on the back row

  const minRowSD = (row, shift, fx, fy) => {
    const i0 = Math.round(Math.atan2(fx - cx, cy - fy) / dth - 0.5 - shift);
    let m = 99;
    for (let kk = i0 + 1; kk >= i0 - 1; kk--) {
      const c = row[kk + KO]; if (!c) continue;
      const ex = fx - c.ax, ey = fy - c.ay, lx = ex * c.tx + ey * c.ty, ly = ex * c.nx + ey * c.ny;
      if (lx > c.bx || lx < -c.bx || ly < c.by0 || ly > c.by1) continue;
      const sd = coinSD(c, lx, ly); if (sd < m) m = sd;
    }
    return m;
  };

  for (let j = 0; j < RH; j++) {
    const fy = Y0 + j, dy = cy - fy;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, fx = X0 + i, dx = fx - cx;
      const d = R - Math.sqrt(dx * dx + dy * dy);      // depth below the arc
      ID[k] = -1;
      if (d < -HMAX) continue;
      const th = Math.atan2(dx, dy);
      const depthF = (0.66 + 0.34 * sstep(-30, 210, d)) * (1 - 0.42 * sstep(230, 600, d)) * (1.07 - 0.15 * (fx < 0 ? 0 : fx > W ? 1 : fx / W));
      let nf = 0, a1 = 0, ur = 0, ug = 0, ub = 0, ua = 0, minFront = 99;
      // front row: each spade laps over its left neighbour, so test right to left
      {
        const i0 = Math.round(th / dth - 0.5);
        let above = 99;
        for (let kk = i0 + 1; kk >= i0 - 1; kk--) {
          const c = front[kk + KO]; if (!c) continue;
          const ex = fx - c.ax, ey = fy - c.ay, lx = ex * c.tx + ey * c.ty, ly = ex * c.nx + ey * c.ny;
          if (lx > c.bx || lx < -c.bx || ly < c.by0 || ly > c.by1) { above = 99; continue; }
          const sd = coinSD(c, lx, ly);
          if (sd < 0.5) {
            const cov = sd < -0.9 ? 1 : (0.5 - sd) / 1.4;
            evalFrag(c, lx, ly, sd, qy);
            if (nf === 0) {
              Hh[k] = oH; ID[k] = kk + KO; AA[k] = cov; CR[k] = oR; CG[k] = oG; CB[k] = oB; MU[k] = oM; RM[k] = oRim;
              LM[k] = depthF * (0.42 + 0.58 * sstep(0, 36, above));
              a1 = cov; nf = 1;
              if (cov >= 1) break;
            } else {
              const f = depthF * 0.55, w = cov * (1 - ua);
              ur += oR * f * w; ug += oG * f * w; ub += oB * f * w; ua += w; nf = 2;
              break;
            }
          } else if (sd < minFront) minFront = sd;
          above = sd;
        }
      }
      // back row, seen through the crotch arches of the front row, in its shadow
      if (d > 70 && (nf === 0 || (a1 < 1 && ua < 1))) {
        const i0 = Math.round(th / dth - 0.6);
        let above = 99;
        for (let kk = i0 + 1; kk >= i0 - 1; kk--) {
          const c = back[kk + KO]; if (!c) continue;
          const ex = fx - c.ax, ey = fy - c.ay, lx = ex * c.tx + ey * c.ty, ly = ex * c.nx + ey * c.ny;
          if (lx > c.bx || lx < -c.bx || ly < c.by0 || ly > c.by1) { above = 99; continue; }
          const sd = coinSD(c, lx, ly);
          if (sd < 0.5) {
            const cov = sd < -0.9 ? 1 : (0.5 - sd) / 1.4;
            evalFrag(c, lx, ly, sd, qy);
            if (nf === 0) {
              const lit = sstep(-5, 8, minRowSD(front, 0, fx + LX, fy + LY));
              Hh[k] = oH; ID[k] = 32 + kk + KO; AA[k] = cov; CR[k] = oR; CG[k] = oG; CB[k] = oB; MU[k] = oM; RM[k] = oRim * 0.5 * lit;
              LM[k] = depthF * 0.62 * (0.42 + 0.58 * lit) * (0.5 + 0.5 * sstep(0, 24, minFront)) * (0.55 + 0.45 * sstep(0, 15, above));
              a1 = cov; nf = 1;
              if (cov >= 1) break;
            } else {
              const f = depthF * 0.3, w = cov * (1 - ua);
              ur += oR * f * w; ug += oG * f * w; ub += oB * f * w; ua += w; nf = 2;
              break;
            }
          }
          above = sd;
        }
      }
      // the dark ground behind everything (never reaches up into the sky slits)
      if (d > 190 && ua < 1) {
        const w = sstep(190, 232, d) * (1 - ua), gv = 0.8 + 0.4 * tex(TF, fx * 0.7, fy * 0.7);
        ur += GR * gv * w; ug += GG * gv * w; ub += GB * gv * w; ua += w;
      }
      if (ua > 0) { const o = k * 4; d8[o] = ur / ua; d8[o + 1] = ug / ua; d8[o + 2] = ub / ua; d8[o + 3] = ua * 255; }
    }
  }

  // relief light from the upper left
  const AMB = 0.3, KEY = 0.87;
  for (let j = 0; j < RH; j++) {
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, id = ID[k];
      if (id < 0) continue;
      const o = k * 4, h = Hh[k];
      const l = i > 0 && ID[k - 1] === id, r = i < RW - 1 && ID[k + 1] === id;
      const up = j > 0 && ID[k - RW] === id, dn = j < RH - 1 && ID[k + RW] === id;
      const gx = l && r ? (Hh[k + 1] - Hh[k - 1]) * 0.5 : r ? Hh[k + 1] - h : l ? h - Hh[k - 1] : 0;
      const gy = up && dn ? (Hh[k + RW] - Hh[k - RW]) * 0.5 : dn ? Hh[k + RW] - h : up ? h - Hh[k - RW] : 0;
      const nl = (0.55 * gx + 0.66 * gy + 0.51) / Math.sqrt(1 + gx * gx + gy * gy);
      const s = nl > 0 ? nl / 0.51 : 0;
      const mud = MU[k], lm = LM[k], rim = RM[k];
      let b = s < 1 ? AMB + (0.74 - AMB) * s : 0.74 + (s - 1) * 0.82; b += (0.74 + 0.34 * s - b) * mud;
      const sp = s > 1.4 ? (s - 1.4) * (1 - mud) : 0;
      const grit = 0.93 + 0.14 * hash2(i, j);
      let cr = (CR[k] * b + 120 * sp) * lm * grit * KEY + 214 * rim * (0.62 + 0.38 * lm);
      let cg = (CG[k] * b + 48 * sp) * lm * grit * KEY + 84 * rim * (0.62 + 0.38 * lm);
      let cb = (CB[k] * b + 32 * sp) * lm * grit * KEY + 50 * rim * (0.62 + 0.38 * lm);
      const a1 = AA[k], ua = (d8[o + 3] / 255) * (1 - a1), oa = a1 + ua;
      d8[o] = (cr * a1 + d8[o] * ua) / oa; d8[o + 1] = (cg * a1 + d8[o + 1] * ua) / oa; d8[o + 2] = (cb * a1 + d8[o + 2] * ua) / oa; d8[o + 3] = oa * 255;
      // the extra rim light that drifts along the row in draw()
      const ddx = X0 + i - cx, ddy = cy - (Y0 + j);
      const ra = (rim * 0.9 + sp * 0.5) * a1 * (id < 32 ? 1 : 0.35) * (1 - 0.8 * sstep(250, 470, R - Math.sqrt(ddx * ddx + ddy * ddy)));
      if (ra > 0.01) { r8[o] = 255; r8[o + 1] = 150; r8[o + 2] = 104; r8[o + 3] = Math.min(255, ra * 255); }
    }
  }
  const coins = L.makeCanvas(RW, RH), rimC = L.makeCanvas(RW, RH);
  const cg2 = coins.getContext('2d'), rg = rimC.getContext('2d');
  cg2.putImageData(img, 0, 0);
  rg.putImageData(rimImg, 0, 0);
  // shallow depth of field: focus sits on the shoulder line, the blades soften toward the bottom of frame
  for (const [px, r0, r1] of [[2.2, 250, 400], [5, 400, 580]]) {
    const soft = L.blurred(coins, px), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.radial(sg, cx - X0, cy - Y0, R - r1, R - r0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    sg.fillRect(0, 0, RW, RH);
    cg2.globalCompositeOperation = 'source-atop';
    cg2.drawImage(soft, 0, 0);
  }
  // a little bloom round the lit edges (kept on the bronze, so the sky stays clean)
  const glowC = L.blurred(rimC, 5);
  cg2.globalCompositeOperation = 'source-atop'; cg2.globalAlpha = 0.3;
  cg2.drawImage(glowC, 0, 0);
  rg.globalCompositeOperation = 'lighter'; rg.globalAlpha = 0.5;
  rg.drawImage(glowC, 0, 0);
  rg.globalCompositeOperation = 'destination-in'; rg.globalAlpha = 1;
  rg.drawImage(coins, 0, 0);
  return { coins, rim: rimC, x0: X0, y0: Y0 };
}

/** the sky: one flat field of cyan, with only a breath of unevenness and grain */
function buildSky() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#1E9DB5'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.06;
  g.drawImage(L.noiseTex(W, H, { seed: 's10sky', scale: 760, octaves: 3, res: 0.125 }), 0, 0);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(W, H, { seed: 's10g', amount: 0.09 }), 0, 0);
  return c;
}

export default {
  name: '布币列阵',
  tone: 'light',
  init(env) {
    buildTiles();
    buildStamp();
    const b = buildCoins(env);
    const tmp = L.makeCanvas(W, H);
    S = { sky: buildSky(), ...b, tmp, tg: tmp.getContext('2d') };
    SD = GX = GY = TF = TS = TC = null;   // the tables are only needed while rasterising
  },
  draw(ctx, env, p) {
    // the whole row slides about 2° round the circle centre; a whisper of push-in
    const view = { rot: L.lerp(-0.0175, 0.0175, p), zoom: L.lerp(1.0, 1.008, p) };
    ctx.drawImage(S.sky, 0, 0);
    L.cam(ctx, env, view, () => ctx.drawImage(S.coins, S.x0, S.y0));
    // the lit edges brighten where the light catches them; that band wanders along the row as it turns
    const tg = S.tg;
    tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, W, H);
    L.cam(tg, env, view, () => tg.drawImage(S.rim, S.x0, S.y0));
    const xc = L.lerp(520, 1000, p), hw = 640;
    tg.globalCompositeOperation = 'destination-in';
    tg.fillStyle = L.linear(tg, xc - hw, 0, xc + hw, 0, [[0, 'rgba(0,0,0,0.14)'], [0.3, 'rgba(0,0,0,0.5)'], [0.5, 'rgba(0,0,0,1)'], [0.7, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0.14)']]);
    tg.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.8;
    ctx.drawImage(S.tmp, 0, 0);
    ctx.restore();
  },
};
