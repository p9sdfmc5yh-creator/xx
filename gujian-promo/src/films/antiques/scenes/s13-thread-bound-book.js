// s13 — 线装书. Flat-lay macro of an old thread-bound book lying on a sheet of cream paper:
// the arc is the spine-side edge of its 磁青 (deep indigo) paper cover. Just inside the edge runs the stitching —
// doubled white silk thread from eye to eye, with a turn round the spine at every eye — one thread end has worked
// loose and curls up off the cover, and a short length of vermilion silk is knotted onto the stitching and trails
// over the edge onto the paper. At the right the corner is wrapped in silk (包角).
//
// The cover is shaded per pixel in init(): every pixel under the arc gets arc coordinates (U along the spine,
// V in from the edge), so the cloth-like impression, the hinge crease, the rubbed edge and the bite of the threads
// all follow the book. One composite layer is blitted per frame; only the loose thread end is drawn live.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 120;
let S = null;

const HOLE_V = 112;                    // the stitching eyes sit this far in from the spine edge (px)
const HINGE_V = HOLE_V + 80;           // where the cover creases every time the book is opened
const TH = [-0.212, 0.0235, 0.259];    // the three eyes in frame (the fourth lies beyond the left edge)
const TH_K = -0.1046;                  // where the red thread is knotted onto the stitching
const TH_BJ = 0.2046, BJ_V = 152;      // silk corner wrap (包角): from this angle on, this deep
const SW = 8, RWID = 6.6;              // strand widths: white (doubled), red (single)
const LX = 0.883, LY = -0.469;         // direction the light travels (it comes from the lower left)

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash2(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

const WHITE = { body: '#efe8d6', light: '#fffdf4', dark: '#ada38b', edge: 'rgba(24,28,38,0.7)', groove: 'rgba(104,94,74,0.62)', fuzz: 'rgba(244,239,226,0.5)' };
const RED = { body: '#c8321f', light: '#f6704a', dark: '#7f150c', edge: 'rgba(46,6,3,0.7)', groove: 'rgba(74,8,4,0.62)', fuzz: 'rgba(222,70,44,0.6)' };

// ───────────────────────── thread drawing ─────────────────────────
function trace(g, pts, dx = 0, dy = 0) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0] + dx, pts[i][1] + dy); else g.moveTo(pts[i][0] + dx, pts[i][1] + dy); }
}
/** one twisted strand along a dense polyline: outline, body, shade side, sheen, twist grooves, a little fuzz */
function strand(g, pts, w, pal, seed, o = {}) {
  const n = pts.length; if (n < 2) return;
  g.save(); g.lineJoin = 'round'; g.lineCap = o.cap || 'round';
  if (o.mask) { g.strokeStyle = 'rgb(5,8,16)'; g.lineWidth = w + 1; trace(g, pts); g.stroke(); g.restore(); return; }
  g.strokeStyle = pal.edge; g.lineWidth = w + 1.8; trace(g, pts); g.stroke();
  g.strokeStyle = pal.body; g.lineWidth = w; trace(g, pts); g.stroke();
  g.lineCap = 'butt';
  g.strokeStyle = pal.dark; g.globalAlpha = 0.8; g.lineWidth = w * 0.4; trace(g, pts, LX * w * 0.25, LY * w * 0.25); g.stroke();
  g.strokeStyle = pal.light; g.globalAlpha = 0.95; g.lineWidth = w * 0.34; trace(g, pts, -LX * w * 0.2, -LY * w * 0.2); g.stroke();
  // the twist: short slanting grooves at a regular pitch
  const step = w * 0.78, k = w * 0.47, sl = w * 0.36 * (o.tw || 1);
  let acc = step * 0.5;
  g.beginPath();
  for (let i = 1; i < n; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy) || 1e-6;
    acc += len;
    if (acc >= step) {
      acc -= step;
      const tx = dx / len, ty = dy / len, nx = -ty, ny = tx, px = pts[i][0], py = pts[i][1];
      g.moveTo(px - nx * k + tx * sl, py - ny * k + ty * sl); g.lineTo(px + nx * k - tx * sl, py + ny * k - ty * sl);
    }
  }
  g.strokeStyle = pal.groove; g.globalAlpha = 0.85; g.lineWidth = Math.max(1, w * 0.13); g.stroke();
  // stray filaments
  if (o.fuzz !== 0) {
    const r = L.rng('fz' + seed);
    g.strokeStyle = pal.fuzz; g.lineWidth = 0.7; g.lineCap = 'round';
    g.beginPath();
    for (let i = 3; i < n - 3; i += 4) {
      if (!r.chance(0.3 * (o.fuzz || 1))) continue;
      const dx = pts[i + 1][0] - pts[i - 1][0], dy = pts[i + 1][1] - pts[i - 1][1], len = Math.hypot(dx, dy) || 1;
      const sgn = r.sign(), nx = (-dy / len) * sgn, ny = (dx / len) * sgn, tx = dx / len, ty = dy / len;
      const l = r.range(3, 9), lean = r.range(-0.9, 0.9);
      const x0 = pts[i][0] + nx * w * 0.42, y0 = pts[i][1] + ny * w * 0.42;
      g.moveTo(x0, y0); g.quadraticCurveTo(x0 + nx * l * 0.6, y0 + ny * l * 0.6, x0 + (nx + tx * lean) * l, y0 + (ny + ty * lean) * l);
    }
    g.stroke();
  }
  g.restore();
}
/** a frayed thread end: filaments fanning out from (x, y) around direction `ang` */
function fray(g, x, y, ang, pal, seed, n = 8, len = 20) {
  const r = L.rng('fray' + seed);
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a1 = ang + r.range(-0.62, 0.62), l = len * r.range(0.4, 1), b = r.range(-0.6, 0.6);
    const x1 = x + Math.cos(a1) * l, y1 = y + Math.sin(a1) * l, mx = x + Math.cos(a1 + b) * l * 0.55, my = y + Math.sin(a1 + b) * l * 0.55;
    const lw = r.range(0.8, 1.7), al = r.range(0.75, 1), body = r.chance(0.55) ? pal.body : pal.light;
    g.strokeStyle = pal.edge; g.globalAlpha = 0.35; g.lineWidth = lw + 1.2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
    g.strokeStyle = body; g.globalAlpha = al; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  }
  g.restore();
}
/** shift a polyline sideways by offFn(u) px (positive = to the right of the direction of travel) */
function offsetPts(pts, offFn) {
  const n = pts.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
    let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1;
    const o = offFn(i / (n - 1));
    out[i] = [pts[i][0] + (nx / m) * o, pts[i][1] + (ny / m) * o];
  }
  return out;
}

// ───────────────────────── geometry of the stitching ─────────────────────────
function buildThreads(env) {
  const a = env.arc, nz = L.makeNoise('s13thr');
  const P = (th, dr) => { const p = a.pt(th, dr); return [p.x, p.y]; };
  const white = [], red = [], shadow = [];
  const thL = -a.span(PAD + 80), thR = a.span(PAD + 80);
  const stops = [thL, TH[0], TH[1], TH[2], thR];
  // the long stitches from eye to eye, parallel to the spine (two strands side by side, diving into each eye)
  for (let s = 0; s < 4; s++) {
    const t0 = stops[s], t1 = stops[s + 1], len = (t1 - t0) * (a.R - HOLE_V), n = Math.ceil(len / 3.5);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, th = L.lerp(t0, t1, u);
        const e = Math.min(s > 0 ? sstep(1, 20, u * len) : 1, s < 3 ? sstep(1, 20, (1 - u) * len) : 1);
        const wav = 1.2 * nz.n2((th * a.R) / 80 + side * 9, s * 3.1 + side) + 0.5 * nz.n2((th * a.R) / 19, 40 + side);
        pts.push(P(th, -HOLE_V + (side * SW * 0.53 + wav) * e));
      }
      white.push({ pts, w: SW, seed: 'run' + s + side, tw: 1 });
    }
  }
  // the turns round the spine at every eye
  const wrapEnds = [];
  TH.forEach((th0, hI) => {
    const span = HOLE_V + 1.5, n = Math.ceil(span / 3.5);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, dr = L.lerp(-HOLE_V, 1.5, u), e = sstep(1, 20, u * span);
        const off = (side * SW * 0.53 + 0.9 * nz.n2(dr / 34, hI * 7.3 + side * 2)) * e;
        pts.push(P(th0 + off / a.R, dr));
      }
      white.push({ pts, w: SW, seed: 'wrap' + hI + side, tw: -1 });
      wrapEnds.push(pts[pts.length - 1]);
    }
  });
  white.forEach((t) => shadow.push(t));

  // the red silk: knotted onto the long stitch, one end over the edge onto the paper, the other down the cover
  const K = P(TH_K, -HOLE_V), cs = Math.cos(TH_K), sn = Math.sin(TH_K);
  const loc = (pts) => pts.map(([x, y]) => [K[0] + x * cs - y * sn, K[1] + x * sn + y * cs]);
  const up = L.smoothPath(loc([[5, -15], [20, -40], [33, -80], [68, -108], [84, -152], [122, -178], [143, -218], [188, -241], [211, -284], [258, -302]]), 3);
  const dn = L.smoothPath(loc([[-7, 15], [-22, 38], [-20, 76], [-52, 101], [-62, 144], [-102, 165], [-124, 206]]), 3);
  const k1 = L.smoothPath(loc([[-9, 17], [-2, 2], [7, -17]]), 3), k2 = L.smoothPath(loc([[10, 14], [2, -1], [-8, -15]]), 3);
  red.push({ pts: dn, w: RWID, seed: 'rdn', tw: 1 }, { pts: up, w: RWID, seed: 'rup', tw: 1 }, { pts: k1, w: RWID, seed: 'rk1', tw: 1, fuzz: 0 }, { pts: k2, w: RWID, seed: 'rk2', tw: -1, fuzz: 0 });
  shadow.push(red[0], red[2], red[3]);
  // where the red thread has dropped off the edge of the book it hangs clear of the paper → its shadow falls further away
  shadow.push({ pts: up.map(([x, y]) => { const d = a.drAt(x, y); const lift = d <= 0 ? 0 : L.clamp(1 - d / 130); return [x + LX * 15 * lift, y + LY * 15 * lift]; }), w: RWID });

  // the loose white end at the middle eye (drawn live): points relative to the eye, plus running fraction
  const hc = P(TH[1], -HOLE_V);
  const tail = L.smoothPath([[0, 0], [11, 24], [38, 51], [82, 64], [128, 65], [173, 78], [208, 107], [227, 147], [231, 192]], 3);
  const cum = [0]; for (let i = 1; i < tail.length; i++) cum.push(cum[i - 1] + Math.hypot(tail[i][0] - tail[i - 1][0], tail[i][1] - tail[i - 1][1]));
  const tu = cum.map((c) => c / cum[cum.length - 1]);

  return { white, red, shadow, wrapEnds, holes: TH.map((th) => P(th, -HOLE_V)), tail: { base: hc, pts: tail, u: tu }, redTips: { up, dn } };
}

// ───────────────────────── the sheet of paper underneath ─────────────────────────
function buildPaper(env) {
  const a = env.arc;
  const w = W + PAD * 2, h = Math.ceil(a.yAt(-PAD)) + 60 + PAD;
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#eee4cb'; g.fillRect(0, 0, w, h);
  // slow clouding of the pulp
  g.globalAlpha = 0.4;
  g.drawImage(L.noiseTex(w, h, { seed: 's13pap1', scale: 420, octaves: 4, res: 0.2, warp: 0.5, ramp: [[0, 'rgba(188,158,102,0.55)'], [0.5, 'rgba(214,196,150,0)'], [1, 'rgba(255,251,236,0.6)']] }), 0, 0);
  g.globalAlpha = 0.3;
  g.drawImage(L.noiseTex(w, h, { seed: 's13pap2', scale: 44, octaves: 3, res: 0.4, contrast: 1.5, ramp: [[0, 'rgba(172,142,92,0.5)'], [0.5, 'rgba(200,180,140,0)'], [1, 'rgba(255,253,242,0.55)']] }), 0, 0);
  g.globalAlpha = 1;
  // height map: tooth of the sheet + its long fibres
  const hc = L.noiseTex(w, h, { seed: 's13tooth', scale: 5, octaves: 2, res: 0.5, contrast: 1.3, ramp: [[0, '#565656'], [1, '#aaaaaa']] });
  const hg = hc.getContext('2d');
  const r = L.rng('s13fib');
  g.lineCap = hg.lineCap = 'round';
  for (let i = 0; i < 1700; i++) {
    const x = r() * w, y = r() * h, len = 12 + Math.pow(r(), 2.4) * 110, ang = r() * Math.PI, bend = r.range(-0.5, 0.5) * len;
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    const mx = (x + x1) / 2 - Math.sin(ang) * bend * 0.4, my = (y + y1) / 2 + Math.cos(ang) * bend * 0.4;
    const lw = r.range(0.45, 1.25), light = r.chance(0.62), al = r();
    g.strokeStyle = light ? L.rgba('#fffcf0', 0.16 + 0.3 * al) : L.rgba('#a88c5a', 0.06 + 0.16 * al);
    hg.strokeStyle = light ? 'rgba(236,236,236,0.7)' : 'rgba(60,60,60,0.4)';
    for (const cg of [g, hg]) { cg.lineWidth = lw; cg.beginPath(); cg.moveTo(x, y); cg.quadraticCurveTo(mx, my, x1, y1); cg.stroke(); }
  }
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.bumpLight(hc, { angle: 332, strength: 1.9, res: 0.6 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // a few flecks of bark left in the pulp
  L.speckle(g, { seed: 's13fleck', count: 170, x: 0, y: 0, w, h, rMin: 0.5, rMax: 1.9, colors: ['#8a6a3c', '#6f5430', '#b39662'], alpha: [0.1, 0.42], squash: 0.6 });
  return c;
}

// ───────────────────────── the indigo cover (per pixel) ─────────────────────────
function buildCover(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 4;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s13a'), nB = L.makeNoise('s13b');
  const UB = TH_BJ * R, UH = TH.map((t) => t * R);

  // slow fields on a coarse grid
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const fDye = new Float32Array(CN), fFade = new Float32Array(CN), fUnd = new Float32Array(CN), fScf = new Float32Array(CN), fWx = new Float32Array(CN), fWy = new Float32Array(CN);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, V = R - rr, k = j * cw + i;
    fDye[k] = nA.fbm(U / 380, V / 300, 4, 2, 0.55);
    fFade[k] = nB.fbm(U / 560 + 3 + 0.3 * nA.n2(U / 150, V / 150), V / 380 - 8 + 0.3 * nA.n2(U / 150 + 9, V / 150 - 4), 3);
    fUnd[k] = nA.fbm(U / 300 - 20, V / 220 + 9, 3);
    fScf[k] = nB.fbm(U / 320 + 50, V / 95 - 30, 3, 2, 0.6);
    fWx[k] = nB.n2(U / 80 + 5, V / 80); fWy[k] = nB.n2(U / 80 - 31, V / 80 + 19);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // pass 1: height + material fields
  const Hh = new Float32Array(N), Vv = new Float32Array(N), Wv = new Float32Array(N), Fn = new Float32Array(N), Gn = new Float32Array(N), Ms = new Float32Array(N), Sk = new Float32Array(N);
  const PW = 5.4, TAU = L.TAU;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 4) { Vv[k] = -99; continue; }
      const Vr = R - rr, V = Vr < 0 ? 0 : Vr, U = Math.atan2(ddx, ddy) * R;
      Vv[k] = Vr;
      const wx = bil(fWx, i, j), wy = bil(fWy, i, j), und = bil(fUnd, i, j), dye = bil(fDye, i, j);
      // cloth-like impression pressed into the paper
      const hw = 0.5 + 0.5 * Math.cos((TAU * (U + wx * 2.4)) / PW) * Math.cos((TAU * (V + wy * 2.4)) / PW);
      const amp = L.clamp(0.62 + 0.55 * wy + 0.3 * dye, 0.3, 1.1);
      const g1 = nA.n2(U / 2.3, V / 2.3), g2 = nB.n2(U / 11 + 40, V / 3.4);
      Wv[k] = hw * amp; Fn[k] = g1; Gn[k] = g2;
      // bite of the taut threads, the hinge crease, the rolled-off edge
      let dent = Math.exp(-((V - HOLE_V) * (V - HOLE_V)) / 70);
      if (V < HOLE_V + 6) for (let q = 0; q < 3; q++) { const du = U - UH[q]; if (du > -30 && du < 30) dent += Math.exp(-(du * du) / 70) * sstep(HOLE_V + 6, HOLE_V - 4, V); }
      const hv = V - HINGE_V - 7 * wx, crease = Math.exp(-(hv * hv) / 110);
      let h = 0.95 * amp * hw + 0.42 * g1 + 0.3 * g2 + 13 * und - 1.9 * dent - 3.6 * crease - 3.2 * Math.exp(-V / 4);
      // silk corner wrap
      const ms = sstep(UB - 1, UB + 1, U + 1.2 * g2) * sstep(BJ_V + 1, BJ_V - 1, V + 1.2 * g2);
      if (ms > 0) {
        const tw = Math.sin((TAU * (U + V)) / 4.1);
        const sl = 0.55 * nB.n2(U / 130 + 7, V / 2.1) + 0.45 * nA.n2(U / 2.1 + 70, V / 130);
        Sk[k] = 0.4 + 0.2 * sl + 0.1 * tw + 0.3 * und + 0.04 * g1;
        const hs = 0.5 * tw + 0.45 * sl + 13 * und - 1.9 * dent - 3.2 * Math.exp(-V / 4) + 2.6;
        h += (hs - h) * ms;
      }
      Ms[k] = ms; Hh[k] = h;
    }
  }

  // pass 2: colour
  const DEEP = [18, 37, 66], RICH = [35, 71, 122], WEAR = [95, 127, 156], PALE = [176, 196, 212], FADE = [62, 96, 120];
  const SD = [40, 76, 120], SM = [84, 126, 170], SLt = [158, 192, 220];
  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 1; j < RH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, Vr = Vv[k];
      if (Vr < -2.5) continue;
      const V = Vr < 0 ? 0 : Vr;
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      let rel = (hx * LX + hy * LY) * 0.78; rel = rel < -0.4 ? -0.4 : rel > 0.55 ? 0.55 : rel;
      const g1 = Fn[k], g2 = Gn[k], wv = Wv[k], ms = Ms[k];
      const dye = bil(fDye, i, j), ff = bil(fFade, i, j), scf = bil(fScf, i, j);
      // dyed paper: uneven indigo
      const t = L.clamp(0.52 + 0.5 * dye + 0.05 * g1);
      let cr = DEEP[0] + (RICH[0] - DEEP[0]) * t, cg = DEEP[1] + (RICH[1] - DEEP[1]) * t, cb = DEEP[2] + (RICH[2] - DEEP[2]) * t;
      // a few faded patches
      const fd = sstep(0.22, 0.6, ff + 0.03 * g2) * 0.42;
      if (fd > 0) { cr += (FADE[0] - cr) * fd; cg += (FADE[1] - cg) * fd; cb += (FADE[2] - cb) * fd; }
      // rubbed pale on the high points: along the edge, along the hinge, in scuffs
      const hv = V - HINGE_V - 7 * bil(fWx, i, j);
      const zone = 0.035 + 0.95 * Math.exp(-V / 22) + 0.5 * Math.exp(-(hv * hv) / 220) + 0.5 * sstep(0.3, 0.62, scf);
      let wear = sstep(0.42, 0.95, wv + 0.32 * g1 + 0.22 * zone) * zone * 1.15;
      const rim = sstep(6.5, 1, V + 3.4 * g2 + 5 * scf);
      if (rim > wear) wear = rim;
      if (wear > 1) wear = 1;
      if (wear > 0) {
        const m = wear * 0.86, pl = sstep(0.7, 1, wear) * 0.5;
        cr += (WEAR[0] - cr) * m; cg += (WEAR[1] - cg) * m; cb += (WEAR[2] - cb) * m;
        if (pl > 0) { cr += (PALE[0] - cr) * pl; cg += (PALE[1] - cg) * pl; cb += (PALE[2] - cb) * pl; }
      }
      if (ms > 0) {
        // silk: fine twill with a soft sheen
        const s = L.clamp(Sk[k] + 0.9 * rel), s2 = s < 0.5 ? s * 2 : (s - 0.5) * 2;
        const A = s < 0.5 ? SD : SM, B = s < 0.5 ? SM : SLt;
        let sr = A[0] + (B[0] - A[0]) * s2, sg = A[1] + (B[1] - A[1]) * s2, sb = A[2] + (B[2] - A[2]) * s2;
        const fr = sstep(5, 0.5, V + 3 * g2);   // frayed pale where it turns over the edge
        if (fr > 0) { sr += (PALE[0] - sr) * fr * 0.7; sg += (PALE[1] - sg) * fr * 0.7; sb += (PALE[2] - sb) * fr * 0.7; }
        cr += (sr - cr) * ms; cg += (sg - cg) * ms; cb += (sb - cb) * ms;
      }
      const sh = (1 + rel) * (0.965 + 0.07 * hash2(i, j));
      const o = k * 4;
      d[o] = cr * sh; d[o + 1] = cg * sh; d[o + 2] = cb * sh; d[o + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);
  return { cnv, X0, Y0 };
}

// ───────────────────────── composite ─────────────────────────
function buildScene(env, geo) {
  const a = env.arc;
  const paper = buildPaper(env), cover = buildCover(env);
  const full = (g, style) => { g.fillStyle = style; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2); };
  // the book's own shadow on the sheet
  const bookMask = L.makeLayer(PAD, (s) => { s.fillStyle = 'rgb(74,48,20)'; a.pathBelow(s, 0); s.fill(); });
  const shWide = L.blurred(bookMask, 15), shTight = L.blurred(bookMask, 3.5);
  // shadows of the threads
  const tmask = L.makeLayer(PAD, (s) => { for (const t of geo.shadow) strand(s, t.pts, t.w, null, 0, { mask: true }); });
  const tSh = L.blurred(tmask, 2.2), tAo = L.blurred(tmask, 8);

  const scene = L.makeLayer(PAD, (g) => {
    g.drawImage(paper, -PAD, -PAD);
    g.globalCompositeOperation = 'multiply';
    full(g, L.radial(g, 640, 360, 240, 1600, [[0, '#ffffff'], [0.6, '#f8f0dc'], [1, '#e3d4b2']]));
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.5; g.drawImage(shWide, -PAD + 11, -PAD - 12);
    g.globalAlpha = 0.62; g.drawImage(shTight, -PAD + 3, -PAD - 3.5);
    g.globalAlpha = 1;

    // ── the cover ──
    g.save(); a.clipBelow(g, 0);
    g.drawImage(cover.cnv, cover.X0, cover.Y0);
    // paper fibres caught in the dye
    const r = L.rng('s13cfib');
    g.lineCap = 'round';
    const y0 = a.crestY - 10, hh = H + PAD - y0;
    for (let i = 0; i < 1500; i++) {
      const x = r.range(-PAD, W + PAD), y = y0 + r() * hh, len = 6 + Math.pow(r(), 2) * 40, ang = r() * Math.PI, bend = r.range(-0.16, 0.16) * len;
      if (a.drAt(x, y) > -BJ_V - 6 && x > a.pt(TH_BJ, 0).x - 40) continue;   // not across the silk
      const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
      g.strokeStyle = r.chance(0.62) ? L.rgba('#a9c4e0', r.range(0.06, 0.24)) : L.rgba('#060d1a', r.range(0.1, 0.28));
      g.lineWidth = r.range(0.5, 1.2);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x1) / 2 - Math.sin(ang) * bend, (y + y1) / 2 + Math.cos(ang) * bend, x1, y1); g.stroke();
    }
    // light scratches from years of sliding in and out of its case
    for (let i = 0; i < 46; i++) {
      const th = r.range(-0.36, 0.36), dr = -r.range(170, 620), len = r.range(40, 240), ang = r.range(-0.5, 0.5) + (r.chance(0.25) ? 1.2 : 0);
      const p0 = a.pt(th, dr), c2 = Math.cos(ang + th), s2 = Math.sin(ang + th);
      g.strokeStyle = L.rgba('#9db6cf', r.range(0.08, 0.26)); g.lineWidth = r.range(0.6, 1.3);
      g.beginPath(); g.moveTo(p0.x, p0.y); g.quadraticCurveTo(p0.x + c2 * len * 0.5 + r.range(-8, 8), p0.y + s2 * len * 0.5 + r.range(-8, 8), p0.x + c2 * len, p0.y + s2 * len); g.stroke();
    }
    L.speckle(g, { seed: 's13lint', count: 420, x: -PAD, y: y0, w: W + PAD * 2, h: hh, rMin: 0.5, rMax: 1.7, colors: ['#b8cde2', '#dfe8f0', '#07101e'], alpha: [0.12, 0.5] });
    // the light pools at the left, the cover sinks into shadow toward the far corners
    g.globalCompositeOperation = 'multiply';
    full(g, L.radial(g, 560, 700, 240, 1620, [[0, '#ffffff'], [0.5, '#d9deec'], [1, '#7f8aae']]));
    g.globalCompositeOperation = 'soft-light';
    full(g, L.radial(g, 520, 680, 0, 1000, [[0, 'rgba(150,196,255,0.34)'], [0.6, 'rgba(120,170,240,0.12)'], [1, 'rgba(120,170,240,0)']]));
    g.restore();

    // ── the worn edge: fibres standing proud of it ──
    const rf = L.rng('s13fuzz'), sp = a.span(PAD + 40);
    g.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const th = rf.range(-sp, sp), long = rf.chance(0.05), len = long ? rf.range(7, 15) : 1.5 + Math.pow(rf(), 2) * 5.5, lean = rf.range(-1.15, 1.15);
      const silk = th > TH_BJ;
      g.strokeStyle = L.rgba(rf.pick(silk ? ['#c9dbea', '#9db9d4', '#e8eef2'] : ['#9fb6ca', '#c6d4df', '#6f8fab', '#3d5f85']), rf.range(0.45, 0.9));
      g.lineWidth = rf.range(0.6, 1.15);
      a.at(g, th, -rf.range(0.5, 3), () => {
        const ex = Math.sin(lean) * len, ey = -Math.cos(lean) * len;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(ex * 0.3 + rf.range(-2, 2), ey * 0.6, ex, ey); g.stroke();
      });
    }

    // ── the eyes ──
    for (const [hx, hy] of geo.holes) {
      g.fillStyle = L.radial(g, hx, hy, 0, 15, [[0, 'rgba(2,4,9,0.96)'], [0.5, 'rgba(2,4,9,0.9)'], [0.75, 'rgba(4,8,16,0.4)'], [1, 'rgba(4,8,16,0)']]);
      g.beginPath(); g.arc(hx, hy, 15, 0, L.TAU); g.fill();
    }
    // ── thread shadows, then the threads ──
    g.globalAlpha = 0.34; g.drawImage(tAo, -PAD, -PAD);
    g.globalAlpha = 0.72; g.drawImage(tSh, -PAD + LX * 4.6, -PAD + LY * 4.6);
    g.globalAlpha = 1;
    for (const t of geo.white) strand(g, t.pts, t.w, WHITE, t.seed, t);
    // the turn over the edge: the thread rolls away from the light
    for (const [ex, ey] of geo.wrapEnds) {
      g.fillStyle = L.radial(g, ex, ey - 2, 0, 8, [[0, 'rgba(60,54,44,0.5)'], [1, 'rgba(60,54,44,0)']]);
      g.beginPath(); g.arc(ex, ey - 2, 8, 0, L.TAU); g.fill();
    }
    // threads disappear into the eyes
    for (const [hx, hy] of geo.holes) {
      g.fillStyle = L.radial(g, hx, hy, 0, 13, [[0, 'rgba(8,8,12,0.78)'], [0.45, 'rgba(8,8,12,0.42)'], [1, 'rgba(8,8,12,0)']]);
      g.beginPath(); g.arc(hx, hy, 13, 0, L.TAU); g.fill();
    }
    // the red silk
    for (const t of geo.red) strand(g, t.pts, t.w, RED, t.seed, t);
    const { up, dn } = geo.redTips;
    const tipAng = (pts) => { const q = pts[pts.length - 1], q0 = pts[pts.length - 6]; return Math.atan2(q[1] - q0[1], q[0] - q0[0]); };
    fray(g, up[up.length - 1][0], up[up.length - 1][1], tipAng(up), RED, 'u', 8, 20);
    fray(g, dn[dn.length - 1][0], dn[dn.length - 1][1], tipAng(dn), RED, 'd', 7, 17);
  });
  // shallow depth of field: the near part of the cover (bottom of frame) drifts out of focus
  const soft = L.blurred(scene, 3.2), sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.linear(sg, 0, PAD + 880, 0, PAD + H + 60, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  sg.fillRect(0, 0, soft.width, soft.height);
  scene.getContext('2d').drawImage(soft, -PAD, -PAD);
  return scene;
}

// ───────────────────────── the loose end (live) ─────────────────────────
function drawTail(g, p) {
  const T = S.tail, n = T.pts.length, [bx, by] = T.base;
  const sway = L.lerp(-0.016, 0.022, L.ease.inOutQuad(p)) + 0.004 * Math.sin(p * 7);
  const c = new Array(n), sh = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = T.u[i], ang = sway * Math.pow(u, 1.25) * 2.2, cs = Math.cos(ang), sn = Math.sin(ang);
    const x = bx + T.pts[i][0] * cs - T.pts[i][1] * sn, y = by + T.pts[i][0] * sn + T.pts[i][1] * cs;
    c[i] = [x, y];
    const lift = sstep(0.1, 1, u), d = 4.5 + (19 + 90 * sway) * lift;   // the end stands clear of the cover → its shadow parts from it
    sh[i] = [x + LX * d, y + LY * d];
  }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (let q = 0; q < 4; q++) { g.strokeStyle = 'rgba(3,6,14,0.2)'; g.lineWidth = SW * 1.5 + q * 5; trace(g, sh); g.stroke(); }
  g.restore();
  const A = offsetPts(c, (u) => SW * 0.5 * (1 + 2.1 * sstep(0.62, 1, u)));
  const m = Math.floor(n * 0.84);
  const B = offsetPts(c, (u) => -SW * 0.5 * (1 + 6.5 * Math.pow(sstep(0.42, 0.95, u), 1.4))).slice(0, m);
  strand(g, B, SW, WHITE, 'tailB', { tw: 1, fuzz: 1.6 });
  strand(g, A, SW, WHITE, 'tailA', { tw: 1, fuzz: 1.6 });
  const ta = (pts) => { const q = pts[pts.length - 1], q0 = pts[pts.length - 6]; return Math.atan2(q[1] - q0[1], q[0] - q0[0]); };
  fray(g, B[m - 1][0], B[m - 1][1], ta(B), WHITE, 'tb', 7, 18);
  fray(g, A[n - 1][0], A[n - 1][1], ta(A), WHITE, 'ta', 9, 22);
  g.fillStyle = L.radial(g, bx, by, 0, 12, [[0, 'rgba(8,8,12,0.7)'], [0.45, 'rgba(8,8,12,0.38)'], [1, 'rgba(8,8,12,0)']]);
  g.beginPath(); g.arc(bx, by, 12, 0, L.TAU); g.fill();
}

export default {
  name: '线装书',
  tone: 'dark',
  init(env) {
    const geo = buildThreads(env);
    S = { scene: buildScene(env, geo), tail: geo.tail };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const cam = { rot: L.lerp(-0.0055, 0.0055, p), zoom: L.lerp(1.0, 1.026, p) };
    L.blit(ctx, env, S.scene, cam);
    L.cam(ctx, env, cam, () => drawTail(ctx, p));
    // a soft pool of raking light drifting along the spine
    const gp = a.pt(L.lerp(-0.2, -0.1, p), -90);
    L.glow(ctx, gp.x, gp.y, 760, '#fff1d0', 0.15, 'soft-light');
    L.vignette(ctx, { strength: 0.2 });
  },
};
