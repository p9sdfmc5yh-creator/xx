// s31 — 剪纸拼贴·药铺. A hand-made paper collage of an old apothecary, shot flat on a copy stand.
// Cream card above; the arc is the torn top edge of one big sheet of indigo paper (the white core shows along the tear).
// Glued on the blue sheet, big and naive: a brown medicine cabinet (rows and columns of small drawers, one punched
// brass dot per drawer), a pale-yellow moon, a vermilion bottle gourd, a mugwort-green leaf with slit veins,
// a white mortar and pestle, a small steelyard (戥子: bone beam with star dots, ONE brass pan on three threads at the
// short end, the lifting loop next to it, the weight out on the long arm), a paper herb packet tied with string,
// and a scrap of pencil hatching in the corner. No lettering anywhere.
//
// Every scrap is rendered as its own little canvas (silhouette mask → colour → fibre / cockle / crease → lit and
// shaded cut edge) and glued onto the base layer with a tight contact shadow. The soft drop shadows live on a second
// layer (each piece punches its own outline out of the shadows below it), so draw() can let them slip a pixel or two
// against the paper — the faint parallax of a collage on a copy stand.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 64;                       // the whole collage only turns ±0.18° about the arc's centre
const GW = W + PAD * 2, GH = H + PAD * 2;
let S = null;

const C = {
  card: '#f1eadb', blue: '#24509a', red: '#c8261c', moon: '#f2e27a', green: '#5f9a5a',
  wood: '#4c2114', woodDark: '#2f140b', drawer: '#a1582a', brass: '#e3a52c',
  white: '#f8f4ea', bone: '#f6eeda', wrap: '#f0e2bc', scrap: '#f2ede0', thread: '#f1e8d2',
};

// ───────────────────────── shared paper textures (grey, 128 = neutral) ─────────────────────────
function buildTextures() {
  // 1) grain tile: sugar-paper speckle at three sizes + short loose fibres (mostly pale, a few dark), wrapped so the tile repeats
  const TS = 1024, half = TS >> 1, quar = TS >> 2;
  const grain = L.makeCanvas(TS, TS), g = grain.getContext('2d');
  const r = L.rng('s31p-grain');
  const img = new ImageData(TS, TS), d = img.data;
  const coarse = new Float32Array(half * half), blot = new Float32Array(quar * quar);
  for (let i = 0; i < coarse.length; i++) coarse[i] = (r() - 0.5) * 30;
  for (let i = 0; i < blot.length; i++) blot[i] = (r() - 0.5) * 16;
  for (let y = 0, k = 0; y < TS; y++) for (let x = 0; x < TS; x++, k += 4) {
    const v = 128 + (r() - 0.5) * 30 + coarse[(y >> 1) * half + (x >> 1)] + blot[(y >> 2) * quar + (x >> 2)];
    d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = r() * TS, y = r() * TS, len = r.range(4, 18), a = r() * Math.PI, bend = r.range(-3, 3);
    g.strokeStyle = r.chance(0.62) ? `rgba(255,255,255,${r.range(0.08, 0.26).toFixed(3)})` : `rgba(0,0,0,${r.range(0.05, 0.16).toFixed(3)})`;
    g.lineWidth = r.range(0.5, 1.2);
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    const near = x < 24 || y < 24 || x > TS - 24 || y > TS - 24;
    for (const ox of near ? [-TS, 0, TS] : [0]) for (const oy of near ? [-TS, 0, TS] : [0]) {
      g.beginPath(); g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + ex * 0.5 - (ey / len) * bend, y + oy + ey * 0.5 + (ex / len) * bend, x + ox + ex, y + oy + ey);
      g.stroke();
    }
  }
  // 2) mottle: slow tonal clouds (the dye never takes evenly)
  const mot = L.noiseTex(1500, 1100, { seed: 's31p-mot', scale: 230, octaves: 3, res: 0.1, contrast: 1.35, ramp: [[0, '#5c5c5c'], [1, '#a4a4a4']] });
  // 3) cockle: the sheet buckles a little where the glue dried → soft relief lit from the upper left (stored at half size)
  const cock = L.bumpLight(L.noiseTex(750, 550, { seed: 's31p-cock', scale: 64, octaves: 3, gain: 0.45, res: 0.5 }), { angle: 45, strength: 3.2, res: 1 });
  return { grain, mot, cock, MW: 1500, MH: 1100 };
}

// ───────────────────────── geometry helpers ─────────────────────────
const xf = (pts, ox, oy, rot = 0, s = 1) => { const c = Math.cos(rot) * s, sn = Math.sin(rot) * s; return pts.map(([x, y]) => [ox + x * c - y * sn, oy + x * sn + y * c]); };
function dens(pts, step = 12) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < n; j++) out.push([L.lerp(a[0], b[0], j / n), L.lerp(a[1], b[1], j / n)]);
  }
  return out;
}
/** wander a closed outline along its normal: a slow drift of the scissors (amp, period) and, for torn edges, a ragged tear */
function wander(pts, seed, amp, period, torn = 0) {
  const n = pts.length, nz = L.makeNoise('s31p-w' + seed), len = [0];
  for (let i = 1; i <= n; i++) len.push(len[i - 1] + Math.hypot(pts[i % n][0] - pts[i - 1][0], pts[i % n][1] - pts[i - 1][1]));
  const total = len[n], out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const s = len[i], win = L.smooth(Math.min(s, total - s) / 40);
    let o = amp * nz.n2(s / period, 1.7) + amp * 0.3 * nz.n2(s / (period * 0.22), 8.3);
    if (torn) o += torn * (nz.n2(s / 14, 4.4) + 0.6 * nz.n2(s / 4.6, 6.1));
    out.push([pts[i][0] + nx * o * win, pts[i][1] + ny * o * win]);
  }
  return out;
}
/** straight-edged shapes (boxes, strips of card): keep the corners, let the edges drift a pixel or so */
const rough = (pts, seed, amp = 1.2, period = 90) => wander(dens(pts, 12), seed, amp, period);
const torn = (pts, seed, amp = 1.6, rag = 2.2) => wander(dens(pts, 3.5), seed, amp, 110, rag);
/** Douglas–Peucker on an open polyline */
function dp(pts, eps) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const ax = pts[i0][0], ay = pts[i0][1], dx = pts[i1][0] - ax, dy = pts[i1][1] - ay, len = Math.hypot(dx, dy) || 1;
    let md = 0, mi = -1;
    for (let i = i0 + 1; i < i1; i++) { const dd = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len; if (dd > md) { md = dd; mi = i; } }
    if (md > eps) { keep[mi] = 1; stack.push([i0, mi], [mi, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}
/**
 * Scissors never follow a curve: they take it in a run of short straight snips. Take a dense smooth outline, let it
 * drift a little (wob), then keep only as many corners as needed to stay within eps px of it → a faceted, hand-cut shape.
 */
function snip(pts, seed, eps = 3, wob = 1.5, period = 110) {
  const q = wander(pts, 'sn' + seed, wob, period), n = q.length;
  const st = Math.floor(L.rng('s31p-st' + seed)() * n);
  const rot = q.slice(st).concat(q.slice(0, st));
  let far = 1, fd = 0;
  for (let i = 1; i < n; i++) { const dd = Math.hypot(rot[i][0] - rot[0][0], rot[i][1] - rot[0][1]); if (dd > fd) { fd = dd; far = i; } }
  const A = dp(rot.slice(0, far + 1), eps), B = dp(rot.slice(far).concat([rot[0]]), eps);
  return A.slice(0, -1).concat(B.slice(0, -1));
}
const circle = (cx, cy, rx, ry = rx, n = 120) => { const o = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU; o.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); } return o; };
/** tapered strip along a (smoothed) centre line; wf(t) → full width */
function strip(ctrl, wf, step = 6) {
  const p = L.smoothPath(ctrl, step), n = p.length, A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const hw = wf(i / (n - 1)) / 2;
    A.push([p[i][0] + nx * hw, p[i][1] + ny * hw]); B.push([p[i][0] - nx * hw, p[i][1] - ny * hw]);
  }
  return A.concat(B.reverse());
}
/** a pointed leaf lobe from (bx,by), heading `ang` (0 = straight up, + = clockwise), `len` long and 2·hw wide */
function lobe(bx, by, ang, len, hw, n = 44) {
  const dx = Math.sin(ang), dy = -Math.cos(ang), nx = Math.cos(ang), ny = Math.sin(ang), A = [], B = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = hw * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.85);
    A.push([bx + dx * len * t + nx * w, by + dy * len * t + ny * w]);
    if (i > 0 && i < n) B.push([bx + dx * len * t - nx * w, by + dy * len * t - ny * w]);
  }
  return A.concat(B.reverse());
}
/** bottle gourd, stalk end up at (0,0): small upper belly r1, big lower belly r2 whose centre lies `gap` below the upper one */
function gourdOutline(r1, r2, gap, neck, n = 260) {
  const y1 = r1, y2 = r1 + gap, ht = y2 + r2, R = [], Lf = [];
  for (let i = 0; i <= n; i++) {
    const y = (ht * i) / n;
    const w1 = Math.sqrt(Math.max(0, r1 * r1 - (y - y1) * (y - y1))), w2 = Math.sqrt(Math.max(0, r2 * r2 - (y - y2) * (y - y2)));
    const wn = y > y1 && y < y2 ? neck : 0;
    const w = Math.pow(w1 ** 4 + w2 ** 4 + wn ** 4, 0.25);
    R.push([w, y]); if (i > 0 && i < n) Lf.push([-w, y]);
  }
  return R.concat(Lf.reverse());
}

// ───────────────────────── one piece of paper ─────────────────────────
const trace = (c, p) => { c.beginPath(); c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); c.closePath(); };
let pieceNo = 0;
/**
 * Glue a scrap onto the collage. K = { G (base ctx), SH (shadow ctx), T (textures) }.
 * o.polys: closed polygons in frame coords (their union is the scrap); o.holes: polygons cut out of it (slits).
 * o: color, tex (fibre), mot (tonal clouds), cock (buckling), curl (light falling across the scrap), edge (lit / shaded cut edge),
 *    lift (how far it stands off the sheet → soft shadow), sh (shadow strength), creases [[x, y, deg, strength]],
 *    peel [[x, y, r]] (a corner that has come unstuck), paint(k) (draw on the scrap, frame coords, before it is cut out)
 */
function piece(K, o) {
  const { G, SH, T } = K;
  const { polys, holes = [], color, tex = 0.5, mot = 0.2, cock = 0.22, curl = 1, edge = 1, lift = 1, sh = 1, creases = [], peel = [] } = o;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of polys) for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  x0 = Math.max(-PAD, Math.floor(x0) - 3); y0 = Math.max(-PAD, Math.floor(y0) - 3); x1 = Math.min(W + PAD, Math.ceil(x1) + 3); y1 = Math.min(H + PAD, Math.ceil(y1) + 3);
  const w = x1 - x0, h = y1 - y0; if (w < 2 || h < 2) return;
  const r = L.rng('s31p-pc' + (o.seed !== undefined ? o.seed : pieceNo++));
  // silhouette
  const M = L.makeCanvas(w, h), m = M.getContext('2d');
  m.translate(-x0, -y0); m.fillStyle = m.strokeStyle = '#000'; m.lineJoin = 'round'; m.lineWidth = 1.3;
  for (const p of polys) { trace(m, p); m.fill(); m.stroke(); }
  if (holes.length) { m.globalCompositeOperation = 'destination-out'; for (const p of holes) { trace(m, p); m.fill(); } }
  // the paper itself
  const c = L.makeCanvas(w, h), k = c.getContext('2d');
  k.fillStyle = color; k.fillRect(0, 0, w, h);
  const ox = r.range(0, Math.max(0, T.MW - w)), oy = r.range(0, Math.max(0, T.MH - h));
  const sw = Math.min(w, T.MW), shh = Math.min(h, T.MH);
  if (mot > 0) { k.globalCompositeOperation = 'soft-light'; k.globalAlpha = mot; k.drawImage(T.mot, ox, oy, sw, shh, 0, 0, w, h); }
  if (cock > 0) { k.globalCompositeOperation = 'soft-light'; k.globalAlpha = cock; k.drawImage(T.cock, ox / 2, oy / 2, sw / 2, shh / 2, 0, 0, w, h); }
  k.globalCompositeOperation = 'source-over'; k.globalAlpha = 1;
  if (curl > 0) {   // never perfectly flat: the light falls off across the scrap
    const pc = L.parseColor(color), lum = (0.299 * pc[0] + 0.587 * pc[1] + 0.114 * pc[2]) / 255;
    const ang = L.deg(50) + r.range(-0.5, 0.5), rad = Math.hypot(w, h) / 2, dx = Math.cos(ang) * rad, dy = Math.sin(ang) * rad;
    k.fillStyle = L.linear(k, w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy, [[0, `rgba(255,252,238,${(0.1 * curl * (0.35 + 0.65 * lum)).toFixed(3)})`], [0.45, 'rgba(255,252,238,0)'], [0.58, 'rgba(0,0,24,0)'], [1, `rgba(0,0,24,${(0.1 * curl).toFixed(3)})`]]);
    k.fillRect(0, 0, w, h);
  }
  for (const [cx, cy, dg, st = 1] of creases) {   // an old fold, pressed flat again: one flank catches the light, the other loses it
    k.save(); k.translate(cx - x0, cy - y0); k.rotate(L.deg(dg));
    const far = 1400;
    k.fillStyle = L.linear(k, 0, -26, 0, 0, [[0, 'rgba(255,255,246,0)'], [1, `rgba(255,255,246,${(0.075 * st).toFixed(3)})`]]); k.fillRect(-far, -26, far * 2, 26);
    k.fillStyle = L.linear(k, 0, 0, 0, 30, [[0, `rgba(0,0,26,${(0.1 * st).toFixed(3)})`], [1, 'rgba(0,0,26,0)']]); k.fillRect(-far, 0, far * 2, 30);
    k.fillStyle = `rgba(255,255,246,${(0.07 * st).toFixed(3)})`; k.fillRect(-far, -1, far * 2, 1.2);
    k.restore();
  }
  if (tex > 0) {
    k.save(); k.globalCompositeOperation = 'hard-light'; k.globalAlpha = tex;
    k.translate(-r.int(0, 1023), -r.int(0, 1023)); k.fillStyle = k.createPattern(T.grain, 'repeat'); k.fillRect(0, 0, w + 1024, h + 1024);
    k.restore();
  }
  if (o.paint) { k.save(); k.translate(-x0, -y0); o.paint(k); k.restore(); }
  for (const [px, py, pr] of peel) {   // the lifted corner turns toward the light
    k.fillStyle = L.radial(k, px - x0, py - y0, 0, pr, [[0, 'rgba(255,255,246,0.2)'], [0.6, 'rgba(255,255,246,0.07)'], [1, 'rgba(255,255,246,0)']]);
    k.fillRect(0, 0, w, h);
  }
  k.globalCompositeOperation = 'destination-in'; k.drawImage(M, 0, 0);
  if (edge > 0) {   // thickness of the paper: the cut edge is lit on the upper left, shaded on the lower right
    const t = L.makeCanvas(w, h), tc = t.getContext('2d');
    const rim = (dx, dy, style) => {
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, w, h); tc.drawImage(M, 0, 0);
      tc.globalCompositeOperation = 'destination-out'; tc.drawImage(M, dx, dy);
      tc.globalCompositeOperation = 'source-in'; tc.fillStyle = style; tc.fillRect(0, 0, w, h);
      k.globalCompositeOperation = 'source-atop'; k.drawImage(t, 0, 0);
    };
    rim(1.0, 1.4, `rgba(255,255,248,${(0.26 * edge).toFixed(3)})`);
    rim(-1.0, -1.4, `rgba(0,0,22,${(0.18 * edge).toFixed(3)})`);
  }
  // glue it down: tight contact shadow on the base …
  G.save();
  G.shadowColor = `rgba(5,8,30,${(0.46 * sh).toFixed(3)})`; G.shadowBlur = 2.6; G.shadowOffsetX = 1.0; G.shadowOffsetY = 1.8;
  G.drawImage(c, x0, y0);
  G.restore();
  // … and the soft shadow of the lifted sheet on the shadow layer (drawn alone: the silhouette itself sits far off-canvas)
  const FAR = 6000;
  SH.save();
  SH.shadowColor = `rgba(5,8,30,${(0.25 * sh).toFixed(3)})`; SH.shadowBlur = 11 * lift + 2; SH.shadowOffsetX = FAR + 3.6 * lift; SH.shadowOffsetY = 6.2 * lift;
  SH.drawImage(M, x0 - FAR, y0);
  for (const [px, py, pr] of peel) {
    const t = L.makeCanvas(w, h), tc = t.getContext('2d');
    tc.drawImage(M, 0, 0); tc.globalCompositeOperation = 'destination-in';
    tc.fillStyle = L.radial(tc, px - x0, py - y0, 0, pr, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]); tc.fillRect(0, 0, w, h);
    SH.shadowColor = 'rgba(5,8,30,0.34)'; SH.shadowBlur = 12; SH.shadowOffsetX = FAR + 8; SH.shadowOffsetY = 13;
    SH.drawImage(t, x0 - FAR, y0);
  }
  SH.restore();
  SH.save(); SH.globalCompositeOperation = 'destination-out'; SH.drawImage(M, x0, y0); SH.restore();
}

/** a length of cotton thread laid on the sheet */
function thread(K, pts, width = 2.2, color = C.thread) {
  const { G } = K, p = L.smoothPath(pts, 5);
  G.save(); G.lineCap = 'round'; G.lineJoin = 'round';
  G.shadowColor = 'rgba(5,8,30,0.55)'; G.shadowBlur = 2.5; G.shadowOffsetX = 1.2; G.shadowOffsetY = 1.8;
  G.strokeStyle = color; G.lineWidth = width;
  G.beginPath(); p.forEach((q, i) => (i ? G.lineTo(q[0], q[1]) : G.moveTo(q[0], q[1]))); G.stroke();
  G.shadowColor = 'transparent';
  // the twist of the yarn
  G.strokeStyle = 'rgba(120,100,70,0.5)'; G.lineWidth = 0.8;
  for (let i = 1; i < p.length - 1; i += 1) { const a = p[i - 1], b = p[i + 1]; const tx = b[0] - a[0], ty = b[1] - a[1], m = Math.hypot(tx, ty) || 1; G.beginPath(); G.moveTo(p[i][0] - (ty / m) * width * 0.45 - (tx / m) * 1, p[i][1] + (tx / m) * width * 0.45 - (ty / m) * 1); G.lineTo(p[i][0] + (ty / m) * width * 0.45 + (tx / m) * 1, p[i][1] - (tx / m) * width * 0.45 + (ty / m) * 1); G.stroke(); }
  G.restore();
}

// ───────────────────────── the card and the big blue sheet ─────────────────────────
function buildCard(G, T) {
  G.fillStyle = C.card; G.fillRect(-PAD, -PAD, GW, GH);
  G.save();
  G.globalCompositeOperation = 'soft-light'; G.globalAlpha = 0.16; G.drawImage(T.mot, -PAD, -PAD, GW, GH);
  G.globalCompositeOperation = 'hard-light'; G.globalAlpha = 0.26;
  G.translate(-PAD - 300, -PAD - 170); G.fillStyle = G.createPattern(T.grain, 'repeat'); G.fillRect(0, 0, GW + 400, GH + 400);
  G.restore();
}

function buildSheet(K, a) {
  const { G, T } = K;
  const nz = L.makeNoise('s31p-tear');
  const s = a.span(PAD + 150), n = Math.ceil((2 * s * a.R) / 2);
  const eB = [], eW = [], prof = [];
  for (let i = 0; i <= n; i++) {
    const th = L.lerp(-s, s, i / n), al = th * a.R;
    const bite = Math.pow(Math.max(0, nz.n2(al / 150, 4.2) - 0.22) / 0.78, 1.25) * 8.5;     // stretches where the blue skin peeled back further
    const drB = Math.max(-9, 0.9 + 2.0 * nz.fbm(al / 55, 1.3, 3) + 1.1 * nz.n2(al / 7, 7.7) - bite);
    const core = 0.5 + 4.4 * L.smooth(0.5 + 0.95 * nz.n2(al / 64, 12.1)) + bite * 0.85;      // how much white core is laid bare
    const drW = Math.min(7.5, drB + core + 0.9 * nz.n2(al / 4.3, 3.3));
    const pb = a.pt(th, drB), pw = a.pt(th, drW);
    eB.push([pb.x, pb.y]); eW.push([pw.x, pw.y]); prof.push([th, drB, drW]);
  }
  const bot = H + PAD + 40;
  const sheet = (e) => { G.beginPath(); G.moveTo(e[0][0], e[0][1]); for (let i = 1; i < e.length; i++) G.lineTo(e[i][0], e[i][1]); G.lineTo(e[e.length - 1][0], bot); G.lineTo(e[0][0], bot); G.closePath(); };
  const line = (e) => { G.beginPath(); G.moveTo(e[0][0], e[0][1]); for (let i = 1; i < e.length; i++) G.lineTo(e[i][0], e[i][1]); };
  // the sheet barely stands off the card: a hair of occlusion along the tear
  G.save(); G.filter = 'blur(2px)'; G.strokeStyle = 'rgba(72,54,28,0.26)'; G.lineWidth = 3; line(eW); G.stroke(); G.restore();
  G.save(); G.filter = 'blur(7px)'; G.strokeStyle = 'rgba(72,54,28,0.09)'; G.lineWidth = 12; line(eW); G.stroke(); G.restore();
  // white core
  G.fillStyle = '#fcfbf6'; sheet(eW); G.fill();
  G.save(); sheet(eW); G.clip();
  G.globalCompositeOperation = 'hard-light'; G.globalAlpha = 0.5;
  G.translate(-PAD - 77, -PAD - 31); G.fillStyle = G.createPattern(T.grain, 'repeat'); G.fillRect(0, 0, GW + 200, GH + 200);
  G.restore();
  // blue skin
  G.fillStyle = C.blue; sheet(eB); G.fill();
  G.save(); sheet(eB); G.clip();
  G.drawImage(L.noiseTex(GW, GH, { seed: 's31p-hue', scale: 460, octaves: 3, res: 0.08, contrast: 1.4, ramp: [[0, 'rgba(24,54,150,0.32)'], [0.5, 'rgba(36,80,154,0)'], [1, 'rgba(50,112,190,0.26)']] }), -PAD, -PAD);
  G.globalCompositeOperation = 'soft-light'; G.globalAlpha = 0.3;
  G.drawImage(T.cock, -PAD, -PAD, 1500, 1100); G.drawImage(T.cock, -PAD + 1500, -PAD, -1500 + GW + 900, 1100); G.drawImage(T.cock, -PAD, -PAD + 1100, GW, 300);
  G.globalCompositeOperation = 'source-over'; G.globalAlpha = 1;
  // old folds in the big sheet
  for (const [cx, cy, dg, st] of [[1010, 880, -72, 0.6], [1640, 860, 78, 0.5]]) {
    G.save(); G.translate(cx, cy); G.rotate(L.deg(dg));
    G.fillStyle = L.linear(G, 0, -18, 0, 0, [[0, 'rgba(210,228,255,0)'], [1, `rgba(210,228,255,${(0.11 * st).toFixed(3)})`]]); G.fillRect(-1600, -18, 3200, 18);
    G.fillStyle = L.linear(G, 0, 0, 0, 22, [[0, `rgba(0,4,40,${(0.2 * st).toFixed(3)})`], [1, 'rgba(0,4,40,0)']]); G.fillRect(-1600, 0, 3200, 22);
    G.fillStyle = `rgba(214,230,255,${(0.2 * st).toFixed(3)})`; G.fillRect(-1600, -1, 3200, 1.3);
    G.restore();
  }
  G.save(); G.globalCompositeOperation = 'hard-light'; G.globalAlpha = 0.56;
  G.translate(-PAD - 411, -PAD - 203); G.fillStyle = G.createPattern(T.grain, 'repeat'); G.fillRect(0, 0, GW + 500, GH + 300);
  G.restore();
  // the skin is stressed pale right at the tear
  G.filter = 'blur(1.6px)'; G.strokeStyle = 'rgba(214,228,255,0.22)'; G.lineWidth = 5; G.translate(0, 2.5); line(eB); G.stroke();
  G.restore();
  // fuzz: white fibres standing off the core, blue shreds straying onto it
  const rf = L.rng('s31p-fuzz'); G.save(); G.lineCap = 'round';
  for (let i = 0; i < 5600; i++) {
    const [th, drB, drW] = prof[rf.int(0, n)];
    const blue = rf.chance(0.4);
    const p = a.pt(th, blue ? drB + rf.range(-0.5, 2.2) : drW + rf.range(-1.4, 0.5));
    const dir = th - Math.PI / 2 + rf.gauss() * 0.9, len = blue ? rf.range(0.8, 3.2) : rf.range(1.2, 5.5);
    G.strokeStyle = blue ? L.rgba(rf.chance(0.5) ? '#2b5aa6' : '#3c69b0', rf.range(0.45, 0.95)) : L.rgba('#fffefa', rf.range(0.3, 0.85));
    G.lineWidth = rf.range(0.5, 1.1);
    G.beginPath(); G.moveTo(p.x, p.y); G.lineTo(p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len); G.stroke();
  }
  G.restore();
}

// ───────────────────────── the collage ─────────────────────────
function buildCollage(env) {
  const a = env.arc, T = buildTextures();
  const Y0S = Math.floor(a.crestY - 40);
  const base = L.makeLayer(PAD), G = base.getContext('2d');
  const shadow = L.makeCanvas(GW, H + PAD - Y0S), SH = shadow.getContext('2d');
  SH.translate(PAD, -Y0S);
  const K = { G, SH, T };
  pieceNo = 0;
  buildCard(G, T);
  buildSheet(K, a);

  // ── herb packet: a square of wrapping paper folded shut and tied crosswise with red string (the steelyard hangs over it) ──
  {
    const ox = 190, oy = 1014, rt = -0.14, q = (pts) => xf(pts, ox, oy, rt);
    piece(K, { polys: [rough(q([[-112, -110], [111, -113], [114, 112], [-110, 114]]), 'pk', 1.6)], color: C.wrap, tex: 0.4, peel: [[ox + 96, oy - 124, 90]] });
    piece(K, { polys: [rough(q([[-110, -108], [109, -111], [4, 8]]), 'pkf', 1.1)], color: L.shade(C.wrap, 0.3), tex: 0.4, lift: 0.45, sh: 0.9 });
    piece(K, { polys: [rough(q(strip([[-118, 10], [0, 3], [118, 5]], () => 11)), 'pks1', 0.6, 50)], color: C.red, lift: 0.3, cock: 0, curl: 0 });
    piece(K, { polys: [rough(q(strip([[-4, -118], [1, 0], [5, 118]], () => 11)), 'pks2', 0.6, 50)], color: C.red, lift: 0.3, cock: 0, curl: 0 });
    piece(K, { polys: [snip(q(lobe(0, 3, -1.0, 68, 20)), 'pkb1', 1.3, 0.5), snip(q(lobe(0, 3, 0.85, 62, 19)), 'pkb2', 1.3, 0.5), snip(q(circle(0, 3, 12)), 'pkk', 1.2, 0.5)], color: C.red, lift: 0.45, cock: 0 });
  }

  // ── the moon, coming up behind the cabinet ──
  piece(K, { polys: [snip(circle(975, 704, 118), 'moon', 5.0, 3.6, 140)], color: C.moon, tex: 0.42, lift: 1.0, creases: [[960, 730, 24, 0.5]] });

  // ── mugwort leaf: a spine with five fat pointed lobes, the veins cut out as slits so the blue shows through ──
  {
    const ox = 1575, oy = 1162, rt = -0.17, q = (pts) => xf(pts, ox, oy, rt);
    const lobes = [[-112, -1.0, 240, 64], [-106, 1.05, 222, 62], [-240, -0.74, 226, 62], [-246, 0.7, 214, 60], [-310, 0.02, 215, 66]];
    const polys = [rough(q(strip([[0, 40], [2, -165], [0, -345]], (t) => L.lerp(60, 32, t))).filter((_, i) => i % 3 === 0), 'lfs', 1.2, 80)];
    const holes = [q(strip([[0, 20], [2, -205], [1, -455]], (t) => L.lerp(11, 3, t)))];
    lobes.forEach(([by, ang, len, hw], i) => {
      polys.push(snip(q(lobe(0, by, ang, len, hw)), 'lf' + i, 2.8, 1.9, 80));
      if (i < 4) { const dx = Math.sin(ang), dy = -Math.cos(ang); holes.push(q(strip([[dx * 34, by + dy * 34], [dx * len * 0.36, by + dy * len * 0.36 - 4], [dx * len * 0.64, by + dy * len * 0.64]], (t) => L.lerp(8.5, 2.2, t)))); }
    });
    piece(K, { polys, holes, color: C.green, lift: 1.1, creases: [[1482, 868, -27, 1], [1556, 958, 62, 0.8]], peel: [[1337, 958, 85], [1491, 648, 70]] });
  }

  // ── a scrap of drawing paper with pencil hatching, tucked into the corner; the pencil ran off it onto the blue sheet ──
  {
    const poly = torn([[1786, 770], [1930, 790], [2010, 800], [2010, 1170], [1776, 1170]], 'scrap', 1.6, 1.8);
    const x0 = 1700, y0 = 716, w = 320, h = 464;
    const cv = L.makeCanvas(w, h), c = cv.getContext('2d'); c.translate(-x0, -y0);
    const rh = L.rng('s31p-hatch');
    const scribble = (ya, yb, xl, xr, gap, wd, al, sd) => {
      const pts = []; let y = ya;
      while (y < yb) { pts.push([xl + rh.range(-12, 16), y + rh.range(-4, 4)], [xr + rh.range(-16, 8), y - 38 + rh.range(-8, 8)]); y += gap * rh.range(0.7, 1.35); }
      L.sketchLine(c, pts, { width: wd, color: '#2c2c34', seed: sd, wobble: 1.6, passes: 2, alpha: al });
    };
    scribble(812, 1120, 1772, 1932, 20, 4.2, 0.9, 3);
    scribble(838, 1110, 1800, 1926, 31, 3.2, 0.75, 5);
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out';
    c.drawImage(L.noiseTex(w, h, { seed: 's31p-graphite', scale: 1.7, octaves: 2, res: 1, contrast: 2.0, ramp: [[0, 'rgba(0,0,0,0.8)'], [0.4, 'rgba(0,0,0,0.22)'], [0.7, 'rgba(0,0,0,0)']] }), 0, 0);
    G.save(); G.globalCompositeOperation = 'multiply'; G.globalAlpha = 0.62; G.drawImage(cv, x0, y0); G.restore();
    piece(K, { polys: [poly], color: C.scrap, tex: 0.36, peel: [[1788, 774, 80]], paint: (k) => { k.globalCompositeOperation = 'multiply'; k.globalAlpha = 0.94; k.drawImage(cv, x0, y0); } });
  }

  // ── 百子柜: the medicine cabinet. A dark sheet for the carcass, a strip for the cornice, one glued square per drawer ──
  {
    const ox = 312, oy = 700, rt = -0.058, q = (pts) => xf(pts, ox, oy, rt);
    const rc = L.rng('s31p-cab');
    piece(K, { polys: [rough(q([[0, 0], [600, 2], [604, 560], [-3, 560]]), 'cab', 1.8, 130)], color: C.wood, lift: 1.1, creases: [[640, 900, 81, 0.7]] });
    piece(K, { polys: [rough(q([[-18, -12], [618, -15], [621, 30], [-16, 34]]), 'corn', 1.4, 110)], color: C.woodDark, lift: 0.5, peel: [[930, 668, 76]] });
    const cols = 4, pw = 138, ph = 114, fw = 118, fh = 95;
    for (let row = 0; row < 4; row++) for (let col = 0; col < cols; col++) {
      const cx = 34 + pw * col + fw / 2 + rc.range(-3.5, 3.5), cy = 53 + ph * row + fh / 2 + rc.range(-3.5, 3.5), tw = rc.range(-0.035, 0.035);
      const jw = fw / 2 + rc.range(-3.5, 3.5), jh = fh / 2 + rc.range(-3.5, 3.5);
      const face = xf([[-jw, -jh], [jw, -jh + rc.range(-3, 3)], [jw + rc.range(-3, 3), jh], [-jw + rc.range(-3, 3), jh + rc.range(-3, 3)]], cx, cy, tw);
      const tone = rc.range(-0.1, 0.1), warm = rc.chance(0.22);
      piece(K, { polys: [rough(q(face), 'dr' + row + col, 1.0, 70)], color: L.shade(warm ? '#b55a2c' : C.drawer, tone), lift: 0.4, sh: 0.9 });
      // one punched brass dot per drawer: the pull
      const kx = cx + rc.range(-4, 4), ky = cy - 4 + rc.range(-4, 4);
      piece(K, { polys: [q(circle(kx, ky, 15, 15, 36))], color: L.shade(C.brass, rc.range(-0.05, 0.12)), lift: 0.3, sh: 0.9, cock: 0, curl: 0.6 });
    }
  }

  // ── 戥子: a small steelyard. ONE pan on three threads at the short end, the lifting loop next to it, the weight out on the long arm ──
  {
    const P0 = [30, 842], P1 = [470, 700];
    const at = (t, off = 0) => [L.lerp(P0[0], P1[0], t), L.lerp(P0[1], P1[1], t) + off];
    const pan = xf(snip(dens((() => { const o = [[-84, 0], [-36, 5], [36, 6], [84, 1]]; for (let i = 0; i <= 24; i++) { const x = 84 - (168 * i) / 24; o.push([x, 2 + 52 * Math.pow(Math.max(0, 1 - (x / 84) * (x / 84)), 0.75)]); } return o; })(), 4), 'pan', 1.8, 0.9), 48, 962, 0.03);
    thread(K, [at(0, 2), [8, 900], [-33, 966]], 3.2); thread(K, [at(0, 2), [42, 902], [48, 969]], 3.2); thread(K, [at(0, 2), [80, 898], [128, 966]], 3.2);
    const Q = at(0.5);
    thread(K, [[Q[0], Q[1] - 6], [Q[0] + 1, Q[1] + 30], [Q[0], Q[1] + 62]], 3.2);
    piece(K, { polys: [pan], color: C.brass, lift: 0.7 });
    piece(K, { polys: [xf(snip(dens([[-8, 0], [8, 0], [12, 16], [31, 80], [35, 97], [23, 108], [-23, 108], [-35, 97], [-31, 80], [-12, 16]], 3), 'wt', 1.5, 0.7), Q[0], Q[1] + 56, 0.04)], color: C.brass, lift: 0.6 });
    // the beam: a tapered sliver of bone-white card, its star dots (星) pricked along the long arm
    const beam = strip([at(-0.03), at(0.5, 1.0), at(1.02)], (t) => L.lerp(23, 12, t));
    piece(K, {
      polys: [rough(beam.filter((_, i) => i % 4 === 0), 'beam', 0.6, 60)], color: C.bone, tex: 0.3, lift: 0.6, cock: 0.1,
      paint: (k) => { k.fillStyle = 'rgba(58,40,24,0.85)'; for (let i = 0; i < 9; i++) { const p = at(0.3 + i * 0.074, 0.4); k.beginPath(); k.arc(p[0], p[1] - 0.6, i % 4 === 0 ? 3.4 : 2.4, 0, TAU); k.fill(); } },
    });
    // the lifting loop (提纽) sits close to the pan end
    const U = at(0.2);
    thread(K, [[U[0] - 5, U[1] + 8], [U[0] - 14, U[1] - 32], [U[0] + 4, U[1] - 56], [U[0] + 16, U[1] - 32], [U[0] + 5, U[1] + 6]], 3.2);
  }

  // ── 葫芦: bottle gourd — small belly above, big belly below, pinched waist with a cord, a stub of vine on top ──
  {
    const ox = 1150, oy = 650, rt = -0.1, q = (pts) => xf(pts, ox, oy, rt);
    piece(K, { polys: [rough(q(strip([[2, 16], [-4, -20], [-1, -40], [17, -52]], (t) => L.lerp(21, 11, t), 5)).filter((_, i) => i % 2 === 0), 'stem', 0.5, 40)], color: '#3a2212', lift: 0.5, cock: 0 });
    piece(K, { polys: [snip(q(gourdOutline(84, 162, 240, 34)), 'gourd', 3.4, 2.6, 140)], color: C.red, lift: 1.2, creases: [[1178, 948, -34, 0.9], [1150, 760, 58, 0.5]], peel: [[1330, 1010, 110]] });
    piece(K, { polys: [rough(q(strip([[-52, 160], [0, 174], [52, 158]], () => 15)), 'cord', 0.6, 40)], color: C.moon, lift: 0.3, cock: 0, curl: 0.5 });
    piece(K, { polys: [rough(q(strip([[11, 170], [31, 208], [28, 256]], (t) => L.lerp(12.5, 7, t))), 'tail1', 0.4, 40), rough(q(strip([[11, 170], [5, 214], [-16, 242]], (t) => L.lerp(12.5, 7, t))), 'tail2', 0.4, 40), snip(q(circle(11, 169, 12.5)), 'knot', 1.2, 0.5)], color: C.moon, lift: 0.4, cock: 0, curl: 0.5 });
  }

  // ── 研钵与杵: the pestle goes down behind the rim of a thick white bowl ──
  {
    piece(K, { polys: [rough(strip([[1752, 1000], [1722, 870], [1694, 748]], (t) => L.lerp(46, 37, t), 8), 'pestle', 0.8, 70), snip(circle(1693, 744, 33), 'pknob', 1.7, 0.8)], color: '#fcf9f0', tex: 0.3, lift: 0.9 });
    const side = L.smoothPath([[137, 31], [132, 64], [113, 110], [86, 141], [70, 152]], 4);
    const outline = [[-150, 3], [-60, 7], [40, 6], [150, -2], [148, 23], ...side, [80, 160], [86, 190], [-86, 192], [-80, 161], ...side.map(([x, y]) => [-x, y + 1]).reverse(), [-148, 25]];
    piece(K, { polys: [xf(snip(dens(outline, 4), 'bowl', 1.8, 1.0, 100), 1768, 912, 0.012, 1.42)], color: C.white, tex: 0.3, lift: 1.2, peel: [[1557, 916, 80]] });
  }

  // ── one light over the whole collage: warm from the upper left, falling away to the lower right ──
  G.save();
  G.globalCompositeOperation = 'overlay';
  G.fillStyle = L.radial(G, 420, 360, 100, 1500, [[0, 'rgba(255,246,224,0.12)'], [1, 'rgba(255,246,224,0)']]);
  G.fillRect(-PAD, -PAD, GW, GH);
  G.globalCompositeOperation = 'multiply';
  G.fillStyle = L.radial(G, 420, 360, 900, 2200, [[0, 'rgb(255,255,255)'], [1, 'rgb(230,230,240)']]);
  G.fillRect(-PAD, -PAD, GW, GH);
  G.restore();
  return { base, shadow, Y0S };
}

export default {
  name: '剪纸拼贴·药铺',
  tone: 'dark',
  init(env) {
    S = buildCollage(env);
  },
  draw(ctx, env, p) {
    // 6 frames on the copy stand: the collage slips a few pixels round the arc's centre, and because the scraps stand
    // a hair off the sheet their shadows slip a pixel or two more.
    const a = env.arc;
    const rot = L.lerp(-0.0032, 0.0032, p), zoom = L.lerp(1.0, 1.006, p);
    L.blit(ctx, env, S.base, { rot, zoom });
    const sx = L.lerp(-1.0, 1.2, p), sy = L.lerp(-0.7, 0.9, p);
    ctx.save();
    ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.shadow, -PAD + sx, S.Y0S + sy);
    ctx.restore();
  },
};
