// g08 — 算珠: dark-brown turned-wood abacus beads on ochre paper, spelling the CURRENT glyph (whichever the cut list picked).
// K.pack strings discs along the strokes (settle() then closes the gaps); every disc holds one bead sized by the stroke width:
//   · lying flat, seen down its bore (flat lathe face, bevel, shoulder falling to the ridge), or
//   · leaning on its edge along the stroke, so that the bicone profile, the end face and the bore all show.
// Every bead is shaded per DEVICE pixel from its own geometry (light from the top-left), then gets grain pores and scratches;
// three shadows per bead (long soft cast, half shadow that also falls on its neighbours, tight contact) sit it on the paper.
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
const SUB = [[-0.125, -0.375], [0.375, -0.125], [-0.375, 0.125], [0.125, 0.375]];   // rotated-grid sub-samples (device px)
const STEPS = 26;

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

// key light from the top-left, a little sky, warm light bounced off the ochre paper into the shadow side, waxed-wood highlight
function lit(out, nx, ny, nz, ar, ag, ab, gloss, occ) {
  const d = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  const h = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
  const bnc = Math.max(0, nx * 0.52 + ny * 0.62 - nz * 0.22) * 0.22 * occ;
  const k = (0.22 + 0.05 * nz + 0.95 * d) * occ;
  const sp = (Math.pow(h, 60) * 0.85 + Math.pow(h, 10) * 0.14) * gloss * occ;
  out[0] = ar * (k + bnc * 1.25) + 255 * sp; out[1] = ag * (k + bnc) + 238 * sp; out[2] = ab * (k + bnc * 0.6) + 205 * sp;
}

// dark hardwood: broad growth bands bent by noise (scaled with the bead) + fine fibres running along the grain (fixed, pixel-sized)
function makeWood(seed, rad = 38) {
  const r = L.rng(seed); const nz = vnoise(seed + 'n');
  const a = r.range(0, Math.PI), ca = Math.cos(a), sa = Math.sin(a), sc = 1 / Math.min(1.25, Math.max(0.5, rad / 38));
  const f = r.range(0.24, 0.38) * sc, ph = r.range(0, 10), tint = r.range(-1, 1), val = r.range(0.84, 1.12);
  const dk = [45 + 6 * tint, 24 + 3 * tint, 13], lt = [134 + 10 * tint, 79 + 5 * tint, 40];
  const fn = (x, y, out) => {
    const u = x * ca + y * sa, v = -x * sa + y * ca;
    const band = 0.5 + 0.5 * Math.sin(v * f + ph + 4.5 * nz(u * 0.018 * sc + 7, v * 0.05 * sc + 3));
    const m = 0.5 * band * band + 0.32 * nz(u * 0.07 + 20, v * 0.85 + 9) + 0.18 * nz(u * 0.22 + 50, v * 1.6 + 1);
    out[0] = mixn(dk[0], lt[0], m) * val; out[1] = mixn(dk[1], lt[1], m) * val; out[2] = mixn(dk[2], lt[2], m) * val;
    return m;
  };
  fn.angle = a;
  return fn;
}

// pores (short dark dashes along the grain), a few pale hairline scratches, now and then a small dent — drawn as paths (4K-native)
function micro(c, rad, seed, grainAng, dents = true) {
  const g = c.getContext('2d'), r = L.rng(seed + 'm'), w = c.width;
  const dens = Math.max(0.1, (rad * rad) / (38 * 38)), ls = Math.max(0.45, Math.sqrt(rad / 38));
  g.save(); g.translate(w / 2, w / 2); g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round';
  const ca = Math.cos(grainAng), sa = Math.sin(grainAng);
  for (let i = 0, n = Math.round(r.int(30, 44) * dens) + 3; i < n; i++) {
    const x = r.range(-rad, rad), y = r.range(-rad, rad), len = r.range(2, 7) * ls;
    g.strokeStyle = `rgba(22,10,4,${r.range(0.16, 0.34).toFixed(3)})`; g.lineWidth = r.range(0.5, 1.0);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + ca * len, y + sa * len); g.stroke();
  }
  for (let i = 0, n = Math.round(r.int(3, 6) * Math.sqrt(dens)) + 1; i < n; i++) {
    const x = r.range(-rad, rad) * 0.8, y = r.range(-rad, rad) * 0.8, len = r.range(5, 14) * ls, a = r() * TAU;
    g.strokeStyle = `rgba(232,196,150,${r.range(0.08, 0.17).toFixed(3)})`; g.lineWidth = r.range(0.45, 0.8);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.2) * len * 0.5, y + Math.sin(a + 0.2) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  if (dents && rad > 16) for (let i = 0, n = r.int(0, 2); i < n; i++) {
    const a = r() * TAU, d = rad * r.range(0.6, 0.9), x = Math.cos(a) * d, y = Math.sin(a) * d, s = r.range(1.0, 2.0);
    g.fillStyle = 'rgba(18,8,3,0.36)'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(240,205,160,0.28)'; g.beginPath(); g.ellipse(x + s * 0.5, y + s * 0.6, s * 0.7, s * 0.3, 0.7, 0, TAU); g.fill();
  }
  g.restore();
  return c;
}

// bead lying flat, seen down its bore: chamfered bore, gently domed lathe face, worn bevel, convex shoulder falling to the ridge
function topBead(rad, seed) {
  const w = 2 * Math.ceil(rad + 3);
  const wood = makeWood(seed, rad), r = L.rng(seed + 't');
  const rh = rad * r.range(0.21, 0.25), rf = rad * r.range(0.46, 0.54), lph = r.range(0, 6), tx = r.range(-0.05, 0.05), ty = r.range(-0.05, 0.05);
  const uf = (rf - rh) / (rad - rh), ring = Math.min(1, rad / 30), col = [0, 0, 0], o = [0, 0, 0];
  const c = L.pixelCanvas(w, w, (d, pw, ph, q) => {
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      const dx = (i + 0.5) / q - w / 2, dy = (j + 0.5) / q - w / 2, rr = Math.hypot(dx, dy);
      if (rr > rad + 1) continue;
      const p = (j * pw + i) * 4, uu = Math.max(0, (rr - rh) / (rad - rh));
      let k = 0.04 + 0.2 * Math.min(1, uu / uf);                                                   // the face: almost flat
      k = mixn(k, 0.78 + 1.5 * Math.pow(c01((uu - uf) / (1 - uf)), 1.6), sstep(uf - 0.05, uf + 0.06, uu));   // the shoulder
      k = mixn(-1.4, k, sstep(0.0, 0.09, uu));                                                     // chamfer into the bore
      k += 0.07 * ring * Math.sin(rr * 2.3 + lph);                                                 // lathe rings catch the light
      const il = 1 / Math.hypot(k, 1), inr = rr > 0.001 ? 1 / rr : 0;
      const gm = wood(dx, dy, col);
      const du = (uu - uf) / 0.04;
      const lathe = (1 + 0.07 * Math.sin(rr * 1.7 + lph) + 0.04 * Math.sin(rr * 4.1 + lph * 2)) * (1 + 0.26 * Math.exp(-du * du));
      const occ = 1 - 0.24 * sstep(0.9, 1.0, uu);
      lit(o, k * dx * inr * il + tx, k * dy * inr * il + ty, il, col[0] * lathe, col[1] * lathe, col[2] * lathe, 0.45 + 0.9 * gm, occ);
      if (rr < rh + 0.5) {                                         // the bore: lit wall on the lower right, shadowed paper at the bottom
        const qq = rr / rh, t = Math.max(0, (dx * 0.63 + dy * 0.77) / rh);
        const wall = sstep(0.3, 1, qq) * t, deep = sstep(0.7, 0, qq);
        const hb = c01((rh - rr) * q + 0.5);
        o[0] = mixn(o[0], 24 + 118 * wall + 44 * deep, hb); o[1] = mixn(o[1], 13 + 76 * wall + 28 * deep, hb); o[2] = mixn(o[2], 6 + 38 * wall + 9 * deep, hb);
      }
      d[p] = o[0]; d[p + 1] = o[1]; d[p + 2] = o[2]; d[p + 3] = 255 * c01((rad - rr) * q + 0.5);
    }
  });
  return micro(c, rad, seed, wood.angle);
}

// bead leaning on its edge: the rounded bicone (a solid of revolution with a bore) with its axis tipped `tilt` up from the page and
// turned `rot` in the page, ray-cast straight down per sub-sample. The rotation is baked in, so the sprite is stamped unrotated (crisp).
function leanBead(rad, rot, tilt, seed) {
  const w = 2 * Math.ceil(rad + 3);
  const wood = makeWood(seed, rad), r = L.rng(seed + 's');
  const T = rad * r.range(0.54, 0.60), rf = rad * r.range(0.47, 0.52), rh = rad * r.range(0.21, 0.245), lph = r.range(0, 6);
  const ca = Math.cos(tilt), sa = Math.sin(tilt), cr = Math.cos(rot), sr = Math.sin(rot);
  const bev = Math.max(0.5, rad * 0.045), R2 = rad * rad, rh2 = rh * rh, kS = (rad - rf) / T, col = [0, 0, 0], o = [0, 0, 0];
  const inside = (x, y, t) => {
    const s = x * ca + t * sa, e = (s < 0 ? -s : s) / T; if (e > 1) return false;
    const r2 = x * x + y * y + t * t - s * s; if (r2 < rh2) return false;
    const p = rf + (rad - rf) * (1 - (0.62 * e + 0.38 * e * e)); return r2 <= p * p;
  };
  const c = L.pixelCanvas(w, w, (d, pw, ph, q) => {
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      const px = (i + 0.5) / q - w / 2, py = (j + 0.5) / q - w / 2;
      if (px * px + py * py > (rad + 1) * (rad + 1)) continue;
      let R = 0, G = 0, B = 0, n = 0;
      for (let k = 0; k < 4; k++) {
        const qx = px + SUB[k][0] / q, qy = py + SUB[k][1] / q;
        const x = qx * cr + qy * sr, y = -qx * sr + qy * cr, rr2 = x * x + y * y;
        if (rr2 >= R2) continue;
        const tm = Math.sqrt(R2 - rr2); let t1 = Math.min(tm, (T - x * ca) / sa); const t0 = Math.max(-tm, (-T - x * ca) / sa);
        if (t1 <= t0) continue;
        t1 -= 1e-3;
        const dt = (t1 - t0) / STEPS; let th = t1, hit = inside(x, y, t1);
        if (!hit) for (let m = 1; m <= STEPS; m++) {
          const t = t1 - m * dt;
          if (inside(x, y, t)) {
            let a = t + dt, b = t;
            for (let it = 0; it < 7; it++) { const mid = (a + b) / 2; if (inside(x, y, mid)) b = mid; else a = mid; }
            th = b; hit = true; break;
          }
        }
        if (!hit) continue;
        const s = x * ca + th * sa, as = Math.abs(s), e = Math.min(1, as / T), sg = s < 0 ? -1 : 1;
        const vx = x - s * ca, vz = th - s * sa, rd = Math.hypot(vx, y, vz) || 1e-6, ux = vx / rd, uy = y / rd, uz = vz / rd;
        const pr = rf + (rad - rf) * (1 - (0.62 * e + 0.38 * e * e)), dp = -sg * kS * (0.62 + 0.76 * e) * sstep(0, rad * 0.035, as);
        const wC = Math.max(0, 1 - (T - as) / bev), wB = Math.max(0, 1 - (rd - rh) / bev), wO = Math.max(0, 1 - (pr - rd) / bev);
        const ox = ux - dp * ca, oy = uy, oz = uz - dp * sa, ol = 1 / (Math.hypot(ox, oy, oz) || 1);
        const a2 = wC * wC, b2 = wB * wB, o2 = wO * wO;
        let nx = a2 * sg * ca - b2 * ux + o2 * ox * ol, ny = -b2 * uy + o2 * oy * ol, nz = a2 * sg * sa - b2 * uz + o2 * oz * ol;
        const nl = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= nl; ny *= nl; nz *= nl;
        const gm = wood(x, y * 1.35, col);
        let mm, occ, gloss = 0.45 + 0.9 * gm;
        if (wB > wC && wB > wO) { mm = 0.8; occ = mixn(0.42, 0.10, c01((T - s) / (T * 1.1))); gloss *= 0.15; }                 // down the bore
        else if (wC >= wO) { mm = 1 + 0.07 * Math.sin(rd * 1.7 + lph) + 0.04 * Math.sin(rd * 3.6 + lph * 2); occ = 1 - 0.3 * wB; }   // the lathe face
        else { mm = (1 + 0.42 * sstep(rad * 0.055, 0, as)) * (1 + 0.06 * Math.sin(as * 1.9 + lph)) * (1 + 0.2 * wC); occ = 1; }   // the cones, worn pale on the ridge
        occ *= mixn(0.66, 1, sstep(-0.75, 0.35, th / rad));                                                                      // darker toward the paper
        lit(o, nx * cr - ny * sr, nx * sr + ny * cr, nz, col[0] * mm, col[1] * mm, col[2] * mm, gloss, occ);
        R += Math.min(255, o[0]); G += Math.min(255, o[1]); B += Math.min(255, o[2]); n++;
      }
      if (!n) continue;
      const p = (j * pw + i) * 4;
      d[p] = R / n; d[p + 1] = G / n; d[p + 2] = B / n; d[p + 3] = 255 * n / 4;
    }
  });
  return micro(c, rad, seed, wood.angle + rot, false);
}

// K.pack parks its discs at random, which leaves gaps along a stroke. So: pack too many (overlapping), let them push each other
// apart inside the outline until they just touch, drop what still overlaps badly, then fill any hole that is left.
function settle(slots, R1, R0, OUT, bbox) {
  const P = slots.map((s) => ({ x: s.x, y: s.y, r: s.r })), n = P.length, TGT = 0.98;
  const mv = new Float32Array(n * 2);
  for (let it = 0; it < 56; it++) {
    mv.fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * TGT;
      if (dx > min || dx < -min || dy > min || dy < -min) continue;
      const d = Math.hypot(dx, dy); if (d >= min) continue;
      const ov = (min - d) * 0.7, ux = d > 1e-3 ? dx / d : 1, uy = d > 1e-3 ? dy / d : 0;
      const wa = (b.r * b.r) / (a.r * a.r + b.r * b.r), wb = 1 - wa;                       // the lighter bead gives way
      mv[i * 2] -= ux * ov * wa; mv[i * 2 + 1] -= uy * ov * wa; mv[j * 2] += ux * ov * wb; mv[j * 2 + 1] += uy * ov * wb;
    }
    for (let i = 0; i < n; i++) {
      const a = P[i]; let mx = mv[i * 2], my = mv[i * 2 + 1]; const ml = Math.hypot(mx, my); if (ml < 0.02) continue;
      const cap = a.r * 0.22; if (ml > cap) { mx *= cap / ml; my *= cap / ml; }
      let x = a.x + mx, y = a.y + my, v = K.sdGlyph(x, y) + a.r - OUT;
      for (let k = 0; k < 3 && v > 0.05; k++) { const nn = K.glyphNormal(x, y, 2); x -= nn.x * (v + 0.1); y -= nn.y * (v + 0.1); v = K.sdGlyph(x, y) + a.r - OUT; }
      if (v <= 0.75) { a.x = x; a.y = y; }                                                // never leaves the stroke
    }
  }
  const alive = new Uint8Array(n).fill(1), order = P.map((_, i) => i).sort((i, j) => P[i].r - P[j].r);
  for (const i of order) {
    const a = P[i];
    for (let j = 0; j < n; j++) {
      if (j === i || !alive[j]) continue;
      const b = P[j]; if (Math.hypot(b.x - a.x, b.y - a.y) < (a.r + b.r) * 0.9) { alive[i] = 0; break; }
    }
  }
  const out = P.filter((_, i) => alive[i]);
  const pitch = Math.max(2, R0 * 0.45), cand = [];
  for (let y = bbox.y0; y <= bbox.y1; y += pitch) for (let x = bbox.x0; x <= bbox.x1; x += pitch) {
    let rr = Math.min(R1 + OUT, OUT - K.sdGlyph(x, y)); if (rr < R0) continue;
    for (let k = 0; k < out.length && rr >= R0; k++) { const b = out[k], lim = Math.hypot(b.x - x, b.y - y) / 0.97 - b.r; if (lim < rr) rr = lim; }
    if (rr >= R0) cand.push({ x, y, r: rr });
  }
  cand.sort((a, b) => b.r - a.r);
  const m0 = out.length;
  for (const p of cand) {
    let ok = true;
    for (let k = m0; k < out.length && ok; k++) { const b = out[k]; if (Math.hypot(b.x - p.x, b.y - p.y) < (b.r + p.r) * 0.97) ok = false; }
    if (ok) out.push(p);
  }
  for (const p of out) p.ang = K.strokeAngle(p.x, p.y, Math.max(p.r * 1.7, 16));
  return out;
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#d3a44e', tone: '#7a4a17', seed: 'g08paper', fiber: 0.7, stain: 0.42, grain: 0.09, foxing: 0.22, edge: 0.3 }), 0, 0);
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,236,190,0.07)'], [0.5, 'rgba(255,236,190,0)'], [1, 'rgba(70,36,6,0.08)']]);   // the light falls off toward the lower right
  g.fillRect(0, 0, S, S);
  { // the paper under the heap is a shade darker (the beads keep the light off it): a soft occlusion that follows the strokes
    const u = L.makeCanvas(S, S); K.fillGlyph(u.getContext('2d'), 'rgb(88,48,12)', { grow: -sw * 0.1 });
    g.save(); g.globalAlpha = 0.2; g.filter = `blur(${(sw * 0.09).toFixed(2)}px)`; g.drawImage(u, 0, 0); g.restore();
  }

  // one bead per disc: as wide as the stroke on its centre line (strung like beads on a rod), smaller ones in what is left
  const R1 = sw * 0.5, OUT = Math.min(1.2, sw * 0.02), R0 = Math.max(4.5, R1 * 0.34);
  const slots = settle(K.pack({ seed: 'g08pack', rmax: R1 + OUT, rmin: R0, gap: 0.78, margin: -OUT }), R1, R0, OUT, info.bbox);
  const r = L.rng('g08lay' + info.key), q = L.SS, snap = (v) => Math.round(v * q) / q;
  const items = slots.map((s, i) => {
    const big = s.r / (R1 + OUT), seed = 'g08b' + info.key + i;
    const lean = r.chance(big > 0.7 ? 0.38 : big > 0.45 ? 0.22 : 0);
    const x = snap(s.x), y = snap(s.y);
    if (lean) {
      const rad = s.r * r.range(1.02, 1.05), rot = s.ang + (r.chance(0.5) ? Math.PI : 0) + r.range(-0.2, 0.2);
      return { x, y, rad, z: rad * 1.15, h: rad * 0.8, spr: leanBead(rad, rot, r.range(0.62, 0.92), seed) };
    }
    const rad = s.r * r.range(0.985, 1.015);
    return { x, y, rad, z: rad, h: rad * 0.58, spr: topBead(rad, seed) };
  }).sort((a, b) => a.z - b.z);                                      // small ones first: the big beads and the leaning ones rest on them

  // shadows are cast by stamping the sprite far off the page with the offset added back, so that only the shadow lands here
  const OFF = S * 2;
  const shade = (it, kx, ky, kb, color) => K.stamp(g, it.spr, it.x - OFF, it.y, { shadow: { dx: OFF + it.h * kx, dy: it.h * ky, blur: it.h * kb, color } });
  for (const it of items) shade(it, 0.27, 0.39, 0.52, 'rgba(58,30,6,0.35)');           // long soft cast shadow on the paper
  for (const it of items) {
    shade(it, 0.14, 0.2, 0.2, 'rgba(40,19,4,0.5)');                                 // half shadow: also falls on the beads already down
    shade(it, 0.05, 0.075, 0.11, 'rgba(26,11,2,0.60)');                                // tight contact shadow
    K.stamp(g, it.spr, it.x, it.y, { shadow: false });
  }
  return c;
}

export default {
  name: '算珠',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
