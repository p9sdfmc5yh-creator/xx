// s24 — 白玉透雕. Macro of a round openwork plaque of mutton-fat white jade lying on black cloth.
// The arc is the plaque's outer rim: a plain border with one incised line, its edge rising and falling a few pixels in
// shallow petal lobes. Below it the slab is carved in two layers, fine as lace: the ground is sawn into a diagonal
// lattice (every hole started from a drill hole, so its corners are round), and standing proud of it a scrolling vine
// with big blossoms, leaves, tendrils and one small bird, wings spread, looking back over its shoulder. Everything is
// one piece of stone; the holes show the black ground and, under each bar, a sliver of the slab's thickness.
//
// How it is made (all in init):
//   1. the design is drawn the way a relief is stacked, element by element in painter's order, into four canvases:
//      A = silhouette, P = silhouette with a hairline seam wherever a later element overlaps an earlier one,
//      Z = per-element carving parameters (level / bevel radius / rise), G = incised lines (阴线);
//   2. A is blurred and re-thresholded → every hole corner comes out rounded, like the drill hole a pierced cut starts from;
//   3. an exact distance transform of P gives each element its own softly rounded cross-section (a "pillow"), stacked at its
//      level, with the incised lines cut in → one height field for the whole carving;
//   4. the height field is lit per pixel: wrapped diffuse from the upper left, short cast shadows, crevice occlusion,
//      a broad greasy specular; the lighting is then diffused under the surface (jade is translucent) and coloured through
//      two ramps — thick jade (cool mutton-fat white → grey) and thin jade (warm, light bleeding through);
//   5. the hole walls: the plaque leans back a little, so under every bar we see a sliver of its thickness in shadow.
// draw() slides the carving along the arc, creeps in, and lets one soft greasy highlight travel along the rim.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 110;
const K = 1.2;             // the figures are laid out at 1× (design px) and enlarged by K — macro framing
const BW0 = 60;            // border width the figures were laid out against (design px)
const BW = 56;             // width of the plain border (screen px)
const LIFT = 8;            // the figures stand this far above the pierced ground (px)
const NET = 66;            // pitch of the lattice along the arc (rows are NET / 2 apart)
const BAR = 15;            // width of a lattice bar
const LOBE = 330, LOBE_A = 5;   // petal lobes of the rim: length along the arc / depth of the notch between two lobes (px)
const SEAM = 3.4;          // seam cut around every element where it lies on top of another
const GD = 3;              // depth of an incised line
const NW = 15;             // visible wall height in the holes (px)
const SHEEN_H = 480;       // rows of the travelling-highlight layer
const BLACK = '#040404';
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ── small geometry helpers (all return Path2D so one shape can be stamped into several canvases) ──
const poly = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; };
const line = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); return p; };
const disc = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; };
const arcP = (x, y, r, a0, a1) => { const p = new Path2D(); p.arc(x, y, r, a0, a1); return p; };
/** a diamond (half-diagonals a, b) with corners rounded to radius r — the shape a drilled-and-sawn lattice hole ends up with */
function rdiamond(a, b, r) {
  const p = new Path2D(), V = [[a, 0], [0, b], [-a, 0], [0, -b]];
  p.moveTo(a / 2, -b / 2);
  for (let i = 0; i < 4; i++) { const v = V[i], w = V[(i + 1) % 4]; p.arcTo(v[0], v[1], (v[0] + w[0]) / 2, (v[1] + w[1]) / 2, r); }
  p.closePath();
  return p;
}
/** closed Catmull-Rom through pts */
function loop(pts, step = 5) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < m; j++) {
      const t = j / m, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
/** a round-ended band along the dense polyline P; wf(u) → width at u ∈ [0,1] */
function tube(P, wf) {
  const n = P.length, Lf = [], Rt = [];
  let a0 = 0, a1 = 0, h0 = 0, h1 = 0;
  for (let i = 0; i < n; i++) {
    const A = P[Math.max(0, i - 1)], B = P[Math.min(n - 1, i + 1)];
    let tx = B[0] - A[0], ty = B[1] - A[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const hw = 0.5 * wf(i / (n - 1));
    Lf.push([P[i][0] - ty * hw, P[i][1] + tx * hw]); Rt.push([P[i][0] + ty * hw, P[i][1] - tx * hw]);
    if (i === 0) { a0 = Math.atan2(ty, tx); h0 = hw; }
    if (i === n - 1) { a1 = Math.atan2(ty, tx); h1 = hw; }
  }
  const p = new Path2D();
  p.moveTo(Lf[0][0], Lf[0][1]);
  for (let i = 1; i < n; i++) p.lineTo(Lf[i][0], Lf[i][1]);
  p.arc(P[n - 1][0], P[n - 1][1], h1, a1 + Math.PI / 2, a1 - Math.PI / 2, true);
  for (let i = n - 1; i >= 0; i--) p.lineTo(Rt[i][0], Rt[i][1]);
  p.arc(P[0][0], P[0][1], h0, a0 - Math.PI / 2, a0 - 1.5 * Math.PI, true);
  p.closePath();
  return p;
}

// ── exact Euclidean distance transform (Felzenszwalb & Huttenlocher): distance from every inside pixel to the nearest outside one ──
function edt(inside, w, h) {
  const INF = 1e9, n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
  const tmp = new Float64Array(w * h), out = new Float32Array(w * h);
  const dt1 = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? INF : 0;
    dt1(h);
    for (let y = 0; y < h; y++) tmp[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) f[x] = tmp[o + x];
    dt1(w);
    for (let x = 0; x < w; x++) out[o + x] = Math.sqrt(d[x]);
  }
  return out;
}

/** box blur (radius r, `passes` times) of src over the pixels where mk > 0 only; holes neither contribute nor receive */
function blurMasked(src, mk, w, h, r, passes) {
  const n = w * h, v = new Float32Array(n), c = new Float32Array(n), tv = new Float32Array(n), tc = new Float32Array(n);
  for (let i = 0; i < n; i++) if (mk[i] > 0) { v[i] = src[i]; c[i] = 1; }
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let sv = 0, sc = 0;
      for (let x = 0; x <= r && x < w; x++) { sv += v[o + x]; sc += c[o + x]; }
      for (let x = 0; x < w; x++) {
        tv[o + x] = sv; tc[o + x] = sc;
        const xa = x + r + 1, xr = x - r;
        if (xa < w) { sv += v[o + xa]; sc += c[o + xa]; }
        if (xr >= 0) { sv -= v[o + xr]; sc -= c[o + xr]; }
      }
    }
    for (let x = 0; x < w; x++) {
      let sv = 0, sc = 0;
      for (let y = 0; y <= r && y < h; y++) { sv += tv[y * w + x]; sc += tc[y * w + x]; }
      for (let y = 0; y < h; y++) {
        const i = y * w + x; v[i] = sv; c[i] = sc;
        const ya = y + r + 1, yr = y - r;
        if (ya < h) { sv += tv[ya * w + x]; sc += tc[ya * w + x]; }
        if (yr >= 0) { sv -= tv[yr * w + x]; sc -= tc[yr * w + x]; }
      }
    }
    // back to plain values before the next pass, so the sums stay small
    for (let i = 0; i < n; i++) { if (mk[i] > 0 && c[i] > 1e-6) { v[i] /= c[i]; c[i] = 1; } else { v[i] = 0; c[i] = 0; } }
  }
  return v;
}

// ─────────────────────────────────────────── the design ───────────────────────────────────────────
// Everything is laid out in arc coordinates: s = px along the arc from the crest (right = +), d = px below the arc.
function carve(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 12, RW = W + PAD * 2, RH = H + PAD - Y0;
  const mk = () => { const c = L.makeCanvas(RW, RH), g = c.getContext('2d', { willReadFrequently: true }); g.translate(-X0, -Y0); g.lineJoin = 'round'; g.lineCap = 'round'; return [c, g]; };
  const [cA, gA] = mk(), [cP, gP] = mk(), [cZ, gZ] = mk(), [cG, gG] = mk();
  gA.fillStyle = '#fff'; gP.fillStyle = '#fff'; gP.strokeStyle = '#fff'; gP.lineWidth = SEAM;
  const ctxs = [gA, gP, gZ, gG];
  /** screen px: s along the arc from the crest, d below the arc */
  const raw = (s, d) => { const th = s / R, r = R - d; return [cx + r * Math.sin(th), cy - r * Math.cos(th)]; };
  /** design px → screen: enlarged by K about the crest, hung from the inner edge of the border */
  const mp = (s, d) => raw(s * K, BW + (d - BW0) * K);
  const at = (x, y, ang, fn, sx = 1, sy = 1) => { for (const g of ctxs) { g.save(); g.translate(x, y); g.rotate(ang); g.scale(sx, sy); } fn(); for (const g of ctxs) g.restore(); };
  const atSD = (s, d, angDeg, fn, sx = 1, sy = 1) => { const p = mp(s, d); at(p[0], p[1], s * K / R + L.deg(angDeg), fn, sx * K, sy * K); };
  const zcol = (lv, b, k) => `rgb(${Math.round(lv * 8)},${Math.round(b * 4)},${Math.round(k * 200)})`;
  /** one carved element, screen px: lv = level of its edge, b = bevel radius, k = rise per bevel radius */
  const put = (p, lv, b, k) => {
    gA.fill(p);
    gP.globalCompositeOperation = 'destination-out'; gP.stroke(p);
    gP.globalCompositeOperation = 'source-over'; gP.fill(p);
    gZ.fillStyle = zcol(lv, b, k); gZ.fill(p);
    gG.globalCompositeOperation = 'destination-out'; gG.fill(p); gG.globalCompositeOperation = 'source-over';
  };
  /** the same in design px, standing on the pierced ground */
  const el = (p, lv, b, k = 0.7) => put(p, LIFT + lv * K, b * K, k);
  const groove = (p, w = 2.6, al = 1) => { gG.lineWidth = w; gG.strokeStyle = `rgba(255,255,255,${al})`; gG.stroke(p); };

  // the pierced ground: the slab under the figures, sawn into a diagonal lattice. No two holes are quite alike.
  {
    const r = L.rng('s24net'), nz = L.makeNoise('s24net');
    const slab = [];
    for (let s = -1320; s <= 1320; s += 12) slab.push(raw(s, BW - 18));
    slab.push([X0 + RW + 40, Y0 + RH + 40], [X0 - 40, Y0 + RH + 40]);
    const sp = poly(slab);
    gA.fill(sp); gP.fill(sp); gZ.fillStyle = zcol(0, BAR * 0.5, 0.8); gZ.fill(sp);
    const half = NET / 2 - BAR * 0.7071;
    for (const g of [gA, gP]) g.globalCompositeOperation = 'destination-out';
    for (let j = 0, d = BW + NET * 0.5 - 2; d < 720; j++, d += NET / 2) {
      for (let i = -21; i <= 21; i++) {
        const s = (i + (j & 1) * 0.5) * NET + 9, q = raw(s + r.range(-2.6, 2.6), d + r.range(-2.6, 2.6));
        const sz = half * (1 + 0.1 * nz.n2(s / 300, d / 300) + r.range(-0.07, 0.07));
        const hole = rdiamond(sz * r.range(0.93, 1.07), sz * r.range(0.93, 1.07), r.range(5, 8)), tilt = s / R + r.range(-0.07, 0.07);
        for (const g of [gA, gP]) { g.save(); g.translate(q[0], q[1]); g.rotate(tilt); g.fill(hole); g.restore(); }
      }
    }
    for (const g of [gA, gP]) g.globalCompositeOperation = 'source-over';
  }

  // the two vines
  const vineD = (s) => 240 - 178 * Math.cos(TAU * (s - 20) / 1180) + 12 * Math.sin(s / 173 + 1) + 6 * Math.sin(s / 61);
  const on = (s) => [s, vineD(s)];
  const SM = 1580;
  const stem = (sd, wf, lv, k = 0.8, b = 17) => el(tube(L.smoothPath(sd.map(([s, d]) => mp(s, d)), 5), (u) => K * wf(u)), lv, b, k);
  // a lower swag hanging between the two troughs, under the bird
  stem([[-760, 392], [-600, 432], [-450, 470], [-300, 494], [-140, 479], [20, 502], [180, 484], [330, 497], [480, 463], [625, 430], [780, 395]], (u) => 27 + 3 * Math.sin(u * 23), 0.6, 0.8, 14);
  { const sd = []; for (let s = -SM; s <= SM; s += 40) sd.push(on(s)); stem(sd, (u) => 34 + 3.5 * Math.sin(u * 61) + 2 * Math.sin(u * 23 + 2), 1); }

  // curling tendrils (an Euler spiral: the curl tightens toward the tip, which ends in a bud)
  const tendril = ([s, d], angDeg, len, turn, w0, w1, lv = 1.7) => atSD(s, d, angDeg, () => {
    const P = []; let x = 0, y = 0; const n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) { P.push([x, y]); const hd = turn * Math.pow(i / n, 1.7); x += 3 * Math.cos(hd); y += 3 * Math.sin(hd); }
    el(tube(P, (u) => L.lerp(w0, w1, u)), lv, w0 / 2, 0.8);
    el(disc(P[n][0], P[n][1], w1 * 0.95), lv + 0.6, w1 * 0.9, 0.8);
  });
  tendril(on(-205), -150, 240, 5.6, 27, 14);
  tendril(on(-930), -30, 235, -5.4, 26, 13);
  tendril(on(1005), -160, 235, 5.5, 26, 13);

  // leaves: two halves folded along the midrib, wavy margin, short side veins cut in
  const leaf = ([s, d], angDeg, len, wid, bend = 0.12, flip = 1, lv = 3, seed = 0) => {
    const r = L.rng('s24leaf' + s + '/' + seed), ph = r.range(0, TAU), nv = len > 170 ? 4 : 3;
    atSD(s, d, angDeg, () => {
      const N = 32, mid = [], up = [], lo = [];
      const wave = (t, q) => 1 + 0.085 * Math.sin(t * 13 + ph + q) * sstep(0.12, 0.3, t) * (1 - sstep(0.8, 0.97, t));
      const prof = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.8);
      for (let i = 0; i <= N; i++) {
        const t = i / N, mx = len * t, my = -bend * len * Math.sin(Math.PI * t);
        mid.push([mx, my]); up.push([mx, my - wid * 0.5 * prof(t) * wave(t, 0)]); lo.push([mx, my + wid * 0.46 * prof(t) * wave(t, 2.1)]);
      }
      el(poly(mid.concat(lo.slice().reverse())), lv, wid * 0.2, 0.55);
      el(poly(mid.concat(up.slice().reverse())), lv + 0.7, wid * 0.2, 0.55);
      for (let j = 0; j < nv; j++) {
        const t = 0.2 + 0.55 * j / (nv - 1) + r.range(-0.02, 0.02), t2 = t + 0.13, mx = len * t, my = -bend * len * Math.sin(Math.PI * t), my2 = -bend * len * Math.sin(Math.PI * t2);
        groove(line([[mx, my - 3], [len * (t + 0.07), my - wid * 0.2 * prof(t)], [len * t2, my2 - wid * 0.36 * prof(t2)]]), 2.2, 0.75);
        groove(line([[mx, my + 3], [len * (t + 0.07), my + wid * 0.19 * prof(t)], [len * t2, my2 + wid * 0.33 * prof(t2)]]), 2.2, 0.75);
      }
    }, 1, flip);
  };

  // blossoms: tiers of overlapping petals around a boss
  const flower = (s, d, angDeg, rad, n1, n2, tip, seed) => atSD(s, d, angDeg, () => {
    const r = L.rng('s24fl' + seed);
    const petal = (phi, r0, r1, half, lv, b) => {
      const pts = [], M = 18;
      pts.push([Math.cos(phi - half * 0.4) * r0, Math.sin(phi - half * 0.4) * r0]);
      for (let i = 0; i <= M; i++) {
        const u = i / M * 2 - 1;
        const sc = tip === 'wavy' ? (0.9 + 0.1 * Math.pow(Math.abs(Math.cos(1.5 * Math.PI * u)), 0.6)) * (1 - 0.17 * u * u * u * u) : 1 - 0.36 * Math.pow(Math.abs(u), 1.6);
        pts.push([Math.cos(phi + u * half) * r1 * sc, Math.sin(phi + u * half) * r1 * sc]);
      }
      pts.push([Math.cos(phi + half * 0.4) * r0, Math.sin(phi + half * 0.4) * r0]);
      el(poly(pts), lv, b, 0.62);
      const q0 = L.lerp(r0, r1, 0.3), q1 = L.lerp(r0, r1, 0.72);
      groove(line([[Math.cos(phi) * q0, Math.sin(phi) * q0], [Math.cos(phi) * q1, Math.sin(phi) * q1]]), 2.2, 0.7);
    };
    const tier = (n, off, r0, r1, wide, lv, b) => {
      const ph = []; for (let i = 0; i < n; i++) ph.push(off + i * TAU / n + r.range(-0.11, 0.11));
      for (const par of [0, 1]) for (let i = par; i < n; i += 2) petal(ph[i], rad * r0, rad * r1 * r.range(0.87, 1.02), Math.PI / n * wide * r.range(0.92, 1.1), lv + par * 0.9, rad * b);
    };
    tier(n1, 0, 0.3, 1, 1.3, 2.2, 0.11);
    tier(n2, Math.PI / n1, 0.12, 0.68, 1.28, 5, 0.1);
    tier(4, 0.5, 0.04, 0.4, 1.2, 7.4, 0.08);
    el(disc(0, 0, rad * 0.16), 9.6, rad * 0.14, 0.8);
    groove(disc(0, 0, rad * 0.075), 2.2, 0.8);
  });
  const blossom = (s, d, angDeg, rad, seed) => atSD(s, d, angDeg, () => {
    const r = L.rng('s24b' + seed);
    for (const par of [0, 1]) for (let i = par; i < 5; i += 2) {
      const ph = i * TAU / 5 + r.range(-0.07, 0.07), pr = rad * r.range(0.44, 0.5), pc = rad - pr;
      el(disc(Math.cos(ph) * pc, Math.sin(ph) * pc, pr), 4 + par * 0.8, pr * 0.55, 0.6);
      groove(line([[Math.cos(ph) * rad * 0.36, Math.sin(ph) * rad * 0.36], [Math.cos(ph) * rad * 0.7, Math.sin(ph) * rad * 0.7]]), 2.2, 0.7);
    }
    el(disc(0, 0, rad * 0.27), 6.6, rad * 0.24, 0.8);
    groove(disc(0, 0, rad * 0.12), 2.2, 0.8);
  });

  // calyx leaves under the two big blossoms, then the blossoms themselves
  leaf(on(-590), -128, 120, 52, 0.1, 1, 2, 1); leaf(on(-550), -50, 118, 50, -0.1, 1, 2, 2);
  leaf(on(590), -130, 118, 50, 0.1, 1, 2, 3); leaf(on(630), -52, 120, 52, -0.1, 1, 2, 4);
  flower(-570, 222, 14, 165, 8, 6, 'wavy', 1);
  flower(610, 224, -8, 158, 9, 7, 'point', 2);
  flower(-1185, 332, 30, 126, 7, 5, 'point', 3);
  flower(1218, 326, 10, 124, 7, 6, 'wavy', 4);
  blossom(215, 104, 20, 47, 1);
  blossom(300, 432, -12, 61, 2);

  // [vine s, angle°, length, width, bend, flip] — angle 0 = along the arc to the right, 90 = straight down into the plaque
  const LEAVES = [
    [-300, -118, 242, 108, 0.13, 1], [310, -66, 224, 98, -0.12, 1],
    [-400, 62, 215, 100, 0.12, -1], [450, 125, 206, 96, -0.1, 1], [330, 150, 130, 62, 0.1, 1],
    [-830, -60, 250, 104, -0.12, 1], [870, -122, 246, 102, 0.14, 1],
    [-900, 135, 232, 104, 0.1, 1], [940, 50, 226, 100, -0.1, 1],
    [-520, 105, 150, 74, 0.1, 1], [-650, 72, 140, 70, -0.1, 1], [560, 72, 150, 72, 0.1, 1], [668, 104, 140, 70, -0.1, 1],
  ];
  for (const [s, ang, len, wid, bend, flip] of LEAVES) leaf(on(s), ang, len, wid, bend, flip);

  // the bird: flying to the right, wings swept back above and below the body, head turned back to its own wing
  atSD(118, 298, 0, () => {
    const feather = (len, fw) => poly(loop([[0, -4], [len * 0.3, -fw * 0.74], [len * 0.68, -fw], [len * 0.93, -fw * 0.66], [len, 0], [len * 0.93, fw * 0.66], [len * 0.68, fw], [len * 0.3, fw * 0.74], [0, 4]], 4));
    const wing = (ox, oy, a0, a1, n, len, lv0) => {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), ln = len * L.lerp(0.5, 1, Math.pow(u, 0.75));
        at(ox, oy, L.deg(L.lerp(a0, a1, u)), () => { el(feather(ln, 15 + 4 * u), lv0 + i * 0.45, 11, 0.7); groove(line([[ln * 0.3, 0], [ln * 0.9, 0]]), 2, 0.75); });
      }
      // coverts: a rounded shoulder patch over the feather roots, with two rows of scale marks
      const rc = len * 0.36, sg = Math.sign(a1 - a0), b0 = L.deg(a0 - sg * 12), b1 = L.deg(a1 + sg * 12), bm = (b0 + b1) / 2, pts = [];
      for (let q = 0; q <= 10; q++) { const an = L.lerp(b0, b1, q / 10), rr = rc * (0.84 + 0.16 * Math.sin(Math.PI * q / 10)); pts.push([ox + Math.cos(an) * rr, oy + Math.sin(an) * rr]); }
      pts.push([ox - Math.cos(bm) * 14, oy - Math.sin(bm) * 14]);
      el(poly(loop(pts, 4)), lv0 + n * 0.45 + 1, 16, 0.6);
      for (const [rr, m] of [[rc * 0.44, 3], [rc * 0.76, 4]]) for (let q = 0; q < m; q++) {
        const an = L.lerp(b0, b1, (q + 0.5) / m);
        groove(arcP(ox + Math.cos(an) * rr, oy + Math.sin(an) * rr, 9, an - 1.15, an + 1.15), 2, 0.7);
      }
    };
    // tail ribbons
    const ribbon = (pts, w0, w1, lv) => { const P = L.smoothPath(pts, 4); el(tube(P, (u) => L.lerp(w0, w1, Math.pow(u, 0.8))), lv, w0 / 2, 0.75); groove(line(P.slice(8, P.length - 6)), 2, 0.6); };
    ribbon([[-60, 30], [-150, 52], [-240, 50], [-305, 18], [-335, -40], [-326, -106]], 28, 13, 2.6);
    ribbon([[-60, 40], [-150, 80], [-240, 108], [-320, 112], [-400, 98], [-470, 78]], 29, 13, 3);
    ribbon([[-55, 50], [-120, 104], [-180, 152], [-228, 205], [-250, 262]], 28, 14, 3.4);
    wing(18, 28, 170, 92, 6, 165, 3.6);                                                   // far wing, under the body
    el(poly(loop([[-98, 40], [-58, 6], [-8, -30], [46, -44], [84, -26], [94, 6], [74, 40], [28, 62], [-30, 66], [-76, 58]], 4)), 6, 38, 0.5);   // body
    for (const [x, y] of [[40, 4], [62, 18], [20, 22], [44, 36], [0, 40], [-22, 26], [22, 50], [-44, 44]]) groove(arcP(x, y, 10, 0.1, 2.0), 2, 0.7);   // breast feathers
    wing(2, -14, -172, -102, 7, 190, 7);                                                  // near wing, over the back
    el(poly([[52, -125], [5, -104], [50, -95]]), 7.4, 8, 0.7);                            // beak
    groove(line([[12, -104.5], [48, -110]]), 1.8, 0.7);
    el(tube(L.smoothPath([[62, -22], [92, -48], [98, -82], [80, -104]], 4), (u) => L.lerp(46, 36, u)), 7.2, 20, 0.6);   // neck
    el(disc(72, -108, 27), 8.2, 24, 0.6);                                                 // head
    groove(disc(63, -112, 6), 2, 0.9); groove(disc(63, -112, 1.2), 2.4, 1);               // eye
  });

  // the plain border, on top of everything that reaches it
  const lobe = (s) => { const u = s + 16 * Math.sin(s / 410 + 1.3) - 15.4; return 1 - Math.pow(Math.abs(Math.cos(Math.PI * u / LOBE)), 0.85); };
  const dOut = (s) => LOBE_A * lobe(s), dIn = (s) => BW + 0.7 * LOBE_A * lobe(s) + 2 * Math.sin(s / 97);
  { const out = [], inn = [], gr = [];
    for (let s = -1320; s <= 1320; s += 6) { out.push(raw(s, dOut(s))); inn.push(raw(s, dIn(s))); gr.push(raw(s, BW - 15 + 0.85 * LOBE_A * lobe(s) + 1.2 * Math.sin(s / 131))); }
    put(poly(out.concat(inn.reverse())), LIFT + 4, 13, 0.8);
    groove(line(gr), 3.4, 0.95);
  }
  return { cA, cP, cZ, cG, X0, Y0, RW, RH };
}

// ─────────────────────────────────────────── relief → lit jade ───────────────────────────────────────────
function build(env) {
  const a = env.arc, C = carve(env), { X0, Y0, RW, RH } = C, N = RW * RH;
  const px = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, RW, RH).data;
  const dA = px(L.blurred(C.cA, 2.4)), dT = px(L.blurred(C.cA, 15)), dP = px(C.cP), dG = px(L.blurred(C.cG, 0.7));
  // carving parameters, bled a few px outward so the pixels gained by the rounding inherit a neighbour's values
  const zc = L.makeCanvas(RW, RH), zg = zc.getContext('2d', { willReadFrequently: true });
  zg.drawImage(C.cZ, 0, 0); zg.globalCompositeOperation = 'destination-over';
  for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, 3], [3, -3], [-3, -3]]) zg.drawImage(C.cZ, ox, oy);
  const dZ = px(zc);

  // silhouette with rounded corners; the pillow mask additionally keeps the seams
  const al = new Float32Array(N), ins = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let v = (dA[i * 4 + 3] / 255 - 0.5) * 4.2 + 0.5; v = v < 0 ? 0 : v > 1 ? 1 : v;
    al[i] = v; ins[i] = v >= 0.5 && dP[i * 4 + 3] > 150 ? 1 : 0;
  }
  const dist = edt(ins, RW, RH);

  if (DEBUG) debugComponents(al, RW, RH, X0, Y0);

  // height field
  const nz = L.makeNoise('s24jade');
  let Hh = new Float32Array(N);
  for (let y = 0, i = 0; y < RH; y++) for (let x = 0; x < RW; x++, i++) {
    if (al[i] <= 0) continue;
    const o = i * 4;
    let lv = dZ[o] / 8, b = dZ[o + 1] / 4, k = dZ[o + 2] / 200;
    if (b < 2) { b = 8; k = 0.6; }
    let t = (dist[i] - 0.5) / b; t = t < 0 ? 0 : t > 1 ? 1 : t;
    // the cut form, plus the slow unevenness of a hand-polished surface (no fine grain: jade takes a smooth polish)
    Hh[i] = lv + k * b * Math.sin(t * 1.5708) - GD * dG[o + 3] / 255 + 1.0 * nz.n2(x / 96, y / 96) + 0.4 * nz.n2(x / 41 + 40, y / 41);
  }
  const Hs = blurMasked(Hh, al, RW, RH, 1, 3);
  const Hb = blurMasked(Hs, al, RW, RH, 6, 2);
  Hh = null;

  // lighting
  const Lx = -0.42, Ly = -0.64, Lz = 0.643;
  const hn = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / hn, Hy = Ly / hn, Hz = (Lz + 1) / hn;     // half vector, viewer straight on
  const S2 = (() => { const v = [-0.16, -0.42, 0.89], m = Math.hypot(...v); return v.map((q) => q / m); })();   // the travelling highlight's half vector
  const lxy = Math.hypot(Lx, Ly), ux = Lx / lxy, uy = Ly / lxy, tanE = Lz / lxy;
  const ST = [2, 4, 7, 11, 16, 23, 31], SOX = ST.map((t) => Math.round(t * ux)), SOY = ST.map((t) => Math.round(t * uy));
  const lum = new Float32Array(N), spc = new Float32Array(N), shn = new Float32Array(N);
  for (let y = 0, i = 0; y < RH; y++) for (let x = 0; x < RW; x++, i++) {
    if (al[i] <= 0) continue;
    const h = Hs[i];
    const hl = x > 0 && al[i - 1] > 0 ? Hs[i - 1] : h, hr = x < RW - 1 && al[i + 1] > 0 ? Hs[i + 1] : h;
    const hu = y > 0 && al[i - RW] > 0 ? Hs[i - RW] : h, hd = y < RH - 1 && al[i + RW] > 0 ? Hs[i + RW] : h;
    const nx = -(hr - hl) * 0.5, ny = -(hd - hu) * 0.5, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    const ndl = (nx * Lx + ny * Ly + Lz) * inv;
    let sh = 0;
    for (let q = 0; q < 7; q++) {
      const sx = x + SOX[q], sy = y + SOY[q];
      if (sx < 0 || sy < 0 || sx >= RW) continue;
      const j = sy * RW + sx; if (al[j] <= 0.5) continue;
      const oc = Hs[j] - h - ST[q] * tanE; if (oc > sh) sh = oc;
    }
    sh = sh > 2.5 ? 1 : sh / 2.5;
    let ao = (Hb[i] - h) / 6; ao = ao < 0 ? 0 : ao > 1 ? 1 : ao;
    let dif = (ndl + 0.3) / 1.3; dif = dif < 0 ? 0 : dif > 1 ? 1 : dif;
    const deep = 0.76 + 0.24 * sstep(1, LIFT + 5, h);          // the pierced ground lies in the figures' shade
    lum[i] = dif * (1 - 0.55 * sh) * (1 - 0.5 * ao) * deep;
    const nh = (nx * Hx + ny * Hy + Hz) * inv, n2 = (nx * S2[0] + ny * S2[1] + S2[2]) * inv;
    spc[i] = nh > 0 ? (0.62 * Math.pow(nh, 16) + 0.5 * Math.pow(nh, 60)) * (1 - 0.7 * sh) * deep : 0;   // greasy lustre: broad, with a soft core
    shn[i] = n2 > 0 ? (1.25 * Math.pow(n2, 54) + 0.16 * Math.pow(n2, 9)) * (1 - 0.7 * sh) : 0;
  }
  const lumS = blurMasked(lum, al, RW, RH, 4, 2);     // light diffusing under the surface
  const spS = blurMasked(spc, al, RW, RH, 1, 2);

  // colour
  const rampLUT = (stops) => { const f = L.makeRamp(stops), o = new Float32Array(257 * 3); for (let i = 0; i <= 256; i++) { const c = f(i / 256); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; } return o; };
  const TK = rampLUT([[0, '#5e5848'], [0.28, '#9a9380'], [0.52, '#cdc6b2'], [0.7, '#eae4d3'], [0.86, '#f5f1e4'], [1, '#fcf9f0']]);
  const TN = rampLUT([[0, '#8a7446'], [0.28, '#b9a474'], [0.52, '#d9cba2'], [0.7, '#ebe1c2'], [0.86, '#f4ecd6'], [1, '#fbf6e8']]);
  const img = new ImageData(RW, RH), d = img.data;
  const shImg = new ImageData(RW, SHEEN_H), sd = shImg.data;
  const WOX = []; for (let k = 0; k <= NW; k++) WOX.push(Math.round(k * 0.27));
  for (let y = 0, i = 0; y < RH; y++) for (let x = 0; x < RW; x++, i++) {
    const A = al[i], o = i * 4;
    let r = 0, g = 0, b = 0;
    if (A > 0) {
      const cloud = 1 + 0.05 * nz.n2(x / 230 + 9, y / 150 - 4) + 0.02 * nz.n2(x / 60 - 3, y / 44 + 8);   // the stone's own faint clouding
      let lm = (0.36 * lum[i] + 0.64 * lumS[i]) * cloud; lm = lm < 0 ? 0 : lm > 1 ? 1 : lm;
      const th = sstep(0.06, 0.5, 1 - dT[o + 3] / 255);
      const li = (lm * 256 | 0) * 3, sp = spS[i] * 74;
      r = TK[li] + (TN[li] - TK[li]) * th + sp; g = TK[li + 1] + (TN[li + 1] - TK[li + 1]) * th + sp; b = TK[li + 2] + (TN[li + 2] - TK[li + 2]) * th + sp * 0.9;
      if (y < SHEEN_H) { sd[o] = 255; sd[o + 1] = 250; sd[o + 2] = 234; sd[o + 3] = 255 * A * Math.min(1, shn[i]); }
    }
    let wc = 0, wr = 0, wg = 0, wb = 0;
    if (A < 1) {
      // the wall of the bar above this pixel: the plaque leans back, so its thickness shows under every edge
      let depth = 0, best = 0, bk = 0;
      for (let k = 1; k <= NW; k++) {
        const sy = y - k, sx = x - WOX[k]; if (sy < 0 || sx < 0) break;
        const v = al[sy * RW + sx];
        if (v >= 0.5) { depth = k; break; }
        if (v > best) { best = v; bk = k; }
      }
      if (depth) wc = 1; else if (best > 0) { wc = best; depth = bk; }
      if (wc > 0) { const f = Math.pow(1 - (depth - 1) / NW, 1.7); wr = 16 + 128 * f; wg = 14 + 110 * f; wb = 10 + 78 * f; }
    }
    const aw = (1 - A) * wc, ao = A + aw;
    if (ao > 0) { d[o] = (r * A + wr * aw) / ao; d[o + 1] = (g * A + wg * aw) / ao; d[o + 2] = (b * A + wb * aw) / ao; d[o + 3] = 255 * ao; }
  }
  const jade = L.makeCanvas(RW, RH); jade.getContext('2d').putImageData(img, 0, 0);
  const sheen = L.makeCanvas(RW, SHEEN_H); sheen.getContext('2d').putImageData(shImg, 0, 0);

  // the finished plate: black ground, jade, key-light pool, depth of field, a little halation
  const full = (g) => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  const layer = L.makeLayer(PAD, (g) => {
    g.fillStyle = BLACK; full(g);
    // black cloth: a barely visible nap and a few specks of lint, a touch more where the key light lands
    { const r = L.rng('s24cloth'), n = 256, t = L.makeCanvas(n, n), tg = t.getContext('2d'), id = tg.createImageData(n, n);
      for (let i = 0; i < n * n; i++) { const v = 3 + 9 * Math.pow(r(), 2.2); id.data[i * 4] = v * 1.05; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v * 0.94; id.data[i * 4 + 3] = 255; }
      tg.putImageData(id, 0, 0);
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = g.createPattern(t, 'repeat'); full(g);
      for (let i = 0; i < 520; i++) {
        const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), q = Math.pow(r(), 3);
        g.fillStyle = `rgba(232,226,210,${(0.05 + 0.3 * q).toFixed(3)})`;
        g.beginPath(); g.arc(x, y, 0.5 + 1.1 * q, 0, TAU); g.fill();
      }
      g.restore();
      g.globalCompositeOperation = 'multiply';
      const lc = a.pt(-0.1, 160);
      g.fillStyle = L.radial(g, lc.x, lc.y, 150, 1250, [[0, '#ffffff'], [1, '#4a4a4a']]); full(g);
      g.globalCompositeOperation = 'source-over';
    }
    const jl = L.makeLayer(PAD, (q) => {
      q.drawImage(jade, X0, Y0);
      q.globalCompositeOperation = 'source-atop';
      // key-light pool: brightest just left of the crest, falling away to the sides and the bottom corners
      const pc = a.pt(-0.07, -150);
      q.globalCompositeOperation = 'multiply';
      q.fillStyle = L.radial(q, pc.x, pc.y, 220, 1500, [[0, '#ffffff'], [0.36, '#ece7db'], [0.7, '#b3ad9e'], [1, '#7a7568']]); full(q);
      q.globalCompositeOperation = 'destination-in'; q.drawImage(jade, X0, Y0);
      q.globalCompositeOperation = 'source-over';
    });
    g.drawImage(jl, -PAD, -PAD);
  });
  const lg = layer.getContext('2d');
  const fx = a.cx - 30, fy = a.crestY + 130;
  const dof = (blurPx, r0, r1) => {
    const b = L.blurred(layer, blurPx), bg = b.getContext('2d');
    bg.globalCompositeOperation = 'destination-in';
    bg.save(); bg.translate(PAD + fx, PAD + fy); bg.scale(1.9, 0.75);
    bg.fillStyle = L.radial(bg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); bg.fillRect(-4000, -4000, 8000, 8000);
    bg.restore();
    return b;
  };
  const s1 = dof(2.4, 250, 540), s2 = dof(6, 400, 720);
  lg.drawImage(s1, -PAD, -PAD); lg.drawImage(s2, -PAD, -PAD);
  const bloom = L.blurred(layer, 18);
  lg.globalCompositeOperation = 'screen'; lg.globalAlpha = 0.17; lg.drawImage(bloom, -PAD, -PAD);
  lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;

  const scratch = L.makeCanvas(RW, SHEEN_H);
  return { layer, sheen, scratch, sg: scratch.getContext('2d'), X0, Y0 };
}

const DEBUG = true;
function debugComponents(al, w, h, X0, Y0) {
  const lab = new Int32Array(w * h), q = new Int32Array(w * h); let n = 0; const out = [];
  for (let s = 0; s < w * h; s++) {
    if (al[s] < 0.5 || lab[s]) continue;
    n++; let qa = 0, qb = 0; q[qb++] = s; lab[s] = n; let cnt = 0, sx = 0, sy = 0;
    while (qa < qb) {
      const i = q[qa++], x = i % w, y = (i / w) | 0; cnt++; sx += x; sy += y;
      if (x > 0 && !lab[i - 1] && al[i - 1] >= 0.5) { lab[i - 1] = n; q[qb++] = i - 1; }
      if (x < w - 1 && !lab[i + 1] && al[i + 1] >= 0.5) { lab[i + 1] = n; q[qb++] = i + 1; }
      if (y > 0 && !lab[i - w] && al[i - w] >= 0.5) { lab[i - w] = n; q[qb++] = i - w; }
      if (y < h - 1 && !lab[i + w] && al[i + w] >= 0.5) { lab[i + w] = n; q[qb++] = i + w; }
    }
    out.push([cnt, Math.round(sx / cnt + X0), Math.round(sy / cnt + Y0)]);
  }
  let cover = 0; for (let i = 0; i < w * h; i++) cover += al[i];
  console.warn('s24 components (px, x, y): ' + JSON.stringify(out.sort((p, r) => r[0] - p[0]).slice(0, 12)) + ' coverage ' + (cover / (w * h)).toFixed(3));
}

export default {
  name: '白玉透雕',
  tone: 'light',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0058, 0.0058, p), zoom = L.lerp(1.0, 1.02, p), dy = -1 + 1.6 * p;
    L.blit(ctx, env, S.layer, { rot, zoom, dy });
    // one soft greasy highlight travelling along the rim: the light stays put while the carving slides under it
    const sg = S.sg, th = L.lerp(-0.13, 0.03, p) - rot, c = a.pt(th, -44);
    sg.globalCompositeOperation = 'copy'; sg.drawImage(S.sheen, 0, 0);
    sg.globalCompositeOperation = 'destination-in';
    sg.save(); sg.translate(c.x - S.X0, c.y - S.Y0); sg.rotate(th); sg.scale(3.3, 1);
    sg.fillStyle = L.radial(sg, 0, 0, 0, 175, [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
    sg.fillRect(-3000, -3000, 6000, 6000);
    sg.restore();
    L.cam(ctx, env, { rot, zoom, dy }, () => { ctx.globalCompositeOperation = 'screen'; ctx.drawImage(S.scratch, S.X0, S.Y0); });
  },
};
