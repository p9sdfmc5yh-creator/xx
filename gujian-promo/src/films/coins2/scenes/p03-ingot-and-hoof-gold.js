// p03 — 银锭与马蹄金: two large objects side by side on a cream chromolitho plate — a winged silver ingot (元宝) on the left,
// a horse-hoof gold with its filigree rim band on the right. Each is a height field rendered in an oblique (catalogue) view:
// height grid → front-to-back column march with a horizon → per-pixel lighting from the top-left → cast shadow splatted
// from the same height field. Slow leftward camera. No stamps, no characters anywhere.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
let layer = null;

const CY = 0.72, CH = 0.69;                       // oblique projection: screen y = OY + wy * CY - h * CH
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const L1 = nrm(-0.60, -0.30, 0.74);               // key light: from the top-left (and behind)
const L2 = nrm(-0.45, 0.62, 0.42);                // soft fill from the front-left so the near walls keep their form
const HV = nrm(L1[0], L1[1] + 0.69, L1[2] + 0.72);   // half vector with the view direction (0, .78, .62)
const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (v) => { const t = cl(v); return t * t * (3 - 2 * t); };

// local value noise (0..1), deterministic
const NT = new Float32Array(65536);
{ const r = L.rng('p03noise'); for (let i = 0; i < 65536; i++) NT[i] = r(); }
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const r0 = (yi & 255) << 8, r1 = ((yi + 1) & 255) << 8, c0 = xi & 255, c1 = (xi + 1) & 255;
  const a = NT[r0 | c0], b = NT[r0 | c1], c = NT[r1 | c0], d = NT[r1 | c1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 1.62 - y * 1.22 + 17.3, x * 1.22 + y * 1.62 + 5.1) * 0.3 + vn(x * 3.1 + y * 2.7 + 31.7, y * 3.1 - x * 2.7 + 11.9) * 0.2;
// round pits scattered on a jittered lattice: 0 outside, → 1 at a pit's centre
function pores(x, y, sc, dens) {
  const X = x * sc, Y = y * sc, xi = Math.floor(X), yi = Math.floor(Y); let m = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const k = (((yi + dj) & 255) << 8) | ((xi + di) & 255), rad = NT[(k * 13 + 101) & 65535];
    if (rad > dens) continue;
    const px = xi + di + NT[k], py = yi + dj + NT[(k * 7 + 13) & 65535];
    const d = Math.hypot(X - px, Y - py) / (0.14 + 0.30 * rad / dens);
    if (d < 1) m = Math.max(m, 1 - d * d);
  }
  return m;
}

// ───────── silver ingot (元宝): waisted oval slab, a wing curling up at each end, dished face with casting ripples ─────────
const IA = 320, IB = 190;
function ingotQ(x, y) {
  const u = x / IA;
  const bw = IB * (1 - 0.17 * Math.exp(-((u / 0.42) ** 2)));
  return Math.pow(Math.abs(u) ** 2.5 + Math.abs(y / bw) ** 2.5, 0.4);
}
function ingotH(x, y) {
  if (Math.abs(x) >= IA) return 0;
  const q = ingotQ(x, y); if (q >= 1) return 0;
  const e = (1 - q) * IB;                                       // ≈ px in from the outline
  const endw = sm((Math.abs(x / IA) - 0.40) / 0.45);            // 0 in the middle → 1 at the two ends
  const lip = e < 24 ? 1 : Math.exp(-(((e - 24) / (30 + 14 * endw)) ** 2));
  let h = sm(e / 24) * (100 + (10 + 138 * endw * endw) * lip);
  h -= 34 * sm((e - 34) / 95);                                  // the face sinks towards the middle
  const w = fbm(x * 0.008 + 2, y * 0.008 + 7);
  const face = sm((e - 40) / 26);
  h += 1.9 * Math.sin(e * 0.46 + w * 9 + x * 0.012) * face;      // 丝纹: concentric cooling ripples
  h += 0.9 * Math.sin(e * 1.15 + w * 15) * face;
  h += (fbm(x * 0.03, y * 0.03) - 0.5) * 7 * sm(e / 30);         // lumpy cast surface
  h -= 4.5 * pores(x, y, 0.085, 0.55) * sm(e / 10) * (1 - 0.75 * face);   // gas pores on the rim and wings
  return Math.max(0.05, h);
}
function shadeIngot(x, y, hp, dx, dy, o) {
  const il = 1 / Math.hypot(dx, dy, 1), nx = -dx * il, ny = -dy * il, nz = il;
  const d1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]), d2 = Math.max(0, nx * L2[0] + ny * L2[1] + nz * L2[2]);
  const sp = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 26);
  const wall = 1 - sm((nz - 0.25) / 0.45);                       // 1 on the steep sides
  const m = fbm(x * 0.011 + 3, y * 0.011 + hp * 0.012), m2 = fbm(x * 0.06 + 9, (y + hp) * 0.06);
  const q = ingotQ(x, y), e = (1 - q) * IB;
  // tarnish: grey-black in the dish and along the foot, patchy elsewhere; the rubbed high points stay bright
  let ox = (m - 0.45) * 1.25 + 0.50 * sm((e - 40) / 80) + 0.30 * wall * sm((70 - hp) / 70) + (m2 - 0.5) * 0.3 - 0.5 * sm((hp - 120) / 80);
  ox = sm(ox);
  let pore = 0;
  if (wall > 0.3) pore = pores(x + y * 0.35, hp * 1.25, 0.10, 0.62) * wall;      // honeycomb pores on the sides
  const gr = 1 + (vn(x * 1.3 + hp, y * 1.3 - hp * 0.7) - 0.5) * 0.07;            // litho stone grain
  const v = (0.28 + 0.68 * d1 + 0.24 * d2) * (1 - 0.5 * pore) * gr;
  const r = 226 + (74 - 226) * ox, g = 224 + (74 - 224) * ox, b = 214 + (82 - 214) * ox;
  const s = sp * (1 - 0.7 * ox) * 120;
  o[0] = r * v + s + 10 * (1 - v); o[1] = g * v + s + 6 * (1 - v); o[2] = b * v + s;      // shadows lean warm, like a litho tint stone
}

// ───────── horse-hoof gold (马蹄金): hollow tapering wall, slanting mouth, filigree band under the rim, weathered glass inlay ─────────
const HX = 275, HY = 240, HH = 235, RI = 0.77, RG = 0.635;
function hoofH(x, y) {
  const ux = x / HX, uy = y / HY, r = Math.hypot(ux, uy); if (r >= 1) return 0;
  const th = Math.atan2(uy, ux), H = HH * (1 + 0.09 * ux);
  if (r > RI) {
    const t = (r - RI) / (1 - RI), f = 1 - Math.pow(t, 1.7);
    let h = H * f;
    const fb = (f - 0.74) / 0.22;
    if (fb > 0 && fb < 1) {
      const bead = Math.pow(Math.max(0, Math.cos(th * 112)), 0.7);
      const rows = Math.exp(-(((fb - 0.10) / 0.075) ** 2)) + Math.exp(-(((fb - 0.90) / 0.075) ** 2));    // two granulated wires
      const twist = Math.abs(Math.sin(th * 56 + fb * 5.5)) * Math.exp(-(((fb - 0.5) / 0.2) ** 2));        // a twisted wire between them
      h += 12 * rows * (0.45 + 0.55 * bead) + 10 * twist;
    }
    h += 2.6 * Math.sin(f * 74) * sm((0.36 - f) / 0.1) * sm(f / 0.05);     // faint horizontal ripples near the foot
    h += (fbm(x * 0.02 + 50, y * 0.02) - 0.5) * 3 * sm(f / 0.1);
    return Math.max(0.05, h);
  }
  if (r > RG) {                                                            // the mouth rim: a rope-twisted wire lying on top
    const t = (r - RG) / (RI - RG);
    return H + Math.sin(t * Math.PI) * (3 + 5 * Math.abs(Math.sin(th * 92 + t * 4)));
  }
  const t = r / RG;                                                        // the inlay, set a little below the rim
  return H - 17 * sm((1 - t) / 0.07) + 6 * (1 - t * t) + (fbm(x * 0.05, y * 0.05) - 0.5) * 2.4;
}
function shadeHoof(x, y, hp, dx, dy, o) {
  const il = 1 / Math.hypot(dx, dy, 1), nx = -dx * il, ny = -dy * il, nz = il;
  const d1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]), d2 = Math.max(0, nx * L2[0] + ny * L2[1] + nz * L2[2]);
  const hd = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]);
  const r = Math.hypot(x / HX, y / HY);
  if (r < RG - 0.012 && hp > HH * 0.6) {                                   // weathered glass: chalky grey-green, crazed
    const m = fbm(x * 0.02 + 8, y * 0.02 + 3), c = fbm(x * 0.021 + y * 0.012 + 60, y * 0.021 - x * 0.012 + 4);
    const crack = 1 - 0.30 * sm((0.012 - Math.abs(c - 0.5)) / 0.008);
    const v = (0.42 + 0.5 * d1 + 0.15 * d2) * crack * (0.86 + 0.28 * m);
    const sp = Math.pow(hd, 40) * 70;
    o[0] = 196 * v + sp; o[1] = 208 * v + sp; o[2] = 186 * v + sp; return;
  }
  const m = fbm(x * 0.03 + 21, (y + hp) * 0.03);
  let v = 0.10 + 0.74 * d1 + 0.36 * d2 + (m - 0.5) * 0.12 + (vn(x * 1.3 + hp, y * 1.3 - hp * 0.7) - 0.5) * 0.06;
  // a soft sheen band running down the left flank of the polished wall, as on a turned metal cup
  const side = nz < 0.55 ? Math.pow(Math.max(0, -nx * 0.86 + ny * 0.5), 6) * 0.46 : 0;
  if (nz < 0.7) v -= 0.24 * sm((x / HX + 0.15) / 0.9) + 0.10 * sm((46 - hp) / 46);   // the wall turns away from the light towards the right, and darkens at the foot
  v = cl(v + side);
  const sp = Math.pow(hd, 34);
  // dark umber → red gold → bright yellow
  let R, G, B;
  if (v < 0.35) { const t = v / 0.35; R = 88 + (178 - 88) * t; G = 46 + (104 - 46) * t; B = 12 + (24 - 12) * t; }
  else if (v < 0.68) { const t = (v - 0.35) / 0.33; R = 178 + (226 - 178) * t; G = 104 + (164 - 104) * t; B = 24 + (46 - 24) * t; }
  else { const t = (v - 0.68) / 0.32; R = 226 + (252 - 226) * t; G = 164 + (224 - 164) * t; B = 46 + (128 - 46) * t; }
  o[0] = R + sp * 60; o[1] = G + sp * 80; o[2] = B + sp * 110;
}

// ───────── oblique height-field renderer ─────────
function renderObj({ W, Hh, OY, xr, y0, y1, hf, shade, SS = 2 }) {
  const gx0 = -xr - 2, gw = 2 * xr + 5, gy0 = y0 - 2, gh = y1 - y0 + 5;
  const G = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) G[j * gw + i] = hf(gx0 + i, gy0 + j);
  const hAt = (x, y) => {
    const fx = x - gx0, fy = y - gy0, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= gw - 1 || j >= gh - 1) return 0;
    const a = fx - i, b = fy - j, k = j * gw + i;
    return G[k] * (1 - a) * (1 - b) + G[k + 1] * a * (1 - b) + G[k + gw] * (1 - a) * b + G[k + gw + 1] * a * b;
  };
  const cw = W * SS, ch = Hh * SS;
  const c = L.makeCanvas(cw, ch), g = c.getContext('2d'), img = g.createImageData(cw, ch), D = img.data, o = [0, 0, 0];
  for (let cx = 0; cx < cw; cx++) {
    const wx = (cx + 0.5) / SS - W / 2;
    if (wx < -xr || wx > xr) continue;
    let hor = null, prevH = 0, prevSy = 0;
    for (let wy = y1; wy >= y0; wy -= 0.25) {
      const h = hAt(wx, wy);
      if (h <= 0.02) { prevH = 0; prevSy = (OY + wy * CY) * SS; continue; }
      const sy = (OY + wy * CY - h * CH) * SS;
      if (hor === null) { hor = (OY + (wy + 0.25) * CY) * SS; prevSy = hor; prevH = 0; }
      if (sy < hor) {
        const top = Math.max(0, Math.ceil(sy)), bot = Math.min(ch - 1, Math.ceil(hor) - 1);
        if (bot >= top) {
          const dx = (hAt(wx + 1, wy) - hAt(wx - 1, wy)) * 0.5, dy = (hAt(wx, wy + 1) - hAt(wx, wy - 1)) * 0.5;
          const span = prevSy - sy;
          for (let py = top; py <= bot; py++) {
            const t = span > 0.001 ? cl((prevSy - py) / span) : 1;
            shade(wx, wy, prevH + (h - prevH) * t, dx, dy, o);
            const k = (py * cw + cx) * 4; D[k] = o[0]; D[k + 1] = o[1]; D[k + 2] = o[2]; D[k + 3] = 255;
          }
        }
        hor = sy;
      }
      prevH = h; prevSy = sy;
    }
  }
  g.putImageData(img, 0, 0);
  const out = L.makeCanvas(W, Hh), q = out.getContext('2d'); q.imageSmoothingEnabled = true; q.imageSmoothingQuality = 'high';
  q.drawImage(c, 0, 0, W, Hh);
  // cast shadow on the paper, from the same height field: a point at height h lands at (x + .81 h, y + .41 h)
  const sh = L.makeCanvas(W, Hh), sg = sh.getContext('2d'); sg.fillStyle = '#2a1a0c';
  for (let j = 0; j < gh; j += 2) for (let i = 0; i < gw; i += 2) {
    const h = G[j * gw + i]; if (h <= 0.02) continue;
    const x = gx0 + i, y = gy0 + j;
    sg.fillRect(W / 2 + x + 0.81 * h - 1.5, OY + (y + 0.41 * h) * CY - 1.5, 4, 3.5);
  }
  return { spr: out, shadow: sh };
}

function build() {
  const N = 1400, c = L.makeCanvas(N, N), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#efe8d6', tone: '#8a6a3a', seed: 'p03paper', size: N, fiber: 0.55, stain: 0.28, foxing: 0.22, edge: 0.12 }), 0, 0);
  const tex = L.paperTex(512, 512, { base: '#e9dfc8', seed: 'p03tooth', tone: '#7a5c34', fiber: 0.7, stain: 0.4, grain: 0.35 });
  const put = (ob, W, Hh, OY, px, py, seed) => {
    K.soak(ob.spr, tex, 0.30); K.wear(ob.spr, { seed, amount: 0.10, size: 1.3 });
    const x = px - W / 2, y = py - OY;
    g.save(); g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.30; g.drawImage(L.blurred(ob.shadow, 16), x, y);       // penumbra
    g.globalAlpha = 0.34; g.drawImage(L.blurred(ob.shadow, 5), x, y);        // core
    g.restore();
    g.save(); g.shadowColor = 'rgba(52,32,14,0.55)'; g.shadowBlur = 2.2; g.shadowOffsetX = 0.6; g.shadowOffsetY = 0.8;   // soft keyline
    g.drawImage(ob.spr, x, y); g.restore();
  };
  const ing = renderObj({ W: 1130, Hh: 560, OY: 335, xr: 322, y0: -195, y1: 195, hf: ingotH, shade: shadeIngot });
  put(ing, 1130, 560, 335, 475, 655, 'p03w1');
  const hoof = renderObj({ W: 1060, Hh: 640, OY: 375, xr: 277, y0: -243, y1: 243, hf: hoofH, shade: shadeHoof });
  put(hoof, 1060, 640, 375, 1055, 875, 'p03w2');
  return c;
}

export default {
  name: '银锭与马蹄金',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.03, x0: -16, y0: 4, x1: 26, y1: -4 });   // camera eases left: the plate slides right
  },
};
