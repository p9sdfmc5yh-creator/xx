// p03 — 银锭与马蹄金: two large objects side by side on a cream chromolitho plate — a winged silver ingot (元宝) on the left,
// a horse-hoof gold with its filigree rim band on the right. Each is a height field rendered in an oblique (catalogue) view:
// height grid → front-to-back column march with a horizon → per-pixel lighting from the top-left → cast shadow splatted
// from the same height field. Slow leftward camera. No stamps, no characters anywhere.
//
// Everything per-pixel is computed in DEVICE pixels (L.pixelCanvas / L.getRaw), so the 4K master is native: the height grid has
// 2·SS samples per logical pixel, the march runs on a 2× supersampled device buffer, and the micro relief (silk threads, scratches,
// burnishing hairlines, dents) is drawn with ordinary canvas strokes into grey "relief" maps that feed the height field / the normals.
// Volume: the height field also shadows itself (the wings into the dish, the bezel onto the glass), cavities are occluded,
// highlights have a tight core inside a soft lobe, and the paper gets a contact seam + near + far cast shadow.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
let layer = null;

const TAU = Math.PI * 2;
const CY = 0.72, CH = 0.69;                       // oblique projection: screen y = OY + wy * CY - h * CH
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const L1 = nrm(-0.60, -0.30, 0.74);               // key light: from the top-left (and behind)
const L2 = nrm(-0.45, 0.62, 0.42);                // soft fill from the front-left so the near walls keep their form
const HV = nrm(L1[0], L1[1] + 0.69, L1[2] + 0.72);   // half vector with the view direction (0, .78, .62)
const HV2 = nrm(L2[0], L2[1] + 0.78, L2[2] + 0.62);  // …and the fill's
const LG = Math.hypot(L1[0], L1[1]), LDX = L1[0] / LG, LDY = L1[1] / LG, LRISE = L1[2] / LG;   // towards the lamp, per px on the ground plan
const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (v) => { const t = cl(v); return t * t * (3 - 2 * t); };
const frac = (v) => v - Math.floor(v);

// local value noise (0..1), deterministic
const NT = new Float32Array(65536);
{ const r = L.rng('p03noise'); for (let i = 0; i < 65536; i++) NT[i] = r(); }
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const r0 = (yi & 255) << 8, r1 = ((yi + 1) & 255) << 8, c0 = xi & 255, c1 = (xi + 1) & 255;
  const a = NT[r0 | c0], b = NT[r0 | c1], c = NT[r1 | c0], d = NT[r1 | c1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 1.62 - y * 1.22 + 17.3, x * 1.22 + y * 1.62 + 5.1) * 0.3 + vn(x * 3.1 + y * 2.7 + 31.7, y * 3.1 - x * 2.7 + 11.9) * 0.2;
// fine print grain (−0.8..0.8): two octaves, the upper one only resolves in the 4K master
const grain = (x, y, hp) => (vn(x * 1.3 + hp, y * 1.3 - hp * 0.7) - 0.5) + (vn(x * 3.1 - hp * 1.7, y * 3.1 + hp * 2.3) - 0.5) * 0.6;
// litho crayon stipple: sparse dark specks (0..1) that the shaders let through in the shadow tones only
const stipple = (x, y, hp) => sm((vn(x * 1.15 + hp * 0.9 + 13, y * 1.15 - hp * 0.6 + 5) - 0.6) / 0.12);
// round pits scattered on a jittered lattice: 0 outside, → 1 at a pit's centre (dens = share of cells that hold one: keep it low)
function pores(x, y, sc, dens, r0, r1) {
  const X = x * sc, Y = y * sc, xi = Math.floor(X), yi = Math.floor(Y); let m = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const k = (((yi + dj) & 255) << 8) | ((xi + di) & 255), rad = NT[(k * 13 + 101) & 65535];
    if (rad > dens) continue;
    const px = xi + di + NT[k], py = yi + dj + NT[(k * 7 + 13) & 65535];
    const d = Math.hypot(X - px, Y - py) / (r0 + r1 * rad / dens);
    if (d < 1) m = Math.max(m, 1 - d * d);
  }
  return m;
}

// ───────── vector-drawn micro relief ─────────
// draw(g, rnd) strokes greys over mid-grey with ordinary canvas paths (lighter = raised, darker = cut), so every line is rasterised at
// device resolution; the result is read back raw and sampled in LOGICAL units: at(x, y) → −1..1
function relief(w, h, seed, draw) {
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g, L.rng(seed));
  const im = L.getRaw(c), mw = im.width, mh = im.height, D = im.data, M = new Float32Array(mw * mh), k = mw / c.width;
  for (let i = 0, n = mw * mh; i < n; i++) M[i] = (D[i * 4] - 128) / 127;
  const xm = mw - 1.001, ym = mh - 1.001;
  const at = (x, y) => {
    let fx = x * k - 0.5, fy = y * k - 0.5;
    if (fx < 0) fx = 0; else if (fx > xm) fx = xm;
    if (fy < 0) fy = 0; else if (fy > ym) fy = ym;
    const i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, p = j * mw + i;
    return (M[p] * (1 - a) + M[p + 1] * a) * (1 - b) + (M[p + mw] * (1 - a) + M[p + mw + 1] * a) * b;
  };
  return { at };
}
const ink = (dark, a) => `rgba(${dark ? '0,0,0' : '255,255,255'},${a.toFixed(3)})`;
// a cut with the burr it throws up on one side
function nick(g, r, x, y, a, len, w, al) {
  const cx = Math.cos(a) * len / 2, cy = Math.sin(a) * len / 2, b = r.range(-0.1, 0.1) * len, mx = x - Math.sin(a) * b, my = y + Math.cos(a) * b;
  g.lineWidth = w; g.strokeStyle = ink(true, al);
  g.beginPath(); g.moveTo(x - cx, y - cy); g.quadraticCurveTo(mx, my, x + cx, y + cy); g.stroke();
  g.lineWidth = w * 0.75; g.strokeStyle = ink(false, al * 0.5);
  g.beginPath(); g.moveTo(x - cx + 0.6, y - cy + 0.7); g.quadraticCurveTo(mx + 0.6, my + 0.7, x + cx + 0.6, y + cy + 0.7); g.stroke();
}
// a soft dent with a raised lip on one side
function ding(g, r, x, y, rad, al) {
  g.fillStyle = L.radial(g, x, y, 0, rad, [[0, ink(true, al)], [0.55, ink(true, al * 0.6)], [1, ink(true, 0)]]);
  g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  g.lineWidth = Math.max(0.6, rad * 0.24); g.strokeStyle = ink(false, al * 0.55);
  g.beginPath(); g.arc(x, y, rad, 0.1, 1.6); g.stroke();
}

// ───────── silver ingot (元宝): waisted oval slab, a wing curling up at each end, dished face with casting ripples ─────────
const IA = 320, IB = 190, IWW = 1600, IWH = 264;
let IW = null, HW = null;                                        // wall reliefs, unrolled: u runs round the object, v = height (built in init)
const ingotBW = (u) => IB * (1 - 0.17 * Math.exp(-((u / 0.42) ** 2)));
function ingotQ(x, y) {
  const u = x / IA;
  return Math.pow(Math.abs(u) ** 2.5 + Math.abs(y / ingotBW(u)) ** 2.5, 0.4);
}
const ripW = (x, y) => fbm(x * 0.008 + 2, y * 0.008 + 7);
function ingotH(x, y) {
  if (Math.abs(x) >= IA) return 0;
  const q = ingotQ(x, y); if (q >= 1) return 0;
  const e = (1 - q) * IB;                                       // ≈ px in from the outline
  const endw = sm((Math.abs(x / IA) - 0.40) / 0.45);            // 0 in the middle → 1 at the two ends
  const lip = e < 24 ? 1 : Math.exp(-(((e - 24) / (30 + 14 * endw)) ** 2));
  let h = sm(e / 24) * (100 + (10 + 138 * endw * endw) * lip);
  h -= 34 * sm((e - 34) / 95);                                  // the face sinks towards the middle
  const w = ripW(x, y);
  const face = sm((e - 40) / 26);
  h += 1.9 * Math.sin(e * 0.46 + w * 9 + x * 0.012) * face;      // 丝纹: concentric cooling ripples
  h += 0.9 * Math.sin(e * 1.15 + w * 15) * face;
  h += (fbm(x * 0.03, y * 0.03) - 0.5) * 7 * sm(e / 30);         // lumpy cast surface
  h -= 3.4 * pores(x, y, 0.055, 0.2, 0.09, 0.15) * sm((e - 21) / 7) * (1 - 0.8 * face) * (1 - endw * sm((e - 30) / 14));   // a few scattered gas pits along the rim top
  return Math.max(0.05, h);
}
const ingotAmp = (x, y) => 1.2 * sm(((1 - ingotQ(x, y)) * IB - 14) / 12);        // plan relief only on the top faces
// plan relief of the face: silk threads on the ripple crests, hairline scratches, a few dents (world coordinates)
function ingotPlan(g, r) {
  const pt = (e, t) => {
    const q0 = 1 - Math.min(IB, Math.max(0, e)) / IB, c = Math.cos(t), s = Math.sin(t), u = q0 * Math.sign(c) * Math.abs(c) ** 0.8;
    return [u * IA, q0 * Math.sign(s) * Math.abs(s) ** 0.8 * ingotBW(u)];
  };
  const thread = (phase, wob) => {                              // the level line where the ripple phase is `phase`
    g.beginPath(); let pen = false, e = (phase - 4.5) / 0.46;
    for (let i = 0; i <= 420; i++) {
      const t = (i / 420) * TAU;
      for (let n = 0; n < 3; n++) { const p = pt(e, t); e = (phase - ripW(p[0], p[1]) * 9 - p[0] * 0.012) / 0.46; }
      const ee = e + (vn(i * 0.11 + wob, wob * 1.7) - 0.5) * 1.3;
      if (ee < 41 || ee > 184) { pen = false; continue; }
      const p = pt(ee, t); if (pen) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); pen = true; }
    }
    g.stroke();
  };
  for (let n = 2; n <= 15; n++) {
    const ph = Math.PI / 2 + TAU * n;
    g.setLineDash([r.range(60, 240), r.range(3, 14)]); g.lineDashOffset = r() * 300;
    g.lineWidth = r.range(0.9, 1.4); g.strokeStyle = ink(false, r.range(0.34, 0.58)); thread(ph, n * 3.1);
    g.setLineDash([r.range(50, 200), r.range(4, 18)]); g.lineDashOffset = r() * 300;
    g.lineWidth = r.range(0.7, 1.1); g.strokeStyle = ink(true, r.range(0.28, 0.48)); thread(ph + Math.PI, n * 5.3 + 1);
    for (const off of [-1.3, 1.25]) {
      g.setLineDash([r.range(30, 150), r.range(6, 30)]); g.lineDashOffset = r() * 300;
      g.lineWidth = r.range(0.6, 0.9); g.strokeStyle = ink(false, r.range(0.14, 0.26)); thread(ph + off + r.range(-0.2, 0.2), n * 7.7 + off);
    }
  }
  g.setLineDash([]);
  for (let i = 0; i < 100; i++) {
    nick(g, r, r.range(-300, 300), r.range(-175, 175), (r() < 0.9 ? -0.45 : 0.2) + r.range(-0.28, 0.28), r.range(8, 44) * (r() < 0.15 ? 2.2 : 1), r.range(0.5, 1.0), r.range(0.35, 0.8));
  }
  for (let i = 0; i < 14; i++) ding(g, r, r.range(-290, 290), r.range(-170, 170), r.range(1.4, 3.4), r.range(0.4, 0.7));
}
// wall relief (u round the ingot, v = height): pour strata that follow the contours, file marks, a few pits
function ingotWall(g, r) {
  for (let k = 0; k < 38; k++) {
    const y0 = r.range(3, 258), amp = r.range(0.8, 4.5), f = r.range(0.004, 0.013), ph = r() * 7;
    g.setLineDash([r.range(140, 460), r.range(6, 50)]); g.lineDashOffset = r() * 400;
    g.lineWidth = r.range(0.7, 1.8); g.strokeStyle = ink(r() < 0.65, r.range(0.14, 0.4));
    g.beginPath();
    for (let x = 0; x <= IWW; x += 10) { const y = y0 + amp * Math.sin(x * f + ph) + (vn(x * 0.04 + k * 3.7, k * 9.1) - 0.5) * 4; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  g.setLineDash([]);
  for (let i = 0; i < 260; i++) {
    nick(g, r, r() * IWW, r() * IWH, (r() < 0.8 ? 0.38 : -0.3) + r.range(-0.26, 0.26), r.range(4, 20) * (r() < 0.1 ? 2.2 : 1), r.range(0.5, 1.1), r.range(0.3, 0.75));   // scuffs at a shallow angle to the strata
  }
  for (let i = 0; i < 70; i++) ding(g, r, r() * IWW, r() * IWH, r.range(1.2, 3.2), r.range(0.45, 0.8));
}
// E: { lit (self-shadow 0..1), hs / hl (height blurred finely / broadly: minus hp → cavity), d (one relief texel, logical px) }
function shadeIngot(x, y, hp, dx, dy, o, E) {
  const gm = Math.hypot(dx, dy), sq = Math.sqrt(gm * gm + 1);
  let nx = -dx / sq, ny = -dy / sq, nz = 1 / sq;
  const wall = 1 - sm((nz - 0.25) / 0.45);                       // 1 on the steep sides
  let b0 = 0, lay = 0;
  if (wall > 0.04 && gm > 0.05) {                                // the unrolled wall relief tilts the normal
    const X = x / IA, Y = y / IB, u = (Math.atan2(X, Y) / TAU + 0.5) * IWW, v = hp + 2, d = E.d, A = 1.2 * wall;
    lay = ((vn(u * 0.012 + 3, hp * 0.16 + 9) - 0.5) * 0.15 + (vn(u * 0.035 + 7, hp * 0.55 + 2) - 0.5) * 0.07) * wall;   // pour layers: streaks of tone that follow the contours
    b0 = IW.at(u, v);
    const s = (-dy * Y / IA - dx * X / IB) < 0 ? -1 : 1, bu = (IW.at(u + d, v) - b0) / d * A * s, bv = (IW.at(u, v + d) - b0) / d * A;
    nx -= (-dy * bu + dx * bv / sq) / gm; ny -= (dx * bu + dy * bv / sq) / gm; nz -= bv * gm / sq;
    const l = 1 / Math.hypot(nx, ny, nz); nx *= l; ny *= l; nz *= l; b0 *= wall;
  }
  const lit = E.lit, cS = E.hs - hp, cL = E.hl - hp;
  const d1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]) * lit, d2 = Math.max(0, nx * L2[0] + ny * L2[1] + nz * L2[2]);
  const hd = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]);
  const m = fbm(x * 0.011 + 3, y * 0.011 + hp * 0.012), m2 = fbm(x * 0.06 + 9, (y + hp) * 0.06), m3 = vn(x * 0.31 + 40, (y + hp * 0.8) * 0.31 + 7);
  const q = ingotQ(x, y), e = (1 - q) * IB;
  // tarnish: grey-black in the dish and along the foot, patchy elsewhere; the rubbed high points stay bright, the cuts hold dirt
  const oxr = (m - 0.45) * 1.25 + 0.50 * sm((e - 40) / 80) + 0.30 * wall * sm((70 - hp) / 70) + (m2 - 0.5) * 0.3 - 0.5 * sm((hp - 120) / 80)
    + (m3 - 0.5) * 0.10 + 0.10 * cl(cS / 2) - 0.12 * cl(-cS / 2) - 0.12 * Math.min(0, b0);
  const ox = 0.88 * sm(oxr) + 0.12 * sm((oxr - 0.42) / 0.11);    // a soft bloom plus the slightly crisper edge of the tarnish layer…
  const seam = Math.exp(-(((oxr - 0.475) / 0.022) ** 2));        // …which ends in a thin darker lip
  const ao = (1 - 0.40 * cl(cL / 46)) * (1 - 0.28 * cl(cS / 2.5));
  const bounce = 0.07 * wall * sm((110 - hp) / 110) * Math.max(0, 0.45 * nx + 0.55 * ny + 0.2);   // light thrown back up by the paper
  const gr = 1 + grain(x, y, hp) * 0.07;
  let v = (0.28 + 0.68 * d1 + 0.24 * d2 + bounce) * ao * gr * (1 + 0.14 * Math.min(0, b0)) * (1 - 0.06 * seam) * (1 + lay) * (1 + 0.07 * wall * (sm(hp / 100) - 0.5)) + 0.05 * cl(-cS / 2);
  v *= (1 - 0.09 * stipple(x, y, hp) * cl((0.75 - v) / 0.4)) * (1 - 0.3 * sm((7 - hp) / 7));   // crayon specks in the shade; the very foot is occluded by the paper
  const r = 226 + (74 - 226) * ox, g = 224 + (74 - 224) * ox, b = 214 + (82 - 214) * ox;
  const s = (Math.pow(hd, 20) * 80 + Math.pow(hd, 90) * 130) * (1 - 0.7 * ox) * (0.25 + 0.75 * lit);   // soft lobe + tight core
  o[0] = r * v + s + 10 * (1 - v); o[1] = g * v + s + 6 * (1 - v); o[2] = b * v + s;      // shadows lean warm, like a litho tint stone
}

// ───────── horse-hoof gold (马蹄金): hollow tapering wall, slanting mouth, filigree band under the rim, weathered glass inlay ─────────
const HX = 275, HY = 240, HH = 235, RI = 0.77, RG = 0.635, NB = 96, HWW = 1500, HWH = 264;
function hoofH(x, y) {
  const ux = x / HX, uy = y / HY, r = Math.hypot(ux, uy); if (r >= 1) return 0;
  const th = Math.atan2(uy, ux), H = HH * (1 + 0.09 * ux);
  if (r > RI) {
    const t = (r - RI) / (1 - RI), f = 1 - Math.pow(t, 1.7);
    let h = H * f;
    const fb = (f - 0.74) / 0.22;
    if (fb > 0 && fb < 1) h += 3.2 * sm(fb / 0.06) * sm((1 - fb) / 0.06);   // the filigree band stands a little proud (its wires and granules are shaded in shadeHoof)
    h += 2.6 * Math.sin(f * 74) * sm((0.36 - f) / 0.1) * sm(f / 0.05);     // faint horizontal ripples near the foot
    h += (fbm(x * 0.02 + 50, y * 0.02) - 0.5) * 3 * sm(f / 0.1);
    return Math.max(0.05, h);
  }
  if (r > RG) {                                                            // the mouth rim: a rounded, lightly rope-twisted wire lying on top
    const t = (r - RG) / (RI - RG);
    return H + Math.pow(Math.sin(t * Math.PI), 0.75) * (7 + 0.55 * Math.sin(th * 110 + t * 16));
  }
  const t = r / RG;                                                        // the inlay, set a little below the rim, gently domed
  return H - 17 * sm((1 - t) / 0.07) + 6 * (1 - t * t) + (fbm(x * 0.05, y * 0.05) - 0.5) * 1.7;
}
const hoofAmp = (x, y) => (Math.hypot(x / HX, y / HY) < RG - 0.02 ? 0.8 : 0);
// plan relief of the glass: handling hairlines and a few long polishing arcs (world coordinates)
function hoofPlan(g, r) {
  for (let i = 0; i < 64; i++) {
    const a0 = r() * TAU, rr = Math.sqrt(r()) * (RG - 0.03);
    nick(g, r, Math.cos(a0) * rr * HX, Math.sin(a0) * rr * HY, -0.7 + r.range(-0.22, 0.22), r.range(8, 46) * (r() < 0.12 ? 2.2 : 1), r.range(0.5, 0.9), r.range(0.18, 0.5));   // all wiped one way
  }
  for (let i = 0; i < 10; i++) {
    const rr = r.range(0.15, RG - 0.05), a = r() * TAU;
    g.lineWidth = r.range(0.6, 0.9); g.strokeStyle = ink(true, r.range(0.2, 0.36));
    g.beginPath(); g.ellipse(r.range(-12, 12), r.range(-12, 12), HX * rr, HY * rr, 0, a, a + r.range(0.3, 1.1)); g.stroke();
  }
}
// wall relief (u round the cup, v = height): burnishing hairlines that run round it, scratches, a few soft dents
function hoofWall(g, r) {
  for (let k = 0; k < 110; k++) {
    const y0 = r.range(2, 262), amp = r.range(0.3, 1.6), f = r.range(0.003, 0.009), ph = r() * 7;
    g.setLineDash([r.range(80, 420), r.range(10, 120)]); g.lineDashOffset = r() * 500;
    g.lineWidth = r.range(0.5, 1.0); g.strokeStyle = ink(r() < 0.6, r.range(0.10, 0.30));
    g.beginPath();
    for (let x = 0; x <= HWW; x += 20) { const y = y0 + amp * Math.sin(x * f + ph); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  g.setLineDash([]);
  for (let i = 0; i < 190; i++) nick(g, r, r() * HWW, r() * HWH, r.range(-0.5, 0.5), r.range(5, 30) * (r() < 0.1 ? 2.5 : 1), r.range(0.5, 1.0), r.range(0.3, 0.75));   // at a shallow angle to the hairlines
  for (let i = 0; i < 16; i++) ding(g, r, r() * HWW, r.range(10, 170), r.range(2.5, 6), r.range(0.2, 0.36));
}
// the filigree band on the unrolled wall (a: angle round the cup, fb: 0..1 up the band, P: granule pitch in px): three rope-twisted
// wires and two rows of round granules. → BD[0] height above the wall, BD[1] / BD[2] its slope along / up the wall, BD[3] 1 down between the elements
const BD = [0, 0, 0, 0], BL = 54.5;
function band(a, fb, P) {
  const sv = fb * BL, arc = P * NB / TAU; let b = 0, gu = 0, gv = 0, rad = 3;
  for (let k = 0; k < 3; k++) {                                            // wires: half-round; the middle one a heavier twisted pair
    const c = k === 0 ? 3.8 : k === 1 ? 27.2 : 50.7, rw = k === 1 ? 4.3 : 2.7, dv = sv - c;
    if (dv > -rw && dv < rw) {
      const z = Math.sqrt(rw * rw - dv * dv), nw = k === 1 ? 150 : 232, kv = k === 1 ? 0.75 : k ? -1.1 : 1.1, am = (k === 1 ? 0.95 : 0.5) * z / rw;
      const ph = a * nw + dv * kv;
      b = z + am * Math.sin(ph); gu = am * Math.cos(ph) * nw / arc; gv = -dv / Math.max(z, 0.3 * rw) + am * Math.cos(ph) * kv; rad = rw;
    }
  }
  for (let k = 0; k < 2; k++) {                                            // granules, the upper row half a step along
    const du = (frac(a * NB / TAU + k * 0.5) - 0.5) * P, dv = sv - (k ? 39.6 : 14.7), rho = Math.min(0.455 * P, 6.5), d2 = (du * du + dv * dv) / (rho * rho);
    if (d2 < 1) { const z = rho * Math.sqrt(1 - d2), zc = Math.max(z, 0.28 * rho); b = z; gu = -du / zc; gv = -dv / zc; rad = rho; }
  }
  BD[0] = b; BD[1] = gu; BD[2] = gv; BD[3] = 1 - sm(b / (0.5 * rad));
}
function shadeHoof(x, y, hp, dx, dy, o, E) {
  const gm = Math.hypot(dx, dy), sq = Math.sqrt(gm * gm + 1);
  let nx = -dx / sq, ny = -dy / sq, nz = 1 / sq;
  const ux = x / HX, uy = y / HY, r = Math.hypot(ux, uy), lit = E.lit, cS = E.hs - hp, cL = E.hl - hp, gr = grain(x, y, hp);
  if (r < RG - 0.012 && hp > HH * 0.6) {                                   // weathered glass: chalky grey-green, still half polished
    const t = r / RG, m = fbm(x * 0.02 + 8, y * 0.02 + 3), ir = fbm(x * 0.013 + 60, y * 0.013 + 4);
    const d1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]) * lit, d2 = Math.max(0, nx * L2[0] + ny * L2[1] + nz * L2[2]);
    const vx = nx + ux / RG * 0.72, vy = ny + uy / RG * 0.72;                // the gloss sees a fuller cabochon curve than the height field holds
    const hv = Math.max(0, (vx * HV[0] + vy * HV[1] + nz * HV[2]) / Math.hypot(vx, vy, nz));
    const ao = (1 - 0.45 * cl(cL / 12)) * (1 - 0.3 * cl(cS / 2.5));
    const away = Math.max(0, -(ux * LDX + uy * LDY) / (r + 1e-4));
    const glow = 0.07 * sm((t - 0.5) / 0.42) * away * away;                // light that entered the glass gathers on the side away from the lamp
    const cr = t + (m - 0.5) * 0.3 + (vn(x * 0.2 + 3, y * 0.2 + 8) - 0.5) * 0.02, crust = sm((cr - 0.80) / 0.07);   // a chalkier weathering skin creeps in from the bezel…
    const edge = Math.exp(-(((cr - 0.80) / 0.012) ** 2));                  // …and ends in a faint darker line
    const v = (0.44 + 0.50 * d1 + 0.15 * d2) * ao * (0.86 + 0.28 * m) * (1 + gr * 0.05) * (1 + 0.06 * crust) * (1 - 0.035 * edge) + glow;
    const sp = (Math.pow(hv, 12) * 22 + Math.pow(hv, 140) * 95 * (0.55 + 0.45 * sm((m - 0.3) / 0.35))) * (0.3 + 0.7 * lit) * (1 - 0.6 * crust);   // soft lobe + tight core
    const k = (ir - 0.5) * 2;
    o[0] = (196 + 14 * k) * v + sp; o[1] = (208 + 2 * k) * v + sp; o[2] = (186 - 16 * k) * v + sp * 0.96; return;
  }
  let b0 = 0, occ = 0, f = hp / (HH * (1 + 0.09 * ux));
  if (r > RI && gm > 0.05) {
    f = 1 - Math.pow((r - RI) / (1 - RI), 1.7);                            // height fraction of the bare wall here
    const fb = (f - 0.74) / 0.22, a = Math.atan2(ux, uy); let bu, bv;
    if (fb > 0 && fb < 1) {                                                // the filigree: normals of real wires and granules
      band(a, fb, r * Math.hypot(HX * Math.cos(a), HY * Math.sin(a)) * TAU / NB);
      bu = BD[1]; bv = BD[2]; occ = BD[3];
    } else {                                                               // elsewhere the unrolled wall relief tilts the normal
      const wgt = sm((gm - 0.3) / 0.8), u = (a / TAU + 0.5) * HWW, v = hp + 2, d = E.d;
      b0 = HW.at(u, v); bu = (HW.at(u + d, v) - b0) / d * wgt; bv = (HW.at(u, v + d) - b0) / d * wgt; b0 *= wgt;
    }
    nx -= (-dy * bu + dx * bv / sq) / gm; ny -= (dx * bu + dy * bv / sq) / gm; nz -= bv * gm / sq;
    const l = 1 / Math.hypot(nx, ny, nz); nx *= l; ny *= l; nz *= l;
  }
  const d1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]) * lit, d2 = Math.max(0, nx * L2[0] + ny * L2[1] + nz * L2[2]);
  const hd = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]);
  const m = fbm(x * 0.03 + 21, (y + hp) * 0.03);
  let v = 0.10 + 0.74 * d1 + 0.36 * d2 + (m - 0.5) * 0.12 + gr * 0.06;
  // a soft sheen band running down the left flank of the polished wall, as on a turned metal cup, with a bright core inside it
  const wl = 1 - sm((nz - 0.5) / 0.25), ws = 1 - sm((nz - 0.45) / 0.2), fl = Math.max(0, -nx * 0.8645 + ny * 0.5026);
  const nxy = Math.sqrt(1.0001 - nz * nz), side = Math.pow(fl, 6) * 0.46 * ws, core = Math.pow(Math.min(1, fl / nxy), 90) * ws;
  const fl2 = Math.max(0, nx * 0.5 + ny * 0.866) / nxy, side2 = Math.pow(Math.min(1, fl2), 50) * 0.09 * ws;   // a second, thinner reflection on the right
  v -= (0.24 * sm((ux + 0.15) / 0.9) + 0.10 * sm((46 - hp) / 46)) * wl;    // the wall turns away from the light towards the right, and darkens at the foot
  v += 0.11 * sm((ux - 0.70) / 0.25) * wl;                                 // …then picks up light thrown back by the paper at the far edge
  v -= 0.09 * sm((f - 0.62) / 0.09) * (1 - sm((f - 0.735) / 0.012)) * wl;  // the band shades the wall just below it
  v -= 0.22 * cl(cL / 40) + 0.26 * cl(cS / 3.5) + 0.26 * occ;              // cavities, and the creases between the granules
  v += 0.07 * cl(-cS / 3.5) + 0.15 * Math.min(0, b0);                      // rubbed high points; dirt in the cuts
  v += (vn(x * 0.02 + y * 0.011 + 5, hp * 0.21 + 3) - 0.5) * 0.07 * wl;      // burnishing streaks round the wall
  v -= 0.05 * stipple(x, y, hp) * cl((0.6 - v) / 0.4);
  v = cl(v + side + side2);
  const lk = 0.3 + 0.7 * lit, hd2 = Math.max(0, nx * HV2[0] + ny * HV2[1] + nz * HV2[2]);
  const sp = Math.pow(hd, 34) * lk + Math.pow(hd2, 30) * 0.45, spc = Math.pow(hd, 160) * lk + core * 0.8 + Math.pow(hd2, 200) * 0.5;   // soft lobes + tight cores
  // dark umber → red gold → bright yellow
  let R, G, B;
  if (v < 0.35) { const t = v / 0.35; R = 88 + (178 - 88) * t; G = 46 + (104 - 46) * t; B = 12 + (24 - 12) * t; }
  else if (v < 0.68) { const t = (v - 0.35) / 0.33; R = 178 + (226 - 178) * t; G = 104 + (164 - 104) * t; B = 24 + (46 - 24) * t; }
  else { const t = (v - 0.68) / 0.32; R = 226 + (252 - 226) * t; G = 164 + (224 - 164) * t; B = 46 + (128 - 46) * t; }
  o[0] = R + sp * 60 + spc * 50; o[1] = G + sp * 80 + spc * 70; o[2] = B + sp * 110 + spc * 110;
}

// ───────── oblique height-field renderer ─────────
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = 0;
    for (let x = -r; x <= r; x++) s += src[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let x = 0; x < w; x++) { tmp[o + x] = s / n; const a = x + r + 1, b = x - r; s += src[o + (a >= w ? w - 1 : a)] - src[o + (b < 0 ? 0 : b)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / n; const a = y + r + 1, b = y - r; s += tmp[(a >= h ? h - 1 : a) * w + x] - tmp[(b < 0 ? 0 : b) * w + x]; }
  }
  return out;
}
function renderObj({ W, Hh, OY, xr, y0, y1, hf, shade, plan, amp, seed }) {
  const q = L.SS, gd = 2 * q;                                    // height samples per logical px: 2 per device px
  const lw = 2 * xr + 5, lh = y1 - y0 + 5, gx0 = -xr - 2, gy0 = y0 - 2, gw = lw * gd, gh = lh * gd;
  const P = relief(lw, lh, seed, (g, r) => { g.translate(-gx0, -gy0); plan(g, r); });
  const G0 = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) { const y = gy0 + j / gd; for (let i = 0; i < gw; i++) G0[j * gw + i] = hf(gx0 + i / gd, y); }
  const G = new Float32Array(G0);
  for (let j = 1; j < gh - 1; j++) {                             // add the plan relief where the face is not steep (on a wall it would smear down the slope)
    const y = gy0 + j / gd;
    for (let i = 1; i < gw - 1; i++) {
      const k = j * gw + i, h = G0[k]; if (h <= 0.02) continue;
      const x = gx0 + i / gd, a = amp(x, y); if (a <= 0) continue;
      const w = 1 - sm((Math.hypot(G0[k + 1] - G0[k - 1], G0[k + gw] - G0[k - gw]) * gd * 0.5 - 0.6) / 1.0);
      if (w > 0) G[k] = Math.max(0.05, h + a * w * P.at(x - gx0, y - gy0));
    }
  }
  const hAt = (x, y) => {
    const fx = (x - gx0) * gd, fy = (y - gy0) * gd, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= gw - 1 || j >= gh - 1) return 0;
    const a = fx - i, b = fy - j, k = j * gw + i;
    return G[k] * (1 - a) * (1 - b) + G[k + 1] * a * (1 - b) + G[k + gw] * (1 - a) * b + G[k + gw + 1] * a * b;
  };
  // one-per-logical-px copies for the broad effects: cavity (blurred height) and the object's shadow on itself
  const G1 = new Float32Array(lw * lh), off = (gd - 1) / (2 * gd); let maxH = 0;
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
    let s = 0;
    for (let v = 0; v < gd; v++) for (let u = 0; u < gd; u++) s += G[(j * gd + v) * gw + i * gd + u];
    s /= gd * gd; G1[j * lw + i] = s; if (s > maxH) maxH = s;
  }
  const HS = boxBlur(G1, lw, lh, 2), HL = boxBlur(boxBlur(G1, lw, lh, 8), lw, lh, 8);
  const h1 = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y); if (i < 0 || j < 0 || i >= lw - 1 || j >= lh - 1) return 0;
    const a = x - i, b = y - j, k = j * lw + i;
    return (G1[k] * (1 - a) + G1[k + 1] * a) * (1 - b) + (G1[k + lw] * (1 - a) + G1[k + lw + 1] * a) * b;
  };
  let LIT = new Float32Array(lw * lh).fill(1);
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
    const h0 = G1[j * lw + i]; if (h0 <= 0.02) continue;
    let lit = 1;
    for (let s = 2.5; ; s += 1 + s * 0.06) {                     // walk towards the lamp; the penumbra widens with the distance to the occluder
      const rh = h0 + s * LRISE; if (rh >= maxH) break;
      const v = 0.5 + (rh - h1(i + LDX * s, j + LDY * s)) / (0.2 * s + 0.6);
      if (v < lit) { lit = v; if (lit <= 0) { lit = 0; break; } }
    }
    LIT[j * lw + i] = lit;
  }
  LIT = boxBlur(LIT, lw, lh, 1);
  const xm = lw - 1.001, ym = lh - 1.001;
  const aux = (x, y, E) => {
    let fx = x - gx0 - off, fy = y - gy0 - off;
    if (fx < 0) fx = 0; else if (fx > xm) fx = xm;
    if (fy < 0) fy = 0; else if (fy > ym) fy = ym;
    const i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, k = j * lw + i, w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
    E.lit = LIT[k] * w00 + LIT[k + 1] * w10 + LIT[k + lw] * w01 + LIT[k + lw + 1] * w11;
    E.hs = HS[k] * w00 + HS[k + 1] * w10 + HS[k + lw] * w01 + HS[k + lw + 1] * w11;
    E.hl = HL[k] * w00 + HL[k + 1] * w10 + HL[k + lw] * w01 + HL[k + lw + 1] * w11;
  };
  const spr = L.pixelCanvas(W, Hh, (data, pw, ph, dq) => {
    const ss = 2, R = dq * ss, cw = pw * ss, ch = ph * ss, step = 0.5 / R, dn = 1 / gd, nSteps = Math.round((y1 - y0) / step);
    const D = new Uint8ClampedArray(cw * ch * 4), o = [0, 0, 0], E = { lit: 1, hs: 0, hl: 0, d: 1 / dq };
    const c0 = Math.max(0, Math.floor((W / 2 - xr) * R)), c1 = Math.min(cw - 1, Math.ceil((W / 2 + xr) * R));
    for (let cx = c0; cx <= c1; cx++) {
      const wx = (cx + 0.5) / R - W / 2;
      if (wx < -xr || wx > xr) continue;
      let hor = null, prevH = 0, prevSy = 0;
      for (let n = 0; n <= nSteps; n++) {
        const wy = y1 - n * step, h = hAt(wx, wy);
        if (h <= 0.02) { prevH = 0; prevSy = (OY + wy * CY) * R; continue; }
        const sy = (OY + wy * CY - h * CH) * R;
        if (hor === null) { hor = (OY + (wy + step) * CY) * R; prevSy = hor; prevH = 0; }
        if (sy < hor) {
          const top = Math.max(0, Math.ceil(sy)), bot = Math.min(ch - 1, Math.ceil(hor) - 1);
          if (bot >= top) {
            const dx = (hAt(wx + dn, wy) - hAt(wx - dn, wy)) / (2 * dn), dy = (hAt(wx, wy + dn) - hAt(wx, wy - dn)) / (2 * dn);
            aux(wx, wy, E);
            const span = prevSy - sy;
            for (let py = top; py <= bot; py++) {
              const t = span > 0.001 ? cl((prevSy - py) / span) : 1;
              shade(wx, wy, prevH + (h - prevH) * t, dx, dy, o, E);
              const k = (py * cw + cx) * 4; D[k] = o[0]; D[k + 1] = o[1]; D[k + 2] = o[2]; D[k + 3] = 255;
            }
          }
          hor = sy;
        }
        prevH = h; prevSy = sy;
      }
    }
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {    // box-filter the supersampled buffer down to device pixels
      let r = 0, g = 0, b = 0, a = 0;
      for (let v = 0; v < ss; v++) {
        let k = ((j * ss + v) * cw + i * ss) * 4;
        for (let u = 0; u < ss; u++, k += 4) if (D[k + 3]) { r += D[k]; g += D[k + 1]; b += D[k + 2]; a++; }
      }
      if (a) { const k = (j * pw + i) * 4; data[k] = r / a; data[k + 1] = g / a; data[k + 2] = b / a; data[k + 3] = (a * 255) / (ss * ss); }
    }
  });
  // shadows on the paper, from the same height field: a point at height h lands at (x + .81 h, y + .41 h).
  // shadow = everything; near = what the low parts cast (still sharp, fading out with height); foot = the footprint itself
  const mk = () => { const c = L.makeCanvas(W, Hh), g = c.getContext('2d'); g.fillStyle = '#2a1a0c'; return [c, g]; };
  const [sh, sg] = mk(), [nr, ng] = mk(), [ft, fg] = mk(), kx = -LDX / LRISE, ky = -LDY / LRISE;
  for (let j = 0; j < lh; j += 2) for (let i = 0; i < lw; i += 2) {
    const h = G1[j * lw + i]; if (h <= 0.02) continue;
    const x = gx0 + i + off, y = gy0 + j + off, sx = W / 2 + x + kx * h - 1.5, sy = OY + (y + ky * h) * CY - 1.5;
    sg.fillRect(sx, sy, 4, 3.5);
    if (h < 64) { ng.globalAlpha = (1 - h / 64) ** 2; ng.fillRect(sx, sy, 4, 3.5); }
    fg.fillRect(W / 2 + x - 1.5, OY + y * CY - 1.5, 4, 3.5);
  }
  return { spr, shadow: sh, near: nr, foot: ft };
}

function build() {
  const N = 1400, c = L.makeCanvas(N, N), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#efe8d6', tone: '#8a6a3a', seed: 'p03paper', size: N, fiber: 0.55, stain: 0.28, foxing: 0.22, edge: 0.12 }), 0, 0);
  const tex = L.paperTex(1130, 640, { base: '#e9dfc8', seed: 'p03tooth', tone: '#7a5c34', fiber: 0.7, stain: 0.4, grain: 0.35 });   // sprite-sized: never stretched
  IW = relief(IWW, IWH, 'p03iw', ingotWall); HW = relief(HWW, HWH, 'p03hw', hoofWall);
  const put = (ob, W, Hh, OY, px, py, seed) => {
    K.soak(ob.spr, tex, 0.30); K.wear(ob.spr, { seed, amount: 0.10, size: 1.3 });
    const x = px - W / 2, y = py - OY;
    g.save(); g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.26; g.drawImage(L.blurred(ob.shadow, 18), x, y);       // far penumbra
    g.globalAlpha = 0.30; g.drawImage(L.blurred(ob.shadow, 6.5), x, y);      // body of the cast shadow
    g.globalAlpha = 0.28; g.drawImage(L.blurred(ob.near, 2.2), x, y);        // close to the foot it is still sharp
    g.globalAlpha = 0.40; g.drawImage(L.blurred(ob.foot, 3), x + 1.2, y + 1.4);   // contact seam hugging the foot
    g.restore();
    g.save(); g.shadowColor = 'rgba(52,32,14,0.55)'; g.shadowBlur = 2.2; g.shadowOffsetX = 0.6; g.shadowOffsetY = 0.8;   // soft keyline
    g.drawImage(ob.spr, x, y); g.restore();
  };
  const ing = renderObj({ W: 1130, Hh: 560, OY: 335, xr: 322, y0: -195, y1: 195, hf: ingotH, shade: shadeIngot, plan: ingotPlan, amp: ingotAmp, seed: 'p03ip' });
  put(ing, 1130, 560, 335, 475, 655, 'p03w1');
  const hoof = renderObj({ W: 1060, Hh: 640, OY: 375, xr: 277, y0: -243, y1: 243, hf: hoofH, shade: shadeHoof, plan: hoofPlan, amp: hoofAmp, seed: 'p03hp' });
  put(hoof, 1060, 640, 375, 1055, 875, 'p03w2');
  return c;
}

export default {
  name: '银锭与马蹄金',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.03, x0: -16, y0: 4, x1: 26, y1: -4 });   // camera eases left: the plate slides right
  },
};
