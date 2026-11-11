// s02 — 蜜蜡珠串 (macro photograph). The arc is the envelope of a strand of honey-amber beads: nine or so round beads sit
// side by side along it, crowns on the arc, a knotted twist of silk cord in the dark notch between neighbours.
// The lens is wide open and focused on the crest: the five beads there are tack sharp — waxy yellow with creamy, streaming
// clouds, a worn drill hole where the cord goes in, the studio window mirrored on every one — the strand falls out of
// focus toward both ends of the frame, and the nearer coils of the same strand (lower in the frame, closer to the lens)
// open into big soft beads that deepen to amber brown. Above: black, a little lit dust.
//
// Each bead is shaded per pixel in init(): an opaque-to-translucent wax sphere — wrapped diffuse from a window above left
// (at a finite distance, so no two beads wear its reflection in the same place), the light that has crossed the bead
// glowing in the opposite lower crescent, back light spilling over the outward limb — with cloudy, streaming inclusions
// (云絮状流纹) and the fine wear of an old bead: crazing, pits, hairline scratches. The reflected window is rendered to a
// separate sprite so that it can slide over the bead while the strand turns; a gloss mask keeps the wear where it is while
// the window passes. Everything out of focus is defocused in linear light with a disc kernel (see defocus()).
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 130;
const BR = 108;     // bead radius (px) → about nine beads across the frame
const GAP = 25;     // length of cord showing between two beads: room for a small knot
const SPAD = 30;    // transparent margin round every bead sprite (room for its circle of confusion)
const CORD = 11.5;  // thickness of the silk cord
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const norm3 = (v) => { const m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; };

// key light: a window above left, in front of the strand (frame coordinates, +z toward the lens)
const LPOS = [W / 2 - 620, -470, 1120];
const lightAt = (x, y) => norm3([LPOS[0] - x, LPOS[1] - y, LPOS[2]]);
// a dim reflector card low on the right
const LF = norm3([0.62, 0.42, 0.66]);

// intensity → colour, one ramp for the clear honey and one for the cloudy wax (creamier, lighter)
const NL = 512;
function makeLut(stops) {
  const f = L.makeRamp(stops);
  const out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
const CLEAR = [[0, '#0f0401'], [0.1, '#3f1603'], [0.22, '#843a06'], [0.34, '#b45e0b'], [0.46, '#d27f12'], [0.58, '#e69c1c'], [0.7, '#f2b32d'], [0.82, '#fac74e'], [0.92, '#ffda7c'], [1, '#ffedb8']];
const CLOUD = [[0, '#190a02'], [0.1, '#5a2a08'], [0.22, '#a2570e'], [0.34, '#c9791a'], [0.46, '#e39b24'], [0.58, '#f2b632'], [0.7, '#f8c850'], [0.82, '#fdd978'], [0.92, '#ffe69c'], [1, '#fff4d2']];

/** a cropped layer: frame coordinates inside `draw`, but the canvas only covers [x0, x0+w] × [y0, y0+h] */
function makeBand(x0, y0, w, h, draw) {
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  c._x0 = x0; c._y0 = y0;
  g.translate(-x0, -y0);
  if (draw) draw(g, c);
  return c;
}
function blitBand(ctx, env, band, o = {}) {
  L.cam(ctx, env, o, () => {
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (o.blend) ctx.globalCompositeOperation = o.blend;
    ctx.drawImage(band, band._x0, band._y0);
  });
}
// display values ↔ linear light
const TOLIN = new Float32Array(256), TOSRGB = new Uint8ClampedArray(65537);
for (let i = 0; i < 256; i++) TOLIN[i] = Math.pow(i / 255, 2.2);
for (let i = 0; i <= 65536; i++) TOSRGB[i] = Math.round(255 * Math.pow(i / 65536, 1 / 2.2));
/**
 * Defocus the way a lens does it: a disc-shaped kernel (flat-topped — the lens is wide open), in linear light and in float
 * maths, so that bright things open into clean, luminous discs instead of smoky, banded smudges. Alpha is respected.
 * o: gain (> 1 keeps small highlights burning), aexp (< 1 fattens the soft edge: compositing in display values over a
 * dark ground would otherwise eat the light that a lens keeps)
 */
function defocus(src, radius, o = {}) {
  const { gain = 1, aexp = 1 } = o;
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  // premultiplied linear light, summed along every row (one zero sample in front of each row)
  const W1 = w + 1, P = new Float32Array(W1 * h * 4);
  for (let y = 0; y < h; y++) {
    let r = 0, g = 0, b = 0, a = 0, i = y * w * 4, q = (y * W1 + 1) * 4;
    for (let x = 0; x < w; x++, i += 4, q += 4) {
      const al = sd[i + 3];
      if (al) { const af = al / 255; r += TOLIN[sd[i]] * af; g += TOLIN[sd[i + 1]] * af; b += TOLIN[sd[i + 2]] * af; a += af; }
      P[q] = r; P[q + 1] = g; P[q + 2] = b; P[q + 3] = a;
    }
  }
  const ri = Math.floor(radius), hw = new Int32Array(ri * 2 + 1);
  let area = 0;
  for (let dy = -ri; dy <= ri; dy++) { const k = Math.floor(Math.sqrt(radius * radius - dy * dy)); hw[dy + ri] = k; area += 2 * k + 1; }
  const AG = new Uint8ClampedArray(1025);
  for (let i = 0; i <= 1024; i++) AG[i] = Math.round(255 * Math.pow(i / 1024, aexp));
  const out = new ImageData(w, h), od = out.data, inv = 1 / area;
  for (let y = 0; y < h; y++) {
    const ya = y - ri < 0 ? 0 : y - ri, yb = y + ri > h - 1 ? h - 1 : y + ri;
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = ya; yy <= yb; yy++) {
        const k = hw[yy - y + ri];
        let x0 = x - k, x1 = x + k + 1;
        if (x0 < 0) x0 = 0;
        if (x1 > w) x1 = w;
        const q0 = (yy * W1 + x0) * 4, q1 = (yy * W1 + x1) * 4;
        r += P[q1] - P[q0]; g += P[q1 + 1] - P[q0 + 1]; b += P[q1 + 2] - P[q0 + 2]; a += P[q1 + 3] - P[q0 + 3];
      }
      if (a * inv < 0.003) continue;
      const k2 = 65536 / a, o4 = (y * w + x) * 4;                           // un-premultiply
      let v = r * k2; od[o4] = TOSRGB[v > 65536 ? 65536 : v > 0 ? v | 0 : 0];
      v = g * k2; od[o4 + 1] = TOSRGB[v > 65536 ? 65536 : v > 0 ? v | 0 : 0];
      v = b * k2; od[o4 + 2] = TOSRGB[v > 65536 ? 65536 : v > 0 ? v | 0 : 0];
      a *= inv * gain; od[o4 + 3] = AG[a >= 1 ? 1024 : (a * 1024) | 0];
    }
  }
  const c = L.makeCanvas(w, h);
  c.getContext('2d').putImageData(out, 0, 0);
  return radius >= 3 ? L.blurred(c, Math.max(0.5, radius * 0.1)) : c;
}
/** multiply `src` by an opaque tint painted by `paint(g)` while keeping src's alpha */
function multiplyKeepAlpha(src, paint) {
  const c = L.makeCanvas(src.width, src.height), g = c.getContext('2d');
  paint(g);
  g.globalCompositeOperation = 'multiply'; g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  return c;
}

/** jittered-grid cells → CELL: the nearest feature point (offset from the sample, id) and the distance to the border between the two nearest cells */
const CELL = { dx: 0, dy: 0, d: 0, id: 0, bd: 0 };
function cellAt(u, v, seed) {
  const xi = Math.floor(u), yi = Math.floor(v);
  let d1 = 1e9, d2 = 1e9, x1 = 0, y1 = 0, x2 = 0, y2 = 0, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const fx = cx + (h & 1023) / 1023 - u, fy = cy + ((h >>> 10) & 1023) / 1023 - v;
    const dd = fx * fx + fy * fy;
    if (dd < d1) { d2 = d1; x2 = x1; y2 = y1; d1 = dd; x1 = fx; y1 = fy; id = ((h >>> 20) & 1023) / 1023; }
    else if (dd < d2) { d2 = dd; x2 = fx; y2 = fy; }
  }
  const ex = x2 - x1, ey = y2 - y1, el = Math.hypot(ex, ey) || 1;
  CELL.dx = x1; CELL.dy = y1; CELL.d = Math.sqrt(d1); CELL.id = id;
  CELL.bd = ((x1 + x2) * 0.5 * ex + (y1 + y2) * 0.5 * ey) / el;
}

// the drill hole: angular radius of the bore is o.hole; its worn, countersunk mouth reaches CHAM farther
const CHAM = 0.085;
// the window as the bead mirrors it (tangent units round the mirror direction): half-width, half-height, corner radius
const WA = 0.37, WB = 0.27, WR = 0.1;

/**
 * One bead, shaded per pixel → { size, c, d, sd, gd }: three RGBA buffers of size × size, the bead centred with SPAD px of margin.
 *   d = the body · sd = the mirrored window · gd = gloss mask (alpha: how well the skin mirrors at that point)
 * o: { axis (angle of the cord on screen = the bead's theta on the arc), lk (unit vector toward the key light),
 *      yaw (the drill axis leaves the picture plane: > 0 turns the right-hand mouth toward the lens, < 0 the left-hand one), pitch, hole,
 *      flow (direction of the streaming inclusions), swirl, ox, oy (noise offsets), opq (−0.25 clearer … +0.35 cloudier),
 *      warm (intensity bias), age (0 fresh honey … 1 deeper orange), sq (hand-ground beads are a little short along the drill axis),
 *      lit (how much key light reaches it, 0.5 … 1), gloss, wear (0 … 1: scratches and pits), crz (−0.3 … 0.3: how much of the skin is crazed),
 *      egg (0 … 0.012: how far the outline strays from a circle) }
 * res: 1, or 2 for a half-size sprite (a bead that will be thrown out of focus anyway); the wear keeps its real size either way
 */
function shadeBeadPixels(rad, o, nz, lutClear, lutCloud, res = 1) {
  const inner = Math.ceil(rad * 2) + 6, size = inner + SPAD * 2, c = size / 2;
  const d = new Uint8ClampedArray(size * size * 4), sd = new Uint8ClampedArray(size * size * 4), gd = new Uint8ClampedArray(size * size * 4);
  const ax = Math.cos(o.axis), ay = Math.sin(o.axis);     // along the cord
  const ux = ay, uy = -ax;                                // outward, away from the circle's centre: where the back light spills over the limb
  const fa = Math.cos(o.flow), fb = Math.sin(o.flow), ga = Math.cos(o.flow + 0.9), gb = Math.sin(o.flow + 0.9);
  const ox = o.ox, oy = o.oy, sw = o.swirl;
  const e2c = o.egg * Math.cos(ox * 3.1), e2s = o.egg * Math.sin(ox * 3.1), e3c = 0.5 * o.egg * Math.cos(oy * 2.3), e3s = 0.5 * o.egg * Math.sin(oy * 2.3);
  const dim = (1 - o.lit) / 0.5, mr = 1 - 0.22 * dim, mg = 1 - 0.35 * dim, mb = 1 - 0.56 * dim;   // out of the pool of light the honey deepens to amber
  // the key light as this bead sees it
  const LKx = o.lk[0], LKy = o.lk[1], LKz = o.lk[2];
  const lm = Math.hypot(LKx, LKy), LXx = LKx / lm, LXy = LKy / lm;                               // toward the light, on screen
  const SU = norm3([-LKz, 0, LKx]);                                                             // the window's own horizontal …
  const SV = [LKy * SU[2] - LKz * SU[1], LKz * SU[0] - LKx * SU[2], LKx * SU[1] - LKy * SU[0]];   // … and vertical axes
  // the drill axis (its mouth on the lens side)
  const ayaw = Math.abs(o.yaw), cp = Math.cos(o.pitch);
  const Aal = (o.yaw >= 0 ? 1 : -1) * Math.cos(ayaw) * cp, Ape = Math.sin(o.pitch), Az = Math.sin(ayaw) * cp;
  const Ax = Aal * ax - Ape * ay, Ay = Aal * ay + Ape * ax;
  const G0 = o.hole, G1 = G0 + CHAM, COSG1 = Math.cos(G1 + 0.05);
  const WE = 0.055 + 0.075 * o.wear, WBAR = 1 - 0.85 * o.wear;             // the more handled the bead, the softer it returns the window
  // wear: hairline scratches, a few dust specks, one or two bubbles under the skin (surface px, origin at the bead's centre)
  const r = L.rng('wear' + o.ox), RF = rad * res;
  const scr = [], spk = [], bub = [];
  const ns = 4 + Math.floor(o.wear * 7);
  for (let n = 0; n < ns; n++) {
    const ang = r.range(0, L.TAU), dist = Math.sqrt(r()) * 0.95 * RF, dir = r.range(0, Math.PI), len = r.range(0.16, 0.62) * RF;
    scr.push({ x0: Math.cos(ang) * dist - Math.cos(dir) * len / 2, y0: Math.sin(ang) * dist - Math.sin(dir) * len / 2, dx: Math.cos(dir), dy: Math.sin(dir), len,
      bend: r.range(-0.1, 0.1) * len, al: r.range(0.035, 0.1), hw: r.range(0.5, 0.85) });
  }
  const nk = r.int(3, 6);
  for (let n = 0; n < nk; n++) { const ang = r.range(0, L.TAU), dist = Math.sqrt(r()) * 0.95 * RF; spk.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, r: r.range(0.75, 1.35), al: r.range(0.1, 0.24) }); }
  const nb = r.int(0, 2);
  for (let n = 0; n < nb; n++) { const ang = r.range(0, L.TAU), dist = Math.sqrt(r()) * 0.7 * RF; bub.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, r: r.range(2.0, 3.6) }); }
  const cseed = (Math.floor(ox * 977) ^ Math.floor(oy * 131)) | 0, pitP = 0.16 + 0.3 * o.wear;

  for (let j = SPAD; j < size - SPAD; j++) {
    const Y = (j + 0.5 - c) / rad;
    for (let i = SPAD; i < size - SPAD; i++) {
      const X = (i + 0.5 - c) / rad;
      const al = (X * ax + Y * ay) / o.sq, pe = -X * ay + Y * ax, aal = al < 0 ? -al : al;
      let x = al * ax - pe * ay, y = al * ay + pe * ax, r2 = x * x + y * y, rr = Math.sqrt(r2);
      if (r2 > 0.04) {                                                      // no old bead is a true ball: its outline wanders by a percent or so
        const k = 1 / (1 + (e2c * (x * x - y * y) + e2s * 2 * x * y) / r2 + (e3c * x * (x * x - 3 * y * y) + e3s * y * (3 * x * x - y * y)) / (r2 * rr));
        x *= k; y *= k; r2 = x * x + y * y; rr = Math.sqrt(r2);
      }
      const cov = (1 - rr) * rad + 0.5;
      if (cov <= 0) continue;
      const z = r2 < 1 ? Math.sqrt(1 - r2) : 0;

      // ── inclusions: a layer wrapped on the sphere (compressed toward the limb) + a deeper, magnified, softer one ──
      const k = rr > 1e-3 ? Math.asin(rr < 1 ? rr : 1) / rr : 1;
      const sx = x * k, sy = y * k;
      const px = sx * fa + sy * fb, py = -sx * fb + sy * fa;
      const w1 = nz.fbm(px * 0.6 + ox, py * 0.6 + oy, 2), w2 = nz.fbm(px * 0.6 + ox + 5.2, py * 0.6 + oy - 3.7, 2);
      const qx = px + sw * w1, qy = py + sw * w2;                           // stirred once …
      const w3 = nz.n2(qx * 1.3 + 3.1 - oy, qy * 1.3 - 8.2 + ox), w4 = nz.n2(qx * 1.3 - 6.4 + oy, qy * 1.3 + 1.7 - ox);
      const fx = qx + 0.26 * w3, fy = qy + 0.26 * w4;                         // … and again, finer
      const c1 = nz.fbm(fx * 0.56 + ox * 1.7, fy * 1.36 - oy * 1.3, 4, 2.1, 0.52);
      const dqx = (x * ga + y * gb) * 0.62, dqy = (-x * gb + y * ga) * 0.62;
      const v1 = nz.n2(dqx * 0.9 - ox, dqy * 0.9 + oy * 0.7);
      const c2 = nz.fbm(dqx * 0.8 + 1.1 * v1 + ox * 0.3 + 9, dqy * 1.4 - 1.1 * v1 + oy + 4, 2);
      const craw = c1 * 0.8 + c2 * 0.34 + o.opq;
      const honey = sstep(-0.1, -0.5, craw);                              // the clear veins: honey you can look into
      let f1 = 1 - Math.abs(nz.n2(fx * 1.2 + ox * 2.1, fy * 3.6 + oy * 0.9)); f1 *= f1; f1 *= f1 * f1;        // streaming filaments …
      let f2 = 1 - Math.abs(nz.n2(fx * 2.4 - oy * 1.1, fy * 6.8 + ox * 1.9)); f2 *= f2; f2 *= f2; f2 *= f2;   // … and the finest threads
      const wisp = 0.5 * f1 + 0.2 * f2;
      let cl = sstep(0.08, 0.5, craw);                                      // the clouds: cream stirred into the wax
      cl += wisp * (0.22 + 0.78 * sstep(-0.25, 0.3, craw)) * (1 - cl) * 0.8;
      let cloud = 0.74 - 0.44 * honey + 0.24 * cl;                           // 蜜蜡 is never quite clear: the ground itself is waxy, opaque yellow

      // ── the skin of an old bead (surface px; everything on a ball is compressed toward the limb, and fades there) ──
      const U = sx * RF, V = sy * RF, mf = sstep(0.985, 0.8, rr);
      let dI = 0, gk = 1;
      // crazing: a fine net of weathering cracks, in patches
      const patch = sstep(0.1, 0.5, nz.fbm(sx * 1.3 + ox * 0.7 + 3, sy * 1.3 - oy * 0.7, 2) + o.crz);
      if (patch > 0.01) {
        const wu = U + 3.6 * nz.n2(U / 36 + oy, V / 36 + 5.1), wv = V + 3.6 * nz.n2(U / 36 + 9.3, V / 36 - ox);
        cellAt(wu / 13.5 + ox, wv / 13.5 + oy, cseed);
        const ck = (1 - sstep(0.3, 1.2, CELL.bd * 13.5)) * (0.4 + 0.6 * CELL.id) * patch * mf;
        dI -= 0.055 * ck; gk -= 0.3 * ck;
      }
      // pits: a shadowed wall toward the light, a lit one beyond it
      cellAt(U / 34 + oy * 1.3, V / 34 - ox * 1.3, cseed ^ 0x5bd1e995);
      if (CELL.id < pitP) {
        const rp = 1.15 + 1.7 * ((CELL.id / pitP) * 7.13 % 1), pdx = -CELL.dx * 34, pdy = -CELL.dy * 34, pd = CELL.d * 34;
        if (pd < rp + 2.4) {
          const sh = (pdx * LXx + pdy * LXy) / rp, pin = 1 - sstep(rp - 0.7, rp + 0.5, pd);
          const lip = sstep(rp - 0.4, rp + 0.5, pd) * (1 - sstep(rp + 0.5, rp + 2.2, pd)) * (sh < 0 ? -sh : 0) / (pd / rp);
          dI += mf * (pin * (-0.1 - 0.12 * sh) + 0.07 * lip); gk -= 0.9 * pin * mf;
        }
      }
      // hairline scratches from generations of handling: a bright lip with a darker groove beside it
      for (let n = 0; n < scr.length; n++) {
        const s = scr[n], qx2 = U - s.x0, qy2 = V - s.y0, t = (qx2 * s.dx + qy2 * s.dy) / s.len;
        if (t <= 0 || t >= 1) continue;
        const off = -qx2 * s.dy + qy2 * s.dx - s.bend * 4 * t * (1 - t);
        if (off > 4 || off < -4) continue;
        const tp = Math.sqrt(4 * t * (1 - t)) * s.al * mf, a0 = off < 0 ? -off : off, a1 = off - 1.35 < 0 ? 1.35 - off : off - 1.35;
        const br = 1 - sstep(s.hw - 0.45, s.hw + 0.65, a0), dk = 1 - sstep(s.hw - 0.45, s.hw + 0.65, a1);
        dI += tp * (br - 0.85 * dk); gk -= 4 * tp * (br + dk);
      }
      // dust: no bead in front of a macro lens is ever clean
      for (let n = 0; n < spk.length; n++) {
        const s = spk[n], ddx = U - s.x, ddy = V - s.y;
        if (ddx > 5 || ddx < -5 || ddy > 5 || ddy < -5) continue;
        dI += mf * (s.al * (1 - sstep(s.r - 0.5, s.r + 0.6, Math.hypot(ddx, ddy))) - 0.4 * s.al * (1 - sstep(s.r - 0.5, s.r + 0.9, Math.hypot(ddx - 1.1, ddy - 1.3))));
      }
      // a bubble or two under the skin, where the honey is clear enough to show them
      for (let n = 0; n < bub.length; n++) {
        const s = bub[n], ddx = U - s.x, ddy = V - s.y, dd = Math.hypot(ddx, ddy);
        if (dd > s.r + 2.5) continue;
        const sh = (ddx * LXx + ddy * LXy) / s.r, ring = Math.exp(-((dd - s.r) * (dd - s.r)) / 0.9);
        const gx = ddx + 0.42 * s.r * LXx, gy = ddy + 0.42 * s.r * LXy;
        dI += mf * honey * (-0.1 * ring * L.clamp(sh + 0.3) + 0.035 * (1 - sstep(s.r - 0.8, s.r + 0.4, dd)) + 0.2 * Math.exp(-(gx * gx + gy * gy) / (0.18 * s.r * s.r)));
      }

      // ── the drill hole: a dark bore inside a worn, matt, countersunk mouth ──
      let nx = x, ny = y, nzz = z, bore = 0, cham = 0;
      const cg = x * Ax + y * Ay + z * Az;
      if (cg > COSG1) {
        const gam = Math.acos(cg > 1 ? 1 : cg), e = 0.9 / (rad * (z > 0.22 ? z : 0.22));
        bore = 1 - sstep(G0 - e, G0 + e, gam);
        cham = sstep(G1 + 0.03, G1 - 0.02, gam);
        const kk = 1.2 * cham * Math.pow(1 - L.clamp((gam - G0) / CHAM), 0.7), sg = Math.sqrt(1 - cg * cg) + 1e-5;
        nx = x + kk * (Ax - cg * x) / sg; ny = y + kk * (Ay - cg * y) / sg; nzz = z + kk * (Az - cg * z) / sg;
        const nm = Math.hypot(nx, ny, nzz); nx /= nm; ny /= nm; nzz /= nm;
        cloud += (0.92 - cloud) * cham * 0.8;                                // ground matt: paler, opaque
        gk *= 1 - cham;
      }

      // ── light ──
      const ndl = nx * LKx + ny * LKy + nzz * LKz;
      let dif = L.clamp((ndl + 0.36) / 1.36);                                // wax: the terminator wraps far round
      dif = dif * Math.sqrt(dif);
      const s = -(x * LXx + y * LXy), t = x * LXy - y * LXx;                 // s = +1 at the limb farthest from the light
      const tg = Math.exp(-((s - 0.6) * (s - 0.6)) / 0.08) * Math.exp(-(t * t) / 0.52) * sstep(1.0, 0.8, rr);   // light that crossed the bead
      const up = L.clamp(0.5 + 0.5 * (x * ux + y * uy) / (rr + 1e-4));
      const rim = Math.pow(1 - z, 1.35) * (0.07 + 0.93 * up * up);           // back light through the thin limb
      const iClear = 0.1 + 0.42 * dif + 0.6 * tg + 0.72 * rim;
      const iCloud = 0.125 + 0.55 * dif + 0.4 * tg + 0.58 * rim;
      let I = iClear + (iCloud - iClear) * cloud + o.warm + 0.052 * cl * (0.35 + dif);
      I += 0.3 * Math.pow(1 - z, 5) * up * up * up;                         // the crown burns brightest against the dark
      I -= 0.1 * Math.pow(1 - z, 1.4) * (1 - up);                            // … the bead turns away into shadow underneath
      I += 0.06 * Math.pow(1 - z, 3) * (1 - up) * (1 - up);                  // … and picks up the glow of the coils below along its lower edge
      // the skin is never dead smooth: a slow waviness (nothing finer than a dozen pixels) that also bends the window's edge
      const wob = nz.n2(sx * 5.2 + ox, sy * 5.2 - oy), wob2 = nz.n2(sx * 5.2 - oy + 7.3, sy * 5.2 + ox + 2.9);
      I += 0.014 * wob * (0.4 + dif) * mf;

      // ── reflections ──
      const mx = x + 0.01 * wob, my = y + 0.01 * wob2;
      const mz2 = 1 - mx * mx - my * my, mz = mz2 > 0 ? Math.sqrt(mz2) : 0;
      const rx = 2 * mz * mx, ry = 2 * mz * my, rz = 2 * mz * mz - 1;
      const dk = rx * LKx + ry * LKy + rz * LKz;
      let box = 0;
      if (dk > 0.15) {
        const a = (rx * SU[0] + ry * SU[1] + rz * SU[2]) / dk, b = (rx * SV[0] + ry * SV[1] + rz * SV[2]) / dk;
        const qa = (a < 0 ? -a : a) - (WA - WR), qb = (b < 0 ? -b : b) - (WB - WR);
        const dOut = Math.hypot(qa > 0 ? qa : 0, qb > 0 ? qb : 0) + Math.min(qa > qb ? qa : qb, 0) - WR;   // distance to the window's rounded edge
        const core = 1 - sstep(-WE, WE + 0.005, dOut);                       // the window: a bright, four-sided heart …
        const skirt = Math.exp(-(dOut > 0 ? dOut : 0) / 0.24);               // … melting into the wax around it
        const pane = 0.8 + 0.2 * L.clamp(0.5 - 0.9 * a - 0.8 * b);           // it burns unevenly: hotter toward its upper corner
        const bar = 1 - WBAR * (0.34 * Math.exp(-((a - 0.07) * (a - 0.07)) / 0.0011) + 0.23 * Math.exp(-((b + 0.04) * (b + 0.04)) / 0.0009));   // the glazing bars, all but lost in the wax
        box = 0.92 * core * pane * bar + 0.26 * skirt * (1 - core);
        I += 0.15 * Math.exp(-(a * a) / 1.5 - (b * b) / 0.9);                // … and the broad waxy sheen
      }
      const df = rx * LF[0] + ry * LF[1] + rz * LF[2];
      if (df > 0.86) I += 0.06 * sstep(0.86, 0.97, df) * sstep(1.0, 0.8, rr);   // the reflector card, barely there

      // the neighbours: a warm bounce on either flank, darkness where the beads nearly touch
      const flank = Math.exp(-((aal - 0.74) * (aal - 0.74)) / 0.022 - (pe * pe) / 0.34);
      I += 0.055 * flank;
      I -= 0.1 * Math.exp(-((al + 0.95) * (al + 0.95)) / 0.04 - ((pe - 0.1) * (pe - 0.1)) / 0.3);   // the left-hand neighbour stands in the key light
      I -= 0.05 * Math.exp(-((al - 0.98) * (al - 0.98)) / 0.018 - (pe * pe) / 0.2);
      // the drill channel shows faintly through the clear parts
      I -= 0.05 * Math.exp(-(pe * pe) / 0.004) * (1 - cloud) * sstep(1.0, 0.84, aal);

      I += dI * (0.55 + 0.75 * dif);
      I *= 1 - 0.08 * cham;
      I = I * (1 - bore) + bore * (0.05 + 0.1 * L.clamp(0.5 - 0.5 * (x * LXx + y * LXy)));   // inside the bore: dark, a little amber glow on the far wall
      I = I < 0 ? 0 : I > 1 ? 1 : I;
      const li = ((I * (NL - 1)) | 0) * 3;
      let cr = lutClear[li] + (lutCloud[li] - lutClear[li]) * cloud;
      let cgn = lutClear[li + 1] + (lutCloud[li + 1] - lutClear[li + 1]) * cloud;
      let cb = lutClear[li + 2] + (lutCloud[li + 2] - lutClear[li + 2]) * cloud;
      const sat = L.clamp(tg * (1 - 0.5 * cloud) + 0.5 * flank);            // transmitted and bounced light comes out deeper in colour
      const crm = cl * (0.2 + 0.8 * I) * (1 - bore);                        // the clouds are cream, not just lighter honey
      cgn += 7 * crm; cb += 32 * crm;
      cr *= mr; cgn *= (1 - 0.12 * o.age) * (1 - 0.05 * sat) * mg; cb *= (1 - 0.42 * o.age) * (1 - 0.32 * sat) * mb;
      const o4 = (j * size + i) * 4, al8 = (cov > 1 ? 1 : cov) * 255;
      d[o4] = cr; d[o4 + 1] = cgn; d[o4 + 2] = cb; d[o4 + 3] = al8;
      gk = (gk < 0 ? 0 : gk) * (1 - bore);
      gd[o4] = gd[o4 + 1] = gd[o4 + 2] = 255; gd[o4 + 3] = gk * al8;
      if (box > 0.004) { sd[o4] = 255; sd[o4 + 1] = 252; sd[o4 + 2] = 240; sd[o4 + 3] = box * 255 * o.gloss; }
    }
  }
  return { size, c, d, sd, gd };
}

function shadeBead(rad, o, nz, lutClear, lutCloud, res = 1) {
  const px = shadeBeadPixels(rad / res, o, nz, lutClear, lutCloud, res);
  const cv = (buf) => { const k = L.makeCanvas(px.size, px.size); k.getContext('2d').putImageData(new ImageData(buf, px.size, px.size), 0, 0); return k; };
  const base = cv(px.d), spec = cv(px.sd), gloss = cv(px.gd);
  // the window as the worn skin returns it, for the beads that are too far out of focus to need the mask every frame
  const worn = L.makeCanvas(px.size, px.size), wg = worn.getContext('2d');
  wg.drawImage(spec, 0, 0); wg.globalCompositeOperation = 'destination-in'; wg.drawImage(gloss, 0, 0);
  return { base, spec, gloss, worn, c: px.c, size: px.size, rad, res };
}

// ───────────────────────── the cord ─────────────────────────
/** a length of twisted silk along the dense polyline pts, lit from (lx, ly) */
function strokeCord(g, pts, w, r, lx, ly, shadow) {
  const path = () => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); };
  g.lineCap = 'butt'; g.lineJoin = 'round';
  if (shadow) { g.save(); g.translate(1.8, 2.8); g.strokeStyle = 'rgba(44,16,2,0.3)'; g.lineWidth = w + 2; path(); g.stroke(); g.restore(); }
  g.strokeStyle = '#351a04'; g.lineWidth = w; path(); g.stroke();
  g.strokeStyle = '#864d12'; g.lineWidth = w - 2.2; path(); g.stroke();
  g.save(); g.translate(lx * w * 0.19, ly * w * 0.19); g.strokeStyle = 'rgba(190,124,42,0.92)'; g.lineWidth = w * 0.36; path(); g.stroke(); g.restore();
  g.save(); g.translate(lx * w * 0.27, ly * w * 0.27); g.strokeStyle = 'rgba(240,190,110,0.5)'; g.lineWidth = 1.5; path(); g.stroke(); g.restore();   // the sheen of the silk
  // the twist: each ply shows as a slanted ridge, dark in its groove, bright on its shoulder
  let acc = r.range(0, w * 0.6);
  g.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], sl = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    acc += sl;
    if (acc < w * 0.6) continue;
    acc = 0;
    const tx = (p1.x - p0.x) / sl, ty = (p1.y - p0.y) / sl, nx = -ty, ny = tx, h = w * 0.43, sk = w * 0.3;
    g.strokeStyle = 'rgba(56,28,4,0.46)'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(p1.x + nx * h - tx * sk, p1.y + ny * h - ty * sk); g.lineTo(p1.x - nx * h + tx * sk, p1.y - ny * h + ty * sk); g.stroke();
    g.strokeStyle = 'rgba(250,210,136,0.32)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(p1.x + nx * h * 0.2 - tx * sk * 0.2 + tx * 1.9, p1.y + ny * h * 0.2 - ty * sk * 0.2 + ty * 1.9); g.lineTo(p1.x - nx * h * 0.85 + tx * sk * 0.85 + tx * 1.9, p1.y - ny * h * 0.85 + ty * sk * 0.85 + ty * 1.9); g.stroke();
  }
}
/** loose filaments standing off the silk */
function cordFuzz(g, pts, w, r, n) {
  g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const i = r.int(1, pts.length - 1), p0 = pts[i - 1], p1 = pts[i], sl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const tx = (p1.x - p0.x) / sl, ty = (p1.y - p0.y) / sl, side = r.sign(), nx = -ty * side, ny = tx * side;
    const len = r.range(4, 9), lean = r.range(0.4, 1.3) * r.sign(), curl = r.range(-2.5, 2.5);
    const x0 = p1.x + nx * w * 0.4, y0 = p1.y + ny * w * 0.4, x1 = x0 + (nx + tx * lean) * len, y1 = y0 + (ny + ty * lean) * len;
    g.strokeStyle = `rgba(228,176,96,${r.range(0.22, 0.42).toFixed(3)})`; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + tx * curl, (y0 + y1) / 2 + ty * curl, x1, y1); g.stroke();
  }
}
/** the small knot tied between two beads: a lump of the same silk wound on itself */
function drawKnot(g, x, y, rx, ry, rot, r, lx, ly) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const lump = () => { g.beginPath(); g.ellipse(-rx * 0.16, ry * 0.06, rx * 0.86, ry, 0, 0, L.TAU); g.moveTo(rx, -ry * 0.05); g.ellipse(rx * 0.2, -ry * 0.05, rx * 0.8, ry * 0.92, 0, 0, L.TAU); };
  g.save(); g.translate(1.6, 2.6); g.fillStyle = 'rgba(40,14,2,0.36)'; lump(); g.fill(); g.restore();
  g.fillStyle = '#351a04'; lump(); g.fill();
  g.save(); g.scale(1 - 1 / rx, 1 - 1 / ry); lump(); g.restore(); g.clip();
  g.fillStyle = L.radial(g, lx * rx * 0.5, ly * ry * 0.55, 0.5, rx * 1.7, [[0, '#d69a46'], [0.3, '#ad6f1e'], [0.62, '#7e4a12'], [1, '#3e2007']]);
  g.fillRect(-rx * 2, -ry * 2, rx * 4, ry * 4);
  g.lineCap = 'round';
  for (let i = -1; i <= 2; i++) {                                           // the grooves between its turns, a glint on the shoulder of each turn
    const off = (i - 0.5) * rx * 0.56 + r.range(-0.7, 0.7), lean = rx * r.range(0.4, 0.75), bow = rx * r.range(-0.1, 0.28);
    g.strokeStyle = 'rgba(52,26,4,0.5)'; g.lineWidth = 1.35;
    g.beginPath(); g.moveTo(off - lean * 0.5, ry + 1); g.quadraticCurveTo(off + bow, 0, off + lean * 0.5, -ry - 1); g.stroke();
    g.strokeStyle = 'rgba(248,208,132,0.3)'; g.lineWidth = 1.25;
    g.beginPath(); g.moveTo(off - lean * 0.3 + 2, ry * 0.4); g.quadraticCurveTo(off + bow + 2, -ry * 0.12, off + lean * 0.4 + 1.8, -ry * 0.78); g.stroke();
  }
  g.restore();
}

/** circle of confusion (px) along the focused strand: five beads sharp at the crest, opening toward both ends of the frame */
const cocOf = (th) => 13 * Math.pow(L.clamp((Math.abs(th) - 0.235) / 0.3), 1.15);
/** how much of the key light reaches a point of the strand: the pool of light sits just left of the crest */
const fallOf = (x) => 1 - 0.38 * sstep(380, 1250, Math.abs(x - (W / 2 - 90)));
/** yaw below which a mouth sits on the bead's outline and cannot be seen */
const SEEN = 0.1;

// the five at the crest are the portrait: no two alike — one creamy, one clear and honeyed, one older and deeper …
const HERO = {
  0: { rad: BR, sq: 0.985, opq: 0.1, age: 0.14, yaw: 0.44, pitch: 0.04, wear: 0.45, crz: -0.05, swirl: 0.95, gloss: 1, egg: 0.005, lift: 0 },
  1: { opq: 0.3, age: 0, yaw: 0.2, pitch: -0.05, wear: 0.25, crz: -0.2, gloss: 0.95, lift: -1.5 },
  2: { opq: -0.14, age: 0.6, yaw: -0.4, pitch: 0.03, wear: 0.7, crz: 0.1, lift: 1.5 },
  [-1]: { opq: -0.2, age: 0.4, yaw: -0.36, pitch: 0.05, wear: 0.55, crz: 0.02, swirl: 0.8, lift: 1 },
  [-2]: { opq: 0.14, age: 0.9, yaw: 0.42, pitch: -0.04, wear: 0.9, crz: 0.18, gloss: 0.86, lift: -1 },
};
/** lay the beads out from the crest both ways: equal beads (a few percent apart), all threaded on the same line */
function layoutBeads(a) {
  const r = L.rng('s02beads');
  const lim = a.span(PAD + 20);
  const mk = () => ({
    rad: BR * (1 + r.range(-0.03, 0.022)), sq: r.range(0.955, 0.995), gap: GAP * r.range(0.86, 1.2), flow: r.range(-0.9, 0.9), ox: r.range(-40, 40), oy: r.range(-40, 40),
    opq: r.range(-0.2, 0.3), warm: r.range(-0.025, 0.025), age: Math.pow(r(), 1.4), gloss: r.range(0.82, 1), swirl: r.range(0.6, 1.0),
    yaw: r.sign() * r.range(0.14, 0.5), pitch: r.range(-0.07, 0.07), hole: r.range(0.118, 0.148), wear: r(), crz: r.range(-0.25, 0.18),
    egg: r.range(0.004, 0.012), lift: r.range(-2.5, 2.5),
  });
  const beads = [];
  const first = Object.assign(mk(), HERO[0]); first.th = 0; first.k = 0; beads.push(first);
  for (const dir of [1, -1]) {
    let prev = first;
    while (Math.abs(prev.th) < lim) {
      const b = Object.assign(mk(), HERO[prev.k + dir] || {});
      b.k = prev.k + dir;
      b.th = prev.th + dir * (prev.rad * prev.sq + b.rad * b.sq + (dir > 0 ? prev.gap : b.gap)) / (a.R - BR);
      beads.push(b); prev = b;
    }
  }
  beads.sort((p, q) => p.th - q.th);
  for (const b of beads) {
    const p = a.pt(b.th, -BR - b.lift);                                   // the cord has a little slack: no two beads sit at quite the same height
    b.x = p.x; b.y = p.y;
    b.axis = b.th; b.lit = fallOf(b.x); b.lk = lightAt(b.x, b.y); b.coc = cocOf(b.th);
  }
  return beads;
}

/** the strand in focus: cord + beads + their own bloom */
function buildStrand(env, lutClear, lutCloud) {
  const a = env.arc, nz = L.makeNoise('s02amber');
  const beads = layoutBeads(a);
  for (const b of beads) {
    // a bead out of focus is shaded at half size (it is about to lose that detail anyway) and opened into its circle of confusion
    const soft = b.coc >= 1;
    b.sharp = shadeBead(b.rad, b, nz, lutClear, lutCloud, soft ? 2 : 1);
    b.spr = soft ? { base: defocus(b.sharp.base, b.coc / 2, { aexp: 0.62 }), worn: defocus(b.sharp.worn, b.coc / 2, { gain: 1.25, aexp: 0.62 }), c: b.sharp.c, size: b.sharp.size, res: 2 } : b.sharp;
  }

  // the cord between two beads, in the gap's own frame (origin mid-gap on the line of centres, +x along the arc): the knot,
  // and a length of silk to either side that runs into the mouth of the drill hole where that mouth faces the lens
  // (drawn over the bead) or slips behind the bead's outline where it does not (drawn under it)
  const cr = L.rng('s02cord');
  const gaps = [];
  for (let i = 0; i < beads.length - 1; i++) {
    const b0 = beads[i], b1 = beads[i + 1], q = a.R - BR;
    const t0 = b0.th + b0.rad * b0.sq / q, t1 = b1.th - b1.rad * b1.sq / q, thm = (t0 + t1) / 2, o = a.pt(thm, -BR), ct = Math.cos(thm), st = Math.sin(thm);
    const loc = (x, y) => ({ x: (x - o.x) * ct + (y - o.y) * st, y: -(x - o.x) * st + (y - o.y) * ct });
    const mouth = (b, side) => {                                            // side: +1 = the bead's right-hand mouth, −1 = its left-hand one
      const ca = Math.cos(b.th), sa = Math.sin(b.th), seen = b.yaw * side > SEEN;
      const along = seen ? b.sq * Math.cos(Math.abs(b.yaw)) * Math.cos(b.pitch) * b.rad : b.sq * b.rad - 8, across = seen ? Math.sin(b.pitch) * b.rad : 0;
      const p = loc(b.x + side * along * ca - across * sa, b.y + side * along * sa + across * ca);
      p.seen = seen; return p;
    };
    const m0 = mouth(b0, 1), m1 = mouth(b1, -1);
    const half = (t1 - t0) * q / 2, kn = { x: cr.range(-0.16, 0.16) * half, y: cr.range(-1.5, 2.5), rx: CORD * cr.range(0.78, 0.9), ry: CORD * cr.range(0.7, 0.8), rot: cr.range(-0.35, 0.35) };
    const run = (m) => {                                                    // from the mouth to the knot, a little slack
      const pts = [], n = 14, bx = (m.x + kn.x) / 2, by = (m.y + kn.y) / 2 + cr.range(-1.2, 2.2);
      for (let k = 0; k <= n; k++) { const u = k / n; pts.push({ x: (1 - u) * (1 - u) * m.x + 2 * u * (1 - u) * bx + u * u * kn.x, y: (1 - u) * (1 - u) * m.y + 2 * u * (1 - u) * by + u * u * kn.y }); }
      return pts;
    };
    const coc = cocOf(thm), mrg = Math.ceil(coc * 1.4) + 6, hw = Math.ceil(half + 34) + mrg, hh = 30 + mrg;
    const lk = lightAt(o.x, o.y), lm = Math.hypot(lk[0], lk[1]), lx = (lk[0] * ct + lk[1] * st) / lm, ly = (-lk[0] * st + lk[1] * ct) / lm;
    const layer = (over) => {
      const c = L.makeCanvas(hw * 2, hh * 2), g = c.getContext('2d');
      g.translate(hw, hh);
      for (const m of [m0, m1]) {
        if (m.seen !== over) continue;
        const pts = run(m);
        strokeCord(g, pts, CORD * (m.seen ? 1 : 0.96), cr, lx, ly, m.seen);
        if (over) {                                                         // the silk goes down the bore: it darkens as it enters
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = L.radial(g, m.x, m.y, 1, 10.5, [[0, 'rgba(34,12,1,0.9)'], [0.5, 'rgba(46,17,2,0.5)'], [1, 'rgba(46,17,2,0)']]);
          g.fillRect(m.x - 11, m.y - 11, 22, 22);
          g.globalCompositeOperation = 'source-over';
          cordFuzz(g, pts, CORD, cr, cr.int(1, 2));
        }
      }
      if (over) { drawKnot(g, kn.x, kn.y, kn.rx, kn.ry, kn.rot, cr, lx, ly); cordFuzz(g, [{ x: kn.x - 3, y: kn.y }, { x: kn.x, y: kn.y }, { x: kn.x + 3, y: kn.y }], kn.ry * 2, cr, cr.int(1, 3)); }
      const out = coc >= 1 ? defocus(c, coc, { aexp: 0.7 }) : c;
      const fall = fallOf(o.x);
      if (fall < 0.97) { const og = out.getContext('2d'); og.globalCompositeOperation = 'source-atop'; og.fillStyle = `rgba(40,14,2,${((1 - fall) * 0.9).toFixed(3)})`; og.fillRect(0, 0, out.width, out.height); }
      return out;
    };
    gaps.push({ thm, hw, hh, under: layer(false), over: layer(true) });
  }

  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 110;
  const BW = W + PAD * 2, BH = Math.ceil(a.yAt(-PAD) + BR * 2 + 60) - Y0;
  const row = makeBand(X0, Y0, BW, BH, (g) => {
    for (const gp of gaps) a.at(g, gp.thm, -BR, () => g.drawImage(gp.under, -gp.hw, -gp.hh));
    // beads: the soft ones first, the sharp ones over them
    for (const b of [...beads].sort((p, q) => q.coc - p.coc)) { const k = b.spr.res, sz = b.spr.size * k; g.drawImage(b.spr.base, b.x - b.spr.c * k, b.y - b.spr.c * k, sz, sz); }
    for (const gp of gaps) a.at(g, gp.thm, -BR, () => g.drawImage(gp.over, -gp.hw, -gp.hh));
  });
  const halo = L.blurred(row, 26), hg = halo.getContext('2d');
  hg.translate(-X0, -Y0);
  hg.globalCompositeOperation = 'destination-in';     // the bloom belongs to the air above the strand; keep the seam under it dark
  hg.fillStyle = L.radial(hg, a.cx, a.cy, a.R - BR * 2 - 20, a.R - BR * 0.6, [[0, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,1)']]);
  hg.fillRect(X0, Y0, BW, BH);
  const strand = makeBand(X0, Y0, BW, BH, (g) => {
    g.globalAlpha = 0.11; g.drawImage(halo, X0, Y0);
    g.globalAlpha = 1; g.drawImage(row, X0, Y0);
  });
  return { strand, beads };
}

/** a nearer coil of the strand — lower in the frame, closer to the lens, out of focus: still beads, but soft ones */
function buildCoil(env, pool, rw, seed) {
  const a = env.arc, SC = rw.sc;
  const X0 = -PAD, Y0 = Math.floor(a.crestY - rw.dr - rw.rad - rw.blur * 1.4 - 14), BW = W + PAD * 2, BH = H + 50 - Y0;
  const r = L.rng(seed), lim = a.span(PAD + 420);
  const cw = Math.ceil(BW * SC), ch = Math.ceil(BH * SC);
  const begin = () => { const c = L.makeCanvas(cw, ch), g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.scale(SC, SC); g.translate(-X0, -Y0); return [c, g]; };
  const [row, hg] = begin();
  const step = (rw.rad * 2 + rw.gap) / (a.R + rw.dr), pts = [];
  const ph = r.range(0, L.TAU), ph2 = r.range(0, L.TAU);
  for (let th = -lim + r.range(0, step); th < lim; th += step * r.range(0.985, 1.04)) {
    // a loose strand never lies on a perfect circle: it meanders, and comes a little nearer the lens here and there
    const rad = rw.rad * (1 + 0.045 * Math.sin(th * 5.3 + ph2) + r.range(-0.03, 0.03)), p = a.pt(th, rw.dr + rw.wave * Math.sin(th * 7.1 + ph) + r.range(-4, 4));
    pts.push({ cx: p.x, cy: p.y, rad, th, b: pool[r.int(0, pool.length - 1)] });
  }
  // the cord from bead to bead
  hg.lineCap = 'butt';
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], cwd = CORD * rw.rad / BR;
    hg.strokeStyle = '#351a04'; hg.lineWidth = cwd; hg.beginPath(); hg.moveTo(p.cx, p.cy); hg.lineTo(q.cx, q.cy); hg.stroke();
    hg.strokeStyle = '#a8691c'; hg.lineWidth = cwd * 0.6; hg.beginPath(); hg.moveTo(p.cx, p.cy - cwd * 0.12); hg.lineTo(q.cx, q.cy - cwd * 0.12); hg.stroke();
  }
  for (const q of pts) {
    const sz = q.b.size * q.rad / q.b.rad;
    hg.drawImage(q.b.base, q.cx - sz / 2, q.cy - sz / 2, sz, sz);
    hg.globalCompositeOperation = 'source-atop'; hg.fillStyle = `rgba(58,22,2,${r.range(0, 0.16).toFixed(3)})`;     // no two catch the same light
    hg.beginPath(); hg.arc(q.cx, q.cy, q.rad + 3, 0, L.TAU); hg.fill();
    hg.globalCompositeOperation = 'source-over';
  }
  // the clouds must outlive the blur: give them more contrast first
  hg.setTransform(1, 0, 0, 1, 0, 0); hg.globalCompositeOperation = 'overlay'; hg.globalAlpha = rw.punch; hg.drawImage(row, 0, 0);
  // the pool of light lies on the strand in focus: each nearer coil keeps a little of it on its crowns and sinks, bead by bead, into amber
  const top = a.R + rw.dr + rw.rad, bot = a.R + rw.dr - rw.rad;
  const tinted = multiplyKeepAlpha(row, (g) => {
    g.save(); g.scale(SC, SC); g.translate(-X0, -Y0);
    g.fillStyle = L.radial(g, a.cx, a.cy, bot, top, [[0, rw.tint[2]], [0.5, rw.tint[1]], [0.92, rw.tint[0]], [1, rw.tint[0]]]);
    g.fillRect(X0, Y0, BW, BH);
    g.restore();
  });
  const tg = tinted.getContext('2d');
  // back light on the crown of every bead → after the blur, a soft luminous arc along the top of each one
  tg.save(); tg.scale(SC, SC); tg.translate(-X0, -Y0);
  tg.globalCompositeOperation = 'source-atop'; tg.lineCap = 'round'; tg.strokeStyle = rw.rim; tg.lineWidth = rw.rad * 0.045; tg.globalAlpha = 0.5;
  for (const q of pts) { tg.beginPath(); tg.arc(q.cx, q.cy, q.rad - rw.rad * 0.04, q.th - Math.PI / 2 - 1.0, q.th - Math.PI / 2 + 0.75); tg.stroke(); }
  tg.restore();
  // the window mirrored on every bead: the lens will open it into a disc
  const [hl, lg] = begin();
  for (const q of pts) { const sz = q.b.size * q.rad / q.b.rad; lg.drawImage(q.b.worn, q.cx - sz / 2, q.cy - sz / 2, sz, sz); }
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-in'; lg.fillStyle = rw.spec; lg.fillRect(0, 0, cw, ch);
  tg.globalCompositeOperation = 'lighter'; tg.globalAlpha = rw.specA; tg.drawImage(hl, 0, 0);
  const bl = defocus(tinted, rw.blur * SC, { aexp: rw.aexp });
  return makeBand(X0, Y0, BW, BH, (g) => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(bl, X0, Y0, BW, BH);
    // deeper toward the bottom of the frame and away from the pool of light
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 640, a.R - 250, [[0, L.rgba('#341102', rw.deep)], [0.55, L.rgba('#341102', rw.deep * 0.4)], [1, 'rgba(52,17,2,0)']]);
    g.fillRect(X0, Y0, BW, BH);
    g.fillStyle = L.radial(g, W / 2 - 90, a.crestY + 260, 440, 1280, [[0, 'rgba(60,18,1,0)'], [0.5, 'rgba(60,18,1,0.2)'], [1, 'rgba(60,18,1,0.44)']]);
    g.fillRect(X0, Y0, BW, BH);
    g.globalCompositeOperation = 'source-over';
  });
}

/** dust hanging in the dark: pin-points and a few defocused discs; brighter near the lit strand */
function buildDust(env, seed, count, big) {
  const a = env.arc, r = L.rng(seed);
  return makeBand(-80, -80, W + 160, 900, (g) => {
    for (let i = 0; i < count; i++) {
      const x = r.range(-70, W + 70), y = r.range(-70, 800);
      const dr = a.drAt(x, y);
      const col = r.pick(['#ffe9b0', '#fff6e0', '#ffe08a', '#f2c25a']);
      const near = 0.35 + 0.65 * Math.exp(-Math.max(0, dr) / 300);
      const keep = r();
      if (dr < 16 || (!big && keep > 0.3 + 0.7 * Math.exp(-dr / 240))) continue;
      if (big) {
        const rad = r.range(4, 14), al = r.range(0.035, 0.1) * near;
        g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al * 0.8)], [0.72, L.rgba(col, al)], [0.9, L.rgba(col, al * 1.25)], [1, L.rgba(col, 0)]]);
        g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
      } else {
        const rad = L.lerp(0.7, 2.1, Math.pow(r(), 2.4)), al = r.range(0.12, 0.6) * near;
        if (rad > 1.3) { g.fillStyle = L.radial(g, x, y, 0, rad * 4, [[0, L.rgba(col, al * 0.3)], [1, L.rgba(col, 0)]]); g.beginPath(); g.arc(x, y, rad * 4, 0, L.TAU); g.fill(); }
        g.fillStyle = L.rgba(col, al); g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
      }
    }
    if (!big) {
      // a few floating fibres
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = r.range(60, W - 60), y = r.range(40, 620), dr = a.drAt(x, y);
        if (dr < 50) continue;
        const dir = r.range(0, L.TAU), len = r.range(12, 30), bend = r.range(-9, 9);
        g.strokeStyle = L.rgba('#ffe9b0', r.range(0.1, 0.22) * (0.4 + 0.6 * Math.exp(-dr / 300))); g.lineWidth = r.range(1.2, 1.5);
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(dir) * len / 2 - Math.sin(dir) * bend, y + Math.sin(dir) * len / 2 + Math.cos(dir) * bend, x + Math.cos(dir) * len, y + Math.sin(dir) * len);
        g.stroke();
      }
    }
  });
}

/** a twinkling mote: white core, honey skirt */
function buildMote() {
  const n = 64, c = L.makeCanvas(n, n), g = c.getContext('2d');
  g.fillStyle = L.radial(g, n / 2, n / 2, 0, n / 2, [[0, 'rgba(255,244,214,0.85)'], [0.16, 'rgba(255,230,160,0.4)'], [1, 'rgba(255,224,138,0)']]);
  g.fillRect(0, 0, n, n);
  return c;
}

export default {
  name: '蜜蜡珠串',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const { strand, beads } = buildStrand(env, makeLut(CLEAR), makeLut(CLOUD));
    const pool = beads.filter((b) => b.coc < 1).map((b) => b.sharp);    // the five in focus sit for the portraits of all the others
    const D1 = -(BR * 2) - 150 - 10;
    const near1 = buildCoil(env, pool, { rad: 150, gap: 30, dr: D1, blur: 16, sc: 0.5, punch: 0.36, wave: 11, tint: ['#ecd3a0', '#c18a48', '#76441a'], rim: '#ffe6aa', spec: '#ffe9b6', specA: 0.42, aexp: 0.7, deep: 0.42 }, 's02coilA');
    const near2 = buildCoil(env, pool, { rad: 216, gap: 40, dr: D1 - 150 - 216 + 62, blur: 40, sc: 0.25, punch: 0.4, wave: 16, tint: ['#a36e3a', '#70431a', '#42240b'], rim: '#e0a056', spec: '#f2c078', specA: 0.38, aexp: 0.75, deep: 0.8 }, 's02coilB');
    const rt = L.rng('s02twinkle'), motes = [];
    while (motes.length < 14) {
      const x = rt.range(40, W - 40), y = rt.range(30, 640);
      if (a.drAt(x, y) < 40) continue;
      motes.push({ x, y, rad: rt.range(1, 2.4), ph: rt(), k: rt.range(0.4, 1), vx: rt.range(-10, 10), vy: rt.range(-16, -4) });
    }
    const csz = pool[0].size;
    S = {
      strand, near1, near2, motes, mote: buildMote(),
      beads: beads.map((b) => ({ th: b.th, x: b.x, y: b.y, rad: b.rad, sharp: b.coc < 1, spec: b.coc < 1 ? b.sharp.spec : b.spr.worn, gloss: b.sharp.gloss, c: b.spr.c, size: b.spr.size, res: b.spr.res, fall: fallOf(b.x) })),
      tmp: L.makeCanvas(csz + 40, csz + 40),
      dustFar: buildDust(env, 's02dustA', 420, false),
      dustNear: buildDust(env, 's02dustB', 26, true),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.011, 0.011, p);
    ctx.fillStyle = '#070605'; ctx.fillRect(0, 0, W, H);
    // the strand's glow hanging in the air just above it
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 40, a.R + 300, [[0, 'rgba(210,112,20,0.075)'], [0.3, 'rgba(150,72,12,0.03)'], [1, 'rgba(90,42,8,0)']]);
    ctx.fillRect(0, 0, W, H);
    // dust: far motes barely move, the defocused near ones drift up and across
    blitBand(ctx, env, S.dustFar, { dx: 5 * (p - 0.5), dy: -8 * (p - 0.5) });
    blitBand(ctx, env, S.dustNear, { dx: -14 * (p - 0.5), dy: -20 * (p - 0.5) });
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const m of S.motes) {
      const tw = (0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin((p * 1.3 + m.ph) * L.TAU), 2)) * m.k;
      const x = m.x + m.vx * (p - 0.5), y = m.y + m.vy * (p - 0.5), rr = m.rad * 7;
      ctx.globalAlpha = tw;
      ctx.drawImage(S.mote, x - rr, y - rr, rr * 2, rr * 2);
    }
    ctx.restore();

    // warm darkness under the strand and between the coils
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 760, a.R - BR * 0.8, [[0, '#1b0902'], [0.5, '#3a1504'], [0.8, 'rgba(78,30,5,0.92)'], [1, 'rgba(78,30,5,0)']]);
    ctx.fillRect(0, a.crestY, W, H - a.crestY);
    // the strand in focus
    blitBand(ctx, env, S.strand, { rot });
    // the mirrored window: one per bead, sliding across it as the strand turns (the wear stays put under it); a gleam travels along the row
    const sweep = L.lerp(-0.2, -0.02, p), vis = a.span(160);
    const tg = S.tmp.getContext('2d'), tw = S.tmp.width, tm = 20;
    L.cam(ctx, env, { rot }, () => {
      ctx.globalCompositeOperation = 'screen';
      for (const b of S.beads) {
        const th = b.th + rot;
        if (th < -vis || th > vis) continue;
        const sh = -0.11 * (p - 0.5) * b.rad, sx = sh * Math.cos(b.th), sy = sh * Math.sin(b.th);
        const g = Math.exp(-((th - sweep) * (th - sweep)) / 0.03);
        ctx.globalAlpha = b.fall * (0.82 + 0.18 * g);
        if (b.sharp) {
          tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, tw, tw);
          tg.drawImage(b.spec, tm + sx, tm + sy);
          tg.globalCompositeOperation = 'destination-in'; tg.drawImage(b.gloss, tm, tm);
          ctx.drawImage(S.tmp, b.x - b.c - tm, b.y - b.c - tm);
        } else ctx.drawImage(b.spec, b.x - b.c * b.res + sx, b.y - b.c * b.res + sy, b.size * b.res, b.size * b.res);
      }
    });
    // the nearer coils, out of focus, in front of it (closer to the lens → they slide a little faster)
    blitBand(ctx, env, S.near1, { rot: rot * 1.45 });
    blitBand(ctx, env, S.near2, { rot: rot * 2 });

    const gl = a.pt(sweep, -70);
    L.glow(ctx, gl.x, gl.y, 330, '#ffd270', 0.07);
    L.vignette(ctx, { strength: 0.3, inner: 0.5 });
  },
};
