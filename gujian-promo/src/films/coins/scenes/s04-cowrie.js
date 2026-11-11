// s04 — 戥盘碎银. Macro, straight down into the shallow brass pan of a 戥子 (the little steelyard silver was weighed on):
// the arc is the pan's rolled lip. Above it a clean pale grey-blue ground with the lip's soft shadow; below it the satin
// old brass of the pan — concentric turning lines, a faint planished unevenness, hairline scratches, brown patina in the
// corner under the lip and two small crusts of verdigris — with five pieces of cut silver lying in it, each with its own
// contact shadow. Two red silk cords run from their holes under the lip, over it, and up out of frame.
//
// Light comes from the upper left. Everything metal is shaded per pixel in init():
//   pan    — a dished surface (the far wall under the lip turns from the light and lies in the lip's shadow), its lathe
//            lines a function of the radius only, so they stay concentric with the arc;
//   lip    — a rolled bead: dark outer flank exactly on the arc, a thread of specular light on its crown, a dark groove
//            where the roll meets the wall;
//   silver — each piece is a small faceted height field (planes cut by a chisel, a slightly domed cast top) with matte
//            cast skin, mirror-bright cut faces, silk lines, grey tarnish, and a shadow marched toward the light.
// draw() pushes the pan in a breath (zoom 1 → 1.02) while the lip stays on the true arc, and slides the highlight — the
// hot stretch of the lip's specular thread and the radial sheen it throws across the turning lines — along the rim.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 40;                 // the shot only pushes in; the margin covers the hair of rotation
const RW = 32;                  // plan width of the rolled lip (its outer edge is the arc)
const TH0 = -0.17;              // where the travelling highlight sits on the rim at slide = 0 (theta, rad)
const HOLE_TH = [-0.262, 0.277], HOLE_D = RW + 22;   // the two cord holes, just under the lip
let S = null;

const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const sq = (v) => v * v;
const unit = (x, y, z) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; };

const [LX, LY, LZ] = unit(-0.5, -0.62, 0.6);          // key light: upper left
const [HX, HY, HZ] = unit(LX, LY, LZ + 1);            // its half vector (viewer straight above)
const SDN = Math.hypot(LX, LY), SDX = -LX / SDN, SDY = -LY / SDN;   // the way shadows fall across the pan
const SLOPE = LZ / SDN;                                // a ray toward the light climbs this much per px

/** piecewise-linear RGB table: stops [[t,[r,g,b]],…] → Float32Array(n*3) */
function lut3(stops, n = 256) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const t0 = stops[k][0], c0 = stops[k][1], t1 = stops[k + 1][0], c1 = stops[k + 1][1], u = cl((t - t0) / (t1 - t0 || 1));
    for (let c = 0; c < 3; c++) out[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * u;
  }
  return out;
}
let oR = 0, oG = 0, oB = 0;
/** interpolated lookup: t ∈ [0,1] → oR, oG, oB */
function look(T, t) {
  const f = (t < 0 ? 0 : t > 1 ? 1 : t) * 255, i = f | 0, u = f - i, k = i * 3, m = i < 255 ? k + 3 : k;
  oR = T[k] + (T[m] - T[k]) * u; oG = T[k + 1] + (T[m + 1] - T[k + 1]) * u; oB = T[k + 2] + (T[m + 2] - T[k + 2]) * u;
}

// old brass, cool and pale: brown-black in the hollows → khaki yellow → pale straw → warm white
const BR_MAX = 1.4;
const BR = lut3([[0, [34, 27, 15]], [0.14, [82, 66, 34]], [0.29, [140, 121, 68]], [0.39, [178, 160, 98]], [0.5, [206, 191, 130]],
  [0.61, [226, 214, 164]], [0.71, [240, 233, 200]], [0.86, [251, 248, 232]], [1, [255, 254, 247]]]);
// silver: neutral, a breath cool
const SV_MAX = 1.3;
const SV = lut3([[0, [20, 20, 24]], [0.15, [62, 64, 70]], [0.35, [124, 128, 134]], [0.54, [184, 188, 192]], [0.69, [224, 227, 229]],
  [0.81, [246, 247, 247]], [1, [255, 255, 255]]]);
// red silk
const RD_MAX = 1.25;
const RD = lut3([[0, [50, 8, 12]], [0.3, [120, 16, 22]], [0.55, [178, 30, 34]], [0.78, [214, 58, 50]], [0.92, [238, 112, 92]], [1, [255, 196, 176]]]);

/** keep only the part of an ImageData that has any alpha → {cnv, x, y} in frame coordinates */
function cropLayer(img, X0, Y0) {
  const w = img.width, h = img.height, d = img.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let j = 0; j < h; j++) {
    let o = j * w * 4 + 3;
    for (let i = 0; i < w; i++, o += 4) if (d[o]) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  }
  if (x1 < 0) return { cnv: L.makeCanvas(1, 1), x: X0, y: Y0 };
  const c = L.makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  c.getContext('2d').putImageData(img, -x0, -y0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  return { cnv: c, x: X0 + x0, y: Y0 + y0 };
}

/** depth of field: cross-fade a layer into a blurred copy of itself away from the focus (near the crest) */
function dofMix(layer, px) {
  const c = layer.cnv, b = L.blurred(c, px);
  const mask = (g) => {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(960 - layer.x, 620 - layer.y); g.scale(1, 1 / 1.75);
    g.fillStyle = L.radial(g, 0, 0, 620, 1100, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(-5000, -5000, 10000, 10000);
    g.restore();
  };
  const bg = b.getContext('2d');
  bg.globalCompositeOperation = 'destination-in'; mask(bg);
  const g = c.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out'; mask(g);
  g.globalCompositeOperation = 'lighter'; g.drawImage(b, 0, 0);
  g.restore();
  return layer;
}

// ───────────────────────── the pan ─────────────────────────
// verdigris: one crust tucked into the corner under the lip, one small spot further left (theta, depth, half-sizes along / across)
const VG = [{ th: 0.2, d: RW + 20, a: 30, b: 10.5, s: 3.1 }, { th: -0.365, d: RW + 74, a: 9, b: 7.5, s: 8.7 }];

function buildPan(env, holes) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) + RW - 12;
  const PW = W + PAD * 2, PH = H + PAD - Y0;
  const nA = L.makeNoise('s04panA'), nB = L.makeNoise('s04panB'), nC = L.makeNoise('s04panC');

  // slow fields on a coarse grid: planishing unevenness (lit as relief), patina, a broad drift of tone
  const CS = 4, cw = Math.ceil(PW / CS) + 4, ch = Math.ceil(PH / CS) + 4;
  const gH = new Float32Array(cw * ch), gLit = new Float32Array(cw * ch), gPat = new Float32Array(cw * ch), gTone = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + (i - 1) * CS, y = Y0 + (j - 1) * CS, ddx = x - cx, ddy = cy - y, rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, d = R - rr, k = j * cw + i;
    gH[k] = nA.fbm(U / 210, d / 210, 2, 2, 0.5);
    gPat[k] = nB.fbm(U / 560 + 40, d / 200 - 13, 2, 2, 0.5);
    gTone[k] = nC.fbm(U / 900 + 5, d / 420, 2, 2, 0.5);
  }
  for (let j = 1; j < ch - 1; j++) for (let i = 1; i < cw - 1; i++) {
    const k = j * cw + i;
    gLit[k] = (-((gH[k + 1] - gH[k - 1]) * LX + (gH[k + cw] - gH[k - cw]) * LY) / (2 * CS)) * 2.6;
  }
  const bil = (src, i, j) => {
    const fx = i / CS + 1, fy = j / CS + 1, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // a handful of distinct turning grooves, irregularly spaced: a dark thread with a lit lower lip (profile over depth, ¼ px steps)
  const GN = 3600, gv = new Float32Array(GN + 8), rg = L.rng('s04grooves');
  for (let gd = RW + 30; gd < 880;) {
    const wd = rg.range(0.95, 1.7), stg = rg.range(0.35, 1) * (rg.chance(0.2) ? 1.6 : 1);
    for (let q = Math.max(0, Math.floor((gd - 9) * 4)); q < Math.min(GN, (gd + 9) * 4); q++) {
      const dq = q / 4 - gd;
      gv[q] += stg * (-Math.exp(-sq(dq / wd)) + 0.55 * Math.exp(-sq((dq - wd * 1.7) / (wd * 1.15))));
    }
    gd += rg.range(9, 46) * (rg.chance(0.25) ? 0.35 : 1);
  }

  const img = new ImageData(PW, PH), px = img.data;
  const fim = new ImageData(PW, PH), fp = fim.data;
  for (let j = 0; j < PH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < PW; i++) {
      const x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < RW - 12) continue;
      const st = ddx / rr, ct = ddy / rr, th = Math.asin(st), U = th * R, di = d > RW ? d - RW : 0;
      // the dish: steepest just under the lip, easing toward the middle; its normal leans toward the centre of the pan
      const k = 0.2 + 0.27 * Math.exp(-di / 170), diff = (-k * st * LX + k * ct * LY + LZ) / Math.sqrt(1 + k * k);
      let v = 0.22 + 0.86 * diff + 0.11 * Math.exp(-sq((th - TH0 - 0.03) / 0.34)) * sstep(10, 200, di);   // … and a broad lift on the lamp's side
      // the lip's own shadow lies on the wall beneath it — widest where the lip stands between wall and light
      const dotIn = -st * SDX + ct * SDY, wsh = 10 + 62 * (dotIn > 0.1 ? dotIn : 0.1);
      const shR = 0.5 + 0.5 * sstep(0.22 * wsh, wsh, di), ao = 1 - 0.35 * Math.exp(-di / 14);
      // turning lines: three scales, hundreds of px long, plus the distinct grooves
      const l1 = nA.n2(U / 800 + 3.3, d / 2.1), l2 = nB.n2(U / 1500 - 7.1, d / 4.7 + 11.2), l3 = nC.n2(U / 2600 + 21.4, d / 15 + 5.3);
      const gq = d * 4, gi = gq | 0;
      const gr = (gv[gi] + (gv[gi + 1] - gv[gi]) * (gq - gi)) * (0.55 + 0.45 * nB.n2(U / 380 + 91, d / 60 + 17));
      const hb = bil(gLit, i, j), hh = bil(gH, i, j), p0 = bil(gPat, i, j), tn = bil(gTone, i, j);
      // patina: brown in the low places of the sheet and packed into the corner under the lip
      let pat = 0.26 * sstep(0.1, 0.85, p0 + 0.25 * sstep(0.1, -0.9, hh)) + 0.5 * Math.exp(-di / 26); if (pat > 1) pat = 1;
      v = (v * (1 + 0.1 * l1 + 0.085 * l2 + 0.06 * l3 + 0.04 * tn) + hb + 0.11 * gr) * shR * ao * (1 - 0.24 * pat);
      v *= 1 - 0.14 * sstep(330, 640, d);                    // the light falls away toward the middle of the pan
      // a second, cooler fan of sheen far right (the window behind the camera), fixed
      const f2 = Math.exp(-sq((th - 0.44) / 0.1)) * sstep(20, 220, di) * 0.08 * (1 + 1.2 * l1 + 1.2 * l2) * (1 - 0.6 * pat);
      v += f2;
      // the cord holes: a raised burr round each, the far wall of the hole catching light
      let hole = 0, lip = 0;
      for (let q = 0; q < holes.length; q++) {
        const hx = x - holes[q].x, hy = y - holes[q].y;
        if (hx > -18 && hx < 18 && hy > -18 && hy < 18) {
          const qd = Math.sqrt(hx * hx + hy * hy) + 1e-3, lit = -(hx * SDX + hy * SDY) / qd;
          v += 0.2 * Math.exp(-sq((qd - 10.6) / 1.6)) * lit * shR;
          hole = cl((8.4 - qd) / 1.2 + 0.5); lip = hole * sstep(4.5, 7.8, qd) * cl(-lit) * 0.5;
        }
      }
      look(BR, v / BR_MAX);
      let r = oR * (1 - 0.05 * pat), g = oG * (1 - 0.13 * pat), b = oB * (1 - 0.28 * pat) + f2 * 60;
      // verdigris: a matte mineral crust with a brown stain round it
      let vgc = 0;
      for (let q = 0; q < VG.length; q++) {
        const vq = VG[q], du = U - vq.th * R, dv = d - vq.d;
        if (du > -vq.a * 2.6 && du < vq.a * 2.6 && dv > -vq.b * 2.6 && dv < vq.b * 2.6) {
          let e = Math.sqrt(sq(du / vq.a) + sq(dv / vq.b));
          e *= 1 + 0.17 * nA.n2(du / 19 + vq.s, dv / 19) + 0.06 * nB.n2(du / 6 + vq.s, dv / 6);
          const halo = 1 - sstep(0.9, 2.2, e);
          r *= 1 - 0.2 * halo; g *= 1 - 0.25 * halo; b *= 1 - 0.34 * halo;
          const c = cl(((1 - e) * Math.min(vq.a, vq.b)) / 1.4 + 0.5);
          if (c > 0) {
            const core = sstep(0.95, 0.25, e) * (0.5 + 0.5 * nC.n2(du / 7 + 3 * vq.s, dv / 7)), lt = 0.5 + 0.5 * shR;
            r += ((78 + 64 * core) * lt - r) * c * 0.94; g += ((132 + 56 * core) * lt - g) * c * 0.94; b += ((112 + 56 * core) * lt - b) * c * 0.94;
            if (c > vgc) vgc = c;
          }
        }
      }
      if (hole > 0) { r += (20 + 130 * lip - r) * hole; g += (13 + 108 * lip - g) * hole; b += (7 + 62 * lip - b) * hole; }
      const o = (j * PW + i) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;

      // how this pixel answers the travelling light: a radial fan of sheen, alive in the turning lines, dead in the patina
      const dth = th - TH0, wth = Math.exp(-sq(dth / 0.04)) + 0.55 * Math.exp(-sq(dth / 0.13));
      if (wth > 0.004) {
        const rp = sstep(2, 150, di) * (0.5 + 0.5 * sstep(60, 520, d)) * (2 * shR - 1);
        const resp = L.clamp(0.6 + 0.8 * l1 + 0.7 * l2 + 0.4 * l3 + 0.5 * gr, 0.1, 1.8);
        const fa = 0.64 * wth * rp * resp * (1 - 0.7 * pat) * (1 - vgc) * (1 - hole);
        if (fa > 0.003) { fp[o] = 255; fp[o + 1] = 247; fp[o + 2] = 222; fp[o + 3] = cl(fa) * 255; }
      }
    }
  }
  const cnv = L.makeCanvas(PW, PH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);

  // hairline scratches of use: any direction, each a pale line with a dark side
  g.save(); g.translate(-X0, -Y0); g.lineCap = 'round';
  const rs = L.rng('s04scratch');
  for (let n = 0; n < 96; n++) {
    const sx = rs.range(-PAD, W + PAD), sy = rs.range(a.yAt(L.clamp(sx, 0, W)) + RW + 78, H + PAD);
    const ang = rs.range(0, Math.PI), len = rs.range(28, 210) * (rs.chance(0.12) ? 1.9 : 1);
    const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
    const alp = rs.range(0.07, 0.25), lw = rs.range(0.9, 1.45), bend = rs.range(-9, 9);
    const run = (dy, style) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); g.moveTo(sx, sy + dy); g.quadraticCurveTo((sx + ex) / 2 + bend * 0.4, (sy + ey) / 2 + bend + dy, ex, ey + dy); g.stroke(); };
    run(0.95, `rgba(58,40,16,${alp * 0.85})`); run(0, `rgba(255,247,218,${alp})`);
  }
  g.restore();
  return { pan: dofMix({ cnv, x: X0, y: Y0 }, 2.8), fan: cropLayer(fim, X0, Y0) };
}

// ───────────────────────── the rolled lip ─────────────────────────
function buildRim(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const OUT = 150, INN = RW + 15, HINN = RW + 60;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - OUT - 2;
  const RWd = W + PAD * 2, edge = a.yAt(-PAD), RHt = Math.ceil(edge + (HINN * R) / (cy - edge) + 4) - Y0;
  const nA = L.makeNoise('s04rimA'), nB = L.makeNoise('s04rimB'), nC = L.makeNoise('s04rimC');

  // along the rim: the thread of light wanders a little and is pinched by small knocks; the roll is not quite even in width
  const NU = 2900, U0 = 1450, sW = new Float32Array(NU), bM = new Float32Array(NU), rM = new Float32Array(NU);
  const rd = L.rng('s04dings'), dings = [];
  for (let n = 0; n < 9; n++) dings.push({ u: rd.range(-1040, 1040), w: rd.range(4, 11), a: rd.range(-0.3, 0.3), k: rd.range(0.25, 0.6) });
  for (let q = 0; q < NU; q++) {
    const U = q - U0;
    let sw = 0.045 * nA.n2(U / 230, 0.7) + 0.02 * nA.n2(U / 37, 5.1), bm = 0.8 + 0.2 * nB.n2(U / 120, 4.1) + 0.08 * nB.n2(U / 21, 2.2);
    for (const dg of dings) { const gq = Math.exp(-sq((U - dg.u) / dg.w)); sw += dg.a * gq; bm *= 1 - dg.k * gq; }
    sW[q] = sw; bM[q] = bm; rM[q] = RW * (1 + 0.03 * nC.n2(U / 480, 9.3));
  }

  const img = new ImageData(RWd, RHt), px = img.data;
  const him = new ImageData(RWd, RHt), hp = him.data;
  for (let j = 0; j < RHt; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RWd; i++) {
      const x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -OUT || d > HINN) continue;
      const st = ddx / rr, ct = ddy / rr, th = Math.asin(st), U = th * R;
      const uq = L.clamp(U + U0, 0, NU - 2), ui = uq | 0, uf = uq - ui;
      const sw = sW[ui] + (sW[ui + 1] - sW[ui]) * uf, bm = bM[ui] + (bM[ui + 1] - bM[ui]) * uf, rw = rM[ui] + (rM[ui + 1] - rM[ui]) * uf;
      // where on the roll the light sits: toward the outer shoulder, further out on the left where the roll faces the lamp
      const Hr = HX * st - HY * ct, sStar = -Hr / Math.sqrt(Hr * Hr + HZ * HZ) - 0.08 + sw;
      const s = (d - rw / 2) / (rw / 2), o = (j * RWd + i) * 4;

      if (d <= INN) {
        const covO = cl(d + 0.5);
        // the shadow the lip lays on the ground outside it: a tight dark seat, a soft wide penumbra, fuller on the right
        let sa = 0, sr = 0, sg = 0, sb = 0;
        if (covO < 1) {
          const e = d < 0 ? -d : 0, wm = Math.exp(-e / 9);
          sa = (0.34 * Math.exp(-e / 6) + 0.18 * Math.exp(-e / 30) + 0.07 * Math.exp(-e / 90)) * (0.8 + 0.3 * sstep(-0.45, 0.5, st)) * (1 - sstep(100, 148, e));
          sr = 58 + 26 * wm; sg = 68 + 2 * wm; sb = 86 - 28 * wm;
        }
        let r = 0, g = 0, b = 0, al = 0;
        if (covO > 0) {
          const sc = s < -1 ? -1 : s > 1 ? 1 : s;
          // what the bead mirrors: shadowed ground on its outer flank, the lamp and ceiling on its crown, the pan on its inner flank
          let ev = 0.13 + 0.5 * sstep(-1.0, -0.5, sc) - 0.4 * sstep(0.05, 0.95, sc) + 0.07 * Math.exp(-sq((sc - 0.6) / 0.13));
          ev *= 0.9 + 0.18 * sstep(0.5, -0.5, st);
          const pl = 0.05 * nA.n2(U / 420 + 2, d / 1.9 + 40) + 0.04 * nB.n2(U / 900 + 5, d / 4.2 + 3);
          const tn = sstep(0.25, 0.8, nC.fbm(U / 75, d / 20, 2, 2, 0.5)) * 0.24 * sstep(-0.3, 0.6, sc);
          const core = Math.exp(-sq((s - sStar) / 0.12)), glow = Math.exp(-sq((s - sStar) / 0.34));
          const bl = (0.64 + 0.26 * sstep(0.35, -0.5, st)) * bm;
          let v = ev * (1 + pl) * (1 - tn) + bl * (0.85 * core + 0.3 * glow);
          // past the roll: the groove where it meets the wall, packed dark, then out into the wall's shadow
          const gt = d - rw, wg = sstep(-1.5, 1.5, gt);
          if (wg > 0) v += (0.055 + 0.12 * sstep(3.5, 11, gt) - v) * wg;
          look(BR, v / BR_MAX);
          r = oR; g = oG; b = oB; al = 1 - sstep(RW + 7, RW + 14, d);
        }
        if (covO >= 1) { px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = al * 255; }
        else {
          const A = sa + (1 - sa) * covO;
          if (A > 0.002) {
            px[o] = (sr * sa * (1 - covO) + r * covO) / A; px[o + 1] = (sg * sa * (1 - covO) + g * covO) / A; px[o + 2] = (sb * sa * (1 - covO) + b * covO) / A;
            px[o + 3] = A * 255;
          }
        }
      }

      // the hot stretch of the highlight (slides along the rim in draw): a wider, whiter core, its glow, a little bloom
      if (d > -80) {
        const dth = th - TH0, wth = Math.exp(-sq(dth / 0.07)) + 0.25 * Math.exp(-sq(dth / 0.2));
        if (wth > 0.003) {
          const dS = (rw / 2) * (1 + sStar);
          let ha = 0.33 * Math.min(1, wth) * wth * Math.exp(-sq((d - dS) / 26));
          if (d > -6 && d < rw + 6) ha += wth * (0.95 * Math.exp(-sq((s - sStar) / 0.17)) * cl(d + 0.5) + 0.4 * Math.exp(-sq((s - sStar) / 0.4)));
          if (ha > 0.003) { hp[o] = 255; hp[o + 1] = 251; hp[o + 2] = 236; hp[o + 3] = cl(ha) * 255; }
        }
      }
    }
  }
  const cnv = L.makeCanvas(RWd, RHt);
  cnv.getContext('2d').putImageData(img, 0, 0);
  return { rim: dofMix({ cnv, x: X0, y: Y0 }, 2.6), hot: cropLayer(him, X0, Y0) };
}

// ───────────────────────── the silver ─────────────────────────
// each piece: centre, turn, height of its top, tilt and doming of the top, and its faces as [direction° of the outward
// normal, distance of the face's foot from the centre, slope, 1 = fresh chisel cut / 0 = cast skin, height the face starts at]
const PIECES = [
  { x: 1000, y: 778, rot: 0.0, h: 48, tx: 0.04, ty: 0.05, dome: 0.0005, und: 2.0, sd: 11.3, silk: 0.5, ox: 0.9, k: 9,
    e: [[-128, 82, 2.0, 0], [-128, 72, 0.62, 1, 15], [-70, 70, 1.8, 0], [-15, 100, 1.5, 0], [35, 96, 2.8, 1], [80, 70, 1.2, 0], [125, 78, 1.8, 0], [175, 98, 2.0, 0], [-165, 94, 0.9, 1, 12]] },
  { x: 655, y: 805, rot: -0.25, h: 38, tx: 0.03, ty: 0.04, dome: 0.0007, und: 1.8, sd: 27.9, silk: -0.7, ox: 1.0, k: 8,
    e: [[-140, 62, 2.0, 0], [-140, 54, 0.6, 1, 10], [-85, 50, 1.6, 0], [-30, 72, 1.4, 0], [35, 66, 3.0, 1], [95, 56, 1.3, 0], [150, 70, 1.8, 0], [-170, 74, 2.0, 0]] },
  { x: 1268, y: 735, rot: 0.5, h: 26, tx: 0.04, ty: 0.03, dome: 0.001, und: 1.3, sd: 43.1, silk: 1.2, ox: 0.75, k: 6,
    e: [[-130, 40, 1.6, 0], [-130, 36, 0.62, 1, 8], [-50, 38, 1.4, 0], [15, 48, 2.0, 1], [80, 38, 1.1, 0], [150, 46, 1.6, 0]] },
  { x: 1392, y: 902, rot: -0.45, h: 30, tx: 0.02, ty: 0.05, dome: 0.0004, und: 1.5, sd: 61.7, silk: 0.1, ox: 0.85, k: 7,
    e: [[-90, 40, 2.2, 0], [-90, 35, 0.75, 1, 9], [0, 92, 1.6, 1], [58, 70, 2.0, 0], [90, 40, 1.6, 0], [180, 88, 1.4, 0], [-145, 80, 1.8, 0]] },
  { x: 840, y: 962, rot: 0.2, h: 20, tx: 0.03, ty: 0.03, dome: 0.001, und: 1.0, sd: 83.3, silk: -0.3, ox: 0.7, k: 5,
    e: [[-140, 34, 1.5, 0], [-140, 30, 0.55, 1, 6], [-60, 36, 1.8, 1], [10, 40, 1.3, 0], [85, 32, 1.5, 0], [160, 38, 1.4, 0]] },
];
let gScore = 0;                 // set by shade(): how good a place this pixel is for a glint (a lit arris of a cut)
const NT = 25, TS = new Float32Array(NT), PEN = new Float32Array(NT);
for (let k = 0; k < NT; k++) { TS[k] = 1.2 * Math.pow(1.2, k); PEN[k] = 0.8 + 0.1 * TS[k]; }

function makePiece(P, nS, nO) {
  const E = P.e.map(([ang, r, s, cut, lift = 0]) => { const t = (ang * Math.PI) / 180 + P.rot; return { ex: Math.cos(t), ey: Math.sin(t), r, s, cut, lift, k: cut ? 3.5 : P.k }; });
  const n = E.length;
  let i1 = 0, i2 = 0, h1 = 0, h2 = 0;
  let rad = 0; for (const e of E) if (!e.lift && e.r > rad) rad = e.r;
  rad *= 1.36;
  /** smooth height at (x, y): the lowest of the top and all the faces — cast skin rolls over into its neighbours, a cut keeps a crisp arris */
  const hgt = (x, y) => {
    const qx = x - P.x, qy = y - P.y;
    let h = P.h + P.tx * qx + P.ty * qy - P.dome * (qx * qx + qy * qy) + P.und * nS.n2(qx / 55 + P.sd, qy / 55 - P.sd);
    h1 = h; i1 = n; h2 = 1e9; i2 = n;
    for (let i = 0; i < n; i++) {
      const e = E[i], hi = e.lift + e.s * (e.r - qx * e.ex - qy * e.ey);
      if (hi < h1) { h2 = h1; i2 = i1; h1 = hi; i1 = i; } else if (hi < h2) { h2 = hi; i2 = i; }
      const dd = h > hi ? h - hi : hi - h, lo = h < hi ? h : hi;
      h = dd >= e.k ? lo : lo - sq(e.k - dd) / (4 * e.k);
    }
    return h;
  };
  const hard = (x, y) => {
    const qx = x - P.x, qy = y - P.y;
    let h = P.h + P.tx * qx + P.ty * qy - P.dome * (qx * qx + qy * qy);
    for (let i = 0; i < n; i++) { const e = E[i], hi = e.lift + e.s * (e.r - qx * e.ex - qy * e.ey); if (hi < h) h = hi; }
    return h;
  };
  /** px outside the footprint (≤ 0 inside) */
  const outside = (x, y) => {
    const qx = x - P.x, qy = y - P.y; let m = -1e9;
    for (let i = 0; i < n; i++) { const e = E[i]; if (e.lift) continue; const v = qx * e.ex + qy * e.ey - e.r; if (v > m) m = v; }
    return m;
  };
  const cf = Math.cos(P.silk), sf = Math.sin(P.silk);
  /** shade one pixel → coverage; colour in out[0..2] */
  const shade = (x, y, out) => {
    const h = hgt(x, y);
    if (h < -4) return 0;
    const a1 = i1, a2 = i2, d12 = h2 - h1, e = 0.6;
    const hx = (hgt(x + e, y) - hgt(x - e, y)) / (2 * e), hy = (hgt(x, y + e) - hgt(x, y - e)) / (2 * e);
    const cov = cl(h / (Math.hypot(hx, hy) + 0.05) / 1.15 + 0.5);
    if (cov <= 0) return 0;
    const qx = x - P.x, qy = y - P.y;
    const ridge = 1 - sstep(0, 3.2, d12), w2 = 0.5 * ridge;   // across an arris the two faces share the pixel
    const c1 = a1 < n ? E[a1].cut : 0, c2 = a2 < n ? E[a2].cut : 0, t1 = a1 === n ? 1 : 0, t2 = a2 === n ? 1 : 0;
    const cut = c1 + (c2 - c1) * w2, tp = t1 + (t2 - t1) * w2, skin = 1 - cut;
    // micro relief: orange-peel of the cast skin, silk lines across the top, drag lines down each cut
    let mx = 0.025 * skin * nS.n2(x / 5.2 + P.sd, y / 5.2), my = 0.025 * skin * nS.n2(x / 5.2 - 31.7, y / 5.2 + P.sd);
    if (tp > 0.01) {
      const cu = qx * cf + qy * sf + 2 * nS.n2(qx / 80 + P.sd, qy / 80 + 3), cv = -qx * sf + qy * cf;
      const sl = nS.n2(cu / 2.4 + 9, cv / 70 + P.sd) * 0.045 * tp; mx += sl * cf; my += sl * sf;
    }
    if (cut > 0.01 && a1 < n) {
      const e1 = E[a1], tc = -qx * e1.ey + qy * e1.ex, dn = qx * e1.ex + qy * e1.ey;
      const sl = nS.n2(tc / 1.7 + P.sd, dn / 46 + 5) * 0.07 * cut; mx -= sl * e1.ey; my += sl * e1.ex;
    }
    let nx = -hx - mx, ny = -hy - my; const nz = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= nz; ny *= nz;
    const ndl = nx * LX + ny * LY + nz * LZ;
    const ry = 2 * nz * ny, rz = 2 * nz * nz - 1, rdl = 2 * nz * (nx * LX + ny * LY) + rz * LZ;
    // silver is a mirror with a little frost on it: every face shows the room — the broad lamp upper left, dim walls,
    // the brass it lies on — the cast skin more softly than a fresh cut
    const tm = 0.12 + 0.8 * sstep(-0.25, 0.9, ndl);
    const lamp = sstep(0.42, 0.92, rdl), gnd = 1 - sstep(-0.15, 0.3, rz);
    const room = 0.2 + 0.14 * sstep(-0.6, 0.6, -ry);
    const mir = 0.07 + 1.08 * lamp + (room * (1 - gnd) + 0.3 * gnd) * (1 - lamp);
    let t = tm + (mir - tm) * (0.92 * cut + (0.5 + 0.1 * tp) * skin);
    const cmax = c1 > c2 ? c1 : c2, lit = sstep(0.15, 0.75, ndl);
    t += 0.34 * ridge * cmax * lit;                            // the arris of a cut catches a thread of light
    const low = 1 - sstep(0, 12, h);
    t *= 1 - 0.38 * low * (1 - sstep(0.1, 0.7, ndl));          // the foot on the far side sits in its own shade
    // tarnish: soft grey-black clouds, thickest low on the cast sides, never on a fresh cut
    const ox = sstep(0.25, 1.0, 1.1 * nO.fbm(qx / 55 + P.sd, qy / 55 - P.sd, 2, 2, 0.4) + 0.25 + 0.55 * low * skin + 0.3 * (1 - tp) * skin) * (1 - 0.9 * cut) * P.ox;
    t *= 1 - 0.45 * ox;
    gScore = h > 8 ? ridge * cmax * lit * t : 0;
    look(SV, t / SV_MAX);
    let r = oR, g = oG * (1 - 0.03 * ox), b = oB * (1 - 0.08 * ox);
    // the brass glows back up into whatever faces it
    const bw = cl(0.5 * gnd * cut + 0.4 * low + 0.25 * (1 - sstep(-0.2, 0.5, ndl))) * 0.5, tb = Math.min(1.25, t / 0.5);
    r += (172 * tb - r) * bw; g += (144 * tb - g) * bw; b += (88 * tb - b) * bw;
    out[0] = r; out[1] = g; out[2] = b;
    return cov;
  };
  /** how much of the lamp this point of the pan has lost to the piece (0 … 1) */
  const shadow = (x, y) => {
    let occ = 0;
    for (let k = 0; k < NT; k++) {
      const t = TS[k], hq = hard(x - SDX * t, y - SDY * t) - SLOPE * t;
      if (hq > -PEN[k]) { const o = 0.5 + hq / (2 * PEN[k]); if (o > occ) { occ = o; if (occ >= 1) return 1; } }
    }
    return occ;
  };
  return { P, rad, shade, shadow, outside };
}

function buildSilver() {
  const nS = L.makeNoise('s04silver'), nO = L.makeNoise('s04tarnish');
  const ps = PIECES.map((P) => makePiece(P, nS, nO));
  const box = (p) => { const sl = p.P.h / SLOPE + 30; return [Math.floor(p.P.x - p.rad - 14), Math.floor(p.P.y - p.rad - 14), Math.ceil(p.P.x + p.rad + sl * SDX + 14), Math.ceil(p.P.y + p.rad + sl * SDY + 14)]; };
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of ps) { const b = box(p); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  x0 = Math.max(-PAD, x0); y0 = Math.max(-PAD, y0); x1 = Math.min(W + PAD, x1); y1 = Math.min(H + PAD, y1);
  const SWd = x1 - x0, SHt = y1 - y0;
  const col = new Float32Array(SWd * SHt * 3), cov = new Float32Array(SWd * SHt), shd = new Float32Array(SWd * SHt), tmp = [0, 0, 0];
  const glints = [];
  for (const p of ps) {
    const b = box(p), reach = p.P.h / SLOPE + 30, best = { s: 0, x: 0, y: 0 };
    glints.push(best);
    for (let y = Math.max(y0, b[1]); y < Math.min(y1, b[3]); y++) for (let x = Math.max(x0, b[0]); x < Math.min(x1, b[2]); x++) {
      const k = (y - y0) * SWd + (x - x0), c = p.shade(x, y, tmp);
      if (c > cov[k]) { cov[k] = c; col[k * 3] = tmp[0]; col[k * 3 + 1] = tmp[1]; col[k * 3 + 2] = tmp[2]; }
      if (c >= 1 && gScore > best.s) { best.s = gScore; best.x = x; best.y = y; }
      if (c < 1) {
        const dO = p.outside(x, y);
        if (dO < reach) {
          const side = sstep(-0.6, 0.6, ((x - p.P.x) * SDX + (y - p.P.y) * SDY) / p.rad);                 // 0 toward the lamp … 1 on the far side
          const s = 1 - (1 - 0.74 * p.shadow(x, y)) * (1 - (0.2 + 0.35 * side) * Math.exp(-(dO > 0 ? dO : 0) / 4.2));   // cast shadow + the dark seat
          if (s > shd[k]) shd[k] = s;
        }
      }
    }
  }
  const img = new ImageData(SWd, SHt), px = img.data;
  for (let k = 0; k < SWd * SHt; k++) {
    const c = cov[k], s = shd[k], A = c + (1 - c) * s;
    if (A < 0.003) continue;
    const o = k * 4, w = s * (1 - c);
    px[o] = (col[k * 3] * c + 34 * w) / A; px[o + 1] = (col[k * 3 + 1] * c + 23 * w) / A; px[o + 2] = (col[k * 3 + 2] * c + 10 * w) / A; px[o + 3] = A * 255;
  }
  const cnv = L.makeCanvas(SWd, SHt);
  cnv.getContext('2d').putImageData(img, 0, 0);
  // one small glint on each piece, where the arris of its cut faces the lamp (it swells and fades in draw)
  const gl = L.makeCanvas(SWd, SHt), gg = gl.getContext('2d');
  for (const b of glints) {
    if (b.s < 0.3) continue;
    const gx = b.x - x0, gy = b.y - y0;
    gg.fillStyle = L.radial(gg, gx, gy, 0, 24, [[0, 'rgba(255,255,255,0.4)'], [0.25, 'rgba(255,255,255,0.13)'], [1, 'rgba(255,255,255,0)']]); gg.fillRect(gx - 24, gy - 24, 48, 48);
    gg.fillStyle = L.radial(gg, gx, gy, 0, 6, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]); gg.fillRect(gx - 6, gy - 6, 12, 12);
  }
  return { silver: dofMix({ cnv, x: x0, y: y0 }, 3.2), glint: { cnv: gl, x: x0, y: y0 } };
}

// ───────────────────────── the cords ─────────────────────────
const WC = 11, PITCH = 7.6;     // cord width; distance between the creases of its twist

/** one twisted red silk cord: from far above the frame down over the lip into its hole. knots: [[dx from the hole, y], …] top → bottom */
function buildCord(env, hole, knots, seed) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const nF = L.makeNoise('s04cord' + seed);
  const P = knots.map(([dx, y]) => [hole.x + dx, y]); P.push([hole.x, hole.y]);
  const n = P.length, m = new Float32Array(n);
  for (let i = 0; i < n; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1); m[i] = (P[i1][0] - P[i0][0]) / (P[i1][1] - P[i0][1]); }
  const fx = (y) => {
    let k = 0; while (k < n - 2 && y > P[k + 1][1]) k++;
    const ya = P[k][1], hh = P[k + 1][1] - ya, t = cl((y - ya) / hh), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * P[k][0] + (t3 - 2 * t2 + t) * hh * m[k] + (-2 * t3 + 3 * t2) * P[k + 1][0] + (t3 - t2) * hh * m[k + 1];
  };
  const yT = Math.floor(P[0][1]), yE = P[n - 1][1], rows = Math.ceil(yE + 14) - yT;
  const cX = new Float32Array(rows + 2), cC = new Float32Array(rows + 2), cT = new Float32Array(rows + 2), cS = new Float32Array(rows + 2);
  let sAcc = 0, xmin = 1e9, xmax = -1e9;
  for (let j = 0; j < rows + 2; j++) {
    const y = yT + j, x = fx(Math.min(y, yE)), sl = y < yE ? fx(y + 0.5) - fx(y - 0.5) : 0, c = 1 / Math.hypot(1, sl);
    cX[j] = x; cC[j] = c; cT[j] = sl; cS[j] = sAcc; sAcc += 1 / c; if (x < xmin) xmin = x; if (x > xmax) xmax = x;
  }
  const bx = Math.floor(xmin - 26), bw = Math.ceil(xmax + 44) - bx;
  const img = new ImageData(bw, rows), px = img.data;
  for (let j = 0; j < rows; j++) {
    const y = yT + j, ddy = cy - y, over = y - yE;
    for (let i = 0; i < bw; i++) {
      const x = bx + i, ddx = x - cx, d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      const u = (x - cX[j]) * cC[j];
      const au = over > 0 ? Math.sqrt(u * u + over * over) : Math.abs(u);
      let cov = 0, r = 0, g = 0, b = 0;
      if (au < WC / 2 + 2) {
        // two plies twisted together: rounded strands, a dark crease between them running diagonally
        const sa = cS[j] + u * cT[j] * cC[j], ph = (sa + 0.95 * u) / PITCH, fr = ph - Math.floor(ph);
        const bump = Math.sin(Math.PI * fr), b2 = Math.pow(bump, 0.55), hw = WC / 2 - 0.9 * (1 - b2);
        cov = cl(hw - au + 0.5);
        if (cov > 0) {
          const cu = L.clamp(u / hw, -1, 1), cz = Math.sqrt(1 - cu * cu), nl = cl(cu * LX * 1.2 + cz * 0.75);
          let t = (0.2 + 0.8 * nl) * (0.5 + 0.5 * b2) + 0.38 * Math.pow(bump, 5) * sstep(0.5, 0.95, nl);
          t *= 1 + 0.1 * nF.n2((sa + 0.95 * u) / 1.6, (u - 0.2 * sa) / 14);       // the silk's own fibres, lying along each strand
          t *= 1 - 0.3 * sstep(RW - 4, RW + 4, d);                                 // under the lip it is in the lip's shadow
          t *= 1 - 0.8 * sstep(yE - 8, yE + 1, y);                                 // … and it dives into the hole
          look(RD, t / RD_MAX); r = oR; g = oG; b = oB;
        }
      }
      // its shadow: close where it lies on the ground or on the lip, thrown further where it lifts off the ground to climb the lip
      let sh = 0;
      if (cov < 1) {
        const off = d < -1 ? 3.5 + 12 * Math.exp(d / 55) : d < RW ? 2.5 : 4.5;
        const ys = y - SDY * off, js = ys - yT;
        if (js >= 0 && ys < yE + 4) {
          const j0 = js | 0, tt = js - j0, xc = cX[j0] + (cX[j0 + 1] - cX[j0]) * tt, us = Math.abs((x - SDX * off - xc) * cC[j0]), soft = 1.3 + 0.3 * off;
          sh = 0.4 * (1 - sstep(WC / 2 - soft, WC / 2 + soft, us)) * (1 - sstep(yE - 4, yE + 4, ys));
        }
      }
      const A = cov + (1 - cov) * sh;
      if (A < 0.003) continue;
      const o = (j * bw + i) * 4, w = sh * (1 - cov);
      px[o] = (r * cov + 36 * w) / A; px[o + 1] = (g * cov + 34 * w) / A; px[o + 2] = (b * cov + 46 * w) / A; px[o + 3] = A * 255;
    }
  }
  const cnv = L.makeCanvas(bw, rows);
  cnv.getContext('2d').putImageData(img, 0, 0);
  return { cnv, x: bx, y: yT };
}

/** the ground: clean pale grey-blue, lighter toward the lamp, only the faintest paper tooth */
function buildGround() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#dbe3e9'; g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, 760, 230, 0, 1350, [[0, 'rgba(240,245,248,0.85)'], [0.5, 'rgba(230,237,242,0.32)'], [1, 'rgba(212,223,231,0)']]);
  g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, 960, 320, 760, 1500, [[0, 'rgba(182,200,212,0)'], [1, 'rgba(182,200,212,0.36)']]);
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5;
  g.drawImage(L.noiseTex(W, H, { seed: 's04paper', scale: 7, octaves: 2, res: 0.5, contrast: 1.2, ramp: [[0, '#edf1f3'], [1, '#ffffff']] }), 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.45;
  g.drawImage(L.grainTex(W, H, { seed: 's04grain', amount: 0.16 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

export default {
  name: '戥盘碎银',
  tone: 'dark',
  init(env) {
    const a = env.arc, holes = HOLE_TH.map((t) => a.pt(t, -HOLE_D));
    const pan = buildPan(env, holes), rim = buildRim(env), sil = buildSilver();
    S = {
      ground: buildGround(), pan: pan.pan, fan: pan.fan, rim: rim.rim, hot: rim.hot, silver: sil.silver, glint: sil.glint,
      cords: [
        buildCord(env, holes[0], [[-52, -90], [-66, 80], [-44, 250], [-26, 410], [-24, 545]], 1),
        buildCord(env, holes[1], [[60, -90], [84, 70], [70, 240], [44, 400], [28, 548]], 2),
      ],
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const zoom = L.lerp(1.0, 1.02, p);                    // a breath of push-in
    const rot = L.lerp(-0.0012, 0.0012, p);               // the pan turns a hair
    const slide = L.lerp(-0.036, 0.046, L.smooth(p));     // the highlight glides right along the rim
    const turn = (ang) => { ctx.translate(a.cx, a.cy); ctx.rotate(ang); ctx.translate(-a.cx, -a.cy); };
    const put = (l) => ctx.drawImage(l.cnv, l.x, l.y);
    L.cam(ctx, env, { zoom: L.lerp(1.0, 1.006, p) }, () => ctx.drawImage(S.ground, 0, 0));
    // inside the pan: pushed in about the crest, then trimmed to the true arc (the lip below is never zoomed, so the edge cannot drift)
    ctx.save(); a.clipBelow(ctx, -(RW - 6));
    L.cam(ctx, env, { zoom, rot }, () => {
      put(S.pan);
      ctx.save(); turn(slide); put(S.fan); ctx.restore();
      put(S.silver);
      ctx.globalAlpha = 0.45 + 0.55 * Math.sin(Math.PI * p); put(S.glint); ctx.globalAlpha = 1;
    });
    ctx.restore();
    L.cam(ctx, env, { rot }, () => {
      put(S.rim);
      ctx.save(); turn(slide); put(S.hot); ctx.restore();
    });
    L.cam(ctx, env, { zoom, rot }, () => { for (const c of S.cords) put(c); });
  },
};
