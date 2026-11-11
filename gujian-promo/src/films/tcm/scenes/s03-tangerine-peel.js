// s03 — 橘皮. The arc is the upper silhouette of a tangerine: an orange planet rising out of pure black.
//
// Everything below the arc is shaded per pixel in init(): each pixel is mapped onto the skin of a ball
// (U = distance along the horizon, V = distance from the limb toward the lens, both in surface px), so the oil-gland
// pits (油胞) are true circles on the fruit and get squashed toward the limb exactly like craters on a planet.
// (Close-up lens cheat: the skin turns toward the lens a little faster than the silhouette radius implies and is
// magnified toward the bottom of frame, so the nearest pits open up into readable round dimples and the lattice
// converges toward the horizon.) Macro lighting is a ramp over the elevation above the limb (dark-red rim → soft yellow band → orange →
// deep orange-red), which is rotation-symmetric, so the layer can spin about the arc's centre ("planet rotation")
// while the lateral light falloff stays put in draw().
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// colour ramp indexed by elevation angle above the limb (radians)
const AMAX = 0.84, NLUT = 1024;
function lut(stops) {
  const f = L.makeRamp(stops.map(([al, c]) => [al / AMAX, c])); const out = new Float32Array(NLUT * 3);
  for (let i = 0; i < NLUT; i++) { const c = f(i / (NLUT - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

const CELL = 46, ROWH = CELL * 0.8660254, JIT = 0.58, WARP = 30, DMIN = 31;   // oil glands: jittered hex lattice, warped, then relaxed → even but never in rows
const LU = -0.30, LV = -0.954;                                    // direction toward the light on the surface: far side, slightly left
const KR = 1.3;
const RE = 1680;                                                  // radius used for the foreshortening of the skin (see header)
const MAG0 = 0.86, MAG1 = 0.36 / 514;                             // magnification of the skin: MAG0 at the limb, growing with depth below the arc

/** the peel: everything below the arc, cropped to [X0, X0+RW) × [Y0, Y0+RH) in frame coords */
function buildPeel(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  const nA = L.makeNoise('s03tp-a'), nB = L.makeNoise('s03tp-b');

  //                 limb: narrow dark-red rim ……………… soft yellow highlight band ………… body orange ………… deep orange-red
  const RAMP = lut([[0, '#5a1206'], [0.03, '#7a1c07'], [0.05, '#a8330a'], [0.065, '#cf5310'], [0.085, '#ea7a16'], [0.115, '#f79c22'],
    [0.155, '#fdb836'], [0.2, '#ffcc4e'], [0.24, '#ffd35a'], [0.275, '#ffc846'], [0.32, '#fbae2e'], [0.38, '#f59820'], [0.44, '#f28c1b'],
    [0.5, '#e06a10'], [0.58, '#c4500c'], [0.7, '#a83a0a'], [0.8, '#96300a']]);

  // screen → skin. e = depth below the arc (px, radial). φ = how far the skin has turned toward the lens.
  const EMAX = H + PAD - a.crestY + 40, PHMAX = Math.acos(1 - EMAX / RE), NPH = 2048, VT = new Float32Array(NPH + 2);
  for (let n = 0, acc = 0; n <= NPH + 1; n++) { VT[n] = acc; acc += RE * (PHMAX / NPH) / (MAG0 + MAG1 * RE * (1 - Math.cos((n + 0.5) * PHMAX / NPH))); }
  const vOf = (e) => { const f = Math.min(NPH, Math.acos(1 - e / RE) / PHMAX * NPH), n = f | 0; return VT[n] + (VT[n + 1] - VT[n]) * (f - n); };

  // 1) slow fields on a coarse grid
  const CS = 5, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const fWx = new Float32Array(cw * ch), fWy = new Float32Array(cw * ch), fGu = new Float32Array(cw * ch), fGv = new Float32Array(cw * ch), fAlb = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), e = Math.max(0, R - Math.hypot(ddx, ddy));
    const U = R * Math.atan2(ddx, ddy) / (MAG0 + MAG1 * e), V = vOf(e), k = j * cw + i;
    fWx[k] = nB.n2(U / 250 + 5, V / 250); fWy[k] = nB.n2(U / 250 - 31, V / 250 + 19);
    const h0 = nA.fbm(U / 360, V / 360, 3), hu = nA.fbm((U + 12) / 360, V / 360, 3), hv = nA.fbm(U / 360, (V + 12) / 360, 3);
    fGu[k] = (hu - h0) * 0.27; fGv[k] = (hv - h0) * 0.27;      // gentle lumps of a loose-skinned mandarin
    fAlb[k] = nB.fbm(U / 480 + 70, V / 420 - 9, 3);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 2) the oil glands: one per lattice site, pushed about by jitter + a slow warp, then relaxed so no two pits ever merge
  const uMax = R * Math.atan2(W / 2 + PAD, cy - (H + PAD)) / MAG0 + 40, vMax = VT[NPH] + 40;
  const iLo = Math.floor(-uMax / CELL) - 4, NI = Math.ceil(uMax / CELL) + 4 - iLo + 1, jLo = -4, NJ = Math.ceil(vMax / ROWH) + 4 - jLo + 1;
  const NP = NI * NJ, PX = new Float32Array(NP), PY = new Float32Array(NP), PR = new Float32Array(NP), PD = new Float32Array(NP), PS = new Float32Array(NP),
    PC = new Float32Array(NP), PN = new Float32Array(NP), PK = new Float32Array(NP);
  const rp0 = L.rng('s03glands');
  for (let jj = 0; jj < NJ; jj++) for (let ii = 0; ii < NI; ii++) {
    const k = jj * NI + ii, lu = (ii + iLo + ((jj + jLo) & 1) * 0.5) * CELL, lv = (jj + jLo) * ROWH;
    PX[k] = lu + (rp0() - 0.5) * JIT * CELL + WARP * nB.n2(lu / 250 + 5, lv / 250);
    PY[k] = lv + (rp0() - 0.5) * JIT * ROWH + WARP * nB.n2(lu / 250 - 31, lv / 250 + 19);
    const big = rp0.chance(0.05);
    PR[k] = (8 + 5.5 * rp0()) * (big ? 1.25 : 1);      // pit radius (surface px): sizes differ a little
    const ang = rp0() * Math.PI; PC[k] = Math.cos(ang); PN[k] = Math.sin(ang); PK[k] = 0.93 + 0.14 * rp0();   // …and none is a perfect circle
    PD[k] = 0.3 + 0.16 * rp0();                         // depth / radius
    PS[k] = rp0() + (big ? 0.15 : 0);                   // how readily it still reads near the limb
  }
  for (let it = 0; it < 3; it++) for (let jj = 0; jj < NJ; jj++) for (let ii = 0; ii < NI; ii++) {
    const k = jj * NI + ii;
    for (let oj = 0; oj <= 2; oj++) for (let oi = -2; oi <= 2; oi++) {
      if (oj === 0 && oi <= 0) continue;
      const i2 = ii + oi, j2 = jj + oj; if (i2 < 0 || i2 >= NI || j2 >= NJ) continue;
      const k2 = j2 * NI + i2, dx = PX[k2] - PX[k], dy = PY[k2] - PY[k], dist = Math.hypot(dx, dy);
      if (dist < DMIN && dist > 0.01) { const f = (DMIN - dist) * 0.5 / dist; PX[k] -= dx * f; PY[k] -= dy * f; PX[k2] += dx * f; PY[k2] += dy * f; }
    }
  }

  // a few glands whose lit lip will flash as the fruit turns (screen position: theta along the arc, depth below it)
  const glints = [], rg = L.rng('s03glint'), sp = a.span(40);
  for (let n = 0; n < 4000 && glints.length < 16; n++) {
    const k = rg.int(0, NP - 1); if (PY[k] < 60) continue;
    let lo = 0, hi = EMAX; for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (vOf(mid) < PY[k]) lo = mid; else hi = mid; }
    const e = lo, m = MAG0 + MAG1 * e, th = PX[k] * m / R, al = Math.acos(1 - e / R);
    if (al < 0.2 || al > 0.5 || Math.abs(th) > sp * 0.8 || e > H - a.crestY - 30) continue;
    PS[k] = 2;                                                        // make sure this one is a fully formed pit
    glints.push({ th, dr: -(e + 0.72 * PR[k] * m * Math.sin(Math.acos(1 - e / RE))), ph: rg(), k: rg.range(0.5, 1), w: PR[k] * m });
  }

  // 3) shade
  const img = new ImageData(RW, RH), d = img.data;
  const lim = (R + 2.5) * (R + 2.5);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i + 0.5 - cx, rr2 = ddx * ddx + ddy * ddy;
      if (rr2 > lim) continue;
      const rr = Math.sqrt(rr2), e = rr < R ? R - rr : 0;
      const al = Math.acos(1 - e / R);                                  // true elevation above the limb → macro light
      const U = R * Math.atan2(ddx, ddy) / (MAG0 + MAG1 * e), V = vOf(e);

      // nearest oil gland (search in un-warped lattice space, measure in true surface space → pits stay round)
      const us = U - WARP * bil(fWx, i, j), vs = V - WARP * bil(fWy, i, j);
      const jr = Math.round(vs / ROWH);
      let best = 1e9, ex = 0, ey = 0, kk = 0;
      for (let jj = jr - 1; jj <= jr + 1; jj++) {
        const ic = Math.round(us / CELL - (jj & 1) * 0.5), row = (jj - jLo) * NI - iLo;
        for (let ii = ic - 1; ii <= ic + 1; ii++) {
          const k = row + ii, dx = U - PX[k], dy = V - PY[k], d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; ex = dx; ey = dy; kk = k; }
        }
      }
      const pc = PC[kk], pn = PN[kk], pk = PK[kk], rp = PR[kk];
      const xs = (ex * pc + ey * pn) / pk, ys = (ey * pc - ex * pn) * pk, dd = Math.sqrt(xs * xs + ys * ys), sN = dd / rp;
      // toward the limb only the deepest pits still read (the rest hide behind their own rims) → sparse dark specks
      const T = 0.97 - 1.12 * sstep(0.10, 0.46, al);
      const sel = sstep(0, 0.1, PS[kk] - T), base = 0.5 * sstep(0.12, 0.34, al);
      const vis = (base + (1 - base) * sel) * sstep(0.03, 0.11, al);

      let hU = 0, hV = 0, ao = 0;
      if (sN < 1.9 && dd > 0.01) {
        let sl = 0;                                                     // slope of the skin, climbing away from the gland
        if (sN < 1) { const w = 1 - sN * sN; sl = PD[kk] * 4 * sN * w; ao = w * w * vis; }
        // a faintly swollen shoulder round every pit → the bright lip
        const q = (sN - 1.1) / 0.28;
        sl -= 0.036 * Math.exp(-q * q) * 2 * q / 0.28;
        sl *= vis / dd;
        const gx = xs / pk, gy = ys * pk;
        hU = sl * (gx * pc - gy * pn); hV = sl * (gx * pn + gy * pc);
      } else if (sN < 1) ao = vis;
      const m1 = nA.n2(U / 52, V / 52), m2 = nA.n2(U / 52, (V + 4) / 52);
      const c1 = nB.n2(U / 4.2 + 40, V / 4.2), c2 = nB.n2(U / 4.2 + 40, (V + 1.6) / 4.2);
      const gu = bil(fGu, i, j), gv = bil(fGv, i, j);
      hU += gu; hV += gv + (m2 - m1) * 0.1 + (c2 - c1) * 0.035;

      const fr = sstep(0.05, 0.22, al);
      const rel = -(hU * LU + hV * LV) * KR * fr;

      // macro light: ramp over elevation, nudged by the slow lumps so the band edge is organic
      let a2 = al - (gv * 0.9 + (m2 - m1) * 0.03) * sstep(0.06, 0.2, al); a2 = a2 < 0 ? 0 : a2 > AMAX ? AMAX : a2;
      const li = ((a2 / AMAX) * (NLUT - 1) | 0) * 3;
      let cr = RAMP[li], cg = RAMP[li + 1], cb = RAMP[li + 2];
      const alb = bil(fAlb, i, j);
      cg *= 1 + 0.06 * alb; cb *= 1 + 0.1 * alb;
      // fine pores between the glands
      const po = nA.n2(U / 8.5 + 13, V / 8.5 - 7) - 0.58;
      const pf = po > 0 ? 1 - Math.min(0.1, po * 0.55) * sstep(0.18, 0.36, al) * (1 - ao) : 1;
      const st = 1 + 0.028 * c1 * fr * fr; cr *= st * pf; cg *= st * pf * pf; cb *= st * pf * pf;
      if (rel > 0) { const r2 = rel > 0.8 ? 0.8 : rel; cr *= 1 + 0.4 * r2; cg *= 1 + 0.7 * r2; cb *= 1 + 1.1 * r2; }
      else { const r2 = rel < -0.6 ? -0.6 : rel; cr *= 1 + 0.5 * r2; cg *= 1 + 0.85 * r2; cb *= 1 + 0.9 * r2; }
      if (ao > 0) { const k2 = ao * (1 + 0.3 * (1 - sstep(0.15, 0.42, al))); cr *= 1 - 0.3 * k2; cg *= 1 - 0.58 * k2; cb *= 1 - 0.7 * k2; }
      // waxy gloss: the lit lip of each pit flashes; fine glitter where the light rakes the band
      const band = 0.3 + 0.7 * sstep(0.52, 0.3, al);
      const sp = rel - 0.3;
      if (sp > 0) { const g2 = (sp > 0.4 ? 1 : sp * 2.5) * band; cr += 80 * g2; cg += 72 * g2; cb += 44 * g2; }
      if (c1 > 0.58) { const g3 = (c1 - 0.58) * 2.4 * band * sstep(0.16, 0.3, al) * (1 - ao); cr += 40 * g3; cg += 36 * g3; cb += 22 * g3; }
      const o = (j * RW + i) * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
    }
  }
  const raw = L.makeCanvas(RW, RH);
  raw.getContext('2d').putImageData(img, 0, 0);

  // 4) crisp silhouette on the arc; the far limb goes a touch soft (shallow depth of field)
  const peel = L.makeCanvas(RW, RH), g = peel.getContext('2d');
  g.translate(-X0, -Y0);
  g.save(); a.clipBelow(g, 0);
  g.drawImage(raw, X0, Y0);
  const soft = L.blurred(raw, 1.5), sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.radial(sg, cx - X0, cy - Y0, R - 110, R + 4, [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']]);
  sg.fillRect(0, 0, RW, RH);
  g.drawImage(soft, X0, Y0);
  g.restore();
  peel._x0 = X0; peel._y0 = Y0; peel._glints = glints;
  return peel;
}

export default {
  name: '橘皮',
  tone: 'light',
  init(env) {
    S = { peel: buildPeel(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#040302'; ctx.fillRect(0, 0, W, H);

    // narrow dark-red rim light lifting the fruit off the black
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 6, a.R + 46, [[0, 'rgba(200,64,14,0.6)'], [0.22, 'rgba(150,36,8,0.3)'], [0.55, 'rgba(90,18,6,0.1)'], [1, 'rgba(90,18,6,0)']]);
    ctx.fillRect(0, a.crestY - 60, W, 280);

    // the peel: glands slide round the centre like a planet turning
    const rot = L.lerp(-0.012, 0.012, p);
    ctx.save(); ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.peel, S.peel._x0, S.peel._y0);
    ctx.restore();

    // the light sits over the crest: both flanks and the lower corners sink into deep orange-red (the highlight drifts a little)
    const hx = L.lerp(880, 935, p), hy = a.crestY + 60;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.translate(hx, hy); ctx.scale(1.3, 1);
    ctx.fillStyle = L.radial(ctx, 0, 0, 180, 900, [[0, '#ffffff'], [0.26, '#fbd7ae'], [0.6, '#dc8c56'], [1, '#ad5028']]);
    ctx.fillRect(-2000, -1500, 4000, 3000);
    ctx.restore();

    // soft bloom of the highlight band
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'screen';
    ctx.translate(hx, a.crestY + 86); ctx.scale(6.4, 1);
    ctx.fillStyle = L.radial(ctx, 0, 0, 0, 100, [[0, 'rgba(255,214,110,0.3)'], [0.5, 'rgba(255,190,80,0.12)'], [1, 'rgba(255,170,60,0)']]);
    ctx.fillRect(-110, -110, 220, 220);
    ctx.restore();

    // pin-point glints on the lit lips of a few pits; each flares once as the skin slides under the light
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const q of S.peel._glints) {
      const tw = (0.18 + 0.82 * Math.pow(Math.max(0, Math.cos((p * 0.85 + q.ph) * L.TAU)), 3)) * q.k;
      a.at(ctx, q.th + rot, q.dr, () => {
        ctx.scale(1, 0.5);
        const r = q.w * 1.5;
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, r, [[0, `rgba(255,248,214,${0.9 * tw})`], [0.14, `rgba(255,232,160,${0.5 * tw})`], [0.45, `rgba(255,206,110,${0.1 * tw})`], [1, 'rgba(255,190,90,0)']]);
        ctx.fillRect(-r, -r, r * 2, r * 2);
      });
    }
    ctx.restore();
  },
};
