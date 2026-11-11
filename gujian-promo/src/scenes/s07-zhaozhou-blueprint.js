// s07 — 赵州桥蓝图（安济桥 立面）. A close-up of a chalk drawing on cyanotype-blue paper, shot a little askew.
// The shared arc is the INTRADOS of the main arch — the heaviest chalk line on the sheet. The whole drawing is
// turned about the centre of that circle (TILT), which leaves the arc exactly where it is but swings the crown of
// the bridge to the left: the deck becomes one long rising diagonal, the right shoulder opens up with its two
// open-spandrel arches (the larger one outboard), and the folds of the sheet run on the slant.
// Below the arc: a handful of radii struck from the centre and the centre line of the span — as in the reference
// frame (an arc + a few fat, oblique chalk lines). Few lines, all fat.
// The chalk is not a vector stroke: every mark is first laid down as a PRESSURE map and then "developed" per pixel
// against the tooth of the paper, so lines break up, skip and shed dust the way chalk does. The ring of voussoirs
// is toned by rubbing chalk in with a finger (a thin, streaky film), stone by stone.
// NOTE: proportions are schematic (ring and voussoirs drawn larger than life, the shoulder pulled a little toward
// the crown); no dimensions, numbers or lettering other than the name 安济桥 are written anywhere.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 96;                         // the camera only moves ±2.5 % / ±0.26°, so a narrow margin is enough
const SW = W + PAD * 2, SH = H + PAD * 2;
const BLUE = '#12579a', DEEP = '#0a427c', LITE = '#2c7cc4';
const CHALK = [249, 247, 239];
const TILT = 0.23;        // the drawing is turned this far (rad, anticlockwise) about the centre of the arc

// geometry in px, in the drawing's own upright frame (x offsets are measured from the centre axis)
const RING = 118;         // main arch ring thickness (intrados → extrados)
const JOINT = 205;        // voussoir length along the intrados
const DECK_H = 70;        // top of deck above the extrados at the crown
const DECK_R = 14000;     // camber radius of the deck line
const SLAB = 19;          // cornice course under the deck edge
const ARCH_SPECS = [{ d: 960, span: 236, rise: 96, ring: 30 }, { d: 1330, span: 316, rise: 128, ring: 36 }]; // inner (small) / outer (large): spans in the ratio 2.85 : 3.81
const FAN = [-1.5, 0.5, 2.5, 3.5, 6.5]; // radii that run on below the arch, in voussoir units from the axis (they pass through joints)
const TN = 1024;                    // tooth tile size (power of two)
let S = null, NZ = null, SID = 0;
const tilt = (g, a) => { g.translate(a.cx, a.cy); g.rotate(-TILT); g.translate(-a.cx, -a.cy); };

// ───────────────────────── geometry ─────────────────────────
function makeGeo(a) {
  const step = JOINT / a.R;
  const yExt = (x) => a.yAt(x, RING);
  const yDeck = (x) => a.crestY - RING - DECK_H + ((x - a.cx) * (x - a.cx)) / (2 * DECK_R);
  const arches = [];
  for (const sgn of [-1, 1]) for (const sp of ARCH_SPECS) {
    const xc = a.cx + sgn * sp.d, half = sp.span / 2;
    const r = (half * half + sp.rise * sp.rise) / (2 * sp.rise);
    const phi = Math.asin(half / r);
    // crown of the small ring tucks right under the cornice; the uphill foot sits on the back of the main arch
    const springY = Math.min(yDeck(xc) + SLAB + 6 + sp.ring + sp.rise, yExt(xc - sgn * half) - 1);
    arches.push({ sgn, xc, half, r, r2: r + sp.ring, ring: sp.ring, phi, springY, cy: springY - sp.rise + r, xL: xc - half, xR: xc + half });
  }
  return { step, yExt, yDeck, arches };
}
function archPts(A, rad, n = 30, p0 = -A.phi, p1 = A.phi) {
  const out = [];
  for (let i = 0; i <= n; i++) { const ps = L.lerp(p0, p1, i / n); out.push([A.xc + rad * Math.sin(ps), A.cy - rad * Math.cos(ps)]); }
  return out;
}

// ───────────────────────── the tooth of the paper ─────────────────────────
/**
 * Two tileable TN² maps. T (0..1, mean 0.5): the height of the paper — low = the high points, which catch the chalk
 * first; it carries the 4–8 px "crumbs" a chalk line breaks into. F (z-score): pin-point grain, for dust and pinholes.
 */
function buildTooth() {
  const n = TN, r = L.rng('s07tooth');
  const src = L.makeCanvas(n, n), sg = src.getContext('2d');
  const img = sg.createImageData(n, n), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = (r() * 256) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  sg.putImageData(img, 0, 0);
  const m = 32, wn = n + m * 2;
  const tmp = L.makeCanvas(wn, wn), tg = tmp.getContext('2d', { willReadFrequently: true });
  tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
  const band = (sc, blur) => {
    const sm = L.makeCanvas(n / sc, n / sc); sm.getContext('2d').drawImage(src, (n - n / sc) * 0.5 | 0, 0, n / sc, n / sc, 0, 0, n / sc, n / sc);
    tg.filter = `blur(${blur}px)`;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) tg.drawImage(sm, tx * n, ty * n, n, n);
    tg.filter = 'none';
    const dd = tg.getImageData(m, m, n, n).data, out = new Float32Array(n * n);
    let sum = 0, sq = 0;
    for (let i = 0; i < n * n; i++) { const v = dd[i * 4]; sum += v; sq += v * v; }
    const mean = sum / (n * n), sd = Math.sqrt(sq / (n * n) - mean * mean) || 1;
    for (let i = 0; i < n * n; i++) out[i] = (dd[i * 4] - mean) / sd;
    return out;
  };
  const F = band(1, 0.65), B2 = band(2, 1.0), B4 = band(4, 1.6);
  const T = new Float32Array(n * n);
  const k = 0.2 / Math.sqrt(0.4 * 0.4 + 0.8 * 0.8 + 0.42 * 0.42);
  for (let i = 0; i < n * n; i++) T[i] = L.clamp(0.5 + (0.4 * F[i] + 0.8 * B2[i] + 0.42 * B4[i]) * k);
  // relief tile for the bare paper: a fine, quiet tooth lit from the top-left
  const grain = L.makeCanvas(n, n), gg = grain.getContext('2d');
  const gi = gg.createImageData(n, n), gd = gi.data, mk = n - 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ia = ((y - 1) & mk) * n + ((x - 1) & mk), ib = ((y + 1) & mk) * n + ((x + 1) & mk);
    const v = 128 + (F[ia] - F[ib]) * 6 + (B2[ia] - B2[ib]) * 5.5 - B2[y * n + x] * 2, i = (y * n + x) * 4;
    gd[i] = gd[i + 1] = gd[i + 2] = v; gd[i + 3] = 255;
  }
  gg.putImageData(gi, 0, 0);
  return { T, F, grain };
}

// ───────────────────────── paper ─────────────────────────
function buildPaper(grain) {
  const c = L.makeCanvas(SW, SH), g = c.getContext('2d');
  g.fillStyle = BLUE; g.fillRect(0, 0, SW, SH);
  // the cyanotype never develops perfectly evenly: broad, quiet pools — same hue, a little deeper / a little paler
  g.drawImage(L.noiseTex(SW, SH, { seed: 's07pool', scale: 620, octaves: 3, res: 0.12, warp: 0.5, contrast: 1.6,
    ramp: [[0, L.rgba(DEEP, 0.3)], [0.46, L.rgba(DEEP, 0)], [0.56, L.rgba(LITE, 0)], [1, L.rgba(LITE, 0.2)]] }), 0, 0);
  // brush streaks of the hand-coated sensitiser, running slightly off the horizontal
  g.save(); g.translate(SW / 2, SH / 2); g.rotate(-TILT - 0.03); g.globalAlpha = 0.42;
  g.drawImage(L.noiseTex(SW + 320, SH + 520, { seed: 's07coat', scale: 26, sx: 60, sy: 1, octaves: 3, res: 0.25, contrast: 1.5,
    ramp: [[0, L.rgba(DEEP, 0.32)], [0.44, L.rgba(DEEP, 0)], [0.6, L.rgba(LITE, 0)], [1, L.rgba(LITE, 0.2)]] }), -SW / 2 - 160, -SH / 2 - 260);
  g.restore();
  // tooth
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = g.createPattern(grain, 'repeat'); g.fillRect(0, 0, SW, SH);
  g.globalCompositeOperation = 'source-over';
  return c;
}

// ───────────────────────── chalk: pressure marks ─────────────────────────
/**
 * Lay one chalk mark into the pressure map (grey = how hard the stick was pressed; 'lighten' keeps the maximum,
 * so going over a line twice does not add up). The face of a chalk stick is never flat: the whole width goes down
 * lightly, and two or three ridges carry the full pressure — each of them drops out now and then, which leaves the
 * streaky "flying white" along the stroke. o: w (px), p (0..1), wob (px of hand wander), lift [px in, px out].
 */
function mark(g, pts, o = {}) {
  const w = o.w || 9, p = o.p === undefined ? 0.9 : o.p, wob = o.wob === undefined ? 0.8 : o.wob, lift = o.lift || [0, 0];
  const k = (SID += 7.31);
  const P = L.smoothPath(pts, 3), n = P.length;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const Q = new Float32Array(n * 7);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const off = wob * (NZ.n2(s / 240, k) + 0.3 * NZ.n2(s / 37, k + 3.1));
    let pv = p * (0.9 + 0.14 * NZ.n2(s / 170, k + 23.3));
    if (!o.steady) pv *= 0.5 + 0.5 * L.smooth((NZ.n2(s / 46, k + 77.7) + 0.74) / 0.16); // the stick skips now and then
    if (lift[0]) pv *= 0.35 + 0.65 * L.smooth(s / lift[0]);
    if (lift[1]) pv *= 0.2 + 0.8 * L.smooth((total - s) / lift[1]);
    const j = i * 7;
    Q[j] = P[i][0] + nx * off; Q[j + 1] = P[i][1] + ny * off; Q[j + 2] = nx; Q[j + 3] = ny;
    Q[j + 4] = w * (1 + 0.15 * NZ.n2(s / 64, k + 11.7) + 0.08 * NZ.n2(s / 12, k + 5.9)); Q[j + 5] = pv; Q[j + 6] = s;
  }
  const lanes = o.lanes === undefined ? (w < 8.5 ? 2 : 3) : o.lanes;
  for (let l = -1; l < lanes; l++) {
    const of = l < 0 ? 0 : ((l - (lanes - 1) / 2) / lanes) * 0.94, wf = l < 0 ? 1 : 1.02 / lanes + 0.02;
    for (let i = 1; i < n; i++) {
      const j = i * 7, j0 = j - 7;
      const pm = l < 0 ? 0.5 : 0.5 + 0.5 * L.smooth((NZ.n2(Q[j + 6] / 120, k + 40 + l * 9.7) + 0.52) / 0.3);
      const v = Math.round(255 * L.clamp(Q[j + 5] * pm));
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = Q[j + 4] * wf;
      g.beginPath();
      g.moveTo(Q[j0] + Q[j0 + 2] * Q[j0 + 4] * of, Q[j0 + 1] + Q[j0 + 3] * Q[j0 + 4] * of);
      g.lineTo(Q[j] + Q[j + 2] * Q[j + 4] * of, Q[j + 1] + Q[j + 3] * Q[j + 4] * of);
      g.stroke();
    }
  }
}
const seg = (g, x0, y0, x1, y1, o) => mark(g, [[x0, y0], [x1, y1]], o);

function buildPressure(env, G) {
  const a = env.arc, s = a.span(PAD + 90), st = G.step;
  const P = (th, dr) => { const q = a.pt(th, dr); return [q.x, q.y]; };
  const r = L.rng('s07draw');
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, SW, SH);
    g.globalCompositeOperation = 'lighten'; g.lineCap = 'round';

    // ── radii: struck from the centre through a joint, running on below the arch and off the sheet ──
    FAN.forEach((hk, i) => {
      const th = hk * st + r.range(-0.002, 0.002);
      const low = i === 3 ? -372 : -900;
      mark(g, [P(th, RING + r.range(6, 18)), P(th + r.range(-0.0012, 0.0012), low)], { w: r.range(12, 13), p: r.range(0.95, 1), wob: 0.6, lift: [0, i === 3 ? 70 : 0] });
    });
    // the centre line of the span: long dash – dot, from the crown down
    for (let y = a.crestY + 34; y < H + PAD + 20; y += 252) {
      seg(g, a.cx + r.range(-1, 1), y, a.cx + r.range(-1, 1), y + 176, { w: 9.5, p: 0.9, wob: 0.5, lift: [10, 14] });
      seg(g, a.cx, y + 176 + 31, a.cx, y + 176 + 44, { w: 10, p: 0.9, wob: 0.3 });
    }
    // an earlier try at a radius, wiped off with the hand — its ghost stays in the tooth
    mark(g, [P(-1.6 * st, 16), P(-1.585 * st, -620)], { w: 9, p: 0.42, wob: 0.8 });
    mark(g, [P(-1.37 * st, -4), P(-1.39 * st, -450)], { w: 8, p: 0.36, wob: 0.8, lift: [0, 120] });
    // draughtsman's slashes across two radii
    { const q = P(-2.5 * st, -214), an = -2.5 * st - 0.82; seg(g, q[0] - Math.cos(an) * 54, q[1] - Math.sin(an) * 54, q[0] + Math.cos(an) * 54, q[1] + Math.sin(an) * 54, { w: 11.5, p: 0.97, wob: 0.4 }); }
    { const q = P(3.5 * st, -128), an = 3.5 * st - 0.74; seg(g, q[0] - Math.cos(an) * 48, q[1] - Math.sin(an) * 48, q[0] + Math.cos(an) * 48, q[1] + Math.sin(an) * 48, { w: 11, p: 0.95, wob: 0.4 }); }
    // radius arrow touching the intrados from below
    { const th = 1.5 * st, q = P(th, -13), inx = -Math.sin(th), iny = Math.cos(th);
      for (const sg of [-1, 1]) { const c = Math.cos(sg * 0.42), sn = Math.sin(sg * 0.42); seg(g, q[0], q[1], q[0] + (inx * c - iny * sn) * 62, q[1] + (inx * sn + iny * c) * 62, { w: 10, p: 0.97, wob: 0.3, lift: [0, 14] }); } }

    // ── main arch ring: voussoir joints, extrados, intrados ──
    const kMax = Math.ceil(s / st) + 1;
    for (let k = -kMax; k < kMax; k++) {
      const hk = k + 0.5; if (FAN.includes(hk)) continue;
      const th = hk * st + r.range(-0.0032, 0.0032);
      mark(g, [P(th, r.range(-6, 3)), P(th + r.range(-0.002, 0.002), RING + r.range(-4, 13))], { w: r.range(7.6, 9), p: r.range(0.82, 0.94), wob: 0.6 });
    }
    // the ring is shaded with the side of the stick: broad, light, leaning strokes that only catch the tooth
    g.save(); a.clipBand(g, RING - 7, 9, -s, s);
    for (let x = -PAD - 120, i = 0; x < W + PAD + 40; x += r.range(40, 58), i++) {
      const yb = a.yAt(L.clamp(x, -PAD, W + PAD), 0) + 14, yt = yb - RING - 30;
      seg(g, x, yb, x + (yb - yt) * 0.5 + r.range(-7, 7), yt, { w: r.range(26, 36), p: r.range(0.3, 0.4), wob: 2.5, lanes: 4, steady: 1 });
    }
    g.restore();
    mark(g, L.arcPts(a, RING, -s, s, 150), { w: 8.8, p: 0.86, wob: 1.3 });
    mark(g, L.arcPts(a, 0, -s, s, 240), { w: 18, p: 1, wob: 0.7, lanes: 4 });
    mark(g, L.arcPts(a, 4, -s, -0.13, 90), { w: 8, p: 0.7, wob: 1.2, lift: [0, 90] });   // the line was gone over twice
    mark(g, L.arcPts(a, -3.5, 0.07, 0.3, 60), { w: 7, p: 0.64, wob: 1.2, lift: [60, 80] });

    // ── open spandrels: two small arches on each shoulder ──
    for (const A of G.arches) {
      for (const x of [A.xL, A.xR]) { const yb = G.yExt(x); if (yb - A.springY > 9) seg(g, x, A.springY - 2, x + r.range(-1.5, 1.5), yb + r.range(0, 5), { w: 9.5, p: 0.92, wob: 0.4 }); }
      mark(g, archPts(A, A.r2, 26), { w: 6.6, p: 0.8, wob: 1 });
      mark(g, archPts(A, A.r, 26), { w: 10.5, p: 0.97, wob: 0.8 });
    }

    // ── deck line and a row of balustrade posts ──
    const top = [];
    for (let x = -PAD - 60; x <= W + PAD + 60; x += 80) top.push([x, G.yDeck(x)]);
    mark(g, top, { w: 10, p: 0.94, wob: 0.8 });
    const nPost = Math.ceil((W / 2 + PAD + 60) / POST_SP);
    for (let k = -nPost; k <= nPost; k++) {
      const x = a.cx + k * POST_SP + r.range(-8, 8), yb = G.yDeck(x), hh = POST_H + r.range(-6, 7);
      seg(g, x + r.range(-2.5, 2.5), yb - hh, x, yb - 3, { w: r.range(8.6, 10.4), p: r.range(0.84, 0.96), wob: 0.4 });
    }

    // ── the one label, chalked by hand above the left shoulder, with its leader down to the ring ──
    L.text(g, '安济桥', 352, 166, { font: 'brush', size: 124, weight: 400, color: 'rgb(238,238,238)', spacing: 22, rotate: -0.035, stroke: { color: 'rgb(200,200,200)', width: 1.4 } });
    seg(g, 128, 262, 604, 245, { w: 10, p: 0.93, wob: 0.8, lift: [40, 0] });
    seg(g, 604, 245, 806, 468, { w: 9.5, p: 0.93, wob: 0.6, lift: [0, 30], steady: 1 });
    seg(g, 802, 464, 811, 473, { w: 19, p: 0.98, wob: 0, lanes: 2, steady: 1 });
  });
}

// ───────────────────────── smears: chalk dust dragged by the hand / the duster ─────────────────────────
function buildSmear(env, G) {
  const a = env.arc, st = G.step;
  const c = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, SW, SH);
    g.globalCompositeOperation = 'lighten';
    const blob = (x, y, rx, ry, ang, v) => {
      g.save(); g.translate(x, y); g.rotate(ang); g.scale(rx, ry);
      const c0 = Math.round(v * 255), c1 = Math.round(v * 150);
      g.fillStyle = L.radial(g, 0, 0, 0, 1, [[0, `rgb(${c0},${c0},${c0})`], [0.55, `rgb(${c1},${c1},${c1})`], [1, '#000']]);
      g.beginPath(); g.arc(0, 0, 1, 0, L.TAU); g.fill(); g.restore();
    };
    // where the ghost radius was wiped away
    const q = a.pt(-1.5 * st, -250);
    blob(q.x, q.y, 120, 330, -1.5 * st, 0.36);
    blob(q.x + 40, q.y + 150, 200, 150, -0.5, 0.26);
    // the heel of the hand resting above the deck, and a sleeve dragged across the lower right
    blob(1490, 170, 330, 110, -0.3, 0.27);
    blob(1420, 930, 380, 120, -0.22, 0.25);
    blob(250, 250, 240, 90, -0.4, 0.2);
  });
  // break the smears into streaks along the wipe
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply';
  g.translate(SW / 2, SH / 2); g.rotate(-0.3);
  g.drawImage(L.noiseTex(SW + 700, SH + 900, { seed: 's07wipe', scale: 22, sx: 14, sy: 1, octaves: 3, res: 0.25, contrast: 1.7, ramp: [[0, '#3a3a3a'], [0.5, '#b0b0b0'], [1, '#fff']] }), -SW / 2 - 350, -SH / 2 - 450);
  return c;
}

// ───────────────────────── wear: folds and scuffs ─────────────────────────
// two folds, a hair off the vertical / horizontal
const CR = [
  { x0: 1296, y0: -PAD, x1: 1338, y1: H + PAD },
  { x0: -PAD, y0: 902, x1: W + PAD, y1: 874 },
];
function buildWear() {
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, SW, SH);
    g.globalCompositeOperation = 'lighten'; g.lineCap = 'round';
    // pigment rubbed off along the ridge of each fold
    for (const c of CR) { seg(g, c.x0, c.y0, c.x1, c.y1, { w: 5, p: 0.74, wob: 1.6 }); seg(g, c.x0, c.y0, c.x1, c.y1, { w: 13, p: 0.34, wob: 2.4 }); }
    // scuffed where the folds cross, and a few patches where the sheet rubbed in the drawer
    const blob = (x, y, rad, v) => { const c0 = Math.round(v * 255); g.fillStyle = L.radial(g, x, y, 0, rad, [[0, `rgb(${c0},${c0},${c0})`], [1, '#000']]); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
    blob(1332, 883, 150, 0.5);
    const r = L.rng('s07scuff');
    for (let i = 0; i < 7; i++) blob(r.range(0, W), r.range(0, H), r.range(90, 240), r.range(0.2, 0.34));
  });
}
function creaseShade(g, c) {
  const len = Math.hypot(c.x1 - c.x0, c.y1 - c.y0), ang = Math.atan2(c.y1 - c.y0, c.x1 - c.x0);
  g.save(); g.translate(c.x0, c.y0); g.rotate(ang);
  // the sheet no longer lies flat: a broad soft roll of light either side of the fold…
  g.fillStyle = L.linear(g, 0, -190, 0, 190, [[0, 'rgba(150,205,255,0)'], [0.5, 'rgba(150,205,255,0.1)'], [0.5, 'rgba(2,20,56,0.17)'], [1, 'rgba(2,20,56,0)']]);
  g.fillRect(0, -190, len, 380);
  // …and the ridge itself
  g.fillStyle = L.linear(g, 0, -7, 0, 7, [[0, 'rgba(190,225,255,0)'], [0.42, 'rgba(190,225,255,0.26)'], [0.5, 'rgba(2,20,56,0.4)'], [0.7, 'rgba(2,20,56,0.1)'], [1, 'rgba(2,20,56,0)']]);
  g.fillRect(0, -7, len, 14);
  g.restore();
}

// ───────────────────────── develop: pressure × tooth → chalk ─────────────────────────
function develop(press, dust, wearMap, T, F) {
  const rd = (c) => c.getContext('2d').getImageData(0, 0, SW, SH).data;
  const ed = rd(press), dd = rd(dust), wd = rd(wearMap);
  const ci = new ImageData(SW, SH), wi = new ImageData(SW, SH), cd = ci.data, wo = wi.data;
  const mk = TN - 1;
  for (let y = 0, i = 0; y < SH; y++) {
    const ty = (y & mk) * TN, ty2 = ((y + 389) & mk) * TN, ty3 = ((y + 97) & mk) * TN;
    for (let x = 0; x < SW; x++, i += 4) {
      let ca = 0;
      const e = ed[i];
      if (e > 8) {
        // the body of the line: chalk catches wherever the pressure beats the tooth
        const d = e * (1.14 / 255) - T[ty + (x & mk)] - 0.055 * F[ty3 + ((x + 57) & mk)];
        const c = d * 12 + 0.5;
        if (c > 0) {
          let body = 0.52 + d * 2.3; if (body > 1) body = 1;            // thin deposits let the blue through
          const hole = -(0.75 + d * 4.2) - F[ty3 + ((x + 211) & mk)];   // pinholes, mostly toward the edges
          if (hole > 0) body *= 1 - (hole > 0.4 ? 0.4 : hole) * 1.9;
          ca = (c > 1 ? 1 : c) * body;
        }
      }
      const dv = dd[i];
      if (dv > 10) {
        // loose dust: pin-point specks, thick beside a line and thinning away from it
        const c = (F[ty2 + ((x + 333) & mk)] - (2.6 - dv * (5.6 / 255))) * 2.4;
        if (c > 0) { const c2 = (c > 1 ? 1 : c) * 0.9; if (c2 > ca) ca = c2; }
      }
      if (ca > 0) { cd[i] = CHALK[0]; cd[i + 1] = CHALK[1]; cd[i + 2] = CHALK[2]; cd[i + 3] = 255 * ca; }
      const wv = wd[i];
      if (wv > 8) {
        const c = (wv / 255 - T[ty2 + ((x + 571) & mk)]) * 9 + 0.5;
        if (c > 0) { wo[i] = 104; wo[i + 1] = 168; wo[i + 2] = 226; wo[i + 3] = 150 * (c > 1 ? 1 : c); }
      }
    }
  }
  const chalk = L.makeCanvas(SW, SH), wear = L.makeCanvas(SW, SH);
  chalk.getContext('2d').putImageData(ci, 0, 0); wear.getContext('2d').putImageData(wi, 0, 0);
  return { chalk, wear };
}

export default {
  name: '赵州桥蓝图',
  tone: 'light',
  init(env) {
    NZ = L.makeNoise('s07hand'); SID = 0;
    const G = makeGeo(env.arc);
    const { T, F, grain } = buildTooth();
    const sheet = buildPaper(grain);
    const marks = buildPressure(env, G);
    const smear = buildSmear(env, G);
    const wearMap = buildWear();

    // pressure field: soft-edged marks × uneven pressure
    const E = L.makeCanvas(SW, SH), eg = E.getContext('2d', { willReadFrequently: true });
    eg.fillStyle = '#000'; eg.fillRect(0, 0, SW, SH);
    eg.filter = 'blur(1.6px)'; eg.drawImage(marks, 0, 0); eg.filter = 'none';
    eg.globalCompositeOperation = 'multiply';
    eg.drawImage(L.noiseTex(SW, SH, { seed: 's07press', scale: 130, octaves: 3, gain: 0.55, res: 0.15, contrast: 1.6,
      ramp: [[0, '#8a8a8a'], [0.26, '#cecece'], [0.44, '#f8f8f8'], [1, '#ffffff']] }), 0, 0);
    // the folds take the chalk with them
    eg.lineCap = 'round'; eg.filter = 'blur(2px)';
    for (const c of CR) { eg.strokeStyle = '#787878'; eg.lineWidth = 6; eg.beginPath(); eg.moveTo(c.x0 + PAD, c.y0 + PAD); eg.lineTo(c.x1 + PAD, c.y1 + PAD); eg.stroke(); }
    eg.filter = 'none';
    // crumbs break off right beside a line
    eg.globalCompositeOperation = 'lighten'; eg.globalAlpha = 0.34; eg.filter = 'blur(5px)'; eg.drawImage(marks, 0, 0); eg.filter = 'none';
    eg.globalAlpha = 1; eg.globalCompositeOperation = 'source-over';
    // dust field: what the marks shed beside themselves, plus what the hand dragged about
    const D = L.makeCanvas(SW, SH), dg = D.getContext('2d', { willReadFrequently: true });
    dg.fillStyle = '#000'; dg.fillRect(0, 0, SW, SH);
    dg.globalAlpha = 0.5; dg.filter = 'blur(6px)'; dg.drawImage(marks, 0, 0); dg.filter = 'none';
    dg.globalCompositeOperation = 'lighten'; dg.globalAlpha = 0.6; dg.drawImage(smear, 0, 0);

    const { chalk, wear } = develop(E, D, wearMap, T, F);

    // flatten: paper → wear → smeared film of chalk → dust veil → chalk → folds
    const g = sheet.getContext('2d');
    g.drawImage(wear, 0, 0);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.24; g.drawImage(smear, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.16; g.drawImage(L.blurred(chalk, 5), 0, 0);
    g.globalAlpha = 1; g.drawImage(chalk, 0, 0);
    g.save(); g.translate(PAD, PAD); for (const c of CR) creaseShade(g, c); g.restore();

    // shallow focus, as if shot close and a little askew: the arch and the label are sharp, the far (top-right)
    // corner and the near (bottom-left) corner fall off
    const soft = L.blurred(sheet, 5), bg = soft.getContext('2d');
    const mask = L.makeLayer(PAD, (mg) => {
      const blob = (x, y, r0, r1, al) => { mg.fillStyle = L.radial(mg, x, y, r0, r1, [[0, `rgba(0,0,0,${al})`], [1, 'rgba(0,0,0,0)']]); mg.fillRect(-PAD, -PAD, SW, SH); };
      blob(W + 140, -160, 260, 900, 1); blob(-200, H + 220, 240, 820, 1); blob(W + 200, H + 260, 200, 640, 0.8);
    });
    bg.globalCompositeOperation = 'destination-in'; bg.drawImage(mask, 0, 0);
    g.drawImage(soft, 0, 0);

    sheet._pad = PAD;
    S = { sheet };
  },
  draw(ctx, env, p) {
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H);
    // the camera pushes in across the sheet; zoom passes through 1.0 mid-shot so the arch stays on the shared arc
    const zoom = L.lerp(0.9756, 1.0244, p), rot = L.lerp(-0.0045, 0.0045, p);
    L.blit(ctx, env, S.sheet, { rot, zoom });
    // fixed raking light from the upper left — the sheet slides underneath it
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = L.radial(ctx, 520, 200, 0, 1700, [[0, 'rgba(255,255,255,0.26)'], [0.5, 'rgba(255,255,255,0.03)'], [1, 'rgba(0,16,60,0.3)']]);
    ctx.fillRect(0, 0, W, H); ctx.restore();
  },
};
