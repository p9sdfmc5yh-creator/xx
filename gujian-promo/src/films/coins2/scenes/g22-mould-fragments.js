// g22 — 钱范残片: sixteen terracotta mould sherds (coin cavities, runners and gates sunk into their faces) laid on off-white paper
// so that together they spell the coin glyph. Built as one relief: a height map (mould pattern, rotated differently on every sherd,
// plus grit, pits and scratches) is lit from the top-left, then cut along jagged fracture lines.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const G = K.GLYPH; const TAU = Math.PI * 2;
let layer = null;

// a jagged, roughly radial fracture from radius r0 to r1 at angle t
function crackLine(r, t, r0, r1) {
  const pts = []; const n = Math.max(4, Math.round((r1 - r0) / 24)); let lat = 0;
  const nx = -Math.sin(t), ny = Math.cos(t);
  for (let i = 0; i <= n; i++) {
    const rr = L.lerp(r0, r1, i / n) + (i > 0 && i < n ? r.range(-7, 7) : 0);
    lat = L.clamp(lat + r.range(-12, 12), -17, 17);
    pts.push([G.cx + Math.cos(t) * rr + nx * lat, G.cy + Math.sin(t) * rr + ny * lat]);
  }
  return pts;
}
const poly = (g, pts) => { pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };

function clipFrag(g, f) {
  g.beginPath(); g.moveTo(G.cx, G.cy); f.a.forEach((p) => g.lineTo(p[0], p[1]));
  for (let i = f.b.length - 1; i >= 0; i--) g.lineTo(f.b[i][0], f.b[i][1]);
  g.closePath(); g.clip();
  if (f.part === 'in') { g.beginPath(); g.arc(G.cx, G.cy, f.rs, 0, TAU); g.clip(); }
  if (f.part === 'out') { g.beginPath(); g.rect(0, 0, S, S); g.arc(G.cx, G.cy, f.rs, 0, TAU); g.clip('evenodd'); }
}

// the face of a stack-casting mould as a height map (white = high): runners, slanted gates, coin cavities with a rim groove and a square boss
function mouldPattern() {
  const W = 1500; const c = L.makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, W);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  for (let x = 110; x < W + 100; x += 318) {
    for (let y = 40; y < W + 80; y += 128) for (const sd of [-1, 1]) {
      const cx = x + sd * 101, cy = y + (sd > 0 ? 20 : 0);
      g.strokeStyle = '#646464'; g.lineWidth = 15; line(x, cy - 34, cx - sd * 46, cy - 6);       // gate
      g.strokeStyle = '#565656'; g.lineWidth = 7; line(x, cy - 34, cx - sd * 46, cy - 6);
      g.fillStyle = '#727272'; g.beginPath(); g.arc(cx, cy, 55, 0, TAU); g.fill();                // cavity floor
      g.strokeStyle = '#4e4e4e'; g.lineWidth = 7.5; g.beginPath(); g.arc(cx, cy, 50.5, 0, TAU); g.stroke();   // outer rim groove
      g.lineWidth = 5; g.strokeRect(cx - 17.5, cy - 17.5, 35, 35);                                // inner rim groove
      g.fillStyle = '#9c9c9c'; g.fillRect(cx - 14.5, cy - 14.5, 29, 29);                          // boss that leaves the square hole
    }
    g.strokeStyle = '#626262'; g.lineWidth = 36; line(x, -40, x, W + 40);                          // main runner
    g.strokeStyle = '#4c4c4c'; g.lineWidth = 20; line(x, -40, x, W + 40);
    g.strokeStyle = '#444444'; g.lineWidth = 7; line(x, -40, x, W + 40);
  }
  return L.blurred(c, 1.2);
}

function tint(mask, color) {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
  return c;
}

function build() {
  const r = L.rng('g22frag');
  // ── fracture plan ──
  const N = 11; const ph = r() * TAU; const cuts = [];
  for (let i = 0; i < N; i++) { const t = ph + (i + r.range(-0.26, 0.26)) * (TAU / N); cuts.push({ t, pts: crackLine(r, t, 30, G.R + 90) }); }
  const frags = []; const arcs = [];
  for (let i = 0; i < N; i++) {
    const A = cuts[i], B = cuts[(i + 1) % N]; let t1 = B.t; if (t1 < A.t) t1 += TAU;
    const tm = (A.t + t1) / 2; const split = i % 2 === 0 && i < 10;
    const mk = (part, rs, rad) => frags.push({ a: A.pts, b: B.pts, part, rs, cx: G.cx + Math.cos(tm) * rad, cy: G.cy + Math.sin(tm) * rad,
      rot: r() * TAU, ox: r.range(-170, 170), oy: r.range(-170, 170), tone: r(), kind: r() });
    if (split) {
      const rs = r.range(238, 272); mk('in', rs, (rs + 150) / 2); mk('out', rs, (rs + G.R) / 2);
      const pts = []; const n = Math.ceil((t1 - A.t) / 0.075);
      for (let k = 0; k <= n; k++) { const t = L.lerp(A.t - 0.05, t1 + 0.05, k / n), rr = rs + r.range(-6, 6); pts.push([G.cx + Math.cos(t) * rr, G.cy + Math.sin(t) * rr]); }
      arcs.push(pts);
    } else mk(null, 0, 262);
  }

  // ── mask: the glyph, cut along the fractures, with chipped edges ──
  const mask = L.makeCanvas(S, S), m = mask.getContext('2d');
  K.fillGlyph(m, '#fff', { grow: 1, corner: 3 });
  m.globalCompositeOperation = 'destination-out'; m.lineJoin = 'miter'; m.lineCap = 'round'; m.fillStyle = '#000'; m.strokeStyle = '#000';
  for (const c of [...cuts.map((q) => q.pts), ...arcs]) {
    m.lineWidth = r.range(8, 13); m.beginPath(); poly(m, c); m.stroke();
    for (let k = 0; k < 4; k++) {                                   // flakes lost along the break
      const p = c[r.int(1, c.length - 2)]; if (!p) continue;
      m.beginPath(); m.ellipse(p[0] + r.range(-3, 3), p[1] + r.range(-3, 3), r.range(3, 8), r.range(2, 4.5), r() * 3, 0, TAU); m.fill();
    }
  }
  for (let k = 0; k < 150; k++) {                                   // small bites out of the outer edge (≤ 5 px deep)
    const t = r() * TAU, rr = r.range(3, 8), d = G.R + rr - r.range(0.5, 4.5);
    m.beginPath(); m.ellipse(G.cx + Math.cos(t) * d, G.cy + Math.sin(t) * d, rr, rr * r.range(0.5, 1), t + r.range(-0.5, 0.5) + 1.57, 0, TAU); m.fill();
  }
  for (let k = 0; k < 64; k++) {                                    // and out of the square hole's edges
    const side = k % 4, u = r.range(-G.a, G.a), rr = r.range(3, 7), d = G.a - rr + r.range(0.5, 4);
    const x = side === 0 ? u : side === 1 ? d : side === 2 ? u : -d, y = side === 0 ? -d : side === 1 ? u : side === 2 ? d : u;
    m.beginPath(); m.ellipse(G.cx + x, G.cy + y, side % 2 ? rr * 0.7 : rr, side % 2 ? rr : rr * 0.7, 0, 0, TAU); m.fill();
  }

  // ── height map ──
  const pat = mouldPattern();
  const Hc = L.makeCanvas(S, S), h = Hc.getContext('2d');
  h.fillStyle = '#9a9a9a'; h.fillRect(0, 0, S, S);
  for (const f of frags) {
    if (f.kind < 0.12) continue;                                    // a couple of sherds are plain wall
    h.save(); clipFrag(h, f); h.translate(f.cx, f.cy); h.rotate(f.rot); h.drawImage(pat, -750 + f.ox, -750 + f.oy); h.restore();
  }
  const recess = L.makeCanvas(S, S); recess.getContext('2d').drawImage(Hc, 0, 0);     // clean copy: darkens the sunk parts of the colour
  h.globalCompositeOperation = 'overlay';
  h.globalAlpha = 0.3; h.drawImage(L.noiseTex(S, S, { seed: 'g22h1', scale: 44, octaves: 4, res: 0.5, contrast: 1.5 }), 0, 0);
  h.globalAlpha = 0.11; h.drawImage(L.noiseTex(S, S, { seed: 'g22h2', scale: 6, octaves: 2, res: 1, contrast: 1.6 }), 0, 0);
  h.globalCompositeOperation = 'source-over'; h.globalAlpha = 1;
  const rp = L.rng('g22pits');
  for (let k = 0; k < 1500; k++) {                                  // pits left by burnt-out chaff, and sand grit standing proud
    const x = rp() * S, y = rp() * S; if (!K.inGlyph(x, y, 2)) continue;
    const pit = rp() < 0.62, rr = pit ? rp.range(0.9, 3.2) : rp.range(0.8, 2.1);
    h.fillStyle = pit ? `rgba(26,26,26,${rp.range(0.35, 0.85)})` : `rgba(240,240,240,${rp.range(0.3, 0.7)})`;
    h.beginPath(); h.ellipse(x, y, rr, rr * rp.range(0.55, 1), rp() * 3, 0, TAU); h.fill();
  }
  h.lineCap = 'round';
  for (let k = 0; k < 150; k++) {                                   // tooling scratches and chaff impressions
    const x = rp() * S, y = rp() * S; if (!K.inGlyph(x, y, 4)) continue;
    const a = rp() * TAU, len = rp.range(8, 34), bend = rp.range(-5, 5);
    h.strokeStyle = `rgba(40,40,40,${rp.range(0.25, 0.6)})`; h.lineWidth = rp.range(1.1, 2);
    h.beginPath(); h.moveTo(x, y); h.quadraticCurveTo(x + Math.cos(a) * len / 2 - Math.sin(a) * bend, y + Math.sin(a) * len / 2 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len); h.stroke();
  }
  // sherd edges fall away → lit lip on the top-left breaks, shaded lip on the bottom-right ones
  const fall = L.makeCanvas(S, S), fg = fall.getContext('2d');
  fg.fillStyle = '#5c5c5c'; fg.fillRect(0, 0, S, S); fg.drawImage(mask, 0, 0);
  h.globalCompositeOperation = 'multiply'; h.drawImage(L.blurred(fall, 1.5), 0, 0); h.globalCompositeOperation = 'source-over';
  const light = L.bumpLight(Hc, { angle: 45, strength: 3.7, res: 1 });

  // ── colour ──
  const col = L.makeCanvas(S, S), q = col.getContext('2d');
  q.fillStyle = '#cf7d4f'; q.fillRect(0, 0, S, S);
  q.globalAlpha = 0.75; q.drawImage(L.noiseTex(S, S, { seed: 'g22c1', scale: 150, octaves: 4, res: 0.5, warp: 0.5, contrast: 1.5, ramp: [[0, '#b25a33'], [0.5, '#cc7a4c'], [1, '#e09a68']] }), 0, 0);
  q.globalAlpha = 0.55; q.drawImage(L.noiseTex(S, S, { seed: 'g22c2', scale: 70, octaves: 3, res: 0.5, contrast: 2.2, ramp: [[0, 'rgba(96,80,70,0.9)'], [0.42, 'rgba(120,96,80,0)'], [1, 'rgba(236,196,150,0.55)']] }), 0, 0);
  q.globalAlpha = 1;
  for (const f of frags) {                                          // every sherd fired a little differently
    const tones = ['#7a3f25', '#e7aa78', '#8d7b6e', '#c2552c', '#d9b48a'];
    q.save(); clipFrag(q, f); q.fillStyle = L.rgba(tones[Math.floor(f.tone * tones.length) % tones.length], 0.14 + 0.3 * ((f.tone * 7) % 1)); q.fillRect(0, 0, S, S); q.restore();
  }
  q.globalCompositeOperation = 'multiply'; q.globalAlpha = 0.85; q.drawImage(L.filtered(recess, 'brightness(1.45) contrast(1.6)'), 0, 0);
  q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1;
  const rc = L.rng('g22specks');
  for (let k = 0; k < 2200; k++) {                                  // temper: quartz, mica and dark iron grains in the clay body
    const x = rc() * S, y = rc() * S; if (!K.inGlyph(x, y, 1)) continue;
    const rr = rc.range(0.6, 1.7);
    q.fillStyle = L.rgba(rc.pick(['#f3dcc0', '#fff1dc', '#5a2e1c', '#3d2a22', '#e9b98e']), rc.range(0.25, 0.7));
    q.beginPath(); q.ellipse(x, y, rr, rr * rc.range(0.5, 1), rc() * 3, 0, TAU); q.fill();
  }
  q.globalCompositeOperation = 'hard-light'; q.globalAlpha = 0.92; q.drawImage(light, 0, 0);
  q.globalCompositeOperation = 'destination-in'; q.globalAlpha = 1; q.drawImage(mask, 0, 0);
  q.globalCompositeOperation = 'source-over';

  // ── page ──
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#f3eddd', tone: '#8a6f45', seed: 'g22paper', stain: 0.2, foxing: 0.14, edge: 0.16 }), 0, 0);
  const sh = tint(mask, '#2a1a0c');
  g.globalAlpha = 0.3; g.drawImage(L.blurred(sh, 9), 8, 12);
  g.globalAlpha = 0.42; g.drawImage(L.blurred(sh, 2.4), 3.5, 5.5);
  g.globalAlpha = 1;
  const wall = tint(mask, '#7d4429'), wg = wall.getContext('2d');   // the broken section seen on the far side of each sherd
  wg.globalCompositeOperation = 'source-atop'; wg.globalAlpha = 0.5;
  wg.drawImage(L.noiseTex(S, S, { seed: 'g22w', scale: 9, octaves: 2, res: 0.5, contrast: 1.8, ramp: [[0, '#4e2617'], [1, '#b06a44']] }), 0, 0);
  g.drawImage(wall, 2.2, 3.6);
  g.drawImage(col, 0, 0);
  // crumbs of fired clay lying in the breaks
  const rk = L.rng('g22crumbs');
  for (const cp of [...cuts.map((z) => z.pts), ...arcs]) for (let k = 0; k < 3; k++) {
    const p = cp[rk.int(1, cp.length - 2)]; if (!p || K.sdGlyph(p[0], p[1]) > -8) continue;
    const x = p[0] + rk.range(-2, 2), y = p[1] + rk.range(-2, 2), rr = rk.range(1.4, 3);
    g.fillStyle = 'rgba(40,24,12,0.35)'; g.beginPath(); g.ellipse(x + 1.2, y + 1.8, rr, rr * 0.8, 0, 0, TAU); g.fill();
    g.fillStyle = rk.pick(['#c0683f', '#a9532f', '#d58a5c']); g.beginPath(); g.ellipse(x, y, rr, rr * rk.range(0.6, 0.9), rk() * 3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,225,190,0.5)'; g.beginPath(); g.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.35, 0, TAU); g.fill();
  }
  return c;
}

export default {
  name: '钱范残片',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
