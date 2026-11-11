// s10 — 徽派马头墙 · 特写. Pushed in on the stepped heads of Huizhou gable walls against a flat peacock-blue sky:
// a 三叠 wall in focus, the tiers of a second wall just behind it out of focus. Seven tiers in frame, mirrored about
// the crest; the blunt up-swept 鹊尾 of every tier touches the shared arc (tips every ~300 px), so the dark tile caps
// climb the curve like saw-teeth, and below them there is nothing but lime plaster, rain-blackened under the eaves.
//
// How it is made: nothing is painted with gradients. init() builds a HEIGHT FIELD of each wall (standing ridge tiles,
// rows of 盖瓦 with their round 勾头, troughs and 滴水, the corbelled 拔檐 / 垛头, trowelled plaster, a flaked wound
// down to the grey brick) plus an albedo map (soot runs, mildew, algae, lichen, moss), then lights it per pixel like a
// photograph: one sun from the upper left with real cast shadows (the scalloped eave shadow on the wall falls out of
// the height field), blue sky fill, cavity occlusion, a soft sheen on the fired clay. Depth of field is blurred copies
// blended in by distance from the crest. draw() only blits two layers.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 64;                    // the move is small (rot ≤ 0.008 rad, zoom ≤ 1.018 → < 25 px of travel)
const TOP0 = 512;                  // nothing but sky lives above this frame row, so the plates start here
const LW = W + PAD * 2, LHL = H + PAD - TOP0;   // 2048 × 632
const BOTTOM = H + PAD + 8;
let S = null;

const COL = { sky: '#14a8c9', shade: '#1b6a90' };

// anatomy of a wall cap at scale 1 (px): tail overshoot / corbel overhang / tail lift / ridge, tile-slope, 拔檐 heights
const HORN = 58, OV = 26, LIFT = 30, RH = 15, TH = 36, EH = 13, CAPH = RH + TH + EH, STEP = 11;
const PITCH = 29, CWH = 7.6;       // one 盖瓦 + one trough; half-width of a 盖瓦

// the sun: upper left, a little in front of the wall
const LX = -0.4514, LY = -0.7021, LZ = 0.5517;            // unit vector toward the light
const SDX = -0.5407, SDY = -0.8412, SRISE = 0.661;        // its trace on the wall plane, and how fast a ray climbs along it
const HX = -0.2562, HY = -0.3985, HZ = 0.8807;            // half vector for the sheen (viewer straight on)

const nzW = L.makeNoise('s10wob');
const hash1 = (n) => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
const hash2 = (a, b) => hash1(Math.imul(a, 73856093) ^ Math.imul(b, 19349663));
const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

function lowLayer(draw) {
  const c = L.makeCanvas(LW, LHL); const g = c.getContext('2d');
  g.translate(PAD, -TOP0);
  if (draw) draw(g, c);
  return c;
}

// ───────────────────────── geometry ─────────────────────────
/** symmetric gable (三叠 / 五叠): offs = half-distances of the tips from the centre line, ascending */
function symTiers(a, k, offs) {
  const y = (o) => a.yAt(a.cx + o) + LIFT * k;
  const c = { xa: a.cx - offs[0] + HORN * k, xb: a.cx + offs[0] - HORN * k, y: y(offs[0]), tipL: true, tipR: true };
  c.bL = c.xa + OV * k; c.bR = c.xb - OV * k;
  const left = [], right = [];
  let pl = c, pr = c;
  for (let i = 1; i < offs.length; i++) {
    const tl = { xa: a.cx - offs[i] + HORN * k, xb: pl.bL, y: y(-offs[i]), tipL: true, tipR: false };
    tl.bL = tl.xa + OV * k; tl.bR = tl.xb; left.unshift(tl); pl = tl;
    const tr = { xa: pr.bR, xb: a.cx + offs[i] - HORN * k, y: y(offs[i]), tipL: false, tipR: true };
    tr.bL = tr.xa; tr.bR = tr.xb - OV * k; right.push(tr); pr = tr;
  }
  return [...left, c, ...right];
}
/** one-sided run of tiers stepping down away from the centre. tips = signed offsets (inner → outer), inner = hidden inner end */
function sideTiers(a, k, tips, inner) {
  const dir = Math.sign(tips[0]);
  const out = [];
  let prev = null;
  for (const o of tips) {
    const tipX = a.cx + o, y = a.yAt(tipX) + LIFT * k;
    let t;
    if (dir < 0) { t = { xa: tipX + HORN * k, xb: prev ? prev.bL : a.cx + inner, y, tipL: true, tipR: false }; t.bL = t.xa + OV * k; t.bR = t.xb; out.unshift(t); }
    else { t = { xa: prev ? prev.bR : a.cx + inner, xb: tipX - HORN * k, y, tipL: false, tipR: true }; t.bL = t.xa; t.bR = t.xb - OV * k; out.push(t); }
    prev = t;
  }
  return out;
}
/** the plastered wall under one run of tiers, with the stepped 垛头 corbels at every free end */
function bodyPath(g, tiers, k) {
  const first = tiers[0], last = tiers[tiers.length - 1];
  g.beginPath();
  g.moveTo(first.bL, BOTTOM);
  for (const t of tiers) {
    const yt = t.y + (RH + TH - 3) * k, b = t.y + CAPH * k, o = OV * k, s = STEP * k;
    if (t.tipL) {
      g.lineTo(t.bL, b + 2 * s); g.lineTo(t.bL - o * 0.31, b + 2 * s); g.lineTo(t.bL - o * 0.31, b + s);
      g.lineTo(t.bL - o * 0.62, b + s); g.lineTo(t.bL - o * 0.62, b); g.lineTo(t.bL - o * 0.93, b); g.lineTo(t.bL - o * 0.93, yt);
    } else g.lineTo(t.bL, yt);
    if (t.tipR) {
      g.lineTo(t.bR + o * 0.93, yt); g.lineTo(t.bR + o * 0.93, b); g.lineTo(t.bR + o * 0.62, b); g.lineTo(t.bR + o * 0.62, b + s);
      g.lineTo(t.bR + o * 0.31, b + s); g.lineTo(t.bR + o * 0.31, b + 2 * s); g.lineTo(t.bR, b + 2 * s);
    } else g.lineTo(t.bR, yt);
  }
  g.lineTo(last.bR, BOTTOM);
  g.closePath();
}
/** 鹊尾 座头: the ridge sweeps up and out into a thick, blunt magpie tail. (xe, y) = end of the cap at ridge-top level;
 *  the upper corner of the blunt end is the point that sits on the arc. j ∈ [-1, 1] makes every tail a little different */
function hornPath(g, xe, y, k, dir, j = 0) {
  const X = (u) => xe + dir * u * k, Y = (v) => y + v * k;
  const b = 2.6 * j;
  g.beginPath();
  g.moveTo(X(-54), Y(-0.5));
  g.bezierCurveTo(X(-20), Y(-0.5), X(21 + 3 * j), Y(-4.5 - j), X(HORN), Y(-LIFT));          // its back
  g.lineTo(X(HORN + 4.5), Y(-LIFT + 8.5));                                                  // the blunt end
  g.bezierCurveTo(X(41), Y(-3 + b), X(25), Y(RH + 3 + b), X(4), Y(RH + 11));                // its belly
  g.lineTo(X(4), Y(RH + TH * 0.52));
  g.lineTo(X(-7), Y(RH + TH * 0.52));
  g.lineTo(X(-7), Y(RH + 1));
  g.lineTo(X(-54), Y(RH + 1));
  g.closePath();
}
/** every tile in a tier is its own object: position, width, firing tone, how far it has slipped, lichen, moss */
function dressTier(t, k, r) {
  const len = (t.xb - t.xa) / k;
  const n = Math.max(2, Math.round((len - 2 * CWH) / PITCH));
  t.k = k; t.len = len; t.n = n; t.pitch = (len - 2 * CWH) / n;
  t.ph = r.range(0, 90); t.sag = r.range(0.6, 2.6); t.si = r.int(1, 9999); t.hj = [r.range(-1, 1), r.range(-1, 1)];
  const f = () => new Float32Array(n + 1);
  t.c = f(); t.hw = f(); t.tone = f(); t.e = f(); t.lapL = f(); t.lapP = f(); t.lich = f();
  t.trTone = f(); t.trL = f(); t.trP = f(); t.drip = f(); t.moss = f();
  for (let i = 0; i <= n; i++) {
    t.c[i] = CWH + i * t.pitch + (i > 0 && i < n ? r.range(-1.8, 1.8) : 0);
    t.hw[i] = CWH * r.range(0.9, 1.07);
    let tone = r.range(-0.16, 0.12);
    if (r.chance(0.09)) tone += r.range(0.3, 0.7);            // a tile replaced a generation later: paler clay
    t.tone[i] = tone;
    let e = r.range(-1.8, 2);
    if (r.chance(0.09)) e += r.range(3, 6.5);                 // one has slipped down its bed
    else if (r.chance(0.08)) e -= r.range(4, 10);             // one has lost its end
    t.e[i] = e;
    t.lapL[i] = r.range(10.5, 13.5); t.lapP[i] = r.range(0, 12);
    const cl = 0.5 + 0.5 * nzW.n2(i / 2.7 + t.ph, t.si * 0.37);   // lichen comes in colonies, not tile by tile
    t.lich[i] = Math.pow(r(), 1.3) * L.clamp(0.1 + 1.25 * cl * cl);
    t.trTone[i] = r.range(-0.15, 0.1); t.trL[i] = r.range(11, 14.5); t.trP[i] = r.range(0, 12);
    t.drip[i] = r.range(7.5, 11); t.moss[i] = r.chance(0.42) ? r.range(0.5, 1.5) : 0;
  }
}

// ───────────────────────── shared noise plates (half resolution, frame coordinates) ─────────────────────────
function buildAux() {
  const aw = LW >> 1, ah = LHL >> 1, n = aw * ah;
  const nz = L.makeNoise('s10aux');
  const relief = new Float32Array(n), mottle = new Float32Array(n), mid = new Float32Array(n);
  for (let j = 0, q = 0; j < ah; j++) {
    const y = j * 2 + TOP0;
    for (let i = 0; i < aw; i++, q++) {
      const x = i * 2 - PAD;
      relief[q] = 1.15 * nz.fbm(x / 74, y / 40, 3) + 0.42 * nz.fbm(x / 23 + 9, y / 15 - 4, 2) + 0.16 * nz.fbm(x / 8 + 50, y / 8, 2);   // trowel drag, hand, grit
      mottle[q] = 1 - 0.06 * (0.5 + 0.5 * nz.fbm(x / 340 + 7, y / 260, 2));                 // slow damp mottling
      mid[q] = nz.fbm(x / 10.5 - 20, y / 10.5 + 33, 2);                                     // lichen / grit / moss
    }
  }
  return { aw, ah, relief, mottle, mid };
}

// ───────────────────────── weather: soot runs, mildew, algae (albedo map at half resolution) ─────────────────────────
function stainMap(A, groups, k, seed, strength = 1) {
  const { aw, ah } = A, n = aw * ah, ik = 1 / k;
  const nz = L.makeNoise(seed + '-st');
  const top = new Float32Array(aw).fill(1e9), wet = new Float32Array(aw), len = new Float32Array(aw), tong = new Float32Array(aw);
  for (const tiers of groups) for (const t of tiers) {
    const xl = t.tipL ? t.bL - OV * k : t.bL, xr = t.tipR ? t.bR + OV * k : t.bR;
    const i0 = Math.max(0, Math.floor((xl + PAD) / 2)), i1 = Math.min(aw - 1, Math.ceil((xr + PAD) / 2));
    const yb = t.y + (RH + TH + 5) * k;      // grime starts on the 拔檐, right under the tile ends
    for (let i = i0; i <= i1; i++) top[i] = top[i] > 1e8 ? yb : Math.max(top[i], yb);
  }
  // some stretches of wall stay clean, others are badly marked
  for (let i = 0; i < aw; i++) { const x = (i * 2 - PAD) * ik, w = 0.3 + 1.45 * nz.fbm(x / 230, 3.1, 3); wet[i] = w < 0 ? 0 : w > 1 ? 1 : w; }
  // water sheds hardest off the free end of every tier, under the 垛头
  for (const tiers of groups) for (const t of tiers) for (const dir of [-1, 1]) {
    if (dir < 0 ? !t.tipL : !t.tipR) continue;
    const be = dir < 0 ? t.bL : t.bR, sg = 34 * k;
    for (let i = Math.max(0, Math.floor((be - 100 * k + PAD) / 2)); i <= Math.min(aw - 1, Math.ceil((be + 100 * k + PAD) / 2)); i++) {
      const dd = (i * 2 - PAD - be - dir * -16 * k) / sg;
      wet[i] = Math.min(1, wet[i] + 0.7 * Math.exp(-dd * dd));
    }
  }
  // the runs: a few broad black tongues, many thin tears between them
  for (let i = 0; i < aw; i++) {
    const x = (i * 2 - PAD) * ik;
    const broad = Math.pow(nz.n2(x / 31, 11.3) * 0.5 + 0.5, 2.4);
    const fine = Math.pow(nz.n2(x / 8.5, 4.4) * 0.5 + 0.5, 1.6) * (0.35 + 0.65 * (nz.n2(x / 60, 5.7) * 0.5 + 0.5));
    const f = Math.min(1, 0.95 * broad + 0.42 * fine);
    tong[i] = broad;
    len[i] = (22 + Math.pow(wet[i], 1.3) * (46 + 500 * f)) * k;
  }
  const SA = new Float32Array(n), SR = new Float32Array(n), SG = new Float32Array(n), SB = new Float32Array(n);
  for (let j = 0, q = 0; j < ah; j++) {
    const y = j * 2 + TOP0, ys = y * ik;
    for (let i = 0; i < aw; i++, q++) {
      const u = y - top[i];
      if (u < -8 * k) continue;
      const x = (i * 2 - PAD) * ik, uu = u < 0 ? 0 : u, w = wet[i];
      const fib = 0.64 + 0.36 * nz.n2(x / 5.4, ys / 190);                                  // the runs are combed, not flat
      const band = Math.exp(-uu / ((15 + 46 * w) * k)) * (0.32 + 0.68 * w);                // soot right under the eave
      const fg = uu < len[i] ? Math.pow(1 - uu / len[i], 1.2) * (0.24 + 0.76 * w) * (0.72 + 0.5 * tong[i]) : 0;   // tongues running down
      const cl = nz.fbm(x / 270 + 9.1, ys / 210 - 3.3, 3);                                  // a few big clouds of mildew
      const m = sstep(0.06, 0.5, cl + 0.26 * Math.exp(-uu / (300 * k)) - 0.2);
      const sp = nz.fbm(x / 6, ys / 7, 2) * 0.5 + 0.5;
      const tl = nz.fbm(x / 230 + 40, ys / 170 + 11, 2), e = (tl - 0.15) / 0.022;           // a tide line where damp dried
      let a = ((band * 0.98 + fg * 0.74) * fib + m * (0.05 + 0.36 * sp * sp) + Math.exp(-e * e) * 0.09) * strength;
      if (a > 1) a = 1;
      const t = Math.pow(a, 0.8);
      let R = 0.5 + (0.13 - 0.5) * t, G = 0.545 + (0.155 - 0.545) * t, B = 0.55 + (0.18 - 0.55) * t;
      const gz = cl * 0.6 + sp * 0.5 - 0.24;                                                // green algae where it stays damp
      if (gz > 0) { const m2 = Math.min(0.55, gz * 1.5) * Math.exp(-uu / (240 * k)); R += (0.33 - R) * m2; G += (0.43 - G) * m2; B += (0.25 - B) * m2; }
      SA[q] = Math.min(1, Math.pow(a, 0.9) * 0.96); SR[q] = R; SG[q] = G; SB[q] = B;
    }
  }
  return { SA, SR, SG, SB, wet, len };
}

// ───────────────────────── one wall: height field + albedo → lit photograph ─────────────────────────
function renderWall(A, spec) {
  const { groups, k, seed, res, patches = [], cracks = [], strength = 1 } = spec;
  const cw = Math.round(LW * res), ch = Math.round(LHL * res), N = cw * ch, inv = 1 / res, full = res === 1;
  const tiers = groups.flat();
  const r = L.rng(seed);
  for (const t of tiers) dressTier(t, k, r);
  const st = stainMap(A, groups, k, seed, strength);
  const { aw, relief, mottle, mid } = A;

  // silhouettes and wounds, rasterised (anti-aliased) by the canvas: R/G/B are independent masks
  const mk = () => {
    const c = L.makeCanvas(cw, ch), g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    g.setTransform(res, 0, 0, res, PAD * res, -TOP0 * res);
    g.globalCompositeOperation = 'lighter';
    return g;
  };
  const horns = (g) => { for (const t of tiers) { if (t.tipL) { hornPath(g, t.xa, t.y, k, -1, t.hj[0]); g.fill(); } if (t.tipR) { hornPath(g, t.xb, t.y, k, 1, t.hj[1]); g.fill(); } } };
  const g1 = mk();
  g1.fillStyle = '#ff0000'; for (const grp of groups) { bodyPath(g1, grp, k); g1.fill(); }
  g1.fillStyle = '#00ff00'; horns(g1);
  g1.filter = `blur(${(4.2 * k * res).toFixed(2)}px)`; g1.fillStyle = '#0000ff'; horns(g1); g1.filter = 'none';
  const m1 = g1.getImageData(0, 0, cw, ch).data;
  let m2 = null;
  if (patches.length || cracks.length) {
    const g2 = mk();
    g2.filter = `blur(${(0.9 * res).toFixed(2)}px)`;
    for (const [px, py, rad] of patches) {
      const n = 13, a0 = r.range(0, L.TAU), ax = r.range(1.1, 1.4), ay = r.range(0.66, 0.9), outer = [], inner = [];
      for (let i = 0; i < n; i++) {
        const ang = a0 + ((i + r.range(-0.3, 0.3)) / n) * L.TAU, rr = rad * r.range(0.62, 1.1), ri = rr * r.range(0.3, 0.92);
        outer.push([px + Math.cos(ang) * rr * ax, py + Math.sin(ang) * rr * ay]);
        inner.push([px + rad * 0.06 + Math.cos(ang) * ri * ax, py + rad * 0.05 + Math.sin(ang) * ri * ay]);
      }
      const sd = r.int(1, 9999);
      g2.fillStyle = '#ff0000'; L.roughPoly(g2, outer, { rough: Math.min(6, rad * 0.07), seed: sd, step: 8 }); g2.fill();
      g2.fillStyle = '#00ff00'; L.roughPoly(g2, inner, { rough: Math.min(5, rad * 0.06), seed: sd + 1, step: 8 }); g2.fill();
      for (let c = 0, m = rad > 50 ? 3 : 1; c < m; c++) {   // crumbs broken off beside it
        const ang = r.range(0, L.TAU), dd = rad * r.range(1.25, 1.9), cr = rad * r.range(0.07, 0.17), pts = [];
        for (let i = 0; i < 7; i++) { const a2 = (i / 7) * L.TAU; pts.push([px + Math.cos(ang) * dd * 1.25 + Math.cos(a2) * cr * r.range(0.7, 1.3), py + Math.sin(ang) * dd * 0.7 + Math.sin(a2) * cr * r.range(0.6, 1.1)]); }
        g2.fillStyle = '#ff0000'; L.roughPoly(g2, pts, { rough: 1.5, seed: sd + 5 + c, step: 5 }); g2.fill();
      }
    }
    g2.filter = 'none';
    g2.strokeStyle = '#0000ff'; g2.lineCap = 'round'; g2.lineJoin = 'round';
    for (const [x0, y0, steps, dir0] of cracks) {
      let x = x0, y = y0, dir = dir0;
      for (let s = 0; s < steps; s++) {
        dir = L.clamp(dir + r.range(-0.5, 0.5), 0.85, 2.3);
        const dd = r.range(8, 22), x1 = x + Math.cos(dir) * dd, y1 = y + Math.sin(dir) * dd;
        g2.lineWidth = L.lerp(2.1, 0.7, s / steps); g2.beginPath(); g2.moveTo(x, y); g2.lineTo(x1, y1); g2.stroke();
        if (r.chance(0.14)) { g2.lineWidth = 0.8; g2.beginPath(); g2.moveTo(x, y); g2.lineTo(x + r.range(-26, 26), y + r.range(8, 30)); g2.stroke(); }
        x = x1; y = y1;
      }
    }
    m2 = g2.getImageData(0, 0, cw, ch).data;
  }

  const Hm = new Float32Array(N), Al = new Float32Array(N), AR = new Float32Array(N), AG = new Float32Array(N), AB = new Float32Array(N);
  const M = new Uint8Array(N), near = new Uint8Array(N);

  // ── 1a. plaster: lime wash over a gritty base coat over grey brick ──
  for (let j = 0, q = 0; j < ch; j++) {
    const y = j * inv + TOP0;
    for (let i = 0; i < cw; i++, q++) {
      const o = q << 2, bm = m1[o];
      if (bm < 2) continue;
      const x = i * inv - PAD;
      let rel, mot, md, sa, sr, sg, sb;
      if (full) {
        const ia = i >> 1, ja = j >> 1, ib = (i & 1) && ia + 1 < aw ? ia + 1 : ia, jb = (j & 1) && ja + 1 < A.ah ? ja + 1 : ja;
        const q00 = ja * aw + ia, q10 = ja * aw + ib, q01 = jb * aw + ia, q11 = jb * aw + ib;
        rel = (relief[q00] + relief[q10] + relief[q01] + relief[q11]) * 0.25;
        md = (mid[q00] + mid[q10] + mid[q01] + mid[q11]) * 0.25;
        sa = (st.SA[q00] + st.SA[q10] + st.SA[q01] + st.SA[q11]) * 0.25;
        mot = mottle[q00]; sr = st.SR[q00]; sg = st.SG[q00]; sb = st.SB[q00];
      } else { rel = relief[q]; md = mid[q]; sa = st.SA[q]; mot = mottle[q]; sr = st.SR[q]; sg = st.SG[q]; sb = st.SB[q]; }
      const gr = 1 + (hash2(i, j) - 0.5) * 0.035;
      let h = rel * 1.3, ar = 0.975 * mot * gr, ag = 0.966 * mot * gr, ab = 0.942 * mot * gr;
      if (sa > 0.003) { ar += (sr - ar) * sa; ag += (sg - ag) * sa; ab += (sb - ab) * sa; }
      if (m2) {
        const ring = m2[o] / 255, core = m2[o + 1] / 255, crk = m2[o + 2] / 255;
        if (ring > 0.01) {
          const gt = 0.86 + 0.22 * md + (gr - 1) * 3;                    // the coarse base coat
          let ur = 0.66 * gt, ug = 0.645 * gt, ub = 0.6 * gt, dh = -2.4 + 0.7 * md;
          if (core > 0.01) {
            const row = Math.floor(y / 23), off = (row & 1) * 39 + hash1(row + 77) * 16, cb = Math.floor((x + off) / 78);
            const fx = x + off - cb * 78, fy = y - row * 23;
            let jt = Math.max(1 - fx / 2.8, 1 - fy / 2.8); if (jt < 0) jt = 0;
            const tb = hash2(row, cb), b = (0.39 + 0.17 * (tb - 0.5) + 0.05 * md) * gr;
            const br = b * 0.94 + (tb > 0.88 ? 0.05 : 0), bg = b, bb = b * 1.05;
            const cr2 = br + (0.62 - br) * jt, cg2 = bg + (0.64 - bg) * jt, cb2 = bb + (0.62 - bb) * jt;
            ur += (cr2 - ur) * core; ug += (cg2 - ug) * core; ub += (cb2 - ub) * core;
            dh += (-5.4 - 1.5 * jt + 0.5 * md - dh) * core;
          }
          ar += (ur - ar) * ring; ag += (ug - ag) * ring; ab += (ub - ab) * ring;
          h += (dh - h) * ring;
        }
        if (crk > 0.01) { h -= 2.4 * crk; const dk = 1 - 0.5 * crk; ar *= dk; ag *= dk; ab *= dk; }
      }
      Hm[q] = h; AR[q] = ar; AG[q] = ag; AB[q] = ab; Al[q] = bm / 255; M[q] = 1;
    }
  }

  // ── 1b. 垛头: two plastered brick courses stand a little proud under each free end ──
  const rect = (x0, x1, y0, y1, fn) => {
    const i0 = Math.max(0, Math.ceil((Math.min(x0, x1) + PAD) * res)), i1 = Math.min(cw - 1, Math.floor((Math.max(x0, x1) + PAD) * res));
    const j0 = Math.max(0, Math.ceil((y0 - TOP0) * res)), j1 = Math.min(ch - 1, Math.floor((y1 - TOP0) * res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * cw + i);
  };
  for (const t of tiers) {
    const yB = t.y + CAPH * k;
    for (const dir of [-1, 1]) {
      if (dir < 0 ? !t.tipL : !t.tipR) continue;
      const be = dir < 0 ? t.bL : t.bR;
      for (let s = 0; s < 2; s++) rect(be + dir * OV * k, be - dir * 17 * k, yB + s * STEP * k, yB + (s + 1) * STEP * k - 0.01, (q) => { if (M[q] === 1) Hm[q] += (s === 0 ? 3.6 : 1.8) * k; });
    }
    // where cast shadows can fall
    rect(t.xa - 12 * k, t.xb + 60 * k, t.y - 2, yB + (2 * STEP + 44) * k, (q) => { near[q] = 1; });
  }

  // ── 1c. the caps ──
  const yE0 = RH + TH;
  for (const t of tiers) {
    const i0 = Math.max(0, Math.floor((t.xa - 1 + PAD) * res)), i1 = Math.min(cw - 1, Math.ceil((t.xb + 1 + PAD) * res));
    const j0 = Math.max(0, Math.floor((t.y - 5 * k - TOP0) * res)), j1 = Math.min(ch - 1, Math.ceil((t.y + (CAPH + 6) * k - TOP0) * res));
    const len = t.len, n = t.n;
    for (let i = i0; i <= i1; i++) {
      const x = i * inv - PAD, u = (x - t.xa) / k;
      if (u < -0.6 || u > len + 0.6) continue;
      const top = t.y + (t.sag * Math.sin(Math.PI * L.clamp(u / len)) + 1.0 * nzW.n2(x / 47, t.ph) + 0.45 * nzW.n2(x / 9, t.ph + 5)) * k;
      let covX = 1; if (u < 0.5) covX = u + 0.5; else if (u > len - 0.5) covX = len - u + 0.5;
      let ti = Math.round((u - CWH) / t.pitch); ti = ti < 0 ? 0 : ti > n ? n : ti;
      if (ti > 0 && Math.abs(u - t.c[ti - 1]) < Math.abs(u - t.c[ti])) ti--; else if (ti < n && Math.abs(u - t.c[ti + 1]) < Math.abs(u - t.c[ti])) ti++;
      const du = u - t.c[ti], hw = t.hw[ti], onCover = Math.abs(du) < hw;
      let tr = du > 0 ? ti : ti - 1; tr = tr < 0 ? 0 : tr > n - 1 ? n - 1 : tr;
      const xl = t.c[tr] + t.hw[tr], xr = t.c[tr + 1] - t.hw[tr + 1], tw = (xr - xl) / 2 + 1.2, dm = u - (xl + xr) / 2, pt = L.clamp(dm / tw, -1, 1);
      const eEnd = TH + t.e[ti], tnC = 1 + t.tone[ti], tnT = (1 + t.trTone[tr]) * 0.86;
      for (let j = j0; j <= j1; j++) {
        const y = j * inv + TOP0, v = (y - top) / k;
        if (v < -0.5) continue;
        const q = j * cw + i;
        const md = full ? mid[(j >> 1) * aw + (i >> 1)] : mid[q];
        const gr = 1 + (hash2(i, j) - 0.5) * 0.09;
        let h, mat, ar, ag, ab, cov = covX;
        if (v < RH) {
          // 脊: small tiles set on edge, leaning, on a bed of lime
          const qq = (u + v * 0.5) / 3.7, qi = Math.floor(qq), qf = qq - qi, th = hash1(qi * 31 + t.si);
          const rag = th * th * 1.9;
          if (v < rag - 0.5) continue;
          if (v < rag + 0.5) cov *= v - rag + 0.5;
          if (v > RH - 3.6 && md > -0.3) {
            h = 5.4; mat = 5; const lg = (0.5 + 0.14 * md + 0.1 * th) * gr; ar = lg * 0.95; ag = lg; ab = lg * 1.03;
          } else {
            h = 2.4 + 2.8 * Math.min(1, (v - rag + 0.5) / 2.6) + 1.2 * qf; mat = 4;
            const tn = (0.8 + 0.42 * th) * gr; ar = 0.16 * tn; ag = 0.185 * tn; ab = 0.215 * tn;
            const lw = md * 0.5 + 0.5 - 0.74; if (lw > 0) { const w = Math.min(0.6, lw * 5); ar += (0.5 - ar) * w; ag += (0.56 - ag) * w; ab += (0.5 - ab) * w; }
          }
        } else {
          const vs = v - RH;
          let done = false;
          if (onCover) {
            if (vs <= eEnd) {
              // 盖瓦: a half cylinder, each tile lapping the one below
              const p = du / hw, lq = (vs + t.lapP[ti]) / t.lapL[ti], lf = lq - Math.floor(lq);
              h = -4 + 26 * vs / TH + 6.4 * Math.sqrt(1 - p * p) + 1.6 * lf; mat = 2;
              const tn = tnC * (0.92 + 0.16 * hash2(ti + t.si, Math.floor(lq))) * gr;
              ar = 0.165 * tn; ag = 0.19 * tn; ab = 0.22 * tn;
              const lw = md * 0.5 + 0.5 - (0.86 - 0.4 * t.lich[ti]); if (lw > 0) { const w = Math.min(0.62, lw * 4.5); ar += (0.43 - ar) * w; ag += (0.49 - ag) * w; ab += (0.45 - ab) * w; }
              done = true;
            } else {
              // 勾头: the round end face, raised rim and a boss
              const dv = vs - eEnd, rr = Math.sqrt(du * du + dv * dv) / hw, edge = (1 - rr) * hw * k;
              if (edge > -0.5) {
                if (edge < 0.5) cov *= edge + 0.5;
                h = -4 + 26 * Math.min(eEnd, TH) / TH + 4.6 + 1.4 * sstep(0.56, 0.74, rr) + 0.9 * (1 - sstep(0.16, 0.38, rr)); mat = 2;
                const tn = tnC * 0.96 * gr; ar = 0.16 * tn; ag = 0.185 * tn; ab = 0.215 * tn;
                done = true;
              }
            }
          }
          if (!done || cov < 0.999) {
            const cov0 = done ? cov : covX;
            let d2 = false, h2, a2r, a2g, a2b, cov2 = covX, mat2 = 3;
            if (vs <= TH) {
              // 底瓦: the trough between two ridges (or the bare bed where a 盖瓦 has gone), where moss takes hold near the eave
              const lq = (vs + t.trP[tr]) / t.trL[tr], lf = lq - Math.floor(lq);
              h2 = -4 + 26 * vs / TH - 3.6 * (1 - pt * pt) + 1.4 * lf;
              const tn = tnT * (0.92 + 0.16 * hash2(tr + t.si + 500, Math.floor(lq))) * gr;
              a2r = 0.15 * tn; a2g = 0.172 * tn; a2b = 0.2 * tn;
              let mw = t.moss[tr] * sstep(TH - 22, TH - 6, vs) * (md + 0.3) * 2; mw = mw < 0 ? 0 : mw > 0.9 ? 0.9 : mw;
              if (mw > 0) { const lt = 0.75 + 0.5 * hash2(i >> 1, j >> 1); a2r += (0.19 * lt - a2r) * mw; a2g += (0.27 * lt - a2g) * mw; a2b += (0.09 * lt - a2b) * mw; h2 += 2 * mw * (0.6 + md); }
              d2 = true;
            } else {
              // 滴水: the pointed lip of the trough tile
              const lim = TH + t.drip[tr] * (1 - Math.pow(Math.abs(pt), 1.8)), edge = (lim - vs) * k;
              if (edge > -0.5) {
                if (edge < 0.5) cov2 *= edge + 0.5;
                h2 = 21.6 - 1.7 * pt * pt + 0.9 * (vs - TH) / t.drip[tr];
                const tn = tnT * 1.12 * gr; a2r = 0.16 * tn; a2g = 0.185 * tn; a2b = 0.215 * tn;
                d2 = true;
              }
            }
            if (d2 && (!done || cov0 < 0.5)) { h = h2; mat = mat2; ar = a2r; ag = a2g; ab = a2b; cov = done ? Math.max(cov0, cov2) : cov2; done = true; }
          }
          if (!done || cov < 0.999) {
            // 拔檐: two lime-washed brick courses stepping out under the tiles
            if (v < CAPH && M[q] === 1 && !near[q + 0] === false && Hm[q] < 4 * k) Hm[q] += (v < yE0 + EH * 0.5 ? 9 : 5) * k;
            if (!done) continue;
          }
        }
        if (cov >= 0.999 || M[q] === 0) { Hm[q] = h * k; M[q] = mat; AR[q] = ar; AG[q] = ag; AB[q] = ab; if (cov > Al[q]) Al[q] = cov; }
        else if (cov > 0.5) { Hm[q] = h * k; M[q] = mat; AR[q] = ar; AG[q] = ag; AB[q] = ab; }
      }
    }
  }

  // ── 1d. 座头: carved grey brick, rounded like a tail ──
  for (let q = 0; q < N; q++) {
    const o = q << 2, ga = m1[o + 1];
    if (ga < 3) continue;
    const a = ga / 255;
    if (a > 0.5 || M[q] === 0) {
      const i = q % cw, j = (q / cw) | 0, md = full ? mid[(j >> 1) * aw + (i >> 1)] : mid[q];
      const tn = (0.9 + 0.22 * md) * (1 + (hash2(i, j) - 0.5) * 0.08);
      M[q] = 6; Hm[q] = (0.5 + 8.5 * sstep(0.45, 0.95, m1[o + 2] / 255)) * k;
      AR[q] = 0.18 * tn; AG[q] = 0.205 * tn; AB[q] = 0.24 * tn;
      const lw = md * 0.5 + 0.5 - 0.72; if (lw > 0) { const w = Math.min(0.5, lw * 4); AR[q] += (0.48 - AR[q]) * w; AG[q] += (0.54 - AG[q]) * w; AB[q] += (0.49 - AB[q]) * w; }
      if (a > Al[q]) Al[q] = a;
    }
  }

  // ── 2. light it ──
  const out = new ImageData(cw, ch), d = out.data;
  const stepLen = full ? 1.4 : 2.1, NS = Math.ceil(46 * k / stepLen) + 2;
  const di = SDX * stepLen * res, dj = SDY * stepLen * res, dhh = SRISE * stepLen;
  for (let j = 0, q = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++, q++) {
      const a = Al[q];
      if (a <= 0) continue;
      const h = Hm[q], mat = M[q];
      const hl = i > 0 && M[q - 1] ? Hm[q - 1] : h, hr = i < cw - 1 && M[q + 1] ? Hm[q + 1] : h;
      const hu = j > 0 && M[q - cw] ? Hm[q - cw] : h, hd = j < ch - 1 && M[q + cw] ? Hm[q + cw] : h;
      let nx = -(hr - hl) * 0.5 * res, ny = -(hd - hu) * 0.5 * res;
      nx = nx < -2.6 ? -2.6 : nx > 2.6 ? 2.6 : nx; ny = ny < -2.6 ? -2.6 : ny > 2.6 ? 2.6 : ny;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= il; ny *= il;
      let ndl = nx * LX + ny * LY + il * LZ; if (ndl < 0) ndl = 0;
      // cavity occlusion from the four neighbours three samples away
      const c0 = i > 2 && M[q - 3] ? Hm[q - 3] : h, c1 = i < cw - 3 && M[q + 3] ? Hm[q + 3] : h;
      const c2 = j > 2 && M[q - 3 * cw] ? Hm[q - 3 * cw] : h, c3 = j < ch - 3 && M[q + 3 * cw] ? Hm[q + 3 * cw] : h;
      const cav = (c0 + c1 + c2 + c3) * 0.25 - h;
      let ao = 1 - 0.055 * (cav > 0 ? cav : 0); if (ao < 0.5) ao = 0.5;
      // cast shadow: march toward the sun through the height field
      let sh = 0, hit = 0;
      if (near[q]) {
        let fi = i + 0.5, fj = j + 0.5, rh = h + 0.35;
        for (let s = 1; s <= NS; s++) {
          fi += di; fj += dj; rh += dhh;
          if (fi < 0 || fj < 0) break;
          const qq = (fj | 0) * cw + (fi | 0);
          if (!M[qq]) continue;
          const ex = Hm[qq] - rh;
          if (ex > sh) { sh = ex; hit = s; }
        }
        sh = sh > 2.4 ? 1 : sh / 2.4;
      }
      const key = ndl * (1 - sh);
      const fill = (1 - 0.28 * ny) * ao * (1 - 0.34 * sh * (1 - hit / NS));
      let R = AR[q] * (0.6 * fill + 0.725 * key), G = AG[q] * (0.71 * fill + 0.526 * key), B = AB[q] * (0.82 * fill + 0.326 * key);
      if (mat >= 2 && mat !== 5) {
        const nh = nx * HX + ny * HY + il * HZ;
        if (nh > 0) { const n2 = nh * nh, n4 = n2 * n2, n8 = n4 * n4, sp = n8 * n8 * 0.2 * (1 - sh); R += 0.72 * sp; G += 0.85 * sp; B += 0.96 * sp; }
      }
      const o = q << 2;
      d[o] = R * 255; d[o + 1] = G * 255; d[o + 2] = B * 255; d[o + 3] = a * 255;
    }
  }
  const c = L.makeCanvas(cw, ch);
  c.getContext('2d').putImageData(out, 0, 0);
  return { canvas: c, st, tiers };
}

/** crisp detail the half-resolution weather map cannot carry: thin drip lines and pin-point mildew, only on the plaster */
function fineWeather(g, A, wall, k, seed) {
  const r = L.rng(seed), { st, tiers } = wall, { aw, ah } = A;
  g.save();
  g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round';
  for (const t of tiers) {
    const y0 = t.y + (CAPH + 1) * k, n = Math.round((t.bR - t.bL) / 9);
    for (let i = 0; i < n; i++) {
      const x = r.range(t.bL + 3, t.bR - 3), ia = Math.min(aw - 1, Math.max(0, Math.round((x + PAD) / 2)));
      const w = st.wet[ia];
      if (r() > w * 0.8) continue;
      const len = st.len[ia] * r.range(0.35, 1.05), a = r.range(0.1, 0.34) * (0.4 + 0.6 * w);
      const col = r.chance(0.18) ? '80,100,70' : '38,46,52';
      g.strokeStyle = L.linear(g, 0, y0, 0, y0 + len, [[0, `rgba(${col},${a})`], [0.35, `rgba(${col},${a * 0.7})`], [1, `rgba(${col},0)`]]);
      g.lineWidth = r.range(0.9, 2.8) * k;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + r.range(-1.6, 1.6), y0 + len); g.stroke();
    }
  }
  // mildew grows as pin-points inside the grey clouds
  for (let i = 0; i < 26000; i++) {
    const x = r.range(-PAD, W + PAD), y = r.range(TOP0, H + PAD);
    const sa = st.SA[Math.min(ah - 1, ((y - TOP0) / 2) | 0) * aw + Math.min(aw - 1, ((x + PAD) / 2) | 0)];
    if (r() > sa * 1.5 + 0.012) continue;
    g.globalAlpha = r.range(0.18, 0.6); g.fillStyle = r.chance(0.15) ? '#55683f' : '#2b3338';
    const rad = 0.5 + 1.7 * Math.pow(r(), 3);
    g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.7, 1.5), 0, 0, L.TAU); g.fill();
  }
  g.restore();
}

/** a lens: sharp at the crest, softer toward the sides and the foot of the frame */
function depthOfField(sharp, a) {
  const out = L.makeCanvas(LW, LHL), g = out.getContext('2d');
  const tmp = L.makeCanvas(LW, LHL), tg = tmp.getContext('2d');
  const fx = a.cx + PAD, fy = a.crestY + 100 - TOP0;
  const cut = (src, rx, ry, inner) => {
    tg.globalCompositeOperation = 'copy'; tg.drawImage(src, 0, 0);
    tg.globalCompositeOperation = 'destination-in';
    tg.save(); tg.translate(fx, fy); tg.scale(rx / 100, ry / 100);
    tg.fillStyle = L.radial(tg, 0, 0, 100 * inner, 100, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    tg.fillRect(-4000, -4000, 8000, 8000);
    tg.restore();
    g.drawImage(tmp, 0, 0);
  };
  g.drawImage(L.blurred(sharp, 4.6), 0, 0);
  cut(L.blurred(sharp, 1.7), 1180, 640, 0.6);
  cut(L.blurred(sharp, 0.5), 800, 470, 0.5);
  return out;
}

// ───────────────────────── scene ─────────────────────────
function build(env) {
  const a = env.arc, cx = a.cx;
  const A = buildAux();

  // the wall in focus: 三叠, tips at ±230 and ±780
  const front = renderWall(A, {
    groups: [symTiers(a, 1, [230, 780])], k: 1, seed: 's10F', res: 1,
    patches: [[cx - 420, 968, 88], [cx + 505, 905, 30]],
    cracks: [[cx + 205, 742, 13, 1.45], [cx - 96, 705, 9, 1.75], [cx - 560, 800, 8, 1.3]],
  });
  const frontL = lowLayer((g) => {
    g.drawImage(front.canvas, -PAD, TOP0);
    fineWeather(g, A, front, 1, 's10fw');
  });

  // the wall behind it: its tiers show over the shoulders of the first (tips ±500) and beyond its ends (±930, ±1150)
  const kR = 0.86;
  const rear = renderWall(A, {
    groups: [sideTiers(a, kR, [-500, -930, -1150], -100), sideTiers(a, kR, [500, 930, 1150], 100)], k: kR, seed: 's10R', res: 0.5, strength: 0.85,
  });
  const rearL = lowLayer((g) => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(rear.canvas, -PAD, TOP0, LW, LHL);
    // the front wall throws its shadow across the alley onto it (same sun: down and to the right)
    const s = L.makeCanvas(LW / 4, LHL / 4), sg = s.getContext('2d');
    sg.filter = 'blur(2.5px)'; sg.drawImage(frontL, 0, 0, s.width, s.height); sg.filter = 'none';
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = COL.shade; sg.fillRect(0, 0, s.width, s.height);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.42;
    g.drawImage(s, -PAD + 84, TOP0 + 118, LW, LHL);
    // a breath of air between the two walls
    g.globalAlpha = 1; g.fillStyle = 'rgba(96,196,224,0.12)'; g.fillRect(-PAD, TOP0, LW, LHL);
    g.globalCompositeOperation = 'source-over';
  });

  // one flat peacock-blue sky, a single value corner to corner (only grain)
  const sky = L.makeCanvas(W, H);
  {
    const g = sky.getContext('2d');
    g.fillStyle = COL.sky; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.03;
    g.drawImage(L.noiseTex(W, H, { seed: 's10sky', scale: 520, octaves: 3, res: 0.12 }), 0, 0);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.3;
    g.drawImage(L.grainTex(W, H, { seed: 's10sg', amount: 0.14 }), 0, 0);
  }
  return { sky, rear: L.blurred(rearL, 3.2), front: depthOfField(frontL, a) };
}

/** L.blit for the low plates (they start at frame row TOP0) */
function blitLow(ctx, env, layer, rot, zoom) {
  const a = env.arc;
  ctx.save();
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
  ctx.drawImage(layer, -PAD, TOP0);
  ctx.restore();
}

export default {
  name: '徽派马头墙',
  tone: 'light',
  init(env) {
    S = build(env);
    // the plates are rasterised lazily on first use: draw one throw-away frame so that cost lands in init, not in frame 0
    this.draw(L.makeCanvas(W, H).getContext('2d'), env, 0.5);
  },
  draw(ctx, env, p) {
    // the walls slide along the arc (rot about its centre keeps every tip on the curve) with a slight push-in;
    // the wall behind moves a little less → parallax
    const rot = L.lerp(-0.008, 0.008, p), z = L.lerp(1.0, 1.018, p);
    ctx.drawImage(S.sky, 0, 0);
    blitLow(ctx, env, S.rear, rot * 0.72, 1 + (z - 1) * 0.7);
    blitLow(ctx, env, S.front, rot, z);
  },
};
