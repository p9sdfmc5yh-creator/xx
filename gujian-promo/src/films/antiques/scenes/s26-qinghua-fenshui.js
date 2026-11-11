// s26 — 青花分水. Macro of an underglaze-blue porcelain surface: two hand-thrown cobalt rings (弦纹, one broad, one narrow)
// ride the arc; under them the top of a scrolling lotus (缠枝莲) painted the 分水 way — dark outlines first, then watery
// cobalt floated inside them in three strengths, each wash drying to a darker tide line, with a thin white "水路" left
// between wash and outline. Above the rings the glaze is left blank.
//
// How it is made: everything blue is first accumulated as PIGMENT DENSITY, not colour —
//   · the scroll is drawn into masks (outline, wash 1/2/3, plus one for the faint tips above the rings) in painter's order,
//     each new blade erasing what it covers;
//   · tide lines = mask × (1 − blurred mask); the masks are packed into the R/G/B channels of one canvas and read back once;
//   · the two rings are computed per pixel in polar coordinates (u = px along the arc, v = px below it): brush-hair streaks,
//     pooled edges, 飞白 where the brush runs dry, and a joint where the lap closes (接笔);
//   · density × pooling × granulation → one cobalt ramp (淡水 → 钴蓝 → 浓料). Glaze, bubbles, focus and sheen go on top.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 80;
const Y0 = 250;                         // the pigment work area starts at this frame row (nothing is painted higher up)
const MW = W + PAD * 2, MH = H + PAD - Y0;
const GAP = 9.5;                        // 水路: the white left between a wash and its outline
const TH = 84;                          // broad ring: v ∈ [0, TH]  → its upper edge IS the arc
const N_C = 128, N_H = 10;              // narrow ring: centre depth and half-width
const UJ = -520, UJ2 = -880;            // where each ring's lap closes, in mirrored u (the brush travelled right → left)
const DMAX = 1.45;
const SX = -PAD, SY = 560, SW = 1040, SH = 440;   // frame rect that holds the glaze reflection
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** rounded window over s ∈ (a, b): ~1 inside, closing with a blunt nose at both ends */
const win = (s, a, b) => { const t = Math.abs((2 * (s - a)) / (b - a) - 1); return t >= 1 ? 0 : Math.sqrt(1 - t * t * t * t * t); };

/** smooth width profile through [[s, value]…] (Catmull-Rom) */
function prof(tab) {
  const n = tab.length, m = [];
  for (let i = 0; i < n; i++) { const p = tab[Math.max(0, i - 1)], q = tab[Math.min(n - 1, i + 1)]; m.push((q[1] - p[1]) / (q[0] - p[0])); }
  return (s) => {
    if (s <= tab[0][0]) return tab[0][1];
    if (s >= tab[n - 1][0]) return tab[n - 1][1];
    let i = 1; while (tab[i][0] < s) i++;
    const h = tab[i][0] - tab[i - 1][0], t = (s - tab[i - 1][0]) / h, t2 = t * t, t3 = t2 * t;
    return Math.max(0, (2 * t3 - 3 * t2 + 1) * tab[i - 1][1] + (t3 - 2 * t2 + t) * h * m[i - 1] + (-2 * t3 + 3 * t2) * tab[i][1] + (t3 - t2) * h * m[i]);
  };
}
const PETAL = prof([[0, 0.5], [0.16, 0.84], [0.4, 1], [0.64, 0.86], [0.82, 0.5], [0.93, 0.2], [1, 0]]);    // lotus petal with an ogee tip
const SCROLL = prof([[0, 0.14], [0.2, 0.46], [0.48, 0.92], [0.68, 1], [0.84, 0.74], [0.94, 0.38], [1, 0]]); // curled leaf: slim stalk, full rolled head

/** polygon round a dense axis polyline: half-width wl(s) on one side, wr(s) on the other, for s ∈ [s0, s1] */
function ribbon(axis, wl, wr = wl, s0 = 0, s1 = 1) {
  const n = axis.length, A = [], B = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1); if (s < s0 - 1e-6) continue; if (s > s1 + 1e-6) break;
    const p = axis[Math.max(0, i - 1)], q = axis[Math.min(n - 1, i + 1)];
    let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const l = wl(s), r = wr(s);
    A.push([axis[i][0] + nx * l, axis[i][1] + ny * l]); B.push([axis[i][0] - nx * r, axis[i][1] - ny * r]);
  }
  return { left: A, right: B, poly: A.concat(B.slice().reverse()) };
}
/** an axis that starts at (bu,bv) heading `ang` and curls by `curl` radians, mostly toward its tip */
function curlAxis(bu, bv, ang, len, curl, pw = 2) {
  const pts = [[bu, bv]], N = 16; let x = bu, y = bv;
  for (let i = 1; i <= N; i++) { const h = ang + curl * Math.pow((i - 0.5) / N, pw); x += (Math.cos(h) * len) / N; y += (Math.sin(h) * len) / N; pts.push([x, y]); }
  return pts;
}

// ───────────────────────── the two rings (per pixel, polar) ─────────────────────────
/** one pass of a loaded brush between edges e0..e1 (px below the arc): pooled edges, hair streaks, 飞白 when dry */
function lap(nb, u, v, e0, e1, load, dry, so, gr) {
  const c = L.clamp((v - e0) / 1.6 + 0.5) * L.clamp((e1 - v) / 1.6 + 0.5);
  if (c <= 0) return 0;
  const t = (v - e0) / (e1 - e0), ed = Math.abs(2 * t - 1);
  const hair = nb.fbm(u / 520 + so, v / 4.4 + so * 3.7, 3, 2.2, 0.55) * 0.5 + 0.5;
  const fine = nb.n2(u / 95 + so, v / 1.8) * 0.5 + 0.5;
  const dd = dry * (1 - 0.6 * ed * ed * ed);                       // the edges of a stroke hold their colour longest
  const fw = sstep(0.8 - 0.55 * dd, 0.93 - 0.55 * dd, hair * 0.8 + fine * 0.2 + 0.12 * (gr - 0.5));
  const body = load * (0.74 + 0.3 * Math.pow(ed, 2.6)) * (0.74 + 0.5 * hair) * (0.76 + 0.48 * gr) + 0.3 * load * sstep(0.8, 0.96, nb.n2(u / 7.3 + so, v / 5.1) * 0.5 + 0.5);
  return c * (body * (1 - 0.95 * fw) + fw * 0.34 * sstep(0.5, 0.78, gr));
}
function ringDensity(nb, u, v, x, y) {
  let d = 0;
  const gr = nb.n2(x / 3.5, y / 3.5) * 0.5 + 0.5;                  // cobalt granulation
  if (v < TH + 16) {
    const rag = 1.1 * nb.n2(u / 13, 5.5);
    const w0 = 2.0 * nb.n2(u / 260, 1.3) + rag * 0.8;
    const w1 = 3.6 * nb.n2(u / 300, 21.1) + 1.6 * nb.n2(u / 60, 3.3) + rag;
    let dA = 0, dB = 0;
    if (u < UJ + 190) {
      // the end of the turn: thinner colour, running dry, drifting off register and lifting just past the joint
      const tail = sstep(UJ - 900, UJ, u), lift = sstep(UJ + 10, UJ + 185, u), drift = sstep(UJ - 460, UJ, u);
      const e0 = w0 + 3 * drift + lift * TH * 0.36, e1 = TH + w1 - 5 * drift - lift * TH * 0.52;
      if (e1 - e0 > 1) dA = lap(nb, u, v, e0, e1, 0.9 + 0.1 * nb.n2(u / 420, 9.9) - 0.17 * tail, 0.2 + 0.2 * nb.n2(u / 640, 15.5) + 0.34 * tail + 0.3 * lift, 0, gr);
    }
    if (u > UJ - 14) {
      // the fresh start: a blunt, well loaded head, then a long even run that slowly dries
      const k = u - UJ, blob = Math.exp(-(((k - 34) / 44) ** 2));
      const start = sstep(-8, 7, k - 6 * nb.n2(v / 9, 77.7));
      const e0 = w0 - 1.6 * blob, e1 = TH + w1 + 6 * blob;
      dB = start * lap(nb, u, v, e0, e1, 1.0 + 0.12 * blob - 0.1 * sstep(0, 1200, k) + 0.08 * nb.n2(u / 420, 33.3),
        0.13 + 0.16 * (nb.n2(u / 640, 44.4) * 0.5 + 0.5) + 0.3 * sstep(500, 1750, k), 50, gr);
    }
    d = dA + dB * (1 - 0.5 * Math.min(1, dA));
  }
  if (v > N_C - 26 && v < N_C + 26) {
    const k = u - UJ2, blob = Math.exp(-(((k - 16) / 30) ** 2));
    const c0 = N_C + 2.2 * nb.n2(u / 330, 40.2) + 0.8 * nb.n2(u / 50, 47.1);
    const hw = N_H + 3.4 * nb.n2(u / 230, 51.7) + 3 * blob;
    const before = k < 0 ? sstep(-520, 0, k) : 0;
    d += lap(nb, u, v, c0 - hw, c0 + hw, 0.88 + 0.14 * nb.n2(u / 380, 60.6) + 0.2 * blob - 0.2 * before,
      0.12 + 0.3 * (nb.n2(u / 560, 70.7) * 0.5 + 0.5) + 0.4 * before, 120, gr);
  }
  return d;
}

// ───────────────────────── the pigment layer ─────────────────────────
function buildPigment(env) {
  const a = env.arc, R = a.R;
  const P = (u, v) => { const th = u / R, r = R - v; return [a.cx + r * Math.sin(th), a.cy - r * Math.cos(th)]; };
  const mk = () => { const g = L.makeCanvas(MW, MH).getContext('2d'); g.translate(PAD, -Y0); g.lineJoin = 'round'; g.lineCap = 'round'; return g; };
  const LN = mk(), W1 = mk(), W2 = mk(), W3 = mk(), W0 = mk(), WS = [W1, W2, W3];
  const nzB = L.makeNoise('s26blade');

  const trace = (g, uv) => { g.beginPath(); for (let i = 0; i < uv.length; i++) { const q = P(uv[i][0], uv[i][1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.closePath(); };
  /** a new shape goes on top: clear what it covers, and keep the washes underneath a 水路 away from it */
  const erase = (uv, gap = GAP) => {
    for (const g of [LN, W1, W2, W3]) {
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; trace(g, uv); g.fill();
      if (g !== LN && gap) { g.strokeStyle = '#000'; g.lineWidth = gap * 2; g.stroke(); }
      g.globalCompositeOperation = 'source-over';
    }
  };
  const fill = (g, uv, alpha = 1) => { g.fillStyle = `rgba(255,255,255,${alpha})`; trace(g, uv); g.fill(); };
  const dot = (u, v, r, alpha = 1) => { const q = P(u, v); LN.fillStyle = `rgba(255,255,255,${alpha})`; LN.beginPath(); LN.arc(q[0], q[1], r, 0, TAU); LN.fill(); };
  let nLine = 0;
  /** outline stroke: loaded at its head, thinning and paling toward its tail */
  const line = (uv, w, o = {}) => {
    const pts = uv.map((q) => P(q[0], q[1])), al = o.alpha === undefined ? 0.95 : o.alpha;
    const opt = { width: w, color: '#fff', seed: 's26l' + (nLine++), taper: o.taper || [0.04, 0.3], wobble: o.wobble === undefined ? 0.4 : o.wobble, smoothStep: 2.5 };
    L.inkStroke(LN, pts, { ...opt, alpha: al * 0.84 });
    if (pts.length > 8 && !o.even) L.inkStroke(LN, pts.slice(0, Math.ceil(pts.length * 0.62)), { ...opt, taper: [opt.taper[0], 0.5], alpha: al * 0.6 });
  };

  /**
   * one outlined, water-shaded blade (petal or leaf) along a control polyline.
   * ws: up to three washes [from, to, widthFactor, side, back] — side ±1 keeps the wash to one flank of the axis.
   * Washes are always filled opaque: a translucent mask would leave a false tide-line residue all over its inside
   * (mask × (1 − blurred mask) ≠ 0 there), so paleness is set by the channel weights instead; `faint` → the W0 mask.
   */
  let nBlade = 0;
  function blade(ctrl, hw, PROF, o = {}) {
    const { ws, lw = 6, la = 0.95, rib = 0, faint = 0 } = o;
    const k = (nBlade++) * 3.71 + 0.5;
    const axis = L.smoothPath(ctrl, 4);
    const wf = (s) => hw * PROF(s);
    const out = ribbon(axis, wf);
    erase(out.poly);
    const in1 = (s) => Math.max(0, wf(s) - GAP * (0.8 + 0.62 * nzB.n2(s * 3.2, k)));     // the 水路 is never quite even
    ws.forEach((w, i) => {
      if (!w) return;
      const [a0, b0, kf = 1, side = 0, back = 0] = w;
      const b = b0 * (1 + 0.05 * nzB.n2(k, i * 7.7));
      const full = (s) => in1(s) * kf * win(s, a0, b) * (1 + (i ? 0.1 * nzB.n2(s * 4.5, k + 9 * i) : 0));
      const far = side ? (s) => -in1(s) * back * win(s, a0, b) : full;
      fill(faint ? W0 : WS[i], ribbon(axis, side < 0 ? far : full, side > 0 ? far : full, Math.max(0, a0), Math.min(1, b)).poly);
    });
    line(out.left, lw, { alpha: la });
    line(out.right, lw, { alpha: la });
    if (rib) line(axis.slice(3, Math.floor(axis.length * rib)), lw * 0.62, { alpha: la * 0.9, taper: [0.03, 0.55] });
  }
  const pet = (fu, fv, phi, r0, r1, hw, bend, e1, e2) => {
    const b = [fu + r0 * Math.sin(phi), fv - r0 * Math.cos(phi)], t = [fu + r1 * Math.sin(phi), fv - r1 * Math.cos(phi)];
    blade([b, [(b[0] + t[0]) / 2 + (t[1] - b[1]) * bend, (b[1] + t[1]) / 2 - (t[0] - b[0]) * bend], t], hw, PETAL,
      { ws: [[-0.35, 0.86, 1], [-0.35, e1, 0.82], [-0.35, e2, 0.6]] });
  };
  /** 卷叶: pale all over, deeper along the inside of the roll, darkest in the curl itself */
  const leaf = (bu, bv, ang, len, hw, curl, o = {}) => {
    const sd = curl > 0 ? 1 : -1;
    blade(curlAxis(bu, bv, ang, len, curl), hw, SCROLL, { ws: [[-0.25, 0.975, 1], [0.16, 0.985, 0.97, sd, 0.05], [0.56, 0.99, 0.95, sd, 0.38]], rib: 0.62, lw: 5.6, ...o });
  };
  /** a stem: one wet stroke, no outline — the colour pools along both edges as it dries */
  const nzS = L.makeNoise('s26stem');
  const stem = (pts, w, darks) => {
    const axis = L.smoothPath(pts, 5), wf = (s) => (w / 2) * (1 + 0.28 * nzS.n2(s * 13, w));
    erase(ribbon(axis, wf).poly, GAP * 0.7);
    fill(W1, ribbon(axis, wf).poly); fill(W2, ribbon(axis, (s) => wf(s) * 0.92).poly);
    for (const [p, q] of darks) fill(W3, ribbon(axis, (s) => wf(s) * 0.84 * win(s, p, q), undefined, p, q).poly);
  };

  /** lotus seen from the front: two tiers of eight broad pointed petals round a seed pod ringed with stamens */
  function lotusFront(fu, fv, Rf, rot, seed) {
    const r = L.rng(seed), N = 8;
    const up = (p) => Math.abs(Math.atan2(Math.sin(p), Math.cos(p)));
    const tier = (off, r0, r1, hw) => {
      const items = [];
      for (let i = 0; i < N; i++) items.push({ phi: rot + ((i + off + r.range(-0.11, 0.11)) * TAU) / N, k: r.range(0.92, 1.07), h: r.range(0.92, 1.08), b: r.range(-0.09, 0.09), e1: r.range(0.56, 0.72), e2: r.range(0.3, 0.44) });
      items.sort((p, q) => up(q.phi) - up(p.phi));                 // lowest petals first, the top one last → it sits in front
      for (const it of items) pet(fu, fv, it.phi, Rf * r0, Rf * r1 * it.k, Rf * hw * it.h, it.b, it.e1, it.e2);
    };
    tier(0, 0.34, 1.0, 0.27);
    tier(0.5, 0.13, 0.68, 0.2);
    const circ = (rad, n = 44, cu = fu, cv = fv) => { const pts = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU; pts.push([cu + rad * Math.sin(t), cv - rad * Math.cos(t)]); } return pts; };
    erase(circ(Rf * 0.3), 0);
    for (let i = 0; i < 30; i++) {                                   // stamens: a loose fringe, no two alike
      if (r.chance(0.12)) continue;
      const t = ((i + r.range(-0.32, 0.32)) / 30) * TAU, r0 = Rf * 0.214, r1 = Rf * r.range(0.244, 0.288), t1 = t + r.range(-0.05, 0.05);
      line([[fu + r0 * Math.sin(t), fv - r0 * Math.cos(t)], [fu + r1 * Math.sin(t1), fv - r1 * Math.cos(t1)]], r.range(3, 4.2), { taper: [0, 0], alpha: 0.88, even: 1 });
      dot(fu + r1 * Math.sin(t1), fv - r1 * Math.cos(t1), r.range(3.8, 5.6), 0.95);
    }
    const rp = Rf * 0.19;                                            // seed pod
    fill(W1, circ(rp - GAP * 0.75), 1);
    fill(W2, circ(rp * 0.66, 30, fu + rp * 0.16, fv + rp * 0.2), 1);
    const ring = circ(rp, 48); ring.push(ring[0], ring[1], ring[2]);
    line(ring, 7, { taper: [0, 0], wobble: 0.25, even: 1 });
    dot(fu, fv, 7);
    for (let i = 0; i < 6; i++) { const t = ((i + 0.3) / 6) * TAU; dot(fu + rp * 0.56 * Math.sin(t), fv - rp * 0.56 * Math.cos(t), r.range(5.6, 7.2)); }
  }

  // ── the scroll, back to front: leaves, then the stems they spring from, then the flower ──
  const vsR = (u) => 392 + 152 * Math.cos((u / 1560) * TAU), vsL = (u) => 400 + 150 * Math.cos((u / 1640) * TAU);   // the wave: trough under the flower, crests either side
  leaf(520, vsR(520), -2.45, 330, 56, -3.4);
  leaf(700, vsR(700), 1.0, 300, 52, 3.3);
  leaf(880, vsR(880), -0.5, 225, 42, 3.3);
  leaf(-545, vsL(-545), Math.PI + 2.45, 345, 58, 3.4);
  leaf(-735, vsL(-735), Math.PI - 1.08, 285, 50, -3.3);
  leaf(-930, vsL(-930), Math.PI + 0.5, 215, 40, -3.3);
  { const pts = []; for (let u = 120; u <= 1320; u += 40) pts.push([u, vsR(u) + 4 * nzS.n2(u / 170, 3.1)]); stem(pts, 22, [[0.02, 0.3], [0.46, 0.6], [0.72, 0.98]]); }
  { const pts = []; for (let u = -120; u >= -1320; u -= 40) pts.push([u, vsL(u) + 4 * nzS.n2(u / 170, 8.6)]); stem(pts, 23, [[0.0, 0.24], [0.38, 0.5], [0.62, 0.9]]); }
  lotusFront(0, 478, 292, 0.04, 's26lotus');
  // a breath of the next band, far out on either side above the rings
  blade(curlAxis(-1108, -338, 0.2, 420, 2.4), 48, SCROLL, { ws: [[-0.25, 0.975, 1]], la: 0.16, lw: 5.5, faint: 1 });
  blade(curlAxis(1100, -330, Math.PI - 0.24, 400, -2.3), 46, SCROLL, { ws: [[-0.25, 0.975, 1]], la: 0.14, lw: 5.5, faint: 1 });

  // ── pack the masks: R = outline, G = wash strength, B = tide lines ──
  const comp = L.makeCanvas(MW, MH), cg = comp.getContext('2d');
  cg.fillStyle = '#000'; cg.fillRect(0, 0, MW, MH);
  const sg = L.makeCanvas(MW, MH).getContext('2d');
  const add = (mask, color, alpha) => {
    sg.globalCompositeOperation = 'copy'; sg.drawImage(mask, 0, 0);
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = color; sg.fillRect(0, 0, MW, MH);
    cg.globalCompositeOperation = 'lighter'; cg.globalAlpha = alpha; cg.drawImage(sg.canvas, 0, 0);
  };
  const rim = (mask, px) => { const g = L.makeCanvas(MW, MH).getContext('2d'); g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(L.blurred(mask, px), 0, 0); return g.canvas; };
  add(LN.canvas, '#ff0000', 1);
  add(L.blurred(W1.canvas, 1.2), '#00ff00', 0.13);
  add(L.blurred(W2.canvas, 2.6), '#00ff00', 0.22);                 // the deeper washes went on wet: soft fronts
  add(L.blurred(W3.canvas, 2.6), '#00ff00', 0.34);
  add(L.blurred(W0.canvas, 2), '#00ff00', 0.06);
  add(rim(W1.canvas, 4), '#0000ff', 0.9); add(rim(W1.canvas, 16), '#0000ff', 0.22);
  add(rim(W2.canvas, 5), '#0000ff', 0.6); add(rim(W3.canvas, 5), '#0000ff', 0.6); add(rim(W0.canvas, 5), '#0000ff', 0.16);
  cg.globalAlpha = 0.2; cg.drawImage(L.blurred(comp, 4), 0, 0);    // 晕散: the blue bleeds a little into the glaze
  cg.globalAlpha = 1; cg.globalCompositeOperation = 'source-over';

  // ── density ──
  const src = cg.getImageData(0, 0, MW, MH).data;
  const read = (o) => L.noiseTex(MW, MH, o).getContext('2d').getImageData(0, 0, MW, MH).data;
  const lo = read({ seed: 's26lo', scale: 170, octaves: 3, res: 0.25, warp: 0.7, contrast: 1.5 });      // how much colour each stroke carried
  const cl = read({ seed: 's26cl', scale: 38, octaves: 3, res: 0.25, warp: 1.1, contrast: 1.6 });       // where the water pooled as it dried
  const mi = read({ seed: 's26mi', scale: 9, octaves: 2, res: 0.5, contrast: 1.7 });                    // pigment mottle
  const dens = new Float32Array(MW * MH);
  for (let k = 0, o = 0; k < MW * MH; k++, o += 4) {
    const ln = src[o], wa = src[o + 1], rm = src[o + 2];
    if (ln + wa + rm < 3) continue;
    const l = lo[o] / 255, c = cl[o] / 255, m = mi[o] / 255, w = wa / 255;
    dens[k] = w * (0.56 + 0.5 * l + 0.4 * c) * (0.86 + 0.28 * m) + (rm / 255) * (0.45 + 0.9 * m) + w * sstep(0.6, 0.88, c * 0.62 + m * 0.38) * 0.3 + (ln / 255) * (0.74 + 0.5 * m);
  }
  const nb = L.makeNoise('s26ring');
  for (let i = 0; i < MW; i++) {
    const x = i - PAD, dx = x - a.cx;
    const j0 = Math.max(0, Math.floor(a.yAt(x) - Y0 - 8)), j1 = Math.min(MH - 1, j0 + 200);
    for (let j = j0; j <= j1; j++) {
      const y = j + Y0, dy = a.cy - y, v = R - Math.sqrt(dx * dx + dy * dy);
      if (v < -6 || v > N_C + 26) continue;
      const d = ringDensity(nb, -Math.atan2(dx, dy) * R, v, x, y);
      if (d > 0) dens[j * MW + i] += d;
    }
  }

  // ── density → cobalt ──
  const ramp = L.makeRamp([[0, 'rgba(150,180,232,0)'], [0.03, 'rgba(150,180,232,0.5)'], [0.11, 'rgba(134,166,220,0.97)'], [0.2, '#5f86d2'], [0.32, '#3059bd'],
    [0.42, '#1c3fa0'], [0.56, '#152f80'], [0.7, '#0e1c50'], [1, '#070d2c']]);
  const NL = 1024, lut = new Uint8ClampedArray(NL * 4);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = c[3] * 255; }
  const out = new ImageData(MW, MH), od = out.data;
  for (let j = 0, k = 0; j < MH; j++) for (let i = 0; i < MW; i++, k++) {
    const d = dens[k]; if (d <= 0.002) continue;
    const q = Math.min(NL - 1, ((d * (0.9 + 0.2 * hash(i, j))) / DMAX) * (NL - 1) | 0) * 4, o = k * 4;
    od[o] = lut[q]; od[o + 1] = lut[q + 1]; od[o + 2] = lut[q + 2]; od[o + 3] = lut[q + 3];
  }
  const pig = L.makeCanvas(MW, MH);
  pig.getContext('2d').putImageData(out, 0, 0);
  return pig;
}

// ───────────────────────── glaze, light, focus ─────────────────────────
function buildLayer(env, pig) {
  const a = env.arc;
  const layer = L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.fillStyle = '#e4edf2'; full();
    // key light from the upper left; 釉影 gathers toward the lower right
    g.fillStyle = L.linear(g, 150, 0, W - 150, H, [[0, 'rgba(240,246,250,0.6)'], [0.4, 'rgba(228,237,242,0)'], [1, 'rgba(190,207,221,0.72)']]); full();
    // a broad, smooth bloom of that light on the gloss, well clear of the caption
    g.fillStyle = L.radial(g, 290, 130, 0, 780, [[0, 'rgba(255,255,255,0.9)'], [0.22, 'rgba(252,254,255,0.55)'], [0.6, 'rgba(246,250,253,0.14)'], [1, 'rgba(244,249,252,0)']]); full();
    // below the rings the wall of the dish falls away from the light
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 640, a.R - 132, [[0, 'rgba(198,213,224,0.5)'], [0.7, 'rgba(198,213,224,0.3)'], [1, 'rgba(198,213,224,0)']]); full();
    g.drawImage(pig, -PAD, Y0);
    // the glaze over the painting: a few pin-holes, and bubbles that only show over the blue
    const clear = (x, y) => !(x > 590 && x < 1330 && y > a.crestY - 300 && y < a.crestY - 2);   // keep the caption area spotless
    L.speckle(g, { seed: 's26pin', count: 110, x: -PAD, y: -PAD, w: W + PAD * 2, h: H + PAD * 2, rMin: 0.9, rMax: 2.4, colors: ['#9fb3c6', '#8a9db4', '#b3c4d4'], alpha: [0.25, 0.6], test: clear });
    L.speckle(g, { seed: 's26bub', count: 5200, x: -PAD, y: -PAD, w: W + PAD * 2, h: H + PAD * 2, rMin: 0.6, rMax: 1.9, colors: ['#ffffff', '#e6f0ff'], alpha: [0.08, 0.4] });
  });
  // shallow focus: sharp round the crest, softening toward the sides and the bottom corners
  const lg = layer.getContext('2d');
  const soft = (px, r0, r1) => {
    const b = L.blurred(layer, px), bg = b.getContext('2d');
    bg.globalCompositeOperation = 'destination-in';
    bg.translate(PAD + a.cx, PAD + a.crestY + 70); bg.scale(1, 0.72);
    bg.fillStyle = L.radial(bg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    bg.fillRect(-3000, -3000, 6000, 6000);
    return b;
  };
  const s1 = soft(2.2, 520, 1000), s2 = soft(5, 860, 1350);
  lg.drawImage(s1, -PAD, -PAD); lg.drawImage(s2, -PAD, -PAD);
  return layer;
}

/** 釉光: the soft reflection of a strip of window light, bent round the dish and lying across both rings */
function buildSheen(env) {
  const a = env.arc, nz = L.makeNoise('s26sheen');
  const cw = SW / 2, ch = SH / 2, img = new ImageData(cw, ch), d = img.data;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = SX + i * 2 + 1, y = SY + j * 2 + 1, dx = x - a.cx, dy = a.cy - y;
    const u = Math.atan2(dx, dy) * a.R;
    const v = a.R - Math.sqrt(dx * dx + dy * dy) + 3 * nz.n2(u / 70, y / 50) + 1.2 * nz.n2(u / 19, y / 17);   // the glaze is never optically flat
    if (v < -40 || v > 240) continue;
    const al = Math.exp(-(((v - 86) / 48) ** 2)) * sstep(-940, -640, u) * (1 - sstep(-430, -150, u)) * 0.64;
    const o = (j * cw + i) * 4;
    d[o] = 250; d[o + 1] = 253; d[o + 2] = 255; d[o + 3] = al * 255;
  }
  const c = L.makeCanvas(cw, ch);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

export default {
  name: '青花分水',
  tone: 'dark',
  init(env) {
    S = { layer: buildLayer(env, buildPigment(env)), sheen: buildSheen(env) };
  },
  draw(ctx, env, p) {
    L.blit(ctx, env, S.layer, { rot: L.lerp(-0.0038, 0.0038, p) });
    // the reflection slides along the arc as the eye moves
    L.cam(ctx, env, { rot: L.lerp(-0.011, 0.011, p) }, () => {
      ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(S.sheen, SX, SY, SW, SH);
    });
  },
};
