// s28 — 生石膏. Macro of the broken (longitudinal) face of a block of raw gypsum on black, almost monochrome.
// Raw gypsum is a fibrous aggregate: bundles of long parallel crystals standing side by side. Here the bundles run
// along the radii of the shared arc; their rounded tips line up into a softly scalloped upper edge that rides the arc.
//
// Everything below the arc is shaded per pixel in init():
//   1. a height field in surface coordinates (u = distance along the arc, v = depth below the edge) built from a
//      hierarchy of 1-D tables — ribs (the bundles) → sub-bundles → splinters → single fibres — plus splinter breaks
//      (横向断茬: every splinter snaps at its own depth), one spalled-off chip, loose powder crumbs and pits;
//   2. a ray-marched cast shadow from a low key light in the upper left (the grooves fall into black);
//   3. wrap-diffuse + a cool bounce fill, and the silk sheen: soft bands that lie ACROSS the fibres (chatoyancy).
// Two complete frames are baked with the sheen bands a few pixels apart; draw() cross-fades them while the block
// slides along the arc, so the sheen drifts over the ribs.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;       // the block only ever slides ~16 px, no zoom
const OUT = -999;      // height marker for "not stone"
const UM = 1460;       // the tables cover u ∈ [−UM, UM] px along the arc …
const Q = 4;           // … at 4 samples per px
const NU = 2 * UM * Q + 1;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash2 = (a, b) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
// height offset of segment `seg` of splinter `id`: −1…1, about 40 % of the segments stay flush
const stepOff = (id, seg) => { const v = hash2(id, seg) * 2 - 1, m = v < 0 ? -v : v; return m < 0.36 ? 0 : (v < 0 ? -1 : 1) * (m - 0.36) / 0.64; };
const bl = (f, k, cw, w00, w10, w01, w11) => f[k] * w00 + f[k + 1] * w10 + f[k + cw] * w01 + f[k + cw + 1] * w11;

/** smooth 1-D value noise, lattice spacing 1 */
function vnoise(seed) {
  const r = L.rng(seed), n = 8192, tab = new Float32Array(n);
  for (let i = 0; i < n; i++) tab[i] = r() * 2 - 1;
  return (x) => { const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f), a = tab[i & (n - 1)], b = tab[(i + 1) & (n - 1)]; return a + (b - a) * t; };
}
function split(r, total, n, vary) {
  const ws = []; let sum = 0;
  for (let i = 0; i < n; i++) { const w = 1 + vary * (r() * 2 - 1); ws.push(w); sum += w; }
  return ws.map((w) => (w / sum) * total);
}

/** everything that only depends on the position along the arc */
function buildTables() {
  const r = L.rng('s28-gypsum-5');
  // ── ribs: the big fibre bundles. Uneven widths; the crest sits right of the middle, so the flank that faces the
  //    light is broad and the far flank is short and steep ──
  const ribs = [];
  let u = -UM - 320, prevNarrow = true;
  while (u < UM + 320) {
    const roll = r(); let w, kind;
    if (roll < 0.17 && !prevNarrow) { w = r.range(56, 86); kind = 0; } else if (roll < 0.45) { w = r.range(112, 152); kind = 1; } else { w = r.range(160, 238); kind = 2; }
    prevNarrow = kind === 0;
    ribs.push({
      b0: u, w, kind, cf: r.range(0.52, 0.68), ch: w * r.range(0.26, 0.36),
      pk: kind === 0 ? r.range(-1, 2.5) : kind === 1 ? r.range(3.5, 6.5) : r.range(5.5, 8.5),   // how far the tip stands above the arc
      G: r.chance(0.18) ? r.range(8, 15) : r.range(0, 4.5),   // floor of the groove on its left
      vl: -r.range(6, 9.5),                                   // dip of the silhouette at that groove
      vb: r.range(105, 235), vb2: r.range(250, 340),   // where the silk sheen crosses this bundle (depth below the edge)
    });
    u += w;
  }
  let shift = 1e9;   // slide the lot so one broad bundle crests exactly on the centre line
  for (const rb of ribs) if (rb.kind === 2) { const c = rb.b0 + rb.w * rb.cf; if (Math.abs(c) < Math.abs(shift)) shift = c; }
  for (const rb of ribs) { rb.b0 -= shift; rb.b1 = rb.b0 + rb.w; rb.c = rb.b0 + rb.w * rb.cf; }

  // ── sub-bundles and splinters nest inside the ribs ──
  const groups = [], cols = [];
  ribs.forEach((rb, ri) => {
    const gws = split(r, rb.w, Math.max(1, Math.round(rb.w / r.range(46, 78))), 0.45);
    let gu = rb.b0;
    for (const gw of gws) {
      const gi = groups.length;
      groups.push({ u0: gu, w: gw, amp: r.range(2, 5), lift: r.range(-1.8, 1.8), ph: r.range(0, 900), len: r.range(300, 700), sAmp: r.chance(0.6) ? r.range(3, 7) : 0, slope: r.range(-0.3, 0.3), top: r.range(-0.8, 0.8), vb: r.range(-26, 26) });
      const cws = split(r, gw, Math.max(1, Math.round(gw / r.range(11, 21))), 0.6);
      let cu = gu;
      for (const w2 of cws) {
        cols.push({ u0: cu, w: w2, g: gi, rib: ri, amp: r.range(0.5, 1.8), ph: r.range(0, 900), len: r.range(110, 400), sAmp: r.chance(0.45) ? r.range(1, 3.2) : 0, top: r.range(-0.6, 0.6), jag: r.range(-16, 16), gd: r.chance(0.5) ? r.range(0.5, 2.6) : 0.2, vb: r.range(-9, 9), alb: r.chance(0.2) ? -r.range(0.05, 0.13) : r.range(-0.015, 0.02), chE: 0, chB: 0, chD: 0 });
        cu += w2;
      }
      gu += gw;
    }
  });

  // ── the chip (崩缺): a wedge of splinters has broken off the tip of one bundle, right of the caption. The edge drops
  //    in steps, and below it a scar runs down the lit flank: every splinter ends at its own depth, finer fibres show ──
  const chipAt = (uTarget, f0, width, eDrop, scarLen, scarDepth) => {
    let rb = null;
    for (const q of ribs) if (q.kind === 2 && (!rb || Math.abs(q.c - uTarget) < Math.abs(rb.c - uTarget))) rb = q;
    const ua = rb.b0 + (rb.c - rb.b0) * f0;
    const pick = cols.filter((c) => c.u0 + c.w / 2 >= ua && c.u0 + c.w / 2 <= Math.min(rb.c + 12, ua + width));
    pick.forEach((c, i) => {
      const m = Math.sin(Math.PI * (0.12 + 0.76 * (pick.length > 1 ? i / (pick.length - 1) : 0.5)));
      c.chE = eDrop * Math.pow(m, 0.6) * r.range(0.72, 1.1); c.chB = scarLen * (0.5 + 0.62 * m) * r.range(0.8, 1.2); c.chD = scarDepth * (0.55 + 0.55 * m);
    });
  };
  chipAt(440, 0.3, 92, 11, 150, 13);
  chipAt(-640, 0.45, 40, 6, 70, 7);

  const T = {
    prof: new Float32Array(NU), edge: new Float32Array(NU), corr: new Float32Array(NU), jag: new Float32Array(NU),
    fib1: new Float32Array(NU), fib2: new Float32Array(NU), fib0: new Float32Array(NU), gloss: new Float32Array(NU), dome: new Float32Array(NU), col: new Int16Array(NU),
  };
  const n1 = vnoise('s28f1'), n2 = vnoise('s28f2'), n3 = vnoise('s28f3'), n4 = vnoise('s28f4');
  const shape = (s) => Math.pow(0.5 - 0.5 * Math.cos(Math.PI * s), 0.8);
  cols.forEach((c, ci) => {
    const g = groups[c.g], rb = ribs[c.rib], nx = ribs[c.rib + 1] || rb;
    const i0 = Math.max(0, Math.ceil((c.u0 + UM) * Q)), i1 = Math.min(NU - 1, Math.ceil((c.u0 + c.w + UM) * Q) - 1);
    for (let iu = i0; iu <= i1; iu++) {
      const uu = iu / Q - UM;
      let p, e, dm;
      if (uu < rb.c) { const s = (uu - rb.b0) / (rb.c - rb.b0); dm = shape(s); p = rb.G + (rb.ch - rb.G) * (1 - Math.pow(1 - s, 1.9)); e = rb.vl + (rb.pk - rb.vl) * dm; }
      else { const s = (rb.b1 - uu) / (rb.b1 - rb.c); dm = shape(s); p = nx.G + (rb.ch - nx.G) * (1 - Math.pow(1 - s, 1.55)); e = nx.vl + (rb.pk - nx.vl) * dm; }
      T.dome[iu] = dm;
      const sg = ((uu - g.u0) / g.w) * 2 - 1, sc = ((uu - c.u0) / c.w) * 2 - 1;
      T.prof[iu] = p;
      const gp = g.amp * (1 - Math.pow(Math.abs(sg), 2.2)), cp = c.amp * (1 - sc * sc);
      T.corr[iu] = gp + cp + g.lift;
      T.edge[iu] = e + g.top + c.top + 0.3 * gp + 0.4 * cp + 0.4 * n1(uu / 1.3 + 400) - c.chE;
      T.col[iu] = ci;
      T.jag[iu] = c.jag + 5 * (hash2(Math.floor(uu / 2.7), 7) * 2 - 1);
      T.fib1[iu] = 0.2 * n1(uu / 1.7) + 0.32 * n1(uu / 3.5 + 91) + 0.3 * n1(uu / 7.5 + 317) + 0.4 * n1(uu / 17 + 733);
      T.fib2[iu] = 0.14 * n2(uu / 2.1) + 0.26 * n2(uu / 4.5 + 57) + 0.34 * n2(uu / 10.5 + 211);
      T.fib0[iu] = 0.5 * n3(uu / 1.4) + 0.45 * n3(uu / 3 + 77);
      T.gloss[iu] = 1.7 * Math.pow(L.clamp(0.5 + 0.5 * (0.62 * n4(uu / 1.6) + 0.38 * n4(uu / 5.2 + 19))), 2.4);
    }
  });
  // hairline gaps between neighbouring splinters
  for (const c of cols) {
    const ic = (c.u0 + UM) * Q;
    for (let iu = Math.max(0, Math.ceil(ic - 4 * Q)); iu <= Math.min(NU - 1, ic + 4 * Q); iu++) { const d = (iu - ic) / Q / 1.15; T.corr[iu] -= c.gd * Math.exp(-d * d); }
  }
  // the scalloped edge rides the arc: its mean over the visible width is dr = 0
  let m = 0, n = 0;
  for (let iu = (UM - 1000) * Q; iu <= (UM + 1000) * Q; iu++) { m += T.edge[iu]; n++; }
  m /= n;
  for (let iu = 0; iu < NU; iu++) T.edge[iu] -= m;

  const nc = cols.length, ng = groups.length;
  const C = { grp: new Int16Array(nc), ph: new Float32Array(nc), len: new Float32Array(nc), sAmp: new Float32Array(nc), vb: new Float32Array(nc), vb2: new Float32Array(nc), alb: new Float32Array(nc), chB: new Float32Array(nc), chD: new Float32Array(nc) };
  cols.forEach((c, i) => { C.grp[i] = c.g; C.ph[i] = c.ph; C.len[i] = c.len; C.sAmp[i] = c.sAmp; C.vb[i] = ribs[c.rib].vb + groups[c.g].vb + c.vb; C.vb2[i] = ribs[c.rib].vb2; C.alb[i] = c.alb; C.chB[i] = c.chB; C.chD[i] = c.chD; });
  const G = { ph: new Float32Array(ng), len: new Float32Array(ng), sAmp: new Float32Array(ng), slope: new Float32Array(ng), u0: new Float32Array(ng) };
  groups.forEach((g, i) => { G.ph[i] = g.ph; G.len[i] = g.len; G.sAmp[i] = g.sAmp; G.slope[i] = g.slope; G.u0[i] = g.u0 + g.w / 2; });
  return { T, C, G };
}

function boxBlur(src, w, h, rad) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = rad * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0; const o = y * w;
    for (let x = -rad; x <= rad; x++) acc += src[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc / n; const a = x + rad + 1, b = x - rad; acc += src[o + (a >= w ? w - 1 : a)] - src[o + (b < 0 ? 0 : b)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += tmp[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / n; const a = y + rad + 1, b = y - rad; acc += tmp[(a >= h ? h - 1 : a) * w + x] - tmp[(b < 0 ? 0 : b) * w + x]; }
  }
  return out;
}

/** dst = dst·(1−m) + src·m, m painted by paintMask as alpha */
function mixIn(dst, src, paintMask) {
  const g = dst.getContext('2d');
  const tmp = L.makeCanvas(dst.width, dst.height), t = tmp.getContext('2d');
  paintMask(t);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(tmp, 0, 0);
  t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-in'; t.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'lighter'; g.drawImage(tmp, 0, 0); g.restore();
}

function buildStone(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 16;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const T0 = performance.now(), tm = [], mark = (n) => tm.push(n + ':' + Math.round(performance.now() - T0));
  const { T, C, G } = buildTables(); mark('tables');
  const { prof, edge, corr, jag, fib1, fib2, fib0, gloss, dome, col } = T;

  // ── slow fields on a coarse grid ──
  const CS = 6, cw = Math.ceil(RW / CS) + 2, chh = Math.ceil(RH / CS) + 2, nA = L.makeNoise('s28a'), nB = L.makeNoise('s28b');
  const cWu = new Float32Array(cw * chh), cD1 = new Float32Array(cw * chh), cD2 = new Float32Array(cw * chh), cM = new Float32Array(cw * chh),
    cT = new Float32Array(cw * chh), cA = new Float32Array(cw * chh), cP = new Float32Array(cw * chh);
  for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, V = R - rr, k = j * cw + i;
    cWu[k] = 9 * nA.n2(U / 300, V / 260) + (Math.max(0, V) / 100) * 6.5 * nA.n2(U / 330 + 7, 1.7);   // the bundles wander and lean a little
    cD1[k] = 5 * nA.n2(U / 260 + 3, V / 520 + 40);
    cD2[k] = 5 * nB.n2(U / 200 - 11, V / 380 + 5);
    cM[k] = nB.n2(U / 260 + 60, V / 340);
    cT[k] = nA.fbm(U / 620 - 30, V / 240 + 9, 2);
    cA[k] = nB.fbm(U / 300 + 13, V / 520 - 21, 3);
    cP[k] = nA.fbm(U / 95 + 71, V / 95 + 33, 2);
  }

  mark('coarse');
  // ── 1) height field ──
  const Hh = new Float32Array(N), Cov = new Float32Array(N), Alb = new Float32Array(N), Glo = new Float32Array(N), Tlt = new Float32Array(N), Vb2 = new Float32Array(N);
  const RT = 70, RD = 40, DIP = 34;   // the tips roll over toward the edge
  const UQ = UM * Q, FMAX = NU - 2;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j), fy = j / CS, j0 = fy | 0, ty = fy - j0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), dr = rr - R;
      if (dr > 13) { Hh[k] = OUT; continue; }
      const fx = i / CS, i0 = fx | 0, tx = fx - i0, kk = j0 * cw + i0;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const V = -dr, up = Math.atan2(ddx, ddy) * R + bl(cWu, kk, cw, w00, w10, w01, w11);
      let fu = up * Q + UQ; fu = fu < 0 ? 0 : fu > FMAX ? FMAX : fu;
      const iu = fu | 0, tu = fu - iu;
      const E = edge[iu] + (edge[iu + 1] - edge[iu]) * tu, Vl = E - dr;
      if (Vl <= -0.5) { Hh[k] = OUT; continue; }
      const c = col[iu], g = C.grp[c];
      const relief = (0.6 + 0.4 * sstep(0, 380, V)) * (1 + 0.5 * bl(cM, kk, cw, w00, w10, w01, w11));
      let h = (prof[iu] + (prof[iu + 1] - prof[iu]) * tu) * relief + corr[iu] + (corr[iu + 1] - corr[iu]) * tu;
      // single fibres: two tables that drift against each other, so no fibre keeps its brightness for ever
      let f1 = fu + bl(cD1, kk, cw, w00, w10, w01, w11) * Q; f1 = f1 < 0 ? 0 : f1 > FMAX ? FMAX : f1;
      let f2 = fu + bl(cD2, kk, cw, w00, w10, w01, w11) * Q; f2 = f2 < 0 ? 0 : f2 > FMAX ? FMAX : f2;
      const a1 = f1 | 0, a2 = f2 | 0;
      const F1 = fib1[a1] + (fib1[a1 + 1] - fib1[a1]) * (f1 - a1), F2 = fib2[a2] + (fib2[a2 + 1] - fib2[a2]) * (f2 - a2);
      h += F1 + F2;
      // splinter breaks: each sub-bundle / splinter snaps at its own depth; the break line is ragged fibre by fibre
      const jg = jag[iu];
      if (G.sAmp[g] > 0) {
        const len = G.len[g], f = (V + jg + G.slope[g] * (up - G.u0[g]) + G.ph[g]) / len, sg = Math.floor(f), t = (f - sg) * len;
        h += stepOff(g, sg) * G.sAmp[g] * Math.exp(-t / 85) * (t < 1.2 ? t / 1.2 : 1);   // one lip stands proud at the break and settles back
      }
      if (C.sAmp[c] > 0) {
        const len = C.len[c], f = (V + jg + C.ph[c]) / len, sg = Math.floor(f), t = (f - sg) * len;
        h += stepOff(c + 4096, sg) * C.sAmp[c] * Math.exp(-t / 38) * (t < 1.2 ? t / 1.2 : 1);
      }
      let chip = 0;
      if (C.chD[c] > 0) {
        const vv = Vl + jg * 1.2, vb = C.chB[c];
        if (vv < vb) {
          chip = vv > vb - 1.5 ? (vb - vv) / 1.5 : 1;
          const sg = Math.floor((V + jg * 2 + C.ph[c]) / 58);
          h += chip * (-C.chD[c] * (0.45 + 0.55 * (1 - (vv > 0 ? vv : 0) / vb)) + fib0[iu] + 1.3 * stepOff(c + 9000, sg));   // finer fibres on the fresh break
        }
      }
      // the tips are rounded: the surface rolls over toward the edge, and dips further between neighbouring tips
      const Vd = Vl - (1 - dome[iu]) * DIP;
      if (Vd < RT) { let t = 1 - (Vd > 0 ? Vd : 0) / RT; if (t > 0.985) t = 0.985; h -= RD * (1 - Math.sqrt(1 - t * t)); }
      Hh[k] = h;
      Cov[k] = Vl + 0.5 > 1 ? 1 : Vl + 0.5;
      const ca = bl(cA, kk, cw, w00, w10, w01, w11);
      Alb[k] = 0.92 + 0.07 * ca + 0.1 * F2 + C.alb[c] * sstep(-0.25, 0.2, ca + 0.3 * F1) + 0.05 * chip;
      Glo[k] = (gloss[a1] + (gloss[a1 + 1] - gloss[a1]) * (f1 - a1)) * (1 + 0.5 * chip);
      Tlt[k] = V + jg * 1.3 - C.vb[c] + 26 * bl(cT, kk, cw, w00, w10, w01, w11);   // signed distance (px) from this splinter's sheen band
      Vb2[k] = C.vb2[c];
    }
  }

  mark('height');
  // ── fine tooth of the broken surface (stronger where powder lies) ──
  {
    const r = L.rng('s28grain'), wn = new Float32Array(N);
    for (let k = 0; k < N; k++) wn[k] = r() - 0.5;
    const gr = boxBlur(wn, RW, RH, 1);
    for (let j = 0; j < RH; j++) {
      const fy = j / CS, j0 = fy | 0, ty = fy - j0;
      for (let i = 0; i < RW; i++) {
        const k = j * RW + i; if (Hh[k] === OUT) continue;
        const fx = i / CS, i0 = fx | 0, tx = fx - i0, kk = j0 * cw + i0;
        const pm = bl(cP, kk, cw, (1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty);
        const gk = gr[k] * 3;
        Hh[k] += gk * (0.25 + 0.9 * sstep(0.15, 0.6, pm));
        Alb[k] += gk * 0.08;
        Glo[k] *= 1 - 0.4 * sstep(0.15, 0.6, pm);
      }
    }
  }
  let Hmax = -1e9, Hmin = 1e9;
  for (let k = 0; k < N; k++) { const h = Hh[k]; if (h === OUT) continue; if (h > Hmax) Hmax = h; if (h < Hmin) Hmin = h; }

  mark('grain');
  // ── powder crumbs (gather in the grooves and on ledges) and slit-like pits between fibres ──
  {
    const r = L.rng('s28crumb');
    let placed = 0;
    for (let n = 0; n < 60000 && placed < 2200; n++) {
      const pi = r.int(8, RW - 9), pj = r.int(8, RH - 9), k0 = pj * RW + pi;
      if (Hh[k0] === OUT) continue;
      const low = 1 - L.clamp((Hh[k0] + 4) / 40), u = r();
      if (u > 0.03 + 0.8 * low * low) continue;
      // angular flakes rather than round beads
      const rb = 1 + 3.4 * Math.pow(r(), 3.2), asp = r.range(0.45, 1), ang = r.range(0, Math.PI), ca = Math.cos(ang), sa = Math.sin(ang), hb = rb * r.range(0.4, 0.8), e = Math.ceil(rb);
      for (let dj = -e; dj <= e; dj++) for (let di = -e; di <= e; di++) {
        const ex = (di * ca + dj * sa) / rb, ey = (-di * sa + dj * ca) / (rb * asp), d2 = ex * ex + ey * ey; if (d2 >= 1) continue;
        const k = k0 + dj * RW + di; if (Hh[k] === OUT) continue;
        Hh[k] += hb * Math.pow(1 - d2, 0.4); Alb[k] = Math.max(Alb[k], 0.98); Glo[k] *= d2;
      }
      placed++;
    }
    for (let n = 0; n < 320; n++) {
      const pi = r.int(8, RW - 9), pj = r.int(22, RH - 23), k0 = pj * RW + pi;
      if (Hh[k0] === OUT || Cov[k0] < 1) continue;
      const rx = r.range(0.8, 1.6), ry = r.range(4, 14), dp = r.range(1.2, 3), sl = (pi + X0 - cx) / (cy - pj - Y0);   // slits follow the fibres
      for (let dj = -Math.ceil(ry); dj <= ry; dj++) for (let di = -3; di <= 3; di++) {
        const ex = (di + dj * sl) / rx, ey = dj / ry, d2 = ex * ex + ey * ey; if (d2 >= 1) continue;
        const k = k0 + dj * RW + di; if (Hh[k] === OUT) continue;
        Hh[k] -= dp * (1 - d2);
      }
    }
  }

  mark('crumbs');
  // ── 2) cast shadows: march every pixel toward the key light (upper left, low) ──
  const LX = -0.74, LY = -0.5, LZ = 0.45;
  const Lit = new Float32Array(N);
  {
    const ST = 2, hl = Math.hypot(LX, LY), sx = (LX / hl) * ST, sy = (LY / hl) * ST, rise = (LZ / hl) * ST, top = Hmax + 6;
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
      const k = j * RW + i, h0 = Hh[k];
      if (h0 === OUT) continue;
      let occ = 0, z = h0 + 0.5, px = i + 0.5, py = j + 0.5;
      for (let s = 1; s <= 84; s++) {
        z += rise; if (z > top) break;
        px += sx; py += sy; if (px < 0 || py < 0) break;
        const d = Hh[(py | 0) * RW + (px | 0)] - z;
        if (d > 0) { const q = d / (0.9 + 0.1 * s); if (q > occ) { occ = q; if (occ >= 1) break; } }
      }
      Lit[k] = 1 - (occ >= 1 ? 1 : occ * occ * (3 - 2 * occ));
    }
  }

  mark('shadow');
  // ── ambient occlusion from a coarse blur of the heights (keeps the grooves black under the fill light) ──
  const AS = 4, aw = Math.ceil(RW / AS) + 1, ah = Math.ceil(RH / AS) + 1;
  let Hb = new Float32Array(aw * ah);
  for (let j = 0; j < ah; j++) for (let i = 0; i < aw; i++) { const h = Hh[Math.min(RH - 1, j * AS) * RW + Math.min(RW - 1, i * AS)]; Hb[j * aw + i] = h === OUT ? -14 : h; }
  Hb = boxBlur(boxBlur(Hb, aw, ah, 4), aw, ah, 3);

  // ── 3) shade ──
  const ramp = L.makeRamp([[0, '#040506'], [0.05, '#0b0d0f'], [0.15, '#2a2c2e'], [0.34, '#8a8f92'], [0.56, '#cdd1d1'], [0.78, '#eef0ee'], [1, '#ffffff']]);
  const NL = 2048, IMAX = 1.25, lut = new Uint8ClampedArray(NL * 3);
  for (let q = 0; q < NL; q++) { const c = ramp(Math.min(1, (q / (NL - 1)) * IMAX)); lut[q * 3] = c[0]; lut[q * 3 + 1] = c[1]; lut[q * 3 + 2] = c[2]; }
  const FX = 0.7, FY = 0.35, FZ = 0.62;      // bounce fill from the lower right
  const KEY = 1.34, FILL = 0.12, AMB = 0.035, SHEEN = 1.0, DPH = 22, SIG = 44;
  const img0 = new ImageData(RW, RH), img1 = new ImageData(RW, RH), d0 = img0.data, d1 = img1.data;
  const BS = 4, BTOP = 64, bw = Math.ceil(RW / BS), bh = Math.ceil((RH + BTOP) / BS), bloomAcc = new Float32Array(bw * bh);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0, fy = j / AS, j0 = fy | 0, ty = fy - j0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, h = Hh[k];
      if (h === OUT) continue;
      const ddx = X0 + i - cx, V = R - Math.sqrt(ddx * ddx + ddy * ddy);
      let hl = Hh[k - (i > 0 ? 1 : 0)], hr = Hh[k + (i < RW - 1 ? 1 : 0)], hu = Hh[k + jm], hd = Hh[k + jp];
      if (hl === OUT) hl = h - 1.5; if (hr === OUT) hr = h - 1.5; if (hu === OUT) hu = h - 1.5; if (hd === OUT) hd = h - 1.5;
      const hx = (hr - hl) * 0.5, hy = (hd - hu) * 0.5, inv = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const ndl = (-hx * LX - hy * LY + LZ) * inv, ndf = (-hx * FX - hy * FY + FZ) * inv;
      const diff = ndl > -0.12 ? (ndl + 0.12) / 1.12 : 0;
      const fx = i / AS, i0 = fx | 0, tx = fx - i0, kk = j0 * aw + i0;
      const hb = bl(Hb, kk, aw, (1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty);
      let ao = 0.72 + (h - hb) / 26; ao = ao < 0.1 ? 0.1 : ao > 1 ? 1 : ao;
      const key = KEY * (1.05 - 0.27 * sstep(-400, 1000, ddx)) * (1 - 0.36 * sstep(160, 640, V));
      const lite = key * diff * Lit[k] * (0.72 + 0.28 * ao);
      const alb = Alb[k];
      const base = alb * (lite + FILL * (ndf > 0 ? ndf : 0) * ao + AMB * ao);
      const sh = SHEEN * (0.22 + 0.78 * Glo[k]) * (lite + 0.14 * key * Lit[k]), tl = Tlt[k], t2 = tl - Vb2[k];
      let e0 = tl / SIG, e1 = (tl - DPH) / SIG, g0 = t2 / (SIG * 1.5), g1 = (t2 - DPH) / (SIG * 1.5);
      const b0 = Math.exp(-e0 * e0) + 0.5 * Math.exp(-g0 * g0), b1 = Math.exp(-e1 * e1) + 0.5 * Math.exp(-g1 * g1);
      const I0 = base + sh * b0, I1 = base + sh * b1, o = k * 4, al = Cov[k] * 255;
      let q = ((I0 / IMAX) * (NL - 1)) | 0; q = (q < 0 ? 0 : q > NL - 1 ? NL - 1 : q) * 3;
      d0[o] = lut[q]; d0[o + 1] = lut[q + 1]; d0[o + 2] = lut[q + 2]; d0[o + 3] = al;
      q = ((I1 / IMAX) * (NL - 1)) | 0; q = (q < 0 ? 0 : q > NL - 1 ? NL - 1 : q) * 3;
      d1[o] = lut[q]; d1[o + 1] = lut[q + 1]; d1[o + 2] = lut[q + 2]; d1[o + 3] = al;
      const hot = (I0 + I1) * 0.5 - 0.74;
      if (hot > 0) bloomAcc[(((j + BTOP) / BS) | 0) * bw + ((i / BS) | 0)] += hot * Cov[k];
    }
  }
  mark('shade');
  const toCanvas = (img) => { const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(img, 0, 0); return c; };
  const c0 = toCanvas(img0), c1 = toCanvas(img1);

  // ── depth of field: sharp around the crest, softer toward the bottom of frame and the two ends ──
  const band = (t, r0, r1) => { t.fillStyle = L.radial(t, cx, cy, R - r1, R - r0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]); t.fillRect(X0, Y0, RW, RH); };
  const sides = (t, x0, x1) => {
    t.fillStyle = L.linear(t, cx - x1, 0, cx + x1, 0, [[0, 'rgba(0,0,0,1)'], [0.5 - (x0 / x1) * 0.5, 'rgba(0,0,0,0)'], [0.5 + (x0 / x1) * 0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    t.fillRect(X0, Y0, RW, RH);
  };
  for (const c of [c0, c1]) {
    const s1 = L.blurred(c, 2.4), s2 = L.blurred(c, 6);
    mixIn(c, s1, (t) => { t.translate(-X0, -Y0); band(t, 250, 480); sides(t, 640, 1000); });
    mixIn(c, s2, (t) => { t.translate(-X0, -Y0); band(t, 470, 700); sides(t, 900, 1160); });
  }

  mark('dof');
  // ── halation of the brightest fibres (quarter-res, drawn with 'screen') ──
  const bimg = new ImageData(bw, bh);
  for (let q = 0; q < bw * bh; q++) { const v = Math.min(1, (bloomAcc[q] / (BS * BS)) * 2.6); bimg.data[q * 4] = 232 * v; bimg.data[q * 4 + 1] = 240 * v; bimg.data[q * 4 + 2] = 244 * v; bimg.data[q * 4 + 3] = 255; }
  const bsm = L.makeCanvas(bw, bh); bsm.getContext('2d').putImageData(bimg, 0, 0);
  const bloom = L.blurred(bsm, 4.5);

  mark('bloom'); console.warn('s28 timing ' + tm.join(' '));
  return { c0, c1, bloom, X0, Y0, BX: X0, BY: Y0 - BTOP, BW: bw * BS, BH: bh * BS };
}

export default {
  name: '生石膏',
  tone: 'light',
  init(env) {
    S = buildStone(env);
  },
  draw(ctx, env, p) {
    ctx.fillStyle = '#040506'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.0068, 0.0068, p);
    L.cam(ctx, env, { rot }, () => {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(S.c0, S.X0, S.Y0);
      ctx.globalAlpha = L.clamp(p); ctx.drawImage(S.c1, S.X0, S.Y0);          // the sheen bands drift along the fibres
      ctx.globalAlpha = 0.42; ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(S.bloom, S.BX, S.BY, S.BW, S.BH);
    });
    L.vignette(ctx, { strength: 0.3, inner: 0.5, outer: 1.08 });
  },
};
