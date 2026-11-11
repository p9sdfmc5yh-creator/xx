// s09 — 青绿山水 (macro). A close-up photograph of an old blue-and-green landscape on silk (绢本设色), lens almost
// touching the picture: the shared arc is the painted ridge of one huge rounded mountain, azurite (石青) laid thick over
// its summit, malachite (石绿) below; two more mountain heads rise in front of it. Outlines and the long hemp-fibre
// strokes (披麻皴) are re-drawn in gold (泥金勾线) and drape over the forms like the veins of a leaf.
// Above the ridge: nothing but clean, pale silk, its warp and weft visible.
//
// Recipe: three forms described in arc space (s = px along the arc, d = px below it). A half-res per-pixel pass paints
// the washes (deep cap → body → pale foot, the way the genre models a rock); line work goes on top at full res.
// The paint film is then treated as a physical thing: granular, cracked, chipped along a mounting crease, embossed by
// a raking light from the upper left, with the weave reading through. A baked depth-of-field keeps the crest sharp and
// lets the corners go soft. draw() is one blit plus a glint travelling over the gold.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 120;                      // the move is a push-in with a tiny rotation → a small margin is plenty
const LW = W + PAD * 2, LH = H + PAD * 2;
const RES = 0.5;                      // resolution of the per-pixel wash pass
const UMAX = 3.2, WN = 768, WK = (WN - 1) / (2 * UMAX);
const DMAX = 700, SMAX = 1440;        // extent of the layer in arc space
const GOLD = '#d9a836';               // 泥金
const CREASE_X = 1168;                // a mounting crease where the paint has come away (frame x at the crest)
let S = null;

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** release a temporary canvas' backing store straight away (many shots are rendered side by side) */
const free = (...cs) => { for (const c of cs) if (c) { c.width = 1; c.height = 1; } };

// ───────────────────────── mountain geometry (arc space) ─────────────────────────
function wobAt(lb, u) {
  const k = (L.clamp(u, -UMAX, UMAX - 1e-4) + UMAX) * WK, i = k | 0;
  return lb.wob[i] + (lb.wob[i + 1] - lb.wob[i]) * (k - i);
}
const lobeG = (lb, u) => { const au = u < 0 ? -u : u; return (u < 0 ? lb.wAl : lb.wAr) * (lb.p15 ? au * Math.sqrt(au) : au * au); };
/** (u, e) on a form → (s, d). u = across the form in units of its width, e = px below its contour */
function ueToSD(lb, u, e) {
  if (lb.main) return [u * lb.w, e];
  const dd = lobeG(lb, u) + wobAt(lb, u) + e;
  return [lb.s0 + lb.lean * dd + u * lb.w, lb.d0 + dd];
}
/** px that (s, d) lies below the form's contour (> 0 = inside it) */
function lobeE(lb, s, d) {
  if (lb.main) return d;
  const dd = d - lb.d0; if (dd < -40) return -1e6;
  const u = (s - lb.s0 - lb.lean * dd) * lb.iw;
  if (u <= -UMAX || u >= UMAX) return -1e6;
  return dd - lobeG(lb, u) - wobAt(lb, u);
}
function covered(forms, i, s, d) {
  for (let j = forms.length - 1; j > i; j--) if (lobeE(forms[j], s, d) > -1) return true;
  return false;
}
function sdToXY(a, s, d) { const th = s / a.R, r = a.R - d; return [a.cx + r * Math.sin(th), a.cy - r * Math.cos(th)]; }

/** back → front: the great mountain whose contour IS the arc, then two heads standing in front of it */
function makeForms() {
  const nz = L.makeNoise('s09wob');
  const mk = (o) => {
    const lb = Object.assign({ main: false, lean: 0, skew: 0, A: 0.85, p15: false, blue: 0, seed: 1, side: 1, footLen: 120 }, o);
    lb.iw = 1 / lb.w; lb.wAl = lb.w * lb.A * (1 + lb.skew); lb.wAr = lb.w * lb.A * (1 - lb.skew);
    if (lb.capLen === undefined) lb.capLen = lb.w * 0.3;
    if (lb.len === undefined) lb.len = lb.w * 0.95;
    lb.wob = new Float32Array(WN);
    for (let k = 0; k < WN; k++) {
      const sp = ((k / (WN - 1)) * 2 * UMAX - UMAX) * lb.w;      // a hand-drawn contour: slow swell + a little tremor
      lb.wob[k] = 10 * nz.n2(sp / 230 + lb.seed, 1.7) + 3.5 * nz.n2(sp / 64 + lb.seed, 8.3);
    }
    return lb;
  };
  const M = { main: true, name: 'M', s0: 0, d0: 0, w: 1500, iw: 1 / 1500, lean: 0, wAl: 0, wAr: 0, blue: 1, capLen: 150, len: 600, footLen: 150, side: 1, seed: 3.1 };
  // broad, gentle domes that overlap in a cascade (ridge → B on the right → A in front): their contours echo the arc
  const B = mk({ name: 'B', s0: 560, d0: 190, w: 600, lean: 0.08, skew: -0.1, A: 0.7, blue: 1, seed: 41.7, capLen: 140, footLen: 110 });
  const A = mk({ name: 'A', s0: -240, d0: 310, w: 760, lean: -0.05, skew: 0.08, A: 0.6, blue: 0, seed: 12.3, capLen: 150, footLen: 110 });
  B.veins = [-0.42, 0.04, 0.46]; A.veins = [-0.5, -0.14, 0.2, 0.52];
  return [M, B, A];
}

/** turn a list of (u,e) on form i into visible screen polylines [[x,y,u,s]...] (splits where a nearer form covers it) */
function visRuns(a, forms, i, ue) {
  const lb = forms[i], runs = []; let cur = null;
  for (let k = 0; k < ue.length; k++) {
    const [s, d] = ueToSD(lb, ue[k][0], ue[k][1]);
    if (d > 1 && d < DMAX && s > -SMAX && s < SMAX && !covered(forms, i, s, d)) {
      if (!cur) { cur = []; runs.push(cur); }
      const p = sdToXY(a, s, d); p.push(ue[k][0], s); cur.push(p);
    } else cur = null;
  }
  return runs.filter((q) => q.length > 1);
}
function poly(g, pts, color, width, alpha) {
  if (pts.length < 2) return;
  g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = width;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

// ───────────────────────── the washes (per-pixel, half res) ─────────────────────────
/** → { wash: colour of the paint, thick: how thick the paint film is (white = heavy impasto of the caps) } */
function shadeMountain(a, forms) {
  const cw = Math.round(LW * RES), ch = Math.round(LH * RES);
  const img = new ImageData(cw, ch), D = img.data;
  const timg = new ImageData(cw, ch), TD = timg.data;
  const nz = L.makeNoise('s09pig');
  const n = forms.length, R = a.R, inv = 1 / RES;
  // mineral colours: deep / mid / bright
  const GD = [8, 92, 60], GM = [26, 150, 98], GH = [92, 198, 134];        // 石绿
  const BD = [16, 42, 108], BM = [30, 86, 170], BL = [84, 138, 204];       // 石青
  const FOOT = [150, 212, 160], THIN = [168, 210, 158];                    // 三绿: the thin passages stay green, never khaki
  let cr = 0, cg = 0, cb = 0, ca = 0, ct = 0;
  const shade = (lb, e, u, m, s, bl, fine, th, mot) => {
    const st = 0.7 * nz.n2((u * lb.w) / 88 + lb.seed, e / 300 + lb.seed * 0.31) + 0.3 * nz.n2((u * lb.w) / 30 + lb.seed, e / 170 - lb.seed);   // brush streaks running down the slope
    const ee = Math.max(0, e * (1 + 0.3 * st) + bl * 36);
    const capLen = lb.capLen * (0.9 + 0.5 * nz.fbm(s / 420 + lb.seed, 5.5, 2));
    const capT = 1 - sm(ee / capLen);
    const bodyT = sm(ee / lb.len);
    const foot = m < lb.footLen * 1.5 ? (1 - sm((m * (1 + 0.5 * st)) / (lb.footLen * (0.75 + 0.9 * bl)))) * (0.72 + 0.5 * mot) : 0;
    const fl = sm((u * lb.side + 0.15) / 0.85);                                  // 0 = lit flank, 1 = shaded flank
    let r_, g_, b_;
    if (bodyT < 0.5) { const t = bodyT / 0.5; r_ = GD[0] + (GM[0] - GD[0]) * t; g_ = GD[1] + (GM[1] - GD[1]) * t; b_ = GD[2] + (GM[2] - GD[2]) * t; }
    else { const t = (bodyT - 0.5) / 0.5 * 0.7; r_ = GM[0] + (GH[0] - GM[0]) * t; g_ = GM[1] + (GH[1] - GM[1]) * t; b_ = GM[2] + (GH[2] - GM[2]) * t; }
    const lit = (1 - fl) * 0.3 * (1 - capT * 0.6);
    r_ += (GH[0] - r_) * lit; g_ += (GH[1] - g_) * lit; b_ += (GH[2] - b_) * lit;
    const shd = fl * 0.3 * (1 - capT * 0.5);                                     // the shaded flank goes deeper, not teal
    r_ += (GD[0] - r_) * shd; g_ += (GD[1] - g_) * shd; b_ += (GD[2] - b_) * shd;
    // azurite over the cap. It is a coarse pigment scumbled over the green: where it thins out it breaks up into
    // granules instead of blending into a smooth teal
    let bA = lb.blue * (capT * 1.2 + 0.26 * fl * (1 - bodyT * 0.7) * (0.4 + 0.6 * capT));
    if (bA > 0) {
      if (bA > 1) bA = 1;
      const tt = bA + (0.42 * fine + 0.16 * st) * (1 - Math.abs(2 * bA - 1));
      bA = sm((tt - 0.5) * 1.8 + 0.5);
      const t = sm(ee / (capLen * 1.25)), q = t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4, x0 = t < 0.6 ? BD : BM, x1 = t < 0.6 ? BM : BL;
      r_ += (x0[0] + (x1[0] - x0[0]) * q - r_) * bA; g_ += (x0[1] + (x1[1] - x0[1]) * q - g_) * bA; b_ += (x0[2] + (x1[2] - x0[2]) * q - b_) * bA;
    }
    // the foot of every form thins to a pale wash so the next dark cap reads against it
    let al = 1;
    if (foot > 0) { const f = Math.min(0.5, foot * 0.42); r_ += (FOOT[0] - r_) * f; g_ += (FOOT[1] - g_) * f; b_ += (FOOT[2] - b_) * f; al -= f * 0.3; }
    // thick and thin passages of the wash
    if (bl > 0.18) { const f = (bl - 0.18) * 0.4; r_ += (THIN[0] - r_) * f; g_ += (THIN[1] - g_) * f; b_ += (THIN[2] - b_) * f; }
    const rim = e < 16 ? 0.8 + 0.2 * (e / 16) : 1;                               // pigment pools under each contour
    const gr = rim * (1 + 0.05 * fine - 0.1 * Math.min(0, bl)) * (1 + 0.09 * mot);
    if (th > 0.2) al *= 1 - (th - 0.2) * 0.5;
    cr = r_ * gr; cg = g_ * gr; cb = b_ * gr; ca = al;
    ct = (0.34 + 0.66 * capT * (lb.blue ? 1 : 0.7)) * al;
  };
  for (let y = 0; y < ch; y++) {
    const fy = (y + 0.5) * inv - PAD, ddy = a.cy - fy;
    for (let x = 0; x < cw; x++) {
      const fx = (x + 0.5) * inv - PAD, ddx = fx - a.cx;
      const d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < -8) continue;
      const s = Math.atan2(ddx, ddy) * R;
      const bl = nz.fbm(fx / 210 + 3.3, fy / 210 - 1.7, 3);                       // pooling of the wash
      const fine = nz.n2(fx / 5.5, fy / 5.5);                                      // clumps of pigment granules
      const th = nz.fbm(fx / 460 + 20, fy / 460 + 9, 2);
      const mot = nz.fbm(fx / 64 - 7, fy / 64 + 31, 2);                           // blotchy density of a mineral wash
      let m = 1e9;
      for (let j = n - 1; j >= 0; j--) {
        const lb = forms[j];
        let e, u;
        if (j === 0) { e = d < 0 ? 0 : d; u = s / 1500; }
        else {
          const dd = d - lb.d0;
          if (dd < -160) continue;
          u = (s - lb.s0 - lb.lean * dd) * lb.iw;
          if (u <= -UMAX || u >= UMAX) continue;
          const au = u < 0 ? -u : u, k = (u + UMAX) * WK, ki = k | 0;
          e = dd - (u < 0 ? lb.wAl : lb.wAr) * (lb.p15 ? au * Math.sqrt(au) : au * au) - (lb.wob[ki] + (lb.wob[ki + 1] - lb.wob[ki]) * (k - ki));
          if (e <= 0) { if (-e < m) m = -e; continue; }
        }
        shade(lb, e, u, m, s, bl, fine, th, mot);
        break;
      }
      const k4 = (y * cw + x) * 4;
      D[k4] = cr; D[k4 + 1] = cg; D[k4 + 2] = cb; D[k4 + 3] = ca * 255;
      TD[k4] = TD[k4 + 1] = TD[k4 + 2] = 255; TD[k4 + 3] = ct * 255;
    }
  }
  const wash = L.makeCanvas(cw, ch); wash.getContext('2d').putImageData(img, 0, 0);
  const thick = L.makeCanvas(cw, ch); thick.getContext('2d').putImageData(timg, 0, 0);
  return { wash, thick };
}

// ───────────────────────── line work ─────────────────────────
function uReach(lb) { const q = (DMAX - lb.d0) / Math.min(lb.wAl, lb.wAr); return Math.min(UMAX - 0.05, lb.p15 ? Math.pow(q, 2 / 3) : Math.sqrt(q)); }

/** a brush line that starts firm and trails off thin (variable width, a little tremor) */
function brush(g, run, color, width, alpha, seed, taper = [0.05, 0.62]) {
  if (run.length < 3) return;
  const step = Math.max(1, Math.floor(run.length / 16));
  const pts = run.filter((_, k) => k % step === 0 || k === run.length - 1);
  L.inkStroke(g, pts, { width, color, seed, taper, wobble: 0.42, alpha, smoothStep: 4 });
}

/** 皴: long hemp-fibre strokes draped over each form, fanning down and outward like the veins of a leaf.
 *  under-drawing (deep tone of the pigment) → g, the gold re-drawing → gg. Returns the main veins (the folds of the rock). */
function drawCun(g, gg, a, forms) {
  const r = L.rng('s09cun-p');
  const folds = [];
  let sd = 0;
  const goldVein = (run, w, kind) => {
    brush(g, run.map((p) => [p[0] + 2.6, p[1] + 2.4]), '#0c1a16', w * 0.7, 0.36, ++sd);
    brush(gg, run, GOLD, w, 1, ++sd);
    run.kind = kind; folds.push(run);
  };
  // the great mountain: like the lateral veins of a leaf, every line runs with the ridge at first, then peels away from
  // it and falls down the slope to the left — a family of near-parallel arcs, each the shoulder of a fold standing in
  // front of the one before it
  const M = forms[0];
  const vein = (s0, e0, lat, dep, pw, t1 = 1) => {
    const ue = [], ph = r.range(0, 6);
    for (let q = 0; q <= 52; q++) {
      const t = (q / 52) * t1;
      ue.push([(s0 + lat * (1.3 * t - 0.3 * t * t) + 7 * Math.sin(t * 4.2 + ph)) / M.w, e0 + dep * Math.pow(t, pw)]);
    }
    return ue;
  };
  for (const sBase of [-1120, -800, -500, -190, 130, 450, 780, 1100, 1420]) {
    const s0 = sBase + r.range(-55, 55);
    const lat = -r.range(520, 760), dep = r.range(350, 480), pw = r.range(1.7, 2.2);
    // companions first: thinner strokes of the under-drawing running with the vein (披麻皴 comes in bundles)
    const nc = r.int(2, 3);
    for (let c = 0; c < nc; c++) {
      const col = r.chance(0.5) ? '#08261e' : '#0e1c28', ta = r.range(0.5, 0.92);
      const ue = vein(s0 + r.range(40, 250), r.range(22, 60), lat * r.range(0.9, 1.15), dep * r.range(0.9, 1.15), pw * r.range(0.95, 1.1), ta);
      for (const run of visRuns(a, forms, 0, ue)) brush(g, run, col, r.range(2.8, 4.6), r.range(0.24, 0.42), ++sd, [0.12, 0.5]);
    }
    for (const run of visRuns(a, forms, 0, vein(s0, r.range(17, 22), lat, dep, pw))) goldVein(run, r.range(6.6, 8.4), 'M');
  }
  // the two heads: veins fan from each apex, more of them down the long flank
  for (let i = 1; i < forms.length; i++) {
    const lb = forms[i], wE = lb.w;
    const fibre = (u0, e0, T, t1 = 1) => {
      const side = u0 < 0 ? -1 : 1, k = Math.min(1, Math.abs(u0) * 1.6 + 0.1);
      const latU = side * r.range(0.42, 0.6) * k * T, dep = r.range(0.34, 0.5) * T * wE, pw = L.lerp(1.1, r.range(1.5, 1.9), k), ph = r.range(0, 6);
      const ue = [];
      for (let q = 0; q <= 40; q++) {
        const t = (q / 40) * t1;
        ue.push([u0 + latU * (1.3 * t - 0.3 * t * t) + (6 * Math.sin(t * 4 + ph)) / lb.w, e0 + dep * Math.pow(t, pw)]);
      }
      return visRuns(a, forms, i, ue);
    };
    for (const uBase of lb.veins) {
      const u0 = uBase + r.range(-0.05, 0.05), T = r.range(0.75, 1.05);
      const nc = r.int(1, 2);
      for (let c = 0; c < nc; c++) {
        for (const run of fibre(u0 + r.range(-0.12, 0.16), r.range(26, 80), T * r.range(0.8, 1.1), r.range(0.45, 0.9))) brush(g, run, r.chance(0.5) ? '#08261e' : '#0e1c28', r.range(2.8, 4.6), r.range(0.24, 0.42), ++sd, [0.12, 0.5]);
      }
      for (const run of fibre(u0, r.range(19, 25), T)) goldVein(run, r.range(6.2, 7.8), lb.name);
    }
  }
  g.globalAlpha = 1; gg.globalAlpha = 1;
  return folds;
}

/** trace a run displaced sideways by `off` px (positive = to the right of a line running down the picture) */
function sidePath(g, run, off, k1 = 1) {
  const n = Math.max(2, Math.round(run.length * k1));
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const p0 = run[Math.max(0, k - 1)], p1 = run[Math.min(run.length - 1, k + 1)];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    if (dy < 0) { dx = -dx; dy = -dy; }
    const sw = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, (k / (n - 1)) * 1.15));   // swells in the middle of the vein
    const x = run[k][0] + dy * off * sw, y = run[k][1] - dx * off * sw;
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
}

/** the folds of the rock modelled the old way (阴阳向背): light on the side of each vein that faces the upper left, shade on the other.
 *  neutral grey ± for soft-light */
function buildFoldShade(folds) {
  const c = L.makeLayer(PAD, (g) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(-PAD, -PAD, LW, LH);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const run of folds) {
      if (run.length < 4) continue;
      for (const [off, w, col, al] of [[34, 60, 'rgb(16,16,16)', 0.7], [-26, 46, 'rgb(240,240,240)', 0.5]]) {
        g.strokeStyle = col; g.globalAlpha = al; g.lineWidth = w;
        sidePath(g, run, off); g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
  const b = L.blurred(c, 13); free(c);
  return b;
}

/** azurite follows the folds a little way down from the summit: a soft lick of blue under the head of every vein of a blue form */
function buildLicks(folds) {
  const c = L.makeLayer(PAD, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const r = L.rng('s09licks');
    for (const run of folds) {
      if (run.length < 8 || run.kind === 'A') continue;
      const k1 = r.range(0.34, 0.58);
      g.strokeStyle = 'rgb(22,62,146)'; g.globalAlpha = 0.85; g.lineWidth = r.range(40, 58);
      sidePath(g, run, 30, k1); g.stroke();
      g.strokeStyle = 'rgb(16,42,108)'; g.globalAlpha = 0.7; g.lineWidth = 20;
      sidePath(g, run, 14, k1 * 0.8); g.stroke();
    }
  });
  const b = L.blurred(c, 11); free(c);
  return b;
}

/** outlines of the two heads: a breathing ink line with a gold line laid just inside it */
function drawContours(g, gg, ug, a, forms) {
  for (let i = 1; i < forms.length; i++) {
    const lb = forms[i], du = 7 / lb.w, ue = [], ue2 = [];
    for (let u = -UMAX + 0.01; u < UMAX; u += du) { ue.push([u, 0]); ue2.push([u, 12 + 2 * Math.sin(u * 19 + i)]); }
    for (const run of visRuns(a, forms, i, ue)) {
      if (run.length < 4) continue;
      const pts = run.filter((_, k) => k % 3 === 0 || k === run.length - 1);
      const o = { width: 5.0, color: '#141c1c', seed: i * 13 + run.length, taper: [0.05, 0.08], wobble: 0.6, alpha: 0.74, smoothStep: 4 };
      L.inkStroke(g, pts, o); L.inkStroke(ug, pts, o);
    }
    for (const run of visRuns(a, forms, i, ue2)) {
      if (run.length < 4) continue;
      L.inkStroke(gg, run.filter((_, k) => k % 3 === 0 || k === run.length - 1), { width: 7.2, color: GOLD, seed: 77 + i, taper: [0.04, 0.06], wobble: 0.4, alpha: 1, smoothStep: 4 });
    }
  }
  g.globalAlpha = 1; gg.globalAlpha = 1;
}

// ───────────────────────── silk ─────────────────────────
/** threads of the silk (绢), per pixel: a plain weave whose warps and wefts wander, differ in weight and catch the light.
 *  neutral grey ± so it can be overlaid on anything */
function buildWeave() {
  const c = L.makeCanvas(LW, LH), g = c.getContext('2d');
  const img = new ImageData(LW, LH), d = img.data;
  const r = L.rng('s09weave-m'), nz = L.makeNoise('s09wv');
  const PW = 6.3, PH = 7.6;
  const nW = Math.ceil(LW / PW) + 8, nH = Math.ceil(LH / PH) + 8;
  const tw = new Float32Array(nW), th = new Float32Array(nH);
  for (let i = 0; i < nW; i++) tw[i] = r.gauss() * 0.07 + (r.chance(0.05) ? r.range(-0.2, 0.16) : 0);
  for (let j = 0; j < nH; j++) th[j] = r.gauss() * 0.08 + (r.chance(0.07) ? r.range(-0.24, 0.16) : 0);
  const offX = new Float32Array(LH), offY = new Float32Array(LW);
  for (let y = 0; y < LH; y++) offX[y] = 2.4 * nz.n2(y / 280, 1.3) + 0.8 * nz.n2(y / 55, 4.4);
  for (let x = 0; x < LW; x++) offY[x] = 3.0 * nz.n2(x / 330, 7.1) + 0.9 * nz.n2(x / 64, 2.2);
  const iPW = 1 / PW, iPH = 1 / PH;
  let k = 0;
  for (let y = 0; y < LH; y++) {
    const ox = offX[y];
    for (let x = 0; x < LW; x++) {
      const fxp = (x + ox) * iPW + 3, i = fxp | 0, fx = fxp - i;
      const fyp = (y + offY[x]) * iPH + 3, j = fyp | 0, fy = fyp - j;
      const px = 1 - Math.abs(2 * fx - 1), py = 1 - Math.abs(2 * fy - 1);       // 0 at a thread's edge, 1 on its crown
      let v;
      if (((i + j) & 1) === 0) v = (0.34 + 0.66 * Math.sqrt(px)) * (0.7 + 0.3 * py) + tw[i];        // warp on top
      else v = (0.3 + 0.64 * Math.sqrt(py)) * (0.68 + 0.32 * px) + th[j] - 0.03;                    // weft on top
      if (px < 0.24 && py < 0.24) v -= 0.22;                                      // the pinhole where four threads meet
      const q = 128 + (v - 0.64) * 170;
      d[k] = d[k + 1] = d[k + 2] = q; d[k + 3] = 255; k += 4;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** clean, pale silk: warm rice-white, barely toned */
function buildSilk() {
  return L.makeLayer(PAD, (g) => {
    const X0 = -PAD, Y0 = -PAD;
    g.fillStyle = '#ece1c6'; g.fillRect(X0, Y0, LW, LH);
    // soft copy-stand light from the upper left
    g.fillStyle = L.linear(g, 0, -80, W, H, [[0, 'rgba(252,246,230,0.7)'], [0.5, 'rgba(236,225,198,0)'], [1, 'rgba(204,188,152,0.4)']]);
    g.fillRect(X0, Y0, LW, LH);
    // the faintest uneven toning
    g.globalAlpha = 0.6;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's09tone', scale: 520, octaves: 3, res: 0.12, warp: 0.5, ramp: [[0, 'rgba(190,164,116,0.2)'], [0.5, 'rgba(220,200,160,0)'], [1, 'rgba(255,251,238,0.22)']] }), X0, Y0);
    // wefts from different skeins: long, barely visible horizontal bands
    g.globalAlpha = 0.32;
    g.drawImage(L.noiseTex(LW, LH, { seed: 's09bands', scale: 26, sx: 70, sy: 0.5, octaves: 2, res: 0.25, contrast: 1.5, ramp: [[0, 'rgba(176,150,104,0.2)'], [0.45, 'rgba(210,190,150,0)'], [0.6, 'rgba(255,255,255,0)'], [1, 'rgba(255,252,240,0.2)']] }), X0, Y0);
    g.globalAlpha = 1;
    L.speckle(g, { seed: 's09fox', count: 90, x: X0, y: Y0, w: LW, h: LH, rMin: 0.6, rMax: 2.6, colors: ['#a88a58', '#8c6c3c'], alpha: [0.08, 0.3] });
  });
}

// ───────────────────────── age: cracks, losses ─────────────────────────
function makeCracks() {
  const r = L.rng('s09cracks-m'), nz = L.makeNoise('s09crk');
  const out = [];
  for (let i = 0; i < 14; i++) {
    const y0 = r.range(480, H + PAD), x0 = r.range(-PAD - 300, W), len = r.range(200, 1100), drift = r.range(-0.014, 0.014);
    const pts = [];
    for (let x = x0; x < x0 + len; x += 12) pts.push([x, y0 + (x - x0) * drift + 5 * nz.n2(x / 120, i * 3.1) + 1.6 * nz.n2(x / 22, i * 7.7)]);
    out.push({ pts, w: r.range(0.9, 2.2), a: r.range(0.35, 1) });
  }
  return out;
}
const creaseX = (y) => CREASE_X + (y - 560) * 0.05;

/** where the paint has come away: alpha mask (opaque = lost). Smooth low-res noise fields are upscaled first and
 *  thresholded at full resolution afterwards, so the chips keep crisp, irregular edges. */
function buildFlake(cracks) {
  const nz = L.makeNoise('s09flake-m');
  const c = L.makeCanvas(LW, LH), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, LW, LH);
  g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  // each field goes into one colour channel; 0.5 (→127) is its threshold
  const field = (ch, stepX, stepY, fn) => {
    const fw = Math.ceil(LW / stepX) + 1, fh = Math.ceil(LH / stepY) + 1;
    const img = new ImageData(fw, fh), d = img.data;
    for (let y = 0, k = 0; y < fh; y++) for (let x = 0; x < fw; x++, k += 4) { d[k + ch] = L.clamp(fn(x * stepX, y * stepY)) * 255; d[k + 3] = 255; }
    const t = L.makeCanvas(fw, fh); t.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(t, 0, 0, fw * stepX, fh * stepY);
  };
  // the mounting crease: a band where the paint is broken into chips
  const band = (x, y) => { const q = (x - PAD - creaseX(y - PAD) - 6 * nz.n2(y / 150, 3.3)) / 17; return Math.exp(-q * q) * (0.55 + 0.45 * sm(0.5 + 1.6 * nz.n2(y / 110, 9.1))); };
  field(0, 3, 3, (x, y) => 0.5 + (nz.fbm(x / 30, y / 30, 2) - 0.78 + 0.86 * band(x, y)) * 3.2);                                      // chips
  field(1, 6, 6, (x, y) => 0.5 + (nz.fbm(x / 130 + 0.8 * nz.n2(x / 280, y / 280), y / 130 + 0.8 * nz.n2(x / 280 + 9, y / 280 + 4), 4) - 0.62) * 3.2); // a few larger losses
  field(2, 8, 2, (x, y) => 0.5 + (nz.fbm(x / 150 + 40, y / 11, 2) - 0.74) * 3.2);                                                  // rubbed streaks along the roll
  const id = g.getImageData(0, 0, LW, LH), d = id.data;
  for (let k = 0; k < d.length; k += 4) {
    let v = (d[k] - 120) * 18; const v1 = (d[k + 1] - 120) * 18, v2 = (d[k + 2] - 120) * 12;
    if (v1 > v) v = v1; if (v2 > v) v = v2;
    d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = v < 0 ? 0 : v > 240 ? 240 : v;
  }
  g.putImageData(id, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.translate(PAD, PAD);
  L.speckle(g, { seed: 's09chips', count: 240, x: -PAD, y: 400, w: LW, h: LH - 400, rMin: 0.8, rMax: 3.4, colors: ['#000'], alpha: [0.5, 1], squash: 0.7 });
  // hairline cracks from rolling
  g.lineCap = 'round'; g.strokeStyle = '#000';
  for (const k of cracks) { g.globalAlpha = 0.4 + 0.5 * k.a; g.lineWidth = k.w; g.beginPath(); k.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
  return c;
}

/** coarse mineral granules: mostly neutral, with scattered bright crystal faces and dark pits (for overlay) */
function crystalTex(seed, cell) {
  const cw = Math.ceil(LW / cell), ch = Math.ceil(LH / cell);
  const img = new ImageData(cw, ch), d = img.data, r = L.rng(seed);
  for (let k = 0; k < d.length; k += 4) {
    const q = r();
    let v = 128 + (r() - 0.5) * 70;
    if (q < 0.04) v = 200 + r() * 55; else if (q < 0.1) v = 34 + r() * 52;
    d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  const out = L.makeCanvas(LW, LH), g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, cw * cell, ch * cell);
  return out;
}

// ───────────────────────── pigment layer ─────────────────────────
function buildPaint(env, forms) {
  const a = env.arc;
  const { wash, thick } = shadeMountain(a, forms);
  const gold = L.makeLayer(PAD), gg = gold.getContext('2d');
  const under = L.makeLayer(PAD), ug = under.getContext('2d');      // ink that has soaked into the silk: it survives where the paint flakes
  gg.lineCap = 'round'; gg.lineJoin = 'round';
  const sp = a.span(PAD + 140);
  const ridge = (g) => {     // closed path under the ridge; the edge is hand-drawn (±1 px) but stays on the arc
    const nz = L.makeNoise('s09ridge');
    g.beginPath();
    for (let i = 0; i <= 400; i++) { const th = L.lerp(-sp, sp, i / 400), p = a.pt(th, 1.2 * nz.n2(th * 60, 0.5)); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }
    g.lineTo(W + PAD + 400, H + PAD + 400); g.lineTo(-PAD - 400, H + PAD + 400); g.closePath();
  };
  const ridgeO = { width: 5.4, color: '#1e1a18', seed: 9, taper: [0, 0], wobble: 0.5, alpha: 0.86 };
  const ridgePts = L.arcPts(a, -2.6, -sp, sp, 120);
  const paint = L.makeLayer(PAD, (g) => {
    g.save(); ridge(g); g.clip();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(wash, -PAD, -PAD, LW, LH);
    const ink = L.makeLayer(PAD), ig = ink.getContext('2d'); ig.lineCap = 'round'; ig.lineJoin = 'round';
    const folds = drawCun(ig, gg, a, forms);
    drawContours(ig, gg, ug, a, forms);
    let t = buildLicks(folds);
    g.globalAlpha = 0.9; g.drawImage(t, -PAD, -PAD); free(t);
    // mineral pigment is granular: coarse crystals, heavier where the paint is thick
    const cry = crystalTex('s09cryA', 2);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.34; g.drawImage(cry, -PAD, -PAD);
    const cq = cry.getContext('2d'); cq.globalCompositeOperation = 'destination-in'; cq.imageSmoothingEnabled = true; cq.drawImage(thick, 0, 0, LW, LH);
    g.globalAlpha = 0.5; g.drawImage(cry, -PAD, -PAD);
    const gr = L.grainTex(LW, LH, { seed: 's09gB', amount: 0.6, size: 1 });
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.42; g.drawImage(gr, -PAD, -PAD);
    free(cry, gr);
    t = buildFoldShade(folds);
    g.globalAlpha = 0.9; g.drawImage(t, -PAD, -PAD); free(t);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(ink, -PAD, -PAD);
    free(ink);
    g.restore();
    // the summit outline: gold just inside, ink on the arc
    { const nz = L.makeNoise('s09rg'), pts = []; for (let i = 0; i <= 150; i++) { const th = L.lerp(-sp, sp, i / 150), p = a.pt(th, -13.5 + 1.8 * nz.n2(th * 30, 2.5)); pts.push([p.x, p.y]); }
      L.inkStroke(gg, pts, { width: 7.4, color: GOLD, seed: 5, taper: [0, 0], wobble: 0.42, alpha: 1, smoothStep: 5 }); }
    L.inkStroke(g, ridgePts, ridgeO);
  });
  L.inkStroke(ug, ridgePts, { ...ridgeO, alpha: 0.85 });
  free(wash);
  return { paint, gold, under, thick };
}

/** blend a blurred copy of the layer back in, weighted by an elliptical mask around the crest (0 inside r0 … 1 beyond r1) */
function defocus(all, env, px, r0, r1, sy) {
  const a = env.arc, b = L.blurred(all, px), q = b.getContext('2d');
  q.globalCompositeOperation = 'destination-in';
  q.translate(PAD + a.cx, PAD + a.crestY + 30); q.scale(1, sy);
  q.fillStyle = L.radial(q, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  q.fillRect(-4000, -4000, 8000, 8000);
  const g = all.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(b, 0, 0); g.restore();
  free(b);
}

export default {
  name: '青绿山水·山亭',
  tone: 'dark',
  init(env) {
    const a = env.arc;
    const forms = makeForms();
    const cracks = makeCracks();
    const flake = buildFlake(cracks);
    const weave = buildWeave();
    const { paint, gold, under, thick } = buildPaint(env, forms);
    const all = buildSilk();
    const g = all.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    let t;
    // the bare silk shows its threads
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5; g.drawImage(weave, 0, 0);
    // the wash has crept a little way into the silk around the paint
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.24; g.drawImage(t = L.blurred(paint, 7), 0, 0); free(t);
    // where pigment has flaked a stain of it remains in the silk, and the ink under-drawing
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.34; g.drawImage(paint, 0, 0);
    g.globalAlpha = 0.6; g.drawImage(under, 0, 0); free(under);
    // gold: give the flat strokes the grain of powdered metal, then chip paint and gold alike
    { const q = gold.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-atop'; q.globalAlpha = 0.85;
      q.drawImage(t = L.noiseTex(LW, LH, { seed: 's09goldN', scale: 9, octaves: 2, res: 0.5, contrast: 1.7, ramp: [[0, '#9a6c18'], [0.4, '#d3a030'], [0.72, '#ecc45a'], [1, '#fbe6a0']] }), 0, 0); q.globalAlpha = 1; free(t); }
    { const q = gold.getContext('2d'); q.globalCompositeOperation = 'destination-out';
      q.drawImage(t = L.noiseTex(LW, LH, { seed: 's09wear', scale: 120, octaves: 3, res: 0.2, contrast: 1.5, ramp: [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [0.75, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0.8)']] }), 0, 0); free(t); }
    for (const c of [paint, gold]) { const q = c.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'destination-out'; q.globalAlpha = c === gold ? 0.85 : 1; q.drawImage(flake, 0, 0); q.globalAlpha = 1; }
    free(flake);
    g.globalAlpha = 1; g.drawImage(paint, 0, 0);
    // the gold sits on top of the paint: a thin shadow under its lower-right edge
    const sh = L.makeCanvas(LW, LH), sq = sh.getContext('2d'); sq.drawImage(gold, 0, 0); sq.globalCompositeOperation = 'source-in'; sq.fillStyle = '#0c1410'; sq.fillRect(0, 0, LW, LH);
    g.globalAlpha = 0.3; g.drawImage(sh, 1.4, 1.8);
    g.globalAlpha = 1; g.drawImage(gold, 0, 0);
    // thickness of the paint film: emboss it (pigment = high, caps and gold higher still), lit from the upper left
    const hc = L.makeCanvas(LW, LH), hg = hc.getContext('2d');
    hg.drawImage(paint, 0, 0); hg.globalCompositeOperation = 'source-in'; hg.fillStyle = '#8c8c8c'; hg.fillRect(0, 0, LW, LH);
    hg.globalCompositeOperation = 'source-atop'; hg.globalAlpha = 0.5; hg.imageSmoothingEnabled = true; hg.drawImage(thick, 0, 0, LW, LH);
    hg.globalAlpha = 0.8; hg.drawImage(sh, 0, 0); hg.globalCompositeOperation = 'lighter'; hg.globalAlpha = 1; hg.drawImage(gold, 0, 0);
    free(paint, sh, thick);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.3;
    g.drawImage(t = L.bumpLight(hc, { angle: 45, strength: 2.2, blur: 0, res: 0.5 }), 0, 0); free(t, hc);
    // threads still read through the paint, more faintly
    g.globalAlpha = 0.24; g.drawImage(weave, 0, 0); free(weave);
    // the photographer's lamp stands to the upper left: the picture is a little brighter there and falls off to the lower right
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 1;
    g.fillStyle = L.radial(g, PAD + 620, PAD + 470, 80, 1500, [[0, 'rgba(255,250,236,0.34)'], [0.45, 'rgba(128,128,128,0)'], [1, 'rgba(8,14,20,0.42)']]);
    g.fillRect(0, 0, LW, LH);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // depth of field: the plane of focus runs through the crest; the corners and the bottom go soft
    defocus(all, env, 2.4, 520, 1050, 0.62);
    defocus(all, env, 7, 820, 1500, 0.62);
    // bright copy of the gold for the travelling glint
    const gq = gold.getContext('2d'); gq.globalCompositeOperation = 'source-in'; gq.fillStyle = '#ffe07a'; gq.fillRect(0, 0, LW, LH);
    gq.globalCompositeOperation = 'source-atop'; gq.translate(PAD, PAD);
    L.speckle(gq, { seed: 's09spark', count: 5200, x: -PAD, y: a.crestY - 30, w: LW, h: H + PAD - a.crestY + 30, rMin: 0.9, rMax: 2.2, colors: ['#fffbe6'], alpha: [0.7, 1] });
    gq.setTransform(1, 0, 0, 1, 0, 0); gq.globalCompositeOperation = 'source-over';
    const scratch = L.makeCanvas(W, H), sg = scratch.getContext('2d');
    sg.drawImage(all, 0, 0); sg.drawImage(gold, 0, 0); sg.clearRect(0, 0, W, H);   // touch the big layers once so the first frame is not slower than the rest
    S = { all, goldHi: gold, scratch, sg };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // push-in centred on the authored scale: a zoom about the crest changes the arc's radius a little, so straddling 1.0
    // keeps the ridge within ±5 px of env.arc at the frame edges from the first frame to the last (exact mid-shot)
    const zoom = L.lerp(0.982, 1.022, p), rot = L.lerp(-0.004, 0.004, p);
    L.blit(ctx, env, S.all, { rot, zoom });
    // raking light catching the gold lines as the camera drifts
    const sg = S.sg, GR = 460;
    const gx = L.lerp(560, 1300, p), gy = a.crestY + 170;
    const bx = Math.max(0, Math.floor(gx - GR)), by = Math.max(0, Math.floor(gy - GR)), bw = Math.min(W, Math.ceil(gx + GR)) - bx, bh = Math.min(H, Math.ceil(gy + GR)) - by;
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1; sg.clearRect(bx, by, bw, bh);
    sg.save(); sg.beginPath(); sg.rect(bx, by, bw, bh); sg.clip();
    L.blit(sg, env, S.goldHi, { rot, zoom });
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.radial(sg, gx, gy, 0, GR, [[0, 'rgba(0,0,0,1)'], [0.4, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    sg.fillRect(bx, by, bw, bh);
    sg.restore();
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.85; ctx.drawImage(S.scratch, bx, by, bw, bh, bx, by, bw, bh); ctx.restore();
    // a soft sheen sliding across the silk and the paint
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    const sx = L.lerp(460, 1460, p);
    ctx.fillStyle = L.linear(ctx, sx - 520, 0, sx + 520, 300, [[0, 'rgba(255,250,235,0)'], [0.5, 'rgba(255,250,235,0.14)'], [1, 'rgba(255,250,235,0)']]);
    ctx.fillRect(0, 0, W, H); ctx.restore();
  },
};
