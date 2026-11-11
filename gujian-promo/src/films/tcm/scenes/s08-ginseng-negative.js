// s08 — 人参负片. A macro X-ray / film-negative plate: one ginseng root lying in a round bamboo tray (竹匾),
// pushed in so close that the root fills the tray from side to side.
//   · the arc is the outer edge of the tray's thick lashed rim — a broad glowing grey-white band, black above it;
//   · under the rim a dark band of tray floor;
//   · then the root itself, a big ghost-white mass right under the crest: 芦头 with its cup scars (芦碗) on the left →
//     the ring-wrinkled shoulder (横环纹) → the thick 主根, clouded inside, with a cluster of foam cells at its heart →
//     the fork into two 支根 that run off the frame on the right. A few rootlets (须根) beaded with 珍珠点 trail away.
//
// Everything is built as a greyscale "density" picture first (thicker = brighter, overlaps add up like on a real
// radiograph) and only then mapped through the four-colour palette ramp, so the frame stays strictly black / grey / white.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;
const LW = W + PAD * 2;
const RIMW = 84;          // radial width of the tray rim (px)
const TMAX = 158;         // half-thickness of the main root at its belly = the densest, whitest point of the plate
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash1 = (n) => { let h = Math.imul(n | 0, 374761393) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const angDiff = (a, b) => { let d = (a - b) % L.TAU; if (d > Math.PI) d -= L.TAU; if (d < -Math.PI) d += L.TAU; return d; };
const grey = (v, al = 1) => { const g = Math.round(255 * L.clamp(v)); return `rgba(${g},${g},${g},${al})`; };

/** cellular noise without allocations: wor.f1 / wor.f2 = distance to the nearest / second feature point, wor.id = cell id */
const wor = { f1: 0, f2: 0, id: 0 };
function worley(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    const h = hash1(cx * 7919 + cy * 104729 + seed), h2 = hash1(cx * 31337 + cy * 6151 + seed * 3 + 11);
    const dx = cx + 0.12 + 0.76 * h - x, dy = cy + 0.12 + 0.76 * h2 - y, dd = dx * dx + dy * dy;
    if (dd < d1) { d2 = d1; d1 = dd; id = h; } else if (dd < d2) d2 = dd;
  }
  wor.f1 = Math.sqrt(d1); wor.f2 = Math.sqrt(d2); wor.id = id;
}

// palette: 玄黑 → 暗灰 → 银灰 → 幽白
const RAMP = [[0, '#030404'], [0.2, '#2a2e2f'], [0.56, '#9aa3a3'], [1, '#e6ebea']];
function makeLut() {
  const f = L.makeRamp(RAMP), lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const c = f(i / 255); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  return lut;
}
/** map a greyscale canvas through the palette → new opaque canvas */
function tone(src, lut) {
  const img = src.getContext('2d').getImageData(0, 0, src.width, src.height), d = img.data;
  for (let k = 0; k < d.length; k += 4) { const v = d[k] * 3; d[k] = lut[v]; d[k + 1] = lut[v + 1]; d[k + 2] = lut[v + 2]; d[k + 3] = 255; }
  const out = L.makeCanvas(src.width, src.height);
  out.getContext('2d').putImageData(img, 0, 0);
  return out;
}
/** a canvas covering the tray (frame rows IY0 … H+PAD, plus PAD left and right), drawn in frame coordinates */
function innerCanvas(IY0, IH, fn) {
  const c = L.makeCanvas(LW, IH), g = c.getContext('2d');
  g.translate(PAD, -IY0);
  if (fn) fn(g);
  return c;
}

// ───────────────────────── tray floor: twill-woven bamboo, barely exposed and out of focus ─────────────────────────
function buildMat(env, IY0, IH) {
  const a = env.arc, sc = 0.5, w = Math.ceil(LW * sc), h = Math.ceil(IH * sc);
  const img = new ImageData(w, h), d = img.data, nz = L.makeNoise('s08mat');
  const SW = 42, ang = L.deg(33), ca = Math.cos(ang), sa = Math.sin(ang);
  const jit = new Float32Array(512);
  for (let i = 0; i < 512; i++) jit[i] = 0.62 + 0.76 * hash1(i * 7 + 3);
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) / sc + IY0;
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / sc - PAD, k = (j * w + i) * 4;
      // the strips wander a little: nothing in a hand-woven tray is ruler-straight
      const wv = 12 * nz.n2(x / 460, y / 460), wu = 12 * nz.n2(x / 460 + 31, y / 460 - 12);
      const qa = ((x - 960) * ca + (y - 800) * sa + wv) / SW + 1000, qb = (-(x - 960) * sa + (y - 800) * ca + wu) / SW + 1000;
      const ia = Math.floor(qa), ib = Math.floor(qb), fa = qa - ia, fb = qb - ib;
      const ea = Math.min(fa, 1 - fa), eb = Math.min(fb, 1 - fb);
      const va = (0.6 + 0.4 * Math.sqrt(ea * 2)) * Math.min(1, ea / 0.09) * jit[ia & 255];
      const vb = (0.6 + 0.4 * Math.sqrt(eb * 2)) * Math.min(1, eb / 0.09) * jit[256 + (ib & 255)];
      const over = ((ia + ib) & 3) < 2;           // 2/2 twill: which strip lies on top here
      const val = 0.3 * va + 0.3 * vb + 0.48 * (over ? va : vb);
      d[k] = d[k + 1] = d[k + 2] = 255 * (0.03 + 0.062 * val);
      d[k + 3] = 255;
    }
  }
  const small = L.makeCanvas(w, h);
  small.getContext('2d').putImageData(img, 0, 0);
  const c = L.makeCanvas(LW, IH), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, LW, IH);
  // uneven exposure + falloff away from the subject
  g.globalCompositeOperation = 'multiply';
  g.drawImage(L.noiseTex(LW, IH, { seed: 's08matx', scale: 420, octaves: 3, res: 0.2, ramp: [[0, '#6a6a6a'], [1, '#ffffff']] }), 0, 0);
  g.fillStyle = L.radial(g, PAD + a.cx, a.crestY + 300 - IY0, 300, 1250, [[0, '#ffffff'], [1, '#585858']]);
  g.fillRect(0, 0, LW, IH);
  return c;
}

// ───────────────────────── the ginseng ─────────────────────────
/** Catmull-Rom through [[x,y,r]...] at ~step px */
function spline3(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t, o = [0, 0, 0];
      for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push(o);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
/** a root "bone": centre line through [x, y, radius] control points → dense samples {x,y,r,u,tx,ty} */
function makeBone(id, ctrl, o = {}) {
  const { knob = 0, knobLen = 96, lump = 0.035 } = o;
  const nz = L.makeNoise('s08bone' + id);
  const raw = spline3(ctrl, 2);
  const out = []; let u = 0;
  for (let i = 0; i < raw.length; i++) {
    const A = raw[Math.max(0, i - 1)], B = raw[Math.min(raw.length - 1, i + 1)];
    let tx = B[0] - A[0], ty = B[1] - A[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    if (i) u += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    const r = Math.max(2, raw[i][2] * (1 + knob * Math.sin((u / knobLen) * L.TAU + id * 1.7) + lump * nz.n2(u / 150, id * 3.3) + lump * 0.4 * nz.n2(u / 47, id * 5.1)));
    out.push({ x: raw[i][0], y: raw[i][1], r, u, tx, ty });
  }
  out.id = id; out.len = u;
  return out;
}
const boneAt = (b, f) => b[Math.round(L.clamp(f) * (b.length - 1))];

/** tapered ribbon through pts [[x,y,w]...] from index i0 to i1 (one fill → no beading at the joints) */
function ribbon(g, pts, i0, i1, wScale, fadeEnd) {
  const n = i1 - i0 + 1; if (n < 2) return;
  const lx = new Float32Array(n), ly = new Float32Array(n), rx = new Float32Array(n), ry = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = i0 + k, A = pts[Math.max(i0, i - 1)], B = pts[Math.min(i1, i + 1)];
    let nx = -(B[1] - A[1]), ny = B[0] - A[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    let hw = pts[i][2] * wScale * 0.5; if (fadeEnd) hw *= Math.sqrt(1 - k / (n - 1));
    lx[k] = pts[i][0] + nx * hw; ly[k] = pts[i][1] + ny * hw; rx[k] = pts[i][0] - nx * hw; ry[k] = pts[i][1] - ny * hw;
  }
  g.beginPath(); g.moveTo(lx[0], ly[0]);
  for (let k = 1; k < n; k++) g.lineTo(lx[k], ly[k]);
  for (let k = n - 1; k >= 0; k--) g.lineTo(rx[k], ry[k]);
  g.closePath(); g.fill();
}
function buildGinseng(env, IY0, IH) {
  const a = env.arc, N = LW * IH;
  // the layout was composed on the TIGHT arc (R 1900, crest 548); re-seat it on whatever arc we are handed
  const P = (x, y, r) => {
    const dx = Math.min(1500, Math.abs(x - 960)), xx = a.cx + L.clamp(x - 960, -1500, 1500);
    return [x - 960 + a.cx, y - (548 + 1900 - Math.sqrt(1900 * 1900 - dx * dx)) + a.yAt(xx), r];
  };
  // ── skeleton ──
  const main = makeBone(0, [P(396, 918, 60), P(452, 904, 104), P(560, 884, 136), P(720, 868, 154), P(880, 862, 158), P(1030, 862, 149), P(1150, 866, 133), P(1235, 872, 118)], { lump: 0.045 });
  const head = makeBone(1, [P(424, 912, 49), P(350, 928, 42), P(285, 914, 46), P(222, 928, 40), P(166, 912, 44), P(136, 908, 42)], { knob: 0.2, knobLen: 92, lump: 0.02 });
  const legA = makeBone(2, [P(1180, 838, 97), P(1340, 840, 83), P(1510, 866, 69), P(1680, 918, 56), P(1840, 988, 44), P(1990, 1066, 32)], { lump: 0.05 });
  const legB = makeBone(3, [P(1168, 908, 99), P(1310, 962, 85), P(1450, 1024, 70), P(1590, 1092, 55), P(1720, 1164, 40)], { lump: 0.05 });
  const side = makeBone(4, [P(318, 950, 12), P(292, 994, 12.5), P(244, 1030, 10.5), P(178, 1050, 8), P(100, 1058, 5.5), P(10, 1050, 3.2)], { lump: 0.08 });   // 艼: an adventitious root off the rhizome
  const bones = [main, head, legA, legB, side];

  // ── stamp the union of swept spheres: per pixel keep the bone with the longest chord ──
  const Pw = new Float32Array(N).fill(-1e9), Rb = new Float32Array(N), Db = new Float32Array(N), Ub = new Float32Array(N), Vb = new Float32Array(N), Id = new Uint8Array(N);
  for (const b of bones) {
    let next = -1;
    for (let q = 0; q < b.length; q++) {
      const s = b[q];
      if (s.u < next && q !== b.length - 1) continue;
      next = s.u + Math.max(1.5, s.r / 14);
      const R1 = s.r + 1, r2 = s.r * s.r, R12 = R1 * R1;
      const i0 = Math.max(0, Math.floor(s.x - R1 + PAD)), i1 = Math.min(LW - 1, Math.ceil(s.x + R1 + PAD));
      const j0 = Math.max(0, Math.floor(s.y - R1 - IY0)), j1 = Math.min(IH - 1, Math.ceil(s.y + R1 - IY0));
      for (let j = j0; j <= j1; j++) {
        const dy = IY0 + j + 0.5 - s.y;
        for (let i = i0; i <= i1; i++) {
          const dx = i - PAD + 0.5 - s.x, d2 = dx * dx + dy * dy;
          if (d2 > R12) continue;
          const pw = r2 - d2, k = j * LW + i;
          if (pw > Pw[k]) { Pw[k] = pw; Rb[k] = s.r; Db[k] = Math.sqrt(d2); Ub[k] = s.u + dx * s.tx + dy * s.ty; Vb[k] = (s.tx * dy - s.ty * dx) / s.r; Id[k] = b.id; }
        }
      }
    }
  }
  const kAt = (x, y) => { const i = Math.floor(x + PAD), j = Math.floor(y - IY0); return i >= 0 && j >= 0 && i < LW && j < IH ? j * LW + i : -1; };
  const inBody = (x, y) => { const k = kAt(x, y); return k >= 0 && Pw[k] > 0; };

  // ── shade: chord length → density; cloud and foam inside, ring wrinkles on the shoulder, a thin dense skin ──
  const img = new ImageData(LW, IH), d = img.data;
  const nA = L.makeNoise('s08a'), nB = L.makeNoise('s08b');
  const fc = boneAt(main, 0.7), fx = fc.x, fy = fc.y - 14;         // heart of the foam cluster
  for (let j = 0; j < IH; j++) {
    const y = IY0 + j + 0.5;
    for (let i = 0; i < LW; i++) {
      const k = j * LW + i;
      if (Pw[k] < -1e8) continue;
      const r = Rb[k], delta = r - Db[k];
      if (delta <= -0.5) continue;
      const x = i - PAD + 0.5, id = Id[k], u = Ub[k], v = Vb[k];
      // 横环纹: transverse wrinkles crowding the shoulder of the main root — a bright fold with a dark groove beside it
      let ring = 0, groove = 0;
      if (id === 0) {
        const fade = (1 - sstep(170, 520, u)) * sstep(22, 70, u);
        if (fade > 0.01) {
          const ph = u + 40 * v * v + 12 * nB.n2(u / 130, v * 1.3);
          const val = nA.n2(ph / 40, v * 0.36 + 7.3);
          ring = fade * Math.exp(-(val * val) / 0.006);
          groove = fade * Math.exp(-((val - 0.17) * (val - 0.17)) / 0.018);
        }
      }
      const al = L.clamp(delta + 0.5 - 3.4 * groove);       // the grooves notch the outline
      if (al <= 0) continue;
      const tN = Math.min(1, Math.sqrt(Math.max(0, Pw[k])) / TMAX);
      let base = 0.2 + 0.8 * Math.pow(tN, 0.52);
      // slow billows, and the grain of the root running along its axis
      const wx = nB.n2(x / 170, y / 170), wy = nB.n2(x / 170 + 40, y / 170 - 17);
      const cl = nA.fbm(x / 340 + 0.5 * wx, y / 210 + 0.5 * wy, 3);
      base *= 0.9 + 0.15 * cl;
      base *= 1 + 0.04 * nB.n2(u / 230, v * 5 + id * 9);
      // foam: a cluster of cells at the heart of the root — dark inside, smoke hanging in them, thin bright walls between
      const gx = (x - fx) / 310, gy = (y - fy) / 92, hx = (x - fx + 410) / 120, hy = (y - fy - 6) / 56;
      const G = 1.25 * Math.exp(-gx * gx - gy * gy) + 0.75 * Math.exp(-hx * hx - hy * hy) + 0.3 * nA.n2(x / 200 + 3, y / 150 - 8) - 0.24;
      if (G > 0) {
        const M = sstep(0, 0.42, G) * sstep(8, 52, delta);
        if (M > 0.004) {
          const px = x + 44 * wx + 13 * nA.n2(x / 58, y / 58 + 9), py = y + 44 * wy + 13 * nA.n2(x / 58 + 21, y / 58);
          worley(px / 122, py / 94, 5);
          const e1 = wor.f2 - wor.f1, dep = 0.45 + 0.55 * wor.id;
          const thick = 0.028 + 0.05 * (0.5 + 0.5 * nB.n2(x / 150 + 3, y / 150));
          let cav = sstep(thick, thick + 0.3, e1) * dep;                 // 0 at the wall → deep inside the cell
          let wall = (1 - sstep(thick * 0.3, thick, e1)) * (0.5 + 0.5 * (0.5 + 0.5 * nB.n2(x / 85 + 7, y / 85)));
          // fine froth gathered here and there between the big cells
          const fm = sstep(-0.05, 0.45, nB.n2(x / 230 + 9, y / 180 - 3));
          if (fm > 0.01) {
            worley((x + 62 * wx) / 50, (y + 62 * wy) / 41, 9);
            const e2 = wor.f2 - wor.f1, c2 = sstep(0.04, 0.3, e2);
            cav *= 1 - fm * 0.62 * (1 - c2);
            wall = Math.max(wall, (1 - sstep(0.015, 0.055, e2)) * 0.7 * fm);
          }
          const veil = nA.ridged(px / 74, py / 54, 2);
          const inside = 0.1 + 0.26 * veil * veil;
          base = L.lerp(base, inside, cav * M * 0.94);
          base += Math.max(0, 0.96 - base) * wall * M;
        }
      }
      base = base * (1 - 0.22 * groove) + 0.16 * ring;
      const skin = (0.4 * Math.exp(-delta / 2.4) + 0.2 * Math.exp(-delta / 12)) * (0.6 + 0.4 * Math.min(1, r / 60));
      const o = k * 4;
      d[o] = d[o + 1] = d[o + 2] = 255 * L.clamp(base + skin); d[o + 3] = 255 * al;
    }
  }
  const bodyC = L.makeCanvas(LW, IH);
  bodyC.getContext('2d').putImageData(img, 0, 0);

  // ── 须根: a few long wavy rootlets that branch once or twice and keep inside the tray ──
  const r = L.rng('s08whiskers'), nz = L.makeNoise('s08w');
  const whiskers = [], pearls = [];
  function grow(x, y, h, len, w0, depth, curl0) {
    const step = 5, n = Math.max(6, Math.round(len / step));
    const row = r.range(0, 200), curl = curl0 !== undefined ? curl0 : r.range(-0.0007, 0.0007) * (depth ? 1.6 : 1);
    const wav = depth === 2 ? 0.0075 : depth === 1 ? 0.0046 : 0.0034, lam = depth === 2 ? r.range(80, 140) : r.range(190, 330);
    const LIM = -(RIMW + r.range(16, 64));                 // each strand settles at its own distance from the rim
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const uu = i / n;
      pts.push([x, y, Math.max(0.9, w0 * Math.pow(1 - uu, 0.7) * (1 + 0.22 * nz.n2(i * 0.08, row + 50)))]);
      h += (curl + wav * nz.n2((i * step) / lam, row) + 0.003 * nz.n2((i * step) / 40, row + 90)) * step;
      // steer along the rim, early and gently, instead of running into it
      const ddx = x - a.cx, ddy = y - a.cy, rho = Math.hypot(ddx, ddy), dr = rho - a.R;
      if (dr > LIM - 110) {
        const nx = ddx / rho, ny = ddy / rho;
        if (Math.cos(h) * nx + Math.sin(h) * ny > -0.05) {
          const tx = -ny, ty = nx, sg = Math.cos(h) * tx + Math.sin(h) * ty >= 0 ? 1 : -1;
          const target = Math.atan2(sg * ty, sg * tx) + sg * 0.05, kk = sstep(LIM - 110, LIM - 12, dr);
          h += angDiff(target, h) * (0.03 + 0.3 * kk * kk);
        }
      }
      x += Math.cos(h) * step; y += Math.sin(h) * step;
      const rho2 = Math.hypot(x - a.cx, y - a.cy);
      if (rho2 - a.R > LIM) { const f = (a.R + LIM) / rho2; x = a.cx + (x - a.cx) * f; y = a.cy + (y - a.cy) * f; }
    }
    return pts;
  }
  function tree(x, y, h, len, w0, depth, curl0) {
    const pts = grow(x, y, h, len, w0, depth, curl0), n = pts.length - 1;
    whiskers.push({ pts, w0, depth });
    // 珍珠点: small warts strung irregularly along the rootlet
    let i = Math.round(n * 0.1) + r.int(1, 6);
    while (i < n - 1) {
      const q = pts[i], sd = r.sign() * q[2] * 0.34, B = pts[i + 1];
      let nx = -(B[1] - q[1]), ny = B[0] - q[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      pearls.push({ x: q[0] + nx * sd, y: q[1] + ny * sd, r: L.clamp(1.2 + 0.3 * q[2] + r.range(0, 1.2), 1.8, 4.6), a: r.range(0.5, 0.9), u: i / n, depth });
      i += r.int(6, 22);
    }
    if (depth >= 2) return;
    const nb = depth === 0 ? r.int(1, 3) : r.int(0, 1);
    for (let b = 0; b < nb; b++) {
      const idx = Math.floor(r.range(0.12, 0.8) * n), q = pts[idx], q2 = pts[Math.min(n, idx + 1)];
      const hl = Math.atan2(q2[1] - q[1], q2[0] - q[0]);
      tree(q[0], q[1], hl + r.sign() * r.range(0.2, 0.6), len * (1 - idx / n) * r.range(0.5, 0.9) + (depth ? 50 : 90), Math.max(depth ? 1.6 : 2.2, q[2] * r.range(0.5, 0.72)), depth + 1);
    }
  }
  /** rootlet leaving bone b at fraction f, on side sd (−1 / +1), turned `ang` away from the bone's direction */
  const spawn = (b, f, sd, ang, len, w0, curl0) => {
    const sp = boneAt(b, f), hb = Math.atan2(sp.ty, sp.tx), nx = -sp.ty, ny = sp.tx;
    tree(sp.x + nx * sd * sp.r * 0.8, sp.y + ny * sd * sp.r * 0.8, hb + sd * ang, len * r.range(0.9, 1.15), w0, 0, curl0);
  };
  // under and between the two branch roots
  [[0.14, 1, 1.0, 330, 7], [0.4, 1, 0.8, 300, 6], [0.45, -1, 0.5, 380, 6.5], [0.7, -1, 0.35, 320, 5]].forEach((q) => spawn(legB, ...q));
  [[0.3, 1, 0.7, 360, 6.5], [0.55, 1, 0.55, 340, 5.5], [0.78, 1, 0.5, 260, 4.5]].forEach((q) => spawn(legA, ...q));
  // off the back of the upper branch root, into the dark band under the rim
  [[0.22, -1, 0.75, 520, 7], [0.5, -1, 0.6, 420, 5.5], [0.06, -1, 2.2, 620, 7.5]].forEach((q) => spawn(legA, ...q));
  // thin ones off the main root, the rhizome and the 艼
  [[0.3, 1, 1.9, 300, 5], [0.55, 1, 1.4, 320, 5.5], [0.78, 1, 1.2, 300, 5.5], [0.5, -1, 2.0, 420, 4.5], [0.75, -1, 1.1, 380, 4.5]].forEach((q) => spawn(main, ...q));
  spawn(head, 0.5, 1, 0.9, 240, 3.6);
  spawn(side, 0.5, -1, 0.5, 240, 3.2); spawn(side, 0.75, 1, 0.4, 200, 3);

  const O = innerCanvas(IY0, IH, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, IY0, LW, IH);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff';
    for (const w of whiskers) {
      const n = w.pts.length - 1, al = L.clamp(0.2 + 0.05 * w.w0, 0.3, 0.6);
      g.globalAlpha = al; ribbon(g, w.pts, 0, n, 1, false);
      g.globalAlpha = al * 0.6; ribbon(g, w.pts, 0, Math.floor(n * 0.62), 0.55, true);   // denser core toward the base
    }
    for (const q of pearls) { g.globalAlpha = q.a; g.beginPath(); g.arc(q.x, q.y, q.r, 0, L.TAU); g.fill(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'screen';
    g.drawImage(bodyC, -PAD, IY0);
    // 芦碗: cup-shaped stem scars dimpling alternate sides of the rhizome, the last one opening at its tip
    g.lineCap = 'round'; g.strokeStyle = '#fff';
    const cup = (x, y, rot, ex, ey, a0, a1) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1;
      g.fillStyle = L.radial(g, 0, 0, 0, Math.max(ex, ey), [[0, '#4a4a4a'], [0.55, '#6c6c6c'], [0.9, '#c4c4c4'], [1, '#ffffff']]);
      g.beginPath(); g.ellipse(0, 0, ex, ey, 0, 0, L.TAU); g.fill();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55; g.lineWidth = 2.6; g.beginPath(); g.ellipse(0, 0, ex, ey, 0, a0, a1); g.stroke();
      g.restore();
    };
    for (let kq = 1; kq <= 3; kq++) {
      const uq = 92 * (kq + 0.25 - 1.7 / L.TAU);
      if (uq > head.len - 30) break;
      const sp = boneAt(head, uq / head.len), sd = kq % 2 ? 1 : -1;
      const nx = -sp.ty, ny = sp.tx, rot = Math.atan2(sp.ty, sp.tx);
      // the cup's wall is the half of the ellipse that faces the axis
      cup(sp.x + nx * sd * sp.r * 0.74, sp.y + ny * sd * sp.r * 0.74, rot, 24, sp.r * 0.5, sd > 0 ? Math.PI + 0.25 : 0.25, sd > 0 ? L.TAU - 0.25 : Math.PI - 0.25);
    }
    const tip = boneAt(head, 1), trot = Math.atan2(tip.ty, tip.tx);
    cup(tip.x + tip.tx * tip.r * 0.62, tip.y + tip.ty * tip.r * 0.62, trot, tip.r * 0.6, tip.r * 0.68, Math.PI * 0.5 + 0.3, Math.PI * 1.5 - 0.3);
  });

  // rootlet pearls that will wink in turn: order them around the fork of the root
  const fork = boneAt(main, 1);
  const cand = pearls.filter((q) => (q.depth >= 1 || q.u > 0.45) && q.x > 40 && q.x < W - 40 && q.y < H - 30 && !inBody(q.x, q.y));
  const rt = L.rng('s08tw'), tw = [];
  const want = 30, stride = Math.max(1, Math.floor(cand.length / want));
  for (let i = Math.floor(stride / 2); i < cand.length && tw.length < want; i += stride) {
    const q = cand[i];
    tw.push({ x: q.x, y: q.y, r: q.r, ang: Math.atan2(q.y - fork.y, q.x - fork.x), k: rt.range(0.6, 1) });
  }
  tw.sort((p, q) => p.ang - q.ang);
  tw.forEach((q, i) => { q.ph = L.clamp(i / Math.max(1, tw.length - 1) + rt.range(-0.06, 0.06)); });
  return { layer: O, tw };
}

// ───────────────────────── tray rim: a bundle of bamboo hoops lashed with split strips ─────────────────────────
function buildRim(env, lut) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const FOG = 70, HALO = 10;                                // the fog the rim throws inward, the halation above its edge
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - HALO - 2, Y1 = Math.min(H + 6, Math.ceil(a.yAt(X0, -(RIMW + FOG))) + 4);
  const RW = LW, RH = Y1 - Y0;
  const img = new ImageData(RW, RH), d = img.data;
  const nz = L.makeNoise('s08rim'), rr = L.rng('s08wrap');
  // the lashing: turns of uneven width, now and then a doubled one, and two short stretches where it has worn away
  const SMAX = R * a.span(PAD + 200);
  const bnd = [], wbr = [];
  const gdp = [];
  for (let s = -SMAX - 120; s < SMAX + 120;) { bnd.push(s); wbr.push(rr.range(-1, 1)); gdp.push(rr.range(0.25, 1)); s += rr.chance(0.12) ? rr.range(10, 17) : rr.range(28, 66); }
  const S0 = bnd[0], NB = bnd.length;
  const bin = new Int16Array(Math.ceil(bnd[NB - 1] - S0) + 2);
  for (let i = 0, k = 0; i < bin.length; i++) { while (k < NB - 2 && bnd[k + 1] <= S0 + i) k++; bin[i] = k; }
  const wrapAt = (sp) => { let k = bin[L.clamp(Math.floor(sp - S0), 0, bin.length - 1)]; while (k < NB - 2 && bnd[k + 1] <= sp) k++; while (k > 0 && bnd[k] > sp) k--; return k; };
  const bare = (s) => Math.max(sstep(452, 500, s) * (1 - sstep(630, 700, s)), sstep(-905, -872, s) * (1 - sstep(-800, -765, s)));
  const fogAt = (e, s, side) => L.clamp((0.36 * Math.exp(-e / 9) + 0.22 * Math.exp(-e / 32)) * (0.5 + 0.7 * (0.5 + 0.5 * nz.fbm(s / 150, e / 50, 2))) * side);
  const ro2 = (R + HALO + 1) * (R + HALO + 1), ri2 = (R - RIMW - FOG) * (R - RIMW - FOG);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i + 0.5 - cx, q2 = ddx * ddx + ddy * ddy;
      if (q2 > ro2 || q2 < ri2) continue;
      const dr = Math.sqrt(q2) - R, s = Math.atan2(ddx, ddy) * R, o = (j * RW + i) * 4;
      const side = 1 - 0.14 * (s / 1150) * (s / 1150);
      if (dr >= 0.5) {                                      // halation: the dense edge bleeds a hair into the unexposed black
        d[o] = 226; d[o + 1] = 232; d[o + 2] = 231; d[o + 3] = 255 * 0.2 * Math.exp(-dr / 2.6) * side;
        continue;
      }
      if (dr < -RIMW - 0.5) {                               // inside the tray: a soft uneven fog fading into the mat
        d[o] = 214; d[o + 1] = 222; d[o + 2] = 221; d[o + 3] = 255 * fogAt(-dr - RIMW, s, side);
        continue;
      }
      const v = L.clamp(-dr / RIMW), c = 2 * v - 1, phi = Math.asin(c);
      const tube = Math.sqrt(Math.max(0, 1 - c * c));
      let I = 0.58 + 0.23 * tube;
      const br = bare(s + 16 * nz.n2(s / 60, 3.1 + v * 0.6)), lash = 1 - br;
      // the hoops inside the bundle show through as two seams along the rim — plainly where the lashing is gone
      const h1 = (v - 0.34 + 0.025 * nz.n2(s / 300, 8)) * RIMW, h2 = (v - 0.69 + 0.025 * nz.n2(s / 260, 5)) * RIMW;
      const seam = 0.045 + 0.1 * br;
      I += seam * (Math.exp(-h1 * h1 / 4) + 0.9 * Math.exp(-h2 * h2 / 4)) - seam * 0.7 * (Math.exp(-(h1 - 3.5) * (h1 - 3.5) / 5) + Math.exp(-(h2 - 3.5) * (h2 - 3.5) / 5));
      I -= 0.075 * br;
      // the lashing: a helix seen straight through — the near side leans one way (an S across the bundle), the far side the other
      const SL = 19 + 8 * nz.n2(s / 230, 9.4);
      const wob = 9 * nz.n2(s / 170, 1.7) + 3 * nz.n2(s / 37, 4.2);
      const sp = s + SL * phi + wob, kf = wrapAt(sp), b0 = bnd[kf], b1 = bnd[kf + 1], ff = L.clamp((sp - b0) / (b1 - b0));
      const ef = Math.min(sp - b0, b1 - sp);
      const sq = s - SL * phi - wob * 0.6 + 13, kb = wrapAt(sq), eb = Math.min(sq - bnd[kb], bnd[kb + 1] - sq);
      const jf = wbr[kf];
      let Lh = 0.07 * jf + 0.02 * wbr[kb];
      Lh += -0.09 + 0.09 * Math.pow(Math.sin(Math.PI * ff), 0.6);      // each turn is a slightly convex strip
      const gd = gdp[sp - b0 < b1 - sp ? kf : kf + 1];
      Lh -= 0.15 * gd * Math.exp(-ef * ef / 7) * (0.5 + 0.5 * tube);
      Lh += 0.06 * gd * Math.exp(-(ef - 4.5) * (ef - 4.5) / 8) + 0.04 * Math.exp(-eb * eb / 6) * tube;
      I += Lh * lash;
      // dense skin of the bundle, strongest on the outer edge (the arc)
      I += 0.34 * Math.exp(dr / 2.4) + 0.2 * Math.exp(-(dr + RIMW) / 2.8) + 0.12 * Math.exp(dr / 12) + 0.06 * Math.exp(-(dr + RIMW) / 10);
      // slow mottling, fibre, and a gentle fall-off toward the sides
      I *= 0.93 + 0.12 * nz.fbm(s / 260, v * 2.2, 3) + 0.03 * nz.n2(s / 6, v * 20);
      I *= side;
      const li = Math.round(255 * L.clamp(I)) * 3;
      let cr = lut[li], cg = lut[li + 1], cb = lut[li + 2], al = L.clamp(0.5 - dr);
      const ai = L.clamp(dr + RIMW + 0.5);
      if (ai < 1) {                                         // inner edge: anti-alias against the fog, not against nothing
        const fa = fogAt(0, s, side) * (1 - ai), tot = ai + fa;
        cr = (cr * ai + 214 * fa) / tot; cg = (cg * ai + 222 * fa) / tot; cb = (cb * ai + 221 * fa) / tot; al = tot;
      }
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255 * al;
    }
  }
  const sharp = L.makeCanvas(RW, RH), sg = sharp.getContext('2d');
  sg.putImageData(img, 0, 0);
  // depth of field: the rim is crisp over the crest and softens toward both ends
  const soft = L.blurred(sharp, 3.2), bg = soft.getContext('2d');
  const m = L.linear(sg, PAD + cx - 1040, 0, PAD + cx + 1040, 0, [[0, 'rgba(0,0,0,1)'], [0.27, 'rgba(0,0,0,0)'], [0.73, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  bg.globalCompositeOperation = 'destination-in'; bg.fillStyle = m; bg.fillRect(0, 0, RW, RH);
  sg.globalCompositeOperation = 'destination-out'; sg.fillStyle = m; sg.fillRect(0, 0, RW, RH);
  sg.globalCompositeOperation = 'lighter'; sg.drawImage(soft, 0, 0);
  return { canvas: sharp, y: Y0 };
}

/** film-negative grain to add over black: mostly nothing, a sparse dusting of faint specks */
function grainAdd(size, seed) {
  const r = L.rng(seed), img = new ImageData(size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 255 * 0.2 * Math.pow(r(), 3); d[i] = v * 0.96; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
  const c = L.makeCanvas(size, size); c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

export default {
  name: '人参负片',
  tone: 'light',
  async init(env) {
    const a = env.arc, lut = makeLut();
    const IY0 = Math.floor(a.crestY) - 30, IH = H + PAD - IY0;
    const mat = buildMat(env, IY0, IH), gin = buildGinseng(env, IY0, IH), O = gin.layer;
    // depth of field: sharp around the crest, melting toward the ends of the root and the bottom corners
    const far = L.blurred(O, 6.5), fg = far.getContext('2d');
    fg.globalCompositeOperation = 'destination-in';
    fg.save(); fg.translate(PAD + a.cx, a.crestY + 250 - IY0); fg.scale(1, 0.6);
    fg.fillStyle = L.radial(fg, 0, 0, 430, 1080, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    fg.fillRect(-2000, -2000, 4000, 4000); fg.restore();
    const og = O.getContext('2d');
    og.setTransform(1, 0, 0, 1, 0, 0); og.globalCompositeOperation = 'source-over'; og.globalAlpha = 1;
    og.drawImage(far, 0, 0);
    // halation: the dense root fogs the plate around it
    const q = L.makeCanvas(LW / 4, IH / 4), qg = q.getContext('2d');
    qg.filter = 'blur(12px)'; qg.drawImage(O, 0, 0, q.width, q.height); qg.filter = 'none';
    const tight = L.blurred(O, 6);
    const g = mat.getContext('2d');
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.5; g.drawImage(q, 0, 0, LW, IH);
    g.globalAlpha = 0.34; g.drawImage(tight, 0, 0);
    g.globalAlpha = 1; g.drawImage(O, 0, 0);
    const inner = tone(mat, lut);
    const rim = buildRim(env, lut);
    S = {
      inner: await createImageBitmap(inner), innerY: IY0, rim: await createImageBitmap(rim.canvas), rimY: rim.y,
      tw: gin.tw, gAdd: grainAdd(512, 's08ga'), pAdd: null,
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#030404'; ctx.fillRect(0, 0, W, H);
    // slow push-in on the contents of the tray; the rim itself stays locked to the arc
    const camO = { zoom: L.lerp(1, 1.035, p), rot: L.lerp(-0.001, 0.001, p), pivot: { x: a.cx, y: a.crestY + RIMW } };
    L.cam(ctx, env, camO, () => {
      ctx.drawImage(S.inner, -PAD, S.innerY);
      // 珍珠点 on the rootlets wink one after another
      ctx.globalCompositeOperation = 'lighter';
      for (const q of S.tw) {
        const e = (p * 1.12 - 0.06 - q.ph) / 0.15, tw = Math.exp(-e * e) * q.k;
        if (tw < 0.04) continue;
        const rad = q.r * 4 + 9;
        ctx.fillStyle = L.radial(ctx, q.x, q.y, 0, rad, [[0, `rgba(244,248,247,${0.95 * tw})`], [0.2, `rgba(230,235,234,${0.45 * tw})`], [1, 'rgba(230,235,234,0)']]);
        ctx.fillRect(q.x - rad, q.y - rad, rad * 2, rad * 2);
      }
    });
    // unexposed black above the tray
    a.fillAbove(ctx, '#030404', -4);
    // the rim: its lashing creeps a few px along the arc
    ctx.save();
    ctx.translate(a.cx, a.cy); ctx.rotate(L.lerp(-0.002, 0.002, p)); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.rim, -PAD, S.rimY);
    ctx.restore();
    // negative grain on the black, re-seated every frame (the compositor's own grain takes care of the lights)
    if (!S.pAdd) S.pAdd = ctx.createPattern(S.gAdd, 'repeat');
    const rg = L.rng('s08grain' + (env.frame | 0)), ox = rg.int(0, 511), oy = rg.int(0, 511);
    ctx.save(); ctx.translate(-ox, -oy);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.fillStyle = S.pAdd; ctx.fillRect(ox, oy, W, H);
    ctx.restore();
  },
};
