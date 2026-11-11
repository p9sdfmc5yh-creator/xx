// s26 — 青花. Macro of the well of a blue-and-white porcelain dish (underglaze cobalt, hand painted).
// The arc is the upper edge of the heavier of two wheel-turned 弦纹 (string lines). Under them, pushed close: the two
// upturned roofs of one pavilion painted the 分水 way (dark outline first, watery cobalt floated inside it in several
// strengths), a willow at the left and one pale far hill at the right. Above the lines the glaze is left bare.
//
// How the blue is made: every brush mark is first laid down as "pigment density" (alpha on one canvas, so overlapping
// marks pile up the way cobalt does). The drawing is then pushed around by a slow noise field (a hand is never ruler
// straight) and a single per-pixel pass "fires" it: wash edges dry to darker tide lines, the load is broken by bristle
// streaks and granulation, and density is mapped through a five-tone cobalt ramp (影淡 → 头浓). Where the pigment is
// heaped it goes blue-black and breaks into a few rust-brown clumps. A soft halo is laid under it (cobalt bleeding into
// the glaze); bubbles, a shallow depth of field and the reflections on the glaze go on top.
import * as L from '../lib/core.js';

const { W, H, TAU } = L;
const PAD = 70;
const LW = W + PAD * 2, LH = H + PAD * 2;
const BAND = 64;          // width of the heavy string line (its top edge is the arc)
const FINE = -104;        // centre of the fine string line (dr)
const FHW = 7;            // its half-width
const KEEP = 134;         // the painting stays at least this far below the arc
const K = 1.7;            // brush scale of the painting (line weights, tile spacing …)
let S = null;

const sm = (e0, e1, x) => { const t = L.clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const read = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;

// ───────────────────────── glaze body ─────────────────────────
function buildGlaze(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, LW, LH);
    g.fillStyle = '#e7f1f4'; full();
    // key light from the upper left, falling away to a clean pale blue at the lower right (never grey)
    g.fillStyle = L.linear(g, 200, -220, 1720, 1300, [[0, 'rgba(250,253,253,0.92)'], [0.45, 'rgba(236,245,247,0.5)'], [1, 'rgba(178,216,238,0.9)']]); full();
    // the dish's form, concentric with the arc: flat well below, a fold where the glaze pools lake-green, the wall rising above
    const r0 = a.R - 700, r1 = a.R + 800, t = (dr) => (dr + 700) / 1500;
    g.fillStyle = L.radial(g, a.cx, a.cy, r0, r1, [
      [t(-700), 'rgba(158,200,225,0.5)'], [t(-330), 'rgba(186,216,232,0.14)'], [t(-110), 'rgba(197,222,234,0)'],
      [t(-2), 'rgba(126,198,210,0.32)'], [t(36), 'rgba(150,208,216,0.16)'], [t(120), 'rgba(190,222,230,0.04)'], [t(280), 'rgba(255,255,255,0)'],
      [t(440), 'rgba(255,255,255,0.4)'], [t(620), 'rgba(196,228,242,0.2)'], [t(800), 'rgba(150,212,240,0.42)']]);
    full();
    // slow drift in glaze thickness (kept very gentle: porcelain, not paper)
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.2;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's26mottle', scale: 620, octaves: 2, res: 0.1, warp: 0.4, contrast: 1.2 }), -PAD, -PAD);
    g.restore();
  });
}

// ───────────────────────── the two 弦纹 (pigment density, per pixel) ─────────────────────────
/** everything about the two lines that depends only on the distance s along the arc, tabulated per pixel of arc length */
function bandTables(nz) {
  const S0 = -1500, N = 3001, F = () => new Float32Array(N);
  const T = { S0, N, eT: F(), eB: F(), pres: [F(), F(), F()], load: [F(), F(), F()], c: F(), hw: F(), ta: F(), la: F(), tb: F() };
  for (let i = 0; i < N; i++) {
    const s = S0 + i;
    // heavy line — its upper edge IS the arc. Turned on the wheel: the brush is set down (顿), the dish turns under it,
    // and the tail of the turn (the brush nearly dry by then) laps over the head. Load thins with distance from each dip.
    T.eT[i] = 0.3 + 0.75 * nz.n2(s / 180, 1.3) + 0.35 * nz.n2(s / 43, 4.4);
    const head1 = Math.exp(-(((s + 540) / 62) ** 2)), head2 = Math.exp(-(((s - 720) / 56) ** 2));
    T.eB[i] = -BAND + 4.4 * nz.n2(s / 260, 7.7) + 1.7 * nz.n2(s / 62, 2.2) - 7 * head1 - 5 * head2;
    const wob = 0.09 * nz.n2(s / 230, 3.9);
    T.pres[0][i] = 1 - sm(-500, -436, s); T.load[0][i] = 0.86 - 0.2 * sm(-1250, -470, s) + 0.07 * nz.n2(s / 330, 12.5);            // tail of the turn (dry)
    T.pres[1][i] = sm(-574, -548, s) * (1 - sm(716, 792, s)); T.load[1][i] = 1.05 - 0.15 * (1 - Math.exp(-(s + 560) / 700)) + wob;  // fresh dip
    T.pres[2][i] = sm(686, 710, s); T.load[2][i] = 1.02 - 0.12 * (1 - Math.exp(-(s - 700) / 600)) + wob;                            // second dip
    // fine line below it: runs dry toward its own joint, then a fresh start
    T.c[i] = FINE + 2.4 * nz.n2(s / 270, 21.7) + 1.0 * nz.n2(s / 58, 8.8);
    T.hw[i] = FHW + 1.2 * nz.n2(s / 130, 15.1) + 3 * Math.exp(-(((s - 352) / 34) ** 2));
    const w2 = 0.06 * nz.n2(s / 200, 44.1);
    T.ta[i] = 1 - sm(340, 392, s); T.la[i] = 0.98 - 0.36 * sm(-700, 340, s) + w2;
    T.tb[i] = sm(326, 348, s) * L.clamp(1.0 - 0.2 * (1 - Math.exp(-(s - 338) / 600)) + w2);
  }
  return T;
}
function bandAt(T, nz, s, dr) {
  const i = Math.round(s) - T.S0;
  if (i < 0 || i >= T.N) return 0;
  let keep = 1;
  const eT = T.eT[i], eB = T.eB[i];
  if (dr < eT + 1.2 && dr > eB - 2.2) {
    const cover = sm(eT + 1.0, eT - 1.0, dr) * sm(eB - 2.0, eB + 2.0, dr);
    const u = (dr - eB) / (eT - eB);
    const pool = 0.82 + 0.32 * Math.pow(Math.abs(2 * u - 1), 2.6);       // pigment settles along both edges of a stroke
    const hair = nz.n2(s / 340, dr / 2.7 + 31), hair2 = nz.n2(s / 560 + 9, dr / 2.0 - 17);   // bristle streaks
    const edge = 1 - sm(0.8, 0.97, u);                                    // the arc edge itself never breaks
    for (let k = 0; k < 3; k++) {
      const pres = T.pres[k][i];
      if (pres <= 0) continue;
      const load = T.load[k][i];
      const gap = Math.max(0, 0.82 - load) * 2.1 * sm(0.1, 0.6, hair2) * edge;  // 飞白 where the brush runs dry
      keep *= 1 - cover * pres * L.clamp(load * pool * (1 + 0.34 * hair * (1.55 - load)) - gap) * 0.93;
    }
  }
  const hw = T.hw[i], ad = Math.abs(dr - T.c[i]);
  if (ad < hw + 1.4) {
    const cover = sm(hw + 1.1, hw - 1.1, ad), pool = 0.86 + 0.2 * Math.pow(ad / hw, 2.4);
    if (T.ta[i] > 0) keep *= 1 - cover * T.ta[i] * L.clamp(T.la[i] * pool * (1 + 0.24 * nz.n2(s / 260, dr / 1.9 + 3))) * 0.9;
    keep *= 1 - cover * T.tb[i] * pool * 0.86;
  }
  return 1 - keep;
}

/** add the string lines to a density array (one byte per pixel of the padded layer); prot marks the arc edge itself */
function addBands(al, prot, a) {
  const nz = L.makeNoise('s26band'), T = bandTables(nz);
  for (let x = 0; x < LW; x++) {
    const fx = x - PAD, dx = fx - a.cx;
    const y0 = Math.max(0, Math.floor(a.yAt(fx, 4)) + PAD), y1 = Math.min(LH - 1, Math.ceil(a.yAt(fx, FINE - FHW - 9)) + PAD);
    for (let y = y0; y <= y1; y++) {
      const dy = a.cy - (y - PAD), dr = Math.sqrt(dx * dx + dy * dy) - a.R;
      const v = bandAt(T, nz, Math.atan2(dx, dy) * a.R, dr);
      if (v > 0.003) { const i = y * LW + x; al[i] = 255 * (1 - (1 - al[i] / 255) * (1 - v)); if (dr > -9) prot[i] = 1; }
    }
  }
}

// ───────────────────────── brush kit (everything is laid down as density) ─────────────────────────
function painter(g) {
  let sid = 7;
  const r = L.rng('s26brush');
  const P = { g, r };
  const trace = (pts, soft) => {
    g.beginPath();
    if (soft) {
      const n = pts.length, m = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
      const m0 = m(n - 1); g.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) { const q = m(i); g.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    } else { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }
    g.closePath();
  };
  /** a brush line; o.dun presses a little blob at the start (顿笔) */
  P.line = (pts, w, al, o = {}) => {
    sid += 1;
    L.inkStroke(g, pts, { width: w, color: '#000', alpha: al, seed: sid, taper: o.taper || [0.06, 0.22], wobble: o.wobble === undefined ? 0.5 : o.wobble, smoothStep: 3 });
    if (o.dun) { const [x, y] = pts[0]; g.save(); g.globalAlpha = al * 0.6; g.fillStyle = '#000'; g.beginPath(); g.ellipse(x, y, w * 0.74, w * 0.58, r() * 3, 0, TAU); g.fill(); g.restore(); }
  };
  /** a nearly straight hand-drawn line */
  P.hl = (x0, y0, x1, y1, w, al, o = {}) => {
    const j = o.j === undefined ? 2.2 : o.j;
    P.line([[x0, y0], [L.lerp(x0, x1, 0.33) + r.range(-j, j), L.lerp(y0, y1, 0.33) + r.range(-j, j)], [L.lerp(x0, x1, 0.67) + r.range(-j, j), L.lerp(y0, y1, 0.67) + r.range(-j, j)], [x1, y1]], w, al, { taper: [0.03, 0.05], ...o });
  };
  /**
   * 分水 wash: a first even pass, then a few more passes of the loaded brush inside the shape so the tone pools unevenly
   * (each pass keeps a hard edge: fired, it dries to a tide line). The wash is nudged a little off its outline, as a
   * quick hand leaves it. o.flat = single even pass; o.fix = no nudge; o.nudge = how far (px).
   */
  P.wash = (pts, al, o = {}) => {
    const nd = o.nudge === undefined ? 3 : o.nudge;
    const ox = o.fix ? 0 : r.range(-nd, nd), oy = o.fix ? 0 : r.range(-nd, nd) * 0.8;
    const q = pts.map(([x, y]) => [x + ox, y + oy]);
    g.save(); g.fillStyle = '#000';
    g.globalAlpha = al * (o.flat ? 1 : 0.7); trace(q, o.soft); g.fill();
    if (!o.flat) {
      g.clip();
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const nb = o.blots || Math.round(L.clamp((x1 - x0) / 110, 3, 8));
      for (let i = 0; i < nb; i++) {
        const bx = r.range(x0, x1), by = r.range(y0, y1), rw = r.range(0.14, 0.42) * Math.max(60, x1 - x0), rh = r.range(0.35, 0.8) * Math.max(30, y1 - y0);
        const blob = []; for (let j = 0; j < 7; j++) { const an = (j / 7) * TAU, rr = r.range(0.7, 1.15); blob.push([bx + rw * rr * Math.cos(an), by + rh * rr * Math.sin(an)]); }
        g.globalAlpha = al * r.range(0.22, 0.5); trace(blob, true); g.fill();
      }
    }
    g.restore();
  };
  P.knock = (pts, o = {}) => { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; trace(pts, o.soft); g.fill(); g.restore(); };
  P.clip = (pts, fn) => { g.save(); trace(pts, false); g.clip(); fn(); g.restore(); };
  P.dab = (x, y, len, ang, w, al) => { g.save(); g.globalAlpha = al; g.fillStyle = '#000'; g.beginPath(); g.ellipse(x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2, len / 2, w / 2, ang, 0, TAU); g.fill(); g.restore(); };
  P.dot = (x, y, rad, al) => { g.save(); g.globalAlpha = al; g.fillStyle = '#000'; g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.7, 1), r() * 3, 0, TAU); g.fill(); g.restore(); };
  return P;
}

/** far hill: palest wash fading to mist at its foot, a darker shoulder, a ridge line, a few 皴 strokes, 苔点 on the crest */
function hill(P, ridge, baseY, tone) {
  const { g, r } = P;
  const pts = L.smoothPath(ridge, 10);
  let top = 1e9; for (const p of pts) top = Math.min(top, p[1]);
  g.save();
  g.fillStyle = L.linear(g, 0, top, 0, baseY, [[0, `rgba(0,0,0,${tone})`], [0.5, `rgba(0,0,0,${tone * 0.85})`], [1, 'rgba(0,0,0,0)']]);
  g.beginPath(); g.moveTo(pts[0][0], baseY); for (const p of pts) g.lineTo(p[0], p[1]); g.lineTo(pts[pts.length - 1][0], baseY); g.closePath(); g.fill();
  // two more, shorter passes under the crest: the hill gets a darker shoulder with hard, dried edges
  g.clip();
  for (const [dx, d0, d1, al] of [[40, 22, 96, 0.85], [84, 44, 62, 0.7]]) {
    g.fillStyle = `rgba(0,0,0,${tone * al})`;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 90);
    for (let i = 0; i < pts.length; i++) g.lineTo(pts[i][0] + dx, pts[i][1] + d0 + 34 * Math.sin(i * 0.19 + dx));
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0] + dx + 26, pts[i][1] + d0 + d1 + 30 * Math.sin(i * 0.27 + 1));
    g.closePath(); g.fill();
  }
  g.restore();
  P.line(ridge, 6.4, tone * 2.6, { taper: [0.04, 0.04], wobble: 0.6 });
  for (let i = 5; i < pts.length - 5; i += 5) {
    if (!r.chance(0.6)) continue;
    const [x, y] = pts[i];
    const dir = pts[i + 4][1] > pts[i - 4][1] ? 1 : -1, len = r.range(46, 120);
    P.line([[x, y + 10], [x + dir * len * 0.32, y + len * 0.55], [x + dir * len * 0.46, y + len]], 5.2, tone * 1.8, { taper: [0.05, 0.55] });
  }
  for (let i = 8; i < pts.length - 8; i += r.int(9, 15)) {
    const [x, y] = pts[i];
    for (let k = 0; k < 4; k++) P.dab(x + r.range(-26, 26), y + r.range(-7, 5), r.range(17, 27), r.range(-0.25, 0.25), r.range(9, 13), tone * 3);
  }
}

/**
 * A tiled roof with the concave fall and upturned corners (翼角起翘) of Chinese eaves.
 * yr/hr = ridge height and half-length; ye/he = eave height and half-length; ext/lift = corner sweep. k = brush scale.
 */
function roof(P, cx, yr, hr, ye, he, ext, lift, o = {}) {
  const { g, line, r } = P;
  const k = o.k || 1, drop = (o.drop === undefined ? 11 : o.drop) * k, tone = o.tone || 0.3;
  const sideY = (t) => yr + (ye - yr) * (1 - Math.pow(1 - t, 1.9));
  // no two corners of a hand-painted roof are alike: the right-hand one sweeps a little further and higher
  const ex = (s) => ext * (1 + s * (o.asym || 0)), lf = (s) => lift * (1 + s * (o.asym || 0) * 1.6);
  const top = (s) => { const p = []; for (let i = 0; i <= 8; i++) p.push([cx + s * L.lerp(hr, he, i / 8), sideY(i / 8)]); p.push([cx + s * (he + ex(s) * 0.55), ye - lf(s) * 0.3]); p.push([cx + s * (he + ex(s)), ye - lf(s)]); return p; };
  const under = (s) => [[cx + s * (he + ex(s)), ye - lf(s)], [cx + s * (he + ex(s) * 0.5), ye - lf(s) * 0.22 + 6 * k], [cx + s * (he - 6 * k), ye + drop * 0.75], [cx + s * he * 0.62, ye + drop]];
  const tl = top(-1), tr = top(1), ul = under(-1), ur = under(1);
  const poly = [...tl, ...ul.slice(1), [cx, ye + drop + 1], ...ur.slice(1).reverse(), ...tr.slice().reverse()];
  P.knock(poly);
  // 分水: the first pale pass sits a little off its outline, then heavier water is floated over it
  P.wash(poly, tone * 0.5, { nudge: 4 * k, flat: true });
  P.wash(poly, tone * 0.56, { fix: true, blots: 3 });
  P.clip(poly, () => {
    // the slope darkens toward the eave …
    g.fillStyle = L.linear(g, 0, yr, 0, ye + drop, [[0, 'rgba(0,0,0,0)'], [0.35, 'rgba(0,0,0,0.04)'], [1, 'rgba(0,0,0,0.22)']]);
    g.fillRect(cx - he - ext - 10, yr - 10, (he + ext + 10) * 2, ye - yr + drop + 30);
    // … in steps: two more floats of water, each stopping short of the ridge along its own ragged line (fired, a tide line)
    const hgt = ye + drop - yr, far = he + ext + 30;
    for (const [f, al] of [[0.3, 0.2], [0.6, 0.26]]) {
      const edge = [];
      for (let i = 0; i <= 12; i++) { const t = -1 + i / 6; edge.push([cx + t * far, yr + hgt * (f + 0.1 * Math.pow(Math.abs(t), 1.5) + r.range(-0.08, 0.08))]); }
      P.wash([...edge, [cx + far, ye + drop + 40], [cx - far, ye + drop + 40]], al, { flat: true, fix: true, soft: true });
    }
    // and the loaded brush leaves heavier passes here and there down the fall of the tiles
    const np = Math.round(he / (44 * k)) + 3;
    for (let i = 0; i < np; i++) {
      const t = r.range(-1, 1), x0 = cx + t * hr, x1 = cx + t * he;
      line([[x0, yr - 4], [L.lerp(x0, x1, 0.4), L.lerp(yr, ye, 0.66)], [x1, ye + drop + 4]], r.range(18, 42) * k, r.range(0.14, 0.3), { taper: [0, 0], wobble: 0.5 });
    }
  });
  // tile courses (瓦垄) fanning from ridge to eave
  const n = Math.max(3, Math.round(he / (19 * k)));
  for (let i = -n; i <= n; i++) {
    const t = (i + r.range(-0.2, 0.2)) / n, x0 = cx + t * hr * 0.97, x1 = cx + t * (he - 8 * k);
    line([[x0, yr + 5 * k], [L.lerp(x0, x1, 0.38) + r.range(-3, 3), L.lerp(yr, ye, 0.66)], [x1, ye + drop * 0.5 + r.range(-3, 4)]], r.range(2.6, 3.5) * k, r.range(0.5, 0.82), { taper: [0.05, 0.14], wobble: 0.4 });
  }
  // hip ridges running out to the corner tips
  line(tl, 7.8 * k, 0.94, { taper: [0.03, 0.34], dun: true }); line(tr, 7.8 * k, 0.94, { taper: [0.03, 0.34], dun: true });
  // eave line with a row of tile ends (瓦当) just above it
  line([ul[0], ul[1], ul[2], ul[3], [cx, ye + drop + 1], ur[3], ur[2], ur[1], ur[0]], 8.4 * k, 0.96, { taper: [0.1, 0.1] });
  for (let x = cx - he * 0.9; x <= cx + he * 0.9; x += 17 * k * r.range(0.9, 1.12)) {
    const ax = Math.abs(x - cx), y = ax < he * 0.62 ? ye + drop : L.lerp(ye + drop, ye + drop * 0.75, (ax - he * 0.62) / (he * 0.38));
    P.dot(x + r.range(-2, 2), y - 9.5 * k, r.range(2.8, 3.5) * k, 0.88);
  }
  if (o.ridge) {
    // main ridge (正脊) with a curled finial at each end
    line([[cx - hr - 10 * k, yr + 2], [cx - hr * 0.3, yr - 2.5], [cx + hr * 0.4, yr + 1], [cx + hr + 10 * k, yr + 2]], 10.5 * k, 0.97, { taper: [0.04, 0.04], dun: true });
    for (const s of [-1, 1]) line([[cx + s * (hr + 2 * k), yr + 2], [cx + s * (hr + 13 * k), yr - 9 * k], [cx + s * (hr + 4 * k), yr - 21 * k], [cx + s * (hr - 8 * k), yr - 14 * k]], 6.8 * k, 0.96, { taper: [0.04, 0.45] });
  } else if (hr > 20) {
    P.hl(cx - hr - 4 * k, yr + 2, cx + hr + 4 * k, yr + 2, 6.6 * k, 0.95);
  }
}

/** lattice window, hatched freehand */
function lattice(P, x0, y0, x1, y1, sp, k) {
  const { g, r } = P;
  const hgt = y1 - y0;
  g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, hgt); g.clip();
  for (let q = -hgt + r.range(0, sp); q < (x1 - x0) + hgt; q += sp * r.range(0.8, 1.2)) {
    P.hl(x0 + q, y0 - 1, x0 + q + hgt + r.range(-4, 4), y1 + 1, r.range(1.8, 2.5) * k, r.range(0.45, 0.7), { j: 1, taper: [0, 0] });
    P.hl(x0 + q + hgt, y0 - 1, x0 + q + r.range(-4, 4), y1 + 1, r.range(1.8, 2.5) * k, r.range(0.45, 0.7), { j: 1, taper: [0, 0] });
  }
  g.restore();
  P.hl(x0 - 1, y0, x1 + 1, y0, 2.6 * k, 0.8); P.hl(x0 - 1, y1, x1 + 1, y1, 2.6 * k, 0.8); P.hl(x0, y0, x0, y1, 2.3 * k, 0.75); P.hl(x1, y0, x1, y1, 2.3 * k, 0.75);
}

function railing(P, x0, x1, yTop, yBot, o = {}) {
  const k = o.k || 1;
  const n = o.n || Math.max(1, Math.round(Math.abs(x1 - x0) / (46 * k)));
  P.hl(x0, yTop, x1, yTop, 4.2 * k, 0.93); P.hl(x0, yBot, x1, yBot, 3.4 * k, 0.86);
  for (let i = 0; i <= n; i++) {
    const x = L.lerp(x0, x1, i / n);
    P.hl(x, yTop - 7 * k, x + P.r.range(-1.5, 1.5), yBot, 4.6 * k, 0.93, { j: 0.8 });
    P.dot(x, yTop - 9 * k, 3.3 * k, 0.93);
    if (i < n) {
      const xb = L.lerp(x0, x1, (i + 1) / n);
      P.hl(x + 5, yTop + 5, xb - 5, yBot - 3, 2.2 * k, 0.6, { j: 0.8 });
      P.hl(x + 5, yBot - 3, xb - 5, yTop + 5, 2.2 * k, 0.6, { j: 0.8 });
    }
  }
}

/** one storey: shadow under the eave, lintel, columns, lattice windows */
function storey(P, cx, y0, y1, cols, o = {}) {
  const k = o.k || 1, r = P.r;
  const x0 = cx + cols[0], x1 = cx + cols[cols.length - 1];
  P.knock(rect(x0 - 8 * k, y0 - 3 * k, x1 + 8 * k, y1 + 3 * k));
  P.wash(rect(x0 - 12 * k, y0 - 4 * k, x1 + 12 * k, y0 + 8 * k), 0.5, { fix: true });        // shadow under the eave
  for (let x = x0 - 6 * k; x <= x1 + 6 * k; x += 15 * k) P.dot(x + r.range(-2, 2), y0 + 2.5 * k, 3 * k, 0.75);  // bracket sets / rafter ends: a row of touches
  P.hl(x0 - 9 * k, y0 + 9 * k, x1 + 9 * k, y0 + 9 * k, 4.6 * k, 0.92);
  for (let i = 0; i < cols.length - 1; i++) {
    const bx0 = cx + cols[i] + 7 * k, bx1 = cx + cols[i + 1] - 7 * k;
    const wy1 = L.lerp(y0 + 15 * k, y1, o.sill === undefined ? 0.6 : o.sill);
    P.wash(rect(bx0, y0 + 13 * k, bx1, wy1 + 2), 0.15, { blots: 2 });
    lattice(P, bx0 + 2, y0 + 15 * k, bx1 - 2, wy1, (o.sp || 14) * k, k);
  }
  for (const c of cols) P.hl(cx + c, y0 + 6 * k, cx + c + r.range(-2, 2), y1, 7 * k, 0.94, { j: 1, dun: true });
  P.hl(x0 - 9 * k, y1, x1 + 9 * k, y1, 5 * k, 0.93);
}

/**
 * A willow the way the blue-and-white painters wrote it: a leaning trunk in two dark contour strokes, three limbs arching
 * out of the fork, and from them a curtain of long strands that all sway the same way, each feathered with paired leaf dabs.
 * s scales the whole tree; everything is kept below the string lines.
 */
function willow(P, bx, by, a, s) {
  const { line, dab, r } = P;
  const lim = (x, y) => Math.max(y, a.yAt(x, -KEEP - 12));
  const T = (x, y) => { const qx = bx + x * s, qy = by + y * s; return [qx, lim(qx, qy)]; };
  const trunk = [T(26, 20), T(6, -50), T(-16, -112), T(-10, -164), T(6, -204)];
  line(trunk, 36 * s, 0.5, { taper: [0, 0.3], wobble: 0.5 });
  line(trunk.map(([x, y], i) => [x - (17 - i * 2.6) * s, y]), 6.4 * s, 0.95, { taper: [0.02, 0.2], wobble: 0.6 });
  line(trunk.map(([x, y], i) => [x + (17 - i * 2.6) * s, y]), 5 * s, 0.9, { taper: [0.02, 0.2], wobble: 0.6 });
  const tq = L.smoothPath(trunk, 6);
  for (let i = 0; i < 7; i++) { const p = tq[Math.floor(r.range(0.06, 0.8) * (tq.length - 1))]; dab(p[0] + r.range(-8, 8) * s, p[1], r.range(12, 22) * s, Math.PI / 2 + r.range(-0.5, 0.5), r.range(4.5, 7) * s, 0.72); }
  const limbs = [
    [T(6, -200), T(-48, -228), T(-116, -236), T(-184, -214), T(-226, -176)],
    [T(6, -200), T(22, -238), T(66, -254), T(118, -242)],
    [T(6, -200), T(64, -220), T(134, -216), T(198, -186)],
  ];
  const sway = -34 * s;
  limbs.forEach((l, li) => {
    line(l, (li === 1 ? 9 : 11.5) * s, 0.92, { taper: [0.02, 0.45], wobble: 0.5 });
    const q = L.smoothPath(l, 8);
    let next = q[0][0] + (li === 1 ? 30 : 18) * s * (li === 0 ? -1 : 1);
    for (let i = 3; i < q.length; i++) {
      const [x0, y0] = q[i];
      if (li === 0 ? x0 > next : x0 < next) continue;
      next = x0 + r.range(38, 54) * s * (li === 0 ? -1 : 1);
      const len = r.range(150, 235) * s, bow = r.range(-10, 10) * s, pale = r.chance(0.28);
      const pts = [[x0, y0], [x0 + bow * 0.5 + sway * 0.08, y0 + len * 0.3], [x0 + bow + sway * 0.4, y0 + len * 0.66], [x0 + bow * 0.6 + sway, y0 + len]];
      line(pts, (pale ? 5 : 4.2) * s, pale ? 0.34 : 0.82, { taper: [0.02, 0.4], wobble: 0.3 });
      const sp = L.smoothPath(pts, 23 * s);
      for (let j = 1; j < sp.length; j++) {
        const side = j % 2 ? 1 : -1;
        dab(sp[j][0], sp[j][1], r.range(19, 30) * s, Math.PI / 2 + side * r.range(0.35, 0.7) - 0.12, r.range(5.5, 8.5) * s, pale ? r.range(0.2, 0.32) : r.range(0.5, 0.86));
      }
    }
  });
}

/** a few rows of rippling strokes */
function waves(P, x0, x1, y0, y1) {
  const { line, r } = P;
  let y = y0, row = 0;
  while (y < y1) {
    let x = x0 + r.range(-80, 60);
    const amp = 5.5 + row * 0.8, lam = 62 + row * 5;
    while (x < x1) {
      const len = r.range(190, 420), ph = r.range(0, TAU), pts = [];
      for (let t = 0; t <= len; t += 18) pts.push([x + t, y + amp * Math.sin((t / lam) * Math.PI + ph) + r.range(-1.2, 1.2)]);
      line(pts, 5.4 + row * 0.5, r.range(0.34, 0.6), { taper: [0.15, 0.3] });
      x += len + r.range(50, 170);
    }
    y += 27 + row * 3.5; row++;
  }
}

// ───────────────────────── the painting ─────────────────────────
function paintScene(g, a) {
  const P = painter(g);
  const { knock } = P;
  const lim = (pts, m = KEEP) => pts.map(([x, y]) => [x, Math.max(y, a.yAt(x, -m))]);

  // 1 ── one far hill, right, and the water at its foot
  hill(P, lim([[1290, 1060], [1372, 992], [1452, 928], [1526, 878], [1600, 852], [1668, 876], [1724, 868], [1790, 884], [1870, 922], [1960, 956], [2070, 1000]], KEEP + 8), 1120, 0.2);
  waves(P, 1660, 2060, 1046, 1150);

  // 2 ── the willow, left
  willow(P, 296, 1152, a, 1.3);

  // 3 ── the pavilion (重檐楼阁), pushed close: upper roof, a band of lattice windows, the balcony rail, lower roof
  const cx = 985;
  roof(P, cx, 738, 150, 832, 286, 86, 52, { tone: 0.42, ridge: true, k: K, asym: 0.05 });
  storey(P, cx, 853, 921, [-236, -142, -48, 48, 142, 236], { sill: 0.86, sp: 17, k: K });
  knock(rect(cx - 302, 915, cx + 302, 951));
  railing(P, cx - 292, cx + 292, 921, 947, { n: 7, k: K });
  roof(P, cx, 952, 312, 1040, 492, 104, 80, { tone: 0.46, k: K, asym: -0.04 });
  storey(P, cx, 1061, 1200, [-456, -342, -228, -114, 114, 228, 342, 456], { sill: 0.7, sp: 17, k: K });   // the lower storey: only its shaded head is in frame
}

/**
 * The hand is never ruler-straight: push the whole drawing around by a slow noise field plus a finer tremor.
 * The displacement is evaluated on a coarse grid and interpolated; returns the warped density, one byte per pixel.
 */
function handWarp(src) {
  const w = LW, h = LH, G = 8, gw = Math.ceil(w / G) + 2, gh = Math.ceil(h / G) + 2;
  const nz = L.makeNoise('s26hand');
  const fx = new Float32Array(gw * gh), fy = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * G, y = j * G;
    fx[j * gw + i] = 8.5 * nz.fbm(x / 190, y / 190, 2) + 1.8 * nz.fbm(x / 80 + 40.3, y / 80, 2);
    fy[j * gw + i] = 8.5 * nz.fbm(x / 190 + 91.7, y / 190 - 33.1, 2) + 1.8 * nz.fbm(x / 80 - 17.9, y / 80 + 80.2, 2);
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = S.yt; y < h; y++) {
    const gy = y / G, j0 = gy | 0, ty = gy - j0, r0 = j0 * gw, r1 = r0 + gw;
    for (let x = 0; x < w; x++) {
      const gx = x / G, i0 = gx | 0, tx = gx - i0, p = r0 + i0, q = r1 + i0;
      const sx = x + (fx[p] * (1 - tx) + fx[p + 1] * tx) * (1 - ty) + (fx[q] * (1 - tx) + fx[q + 1] * tx) * ty;
      const sy = y + (fy[p] * (1 - tx) + fy[p + 1] * tx) * (1 - ty) + (fy[q] * (1 - tx) + fy[q + 1] * tx) * ty;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) continue;
      const k0 = (iy * w + ix) * 4 + 3, k1 = k0 + w * 4;
      const a0 = src[k0], a1 = src[k0 + 4], a2 = src[k1], a3 = src[k1 + 4];
      if ((a0 | a1 | a2 | a3) === 0) continue;
      const ux = sx - ix, uy = sy - iy;
      out[y * w + x] = (a0 * (1 - ux) + a1 * ux) * (1 - uy) + (a2 * (1 - ux) + a3 * ux) * uy;
    }
  }
  return out;
}

/** "fire" the density map: density → five-tone cobalt, with tide lines, bristle streaks, granulation and iron-rust clumps */
function develop(al, prot) {
  const w = LW, h = LH, hw = w >> 1, hh = h >> 1;
  // blurred copy of the density at half size (for edge pooling: a mark is darker where it stands above its surroundings)
  const dc = L.makeCanvas(w, h), dimg = new ImageData(w, h), dd = dimg.data;
  const yt = S.yt;
  for (let i = yt * w, n = w * h; i < n; i++) dd[i * 4 + 3] = al[i];
  dc.getContext('2d').putImageData(dimg, 0, 0);
  const bc = L.makeCanvas(hw, hh), bg = bc.getContext('2d');
  bg.filter = 'blur(3.4px)'; bg.drawImage(dc, 0, 0, hw, hh);
  const bl = read(bc);
  // modulation fields, generated small and looked up per pixel
  const field = (q, opts) => { const fw = Math.ceil(w * q), fh = Math.ceil((h - yt) * q) + 1; return { q, fw, d: read(L.noiseTex(fw, fh, { ...opts, scale: opts.scale * q, res: 1 })) }; };
  const low = field(0.2, { seed: 's26low', scale: 190, octaves: 3, warp: 0.6, contrast: 1.7 });            // uneven load of a wash
  const str = field(0.5, { seed: 's26str', scale: 26, sx: 8, sy: 0.5, octaves: 3, contrast: 1.6 });        // bristle streaks
  const mid = field(0.25, { seed: 's26rust', scale: 26, octaves: 3, contrast: 2.3 });                      // where the rust breaks out
  const grn = field(0.5, { seed: 's26gran', scale: 5, octaves: 2, contrast: 2.0 });                        // cobalt settling into grains
  const ramp = L.makeRamp([
    [0, [150, 184, 240, 0]], [0.035 / 1.5, [150, 184, 240, 0.1]], [0.12 / 1.5, [138, 172, 238, 0.52]], [0.22 / 1.5, [118, 156, 232, 0.82]],
    [0.36 / 1.5, [70, 112, 214, 0.93]], [0.52 / 1.5, [34, 72, 190, 0.98]], [0.72 / 1.5, [24, 52, 168, 1]], [0.92 / 1.5, [18, 38, 128, 1]],
    [1.1 / 1.5, [15, 31, 92, 1]], [1.3 / 1.5, [12, 22, 62, 1]], [1, [10, 15, 42, 1]]]);
  const lut = new Uint8ClampedArray(1024 * 4);
  for (let i = 0; i < 1024; i++) { const c = ramp(i / 1023); lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = c[3] * 255; }
  const out = new ImageData(w, h), o = out.data;
  const R = L.rng('s26grain');
  for (let y = yt; y < h; y++) {
    const yy = y - yt;
    const rb = Math.min(hh - 1, y >> 1) * hw, rl = ((yy * low.q) | 0) * low.fw, rs = ((yy * str.q) | 0) * str.fw, rm = ((yy * mid.q) | 0) * mid.fw, rg = ((yy * grn.q) | 0) * grn.fw;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, D = al[i] / 255;
      if (D < 0.004) continue;
      let e = D - bl[(rb + Math.min(hw - 1, x >> 1)) * 4 + 3] / 255; e = e < 0 ? 0 : e > 0.3 ? 0.3 : e;
      const lo = low.d[(rl + ((x * low.q) | 0)) * 4] / 255 - 0.5, st = str.d[(rs + ((x * str.q) | 0)) * 4] / 255 - 0.5;
      const gr = grn.d[(rg + ((x * grn.q) | 0)) * 4] / 255 - 0.5;
      const v = (D + 0.9 * e) * (1 + 0.62 * lo) * (1 + 0.4 * st) * (1 + 1.5 * D * (1 - D) * gr) * (1 + 0.14 * (R() - 0.5));
      const li = (v >= 1.5 ? 1023 : (v / 1.5 * 1023) | 0) * 4;
      let cr = lut[li], cg = lut[li + 1], cb = lut[li + 2];
      if (v > 1.12 && !prot[i]) {
        // heaped cobalt: a few blue-black clumps with a rust-brown rim, and a dull metallic fleck here and there
        const m = mid.d[(rm + ((x * mid.q) | 0)) * 4] / 255, q = sm(0.86, 0.95, m) * sm(1.12, 1.34, v) * 0.9;
        if (q > 0) {
          const rim = q > 0.12 && q < 0.5 ? 0.45 : 0;
          cr += (34 + 70 * rim - cr) * q; cg += (20 + 50 * rim - cg) * q; cb += (18 + 22 * rim - cb) * q;
          if (m > 0.975 && v > 1.2) { cr += 22; cg += 20; cb += 22; }
        }
      }
      const k = i * 4;
      o[k] = cr; o[k + 1] = cg; o[k + 2] = cb; o[k + 3] = lut[li + 3];
    }
  }
  const ink = L.makeCanvas(w, h);
  ink.getContext('2d').putImageData(out, 0, 0);
  return ink;
}

/** shallow depth of field: sharp around the crest, falling out of focus toward the flanks and the near edge (bottom) */
function focusPull(plate, a) {
  const g = plate.getContext('2d');     // keeps its PAD translation
  const y0 = S.yt - 50, hh = LH - y0;   // the bare glaze above has nothing to blur
  const mixIn = (px, r0, r1) => {
    // blurred at half size (it is soft anyway), masked by an ellipse of sharpness centred under the crest
    const t = L.makeCanvas(LW >> 1, hh >> 1), tg = t.getContext('2d');
    tg.imageSmoothingQuality = 'high';
    tg.filter = `blur(${px / 2}px)`; tg.drawImage(plate, 0, y0, LW, hh, 0, 0, t.width, t.height); tg.filter = 'none';
    tg.globalCompositeOperation = 'destination-in';
    tg.scale(0.5, 0.5); tg.translate(PAD + a.cx, PAD + a.crestY + 110 - y0); tg.scale(1, 0.62);
    tg.fillStyle = L.radial(tg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    tg.fillRect(-3000, -3000, 6000, 6000);
    g.save(); g.imageSmoothingQuality = 'high'; g.drawImage(t, -PAD, y0 - PAD, LW, hh); g.restore();
  };
  mixIn(2.6, 430, 800);
  mixIn(7, 760, 1250);
}

/** reflections on the glaze (drawn with 'screen'): one strip light, stretched along the fold where the well meets the wall */
function sheen(g, a) {
  const warm = (al) => `rgba(255,250,236,${al})`;
  const streak = (dr, t0, t1, w, peak, blur, mid = 0.45) => {
    const p0 = a.pt(t0, dr), p1 = a.pt(t1, dr);
    g.save(); g.filter = `blur(${blur}px)`; g.lineCap = 'round'; g.lineWidth = w;
    g.strokeStyle = L.linear(g, p0.x, 0, p1.x, 0, [[0, warm(0)], [mid, warm(peak)], [1, warm(0)]]);
    a.stroke(g, dr, t0, t1); g.restore();
  };
  // on the bare glaze just above the lines: a thin bright thread
  streak(11, 0.02, 0.33, 3.2, 1, 1.5, 0.5);
  // on the cobalt itself: the same light, wider and softer, broken once by a glazing bar; it stays inside the band, off the arc edge
  streak(-26, 0.06, 0.3, 40, 0.15, 12, 0.5);
  streak(-24, 0.09, 0.178, 6.5, 1, 0.9, 0.6);
  streak(-24, 0.186, 0.25, 6.5, 0.9, 0.9, 0.3);
}

function buildPlate(env) {
  const a = env.arc;
  const t0 = performance.now(); let tl = t0; const tick = (n) => { const t = performance.now(); console.warn(`s26 ${n}: ${(t - tl).toFixed(0)} ms`); tl = t; };
  const scene = L.makeLayer(PAD, (g) => paintScene(g, a));
  tick('paint');
  const al = handWarp(read(scene)), prot = new Uint8Array(LW * LH);
  tick('warp');
  addBands(al, prot, a);
  tick('bands');
  const ink = develop(al, prot);
  tick('develop');
  // cobalt bleeds a little into the glaze around every mark: a soft halo, made at half size
  const halo = L.makeCanvas(LW >> 1, LH >> 1), hg = halo.getContext('2d');
  hg.filter = 'blur(3.4px)'; hg.drawImage(ink, 0, 0, LW >> 1, LH >> 1);
  const plate = buildGlaze(env), g = plate.getContext('2d');     // (the layer's context keeps its PAD translation)
  g.save(); g.globalAlpha = 0.42; g.imageSmoothingQuality = 'high'; g.drawImage(halo, -PAD, -PAD, LW, LH); g.restore();
  // the mark itself, a touch soft because it lies UNDER the glaze: two half-pixel-shifted passes ≈ a 1 px tent blur
  g.drawImage(ink, -PAD - 0.5, -PAD - 0.5);
  g.save(); g.globalAlpha = 0.5; g.drawImage(ink, -PAD + 0.5, -PAD + 0.5); g.restore();
  // bubbles in the glaze: pale pin-points, visible only over the blue
  g.save(); g.globalCompositeOperation = 'screen';
  L.speckle(g, { seed: 's26bub', count: 2000, x: -PAD, y: a.crestY - 6, w: LW, h: H + PAD - a.crestY + 6, rMin: 0.6, rMax: 2.1, colors: ['#cfdcf0', '#e6eef8'], alpha: [0.08, 0.42] });
  g.restore();
  // pinholes (kept small; none of the larger ones inside the text zone)
  const calm = (x, y) => !(x > 600 && x < 1320 && y > a.crestY - 290 && y < a.crestY);
  L.speckle(g, { seed: 's26pin', count: 150, x: -PAD, y: -PAD, w: LW, h: LH, rMin: 0.5, rMax: 1.6, colors: ['#8fb0c2', '#7397ad', '#a9c4d2'], alpha: [0.15, 0.45], test: calm });
  tick('glaze');
  focusPull(plate, a);
  tick('focus');
  g.save(); g.globalCompositeOperation = 'screen'; sheen(g, a); g.restore();
  tick('sheen');
  return plate;
}

export default {
  name: '青花',
  tone: 'dark',
  init(env) {
    S = { yt: Math.max(0, Math.floor(PAD + env.arc.crestY - 28)) };
    S.plate = buildPlate(env);
  },
  draw(ctx, env, p) {
    // six frames: the dish slides a hair along the arc while the camera creeps in
    L.blit(ctx, env, S.plate, { rot: L.lerp(-0.003, 0.003, p), zoom: L.lerp(1.0, 1.012, p) });
  },
};
