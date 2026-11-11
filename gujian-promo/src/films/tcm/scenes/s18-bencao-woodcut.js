// s18 — 本草木刻插图. A leaf from an old herbal, printed from a woodblock: pure black and white.
// The arc is the ground line. Below it, white paper with black knife-cut lines: a fringe of short upright strokes (turf),
// then concentric belts of dots / pebbles / level hatching for the soil, and — cutting through all of them — the fat
// main root of a herb with its side roots spreading out layer by layer along the belts.
// Above the arc the block was left standing, so it prints as a solid field of ink; only a few shoots and leaf tips are
// cut into it as white lines, close to the ground and well clear of the caption zone.
//
// Recipe: draw the whole block as crisp black/white vector art once, then "print" it per pixel three times
// (noisy threshold = ink squash and ragged knife edges, a slow "starvation" field = broken, grey, dry-printed patches,
// salt specks and faint wood grain in the solid black). The three impressions are cycled on twos → the line boils a little.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 40;
const LW = W + PAD * 2, LH = H + PAD * 2;
const INK = '#0a0a0a', PAPER = '#efe9da';
const K = '#000', P = '#fff';            // art canvas: black = ink carrying wood, white = cut away
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixPt = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

// ───────────────────────── knife primitives ─────────────────────────
function poly(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath(); g.fill();
}
/** a stroke as a filled polygon. hw: half width — number | fn(u, i) → number | [sideA, sideB] */
function ribbon(g, pts, hw) {
  const n = pts.length; if (n < 2) return;
  const A = new Array(n), B = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
    let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const h = typeof hw === 'function' ? hw(i / (n - 1), i) : hw;
    const ha = Array.isArray(h) ? h[0] : h, hb = Array.isArray(h) ? h[1] : h;
    A[i] = [pts[i][0] + nx * ha, pts[i][1] + ny * ha]; B[i] = [pts[i][0] - nx * hb, pts[i][1] - ny * hb];
  }
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}
/** resample a curve into short straight facets and nudge every joint: the knife never makes a perfect curve */
function facet(pts, step, amp, r) {
  const p = L.smoothPath(pts, step);
  for (let i = 1; i < p.length - 1; i++) p[i] = [p[i][0] + r.range(-amp, amp), p[i][1] + r.range(-amp, amp)];
  return p;
}

// ───────────────────────── soil belts ─────────────────────────
/** the fringe of short upright strokes hugging the ground line */
function turf(g, a, r, nz, T) {
  const R = a.R; g.fillStyle = K;
  let s = -T * R;
  while (s < T * R) {
    s += 8.7 * (r.chance(0.09) ? 1.7 : 1) + r.range(-0.9, 0.9);
    let len = 58 + 8 * nz.n2(s / 85, 3.1) + 5 * nz.n2(s / 21, 8.7) + r.range(-4, 4);
    if (r.chance(0.08)) len += r.range(5, 11);
    len = Math.min(len, 71);
    const top = 8.5 + r.range(0, 2.4), w0 = r.range(3.5, 5.1), w1 = r.range(1.0, 2.6), lean = r.range(-2.4, 2.4), mk = r.range(-0.8, 0.8);
    const j1 = r.range(-1, 1), j2 = r.range(-1.5, 1.5);
    a.at(g, s / R, 0, () => {
      g.beginPath();
      g.moveTo(-w0 / 2, top); g.lineTo(w0 / 2, top + j1);
      g.lineTo(lean * 0.5 + mk + w0 * 0.42, top + len * 0.5);
      g.lineTo(lean + w1 / 2, top + len); g.lineTo(lean - w1 / 2, top + len + j2);
      g.lineTo(lean * 0.5 + mk - w0 * 0.42, top + len * 0.5);
      g.closePath(); g.fill();
    });
  }
}
/** a concentric line cut as a run of dashes with chiselled ends */
function arcDash(g, a, r, nz, dr, o) {
  const { seg, gap, w, wob = 1.1, T, taper = 0.5, seed = 0 } = o;
  const R = a.R; g.fillStyle = K;
  let s = -T * R - r.range(0, seg[0]);
  while (s < T * R) {
    const len = r.range(seg[0], seg[1]), e = s + len, n = Math.max(2, Math.round(len / 15)), pts = [];
    for (let i = 0; i <= n; i++) {
      const u = L.lerp(s, e, i / n);
      const p = a.pt(u / R, dr + wob * nz.n2(u / 60 + seed * 7.7, seed * 3.1 + dr * 0.13) + r.range(-0.35, 0.35));
      pts.push([p.x, p.y]);
    }
    const ww = r.range(w[0], w[1]) / 2, k0 = r.chance(taper) ? 0.22 : 0.85, k1 = r.chance(taper) ? 0.22 : 0.85, ph = r.range(0, 9);
    ribbon(g, pts, (u) => ww * Math.min(1, k0 + u * (len / 14), k1 + (1 - u) * (len / 14)) * (1 + 0.15 * nz.n2(u * len / 34 + ph, dr * 0.7)));
    s = e + r.range(gap[0], gap[1]);
  }
}
/** staggered rows of knife pecks */
function dotRows(g, a, r, drTop, drBot, rows, pitch, T) {
  const R = a.R; g.fillStyle = K;
  for (let j = 0; j < rows; j++) {
    const dr = L.lerp(drTop, drBot, rows === 1 ? 0.5 : j / (rows - 1));
    for (let s = -T * R + (j % 2) * pitch * 0.5; s < T * R; s += pitch) {
      if (r.chance(0.06)) continue;
      const rot = r.range(-0.5, 0.5), w = r.range(5.4, 8), h = r.range(6.5, 10), kind = r(), q1 = r.range(-1, 1), q2 = r.range(-1.2, 1.2);
      a.at(g, (s + r.range(-2.2, 2.2)) / R, dr + r.range(-1.6, 1.6), () => {
        g.rotate(rot);
        g.beginPath();
        if (kind < 0.72) { g.moveTo(-w / 2, -h * 0.4); g.lineTo(w / 2, -h * 0.45 + q1); g.lineTo(q2, h * 0.6); }
        else { g.moveTo(-w * 0.48, -1); g.lineTo(0, -h * 0.44); g.lineTo(w * 0.48, 0); g.lineTo(0.5, h * 0.44); }
        g.closePath(); g.fill();
      });
    }
  }
}
/** a course of pebbles: outlined, heavier on the lower right, a dab of contour inside */
function pebbleRow(g, a, r, drMid, hgt, T) {
  const R = a.R;
  let s = -T * R;
  while (s < T * R) {
    const rx = r.range(15, 26), ry = hgt * r.range(0.38, 0.5);
    s += rx;
    const rot = r.range(-0.12, 0.12), ph = r.range(0, 6.28), dab = r.chance(0.7), n = 10, out = [], inn = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * L.TAU, k = 1 + 0.12 * Math.sin(t * 2 + ph) + r.range(-0.07, 0.07);
      const wl = 3.1 + (Math.sin(t - 0.5) > 0 ? 1.7 : 0);
      out.push([Math.cos(t) * rx * k, Math.sin(t) * ry * k]);
      inn.push([Math.cos(t) * (rx * k - wl), Math.sin(t) * (ry * k - wl)]);
    }
    a.at(g, s / R, drMid + r.range(-2, 2), () => {
      g.rotate(rot);
      g.fillStyle = K; poly(g, out); g.fillStyle = P; poly(g, inn);
      if (dab) { g.fillStyle = K; ribbon(g, [[-rx * 0.38, ry * 0.02], [-rx * 0.05, ry * 0.3], [rx * 0.34, ry * 0.16]], (u) => 1.7 * Math.sin(u * Math.PI) + 0.35); }
    });
    const gp = r.range(8, 16);
    if (gp > 11) { // a peck in the wider gaps
      const dd = r.range(-hgt * 0.25, hgt * 0.25);
      a.at(g, (s + rx + gp / 2) / R, drMid + dd, () => { g.fillStyle = K; poly(g, [[-2.6, -3], [2.8, -2.4], [0.3, 3.6]]); });
    }
    s += rx + gp;
  }
}

// ───────────────────────── the plant ─────────────────────────
function buildRoot(a, r) {
  const cx = a.cx, y0 = a.crestY;
  const sway = (d) => 16 * Math.sin((d - 60) / 150) * sstep(60, 300, d);
  // [x offset, depth]: a narrow neck, square shoulders, then a long taper — the fat spindle of a taproot
  const Lc = [[-15, 2], [-20, 18], [-22, 36], [-27, 50], [-50, 66], [-90, 88], [-116, 122], [-126, 170], [-120, 226], [-104, 290], [-84, 350], [-64, 410], [-46, 470], [-33, 530], [-24, 600], [-15, 700]];
  const Rc = [[15, 2], [21, 20], [24, 38], [30, 54], [56, 72], [94, 96], [117, 130], [124, 178], [116, 238], [99, 300], [80, 360], [62, 418], [45, 476], [32, 534], [23, 604], [14, 700]];
  const mk = (c) => facet(c.map(([x, d]) => [cx + x + sway(d), y0 + d]), 20, 1.3, r);
  const Lp = mk(Lc), Rp = mk(Rc);
  const edge = (pts, y) => {
    for (let i = 1; i < pts.length; i++) if (pts[i][1] >= y) { const p = pts[i - 1], q = pts[i]; return p[0] + (q[0] - p[0]) * L.clamp((y - p[1]) / ((q[1] - p[1]) || 1)); }
    return pts[pts.length - 1][0];
  };
  const outline = Lp.concat(Rp.slice().reverse());
  const inner = outline.map((p) => [p[0] - 1.6 + r.range(-0.8, 0.8), p[1] - 0.3 + r.range(-0.6, 0.6)]);
  return { outline, inner, xl: (d) => edge(Lp, y0 + d), xr: (d) => edge(Rp, y0 + d) };
}

/** a side root: leaves the main root, settles onto a concentric line and tapers away along it */
function makeLateral(a, r, nz, root, sp, idx) {
  const R = a.R, side = sp.side;
  const sx = side < 0 ? root.xl(sp.d0) + 6 : root.xr(sp.d0) - 6;
  const pol = a.polar(sx, a.crestY + sp.d0);
  const n = Math.ceil(sp.len / 13), pts = [], hw = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * sp.len, u = i / n;
    const dr = L.lerp(pol.dr, sp.dr, 1 - Math.exp(-s / 80)) + 7 * nz.n2(s / 190 + idx * 3.3, idx * 1.7) * sstep(90, 300, s) + 2 * nz.n2(s / 46, idx + 9.2) * sstep(30, 120, s);
    const p = a.pt(pol.theta + (side * s) / (R + sp.dr), dr);
    pts.push([p.x, p.y]);
    hw.push(sp.w * Math.pow(1 - u, 0.72) * (1 + 0.1 * nz.n2(s / 36, idx * 5.1 + 2)) + 0.4 + 4 * Math.exp(-s / 24));
  }
  // rootlets
  const hairs = [];
  let s = r.range(64, 100);
  while (s < sp.len - 22) {
    const i = Math.round((s / sp.len) * n), p = pts[i], q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
    let tx = q[0] - o[0], ty = q[1] - o[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    let nx = -ty, ny = tx; if (ny < 0) { nx = -nx; ny = -ny; }          // toward the circle centre (down the page)
    const down = r.chance(sp.upOK === false ? 0.9 : 0.7) ? 1 : -1;
    const phi = r.range(0.55, 1.1), fade = L.lerp(1, 0.6, s / sp.len);
    const len = (down > 0 ? r.range(26, 56) : r.range(18, 34)) * fade;
    const dx = tx * Math.cos(phi) + nx * down * Math.sin(phi), dy = ty * Math.cos(phi) + ny * down * Math.sin(phi);
    const b = [p[0] + nx * down * hw[i] * 0.6, p[1] + ny * down * hw[i] * 0.6], bend = r.range(0.1, 0.42);
    const pth = [];
    for (let k = 0; k <= 5; k++) { const t = k / 5; pth.push([b[0] + (dx * t + tx * bend * t * t) * len + r.range(-0.8, 0.8), b[1] + (dy * t + ty * bend * t * t) * len + r.range(-0.8, 0.8)]); }
    hairs.push({ pth, w: r.range(1.8, 2.4) });
    if (len > 30 && r.chance(0.45)) {   // a fork
      const f0 = pth[3], fl = len * r.range(0.3, 0.5), fa = r.range(0.5, 0.9) * (r.chance(0.5) ? 1 : -1);
      const fx = dx * Math.cos(fa) - dy * Math.sin(fa), fy = dx * Math.sin(fa) + dy * Math.cos(fa);
      hairs.push({ pth: [f0, [f0[0] + fx * fl * 0.5, f0[1] + fy * fl * 0.5], [f0[0] + fx * fl + tx * 2, f0[1] + fy * fl + ty * 2]], w: 1.5 });
    }
    s += r.range(46, 104);
  }
  return { pts, hw, hairs, sp, side };
}
function drawLateral(g, lat) {
  const { pts, hw, hairs, side } = lat;
  const ow = (h) => 3.4 * (0.45 + 0.55 * Math.min(1, h / 5));
  for (const hr of hairs) { g.fillStyle = P; ribbon(g, hr.pth, (u) => hr.w * (1 - 0.75 * u) + 3.4); }
  for (const hr of hairs) { g.fillStyle = K; ribbon(g, hr.pth, (u) => hr.w * (1 - 0.78 * u) + 0.4); }
  g.fillStyle = P; ribbon(g, pts, (u, i) => hw[i] + ow(hw[i]) + 4.6);
  g.fillStyle = K; ribbon(g, pts, (u, i) => hw[i] + ow(hw[i]));
  g.fillStyle = P; ribbon(g, pts, (u, i) => { const h = hw[i] < 1.3 ? 0 : hw[i] - 0.2, lo = Math.max(0, h - 0.9); return side > 0 ? [lo, h] : [h, lo]; });
}

/** a leaf cut as white line: two edges, midrib, a few slanting veins. Local frame: −y is up, ang from vertical toward +x */
function leaf(g, r, bx, by, ang, len, wid, bend) {
  const n = 9, mid = [], Lp = [], Rp = [];
  let x = bx, y = by;
  for (let i = 0; i <= n; i++) {
    const k = i / n, aa = ang + bend * k;
    if (i) { x += (Math.sin(aa) * len) / n; y -= (Math.cos(aa) * len) / n; }
    const w = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.pow(k, 0.75)), 0.85);
    const nx = Math.cos(aa), ny = Math.sin(aa);
    mid.push([x, y]);
    Lp.push([x - nx * w + r.range(-0.6, 0.6), y - ny * w + r.range(-0.6, 0.6)]);
    Rp.push([x + nx * w + r.range(-0.6, 0.6), y + ny * w + r.range(-0.6, 0.6)]);
  }
  const e = wid < 18 ? 1.75 : 2.15;
  const edge = (u) => e * Math.min(1, 0.5 + u * 5, 0.35 + (1 - u) * 4);
  g.fillStyle = P;
  ribbon(g, Lp, edge); ribbon(g, Rp, edge);
  ribbon(g, mid.slice(0, n), (u) => 1.95 - 1.0 * u);
  if (wid >= 18) for (const k of [2, 4, 6]) {
    ribbon(g, [mid[k], mixPt(mid[k + 1], Lp[k + 1], 0.5), mixPt(mid[k + 2], Lp[k + 2], 0.82)], (u) => 1.55 - 0.7 * u);
    ribbon(g, [mid[k], mixPt(mid[k + 1], Rp[k + 1], 0.5), mixPt(mid[k + 2], Rp[k + 2], 0.82)], (u) => 1.55 - 0.7 * u);
  }
}

// belts: a dotted belt carries a side root along its middle, a hatched belt lies between two of them
const SEPS = [-86, -150, -212, -278, -340, -406, -468, -534, -596, -662, -724];
const BAND = ['dots', 'hatch', 'dots', 'hatch', 'dots', 'hatch', 'dots', 'hatch', 'dots', 'hatch'];
const LATS = [
  { side: -1, d0: 82, dr: -118, len: 1100, w: 10, upOK: false },
  { side: 1, d0: 86, dr: -118, len: 1100, w: 9.5, upOK: false },
  { side: -1, d0: 206, dr: -245, len: 820, w: 8.5 },
  { side: 1, d0: 211, dr: -245, len: 720, w: 8 },
  { side: -1, d0: 334, dr: -373, len: 540, w: 7 },
  { side: 1, d0: 339, dr: -373, len: 620, w: 7 },
  { side: -1, d0: 462, dr: -501, len: 340, w: 5.5 },
  { side: 1, d0: 466, dr: -501, len: 300, w: 5.5 },
];
// whiskers straight off the main root, between the big side roots
const WHISK = [[1, 150, 74], [-1, 168, 82], [1, 276, 78], [-1, 290, 66], [-1, 404, 58], [1, 414, 62], [1, 520, 50], [-1, 530, 46]];
// shoots rising from the two top side roots (x = where they break the ground)
const SHOOTS = [
  { lat: 0, x: 524, kind: 'big', stalk: [3, -30], leaves: [[-1.02, 80, 31, -0.35], [0.52, 68, 28, 0.3], [-0.12, 38, 13, -0.2]] },
  { lat: 1, x: 1432, kind: 'big', stalk: [-2, -27], leaves: [[1.08, 86, 32, 0.38], [-0.46, 62, 27, -0.25], [0.16, 34, 12, 0.2]] },
  { lat: 0, x: 178, kind: 'small', stalk: [1, -14], leaves: [[-0.85, 50, 21, -0.25], [0.7, 44, 20, 0.2]] },
  { lat: 1, x: 1766, kind: 'small', stalk: [-1, -15], leaves: [[0.8, 46, 20, 0.3], [-0.75, 50, 21, -0.2]] },
  { lat: 0, x: 322, kind: 'spear', stalk: [0, -4], leaves: [[-0.22, 34, 10, -0.5]] },
  { lat: 1, x: 1610, kind: 'spear', stalk: [0, -4], leaves: [[0.18, 38, 10, 0.55]] },
];

/** the block: black = wood left standing (prints), white = cut away */
function buildArt(env) {
  const a = env.arc, R = a.R;
  const r = L.rng('s18art'), nz = L.makeNoise('s18art');
  const T = a.span(PAD + 90);
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = P; g.fillRect(-PAD, -PAD, LW, LH);

    // 1) soil belts
    turf(g, a, r, nz, T);
    for (let i = 0; i < SEPS.length - 1; i++) {
      const top = SEPS[i], bot = SEPS[i + 1];
      arcDash(g, a, r, nz, top, { seg: [220, 560], gap: [5, 12], w: [4.3, 5.4], wob: 1.0, T, taper: 0.3, seed: i });
      if (BAND[i] === 'dots') dotRows(g, a, r, top - 11.5, bot + 10.5, 3, 17, T);
      else if (BAND[i] === 'pebble') pebbleRow(g, a, r, (top + bot) / 2, top - bot - 21, T);
      else {
        const n = Math.round((top - bot - 21) / 9.3);
        for (let k = 0; k <= n; k++) arcDash(g, a, r, nz, L.lerp(top - 11, bot + 10, k / n), { seg: [46, 170], gap: [7, 16], w: [3.3, 4.5], wob: 1.1, T, taper: 0.6, seed: i * 10 + k });
      }
    }

    // 2) roots
    const root = buildRoot(a, r);
    const path = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
    g.lineJoin = 'round'; g.fillStyle = P; g.strokeStyle = P; g.lineWidth = 31; path(root.outline); g.fill(); g.stroke();   // clearance cut round the root
    const lats = LATS.map((sp, i) => makeLateral(a, r, nz, root, sp, i));
    for (let i = lats.length - 1; i >= 0; i--) drawLateral(g, lats[i]);
    g.lineJoin = 'bevel'; g.fillStyle = K; g.strokeStyle = K; g.lineWidth = 12.6; path(root.outline); g.fill(); g.stroke();
    g.fillStyle = P; poly(g, root.inner);
    for (const lt of lats) { g.fillStyle = P; ribbon(g, lt.pts.slice(0, 5), (u, i) => Math.max(0, lt.hw[i] - 0.5)); }      // open the joints

    // skin of the main root: scars round the neck, then creases cut in from either flank
    g.fillStyle = K;
    for (const d of [24, 38, 52]) {
      const xl = root.xl(d), xr = root.xr(d), pts = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([L.lerp(xl - 1, xr + 1, t), a.crestY + d + 3.2 * (1 - (2 * t - 1) ** 2) + r.range(-0.5, 0.5)]); }
      ribbon(g, pts, (u) => 1.55 + 0.4 * Math.sin(u * 9 + d));
    }
    let d = 96;
    while (d < 720) {
      const xl = root.xl(d), xr = root.xr(d), w = xr - xl, mid = (xl + xr) / 2;
      const nearL = LATS.some((sp) => sp.side < 0 && Math.abs(sp.d0 - d - 6) < 18), nearR = LATS.some((sp) => sp.side > 0 && Math.abs(sp.d0 - d - 6) < 18);
      let kind = r(); const sag = L.lerp(7, 12, r()) * (w / 230);
      let fromL = kind < 0.46, fromR = !fromL && kind < 0.88, full = kind >= 0.88;
      if (full && (nearL || nearR)) { full = false; fromL = !nearL; fromR = !fromL; }
      if (fromL && nearL) { fromL = false; fromR = true; }
      if (fromR && nearR) { fromR = false; fromL = !nearL; }
      if (fromL || fromR || full) {
        const t0 = fromL || full ? -1 : r.range(-0.15, 0.55), t1 = fromR || full ? 1 : r.range(-0.55, 0.15);
        const pts = [];
        for (let i = 0; i <= 8; i++) { const t = L.lerp(t0, t1, i / 8); pts.push([mid + t * (w / 2 + 1), a.crestY + d + sag * (1 - t * t) + r.range(-0.7, 0.7)]); }
        const e0 = t0 === -1 ? 1 : 0.15, e1 = t1 === 1 ? 1 : 0.15;
        ribbon(g, pts, (u) => 0.55 + 1.55 * L.lerp(e0, e1, u));
      }
      d += r.range(13, 20) * (d < 200 ? 1 : 1.3);
    }
    for (let i = 0; i < 16; i++) {       // lenticels
      const dd = r.range(120, 520), xl = root.xl(dd), xr = root.xr(dd), x = L.lerp(xl + 16, xr - 16, r()), y = a.crestY + dd;
      poly(g, [[x - 2.6, y - 1.2], [x + 2.4, y - 2], [x + 0.6, y + 2.8]]);
    }

    // 3) shoots: the part still under ground
    const shoots = SHOOTS.map((sh) => {
      const lt = lats[sh.lat]; let bi = 0, bd = 1e9;
      lt.pts.forEach((p, i) => { const dd = Math.abs(p[0] - sh.x); if (dd < bd) { bd = dd; bi = i; } });
      const pol = a.polar(lt.pts[bi][0], lt.pts[bi][1]);
      return { ...sh, theta: pol.theta, depth: -pol.dr - lt.hw[bi], ph: r.range(0, 6) };
    });
    for (const sh of shoots) {
      const big = sh.kind === 'big', kb = big ? 6.6 : 4.9, kw = big ? 3.7 : 2.2;
      a.at(g, sh.theta, 0, () => {
        const mk = (y0, y1) => { const pts = []; for (let i = 0; i <= 8; i++) { const y = L.lerp(y0, y1, i / 8); pts.push([2.6 * Math.sin(y / 26 + sh.ph) * sstep(0, 30, y), y]); } return pts; };
        g.fillStyle = P; ribbon(g, mk(4, sh.depth - 6), kb + 5);
        g.fillStyle = K; ribbon(g, mk(4, sh.depth - 1.5), kb);
        g.fillStyle = P; ribbon(g, mk(-2, sh.depth + 3.2), kw);
      });
    }

    // 4) the ground line itself: a clean rim of bare paper, then the uncut block above it
    a.fillBand(g, P, 2, -7.5);
    a.fillAbove(g, K, 0);

    // 5) white-line cuts into the black: shoots, leaf tips, a bud at the crown, grass ticks
    g.fillStyle = P;
    for (const sh of shoots) {
      a.at(g, sh.theta, 0, () => {
        if (sh.kind === 'hook') {
          const f = sh.flip;
          ribbon(g, facet([[0, 2], [0, -13], [3 * f, -23], [10 * f, -28], [16 * f, -24], [14 * f, -17]], 6, 0.5, r), (u) => 3.0 - 1.2 * u);
          poly(g, [[11 * f, -19], [17 * f, -15], [12 * f, -12]]);
          return;
        }
        const [sx, sy] = sh.stalk, big = sh.kind === 'big';
        ribbon(g, [[0, 2], [sx * 0.3, sy * 0.5], [sx, sy]], (u) => (big ? 3.9 : 2.5) - 0.9 * u);
        for (const [ang, len, wid, bend] of sh.leaves) leaf(g, r, sx, sy + 2, ang, len, wid, bend);
      });
    }
    a.at(g, 0, 0, () => { poly(g, [[-13, 1], [-6.5, -6.5], [-1, 1]]); poly(g, [[-6, 1], [0, -9], [6, 1]]); poly(g, [[1, 1], [7, -6], [13, 1]]); });
    let s = -T * R;
    while (s < T * R) {
      s += r.range(26, 120);
      if (Math.abs(s) < 345) continue;
      const n = r.int(1, 4);
      for (let k = 0; k < n; k++) {
        const hh = r.range(5, 12.5), ln = r.range(-3, 3), bw = r.range(1.6, 2.3), ss = s + k * r.range(5, 9);
        a.at(g, ss / R, 0, () => poly(g, [[-bw, 1], [bw, 1], [ln, -hh]]));
      }
    }
  });
}

// ───────────────────────── pulling the impressions ─────────────────────────
function makePrints(art, env) {
  const a = env.arc;
  const rd = (c) => c.getContext('2d').getImageData(0, 0, LW, LH).data;
  // ink-carrying coverage, softened a touch so the threshold can bite into the edges
  const bl = L.makeCanvas(LW, LH), bg = bl.getContext('2d', { willReadFrequently: true });
  bg.filter = 'blur(1.15px)'; bg.drawImage(art, 0, 0); bg.filter = 'none';
  const A = bg.getImageData(0, 0, LW, LH).data;
  const M = rd(L.noiseTex(LW, LH, { seed: 's18med', scale: 7, octaves: 2, res: 0.5, contrast: 1.6 }));                        // ragged edge
  const SV = rd(L.noiseTex(LW, LH, { seed: 's18dry', scale: 300, sx: 2.6, octaves: 4, gain: 0.55, res: 0.2, warp: 0.5 }));     // where the ink ran thin
  const WG = rd(L.noiseTex(LW, LH, { seed: 's18grain', scale: 34, sx: 24, sy: 0.32, octaves: 3, ridged: true, res: 0.5 }));    // grain of the block
  // the sheet
  const paper = L.paperTex(LW, LH, { base: PAPER, seed: 's18paper', tone: '#b3a27c', fiber: 0.5, stain: 0.32, grain: 0.1 });
  const pg = paper.getContext('2d');
  pg.globalCompositeOperation = 'multiply';
  pg.fillStyle = L.radial(pg, PAD + a.cx - 160, PAD + a.crestY + 150, 260, 1350, [[0, '#ffffff'], [1, '#d8d0bd']]);
  pg.fillRect(0, 0, LW, LH);
  const PP = pg.getImageData(0, 0, LW, LH).data;
  // per-pixel tooth of the paper (≈1.5 px grain), tileable
  const FN = 512, F = new Float32Array(FN * FN), raw = new Float32Array(FN * FN), rr = L.rng('s18tooth');
  for (let i = 0; i < raw.length; i++) raw[i] = rr() * 2 - 1;
  for (let y = 0; y < FN; y++) for (let x = 0; x < FN; x++) {
    const x1 = (x + 1) & 511, y1 = (y + 1) & 511;
    F[y * FN + x] = (raw[y * FN + x] + raw[y * FN + x1] + raw[y1 * FN + x] + raw[y1 * FN + x1]) * 0.5;
  }
  const arcY = new Float32Array(LW);
  for (let x = 0; x < LW; x++) arcY[x] = a.yAt(x - PAD) + PAD;
  const ik = L.parseColor(INK), NTOT = LW * LH * 4;
  const zx = PAD + a.cx, zy = PAD + a.crestY - 135;      // centre of the caption zone
  const out = [];
  for (let v = 0; v < 3; v++) {
    const img = new ImageData(LW, LH), d = img.data;
    const ox = v * 131 + 7, oy = v * 89 + 3, mo = (v * 37 + v * 53 * LW) * 4, dryK = [1, 0.86, 1.1][v];
    for (let y = 0; y < LH; y++) {
      const fy = ((y + oy) & 511) * FN, fy2 = ((y + oy + 211) & 511) * FN, fy3 = ((y + oy * 3 + 77) & 511) * FN;
      const ey = (y - zy) / 270, ey2 = ey * ey;
      for (let x = 0; x < LW; x++) {
        const k = (y * LW + x) * 4;
        const cov = 1 - A[k] / 255;
        const f = F[fy + ((x + ox) & 511)], f2 = F[fy2 + ((x + ox + 97) & 511)], f3 = F[fy3 + ((x + ox * 2 + 301) & 511)];
        let mk = k + mo; if (mk >= NTOT) mk -= NTOT;
        const m = M[mk] / 127.5 - 1;
        const above = y < arcY[x];
        let calm = 1;
        if (above) { const ex = (x - zx) / 540, e = ex * ex + ey2; calm = e < 1 ? 0 : e > 2.4 ? 1 : (e - 1) / 1.4; }
        let s = SV[k] / 255; s = s <= 0.6 ? 0 : s >= 0.9 ? 1 : (s - 0.6) / 0.3; s = s * s * (3 - 2 * s) * dryK;
        if (above) s *= 0.3 * calm;
        if (s > 1) s = 1;
        const thr = 0.5 + 0.11 * f + 0.12 * m + 0.4 * s;
        let ink = (cov - thr) * 5 + 0.5; ink = ink < 0 ? 0 : ink > 1 ? 1 : ink;
        if (ink > 0) {
          if (s > 0.02 && f2 < 1.5 * s - 0.85) ink *= 0.1;                               // dry impression: ink only on the high points of the paper
          if (f3 > (above ? 1.42 + 0.3 * (1 - calm) : 1.28)) ink *= 0.3;                 // salt in the solids
        } else if (!above && f3 < -1.72) ink = 0.55;                                      // a stray fleck of ink on the bare paper
        const wg = WG[k] / 255, tone = wg > 0.6 ? (wg - 0.6) * 55 * (above ? 0.5 + 0.5 * calm : 1) : 0;
        const kk = ink * (1 - 0.3 * s + 0.03 * m), q = 1 - kk;
        d[k] = PP[k] * q + (ik[0] + tone) * kk; d[k + 1] = PP[k + 1] * q + (ik[1] + tone) * kk; d[k + 2] = PP[k + 2] * q + (ik[2] + tone * 0.9) * kk; d[k + 3] = 255;
      }
    }
    const c = L.makeCanvas(LW, LH); c.getContext('2d').putImageData(img, 0, 0); c._pad = PAD;
    out.push(c);
  }
  return out;
}

export default {
  name: '本草木刻插图',
  tone: 'light',
  init(env) {
    S = { prints: makePrints(buildArt(env), env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // creep in ~3 %. A zoom about the crest flattens the arc slightly, so split the error between crest and frame edge.
    const z = L.lerp(0.99, 1.02, p);
    const err = a.yAt(0) - (a.crestY + z * (a.yAt(a.cx - a.cx / z) - a.crestY));
    // a fresh impression every second frame: the edges boil, the sheet sits a hair differently
    const hold = Math.floor((env.frame || 0) / 2), rj = L.rng('s18reg' + hold);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.prints[hold % 3], { zoom: z, dx: rj.range(-0.7, 0.7), dy: err / 2 + rj.range(-0.5, 0.5) });
  },
};
