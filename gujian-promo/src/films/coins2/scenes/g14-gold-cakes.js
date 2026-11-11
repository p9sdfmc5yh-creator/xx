// g14 — 金饼: Han gold cakes (round, domed face, casting wrinkles) laid on pure black, spelling the CURRENT glyph.
// Layout: K.pack strings cakes along the strokes (each as wide as the stroke), smaller ones tuck into what is left, and a few
// ride on top of two neighbours. Nothing here knows which character it is; every size follows K.glyphInfo().strokeWidth.
// Each cake is a per-pixel lit height field (rounded shoulder + dome + wrinkle cells + cooling ridges + cast skin), computed at
// DEVICE resolution with L.pixelCanvas. Light from the top-left; warm-gold highlights, red-gold darks.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const layers = new Map();          // one pre-rendered layer per glyph key (the same plate is cut in with different glyphs)
let layer = null;

const RAMP = L.makeRamp([[0, '#120300'], [0.1, '#421204'], [0.22, '#7c2e07'], [0.34, '#a8530e'], [0.46, '#c98a22'], [0.58, '#dfa935'], [0.72, '#f0c654'], [0.86, '#fbe08c'], [1, '#fff6cf']]);
const LUT = new Uint8ClampedArray(1024 * 3);
for (let i = 0; i < 1024; i++) { const c = RAMP(i / 1023); LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2]; }
const norm3 = (x, y, z) => { const m = Math.hypot(x, y, z) || 1; return [x / m, y / m, z / m]; };
const LD = norm3(-0.38, -0.44, 0.81), HV = norm3(-0.30, -0.36, 1.88), FD = norm3(0.62, 0.52, 0.36);   // key light (top-left), its half-vector, a weak bounce from the bottom-right
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** one gold cake of radius `rad` (logical px) as a sprite at device resolution. gain: overall exposure of this cake */
function makeCake(rad, seed, gain = 1) {
  const r = L.rng(seed), nz = L.makeNoise(seed), half = Math.ceil(rad + 3);
  // the surface is designed in "unit px" for a cake of radius ≈ 48; smaller cakes get proportionally (but not endlessly) finer skin
  const s = L.clamp(rad / 48, 0.36, 1.25), U = rad / s;
  const e1 = r.range(0.006, 0.024), e2 = r.range(0.004, 0.014), e3 = r.range(0.002, 0.007), p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const eN = 1 + e1 + e2 + e3;
  // wrinkle cells: loosely spaced points over the face
  const pts = []; const want = Math.round(8 + (U * U) / 230), minD = U * 0.3;
  for (let t = 0; t < 900 && pts.length < want; t++) {
    const a = r() * TAU, d = Math.sqrt(r()) * U * 1.08, x = Math.cos(a) * d, y = Math.sin(a) * d;
    let ok = true; for (const q of pts) if (Math.hypot(q.x - x, q.y - y) < minD) { ok = false; break; }
    if (ok) pts.push({ x, y, c: r.range(-0.5, 0.5), ax: r.range(-0.03, 0.03), ay: r.range(-0.03, 0.03) });
  }
  // a couple of shallow dimples (d > 0) and a few cast droplets standing proud (d < 0)
  const nubs = [];
  for (let i = 0, n = r.int(0, 2); i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * U * 0.7; nubs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: r.range(2.8, 5), d: r.range(0.35, 0.8) }); }
  for (let i = 0, n = r.int(2, 5); i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * U * 0.8; nubs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: r.range(1.3, 2.7), d: -r.range(0.5, 1.2) }); }
  const scr = []; for (let i = 0, n = r.int(2, 5); i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * U * 0.6, x = Math.cos(a) * d, y = Math.sin(a) * d, b = r() * TAU, len = r.range(U * 0.25, U * 0.8); scr.push({ x0: x, y0: y, dx: Math.cos(b), dy: Math.sin(b), len, d: r.range(0.3, 0.7) }); }
  const thick = r.range(0.14, 0.18), bev = r.range(0.2, 0.28) * U, dome = r.range(0.19, 0.25), dish = r.chance(0.3) ? r.range(0.3, 1) : 0;
  const creaseAmp = r.range(0.6, 1.0), s1 = r() * 90, s2 = r() * 90, pr = r() * TAU;
  const tintG = r.range(0.97, 1.04), tintB = r.range(0.8, 1.0), gainK = r.range(0.94, 1.05) * gain;
  return L.pixelCanvas(half * 2, half * 2, (o, pw, ph, q) => {
    const k = 1 / (q * s);                                  // unit px per device px
    const h = new Float32Array(pw * ph), al = new Float32Array(pw * ph), ao = new Float32Array(pw * ph);
    for (let iy = 0; iy < ph; iy++) for (let ix = 0; ix < pw; ix++) {
      const x = ((ix + 0.5) / q - half) / s, y = ((iy + 0.5) / q - half) / s, rr = Math.hypot(x, y);
      if (rr > U + 3 * k) continue;
      const th = Math.atan2(y, x);
      const Rt = U * (1 + e1 * Math.cos(2 * th + p1) + e2 * Math.cos(3 * th + p2) + e3 * Math.cos(5 * th + p3)) / eN;
      const d = Rt - rr; if (d < -2.6 * k) continue;         // a ring just outside the edge is kept for the normals
      const i = iy * pw + ix; al[i] = Math.min(1, Math.max(0, d / k + 0.5));
      const u = Math.min(1, rr / Rt), qq = 1 - u * u;
      const sh = d >= bev ? 1 : d > 0 ? Math.sqrt(1 - (1 - d / bev) * (1 - d / bev)) : (d * 5) / bev;   // rounded shoulder: the cake's thickness
      let hh = U * (thick * sh + dome * qq) - dish * U * 0.035 * Math.exp(-(u * u) / 0.22);
      const wx = x + 4.5 * nz.n2(x * 0.035 + s1, y * 0.035), wy = y + 4.5 * nz.n2(x * 0.035, y * 0.035 + s2);
      let f1 = 1e9, f2 = 1e9, bi = 0;
      for (let c = 0; c < pts.length; c++) { const dx = wx - pts[c].x, dy = wy - pts[c].y, dd = dx * dx + dy * dy; if (dd < f1) { f2 = f1; f1 = dd; bi = c; } else if (dd < f2) f2 = dd; }
      const e = (Math.sqrt(f2) - Math.sqrt(f1)) * 0.5;
      const vary = 0.55 + 0.45 * nz.n2(x * 0.045 + 7, y * 0.045 - 3);
      const fade = (1 - 0.75 * u * u * u * u) * (1 - 0.68 * sstep(0.42, 0.8, u + 0.1 * nz.n2(x * 0.05 - 2, y * 0.05 + 4)));   // the crown is wrinkled, the band toward the rim is smoother
      const crease = (1 - sstep(0.1, 4.2, e)) * fade * Math.max(0.15, vary);                             // soft folds between the cells, not cracks
      const P = pts[bi];
      hh += (P.c + P.ax * (wx - P.x) + P.ay * (wy - P.y)) * sstep(0.2, 5, e) * fade;
      hh -= creaseAmp * crease;
      hh += 1.7 * nz.n2(x * 0.022 + s2, y * 0.022) + 0.8 * nz.n2(x * 0.06, y * 0.06 + s1);
      const rdg = 1 - Math.abs(nz.n2(wx * 0.05 - 5, wy * 0.05 + 9)); hh += 1.0 * rdg * rdg * rdg * fade;                          // cooling wrinkles
      const rip = 1 - Math.abs(Math.sin(rr * 0.2 + 2.4 * nz.n2(wx * 0.03 + 3, wy * 0.03 - 8) + pr)); hh += 0.4 * rip * rip * u;   // the pour's ripples toward the rim
      hh += 0.15 * nz.n2(x * 0.3, y * 0.3) + 0.07 * nz.n2(x * 0.62 + 3, y * 0.62);                                                // cast skin
      let occ = crease * 0.16;
      for (const pt of nubs) { const dx = x - pt.x, dy = y - pt.y, g = Math.exp(-(dx * dx + dy * dy) / (pt.r * pt.r)); hh -= pt.d * g * fade; if (pt.d > 0) occ += 0.12 * g; }
      for (const sc of scr) { const px = x - sc.x0, py = y - sc.y0, t = px * sc.dx + py * sc.dy; if (t < 0 || t > sc.len) continue; const dd = Math.abs(px * sc.dy - py * sc.dx); if (dd < 2.5) hh -= sc.d * Math.exp(-(dd * dd) / 0.55) * Math.sin((t / sc.len) * Math.PI); }
      h[i] = hh; ao[i] = Math.min(0.6, occ);
    }
    const gk = 0.5 / k;
    for (let iy = 1; iy < ph - 1; iy++) for (let ix = 1; ix < pw - 1; ix++) {
      const i = iy * pw + ix; if (al[i] <= 0) continue;
      const gx = (h[i + 1] - h[i - 1]) * gk, gy = (h[i + pw] - h[i - pw]) * gk, m = 1 / Math.hypot(gx, gy, 1);
      const nx = -gx * m, ny = -gy * m, n3 = m;
      const diff = Math.max(0, nx * LD[0] + ny * LD[1] + n3 * LD[2]);
      const nh = Math.max(0, nx * HV[0] + ny * HV[1] + n3 * HV[2]);
      const spec = 0.10 * Math.pow(nh, 8) + 0.36 * Math.pow(nh, 40) + 0.6 * Math.pow(nh, 200);                                    // soft-box glow, body, bright core
      const fill = Math.max(0, nx * FD[0] + ny * FD[1] + n3 * FD[2]) * 0.12;
      const t = ((0.05 + 0.46 * diff * diff + fill) * (1 - ao[i]) + spec * (1 - ao[i] * 0.6)) * gainK;
      const li = Math.min(1023, Math.max(0, (t * 1023) | 0)) * 3, c = i * 4;
      o[c] = LUT[li]; o[c + 1] = LUT[li + 1] * tintG * (1 - 0.2 * ao[i]); o[c + 2] = LUT[li + 2] * tintB * (1 - 0.35 * ao[i]); o[c + 3] = al[i] * 255;
    }
  });
}

/** where the cakes go, for whatever glyph is current: [{ x, y, rad, z }] in drawing order (underneath first) */
function layout(info) {
  const sw = info.strokeWidth, R1 = sw * 0.5, r = L.rng('g14lay' + info.key);
  const discs = K.pack({ seed: 'g14pack', rmax: R1, rmin: Math.max(4.5, R1 * 0.26), gap: 0.86, margin: -1.5 });
  const cakes = discs.map((d) => ({ x: d.x, y: d.y, rad: d.r * 1.03 + 1, z: 0 }));       // a little larger than the disc, so neighbours overlap
  // a few cakes ride on top, each resting on two neighbouring big ones (and still inside the stroke)
  const big = discs.filter((d) => d.r > R1 * 0.7), tops = [];
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
    const a = big[i], b = big[j]; if (Math.hypot(a.x - b.x, a.y - b.y) > (a.r + b.r) * 1.1) continue;
    const mx = (a.x + b.x) / 2 + r.range(-0.05, 0.05) * sw, my = (a.y + b.y) / 2 + r.range(-0.05, 0.05) * sw;
    const rad = Math.min(R1 * 0.9, 1 - K.sdGlyph(mx, my)) * r.range(0.84, 0.96);
    if (rad < R1 * 0.55 || !r.chance(0.4)) continue;
    if (tops.some((q) => Math.hypot(q.x - mx, q.y - my) < (q.rad + rad) * 1.25)) continue;
    tops.push({ x: mx, y: my, rad, z: 1 });
  }
  return cakes.concat(tops).sort((a, b) => (a.z - b.z) || (a.rad - b.rad));
}

/** the shadow a sprite at (x, y) throws on the cakes ALREADY on `top` (nothing lands on the black ground): multiplied in, so the
 *  shaded gold turns red-gold instead of grey. sh: { dx, dy, blur, color } */
function shade(top, t, spr, x, y, sh) {
  const FAR = 4096, pad = Math.ceil(sh.blur * 2.5 + Math.max(sh.dx, sh.dy)) + 2, w = spr.width + pad * 2, h = spr.height + pad * 2;
  const x0 = x - spr.width / 2 - pad, y0 = y - spr.height / 2 - pad;
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.shadowColor = sh.color; g.shadowBlur = sh.blur; g.shadowOffsetX = sh.dx + FAR; g.shadowOffsetY = sh.dy;
  g.drawImage(spr, pad - FAR, pad);                                                    // the sprite itself is off-canvas: only its shadow lands
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  g.globalCompositeOperation = 'destination-in'; g.drawImage(top, x0, y0, w, h, 0, 0, w, h);   // keep it where there is gold underneath
  t.save(); t.globalCompositeOperation = 'multiply'; t.drawImage(c, x0, y0); t.restore();
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, q = L.SS;
  const cakes = layout(info);
  const top = L.makeCanvas(S, S), t = top.getContext('2d');
  cakes.forEach((c, i) => {
    const gain = 1.06 - 0.16 * ((c.x + c.y) / (2 * S)) + (c.z ? 0.05 : 0);              // the light falls off toward the bottom-right
    const spr = makeCake(c.rad, 'g14cake' + info.key + i, gain), lift = c.z ? 1.7 : 1;
    const x = Math.round(c.x * q) / q, y = Math.round(c.y * q) / q;                     // on the device grid: the sprite is not resampled
    shade(top, t, spr, x, y, { dx: sw * 0.06 * lift, dy: sw * 0.09 * lift, blur: sw * 0.12 * lift, color: 'rgba(128,58,22,0.86)' });   // cast shadow
    shade(top, t, spr, x, y, { dx: sw * 0.018, dy: sw * 0.028, blur: sw * 0.035, color: 'rgba(84,30,10,0.9)' });                       // contact shadow
    K.stamp(t, spr, x, y, { shadow: false });
  });
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalAlpha = 0.13; g.drawImage(L.blurred(top, sw * 0.34), 0, 0);                   // faint warm bounce on the black ground…
  g.globalAlpha = 0.10; g.drawImage(L.blurred(top, sw * 0.07), 0, 0);                   // …tighter next to the cakes
  g.globalAlpha = 1;
  g.drawImage(top, 0, 0);
  return c;
}

export default {
  name: '金饼',
  init() { layer = build(); layers.set(K.glyphInfo().key, layer); },
  draw(ctx) { ctx.drawImage(layers.get(K.glyphInfo().key) || layer, 0, 0); },           // a 3-frame flash: perfectly still
};
