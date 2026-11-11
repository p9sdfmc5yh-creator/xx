// s34 — 五行生克图. Macro of a hand-drafted "five phases" diagram on white drawing paper.
// The shared arc is the diagram's outer circle, one even ink line. On the crest sits one of the five nodes: a small ink
// ring hanging just inside the circle. From it two vermilion lines run to the neighbouring nodes (相生 — two sides of the
// pentagon, 36° below the horizontal) and two azurite lines to the far nodes (相克 — two strokes of the pentagram, 72°);
// arrowheads give the direction: with the generating order running clockwise, 生 arrives from the left and leaves to the
// right, 克 arrives up the left stroke and leaves down the right one. Everything else is drafting: a lattice ruled parallel to the two
// 生 lines (some of them ruled two or three times over) from division points on the circle, two inner circles, the dash-dot
// axis, a faint pencil lay-in. The steep 克 strokes are the only lines in their direction.
// Nothing is written anywhere (which phase sits on top is not standardised, so the nodes stay unlabelled).
//
// The media are synthesised per pixel in init(): every stroke is first drawn as plain coverage (ink / vermilion / azurite /
// graphite in separate channels), then turned into pigment density that reacts to the paper's tooth — ink frays along the
// fibres, colour pools at the rims of a stroke, settles in the hollows, skips where the brush ran dry and stains a pale halo
// into the sheet — and finally into light by subtractive mixing (transmittance = exp(−density · absorption)).
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;                      // the camera only creeps a few px
const TW = W + PAD * 2, TH = H + PAD * 2;
const RING = 50;                      // radius of the node ring
const INNER = -300, THIRD = -452;     // concentric construction circles (dr)
const C36 = Math.cos(L.deg(36)), S36 = Math.sin(L.deg(36)), C72 = Math.cos(L.deg(72)), S72 = Math.sin(L.deg(72));
const DIR = { P: [C36, S36], Q: [-C36, S36], SP: [C72, S72], SQ: [-C72, S72] };
let S = null;

// construction lines: s = where the line leaves the circle (px of arc length from the crest), d = direction,
// w = pen width, k = how full the pen was, end = dr of the circle it stops at (omitted → runs off the sheet), pencil = graphite
const LINES = [
  // ↘ the family ruled parallel to the right-hand 生 line
  { s: -985, d: 'P', w: 5.4, k: 1 },
  { s: -716, d: 'P', w: 3.7, k: 0.92 }, { s: -690, d: 'P', w: 3.4, k: 0.86, end: THIRD }, { s: -667, d: 'P', w: 3.7, k: 0.94, end: INNER },   // ruled three times
  { s: -482, d: 'P', w: 5.2, k: 1 },
  { s: 262, d: 'P', w: 4.4, k: 0.94 },
  { s: 572, d: 'P', w: 5, k: 1 },
  { s: 800, d: 'P', w: 3.7, k: 0.9 }, { s: 828, d: 'P', w: 3.4, k: 0.84 },
  // ↙ … and to the left-hand one
  { s: 960, d: 'Q', w: 5.4, k: 1 },
  { s: 668, d: 'Q', w: 5, k: 0.98 },
  { s: 506, d: 'Q', w: 3.7, k: 0.92 }, { s: 481, d: 'Q', w: 3.4, k: 0.88, end: INNER }, { s: 459, d: 'Q', w: 3.7, k: 0.9, end: THIRD },
  { s: -236, d: 'Q', w: 4.4, k: 0.94 },
  { s: -540, d: 'Q', w: 5, k: 1 }, { s: -568, d: 'Q', w: 3.4, k: 0.84 },
  { s: -830, d: 'Q', w: 4.8, k: 0.96 },
  // pencil lay-in that was never inked
  { s: -455, d: 'P', w: 2.6, k: 0.5, pencil: true }, { s: 702, d: 'Q', w: 2.6, k: 0.5, pencil: true },
];
const DIVS = [-830, -482, 572, 960];

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
const absorb = (hex, k = 1) => { const c = L.parseColor(hex); return [-Math.log(c[0] / 255) * k, -Math.log(c[1] / 255) * k, -Math.log(c[2] / 255) * k]; };
// absorption per unit density (density 1 over white paper gives the named colour)
const K_INK = absorb('#1a1a1a'), K_PEN = absorb('#55524e'), K_RED = absorb('#dc3220'), K_BLUE = absorb('#2a6fb8');
const EXP = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) EXP[i] = Math.exp(-i / 512);
const ex = (v) => EXP[v >= 8 ? 4096 : v <= 0 ? 0 : (v * 512) | 0];

// ───────────────────────── paper tooth ─────────────────────────
/** z = fine tooth, f = clumpier fibre field (both mean 0, sd 1, over the whole padded sheet); relief = multiply map lit from the upper left */
function buildTooth() {
  const g1 = L.grainTex(TW, TH, { seed: 's34t1', amount: 1, size: 1 });
  const g2 = L.grainTex(TW, TH, { seed: 's34t2', amount: 1, size: 2 });
  const g5 = L.grainTex(TW, TH, { seed: 's34t3', amount: 1, size: 5 });
  const g12 = L.grainTex(TW, TH, { seed: 's34t4', amount: 1, size: 12 });
  const n = TW * TH;
  const field = (parts) => {
    const c = L.makeCanvas(TW, TH), g = c.getContext('2d', { willReadFrequently: true });
    for (const [tex, al] of parts) { g.globalAlpha = al; g.drawImage(tex, 0, 0); }
    const d = g.getImageData(0, 0, TW, TH).data, out = new Float32Array(n);
    let m = 0, v = 0;
    for (let i = 0; i < n; i++) m += d[i * 4];
    m /= n;
    for (let i = 0; i < n; i++) { const e = d[i * 4] - m; v += e * e; }
    const sd = Math.sqrt(v / n) || 1;
    for (let i = 0; i < n; i++) out[i] = (d[i * 4] - m) / sd;
    return out;
  };
  const z = field([[g1, 1], [g2, 0.55], [g5, 0.45]]);
  const f = field([[g5, 1], [g12, 0.45], [g2, 0.3]]);
  const img = new ImageData(TW, TH), o = img.data;
  for (let y = 0; y < TH; y++) {
    const up = y > 0 ? TW : 0, dn = y < TH - 1 ? TW : 0;
    for (let x = 0; x < TW; x++) {
      const k = y * TW + x, i = k * 4;
      const gx = z[k + (x < TW - 1 ? 1 : 0)] - z[k - (x > 0 ? 1 : 0)], gy = z[k + dn] - z[k - up];
      const fx = f[k + (x < TW - 2 ? 2 : 0)] - f[k - (x > 1 ? 2 : 0)], fy = f[k + 2 * dn] - f[k - 2 * up];
      let s = 0.986 + 0.0052 * (gx + gy) + 0.0048 * (fx + fy) + 0.003 * z[k] + 0.004 * f[k];
      s = s > 1 ? 1 : s < 0.9 ? 0.9 : s;
      o[i] = o[i + 1] = o[i + 2] = 255 * s; o[i + 3] = 255;
    }
  }
  const relief = L.makeCanvas(TW, TH);
  relief.getContext('2d').putImageData(img, 0, 0);
  return { z, f, relief };
}

function buildPaper(T) {
  return L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, TW, TH);
    // window light from the upper left: a broad warm pool falling off into cool shade toward the lower right
    g.fillStyle = L.radial(g, 720, 260, 80, 1950, [[0, '#fffffc'], [0.3, '#fffdf6'], [0.6, '#faf7f0'], [0.84, '#f0efed'], [1, '#e2e5ea']]); full();
    // the sheet is not perfectly flat
    g.globalCompositeOperation = 'multiply';
    g.drawImage(L.noiseTex(TW, TH, { seed: 's34wave', scale: 640, octaves: 3, res: 0.1, warp: 0.4, ramp: [[0, '#f4f3f2'], [0.55, '#fdfcfc'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over';
    // fibres felted into the surface
    const r = L.rng('s34fib');
    g.lineCap = 'round';
    for (let i = 0; i < 620; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(10, 46), an = r() * Math.PI;
      g.strokeStyle = r.chance(0.5) ? L.rgba('#8f8a80', r.range(0.05, 0.16)) : L.rgba('#ffffff', r.range(0.2, 0.6));
      g.lineWidth = r.range(0.6, 1.5);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-5, 5), y + Math.sin(an) * len * 0.5 + r.range(-5, 5), x + Math.cos(an) * len, y + Math.sin(an) * len);
      g.stroke();
    }
    // tooth
    g.globalCompositeOperation = 'multiply';
    g.drawImage(T.relief, -PAD, -PAD);
    // something off-frame keeps the light off the near right corner: a wide, cool penumbra
    g.fillStyle = L.linear(g, 1180, 560, 2060, 1210, [[0, '#ffffff'], [0.45, '#f6f7f8'], [0.8, '#e6e9ee'], [1, '#d9dee6']]); full();
    g.globalCompositeOperation = 'source-over';
  });
}

// ───────────────────────── strokes (coverage only) ─────────────────────────
const NZ = L.makeNoise('s34rb');
const linePts = (x0, y0, x1, y1, step = 4) => {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push([L.lerp(x0, x1, i / n), L.lerp(y0, y1, i / n)]);
  return out;
};
/** fill a ribbon along a dense polyline: w px wide (number or fn(distance)), a little pressure change and wander */
function ribbon(g, pts, w, seed, o = {}) {
  const { vary = 0.07, wander = 0.5 } = o;
  const n = pts.length; if (n < 2) return;
  const sd = L.rng('s34' + seed)() * 997;
  const lf = new Array(n), rt = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const A = pts[i ? i - 1 : 0], B = pts[i < n - 1 ? i + 1 : n - 1];
    let nx = -(B[1] - A[1]), ny = B[0] - A[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const wv = (typeof w === 'function' ? w(s) : w) * (1 + vary * NZ.n2(s / 85 + sd, 1.3) + vary * 0.5 * NZ.n2(s / 13 + sd, 7.7));
    const hw = Math.max(0.6, wv / 2), j = wander * NZ.n2(s / 140 + sd, 9.1);
    lf[i] = [pts[i][0] + nx * (hw + j), pts[i][1] + ny * (hw + j)]; rt[i] = [pts[i][0] - nx * (hw - j), pts[i][1] - ny * (hw - j)];
  }
  g.beginPath(); g.moveTo(lf[0][0], lf[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(lf[i][0], lf[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(rt[i][0], rt[i][1]);
  g.closePath(); g.fill();
}
/** how much the pen / brush was carrying, changing slowly along the stroke */
function loadGrad(g, x0, y0, x1, y1, col, r, lo, hi, n = 8) {
  const stops = [];
  for (let i = 0; i <= n; i++) stops.push([i / n, col(r.range(lo, hi))]);
  return L.linear(g, x0, y0, x1, y1, stops);
}
const CH_R = (al) => `rgba(255,0,0,${al.toFixed(3)})`, CH_G = (al) => `rgba(0,255,0,${al.toFixed(3)})`, CH_B = (al) => `rgba(0,0,255,${al.toFixed(3)})`;

// ───────────────────────── the drawing ─────────────────────────
function build(env) {
  const a = env.arc, R = a.R;
  const c0 = { x: a.cx, y: a.crestY + RING };
  const T = buildTooth();
  const CY0 = Math.floor(a.crestY) - 40, CH = H + PAD - CY0;     // nothing is drawn above the circle: only this strip is synthesised
  const mk = () => {
    const c = L.makeCanvas(TW, CH), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, TW, CH);
    g.translate(PAD, -CY0); g.globalCompositeOperation = 'lighter';
    return [c, g];
  };
  const [cov, cg] = mk();     // R = vermilion, G = ink, B = azurite
  const [aux, ag] = mk();     // R = graphite, G = a second coat of colour
  const r = L.rng('s34');
  const sp = a.span(PAD + 40);

  const inkLine = (x0, y0, x1, y1, w, k, seed, blob = true) => {
    cg.fillStyle = loadGrad(cg, x0, y0, x1, y1, CH_G, r, k * 0.82, k);
    ribbon(cg, linePts(x0, y0, x1, y1), w, seed, { vary: 0.08, wander: 0.4 });
    if (blob) { cg.fillStyle = CH_G(k); cg.beginPath(); cg.ellipse(x0, y0, w * 0.74, w * 0.6, r.range(0, 3), 0, L.TAU); cg.fill(); }   // the pen touches down
  };
  const pencil = (pts, w, k, seed) => { ag.fillStyle = CH_R(k); ribbon(ag, pts, w, seed, { vary: 0.16, wander: 0.8 }); };
  // first hit of a ray from the circle with the concentric circle R + dr
  const hit = (x0, y0, d, dr) => { const px = x0 - a.cx, py = y0 - a.cy, b = px * d[0] + py * d[1], q = b * b - (px * px + py * py - (R + dr) * (R + dr)); return q > 0 ? -b - Math.sqrt(q) : null; };

  // ── construction lines ──
  LINES.forEach((ln, i) => {
    const d0 = DIR[ln.d], da = r.range(-0.0035, 0.0035);          // parallels set with a pair of set squares: never quite parallel
    const d = [d0[0] * Math.cos(da) - d0[1] * Math.sin(da), d0[0] * Math.sin(da) + d0[1] * Math.cos(da)];
    const p0 = a.pt(ln.s / R, 0);
    let len = 2000;
    if (ln.end !== undefined) { const t = hit(p0.x, p0.y, d, ln.end); if (t) len = t + r.range(5, 16); }
    const over = r.range(1, 8);                                    // a little overshoot past the circle
    const x0 = p0.x - d[0] * over, y0 = p0.y - d[1] * over, x1 = p0.x + d[0] * len, y1 = p0.y + d[1] * len;
    if (ln.pencil) pencil(linePts(x0, y0, x1, y1), ln.w, ln.k, 'ln' + i);
    else inkLine(x0, y0, x1, y1, ln.w, ln.k, 'ln' + i);
  });
  // ── concentric circles ──
  const arcInk = (dr, w, lo, hi, seed, o) => {
    cg.fillStyle = loadGrad(cg, -PAD, 0, W + PAD, 0, CH_G, r, lo, hi, 10);
    ribbon(cg, L.arcPts(a, dr, -sp, sp, 440), w, seed, o);
  };
  arcInk(INNER, 4, 0.82, 1, 'inner', { vary: 0.06, wander: 0.3 });
  arcInk(THIRD, 3.6, 0.8, 0.96, 'third', { vary: 0.06, wander: 0.3 });
  pencil(L.arcPts(a, INNER - 17, -sp, sp, 300), 2.4, 0.46, 'inner2');                       // the compass was swung twice
  // division ticks on the inner circle
  for (const s of DIVS) { const p = a.pt(s / R, INNER + 17), q = a.pt(s / R + r.range(-0.001, 0.001), INNER - 17); inkLine(p.x, p.y, q.x, q.y, 3.4, 0.95, 'tk' + s, false); }
  // compass ticks stepped off across the outer circle
  for (const s of DIVS) {
    const th = s / R, lean = r.range(-0.004, 0.004);
    const p = a.pt(th - lean, 26), m = a.pt(th, 0), q = a.pt(th + lean, -30);
    pencil(L.smoothPath([[p.x, p.y], [m.x + r.range(-1.5, 1.5), m.y], [q.x, q.y]], 3), 2.6, 0.62, 'ct' + s);
  }
  // ── the axis: dash-dot, from under the node down the sheet ──
  { let y = c0.y + RING + 13, k = 0;
    while (y < H + PAD) {
      const long = k % 2 === 0, len = long ? r.range(92, 112) : r.range(6, 9);
      inkLine(a.cx + r.range(-0.5, 0.5), y, a.cx + r.range(-0.5, 0.5), y + len, long ? 3.2 : 3.6, 0.92, 'ax' + k, false);
      y += len + r.range(13, 17); k++;
    } }
  // ── the outer circle: one even ink line, exactly on the arc ──
  arcInk(0, 10, 0.94, 1, 'arc', { vary: 0.035, wander: 0.22 });
  // ── the node: a ring swung with the compass (pin-prick and pencil cross at its centre) ──
  { const pts = [];
    for (let k = 0; k <= 110; k++) { const an = -Math.PI / 2 + 0.3 + (k / 110) * L.TAU; pts.push([c0.x + RING * Math.cos(an), c0.y + RING * Math.sin(an)]); }
    cg.fillStyle = CH_G(1);
    ribbon(cg, pts, (s) => 7.4 * (1 + 0.11 * Math.sin(s / RING + 0.6)), 'ring', { vary: 0.04, wander: 0.25 });
    pencil(linePts(c0.x - 15, c0.y + 0.5, c0.x + 15, c0.y - 0.5), 2.2, 0.6, 'cx1'); pencil(linePts(c0.x + 0.5, c0.y - 15, c0.x - 0.5, c0.y + 15), 2.2, 0.6, 'cx2');
    cg.fillStyle = CH_G(0.9); cg.beginPath(); cg.arc(c0.x + 0.4, c0.y + 0.3, 2.3, 0, L.TAU); cg.fill();
  }

  // ── 相生 (vermilion) and 相克 (azurite): a loaded brush drawn along the straight-edge over a pencil lay-in ──
  const arrow = (ch, x, y, ux, uy, len, hw) => {
    const nx = -uy, ny = ux, P = (f, s) => [x + ux * f + nx * s, y + uy * f + ny * s];
    const tip = P(len * 0.56, r.range(-1.2, 1.2)), bl = P(-len * 0.44, hw * r.range(0.92, 1.1)), br = P(-len * 0.44, -hw * r.range(0.92, 1.1)), notch = P(-len * 0.24, r.range(-1.5, 1.5));
    const m1 = P(len * 0.08, hw * 0.47 + r.range(0, 2.5)), m2 = P(len * 0.08, -hw * 0.47 - r.range(0, 2.5));
    const path = (g) => {
      g.beginPath(); g.moveTo(tip[0], tip[1]); g.quadraticCurveTo(m1[0], m1[1], bl[0], bl[1]);
      g.quadraticCurveTo((bl[0] + notch[0]) / 2 + ux * 3, (bl[1] + notch[1]) / 2 + uy * 3, notch[0], notch[1]);
      g.quadraticCurveTo((br[0] + notch[0]) / 2 + ux * 3, (br[1] + notch[1]) / 2 + uy * 3, br[0], br[1]);
      g.quadraticCurveTo(m2[0], m2[1], tip[0], tip[1]); g.closePath(); g.fill();
    };
    cg.fillStyle = ch(1); path(cg);
    ag.fillStyle = CH_G(0.75); path(ag);                           // filled in with a second pass of the brush
  };
  const colour = (ch, dn, w, seed, at, sense, alen, ahw) => {
    const d = DIR[dn], da = r.range(-0.005, 0.005), off = r.range(-3, 3);       // the colour does not sit exactly on its lay-in
    const dd = [d[0] * Math.cos(da) - d[1] * Math.sin(da), d[0] * Math.sin(da) + d[1] * Math.cos(da)];
    const t0 = RING + 5;
    const x0 = c0.x + d[0] * t0 - d[1] * off, y0 = c0.y + d[1] * t0 + d[0] * off, x1 = x0 + dd[0] * 1600, y1 = y0 + dd[1] * 1600;
    pencil(linePts(c0.x + d[0] * (t0 + 2), c0.y + d[1] * (t0 + 2), c0.x + d[0] * 1600, c0.y + d[1] * 1600), 2.2, 0.52, seed + 'p');
    cg.fillStyle = loadGrad(cg, x0, y0, x1, y1, ch, r, 0.74, 1, 12);
    ribbon(cg, linePts(x0, y0, x1, y1), (s) => w * (1.05 - 0.00008 * s), seed, { vary: 0.075, wander: 1.1 });
    // the brush lands: fuller where the stroke starts
    cg.fillStyle = ch(1); cg.beginPath(); cg.ellipse(x0 + dd[0] * 5, y0 + dd[1] * 5, w * 0.62, w * 0.55, Math.atan2(dd[1], dd[0]), 0, L.TAU); cg.fill();
    ag.fillStyle = CH_G(0.5); ag.beginPath(); ag.ellipse(x0 + dd[0] * 10, y0 + dd[1] * 10, w * 1.3, w * 0.5, Math.atan2(dd[1], dd[0]), 0, L.TAU); ag.fill();
    arrow(ch, x0 + dd[0] * (at - t0), y0 + dd[1] * (at - t0), dd[0] * sense, dd[1] * sense, alen, ahw);
  };
  colour(CH_R, 'P', 16.5, 'redR', 206, 1, 78, 31);      // 生: leaves toward the right-hand neighbour …
  colour(CH_R, 'Q', 16, 'redL', 198, -1, 78, 31);       // … and arrives from the left-hand one
  colour(CH_B, 'SP', 14, 'bluR', 196, 1, 70, 27);       // 克: leaves down the right stroke of the star …
  colour(CH_B, 'SQ', 14.5, 'bluL', 187, -1, 70, 27);    // … and arrives up the left one

 
  // ── coverage → pigment → light ──
  const rd = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, TW, CH).data;
  const d1 = rd(L.blurred(cov, 1)), d3 = rd(L.blurred(cov, 3.2)), d11 = rd(L.blurred(cov, 11)), dx = rd(L.blurred(aux, 0.8));
 
  const Z = T.z, F = T.f, NS = L.makeNoise('s34streak');
  const oi = new ImageData(TW, CH), oc = new ImageData(TW, CH), I = oi.data, C = oc.data;
  const pigment = (c1, c3, halo, z, f, coat, st) => {
    let d = 0.07 * halo * L.clamp(1 + 0.9 * f, 0, 2.4);                           // colour staining the paper round the stroke
    if (c1 > 0.02) {
      const load = c1 * (1 + 0.16 * st);
      const e = sstep(0.3, 0.62, c1 + 0.1 * f + 0.05 * st);
      const rim = c1 > 0.25 ? L.clamp(3.4 * (1 - c3 / c1)) : 0;    // pigment carried to the rims as the stroke dries
      const gran = L.clamp(1 - 0.32 * z + 0.14 * f, 0.3, 1.8);     // … and settling in the hollows of the tooth
      const dry = sstep(0, 0.3, load - 0.5 - 0.13 * z);            // a thin brush skips over the peaks
      d += e * dry * ((0.3 + 0.8 * load) * (1 + 0.42 * rim) * gran + 0.45 * coat);
    }
    return d;
  };
  for (let y = 0; y < CH; y++) {
    const Y = y + CY0, tr = (Y + PAD) * TW;
    for (let x = 0; x < TW; x++) {
      const i = (y * TW + x) * 4;
      let ir = 255, ig = 255, ib = 255, cr = 255, cgn = 255, cb = 255;
      const g3 = d3[i + 1], pc = dx[i];
      if (g3 > 1 || pc > 1) {
        const z = Z[tr + x], f = F[tr + x];
        let dI = 0, dP = 0;
        if (g3 > 1) { const gi = d1[i + 1] / 255, e = sstep(0.36, 0.62, gi + 0.12 * f); dI = e * (0.34 + 0.72 * gi) * (1 + 0.05 * z) + 0.07 * (g3 / 255) * (1 - e); }
        if (pc > 1) { const pp = pc / 255; dP = pp * 1.1 * sstep(-0.7, 0.5, 0.75 * z + 0.45 * f + 1.6 * (pp - 0.55)); }
        ir = 255 * ex(dI * K_INK[0] + dP * K_PEN[0]); ig = 255 * ex(dI * K_INK[1] + dP * K_PEN[1]); ib = 255 * ex(dI * K_INK[2] + dP * K_PEN[2]);
      }
      const rh = d11[i], bh = d11[i + 2];
      if (rh > 1 || bh > 1) {
        const z = Z[tr + x], f = F[tr + x], X = x - PAD, coat = dx[i + 1] / 255, sg = X < a.cx ? -1 : 1;
        let dR = 0, dB = 0;
        if (rh > 1) dR = pigment(d1[i] / 255, d3[i] / 255, rh / 255, z, f, coat, NS.n2((sg * X * C36 + Y * S36) / 90, (-sg * X * S36 + Y * C36) / 2.6));
        if (bh > 1) dB = pigment(d1[i + 2] / 255, d3[i + 2] / 255, bh / 255, z, f, coat, NS.n2((sg * X * C72 + Y * S72) / 90, (-sg * X * S72 + Y * C72) / 2.6 + 40));
        cr = 255 * ex(dR * K_RED[0] + dB * K_BLUE[0]); cgn = 255 * ex(dR * K_RED[1] + dB * K_BLUE[1]); cb = 255 * ex(dR * K_RED[2] + dB * K_BLUE[2]);
      }
      I[i] = ir; I[i + 1] = ig; I[i + 2] = ib; I[i + 3] = 255;
      C[i] = cr; C[i + 1] = cgn; C[i + 2] = cb; C[i + 3] = 255;
    }
  }
 
  const inkC = L.makeCanvas(TW, CH), colC = L.makeCanvas(TW, CH);
  inkC.getContext('2d').putImageData(oi, 0, 0);
  colC.getContext('2d').putImageData(oc, 0, 0);

  // ── the sheet: paper × ink and graphite ──
  const base = buildPaper(T);
  const bg = base.getContext('2d');
  bg.globalCompositeOperation = 'multiply'; bg.drawImage(inkC, -PAD, CY0); bg.globalCompositeOperation = 'source-over';

  // ── the lens: sharp round the circle, the near edge of the sheet (bottom of frame) falls out of focus ──
  const lens = (c, oy) => {
    const mask = (y0, y1, side) => {
      const m = L.makeCanvas(c.width, c.height), g = m.getContext('2d');
      g.translate(PAD, -oy);
      g.fillStyle = L.linear(g, 0, y0, 0, y1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); g.fillRect(-PAD, -PAD, TW, TH);
      if (side) {
        g.fillStyle = L.linear(g, 400, 0, -PAD, 0, [[0, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${side})`]]); g.fillRect(-PAD, -PAD, PAD + 400, TH);
        g.fillStyle = L.linear(g, W - 400, 0, W + PAD, 0, [[0, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${side})`]]); g.fillRect(W - 400, -PAD, PAD + 400, TH);
      }
      return m;
    };
    const soft = [[2.2, mask(770, 990, 0.85)], [6, mask(930, 1140, 0.3)]].map(([px, m]) => { const b = L.blurred(c, px), g = b.getContext('2d'); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0); return b; });
    const g = c.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
    for (const b of soft) g.drawImage(b, 0, 0);
    g.restore();
    return c;
  };
  lens(base, -PAD);
  lens(colC, CY0);
  return { base, col: colC, cy0: CY0 };
}

export default {
  name: '五行生克图',
  tone: 'dark',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    // a slow creep toward the sheet while the drawing slides a hair along the circle
    const cam = { rot: L.lerp(-0.0026, 0.0026, p), zoom: L.lerp(0.99, 1.012, p) };
    L.blit(ctx, env, S.base, cam);
    // the colour breathes: the wet lines deepen and ease off again
    const breath = 0.86 + 0.14 * Math.sin(p * Math.PI);
    L.cam(ctx, env, cam, () => {
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = breath;
      ctx.drawImage(S.col, -PAD, S.cy0);
    });
  },
};
