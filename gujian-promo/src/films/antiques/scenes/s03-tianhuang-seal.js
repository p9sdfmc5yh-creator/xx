// s03 — 田黄印石. The arc is the rounded, pebble-shaped top (随形印顶) of a tianhuang seal stone, seen so close that the dome
// fills everything below the line. The stone is translucent like set honey and lit from behind: bright yellow where it is
// thin at the limb, deepening to orange and red-brown where it is thick. Inside it hang the fine, near-parallel "radish
// threads" (萝卜丝纹) and two thin red veins (红筋); on the polished surface only a few sand specks and hairline rubs.
// Above the arc: black, with a narrow warm halo hugging the stone.
//
// Depth is sold by parallax: the body (with its deepest threads), the mid threads + veins and the surface marks are three
// separate layers that slide along the arc at different speeds, so the threads visibly sit INSIDE the stone.
// Everything is laid out in surface coordinates (U along the arc, Sv down the meridian of a pebble whose profile toward
// the lens has radius RE), so threads and specks foreshorten toward the limb like marks on a real dome.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PADX = 130, PADB = 70, TOP = 14;   // the layers are cropped to the stone: side / bottom margins for the camera move
const RE = 1400;                         // radius of the pebble's profile toward the lens (px)
const PHI0 = 1.1;                        // mean direction of the radish threads in surface space (rad from the U axis)
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function geo(env) {
  const a = env.arc;
  const X0 = -PADX, Y0 = Math.floor(a.crestY) - TOP;
  const RW = W + PADX * 2, RH = H + PADB - Y0;
  // surface point → frame coords
  const toXY = (U, Sv) => {
    const d = RE * (1 - Math.cos(L.clamp(Sv, 0, RE * 1.5) / RE)), rr = a.R - d, th = U / a.R;
    return [a.cx + rr * Math.sin(th), a.cy - rr * Math.cos(th)];
  };
  return { a, X0, Y0, RW, RH, toXY, UMAX: a.span(PADX + 60) * a.R };
}
/** a cropped layer in frame coordinates */
function mk(G) {
  const c = L.makeCanvas(G.RW, G.RH), g = c.getContext('2d');
  g.translate(-G.X0, -G.Y0); c._x0 = G.X0; c._y0 = G.Y0;
  return [c, g];
}
const soft = (c, px) => { const o = L.blurred(c, px); o._x0 = c._x0; o._y0 = c._y0; return o; };
/** L.blit for cropped layers: rot about the arc centre, zoom about the crest */
function blitC(ctx, env, layer, { rot = 0, zoom = 1, alpha = 1, blend = 'source-over' } = {}) {
  const a = env.arc;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = blend;
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(layer, layer._x0, layer._y0);
  ctx.restore();
}

// ── the flow field the threads follow: nearly parallel, bending slowly ──
const nF = L.makeNoise('tianhuang-field');
const fieldAngle = (U, Sv) => PHI0 + 0.5 * nF.fbm(U / 1000, Sv / 1000, 2) + 0.16 * nF.n2(U / 240 + 7.3, Sv / 240 - 2.1);
function trace(U0, S0, len, wig, nW, ws) {
  const step = 16, half = Math.max(2, Math.round(len / step / 2));
  const fwd = [], back = [];
  let U = U0, Sv = S0;
  for (let i = 0; i < half; i++) { const ph = fieldAngle(U, Sv); U += Math.cos(ph) * step; Sv += Math.sin(ph) * step; fwd.push([U, Sv, ph]); }
  U = U0; Sv = S0;
  for (let i = 0; i < half; i++) { const ph = fieldAngle(U, Sv); U -= Math.cos(ph) * step; Sv -= Math.sin(ph) * step; back.push([U, Sv, ph]); }
  back.reverse();
  const all = back.concat([[U0, S0, fieldAngle(U0, S0)]], fwd);
  return all.map(([u, s, ph], i) => { const w = wig * nW.n2((i * step) / 85 + ws, ws * 0.37); return [u - Math.sin(ph) * w, s + Math.cos(ph) * w]; });
}
function strokePts(g, G, pts, i0, i1) {
  g.beginPath();
  for (let i = i0; i <= i1; i++) { const q = G.toXY(pts[i][0], Math.max(40, pts[i][1])); if (i === i0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]); }
  g.stroke();
}

/** the honey body: colour by thickness, clouded, plus the deepest (most blurred) threads */
function buildBody(G) {
  const { a, X0, Y0, RW, RH } = G, R = a.R, cx = a.cx, cy = a.cy;
  const nA = L.makeNoise('tianhuang-a'), nB = L.makeNoise('tianhuang-b');
  // colour against "optical depth" (px of stone the back-light has crossed)
  const DMAX = 900, NL = 2048;
  const rampFn = L.makeRamp([[0, '#f29a1c'], [5, '#fbbd3a'], [24, '#ffd766'], [60, '#ffdd74'], [105, '#ffd058'], [160, '#f8b22e'],
    [215, '#f0a020'], [280, '#e27712'], [350, '#cd560e'], [430, '#ad400c'], [520, '#8e2f09'], [650, '#6c2207'], [900, '#481605']].map(([d, c]) => [d / DMAX, c]));
  const LUT = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = rampFn(i / (NL - 1)); LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2]; }
  // slow fields on a coarse grid
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const fC = new Float32Array(cw * ch), fM = new Float32Array(cw * ch), fV = new Float32Array(cw * ch);
  const pc = Math.cos(PHI0), ps = Math.sin(PHI0);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const d = Math.max(0, R - rr), U = Math.atan2(ddx, ddy) * R, Sv = RE * Math.acos(Math.max(-1, 1 - d / RE)), k = j * cw + i;
    fC[k] = nA.fbm(U / 640, Sv / 520, 3);
    fM[k] = nB.fbm(U / 190 + 11, Sv / 150 - 5, 3);
    // milky veils drawn out along the thread direction
    fV[k] = nA.fbm((U * pc + Sv * ps) / 560 - 40, (-U * ps + Sv * pc) / 105 + 9, 3);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };
  const img = new ImageData(RW, RH), px = img.data;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -TOP) continue;
      const dd = d < 0 ? 0 : d;
      const U = Math.atan2(ddx, ddy) * R, Sv = RE * Math.acos(1 - Math.min(dd, RE) / RE);
      const u = ddx / 1100, u2 = u * u, deep = sstep(4, 150, dd);
      const C = bil(fC, i, j), M = bil(fM, i, j), V = bil(fV, i, j);
      // thicker toward the bottom and the sides; clouds push the colour bands around so they never read as a clean gradient
      let t = ((dd + 0.0004 * dd * dd) * (1 + 0.46 * u2) + 235 * u2 + (92 * C + 40 * M - 34 * sstep(0.0, 0.5, V)) * deep) / DMAX;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const li = ((t * (NL - 1)) | 0) * 3;
      let r = LUT[li], g = LUT[li + 1], b = LUT[li + 2];
      const v = sstep(0.05, 0.55, V) * deep * 0.06;      // a breath of milkiness in the veils
      r += (255 - r) * v; g += (226 - g) * v; b += (140 - b) * v;
      const gr = 1 + 0.013 * deep * (nA.n2(U / 4.6, Sv / 4.6) * 0.6 + nB.n2(U / 12, Sv / 12) * 0.4);
      const o = (j * RW + i) * 4;
      px[o] = r * gr; px[o + 1] = g * gr; px[o + 2] = b * gr; px[o + 3] = 255;
    }
  }
  const [c, g] = mk(G);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const tmp = L.makeCanvas(RW, RH); tmp.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(tmp, 0, 0);
  g.restore();
  // deepest threads: wide and soft, like fibres seen through a lot of honey
  const [veil, vg] = mk(G);
  drawBundles(G, vg, { seed: 'th-veil', bundles: 46, glow: true });
  g.drawImage(soft(veil, 13), X0, Y0);
  const [deepT, dg] = mk(G);
  drawBundles(G, dg, { seed: 'th-deep', bundles: 64, per: [9, 22], w: [1.3, 2.6], alpha: [0.09, 0.28], len: [240, 620], wig: 5 });
  g.drawImage(soft(deepT, 2.2), X0, Y0);
  return c;
}

/**
 * radish threads: bundles of fine, near-parallel, slightly wavy filaments.
 * o: seed, bundles, per [min,max] threads per bundle, w [min,max] px, alpha [min,max], len [min,max] surface px, wig px,
 *    glow (true → draw only one broad soft streak per bundle, for the milky haze the fibres sit in)
 */
function drawBundles(G, g, o) {
  const r = L.rng(o.seed), nW = L.makeNoise(o.seed + 'w');
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (let b = 0; b < o.bundles; b++) {
    const Ub = r.range(-G.UMAX, G.UMAX), Sb = r.range(190, 1430);
    const hw = o.glow ? r.range(10, 46) : r.range(7, 32), strength = 0.18 + 0.82 * Math.pow(r(), 1.5);
    const ph = fieldAngle(Ub, Sb), cs = Math.cos(ph), sn = Math.sin(ph);
    if (o.glow) {
      const pts = trace(Ub, Sb, r.range(420, 900), 8, nW, b * 3.1);
      g.strokeStyle = L.rgba(L.mix('#ffe9a8', '#ffa838', sstep(520, 1100, Sb)), 0.06 * strength * sstep(200, 520, Sb)); g.lineWidth = hw * 1.5;
      strokePts(g, G, pts, 0, pts.length - 1);
      continue;
    }
    const n = r.int(o.per[0], o.per[1]);
    for (let k = 0; k < n; k++) {
      const off = r.gauss() * hw, along = r.gauss() * 110;
      const U0 = Ub + cs * along - sn * off, S0 = Sb + sn * along + cs * off;
      const pts = trace(U0, S0, r.range(o.len[0], o.len[1]), o.wig * r.range(0.5, 1.3), nW, b * 7.3 + k * 1.37);
      const al = r.range(o.alpha[0], o.alpha[1]) * strength * sstep(260, 560, S0) * L.lerp(1, 0.66, sstep(800, 1250, S0));
      // against the bright honey near the limb the threads read darker; deep in the stone they catch the light
      const dark = r.chance(L.lerp(0.42, 0.1, sstep(520, 1000, S0)));
      g.strokeStyle = dark ? '#b8640e' : L.mix('#ffefba', '#ffc060', sstep(520, 1150, S0));
      g.lineWidth = r.range(o.w[0], o.w[1]);
      if (al < 0.01) continue;
      const m = pts.length - 1, q = Math.round(m * 0.2);
      g.globalAlpha = al * 0.55; strokePts(g, G, pts, 0, m);          // faint over the full length …
      g.globalAlpha = al * 0.45; strokePts(g, G, pts, q, m - q);      // … stronger in the middle → tapered ends
    }
  }
  g.restore();
}

/** a filled ribbon of varying width along screen points */
function ribbon(g, pts, widthAt) {
  const n = pts.length, Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
    let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const hw = Math.max(0.12, widthAt(i / (n - 1)) / 2);
    Lf.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]); Rt.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
  }
  g.beginPath(); g.moveTo(Lf[0][0], Lf[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(Lf[i][0], Lf[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(Rt[i][0], Rt[i][1]);
  g.closePath(); g.fill();
}

/** mid depth: finer threads, and the red veins (红筋) cutting across them */
function buildMid(G) {
  const [thr, tg] = mk(G);
  drawBundles(G, tg, { seed: 'th-mid', bundles: 92, per: [16, 40], w: [0.6, 1.2], alpha: [0.11, 0.32], len: [150, 480], wig: 4 });
  const [c, g] = mk(G);
  g.drawImage(soft(thr, 0.9), G.X0, G.Y0);

  const nV = L.makeNoise('tianhuang-vein');
  const veins = [
    { ctrl: [[735, 250], [585, 500], [405, 790], [250, 1040], [70, 1290], [-90, 1500]], w: 4.2, seed: 1.3, twigs: [[0.3, 0.5, 120], [0.52, -0.45, 90], [0.7, 0.4, 150]] },
    { ctrl: [[-690, 430], [-770, 650], [-890, 900], [-975, 1130], [-1085, 1420]], w: 2.5, seed: 7.7, twigs: [[0.45, -0.5, 100]] },
  ];
  const [halo, hg] = mk(G); const [core, cg] = mk(G);
  hg.lineCap = 'round'; hg.lineJoin = 'round';
  for (const v of veins) {
    const dense = L.smoothPath(v.ctrl, 9), n = dense.length;
    const surf = dense.map((q, i) => {
      const p0 = dense[Math.max(0, i - 1)], p1 = dense[Math.min(n - 1, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      const o = 3 * nV.n2((i * 9) / 64, v.seed) + 17 * nV.n2((i * 9) / 320, v.seed + 5);
      return [q[0] + nx * o, q[1] + ny * o];
    });
    const pts = surf.map((q) => G.toXY(q[0], q[1]));
    // iron stain bleeding into the stone around the fissure, heavier on one side (the fissure is a sheet seen at a slant)
    hg.strokeStyle = 'rgba(206,62,20,0.5)'; hg.lineWidth = 15;
    hg.beginPath(); pts.forEach((q, i) => (i ? hg.lineTo(q[0], q[1]) : hg.moveTo(q[0], q[1]))); hg.stroke();
    hg.strokeStyle = 'rgba(204,56,18,0.26)'; hg.lineWidth = 46;
    hg.beginPath(); pts.forEach((q, i) => (i ? hg.lineTo(q[0] + 12, q[1] + 7) : hg.moveTo(q[0] + 12, q[1] + 7))); hg.stroke();
    // the vein itself: swelling and thinning, tapering out at both ends
    const wAt = (u) => v.w * (0.5 + 0.5 * sstep(0.3, 1, Math.sin(Math.min(1, 0.15 + u * 0.9) * 1.1))) *
      (0.42 + 0.58 * (0.5 + 0.5 * nV.n2(u * 11, v.seed + 20)) + 0.25 * nV.n2(u * 38, v.seed + 31)) * sstep(0, 0.07, u) * sstep(1, 0.88, u);
    cg.fillStyle = '#c2341a'; ribbon(cg, pts, wAt);
    // hair-thin side fissures
    for (const [at, turn, len] of v.twigs) {
      const i0 = Math.round(at * (n - 1)), p0 = surf[i0], p1 = surf[Math.min(n - 1, i0 + 3)];
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + turn, tw = [];
      for (let k = 0; k <= 12; k++) { const s = (k / 12) * len, wob = 4 * nV.n2(s / 30, at * 9 + v.seed); tw.push(G.toXY(p0[0] + Math.cos(ang) * s - Math.sin(ang) * wob, p0[1] + Math.sin(ang) * s + Math.cos(ang) * wob)); }
      cg.fillStyle = 'rgba(194,52,26,0.85)'; ribbon(cg, tw, (u) => v.w * 0.42 * (1 - u) + 0.3);
    }
  }
  g.globalAlpha = 0.75; g.drawImage(soft(halo, 7), G.X0, G.Y0);
  g.globalAlpha = 0.92; g.drawImage(soft(core, 0.7), G.X0, G.Y0);
  g.globalAlpha = 1;
  return c;
}

/** the polished surface: the shallowest, sharpest threads, a few sand specks (砂点) and hairline rubs */
function buildSurface(G) {
  const { a } = G;
  const [thr, tg] = mk(G);
  drawBundles(G, tg, { seed: 'th-near', bundles: 62, per: [10, 26], w: [0.45, 0.85], alpha: [0.09, 0.27], len: [120, 380], wig: 3 });
  const [c, g] = mk(G);
  g.drawImage(soft(thr, 0.4), G.X0, G.Y0);
  // hairline rubs: straight on the stone, flattened toward the limb; a pale lip with a darker groove beside it
  const rs = L.rng('th-rub');
  g.lineCap = 'round';
  for (let n = 0; n < 34; n++) {
    const U0 = rs.range(-G.UMAX, G.UMAX), S0 = rs.range(380, 1380), ang = rs.range(-0.5, 0.5) + (rs.chance(0.3) ? 1.4 : 0), len = rs.range(50, 260), bend = rs.range(-0.15, 0.15);
    const pts = [];
    for (let t = 0; t <= 10; t++) { const u = t / 10 - 0.5, aa = ang + bend * u; pts.push(G.toXY(U0 + Math.cos(aa) * len * u, Math.max(300, S0 + Math.sin(aa) * len * u))); }
    const al = rs.range(0.05, 0.15), lw = rs.range(0.5, 0.9);
    const run = (dy, style) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); pts.forEach((q, t) => (t ? g.lineTo(q[0], q[1] + dy) : g.moveTo(q[0], q[1] + dy))); g.stroke(); };
    run(0.8, `rgba(120,50,6,${al * 0.7})`); run(0, `rgba(255,246,214,${al})`);
  }
  // sand specks: only a handful, tiny, each sitting in a faint stain
  const rp = L.rng('th-speck');
  const specks = [];
  for (let n = 0; n < 8; n++) specks.push([rp.range(-1050, 1050), rp.range(430, 1330), rp.range(1.5, 3.4)]);
  specks.push([-235, 905, 4.6], [-212, 928, 2.0], [470, 1120, 4.0], [118, 640, 2.6]);
  for (const [U, Sv, rad] of specks) {
    const q = G.toXY(U, Sv), fs = Math.max(0.3, Math.sin(Sv / RE)), th = U / a.R;
    g.save(); g.translate(q[0], q[1]); g.rotate(th); g.scale(1, fs);
    g.fillStyle = L.radial(g, 0, 0, rad * 0.6, rad * 3.4, [[0, 'rgba(122,44,6,0.42)'], [1, 'rgba(122,44,6,0)']]);
    g.beginPath(); g.arc(0, 0, rad * 3.4, 0, L.TAU); g.fill();
    g.fillStyle = L.radial(g, 0, 0, 0, rad, [[0, 'rgba(30,11,2,0.96)'], [0.7, 'rgba(44,16,3,0.9)'], [1, 'rgba(70,26,4,0)']]);
    g.beginPath(); g.ellipse(0, 0, rad, rad * rp.range(0.75, 1.1), rp.range(0, 3), 0, L.TAU); g.fill();
    if (rad > 2.4) { g.fillStyle = 'rgba(255,240,196,0.7)'; g.beginPath(); g.ellipse(-rad * 0.55, -rad * 0.9, rad * 0.5, rad * 0.22, -0.3, 0, L.TAU); g.fill(); }
    g.restore();
  }
  return c;
}

/** the soft sheen of the polish: a broad band following the arc plus a thin grazing line just inside the limb */
function buildSheen(G) {
  const { a, X0, Y0, RW, RH } = G;
  const [c, g] = mk(G);
  const D = 240, stops = [];
  for (let k = 0; k <= 36; k++) {
    const d = D * (1 - k / 36);
    const al = 0.36 * Math.exp(-Math.pow((d - 112) / 22, 2)) + 0.09 * Math.exp(-Math.pow((d - 100) / 60, 2)) + 0.42 * Math.exp(-Math.pow((d - 11) / 5.5, 2));
    stops.push([k / 36, `rgba(255,241,184,${al.toFixed(3)})`]);
  }
  g.save(); a.clipBelow(g, 0);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - D, a.R, stops);
  g.fillRect(X0, Y0, RW, RH);
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  // strongest left of the crest (soft key from the upper left), dying away toward both ends
  g.fillStyle = L.linear(g, 0, 0, RW, 0, [[0, 'rgba(0,0,0,0.12)'], [0.18, 'rgba(0,0,0,0.42)'], [0.4, 'rgba(0,0,0,1)'], [0.6, 'rgba(0,0,0,0.8)'], [0.8, 'rgba(0,0,0,0.38)'], [1, 'rgba(0,0,0,0.1)']]);
  g.fillRect(0, 0, RW, RH);
  // the polish is never perfect: break the band into faint streaks running round the stone
  g.drawImage(L.noiseTex(RW, RH, { seed: 'th-sheen', scale: 7, sx: 16, sy: 1, octaves: 3, res: 0.5, contrast: 1.5,
    polar: { cx: a.cx - X0, cy: a.cy - Y0, R: a.R }, ramp: [[0, 'rgba(0,0,0,0.72)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '田黄印石',
  tone: 'light',
  init(env) {
    const G = geo(env);
    S = { body: buildBody(G), mid: buildMid(G), surf: buildSurface(G), sheen: buildSheen(G) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.009, 0.009, p), zoom = L.lerp(1.0, 1.03, p);
    ctx.fillStyle = '#060403'; ctx.fillRect(0, 0, W, H);
    // the narrow warm halo hugging the stone (strongest over the crest), nothing else above the arc
    const yEdge = a.yAt(0) + 4;
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 2, a.R + 120, [[0, 'rgba(255,150,40,0.9)'], [0.07, 'rgba(244,116,26,0.56)'], [0.2, 'rgba(204,74,14,0.24)'], [0.45, 'rgba(150,48,10,0.07)'], [1, 'rgba(120,36,8,0)']]);
    ctx.fillRect(0, 0, W, yEdge);
    ctx.fillStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(6,4,3,0.6)'], [0.32, 'rgba(6,4,3,0)'], [0.68, 'rgba(6,4,3,0)'], [1, 'rgba(6,4,3,0.6)']]);
    ctx.fillRect(0, 0, W, yEdge);

    // the stone. The clip is the true arc, so the limb never moves while the inside slides and creeps closer.
    ctx.save(); a.clipBelow(ctx, 0);
    blitC(ctx, env, S.body, { rot: rot * 0.45, zoom });
    blitC(ctx, env, S.mid, { rot: rot * 0.74, zoom });
    blitC(ctx, env, S.surf, { rot, zoom });
    // light welling up inside the stone under the crest
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.translate(a.cx, a.crestY + 76); ctx.scale(2.7, 1);
    ctx.fillStyle = L.radial(ctx, 0, 0, 0, 330, [[0, 'rgba(255,214,96,0.2)'], [0.5, 'rgba(255,184,60,0.09)'], [1, 'rgba(255,170,40,0)']]);
    ctx.fillRect(-340, -340, 680, 680);
    ctx.restore();
    // the sheen drifts a little as the stone turns
    blitC(ctx, env, S.sheen, { rot: L.lerp(-0.013, 0.005, p), blend: 'screen' });
    ctx.restore();

    // bloom over the limb: the edge glows rather than cuts
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255,170,60,0.13)'; ctx.lineWidth = 16; a.stroke(ctx, 2);
    ctx.strokeStyle = 'rgba(255,200,104,0.5)'; ctx.lineWidth = 2.4; a.stroke(ctx, 0.4);
    ctx.restore();
    L.vignette(ctx, { strength: 0.3 });
  },
};
