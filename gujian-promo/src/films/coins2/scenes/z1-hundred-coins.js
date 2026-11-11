// z1 — 百钱成钱·飞散: dozens of old coins (cash, round-holed coins, spades, knives, cowries, silver ingots, gold cakes) laid on
// off-white paper so that together they spell the coin glyph; then they lift off one by one and tumble towards the camera, and a
// huge out-of-focus cash coin closes the shot. Also exports drawFlyers(ctx, t) for the title card (coins still flying away).
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const G = K.GLYPH; const TAU = Math.PI * 2;

const PAL = {
  green: { base: '#5d7d62', lite: '#a3bd9c', dark: '#26402f', pat: ['#86b49c', '#3c6d5a'], spot: '#8a4a2c', amt: 0.72 },
  red: { base: '#7c5a3a', lite: '#bd9666', dark: '#3c2a1b', pat: ['#4f8a6c', '#2f6450'], spot: '#a23c26', amt: 0.52 },
  black: { base: '#4c453a', lite: '#93866c', dark: '#1e1a15', pat: ['#6f6040', '#39453a'], spot: '#5f8062', amt: 0.4 },
  brass: { base: '#ab8646', lite: '#e0c684', dark: '#57401c', pat: ['#7c7a44', '#7a5a2a'], spot: '#4f7458', amt: 0.36 },
  blue: { base: '#4f7f84', lite: '#a2c8c2', dark: '#22444c', pat: ['#4c97a0', '#2c5c68'], spot: '#8a4a2c', amt: 0.66 },
  gold: { base: '#c99c36', lite: '#f6e092', dark: '#7e5a18', pat: ['#e4c25e', '#a8781f'], spot: '#8a5a1a', amt: 0.34, spotA: 0.45 },
  silver: { base: '#a8a9a5', lite: '#f0eee6', dark: '#4e5052', pat: ['#7b7d81', '#cbc9bf'], spot: '#4a4640', amt: 0.46, spotA: 0.4 },
  bone: { base: '#d8c8a2', lite: '#f6edd4', dark: '#7c6844', pat: ['#b99b69', '#e7dbb9'], spot: '#7a5a34', amt: 0.36, spotA: 0.5 },
};

// ───────────── one object: colour + cast relief lit from the top-left + patina + scratches, on a transparent sprite ─────────────
function metal(w, h, o) {
  const ss = o.ss || 1, pal = o.pal, seed = o.seed, r = L.rng(seed), rule = o.rule || 'evenodd';
  const W = Math.round((w + 44) * ss), H = Math.round((h + 44) * ss);
  const hc = L.makeCanvas(W, H), hg = hc.getContext('2d');
  hg.fillStyle = '#000'; hg.fillRect(0, 0, W, H);
  hg.translate(W / 2, H / 2); hg.scale(ss, ss);
  hg.filter = `blur(${2.2 * ss}px)`; hg.fillStyle = '#6a6a6a'; o.path(hg); hg.fill(rule); hg.filter = 'none';
  hg.save(); o.path(hg); hg.clip(rule);
  if (o.dome) { hg.fillStyle = L.radial(hg, 0, 0, 0, o.domeR || 60, [[0, `rgba(255,255,255,${o.dome})`], [1, 'rgba(255,255,255,0)']]); hg.fillRect(-w, -h, w * 2, h * 2); }
  if (o.relief) o.relief(hg, r);
  hg.restore();
  hg.setTransform(1, 0, 0, 1, 0, 0);
  hg.globalAlpha = o.rough === undefined ? 0.085 : o.rough;
  hg.drawImage(L.noiseTex(W, H, { seed: seed + 'hn', scale: 15 * ss, octaves: 3, res: 1, contrast: 1.4 }), 0, 0);
  hg.globalAlpha = 1;
  const light = L.bumpLight(hc, { angle: 45, strength: o.strength || 3.4, res: 1, blur: 0.5 * ss });

  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.translate(W / 2, H / 2); g.scale(ss, ss);
  g.save(); o.path(g); g.clip(rule);
  g.fillStyle = L.linear(g, -w * 0.36, -h * 0.36, w * 0.36, h * 0.36, [[0, L.mix(pal.base, pal.lite, 0.5)], [0.5, pal.base], [1, L.mix(pal.base, pal.dark, 0.5)]]);
  g.fillRect(-w, -h, w * 2, h * 2);
  // patina clouds, then tighter corrosion spots
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(L.noiseTex(W, H, { seed: seed + 'p1', scale: 44 * ss, octaves: 4, res: 0.5, contrast: 2.6, bias: (pal.amt - 0.5) * 0.7, warp: 0.5,
    ramp: [[0, L.rgba(pal.pat[0], 0)], [0.42, L.rgba(pal.pat[0], 0)], [0.6, L.rgba(pal.pat[0], 0.82)], [1, L.rgba(pal.pat[1], 0.9)]] }), 0, 0);
  g.globalAlpha = pal.spotA || 1;
  g.drawImage(L.noiseTex(W, H, { seed: seed + 'p2', scale: 24 * ss, octaves: 3, res: 1, contrast: 3.0, bias: -0.16, warp: 0.4,
    ramp: [[0, L.rgba(pal.spot, 0)], [0.6, L.rgba(pal.spot, 0)], [0.72, L.rgba(pal.spot, 0.8)], [1, L.rgba(L.mix(pal.spot, pal.dark, 0.4), 0.92)]] }), 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'overlay'; g.drawImage(light, 0, 0);
  g.globalAlpha = 0.35; g.drawImage(light, 0, 0);
  g.restore();
  // scratches and pits (drawn structure, not noise)
  g.lineCap = 'round';
  for (let k = 0, n = o.scratch === undefined ? 26 : o.scratch; k < n; k++) {
    const x = r.range(-w / 2, w / 2), y = r.range(-h / 2, h / 2), a = r.range(-0.9, 0.5) + (r.chance(0.3) ? 1.4 : 0), len = r.range(4, 20);
    g.strokeStyle = L.rgba(r.chance(0.55) ? pal.lite : pal.dark, r.range(0.18, 0.5)); g.lineWidth = r.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let k = 0, n = o.pits === undefined ? 22 : o.pits; k < n; k++) {
    const x = r.range(-w / 2, w / 2), y = r.range(-h / 2, h / 2), rr = r.range(0.7, 2.1);
    g.fillStyle = L.rgba(pal.dark, r.range(0.35, 0.7)); g.beginPath(); g.ellipse(x, y, rr, rr * r.range(0.6, 1), r() * 3, 0, TAU); g.fill();
    g.strokeStyle = L.rgba(pal.lite, 0.5); g.lineWidth = 0.6; g.beginPath(); g.arc(x, y, rr + 0.5, 0.1, 1.5); g.stroke();
  }
  if (o.paint) o.paint(g, r);
  // form shadow towards the lower right, a touch of sky light on the upper left
  g.fillStyle = L.linear(g, -w * 0.4, -h * 0.4, w * 0.4, h * 0.4, [[0, 'rgba(255,250,235,0.10)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(20,12,6,0.26)']]);
  g.fillRect(-w, -h, w * 2, h * 2);
  g.restore();
  o.path(g); g.strokeStyle = L.rgba(pal.dark, 0.72); g.lineWidth = 1.3; g.lineJoin = 'round'; g.stroke();   // the plate's ink contour
  // out-of-focus copies and a soft silhouette for shadows
  const sh = L.makeCanvas(W, H), sg = sh.getContext('2d');
  sg.filter = `blur(${5 * ss}px)`; sg.drawImage(c, 0, 0); sg.filter = 'none';
  sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgb(45,28,12)'; sg.fillRect(0, 0, W, H);
  return { c, b1: L.blurred(c, 2.4 * ss), b2: L.blurred(c, 6.5 * ss), sh, ss };
}

// ───────────── shapes (sprite px; a cash coin has radius 72) ─────────────
const roundPath = (rad, wob, ph, hole, holeRound) => (g) => {
  g.beginPath();
  for (let k = 0; k <= 96; k++) { const t = (k / 96) * TAU, rr = rad * (1 + wob * Math.sin(t * 3 + ph) + wob * 0.6 * Math.sin(t * 7 + ph * 2)); k ? g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : g.moveTo(rr, 0); }
  g.closePath();
  if (hole) { if (holeRound) { g.moveTo(hole, 0); g.arc(0, 0, hole, 0, TAU); } else g.rect(-hole, -hole, hole * 2, hole * 2); }
};
function mkCash(seed, pal, v = {}) {
  const r = L.rng(seed), hole = v.hole || 15, rim = v.rim || 11, inner = v.inner === undefined ? 6 : v.inner;
  return metal(150, 150, { seed, pal, ss: v.ss, path: roundPath(72, 0.006, r() * 6, hole), relief(h) {
    h.strokeStyle = '#b6b6b6'; h.lineWidth = rim; h.beginPath(); h.arc(0, 0, 72 - rim / 2, 0, TAU); h.stroke();
    if (inner) { h.lineWidth = inner; h.lineJoin = 'miter'; h.strokeRect(-(hole + inner / 2), -(hole + inner / 2), hole * 2 + inner, hole * 2 + inner); }
    h.lineCap = 'round'; h.lineWidth = 3.2;
    if (v.mark === 'moon') { h.beginPath(); h.arc(0, -54, 15, 0.27 * Math.PI, 0.73 * Math.PI); h.stroke(); }
    if (v.mark === 'star') { h.fillStyle = '#b6b6b6'; h.beginPath(); h.arc(0, 41, 4.2, 0, TAU); h.fill(); }
  } });
}
function mkHuan(seed, pal) {
  const r = L.rng(seed);
  return metal(146, 146, { seed, pal, path: roundPath(70, 0.012, r() * 6, 13, true), relief(h) {
    h.strokeStyle = '#a4a4a4'; h.lineWidth = 5; h.beginPath(); h.arc(0, 0, 67, 0, TAU); h.stroke();
    h.lineWidth = 3; h.beginPath(); h.arc(0, 0, 15, 0, TAU); h.stroke();
  } });
}
function mkGold(seed) {
  const r = L.rng(seed);
  return metal(134, 134, { seed, pal: PAL.gold, path: roundPath(63, 0.022, r() * 6, 0), dome: 0.5, domeR: 70, strength: 3, scratch: 12, pits: 30, relief(h, q) {
    for (let k = 0; k < 16; k++) {       // the lumpy, cracked cast face of a gold cake
      const a = q() * TAU, d = Math.sqrt(q()) * 50, rr = q.range(7, 16);
      h.fillStyle = L.radial(h, Math.cos(a) * d, Math.sin(a) * d, 0, rr, [[0, 'rgba(255,255,255,0.34)'], [1, 'rgba(255,255,255,0)']]);
      h.beginPath(); h.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, TAU); h.fill();
    }
    h.strokeStyle = 'rgba(0,0,0,0.6)'; h.lineWidth = 1.5; h.lineJoin = 'round';
    for (let k = 0; k < 7; k++) {
      let x = q.range(-40, 40), y = q.range(-40, 40), a = q() * TAU; h.beginPath(); h.moveTo(x, y);
      for (let s = 0; s < 5; s++) { a += q.range(-0.9, 0.9); x += Math.cos(a) * q.range(5, 11); y += Math.sin(a) * q.range(5, 11); h.lineTo(x, y); }
      h.stroke();
    }
  } });
}
const spadePath = (g) => {
  g.beginPath(); g.moveTo(-12, -80); g.lineTo(12, -80); g.lineTo(13.5, -50); g.lineTo(40, -50); g.lineTo(44, -44); g.lineTo(46, 78);
  g.lineTo(17, 78); g.lineTo(14, 55); g.quadraticCurveTo(0, 40, -14, 55); g.lineTo(-17, 78); g.lineTo(-46, 78); g.lineTo(-44, -44); g.lineTo(-40, -50); g.lineTo(-13.5, -50); g.closePath();
};
function mkSpade(seed, pal) {
  return metal(100, 168, { seed, pal, path: spadePath, relief(h) {
    h.strokeStyle = '#b0b0b0'; h.lineWidth = 9; h.lineJoin = 'miter'; spadePath(h); h.stroke();       // raised border (clipped to the inside half)
    h.lineWidth = 2.6; h.lineCap = 'round';
    h.beginPath(); h.moveTo(0, -76); h.lineTo(0, 44); h.moveTo(-9, -48); h.lineTo(-30, 72); h.moveTo(9, -48); h.lineTo(30, 72); h.stroke();
  } });
}
const KN = { rho: 520, y0: -22 };
const knP = (phi, d) => [(KN.rho - d) * Math.sin(phi), KN.y0 + KN.rho - (KN.rho - d) * Math.cos(phi)];
const knifePath = (g) => {
  g.beginPath();
  for (let i = 0; i <= 28; i++) { const p = knP(-0.24 + 0.428 * (i / 28), 0); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
  for (let i = 0; i <= 10; i++) { const p = knP(0.188 - 0.158 * (i / 10), 14); g.lineTo(p[0], p[1]); }
  for (let i = 0; i <= 16; i++) { const u = i / 16, p = knP(0.016 - 0.226 * u, 31 - 3 * u); g.lineTo(p[0], p[1]); }
  g.closePath();
  const c = knP(0.2155, 7); g.moveTo(c[0] + 16, c[1]); g.arc(c[0], c[1], 16, 0, TAU);
  g.moveTo(c[0] + 7.5, c[1]); g.arc(c[0], c[1], 7.5, 0, TAU, true);
};
function mkKnife(seed, pal) {
  return metal(262, 60, { seed, pal, rule: 'nonzero', path: knifePath, scratch: 30, pits: 14, relief(h) {
    h.strokeStyle = '#b0b0b0'; h.lineWidth = 7; h.lineJoin = 'round'; knifePath(h); h.stroke();
    h.lineWidth = 2.2; h.beginPath();
    for (const d of [5.5, 9]) for (let i = 0; i <= 10; i++) { const p = knP(0.03 + 0.15 * (i / 10), d); i ? h.lineTo(p[0], p[1]) : h.moveTo(p[0], p[1]); }
    h.stroke();
  } });
}
const ingotPath = (g) => {
  g.beginPath(); g.moveTo(-62, -44); g.quadraticCurveTo(0, -20, 62, -44); g.quadraticCurveTo(77, 0, 62, 44); g.quadraticCurveTo(0, 20, -62, 44); g.quadraticCurveTo(-77, 0, -62, -44); g.closePath();
};
function mkIngot(seed) {
  return metal(150, 96, { seed, pal: PAL.silver, path: ingotPath, strength: 3, scratch: 34, pits: 12, relief(h, q) {
    h.strokeStyle = '#c0c0c0'; h.lineWidth = 15; h.lineJoin = 'round'; ingotPath(h); h.stroke();            // the raised lip
    h.lineWidth = 1.3;                                                                                      // cooling ripples in the sunken face
    for (let k = 1; k <= 6; k++) { h.strokeStyle = k % 2 ? 'rgba(210,210,210,0.8)' : 'rgba(40,40,40,0.7)'; h.beginPath(); h.ellipse(q.range(-2, 2), q.range(-1, 1), 7 * k, 3.1 * k, 0, 0, TAU); h.stroke(); }
  } });
}
const cowriePath = (g) => { g.beginPath(); g.moveTo(0, -56); g.bezierCurveTo(30, -56, 41, -24, 40, 4); g.bezierCurveTo(39, 36, 24, 56, 0, 56); g.bezierCurveTo(-24, 56, -39, 36, -40, 4); g.bezierCurveTo(-41, -24, -30, -56, 0, -56); g.closePath(); };
function mkCowrie(seed, pal) {
  const slit = (h) => { h.beginPath(); h.moveTo(1, -46); h.bezierCurveTo(-5, -18, 5, 16, -1, 47); };
  return metal(88, 120, { seed, pal, path: cowriePath, dome: 0.62, domeR: 52, strength: 2.6, scratch: 8, pits: 6, relief(h) {
    h.lineCap = 'round'; h.strokeStyle = '#161616'; h.lineWidth = 7; slit(h); h.stroke();
    h.lineWidth = 1.7;
    for (let k = -8; k <= 8; k++) { const y = k * 5.2, x = Math.sin(k * 0.42) * 2.2; h.beginPath(); h.moveTo(x - 11, y - 1.2); h.lineTo(x + 11, y + 1.2); h.stroke(); }
  }, paint(g) {
    g.lineCap = 'round'; g.strokeStyle = 'rgba(48,30,16,0.62)'; g.lineWidth = 4.2; slit(g); g.stroke();
    g.strokeStyle = 'rgba(70,46,24,0.4)'; g.lineWidth = 1.2;
    for (let k = -8; k <= 8; k++) { const y = k * 5.2, x = Math.sin(k * 0.42) * 2.2; g.beginPath(); g.moveTo(x - 10, y - 1.2); g.lineTo(x + 10, y + 1.2); g.stroke(); }
  } });
}

// kind table: w = width along the row (sprite px), reach = centre → the edge that faces the glyph outline, face = which local axis faces it
const KIND = {
  cash: { w: 144, reach: 72, foot: [[0, 0, 62]] },
  huan: { w: 140, reach: 70, foot: [[0, 0, 60]] },
  gold: { w: 126, reach: 63, foot: [[0, 0, 54]] },
  spade: { w: 92, reach: 78, face: 1, foot: [[0, -42, 30], [0, 30, 40]] },
  knife: { w: 250, reach: 22, face: -1, foot: [[-95, 2, 16], [-50, -6, 18], [-5, -8, 18], [45, -8, 12], [95, 0, 14]] },
  ingot: { w: 140, reach: 44, face: 1, foot: [[-34, 0, 34], [34, 0, 34]] },
  cowrie: { w: 80, reach: 56, face: 1, foot: [[0, -16, 30], [0, 18, 30]] },
};

let B = null;   // everything built once (also on demand by drawFlyers)
function ensure() {
  if (B) return B;
  const P = PAL;
  const lib = {
    cash: [mkCash('c1', P.green, { mark: 'moon' }), mkCash('c2', P.red, { hole: 17, rim: 9 }), mkCash('c3', P.black, { rim: 13, inner: 7 }), mkCash('c4', P.brass, { hole: 13, rim: 12, mark: 'star' }),
      mkCash('c5', P.blue, { hole: 18, rim: 8, inner: 0 }), mkCash('c6', P.green, { hole: 14, rim: 10 }), mkCash('c7', P.red, { rim: 12, mark: 'moon' }), mkCash('c8', P.brass, { hole: 16, rim: 10, inner: 5 })],
    huan: [mkHuan('h1', P.blue), mkHuan('h2', P.black), mkHuan('h3', P.green)],
    gold: [mkGold('g1'), mkGold('g2')],
    spade: [mkSpade('s1', P.green), mkSpade('s2', P.red), mkSpade('s3', P.blue), mkSpade('s4', P.black)],
    knife: [mkKnife('k1', P.green), mkKnife('k2', P.red)],
    ingot: [mkIngot('i1'), mkIngot('i2')],
    cowrie: [mkCowrie('w1', P.bone), mkCowrie('w2', P.bone), mkCowrie('w3', P.green)],
  };
  const hero = mkCash('hero', P.green, { ss: 3, mark: 'moon', hole: 16 });
  const r = L.rng('z1lay'); const items = []; const cnt = {};
  const put = (kind, px, py, faceAng, w, row) => {     // (px,py) = the point of the glyph outline this object touches; faceAng = direction centre → that point
    const kd = KIND[kind], scale = w / kd.w; cnt[kind] = (cnt[kind] || 0) + 1;
    const spr = lib[kind][(cnt[kind] - 1) % lib[kind].length];
    const x = px - Math.cos(faceAng) * kd.reach * scale, y = py - Math.sin(faceAng) * kd.reach * scale;
    const rot = kd.face ? faceAng - kd.face * Math.PI / 2 + r.range(-0.035, 0.035) : r() * TAU;
    items.push({ kind, spr, x, y, rot, scale, row, kd });
  };
  // outer row: outer edges on the circle
  const ring = [['cash', 96], ['spade', 60], ['cash', 92], ['knife', 172], ['gold', 88], ['cowrie', 54], ['cash', 98], ['ingot', 124], ['huan', 84], ['spade', 60], ['cash', 94],
    ['cowrie', 54], ['knife', 172], ['cash', 96], ['gold', 86], ['spade', 60], ['huan', 86], ['cash', 96], ['ingot', 124], ['cowrie', 54], ['cash', 92]];
  const rc = (kind, w) => G.R - (kind === 'knife' ? 14 : KIND[kind].reach * (w / KIND[kind].w));
  let tot = 0; for (const [k, w] of ring) tot += w / rc(k, w);
  const f = TAU / tot; let ang = -1.9;
  for (const [k, w] of ring) {
    const da = (w / rc(k, w)) * f, a = ang + da / 2; ang += da;
    put(k, G.cx + Math.cos(a) * G.R, G.cy + Math.sin(a) * G.R, a, w * Math.min(1.03, f / 1.012), 'ring');
  }
  // inner row: inner edges on the four straight sides of the hole, a round coin in each corner
  const cr = [47, 45, 48, 46];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
    const rad = cr[i], kind = i === 1 ? 'gold' : i === 3 ? 'huan' : 'cash', kd = KIND[kind];
    cnt[kind] = (cnt[kind] || 0) + 1;
    items.push({ kind, spr: lib[kind][(cnt[kind] + 2) % lib[kind].length], x: G.cx + sx * (G.a + rad), y: G.cy + sy * (G.a + rad), rot: r() * TAU, scale: (rad * 2) / kd.w, row: 'square', kd });
  });
  const sides = [
    { n: -Math.PI / 2, list: [['spade', 58], ['cash', 90], ['huan', 82]] },
    { n: 0, list: [['cash', 84], ['ingot', 118], ['cowrie', 46]] },
    { n: Math.PI / 2, list: [['cash', 86], ['spade', 58], ['cash', 92]] },
    { n: Math.PI, list: [['ingot', 118], ['cowrie', 46], ['cash', 80]] },
  ];
  for (const sd of sides) {
    const nx = Math.cos(sd.n), ny = Math.sin(sd.n), tx = -ny, ty = nx; const span = 2 * (G.a + 2);
    const sum = sd.list.reduce((s, e) => s + e[1], 0), gap = (span - sum) / (sd.list.length + 1); let t = -span / 2 + gap;
    for (const [k, w] of sd.list) {
      const m = t + w / 2; t += w + gap;
      put(k, G.cx + nx * G.a + tx * m, G.cy + ny * G.a + ty * m, sd.n + Math.PI, w, 'square');
    }
  }
  // fill the flesh between the two rows with smaller pieces (drawn first, underneath)
  const avoid = [];
  for (const it of items) for (const [fx, fy, fr] of it.kd.foot) {
    const c = Math.cos(it.rot), s = Math.sin(it.rot);
    avoid.push({ x: it.x + (fx * c - fy * s) * it.scale, y: it.y + (fx * s + fy * c) * it.scale, r: fr * it.scale });
  }
  const fills = K.scatter({ seed: 'z1fill', spacing: 53, margin: 25, avoid, max: 48 });
  const fk = ['cash', 'cowrie', 'cash', 'huan', 'cash', 'gold', 'cowrie'];
  const fl = fills.map((p, i) => {
    const kind = fk[i % fk.length], kd = KIND[kind]; cnt[kind] = (cnt[kind] || 0) + 1;
    const w = kind === 'cowrie' ? r.range(35, 40) : r.range(46, 54);
    return { kind, spr: lib[kind][(cnt[kind] + 4) % lib[kind].length], x: p.x, y: p.y, rot: r() * TAU, scale: w / kd.w, row: 'fill', kd };
  });
  const all = [...fl, ...items];
  // choreography: who leaves when, and how it tumbles
  const q = L.rng('z1fly'); const order = all.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(q() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const heroIt = all.find((it) => it.kind === 'cash' && it.row === 'ring' && it.x < G.cx && it.y < G.cy) || all[all.length - 1];
  const nd = Math.floor(order.length * 0.84); let k = 0;
  for (const i of order) {
    const it = all[i];
    it.f0 = 999; it.dur = q.range(8, 11); it.spin = q.range(-2.6, 2.6); it.flip = q.range(0.55, 1.15); it.ax = q() * TAU;
    it.dx = q.range(-0.35, 0.35); it.dy = q.range(-0.35, 0.35); it.wob = q.chance(0.14) ? q() * TAU : null;
    if (it === heroIt) continue;
    if (k < nd) { it.f0 = 12 + 21 * Math.pow(k / nd, 0.62); k++; }
  }
  heroIt.f0 = 26.5; heroIt.dur = 11.5; heroIt.hero = true; heroIt.wob = null;
  // paper, a faint plate rule, and the tone the coins left where they lay
  const paper = K.paper({ base: '#efe7d3', tone: '#8a6a3a', seed: 'z1paper', fiber: 0.55, stain: 0.32, foxing: 0.3, edge: 0.2 });
  const pg = paper.getContext('2d');
  pg.strokeStyle = 'rgba(92,70,44,0.42)'; pg.lineWidth = 1.6; pg.strokeRect(41.5, 41.5, S - 83, S - 83);
  pg.strokeStyle = 'rgba(92,70,44,0.3)'; pg.lineWidth = 0.8; pg.strokeRect(48.5, 48.5, S - 97, S - 97);
  for (const it of all) { pg.save(); pg.globalAlpha = 0.07; pg.translate(it.x, it.y); pg.rotate(it.rot); pg.scale(it.scale, it.scale); pg.drawImage(it.spr.sh, -it.spr.sh.width / 2, -it.spr.sh.height / 2); pg.restore(); }
  // every coin at rest, with its contact shadow, baked once (draw() only blits these)
  for (const it of all) {
    const d = Math.ceil(Math.hypot(it.spr.c.width, it.spr.c.height) * it.scale) + 44;
    const c = L.makeCanvas(d, d), g = c.getContext('2d');
    it.ix = Math.round(it.x - d / 2); it.iy = Math.round(it.y - d / 2);
    K.stamp(g, it.spr.c, it.x - it.ix, it.y - it.iy, { rot: it.rot, scale: it.scale, shadow: { dx: 4, dy: 7, blur: 8, color: 'rgba(45,28,12,0.4)' } });
    it.rest = c;
  }
  // flyers for the title card
  const fq = L.rng('z1card'); const fkinds = ['cash', 'spade', 'cash', 'gold', 'cowrie', 'cash', 'ingot', 'huan', 'cash', 'spade', 'cash', 'gold'];
  const flyers = fkinds.map((kind, i) => {
    const a = (i / fkinds.length) * TAU + fq.range(-0.2, 0.2), d = fq.range(70, 330);
    return { spr: lib[kind][(i * 3 + 1) % lib[kind].length], x: G.cx + Math.cos(a) * d, y: G.cy + Math.sin(a) * d, a: a + fq.range(-0.3, 0.3), s0: fq.range(1.0, 2.5) * (kind === 'cowrie' ? 0.8 : 1),
      te: fq.range(0.5, 0.94), rot: fq() * TAU, spin: fq.range(-3, 3), flip: fq.range(0.5, 1.3), ax: fq() * TAU, ph: fq() * TAU };
  });
  B = { lib, hero, all, paper, flyers, heroIt };
  return B;
}

function blit(ctx, spr, x, y, rot, sc, ax, fc, nominal) {
  const img = nominal < 1.5 ? spr.c : nominal < 3 ? spr.b1 : spr.b2, k = sc / spr.ss;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ax); ctx.scale(1, fc); ctx.rotate(rot - ax); ctx.scale(k, k);
  ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
}
function flyState(it, u) {
  if (it.hero) {
    const e = L.smooth(Math.min(1, u * 1.15));
    return { x: L.lerp(it.x, 505, e), y: L.lerp(it.y, 525, e), sc: it.scale * Math.exp(2.84 * u), rot: L.lerp(it.rot, Math.round(it.rot / (Math.PI / 2)) * (Math.PI / 2) + 0.05, e), fc: Math.max(0.12, Math.abs(Math.cos((1 - Math.min(1, u * 1.2)) * 2.4))), ax: it.ax };
  }
  const m = 1 / (1 - 0.8 * u), v = u * u;
  const ox = it.x - G.cx, oy = it.y - G.cy, d = Math.hypot(ox, oy) || 1;
  return { x: G.cx + ox * m + (ox / d + it.dx) * v * 380, y: G.cy + oy * m + (oy / d + it.dy) * v * 380, sc: it.scale * m,
    rot: it.rot + it.spin * u, fc: Math.max(0.3, Math.abs(Math.cos(it.flip * Math.PI * u))), ax: it.ax };
}
function drawFly(ctx, it, u, spr) {
  const du = 0.55 / it.dur, a = flyState(it, u), b = flyState(it, Math.max(0, u - du));
  const move = Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.sc - b.sc) * 70 + Math.abs(a.fc - b.fc) * 90 * a.sc;
  const n = Math.max(1, Math.min(it.hero ? 6 : 8, Math.ceil(move / 5)));
  // its shadow stays on the paper: slides to the lower right, spreads and fades as the coin climbs
  if (!it.hero || u < 0.6) {
    const sh = spr.sh, k = (it.scale * (1 + 1.4 * u)) / spr.ss;
    ctx.save(); ctx.globalAlpha = 0.36 * Math.pow(1 - Math.min(1, u * (it.hero ? 1.6 : 1)), 2.3);
    ctx.translate(L.lerp(it.x, a.x, 0.22) + 4 + 46 * u, L.lerp(it.y, a.y, 0.22) + 7 + 70 * u); ctx.rotate(a.ax); ctx.scale(1, a.fc); ctx.rotate(a.rot - a.ax); ctx.scale(k, k);
    ctx.drawImage(sh, -sh.width / 2, -sh.height / 2); ctx.restore();
  }
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? a : flyState(it, u - du * (1 - i / (n - 1)));
    ctx.globalAlpha = 1 / (i + 1);
    blit(ctx, spr, s.x, s.y, s.rot, s.sc, s.ax, s.fc, it.hero ? (u < 0.45 ? 0 : 1.6) : s.sc / it.scale * 0.8);
  }
  ctx.globalAlpha = 1;
}

/** for the title card: coins still flying off, on a transparent background. t ∈ [0,1]; nothing is left at t = 1. */
export function drawFlyers(ctx, t) {
  if (!(t < 1)) return;
  const b = ensure(); t = Math.max(0, t);
  const live = b.flyers.filter((f) => t < f.te).sort((p, q) => q.te - p.te);
  for (const f of live) {
    const st = (u) => {
      const m = 1 + 3.2 * Math.pow(u, 1.5), v = u * u;
      return { x: G.cx + (f.x - G.cx) * m + Math.cos(f.a) * v * 1450, y: G.cy + (f.y - G.cy) * m + Math.sin(f.a) * v * 1450, sc: f.s0 * (1 + 1.6 * u),
        rot: f.rot + f.spin * u, fc: Math.max(0.3, Math.abs(Math.cos(f.ph + f.flip * Math.PI * u))) };
    };
    const u = t / f.te, du = 0.022 / f.te, a = st(u), p = st(Math.max(0, u - du));
    const n = Math.max(2, Math.min(12, Math.ceil(Math.hypot(a.x - p.x, a.y - p.y) / 5)));
    ctx.save();
    for (let i = 0; i < n; i++) {
      const s = st(Math.max(0, u - du * (1 - i / (n - 1))));
      ctx.globalAlpha = 1 / (i + 1);
      blit(ctx, f.spr, s.x, s.y, s.rot, s.sc, f.ax, s.fc, s.sc);
    }
    ctx.restore();
  }
}

export default {
  name: '百钱成钱·飞散',
  init() { ensure(); },
  draw(ctx, env) {
    const b = ensure(), f = env.frame;
    ctx.drawImage(b.paper, 0, 0);
    const fly = [];
    for (const it of b.all) {
      const u = (f - it.f0) / it.dur;
      if (u >= 1 && !it.hero) continue;
      if (u > 0) { fly.push([it, Math.min(u, 0.999)]); continue; }
      const w = it.wob === null ? 0 : Math.sin(f * 1.1 + it.wob);            // a few coins rock very slightly before anything leaves
      if (!w) { ctx.drawImage(it.rest, it.ix, it.iy); continue; }
      ctx.save(); ctx.translate(it.x + w * 0.5, it.y); ctx.rotate(w * 0.012); ctx.drawImage(it.rest, it.ix - it.x, it.iy - it.y); ctx.restore();
    }
    fly.sort((p, q) => (p[0].hero ? 1 : q[0].hero ? -1 : p[1] - q[1]));
    for (const [it, u] of fly) drawFly(ctx, it, u, it.hero ? b.hero : it.spr);
  },
};
