// g15 — 孔雀石锈: a mineral-specimen plate. Botryoidal malachite (葡萄状石绿) crowds the whole body of the coin glyph,
// with small sprays of azurite blades (蓝铜矿) growing out of it, on pale paper. Light from the top-left.
// Glyph by objects: a row of knobs hugging the outer circle, a row lining the square hole, the space between packed.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const G = K.GLYPH; const TAU = Math.PI * 2;
let layer = null;

const lc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, al = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${al})`;
const HI0 = [128, 216, 176], HI1 = [186, 238, 212], MID0 = [12, 110, 76], MID1 = [40, 172, 124], LO0 = [5, 54, 40], LO1 = [10, 88, 66], DEEP = [3, 32, 24];
// slow colour drift across the specimen (0..1): deep green ↔ bright, slightly bluish green
const field = (x, y) => L.clamp(0.5 + 0.3 * Math.sin(x * 0.012 + 1.3) * Math.cos(y * 0.014 - 0.4) + 0.22 * Math.sin((x - y) * 0.008 + 2.1), 0, 1);

function layout() {
  const rnd = L.rng('g15lay');
  const az = K.scatter({ seed: 'g15az', spacing: 205, margin: 52, max: 9 }).map((p) => ({ x: p.x, y: p.y, R: rnd.range(46, 60) }));
  const inAz = (x, y, k) => az.some((c) => Math.hypot(c.x - x, c.y - y) < c.R * k);
  const balls = [];
  const push = (x, y, r) => { if (!inAz(x, y, 0.42)) balls.push({ x, y, r, lvl: 1, t: L.clamp(field(x, y) + rnd.range(-0.18, 0.18), 0, 1) }); };
  // row hugging the outer circle
  let th = rnd() * TAU; const th0 = th;
  while (th < th0 + TAU - 0.04) { const r = rnd.range(19, 33), rr = G.R - r; push(G.cx + Math.cos(th) * rr, G.cy + Math.sin(th) * rr, r); th += (r * 1.62) / rr; }
  // rows lining the four straight sides of the hole, and a knob on each corner
  for (let s = 0; s < 4; s++) {
    let u = -G.a - 2;
    while (u < G.a + 6) {
      const r = rnd.range(15, 23), off = G.a + r;
      const [x, y] = s === 0 ? [u, -off] : s === 1 ? [off, u] : s === 2 ? [-u, off] : [-off, -u];
      push(G.cx + x, G.cy + y, r); u += r * 1.6;
    }
    const cr = 17, d = G.a + cr * 0.73, sx = s < 2 ? -1 : 1, sy = s % 2 ? -1 : 1;
    push(G.cx + sx * d, G.cy + sy * d, cr);
  }
  // fill: big knobs first, then smaller ones in the gaps (they may overlap ~20 %, like crowded domes)
  for (const [r0, r1, tries] of [[31, 44, 900], [23, 31, 1800], [15, 23, 3600]]) {
    for (let i = 0; i < tries; i++) {
      const r = rnd.range(r0, r1), x = G.cx + (rnd() * 2 - 1) * G.R, y = G.cy + (rnd() * 2 - 1) * G.R;
      if (K.sdGlyph(x, y) > -r) continue;
      let ok = true;
      for (const b of balls) if (Math.hypot(b.x - x, b.y - y) < (b.r + r) * 0.8) { ok = false; break; }
      if (ok) push(x, y, r);
    }
  }
  // under-crust of small dark knobs: closes the gaps and draws the outline tight on the glyph
  const under = [];
  const pushU = (x, y, r) => {
    for (const b of balls) if (Math.hypot(b.x - x, b.y - y) + r < b.r * 0.96) return;
    under.push({ x, y, r, lvl: 0, t: L.clamp(field(x, y) + rnd.range(-0.2, 0.2), 0, 1) });
  };
  for (let i = 0; i < 150; i++) { const t = (i / 150) * TAU + rnd.range(-0.008, 0.008), r = rnd.range(8.5, 12); pushU(G.cx + Math.cos(t) * (G.R - r), G.cy + Math.sin(t) * (G.R - r), r); }
  for (let s = 0; s < 4; s++) for (let u = -G.a - 8; u <= G.a + 8; u += 14.5) {
    const r = rnd.range(8.5, 11.5), off = G.a + r;
    const [x, y] = s === 0 ? [u, -off] : s === 1 ? [off, u] : s === 2 ? [-u, off] : [-off, -u];
    pushU(G.cx + x, G.cy + y, r);
  }
  const base = under.length; const pts = [];
  for (let i = 0; i < 12000; i++) {
    const r = rnd.range(9, 14), x = G.cx + (rnd() * 2 - 1) * G.R, y = G.cy + (rnd() * 2 - 1) * G.R;
    if (K.sdGlyph(x, y) > -r) continue;
    let ok = true;
    for (const b of pts) if (Math.abs(b.x - x) < 15 && Math.abs(b.y - y) < 15 && Math.hypot(b.x - x, b.y - y) < 14.5) { ok = false; break; }
    if (ok) pts.push({ x, y, r });
  }
  for (const p of pts) pushU(p.x, p.y, p.r);
  void base;
  return { az, balls, under };
}

function ball(g, b, rnd) {
  const { x, y, r, t, lvl } = b;
  // occlusion cast down-right onto whatever lies beneath
  const ax = x + r * 0.14, ay = y + r * 0.2;
  g.fillStyle = L.radial(g, ax, ay, r * 0.72, r * 1.38, [[0, 'rgba(2,22,15,0.52)'], [0.5, 'rgba(2,22,15,0.2)'], [1, 'rgba(2,22,15,0)']]);
  g.beginPath(); g.arc(ax, ay, r * 1.38, 0, TAU); g.fill();
  const dk = lvl ? 0 : 0.42;
  const hi = lc(lc(HI0, HI1, t), MID0, dk), mid = lc(lc(MID0, MID1, t), LO0, dk), lo = lc(LO0, LO1, t);
  g.fillStyle = L.radial(g, x - r * 0.36, y - r * 0.4, 0, r * 1.56, [[0, css(hi)], [0.2, css(lc(hi, mid, 0.62))], [0.48, css(mid)], [0.8, css(lo)], [1, css(DEEP)]]);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  if (r > 13) {
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    // growth bands: faint concentric shells, the signature of malachite
    const n = 2 + Math.floor(r / 8), bx = x + r * rnd.range(0.05, 0.2), by = y + r * rnd.range(0.08, 0.24);
    for (let k = 0; k < n; k++) {
      const rr = r * (0.26 + (0.86 * (k + rnd.range(0.2, 0.8))) / n);
      g.strokeStyle = k % 2 ? `rgba(2,40,27,${rnd.range(0.14, 0.26)})` : `rgba(170,240,208,${rnd.range(0.1, 0.2)})`;
      g.lineWidth = rnd.range(1.2, 2.6);
      g.beginPath(); g.ellipse(bx, by, rr, rr * rnd.range(0.9, 1), rnd() * 3, 0, TAU); g.stroke();
    }
    // silky fibrous sheen: short hairlines fanning out from the lit pole
    g.lineCap = 'round';
    for (let k = 0, m = Math.round(r * 0.5); k < m; k++) {
      const a = rnd() * TAU, d0 = r * rnd.range(0.3, 0.8), d1 = d0 + r * rnd.range(0.08, 0.2);
      const px = x - r * 0.2, py = y - r * 0.22;
      g.strokeStyle = rnd() < 0.6 ? `rgba(196,246,222,${rnd.range(0.1, 0.22)})` : `rgba(0,36,24,${rnd.range(0.12, 0.24)})`;
      g.lineWidth = rnd.range(0.7, 1.1);
      g.beginPath(); g.moveTo(px + Math.cos(a) * d0, py + Math.sin(a) * d0); g.lineTo(px + Math.cos(a) * d1, py + Math.sin(a) * d1); g.stroke();
    }
    // light bounced back into the shaded rim
    g.strokeStyle = L.linear(g, x, y, x + r * 0.75, y + r * 0.75, [[0.55, 'rgba(120,225,180,0)'], [1, 'rgba(120,225,180,0.3)']]);
    g.lineWidth = r * 0.1; g.beginPath(); g.arc(x, y, r * 0.93, 0.05 * Math.PI, 0.5 * Math.PI); g.stroke();
    // pinholes
    for (let k = 0, m = rnd.int(1, 3); k < m; k++) {
      const a = rnd() * TAU, d = r * rnd.range(0.2, 0.8);
      g.fillStyle = 'rgba(0,26,18,0.4)'; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd.range(0.7, 1.3), 0, TAU); g.fill();
    }
    g.restore();
  }
  // crisp rim
  g.strokeStyle = 'rgba(2,28,20,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r - 0.5, 0, TAU); g.stroke();
  // specular: a soft bloom and a small hard glint, top-left
  const sx = x - r * 0.38, sy = y - r * 0.42, sa = lvl ? 0.62 : 0.34;
  g.save(); g.translate(sx, sy); g.rotate(-0.78); g.scale(1, 0.62);
  g.fillStyle = L.radial(g, 0, 0, 0, r * 0.34, [[0, `rgba(255,255,250,${sa})`], [0.5, `rgba(235,255,245,${sa * 0.4})`], [1, 'rgba(235,255,245,0)']]);
  g.beginPath(); g.arc(0, 0, r * 0.34, 0, TAU); g.fill(); g.restore();
  if (r > 12) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(sx - r * 0.02, sy - r * 0.02, r * 0.075, r * 0.045, -0.78, 0, TAU); g.fill(); }
}

const AZ_D = [8, 20, 86], AZ_L = [84, 132, 236];
function crystal(g, bx, by, th, len, w, rnd) {
  const tipY = w * rnd.range(-0.22, 0.22), ry = w * rnd.range(-0.14, 0.14), h = w / 2;
  const A = [0, -h * 0.62], B = [len * rnd.range(0.74, 0.84), -h], T = [len, tipY], C = [len * rnd.range(0.8, 0.9), h], D = [0, h * 0.62], Rg = [0, ry];
  const lam = (-Math.sin(th) + Math.cos(th)) * 0.7071;                 // how much the facet on the local −y side faces the top-left light
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  g.save(); g.translate(bx, by); g.rotate(th);
  g.shadowColor = 'rgba(3,10,34,0.5)'; g.shadowBlur = 5; g.shadowOffsetX = 3; g.shadowOffsetY = 4.5;
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
  g.strokeStyle = 'rgba(3,10,44,0.3)'; g.lineWidth = 0.8;
  for (let k = 0, m = rnd.int(1, 3); k < m; k++) { const u = len * rnd.range(0.2, 0.7); g.beginPath(); g.moveTo(u, -h * 0.8); g.lineTo(u + rnd.range(-2, 2), h * 0.8); g.stroke(); }
  poly([A, B, T, C, D]); g.strokeStyle = 'rgba(3,8,40,0.72)'; g.lineWidth = 1.1; g.lineJoin = 'round'; g.stroke();
  g.strokeStyle = 'rgba(206,226,255,0.78)'; g.lineWidth = 1.1; g.lineCap = 'round';
  g.beginPath(); g.moveTo(len * 0.12, ry); g.lineTo(T[0] - 1, T[1]); g.stroke();
  g.restore();
}

function azurite(g, c, rnd) {
  // druzy base: small dark blue nodules
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU, d = c.R * rnd.range(0, 0.44), r = rnd.range(6, 11), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (K.sdGlyph(x, y) > -r) continue;
    g.fillStyle = L.radial(g, x + 1.5, y + 2.5, r * 0.7, r * 1.4, [[0, 'rgba(2,8,30,0.5)'], [1, 'rgba(2,8,30,0)']]); g.beginPath(); g.arc(x + 1.5, y + 2.5, r * 1.4, 0, TAU); g.fill();
    g.fillStyle = L.radial(g, x - r * 0.35, y - r * 0.4, 0, r * 1.5, [[0, '#5d8ce8'], [0.3, '#2147ae'], [0.75, '#0c1f66'], [1, '#050d38']]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const n = rnd.int(13, 17), cr = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU + rnd.range(-0.22, 0.22); let len = c.R * rnd.range(0.62, 1.04); const w = rnd.range(11, 18);
    const bx = c.x + Math.cos(th) * c.R * 0.06, by = c.y + Math.sin(th) * c.R * 0.06;
    for (let k = 0; k < 14; k++) {
      const tx = bx + Math.cos(th) * len, ty = by + Math.sin(th) * len, px = -Math.sin(th) * w * 0.5, py = Math.cos(th) * w * 0.5;
      if (K.sdGlyph(tx, ty) < -3 && K.sdGlyph(tx * 0.85 + bx * 0.15 + px, ty * 0.85 + by * 0.15 + py) < -2 && K.sdGlyph(tx * 0.85 + bx * 0.15 - px, ty * 0.85 + by * 0.15 - py) < -2) break;
      len *= 0.88;
    }
    if (len > 16) cr.push({ th, len, w, bx, by });
  }
  cr.sort((p, q) => q.len - p.len);
  for (const k of cr) crystal(g, k.bx, k.by, k.th, k.len, k.w, rnd);
  // a few stubby crystals standing up in the middle
  for (let i = 0; i < 5; i++) {
    const a = rnd() * TAU, d = c.R * rnd.range(0, 0.2);
    crystal(g, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, rnd() * TAU, rnd.range(13, 20), rnd.range(10, 14), rnd);
  }
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#f2ecdc', tone: '#8a6f42', seed: 'g15paper', fiber: 0.5, stain: 0.24, foxing: 0.18, edge: 0.18 }), 0, 0);
  const { az, balls, under } = layout();
  const rnd = L.rng('g15draw');
  // soft shadow of the whole crust on the paper
  const sil = L.makeCanvas(S, S), q = sil.getContext('2d');
  q.fillStyle = 'rgb(58,40,20)';
  for (const b of [...under, ...balls]) { q.beginPath(); q.arc(b.x, b.y, b.r, 0, TAU); q.fill(); }
  g.globalAlpha = 0.42; g.drawImage(L.blurred(sil, 7), 5, 8); g.globalAlpha = 1;
  // lower-right knobs first, so the ones nearer the light overlap and shade them
  const order = (a, b) => (b.x + b.y) - (a.x + a.y);
  under.sort(order); for (const b of under) ball(g, b, rnd);
  balls.forEach((b) => { b.k = b.x + b.y + rnd.range(-40, 40); }); balls.sort((a, b) => b.k - a.k);
  for (const b of balls) ball(g, b, rnd);
  for (const k of az) azurite(g, k, rnd);
  return c;
}

export default {
  name: '孔雀石锈',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },        // 3-frame flash: perfectly still
};
