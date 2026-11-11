// s04 — 贝币. Macro of a money cowrie lying on a moon-white ground: the arc is the swelling outline of its back.
// Below the arc the porcelain glaze — plain milk-ivory to pale yellow deepening to honey — with one long soft highlight
// under the crest. 货贝 carries no pattern of spots (docs/research/coins-a.json), so the caramel flecks here are age:
// fine earth-rust specks (土锈) lying in uneven drifts, never a leopard pattern. At lower right the back has been ground
// open on a whetstone: a flat oval facet showing the pale layered section of the shell wall, and the dim chamber inside.
// Above the arc: flat moon-white, nothing else.
//
// The shell is shaded per pixel in init(): every pixel under the arc is mapped onto a sphere of radius arc.R
// (U = distance along the parallel, S = distance down the meridian from the limb) so the specks are foreshortened toward
// the limb like the surface of a real dome. The ground opening is a slightly uneven ellipse in screen space.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 40;                 // the shot only pushes in (zoom ≥ 1) — the margin is a safety net, never revealed
let S = null;

const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const sq = (v) => v * v;

// ── allocation-free worley: distance to the nearest feature point in cD, two independent randoms of that point in cA / cB ──
let cD = 0, cA = 0, cB = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, hw = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const px = xi + ox, py = yi + oy;
    let h = (Math.imul(px, 374761393) + Math.imul(py, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = px + (h & 1023) / 1023 - x, dy = py + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d1 = d; hw = h; }
  }
  cD = Math.sqrt(d1); cA = ((hw >>> 20) & 255) / 255;
  let h2 = Math.imul(hw ^ 0x9e3779b9, 0x85ebca6b); h2 ^= h2 >>> 15;
  cB = (h2 & 1023) / 1023;
}

/** piecewise-linear RGB table: stops [[t,[r,g,b]],…] → Float32Array(n*3) */
function lut3(stops, n = 256) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const t0 = stops[k][0], c0 = stops[k][1], t1 = stops[k + 1][0], c1 = stops[k + 1][1], u = cl((t - t0) / (t1 - t0 || 1));
    for (let c = 0; c < 3; c++) out[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * u;
  }
  return out;
}

// palette (任务单): 牙白 / 蜜 / 焦糖 (土锈 specks, the shaded margin, the skin line on the facet) / 茶渍
const IV = [248, 239, 218], HN = [243, 190, 78], CA = [154, 88, 30], TEA = [208, 132, 46];
// the ground-open hole: an irregular ellipse, lower right
const HO = { x: 1580, y: 1172, rx: 730, ry: 352, c: Math.cos(0.17), s: Math.sin(0.17) };

function buildShell(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 2;
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  const nA = L.makeNoise('s04a'), nB = L.makeNoise('s04b'), nH = L.makeNoise('s04h');

  // outline of the opening (m) and of the chamber edge (inner) as functions of the angle round the ellipse
  const NL = 4096, mL = new Float32Array(NL + 1), inL = new Float32Array(NL + 1);
  for (let k = 0; k <= NL; k++) {
    const ph = -Math.PI + (k / NL) * L.TAU, c = Math.cos(ph), s = Math.sin(ph);
    mL[k] = 1 + 0.03 * nH.n2(c * 1.2 + 3.1, s * 1.2 - 1.7) + 0.01 * nH.n2(c * 4.3 - 8, s * 4.3 + 2.5) + 0.0018 * nH.n2(c * 26, s * 26 + 11) + 0.0007 * nH.n2(c * 75 + 4, s * 75);
    inL[k] = 0.795 + 0.055 * c * c + 0.02 * nH.n2(c * 2.6 + 5, s * 2.6 + 9) + 0.0015 * nH.n2(c * 11 - 3, s * 11) + 0.028 * Math.max(0, nH.n2(c * 6 + 30, s * 6 - 12) - 0.5);
  }

  // slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cMot = new Float32Array(cw * ch), cDen = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * rr, Sv = R * Math.acos(Math.min(1, rr / R)), k = j * cw + i;
    cMot[k] = nA.fbm(U / 430, Sv / 430, 3, 2, 0.55) + 0.35 * nA.n2(U / 1500 + 9, Sv / 1500);
    cDen[k] = nB.fbm(U / 330 + 40, Sv / 330 - 13, 3, 2, 0.55) + 0.3 * nB.n2(U / 1100 - 5, Sv / 1100 + 2);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // shading multiplier by how much key light a point receives: shadows stay warm and saturated, never grey
  const SH = lut3([[0, [0.42, 0.25, 0.12]], [0.3, [0.7, 0.46, 0.25]], [0.6, [0.94, 0.79, 0.59]], [0.82, [0.975, 0.92, 0.83]], [1, [0.985, 0.96, 0.93]]]);
  // cross-section of the shell wall on the ground facet: 0 = chamber edge → 1 = outer (glazed, pigmented) skin
  const FC = lut3([[0, [170, 128, 86]], [0.035, [224, 210, 190]], [0.1, [236, 228, 216]], [0.235, [234, 226, 212]], [0.255, [206, 184, 148]], [0.29, [246, 236, 212]],
    [0.45, [249, 241, 220]], [0.565, [246, 236, 210]], [0.59, [212, 192, 154]], [0.625, [252, 247, 234]], [0.8, [255, 251, 242]], [0.9, [250, 244, 230]],
    [0.922, [232, 176, 92]], [0.962, [200, 124, 46]], [1, [150, 86, 32]]]);

  const img = new ImageData(RW, RH), d = img.data;
  const LX = -0.62, LY = -0.36, LZ = 0.7;
  const cb = Math.cos(-0.55), sb = Math.sin(-0.55);          // direction of the grinding strokes
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 2) continue;
      // where are we relative to the opening?
      let e = 9, eIn = 0, radL = 1, cph = 0, sph = 0;
      if (x > 720 && y > 720) {
        const hx = x - HO.x, hy = y - HO.y, X = (hx * HO.c + hy * HO.s) / HO.rx, Y = (-hx * HO.s + hy * HO.c) / HO.ry;
        const f = Math.sqrt(X * X + Y * Y) + 1e-6;
        const fk = ((Math.atan2(Y, X) + Math.PI) / L.TAU) * NL, k0 = Math.min(NL - 1, fk | 0), kt = fk - k0;
        const m = mL[k0] + (mL[k0 + 1] - mL[k0]) * kt;
        eIn = inL[k0] + (inL[k0 + 1] - inL[k0]) * kt;
        e = f / m; radL = Math.sqrt(hx * hx + hy * hy) / e; cph = X / f; sph = Y / f;
      }
      const covH = e < 1.02 ? cl(((1 - e) * radL) / 1.3 + 0.5) : 0;
      const al_ = x * cb + y * sb, ac = -x * sb + y * cb;      // along / across the grinding strokes
      let r = 0, g = 0, b = 0;

      if (covH < 1) {
        // ───── the glaze ─────
        const q = rr < R ? rr / R : 1, al = Math.acos(q), nz = Math.sqrt(1 - q * q);
        const U = Math.atan2(ddx, ddy) * rr, Sv = R * al;
        const mot = bil(cMot, i, j), pd = sstep(-0.3, 0.42, bil(cDen, i, j));
        const fade = sstep(0.05, 0.2, nz);
        // ground colour: milk-ivory clouding into pale yellow and honey — the shell's own colour, no pattern
        const hon = cl(0.3 + 0.55 * mot + 0.5 * (1 - sstep(0.1, 0.5, nz)));
        r = IV[0] + (HN[0] - IV[0]) * hon; g = IV[1] + (HN[1] - IV[1]) * hon; b = IV[2] + (HN[2] - IV[2]) * hon;
        // age: where the earth lay longest the glaze is tea-stained …
        const tea = 0.16 * pd * fade;
        r += (TEA[0] - r) * tea; g += (TEA[1] - g) * tea; b += (TEA[2] - b) * tea;
        cell(U / 66 + 13.7, Sv / 66 + 5.1);
        if (cA < 0.34 * pd) {
          const rad = 0.2 + 0.26 * cB, st = (1 - sstep(rad * 0.15, rad, cD)) * 0.34 * fade;
          r += (TEA[0] - r) * st; g += (TEA[1] - g) * st; b += (TEA[2] - b) * st;
        }
        // … and peppered with fine earth-rust specks, thick in some drifts, almost absent in others
        cell(U / 17 + 3.3, Sv / 17 - 8.1);
        if (cA < 0.13 + 0.7 * pd) {
          const rad = 0.08 + 0.23 * cB * cB, dot = (1 - sstep(rad * 0.5, rad, cD)) * (0.6 + 0.35 * cB) * fade;
          r += (CA[0] - r) * dot; g += (CA[1] - g) * dot; b += (CA[2] - b) * dot;
        }
        cell(U / 7.5 + 71.3, Sv / 7.5 - 20.9);
        if (cA < 0.05 + 0.3 * pd) {
          const dot = (1 - sstep(0.1, 0.22, cD)) * 0.55 * fade;
          r += (CA[0] - r) * dot; g += (CA[1] - g) * dot; b += (CA[2] - b) * dot;
        }
        // the far-turned margin of the shell is a shade deeper
        const hz = (1 - fade) * 0.15;
        r += (CA[0] - r) * hz; g += (CA[1] - g) * hz; b += (CA[2] - b) * hz;
        // ground down / scuffed glaze hugging the lip of the opening
        if (e < 1.22) {
          const s1 = nB.n2(al_ / 95, ac / 1.5), s2 = nA.n2(al_ / 170 + 7, ac / 1.1 + 3);
          const zone = 1 - sstep(1.0, 1.045 + 0.03 * nH.n2(cph * 9, sph * 9 + 4), e);
          const sc = zone * (0.3 + 0.7 * sstep(0.05, 0.55, s1)) * 0.8 + (1 - sstep(1.0, 1.2, e)) * sstep(0.62, 0.8, s2) * 0.5;
          r += (240 - r) * sc; g += (229 - g) * sc; b += (204 - b) * sc;
        }
        // hair-fine growth lines running with the arc (kept faint: this is glaze, not grain)
        const gm = 1 + (0.012 * nA.n2(U / 520, Sv / 2.7) + 0.018 * nB.n2(U / 800 + 4, Sv / 10 + 2)) * fade;
        // key light from the upper left; the limb sinks into a dark caramel margin so the outline bites against the pale ground
        const diff = (ddx / R) * LX - (ddy / R) * LY + nz * LZ;
        const li = ((sstep(-0.1, 0.9, diff) * 255) | 0) * 3;
        const lf = Math.pow(1 - sstep(0, 0.27, nz), 1.3);
        // … and where the dome turns to face the lens it mirrors the dark room behind the camera: a deeper, warmer honey
        const bs = sstep(0.42, 0.8, nz);
        r *= SH[li] * gm * (1 - 0.44 * lf) * (1 - 0.07 * bs); g *= SH[li + 1] * gm * (1 - 0.62 * lf) * (1 - 0.15 * bs); b *= SH[li + 2] * gm * (1 - 0.78 * lf) * (1 - 0.27 * bs);
        // the cool ground mirrored in the glaze on the shadow side
        const cool = Math.exp(-sq((nz - 0.21) / 0.075)) * sstep(-0.05, 0.4, ddx / R) * 0.1;
        r += (176 - r) * cool; g += (198 - g) * cool; b += (206 - b) * cool;
      }

      if (covH > 0) {
        const pxIn = (eIn - e) * radL, covC = cl(pxIn / 1.3 + 0.5);
        let hr = 0, hg = 0, hb = 0;
        if (covC < 1) {
          // the ground facet: matte, chalk-pale, the wall's layers running round the opening, fine parallel grinding marks
          let t = (e - eIn) / (1 - eIn);
          t += 0.012 * nH.n2(cph * 5 + 2, sph * 5 - 6) * (1 - Math.abs(2 * cl(t) - 1));
          const ti = ((cl(t) * 255) | 0) * 3;
          const s1 = nB.n2(al_ / 120, ac / 1.6), s2 = nA.n2(al_ / 45 + 20, ac / 0.8 - 7);
          let fm = 1 + 0.055 * s1 + 0.03 * s2 + 0.035 * nA.n2(x / 190 + 3, y / 190); if (s1 > 0.45) fm -= (s1 - 0.45) * 0.45;
          fm *= 1.0 - 0.1 * sstep(1000, 1960, x);
          hr = FC[ti] * fm; hg = FC[ti + 1] * fm; hb = FC[ti + 2] * fm;
        }
        if (covC > 0) {
          // the chamber: black-brown right under the lip, a little warm light finding the far wall deeper in
          const k = 1 - Math.exp(-Math.max(0, pxIn) / 100);
          const lr = 0.6 * sstep(1150, 1950, x) + 0.4 * sstep(880, 1120, y);
          let v = k * (0.35 + 0.65 * lr) * (1 + 0.25 * nA.fbm(x / 140, y / 90, 2));
          const band = (Math.exp(-sq((e / eIn - 0.6) / 0.05)) * 0.75 + Math.exp(-sq((e / eIn - 0.36) / 0.05)) * 0.4) * k * (0.6 + 0.4 * lr);
          const kr = 20 + 92 * v + 50 * band, kg = 9 + 40 * v + 30 * band, kb = 4 + 11 * v + 16 * band;
          hr += (kr - hr) * covC; hg += (kg - hg) * covC; hb += (kb - hb) * covC;
        }
        r += (hr - r) * covH; g += (hg - g) * covH; b += (hb - b) * covH;
      }
      const o = (j * RW + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  const px = L.makeCanvas(RW, RH);
  px.getContext('2d').putImageData(img, 0, 0);

  // assemble: soft shadow on the ground just outside the arc, then the shell clipped exactly to the arc
  const TOP = 150, YL = Y0 - TOP;
  const out = L.makeCanvas(RW, RH + TOP), g = out.getContext('2d');
  g.translate(-X0, -YL);
  g.save(); a.clipAbove(g, -2);
  // light comes from the left → the shadow is a touch fuller on the right-hand slope
  g.fillStyle = L.radial(g, cx + 16, cy + 4, R - 2, R + 120, [[0, 'rgba(98,76,58,0.52)'], [0.07, 'rgba(88,98,102,0.3)'], [0.2, 'rgba(104,122,130,0.13)'], [0.5, 'rgba(120,138,146,0.04)'], [1, 'rgba(130,148,154,0)']]);
  g.fillRect(X0, YL, RW, RH + TOP);
  g.restore();
  g.save(); a.clipBelow(g, 0);
  g.drawImage(px, X0, Y0);
  // a few hairline scratches in the old glaze (kept off the opening)
  const rs = L.rng('s04scratch');
  g.lineCap = 'round';
  for (let n = 0; n < 84; n++) {
    const sx = rs.range(-PAD, W + PAD), sy = rs.range(a.yAt(L.clamp(sx, 0, W)) + 90, H), ang = rs.range(-0.5, 0.5) + (rs.chance(0.3) ? 1.2 : 0), len = rs.range(30, 190);
    const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len * 0.6;
    const inHole = (qx, qy) => { const hx = qx - HO.x, hy = qy - HO.y; return sq((hx * HO.c + hy * HO.s) / HO.rx) + sq((-hx * HO.s + hy * HO.c) / HO.ry) < 1.25; };
    if (inHole(sx, sy) || inHole(ex, ey)) continue;
    const alp = rs.range(0.07, 0.24), lw = rs.range(0.6, 1.1), bend = rs.range(-8, 8);
    const run = (dy, style) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); g.moveTo(sx, sy + dy); g.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 + bend + dy, ex, ey + dy); g.stroke(); };
    run(0.9, `rgba(70,34,10,${alp * 0.8})`); run(0, `rgba(255,248,226,${alp})`);
  }
  g.restore();
  return { cnv: out, x: X0, y: YL };
}

/** the glaze highlights (they slide along the arc in draw): a long soft strip under the crest with a thin echo, and a pale softbox bloom lower left */
function buildHighlight(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = 120, Y0 = Math.floor(a.crestY), HW = 1460, HH = H + 30 - Y0;
  const nz_ = L.makeNoise('s04hl');
  const img = new ImageData(HW, HH), d = img.data;
  const T1 = -0.08, LEN = 0.26, DR1 = -82;
  const UB = -500, SB = 1105, BW = 440, BH = 44;
  for (let j = 0; j < HH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < HW; i++) {
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R) continue;
      const th = Math.atan2(ddx, ddy), dr = rr - R;
      let al = 0;
      if (dr > -260) {
        const u = (th - T1) / LEN, w = u * u < 1 ? Math.pow(1 - u * u, 1.4) : 0;
        if (w > 0) {
          const rip = 1 + 0.2 * nz_.n2((th * R) / 420, dr / 2.4);
          const dd = dr - DR1 - 7 * u * u, thick = 2.5 + 11 * w;
          const core = Math.exp(-sq(dd / thick) * (dd > 0 ? 2.4 : 1));
          al += (core * Math.pow(w, 0.3) + 0.3 * Math.exp(-sq(dd / 34)) * w + 0.12 * Math.exp(-sq(dd / 80)) * w) * rip;
          const u2 = (th - T1 - 0.03) / (LEN * 0.7), w2 = u2 * u2 < 1 ? Math.pow(1 - u2 * u2, 1.2) : 0;
          al += 0.4 * Math.exp(-sq((dr - DR1 + 36) / 3.2)) * w2 * rip;
        }
      }
      if (dr < -230 && dr > -430) {
        const U = th * rr, Sv = R * Math.acos(rr / R), bx = (U - UB) / BW;
        if (bx * bx < 1) {
          const w = Math.pow(1 - bx * bx, 1.2), by = Math.abs(Sv - SB + 30 * bx * bx) / (BH * (0.35 + 0.65 * w));
          if (by < 1) al += 0.62 * Math.pow(w, 0.6) * (1 - sstep(0.45, 1, by)) * (1 + 0.2 * nz_.n2(U / 300, Sv / 3.2));
        }
      }
      if (al <= 0.004) continue;
      const o = (j * HW + i) * 4;
      d[o] = 255; d[o + 1] = 253; d[o + 2] = 245; d[o + 3] = cl(al) * 255;
    }
  }
  const c = L.makeCanvas(HW, HH);
  c.getContext('2d').putImageData(img, 0, 0);
  return { cnv: c, x: X0, y: Y0 };
}

/** the moon-white ground: flat and clean, only the faintest paper tooth */
function buildGround() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#dfe6e6'; g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, 800, 240, 0, 1350, [[0, 'rgba(238,244,243,0.8)'], [0.5, 'rgba(230,237,237,0.3)'], [1, 'rgba(214,224,226,0)']]);
  g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, 960, 320, 760, 1500, [[0, 'rgba(190,208,212,0)'], [1, 'rgba(190,208,212,0.34)']]);
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5;
  g.drawImage(L.noiseTex(W, H, { seed: 's04paper', scale: 7, octaves: 2, res: 0.5, contrast: 1.2, ramp: [[0, '#eef2f2'], [1, '#ffffff']] }), 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.45;
  g.drawImage(L.grainTex(W, H, { seed: 's04grain', amount: 0.16 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

export default {
  name: '贝币',
  tone: 'dark',
  init(env) {
    S = { ground: buildGround(), shell: buildShell(env), hl: buildHighlight(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const zoom = L.lerp(1.0, 1.012, p);                 // a breath of push-in
    const slide = L.lerp(-0.02, 0.03, L.ease.inOutQuad(p)); // the highlight glides right along the arc
    ctx.drawImage(S.ground, 0, 0);
    L.cam(ctx, env, { zoom }, () => {
      ctx.drawImage(S.shell.cnv, S.shell.x, S.shell.y);
      ctx.save(); a.clipBelow(ctx, -1.5);
      ctx.translate(a.cx, a.cy); ctx.rotate(slide); ctx.translate(-a.cx, -a.cy);
      ctx.drawImage(S.hl.cnv, S.hl.x, S.hl.y);
      ctx.restore();
    });
  },
};
