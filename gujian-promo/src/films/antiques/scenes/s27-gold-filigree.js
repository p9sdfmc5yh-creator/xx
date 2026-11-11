// s27 — 累丝金器. Pure black field; under the arc, a macro view across the domed lid of a gold filigree box.
// The arc is the far rim of the lid: a thick rope of two twisted gold wires (麻花丝) with a close-set row of gold
// beads soldered just inside it. Below the rim the lid is open-work in two storeys: on top, hair-fine twisted wire
// coiled into S-scrolls (卷草) packed like a honeycomb, with a ringed rosette for every third coil and gold granules
// soldered on every scroll eye and in every gap between three coils; underneath, a looser net of small wire rings
// lying in the shadow of the scrolls. Black shows through the meshes.
//
// Everything under the arc is built as two float height fields in init():
//   · the pattern is laid out on the flat lid (U along the rim, V inward from the rim) and projected obliquely, so it is
//     foreshortened and small at the far rim and opens up toward the lens at the bottom of frame;
//   · wires are stamped as chains of little spheres — two strands winding round each other, so the twist shows —
//     granules as spheres; per-pixel normals → a satin-gold environment lookup (soft key from the upper left, dark
//     surround, a warm bounce from the gold itself), contact occlusion and short cast shadows; the luminance runs
//     through a gold ramp (dark gold → ochre → red gold → pale highlight);
//   · depth of field: sharp along the rim, melting toward the bottom of frame, where the bead highlights open into bokeh.
// draw() slides the lid a few pixels round its own centre and lets the pin-point highlights of the granules flare and
// die frame by frame (deterministic per frame number).
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 72;           // margin for the rot / zoom drift
const TOP = 40;           // rows rendered above the crest (room for the bloom of the rim)
let S = null;

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// key light: from the upper left, a little toward the lens; bounce: gold light coming back from the lower right
const KX = -0.40, KY = -0.60, KZ = 0.693;
const BX = 0.55, BY = 0.5, BZ = 0.67;
// half vector between the key and the lens → where the pin highlight sits on a sphere
const HX = -0.218, HY = -0.327;

function build(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - TOP;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const Ht = new Float32Array(N), Hu = new Float32Array(N);   // top storey (scrolls, granules, rim) / the net underneath
  let Hh = Ht;
  const rnd = L.rng('s27-filigree');
  const nz = L.makeNoise('s27');

  // ── oblique projection of the lid: V (surface px inward from the rim band) → depth below the arc + magnification ──
  const D0 = 66, VMAX = 900;
  const dT = new Float32Array(VMAX + 2), mT = new Float32Array(VMAX + 2);
  {
    let d = D0;
    for (let v = 0; v <= VMAX + 1; v++) {
      const u = Math.min(1.3, v / 640);
      const m = 0.85 + 0.6 * Math.pow(u, 1.1), c = 0.58 + 0.34 * Math.pow(Math.min(1, u), 0.8);
      dT[v] = d; mT[v] = m; d += m * c;
    }
  }
  const mD = new Float32Array(1024);   // magnification by depth (for the shader)
  { let v = 0; for (let d = 0; d < 1024; d++) { while (v < VMAX && dT[v + 1] < d) v++; mD[d] = d < D0 ? 0.85 : mT[v]; } }
  const P = { x: 0, y: 0, m: 1, d: 0 };
  const mapUV = (U, V) => {
    const vf = V < 0 ? 0 : V > VMAX ? VMAX : V, v0 = vf | 0, t = vf - v0;
    const m = mT[v0] + (mT[v0 + 1] - mT[v0]) * t;
    const d = dT[v0] + (dT[v0 + 1] - dT[v0]) * t + (V < 0 ? V * 0.5 : 0);
    const rr = R - d, th = (U * m) / rr;
    P.x = cx + rr * Math.sin(th); P.y = cy - rr * Math.cos(th); P.m = m; P.d = d;
  };
  const onScreen = (mg) => P.x > X0 - mg && P.x < X0 + RW + mg && P.y < Y0 + RH + mg;

  // ── stamping ──
  const sphere = (x, y, r, z) => {
    const px = x - X0, py = y - Y0;
    let i0 = Math.ceil(px - r), i1 = Math.floor(px + r), j0 = Math.ceil(py - r), j1 = Math.floor(py + r);
    if (i1 < 0 || j1 < 0 || i0 >= RW || j0 >= RH) return;
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0; if (i1 >= RW) i1 = RW - 1; if (j1 >= RH) j1 = RH - 1;
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const dy = j - py, q0 = r2 - dy * dy; if (q0 <= 0) continue;
      let k = j * RW + i0;
      for (let i = i0; i <= i1; i++, k++) { const dx = i - px, q = q0 - dx * dx; if (q > 0) { const h = z + Math.sqrt(q); if (h > Hh[k]) Hh[k] = h; } }
    }
  };
  const gran = [];    // granules: x, y, r (screen), depth — 4 floats each
  const glint = [];   // lobes of the twisted wire that may catch the light: x, y, m, depth
  const uv = [0, 0];
  /**
   * a wire following fn(t) (which fills uv) on the lid. pitch > 0 → two strands twisted round each other (one full turn
   * per `pitch` surface px); pitch = 0 → plain round wire. r is the radius of the whole wire.
   */
  const wire = (fn, len, r, z, pitch, ph0, glintP) => {
    const n = Math.max(6, Math.ceil(len / (r * (pitch ? 0.26 : 0.42))));
    let xp = 0, yp = 0, s = 0, last = -1e9;
    for (let i = 0; i <= n; i++) {
      fn(i / n); mapUV(uv[0], uv[1]);
      const x = P.x, y = P.y, m = P.m, rad = r * m;
      if (!pitch) { sphere(x, y, rad, z * m); continue; }
      if (i === 0) { xp = x; yp = y; continue; }
      const dx = x - xp, dy = y - yp, l = Math.hypot(dx, dy) || 1e-6; s += l / m;
      xp = x; yp = y;
      const ph = (s / pitch) * TAU + ph0, A = 0.4 * rad, rs = 0.66 * rad, nx = -dy / l, ny = dx / l;
      const o = A * Math.sin(ph), zc = A * Math.cos(ph);
      sphere(x + nx * o, y + ny * o, rs, z * m + zc);
      sphere(x - nx * o, y - ny * o, rs, z * m - zc);
      const lobe = Math.floor(ph / Math.PI);
      if (lobe !== last) { last = lobe; if (glintP && rnd() < glintP) glint.push(x, y, m, P.d); }
    }
  };
  const granule = (U, V, r, zc) => {
    mapUV(U, V); if (!onScreen(30)) return;
    const rs = r * P.m; sphere(P.x, P.y, rs, zc * P.m); gran.push(P.x, P.y, rs, P.d);
  };

  // ── 1) the net underneath: loose wire rings ──
  Hh = Hu;
  {
    const RM = 17, rowH = RM * 1.732;
    for (let j = 0, V = 8; V < 760; j++, V += rowH) {
      mapUV(0, V); const uMax = (Math.asin(Math.min(1, 1180 / (R - P.d))) * (R - P.d)) / P.m + RM * 2;
      const kMax = Math.ceil(uMax / (RM * 2));
      for (let k = -kMax; k <= kMax; k++) {
        const U0 = (k + (j & 1) * 0.5) * RM * 2 + rnd.range(-2.5, 2.5), V0 = V + rnd.range(-2.5, 2.5);
        const rho = RM * rnd.range(0.92, 1.07), sq = rnd.range(0.88, 1.1), ph = rnd() * TAU;
        mapUV(U0, V0); if (!onScreen(60)) continue;
        wire((t) => { const f = t * TAU + ph; uv[0] = U0 + rho * Math.cos(f); uv[1] = V0 + rho * sq * Math.sin(f); }, rho * TAU, 3, 3.2, 0, 0, 0);
      }
    }
  }

  // ── 2) the scroll-work: honeycomb of coils, paired into S-scrolls; every third coil is a ringed rosette ──
  Hh = Ht;
  {
    const RHO = 56, rowH = RHO * 1.732, WR = 4.7, WZ = 10, PITCH = 30;
    const V0 = RHO + 3;
    for (let j = 0; j < 9; j++) {
      const Vr = V0 + j * rowH;
      mapUV(0, Vr); const uMax = (Math.asin(Math.min(1, 1180 / (R - P.d))) * (R - P.d)) / P.m + RHO * 4;
      const kMax = Math.ceil(uMax / (RHO * 2));
      const off = (j & 1) * RHO, flip = j & 1 ? 1 : -1;
      // coil k of this row: role by (k + shift) mod 3 → 0: left coil of an S, 1: its right coil, 2: rosette
      const shift = (j * 2) % 3;
      for (let k = -kMax; k <= kMax; k++) {
        const Uc = off + k * RHO * 2;
        const role = (((k + shift) % 3) + 3) % 3;
        const wob = 5 * nz.n2(Uc / 400, j * 1.7);          // rows waver a little
        mapUV(Uc, Vr); if (!onScreen(220)) continue;
        // granules in the two gaps this coil shares with the row below, and in the notches against the rim wire
        for (const [gu, gv] of [[Uc + RHO, Vr + RHO * 0.577], [Uc, Vr + RHO * 1.155]]) {
          const q = rnd();
          if (q < 0.05) continue;                                   // a granule lost
          if (q < 0.27) { const a0 = rnd() * TAU; for (let c = 0; c < 3; c++) granule(gu + 6.2 * Math.cos(a0 + c * 2.094), gv + 6.2 * Math.sin(a0 + c * 2.094), rnd.range(4.8, 5.9), 11.5); }
          else granule(gu + rnd.range(-2, 2), gv + rnd.range(-2, 2), rnd.range(6.8, 9.8), 13);
        }
        if (j === 0) granule(Uc + RHO + rnd.range(-1.5, 1.5), Vr - RHO * 0.66 + rnd.range(-1, 1), rnd.range(5.8, 7.6), 11);
        if (role === 2) {
          // rosette: a twisted ring, a big granule and six smaller ones round it
          const Ur = Uc + rnd.range(-2, 2), Vc = Vr + wob + rnd.range(-2, 2), rho = RHO * rnd.range(0.9, 0.96), ph = rnd() * TAU, sq = rnd.range(0.94, 1.05);
          wire((t) => { const f = t * TAU + ph; uv[0] = Ur + rho * Math.cos(f); uv[1] = Vc + rho * sq * Math.sin(f); }, rho * TAU, WR, WZ, PITCH, rnd() * TAU, 0.5);
          const r2 = rho * 0.56;
          wire((t) => { const f = t * TAU + ph; uv[0] = Ur + r2 * Math.cos(f); uv[1] = Vc + r2 * sq * Math.sin(f); }, r2 * TAU, WR * 0.9, WZ - 0.6, PITCH * 0.9, rnd() * TAU, 0.4);
          const rc = rnd.range(10.6, 12.8), a0 = rnd() * TAU;
          granule(Ur, Vc, rc, 15.5);
          for (let c = 0; c < 6; c++) granule(Ur + (rc + 6.4) * Math.cos(a0 + c * 1.0472), Vc + (rc + 6.4) * Math.sin(a0 + c * 1.0472), rnd.range(5.6, 7), 12.5);
          for (let c = 0; c < 6; c++) if (rnd() < 0.85) granule(Ur + rho * 0.78 * Math.cos(a0 + 0.52 + c * 1.0472), Vc + rho * 0.78 * Math.sin(a0 + 0.52 + c * 1.0472), rnd.range(4.2, 5.6), 11.5);
          continue;
        }
        if (role === 1) continue;        // drawn together with its left partner
        // S-scroll centred between coil k and coil k+1
        const Us = Uc + RHO + rnd.range(-3, 3), Vs = Vr + wob + rnd.range(-3, 3);
        const ang = rnd.range(-0.17, 0.17), ca = Math.cos(ang), sa = Math.sin(ang), sc = rnd.range(0.92, 1.05);
        for (const side of [-1, 1]) {
          const turns = rnd.range(1.95, 2.65), phiMax = turns * TAU, rho0 = RHO * sc, sq = rnd.range(0.92, 1.06);
          wire((t) => {
            const phi = phiMax * t, rho = rho0 * (1 - 0.83 * Math.pow(t, 0.9)), f = Math.PI + flip * phi;
            const lx = side * (rho0 + rho * Math.cos(f)), ly = side * rho * sq * Math.sin(f);
            uv[0] = Us + lx * ca - ly * sa; uv[1] = Vs + lx * sa + ly * ca;
          }, rho0 * phiMax * 0.57, WR, WZ, PITCH, rnd() * TAU, 0.6);
          // the granule soldered on the eye of the coil
          granule(Us + side * rho0 * ca, Vs + side * rho0 * sa, rnd.range(8.6, 12), 15);
        }
      }
    }
  }

  // ── 3) the rim: twisted rope on the arc, a row of beads against it, a plain wire inside ──
  const span = a.span(PAD + 40);
  {
    const RS = 9.5, A = 6, DC = RS + 0.637 * A + 0.3, Z0 = 15;
    const n = Math.ceil((2 * span * R) / 0.8), step = (2 * span * R) / n;
    let ph = 1.3;
    for (let i = 0; i <= n; i++) {
      const th = -span + (2 * span * i) / n;
      ph += (step / (76 * (1 + 0.16 * nz.n2(th * 11, 3.1)))) * TAU;
      const rj = 1 + 0.04 * nz.n2(th * 60, 8.8);
      for (let k = 0; k < 2; k++) {
        const f = ph + k * Math.PI, rr = R - DC + A * Math.sin(f);
        sphere(cx + rr * Math.sin(th), cy - rr * Math.cos(th), RS * rj, Z0 + A * Math.cos(f));
      }
      if (i % 50 === 25 && rnd() < 0.5) { const rr = R - DC; glint.push(cx + rr * Math.sin(th), cy - rr * Math.cos(th) - 3, 1.5, DC); }
    }
    // beads
    const RB = 17, DB = 41, rB = R - DB;
    let th = -span;
    while (th < span) {
      const rb = RB * rnd.range(0.9, 1.08), dj = rnd.range(-1.6, 1.6);
      th += (rb * 0.99) / rB;
      const rr = rB - dj, x = cx + rr * Math.sin(th), y = cy - rr * Math.cos(th);
      sphere(x, y, rb, 15 + rnd.range(-1, 1));
      gran.push(x, y, rb, DB + dj);
      // solder fillet between neighbouring beads
      th += (rb * 0.99) / rB;
      if (rnd() < 0.7) { const xs = cx + (rB + 6) * Math.sin(th), ys = cy - (rB + 6) * Math.cos(th); sphere(xs, ys, rnd.range(4, 6.5), 9); }
    }
    // plain inner wire
    const n2 = Math.ceil((2 * span * R) / 1.4);
    for (let i = 0; i <= n2; i++) {
      const t2 = -span + (2 * span * i) / n2, rr = R - 61 + 0.8 * nz.n2(t2 * 20, 5.5);
      sphere(cx + rr * Math.sin(t2), cy - rr * Math.cos(t2), 4.3, 5);
    }
  }

  // ── 4) shading ──
  const mk = (stops) => { const f = L.makeRamp(stops), o = new Uint8ClampedArray(1024 * 3); for (let i = 0; i < 1024; i++) { const c = f((i / 1023) * 1.4); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; } return o; };
  const NEAR = mk([[0, '#080300'], [0.1, '#2c1503'], [0.22, '#5e3407'], [0.4, '#a66d12'], [0.58, '#d9a02a'], [0.76, '#e9b949'], [0.94, '#f8d87a'], [1.12, '#fff3c0'], [1.4, '#fffbee']]);
  const DEEP = mk([[0, '#080300'], [0.1, '#321303'], [0.22, '#6b3206'], [0.4, '#b4620c'], [0.58, '#de8e1c'], [0.76, '#efb03a'], [0.94, '#f9d06a'], [1.12, '#ffecb4'], [1.4, '#fff8e0']]);
  const QW = (RW >> 2) + 2, QH = (RH >> 2) + 2;
  const bloomBuf = new Float32Array(QW * QH);
  const poolAt = (d, st) => {
    const dd = d < 0 ? 0 : d, sx = st + 0.05;
    return (0.5 + 0.9 * Math.exp(-Math.pow(dd / 380, 1.25))) * (1 - 0.3 * sstep(0.08, 0.6, sx) - 0.14 * sstep(0.2, 0.62, -sx));
  };
  /** height field → RGBA canvas. under = the lower storey: dimmer, warmer, no cast shadows of its own */
  const shade = (Hraw, under) => {
    // soften by one pixel (anti-aliasing of the stamps) + coverage
    const Hs = new Float32Array(N), Cs = new Float32Array(N), tmp = new Float32Array(N), tmc = new Float32Array(N);
    for (let j = 0; j < RH; j++) for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i;
      tmp[k] = (Hraw[k - 1] + 2 * Hraw[k] + Hraw[k + 1]) * 0.25;
      tmc[k] = ((Hraw[k - 1] > 0 ? 1 : 0) + (Hraw[k] > 0 ? 2 : 0) + (Hraw[k + 1] > 0 ? 1 : 0)) * 0.25;
    }
    for (let j = 1; j < RH - 1; j++) for (let i = 0; i < RW; i++) {
      const k = j * RW + i;
      Hs[k] = (tmp[k - RW] + 2 * tmp[k] + tmp[k + RW]) * 0.25;
      Cs[k] = (tmc[k - RW] + 2 * tmc[k] + tmc[k + RW]) * 0.25;
    }
    // coarse blurred height for contact occlusion
    let Hq = new Float32Array(QW * QH), Hq2 = new Float32Array(QW * QH);
    for (let j = 0; j < RH; j++) { const qj = (j >> 2) * QW; for (let i = 0; i < RW; i++) Hq[qj + (i >> 2)] += Hraw[j * RW + i] * 0.0625; }
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < QH; j++) for (let i = 1; i < QW - 1; i++) { const k = j * QW + i; Hq2[k] = (Hq[k - 1] + Hq[k] + Hq[k + 1]) / 3; }
      for (let j = 1; j < QH - 1; j++) for (let i = 0; i < QW; i++) { const k = j * QW + i; Hq[k] = (Hq2[k - QW] + Hq2[k] + Hq2[k + QW]) / 3; }
    }
    const img = new ImageData(RW, RH), D = img.data;
    const dim = under ? 0.5 : 1, rough = under ? 0.1 : 0.22;
    for (let j = 1; j < RH - 1; j++) {
      const ddy = cy - (Y0 + j);
      const qy = (j - 1.5) / 4, qj0 = Math.max(0, qy | 0), ty = Math.max(0, qy - qj0);
      for (let i = 1; i < RW - 1; i++) {
        const k = j * RW + i, cov = Cs[k];
        if (cov < 0.03) continue;
        const h = Hs[k];
        const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr, st = ddx / rr;
        const m = mD[d < 0 ? 0 : d > 1023 ? 1023 : d | 0];
        let gx = (Hs[k + 1] - Hs[k - 1]) * 0.55 + (hash(i, j) - 0.5) * rough, gy = (Hs[k + RW] - Hs[k - RW]) * 0.55 + (hash(j + 91, i - 17) - 0.5) * rough;
        const g2 = gx * gx + gy * gy; if (g2 > 9) { const s = 3 / Math.sqrt(g2); gx *= s; gy *= s; }
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1), nx = -gx * inv, ny = -gy * inv, nzz = inv;
        // mirror direction → soft key, sheen, the gold's own bounce, a little sky from the far side
        const rx = 2 * nzz * nx, ry = 2 * nzz * ny, rz = 2 * nzz * nzz - 1;
        const rk = rx * KX + ry * KY + rz * KZ, rb = rx * BX + ry * BY + rz * BZ;
        let lum = 0.06 + 0.7 * Math.exp(-(1 - rk) * 2.3) + 0.6 * Math.exp(-(1 - rk) * 16) + 0.12 * Math.exp(-(1 - rb) * 3) + 0.08 * (ry < 0 ? -ry : 0);
        // contact occlusion from the blurred height
        const qx = (i - 1.5) / 4, qi0 = Math.max(0, qx | 0), tx = Math.max(0, qx - qi0), qk = qj0 * QW + qi0;
        const hb = (Hq[qk] + (Hq[qk + 1] - Hq[qk]) * tx) * (1 - ty) + (Hq[qk + QW] + (Hq[qk + QW + 1] - Hq[qk + QW]) * tx) * ty;
        let ao = (hb - h) / (10 * m); ao = ao < 0 ? 0 : ao > 1 ? 1 : ao;
        // short cast shadow toward the lower right
        let sh = 0;
        if (!under && j > 14 && i > 11) { const s1 = Hs[k - 7 * RW - 6] - h - 8.8, s2 = Hs[k - 14 * RW - 11] - h - 17, sm = s1 > s2 ? s1 : s2; sh = sm <= 0 ? 0 : sm > 4 ? 1 : sm / 4; }
        // the pool of light on the mound: strongest on the rim left of the crest, dying down the slope and to the right
        lum *= (1 - 0.6 * sh) * (1 - 0.6 * ao) * dim * poolAt(d, st);
        const li = (lum >= 1.4 ? 1023 : (lum / 1.4) * 1023 | 0) * 3, dm = under ? 1 : 0.8 * sstep(120, 520, d);
        const o = k * 4;
        D[o] = NEAR[li] + (DEEP[li] - NEAR[li]) * dm; D[o + 1] = NEAR[li + 1] + (DEEP[li + 1] - NEAR[li + 1]) * dm; D[o + 2] = NEAR[li + 2] + (DEEP[li + 2] - NEAR[li + 2]) * dm;
        D[o + 3] = cov >= 0.8 ? 255 : cov <= 0.2 ? 0 : ((cov - 0.2) / 0.6) * 255;
        if (!under && lum > 0.9) bloomBuf[(j >> 2) * QW + (i >> 2)] += (lum - 0.9) * 0.0625;
      }
    }
    const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(img, 0, 0);
    return c;
  };
  const top = shade(Ht, false), net = shade(Hu, true);

  // the two storeys together: the net lies a little out of focus and in the shadow of the scrolls
  const lace = L.makeCanvas(RW, RH), lg = lace.getContext('2d');
  lg.filter = 'blur(1.1px)'; lg.drawImage(net, 0, 0); lg.filter = 'none';
  {
    const shadow = L.makeCanvas(RW, RH), hg = shadow.getContext('2d');
    hg.filter = 'blur(4px)'; hg.drawImage(top, 5, 7); hg.filter = 'none';
    hg.globalCompositeOperation = 'source-in'; hg.fillStyle = '#0a0300'; hg.fillRect(0, 0, RW, RH);
    lg.globalCompositeOperation = 'source-atop'; lg.globalAlpha = 0.7; lg.drawImage(shadow, 0, 0);
    lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
  }
  lg.drawImage(top, 0, 0);
  // old gold is never even: slow clouds of duller and brighter metal
  L.overlayOn(lace, L.noiseTex(RW, RH, { seed: 's27patina', scale: 240, octaves: 3, res: 0.125, contrast: 1.5, ramp: [[0, '#5c5148'], [0.5, '#808080'], [1, '#a9a69c']] }), { blend: 'soft-light', alpha: 0.7 });

  // ── 5) what the lens does ──
  const cocAt = (x, d) => 11 * sstep(190, 640, d) * (0.55 + 0.45 * sstep(190, 640, d)) + 2.2 * sstep(620, 1000, Math.abs(x - cx));
  const lightAt = (x, y) => { const ddx = x - cx, ddy = cy - y, rr = Math.hypot(ddx, ddy); return poolAt(R - rr, ddx / rr); };
  // sprites
  const dot = L.makeCanvas(32, 32); { const g = dot.getContext('2d'); g.fillStyle = L.radial(g, 16, 16, 0, 16, [[0, 'rgba(255,253,240,1)'], [0.34, 'rgba(255,246,204,0.92)'], [0.62, 'rgba(255,226,140,0.32)'], [1, 'rgba(255,210,110,0)']]); g.fillRect(0, 0, 32, 32); }
  const pin = L.makeCanvas(96, 96); { const g = pin.getContext('2d'); g.fillStyle = L.radial(g, 48, 48, 0, 48, [[0, 'rgba(255,253,242,1)'], [0.05, 'rgba(255,249,224,0.95)'], [0.11, 'rgba(255,238,176,0.5)'], [0.26, 'rgba(255,208,104,0.17)'], [0.55, 'rgba(240,170,60,0.05)'], [1, 'rgba(233,160,50,0)']]); g.fillRect(0, 0, 96, 96); }
  const disc = L.makeCanvas(64, 64); { const g = disc.getContext('2d'); g.fillStyle = L.radial(g, 32, 32, 0, 32, [[0, 'rgba(255,190,84,0.7)'], [0.62, 'rgba(255,192,86,0.76)'], [0.82, 'rgba(255,214,128,1)'], [0.92, 'rgba(255,186,84,0.5)'], [1, 'rgba(255,176,70,0)']]); g.fillRect(0, 0, 64, 64); }

  // the steady pin highlight of every granule that lies in focus, baked in
  const G = [];
  lg.globalCompositeOperation = 'lighter';
  for (let q = 0; q < gran.length; q += 4) {
    const x = gran[q], y = gran[q + 1], rs = gran[q + 2], d = gran[q + 3];
    const coc = cocAt(x, d), e = lightAt(x, y), hx = x + HX * rs * 1.05, hy = y + HY * rs * 1.05, k = 0.3 + 0.7 * Math.pow(rnd(), 1.6);
    if (coc < 3.2) {
      const sz = Math.max(1.8, rs * 0.3);
      lg.globalAlpha = L.clamp(0.95 * e * (0.55 + 0.45 * k)); lg.drawImage(dot, hx - X0 - sz, hy - Y0 - sz, sz * 2, sz * 2);
      lg.globalAlpha = L.clamp(0.3 * e * k); lg.drawImage(pin, hx - X0 - rs * 1.9, hy - Y0 - rs * 1.9, rs * 3.8, rs * 3.8);
    }
    G.push({ x: hx, y: hy, r: rs, coc, e, ph: rnd(), per: rnd.range(2.3, 5.2), k });
  }
  lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
  const T = [];
  for (let q = 0; q < glint.length; q += 4) {
    const x = glint[q], y = glint[q + 1], coc = cocAt(x, glint[q + 3]);
    T.push({ x: x + HX * 2.5 * glint[q + 2], y: y + HY * 2.5 * glint[q + 2], r: 2.6 * glint[q + 2], coc, e: lightAt(x, y), ph: rnd(), per: rnd.range(2.2, 4.4), k: 0.2 + 0.7 * Math.pow(rnd(), 2) });
  }

  // depth of field: base·(1−mask) + blurred·mask
  const ccx = cx - X0, ccy = cy - Y0;
  const mixIn = (base, topC, maskFn) => {
    const mc = L.makeCanvas(RW, RH), mg = mc.getContext('2d'); maskFn(mg);
    const tg = topC.getContext('2d'); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mc, 0, 0);
    const bg = base.getContext('2d'); bg.globalCompositeOperation = 'destination-out'; bg.drawImage(mc, 0, 0);
    bg.globalCompositeOperation = 'lighter'; bg.drawImage(topC, 0, 0); bg.globalCompositeOperation = 'source-over';
  };
  const ring = (g, d0, d1) => { g.fillStyle = L.radial(g, ccx, ccy, R - d1, R - d0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(0, 0, RW, RH); };
  const dof = L.makeCanvas(RW, RH); dof.getContext('2d').drawImage(lace, 0, 0);
  mixIn(dof, L.blurred(lace, 2.2), (g) => {
    ring(g, 150, 290);
    g.fillStyle = L.linear(g, 0, 0, 400, 0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(0, 0, 400, RH);
    g.fillStyle = L.linear(g, RW - 400, 0, RW, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); g.fillRect(RW - 400, 0, 400, RH);
  });
  mixIn(dof, L.blurred(lace, 5.5), (g) => ring(g, 290, 440));
  mixIn(dof, L.blurred(lace, 11), (g) => ring(g, 440, 640));

  // bloom of the hottest gold
  const bq = L.makeCanvas(QW, QH); {
    const bi = new ImageData(QW, QH), bd = bi.data;
    for (let k = 0; k < QW * QH; k++) { const v = Math.min(1, bloomBuf[k] * 5); bd[k * 4] = 255; bd[k * 4 + 1] = 206; bd[k * 4 + 2] = 110; bd[k * 4 + 3] = v * 255; }
    bq.getContext('2d').putImageData(bi, 0, 0);
  }
  const bloom = L.makeCanvas(RW, RH); { const g = bloom.getContext('2d'); g.filter = 'blur(9px)'; g.imageSmoothingEnabled = true; g.drawImage(bq, 0, 0, QW * 4, QH * 4); g.filter = 'none'; }

  // assemble: warm scatter inside the open-work, the lace, the bloom
  const gold = L.makeCanvas(RW, RH), gg = gold.getContext('2d');
  gg.translate(-X0, -Y0);
  gg.save(); a.clipBelow(gg, -5); gg.globalAlpha = 0.45; gg.drawImage(L.blurred(lace, 12), X0, Y0); gg.restore();
  gg.drawImage(dof, X0, Y0);
  gg.globalCompositeOperation = 'screen'; gg.globalAlpha = 0.75; gg.drawImage(bloom, X0, Y0);
  gg.globalCompositeOperation = 'source-over'; gg.globalAlpha = 1;

  return { gold, X0, Y0, G, T, pin, disc };
}

export default {
  name: '累丝金器',
  tone: 'light',
  init(env) {
    S = build(env);
    // a very few out-of-focus lights far behind, kept to the two sides (the text zone stays pure black)
    S.bokeh = [
      { x: 172, y: 512, r: 44, a: 0.2, par: 5 }, { x: 322, y: 596, r: 19, a: 0.3, par: 8 },
      { x: 1760, y: 486, r: 34, a: 0.18, par: -5 }, { x: 1858, y: 634, r: 52, a: 0.13, par: -7 },
    ];
  },
  draw(ctx, env, p) {
    const fi = Math.round(p * (env.frames - 1));
    ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.0055, 0.0055, p), zoom = L.lerp(1.0, 1.012, p);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const b of S.bokeh) { ctx.globalAlpha = b.a; const x = b.x + b.par * (p - 0.5) * 2; ctx.drawImage(S.disc, x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
    ctx.restore();
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.gold, S.X0, S.Y0);
      // the granules flare and die
      for (const list of [S.G, S.T]) {
        for (let i = 0; i < list.length; i++) {
          const q = list[i];
          const s = Math.sin(TAU * (fi / q.per + q.ph)); if (s <= 0.2) continue;
          const tw = Math.pow((s - 0.2) / 0.8, 2.5) * q.k * Math.min(1.15, q.e);
          if (tw < 0.04) continue;
          if (q.coc < 3.2) {
            const sz = (q.r * 0.9 + 5) * (0.6 + 1.3 * tw);
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, 0.25 + tw);
            ctx.drawImage(S.pin, q.x - sz, q.y - sz, sz * 2, sz * 2);
          } else {
            const sz = q.coc * 1.1 + q.r * 0.4;
            ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = Math.min(1, 0.05 + 0.55 * tw);
            ctx.drawImage(S.disc, q.x - sz, q.y - sz, sz * 2, sz * 2);
          }
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });
  },
};
