// s29 — 白瓷研钵. Macro of the outer wall of a white porcelain mortar: the arc is the outer silhouette of its thick,
// rounded lip. Below the arc the glazed wall — warm white, faint throwing rings, a few pinholes, powder-dusted finger marks,
// one underglaze cobalt line under the lip; lit from the upper left, the right third lying in a soft warm-grey cast shadow.
// Above the arc: finely ground cinnamon-brown powder heaped behind the mortar, rising and falling like small dunes.
//
// Both halves are shaded per pixel in init():
//   bowl   — every pixel is mapped to (U = distance along the rim, s = distance below the lip edge); a macro profile (rounded
//            lip → undercut → gently turning wall) plus a micro height field (throwing rings, glaze orange-peel, pinholes)
//            gives a normal that is lit with a wrapped diffuse term; the glossy highlights go to a separate layer so that
//            draw() can let them slide a little against the surface.
//   powder — a dune height field on a coarse grid (long lit slopes, short lee faces, marched cast shadows) plus
//            full-resolution lumps, clods and grains; it settles into a smooth hollow inside the text-safe zone above the crest.
// Each layer then gets a shallow depth of field: focus sits on the lip near the crest.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 96;
const LIP = 112;         // height of the rounded lip (px)
const RB = 1500;         // how quickly the wall turns away to the left / right (px of arc per unit of normal)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── cheap integer-hash value noise for the per-pixel passes (simplex is kept for the slow fields) ──
function hash(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
}

const UO = 1500, UN = UO * 2 + 4;
const uAt = (t, U) => { let f = U + UO; if (f < 0) f = 0; else if (f > UN - 2) f = UN - 2; const i = f | 0; return t[i] + (t[i + 1] - t[i]) * (f - i); };

/** mix a blurred copy of `c` back into it through a mask (maskFn draws the mask's fill style on the copy's context) */
function defocus(c, px, maskFn) {
  const soft = L.blurred(c, px), sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  maskFn(sg);
  const g = c.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.drawImage(soft, 0, 0); g.restore();
}

/** the porcelain: everything below the arc. Returns { bowl, spec, glow } (canvases cropped to the rows around / below the crest) */
function buildBowl(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 2;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s29a'), nB = L.makeNoise('s29b');
  const toXY = (U, s) => { const rr = R - s, th = U / R; return [cx + rr * Math.sin(th), cy - rr * Math.cos(th)]; };

  // ── profiles over s (px below the lip edge) ──
  const TS = 4, SMAX = 760, TN = SMAX * TS + 4;
  const tNr = new Float32Array(TN), tAo = new Float32Array(TN), tRing = new Float32Array(TN);
  const aL = LIP / 2, s1 = LIP * 0.8, s2 = LIP * 1.16;
  for (let i = 0; i < TN; i++) {
    const s = i / TS;
    let nr;
    if (s <= s1) nr = -(s - aL) / aL;                                              // the lip: a half-round bead
    else if (s <= s2) nr = L.lerp(-(s1 - aL) / aL, -0.05, sstep(s1, s2, s));       // undercut fillet back to the wall
    else nr = -0.05 - 0.62 * Math.pow((s - s2) / 560, 1.15);                       // the deep belly turns under
    tNr[i] = nr;
    const q = (s - LIP * 0.97) / (LIP * 0.16);
    tAo[i] = 1 - 0.27 * Math.exp(-q * q);
    tRing[i] = 0.42 * nA.n2(s / 33, 1.7) + 0.13 * nA.n2(s / 12.5 + 40, 5.1) + 0.035 * nA.n2(s / 5.2 + 80, 9.3);   // throwing rings (px of height)
  }
  const sAt = (t, s) => { let f = s * TS; if (f < 0) f = 0; else if (f > TN - 2) f = TN - 2; const i = f | 0; return t[i] + (t[i + 1] - t[i]) * (f - i); };

  // ── things that only vary along the rim ──
  const tW = new Float32Array(UN), tC = new Float32Array(UN), tD = new Float32Array(UN), tLip = new Float32Array(UN), tGrv = new Float32Array(UN);
  for (let i = 0; i < UN; i++) {
    const U = i - UO;
    tW[i] = 12.5 + 4.2 * nA.n2(U / 430, 21.3) + 1.5 * nA.n2(U / 61, 3.3) + 0.4 * nA.n2(U / 13, 8.8);     // half-width of the cobalt line
    tC[i] = 2 * nB.n2(U / 520, 4.2) + 0.6 * nB.n2(U / 47, 17.7);                                         // its centre wanders a hair
    tD[i] = 0.5 + 0.5 * nB.fbm(U / 210, 31.9, 3);                                                        // how loaded the brush was
    tLip[i] = Math.max(0, nA.fbm(U / 240, 77.1, 3) + 0.05) * 2;                                          // powder fallen on the lip
    tGrv[i] = Math.max(0, nB.fbm(U / 170, 55.5, 3) + 0.1) * 1.7;                                         // powder caught under the lip
  }

  // ── slow 2-D fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWob = new Float32Array(cw * ch), cAmp = new Float32Array(cw * ch), cTone = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, s = R - rr, k = j * cw + i;
    cWob[k] = 7 * nA.fbm(U / 620, s / 240, 2);
    cAmp[k] = 0.8 + 0.55 * nA.fbm(U / 380 + 9, s / 90 + 3, 2);
    cTone[k] = nB.fbm(U / 520 - 4, s / 420 + 11, 3);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── pass 1: polar coordinates + micro height field ──
  const Ua = new Float32Array(N), Sa = new Float32Array(N), Hh = new Float32Array(N), Cv = new Float32Array(N), PM = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 2) { Sa[k] = -9; continue; }
      const s = R - rr, U = Math.atan2(ddx, ddy) * R;
      Ua[k] = U; Sa[k] = s;
      const ring = sAt(tRing, s + bil(cWob, i, j)) * bil(cAmp, i, j) * (0.4 + 0.6 * sstep(LIP * 0.9, LIP * 1.4, s));
      Hh[k] = ring + 0.07 * vn(x / 11, y / 11) + 0.02 * vn(x / 4.3 + 7, y / 4.3 + 3);   // + the glaze's faint orange-peel
    }
  }

  // ── pinholes (棕眼): small pits where the glaze crawled back from a burst bubble ──
  const rp = L.rng('s29pits');
  const pits = [[-585, 262, 5.2], [-95, 236, 3.6], [-430, 418, 6.2], [228, 318, 4.2], [-790, 305, 3.4], [352, 452, 5], [-20, 300, 2.6]];
  for (let n = 0; n < 5; n++) pits.push([rp.range(-1200, 1200), rp.range(LIP * 1.9, 600), rp.range(2.4, 4.4)]);
  for (const [U0, s0, rad] of pits) {
    const [px, py] = toXY(U0, s0), depth = rad * 0.42, e = Math.ceil(rad * 1.6) + 2;
    for (let j = Math.max(1, Math.floor(py - e - Y0)); j <= Math.min(RH - 2, Math.ceil(py + e - Y0)); j++) {
      for (let i = Math.max(1, Math.floor(px - e - X0)); i <= Math.min(RW - 2, Math.ceil(px + e - X0)); i++) {
        const k = j * RW + i; if (Sa[k] < 0) continue;
        const dx = X0 + i - px, dy = Y0 + j - py, d2 = (dx * dx + dy * dy) / (rad * rad * 2.56);
        if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2);
        Hh[k] -= depth * f; Cv[k] = Math.max(Cv[k], Math.min(1, f * f * 2.2));
      }
    }
  }

  // ── finger marks: a dusty fingertip pressed on the glaze and slipped downward — a pad with broken friction ridges
  //    and a streaky tail of dragged powder ──
  function smudge(U0, s0, ra, rb, ang, lam, strength, drag, so) {
    const [px, py] = toXY(U0, s0), ca = Math.cos(ang), sa = Math.sin(ang), e = Math.ceil(Math.max(ra, rb) * 1.5 + drag) + 4;
    const i0 = Math.max(0, Math.floor(px - e - X0)), i1 = Math.min(RW - 1, Math.ceil(px + e - X0));
    const j0 = Math.max(0, Math.floor(py - e - Y0)), j1 = Math.min(RH - 1, Math.ceil(py + e - Y0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * RW + i; if (Sa[k] < 0) continue;
      const dx = X0 + i - px, dy = Y0 + j - py, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;   // u across the finger, +v the way it slipped
      if (v < -rb * 1.5 || v > drag * 1.05 + rb || Math.abs(u) > ra * 1.7) continue;
      const rag = 1 + 0.5 * (vn(i / 96 + so, j / 96) - 0.5) + 0.22 * (vn(i / 27, j / 27 + so) - 0.5);
      const dd = Math.sqrt((u / (u > 0 ? ra * 1.12 : ra * 0.92)) * (u / (u > 0 ? ra * 1.12 : ra * 0.92)) + (v / (v < 0 ? rb * 0.9 : rb * 1.1)) * (v / (v < 0 ? rb * 0.9 : rb * 1.1))) * rag;
      let val = 0;
      if (dd < 1.25) {
        const pad = 1 - sstep(0.42, 1.2, dd);
        // gently arched ridges, warped and worn away in patches
        const ph = Math.hypot(u * 0.9, v + rb * 1.7) + 22 * (vn(i / 70 + 3 + so, j / 70 + 7) - 0.5);
        const rd = 0.5 + 0.5 * Math.cos(ph * 6.2832 / lam);
        const keep = sstep(0.36, 0.62, vn(i / 52 + 60 + so, j / 52 + 13));
        const q = (dd - 0.8) / 0.15;
        const cres = Math.exp(-q * q) * sstep(-0.1, 0.8, -v / rb) * sstep(-0.9, 0.5, -u / ra) * 0.42;   // denser where the pad first touched
        const side = 0.75 + 0.35 * c01(0.5 - u / (2 * ra));                                              // more powder on one side of the pad
        val = pad * (0.4 + 0.5 * rd * rd * keep + 0.22 * (1 - keep)) * (0.5 + 0.5 * vn(i / 37 + so, j / 37 + 5)) * side + cres;
      }
      if (v > 0) {
        const tv = v / drag, wq = (u + 14 * Math.sin(v / 70 + so)) / (ra * (0.9 - 0.45 * tv));
        const tail = Math.exp(-wq * wq * 1.4) * (1 - sstep(0.05, 1, tv)) * 0.6;
        const tl = tail * (0.12 + 0.88 * vn(u / 5.2 + so, v / 150 + 2)) * (0.5 + 0.5 * vn(u / 19 + 9, v / 70 + so));
        if (tl > val) val = tl;
      }
      val *= strength;
      if (val > PM[k]) PM[k] = val;
    }
  }
  smudge(-170, 322, 84, 106, 0.3, 11.5, 0.66, 270, 0);
  smudge(120, 372, 68, 88, 0.12, 11.5, 0.42, 200, 40);

  // ── pass 2: shade ──
  const img = new ImageData(RW, RH), d = img.data, simg = new ImageData(RW, RH), sd = simg.data;
  let LX = -0.58, LY = 0.52, LZ = 0.63; { const m = Math.hypot(LX, LY, LZ); LX /= m; LY /= m; LZ /= m; }   // key light: upper left
  let HX = -0.42, HY = 0.62, HZ = 1.66; { const m = Math.hypot(HX, HY, HZ); HX /= m; HY /= m; HZ /= m; }   // half-vector of the soft-box the glaze mirrors
  const knee = (v) => (v > 0.93 ? 0.93 + 0.07 * (1 - Math.exp(-(v - 0.93) / 0.07)) : v);                    // soft shoulder so the whites never clip flat
  const KM = 1.9;                       // how strongly the micro relief tilts the normal
  const NT0 = -0.235;                   // where the soft-box reflection sits on the wall (normal's sideways component)
  const SB = LIP + 56;                  // cobalt line: distance below the lip edge
  const crestY = a.crestY;
  for (let j = 1; j < RH - 1; j++) {
    const y = Y0 + j, ddy = cy - y, yy = y - crestY;
    // edge of the cast shadow: runs from just right of the crest diagonally down to the right, softening as it goes
    const xb0 = 1105 + 0.86 * yy + 24 * Math.sin(yy / 150 + 0.4), pen = 54 + 0.1 * Math.max(0, yy);
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i; let s = Sa[k];
      if (s < -1) continue;
      const cov = c01(s + 0.5); if (s < 0) s = 0;
      const x = X0 + i, ddx = x - cx, rr = R - Sa[k], sn = ddx / rr, cs = ddy / rr, U = Ua[k];
      // macro normal in the local frame (t = along the rim, r = outward, z = toward the lens)
      const nr = sAt(tNr, s), nt = U / RB;
      const onLip = 1 - sstep(LIP * 0.7, LIP * 1.2, s);
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      const ntp = nt - KM * (hx * cs + hy * sn), nrp = nr - KM * (hx * sn - hy * cs);
      const nz = Math.sqrt(Math.max(0.02, 1 - ntp * ntp - nrp * nrp));
      const Lt = LX * cs - LY * sn, Lr = LX * sn + LY * cs;
      const lit = Math.pow(sstep(-0.15, 0.92, ntp * Lt + nrp * Lr + nz * LZ), 0.85);
      // the cast shadow over the right third (the lip stands proud, so the edge steps sideways across it)
      const xs = x + 6 * (vn(x / 90, y / 90) - 0.5);
      const sh = sstep(xb0 - pen, xb0 + pen, xs), deep = sh * sstep(0, 700, xs - xb0);
      // the proud lip also throws a soft band of shadow onto the wall right beneath it
      const shl = sstep(LIP * 0.72, LIP * 0.92, s) * (1 - sstep(LIP * 1.02, LIP * 1.42, s));
      const direct = 1.15 * lit * (1 - 0.97 * sh) * (1 - 0.72 * shl);
      const ambK = sAt(tAo, s) * (1 - 0.15 * sstep(240, 640, s)) * (1 - 0.1 * sh - 0.26 * deep);
      const up = nrp > 0 ? nrp : 0, warm = sh * Math.exp(-s / 170);
      const eR = 0.76 * ambK + 0.05 * up + 0.24 * direct + 0.03 * warm - 0.02 * deep, eG = 0.72 * ambK + 0.012 * up + 0.28 * direct + 0.008 * warm - 0.006 * deep,
        eB = 0.675 * ambK - 0.03 * up + 0.325 * direct - 0.012 * warm + 0.035 * deep;

      // ── albedo ──
      const tone = bil(cTone, i, j), hk = Hh[k];
      let ar = 0.957 * (1 + 0.012 * tone + 0.014 * hk), ag = 0.941 * (1 + 0.008 * tone + 0.016 * hk), ab = 0.902 * (1 - 0.006 * tone + 0.02 * hk);
      const pq = (s - LIP * 1.05) / (LIP * 0.085), pool = Math.exp(-pq * pq);          // glaze pools a touch greener under the lip
      ar *= 1 - 0.07 * pool; ag *= 1 - 0.025 * pool; ab *= 1 - 0.01 * pool;
      // the cobalt line, painted on the wheel under the glaze
      let blue = 0, jb = 0; if (U > -700 && U < -590) jb = Math.sin(Math.PI * (U + 700) / 110);  // where the brush lapped its own start
      const hw = uAt(tW, U) + 3 * jb, sC = SB + uAt(tC, U) + 2 * jb, e = Math.abs(s - sC) - hw;
      if (e < 18) {
        const m = 1 - sstep(-1.5, 1.5, e), halo = e > 0 ? 0.2 * Math.exp(-e / 3.6) : 0.2;
        const dn = 0.5 + 0.46 * uAt(tD, U) + 0.16 * sstep(-hw, hw, s - sC) - 0.36 * (vn(U / 60, s / 2) - 0.5) + 0.22 * jb
          + 0.28 * sstep(0.7, 0.9, vn(U / 24 + 9, s / 7 + 3));                         // heaped-and-piled dark flecks
        const t = c01((dn - 0.3) / 0.9);
        const cr = (50 - 34 * t) / 255, cg = (102 - 58 * t) / 255, cb = (196 - 80 * t) / 255;
        const mm = Math.max(m * Math.min(1, 0.55 + 0.5 * dn), halo * (1 - m));
        ar += (cr - ar) * mm; ag += (cg - ag) * mm; ab += (cb - ab) * mm; blue = m;
      }
      // pinholes: brown inside
      const cav = Cv[k];
      if (cav > 0) { const o = cav * 0.82; ar += (0.42 - ar) * o; ag += (0.28 - ag) * o; ab += (0.16 - ab) * o; }
      // powder on the glaze: finger marks, grains on the lip and a little caught in the undercut
      let pm = PM[k];
      const gq = (s - LIP * 1.03) / 5;
      pm += 0.45 * uAt(tGrv, U) * Math.exp(-gq * gq);
      const h1 = hash(i, j), hc = hash(i >> 1, j >> 1);
      // powder is made of grains: a thin film plus specks whose number follows the density
      let ma = 0;
      if (pm > 0.012) { const th = 0.13 + 0.4 * pm; ma = 0.62 * pm * (0.7 + 0.6 * h1) + 0.5 * (1 - sstep(th - 0.07, th + 0.07, vn(x / 1.7 + 11, y / 1.7 + 3))) * (0.7 + 0.3 * h1); }
      if (hc < 0.0002 + 0.003 * uAt(tLip, U) * Math.exp(-s / 18)) ma = 0.7;          // single grains
      if (ma > 0.9) ma = 0.9;
      if (ma > 0.002) {
        const gv = 0.72 + 0.5 * hash(i + 37, j + 91);
        ar += (0.6 * gv - ar) * ma; ag += (0.38 * gv - ag) * ma; ab += (0.185 * gv - ab) * ma;
      }

      let r = ar * eR, g = ag * eG, b = ab * eB;
      // grazing reflection of the powder right at the silhouette
      const eb = 0.2 * Math.exp(-s / 3) * (1 - 0.5 * sh);
      r += (0.5 - r) * eb; g += (0.33 - g) * eb; b += (0.18 - b) * eb;
      const o = k * 4;
      d[o] = knee(r) * 255; d[o + 1] = knee(g) * 255; d[o + 2] = knee(b) * 255; d[o + 3] = cov * 255;

      // ── glossy highlights (kept apart so they can slide) ──
      const Ht = HX * cs - HY * sn, Hr = HX * sn + HY * cs, ndh = ntp * Ht + nrp * Hr + nz * HZ;
      let sp = 0;
      if (ndh > 0.9) sp = 1.2 * Math.pow(ndh, 260) + 0.3 * Math.pow(ndh, 34);
      const lc = (nrp - 0.34) / 0.12;
      sp = sp * onLip + 0.1 * Math.exp(-lc * lc) * onLip;                               // + a faint sheen all along the lip
      // soft-box reflection on the wall: a broad band and a slim companion
      const vfade = sstep(LIP * 1.15, LIP * 1.5, s) * (1 - sstep(250, 520, s));
      const nb = NT0 + 0.00011 * (s - 200);                                             // the reflection leans a little as the wall turns
      const bq = Math.abs(ntp - nb), bq2 = Math.abs(ntp - (nb - 0.14));
      sp += (0.72 * (1 - sstep(0.04, 0.074, bq)) + 0.4 * (1 - sstep(0.008, 0.024, bq2))) * vfade * (1 - 0.5 * blue);
      sp *= (1 - 0.97 * sh) * (1 - 0.6 * shl) * (1 - Math.min(1, ma * 1.6)) * (1 - 0.8 * cav);
      if (sp > 0.004) { sd[o] = 255; sd[o + 1] = 254; sd[o + 2] = 250; sd[o + 3] = Math.min(1, sp) * cov * 255; }
    }
  }
  const bowl = L.makeCanvas(RW, RH), bg = bowl.getContext('2d');
  bg.putImageData(img, 0, 0);
  const spec = L.makeCanvas(RW, RH);
  spec.getContext('2d').putImageData(simg, 0, 0);

  // hairline scratches from years of wiping (mostly round the bowl) and a few iron specks — drawn only onto the porcelain
  bg.save(); bg.globalCompositeOperation = 'source-atop'; bg.translate(-X0, -Y0); bg.lineCap = 'round';
  const rs = L.rng('s29scratch');
  for (let n = 0; n < 40; n++) {
    const U0 = rs.range(-1150, 1150), s0 = rs.range(LIP * 1.3, 620), len = rs.range(50, 280), tilt = rs.chance(0.25) ? rs.range(-0.6, 0.6) : rs.range(-0.05, 0.05);
    const al = rs.range(0.05, 0.13), lw = rs.range(0.6, 1.1), pts = [];
    for (let t = 0; t <= 8; t++) { const u = t / 8 - 0.5; pts.push(toXY(U0 + len * u, s0 + tilt * len * u)); }
    const run = (dy, style) => { bg.strokeStyle = style; bg.lineWidth = lw; bg.beginPath(); pts.forEach((p, t) => (t ? bg.lineTo(p[0], p[1] + dy) : bg.moveTo(p[0], p[1] + dy))); bg.stroke(); };
    run(0, `rgba(122,108,90,${al})`); run(0.9, `rgba(255,255,255,${al * 1.3})`);
  }
  for (let n = 0; n < 18; n++) {
    const [px, py] = toXY(rs.range(-1200, 1200), rs.range(LIP * 1.25, 640));
    bg.fillStyle = `rgba(96,66,40,${rs.range(0.2, 0.5)})`;
    bg.beginPath(); bg.arc(px, py, rs.range(0.6, 1.5), 0, L.TAU); bg.fill();
  }
  bg.restore();

  // shallow depth of field: sharp on the lip near the crest, softer toward the sides and the bottom of frame
  const ex = cx - X0, ey = a.crestY + 40 - Y0;
  const ring = (g, r0, r1) => {
    g.save(); g.translate(ex, ey); g.scale(1, 0.62);
    g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(-3000, -3000, 6000, 6000); g.restore();
  };
  defocus(bowl, 1.8, (g) => ring(g, 430, 820));
  defocus(bowl, 4.2, (g) => ring(g, 760, 1250));
  defocus(spec, 2.4, (g) => ring(g, 520, 1100));
  // bloom of the highlights + a soft edge light riding the lit part of the rim (it may spill a little over the silhouette)
  const GH = 48, gl0 = L.makeCanvas(RW, RH + GH), gg = gl0.getContext('2d');
  gg.drawImage(spec, 0, GH);
  gg.translate(-X0, GH - Y0);
  gg.strokeStyle = L.linear(gg, X0, 0, X0 + RW, 0, [[0, 'rgba(255,250,238,0.5)'], [0.32, 'rgba(255,250,238,0.85)'], [0.5, 'rgba(255,250,238,0.55)'], [0.585, 'rgba(255,250,238,0)'], [1, 'rgba(255,250,238,0)']]);
  gg.lineWidth = 5; a.stroke(gg, -2.5);
  const glow = L.blurred(gl0, 9);
  bowl._x0 = X0; bowl._y0 = Y0; spec._x0 = X0; spec._y0 = Y0; glow._x0 = X0; glow._y0 = Y0 - GH;
  return { bowl, spec, glow };
}

/** the ground powder heaped behind the mortar: everything above the arc */
function buildPowder(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, crestY = a.crestY;
  const X0 = -PAD, Y0 = -PAD;
  const PW = W + PAD * 2, PH = Math.ceil(a.yAt(X0)) + 10 - Y0, N = PW * PH;
  const nA = L.makeNoise('s29p'), nB = L.makeNoise('s29q');
  // the powder settles into a smooth hollow over the crest (the text-safe zone sits well inside it)
  const flat = (x, y) => { const ex = (x - cx) / 545, ey = (y - (crestY - 110)) / 350; return 1 - sstep(0.74, 1.3, Math.sqrt(ex * ex + ey * ey)); };

  // ── dunes on a coarse grid: crests run from lower left to upper right, across the light ──
  const CS = 4, gw = Math.ceil(PW / CS) + 3, gh = Math.ceil(PH / CS) + 3;
  const Hd = new Float32Array(gw * gh), Fl = new Float32Array(gw * gh), Cv = new Float32Array(gw * gh), Lc = new Float32Array(gw * gh);
  const WL = 390, RISE = 0.72;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * gw + i, f = flat(x, y);
    Fl[k] = f;
    const p = x * 0.788 - y * 0.616, q = x * 0.616 + y * 0.788;          // along the crests / across them (toward the lee side)
    let ph = (q + 80 * nA.fbm(x / 620 + 5, y / 620 - 2, 2)) / WL + 0.2 * nA.fbm(p / 900 + 3, q / 700, 2) + 0.3;
    ph -= Math.floor(ph);
    const prof = ph < RISE ? Math.pow(ph / RISE, 1.3) : Math.pow(1 - (ph - RISE) / (1 - RISE), 1.8);   // long windward slope, sharp crest, short slip face
    const amp = 40 * (0.72 + 0.28 * c01(0.5 + 0.9 * nB.fbm(x / 520 + 7, y / 520 + 1, 2)));
    const big = nA.fbm(x / 900 + 3, y / 620 + 9, 2), sm = nB.fbm(x / 130 + 13, y / 105 - 7, 2);
    Hd[k] = (amp * prof + 14 * big + 4 * sm) * (1 - 0.975 * f) + 1.1 * sm * f;
    Cv[k] = nA.fbm(x / 300 - 20, y / 300 + 40, 3);
  }
  const hAt = (fx, fy) => {
    if (fx < 0) fx = 0; else if (fx > gw - 1.001) fx = gw - 1.001;
    if (fy < 0) fy = 0; else if (fy > gh - 1.001) fy = gh - 1.001;
    const i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * gw + i0;
    return (Hd[k] + (Hd[k + 1] - Hd[k]) * tx) * (1 - ty) + (Hd[k + gw] + (Hd[k + gw + 1] - Hd[k + gw]) * tx) * ty;
  };
  // raking light from the upper left, 30° above the surface; crests throw real shadows
  const lx = -0.675, ly = -0.537, lz = 0.5, tanE = 0.577;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    const hx = (Hd[j * gw + Math.min(gw - 1, i + 1)] - Hd[j * gw + Math.max(0, i - 1)]) / (2 * CS);
    const hy = (Hd[Math.min(gh - 1, j + 1) * gw + i] - Hd[Math.max(0, j - 1) * gw + i]) / (2 * CS);
    const nd = (-hx * lx - hy * ly + lz) / Math.sqrt(1 + hx * hx + hy * hy);
    let occ = 0; const h0 = Hd[k];
    for (let t = 1; t <= 20; t++) { const dd = t * 7, o = hAt(i - 0.78 * dd / CS, j - 0.62 * dd / CS) - h0 - dd * tanE; if (o > occ) occ = o; }
    Lc[k] = Math.max(0.2, nd) * 1.1 * (1 - 0.42 * sstep(0, 9, occ));
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * gw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + gw], b1 = src[k + gw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── full-resolution lumps and grain ──
  const Hm = new Float32Array(N), Sd = new Float32Array(N), Tn = new Float32Array(N);
  const Rin = (R - 6) * (R - 6);
  for (let j = 0; j < PH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < PW; i++) {
      const x = X0 + i, ddx = x - cx;
      if (ddx * ddx + ddy * ddy < Rin) continue;
      const k = j * PW + i;
      Hm[k] = 1.7 * vn(x / 23, y / 20) * (1 - 0.6 * bil(Fl, i, j)) + 1.1 * vn(x / 6.3 + 20, y / 5.9 + 11) + 0.5 * hash(i, j);
    }
  }
  // clods, dark coarse grains and pale chips: a bump in the height field, a tint, and a short shadow to the lower right
  function stamp(px, py, ra, rb, ang, hgt, tint, shadow, so) {
    const ca = Math.cos(ang), sa = Math.sin(ang), off = hgt * 1.5, e = Math.ceil(Math.max(ra, rb) * 1.4 + off) + 3;
    const i0 = Math.max(1, Math.floor(px - e - X0)), i1 = Math.min(PW - 2, Math.ceil(px + e - X0));
    const j0 = Math.max(1, Math.floor(py - e - Y0)), j1 = Math.min(PH - 2, Math.ceil(py + e - Y0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * PW + i, dx = X0 + i - px, dy = Y0 + j - py;
      const rag = 1 + 0.7 * (vn(i / 3.3 + so, j / 3.3) - 0.5);
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca, d2 = ((u / ra) * (u / ra) + (v / rb) * (v / rb)) * rag;
      if (d2 < 1) { const f = Math.pow(1 - d2, 0.7); Hm[k] += hgt * f; if (tint) { const m = Math.min(1, f * 3); Tn[k] += (tint - Tn[k]) * m; } }
      const sx = dx - off * 0.78, sy = dy - off * 0.62, us = sx * ca + sy * sa, vs = -sx * sa + sy * ca;
      const d2s = ((us / ra) * (us / ra) + (vs / rb) * (vs / rb)) / 1.5;
      if (d2s < 1 && d2 >= 0.8) { const q = shadow * (1 - d2s); if (q > Sd[k]) Sd[k] = q; }
    }
  }
  const rc = L.rng('s29clod');
  const inPowder = (x, y) => { const ddx = x - cx, ddy = cy - y; return ddx * ddx + ddy * ddy > (R + 8) * (R + 8); };
  for (let n = 0; n < 260; n++) {
    const x = rc.range(X0, X0 + PW), y = rc.range(Y0, Y0 + PH), cl = vn(x / 170 + 3, y / 170 + 8), chn = rc();
    if (flat(x, y) > 0.05 || !inPowder(x, y) || (cl < 0.56 && chn > 0.1)) continue;
    const r = 5 + Math.pow(rc(), 2) * 15;
    stamp(x, y, r * rc.range(0.85, 1.3), r * rc.range(0.65, 1), rc.range(0, Math.PI), r * 0.42, 0, 0.3, n);
  }
  for (let n = 0; n < 46; n++) {
    const x = rc.range(X0, X0 + PW), y = rc.range(Y0, Y0 + PH);
    if (flat(x, y) > 0.03 || !inPowder(x, y)) continue;
    const r = rc.range(3.4, 7.5) * (rc.chance(0.15) ? 1.5 : 1);
    stamp(x, y, r * rc.range(0.9, 1.4), r * rc.range(0.6, 0.95), rc.range(0, Math.PI), r * 0.55, -0.92, 0.42, n + 600);
  }
  for (let n = 0; n < 16; n++) {
    const x = rc.range(X0, X0 + PW), y = rc.range(Y0, Y0 + PH);
    if (flat(x, y) > 0.03 || !inPowder(x, y)) continue;
    stamp(x, y, rc.range(8, 17), rc.range(2, 3.6), rc.range(0, Math.PI), 1.7, 0.7, 0.28, n + 900);
  }

  // ── shade ──
  const ramp = L.makeRamp([[0, '#2a1709'], [0.115, '#422711'], [0.23, '#5d3a1b'], [0.33, '#744a23'], [0.423, '#8a5a2e'], [0.577, '#a96d33'], [0.73, '#c2853f'], [0.92, '#d59b50'], [1, '#dca75c']]);
  const NL = 1024, lut = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const img = new ImageData(PW, PH), d = img.data;
  const Rin2 = (R - 5) * (R - 5);
  for (let j = 1; j < PH - 1; j++) {
    const y = Y0 + j, ddy = cy - y;
    const xbp = 1470 + 0.42 * (y - crestY) + 40 * Math.sin(y / 170 + 1.1);
    for (let i = 1; i < PW - 1; i++) {
      const x = X0 + i, ddx = x - cx, rr2 = ddx * ddx + ddy * ddy;
      if (rr2 < Rin2) continue;
      const k = j * PW + i;
      let lit = bil(Lc, i, j) + 0.075 * (Hm[k + 1 + PW] - Hm[k - 1 - PW]);
      // the same thing that shades the bowl's right third also dims the powder toward the upper right
      const shp = sstep(xbp - 110, xbp + 110, x);
      lit = ((lit - 0.5) * (1 - 0.4 * shp) + 0.5) * (1 - 0.46 * shp) * (1 - Sd[k]);
      lit *= 1.07 - 0.13 * sstep(300, 1900, Math.hypot(x - 200, y - 100));
      // contact shadow of the rim, widening to the right where the lip blocks the light
      const dr = Math.sqrt(rr2) - R;
      if (dr < 130) {
        const U = Math.atan2(ddx, ddy) * R, wC = 20 + 74 * sstep(-500, 1200, U);
        lit *= (1 - 0.74 * Math.exp(-Math.max(0, dr) / 9)) * (1 - 0.6 * (1 - sstep(wC * 0.25, wC, dr)));
      }
      const li = ((lit < 0 ? 0 : lit > 1.3 ? 1 : lit / 1.3) * (NL - 1) | 0) * 3;
      let r = lut[li], g = lut[li + 1], b = lut[li + 2];
      let gm = 0.91 + 0.18 * hash(i * 3 + 1, j * 7 + 5);
      const g2 = hash(i + 911, j + 577);
      if (g2 > 0.992) gm *= 0.64; else if (g2 < 0.01) gm *= 1.26;
      const cv = bil(Cv, i, j);
      r *= gm * (1 + 0.04 * cv); g *= gm; b *= gm * (1 - 0.08 * cv);
      const tn = Tn[k];
      if (tn < 0) { const m = -tn * 0.85, q = 0.55 + 0.8 * lit; r += (62 * q - r) * m; g += (36 * q - g) * m; b += (17 * q - b) * m; }
      else if (tn > 0) { const m = tn * 0.8, q = 0.45 + 0.75 * lit; r += (204 * q - r) * m; g += (152 * q - g) * m; b += (94 * q - b) * m; }
      const o = k * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(PW, PH);
  c.getContext('2d').putImageData(img, 0, 0);
  // depth of field: the heap falls out of focus as it recedes from the rim
  const band = (g, d0, d1) => { g.fillStyle = L.radial(g, cx - X0, cy - Y0, R + d0, R + d1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); g.fillRect(0, 0, PW, PH); };
  defocus(c, 2, (g) => band(g, 70, 260));
  defocus(c, 3.2, (g) => band(g, 360, 820));
  c._x0 = X0; c._y0 = Y0;

  // a few grains that catch the light (drawn live so they can twinkle)
  const rk = L.rng('s29spark'), sparks = [];
  let guard = 0;
  while (sparks.length < 9 && guard++ < 400) {
    const x = rk.range(40, W - 40), y = rk.range(30, 640);
    if (flat(x, y) > 0.02 || a.drAt(x, y) < 60 || a.drAt(x, y) > 330 || x > 1380) continue;
    const pl = a.polar(x, y);
    sparks.push({ th: pl.theta, dr: pl.dr, ph: rk(), k: rk.range(0.6, 1), r: rk.range(1.3, 2.4) });
  }
  return { powder: c, sparks };
}

/** draw a cropped layer (canvas with _x0/_y0 in frame coordinates), rotated about the arc's centre */
function put(ctx, a, c, rot) {
  ctx.save();
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(c, c._x0, c._y0);
  ctx.restore();
}

export default {
  name: '白瓷研钵',
  tone: 'light',
  init(env) {
    const { bowl, spec, glow } = buildBowl(env);
    const { powder, sparks } = buildPowder(env);
    S = { bowl, spec, glow, powder, sparks };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0045, 0.0045, p), rp = rot * 0.4;
    // the powder behind: slides less (parallax)
    put(ctx, a, S.powder, rp);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of S.sparks) {
      const tw = Math.pow(Math.max(0, Math.cos((p * 0.9 + q.ph) * L.TAU)), 2) * q.k;
      if (tw < 0.04) continue;
      const pt = a.pt(q.th + rp, q.dr), gr = q.r * 6;
      ctx.fillStyle = L.radial(ctx, pt.x, pt.y, 0, gr, [[0, `rgba(255,238,196,${0.95 * tw})`], [0.18, `rgba(255,214,150,${0.5 * tw})`], [0.5, `rgba(240,170,96,${0.1 * tw})`], [1, 'rgba(240,170,96,0)']]);
      ctx.fillRect(pt.x - gr, pt.y - gr, gr * 2, gr * 2);
    }
    ctx.restore();
    // the mortar: surface detail slides along the arc …
    put(ctx, a, S.bowl, rot);
    // … and the glossy highlights drift a little further than the glaze they sit on
    const rs = rot + L.lerp(-0.0055, 0.0055, p);
    put(ctx, a, S.spec, rs);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55;
    put(ctx, a, S.glow, rs);
    ctx.restore();
  },
};
