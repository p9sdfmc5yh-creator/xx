// s12 — 叠铸陶范. Macro, seen from straight above: the far edge of a fired-clay stack-casting mould disc on black.
// The arc is the disc's outer edge (rounded over, chipped, one stretch smoked black). Just inside it runs the hero:
// a ring of coin cavities — NEGATIVE moulds, so the coin body is a shallow round pit, the rim (外郭) a deeper groove
// round the pit, and the square hole a boss left standing in the middle — each feeding a thin runner that heads for
// the circle centre like a spoke.
//
// Relief is the soul of the shot, so nothing here is painted: init() builds a float height field (px of height) per
// pixel, then lights it with a low warm lamp up and to the left (Lambert + ray-marched cast shadows + a cavity term),
// and maps the result through a terracotta ramp. draw() only slides the baked slab about the circle centre under a
// light pool that stays fixed on screen.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;
const ROT = 0.0175;          // ±1° → about 2° of slide over the shot
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const fract = (v) => v - Math.floor(v);

// ── cheap lattice value noise (−1..1) for the per-pixel fine grain ──
function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) & 0xffff) / 32767.5 - 1;
}
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let tx = x - xi, ty = y - yi; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
// ── allocation-free worley: squared distance to the nearest feature point in cD1, its id in cId ──
let cD1 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const px = xi + ox, py = yi + oy;
    let h = (Math.imul(px, 374761393) + Math.imul(py, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = px + (h & 1023) / 1023 - x, dy = py + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d1 = d; id = ((h >>> 20) & 1023) / 1023; }
  }
  cD1 = d1; cId = id;
}

const NL = 1024;
function lut(stops) {
  const f = L.makeRamp(stops), o = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}

function boxBlur(src, w, h, r, passes) {
  let a = src, b = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {              // horizontal
      const o = y * w; let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
      for (let x = 0; x < w; x++) {
        b[o + x] = acc * inv;
        const xa = x + r + 1, xr = x - r;
        acc += a[o + (xa >= w ? w - 1 : xa)] - a[o + (xr < 0 ? 0 : xr)];
      }
    }
    const c = a === src ? new Float32Array(src.length) : a;
    for (let x = 0; x < w; x++) {              // vertical
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + x];
      for (let y = 0; y < h; y++) {
        c[y * w + x] = acc * inv;
        const ya = y + r + 1, yr = y - r;
        acc += b[(ya >= h ? h - 1 : ya) * w + x] - b[(yr < 0 ? 0 : yr) * w + x];
      }
    }
    a = c;
  }
  return a;
}

function buildMould(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 6;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s12a'), nB = L.makeNoise('s12b');
  const rnd = L.rng('s12');

  // ── geometry (px). Heights: mould face = 0, everything cut into it is negative ──
  const RC = 160;            // cavity radius
  const RG = 140;            // inner edge of the rim groove (外郭)
  const SB = 59;             // half side of the square boss (the coin's hole)
  const DF = 11, DG = 21;    // depth of the coin body / of the rim groove
  const DR = 7.5;            // runner depth
  const HR = 66;             // how far the rounded edge of the disc falls away
  const Rc = R - 98 - RC;    // radius of the ring of cavity centres
  const DTH = 356 / Rc;      // angular pitch
  const SPAN = a.span(PAD + 90);
  const nC = Math.ceil(SPAN / DTH) + 1;
  const sootOf = { '0': 0.2, '-1': 0.86, '1': 0.1, '-2': 0.38, '2': 0.46, '-3': 0.3, '3': 0.24 };
  const coins = [];
  for (let i = -nC; i <= nC; i++) {
    const th = i * DTH;
    coins.push({
      th, cs: Math.cos(th), sn: Math.sin(th), x: cx + Rc * Math.sin(th), y: cy - Rc * Math.cos(th),
      soot: sootOf[i] !== undefined ? sootOf[i] : rnd.range(0.15, 0.6), gl: rnd.range(-0.25, 0.45),
    });
  }

  // ── drawn detail, read back as channels: R = blurred "reversed legend" dents, G = hairline cracks, B = scraper marks ──
  const det = L.makeCanvas(RW, RH), dg = det.getContext('2d', { willReadFrequently: true });
  {
    const gl = L.makeCanvas(RW, RH), g = gl.getContext('2d');
    g.translate(-X0, -Y0); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#f00';
    // not writing: a handful of random bars and hooks either side of the boss, where a legend would sit, then blurred
    for (const c of coins) for (const side of [-1, 1]) {
      g.save(); g.translate(c.x, c.y); g.rotate(c.th); g.translate(side * 100, 0);
      const n = rnd.int(5, 8);
      for (let k = 0; k < n; k++) {
        g.lineWidth = rnd.range(4.5, 7.5); g.globalAlpha = rnd.range(0.5, 1);
        const x0 = rnd.range(-15, 15), y0 = rnd.range(-34, 34), an = rnd.range(0, Math.PI), hl = rnd.range(7, 17), bd = rnd.range(-9, 9);
        const ux = Math.cos(an), uy = Math.sin(an);
        g.beginPath(); g.moveTo(x0 - ux * hl, y0 - uy * hl); g.quadraticCurveTo(x0 - uy * bd, y0 + ux * bd, x0 + ux * hl, y0 + uy * hl); g.stroke();
      }
      g.restore();
    }
    const ln = L.makeCanvas(RW, RH), q = ln.getContext('2d');
    q.translate(-X0, -Y0); q.lineCap = 'round'; q.lineJoin = 'round'; q.globalCompositeOperation = 'lighter';
    // scraper marks: bundles of near-parallel hairlines, roughly following the edge
    for (let n = 0; n < 54; n++) {
      const th = rnd.range(-SPAN, SPAN), dr = -rnd.range(30, 560), p0 = a.pt(th, dr);
      const ang = th + rnd.range(-0.42, 0.42) + (rnd.chance(0.18) ? rnd.range(0.7, 1.3) * rnd.sign() : 0);
      const len = rnd.range(160, 620), cnt = rnd.int(5, 17), gap = rnd.range(2.6, 5.2), bend = rnd.range(-26, 26);
      const dxx = Math.cos(ang), dyy = Math.sin(ang), strength = rnd.range(0.2, 0.7);
      for (let j = 0; j < cnt; j++) {
        const o = (j - cnt / 2) * gap + rnd.range(-1.6, 1.6), s0 = rnd.range(-0.5, -0.3) * len, s1 = rnd.range(0.3, 0.5) * len;
        q.strokeStyle = `rgba(0,0,255,${(strength * rnd.range(0.3, 1)).toFixed(3)})`; q.lineWidth = rnd.range(1.1, 2.8);
        q.beginPath();
        q.moveTo(p0.x + dxx * s0 - dyy * o, p0.y + dyy * s0 + dxx * o);
        q.quadraticCurveTo(p0.x - dyy * (o + bend), p0.y + dxx * (o + bend), p0.x + dxx * s1 - dyy * o, p0.y + dyy * s1 + dxx * o);
        q.stroke();
      }
    }
    // hairline cracks running in from the edge, between cavities
    const crack = (s0, len, drift, seed, wd) => {
      q.strokeStyle = 'rgba(0,255,0,0.95)'; q.beginPath();
      let s = s0;
      for (let d = 2; d < len; d += 9) {
        s += drift * 9 + 5.5 * nB.n2(d / 23, seed) + 2.5 * nB.n2(d / 7, seed + 3);
        const p = a.pt(s / R, -d);
        if (d === 2) q.moveTo(p.x, p.y); else q.lineTo(p.x, p.y);
      }
      q.lineWidth = wd; q.stroke();
    };
    crack(196, 400, 0.05, 1.3, 1.7); crack(246, 150, 0.5, 4.1, 1.2); crack(-742, 230, -0.12, 7.7, 1.4); crack(1010, 300, 0.1, 11.2, 1.5);
    dg.filter = 'blur(2.1px)'; dg.drawImage(gl, 0, 0);
    dg.globalCompositeOperation = 'lighter'; dg.filter = 'blur(1px)'; dg.drawImage(ln, 0, 0);
    dg.filter = 'none';
  }
  const DT = dg.getImageData(0, 0, RW, RH).data;

  // ── the edge of the disc, as functions of the angle: width of the roll-off, chips, silhouette nibbles, the smoked stretch ──
  const TN = 8192, TK = (TN - 1) / (2 * SPAN);
  const WR = new Float32Array(TN), CH = new Float32Array(TN), ED = new Float32Array(TN), ST = new Float32Array(TN), CC = new Float32Array(TN);
  // [arc position of the blow (px from the crest), half width, how far the flake bites in]
  const chips = [[-1150, 100, 86], [-905, 64, 80], [-640, 118, 92], [-170, 74, 84], [190, 112, 94], [345, 46, 76], [575, 132, 90], [905, 60, 80], [1140, 92, 86]];
  for (let i = 0; i < TN; i++) {
    const s = (i / TK - SPAN) * R;
    const base = 56 + 9 * nA.fbm(s / 170, 3.1, 3) + 3.5 * nA.n2(s / 31, 8.8);
    let w = base, ch = 0, cc = 0;
    for (const [c0, cw, cd] of chips) {
      const q = (s - c0) / cw;
      if (q > -1 && q < 1) {
        const d = cd * Math.pow(Math.cos(q * Math.PI / 2), 1.5) * (1 + 0.07 * nB.n2(s / 34, c0));
        const c1 = sstep(-4, 16, d - base);
        if (c1 > ch) { ch = c1; cc = c0; }
        const hh = Math.max(12 - Math.abs(w - d), 0) / 12;
        w = Math.max(w, d) + hh * hh * 3;
      }
    }
    WR[i] = w; CH[i] = ch; CC[i] = cc;
    ED[i] = -Math.min(5.4, 0.7 + 1.1 * (nB.n2(s / 6.5, 1.7) * 0.5 + 0.5) + 1.5 * Math.max(0, nB.n2(s / 43, 5.5)) + 2.4 * ch * Math.max(0, nA.n2(s / 21, 9.9) + 0.35));
    ST[i] = sstep(-690 + 30 * nA.n2(s / 60, 2.2), -560, s) * sstep(-110 + 30 * nA.n2(s / 50, 6.1), -250, s);
  }

  // ── slow fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, chh = Math.ceil(RH / CS) + 2;
  const cU1 = new Float32Array(cw * chh), cU2 = new Float32Array(cw * chh), cS1 = new Float32Array(cw * chh), cS2 = new Float32Array(cw * chh), cCol = new Float32Array(cw * chh);
  for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    cU1[k] = nA.fbm(x / 70, y / 70, 3);
    cU2[k] = nA.fbm(x / 330 + 9, y / 330 - 4, 2);
    cS1[k] = nB.fbm(x / 250 - 3, y / 250 + 8, 3);
    cS2[k] = nB.fbm(x / 64 + 17, y / 64 + 5, 3);
    cCol[k] = nA.fbm(x / 190 + 51, y / 190 + 23, 3);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── 1) height field + material masks ──
  const Hh = new Float32Array(N), Al = new Float32Array(N), Sk = new Float32Array(N), Fr = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, x = X0 + i, ddx = x - cx;
      const rr = Math.sqrt(ddx * ddx + ddy * ddy), dr = rr - R;
      if (dr > 3) { Hh[k] = -HR - 3; continue; }
      const th = Math.atan2(ddx, ddy), s = th * R;
      let ti = ((th + SPAN) * TK) | 0; ti = ti < 0 ? 0 : ti >= TN ? TN - 1 : ti;
      const wrv = WR[ti], chip = CH[ti];
      let al = ED[ti] - dr + 0.5; Al[k] = al < 0 ? 0 : al > 1 ? 1 : al;

      const e1 = nA.n2(x / 21, y / 21), e2 = vn(x / 6.1, y / 6.1), e3 = vn(x / 2.3 + 40, y / 2.3);
      const u1 = bil(cU1, i, j), s2 = bil(cS2, i, j);

      // the cavity this pixel belongs to
      let ci = Math.round(th / DTH) + nC; ci = ci < 0 ? 0 : ci > 2 * nC ? 2 * nC : ci;
      const c = coins[ci];
      const dxl = x - c.x, dyl = y - c.y, lx = dxl * c.cs + dyl * c.sn, ly = -dxl * c.sn + dyl * c.cs;
      const r = Math.sqrt(lx * lx + ly * ly) + 1.5 * e1 + 0.5 * e2;
      let h = 0, pit = 0, runM = 0, aff = 0, bossM = 0;
      if (r < RC + 2) {
        const wall = sstep(RC + 1.5, RC - 4.5, r), tr = sstep(RG - 4, RG + 2.5, r);
        // square boss with slightly softened corners
        const bx = Math.abs(lx) - (SB - 7), by = Math.abs(ly) - (SB - 7);
        const mx = bx > 0 ? bx : 0, my = by > 0 ? by : 0;
        const d = Math.sqrt(mx * mx + my * my) + Math.min(Math.max(bx, by), 0) - 7 + 1.0 * e1 + 0.5 * e2;
        const b = sstep(4.2, -0.8, d);
        const gw = sstep(-0.5, 0.25, nB.n2(x / 41, y / 41) + c.gl);
        h = -wall * (DF + (DG - DF) * tr) * (1 - b) - (0.9 + 0.5 * e1) * b - 3.3 * (DT[k * 4] / 255) * gw * wall * (1 - tr) * (1 - b);
        pit = wall * (1 - b); bossM = b;
        aff = wall * c.soot * (0.5 + 0.5 * tr) * (1 - 0.75 * b);
      } else if (r < RC + 60) aff = c.soot * 0.6 * Math.exp(-(r - RC) / 15);
      // runner toward the circle centre
      if (ly > RG - 10 && lx > -60 && lx < 60) {
        const wv = 16.5 + 0.02 * (ly - RC) + 1.3 * e1, q = lx / wv, pr = 1 - q * q, gate = sstep(RG - 10, RG + 2, ly);
        if (pr > 0) {
          const hr = -DR * Math.pow(pr, 0.55) * gate;
          if (hr < h) h = hr;
          runM = Math.min(1, pr * 3) * gate;
          aff = Math.max(aff, (0.42 + 0.5 * c.soot) * runM);
        } else if (ly > RC - 6) aff = Math.max(aff, (0.3 + 0.45 * c.soot) * Math.exp(-(Math.abs(lx) - wv) / 15));
      }
      // rounded, chipped edge of the disc: a worn chamfer that steepens into the side wall; flakes leave a scarp and a dished scar
      let rimU = 0;
      if (dr > -wrv) {
        let u = (dr + wrv) / wrv; if (u > 1) u = 1;
        const round = 1 - Math.sqrt(1 - 0.97 * u * u);
        let prof = 0.3 * u + 0.7 * round;
        if (chip > 0) prof += (0.2 * sstep(0, 0.12, u) + 0.3 * u + 0.5 * round - prof) * chip;
        h -= HR * prof; rimU = u;
      }
      const rimM = sstep(0, 0.2, rimU);
      const faceM = (1 - pit) * (1 - runM) * (1 - rimM);
      // micro relief: scraper marks, wiping striations, tooth of the clay, slow undulation
      h += faceM * (1 - bossM) * (-0.5 * (DT[k * 4 + 2] / 255) + 0.16 * nB.n2(s / 140 + 5, dr / 2.9));
      h += (0.34 * e1 + 1.3 * u1) * (1 - 0.6 * pit) + 0.22 * e2 + 0.1 * e3 + 4 * bil(cU2, i, j);
      h -= 2.6 * (DT[k * 4 + 1] / 255) * (0.55 + 0.45 * e1);
      if (rimU > 0) {
        // hand-formed lumps along the edge; fracture scars carry conchoidal ripples spreading from the blow
        h += rimM * (1 - 0.75 * chip) * (3.2 * nA.n2(s / 58 + 9, dr / 36) + 1.7 * nA.n2(x / 17 + 9, y / 17) + 0.8 * e2 + 0.3 * e3);
        if (chip > 0) {
          const ds = s - CC[ti], dist = Math.sqrt(ds * ds + dr * dr * 1.6);
          h += chip * rimM * (0.9 * Math.sin(dist / 8.5 + 1.6 * e1) * sstep(0.04, 0.35, rimU) + 0.9 * nB.n2(x / 26, y / 26) + 0.45 * e2 + 0.25 * e3);
        }
      }
      // sand: fine grit, pin-hole pores, a few coarse temper grains (the pressed cavities are smoother than the scraped face)
      const gritK = (0.4 + 0.6 * faceM) * sstep(-0.5, 0.35, s2 + 0.5 * u1);
      cell(x / 7.5 + 0.6 * e1, y / 7.5 - 0.6 * u1);
      if (cId > 0.7) { const rg = 0.1 + 0.19 * fract(cId * 13.7), f = 1 - cD1 / (rg * rg); if (f > 0) h += (0.3 + 0.9 * fract(cId * 5.1)) * f * gritK; }
      cell(x / 23 + 4.1 + 0.5 * e1, y / 23 + 0.5 * s2);
      if (cId < 0.3 * sstep(-0.35, 0.4, u1 - s2)) { const rg = 0.03 + 0.11 * fract(cId * 31.7), f = 1 - cD1 / (rg * rg); if (f > 0) h -= (1.2 + 2 * fract(cId * 17.3)) * f; }
      cell(x / 37 + 9.7, y / 37 + 3.3);
      if (cId > 0.76) { const rg = 0.06 + 0.07 * fract(cId * 9.1), f = 1 - cD1 / (rg * rg); if (f > 0) h += 2.1 * Math.sqrt(f) * (0.25 + 0.75 * faceM + 0.6 * rimM); }
      Hh[k] = h;

      // soot: in the cavities and runners, in drifting clouds toward the centre, and along the smoked stretch of the edge
      const cloud = sstep(0.08, 0.55, bil(cS1, i, j) + 0.4 * s2 + 0.1 * e2) * 0.42 * sstep(-60, -320, dr);
      const frac = chip * sstep(0.0, 0.08, rimU);
      // the smoked stretch: densest on the edge, licking down the face in tongues
      const lick = 190 + 90 * nB.fbm(x / 150 + 3, y / 210, 2) + 46 * s2 + 16 * e1;
      const smoke = ST[ti] * sstep(-lick - 150, -lick + 70, dr) * (1 - 0.94 * frac) * (1 - 0.8 * sstep(0.62, 0.93, rimU));
      let K = aff * (0.75 + 0.5 * (s2 * 0.5 + 0.5)) + cloud * (0.35 + aff) + smoke * (0.94 + 0.06 * e2);
      Sk[k] = K < 0 ? 0 : K > 0.96 ? 0.96 : K; Fr[k] = frac;
    }
  }

  // ── 2) light it ──
  const Hb = boxBlur(Hh, RW, RH, 7, 2);
  const CLAY = lut([[0, '#050101'], [0.13, '#2b0c0a'], [0.26, '#5A2A1E'], [0.42, '#9c4530'], [0.56, '#C4694A'], [0.7, '#dd8560'], [0.84, '#E9A47E'], [0.94, '#f8c79c'], [1, '#ffe4c4']]);
  const FRAC = lut([[0, '#080201'], [0.13, '#34100a'], [0.26, '#662a17'], [0.42, '#ab4a2b'], [0.56, '#d06b42'], [0.7, '#e68a5c'], [0.84, '#f0aa80'], [0.94, '#fbcda2'], [1, '#ffe8cc']]);
  const SOOT = lut([[0, '#020101'], [0.3, '#0d0908'], [0.56, '#1E1714'], [0.74, '#2b211c'], [0.88, '#47382f'], [1, '#8f7765']]);
  const LX = -300, LY = -900, LZ = 600;       // lamp: up and to the left, low over the surface
  const D0 = 2000;                            // lamp distance at which the bare face lands on the base clay colour
  const AMB = 0.17, HMAX = 4.5;
  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 1; j < RH - 1; j++) {
    const y = Y0 + j;
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, al = Al[k];
      if (al <= 0) continue;
      const x = X0 + i, h0 = Hh[k];
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      const vx = LX - x, vy = LY - y, dl = Math.sqrt(vx * vx + vy * vy), ux = vx / dl, uy = vy / dl, tanE = LZ / dl;
      const nrm = Math.sqrt(1 + hx * hx + hy * hy);
      let I = (1 - (hx * ux + hy * uy) / tanE) / nrm; if (I < 0) I = 0;
      // cast shadow: march toward the lamp over the height field
      let occ = 0;
      if (I > 0) {
        for (let t = 1.5; t < 130; t += 1 + t * 0.07) {
          const ry = h0 + t * tanE; if (ry > HMAX) break;
          const sx = (i + ux * t + 0.5) | 0, sy = (j + uy * t + 0.5) | 0;
          if (sx < 0 || sy < 0 || sx >= RW) break;
          const ex = Hh[sy * RW + sx] - ry;
          if (ex > 0) { const o = ex / (0.6 + 0.07 * t); if (o > occ) { occ = o; if (o >= 1) break; } }
        }
      }
      const sh = occ >= 1 ? 0 : 1 - occ * occ * (3 - 2 * occ);
      const dv = Hb[k] - h0;
      const cav = dv > 0 ? (dv > 8 ? 1 : dv / 8) : 0, conv = dv < 0 ? (dv < -4 ? 1 : -dv / 4) : 0;
      let I2 = (1 - (hx * 0.77 - hy * 0.64) / 1.3) / nrm; I2 = I2 < 0 ? 0 : I2 > 2 ? 2 : I2;   // weak bounce from the upper right
      let e = AMB * I2 * (1 - 0.6 * cav) + (1 - AMB) * I * sh;
      e *= (1 + 0.14 * conv) * Math.pow(D0 * D0 / (dl * dl + LZ * LZ), 0.8);
      let t = e <= 1 ? 0.56 * Math.pow(e, 0.85) : 0.56 + 0.44 * (1 - Math.exp(-(e - 1) * 0.9));
      const li = ((t * (NL - 1)) | 0) * 3;
      let cr = CLAY[li], cg = CLAY[li + 1], cb = CLAY[li + 2];
      const fr = Fr[k];
      if (fr > 0) { cr += (FRAC[li] - cr) * fr; cg += (FRAC[li + 1] - cg) * fr; cb += (FRAC[li + 2] - cb) * fr; }
      const hv = bil(cCol, i, j);       // slow drift between a redder and a paler, buffer body
      cr *= 1 + 0.04 * hv; cg *= 1 + 0.12 * hv; cb *= 1 + 0.16 * hv;
      let K = Sk[k] * (1 - 0.22 * conv) + 0.22 * cav * Sk[k]; K = K > 0.97 ? 0.97 : K;
      if (K > 0) { cr += (SOOT[li] - cr) * K; cg += (SOOT[li + 1] - cg) * K; cb += (SOOT[li + 2] - cb) * K; }
      const o = k * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = al * 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);

  // mica / quartz flecks that will flash as they slide under the fixed lamp: only on lit, unsmoked clay
  const glints = [], rg = L.rng('s12glint');
  for (let n = 0; n < 4000 && glints.length < 46; n++) {
    const th = rg.range(-0.44, 0.44), dr = -rg.range(8, 500), pt = a.pt(th, dr);
    const i = Math.round(pt.x - X0), j = Math.round(pt.y - Y0);
    if (i < 2 || j < 2 || i >= RW - 2 || j >= RH - 2) continue;
    const k = j * RW + i;
    if (Sk[k] > 0.18 || d[k * 4] < 150 || Hh[k] < -3) continue;
    glints.push({ th, dr, ph: rg(), k: rg.range(0.35, 1), sz: rg.range(0.7, 1.25) });
  }

  // lens bloom off the hot edge: quarter-res, highlights only
  const bw = Math.ceil(RW / 4), bh = Math.ceil(RH / 4) + 24;
  const bloom = L.makeCanvas(bw, bh), bg = bloom.getContext('2d');
  bg.filter = 'blur(5px) brightness(0.8) contrast(2.2)';
  bg.drawImage(cnv, 0, 24, RW / 4, RH / 4);
  bg.filter = 'none';
  return { cnv, bloom, glints, X0, Y0, RW, RH };
}

export default {
  name: '叠铸陶范',
  tone: 'light',
  init(env) {
    S = buildMould(env);
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-ROT, ROT, p);
    const spin = () => { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); };
    // the slab slides about the circle centre
    ctx.save(); spin();
    ctx.drawImage(S.cnv, S.X0, S.Y0);
    ctx.restore();
    // the lamp does not move: its pool of light stays put on screen while the cavities pass through it
    ctx.save(); a.clipBelow(ctx, 2);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.linear(ctx, 0, a.crestY + 300, 0, H + 40, [[0, '#ffffff'], [1, '#c79683']]);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = L.radial(ctx, 430, a.crestY + 170, 0, 820, [[0, 'rgba(255,198,150,0.3)'], [0.5, 'rgba(255,180,130,0.12)'], [1, 'rgba(255,170,120,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // flecks in the clay catch the lamp for a frame or two as they pass
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const q of S.glints) {
      const tw = Math.pow(Math.max(0, Math.cos((p * 1.15 + q.ph) * L.TAU)), 5) * q.k;
      if (tw < 0.04) continue;
      const pt = a.pt(q.th + rot, q.dr), r = 9 * q.sz;
      ctx.fillStyle = L.radial(ctx, pt.x, pt.y, 0, r, [[0, `rgba(255,244,226,${(0.95 * tw).toFixed(3)})`], [0.16, `rgba(255,214,170,${(0.5 * tw).toFixed(3)})`], [0.5, `rgba(255,170,110,${(0.1 * tw).toFixed(3)})`], [1, 'rgba(255,160,100,0)']]);
      ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
    }
    ctx.restore();
    // warm bloom spilling off the lit edge into the black
    ctx.save(); spin();
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.3;
    ctx.drawImage(S.bloom, S.X0, S.Y0 - 96, S.bloom.width * 4, S.bloom.height * 4);
    ctx.restore();
  },
};
