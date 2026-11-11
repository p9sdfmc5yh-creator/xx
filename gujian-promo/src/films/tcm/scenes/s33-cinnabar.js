// s33 — 朱砂. Cinnabar on black, nothing but black and red, shot from straight above.
// The arc is the lip of a jet-black grinding dish: a hair-thin ridge of vermilion powder clings to it, and just outside
// runs a darker groove (the rim's outer wall, where no dust settles). Above the arc the black table is strewn with
// cinnabar dust like a red star field, thickest near the dish; inside the dish it is pure black, and from the bottom of
// frame rises a heap of cinnabar — a bed of scarlet powder studded with angular crystal fragments that flash.
//
// Everything is computed per pixel in init():
//   • the dust is ~10⁵ point sources splatted additively into an energy buffer (gaussians in focus, flat discs out of
//     focus), then tone-mapped through one black → deep red → vermilion → hot ramp, so cores burn out like on a sensor;
//   • the heap is a real height field: a powder mound plus thousands of convex crystals (each the minimum of a few
//     random planes → true flat facets), z-buffered, with marched shadows, AO and a specular lobe per facet.
// Three "glint" layers hold what only flares now and then (dust grains and crystal facets under three slightly different
// light directions); draw() shows one of them per frame, so the sparkle changes deterministically from frame to frame.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
const LW = W + PAD * 2, LH = H + PAD * 2, NPX = LW * LH;
let S = null;

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

// ── cheap deterministic lattice noise for the per-pixel passes ──
function hi(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const h01 = (x, y) => hi(x, y) / 4294967296;
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hi(xi, yi), b = hi(xi + 1, yi), c = hi(xi, yi + 1), d = hi(xi + 1, yi + 1);
  return ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) / 4294967296;
}
const fb3 = (x, y) => vn(x, y) * 0.57 + vn(x * 2.03 + 7.1, y * 2.03 - 3.3) * 0.29 + vn(x * 4.1 - 11.7, y * 4.1 + 5.9) * 0.14;
const norm3 = (x, y, z) => { const m = Math.hypot(x, y, z); return [x / m, y / m, z / m]; };

/** colour LUT over [0, max]; index = sqrt(v / max) so the dark end keeps its resolution */
const NL = 2048;
function lutE(stops, max) {
  const f = L.makeRamp(stops.map(([e, c]) => [e / max, c])), o = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const u = i / (NL - 1), c = f(u * u); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}
const li3 = (v, max) => ((Math.sqrt(v >= max ? 1 : v <= 0 ? 0 : v / max) * (NL - 1)) | 0) * 3;

// dust energy → colour (added on top of the black)
const EMAX = 4.5;
const DUST = lutE([[0, '#000000'], [0.04, '#1a0403'], [0.14, '#480907'], [0.36, '#84120c'], [0.7, '#b81a12'], [1.05, '#e22a1e'],
  [1.6, '#ff4a3c'], [2.3, '#ff8a80'], [3.2, '#ffd0cc'], [4.5, '#fff2ef']], EMAX);
// powder bed and crystal body, indexed by light
const IMAX = 1.5;
const POWDER = lutE([[0, '#120202'], [0.16, '#440807'], [0.36, '#84120c'], [0.58, '#bc1c11'], [0.8, '#e8301c'], [1.05, '#ff5540'], [1.5, '#ff907c']], IMAX);
const XTAL = lutE([[0, '#050101'], [0.12, '#220303'], [0.3, '#4e0707'], [0.5, '#84100c'], [0.7, '#bc1a12'], [0.9, '#e62e1e'], [1.15, '#ff5c48'], [1.5, '#ffb8a8']], IMAX);

/** additive point source: gaussian when sharp, a flat disc with a slightly brighter edge when defocused */
function splat(buf, x, y, sig, pk) {
  if (sig > 2.1) {
    const rd = sig * 1.55, e = Math.ceil(rd + 1), p0 = pk * 0.8;
    const i0 = Math.max(0, Math.floor(x) - e), i1 = Math.min(LW - 1, Math.floor(x) + e), j0 = Math.max(0, Math.floor(y) - e), j1 = Math.min(LH - 1, Math.floor(y) + e);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - y);
      if (d > rd + 0.8) continue;
      const q = d / rd;
      buf[j * LW + i] += p0 * (1 - sstep(rd - 0.8, rd + 0.8, d)) * (0.72 + 0.5 * q * q);
    }
    return;
  }
  const e = Math.ceil(sig * 2.6), k = -0.5 / (sig * sig), e2 = e * e + 0.5;
  const i0 = Math.max(0, Math.floor(x) - e), i1 = Math.min(LW - 1, Math.floor(x) + e), j0 = Math.max(0, Math.floor(y) - e), j1 = Math.min(LH - 1, Math.floor(y) + e);
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - y;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - x, d2 = dx * dx + dy * dy;
      if (d2 < e2) buf[j * LW + i] += pk * Math.exp(d2 * k);
    }
  }
}
/** a grain that flares: written straight into a glint image as the colour it adds over the still dust (E) under it */
function flare(Gg, E, x, y, sig, pk) {
  const e = Math.ceil(sig * 2.6), k = -0.5 / (sig * sig), e2 = e * e + 0.5;
  const i0 = Math.max(0, Math.floor(x) - e), i1 = Math.min(LW - 1, Math.floor(x) + e), j0 = Math.max(0, Math.floor(y) - e), j1 = Math.min(LH - 1, Math.floor(y) + e);
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - y;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - x, d2 = dx * dx + dy * dy;
      if (d2 >= e2) continue;
      const idx = j * LW + i, e0 = E[idx], l1 = li3(e0 + pk * Math.exp(d2 * k), EMAX), l0 = li3(e0, EMAX), o = idx * 4;
      const r = DUST[l1] - DUST[l0], g = DUST[l1 + 1] - DUST[l0 + 1], b = DUST[l1 + 2] - DUST[l0 + 2];
      if (r > Gg[o]) Gg[o] = r; if (g > Gg[o + 1]) Gg[o + 1] = g; if (b > Gg[o + 2]) Gg[o + 2] = b;
    }
  }
}

/** outline and height of the heap (seen from above: an ellipse whose top edge rises into frame, with a few slumped lobes) */
function pileShape() {
  const xc = 962, yc = 1240, ax = 735, ay = 440, Hm = 150;
  const nz = L.makeNoise('s33pile');
  const LOBE = new Float32Array(1026);
  for (let i = 0; i < 1026; i++) { const ang = -Math.PI + (i / 1024) * L.TAU; LOBE[i] = 1 + 0.09 * nz.n2(ang * 2.6 + 5, 0.3) + 0.06 * nz.n2(ang * 7.3, 4.4) + 0.025 * nz.n2(ang * 19, 8.1); }
  const lobe = (ang) => { const t = ((ang + Math.PI) / L.TAU) * 1024, i = t | 0; return LOBE[i] + (LOBE[i + 1] - LOBE[i]) * (t - i); };
  const rad = (x, y) => { const dx = (x - xc) / ax, dy = (y - yc) / ay; return Math.hypot(dx, dy) / lobe(Math.atan2(dy, dx)); };
  return { xc, yc, ax, ay, Hm, rad, lobe };
}
const lpPile = (x, y) => 0.47 + 0.62 * Math.exp(-(((x - 800) / 600) ** 2) - (((y - 850) / 215) ** 2));

// ───────────────────────── dust ─────────────────────────
function buildDust(env, P) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const E = new Float32Array(NPX);
  const flashes = [];                        // x, y, sigma, peak, group — the grains that only flare on some frames
  const nA = L.makeNoise('s33a'), nB = L.makeNoise('s33b');

  // slow fields on a coarse grid: density, light pool, circle of confusion, the calm patch behind the words
  const CS = 8, cw = Math.ceil(LW / CS) + 2, ch = Math.ceil(LH / CS) + 2;
  const D = new Float32Array(cw * ch), LP = new Float32Array(cw * ch), CO = new Float32Array(cw * ch), MK = new Float32Array(cw * ch);
  const tx = a.cx, ty = a.crestY - 138;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = i * CS - PAD, y = j * CS - PAD, k = j * cw + i;
    const ddx = x - cx, ddy = cy - y, dr = Math.hypot(ddx, ddy) - R, s = Math.atan2(ddx, ddy) * R;
    const m = 1 - sstep(0.5, 1.45, Math.hypot((x - tx) / 500, (y - ty) / 225));
    MK[k] = m;
    LP[k] = (0.66 + 0.58 * Math.exp(-(((x - 640) / 1100) ** 2) - ((Math.max(0, dr - 20) / 520) ** 2))) * (1 - 0.3 * m);
    CO[k] = 1.7 * sstep(260, 860, dr) + 0.8 * sstep(800, 1160, Math.abs(x - 960));
    if (dr < -12) continue;
    const cloud = nA.fbm(x / 430 + 3, y / 430 - 8, 4), ray = nB.fbm(s / 80 + 20, dr / 950 + 2, 3), fine = nB.fbm(x / 95 - 40, y / 95 + 13, 3);
    let d = 0.45 + 0.55 * Math.exp(-Math.max(0, dr - 56) / 320);                     // thickest near the dish
    d *= 0.8 + 0.4 * sstep(-0.45, 0.6, 0.55 * cloud + 0.42 * ray + 0.25 * fine);     // drifts, and rays thrown outward from the rim
    d *= 1 - 0.9 * sstep(29, 37, dr) * (1 - sstep(55, 65, dr));                      // the groove outside the rim stays clean
    if (dr < 29) d *= 1.1 + 0.9 * Math.exp(-Math.max(0, dr) / 8);                    // powder banked up against the lip
    d *= sstep(-7, 0.5, dr);
    d *= 1 - 0.5 * m;
    D[k] = d;
  }
  const bil = (F, x, y) => {
    const fx = (x + PAD) / CS, fy = (y + PAD) / CS, i0 = fx | 0, j0 = fy | 0, tx2 = fx - i0, ty2 = fy - j0, k = j0 * cw + i0;
    return (F[k] + (F[k + 1] - F[k]) * tx2) * (1 - ty2) + (F[k + cw] + (F[k + cw + 1] - F[k + cw]) * tx2) * ty2;
  };

  // 1) the star field on the table and on the rim's top face
  const r = L.rng('s33dust');
  const yMax = a.yAt(-PAD) + 10;
  // glitter, not LEDs: most grains are dull crimson flecks of no particular shape, a fifth are lit, and only the few flakes
  // that happen to lie flat to the lamp burn out to a pale point
  const grain = (x, y, boost) => {
    const u = r(), lp = bil(LP, x, y), coc = bil(CO, x, y), mk = bil(MK, x, y);
    let b, sig;
    if (u > 0.968) { b = r.range(2.4, 5.6) * (1 - 0.6 * mk); sig = r.range(0.58, 0.95); }
    else if (u > 0.91) { b = r.range(0.45, 1.2); sig = r.range(0.5, 0.85); }
    else { b = 0.04 + 0.24 * r() ** 2; sig = r.range(0.5, 1.0); }
    b *= lp * boost;
    const sg = Math.hypot(sig, coc), pk = (b * (sig * sig)) / (sg * sg) * (1 + 0.8 * coc);
    splat(E, x + PAD, y + PAD, sg, pk);
    if (u <= 0.968 && r() < 0.4) {
      const an = r.range(0, L.TAU), d = sig * r.range(0.9, 1.7);
      splat(E, x + PAD + Math.cos(an) * d, y + PAD + Math.sin(an) * d, sg * 0.85, pk * 0.7);
    }
    if (r() < 0.07 * (1 - 0.85 * mk)) flashes.push(x + PAD, y + PAD, Math.min(2, sg + 0.2), (r.range(0.8, 2.6) * lp) / (1 + 0.5 * coc), r.int(0, 2));
  };
  for (let n = 0; n < 230000; n++) {
    const x = r.range(-PAD, W + PAD), y = r.range(-PAD, yMax);
    if (r() * 2.2 > bil(D, x, y)) continue;
    grain(x, y, 1);
  }
  // pinches of powder that landed together
  for (let c = 0, t = 0; c < 16 && t < 1500; t++) {
    const x0 = r.range(-PAD, W + PAD), y0 = r.range(-PAD, yMax), d = bil(D, x0, y0);
    if (r() * 1.4 > d || bil(MK, x0, y0) > 0.25) continue;
    c++;
    const n = r.int(40, 150), rx = r.range(12, 38), ry = rx * r.range(0.35, 1), ang = r.range(0, Math.PI), ca = Math.cos(ang), sa = Math.sin(ang);
    for (let q = 0; q < n; q++) {
      const u = r.gauss() * rx, v = r.gauss() * ry, x = x0 + u * ca - v * sa, y = y0 + u * sa + v * ca;
      const dr = a.drAt(x, y);
      if (dr < 2 || (dr > 30 && dr < 64) || x < -PAD + 2 || x > W + PAD - 2 || y < -PAD + 2 || y > yMax) continue;
      grain(x, y, 1.1);
    }
  }

  // 2) the ridge of powder riding the lip — the arc itself. Its thickness wanders, with thin stretches and little heaps.
  const rl = L.rng('s33line');
  const sMax = a.span(PAD + 30) * R;
  for (let s = -sMax; s < sMax; s += 1) {
    const th = s / R;
    const tk = Math.max(0.14, 0.62 + 0.55 * nA.n2(s / 150, 3.3) + 0.3 * nA.n2(s / 37, 9.1) + 0.14 * nA.n2(s / 9, 1.7));
    const lit = 0.74 + 0.5 * Math.exp(-(((th + 0.07) / 0.26) ** 2));
    const n = Math.round(5.2 * tk + rl() * 1.2);
    for (let q = 0; q < n; q++) {
      let dr = -1.7 + rl.gauss() * (0.85 + 0.75 * tk);
      if (dr > 1.4) dr = 1.4 - rl() * 2.2;
      const p = a.pt((s + rl.range(-0.6, 0.6)) / R, dr);
      splat(E, p.x + PAD, p.y + PAD, rl.range(0.55, 0.85), rl.range(0.18, 0.5) * (0.72 + 0.5 * tk) * lit);
    }
    if (rl() < 0.03) { const p = a.pt(th, -1.5 + rl.range(-1.5, 1.2)); flashes.push(p.x + PAD, p.y + PAD, 0.8, rl.range(1.1, 2.4) * lit, rl.int(0, 2)); }
  }
  // powder that slid off the lip into the dish: a few small fans hanging under the arc (none right at the crest)
  const span0 = a.span(40);
  for (let f = 0; f < 8; f++) {
    let th0 = rl.range(-span0, span0);
    if (Math.abs(th0) < 0.06) th0 += th0 < 0 ? -0.07 : 0.07;
    const size = rl.range(0.4, 1.15), n = Math.round(380 * size * size), lean = rl.range(-0.3, 0.3);
    for (let q = 0; q < n; q++) {
      const down = (Math.abs(rl.gauss()) * 8 + rl() ** 2 * 30) * size, lat = rl.gauss() * (2.5 + down * 0.36) + down * lean;
      const p = a.pt(th0 + lat / R, -2 - down);
      splat(E, p.x + PAD, p.y + PAD, rl.range(0.5, 0.8), rl.range(0.08, 0.36) * Math.exp(-down / (24 * size)));
    }
  }

  // 3) inside the dish: fine powder around the foot of the heap, and a few strays on the black
  const rf = L.rng('s33foot');
  for (let n = 0; n < 12000; n++) {
    const ang = rf.range(-Math.PI * 0.985, -Math.PI * 0.015);
    const over = Math.abs(rf.gauss()) * 0.022 + rf() ** 4 * 0.1;
    const rr = (1 + over) * P.lobe(ang);
    const x = P.xc + P.ax * rr * Math.cos(ang) + rf.gauss() * 4, y = P.yc + P.ay * rr * Math.sin(ang) + rf.gauss() * 4;
    if (x < -PAD + 3 || x > W + PAD - 3 || y > H + PAD - 3 || a.drAt(x, y) > -16) continue;
    const u = rf(), b = (0.1 + 1.9 * u ** 5) * Math.exp(-over * 11) * lpPile(x, y);
    const sig = 0.5 + 0.6 * rf() ** 3;
    splat(E, x + PAD, y + PAD, sig, b);
    if (rf() < 0.05) flashes.push(x + PAD, y + PAD, sig + 0.2, rf.range(0.8, 2.2) * Math.exp(-over * 6), rf.int(0, 2));
  }
  for (let n = 0; n < 140; n++) {
    const x = rf.range(-PAD, W + PAD), y = rf.range(a.crestY, H + PAD);
    const dr = a.drAt(x, y);
    if (dr > -22 || P.rad(x, y) < 1.02) continue;
    splat(E, x + PAD, y + PAD, rf.range(0.5, 0.9), 0.08 + 1.1 * rf() ** 4);
  }
  return { E, flashes, bil, D, LP, MK, yMax };
}

/** energy buffer → opaque RGBA (dust on black), and the three flare groups → additive RGBA in G */
function dustImages(env, dust, G) {
  const a = env.arc, { E, flashes, bil, D } = dust;
  const img = new Uint8ClampedArray(NPX * 4);
  new Uint32Array(img.buffer).fill(0xff010102);            // the dish: pure black
  const jMax = Math.min(LH, Math.ceil(dust.yMax) + PAD);
  for (let j = 0; j < LH; j++) {
    const y = j - PAD, ddy = a.cy - y, above = j < jMax;
    for (let i = 0; i < LW; i++) {
      const idx = j * LW + i;
      let e = E[idx], tb = 0;
      if (above) {
        const x = i - PAD, dr = Math.sqrt((x - a.cx) * (x - a.cx) + ddy * ddy) - a.R;
        if (dr > -8) {
          tb = sstep(-3, 2, dr);                            // the table is a hair lighter than the inside of the dish
          // powder too fine to resolve: a grainy red haze wherever the dust lies thick
          if (i < LW - 8) {
            const mo = vn(x / 6.3 + 11, y / 6.3 - 3) * 0.6 + vn(x / 2.6 - 5, y / 2.6 + 17) * 0.4;
            e += bil(D, x, y) * bil(dust.LP, x, y) * (0.03 + 0.11 * mo * mo) * (0.5 + h01(i, j));
          }
          E[idx] = e;
        }
      }
      if (e === 0) continue;
      const li = li3(e, EMAX), o = idx * 4;
      img[o] = 2 + 4 * tb + DUST[li]; img[o + 1] = 1 + 3 * tb + DUST[li + 1]; img[o + 2] = 1 + 3 * tb + DUST[li + 2];
    }
  }
  for (let q = 0; q < flashes.length; q += 5) flare(G[flashes[q + 4]], E, flashes[q], flashes[q + 1], flashes[q + 2], flashes[q + 3]);
  return img;
}

// ───────────────────────── crystals ─────────────────────────
/** one fragment: the minimum of a few steep side planes and one to three shallow cleavage planes */
function mkCrystal(r, x, y, s, zb, align) {
  const K = s < 3 ? r.int(3, 5) : r.int(4, 7);
  const phi0 = r.range(0, L.TAU), elong = r.range(0, 0.42), phe = r.range(0, Math.PI);
  const nTop = s < 4 ? 1 : r.chance(0.6) ? 2 : r.chance(0.5) ? 3 : 1;
  const np = K + nTop;
  const pa = new Float32Array(np), pb = new Float32Array(np), pc = new Float32Array(np), pw = new Float32Array(np), pv = new Float32Array(np);
  let dmax = 0;
  for (let k = 0; k < K; k++) {
    const phi = phi0 + ((k + r.range(-0.34, 0.34)) / K) * L.TAU;
    const d = s * r.range(0.62, 1.06) * (1 + elong * Math.cos(2 * (phi - phe)));
    const m = r.range(1.15, 3.6);
    pa[k] = m * Math.cos(phi); pb[k] = m * Math.sin(phi); pc[k] = m * d;
    pw[k] = r.range(-1, 1); pv[k] = r.range(-1, 1);
    if (d > dmax) dmax = d;
  }
  for (let t = 0; t < nTop; t++) {
    const k = K + t, ph = r.range(0, L.TAU), mt = r.range(0.04, 0.72);
    if (align && t === 0) { pa[k] = align[0] + r.range(-0.09, 0.09); pb[k] = align[1] + r.range(-0.09, 0.09); } else { pa[k] = mt * Math.cos(ph); pb[k] = mt * Math.sin(ph); }
    pc[k] = s * r.range(0.5, 0.92) * (t ? r.range(0.9, 1.25) : 1);
    pw[k] = r.range(-0.4, 0.4); pv[k] = r.range(-0.4, 0.4);
  }
  return { x, y, s, z0: zb - s * r.range(0.12, 0.34), np, pa, pb, pc, pw, pv, ext: dmax * 1.5 + 2, tone: r.range(0.78, 1.14), seed: r.range(0, 99) };
}

/** box blur of a w×h float field, twice (≈ a soft gaussian) */
function boxBlur2(src, w, h, rad) {
  const tmp = new Float32Array(src.length), n = rad * 2 + 1;
  let cur = src;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      const row = y * w; let acc = 0;
      for (let x = -rad; x <= rad; x++) acc += cur[row + (x < 0 ? 0 : x)];
      for (let x = 0; x < w; x++) { tmp[row + x] = acc / n; acc += cur[row + Math.min(w - 1, x + rad + 1)] - cur[row + Math.max(0, x - rad)]; }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += tmp[(y < 0 ? 0 : y) * w + x];
      for (let y = 0; y < h; y++) { out[y * w + x] = acc / n; acc += tmp[Math.min(h - 1, y + rad + 1) * w + x] - tmp[Math.max(0, y - rad) * w + x]; }
    }
    cur = out;
  }
  return cur;
}

function buildCrystals(env, P, dust, G) {
  const a = env.arc, { xc, yc, ax, ay, Hm } = P;
  const Z = new Float32Array(NPX), F = new Int32Array(NPX).fill(-1);     // F: −1 nothing, −2 powder bed, ≥ 0 crystal facet
  // per crystal pixel: the facet that would come next (F2) and how far below it lies (GAP → 0 on a ridge), and the back
  // facet seen through the fragment (FB)
  const F2 = new Int32Array(NPX), FB = new Int32Array(NPX), GAP = new Float32Array(NPX);

  // 1) the powder mound. Outline and slow swells come from a coarse grid; the granules are per pixel.
  const jA = Math.max(1, Math.floor(yc - ay * 1.18) + PAD), iA = Math.max(1, Math.floor(xc - ax * 1.18) + PAD), iB = Math.min(LW - 2, Math.ceil(xc + ax * 1.18) + PAD);
  const BS = 4, bw = Math.ceil((iB - iA) / BS) + 2, bh = Math.ceil((LH - jA) / BS) + 2;
  const RD = new Float32Array(bw * bh), SW = new Float32Array(bw * bh);
  for (let jj = 0; jj < bh; jj++) for (let ii = 0; ii < bw; ii++) {
    const x = iA + ii * BS - PAD, y = jA + jj * BS - PAD;
    RD[jj * bw + ii] = P.rad(x, y) + 0.05 * (fb3(x / 46 + 9, y / 46) - 0.5);
    SW[jj * bw + ii] = 22 * (fb3(x / 90 + 3, y / 90 - 5) - 0.5);
  }
  for (let j = jA; j < LH - 1; j++) {
    const y = j - PAD, fy = (j - jA) / BS, j0 = fy | 0, ty = fy - j0;
    for (let i = iA; i <= iB; i++) {
      const fx = (i - iA) / BS, i0 = fx | 0, tx = fx - i0, k = j0 * bw + i0;
      const rd = (RD[k] + (RD[k + 1] - RD[k]) * tx) * (1 - ty) + (RD[k + bw] + (RD[k + bw + 1] - RD[k + bw]) * tx) * ty;
      const e = 1 - rd * rd;
      if (e <= 0) continue;
      const x = i - PAD;
      const sw = (SW[k] + (SW[k + 1] - SW[k]) * tx) * (1 - ty) + (SW[k + bw] + (SW[k + bw + 1] - SW[k + bw]) * tx) * ty;
      const z = Hm * e + sw * Math.min(1, e * 5) + 7 * (fb3(x / 17 - 8, y / 17 + 2) - 0.5) * Math.min(1, e * 12)
        + 3.2 * (vn(x / 7.1 + 20, y / 7.1) - 0.5) + 2.2 * vn(x / 3.3, y / 3.3) + 0.9 * vn(x / 1.4 + 50, y / 1.4);
      if (z < 2.4 + 2.6 * h01(i + 91, j + 17)) continue;         // the edge breaks up into single granules
      const idx = j * LW + i; Z[idx] = z; F[idx] = -2;
    }
  }

  // light: key from the upper left; three variants of it decide which facets flash on which frame
  const dirOf = (azDeg, elDeg) => { const c = Math.cos(L.deg(elDeg)); return [c * Math.cos(L.deg(azDeg)), c * Math.sin(L.deg(azDeg)), Math.sin(L.deg(elDeg))]; };
  const Lm = dirOf(-130, 36);
  const HV = [dirOf(-141, 37), dirOf(-104, 48), dirOf(-177, 30)].map((l) => norm3(l[0], l[1], l[2] + 1));
  const Hm0 = norm3(Lm[0], Lm[1], Lm[2] + 1);

  // 2) the fragments
  const r = L.rng('s33xt'), list = [];
  const bedZ = (x, y) => { const rd = P.rad(x, y); return rd < 1 ? Hm * (1 - rd * rd) : 0; };
  const inDish = (x, y, m) => a.drAt(x, y) < -m && x > -PAD + 4 && x < W + PAD - 4 && y < H + PAD - 4;
  // a few big ones, their main cleavage face turned to catch one of the three lights
  [[742, 868, 74, 0], [1168, 886, 66, 1], [968, 980, 80, 2], [556, 970, 58, 1], [1384, 986, 60, 0]].forEach(([hx, hy, hs, g]) => {
    const h = HV[g];
    list.push(mkCrystal(r, hx + r.range(-14, 14), hy + r.range(-10, 10), hs * r.range(0.92, 1.08), bedZ(hx, hy), [h[0] / h[2], h[1] / h[2]]));
  });
  const scatter = (count, tries, s0, s1, sPow, accept, minGap) => {
    for (let c = 0, t = 0; c < count && t < tries; t++) {
      const x = r.range(xc - ax * 1.3, xc + ax * 1.3), y = r.range(yc - ay * 1.35, H + PAD);
      const rd = P.rad(x, y), s = L.lerp(s0, s1, r() ** sPow);
      if (!inDish(x, y, 14 + s) || r() > accept(rd)) continue;
      if (minGap) { let ok = true; for (const o of list) if (Math.hypot(o.x - x, o.y - y) < (o.s + s) * minGap) { ok = false; break; } if (!ok) continue; }
      list.push(mkCrystal(r, x, y, s, bedZ(x, y)));
      c++;
    }
  };
  scatter(34, 4000, 26, 52, 1.6, (rd) => (rd > 0.3 && rd < 0.97 ? 1 : 0), 0.82);
  scatter(200, 9000, 9, 25, 1.8, (rd) => (rd < 0.9 ? 0.55 : rd < 1.03 ? 1 : 0), 0);
  scatter(1300, 30000, 3.2, 8.5, 2, (rd) => (rd < 1 ? 0.8 : Math.exp(-(rd - 1) * 40)), 0);
  scatter(2400, 60000, 1.3, 3.2, 1.5, (rd) => (rd < 0.95 ? 0.3 : Math.exp(-(rd - 0.95) * 26)), 0);
  // a few strays on the black of the dish
  for (let c = 0, t = 0; c < 12 && t < 4000; t++) {
    const x = r.range(-PAD, W + PAD), y = r.range(a.crestY + 30, H + PAD);
    const rd = P.rad(x, y), s = L.lerp(1.3, 5, r() ** 2.2);
    if (!inDish(x, y, 30) || rd < 1.1 || r() > Math.exp(-(rd - 1.1) * 4.5)) continue;
    list.push(mkCrystal(r, x, y, s, 0)); c++;
  }
  // crumbs among the dust on the table and the rim
  for (let c = 0, t = 0; c < 330 && t < 20000; t++) {
    const x = r.range(-PAD + 12, W + PAD - 12), y = r.range(-PAD + 12, dust.yMax);
    const dr = a.drAt(x, y), s = c < 34 ? r.range(4.4, 8.4) : L.lerp(1.4, 4.4, r() ** 2);
    if (dr < 4 + s || (dr > 26 - s && dr < 66 + s)) continue;
    if (r() * 1.6 > dust.bil(dust.D, x, y) * (1 - dust.bil(dust.MK, x, y)) ** 2) continue;
    list.push(mkCrystal(r, x, y, s, 0)); c++;
  }

  const FN = [], FCI = [], FIRE = [];  // facet normals (x, y, z), the crystal each facet belongs to, and its glow as a back facet
  const rq = L.rng('s33fire');
  list.forEach((c, ci0) => {
    const f0 = FCI.length;
    c.q = 1 / Math.max(8, c.s * 0.5);
    const bx = c.s * rq.range(-0.3, 0.3), by = c.s * rq.range(-0.3, 0.3);
    for (let k = 0; k < c.np; k++) {
      const n = norm3(c.pa[k], c.pb[k], 1); FN.push(n[0], n[1], n[2]); FCI.push(ci0);
      const nb = norm3(-c.pa[k] * 0.5, -c.pb[k] * 0.5, 1);
      FIRE.push(Math.pow(Math.max(0, nb[0] * Hm0[0] + nb[1] * Hm0[1] + nb[2] * Hm0[2]), 5) * rq.range(0.35, 1));
    }
    const e = Math.ceil(c.ext), ci = c.x + PAD, cj = c.y + PAD;
    const i0 = Math.max(1, Math.floor(ci - e)), i1 = Math.min(LW - 2, Math.ceil(ci + e)), j0 = Math.max(1, Math.floor(cj - e)), j1 = Math.min(LH - 2, Math.ceil(cj + e));
    const wob = c.s > 6 ? c.s * 0.075 : 0, q1 = 1 / (c.s * 0.36), q2 = 1 / (c.s * 0.15), slack = wob * 1.5;
    const { pa, pb, pc, pw, pv, np, z0 } = c;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - ci, dy = j + 0.5 - cj, idx = j * LW + i, lim = Z[idx] - z0 - slack;
      let hm = 1e9, km = 0, h2 = 1e9, k2 = 0;
      for (let k = 0; k < np; k++) {
        const h = pc[k] - pa[k] * dx - pb[k] * dy;
        if (h < hm) { h2 = hm; k2 = km; hm = h; km = k; if (h < lim) break; } else if (h < h2) { h2 = h; k2 = k; }
      }
      if (hm < lim) continue;
      if (wob) {    // fracture faces are never dead flat: let the planes swell and sag a little
        const w1 = (vn(i * q1 + c.seed, j * q1) - 0.5) * 2 * wob, w2 = (vn(i * q2 - c.seed, j * q2 + 9) - 0.5) * wob;
        hm = 1e9; h2 = 1e9;
        for (let k = 0; k < np; k++) {
          const h = pc[k] - pa[k] * dx - pb[k] * dy + w1 * pw[k] + w2 * pv[k];
          if (h < hm) { h2 = hm; k2 = km; hm = h; km = k; } else if (h < h2) { h2 = h; k2 = k; }
        }
      }
      const h = z0 + hm;
      if (h > Z[idx]) {
        Z[idx] = h; F[idx] = f0 + km; F2[idx] = f0 + k2; GAP[idx] = h2 - hm;
        // the far side of the fragment, seen through it: the same planes mirrored and shifted
        let bm = 1e9, kb = 0;
        for (let k = 0; k < np; k++) { const hb = pc[k] * 0.8 + pa[k] * (dx - bx) + pb[k] * (dy - by); if (hb < bm) { bm = hb; kb = k; } }
        FB[idx] = f0 + kb;
      }
    }
  });
  const nf = FCI.length;

  // 3) shade. Ambient occlusion from a blurred copy of the heights (heap region only).
  const aj0 = Math.max(0, jA - 24), ai0 = Math.max(0, iA - 24), aw = Math.min(LW, iB + 24) - ai0, ah = LH - aj0;
  const zs = new Float32Array(aw * ah);
  for (let j = 0; j < ah; j++) zs.set(Z.subarray((j + aj0) * LW + ai0, (j + aj0) * LW + ai0 + aw), j * aw);
  const ZB = boxBlur2(zs, aw, ah, 5);
  const out = new Uint8ClampedArray(NPX * 4);
  const lxy = Math.hypot(Lm[0], Lm[1]), dirx = Lm[0] / lxy, diry = Lm[1] / lxy, tanE = Lm[2] / lxy;
  const STEPS = [2, 4, 6, 9, 12, 16, 21, 27, 34, 42, 52, 64, 78];
  const OFF = STEPS.map((s) => Math.round(diry * s) * LW + Math.round(dirx * s)), RISE = STEPS.map((s) => s * tanE), SOFT = STEPS.map((s) => 1 / (1.2 + 0.22 * s));
  const FS = [0, 1, 2].map(() => new Float32Array(nf)), FX = [0, 1, 2].map(() => new Float32Array(nf)), FY = [0, 1, 2].map(() => new Float32Array(nf));
  const G0 = G[0], G1 = G[1], G2 = G[2];
  for (let j = 90; j < LH - 1; j++) {
    const y = j - PAD, ddy = a.cy - y;
    for (let i = 90; i < LW - 1; i++) {
      const idx = j * LW + i, f = F[idx];
      if (f === -1) continue;
      const x = i - PAD, z = Z[idx], o = idx * 4;
      const powder = f === -2;
      let nx, ny, nz, c = null, pm = 0.5;
      if (powder) {
        let gx = (Z[idx + 1] - Z[idx - 1]) * 0.5, gy = (Z[idx + LW] - Z[idx - LW]) * 0.5;
        gx = gx < -2.2 ? -2.2 : gx > 2.2 ? 2.2 : gx; gy = gy < -2.2 ? -2.2 : gy > 2.2 ? 2.2 : gy;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        nx = -gx * inv; ny = -gy * inv; nz = inv;
      } else {
        c = list[FCI[f]];
        // cleavage faces are mirror-smooth: the normal only drifts slowly across a face, so a highlight grades over it
        const sd = c.seed, q = c.q, pn = vn(i * q + sd, j * q); pm = vn(i * q - 31, j * q + sd);
        nx = FN[f * 3] + (pn - 0.5) * 0.12;
        ny = FN[f * 3 + 1] + (pm - 0.5) * 0.12;
        nz = FN[f * 3 + 2];
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= inv; ny *= inv; nz *= inv;
      }
      const lam = Math.max(0, nx * Lm[0] + ny * Lm[1] + nz * Lm[2]);
      // shadow: march toward the light across the height field
      let occ = 0;
      for (let s = 0; s < 13; s++) {
        const dz = Z[idx + OFF[s]] - z - RISE[s];
        if (dz > 0) { const oc = dz * SOFT[s]; if (oc > occ) { occ = oc; if (occ >= 1) break; } }
      }
      const sh = 1 - 0.88 * Math.min(1, occ);
      let ao = 1;
      if (j >= aj0 && i >= ai0 && i < ai0 + aw) { ao = 1 - (ZB[(j - aj0) * aw + i - ai0] - z) * 0.04; ao = ao < 0.4 ? 0.4 : ao > 1.2 ? 1.2 : ao; }
      const onTable = (x - a.cx) * (x - a.cx) + ddy * ddy > a.R * a.R;
      const lp = onTable ? dust.bil(dust.LP, x, y) * 1.15 : lpPile(x, y);
      const hsh = h01(i + 13, j + 29);
      if (powder) {
        const I = (0.11 + 0.76 * lam * sh) * ao * (0.8 + 0.42 * hsh) * lp;
        const li = li3(I, IMAX);
        out[o] = POWDER[li]; out[o + 1] = POWDER[li + 1]; out[o + 2] = POWDER[li + 2]; out[o + 3] = 255;
        G0[o] = G0[o + 1] = G0[o + 2] = G1[o] = G1[o + 1] = G1[o + 2] = G2[o] = G2[o + 1] = G2[o + 2] = 0;
        // single grains in the powder that catch the light
        const hg = h01(i + 311, j + 77);
        if (hg > 0.9925 && sh > 0.6) { const Gg = G[(hg * 4096 | 0) % 3], k = (0.4 + 0.6 * lam) * lp; Gg[o] = 255 * k; Gg[o + 1] = 150 * k; Gg[o + 2] = 118 * k; }
      } else {
        const tex = vn(i / 5.5 + c.seed, j / 5.5);
        // powder clinging to the faces (matte, brighter scarlet), in patches, more of it on the faces that look up
        const dusted = vn(i / 1.9 + c.seed, j / 1.9 - 4) > 0.95 - 0.34 * pm - 0.1 * nz ? 0.55 : 0;
        // the body is dark, dense crimson; what makes it a crystal is what it reflects
        const sheen = 0.5 * Math.pow(Math.max(0, nx * Hm0[0] + ny * Hm0[1] + nz * Hm0[2]), 12) * sh;
        // faces turned away from the lamp are not dead: light that entered the crystal elsewhere glows out of them, deep red
        const trans = 0.2 * sstep(0.15, 0.8, -(nx * dirx + ny * diry)) * (0.35 + 0.65 * ao);
        // … and through the faces one sees the far facets, some of them throwing the lamp back
        const fire = 0.3 * FIRE[FB[idx]] * (0.45 + 0.55 * ao) * (0.4 + 0.6 * sh);
        // ridges where two faces meet are chipped and catch the light as thin bright lines
        const f2 = F2[idx];
        let ex = FN[f * 3] + FN[f2 * 3], ey = FN[f * 3 + 1] + FN[f2 * 3 + 1], ez = FN[f * 3 + 2] + FN[f2 * 3 + 2];
        const einv = 1 / Math.sqrt(ex * ex + ey * ey + ez * ez); ex *= einv; ey *= einv; ez *= einv;
        const ridge = c.s > 4 ? Math.exp(-GAP[idx] * 0.9) * (0.3 + 0.95 * vn(i / 2.3 + c.seed, j / 2.3)) * (0.3 + 0.7 * sh) : 0;
        const eh = Math.max(0, ex * Hm0[0] + ey * Hm0[1] + ez * Hm0[2]);
        const I = ((0.045 + 0.32 * lam * sh) * ao * c.tone * (0.88 + 0.24 * tex) + sheen + trans + fire + 0.6 * ridge * eh * eh * eh) * lp;
        const li = li3(I, IMAX);
        let cr = XTAL[li], cg = XTAL[li + 1], cb = XTAL[li + 2];
        if (dusted) { const lq = li3((0.2 + 0.85 * lam * sh) * ao * (0.8 + 0.4 * hsh) * lp, IMAX); cr += (POWDER[lq] - cr) * dusted; cg += (POWDER[lq + 1] - cg) * dusted; cb += (POWDER[lq + 2] - cb) * dusted; }
        let base = 0;
        const gain = (0.25 + 0.75 * sh) * (1 - dusted) * Math.min(1.2, lp * 1.1) * (0.82 + 0.18 * tex);
        for (let g = 0; g < 3; g++) {
          const hv = HV[g], d = nx * hv[0] + ny * hv[1] + nz * hv[2];
          let sp = d > 0.9 ? Math.pow(d, 70) * gain : 0;
          if (ridge > 0.05) { const de = ex * hv[0] + ey * hv[1] + ez * hv[2]; if (de > 0.85) { const se = Math.pow(de, 36) * ridge * 1.1; if (se > sp) sp = se; } }
          if (sp > 1.15) sp = 1.15;
          const Gg = G[g];
          Gg[o] = 255 * sp; Gg[o + 1] = (66 + 150 * sp) * sp; Gg[o + 2] = (50 + 150 * sp) * sp;
          if (sp > 0.2) { FS[g][f] += sp; FX[g][f] += sp * i; FY[g][f] += sp * j; }
          base += sp;
        }
        // a trace of every flash stays in the still image, so nothing pops out of pure black
        base *= 0.16;
        out[o] = cr + 255 * base; out[o + 1] = cg + 120 * base; out[o + 2] = cb + 96 * base; out[o + 3] = 255;
      }
    }
  }

  // the facets that flash hardest get a small lens star
  const stars = [[], [], []];
  for (let g = 0; g < 3; g++) {
    const cand = [];
    for (let f = 0; f < nf; f++) if (FS[g][f] > 5) cand.push([FS[g][f], FX[g][f] / FS[g][f], FY[g][f] / FS[g][f]]);
    cand.sort((p, q) => q[0] - p[0]);
    for (const cd of cand) {
      if (stars[g].length >= 12) break;
      if (stars[g].some((s) => Math.hypot(s[1] - cd[1], s[2] - cd[2]) < 40)) continue;
      stars[g].push(cd);
    }
  }
  return { out, stars };
}

function toCanvas(arr) {
  const c = L.makeCanvas(LW, LH);
  c.getContext('2d').putImageData(new ImageData(arr, LW, LH), 0, 0);
  c._pad = PAD;
  return c;
}
/** blurred copy at 1/k resolution (cheap bloom); draw it back stretched to the source size */
function glowOf(src, px, k) {
  const c = L.makeCanvas(Math.ceil(src.width / k), Math.ceil(src.height / k)), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.filter = `blur(${(px / k).toFixed(2)}px)`;
  g.drawImage(src, 0, 0, c.width, c.height);
  g.filter = 'none';
  return c;
}

/** a point of light as the lens sees it: a burnt-out core in a small red halo — no star filter. (x, y) in layer pixels */
function star(g, x, y, size, alpha) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.fillStyle = L.radial(g, 0, 0, 0, size, [[0, `rgba(255,240,232,${alpha})`], [0.12, `rgba(255,156,132,${alpha * 0.55})`], [0.42, `rgba(232,48,28,${alpha * 0.12})`], [1, 'rgba(232,48,28,0)']]);
  g.fillRect(-size, -size, size * 2, size * 2);
  g.restore();
}

export default {
  name: '朱砂',
  tone: 'light',
  init(env) {
    const a = env.arc, R = a.R;
    let T0 = performance.now(); const tick = (n) => { const t = performance.now(); console.warn('T ' + n + ' ' + (t - T0).toFixed(0)); T0 = t; };
    const P = pileShape();
    const dust = buildDust(env, P); tick('dust');
    const G = [0, 1, 2].map(() => { const g = new Uint8ClampedArray(NPX * 4); new Uint32Array(g.buffer).fill(0xff000000); return g; });
    const dustC = toCanvas(dustImages(env, dust, G)); tick('dustImg');
    const xt = buildCrystals(env, P, dust, G); tick('xt');
    const xtC = toCanvas(xt.out);
    const full = (g) => g.fillRect(-PAD, -PAD, LW, LH);

    const base = L.makeLayer(PAD, (g) => {
      g.drawImage(dustC, -PAD, -PAD);
      // halation: the bright grains and the red line bleed a little into the black
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.18; g.drawImage(glowOf(dustC, 4, 2), -PAD, -PAD, LW, LH);
      g.globalAlpha = 0.1; g.drawImage(glowOf(dustC, 18, 6), -PAD, -PAD, LW, LH);
      g.globalAlpha = 1;
      // the polished inner wall of the dish mirrors the red line: a soft glow that dies within a few dozen px, weaker away from the lamp
      const wall = L.makeLayer(PAD, (w) => {
        w.fillStyle = L.radial(w, a.cx, a.cy, R - 86, R, [[0, 'rgba(200,36,20,0)'], [0.5, 'rgba(200,36,20,0.014)'], [0.86, 'rgba(232,48,28,0.05)'], [1, 'rgba(255,84,58,0.12)']]);
        full(w);
        w.globalCompositeOperation = 'destination-in';
        w.fillStyle = L.linear(w, -PAD, 0, W + PAD, 0, [[0, 'rgba(0,0,0,0.7)'], [0.36, 'rgba(0,0,0,1)'], [0.6, 'rgba(0,0,0,0.8)'], [1, 'rgba(0,0,0,0.4)']]);
        full(w);
      });
      g.save(); a.clipBelow(g, -2); g.drawImage(wall, -PAD, -PAD); g.restore();
      // the heap glows faintly on the black floor around it
      g.save(); a.clipBelow(g, -40);
      g.globalAlpha = 0.14; g.drawImage(glowOf(xtC, 30, 8), -PAD, -PAD, LW, LH);
      g.restore();
      // heap, strays and crumbs (a half-pixel resample over the top takes the stair-steps off the facet edges)
      g.globalCompositeOperation = 'source-over';
      g.drawImage(xtC, -PAD, -PAD);
      g.imageSmoothingEnabled = true;
      g.globalAlpha = 0.5; g.drawImage(xtC, -PAD + 0.5, -PAD + 0.5); g.globalAlpha = 1;
    });
    tick('base');
    // depth of field: the heap swells toward the lens at the bottom of frame and goes soft there
    const bg = base.getContext('2d');
    const by = PAD + 900, band = L.makeCanvas(LW, LH - by), sg = band.getContext('2d');
    sg.filter = 'blur(4.5px)'; sg.drawImage(base, 0, -by); sg.filter = 'none';
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.linear(sg, 0, 30, 0, 210, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    sg.fillRect(0, 0, LW, LH);
    bg.drawImage(band, -PAD, by - PAD);
    // the light falls off toward the corners
    bg.globalCompositeOperation = 'multiply';
    bg.fillStyle = L.radial(bg, 860, 600, 620, 1500, [[0, '#ffffff'], [1, '#7a6a66']]);
    full(bg);
    bg.globalCompositeOperation = 'source-over';
    tick('dof');

    // glint layers: additive, one per light variant
    const rs = L.rng('s33star');
    const glint = G.map((arr, k) => {
      const c = toCanvas(arr), g = c.getContext('2d');
      const b1 = glowOf(c, 3, 2), b2 = glowOf(c, 12, 4);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.7; g.drawImage(b1, 0, 0, LW, LH);
      g.globalAlpha = 0.5; g.drawImage(b2, 0, 0, LW, LH);
      g.globalAlpha = 1;
      for (const s of xt.stars[k]) star(g, s[1] + 0.5, s[2] + 0.5, L.clamp(7 + Math.sqrt(s[0]) * 1.5, 9, 28), L.clamp(0.35 + s[0] / 160, 0.4, 0.9));
      // … and a very few of the brightest dust grains
      let n = 0;
      for (let q = 0; q < dust.flashes.length && n < 8; q += 5) {
        if (dust.flashes[q + 4] !== k || dust.flashes[q + 3] < 2.1 || dust.flashes[q + 2] > 1.4 || rs() < 0.6) continue;
        star(g, dust.flashes[q], dust.flashes[q + 1], rs.range(6, 10), rs.range(0.3, 0.55)); n++;
      }
      return c;
    });
    tick('glint');
    S = { base, glint };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.004, 0.004, p), zoom = L.lerp(1.0, 1.012, p);
    L.blit(ctx, env, S.base, { rot, zoom });
    // sparkle: the flare groups take turns, one per frame (0 1 2 1 0 1 2 …)
    const f = p * (env.frames - 1), u = f % 4, t = u <= 2 ? u : 4 - u;
    for (let k = 0; k < 3; k++) {
      const w = 1 - Math.abs(t - k);
      if (w > 0.02) L.blit(ctx, env, S.glint[k], { rot, zoom, blend: 'lighter', alpha: w });
    }
    // a short highlight slides along the red line (the light stays put while the dish drifts under it)
    const hp = a.pt(L.lerp(-0.2, 0.13, p), 0);
    const bell = (c, k) => L.linear(ctx, hp.x - 270, 0, hp.x + 270, 0, [[0, L.rgba(c, 0)], [0.3, L.rgba(c, 0.22 * k)], [0.5, L.rgba(c, k)], [0.7, L.rgba(c, 0.22 * k)], [1, L.rgba(c, 0)]]);
    ctx.save();
    ctx.globalCompositeOperation = 'color-dodge'; ctx.strokeStyle = bell('#c8b4ac', 0.75); ctx.lineWidth = 12; a.stroke(ctx, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = bell('#ff5038', 0.1); ctx.lineWidth = 9; a.stroke(ctx, -1);
    ctx.strokeStyle = bell('#ffb49c', 0.45); ctx.lineWidth = 1.8; a.stroke(ctx, -1.6);
    ctx.restore();
  },
};
