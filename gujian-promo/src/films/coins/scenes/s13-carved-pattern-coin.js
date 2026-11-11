// s13 — 雕母木样. A hand-carved boxwood pattern coin, hugely enlarged, lying on parchment-coloured paper.
// The arc is the outer edge of the pattern. Reading inward: a freshly trimmed chamfer (the bright line), the flat raised
// rim (外郭) carrying a scribed circle with evenly stepped divider pricks, the wall dropping to the field, and the
// recessed field (肉) covered with short gouge cuts that all run the same way. A few plane shavings and the end of a
// cinnabar ink-line rest near the crest. No lettering anywhere.
//
// The wood is shaded per pixel in init(): one float height field (edge profile + gouge cuts + grain relief) lit by a soft
// key light from the top-left, over a grain albedo whose growth rings sweep a few degrees across the arc.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;
let S = null;

// radial layout, px measured inward from the arc
const CHW = 15;      // freshly trimmed chamfer
const RIMW = 168;    // inner edge of the raised rim
const STW = 9;       // wall between rim and field
const DEPTH = 17;    // the field lies this far below the rim top
const DOT = 122;     // scribed circle carrying the divider pricks
const PITCH = 66;    // spacing of the pricks along that circle

// key light (unit vector toward the light): from the top of frame, a little to the left
const LX = -0.30, LY = -0.70, LZ = 0.65;
const HN = Math.hypot(LX, LY, LZ + 1), HX = LX / HN, HY = LY / HN, HZ = (LZ + 1) / HN;
const AMB = 0.40, KD = 0.92;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const ihash = (i) => { let h = Math.imul(i | 0, 0x9e3779b1) ^ 0x85ebca6b; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };

/** the boxwood, everything below the arc → { c, x, y } (canvas + its frame position) */
function buildWood(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s13a'), nB = L.makeNoise('s13b');

  // ── 1D tables along the edge (index = arc length in px + AOFF)
  const AOFF = Math.ceil(a.span(PAD + 60) * R) + 16, AN = AOFF * 2 + 8;
  const tChW = new Float32Array(AN), tChS = new Float32Array(AN), tRim = new Float32Array(AN);
  {
    // the chamfer was pared by hand: a run of short flat knife facets, each with its own width and pitch
    const r = L.rng('s13facet'); let i = 0;
    while (i < AN) {
      const len = Math.round(r.range(60, 190)), w = CHW + r.range(-2.6, 2.6), s = r.range(0.5, 0.72);
      for (let j = 0; j < len && i < AN; j++, i++) { tChW[i] = w + 0.9 * nA.n2(i / 40, 2.2); tChS[i] = s; }
    }
  }
  for (let i = 0; i < AN; i++) tRim[i] = 1.4 * nA.fbm(i / 130, 5.5, 2) + 0.45 * nB.n2(i / 15, 8.1);

  // ── grain: growth rings about a point off the coin's own centre, so they drift across the rim at 10–17°
  const Gx = cx - 0.22 * R, Gy = cy - 0.2 * R, SP = 15;
  const gd0 = Math.floor(Math.hypot(L.clamp(Gx, X0, X0 + RW) - Gx, L.clamp(Gy, Y0, Y0 + RH) - Gy)) - 4;
  let gd1 = 0;
  for (const [x, y] of [[X0, Y0], [X0 + RW, Y0], [X0, Y0 + RH], [X0 + RW, Y0 + RH]]) gd1 = Math.max(gd1, Math.hypot(x - Gx, y - Gy));
  const GN = Math.ceil(gd1 - gd0) + 40;
  const tRing = new Float32Array(GN);
  for (let i = 0; i < GN; i++) tRing[i] = 1.5 * nB.fbm((gd0 + i) / 150, 3.3, 2);

  // slow fields on a coarse grid
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWarp = new Float32Array(cw * ch), cMot = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    cWarp[k] = 10 * nA.fbm(x / 430, y / 430, 2) + 0.7 * nA.n2(x / 95 + 5, y / 95);
    cMot[k] = nB.fbm(x / 540 + 9, y / 400 - 4, 3);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── gouge cuts in the field: short strokes of a small gouge, all driven the same way (up and to the right).
  //    Every stroke enters shallow, runs as a round-bottomed flute and stops dead, leaving a crescent step; the surface is
  //    the minimum of all strokes, so neighbouring flutes meet in crisp ridges.
  const Cut = new Float32Array(N), Tn = new Float32Array(N);
  {
    const PHI = -1.0, c0 = Math.cos(PHI), s0 = Math.sin(PHI);
    const rs = L.rng('s13cut');
    const stri = new Float32Array(256); for (let i = 0; i < 256; i++) stri[i] = rs.range(-1, 1);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, y] of [[X0, Y0], [X0 + RW, Y0], [X0, Y0 + RH], [X0 + RW, Y0 + RH]]) {
      const u = x * c0 + y * s0, v = -x * s0 + y * c0;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const ROW = 20;
    for (let v = v0 - 20; v < v1 + 20; v += ROW) {
      let u = u0 - 160 + rs.range(0, 150);
      while (u < u1 + 160) {
        const len = rs.range(40, 76), wid = rs.range(12.5, 16), dep = rs.range(2.8, 5.4);
        const vv = v + rs.range(-2.6, 2.6), da = rs.range(-0.045, 0.045), tone = rs.range(-0.08, 0.08), so = rs.int(0, 255);
        const uc = u + len;
        u += 2 * len * rs.range(0.8, 0.94);
        const x0 = uc * c0 - vv * s0, y0 = uc * s0 + vv * c0;
        if (x0 < X0 - 90 || x0 > X0 + RW + 90 || y0 < Y0 - 90 || y0 > Y0 + RH + 90) continue;
        if (Math.hypot(x0 - cx, y0 - cy) - R > -(RIMW + STW) + 70) continue;
        const c2 = Math.cos(PHI + da), s2 = Math.sin(PHI + da);
        const ex = Math.ceil(len * Math.abs(c2) + wid * Math.abs(s2)) + 1, ey = Math.ceil(len * Math.abs(s2) + wid * Math.abs(c2)) + 1;
        const i0 = Math.max(0, Math.floor(x0 - ex - X0)), i1 = Math.min(RW - 1, Math.ceil(x0 + ex - X0));
        const j0 = Math.max(0, Math.floor(y0 - ey - Y0)), j1 = Math.min(RH - 1, Math.ceil(y0 + ey - Y0));
        for (let j = j0; j <= j1; j++) {
          const dv = Y0 + j - y0;
          for (let i = i0; i <= i1; i++) {
            const du = X0 + i - x0, lv = -du * s2 + dv * c2, tv = lv / wid, t2 = tv * tv;
            if (t2 >= 1) continue;
            const su = (du * c2 + dv * s2) / len;
            if (su <= -1 || su >= 1) continue;
            const sx = su + 0.24 * t2;                    // the stop is a crescent, like the gouge's edge
            if (sx >= 1) continue;
            let ga = (su + 1) / 0.95; ga = ga >= 1 ? 1 : Math.sqrt(ga);
            if (sx > 0.8) { const q = (sx - 0.8) / 0.2; ga *= Math.sqrt(1 - q * q); }
            const sf = lv * 0.85 + so, si = Math.floor(sf), fr = sf - si;
            const st = stri[si & 255] * (1 - fr) + stri[(si + 1) & 255] * fr;   // nicks in the tool edge → fine lines along the cut
            const hc = -dep * ga * Math.sqrt(1 - t2) * (0.8 + 0.2 * su) + 0.2 * st * ga;
            const k = j * RW + i;
            if (hc < Cut[k]) { Cut[k] = hc; Tn[k] = tone; }
          }
        }
      }
    }
  }

  // ── pass A: height + albedo
  const Hh = new Float32Array(N), Sh = new Float32Array(N), Zn = new Int8Array(N).fill(-1);
  const img = new ImageData(RW, RH), d = img.data;
  const FLx = cx - 280, FLy = a.crestY - 40;      // centre of the pool of light
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, dy = y - cy;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, dx = x - cx, rr = Math.sqrt(dx * dx + dy * dy), dr = rr - R;
      if (dr > 2.6) continue;
      const k = j * RW + i, o = k * 4;
      const ai = Math.round(Math.atan2(dx, -dy) * R) + AOFF;
      const chw = tChW[ai], rimw = RIMW + tRim[ai];
      // grain
      const gx = x - Gx, gy = y - Gy, gd = Math.sqrt(gx * gx + gy * gy);
      const gf = gd - gd0, gi = gf | 0;
      const ww = (gd + bil(cWarp, i, j)) / SP + tRing[gi] + (tRing[gi + 1] - tRing[gi]) * (gf - gi);
      const ri = Math.floor(ww), v = ww - ri;
      let late;
      if (v < 0.8) { const q = v / 0.8, q2 = q * q; late = q2 * q2 * q; } else late = 1 - sstep(0.8, 1, v);
      late *= 0.32 + 0.68 * ihash(ri);
      const tU = Math.atan2(gx, -gy) * gd;
      const st = nA.n2(tU / 84, gd / 2.7), st2 = nB.n2(tU / 28, gd / 1.25);   // fibre streaks lying along the rings
      const mot = bil(cMot, i, j);
      const e = Math.sin(v * 3.9), dk = late * 0.84;
      let cr = 217 + 17 * e, cg = 164 + 19 * e, cb = 65 + 13 * e;        // boxwood #D9A441, a breath lighter in the early wood
      cr += (154 - cr) * dk; cg += (100 - cg) * dk; cb += (32 - cb) * dk;  // late-wood line → #9A6420
      let tn = 1 + 0.07 * mot + 0.06 * st + 0.035 * st2;
      // profile
      let h = -0.28 * late + 0.1 * st + 0.05 * st2, zone, sh = 1;
      if (dr > -chw) {                      // chamfer: pale, fresh-cut
        zone = 0; h -= tChS[ai] * (dr + chw);
        cr += (250 - cr) * 0.36; cg += (222 - cg) * 0.36; cb += (140 - cb) * 0.36;
      } else if (dr > -rimw) {              // rim top: handled, a shade deeper
        zone = 1; cb *= 0.93;
      } else {
        const dist = -rimw - dr;
        cr += (206 - cr) * 0.42; cg += (138 - cg) * 0.42; cb += (44 - cb) * 0.42;   // the sunk field reads a deeper amber
        if (dist < STW) { zone = 2; h -= DEPTH * sstep(0, 1, dist / STW); }
        else {
          zone = 3;
          const fd = dist - STW, m = sstep(3, 15, fd);
          h += -DEPTH + m * Cut[k] - 1.8 * Math.exp(-((fd - 6) * (fd - 6)) / 30);   // stop-cut trench along the wall, then the gouge cuts
          tn *= 1 + m * Tn[k];
          // the wall's cast shadow and the occlusion in the corner
          const ls = (DEPTH * Math.max(0.3, (dx / rr) * LX + (dy / rr) * LY)) / LZ;
          sh = (1 - 0.36 * (1 - sstep(0.25 * ls, 1.4 * ls, fd))) * (1 - 0.16 * Math.exp(-fd / 13));
        }
      }
      Hh[k] = h; Zn[k] = zone;
      Sh[k] = sh * (1.06 - 0.2 * sstep(260, 1500, Math.hypot(x - FLx, y - FLy)));
      d[o] = cr * tn; d[o + 1] = cg * tn; d[o + 2] = cb * tn * (1 - 0.05 * mot); d[o + 3] = 255;
    }
  }

  // ── pass B: light it
  const GLOSS = [0.36, 0.26, 0.1, 0.16];
  for (let j = 0; j < RH; j++) {
    const jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, zn = Zn[k];
      if (zn < 0) continue;
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * inv, ny = -hy * inv;
      let diff = nx * LX + ny * LY + inv * LZ; if (diff < 0) diff = 0;
      const li = (AMB + KD * diff) * Sh[k];
      let sp = nx * HX + ny * HY + inv * HZ;
      sp = sp > 0 ? Math.pow(sp, 30) * GLOSS[zn] * Sh[k] : 0;
      const o = k * 4;
      let r = d[o], g = d[o + 1], b = d[o + 2];
      if (li < 1) { const t = 1 - li; r *= li * (1 + 0.22 * t); g *= li * (1 + 0.02 * t); b *= li * (1 - 0.4 * t); }   // shadows stay warm
      else { const t = li - 1; r = r * li + 8 * t; g = g * li + 30 * t; b = b * li + 80 * t; }
      d[o] = r + sp * 255; d[o + 1] = g + sp * 243; d[o + 2] = b + sp * 205;
    }
  }
  const c = L.makeCanvas(RW, RH);
  c.getContext('2d').putImageData(img, 0, 0);
  return { c, x: X0, y: Y0 };
}

/** paper + the pattern coin with its layout marks */
function buildBase(env) {
  const a = env.arc, R = a.R;
  const wood = buildWood(env);
  return L.makeLayer(PAD, (g) => {
    // ── parchment-coloured paper
    const ph = Math.ceil(a.yAt(-PAD) + PAD + 40);
    g.drawImage(L.paperTex(W + PAD * 2, ph, { base: '#E8DCC0', seed: 's13paper', tone: '#9a7a48', fiber: 0.9, stain: 0.32, grain: 0.16 }), -PAD, -PAD);
    const rp = L.rng('s13fibre');
    g.lineCap = 'round';
    for (let i = 0; i < 300; i++) {                      // longer fibres pressed into the sheet
      const x = rp.range(-PAD, W + PAD), y = rp.range(-PAD, ph - PAD), len = rp.range(24, 120), an = rp.range(0, Math.PI), bend = rp.range(-0.5, 0.5);
      g.strokeStyle = rp.chance(0.55) ? L.rgba('#fffaf0', rp.range(0.2, 0.5)) : L.rgba('#8c6a3a', rp.range(0.08, 0.24));
      g.lineWidth = rp.range(0.5, 1.4);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len);
      g.stroke();
    }
    L.speckle(g, { seed: 's13speck', count: 900, x: -PAD, y: -PAD, w: W + PAD * 2, h: ph, rMin: 0.4, rMax: 1.7, colors: ['#6f5330', '#8c6a3a', '#b89868'], alpha: [0.08, 0.4] });
    L.speckle(g, { seed: 's13bark', count: 26, x: -PAD, y: -PAD, w: W + PAD * 2, h: ph, rMin: 1.6, rMax: 3.6, colors: ['#5a4126', '#7a5a34'], alpha: [0.2, 0.5], squash: 0.5 });
    // the light pools at the top-left and falls away to the corners
    g.save(); g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.radial(g, a.cx - 320, a.crestY - 330, 80, 1500, [[0, 'rgba(255,253,244,0.6)'], [0.5, 'rgba(255,250,236,0.08)'], [1, 'rgba(110,82,44,0.38)']]);
    g.fillRect(-PAD, -PAD, W + PAD * 2, ph);
    g.restore();
    // warm bounce off the wood, then the contact shadow tucked under the edge
    g.save(); a.pathAbove(g, -2);
    g.fillStyle = L.radial(g, a.cx, a.cy, R, R + 170, [[0, 'rgba(226,170,70,0.2)'], [0.4, 'rgba(226,170,70,0.07)'], [1, 'rgba(226,170,70,0)']]);
    g.fill();
    g.fillStyle = L.radial(g, a.cx, a.cy, R - 2, R + 110, [[0, 'rgba(52,30,8,0.72)'], [0.035, 'rgba(60,36,10,0.55)'], [0.085, 'rgba(84,54,18,0.27)'],
      [0.24, 'rgba(112,78,32,0.1)'], [0.6, 'rgba(130,94,44,0.03)'], [1, 'rgba(130,94,44,0)']]);
    g.fill();
    g.restore();

    // ── the wood
    g.save(); a.clipBelow(g, 0);
    g.drawImage(wood.c, wood.x, wood.y);
    // hairline scratches left by the plane on the rim
    const rsx = L.rng('s13scr');
    for (let i = 0; i < 26; i++) {
      const th = rsx.range(-a.span(PAD), a.span(PAD)), dr = -rsx.range(CHW + 8, RIMW - 10), p = a.pt(th, dr);
      const an = 0.42 + rsx.range(-0.12, 0.12), len = rsx.range(40, 230), al = rsx.range(0.06, 0.2), ca = Math.cos(an) * len / 2, sa = Math.sin(an) * len / 2;
      g.lineWidth = rsx.range(0.6, 1.1);
      g.strokeStyle = `rgba(96,56,12,${al})`; g.beginPath(); g.moveTo(p.x - ca, p.y - sa); g.lineTo(p.x + ca, p.y + sa); g.stroke();
      g.strokeStyle = `rgba(255,240,190,${al * 0.9})`; g.beginPath(); g.moveTo(p.x - ca, p.y - sa + 1.1); g.lineTo(p.x + ca, p.y + sa + 1.1); g.stroke();
    }
    // the scribed circle: a hair-fine incised line (dark groove, lit lower lip), pressure varying from step to step
    const step = PITCH / (R - DOT), nd = Math.ceil(a.span(PAD + 80) / step);
    const rd = L.rng('s13dots');
    for (let n = -nd; n < nd; n++) {
      const t0 = (n + 0.37) * step, t1 = t0 + step, al = rd.range(0.42, 0.74);
      g.strokeStyle = `rgba(66,38,10,${al})`; g.lineWidth = 1.5; a.stroke(g, -DOT, t0, t1 + 0.0005);
      g.strokeStyle = `rgba(255,242,196,${al * 0.75})`; g.lineWidth = 1; a.stroke(g, -DOT - 1.5, t0, t1 + 0.0005);
    }
    // divider pricks, stepped off at one fixed opening; every step also left a faint swing-scratch of the other leg
    for (let n = -nd; n <= nd; n++) {
      const th = (n + 0.37) * step, p = a.pt(th, -DOT), q = a.pt(th - step, -DOT);
      const rad = Math.hypot(p.x - q.x, p.y - q.y), an = Math.atan2(p.y - q.y, p.x - q.x);
      if (rd.chance(0.8)) {
        const al = rd.range(0.16, 0.36), sw = rd.range(0.1, 0.19);
        g.strokeStyle = `rgba(70,40,10,${al})`; g.lineWidth = 1; g.beginPath(); g.arc(q.x, q.y, rad, an - sw, an + sw); g.stroke();
        g.strokeStyle = `rgba(255,240,190,${al * 0.7})`; g.lineWidth = 0.8; g.beginPath(); g.arc(q.x, q.y, rad + 1.1, an - sw, an + sw); g.stroke();
      }
      const rr = rd.range(5.6, 7.4), jx = rd.range(-0.8, 0.8), jy = rd.range(-0.6, 0.6), x = p.x + jx, y = p.y + jy;
      // ink that crept into the grain round the hole
      g.save(); g.translate(x, y); g.rotate(th + 0.2); g.scale(1.45, 1);
      g.fillStyle = L.radial(g, 0, 0, rr * 0.5, rr * 2.2, [[0, 'rgba(42,30,20,0.42)'], [0.5, 'rgba(60,38,16,0.14)'], [1, 'rgba(60,38,16,0)']]);
      g.beginPath(); g.arc(0, 0, rr * 2.2, 0, L.TAU); g.fill(); g.restore();
      // the hole: black at the shaded upper wall, the lower wall catching a little light
      g.fillStyle = L.radial(g, x - 0.8, y - 1.6, 0, rr * 1.25, [[0, '#0e0805'], [0.6, '#2A1E14'], [1, '#5c3c1a']]);
      g.beginPath(); g.arc(x, y, rr, 0, L.TAU); g.fill();
      g.strokeStyle = 'rgba(255,240,188,0.85)'; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, rr + 0.5, 0.12 * Math.PI, 0.78 * Math.PI); g.stroke();
      g.strokeStyle = 'rgba(48,26,6,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, rr + 0.4, 1.1 * Math.PI, 1.8 * Math.PI); g.stroke();
    }
    g.restore();
  });
}

// ───────────── loose things resting on the pattern ─────────────
const CURL = L.makeRamp([[0, '#6f3f0e'], [0.3, '#a96c22'], [0.52, '#d59f3e'], [0.72, '#efca74'], [0.88, '#fbe6ae'], [1, '#fff6d8']]);
const CURL_IN = L.makeRamp([[0, '#7a4208'], [0.45, '#b9741a'], [0.75, '#e09c2e'], [1, '#f3c058']]);

/** a plane shaving: a thin ribbon wound into an open corkscrew about an axis lying on the table */
function drawCurl(g, o) {
  const ax = Math.cos(o.ang), ay = Math.sin(o.ang), nx = -ay, ny = ax;
  const n = Math.max(24, Math.round(o.turns * 48));
  const P = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, t = o.ph + f * o.turns * L.TAU;
    const rad = L.lerp(o.r0, o.r1, f) * (1 + 0.05 * Math.sin(f * 9 + o.ph));
    const s = o.pitch * o.turns * f;
    const tp = Math.min(1, f / 0.045, (1 - f) / 0.06);
    const hw = o.w * 0.5 * (0.3 + 0.7 * Math.sqrt(Math.max(0, tp)));
    const c = Math.cos(t), sn = Math.sin(t);
    const px = o.x + ax * s + nx * rad * c, py = o.y + ay * s + ny * rad * c;
    P.push({ c, sn, z: rad * sn, x0: px - ax * hw, y0: py - ay * hw, x1: px + ax * hw, y1: py + ay * hw });
  }
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((p, q) => (P[p].z + P[p + 1].z) - (P[q].z + P[q + 1].z) || p - q);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const i of order) {
    const A = P[i], B = P[i + 1], cm = (A.c + B.c) / 2, sm = (A.sn + B.sn) / 2;
    const front = sm >= 0;
    const dOut = nx * cm * LX + ny * cm * LY + sm * LZ;     // lambert on the outer face
    let col;
    if (front) col = L.css(CURL(L.clamp(0.26 + 0.78 * Math.max(0, dOut))));
    else col = L.css(CURL_IN(L.clamp(0.18 + 0.5 * Math.max(0, -dOut) + 0.75 * Math.max(0, dOut))));   // inner face: in its own shade, but the thin wood glows through
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(A.x0, A.y0); g.lineTo(B.x0, B.y0); g.lineTo(B.x1, B.y1); g.lineTo(A.x1, A.y1); g.closePath(); g.fill(); g.stroke();
    if (front) {
      g.strokeStyle = 'rgba(150,96,30,0.26)'; g.lineWidth = 0.8;           // grain running the length of the ribbon
      for (const q of [0.2, 0.43, 0.62, 0.83]) {
        g.beginPath(); g.moveTo(L.lerp(A.x0, A.x1, q), L.lerp(A.y0, A.y1, q)); g.lineTo(L.lerp(B.x0, B.x1, q), L.lerp(B.y0, B.y1, q)); g.stroke();
      }
      g.strokeStyle = 'rgba(255,248,220,0.85)'; g.lineWidth = 1.3;         // the paper-thin edges catch the light
    } else { g.strokeStyle = 'rgba(92,50,8,0.55)'; g.lineWidth = 1; }
    g.beginPath(); g.moveTo(A.x0, A.y0); g.lineTo(B.x0, B.y0); g.moveTo(A.x1, A.y1); g.lineTo(B.x1, B.y1); g.stroke();
  }
  g.restore();
}

function sprite(x0, y0, w, h, draw) {
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.translate(-x0, -y0); draw(g);
  return c;
}
function silhouette(src, color, blur) {
  const c = L.makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return L.blurred(c, blur);
}

/** shavings, chips and the cinnabar ink-line → { c, x, y } */
function buildProps(env) {
  const a = env.arc, R = a.R;
  const bx = Math.round(a.cx - 800), by = Math.round(a.crestY - 260), bw = 1600, bh = 740;
  const c = L.makeCanvas(bw, bh), g = c.getContext('2d');
  g.translate(-bx, -by);
  const P = (tpx, dr) => a.pt(tpx / R, dr);

  // ── chips and dust thrown off by the knife
  const rc = L.rng('s13chips');
  const heaps = [[-330, -40, 70], [395, -150, 60], [150, -66, 34], [-40, -110, 120], [-520, -200, 60]];
  for (let i = 0; i < 120; i++) {
    const hp = rc.pick(heaps), p = P(hp[0] + rc.gauss() * hp[2], hp[1] + rc.gauss() * hp[2] * 0.5);
    const s = rc.range(1.4, 4.6) * (rc.chance(0.1) ? 1.9 : 1), an = rc.range(0, L.TAU), nv = rc.int(3, 5);
    const poly = (ox, oy) => { g.beginPath(); for (let v = 0; v < nv; v++) { const t = an + (v / nv) * L.TAU, rr = s * (0.6 + 0.4 * ((v * 7 + i) % 3) / 2); g.lineTo(p.x + ox + Math.cos(t) * rr * 1.5, p.y + oy + Math.sin(t) * rr * 0.8); } g.closePath(); };
    g.fillStyle = 'rgba(58,30,6,0.38)'; poly(s * 0.3 + 0.7, s * 0.55 + 1); g.fill();
    g.fillStyle = rc.pick(['#f7e4ac', '#efcf82', '#fbefc8', '#e6bc62']); poly(0, 0); g.fill();
    g.strokeStyle = 'rgba(255,250,228,0.7)'; g.lineWidth = 0.7; g.stroke();
  }

  // ── shavings
  const curls = [
    { t: -436, dr: -66, ang: -0.4, r0: 44, r1: 31, w: 50, pitch: 68, turns: 2.4, ph: 0.5 },
    { t: 322, dr: -128, ang: 0.34, r0: 35, r1: 26, w: 42, pitch: 55, turns: 2.15, ph: 2.2 },
    { t: 138, dr: -44, ang: 1.05, r0: 21, r1: 16, w: 27, pitch: 34, turns: 1.7, ph: 4.0 },
  ];
  for (const o of curls) {
    const p0 = P(o.t, o.dr), ang = o.t / R + o.ang, len = o.pitch * o.turns;
    const ex = p0.x + Math.cos(ang) * len, ey = p0.y + Math.sin(ang) * len, m = o.r0 + o.w + 70;
    const x0 = Math.floor(Math.min(p0.x, ex) - m), y0 = Math.floor(Math.min(p0.y, ey) - m);
    const sp = sprite(x0, y0, Math.ceil(Math.abs(ex - p0.x) + m * 2), Math.ceil(Math.abs(ey - p0.y) + m * 2), (s) => drawCurl(s, { ...o, x: p0.x, y: p0.y, ang }));
    g.globalAlpha = 0.34; g.drawImage(silhouette(sp, '#3c2008', 10), x0 + o.r0 * 0.34, y0 + o.r0 * 0.74);
    g.globalAlpha = 0.4; g.drawImage(silhouette(sp, '#361c06', 3.5), x0 + o.r0 * 0.07, y0 + o.r0 * 0.2);
    g.globalAlpha = 1; g.drawImage(sp, x0, y0);
  }

  // ── the ink-line: a twisted cord soaked in cinnabar; it lies along the rim, then its end lifts clear of the edge
  const ctl = [[-182, -112], [-152, -94], [-114, -88], [-80, -108], [-48, -134], [-12, -128], [14, -98], [32, -58], [44, -14], [54, 34], [62, 84], [57, 124], [40, 152], [22, 163]];
  const pts = L.smoothPath(ctl.map(([t, dr]) => { const p = P(t, dr); return [p.x, p.y]; }), 3);
  const np = pts.length, TW = 7.6;
  const lift = (i) => sstep(0.5, 1, i / (np - 1));
  const run = (gg, dxy, i0 = 0, i1 = np - 1) => { gg.beginPath(); for (let i = i0; i <= i1; i++) { const o = dxy(i); if (i === i0) gg.moveTo(pts[i][0] + o[0], pts[i][1] + o[1]); else gg.lineTo(pts[i][0] + o[0], pts[i][1] + o[1]); } gg.stroke(); };
  // cinnabar rubbed off on the wood where the cord lay
  g.save(); a.clipBelow(g, 0); g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(200,50,30,0.07)'; g.lineWidth = 22; run(g, () => [0, 0]);
  g.strokeStyle = 'rgba(200,50,30,0.1)'; g.lineWidth = 13; run(g, () => [0, 0]);
  g.restore();
  // shadow: tight where the cord rests, drifting away and softening where it lifts
  {
    const sx0 = Math.floor(a.cx - 300), sy0 = Math.floor(a.crestY - 260), sw = 560, sh2 = 460;
    const far = sprite(sx0, sy0, sw, sh2, (s) => { s.lineCap = 'round'; s.lineJoin = 'round'; s.strokeStyle = '#3a2008'; s.lineWidth = TW + 1; run(s, (i) => { const l = lift(i); return [2 + 17 * l, 4 + 33 * l]; }); });
    g.globalAlpha = 0.42; g.drawImage(L.blurred(far, 5.5), sx0, sy0);
    const near = sprite(sx0, sy0, sw, sh2, (s) => { s.lineCap = 'round'; s.lineJoin = 'round'; s.strokeStyle = '#341a06'; s.lineWidth = TW; run(s, () => [1.6, 3.4], 0, Math.round(np * 0.62)); });
    g.globalAlpha = 0.5; g.drawImage(L.blurred(near, 2.2), sx0, sy0);
    g.globalAlpha = 1;
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  // frayed ends
  const rt = L.rng('s13thread');
  const fray = (i, dir, count, len) => {
    const p = pts[i], q = pts[i - dir * 4], an = Math.atan2(p[1] - q[1], p[0] - q[0]);
    for (let k = 0; k < count; k++) {
      const b = an + rt.range(-0.6, 0.6), l = len * rt.range(0.5, 1.15), bend = rt.range(-0.5, 0.5);
      g.strokeStyle = rt.pick(['#C8321E', '#a82414', '#e2553a']); g.lineWidth = rt.range(0.9, 1.8);
      g.beginPath(); g.moveTo(p[0], p[1]);
      g.quadraticCurveTo(p[0] + Math.cos(b + bend) * l * 0.55, p[1] + Math.sin(b + bend) * l * 0.55, p[0] + Math.cos(b) * l, p[1] + Math.sin(b) * l); g.stroke();
    }
  };
  fray(np - 1, 1, 8, 30); fray(0, -1, 5, 16);
  // body
  g.strokeStyle = '#7a170c'; g.lineWidth = TW + 1.8; run(g, () => [0.5, 0.8]);
  g.strokeStyle = '#C8321E'; g.lineWidth = TW; run(g, () => [0, 0]);
  g.strokeStyle = 'rgba(236,104,72,0.85)'; g.lineWidth = TW * 0.34; run(g, () => [-1.2, -1.9]);
  // the twist of the plies + loose fibres
  for (let i = 2; i < np - 2; i += 2) {
    const p = pts[i], q = pts[i + 1], tl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, tx = (q[0] - p[0]) / tl, ty = (q[1] - p[1]) / tl, ux = -ty, uy = tx, hw = TW * 0.5;
    g.strokeStyle = 'rgba(96,16,8,0.5)'; g.lineWidth = 1.15;
    g.beginPath(); g.moveTo(p[0] + ux * hw - tx * 2.4, p[1] + uy * hw - ty * 2.4); g.lineTo(p[0] - ux * hw + tx * 2.4, p[1] - uy * hw + ty * 2.4); g.stroke();
    if (rt.chance(0.3)) {
      const sd = rt.sign(), l = rt.range(4, 12), b = rt.range(-0.9, 0.9);
      g.strokeStyle = L.rgba(rt.pick(['#C8321E', '#e2553a', '#a82414']), rt.range(0.5, 0.9)); g.lineWidth = rt.range(0.6, 1.1);
      g.beginPath(); g.moveTo(p[0] + ux * hw * sd, p[1] + uy * hw * sd);
      g.lineTo(p[0] + ux * (hw + l * Math.cos(b)) * sd + tx * l * Math.sin(b), p[1] + uy * (hw + l * Math.cos(b)) * sd + ty * l * Math.sin(b)); g.stroke();
    }
  }
  return { c, x: bx, y: by };
}

export default {
  name: '雕母木样',
  tone: 'dark',
  init(env) {
    S = { base: buildBase(env), props: buildProps(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // creep in, and let the pattern turn about 1.5° under the lens
    const rot = L.lerp(-0.013, 0.013, p), zoom = L.lerp(0.997, 1.022, p);
    L.blit(ctx, env, S.base, { rot, zoom });
    L.cam(ctx, env, { zoom }, () => {
      // the bright line on the chamfer wanders along the edge as the wood turns under the light
      const th = L.lerp(-0.12, 0.045, p);
      ctx.save(); a.clipBand(ctx, 0, -(CHW + 2)); ctx.globalCompositeOperation = 'screen';
      a.at(ctx, th, -CHW * 0.5, () => {
        ctx.scale(9, 1);
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, 38, [[0, 'rgba(255,252,232,0.95)'], [0.35, 'rgba(255,240,180,0.42)'], [1, 'rgba(255,230,150,0)']]);
        ctx.fillRect(-38, -38, 76, 76);
      });
      ctx.restore();
      // and a broad soft sheen follows it across the flat of the rim
      ctx.save(); a.clipBand(ctx, -CHW, -(RIMW - 2)); ctx.globalCompositeOperation = 'screen';
      a.at(ctx, th - 0.015, -RIMW * 0.42, () => {
        ctx.scale(6.5, 1);
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, 96, [[0, 'rgba(255,238,170,0.2)'], [0.5, 'rgba(255,226,140,0.08)'], [1, 'rgba(255,220,130,0)']]);
        ctx.fillRect(-96, -96, 192, 192);
      });
      ctx.restore();
    });
    L.cam(ctx, env, { rot, zoom }, () => ctx.drawImage(S.props.c, S.props.x, S.props.y));
    L.vignette(ctx, { strength: 0.16, color: '#2a1806' });
  },
};
