// s37 — 红花 (safflower, Carthamus tinctorius). Macro of the flower head against black; the last subject shot of the film.
//
// The arc is the outer contour of the tuft: the tips of the narrow corolla lobes and the anther tubes poking out between
// them make a fine pale-gold fringe. Below it the slender orange-red corolla tubes run down toward the circle centre,
// packed side by side in loose clumps with dark red crevices between them.
//
// Everything is modelled, not drawn: each floret (tube → throat → 3–5 strap lobes, sometimes an anther tube) is swept
// into a supersampled z-buffer as a round or flattened cylinder with analytic normals. One pass then lights the height
// field: key light from the upper left with real cast shadows (a horizon sweep along the light direction), crevice
// occlusion (blurred height − height), a back-light term that makes the fringe glow, and a hue-shifting ramp
// (near-black red → dark red → orange-red → bright orange → gold) so the colour stays clean in light and in shadow.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;        // rot / zoom are tiny over 5 frames → a small margin is plenty
const SS = 1.5;        // supersampling of the z-buffer render (anti-aliased when scaled back down)
const TOPM = 64;       // room above the crest for the bloom to spill into
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 1023) / 511.5 - 1; };

// key light: upper left (unit vector pointing TOWARD the light; screen y is down, z toward the lens)
const LX = -0.72, LY = -0.42, LZ = 0.55;
const HN = Math.hypot(LX, LY, LZ + 1), HXv = LX / HN, HYv = LY / HN, HZv = (LZ + 1) / HN;   // half vector with the view axis
const SHADOW_TAN = 0.46;   // shadows are cast from a slightly lower sun than the shading uses: longer, more graphic

const RAMP_MAX = 1.4, NL = 768;
function lut(stops) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / RAMP_MAX, c])); const out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

function boxBlur(src, w, h, rad) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), win = rad * 2 + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -rad; x <= rad; x++) acc += src[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc / win;
      const xa = x - rad, xb = x + rad + 1;
      acc += src[o + (xb >= w ? w - 1 : xb)] - src[o + (xa < 0 ? 0 : xa)];
    }
  }
  const acc = new Float32Array(w), cl = (y) => (y < 0 ? 0 : y >= h ? h - 1 : y) * w;
  for (let y = -rad; y <= rad; y++) { const o = cl(y); for (let x = 0; x < w; x++) acc[x] += tmp[o + x]; }
  for (let y = 0; y < h; y++) {
    const o = y * w, oa = cl(y - rad), ob = cl(y + rad + 1);
    for (let x = 0; x < w; x++) { out[o + x] = acc[x] / win; acc[x] += tmp[ob + x] - tmp[oa + x]; }
  }
  return out;
}

function buildFlower(env) {
  const T0 = performance.now(); const marks = [];
  const mark = (n) => marks.push(n + ' ' + (performance.now() - T0).toFixed(0));
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - TOPM;
  const FW = W + PAD * 2, FH = H + PAD - Y0;                       // region in frame px
  const BW = Math.ceil(FW * SS) & ~1, BH = Math.ceil(FH * SS) & ~1, N = BW * BH;
  const FLOOR = -1e4, ZFLOOR = -96 * SS;
  const Z = new Float32Array(N).fill(FLOOR);
  const NX = new Float32Array(N), NY = new Float32Array(N), YE = new Float32Array(N), TN = new Float32Array(N), CS = new Float32Array(N);
  const nA = L.makeNoise('s37a'), nB = L.makeNoise('s37b');

  // ── sweep buffer: one element = a run of samples (x, y, radius, z, yellowness, tone, rib phase) in buffer px ──
  const M = 4096, STEP = 0.62;
  const sx = new Float32Array(M), sy = new Float32Array(M), sr = new Float32Array(M), sz = new Float32Array(M), se = new Float32Array(M), st = new Float32Array(M), sp = new Float32Array(M);
  let sn = 0;
  // u = arc length along the arc from the crest (px), v = depth below the arc (px)
  const put = (u, v, r, z, ye, tn, ph) => {
    if (sn >= M) return 0;
    const th = u / R, rr = R - v;
    sx[sn] = (cx + rr * Math.sin(th) - X0) * SS; sy[sn] = (cy - rr * Math.cos(th) - Y0) * SS;
    sr[sn] = r * SS; sz[sn] = z * SS; se[sn] = ye; st[sn] = tn; sp[sn] = ph;
    return sy[sn++];
  };
  // rasterise the run as a (flattened) cylinder: one horizontal span per sample, nearest surface wins
  const stamp = (flat, cs0, ribA, ribF) => {
    const n = sn; sn = 0;
    for (let i = 0; i < n; i++) {
      const r = sr[i]; if (r < 0.35) continue;
      const row = Math.round(sy[i]); if (row < 0 || row >= BH) continue;
      const i0 = i > 1 ? i - 2 : 0, i1 = i < n - 2 ? i + 2 : n - 1;
      let tx = sx[i1] - sx[i0], ty = sy[i1] - sy[i0];
      const tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
      let c0 = ty, c1 = -tx; if (c0 < 0) { c0 = -c0; c1 = -c1; }      // cross-section direction, pointing right
      const ce = c0 < 0.3 ? 0.3 : c0, x = sx[i], hs = r / ce, ir = ce / r;
      let xa = Math.ceil(x - hs), xb = Math.floor(x + hs);
      if (xa < 0) xa = 0; if (xb >= BW) xb = BW - 1;
      const z = sz[i], ye = se[i], tn = st[i], ph = sp[i], rf = r * flat;
      for (let X = xa, k = row * BW + xa; X <= xb; X++, k++) {
        const s = (X - x) * ir, q = 1 - s * s;
        if (q <= 0) continue;
        const h = z + rf * Math.sqrt(q);
        if (h <= Z[k]) continue;
        Z[k] = h;
        const sb = (s + ribA * Math.sin(s * ribF + ph)) * flat, inv = 1 / Math.sqrt(sb * sb + q);
        NX[k] = sb * c0 * inv; NY[k] = sb * c1 * inv;
        YE[k] = ye; TN[k] = tn; CS[k] = cs0 + s * r;
      }
    }
  };

  // ── the head is not a comb: florets stand in loose clumps with deep crevices between them ──
  const Umax = a.span(PAD + 90) * R;
  const rc = L.rng('s37clumps'), bounds = [];
  for (let u = -Umax - 300; u < Umax + 300;) { const w = rc.range(125, 270); u += w; bounds.push({ u, gh: rc.range(7, 19), cz: rc.range(-8, 8), ct: rc.range(-0.085, 0.085) }); }
  const clump = (u) => {
    let i = 1; while (i < bounds.length - 1 && bounds[i].u < u) i++;
    const lo = bounds[i - 1], hi = bounds[i], x = L.clamp((u - lo.u) / (hi.u - lo.u));
    const dl = u - lo.u, dh = hi.u - u, nb = dl < dh ? lo : hi, d = Math.min(dl, dh);
    return { dome: 1 - (2 * x - 1) * (2 * x - 1), inGap: d < nb.gh, gd: Math.exp(-Math.pow(d / (nb.gh + 16), 2)), cz: hi.cz, ct: hi.ct };
  };
  const sway = (u, v) => 17 * nA.n2(u / 430 + 9.2, v / 380 + 4) + 6 * nB.n2(u / 130 - 4, v / 210 + 2);
  const lowZ = (u, v) => 7 * nA.n2(u / 150 + 3.1, v / 900) + 4 * nB.n2(u / 60 - 7, v / 420);
  // gold only at the very tips, orange a little further down, then the red body colour
  const tipGold = (v, age) => Math.max(age * 0.4 + 0.1, 0.92 * (1 - sstep(1, 30, v)) + 0.22 * (1 - sstep(16, 76, v)));

  const florets = [];
  // mode 0 = deep … 3 = front
  const grow = (seed, mode, spacing, zBase, rLo, rHi, wLo, wHi, vtLo, vtHi) => {
    const r = L.rng(seed);
    for (let u = -Umax; u < Umax; u += spacing * r.range(0.62, 1.42)) {
      const c = clump(u);
      if (mode === 3 && c.inGap) continue;
      if (mode === 2 && c.inGap && r.chance(0.55)) continue;
      const young = r.chance(0.2);
      florets.push({
        u0: u, mode, z0: zBase + r.range(-7, 7) + 22 * Math.pow(c.dome, 0.8) * (0.4 + 0.2 * mode) - 28 * c.gd + c.cz,
        rT: r.range(rLo, rHi), lw: r.range(wLo, wHi), vt: r.range(vtLo, vtHi), age: young ? r.range(0.3, 0.6) : r.range(0, 0.14), flat: r.range(0.85, 1.05),
        tone: c.ct + r.range(-0.06, 0.06), tilt: r.gauss() * 0.012, wA: r.range(2, 8), wL: r.range(70, 160), wP: r.range(0, L.TAU),
        nl: r.int(3, 5), spread: r.range(0.14, 0.5), anther: r.chance(0.2 + 0.1 * mode), sd: r.range(0, 900), r,
      });
    }
  };
  grow('s37deep', 0, 21, -66, 6, 9, 3.2, 4.4, 46, 100);
  grow('s37back', 1, 25, -43, 8, 12, 3.8, 5.2, 48, 108);
  grow('s37mid', 2, 30, -20, 11, 16, 4.6, 6.4, 54, 118);
  grow('s37front', 3, 36, 0, 14, 22, 6, 9.4, 62, 130);
  // a few strays that lean across their neighbours
  { const r = L.rng('s37stray'); for (const f of florets) if (f.mode === 3 && r.chance(0.12)) { f.tilt = r.sign() * r.range(0.08, 0.18); f.z0 += 10; } }
  florets.sort((p, q) => q.z0 - p.z0);     // nearest first → most of the hidden florets fail the depth test early
  mark('gen');

  // one strap-shaped lobe from (u, vB) up to tipV; ang(t) = al0 + curl·t² (parallel at the base, splaying toward the tip)
  const lobe = (u, vB, tipV, al0, curl, wb, lw, zB, zT, age, tn, cs0, ph) => {
    const th0 = u / R;
    // keep the strap within ~68° of screen-vertical so the span rasteriser stays exact
    al0 = L.clamp(al0, -1.15 - th0, 1.15 - th0); curl = L.clamp(al0 + curl, -1.18 - th0, 1.18 - th0) - al0;
    let I = 0; for (let q = 0; q < 10; q++) { const tq = (q + 0.5) / 10; I += Math.cos(al0 + curl * tq * tq) / 10; }
    const len = (vB - tipV) / Math.max(0.4, I), n = Math.ceil(len / (STEP * 0.85)), ds = len / n;
    let v = vB;
    for (let i = 0; i <= n; i++) {
      const t = i / n, ang = al0 + curl * t * t, t2 = t * t, e = sstep(0, 0.42, t);
      const w = (wb + (lw - wb) * e) * (1 - 0.18 * t) * Math.pow(1 - t2 * t2 * t, 0.55);
      put(u, v, w, zB + (zT - zB) * e + 5 * Math.sin(t * Math.PI), tipGold(v, age), tn, ph);
      u += Math.sin(ang) * ds; v -= Math.cos(ang) * ds;
    }
    stamp(0.5, cs0, 0.3, 3.4);
  };

  const yBottom = BH + 24, CST = 6, NC = 170;
  const cu = new Float32Array(NC), cz = new Float32Array(NC), cr = new Float32Array(NC), ct = new Float32Array(NC);
  for (const f of florets) {
    const r = f.r, cs0 = f.sd * 37;
    const axisU = (v) => f.u0 + f.tilt * (v - f.vt) + f.wA * Math.sin(v / f.wL + f.wP) + sway(f.u0, v);
    // corolla tube: from just inside the throat down past the bottom of the frame (slow fields on a coarse grid)
    const vS = f.vt - 9; let nc = 0;
    for (let v = vS; nc < NC; v += CST) {
      cu[nc] = axisU(v); cz[nc] = f.z0 + lowZ(f.u0, v) - 0.025 * v;
      cr[nc] = 1 + 0.08 * nB.n2(v / 64 + f.sd, f.sd * 0.3); ct[nc] = f.tone + 0.07 * nA.n2(v / 85 + f.sd, 3.3);
      nc++;
      if ((cy - (R - v) * Math.cos(cu[nc - 1] / R) - Y0) * SS > yBottom + 30) break;
    }
    const nf = Math.floor((nc - 1) * CST / STEP), twist = r.range(-1, 1) / 70, ph0 = r.range(0, 6);
    for (let i = 0; i < nf; i++) {
      const dv = i * STEP - 9, v = f.vt + dv, fj = (i * STEP) / CST, j = fj | 0, t = fj - j;
      const rr = f.rT * (cr[j] + (cr[j + 1] - cr[j]) * t) * (0.5 + 0.5 * sstep(-9, 12, dv)) * (1 + 0.12 * Math.exp(-(dv > 0 ? dv : 0) / 50)) * (1 - 0.1 * sstep(120, 620, v));
      const ye = f.age * 0.4 + 0.1 * (1 - sstep(50, 240, v));
      if (put(cu[j] + (cu[j + 1] - cu[j]) * t, v, rr, cz[j] + (cz[j + 1] - cz[j]) * t, ye, ct[j] + (ct[j + 1] - ct[j]) * t, ph0 + v * twist) > yBottom) break;
    }
    stamp(f.flat, cs0, 0.16, r.range(6, 10));
    // corolla lobes: the tube splits into narrow straps that sheathe its top and fan out; every tip ends on (or a hair below) the arc
    const vB = f.vt + 22, buB = axisU(vB), mid = (f.nl - 1) / 2, zL = lowZ(f.u0, f.vt);
    for (let k = 0; k < f.nl; k++) {
      const kk = f.nl > 1 ? (k / (f.nl - 1)) * 2 - 1 : 0;
      const tipV = r.chance(0.08) ? r.range(-5, -1) : r.chance(0.14) ? r.range(10, 30) : Math.min(24, -1.5 + Math.abs(r.gauss()) * 6.5);
      lobe(buB + kk * f.rT * 0.6, vB, tipV, kk * f.spread * 0.3 + r.gauss() * 0.05, r.range(-0.3, 0.3) + kk * f.spread * 1.7,
        f.rT * 1.5 / f.nl, f.lw * r.range(0.85, 1.15), f.z0 + zL + f.rT * 0.82 * f.flat - 2 * Math.abs(k - mid), f.z0 + zL + 3 - 5 * Math.abs(k - mid) + r.range(-2, 2),
        f.age, f.tone + r.range(-0.05, 0.05), cs0 + 400 * (k + 1), r.range(0, 6));
    }
    // anther tube with the stigma pushing out of it: a thin yellow rod standing in the fan of lobes
    if (f.anther) {
      const lean = r.range(-0.12, 0.12), tipV = r.range(-4, 7), len = f.vt - 4 - tipV, n = Math.ceil(len / STEP), ar = r.range(3, 4.4) * (0.7 + 0.1 * f.mode), ph = r.range(0, 6);
      const bu = axisU(f.vt);
      for (let i = 0; i <= n; i++) {
        const t = i / n, v = f.vt - 4 - len * t;
        const w = ar * (t > 0.8 ? 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.8) / 0.2, 2))) * (1 + 0.5 * sstep(0.8, 0.9, t)) - 0.28 * sstep(0.9, 1, t) : 1);
        put(bu + lean * len * t + 2 * Math.sin(t * 3 + f.sd), v, w, f.z0 + zL + f.rT * 0.82 + 6, 1.08 - 0.3 * sstep(0.3, 0, t), f.tone + 0.02, ph);
      }
      stamp(1, cs0 + 9000, 0.25, 9);
    }
  }
  // loose lobe tips from florets buried deeper in the head: they close the fringe into one continuous edge
  {
    const r = L.rng('s37fill');
    for (let u = -Umax; u < Umax; u += r.range(5, 12)) {
      const c = clump(u), z = r.range(-64, -18) - 14 * c.gd, tipV = Math.min(20, -1.5 + Math.abs(r.gauss()) * 5.5);
      lobe(u, tipV + r.range(30, 70), tipV, r.gauss() * 0.2, r.gauss() * 0.4, r.range(3, 4.4), r.range(3.2, 4.8), z, z, r.chance(0.2) ? 0.4 : 0.05, c.ct + r.range(-0.1, 0.03), 5e4 + u * 7, r.range(0, 6));
    }
  }
  mark('stamp');

  // pollen dust sitting on the fringe (only where there is something to sit on)
  {
    const r = L.rng('s37pollen'), span = Umax / R;
    for (let i = 0; i < 700; i++) {
      const th = r.range(-span, span), v = -2 + Math.pow(r(), 1.8) * 64, rad = r.range(1.2, 2.8) * SS, rr = R - v;
      const bx = (cx + rr * Math.sin(th) - X0) * SS, by = (cy - rr * Math.cos(th) - Y0) * SS;
      const xc = Math.round(bx), yc = Math.round(by);
      if (xc < 6 || yc < 6 || xc >= BW - 6 || yc >= BH - 6) continue;
      const zc = Z[yc * BW + xc]; if (zc <= FLOOR + 1) continue;
      const e = Math.ceil(rad), tn = r.range(-0.05, 0.1);
      for (let yy = yc - e; yy <= yc + e; yy++) for (let xx = xc - e; xx <= xc + e; xx++) {
        const dx = (xx - bx) / rad, dy = (yy - by) / rad, q = 1 - dx * dx - dy * dy;
        if (q <= 0) continue;
        const k = yy * BW + xx, h = zc + rad * Math.sqrt(q) * 0.8;
        if (h <= Z[k]) continue;
        Z[k] = h; NX[k] = dx * 0.9; NY[k] = dy * 0.9; YE[k] = 1.25; TN[k] = tn; CS[k] = i * 13;
      }
    }
  }

  // ── cast shadows: horizon sweep along the light's travel direction (left → right, slightly downward) ──
  const COV = new Uint8Array(N);
  for (let k = 0; k < N; k++) { if (Z[k] > FLOOR + 1) COV[k] = 1; else Z[k] = ZFLOOR; }
  const SHD = new Float32Array(N);
  {
    const lh = Math.hypot(LX, LY), dxs = -LX / lh, dys = -LY / lh, wUp = dys / dxs, drop = SHADOW_TAN / dxs;
    let prev = new Float32Array(BW).fill(ZFLOOR), cur = new Float32Array(BW);
    for (let Y = 0; Y < BH; Y++) {
      const o = Y * BW;
      for (let X = 0; X < BW; X++) {
        const hc = X ? prev[X - 1] * wUp + cur[X - 1] * (1 - wUp) - drop : ZFLOOR;
        const z = Z[o + X];
        SHD[o + X] = hc - z; cur[X] = z > hc ? z : hc;
      }
      const t = prev; prev = cur; cur = t;
    }
  }
  // crevice occlusion + the slow relief of the clumps: a blurred copy of the height field at half resolution
  const HW2 = BW >> 1, HH2 = BH >> 1;
  let ZBL = new Float32Array(HW2 * HH2);
  for (let y = 0; y < HH2; y++) for (let x = 0, o = y * 2 * BW; x < HW2; x++, o += 2) ZBL[y * HW2 + x] = (Z[o] + Z[o + 1] + Z[o + BW] + Z[o + BW + 1]) * 0.25;
  { const br = Math.round(4 * SS); ZBL = boxBlur(boxBlur(ZBL, HW2, HH2, br), HW2, HH2, br); }
  mark('shadow');

  // ── shade ──
  const RED = lut([[0, '#050101'], [0.08, '#240503'], [0.2, '#58100a'], [0.32, '#8c1a0b'], [0.46, '#c62f0f'], [0.6, '#e8451a'], [0.78, '#fb6322'],
    [0.95, '#ff8a3a'], [1.15, '#ffab52'], [1.4, '#ffd287']]);
  const GOLD = lut([[0, '#0a0300'], [0.08, '#421803'], [0.2, '#8c4308'], [0.34, '#cb7a12'], [0.5, '#e9a530'], [0.68, '#f2c75a'], [0.9, '#f9d978'],
    [1.15, '#ffe9a6'], [1.4, '#fff6d4']]);
  // 1-D smooth noise table for the fibres, and per-depth LUTs (index = depth below the arc in px)
  const FT = new Float32Array(4096); for (let i = 0; i < 4096; i++) FT[i] = nA.n2(i / 4, 0.37) * 0.75 + nB.n2(i / 1.7, 5.1) * 0.25;
  const VN = 1100, TOP = new Float32Array(VN), TOP2 = new Float32Array(VN), TOPG = new Float32Array(VN), FALL = new Float32Array(VN);
  for (let i = 0; i < VN; i++) { TOP[i] = Math.exp(-i / 30); TOP2[i] = Math.exp(-i / 70); TOPG[i] = Math.exp(-i / 24); FALL[i] = 1 - 0.52 * sstep(90, 640, i); }
  const img = new ImageData(BW, BH), d = img.data;
  const bimg = new ImageData(BW, BH), bd = bimg.data;
  const GHf = Math.ceil(a.yAt(X0) + 96 - Y0), GHb = Math.min(BH, Math.ceil(GHf * SS));
  const gimg = new ImageData(BW, GHb), gd = gimg.data;
  const WRAP = 0.22, AMB = 0.085, LS = 0.6, GD = 3, EU = Math.round(3.4 * SS), KF = 4 / (2.5 * SS), KF2 = 4 / (7 * SS);
  for (let Y = 0; Y < BH; Y++) {
    const ddy = cy - (Y / SS + Y0), gy = (Y / SS) | 0;
    const y2 = Math.min(HH2 - 1, Y >> 1), o2 = y2 * HW2, o2u = Math.max(0, y2 - GD) * HW2, o2d = Math.min(HH2 - 1, y2 + GD) * HW2;
    const up = Y >= EU ? -EU * BW - 2 : 0;
    for (let X = 0; X < BW; X++) {
      const k = Y * BW + X;
      if (!COV[k]) continue;
      const ddx = X / SS + X0 - cx, v = R - Math.sqrt(ddx * ddx + ddy * ddy), z = Z[k];
      const vi = v <= 0 ? 0 : v >= VN - 1 ? VN - 1 : v | 0;
      // fibres running the length of every tube / lobe (two rows of the 1-D table cross-faded along the length)
      const cs = CS[k], fv = v / 70, fj = Math.floor(fv), ft = fv - fj, ci = (cs * KF + 1e5) | 0, ci2 = (cs * KF2 + 1e5) | 0;
      const fa = FT[(ci + fj * 523) & 4095], fib = fa + (FT[(ci + fj * 523 + 523) & 4095] - fa) * ft;
      const fb = FT[(ci2 + fj * 811 + 2048) & 4095], fib2 = fb + (FT[(ci2 + fj * 811 + 2859) & 4095] - fb) * ft;
      const x2 = X >> 1 < HW2 ? X >> 1 : HW2 - 1, xl = x2 >= GD ? x2 - GD : 0, xr = x2 < HW2 - GD ? x2 + GD : HW2 - 1;
      let nx = NX[k] + 0.24 * fib + 0.09 * fib2 - LS * (ZBL[o2 + xr] - ZBL[o2 + xl]) / (4 * GD), ny = NY[k] - LS * (ZBL[o2d + x2] - ZBL[o2u + x2]) / (4 * GD);
      let nn = nx * nx + ny * ny; if (nn > 0.97) { const s = Math.sqrt(0.97 / nn); nx *= s; ny *= s; nn = 0.97; }
      const nz = Math.sqrt(1 - nn);
      let dif = (nx * LX + ny * LY + nz * LZ + WRAP) / (1 + WRAP); if (dif < 0) dif = 0;
      const top = TOP[vi];
      const shd = sstep(0.6 * SS, 10 * SS, SHD[k]);
      let ao = (ZBL[o2 + x2] - z) / (17 * SS); ao = ao < 0 ? 0 : ao > 1 ? 1 : ao;
      const fall = FALL[vi] * (1 - 0.16 * (ddx * ddx) / 1.21e6);
      let I = (dif * 0.86 * (1 - shd * (0.8 - 0.4 * top)) + AMB) * (1 - 0.6 * ao * (1 - 0.5 * top)) * fall;
      // translucent rim on the silhouette that faces the light + a satin highlight, broken up by the fibres
      const lit = (1 - shd) * fall, e1 = 1 - nz;
      const rim = e1 * e1 * Math.sqrt(e1) * (nx < 0 ? 1 : 0.18) * lit;
      let spc = nx * HXv + ny * HYv + nz * HZv; spc = spc > 0.88 ? Math.pow(spc, 40) * (0.55 + 0.45 * fib2) * lit : 0;
      // back light: every edge that looks up into the dark catches it
      let edge = up ? (z - Z[k + up] - 3 * SS) / (12 * SS) : 1; edge = edge < 0 ? 0 : edge > 1 ? 1 : edge;
      I += 0.16 * rim + 0.24 * spc + 0.24 * top + edge * (0.07 + 0.34 * TOP2[vi]) + TN[k];
      I *= (1 + 0.05 * hash((X / SS) | 0, gy)) * (1 + 0.07 * fib);
      if (I < 0) I = 0;
      const li = (I >= RAMP_MAX ? NL - 1 : (I / RAMP_MAX * (NL - 1)) | 0) * 3;
      let ye = YE[k]; const pale = ye > 1 ? ye - 1 : 0; if (ye > 1) ye = 1;
      let r_ = RED[li] + (GOLD[li] - RED[li]) * ye, g_ = RED[li + 1] + (GOLD[li + 1] - RED[li + 1]) * ye, b_ = RED[li + 2] + (GOLD[li + 2] - RED[li + 2]) * ye;
      if (pale > 0) { r_ += (255 - r_) * pale * 0.5; g_ += (244 - g_) * pale * 0.5; b_ += (200 - b_) * pale * 0.5; }
      const o = k * 4;
      d[o] = r_; d[o + 1] = g_; d[o + 2] = b_; d[o + 3] = 255;
      const br = sstep(0.85, 1.3, I);
      bd[o] = r_ * br; bd[o + 1] = g_ * br; bd[o + 2] = b_ * br; bd[o + 3] = 255;
      if (Y < GHb) {
        const ga = TOPG[vi] * (0.12 + 1.3 * rim + 1.1 * spc + 0.4 * dif * (1 - shd) + 0.7 * edge);
        gd[o] = 255; gd[o + 1] = 206; gd[o + 2] = 112; gd[o + 3] = ga >= 1 ? 255 : ga * 255;
      }
    }
  }
  mark('shade');
  const down = (image, w, h, fw, fh, filter) => {
    const big = L.makeCanvas(w, h); big.getContext('2d').putImageData(image, 0, 0);
    const c = L.makeCanvas(fw, fh), g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    if (filter) g.filter = filter;
    g.drawImage(big, 0, 0, fw, fh);
    g.filter = 'none';
    return c;
  };
  const flower = down(img, BW, BH, FW, FH);
  const bloom = down(bimg, BW, BH, FW, FH, 'blur(13px)');
  const glint = down(gimg, BW, GHb, FW, Math.round(GHb / SS));

  // ── shallow depth of field: sharp around the crest, softer toward the sides and the bottom of frame ──
  const fg = flower.getContext('2d');
  const mix = (px, paint) => {
    const c = L.blurred(flower, px), g = c.getContext('2d');
    g.globalCompositeOperation = 'destination-in'; paint(g); g.fillRect(0, 0, FW, FH);
    return c;
  };
  const ox = cx - X0, oy = cy - Y0;       // arc centre in layer coords
  const side = mix(2.6, (g) => { g.fillStyle = L.linear(g, 0, 0, FW, 0, [[0, 'rgba(0,0,0,1)'], [0.2, 'rgba(0,0,0,0.75)'], [0.36, 'rgba(0,0,0,0)'], [0.64, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,1)']]); });
  const low = mix(6.5, (g) => { g.fillStyle = L.radial(g, ox, oy, R - 560, R - 230, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]); });
  fg.drawImage(side, 0, 0); fg.drawImage(low, 0, 0);
  mark('post');
  console.warn('s37 timing: ' + marks.join(' | ') + ' florets ' + florets.length);

  return { flower, bloom, glint, X0, Y0, FW, scratch: L.makeCanvas(FW, glint.height) };
}

export default {
  name: '红花',
  tone: 'light',
  init(env) {
    S = buildFlower(env);
  },
  draw(ctx, env, p) {
    ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.0032, 0.0032, p), zoom = L.lerp(1.0, 1.012, p);
    // the fringe highlight travels along the arc from left to right
    const sg = S.scratch.getContext('2d');
    sg.globalCompositeOperation = 'copy'; sg.drawImage(S.glint, 0, 0);
    sg.globalCompositeOperation = 'destination-in';
    const xw = L.lerp(0.14, 0.86, p) * W - S.X0, hw = 430;
    sg.fillStyle = L.linear(sg, xw - hw, 0, xw + hw, 0, [[0, 'rgba(0,0,0,0.16)'], [0.35, 'rgba(0,0,0,0.6)'], [0.5, 'rgba(0,0,0,1)'], [0.65, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0.16)']]);
    sg.fillRect(0, 0, S.FW, S.scratch.height);
    sg.globalCompositeOperation = 'source-over';
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.flower, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.5; ctx.drawImage(S.bloom, S.X0, S.Y0);
      ctx.globalAlpha = 0.8; ctx.drawImage(S.scratch, S.X0, S.Y0);
    });
  },
};
