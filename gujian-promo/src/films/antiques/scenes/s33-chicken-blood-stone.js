// s33 — 鸡血石. A polished dome of black-ground chicken-blood stone (黑地鸡血) in the dark; only black and vermilion.
// The arc is the stone's upper silhouette: a hair-thin vermilion rim light with a narrow band of shadow hugging its outside.
// Below it lies a lacquer-black polished face, and the "blood" is INSIDE the stone: a mass of cinnabar wells up from the
// bottom of frame as ragged bands that fuse in the core and come apart toward the edge; a cottony dark-red veil seeps from
// them into the ground, fine grains are strewn off every edge and loose star clusters lie further out. A soft, waxy
// reflection of the key light lies across the shoulder of the dome and over the top of the blood — it travels with the
// light, not with the stone, which is what makes the face read as polished. Above the arc a near-black red-brown void is dusted with
// cinnabar motes like red stardust under a microscope (thin and dim behind the tagline).
//
// Built once in init():
//   · stone  — shaded per pixel: slow fields on a coarse grid (the mass, how far it seeps, tone, edge character) plus
//              fine octaves at full resolution; dense clots get an edge anti-aliased from the screen-space gradient of
//              their field, and round them a fibrous cloud of thinner blood fades into the black;
//   · gloss  — the soft reflection, on its own layer;
//   · dust   — ~50 k motes, split into a steady layer and three twinkle groups that are cross-faded per frame.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 72;      // the stone slides ≈ ±11 px along the arc
const PB = 30;       // rows kept below the frame
const BP = 44;       // the dust behind it moves far less
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
function h2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// allocation-free worley: distance to the nearest feature point in cD (cell units), its offset in cDx / cDy, two ids of that cell
let cD = 0, cId = 0, cId2 = 0, cDx = 0, cDy = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, hb = 0, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d1 = d; hb = h; bx = dx; by = dy; }
  }
  cD = Math.sqrt(d1); cId = ((hb >>> 20) & 63) / 63; cId2 = ((hb >>> 26) & 63) / 63; cDx = bx; cDy = by;
}

/** a layer that only covers frame rows y0…y1 (plus `pad` px left and right); draw in frame coordinates */
function band(pad, y0, y1, draw) {
  const c = L.makeCanvas(W + pad * 2, y1 - y0), g = c.getContext('2d');
  g.translate(pad, -y0); c._x0 = -pad; c._y0 = y0;
  if (draw) draw(g, c);
  return c;
}
/** L.blit for band layers */
function blitAt(ctx, env, c, o = {}) {
  const { rot = 0, zoom = 1, alpha = 1, blend = 'source-over' } = o, a = env.arc;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = blend;
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(c, c._x0, c._y0);
  ctx.restore();
}

const BLOOD = [[0, '#160202'], [0.2, '#6e0f0c'], [0.42, '#a81510'], [0.6, '#d81e1a'], [0.8, '#ee2c1c'], [0.92, '#ff4a32'], [1, '#ff7658']];
const RIM = [[0, '#000000'], [0.25, '#5a0c09'], [0.5, '#b01814'], [0.75, '#e8261c'], [1, '#ff5a3c']];
const MOTE = [[0, '#340705'], [0.28, '#74100c'], [0.52, '#c01a15'], [0.72, '#e42c1c'], [0.85, '#ff5236'], [0.94, '#ff9a7c'], [1, '#ffe2d4']];
// rounded, cloud-like lumps (0 … ~0.8, mean ≈ 0.3)
const billow = (n, x, y) => Math.abs(n.n2(x, y)) * 0.6 + Math.abs(n.n2(x * 2.1 + 5, y * 2.1 - 3)) * 0.28 + Math.abs(n.n2(x * 4.3 - 7, y * 4.3 + 9)) * 0.12;
const smax = (p, q, k) => { const h = Math.max(k - Math.abs(p - q), 0) / k; return Math.max(p, q) + h * h * k * 0.25; };
const lutOf = (stops) => { const f = L.makeRamp(stops), lut = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const c = f(i / 255); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; } return lut; };

/** everything below the arc, shaded per pixel: the black ground with its rim light, the blood inside it, the soft reflection */
function shadeStone(a) {
  const R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 4, RW = W + PAD * 2, RH = H + PB - Y0;
  const nA = L.makeNoise('s33a'), nB = L.makeNoise('s33b'), nC = L.makeNoise('s33c'), nG = L.makeNoise('s33g'), nR = L.makeNoise('s33rim');
  const PHI = -0.4, ca = Math.cos(PHI), sa = Math.sin(PHI);       // the blood "flows" up toward the right
  const FK = 1.6, FL = 70;                                        // the dome turns away toward the limb: the pattern crowds up there

  // where a frame point looks on the unrolled surface (fxs, fys) and its meandering flow coordinates (fAo along, fBo across)
  let fxs = 0, fys = 0, fAo = 0, fBo = 0, fv = 0;
  const flow = (x, y) => {
    const ddx = x - cx, ddy = y - cy, rr = Math.hypot(ddx, ddy), v = R - rr, vv = v > 0 ? v : 0;
    const vs = vv + FK * FL * (1 - Math.exp(-vv / FL)), kk = (R - vs) / (R - vv);
    const xs = cx + ddx * kk, ys = cy + ddy * kk;
    const bx = xs + 42 * nA.n2(xs / 420 + 1.3, ys / 420 - 4.1), by = ys + 36 * nA.n2(xs / 420 - 8.6, ys / 420 + 2.9);
    fxs = xs; fys = ys; fv = v; fAo = bx * ca + by * sa; fBo = -bx * sa + by * ca;
  };
  const ell = (X, Y, x0, y0, rx, ry, rot) => { const c = Math.cos(rot), s = Math.sin(rot), u = (X - x0) * c + (Y - y0) * s, w = -(X - x0) * s + (Y - y0) * c; return 1 - Math.hypot(u / rx, w / ry); };
  // one long streak has drifted off the right shoulder of the mass
  flow(1150, 900); const AS = fAo, BS = fBo, SL = 520;

  // ── slow fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, N = cw * ch;
  const fT = new Float32Array(N), fA = new Float32Array(N), fB = new Float32Array(N), fTone = new Float32Array(N), fW = new Float32Array(N),
    fH = new Float32Array(N), fSoft = new Float32Array(N), fP = new Float32Array(N), fV = new Float32Array(N), fBn = new Float32Array(N), fLit = new Float32Array(N);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    flow(x, y);
    const xs = fxs, ys = fys, A = fAo, B = fBo, v = fv;
    fA[k] = A; fB[k] = B;
    // grey-black flocculent clouds in the ground
    fW[k] = sstep(0.3, 0.85, nA.fbm(A / 340 + 3, B / 150 - 5, 4, 2, 0.5) * 0.5 + 0.5 + 0.08 * nB.n2(xs / 70, ys / 70));
    fLit[k] = Math.exp(-(Math.pow((x - 780) / 600, 2) + Math.pow((v - 250) / 200, 2)));       // where the key light falls on the face
    if (v < 40) { fT[k] = -999; fV[k] = -9; continue; }
    const wx = 70 * nA.fbm(x / 340 + 3.1, y / 340 - 7.7, 3), wy = 60 * nA.fbm(x / 340 - 21.4, y / 340 + 13.2, 3);
    const X = x + wx, Y = y + wy;
    const T0 = smax(smax(400 * ell(X, Y, 930, 1268, 500, 360, 0), 280 * ell(X, Y, 705, 1045, 190, 265, 0.12), 60), 180 * ell(X, Y, 1250, 1040, 330, 112, PHI), 60);
    // the mass is a bundle of streaks lying with the flow: they fuse in the core and come apart, tapering, toward the edge
    const bn = nA.fbm(A / 360 + 12.9, B / 60 - 3.3, 3, 2, 0.5);
    let T = 0.8 * T0 + 150 * (1 - 0.3 * sstep(10, 170, T0)) * bn + 55 * (billow(nB, A / 190 + 9, B / 110 - 4) - 0.3);
    fBn[k] = bn;
    const s = (A - AS) / SL;
    if (s > -0.25 && s < 1.15) {
      const tp = sstep(-0.2, 0.12, s) * Math.pow(Math.max(0, 1 - s), 0.8);
      const st = 34 * tp - Math.abs(B - BS - 26 * Math.sin(s * 4.2 + 0.6)) + 18 * nB.fbm(A / 110 + 7, B / 30 - 2, 3) * (0.4 + tp);
      T = smax(T, st, 14);
    }
    const clean = sstep(150, 70, v);
    // the cloud: cottony, streaky blood that seeps from the clots into the ground — far in some places, hardly at all in others
    const reach = 14 + 110 * sstep(-0.3, 0.5, nB.fbm(x / 300 - 14, y / 300 + 22, 2));
    fV[k] = (T + reach) / (reach + 60) - 3 * sstep(175, 85, v);
    fT[k] = Math.min(T, 120) - 600 * clean;      // the shoulder under the rim stays clean black
    // the key light pools on the upper left of the mass; the blood deepens toward the bottom of frame
    const pool = Math.exp(-(Math.pow((x - 800) / 640, 2) + Math.pow((y - 790) / 290, 2)));
    fTone[k] = 0.52 + 0.18 * pool + 0.08 * nA.fbm(A / 420 + 5, B / 170 - 9, 2) - 0.2 * sstep(940, 1110, y);
    fH[k] = sstep(-0.35, 0.5, nB.fbm(x / 210 - 6, y / 210 + 8, 2));            // how broken / dusty the edge is here
    fSoft[k] = sstep(0.3, 0.75, nB.fbm(x / 260 + 40, y / 260 - 30, 2));        // where the blood lies a little deeper the edge goes soft
    fP[k] = (0.5 * Math.exp(Math.min(0, T0) / 170) + 0.03) * (1 - clean);      // star clusters: thick near the mass, rare far from it
  }
  let bk = 0, btx = 0, bty = 0;
  const at = (i, j) => { const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0; btx = fx - i0; bty = fy - j0; bk = j0 * cw + i0; };
  const bil = (src) => { const a0 = src[bk], a1 = src[bk + 1], b0 = src[bk + cw], b1 = src[bk + cw + 1]; return (a0 + (a1 - a0) * btx) * (1 - bty) + (b0 + (b1 - b0) * btx) * bty; };

  // ── pass 1: the edge field of the dense clots at full resolution, feathered along the flow ──
  const NP = RW * RH, TJ = new Float32Array(NP).fill(-999), F2 = new Float32Array(NP);
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    at(i, j);
    const T = bil(fT);
    if (T < -150) continue;
    const q = j * RW + i, A = bil(fA), B = bil(fB), frz = bil(fH);
    const f1 = nC.n2(A / 64 + 3.3, B / 17 - 1.7), f2 = nC.n2(A / 27 - 8.1, B / 8.5 + 6.4), f3 = nC.n2(A / 10.5 + 4.7, B / 8 - 2.2), f4 = nC.n2(A / 5.2 - 6.3, B / 4.4 + 8.8);
    F2[q] = f2;
    TJ[q] = T - 34 + (8 + 9 * frz) * f1 + (4.5 + 4.5 * frz) * f2 + (2.6 + 3 * frz) * f3 + (1.2 + 1.4 * frz) * f4;
  }

  // ── pass 2: shade ──
  const lut = lutOf(BLOOD), rimLut = lutOf(RIM);
  const gd = new Uint8ClampedArray(NP * 4), bd = new Uint8ClampedArray(NP * 4), gl = new Uint8ClampedArray(NP * 4);
  // per-column terms of the rim light
  const rimI = new Float32Array(RW), rimJ = new Float32Array(RW), rimW = new Float32Array(RW);
  for (let i = 0; i < RW; i++) {
    const x = X0 + i, th = Math.asin((x - cx) / R), s = th * R;
    const n1 = nR.fbm(s / 140, 2.2, 3) * 0.5 + 0.5, n2 = nR.n2(s / 9, 7.7) * 0.5 + 0.5;
    const key = 0.7 + 0.3 * Math.exp(-Math.pow((th + 0.12) / 0.22, 2));
    rimI[i] = L.clamp((0.4 + 0.6 * n1) * key);
    rimJ[i] = L.clamp(rimI[i] + 0.1 * (n2 - 0.5));
    rimW[i] = 1.1 + 1.3 * n1 * key + 0.3 * n2;
  }
  // the soft reflection of the key light: the stone's lustre is waxy, so it is a long soft lobe with a brighter core,
  // tighter on the side toward the limb (where the dome turns away) than on the side toward the lens
  const lobe = (x, v) => {
    const du = (x - 770) / 520, dv = v - 200 - 5 * nG.n2(x / 380, 3.3), dvn = dv / (dv < 0 ? 44 : 110), halo = Math.exp(-(du * du + dvn * dvn));
    const dc = (dv + 17) / (dv < -17 ? 10 : 25), core = Math.exp(-(Math.pow((x - 750) / 360, 2) + dc * dc));
    return (0.4 + 0.86 * core) * halo;
  };
  const glossAt = (x, y) => lobe(x, R - Math.hypot(x - cx, y - cy));
  const rs = L.rng('s33glint'), glints = [];
  for (let j = 1; j < RH - 1; j++) {
    const y = Y0 + j;
    for (let i = 1; i < RW - 1; i++) {
      const x = X0 + i, q = j * RW + i, o = q * 4;
      const ddx = x - cx, ddy = y - cy, dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      if (dr > 0.5) continue;
      const v = -dr, hp = h2(x, y), hq = h2(x + 911, y - 373);
      at(i, j);
      // the ground: lacquer black with faint grey-black wisps, which show a little more where the key light falls;
      // toward the limb it mirrors a little of the red void behind it
      const w = bil(fW), lit = bil(fLit);
      let r = 5 + 8.5 * w, g = 3.4 + 5.6 * w, b = 3.4 + 5.4 * w;
      if (lit > 0.02) {
        const lw = lit * (1 + 8 * w * (0.72 + 0.28 * nG.n2(x / 46 + 9.1, y / 21 - 4.4)));
        r += lw; g += 0.52 * lw; b += 0.47 * lw;
      }
      if (v < 90) {
        const ci = (i - (ddx / R) * v) | 0, ii = ci < 0 ? 0 : ci >= RW ? RW - 1 : ci;      // the column this point hangs under, measured along the limb
        const fz = (0.15 * Math.exp(-v / 8) + 0.035 * Math.exp(-v / 40)) * (0.35 + 0.65 * rimI[ii]);
        r += 205 * fz; g += 34 * fz; b += 22 * fz;
        if (v < 16) {
          const p = rimJ[ii] * Math.exp(-Math.max(0, v - 0.4) / rimW[ii]) + rimI[ii] * 0.16 * Math.exp(-v / 6), li = ((p > 1 ? 1 : p) * 255 | 0) * 3;
          r += rimLut[li]; g += rimLut[li + 1]; b += rimLut[li + 2];
        }
      }
      gd[o] = r + hp - 0.5; gd[o + 1] = g + hq - 0.5; gd[o + 2] = b + hp - 0.5; gd[o + 3] = dr < -0.5 ? 255 : (0.5 - dr) * 255;

      if (v > 50 && x < 1840) {
        const G = lobe(x, v);
        if (G > 0.004) { gl[o] = 150 * G + hp - 0.5; gl[o + 1] = 50 * G + 20 * G * G + hq - 0.5; gl[o + 2] = 38 * G + 16 * G * G + hp - 0.5; gl[o + 3] = 255; }
      }

      // the blood
      if (bil(fT) < -400) continue;
      const A = bil(fA), B = bil(fB), frz = bil(fH), tone0 = bil(fTone);
      // the cloud: density rises toward the clots and is carried by long fibres, so it thins out in streaks
      let va = 0, vt = 0;
      const V = bil(fV);
      if (V > -0.75) {
        const wsp = nC.fbm(A / 170 + 5.5, B / 40 - 8.5, 4, 2, 0.55);
        const rho = sstep(0, 1, (V < 1.4 ? V : 1.4) + 0.85 * wsp - 0.25);
        va = sstep(0, 0.5, rho) * 0.95;
        vt = 0.1 + 0.36 * Math.pow(rho, 1.2) + 0.7 * (tone0 - 0.52) + 0.04 * wsp;
      }
      const Tj = TJ[q];
      let al = 0, t = 0;
      if (Tj > -150) {
        let cov = 0, dot = 0, dTone = 0;
        if (Tj > -12) {
          // anti-alias from the screen-space gradient of the field; where the blood lies deeper the edge spreads
          const l = TJ[q - 1], rt = TJ[q + 1], u = TJ[q - RW], d = TJ[q + RW];
          let gm = (l < -500 || rt < -500 || u < -500 || d < -500) ? 1 : Math.hypot((rt - l) * 0.5, (d - u) * 0.5);
          if (gm < 0.5) gm = 0.5;
          cov = L.clamp(0.5 + Tj / (gm * (1.5 + 11 * bil(fSoft))));
          cov = cov * cov * (3 - 2 * cov);
        }
        // the body of the blood: clots of slightly different red, built of fine crystals that lie with the flow
        cell(A / 9.5 + 1.9, B / 5 + 7.3);
        t = tone0 + 0.11 * nC.fbm(A / 92 + 21, B / 58 - 6, 3) + 0.08 * bil(fBn) + 0.04 * F2[q] + (cId - 0.5) * 0.05 - 0.035 * sstep(0.3, 0.62, cD) - 0.05 * sstep(0.4, 0.8, nC.n2(A / 210 - 3, B / 17 + 9)) + (hp - 0.5) * 0.02;
        if (Tj < 4) {
          // fine grains strewn off the edge, thinning out with distance; whole star clusters further away; grains hang in the cloud too
          let dens = 0.9 * Math.exp(Tj / (4 + 22 * frz * frz));
          const Pk = bil(fP);
          if (Pk > 0.002) {
            cell(A / 74 + 11.1, B / 60 - 4.2);
            if (cId < Pk) { const sg = 5 + 15 * cId2, dd = cD * 66 / sg, c2 = (0.5 + 0.5 * cId) * Math.exp(-dd * dd); if (c2 > dens) dens = c2; }
          }
          if (0.16 * va > dens) dens = 0.16 * va;
          if (dens > 0.012) {
            cell(A / 7 + 7.3, B / 6 + 2.9);
            if (cId < dens) {
              const rpx = (1.0 + 1.5 * cId2 * cId2) * (0.8 + 0.4 * (dens < 1 ? dens : 1)), dpx = Math.hypot(cDx * 7, cDy * 6);
              dot = L.clamp((rpx - dpx) / 1.3 + 0.5);
              dTone = (cId2 - 0.45) * 0.3 + (cId / (dens + 0.001) - 0.5) * 0.12;
            }
          }
        } else {
          // … and the reverse inside: pin-holes of ground in the blood, crowding toward the edge
          cell(A / 8 + 3.1, B / 6.5 - 9.7);
          if (cId < 0.45 * Math.exp(-Tj / (4 + 12 * frz)) + 0.018) {
            const rpx = 0.9 + 1.5 * cId2, dpx = Math.hypot(cDx * 8, cDy * 6.5);
            cov *= 1 - 0.65 * L.clamp((rpx - dpx) / 1.3 + 0.5);
          } else if (cov > 0.95 && rs() < 0.00005 * (1 + 5 * sstep(0.5, 0.7, tone0)) * (Tj < 30 ? 2.5 : 1)) glints.push({ x, y, s: rs.range(0.5, 1.5), ph: rs(), k: rs() });
        }
        al = cov;
        if (dot > al) { al = dot; t += dTone; }
      }
      // the dense clots over the cloud
      const ao = al + va * (1 - al);
      if (ao < 0.004) continue;
      const li = ((t < 0 ? 0 : t > 1 ? 1 : t) * 255 | 0) * 3, lv = ((vt < 0 ? 0 : vt > 1 ? 1 : vt) * 255 | 0) * 3, k1 = al / ao, k2 = 1 - k1;
      bd[o] = lut[li] * k1 + lut[lv] * k2; bd[o + 1] = lut[li + 1] * k1 + lut[lv + 1] * k2; bd[o + 2] = lut[li + 2] * k1 + lut[lv + 2] * k2; bd[o + 3] = ao * 255;
    }
  }
  return { X0, Y0, RW, RH, gd, bd, gl, glossAt, glints };
}

/** the stone layer (band of shadow outside the rim, the body) and the reflection layer */
function buildStone(env) {
  const a = env.arc, R = a.R;
  const sh = shadeStone(a);
  const put = (data) => { const c = L.makeCanvas(sh.RW, sh.RH); c.getContext('2d').putImageData(new ImageData(data, sh.RW, sh.RH), 0, 0); return c; };
  const ground = put(sh.gd), blood = put(sh.bd), gloss = put(sh.gl);
  gloss._x0 = sh.X0; gloss._y0 = sh.Y0;
  const Y0 = Math.floor(a.crestY) - 70, Y1 = H + PB;
  const full = (g) => g.fillRect(-PAD, Y0, W + PAD * 2, Y1 - Y0);
  const layer = band(PAD, Y0, Y1, (g) => {
    // the stone stands in front of the dust: just outside the limb the void falls into its shadow
    g.fillStyle = L.radial(g, a.cx, a.cy, R - 2, R + 46, [[0, 'rgba(4,2,2,1)'], [0.26, 'rgba(4,2,2,0.97)'], [0.5, 'rgba(4,2,2,0.72)'], [0.78, 'rgba(4,2,2,0.24)'], [1, 'rgba(4,2,2,0)']]);
    a.pathBand(g, 48, -3); g.fill();
    g.drawImage(ground, sh.X0, sh.Y0);
    g.save(); a.clipBelow(g, -1);
    // cinnabar lies in a faintly translucent matrix: the blood glows a little way into the ground round it
    g.globalCompositeOperation = 'lighter';
    g.filter = 'blur(7px)'; g.globalAlpha = 0.1; g.drawImage(blood, sh.X0, sh.Y0);
    g.filter = 'blur(30px)'; g.globalAlpha = 0.07; g.drawImage(blood, sh.X0, sh.Y0);
    g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(blood, sh.X0, sh.Y0);
    // what a macro lens always finds on a polished face, and only where it mirrors the light: a little settled dust
    const rr = L.rng('s33scr');
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 420; i++) {
      const p = a.pt(a.thetaAtX(rr.range(300, 1240)), -rr.range(150, 290)), G = sh.glossAt(p.x, p.y), rad = rr.range(0.7, 1.3), al = rr.range(0.3, 0.9);
      if (G < 0.3 || rr() > G) continue;
      g.fillStyle = `rgba(255,172,142,${(G * al * 0.8).toFixed(3)})`;
      g.beginPath(); g.arc(p.x, p.y, rad, 0, L.TAU); g.fill();
    }
    g.restore();
  });

  // shallow depth of field: the far ends of the limb go a touch soft, and so does the bottom of frame,
  // where the dome bulges toward the lens
  const lg = layer.getContext('2d');
  const dof = (px, mask) => {
    const soft = band(PAD, Y0, Y1), sg = soft.getContext('2d');
    sg.save(); sg.setTransform(1, 0, 0, 1, 0, 0); sg.filter = `blur(${px}px)`; sg.drawImage(layer, 0, 0); sg.filter = 'none'; sg.restore();
    sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = mask; full(sg);
    lg.globalCompositeOperation = 'destination-out'; lg.fillStyle = mask; full(lg);
    lg.globalCompositeOperation = 'lighter'; lg.drawImage(soft, -PAD, Y0);
    lg.globalCompositeOperation = 'source-over';
  };
  dof(1.7, L.linear(lg, 0, 0, W, 0, [[0, 'rgba(0,0,0,1)'], [0.14, 'rgba(0,0,0,0.5)'], [0.28, 'rgba(0,0,0,0)'], [0.74, 'rgba(0,0,0,0)'], [0.88, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']]));
  dof(2.6, L.linear(lg, 0, 990, 0, H + PB, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0.9)']]));
  return { stone: layer, gloss, glints: sh.glints };
}

/** the void behind the stone, dusted with cinnabar motes */
function buildBack(env) {
  const a = env.arc;
  const Y0 = -BP, Y1 = Math.ceil(a.yAt(-BP - 30)) + 16;
  const nz = L.makeNoise('s33bg');
  const base = band(BP, Y0, Y1, (g) => {
    const full = () => g.fillRect(-BP, Y0, W + BP * 2, Y1 - Y0);
    g.fillStyle = '#1a0a08'; full();
    g.fillStyle = L.radial(g, a.cx, a.crestY - 60, 120, 1250, [[0, 'rgba(7,3,3,0.55)'], [0.45, 'rgba(7,3,3,0.26)'], [1, 'rgba(7,3,3,0)']]); full();
    g.globalCompositeOperation = 'lighter';
    for (const cx of [-60, W + 60]) { g.fillStyle = L.radial(g, cx, -40, 0, 880, [[0, 'rgba(60,10,7,0.3)'], [1, 'rgba(60,10,7,0)']]); full(); }
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.22;
    g.drawImage(L.noiseTex(W + BP * 2, Y1 - Y0, { seed: 's33mott', scale: 340, octaves: 4, res: 0.2, contrast: 1.5 }), -BP, Y0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
  const tw = [0, 1, 2].map(() => band(BP, Y0, Y1));
  const ctxs = [base.getContext('2d'), ...tw.map((c) => c.getContext('2d'))];
  const ramp = L.makeRamp(MOTE), pal = [];
  for (let i = 0; i < 64; i++) pal.push(ramp(i / 63));
  const r = L.rng('s33dust'), hot = [];
  const tcy = a.crestY - 135;
  // a mote is a crystal splinter, not a dot: three to five uneven corners, lying any way round
  const shard = (g, x, y, rad) => {
    const n = 3 + ((r() * 2.7) | 0), a0 = r() * L.TAU, sq = r.range(0.5, 1), ca = Math.cos(a0), sa = Math.sin(a0);
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const aa = (k + r.range(-0.3, 0.3)) * L.TAU / n, rr = rad * r.range(0.6, 1.3);
      const u = Math.cos(aa) * rr, v = Math.sin(aa) * rr * sq, px = x + u * ca - v * sa, py = y + u * sa + v * ca;
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath(); g.fill();
  };
  for (let n = 0; n < 215000; n++) {
    const x = r.range(-BP, W + BP), y = r.range(Y0, Y1);
    if (a.drAt(x, y) < 8) continue;
    const dn = Math.hypot((x - a.cx) / 1010, (y - (a.crestY - 110)) / 600);
    const calm = sstep(0.85, 1.9, Math.hypot((x - a.cx) / 430, (y - tcy) / 175));     // 0 behind the tagline
    const dens = (0.5 + 0.5 * sstep(0.2, 1.1, dn)) * (0.24 + 0.76 * calm) * (0.55 + 0.9 * (nz.fbm(x / 240, y / 240, 3) * 0.5 + 0.5));
    if (r() > dens) continue;
    const u = r();
    let rad, cls;
    if (u < 0.46) { rad = r.range(0.55, 1.0); cls = 0; } else if (u < 0.86) { rad = r.range(1.1, 2.0); cls = 1; } else if (u < 0.98) { rad = r.range(2.0, 3.1); cls = 2; } else { rad = r.range(3.1, 4.4); cls = 3; }
    let b = L.clamp(Math.pow(r(), 2.2) * (0.8 + 0.1 * cls) + 0.05 * cls);
    const facet = cls > 0 && r() < 0.09;       // a face turned straight at the light: these are the sparks
    if (facet) b = r.range(0.86, 1);
    b *= 0.5 + 0.5 * calm;
    const soft = sstep(0.9, 1.5, dn) * (0.4 + 0.6 * r());      // out toward the corners the motes drift out of focus
    const grp = r() < 0.5 ? 0 : 1 + Math.floor(r() * 3);
    const g = ctxs[grp], c = pal[Math.min(63, (b * 63) | 0)];
    const al = L.lerp(0.6, 1, r());
    if (cls === 0) {
      g.globalAlpha = al * (1 - 0.3 * soft); g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      const rr = rad * (1 + 0.5 * soft);
      g.fillRect(x - rr, y - rr * 0.8, rr * 2, rr * 1.6);
    } else if (soft < 0.4) {
      g.globalAlpha = al; g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      shard(g, x, y, rad * (1 + 0.4 * soft));
      if (b > 0.5 && cls > 1) {         // the lit corner of a bigger splinter
        const c2 = pal[Math.min(63, ((b + 0.2) * 63) | 0)];
        g.fillStyle = `rgb(${c2[0] | 0},${c2[1] | 0},${c2[2] | 0})`;
        shard(g, x - rad * 0.3, y - rad * 0.3, rad * 0.45);
      }
    } else {
      const R2 = rad * (1.3 + 1.5 * soft), cs = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
      g.globalAlpha = 1;
      g.fillStyle = L.radial(g, x, y, 0, R2, [[0, `rgba(${cs},${al * 0.6})`], [0.55, `rgba(${cs},${al * 0.5})`], [1, `rgba(${cs},0)`]]);
      g.beginPath(); g.arc(x, y, R2, 0, L.TAU); g.fill();
    }
    if (facet && calm > 0.6 && soft < 0.4 && hot.length < 260) hot.push({ x, y, s: rad, ph: r(), k: r.range(0.5, 1) });
  }
  // a few motes hang close to the lens, far out of focus: soft discs in the upper corners
  const rb = L.rng('s33bokeh');
  for (let n = 0; n < 15; n++) {
    const side = n % 2 ? 1 : -1, x = a.cx + side * rb.range(520, 1000), y = rb.range(-20, 330) * (1 - 0.35 * (1000 - Math.abs(x - a.cx)) / 480);
    const R2 = rb.range(9, 30), al = rb.range(0.11, 0.25) * (20 / (R2 + 11)), c = pal[rb.int(26, 48)], cs = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    const g = ctxs[rb.int(0, 3)];
    g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
    g.fillStyle = L.radial(g, x, y, 0, R2, [[0, `rgba(${cs},${al * 0.8})`], [0.72, `rgba(${cs},${al * 0.88})`], [0.9, `rgba(${cs},${al * 1.15})`], [1, `rgba(${cs},0)`]]);
    g.beginPath(); g.arc(x, y, R2, 0, L.TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  ctxs.forEach((g) => { g.globalAlpha = 1; });
  return { back: base, tw, hot };
}

/** a glint: a hard pink-white core with only a breath of bloom round it */
function glowSprite() {
  const c = L.makeCanvas(64, 64), g = c.getContext('2d');
  g.fillStyle = L.radial(g, 32, 32, 0, 32, [[0, 'rgba(255,232,214,1)'], [0.14, 'rgba(255,170,132,0.95)'], [0.3, 'rgba(255,84,54,0.4)'], [0.6, 'rgba(230,40,28,0.08)'], [1, 'rgba(216,30,26,0)']]);
  g.fillRect(0, 0, 64, 64);
  return c;
}

export default {
  name: '鸡血石',
  tone: 'light',
  init(env) {
    S = { ...buildBack(env), ...buildStone(env), spr: glowSprite() };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const t = p * (env.frames - 1);                 // frame index
    const rot = L.lerp(-0.0045, 0.0045, p);
    const bo = { rot: rot * 0.35, zoom: L.lerp(1.0, 1.012, p) };

    // the void and its dust: three groups of motes breathe out of step
    blitAt(ctx, env, S.back, bo);
    for (let i = 0; i < 3; i++) {
      const al = 0.22 + 0.78 * (0.5 + 0.5 * Math.cos(L.TAU * (t / 4.6 + i / 3)));
      blitAt(ctx, env, S.tw[i], { ...bo, blend: 'lighter', alpha: al });
    }
    // … and single motes flare
    L.cam(ctx, env, bo, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (const q of S.hot) {
        const f = Math.pow(Math.max(0, Math.cos(L.TAU * (t / 5.2 + q.ph))), 5) * q.k;
        if (f < 0.04) continue;
        const sz = (3.5 + q.s * 2.6) * (0.6 + 0.4 * f);
        ctx.globalAlpha = f;
        ctx.drawImage(S.spr, q.x - sz, q.y - sz, sz * 2, sz * 2);
      }
    });

    // the stone
    blitAt(ctx, env, S.stone, { rot });
    // the soft reflection sweeps across it with the light, faster than the stone turns
    blitAt(ctx, env, S.gloss, { rot: L.lerp(-0.028, 0.028, p), blend: 'lighter' });

    // crystal faces in the blood catch the light as it passes
    L.cam(ctx, env, { rot }, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (const q of S.glints) {
        const f = 0.25 + 0.75 * Math.pow(Math.max(0, Math.cos(L.TAU * (t / 5.6 + q.ph))), 3);
        const sz = (3.0 + q.s * 2.4) * (0.7 + 0.3 * f);
        ctx.globalAlpha = f * (0.4 + 0.5 * q.k);
        ctx.drawImage(S.spr, q.x - sz, q.y - sz, sz * 2, sz * 2);
      }
    });

    // the hot spot of the rim light travels along the arc
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hx = L.lerp(0.3, 0.44, p);
    ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(255,74,50,0)'], [hx - 0.2, 'rgba(255,74,50,0)'], [hx - 0.05, 'rgba(255,96,64,0.55)'], [hx, 'rgba(255,196,170,1)'],
      [hx + 0.05, 'rgba(255,96,64,0.55)'], [hx + 0.2, 'rgba(255,74,50,0)'], [1, 'rgba(255,74,50,0)']]);
    ctx.lineWidth = 2.4; a.stroke(ctx, -1.2);
    const gx = hx * W;
    ctx.translate(gx, a.yAt(gx)); ctx.rotate(a.thetaAtX(gx)); ctx.scale(1, 0.3);
    ctx.fillStyle = L.radial(ctx, 0, 0, 0, 110, [[0, 'rgba(255,90,60,0.34)'], [0.3, 'rgba(216,30,26,0.13)'], [1, 'rgba(216,30,26,0)']]);
    ctx.fillRect(-110, -110, 220, 220);
    ctx.restore();
  },
};
