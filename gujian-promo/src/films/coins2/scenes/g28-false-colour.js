// g28 — 伪彩扫描: a composition area-scan as it comes up on the instrument screen, cut to the CURRENT GLYPH. Deep blue-black
// ground; the glyph is ONE scalar field (built on K.sdGlyph: the depth inside the stroke) pushed through a colour scale, the
// way real false-colour maps are made: hot magenta rim → purple → orange → yellow → green along the spine of every stroke
// (cyan-green where strokes meet and the body is deepest), thin dark isolines between the tints, segregation islands and
// lead-rich specks with their own colour rings. The tints are terraces of a low relief lit from the top-left: lit risers with
// a bright core, shaded risers, each terrace shadowing the next, a chamfered edge, a dark side wall and a cast shadow to the
// lower-right, and a violet glow off every edge. Everything is computed per DEVICE pixel (L.pixelCanvas). No figures or letters.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
let layer = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// scalar → colour. 0 … 0.3 lives outside the glyph (the glow on the dark screen); the rim is the magenta peak with a pale core
const SMAX = 1.16, NL = 2048;
const LUT_STOPS = [
  [0.000, '#04070f'], [0.030, '#060b1c'], [0.070, '#0c1036'], [0.120, '#22126c'], [0.180, '#5417b6'], [0.245, '#9c1fdc'], [0.300, '#dc28da'],
  [0.335, '#ff2bd6'], [0.354, '#ff4ede'], [0.372, '#ffb2f4'], [0.390, '#ff56e0'], [0.406, '#ff34d8'], [0.428, '#ee2bd6'],
  [0.470, '#9019d0'], [0.535, '#5413c2'], [0.580, '#7016bc'], [0.612, '#d81f86'], [0.636, '#ff3a5e'],
  [0.675, '#ff8a1f'], [0.720, '#ff9a22'], [0.762, '#ffa626'], [0.782, '#ffd638'], [0.815, '#ffdf3c'], [0.870, '#f8e938'],
  [0.886, '#f2e934'], [0.904, '#b6e826'], [0.945, '#9be81e'], [0.985, '#6fdd24'], [1.030, '#3fd24a'], [1.090, '#22dcae'], [1.160, '#3cf0e6'],
];
// depth inside the stroke → scalar: plateaus (the tints) joined by short ramps (their borders). The depth is in PROFILE UNITS:
// UNITS of them reach the centre line of a typical stroke of the current glyph, whatever its size
const UNITS = 112;
const PROFILE = [
  [0, 0.338], [3, 0.352], [7, 0.372], [11, 0.388], [16, 0.404], [21, 0.428],          // the rim: hot magenta, pale core
  [27, 0.5], [35, 0.535], [42, 0.566],                                              // a narrow purple ring
  [47, 0.634], [52, 0.684], [64, 0.704], [76, 0.726],                               // red-pink contour, then orange
  [82, 0.802], [94, 0.83], [104, 0.858],                                            // bright yellow
  [111, 0.93], [126, 0.962], [146, 0.995], [200, 1.06],                             // green (cyan-green only in hot spots)
];
// isolines: [level, strength] — the first four sit on the borders between tints, the rest wander inside a tint
const CONTOURS = [[0.455, 0.5], [0.598, 0.46], [0.772, 0.5], [0.895, 0.5], [0.706, 0.24], [0.83, 0.24], [0.96, 0.26], [1.0, 0.22], [1.04, 0.22], [1.085, 0.2]];

function profile(d) {
  if (d <= PROFILE[0][0]) return PROFILE[0][1];
  for (let i = 1; i < PROFILE.length; i++) if (d <= PROFILE[i][0]) {
    const a = PROFILE[i - 1], b = PROFILE[i]; return a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]);
  }
  return PROFILE[PROFILE.length - 1][1];
}

/** a slow noise term sampled once on a coarse lattice and read back bilinearly (the per-pixel loops run 4.7 M times at 4K) */
function coarse(step, fn) {
  const n = Math.ceil(S / step) + 3, a = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) a[j * n + i] = fn(i * step, j * step);
  return (x, y) => {
    let u = x / step, v = y / step; const i = u | 0, j = v | 0, o = j * n + i; u -= i; v -= j;
    return (a[o] * (1 - u) + a[o + 1] * u) * (1 - v) + (a[o + n] * (1 - u) + a[o + n + 1] * u) * v;
  };
}
const hash13 = (k) => { let h = Math.imul(k ^ (k >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return (h ^ (h >>> 15)) & 8191; };

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, D0 = sw * 0.5;     // D0: depth of the centre line of a typical stroke
  const U = UNITS / D0;                                                  // profile units per px of depth
  const nA = L.makeNoise('g28a'), nB = L.makeNoise('g28b');
  const ramp = L.makeRamp(LUT_STOPS.map(([t, c]) => [t / SMAX, c]));
  const LR = new Uint8Array(NL), LG = new Uint8Array(NL), LB = new Uint8Array(NL);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); LR[i] = c[0]; LG[i] = c[1]; LB[i] = c[2]; }
  const lut = (s) => { const li = (s / SMAX * (NL - 1)) | 0; return li < 0 ? 0 : li > NL - 1 ? NL - 1 : li; };
  const PN = 1601, Ptab = new Float32Array(PN + 1);                     // depth 0 … 200 units in 1/8 unit
  for (let i = 0; i <= PN; i++) Ptab[i] = profile(i / 8);

  // every length below follows the stroke width, so the map reads the same on one big character or three small ones
  const w1 = sw * 2.0, w2 = sw * 0.78, w3 = sw * 0.28, wr = sw * 0.7, wf = sw * 1.1;
  const fGain = coarse(8, (x, y) => 0.9 + 0.22 * nB.n2(x / 170, y / 170 + 3));
  const fCloud = coarse(2.5, (x, y) => 0.024 + 0.02 * nA.fbm(x / 210 + 7, y / 210, 4) + 0.006 * nB.n2(x / 34, y / 34 + 2));

  const GL1 = sw * 0.13, GL2 = sw * 0.5;                                // the glow: a tight skirt and a wide halo
  const TH = Math.max(1.2, sw * 0.058);                                 // height of the slab's side wall as seen from above
  const LS = sw * 0.24;                                                 // length of its cast shadow
  const BEV = Math.max(1.5, sw * 0.06);                                 // chamfer of the top edge
  const EC = Math.max(0.5, sw * 0.016), EW = Math.max(0.4, sw * 0.012); // the highlight's bright core along the lit chamfer
  const u7 = Math.SQRT1_2;

  // ── segregation islands lying along the strokes, big and small: low bumps / hollows of signal with a ragged outline ──
  const rb = L.rng('g28blobs' + info.key);
  const blobs = [];
  K.pack({ seed: 'g28isl', rmax: sw * 0.34, rmin: sw * 0.2, gap: 2.4, margin: sw * 0.04, max: 400 }).forEach((p) => {
    if (!rb.chance(0.72)) return;
    blobs.push([p.x + rb.range(-0.08, 0.08) * sw, p.y + rb.range(-0.08, 0.08) * sw, rb.range(0.42, 0.85) * D0, rb.range(0.26, 0.46) * D0,
      p.ang + rb.range(-0.35, 0.35), rb.range(0.08, 0.15) * (rb.chance(0.6) ? 1 : -1), 0.15]);
  });
  K.pack({ seed: 'g28sml', rmax: sw * 0.2, rmin: sw * 0.13, gap: 3.1, margin: sw * 0.05, max: 60 }).forEach((p) => {
    if (!rb.chance(0.55)) return;
    blobs.push([p.x, p.y, rb.range(0.3, 0.46) * D0, rb.range(0.2, 0.3) * D0, p.ang + rb.range(-0.5, 0.5), rb.range(0.05, 0.085) * (rb.chance(0.65) ? 1 : -1), 0.12]);
  });

  const rn = L.rng('g28noise');
  const NT = new Float32Array(8192);
  for (let i = 0; i < 8192; i++) NT[i] = (rn() + rn() + rn() + rn() - 2) * 1.73;      // ≈ unit gaussian
  const NC = CONTOURS.length;

  const map = L.pixelCanvas(S, S, (px, pw, ph, q) => {
    const N = pw * ph, SD = new Float32Array(N), SC = new Float32Array(N);
    const edge = 0.5 / q;

    // ── the distance field, smoothed a little: the library's field is exact to a 2160 mask, and the cusps that leaves in the
    //    level lines near the edge would show as ticks once the relief is lit ──
    {
      const R = Math.max(1, Math.round(2 * q)), sg = 1.0 * q, w = new Float32Array(2 * R + 1), tmp = new Float32Array(N);
      let ws = 0; for (let t = -R; t <= R; t++) { w[t + R] = Math.exp(-t * t / (2 * sg * sg)); ws += w[t + R]; }
      for (let t = 0; t <= 2 * R; t++) w[t] /= ws;
      for (let j = 0, k = 0; j < ph; j++) { const y = (j + 0.5) / q; for (let i = 0; i < pw; i++, k++) tmp[k] = K.sdGlyph((i + 0.5) / q, y); }
      for (let j = 0; j < ph; j++) {
        const o = j * pw;
        for (let i = 0; i < pw; i++) {
          let a = 0;
          if (i >= R && i < pw - R) for (let t = -R; t <= R; t++) a += tmp[o + i + t] * w[t + R]; else a = tmp[o + i];
          SD[o + i] = a;
        }
      }
      for (let j = R; j < ph - R; j++) {
        const o = j * pw;
        for (let i = 0; i < pw; i++) { let a = 0; for (let t = -R; t <= R; t++) a += SD[o + i + t * pw] * w[t + R]; tmp[o + i] = a; }
      }
      for (let k = R * pw; k < (ph - R) * pw; k++) SD[k] = tmp[k];
    }

    // ── the scalar field ──
    for (let j = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++) {
        const k = j * pw + i, x = (i + 0.5) / q, sd = SD[k];
        if (sd < edge) {                                                 // inside the stroke
          const du = (sd < 0 ? -sd : 0) * U, g = sstep(12, 64, du);
          const wv = g * (17 * nA.n2(x / w1, y / w1) + 8 * nA.n2(x / w2 + 9, y / w2 + 4) + 3 * nB.n2(x / w3, y / w3));
          // richer toward the upper-left (where the light also comes from), leaner lower-right
          const lean = g * 9 * ((S / 2 - x) + (S / 2 - y)) / S;
          // the rim is worn unevenly: its width (and so its pale core) swells and thins along the edge
          const rimW = 1 + 0.24 * nB.n2(x / wr + 11, y / wr - 3) * (1 - sstep(20, 46, du));
          const de = L.clamp(du * rimW + wv + lean, 0, 199.8);
          const pi = de * 8, p0 = pi | 0;
          SC[k] = Ptab[p0] + (Ptab[p0 + 1] - Ptab[p0]) * (pi - p0) + sstep(16, 50, du) * 0.022 * nB.fbm(x / wf + 5, y / wf, 3);
        } else {                                                         // the dark screen: the glyph's glow falling off,
          // + the screen's own faint background signal: slow clouds of blue, never brighter than the glow
          SC[k] = (0.17 * Math.exp(-sd / GL1) + 0.07 * Math.exp(-sd / GL2)) * fGain(x, y) + Math.max(0.004, fCloud(x, y));
        }
      }
    }
    for (const [bx, by, ru, rv, rot, amp, rag] of blobs) {
      const e = Math.max(ru, rv) * 1.5 + 2, cs = Math.cos(rot), sn = Math.sin(rot);
      const i0 = Math.max(0, Math.floor((bx - e) * q)), i1 = Math.min(pw - 1, Math.ceil((bx + e) * q));
      const j0 = Math.max(0, Math.floor((by - e) * q)), j1 = Math.min(ph - 1, Math.ceil((by + e) * q));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * pw + i; if (SD[k] >= 0) continue;
        const dx = (i + 0.5) / q - bx, dy = (j + 0.5) / q - by, du = dx * cs + dy * sn, dv = -dx * sn + dy * cs;
        const wob = 1 + rag * nA.n2(du / (ru * 0.8) + bx, dv / (rv * 0.9) + by);
        const q2 = ((du * du) / (ru * ru) + (dv * dv) / (rv * rv)) * wob * wob;
        if (q2 < 1) SC[k] += amp * (1 - q2) * (1 - q2) * sstep(20, 40, -SD[k] * U);
      }
    }
    // stray scatter counts on the dark screen: a few small soft specks of signal (violet-blue), none touching the glyph
    const rs = L.rng('g28specks' + info.key);
    for (let n = 0, placed = 0; n < 600 && placed < 34; n++) {
      const bx = rs.range(40, S - 40), by = rs.range(40, S - 40);
      if (K.sdGlyph(bx, by) < sw * 0.45 + 8) continue;
      placed++;
      const rad = rs.range(1.4, 3.6) * (rs.chance(0.12) ? 1.7 : 1), amp = rs.range(0.04, 0.12), sx = rs.range(0.6, 1.5), rot = rs() * Math.PI;
      const cs = Math.cos(rot), sn = Math.sin(rot), e = rad * 1.6 + 1;
      for (let j = Math.max(0, ((by - e) * q) | 0); j <= Math.min(ph - 1, ((by + e) * q) | 0); j++) for (let i = Math.max(0, ((bx - e) * q) | 0); i <= Math.min(pw - 1, ((bx + e) * q) | 0); i++) {
        const dx = (i + 0.5) / q - bx, dy = (j + 0.5) / q - by, du = (dx * cs + dy * sn) / (rad * sx), dv = (-dx * sn + dy * cs) / rad;
        const q2 = du * du + dv * dv;
        if (q2 < 1) SC[j * pw + i] += amp * (1 - q2) * (1 - q2);
      }
    }

    // ── what lies under / beside the top face: the glowing screen, the slab's cast shadow on it, and the slab's side wall ──
    const liRim = lut(0.345), wR = LR[liRim], wG = LG[liRim], wB = LB[liRim];
    let ur = 0, ug = 0, ub = 0;
    const under = (x, y, sd, sg) => {
      let wall = 0, sh = 0;
      if (sd < TH + 1) {                                                 // extruded toward the lower-right
        let mw = 1e9;
        for (let n = 1; n <= 3; n++) { const t = TH * n / 3 * u7, v = K.sdGlyph(x - t, y - t); if (v < mw) mw = v; }
        wall = L.clamp(0.5 - mw * q / 1.5);
      }
      if (wall < 1 && sd < LS + 2) {
        for (let n = 1; n <= 6; n++) {
          const tt = LS * n / 6, t = tt * u7, pen = 0.5 + 0.22 * tt;
          const a = (1 - sstep(-pen * 0.4, pen, K.sdGlyph(x - t, y - t))) * (1 - 0.7 * (n / 6) * (n / 6));
          if (a > sh) sh = a;
        }
      }
      const li = lut(sg * (1 - 0.82 * sh));
      ur = LR[li]; ug = LG[li]; ub = LB[li];
      if (wall > 0) {
        const f = (0.5 - 0.27 * L.clamp(sd / (TH * 0.8))) * wall;       // darker toward its foot
        ur = ur * (1 - wall) + wR * f; ug = ug * (1 - wall) + wG * f; ub = ub * (1 - wall) + wB * f;
      }
    };

    // ── colour: LUT + relief shading + isolines; the edge is anti-aliased by coverage ──
    const aa = 0.75 / q, safe = -0.6 / q;
    const oi = Math.max(2, Math.round(sw * 0.04 * u7 * q)), oOff = oi * pw + oi;       // terrace-to-terrace shadow offset
    for (let j = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      const rowGain = 0.0022 * NT[(((j / q) | 0) >> 1) * 37 & 8191];     // line-to-line gain wobble of the raster
      const scan = 1 + 0.026 * Math.sin(y * Math.PI);                   // and the raster itself: 2 px line pairs
      for (let i = 0; i < pw; i++) {
        const k = j * pw + i, sd = SD[k], x = (i + 0.5) / q, o = k * 4, nz = NT[hash13(k)];
        if (sd >= aa) {                                                  // the screen
          under(x, y, sd, SC[k]);
          const dz = nz * 0.9;                                           // dither: no banding in the glow
          px[o] = ur + dz; px[o + 1] = ug + dz; px[o + 2] = ub + dz; px[o + 3] = 255;
          continue;
        }
        let s = sd < edge ? SC[k] : PROFILE[0][1];
        const d = sd < 0 ? -sd : 0, du = d * U;
        // the chamfered top edge and the gentle crown of the stroke, from the outline's own normal
        const nx = (SD[k + 1] - SD[k - 1]) * 0.5 * q, ny = (SD[k + pw] - SD[k - pw]) * 0.5 * q;
        const lit = -(nx + ny) * u7;                                     // +1 on edges facing the light, −1 on the far side
        const bev = 1 - sstep(0, BEV, d);
        let lum = 1 + bev * (lit > 0 ? 0.24 : 0.44) * lit + 0.13 * lit * (1 - sstep(0.15 * D0, 1.2 * D0, d));
        const dc = (d - EC) / EW;
        let hl = Math.exp(-dc * dc) * sstep(0.25, 0.85, lit) * 0.6, iso = 0;
        if (sd < safe) {
          const gx = (SC[k + 1] - SC[k - 1]) * 0.5 * q, gy = (SC[k + pw] - SC[k - pw]) * 0.5 * q;
          const gm = Math.max(0.0004 * U, Math.hypot(gx, gy));
          let near = 1;
          for (let c = 0; c < NC; c++) {
            const ds = Math.abs(s - CONTOURS[c][0]), dl = ds / gm;
            if (c < 4 && ds < near) near = ds;
            if (dl < 1.15) { const a = CONTOURS[c][1] * (1 - sstep(0.35, 1.15, dl)) * sstep(0.0004, 0.0016, gm / U); if (a > iso) iso = a; }
          }
          // the borders between tints are the risers of the terraces: those that climb toward the lower-right face the light
          const e = (gx + gy) / U * (1 + 4 * Math.exp(-(near * near) / 0.000256));
          lum += L.clamp(e * 9.5, -0.3, 0.2);
          const spec = sstep(0.008, 0.02, e);
          if (spec * 0.36 > hl) hl = spec * 0.36;
          iso *= 1 - 0.8 * spec;
          const up = SC[k - oOff] - s;                                   // a higher terrace up-left of here throws its shadow
          if (up > 0.03 && SD[k - oOff] < 0) lum -= 0.2 * sstep(0.03, 0.075, up);
          s += (0.0075 * nz + rowGain + 0.005 * nA.n2(x / 1.7 + 3, y / 1.7)) * sstep(18, 40, du);   // counting noise (the rim is the cleanest)
        }
        const li = lut(s);
        const f = lum * (1 - iso * 0.62) * (1 + 0.034 * NT[hash13(k + 7919)]) * scan;
        let r = LR[li] * f, gg = LG[li] * f, b = LB[li] * f;
        if (r > 255) r = 255; if (gg > 255) gg = 255; if (b > 255) b = 255;
        if (hl > 0) { r += (255 - r) * hl; gg += (255 - gg) * hl; b += (255 - b) * hl; }
        const cov = L.clamp(0.5 - sd * q / 1.5);
        if (cov < 1) {
          under(x, y, sd > 0 ? sd : 0, sd < edge ? 0.25 : SC[k]);
          r = r * cov + ur * (1 - cov); gg = gg * cov + ug * (1 - cov); b = b * cov + ub * (1 - cov);
        }
        px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
      }
    }
  });

  const out = L.makeCanvas(S, S), o = out.getContext('2d');
  o.drawImage(map, 0, 0);
  // ── optical glow: the bright map blooms on the screen (wide + tight) ──
  const hot = L.makeCanvas(S, S), h = hot.getContext('2d');
  h.save(); K.clipGlyph(h); h.drawImage(map, 0, 0); h.restore();
  o.save(); o.globalCompositeOperation = 'screen';
  o.globalAlpha = 0.24; o.drawImage(L.blurred(hot, sw * 0.34), 0, 0);
  o.globalAlpha = 0.16; o.drawImage(L.blurred(hot, Math.max(2, sw * 0.08)), 0, 0);
  o.restore();
  // a slightly brighter sheen on the upper-left of the body, falling away to the lower-right
  o.save(); K.clipGlyph(o);
  o.globalCompositeOperation = 'soft-light';
  o.fillStyle = L.linear(o, S * 0.22, S * 0.22, S * 0.78, S * 0.78, [[0, 'rgba(255,255,255,0.16)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,30,0.20)']]);
  o.fillRect(0, 0, S, S); o.restore();
  return out;
}

export default {
  name: '伪彩扫描',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
