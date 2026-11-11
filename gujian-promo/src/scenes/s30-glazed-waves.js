// s30 — 琉璃海水纹. A glazed-tile (琉璃) relief of sea waves, seen CLOSE and lit from the upper left.
// Above the arc: one clean field of bright imperial yellow (明黄) glaze — glassy, a faint open crazing (开片), two or
// three spalls down to the pale clay body, a few scratches. Nothing else.
// The arc itself: the crest line of the top row of waves — a white foam lip (its outer edge is the arc) on a cobalt bead.
// Below it, top → bottom (the traditional order): curling spray volutes (浪花) → rows of big concentric half-round
// billows (平水, growing with depth) → slanted parallel ribs (立水) at the very bottom. Emerald green carries the lower
// half; cobalt stays under the crest (bead, volute channels, the first band) and in the billows' hearts; white is foam only.
// A little spray of white beads jumps above the arc, well to the left and right of the title.
// The relief is a tiny height-field renderer: init() evaluates colour + height per pixel in the arc's polar frame,
// then lights it (diffuse + glassy specular + sky sheen + contact shadows) and pulls focus (sharp at the crest, soft
// toward the corners). draw() only blits and cross-fades two lightings.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 64;                        // the move is only a few px of rot + a breath of zoom
const LW = W + PAD * 2, LH = H + PAD * 2;
const RIM = 25, LIP = 9.5;             // the crest moulding that rides the arc: a white foam lip (its outer edge IS the arc) over a cobalt bead
// rows of billows, nearest the arc first: [radius, depth of the apex below the arc]. The last row is the 立水:
// big arches whose foam lip trims a field of slanted ribs.
const ROWS = [[178, 22], [216, 152], [262, 276], [340, 404]];
const LI_ROW = 3, LI_LIP = 34;         // the 立水 row and the width (px) of its foam lip
const VR = 88;                         // spray volute radius
let S = null;

// ───────────── glaze colours (albedo, 0..1) ─────────────
const rgb = (c) => { const p = L.parseColor(c); return [p[0] / 255, p[1] / 255, p[2] / 255]; };
const WH = [[0.8, 0.89, 0.86], [1, 0.985, 0.95]];        // foam white (thin on the ridge, a breath of celadon where it pools)
const GR = [rgb('#04583a'), rgb('#22bc62')];            // emerald
const G2 = [rgb('#05462a'), rgb('#0e8c50')];            // deep jade
const BL = [rgb('#102878'), rgb('#2c5ccc')];            // cobalt (霁蓝)
const DB = [rgb('#0a1a56'), rgb('#18348e')];            // cobalt heart
const DG = [rgb('#063c2a'), rgb('#0c6c46')];            // jade heart
const GRV = [0.012, 0.045, 0.07];      // the very bottom of a groove
const POOL = 0.36;                     // glaze pooled in a groove: the same glaze, this much darker
const BODY = rgb('#cdbd9a');           // the fired clay body where glaze has worn off
// bands of one billow from its free edge inwards (fraction of its radius)
const EDGES = [1, 0.91, 0.68, 0.45, 0.22, 0];
const NB = EDGES.length - 2;           // index of the innermost band (the domed heart)
const PAL = [
  [WH, GR, G2, GR, DG],                // emerald billow
  [WH, G2, GR, G2, DG],                // jade billow
  [WH, GR, G2, GR, DG],                // the top row, under the spray
];
const GW = 3.2;                        // px over which glaze thins out of a groove

// sample outputs (module-level to keep the per-pixel loop allocation-free)
let oR = 0, oG = 0, oB = 0, oH = 0, oGl = 0, oTop = 0;

/** glaze colour: P = [pooled, thin] colour pair, k = 0 groove side … 1 ridge top, m = tone, g = 0 in the groove … 1 clear of it */
function glz(P, k, m, g) {
  const lo = P[0], hi = P[1];
  const pr = lo[0] * POOL + GRV[0], pg = lo[1] * POOL + GRV[1], pb = lo[2] * POOL + GRV[2];
  oR = pr + ((lo[0] + (hi[0] - lo[0]) * k) * m - pr) * g;
  oG = pg + ((lo[1] + (hi[1] - lo[1]) * k) * m - pg) * g;
  oB = pb + ((lo[2] + (hi[2] - lo[2]) * k) * m - pb) * g;
  oGl = 0.4 + 0.6 * g;
}

/** one 平水 billow: concentric rounded ridges. t = 0 at its centre … 1 at its free edge */
function sampleScale(t, r, v, tone) {
  let i = 0;
  while (i < NB && t < EDGES[i + 1]) i++;
  const e0 = EDGES[i], e1 = EDGES[i + 1], bw = (e0 - e1) * r;
  let u = (e0 - t) / (e0 - e1); if (u < 0) u = 0; else if (u > 1) u = 1;
  let s, edgePx;
  if (i === NB) { s = Math.sqrt(1 - (1 - u) * (1 - u)); edgePx = u * bw; }          // domed heart
  else { s = Math.sin(Math.PI * u); edgePx = (u < 0.5 ? u : 1 - u) * bw; if (i === 0 && u < 0.5) edgePx = 99; }
  let g = edgePx / GW; if (g > 1) g = 1; g = g * g * (3 - 2 * g);
  glz(PAL[v][i], s * (0.5 + 0.5 * s), 1 + tone, g);
  const amp = (bw * 0.3 > 11 ? 11 : bw * 0.3) * (i === 0 ? 1.25 : 1);
  oH = amp * s * (1.3 - 0.3 * s) + 6 * t;         // each billow lifts toward its free edge, like an overlapping scale
  oTop = i === NB ? 0 : s;
}

const VDUTY = 0.58, VEYE = 0.17;
/** a spray volute: a white foam arm winding clockwise into an eye, with a cobalt channel beside it */
function sampleVolute(t, phi, r, phs, tone, VW) {
  const eyePx = (t - VEYE) * r;
  const m = 1 + tone;
  if (eyePx < 0) {
    const u = t / VEYE, s = Math.sqrt(1 - u * u);
    let g = -eyePx / GW; if (g > 1) g = 1; g = g * g * (3 - 2 * g);
    glz(WH, s, m, g);
    oH = 2 + VEYE * r * 0.75 * s; oTop = s;
    return;
  }
  let b = (1 - t) / VW - (phi - phs) / L.TAU; b -= Math.floor(b);
  const white = b < VDUTY;
  const u = white ? b / VDUTY : (b - VDUTY) / (1 - VDUTY);
  const bw = (white ? VDUTY : 1 - VDUTY) * VW * r;
  const s = Math.sin(Math.PI * u);
  let edgePx = (u < 0.5 ? u : 1 - u) * bw; if (eyePx < edgePx) edgePx = eyePx;
  let g = edgePx / GW; if (g > 1) g = 1; g = g * g * (3 - 2 * g);
  glz(white ? WH : BL, s * (0.5 + 0.5 * s), m, g);
  oH = (white ? 1.3 : 0.5) * (bw * 0.32 > 10 ? 10 : bw * 0.32) * s * (1.3 - 0.3 * s);
  oTop = white ? s : 0;
}

/** the crest moulding on the arc. d = depth below the arc (px): white foam lip 0…LIP, then a rounded cobalt bead to RIM */
function sampleRim(d) {
  if (d < LIP) {
    const u = d < 0 ? 0 : d / LIP, x2 = 2 * u - 1, s = Math.sqrt(1 - x2 * x2), k = 1 - s;
    let g = (LIP - d) / 1.8; if (g > 1) g = 1; g = g * g * (3 - 2 * g);
    let am = 1 - u / 0.35; am = am < 0 ? 0 : am * 0.45;    // a little yellow glaze ran into the white along the very top
    const hi = WH[1];
    let r = hi[0] - 0.1 * k, gg = hi[1] - 0.06 * k, b = hi[2] - 0.05 * k;
    r += (0.99 - r) * am; gg += (0.84 - gg) * am; b += (0.3 - b) * am;
    const pr = BL[0][0] * POOL + GRV[0], pg = BL[0][1] * POOL + GRV[1], pb = BL[0][2] * POOL + GRV[2];
    oR = pr + (r - pr) * g; oG = pg + (gg - pg) * g; oB = pb + (b - pb) * g;
    oH = 24 + 6 * s; oGl = 0.4 + 0.6 * g; oTop = s;
    return;
  }
  let u = (d - LIP) / (RIM - LIP); if (u > 1) u = 1;
  const x2 = 2 * u - 1, s = Math.sqrt(1 - x2 * x2);
  let g = (d - LIP < RIM - d ? d - LIP : RIM - d) / 2.4; if (g > 1) g = 1; else if (g < 0) g = 0; g = g * g * (3 - 2 * g);
  glz(BL, s * (0.5 + 0.5 * s), 1, g);
  oH = 24 + 10 * s; oTop = s;
}

const LI_SIN = Math.sin(L.deg(57)), LI_COS = Math.cos(L.deg(57)), LI_PER = 132;
/** the 立水 row: a white foam lip (t near 1) trimming the field of slanted ribs */
function sampleLishuiArch(t, r, s, d) {
  const lipPx = (1 - t) * r;
  if (lipPx < LI_LIP) {
    const u = lipPx / LI_LIP, sn = Math.sin(Math.PI * u);
    let g = u < 0.5 ? 1 : ((1 - u) * LI_LIP) / GW; if (g > 1) g = 1; g = g * g * (3 - 2 * g);
    glz(WH, sn * (0.5 + 0.5 * sn), 1, g);
    oH = 11 * sn * (1.3 - 0.3 * sn) + 6 * t; oTop = sn;
    return;
  }
  sampleLishui(s, d);
  let g = (lipPx - LI_LIP) / GW; if (g > 1) g = 1; g = g * g * (3 - 2 * g);
  oR *= 0.45 + 0.55 * g; oG *= 0.45 + 0.55 * g; oB *= 0.45 + 0.55 * g;
  oH = oH * g + 6 * t; oGl *= 0.5 + 0.5 * g;
}
/** 立水: parallel slanted ribs — emerald / jade / white / cobalt in turn. s = arc length from the crest, d = depth */
function sampleLishui(s, d) {
  const along = -s * LI_COS + d * LI_SIN;
  const q = (s * LI_SIN + d * LI_COS + 10 * Math.sin(along / 54)) / LI_PER;
  const f = (q - Math.floor(q)) * LI_PER;
  let u, bw, P;
  if (f < 50) { u = f / 50; bw = 50; P = GR; }
  else if (f < 84) { u = (f - 50) / 34; bw = 34; P = G2; }
  else if (f < 106) { u = (f - 84) / 22; bw = 22; P = WH; }
  else { u = (f - 106) / 26; bw = 26; P = BL; }
  const sn = Math.sin(Math.PI * u);
  let g = ((u < 0.5 ? u : 1 - u) * bw) / GW; if (g > 1) g = 1; g = g * g * (3 - 2 * g);
  glz(P, sn * (0.5 + 0.5 * sn), 1, g);
  oH = (bw * 0.3 > 11 ? 11 : bw * 0.3) * sn * (1.3 - 0.3 * sn);
  oTop = sn;
}

/** 1 inside the text-safe zone, easing to 0 about 110 px outside it (frame coordinates) */
function calm(env, x, y) {
  const cy = env.arc.crestY;
  const dx = x < 630 ? 630 - x : x > 1290 ? x - 1290 : 0, dy = y < cy - 260 ? cy - 260 - y : y > cy - 10 ? y - (cy - 10) : 0;
  const dd = Math.sqrt(dx * dx + dy * dy);
  return dd >= 110 ? 0 : 1 - L.smooth(dd / 110);
}

// ───────────── the relief: colour + height per pixel, in the arc's polar frame ─────────────
function buildField(env) {
  const a = env.arc, R = a.R;
  const cxL = a.cx + PAD, cyL = a.cy + PAD;
  const y0 = Math.max(0, Math.floor(a.crestY + PAD - 96));
  const fh = LH - y0, N = LW * fh;
  const rnd = L.rng('s30relief');
  const half = a.span(PAD + 220);

  const rows = ROWS.map(([r0, top], k) => {
    const c = top + r0, dth = (r0 * 1.94) / (R - c);
    const n = Math.ceil(half / dth) + 2, count = 2 * n + 1, ph = k % 2 ? 0.5 : 0;
    const row = { c, dth, n, count, ph, level: 5 + 10 * k, li: k === LI_ROW, lo: 0, hi: 0,
      x: new Float32Array(count), y: new Float32Array(count), r: new Float32Array(count), th: new Float32Array(count),
      tone: new Float32Array(count), pw: new Float32Array(count), ex: new Float32Array(count), vr: new Uint8Array(count) };
    let rmax = 0;
    for (let j = -n; j <= n; j++) {
      const i = j + n;
      const rr = r0 * (1 + rnd.range(-0.08, 0.09));
      const th = (j + ph + rnd.range(-0.07, 0.07)) * dth;
      const cc = k === 0 ? top + rr : c + rnd.range(-0.05, 0.05) * r0;
      row.th[i] = th; row.r[i] = rr;
      row.x[i] = cxL + (R - cc) * Math.sin(th); row.y[i] = cyL - (R - cc) * Math.cos(th);
      row.tone[i] = rnd.range(-0.13, 0.1);
      row.pw[i] = rnd.range(0.84, 1.22);         // no two billows are banded alike …
      row.ex[i] = rnd.range(0.93, 1.08);         // … or quite round
      row.vr[i] = k === 0 ? 2 : (k + (rnd.chance(0.3) ? 1 : 0)) % 2;
      if (rr > rmax) rmax = rr;
    }
    row.lo = c - rmax * 1.06 - 36; row.hi = c + rmax * 1.06 + 36;
    return row;
  });
  // spray volutes sit in front of the junctions of the top row, tucked up under the foam bead
  const r0w = rows[0], vcount = r0w.count - 1;
  const VX = new Float32Array(vcount), VY = new Float32Array(vcount), VRr = new Float32Array(vcount), VTH = new Float32Array(vcount), VPH = new Float32Array(vcount), VTONE = new Float32Array(vcount), VWv = new Float32Array(vcount);
  const drops = [];
  // how hard each visible curl throws spray (index = junction number from the crest; 0 → none). Uneven on purpose.
  const SPRAY = { '-3': 0.8, '-2': 1.3, 1: 0.95, 2: 1.2 };
  for (let i = 0; i < vcount; i++) {
    const th = (r0w.th[i] + r0w.th[i + 1]) / 2, rr = VR * (1 + rnd.range(-0.17, 0.15)), cc = RIM - 6 + rr + rnd.range(0, 9);
    VTH[i] = th; VRr[i] = rr; VX[i] = cxL + (R - cc) * Math.sin(th); VY[i] = cyL - (R - cc) * Math.cos(th);
    VPH[i] = 0.55 + rnd.range(-0.3, 0.3); VTONE[i] = rnd.range(-0.06, 0.05); VWv[i] = rnd.range(0.5, 0.66);
    // 浪花: a few white beads flung up and forward from the curl, each smaller than the last — only on curls far
    // enough from the centre that nothing can touch the title
    const j = i - r0w.n, fx = a.cx + R * Math.sin(th);
    if (Math.abs(fx - a.cx) < 420) continue;
    const big = SPRAY[j] === undefined ? 1 : SPRAY[j];
    const list = [[14, 9, 15], [40, 33, 10.5], [62, 58, 7], [-12, 44, 5.6], [86, 37, 4.6], [70, 86, 4]];
    for (let q = 0; q < list.length; q++) {
      if (q > 2 && rnd.chance(0.3)) continue;
      const [ox, up, dr] = list[q];
      const rr2 = dr * big * rnd.range(0.88, 1.12), up2 = up * big + rnd.range(-3, 3), t2 = th + (ox * big + rnd.range(-4, 4)) / R;
      drops.push({ x: cxL + (R + up2) * Math.sin(t2), y: cyL - (R + up2) * Math.cos(t2), r: rr2 });
    }
  }

  const Hh = new Float32Array(N), Al = new Float32Array(N), Oc = new Float32Array(N), Gl = new Float32Array(N);
  const Cr = new Float32Array(N), Cg = new Float32Array(N), Cb = new Float32Array(N);
  const fld = (opts) => L.noiseTex(LW, fh, opts).getContext('2d').getImageData(0, 0, LW, fh).data;
  const WXf = fld({ seed: 's30wx', scale: 300, octaves: 3, res: 0.1, contrast: 1.6 });
  const WYf = fld({ seed: 's30wy', scale: 300, octaves: 3, res: 0.1, contrast: 1.6 });
  const CHIP = fld({ seed: 's30chip', scale: 84, octaves: 3, res: 0.2, contrast: 1.7 });
  const MED = fld({ seed: 's30med', scale: 40, octaves: 2, res: 0.25, contrast: 1.4 });
  const MOT = fld({ seed: 's30mot', scale: 150, octaves: 3, res: 0.125, contrast: 1.5 });

  const S2x = 0.669, S2y = 0.743;       // direction the light travels across the surface (toward lower right)
  const K = rows.length, VLEVEL = 34, VMAXD = RIM + VR * 2.5 + 40;
  for (let py = 0; py < fh; py++) {
    const Y = py + y0 + 0.5, ddy = cyL - Y;
    for (let px = 0; px < LW; px++) {
      const X = px + 0.5, ddx = X - cxL;
      const d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < -0.5) continue;
      const i = py * LW + px, i4 = i * 4;
      const theta = Math.atan2(ddx, ddy);
      // hand-modelled wobble: rows wander a few px (none at the arc, which must stay exact)
      let wk = d / 170; if (wk > 1) wk = 1; const wamp = 15 * wk * wk * (3 - 2 * wk);
      const mot = MOT[i4] / 255, med = MED[i4] / 255, cn = CHIP[i4] / 255;
      const qx = X + (WXf[i4] / 255 - 0.5) * wamp + (cn - 0.5) * 0.3 * wamp, qy = Y + (WYf[i4] / 255 - 0.5) * wamp + (mot - 0.5) * 0.3 * wamp;
      let A = 0, ar = 0, ag = 0, ab = 0, ah = 0, agl = 0, aoc = 0, atop = 0, sh = 0, soft = 1;
      // 1) crest moulding on the arc
      if (d < RIM + 0.5) {
        const cov = d < RIM - 0.5 ? 1 : RIM + 0.5 - d;
        sampleRim(d);
        A = cov; ar = cov * oR; ag = cov * oG; ab = cov * oB; ah = cov * oH; agl = cov * oGl; atop = cov * oTop; soft = 0;
      }
      if (d > RIM - 0.5 && d < RIM + 28) {
        const e = d > RIM ? d - RIM : 0, f = 1 - e / 28;
        let cast = -Math.sin(theta) * S2x + Math.cos(theta) * S2y; if (cast < 0) cast = 0;
        const s1 = cast * f * f * 0.85, s2 = 0.5 * Math.exp(-e / 4.5);
        sh = s1 > s2 ? s1 : s2;
      }
      // 2) spray volutes
      if (A < 0.995 && d < VMAXD) {
        const jv = Math.round(theta / r0w.dth - 0.5) + r0w.n;
        if (jv >= 0 && jv < vcount) {
          const vx = qx - VX[jv], vy = qy - VY[jv], dist = Math.sqrt(vx * vx + vy * vy), rr = VRr[jv], e = dist - rr;
          if (e < 0.5) {
            const cov = e < -0.5 ? 1 : 0.5 - e, w = (1 - A) * cov;
            sampleVolute(dist / rr > 1 ? 1 : dist / rr, Math.atan2(vx, -vy) - VTH[jv], rr, VPH[jv], VTONE[jv], VWv[jv]);
            ar += w * oR; ag += w * oG; ab += w * oB; ah += w * (VLEVEL + oH); agl += w * oGl; atop += w * oTop; aoc += w * sh; A += w;
          }
          if (e > -0.5 && e < 32) {
            const ee = e > 0 ? e : 0, f = 1 - ee / 32;
            let cast = ((vx * S2x + vy * S2y) / dist + 0.15) / 0.85; if (cast < 0) cast = 0; else if (cast > 1) cast = 1;
            const s1 = cast * f * f * 0.85, s2 = 0.55 * Math.exp(-ee / 4.5), ss = s1 > s2 ? s1 : s2;
            if (ss > sh) sh = ss;
          }
        }
      }
      // 3) 平水 rows, nearest row (largest k) first
      for (let k = K - 1; k >= 0 && A < 0.995; k--) {
        const row = rows[k];
        if (d < row.lo || d > row.hi) continue;
        const jf = theta / row.dth - row.ph, jr = Math.round(jf), j0 = jr + row.n, j1 = j0 + (jf > jr ? 1 : -1);
        let bt = 9, bi = -1, bd = 0;
        for (let c = 0; c < 2; c++) {            // only the two nearest billows of a row can matter
          const idx = c ? j1 : j0;
          if (idx < 0 || idx >= row.count) continue;
          const vx = (qx - row.x[idx]) * row.ex[idx], vy = qy - row.y[idx], dist = Math.sqrt(vx * vx + vy * vy), rr = row.r[idx], e = dist - rr;
          if (dist / rr < bt) { bt = dist / rr; bi = idx; bd = dist; }
          if (e > -0.5 && e < 25) {
            const ee = e > 0 ? e : 0, f = 1 - ee / 25;
            let cast = ((vx * S2x + vy * S2y) / dist + 0.1) / 0.8; if (cast < 0) cast = 0; else if (cast > 1) cast = 1;
            const s1 = cast * f * f * 0.8, s2 = 0.5 * Math.exp(-ee / 4.5), ss = s1 > s2 ? s1 : s2;
            if (ss > sh) sh = ss;
          }
        }
        if (bi < 0) continue;
        const rr = row.r[bi], e = bd - rr;
        if (e < 0.5) {
          const cov = e < -0.5 ? 1 : 0.5 - e, w = (1 - A) * cov;
          const bt1 = bt > 1 ? 1 : bt;
          if (row.li) sampleLishuiArch(bt1, rr, theta * R + qx - X, d + qy - Y);
          else sampleScale(Math.pow(bt1, row.pw[bi]), rr, row.vr[bi], row.tone[bi]);
          ar += w * oR; ag += w * oG; ab += w * oB; ah += w * (row.level + oH); agl += w * oGl; atop += w * oTop; aoc += w * sh; A += w;
        }
      }
      // 4) any chink left between the billows: deep pooled glaze
      if (A < 0.995) {
        const w = 1 - A;
        ar += w * BL[0][0] * 0.9; ag += w * BL[0][1] * 0.9; ab += w * BL[0][2] * 0.9; agl += w * 0.7; aoc += w * (sh > 0.3 ? sh : 0.3);
      }
      // glaze life: uneven thickness, and a few worn patches where the ridges show the clay body
      let fall = (d - 240) / 460; fall = fall < 0 ? 0 : fall > 1 ? 1 : fall;      // the relief sinks gently into shade toward the bottom
      const mm = (0.9 + 0.12 * mot + 0.1 * med) * (1 - 0.3 * fall * fall * (3 - 2 * fall)) * (1.05 - 0.11 * px / LW);      // … and away from the light
      ar *= mm; ag *= mm; ab *= mm;
      if (soft) {
        let patch = (mot - 0.64) / 0.1; patch = patch < 0 ? 0 : patch > 1 ? 1 : patch;
        let chip = (cn - 0.958 + 0.1 * atop) / 0.02; chip = chip < 0 ? 0 : chip > 1 ? 1 : chip;
        chip *= patch * (d > 70 ? 1 : 0);
        if (chip > 0) {
          const bb = 0.9 + 0.2 * mot;
          ar += (BODY[0] * bb - ar) * chip; ag += (BODY[1] * bb - ag) * chip; ab += (BODY[2] * bb - ab) * chip;
          agl *= 1 - 0.92 * chip; ah -= 1.6 * chip;
        }
      }
      ah += (mot - 0.5) * 2.0 + (med - 0.5) * 1.5;        // the surface is hand-modelled: glints wander and break
      const aE = d < 0.5 ? d + 0.5 : 1;
      Hh[i] = ah * aE; Al[i] = aE; Oc[i] = aoc; Gl[i] = agl; Cr[i] = ar; Cg[i] = ag; Cb[i] = ab;
    }
  }
  // spray beads above the arc
  for (const dp of drops) {
    const x0 = Math.max(1, Math.floor(dp.x - dp.r - 1)), x1 = Math.min(LW - 2, Math.ceil(dp.x + dp.r + 1));
    const ya = Math.max(1, Math.floor(dp.y - dp.r - 1) - y0), yb = Math.min(fh - 2, Math.ceil(dp.y + dp.r + 1) - y0);
    for (let py = ya; py <= yb; py++) for (let px = x0; px <= x1; px++) {
      const vx = px + 0.5 - dp.x, vy = py + y0 + 0.5 - dp.y, dist = Math.sqrt(vx * vx + vy * vy), e = dist - dp.r;
      if (e >= 0.5) continue;
      const cov = e < -0.5 ? 1 : 0.5 - e, u = dist / dp.r, sq = Math.sqrt(u < 1 ? 1 - u * u : 0), i = py * LW + px;
      const na = cov + Al[i] * (1 - cov), wo = (Al[i] * (1 - cov)) / na, wn = cov / na;
      Cr[i] = Cr[i] * wo + (WH[0][0] + (WH[1][0] - WH[0][0]) * sq) * wn;
      Cg[i] = Cg[i] * wo + (WH[0][1] + (WH[1][1] - WH[0][1]) * sq) * wn;
      Cb[i] = Cb[i] * wo + (WH[0][2] + (WH[1][2] - WH[0][2]) * sq) * wn;
      Gl[i] = Gl[i] * wo + wn; Oc[i] *= wo; Al[i] = na;
      const hh = dp.r * 0.85 * sq; if (hh * cov > Hh[i]) Hh[i] = hh * cov;      // beads fuse where they touch
    }
  }
  // soften the height a touch so edges read as rounded glaze, not knife cuts
  const T = new Float32Array(N);
  for (let y = 0; y < fh; y++) { const o = y * LW; T[o] = Hh[o]; T[o + LW - 1] = Hh[o + LW - 1]; for (let x = 1; x < LW - 1; x++) T[o + x] = (Hh[o + x - 1] + 2 * Hh[o + x] + Hh[o + x + 1]) * 0.25; }
  for (let y = 1; y < fh - 1; y++) { const o = y * LW; for (let x = 0; x < LW; x++) Hh[o + x] = (T[o + x - LW] + 2 * T[o + x] + T[o + x + LW]) * 0.25; }
  return { y0, fh, N, Hh, Al, Oc, Gl, Cr, Cg, Cb, drops };
}

/** light the field: az = screen direction TO the light (deg, 225 = upper left), el = its elevation */
function shadeField(F, az, el) {
  const { fh, Hh, Al, Oc, Gl, Cr, Cg, Cb } = F;
  const Lx = Math.cos(L.deg(az)) * Math.cos(L.deg(el)), Ly = Math.sin(L.deg(az)) * Math.cos(L.deg(el)), Lz = Math.sin(L.deg(el));
  const hl = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / hl, Hy = Ly / hl, Hz = (Lz + 1) / hl;
  const img = new ImageData(LW, fh), o = img.data, SM = 3;
  for (let y = 1; y < fh - 1; y++) for (let x = 1; x < LW - 1; x++) {
    const i = y * LW + x, al = Al[i];
    if (al <= 0.003) continue;
    let gx = (Hh[i + 1] - Hh[i - 1]) * 0.5, gy = (Hh[i + LW] - Hh[i - LW]) * 0.5;
    const m2 = gx * gx + gy * gy;
    if (m2 > SM * SM) { const s = SM / Math.sqrt(m2); gx *= s; gy *= s; }
    const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1), nx = -gx * inv, ny = -gy * inv;
    let nl = nx * Lx + ny * Ly + inv * Lz; if (nl < 0) nl = 0;
    let nh = nx * Hx + ny * Hy + inv * Hz; if (nh < 0) nh = 0;
    const oc = Oc[i], amb = 0.42 * (1 - 0.5 * oc), dif = 0.94 * nl * (1 - 0.8 * oc);
    const n2 = nh * nh, n4 = n2 * n2, n8 = n4 * n4, n16 = n8 * n8, n64 = n16 * n16 * n16 * n16;
    // glass: the light source mirrored as a hard-edged glint with a narrow halo, plus the pale sky in every slope that faces up
    const gl = Gl[i] * (1 - oc);
    let gt = (nh - 0.984) * 200; gt = gt < 0 ? 0 : gt > 1 ? 1 : gt; gt = gt * gt * (3 - 2 * gt);
    const sp = gl * (gt * 0.86 + n64 * 0.2 + n16 * 0.08);
    let sky = -ny * 1.25 - 0.1; sky = sky < 0 ? 0 : sky > 1 ? 1 : sky; sky = gl * sky * sky * 0.09;
    const j = i * 4;
    o[j] = (Cr[i] * (amb * 0.94 + dif * 1.03) + sp + sky * 0.86) * 255;
    o[j + 1] = (Cg[i] * (amb * 1.0 + dif) + sp * 0.99 + sky * 0.95) * 255;
    o[j + 2] = (Cb[i] * (amb * 1.1 + dif * 0.96) + sp * 0.94 + sky) * 255;
    o[j + 3] = al * 255;
  }
  const c = L.makeCanvas(LW, fh);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ───────────── the yellow glaze above the arc ─────────────
/**
 * Glaze crazing (开片): the walls of a jittered-grid Voronoi diagram, stroked as hairlines above the arc.
 * cell = mesh size (px); strength varies in slow patches and is held back over the title; skip = share of cells left open.
 */
function crackle(g, env, cell, seed, width, color, amount, skip) {
  const a = env.arc, nz = L.makeNoise('s30cr' + seed), r = L.rng('s30cr' + seed);
  const i0 = Math.floor(-PAD / cell) - 3, ni = Math.ceil(LW / cell) + 7, nj = Math.ceil((a.yAt(-PAD) + PAD) / cell) + 7;
  const SX = new Float32Array(ni * nj), SY = new Float32Array(ni * nj);
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    let h = (Math.imul(i + i0, 374761393) ^ Math.imul(j + i0, 668265263) ^ seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    SX[j * ni + i] = (i + i0 + 0.06 + 0.88 * ((h & 1023) / 1023)) * cell;
    SY[j * ni + i] = (j + i0 + 0.06 + 0.88 * (((h >>> 10) & 1023) / 1023)) * cell;
  }
  const NBK = 5;
  let paths = Array.from({ length: NBK }, () => new Path2D()), pending = 0;
  let A = new Float64Array(72), B = new Float64Array(72);
  g.save(); g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round';
  const flush = () => {       // stroke in modest batches: very long paths get slow to append to
    for (let b = 0; b < NBK; b++) { g.globalAlpha = amount * ((b + 0.5) / NBK); g.stroke(paths[b]); }
    paths = Array.from({ length: NBK }, () => new Path2D()); pending = 0;
  };
  for (let j = 2; j < nj - 2; j++) for (let i = 2; i < ni - 2; i++) {
    const c = j * ni + i, px = SX[c], py = SY[c];
    if (a.drAt(px, py) < -cell * 1.6 || (skip && r() < skip)) continue;
    // the cell = a big square clipped by the bisector to every neighbouring site (nearest ring first)
    let n = 8, maxR2 = 8 * cell * cell;
    A[0] = px - 2 * cell; A[1] = py - 2 * cell; A[2] = px + 2 * cell; A[3] = py - 2 * cell; A[4] = px + 2 * cell; A[5] = py + 2 * cell; A[6] = px - 2 * cell; A[7] = py + 2 * cell;
    for (let ring = 1; ring <= 2 && n >= 6; ring++) {
      for (let dj = -ring; dj <= ring && n >= 6; dj++) for (let di = -ring; di <= ring && n >= 6; di++) {
        if (di > -ring && di < ring && dj > -ring && dj < ring) continue;
        const q = c + dj * ni + di, nx = SX[q] - px, ny = SY[q] - py;
        if (nx * nx + ny * ny > 4 * maxR2) continue;                    // bisector lies outside what is left
        const mx = px + nx * 0.5, my = py + ny * 0.5;
        let m = 0, ax = A[n - 2], ay = A[n - 1], da = (ax - mx) * nx + (ay - my) * ny;
        for (let k = 0; k < n; k += 2) {
          const bx = A[k], by = A[k + 1], db = (bx - mx) * nx + (by - my) * ny;
          if (db <= 0) { if (da > 0) { const t = da / (da - db); B[m++] = ax + (bx - ax) * t; B[m++] = ay + (by - ay) * t; } B[m++] = bx; B[m++] = by; }
          else if (da <= 0) { const t = da / (da - db); B[m++] = ax + (bx - ax) * t; B[m++] = ay + (by - ay) * t; }
          ax = bx; ay = by; da = db;
        }
        const T = A; A = B; B = T; n = m;
      }
      maxR2 = 0;
      for (let k = 0; k < n; k += 2) { const dx = A[k] - px, dy = A[k + 1] - py, d2 = dx * dx + dy * dy; if (d2 > maxR2) maxR2 = d2; }
    }
    if (n < 6) continue;
    const v = L.clamp(0.5 + 0.95 * nz.fbm(px / 330, py / 330, 3));
    const k = (0.1 + 1.0 * v) * (1 - 0.7 * calm(env, px, py));
    const path = paths[Math.min(NBK - 1, Math.floor(k * NBK))];
    path.moveTo(A[0], A[1]);
    for (let q = 2; q < n; q += 2) path.lineTo(A[q], A[q + 1]);
    path.closePath();
    if (++pending >= 600) flush();
  }
  flush();
  g.restore();
}

function flakePath(g, f) {
  const nz = L.makeNoise('s30fl' + f.seed), n = 120, cs = Math.cos(f.rot || 0), sn = Math.sin(f.rot || 0);
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * L.TAU, ux = Math.cos(ph), uy = Math.sin(ph);
    const k = 1 + 0.3 * nz.n2(ux * 1.2 + 3, uy * 1.2) + 0.11 * nz.n2(ux * 3.4, uy * 3.4 + 7) + 0.035 * nz.n2(ux * 9, uy * 9 + 1);
    const lx = f.rx * k * ux, ly = f.ry * k * uy, x = f.x + lx * cs - ly * sn, y = f.y + lx * sn + ly * cs;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}
/** a patch where the glaze has spalled off: matte pale body in a shallow pit, shadowed under its upper-left lip */
function drawFlake(g, f, bodyPat) {
  g.save(); g.filter = 'blur(3px)'; g.strokeStyle = 'rgba(255,244,170,0.5)'; g.lineWidth = 9; flakePath(g, f); g.stroke(); g.restore();
  g.save(); flakePath(g, f); g.clip();
  g.fillStyle = bodyPat; g.fillRect(f.x - 500, f.y - 500, 1000, 1000);
  g.save(); g.filter = 'blur(2.5px)'; g.strokeStyle = 'rgba(110,66,8,0.7)'; g.lineWidth = 7; g.translate(3, 3.6); flakePath(g, f); g.stroke(); g.restore();
  g.save(); g.strokeStyle = 'rgba(255,252,236,0.85)'; g.lineWidth = 2.2; g.translate(-1.2, -1.5); flakePath(g, f); g.stroke(); g.restore();
  g.restore();
  g.save(); g.strokeStyle = 'rgba(150,92,6,0.5)'; g.lineWidth = 1; flakePath(g, f); g.stroke(); g.restore();
}

function scratch(g, pts, seed, k = 1, w = 1) {
  L.sketchLine(g, pts, { width: 1.7 * w, color: '#935a00', seed, wobble: 2.2, passes: 1, alpha: 0.42 * k });
  L.sketchLine(g, pts.map(([x, y]) => [x + 1.3 * w, y + 1.4 * w]), { width: 1.2 * w, color: '#fff8cf', seed, wobble: 2.2, passes: 1, alpha: 0.55 * k });
}
/** a joint between two facing tiles: their pillowed edges catch the light on one side and fall away on the other */
function joint(g, x0, y0, x1, y1, seed) {
  const dk = [[0, 'rgba(214,138,0,0)'], [1, 'rgba(214,138,0,0.32)']], lt = [[0, 'rgba(255,249,200,0.6)'], [1, 'rgba(255,249,200,0)']];
  if (Math.abs(x1 - x0) < Math.abs(y1 - y0)) {      // upright joint: shade to its left, light to its right
    g.fillStyle = L.linear(g, x0 - 13, 0, x0 - 1, 0, dk); g.fillRect(x0 - 13, y0, 12, y1 - y0);
    g.fillStyle = L.linear(g, x0 + 1, 0, x0 + 16, 0, lt); g.fillRect(x0 + 1, y0, 15, y1 - y0);
  } else {                                          // bed joint: shade above, light below
    g.fillStyle = L.linear(g, 0, y0 - 13, 0, y0 - 1, dk); g.fillRect(x0, y0 - 13, x1 - x0, 12);
    g.fillStyle = L.linear(g, 0, y0 + 1, 0, y0 + 16, lt); g.fillRect(x0, y0 + 1, x1 - x0, 15);
  }
  L.sketchLine(g, [[x0, y0], [x1, y1]], { width: 2.4, color: '#6a3f04', seed, wobble: 0.8, passes: 1, alpha: 0.78 });
  L.sketchLine(g, [[x0 + 1.8, y0 + 1.8], [x1 + 1.8, y1 + 1.8]], { width: 1.2, color: '#fffadc', seed, wobble: 0.8, passes: 1, alpha: 0.6 });
}

function buildYellow(env, F) {
  const a = env.arc, r = L.rng('s30glaze');
  const JY = a.crestY - 298;                    // one bed joint, well above the title
  const NH = Math.min(LH, Math.ceil(a.yAt(-PAD) + PAD + 12));      // nothing below this row is ever seen (the relief covers it)
  return L.makeLayer(PAD, (g) => {
    // glaze body: bright imperial yellow, a little lighter toward the light — one clean colour
    g.fillStyle = L.linear(g, -PAD, -PAD, W + PAD, H * 0.8, [[0, '#ffe648'], [0.45, '#ffdc26'], [1, '#ffd214']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    // thickness of the glaze: slow, same-hue drift only (deeper = a touch more amber, thinner = a touch paler)
    g.drawImage(L.noiseTex(LW, NH, { seed: 's30y1', scale: 430, octaves: 4, res: 0.12, contrast: 1.5, ramp: [[0, 'rgba(248,176,0,0.1)'], [0.5, 'rgba(250,200,20,0)'], [1, 'rgba(255,244,150,0.17)']] }), -PAD, -PAD);
    g.drawImage(L.noiseTex(LW, NH, { seed: 's30y2', scale: 60, octaves: 3, res: 0.25, contrast: 1.5, ramp: [[0, 'rgba(236,160,0,0.06)'], [0.5, 'rgba(250,200,20,0)'], [1, 'rgba(255,244,170,0.08)']] }), -PAD, -PAD);
    g.drawImage(L.noiseTex(LW, NH, { seed: 's30y3', scale: 80, sx: 0.4, sy: 8, octaves: 3, res: 0.2, contrast: 1.6, ramp: [[0, 'rgba(232,150,0,0.05)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(255,244,170,0.07)']] }), -PAD, -PAD);
    // the glassy surface is never dead flat: a faint orange-peel that catches the light
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.2;
    g.drawImage(L.bumpLight(L.noiseTex(LW, NH, { seed: 's30peel', scale: 90, octaves: 3, res: 0.2, contrast: 1.3 }), { angle: 48, strength: 2.4, res: 0.34 }), -PAD, -PAD);
    g.restore();
    // big facing tiles: each fired a hair differently; the title sits inside one tile
    const tiles = [[-285, JY, 830, 1400, 'rgba(240,160,0,0.045)'], [1375, JY, 830, 1400, 'rgba(255,244,160,0.05)'],
      [-580, JY - 560, 830, 560, 'rgba(255,244,160,0.05)'], [250, JY - 560, 830, 560, 'rgba(240,160,0,0.04)'], [1080, JY - 560, 830, 560, 'rgba(255,236,120,0.04)']];
    for (const [x, y, w, h, c] of tiles) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    // the sky mirrored in the glass: a slanted window of light across the upper course (clear of the title)
    g.save(); g.beginPath(); g.rect(-PAD, -PAD, LW, JY + PAD - 4); g.clip();
    g.translate(520, 60); g.rotate(-0.33);
    g.fillStyle = L.linear(g, 0, -150, 0, 190, [[0, 'rgba(255,253,232,0)'], [0.3, 'rgba(255,253,232,0.22)'], [0.42, 'rgba(255,253,232,0.27)'], [1, 'rgba(255,253,232,0)']]);
    g.fillRect(-1400, -150, 2800, 340);
    g.restore();
    g.save(); g.translate(400, 70); g.rotate(-0.12); g.scale(1, 0.36);
    g.fillStyle = L.radial(g, 0, 0, 0, 640, [[0, 'rgba(255,252,226,0.3)'], [0.5, 'rgba(255,250,214,0.12)'], [1, 'rgba(255,250,214,0)']]);
    g.fillRect(-660, -660, 1320, 1320);
    g.restore();
    // crazing: an open mesh of amber hairlines, with a few longer primary cracks — it must never grey the yellow
    crackle(g, env, 30, 0x2f6b1d, 0.8, '#bd7c00', 0.26, 0.06);
    crackle(g, env, 82, 0x51ed27, 1.15, '#a86600', 0.34, 0.22);
    // joints
    joint(g, -PAD, JY, W + PAD, JY, 1);
    joint(g, 545, JY, 545, H, 2); joint(g, 1375, JY, 1375, H, 3);
    joint(g, 250, -PAD, 250, JY, 4); joint(g, 1080, -PAD, 1080, JY, 5); joint(g, 1910, -PAD, 1910, JY, 6);
    // spalls: few, and each large enough to read — the tall one on the left runs down a joint
    const flakes = [
      { x: 262, y: 168, rx: 50, ry: 176, rot: -0.03, seed: 1 }, { x: 1652, y: 132, rx: 96, ry: 48, rot: 0.25, seed: 2 },
      { x: 548, y: JY + 4, rx: 27, ry: 18, rot: 0.5, seed: 3 }, { x: 1842, y: 440, rx: 26, ry: 50, rot: -0.2, seed: 6 },
      { x: 84, y: a.yAt(84) - 150, rx: 36, ry: 24, rot: 0.3, seed: 5 }, { x: 1250, y: 26, rx: 30, ry: 15, rot: -0.3, seed: 8 },
      { x: -40, y: 250, rx: 50, ry: 70, rot: 0.2, seed: 11 }, { x: 1975, y: 120, rx: 40, ry: 80, rot: 0.1, seed: 12 },
    ];
    // rain has washed a little pale dust down from the two big ones
    for (const f of flakes.slice(0, 2)) {
      g.fillStyle = L.linear(g, 0, f.y, 0, f.y + f.ry + 240, [[0, 'rgba(255,246,200,0)'], [0.3, 'rgba(255,246,200,0.16)'], [1, 'rgba(255,246,200,0)']]);
      g.fillRect(f.x - f.rx * 0.6, f.y, f.rx * 1.2, f.ry + 240);
    }
    const bodyPat = g.createPattern(L.stoneTex(360, 360, { base: '#f0e6ce', dark: '#cdbd9c', light: '#fcf8ea', seed: 's30body', scale: 70, speck: 0.4, rough: 0.5 }), 'repeat');
    for (const f of flakes) drawFlake(g, f, bodyPat);
    // scratches: a few long confident ones, a handful of short ones — none through the title
    scratch(g, [[600, 196], [840, 96], [1130, 70], [1420, 150], [1590, 270]], 11, 1.2, 1.5);
    scratch(g, [[1440, 10], [1474, 250], [1458, 540]], 12, 1.1, 1.3);
    scratch(g, [[30, 478], [250, 410], [480, 462]], 13, 1.2, 1.4);
    scratch(g, [[1600, 372], [1760, 316], [1930, 366]], 14, 0.9);
    scratch(g, [[340, 400], [404, 468], [398, 566]], 15, 0.8);
    for (let i = 0; i < 14; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, 700), len = r.range(26, 84), an = r.range(-1.3, 1.3);
      if (calm(env, x, y) > 0.05) continue;
      scratch(g, [[x, y], [x + Math.cos(an) * len * 0.5 + r.range(-4, 4), y + Math.sin(an) * len * 0.5 + r.range(-4, 4)], [x + Math.cos(an) * len, y + Math.sin(an) * len]], 30 + i, r.range(0.5, 0.9));
    }
    // a little grit caught in the glaze
    L.speckle(g, { seed: 's30pin', count: 420, x: -PAD, y: -PAD, w: LW, h: 900, rMin: 0.6, rMax: 2.3, colors: ['#a86a00', '#8a5200', '#fff8cc'], alpha: [0.2, 0.6], test: (x, y) => calm(env, x, y) < 0.2 });
    // where the relief rises out of the ground the yellow glaze has pooled deeper, and a warm crevice hugs the bead
    g.save(); a.pathBand(g, 34, -2);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 34, [[0, 'rgba(226,132,0,0.5)'], [0.3, 'rgba(236,150,0,0.22)'], [1, 'rgba(240,160,0,0)']]);
    g.fill(); g.restore();
    g.save(); g.strokeStyle = 'rgba(112,58,0,0.78)'; g.lineWidth = 3; a.stroke(g, 0.6); g.restore();
    // spray beads throw small warm shadows on the yellow
    g.save(); g.filter = 'blur(3px)';
    g.fillStyle = 'rgba(176,98,0,0.5)';
    for (const d of F.drops) { g.beginPath(); g.arc(d.x - PAD + d.r * 0.5, d.y - PAD + d.r * 0.62, d.r * 1.02, 0, L.TAU); g.fill(); }
    g.restore();
  });
}

/**
 * Pull focus: sharp where the arc crests, softening toward the corners and the bottom of the frame (two blur levels
 * mixed in by elliptical masks). c is a canvas whose pixel (0,0) sits at frame (−PAD, offY − PAD); it is changed in place.
 */
function pullFocus(env, c, offY) {
  const a = env.arc, g = c.getContext('2d'), w = c.width, h = c.height, hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
  const kx = hw / w, ky = hh / h;
  // blur at half size: a quarter of the pixels, and the upscale only adds to the softness
  const half = L.makeCanvas(hw, hh), hg = half.getContext('2d');
  hg.imageSmoothingQuality = 'high'; hg.drawImage(c, 0, 0, hw, hh);
  for (const [px, r0, r1] of [[2.6, 250, 520], [6.5, 430, 800]]) {
    const b = L.blurred(half, px * kx), bg = b.getContext('2d');
    bg.save(); bg.globalCompositeOperation = 'destination-in';
    bg.scale(kx, ky); bg.translate(a.cx + PAD, a.crestY + PAD - offY + 10); bg.scale(1.75, 1);
    bg.fillStyle = L.radial(bg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    bg.fillRect(-LW, -LH * 2, LW * 2, LH * 4);
    bg.restore();
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(b, 0, 0, w, h); g.restore();
  }
}

export default {
  name: '琉璃海水纹',
  tone: 'dark',
  init(env) {
    const F = buildField(env);
    const base = buildYellow(env, F);
    // the same relief under a light that has swung a little: only the strip that holds the relief
    const alt = L.makeCanvas(LW, F.fh), ag = alt.getContext('2d');
    ag.drawImage(base, 0, -F.y0);
    ag.drawImage(shadeField(F, 204, 44), 0, 0);
    base.getContext('2d').drawImage(shadeField(F, 230, 38), -PAD, F.y0 - PAD);
    pullFocus(env, base, 0);
    pullFocus(env, alt, F.y0);
    S = { base, alt, y0: F.y0 };
  },
  draw(ctx, env, p) {
    const rot = L.lerp(-0.0055, 0.0055, p), zoom = L.lerp(1.0, 1.014, p);
    L.blit(ctx, env, S.base, { rot, zoom });
    // highlights slide along the glazed ridges as the light swings
    const k = L.smooth(p);
    if (k > 0.004) L.cam(ctx, env, { rot, zoom }, () => { ctx.globalAlpha = k; ctx.drawImage(S.alt, -PAD, S.y0 - PAD); });
    // a soft sheen crossing the flat yellow glaze
    const sx = L.lerp(-420, 520, p);
    ctx.save(); env.arc.clipAbove(ctx, 3);
    ctx.fillStyle = L.linear(ctx, sx, 0, sx + 900, 440, [[0, 'rgba(255,250,220,0)'], [0.5, 'rgba(255,250,220,0.14)'], [1, 'rgba(255,250,220,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};
