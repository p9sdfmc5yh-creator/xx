// s08 — 云纹瓦当拓片. An ink rubbing (墨拓) of a Han cloud-pattern eave-tile end, photographed close: the arc is the outer
// edge of the tile's wide rim. Raised parts (rim, string line, double-line divider, cloud scrolls) print dense black peppered
// with un-inked white specks; the recessed ground is a pale grey wash with stray ink dabs and a white halo hugging every
// raised line. Above the arc there is nothing but the bare sheet of xuan paper — no colophon, no seal.
// Everything lives on ONE sheet, so paper and ink move together; the lens (focus fall-off, light) stays fixed.
// NOTE on proportions: a true tile whose rim sat on this arc would hide its field far below the frame, so the radial depths
// are compressed and only the upright double-line divider with the two scrolls flanking it is shown (the centre ring and the
// boss fall just below the frame). The order and form of the parts are kept; their ratios are not to scale.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 72;
const LW = W + PAD * 2, LH = H + PAD * 2;
let S = null;

// radial layout, in px BELOW the arc (d = -dr)
const K = 1.3;                   // how far the lens has been pushed in on the cloud scrolls
const RIM = 134;                 // 边轮: 0 … RIM
const STR0 = 155, STR1 = 183;    // 外圈弦纹 (raised string line)
const RING0 = 527, RING1 = 547;  // circle around the boss (below the frame at the centre line)
const BOSS = 586;                // 圆钮 starts here
const FIELD = RING0 - STR1;      // depth of the cloud field
const THC = 0.322;               // half the angle of one sector: divider → centre of its cloud scroll
const PHI = 0.012;               // the scroll in view sits a hair off the crest (nothing on a tile is dead centre)
const LINE = 41;                 // width of the raised cloud lines
const GRD = 0.2;                 // how much harder than a pale 蝉翼拓 the pad came down on the recessed ground (乌金拓)
const GR = 1.2;                  // grain of the rubbing, enlarged with the push-in

// half of a cloud scroll (卷云纹): a stem rises from the centre ring and splits into two arms that sweep up toward the rim,
// then roll outward, down and inward into a volute. X along the arc from the stem, Y up from the centre ring (unscaled).
const STEM = 118 * K;
const ARM = [[0, 118], [22, 171], [80, 218], [160, 240], [246, 224], [302, 174], [312, 112], [274, 60], [210, 44],
  [156, 70], [140, 122], [166, 165], [212, 175], [246, 150], [243, 126]];
/** one arm, as the mould-cutter's hand made it: no two volutes alike (coil a little tighter or looser, nudged, lumpy) */
function armPts(seed) {
  const r = L.rng('s08arm' + seed);
  const sx = r.range(0.95, 1.03), sy = r.range(0.97, 1.03);
  const coil = r.range(0.9, 1.04), nx = r.range(-6, 5), ny = r.range(-6, 4), turn = r.range(-0.1, 0.1);
  const vx = 222, vy = 124, cs = Math.cos(turn), sn = Math.sin(turn);
  const pts = ARM.map(([X, Y], i) => {
    if (i === 0) return [0, Y * K];
    let x = X, y = Y;
    if (i >= 4) {
      const w = Math.min(1, (i - 3) / 4), k = L.lerp(1, coil, w);
      const ux = (X - vx) * k, uy = (Y - vy) * k, c = L.lerp(1, cs, w), s2 = sn * w;
      x = vx + ux * c - uy * s2 + nx * w; y = vy + ux * s2 + uy * c + ny * w;
    }
    x += r.range(-4.5, 4.5); y += r.range(-4.5, 4.5);
    return [x * sx * K, Math.min(y * sy, 243) * K];
  });
  if (r.chance(0.4)) pts.pop(); // some coils stop a little short
  return pts; // (one full turn and a hook: bold enough to read in half a second, and the eye of the coil stays open)
}

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

function fieldPt(a, thC, X, Y) {
  const rMid = a.R - (RING0 - FIELD / 2);
  return a.pt(thC + X / rMid, -(RING0 - Y));
}

/** concentric band d0…d1 below the arc, edges gently irregular (hand-pressed clay, not CAD) */
function band(g, a, d0, d1, wob0, wob1, seed) {
  const nz = L.makeNoise('s08' + seed);
  const s = a.span(PAD + 200), n = 240;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const th = L.lerp(-s, s, i / n);
    const p = a.pt(th, -(d0 + wob0 * nz.fbm(th * 13, 1.7, 3)));
    if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
  }
  for (let i = n; i >= 0; i--) {
    const th = L.lerp(-s, s, i / n);
    const p = a.pt(th, -(d1 + wob1 * nz.fbm(th * 13 + 40, 9.2, 3)));
    g.lineTo(p.x, p.y);
  }
  g.closePath(); g.fill();
}

/** relief mask: white = raised clay (takes ink), black = recessed ground */
function buildRelief(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, LW, LH);
    g.fillStyle = '#fff';
    band(g, a, -1.2, RIM, 0, 8, 'rim');
    // two old chips out of the rim's outer edge (崩口, one where the break on the left meets it): shallow, so the edge still rides the arc
    g.fillStyle = '#000';
    for (const [th, hw, dp, sd] of [[-0.44, 36, 10, 1], [0.262, 23, 7.5, 2]]) {
      const rr = L.rng('s08chip' + sd), n = 10;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const u = i / n, e = Math.pow(Math.sin(u * Math.PI), 0.6);
        const p = a.pt(th + ((u - 0.5) * 2 * hw) / a.R, -(dp * e * rr.range(0.55, 1.15)));
        if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
      }
      const q1 = a.pt(th + hw / a.R, 8), q0 = a.pt(th - hw / a.R, 8);
      g.lineTo(q1.x, q1.y); g.lineTo(q0.x, q0.y); g.closePath(); g.fill();
    }
    g.fillStyle = '#fff';
    band(g, a, STR0, STR1, 2.4, 2.6, 'str');
    band(g, a, RING0, RING1, 2.6, 2.6, 'ring');
    band(g, a, BOSS, BOSS + 900, 3, 0, 'boss');
    // 双线界格: two parallel raised lines from the centre ring out to the string line (hand-ruled: not quite parallel)
    const divider = (thC, seed, lean) => {
      for (const sx of [-23, 23]) {
        const pts = [[sx + lean, -6], [sx * 1.06 - lean * 0.4, FIELD * 0.45], [sx * 0.97 - lean, FIELD + 6]].map(([X, Y]) => { const p = fieldPt(a, thC, X, Y); return [p.x, p.y]; });
        L.inkStroke(g, pts, { width: sx < 0 ? 22 : 20, color: '#fff', seed: seed + sx, taper: [0, 0], wobble: 0.16 });
      }
    };
    divider(PHI - THC, 40, 1.5); divider(PHI + THC, 70, -2); divider(PHI - 3 * THC, 90, 2); divider(PHI + 3 * THC, 95, -1);
    // 卷云纹: a stem rising from the centre ring that splits into two volutes curling down and inward
    const cloud = (thC, seed) => {
      const r = L.rng('s08cloud' + seed);
      for (const m of [-1, 1]) {
        const pts = armPts(seed + m).map(([X, Y]) => { const p = fieldPt(a, thC, m * X, Y); return [p.x, p.y]; });
        const w = LINE * r.range(0.92, 1.1);
        L.inkStroke(g, pts, { width: w, color: '#fff', seed: seed + m * 3, taper: [0, 0.06], wobble: 0.3 });
        const e = pts[pts.length - 1];
        g.beginPath(); g.ellipse(e[0], e[1], w * r.range(0.6, 0.74), w * r.range(0.56, 0.68), r.range(0, 3), 0, L.TAU); g.fill();
      }
      const st = [[0, -6], [2, STEM * 0.5], [0, STEM + 8]].map(([X, Y]) => { const p = fieldPt(a, thC, X, Y); return [p.x, p.y]; });
      L.inkStroke(g, st, { width: LINE * 1.1, color: '#fff', seed: seed + 11, taper: [0, 0], wobble: 0.14 });
    };
    // one whole scroll under the crest, framed by its two dividers; the neighbours only show a coil at the lower corners
    cloud(PHI, 101); cloud(PHI - 2 * THC, 202); cloud(PHI + 2 * THC, 303);
  });
}

/** void mask: black = no ink at all (cracks, chipped pits, paper fibres that shed the ink) */
function buildVoid(env) {
  const a = env.arc; const r = L.rng('s08void');
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#fff'; g.fillRect(-PAD, -PAD, LW, LH);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // fibres
    for (let i = 0; i < 130; i++) {
      const p = a.pt(r.range(-0.7, 0.7), -r.range(-6, 720));
      const len = r.range(18, 70), ang = r.range(0, Math.PI), cs = Math.cos(ang), sn = Math.sin(ang);
      g.strokeStyle = `rgba(0,0,0,${r.range(0.1, 0.4).toFixed(3)})`; g.lineWidth = r.range(0.7, 1.6);
      g.beginPath(); g.moveTo(p.x, p.y);
      g.quadraticCurveTo(p.x + cs * len * 0.5 + r.range(-12, 12), p.y + sn * len * 0.5 + r.range(-12, 12), p.x + cs * len, p.y + sn * len);
      g.stroke();
    }
    // pits and small chips, mostly on the rim
    g.fillStyle = '#000';
    for (let i = 0; i < 64; i++) {
      const onRim = i < 40;
      const p = a.pt(r.range(-0.7, 0.7), -(onRim ? r.range(12, RIM - 8) : r.range(RIM, 720)));
      const rad = L.lerp(2, onRim ? 9.5 : 7.5, Math.pow(r(), 2.4));
      g.globalAlpha = r.range(0.8, 1);
      const nv = r.int(5, 8), a0 = r.range(0, L.TAU);
      g.beginPath();
      for (let k = 0; k < nv; k++) {
        const an = a0 + (k / nv) * L.TAU, rr = rad * r.range(0.45, 1.25);
        const px = p.x + Math.cos(an) * rr * 1.3, py = p.y + Math.sin(an) * rr * 0.8;
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    // an old break across the tile (left side): a thin jagged white line
    const crack = (th0, th1, d0, d1, seed, w) => {
      const nz = L.makeNoise('s08crack' + seed); const n = 34; const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const th = L.lerp(th0, th1, t) + 0.012 * nz.fbm(t * 4.5, 1.1, 3) + 0.0018 * nz.n2(t * 21, 5.5);
        const p = a.pt(th, -L.lerp(d0, d1, t)); pts.push(p);
      }
      g.strokeStyle = '#000';
      for (let i = 0; i < n; i++) {
        g.lineWidth = w * (0.55 + 0.9 * Math.abs(nz.n2(i * 0.63, 9.9)));
        g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i + 1].x, pts[i + 1].y); g.stroke();
      }
    };
    crack(-0.452, -0.33, -4, 680, 1, 5.6);
    crack(-0.4, -0.47, 300, 560, 2, 3.2);
  });
}

function makeLat(seed, n) {
  const r = L.rng(seed); const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return { a, n, m: n - 1 };
}
/** tileable smooth value noise in [0,1] */
function vn(lat, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const m = lat.m, n = lat.n, a = lat.a;
  const x0 = xi & m, x1 = (xi + 1) & m, y0 = (yi & m) * n, y1 = ((yi + 1) & m) * n;
  const p = a[y0 + x0], q = a[y0 + x1], r = a[y1 + x0], s = a[y1 + x1];
  const top = p + (q - p) * fx;
  return top + (r + (s - r) * fx - top) * fy;
}

/** one octave of value noise on a ROTATED lattice (so the grain never lines up with the pixel grid or with another octave) */
function oct(lat, cell, ang, ox = 0, oy = 0) { cell *= GR; return { lat, c: Math.cos(ang) / cell, s: Math.sin(ang) / cell, ox, oy }; }
const vo = (o, x, y) => vn(o.lat, x * o.c - y * o.s + o.ox, x * o.s + y * o.c + o.oy);
/** per-pixel white noise in [0,1) */
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** the rubbing itself: per-pixel ink density from the relief mask + layered noise */
function buildInk(env, relief, voidL) {
  const a = env.arc;
  const y0 = Math.max(0, Math.floor(PAD + a.crestY - 36));
  const hh = LH - y0;
  const mS = L.blurred(relief, 2).getContext('2d').getImageData(0, y0, LW, hh).data;
  const vd = L.blurred(voidL, 0.8).getContext('2d').getImageData(0, y0, LW, hh).data;
  // wide blur of the relief at half res → "how close is raised clay" (for the un-inked halo around lines)
  const hw = Math.ceil(LW / 2), hh2 = Math.ceil(hh / 2);
  const wc = L.makeCanvas(hw, hh2); const wg = wc.getContext('2d', { willReadFrequently: true });
  wg.fillStyle = '#000'; wg.fillRect(0, 0, hw, hh2);
  wg.filter = 'blur(6.6px)'; wg.drawImage(relief, 0, y0, LW, hh, 0, 0, LW / 2, hh / 2); wg.filter = 'none';
  const mW = wg.getImageData(0, 0, hw, hh2).data;

  // low-frequency fields on a coarse grid: how hard the ink pad came down here (dab blotches) + worn zones
  const GS = 10, gw = Math.ceil(LW / GS) + 2, gh = Math.ceil(hh / GS) + 2;
  const nA = L.makeNoise('s08dab'), nB = L.makeNoise('s08wear'), nC = L.makeNoise('s08mott');
  const f1 = new Float32Array(gw * gh), f2 = new Float32Array(gw * gh), f3 = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const X = gx * GS + (140 - PAD), Y = gy * GS + y0 + (140 - PAD), i = gy * gw + gx;
    f1[i] = nA.fbm(X / 120, Y / 120, 3);
    f2[i] = nB.fbm(X / 430, Y / 430, 3);
    f3[i] = nC.fbm(X / 52, Y / 52, 2);
  }
  // 扑子印: the tamping pad leaves round, overlapping prints — a little more ink here, a little less there
  const dabC = L.makeCanvas(gw, gh); const dg = dabC.getContext('2d', { willReadFrequently: true });
  dg.fillStyle = '#808080'; dg.fillRect(0, 0, gw, gh);
  const rd = L.rng('s08pad');
  for (let i = 0; i < 230; i++) {
    const px = rd.range(0, gw), py = rd.range(0, gh), pr = rd.range(3.2, 8.5), al = rd.range(0.05, 0.17).toFixed(3);
    const col = rd.chance(0.5) ? '255,255,255' : '0,0,0';
    dg.fillStyle = L.radial(dg, px, py, 0, pr, [[0, `rgba(${col},${al})`], [0.68, `rgba(${col},${al})`], [1, `rgba(${col},0)`]]);
    dg.beginPath(); dg.ellipse(px, py, pr, pr * rd.range(0.7, 1), rd.range(0, 3.14), 0, L.TAU); dg.fill();
  }
  const dabD = dg.getImageData(0, 0, gw, gh).data;
  const f4 = new Float32Array(gw * gh);
  for (let i = 0; i < f4.length; i++) f4[i] = (dabD[i * 4] - 128) / 128;
  const l1 = makeLat('s08l1', 512), l2 = makeLat('s08l2', 512), l3 = makeLat('s08l3', 256), l4 = makeLat('s08l4', 256);
  const O1 = oct(l1, 1.8, 0.47), O2 = oct(l2, 4.1, -0.66), O3 = oct(l3, 9.3, 1.07), O4 = oct(l4, 23, 0.21);
  const P2 = oct(l2, 4.3, 0.95, 77.7, 19.3), P3 = oct(l3, 9.9, -0.38, 31.1, 57.9), P4 = oct(l4, 24, 1.4, 5.5, 9.1), Q2 = oct(l2, 2.7, 2.05, 11.3, 47.1);
  const nS = L.makeNoise('s08smudge');

  const out = new ImageData(LW, hh); const o = out.data;
  const cxL = a.cx + PAD, cyL = a.cy + PAD, R = a.R;
  for (let y = 0; y < hh; y++) {
    const Y = y + y0, dy = Y - cyL;
    const gyf = y / GS, gy0 = Math.floor(gyf), ty = gyf - gy0, row0 = gy0 * gw, row1 = row0 + gw;
    const wrow = (y >> 1) * hw;
    for (let x = 0; x < LW; x++) {
      const dx = x - cxL;
      const d = R - Math.sqrt(dx * dx + dy * dy); // > 0 inside the tile
      if (d < -40) continue;
      const k = (y * LW + x) * 4;
      const v1 = vo(O1, x, Y), v2 = vo(O2, x, Y), v3 = vo(O3, x, Y), v4 = vo(O4, x, Y);
      const wn = hash2(x, Y) - 0.5;
      const z = (0.36 * v1 + 0.30 * v2 + 0.22 * v3 + 0.12 * v4 - 0.5) * 9 + wn * 0.8; // ≈ N(0,1)
      let D, tone = 0;
      if (d < 0) {
        // paper just outside the rim: faint smudges where the pad overshot the edge
        const th = Math.atan2(dx, -dy);
        const s = sstep(0.02, 0.5, nS.fbm(th * 10, 3.3, 2));
        // (kept faint and within ~15 px of the edge, and nearly absent over the crest: on white paper a wider smudge reads as dirt)
        D = s * (0.4 + 0.6 * sstep(0.2, 0.26, Math.abs(th))) * (Math.exp(d / 10) * 0.12 * (0.5 + 0.5 * v3) + Math.exp(d / 12) * 0.20 * sstep(1.3, 2.1, z));
        const m = mS[k] / 255;
        const I0 = sstep(0.9, 1.9, (m - 0.5) * 5 + 0.95 * z);
        if (I0 > D) D = I0;
      } else {
        const gxf = x / GS, gx0 = Math.floor(gxf), tx = gxf - gx0, i0 = row0 + gx0, i1 = row1 + gx0;
        const f1v = L.lerp(L.lerp(f1[i0], f1[i0 + 1], tx), L.lerp(f1[i1], f1[i1 + 1], tx), ty);
        const f2v = L.lerp(L.lerp(f2[i0], f2[i0 + 1], tx), L.lerp(f2[i1], f2[i1 + 1], tx), ty);
        const f3v = L.lerp(L.lerp(f3[i0], f3[i0 + 1], tx), L.lerp(f3[i1], f3[i1 + 1], tx), ty);
        const f4v = L.lerp(L.lerp(f4[i0], f4[i0 + 1], tx), L.lerp(f4[i1], f4[i1 + 1], tx), ty);
        const m = mS[k] / 255;
        // raised clay: solid ink, eaten by specks where the noise dips; the low fields vary how speckled it is
        // (the pad always bites hardest on the outer edge of the rim → keep that edge dense)
        const a1 = (m - 0.5) * 4.7 + 0.28 + 0.95 * z + 1.15 * f1v + 1.2 * f2v + 0.5 * f3v + 1.5 * f4v + 1.2 * (1 - sstep(3, 26, d));
        D = sstep(0.9, 1.9, a1);
        tone = 0.45 - 1.1 * f1v - 0.8 * f2v; tone = tone < 0 ? 0 : tone > 1 ? 1 : tone; // thinner ink where the pad was lighter
        // recessed ground: a dry, granular grey (stippled, not airbrushed) + stray dabs, thinning to bare paper beside raised lines
        if (m < 0.94) {
        // (its width wanders: here the pad bridged far from the line, there the wash creeps right up to it)
        const hl = 15 + 28 * f3v + 24 * f1v + 26 * f4v;
        const halo = sstep(hl, hl + 36, mW[(wrow + (x >> 1)) * 4]);
        const z2 = (0.3 * vo(P2, x, Y) + 0.4 * vo(P3, x, Y) + 0.3 * vo(P4, x, Y) - 0.5) * 9;
        // (the pad was dabbed, not rolled: the wash gathers into cloudy blotches a few mm across rather than an even pepper)
        let cover = 0.4 + GRD + 0.4 * f1v + 0.24 * f2v + 0.26 * f3v + 0.06 * z2 + 0.55 * f4v;
        cover = (cover < 0.08 ? 0.08 : cover > 0.9 ? 0.9 : cover) * (1 - 0.94 * halo);
        const zf = (0.5 * v1 + 0.5 * vo(Q2, x, Y) - 0.5) * 6.4 + wn * 0.9;
        const tS = 1.9 - 4.2 * cover;
        const stip = sstep(tS - 0.4, tS + 0.4, zf);
        const sp = (sstep(1.0, 1.9, z2 + 1.2 * f3v) * 0.7 * (0.35 + 0.65 * sstep(-0.9, 0.3, zf)) + sstep(1.7, 2.4, z) * 0.4) * (1 - 0.94 * halo);
        const Dg = (cover * 0.42 + stip * 0.62 + sp) * sstep(0, 2.5, d);
        if (Dg > D) D = Dg;
        }
      }
      // (voids break up into the same grain as the ink: a pit or a shed fibre is a ragged gap, never an airbrushed dot)
      const vv = vd[k] / 255;
      if (vv < 0.995) D *= sstep(0.3, 0.72, vv + 0.13 * z);
      if (D <= 0.004) continue;
      o[k] = 5 + 13 * tone; o[k + 1] = 5 + 14 * tone; o[k + 2] = 6 + 18 * tone; o[k + 3] = D > 1 ? 255 : D * 255; // 乌金黑 #050506 → 松烟青黑 #121318
    }
  }
  const ink = L.makeCanvas(LW, LH);
  ink.getContext('2d').putImageData(out, 0, y0);
  ink._pad = PAD;
  return ink;
}

function buildSheet(env) {
  const a = env.arc;
  const relief = buildRelief(env);
  const ink = buildInk(env, relief, buildVoid(env));
  // 本白宣纸: neutral white; whatever shading the sheet has is cool grey, never tea-yellow (ageing = texture only)
  const paper = L.paperTex(LW, LH, { base: '#f6f7f5', seed: 's08paper', tone: '#8c939a', fiber: 0.3, stain: 0.15, grain: 0.2 });
  return L.makeLayer(PAD, (g) => {
    g.drawImage(paper, -PAD, -PAD);
    // (no ruled 帘纹: in reflected light the laid lines of xuan paper barely show, and evenly ruled lines read as a notebook)
    // pulp: the cloudy, faintly fibrous body of the sheet — a few per cent of the same cool grey, never a second colour
    g.save(); g.globalCompositeOperation = 'multiply';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's08pulp', scale: 24, sx: 2.8, octaves: 3, warp: 1.5, res: 0.5, contrast: 1.5, ramp: [[0, '#e2e5e8'], [0.5, '#fbfbfb'], [1, '#ffffff']] }), -PAD, -PAD);
    g.restore();
    // long fibres of the hand-made sheet (visible at this magnification), white and cool grey, plus a few pulp clumps
    const rf = L.rng('s08xuan');
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 220; i++) {
      const x = rf.range(-PAD, W + PAD), y = rf.range(-PAD, H + PAD), len = rf.range(34, 190), ang = rf.range(0, Math.PI);
      const cs = Math.cos(ang), sn = Math.sin(ang), b1 = rf.range(-22, 22), b2 = rf.range(-22, 22);
      g.strokeStyle = rf.chance(0.7) ? `rgba(255,253,244,${rf.range(0.1, 0.32).toFixed(3)})` : `rgba(105,112,122,${rf.range(0.03, 0.065).toFixed(3)})`;
      g.lineWidth = rf.range(0.7, 1.9) * (rf.chance(0.06) ? 2.2 : 1);
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + cs * len * 0.33 - sn * b1, y + sn * len * 0.33 + cs * b1, x + cs * len * 0.66 - sn * b2, y + sn * len * 0.66 + cs * b2, x + cs * len, y + sn * len);
      g.stroke();
    }
    g.restore();
    // gentle cockling of the sheet
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.3;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's08cockle', scale: 420, sx: 1.7, octaves: 3, res: 0.12, contrast: 1.5 }), -PAD, -PAD);
    g.restore();
    // a handful of pale pulp specks (no brown foxing, no ink flecks: the bare sheet stays one clean field)
    L.speckle(g, { seed: 's08fox', count: 12, x: -PAD, y: -PAD, w: LW, h: LH, rMin: 1, rMax: 5, colors: ['#b8bdc2'], alpha: [0.04, 0.1] });
    // the sheet was beaten down over the edge of the tile while wet: the lip throws a faint, even shade on the side away from
    // the light. Nothing else is drawn on the bare sheet — it stays one clean field.
    g.drawImage(lipShade(env), -PAD, -PAD);
    // the rubbing (a lens never resolves single pixels: take the digital edge off the grain)
    g.filter = 'blur(0.55px)'; g.drawImage(ink, -PAD, -PAD); g.filter = 'none';
    // the paper was beaten into the relief while wet and still carries it: under the raking light (from the upper left) every
    // raised edge throws a soft shade into the bare channel on its far side. Wide and faint — a relief, not a drop shadow.
    g.save(); a.clipBelow(g, 4);
    g.drawImage(embossShade(relief), -PAD + 5, -PAD + 5, LW, LH); // cast a few px down-light of each edge
    g.restore();
  });
}

/** the pressed lip of the sheet: outside the rim the paper drops away, and with the light coming from the upper left the
 *  outer slope on the right-hand side falls in a soft, even shade (a contact shadow, a few px wide — shading, not a smudge).
 *  Transparent where untouched. */
function lipShade(env) {
  const a = env.arc, s = a.span(PAD + 200);
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 2, a.R + 30, [[0, 'rgba(52,60,74,0.16)'], [0.3, 'rgba(52,60,74,0.08)'], [1, 'rgba(52,60,74,0)']]);
    a.pathBand(g, -2, 30, -s, s); g.fill();
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = L.linear(g, 700, 0, 1700, 0, [[0, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
  });
}

/** half-res shade map of the relief: cool grey, opaque only on the flanks that face away from the upper-left light */
function embossShade(relief) {
  const w = LW >> 1, h = LH >> 1;
  const c = L.makeCanvas(w, h); const g = c.getContext('2d', { willReadFrequently: true });
  g.filter = 'blur(2.9px)'; g.drawImage(relief, 0, 0, w, h); g.filter = 'none';
  const d = g.getImageData(0, 0, w, h).data; const out = new ImageData(w, h); const o = out.data;
  const row = w * 4;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    const fall = (d[i - 4] - d[i + 4]) + (d[i - row] - d[i + row]); // > 0 where the height drops along the light's path
    if (fall <= 2) continue;
    o[i] = 40; o[i + 1] = 46; o[i + 2] = 56; o[i + 3] = (fall > 80 ? 1 : fall / 80) * 68;
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** a half-resolution, out-of-focus copy of the sheet (blur given in full-res px) */
function softCopy(sheet, px) {
  const c = L.makeCanvas(LW / 2, LH / 2); const g = c.getContext('2d');
  g.filter = `blur(${(px / 2).toFixed(2)}px)`;
  g.drawImage(sheet, 0, 0, c.width, c.height);
  g.filter = 'none';
  return c;
}
/** macro lens: the plane of focus sits on the rim just under the crest; the sheet goes soft toward the sides and the corners.
 *  Baked into the sheet (it drifts < 20 px during the shot, so a lens-fixed focus would look the same and cost every frame). */
function bakeFocus(sheet, a) {
  const g = sheet.getContext('2d'); // carries translate(PAD, PAD)
  const tmp = L.makeCanvas(LW, LH); const tg = tmp.getContext('2d');
  const fx = a.cx + PAD, fy = a.crestY + 120 + PAD;
  for (const [px, r0, r1] of [[3.2, 470, 860], [8.5, 800, 1320]]) {
    const soft = softCopy(sheet, px);
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, LW, LH);
    tg.drawImage(soft, 0, 0, LW, LH);
    // mask: transparent inside r0 of the focus point, opaque beyond r1 (vertical distances count 1.25×)
    tg.globalCompositeOperation = 'destination-in';
    tg.translate(fx, fy); tg.scale(1, 0.8);
    tg.fillStyle = L.radial(tg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [0.35, 'rgba(0,0,0,0.22)'], [0.7, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,1)']]);
    tg.fillRect(-3000, -3000, 6000, 6000);
    g.drawImage(tmp, -PAD, -PAD);
  }
  return sheet;
}

export default {
  name: '云纹瓦当拓片',
  tone: 'dark',
  init(env) {
    S = { sheet: bakeFocus(buildSheet(env), env.arc) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // the whole sheet drifts along the arc and the camera creeps in; the zoom stays within ±1 % so the rim never leaves
    // the arc by more than a few px even at the frame edges — the drift along the arc (rot) carries the motion instead
    const rot = L.lerp(-0.008, 0.008, p), zoom = L.lerp(0.993, 1.009, p);
    ctx.fillStyle = '#f6f7f5'; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.sheet, { rot, zoom });
    // fixed copy-stand light: neutral, a touch brighter at the upper left than the lower right (no warm wash on the white sheet)
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = L.linear(ctx, 0, 0, W, H, [[0, 'rgba(255,255,255,0.16)'], [0.5, 'rgba(128,128,128,0)'], [1, 'rgba(0,0,0,0.10)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // a breath of light sliding along the rim: soft-light, so it opens the grey ground a little but never lifts the black
    const gl = a.pt(L.lerp(-0.2, 0.06, p), -70);
    L.glow(ctx, gl.x, gl.y, 480, '#ffffff', 0.18, 'soft-light');
    // the rubbing falls away from the raking light toward the lower right, and sinks a little at both lower corners —
    // only BELOW the arc; the bare white paper gets neither
    ctx.save(); a.clipBelow(ctx, -8);
    ctx.fillStyle = L.linear(ctx, 500, 560, 1920, 1180, [[0, 'rgba(22,26,34,0)'], [1, 'rgba(22,26,34,0.24)']]);
    ctx.fillRect(0, 0, W, H);
    L.vignette(ctx, { strength: 0.1 });
    ctx.restore();
  },
};
