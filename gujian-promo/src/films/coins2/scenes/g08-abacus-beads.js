// g08 — 算珠: dark-brown turned-wood abacus beads on ochre paper, laid out as the coin glyph.
// Ring row: beads lying flat (hole up) mixed with beads standing on edge (bicone profile, ridge touching the outer circle);
// square row: flat beads lined along the four straight sides of the hole; a short filler row on the axes.
// Every bead is shaded per pixel from its own height profile (light from the top-left), then gets grain pores and scratches.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = c01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixn = (a, b, t) => a + (b - a) * t;
function norm3(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
const LIGHT = norm3(-0.50, -0.62, 0.60);
const HALF = norm3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);

function vnoise(seed) {
  const r = L.rng(seed); const P = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) P[i] = r();
  const h = (a, b) => P[((a * 73856093) ^ (b * 19349663)) & 4095];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return mixn(mixn(h(xi, yi), h(xi + 1, yi), sx), mixn(h(xi, yi + 1), h(xi + 1, yi + 1), sx), sy);
  };
}

function lit(out, nx, ny, nz, ar, ag, ab, gloss, occ) {
  const d = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  const h = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
  const k = (0.27 + 0.95 * d) * occ;
  const sp = (Math.pow(h, 52) * 0.95 + Math.pow(h, 9) * 0.12) * gloss * occ;
  out[0] = ar * k + 255 * sp; out[1] = ag * k + 238 * sp; out[2] = ab * k + 205 * sp;
}

// dark hardwood: broad growth bands bent by noise + fine fibres running along the grain
function makeWood(seed) {
  const r = L.rng(seed); const nz = vnoise(seed + 'n');
  const a = r.range(0, Math.PI), ca = Math.cos(a), sa = Math.sin(a);
  const f = r.range(0.24, 0.38), ph = r.range(0, 10), tint = r.range(-1, 1), val = r.range(0.88, 1.12);
  const dk = [50 + 6 * tint, 27 + 3 * tint, 15], lt = [124 + 10 * tint, 72 + 5 * tint, 37];
  const fn = (x, y, out) => {
    const u = x * ca + y * sa, v = -x * sa + y * ca;
    const band = 0.5 + 0.5 * Math.sin(v * f + ph + 4.5 * nz(u * 0.018 + 7, v * 0.05 + 3));
    const m = 0.5 * band * band + 0.32 * nz(u * 0.07 + 20, v * 1.1 + 9) + 0.18 * nz(u * 0.25 + 50, v * 2.3 + 1);
    out[0] = mixn(dk[0], lt[0], m) * val; out[1] = mixn(dk[1], lt[1], m) * val; out[2] = mixn(dk[2], lt[2], m) * val;
  };
  fn.angle = a;
  return fn;
}

// pores (short dark dashes along the grain), a few pale hairline scratches, one or two small dents
function micro(c, rad, seed, grainAng) {
  const g = c.getContext('2d'), r = L.rng(seed + 'm'), w = c.width;
  g.save(); g.translate(w / 2, w / 2); g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round';
  const ca = Math.cos(grainAng), sa = Math.sin(grainAng);
  for (let i = 0, n = r.int(26, 40); i < n; i++) {
    const x = r.range(-rad, rad), y = r.range(-rad, rad), len = r.range(2, 7);
    g.strokeStyle = `rgba(22,10,4,${r.range(0.16, 0.34).toFixed(3)})`; g.lineWidth = r.range(0.6, 1.1);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + ca * len, y + sa * len); g.stroke();
  }
  for (let i = 0, n = r.int(4, 8); i < n; i++) {
    const x = r.range(-rad, rad) * 0.8, y = r.range(-rad, rad) * 0.8, len = r.range(6, 20), a = r() * TAU;
    g.strokeStyle = `rgba(232,196,150,${r.range(0.10, 0.22).toFixed(3)})`; g.lineWidth = r.range(0.5, 0.9);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.2) * len * 0.5, y + Math.sin(a + 0.2) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0, n = r.int(1, 3); i < n; i++) {
    const a = r() * TAU, d = rad * r.range(0.5, 0.9), x = Math.cos(a) * d, y = Math.sin(a) * d, s = r.range(1.2, 2.4);
    g.fillStyle = 'rgba(18,8,3,0.42)'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(240,205,160,0.30)'; g.beginPath(); g.ellipse(x + s * 0.5, y + s * 0.6, s * 0.7, s * 0.3, 0.7, 0, TAU); g.fill();
  }
  g.restore();
  return c;
}

// bead lying flat, seen down its hole: flat lathe step round the hole, convex cone falling to the ridge
function topBead(rad, seed) {
  const w = Math.ceil(rad * 2 + 6), c = L.makeCanvas(w, w), g = c.getContext('2d');
  const img = g.createImageData(w, w), d = img.data;
  const wood = makeWood(seed), r = L.rng(seed + 't');
  const rh = rad * r.range(0.22, 0.26), lph = r.range(0, 6), col = [0, 0, 0], o = [0, 0, 0];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - w / 2, dy = y + 0.5 - w / 2, rr = Math.hypot(dx, dy);
    if (rr > rad + 1) continue;
    const i = (y * w + x) * 4;
    const uu = Math.max(0, (rr - rh) / (rad - rh));
    let k = mixn(-1.5, 0.05, sstep(0.0, 0.08, uu));
    k = mixn(k, 0.40 + 2.0 * Math.pow(Math.max(0, (uu - 0.15) / 0.85), 2.6), sstep(0.13, 0.21, uu));
    const il = 1 / Math.hypot(k, 1), inr = rr > 0.001 ? 1 / rr : 0;
    wood(dx, dy, col);
    const lathe = 1 + 0.07 * Math.sin(rr * 1.7 + lph) + 0.04 * Math.sin(rr * 4.1 + lph * 2);
    const occ = 1 - 0.38 * sstep(0.86, 1.0, uu);
    lit(o, k * dx * inr * il, k * dy * inr * il, il, col[0] * lathe, col[1] * lathe, col[2] * lathe, 1, occ);
    if (rr < rh + 0.5) {                                         // the bore: lit wall on the lower right, shadowed paper at the bottom
      const q = rr / rh, t = Math.max(0, (dx * 0.63 + dy * 0.77) / rh);
      const wall = sstep(0.3, 1, q) * t, deep = sstep(0.7, 0, q);
      const hb = c01(rh - rr + 0.5);
      o[0] = mixn(o[0], 24 + 118 * wall + 44 * deep, hb); o[1] = mixn(o[1], 13 + 76 * wall + 28 * deep, hb); o[2] = mixn(o[2], 6 + 38 * wall + 9 * deep, hb);
    }
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255 * c01(rad - rr + 0.5);
  }
  g.putImageData(img, 0, 0);
  return micro(c, rad, seed, wood.angle);
}

// bead standing on its edge: the bicone profile, axis along local x, a crisp worn ridge down the middle. rot = how it will be stamped
function sideBead(rad, rot, seed) {
  const w = Math.ceil(rad * 2 + 6), c = L.makeCanvas(w, w), g = c.getContext('2d');
  const img = g.createImageData(w, w), d = img.data;
  const wood = makeWood(seed), r = L.rng(seed + 's');
  const T = rad * 0.6, rf = rad * 0.5, cr = Math.cos(rot), sr = Math.sin(rot), lph = r.range(0, 6), col = [0, 0, 0], o = [0, 0, 0];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - w / 2, dy = y + 0.5 - w / 2, ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > T + 1) continue;
    const e = Math.min(1, ax / T), rho = rf + (rad - rf) * (1 - (0.62 * e + 0.38 * e * e));
    if (ay > rho + 1) continue;
    const i = (y * w + x) * 4;
    const drho = -((rad - rf) / T) * (0.62 + 0.76 * e) * (dx < 0 ? -1 : 1) * sstep(0, 1.2, ax);
    const yy = Math.min(ay, rho * 0.995) * (dy < 0 ? -1 : 1), z = Math.sqrt(rho * rho - yy * yy);
    const n = norm3(-drho, yy / rho, z / rho);
    wood(dx, dy * 1.4, col);
    const m = (1 + 0.42 * sstep(1.8, 0, ax)) * (1 + 0.06 * Math.sin(ax * 1.9 + lph));
    const occ = 1 - 0.25 * sstep(0.8, 1, e);
    lit(o, n[0] * cr - n[1] * sr, n[0] * sr + n[1] * cr, n[2], col[0] * m, col[1] * m, col[2] * m, 1, occ);
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255 * c01(rho - ay + 0.5) * c01(T - ax + 0.5);
  }
  g.putImageData(img, 0, 0);
  return micro(c, rad, seed, wood.angle);
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#d3a44e', tone: '#7a4a17', seed: 'g08paper', fiber: 0.7, stain: 0.42, grain: 0.09, foxing: 0.22, edge: 0.3 }), 0, 0);
  const { cx, cy, R, a } = K.GLYPH; const SZ = 77, r = L.rng('g08lay'); const items = [];
  // filler row: one bead on each axis between the two rows, two smaller ones flanking it
  for (let q = 0; q < 4; q++) {
    const base = q * Math.PI / 2;
    for (const [da, rr, sc] of [[0, 244, 1], [0.315, 248, 0.86], [-0.315, 248, 0.86]]) {
      const ang = base + da + r.range(-0.012, 0.012), rad = SZ * 0.5 * sc * r.range(0.97, 1.0);
      items.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr, rad, kind: 'top', rot: 0 });
    }
  }
  // small beads tucked into the eight pockets between the corner beads and the ring
  for (let q = 0; q < 4; q++) for (const sg of [1, -1]) {
    const ang = q * Math.PI / 2 + sg * 0.55 + r.range(-0.01, 0.01);
    items.push({ x: cx + Math.cos(ang) * 261, y: cy + Math.sin(ang) * 261, rad: r.range(21.5, 23), kind: 'top', rot: 0 });
  }
  // ring row: walk round the circle; flat beads take a full width, edge-on beads (axis along the tangent) a narrow one
  const rr0 = R - SZ * 0.5, circ = TAU * rr0; const seq = []; let sum = 0, prevSide = true;
  while (sum < circ - 40) {
    const side = !prevSide && r.chance(0.42); prevSide = side;
    const rad = SZ * 0.5 * r.range(0.96, 1.0), wdt = side ? rad * 1.2 + 4 : rad * 2 + 2.5;
    seq.push({ side, rad, wdt }); sum += wdt;
  }
  let t = -Math.PI / 2 + 0.2; const kf = TAU / sum;
  for (const s of seq) {
    const ang = t + s.wdt * kf * 0.5; t += s.wdt * kf;
    const rr = R - s.rad - 0.5;
    items.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr, rad: s.rad, kind: s.side ? 'side' : 'top', rot: s.side ? ang + Math.PI / 2 : 0 });
  }
  // square row: flat beads whose inner edges sit on the four sides of the hole
  for (const s of K.squareSlots({ perSide: 4, d: a + SZ * 0.5, seed: 'g08sq', jitter: 0 })) {
    const rad = SZ * 0.5 * r.range(0.965, 1.0), off = SZ * 0.5 - rad;
    const nx = s.corner ? 0 : Math.cos(s.ang), ny = s.corner ? 0 : Math.sin(s.ang);
    items.push({ x: s.x - nx * off + r.range(-0.8, 0.8) * (ny ? 1 : 0), y: s.y - ny * off + r.range(-0.8, 0.8) * (nx ? 1 : 0), rad, kind: 'top', rot: 0 });
  }
  items.forEach((it, i) => { it.spr = it.kind === 'side' ? sideBead(it.rad, it.rot, 'g08b' + i) : topBead(it.rad, 'g08b' + i); });
  // pass 1: long soft cast shadows on the paper; pass 2: the beads again with a tight contact shadow
  for (const it of items) K.stamp(g, it.spr, it.x, it.y, { rot: it.rot, shadow: { dx: 9, dy: 13, blur: 15, color: 'rgba(52,28,6,0.42)' } });
  for (const it of items) K.stamp(g, it.spr, it.x, it.y, { rot: it.rot, shadow: { dx: 2.5, dy: 3.5, blur: 4, color: 'rgba(30,14,3,0.55)' } });
  return c;
}

export default {
  name: '算珠',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },
};
