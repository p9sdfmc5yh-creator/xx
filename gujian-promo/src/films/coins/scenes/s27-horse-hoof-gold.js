// s27 — 马蹄金. "A hill of gold on black": extreme macro of a Western-Han horse-hoof gold piece; the arc is the upper
// outline of its swelling gold wall. The rim is not a ruled line — it is a granular cast edge that dissolves into a fringe of
// glitter points, and a little gold dust hangs off both flanks (never over the crest, where the tagline sits).
//
// Everything under the arc is shaded per pixel in init(): a pebbled cast skin (every grain a small dome that throws its own
// spark), folds, pits and a few shallow flow lines that follow the wall, squeezed where the skin rolls over the limb, lit by
// one hard light above the crest (a touch from the left) so the gold falls from pale and red gold into ochre and umber.
// Low in the frame runs the filigree band that tells a horse-hoof gold from a plain gold cake — beaded wire / two twisted
// wires laid as a wheat-ear / beaded wire — at true macro scale (a bead ≈ 50 px), modelled as a height field and lit as
// mirror gold. The lens is focused on the crest: the wall, the band, the foreground and the flanks fall progressively out of
// focus, and glints there open into soft discs. No inscription anywhere.
//
// The show is the glitter: pre-placed points flare and die on a seeded per-frame schedule (env.frame); a few carry
// four-point star flares.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 48;          // the camera only slides round the circle centre (≤ 0.007 rad ≈ 13 px at the rim)
const TOP = 96;          // rows kept above the crest inside the gold bitmap (glitter fringe + bloom spill)
const VMAX = 1.3, NL = 1024;
let S = null;

// light value → gold. 0.27 umber, 0.55 ochre gold, 0.8 red gold, ≥ 1.15 highlight
const GOLD = [[0, '#0a0300'], [0.1, '#260d02'], [0.2, '#3d1c05'], [0.27, '#4d2a08'], [0.34, '#6a3508'], [0.42, '#8c490a'], [0.55, '#ad6912'], [0.68, '#d38a1c'],
  [0.8, '#e9b13a'], [0.9, '#f4c656'], [1, '#fbdc86'], [1.15, '#fff3c0'], [1.3, '#fffdf2']];

// filigree band (depths below the arc, px): bead radius, wire radius, strand pitch
const RB = 26, WR = 28, PITCH = 24;
const BAND = { bead1: 306, ropeA: 357, ropeB: 411, bead2: 462 };
const BTOP = BAND.bead1 - RB, BBOT = BAND.bead2 + RB;
const ROPES = [[BAND.ropeA, 1, 3], [BAND.ropeB, -1, 11]];      // [depth, lay, seed] — opposite lays → a wheat-ear
// long shallow flow lines that follow the wall: [depth, seed]
const FLOWS = [[64, 1.3], [128, 7.7], [196, 13.1], [246, 21.9]];

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash2 = (i, j) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// tiny allocation-free worley noise (squared distances to the nearest / second-nearest point in cD1 / cD2, cell id in cId)
let cD1 = 0, cD2 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 255) / 255; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = id;
}

/** the big light: a hard pool on the crest (wider toward the light, on the left), sinking with depth (d px below the arc) */
function macro(d, sn) {
  const dd = d < 0 ? 0 : d, s = sn + 0.05, s2 = s * s;
  const A = Math.exp(-s2 / (s < 0 ? 0.17 : 0.115)) * Math.exp(-dd / 230), B = Math.exp(-s2 / 0.56) * Math.exp(-dd / 600);
  return 0.18 + 0.43 * A + 0.17 * B + 0.11 * Math.exp(-dd / 18) * (1 - 0.5 * A);
}
// the skin is squeezed only where it rolls over the limb: surface distance from the limb, and its derivative
const Sof = (d) => d + 46 * (1 - Math.exp(-d / 20));
const gS = (d) => 1 + 2.3 * Math.exp(-d / 20);
/** how far out of focus a point of the frame is (0 = on the crest, 1 = foreground / far flank) */
const defocus = (x, d) => 1 - (1 - sstep(110, 500, d)) * (1 - 0.8 * sstep(430, 1000, Math.abs(x - W / 2)));

function buildSprites() {
  const dot = (stops) => { const c = L.makeCanvas(48, 48), g = c.getContext('2d'); g.fillStyle = L.radial(g, 24, 24, 0, 24, stops); g.fillRect(0, 0, 48, 48); return c; };
  const pale = dot([[0, 'rgba(255,253,242,1)'], [0.22, 'rgba(255,243,192,0.96)'], [0.5, 'rgba(244,192,80,0.4)'], [1, 'rgba(233,150,40,0)']]);
  const gold = dot([[0, 'rgba(255,238,172,1)'], [0.3, 'rgba(244,190,72,0.82)'], [0.6, 'rgba(224,150,40,0.28)'], [1, 'rgba(200,120,20,0)']]);
  const ember = dot([[0, 'rgba(255,206,110,1)'], [0.34, 'rgba(230,142,34,0.72)'], [1, 'rgba(168,96,16,0)']]);
  // out-of-focus glint: a flat disc with a slightly brighter edge
  const soft = dot([[0, 'rgba(246,196,92,0.5)'], [0.6, 'rgba(244,188,80,0.5)'], [0.78, 'rgba(250,206,110,0.6)'], [0.9, 'rgba(236,168,56,0.2)'], [1, 'rgba(220,150,40,0)']]);
  // four-point star flare
  const star = L.makeCanvas(256, 256), g = star.getContext('2d');
  g.translate(128, 128); g.globalCompositeOperation = 'lighter';
  const streak = (ang, len, thick, al) => {
    g.save(); g.rotate(ang); g.scale(len / 128, thick / 128);
    g.fillStyle = L.radial(g, 0, 0, 0, 128, [[0, `rgba(255,251,230,${al})`], [0.05, `rgba(255,244,200,${al * 0.82})`], [0.22, `rgba(250,212,120,${al * 0.32})`], [0.5, `rgba(240,180,70,${al * 0.07})`], [1, 'rgba(233,160,50,0)']]);
    g.fillRect(-128, -128, 256, 256); g.restore();
  };
  streak(0, 126, 4.2, 1); streak(Math.PI / 2, 126, 4.2, 1); streak(Math.PI / 4, 50, 3, 0.45); streak(-Math.PI / 4, 50, 3, 0.45);
  g.fillStyle = L.radial(g, 0, 0, 0, 34, [[0, 'rgba(255,255,250,1)'], [0.24, 'rgba(255,245,200,0.7)'], [0.6, 'rgba(246,196,90,0.16)'], [1, 'rgba(240,180,70,0)']]);
  g.fillRect(-34, -34, 68, 68);
  return [pale, gold, ember, soft, star];
}
const SP_PALE = 0, SP_GOLD = 1, SP_EMBER = 2, SP_SOFT = 3, SP_STAR = 4;

/** the two beaded wires: hand-made — no two beads the same size, spacing or lustre; neighbours are soldered into each other */
function buildBeadRows(a) {
  const r = L.rng('s27fil'), span = a.span(PAD + 80), rows = [];
  for (const [dc, off] of [[BAND.bead1, 0], [BAND.bead2, 0.55]]) {
    const rr = a.R - dc, half = span * rr, list = [];
    let s = -half - 60 + off * RB * 2;
    while (s < half + 60) {
      const k = r.range(0.84, 1.13), rad = RB * k;
      s += rad;
      list.push({ s, d: dc + r.range(-1.5, 1.5), r: rad, g: r.range(0.84, 1.14) });
      s += rad * r.range(0.9, 1.02);
    }
    // nearest bead for every 4 px of arc length
    const s0 = -half - 80, n = Math.ceil((half * 2 + 160) / 4) + 2, lut = new Int16Array(n);
    for (let i = 0, j = 0; i < n; i++) {
      const sv = s0 + i * 4;
      while (j < list.length - 1 && Math.abs(list[j + 1].s - sv) < Math.abs(list[j].s - sv)) j++;
      lut[i] = j;
    }
    rows.push({ dc, rr, list, s0, lut, n });
  }
  return rows;
}

/** everything under the arc, plus the baked glitter fringe that eats into the rim */
function buildDome(env, spr) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - TOP;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s27a'), nB = L.makeNoise('s27b');
  const ramp = L.makeRamp(GOLD.map(([t, c]) => [t / VMAX, c]));
  const LUT = new Uint8ClampedArray(NL * 3);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2]; }
  const rows = buildBeadRows(a);
  /** the band is laid by hand: it wanders a few px off its circle */
  const wob = (th) => 3.2 * nB.n2(th * R / 250, 3.3) + 1.2 * nB.n2(th * R / 64, 8.1);

  // 1) slow fields on a half-resolution grid, in skin coordinates (U along the arc, Sv down from the limb)
  const AW = 0.75, AM = 6.0, AN = 2.6, APIT = 2.8, AFL = 2.3, APEB = 1.75, AG = 0.05, KR = 2.3;
  const CS = 2, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const cH = new Float32Array(CN), cPit = new Float32Array(CN), cTone = new Float32Array(CN), cWx = new Float32Array(CN), cWy = new Float32Array(CN), cPa = new Float32Array(CN);
  for (let j = 0; j < ch; j++) {
    const ddy = cy - (Y0 + j * CS);
    for (let i = 0; i < cw; i++) {
      const ddx = X0 + i * CS - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 6) continue;
      const d = rr > R ? 0 : R - rr, Sv = Sof(d), U = Math.atan2(ddx, ddy) * rr, k = j * cw + i;
      const wx = nB.n2(U / 170 + 5, Sv / 170), wy = nB.n2(U / 170 - 31, Sv / 170 + 19);
      const wr = nA.ridged(U / 84 + 0.5 * wx, Sv / 60 + 0.5 * wy, 2, 2.1, 0.5);            // folds of the solidified skin
      const swell = nB.fbm(U / 340 + 3, Sv / 250 - 7, 2);                                   // slow swells
      cell(U / 46 + 0.4 * wx, Sv / 46 + 0.4 * wy);
      const nod = Math.min(cD1 < 0.3 ? 1 - cD1 / 0.3 : 0, sstep(0, 0.3, Math.sqrt(cD2) - Math.sqrt(cD1))) * (cId - 0.38);   // larger lumps and dimples
      cell(U / 96 - 5.3 + 0.3 * wy, Sv / 96 + 9.1 + 0.3 * wx);
      let pit = 0;
      if (cId < 0.34) { const rp = 0.1 + 0.13 * ((cId * 7.31) % 1); pit = (1 - sstep(rp * 0.4, rp, Math.sqrt(cD1))) * sstep(0, 0.14, Math.sqrt(cD2) - Math.sqrt(cD1)); }
      let fl = 0;
      for (const [d0, sd] of FLOWS) {
        if (d < d0 - 48 || d > d0 + 48) continue;
        const u = (d - d0 - 14 * nA.n2(U / 420, sd)) / 11;
        if (u > -3 && u < 3) fl += Math.exp(-u * u) * sstep(-0.5, 0.1, nB.n2(U / 560 + sd, 2.2));
      }
      cH[k] = AW * wr + AM * swell + AN * nod - APIT * pit - AFL * fl;
      cPit[k] = pit; cTone[k] = swell; cWx[k] = wx; cWy[k] = wy;
      cPa[k] = sstep(-0.32, 0.3, nA.n2(U / 130 + 40, Sv / 105 - 13) + 0.4 * wx);      // where the skin froze coarse, where fine
    }
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  const GRAIN0 = 318, GRAIN1 = 352;
  // 2) full-resolution height fields: the pebbled grain (every grain a small dome of its own height), and the filigree
  const Hh = new Float32Array(N), Fa = new Float32Array(N), Pe = new Float32Array(N), Gr = new Float32Array(N + RW * 3 + 8);
  const Hf = new Float32Array(N), Gb = new Float32Array(N), Oc = new Float32Array(N), Ew = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -6) continue;
      const k = j * RW + i, dd = d < 0 ? 0 : d, Sv = Sof(dd), th = Math.atan2(ddx, ddy), U = th * rr;
      // two sizes of grain: coarse pebbles where the skin froze slowly, a fine granular crust elsewhere; no two alike
      // (none in the foreground: the lens dissolves it there anyway)
      let pe = 0, fa = 0, g = 0;
      if (dd < GRAIN1) {
        const wxk = bil(cWx, i, j), wyk = bil(cWy, i, j), pa = bil(cPa, i, j), fade = dd < GRAIN0 ? 1 : 1 - (dd - GRAIN0) / (GRAIN1 - GRAIN0);
        cell(U / 22 + 0.45 * wxk, Sv / 22 + 0.45 * wyk);
        const u1 = (cId * 5.7) % 1, b1 = (cD1 < 0.36 ? 1 - cD1 / 0.36 : 0) * pa, h1 = cId < 0.16 ? 0.05 : 0.18 + 0.82 * u1 * u1, t1 = ((cId * 13.7) % 1) - 0.5;
        cell(U / 10.5 + 7.7 + 0.3 * wyk, Sv / 10.5 - 3.1 + 0.3 * wxk);
        const b2 = (cD1 < 0.3 ? 1 - cD1 / 0.3 : 0) * (1 - 0.85 * pa), h2 = 0.2 + 0.5 * ((cId * 9.1) % 1), t2 = ((cId * 17.3) % 1) - 0.5;
        g = nB.n2(i * 0.31 + 11, j * 0.31 - 7);
        pe = (b1 * h1 + 0.5 * b2 * h2) * fade;
        fa = (b1 * t1 + 0.6 * b2 * t2) * fade;      // each grain is tilted its own way → its own brightness
      }
      Hh[k] = bil(cH, i, j) + APEB * pe + AG * g;
      Fa[k] = fa; Pe[k] = pe; Gr[k] = g;
      // the cast edge wanders a couple of px: it is not a ruled line
      if (d < 10) Ew[k] = 2.1 * nA.n2(U / 36, 1.7) + 1.1 * nA.n2(U / 11, 9.3);
      if (dd > BTOP - 22 && dd < BBOT + 40) {
        const dw = dd - wob(th);
        // the wires stand proud of the wall: a contact shadow above, deep crevices between, a cast shadow below
        Oc[k] = dw < BTOP ? 0.45 * sstep(BTOP - 11, BTOP, dw) : dw < BBOT ? 0.62 : 0.62 * (1 - sstep(BBOT, BBOT + 30, dw));
        if (dw > BTOP - 7 && dw < BBOT + 7) {
          let hf = 0, gb = 1;
          for (const row of rows) {
            if (Math.abs(dw - row.dc) > RB * 1.2 + 6) continue;
            const sv = th * row.rr;
            let q = ((sv - row.s0) / 4) | 0; q = q < 0 ? 0 : q >= row.n ? row.n - 1 : q;
            const i0 = row.lut[q];
            for (let kk = i0 - 1; kk <= i0 + 1; kk++) {
              const bd = row.list[kk]; if (!bd) continue;
              const ds = sv - bd.s, dv = dw - bd.d, q2 = ds * ds + dv * dv, r2 = bd.r * bd.r;
              let hh;
              if (q2 < r2) hh = 3 + 0.92 * Math.sqrt(r2 - q2);
              else { const e = Math.sqrt(q2) - bd.r; hh = e < 5 ? 3 * (1 - e / 5) * (1 - e / 5) : 0; }     // solder fillet
              if (hh > hf) { hf = hh; gb = bd.g; }
            }
          }
          for (const [dc, dir, sd] of ROPES) {
            const v = (dw - dc) / WR, av = v < 0 ? -v : v;
            if (av < 1) {
              // a twisted wire: strands wind round the core, so their grooves run in S-curves across it
              const sv = th * (R - dc), ph = (sv + dir * 19.5 * Math.asin(v)) / PITCH + 0.55 * nB.n2(sv / 130 + sd, sd);
              const fl = Math.floor(ph), u = 2 * (ph - fl) - 1;
              const hh = 3 + WR * Math.sqrt(1 - v * v) * (0.56 + 0.44 * Math.sqrt(1 - u * u));
              if (hh > hf) { hf = hh; gb = 0.84 + 0.3 * hash2(fl, sd); }
            } else {
              const e = (av - 1) * WR, hh = e < 5 ? 3 * (1 - e / 5) * (1 - e / 5) : 0;
              if (hh > hf) hf = hh;
            }
          }
          Hf[k] = hf; Gb[k] = gb;
        }
      }
    }
  }

  // 3) shade: hard top light, a touch from the left; every grain that faces it throws a spark
  //    (macro() and gS() tabulated: by depth, and by sin θ)
  const ND = RH + 400, eA = new Float32Array(ND), eB = new Float32Array(ND), eL = new Float32Array(ND), iG = new Float32Array(ND);
  for (let d = 0; d < ND; d++) { eA[d] = Math.exp(-d / 230); eB[d] = Math.exp(-d / 600); eL[d] = Math.exp(-d / 18); iG[d] = 1 / gS(d); }
  const NS = 4096, sA = new Float32Array(NS + 1), sB = new Float32Array(NS + 1);
  for (let q = 0; q <= NS; q++) { const sv = (q / NS) * 1.8 - 0.9 + 0.05, s2 = sv * sv; sA[q] = Math.exp(-s2 / (sv < 0 ? 0.17 : 0.115)); sB[q] = Math.exp(-s2 / 0.56); }
  const img = new ImageData(RW, RH), o = img.data;
  for (let j = 1; j < RH - 1; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 1; i < RW - 1; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -5) continue;
      const k = j * RW + i, sn = ddx / rr, cs = ddy / rr, dd = d < 0 ? 0 : d;
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      const di = dd | 0, df = dd - di, qs = ((sn + 0.9) * (NS / 1.8) + 0.5) | 0;
      const ea = (eA[di] + (eA[di + 1] - eA[di]) * df) * sA[qs], eb = (eB[di] + (eB[di + 1] - eB[di]) * df) * sB[qs], el = eL[di] + (eL[di + 1] - eL[di]) * df;
      const ht = hx * cs + hy * sn, hr = (-hx * sn + hy * cs) * (iG[di] + (iG[di + 1] - iG[di]) * df);      // slope along the arc / toward the centre
      let rel = KR * (0.9 * hr + 0.42 * ht); rel = rel < -0.62 ? -0.62 : rel > 0.7 ? 0.7 : rel;
      const m0 = 0.18 + 0.43 * ea + 0.17 * eb + 0.11 * el * (1 - 0.5 * ea), m = m0 * (1 + 0.2 * bil(cTone, i, j));
      let V = m * (1 + rel) + 0.55 * Fa[k] * m;
      // micro-roughness scatters the mirror direction, so a smooth flank gives a band of separate sparks, not a ruled bright line
      const e1 = hr - 0.075 + 0.05 * Gr[k], e2 = ht - 0.03 + 0.05 * Gr[k + RW * 3 + 5], ee = e1 * e1 + e2 * e2;
      if (ee < 0.0047) V += Math.exp(-ee / 0.0012) * 1.25 * m * (0.35 + m);
      V *= 1 - 0.6 * bil(cPit, i, j);
      if (Oc[k] > 0) V *= 1 - Oc[k];
      const hf = Hf[k];
      if (hf > 0.4) {
        // the filigree is mirror gold: it shows the lamp (above, a touch left), the black room, and the glow of the wall below it
        const gx = (Hf[k + 1] - Hf[k - 1]) * 0.5, gy = (Hf[k + RW] - Hf[k - RW]) * 0.5, il = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * il, ny = -gy * il, nt = nx * cs + ny * sn, nu = nx * sn - ny * cs;
        const key = -0.2 * nt + 0.5 * nu + 0.84 * il, fill = 0.5 + 0.5 * nu;
        const cap = (0.45 + 2.2 * Math.pow(fill, 1.6) + 0.4 * sstep(0.25, 0.85, -nu)) * (0.3 + 0.7 * sstep(0, 0.5, il))
          + 0.28 * sstep(0.86, 0.97, key) + 0.95 * sstep(0.962, 0.997, key);
        const w = sstep(0.4, 3.2, hf);
        V = V * (1 - w) + m0 * 0.9 * Gb[k] * cap * w;
      }
      const li = ((V <= 0 ? 0 : V >= VMAX ? 1 : V / VMAX) * (NL - 1) | 0) * 3, p = k * 4;
      o[p] = LUT[li]; o[p + 1] = LUT[li + 1]; o[p + 2] = LUT[li + 2];
      // the rim is granular, not a ruled line
      o[p + 3] = d >= 7 ? 255 : 255 * sstep(-1.2, 3.2, d + Ew[k] + 2.4 * (hash2(i, j) - 0.5) + 2.4 * (Pe[k] - 0.3));
    }
  }
  const cnv = L.makeCanvas(RW, RH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);
  g.translate(-X0, -Y0);                 // frame coordinates from here on

  // where each bead shows the lamp (for the live glints)
  const beads = [];
  for (const row of rows) for (const bd of row.list) {
    const th = bd.s / row.rr, d = bd.d + wob(th) - 0.5 * bd.r, p = a.pt(th - 0.2 * bd.r / row.rr, -d);
    beads.push({ x: p.x, y: p.y, m: macro(d, Math.sin(th)) * bd.g, d });
  }

  // 4) baked glitter: a static bed of glints on the gold, thickest where the light is …
  const r = L.rng('s27bake'), span = a.span(PAD + 40);
  const expo = (mean) => -mean * Math.log(1 - r() * 0.9999);
  g.globalCompositeOperation = 'lighter';
  for (let n = 0; n < 3900; n++) {
    const th = r.range(-span, span), d = r.chance(0.42) ? expo(26) + 1 : Math.pow(r(), 1.45) * 600;
    const m = macro(d, Math.sin(th)), keep = Math.pow(m / 0.8, 1.8) + 0.04, hs = 2.6 + Math.pow(r(), 3) * 11, al = r.range(0.3, 0.9), sp = r.pick([SP_PALE, SP_GOLD, SP_GOLD, SP_EMBER]);
    if (r() > keep || (d > BTOP - 6 && d < BBOT + 6)) continue;
    const p = a.pt(th, -d);
    g.globalAlpha = al * L.clamp(m * 1.3);
    g.drawImage(spr[sp], p.x - hs, p.y - hs * 0.8, hs * 2, hs * 1.6);
  }
  // … and the fringe that dissolves the rim (kept within 9 px of the arc over the crest, looser on the flanks)
  for (let n = 0; n < 3300; n++) {
    const th = r.range(-span, span), side = sstep(0.175, 0.42, Math.abs(th));
    let dr = r.chance(0.7) ? r.gauss() * 3.6 - 0.4 : expo(4.5 + 8 * side);
    const hs = 2 + Math.pow(r(), 2.6) * 6.5, al = r.range(0.35, 1), sp = r.pick([SP_PALE, SP_PALE, SP_GOLD, SP_GOLD, SP_EMBER]);
    if (dr > 8 + 28 * side) dr = 8 + 28 * side - r() * 6;
    const m = macro(0, Math.sin(th)), p = a.pt(th, dr);
    g.globalAlpha = al * L.clamp(m * 1.15) * (dr > 0 ? Math.exp(-dr / (9 + 14 * side)) : 1);
    g.drawImage(spr[sp], p.x - hs, p.y - hs, hs * 2, hs * 2);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

  // 5) depth of field: the lens is focused on the crest. Each pass swaps in a blurrier copy (a true cross-fade, so the
  //    rim itself goes soft on the flanks) deeper down the wall and further out along the arc
  const soften = (px, d0, d1, x0, x1, kx, sc) => {
    const bw = Math.ceil(RW / sc), bh = Math.ceil(RH / sc);
    const b = L.makeCanvas(bw, bh), bg = b.getContext('2d'), mk = L.makeCanvas(bw, bh), mg = mk.getContext('2d');
    bg.filter = `blur(${px / sc}px)`; bg.drawImage(cnv, 0, 0, bw, bh); bg.filter = 'none';
    mg.scale(1 / sc, 1 / sc); mg.translate(-X0, -Y0);
    mg.fillStyle = L.radial(mg, cx, cy, R - d1, R - d0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    mg.fillRect(X0, Y0, RW, RH);
    const XW = x1 + 200, ta = 0.5 - x1 / (2 * XW), tb = 0.5 - x0 / (2 * XW), on = `rgba(0,0,0,${kx})`, off = 'rgba(0,0,0,0)';
    mg.fillStyle = L.linear(mg, cx - XW, 0, cx + XW, 0, [[0, on], [ta, on], [tb, off], [1 - tb, off], [1 - ta, on], [1, on]]);
    mg.fillRect(X0, Y0, RW, RH);
    bg.globalCompositeOperation = 'destination-in'; bg.drawImage(mk, 0, 0);
    g.globalCompositeOperation = 'destination-out'; g.drawImage(mk, X0, Y0, bw * sc, bh * sc);
    g.globalCompositeOperation = 'lighter'; g.drawImage(b, X0, Y0, bw * sc, bh * sc);
    g.globalCompositeOperation = 'source-over';
  };
  soften(1.4, 96, 200, 400, 760, 1, 1);
  soften(2.8, 200, 320, 700, 1000, 1, 2);
  soften(5.6, 320, 430, 940, 1200, 0.9, 2);
  soften(10, 425, 520, 1100, 1300, 0.6, 2);

  // bloom: quarter-size, blurred; laid back with 'screen' so the hot gold glows and spills a little over its own rim
  const BS = 4, bloom = L.makeCanvas(Math.ceil(RW / BS), Math.ceil(RH / BS)), bg = bloom.getContext('2d');
  bg.filter = 'brightness(0.9) contrast(1.4) blur(5px)';
  bg.drawImage(cnv, 0, 0, RW / BS, RH / BS);
  bg.filter = 'none';
  g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.32;
  g.drawImage(bloom, X0, Y0, RW, RH);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return { cnv, X0, Y0, RW, RH, beads };
}

/** the points that flare and die: on the gold (slide with the surface), dust off the rim (own parallax), star flares */
function buildLive(env, beads) {
  const a = env.arc, span = a.span(PAD);
  const r = L.rng('s27live');
  const expo = (mean) => -mean * Math.log(1 - r() * 0.9999);
  let id = 0;
  const life = (q) => { q.id = id++; q.f0 = r.range(-1.5, 8.5); q.w = r.range(1.1, 2.4); q.fl = r.chance(0.18); return q; };
  // out of focus, a glint opens into a soft disc
  const lens = (q, d) => { const df = defocus(q.x, d); if (df > 0.3) { q.sp = SP_SOFT; q.hs = q.hs * (0.9 + 1.5 * df) + 5 * df; q.al *= 1 - 0.4 * df; } return q; };
  const surf = [];
  // body
  for (let n = 0; n < 4200; n++) {
    const th = r.range(-span, span), d = r.chance(0.45) ? expo(30) + 1 : Math.pow(r(), 1.4) * 600;
    const m = macro(d, Math.sin(th)), u = r(), hs = 4 + Math.pow(r(), 2.4) * 17, al = r.range(0.5, 1), sp = r.pick([SP_PALE, SP_PALE, SP_GOLD, SP_EMBER]);
    const q = life({ hs, sp, al: al * L.clamp(m * 1.35), base: 0 });
    if (u > Math.pow(m / 0.8, 1.6) + 0.07 || (d > BTOP - 4 && d < BBOT + 4)) continue;
    const p = a.pt(th, -d); if (p.y > H + 50) continue;
    q.x = p.x; q.y = p.y; surf.push(lens(q, d));
  }
  // a few fat glints where the light is hardest: these are the ones the eye catches
  for (let n = 0; n < 84; n++) {
    const th = r.gauss() * 0.2 - 0.03, hs = r.range(16, 32), al = r.range(0.7, 1);
    let d = 6 + expo(62);
    if (Math.abs(th) < 0.2) d = Math.max(d, 0.42 * hs + 2);      // their glow stays under the tagline zone
    const m = macro(d, Math.sin(th)), p = a.pt(th, -d), q = life({ x: p.x, y: p.y, hs, sp: SP_PALE, al: al * L.clamp(m * 1.3), base: 0 });
    q.fl = false; q.w = r.range(1.0, 1.7);
    if (d < 240 && Math.abs(th) < span) surf.push(q);
  }
  // the beads of the filigree catch the lamp one after another
  for (const b of beads) {
    const keep = r.chance(0.3), hs = r.range(7, 13), al = r.range(0.5, 0.9);
    const q = life({ x: b.x, y: b.y, hs, sp: SP_PALE, al: al * L.clamp(b.m * 1.9), base: 0 });
    if (keep && b.y < H + 30) surf.push(lens(q, b.d));
  }
  // the rim
  for (let n = 0; n < 1000; n++) {
    const th = r.range(-span, span), side = sstep(0.175, 0.42, Math.abs(th));
    const dr = Math.min(r.gauss() * 3.4 - 0.6, 7 + 14 * side), hs = 3 + Math.pow(r(), 2.2) * 10, al = r.range(0.5, 1), sp = r.pick([SP_PALE, SP_PALE, SP_GOLD]);
    const p = a.pt(th, dr);
    const q = lens(life({ x: p.x, y: p.y, hs: Math.min(hs, side > 0.1 ? 99 : 7 + (7 - dr)), sp, al: al * L.clamp(macro(0, Math.sin(th)) * 1.25), base: 0 }), 0);
    if (q.sp === SP_SOFT) { q.hs = Math.min(q.hs, 13); q.al *= 0.7; }
    surf.push(q);
  }
  // dust shed from the rim: thick against the arc, thinning outward; nothing beyond 9 px over the crest
  const dust = [];
  for (let n = 0; n < 1100; n++) {
    const th = r.range(-span, span), side = sstep(0.175, 0.42, Math.abs(th));
    const dr = 2 + expo(5 + 34 * side), hs = 1.8 + Math.pow(r(), 2.4) * 5, al = r.range(0.35, 1), sp = r.pick([SP_PALE, SP_GOLD, SP_GOLD, SP_EMBER]), v = r.range(1, 9);
    const q = life({ th, dr, hs, sp, al: al * (0.45 + 0.55 * Math.exp(-dr / 90)) * L.clamp(macro(0, Math.sin(th)) * 1.5), base: 0.3, v: v * side });
    if (dr <= 9 + 300 * side) dust.push(q);
  }
  // a very little dust adrift far out on the flanks, some of it out of focus
  for (let n = 0; n < 130; n++) {
    const th = r.sign() * r.range(0.26, span), side = sstep(0.175, 0.42, Math.abs(th));
    const dr = 36 + Math.pow(r(), 1.7) * 540 * side, big = r.chance(0.22), hs = big ? r.range(7, 15) : 2 + Math.pow(r(), 2) * 4, al = r.range(0.3, 0.9), v = r.range(3, 14);
    dust.push(life({ th, dr, hs, sp: big ? SP_SOFT : r.pick([SP_GOLD, SP_PALE, SP_EMBER]), al: al * (big ? 0.34 : 0.85) * Math.exp(-dr / 420), base: 0.45, v }));
  }
  // a few motes big enough to see: lit gold specks hanging beside the dome, never over the tagline
  for (let n = 0; n < 44; n++) {
    const th = r.sign() * r.range(0.215, span * 0.98), side = sstep(0.2, 0.45, Math.abs(th));
    const dr = 16 + Math.pow(r(), 1.5) * (90 + 330 * side), far = r.chance(0.3), hs = far ? r.range(10, 22) : r.range(5, 10.5), al = r.range(0.55, 1), v = r.range(4, 16);
    const q = life({ th, dr, hs, sp: far ? SP_SOFT : r.pick([SP_GOLD, SP_GOLD, SP_PALE, SP_EMBER]), al: al * (far ? 0.42 : 1) * Math.exp(-dr / 520), base: 0.5, v });
    q.fl = false; dust.push(q);
  }
  // star flares: each owns a frame, so two or three are always alight
  const stars = [];
  for (let n = 0; n < 24; n++) {
    const th = r.range(-0.45, 0.45), hs = r.range(78, 150) * (1 - 0.35 * Math.abs(th) / 0.45);
    let d = 10 + Math.pow(r(), 1.5) * 200;
    if (Math.abs(th) < 0.2) d = Math.max(d, 0.5 * hs + 6);      // keep the vertical ray out of the tagline zone
    const p = a.pt(th, -d);
    stars.push({ x: p.x, y: p.y, hs, al: r.range(0.8, 1) * L.clamp(macro(d, Math.sin(th)) * 1.7), f0: (n * 3) % 8 + r.range(-0.3, 0.3), w: r.range(1.5, 2.1) });
  }
  return { surf, dust, stars };
}

const twinkle = (q, f) => {
  if (q.fl) return hash2(q.id, f * 7 + 3) > 0.56 ? 1 : q.base + 0.1;
  const u = 1 - Math.abs(f - q.f0) / q.w;
  return u <= 0 ? q.base : Math.max(q.base, u * Math.sqrt(u));
};

export default {
  name: '马蹄金',
  tone: 'light',
  init(env) {
    const spr = buildSprites();
    const dome = buildDome(env, spr);
    const live = buildLive(env, dome.beads);
    S = { spr, dome, ...live };
  },
  draw(ctx, env, p) {
    const a = env.arc, f = env.frame, D = S.dome, spr = S.spr;
    const rot = L.lerp(-0.0065, 0.0065, p);
    ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, W, H);

    // dust hanging off the flanks (slower than the surface → parallax), drifting outward
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of S.dust) {
      const I = twinkle(q, f) * q.al; if (I < 0.03) continue;
      const pt = a.pt(q.th + rot * 0.55, q.dr + q.v * p), sp = spr[q.sp];
      ctx.globalAlpha = I; ctx.drawImage(sp, pt.x - q.hs, pt.y - q.hs, q.hs * 2, q.hs * 2);
    }
    ctx.restore();

    // the gold: detail slides round the circle centre, the arc itself stays put
    ctx.save();
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(D.cnv, D.X0, D.Y0);
    // the glitter: seeded by the frame number
    ctx.globalCompositeOperation = 'lighter';
    for (const q of S.surf) {
      const I = twinkle(q, f) * q.al; if (I < 0.03) continue;
      ctx.globalAlpha = I; ctx.drawImage(spr[q.sp], q.x - q.hs, q.y - q.hs, q.hs * 2, q.hs * 2);
    }
    ctx.restore();

    // a soft sheen travelling over the crown of the dome
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, L.lerp(-0.075, 0.045, p), -64, () => {
      ctx.scale(2.6, 1);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 210, [[0, 'rgba(255,214,120,0.2)'], [0.5, 'rgba(244,180,70,0.07)'], [1, 'rgba(233,160,50,0)']]);
      ctx.fillRect(-220, -220, 440, 440);
    });
    ctx.restore();

    // star flares (an optical artefact: they stay upright)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cr = Math.cos(rot), sr = Math.sin(rot), star = spr[SP_STAR];
    for (const q of S.stars) {
      const u = 1 - Math.abs(f - q.f0) / q.w; if (u <= 0) continue;
      const dx = q.x - a.cx, dy = q.y - a.cy, x = a.cx + dx * cr - dy * sr, y = a.cy + dx * sr + dy * cr, hs = q.hs * (0.55 + 0.45 * u);
      ctx.globalAlpha = q.al * Math.sqrt(u); ctx.drawImage(star, x - hs, y - hs, hs * 2, hs * 2);
    }
    ctx.restore();
  },
};
