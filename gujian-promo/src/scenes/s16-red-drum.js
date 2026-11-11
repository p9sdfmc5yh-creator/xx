// s16 — 朱漆更鼓. Macro of the shoulder of a big watch-drum (更鼓) against black:
// the arc is the rim where the cowhide head folds over the barrel. Just below it the cream hide skirt is pinned
// by two staggered rows of dome-headed drum nails — hand-made, so no two are the same size, and their gilding is
// rubbed through on the crowns and tarnished round the skirts; under that the barrel swells away in true vermilion
// lacquer: a wet highlight, craquelure (断纹), a few dull scuffs, and worn gold-line clouds (描金云纹).
//
// Everything under the arc is shaded per pixel in init() from a height field laid out in drum coordinates
// (U = distance along the rim, d = depth below it); the nails are stamped on afterwards as little lit domes.
// The lacquer's specular reflection is NOT baked: init() stores, per (half-res) pixel, where on the barrel's curve that
// pixel "acts" once its bump slope and the tilt of its crackle plate are taken into account (E). draw() only tests E and U
// against the light's reflection — a long lozenge — so the reflection creeps over the tilted plates as the shot runs.
// A macro lens sees a thin slice in focus: the picture is sharp round the crest and melts toward the sides and the bottom.
// Draw order per frame: lit body → moving highlight (add) → crack lines (so they cut through the highlight) → halation.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 120;
let S = null;

const RN = 31;            // mean nail-head radius (px)
const PITCH = 104;        // nail spacing along the rim
const ROWS = [53, 110];   // depth of the two nail rows below the rim
const HB = 156;           // depth of the hide skirt's cut edge
const KS = 520;           // how far a unit of radial slope drags the highlight (≈ radius of the barrel's bulge)
const C1U = 196, C1D = 82;   // size of a big craquelure plate along / across the barrel
const C2U = 66, C2D = 28;    // … and of the hairline crazing inside it
const KEY_T = -0.1;       // the key light sits a little left of centre

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
function hsh(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// craquelure: voronoi plates on a brick-offset lattice, measured in real px so every crack has the same width.
// out: vE = distance to the nearest crack, vH / vH2 = hashes of the plate and of its neighbour across that crack, (vPu, vPd) = plate centre
let vE = 0, vH = 0, vH2 = 0, vPu = 0, vPd = 0;
function vor(u, v, CU, CD, salt) {
  const yi = Math.floor(v / CD), xi = Math.floor(u / CU);
  let d1 = 1e12, d2 = 1e12, p1x = 0, p1y = 0, p2x = 0, p2y = 0, h1 = 0, h2 = 0;
  for (let oy = -2; oy <= 2; oy++) {
    const cyi = yi + oy, off = cyi & 1 ? 0.5 : 0;
    for (let ox = -1; ox <= 1; ox++) {
      const cxi = xi + ox, h = hsh(cxi + salt, cyi);
      const px = (cxi + off + 0.1 + 0.8 * ((h & 1023) / 1023)) * CU, py = (cyi + 0.12 + 0.76 * (((h >>> 10) & 1023) / 1023)) * CD;
      const dx = px - u, dy = py - v, dd = dx * dx + dy * dy;
      if (dd < d1) { d2 = d1; p2x = p1x; p2y = p1y; h2 = h1; d1 = dd; p1x = px; p1y = py; h1 = h; } else if (dd < d2) { d2 = dd; p2x = px; p2y = py; h2 = h; }
    }
  }
  const sx = p2x - p1x, sy = p2y - p1y;
  vE = (d2 - d1) / (2 * Math.sqrt(sx * sx + sy * sy) + 1e-6);
  vH = h1; vH2 = h2; vPu = p1x; vPd = p1y;
}

/** worn gold-line cloud scrolls painted on the barrel → coverage mask (0..255) in region pixels */
function buildGiltMask(env, X0, Y0, RW, RH) {
  const a = env.arc;
  const c = L.makeCanvas(RW, RH), g = c.getContext('2d', { willReadFrequently: true });
  g.translate(-X0, -Y0);
  const spiral = (x0, y0, r, a0, turns, dir, n = 30) => {
    const out = [];
    for (let t = 0; t <= n; t++) { const u = t / n, ang = a0 + dir * u * turns * L.TAU, rad = r * (1 - 0.88 * Math.pow(u, 0.8)); out.push([x0 + rad * Math.cos(ang), y0 + rad * Math.sin(ang)]); }
    return out;
  };
  const cloud = (U, d, s, flip, seed) => {
    a.at(g, U / a.R, -d, () => {
      const fx = flip ? -s : s, ws = s / 40;
      const P = (pts, w, k, taper = [0.08, 0.2]) => L.inkStroke(g, pts.map(([x, y]) => [x * fx, y * s]), { width: w * ws, color: '#fff', seed: seed * 7 + k, taper, wobble: 0.26, smoothStep: 3 });
      // ruyi head: a round crown between two scrolls that curl inward
      P([[-0.5, -0.5], [-0.56, -0.9], [-0.34, -1.2], [0, -1.3], [0.34, -1.2], [0.56, -0.9], [0.5, -0.5]], 7.5, 1, [0.12, 0.12]);
      P([[-0.42, -0.62], [-0.7, -0.66]].concat(spiral(-0.98, 0.02, 0.6, -Math.PI / 2, 1.45, -1)), 7.5, 2, [0.05, 0.3]);
      P([[0.42, -0.62], [0.7, -0.66]].concat(spiral(0.98, 0.02, 0.6, -Math.PI / 2, 1.45, 1)), 7.5, 3, [0.05, 0.3]);
      P([[-0.62, 0.6], [-0.2, 0.74], [0.2, 0.74], [0.62, 0.6]], 5.5, 4, [0.3, 0.3]);
      // streaming tail with a hooked end, and a short second streamer under it
      P([[0.1, 0.78], [0.8, 0.98], [1.6, 0.9], [2.3, 0.62], [2.75, 0.4]].concat(spiral(2.78, 0.12, 0.28, Math.PI / 2, 0.95, -1, 16)), 6.5, 5, [0.1, 0.3]);
      P([[0.9, 1.22], [1.6, 1.24], [2.3, 1.02], [2.9, 0.84]], 4.5, 6, [0.25, 0.4]);
      P([[-1.5, 0.74], [-1.9, 0.9], [-2.4, 0.86]], 4.5, 7, [0.2, 0.5]);
    });
  };
  // a frieze of clouds ringing the barrel: two fall inside the frame, the rest dip out of it toward the sides
  cloud(-270, 428, 84, false, 1);
  cloud(540, 404, 74, true, 2);
  cloud(-1010, 372, 64, true, 3);
  cloud(1200, 372, 64, false, 4);
  cloud(-1560, 372, 64, false, 6);
  const src = g.getImageData(0, 0, RW, RH).data, M = new Uint8Array(RW * RH);
  for (let k = 0; k < M.length; k++) M[k] = src[k * 4 + 3];
  return M;
}

function buildDrum(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s16a'), nB = L.makeNoise('s16b'), nC = L.makeNoise('s16c');

  // ── slow fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const cMot = new Float32Array(CN), cBuck = new Float32Array(CN), cTone = new Float32Array(CN), cWear = new Float32Array(CN),
    cCrk = new Float32Array(CN), cCrk2 = new Float32Array(CN), cBrush = new Float32Array(CN), cSag = new Float32Array(CN),
    cWx = new Float32Array(CN), cWy = new Float32Array(CN), cGl = new Float32Array(CN);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, d = R - rr, k = j * cw + i;
    if (d < HB + 30) { cMot[k] = nA.fbm(U / 230, d / 120, 4); cBuck[k] = nA.fbm(U / 64 + 9, d / 80 + 3, 3); }
    if (d > HB - 30) {
      cTone[k] = nB.fbm(U / 430 + 5, d / 260, 4);
      cWear[k] = nB.fbm(U / 520 - 17, d / 84 + 31, 5, 2, 0.55);
      cCrk[k] = nB.fbm(U / 520 + 71, d / 300 - 9, 3);
      cCrk2[k] = nB.fbm(U / 260 - 40, d / 170 + 22, 3);
      cBrush[k] = nC.fbm(U / 340, d / 38, 3);
      cSag[k] = nC.fbm(U / 300 + 61, d / 190 - 14, 3);
      cWx[k] = nC.n2(U / 210 + 5, d / 210); cWy[k] = nC.n2(U / 210 - 31, d / 210 + 19);
      cGl[k] = nC.fbm(U / 58 + 13, d / 58 + 47, 3);
    }
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // as functions of position along the rim: the hand-cut lower edge of the hide, the slightly ragged fold on the rim itself,
  // and how strongly the rim catches the light there
  const UH = 1560, EDGE = new Float32Array(UH * 2 + 1), RIM = new Float32Array(UH * 2 + 1), BEAD = new Float32Array(UH * 2 + 1);
  for (let u = -UH; u <= UH; u++) {
    EDGE[u + UH] = HB + 6 * nA.n2(u / 150, 1.7) + 2 * nA.n2(u / 24, 9.2) + 0.6 * nA.n2(u / 6, 4.4);
    RIM[u + UH] = 1.2 * (0.5 + 0.5 * nA.n2(u / 52, 3.3)) + 0.9 * (0.5 + 0.5 * nA.n2(u / 9, 7.1));
    BEAD[u + UH] = 0.45 + 0.55 * (0.5 + 0.5 * nA.n2(u / 130, 5.9)) + 0.25 * nA.n2(u / 17, 2.2);
  }

  const gilt = buildGiltMask(env, X0, Y0, RW, RH);

  // ── pass 1: height field + albedo + material ──
  const Hh = new Float32Array(N), Hs = new Float32Array(N), Dd = new Float32Array(N), Ua = new Float32Array(N), E = new Float32Array(N);
  const Mat = new Uint8Array(N), Gl = new Uint8Array(N), Mg = new Uint8Array(N), Ck = new Uint8Array(N), Qe = new Float32Array(N);
  const img = new ImageData(RW, RH), px = img.data;
  const SWA = 286 / R;   // angular width of one barrel stave
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -1.2) continue;
      const th = Math.atan2(ddx, ddy), U = th * R, o = k * 4;
      Dd[k] = d; Ua[k] = U;
      let ui = Math.round(U) + UH; ui = ui < 0 ? 0 : ui > UH * 2 ? UH * 2 : ui;
      const de = EDGE[ui];
      if (d < de) {
        // ── cowhide skirt ──
        Mat[k] = 1;
        const tight = 0.25 + 0.75 * Math.exp(-d / 60);
        const cr = (nA.n2(U / 11, d / 170 + 3) * 0.2 + nA.n2(U / 34 + 40, d / 260) * 0.38) * tight;   // tension creases run straight down from the rim
        const pore = nB.n2(x / 2.7, y / 2.7) * 0.055 + nB.n2(x / 6.5 + 9, y / 6.5) * 0.06;
        const bk = bil(cBuck, i, j);
        Hh[k] = 2.6 + cr * (0.35 + 1.3 * Math.abs(bk)) + pore + bk * 1.2 + 1.5 * sstep(0, 3.2, de - d);   // the skin stands proud of the lacquer by its own thickness
        const m = bil(cMot, i, j) * 1.4;
        let r = 246, g = 231, b = 194;
        if (m > 0) { const t = m > 1 ? 1 : m; r += (250 - r) * t * 0.8; g += (240 - g) * t * 0.8; b += (214 - b) * t * 0.8; }   // thin, milky patches
        else { const t = (m < -1 ? 1 : -m) * 0.8; r += (224 - r) * t; g += (180 - g) * t; b += (112 - b) * t; }                         // thick, honey-coloured ones
        const fol = nB.n2(x / 1.7 + 50, y / 1.7);                               // hair follicles
        const dirt = 1 - 0.14 * Math.max(0, -cr) + pore * 0.2 - (fol > 0.5 ? (fol - 0.5) * 0.14 : 0);
        const eg = 1 - sstep(0, 18, de - d);                                  // grime gathered along the cut edge
        r = (r + (150 - r) * eg * 0.3) * dirt; g = (g + (104 - g) * eg * 0.3) * dirt; b = (b + (58 - b) * eg * 0.3) * dirt;
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
      } else {
        // ── vermilion lacquer ──
        Mat[k] = 2;
        const q = d - de; Qe[k] = q;
        const Ul = th * rr;
        const wu = U + bil(cWx, i, j) * 38, wd = d + bil(cWy, i, j) * 20;
        const fine = nC.n2(Ul / 5.5, d / 5.5) * 0.6 + nC.n2(Ul / 2.4 + 31, d / 2.4) * 0.4;
        // big plates: long cracks, not every joint open, here and there one gaping
        vor(wu, wd, C1U, C1D, 0);
        const e = vE, pu = vPu, pd = vPd, h2 = Math.imul(vH ^ 0x9e3779b9, 668265263) >>> 0;
        const eh = (Math.imul(vH ^ vH2, 0x9e3779b1) >>> 24) / 255;
        const tD = ((vH >>> 20) & 255) / 127.5 - 1, tU = ((h2 >>> 8) & 255) / 127.5 - 1, tT = ((h2 >>> 16) & 255) / 127.5 - 1, tC = (h2 & 255) / 255;
        const cm = sstep(-0.24, 0.1, bil(cCrk, i, j));                        // where the lacquer has crazed at all
        const es = eh < 0.2 ? 0.15 : 0.65 + 0.35 * eh;
        const gape = eh > 0.55 ? sstep(0.62, 0.86, 0.5 + 0.5 * nB.n2(U / 64 + 3, d / 40 - 8)) : 0;
        const line = cm * es * (1 - sstep(0.45, 1.5 + 2.8 * gape, e));
        // hairlines inside the plates (only where the picture is sharp enough to show them)
        let line2 = 0, t2 = 0, lift2 = 0;
        if (q < 470 && cm > 0.02) {
          const cm2 = cm * sstep(-0.2, 0.25, bil(cCrk2, i, j));
          if (cm2 > 0.02) {
            vor(wu + 517, wd + 291, C2U, C2D, 77);
            const s2 = (Math.imul(vH ^ vH2, 0x9e3779b1) >>> 24) > 70 ? 1 : 0;
            line2 = cm2 * s2 * (1 - sstep(0.15, 0.85, vE)) * 0.42;
            lift2 = cm2 * s2 * Math.exp(-vE / 3);
            t2 = cm2 * (((vH >>> 20) & 255) / 127.5 - 1);
          }
        }
        const nib = Math.max(0, nB.n2(Ul / 4.3 + 90, d / 4.3) - 0.74);         // dust nibs caught in the lacquer
        const peel = nC.n2(Ul / 12 + 7.7, d / 10.5 + 3.1) * (0.35 + 0.65 * sstep(-0.3, 0.3, bil(cCrk2, i, j)));   // thick brushed lacquer never levels quite flat
        let h = 0.15 * bil(cBrush, i, j) + 0.13 * peel
          + cm * (tD * (d - pd) * 0.006 + tU * (U - pu) * 0.0025)              // every plate tips its own way
          + cm * es * 0.34 * Math.exp(-e / 5) + 0.1 * lift2                    // plate edges curl up
          - line - 0.4 * line2;                                               // the crack itself
        // stave joints telegraphing through the lacquer
        const sa = th / SWA + 0.37, si = Math.round(sa);
        let sd = (sa - si) * SWA * rr, seam = 0;
        if (sd > -30 && sd < 30) {
          sd += 3 * nA.n2(d / 90, si * 7.3);
          const ss = 0.5 + 0.5 * nA.n2(d / 140 + 5, si * 3.1);
          seam = ss * Math.exp(-(sd * sd) / 1.5);
          h += 0.22 * Math.exp(-Math.abs(sd) / 11) - 0.8 * seam;
        }
        const wearN = bil(cWear, i, j);
        const wv = wearN * 0.5 + 0.5 + 0.06 * fine + 0.06 * cm * Math.exp(-e / 8);
        const wear = sstep(0.73, 0.81, wv);
        let mg = gilt[k] / 255;
        if (mg > 0) {
          const keep = sstep(-0.46, -0.1, bil(cGl, i, j) + 0.22 * fine) * (tC > 0.86 && cm > 0.5 ? 0.12 : 1) * (1 - wear) * (1 - gape * line);
          mg *= keep; h += 0.3 * mg;
        }
        Hs[k] = h; Hh[k] = h + 0.022 * fine + 0.5 * nib;   // the mirror reflection only follows the smooth relief (Hs); the grain is for the matte light
        // the reflection's own displacement: slow sags in the coat, the tilt of the plate, the smaller tilt of its hairline pieces
        E[k] = 13 * bil(cSag, i, j) + cm * tD * 22 + t2 * 6;
        const tn = bil(cTone, i, j), tone = 1 + 0.1 * tn + 0.03 * tT * cm + 0.024 * fine;
        let r = 226 * tone, g = (39 + 9 * tn) * tone, b = (27 - 2 * tn) * tone;      // 朱: a true, bright vermilion — neither ox-blood nor orange
        if (wear > 0) { const w = wear * 0.55; r += (170 - r) * w; g += (42 - g) * w; b += (32 - b) * w; }   // scuffs go dull, not black
        if (mg > 0) { const w = mg * (0.82 + 0.18 * fine), gv = 0.82 + 0.3 * tU * cm + 0.12 * tn; r += (222 * gv - r) * w; g += (158 * gv - g) * w; b += (46 * gv - b) * w; }
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
        Ck[k] = 255 * Math.min(1, 0.84 * line + 0.5 * seam + line2);
        Gl[k] = 255 * (1 - 0.85 * wear) * (1 - 0.9 * gape * line) * sstep(1, 4, q);
        Mg[k] = 255 * mg;
      }
    }
  }

  // ── the nails: where they are, and what each one is like ──
  const nails = [];
  const PA = PITCH / R, nmax = Math.ceil(a.span(PAD + 90) / PA) + 1;
  for (let row = 0; row < 2; row++) for (let n = -nmax; n <= nmax; n++) {
    const h = hsh(n * 7 + 13, row * 31 + 5), hb = hsh(n * 13 + 101, row * 17 + 3);
    const f = (s) => ((h >>> s) & 255) / 255, f2 = (s) => ((hb >>> s) & 255) / 255;
    const th = (n + (row ? 0.5 : 0)) * PA + ((f(0) - 0.5) * 10) / R;
    const rrN = R - ROWS[row] - (f(8) - 0.5) * 9;
    let size = 0.9 + 0.2 * f(16);                      // hand-forged: no two heads quite the same size …
    if (f2(0) > 0.9) size *= 0.9;                      // … and now and then a smaller replacement
    const wa = f(12) * L.TAU, wr = -0.2 + 0.75 * f2(24);
    nails.push({
      x: cx + rrN * Math.sin(th) - X0, y: cy - rrN * Math.cos(th) - Y0, rad: RN * size, row, id: n * 2 + row,
      round: 1.1 + 0.3 * f(24),                         // how flat the dome is
      tx: (f2(8) - 0.5) * 0.2, ty: (f2(16) - 0.5) * 0.2,   // driven in a little askew
      dent: 0.03 + 0.11 * f(4) * f(4),                  // hammer marks
      wr, wx: Math.cos(wa) * 0.2, wy: Math.sin(wa) * 0.2 - 0.08,    // where the gilding is rubbed through, and how far
      tarn: -0.1 + 0.3 * f2(4),                         // how far the dark tarnish has crept up from the skirt
      oval: 0.035 * f2(12), oa: f(20) * Math.PI,
      dull: f2(20),                                     // some heads have gone duller and browner than others
    });
  }
  for (const p of nails) for (const q of nails) {       // keep neighbours from touching
    if (p === q) continue;
    const dist = Math.hypot(p.x - q.x, p.y - q.y), need = p.rad + q.rad + 5;
    if (dist < need) { const s = dist / need; p.rad *= s; q.rad *= s; }
  }
  const eachPx = (nl, ext, fn) => {
    const e = Math.ceil(nl.rad * ext);
    const j0 = Math.max(1, Math.floor(nl.y - e)), j1 = Math.min(RH - 2, Math.ceil(nl.y + e)), i0 = Math.max(1, Math.floor(nl.x - e)), i1 = Math.min(RW - 2, Math.ceil(nl.x + e));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * RW + i, i - nl.x, j - nl.y);
  };
  // each nail drags the hide down into a dimple, with pucker creases fanning out and a rusty halo
  for (const nl of nails) eachPx(nl, 2.3, (k, ox, oy) => {
    if (Mat[k] !== 1) return;
    const dist = Math.sqrt(ox * ox + oy * oy), out = Math.max(0, dist - nl.rad), t = dist / (1.5 * nl.rad);
    const win = 1 - sstep(1.6 * nl.rad, 2.25 * nl.rad, dist);
    if (win <= 0) return;
    Hh[k] -= 2.2 * Math.exp(-t * t) * win;
    const fan = Math.exp(-out / (0.8 * nl.rad)) * win;
    Hh[k] += 0.55 * fan * nA.n2(Math.atan2(oy, ox) * 2.6 + nl.id * 3.1, dist / 70);
    const st = Math.exp(-out / (0.3 * nl.rad)) * (0.55 + 0.45 * nB.n2(ox / 14 + nl.id, oy / 14)) * 0.24, o = k * 4;
    px[o] += (150 - px[o]) * st; px[o + 1] += (98 - px[o + 1]) * st; px[o + 2] += (52 - px[o + 2]) * st;
  });

  // ── pass 2: light it ──
  const lx = -0.46, ly = -0.888;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, mat = Mat[k];
      if (!mat) continue;
      const o = k * 4, d = Dd[k], h0 = Hh[k];
      const kl = i > 0 && Mat[k - 1] ? Hh[k - 1] : h0, kr = i < RW - 1 && Mat[k + 1] ? Hh[k + 1] : h0;
      const ku = j > 0 && Mat[k - RW] ? Hh[k - RW] : h0, kd = j < RH - 1 && Mat[k + RW] ? Hh[k + RW] : h0;
      const hx = (kr - kl) * 0.5, hy = (kd - ku) * 0.5;
      const ddx = X0 + i - cx, rr = R - d, sn = ddx / rr, cs = ddy / rr;
      const th = Ua[k] / R, sf = sstep(0.08, 0.52, Math.abs(th - KEY_T)), side = 1 - (mat === 1 ? 0.24 : 0.36) * sf;
      let ui = Math.round(Ua[k]) + UH; ui = ui < 0 ? 0 : ui > UH * 2 ? UH * 2 : ui;
      const rim = RIM[ui], dr = d - rim;
      let rel = -(hx * lx + hy * ly);
      let r = px[o], g = px[o + 1], b = px[o + 2];
      if (mat === 1) {
        rel *= 1.25; rel = rel < -0.6 ? -0.6 : rel > 0.5 ? 0.5 : rel;
        // the hide rolls over the rim: it faces the light more and more toward the limb, with a bright bead on the very edge —
        // brighter here, duller there, as the fold is never even
        const roll = Math.exp(-Math.max(0, dr) / 9), bead = Math.exp(-((dr - 2.2) * (dr - 2.2)) / 7) * BEAD[ui];
        // … and scraped rawhide is waxy: a soft sheen where the skirt turns down off the rim
        const sheen = 0.1 * Math.exp(-((d - 31) * (d - 31)) / 500) - 0.07 * sstep(70, 150, d);
        const lit = (1.0 + rel + 0.12 * roll + 0.26 * bead - 0.1 * Math.exp(-((dr - 15) * (dr - 15)) / 40) + sheen) * side;
        // thin skin on the fold lets the light through: an amber edge
        const amber = 0.3 * Math.exp(-((dr - 7) * (dr - 7)) / 30);
        r = (r + (238 - r) * amber) * lit; g = (g + (176 - g) * amber) * lit; b = (b + (96 - b) * amber) * lit * (1 - 0.06 * roll);
      } else {
        rel *= 1.2; rel = rel < -0.55 ? -0.55 : rel > 0.55 ? 0.55 : rel;
        const s0 = Hs[k], sl = Mat[k - 1] === 2 ? Hs[k - 1] : s0, sr = Mat[k + 1] === 2 ? Hs[k + 1] : s0, su = Mat[k - RW] === 2 ? Hs[k - RW] : s0, sdn = Mat[k + RW] === 2 ? Hs[k + RW] : s0;
        let hv = -(sr - sl) * 0.5 * sn + (sdn - su) * 0.5 * cs; hv = hv < -0.4 ? -0.4 : hv > 0.4 ? 0.4 : hv;
        E[k] += d - KS * hv;
        const q = Qe[k];
        const lit = (1.07 - 0.3 * sstep(200, 700, d)) * side * (1 - 0.56 * Math.exp(-q / 7) - 0.24 * Math.exp(-q / 34)) * (1 + rel);
        // deep lacquer never goes fully flat: a broad soft sheen sits under the moving highlight
        const sh = 26 * Math.exp(-((d - 252) * (d - 252)) / 18000) * side * (Gl[k] / 255);
        r = r * lit + sh; g = g * lit + sh * 0.42; b = b * lit + sh * 0.3;
        { const sd = 1 - (lit < 1 ? lit : 1); b += sd * 12; g -= sd * 4; }   // shadows lean to crimson (殷红), never to brown
        if (rel > 0.3) { const sp = (rel - 0.3) * 150 * side; r += sp; g += sp * 0.8; b += sp * 0.62; }
        if (Mg[k]) { const sg = Mg[k] * 0.3 * Math.exp(-((d - 330) * (d - 330)) / 26000) * side * side; r += sg; g += sg * 0.82; b += sg * 0.5; }   // gold leaf throws back more of the lamp than lacquer does
      }
      px[o] = r; px[o + 1] = g; px[o + 2] = b;
      const al = dr + 0.5; px[o + 3] = al >= 1 ? 255 : al <= 0 ? 0 : al * 255;
    }
  }

  // ── the nails: shadows, then the domes ──
  const SHX = 0.4, SHY = 0.56;
  for (const nl of nails) eachPx(nl, 2.1, (k, ox, oy) => {
    if (!Mat[k]) return;
    const dist = Math.sqrt(ox * ox + oy * oy);
    if (dist < nl.rad - 1.5) return;
    const sx = ox - SHX * nl.rad, sy = oy - SHY * nl.rad, ds = Math.sqrt(sx * sx + sy * sy);
    const cast = 0.6 * (1 - sstep(nl.rad * 0.7, nl.rad * 1.42, ds)), ao = 0.5 * Math.exp(-Math.max(0, dist - nl.rad) / 3.5);
    const m = 1 - Math.min(0.84, cast + ao), o = k * 4;
    px[o] *= Math.pow(m, 0.78); px[o + 1] *= m; px[o + 2] *= Math.pow(m, 1.3);   // rawhide is translucent: its shadows are warm amber, not grey
  });
  const hl = Math.hypot(-0.42, -0.56, 1.66), Hx = -0.42 / hl, Hy = -0.56 / hl, Hz = 1.66 / hl;      // half-vector of the key light
  const ll = Math.hypot(-0.5, -0.66, 0.56), Lx = -0.5 / ll, Ly = -0.66 / ll, Lz = 0.56 / ll;
  // the key is a window, not a point, so its reflection has a shape: two axes across the half-vector to measure it on
  const an = Math.hypot(Hx, Hy), Ax = Hy / an, Ay = -Hx / an, Bx = -Hz * Ay, By = Hz * Ax, Bz = Hx * Ay - Hy * Ax;
  for (const nl of nails) {
    const Rs = nl.rad * nl.round, bounce = nl.row ? 0.55 : 0.2;
    eachPx(nl, 1.12, (k, ox, oy) => {
      const dist = Math.sqrt(ox * ox + oy * oy);
      const cov = nl.rad * (1 + nl.oval * Math.cos(2 * (Math.atan2(oy, ox) - nl.oa))) - dist + 0.5;   // heads are never quite round
      if (cov <= 0 || !Mat[k]) return;
      let nx = ox / Rs + nl.tx + nl.dent * nB.n2(ox / 11 + nl.id * 5.3, oy / 11 + 2.1), ny = oy / Rs + nl.ty + nl.dent * nB.n2(ox / 11 - 7.7, oy / 11 + nl.id * 3.9);
      nx += 0.028 * nC.n2(ox / 2.2 + nl.id * 11, oy / 2.2); ny += 0.028 * nC.n2(ox / 2.2, oy / 2.2 + nl.id * 13);
      const nz = Math.sqrt(Math.max(0.03, 1 - nx * nx - ny * ny));
      const ndh = nx * Hx + ny * Hy + nz * Hz, ndl = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      const ha = (nx * Ax + ny * Ay) / 0.22, hb = (nx * Bx + ny * By + nz * Bz) / 0.13, hq = ha * ha * ha * ha + hb * hb * hb * hb;
      const s1 = ndh > 0.9 ? 1 - sstep(0.4, 1.3, hq) : 0, s2 = Math.pow(Math.max(0, ndh), 10);
      const sF = 0.24 * sstep(0.984, 0.996, nx * 0.42 - ny * 0.1 + nz * 0.902);                  // a dimmer second window, low on the right
      // gilding: rubbed through to the brass on the crown, eaten by dark tarnish from the skirt up
      const cl = nA.fbm(ox / 6.5 + nl.id * 9.1, oy / 6.5 - nl.id * 4.7, 3);
      const wxx = ox / nl.rad - nl.wx, wyy = oy / nl.rad - nl.wy;
      const wm = sstep(0.0, 0.3, nl.wr - 0.9 * Math.sqrt(wxx * wxx + wyy * wyy) + 0.42 * cl) * 0.85;         // flecks and scratches, thickest on the crown
      const tm = 1 - sstep(0, 0.75, (0.93 - dist / nl.rad) * 2.6 + 0.16 * nA.fbm(ox / 17 - nl.id * 3.3, oy / 17 + nl.id * 6.1, 2) + nl.tarn);
      const dg = 0.17 + 0.95 * Math.pow(ndl, 1.5), db = 0.24 + 0.84 * ndl, amb = 1 - ndl, du = 1 - 0.3 * nl.dull;
      let r = 238 * du * dg + 200 * s2 + 62 * amb, g = (178 - 14 * nl.dull) * du * dg + 165 * s2 + 24 * amb, b = (58 - 10 * nl.dull) * du * dg + 96 * s2 + 6 * amb;
      r += (182 * db + 80 * s2 + 22 * amb - r) * wm; g += (118 * db + 56 * s2 + 9 * amb - g) * wm; b += (52 * db + 30 * s2 + 4 * amb - b) * wm;
      r += (84 * db + 40 * s2 - r) * tm; g += (54 * db + 30 * s2 - g) * tm; b += (30 * db + 20 * s2 - b) * tm;
      // the skirt of the dome mirrors the pale hide around it (lit side) and the red barrel below
      const skirt = sstep(0.76, 0.56, nz), lee = 0.5 - 0.5 * (nx * 0.58 + ny * 0.81) / Math.sqrt(1.001 - nz * nz);
      const up = skirt * (0.14 + 0.5 * lee) * (0.45 + 0.55 * (1 - tm));
      r += 214 * up; g += 190 * up; b += 146 * up;
      const dn = sstep(0.25, 0.8, ny) * bounce * (0.4 + 0.6 * (1 - tm));
      r += 150 * dn; g += 30 * dn; b += 18 * dn;
      const base = 1 - 0.55 * sstep(nl.rad - 4.5, nl.rad, dist), hi = (s1 + sF) * (1 - 0.8 * tm) * (1 - 0.4 * wm);
      r = r * base + 255 * hi; g = g * base + 240 * hi; b = b * base + 208 * hi;
      const o = k * 4, c = cov >= 1 ? 1 : cov;
      px[o] += (r - px[o]) * c; px[o + 1] += (g - px[o + 1]) * c; px[o + 2] += (b - px[o + 2]) * c;
    });
  }

  // everything lives in region-sized canvases (RW × RH, top-left at X0,Y0): nothing but black exists above the rim
  const stage = (im) => { const t = L.makeCanvas(RW, RH); t.getContext('2d').putImageData(im, 0, 0); const c = L.makeCanvas(RW, RH); c.getContext('2d').drawImage(t, 0, 0); return c; };
  const body = stage(img);
  // the cracks themselves go on their own layer, laid over the picture AFTER the moving highlight so they cut through it
  const cimg = new ImageData(RW, RH), cp = cimg.data;
  for (let k = 0; k < N; k++) { if (Ck[k]) { const o = k * 4; cp[o] = 44; cp[o + 1] = 5; cp[o + 2] = 6; cp[o + 3] = Ck[k]; } }
  const cracks = stage(cimg);

  // macro lens: only a slice round the crest is sharp. Toward the sides the rim swings away from the focal plane, and at the
  // bottom of frame the barrel swells toward the camera — both melt, in two steps of blur.
  const xc = cx - X0, DOF = [[2.4, 430, 780, 380, 500], [6.5, 740, 1130, 480, 660]];
  for (const layer of [body, cracks]) {
    const lg = layer.getContext('2d');
    for (const [blur, la0, la1, de0, de1] of DOF) {
      const m = L.makeCanvas(RW, RH), mg = m.getContext('2d');
      mg.fillStyle = L.linear(mg, 0, 0, RW, 0, [[0, '#000'], [(xc - la1) / RW, '#000'], [(xc - la0) / RW, 'rgba(0,0,0,0)'], [(xc + la0) / RW, 'rgba(0,0,0,0)'], [(xc + la1) / RW, '#000'], [1, '#000']]);
      mg.fillRect(0, 0, RW, RH);
      mg.fillStyle = L.radial(mg, xc, cy - Y0, R - de1, R - de0, [[0, '#000'], [1, 'rgba(0,0,0,0)']]);
      mg.fillRect(0, 0, RW, RH);
      const soft = L.blurred(layer, blur), sg = soft.getContext('2d');
      sg.globalCompositeOperation = 'destination-in'; sg.drawImage(m, 0, 0);
      lg.globalCompositeOperation = 'destination-out'; lg.drawImage(m, 0, 0);
      lg.globalCompositeOperation = 'lighter'; lg.drawImage(soft, 0, 0);
      lg.globalCompositeOperation = 'source-over';
    }
  }
  const defocus = (x, d) => {   // the same falloff as a number, for the highlight
    const ax = Math.abs(x - cx);
    const la = 0.4 * sstep(DOF[0][1], DOF[0][2], ax) + 0.6 * sstep(DOF[1][1], DOF[1][2], ax), de = 0.4 * sstep(DOF[0][3], DOF[0][4], d) + 0.6 * sstep(DOF[1][3], DOF[1][4], d);
    return la > de ? la : de;
  };
  // halation: a quarter-res blurred copy (with some headroom above the rim), screened back over the picture in draw()
  const BT = 96, bloom = L.makeCanvas(RW / 4, (RH + BT) / 4), bg = bloom.getContext('2d');
  bg.filter = 'blur(5px)'; bg.drawImage(body, 0, BT / 4, RW / 4, RH / 4);

  // per-frame highlight: for every lacquer pixel the reflection can reach, its E, U, gloss, gold and defocus, packed in a list
  const JS = 140, SH = RH - JS, ELO = 96, EHI = 400;
  let SN = 0;
  for (let k = JS * RW; k < N; k++) if (Gl[k]) {
    const f = defocus(X0 + (k % RW), Dd[k]);
    if (f > 0) E[k] += (Dd[k] - E[k]) * f * 0.8;        // out of focus the reflection forgets the fine relief
    if (E[k] > ELO && E[k] < EHI) SN++; else Gl[k] = 0;
    Hs[k] = f;
  }
  const sE = new Float32Array(SN), sU = new Float32Array(SN), sF = new Float32Array(SN), sG = new Uint8Array(SN), sM = new Uint8Array(SN), sO = new Uint32Array(SN);
  for (let k = JS * RW, n = 0; k < N; k++) if (Gl[k]) { sE[n] = E[k]; sU[n] = Ua[k]; sF[n] = Hs[k]; sG[n] = Gl[k]; sM[n] = Mg[k]; sO[n] = (k - JS * RW) * 4; n++; }
  const spec = new ImageData(RW, SH);
  for (let k = 3; k < spec.data.length; k += 4) spec.data[k] = 255;
  const specC = L.makeCanvas(RW, SH), glowC = L.makeCanvas(RW / 4, SH / 4), gctx = glowC.getContext('2d');
  gctx.filter = 'blur(4px)';
  // tables over q = (squared, normalised) distance from the reflection's centre
  const TC = new Float32Array(1024), TS = new Float32Array(1024);
  for (let n = 0; n < 1024; n++) {
    const q = n / 128;
    TC[n] = 0.6 * (1 - sstep(0.5, 1.1, q)) + 0.3 * Math.exp(-q * 1.3);      // the window itself: a hard-edged core, hotter toward its middle
    TS[n] = Math.exp(-q);                                                   // soft falloffs
  }
  return { body, cracks, bloom, X0, Y0, BT, sE, sU, sF, sG, sM, sO, SN, spec, specC, sctx: specC.getContext('2d'), glowC, gctx, TC, TS, sy: Y0 + JS, sw: RW, sh: SH };
}

/** refresh the lacquer's specular reflection for this frame. E0 = depth of its centre, Uc = where it sits along the rim */
function renderSpec(E0, Uc) {
  const { sE, sU, sF, sG, sM, sO, SN, spec, TC, TS } = S, d = spec.data;
  for (let n = 0; n < SN; n++) {
    const f = sF[n], e = sE[n] - E0, du = sU[n] - Uc, e2 = e - 118, wd = 1 / (1 + 2.2 * f), uu = du * du;
    let q = (e * e * (1 / 169) * wd + uu * (1 / 230400)) * 128 | 0; if (q > 1023) q = 1023;             // key: a lozenge 26 px deep, ~960 long
    let qb = (e2 * e2 * (1 / 81) * wd + uu * (1 / 360000)) * 128 | 0; if (qb > 1023) qb = 1023;          // a second, dimmer pane below it
    let qs = (e * e * (1 / 3200) + uu * (1 / 520000)) * 128 | 0; if (qs > 1023) qs = 1023;               // broad veil
    const t = (TC[q] * (1 - 0.4 * f) + 0.26 * TC[qb] + 0.15 * TS[qs]) * sG[n] * (1 / 255);
    const v = t * 255, m = sM[n] * (1 / 255), o = sO[n];
    // dim → a warm scarlet glow; full → the lamp's own warm white. Gold answers stronger and yellower.
    d[o] = v * (1 + 0.9 * m); d[o + 1] = v * (0.56 + 0.36 * t + 0.42 * m); d[o + 2] = v * (0.42 + 0.44 * t - 0.2 * m);
  }
  S.sctx.putImageData(spec, 0, 0);
  S.gctx.clearRect(0, 0, S.glowC.width, S.glowC.height);
  S.gctx.drawImage(S.specC, 0, 0, S.glowC.width, S.glowC.height);   // … and its halation
}

export default {
  name: '朱漆更鼓',
  tone: 'light',
  init(env) { S = buildDrum(env); },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.006, 0.006, p);
    ctx.fillStyle = '#040404'; ctx.fillRect(0, 0, W, H);
    // the light stays put while the drum turns under it → the reflection creeps down the barrel and along the rim
    renderSpec(L.lerp(236, 254, p), L.lerp(-300, -220, p) - rot * a.R);
    L.cam(ctx, env, { rot, zoom: L.lerp(1, 1.012, p) }, () => {
      const { X0, Y0 } = S;
      ctx.drawImage(S.body, X0, Y0);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(S.specC, X0, S.sy);
      ctx.globalAlpha = 0.5; ctx.drawImage(S.glowC, X0, S.sy, S.sw, S.sh); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(S.cracks, X0, Y0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.28; ctx.drawImage(S.bloom, X0, Y0 - S.BT, S.bloom.width * 4, S.bloom.height * 4);
    });
  },
};
