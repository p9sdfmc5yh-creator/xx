// s23 — 红外热成像 (the file keeps its first-cut name). An infrared thermogram of a round hall's eave in saturated
// false colour, filling the whole frame: no black, no dots, no HUD.
//   arc   = the eave edge (檐口): cool lime-yellow above it, hot magenta / violet below it
//   below = a row of big, uneven tile-end blobs (勾头) hugging the arc — each with a violet core inside a raspberry
//           body, on a coral band — then broad concentric isotherm bands (purple / yellow / purple / amber …)
//           that swell, thin out and drift a little as they go down
//   above = soft vertical bands (the columns and door leaves of the storey behind, far out of focus): amber, coral,
//           magenta and two thin cold lines. Behind the tagline they keep to yellow ↔ lime — the same brightness —
//           so the ink lettering sits on an even, bright field.
// How it is made: ONE scalar "temperature" field T(x, y) is assembled per pixel (analytic eave edge, rounded-box blobs,
// a radial band profile, a low-res stripe field, noise) and pushed through ONE colour ramp. Every boundary therefore
// carries the real isotherm fringe of a thermal camera (lime → yellow → orange → red on the way to magenta) and the
// colours never mix into mud. Lens softness and depth of field are added afterwards in colour space.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 140;
const LW = W + PAD * 2, LH = H + PAD * 2;
let S = null;

// cold → hot
const THERMO = L.makeRamp([
  [0.00, '#3b5b7c'], [0.07, '#4a8b8a'], [0.15, '#56bf74'], [0.26, '#a2d83a'], [0.385, '#dde43a'], [0.48, '#f9d638'],
  [0.56, '#fba42e'], [0.635, '#f36a36'], [0.70, '#e93a55'], [0.78, '#d81b74'], [0.86, '#b2127c'], [0.93, '#86107a'], [1.00, '#5a0f6a'],
]);
const T_AIR = 0.385;    // the lime-yellow of the open air above the eave
const T_HOT = 0.87;     // the purple the roof rests at between its bands

const sst = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

/** three noise fields packed into the RGB of one low-res image, enlarged to the layer by the canvas (bilinear) */
function noiseRGB(div, smooth, fn) {
  const M = 3;                                         // spare cells all round, so the blur below never reaches past the image
  const gw = Math.ceil(LW / div) + 1 + M * 2, gh = Math.ceil(LH / div) + 1 + M * 2;
  const img = new ImageData(gw, gh); const d = img.data;
  const v = [0, 0, 0];
  let k = 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    fn((i - M) * div - PAD, (j - M) * div - PAD, v);
    d[k++] = 128 + 127 * v[0]; d[k++] = 128 + 127 * v[1]; d[k++] = 128 + 127 * v[2]; d[k++] = 255;
  }
  const small = L.makeCanvas(gw, gh); small.getContext('2d').putImageData(img, 0, 0);
  const out = L.makeCanvas(LW, LH); const g = out.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (smooth) g.filter = `blur(${div * smooth}px)`;    // bilinear kinks would turn into polygonal isotherms
  g.drawImage(small, 0, 0, gw, gh, -M * div, -M * div, gw * div, gh * div);
  g.filter = 'none';
  return g.getImageData(0, 0, LW, LH).data;
}

// ───────────────────────── above the eave: vertical bands ─────────────────────────
// c = centre x, hw = half width, A = peak ΔT (+ hot, − cold), soft = edge softness (× hw), top = y where it fades in,
// gap = px above the eave where it gives out, pool = how much it swells into a drop just before that,
// foot = how much it swells where it meets the eave
const STRIPES = [
  { c: -80, hw: 70, A: 0.25, soft: 0.7 },
  { c: 92, hw: 46, A: 0.24, soft: 0.8, tilt: 0.01 },
  { c: 168, hw: 40, A: -0.07, soft: 1.0 },
  { c: 236, hw: 8, A: -0.36, soft: 1.0, foot: 1.6, tilt: -0.006 },
  { c: 302, hw: 24, A: 0.12, soft: 0.9 },
  { c: 430, hw: 46, A: 0.21, soft: 0.75, tilt: 0.008 },
  { c: 558, hw: 30, A: 0.4, soft: 0.8, tilt: -0.004, gap: 74, pool: 0.5 },
  { c: 684, hw: 30, A: -0.16, soft: 0.8 },
  { c: 772, hw: 46, A: 0.4, soft: 0.45, tilt: 0.006 },
  { c: 884, hw: 20, A: -0.3, soft: 0.8 },
  { c: 1012, hw: 28, A: 0.22, soft: 0.6, tilt: -0.008 },
  { c: 1108, hw: 40, A: -0.28, soft: 0.6 },
  { c: 1204, hw: 34, A: 0.42, soft: 0.5 },
  { c: 1290, hw: 20, A: -0.14, soft: 0.9 },
  { c: 1388, hw: 44, A: 0.22, soft: 0.8, tilt: 0.006 },
  { c: 1484, hw: 19, A: 0.42, soft: 0.85, tilt: -0.004, gap: 96, pool: 0.6 },
  { c: 1590, hw: 30, A: -0.17, soft: 0.9 },
  { c: 1684, hw: 40, A: 0.26, soft: 0.8, tilt: -0.01 },
  { c: 1770, hw: 16, A: 0.12, soft: 0.9 },
  { c: 1846, hw: 9, A: -0.38, soft: 1.0, foot: 1.8, tilt: 0.005 },
  { c: 1922, hw: 44, A: 0.28, soft: 0.7 },
  { c: 2056, hw: 50, A: 0.18, soft: 0.6 },
];
const UDIV = 4;
function buildStripes(env, teeth) {
  const a = env.arc;
  const gw = Math.ceil(LW / UDIV) + 2, gh = Math.ceil(LH / UDIV) + 2;
  const U = new Float32Array(gw * gh);
  const nz = L.makeNoise('s23stripes');
  STRIPES.forEach((st, n) => {
    const k = n * 7.31 + 1.7;
    for (let j = 0; j < gh; j++) {
      const y = j * UDIV - PAD;
      const cx = st.c + (st.tilt || 0) * (y - 300) + 5 * nz.n2(y / 380 + k, k * 3.7);
      const up = a.yAt(L.clamp(cx, a.cx - a.R * 0.9, a.cx + a.R * 0.9)) - y;       // px above the eave
      let hw = st.hw * (1 + 0.12 * nz.n2(y / 260 - k * 2.1, k));
      if (st.foot) hw *= 1 + st.foot * (1 - sst(4, 64, up));
      if (st.pool) { const q = (up - st.gap - 46) / 58; hw *= 1 + st.pool * Math.exp(-q * q); }
      // a wash, not a ruled bar: it swells and thins along its length
      let e = L.clamp(0.86 + 0.3 * nz.n2(y / 400 + k * 5.3, 1.7 - k) + 0.07 * nz.n2(y / 150 - k * 1.3, k * 2.9), 0.5, 1.2);
      if (st.top !== undefined) e *= sst(st.top - 80, st.top + 80, y);
      if (st.gap) e *= sst(st.gap - 46, st.gap + 40, up);
      if (st.A > 0) e *= L.lerp(0.62, 1, sst(0, 130, up));                           // hot bands cool a little toward the eave, so the eave keeps its edge
      if (e <= 0) continue;
      const sf = Math.max(7, hw * st.soft), amp = st.A * e;
      const i0 = Math.max(0, Math.floor((cx - hw - sf + PAD) / UDIV)), i1 = Math.min(gw - 1, Math.ceil((cx + hw + sf + PAD) / UDIV));
      for (let i = i0; i <= i1; i++) {
        const dd = Math.abs(i * UDIV - PAD - cx);
        U[j * gw + i] += amp * (1 - sst(hw - sf, hw + sf, dd));
      }
    }
  });
  // cold pockets: small green spots sitting in some of the notches between the tile ends, just above the eave
  const r = L.rng('s23pockets');
  for (let n = 0; n < teeth.length - 1; n++) {
    const t0 = teeth[n], t1 = teeth[n + 1];
    if (!r.chance(0.8)) continue;
    const s = (t0.s + t0.hw + t1.s - t1.hw) / 2 + r.range(-8, 8);
    const p = a.pt(s / a.R, r.range(5, 10)), rx = r.range(20, 34), ry = r.range(8, 13), A = -r.range(0.14, 0.27);
    const i0 = Math.max(0, Math.floor((p.x - rx * 2.6 + PAD) / UDIV)), i1 = Math.min(gw - 1, Math.ceil((p.x + rx * 2.6 + PAD) / UDIV));
    const j0 = Math.max(0, Math.floor((p.y - ry * 2.6 + PAD) / UDIV)), j1 = Math.min(gh - 1, Math.ceil((p.y + ry * 2.6 + PAD) / UDIV));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ex = (i * UDIV - PAD - p.x) / rx, ey = (j * UDIV - PAD - p.y) / ry;
      U[j * gw + i] += A * Math.exp(-(ex * ex + ey * ey));
    }
  }
  // behind the tagline the bands may change hue (yellow ↔ lime) but not brightness
  // … and everywhere the air carries fine vertical streaks (thinner behind the tagline)
  const LIMH = 0.062, LIMC = 0.1;
  for (let j = 0; j < gh; j++) {
    const y = j * UDIV - PAD;
    const cy = L.lerp(0.7, 1, sst(a.crestY - 520, a.crestY - 280, y));
    for (let i = 0; i < gw; i++) {
      const x = i * UDIV - PAD;
      const c = sst(548, 640, x) * (1 - sst(1280, 1372, x)) * cy;
      const streak = 0.03 * nz.fbm(x / 26 + 50.5, y / 1150 + 7.7, 2) + 0.024 * nz.n2(x / 74 - 9.1, y / 560 + 3.3);
      let u = U[j * gw + i] + streak * (1 - 0.62 * c);
      if (c > 0) u += ((u > 0 ? LIMH * Math.tanh(u / LIMH) : LIMC * Math.tanh(u / LIMC)) - u) * c;
      U[j * gw + i] = u;
    }
  }
  return { U, gw };
}

// ───────────────────────── along the eave: tile-end blobs ─────────────────────────
function buildTeeth(env) {
  const a = env.arc, r = L.rng('s23teeth');
  const SM = a.span(PAD + 320) * a.R;
  const mk = (s, pitch) => {
    const flaw = r();
    const t = { s, hw: pitch * r.range(0.26, 0.35), dep: r.range(76, 110), heat: r.range(0.86, 0.96), lean: r.range(-0.2, 0.2) };
    if (flaw < 0.12) { t.heat = r.range(0.8, 0.84); t.cool = true; }   // a tile that runs cooler
    else if (flaw < 0.3) { t.hw *= 0.72; t.dep *= 0.78; }              // a chipped, smaller one
    return t;
  };
  const list = [mk(40, 190)];
  for (let s = list[0].s; s < SM;) { const p = r.range(150, 216); s += p; list.push(mk(s, p)); }
  for (let s = list[0].s; s > -SM;) { const p = r.range(150, 216); s -= p; list.unshift(mk(s, p)); }
  for (const t of list) {                                              // hottest around the crest, cooling toward both ends
    const u = Math.abs(t.s);
    if (u < 350) { if (!t.cool) t.heat = Math.max(t.heat + 0.05, 0.955); } else if (u > 720) t.heat = Math.min(t.heat, 0.89);
  }
  // nearest-blob lookup along the arc, 2 px steps
  const n = Math.ceil(SM) + 2, idx = new Int16Array(n);
  let q = 0;
  for (let i = 0; i < n; i++) {
    const s = -SM + i * 2;
    while (q < list.length - 1 && Math.abs(list[q + 1].s - s) < Math.abs(list[q].s - s)) q++;
    idx[i] = q;
  }
  // flat arrays for the pixel loop
  const m = list.length;
  const ts = new Float32Array(m), thw = new Float32Array(m), tdc = new Float32Array(m), thd = new Float32Array(m), trad = new Float32Array(m), theat = new Float32Array(m), tlean = new Float32Array(m);
  list.forEach((t, i) => { ts[i] = t.s; thw[i] = t.hw; tdc[i] = t.dep / 2 - 4; thd[i] = t.dep / 2 + 4; trad[i] = Math.min(t.hw, thd[i]) * r.range(0.46, 0.7); theat[i] = t.heat; tlean[i] = t.lean; });
  return { list, SM, idx, n, ts, thw, tdc, thd, trad, theat, tlean };
}

// ───────────────────────── below the eave: the radial band profile ─────────────────────────
// [px below the eave, T]. Smooth-stepped between the knots, so every band has a plateau and soft shoulders.
const BANDS = [[0, 0.6], [38, 0.625], [70, 0.7], [100, 0.8], [126, 0.835], [138, 0.93], [148, 0.945], [160, 0.85], [174, 0.84], [186, 0.925], [198, 0.935],
  [222, 0.62], [232, 0.535], [288, 0.52], [302, 0.62], [334, 0.89], [392, 0.925], [432, 0.68], [446, 0.6], [500, 0.585], [518, 0.69], [560, 0.89], [640, 0.87],
  [692, 0.68], [706, 0.62], [766, 0.62], [788, 0.71], [846, 0.89], [1400, 0.89]];
function bandProfile() {
  const P = new Float32Array(1400);
  let q = 0;
  for (let d = 0; d < P.length; d++) {
    while (q < BANDS.length - 2 && d >= BANDS[q + 1][0]) q++;
    P[d] = L.lerp(BANDS[q][1], BANDS[q + 1][1], sst(BANDS[q][0], BANDS[q + 1][0], d));
  }
  return P;
}

// ───────────────────────── the thermogram ─────────────────────────
function buildThermogram(env) {
  const a = env.arc, R = a.R;
  const nz = L.makeNoise('s23thermo');
  // slow fields at 1/8: R = overall drift, G = how strongly each band shows (polar), B = lazy radial wander of the bands (polar)
  const NA = noiseRGB(8, 0, (x, y, v) => {
    const dx = x - a.cx, dy = a.cy - y, rr = Math.hypot(dx, dy), s = Math.atan2(dx, dy) * R, d = R - rr;
    v[0] = L.clamp(1.5 * nz.fbm(x / 1000 + 3.1, y / 1000 - 1.7, 3), -1, 1);
    v[1] = L.clamp(1.7 * nz.fbm(s / 620 + 9.2, d / 230 + 4.4, 3), -1, 1);
    v[2] = L.clamp(1.7 * nz.fbm(s / 520 - 5.3, d / 340 + 11.8, 2), -1, 1);
  });
  // quicker fields at 1/4: R = isotherm wobble (~90 px), G = blotches (~46 px), B = patches (~170 px)
  const NB = noiseRGB(4, 0.8, (x, y, v) => {
    v[0] = L.clamp(1.5 * nz.fbm(x / 88 + 21, y / 88 - 13, 2), -1, 1);
    v[1] = L.clamp(1.5 * nz.fbm(x / 46 + 40, y / 46 - 20, 2), -1, 1);
    v[2] = L.clamp(1.5 * nz.fbm(x / 170 - 8, y / 170 + 33, 2), -1, 1);
  });
  const tt = buildTeeth(env);
  const { U, gw } = buildStripes(env, tt.list);
  const P = bandProfile(), PMAX = P.length - 2;
  // sensor grain: a gaussian tile, read once per pixel and once per 2×2 block
  const gr = L.rng('s23grain'), G = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) G[i] = L.clamp(gr.gauss(), -2.5, 2.5);
  // colour table (little-endian ABGR)
  const LUT = new Uint32Array(2048);
  for (let i = 0; i < 2048; i++) { const c = THERMO(i / 2047); LUT[i] = (255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]); }

  const img = new ImageData(LW, LH), out = new Uint32Array(img.data.buffer);
  const I = 1 / 127;
  for (let j = 0; j < LH; j++) {
    const y = j - PAD, dy = a.cy - y, dy2 = dy * dy;
    const fy = (y - (a.crestY + 40)) / 560, fy2 = fy * fy;
    const uty = (j & 3) * 0.25, ur0 = (j >> 2) * gw, ur1 = ur0 + gw;
    const g0 = (j & 255) << 8, g1 = (((j >> 1) + 91) & 255) << 8;
    let k = j * LW * 4, o = j * LW;
    for (let i = 0; i < LW; i++, k += 4, o++) {
      const dx = i - PAD - a.cx;
      const rr = Math.sqrt(dx * dx + dy2), dr = rr - R;
      const fx = dx / 1050;
      const foc = sst(0.25, 1.15, Math.sqrt(fx * fx + fy2));       // 0 in focus (around the crest) → 1 far out
      const we = 3 + 6 * foc;
      const nDrift = (NA[k] - 128) * I, nWob = (NB[k] - 128) * I, nBlot = (NB[k + 1] - 128) * I, nPatch = (NB[k + 2] - 128) * I;
      let Tup = 0, Tdn = 0;
      if (dr > -we) {
        const ui = i >> 2, utx = (i & 3) * 0.25;
        const u0 = U[ur0 + ui], u1 = U[ur1 + ui];
        const du = (u0 + (U[ur0 + ui + 1] - u0) * utx) * (1 - uty) + (u1 + (U[ur1 + ui + 1] - u1) * utx) * uty;
        Tup = T_AIR - 0.06 * sst(240, 700, dr) + du + 0.03 * nDrift + 0.02 * nBlot + 0.02 * nPatch;
        if (dr < 80) Tup += 0.035 * Math.exp(-(dr > 0 ? dr : 0) / 15);    // warmth leaking off the eave
      }
      if (dr < we) {
        const d = -dr, s = R * Math.asin(dx / rr);
        const deep = sst(70, 210, d);
        const nAmp = (NA[k + 1] - 128) * I, nWander = (NA[k + 2] - 128) * I;
        let dq = d + deep * (17 * nWander + 1.6 * nWob);
        dq = dq < 0 ? 0 : dq > PMAX ? PMAX : dq;
        const pi = dq | 0, pv = P[pi] + (P[pi + 1] - P[pi]) * (dq - pi);
        let amp = (0.96 + 0.5 * nAmp) * (1 - 0.3 * sst(620, 1250, s < 0 ? -s : s)); amp = amp < 0.4 ? 0.4 : amp > 1.05 ? 1.05 : amp;
        Tdn = T_HOT + (pv - T_HOT) * (1 + (amp - 1) * deep) + 0.016 * nBlot + 0.035 * nPatch + 0.05 * nAmp * (1 - deep);
        if (d < 130) {
          let si = ((s + tt.SM) * 0.5) | 0; si = si < 0 ? 0 : si >= tt.n ? tt.n - 1 : si;
          const q = tt.idx[si], rad = tt.trad[q];
          const qs = Math.abs(s - tt.ts[q] - tt.tlean[q] * (d - tt.tdc[q])) - (tt.thw[q] - rad), qd = Math.abs(d - tt.tdc[q]) - (tt.thd[q] - rad);
          const ox = qs > 0 ? qs : 0, oy = qd > 0 ? qd : 0;
          const sd = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qs, qd), 0) - rad + 7 * nWob + 4 * nBlot;
          const sf = 6.5 + 20 * foc;
          const m = 1 - sst(-sf, sf, sd);
          // raspberry body, violet core: the isotherms nest inside the hotter tile ends
          if (m > 0) {
            const th = tt.theat[q], body = th < 0.84 ? th : 0.84;
            Tdn += (body + (th - body) * sst(5, 28 + 12 * foc, -sd) + 0.02 * nBlot - Tdn) * m;
          }
          // the lip of the eave runs a little hotter than the gaps between the tile ends: one unbroken line on the arc
          if (d < 13) { const rim = 0.745 + 0.03 * nBlot; if (rim > Tdn) Tdn += (rim - Tdn) * (1 - sst(2, 12, d)) * (0.7 + 0.3 * nPatch); }
        }
      }
      let T = dr >= we ? Tup : dr <= -we ? Tdn : Tdn + (Tup - Tdn) * sst(-we, we, dr);
      T += 0.008 * G[g0 + (i & 255)] + 0.011 * G[g1 + (((i >> 1) + 37) & 255)];
      out[o] = LUT[T <= 0 ? 0 : T >= 1 ? 2047 : (T * 2047) | 0];
    }
  }
  const sharp = L.makeCanvas(LW, LH);
  sharp.getContext('2d').putImageData(img, 0, 0);
  return sharp;
}

/** lens: everything a touch soft, and progressively out of focus away from the crest of the eave */
function lens(env, sharp) {
  const a = env.arc;
  const out = L.blurred(sharp, 1.6);
  const g = out.getContext('2d');
  const mix = (px, sc, r0, r1, sx) => {
    const b = L.makeCanvas(LW * sc, LH * sc), bg = b.getContext('2d');
    bg.filter = `blur(${px * sc}px)`;
    bg.drawImage(sharp, 0, 0, b.width, b.height);
    bg.filter = 'none';
    bg.globalCompositeOperation = 'destination-in';
    bg.scale(sc, sc); bg.translate(PAD + a.cx, PAD + a.crestY + 40); bg.scale(sx, 1);
    bg.fillStyle = L.radial(bg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    bg.fillRect(-LW, -LH, LW * 2, LH * 2);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(b, 0, 0, LW, LH);
  };
  mix(5.5, 1, 110, 420, 2.0);
  mix(13, 0.5, 330, 760, 2.45);
  out._pad = PAD;
  return out;
}

export default {
  name: '红外热成像',
  tone: 'dark',
  init(env) {
    S = { layer: lens(env, buildThermogram(env)) };
  },
  draw(ctx, env, p) {
    const rot = L.lerp(-0.008, 0.008, p), zoom = L.lerp(1.0, 1.022, p);
    ctx.fillStyle = '#dbe43c'; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.layer, { rot, zoom });
  },
};
