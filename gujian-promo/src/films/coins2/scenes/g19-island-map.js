// g19 — 岛屿地图: an old hand-coloured engraved chart. The island IS the coin glyph (coast = outer circle, the square
// lake in the middle = the square hole). Hachured ranges, rivers, outline-colour districts, a green coast wash, water
// lining and a graticule on the sea. No names, no figures, no letters anywhere.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const G = K.GLYPH; const TAU = Math.PI * 2;
let layer = null;

function poly(g, pts, close) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const nz = L.makeNoise('g19isle'); const r = L.rng('g19');
  const INK = '#3d2c1e';

  // ── outlines: coast (circle, wobble ≤ 5 px) and lake shore (square, wobble ≤ 2.5 px, straight axis-aligned sides)
  const coast = (grow = 0) => {
    const pts = []; const k = grow > 0 ? Math.max(0.2, 1 - grow / 70) : 1;
    for (let i = 0; i < 540; i++) {
      const t = (i / 540) * TAU, cs = Math.cos(t), sn = Math.sin(t);
      const w = 3.8 * nz.fbm(cs * 2.6 + 5, sn * 2.6 + 2, 4) + 1.2 * nz.n2(cs * 13 + 1, sn * 13);
      const rr = G.R - 0.5 + w * k + grow;
      pts.push([G.cx + cs * rr, G.cy + sn * rr]);
    }
    return pts;
  };
  const lake = (shrink = 0) => {
    const h = G.a - shrink, pts = []; const k = shrink > 0 ? Math.max(0.2, 1 - shrink / 40) : 1;
    [[-1, -1, 1, 0], [1, -1, 0, 1], [1, 1, -1, 0], [-1, 1, 0, -1]].forEach(([sx, sy, dx, dy], s) => {
      for (let i = 0; i < 26; i++) {
        const u = i / 26, w = 2.3 * nz.fbm(u * 3.4 + s * 9.1, 4.4, 3) * Math.sin(u * Math.PI) * k;
        const nx = dy ? sx : 0, ny = dx ? sy : 0;
        pts.push([G.cx + sx * h + dx * u * 2 * h + nx * w, G.cy + sy * h + dy * u * 2 * h + ny * w]);
      }
    });
    return pts;
  };
  const coast0 = coast(), lake0 = lake();
  const landPath = () => { g.beginPath(); poly(g, coast0, true); poly(g, lake0, true); };

  // ── sea: blue-green aged paper, deeper wash hugging the shores
  g.drawImage(K.paper({ base: '#d6ddcb', tone: '#7f7a55', seed: 'g19sea', stain: 0.34, foxing: 0.35, edge: 0.2, fiber: 0.55 }), 0, 0);
  {
    const t = L.makeCanvas(S, S), q = t.getContext('2d');
    q.strokeStyle = 'rgba(84,138,150,0.5)'; q.lineWidth = 58; q.lineJoin = 'round';
    q.beginPath(); poly(q, coast0, true); q.stroke();
    q.fillStyle = 'rgba(84,138,150,0.5)'; q.beginPath(); poly(q, lake0, true); q.fill();
    g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(L.blurred(t, 11), 0, 0); g.restore();
  }
  // graticule: gently curved parallels, meridians converging towards the top
  const F0 = 44, STEP = 108;
  g.save(); g.beginPath(); g.rect(F0, F0, S - 2 * F0, S - 2 * F0); g.clip();
  g.strokeStyle = L.rgba('#2f4c5e', 0.5); g.lineWidth = 1.15;
  for (let k = -6; k <= 6; k++) {
    g.beginPath();
    for (let y = 0; y <= S; y += 20) { const x = G.cx + k * STEP * (1 + 0.00013 * (y - G.cy)) + 0.4 * Math.sin(y * 0.02 + k); y ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.beginPath();
    for (let x = 0; x <= S; x += 20) { const y = G.cy + k * STEP + 0.00006 * (x - G.cx) * (x - G.cx) * (1 + k * 0.08) + 0.4 * Math.sin(x * 0.02 + k); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  // engraved swell marks in the open sea
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r.range(F0 + 8, S - F0 - 8), y = r.range(F0 + 8, S - F0 - 8), d = Math.hypot(x - G.cx, y - G.cy);
    if (d < G.R + 72) continue;
    const len = r.range(8, 18), amp = r.range(0.8, 1.6);
    g.strokeStyle = L.rgba('#2f4c5e', r.range(0.22, 0.42)); g.lineWidth = r.range(0.8, 1.2);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.25, y - amp * 2, x + len * 0.5, y); g.quadraticCurveTo(x + len * 0.75, y + amp * 2, x + len, y); g.stroke();
  }
  g.restore();
  // water lining: shore-parallel lines, gaps widening seawards
  g.lineJoin = 'round';
  [5, 11, 18, 26.5, 36.5, 48, 61].forEach((d, i) => {
    g.strokeStyle = L.rgba('#24485c', 0.72 - i * 0.085); g.lineWidth = 1.25 - i * 0.06;
    g.beginPath(); poly(g, coast(d), true); g.stroke();
  });
  [5, 10.5, 17, 25, 34.5, 46].forEach((d, i) => {
    g.strokeStyle = L.rgba('#24485c', 0.7 - i * 0.09); g.lineWidth = 1.2 - i * 0.06;
    g.beginPath(); poly(g, lake(d), true); g.stroke();
  });

  // ── land
  const Hf = (x, y) => {
    const d = -K.sdGlyph(x, y); if (d <= 0) return 0;
    return L.smooth((d - 12) / 62) * Math.pow(nz.ridged(x / 120 + 3.1, y / 120 + 8.7, 2), 1.5);
  };
  g.save(); landPath(); g.clip('evenodd');
  g.drawImage(K.paper({ base: '#f4e8c9', tone: '#8a6a3a', seed: 'g19land', stain: 0.3, foxing: 0.2, edge: 0, fiber: 0.6 }), 0, 0);

  // districts: six sectors split by wandering borders, each a pale wash with a stronger band of the same colour along its edge
  const NB = 6, bnd = [];
  for (let k = 0; k < NB; k++) {
    const base = 0.42 + (k * TAU) / NB + r.range(-0.13, 0.13), pts = [];
    for (let rr = G.a * 0.5; rr <= G.R + 26; rr += 7) {
      const th = base + 0.24 * nz.fbm(rr / 105 + k * 7.3, k * 3.1 + 0.5, 3);
      pts.push([G.cx + Math.cos(th) * rr, G.cy + Math.sin(th) * rr, th]);
    }
    bnd.push(pts);
  }
  const WASH = ['#eda893', '#ecd77c', '#b4d59a', '#d9b0d2', '#f3bf7c', '#c9d6a2'];
  const sector = (k) => {
    const A = bnd[k], B = bnd[(k + 1) % NB]; let ta = A[A.length - 1][2], tb = B[B.length - 1][2]; if (k === NB - 1) tb += TAU;
    g.beginPath(); g.moveTo(G.cx, G.cy); for (const p of A) g.lineTo(p[0], p[1]);
    g.arc(G.cx, G.cy, G.R + 26, ta, tb);
    for (let i = B.length - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
    g.closePath();
  };
  g.globalCompositeOperation = 'multiply';
  for (let k = 0; k < NB; k++) {
    g.save(); sector(k); g.clip();
    g.fillStyle = L.rgba(WASH[k], 0.27); g.fillRect(0, 0, S, S);
    const edge = L.shade(WASH[k], -0.12);
    sector(k); g.lineJoin = 'round';
    g.strokeStyle = L.rgba(edge, 0.22); g.lineWidth = 46; g.stroke();
    g.strokeStyle = L.rgba(edge, 0.3); g.lineWidth = 26; g.stroke();
    g.strokeStyle = L.rgba(edge, 0.42); g.lineWidth = 11; g.stroke();
    g.restore();
  }
  // green coast wash (sea coast and lake shore)
  for (const [w, a] of [[28, 0.18], [16, 0.3], [8, 0.45]]) {
    g.strokeStyle = L.rgba('#4f9a5c', a); g.lineWidth = w; landPath(); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  // district borders: dash-dot ink
  g.setLineDash([8, 3.5, 1.6, 3.5]); g.strokeStyle = L.rgba(INK, 0.75); g.lineWidth = 1.2;
  for (const pts of bnd) { g.beginPath(); poly(g, pts, false); g.stroke(); }
  g.setLineDash([]);

  // hachures (晕滃线): short tapered strokes down the slope of a ridged height field, heavier on the faces turned from the light
  const smp = [];
  for (let y = G.cy - G.R; y <= G.cy + G.R; y += 4.6) for (let x = G.cx - G.R; x <= G.cx + G.R; x += 4.6) {
    const px = x + r.range(-1.9, 1.9), py = y + r.range(-1.9, 1.9);
    if (!K.inGlyph(px, py, 9)) continue;
    const gx = (Hf(px + 4, py) - Hf(px - 4, py)) / 8, gy = (Hf(px, py + 4) - Hf(px, py - 4)) / 8;
    smp.push([px, py, gx, gy, Math.hypot(gx, gy)]);
  }
  const sl = smp.map((s) => s[4]).sort((a, b) => a - b);
  const lo = sl[Math.floor(sl.length * 0.5)], hi = sl[Math.floor(sl.length * 0.96)] || 1;
  for (const [px, py, gx, gy, m] of smp) {
    if (m <= lo) continue;
    const t = L.clamp((m - lo) / (hi - lo)), dx = -gx / m, dy = -gy / m;
    const sh = Math.max(0, dx * 0.707 + dy * 0.707);
    const len = 4.5 + 7.5 * t + r.range(-1, 1.2), w = 0.42 + 0.4 * t + 0.55 * sh;
    const x1 = px + dx * len, y1 = py + dy * len, nx = -dy * w, ny = dx * w;
    g.fillStyle = L.rgba(INK, 0.36 + 0.26 * t + 0.3 * sh);
    g.beginPath(); g.moveTo(px + nx, py + ny); g.lineTo(x1, y1); g.lineTo(px - nx, py - ny); g.closePath(); g.fill();
  }

  // woods and settlements in the lowlands
  const low = K.scatter({ seed: 'g19low', spacing: 21, margin: 15, max: 900, tries: 9000 }).filter((p) => Hf(p.x, p.y) < 0.07);
  g.lineCap = 'round';
  const towns = [];
  for (const p of low) {
    if (towns.length < 13 && r.chance(0.2) && towns.every((t) => Math.hypot(t.x - p.x, t.y - p.y) > 95)) { towns.push(p); continue; }
    if (!r.chance(0.55)) continue;
    g.strokeStyle = L.rgba('#3f5a3a', r.range(0.55, 0.85)); g.lineWidth = 1;
    const s = r.range(2.3, 3.2);
    g.beginPath(); g.arc(p.x, p.y, s, Math.PI * 0.95, TAU * 1.02); g.moveTo(p.x + s * 1.5 + s * 0.8, p.y + 1); g.arc(p.x + s * 1.5, p.y + 1, s * 0.8, 0, Math.PI, true);
    g.moveTo(p.x, p.y); g.lineTo(p.x, p.y + s * 1.3); g.stroke();
  }

  // rivers: run downhill from the ranges to the sea or the lake, widening as they go
  const seeds = [];
  for (let t = 0; t < 5000 && seeds.length < 11; t++) {
    const a = r() * TAU, rr = r.range(G.a + 60, G.R - 60), x = G.cx + Math.cos(a) * rr, y = G.cy + Math.sin(a) * rr;
    if (Hf(x, y) < 0.4 || seeds.some((s) => Math.hypot(s[0] - x, s[1] - y) < 105)) continue;
    seeds.push([x, y]);
  }
  for (const [sx0, sy0] of seeds) {
    let x = sx0, y = sy0, dx = 0, dy = 0, flat = false; const pts = [[x, y]];
    for (let st = 0; st < 420; st++) {
      let nx = -(Hf(x + 3, y) - Hf(x - 3, y)), ny = -(Hf(x, y + 3) - Hf(x, y - 3)); const nl = Math.hypot(nx, ny);
      if (nl > 1e-5 && !flat) { nx /= nl; ny /= nl; } else { nx = dx; ny = dy; }
      // caught circling a hollow: cut the loop off and run straight for the nearest shore
      for (let j = pts.length - 12; j >= 0; j--) if (Math.hypot(pts[j][0] - x, pts[j][1] - y) < 8) { pts.length = j + 1; x = pts[j][0]; y = pts[j][1]; flat = true; break; }
      let ex = K.sdGlyph(x + 2, y) - K.sdGlyph(x - 2, y), ey = K.sdGlyph(x, y + 2) - K.sdGlyph(x, y - 2); const el = Math.hypot(ex, ey) || 1;
      const pull = flat ? 0.6 : 0.2;
      let vx = dx * 0.55 + nx * 0.34 + (ex / el) * pull, vy = dy * 0.55 + ny * 0.34 + (ey / el) * pull;
      const wob = nz.n2(x / 21 + 9, y / 21) * 0.18, cw = Math.cos(wob), sw = Math.sin(wob);
      [vx, vy] = [vx * cw - vy * sw, vx * sw + vy * cw];
      const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
      x += vx * 3; y += vy * 3; dx = vx; dy = vy; pts.push([x, y]);
      if (K.sdGlyph(x, y) > 3) break;
    }
    if (pts.length < 14) continue;
    g.strokeStyle = '#356a84';
    for (let i = 1; i < pts.length; i++) {
      g.lineWidth = 0.8 + 2.4 * Math.pow(i / pts.length, 1.3);
      g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
    }
  }
  // roads: fine dotted red lines between neighbouring settlements (only where the straight run stays on land)
  g.setLineDash([4, 2.6]); g.strokeStyle = L.rgba('#8f3524', 0.7); g.lineWidth = 0.95;
  towns.forEach((p, i) => {
    towns.forEach((q, j) => {
      if (j <= i) return; const d = Math.hypot(p.x - q.x, p.y - q.y); if (d > 210) return;
      for (let u = 0.1; u < 1; u += 0.1) if (!K.inGlyph(L.lerp(p.x, q.x, u), L.lerp(p.y, q.y, u), 8)) return;
      const mx = (p.x + q.x) / 2 - (q.y - p.y) * 0.08, my = (p.y + q.y) / 2 + (q.x - p.x) * 0.08;
      g.beginPath(); g.moveTo(p.x, p.y); g.quadraticCurveTo(mx, my, q.x, q.y); g.stroke();
    });
  });
  g.setLineDash([]);
  for (const p of towns) {
    g.fillStyle = '#f4e8c9'; g.beginPath(); g.arc(p.x, p.y, 4.2, 0, TAU); g.fill();
    g.strokeStyle = '#a4321f'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 4.2, 0, TAU); g.stroke();
    g.fillStyle = '#a4321f'; g.beginPath(); g.arc(p.x, p.y, 1.4, 0, TAU); g.fill();
  }
  // dark green line just inside the shore
  g.strokeStyle = L.rgba('#2f6a3c', 0.8); g.lineWidth = 4; landPath(); g.stroke();
  g.restore();

  // shoreline in ink
  g.strokeStyle = L.rgba('#22241c', 0.92); g.lineWidth = 1.6; g.lineJoin = 'round'; landPath(); g.stroke();

  // ── sheet furniture: neatline with alternating bars, a compass star, a blank scale bar
  const F1 = 30;
  g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 2.6; g.strokeRect(F1, F1, S - 2 * F1, S - 2 * F1);
  g.lineWidth = 1.1; g.strokeRect(F0, F0, S - 2 * F0, S - 2 * F0);
  g.fillStyle = L.rgba(INK, 0.85);
  const seg = STEP / 2;
  for (let k = -10; k < 10; k++) {
    if (((k % 2) + 2) % 2) continue;
    const a0 = Math.max(F0, G.cx + k * seg), a1 = Math.min(S - F0, G.cx + (k + 1) * seg); if (a1 <= a0) continue;
    g.fillRect(a0, F1 + 3.5, a1 - a0, F0 - F1 - 7); g.fillRect(a0, S - F0 + 3.5, a1 - a0, F0 - F1 - 7);
    g.fillRect(F1 + 3.5, a0, F0 - F1 - 7, a1 - a0); g.fillRect(S - F0 + 3.5, a0, F0 - F1 - 7, a1 - a0);
  }
  {
    const cx = 152, cy = 150;
    g.save(); g.translate(cx, cy); g.rotate(-0.05);
    g.strokeStyle = L.rgba(INK, 0.85); g.lineWidth = 1.3; g.beginPath(); g.arc(0, 0, 56, 0, TAU); g.stroke();
    g.lineWidth = 0.9; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke();
    for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 50, Math.sin(a) * 50); g.lineTo(Math.cos(a) * 56, Math.sin(a) * 56); g.stroke(); }
    const point = (ang, len, wid) => {
      g.save(); g.rotate(ang);
      g.fillStyle = '#e9e2c9'; g.beginPath(); g.moveTo(0, 0); g.lineTo(wid, -wid); g.lineTo(0, -len); g.closePath(); g.fill();
      g.fillStyle = L.rgba(INK, 0.9); g.beginPath(); g.moveTo(0, 0); g.lineTo(-wid, -wid); g.lineTo(0, -len); g.closePath(); g.fill();
      g.lineWidth = 1; g.beginPath(); g.moveTo(-wid, -wid); g.lineTo(0, -len); g.lineTo(wid, -wid); g.lineTo(0, 0); g.closePath(); g.stroke();
      g.restore();
    };
    for (let i = 0; i < 8; i++) point((i + 0.5) * (TAU / 8), 30, 4.5);
    for (let i = 0; i < 4; i++) point((i + 0.5) * (TAU / 4), 46, 7);
    for (let i = 1; i < 4; i++) point(i * (TAU / 4), 62, 9);
    point(0, 82, 9);
    g.fillStyle = '#b23a26'; g.beginPath(); g.arc(0, 0, 3.4, 0, TAU); g.fill();
    g.restore();
  }
  {
    const x0 = 92, y0 = 962, w = 42, h = 7;
    g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 1.1; g.fillStyle = L.rgba(INK, 0.88);
    for (let i = 0; i < 5; i++) { if (i % 2 === 0) g.fillRect(x0 + i * w, y0, w, h); }
    g.strokeRect(x0, y0, w * 5, h);
    g.beginPath(); for (let i = 0; i <= 5; i++) { g.moveTo(x0 + i * w, y0 - 6); g.lineTo(x0 + i * w, y0); } g.moveTo(x0, y0 + h + 4); g.lineTo(x0 + w * 5, y0 + h + 4); g.stroke();
  }

  // ── the sheet was folded in four: soft creases, a rubbed line of lost ink along each
  for (const vertical of [true, false]) {
    g.save(); if (!vertical) { g.translate(S, 0); g.rotate(Math.PI / 2); }
    const xx = 540.5 + (vertical ? 0 : 0);
    g.fillStyle = L.linear(g, xx - 9, 0, xx + 9, 0, [[0, 'rgba(60,40,20,0)'], [0.42, 'rgba(255,250,235,0.16)'], [0.5, 'rgba(60,40,20,0.2)'], [0.62, 'rgba(60,40,20,0.08)'], [1, 'rgba(60,40,20,0)']]);
    g.fillRect(xx - 9, 0, 18, S);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = L.rgba('#efe6cf', r.range(0.12, 0.38));
      g.beginPath(); g.ellipse(xx + r.gauss() * 1.2, r() * S, r.range(0.4, 1.0), r.range(0.8, 2.6), 0, 0, TAU); g.fill();
    }
    g.restore();
  }
  K.wear(c, { seed: 'g19wear', amount: 0.0 });
  return c;
}

export default {
  name: '岛屿地图',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
