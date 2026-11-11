// s02 — 黄琉璃瓦檐口 · 微距. A macro shot looking down a yellow-glazed roof to its far eave: only eight or nine big
// tile heads sit on the arc. Every ridge of round tiles (筒瓦) ends in a 勾头 — we see its back: the raised rim of the
// wadang disc and one domed nail cap (钉帽) — and every trough between them ends in the rolled lip of a 滴水.
// Focus lies on the eave; the roof behind the heads melts into out-of-focus gold; beyond the eave there is only night and dust.
//
// How it is made: nothing is drawn with gradients. init() builds a HEIGHT FIELD of the roof (tile backs, rims, domes,
// joints, pan-tile laps, glaze runs, chips) plus a glaze-thickness map, then shades it per pixel like a photograph:
// a near key light upper-left (a strip soft-box → shaped highlights), a cool kicker from beyond the eave (rim light),
// cast shadows, cavity occlusion, glaze colour by thickness (thin = straw, pooled = amber), crazing, dust.
// Depth of field is three blurred copies blended in by depth below the eave. draw() only blits layers.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 120;                 // the camera only drifts ~30 px, so a small margin is enough
const LW = W + PAD * 2, LH = H + PAD * 2;
const PITCH = 232;               // one ridge + one trough along the arc → 8½ tile heads across the frame
const S0 = -38;                  // the tile nearest the crest sits a little left of centre (nothing is symmetric)
const KP = 1 / 1050;              // perspective: the roof runs from the eave TOWARD the lens, so everything grows (and blurs) down the frame
let S = null;

const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** every tile head is its own object: width, lean, overhang, crown height, glaze age, dust, nail cap, damage */
function makeTiles(a) {
  const r = L.rng('s02-heads-b');
  const n = Math.ceil((a.span(PAD + 80) * a.R) / PITCH) + 1;
  const T = [];
  for (let i = -n; i <= n; i++) {
    const w = r.range(85, 103);
    const t = {
      i, s: i * PITCH + S0 + r.range(-9, 9), w, tilt: r.range(-0.03, 0.03), e: r.range(-2.6, 1.6), arch: r.range(15, 22),
      hc: r.range(0.62, 0.82) * w, tone: r.range(-0.1, 0.08), hue: r.range(-0.05, 0.04), age: r.range(-0.12, 0.2), dust: r.range(0.25, 0.9),
      capR: r.range(33, 48), capU: r.range(-13, 13), capV: r.range(78, 104), capH: r.range(0.7, 0.95), noCap: 0, drips: [],
      j1: r.range(292, 368), jl: r.range(350, 395), ph: r.range(0, 6.28), ph2: r.range(0, 6.28), seed: r.range(0, 60),
      craze: r.chance(0.35) ? r.range(0.5, 1) : 0, cs: r.range(15, 21),
      // the trough to the right of this tile
      lipE: r.range(-1.6, 1.4), lapLen: r.range(92, 120), lapPh: r.range(22, 60), chips: [],
    };
    // damage: small flakes off the rim bead, the odd flake on the back
    const nc = r.int(0, 3);
    for (let c = 0; c < nc; c++) {
      const onRim = r.chance(0.7);
      t.chips.push({ u: r.range(-0.82, 0.82) * w, v: onRim ? r.range(1, 9) : r.range(22, 140), r: onRim ? r.range(4, 9) : r.range(3, 7), seed: r.range(0, 50), bite: 0 });
    }
    // glaze that ran to the end of the tile in the kiln and froze as beads on the rim (积釉)
    const nd = r.int(0, 2);
    for (let c = 0; c < nd; c++) t.drips.push({ u: r.range(-0.75, 0.75) * w, v: r.range(4, 13), r: r.range(5, 9), h: r.range(3, 5.5) });
    T.push(t);
  }
  for (let i = 1; i < T.length; i++) T[i].tilt = L.clamp(T[i].tilt, T[i - 1].tilt - 0.03, T[i - 1].tilt + 0.03);   // neighbours never lean into each other
  // hand-set the heads nearest the crest so the frame has clear characters: a fresh bright replacement, an old crazed amber one, a bitten rim
  const at = (i) => T[i + n];
  Object.assign(at(0), { tone: 0.05, hue: 0.03, age: -0.12, dust: 0.25, craze: 0 });
  Object.assign(at(-1), { tone: -0.05, hue: -0.03, age: 0.16, dust: 0.7, craze: 1, cs: 18 });
  Object.assign(at(1), { tone: -0.01, age: 0.05, craze: 0.45 });
  at(1).chips.push({ u: 0.34 * at(1).w, v: 1.5, r: 21, seed: 3.3, bite: 10 });
  Object.assign(at(2), { tone: -0.04, age: 0.12, dust: 0.9 });
  Object.assign(at(-2), { tone: 0.03, age: -0.05, craze: 0 });
  at(-2).chips.push({ u: at(-2).capU + at(-2).capR * 0.74, v: at(-2).capV + at(-2).capR * 0.5, r: 10, seed: 8.1, bite: 0 });
  at(-3).chips.push({ u: -0.5 * at(-3).w, v: 2, r: 17, seed: 5.2, bite: 8 });
  Object.assign(at(3), { tone: 0.04, age: -0.08, craze: 0.8, cs: 20, noCap: 1, capR: 40 });   // this one has lost its nail cap
  for (const t of T) for (const c of t.chips) c.rr = (c.r * 1.25) * (c.r * 1.25);
  for (const t of T) {
    const dC = t.capV - t.e - 4;
    t.dsC = (Math.exp(KP * dC) - 1) / KP; t.psC = 1 + KP * t.dsC; t.thC = ((t.s + t.tilt * dC + t.capU) * t.psC) / a.R;
  }
  return { T, n };
}

/** a coarse scalar field over (s = px along the arc, d = px below it), sampled bilinearly in the pixel loop */
function polarField(s0, s1, d0, d1, ds, dd, fn) {
  const w = Math.ceil((s1 - s0) / ds) + 2, h = Math.ceil((d1 - d0) / dd) + 2, A = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) A[j * w + i] = fn(s0 + i * ds, d0 + j * dd);
  const ids = 1 / ds, idd = 1 / dd, mx = w - 1.001, my = h - 1.001;
  return (s, d) => {
    let fx = (s - s0) * ids, fy = (d - d0) * idd;
    fx = fx < 0 ? 0 : fx > mx ? mx : fx; fy = fy < 0 ? 0 : fy > my ? my : fy;
    const ix = fx | 0, iy = fy | 0, o = iy * w + ix; fx -= ix; fy -= iy;
    const p = A[o] + (A[o + 1] - A[o]) * fx, q = A[o + w] + (A[o + w + 1] - A[o + w]) * fx;
    return p + (q - p) * fy;
  };
}

/** crackle: distance between the two nearest feature points of a jittered grid → thin lines where it is ~0 */
function crack(px, py) {
  const xi = Math.floor(px), yi = Math.floor(py);
  let d1 = 9, d2 = 9;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const fx = cx + (h & 1023) / 1023 - px, fy = cy + ((h >>> 10) & 1023) / 1023 - py;
    const dd = fx * fx + fy * fy;
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
  }
  return Math.sqrt(d2) - Math.sqrt(d1);
}

function boxBlur(A, w, h, rad) {
  const B = new Float32Array(A.length), inv = 1 / (rad * 2 + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0; const o = y * w;
    for (let x = -rad; x <= rad; x++) acc += A[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let x = 0; x < w; x++) { B[o + x] = acc * inv; const a0 = x - rad, a1 = x + rad + 1; acc += A[o + (a1 >= w ? w - 1 : a1)] - A[o + (a0 < 0 ? 0 : a0)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += B[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + x];
    for (let y = 0; y < h; y++) { A[y * w + x] = acc * inv; const a0 = y - rad, a1 = y + rad + 1; acc += B[(a1 >= h ? h - 1 : a1) * w + x] - B[(a0 < 0 ? 0 : a0) * w + x]; }
  }
  return A;
}

/** the glazed roof: height field → per-pixel shading → depth of field. Returns { roof, glare, y0 } (canvases LW × RH, top row at layer y = y0) */
function buildRoof(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const nz = L.makeNoise('s02-glaze');
  const { T, n } = makeTiles(a);
  const sMax = a.span(PAD + 40) * R + 30, dMax = LH - PAD - a.crestY + 40;
  // glaze fields: broad mottling, runs that flowed down the tile in the kiln (流釉), settled dust
  const mott = polarField(-sMax, sMax, -20, dMax, 10, 10, (s, d) => nz.fbm(s / 150, d / 190, 3));
  const runs = polarField(-sMax, sMax, -20, dMax, 2.5, 9, (s, d) => sstep(0.26, 0.6, nz.fbm(s / 23 + 40, d / 260, 2) + 0.4 * nz.n2(s / 70, d / 420 + 9)));
  const dustF = polarField(-sMax, sMax, -20, dMax, 4, 4, (s, d) => nz.fbm(s / 80 + 7, d / 80 - 3, 4));

  const y0 = Math.max(0, Math.floor(a.crestY + PAD - 84)) & ~1, RH = LH - y0, N = LW * RH;
  const Z = new Float32Array(N).fill(-40), BO = new Float32Array(N), TH = new Float32Array(N), AL = new Float32Array(N), DU = new Float32Array(N), CR = new Float32Array(N);
  const MAT = new Uint8Array(N), TI = new Uint8Array(N);   // MAT: 0 none · 1 glaze · 2 mortar (夹垄灰 / 捉节灰) · 3 bare body where the glaze has flaked
  const FAR = 236, R2F = (R - FAR) * (R - FAR);   // deeper than this the roof is out of focus anyway → shade 2×2 blocks

  // ───────── pass 1: geometry ─────────
  for (let j = 0; j < RH; j++) {
    const y = j + y0 - PAD + 0.5, dyc = cy - y;
    for (let i = 0; i < LW; i++) {
      const x = i - PAD + 0.5, dxc = x - cx;
      // far zone: only the even/even anchor of each 2×2 block is computed
      const xa = (i & ~1) - PAD + 0.5 - cx, ya = cy - ((j & ~1) + y0 - PAD + 0.5), far = xa * xa + ya * ya < R2F;
      if (far && ((i | j) & 1)) continue;
      const ds = R - Math.sqrt(dxc * dxc + dyc * dyc);
      if (ds < -8) continue;
      // perspective: ps = px per roof unit at this depth; d = distance up the slope in roof units (foreshortened), s = position along the eave
      const ps = ds > 0 ? 1 + KP * ds : 1, d = ds > 0 ? Math.log(ps) / KP : ds;
      const th0 = Math.atan2(dxc, dyc), s = (th0 * R) / ps;
      let k = Math.round((s - S0) / PITCH) + n; k = k < 1 ? 1 : k > 2 * n - 1 ? 2 * n - 1 : k;
      const u0 = s - T[k].s - T[k].tilt * d;
      const kL = u0 >= 0 ? k : k - 1, TL = T[kL], TR = T[kL + 1];
      const uL = s - TL.s - TL.tilt * d, uR = s - TR.s - TR.tilt * d;
      // does one of the two neighbouring round tiles cover this pixel?
      let Tt = null, u = 0, v = 0, bit = 0;
      for (let side = 0; side < 2 && !Tt; side++) {
        const Tc = side ? TR : TL, uc = side ? uR : uL, wr = Tc.w + 3;
        if (uc > -wr && uc < wr) {
          const q = uc / wr;
          let vc = d + Tc.e + 4 - Tc.arch * (1 - Math.sqrt(1 - q * q));
          if (vc < 30) vc += 1.1 * nz.n2(uc * 0.045 + Tc.seed, 3.1) + 0.5 * nz.n2(uc * 0.16 + Tc.seed, 8.4);   // a hand-pressed edge is never a clean curve
          let bt = 0;
          if (vc < 24) for (const c of Tc.chips) if (c.bite) { const e = 1 - ((uc - c.u) * (uc - c.u)) / (c.r * c.r); if (e > 0) { bt = c.bite * Math.sqrt(e) * (0.8 + 0.3 * nz.n2(uc * 0.2 + c.seed, 1.7)); } }
          vc -= bt;
          if (vc > -0.5) {
            const hw = vc < 13 ? wr : Tc.w + 1.3 * Math.sin(vc * 0.021 + Tc.ph);
            if (uc > -hw && uc < hw) { Tt = Tc; u = uc; v = vc; bit = bt; }
          }
        }
      }
      const o = j * LW + i;
      const mo = mott(s, d);
      let z, th, du = 0, mat = 1, al = 1, cr = 0, bo = 0;
      if (Tt) {
        // ── the back of a round tile ──
        const hw = v < 13 ? Tt.w + 3 : Tt.w + 1.3 * Math.sin(v * 0.021 + Tt.ph);
        let aq = u / hw; aq = aq < 0 ? -aq : aq; if (aq > 1) aq = 1;
        const prof = Math.pow(1 - Math.pow(aq, 2.3), 0.435);
        z = Tt.hc * prof * (1 + 0.04 * Math.sin(v * 0.014 + Tt.ph2) + 0.022 * Math.sin(v * 0.037 + Tt.ph));
        th = 0.4 + Tt.age + 0.24 * mo + 0.5 * sstep(0.7, 1, aq);
        al = v < 0.5 ? v + 0.5 : 1;
        // the wadang's back rim: a rounded bead across the tile's end, then a groove where glaze pooled
        const vb = v + bit;
        if (vb < 13) {
          const bt = (vb - 6.5) / 6.5, bd = Math.sqrt(bt * bt < 1 ? 1 - bt * bt : 0);
          z += 6 * bd * (0.5 + 0.5 * prof); th -= 0.24 * bd;
          if (vb < 7) { const e2 = vb < 0 ? 1 : 1 - vb / 7; z *= 0.8 + 0.2 * Math.sqrt(1 - e2 * e2); }
        }
        const g1 = Math.exp(-((vb - 18.5) * (vb - 18.5)) / 18);
        z -= 2.6 * g1; th += 0.62 * g1; du += 0.45 * g1;
        // beads of glaze frozen on the rim
        if (vb < 26) for (const c of Tt.drips) {
          const e = 1 - ((u - c.u) * (u - c.u) + (vb - c.v) * (vb - c.v) * 0.55) / (c.r * c.r);
          if (e > 0) { z += c.h * Math.sqrt(e); th += 0.5 * e; }
        }
        // the nail cap: a glazed dome with a fillet of pooled glaze round its foot
        const cu = ((th0 - Tt.thC) * (R - ds)) / Tt.psC, cv = (ds - Tt.dsC) / (Tt.psC * 0.9), cr2 = Tt.capR, rc = Math.sqrt(cu * cu + cv * cv);
        if (rc < cr2 + 18) {
          if (Tt.noCap) {   // the cap is gone: a ring of old bedding mortar and the head of the iron tile nail
            if (rc < 7.5) { z += 3.5 * Math.sqrt(1 - (rc * rc) / 56.25); mat = 4; }
            else if (rc < cr2 * 0.74 + 3 * nz.n2(cu * 0.09, cv * 0.09)) { z += 1.2 + 0.9 * nz.n2(x * 0.3, y * 0.3); mat = 2; du += 0.5; }
            else if (rc < cr2 * 0.74 + 6) th += 0.3;
          } else if (rc < cr2) { const t = rc / cr2; z += Tt.capH * cr2 * Math.pow(1 - Math.pow(t, 2.5), 0.47) + 3; th = 0.3 + Tt.age + 0.16 * mo + 0.42 * t * t * t * t; }
          else { const f = Math.exp(-(rc - cr2) / 4.2); z += 3.2 * f; th += 0.66 * f; du += (cv > 0 ? 0.55 : 0.25) * f; }
        }
        // joints: the mouth of the next tile up the slope, pointed with mortar
        const vj = v - Tt.j1 - Tt.arch * 0.9 * (1 - Math.sqrt(1 - aq * aq));
        if (vj > -24) {
          let m = Math.round(vj / Tt.jl); if (m < 0) m = 0;
          const jd = vj - m * Tt.jl;
          if (jd > -2.8 && jd < 2.8) { z -= 2.2 * (1 - (jd * jd) / 7.84); mat = 2; }
          else if (jd >= 2.8 && jd < 44) { const f = Math.exp(-(jd - 2.8) / 10); z += 2.8 * f; th -= 0.22 * f; }
          else if (jd < -2.8 && jd > -24) { const f = Math.exp((jd + 2.8) / 5); z -= 1.3 * f; th += 0.3 * f; du += 0.3 * f; }
        }
        // glaze runs stand a little proud and are thicker → deeper amber, and they catch the light
        const st = runs(s + Tt.seed * 7, d);
        z += 1.1 * st; th += 0.34 * st;
        if (!far) z += 0.2 * nz.n2(x * 0.085, y * 0.085) + 0.5 * nz.n2(x * 0.021 + 3, y * 0.021);
        // flaked glaze
        if (v < 150) for (const c of Tt.chips) {
          const cu2 = u - c.u, cv2 = v + bit - c.v, dd = cu2 * cu2 + cv2 * cv2;
          if (dd < c.rr) {
            const e = c.r * (0.8 + 0.3 * nz.n2(cu2 * 0.17 + c.seed, cv2 * 0.17 - c.seed)) - Math.sqrt(dd);
            if (e > 0) { mat = 3; z -= (e < 2.2 ? e : 2.2) + 0.5 * nz.n2(x * 0.45, y * 0.45); } else if (e > -1.8) th += 0.4;
          }
        }
        // crazing (开片) on the older tiles, in patches
        if (Tt.craze > 0 && mat === 1 && !far) {
          const m = sstep(-0.25, 0.3, mo + (Tt.craze - 0.6));
          if (m > 0.02) {
            const wx = 0.35 * nz.n2(u * 0.02 + Tt.seed, v * 0.02);
            cr = (1 - sstep(0.012, 0.06, crack(u / Tt.cs + Tt.seed + wx, v / Tt.cs + wx))) * m;
          }
        }
        du += Tt.dust * (0.4 * dustF(s, d) + 0.05) + 0.15 * (1 - prof) * Tt.dust;
        TI[o] = Tt.i + n;
      } else {
        // ── the trough: pan tiles, concave side up; the first one is the 滴水 with its rolled lip ──
        const eL = uL - TL.w, eR = -uR - TR.w;
        let g = (eL + eR) * 0.5; if (g < 8) g = 8;
        const up = eL - (eL + eR) * 0.5;
        let c2 = (up * up) / (g * g); if (c2 > 1) c2 = 1;
        const vp = d - (0.5 * (TL.arch + TR.arch) - 6 + TL.lipE + 4.5 * (1 - c2));   // the lip sits level with the tiles' shoulders and sags in the middle
        if (vp < -0.5) continue;
        al = vp < 0.5 ? vp + 0.5 : 1;
        let t2 = up / (g + 22); t2 *= t2; if (t2 > 1) t2 = 1;
        z = -5 - 14 * (1 - t2);
        th = 0.56 + TL.age * 0.5 + 0.2 * mo + 0.2 * (1 - c2);
        bo = Math.exp(-(eR < 0 ? 0 : eR) / 18) * (0.55 + 0.45 * sstep(0, 26, vp));
        if (vp < 12) { const b = (vp - 6) / 6; z += 5 * Math.sqrt(b * b < 1 ? 1 - b * b : 0); th -= 0.4 * (1 - b * b); }
        const vl = vp - TL.lapPh - 6 * c2;
        if (vl > 0) { let f = vl / TL.lapLen; f -= Math.floor(f); z += 4.4 * (1 - f); th += 0.2 * sstep(0.86, 1, f) - 0.25 * sstep(0.1, 0, f); du += 0.4 * sstep(0.8, 1, f); }
        const m = eL < eR ? eL : eR;
        if (m < 9 && vp > 3) { const f = 1 - m / 9; z += 6 * f * f; if (m < 3 + 1.6 * nz.n2(x * 0.06, y * 0.06)) mat = 2; }
        if (!far) z += 0.1 * nz.n2(x * 0.05, y * 0.05);
        du += 0.12 + 0.3 * (1 - c2) + 0.3 * dustF(s, d);
        TI[o] = TL.i + n;
      }
      du = du < 0 ? 0 : du > 1 ? 1 : du;
      z *= ps;
      Z[o] = z; TH[o] = th; AL[o] = al; DU[o] = du; CR[o] = cr; MAT[o] = mat; BO[o] = bo;
      if (far && i + 1 < LW && j + 1 < RH) {
        const TIo = TI[o];
        for (let c = 1; c < 4; c++) { const oo = o + (c & 1) + (c >> 1) * LW; Z[oo] = z; TH[oo] = th; AL[oo] = al; DU[oo] = du; MAT[oo] = mat; TI[oo] = TIo; BO[oo] = bo; }
      }
    }
  }

  // cavity occlusion: how far a point sits below its blurred surroundings (troughs, grooves, the foot of a dome)
  const qw = Math.ceil(LW / 4), qh = Math.ceil(RH / 4), ZB = new Float32Array(qw * qh);
  for (let j = 0; j < qh; j++) for (let i = 0; i < qw; i++) { const zz = Z[Math.min(RH - 1, j * 4 + 2) * LW + Math.min(LW - 1, i * 4 + 2)]; ZB[j * qw + i] = zz > -20 ? zz : -20; }
  boxBlur(boxBlur(ZB, qw, qh, 4), qw, qh, 4);

  // glaze colour by thickness: thin = pale straw, normal = imperial yellow, pooled = amber → burnt umber
  const ramp = L.makeRamp([[0, [255, 238, 150]], [0.18, [255, 224, 84]], [0.36, [255, 207, 38]], [0.52, [249, 187, 20]], [0.68, [233, 156, 12]], [0.82, [198, 116, 8]], [0.92, [150, 80, 7]], [1, [104, 52, 8]]]);
  const lr = new Float32Array(256), lg = new Float32Array(256), lb = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = ramp(i / 255); lr[i] = c[0] / 255; lg[i] = c[1] / 255; lb[i] = c[2] / 255; }
  const tone = T.map((t) => 1 + t.tone), hueG = T.map((t) => 1 + t.hue);

  // ───────── pass 2: light ─────────
  const PLx = cx - 400, PLy = a.crestY - 250, PLz = 700, REF = 860;
  let k2x = 0.1, k2y = -0.78, k2z = 0.62; { const m = Math.hypot(k2x, k2y, k2z); k2x /= m; k2y /= m; k2z /= m; }
  const img = new ImageData(LW, RH), px = img.data, gim = new ImageData(LW, RH), gp = gim.data;
  const A1 = 0.48, A2 = 0.2;
  for (let j = 2; j < RH - 2; j++) {
    const y = j + y0 - PAD + 0.5, dyc = cy - y;
    for (let i = 2; i < LW - 2; i++) {
      const o = j * LW + i, al = AL[o];
      if (al <= 0) continue;
      const xa = (i & ~1) - PAD + 0.5 - cx, ya = cy - ((j & ~1) + y0 - PAD + 0.5), far = xa * xa + ya * ya < R2F;
      if (far && ((i | j) & 1)) continue;
      const x = i - PAD + 0.5, zc = Z[o];
      const d = R - Math.sqrt((x - cx) * (x - cx) + dyc * dyc);
      let gx, gy;
      if (far) { gx = (Z[o + 2] - Z[o - 2]) * 0.25; gy = (Z[o + 2 * LW] - Z[o - 2 * LW]) * 0.25; } else { gx = (Z[o + 1] - Z[o - 1]) * 0.5; gy = (Z[o + LW] - Z[o - LW]) * 0.5; }
      const gm = gx * gx + gy * gy; if (gm > 6.25) { const q = 2.5 / Math.sqrt(gm); gx *= q; gy *= q; }
      const inv = 1 / Math.sqrt(1 + gx * gx + gy * gy), nx = -gx * inv, ny = -gy * inv, nzz = inv;
      // key light (near, so every tile sees it from its own angle)
      let lx = PLx - x, ly = PLy - y, lz = PLz - zc;
      const lh = Math.sqrt(lx * lx + ly * ly), ld = Math.sqrt(lh * lh + lz * lz);
      const hx = lx / lh, hy = ly / lh, slope = lz / lh;
      lx /= ld; ly /= ld; lz /= ld;
      let lam = nx * lx + ny * ly + nzz * lz; if (lam < 0) lam = 0;
      const att = Math.pow(REF / ld, 1.5);
      // cast shadow: march toward the light across the height field
      let sh = 1;
      for (let q = 1; q <= 13; q++) {
        const t = q * 7, sx = (i + hx * t + 0.5) | 0, sy = (j + hy * t + 0.5) | 0;
        if (sx < 0 || sx >= LW || sy < 0 || sy >= RH) break;
        const ex = Z[sy * LW + sx] - (zc + slope * t + 1.5);
        if (ex > 0) { const oo = 1 - ex / 7; if (oo < sh) { sh = oo; if (sh <= 0) { sh = 0; break; } } }
      }
      // occlusion
      let fx = i / 4 - 0.5, fy = j / 4 - 0.5; fx = fx < 0 ? 0 : fx > qw - 1.001 ? qw - 1.001 : fx; fy = fy < 0 ? 0 : fy > qh - 1.001 ? qh - 1.001 : fy;
      const ix = fx | 0, iy = fy | 0, qo = iy * qw + ix; fx -= ix; fy -= iy;
      const zb = (ZB[qo] + (ZB[qo + 1] - ZB[qo]) * fx) * (1 - fy) + (ZB[qo + qw] + (ZB[qo + qw + 1] - ZB[qo + qw]) * fx) * fy;
      let ao = 1 + (zc - zb) / 34; ao = ao < 0.3 ? 0.3 : ao > 1.12 ? 1.12 : ao;
      // behind the plane of focus the folds of the roof flatten into one field of gold: lift the shadows with depth
      const deep = sstep(130, 420, d);
      sh += (1 - sh) * 0.6 * deep; ao += (1 - ao) * 0.65 * deep;
      // material
      const mat = MAT[o], du = DU[o], cr = CR[o];
      let ar, ag, ab, gloss;
      if (mat === 1) {
        let t = TH[o] + 0.22 * (1 - ao) * (1 - deep); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const li = (t * 255) | 0, tn = tone[TI[o]];
        ar = lr[li] * tn; ag = lg[li] * tn * hueG[TI[o]]; ab = lb[li] * tn; gloss = 1;
        if (cr > 0) { const c = 1 - 0.36 * cr; ar *= c; ag *= c * 0.94; ab *= c * 0.8; gloss *= 1 - 0.4 * cr; }
        const dd = du * 0.3; ar += (0.88 - ar) * dd; ag += (0.76 - ag) * dd; ab += (0.46 - ab) * dd; gloss *= 1 - 0.75 * du;
      } else if (mat === 2) { ar = 0.42; ag = 0.25; ab = 0.12; gloss = 0.04; ar += 0.26 * du; ag += 0.22 * du; ab += 0.14 * du; }
      else if (mat === 3) { const q = 0.9 + 0.1 * Math.sin(x * 1.7 + y * 2.3); ar = 0.86 * q; ag = 0.72 * q; ab = 0.52 * q; gloss = 0.03; }
      else { ar = 0.30; ag = 0.15; ab = 0.07; gloss = 0.12; }
      // reflection of the strip soft-box, the kicker beyond the eave, and a little blue sky on the flanks that face away
      const rx = 2 * nzz * nx, ry = 2 * nzz * ny, rz = 2 * nzz * nzz - 1;
      let spec = 0, sheen = 0;
      const rl = rx * lx + ry * ly + rz * lz;
      if (rl > 0.3) {
        const m1 = 1 / Math.sqrt(1 - ly * ly), t1x = -ly * lx * m1, t1y = (1 - ly * ly) * m1, t1z = -ly * lz * m1;
        const t2x = ly * t1z - lz * t1y, t2y = lz * t1x - lx * t1z, t2z = lx * t1y - ly * t1x;
        const dx2 = rx - lx, dy2 = ry - ly, dz2 = rz - lz;
        let a1 = dx2 * t1x + dy2 * t1y + dz2 * t1z, a2 = dx2 * t2x + dy2 * t2y + dz2 * t2z;
        const bar = a1 > -0.2 && a1 < -0.07 ? 1 - sstep(0.035, 0.065, a1 < -0.135 ? -0.135 - a1 : a1 + 0.135) : 0;   // the window's glazing bar
        a1 = a1 < 0 ? -a1 : a1; a2 = a2 < 0 ? -a2 : a2;
        spec = (1 - sstep(A1 - 0.12, A1 + 0.08, a1)) * (1 - sstep(A2 - 0.02, A2 + 0.03, a2)) * (1 - 0.85 * bar);
        sheen = rl > 0.8 ? Math.pow((rl - 0.8) * 5, 3) : 0;
      }
      const kd = (rx - k2x) * (rx - k2x) * 2.2 + ((ry - k2y) * (ry - k2y) + (rz - k2z) * (rz - k2z)) * 36;
      const kick = kd < 8 ? Math.exp(-kd) : 0;
      const fres = (1 - nzz) * (1 - nzz);
      const sky = fres * sstep(0.1, 0.75, nx) * 0.7 + fres * sstep(0.2, 0.8, -ny) * 0.3;
      const key = lam * sh * att;
      const shs = 0.25 + 0.75 * sh;
      let k2d = nx * k2x + ny * k2y + nzz * k2z; k2d = k2d < 0 ? 0 : k2d * 0.16;
      const sp = (spec * 1.0 + sheen * 0.2) * gloss * shs * (att > 1.15 ? 1.15 : att);
      const kk = kick * gloss * 0.95;
      const bn = BO[o] * (att > 1.2 ? 1.2 : att);
      let cr_ = ar * (1.06 * key + 0.27 * ao + 0.7 * k2d + 0.4 * bn) + sp * 0.97 + kk * 0.78 + sky * gloss * 0.14;
      let cg_ = ag * (1.03 * key + 0.225 * ao + 0.85 * k2d + 0.33 * bn) + sp * 0.985 + kk * 0.9 + sky * gloss * 0.34;
      let cb_ = ab * (0.9 * key + 0.08 * ao + 1.0 * k2d + 0.12 * bn) + sp * 1.0 + kk * 1.0 + sky * gloss * 0.8;
      // soft shoulder so highlights roll off like film instead of clipping
      if (cr_ > 0.82) cr_ = 0.82 + 0.18 * (1 - Math.exp(-(cr_ - 0.82) / 0.18));
      if (cg_ > 0.82) cg_ = 0.82 + 0.18 * (1 - Math.exp(-(cg_ - 0.82) / 0.18));
      if (cb_ > 0.82) cb_ = 0.82 + 0.18 * (1 - Math.exp(-(cb_ - 0.82) / 0.18));
      const p4 = o * 4, R8 = cr_ * 255, G8 = cg_ * 255, B8 = cb_ * 255, A8 = al * 255;
      px[p4] = R8; px[p4 + 1] = G8; px[p4 + 2] = B8; px[p4 + 3] = A8;
      const gv = sp * 0.9 + kk * 0.6, GA = gv > 0.02 ? (gv > 1 ? 1 : gv) * al * 255 : 0;
      if (GA) { gp[p4] = 255; gp[p4 + 1] = 244; gp[p4 + 2] = 214; gp[p4 + 3] = GA; }
      if (far) for (let c = 1; c < 4; c++) {
        const q4 = p4 + ((c & 1) + (c >> 1) * LW) * 4;
        px[q4] = R8; px[q4 + 1] = G8; px[q4 + 2] = B8; px[q4 + 3] = A8;
        if (GA) { gp[q4] = 255; gp[q4 + 1] = 244; gp[q4 + 2] = 214; gp[q4 + 3] = GA; }
      }
    }
  }

  const sharp = L.makeCanvas(LW, RH);
  const sg = sharp.getContext('2d');
  sg.putImageData(img, 0, 0);
  // the small stuff a macro lens always finds: pinholes in the glaze, iron spots, grit, a couple of lint fibres
  sg.save(); sg.translate(PAD, PAD - y0); sg.globalCompositeOperation = 'source-atop';
  const r = L.rng('s02-grit');
  for (const t of T) {
    const th = t.s / R;
    a.at(sg, th, 0, () => {
      sg.rotate(-t.tilt);
      for (let q = 0; q < 14; q++) {   // pinholes / iron spots
        const u = r.range(-0.8, 0.8) * t.w, v = r.range(18, 200), rad = r.range(0.6, 1.8);
        sg.fillStyle = `rgba(96,50,6,${r.range(0.3, 0.6).toFixed(2)})`; sg.beginPath(); sg.ellipse(u, v, rad, rad * r.range(0.7, 1), r() * 3, 0, L.TAU); sg.fill();
        if (rad > 1.1) { sg.fillStyle = 'rgba(255,248,214,0.5)'; sg.beginPath(); sg.arc(u - rad * 0.5, v - rad * 0.6, rad * 0.4, 0, L.TAU); sg.fill(); }
      }
      for (let q = 0; q < 22 * t.dust + 5; q++) {   // grit
        const u = r.range(-1.2, 1.2) * t.w, v = r.range(2, 190), rad = r.range(0.5, 1.4);
        sg.fillStyle = `rgba(255,240,200,${r.range(0.2, 0.55).toFixed(2)})`; sg.beginPath(); sg.arc(u, v, rad, 0, L.TAU); sg.fill();
      }
      if (r.chance(0.45)) {   // lint
        const u = r.range(-0.7, 0.7) * t.w, v = r.range(20, 150), len = r.range(16, 40), ang = r.range(0, 3.14);
        sg.strokeStyle = `rgba(255,246,222,${r.range(0.3, 0.5).toFixed(2)})`; sg.lineWidth = r.range(0.8, 1.3); sg.lineCap = 'round';
        sg.beginPath(); sg.moveTo(u, v);
        sg.bezierCurveTo(u + Math.cos(ang) * len * 0.3 + r.range(-8, 8), v + Math.sin(ang) * len * 0.3 + r.range(-8, 8), u + Math.cos(ang) * len * 0.7 + r.range(-8, 8), v + Math.sin(ang) * len * 0.7 + r.range(-8, 8), u + Math.cos(ang) * len, v + Math.sin(ang) * len);
        sg.stroke();
      }
    });
  }
  sg.restore();

  // depth of field: razor-sharp heads on the eave, the roof behind them dissolving into soft gold.
  // (the widest blurs are done at half size: same look, a quarter of the work)
  const half = L.makeCanvas(LW / 2, RH / 2), hg = half.getContext('2d');
  hg.imageSmoothingQuality = 'high'; hg.drawImage(sharp, 0, 0, LW / 2, RH / 2);
  // quarter size, with the bottom rows smeared into a margin so the widest blur never pulls in transparency at the layer's edge
  const QW = Math.ceil(LW / 4), QH = Math.ceil(RH / 4), QM = 40;
  const quart = L.makeCanvas(QW, QH + QM), qg = quart.getContext('2d');
  qg.imageSmoothingQuality = 'high'; qg.drawImage(half, 0, 0, QW, QH); qg.drawImage(quart, 0, QH - 2, QW, 2, 0, QH, QW, QM);
  const roof = L.makeCanvas(LW, RH);
  const g = roof.getContext('2d');
  g.filter = 'blur(0.6px)'; g.drawImage(sharp, 0, 0); g.filter = 'none';
  const ocx = cx + PAD, ocy = cy + PAD - y0;
  for (const [bpx, d0, d1] of [[3, 100, 152], [8, 138, 208], [18, 192, 292], [38, 268, 392], [72, 356, 530]]) {
    const b = L.makeCanvas(LW, RH), bg = b.getContext('2d');
    if (bpx < 12) { bg.filter = `blur(${bpx}px)`; bg.drawImage(sharp, 0, 0); bg.filter = 'none'; }
    else if (bpx < 30) { bg.imageSmoothingQuality = 'high'; bg.drawImage(L.blurred(half, bpx / 2), 0, 0, LW, RH); }
    else { bg.imageSmoothingQuality = 'high'; bg.drawImage(L.blurred(quart, bpx / 4), 0, 0, QW, QH, 0, 0, QW * 4, QH * 4); }
    bg.globalCompositeOperation = 'destination-in';
    bg.fillStyle = L.radial(bg, ocx, ocy, R - d1, R - d0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    bg.fillRect(0, 0, LW, RH);
    g.drawImage(b, 0, 0);
  }
  // bokeh: out of focus, every glint on the glaze opens into a soft disc — the nearer the lens, the bigger
  {
    const rb = L.rng('s02-bokeh'), bk = L.makeCanvas(LW, RH), kg = bk.getContext('2d');
    kg.globalCompositeOperation = 'lighter';
    let nb = 0;
    for (let q = 0; q < 9000 && nb < 90; q++) {
      const i = rb.int(30, LW - 30), j = rb.int(0, RH - 1);
      const dd = R - Math.hypot(i - PAD + 0.5 - cx, j + y0 - PAD + 0.5 - cy);
      if (dd < 185) continue;
      const ga = gp[(j * LW + i) * 4 + 3] / 255;
      if (ga < 0.2 || rb() > ga * 0.55) continue;
      nb++;
      const rad = L.lerp(8, 46, sstep(185, 620, dd)) * rb.range(0.7, 1.25), al = rb.range(0.05, 0.17) * (0.6 + 0.4 * ga), sq = rb.range(0.86, 1);
      kg.save(); kg.translate(i, j); kg.rotate(rb.range(0, 3.14)); kg.scale(1, sq);
      kg.fillStyle = L.radial(kg, 0, 0, 0, rad, [[0, `rgba(255,236,170,${(al * 0.72).toFixed(3)})`], [0.74, `rgba(255,236,170,${(al * 0.8).toFixed(3)})`], [0.9, `rgba(255,244,200,${al.toFixed(3)})`], [1, 'rgba(255,244,200,0)']]);
      kg.beginPath(); kg.arc(0, 0, rad, 0, L.TAU); kg.fill(); kg.restore();
    }
    g.globalCompositeOperation = 'screen'; g.drawImage(L.blurred(bk, 1.2), 0, 0); g.globalCompositeOperation = 'source-over';
  }
  // glare: the highlights bloom a little, and spill a thin halo over the eave into the dark
  const gl = L.makeCanvas(LW, RH); gl.getContext('2d').putImageData(gim, 0, 0);
  const glare = L.makeCanvas(LW, RH);
  const gg = glare.getContext('2d');
  gg.filter = 'blur(6px)'; gg.drawImage(gl, 0, 0); gg.filter = 'none';
  const hgl = L.makeCanvas(LW / 2, RH / 2); hgl.getContext('2d').drawImage(gl, 0, 0, LW / 2, RH / 2);
  gg.globalAlpha = 0.8; gg.drawImage(L.blurred(hgl, 13), 0, 0, LW, RH); gg.globalAlpha = 1;
  return { roof, glare, y0 };
}

const softDot = (g, x, y, rad, col, al, ring = 0.5) => {
  g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al * (1 - ring * 0.4))], [0.62, L.rgba(col, al)], [1, L.rgba(col, 0)]]);
  g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
};

/** beyond the eave: night */
function buildBack(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = L.linear(g, 0, -PAD, 0, a.crestY + 240, [[0, '#030405'], [0.7, '#05070a'], [1, '#080a0d']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    const r = L.rng('s02-far');
    for (let i = 0; i < 9; i++) softDot(g, r.range(-80, W + 80), r.range(-40, 430), r.range(50, 130), i % 3 ? '#27466f' : '#55697f', r.range(0.03, 0.06), 0);
  });
}
/** dust hanging in the light. Not a star field: it only shows inside the shaft of the key light (upper left → eave),
 *  it drifts in loose clumps, most of it is out of focus, and the sizes differ wildly */
function buildDust(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const r = L.rng('s02-dust-c'), nz = L.makeNoise('s02-drift');
    const cols = ['#e9f1ff', '#fff3c4', '#ffe29a', '#c9dcf5', '#fff8e6'];
    const ax = -160, ay = -40, bx = a.cx - 120, by = a.crestY - 30, ux = bx - ax, uy = by - ay, ul = Math.hypot(ux, uy);
    const shaft = (x, y) => {
      const t = ((x - ax) * ux + (y - ay) * uy) / (ul * ul), dist = Math.abs((x - ax) * uy - (y - ay) * ux) / ul;
      const wdt = 150 + 190 * L.clamp(t);
      return Math.exp(-(dist * dist) / (wdt * wdt)) * (t > 1.15 ? Math.exp(-(t - 1.15) * 6) : 1);
    };
    const cloud = (x, y) => L.clamp(0.42 + 1.25 * nz.fbm(x / 330, y / 240, 3)) * (0.07 + 0.93 * shaft(x, y));
    let k = 0;
    for (let i = 0; i < 6000 && k < 250; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, a.crestY + 230);
      const dr = a.drAt(x, y);
      if (dr < 10 || r() > cloud(x, y)) continue;
      k++;
      const t = Math.pow(r(), 1.5);   // 0 = in focus (small, crisp, bright) … 1 = near the lens (big, soft, faint)
      const col = r.pick(cols);
      if (t < 0.16) {   // a crisp fleck: never a perfect dot
        g.globalAlpha = r.range(0.3, 0.9); g.fillStyle = col;
        const rad = L.lerp(0.6, 1.9, r() * r());
        g.beginPath(); g.ellipse(x, y, rad * r.range(1, 2.1), rad, r.range(0, 3.14), 0, L.TAU); g.fill(); g.globalAlpha = 1;
      } else softDot(g, x, y, L.lerp(1.8, 24, t * t * t), col, L.lerp(0.3, 0.03, Math.sqrt(t)) * r.range(0.6, 1.25), r.chance(0.2) ? 0.8 : 0.15);
    }
    // gold motes lifted off the tiles, thickest just above the lit part of the eave
    for (let i = 0; i < 110; i++) {
      const p = a.pt(r.gauss() * 0.17 - 0.07, 8 + 170 * Math.pow(r(), 2.4)), w = 0.35 + 0.65 * sstep(0.3, 0.02, Math.abs(p.x - (a.cx - 200)) / 2400);
      const t = Math.pow(r(), 1.7), col = r.pick(['#ffd86a', '#fff3c4', '#ffc94a']);
      if (t < 0.25) { g.globalAlpha = r.range(0.25, 0.9) * w; g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, L.lerp(0.5, 1.6, r()), 0, L.TAU); g.fill(); g.globalAlpha = 1; }
      else softDot(g, p.x, p.y, L.lerp(1.8, 11, t * t), col, 0.3 * w * (1.2 - t), 0.3);
    }
  });
}
/** a few motes right in front of the lens: big, soft, drifting faster than everything else */
function buildMotes(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const r = L.rng('s02-motes');
    for (let i = 0; i < 12; i++) {
      const x = r.range(-60, W + 60), y = r.range(40, H - 40), rad = r.range(18, 50);
      softDot(g, x, y, rad, a.drAt(x, y) > 0 ? '#c9d8ee' : '#fff0c0', r.range(0.03, 0.07), 1);
    }
  });
}

export default {
  name: '黄琉璃瓦檐口',
  tone: 'light',            // tagline colour if this shot carries text: 'light' on dark backgrounds, 'dark' on light ones
  init(env) {
    const t0 = performance.now();
    const roof = buildRoof(env);
    const t1 = performance.now();
    S = { roof: roof.roof, glare: roof.glare, y0: roof.y0, back: buildBack(env), dust: buildDust(env), motes: buildMotes(env) };
    console.warn('s02 init: roof ' + (t1 - t0).toFixed(0) + ' ms, rest ' + (performance.now() - t1).toFixed(0) + ' ms');
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // camera: the heads slide along the arc (rot) while we creep closer (zoom); dust nearer the lens moves more → parallax
    const rot = L.lerp(-0.010, 0.010, p), zoom = L.lerp(1.0, 1.025, p);
    L.blit(ctx, env, S.back, { rot: rot * 0.25, zoom: 1 + (zoom - 1) * 0.3 });
    L.blit(ctx, env, S.dust, { rot: rot * 0.55, zoom: 1 + (zoom - 1) * 0.6, dy: -8 * p });
    const dy = 2 * p;   // zoom pivots on the crest and lifts the far ends of the arc ~5 px: settle the layer 2 px to split the error
    L.cam(ctx, env, { rot, zoom, dy }, () => {
      ctx.drawImage(S.roof, -PAD, S.y0 - PAD);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.42;
      ctx.drawImage(S.glare, -PAD, S.y0 - PAD);
    });
    // the light creeps along the eave: a soft pool that only lifts the glaze, never fogs the night above
    const gl = a.pt(L.lerp(-0.2, -0.04, p), -70);
    ctx.save(); a.clipBelow(ctx, 6);
    L.glow(ctx, gl.x, gl.y, 330, '#fff0b0', 0.3, 'soft-light');
    ctx.restore();
    L.blit(ctx, env, S.motes, { rot: rot * 1.9, zoom: 1 + (zoom - 1) * 1.6, dy: -14 * p });
    L.vignette(ctx, { strength: 0.3 });
  },
};
