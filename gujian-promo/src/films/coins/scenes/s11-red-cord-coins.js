// s11 — 红绳压岁钱. A bulging magenta silk bundle seen edge-on against candle light: the arc is its back-lit upper rim.
// Tucked just behind that rim sits a row of square-holed cash coins, each wrapped in thin red gauze and lit from behind into a
// translucent vermilion disc: a darker outer rim, a narrow darker rim round the hole, and the hole itself — a clean square
// window straight onto the flame, warm white in the middle, pale gold at the sides, with the thickness of the metal showing
// as a gold wall along two of its edges. A red cord twisted with gold thread laces the string: it shows in the gaps between
// the coins and passes behind each of them (a soft shadow through the metal that fades before the hole — never across it).
//
// Everything is shaded per pixel in init():
//   coins → a "transmission" value per pixel (metal thickness, patina, gauze threads, creases, the cord) looked up in a
//           candle-light ramp: deep crimson → vermilion → orange → flame. The flame sits behind the bundle near the crest,
//           so every disc is hottest on the flank that faces it and the string dims and softens toward the frame edges;
//   silk  → polar coordinates (s = distance along the arc, v = depth below it): an analytic height field of a few soft
//           folds and many fine gathers drawn toward the circle centre is lit from the upper left with a broad satin
//           sheen, then fine weft ribs that ride over the folds, and slubs, are laid on at full resolution. The focus
//           falls off toward the bottom of the frame and its two sides.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;
const CW = 13;                            // cord thickness (px)
const PITCH = 5.6;                        // gauze thread pitch (px)
const FOCUS = 110;                        // where the plane of focus crosses the string (px along the arc from the crest)
const CANDLE = { s: 150, below: 170 };    // the flame, hidden behind the bundle
let S = null;

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const defocus = (s) => 3.4 * sstep(320, 1100, Math.abs(s - FOCUS));

// s = px along the arc from the crest · r = radius · k = height of the centre above the arc ÷ r (the rest is sunk behind the silk)
// tilt = rotation of the square hole · ga = bias of the gauze threads · hue 0 vermilion … 1 crimson · gain = exposure · mot = patina
const COINS = [
  { s: -1194, r: 112, k: 0.50, tilt: 0.05, ga: 0.50, hue: 0.50, gain: 0.80, mot: 1.0 },
  { s: -918, r: 104, k: 0.50, tilt: -0.10, ga: -0.35, hue: 0.30, gain: 0.90, mot: 0.9 },
  { s: -700, r: 74, k: 0.62, tilt: 0.16, ga: 0.62, hue: 0.85, gain: 0.80, mot: 1.5 },
  { s: -484, r: 128, k: 0.46, tilt: -0.06, ga: 0.20, hue: 0.20, gain: 1.00, mot: 0.95 },
  { s: -222, r: 90, k: 0.58, tilt: 0.21, ga: -0.60, hue: 0.75, gain: 0.84, mot: 1.6 },
  { s: 110, r: 150, k: 0.52, tilt: -0.04, ga: 0.42, hue: 0.00, gain: 1.08, mot: 0.88 },
  { s: 350, r: 72, k: 0.66, tilt: -0.17, ga: -0.20, hue: 0.60, gain: 0.94, mot: 1.2 },
  { s: 568, r: 110, k: 0.48, tilt: 0.09, ga: 0.75, hue: 0.40, gain: 1.02, mot: 1.0 },
  { s: 826, r: 98, k: 0.56, tilt: -0.07, ga: -0.50, hue: 0.90, gain: 0.82, mot: 1.5 },
  { s: 1138, r: 124, k: 0.48, tilt: 0.12, ga: 0.30, hue: 0.50, gain: 0.86, mot: 1.0 },
];

function mkLut(stops, n = 512) {
  const f = L.makeRamp(stops), o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}

/** positions, lighting, cord geometry and gauze creases for every coin */
function layout(a) {
  const R = a.R, rr = L.rng('s11coins');
  const cs = COINS.map((c, i) => {
    const th = c.s / R, p = a.pt(th, c.k * c.r);
    // direction to the flame in the coin's own frame (+x along the arc, +y toward the circle centre)
    const vx = CANDLE.s - c.s, vy = c.k * c.r + CANDLE.below, vm = Math.hypot(vx, vy);
    const side = c.s <= FOCUS ? 1 : -1;
    return { ...c, i, th, x: p.x, y: p.y, seed: 3.7 + i * 11.3, cdx: vx / vm, cdy: vy / vm,
      rw: rr.range(0.1, 0.15), hs: rr.range(0.25, 0.305), iw: rr.range(0.058, 0.078), hotx: rr.range(-0.12, 0.12),
      // the back of the hole seen past the front of it: the coin leans back on the bundle and is seen a little from the side
      wx: side * c.r * rr.range(0.024, 0.044), wy: c.r * rr.range(0.05, 0.07),
      blur: defocus(c.s), hidden: p.x + c.r < -24 || p.x - c.r > W + 24 };
  });
  // the cord runs hole to hole; through each coin it keeps one straight heading (toward the neighbours on either side)
  cs.forEach((c, i) => {
    const A = cs[Math.max(0, i - 1)], B = cs[Math.min(cs.length - 1, i + 1)], m = Math.hypot(B.x - A.x, B.y - A.y);
    c.dx = (B.x - A.x) / m; c.dy = (B.y - A.y) / m;
  });
  for (const c of cs) {
    const ct = Math.cos(c.th), st = Math.sin(c.th);
    c.ux = c.dx * ct + c.dy * st; c.uy = -c.dx * st + c.dy * ct;         // cord heading in the coin frame
    // creases of the gauze, fanning up across the face from where it is tucked into the silk
    c.creases = [];
    const n = 3 + (c.r > 100 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const ph = L.lerp(-0.95, 0.95, (j + rr.range(0.15, 0.85)) / n);
      c.creases.push({ x0: rr.range(-0.3, 0.3) * c.r, y0: c.k * c.r + 0.06 * c.r, ux: Math.sin(ph), uy: -Math.cos(ph), len: c.r * rr.range(0.9, 1.7), amp: rr.range(0.05, 0.1) * rr.sign() });
    }
  }
  return cs;
}

/** one coin wrapped in gauze, shaded per pixel in screen orientation (so it is blitted without resampling) */
function buildCoin(c, a, nA, nB, lutV, lutC, lutG) {
  const r = c.r, M = Math.ceil(r * 1.05 + 10), N = M * 2;
  const img = new ImageData(N, N), d = img.data;
  const rx = Math.round(c.x), ry = Math.round(c.y), fx = c.x - rx, fy = c.y - ry;
  const ox = rx - M, oy = ry - M;
  const ct = Math.cos(c.th), st = Math.sin(c.th), ctl = Math.cos(c.tilt), stl = Math.sin(c.tilt), cg = Math.cos(c.ga), sg = Math.sin(c.ga);
  const hs = c.hs * r, hi = (c.hs + c.iw) * r, rIn0 = r * (1 - c.rw), crn = Math.max(2, 0.028 * r), grime = 0.07 * r + 2;
  const wxh = c.wx * ctl + c.wy * stl, wyh = -c.wx * stl + c.wy * ctl, wallW = Math.max(Math.abs(wxh), Math.abs(wyh));
  // a weak fill from the upper left gives the two raised rims their relief
  const LX = -0.5, LY = -0.86;
  const llx = LX * ct + LY * st, lly = -LX * st + LY * ct;             // light in the coin frame
  const lhx = llx * ctl + lly * stl, lhy = -llx * stl + lly * ctl;     // … in the hole frame
  const KW = L.TAU / PITCH, half = CW / 2;
  const hue = c.hue, gain = c.gain, mot = c.mot, sd = c.seed, cdx = c.cdx, cdy = c.cdy;
  const hot0x = (cdx * 0.3 + c.hotx) * r, hot0y = cdy * 0.3 * r, hotS = 1 / (0.85 * r * 0.85 * r);
  const core0x = cdx * 0.22 * hs, core0y = cdy * 0.22 * hs;             // the flame sits a little off the middle of each window
  const box = (ax, ay, hw, cr) => { const qx = ax - (hw - cr), qy = ay - (hw - cr); return Math.hypot(qx > 0 ? qx : 0, qy > 0 ? qy : 0) + Math.min(qx > qy ? qx : qy, 0) - cr; };
  // colour of the loose gauze at the silhouette
  const fi = ((cl01(0.7 * gain) * 511) | 0) * 3;
  const frR = lutV[fi] + (lutC[fi] - lutV[fi]) * hue, frG = lutV[fi + 1] + (lutC[fi + 1] - lutV[fi + 1]) * hue, frB = lutV[fi + 2] + (lutC[fi + 2] - lutV[fi + 2]) * hue;
  for (let j = 0; j < N; j++) {
    const Y = j + 0.5 - M - fy, ddy = a.cy - (oy + j + 0.5);
    for (let i = 0; i < N; i++) {
      const X = i + 0.5 - M - fx, ddx = ox + i + 0.5 - a.cx;
      const dr = Math.sqrt(ddx * ddx + ddy * ddy) - a.R;
      if (dr < -26) continue;                                           // hidden behind the silk
      const lx = X * ct + Y * st, ly = -X * st + Y * ct;                // coin frame: +x along the arc, +y toward the circle centre
      const rho = Math.sqrt(lx * lx + ly * ly);
      if (rho > r + 8) continue;
      const nx = lx / (rho || 1), ny = ly / (rho || 1);
      const rE = r + 0.9 * nA.n2(nx * 1.7 + sd, ny * 1.7 - sd);         // cast and worn, not turned on a lathe
      const disc = 1 - sstep(rE - 0.8, rE + 0.8, rho);
      let A = 0, cr = frR, cgn = frG, cb = frB;
      if (disc < 1) {                                                   // loose gauze round the edge catches the back light: a thin fringe, brightest on the flank nearest the flame
        const fr = 1 - sstep(rE - 0.5, rE + 5, rho);
        A = fr * fr * (0.1 + 0.36 * sstep(-0.5, 0.9, nx * cdx + ny * cdy)) * (0.8 + 0.3 * nB.n2(nx * 5 + sd, ny * 5));
      }
      if (disc > 0) {
        const hx = lx * ctl + ly * stl, hy = -lx * stl + ly * ctl, ahx = Math.abs(hx), ahy = Math.abs(hy);
        const sdH = box(ahx, ahy, hs, 1.3), sdI = box(ahx, ahy, hi, crn);
        const hole = 1 - sstep(-0.7, 0.7, sdH);
        const inner = 1 - sstep(-1.3, 1.3, sdI), rimI = inner - hole > 0 ? inner - hole : 0;
        const rIn = rIn0 + 1.3 * nA.n2(nx * 2.4 - sd, ny * 2.4 + sd);
        const rimO = sstep(rIn - 1.4, rIn + 1.4, rho);
        const hot = Math.exp(-((lx - hot0x) * (lx - hot0x) + (ly - hot0y) * (ly - hot0y)) * hotS);
        const lightF = (0.52 + 0.74 * hot) * (1 - 0.2 * sstep(0, 1, -(lx * cdx + ly * cdy) / r));
        // metal thickness → how much candle light comes through; grime gathers at the foot of both rims
        let t = 0.6 - 0.28 * rimO - 0.3 * rimI - 0.1 * sstep(r * 0.95, r, rho), gold = 0;
        if (rho < rIn) t -= 0.11 * Math.exp(-(rIn - rho) / grime);
        if (sdI > 0) t -= 0.11 * Math.exp(-sdI / grime) * (1 - rimO);
        // relief of the rims and of the rounded edge
        const tO = cl01((rho - (rIn - 2.4)) / 4.8), dO = (6 * tO * (1 - tO)) / 4.8;
        const tE = cl01((rho - (r - 4.5)) / 4.5), dE = (-6 * tE * (1 - tE)) / 4.5;
        let emb = -(dO + 0.8 * dE) * (lx * llx + ly * lly) / (rho || 1);
        const tI = cl01((sdI + 2.4) / 4.8), dI = (-6 * tI * (1 - tI)) / 4.8;
        emb += -dI * (ahx > ahy ? (hx > 0 ? lhx : -lhx) : (hy > 0 ? lhy : -lhy)) * (1 - hole);
        t += 0.26 * emb;
        if (emb > 0) gold = emb * 2.2;
        // patina: slow blotches, fine grain, crusty patches, a few thin bright veins, pits
        const u = lx / r, v = ly / r;
        const n1 = nA.fbm(u * 2.1 + sd, v * 2.1 - sd * 0.7, 4), n2 = nB.fbm(u * 7.5 - sd, v * 7.5 + 3.1, 3);
        const blot = sstep(0.02, 0.3, n1 + 0.45 * n2), vein = sstep(0.74, 0.93, nB.ridged(u * 3.1 + 9 + sd, v * 3.1, 2));
        const pc = nB.cell(u * 7 + sd, v * 7 - sd), pit = pc.id < 0.14 ? 1 - sstep(0.1, 0.3, pc.d) : 0;
        t += mot * (0.11 * n1 + 0.06 * n2 - 0.17 * blot + 0.07 * vein - 0.09 * pit) * (1 - 0.45 * rimO) + 0.06 * nB.n2(u * 0.9 + sd, v * 0.9 + 1.7);
        // the cord passes behind: a soft shadow seen through the metal, fading out before the hole (it drops away from the back of the coin there)
        const al = Math.abs(lx * c.ux + ly * c.uy), ape = Math.abs(-lx * c.uy + ly * c.ux);
        t -= 0.075 * (1 - sstep(half - 3, half + 7, ape)) * sstep(hi + 3, hi + 0.5 * (r - hi), al) * (1 - 0.5 * rimO);
        t *= lightF;
        // creases in the gauze
        for (const q of c.creases) {
          const qx = lx - q.x0, qy = ly - q.y0, ql = qx * q.ux + qy * q.uy;
          if (ql < 0 || ql > q.len) continue;
          const e = (-qx * q.uy + qy * q.ux) / (1.8 + ql * 0.02);
          if (e * e > 9) continue;
          t += q.amp * e * Math.exp(-e * e) * sstep(0, 0.25 * r, ql) * (1 - sstep(q.len * 0.6, q.len, ql));
        }
        // gauze threads: thin dark lines, open and bright between them; here and there a thread crossing glints
        const gx = lx * cg + ly * sg, gy = -lx * sg + ly * cg;
        const gxx = gx + 3.4 * nA.n2(lx / (r * 0.55) + sd, ly / (r * 0.55) - sd), gyy = gy + 3.4 * nB.n2(lx / (r * 0.5) - sd, ly / (r * 0.5) + sd * 0.5);   // the cloth is pulled this way and that
        const thx = sstep(0.45, 0.95, 0.5 + 0.5 * Math.cos(gxx * KW)) * (0.72 + 0.4 * nB.n2(Math.round(gxx / PITCH) * 3.17, sd));           // no two threads the same weight
        const thy = sstep(0.45, 0.95, 0.5 + 0.5 * Math.cos(gyy * KW)) * (0.72 + 0.4 * nA.n2(Math.round(gyy / PITCH) * 3.17, -sd));
        const cov = thx > thy ? thx : thy;
        const slub = 0.5 * nB.n2(gx * 0.33 + sd, gy * 0.012) + 0.5 * nB.n2(gx * 0.012 - sd, gy * 0.33);
        const sc = nA.cell(gx / 13 + sd, gy / 13 - sd), spark = sc.id > 0.93 ? 1 - sstep(0.08, 0.22, sc.d) : 0;
        t *= 1 - 0.12 * (cov - 0.36) + 0.05 * slub;
        t += 0.2 * spark * lightF * (1 - 0.6 * rimO);
        t *= gain * (1 - 0.2 * Math.exp(-(dr > 0 ? dr : 0) / 6));     // the cloth presses against the foot of the coin and shades it
        const li = ((cl01(t) * 511) | 0) * 3;
        let bR = lutV[li] + (lutC[li] - lutV[li]) * hue, bG = lutV[li + 1] + (lutC[li + 1] - lutV[li + 1]) * hue, bB = lutV[li + 2] + (lutC[li + 2] - lutV[li + 2]) * hue;
        // gold where the fill light catches a bevel
        const gm = cl01(gold) * 0.5;
        bR += (255 - bR) * gm * 0.9; bG += (205 - bG) * gm; bB += (120 - bB) * gm;
        // the silk throws a little magenta back up onto the foot of the coin
        const bnc = 0.32 * Math.exp(-(dr > 0 ? dr : 0) / 26);
        bG *= 1 - 0.3 * bnc; bB += (140 - bB) * bnc * 0.6;
        if (hole > 0) {
          // the hole: a square window straight onto the flame. Past its front edge the back edge shows, shifted by the lean
          // of the coin, and between the two lies the thickness of the metal — a gold wall along two sides.
          const sdB = box(Math.abs(hx - wxh), Math.abs(hy - wyh), hs, 1.2);
          const thru = 1 - sstep(-1.4, 1.2, sdB);
          const cxh = hx - core0x, cyh = hy - core0y;
          const core = cl01(1.08 * Math.exp(-(cxh * cxh + cyh * cyh) / (hs * hs * 0.62)) - 0.12 * Math.exp(sdB / 5));
          const gz = 1 - 0.04 * (cov - 0.36);
          const wT = cl01(0.62 - 0.5 * cl01(sdB / wallW) + 0.07 * n2), wi = ((wT * 511) | 0) * 3;
          const hR = lutG[wi] + (255 * gz - lutG[wi]) * thru, hG = lutG[wi + 1] + ((204 + 36 * core) * gz - lutG[wi + 1]) * thru, hB = lutG[wi + 2] + ((118 + 88 * core) * gz - lutG[wi + 2]) * thru;
          bR += (hR - bR) * hole; bG += (hG - bG) * hole; bB += (hB - bB) * hole;
        }
        cr = bR * disc + frR * (1 - disc); cgn = bG * disc + frG * (1 - disc); cb = bB * disc + frB * (1 - disc);
        A = disc + (1 - disc) * A;
      }
      if (A <= 0.003) continue;
      const o = (j * N + i) * 4;
      d[o] = cr; d[o + 1] = cgn; d[o + 2] = cb; d[o + 3] = A * 255;
    }
  }
  const cnv = L.makeCanvas(N, N);
  cnv.getContext('2d').putImageData(img, 0, 0);
  if (c.blur > 0.25) {                                                  // off the plane of focus
    const m = Math.ceil(c.blur * 3), b = L.makeCanvas(N + m * 2, N + m * 2), bg = b.getContext('2d');
    bg.filter = `blur(${c.blur.toFixed(2)}px)`; bg.drawImage(cnv, m, m); bg.filter = 'none';
    c.sprite = b; c.ox = ox - m; c.oy = oy - m;
  } else { c.sprite = cnv; c.ox = ox; c.oy = oy; }
}

/** the exposed cord between two coins: red strands with a gold thread laid in, lit from behind. Returns {cnv, x, y}. */
function ropeSprite(A, B) {
  const gap = Math.max(0, Math.hypot(B.x - A.x, B.y - A.y) - A.r - B.r), hA = A.r + gap * 0.4, hB = B.r + gap * 0.4;
  const thm = (A.th + B.th) / 2, sag = 2 + gap * 0.09, sx = -Math.sin(thm) * sag, sy = Math.cos(thm) * sag;   // it hangs a little toward the bundle
  const P = [[A.x, A.y], [A.x + A.dx * hA + sx, A.y + A.dy * hA + sy], [B.x - B.dx * hB + sx, B.y - B.dy * hB + sy], [B.x, B.y]];
  const N = 100, pts = [], len = [0];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t, b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
    pts.push([b0 * P[0][0] + b1 * P[1][0] + b2 * P[2][0] + b3 * P[3][0], b0 * P[0][1] + b1 * P[1][1] + b2 * P[2][1] + b3 * P[3][1]]);
  }
  for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len[N], h = CW / 2;
  const at = (l) => {
    l = L.clamp(l, 0, total); let i = 1; while (i < N && len[i] < l) i++;
    const k = (l - len[i - 1]) / (len[i] - len[i - 1] || 1);
    let tx = pts[i][0] - pts[i - 1][0], ty = pts[i][1] - pts[i - 1][1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    return { x: L.lerp(pts[i - 1][0], pts[i][0], k), y: L.lerp(pts[i - 1][1], pts[i][1], k), nx: ty, ny: -tx };   // n points away from the circle centre ("up")
  };
  // only the stretch between the two discs shows (plus a little tucked under their edges)
  const l0 = Math.max(0, A.r - 16), l1 = Math.min(total, total - B.r + 16);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let l = l0; l <= l1 + 4; l += 4) { const p = at(l); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const blur = (A.blur + B.blur) / 2, mg = Math.ceil(CW + 12 + blur * 3);
  x0 = Math.floor(x0 - mg); y0 = Math.floor(y0 - mg); x1 = Math.ceil(x1 + mg); y1 = Math.ceil(y1 + mg);
  const cnv = L.makeCanvas(x1 - x0, y1 - y0), g = cnv.getContext('2d');
  g.translate(-x0, -y0);
  const rr = L.rng('s11rope' + A.i);
  g.lineJoin = 'round'; g.lineCap = 'butt';
  // the shaded core
  g.strokeStyle = '#3a0412'; g.lineWidth = CW - 2;
  g.beginPath(); for (let l = l0; l <= l1; l += 3) { const p = at(l); if (l === l0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); } g.stroke();
  // three plies, one of them wound with gold: each shows as a slanted lozenge, glowing where the light from behind grazes its edges
  g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    let k = 0;
    for (let l = l0 - CW; l < l1 + CW; l += 4.7, k++) {
      const gold = pass === 1;
      if (gold && k % 3 !== 1) continue;
      const b = at(l - h * 0.95), m = at(l), t = at(l + h * 0.95);
      const bx = b.x - b.nx * (h - 1), by = b.y - b.ny * (h - 1), tx = t.x + t.nx * (h - 1), ty = t.y + t.ny * (h - 1);
      const gr = g.createLinearGradient(bx, by, tx, ty), j = rr.range(-0.05, 0.05);
      if (gold) { gr.addColorStop(0, 'rgba(150,84,20,0)'); gr.addColorStop(0.25, '#9a5a16'); gr.addColorStop(0.55 + j, '#E0B04A'); gr.addColorStop(0.72, '#ffe2a0'); gr.addColorStop(0.9, '#d89a3c'); gr.addColorStop(1, 'rgba(216,154,60,0)'); }
      else { gr.addColorStop(0, '#c42a1c'); gr.addColorStop(0.16, '#6e081a'); gr.addColorStop(0.5 + j, '#94101c'); gr.addColorStop(0.82, '#d83222'); gr.addColorStop(1, '#f55a34'); }
      g.strokeStyle = gr; g.lineWidth = gold ? 1.7 : 4.6 + rr.range(-0.4, 0.4);
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(m.x, m.y, tx, ty); g.stroke();
    }
  }
  // the gold thread glints once or twice along the way
  for (let l = l0 + 16 + rr.range(0, 14); l < l1 - 14; l += rr.range(26, 60)) {
    const p = at(Math.round(l / 14.1) * 14.1 + 4.7), gx = p.x + p.nx * 1.5, gy = p.y + p.ny * 1.5, gr = rr.range(1.8, 2.8);
    g.fillStyle = L.radial(g, gx, gy, 0, gr, [[0, 'rgba(255,246,206,0.95)'], [0.5, 'rgba(255,224,150,0.5)'], [1, 'rgba(255,200,110,0)']]);
    g.beginPath(); g.arc(gx, gy, gr, 0, L.TAU); g.fill();
  }
  // stray fibres standing off the cord, lit from behind
  g.lineWidth = 1.3;
  for (let l = l0 + 6; l < l1 - 4; l += rr.range(7, 19)) {
    const p = at(l), up = rr.sign(), ln = rr.range(3, 8), lean = rr.range(-5, 5);
    const bx = p.x + p.nx * up * (h - 0.5), by = p.y + p.ny * up * (h - 0.5), ex = bx + p.nx * up * ln - p.ny * lean, ey = by + p.ny * up * ln + p.nx * lean;
    g.strokeStyle = L.linear(g, bx, by, ex, ey, [[0, 'rgba(255,128,84,0.6)'], [1, 'rgba(255,90,60,0)']]);
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + p.nx * up * ln * 0.7, by + p.ny * up * ln * 0.7, ex, ey); g.stroke();
  }
  if (blur > 0.25) {
    const b = L.makeCanvas(cnv.width, cnv.height), bg = b.getContext('2d');
    bg.filter = `blur(${blur.toFixed(2)}px)`; bg.drawImage(cnv, 0, 0); bg.filter = 'none';
    return { cnv: b, x: x0, y: y0 };
  }
  return { cnv, x: x0, y: y0 };
}

/** all coins and the cord on one layer, with a little halation baked in */
function buildCoins(env, coins) {
  const a = env.arc;
  const nA = L.makeNoise('s11a'), nB = L.makeNoise('s11b');
  const lutV = mkLut([[0, '#190106'], [0.14, '#5a0509'], [0.3, '#a40f10'], [0.46, '#DC2A1A'], [0.6, '#f6451f'], [0.72, '#FF6A3D'], [0.84, '#ff9a50'], [0.93, '#ffcf88'], [1, '#fff2d4']]);
  const lutC = mkLut([[0, '#170108'], [0.14, '#560414'], [0.3, '#9c0a1e'], [0.46, '#d01a26'], [0.6, '#ee3432'], [0.72, '#ff5a44'], [0.84, '#ff9058'], [0.93, '#ffcd8e'], [1, '#fff2d6']]);
  const lutG = mkLut([[0, '#4a1c06'], [0.3, '#9a4f12'], [0.55, '#d0902e'], [0.75, '#E0B04A'], [0.9, '#f6d27e'], [1, '#ffe9ae']]);
  for (const c of coins) if (!c.hidden) buildCoin(c, a, nA, nB, lutV, lutC, lutG);
  const layer = L.makeLayer(PAD, (g) => {
    for (let i = 0; i < coins.length - 1; i++) {
      if (coins[i].hidden && coins[i + 1].hidden) continue;
      const rp = ropeSprite(coins[i], coins[i + 1]);
      g.drawImage(rp.cnv, rp.x, rp.y);
    }
    for (const c of coins) if (!c.hidden) g.drawImage(c.sprite, c.ox, c.oy);
    // halation: the holes are the brightest things in the frame and bloom a little onto the metal round them
    g.globalCompositeOperation = 'screen';
    for (const c of coins) {
      if (c.hidden) continue;
      const rad = c.r * 0.82;
      g.fillStyle = L.radial(g, c.x, c.y, c.hs * c.r * 0.6, rad, [[0, 'rgba(255,200,128,0.15)'], [0.45, 'rgba(255,124,64,0.07)'], [1, 'rgba(255,80,40,0)']]);
      g.beginPath(); g.arc(c.x, c.y, rad, 0, L.TAU); g.fill();
    }
  });
  const bloom = L.blurred(layer, 20), g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.13; g.drawImage(bloom, 0, 0); g.restore();
  return layer;
}

/** the silk bundle: everything below the arc */
function buildSilk(env, coins) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0;

  // 1) relief of the cloth on a polar grid: s along the arc × v below it (px)
  const GS = 2, SMAX = 1300, V0 = -6, VMAX = 626;
  const ns = Math.floor((2 * SMAX) / GS) + 2, nv = Math.floor((VMAX - V0) / GS) + 2;
  const Hm = new Float32Array(ns * nv);
  const splat = (s0, s1, v0, v1, fn) => {
    const i0 = Math.max(0, Math.floor((s0 + SMAX) / GS)), i1 = Math.min(ns - 1, Math.ceil((s1 + SMAX) / GS));
    const j0 = Math.max(0, Math.floor((v0 - V0) / GS)), j1 = Math.min(nv - 1, Math.ceil((v1 - V0) / GS));
    for (let j = j0; j <= j1; j++) { const v = V0 + j * GS; for (let i = i0; i <= i1; i++) Hm[j * ns + i] += fn(i * GS - SMAX, v); }
  };
  const rf = L.rng('s11folds'), nD = L.makeNoise('s11drape');
  // a few folds gathering toward the circle centre: each starts a little below the rim and deepens and widens as the cloth is drawn in
  const folds = [];
  for (let s = -SMAX - 120; s < SMAX + 120;) {
    s += rf.range(150, 380);
    folds.push({ s0: s, v0: rf.range(18, 110), rise: rf.range(120, 300), w0: rf.range(22, 46), amp: rf.range(6, 13), bend: rf.range(-0.07, 0.07), side: rf.sign(), wa: rf.range(4, 12), wl: rf.range(90, 170), ph: rf.range(0, 6.28) });
    if (rf.chance(0.7)) folds.push({ s0: s + rf.range(-130, 130), v0: rf.range(150, 330), rise: rf.range(120, 240), w0: rf.range(15, 26), amp: rf.range(3.5, 7), bend: rf.range(-0.12, 0.12), side: rf.sign(), wa: rf.range(3, 8), wl: rf.range(70, 140), ph: rf.range(0, 6.28) });
  }
  for (const f of folds) {
    const span = Math.abs(f.bend) * (VMAX - f.v0) + f.wa + f.w0 * 1.9 * 4.2;
    splat(f.s0 - span, f.s0 + span, f.v0, VMAX + GS, (s, v) => {
      const k = v - f.v0, grow = sstep(0, f.rise, k);
      const w = f.w0 * (0.5 + 0.5 * grow) * (1 + k / 700);
      const x = (s - (f.s0 + f.bend * k + f.wa * Math.sin(k / f.wl + f.ph))) / w;
      if (x * x > 14) return 0;
      const xv = x - f.side * 1.75;
      return f.amp * grow * (Math.exp(-x * x) - 0.5 * Math.exp(-xv * xv / 0.8));
    });
  }
  // … and many fine gathers between them, shallow and soft, each running its own length
  for (let s = -SMAX; s < SMAX;) {
    s += rf.range(28, 84);
    const q = { s0: s, v0: rf.range(30, 380), len: rf.range(140, 420), w0: rf.range(8, 13), amp: rf.range(0.9, 1.8), bend: rf.range(-0.09, 0.09), side: rf.sign(), wa: rf.range(2, 6), wl: rf.range(60, 130), ph: rf.range(0, 6.28) };
    const span = Math.abs(q.bend) * q.len + q.wa + q.w0 * 1.6 * 4.2;
    splat(q.s0 - span, q.s0 + span, q.v0, q.v0 + q.len, (s2, v) => {
      const k = v - q.v0, w = q.w0 * (1 + k / 600);
      const x = (s2 - (q.s0 + q.bend * k + q.wa * Math.sin(k / q.wl + q.ph))) / w;
      if (x * x > 14) return 0;
      const xv = x - q.side * 1.75;
      return q.amp * sstep(0, 90, k) * (1 - sstep(q.len * 0.55, q.len, k)) * (Math.exp(-x * x) - 0.5 * Math.exp(-xv * xv / 0.8));
    });
  }
  // a slow swell under everything, and the faint crinkle of thin silk
  splat(-SMAX, SMAX, 0, VMAX + GS, (s, v) => 2.4 * nD.fbm(s / 300, v / 700 + 3.3, 2) * sstep(10, 160, v)
    + (0.3 * nD.fbm(s / 55 + 5, v / 260, 2) + 0.16 * (nD.ridged(s / 34 + 11, v / 170 - 5, 2) - 0.55)) * sstep(4, 70, v));
  // every coin presses a shallow dent into the cushion and pulls short wrinkles out of it
  for (const c of coins) {
    const chord = c.r * Math.sqrt(1 - c.k * c.k);
    splat(c.s - 2.2 * chord, c.s + 2.2 * chord, V0, 170, (s, v) => { const e = (s - c.s) / (chord * 0.9); return -4.5 * Math.exp(-e * e) * Math.exp(-(v > 0 ? v : 0) / 55); });
    const n = 3 + (c.r > 100 ? 2 : 1);
    for (let q = 0; q < n; q++) {
      const u = ((q + rf.range(0.2, 0.8)) / n) * 2 - 1;
      const sw = c.s + u * chord * 1.05, slope = u * 0.75 + rf.range(-0.15, 0.15), len = c.r * rf.range(0.5, 1.3), w = rf.range(5, 9), amp = rf.range(1.8, 3.6);
      splat(Math.min(sw, sw + slope * len) - 5 * w, Math.max(sw, sw + slope * len) + 5 * w, 2, 2 + len, (s, v) => {
        const k = v - 2, x = (s - (sw + slope * k)) / (w * (1 + k / 90));
        if (x * x > 12) return 0;
        return amp * sstep(0, 16, k) * (1 - sstep(len * 0.45, len, k)) * (Math.exp(-x * x) - 0.45 * Math.exp(-(x - 1.6) * (x - 1.6)));
      });
    }
  }
  const Gs = new Float32Array(ns * nv), Gv = new Float32Array(ns * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < ns; i++) {
    const k = j * ns + i;
    Gs[k] = (Hm[k + (i < ns - 1 ? 1 : 0)] - Hm[k - (i > 0 ? 1 : 0)]) / (2 * GS);
    Gv[k] = (Hm[k + (j < nv - 1 ? ns : 0)] - Hm[k - (j > 0 ? ns : 0)]) / (2 * GS);
  }
  // along the rim: where a coin stands it blocks the back light and presses the edge down a hair
  const nF = L.makeNoise('s11fuzz'), nS = L.makeNoise('s11slub');
  const dipA = new Float32Array(ns), shA = new Float32Array(ns), rimA = new Float32Array(ns), bandA = new Float32Array(ns), rwA = new Float32Array(ns);
  for (let i = 0; i < ns; i++) {
    const s = i * GS - SMAX;
    let dp = 0, sh = 0;
    for (const c of coins) {
      const ch = c.r * Math.sqrt(1 - c.k * c.k), e = Math.abs(s - c.s);
      const m = 1 - sstep(ch * 0.72, ch * 1.2, e); if (m > sh) sh = m;
      const q = (1 - sstep(ch * 0.5, ch * 1.35, e)) * Math.min(4, c.r * 0.034); if (q > dp) dp = q;
    }
    dipA[i] = dp + 0.7 + 0.7 * nF.n2(s / 55, 4.4); shA[i] = sh;                   // a sewn edge is never a ruled line
    rimA[i] = 0.85 + 0.15 * nF.n2(s / 85, 9.3);
    rwA[i] = 1 / (26 * (1 + 0.38 * nF.n2(s / 150, 6.1)));                              // the glowing band swells and thins along the rim
    bandA[i] = 0.75 + 0.45 * nF.n2(s / 420 + 3, 1.3);
  }

  // 2) shade
  const LUT = mkLut([[0, '#10010a'], [0.14, '#3a0520'], [0.3, '#780a40'], [0.46, '#C2186A'], [0.6, '#dc2076'], [0.72, '#f0408c'], [0.84, '#ff80b0'], [0.93, '#ffc2d6'], [1, '#fff0f3']]);
  const img = new ImageData(RW, RH), d = img.data;
  const LX = -0.6, LY = -0.8, KL = 1.0, KR = L.TAU / 4.4, KP = L.TAU / 5.2;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), v = R - rr;
      if (v < -1.3) continue;
      const s = Math.atan2(ddx, ddy) * R;
      let fi = (s + SMAX) / GS; fi = fi < 0 ? 0 : fi > ns - 1.001 ? ns - 1.001 : fi;
      const i0 = fi | 0, tx = fi - i0;
      const ve = v - (dipA[i0] + (dipA[i0 + 1] - dipA[i0]) * tx);
      if (ve < -1.3) continue;
      const al = ve < 1 ? sstep(-0.9, 0.9, ve) : 1;                       // the limb, anti-aliased
      const vp = ve > 0 ? ve : 0;
      let fj = (vp - V0) / GS; fj = fj > nv - 1.001 ? nv - 1.001 : fj;
      const j0 = fj | 0, ty = fj - j0, k = j0 * ns + i0;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const h = Hm[k] * w00 + Hm[k + 1] * w10 + Hm[k + ns] * w01 + Hm[k + ns + 1] * w11;
      const hs = Gs[k] * w00 + Gs[k + 1] * w10 + Gs[k + ns] * w01 + Gs[k + ns + 1] * w11;
      const hv = Gv[k] * w00 + Gv[k + 1] * w10 + Gv[k + ns] * w01 + Gv[k + ns + 1] * w11;
      const sinT = ddx / rr, cosT = ddy / rr, q = R / rr;
      const gx = hs * q * cosT - hv * sinT, gy = hs * q * sinT + hv * cosT;
      const lam = -(gx * LX + gy * LY) * KL, lamS = lam / (1 + 2 * Math.abs(lam));
      const sp = (lam - 0.13) / 0.11, spec = Math.exp(-sp * sp);        // the satin sheen sits on the shoulder of a fold that faces the light
      const dv = sstep(40, 620, vp), dy = 0.75 * sstep(620, 1150, Y0 + j), deep = dv > dy ? dv : dy;
      const rimK = (rimA[i0] + (rimA[i0 + 1] - rimA[i0]) * tx) * (1 - 0.5 * (shA[i0] + (shA[i0 + 1] - shA[i0]) * tx));
      const bv = (vp - 130) / 100;
      let tone = 0.47 - 0.21 * deep - 0.04 * (s - FOCUS) * (s - FOCUS) * 1e-6
        + rimK * (0.36 * Math.exp(-vp / 6) + 0.26 * Math.exp(-vp * (rwA[i0] + (rwA[i0 + 1] - rwA[i0]) * tx)) + 0.08 * Math.exp(-vp / 80))    // the back light soaking through the edge
        + 0.07 * Math.exp(-bv * bv) * (bandA[i0] + (bandA[i0 + 1] - bandA[i0]) * tx)                   // the bulge turning toward the lens
        - 0.045 * Math.exp(-(vp - 36) * (vp - 36) / 500);                                              // … after rolling over, darker, just under the glowing edge
      tone += sstep(2, 44, vp) * (0.7 * lamS + 0.12 * spec * (1 - 0.5 * deep) + 0.005 * h);
      // weave: the weft lies along the arc as fine ribs that ride over the folds and show more in one place than another;
      // a slub thickens a thread here and there; the warp is only just there
      const vv = v + 1.2 * h + 1.1 * nS.n2(s * 0.011, v * 0.05);
      const slub = nS.n2(s * 0.0045 + 7, vv * 0.31);
      tone += (0.014 * Math.cos(vv * KR) * (0.62 + 0.55 * nF.n2(s / 70 + 2, v / 46)) + 0.005 * Math.cos((s + 1.4 * nS.n2(s * 0.004 + 9, v * 0.03)) * KP)
        + 0.03 * sstep(0.45, 0.9, slub) - 0.012 * sstep(0.5, 0.9, -slub)) * (0.7 + 1.2 * spec);
      const li = ((cl01(tone) * 511) | 0) * 3, o = (j * RW + i) * 4;
      d[o] = LUT[li]; d[o + 1] = LUT[li + 1]; d[o + 2] = LUT[li + 2]; d[o + 3] = al * 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);
  const layer = L.makeLayer(PAD, (g) => { g.drawImage(cnv, X0, Y0); });
  const g = layer.getContext('2d');

  // 3) stray filaments standing off the edge, caught by the back light
  const fz = L.rng('s11fibre');
  g.save(); g.lineCap = 'round';
  for (let s = -1250; s < 1250;) {
    s += fz.range(10, 72);
    const len = 3 + 10 * Math.pow(fz(), 2.2), lean = fz.range(-1, 1) * len, curl = fz.range(-0.5, 0.5) * len, al = fz.range(0.2, 0.55);
    a.at(g, s / R, 0, () => {
      g.strokeStyle = L.linear(g, 0, 1, lean, -len, [[0, `rgba(255,196,218,${al})`], [0.5, `rgba(255,128,176,${al * 0.6})`], [1, 'rgba(255,90,150,0)']]);
      g.lineWidth = fz.range(1.2, 1.5);
      g.beginPath(); g.moveTo(0, 1.5); g.quadraticCurveTo(curl, -len * 0.55, lean, -len); g.stroke();
    });
  }
  g.restore();

  // 4) the coins' light soaks into the cloth under them
  const spill = L.makeLayer(PAD, (sg) => {
    for (const c of coins) {
      const rad = c.r * 2.1;
      sg.fillStyle = L.radial(sg, c.x, c.y, c.r * 0.3, rad, [[0, `rgba(255,84,56,${0.34 * c.gain})`], [0.45, `rgba(255,64,64,${0.14 * c.gain})`], [1, 'rgba(255,60,80,0)']]);
      sg.fillRect(c.x - rad, c.y - rad, rad * 2, rad * 2);
    }
  });
  L.overlayOn(layer, spill, { blend: 'screen', alpha: 0.8 });

  // 5) the back light blooms a little way over the rim
  g.save(); a.clipAbove(g, -7);
  g.fillStyle = L.radial(g, cx, cy, R - 7, R + 62, [[0, 'rgba(255,150,200,0.4)'], [0.1, 'rgba(255,150,200,0.4)'], [0.18, 'rgba(255,84,160,0.2)'], [0.4, 'rgba(232,40,128,0.07)'], [1, 'rgba(194,24,106,0)']]);
  g.globalCompositeOperation = 'destination-over';
  g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  g.restore();

  // 6) depth of field: sharp along the rim near the crest, softening toward the bottom of the frame and its two sides
  const xfade = (base, top, paint) => {
    const m = L.makeCanvas(base.width, base.height), mg = m.getContext('2d');
    mg.translate(PAD, PAD); paint(mg);
    const t = L.makeCanvas(base.width, base.height), tg = t.getContext('2d');
    tg.drawImage(top, 0, 0); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(m, 0, 0);
    const bg = base.getContext('2d');
    bg.save(); bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = 'destination-out'; bg.drawImage(m, 0, 0);
    bg.globalCompositeOperation = 'lighter'; bg.drawImage(t, 0, 0);
    bg.restore();
  };
  const xf = a.pt(FOCUS / R, 0).x;
  const mask = (vIn, vOut, d0, d1) => (mg) => {
    mg.fillStyle = L.radial(mg, cx, cy, R - vOut, R - vIn, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    mg.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    mg.fillStyle = L.linear(mg, xf - d1, 0, xf - d0, 0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    mg.fillRect(-PAD, -PAD, xf - d0 + PAD, H + PAD * 2);
    mg.fillStyle = L.linear(mg, xf + d0, 0, xf + d1, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    mg.fillRect(xf + d0, -PAD, W + PAD - (xf + d0), H + PAD * 2);
  };
  const soft = L.blurred(layer, 2.6), softer = L.blurred(layer, 7);
  xfade(layer, soft, mask(150, 430, 500, 1050));
  xfade(layer, softer, mask(420, 700, 950, 1400));
  return layer;
}

/** red dust hanging in the dark above the rim: a few motes near the plane of focus, a few far ones blown up into soft discs */
function buildDust(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const r = L.rng('s11dust');
    for (let n = 0; n < 12; n++) {
      const x = r.range(-PAD, W + PAD), up = 40 + Math.pow(r(), 1.3) * 560, y = a.yAt(x) - up, rad = r.range(7, 20), al = r.range(0.035, 0.085) * (1 - up / 900);
      const col = r.pick(['#E0301E', '#FF6A3D', '#C2186A']);
      g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al * 0.75)], [0.72, L.rgba(col, al)], [0.9, L.rgba(col, al * 1.25)], [1, L.rgba(col, 0)]]);
      g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
    }
    for (let n = 0; n < 60; n++) {
      const x = r.range(-PAD, W + PAD), up = 14 + Math.pow(r(), 1.9) * 600, y = a.yAt(x) - up, rad = L.lerp(1.4, 3.2, Math.pow(r(), 2.2)), al = r.range(0.35, 0.9) * (1 - up / 800);
      const col = r.pick(['#E0301E', '#FF6A3D', '#C2186A', '#ff3a52']);
      g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al)], [0.45, L.rgba(col, al * 0.7)], [1, L.rgba(col, 0)]]);
      g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
    }
  });
}

export default {
  name: '红绳压岁钱',
  tone: 'light',
  init(env) {
    const coins = layout(env.arc);
    S = { coins, coinLayer: buildCoins(env, coins), silk: buildSilk(env, coins), dust: buildDust(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.007, 0.007, p);
    ctx.fillStyle = '#050304'; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.dust, { rot: rot * 0.45, dy: -5 * p });
    L.blit(ctx, env, S.coinLayer, { rot });
    // the candle behind wavers: each disc swells and sinks in turn along the string
    const fl = (c) => 0.5 + 0.5 * Math.sin(L.TAU * (p * 1.15 - c.i * 0.19) + 0.6);
    L.cam(ctx, env, { rot }, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (const c of S.coins) { if (c.hidden) continue; ctx.globalAlpha = 0.02 + 0.16 * fl(c); ctx.drawImage(c.sprite, c.ox, c.oy); }
    });
    L.blit(ctx, env, S.silk, { rot });
    // … and so does the glow each one sheds on the silk beneath it
    L.cam(ctx, env, { rot }, () => {
      a.clipBelow(ctx, -1.5);
      ctx.globalCompositeOperation = 'lighter';
      for (const c of S.coins) {
        if (c.hidden) continue;
        const rad = c.r * 1.9, f = fl(c);
        ctx.fillStyle = L.radial(ctx, c.x, c.y, c.r * 0.3, rad, [[0, `rgba(255,84,48,${0.03 + 0.13 * f})`], [1, 'rgba(255,60,60,0)']]);
        ctx.fillRect(c.x - rad, c.y - rad, rad * 2, rad * 2);
      }
    });
  },
};
