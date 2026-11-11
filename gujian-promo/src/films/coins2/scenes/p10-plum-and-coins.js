// h3 — 梅枝铜钱: a gongbi / botanical-plate study on grey-pink old paper. One old plum bough forks and bends into a circle (the coin's
// outer rim), four short sticks lashed into a square sit in the middle (the square hole), vermilion blossoms and buds fill the body
// between them, and a few patinated cash coins hang from the wood on red cords. A handful of petals drift down over the 22 frames.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const N = 1400, O = (N - S) / 2;                 // oversize layer; page coords = frame coords shifted by O
const G = K.COIN;
const LX = -0.7071, LY = -0.7071;                // unit vector pointing TO the light (top-left)
let layer = null, petals = [];

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cs = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
const BARK = [80, 62, 54], BARK_HI = [163, 139, 120], BARK_DK = [30, 21, 18];

// ── a woody limb: variable-width ribbon, dry-brush streaks lit from the top-left, bark cracks, brushed ink contour ──
function limb(g, raw, w0, w1, seed, o = {}) {
  const pts = L.smoothPath(raw, 4), n = pts.length; if (n < 2) return;
  const rnd = L.rng(seed), nz = L.makeNoise(seed);
  const rough = o.rough === undefined ? 1 : o.rough;
  const NX = new Array(n), NY = new Array(n), HW = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    NX[i] = -dy / l; NY[i] = dx / l;
    HW[i] = 0.5 * L.lerp(w0, w1, i / (n - 1)) * (1 + rough * (0.11 * nz.n2(i * 0.05, 1.7) + 0.05 * nz.n2(i * 0.23, 8.1)));
  }
  const ex = (s, i) => pts[i][0] + NX[i] * HW[i] * s, ey = (s, i) => pts[i][1] + NY[i] * HW[i] * s;
  const outline = () => {
    g.beginPath();
    for (let i = 0; i < n; i++) (i ? g.lineTo(ex(1, i), ey(1, i)) : g.moveTo(ex(1, i), ey(1, i)));
    for (let i = n - 1; i >= 0; i--) g.lineTo(ex(-1, i), ey(-1, i));
    g.closePath();
  };
  g.save();
  if (o.shadow !== false) { g.shadowColor = 'rgba(70,40,34,0.30)'; g.shadowBlur = 6; g.shadowOffsetX = 2.5; g.shadowOffsetY = 4; }
  g.fillStyle = cs(BARK); outline(); g.fill(); g.restore();
  g.save(); outline(); g.clip(); g.lineCap = 'round'; g.lineJoin = 'round';
  const wmax = Math.max(w0, w1);
  // broad modelling first: light band on the lit side, dark on the far side
  for (const f of [-0.72, -0.4, 0.4, 0.72]) {
    for (let i0 = 0; i0 < n - 1; i0 += 6) {
      const i1 = Math.min(n - 1, i0 + 7), im = (i0 + i1) >> 1, lit = f * (NX[im] * LX + NY[im] * LY);
      g.strokeStyle = cs(lit > 0 ? BARK_HI : BARK_DK, Math.min(0.5, Math.abs(lit) * 0.5)); g.lineWidth = Math.max(1.5, HW[im] * 0.62);
      g.beginPath(); g.moveTo(ex(f, i0), ey(f, i0)); for (let i = i0 + 1; i <= i1; i++) g.lineTo(ex(f, i), ey(f, i)); g.stroke();
    }
  }
  // dry-brush streaks running along the grain
  const runs = Math.round(n * Math.max(4, wmax * 0.8) * 0.17);
  for (let k = 0; k < runs; k++) {
    const i0 = rnd.int(0, n - 2), i1 = Math.min(n - 1, i0 + rnd.int(4, 16)), f = rnd.range(-1, 1), im = (i0 + i1) >> 1;
    const lit = f * (NX[im] * LX + NY[im] * LY) + rnd.range(-0.25, 0.25);
    const col = lit > 0 ? mixc(BARK, BARK_HI, L.clamp(lit * 1.2)) : mixc(BARK, BARK_DK, L.clamp(-lit * 1.2));
    g.strokeStyle = cs(col, rnd.range(0.35, 0.85)); g.lineWidth = rnd.range(0.7, 1.8);
    g.beginPath(); g.moveTo(ex(f, i0), ey(f, i0));
    for (let i = i0 + 1; i <= i1; i++) { const ff = f + 0.06 * Math.sin(i * 0.7 + k); g.lineTo(ex(ff, i), ey(ff, i)); }
    g.stroke();
  }
  // bark cracks across the grain + a few knots on the thick wood
  if (wmax > 12) {
    for (let k = 0, m = Math.round(n / 6); k < m; k++) {
      const i = rnd.int(1, n - 2), f1 = rnd.range(-1, 0.4), f2 = f1 + rnd.range(0.3, 0.9), j = Math.min(n - 1, i + rnd.int(-2, 2) + 2);
      g.strokeStyle = cs(BARK_DK, rnd.range(0.35, 0.7)); g.lineWidth = rnd.range(0.7, 1.4);
      g.beginPath(); g.moveTo(ex(f1, i), ey(f1, i)); g.quadraticCurveTo(ex((f1 + f2) / 2, j), ey((f1 + f2) / 2, j), ex(Math.min(1, f2), i), ey(Math.min(1, f2), i)); g.stroke();
    }
    for (let k = 0, m = Math.round(n / 70); k < m; k++) {
      const i = rnd.int(4, n - 5), f = rnd.range(-0.45, 0.45), x = ex(f, i), y = ey(f, i), rr = HW[i] * rnd.range(0.28, 0.42), ang = Math.atan2(-NX[i], NY[i]);
      g.fillStyle = cs(BARK_DK, 0.75); g.beginPath(); g.ellipse(x, y, rr * 1.5, rr, ang, 0, TAU); g.fill();
      g.fillStyle = cs(BARK_HI, 0.55); g.beginPath(); g.ellipse(x - 0.8, y - 0.8, rr * 0.9, rr * 0.5, ang, 0, TAU); g.fill();
      g.strokeStyle = cs(BARK_DK, 0.6); g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, y, rr * 2.1, rr * 1.5, ang, 0, TAU); g.stroke();
    }
  }
  g.restore();
  // brushed ink contour: heavier on the side away from the light
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of [1, -1]) {
    for (let i0 = 0; i0 < n - 1;) {
      const i1 = Math.min(n - 1, i0 + rnd.int(8, 22)), im = (i0 + i1) >> 1, lit = s * (NX[im] * LX + NY[im] * LY);
      g.strokeStyle = cs(BARK_DK, lit > 0 ? 0.62 : 0.94); g.lineWidth = (lit > 0 ? 1.1 : 1.9) * rnd.range(0.8, 1.2) * (wmax > 12 ? 1 : 0.78);
      g.beginPath(); g.moveTo(ex(s, i0), ey(s, i0)); for (let i = i0 + 1; i <= i1; i++) g.lineTo(ex(s, i), ey(s, i)); g.stroke();
      i0 = i1;
    }
  }
  g.restore();
}

function moss(g, x, y, rnd) {       // 苔点: ink dots topped with malachite
  for (let k = 0, m = rnd.int(3, 6); k < m; k++) {
    const dx = rnd.range(-9, 9), dy = rnd.range(-7, 7), r = rnd.range(1.8, 3.4);
    g.fillStyle = 'rgba(28,22,18,0.82)'; g.beginPath(); g.ellipse(x + dx, y + dy, r * 1.2, r, rnd() * 3, 0, TAU); g.fill();
    g.fillStyle = rnd.chance(0.5) ? 'rgba(86,150,122,0.92)' : 'rgba(58,118,98,0.92)'; g.beginPath(); g.ellipse(x + dx - 0.7, y + dy - 0.8, r * 0.78, r * 0.62, rnd() * 3, 0, TAU); g.fill();
  }
}

function bud(g, x, y, r, dir, rnd) {
  g.save(); g.translate(x, y);
  g.save(); g.shadowColor = 'rgba(70,40,34,0.32)'; g.shadowBlur = 4; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2.5;
  g.fillStyle = L.radial(g, -r * 0.32, -r * 0.36, r * 0.08, r * 1.2, [[0, '#f08e72'], [0.4, '#d2432a'], [1, '#8a1d14']]);
  g.beginPath(); g.ellipse(0, 0, r, r * 0.94, dir, 0, TAU); g.fill(); g.restore();
  g.strokeStyle = 'rgba(102,20,15,0.88)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(0, 0, r, r * 0.94, dir, 0, TAU); g.stroke();
  // overlapping petal seams
  g.strokeStyle = 'rgba(118,24,17,0.6)'; g.lineWidth = 0.85;
  for (const s of [-1, 1]) {
    const a = dir + s * 0.55;
    g.beginPath(); g.moveTo(-Math.cos(dir) * r * 0.7, -Math.sin(dir) * r * 0.7);
    g.quadraticCurveTo(Math.cos(a + s * 1.2) * r * 0.75, Math.sin(a + s * 1.2) * r * 0.75, Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); g.stroke();
  }
  // calyx hugging the base
  for (const j of [-0.75, 0, 0.75]) {
    const a = dir + Math.PI + j;
    g.fillStyle = j === 0 ? '#3f201d' : '#57302a'; g.beginPath(); g.ellipse(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, r * 0.44, r * 0.3, a + Math.PI / 2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(25,14,12,0.7)'; g.lineWidth = 0.8; g.stroke();
  }
  g.fillStyle = 'rgba(255,225,205,0.5)'; g.beginPath(); g.ellipse(-r * 0.36, -r * 0.4, r * 0.22, r * 0.13, -0.7, 0, TAU); g.fill();
  g.restore();
}

function petalPath(q, pr, ph, sx = 0.95, sy = 1.05) {
  q.beginPath();
  for (let j = 0; j <= 40; j++) {
    const t = (j / 40) * TAU, rr = pr * (1 + 0.045 * Math.sin(3 * t + ph) + 0.025 * Math.sin(5 * t + ph * 2.3));
    const x = Math.cos(t) * rr * sx, y = Math.sin(t) * rr * sy;
    j ? q.lineTo(x, y) : q.moveTo(x, y);
  }
  q.closePath();
}

function blossomSprite(seed, r) {
  const D = Math.ceil(r * 2.5);
  return K.sprite(D, D, (q) => {
    const rnd = L.rng(seed), a0 = rnd() * TAU, pale = rnd.chance(0.3);
    const stops = pale ? [[0, '#a3261a'], [0.3, '#c9432c'], [0.68, '#e06a4e'], [1, '#f0a48c']] : [[0, '#861a12'], [0.3, '#b32c1c'], [0.68, '#cf442b'], [1, '#e37a5c']];
    q.lineJoin = 'round'; q.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const ang = a0 + (k / 5) * TAU + rnd.range(-0.09, 0.09), pr = r * rnd.range(0.47, 0.54), pd = r * rnd.range(0.47, 0.52), ph = rnd() * 6;
      q.save(); q.rotate(ang); q.translate(pd, 0);
      q.save(); q.shadowColor = 'rgba(80,14,10,0.45)'; q.shadowBlur = 3; q.shadowOffsetX = 0.8; q.shadowOffsetY = 1.2;
      q.fillStyle = L.radial(q, -pd, 0, r * 0.08, r * 1.04, stops);
      petalPath(q, pr, ph); q.fill(); q.restore();
      q.save(); petalPath(q, pr, ph); q.clip();
      // pale turned rim + fine veins fanning from the claw
      q.strokeStyle = 'rgba(255,224,206,0.34)'; q.lineWidth = 3.2; petalPath(q, pr * 0.97, ph); q.stroke();
      q.lineWidth = 0.7;
      for (let v = -3; v <= 3; v++) {
        const va = v * 0.26 + rnd.range(-0.05, 0.05), len = pr * rnd.range(1.25, 1.75);
        q.strokeStyle = `rgba(112,18,12,${rnd.range(0.2, 0.36).toFixed(3)})`;
        q.beginPath(); q.moveTo(-pr * 0.95, 0); q.quadraticCurveTo(-pr * 0.2, Math.sin(va) * len * 0.3, -pr * 0.95 + Math.cos(va) * len, Math.sin(va) * len); q.stroke();
      }
      q.restore();
      q.strokeStyle = 'rgba(98,18,13,0.9)'; q.lineWidth = 1.15; petalPath(q, pr, ph); q.stroke();
      q.restore();
    }
    // heart: green-gold cushion, a ring of cream filaments with ochre anthers
    q.fillStyle = L.radial(q, -1, -1, 0.5, r * 0.17, [[0, '#d9c66a'], [0.6, '#9a9a48'], [1, '#5a4a26']]);
    q.beginPath(); q.arc(0, 0, r * 0.15, 0, TAU); q.fill();
    const ns = rnd.int(17, 23);
    for (let k = 0; k < ns; k++) {
      const a = (k / ns) * TAU + rnd.range(-0.1, 0.1), len = r * rnd.range(0.3, 0.6), bend = rnd.range(-0.25, 0.25);
      const x1 = Math.cos(a) * len, y1 = Math.sin(a) * len, mx = Math.cos(a + bend) * len * 0.55, my = Math.sin(a + bend) * len * 0.55;
      q.strokeStyle = 'rgba(92,30,16,0.55)'; q.lineWidth = 1.7; q.beginPath(); q.moveTo(0, 0); q.quadraticCurveTo(mx + 0.5, my + 0.7, x1 + 0.5, y1 + 0.7); q.stroke();
      q.strokeStyle = '#f6ebc6'; q.lineWidth = 0.95; q.beginPath(); q.moveTo(0, 0); q.quadraticCurveTo(mx, my, x1, y1); q.stroke();
      q.fillStyle = '#7a4a14'; q.beginPath(); q.arc(x1 + 0.4, y1 + 0.5, 2.1, 0, TAU); q.fill();
      q.fillStyle = rnd.chance(0.5) ? '#f0c148' : '#e2a52e'; q.beginPath(); q.arc(x1, y1, 1.7, 0, TAU); q.fill();
    }
  });
}

// ── a worn cash coin with malachite patina: per-pixel height field lit from the top-left (no inscription) ──
function coinSprite(seed, Rc) {
  const SS = 2, D = Math.ceil(Rc * 2 + 8), W = D * SS;
  const c = L.makeCanvas(W, W), q = c.getContext('2d'), img = q.createImageData(W, W), d = img.data;
  const nz = L.makeNoise(seed), rnd = L.rng(seed), hh = Rc * 0.25, ox = rnd.range(0, 60), oy = rnd.range(0, 60);
  const sm = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const H = (x, y) => {
    const rd = Math.hypot(x, y), sq = Math.max(Math.abs(x), Math.abs(y));
    let h = sm(Rc * 0.79, Rc * 0.84, rd) * (1 - 0.75 * sm(Rc * 0.93, Rc, rd));
    h += (1 - sm(hh + Rc * 0.09, hh + Rc * 0.135, sq)) * (0.45 + 0.55 * sm(hh - 1, hh + Rc * 0.05, sq));
    return h + 0.11 * nz.fbm(x * 0.085 + ox, y * 0.085 + oy, 3) + 0.045 * nz.n2(x * 0.33 + ox, y * 0.33 - oy);
  };
  const dk = [52, 40, 26], br = [150, 118, 62], hi = [214, 184, 116], g1 = [86, 156, 130], g2 = [40, 96, 82], g3 = [164, 206, 182];
  for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
    const x = (px + 0.5) / SS - D / 2, y = (py + 0.5) / SS - D / 2;
    const rd = Math.hypot(x, y), sq = Math.max(Math.abs(x), Math.abs(y));
    const al = (1 - sm(Rc - 0.8, Rc + 0.2, rd)) * sm(hh - 0.5, hh + 0.5, sq);
    if (al <= 0) continue;
    const h = H(x, y), sl = H(x + 0.8, y + 0.8) - H(x - 0.8, y - 0.8);
    const pat = sm(-0.18, 0.32, nz.fbm(x * 0.05 + ox + 9, y * 0.05 + oy + 4, 4) + (0.5 - h) * 0.4 + 0.1 * nz.n2(x * 0.24, y * 0.24 + ox));
    let col = mixc(dk, br, L.clamp(0.3 + h * 0.62));
    let pc = mixc(g2, g1, sm(-0.35, 0.4, nz.n2(x * 0.11 + 3, y * 0.11 + ox)));
    pc = mixc(pc, g3, 0.75 * sm(0.38, 0.7, nz.n2(x * 0.36 + 7, y * 0.36 + oy)));
    col = mixc(col, pc, pat * 0.9);
    const sh = L.clamp(sl * 1.5, -0.6, 0.7);
    col = sh > 0 ? mixc(col, hi, sh * (1 - pat * 0.45)) : mixc(col, [16, 12, 8], -sh * 0.9);
    const o = (py * W + px) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = al * 255;
  }
  q.putImageData(img, 0, 0);
  return K.sprite(D, D, (g) => {
    g.imageSmoothingQuality = 'high'; g.drawImage(c, -D / 2, -D / 2, D, D);
    g.strokeStyle = 'rgba(30,22,16,0.7)'; g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, Rc - 0.5, 0, TAU); g.stroke();
    g.strokeRect(-hh, -hh, hh * 2, hh * 2);
  });
}

function cord(g, x0, y0, x1, y1, bow, rnd) {      // twisted red silk cord
  const mx = (x0 + x1) / 2 + bow, my = (y0 + y1) / 2;
  const path = () => { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); };
  g.save(); g.lineCap = 'round';
  g.shadowColor = 'rgba(70,40,34,0.3)'; g.shadowBlur = 3; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2.5;
  g.strokeStyle = '#6e1610'; g.lineWidth = 3.2; path(); g.stroke();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#b8301f'; g.lineWidth = 2; path(); g.stroke();
  g.setLineDash([2.2, 3.4]); g.lineDashOffset = rnd() * 5; g.strokeStyle = 'rgba(240,150,120,0.75)'; g.lineWidth = 1; path(); g.stroke();
  g.restore();
}

function build() {
  const pap = K.paper({ base: '#d9c5bd', tone: '#7b554a', seed: 'h3paper', size: N, fiber: 0.75, stain: 0.36, foxing: 0.26, edge: 0.24 });
  const pg = pap.getContext('2d');
  const cx = G.cx, cy = G.cy, R = G.R, a = G.a;

  // faint 烘染 wash filling the coin's body so the form reads from far away
  const wash = L.makeCanvas(N, N), wg = wash.getContext('2d');
  wg.translate(O, O); K.fillCoin(wg, '#c29a8a', { grow: -4 });
  pg.save(); pg.globalCompositeOperation = 'multiply'; pg.globalAlpha = 0.3; pg.drawImage(L.blurred(wash, 16), 0, 0); pg.restore();

  const art = L.makeCanvas(N, N), g = art.getContext('2d');
  g.translate(O, O);
  const rnd = L.rng('h3');
  const P = (ang, r) => [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];

  // coins (page coords) and the points their cords hang from
  const coins = [
    { x: cx - 108, y: cy - 236, hx: cx - 110, hy: cy - 338, rot: -0.12 },
    { x: cx + 152, y: cy - 224, hx: cx + 150, hy: cy - 322, rot: 0.2 },
    { x: cx + 42, y: cy + 238, hx: cx + 40, hy: cy + a + 8, rot: 0.08 },
    { x: cx - 252, y: cy + 66, hx: cx - 250, hy: cy - 34, rot: -0.24 },
    { x: cx + 262, y: cy + 26, hx: cx + 258, hy: cy - 78, rot: 0.3 },
  ];
  coins.forEach((c, i) => { c.R = 44 + rnd.range(0, 5); c.spr = coinSprite('h3coin' + i, c.R); });

  // blossoms fill the body; each grows on a short spur from the ring or from the square frame
  const avoid = coins.map((c) => ({ x: c.x, y: c.y, r: 56 }));
  coins.forEach((c) => { avoid.push({ x: c.hx, y: (c.hy + c.y) / 2, r: 6 }); });
  const spots = K.scatter({ seed: 'h3flowers', spacing: 86, margin: 37, avoid, max: 40 });
  const fr = a + 8;                                 // centre line of the square frame sticks
  const spurs = [];
  spots.forEach((p, i) => {
    const dx = p.x - cx, dy = p.y - cy, rr = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    let ax, ay;
    if (rr > 258) { const t2 = th + rnd.sign() * rnd.range(0.12, 0.24); [ax, ay] = P(t2, R - 13); }
    else if (Math.abs(dx) > Math.abs(dy)) { ax = cx + Math.sign(dx) * fr; ay = cy + L.clamp(dy + rnd.range(-26, 26), -fr, fr); }
    else { ay = cy + Math.sign(dy) * fr; ax = cx + L.clamp(dx + rnd.range(-26, 26), -fr, fr); }
    const mx = (ax + p.x) / 2 + rnd.range(-9, 9), my = (ay + p.y) / 2 + rnd.range(-9, 9);
    spurs.push({ raw: [[ax, ay], [mx, my], [p.x, p.y]], seed: 'h3spur' + i });
    p.r = rnd.range(31, 40); p.spin = rnd() * TAU;
  });

  // 1 · thin wood first: spurs, the twigs carrying the side coins, the four diagonal twigs tying the frame to the ring
  spurs.forEach((s) => limb(g, s.raw, 7.5, 4.5, s.seed, { rough: 0.8 }));
  limb(g, [P(L.deg(197), R - 12), [cx - 300, cy - 62], [cx - 236, cy - 30]], 10, 6, 'h3hangL');
  limb(g, [P(L.deg(-27), R - 12), [cx + 296, cy - 106], [cx + 244, cy - 74]], 10, 6, 'h3hangR');
  [[-1, -1, 0.1], [1, -1, -0.12], [1, 1, 0.11], [-1, 1, -0.1]].forEach(([sx, sy, off], i) => {
    const th = Math.atan2(sy, sx) + off, e = P(th, R - 14), s0 = [cx + sx * fr, cy + sy * fr];
    limb(g, [s0, [(s0[0] + e[0]) / 2 + rnd.range(-10, 10), (s0[1] + e[1]) / 2 + rnd.range(-10, 10)], e], 8, 10.5, 'h3tie' + i);
  });

  // 2 · the bough: trunk from the lower-left corner forks at 135° into two arms that bend round to meet at the upper right
  const arm = (dir, span, seed) => {
    const raw = [], w0 = 30, w1 = 8, th0 = L.deg(135);
    for (let k = 0; k <= 36; k++) {
      const u = k / 36, w = L.lerp(w0, w1, u), wig = k === 0 || k === 36 ? 0 : rnd.range(-2.6, 0.8);
      raw.push(P(th0 + dir * span * u, R - w / 2 - 1.5 + wig - (u > 0.9 ? (u - 0.9) * (dir > 0 ? 130 : 20) : 0)));
    }
    limb(g, raw, w0, w1, seed, { rough: 1.5 });
  };
  arm(1, L.deg(196), 'h3armA');
  arm(-1, L.deg(184), 'h3armB');
  const F = P(L.deg(135), R - 10);
  // pruned stubs give the hoop the knuckled silhouette of old plum wood
  for (let k = 0; k < 9; k++) {
    const th = L.deg(150 + k * 37 + rnd.range(-9, 9)), lean = rnd.sign() * rnd.range(0.03, 0.07);
    limb(g, [P(th, R - 9), P(th + lean, R + rnd.range(7, 14))], 8, 5, 'h3stub' + k, { rough: 0.6 });
  }
  // the trunk rises from the bottom edge and sweeps tangentially into the ring at the lower left
  limb(g, [[cx - 40, cy + 730], [cx - 62, cy + 610], [cx - 112, cy + 492], [cx - 172, cy + 384], [F[0] + 40, F[1] + 44], [F[0] + 4, F[1] + 5], [F[0] - 14, F[1] - 15]], 56, 30, 'h3trunk');
  limb(g, [[cx - 96, cy + 520], [cx - 150, cy + 560], [cx - 196, cy + 640], [cx - 214, cy + 720]], 15, 22, 'h3side');

  // 3 · the square frame: verticals first, horizontals laid over them, lashed at the corners with red cord
  limb(g, [[cx - fr + 0.6, cy - a - 30], [cx - fr - 0.8, cy - 30], [cx - fr + 0.7, cy + 52], [cx - fr, cy + a + 26]], 15.5, 16.5, 'h3fL', { rough: 0.5 });
  limb(g, [[cx + fr - 0.5, cy + a + 32], [cx + fr + 0.8, cy + 40], [cx + fr - 0.7, cy - 46], [cx + fr, cy - a - 24]], 16.5, 15.5, 'h3fR', { rough: 0.5 });
  limb(g, [[cx - a - 32, cy - fr + 0.5], [cx - 44, cy - fr - 0.8], [cx + 50, cy - fr + 0.7], [cx + a + 26, cy - fr]], 16.5, 15.5, 'h3fT', { rough: 0.5 });
  limb(g, [[cx + a + 30, cy + fr - 0.5], [cx + 36, cy + fr + 0.8], [cx - 52, cy + fr - 0.6], [cx - a - 24, cy + fr]], 16, 16.5, 'h3fB', { rough: 0.5 });
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx + sx * fr, y = cy + sy * fr;
    g.save(); g.translate(x, y); g.lineCap = 'round';
    for (const d of [1, -1]) for (let k = -1; k <= 1; k++) {
      g.save(); g.rotate(d * Math.PI / 4); g.translate(0, k * 3.6 + rnd.range(-0.5, 0.5));
      g.strokeStyle = '#5e130e'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-11.5, 0); g.lineTo(11.5, 0); g.stroke();
      g.strokeStyle = d > 0 ? '#bb3221' : '#a02719'; g.lineWidth = 2.1; g.beginPath(); g.moveTo(-11.5, 0); g.lineTo(11.5, 0); g.stroke();
      g.strokeStyle = 'rgba(245,160,130,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-8, -0.6); g.lineTo(3, -0.6); g.stroke();
      g.restore();
    }
    g.restore();
  }

  // 4 · moss dots on the old wood
  for (let k = 0; k < 30; k++) { const [x, y] = P(rnd() * TAU, R - rnd.range(3, 24)); moss(g, x, y, rnd); }
  for (let k = 0; k < 6; k++) { const t = rnd.range(0.15, 0.8); moss(g, L.lerp(F[0] + 40, cx - 100, t) + rnd.range(-14, 14), L.lerp(F[1] + 44, cy + 520, t) + rnd.range(-12, 12), rnd); }

  // 5 · coins on their cords (one strand behind, one through the hole in front)
  coins.forEach((c) => {
    cord(g, c.hx - 2, c.hy, c.x - 3, c.y, -5, rnd);
    K.stamp(g, c.spr, c.x, c.y, { rot: c.rot, shadow: { dx: 4, dy: 6, blur: 8, color: 'rgba(60,34,28,0.4)' } });
    cord(g, c.hx + 2, c.hy, c.x + 3, c.y - 1, 6, rnd);
    g.fillStyle = '#7a1911'; g.beginPath(); g.ellipse(c.hx, c.hy, 5.2, 4.2, 0.4, 0, TAU); g.fill();
    g.fillStyle = '#c23a26'; g.beginPath(); g.ellipse(c.hx - 0.8, c.hy - 0.9, 3.4, 2.6, 0.4, 0, TAU); g.fill();
  });

  // 6 · buds sitting on the ring (mostly on its inner side) and on the spurs, then the open blossoms
  for (let k = 0; k < 26; k++) {
    const th = rnd() * TAU, inner = rnd.chance(0.78), r = rnd.range(7.5, 12.5);
    const [x, y] = P(th, inner ? R - rnd.range(30, 40) : R + r * 0.55);
    if (coins.some((c) => Math.hypot(c.x - x, c.y - y) < c.R + r + 4) || spots.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r - 2)) continue;
    bud(g, x, y, r, inner ? th + Math.PI : th, rnd);
  }
  spurs.forEach((s) => {
    if (!rnd.chance(0.55)) return;
    const [p0, m] = s.raw, r = rnd.range(6.5, 10), ang = Math.atan2(m[1] - p0[1], m[0] - p0[0]) + rnd.sign() * 1.3;
    const x = m[0] + Math.cos(ang) * (r + 3), y = m[1] + Math.sin(ang) * (r + 3);
    if (!K.inCoin(x, y, r + 2) || coins.some((c) => Math.hypot(c.x - x, c.y - y) < c.R + r + 4) || spots.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r)) return;
    bud(g, x, y, r, ang, rnd);
  });
  spots.forEach((p, i) => {
    K.stamp(g, blossomSprite('h3bl' + i, p.r), p.x, p.y, { rot: p.spin, shadow: { dx: 2, dy: 3.5, blur: 5, color: 'rgba(70,32,26,0.34)' } });
  });

  // a little life on the trunk outside the ring: two spurs carrying a blossom and a bud each
  [[[cx - 156, cy + 446], [cx - 198, cy + 452], [cx - 238, cy + 478]], [[cx - 66, cy + 542], [cx - 34, cy + 520], [cx - 2, cy + 488]]].forEach((raw, i) => {
    limb(g, raw, 9, 5, 'h3out' + i, { rough: 0.8 });
    bud(g, raw[1][0] + (i ? 9 : -3), raw[1][1] + (i ? 13 : -13), 8.5, i ? 0.95 : -1.6, rnd);
    K.stamp(g, blossomSprite('h3outbl' + i, 33 + i * 3), raw[2][0], raw[2][1], { rot: rnd() * TAU, shadow: { dx: 2, dy: 3.5, blur: 5, color: 'rgba(70,32,26,0.34)' } });
  });

  // ink sits in the paper; a little rubbed wear
  K.soak(art, pap, 0.3); K.wear(art, { seed: 'h3wear', amount: 0.1, size: 1.3 });
  pg.drawImage(art, 0, 0);

  // drifting petals (animated in draw)
  const pr = L.rng('h3petals');
  const starts = [[cx - 46, cy - 70], [cx + 62, cy + 6], [cx - 428, cy - 318], [cx + 436, cy - 150], [cx + 318, cy + 372], [cx - 168, cy + 408]];
  petals = starts.map(([x, y], i) => {
    const r = pr.range(13, 17);
    const spr = K.sprite(44, 44, (q) => {
      q.fillStyle = L.radial(q, -r * 0.9, 0, 1, r * 2, [[0, '#a8281b'], [0.5, '#d04a31'], [1, '#eb977c']]);
      petalPath(q, r, i * 1.7); q.fill();
      q.save(); petalPath(q, r, i * 1.7); q.clip();
      q.strokeStyle = 'rgba(255,226,208,0.4)'; q.lineWidth = 2.6; petalPath(q, r * 0.97, i * 1.7); q.stroke();
      q.lineWidth = 0.7; q.strokeStyle = 'rgba(112,18,12,0.3)';
      for (let v = -2; v <= 2; v++) { q.beginPath(); q.moveTo(-r * 0.95, 0); q.lineTo(-r * 0.95 + Math.cos(v * 0.3) * r * 1.6, Math.sin(v * 0.3) * r * 1.6); q.stroke(); }
      q.restore();
      q.strokeStyle = 'rgba(98,18,13,0.85)'; q.lineWidth = 1.1; petalPath(q, r, i * 1.7); q.stroke();
    });
    return { spr, x, y, vx: pr.range(-0.7, 0.9), vy: pr.range(1.9, 2.9), r0: pr() * TAU, w: pr.range(-0.035, 0.035), ph: pr() * 6, sw: pr.range(0.1, 0.16) };
  });
  return pap;
}

export default {
  name: '梅枝铜钱',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 0.988, z1: 1.012, x0: 5, y0: -4, x1: -5, y1: 4 });
    const f = env.frame || 0;
    for (const q of petals) {
      const x = q.x + q.vx * f + Math.sin(f * q.sw + q.ph) * 5, y = q.y + q.vy * f;
      ctx.save();
      ctx.shadowColor = 'rgba(70,40,34,0.24)'; ctx.shadowBlur = 7; ctx.shadowOffsetX = 7; ctx.shadowOffsetY = 11;
      ctx.translate(x, y); ctx.rotate(q.r0 + q.w * f); ctx.scale(1, 0.62 + 0.3 * Math.abs(Math.sin(f * 0.11 + q.ph)));
      ctx.drawImage(q.spr, -q.spr.width / 2, -q.spr.height / 2);
      ctx.restore();
    }
  },
};
