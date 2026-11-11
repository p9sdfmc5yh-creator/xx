// g15 — 孔雀石锈: a mineral-specimen plate. Botryoidal malachite (葡萄状石绿) crowds the strokes of the CURRENT GLYPH, with small
// sprays of azurite blades (蓝铜矿) growing out of it, on pale paper. Light from the top-left.
// Glyph by objects: K.pack strings the big knobs along the centre line of every stroke, a second pack of small dark knobs closes
// the gaps and draws the outline tight, and a per-pixel druse (L.pixelCanvas) lies under everything. Every size follows strokeWidth.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const TAU = Math.PI * 2;
let layer = null;

const lc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, al = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${al})`;
const HI0 = [112, 204, 162], HI1 = [172, 232, 204], MID0 = [12, 110, 76], MID1 = [40, 172, 124], LO0 = [5, 54, 40], LO1 = [10, 88, 66], DEEP = [3, 32, 24];
// slow colour drift across the specimen (0..1): deep green ↔ bright, slightly bluish green
const field = (x, y) => L.clamp(0.5 + 0.3 * Math.sin(x * 0.012 + 1.3) * Math.cos(y * 0.014 - 0.4) + 0.22 * Math.sin((x - y) * 0.008 + 2.1), 0, 1);

function layout(sw) {
  const rnd = L.rng('g15lay' + K.glyphInfo().key);
  const tone = (x, y, j) => L.clamp(field(x, y) + rnd.range(-j, j), 0, 1);
  // the big knobs: beads on the centre line of every stroke, smaller ones in what is left
  const discs = K.pack({ seed: 'g15main', rmax: sw * 0.52, rmin: Math.max(4.5, sw * 0.17), gap: 0.9, margin: 0 });
  // a few of the widest seats are given to azurite instead, well apart from each other
  const az = [];
  const seats = discs.filter((d) => d.r >= sw * 0.36).map((d) => ({ d, k: rnd() })).sort((a, b) => a.k - b.k);
  const want = Math.max(2, Math.round(seats.length * 0.17));
  for (const { d } of seats) {
    if (az.length >= want) break;
    if (az.some((c) => Math.hypot(c.x - d.x, c.y - d.y) < sw * 2.3)) continue;
    d.az = true; az.push({ x: d.x, y: d.y, R: d.r * rnd.range(1.15, 1.32), ang: d.ang });
  }
  const balls = [];
  for (const d of discs) if (!d.az) balls.push({ x: d.x, y: d.y, r: d.r * rnd.range(0.86, 1.07), lvl: 1, t: tone(d.x, d.y, 0.3), dk: rnd() < 0.24 ? rnd.range(0.18, 0.42) : rnd.range(0, 0.08) });
  // buds: smaller domes sitting on the shoulders of the big ones (what makes the crust look like bunches of grapes)
  const buds = [];
  for (const b of balls) {
    if (b.r < sw * 0.3 || rnd() > 0.5) continue;
    for (let k = rnd() < 0.3 ? 2 : 1; k > 0; k--) {
      const a = rnd() * TAU, r = b.r * rnd.range(0.34, 0.5), d = b.r * rnd.range(0.5, 0.8), x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
      if (K.sdGlyph(x, y) > -r * 0.92 || az.some((c) => Math.hypot(c.x - x, c.y - y) < c.R * 0.7 + r)) continue;
      buds.push({ x, y, r, lvl: 1, t: tone(x, y, 0.3), dk: rnd() < 0.2 ? rnd.range(0.15, 0.35) : 0 });
    }
  }
  // under-crust of small dark knobs: closes the gaps and draws the outline tight on the glyph
  const under = [];
  for (const d of K.pack({ seed: 'g15under', rmax: sw * 0.16, rmin: Math.max(2.2, sw * 0.07), gap: 0.84, margin: -Math.min(1.2, sw * 0.016) })) {
    if (balls.some((b) => Math.hypot(b.x - d.x, b.y - d.y) + d.r < b.r * 0.94)) continue;
    under.push({ x: d.x, y: d.y, r: d.r * 1.08, lvl: 0, t: tone(d.x, d.y, 0.2) });
  }
  return { az, balls, buds, under };
}

/** the bed everything grows on: a dark granular druse filling the glyph (ragged edge a hair inside the outline, bevelled so it has thickness) */
function matrix(sw) {
  const nz = L.makeNoise('g15mx'), bb = K.glyphInfo().bbox, bev = Math.max(2, sw * 0.06);
  const edge = (x, y) => K.sdGlyph(x, y) + 1.7 + 1.2 * nz.n2(x * 0.085, y * 0.085) + 0.5 * nz.n2(x * 0.33 + 9, y * 0.33);
  const hgt = (x, y, e) => 3.2 * L.smooth(-e / bev) + 0.85 * nz.n2(x * 0.42, y * 0.42) + 0.5 * nz.n2(x * 1.05 + 3, y * 1.05 - 5);
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const i0 = Math.max(0, Math.floor((bb.x0 - 4) * q)), i1 = Math.min(pw, Math.ceil((bb.x1 + 4) * q));
    const j0 = Math.max(0, Math.floor((bb.y0 - 4) * q)), j1 = Math.min(ph, Math.ceil((bb.y1 + 4) * q));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const x = (i + 0.5) / q, y = (j + 0.5) / q;
      if (K.sdGlyph(x, y) > 1.5) continue;
      const e = edge(x, y), a = L.clamp(0.5 - e * q * 0.6);
      if (a <= 0) continue;
      const lit = hgt(x, y, e) - hgt(x - 0.6, y - 0.75, edge(x - 0.6, y - 0.75));      // > 0 where the surface faces the light (top-left)
      const t = 0.3 + 0.4 * field(x, y), sh = L.clamp(0.62 + lit * 0.75, 0.25, 1.9), sp = lit > 0.55 ? (lit - 0.55) * 160 : 0, k = (j * pw + i) * 4;
      d[k] = (LO0[0] + (LO1[0] - LO0[0]) * t) * sh + sp * 0.7; d[k + 1] = (LO0[1] + (LO1[1] - LO0[1]) * t) * sh + sp; d[k + 2] = (LO0[2] + (LO1[2] - LO0[2]) * t) * sh + sp * 0.85;
      d[k + 3] = a * 255;
    }
  });
}

/** the velvety micro-relief of the knobs' surface: fine noise embossed toward the light, a neutral-grey overlay at device resolution */
function velvet() {
  const nz = L.makeNoise('g15vel'), bb = K.glyphInfo().bbox;
  const f = (x, y) => 0.6 * nz.n2(x * 0.3, y * 0.3) + 0.4 * nz.n2(x * 0.8 + 11, y * 0.8 - 4) + 0.22 * nz.n2(x * 1.7, y * 1.7 + 6);
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const i0 = Math.max(0, Math.floor((bb.x0 - 8) * q)), i1 = Math.min(pw, Math.ceil((bb.x1 + 8) * q));
    const j0 = Math.max(0, Math.floor((bb.y0 - 8) * q)), j1 = Math.min(ph, Math.ceil((bb.y1 + 8) * q));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const x = (i + 0.5) / q, y = (j + 0.5) / q;
      if (K.sdGlyph(x, y) > 5) continue;
      const k = (j * pw + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 128 + (70 + 60 * nz.n2(x * 0.017 + 40, y * 0.017)) * (f(x, y) - f(x - 0.55, y - 0.7)); d[k + 3] = 255;
    }
  });
}

function ball(g, b, rnd) {
  const { x, y, r, t, lvl } = b;
  // what it does to its neighbours: an occlusion ring all round its foot, and a shadow cast down-right. Only ONTO the crust
  // ('source-atop') — the paper gets its shadow from the whole layer, so the gaps between the strokes stay open.
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = L.radial(g, x, y, r * 0.9, r * 1.24, [[0, 'rgba(2,20,14,0.5)'], [1, 'rgba(2,20,14,0)']]);
  g.beginPath(); g.arc(x, y, r * 1.24, 0, TAU); g.fill();
  const ax = x + r * 0.2, ay = y + r * 0.3;
  g.fillStyle = L.radial(g, ax, ay, r * 0.7, r * 1.46, [[0, 'rgba(2,20,14,0.6)'], [0.5, 'rgba(2,20,14,0.24)'], [1, 'rgba(2,20,14,0)']]);
  g.beginPath(); g.arc(ax, ay, r * 1.46, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over';
  const dk = lvl ? (b.dk || 0) : 0.42;
  const hi = lc(lc(HI0, HI1, t), MID0, dk), mid = lc(lc(MID0, MID1, t), LO0, dk), lo = lc(LO0, LO1, t);
  g.fillStyle = L.radial(g, x - r * 0.36, y - r * 0.4, 0, r * 1.56, [[0, css(hi)], [0.17, css(lc(hi, mid, 0.6))], [0.45, css(mid)], [0.78, css(lo)], [1, css(DEEP)]]);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  if (r > 7.5) {
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    // growth bands: faint concentric shells, the signature of malachite
    const n = 2 + Math.floor(r / 8), bx = x + r * rnd.range(0.05, 0.2), by = y + r * rnd.range(0.08, 0.24), bs = rnd.range(0.35, 1.15);
    for (let k = 0; k < n; k++) {
      const rr = r * (0.26 + (0.86 * (k + rnd.range(0.2, 0.8))) / n);
      g.strokeStyle = k % 2 ? `rgba(2,40,27,${rnd.range(0.18, 0.34) * bs})` : `rgba(170,240,208,${rnd.range(0.14, 0.3) * bs})`;
      g.lineWidth = rnd.range(1.2, 2.6) * Math.min(1, r / 22);
      g.beginPath(); g.ellipse(bx, by, rr, rr * rnd.range(0.9, 1), rnd() * 3, 0, TAU); g.stroke();
    }
    // silky fibrous sheen: short hairlines fanning out from the lit pole
    g.lineCap = 'round';
    for (let k = 0, m = Math.round(r * 0.6); k < m; k++) {
      const a = rnd() * TAU, d0 = r * rnd.range(0.3, 0.8), d1 = d0 + r * rnd.range(0.08, 0.2);
      const px = x - r * 0.2, py = y - r * 0.22;
      g.strokeStyle = rnd() < 0.6 ? `rgba(196,246,222,${rnd.range(0.1, 0.22)})` : `rgba(0,36,24,${rnd.range(0.12, 0.24)})`;
      g.lineWidth = rnd.range(0.7, 1.1);
      g.beginPath(); g.moveTo(px + Math.cos(a) * d0, py + Math.sin(a) * d0); g.lineTo(px + Math.cos(a) * d1, py + Math.sin(a) * d1); g.stroke();
    }
    // the limb turns away from the eye: a darker band just inside the edge, heavier on the side away from the light
    g.fillStyle = L.radial(g, x - r * 0.1, y - r * 0.12, r * 0.72, r * 1.1, [[0, 'rgba(2,26,18,0)'], [1, 'rgba(2,26,18,0.5)']]);
    g.fillRect(x - r, y - r, r * 2, r * 2);
    // light bounced back into the shaded rim
    g.strokeStyle = L.linear(g, x, y, x + r * 0.75, y + r * 0.75, [[0.55, 'rgba(120,225,180,0)'], [1, 'rgba(120,225,180,0.34)']]);
    g.lineWidth = r * 0.1; g.beginPath(); g.arc(x, y, r * 0.93, 0.05 * Math.PI, 0.5 * Math.PI); g.stroke();
    g.restore();
  }
  // crisp rim
  g.strokeStyle = 'rgba(2,28,20,0.4)'; g.lineWidth = Math.min(1, r * 0.12); g.beginPath(); g.arc(x, y, r - 0.5, 0, TAU); g.stroke();
  // specular: a soft bloom and a small hard glint (the bright core), top-left
  const sx = x - r * 0.38, sy = y - r * 0.42, sa = lvl ? 0.6 : 0.34;
  g.save(); g.translate(sx, sy); g.rotate(-0.78); g.scale(1, 0.62);
  g.fillStyle = L.radial(g, 0, 0, 0, r * 0.36, [[0, `rgba(255,255,250,${sa})`], [0.45, `rgba(235,255,245,${sa * 0.4})`], [1, 'rgba(235,255,245,0)']]);
  g.beginPath(); g.arc(0, 0, r * 0.36, 0, TAU); g.fill(); g.restore();
  if (r > 5) {
    g.fillStyle = `rgba(255,255,255,${lvl ? 0.92 : 0.7})`; g.beginPath(); g.ellipse(sx - r * 0.02, sy - r * 0.02, r * 0.09, r * 0.052, -0.78, 0, TAU); g.fill();
    if (r > 16) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(sx + r * 0.17, sy - r * 0.1, r * 0.03, r * 0.022, -0.78, 0, TAU); g.fill(); }
  }
}

const AZ_D = [8, 20, 86], AZ_L = [84, 132, 236];
function crystal(g, bx, by, th, len, w, rnd, k) {
  const tipY = w * rnd.range(-0.22, 0.22), ry = w * rnd.range(-0.14, 0.14), h = w / 2, lw = Math.max(0.6, Math.sqrt(k));
  const A = [0, -h * 0.62], B = [len * rnd.range(0.74, 0.84), -h], T = [len, tipY], C = [len * rnd.range(0.8, 0.9), h], D = [0, h * 0.62], Rg = [0, ry];
  const lam = (-Math.sin(th) + Math.cos(th)) * 0.7071;                 // how much the facet on the local −y side faces the top-left light
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  g.save(); g.translate(bx, by); g.rotate(th);
  g.shadowColor = 'rgba(3,10,34,0.55)'; g.shadowBlur = 5 * k; g.shadowOffsetX = 3 * k; g.shadowOffsetY = 4.5 * k;
  poly([A, B, T, C, D]); g.fillStyle = css(AZ_D); g.fill();
  g.shadowColor = 'transparent';
  for (const [pts, l] of [[[A, B, T, Rg], lam], [[Rg, T, C, D], -lam]]) {
    const col = lc(AZ_D, AZ_L, Math.pow(0.5 + 0.5 * l, 1.25));
    poly(pts); g.fillStyle = L.linear(g, 0, 0, len, 0, [[0, css(lc(col, [4, 10, 44], 0.55))], [0.55, css(col)], [1, css(lc(col, [150, 190, 255], 0.22))]]); g.fill();
  }
  // glassy streak on the lit facet, cleavage lines across the blade
  const up = lam > 0 ? -1 : 1;
  poly([[len * 0.18, ry + up * h * 0.2], [len * 0.72, ry * 0.6 + up * h * 0.34], [len * 0.7, ry * 0.6 + up * h * 0.62], [len * 0.2, ry + up * h * 0.42]]);
  g.fillStyle = 'rgba(200,225,255,0.2)'; g.fill();
  g.strokeStyle = 'rgba(3,10,44,0.3)'; g.lineWidth = 0.8 * lw;
  for (let i = 0, m = rnd.int(1, 3); i < m; i++) { const u = len * rnd.range(0.2, 0.7); g.beginPath(); g.moveTo(u, -h * 0.8); g.lineTo(u + rnd.range(-2, 2) * k, h * 0.8); g.stroke(); }
  poly([A, B, T, C, D]); g.strokeStyle = 'rgba(3,8,40,0.72)'; g.lineWidth = 1.1 * lw; g.lineJoin = 'round'; g.stroke();
  g.strokeStyle = 'rgba(206,226,255,0.78)'; g.lineWidth = 1.1 * lw; g.lineCap = 'round';
  g.beginPath(); g.moveTo(len * 0.12, ry); g.lineTo(T[0] - 1, T[1]); g.stroke();
  // a hard glint where the ridge catches the lamp
  if (rnd() < 0.6) { const u = rnd.range(0.4, 0.75); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(len * u, ry + (tipY - ry) * u, w * 0.2, Math.max(0.5, w * 0.055), 0, 0, TAU); g.fill(); }
  g.restore();
}

function azurite(g, c, rnd) {
  const k = c.R / 53;
  // druzy base: small dark blue nodules
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU, d = c.R * rnd.range(0, 0.5), r = c.R * rnd.range(0.11, 0.2), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (K.sdGlyph(x, y) > -r) continue;
    g.fillStyle = L.radial(g, x + 1.5 * k, y + 2.5 * k, r * 0.7, r * 1.4, [[0, 'rgba(2,8,30,0.5)'], [1, 'rgba(2,8,30,0)']]); g.beginPath(); g.arc(x + 1.5 * k, y + 2.5 * k, r * 1.4, 0, TAU); g.fill();
    g.fillStyle = L.radial(g, x - r * 0.35, y - r * 0.4, 0, r * 1.5, [[0, '#5d8ce8'], [0.3, '#2147ae'], [0.75, '#0c1f66'], [1, '#050d38']]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(235,244,255,0.8)'; g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.4, r * 0.13, r * 0.08, -0.78, 0, TAU); g.fill();
  }
  const n = rnd.int(13, 17), cr = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU + rnd.range(-0.22, 0.22), w = c.R * rnd.range(0.2, 0.33);
    let len = c.R * rnd.range(0.62, 1.04) * (1 + 0.3 * Math.abs(Math.cos(th - c.ang)));      // the spray runs a little further along the stroke
    const bx = c.x + Math.cos(th) * c.R * 0.06, by = c.y + Math.sin(th) * c.R * 0.06;
    for (let j = 0; j < 14; j++) {
      const tx = bx + Math.cos(th) * len, ty = by + Math.sin(th) * len, px = -Math.sin(th) * w * 0.5, py = Math.cos(th) * w * 0.5;
      if (K.sdGlyph(tx, ty) < -2.5 * k && K.sdGlyph(tx * 0.85 + bx * 0.15 + px, ty * 0.85 + by * 0.15 + py) < -1.5 * k && K.sdGlyph(tx * 0.85 + bx * 0.15 - px, ty * 0.85 + by * 0.15 - py) < -1.5 * k) break;
      len *= 0.88;
    }
    if (len > c.R * 0.3) cr.push({ th, len, w, bx, by });
  }
  cr.sort((p, q) => q.len - p.len);
  for (const b of cr) crystal(g, b.bx, b.by, b.th, b.len, b.w, rnd, k);
  // a few stubby crystals standing up in the middle
  for (let i = 0; i < 5; i++) {
    const a = rnd() * TAU, d = c.R * rnd.range(0, 0.2);
    crystal(g, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, rnd() * TAU, c.R * rnd.range(0.25, 0.38), c.R * rnd.range(0.19, 0.26), rnd, k);
  }
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, u = sw / 75;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#f2ecdc', tone: '#8a6f42', seed: 'g15paper', fiber: 0.5, stain: 0.24, foxing: 0.18, edge: 0.18 }), 0, 0);
  const { az, balls, buds, under } = layout(sw);
  const rnd = L.rng('g15draw' + info.key);
  // the whole specimen on its own layer, so that it can throw one shadow on the paper
  const crust = L.makeCanvas(S, S), q = crust.getContext('2d');
  q.drawImage(matrix(sw), 0, 0);
  // lower-right knobs first, so the ones nearer the light overlap and shade them
  const order = (a, b) => (b.x + b.y) - (a.x + a.y);
  under.sort(order); for (const b of under) ball(q, b, rnd);
  for (const list of [balls, buds]) {
    list.forEach((b) => { b.k = b.x + b.y + rnd.range(-40, 40) * u; }); list.sort((a, b) => b.k - a.k);
    for (const b of list) ball(q, b, rnd);
  }
  K.soak(crust, velvet(), 0.62, 'overlay');
  for (const k of az) azurite(q, k, rnd);
  // crumbs of green dust shed on the paper right beside the crust
  for (let i = 0, n = 0; i < 6000 && n < 48; i++) {
    const x = rnd.range(info.bbox.x0 - 16, info.bbox.x1 + 16), y = rnd.range(info.bbox.y0 - 16, info.bbox.y1 + 16), sd = K.sdGlyph(x, y);
    if (sd < 3 || sd > 15 * u + 3) continue;
    const r = rnd.range(0.5, 1.7) * Math.max(0.6, Math.sqrt(u)); n++;
    g.fillStyle = 'rgba(40,30,12,0.3)'; g.beginPath(); g.arc(x + r * 0.5, y + r * 0.7, r * 1.15, 0, TAU); g.fill();
    g.fillStyle = css(lc(MID0, MID1, rnd()), rnd.range(0.7, 0.95)); g.beginPath(); g.ellipse(x, y, r, r * rnd.range(0.6, 1), rnd() * 3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,245,225,0.7)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); g.fill();
  }
  // onto the paper: a long soft cast shadow toward the lower right, then a tight dark contact shadow
  K.stamp(g, crust, S / 2, S / 2, { shadow: { dx: 4.5 * u, dy: 7 * u, blur: 8 * u, color: 'rgba(52,36,16,0.4)' } });
  K.stamp(g, crust, S / 2, S / 2, { shadow: { dx: 1.2 * u, dy: 2 * u, blur: 2.4 * u, color: 'rgba(30,22,8,0.5)' } });
  return c;
}

export default {
  name: '孔雀石锈',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },        // 3-frame flash: perfectly still
};
