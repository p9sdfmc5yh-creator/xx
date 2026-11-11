// g14 — 金饼: Han gold cakes (round, domed face, ice-crackle casting wrinkles) laid on pure black, spelling the coin glyph.
// Each cake is a per-pixel lit height field (dome + crackle cells + lumps + pits + scratches), rendered 2× and downsampled.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const RAMP = L.makeRamp([[0, '#120501'], [0.14, '#3f1503'], [0.3, '#7c3608'], [0.46, '#b46a12'], [0.6, '#d9982a'], [0.76, '#f3c654'], [0.9, '#fbdc80'], [1, '#ffefb4']]);
const LUT = new Uint8ClampedArray(1024 * 3);
for (let i = 0; i < 1024; i++) { const c = RAMP(i / 1023); LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2]; }
const norm3 = (x, y, z) => { const m = Math.hypot(x, y, z) || 1; return [x / m, y / m, z / m]; };
const LD = norm3(-0.52, -0.60, 0.61), HV = norm3(LD[0], LD[1], LD[2] + 1), FD = norm3(0.62, 0.52, 0.36);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function makeCake(rad, seed) {
  const r = L.rng(seed), nz = L.makeNoise(seed), SS = 2, pad = 5;
  const half = Math.ceil(rad + pad), W = half * 2 * SS;
  const e1 = r.range(0.006, 0.024), e2 = r.range(0.004, 0.014), e3 = r.range(0.002, 0.007), p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const eN = 1 + e1 + e2 + e3;
  // crackle seeds: loosely spaced points over the face
  const pts = []; const want = Math.round(8 + (rad * rad) / 230), minD = rad * 0.3;
  for (let t = 0; t < 900 && pts.length < want; t++) {
    const a = r() * TAU, d = Math.sqrt(r()) * rad * 1.08, x = Math.cos(a) * d, y = Math.sin(a) * d;
    let ok = true; for (const q of pts) if (Math.hypot(q.x - x, q.y - y) < minD) { ok = false; break; }
    if (ok) pts.push({ x, y, c: r.range(-0.8, 0.8), ax: r.range(-0.04, 0.04), ay: r.range(-0.04, 0.04) });
  }
  const pits = []; for (let i = 0, n = r.int(4, 9); i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * rad * 0.86; pits.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: r.range(1.3, 3.4), d: r.range(0.8, 2.2) }); }
  const scr = []; for (let i = 0, n = r.int(2, 5); i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * rad * 0.6, x = Math.cos(a) * d, y = Math.sin(a) * d, b = r() * TAU, len = r.range(rad * 0.25, rad * 0.8); scr.push({ x0: x, y0: y, dx: Math.cos(b), dy: Math.sin(b), len, d: r.range(0.35, 0.8) }); }
  const domeK = r.range(0.85, 1.2), dish = r.chance(0.4) ? r.range(0.3, 1) : 0, crackAmp = r.range(1.9, 3.0), s1 = r() * 90, s2 = r() * 90;
  const tintG = r.range(0.95, 1.03), tintB = r.range(0.78, 1.0), gainK = r.range(0.93, 1.06);
  const h = new Float32Array(W * W), al = new Float32Array(W * W), ao = new Float32Array(W * W);
  for (let iy = 0; iy < W; iy++) for (let ix = 0; ix < W; ix++) {
    const x = (ix + 0.5) / SS - half, y = (iy + 0.5) / SS - half, rr = Math.hypot(x, y);
    if (rr > rad + 2) continue;
    const th = Math.atan2(y, x);
    const Rt = rad * (1 + e1 * Math.cos(2 * th + p1) + e2 * Math.cos(3 * th + p2) + e3 * Math.cos(5 * th + p3)) / eN;
    const a = Math.min(1, Math.max(0, (Rt - rr) / 0.8 + 0.5)); if (a <= 0) continue;
    const i = iy * W + ix; al[i] = a;
    const u = Math.min(1, rr / Rt), q = 1 - u * u;
    let hh = rad * (0.25 * Math.sqrt(q) + 0.10 * q) * domeK - dish * rad * 0.035 * Math.exp(-(u * u) / 0.22);
    const wx = x + 4.5 * nz.n2(x * 0.035 + s1, y * 0.035), wy = y + 4.5 * nz.n2(x * 0.035, y * 0.035 + s2);
    let f1 = 1e9, f2 = 1e9, bi = 0;
    for (let k = 0; k < pts.length; k++) { const dx = wx - pts[k].x, dy = wy - pts[k].y, d = dx * dx + dy * dy; if (d < f1) { f2 = f1; f1 = d; bi = k; } else if (d < f2) f2 = d; }
    const e = (Math.sqrt(f2) - Math.sqrt(f1)) * 0.5;
    const vary = 0.55 + 0.45 * nz.n2(x * 0.045 + 7, y * 0.045 - 3);
    const fade = 1 - 0.75 * u * u * u * u;
    const crack = (1 - sstep(0.25, 2.7, e)) * fade * Math.max(0.15, vary);
    const P = pts[bi];
    hh += (P.c + P.ax * (wx - P.x) + P.ay * (wy - P.y)) * sstep(0.2, 5, e) * fade;
    hh -= crackAmp * crack;
    hh += 1.7 * nz.n2(x * 0.022 + s2, y * 0.022) + 0.8 * nz.n2(x * 0.06, y * 0.06 + s1);
    const rdg = 1 - Math.abs(nz.n2(wx * 0.05 - 5, wy * 0.05 + 9)); hh += 0.9 * rdg * rdg * fade;          // cooling wrinkles
    hh += 0.24 * nz.n2(x * 0.3, y * 0.3) + 0.12 * nz.n2(x * 0.62 + 3, y * 0.62);                              // cast skin
    let occ = crack * 0.5;
    for (const pt of pits) { const dx = x - pt.x, dy = y - pt.y, g = Math.exp(-(dx * dx + dy * dy) / (pt.r * pt.r)); hh -= pt.d * g; occ += 0.35 * g; }
    for (const sc of scr) { const px = x - sc.x0, py = y - sc.y0, t = px * sc.dx + py * sc.dy; if (t < 0 || t > sc.len) continue; const dd = Math.abs(px * sc.dy - py * sc.dx); if (dd < 2.5) hh -= sc.d * Math.exp(-(dd * dd) / 0.55) * Math.sin((t / sc.len) * Math.PI); }
    h[i] = hh; ao[i] = Math.min(0.7, occ);
  }
  const cv = L.makeCanvas(W, W), g = cv.getContext('2d'), img = g.createImageData(W, W), o = img.data;
  for (let iy = 1; iy < W - 1; iy++) for (let ix = 1; ix < W - 1; ix++) {
    const i = iy * W + ix; if (al[i] <= 0) continue;
    const hl = al[i - 1] > 0 ? h[i - 1] : h[i] - 1.2, hr = al[i + 1] > 0 ? h[i + 1] : h[i] - 1.2, hu = al[i - W] > 0 ? h[i - W] : h[i] - 1.2, hd = al[i + W] > 0 ? h[i + W] : h[i] - 1.2;
    const gx = (hr - hl) * SS * 0.5, gy = (hd - hu) * SS * 0.5, m = 1 / Math.hypot(gx, gy, 1);
    const nx = -gx * m, ny = -gy * m, n3 = m;
    const diff = Math.max(0, nx * LD[0] + ny * LD[1] + n3 * LD[2]);
    const nh = Math.max(0, nx * HV[0] + ny * HV[1] + n3 * HV[2]);
    const spec = 0.55 * Math.pow(nh, 22) + 0.5 * Math.pow(nh, 90);
    const fill = Math.max(0, nx * FD[0] + ny * FD[1] + n3 * FD[2]) * 0.11;
    let t = ((0.07 + 0.74 * Math.pow(diff, 1.2) + fill) * (1 - ao[i]) + spec * (1 - ao[i] * 0.6)) * gainK;
    const li = Math.min(1023, Math.max(0, (t * 1023) | 0)) * 3, k = i * 4;
    o[k] = LUT[li]; o[k + 1] = LUT[li + 1] * tintG; o[k + 2] = LUT[li + 2] * tintB; o[k + 3] = al[i] * 255;
  }
  g.putImageData(img, 0, 0);
  const out = L.makeCanvas(half * 2, half * 2), og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(cv, 0, 0, half * 2, half * 2);
  return out;
}

function layout() {
  const G = K.GLYPH, r = L.rng('g14lay'), cakes = [];
  // ring: 19 cakes whose outer edge touches the outer circle
  const n = 17, ph = r() * TAU;
  for (let i = 0; i < n; i++) { const rad = 57 + r.range(-1.6, 1.6), t = ph + (i / n) * TAU + r.range(-0.012, 0.012), d = G.R - rad; cakes.push({ x: G.cx + Math.cos(t) * d, y: G.cy + Math.sin(t) * d, rad, z: 1 }); }
  // square: per side three cakes whose edge touches the hole's side, plus one at each corner
  for (let s = 0; s < 4; s++) {
    const c = Math.cos((s * Math.PI) / 2), sn = Math.sin((s * Math.PI) / 2);
    for (const k of [-1, 0, 1]) { const rad = 45 + r.range(-1.2, 1.2), u = k * 86 + r.range(-1.5, 1.5), v = -(G.a + rad); cakes.push({ x: G.cx + u * c - v * sn, y: G.cy + u * sn + v * c, rad, z: 2 }); }
    const rad = 36 + r.range(-1, 1), u = -(G.a + rad), v = -(G.a + rad); cakes.push({ x: G.cx + u * c - v * sn, y: G.cy + u * sn + v * c, rad, z: 3 });
  }
  // fill what is left with smaller cakes (greedy largest-clearance)
  for (let it = 0; it < 10; it++) {
    let best = null, bc = 0;
    for (let y = G.cy - G.R; y <= G.cy + G.R; y += 5) for (let x = G.cx - G.R; x <= G.cx + G.R; x += 5) {
      let cl = -K.sdGlyph(x, y); if (cl < 18) continue;
      for (const q of cakes) { const d = Math.hypot(q.x - x, q.y - y) - q.rad; if (d < cl) { cl = d; if (cl < bc) break; } }
      if (cl > bc) { bc = cl; best = { x, y }; }
    }
    if (!best || bc < 19) break;
    cakes.push({ x: best.x, y: best.y, rad: Math.min(bc + 3, 40), z: 0 });
  }
  return cakes.sort((a, b) => a.z - b.z);
}

function build() {
  const cakes = layout();
  const top = L.makeCanvas(S, S), t = top.getContext('2d');
  cakes.forEach((q, i) => {
    const spr = makeCake(q.rad, 'g14cake' + i);
    K.stamp(t, spr, Math.round(q.x), Math.round(q.y), { shadow: { dx: 5, dy: 8, blur: 11, color: 'rgba(0,0,0,0.78)' } });
  });
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalAlpha = 0.14; g.drawImage(L.blurred(top, 26), 0, 0); g.globalAlpha = 1;      // faint warm bounce on the black ground
  g.drawImage(top, 0, 0);
  return c;
}

export default {
  name: '金饼',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },
};
