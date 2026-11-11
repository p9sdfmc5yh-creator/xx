// s28 — 一摞银元的边齿. Extreme macro of a stack of machine-struck silver dollars seen edge-on, in hard raking light:
// almost a black-and-white picture. The arc is the rim of the topmost coin, its outline lifted into soft scallops by the
// crowns of the reeds; below it the reeds (边齿, straight, perpendicular to the coin's faces) run down the radius as
// silver bars with pure black grooves between them; lower down thin black seams follow the arc where the next coins of
// the stack begin, their reeds out of step with the ones above.
//
// Everything under the arc is built in init() as a height field on the UNROLLED edge (U = px along the arc, V = px below
// it): reeds with jittered width / height / shoulders, rounded coin corners, tilted wedge-shaped seams, dents, nicks,
// hairlines, pits and metal grain. It is then lit like a real cylinder: the key light comes from the upper left and rakes
// across the curve, so the left is flooded, the middle is all stripes, and past the terminator only the left shoulders of
// the reeds and the upturned rim still catch light. Cast shadows are swept across the height field along the light's
// direction (one pass, O(n)). Two bakes with the lamp a few degrees apart are cross-faded over the shot → the shadows
// breathe while the stack slides round the circle centre.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 56;            // the camera only slides ≤ 0.007 rad (≈ 17 px at the rim) and creeps in 1.4 %
const V0 = -16;            // first row of the unrolled field (px above the arc)
const KPHI = 1.7;          // how fast the coin's edge turns away from the lens across the frame (cylinder curvature, exaggerated)
const LY = -0.7;           // the key light also comes from above: shadows fall diagonally, down-right
const EDGE_A = 7, EDGE_C = 0;   // rim scallops: reed crowns stand 7 px above the arc, the notches dip 7 px below → mean on the arc
let S = null;

const sstep = (a, b, v) => { const t = (v - a) / (b - a); if (t <= 0) return 0; if (t >= 1) return 1; return t * t * (3 - 2 * t); };

// the two coins we see (the lower one is nearer the lens, so a touch larger) and the seam between them
const COIN = [
  { pitch: 112, th: 30, base: 0, lean: 0.012, bT: 10, bB: 15, vm: 160 },
  { pitch: 128, th: 33, base: 4, lean: -0.02, bT: 16, bB: 16, vm: 470 },
];
const SEAM = { v: 312, tilt: 0.0048, g0: 3.6, g1: 0.0014 };

// silver: light value → colour (cool, clean, near monochrome)
const SILVER = [[0, '#040506'], [0.07, '#090a0c'], [0.16, '#16181b'], [0.28, '#2a2d31'], [0.42, '#51565b'], [0.56, '#7f858b'], [0.7, '#aeb3b8'],
  [0.82, '#d2d6da'], [0.92, '#e9ecef'], [1, '#fbfcfd']];

/** one coin's reeds: jittered boundaries (groove centres) + per-reed character, with a half-pixel lookup table */
function makeTeeth(seed, pitch, uMin, uMax) {
  const r = L.rng(seed);
  const b = [uMin - pitch * (1.2 + r())], prm = [];
  while (b[b.length - 1] < uMax + pitch * 2) {
    const w = pitch * L.clamp(1 + 0.055 * r.gauss(), 0.87, 1.13);
    prm.push([1 + L.clamp(0.06 * r.gauss(), -0.15, 0.1), r.range(0.04, 0.1), r.range(0.6, 0.8), r.range(-0.28, 0.28), r.range(0.88, 1.03)]);
    b.push(b[b.length - 1] + w);
  }
  const n = prm.length;
  const tb = Float32Array.from(b), iw = new Float32Array(n), hf = new Float32Array(n), ga = new Float32Array(n), gb = new Float32Array(n), sk = new Float32Array(n), tal = new Float32Array(n);
  for (let i = 0; i < n; i++) { iw[i] = 1 / (b[i + 1] - b[i]); hf[i] = prm[i][0]; ga[i] = prm[i][1]; gb[i] = prm[i][2]; sk[i] = prm[i][3] / (Math.PI * 2); tal[i] = prm[i][4]; }
  const ns = Math.ceil((uMax - uMin) * 2) + 4, idx = new Int16Array(ns);
  for (let s = 0, t = 0; s < ns; s++) { const x = uMin + s * 0.5; while (tb[t + 1] <= x) t++; idx[s] = t; }
  return { tb, iw, hf, ga, gb, sk, tal, idx, x0: uMin, n };
}

function build(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const VH = Math.ceil(H + PAD - a.crestY) + 24 - V0;
  const UH = Math.ceil(R * Math.atan2(W / 2 + PAD, cy - (H + PAD))) + 8;
  const UW = UH * 2, N = UW * VH;
  const nA = L.makeNoise('s28a'), nB = L.makeNoise('s28b');
  const TWO_PI = Math.PI * 2;

  const _t0 = performance.now(); const _tm = []; const _mark = (n) => _tm.push(n + ' ' + (performance.now() - _t0).toFixed(0));
  const teeth = COIN.map((c, k) => makeTeeth('s28t' + k, c.pitch, -UH - 14, UH + 14));

  // ── per-column geometry: seam centre lines / gap half-widths, and the scalloped rim of the top coin ──
  const sc = new Float32Array(UW), sg = new Float32Array(UW);
  const edge = new Float32Array(UW);
  const rd0 = L.rng('s28ding'), dings = [];
  for (let n = 0; n < 8; n++) dings.push([rd0.range(-UH, UH), rd0.range(16, 36), rd0.range(1.6, 4.2)]);
  {
    const T = teeth[0], c0 = COIN[0];
    for (let i = 0; i < UW; i++) {
      const U = i - UH;
      sc[i] = SEAM.v + SEAM.tilt * U + 1.6 * nA.n2(U / 260, 1.7);
      sg[i] = Math.max(1.3, SEAM.g0 + SEAM.g1 * U + 1.3 * nA.n2(U / 190, 20));
      const x = U + c0.lean * (0 - c0.vm);
      let ti = T.idx[((x - T.x0) * 2) | 0]; if (x >= T.tb[ti + 1]) ti++;
      let u = (x - T.tb[ti]) * T.iw[ti]; u += T.sk[ti] * Math.sin(TWO_PI * u);
      const tri = 1 - Math.abs(2 * u - 1);
      const pe = sstep(0, 0.96, tri);                      // the outline is a soft wave, one swell per reed
      let e = EDGE_C - EDGE_A * (2 * pe - 1) * (0.86 + 0.14 * T.hf[ti]);
      for (const d of dings) { const q = (U - d[0]) / d[1]; if (q > -2.5 && q < 2.5) e += d[2] * Math.exp(-q * q) * pe; }
      edge[i] = e;
    }
  }

  _mark('geom');
  // ── slow fields on a coarse grid ──
  const CS = 6, cw = Math.ceil(UW / CS) + 2, ch = Math.ceil(VH / CS) + 2;
  const cLump = new Float32Array(cw * ch), cTone = new Float32Array(cw * ch), cTarn = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const U = i * CS - UH, V = j * CS + V0, k = j * cw + i;
    cLump[k] = nA.fbm(U / 64, V / 64, 3);
    cTone[k] = nB.fbm(U / 120 + 9, V / 70 - 4, 3);
    cTarn[k] = nA.fbm(U / 26 - 30, V / 44 + 11, 3);
  }
  // fine metal grain as a tile (two octaves)
  const GT = 512, grain = new Float32Array(GT * GT);
  for (let j = 0; j < GT; j++) for (let i = 0; i < GT; i++) grain[j * GT + i] = 0.45 * nA.n2(i / 5.4, j / 5.4 + 300) + 0.55 * nB.n2(i / 2.2 + 70, j / 2.2);

  _mark('noise');
  // ── knocks drawn with the 2D API: R = height (128 flat), G = how much silver is left (255 clean) ──
  const dc = L.makeCanvas(UW, VH), dg = dc.getContext('2d', { willReadFrequently: true });
  {
    const tmp = L.makeCanvas(UW, VH), g = tmp.getContext('2d');
    g.fillStyle = 'rgb(128,255,0)'; g.fillRect(0, 0, UW, VH);
    const r = L.rng('s28knock');
    for (let n = 0; n < 1500; n++) {                       // pits
      const x = r() * UW, y = r() * VH, rad = 0.6 + 2.2 * Math.pow(r(), 2.8);
      g.fillStyle = `rgba(${(36 + r() * 50) | 0},${(70 + r() * 110) | 0},0,${(0.45 + 0.55 * r()).toFixed(2)})`;
      g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.6, 1), r() * 3.14, 0, TWO_PI); g.fill();
    }
    for (let n = 0; n < 90; n++) {                         // dents and edge nicks
      const x = r() * UW, y = r() * VH, rx = r.range(4, 13) * (r.chance(0.15) ? 1.7 : 1), ry = rx * r.range(0.45, 0.9);
      g.save(); g.translate(x, y); g.rotate(r.range(-1.2, 1.2)); g.scale(1, ry / rx);
      const dep = (20 + r() * 60) | 0, sil = (150 + r() * 90) | 0;
      g.fillStyle = L.radial(g, 0, 0, 0, rx, [[0, `rgba(${dep},${sil},0,0.95)`], [0.55, `rgba(${dep},${sil},0,0.8)`], [1, `rgba(${dep},${sil},0,0)`]]);
      g.beginPath(); g.arc(0, 0, rx, 0, TWO_PI); g.fill();
      g.restore();
    }
    g.lineCap = 'round';
    for (let n = 0; n < 90; n++) {                         // hairline scratches: a groove with a raised burr beside it
      const x = r() * UW, y = r() * VH, ang = r.chance(0.6) ? r.range(-0.5, 0.5) : r.range(0.6, 1.4) * r.sign(), len = r.range(40, 230), lw = r.range(1, 2.1);
      const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      g.strokeStyle = `rgba(52,250,0,${r.range(0.45, 0.85).toFixed(2)})`; g.lineWidth = lw;
      g.beginPath(); g.moveTo(x - dx, y - dy); g.quadraticCurveTo(x + r.range(-6, 6), y + r.range(-6, 6), x + dx, y + dy); g.stroke();
      g.strokeStyle = `rgba(196,255,0,${r.range(0.25, 0.5).toFixed(2)})`; g.lineWidth = lw * 0.8;
      g.beginPath(); g.moveTo(x - dx, y - dy - lw); g.quadraticCurveTo(x + r.range(-6, 6), y - lw + r.range(-6, 6), x + dx, y + dy - lw); g.stroke();
    }
    for (let n = 0; n < 60; n++) {                         // long faint rub lines running round the edge
      const x = r() * UW, y = r() * VH, len = r.range(160, 620);
      g.strokeStyle = `rgba(${r.chance(0.5) ? 96 : 160},255,0,${r.range(0.2, 0.5).toFixed(2)})`; g.lineWidth = r.range(0.8, 1.4);
      g.beginPath(); g.moveTo(x - len / 2, y); g.lineTo(x + len / 2, y + r.range(-3, 3)); g.stroke();
    }
    dg.filter = 'blur(0.6px)'; dg.drawImage(tmp, 0, 0); dg.filter = 'none';
  }
  const dd = dg.getImageData(0, 0, UW, VH).data;

  _mark('knocks');
  // ── height field + how bright the metal is ──
  const Hh = new Float32Array(N), Al = new Float32Array(N), Ao = new Float32Array(N);
  const cLean = COIN.map((c) => c.lean), cVm = COIN.map((c) => c.vm);
  for (let j = 0; j < VH; j++) {
    const V = V0 + j, fy = j / CS, j0c = fy | 0, tyc = fy - j0c;
    for (let i = 0; i < UW; i++) {
      const k = j * UW + i, U = i - UH, e = edge[i];
      if (V < e) { Hh[k] = -200; continue; }
      let c, dT, dB;
      const a0 = sc[i] - sg[i], b0 = sc[i] + sg[i];
      if (V < a0) { c = 0; dT = V - e; dB = a0 - V; } else if (V < b0) { Hh[k] = -60; continue; } else { c = 1; dT = V - b0; dB = 1e3; }
      const C = COIN[c], T = teeth[c];
      const x = U + cLean[c] * (V - cVm[c]) + 1.3 * Math.sin(V / 41 + c * 2.1 + U / 700);
      let ti = T.idx[((x - T.x0) * 2) | 0]; if (x >= T.tb[ti + 1]) ti++;
      let u = (x - T.tb[ti]) * T.iw[ti]; u += T.sk[ti] * Math.sin(TWO_PI * u);
      const tri = 1 - Math.abs(2 * u - 1);
      const prof = sstep(T.ga[ti], T.gb[ti], tri) * (0.8 + 0.8 * u * (1 - u));
      // coarse fields
      const fx = i / CS, i0c = fx | 0, txc = fx - i0c, kc = j0c * cw + i0c;
      const w00 = (1 - txc) * (1 - tyc), w10 = txc * (1 - tyc), w01 = (1 - txc) * tyc, w11 = txc * tyc;
      const lump = cLump[kc] * w00 + cLump[kc + 1] * w10 + cLump[kc + cw] * w01 + cLump[kc + cw + 1] * w11;
      const tone = cTone[kc] * w00 + cTone[kc + 1] * w10 + cTone[kc + cw] * w01 + cTone[kc + cw + 1] * w11;
      const tarn = cTarn[kc] * w00 + cTarn[kc + 1] * w10 + cTarn[kc + cw] * w01 + cTarn[kc + cw + 1] * w11;
      const gr = grain[(((j + c * 131) & 511) << 9) + ((i + c * 77) & 511)];
      // rounded corners of the coin; the reeds are worn low where they run into them
      let bev = 0;
      if (dT < C.bT) bev -= 0.85 * C.bT * Math.pow(1 - dT / C.bT, 2.4);
      if (dB < C.bB) bev -= 0.85 * C.bB * Math.pow(1 - dB / C.bB, 2.4);
      const amp = (0.35 + 0.65 * sstep(0, C.bT * 1.5, dT)) * (0.35 + 0.65 * sstep(0, C.bB * 1.5, dB));
      const o = k * 4, kn = (dd[o] - 128) * (7 / 127);
      const streak = prof > 0.4 ? nB.n2(U / 90 + c * 40, V / 1.7) : 0;
      Hh[k] = C.base + bev + C.th * T.hf[ti] * amp * prof + 1.5 * lump * prof + gr * (0.4 + 0.3 * prof) + 0.35 * streak + kn * (0.35 + 0.65 * prof);
      // black patina lies in the grooves and creeps up the flanks; the crowns are rubbed bright, with grey toning in patches
      const pat = prof * amp + 0.2 * tarn + 0.06 * gr;
      let al = 0.1 + 0.86 * sstep(0.05, 0.36, pat);
      al *= 1 - 0.3 * sstep(0.08, 0.55, tone + 0.25 * tarn);
      al *= T.tal[ti];
      al *= 0.4 + 0.6 * sstep(0, 10, c === 0 ? dB : Math.min(dT, dB));
      al *= 0.25 + 0.75 * dd[o + 1] / 255;
      Al[k] = al;
      Ao[k] = 0.2 + 0.8 * prof * prof;
    }
  }

  _mark('height');
  // ── light it ──
  const cT = new Float32Array(UW), cN = new Float32Array(UW), tS = new Float32Array(UW), dS = new Float32Array(UW);
  const vT = new Float32Array(UW), vN = new Float32Array(UW), f2T = new Float32Array(UW), f2N = new Float32Array(UW);
  const NL = 1 / Math.hypot(1, LY), lB = LY * NL;
  const F2B = -0.3, NF = 1 / Math.hypot(1, F2B), BETA = L.deg(10);
  function shade(alphaDeg) {
    const out = new Float32Array(N), al0 = L.deg(alphaDeg);
    for (let i = 0; i < UW; i++) {
      const phi = KPHI * (i - UH) / R, el = Math.min(al0 - phi, 1.38);
      cT[i] = -Math.cos(el) * NL; cN[i] = Math.sin(el) * NL;
      tS[i] = -LY / Math.cos(el); dS[i] = Math.tan(el);
      vT[i] = -Math.sin(phi); vN[i] = Math.cos(phi);
      f2T[i] = Math.cos(BETA + phi) * NF; f2N[i] = Math.sin(BETA + phi) * NF;
    }
    let hp = new Float32Array(VH + 1).fill(-1e3), hc = new Float32Array(VH + 1).fill(-1e3);
    for (let i = 0; i < UW; i++) {
      const t = tS[i], drop = dS[i], lT = cT[i], lN = cN[i];
      // half vector between the key light and the lens
      let hx = lT + vT[i], hy = lB, hz = lN + vN[i]; const hl = 1 / Math.hypot(hx, hy, hz); hx *= hl; hy *= hl; hz *= hl;
      const fT = f2T[i], fN = f2N[i], fB = F2B * NF;
      const il = i > 0 ? -1 : 0, ir = i < UW - 1 ? 1 : 0;
      for (let j = 0; j < VH; j++) {
        const k = j * UW + i, h = Hh[k];
        const js = j - t; let prop = -1e3;
        if (js >= 0) { const j0 = js | 0, f = js - j0; prop = hp[j0] + (hp[j0 + 1] - hp[j0]) * f - drop; }
        const d = prop - h;
        hc[j] = d > 0 ? prop : h;
        if (h < -40) continue;
        const sh = d <= 0.15 ? 1 : d >= 1.9 ? 0 : 1 - sstep(0.15, 1.9, d);
        let gx = (Hh[k + ir] - Hh[k + il]) * 0.5, gy = (Hh[k + (j < VH - 1 ? UW : 0)] - Hh[k - (j > 0 ? UW : 0)]) * 0.5;
        gx = gx < -7 ? -7 : gx > 7 ? 7 : gx; gy = gy < -7 ? -7 : gy > 7 ? 7 : gy;
        const nl = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const al = Al[k], ao = Ao[k];
        let v = 0.012 * ao;
        if (sh > 0) {
          const ndl = (-gx * lT - gy * lB + lN) * nl;
          if (ndl > 0) {
            let ndh = (-gx * hx - gy * hy + hz) * nl; ndh = ndh > 0 ? ndh : 0;
            const n2 = ndh * ndh, n4 = n2 * n2, n8 = n4 * n4;
            v += sh * (0.72 * ndl * al + (0.34 * n4 * n2 + 0.9 * n8 * n8 * n8 * n8 * n8) * (0.25 + 0.75 * al));
          }
        }
        const nf = (-gx * fT - gy * fB + fN) * nl;
        if (nf > 0) v += 0.04 * nf * ao * al;
        out[k] = v;
      }
      const tmp = hp; hp = hc; hc = tmp;
    }
    // exposure + film shoulder
    for (let k = 0; k < N; k++) { const v = 1 - Math.exp(-4.3 * out[k]); out[k] = v * v * (3 - 2 * v) * 0.35 + v * 0.65; }
    // carry the rim's brightness two rows past the outline so resampling does not darken it
    for (let i = 0; i < UW; i++) {
      const je = Math.ceil(edge[i] - V0);
      if (je >= 2 && je < VH) { out[(je - 1) * UW + i] = out[je * UW + i]; out[(je - 2) * UW + i] = out[je * UW + i]; }
    }
    return out;
  }
  const lumA = shade(17), lumB = shade(23);

  _mark('shade');
  // ── roll the field back onto the arc ──
  const LW = W + PAD * 2, Y0 = Math.floor(a.crestY) - 10, LH = H + PAD - Y0;
  const ramp = L.makeRamp(SILVER), lut = new Uint8ClampedArray(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = ramp(i / 1023); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const imA = new ImageData(LW, LH), imB = new ImageData(LW, LH), pa = imA.data, pb = imB.data;
  for (let y = 0; y < LH; y++) {
    const ddy = cy - (Y0 + y);
    for (let x = 0; x < LW; x++) {
      const ddx = x - PAD - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), V = R - rr;
      let fv = V - V0; if (fv < 1) continue;
      let fu = Math.atan2(ddx, ddy) * R + UH;
      if (fu < 0) fu = 0; else if (fu > UW - 1.01) fu = UW - 1.01;
      if (fv > VH - 1.01) fv = VH - 1.01;
      const i0 = fu | 0, tx = fu - i0, j0 = fv | 0, ty = fv - j0;
      const e = edge[i0] + (edge[i0 + 1] - edge[i0]) * tx;
      let al = V - e + 0.5; if (al <= 0) continue; if (al > 1) al = 1;
      const k = j0 * UW + i0, w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const va = lumA[k] * w00 + lumA[k + 1] * w10 + lumA[k + UW] * w01 + lumA[k + UW + 1] * w11;
      const vb = lumB[k] * w00 + lumB[k + 1] * w10 + lumB[k + UW] * w01 + lumB[k + UW + 1] * w11;
      const o = (y * LW + x) * 4, la = ((va * 1023) | 0) * 3, lb = ((vb * 1023) | 0) * 3, A8 = al * 255;
      pa[o] = lut[la]; pa[o + 1] = lut[la + 1]; pa[o + 2] = lut[la + 2]; pa[o + 3] = A8;
      pb[o] = lut[lb]; pb[o + 1] = lut[lb + 1]; pb[o + 2] = lut[lb + 2]; pb[o + 3] = A8;
    }
  }
  _mark('warp');
  // depth of field: sharp on the top coin; the coins below (nearer the lens) melt away
  const ax = cx + PAD, ay = cy - Y0;
  const finish = (img) => {
    const c = L.makeCanvas(LW, LH), g = c.getContext('2d');
    g.putImageData(img, 0, 0);
    const mask = (src, r0, r1) => {
      const sg2 = src.getContext('2d');
      sg2.globalCompositeOperation = 'destination-in';
      sg2.fillStyle = L.radial(sg2, ax, ay, R - r1, R - r0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
      sg2.fillRect(0, 0, LW, LH);
      return src;
    };
    const soft = mask(L.blurred(c, 2.8), 240, 335), far = mask(L.blurred(c, 8), 350, 520);
    g.drawImage(soft, 0, 0); g.drawImage(far, 0, 0);
    return c;
  };
  const A = finish(imA), B = finish(imB);
  _mark('dof');
  // bloom from the hottest silver (quarter resolution, with head-room above the crest so the glow is never clipped)
  const BM = 96, bw = Math.ceil(LW / 4), bh = Math.ceil((LH + BM) / 4);
  const bl0 = L.makeCanvas(bw, bh), bg = bl0.getContext('2d');
  bg.filter = 'brightness(0.72) contrast(3.2)'; bg.drawImage(B, 0, BM / 4, LW / 4, LH / 4); bg.filter = 'none';
  const bloom = L.blurred(bl0, 4);
  _mark('bloom'); console.log('S28 TIMING ' + _tm.join(' | '));
  return { A, B, bloom, Y0, BM };
}

/** like L.blit, for a layer cropped to the rows below the crest */
function blitC(ctx, env, cnv, y0, o) {
  const a = env.arc;
  ctx.save();
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  ctx.globalCompositeOperation = o.blend || 'source-over';
  ctx.translate(a.cx, a.crestY + (o.dy || 0)); ctx.scale(o.zoom, o.zoom); ctx.translate(-a.cx, -a.crestY);
  ctx.translate(a.cx, a.cy); ctx.rotate(o.rot); ctx.translate(-a.cx, -a.cy);
  if (o.scale) ctx.drawImage(cnv, -PAD, y0, cnv.width * o.scale, cnv.height * o.scale); else ctx.drawImage(cnv, -PAD, y0);
  ctx.restore();
}

export default {
  name: '一摞银元的边齿',
  tone: 'light',
  init(env) {
    S = build(env);
  },
  draw(ctx, env, p) {
    ctx.fillStyle = '#040506'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.0065, 0.0065, p), zoom = L.lerp(1.0, 1.014, p), dy = 1.5 * p;
    const o = { rot, zoom, dy };
    blitC(ctx, env, S.A, S.Y0, o);
    blitC(ctx, env, S.B, S.Y0, { ...o, alpha: L.smooth(p) });
    blitC(ctx, env, S.bloom, S.Y0 - S.BM, { ...o, blend: 'screen', alpha: 0.3, scale: 4 });
  },
};
