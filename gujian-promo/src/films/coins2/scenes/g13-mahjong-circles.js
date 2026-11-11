// g13 — 麻将筒子: ivory mahjong tiles (circle suit only) packed on dark green baize so that they spell the coin glyph.
// A frame of tiles lines the square hole edge to edge, a ring of tangent tiles hugs the outer circle, eight more fill the cardinals.
// Top-down shot, light from the top-left: every tile has a face, a bone side and a bamboo base seen as a sliver on its lower right.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const TW = 64, TH = 86, TR = 7.5;                 // tile face, corner radius
const IV = '#f3ebd3';
const RED = '#b3241b', GRN = '#17603f', BLU = '#1d3d88';
let layer = null;

function rr(q, x, y, w, h, r) {
  q.beginPath();
  q.moveTo(x + r, y); q.lineTo(x + w - r, y); q.quadraticCurveTo(x + w, y, x + w, y + r);
  q.lineTo(x + w, y + h - r); q.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  q.lineTo(x + r, y + h); q.quadraticCurveTo(x, y + h, x, y + h - r);
  q.lineTo(x, y + r); q.quadraticCurveTo(x, y, x + r, y); q.closePath();
}
const disc = (q, x, y, r) => { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); };

// one engraved, paint-filled "筒": concentric rings with a pip in the middle
function tong(q, x, y, r, col) {
  q.fillStyle = 'rgba(255,255,255,0.6)'; disc(q, x + 0.7, y + 0.8, r);           // lit lip of the cut
  q.fillStyle = 'rgba(70,45,12,0.4)'; disc(q, x - 0.5, y - 0.6, r);              // shaded lip
  q.fillStyle = col; disc(q, x, y, r);
  q.strokeStyle = IV; q.lineWidth = Math.max(1.15, r * 0.17);
  q.beginPath(); q.arc(x, y, r * 0.68, 0, TAU); q.stroke();
  if (r >= 9) {                                                                   // tiny petals between the rings
    q.fillStyle = IV;
    for (let k = 0; k < 6; k++) { const t = (k / 6) * TAU + 0.3; disc(q, x + Math.cos(t) * r * 0.44, y + Math.sin(t) * r * 0.44, r * 0.075); }
  }
  q.fillStyle = IV; disc(q, x, y, r * 0.30);
  q.fillStyle = col; disc(q, x, y, r * 0.15);
  q.strokeStyle = 'rgba(255,255,255,0.22)'; q.lineWidth = Math.max(0.8, r * 0.09);  // gloss on the lacquer
  q.beginPath(); q.arc(x, y, r * 0.86, Math.PI * 1.05, Math.PI * 1.5); q.stroke();
}
// the big one-circle
function tongOne(q) {
  const r = 22.5;
  q.fillStyle = 'rgba(255,255,255,0.6)'; disc(q, 0.8, 0.9, r);
  q.fillStyle = 'rgba(70,45,12,0.4)'; disc(q, -0.6, -0.7, r);
  q.fillStyle = GRN; disc(q, 0, 0, r);
  q.fillStyle = IV; disc(q, 0, 0, r * 0.80);
  q.fillStyle = RED;
  for (let k = 0; k < 14; k++) { const t = (k / 14) * TAU; disc(q, Math.cos(t) * r * 0.67, Math.sin(t) * r * 0.67, 1.9); }
  q.fillStyle = BLU; disc(q, 0, 0, r * 0.52);
  q.strokeStyle = IV; q.lineWidth = 1.3; q.beginPath(); q.arc(0, 0, r * 0.41, 0, TAU); q.stroke();
  q.fillStyle = IV;
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * TAU; q.save(); q.translate(Math.cos(t) * r * 0.23, Math.sin(t) * r * 0.23); q.rotate(t);
    q.beginPath(); q.ellipse(0, 0, 3.0, 1.5, 0, 0, TAU); q.fill(); q.restore();
  }
  q.fillStyle = RED; disc(q, 0, 0, 2.6);
  q.strokeStyle = 'rgba(255,255,255,0.22)'; q.lineWidth = 1.6; q.beginPath(); q.arc(0, 0, r * 0.9, Math.PI * 1.05, Math.PI * 1.5); q.stroke();
}
const PIPS = {
  2: [[0, -18, 13, GRN], [0, 18, 13, BLU]],
  3: [[-15, -23, 10.5, BLU], [0, 0, 10.5, RED], [15, 23, 10.5, GRN]],
  4: [[-13.5, -17, 11.5, BLU], [13.5, -17, 11.5, GRN], [-13.5, 17, 11.5, GRN], [13.5, 17, 11.5, BLU]],
  5: [[-15, -23, 9.6, BLU], [15, -23, 9.6, GRN], [0, 0, 9.6, RED], [-15, 23, 9.6, GRN], [15, 23, 9.6, BLU]],
  6: [[-12.5, -25, 9.4, GRN], [12.5, -25, 9.4, GRN], [-12.5, 2, 9.4, RED], [12.5, 2, 9.4, RED], [-12.5, 25, 9.4, RED], [12.5, 25, 9.4, RED]],
  7: [[-16, -30, 7.2, GRN], [0, -22, 7.2, GRN], [16, -14, 7.2, GRN], [-12, 7, 8.8, RED], [12, 7, 8.8, RED], [-12, 27, 8.8, RED], [12, 27, 8.8, RED]],
  8: [[-12, -28.5, 8.2, BLU], [12, -28.5, 8.2, BLU], [-12, -9.5, 8.2, BLU], [12, -9.5, 8.2, BLU], [-12, 9.5, 8.2, BLU], [12, 9.5, 8.2, BLU], [-12, 28.5, 8.2, BLU], [12, 28.5, 8.2, BLU]],
  9: [[-18, -25, 7.9, GRN], [0, -25, 7.9, GRN], [18, -25, 7.9, GRN], [-18, 0, 7.9, RED], [0, 0, 7.9, RED], [18, 0, 7.9, RED], [-18, 25, 7.9, BLU], [0, 25, 7.9, BLU], [18, 25, 7.9, BLU]],
};

function faceSprite(n, r) {
  return K.sprite(TW, TH, (q) => {
    rr(q, -TW / 2, -TH / 2, TW, TH, TR); q.save(); q.clip();
    const warm = r.range(0, 1);
    const gr = q.createLinearGradient(-TW / 2, -TH / 2, TW / 2, TH / 2);
    gr.addColorStop(0, L.mix('#f8f2df', '#f3e9cc', warm)); gr.addColorStop(1, L.mix('#ece2c6', '#e4d6b0', warm));
    q.fillStyle = gr; q.fillRect(-TW / 2, -TH / 2, TW, TH);
    // bone grain: fine long lines down the tile, a few short pores
    q.lineCap = 'round';
    for (let k = 0; k < 30; k++) {
      const x = r.range(-TW / 2, TW / 2), d = r.range(-2.5, 2.5);
      q.strokeStyle = L.rgba('#a98c52', r.range(0.05, 0.15)); q.lineWidth = r.range(0.45, 0.9);
      q.beginPath(); q.moveTo(x, -TH / 2); q.bezierCurveTo(x + d, -TH / 6, x - d, TH / 6, x + d * 0.5, TH / 2); q.stroke();
    }
    for (let k = 0; k < 16; k++) {
      const x = r.range(-TW / 2, TW / 2), y = r.range(-TH / 2, TH / 2);
      q.strokeStyle = L.rgba('#7d6230', r.range(0.12, 0.3)); q.lineWidth = 0.7;
      q.beginPath(); q.moveTo(x, y); q.lineTo(x + r.range(-0.4, 0.4), y + r.range(1.5, 4.5)); q.stroke();
    }
    // handled edges have yellowed
    const eg = q.createRadialGradient(0, 0, 22, 0, 0, 56);
    eg.addColorStop(0, 'rgba(176,134,60,0)'); eg.addColorStop(1, 'rgba(176,134,60,0.26)');
    q.fillStyle = eg; q.fillRect(-TW / 2, -TH / 2, TW, TH);
    if (n === 1) tongOne(q); else for (const [x, y, rad, col] of PIPS[n]) tong(q, x, y, rad, col);
    // paint rubbed thin here and there
    q.globalCompositeOperation = 'source-atop';
    for (let k = 0; k < 9; k++) {
      q.fillStyle = L.rgba(IV, r.range(0.12, 0.3));
      q.beginPath(); q.ellipse(r.range(-24, 24), r.range(-34, 34), r.range(0.6, 1.8), r.range(0.4, 1.1), r() * 3, 0, TAU); q.fill();
    }
    q.restore();
  });
}
function backSprite(r) {
  return K.sprite(TW, TH, (q) => {
    rr(q, -TW / 2, -TH / 2, TW, TH, TR); q.save(); q.clip();
    const gr = q.createLinearGradient(-TW / 2, -TH / 2, TW / 2, TH / 2);
    gr.addColorStop(0, '#d8b46a'); gr.addColorStop(1, '#b98c45');
    q.fillStyle = gr; q.fillRect(-TW / 2, -TH / 2, TW, TH);
    q.lineCap = 'round';
    for (let k = 0; k < 46; k++) {                                   // bamboo fibre runs the length of the tile
      const x = r.range(-TW / 2, TW / 2), d = r.range(-1.2, 1.2);
      q.strokeStyle = r.chance(0.3) ? L.rgba('#f0d69a', r.range(0.12, 0.3)) : L.rgba('#6e4a1c', r.range(0.1, 0.32)); q.lineWidth = r.range(0.5, 1.3);
      q.beginPath(); q.moveTo(x, -TH / 2); q.bezierCurveTo(x + d, -TH / 6, x - d, TH / 6, x + d * 0.4, TH / 2); q.stroke();
    }
    for (let k = 0; k < 34; k++) {                                   // vascular flecks
      const x = r.range(-TW / 2, TW / 2), y = r.range(-TH / 2, TH / 2);
      q.strokeStyle = L.rgba('#4f3312', r.range(0.25, 0.55)); q.lineWidth = r.range(0.6, 1.0);
      q.beginPath(); q.moveTo(x, y); q.lineTo(x + r.range(-0.3, 0.3), y + r.range(2, 6)); q.stroke();
    }
    q.restore();
  });
}

function felt() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d'), r = L.rng('g13felt');
  g.fillStyle = '#143b2a'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 46; k++) {                                     // pile brushed this way and that
    const x = r() * S, y = r() * S, rad = r.range(90, 260);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, r.chance(0.5) ? 'rgba(52,112,78,0.10)' : 'rgba(4,20,12,0.12)'], [1, 'rgba(20,60,40,0)']]);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.lineCap = 'round';
  const cols = ['#2c6448', '#0b2619', '#3a7a56', '#1c4c35', '#0f3022'];
  for (let k = 0; k < 30000; k++) {                                  // felted wool fibres
    const x = r() * S, y = r() * S, a = r() * TAU, len = r.range(2, 7);
    g.strokeStyle = L.rgba(cols[r.int(0, cols.length - 1)], r.range(0.14, 0.42)); g.lineWidth = r.range(0.6, 1.1);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let k = 0; k < 260; k++) {                                    // stray lint
    const x = r() * S, y = r() * S, a = r() * TAU, len = r.range(8, 22), b = r.range(-0.9, 0.9);
    g.strokeStyle = L.rgba(r.chance(0.7) ? '#6aa583' : '#c9d6c2', r.range(0.1, 0.26)); g.lineWidth = r.range(0.6, 1.0);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + b) * len * 0.5, y + Math.sin(a + b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  const lg = g.createLinearGradient(0, 0, S, S);                     // lamp at the top-left
  lg.addColorStop(0, 'rgba(96,160,118,0.20)'); lg.addColorStop(0.5, 'rgba(20,60,40,0)'); lg.addColorStop(1, 'rgba(0,8,4,0.36)');
  g.fillStyle = lg; g.fillRect(0, 0, S, S);
  return c;
}

function layout() {
  const { cx, cy, R, a } = K.GLYPH; const t = [];
  const d = a + TH / 2;                                              // frame rows sit flush on the hole's edges
  for (let i = 0; i < 6; i++) { const x = -160 + i * TW; t.push({ x, y: -d, rot: 0 }, { x, y: d, rot: 0 }); }
  for (let j = 0; j < 4; j++) { const y = -96 + j * TW; t.push({ x: -d, y, rot: Math.PI / 2 }, { x: d, y, rot: Math.PI / 2 }); }
  const f = a + TH + 2 + TW / 2;                                     // eight fillers at the cardinals
  for (const s of [-1, 1]) for (const u of [-1, 1]) { t.push({ x: u * 44, y: s * f, rot: Math.PI / 2 }, { x: s * f, y: u * 44, rot: 0 }); }
  const n = 22, rad = R - TW / 2 - 0.5;                              // ring: long side tangent, outer edge on the circle
  for (let k = 0; k < n; k++) { const ang = -Math.PI / 2 + (k / n) * TAU; t.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, rot: ang + Math.PI / 2, ring: true }); }
  return t.map((o) => ({ ...o, x: cx + o.x, y: cy + o.y }));
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(felt(), 0, 0);
  const r = L.rng('g13tiles');
  const tiles = layout();
  const backs = new Set([3, 17, 26, 33, 41, 46]);
  tiles.forEach((t, i) => {
    t.x += r.range(-0.6, 0.6); t.y += r.range(-0.6, 0.6); t.rot += r.range(-0.008, 0.008) + (r.chance(0.5) ? Math.PI : 0);
    t.back = backs.has(i);
    t.n = 1 + ((i * 4 + r.int(0, 2)) % 9);
    t.spr = t.back ? backSprite(L.rng('g13b' + i)) : faceSprite(t.n, L.rng('g13f' + i));
  });
  const DEPTH = 8, OX = 0.7, OY = 1.0;
  const sil = (t, dx, dy, style) => { g.save(); g.translate(t.x + dx, t.y + dy); g.rotate(t.rot); rr(g, -TW / 2, -TH / 2, TW, TH, TR); g.fillStyle = style; g.fill(); g.restore(); };
  // 1 — cast shadows on the baize (soft, then a tight contact line)
  for (const t of tiles) {
    g.save(); g.shadowColor = 'rgba(0,6,3,0.62)'; g.shadowBlur = 16; g.shadowOffsetX = 9; g.shadowOffsetY = 13;
    sil(t, DEPTH * OX * 0.5, DEPTH * OY * 0.5, '#07140d'); g.restore();
  }
  for (const t of tiles) {
    g.save(); g.shadowColor = 'rgba(0,4,2,0.75)'; g.shadowBlur = 4; g.shadowOffsetX = 2.5; g.shadowOffsetY = 3.5;
    sil(t, DEPTH * OX, DEPTH * OY, '#06120b'); g.restore();
  }
  // 2 — the sides: bamboo base below, bone above (reversed for tiles lying face down), shaded because they face away from the lamp
  for (const t of tiles) {
    for (let i = DEPTH; i >= 1; i--) {
      const low = i > DEPTH * 0.5;
      const bamboo = t.back ? !low : low;
      const k = i / DEPTH;
      sil(t, i * OX, i * OY, bamboo ? L.mix('#a87c3a', '#7d5622', k) : L.mix('#d6c79f', '#b7a67b', k));
    }
    sil(t, DEPTH * 0.5 * OX + 0.2, DEPTH * 0.5 * OY + 0.3, 'rgba(60,36,10,0.0)');
  }
  // 3 — faces, each lit from the page's top-left whatever way the tile is turned
  for (const t of tiles) {
    g.save(); g.translate(t.x, t.y); g.rotate(t.rot);
    g.drawImage(t.spr, -TW / 2, -TH / 2);
    const cs = Math.cos(-t.rot), sn = Math.sin(-t.rot);
    const lx = (cs * -1 - sn * -1) * 0.7071, ly = (sn * -1 + cs * -1) * 0.7071;
    const sh = g.createLinearGradient(lx * 52, ly * 52, -lx * 52, -ly * 52);
    sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(84,54,14,0.16)');
    rr(g, -TW / 2, -TH / 2, TW, TH, TR); g.fillStyle = sh; g.fill();
    const rim = g.createLinearGradient(lx * 50, ly * 50, -lx * 50, -ly * 50);
    rim.addColorStop(0, 'rgba(255,255,255,0.95)'); rim.addColorStop(0.42, 'rgba(255,255,255,0.15)'); rim.addColorStop(0.6, 'rgba(96,64,20,0.10)'); rim.addColorStop(1, 'rgba(96,64,20,0.55)');
    rr(g, -TW / 2 + 1.1, -TH / 2 + 1.1, TW - 2.2, TH - 2.2, TR - 1); g.strokeStyle = rim; g.lineWidth = 2.0; g.stroke();
    rr(g, -TW / 2 + 0.3, -TH / 2 + 0.3, TW - 0.6, TH - 0.6, TR); g.strokeStyle = 'rgba(70,46,14,0.30)'; g.lineWidth = 0.7; g.stroke();
    g.restore();
  }
  return c;
}

export default {
  name: '麻将筒子',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
