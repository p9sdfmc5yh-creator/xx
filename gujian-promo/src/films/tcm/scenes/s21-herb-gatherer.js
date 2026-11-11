// s21 — 采药人剪影. Dusk on a mountain ridge, shot long and low so that only a short run of the crest is in frame.
// The arc is the ridge line: lumpy soil and turf in near-black, backlit by the afterglow that hangs behind it on the left.
// The herb gatherer is present through his kit, set down on the crest in the left third: a bamboo pack basket (背篓)
// with the day's cuttings standing out of its mouth, and his short hoe (药锄) left biting the ground beside it.
// To the right the crest is bare except for a few clumps of long grass that fall out of focus toward the frame edge.
// Above: nothing but the sky — orange beside the ridge on the left, sinking upward and rightward into carmine,
// deep purple and near black.
//
// Layers: the sky is shaded once in float (coarse grid → bilinear → dither, so the long dark gradients do not band)
// and never moves. Everything on the ridge is one band-shaped layer (silhouettes → rim light → depth of field →
// light wrap) that slides along the arc with `rot`; its lower edge dissolves into a still copy baked into the base.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
const CT = 40, CB = 1010;       // rows of the frame covered by the moving band
const LW = W + PAD * 2, BH = CB - CT;
const INK = '#0a0507';          // 剪影黑
const U0 = -590;                // where the afterglow sits: px of arc length from the crest (negative = left)
const BX = 424, BS = 1.22;      // the pack basket: where it stands, and its scale
const HX = 208, HS = 1.22;      // the hoe: where its blade enters the ground, and its scale
let S = null;

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** a band-shaped work canvas; inside `draw` use frame coordinates */
function bandLayer(draw) {
  const c = L.makeCanvas(LW, BH), g = c.getContext('2d');
  g.translate(PAD, -CT);
  if (draw) draw(g);
  return c;
}
/** run fn on a canvas in raw pixel space, whatever transform its context carries */
function raw(c, fn) { const g = c.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); fn(g); g.restore(); return c; }
/** blurred copy; only columns x0..x1 (frame px) are needed */
function blurPart(src, px, x0 = -PAD, x1 = W + PAD) {
  const c = L.makeCanvas(src.width, src.height), g = c.getContext('2d'), m = Math.ceil(px * 3);
  const sx = Math.max(0, x0 + PAD - m), sw = Math.min(src.width, x1 + PAD + m) - sx;
  g.filter = `blur(${px}px)`; g.drawImage(src, sx, 0, sw, src.height, sx, 0, sw, src.height); g.filter = 'none';
  return c;
}

// ───────────────────────── sky ─────────────────────────
function lut(stops, n = 1024) {
  const f = L.makeRamp(stops), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

function buildSky(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const N = 1024;
  // body of the dusk: near black → 绛紫 → 胭脂 → a warmer carmine next to the ridge
  const LB = lut([[0, '#040106'], [0.1, '#10040d'], [0.3, '#340d2b'], [0.5, '#6b1a33'], [0.72, '#9d2933'], [1, '#c63a2a']], N);
  // the afterglow: carmine → 霞橙 → a hotter core hugging the ridge
  const LO = lut([[0, '#c63a2a'], [0.42, '#e4481f'], [0.74, '#f2541b'], [1, '#ff7a2a']], N);
  const nz = L.makeNoise('s21haze');
  // shade on a coarse grid in float …
  const GS = 8, gw = Math.ceil(W / GS) + 2, gh = Math.ceil(H / GS) + 2, F = new Float32Array(gw * gh * 3);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * GS, y = j * GS, ddx = x - cx, ddy = cy - y, rr = Math.sqrt(ddx * ddx + ddy * ddy);
    const dr = rr > R ? rr - R : 0, u = Math.atan2(ddx, ddy) * R;
    const hv = nz.fbm(x / 1100, y / 380, 3);                   // very slow haze, keeps the gradient from looking computed
    const lat = sm((u + 900) / 1900);                          // 0 far left → 1 far right
    // carmine body: tall and warm on the left, thinning upward and to the right
    let B = (1 - 0.58 * lat) * Math.exp(-Math.pow(dr / L.lerp(900, 560, lat), 1.3)) + 0.03 * hv;
    // orange afterglow: a wide oval lying along the ridge …
    const du = u - U0, d2 = du * du, sg = du < 0 ? 900 : 430;
    let O = Math.exp(-d2 / (sg * sg)) * Math.exp(-Math.pow(dr / 320, 1.25)) * (1 + 0.06 * hv);
    // … with a hotter seam right on the crest where the sun went down
    const s2 = du < 0 ? 560 : 300;
    const hot = Math.exp(-d2 / (s2 * s2)) * Math.exp(-dr / 84) * 0.8;
    const k = sm((O * 1.1 - 0.05) / 0.85);
    B = B < 0 ? 0 : B > 1 ? 1 : B; O = O < 0 ? 0 : O > 1 ? 1 : O;
    const bi = ((B * (N - 1)) | 0) * 3, oi = ((O * (N - 1)) | 0) * 3;
    let cr = LB[bi] + (LO[oi] - LB[bi]) * k, cg = LB[bi + 1] + (LO[oi + 1] - LB[bi + 1]) * k, cb = LB[bi + 2] + (LO[oi + 2] - LB[bi + 2]) * k;
    cr += (255 - cr) * hot; cg += (166 - cg) * hot; cb += (82 - cb) * hot;
    const o = (j * gw + i) * 3; F[o] = cr; F[o + 1] = cg; F[o + 2] = cb;
  }
  // … then interpolate per pixel and dither
  const c = L.makeCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  let seed = 0x2545f491 | 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 8) / 16777216; };
  for (let y = 0; y < H; y++) {
    const fy = y / GS, j0 = fy | 0, ty = fy - j0, r0 = j0 * gw * 3, r1 = r0 + gw * 3;
    for (let x = 0; x < W; x++) {
      const fx = x / GS, i0 = fx | 0, tx = fx - i0, k0 = r0 + i0 * 3, k1 = r1 + i0 * 3;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const n = (rnd() + rnd() - 1) * 1.6, o = (y * W + x) * 4;
      d[o] = F[k0] * w00 + F[k0 + 3] * w10 + F[k1] * w01 + F[k1 + 3] * w11 + n;
      d[o + 1] = F[k0 + 1] * w00 + F[k0 + 4] * w10 + F[k1 + 1] * w01 + F[k1 + 4] * w11 + n * 0.8;
      d[o + 2] = F[k0 + 2] * w00 + F[k0 + 5] * w10 + F[k1 + 2] * w01 + F[k1 + 5] * w11 + n * 0.9;
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ───────────────────────── small drawing helpers ─────────────────────────
/** a single tapered grass blade standing at (x,y). ang: lean from vertical (rad, + = right); curl: extra bend toward the tip */
function blade(g, x, y, ang, len, w, curl) {
  const s0 = Math.sin(ang), c0 = Math.cos(ang), s1 = Math.sin(ang + curl), c1 = Math.cos(ang + curl);
  const mx = x + s0 * len * 0.55, my = y - c0 * len * 0.55;
  const tx = mx + s1 * len * 0.5, ty = my - c1 * len * 0.5;
  const px = c0 * w * 0.5, py = s0 * w * 0.5;
  g.beginPath();
  g.moveTo(x - px, y - py);
  g.quadraticCurveTo(mx - px * 0.7, my - py * 0.7, tx, ty);
  g.quadraticCurveTo(mx + px * 0.7, my + py * 0.7, x + px, y + py);
  g.closePath(); g.fill();
}
/** a long arching grass leaf whose direction turns by `curl` along its length; past `kinkT` it is folded over by `kinkA` */
function leaf(g, x, y, ang, len, w, curl, kinkT = 2, kinkA = 0) {
  const n = 14, Lp = [], Rp = [];
  let px = x, py = y;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a2 = ang + curl * Math.pow(t, 1.6) + (t > kinkT ? kinkA : 0);
    const hw = (w / 2) * Math.pow(1 - t, 0.7) * (0.72 + 0.28 * Math.min(1, t * 5));
    const nx = Math.cos(a2), ny = Math.sin(a2);
    Lp.push([px - nx * hw, py - ny * hw]); Rp.push([px + nx * hw, py + ny * hw]);
    px += (Math.sin(a2) * len) / n; py -= (Math.cos(a2) * len) / n;
  }
  g.beginPath(); g.moveTo(Lp[0][0], Lp[0][1]);
  for (let i = 1; i <= n; i++) g.lineTo(Lp[i][0], Lp[i][1]);
  for (let i = n; i >= 0; i--) g.lineTo(Rp[i][0], Rp[i][1]);
  g.closePath(); g.fill();
}
/** tapered limb through pts, width w0 → w1, slightly knobbly (a hand-cut stick, not a ruled line) */
function limb(g, pts, w0, w1, seed) {
  const p = L.smoothPath(pts, 3), n = p.length;
  const nz = L.makeNoise('limb' + seed);
  const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const t = i / (n - 1);
    const hw = Math.max(0.5, (L.lerp(w0, w1, t) * (1 + 0.1 * nz.n2(t * 5, 1.3))) / 2);
    A.push([p[i][0] + nx * hw, p[i][1] + ny * hw]); B.push([p[i][0] - nx * hw, p[i][1] - ny * hw]);
  }
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}
/** one lance-shaped leaf growing from (x,y) in direction ang */
function lance(g, x, y, ang, len, wid, bow) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.22, -wid * 0.8 + bow, len * 0.68, -wid * 0.5 + bow, len, bow * 1.3);
  g.bezierCurveTo(len * 0.7, wid * 0.42 + bow, len * 0.25, wid * 0.62 + bow * 0.5, 0, 0);
  g.fill(); g.restore();
}

// ───────────────────────── the ridge ─────────────────────────
function makeEdge() {
  const nz = L.makeNoise('s21edge');
  // billowy: rounded clods of every size shouldering each other, sharp little gaps between them — never far from the arc
  return (u) => {
    const big = Math.abs(nz.n2(u / 150, 0.3)), mid = Math.abs(nz.n2(u / 52, 7.7)), sml = Math.abs(nz.n2(u / 17, 3.1));
    return -6.5 + 9 * Math.pow(big, 0.8) + 4.5 * mid + 2 * sml + 2 * nz.n2(u / 420, 9.9);
  };
}
function bodyPath(g, a, edge, off = 0) {
  const s = a.span(PAD + 170), n = Math.ceil((2 * s * a.R) / 2);
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const th = L.lerp(-s, s, i / n), q = a.pt(th, edge(th * a.R) + off);
    if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
  }
  g.lineTo(W + PAD + 500, H + PAD + 60); g.lineTo(-PAD - 500, H + PAD + 60); g.closePath();
}
/** a few separate stones lying on the crest: no two alike, well spaced */
function drawStones(g, a, edge) {
  const r = L.rng('s21stones'), um = a.span(PAD + 160) * a.R;
  for (let u = -um + r.range(0, 80); u < um; u += r.range(50, 230)) {
    const rad = r.range(9, 24), ry = rad * r.range(0.6, 0.9), th = u / a.R;
    const q = a.pt(th, edge(u) + L.clamp(ry * r.range(0.3, 0.75), 2, 8) - ry);
    g.beginPath(); g.ellipse(q.x, q.y, rad * r.range(1.1, 1.8), ry, th + r.gauss() * 0.3, 0, L.TAU); g.fill();
  }
}
/** short turf along the whole crest: patchy, thin on the bare top under the text */
function drawTurf(g, a, edge) {
  const r = L.rng('s21turf'), nz = L.makeNoise('s21dens');
  const um = a.span(PAD + 150) * a.R;
  for (let u = -um; u < um; u += 3.4) {
    const d = 0.5 + 0.5 * nz.n2(u / 120, 1.1);
    const calm = L.lerp(0.5, 1, sm((Math.abs(u) - 290) / 240));
    if (!r.chance((0.06 + 0.7 * d * d) * (0.45 + 0.55 * calm))) continue;
    const uu = u + r.range(-1.5, 1.5), q = a.pt(uu / a.R, edge(uu) - 2);
    const len = (7 + 30 * d * Math.pow(r(), 1.4)) * calm;
    blade(g, q.x, q.y, r.gauss() * 0.36 + 0.14, len, r.range(2, 3.8), r.gauss() * 0.5);
  }
}
/** a drooping, bristly seed head on a thin stalk (狗尾草一类的野草穗) */
function seedStalk(g, x, y, ang, len, curl, r) {
  const n = 16; let px = x, py = y, a2 = ang;
  g.lineCap = 'round'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(px, py);
  for (let k = 1; k <= n; k++) { a2 = ang + curl * Math.pow(k / n, 2); px += (Math.sin(a2) * len) / n; py -= (Math.cos(a2) * len) / n; g.lineTo(px, py); }
  g.stroke();
  const hl = len * r.range(0.25, 0.34), hn = 11, fat = r.range(4.8, 6.4);
  for (let k = 0; k <= hn; k++) {
    const t = k / hn; a2 += curl * 0.1;
    const rad = fat * Math.sin(Math.PI * (0.1 + 0.86 * Math.pow(t, 0.75)));
    g.beginPath(); g.ellipse(px, py, rad, rad * 1.3, a2, 0, L.TAU); g.fill();
    g.lineWidth = 0.9; g.beginPath();
    for (let b = 0; b < 5; b++) {
      const ba = a2 + r.sign() * r.range(0.3, 0.85), bl = rad + r.range(5, 11);
      g.moveTo(px, py); g.lineTo(px + Math.sin(ba) * bl, py - Math.cos(ba) * bl);
    }
    g.stroke();
    px += (Math.sin(a2) * hl) / hn; py -= (Math.cos(a2) * hl) / hn;
  }
}
/** a clump of long grass leaves fanning out of one root: few, broad, each bent its own way, some folded over */
function clump(g, x, y, size, seed, { stalks = 0, spread = 1.1, lean = 0 } = {}) {
  const r = L.rng('cl' + seed), n = r.int(8, 12);
  for (let i = 0; i < n; i++) {
    const off = r.range(-spread, spread) * (0.35 + 0.65 * r()), ang = lean + off;
    const len = size * r.range(0.4, 1) * (1 - 0.22 * Math.abs(off));
    const kink = r.chance(0.24);
    leaf(g, x + r.range(-0.07, 0.07) * size, y + 4, ang, len, size * r.range(0.036, 0.07) + 1.6,
      off * r.range(0.5, 1.4) + r.gauss() * 0.18 + 0.1, kink ? r.range(0.45, 0.75) : 2, kink ? r.range(0.5, 1.1) * r.sign() : 0);
  }
  for (let i = 0; i < stalks; i++) {
    const ang = lean + r.range(-0.3, 0.38);
    seedStalk(g, x + r.range(-4, 4), y + 2, ang, size * r.range(1.0, 1.28), r.range(0.3, 0.7) * (ang < lean ? -1 : 1), r);
  }
}

// ───────────────────────── the herb gatherer's kit ─────────────────────────
/** a cut leafy stem: bowed, with alternate lance leaves that shrink toward the tip */
function sprig(g, r, x0, y0, ang, len, bend, lf, lw, n) {
  const pts = []; let px = x0, py = y0;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, a2 = ang + bend * t * t;
    pts.push([px, py, a2]);
    px += (Math.sin(a2) * len) / 12; py -= (Math.cos(a2) * len) / 12;
  }
  g.globalAlpha = 1; g.lineCap = 'round'; g.lineWidth = 3; g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke();
  g.globalAlpha = 0.93;                                         // thin leaves let a little of the sky through
  for (let i = 0; i <= n; i++) {
    const t = 0.2 + (0.8 * i) / n, q = pts[Math.min(12, Math.round(t * 12))];
    const side = i === n ? 0 : (i % 2 ? 1 : -1) * r.range(0.55, 1.05);
    const k = (1 - 0.42 * t) * r.range(0.82, 1.14);
    lance(g, q[0], q[1], q[2] - Math.PI / 2 + side, lf * k, lw * k, r.range(-2.5, 2.5));
  }
  g.globalAlpha = 1;
}
/** a bare stalk ending in a loose head of small seed capsules */
function seedHead(g, r, x0, y0, ang, len, bend) {
  let px = x0, py = y0, a2 = ang;
  g.lineCap = 'round'; g.lineWidth = 2.3; g.beginPath(); g.moveTo(px, py);
  for (let i = 1; i <= 12; i++) { a2 = ang + bend * (i / 12) * (i / 12); px += (Math.sin(a2) * len) / 12; py -= (Math.cos(a2) * len) / 12; g.lineTo(px, py); }
  g.stroke();
  const n = r.int(6, 8);
  for (let i = 0; i < n; i++) {
    const ba = a2 + L.lerp(-1.1, 1.1, i / (n - 1)) + r.gauss() * 0.12, bl = r.range(15, 25);
    const ex = px + Math.sin(ba) * bl, ey = py - Math.cos(ba) * bl;
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(px, py); g.lineTo(ex, ey); g.stroke();
    g.beginPath(); g.ellipse(ex, ey, r.range(3.4, 4.8), r.range(4, 5.6), ba, 0, L.TAU); g.fill();
  }
}
const HB = 240;                                                 // basket height in its own units
/** half-width of the basket at height t (0 = foot, 1 = mouth): near-straight body that flares into a wide mouth */
const basketHW = (t) => 62 + 10 * t + 36 * Math.pow(sm((t - 0.35) / 0.65), 1.3);
/** the day's cuttings: laid in aslant, most of them leaning out over the glow side. Origin = centre of the basket's foot */
function drawHerbs(g) {
  const r = L.rng('s21herbs'), y0 = -HB + 2;
  g.fillStyle = INK; g.strokeStyle = INK;
  sprig(g, r, -84, y0, -1.25, 132, -1.3, 46, 16, 5);             // one spilling over the rim
  sprig(g, r, -66, y0, -0.78, 176, -0.5, 56, 19, 6);
  sprig(g, r, -44, y0, -0.5, 214, -0.2, 60, 20, 7);
  sprig(g, r, -18, y0, -0.3, 168, 0.25, 62, 10, 9);              // a narrow-leaved one
  sprig(g, r, 8, y0, -0.06, 196, 0.16, 56, 19, 6);
  sprig(g, r, 44, y0, 0.36, 128, 0.36, 50, 17, 5);
  sprig(g, r, 70, y0, 0.74, 92, 0.5, 44, 15, 4);
  seedHead(g, r, -30, y0, -0.42, 236, 0.2);
  seedHead(g, r, 24, y0, 0.16, 176, 0.3);
}
/** 背篓: bamboo pack basket — wide flared mouth under a rolled rim, open-work band below it, close-woven body, two carrying straps */
function drawBasket(g) {
  const r = L.rng('s21basket'), nz = L.makeNoise('s21bk');
  g.fillStyle = INK; g.strokeStyle = INK;
  const n = 72, Lp = [], Rp = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = -HB * t, sc = t < 0.58 ? 1.3 * Math.sin(((t * HB) / 10) * L.TAU) : 0;     // the weavers show on the outline
    Lp.push([-(basketHW(t) + sc + 2.2 * nz.n2(t * 2.4, 1)), y]);
    Rp.push([basketHW(t) + sc + 2.2 * nz.n2(t * 2.4, 5), y]);
  }
  // carrying straps, hanging slack on the far side
  g.lineCap = 'round';
  g.lineWidth = 8; g.beginPath(); g.moveTo(92, -HB + 6); g.bezierCurveTo(150, -206, 138, -110, 72, -58); g.stroke();
  g.lineWidth = 6.5; g.beginPath(); g.moveTo(74, -HB + 30); g.bezierCurveTo(116, -150, 112, -84, 66, -30); g.stroke();
  // body
  g.beginPath(); g.moveTo(-44, 10); g.quadraticCurveTo(Lp[0][0] - 2, 10, Lp[2][0], Lp[2][1]);
  for (let i = 3; i <= n; i++) g.lineTo(Lp[i][0], Lp[i][1]);
  for (let i = n; i >= 3; i--) g.lineTo(Rp[i][0], Rp[i][1]);
  g.quadraticCurveTo(Rp[0][0] + 2, 10, 44, 10); g.closePath(); g.fill();
  // rolled rim with its cane binding
  const rw = basketHW(1) + 6;
  g.lineWidth = 15; g.beginPath(); g.moveTo(-rw + 6, -HB - 3); g.quadraticCurveTo(0, -HB - 7, rw - 6, -HB - 2); g.stroke();
  for (let x = -rw; x <= rw; x += r.range(7.5, 11)) { g.beginPath(); g.arc(x, -HB - 11.5 + r.range(-0.8, 0.8), r.range(1.8, 3), 0, L.TAU); g.fill(); }
  // open-work band: a diagonal lattice of bamboo strips; where gaps in the near and far walls line up, the sky shows through
  g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  const rows = 13, pitch = 6.6, top = -HB + 15;
  for (let j = 0; j < rows; j++) {
    const y = top + j * pitch, half = basketHW(-y / HB) - 5;
    const fall = j < 9 ? 1 : 1 - (j - 8) / 5;
    for (let k = -11; k <= 11; k++) {
      const phi = (k + (j & 1 ? 0.5 : 0)) * 0.138;
      if (Math.abs(phi) > 1.36) continue;
      const lined = sm((nz.n2(k * 0.3 + 3, j * 0.26) + 0.42) / 0.7);          // patches where the two walls agree
      const open = lined * r.range(0.45, 1) * fall * (phi < 0 ? 1 : 0.8);
      if (open < 0.06) continue;
      const hx = 0.8 + 3.3 * Math.cos(phi), hy = 3.1, x = half * Math.sin(phi);
      g.globalAlpha = Math.min(0.95, open * 1.15);
      g.beginPath(); g.moveTo(x - hx, y); g.lineTo(x, y - hy); g.lineTo(x + hx, y); g.lineTo(x, y + hy); g.closePath(); g.fill();
    }
  }
  // the close weave lower down leaks only pinpricks
  for (let i = 0; i < 26; i++) {
    const t = r.range(0.12, 0.58), phi = r.range(-1.1, 1.1);
    g.globalAlpha = r.range(0.25, 0.75);
    g.beginPath(); g.ellipse((basketHW(t) - 5) * Math.sin(phi), -HB * t, 0.6 + 1.1 * Math.cos(phi), r.range(1, 1.7), 0, 0, L.TAU); g.fill();
  }
  g.restore();
}
/** the weave of the close-woven body, picked out where the glow rakes across its near side */
function lightBasket(g) {
  const r = L.rng('s21weave');
  g.lineCap = 'round';
  for (let y = -8; y > -HB * 0.6; y -= 10) {
    const t = -y / HB, x0 = -basketHW(t) + 1, len = r.range(10, 40) * (0.6 + 0.4 * t);
    g.lineWidth = r.range(1.3, 2.2);
    g.strokeStyle = L.linear(g, x0, 0, x0 + len, 0, [[0, `rgba(255,128,56,${r.range(0.16, 0.4)})`], [1, 'rgba(200,60,30,0)']]);
    g.beginPath(); g.moveTo(x0, y + 1.5); g.quadraticCurveTo(x0 + len * 0.5, y + 3, x0 + len, y + 3.5); g.stroke();
  }
}
/**
 * 药锄: short-handled herb hoe left standing in the ground. Origin = where the blade enters the soil.
 * The narrow blade widens a little toward its edge and runs down and back toward the user;
 * the handle rises from the eye at about 78° to it.
 */
function drawHoe(g) {
  g.fillStyle = INK; g.strokeStyle = INK;
  const E = [50, -58];                                          // the eye
  const hx = -0.886, hy = -0.463;                               // handle direction (toward the grip)
  const P = (d, o = 0) => [E[0] + d * hx - o * hy, E[1] + d * hy + o * hx];
  // handle: a hand-cut stick with a slight bow, a touch thicker toward the head, wedged through the eye
  limb(g, [P(214), P(150, 4), P(80, 4.5), P(0), P(-17)], 11.5, 15.5, 'hoe');
  const G = P(213, 1);
  g.beginPath(); g.ellipse(G[0], G[1], 9, 6.8, Math.atan2(hy, hx), 0, L.TAU); g.fill();     // the worn grip end
  // forged head: the eye with a short poll behind it
  g.save(); g.translate(E[0], E[1]); g.rotate(Math.atan2(0.769, -0.637));
  g.beginPath(); g.moveTo(-17, -9); g.lineTo(6, -12.5); g.lineTo(10, 12.5); g.lineTo(-15, 9.5); g.closePath(); g.fill();
  // blade along +x here: narrow at the eye, flaring to the cutting edge, slightly dished
  g.beginPath(); g.moveTo(4, -9.5);
  g.quadraticCurveTo(48, -9, 88, -17); g.quadraticCurveTo(95, 0, 91, 15);
  g.quadraticCurveTo(50, 5.5, 4, 9.5); g.closePath(); g.fill();
  g.restore();
}

// ───────────────────────── light & lens ─────────────────────────
/** the edge of a silhouette that faces up-left: the layer in white, minus a copy of itself shifted by (dx,dy) */
function rimOf(layer, dx, dy) {
  const c = L.makeCanvas(layer.width, layer.height), g = c.getContext('2d');
  g.drawImage(layer, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(layer, dx, dy);
  g.globalCompositeOperation = 'source-over';
  return c;
}
/** slow blotchy mask (alpha only) so the lit edge comes and goes instead of running as an even line */
function breakMask() {
  const q = 6, mw = Math.ceil(LW / q), mh = Math.ceil(BH / q), c = L.makeCanvas(mw, mh), g = c.getContext('2d');
  const img = g.createImageData(mw, mh), d = img.data, nz = L.makeNoise('s21break');
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const v = 0.5 + 0.5 * nz.fbm(i / 8.5, j / 8.5, 3);
    d[(j * mw + i) * 4 + 3] = 255 * (0.12 + 0.88 * sm((v - 0.3) / 0.4));
  }
  g.putImageData(img, 0, 0);
  return c;
}
/**
 * light wrap: the sky that is NOT hidden by the silhouettes, blurred. Laid back over them it lets the afterglow eat a
 * little into every dark edge — thin things (stems, blades, straps) soak it up, the solid masses stay black inside.
 */
function buildWrap(sky, sil) {
  const c = L.makeCanvas(LW, BH), g = c.getContext('2d');
  g.drawImage(sky, PAD, -CT);
  // stretch the border pixels outward so the blur does not fade toward the frame edges
  g.drawImage(sky, 0, 0, 1, H, 0, -CT, PAD, H); g.drawImage(sky, W - 1, 0, 1, H, W + PAD, -CT, PAD, H);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(sil, 0, 0);
  return L.blurred(c, 8);
}
/** depth of field: sharp from the kit to the crest, falling well out of focus toward the right edge */
function depthOfField(src) {
  const out = L.makeCanvas(LW, BH), og = out.getContext('2d');
  const add = (layer, stops, own) => {
    const c = own ? layer : (() => { const t = L.makeCanvas(LW, BH); t.getContext('2d').drawImage(layer, 0, 0); return t; })();
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = L.linear(g, 0, 0, LW, 0, stops.map(([x, al]) => [(x + PAD) / LW, `rgba(0,0,0,${al})`]));
    g.fillRect(0, 0, LW, BH);
    og.globalCompositeOperation = 'lighter'; og.drawImage(c, 0, 0);
  };
  add(src, [[-100, 1], [1140, 1], [1340, 0], [2020, 0]], false);
  add(blurPart(src, 1.8, 1140, 1580), [[-100, 0], [1140, 0], [1340, 1], [1570, 0], [2020, 0]], true);
  add(blurPart(src, 4.4, 1340, 1890), [[-100, 0], [1340, 0], [1570, 1], [1880, 0], [2020, 0]], true);
  add(blurPart(src, 9, 1570, 2020), [[-100, 0], [1570, 0], [1880, 1], [2020, 1]], true);
  og.globalCompositeOperation = 'source-over';
  return out;
}

// ───────────────────────── assemble the ridge band ─────────────────────────
function buildRidge(env, sky) {
  const a = env.arc, edge = makeEdge();
  const gp = a.pt(U0 / a.R, 0);
  const on = (x, sink = 0) => a.yAt(x) + sink;
  const full = (g) => g.fillRect(-PAD, CT, LW, BH);
  const atBasket = (g, fn) => { g.save(); g.translate(BX, on(BX, 8)); g.rotate(-0.075); g.scale(BS, BS); fn(g); g.restore(); };

  // the kit on its own small canvas (the basket's open work is cut out of it)
  const OX = -60, OY = 40, objs = L.makeCanvas(720, 720), og = objs.getContext('2d');
  og.translate(-OX, -OY);
  atBasket(og, () => { drawHerbs(og); drawBasket(og); });
  og.save(); og.translate(HX, on(HX, 3)); og.rotate(-0.04); og.scale(HS, HS); drawHoe(og); og.restore();

  // 1) one silhouette: ground, turf, grass, kit
  const sil = bandLayer((g) => {
    g.fillStyle = INK; g.strokeStyle = INK;
    bodyPath(g, a, edge); g.fill();
    drawStones(g, a, edge);
    drawTurf(g, a, edge);
    // grass behind the kit, on the glow side
    clump(g, -52, on(-52), 150, 'a', { stalks: 1, lean: 0.2 });
    clump(g, 118, on(118), 66, 'b', { lean: 0.1, spread: 0.9 });
    clump(g, 318, on(318), 78, 'c', { lean: -0.2, spread: 0.9 });
    clump(g, 598, on(598), 56, 'd', { lean: -0.3, spread: 0.8 });
    // the right-hand clumps
    clump(g, 1392, on(1392), 108, 'e', { stalks: 1, lean: 0.1 });
    clump(g, 1462, on(1462), 58, 'f', {});
    clump(g, 1580, on(1580), 170, 'g', { stalks: 2 });
    clump(g, 1700, on(1700), 84, 'h', { lean: 0.15 });
    clump(g, 1812, on(1812), 226, 'i', { stalks: 2, lean: -0.1 });
    clump(g, 1975, on(1975), 200, 'j', { stalks: 1, lean: -0.2 });
    g.drawImage(objs, OX, OY);
    // grass in front of the basket's foot and the hoe
    g.fillStyle = INK; g.strokeStyle = INK;
    clump(g, BX - 62, on(BX - 62), 56, 'k', { spread: 1.2, lean: -0.1 });
    clump(g, BX + 52, on(BX + 52), 64, 'l', { spread: 1.2, lean: 0.1 });
    clump(g, BX + 104, on(BX + 104), 42, 'm', { lean: 0.2 });
    clump(g, HX - 26, on(HX - 26), 44, 'n', { lean: -0.2 });
    const r = L.rng('s21front');
    for (const [x0, x1, n] of [[BX - 96, BX + 100, 50], [HX - 34, HX + 30, 12]]) {
      for (let i = 0; i < n; i++) {
        const x = r.range(x0, x1);
        blade(g, x, on(x, 4), r.gauss() * 0.4 + 0.1, r.range(10, 32), r.range(2, 3.8), r.gauss() * 0.5);
      }
    }
  });

  // 2) light — all of it laid only where the silhouette already is
  const st = [[0, 'rgba(255,206,140,1)'], [0.1, 'rgba(255,150,66,0.96)'], [0.3, 'rgba(240,86,36,0.72)'], [0.6, 'rgba(196,52,44,0.42)'], [1, 'rgba(146,38,54,0.2)']];
  const mask = breakMask();
  const tint = (c, k) => raw(c, (g) => {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = L.radial(g, gp.x + PAD, gp.y - CT, 30, 1750, st.map(([t, col]) => [t, L.rgba(col, k)]));
    g.fillRect(0, 0, LW, BH);
    g.globalCompositeOperation = 'destination-in'; g.imageSmoothingQuality = 'high';
    g.drawImage(mask, 0, 0, LW, BH);
  });
  const rimThin = tint(rimOf(sil, 1.7, 1.9), 0.9);
  const rimSoft = tint(L.blurred(rimOf(sil, 3, 7), 2.4), 0.62);
  const sg = sil.getContext('2d');
  sg.globalCompositeOperation = 'source-atop';
  // inside the mass, close under the crest: a breath of red where the glow wraps over, the sky's purple on the upturned ground …
  sg.save(); bodyPath(sg, a, edge, -3); sg.clip();
  sg.fillStyle = L.radial(sg, gp.x, gp.y, 0, 430, [[0, 'rgba(120,30,16,0.3)'], [0.3, 'rgba(84,18,18,0.14)'], [1, 'rgba(40,8,16,0)']]);
  full(sg);
  sg.fillStyle = L.radial(sg, a.cx, a.cy, a.R - 150, a.R + 4, [[0, 'rgba(48,12,30,0)'], [0.6, 'rgba(48,12,30,0.12)'], [1, 'rgba(72,18,36,0.34)']]);
  full(sg);
  // … and the tops of the clods and tussocks on our side of the ridge, barely catching it
  const r = L.rng('s21lumps'), um = a.span(PAD + 120) * a.R;
  for (let i = 0; i < 420; i++) {
    const u = r.range(-um, um), depth = 6 + 150 * Math.pow(r(), 1.4);
    const near = Math.exp(-((u - U0) * (u - U0)) / (560 * 560));
    const al = (0.07 + 0.2 * near) * Math.pow(1 - depth / 160, 1.2) * r.range(0.4, 1);
    const rad = 7 + depth * 0.2 + 22 * r() * r();
    const q = a.pt(u / a.R, edge(u) - depth);
    const col = near > 0.5 ? '#b83a22' : near > 0.2 ? '#8a2630' : '#5c1a38';
    sg.fillStyle = L.radial(sg, q.x - rad * 0.3, q.y - rad * 0.45, 0, rad, [[0, L.rgba(col, al)], [0.5, L.rgba(col, al * 0.45)], [1, L.rgba(col, 0)]]);
    sg.beginPath(); sg.ellipse(q.x, q.y, rad * r.range(1.1, 1.7), rad, u / a.R, 0, L.TAU); sg.fill();
  }
  sg.restore();
  atBasket(sg, () => lightBasket(sg));
  raw(sil, (g) => { g.globalCompositeOperation = 'source-atop'; g.drawImage(rimSoft, 0, 0); g.drawImage(rimThin, 0, 0); });
  sg.globalCompositeOperation = 'source-over';

  // 3) lens
  const out = depthOfField(sil), g = out.getContext('2d');
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.24; g.drawImage(buildWrap(sky, out), 0, 0); g.globalAlpha = 1;
  // a little veiling flare around the glow itself
  g.fillStyle = L.radial(g, gp.x + PAD, gp.y - CT - 30, 0, 350, [[0, 'rgba(150,44,20,0.22)'], [0.35, 'rgba(110,26,22,0.1)'], [1, 'rgba(60,10,20,0)']]);
  g.fillRect(0, 0, LW, BH);
  g.globalCompositeOperation = 'source-over';
  return out;
}

export default {
  name: '采药人剪影',
  tone: 'light',
  init(env) {
    const a = env.arc, sky = buildSky(env), band = buildRidge(env, sky);
    // still copy of the mass, deep under the crest, baked into the base …
    const base = L.makeCanvas(W, H), g = base.getContext('2d');
    g.drawImage(sky, 0, 0);
    g.save(); a.clipBelow(g, -120); g.fillStyle = INK; g.fillRect(0, 0, W, H); g.drawImage(band, -PAD, CT); g.restore();
    // … and the moving band dissolves into it along its lower edge
    raw(band, (bg) => {
      bg.globalCompositeOperation = 'destination-out';
      bg.fillStyle = L.radial(bg, a.cx + PAD, a.cy - CT, a.R - 200, a.R - 140, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
      bg.fillRect(0, 0, LW, BH);
    });
    S = { base, band };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.drawImage(S.base, 0, 0);                             // the afterglow does not move
    const rot = L.lerp(-0.0055, 0.0065, p);                  // the crest slides along the arc
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.band, -PAD, CT);
  },
};
