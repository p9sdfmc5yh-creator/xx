// p02 — 钱背墨拓册页: a leaf from a collector's album of ink rubbings (coin reverses) on xuan paper, panned slowly to the right.
// Each rubbing: black outer rim (外郭) and inner rim (内郭) parted from the mottled field by thin white lines, a white square hole,
// a few with a crescent (月纹) or a star dot; vermilion collector's seals with unreadable seal-script-like strokes; soft fold creases.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const TAU = Math.PI * 2;
const LS = 1400;                                            // layer is larger than the frame: 160 px spare on every side
let layer = null;

// closed, slightly irregular circle: radius rad with a deviation of ±dev px
function ringPath(g, rad, dev, f1, f2, ph) {
  const n = 120;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * TAU, rr = rad + dev * (Math.sin(t * f1 + ph) * 0.6 + Math.sin(t * f2 + ph * 2.3) * 0.4);
    const x = Math.cos(t) * rr, y = Math.sin(t) * rr; k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}
function rrect(g, h, cr) {
  g.moveTo(-h + cr, -h); g.lineTo(h - cr, -h); g.quadraticCurveTo(h, -h, h, -h + cr); g.lineTo(h, h - cr); g.quadraticCurveTo(h, h, h - cr, h);
  g.lineTo(-h + cr, h); g.quadraticCurveTo(-h, h, -h, h - cr); g.lineTo(-h, -h + cr); g.quadraticCurveTo(-h, -h, -h + cr, -h); g.closePath();
}
function crescent(g, cx, cy, w, th, grow) {
  const b = w * 0.62;
  g.beginPath(); g.moveTo(cx - w - grow, cy + grow * 0.3);
  g.quadraticCurveTo(cx, cy - b * 2 - grow * 2.2, cx + w + grow, cy + grow * 0.3);
  g.quadraticCurveTo(cx, cy - (b - th) * 2 + grow * 2.2, cx - w - grow, cy + grow * 0.3); g.closePath();
}

// one ink rubbing of a coin reverse, as a black-on-transparent sprite (multiplied onto the paper later)
function buildRub(sp, seed, grain) {
  const { R, rimW, a, irW, line } = sp; const r = L.rng(seed);
  const pad = 34, W = Math.ceil((R + pad) * 2), ph = r() * TAU;
  return K.sprite(W, W, (g) => {
    g.save(); g.rotate(sp.rot);
    // grey smudges where the ink pad strayed past the edge of the coin
    g.filter = 'blur(5px)'; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const t0 = r() * TAU, lw = r.range(8, 20);
      g.strokeStyle = `rgba(0,0,0,${r.range(0.06, 0.16)})`; g.lineWidth = lw;
      g.beginPath(); g.arc(0, 0, R + lw * 0.2, t0, t0 + r.range(0.5, 1.7)); g.stroke();
    }
    g.filter = 'none';
    // field (地章): takes a little less ink than the raised rims
    g.fillStyle = `rgba(0,0,0,${sp.dens})`; g.beginPath(); ringPath(g, R - rimW - line, line * 0.55, 5, 11, ph); g.fill();
    g.restore();
    // ── the rubbing's texture: everything below removes ink ──
    g.globalCompositeOperation = 'destination-out';
    // broad light passes of the pad
    g.drawImage(L.noiseTex(W, W, { seed: seed + 'b', scale: 170, octaves: 3, contrast: 1.5, res: 0.25,
      ramp: [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${0.22 + sp.thin * 0.26})`]] }), -W / 2, -W / 2);
    // mottling: the dabbed ink broke up over the pitted bronze
    g.drawImage(L.noiseTex(W, W, { seed: seed + 'm', scale: 38, octaves: 4, contrast: 1.6, res: 0.5, warp: 0.25,
      ramp: [[0, 'rgba(0,0,0,0)'], [0.54, 'rgba(0,0,0,0)'], [0.76, `rgba(0,0,0,${0.2 + sp.thin * 0.2})`], [1, 'rgba(0,0,0,0.62)']] }), -W / 2, -W / 2);
    // corrosion pits and casting flaws in the field: small irregular white specks
    const pits = [];
    for (let i = 0; i < 46; i++) {
      const t = r() * TAU, d = r.range(a + irW + 8, R - 6), x = Math.cos(t) * d, y = Math.sin(t) * d, s = r.range(1.2, 4.2) * (r() < 0.15 ? 2 : 1);
      g.globalAlpha = r.range(0.45, 0.95);
      g.beginPath(); g.ellipse(x, y, s, s * r.range(0.45, 0.9), r() * 3, 0, TAU); g.fill(); pits.push([x, y, s]);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.save(); g.rotate(sp.rot);
    // outer rim (外郭)
    g.fillStyle = 'rgba(0,0,0,0.97)'; g.beginPath(); ringPath(g, R, 0.9, 2, 3, ph + 1); ringPath(g, R - rimW, line * 0.3, 3, 7, ph + 2); g.fill('evenodd');
    // inner rim (内郭) around the square hole: white line, black frame, white hole
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    g.beginPath(); rrect(g, a + irW + line * 1.05, 5); g.fill();
    g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(0,0,0,0.96)';
    g.beginPath(); rrect(g, a + irW, 3.5); rrect(g, a, 2); g.fill('evenodd');
    // ink that crept a little into the hole along two sides
    g.filter = 'blur(2px)'; g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-a + 3, a - 3); g.lineTo(a - 3, a - 3); g.lineTo(a - 3, -a + 10); g.stroke(); g.filter = 'none';
    // marks cast on the reverse: crescent (月纹) above the hole, star dot below
    const mid = (a + irW + R - rimW) / 2;
    if (sp.mark === 'moon' || sp.mark === 'both') {
      const w = R * 0.2, th = R * 0.055;
      g.globalCompositeOperation = 'destination-out'; crescent(g, 0, -mid + w * 0.45, w, th, line * 0.95); g.fill();
      g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(0,0,0,0.96)'; crescent(g, 0, -mid + w * 0.45, w, th, 0); g.fill();
    }
    if (sp.mark === 'star' || sp.mark === 'both') {
      const rr = R * 0.042;
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, mid, rr + line, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(0,0,0,0.96)'; g.beginPath(); g.arc(0, mid, rr, 0, TAU); g.fill();
    }
    g.restore();
    g.globalCompositeOperation = 'destination-out';
    // the raised rims took the ink almost solid: only a light break-up
    g.drawImage(L.noiseTex(W, W, { seed: seed + 'r', scale: 44, octaves: 3, contrast: 1.6, res: 0.5,
      ramp: [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.32)']] }), -W / 2, -W / 2);
    // paper tooth: pin-holes where the ink missed the hollows between fibres
    g.globalAlpha = 0.5; g.drawImage(grain, r.int(0, 160), r.int(0, 160), W, W, -W / 2, -W / 2, W, W);
    // loose fibres of the xuan paper that stayed white
    g.lineCap = 'round'; g.strokeStyle = '#000';
    for (let i = 0; i < 60; i++) {
      const x = r.range(-R, R), y = r.range(-R, R), len = r.range(7, 30), an = r() * TAU, bend = r.range(-0.7, 0.7);
      g.globalAlpha = r.range(0.2, 0.6); g.lineWidth = r.range(0.6, 1.25);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
    }
    // nicks along the outer edge
    for (let i = 0; i < 50; i++) {
      const t = r() * TAU, d = R + r.range(-1.5, 1.2);
      g.globalAlpha = r.range(0.4, 0.9); g.beginPath(); g.ellipse(Math.cos(t) * d, Math.sin(t) * d, r.range(0.8, 2.6), r.range(0.6, 1.5), t + 1.57, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // the ink itself: warm lamp-black, slightly uneven
    g.globalCompositeOperation = 'source-in';
    g.drawImage(L.noiseTex(W, W, { seed: seed + 'c', scale: 90, octaves: 3, res: 0.25, ramp: [[0, '#0d0b0a'], [0.6, '#1c1815'], [1, '#322b25']] }), -W / 2, -W / 2);
    g.globalCompositeOperation = 'source-over';
  });
}

// seal-script-like maze of straight strokes filling one cell — reads as a seal character, spells nothing
function mazeGlyph(g, x, y, w, h, lw, r) {
  g.lineWidth = lw; g.lineCap = 'butt'; g.lineJoin = 'miter';
  const n = Math.max(4, Math.min(7, Math.round(h / (lw * 2.0)))), xs = [x + lw / 2, x + w / 2, x + w - lw / 2];
  let pa = 0, pb = 2;
  for (let i = 0; i < n; i++) {
    const yy = y + lw / 2 + (i * (h - lw)) / (n - 1);
    let ca = r.int(0, 1), cb = r.int(ca + 1, 2); if (i === 0 || i === n - 1) { if (r() < 0.6) { ca = 0; cb = 2; } }
    g.beginPath(); g.moveTo(xs[ca] - lw / 2, yy); g.lineTo(xs[cb] + lw / 2, yy); g.stroke();
    if (i > 0) {
      const py = y + lw / 2 + ((i - 1) * (h - lw)) / (n - 1), lo = Math.max(ca, pa), hi = Math.min(cb, pb);
      const k = lo <= hi ? r.int(lo, hi) : r.int(0, 2);
      g.beginPath(); g.moveTo(xs[k], py - lw / 2); g.lineTo(xs[k], yy + lw / 2); g.stroke();
      if (r() < 0.45) { const k2 = (k + r.int(1, 2)) % 3; g.beginPath(); g.moveTo(xs[k2], py - lw / 2); g.lineTo(xs[k2], yy + lw / 2); g.stroke(); }
    }
    pa = ca; pb = cb;
  }
}
function roughRect(g, w, h, r, j) {
  const pts = []; const step = 9;
  for (let x = -w / 2; x < w / 2; x += step) pts.push([x, -h / 2]);
  for (let y = -h / 2; y < h / 2; y += step) pts.push([w / 2, y]);
  for (let x = w / 2; x > -w / 2; x -= step) pts.push([x, h / 2]);
  for (let y = h / 2; y > -h / 2; y -= step) pts.push([-w / 2, y]);
  g.beginPath(); pts.forEach(([x, y], i) => { const px = x + r.range(-j, j), py = y + r.range(-j, j); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath();
}
// a vermilion collector's seal. white = 白文 (red ground, strokes left as paper); otherwise 朱文 (red frame and strokes)
function buildSeal(w, h, seed, white, grain) {
  const r = L.rng(seed), pad = 12, CW = w + pad * 2, CH = h + pad * 2;
  return K.sprite(CW, CH, (g) => {
    g.fillStyle = '#b02c1c'; g.strokeStyle = '#b02c1c'; g.lineJoin = 'round';
    const fw = Math.max(3.4, w * 0.062);
    if (white) { roughRect(g, w, h, r, 0.9); g.fill(); g.globalCompositeOperation = 'destination-out'; }
    else { g.lineWidth = fw; roughRect(g, w - fw, h - fw, r, 0.7); g.stroke(); }
    const m = white ? w * 0.1 : fw + w * 0.085, cols = w >= 78 ? 2 : 1, cw = (w - 2 * m) / cols;
    const rows = Math.max(1, Math.round((h - 2 * m) / (cols === 1 ? cw * 0.62 : cw))), ch = (h - 2 * m) / rows;
    const lw = Math.max(2.5, Math.min(cw, ch * 1.6) * 0.08), gp = lw * 1.6;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) mazeGlyph(g, -w / 2 + m + i * cw + gp / 2, -h / 2 + m + j * ch + gp / 2, cw - gp, ch - gp, lw, r);
    // seal paste: uneven take-up, pin-holes, chipped edge
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(L.noiseTex(CW, CH, { seed: seed + 'm', scale: 22, octaves: 3, contrast: 1.7, res: 0.5,
      ramp: [[0, 'rgba(0,0,0,0)'], [0.52, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0.85)']] }), -CW / 2, -CH / 2);
    g.globalAlpha = 0.6; g.drawImage(grain, r.int(0, 300), r.int(0, 300), CW, CH, -CW / 2, -CH / 2, CW, CH); g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) {
      const side = r.int(0, 3), u = r.range(-0.5, 0.5), x = side < 2 ? u * w : (side === 2 ? -w / 2 : w / 2), y = side < 2 ? (side === 0 ? -h / 2 : h / 2) : u * h;
      g.globalAlpha = r.range(0.5, 1); g.beginPath(); g.ellipse(x, y, r.range(1, 3.4), r.range(0.8, 2.2), r() * 3, 0, TAU); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-in';
    g.drawImage(L.noiseTex(CW, CH, { seed: seed + 'c', scale: 40, octaves: 3, res: 0.5, ramp: [[0, '#9c2416'], [0.5, '#b7301e'], [1, '#cf4a31']] }), -CW / 2, -CH / 2);
    g.globalCompositeOperation = 'source-over';
  });
}

// a soft fold in the leaf: a valley line with a lit and a shaded flank
function crease(g, vertical, pos, r, strength) {
  g.save();
  if (!vertical) { g.translate(0, LS); g.rotate(-Math.PI / 2); g.translate(0, 0); }
  const x = vertical ? pos : LS - pos;
  g.fillStyle = L.linear(g, x - 34, 0, x + 34, 0, [[0, 'rgba(255,250,235,0)'], [0.4, `rgba(255,250,235,${0.1 * strength})`], [0.5, `rgba(90,66,34,${0.13 * strength})`], [0.62, `rgba(90,66,34,${0.05 * strength})`], [1, 'rgba(90,66,34,0)']]);
  g.fillRect(x - 34, 0, 68, LS);
  g.lineCap = 'round';
  let y = -10, xx = x;
  while (y < LS + 10) {
    const len = r.range(30, 120), nx = x + r.range(-1.3, 1.3);
    if (r() < 0.86) {
      g.strokeStyle = `rgba(84,62,34,${r.range(0.14, 0.34) * strength})`; g.lineWidth = r.range(0.8, 1.5);
      g.beginPath(); g.moveTo(xx + 0.7, y); g.lineTo(nx + 0.7, y + len); g.stroke();
      g.strokeStyle = `rgba(255,252,240,${r.range(0.25, 0.5) * strength})`; g.lineWidth = r.range(0.8, 1.4);
      g.beginPath(); g.moveTo(xx - 0.8, y); g.lineTo(nx - 0.8, y + len); g.stroke();
    }
    y += len; xx = nx;
  }
  g.restore();
}

function build() {
  const c = L.makeCanvas(LS, LS), g = c.getContext('2d'), r = L.rng('p02');
  // xuan paper leaf
  g.drawImage(K.paper({ size: LS, base: '#ece4d0', tone: '#8c6c40', seed: 'p02paper', fiber: 0.9, stain: 0.32, foxing: 0.3, edge: 0.1 }), 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {                                    // long bark fibres of the paper
    const x = r() * LS, y = r() * LS, len = r.range(18, 90), an = r() * TAU, bend = r.range(-0.8, 0.8);
    g.strokeStyle = r() < 0.55 ? `rgba(255,253,244,${r.range(0.12, 0.3)})` : `rgba(120,92,52,${r.range(0.05, 0.13)})`; g.lineWidth = r.range(0.6, 1.3);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  // shared paper-tooth tile (alpha = where ink is missing)
  const grain = L.noiseTex(640, 640, { seed: 'p02grain', scale: 3.3, octaves: 2, contrast: 2.3, res: 1, sx: 1.5, sy: 0.85,
    ramp: [[0, 'rgba(0,0,0,0)'], [0.56, 'rgba(0,0,0,0)'], [0.74, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,0.95)']] });

  // the rubbings: three rows, four columns, cropped by the frame
  const X = [44, 484, 922, 1362], Y = [258, 700, 1142];
  const marks = { '1,1': 'moon', '2,1': null, '2,0': 'star', '1,2': null, '0,1': 'both', '3,1': 'moon', '1,0': null, '2,2': 'moon' };
  const coins = [];
  Y.forEach((y, j) => X.forEach((x, i) => {
    const R = r.range(160, 182);
    coins.push({ x: x + r.range(-7, 7), y: y + r.range(-7, 7), R, rimW: R * r.range(0.105, 0.15), a: R * r.range(0.255, 0.285), irW: R * r.range(0.06, 0.082),
      line: r.range(2.8, 4.2), rot: r.range(-0.07, 0.07), dens: r.range(0.88, 0.97), thin: r(), mark: marks[i + ',' + j] || null, seed: 'p02c' + i + '_' + j });
  }));
  // faint damp halo the wet paper left around each coin
  for (const k of coins) {
    g.fillStyle = L.radial(g, k.x, k.y, k.R * 0.9, k.R * 1.22, [[0, 'rgba(120,100,70,0.10)'], [0.5, 'rgba(120,100,70,0.05)'], [1, 'rgba(120,100,70,0)']]);
    g.fillRect(k.x - k.R * 1.3, k.y - k.R * 1.3, k.R * 2.6, k.R * 2.6);
  }
  g.globalCompositeOperation = 'multiply';
  for (const k of coins) { const s = buildRub(k, k.seed, grain); g.drawImage(s, k.x - s.width / 2, k.y - s.height / 2); }
  g.globalCompositeOperation = 'source-over';

  // the paper kept the coins' relief when it dried: shade it, light from the top-left
  const hc = L.makeCanvas(LS, LS), q = hc.getContext('2d');
  q.fillStyle = '#5a5a5a'; q.fillRect(0, 0, LS, LS);
  for (const k of coins) {
    q.save(); q.translate(k.x, k.y); q.rotate(k.rot);
    q.fillStyle = '#d8d8d8'; q.beginPath(); q.arc(0, 0, k.R, 0, TAU); q.fill();
    q.fillStyle = '#9a9a9a'; q.beginPath(); q.arc(0, 0, k.R - k.rimW, 0, TAU); q.fill();
    q.fillStyle = '#d8d8d8'; q.beginPath(); rrect(q, k.a + k.irW, 3); q.fill();
    q.fillStyle = '#4a4a4a'; q.beginPath(); rrect(q, k.a, 2); q.fill();
    q.restore();
  }
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.55;
  g.drawImage(L.bumpLight(hc, { angle: 45, strength: 2.2, blur: 2.2, res: 0.5 }), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

  // fold creases
  crease(g, true, 1146, L.rng('p02f1'), 0.8);
  crease(g, false, 486, L.rng('p02f2'), 0.5);

  // collector's seals in the gaps between the rubbings
  const seals = [
    { x: 704, y: 924, w: 98, h: 98, white: true, rot: -0.03 },
    { x: 264, y: 470, w: 56, h: 106, white: false, rot: 0.035 },
    { x: 1108, y: 936, w: 50, h: 50, white: true, rot: 0.06 },
  ];
  seals.forEach((s, i) => {
    const sp = buildSeal(s.w, s.h, 'p02seal' + i, s.white, grain);
    g.save(); g.translate(s.x, s.y); g.rotate(s.rot);
    const rr = Math.max(s.w, s.h);                                   // oil of the seal paste soaking outwards
    g.fillStyle = L.radial(g, 0, 0, rr * 0.3, rr * 0.9, [[0, 'rgba(200,90,50,0.10)'], [1, 'rgba(200,90,50,0)']]); g.fillRect(-rr, -rr, rr * 2, rr * 2);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.93; g.drawImage(sp, -sp.width / 2, -sp.height / 2);
    g.restore();
  });
  return c;
}

export default {
  name: '钱背墨拓册页',
  init() { layer = build(); },
  draw(ctx, env, p) {
    // the camera travels slowly to the right: the leaf slides left
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.02, x0: 58, y0: 4, x1: -58, y1: -4 });
  },
};
