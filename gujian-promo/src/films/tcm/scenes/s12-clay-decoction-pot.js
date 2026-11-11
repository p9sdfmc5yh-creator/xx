// s12 — 砂锅药罐口沿. The far rim of an unglazed sandy-clay decoction pot, seen obliquely from above:
// the arc is the outer edge of the lip. Below it the thick, slightly everted lip, the sooty neck groove,
// two or three throwing rings on the inner wall, dried decoction running down in drips, and finally the black of the pot's inside.
// Above the arc: clean black.
//
// Everything below the arc is shaded per pixel in init(): each pixel is mapped to (U = distance along the rim, v = depth
// below the lip edge), a height field is built there (lip profile + throwing striations + sand grains + chips + drips),
// and that relief is lit from the upper left with a marched cast shadow. A second, purely additive "gain" image holds what a
// raking light adds; draw() reveals it through a soft window that travels along the lip from left to right.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 40;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ── cheap tiled value noise for the per-pixel passes (simplex is kept for the slow fields) ──
const VN = 512, VM = VN - 1;
let vtab = null;
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let tx = x - xi, ty = y - yi; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const x0 = xi & VM, x1 = (xi + 1) & VM, y0 = (yi & VM) * VN, y1 = ((yi + 1) & VM) * VN;
  const a = vtab[y0 + x0], c = vtab[y1 + x0];
  const top = a + (vtab[y0 + x1] - a) * tx, bot = c + (vtab[y1 + x1] - c) * tx;
  return top + (bot - top) * ty;
}

// ── radial profiles as look-up tables over v (px below the lip edge) ──
const PV0 = -8, PV1 = 720, PSTEP = 0.5, PN = Math.round((PV1 - PV0) / PSTEP) + 1;
function profileLUT(pts, smoothPasses, rad) {
  let a = new Float32Array(PN), s = 0;
  for (let i = 0; i < PN; i++) {
    const v = PV0 + i * PSTEP;
    while (s < pts.length - 2 && v > pts[s + 1][0]) s++;
    const t = L.clamp((v - pts[s][0]) / (pts[s + 1][0] - pts[s][0]));
    a[i] = pts[s][1] + (pts[s + 1][1] - pts[s][1]) * t;
  }
  for (let pass = 0; pass < smoothPasses; pass++) {
    const b = new Float32Array(PN);
    for (let i = 0; i < PN; i++) {
      let sum = 0, n = 0;
      for (let k = -rad; k <= rad; k++) { const q = i + k; if (q >= 0 && q < PN) { sum += a[q]; n++; } }
      b[i] = sum / n;
    }
    a = b;
  }
  return a;
}
const lutAt = (a, v) => { let f = (v - PV0) / PSTEP; if (f < 0) f = 0; else if (f > PN - 2) f = PN - 2; const i = f | 0; return a[i] + (a[i + 1] - a[i]) * (f - i); };

const UOFF = 1500, ULEN = 3000;
const uAt = (a, U) => { let f = U + UOFF; if (f < 0) f = 0; else if (f > ULEN - 2) f = ULEN - 2; const i = f | 0; return a[i] + (a[i + 1] - a[i]) * (f - i); };

function buildPot(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 70;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s12a'), nB = L.makeNoise('s12b');
  if (!vtab) { const r = L.rng('s12vn'); vtab = new Float32Array(VN * VN); for (let i = 0; i < vtab.length; i++) vtab[i] = r() * 2 - 1; }
  let tt = performance.now(); const T = (lbl) => { const n = performance.now(); console.warn('s12 ' + lbl, Math.round(n - tt)); tt = n; };

  // height of the rim section (px): rounded outer edge → broad everted lip → neck groove → wall with throwing rings.
  // PROF has the ring grooves cut in, PROF0 is the same wall without them; a slow factor along the rim blends the two,
  // so each hand-thrown ring swells and fades on its way round.
  const LIPP = [[-8, -26], [0, 0], [5, 14], [12, 26], [24, 36], [44, 43], [62, 42], [76, 36], [90, 24], [102, 12], [112, 4], [120, 0], [132, 3], [148, 10], [170, 14]];
  const TAIL = [[304, 13], [322, 10], [345, 8], [372, 8], [392, 12.5], [412, 8.5], [440, 7], [720, 6]];
  const PROF = profileLUT([...LIPP, [190, 12], [199, 6], [205, 3.2], [211, 6], [220, 11.5], [240, 14], [256, 11.5], [263, 6], [268, 3.2], [274, 6], [284, 11], ...TAIL], 3, 4);
  const PROF0 = profileLUT([...LIPP, [190, 12.5], [205, 11], [220, 12.5], [240, 14], [256, 12.5], [268, 11], [284, 12], ...TAIL], 3, 4);
  // where soot settles: inner roll of the lip + neck groove, the ring grooves, and more of the wall further down
  const SOOTA = [[-8, 0], [80, 0], [96, 0.5], [108, 1], [128, 1], [140, 0.5], [154, 0.1], [194, 0.12]], SOOTZ = [[280, 0.22], [330, 0.34], [420, 0.5], [720, 0.7]];
  const SOOT = profileLUT([...SOOTA, [200, 1], [210, 1], [217, 0.14], [257, 0.2], [263, 1], [273, 1], ...SOOTZ], 2, 3);
  const SOOT0 = profileLUT([...SOOTA, [205, 0.2], [268, 0.26], ...SOOTZ], 2, 3);

  // ── things that depend only on the position along the rim ──
  const edgeL = new Float32Array(ULEN), chipL = new Float32Array(ULEN), wobL = new Float32Array(ULEN), tideL = new Float32Array(ULEN),
    sootModL = new Float32Array(ULEN), lickL = new Float32Array(ULEN), ringAL = new Float32Array(ULEN), ringBL = new Float32Array(ULEN);
  const CHIPS = [[-0.338, 30, 8], [-0.214, 12, 4.5], [-0.118, 22, 6.5], [0.052, 10, 3.6], [0.167, 34, 8], [0.268, 14, 5], [0.372, 24, 7]];
  const LICKS = [[-0.29, 110, 0.7], [0.215, 170, 0.8], [0.43, 100, 0.7]];
  for (let n = 0; n < ULEN; n++) {
    const U = n - UOFF;
    let chip = 0;
    for (let c = 0; c < CHIPS.length; c++) {
      const [th, hw, d] = CHIPS[c];
      let x = (U - th * R) / hw; if (x <= -1 || x >= 1) continue;
      x += 0.25 * (1 - x * x) * (c % 2 ? 1 : -1);
      chip = Math.max(chip, d * Math.pow(Math.max(0, 1 - x * x), 0.8) * (1 + 0.14 * nB.n2(U / 17, c * 3.1)));
    }
    chipL[n] = chip;
    edgeL[n] = chip + Math.max(0, 0.9 * nA.n2(U / 31, 5.5) + 0.7 * nB.n2(U / 8.5, 2.2) + 0.35 * nA.n2(U / 3.1, 8.8) - 0.15);
    wobL[n] = 3.5 * nA.n2(U / 460, 3.3) + 1.8 * nB.n2(U / 150, 9.1);
    tideL[n] = 11 * nA.n2(U / 380, 1.7) + 5 * nB.n2(U / 90, 4.4) + 2 * nA.n2(U / 22, 6.6);
    sootModL[n] = 0.95 + 0.22 * nB.n2(U / 210, 12.5) + 0.12 * nA.n2(U / 45, 0.5);
    ringAL[n] = L.clamp(0.78 + 0.5 * nA.n2(U / 430, 77.7), 0.3, 1.1);
    ringBL[n] = L.clamp(0.72 + 0.55 * nB.n2(U / 390 + 4, 55.5), 0.25, 1.1);
    let lick = 0;
    for (const [th, w, amp] of LICKS) { const x = (U - th * R) / w; lick += amp * Math.exp(-x * x) * (0.75 + 0.25 * nA.n2(U / 40, 31)); }
    lickL[n] = lick;
  }

  // ── dried decoction, drawn with the 2D API into a mask. Unglazed clay drinks the liquid, so a run is a soft-edged
  //    darker streak that fades out downward (G channel, heavily blurred), some with a thin darker core (R channel) ──
  const rd = L.rng('s12drip');
  const run = (g, chan, th0, v0, len, w0, w1, ph, wob, a0) => {
    const M = 36, Lp = [], Rp = [];
    for (let s = 0; s <= M; s++) {
      const u = s / M, v = v0 + len * u;
      const off = wob * Math.sin(u * 4 + ph) + 0.45 * wob * Math.sin(u * 11 + ph * 2.3);
      let hw = 0.5 * (w0 + (w1 - w0) * u) * (0.82 + 0.18 * Math.sin(u * 8 + ph * 1.7));
      const p1 = (v - 205) / 9, p2 = (v - 268) / 9;
      hw *= 1 + 0.4 * Math.exp(-p1 * p1) + 0.4 * Math.exp(-p2 * p2);      // pools a little in the ring grooves
      const r = R - v, tl = th0 + (off - hw) / r, tr = th0 + (off + hw) / r;
      Lp.push([cx + r * Math.sin(tl) - X0, cy - r * Math.cos(tl) - Y0]); Rp.push([cx + r * Math.sin(tr) - X0, cy - r * Math.cos(tr) - Y0]);
    }
    const col = (q) => { const c = Math.round(255 * q); return chan ? `rgb(0,${c},0)` : `rgb(${c},0,0)`; };
    const r0 = R - v0, r1 = R - v0 - len, sn = Math.sin(th0), cs = Math.cos(th0);
    const gr = g.createLinearGradient(cx + r0 * sn - X0, cy - r0 * cs - Y0, cx + r1 * sn - X0, cy - r1 * cs - Y0);
    gr.addColorStop(0, col(a0)); gr.addColorStop(0.5, col(a0 * 0.8)); gr.addColorStop(1, col(0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(Lp[0][0], Lp[0][1]);
    for (let s = 1; s <= M; s++) g.lineTo(Lp[s][0], Lp[s][1]);
    for (let s = M; s >= 0; s--) g.lineTo(Rp[s][0], Rp[s][1]);
    g.closePath(); g.fill();
  };
  const softC = L.makeCanvas(RW, RH), wg = softC.getContext('2d');
  wg.globalCompositeOperation = 'lighter';
  for (let n = 0; n < 8; n++)          // broad faint washes
    run(wg, 1, rd.range(-0.5, 0.5), rd.range(90, 118), rd.range(140, 250), rd.range(70, 140), rd.range(40, 80), rd.range(0, 10), rd.range(3, 9), rd.range(0.25, 0.45));
  const RUNS = [-0.44, -0.365, -0.325, -0.2, -0.125, -0.09, 0.03, 0.075, 0.2, 0.245, 0.3, 0.385, 0.45], cores = [];
  RUNS.forEach((t0, n) => {            // the runs proper, in loose clusters; a few boiled right over the lip
    const over = n % 4 === 1, th0 = t0 + rd.range(-0.012, 0.012), v0 = over ? rd.range(2, 10) : rd.range(96, 112), len = rd.range(130, 290) + (over ? 100 : 0);
    run(wg, 1, th0, v0, len, rd.range(18, 44), rd.range(9, 18), rd.range(0, 10), rd.range(2, 7), rd.range(0.6, 1));
    if (n % 3 !== 2) cores.push([th0 + rd.range(-0.004, 0.004), Math.max(v0, 100) + rd.range(0, 30), len * rd.range(0.45, 0.8)]);
  });
  const coreC = L.makeCanvas(RW, RH), dg = coreC.getContext('2d');
  dg.globalCompositeOperation = 'lighter';
  for (const [th0, v0, len] of cores) run(dg, 0, th0, v0, len, rd.range(4, 8), rd.range(2, 4), rd.range(0, 10), rd.range(1, 3), rd.range(0.6, 0.95));
  for (let n = 0; n < 40; n++) {       // spatter
    const th = rd.range(-0.52, 0.52), r = R - rd.range(8, 310), rr = rd.range(1.2, 4.2);
    dg.fillStyle = `rgb(${Math.round(255 * rd.range(0.4, 0.9))},0,0)`;
    dg.beginPath(); dg.ellipse(cx + r * Math.sin(th) - X0, cy - r * Math.cos(th) - Y0, rr, rr * rd.range(0.7, 1.6), th, 0, L.TAU); dg.fill();
  }
  const mc = L.makeCanvas(RW, RH), mg = mc.getContext('2d', { willReadFrequently: true });
  mg.fillStyle = '#000'; mg.fillRect(0, 0, RW, RH);
  mg.globalCompositeOperation = 'lighter';
  mg.filter = 'blur(6px)'; mg.drawImage(softC, 0, 0);
  mg.filter = 'blur(1.6px)'; mg.drawImage(coreC, 0, 0);
  mg.filter = 'none';
  const MK = mg.getImageData(0, 0, RW, RH).data;
  T('mask');

  // ── sand: grains and pits are splatted into their own buffers (GB = footprint 0..1, GH = height, GT = kind) ──
  const GB = new Float32Array(N), GH = new Float32Array(N), GT = new Uint8Array(N);
  const splat = (U, v, r, asp, rot, A, kind, mesa) => {
    const rr = R - v, th = U / R, px = cx + rr * Math.sin(th) - X0, py = cy - rr * Math.cos(th) - Y0;
    const e = Math.ceil(r) + 1, c = Math.cos(rot), sn = Math.sin(rot), ir = 1 / r, ia = 1 / (r * asp);
    const j0 = Math.max(0, Math.floor(py - e)), j1 = Math.min(RH - 1, Math.ceil(py + e)), i0 = Math.max(0, Math.floor(px - e)), i1 = Math.min(RW - 1, Math.ceil(px + e));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = i - px, dy = j - py, x1 = (dx * c + dy * sn) * ir, y1 = (-dx * sn + dy * c) * ia, b = 1 - (x1 * x1 + y1 * y1);
      if (b <= 0) continue;
      const k = j * RW + i;
      if (b > GB[k]) { GB[k] = b; GH[k] = A * (mesa ? Math.min(1, b * mesa) : b); GT[k] = kind; }
    }
  };
  // kinds: 1 clay-coloured lump, 2 pale sand, 3 dark grain, 4 quartz, 5 pit
  const rs = L.rng('s12sand'), UM = 1320;
  for (let v = 3; v < 500; v += 10.5) for (let U = -UM; U < UM; U += 10.5) {
    const q = rs(), u = U + rs() * 10.5, w = v + rs() * 10.5, sz = rs(), t = rs(), asp = rs.range(0.6, 1), rot = rs() * Math.PI;
    if (q < 0.4) splat(u, w, 2.0 + 2.0 * sz, asp, rot, 0.6 + 0.9 * sz, t < 0.56 ? 1 : t < 0.78 ? 2 : t < 0.92 ? 3 : 4, 0);
    else if (q > 0.95) splat(u, w, 2.2 + 1.2 * sz, asp, rot, -2.4, 5, 0);
  }
  for (let v = 4; v < 500; v += 26) for (let U = -UM; U < UM; U += 26) {
    const q = rs(), u = U + rs() * 26, w = v + rs() * 26, sz = rs(), t = rs(), asp = rs.range(0.55, 0.95), rot = rs() * Math.PI;
    if (q < 0.075) splat(u, w, 4.2 + 3.6 * sz * sz, asp, rot, 1.5 + 1.5 * sz, t < 0.45 ? 2 : t < 0.6 ? 4 : 3, 2.2);
    else if (q > 0.975) splat(u, w, 3.8 + 2 * sz, asp, rot, -3.2, 5, 0);
  }
  T('sand');

  // ── slow fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cSoot = new Float32Array(cw * ch), cTone = new Float32Array(cw * ch), cLump = new Float32Array(cw * ch), cStri = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * R, v = R - rr, k = j * cw + i;
    if (v < -12) continue;
    cSoot[k] = nA.fbm(U / 230, v / 170, 4, 2, 0.55);
    cTone[k] = 0.7 * nB.fbm(U / 380 + 9, v / 240 - 4, 3) + 0.3 * nA.n2(U / 900 - 3, v / 500 + 7);
    cLump[k] = nB.fbm(U / 64 - 17, v / 40 + 3, 3);
    cStri[k] = 0.55 + 0.45 * nA.n2(U / 300 + 60, v / 90 - 8);     // how strongly the throwing striations show here
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  T('coarse');
  // ── pass 1: height, albedo, gloss, light scale ──
  const Hh = new Float32Array(N), AR = new Float32Array(N), AG = new Float32Array(N), AB = new Float32Array(N),
    Gl = new Float32Array(N), Ls = new Float32Array(N), Al = new Float32Array(N);
  const VMAX = 548;
  for (let j = 0; j < RH; j++) {
    const py = Y0 + j, ddy = cy - py;
    if (py - a.crestY < -9) { Hh.fill(-30, j * RW, (j + 1) * RW); continue; }
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx;
      const v = R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (v < -8) { Hh[k] = -30; continue; }
      if (v < -0.6) { Hh[k] = lutAt(PROF, v); continue; }
      if (v > VMAX) { Hh[k] = 6; Al[k] = 1; AR[k] = 5; AG[k] = 5; AB[k] = 5; continue; }
      const th = Math.atan2(ddx, ddy), U = th * R;
      const eU = uAt(edgeL, U), chD = uAt(chipL, U);
      let alpha = v - eU + 0.5; alpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
      if (alpha <= 0) { Hh[k] = lutAt(PROF, v) - chD * 1.5 - 8; continue; }
      const vp = v + uAt(wobL, U) * sstep(24, 120, v) + 0.0035 * U * sstep(120, 200, v);     // rings wander, and wind very slightly
      const rk = vp < 237 ? uAt(ringAL, U) : uAt(ringBL, U), p0 = lutAt(PROF0, vp);
      let h = p0 + (lutAt(PROF, vp) - p0) * rk;
      // fracture face of a chip: drops toward the edge, shows fresh pale clay
      let fresh = 0;
      if (chD > 0.4) { fresh = 1 - sstep(eU, eU + chD * 2.8 + 2, v); h -= chD * 1.6 * fresh * fresh; }
      const lip = 1 - sstep(64, 100, v);            // the top of the lip is smoother: wiped with a wet hand, worn by the lid

      const lump = bil(cLump, i, j);
      const st1 = vn(U / 330 + 200, vp / 6.5 + 11), st2 = vn(U / 140 + 7, vp / 2.7 + 300);     // throwing striations
      const g1 = vn(U / 3.4 + 90, v / 3.4 + 150), g2 = vn(U / 1.75 + 40, v / 1.75 + 70);        // fine grit
      const sa = bil(cStri, i, j) * (1 - 0.55 * lip);
      h += 2.2 * lump + (0.62 * st1 + 0.26 * st2) * sa + (0.4 * g1 + 0.2 * g2) * (1 - 0.3 * lip + 1.4 * fresh);

      // clay body colour
      let tone = 0.5 + 0.6 * bil(cTone, i, j) + 0.07 * g1 + 0.16 * lip; tone = tone < 0 ? 0 : tone > 1 ? 1 : tone;
      let ar, ag, ab;
      if (tone < 0.5) { const t = tone * 2; ar = 160 + (181 - 160) * t; ag = 76 + (98 - 76) * t; ab = 43 + (60 - 43) * t; }
      else { const t = tone * 2 - 1; ar = 181 + (206 - 181) * t; ag = 98 + (122 - 98) * t; ab = 60 + (74 - 60) * t; }
      let gloss = 0.05, grain = 0, cav = 0;
      // sandy speckle with no relief
      if (g2 > 0.7) { const m = (g2 - 0.7) * 2.8; ar += 40 * m; ag += 38 * m; ab += 30 * m; } else if (g2 < -0.72) { const m = (-g2 - 0.72) * 3; ar -= 70 * m; ag -= 44 * m; ab -= 26 * m; }

      // coarse sand
      const gb = GB[k];
      if (gb > 0) {
        const kind = GT[k], m = gb > 0.4 ? 1 : gb / 0.4;
        h += GH[k];
        if (kind === 5) cav = gb;
        else {
          grain = gb;
          if (kind === 1) { const e = (vn(U / 9 + 33, v / 9 + 71)) * 22; ar += e * m; ag += e * 0.8 * m; ab += e * 0.6 * m; }
          else if (kind === 2) { ar += (224 - ar) * m * 0.72; ag += (176 - ag) * m * 0.72; ab += (130 - ab) * m * 0.72; gloss += 0.1 * m; }
          else if (kind === 3) { ar += (86 - ar) * m * 0.82; ag += (48 - ag) * m * 0.82; ab += (34 - ab) * m * 0.82; }
          else { ar += (238 - ar) * m * 0.85; ag += (210 - ag) * m * 0.85; ab += (180 - ab) * m * 0.85; gloss += 0.25 * m; }
        }
      }
      if (fresh > 0) { const f = fresh * 0.8; ar += (216 - ar) * f; ag += (140 - ag) * f; ab += (96 - ab) * f; }

      // dried decoction: tide line, everything below it, drips, washes
      const drip = MK[k * 4] / 255, wash = MK[k * 4 + 1] / 255;
      const tideV = 338 + uAt(tideL, U);
      const below = sstep(tideV - 4, tideV + 7, v + 3 * g1 + 5 * lump);
      const dc = (v - tideV + 1) / 4.5, crust = Math.exp(-dc * dc);
      // absorbed stain: soft, broken up by the clay's own texture; a darker line where the liquid ran longest
      const film = Math.max(0.8 * sstep(0.04, 0.7, wash) * (0.85 + 0.35 * lump + 0.12 * g1), 0.82 * sstep(0.08, 0.7, drip));
      let stain = film; if (below * 0.86 > stain) stain = below * 0.86; if (crust * 0.9 > stain) stain = crust * 0.9;
      stain *= 1 - 0.8 * fresh;
      h += 1.2 * crust;
      if (stain > 0) {
        const sv = 0.94 + 0.2 * st1;
        ar += (76 * sv - ar) * stain; ag += (42 * sv - ag) * stain; ab += (25 * sv - ab) * stain; gloss += 0.35 * stain;
      }

      // soot
      const ps = bil(cSoot, i, j);
      const s0 = lutAt(SOOT0, vp);
      let soot = (s0 + (lutAt(SOOT, vp) - s0) * rk) * uAt(sootModL, U) + 0.42 * ps * (0.3 + 0.7 * sstep(40, 150, v))
        + uAt(lickL, U) * (0.4 + 0.6 * sstep(0, 95, v)) * (0.8 + 0.5 * ps) + 0.16 * g1 + 0.1 * st1 - 0.24 * grain + 0.3 * cav;
      soot = sstep(0.38, 0.8, soot) * (1 - 0.85 * fresh);
      if (soot > 0) { ar += (28 - ar) * soot; ag += (21 - ag) * soot; ab += (18 - ab) * soot; gloss *= 1 - 0.8 * soot; }
      if (cav > 0) { const o = 1 - 0.6 * cav; ar *= o; ag *= o; ab *= o; }
      // the wall sinks into the dark of the pot
      const deep = sstep(tideV + 36, tideV + 190, v);
      if (deep > 0) { ar += (9 - ar) * deep; ag += (7 - ag) * deep; ab += (6 - ab) * deep; }

      Hh[k] = h; AR[k] = ar; AG[k] = ag; AB[k] = ab; Gl[k] = gloss; Al[k] = alpha;
      const tk = (th + 0.1) / 0.34;
      Ls[k] = (0.82 + 0.28 * Math.exp(-tk * tk)) * (1 - 0.14 * sstep(120, 300, v)) * (1 - 0.97 * sstep(tideV - 12, tideV + 185, v));
    }
  }

  T('pass1');
  // ── pass 2: light it ──
  const img = new ImageData(RW, RH), d = img.data, gimg = new ImageData(RW, RH), gd = gimg.data;
  let lx = -0.6, ly = -0.66, lz = 0.47; { const m = Math.hypot(lx, ly, lz); lx /= m; ly /= m; lz /= m; }
  const lh = Math.hypot(lx, ly), tanE = lz / lh, sdx = lx / lh, sdy = ly / lh;
  let hx_ = lx, hy_ = ly, hz_ = lz + 1; { const m = Math.hypot(hx_, hy_, hz_); hx_ /= m; hy_ /= m; hz_ /= m; }
  // raking light for the travelling highlight: lower and more from the left
  let rx = -0.8, ry = -0.5, rz = 0.36; { const m = Math.hypot(rx, ry, rz); rx /= m; ry /= m; rz /= m; }
  let qx_ = rx, qy_ = ry, qz_ = rz + 1; { const m = Math.hypot(qx_, qy_, qz_); qx_ /= m; qy_ /= m; qz_ /= m; }
  const ST = [1.5, 3, 5, 8, 12, 17, 24, 33, 44, 58, 76], NS = ST.length, SOX = ST.map((t) => Math.round(sdx * t)), SOY = ST.map((t) => Math.round(sdy * t));
  const AMB = 0.2, KEY = 0.78 / lz;
  // tone curves: shadows stay a saturated red-brown, lit clay drifts toward pale ochre
  const TL = 1024, TS = 700, PG = new Float32Array(TL), PB = new Float32Array(TL), SP = new Float32Array(TL), SP2 = new Float32Array(TL);
  for (let n = 0; n < TL; n++) { const s = n / TS; PG[n] = Math.pow(s, 1.2); PB[n] = Math.pow(s, 1.34); SP[n] = Math.pow(n / (TL - 1), 36); SP2[n] = Math.pow(n / (TL - 1), 22); }
  for (let j = 1; j < RH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, al = Al[k];
      if (al <= 0) continue;
      const o = k * 4;
      const ar = AR[k], ag = AG[k], ab = AB[k];
      if (ar <= 5.5) { d[o] = 5; d[o + 1] = 5; d[o + 2] = 5; d[o + 3] = 255; gd[o + 3] = 255; continue; }
      const h0 = Hh[k];
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * inv, ny = -hy * inv, nz = inv;
      let dif = nx * lx + ny * ly + nz * lz; if (dif < 0) dif = 0;
      // cast shadow: march toward the light
      let ms = 0;
      for (let s = 0; s < NS; s++) {
        const qi = i + SOX[s], qj = j + SOY[s];
        if (qi < 0 || qj < 0) break;
        const sl = (Hh[qj * RW + qi] - h0) / ST[s];
        if (sl > ms) ms = sl;
      }
      const sh = 1 - 0.9 * sstep(tanE * 0.7, tanE * 1.35, ms);
      const ls = Ls[k], gl = Gl[k];
      let s = (AMB + KEY * dif * sh) * ls;
      if (s > 1) s = 1 + (1 - Math.exp(-(s - 1) * 1.5)) * 0.4;
      const si = (s * TS) | 0;
      let sp = nx * hx_ + ny * hy_ + nz * hz_; sp = sp > 0 ? SP[(sp * (TL - 1)) | 0] * gl * sh * ls : 0;
      let cr = ar * s + sp * 120, cg = ag * PG[si] + sp * 104, cb = ab * PB[si] + sp * 84;
      if (cr < 5) cr = 5; if (cg < 5) cg = 5; if (cb < 5) cb = 5;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = al * 255;
      // gain under the raking light
      let d2 = nx * rx + ny * ry + nz * rz; d2 = d2 < 0 ? 0 : d2;
      let s2 = nx * qx_ + ny * qy_ + nz * qz_; s2 = s2 > 0 ? SP2[(s2 * (TL - 1)) | 0] * (gl + 0.05) : 0;
      const g = (0.75 * d2 * (0.35 + 0.65 * sh)) * ls * al, g2 = s2 * ls * al * (0.4 + 0.6 * sh);
      gd[o] = ar * g * 1.02 + g2 * 210; gd[o + 1] = ag * g * 1.12 + g2 * 180; gd[o + 2] = ab * g * 1.2 + g2 * 140; gd[o + 3] = 255;
    }
  }
  T('pass2');
  const raw = L.makeCanvas(RW, RH); raw.getContext('2d').putImageData(img, 0, 0);
  const gain = L.makeCanvas(RW, RH); gain.getContext('2d').putImageData(gimg, 0, 0);

  // final: the pot + a faint lens bloom so the lit lip glows a little into the black
  const pot = L.makeCanvas(RW, RH), pg = pot.getContext('2d');
  pg.drawImage(raw, 0, 0);
  pg.globalCompositeOperation = 'screen'; pg.globalAlpha = 0.16;
  pg.drawImage(L.blurred(raw, 16), 0, 0);
  pg.globalCompositeOperation = 'source-over'; pg.globalAlpha = 1;
  T('compose');
  return { pot, gain, tmp: L.makeCanvas(RW, RH), X0, Y0, RW, RH };
}

export default {
  name: '砂锅药罐口沿',
  tone: 'light',
  init(env) {
    const t0 = performance.now();
    S = buildPot(env);
    console.warn('s12 init ms', Math.round(performance.now() - t0));
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    // the side light's pool travels along the lip from left to right
    const th = L.lerp(-0.2, 0.13, L.ease.inOutQuad(p));
    const c = a.pt(th, -80);
    const tg = S.tmp.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'copy'; tg.drawImage(S.gain, 0, 0);
    tg.globalCompositeOperation = 'destination-in';
    tg.translate(c.x - S.X0, c.y - S.Y0); tg.rotate(th); tg.scale(2.1, 1);
    tg.fillStyle = L.radial(tg, 0, 0, 0, 340, [[0, 'rgba(0,0,0,1)'], [0.3, 'rgba(0,0,0,0.72)'], [0.65, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
    tg.fillRect(-3000, -3000, 6000, 6000);
    // slow push-in (exactly 1.0 at mid-shot so the lip edge sits on the arc)
    L.cam(ctx, env, { zoom: L.lerp(0.985, 1.015, p) }, () => {
      ctx.drawImage(S.pot, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(S.tmp, S.X0, S.Y0);
    });
    L.vignette(ctx, { strength: 0.2 });
  },
};
