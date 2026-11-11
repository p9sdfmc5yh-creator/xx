// s06 — 龙洋的虹彩包浆. Extreme macro of the edge of a machine-struck silver dragon dollar, lying in the dark.
// The arc is the coin's outer edge (reeded, so the outline carries a fine row of notches); above it nothing but black.
// Below it, reading inward: the plain raised rim (光边),
// a ring of denticles (边齿), a ring of beads (珠圈), then a coil of the dragon — dorsal spines, rows of overlapping
// engraved scales, cloud scrolls in the pockets — all under a rainbow toning that runs gold → rose-violet →
// cobalt → cyan from the edge inward. No lettering anywhere.
//
// How it is made: the relief is first DRAWN as a greyscale height map (painter's order, so every scale really overlaps
// the one behind it), then shaded per pixel in init(): slope lighting from the upper left, cavity darkening, cast shadows,
// cold-white wear on the high points, and a thin-film colour looked up from the distance to the rim (warped by noise and
// by the relief itself). Two copies with the toning phase a little apart are cross-faded in draw() so the colour bands
// creep along the radius while the whole coin slides a hair round its centre.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 100;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// the height map is drawn in the RED channel; GREEN and BLUE carry two random numbers per scale (128 = neutral elsewhere),
// so every scale can take its own shade of toning and its own glint
let GID = 128, BID = 128;
const grey = (v, al = 1) => { const c = Math.round(L.clamp(v) * 255); return `rgba(${c},${GID},${BID},${al})`; };
const dark = (al) => `rgba(0,${GID},${BID},${al})`;

// ── layout, measured inward from the edge (V = px below the arc) and along it (U = px of arc length at the rim) ──
const FIELD = 0.1;                      // height of the flat field (地章)
const RIM = 44;                         // width of the plain rim
const TOOTH_END = 73, TPITCH = 22;      // denticles hang off the inside of the rim
const BEAD_V = 111, BEAD_R = 16.5, BPITCH = 44;
const REED = 16;                        // pitch of the reeding on the coin's edge (直齿边), seen end-on along the outline
const HW = 190;                         // half-width of the dragon's body (its far flank runs out of frame)
const DA = 24.5, DB = 42;               // scale lattice: step along / across the body
// the body's centre line undulates: its back comes up to the bead ring, then sinks away leaving pockets for the clouds
const vc = (U) => 410 - 60 * Math.cos((U + 80) / 180) + 10 * Math.sin(U / 97 + 1);
const dvc = (U) => (60 / 180) * Math.sin((U + 80) / 180) + (10 / 97) * Math.cos(U / 97 + 1);

/** one engraved scale, pointing +x (toward the tail); origin at its centre */
function drawScale(g) {
  const rx = 27.4, ry = 25.2;
  // the groove its free edge cuts into the scales behind it
  g.fillStyle = 'rgba(0,128,128,0.72)';
  g.beginPath(); g.ellipse(3.4, 0, rx + 2, ry + 2, 0, 0, TAU); g.fill();
  // the plate: low at the root, rising toward the free edge
  g.fillStyle = L.linear(g, -rx * 0.55, 0, rx, 0, [[0, grey(0.3)], [0.5, grey(0.44)], [0.86, grey(0.62)], [1, grey(0.74)]]);
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
  // raised lip round the free edge
  g.strokeStyle = grey(1); g.lineWidth = 3.7;
  g.beginPath(); g.ellipse(0, 0, rx - 1.85, ry - 1.85, 0, -1.85, 1.85); g.stroke();
  // engraved lines: an inner arc that echoes the lip, and a short midrib
  g.strokeStyle = dark(0.55); g.lineWidth = 1.9;
  g.beginPath(); g.ellipse(-1, 0, rx - 9.4, ry - 8.8, 0, -1.3, 1.3); g.stroke();
  g.strokeStyle = grey(0.97, 0.85); g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(rx - 12, 0); g.stroke();
}

/** a cloud scroll (云气卷线): a raised line that curls up into a spiral, with a trailing tail. Origin at the eye of the curl. */
function drawScroll(g, size, dir, tail) {
  const pts = [], turns = 1.4 * TAU, n = 34;
  for (let i = 0; i <= n; i++) {
    const f = i / n, ph = f * turns, r = size * (0.1 + 0.9 * Math.pow(f, 0.85));
    pts.push([Math.cos(ph) * r * dir, Math.sin(ph) * r]);
  }
  const a0 = pts[n - 1], a1 = pts[n];
  let tx = a1[0] - a0[0], ty = a1[1] - a0[1]; const m = Math.hypot(tx, ty); tx /= m; ty /= m;
  const nx = -ty * dir, ny = tx * dir;
  for (let k = 1; k <= 10; k++) {
    const u = k / 10, bow = Math.sin(u * Math.PI) * size * 0.5;
    pts.push([a1[0] + tx * u * size * tail - nx * bow, a1[1] + ty * u * size * tail - ny * bow]);
  }
  const sp = L.smoothPath(pts, 3), m2 = sp.length - 1;
  // width: thin at the eye, full round the curl, tapering away along the tail
  const wf = (u) => (0.5 + 0.5 * sstep(0, 0.3, u)) * (1 - 0.72 * sstep(0.5, 1, u));
  g.lineCap = 'round'; g.lineJoin = 'round';
  const ws = 0.45 + 0.55 * (size / 30);
  for (const [w, v] of [[16, 0.28], [12.5, 0.56], [9, 0.9], [2.6, 0.4]]) {
    g.strokeStyle = grey(v);
    for (let i = 0; i < m2; i++) {
      g.lineWidth = w * ws * wf(i / m2);
      g.beginPath(); g.moveTo(sp[i][0], sp[i][1]); g.lineTo(sp[i + 1][0], sp[i + 1][1]); g.stroke();
    }
  }
}

/** the relief as a greyscale height map (white = high) */
function buildHeight(env) {
  const a = env.arc, R = a.R;
  const P = (U, V) => { const th = U / R, rr = R - V; return [a.cx + rr * Math.sin(th), a.cy - rr * Math.cos(th)]; };
  const UM = a.span(PAD + 80) * R + 80;
  const rj = L.rng('s06scales'), nz = L.makeNoise('s06lat');
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    a.fillBelow(g, grey(FIELD), 0);

    // ── the dragon's dorsal spines (背鳍): flame-shaped, leaning toward the tail, shorter where the back nears the beads ──
    for (let s = UM; s >= -UM; s -= 46) {
      const top = vc(s) - HW, gap = top - (BEAD_V + BEAD_R + 8);
      const fh = L.clamp(gap * 0.82, 10, 56);
      const [x, y] = P(s, top + 9);
      g.save(); g.translate(x, y); g.rotate(s / R + Math.atan(dvc(s)));
      const shape = () => { g.beginPath(); g.moveTo(-30, 12); g.quadraticCurveTo(-11, -fh * 0.5, 19, -fh); g.quadraticCurveTo(9, -fh * 0.25, 27, 12); g.closePath(); };
      g.save(); g.translate(3.5, 1.5); shape(); g.fillStyle = dark(0.55); g.fill(); g.restore();
      shape(); g.fillStyle = L.linear(g, -22, 0, 24, 0, [[0, grey(0.8)], [0.5, grey(0.52)], [1, grey(0.3)]]); g.fill();
      g.strokeStyle = grey(1); g.lineWidth = 2.8; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-30, 12); g.quadraticCurveTo(-11, -fh * 0.5, 19, -fh); g.stroke();
      g.strokeStyle = dark(0.5); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-8, 10); g.quadraticCurveTo(2, -fh * 0.32, 13, -fh * 0.76); g.stroke();
      g.beginPath(); g.moveTo(6, 10); g.quadraticCurveTo(10, -fh * 0.1, 16, -fh * 0.5); g.stroke();
      g.restore();
    }
    // ── body silhouette under the scales ──
    g.beginPath();
    for (let s = -UM; s <= UM; s += 12) { const [x, y] = P(s, vc(s) - HW + 5); if (s === -UM) g.moveTo(x, y); else g.lineTo(x, y); }
    for (let s = UM; s >= -UM; s -= 12) { const [x, y] = P(s, vc(s) + 430); g.lineTo(x, y); }
    g.closePath(); g.fillStyle = grey(0.28); g.fill();
    // ── scales, laid from the tail (right) toward the head so each one overlaps the root of the one behind ──
    const iMax = Math.ceil(UM / DA);
    for (let i = iMax; i >= -iMax; i--) {
      const s = i * DA, c = vc(s), ang = Math.atan(dvc(s)), off = (i & 1) ? 0.5 : 0;
      for (let j = -5; j <= 9; j++) {
        const t = (j + off) * DB + 8;
        if (t < -HW + 16) continue;
        const U = s + rj.range(-1.8, 1.8) + 7 * nz.n2(s / 190, t / 150), V = c + t + rj.range(-1.8, 1.8) + 7 * nz.n2(s / 170 + 40, t / 140 - 9);
        const [x, y] = P(U, V), k = ((R - V) / R) * rj.range(0.95, 1.06) * (1 + 0.07 * nz.n2(s / 120 - 5, t / 120 + 17));
        GID = 128 + Math.round(rj.range(-112, 112)); BID = 128 + Math.round(rj.range(-112, 112));
        g.save(); g.translate(x, y); g.rotate(U / R + ang); g.scale(k, k);
        drawScale(g);
        g.restore();
      }
    }
    GID = 128; BID = 128;
    // ── cloud scrolls in the pockets between the bead ring and the dragon's back ──
    const rc = L.rng('s06cloud');
    for (const Uc of [-80 - 565.5 * 3, -80 - 565.5, -80 + 565.5, -80 + 565.5 * 3]) {
      const put = (dU, V, size, dir, rot, tail) => a.at(g, (Uc + dU) / R, -V, () => { g.rotate(rot); drawScroll(g, size, dir, tail); });
      put(-66, 192, 30, 1, 2.9 + rc.range(-0.1, 0.1), 3.6);
      put(78, 188, 26, -1, 0.3 + rc.range(-0.1, 0.1), 3.8);
      put(-246, 166, 16, 1, 2.6, 3.2);
      put(250, 164, 16, -1, 0.5, 3.2);
    }
    // ── bead ring (珠圈) ──
    const nb = Math.ceil(UM / BPITCH);
    for (let i = -nb; i <= nb; i++) {
      const [x, y] = P(i * BPITCH, BEAD_V);
      g.fillStyle = L.radial(g, x, y, 0, BEAD_R, [[0, grey(0.97)], [0.45, grey(0.88)], [0.72, grey(0.7)], [0.9, grey(0.47)], [1, grey(FIELD)]]);
      g.beginPath(); g.arc(x, y, BEAD_R, 0, TAU); g.fill();
    }
    // ── the plain rim (光边): a broad flat band with a rounded outer shoulder ──
    const r0 = R - RIM - 8, r1 = R + 0.5, tv = (V) => (R - V - r0) / (r1 - r0);
    a.fillBand(g, L.radial(g, a.cx, a.cy, r0, r1, [[tv(RIM + 8), grey(FIELD)], [tv(RIM + 2), grey(0.32)], [tv(RIM - 4), grey(0.8)], [tv(RIM - 11), grey(0.9)],
      [tv(22), grey(0.93)], [tv(9), grey(0.88)], [tv(3.5), grey(0.62)], [tv(0), grey(0.2)]]), 1, -(RIM + 8));
    // ── denticles (边齿): short rounded bars hanging off the inside of the rim ──
    g.globalCompositeOperation = 'lighten'; g.lineCap = 'round';
    const nt = Math.ceil(UM / TPITCH);
    for (let i = -nt; i <= nt; i++) {
      a.at(g, (i * TPITCH) / R, -(RIM - 5), () => {
        const len = TOOTH_END - (RIM - 5);
        for (const [w, v] of [[13.5, 0.3], [10, 0.54], [6.4, 0.74], [2.8, 0.87]]) {
          g.strokeStyle = grey(v); g.lineWidth = w; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len - w / 2); g.stroke();
        }
      });
    }
    g.globalCompositeOperation = 'source-over';
    // ── the edge of the coin is reeded: from the face the reeds show as a fine row of notches biting into the shoulder ──
    const nr = Math.ceil(UM / REED);
    for (let i = -nr; i <= nr; i++) {
      a.at(g, (i * REED) / R, 0, () => {
        g.fillStyle = dark(0.6);
        g.beginPath(); g.moveTo(-3.2, -2); g.lineTo(3.2, -2); g.lineTo(1.3, 8); g.lineTo(-1.3, 8); g.closePath(); g.fill();
      });
    }
    // ── knocks and bag marks from circulation: short gouges with a raised burr on one side ──
    const rk = L.rng('s06nick');
    for (let n = 0; n < 30; n++) {
      const onRim = n < 11, U = rk.range(-UM, UM), V = onRim ? rk.range(14, RIM - 7) : rk.range(150, 520);
      const [x, y] = P(U, V), ang = rk.range(0, Math.PI), len = onRim ? rk.range(2, 8) : rk.range(5, 22), wd = onRim ? rk.range(1.2, 2.2) : rk.range(1.6, 3.2);
      g.save(); g.translate(x, y); g.rotate(ang);
      g.strokeStyle = grey(1, 0.35); g.lineWidth = wd * 0.7; g.beginPath(); g.moveTo(-len / 2, -wd * 0.8); g.lineTo(len / 2, -wd * 0.8); g.stroke();
      g.strokeStyle = dark(0.6); g.lineWidth = wd; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
      g.restore();
    }
  });
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc * inv; const xa = x + r + 1, xb = x - r; acc += src[o + (xa >= w ? w - 1 : xa)] - src[o + (xb < 0 ? 0 : xb)]; }
  }
  const col = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = tmp[y * w + x];
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += col[y < 0 ? 0 : y >= h ? h - 1 : y];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc * inv; const ya = y + r + 1, yb = y - r; acc += col[ya >= h ? h - 1 : ya] - col[yb < 0 ? 0 : yb]; }
  }
  return out;
}

// thin-film toning, indexed by distance from the edge: gold at the rim, then rose, violet, cobalt, cyan
const NLUT = 1024, TSPAN = 620;
function toneLut() {
  const f = L.makeRamp([[0, '#f8d878'], [0.035, '#f0c248'], [0.085, '#e8b33a'], [0.118, '#ea963c'], [0.145, '#d8558a'], [0.172, '#aa43b2'],
    [0.21, '#8e3fb8'], [0.3, '#7d42c4'], [0.38, '#5548d4'], [0.47, '#2a56d6'], [0.62, '#1f76e6'], [0.76, '#18a9de'], [0.9, '#1fcac8'], [1, '#149aa8']]);
  const out = new Float32Array(NLUT * 3);
  for (let i = 0; i < NLUT; i++) { const c = f(i / (NLUT - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

function buildCoin(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const hl = buildHeight(env);
  const src = hl.getContext('2d').getImageData(0, Y0 + PAD, RW, RH).data;
  const nA = L.makeNoise('s06a'), nB = L.makeNoise('s06b');
  const Hr = new Float32Array(N), Id1 = new Float32Array(N), Id2 = new Float32Array(N);
  for (let k = 0; k < N; k++) { Hr[k] = src[k * 4] / 255; Id1[k] = (src[k * 4 + 1] - 128) / 255; Id2[k] = (src[k * 4 + 2] - 128) / 255; }
  const Hs = boxBlur(Hr, RW, RH, 1);
  const Hb = boxBlur(boxBlur(Hs, RW, RH, 6), RW, RH, 6);   // wide: cavities
  const Hm = boxBlur(Hs, RW, RH, 3);                         // narrow: thin ridges that stand proud (lips, ribs, crests)
  // struck silver is never glass-smooth: a frosty micro-relief for the light to rake across
  for (let j = 0; j < RH; j++) for (let i = 0, k = j * RW; i < RW; i++, k++) {
    if (Hr[k] > 0.02) Hs[k] += 0.0075 * nB.n2(i / 2.7, j / 2.7) + 0.011 * nA.n2(i / 7.5 + 3, j / 7.5);
  }

  // slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWarp = new Float32Array(cw * ch), cBlot = new Float32Array(cw * ch), cTar = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), U = Math.atan2(ddx, ddy) * R, V = R - Math.hypot(ddx, ddy), k = j * cw + i;
    cWarp[k] = 62 * nA.fbm(U / 380, V / 230, 3) + 24 * nA.fbm(U / 95 + 9, V / 80 - 4, 3);
    cBlot[k] = nB.fbm(U / 170 + 30, V / 170, 3);
    // islands where the toning has gone deep and dark (the plates sink into aubergine, the worn lips stay silver)
    const b1 = 1 - Math.hypot((U + 700) / 300, (V - 420) / 200), b2 = 1 - Math.hypot((U - 860) / 240, (V - 340) / 160);
    cTar[k] = Math.max(b1, b2) + 0.42 * nB.fbm(U / 150 - 8, V / 150 + 3, 3) + 0.16 * nA.fbm(U / 38, V / 38 + 60, 2);
  }
  const bil = (srcA, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = srcA[k], a1 = srcA[k + 1], b0 = srcA[k + cw], b1 = srcA[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  const TONE = toneLut();
  const imgA = new ImageData(RW, RH), imgB = new ImageData(RW, RH), dA = imgA.data, dB = imgB.data;
  const o1 = 5 * RW + 3, o2 = 10 * RW + 6;      // toward the light (upper left), for cast shadows
  const WR = 238, WG = 243, WB = 255;           // cold silver white
  for (let j = 1; j < RH - 1; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 1; i < RW - 1; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), V = R - rr;
      if (V < -0.5) continue;
      const k = j * RW + i, U = Math.atan2(ddx, ddy) * R;
      const h = Hs[k];
      const gx = (Hs[k + 1] - Hs[k - 1]) * 0.5, gy = (Hs[k + RW] - Hs[k - RW]) * 0.5;
      // the big shapes: an orb-like falloff, brightest a little inside the rim and left of centre …
      // (plus a second, dimmer pool of light low in the middle, where the surface turns back toward the lens)
      const vv = (V - 150) / 360, uu = (U + 200) / 850, v2 = (V - 540) / 170, u2 = (U - 40) / 430;
      const G = 0.17 + Math.exp(-vv * vv) * (0.42 + 0.58 * Math.exp(-uu * uu)) + 0.42 * Math.exp(-v2 * v2 - u2 * u2);
      // … and the dragon's body as a tube lit along its back
      const tb = (V - vc(U)) / HW;
      let Bm = 0.9;
      if (tb > -1.15) {
        const q = (tb + 0.45) / 0.5, body = 0.66 + 0.42 * Math.exp(-q * q) - 0.12 * sstep(0.3, 1, tb);
        Bm += (body - Bm) * sstep(-1.15, -0.9, tb);
      }
      const relief = sstep(0.14, 0.3, h), rimB = sstep(RIM + 6, RIM - 6, V);
      const ah = 0.34 + 0.66 * sstep(0.1, 0.5, h);       // the field sits back in the dark, the relief carries the colour
      let rel = (gx * 0.55 + gy * 0.835) * 22; rel = rel < -0.95 ? -0.95 : rel > 1.7 ? 1.7 : rel;
      const ao = h - Hb[k];
      const cav = ao < 0 ? Math.min(0.88, -ao * 2.7) : 0, rz = L.clamp((h - Hm[k]) * 4.2);
      let sh = 0;
      if (k > o2) { const hm = Math.max(Hs[k - o1], Hs[k - o2] * 0.9); sh = L.clamp((hm - h - 0.1) * 2.4, 0, 0.66); }
      const id1 = Id1[k], id2 = Id2[k];
      const tar = sstep(0.12, 0.5, bil(cTar, i, j)) * sstep(120, 200, V);
      let Lm = G * Bm * ah * (1 - cav) * (1 - sh) * Math.max(0.05, 1.15 + rel) * (1 + 0.55 * id2) * (1 - 0.5 * tar);
      // die-flow streaks in the field, slow blotches of toning
      Lm *= (1 + (1 - relief) * 0.32 * nA.n2(U / 3.2 + 7, V / 80)) * (1 + 0.22 * (1 - 0.75 * rimB) * bil(cBlot, i, j));
      // specular lobe on the slopes turned to the light, and cold-white wear on every thin edge that stands proud —
      // strongest on the side that faces the light
      const e1 = gx - 0.021, e2 = gy - 0.031, spec = Math.exp(-(e1 * e1 + e2 * e2) / 0.0004);
      Lm += (spec * 1.1 * relief * (1 - 0.6 * tar) + rz * (0.55 + 0.5 * sstep(-0.7, 0.7, rel))) * (0.32 + 0.68 * G);
      // the rim is burnished: a band of reflected light runs round it, broken into fine circular brush lines
      if (rimB > 0) {
        const sb = (V - 14) / 7.5, streak = nA.n2(U / 70, V / 1.6 + 40), room = 0.82 + 0.34 * nB.n2(U / 380 + 5, 0.3);
        const Gr = 0.55 + 0.45 * G;     // polished metal keeps its glow further round the edge than the frosted relief does
        Lm = Lm * (1 + rimB * (Gr / G - 1)) * (1 + rimB * (room - 1)) + rimB * Math.exp(-sb * sb) * 0.8 * Gr * room * (1 + 0.5 * streak) + rimB * 0.1 * streak;
      }
      // frost glitter: single crystals flashing on the relief
      let hs = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; hs = Math.imul(hs ^ (hs >>> 13), 1274126177); hs ^= hs >>> 16;
      const gl = (hs & 1023) / 1023;
      if (gl > 0.986) Lm += relief * (gl - 0.986) * 55 * G;
      // toning: film thickness grows inward from the edge, wanders with the noise, differs between high and low relief
      // and from one scale to the next; in the dark islands it falls back toward violet
      const Tn = (V + bil(cWarp, i, j) * sstep(6, 120, V)) / TSPAN + 0.05 * (h - 0.45) + 0.11 * id1 - 0.15 * tar;
      const o = k * 4;
      let al = 255;
      if (V < 4) { const nc = Math.cos((U / REED) * TAU), cut = nc > 0 ? 3 * nc * nc * nc : 0; al = L.clamp(V + 0.5 - cut) * 255; }
      for (let pass = 0; pass < 2; pass++) {
        const d = pass ? dB : dA;
        let t = Tn + (pass ? 0.035 : 0); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const li = ((t * (NLUT - 1)) | 0) * 3;
        let r = TONE[li], gg = TONE[li + 1], b = TONE[li + 2];
        if (Lm <= 1) {
          // gold in shadow goes amber, not olive: pull green and blue down faster where the toning is warm
          const warm = (1 - sstep(0.1, 0.17, t)) * (1 - Lm);
          r *= Lm; gg *= Lm * (1 - 0.42 * warm); b *= Lm * (1 - 0.6 * warm);
        }
        else { const w = Math.min(1, (Lm - 1) * 0.72); r += (WR - r) * w; gg += (WG - gg) * w; b += (WB - b) * w; }
        d[o] = r < 4 ? 4 : r; d[o + 1] = gg < 4 ? 4 : gg; d[o + 2] = b < 9 ? 9 : b; d[o + 3] = al;
      }
    }
  }

  const finish = (img) => {
    const sharp = L.makeCanvas(RW, RH), g0 = sharp.getContext('2d');
    g0.putImageData(img, 0, 0);
    // carbon spots: tiny dark flecks of tarnish
    g0.save(); g0.globalCompositeOperation = 'source-atop'; g0.translate(-X0, -Y0);
    const rs = L.rng('s06spot');
    for (let n = 0; n < 46; n++) {
      const p0 = a.pt(rs.range(-0.62, 0.62), -rs.range(150, 520)), r = rs.range(1.5, 5.5) * (rs.chance(0.12) ? 1.7 : 1), al = rs.range(0.25, 0.62);
      g0.fillStyle = L.radial(g0, p0.x, p0.y, 0, r, [[0, `rgba(8,5,14,${al})`], [0.55, `rgba(8,5,14,${al * 0.7})`], [1, 'rgba(8,5,14,0)']]);
      g0.beginPath(); g0.ellipse(p0.x, p0.y, r, r * rs.range(0.6, 1), rs.range(0, 3), 0, TAU); g0.fill();
    }
    g0.restore();
    // shallow depth of field. Focus lies on the bead ring and the dragon's back; the rim (far) goes a little soft and
    // the surface nearest the lens (bottom of frame) melts away. Each step REPLACES the sharp image inside its band.
    const c = L.makeCanvas(RW, RH), g = c.getContext('2d');
    g.drawImage(sharp, 0, 0);
    const band = (px, stops) => {
      const mask = L.radial(g, cx - X0, cy - Y0, R - 620, R + 20, stops.map(([V, al]) => [(620 - V) / 640, `rgba(0,0,0,${al})`]));
      const bl = L.blurred(sharp, px), bg2 = bl.getContext('2d');
      bg2.globalCompositeOperation = 'destination-in'; bg2.fillStyle = mask; bg2.fillRect(0, 0, RW, RH);
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = mask; g.fillRect(0, 0, RW, RH);
      g.globalCompositeOperation = 'lighter'; g.drawImage(bl, 0, 0);
      g.globalCompositeOperation = 'source-over';
    };
    band(1.3, [[620, 0], [92, 0], [58, 1], [-20, 1]]);
    band(3, [[620, 1], [535, 1], [385, 0], [-20, 0]]);
    return c;
  };
  const A = finish(imgA), B = finish(imgB);
  // bloom from the hottest highlights, at quarter size
  const bloom = L.makeCanvas(RW / 4, RH / 4), bg = bloom.getContext('2d');
  bg.filter = 'brightness(0.82) contrast(2.3) blur(4px)';
  bg.drawImage(A, 0, 0, bloom.width, bloom.height);
  return { A, B, bloom, X0, Y0, RW, RH };
}

export default {
  name: '龙洋的虹彩包浆',
  tone: 'light',
  init(env) {
    S = buildCoin(env);
    const rg = L.rng('s06glint');
    S.glints = [];
    for (let i = 0; i < 9; i++) S.glints.push({ n: rg.int(-14, 9), ph: rg(), k: rg.range(0.5, 1) });
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#04040a'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.0036, 0.0036, p), e = L.smooth(p);
    // the faintest warm breath of light off the edge into the dark
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 2, a.R + 64, [[0, 'rgba(236,160,80,0.18)'], [0.3, 'rgba(200,80,130,0.07)'], [1, 'rgba(120,50,160,0)']]);
    ctx.fillRect(0, 0, W, H);
    // the coin: slides a hair round its centre while the toning bands creep inward (A → B)
    L.cam(ctx, env, { rot }, () => {
      ctx.drawImage(S.A, S.X0, S.Y0);
      ctx.globalAlpha = e; ctx.drawImage(S.B, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5;
      ctx.drawImage(S.bloom, S.X0, S.Y0, S.RW, S.RH);
    });
    // cartwheel lustre: a soft spoke of light sweeping across the silver
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'overlay';
    a.at(ctx, L.lerp(-0.2, -0.1, p), -30, () => {
      ctx.rotate(0.22); ctx.scale(1, 3.3);
      ctx.fillStyle = L.radial(ctx, 0, 60, 0, 240, [[0, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0.17)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-250, -190, 500, 500);
    });
    ctx.restore();
    // pin-point glints on a few beads
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const q of S.glints) {
      const tw = (0.3 + 0.7 * Math.pow(Math.max(0, Math.cos((p * 0.7 + q.ph) * TAU)), 3)) * q.k;
      if (tw < 0.04) continue;
      a.at(ctx, (q.n * BPITCH) / a.R + rot, -BEAD_V, () => {
        ctx.translate(-4.5, -5.5);
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, 30, [[0, `rgba(255,255,255,${0.95 * tw})`], [0.12, `rgba(240,236,255,${0.5 * tw})`], [0.45, `rgba(220,150,230,${0.1 * tw})`], [1, 'rgba(200,120,220,0)']]);
        ctx.fillRect(-30, -30, 60, 60);
      });
    }
    ctx.restore();
    // rim light riding the very edge
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const pk = L.lerp(0.3, 0.38, p);
    ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(255,214,140,0.25)'], [pk, 'rgba(255,250,236,0.95)'], [0.66, 'rgba(255,224,160,0.5)'], [1, 'rgba(255,200,120,0.2)']]);
    ctx.globalAlpha = 0.3; ctx.lineWidth = 7; a.stroke(ctx, -5.5);
    ctx.globalAlpha = 0.9; ctx.lineWidth = 2; a.stroke(ctx, -4.4);
    ctx.restore();
    L.vignette(ctx, { strength: 0.3 });
  },
};
