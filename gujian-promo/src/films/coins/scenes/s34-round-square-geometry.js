// s34 — 天圆地方几何图. A ruler-and-compass study of a round coin with a square hole, inked on white drawing paper
// and photographed close under a raking lamp.
// The shared arc is the coin's OUTER CIRCLE: one even ink line, shadowed on its outside by a pale yellow-green pencil
// draft. Inside it: the vertical axis through the crest; the two edges of the inscribed square that leave the crest
// at 45° (vermilion — the "人" of the picture); staggered chords parallel to them and a few steeper ones in ink,
// dense in the rim band and sparse below it; two parallel azurite lines on the right; a concentric arc (the inner
// edge of the raised outer rim) and, at the bottom of frame, the top edge and two top corners of the square hole
// wrapped by the double line of its inner rim.
// NOTE: schematic, not to scale — at this magnification a truly concentric hole would lie far below the frame, so
// the hole is drawn up close under the rim; the inscribed square and the chords are a geometric study, not a
// minting rule. No figures, no lettering anywhere.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;
const FW = W + PAD * 2, FH = H + PAD * 2;
const RIM = -222;        // concentric arc: inner edge of the outer rim (外郭内沿)
const HOLE_D = 432;      // depth of the square hole's (穿) top edge below the crest, as drawn
const HOLE_W = 540;      // its half-width: wider than the red edges at that depth, so they cross the top edge instead of capping it like a roof
const NEI = 34;          // width of the inner rim (内郭) around the hole
// task-card palette: 纸白 #f5f3ec / 墨 #17171a / 朱红 #e03a3a / 石青 #2a8fd0 / 铅笔黄绿 #b9c26a. The marks are multiplied onto the paper
// and bitten by its tooth, so their source colours are set a touch purer to land on those values.
const C = { paper: '#fbfaf5', ink: '#17171a', graphite: '#3c3c44', red: '#ec3a35', redDeep: '#b8121c', blue: '#2f9ce4', blueDeep: '#0f62a8', pencil: '#c5d44c' };
let S = null;

const full = (g) => g.fillRect(-PAD, -PAD, FW, FH);

// ───────────────────────── geometry ─────────────────────────
/** walk back from P against the unit direction u until the circle of radius R+dr → the line's upper end */
function hitUp(a, px, py, ux, uy, dr = 0) {
  const ox = px - a.cx, oy = py - a.cy, r = a.R + dr;
  const b = ox * ux + oy * uy, c = ox * ox + oy * oy - r * r;
  const t = -b - Math.sqrt(Math.max(0, b * b - c));
  return [px + ux * t, py + uy * t];
}
/** walk forward from P along u until the inner circle R+dr (P lies in the band outside it); null if it misses */
function hitDown(a, px, py, ux, uy, dr) {
  const ox = px - a.cx, oy = py - a.cy, r = a.R + dr;
  const b = ox * ux + oy * uy, c = ox * ox + oy * oy - r * r, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? [px + ux * t, py + uy * t] : null;
}
/** dense polyline of a straight segment */
function seg(x0, y0, x1, y1, step = 3) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(len / step)), out = [];
  for (let i = 0; i <= n; i++) out.push([L.lerp(x0, x1, i / n), L.lerp(y0, y1, i / n)]);
  return out;
}
/** dense polyline along the arc; drFn(theta) lets a line wander off true */
function arcLine(a, dr, t0, t1, drFn) {
  const n = Math.ceil(((a.R + dr) * (t1 - t0)) / 3), out = [];
  for (let i = 0; i <= n; i++) { const th = L.lerp(t0, t1, i / n), p = a.pt(th, dr + (drFn ? drFn(th) : 0)); out.push([p.x, p.y]); }
  return out;
}

// ───────────────────────── marks ─────────────────────────
/** a ruled line as a ribbon: almost straight, almost even — the "almost" is what makes it ink on paper */
function ribbon(pts, o) {
  const { w = 3, seed = 1, wvar = 0.09, rag = 0.32, drift = 0.3 } = o;
  const nz = L.makeNoise('s34rb' + seed), n = pts.length, A = [], B = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
    let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const c = drift * nz.n2(s / 240, 1.7);                                                   // the straightedge is never perfectly true
    const hw = (w / 2) * (1 + wvar * nz.n2(s / 70, 7.3) + wvar * 0.5 * nz.n2(s / 12, 3.1));   // ink flow breathes
    const ea = rag * nz.n2(s / 4.5, 11.1), eb = rag * nz.n2(s / 4.5, 23.9);                   // fibres wick the two edges separately
    A.push([pts[i][0] + nx * (c + hw + ea), pts[i][1] + ny * (c + hw + ea)]);
    B.push([pts[i][0] + nx * (c - hw - eb), pts[i][1] + ny * (c - hw - eb)]);
  }
  return { A, B, n };
}
function tracePoly(g, pts) { pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); }
function fillRibbon(g, rb) {
  g.beginPath(); tracePoly(g, rb.A);
  for (let i = rb.n - 1; i >= 0; i--) g.lineTo(rb.B[i][0], rb.B[i][1]);
  g.closePath(); g.fill();
}
/** drawing-pen ink: dense, a hair fuller where the nib touches down */
function inkLine(g, pts, o) {
  const w = o.w || 3, n = pts.length, col = o.color || C.ink;
  const a0 = o.alpha === undefined ? 0.95 : o.alpha, a1 = a0 * (o.fade === undefined ? 1 : o.fade);   // the pen runs a little dry toward the far end
  g.save();
  g.fillStyle = a0 === a1 ? L.rgba(col, a0) : L.linear(g, pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1], [[0, L.rgba(col, a0)], [1, L.rgba(col, a1)]]);
  fillRibbon(g, ribbon(pts, o));
  if (!o.noCaps) {
    g.beginPath(); g.arc(pts[0][0], pts[0][1], w * 0.6, 0, L.TAU); g.fill();
    g.beginPath(); g.arc(pts[n - 1][0], pts[n - 1][1], w * 0.46, 0, L.TAU); g.fill();
  }
  g.restore();
}
/** colour line (gouache in a ruling pen): flat and saturated, pigment pooled along both edges, a paler streak in the core */
function colourLine(g, pts, o) {
  const { w = 15, color, seed, deep = L.shade(color, -0.3) } = o;
  const rb = ribbon(pts, { w, seed, wvar: 0.06, rag: 0.5, drift: 0.4 }), n = rb.n;
  const nz = L.makeNoise('s34cl' + seed);
  const at = (i, k) => [L.lerp(rb.B[i][0], rb.A[i][0], k), L.lerp(rb.B[i][1], rb.A[i][1], k)];
  const run = (kFn) => { g.beginPath(); for (let i = 0; i < n; i++) { const q = at(i, kFn(i)); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.stroke(); };
  g.save(); g.lineJoin = 'round'; g.lineCap = 'butt';
  g.fillStyle = color; g.globalAlpha = 0.92; fillRibbon(g, rb);
  // the load of the pen thins and thickens along the stroke
  g.fillStyle = deep;
  for (let i = 0; i < n - 6; i += 6) {
    const v = nz.n2(i / 52, 2.2); if (v <= 0.05) continue;
    g.globalAlpha = 0.14 * v;
    g.beginPath(); g.moveTo(rb.A[i][0], rb.A[i][1]); g.lineTo(rb.A[i + 6][0], rb.A[i + 6][1]); g.lineTo(rb.B[i + 6][0], rb.B[i + 6][1]); g.lineTo(rb.B[i][0], rb.B[i][1]); g.closePath(); g.fill();
  }
  // paler core, riding a little off-centre
  g.strokeStyle = L.shade(color, 0.3); g.lineWidth = w * 0.36; g.globalAlpha = 0.3;
  run((i) => 0.46 + 0.07 * nz.n2(i / 80, 8.8));
  // pooled edges: a soft dark band just inside each edge, then a crisp rim
  g.strokeStyle = deep;
  g.lineWidth = w * 0.18; g.globalAlpha = 0.2; run(() => 0.93); g.globalAlpha = 0.15; run(() => 0.08);
  g.lineWidth = 1.2; g.globalAlpha = 0.42; run(() => 0.98); g.globalAlpha = 0.3; run(() => 0.025);
  // touch-down: the pen sat here for an instant
  g.fillStyle = deep; g.globalAlpha = o.dab === undefined ? 0.5 : o.dab;
  g.beginPath(); g.arc(pts[0][0], pts[0][1], w * 0.5, 0, L.TAU); g.fill();
  g.restore();
}
/** let the paper's tooth show through a layer of marks (512² speck tile, punched out) */
function bite(layer, tile, alpha) {
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = alpha;
  g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, layer.width, layer.height);
  g.restore();
}
/** small pencil cross on a construction point */
function cross(g, x, y, arm, seed, rotv = 0) {
  const r = L.rng('s34x' + seed), t = rotv + r.range(-0.05, 0.05);
  g.save(); g.translate(x, y); g.rotate(t);
  inkLine(g, seg(-arm - r.range(0, 3), 0, arm + r.range(0, 3), 0, 2), { w: 1.8, seed: seed + 'h', alpha: 0.8, rag: 0.3, color: C.graphite });
  inkLine(g, seg(0, -arm - r.range(0, 3), 0, arm + r.range(0, 3), 2), { w: 1.8, seed: seed + 'v', alpha: 0.8, rag: 0.3, color: C.graphite });
  g.restore();
}
/** compass pinhole: a dark prick, its far lip catching the lamp */
function pinhole(g, x, y, rad = 2.6) {
  g.save();
  g.fillStyle = L.radial(g, x, y, rad * 0.6, rad * 3.4, [[0, 'rgba(60,56,50,0.22)'], [1, 'rgba(60,56,50,0)']]);
  g.beginPath(); g.arc(x, y, rad * 3.4, 0, L.TAU); g.fill();
  g.fillStyle = 'rgba(16,14,13,0.92)'; g.beginPath(); g.ellipse(x, y, rad, rad * 0.92, 0.5, 0, L.TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.1;
  g.beginPath(); g.arc(x, y, rad + 0.9, 0.15, 1.5); g.stroke();
  g.restore();
}

/** cheap soft copy: halve n times, then scale back up (≈ a 2ⁿ⁻¹ px blur without a CSS filter pass over the whole layer) */
function softCopy(src, n = 1) {
  let cur = src, w = src.width, h = src.height;
  for (let i = 0; i < n; i++) {
    w = Math.ceil(w / 2); h = Math.ceil(h / 2);
    const c = L.makeCanvas(w, h), g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, w, h); cur = c;
  }
  const out = L.makeCanvas(src.width, src.height), g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, src.width, src.height);
  out._pad = src._pad;
  return out;
}

// ───────────────────────── paper ─────────────────────────
function buildPaper() {
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = C.paper; full(g);
    // the sheet is not perfectly flat — a breath of unevenness, kept inside the paper's own hue
    g.globalCompositeOperation = 'multiply';
    g.drawImage(L.noiseLayer(PAD, { seed: 's34cockle', scale: 760, octaves: 2, res: 0.08, ramp: [[0, '#f6f4ef'], [0.6, '#ffffff'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over';
    // fibres lying in the surface
    const r = L.rng('s34fib');
    g.lineCap = 'round';
    for (let i = 0; i < 2000; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(8, 40), an = r() * Math.PI, bend = r.range(-8, 8);
      g.strokeStyle = r.chance(0.5) ? `rgba(126,120,110,${r.range(0.02, 0.06).toFixed(3)})` : `rgba(255,255,255,${r.range(0.25, 0.6).toFixed(3)})`;
      g.lineWidth = r.range(0.5, 1.4);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 - Math.sin(an) * bend, y + Math.sin(an) * len * 0.5 + Math.cos(an) * bend, x + Math.cos(an) * len, y + Math.sin(an) * len);
      g.stroke();
    }
    // tooth, lit by the raking lamp from the upper left: a soft cold-press swell under a fine grain
    const swell = L.bumpLight(L.noiseLayer(PAD, { seed: 's34swell', scale: 15, octaves: 2, gain: 0.5, res: 0.5 }), { angle: 45, strength: 1.5, res: 0.5 });
    const tooth = L.bumpLight(L.noiseLayer(PAD, { seed: 's34tooth', scale: 5, octaves: 3, gain: 0.66, res: 0.5 }), { angle: 45, strength: 1.9, res: 0.5 });
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = 0.24; g.drawImage(swell, -PAD, -PAD);
    g.globalAlpha = 0.55; g.drawImage(tooth, -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
}

// ───────────────────────── the drawing ─────────────────────────
function buildMarks(env) {
  const a = env.arc, r = L.rng('s34geo');
  const BOT = H + PAD + 40;
  const ink = L.makeLayer(PAD), col = L.makeLayer(PAD), pen = L.makeLayer(PAD), gra = L.makeLayer(PAD);
  const gi = ink.getContext('2d'), gc = col.getContext('2d'), gp = pen.getContext('2d'), gg = gra.getContext('2d');
  const crest = [a.cx, a.crestY];
  const node = [a.cx, a.crestY - RIM];        // where the axis meets the concentric arc: two chords cross here as well
  const yIn = a.crestY + HOLE_D, yOut = yIn - NEI;   // top edge of the hole / of its inner rim

  // a chord, given the point where it leaves the outer circle (or a point it must pass through) and its heading
  const chord = (o) => {
    const an = L.deg(o.ang), ux = Math.cos(an), uy = Math.sin(an);
    const p0 = o.via ? hitUp(a, o.via[0], o.via[1], ux, uy) : [o.x, a.yAt(o.x)];
    // every ruled line overshoots the circle a little — less above the crest, where the caption sits
    const calm = Math.abs(p0[0] - a.cx) < 380;
    const over = o.over === undefined ? (calm ? r.range(1, 6) : r.range(3, 13)) : o.over;
    let p1;
    if (o.end === 'rim') { const h = hitDown(a, p0[0] + ux * 4, p0[1] + uy * 4, ux, uy, RIM); const ex = r.range(2, 12); p1 = h ? [h[0] + ux * ex, h[1] + uy * ex] : null; }
    if (!p1) { const t = (BOT - p0[1]) / uy; p1 = [p0[0] + ux * t, p0[1] + uy * t]; }
    return seg(p0[0] - ux * over, p0[1] - uy * over, p1[0], p1[1]);
  };

  // three lines through one point on the left: the "\\" chord from x=96, the "/" chord from x=688 and a steeper one
  const c1 = 96 - a.yAt(96), c2 = 688 + a.yAt(688), knot = [(c1 + c2) / 2, (c2 - c1) / 2];

  // ── graphite: the faint construction lines the inked ones were chosen from ──
  const GR = [
    { x: 884, ang: 45, end: 'rim' }, { x: 1036, ang: 135, end: 'rim' },     // a small lozenge under the crest
    { x: 1291, ang: 45, end: 'rim' },                                          // twin of an inked chord
    { x: 1432, ang: 135 },
    { x: 206, ang: 45, end: 'rim' },
    { x: 1648, ang: 45, end: 'rim' },
    { via: knot, ang: 108 },
  ];
  GR.forEach((o, i) => inkLine(gg, chord(o), { w: r.range(2.0, 2.6), seed: 'g' + i, alpha: r.range(0.5, 0.68), fade: r.range(0.6, 0.9), rag: 0.5, wvar: 0.2, drift: 0.5, color: C.graphite, noCaps: true }));

  // ── ink: the staggered chords. 45 = "\" (parallel to the right-hand red edge), 135 = "/" (parallel to the left one) ──
  const CH = [
    { x: 96, ang: 45, w: 4.2 },
    { x: 292, ang: 45, w: 3.6, end: 'rim' },
    { x: 444, ang: 45, w: 2.6, end: 'rim' }, { x: 470, ang: 45, w: 3.5, end: 'rim' }, { x: 505, ang: 45, w: 2.5, end: 'rim' },   // a tight triple, unevenly spaced
    { via: node, ang: 45, w: 4.4 },
    { x: 1096, ang: 45, w: 3.2, end: 'rim' },
    { x: 1262, ang: 45, w: 4.0, end: 'rim' },
    { x: 1585, ang: 45, w: 4.3 },
    { via: node, ang: 135, w: 4.4 },
    { x: 1468, ang: 135, w: 4.0, end: 'rim' },
    { x: 688, ang: 135, w: 4.3 },
    { x: 556, ang: 135, w: 3.2, end: 'rim' },
    { x: 322, ang: 135, w: 3.8 },
    { x: 1905, ang: 135, w: 3.8 },
    { x: 1735, ang: 135, w: 2.6 },                                             // rides beside the first azurite line
    // a few chords off the 45° grid
    { via: knot, ang: 63, w: 3.4 },
    { x: 1344, ang: 117, w: 3.4, end: 'rim' },
  ];
  CH.forEach((o, i) => inkLine(gi, chord(o), { w: o.w, seed: 'c' + i, alpha: r.range(0.8, 0.97), fade: r.range(0.78, 1) }));
  // the vertical axis through the crest
  inkLine(gi, seg(a.cx, a.crestY - 5, a.cx, BOT), { w: 3.8, seed: 'axis', drift: 0.2 });
  // concentric arc: inner edge of the outer rim
  const sp = a.span(PAD + 60);
  inkLine(gi, arcLine(a, RIM, -sp * 1.12, sp * 1.12), { w: 4.4, seed: 'rim', drift: 0.15, noCaps: true, alpha: 0.93 });
  // the square hole: its top edge and two top corners, wrapped by the inner rim. Corners overshoot, as ruled corners do.
  const xi = HOLE_W, xo = HOLE_W + NEI;
  inkLine(gi, seg(a.cx - xi - 9, yIn, a.cx + xi + 6, yIn), { w: 4.4, seed: 'hi' });
  inkLine(gi, seg(a.cx - xi, yIn - 8, a.cx - xi, BOT), { w: 4.4, seed: 'hl' });
  inkLine(gi, seg(a.cx + xi, yIn - 6, a.cx + xi, BOT), { w: 4.4, seed: 'hr' });
  inkLine(gi, seg(a.cx - xo - 7, yOut, a.cx + xo + 11, yOut), { w: 2.8, seed: 'ho', alpha: 0.88 });
  inkLine(gi, seg(a.cx - xo, yOut - 10, a.cx - xo, BOT), { w: 2.8, seed: 'hol', alpha: 0.88 });
  inkLine(gi, seg(a.cx + xo, yOut - 6, a.cx + xo, BOT), { w: 2.8, seed: 'hor', alpha: 0.88 });
  // the outer circle itself: one even line, exactly on the shared arc — the heaviest ink on the sheet
  inkLine(gi, arcLine(a, 0, -sp, sp), { w: 6.6, seed: 'outer', wvar: 0.05, rag: 0.3, drift: 0, noCaps: true, alpha: 0.97 });

  // ── pencil: the yellow-green draft of the outer circle, struck from a slightly different centre so it peels away to the right ──
  const peel = (th) => 5.6 + 7.5 * Math.sin(th) + 0.9 * Math.sin(th * 23 + 1);
  gp.fillStyle = C.pencil; gp.globalAlpha = 0.9;
  fillRibbon(gp, ribbon(arcLine(a, 0, -sp, sp, peel), { w: 7.6, seed: 'pencil', wvar: 0.24, rag: 0.9, drift: 0.7 }));
  {
    const d = 7, pts = [...seg(a.cx - xi - d, BOT, a.cx - xi - d, yIn - d + 14).slice(0, -1), ...seg(a.cx - xi - d + 2, yIn - d, a.cx + xi + d - 2, yIn - d), ...seg(a.cx + xi + d, yIn - d + 14, a.cx + xi + d, BOT).slice(1)];
    gp.globalAlpha = 0.66;
    fillRibbon(gp, ribbon(pts, { w: 6.6, seed: 'pencil2', wvar: 0.24, rag: 0.9, drift: 0.9 }));
  }
  gp.globalAlpha = 1;
  // construction points: crosses in graphite
  const rIn = a.R + RIM, tR = (a.R - Math.sqrt(2 * rIn * rIn - a.R * a.R)) / 2;   // red edge ∩ concentric arc: t² + (R − t)² = rIn², measured down from the crest
  const marks = [[node[0], node[1], 13, 0.785], [a.cx - tR, a.crestY + tR, 11, 0], [a.cx + tR, a.crestY + tR, 11, 0], [a.cx - xi, yIn, 12, 0.785], [a.cx + xi, yIn, 12, 0.785], [knot[0], knot[1], 12, 0]];
  marks.forEach(([x, y, arm, rt], i) => cross(gg, x, y, arm, i, rt));

  // ── colour ──
  // the inscribed square: its two edges leave the crest at 45° — the "人"
  for (const sgn of [-1, 1]) {
    const ux = sgn * Math.SQRT1_2, uy = Math.SQRT1_2, t = (BOT - a.crestY) / uy;
    colourLine(gc, seg(crest[0] - ux * 4, crest[1] - uy * 4, crest[0] + ux * t, crest[1] + uy * t), { w: sgn < 0 ? 13 : 12.2, color: C.red, deep: C.redDeep, dab: 0.2, seed: 'red' + sgn });
  }
  // two parallel azurite lines on the right
  [[1752, 10.5], [1814, 8.6]].forEach(([x, w], i) => colourLine(gc, chord({ x, ang: 135, over: 2 + i * 4 }), { w, color: C.blue, deep: C.blueDeep, seed: 'blue' + i }));

  // ── compass pricks (on the ink layer, above everything) ──
  pinhole(gi, node[0], node[1], 2.8);
  pinhole(gi, a.cx - xi, yIn, 2.3); pinhole(gi, a.cx + xi, yIn, 2.3); pinhole(gi, knot[0], knot[1], 2.3);

  return { ink, col, pen, gra };
}

function buildSheet(env) {
  const a = env.arc;
  const sheet = buildPaper();
  const g = sheet.getContext('2d');
  const { ink, col, pen, gra } = buildMarks(env);
  // tooth tiles: fine specks where the paper's high points refuse the ink
  const fine = L.noiseTex(256, 256, { seed: 's34bite', scale: 3.2, octaves: 2, gain: 0.7, res: 1, contrast: 2.4, ramp: [[0, 'rgba(0,0,0,0)'], [0.52, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']] });
  const coarse = L.noiseTex(256, 256, { seed: 's34bite2', scale: 5.5, octaves: 3, gain: 0.7, res: 1, contrast: 2.6, ramp: [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']] });
  const cloud = L.noiseTex(512, 512, { seed: 's34cloud', scale: 70, octaves: 2, res: 0.25, contrast: 1.6, ramp: [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']] });
  bite(pen, coarse, 0.5); bite(pen, cloud, 0.42); bite(gra, coarse, 0.62); bite(col, fine, 0.2); bite(col, coarse, 0.26); bite(ink, fine, 0.16); bite(ink, cloud, 0.2); bite(col, cloud, 0.1);
  // pencil and graphite first, then ink (with a breath of wicking around it), then colour — multiplied, so ink shows through
  // the red where they cross. Every mark passes through the lens once: nothing on a photographed sheet has a razor edge.
  g.globalCompositeOperation = 'multiply';
  // the worked side of the line: where ruler and hand have travelled, a breath of graphite is rubbed into the sheet
  {
    const haze = L.makeLayer(PAD, (hg) => a.fillBelow(hg, '#74747c', -3));
    bite(haze, cloud, 0.4);
    g.globalAlpha = 0.034; g.drawImage(L.blurred(haze, 9), -PAD, -PAD); g.globalAlpha = 1;
  }
  g.globalAlpha = 0.3; g.drawImage(softCopy(pen, 2), -PAD, -PAD); g.globalAlpha = 1;      // pencil dust rubbed into the tooth
  g.drawImage(L.blurred(pen, 0.5), -PAD, -PAD);
  g.drawImage(L.blurred(gra, 0.5), -PAD, -PAD);
  g.globalAlpha = 0.3; g.drawImage(softCopy(ink, 1), -PAD, -PAD); g.globalAlpha = 1;
  g.drawImage(L.blurred(ink, 0.55), -PAD, -PAD);
  g.globalAlpha = 0.26; g.drawImage(softCopy(col, 2), -PAD, -PAD);                         // colour haloes into the paper
  g.globalAlpha = 0.3; g.drawImage(softCopy(col, 1), -PAD, -PAD); g.globalAlpha = 1;
  g.drawImage(L.blurred(col, 0.7), -PAD, -PAD);
  g.globalCompositeOperation = 'source-over';

  // depth of field: the lens is focused on the crest; the sheet falls away soft toward the bottom edge and the corners
  // (three steps of defocus, each one replacing the last, so the far lines truly melt instead of wearing a halo)
  const fx = a.cx + PAD, fy = a.crestY + 24 + PAD;
  for (const [soft, r0, r1] of [[softCopy(sheet, 1), 300, 720], [L.blurred(sheet, 2.6), 640, 1020], [L.blurred(sheet, 6), 900, 1300]]) {
    const sg = soft.getContext('2d');
    sg.save();
    sg.globalCompositeOperation = 'destination-in';
    sg.translate(fx, fy); sg.scale(1, 0.8);
    sg.fillStyle = L.radial(sg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    sg.fillRect(-4000, -4000, 8000, 8000);
    sg.restore();
    g.drawImage(soft, -PAD, -PAD);
  }
  return sheet;
}

/** the lamp: a pool of light just left of centre; the sheet curls away into a soft shade along its top edge (static; multiplied over the sheet) */
function buildLight() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, 900, 560, 460, 1500, [[0, '#ffffff'], [0.6, '#fcfbf8'], [1, '#f6f4ef']]); g.fillRect(0, 0, W, H);
  g.fillStyle = L.linear(g, 0, 0, 0, 320, [[0, 'rgba(128,120,112,0.09)'], [0.5, 'rgba(128,120,112,0.03)'], [1, 'rgba(128,120,112,0)']]); g.fillRect(0, 0, W, H);
  g.fillStyle = L.linear(g, W, H, W - 560, H - 460, [[0, 'rgba(126,128,134,0.06)'], [1, 'rgba(126,128,134,0)']]); g.fillRect(0, 0, W, H);
  return c;
}

export default {
  name: '天圆地方几何图',
  tone: 'dark',
  init(env) {
    S = { sheet: buildSheet(env), light: buildLight() };
  },
  draw(ctx, env, p) {
    // a slight push-in with a breath of rotation about the coin's centre; dy splits the few px the zoom lifts the arc's ends
    const zoom = L.lerp(1.0, 1.022, p), rot = L.lerp(-0.0035, 0.0035, p);
    L.blit(ctx, env, S.sheet, { rot, zoom, dy: 2.3 * p });
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(S.light, 0, 0); ctx.restore();
  },
};
