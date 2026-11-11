// s22 — 香囊织锦. Flat-lay macro of an embroidered sachet (香囊) lying on indigo homespun.
// The arc is the sachet's rounded upper edge: a gold thread worked in blanket stitch (锁边) — one cord riding the edge,
// one countable leg per stitch — with the raw silk edge fraying out beyond it in a row of short loose threads.
// Below the arc: vermilion satin, padded with herbs so it shoulders up into the light, embroidered with large mugwort
// leaves (艾叶: pinnately deep-lobed, coarse teeth on every lobe). Each lobe is two fields of slanting satin stitch that
// meet on the vein; the half facing the light is worked orange → gold, the half turned away dark red → orange.
// Above the arc: plain-weave indigo cloth, every warp and weft float modelled, slubs and uneven dye included.
//
// Everything is one physical object, so it is baked into ONE layer in init() and slid along the arc as a whole:
//   · the cloth and the satin ground are shaded per pixel (height → light), the embroidery is drawn stitch by stitch;
//   · a second layer holds only the silk / gold highlights — in draw() a pool of light travels over it, so the sheen
//     runs from thread to thread while the picture slides.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 90;
const LW = W + PAD * 2, LH = H + PAD * 2;
const LX = -0.6, LY = -0.8;        // direction TO the key light in the picture plane (upper left)
const BETA = 0.62;                 // slant of the satin stitches off the vein (rad)
const PITCH = 5;                   // one strand of silk floss (px)
const LEGP = 17.5;                 // spacing of the blanket-stitch legs along the arc (px)
let S = null;

// palette (task sheet): 靛蓝 #1f3a6b · 朱红 #c8321f · 橘 #e8742a · 泥金 #e3b341 · 暗红线 #5a1410
const PAL_LIT = ['#c94c1c', '#dd6422', '#e8742a', '#ee882c', '#ec9c30', '#e3b341', '#f0c95e'];
const PAL_SHD = ['#5a1410', '#7c1d12', '#a23016', '#c44a1c', '#d9601f', '#e8742a'];
const GOLD = { dark: '#6e440e', low: '#b07c22', mid: '#e3b341', light: '#f7da7c', hot: '#fff5c8' };
const FRAY = ['#d8452a', '#e25a30', '#ee7a3c', '#f29a62', '#c8321f', '#b02a1a', '#e8742a', '#f6bb8e', '#e3b341'];

// where the leaves lie (frame coords of the leaf base, heading, length, bend of the midrib)
const LEAVES = [
  { seed: 'c', x: -170, y: 975, ang: L.deg(-21), len: 590, bend: 0.22, warm: 0.0 },
  { seed: 'b', x: 2075, y: 792, ang: L.deg(163), len: 800, bend: -0.2, warm: 0.0 },
  { seed: 'a', x: 418, y: 990, ang: L.deg(-12), len: 830, bend: 0.14, warm: 0.04 },
];

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
function hash2(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** a slow field sampled on a coarse grid (cell `cs` px) and read back bilinearly */
function coarse(w, h, cs, fn) {
  const cw = Math.ceil(w / cs) + 2, ch = Math.ceil(h / cs) + 2, a = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) a[j * cw + i] = fn(i * cs, j * cs);
  return { a, cw, cs };
}
function bil(f, x, y) {
  const fx = x / f.cs, fy = y / f.cs, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * f.cw + i0, a = f.a;
  return (a[k] + (a[k + 1] - a[k]) * tx) * (1 - ty) + (a[k + f.cw] + (a[k + f.cw + 1] - a[k + f.cw]) * tx) * ty;
}
const seg = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };

// the strip of the padded layer the sachet can occupy; `rc` makes a canvas of that size that is drawn in frame coords
function region(env) {
  const Y0 = Math.floor(env.arc.crestY) - 8;
  return { X0: -PAD, Y0, RW: LW, RH: H + PAD - Y0 };
}
function rc(G) { const c = L.makeCanvas(G.RW, G.RH), g = c.getContext('2d'); g.translate(-G.X0, -G.Y0); return { c, g }; }
function wipe(q) { q.g.save(); q.g.setTransform(1, 0, 0, 1, 0, 0); q.g.globalCompositeOperation = 'source-over'; q.g.clearRect(0, 0, q.c.width, q.c.height); q.g.restore(); }
function stamp(q, src, op = 'source-over', alpha = 1) {
  const g = q.g; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = op; g.globalAlpha = alpha; g.drawImage(src, 0, 0); g.restore();
}

// ───────────────────────── indigo homespun: plain weave, per pixel ─────────────────────────
function buildCloth(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = -PAD, RW = LW, RH = Math.min(LH, Math.ceil(a.yAt(X0)) + 18 - Y0);
  const nz = L.makeNoise('s22cloth');
  const WX = coarse(RW, RH, 20, (x, y) => nz.fbm(x / 90, y / 560, 2));          // every warp end wanders a little down its length …
  const WY = coarse(RW, RH, 20, (x, y) => nz.fbm(x / 560 + 9, y / 90 - 4, 2));  // … and every pick across its width
  const TN = coarse(RW, RH, 32, (x, y) => nz.fbm(x / 520 - 3, y / 620 + 7, 3)); // slow unevenness of the dye
  const SLW = coarse(RW, RH, 10, (x, y) => nz.n2(x / 22 + 50, y / 240));        // slubs: thick and thin places along a thread
  const SLF = coarse(RW, RH, 10, (x, y) => nz.n2(x / 240 - 20, y / 22 + 13));
  const img = new ImageData(RW, RH), d = img.data;
  const PW = 7.4, PF = 8.6;      // homespun is never square: warp ends sit closer than the picks
  const hid = R - 10;
  for (let j = 0; j < RH; j++) {
    const py = Y0 + j, dyc = cy - py;
    let h0 = RW, h1 = -1;      // columns hidden under the sachet on this row
    if (dyc < hid) { const hwid = Math.sqrt(hid * hid - dyc * dyc); h0 = Math.ceil(cx - hwid - X0); h1 = Math.floor(cx + hwid - X0); }
    for (let i = 0; i < RW; i++) {
      if (i >= h0 && i <= h1) { i = h1; continue; }
      const px = X0 + i;
      const u = (px + 2.1 * bil(WX, i, j)) / PW, v = (py + 2.1 * bil(WY, i, j)) / PF;
      const iu = Math.floor(u), jv = Math.floor(v), fu = u - iu - 0.5, fv = v - jv - 0.5;
      const warpTop = ((iu + jv) & 1) === 0;
      let ac, bc, th, kth;
      if (warpTop) { ac = fu; bc = fv; th = hash2(iu, 17); kth = 0.8 + 0.14 * (hash2(iu, 5) - 0.5) + 0.11 * bil(SLW, i, j); }
      else { ac = fv; bc = fu; th = hash2(jv, 911); kth = 0.84 + 0.14 * (hash2(jv, 77) - 0.5) + 0.11 * bil(SLF, i, j); }
      const an = ac / (0.5 * kth);
      let shade, top = warpTop;
      if (an > -1 && an < 1) {
        // the float on top: round across, arched along (it dives under its neighbours at both ends)
        const hA = Math.sqrt(1 - an * an), arch = 0.5 + 0.5 * Math.cos(Math.PI * bc), z = hA * arch;
        const dA = (-an / (hA + 0.35)) * arch, dB = -1.4 * Math.sin(Math.PI * bc) * hA;
        const lit = warpTop ? 0.6 * dA + 0.8 * dB : 0.6 * dB + 0.8 * dA;
        shade = 0.4 + 0.38 * z + 0.2 * lit;
      } else {
        // between two floats we look down at the thread that passes underneath
        top = !warpTop; th = top ? hash2(iu, 17) : hash2(jv, 911);
        shade = 0.2 + 0.1 * Math.cos(Math.PI * bc);
      }
      let tone = (0.84 + 0.32 * th) * (1 + 0.16 * bil(TN, i, j)) * (0.95 + 0.1 * hash2(i, j));
      let cr, cg, cb;
      if (top) { cr = 42; cg = 80; cb = 156; } else { cr = 58; cg = 102; cb = 182; }   // warp is dyed deeper than the weft
      if (hash2(iu * 131 + 7, jv * 17 + 3) > 0.988) { tone *= 1.4; cr += 26; cg += 24; cb += 8; }                  // a nep where the indigo never took
      const sh = (shade < 0.12 ? 0.12 : shade) * tone;
      const o = (j * RW + i) * 4;
      d[o] = cr * sh; d[o + 1] = cg * sh; d[o + 2] = cb * sh; d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(RW, RH);
  c.getContext('2d').putImageData(img, 0, 0);
  return { c, X0, Y0 };
}

// ───────────────────────── vermilion satin ground, per pixel ─────────────────────────
// md = blurred leaf mask (RGBA bytes of the region canvas): the ground puckers up toward the stiff embroidery
function buildGround(env, G, md) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const { X0, Y0, RW, RH } = G;
  const nz = L.makeNoise('s22satin');
  const WR = coarse(RW, RH, 8, (x, y) => 9 * nz.fbm((x + X0) / 300, (y + Y0) / 210, 2) + 2.8 * nz.n2((x + X0) / 75 + 3, (y + Y0) / 95));
  // 1) height of the cloth at half resolution: the herb-stuffed pillow, soft wrinkles, puckers, the pull of every edge stitch
  const gw = (RW >> 1) + 2, gh = (RH >> 1) + 2, hg = new Float32Array(gw * gh);
  for (let jj = 0; jj < gh; jj++) for (let ii = 0; ii < gw; ii++) {
    const x = X0 + ii * 2, y = Y0 + jj * 2, ddx = x - cx, ddy = cy - y, rr = Math.sqrt(ddx * ddx + ddy * ddy);
    const dep = Math.max(0, R - rr), U = Math.atan2(ddx, ddy) * R;
    const mi = Math.min(RW - 1, ii * 2), mj = Math.min(RH - 1, jj * 2);
    hg[jj * gw + ii] = 62 * (1 - Math.exp(-dep / 105)) + bil(WR, mi, mj) + (5.5 * md[(mj * RW + mi) * 4 + 3]) / 255
      + 0.6 * Math.cos((U * L.TAU) / LEGP) * Math.exp(-Math.max(0, dep - 20) / 28) * sstep(6, 20, dep);
  }
  // 2) light: a soft diffuse term plus the mirror-like lobe that makes satin look wet
  const dif = new Float32Array(gw * gh), sp = new Float32Array(gw * gh);
  for (let jj = 0; jj < gh; jj++) for (let ii = 0; ii < gw; ii++) {
    const k = jj * gw + ii;
    const gx = (hg[k + (ii < gw - 1 ? 1 : 0)] - hg[k - (ii > 0 ? 1 : 0)]) / 4, gy = (hg[k + (jj < gh - 1 ? gw : 0)] - hg[k - (jj > 0 ? gw : 0)]) / 4;
    const lit = -LX * gx - LY * gy;
    dif[k] = L.clamp(0.8 + 0.95 * lit, 0.4, 1.32);
    const e = (gx - 0.1) * (gx - 0.1) + (gy - 0.27) * (gy - 0.27);
    sp[k] = 0.5 * Math.exp(-e / 0.05) + 0.65 * Math.exp(-e / 0.008);
  }
  // 3) colour, with the satin weave itself: long warp floats (fine ribs) tied down on a 5-end counter
  const img = new ImageData(RW, RH), d = img.data;
  const PWS = 3.1, PFS = 4.3, lim = (R + 2) * (R + 2);
  for (let j = 0; j < RH; j++) {
    const py = Y0 + j, dyc = cy - py, row = Math.floor(py / PFS);
    for (let i = 0; i < RW; i++) {
      const px = X0 + i, ddx = px - cx;
      if (ddx * ddx + dyc * dyc > lim) continue;
      const k = (j >> 1) * gw + (i >> 1), df = dif[k], s = sp[k];
      const uu = px / PWS, col = Math.floor(uu), fx = uu - col;
      const rb = 0.8 + 0.8 * fx * (1 - fx);
      const bind = (((row + 3 * col) % 5) + 5) % 5 === 0;
      const tx = (bind ? rb * 0.7 : rb * (0.95 + 0.1 * hash2(col, row >> 2))) * (0.97 + 0.06 * hash2(i, j));
      const hot = df > 1 ? df - 1 : 0, glint = s * (rb + 0.15);
      const o = (j * RW + i) * 4;
      d[o] = 204 * df * tx + 60 * glint;
      d[o + 1] = (50 * df + 70 * hot) * tx + 78 * glint;
      d[o + 2] = (31 * df + 24 * hot) * tx + 52 * glint;
      d[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(RW, RH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ───────────────────────── mugwort leaves: geometry ─────────────────────────
const NO_TEETH = { 1: [], [-1]: [] };
/**
 * One lobe (or the leaf's central wing): a curved axis with a half-width profile and forward-pointing coarse teeth.
 * o: {x, y, ang, curv, len, w, sMin, teeth: {1: [[s, height]…], -1: […]}, wing}
 */
function makeLobe(o) {
  const c = Math.abs(o.curv) < 1e-4 ? 1e-4 : o.curv, s0 = Math.sin(o.ang), c0 = Math.cos(o.ang);
  const at = (s) => { const ph = o.ang + c * s; return { x: o.x + (o.len * (Math.sin(ph) - s0)) / c, y: o.y - (o.len * (Math.cos(ph) - c0)) / c, ph }; };
  const prof = o.wing
    ? (s) => (0.25 + 0.75 * sstep(0, 0.12, s)) * (1 - 0.3 * sstep(0.55, 1, s))
    : (s) => (s <= 0 ? 0.6 : s < 0.38 ? 0.6 + 0.4 * sstep(0, 0.38, s) : Math.pow(Math.max(0, 1 - Math.pow((s - 0.38) / 0.62, 1.7)), 0.9));
  const tooth = (s, side) => {
    let v = 0;
    for (const [st, T] of o.teeth[side]) {
      if (s > st - 0.17 && s <= st) v += T * Math.pow((s - st + 0.17) / 0.17, 1.4);
      else if (s > st && s <= st + 0.025) v += L.lerp(T, -0.12, (s - st) / 0.025);
      else if (s > st + 0.025 && s < st + 0.11) v += -0.12 * (1 - (s - st - 0.025) / 0.085);
    }
    return v;
  };
  const hw = (s, side, inset = 0) => Math.max(0, o.w * prof(s) * (1 + tooth(s, side)) - inset);
  const cache = {};
  const sidePts = (side, inset) => {
    const key = side + '/' + inset; if (cache[key]) return cache[key];
    const ss = [];
    for (let s = o.sMin; s < 1; s += 0.035) ss.push(s);
    ss.push(1);
    for (const [st] of o.teeth[side]) ss.push(st - 0.17, st - 0.07, st, st + 0.025, st + 0.11);
    const out = ss.filter((s) => s >= o.sMin && s <= 1).sort((p, q) => p - q).map((s) => {
      const p = at(s), h = hw(s, side, inset);
      return [p.x - Math.sin(p.ph) * h * side, p.y + Math.cos(p.ph) * h * side];
    });
    return (cache[key] = out);
  };
  return {
    o, at, hw,
    fullPath(g, inset = 0) {
      const A = sidePts(1, inset), B = sidePts(-1, inset);
      g.beginPath(); A.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      for (let i = B.length - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
      g.closePath();
    },
    halfPath(g, side) {
      g.beginPath();
      for (let i = 0; i <= 24; i++) { const p = at(L.lerp(o.sMin, 1, i / 24)); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      const A = sidePts(side, 0);
      for (let i = A.length - 1; i >= 0; i--) g.lineTo(A[i][0], A[i][1]);
      g.closePath();
    },
    axisPath(g, a0, a1) {
      g.beginPath();
      for (let i = 0; i <= 20; i++) { const p = at(L.lerp(a0, a1, i / 20)); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
    },
  };
}

/** a mugwort leaf: central wing along the midrib, three pairs of forward-swept toothed lobes, a three-pointed terminal lobe */
function makeLeaf(d) {
  const r = L.rng('s22leaf' + d.seed);
  const mAt = makeLobe({ x: d.x, y: d.y, ang: d.ang, curv: d.bend, len: d.len, w: 1, sMin: 0, teeth: NO_TEETH, wing: true }).at;
  const lobes = [];
  const w0 = mAt(0.07);
  lobes.push(makeLobe({ x: w0.x, y: w0.y, ang: w0.ph, curv: d.bend * 0.75, len: d.len * 0.75, w: d.len * 0.034, sMin: 0, teeth: NO_TEETH, wing: true }));
  const rows = [[0.15, 1.16, 0.25, 0.048], [0.34, 0.95, 0.4, 0.06], [0.55, 0.74, 0.37, 0.058]];
  for (const [t, al, lf, wf] of rows) for (const side of [1, -1]) {
    const m = mAt(t + side * 0.022 + r.range(-0.012, 0.012));
    const basal = [[0.34 + r.range(-0.03, 0.03), r.range(0.42, 0.6)], [0.62 + r.range(-0.03, 0.03), r.range(0.4, 0.55)]];
    const distal = [[0.5 + r.range(-0.05, 0.05), r.range(0.36, 0.5)]];
    lobes.push(makeLobe({
      x: m.x, y: m.y, ang: m.ph + side * (al + r.range(-0.07, 0.07)), curv: -side * r.range(0.1, 0.3),
      len: d.len * lf * r.range(0.9, 1.08), w: d.len * wf * r.range(0.92, 1.1), sMin: 0,
      teeth: side > 0 ? { 1: basal, [-1]: distal } : { 1: distal, [-1]: basal },
    }));
  }
  const m = mAt(0.68);
  lobes.push(makeLobe({
    x: m.x, y: m.y, ang: m.ph + r.range(-0.05, 0.05), curv: d.bend * 0.4, len: d.len * 0.36, w: d.len * 0.066, sMin: 0,
    teeth: { 1: [[0.3, 0.7], [0.58, 0.55]], [-1]: [[0.34, 0.65], [0.6, 0.5]] },
  }));
  const rib = [];
  for (let t = -0.2; t <= 0.9; t += 0.0125) { const p = mAt(t); rib.push([p.x, p.y]); }
  return { d, mAt, lobes, rib, r };
}

// ───────────────────────── mugwort leaves: stitching ─────────────────────────
/** satin stitch over one half of a lobe: parallel strands slanting off the vein, clipped by the half's outline */
function stitchHalf(g, sg, lobe, side, r, warm) {
  const o = lobe.o, sinB = Math.sin(BETA), cosB = Math.cos(BETA), ds = PITCH / (o.len * sinB);
  // which way does this half face? toward the key light → the bright floss, away from it → the deep floss
  const mid = lobe.at(0.45), facing = side * (-Math.sin(mid.ph) * LX + Math.cos(mid.ph) * LY);
  const pal = facing > 0 ? PAL_LIT : PAL_SHD;
  g.save(); lobe.halfPath(g, side); g.clip();
  sg.save(); lobe.halfPath(sg, side); sg.clip();
  g.lineCap = 'butt'; sg.lineCap = 'round';
  for (let s = o.sMin - 0.45; s < 1; s += ds * r.range(0.92, 1.08)) {
    const p = lobe.at(s), da = p.ph + side * (BETA + r.range(-0.045, 0.045)), dx = Math.cos(da), dy = Math.sin(da);
    const sc = L.clamp(s, 0, 1), sEnd = L.clamp(sc + (lobe.hw(sc, side) / Math.tan(BETA)) / o.len, 0, 1);
    const est = Math.max(10, lobe.hw(sEnd, side) / sinB);                       // how long this stitch lies on the surface
    const q = L.clamp((sc + sEnd) * 0.5 + 0.06, 0, 1) * (pal.length - 1) + r.gauss() * 0.62;
    const col = pal[L.clamp(Math.round(q), 0, pal.length - 1)];
    const across = Math.abs(dx * LY - dy * LX);                                   // silk shines when it lies across the light
    const base = L.shade(col, r.range(-0.07, 0.06) + (across - 0.55) * 0.26 + warm);
    const x0 = p.x - dx * 4, y0 = p.y - dy * 4, x1 = p.x + dx * (est + 18), y1 = p.y + dy * (est + 18);
    g.lineWidth = PITCH + 0.9; g.strokeStyle = base; seg(g, x0, y0, x1, y1);
    // the furrow between this strand and the next, on the side turned from the light
    const nx = -dy, ny = dx, sgn = nx * LX + ny * LY > 0 ? 1 : -1;
    g.lineWidth = 1.25; g.strokeStyle = L.rgba(L.shade(col, -0.62), 0.5);
    seg(g, x0 - sgn * nx * PITCH * 0.46, y0 - sgn * ny * PITCH * 0.46, x1 - sgn * nx * PITCH * 0.46, y1 - sgn * ny * PITCH * 0.46);
    // the sheen: a soft band where the strand crests over the padding, with a thin hot core
    const hc = 0.5 + r.range(-0.15, 0.15), hl = r.range(0.2, 0.34), ha = Math.pow(across, 1.5) * r.range(0.45, 1);
    const ox = sgn * nx * PITCH * 0.14, oy = sgn * ny * PITCH * 0.14;
    const ax = p.x + dx * est * (hc - hl) + ox, ay = p.y + dy * est * (hc - hl) + oy, bx = p.x + dx * est * (hc + hl) + ox, by = p.y + dy * est * (hc + hl) + oy;
    const light = L.mix(col, '#fff0c4', 0.58);
    g.lineCap = 'round';
    g.lineWidth = PITCH * 0.5; g.strokeStyle = L.rgba(light, 0.5 * ha); seg(g, ax, ay, bx, by);
    const cxm = (ax + bx) / 2, cym = (ay + by) / 2, hx = (bx - ax) * 0.3, hy = (by - ay) * 0.3;
    g.lineWidth = PITCH * 0.22; g.strokeStyle = L.rgba('#fff6da', 0.55 * ha); seg(g, cxm - hx, cym - hy, cxm + hx, cym + hy);
    g.lineCap = 'butt';
    sg.lineWidth = PITCH * 0.55; sg.strokeStyle = L.rgba(light, 0.6 * ha); seg(sg, ax, ay, bx, by);
    sg.lineWidth = PITCH * 0.24; sg.strokeStyle = L.rgba('#fff6da', 0.8 * ha); seg(sg, cxm - hx, cym - hy, cxm + hx, cym + hy);
  }
  g.restore(); sg.restore();
}

/** a rope of stem stitch along a polyline (the gold midrib and leaf stalk): short slanting stitches that overlap */
function stemStitch(g, sg, pts, w0, w1, r) {
  const p = L.smoothPath(pts, 3), n = p.length;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(74,22,6,0.9)'; g.lineWidth = Math.max(w0, w1) + 1.6;
  g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke();
  sg.lineCap = 'round';
  for (let i = 2; i < n - 2; i += 3) {
    const u = i / (n - 1), w = L.lerp(w0, w1, u);
    const a = p[i - 2], b = p[i + 2];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const nx = -ty, ny = tx, k = w * 0.26, hl = 7.5;
    const x0 = p[i][0] - tx * hl - nx * k, y0 = p[i][1] - ty * hl - ny * k, x1 = p[i][0] + tx * hl + nx * k, y1 = p[i][1] + ty * hl + ny * k;
    const tone = r.range(-0.16, 0.1);
    g.lineWidth = w * 0.86; g.strokeStyle = L.shade(GOLD.low, -0.25 + tone); seg(g, x0 + 0.6, y0 + 0.9, x1 + 0.6, y1 + 0.9);
    g.lineWidth = w * 0.7; g.strokeStyle = L.shade(GOLD.mid, tone); seg(g, x0, y0, x1, y1);
    const sgn = nx * LX + ny * LY > 0 ? 1 : -1, ox = sgn * nx * w * 0.16, oy = sgn * ny * w * 0.16, ha = r.range(0.45, 1);
    g.lineWidth = w * 0.26; g.strokeStyle = L.rgba(GOLD.hot, 0.75 * ha); seg(g, L.lerp(x0, x1, 0.3) + ox, L.lerp(y0, y1, 0.3) + oy, L.lerp(x0, x1, 0.72) + ox, L.lerp(y0, y1, 0.72) + oy);
    sg.lineWidth = w * 0.3; sg.strokeStyle = L.rgba(GOLD.hot, 0.9 * ha); seg(sg, L.lerp(x0, x1, 0.3) + ox, L.lerp(y0, y1, 0.3) + oy, L.lerp(x0, x1, 0.72) + ox, L.lerp(y0, y1, 0.72) + oy);
  }
}

/** embroider every leaf: returns the colour stack (with the shadows the raised work drops), its highlights, and a height map */
function renderLeaves(env, G, leaves) {
  const T = rc(G), O = rc(G), SP = rc(G), all = rc(G), spec = rc(G), hc = rc(G);
  hc.g.fillStyle = '#000'; hc.g.fillRect(G.X0, G.Y0, G.RW, G.RH);
  leaves.forEach((leaf, k) => {
    const r = leaf.r;
    wipe(T); wipe(O); wipe(SP);
    for (const lb of leaf.lobes) {
      // later lobes lie over earlier ones: lay a ground of dark floss, clear the highlights it covers, then stitch both halves
      T.g.fillStyle = '#7a1e10'; lb.fullPath(T.g, 0); T.g.fill();
      SP.g.globalCompositeOperation = 'destination-out'; lb.fullPath(SP.g, 0); SP.g.fill(); SP.g.globalCompositeOperation = 'source-over';
      for (const side of [1, -1]) stitchHalf(T.g, SP.g, lb, side, r, leaf.d.warm);
      // the vein: where the two fields of stitches plunge into the cloth
      T.g.lineCap = 'round'; T.g.strokeStyle = 'rgba(64,10,5,0.5)'; T.g.lineWidth = 1.8; lb.axisPath(T.g, 0.02, 0.93); T.g.stroke();
    }
    // outline in dark red back stitch, worked last so it sits on the stitch ends: a ring straddling the leaf's edge
    O.g.lineJoin = 'round'; O.g.lineCap = 'round';
    O.g.strokeStyle = '#5a1410'; O.g.lineWidth = 9.5;
    for (const lb of leaf.lobes) { lb.fullPath(O.g, 0); O.g.stroke(); }
    O.g.globalCompositeOperation = 'destination-out';
    for (const lb of leaf.lobes) { lb.fullPath(O.g, 2.6); O.g.fill(); }
    O.g.globalCompositeOperation = 'source-atop';
    O.g.lineCap = 'butt';
    O.g.setLineDash([11, 3.5]); O.g.strokeStyle = 'rgba(150,44,26,0.75)'; O.g.lineWidth = 3.4;
    for (const lb of leaf.lobes) { O.g.lineDashOffset = r.range(0, 14); lb.fullPath(O.g, -1.2); O.g.stroke(); }
    O.g.setLineDash([7, 7.5]); O.g.strokeStyle = 'rgba(232,130,90,0.5)'; O.g.lineWidth = 1.3;
    for (const lb of leaf.lobes) { O.g.lineDashOffset = r.range(0, 14); lb.fullPath(O.g, -2.2); O.g.stroke(); }
    O.g.setLineDash([]); O.g.globalCompositeOperation = 'source-over';
    stamp(T, O.c);
    stamp(SP, O.c, 'destination-out');
    // gold midrib and stalk on top
    stemStitch(T.g, SP.g, leaf.rib, 7.5, 4.2, r);
    // onto the stack: this leaf shadows whatever lies under it
    all.g.save(); all.g.setTransform(1, 0, 0, 1, 0, 0);
    all.g.shadowColor = 'rgba(52,4,2,0.62)'; all.g.shadowBlur = 11; all.g.shadowOffsetX = 4; all.g.shadowOffsetY = 6.5;
    all.g.drawImage(T.c, 0, 0);
    all.g.restore();
    stamp(spec, T.c, 'destination-out'); stamp(spec, SP.c);
    // height: each leaf a plateau (later leaves higher), a groove down every vein, the rib and the outline standing proud
    const lvl = 120 + 36 * k;
    hc.g.fillStyle = `rgb(${lvl},${lvl},${lvl})`;
    for (const lb of leaf.lobes) { lb.fullPath(hc.g, 0); hc.g.fill(); }
    hc.g.lineCap = 'round'; hc.g.strokeStyle = `rgb(${lvl + 26},${lvl + 26},${lvl + 26})`; hc.g.lineWidth = 4;
    for (const lb of leaf.lobes) { lb.fullPath(hc.g, 0); hc.g.stroke(); }
    hc.g.strokeStyle = `rgb(${lvl - 62},${lvl - 62},${lvl - 62})`; hc.g.lineWidth = 4;
    for (const lb of leaf.lobes) { lb.axisPath(hc.g, 0.04, 0.9); hc.g.stroke(); }
    hc.g.strokeStyle = `rgb(${lvl + 60},${lvl + 60},${lvl + 60})`; hc.g.lineWidth = 6;
    hc.g.beginPath(); leaf.rib.forEach((q, i) => (i ? hc.g.lineTo(q[0], q[1]) : hc.g.moveTo(q[0], q[1]))); hc.g.stroke();
  });
  const bump = L.bumpLight(hc.c, { angle: 53, strength: 1.5, blur: 2.4, res: 0.5 });
  L.overlayOn(all.c, bump, { blend: 'overlay', alpha: 0.6 });
  return { all: all.c, spec: spec.c };
}

// ───────────────────────── the edge: frayed silk, blanket stitch in gold ─────────────────────────
function frayThreads(env) {
  const a = env.arc, r = L.rng('s22fray'), nz = L.makeNoise('s22fray'), span = a.span(PAD + 40) * a.R, out = [];
  // long loose ends …
  for (let U = -span; U < span; U += r.range(1.5, 4.4)) {
    const th = U / a.R, mid = Math.exp(-Math.pow(th / 0.15, 2));       // trimmed shorter right over the crest, where the words sit
    const clump = 0.55 + 0.45 * nz.n2(U / 120, 3.3);
    let len = (8 + 31 * clump * r.range(0.3, 1)) * (1 - 0.42 * mid);
    if (r.chance(0.04)) len *= 1.55;
    out.push({ th, len, lean: r.gauss() * 0.24 + 0.5 * nz.n2(U / 210, 9), curl: r.gauss() * 0.55, w: r.range(1.1, 2.5), c: r.pick(FRAY), tone: r.range(-0.14, 0.12), hi: r.chance(0.4) });
  }
  // … and a dense fuzz right at the edge
  for (let U = -span; U < span; U += r.range(1.1, 2.6)) {
    out.push({ th: U / a.R, len: r.range(3, 9), lean: r.gauss() * 0.5, curl: r.gauss() * 0.4, w: r.range(0.9, 1.7), c: r.pick(FRAY), tone: r.range(-0.2, 0.05), hi: false });
  }
  return out;
}
function threadPath(g, f) {
  const tx = Math.sin(f.lean) * f.len, ty = -Math.cos(f.lean) * f.len;
  g.beginPath(); g.moveTo(0, 4);
  g.quadraticCurveTo(tx * 0.5 + f.curl * f.len * 0.35, ty * 0.55, tx, ty);
}
function drawFray(g, env, threads) {
  const a = env.arc;
  // their shadows on the cloth first: soft, slipped away from the light
  const sh = L.makeLayer(PAD, (s) => {
    s.lineCap = 'round'; s.strokeStyle = '#040817';
    for (const f of threads) a.at(s, f.th, 0, () => { s.lineWidth = f.w + 1.2; threadPath(s, f); s.stroke(); });
  });
  g.save(); g.globalAlpha = 0.55; g.drawImage(L.blurred(sh, 2.4), -PAD + 3.5, -PAD + 4.5); g.restore();
  g.lineCap = 'round';
  for (const f of threads) a.at(g, f.th, 0, () => {
    g.lineWidth = f.w + 0.9; g.strokeStyle = L.rgba(L.shade(f.c, -0.5), 0.85); threadPath(g, f); g.stroke();
    g.lineWidth = f.w; g.strokeStyle = L.shade(f.c, f.tone); threadPath(g, f); g.stroke();
    if (f.hi) { g.save(); g.translate(-0.5, -0.3); g.lineWidth = f.w * 0.42; g.strokeStyle = L.rgba('#ffe2c2', 0.7); threadPath(g, f); g.stroke(); g.restore(); }
  });
}

function edgeLegs(env) {
  const a = env.arc, r = L.rng('s22legs'), n = Math.ceil((a.span(PAD + 40) * a.R) / LEGP), out = [];
  for (let i = -n; i <= n; i++) {
    out.push({
      th: (i * LEGP + r.range(-2.4, 2.4)) / a.R, len: 27 + r.range(-3.5, 3.5) + (r.chance(0.07) ? r.range(3, 7) : 0),
      lean: 3 + r.range(-2.4, 2.4), w: 5.2 + r.range(-0.6, 0.6), tone: r.range(-0.14, 0.1), ha: r.range(0.5, 1),
    });
  }
  return out;
}
/** blanket stitch in gold thread: the legs bite into the satin, the cord rides the very edge (its top IS the arc) */
function drawEdge(g, sg, env, legs) {
  const a = env.arc, r = L.rng('s22cord');
  g.lineCap = 'round'; sg.lineCap = 'round';
  // legs: dark underside + the shadow each one drops on the satin
  g.save();
  g.shadowColor = 'rgba(60,5,3,0.6)'; g.shadowBlur = 5; g.shadowOffsetX = 2.5; g.shadowOffsetY = 3.5;
  for (const q of legs) a.at(g, q.th, 0, () => { g.strokeStyle = GOLD.dark; g.lineWidth = q.w + 1.5; seg(g, 0, 4, -q.lean, q.len); });
  g.restore();
  for (const q of legs) a.at(g, q.th, 0, () => a.at(sg, q.th, 0, () => {
    // the hole it dives into, and the dimple it pulls
    g.fillStyle = 'rgba(48,4,2,0.7)'; g.beginPath(); g.ellipse(-q.lean - 0.3, q.len + 2.2, 3.1, 2.2, 0, 0, L.TAU); g.fill();
    g.strokeStyle = L.shade(GOLD.mid, q.tone); g.lineWidth = q.w; seg(g, 0, 4, -q.lean, q.len);
    // the metal foil is wound round a silk core: a fine diagonal twist
    g.lineCap = 'butt'; g.strokeStyle = 'rgba(96,56,8,0.5)'; g.lineWidth = 1;
    for (let y = 7; y < q.len - 1; y += 3.3) { const x = (-q.lean * (y - 4)) / (q.len - 4); seg(g, x - 2.3, y + 1.4, x + 2.3, y - 1.4); }
    g.lineCap = 'round';
    g.strokeStyle = L.rgba(GOLD.hot, 0.85 * q.ha); g.lineWidth = 1.7;
    const y0 = q.len * 0.3, y1 = q.len * 0.82, xa = (-q.lean * (y0 - 4)) / (q.len - 4) - 1.2, xb = (-q.lean * (y1 - 4)) / (q.len - 4) - 1.2;
    seg(g, xa, y0, xb, y1);
    sg.strokeStyle = L.rgba(GOLD.hot, q.ha); sg.lineWidth = 2; seg(sg, xa, y0, xb, y1);
  }));
  // the cord along the edge, with its own shadow falling inward
  g.save();
  g.shadowColor = 'rgba(60,5,3,0.55)'; g.shadowBlur = 5; g.shadowOffsetX = 1.5; g.shadowOffsetY = 3.5;
  g.strokeStyle = GOLD.dark; g.lineWidth = 7.4; a.stroke(g, -3.9);
  g.restore();
  g.lineCap = 'butt';
  g.strokeStyle = L.radial(g, a.cx, a.cy, a.R - 7.6, a.R, [[0, GOLD.dark], [0.28, GOLD.low], [0.56, GOLD.mid], [0.78, GOLD.light], [0.9, GOLD.hot], [1, GOLD.light]]);
  g.lineWidth = 7.4; a.stroke(g, -3.8);
  // tarnish and wear along its length
  const span = a.span(PAD + 40);
  const nz = L.makeNoise('s22cord');
  for (let U = -span * a.R; U < span * a.R; U += 26) {
    const v = nz.n2(U / 150, 1.7);
    if (v < 0.05) continue;
    g.strokeStyle = L.rgba('#6a3a0a', 0.3 * v); g.lineWidth = 7.4; a.stroke(g, -3.8, U / a.R, (U + 30) / a.R);
  }
  // twist of the gold thread
  for (let U = -span * a.R; U < span * a.R; U += r.range(3.1, 4.2)) a.at(g, U / a.R, -3.8, () => {
    g.strokeStyle = 'rgba(88,50,6,0.5)'; g.lineWidth = 1.05; seg(g, -2.3, 3.3, 2.3, -3.3);
    g.strokeStyle = 'rgba(255,246,200,0.4)'; g.lineWidth = 0.9; seg(g, -0.6, 1.4, 1.6, -1.8);
  });
  // where every leg hooks over the cord: a little knuckle that catches the light
  for (const q of legs) a.at(g, q.th, -3.8, () => a.at(sg, q.th, -3.8, () => {
    g.fillStyle = L.radial(g, -1.4, -1.6, 0.3, 6, [[0, GOLD.hot], [0.3, GOLD.light], [0.7, L.shade(GOLD.mid, q.tone)], [1, GOLD.dark]]);
    g.beginPath(); g.ellipse(0, 0.2, 4.6, 4.1, 0, 0, L.TAU); g.fill();
    sg.fillStyle = L.rgba(GOLD.hot, q.ha); sg.beginPath(); sg.ellipse(-1.3, -1.5, 2.1, 1.5, -0.4, 0, L.TAU); sg.fill();
  }));
  // rim light along the cord's shoulder
  sg.lineCap = 'butt'; sg.strokeStyle = L.rgba(GOLD.hot, 0.7); sg.lineWidth = 1.8; a.stroke(sg, -1.6);
}

// ───────────────────────── assembly ─────────────────────────
function build(env) {
  const a = env.arc, G = region(env);
  const full = (g) => g.fillRect(-PAD, -PAD, LW, LH);
  const __t=[performance.now()]; const __m=(n)=>{__t.push(performance.now()); console.log('T '+n+' '+(__t[__t.length-1]-__t[__t.length-2]).toFixed(0));};
  const leaves = LEAVES.map(makeLeaf);
  // where the embroidery is → the ground puckers toward it
  const mk = rc(G); mk.g.fillStyle = '#fff';
  for (const lf of leaves) for (const lb of lf.lobes) { lb.fullPath(mk.g, 0); mk.g.fill(); }
  const md = L.blurred(mk.c, 13).getContext('2d').getImageData(0, 0, G.RW, G.RH).data;
  __m('mask');
  const ground = buildGround(env, G, md);
  __m('ground');
  const lv = renderLeaves(env, G, leaves);
  __m('leaves');
  const cloth = buildCloth(env);
  __m('cloth');
  const threads = frayThreads(env), legs = edgeLegs(env);
  const spec = L.makeLayer(PAD);
  const sg = spec.getContext('2d');

  const main = L.makeLayer(PAD, (g) => {
    // ── the cloth ──
    g.drawImage(cloth.c, cloth.X0, cloth.Y0);
    // stray lint
    const rl = L.rng('s22lint');
    g.lineCap = 'round';
    for (let i = 0; i < 230; i++) {
      const x = rl.range(-PAD, W + PAD), y = rl.range(-PAD, 760), len = rl.range(7, 26), ang = rl.range(0, Math.PI), bend = rl.range(-6, 6);
      const calm = x > 600 && x < 1320 && y > 280 && y < 560;
      g.strokeStyle = L.rgba(rl.chance(0.7) ? '#8fb0e8' : '#0b1630', (calm ? 0.1 : 0.22) * rl.range(0.5, 1)); g.lineWidth = rl.range(0.6, 1.2);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend, y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    }
    // the key light pools upper left and falls away to the right
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, 560, 240, 160, 1750, [[0, '#ffffff'], [0.45, '#e2e6f4'], [1, '#98a2c6']]); full(g);
    g.globalCompositeOperation = 'source-over';
    // contact shadow where the sachet presses on the cloth
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 2, a.R + 74, [[0, 'rgba(4,8,24,0.66)'], [0.3, 'rgba(4,8,24,0.34)'], [1, 'rgba(4,8,24,0)']]); full(g);
    // ── frayed silk beyond the edge ──
    drawFray(g, env, threads);
    // ── the sachet ──
    g.save(); a.clipBelow(g, -0.6);
    g.drawImage(ground, G.X0, G.Y0);
    g.drawImage(lv.all, G.X0, G.Y0);
    // the pillow turns away from the light toward the right and sinks toward the bottom of frame
    g.globalCompositeOperation = 'multiply';
    const lp = a.pt(-0.12, -170);
    g.fillStyle = L.radial(g, lp.x, lp.y, 260, 1500, [[0, '#ffffff'], [0.5, '#f1d9cf'], [1, '#b98478']]); full(g);
    g.globalCompositeOperation = 'source-over';
    g.restore();
    sg.save(); a.clipBelow(sg, -0.6); sg.drawImage(lv.spec, G.X0, G.Y0); sg.restore();
    drawEdge(g, sg, env, legs);
  });

  __m('main');
  // depth of field: sharp in a band around the edge, easing soft toward the bottom of frame and the far top
  const soft = L.blurred(main, 5), s2 = soft.getContext('2d');
  s2.globalCompositeOperation = 'destination-in';
  const r0 = a.R - 600, r1 = a.R + 660, at = (dr) => (a.R + dr - r0) / (r1 - r0);
  s2.fillStyle = L.radial(s2, a.cx + PAD, a.cy + PAD, r0, r1, [[0, 'rgba(0,0,0,1)'], [at(-520), 'rgba(0,0,0,1)'], [at(-250), 'rgba(0,0,0,0)'], [at(300), 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]);
  s2.fillRect(0, 0, LW, LH);
  const mg = main.getContext('2d');
  mg.drawImage(soft, -PAD, -PAD);
  __m('dof');
  return { main, spec, tmp: L.makeCanvas(W, H) };
}

export default {
  name: '香囊织锦',
  tone: 'light',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.022, p), dy = 1.6 * p;
    L.blit(ctx, env, S.main, { rot, zoom, dy });
    // a pool of light travels along the shoulder of the sachet …
    const lt = L.lerp(-0.2, 0.04, p), lc = a.pt(lt, -150);
    ctx.save(); a.clipBelow(ctx, -8);
    L.glow(ctx, lc.x, lc.y, 520, '#ffd2a0', 0.22, 'soft-light');
    ctx.restore();
    // … and the silk and gold under it flare strand by strand
    const t = S.tmp.getContext('2d');
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H);
    L.blit(t, env, S.spec, { rot, zoom, dy });
    t.globalCompositeOperation = 'destination-in';
    t.fillStyle = L.radial(t, lc.x, lc.y, 60, 560, [[0, 'rgba(0,0,0,1)'], [0.4, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
    t.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.85; ctx.drawImage(S.tmp, 0, 0); ctx.restore();
  },
};
