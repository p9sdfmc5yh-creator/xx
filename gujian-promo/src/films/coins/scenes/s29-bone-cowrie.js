// s29 — 出土钱缘. Extreme macro of a bronze cash coin just lifted out of the loess, lying where it was found. The arc is the
// coin's outer edge.
// Below the arc: the coin. Just inside the edge runs the raised outer rim (外郭) — a rounded shoulder that catches the light
// as a bright line, a rubbed top, then a step down that throws its shadow onto the sunken field (肉). The metal is dark
// brown bronze under a matte crust of malachite and grey-green earthy rust; loess (the very earth of the wall) is packed
// into the corner under the rim, the pin-holes and the hollows, banks up over the two lower corners and lies on the face in
// clods and crumbs, each with its shadow. Two stretches of the rim and the top of a run of spilt metal (流铜) are rubbed
// through to dark gold; a few scratches cross the face. No inscription, and the square hole is far out of frame.
// Lit from the upper left; the right third falls into shadow.
// Above the arc: the ochre loess wall of the excavation square — coarse grains, gently dipping beds (土层) that break off in
// small ledges, a soft lens of burnt-red earth in the odd bed, a few pale chips — with a dark crevice shadow hugging the
// coin. Directly over the crest the earth is kept calm for the tagline.
//
// Both materials are shaded per pixel in init() from height fields (px): surface normal → raking key light from the upper
// left, a short ray-march toward the light for cast shadows, then an illumination → colour ramp per material (so shadows turn
// warm brown instead of grey). No lettering anywhere.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 72;
const IMAX = 1.6, NL = 1024;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash2 = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ── allocation-free worley (squared distances in cD1/cD2, two randoms of the nearest point in cId/cId2).
//    per > 0 makes the pattern repeat every `per` cells (for pre-baked tiles) ──
let cD1 = 0, cD2 = 0, cId = 0, cId2 = 0;
function cell(x, y, per = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, hh = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const px = xi + ox, py = yi + oy;
    let h = per ? (Math.imul(((px % per) + per) % per, 374761393) + Math.imul(((py % per) + per) % per, 668265263)) | 0 : (Math.imul(px, 374761393) + Math.imul(py, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = px + (h & 1023) / 1023 - x, dy = py + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; hh = h; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = ((hh >>> 20) & 63) / 63; cId2 = ((hh >>> 26) & 63) / 63;
}

// illumination (0..IMAX) → colour tables
function lut(stops) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / IMAX, c])); const out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
const BRONZE_STOPS = [[0, '#0a0604'], [0.2, '#1e120b'], [0.45, '#352014'], [0.72, '#492e1c'], [1, '#5a3b24'], [1.25, '#77532f'], [1.6, '#a8804a']];      // the metal under its dull brown skin
const MAL_STOPS = [[0, '#050d08'], [0.2, '#0d2116'], [0.45, '#173726'], [0.72, '#214c35'], [1, '#2b5e42'], [1.25, '#3d7756'], [1.6, '#6ba281']];         // malachite crust, matte
const GREY_STOPS = [[0, '#0a0d09'], [0.2, '#1d241a'], [0.45, '#353f2f'], [0.72, '#4d5a44'], [1, '#647359'], [1.25, '#829075'], [1.6, '#b2bc9f']];        // grey-green earthy rust
const GOLD_STOPS = [[0, '#120b05'], [0.2, '#33210f'], [0.45, '#5a3f1d'], [0.72, '#7c5c2c'], [1, '#97753b'], [1.25, '#bd9c5a'], [1.6, '#f1dfb0']];        // rubbed bare metal: dark brass
const PAT_STOPS = [[0, '#080a06'], [0.2, '#191c12'], [0.45, '#2d3320'], [0.72, '#40482d'], [1, '#525b39'], [1.25, '#6e7a4e'], [1.6, '#9da778']];         // the thin olive skin between brown and green
const CHIP_STOPS = [[0, '#2a170a'], [0.16, '#553519'], [0.34, '#8a6238'], [0.5, '#b39468'], [0.66, '#cfbb97'], [0.82, '#e3d8bf'], [1, '#efe9da'], [1.2, '#f8f4e8'], [1.6, '#fffdf7']];      // pale chips in the wall
const SOIL_STOPS = [[0, '#170b04'], [0.2, '#3b220e'], [0.45, '#6f4a26'], [0.72, '#a6722d'], [1, '#c48d3a'], [1.25, '#e0aa4a'], [1.6, '#f5cf7e']];
const RED_STOPS = [[0, '#1c0804'], [0.2, '#48160a'], [0.45, '#7c2a13'], [0.72, '#a23a1e'], [1, '#b4431f'], [1.25, '#c4552a'], [1.6, '#d87646']];

// key light: from the upper left, ~40° above the surface
const LX = -0.52, LY = -0.56, LZ = 0.645;          // unit vector toward the light
const SLX = -0.68, SLY = -0.733, TANE = 0.844;      // its screen direction, and the height gained per px along it
const HX = -0.287, HY = -0.309, HZ = 0.907;         // half vector (viewer straight on)
const STEPS = [2, 4, 7, 11, 16, 23, 32, 44];
const SDX = STEPS.map((s) => Math.round(SLX * s)), SDY = STEPS.map((s) => Math.round(SLY * s));
const SREQ = STEPS.map((s) => s * TANE), SINV = STEPS.map((s) => 1 / (0.7 + s * 0.12));
let lRel = 0, lSh = 0, lSpec = 0;
/** light a height-field pixel: lRel = diffuse relative to a flat surface, lSh = cast shadow 0..1, lSpec = sheen */
function light(Hh, RW, RH, i, j, far) {
  const k = j * RW + i, h0 = Hh[k];
  const gx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5;
  const gy = (Hh[k + (j < RH - 1 ? RW : 0)] - Hh[k - (j > 0 ? RW : 0)]) * 0.5;
  const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
  const nx = -gx * inv, ny = -gy * inv;
  const d = nx * LX + ny * LY + inv * LZ;
  lRel = d > 0 ? d / LZ : 0;
  const s = nx * HX + ny * HY + inv * HZ;
  lSpec = s > 0.93 ? Math.pow(s, 48) : 0;
  let sh = 0;
  for (let n = 0; n < far; n++) {
    const xi = i + SDX[n], yj = j + SDY[n];
    if (xi < 0 || yj < 0) break;
    const o = (Hh[yj * RW + xi] - h0 - SREQ[n]) * SINV[n];
    if (o > sh) sh = o;
  }
  lSh = sh > 1 ? 1 : sh;
}

function coarse(RW, RH, CS) {
  const cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const mk = () => new Float32Array(cw * ch);
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };
  return { cw, ch, mk, bil };
}

// the coin (U = px along the arc from the crest, V = px in from the edge)
const RIMW = 76;       // mean width of the outer rim (外郭); it wanders ±12 along the edge
const HR = 22;         // how far the rim stands above the field (px of relief)
// two stretches of the rim where handling has rubbed the crust through to dark metal: [U centre, half length, strength]
const WEAR = [[170, 150, 1], [-585, 70, 0.75]];
// 流铜: a run of spilt metal frozen on the field, and a drop beside it: [U, V, half length, half width, heading, height]
const BLEBS = [[-262, 236, 46, 15, 1.25, 5.2], [-232, 306, 12, 9, 0.4, 3.4]].map((b) => [...b, Math.cos(b[4]), Math.sin(b[4])]);
// clods of loess that have dropped onto the face: [U, V, radius]
const CLODS = [[-690, 250, 36], [-628, 292, 15], [-742, 304, 10], [-655, 203, 7], [395, 345, 30], [448, 310, 12], [352, 392, 9], [640, 119, 19], [-1010, 46, 15],
  [-140, 150, 11], [-112, 172, 6], [60, 424, 22], [960, 250, 24], [-300, 112, 8], [820, 400, 16], [-455, 420, 13], [130, 262, 5]];
// scratches the earth has dragged across the face: [U, V, heading (0 = along the edge, π/2 = straight in), length, width, strength, bow]
const SCRATCHES = [[-640, 120, 0.42, 250, 1.25, 1, 0.0003], [-622, 144, 0.45, 180, 1.0, 0.7, 0.0002], [-590, 106, 0.4, 120, 0.95, 0.55, 0],
  [205, 22, 1.05, 170, 1.2, 0.9, -0.0004], [238, 30, 1.1, 110, 0.95, 0.6, 0], [-190, 332, -0.12, 330, 1.2, 0.85, 0.0002],
  [520, 180, 2.5, 150, 1.0, 0.6, 0], [-960, 150, 0.9, 140, 1.1, 0.7, 0], [760, 60, 0.7, 120, 1.0, 0.6, 0.0005], [-380, 402, 0.3, 160, 1.0, 0.6, 0], [40, 112, 2.2, 90, 0.95, 0.5, 0]];

/** the coin: everything below the arc */
function buildCoin(env, sand) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s29a'), nB = L.makeNoise('s29b');
  const BRZ = lut(BRONZE_STOPS), MAL = lut(MAL_STOPS), GRY = lut(GREY_STOPS), GLD = lut(GOLD_STOPS), PAT = lut(PAT_STOPS), SOIL = lut(SOIL_STOPS);
  const toXY = (U, V) => { const rr = R - V, th = U / rr; return [cx + rr * Math.sin(th), cy - rr * Math.cos(th)]; };

  // slow fields on a coarse polar grid
  const CS = 4, cg = coarse(RW, RH, CS);
  const cLump = cg.mk(), cCor = cg.mk(), cGrey = cg.mk(), cSoil = cg.mk(), cTint = cg.mk(), cRw = cg.mk(), cPit = cg.mk(), cFlow = cg.mk(), cDust = cg.mk(), cPatch = cg.mk();
  for (let j = 0; j < cg.ch; j++) for (let i = 0; i < cg.cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.sqrt(ddx * ddx + ddy * ddy);
    const U = Math.atan2(ddx, ddy) * rr, V = R - rr, k = j * cg.cw + i;
    cLump[k] = nA.fbm(U / 170, V / 170, 3, 2, 0.5);                       // the cast face is never quite flat
    cCor[k] = nB.fbm(U / 230 + 31, V / 180 + 7, 3, 2, 0.5);              // where the green crust has grown
    cGrey[k] = nA.fbm(U / 380 + 9, V / 260 - 4, 3);                       // malachite ↔ grey-green earthy rust
    cSoil[k] = nB.fbm(U / 190 - 17, V / 150 + 41, 4, 2, 0.55);            // where loess still clings
    cTint[k] = nA.fbm(U / 520 + 77, V / 400 - 23, 3);
    cRw[k] = RIMW + 9 * nA.n2(U / 360, 1.7) + 3.5 * nB.n2(U / 80, 8.1);
    cPit[k] = nB.fbm(U / 300 + 3, V / 300 - 60, 2);
    cFlow[k] = nA.fbm(U / 420 - 40, V / 300 + 15, 2);
    cDust[k] = nA.fbm(U / 640 + 21, V / 80 - 5, 3);
    cPatch[k] = nA.fbm(U / 420, V / 300, 2);
  }

  // scratches: fine V grooves, rasterised into a depth map (each one presses harder in the middle and fades out at both ends)
  const Sc = new Float32Array(N);
  const rs = L.rng('s29scratch'), nz = L.makeNoise('s29scr');
  const list = SCRATCHES.slice();
  for (let n = 0; n < 16; n++) list.push([rs.range(-1100, 1100), rs.range(20, 470), rs.range(0, Math.PI), rs.range(28, 80), rs.range(0.85, 1.0), rs.range(0.3, 0.5), 0]);
  list.forEach(([U0, V0, ang, len, wid, amp, bow], n) => {
    const du = Math.cos(ang), dv = Math.sin(ang);
    for (let s = 0; s <= len; s += 0.5) {
      const t = s / len, off = bow * s * s + 1.3 * nz.n2(s / 70, n * 3.7);
      const p = toXY(U0 + du * s - dv * off, V0 + dv * s + du * off);
      const tp = Math.sin(Math.PI * (0.03 + 0.94 * t)), am = amp * Math.pow(tp, 0.6) * (0.72 + 0.28 * nz.n2(s / 23, n * 9.1 + 4));
      const w = wid * (0.6 + 0.4 * tp), iw = 1 / (w * w);
      const px = p[0] - X0, py = p[1] - Y0, i0 = Math.round(px), j0 = Math.round(py);
      for (let jj = j0 - 3; jj <= j0 + 3; jj++) for (let ii = i0 - 3; ii <= i0 + 3; ii++) {
        if (ii < 0 || jj < 0 || ii >= RW || jj >= RH) continue;
        const dx = ii - px, dy = jj - py, e = am * Math.exp(-(dx * dx + dy * dy) * iw), k = jj * RW + ii;
        if (e > Sc[k]) Sc[k] = e;
      }
    }
  });

  // clods: broken lumps of earth — a blunt polygon in plan, steep crumbling sides, a lumpy top leaning its own way
  const ClH = new Float32Array(N), ClM = new Float32Array(N);
  const rcl = L.rng('s29clod');
  CLODS.forEach(([cu, cv, cr], n) => {
    const [px, py] = toXY(cu, cv), e0 = Math.ceil(cr * 1.2) + 3;
    const ns = rcl.int(5, 7), rot0 = rcl.range(0, L.TAU), pl = [];
    for (let q = 0; q < ns; q++) { const an = rot0 + (q / ns) * L.TAU + rcl.range(-0.25, 0.25); pl.push([Math.cos(an), Math.sin(an) * rcl.range(0.95, 1.35), cr * rcl.range(0.7, 1)]); }
    const tall = cr * (0.5 + 0.2 * hash2(n, 29)), rise = 1 / (cr * 0.3), tx = rcl.range(-0.12, 0.12), ty = rcl.range(-0.12, 0.12);
    const er0 = Math.min(1.2, cr * 0.12), er1 = Math.min(1.6, cr * 0.14);
    for (let yy = Math.floor(py - e0); yy <= py + e0; yy++) for (let xx = Math.floor(px - e0); xx <= px + e0; xx++) {
      const i = xx - X0, j = yy - Y0; if (i < 1 || j < 1 || i >= RW - 1 || j >= RH - 1) continue;
      const qx = xx - px, qy = yy - py;
      let e = 1e9;
      for (let q = 0; q < ns; q++) { const pq = pl[q], dd = pq[2] - (qx * pq[0] + qy * pq[1]); if (dd < e) e = dd; }
      e -= er0 + er1 * nB.n2(xx / 6 + n * 3, yy / 6) + cr * 0.08 * nA.n2(xx / (cr * 0.6) + n * 9, yy / (cr * 0.6));
      if (e <= 0) continue;
      const k = j * RW + i, body = 1 - Math.exp(-e * rise);
      const hgt = tall * body * (1 + 2 * (tx * qx + ty * qy) / cr) + cr * 0.12 * nA.n2(xx / (cr * 0.45) + n * 5, yy / (cr * 0.45)) * body + 0.8 * nB.n2(xx / 5.5 + 70, yy / 5.5) * Math.min(1, e / 3);
      const m = Math.min(1, e / 1.5);
      if (hgt > ClH[k]) ClH[k] = hgt;
      if (m > ClM[k]) ClM[k] = m;
    }
  });

  const Hh = new Float32Array(N).fill(-120), Sm = new Float32Array(N), Du = new Float32Array(N), Cv = new Float32Array(N);
  const Gw = new Float32Array(N), Mw = new Float32Array(N), Kt = new Float32Array(N), Ft = new Float32Array(N), Cr = new Float32Array(N), Va = new Float32Array(N), Ws = new Float32Array(N), Rm = new Float32Array(N);
  const In = new Uint8Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 2) continue;
      const k = j * RW + i; In[k] = 1;
      const U = Math.atan2(ddx, ddy) * rr, V = R - rr;
      Va[k] = V;
      const hs = hash2(i, j) - 0.5;
      const lump = cg.bil(cLump, i, j);
      const mid = nA.n2(U / 34 + 3, V / 34 + 1.5), fine = nB.n2(U / 9 + 50, V / 9 - 7), fine2 = nA.n2(U / 4.2, V / 4.2 + 9);
      // 1) 外郭: a rounded shoulder up from the edge, a slightly crowned top, then the step down to the field (the inner
      //    arris is a cast edge, so it wanders a little)
      const rw = cg.bil(cRw, i, j);
      let rimIn = 0, foot = 0;
      if (V < rw + 120) {
        const wob = 2.4 * nB.n2(U / 31 + 11, 3.3) + 1.0 * nA.n2(U / 8.5, 6.6);
        const st = (V - (rw - 5 + wob)) / 10;
        rimIn = st <= 0 ? 1 : st >= 1 ? 0 : 1 - st * st * (3 - 2 * st);
        if (rimIn < 1) { foot = (1 - rimIn) * Math.exp(-(V - rw) / 26); if (foot > 1) foot = 1; }      // the corner at the rim's foot
      }
      const e0 = V < 15 ? 1 - V / 15 : 0, rv = (V - rw * 0.5) / (rw * 0.5);
      const hRim = HR * rimIn - 1.3 * rimIn * rv * rv - 10.5 * e0 * e0;
      // 2) corrosion: a matte green crust over the brown metal — thinner on the rim top, thickest in the corner under it
      const cz = cg.bil(cCor, i, j) + 0.12 * mid + 0.05 * fine + 0.015 * fine2 + 0.13 - 0.2 * rimIn + 0.2 * foot;
      let wG = cz <= -0.05 ? 0 : cz >= 0.07 ? 1 : sstep(-0.05, 0.07, cz);
      // 3) where the crust is rubbed through to metal: two stretches of the rim (its inner arris and the crown of the shoulder)…
      let wM = 0;
      if (rimIn > 0.05) {
        let sp = 0;
        for (let n = 0; n < WEAR.length; n++) { const w = WEAR[n], eu = (U - w[0]) / w[1]; if (eu > -2.2 && eu < 2.2) { const e = w[2] * Math.exp(-eu * eu); if (e > sp) sp = e; } }
        if (sp > 0.05) {
          const va = (V - (rw - 11)) / 6, vb = (V - 7) / 4;
          const band = Math.exp(-va * va) + 0.5 * Math.exp(-vb * vb);
          wM = sstep(0.4, 0.6, sp * band * (0.9 + 0.6 * nA.n2(U / 34 + 9, V / 7 + 4)) + 0.08 * fine) * rimIn;
        }
      }
      // …and the top of the run of spilt metal on the field
      let hBleb = 0;
      for (let n = 0; n < BLEBS.length; n++) {
        const bb = BLEBS[n], bu = U - bb[0], bv = V - bb[1];
        if (bu < -70 || bu > 70 || bv < -70 || bv > 70) continue;
        const bl = bb[2], bw = bb[3], bh = bb[5], bc = bb[6], bs = bb[7];
        const al = bu * bc + bv * bs, ac = bv * bc - bu * bs;
        const wd = bw * (0.62 + 0.38 * sstep(-bl, bl * 0.6, al)) * (1 + 0.14 * nA.n2(al / 21 + 7, 2.2 + bl));
        const q = (al / bl) * (al / bl) + (ac / wd) * (ac / wd);
        if (q < 1) {
          hBleb = bh * (1 - q * q);
          const m = sstep(0.66, 0.92, 1 - q + 0.22 * nB.n2(U / 11, V / 11 + 3)); if (m > wM) wM = m;
          wG *= 1 - 0.6 * sstep(0.3, 0.7, 1 - q);
        }
      }
      const sc = Sc[k];
      wG *= (1 - wM) * (1 - 0.75 * sc);
      // the cast skin
      let h = hRim + hBleb + (2.6 * lump + 1.0 * mid) * (1 - 0.45 * rimIn) + (0.5 * fine + 0.26 * fine2) * (1 - 0.5 * wM) + 0.1 * hs;
      // the crust is built of tiny rounded knobs, each its own shade
      let kt = 0;
      if (wG > 0.02) {
        cell(U / 7.5 + 0.3, V / 7.5 + 0.7);
        const kn = cD1 < 0.4 ? Math.sqrt(1 - cD1 / 0.4) : 0;
        h += wG * (1.5 + 1.0 * kn * (0.5 + cId2));
        kt = (cId - 0.5) * kn;
      }
      // 4) 流铜痕: a few low wandering wrinkles where the metal froze as it ran
      const fl = cg.bil(cFlow, i, j);
      if (fl > 0.12 && rimIn < 0.9) {
        const aa = (V + 0.34 * U + 34 * nA.n2(U / 210 + 5, V / 210 - 3)) / 58;
        const rdg = 1 - Math.abs(nB.n2(U / 380 + 40, aa));
        if (rdg > 0.84) { const f = (rdg - 0.84) * 6.25; h += sstep(0.12, 0.4, fl) * (1 - rimIn) * 1.5 * f * f * (3 - 2 * f); }
      }
      let soil = 0, cav = 0;
      // 5) 砂眼: the odd pin-hole left by the sand mould, packed with loess (sparse — never a field of holes)
      const dens = 0.03 + 0.13 * sstep(-0.1, 0.5, cg.bil(cPit, i, j));
      cell(U / 23 + 5.5, V / 23 + 9.1);
      if (cId < dens) {
        const rp = 0.06 + 0.13 * cId2 * cId2, qq = cD1 / (rp * rp) * (1 + 0.4 * fine);
        if (qq < 1) { const f = (1 - qq) * (1 - qq); h -= 2.6 * f * (0.5 + cId2); soil = f * 0.75; cav = f; }
      }
      if (sc > 0) h -= 2.0 * sc;
      // 6) loess: banked over the two lower corners, packed in stretches into the corner under the rim and into the hollows
      //    of the face; crumbs scattered around all of it
      const dL2 = (x + 90) * (x + 90) + (y - 1170) * (y - 1170), dR2 = (x - 2010) * (x - 2010) + (y - 1150) * (y - 1150);
      const cL = dL2 < 490000 ? 1 - sstep(190, 700, Math.sqrt(dL2)) : 0, cR = dR2 < 409600 ? 1 - sstep(180, 640, Math.sqrt(dR2)) : 0;
      const bank = cL > cR ? cL : cR, cf = cg.bil(cSoil, i, j);
      let cb = 0.95 * bank + 0.34 * cf - 0.22 * rimIn * (1 - bank);
      if (foot > 0.01) cb += foot * (0.28 + 0.6 * sstep(-0.05, 0.3, cf + 0.25 * nB.n2(U / 45 + 3, 2.2)));
      else cb -= 0.12 * (1 - sstep(220, 460, U < 0 ? -U : U));
      if (lump < 0) cb -= 0.3 * lump * (1 - rimIn);
      let crv = 0, crm = 0;
      if (cb > 0.08) {
        crv = cb + 0.04 * nB.n2(U / 14 + 4, V / 14) + 0.01 * hs;
        crm = sstep(0.6, 0.67, crv);
        if (crm > 0) {
          h += crm * (4 + 10 * sstep(0.62, 1.1, crv) + 4 * nA.n2(U / 46 - 20, V / 46) + 1.2 * nB.n2(U / 11 + 70, V / 11) + 0.75 * hs);
          if (crm > soil) soil = crm;
        } else if (crv > 0.05) {
          const pc = 0.012 + 0.15 * sstep(0.36, 0.6, crv) + 0.05 * sstep(0.25, 0.5, cf);
          cell(U / 21 + 1.3, V / 21 + 8.8);
          if (cId < pc) {
            const rp = 0.08 + 0.26 * cId2 * cId2, qq = cD1 / (rp * rp) * (1 + 0.5 * nB.n2(U / 4 + 9, V / 4));
            if (qq < 1) { const dome = Math.sqrt(1 - qq); h += dome * rp * 21 * 0.6 + hs * 0.8; const sm = sstep(1, 0.72, qq); if (sm > soil) soil = sm; }
          }
        }
      }
      const cm = ClM[k];
      if (cm > 0) { h += ClH[k]; if (cm > soil) soil = cm; }
      if (soil > 0.3) { const ti = ((j & 255) << 8) | (i & 255); h += soil * (0.9 * sand.hA[ti] + 0.6 * sand.hB[ti]); }      // the same grain as the wall
      const dv2 = cg.bil(cDust, i, j);
      Du[k] = Math.min(1, sstep(0.3, 0.6, crv) * 0.6 * (1 - crm) + sstep(0.0, 0.45, dv2) * (0.2 + 0.3 * wG) * sstep(0.2, -0.3, mid) + 0.18 * foot);
      Cr[k] = e0 > 0 || V < 22 ? Math.exp(-((V - 6.5) * (V - 6.5)) / 25) * (0.62 + 0.38 * nA.n2(U / 120 + 2, 0.7)) : 0;
      Hh[k] = h; Sm[k] = soil; Cv[k] = cav; Gw[k] = wG; Mw[k] = wM; Kt[k] = kt; Ft[k] = foot; Rm[k] = rimIn;
      Ws[k] = sstep(-0.5, 0.0, cz + 0.12 * lump) * 0.9 * (1 - wM);
    }
  }

  // shade
  const img = new ImageData(RW, RH), d = img.data;
  const idx = (v) => { const n = (v / IMAX * (NL - 1)) | 0; return (n < 0 ? 0 : n > NL - 1 ? NL - 1 : n) * 3; };
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j;
    const xt = 1235 + 0.6 * (y - 560) + 30 * Math.sin((y - 560) / 170 + 0.6);      // edge of the big shadow on this row
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i; if (!In[k]) continue;
      const x = X0 + i, V = Va[k], ux = x - cx;
      light(Hh, RW, RH, i, j, 8);
      const soil = Sm[k], cav = Cv[k], wG = Gw[k], wM = Mw[k], foot = Ft[k], crown = Cr[k] * (1 - soil), sc = Sc[k];
      // the big shadow that takes the right third
      let gs = sstep(-85, 95, x - xt + 44 * cg.bil(cPatch, i, j));
      if (V < 60) gs *= 1 - 0.3 * Math.exp(-V / 12);
      const macro = 1 + 0.1 * Math.exp(-((ux + 380) * (ux + 380)) / 270000 - ((V - 150) * (V - 150)) / 67600) - 0.1 * sstep(260, 660, V) - 0.07 * sstep(-520, -1150, ux);
      const rel = lRel + (1 - lRel) * 0.55 * gs;
      let il = (0.3 + 0.7 * rel * (1 - 0.9 * lSh)) * macro * (1 - 0.4 * gs) * (1 - 0.1 * gs * sstep(1300, 1950, x)) * (1 - 0.32 * cav);
      // the field lies a step lower: the rim keeps some of the sky off it, most in the corner just under the step
      const rimIn = Rm[k];
      il *= (1 + 0.07 * rimIn) * (1 - (1 - rimIn) * (1 - soil) * (0.3 * foot + (V < 420 ? 0.16 * Math.exp(-(V > RIMW ? V - RIMW : 0) / 80) : 0)));
      il *= 1 + 0.3 * crown;                                                   // the shoulder is rubbed a shade paler: the light draws a line along the edge
      il += lSpec * (0.1 * (1 - wG) + 0.7 * wM) * (1 - 0.7 * gs) * (1 - soil);     // the patina is matte; only bare metal has a sheen
      const li = idx(il * 0.86);
      // the bronze itself: dark brown, stained red-brown where the crust has just let go of it
      let r = BRZ[li], g = BRZ[li + 1], b = BRZ[li + 2];
      const ws = Ws[k];
      if (ws > 0.004) { r += (PAT[li] - r) * ws; g += (PAT[li + 1] - g) * ws; b += (PAT[li + 2] - b) * ws; }
      const mg = wG * (1 - wG) * 4;
      if (mg > 0.01) { r *= 1 + 0.14 * mg; g *= 1 - 0.08 * mg; b *= 1 - 0.14 * mg; }
      // the crust: malachite ↔ grey-green earthy rust, in slow blotches, each knob a shade of its own
      if (wG > 0.004) {
        const kt = Kt[k], gi = idx(il * 0.84 * (1 + 0.24 * kt));
        const wy = sstep(0.02, 0.4, cg.bil(cGrey, i, j) + 0.25 * kt);
        let gr = MAL[gi] + (GRY[gi] - MAL[gi]) * wy, gg = MAL[gi + 1] + (GRY[gi + 1] - MAL[gi + 1]) * wy, gb = MAL[gi + 2] + (GRY[gi + 2] - MAL[gi + 2]) * wy;
        const tn = cg.bil(cTint, i, j);
        if (tn > 0) { gr *= 1 + 0.3 * tn; gb *= 1 - 0.24 * tn; } else { gr *= 1 + 0.16 * tn; gg *= 1 + 0.1 * tn; gb *= 1 + 0.06 * tn; }
        r += (gr - r) * wG; g += (gg - g) * wG; b += (gb - b) * wG;
      }
      if (crown > 0.01) { const hk = 0.42 * crown, ci = idx(il * 1.2); r += (GLD[ci] - r) * hk; g += (GLD[ci + 1] - g) * hk; b += (GLD[ci + 2] - b) * hk; }
      // bare metal: dark gold where it is rubbed, a thread of it in the bottom of each scratch
      const wm = wM + 0.34 * sc * (1 - wM);
      if (wm > 0.004) { const mi = idx(il); r += (GLD[mi] - r) * wm; g += (GLD[mi + 1] - g) * wm; b += (GLD[mi + 2] - b) * wm; }
      // loess: dust film, then solid earth
      const du = Du[k] * 0.5;
      if (du > 0 || soil > 0) {
        const si = idx(il * 0.9);
        if (du > 0) { r += (SOIL[si] * 1.08 - r) * du; g += (SOIL[si + 1] * 1.1 - g) * du; b += (SOIL[si + 2] * 1.15 - b) * du; }
        if (soil > 0) { r += (SOIL[si] - r) * soil; g += (SOIL[si + 1] - g) * soil; b += (SOIL[si + 2] - b) * soil; }
      }
      const o = k * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);

  const layer = L.makeLayer(PAD, (g) => {
    g.save(); a.clipBelow(g, 0);
    g.drawImage(cnv, X0, Y0);
    g.restore();
  });
  // shallow depth of field: the face comes toward the lens at the bottom of frame and goes a touch soft (only that strip is blurred)
  const yb = Math.floor(a.crestY + 336), hb = H + PAD - yb;
  const near = L.makeCanvas(layer.width, hb), ng = near.getContext('2d');
  ng.filter = 'blur(3.2px)'; ng.drawImage(layer, 0, -(yb + PAD)); ng.filter = 'none';
  ng.globalCompositeOperation = 'destination-in';
  ng.fillStyle = L.radial(ng, a.cx + PAD, a.cy - yb, R - 600, R - 350, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  ng.fillRect(0, 0, near.width, hb);
  const lg = layer.getContext('2d');
  lg.save(); a.clipBelow(lg, 0); lg.drawImage(near, -PAD, yb); lg.restore();
  return layer;
}

/** a 256 px repeating tile of sand: small grains (domes) at two sizes + their tone */
function sandTile() {
  const n = 256, hA = new Float32Array(n * n), hB = new Float32Array(n * n), tn = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    cell(i / 8 + 0.3, j / 8 + 0.7, 32);
    if (cId < 0.5) { const rp = 0.2 + 0.24 * cId2, q = cD1 / (rp * rp); if (q < 1) { hA[k] = Math.sqrt(1 - q); tn[k] = (cId2 - 0.5) * 0.3 * (1 - q); } }
    cell(i / 4 + 0.6, j / 4 + 0.1, 64);
    if (cId < 0.75) { const rp = 0.28 + 0.2 * cId2, q = cD1 / (rp * rp); if (q < 1) hB[k] = 0.55 * Math.sqrt(1 - q); }
  }
  return { hA, hB, tn };
}

/** the loess wall behind: everything above the arc (and a margin below it, hidden by the coin) */
function buildSoil(env, sand) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = -PAD;
  const RW = W + PAD * 2, RH = Math.min(H + PAD, Math.ceil(a.yAt(-PAD)) + 44) - Y0, N = RW * RH;
  const nA = L.makeNoise('s29c'), nB = L.makeNoise('s29d');
  const SOIL = lut(SOIL_STOPS), RED = lut(RED_STOPS), CHIP = lut(CHIP_STOPS);
  const RIN2 = (R - 44) * (R - 44);

  const CS = 4, cg = coarse(RW, RH, CS);
  const cLump = cg.mk(), cWx = cg.mk(), cWy = cg.mk(), cRed = cg.mk(), cPale = cg.mk(), cMac = cg.mk();
  for (let j = 0; j < cg.ch; j++) for (let i = 0; i < cg.cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cg.cw + i;
    cLump[k] = 30 * nA.fbm(x / 240, y / 240, 4, 2, 0.55) + 4.5 * nA.n2(x / 64 + 300, y / 64);
    cWx[k] = nB.n2(x / 170 + 5, y / 170); cWy[k] = nB.n2(x / 170 - 31, y / 170 + 19);
    cRed[k] = nA.fbm(x / 170 + 40, y / 130 - 13, 3, 2, 0.5);
    cPale[k] = nB.fbm(x / 330 - 7, y / 260 + 3, 3);
    cMac[k] = nB.fbm(x / 520 + 21, y / 520 + 77, 3);
  }

  const Hh = new Float32Array(N), Tn = new Float32Array(N), Ck = new Float32Array(N), Chip = new Float32Array(N), Calm = new Float32Array(N);
  const Bed = new Float32Array(N), Rd = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx;
      if (ddx * ddx + ddy * ddy < RIN2) continue;
      const k = j * RW + i;
      // the patch over the crest stays calm for the tagline: fine grain only (its outline wanders a little)
      const adx = ddx < 0 ? -ddx : ddx;
      let calm = 0, bedK = 1;
      if (adx < 900) {      // a dome sitting on the crest; its rim follows the clods, and the bed ledges thin out into it
        const ex = ddx / 620, ey = (y - 570) / 410;
        const e = Math.sqrt(ex * ex + ey * ey) + 0.13 * cg.bil(cMac, i, j) + 0.004 * cg.bil(cLump, i, j) + 0.03 * nB.n2(x / 27 + 40, y / 27);
        calm = 1 - sstep(0.93, 1.25, e);
        bedK = sstep(0.78, 1.1, e + 0.08 * cg.bil(cWx, i, j));
      }
      const kc = 1 - calm; Calm[k] = calm;
      const hs = hash2(i, j) - 0.5, ti = ((j & 255) << 8) | (i & 255);
      let h = cg.bil(cLump, i, j) * (1 - 0.85 * calm) + 1.5 * nB.n2(x / 19, y / 19) * (1 - 0.75 * calm);
      h += (1.25 - 0.55 * calm) * sand.hA[ti] + sand.hB[ti] + 0.55 * hs;
      let tn = sand.tn[ti];
      // coarse grit and small stones
      cell((x + 14 * cg.bil(cWx, i, j)) / 34, (y + 14 * cg.bil(cWy, i, j)) / 34);
      if (cId < 0.44) {
        const rp = (0.1 + 0.3 * cId2 * cId2) * (1 - 0.72 * calm), q0 = cD1 / (rp * rp);
        if (q0 < 1.6) {
          const q = q0 * (1 + 0.45 * nB.n2(x / 6 + 3, y / 6));
          if (q < 1) { const dome = Math.sqrt(1 - q); h += dome * rp * 34 * 0.46; tn += (cId / 0.44 - 0.45) * (1 - q * q) * (0.5 + 1.4 * rp); }
        }
      }
      // 土层: the wall is cut through gently dipping beds; each stands a little proud and breaks off in a small ledge at its base
      if (bedK > 0.02) {
        const sp = (y + 0.05 * x + 17 * cg.bil(cWy, i, j) + 60 * cg.bil(cMac, i, j) + 2.5 * nB.n2(x / 31 + 9, y / 31)) / 128 + 8;
        const sb = Math.floor(sp), sf = sp - sb;
        h += (7 + 6 * hash2(sb, 91)) * sstep(0, 0.7, sf) * (1 - sstep(0.88, 0.99, sf)) * bedK;
        Ck[k] = 0.45 * sstep(0.86, 0.95, sf) * (1 - sstep(0.95, 1, sf)) * bedK;
        Bed[k] = (L.lerp(hash2(sb, 17) - 0.5, hash2(sb + 1, 17) - 0.5, sstep(0.86, 1, sf)) + 0.2 * nA.n2(x / 210 + 5, sp * 11)) * bedK;      // + fine laminae inside each bed
        Rd[k] = sstep(0.6, 0.8, hash2(sb, 53)) * sstep(0.3, 0.6, sf) * (1 - sstep(0.9, 1, sf)) * bedK;
      }
      Hh[k] = h; Tn[k] = tn;
    }
  }
  // pale chips (料姜石, lime nodules broken out of the loess): small bevelled flakes lying in the earth, each tilted its own way
  const rcp = L.rng('s29chips');
  for (const [px, py, pr] of [[1568, 124, 21], [1640, 92, 12], [1742, 158, 27], [1796, 96, 11], [1700, 226, 9], [1846, 420, 13], [232, 384, 16], [96, 232, 10], [420, 96, 11], [1480, 60, 8]]) {
    const ns = rcp.int(4, 6), rot0 = rcp.range(0, L.TAU), pl = [];
    for (let s = 0; s < ns; s++) { const an = rot0 + (s / ns) * L.TAU + rcp.range(-0.3, 0.3); pl.push([Math.cos(an), Math.sin(an) * rcp.range(0.9, 1.5), pr * rcp.range(0.62, 1)]); }
    const tx = rcp.range(-0.25, 0.25), ty = rcp.range(-0.25, 0.25), hgt = 3.5 + pr * 0.22, e0 = Math.ceil(pr * 1.3) + 3;
    for (let yy = Math.floor(py - e0); yy <= py + e0; yy++) for (let xx = Math.floor(px - e0); xx <= px + e0; xx++) {
      const i = xx - X0, j = yy - Y0; if (i < 1 || j < 1 || i >= RW - 1 || j >= RH - 1) continue;
      let e = 99; const qx = xx - px, qy = yy - py;
      for (const [nx, ny, rr] of pl) { const dd = rr - (qx * nx + qy * ny); if (dd < e) e = dd; }
      e -= 1.6 + 1.6 * nB.n2(xx / 5, yy / 5);
      if (e <= 0) continue;
      const k = j * RW + i, m = Math.min(1, e / 2.2);
      Hh[k] = Hh[k] * (1 - m) + (Hh[k] * 0.3 + hgt + tx * qx + ty * qy + 0.5 * (hash2(i, j) - 0.5)) * m; Chip[k] = Math.min(1, e / 1.2);
    }
  }

  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, r2 = ddx * ddx + ddy * ddy;
      if (r2 < RIN2) continue;
      const k = j * RW + i, rr = Math.sqrt(r2), dr = rr - R, th = ddx / rr;
      const mac = cg.bil(cMac, i, j), calm = Calm[k], kc = 1 - calm;
      light(Hh, RW, RH, i, j, 7);
      // raking light: bright gold at the upper left, sinking to sienna by the middle; the calm patch lies in that half-shade
      let m = L.lerp(1.26, 0.62, sstep(-80, 1020, x + 0.35 * (y - 300))) * (1 + 0.2 * mac * kc) * (x > 1300 ? L.lerp(1, 0.84, sstep(1300, 1950, x)) : 1);
      m += (L.lerp(0.58, m, 0.25) - m) * calm * 0.9;
      // the crevice between coin and earth: narrow on the lit side, a broad cast shadow on the right
      let crev = 0.12;
      if (dr > 0) { const wS = L.lerp(13, 62, sstep(-0.42, 0.42, th)); crev = dr < wS * 7 ? 1 - 0.88 * Math.exp(-dr / wS) : 1; }
      const chip = Chip[k], ck = Ck[k];
      const relK = 0.72 + 0.28 * kc;            // relief reads softer in the calm patch
      const rel = 1 + (lRel - 1) * relK;
      let il = (0.26 + 0.74 * rel * (1 - 0.92 * lSh * relK)) * m * crev * (1 - 0.5 * ck);
      if (chip > 0) il *= 1 + 0.75 * chip;
      const tn = Tn[k];
      il *= (1 + 0.22 * tn) * (1 + 0.42 * Bed[k]);          // each bed a shade lighter or darker than its neighbours
      let li = (il / IMAX * (NL - 1)) | 0; li = (li < 0 ? 0 : li > NL - 1 ? NL - 1 : li) * 3;
      let r = SOIL[li], g = SOIL[li + 1], b = SOIL[li + 2];
      // 土红斑: here and there a bed carries lenses of burnt-red earth (a soft band along the bedding, never a line)
      const rdw = Rd[k];
      if (rdw > 0.01) {
        const red = rdw * sstep(-0.15, 0.3, cg.bil(cRed, i, j) + 0.3 * tn) * 0.42;
        if (red > 0) { r += (RED[li] - r) * red; g += (RED[li + 1] - g) * red; b += (RED[li + 2] - b) * red; }
      }
      // paler, dustier drifts / pale and dark grains
      const pale = sstep(0.1, 0.5, cg.bil(cPale, i, j)) * 0.22 * kc;
      if (pale > 0) { r += (236 - r) * pale * 0.5; g += (206 - g) * pale * 0.5; b += (140 - b) * pale * 0.5; }
      if (tn > 0.12) { const t = (tn - 0.12) * 0.9; r += (232 - r) * t; g += (214 - g) * t; b += (176 - b) * t; }
      if (chip > 0) { r += (CHIP[li] * 0.97 - r) * chip; g += (CHIP[li + 1] * 0.95 - g) * chip; b += (CHIP[li + 2] * 0.9 - b) * chip; }
      const o = k * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH), sg = cnv.getContext('2d');
  sg.putImageData(img, 0, 0);
  // shallow depth of field: the wall is sharp where it meets the coin and softens as it recedes toward the top of frame
  const out = L.makeCanvas(W + PAD * 2, H + PAD * 2), og = out.getContext('2d');
  out._pad = PAD;
  og.fillStyle = '#1a0d05'; og.fillRect(0, 0, out.width, out.height);
  og.drawImage(cnv, 0, 0);                                   // (keeps the outermost rows solid under the blurred copy)
  og.filter = 'blur(3px)'; og.drawImage(cnv, 0, 0); og.filter = 'none';
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.radial(sg, a.cx + PAD, a.cy + PAD, R + 90, R + 470, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  sg.fillRect(0, 0, RW, RH);
  og.drawImage(cnv, 0, 0);
  return out;
}

export default {
  name: '出土钱缘',
  tone: 'light',
  init(env) {
    const sand = sandTile();
    S = { soil: buildSoil(env, sand), coin: buildCoin(env, sand) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.008, 0.008, p);
    L.blit(ctx, env, S.soil, { rot: rot * 0.35, zoom: L.lerp(1.0, 1.005, p) });
    L.blit(ctx, env, S.coin, { rot, zoom: L.lerp(1.0, 1.012, p) });
    // the raking light creeps along the rim
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'soft-light';
    a.at(ctx, L.lerp(-0.23, -0.14, p), -170, () => {
      ctx.scale(4.2, 1);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 170, [[0, 'rgba(255,252,240,0.5)'], [0.5, 'rgba(255,250,235,0.2)'], [1, 'rgba(255,250,235,0)']]);
      ctx.fillRect(-180, -180, 360, 360);
    });
    ctx.restore();
    L.vignette(ctx, { strength: 0.3 });
  },
};
