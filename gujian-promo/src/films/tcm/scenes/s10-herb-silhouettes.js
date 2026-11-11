// s10 — 百草剪影. The arc is the ridge of an earth bank; a row of wild herbs stands on it in flat paper-cut silhouette
// against a flat cyan sky: dandelion (倒向羽裂的基生莲座叶 + 绒球花葶), plantain (宽卵形叶、弧形脉、直立细穗) and
// mugwort (羽状深裂叶成丛). No volume anywhere — only a few lighter crimson brush marks (leaf veins, soil grains).
//
// Everything above the arc is drawn LIVE as vector paths (Path2D built once in init), so the cut edges stay razor sharp
// while the row slides round the arc centre and every plant leans a hair in the wind (a shear about its own base).
// Below the arc: a live flat fill (the exact arc edge) + one pre-rendered layer of soil marks that slides with the row.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 200;
const SKY = '#1aa3b8', INK = '#4a1420', VEIN = '#7a2230', CREAM = '#f2e8d0';
const ROT = L.deg(1);          // the row slides from −1° to +1° about the arc centre
let S = null;

// ───────────────────────── geometry helpers ─────────────────────────
/** a curved midrib: starts at (x0,y0) heading `ang`, turns by `bend` radians over its length */
function spine(x0, y0, ang, len, bend = 0, n = 24, pow = 1.3) {
  const pts = []; let x = x0, y = y0; const ds = len / n;
  for (let i = 0; i <= n; i++) {
    const a = ang + bend * Math.pow(i / n, pow);
    pts.push({ x, y, a });
    x += Math.cos(a) * ds; y += Math.sin(a) * ds;
  }
  pts.len = len;
  return pts;
}
function sAt(sp, u) {
  const n = sp.length - 1;
  if (u <= 0) { const p = sp[0], d = u * sp.len; return { x: p.x + Math.cos(p.a) * d, y: p.y + Math.sin(p.a) * d, a: p.a }; }
  if (u >= 1) { const p = sp[n], d = (u - 1) * sp.len; return { x: p.x + Math.cos(p.a) * d, y: p.y + Math.sin(p.a) * d, a: p.a }; }
  const f = u * n, i = Math.floor(f), t = f - i, p = sp[i], q = sp[i + 1];
  return { x: L.lerp(p.x, q.x, t), y: L.lerp(p.y, q.y, t), a: L.lerp(p.a, q.a, t) };
}
/** point at fraction u along the spine, pushed v px sideways */
function off(sp, u, v) { const p = sAt(sp, u); return [p.x - Math.sin(p.a) * v, p.y + Math.cos(p.a) * v]; }
/** add a polygon to a Path2D with a consistent winding (so overlapping pieces union instead of punching holes) */
function addPoly(path, pts) {
  let A = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
  if (A < 0) pts = pts.slice().reverse();
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();
}
/** a ribbon along part of a spine, half-width w0 → w1 */
function strip(path, sp, u0, u1, w0, w1, n = 20) {
  const A = [], B = [];
  for (let i = 0; i <= n; i++) { const k = i / n, u = L.lerp(u0, u1, k), w = L.lerp(w0, w1, k); A.push(off(sp, u, w)); B.push(off(sp, u, -w)); }
  addPoly(path, A.concat(B.reverse()));
}
/** a brushed vein: a tapered ribbon through pts with a little pressure wobble */
function vein(path, pts, w0, w1, ph = 0) {
  const n = pts.length, A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const u = i / (n - 1);
    const w = L.lerp(w0, w1, u) * (1 + 0.28 * Math.sin(u * 8 + ph)) * (u < 0.1 ? 0.45 + 5.5 * u : 1);
    A.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); B.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  addPoly(path, A.concat(B.reverse()));
}
/** a lanceolate blade (used for mugwort lobes); returns its spine */
function lance(path, x0, y0, ang, len, bend, hw) {
  const sp = spine(x0, y0, ang, len, bend, 12, 1.2), A = [], B = [], n = 14;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const w = Math.max(hw * 0.5 * (1 - s), hw * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.78)), 0.85));
    A.push(off(sp, s, w)); B.push(off(sp, s, -w));
  }
  addPoly(path, A.concat(B.reverse()));
  return sp;
}

// ───────────────────────── 蒲公英 dandelion ─────────────────────────
/** runcinate leaf: triangular lobes whose points sweep BACK toward the leaf base, growing toward a big arrow-shaped end lobe */
function dandelionLeaf(ink, veins, r, ang, len, bend, wid) {
  const sp = spine(0, 8, ang, len, bend, 30, 1.3);
  const N = len > 150 ? 5 : 4;
  const uA = 0.12, uB = 0.73, seg = (uB - uA) / N, rib = 2.6 + wid * 0.07;
  const side = () => {
    const o = [[0, 2.8]];
    for (let i = 0; i < N; i++) {
      const us = uA + seg * (i + r.range(-0.12, 0.12));
      const wl = wid * (0.46 + 0.5 * Math.pow((i + 0.6) / N, 0.8)) * r.range(0.9, 1.1);
      const back = seg * r.range(0.3, 0.5);
      o.push([us, rib]);                 // sinus, cut almost to the midrib
      o.push([us - back, wl]);           // lobe tip, swept backward
      if (i > 0 && r.chance(0.55)) {     // a small secondary tooth on the long forward edge
        const f = r.range(0.34, 0.54), um = L.lerp(us - back, us + seg, f), vm = L.lerp(wl, rib, f);
        o.push([um, vm - 2.2]); o.push([um - seg * 0.08, vm + 2.6]);
      }
    }
    o.push([uB, rib + 0.6]);
    o.push([uB - seg * r.range(0.2, 0.4), wid * r.range(1.0, 1.15)]);   // barbs of the end lobe
    o.push([uB + (1 - uB) * 0.52, wid * 0.55]);
    return o;
  };
  const A = side(), B = side(), pts = [];
  for (const [u, v] of A) pts.push(off(sp, u, v));
  pts.push(off(sp, 1, 0));
  for (let i = B.length - 1; i >= 0; i--) pts.push(off(sp, B[i][0], -B[i][1]));
  addPoly(ink, pts);
  const mp = []; for (let i = 0; i <= 26; i++) mp.push(off(sp, 0.1 + 0.82 * i / 26, 0));
  vein(veins, mp, 2.1, 0.55, r.range(0, 6));
}
function buildDandelion(seed, sc, scapes) {
  const r = L.rng(seed), ink = new Path2D(), veins = new Path2D();
  // [elevation above the ground °, length, half-width, droop] — the low pair lies on the soil, the others arch over it
  const defs = [[9, 186, 27, 0.16], [32, 172, 30, 0.5], [57, 138, 27, 0.55]];
  for (const sg of [1, -1]) for (const [el, len, wid, droop] of defs) {
    const e = L.deg(el + r.range(-3, 3) + (sg < 0 ? 2 : 0));
    dandelionLeaf(ink, veins, r, sg > 0 ? -e : -Math.PI + e, len * sc * r.range(0.93, 1.05), sg * droop * r.range(0.85, 1.15), wid * sc);
  }
  const tilt = r.range(-0.1, 0.1);
  dandelionLeaf(ink, veins, r, -Math.PI / 2 + tilt, 92 * sc, tilt * 2.5, 21 * sc);
  return { parts: [{ ink, veins, k: 1, shear: 0.012 }], scapes };
}
/** the clock: dark beaks radiating from the receptacle, each opening into a cream parachute; a faint cream glow */
function buildPuff(seed, R) {
  const m = 10, s = 2, half = R + m;
  const c = L.makeCanvas(half * 2 * s, half * 2 * s), g = c.getContext('2d');
  g.scale(s, s); g.translate(half, half);
  const r = L.rng(seed);
  g.fillStyle = L.radial(g, 0, 0, 0, R + 6, [[0, L.rgba(CREAM, 0.42)], [0.6, L.rgba(CREAM, 0.3)], [0.86, L.rgba(CREAM, 0.2)], [1, L.rgba(CREAM, 0)]]);
  g.beginPath(); g.arc(0, 0, R + 6, 0, TAU); g.fill();
  // reflexed bracts under the head
  g.fillStyle = INK;
  for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(sg * 0.5, 1.5); g.lineTo(sg * 8, 10); g.lineTo(sg * 3.4, 5.2); g.closePath(); g.fill(); }
  g.lineCap = 'round';
  const n = 46;
  for (let i = 0; i < n; i++) {
    const ang = ((i + r.range(-0.3, 0.3)) / n) * TAU;
    const fore = r() < 0.35 ? r.range(0.45, 0.8) : r.range(0.86, 1);   // seeds that point at the viewer look shorter
    const len = R * fore, cs = Math.cos(ang), sn = Math.sin(ang), bx = cs * len * 0.68, by = sn * len * 0.68;
    g.strokeStyle = L.rgba(INK, 0.82); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(cs * 4, sn * 4); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = L.rgba(CREAM, 0.9); g.lineWidth = 0.55;
    for (let j = 0; j < 6; j++) {
      const a2 = ang + L.lerp(-0.95, 0.95, j / 5), hl = len * 0.32 * (j === 0 || j === 5 ? 0.8 : 1);
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a2) * hl, by + Math.sin(a2) * hl); g.stroke();
    }
  }
  g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 5.4, 0, TAU); g.fill();
  for (let i = 0; i < 30; i++) {
    const ang = r.range(0, TAU), rad = R * Math.sqrt(r.range(0.08, 1));
    const lit = 0.5 + 0.5 * Math.cos(ang + 2.3);     // a touch brighter on the upper left
    g.fillStyle = L.rgba(CREAM, 0.45 + 0.5 * lit);
    g.beginPath(); g.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, r.range(0.5, 1.25), 0, TAU); g.fill();
  }
  c._half = half;
  return c;
}
/** a closed bud on its scape tip (drawn at the tip, pointing up the scape) */
function budPath() {
  const p = new Path2D();
  p.moveTo(-4.4, 2); p.bezierCurveTo(-7.4, -6, -4, -15, 0, -21); p.bezierCurveTo(4, -15, 7.4, -6, 4.4, 2); p.closePath();
  return p;
}

// ───────────────────────── 车前 plantain ─────────────────────────
let PNORM = 0;
const pprof = (s) => Math.pow(s, 0.55) * Math.pow(1 - s, 0.72);
/** broad ovate blade on a long petiole, with arcuate veins running base → tip */
function plantainLeaf(ink, veins, r, ang, len, bend, wid) {
  if (!PNORM) { for (let i = 1; i < 200; i++) PNORM = Math.max(PNORM, pprof(i / 200)); }
  const sp = spine(0, 8, ang, len, bend, 30, 1.2);
  const up = 0.36, ph = r.range(0, TAU), wav = r.range(0.02, 0.045);
  const prof = (s) => pprof(s) / PNORM;
  const A = [], B = [], n = 34;
  for (let i = 0; i <= 8; i++) { const u = (up * i) / 8, w = L.lerp(3.6, 2.8, i / 8); A.push(off(sp, u, w)); B.push(off(sp, u, -w)); }
  for (let i = 1; i <= n; i++) {
    const s = i / n, u = up + (1 - up) * s, pw = 2.8 * (1 - s);
    A.push(off(sp, u, Math.max(pw, wid * prof(s) * (1 + wav * Math.sin(s * 17 + ph)))));
    B.push(off(sp, u, -Math.max(pw, wid * prof(s) * (1 + wav * Math.sin(s * 15 + ph + 2)))));
  }
  addPoly(ink, A.concat(B.reverse()));
  const mid = []; for (let i = 0; i <= 24; i++) mid.push(off(sp, 0.1 + 0.86 * i / 24, 0));
  vein(veins, mid, 2.0, 0.55, ph);
  for (const k of [0.4, 0.72]) for (const sg of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 22; i++) { const s = 0.015 + 0.925 * i / 22; pts.push(off(sp, up + (1 - up) * s, sg * k * wid * prof(s))); }
    vein(veins, pts, 1.35, 0.4, ph + k * 9 + sg);
  }
}
/** an erect scape: bare below, the upper part a slender spike with a finely beaded outline */
function plantainSpike(ink, r, x0, lean, h, bend) {
  const sp = spine(x0, 8, -Math.PI / 2 + lean, h, bend, 40, 1.5);
  const u0 = r.range(0.36, 0.45), n = Math.round(h / 2.7), A = [], B = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n; let wa = 1.6, wb = 1.6;
    if (u > u0) {
      const s = (u - u0) / (1 - u0), env = Math.min(1, s / 0.06) * (1 - 0.5 * Math.pow(s, 2.2)), tip = Math.min(1, (1 - s) / 0.05);
      const bead = 1.4 * Math.min(1, s / 0.05) * (1 - 0.45 * s);
      wa = (1.6 + 2.7 * env + (i % 2 ? bead : 0)) * tip; wb = (1.6 + 2.7 * env + (i % 2 ? 0 : bead)) * tip;
    }
    A.push(off(sp, u, wa)); B.push(off(sp, u, -wb));
  }
  addPoly(ink, A.concat(B.reverse()));
}
function buildPlantain(seed, sc) {
  const r = L.rng(seed), ink = new Path2D(), veins = new Path2D(), spikes = new Path2D();
  // [elevation °, total length, blade half-width, droop]
  const defs = [[16, 138, 34, 0.24], [42, 152, 40, 0.34], [69, 138, 36, 0.3]];
  for (const sg of [1, -1]) for (const [el, len, wid, droop] of defs) {
    const e = L.deg(el + r.range(-5, 5) + (sg < 0 ? 4 : 0));
    plantainLeaf(ink, veins, r, sg > 0 ? -e : -Math.PI + e, len * sc * r.range(0.93, 1.06), sg * droop * r.range(0.8, 1.2), wid * sc * r.range(0.86, 1.04));
  }
  const sd = [[-14, -0.36, 150], [-7, -0.17, 190], [0, 0.0, 220], [6, 0.15, 200], [12, 0.33, 164]];
  for (const [x0, lean, h] of sd) plantainSpike(spikes, r, x0, lean + r.range(-0.04, 0.04), h * sc * r.range(0.96, 1.02), lean * 0.5 + r.range(-0.05, 0.05));
  return { parts: [{ ink: spikes, veins: null, k: 0.6, shear: 0.03 }, { ink, veins, k: 0.85, shear: 0.014 }] };
}

// ───────────────────────── 艾 mugwort ─────────────────────────
/** pinnately deep-cut leaf: 2–3 pairs of lanceolate side lobes (the big ones with a coarse tooth) and a three-pointed end lobe */
function mugwortLeaf(ink, veins, r, x0, y0, ang, len, bend) {
  const sp = spine(x0, y0, ang, len, bend, 18, 1.2);
  strip(ink, sp, 0, 0.74, 2.7, 2.1, 12);
  const pairs = len > 62 ? 3 : 2;
  for (let i = 0; i < pairs; i++) {
    const u = L.lerp(0.24, 0.62, i / (pairs - 1)) + r.range(-0.03, 0.03);
    for (const sg of [1, -1]) {
      const p = sAt(sp, u + sg * 0.025);
      const la = p.a + sg * L.deg(r.range(48, 60) - i * 7);
      const ll = len * (0.47 - 0.07 * i) * r.range(0.9, 1.1), lw = Math.max(3.6, ll * r.range(0.2, 0.25));
      const lsp = lance(ink, p.x, p.y, la, ll, -sg * r.range(0.15, 0.35), lw);
      if (ll > 22) { const q = sAt(lsp, r.range(0.34, 0.46)); lance(ink, q.x, q.y, q.a + sg * L.deg(42), ll * 0.46, 0, lw * 0.7); }
      if (ll > 36 && r.chance(0.7)) { const q = sAt(lsp, r.range(0.5, 0.6)); lance(ink, q.x, q.y, q.a - sg * L.deg(36), ll * 0.3, 0, lw * 0.55); }
    }
  }
  const p = sAt(sp, 0.58);
  lance(ink, p.x, p.y, p.a, len * 0.45, bend * 0.25, Math.max(4, len * 0.1));
  const q = sAt(sp, 0.75);
  for (const sg of [1, -1]) lance(ink, q.x, q.y, q.a + sg * L.deg(38), len * 0.2, 0, Math.max(2.8, len * 0.055));
  if (len > 50) { const mp = []; for (let i = 0; i <= 12; i++) mp.push(off(sp, 0.08 + 0.78 * i / 12, 0)); vein(veins, mp, 1.5, 0.45, len); }
}
function mugwortStem(ink, veins, r, x0, lean, h, side) {
  const sp = spine(x0, 12, -Math.PI / 2 + lean, h, lean * 0.5 + r.range(-0.06, 0.06), 40, 1.3);
  strip(ink, sp, 0, 1, 3.4, 1.2, 40);
  const sv = []; for (let i = 0; i <= 30; i++) sv.push(off(sp, 0.06 + 0.8 * i / 30, 0)); vein(veins, sv, 1.2, 0.4, h);
  let u = 0.18;
  while (u < 0.96) {
    const p = sAt(sp, u);
    const ll = L.lerp(112, 40, Math.pow(u, 0.9)) * Math.sqrt(h / 280) * r.range(0.92, 1.08);
    const la = p.a + side * L.deg(L.lerp(66, 40, u) + r.range(-5, 5));
    mugwortLeaf(ink, veins, r, p.x, p.y, la, ll, side * r.range(0.35, 0.6));
    side = -side; u += L.lerp(0.15, 0.09, u);
  }
  const p = sAt(sp, 1);
  for (const da of [-0.55, 0, 0.55]) lance(ink, p.x, p.y, p.a + da, 24, 0, 4);
}
function buildMugwort(seed, sc, flip) {
  const r = L.rng(seed), ink = new Path2D(), veins = new Path2D();
  const st = [[-26, -0.14, 232, -1], [22, 0.06, 286, 1], [54, 0.34, 150, 1]];
  for (const [x0, lean, h, side] of st) mugwortStem(ink, veins, r, flip * x0 * sc, flip * lean + r.range(-0.03, 0.03), h * sc * r.range(0.97, 1.02), flip * side);
  return { parts: [{ ink, veins, k: 0.6, shear: 0.02 }] };
}

// ───────────────────────── the row ─────────────────────────
function buildPlants(env) {
  const a = env.arc, P = [];
  const puffs = [buildPuff('s10puffA', 34), buildPuff('s10puffB', 26), buildPuff('s10puffC', 30)];
  const put = (pl, s, i) => { pl.th = s / a.R; pl.ph = i * 2.1; P.push(pl); };
  put(buildDandelion('s10d0', 1, [
    { x0: 3, h: 150, lean: 0.1, puff: puffs[0], amp: 5 },
    { x0: -5, h: 112, lean: -0.5, puff: puffs[1], amp: 3.4 },
    { x0: 8, h: 74, lean: 0.62, bud: true, amp: 1.8 }]), 0, 0);
  put(buildPlantain('s10p1', 1), -402, 1); put(buildPlantain('s10p2', 1), 396, 2);
  put(buildMugwort('s10m1', 1, -1), -756, 3); put(buildMugwort('s10m2', 1, 1), 750, 4);
  put(buildDandelion('s10d1', 0.96, [{ x0: 2, h: 176, lean: 0.3, puff: puffs[2], amp: 5 }, { x0: -4, h: 84, lean: -0.4, bud: true, amp: 2 }]), -1108, 5);
  put(buildDandelion('s10d2', 0.96, [{ x0: -2, h: 172, lean: -0.3, puff: puffs[2], amp: 5 }, { x0: 4, h: 88, lean: 0.44, bud: true, amp: 2 }]), 1102, 6);
  put(buildPlantain('s10p3', 1), -1462, 7); put(buildPlantain('s10p4', 1), 1456, 8);
  return P;
}

// ───────────────────────── the earth bank: soil marks only (the flat fill is drawn live) ─────────────────────────
/** a loaded dry brush dragged along the ridge: many bristles, each running out of paint and skipping in its own way */
function sweep(g, a, r, t0, t1, d0, width, alpha, seed) {
  const nb = Math.max(4, Math.round(width / 1.45)), nz = L.makeNoise(seed);
  const n = Math.max(24, Math.round(((t1 - t0) * a.R) / 7)), bow = r.range(-5, 5);
  g.strokeStyle = VEIN; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let j = 0; j < nb; j++) {
    const o = (j / (nb - 1) - 0.5) * width;
    const edge = 1 - Math.pow(Math.abs(o) / (width / 2), 2);          // the outer bristles carry less paint
    const s0 = r.range(0, 0.12) * (1.5 - edge), s1 = 1 - r.range(0, 0.3) * (1.6 - edge);
    g.lineWidth = r.range(0.9, 2.2);
    const al = alpha * r.range(0.5, 1);
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const load = (1 - 0.72 * u) * (0.5 + 0.5 * edge) + 0.5 * nz.n2(u * 13 + j * 0.27, j * 0.83);
      if (u >= s0 && u <= s1 && load > 0.2) {
        const q = a.pt(L.lerp(t0, t1, u), d0 + o * (1 - 0.4 * u * u) + bow * Math.sin(u * Math.PI) + 1.1 * nz.n2(u * 28, j * 1.7 + 40));
        if (!pen) { g.beginPath(); g.moveTo(q.x, q.y); pen = true; } else g.lineTo(q.x, q.y);
      } else if (pen) { g.globalAlpha = al; g.stroke(); pen = false; }
    }
    if (pen) { g.globalAlpha = al; g.stroke(); }
  }
  g.globalAlpha = 1;
}
function buildMarks(env) {
  const a = env.arc, span = a.span(PAD + 90);
  return L.makeLayer(PAD, (g) => {
    g.save(); a.clipBelow(g, -1);
    // slow uneven inking of the paper (very low contrast — it must still read as one flat colour)
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's10mottle', scale: 260, sx: 3.2, sy: 1, octaves: 4, res: 0.2, contrast: 1.2,
      ramp: [[0, L.rgba('#2a0710', 0.22)], [0.46, L.rgba('#2a0710', 0)], [0.62, L.rgba(VEIN, 0)], [1, L.rgba(VEIN, 0.1)]] }), -PAD, -PAD);
    // brush sweeps that follow the ridge: a thin one right under the edge, broader and sparser ones further down
    const r = L.rng('s10sweep');
    const rows = [[-15, 7, 0.8, 0.16, 0.34, 0.012, 0.05], [-62, 24, 0.62, 0.2, 0.42, 0.05, 0.2], [-140, 38, 0.52, 0.24, 0.5, 0.1, 0.3], [-255, 30, 0.42, 0.2, 0.44, 0.16, 0.4], [-395, 44, 0.34, 0.26, 0.5, 0.2, 0.45]];
    rows.forEach(([dr, w, al, lmin, lmax, gmin, gmax], k) => {
      let t = -span + r.range(-0.1, 0.1);
      while (t < span) {
        const t1 = t + r.range(lmin, lmax);
        const dir = (k % 2) ? [t1, t] : [t, t1];
        sweep(g, a, r, dir[0], dir[1], dr + r.range(-9, 9) * (k ? 1 : 0.2), w * r.range(0.8, 1.15), al, 's10sw' + k + '_' + Math.round(t * 1000));
        t = t1 + r.range(gmin, gmax);
      }
    });
    // soil grains: stippled thick under the ridge, thinning with depth, gathered in drifts
    const nz = L.makeNoise('s10soil'), rg = L.rng('s10grain'), HI = L.mix(VEIN, '#b0364a', 0.5);
    for (let i = 0; i < 16000; i++) {
      const th = rg.range(-span, span), d = 3 + 760 * Math.pow(rg(), 2.1);
      const drift = 0.5 + 0.5 * nz.fbm((th * a.R) / 170, d / 55, 3);
      const u1 = rg(), u2 = rg(), u3 = rg(), u4 = rg(), u5 = rg();
      if (u1 > L.lerp(1, 0.38, L.clamp(d / 480)) * (0.12 + 1.15 * drift * drift)) continue;
      const q = a.pt(th, -d), rad = L.lerp(0.7, 2.8, Math.pow(u2, 2.6)) * (d < 50 ? 0.85 : 1.1);
      g.globalAlpha = L.lerp(0.5, 1, u3);
      g.fillStyle = u4 < 0.16 ? HI : VEIN;
      g.beginPath(); g.ellipse(q.x, q.y, rad * L.lerp(1, 1.7, u5), rad, th + u5 * 3, 0, TAU); g.fill();
    }
    // a few bigger clods
    for (let i = 0; i < 130; i++) {
      const th = rg.range(-span, span), d = 26 + 640 * Math.pow(rg(), 1.4), q = a.pt(th, -d), sz = rg.range(3.5, 8.5), rot = rg.range(0, TAU);
      g.globalAlpha = rg.range(0.4, 0.8); g.fillStyle = VEIN;
      g.beginPath();
      const k = rg.int(5, 7);
      for (let j = 0; j < k; j++) { const aa = rot + (j / k) * TAU, rr = sz * rg.range(0.6, 1.1); g.lineTo(q.x + Math.cos(aa) * rr * 1.35, q.y + Math.sin(aa) * rr * 0.8); }
      g.closePath(); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
  });
}

export default {
  name: '百草剪影',
  tone: 'light',
  init(env) {
    S = {
      plants: buildPlants(env),
      marks: buildMarks(env),
      bud: budPath(),
      grain: L.grainTex(W + 64, H + 64, { seed: 's10grain', amount: 0.5 }),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-ROT, ROT, p), t = p * (env.dur || 0.56), lim = a.span(300);
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (const pl of S.plants) {
      const th = pl.th + rot;
      if (Math.abs(th) > lim) continue;
      const pt = a.pt(th, 0);
      const sway = Math.sin(TAU * (0.9 * t) - pl.th * 5 + pl.ph);     // one breath of wind travelling along the ridge
      if (pl.scapes) {
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(th * 0.6);
        for (const sc of pl.scapes) {
          const tx = sc.x0 + sc.lean * sc.h + sway * sc.amp, ty = -sc.h * Math.cos(sc.lean * 0.6);
          const cxm = sc.x0 + sc.lean * sc.h * 0.12, cym = -sc.h * 0.56;
          ctx.strokeStyle = INK; ctx.lineWidth = 2.7;
          ctx.beginPath(); ctx.moveTo(sc.x0, 9); ctx.quadraticCurveTo(cxm, cym, tx, ty); ctx.stroke();
          if (sc.puff) { const hf = sc.puff._half; ctx.drawImage(sc.puff, tx - hf, ty - hf, hf * 2, hf * 2); }
          else if (sc.bud) { ctx.save(); ctx.translate(tx, ty); ctx.rotate(Math.atan2(tx - cxm, -(ty - cym))); ctx.fillStyle = INK; ctx.fill(S.bud); ctx.restore(); }
        }
        ctx.restore();
      }
      for (const part of pl.parts) {
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(th * part.k); ctx.transform(1, 0, -part.shear * sway, 1, 0, 0);
        ctx.fillStyle = INK; ctx.fill(part.ink);
        if (part.veins) { ctx.fillStyle = VEIN; ctx.fill(part.veins); }
        ctx.restore();
      }
    }
    // the bank: one flat colour whose upper edge IS the arc, then the soil marks sliding with the row
    a.fillBelow(ctx, INK);
    L.blit(ctx, env, S.marks, { rot });
    const f = env.frame | 0;
    L.overlayGrain(ctx, S.grain, 0.09, 'overlay', (f * 37) % 64, (f * 53) % 64);
  },
};
