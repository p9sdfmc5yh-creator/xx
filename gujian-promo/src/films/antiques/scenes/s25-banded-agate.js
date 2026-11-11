// s25 — 缠丝玛瑙. Macro photograph of a slice of banded agate lying on a sheet of 胭脂水 (rouge-pink) paper.
// The arc is the outer edge of the nodule's skin (皮壳): a honey-yellow rind, lit to cream along its top, over a wet,
// near-black husk. Under the husk hangs a row of translucent amber crystal "teeth" (two of them hold a small lilac
// pocket, 晶洞); the milky chalcedony below wraps every tooth, so its first layers hang as a string of drip-shaped
// scallops outlined in rouge. Deeper in, the silk-fine bands (缠丝) calm down and fall out of focus.
//
// How it is built (all in init):
//   • the banding is ONE scalar field — the distance from the inner wall (husk base ∪ round "drip" lobes), gently
//     warped — looked up in a 1-D colour sequence. Iso-lines of a single field can never cross each other.
//   • the raised skin gets a height map (bevel + broad wet lumps + strata) and is lit per pixel; three sets of specular
//     glints, computed for three light directions, are cross-faded in draw() so the wet highlights wander.
//   • depth of field: the finished slice is cross-faded into two blurred copies of itself away from the crest.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;
let S = null;

const sm = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// ── tiny allocation-free worley noise (squared distances in cD1/cD2, cell id in cId, offset to the nearest point in cDx/cDy) ──
let cD1 = 0, cD2 = 0, cId = 0, cDx = 0, cDy = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0, nx = 0, ny = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 255) / 255; nx = dx; ny = dy; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = id; cDx = nx; cDy = ny;
}

// ── palette ──
const C = {
  milk: [246, 239, 230], white: [255, 252, 246], water: [232, 219, 208],
  pinkPale: [248, 210, 225], pink: [238, 150, 188], rouge: [216, 74, 142], rougeDeep: [196, 50, 122],
  honeyPale: [249, 232, 190], honey: [241, 206, 128], honeyDeep: [229, 178, 88], lining: [226, 190, 138],
};

// ── the band sequence: colour as a function of distance from the wall (px) ──
const LUT_PX = 4, LUT_MAX = 900, LN = LUT_MAX * LUT_PX;
const ROUGE_T = 25;         // where the rouge line that outlines every drip starts
function buildBands() {
  const r = L.rng('s25bands');
  const bands = [];           // [t0, colour, softness of the boundary at t0]
  let t = 0;
  const push = (w, c, soft) => { bands.push([t, c, soft]); t += w; };
  // right against the crystals: a warm seam → a clean white halo → the rouge line and its long bleed
  push(3, C.lining, 0.8);
  push(5, C.honeyPale, 2.2);
  push(17, C.white, 3.2);
  push(6.5, C.rougeDeep, 2.6);
  push(3.2, C.rouge, 0.9);
  push(1.7, C.pink, 0.6);              // the dye takes differently in every layer: silk threads show through it
  push(4.6, C.rouge, 0.7);
  push(2.2, C.pinkPale, 0.6);
  push(6.5, C.pink, 0.9);
  push(1.6, C.rouge, 0.5);
  push(8, C.pink, 1.2);
  push(2, C.white, 0.7);
  push(15, C.pinkPale, 2.5);
  push(2.4, C.white, 1.1);
  push(2.6, C.pink, 0.7);
  push(12, C.pinkPale, 2);
  push(7, C.white, 6);
  push(2.2, C.honeyPale, 0.8);
  push(4.5, C.white, 1.1);
  push(1.7, C.honey, 0.6);
  push(22, C.milk, 2);
  // packets of silk-fine threads separated by calm milky zones; most of them only alternate opaque white with
  // translucent "water" — the tinted packets are the accents
  let last = '';
  while (t < LUT_MAX + 40) {
    let kind = r.pick(['ghost', 'pink', 'ghost', 'honey', 'wide', 'ghost', 'mixed']);
    if (kind === last) kind = kind === 'ghost' ? r.pick(['pink', 'honey']) : 'ghost';
    if (!last) kind = 'honey';
    last = kind;
    if (kind === 'pink' || kind === 'honey' || kind === 'mixed') {
      const fam = kind === 'pink' ? [C.pinkPale, C.pinkPale, C.pink, C.rouge] : kind === 'honey' ? [C.honeyPale, C.honey, C.honey, C.honeyDeep] : [C.pinkPale, C.honeyPale, C.pink, C.honey, C.water];
      const n = r.int(3, 8);
      for (let i = 0; i < n; i++) {
        // a thread: crisp on the wall side, its tint sometimes seeping into the white that follows
        if (r.chance(0.16)) push(r.range(5, 11), fam[0], r.range(0.6, 1.4)); else push(r.range(1.4, 3.4), r.pick(fam), r.range(0.4, 0.9));
        push(r.chance(0.16) ? r.range(8, 16) : r.range(2.2, 6), r.chance(0.55) ? C.white : r.chance(0.5) ? C.milk : C.water, r.chance(0.6) ? r.range(0.5, 1.1) : r.range(1.5, 3.6));
      }
    } else if (kind === 'ghost') {
      const n = r.int(3, 7);
      for (let i = 0; i < n; i++) { push(r.range(2.5, 10), C.water, r.range(0.8, 3.5)); push(r.range(3, 12), C.white, r.range(0.8, 3.5)); }
    } else {
      // a wider tinted layer: crisp on the wall side, dissolving on the other
      const pinkish = r.chance(0.5), c = pinkish ? C.pinkPale : C.honeyPale;
      push(r.range(1.8, 3.2), pinkish ? C.pink : C.honey, 0.6);
      push(r.range(12, 26), c, 1.4);
      push(r.range(8, 14), C.milk, r.range(6, 10));
    }
    if (r.chance(0.9)) push(r.range(18, 50) * (1 + t / 400), C.milk, r.range(4, 8));       // the calm zones widen toward the heart of the stone
  }
  const lut = new Float32Array((LN + 8) * 3);
  let bi = 0;
  for (let i = 0; i < LN + 8; i++) {
    const x = i / LUT_PX;
    while (bi < bands.length - 2 && x >= bands[bi + 1][0]) bi++;
    const b = bands[bi], prev = bands[Math.max(0, bi - 1)], next = bands[bi + 1];
    let c0 = b[1][0], c1 = b[1][1], c2 = b[1][2];
    const aa = (x - b[0]) / b[2];
    if (bi > 0 && aa < 1) { const w = 0.5 + 0.5 * aa * aa * (3 - 2 * aa), p = prev[1]; c0 = p[0] + (c0 - p[0]) * w; c1 = p[1] + (c1 - p[1]) * w; c2 = p[2] + (c2 - p[2]) * w; }
    const bb = (next[0] - x) / next[2];
    if (bb < 1 && bb >= 0) { const w = 0.5 * (1 - bb * bb * (3 - 2 * bb)), q = next[1]; c0 += (q[0] - c0) * w; c1 += (q[1] - c1) * w; c2 += (q[2] - c2) * w; }
    lut[i * 3] = c0; lut[i * 3 + 1] = c1; lut[i * 3 + 2] = c2;
  }
  return lut;
}

/** separable box blur of a float grid (edges clamped) */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc / n; acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / n; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}

function rampLut(stops, n = 256) {
  const f = L.makeRamp(stops), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** fine grain, w×h, tiled from a small patch (random grain shows no seam) */
function grainFill(w, h, seed, amount) {
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = g.createPattern(L.grainTex(320, 320, { seed, amount }), 'repeat'); g.fillRect(0, 0, w, h);
  return c;
}

/** cross-fade a canvas into a blurred copy of itself where `mask(g)` paints alpha (colour and coverage both interpolate) */
function dofMix(sharp, px, mask) {
  const w = sharp.width, h = sharp.height;
  const m = L.makeCanvas(w, h); mask(m.getContext('2d'));
  const b = L.blurred(sharp, px), bg = b.getContext('2d');
  bg.globalCompositeOperation = 'destination-in'; bg.drawImage(m, 0, 0);
  const sg = sharp.getContext('2d');
  sg.save(); sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.globalCompositeOperation = 'destination-out'; sg.drawImage(m, 0, 0);
  sg.globalCompositeOperation = 'lighter'; sg.drawImage(b, 0, 0);
  sg.restore();
}

/** the agate slice: everything below the arc, plus three layers of wandering glints for the skin */
function buildSlice(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 26;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s25a'), nB = L.makeNoise('s25b');
  const bandLut = buildBands();

  // ── 1-D profiles along the arc (index = u + UM; u = arc length from the crest, px; v = depth below the arc, px) ──
  const UM = 1900, UN = UM * 2 + 2;
  const vTop = new Float32Array(UN), vRind = new Float32Array(UN), vBase = new Float32Array(UN), vHusk = new Float32Array(UN);
  for (let i = 0; i < UN; i++) {
    const u = i - UM;
    vTop[i] = L.clamp(0.3 + 2.4 * nA.n2(u / 120, 1.7) + 1.0 * nA.n2(u / 31, 8.3), -2.8, 3.4);      // silhouette: stays within ±3.5 px of the arc
    vRind[i] = Math.max(14, 37 + 14 * nB.n2(u / 190, 4.4) + 6 * nB.n2(u / 52, 12.9));               // honey rind → dark husk
    vBase[i] = 124 + 15 * nA.fbm(u / 260, 21.5, 2) + 5 * nB.n2(u / 60, 30.2);                     // the wall the bands hang from (before the drips)
    vHusk[i] = vBase[i] - 7 + 8 * nB.n2(u / 105, 44.4) + 3 * nA.n2(u / 27, 51.0);                // husk → crystal lining
  }
  const prof = (arr, u) => { const f = u + UM, i = f | 0; return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };

  // ── drip lobes hanging from the husk: no two alike ──
  const rs = L.rng('s25lobes');
  const seeds = [];
  for (let u = -1850; u < 1850;) {
    const kind = rs();
    let r, hang;
    if (kind < 0.42) { r = rs.range(46, 78); hang = rs.range(16, 42); }          // broad shallow swells
    else if (kind < 0.82) { r = rs.range(32, 54); hang = rs.range(48, 88); }     // teeth
    else { r = rs.range(22, 34); hang = rs.range(92, 132); }                     // the odd long drip
    seeds.push({ u, r, hang, lean: rs.range(-16, 16), neck: rs.range(0.62, 0.95), geo: 0 });
    u += r * rs.range(1.5, 2.5) + rs.range(8, 64);
  }
  // two of them hold a small crystal pocket
  const geos = [];
  for (const [gu, gr, gh] of [[-150, 60, 78], [560, 48, 62]]) {
    let best = seeds[0];
    for (const s of seeds) if (Math.abs(s.u - gu) < Math.abs(best.u - gu)) best = s;
    best.r = gr; best.hang = gh; best.lean = 0; best.neck = 0.92; best.geo = 1;
  }
  const BK = 128, buckets = [];
  for (const s of seeds) {
    const vb = prof(vBase, s.u);
    s.cu = s.u + s.lean; s.cv = vb + s.hang - s.r;          // centre of the round tip
    s.x0 = s.u; s.y0 = vb - 20;                             // the neck runs from inside the husk down to the tip
    s.ex = s.cu - s.x0; s.ey = s.cv - s.y0; s.il = 1 / Math.max(1e-3, s.ex * s.ex + s.ey * s.ey);
    s.rn = s.r * s.neck; s.long = s.hang > s.r * 0.9;
    if (s.geo) geos.push({ cu: s.cu, cv: s.cv - 2, rp: s.r - 17, ph: geos.length * 2.7 });
    const b = (s.u + UM) / BK | 0;
    (buckets[b] || (buckets[b] = [])).push(s);
  }
  // broad lobes that the deeper bands swell into (so they never read as a bullseye)
  const macro = [];
  for (let u = -2000; u < 2000;) { macro.push({ u, a: rs.range(14, 44), rho: rs.range(520, 1000) }); u += rs.range(240, 520); }
  const macroAt = (u) => { let m = -99; for (const q of macro) { const b = q.a - (u - q.u) * (u - q.u) / (2 * q.rho); m = -smin(-m, -b, 26); } return m; };

  // ── fields on a 3-px grid: wall distance D, band coordinate T, colour wash W, mottling M, rouge stain P ──
  const G = 3, gw = Math.ceil(RW / G) + 2, gh = Math.ceil(RH / G) + 2;
  const Dg = new Float32Array(gw * gh), Tg = new Float32Array(gw * gh), Wg = new Float32Array(gw * gh), Mg = new Float32Array(gw * gh), Pg = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    const ddy = cy - (Y0 + j * G);
    for (let i = 0; i < gw; i++) {
      const ddx = X0 + i * G - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), v0 = R - rr, k = j * gw + i;
      if (v0 < 50) { Dg[k] = v0 - 124; continue; }
      const u0 = Math.atan2(ddx, ddy) * R;
      // a little warp so the lobes are lumpy and angular instead of compass-drawn
      const u = u0 + 10 * nA.n2(u0 / 52, v0 / 52 + 3.3) + 1.5 * nB.n2(u0 / 19, v0 / 19), v = v0 + 10 * nB.n2(u0 / 52 + 9.1, v0 / 52) + 1.5 * nA.n2(u0 / 19 + 5, v0 / 19);
      let d = v - prof(vBase, u);
      const b0 = (u + UM) / BK | 0;
      for (let b = b0 - 4; b <= b0 + 4; b++) {
        const list = buckets[b]; if (!list) continue;
        for (let q = 0; q < list.length; q++) {
          const s = list[q];
          const du = u - s.cu, dv = v - s.cv;
          d = smin(d, Math.sqrt(du * du + dv * dv) - s.r, 7);
          if (s.long) {
            const px = u - s.x0, py = v - s.y0, tt = L.clamp((px * s.ex + py * s.ey) * s.il);
            const qx = px - s.ex * tt, qy = py - s.ey * tt;
            d = smin(d, Math.sqrt(qx * qx + qy * qy) - s.rn, 9);
          }
        }
      }
      Dg[k] = d;
    }
  }
  // deeper bands forget the sharp cusps between the drips: they follow a progressively smoothed copy of the wall distance
  const Db1 = boxBlur(boxBlur(Dg, gw, gh, 4), gw, gh, 4), Db2 = boxBlur(boxBlur(Db1, gw, gh, 11), gw, gh, 11), Db3 = boxBlur(boxBlur(Db2, gw, gh, 21), gw, gh, 21);
  for (let j = 0; j < gh; j++) {
    const ddy = cy - (Y0 + j * G);
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i, d0 = Dg[k];
      if (d0 < -1.5) continue;
      const ddx = X0 + i * G - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), v = R - rr, u = Math.atan2(ddx, ddy) * R;
      let d = d0 + (Db1[k] - d0) * sm(8, 50, d0);
      d += (Db2[k] - d) * sm(40, 140, d0);
      d += (Db3[k] - d) * sm(140, 330, d0);
      const deep = sm(40, 280, d);
      const tb = d * (1 + 0.16 * nA.n2(u / 650, 3.1) + 0.15 * nB.n2(u / 170, 7.7) * (1 - sm(36, 130, d))) - deep * macroAt(u) + 11 * deep * nA.fbm(u / 420, v / 260, 2) + 0.5 * sm(8, 60, d) * nB.n2(u / 60, v / 60);
      Tg[k] = Math.max(0, tb);
      // where the tint of the bands fades: partly along the bands, partly in soft clouds that ignore them
      const wash = L.clamp(0.22 + 0.75 * nB.fbm(u / 220 + 9, tb / 90, 2), 0, 0.82), cloud = 0.78 * sm(0.02, 0.5, nA.fbm(u / 230 + 77, v / 160 - 31, 2));
      const flick = 0.25 * sm(-0.2, 0.6, nB.n2(u / 240 + 3, tb / 9));          // every thread also waxes and wanes on its own
      Wg[k] = Math.min(0.94, sm(70, 150, tb) * (1 - (1 - wash) * (1 - cloud) * (1 - flick)) + 0.5 * sm(170, 520, tb));
      Mg[k] = nA.fbm(u / 170 - 4, v / 170 + 8, 2);
      Pg[k] = sm(0.2, 0.7, nB.fbm(u / 320 - 40, v / 210 + 13, 2)) * sm(110, 230, tb);
    }
  }

  // ── pass 1: the polished face (chalcedony + crystal teeth), height of the raised skin ──
  const img = new ImageData(RW, RH), px = img.data;
  const Hh = new Float32Array(N), Sk = new Float32Array(N), Rb = new Float32Array(N), Al = new Float32Array(N), Mo = new Float32Array(N), Pt = new Float32Array(N);
  const AMB = rampLut([[0, '#1c0e05'], [0.18, '#52290a'], [0.36, '#9c5a14'], [0.54, '#d49028'], [0.7, '#edc064'], [0.86, '#f8e3b6'], [1, '#fffaf0']]);
  const GEO = rampLut([[0, '#3a2862'], [0.2, '#7459a6'], [0.42, '#a48ccf'], [0.64, '#c9b9e7'], [0.84, '#e9e0f6'], [1, '#ffffff']]);
  const Gs = new Uint8Array(N);       // crystal sparkle: which glint set (1..3) a pixel belongs to
  let jSkinMax = 0;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j), fy = j / G, j0 = fy | 0, ty = fy - j0;
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), v = R - rr;
      if (v < -5) continue;
      // u (arc length) costs an atan2: most of the chalcedony never needs it
      let u = NaN, al = 1;
      if (v < 6) { u = Math.atan2(ddx, ddy) * R; al = L.clamp(v - prof(vTop, u) + 0.5); if (al <= 0) continue; }
      const k = j * RW + i, o = k * 4;
      Al[k] = al; px[o + 3] = al * 255;
      const fx = i / G, i0 = fx | 0, tx = fx - i0, g0 = j0 * gw + i0, g1 = g0 + gw;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const d = Dg[g0] * w00 + Dg[g0 + 1] * w10 + Dg[g1] * w01 + Dg[g1 + 1] * w11;
      const skin = L.clamp(0.5 - d);                                             // 1 inside the wall (husk or crystal)
      let hk = 40;                                                               // depth below the lower edge of the husk
      if (d < 18) { if (u !== u) u = Math.atan2(ddx, ddy) * R; hk = v - (prof(vHusk, u) + 4 * nB.fbm(u / 70, v / 50, 2)); }
      const husk = skin * L.clamp(0.5 - hk * 0.8);
      Sk[k] = husk;
      if (husk < 1) {
        let cr = 0, cg = 0, cb = 0;
        if (skin < 1) {
          const tb = Tg[g0] * w00 + Tg[g0 + 1] * w10 + Tg[g1] * w01 + Tg[g1 + 1] * w11;
          const wv = Wg[g0] * w00 + Wg[g0 + 1] * w10 + Wg[g1] * w01 + Wg[g1 + 1] * w11;
          const mv = Mg[g0] * w00 + Mg[g0 + 1] * w10 + Mg[g1] * w01 + Mg[g1 + 1] * w11;
          const li = Math.min(LN - 2, tb * LUT_PX), l0 = li | 0, lt = li - l0, lo = l0 * 3;
          cr = bandLut[lo] + (bandLut[lo + 3] - bandLut[lo]) * lt; cg = bandLut[lo + 1] + (bandLut[lo + 4] - bandLut[lo + 1]) * lt; cb = bandLut[lo + 2] + (bandLut[lo + 5] - bandLut[lo + 2]) * lt;
          // the tint of a band comes and goes
          cr += (246 - cr) * wv; cg += (239 - cg) * wv; cb += (230 - cb) * wv;
          // a faint rouge stain soaked into the stone here and there, not tied to any one band
          const pv = (Pg[g0] * w00 + Pg[g0 + 1] * w10 + Pg[g1] * w01 + Pg[g1 + 1] * w11) * 0.2;
          cr += (240 - cr) * pv; cg += (150 - cg) * pv; cb += (186 - cb) * pv;
          if (tb < 150) {
            if (u !== u) u = Math.atan2(ddx, ddy) * R;
            const hang = L.clamp((v - d - prof(vBase, u) - 3) / 50);
            const pool = sm(-0.12, 0.42, nB.fbm(u / 150 + 5, v / 95 - 7, 2));
            if (tb < ROUGE_T + 2) {
              // here and there the dye pools right up against the crystals and swallows the white halo
              const am = pool * 0.86 * sm(2, 11, tb) * (0.45 + 0.55 * hang);
              cr += (200 - cr) * am; cg += (52 - cg) * am; cb += (126 - cb) * am;
            } else {
              // rouge bleeding off the drips: the lower a lobe hangs, the more it stains the bands around it
              const am = Math.exp(-(tb - ROUGE_T) / 34) * (0.16 + 0.5 * hang + 0.22 * pool);
              cr += (216 - cr) * am; cg += (74 - cg) * am; cb += (142 - cb) * am;
            }
          }
          // translucency: slow mottling, a touch deeper toward the bottom of the slice
          const mt = (1 + 0.035 * mv) * (1 - 0.06 * sm(220, 640, v));
          cr *= mt; cg *= mt * (1 - 0.012 * sm(220, 640, v)); cb *= mt * (1 - 0.03 * sm(220, 640, v));
        }
        if (skin > 0) {
          if (j > jSkinMax) jSkinMax = j;
          // crystal: columnar facets grown inward from the husk — dark amber at the root, paler and more
          // translucent toward the tip, with a thin pale lining where it meets the chalcedony
          cell(u / 27 + 3.7, v / 40 + 1.3);
          let s1 = Math.sqrt(cD1), e = sm(0, 0.3, Math.sqrt(cD2) - s1), f = (0.5 * (cId - 0.5) + 0.3 * (cDx + cDy)) * e;      // soft facets: no outline, they just lean different ways
          const veil = nA.fbm(u / 24 + 3, v / 95, 2);                                                                     // columnar veils inside the quartz
          const td = sm(-6, 72, hk), wl = sm(-12, -1, d);
          let tone = 0.12 + 0.52 * td + 0.1 * veil * (0.4 + 0.6 * td) + 0.32 * f * (0.3 + 0.7 * td);
          tone += (0.92 - tone) * wl * 0.75;
          let ti = (L.clamp(tone) * 255 | 0) * 3;
          let xr = AMB[ti], xg = AMB[ti + 1], xb = AMB[ti + 2];
          if (cId > 0.9 && cDx * cDx * 5 + cDy * cDy * 0.6 < 0.012 && wl < 0.3 && td > 0.25) Gs[k] = 1 + ((cId * 97) | 0) % 3;      // a sliver of light on the odd facet
          // crystal pocket: the facets turn lilac around a small dark hollow
          for (let q = 0; q < geos.length; q++) {
            const ge = geos[q], du = (u - ge.cu) / 1.28, dv = (v - ge.cv) / 0.92;
            if (Math.abs(du) > ge.rp + 16 || Math.abs(dv) > ge.rp + 16) continue;
            const an = Math.atan2(du, dv), rd = Math.sqrt(du * du + dv * dv);
            const rim = ge.rp * (1 + 0.2 * nA.n2(an * 1.1 + ge.ph, 5.5 + ge.ph) + 0.08 * nB.n2(an * 3.3 + ge.ph, 2.2));
            const lm = sm(rim + 7, rim - 9, rd);
            if (lm <= 0) continue;
            cell(u / 16 + ge.ph, v / 18);
            s1 = Math.sqrt(cD1); e = sm(0, 0.26, Math.sqrt(cD2) - s1); f = (0.5 * (cId - 0.5) + 0.34 * (cDx + cDy)) * e;
            const rho = rd / rim, hollow = sm(0.4, 0.22, rho + 0.2 * (cId - 0.5));
            let t2 = 0.6 + 0.62 * f + 0.2 * sm(0.45, 1, rho) - 0.16 * (1 - e);
            t2 += (0.1 + 0.14 * cId - t2) * hollow;
            ti = (L.clamp(t2) * 255 | 0) * 3;
            xr += (GEO[ti] - xr) * lm; xg += (GEO[ti + 1] - xg) * lm; xb += (GEO[ti + 2] - xb) * lm;
            Gs[k] = (cId > 0.74 && s1 < 0.24 && hollow < 0.5 && lm > 0.8) ? 1 + ((cId * 97) | 0) % 3 : 0;
          }
          cr += (xr - cr) * skin; cg += (xg - cg) * skin; cb += (xb - cb) * skin;
        }
        // the raised husk overhangs the polished face: a dark crevice right under its lower edge
        if (hk < 14) { const q = L.clamp((14 - hk) / 14), sh = 1 - 0.6 * q * q; cr *= sh; cg *= sh * 0.96; cb *= sh * 0.96; }
        px[o] = cr; px[o + 1] = cg; px[o + 2] = cb;
      }
      if (husk > 0) {
        if (j > jSkinMax) jSkinMax = j;
        // height of the raised skin
        const rv = v - prof(vTop, u), vr = prof(vRind, u);
        const rb = v - (vr + 8 * nB.fbm(u / 62, v / 40, 2) + 1.4 * nA.n2(u / 19 + 2, v / 19));
        Rb[k] = rb;
        const rind = sm(2.4, -2.4, rb);
        cell(u / 30, v / 30);
        const pit = cId > 0.68 ? sm(0.3, 0.03, Math.sqrt(cD1)) : 0;
        Pt[k] = pit;
        const vh = prof(vHusk, u), gv = v - (vr + (vh - vr) * 0.56 + 9 * nB.n2(u / 150 + 8, 3.3));                    // one wavy seam through the husk: it is laid down in two coats
        const seam = Math.exp(-gv * gv / 14) * (0.55 + 0.45 * nA.n2(u / 210, 9.9));
        cell(u / 74 + 11.3, v / 46 + 2.9);
        const bead = cId > 0.84 ? 3.2 * sm(0.2, 0.02, Math.sqrt(cD1)) : 0;                                              // the odd bead of water standing on it
        const lumpH = 3.2 * nA.fbm(u / 170, v / 70, 2) + 1.0 * nB.n2(u / 60 + 7, v / 36) - 1.2 * seam + bead;          // husk: broad, nearly flat swells
        const lumpR = 2.5 * nA.fbm(u / 92 + 50, v / 40, 2) + 0.4 * nB.fbm(u / 23, v / 23, 2);                          // rind: a smooth waxy crust
        const lump = lumpH + (lumpR - lumpH) * rind;
        const ledge = 1.5 * Math.exp(-(hk + 8) * (hk + 8) / 18);                                                     // a low lip just inside the lower edge
        Hh[k] = (9 * sm(0, 14, rv) + lump * sm(0, 8, rv) + 3.2 * rind - 2.2 * pit * rind + ledge) * sm(0, 9, -hk) * sm(0, 8, -d);
        Mo[k] = nA.fbm(u / 90 - 4, v / 50 + 8, 2);
      }
    }
  }

  // ── pass 2: light the skin ──
  const SH = Math.min(RH, jSkinMax + 3);
  const LX = -0.42, LY = -0.72, LZ = 0.55;
  const HN = Math.hypot(LX, LY, LZ + 1), HX = LX / HN, HY = LY / HN, HZ = (LZ + 1) / HN;      // half-vector of the key light (broad gloss)
  // glints: a tight lobe ~19° off the surface normal, swung to three azimuths → three sets that only the steeper wet slopes reach
  const halves = [-0.5, 0, 0.5].map((ph) => {
    const lx = LX * Math.cos(ph) - LY * Math.sin(ph), ly = LX * Math.sin(ph) + LY * Math.cos(ph), n = Math.hypot(lx, ly), t = 0.34;
    return [lx / n * Math.sin(t), ly / n * Math.sin(t), Math.cos(t)];
  });
  const specI = halves.map(() => new ImageData(RW, SH));
  const glowI = new ImageData(RW, SH), gd = glowI.data;
  const RIND = rampLut([[0, '#6a3a08'], [0.2, '#b8760f'], [0.4, '#e2a428'], [0.55, '#efbe48'], [0.7, '#f8d672'], [0.85, '#ffeaa0'], [1, '#fffbe2']]);
  for (let j = 1; j < SH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, husk = Sk[k], o = k * 4;
      if (Gs[k]) { for (let q = 0; q < 3; q++) if (Gs[k] === q + 1) { const sd = specI[q].data; sd[o] = 255; sd[o + 1] = 250; sd[o + 2] = 240; sd[o + 3] = 225 * (1 - husk); } }
      if (husk <= 0) continue;
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * inv, ny = -hy * inv, nz = inv;
      const diff = Math.max(0, nx * LX + ny * LY + nz * LZ);
      const nh = Math.max(0, nx * HX + ny * HY + nz * HZ);
      const gloss = Math.pow(nh, 18);
      const rb = Rb[k], rind = sm(1.8, -1.8, rb), mo = Mo[k];
      // husk: near-black brown, wet — a broad grey sheen where it leans to the light; an amber-brown fringe under the rind
      const sh = 0.68 + 0.5 * diff;
      let hr = (40 + 12 * mo) * sh + 30 * gloss, hg = (28 + 9 * mo) * sh + 27 * gloss, hb = (17 + 6 * mo) * sh + 24 * gloss;
      const up = Math.max(0, -ny) * 0.07; hr += 194 * up; hg += 51 * up; hb += 122 * up;      // the rouge paper mirrored in the wet stone
      const fr = sm(18, 1, rb) * 0.72;
      hr += (132 * sh - hr) * fr; hg += (70 * sh - hg) * fr; hb += (14 * sh - hb) * fr;
      // rind: bright honey, burnt out to cream where the light hits it square
      const tv = L.clamp(0.4 + 0.44 * diff + 0.2 * gloss + 0.08 * mo - 0.26 * Pt[k] - 0.24 * sm(-15, 0, rb));
      const ri = (tv * 255 | 0) * 3;
      let cr = hr + (RIND[ri] - hr) * rind, cg = hg + (RIND[ri + 1] - hg) * rind, cb = hb + (RIND[ri + 2] - hb) * rind;
      if (husk < 1) { cr = px[o] + (cr - px[o]) * husk; cg = px[o + 1] + (cg - px[o + 1]) * husk; cb = px[o + 2] + (cb - px[o + 2]) * husk; }
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb;
      const ga = rind * husk * Al[k] * sm(0.66, 0.98, tv);
      if (ga > 0.02) { gd[o] = 255; gd[o + 1] = 232; gd[o + 2] = 160; gd[o + 3] = ga * 255; }
      // glints
      const kk = husk * Al[k] * (0.85 + 0.15 * (1 - rind));
      for (let q = 0; q < 3; q++) {
        const hq = halves[q], sp = sm(0.22, 0.7, Math.pow(Math.max(0, nx * hq[0] + ny * hq[1] + nz * hq[2]), 170) * 1.7) * kk;      // a hard-edged glint, the way a point light sits on wet stone
        if (sp > 0.012) { const sd = specI[q].data; sd[o] = 255; sd[o + 1] = 248 - 14 * rind; sd[o + 2] = 228 - 60 * rind; sd[o + 3] = sp * 255; }
      }
    }
  }

  const slice = L.makeCanvas(RW, RH), sg = slice.getContext('2d');
  sg.putImageData(img, 0, 0);
  // a little depth inside the stone (soft-light bloom of itself) and a fine tooth so nothing is vector-flat
  L.overlayOn(slice, L.blurred(slice, 7), { blend: 'soft-light', alpha: 0.28 });
  {
    // what a polished slab always carries under a macro lens: a few specks of dust and hairline scratches
    const rd = L.rng('s25dust');
    sg.save(); sg.translate(-X0, -Y0); sg.globalCompositeOperation = 'source-atop'; sg.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const th = rd.range(-0.4, 0.4), dr = -rd.range(190, 520), p0 = a.pt(th, dr), an = rd.range(-0.5, 0.5) + (rd.chance(0.5) ? 0 : 1.2), len = rd.range(50, 190);
      sg.strokeStyle = `rgba(255,255,255,${rd.range(0.1, 0.2)})`; sg.lineWidth = rd.range(0.6, 1.1);
      sg.beginPath(); sg.moveTo(p0.x, p0.y); sg.quadraticCurveTo(p0.x + Math.cos(an) * len * 0.5 + rd.range(-5, 5), p0.y + Math.sin(an) * len * 0.5 + rd.range(-5, 5), p0.x + Math.cos(an) * len, p0.y + Math.sin(an) * len); sg.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const p0 = a.pt(rd.range(-0.42, 0.42), -rd.range(150, 520));
      sg.fillStyle = `rgba(74,38,44,${rd.range(0.25, 0.55)})`;
      sg.beginPath(); sg.ellipse(p0.x, p0.y, rd.range(0.8, 2.1), rd.range(0.7, 1.5), rd.range(0, 3), 0, 7); sg.fill();
    }
    sg.restore();
  }
  { const soft = L.blurred(slice, 0.7); sg.save(); sg.globalCompositeOperation = 'copy'; sg.drawImage(soft, 0, 0); sg.restore(); }      // no lens is pixel-sharp
  L.overlayOn(slice, grainFill(RW, RH, 's25grain', 0.1), { blend: 'overlay', alpha: 0.5 });
  // contact shadow: a narrow dark-rouge fringe where the slice rests on the paper (taken before the glow spills over the edge)
  const sil = L.makeCanvas(RW, SH), sl = sil.getContext('2d');
  sl.drawImage(slice, 0, 0); sl.globalCompositeOperation = 'source-in'; sl.fillStyle = '#560a32'; sl.fillRect(0, 0, RW, SH);
  const shadow = L.blurred(sil, 5);
  // the lit rind blooms a little, the way an over-exposed edge does in a macro shot
  const gc = L.makeCanvas(RW, SH); gc.getContext('2d').putImageData(glowI, 0, 0);
  sg.save(); sg.globalCompositeOperation = 'screen'; sg.globalAlpha = 0.55; sg.drawImage(L.blurred(gc, 9), 0, 0); sg.restore();
  // depth of field: sharp around the crest, softer toward the ends of the arc and the bottom of the frame
  const fxc = cx - X0, fyc = a.crestY - Y0 + 70;
  const ell = (r0, r1) => (g) => { g.translate(fxc, fyc); g.scale(3.1, 1); g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); g.fillRect(-2000, -2000, 4000, 4000); };
  dofMix(slice, 2.4, ell(170, 400));
  dofMix(slice, 7, ell(300, 620));
  const spec = specI.map((im) => { const c = L.makeCanvas(RW, SH); c.getContext('2d').putImageData(im, 0, 0); const b = L.makeCanvas(RW, SH), bg = b.getContext('2d'); bg.drawImage(c, 0, 0); bg.globalAlpha = 0.5; bg.filter = 'blur(3px)'; bg.drawImage(c, 0, 0); return b; });
  return { slice, spec, shadow, X0, Y0 };
}

/** the sheet of 胭脂水 paper: flat colour, the finest tooth */
function buildBg() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#c2337a'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.26;
  g.drawImage(L.noiseTex(W, H, { seed: 's25paper', scale: 5, octaves: 2, res: 0.5, contrast: 1.5 }), 0, 0);
  g.globalAlpha = 0.12;
  g.drawImage(L.noiseTex(W, H, { seed: 's25paper2', scale: 620, octaves: 3, res: 0.125 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const r = L.rng('s25fib');
  g.lineCap = 'round';
  for (let i = 0; i < 360; i++) {
    const x = r() * W, y = r() * H, len = r.range(5, 22), an = r() * Math.PI;
    g.strokeStyle = r.chance(0.5) ? `rgba(255,214,232,${r.range(0.03, 0.08)})` : `rgba(96,10,52,${r.range(0.03, 0.08)})`;
    g.lineWidth = r.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-3, 3), y + Math.sin(an) * len * 0.5 + r.range(-3, 3), x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(grainFill(W, H, 's25g', 0.11), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

export default {
  name: '缠丝玛瑙',
  tone: 'light',
  init(env) {
    S = { bg: buildBg(), ...buildSlice(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.drawImage(S.bg, 0, 0);
    const rot = L.lerp(-0.0042, 0.0042, p), zoom = L.lerp(1.0, 1.01, p);
    // the three glint sets take turns: the wet highlights wander over the skin
    const w = [L.clamp(1 - 2 * p), 1 - Math.abs(2 * p - 1), L.clamp(2 * p - 1)];
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.globalAlpha = 0.34; ctx.drawImage(S.shadow, S.X0, S.Y0 - 1); ctx.globalAlpha = 1;
      ctx.drawImage(S.slice, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) if (w[k] > 0.004) { ctx.globalAlpha = Math.pow(w[k], 0.6); ctx.drawImage(S.spec[k], S.X0, S.Y0); }
    });
    // soft sheen sliding over the polished face
    ctx.save(); a.clipBelow(ctx, -4); ctx.globalCompositeOperation = 'soft-light';
    a.at(ctx, L.lerp(-0.2, -0.12, p), -420, () => {
      ctx.scale(2.6, 1);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 260, [[0, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-270, -270, 540, 540);
    });
    ctx.restore();
  },
};
