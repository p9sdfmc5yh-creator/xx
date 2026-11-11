// s27 — 松花粉. A heap of pine pollen on black, macro: the arc is the heap's upper outline.
// Pollen is a matte, pale-yellow, very fine powder — so nothing here is shaded like metal. The heap is a height field
// (soft dunes, two or three slump scars, a few shallow scrape marks that follow the arc, crumbs of clumped powder, and
// pixel-fine grain) lit by a top light from slightly left: every crumb gets a lit crown and drops a short shadow toward
// the lens. The outline is not a line: the powder dissolves grain by grain into a fringe of escaping dust.
// Sparkle = single grains catching the top light (tiny, pale, re-seeded every frame) + dust motes drifting down.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;
const FS = 14;                    // foreshortening toward the outline: surface depth V = d + FS·√d (d = px below the arc)
const TH0 = -0.035;               // the top light pools just left of the crest
const LX = 0.26, LY = 0.966;      // direction the light travels across the frame (from the upper left, downward)
const TAN = 0.5;                  // light elevation above the powder surface (shadow length = height / TAN)
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const dOfV = (V) => { const s = (-FS + Math.sqrt(FS * FS + 4 * Math.max(0, V))) / 2; return s * s; };
const sideLight = (th) => { const t = (th - TH0) / 0.37; return 0.3 + 0.7 * Math.exp(-t * t); };

// slump scars (塌落的小坡): u = centre along the arc (px), v = crown depth, w = half-width, sag = how far the flanks hang
// below the crown, h = drop (px of height), len = how quickly the slope recovers below the scar
const SCARPS = [
  { u: 430, v: 430, w: 360, sag: 150, h: 12.5, len: 130, seed: 3 },
  { u: -600, v: 300, w: 270, sag: 100, h: 10, len: 100, seed: 8 },
  { u: -90, v: 690, w: 300, sag: 120, h: 13, len: 140, seed: 14 },
];
// scrape marks (刮痕) that run with the arc: u0..u1 extent, v = depth at u0, k = drift, w = half-width, depth
const GROOVES = [
  { u0: -860, u1: 380, v: 232, k: 0.012, w: 13, depth: 2.6, seed: 1 },
  { u0: -200, u1: 1010, v: 352, k: -0.022, w: 10, depth: 2.1, seed: 2 },
  { u0: 130, u1: 790, v: 150, k: 0.012, w: 7, depth: 1.4, seed: 3 },
  { u0: -1060, u1: -180, v: 492, k: 0.03, w: 14, depth: 2.6, seed: 4 },
  { u0: -470, u1: 150, v: 270, k: 0.018, w: 5, depth: 1.0, seed: 5 },
  { u0: 330, u1: 1120, v: 246, k: -0.016, w: 6, depth: 1.2, seed: 6 },
];

// luminance → colour. Shadows turn toward ochre-brown (never olive), lights toward pale lemon.
const LMAX = 1.5, NLUT = 1024;
const RAMP = [[0, '#0a0500'], [0.1, '#2a1703'], [0.21, '#5a3709'], [0.33, '#8a5a12'], [0.46, '#c3922a'], [0.6, '#e3b43d'],
  [0.74, '#edbd48'], [0.88, '#f6d064'], [1.0, '#fce187'], [1.12, '#fff0b0'], [1.5, '#fffbe6']];

function buildMound(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 12;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s27a'), nB = L.makeNoise('s27b');

  // 1-D wander tables along the arc (indexed by U in px)
  const UT0 = -1400, UTN = 2800;
  const tab = (seed, s1, a1, s2, a2) => {
    const t = new Float32Array(UTN);
    for (let i = 0; i < UTN; i++) { const u = UT0 + i; t[i] = a1 * nA.n2(u / s1, seed * 3.7) + a2 * nB.n2(u / s2, seed * 1.9 + 40); }
    return t;
  };
  const uIdx = (U) => { const i = (U - UT0) | 0; return i < 0 ? 0 : i >= UTN ? UTN - 1 : i; };
  const scarps = SCARPS.map((s) => ({ ...s, tab: tab(s.seed, 70, 6, 17, 0.5) }));
  const grooves = GROOVES.map((q) => ({ ...q, tab: tab(q.seed + 20, 330, 9, 60, 1.6) }));
  const edgeTab = tab(77, 16, 1, 5, 0.6), lowTab = tab(91, 230, 2.6, 70, 1.1);

  // slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 3, ch = Math.ceil(RH / CS) + 3;
  const cDune = new Float32Array(cw * ch), cTint = new Float32Array(cw * ch), cBrush = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), d = Math.max(0, R - Math.hypot(ddx, ddy));
    const U = Math.atan2(ddx, ddy) * R, V = d + FS * Math.sqrt(d), k = j * cw + i;
    cDune[k] = 7 * nA.fbm(U / 300, V / 240, 3) + 1.0 * nB.fbm(U / 95 + 5, V / 85, 2);
    cTint[k] = nB.fbm(U / 380 - 9, V / 300 + 4, 3);
    cBrush[k] = nA.fbm(U / 420 + 77, V / 200 + 3, 2);
  }
  // broad relief of the dunes under the lamp, also on the coarse grid
  const cLow = new Float32Array(cw * ch);
  for (let j = 1; j < ch - 1; j++) for (let i = 1; i < cw - 1; i++) {
    const k = j * cw + i, sl = ((cDune[k + 1] - cDune[k - 1]) * LX + (cDune[k + cw] - cDune[k - cw]) * LY) / (2 * CS);
    cLow[k] = 0.08 * Math.tanh(1.1 * sl / 0.08);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── height field ──
  const Dd = new Float32Array(N), Hh = new Float32Array(N), Sm = new Float32Array(N), Th = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      Dd[k] = d;
      if (d < -12) continue;
      const dc = d > 0 ? d : 0, th = Math.atan2(ddx, ddy), U = th * R, V = dc + FS * Math.sqrt(dc), ui = uIdx(U);
      Th[k] = th;
      let h = bil(cDune, i, j), sm = 0, inScar = 0;
      for (const s of scarps) {
        const du = (U - s.u) / s.w;
        if (du > -1 && du < 1) {
          const t = V - (s.v + s.sag * du * du + s.tab[ui]);
          if (t > -17 && t < s.len * 5) {
            const edge = Math.pow(1 - du * du, 0.7), on = sstep(-16, 22, t), tp = t > 0 ? t : 0;
            h -= s.h * edge * on * Math.exp(-tp / s.len);                 // the scar: a sudden drop that heals downslope
            const tb = (t - s.len * 1.9) / (s.len * 0.7);
            h += s.h * 0.3 * edge * Math.exp(-tb * tb);                  // the toe where the slipped powder piled up
            const m = edge * on * Math.exp(-tp / (s.len * 1.5)); if (m > inScar) inScar = m;
          }
        }
      }
      for (const q of grooves) {
        if (U > q.u0 && U < q.u1) {
          const t = (V - (q.v + q.k * (U - q.u0) + q.tab[ui])) / q.w;
          if (t > -4 && t < 5) {
            const tap = sstep(q.u0, q.u0 + 170, U) * (1 - sstep(q.u1 - 230, q.u1, U)) * (1 - inScar);
            const t1 = (t - 1.8) / 0.75, t2 = (t + 1.7) / 0.6;
            h += q.depth * tap * (-Math.exp(-t * t) + 0.6 * Math.exp(-t1 * t1) + 0.22 * Math.exp(-t2 * t2));   // trough + pushed-up lips
            const s2 = tap * Math.exp(-t * t * 0.7); if (s2 > sm) sm = s2;
          }
        }
      }
      // powder grain: the scraped troughs are pressed smooth
      const g1 = nA.n2((X0 + i) / 2.4, y / 2.4), g2 = nB.n2(U / 7 + 3, V / 7), g3 = hash2(i, j) - 0.5;
      // faint parallel streaks left by whatever smoothed the heap, in patches
      const bw = bil(cBrush, i, j), brush = nB.n2(U / 120 + 11, (V + 0.03 * U * bw + 30 * bw) / 5.4) * (0.15 + 0.85 * sstep(-0.3, 0.3, bw)) * (1 - 0.85 * sstep(230, 470, dc));
      h += (1 - 0.65 * sm) * (0.36 * g1 + 0.3 * g2 + 0.34 * g3) + 0.62 * brush * (1 - inScar);
      Hh[k] = h; Sm[k] = sm;
    }
  }

  // ── crumbs of clumped powder (and a few dimples), splatted in surface coordinates → flattened toward the outline ──
  const crumb = (U, V, rad, hgt) => {
    const d = dOfV(V), rr = R - d, th = U / R, ct = Math.cos(th), st = Math.sin(th);
    const px = cx + rr * st - X0, py = cy - rr * ct - Y0;
    const sq = Math.min(3.2, 1 + FS / (2 * Math.sqrt(Math.max(d, 1)))), e = Math.ceil(rad) + 1;
    if (px < -e || px > RW + e || py < -e || py > RH + e) return;
    const i0 = Math.max(1, Math.floor(px - e)), i1 = Math.min(RW - 2, Math.ceil(px + e));
    const j0 = Math.max(1, Math.floor(py - e)), j1 = Math.min(RH - 2, Math.ceil(py + e));
    const ir = 1 / (rad * rad);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = i - px, dy = j - py, du = dx * ct + dy * st, dv = (-dx * st + dy * ct) * sq;
      const q = (du * du + dv * dv) * ir;
      if (q < 1) Hh[j * RW + i] += hgt * Math.sqrt(1 - q);
    }
  };
  const rc = L.rng('s27crumb');
  const cluster = (U, V, rad) => {
    const n = rc.int(2, 4);
    for (let b = 0; b < n; b++) { const r1 = rad * rc.range(0.5, 1); crumb(U + rc.range(-0.7, 0.7) * rad, V + rc.range(-0.6, 0.6) * rad, r1, r1 * rc.range(0.3, 0.45)); }
  };
  for (let n = 0; n < 12000; n++) {
    const U = rc.range(-1200, 1200), V = rc.range(2, 1020);
    const dens = 0.1 + 0.9 * sstep(-0.18, 0.42, nA.fbm(U / 170 + 31, V / 140 - 17, 3));   // 疏密不匀
    const roll = rc();
    if (rc() > dens) continue;
    if (roll < 0.95) crumb(U, V, rc.range(0.9, 1.9), rc.range(0.5, 1.1));
    else if (roll < 0.996) crumb(U, V, rc.range(2, 3.2), rc.range(0.9, 1.5));
    else cluster(U, V, rc.range(3.2, 5));
  }
  for (const s of scarps) {          // debris apron below each scar
    for (let n = 0; n < 110; n++) {
      const du = rc.range(-0.88, 0.88), U = s.u + du * s.w, t = s.len * (0.12 + 2.3 * Math.pow(rc(), 1.5));
      const V = s.v + s.sag * du * du + s.tab[uIdx(U)] + t, big = rc.chance(0.1) && t < s.len * 1.3;
      if (big) cluster(U, V, rc.range(3, 4.6)); else crumb(U, V, rc.range(1.1, 2.6), rc.range(0.6, 1.4));
    }
  }
  for (const q of grooves) {         // crumbs ploughed out along the lower lip of each scrape
    for (let U = q.u0 + 90; U < q.u1 - 130; U += rc.range(10, 44)) {
      const V = q.v + q.k * (U - q.u0) + q.tab[uIdx(U)] + q.w * (1.9 + 0.55 * rc.gauss());
      crumb(U, V, rc.range(1.1, 2.6) * (q.w > 8 ? 1 : 0.7), rc.range(0.8, 1.8));
    }
  }

  // ── light ──
  const ramp = L.makeRamp(RAMP.map(([t, c]) => [t / LMAX, c])), lut = new Float32Array(NLUT * 3);
  for (let i = 0; i < NLUT; i++) { const c = ramp(i / (NLUT - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const STEPS = [1.5, 3, 5, 8, 12, 17], SO = STEPS.map((s) => [Math.round(-LX * s), Math.round(-LY * s)]);
  const img = new ImageData(RW, RH), px = img.data, Lm = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, d = Dd[k];
      if (d < -12) continue;
      const th = Th[k], h0 = Hh[k], dc = d > 0 ? d : 0;
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      // the dusty outline band is lower in contrast than the focused slope below it
      const crisp = 0.45 + 0.55 * sstep(0, 30, dc);
      let rel = 0.46 * (hx * LX + hy * LY) * crisp; rel = 0.5 * Math.tanh(rel / 0.5);
      const low = bil(cLow, i, j);
      // short cast shadows: march toward the light
      let occ = 0;
      for (let s = 0; s < 6; s++) {
        const ii = i + SO[s][0], jj = j + SO[s][1];
        if (ii < 0 || jj < 0) break;
        const o = Hh[jj * RW + ii] - h0 - STEPS[s] * TAN;
        if (o > occ) occ = o;
      }
      const sh = (occ > 2.6 ? 0.8 : occ / 3.25) * crisp;
      // the heap: brightest on the crest under the lamp, sinking to ochre and shadow downslope and to both sides
      const side = sideLight(th);
      const depth = 0.27 + 0.73 * Math.exp(-Math.pow(dc / 380, 1.6));
      const macro = side * (depth + 0.14 * Math.exp(-dc / 14));
      const tint = bil(cTint, i, j);
      let lum = macro * (1 + 0.07 * tint) * (0.52 + 0.48 * (1 - sh)) * (1 + rel) * (1 + low) * (1 + 0.07 * Sm[k]);
      if (lum > 0.9) lum = 0.9 + 0.2 * Math.tanh((lum - 0.9) / 0.2);     // powder is matte: the lit crest rolls off softly, it never glares
      // single grains that catch the lamp
      const gl = hash2(i + 911, j + 577);
      if (gl > 0.988 - 0.012 * macro && rel > -0.06 && sh < 0.4) lum += (0.2 + 0.85 * hash2(i + 13, j + 7)) * (0.35 + 0.65 * macro);
      Lm[k] = lum;
      const li = (lum >= LMAX ? NLUT - 1 : (lum / LMAX * (NLUT - 1)) | 0) * 3;
      let cr = lut[li], cg = lut[li + 1], cb = lut[li + 2];
      if (tint > 0) { cg *= 1 - 0.07 * tint; cb *= 1 - 0.24 * tint; } else { cb += -22 * tint * (cb / 255 + 0.3); }
      // the outline dissolves grain by grain
      let al = 1;
      if (d < 12) {
        const ue = uIdx(th * R), cov = sstep(-7.5, 9.5, d + 3 * edgeTab[ue] + lowTab[ue]);
        const gn = 0.5 + 0.5 * nA.n2((X0 + i) / 1.9 + 70, y / 1.9);
        al = sstep(-0.15, 0.1, cov - (0.12 + 0.76 * gn));
      }
      const o = k * 4;
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = al * 255;
    }
  }
  const body = L.makeCanvas(RW, RH);
  body.getContext('2d').putImageData(img, 0, 0);
  return { body, X0, Y0, RW, RH, Lm, Dd };
}

function dotSprite(stops, n = 32) {
  const c = L.makeCanvas(n, n), g = c.getContext('2d');
  g.fillStyle = L.radial(g, n / 2, n / 2, 0, n / 2, stops); g.fillRect(0, 0, n, n);
  return c;
}

function buildBase(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const M = buildMound(env);
  const full = (g) => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  const spark = dotSprite([[0, 'rgba(255,252,232,1)'], [0.22, 'rgba(255,243,186,0.85)'], [0.55, 'rgba(255,220,120,0.2)'], [1, 'rgba(255,205,96,0)']]);
  const disc = dotSprite([[0, 'rgba(255,236,160,0.8)'], [0.7, 'rgba(255,232,150,0.9)'], [0.86, 'rgba(255,224,130,0.6)'], [1, 'rgba(255,214,110,0)']]);
  const lumAt = (x, y) => {
    const i = Math.round(x - M.X0), j = Math.round(y - M.Y0);
    return i < 0 || j < 0 || i >= M.RW || j >= M.RH ? null : j * M.RW + i;
  };

  const layer = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#030303'; full(g);
    // warm air around the lit crest: lifted dust scattering the lamp (kept low so the black stays black)
    const air = L.makeLayer(PAD, (c) => {
      c.fillStyle = L.radial(c, cx, cy, R - 6, R + 120, [[0, 'rgba(222,160,46,0.24)'], [0.08, 'rgba(176,116,28,0.11)'], [0.3, 'rgba(122,76,14,0.035)'], [1, 'rgba(90,50,8,0)']]); full(c);
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = L.linear(c, -PAD, 0, W + PAD, 0, [[0, 'rgba(0,0,0,0.25)'], [0.3, 'rgba(0,0,0,0.8)'], [0.47, 'rgba(0,0,0,1)'], [0.7, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0.25)']]); full(c);
    });
    g.drawImage(air, -PAD, -PAD);

    // the fringe of escaping powder: thickest right on the outline, wisps reaching further out on the shoulders
    const r = L.rng('s27halo'), nz = L.makeNoise('s27wisp'), span = a.span(PAD + 30);
    const cols = ['#fde48c', '#eebd48', '#dcaa38', '#bb8722', '#8a5a12'];
    for (let n = 0; n < 76000; n++) {
      const th = r.range(-span, span);
      const wisp = L.clamp(0.42 + 1.25 * nz.fbm(th * 7.5 + 2, 0.3, 3));
      const calm = 1 - 0.66 * Math.exp(-(th * th) / 0.05);      // quieter over the crest, under the tagline
      const u = r(), e = -Math.log(1 - r() * 0.999);
      const dr = (u < 0.42 ? e * 6 : u < 0.88 ? e * (12 + 46 * wisp * wisp) * calm : e * (38 + 100 * wisp) * calm) - 4;
      const light = sideLight(th), fade = Math.exp(-Math.max(0, dr) / 55);
      const p = a.pt(th, dr), near = dr < 14;
      const sz = near ? r.range(1.0, 2.3) : r.range(0.8, 2.0);
      const c = near ? r.int(0, 2) : r.int(1, 4);
      g.globalAlpha = (0.25 + 0.75 * r()) * (0.3 + 0.7 * fade) * (0.3 + 0.7 * light) * (near ? 1 : 0.85);
      g.fillStyle = cols[c];
      g.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;

    g.drawImage(M.body, M.X0, M.Y0);

    // fixed pin-point sparkles, more of them where the lamp is strong
    const rs = L.rng('s27spark');
    g.globalCompositeOperation = 'lighter';
    // loose grains on and just off the outline catch the lamp against the black
    for (let n = 0; n < 1500; n++) {
      const th = rs.range(-span, span), e = -Math.log(1 - rs() * 0.999), big = rs(), al = rs();
      const calm = 1 - 0.6 * Math.exp(-(th * th) / 0.05);
      const dr = e * (5 + 14 * calm) - 7, p = a.pt(th, dr), light = sideLight(th);
      const s2 = (3 + 6.5 * Math.pow(big, 2.6)) * (dr > 8 ? 0.8 : 1);
      g.globalAlpha = (0.25 + 0.75 * al) * (0.2 + 0.8 * light) * Math.exp(-Math.max(0, dr) / 26);
      g.drawImage(spark, p.x - s2 / 2, p.y - s2 / 2, s2, s2);
    }
    for (let n = 0; n < 22000; n++) {
      const x = rs.range(-PAD, W + PAD), y = rs.range(M.Y0 + 4, H + PAD), k = lumAt(x, y), roll = rs(), big = rs();
      if (k === null || M.Dd[k] < 3 || M.Dd[k] > 380) continue;
      const lm = Math.min(1.1, M.Lm[k]);
      if (roll > lm * lm * 0.8 * (0.2 + 0.8 * sstep(-0.3, 0.35, nz.fbm(x / 130, y / 90, 2)))) continue;
      const s = 3.4 + 8 * Math.pow(big, 3.4);
      g.globalAlpha = rs.range(0.3, 0.95) * Math.min(1, 0.35 + lm * 0.7);
      g.drawImage(spark, x - s / 2, y - s / 2, s, s);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });

  // ── depth of field: the lens holds the slope just under the crest; the outline, the foot of the frame and both sides go soft ──
  const lg = layer.getContext('2d');
  const masked = (src, paint) => {
    const sg = src.getContext('2d');
    sg.save(); sg.setTransform(1, 0, 0, 1, PAD, PAD); sg.globalCompositeOperation = 'destination-in'; paint(sg); sg.restore();
    return src;
  };
  const soft1 = masked(L.blurred(layer, 2.2), (c) => { c.fillStyle = L.radial(c, cx, cy, R - 380, R - 230, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]); full(c); });
  const soft2 = masked(L.blurred(layer, 5.5), (c) => { c.fillStyle = L.radial(c, cx, cy, R - 600, R - 360, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]); full(c); });
  const softS = masked(L.blurred(layer, 3), (c) => { c.fillStyle = L.linear(c, -PAD, 0, W + PAD, 0, [[0, 'rgba(0,0,0,1)'], [0.24, 'rgba(0,0,0,0)'], [0.78, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); full(c); });
  lg.drawImage(softS, -PAD, -PAD); lg.drawImage(soft1, -PAD, -PAD); lg.drawImage(soft2, -PAD, -PAD);

  // out-of-focus grains near the lens open into soft discs
  const rb = L.rng('s27bokeh');
  lg.globalCompositeOperation = 'lighter';
  for (let n = 0; n < 900; n++) {
    const x = rb.range(-PAD, W + PAD), y = rb.range(a.crestY + 240, H + PAD), k = lumAt(x, y), roll = rb(), sz = rb();
    if (k === null || M.Dd[k] < 300) continue;
    const lm = Math.min(1, M.Lm[k]), blur = sstep(300, 560, M.Dd[k]);
    if (roll > lm * 1.1) continue;
    const s = 5 + 20 * blur * (0.4 + 0.6 * sz);
    lg.globalAlpha = rb.range(0.06, 0.2) * (1.15 - 0.6 * blur);
    lg.drawImage(disc, x - s / 2, y - s / 2, s, s);
  }
  // bloom: only the hot part of the powder, wide and soft → the crest glows and spills a little into the black
  const bw = Math.round(layer.width / 4), bh = Math.round(layer.height / 4), bl = L.makeCanvas(bw, bh), bg = bl.getContext('2d');
  bg.filter = 'brightness(0.64) contrast(2.5) blur(5px)'; bg.drawImage(layer, 0, 0, bw, bh); bg.filter = 'none';
  lg.globalCompositeOperation = 'screen'; lg.globalAlpha = 0.27;
  lg.imageSmoothingQuality = 'high';
  lg.drawImage(bl, -PAD, -PAD, layer.width, layer.height);
  lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;

  // candidates for the per-frame twinkle (frame coords of the layer)
  const rt = L.rng('s27twinkle'), tw = [];
  for (let n = 0; n < 16000 && tw.length < 2600; n++) {
    const x = rt.range(-PAD + 20, W + PAD - 20), y = rt.range(M.Y0 + 6, H + PAD - 10), k = lumAt(x, y), roll = rt(), big = rt(), kk = rt();
    if (k === null || M.Dd[k] < 2) continue;
    const lm = Math.min(1.15, M.Lm[k]), d = M.Dd[k];
    if (roll > lm * lm * 0.8) continue;
    const soft = sstep(300, 560, d);
    tw.push({ x, y, s: (4 + 10 * Math.pow(big, 3.2)) * (1 + 1.6 * soft), k: (0.45 + 0.55 * kk) * Math.min(1, 0.3 + lm * 0.75) * (1 - 0.55 * soft) });
  }
  return { layer, tw, spark };
}

/** dust drifting down through the dark: flecks, thick toward the heap and thinning upward, fewest and dimmest where the tagline sits */
function buildMotes(env) {
  const a = env.arc, r = L.rng('s27motes'), out = [];
  const inSafe = (x, y) => x > 590 && x < 1330 && y > a.crestY - 300 && y < a.crestY + 4;
  for (let guard = 0; out.length < 240 && guard < 30000; guard++) {
    const x = r.range(-30, W + 30), dr = 10 + Math.pow(r(), 3.0) * 700, y = a.yAt(L.clamp(x, 0, W)) - dr;
    const size = r(), alpha = r(), speed = r(), drift = r(), kind = r(), warm = r(), keep = r();
    if (y < -10) continue;
    const safe = inSafe(x, y);
    if (safe && keep > 0.12) continue;
    const near = Math.exp(-dr / 210), fast = !safe && kind < 0.3;
    const vy = fast ? 2.4 + 4.6 * speed : 0.4 + 1.2 * speed, vx = vy * (drift - 0.4) * 0.6;
    out.push({
      x, y, vx, vy, soft: 0,
      sz: (safe ? 1.2 : 1.8 + 4.2 * size * size * size) * (fast ? 0.8 : 1),
      len: fast ? 1.5 + 2.2 * (kind / 0.3) : 1 + 2.4 * drift,
      al: (0.4 + 0.6 * alpha) * (0.5 + 0.5 * near) * (safe ? 0.4 : 1),
      col: warm < 0.1 ? '#fbe08a' : warm < 0.5 ? '#efbf4c' : warm < 0.82 ? '#dba636' : '#b98222',
    });
  }
  // a few grains close to the lens, far out of focus
  for (let guard = 0, n = 0; n < 12 && guard < 400; guard++) {
    const x = r.range(40, W - 40), y = a.yAt(x) - r.range(40, 330), rad = r.range(3.5, 8), al = r.range(0.1, 0.22), vy = r.range(0.8, 2);
    if (inSafe(x, y) || y < 30) continue;
    out.push({ x, y, vx: vy * 0.2, vy, soft: rad, al }); n++;
  }
  return out;
}

export default {
  name: '松花粉',
  tone: 'light',
  init(env) {
    const base = buildBase(env);
    S = { base: base.layer, tw: base.tw, spark: base.spark, motes: buildMotes(env),
      disc: dotSprite([[0, 'rgba(240,190,76,0.9)'], [0.62, 'rgba(236,184,70,0.85)'], [0.84, 'rgba(226,170,56,0.45)'], [1, 'rgba(214,156,44,0)']], 48) };
  },
  draw(ctx, env, p) {
    const frames = env.frames || 8, fr = p * (frames - 1), fi = env.frame !== undefined ? env.frame : Math.round(fr);
    // the heap slides a little under the lamp; a breath of push-in (dy splits the small error zoom puts on the arc's far ends)
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.012, p), dy = 1.3 * p;
    L.blit(ctx, env, S.base, { rot, zoom, dy });
    // grains flash on and off as the light rakes them: re-seeded by frame number
    L.cam(ctx, env, { rot, zoom, dy }, () => {
      ctx.globalCompositeOperation = 'lighter';
      const tw = S.tw;
      for (let i = 0; i < tw.length; i++) {
        const v = hash2(i * 31 + 7, fi * 131 + 3);
        if (v > 0.3) continue;
        const q = tw[i];
        ctx.globalAlpha = q.k * (0.45 + 0.55 * hash2(i + 5, fi + 900));
        ctx.drawImage(S.spark, q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
      }
    });
    // dust sinking through the dark: each fleck is smeared a little along its fall
    ctx.save();
    ctx.lineCap = 'round';
    const mid = (frames - 1) / 2;
    for (const m of S.motes) {
      const x = m.x + m.vx * (fr - mid), y = m.y + m.vy * (fr - mid);
      ctx.globalAlpha = m.al;
      if (m.soft) { ctx.drawImage(S.disc, x - m.soft, y - m.soft, m.soft * 2, m.soft * 2); continue; }
      const sp = Math.hypot(m.vx, m.vy), tx = x - (m.vx / sp) * m.len * (m.len > 2.6 ? sp * 0.45 : 1), ty = y - (m.vy / sp) * m.len * (m.len > 2.6 ? sp * 0.45 : 1);
      ctx.strokeStyle = m.col; ctx.lineWidth = m.sz;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.restore();
    L.vignette(ctx, { strength: 0.3 });
  },
};
