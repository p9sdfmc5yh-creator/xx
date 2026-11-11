// s25 — 雪后金瓦. A macro of a yellow-glazed tile roof after snowfall, at dusk.
// Above the arc: one flat sheet of rose-magenta dusk sky (the tagline sits here).
// The arc = the top of a fat, rounded snow cornice (雪檐) whose crown catches a band of gold sunset light.
// Below: only four or five BIG tile ridges (筒瓦垄, ~200 px wide) emerge from under the snow, lapped pan tiles (板瓦) in the
// troughs between them; the snow hangs down the troughs in drip-shaped tongues and throws violet shadows on the wet glaze.
// Recipe: nothing is drawn with vector shapes. Tiles and snow are one height field (computed per pixel in the roof's polar
// coordinates, in init), lit by a low sun with marched soft shadows, ambient occlusion, a glossy glaze shader (streak highlight,
// sky reflections on the flanks) and a soft snow shader; then a shallow depth of field is baked in (sharp at the crest,
// falling out of focus toward the sides and the bottom) and the whole layer is blit with a small rot.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 64;           // the layer only ever slides ~10 px (small rot), so a small margin is plenty
const RES = 0.75;         // resolution of the per-pixel pass
const NI = 5;             // ridges / troughs are indexed −NI … NI
const PITCH = 420;        // ridge spacing along the arc (px) → four full ridges across the frame
const HALF = 100;         // half-width of a tube tile (筒瓦)
const HT = 84;            // its height above the trough
const PD = 26;            // depth of the concave pan tiles (板瓦) in the trough
const WT = PITCH / 2 - HALF + 14;   // half-width of the pan-tile channel (it runs under the tube tiles)
const TLEN = 452;         // length of one tube tile between joints
const LAP = 128;          // exposed length of each lapped pan tile
const PLC = 112, PLT = 64;    // level of the snow slab near the arc: over a ridge crown / over a trough (soft ribs show through)
const EDGE = 18;          // extra thickness the snow gains right at its edge (a rounded lip instead of a feather edge)
const FLOOR = 0;          // height the cornice rolls down to at the silhouette
const C = { sky: '#a02a84' };
let S = null;

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const hsh = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// light: the sun low in the upper left (direction TOWARD the light), the camera looks straight at the roof
const LXH = -0.85, LYH = -0.527, ELEV = 0.96;
const LX = LXH * Math.cos(ELEV), LY = LYH * Math.cos(ELEV), LZ = Math.sin(ELEV), TANE = Math.tan(ELEV);
const HN = Math.hypot(LX, LY, LZ + 1), HX = LX / HN, HY = LY / HN, HZ = (LZ + 1) / HN;   // half vector

// ───────────────────────── the plan: tiles and where the snow lies ─────────────────────────
function makePlan(env) {
  const R = env.arc.R;
  const r = L.rng('s25plan'), nz = L.makeNoise('s25plan');
  const troughs = [], ridges = [];
  // trough j lies on theta = j·PITCH/R ("底瓦坐中": a trough, not a ridge, on the centre line); ridge i between troughs i and i+1
  for (let j = -NI; j <= NI + 1; j++) troughs.push({ j, TL: r.range(42, 54), e: r.range(260, 520), tip: r.range(95, 135), lap0: r.range(0, LAP), lap: LAP * r.range(0.92, 1.1), tilt: r.range(-0.035, 0.035) });
  for (let i = -NI; i <= NI; i++) ridges.push({ i, hw: HALF * r.range(0.96, 1.04), ht: HT * r.range(0.95, 1.05), j0: r.range(0, TLEN), tl: TLEN * r.range(0.94, 1.06), m: r.range(100, 170), off: r.range(-6, 6), wob: r.range(0, 50) });
  const T = (j, o) => Object.assign(troughs[j + NI], o), Rg = (i, o) => Object.assign(ridges[i + NI], o);
  // art direction for what the frame actually shows. TL = level of the snow tongue left in that trough, e = depth where it ends.
  T(-3, { e: 430 }); T(-2, { TL: 50, e: 300, tip: 110 }); T(-1, { TL: 54, e: 560, tip: 130 });
  T(0, { TL: 48, e: 330, tip: 120 }); T(1, { TL: 44, e: 250, tip: 95 }); T(2, { TL: 52, e: 470, tip: 130 }); T(3, { e: 300 });
  // m = depth below the arc at which the crown of that ridge melts out of the snow
  Rg(-3, { m: 135 }); Rg(-2, { m: 152 }); Rg(-1, { m: 104, j0: 150, tl: 450 }); Rg(0, { m: 148, j0: 60, tl: 462 }); Rg(1, { m: 112 }); Rg(2, { m: 140 });
  // look-ups over theta
  const sMax = Math.asin((W / 2 + PAD + 60) / R) + 0.03;
  const NL = 4096, TH0 = -sMax, LS = (NL - 1) / (2 * sMax);
  const topL = new Float32Array(NL), cL = new Float32Array(NL), wcL = new Float32Array(NL), roL = new Float32Array(NL), rimL = new Float32Array(NL);
  for (let k = 0; k < NL; k++) {
    const sa = (TH0 + k / LS) * R;
    topL[k] = L.clamp(3.1 * nz.fbm(sa / 170, 3.3, 2) + 1.5 * nz.n2(sa / 46, 8.1), -4.5, 4.5);   // the top edge undulates ±4.5 px about the arc
    cL[k] = 62 + 16 * nz.fbm(sa / 460 + 2.2, 1.7, 2);                                            // where the slab starts thinning
    wcL[k] = 170 + 30 * nz.fbm(sa / 300, 6.4, 2);                                                // … and over what depth
    roL[k] = 40 + 12 * nz.fbm(sa / 280, 4.9, 2);                                                 // radius of the roll at the silhouette
    rimL[k] = L.clamp(0.62 + 0.75 * nz.fbm(sa / 120, 7.7, 2), 0.08, 1) * L.lerp(1, 0.4, L.clamp(sa / 2000 + 0.5));   // the gold rim swells, thins, and fades to the right
  }
  return { troughs, ridges, NL, TH0, LS, topL, cL, wcL, roL, rimL };
}

/** in-place separable box blur of a Float32Array field (radius r, in grid px) */
function boxBlur(f, w, h, r) {
  const tmp = new Float32Array(Math.max(w, h)), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += f[o + (x < 0 ? 0 : x)];
    for (let x = 0; x < w; x++) { tmp[x] = acc * k; const xa = x + r + 1, xb = x - r; acc += f[o + (xa >= w ? w - 1 : xa)] - f[o + (xb < 0 ? 0 : xb)]; }
    for (let x = 0; x < w; x++) f[o + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += f[(y < 0 ? 0 : y) * w + x];
    for (let y = 0; y < h; y++) { tmp[y] = acc * k; const ya = y + r + 1, yb = y - r; acc += f[(ya >= h ? h - 1 : ya) * w + x] - f[(yb < 0 ? 0 : yb) * w + x]; }
    for (let y = 0; y < h; y++) f[y * w + x] = tmp[y];
  }
}

// ───────────────────────── height field → light ─────────────────────────
function buildRoof(env, P) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const y0 = Math.floor(a.crestY - 12);
  const LW = W + PAD * 2, LH = H + PAD - y0;
  const gw = Math.round(LW * RES), gh = Math.round(LH * RES), N = gw * gh, inv = 1 / RES;
  const tH = new Float32Array(N);                 // tile surface
  const Hh = new Float32Array(N).fill(FLOOR);     // final surface (snow where it lies)
  const th = new Float32Array(N);                 // raw snow thickness (≤ 0: bare glaze)
  const aTop = new Float32Array(N);               // silhouette alpha
  const tone = new Float32Array(N), hue = new Float32Array(N), mort = new Float32Array(N), pool = new Float32Array(N), rimW = new Float32Array(N);
  const live = new Uint8Array(N);
  const nz = L.makeNoise('s25');
  const { troughs, ridges, NL, TH0, LS, topL, cL, wcL, roL, rimL } = P;
  const NR = ridges.length - 1;

  // pass 1: geometry
  for (let gy = 0; gy < gh; gy++) {
    const Y = (gy + 0.5) * inv + y0, ddy = cy - Y;
    for (let gx = 0; gx < gw; gx++) {
      const X = (gx + 0.5) * inv - PAD, ddx = X - cx;
      const d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < -7) continue;
      const i = gy * gw + gx;
      const theta = Math.atan2(ddx, ddy), sa = theta * R;
      let li = ((theta - TH0) * LS + 0.5) | 0; if (li < 0) li = 0; else if (li >= NL) li = NL - 1;
      const dd = d - topL[li];
      const at = dd / 1.3 + 0.5;
      if (at <= 0) continue;
      aTop[i] = at > 1 ? 1 : at; live[i] = 1;
      // which ridge, which troughs
      const q = sa / PITCH; let ii = Math.floor(q); const f = q - ii - 0.5, x = f * PITCH;
      let ri = ii + NI; if (ri < 0) ri = 0; else if (ri > NR) ri = NR;
      const rd = ridges[ri], trL = troughs[ri], trR = troughs[ri + 1];
      // tube tile: a glazed half-cylinder, one tile at a time (each a hair different in girth, seat and line)
      const dj = (d + rd.j0) / rd.tl, kt = Math.floor(dj), v = dj - kt;
      const h1 = hsh(ii * 7 + 3, kt), h2 = hsh(ii * 13 + 5, kt * 3 + 1), h3 = hsh(ii * 5 + 11, kt * 7 + 2);
      const rs = 1 + 0.04 * (h1 - 0.5) + 0.028 * v;
      const xx = x - rd.off - 3.2 * nz.n2(d / 280 + rd.wob, 3.1) - (h2 - 0.5) * 5;
      const hwk = rd.hw * rs;
      let hT = -1e3, mo = 0;
      if (xx > -hwk && xx < hwk) {
        const u = xx / hwk;
        hT = rd.ht * rs * Math.sqrt(1 - u * u) + (h3 - 0.5) * 3 + 0.7 * nz.n2(xx / 50, d / 210 + ii * 3.3);   // + glaze waviness
        const de = (v < 0.5 ? v : 1 - v) * rd.tl;
        if (de < 9) { const g = Math.exp(-(de * de) / 7); hT -= 4.5 * g; mo = g; }    // the joint, pointed with mortar
      }
      // pan tiles in the trough: concave, lapped like shingles ("压七露三")
      const tj = f < 0 ? trL : trR, xt = f < 0 ? x + PITCH / 2 : x - PITCH / 2;
      const un = xt / WT, un2 = un * un;
      const dl = (d - tj.lap0 - 22 * (1 - un2) + tj.tilt * xt + 1.6 * nz.n2(xt / 70 + tj.j * 5.1, d / 110)) / tj.lap;
      const m = Math.floor(dl), fr = dl - m;
      const p1 = hsh(tj.j * 17 + 1, m), p2 = hsh(tj.j * 29 + 7, m * 5 + 3);
      const hP = -PD * (1 - un2) + 9 * fr - 4.5 + (p1 - 0.5) * 2;
      const tube = hT > hP;
      const tileH = tube ? hT : hP;
      tH[i] = tileH;
      tone[i] = tube ? h1 - 0.5 : p1 - 0.5; hue[i] = tube ? h3 - 0.5 : p2 - 0.5; mort[i] = tube ? mo : -1;   // mort < 0 flags a pan tile
      pool[i] = tube ? Math.pow(Math.abs(xx) / hwk, 4) : 0.25 + 0.5 * fr * fr;
      // snow: a level surface D (measured from the trough). Over each ridge crown it thins until the glaze melts out (at depth m)
      // in a tall arch; in each trough a tongue lingers (to depth e) and ends in a rounded, drip-like tip.
      const c = cL[li], wc = wcL[li];
      const ws = 1 - sm((d - c) / wc);
      let t0 = trL.TL + (PLT - trL.TL) * ws, t1 = trR.TL + (PLT - trR.TL) * ws;
      t0 -= (t0 + 38) * sm((d - (trL.e - trL.tip)) / trL.tip); t1 -= (t1 + 38) * sm((d - (trR.e - trR.tip)) / trR.tip);
      const Lt = t0 + (t1 - t0) * sm(f + 0.5);
      const ez = Math.exp(2 * ((rd.m - d) / 110 + 0.38)), Lc = 68 + 44 * (ez - 1) / (ez + 1);
      const xr = xx / (PITCH / 2), wr = xr <= -1 || xr >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * xr);
      let D = Lt + (Lc - Lt) * wr + 7 * xr * (1 - wr);     // (snow lingers a little longer on the flank away from the sun)
      D += 8 * nz.fbm(sa / 230 + 4.1, d / 230 + 1.7, 2) + 3.5 * nz.n2(sa / 75, d / 75 + 9) + 3 * nz.n2(sa / 34 + 3, d / 34);
      const t = D - tileH;
      th[i] = t;
      if (t > 0) {
        const lump = (4 * nz.fbm(X / 190, Y / 190, 2) + 1.5 * nz.n2(X / 60, Y / 60) + 0.22 * nz.n2(X / 8, Y / 8)) * sm(t / 12);
        let hs = tileH + t + EDGE * (1 - Math.exp(-t / 4)) + lump;
        const ro = roL[li];
        if (dd < ro) { const u = dd <= 0 ? 1 : 1 - dd / ro; hs = FLOOR + (hs - FLOOR) * Math.sqrt(1 - u * u); rimW[i] = rimL[li]; }
        else if (dd < ro + 30) rimW[i] = rimL[li];
        Hh[i] = hs;
      } else Hh[i] = tileH;
    }
  }

  // ambient occlusion from the blurred field; soft cast shadows marched toward the sun
  const Hb = Hh.slice(); boxBlur(Hb, gw, gh, 9); boxBlur(Hb, gw, gh, 9);
  let HMAX = 0; for (let i = 0; i < N; i++) if (Hh[i] > HMAX) HMAX = Hh[i];
  const shadow = new Float32Array(N).fill(1);
  const STEP = 2.2, sdx = LXH * STEP, sdy = LYH * STEP, rise = STEP * inv * TANE;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const i = gy * gw + gx; if (!live[i]) continue;
    let h = Hh[i] + 0.8, fx = gx + 0.5, fy = gy + 0.5, s = 1;
    for (let k = 1; k < 96; k++) {
      fx += sdx; fy += sdy; h += rise;
      if (h > HMAX || fx < 0 || fy < 0) break;
      const df = h - Hh[(fy | 0) * gw + (fx | 0)];
      if (df <= 0) { s = 0; break; }
      const pen = df / (0.36 * k + 1.2);
      if (pen < s) s = pen;
    }
    shadow[i] = s * s * (3 - 2 * s);
  }
  boxBlur(shadow, gw, gh, 1);

  // pass 2: shading
  const snowRamp = L.makeRamp([[0, '#866ac2'], [0.3, '#aa91d8'], [0.5, '#c9b4e7'], [0.66, '#e8dff3'], [0.78, '#faf7fb'], [0.9, '#fffdf8'], [1, '#fff5e2']]);
  const SN = 512, sLut = new Float32Array(SN * 3);
  for (let k = 0; k < SN; k++) { const c = snowRamp(k / (SN - 1)); sLut[k * 3] = c[0] / 255; sLut[k * 3 + 1] = c[1] / 255; sLut[k * 3 + 2] = c[2] / 255; }
  const img = new ImageData(gw, gh), o = img.data;
  const glow = new ImageData(gw, gh), og = glow.data;
  const sparkC = [], glintC = [];
  for (let gy = 1; gy < gh - 1; gy++) {
    const Y = (gy + 0.5) * inv + y0, ddy = cy - Y;
    for (let gx = 1; gx < gw - 1; gx++) {
      const i = gy * gw + gx;
      const aT = aTop[i]; if (aT <= 0) continue;
      const X = (gx + 0.5) * inv - PAD, ddx = X - cx;
      const t = th[i], aS = t <= 0 ? 0 : t >= 3.5 ? 1 : sm(t / 3.5);
      const sh = shadow[i];
      const conc = Hb[i] - Hh[i];                       // > 0 in hollows, < 0 on crests
      let cr = 0, cg = 0, cb = 0, bloom = 0;
      if (aS < 1) {
        // ── glazed tile ──
        const hx = (tH[i + 1] - tH[i - 1]) * 0.5 * RES, hy = (tH[i + gw] - tH[i - gw]) * 0.5 * RES;
        const il = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * il, ny = -hy * il, nzz = il;
        const ndl = nx * LX + ny * LY + nzz * LZ;
        let diff = ndl > 0 ? ndl / 0.95 : 0;
        const ao = conc > 0 ? 1 - 0.55 * (conc > 45 ? 1 : conc / 45) : 1 + 0.06 * (conc < -30 ? 1 : -conc / 30);
        // glaze colour: kiln differences from tile to tile, runs and mottling down the slope, deeper amber where the glaze pooled,
        // the odd iron spot; the troughs sit deeper and dirtier
        const mott = nz.fbm(X / 70, Y / 170, 2), run = nz.fbm(X / 13 + 5.5, Y / 300, 2), tn = tone[i], hu = hue[i], pl = pool[i], mo = mort[i];
        const tubeK = mo >= 0 ? 1 : 0;
        let val = 1 + 0.26 * tn + 0.07 * mott + 0.07 * run;
        const spot = nz.n2(X / 6.5 + 31, Y / 6.5); if (spot > 0.8) val *= 1 - 1.6 * (spot - 0.8);
        let aR = 0.95 * val, aG = 0.75 * val * (1 + 0.16 * hu + 0.05 * mott - 0.13 * pl), aB = 0.11 * val * (1 - 0.4 * pl);
        if (mo > 0) { const w = mo * 0.8; aR += (0.84 - aR) * w; aG += (0.76 - aG) * w; aB += (0.6 - aB) * w; }
        if (mo < 0) { aR *= 0.9; aG *= 0.82; aB *= 0.8; }
        const dsh = diff * sh;
        cr = aR * (0.62 * ao + 0.44 * dsh); cg = aG * (0.47 * ao + 0.5 * dsh); cb = aB * (0.47 * ao + 0.48 * dsh);
        // the streak highlight of a glazed cylinder (anisotropic along the ridge), swelling and breaking as the glaze flows
        const rr = Math.sqrt(ddx * ddx + ddy * ddy), ax = -ddx / rr, ay = ddy / rr;
        const ha = HX * ax + HY * ay, hpx = HX - ha * ax, hpy = HY - ha * ay;
        const ndh = (nx * hpx + ny * hpy + nzz * HZ) / Math.sqrt(hpx * hpx + hpy * hpy + HZ * HZ);
        let spec = 0;
        if (ndh > 0.5) {
          const flow = 0.6 + 0.4 * nz.n2(X / 60 + 7.1, Y / 230);
          spec = (Math.pow(ndh, 240) * (0.4 + 0.9 * flow) + Math.pow(ndh, 26) * 0.1) * (0.15 + 0.85 * sh) * (mo > 0 ? 1 - 0.8 * mo : 1);
        }
        // the sky mirrored in the glaze: warm afterglow on the sunward flank, rose-magenta on the far one, the roof itself at grazing angles
        const rx = 2 * nzz * nx, ry = 2 * nzz * ny, rz = 2 * nzz * nzz - 1;
        const sd = rx * LXH + ry * LYH, hz = 1 - rz * rz;
        const F = (0.05 + 0.5 * (1 - nzz) * (1 - nzz)) * ao * (mo > 0 ? 1 - 0.7 * mo : 1);
        let er, eg, eb;
        if (sd > 0) { er = 1.0 * sd * hz; eg = 0.8 * sd * hz; eb = 0.5 * sd * hz; } else { er = -0.72 * sd * hz; eg = -0.24 * sd * hz; eb = -0.52 * sd * hz; }
        if (rz > 0) { er += 0.26 * rz; eg += 0.1 * rz; eb += 0.28 * rz; } else { const gk = 1 + rz * 1.6; const g2 = gk < 0 ? 0 : gk; er = er * g2 + 0.3 * (1 - g2); eg = eg * g2 + 0.15 * (1 - g2); eb = eb * g2 + 0.02 * (1 - g2); }
        cr += F * er + spec; cg += F * eg + spec * 0.97; cb += F * eb + spec * 0.86;
        bloom = spec;
        if (spec > 0.95 && hsh(gx, gy) > 0.97) glintC.push([X, Y, spec]);
      }
      if (aS > 0) {
        // ── snow ──
        const hx = (Hh[i + 1] - Hh[i - 1]) * 0.5 * RES, hy = (Hh[i + gw] - Hh[i - gw]) * 0.5 * RES;
        const il = 1 / Math.sqrt(hx * hx + hy * hy + 1);
        const ndl = (-hx * LX - hy * LY + LZ) * il;
        let k = (ndl + 0.1) / 1.12; if (k < 0) k = 0;
        k *= 0.16 + 0.84 * sh;
        if (k > 1) k = 1;
        const q = ((k * (SN - 1)) | 0) * 3;
        let sr = sLut[q], sg = sLut[q + 1], sb = sLut[q + 2];
        // hollows sink into violet
        if (conc > 0) { const w = 0.55 * (conc > 50 ? 1 : conc / 50); sr += (0.5 - sr) * w; sg += (0.38 - sg) * w; sb += (0.72 - sb) * w; }
        // the band of sunset gold along the crown of the cornice
        const rw = rimW[i];
        if (rw > 0) {
          const d = R - Math.sqrt(ddx * ddx + ddy * ddy);
          const g1 = Math.exp(-Math.max(0, d) / (4 + 13 * rw)) * rw * (0.3 + 0.7 * sh);
          sr += (1.0 - sr) * g1 * 0.9; sg += (0.8 - sg) * g1 * 0.9; sb += (0.44 - sb) * g1 * 0.9;
          const g0 = Math.exp(-Math.max(0, d) / 2.4) * (0.5 + 0.5 * rw);
          sr += (1.0 - sr) * g0; sg += (0.96 - sg) * g0; sb += (0.83 - sb) * g0;
          bloom += 0.5 * g1 + 0.4 * g0;
        }
        if (aS >= 1 && k > 0.86 && hsh(gx * 3 + 1, gy * 7 + 2) > 0.9991) sparkC.push([X, Y]);
        cr += (sr - cr) * aS; cg += (sg - cg) * aS; cb += (sb - cb) * aS;
        bloom *= aS < 1 ? 1 : 1;
      }
      const k4 = i * 4;
      o[k4] = cr * 255; o[k4 + 1] = cg * 255; o[k4 + 2] = cb * 255; o[k4 + 3] = aT * 255;
      if (bloom > 0.02) { const b = bloom > 1 ? 1 : bloom; og[k4] = 255; og[k4 + 1] = 240; og[k4 + 2] = 205; og[k4 + 3] = b * aT * 255; }
    }
  }
  const small = L.makeCanvas(gw, gh); small.getContext('2d').putImageData(img, 0, 0);
  const smallG = L.makeCanvas(gw, gh); smallG.getContext('2d').putImageData(glow, 0, 0);
  const roof = L.makeCanvas(LW, LH), g = roof.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, LW, LH);
  // bloom: the highlights bleed a little, as they do through a lens
  const bl = L.makeCanvas(LW, LH), bg = bl.getContext('2d');
  bg.filter = 'blur(7px)'; bg.drawImage(smallG, 0, 0, LW, LH); bg.filter = 'none';
  bg.globalCompositeOperation = 'destination-in'; bg.drawImage(roof, 0, 0);
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(bl, 0, 0); g.restore();

  // shallow depth of field: sharp around the crest, falling away toward the sides and the bottom
  const fx = cx + PAD, fy = a.crestY + 120 - y0;
  const defocus = (px, r0, r1) => {
    const b = L.blurred(roof, px), bgx = b.getContext('2d');
    const mask = (c2, op) => {
      c2.save(); c2.globalCompositeOperation = op; c2.translate(fx, fy); c2.scale(1, 0.72);
      c2.fillStyle = L.radial(c2, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
      c2.fillRect(-4000, -4000, 8000, 8000); c2.restore();
    };
    mask(g, 'destination-out'); mask(bgx, 'destination-in');
    g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(b, 0, 0); g.restore();
  };
  defocus(2.6, 400, 760);
  defocus(7, 720, 1250);

  // sites for the live twinkles
  const rs = L.rng('s25spark');
  const sparks = [];
  for (const [X, Y] of sparkC) { if (sparks.length >= 70) break; if (!rs.chance(0.6)) continue; const p = a.polar(X, Y); sparks.push({ theta: p.theta, dr: p.dr, size: rs.range(0.8, 1.7), ph: rs.int(0, 3), warm: rs.chance(0.45) }); }
  const glints = [];
  glintC.sort((p, q) => q[2] - p[2]);
  for (const [X, Y] of glintC) {
    if (glints.length >= 5) break;
    if (X < 60 || X > W - 60 || Y > H - 40) continue;
    if (glints.some((o2) => Math.hypot(o2.x - X, o2.y - Y) < 260)) continue;
    const p = a.polar(X, Y); glints.push({ x: X, y: Y, theta: p.theta, dr: p.dr, size: rs.range(0.8, 1.2), ph: rs.int(0, 2) });
  }
  return { roof, y0, sparks, glints };
}

// ───────────────────────── sky ─────────────────────────
function buildSky() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = C.sky; g.fillRect(0, 0, W, H);      // one flat sheet of colour; only a breath of paper grain
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(W, H, { seed: 's25sky', amount: 0.1, size: 2 }), 0, 0);
  return c;
}

export default {
  name: '雪后金瓦',
  tone: 'light',
  init(env) {
    const P = makePlan(env);
    const { roof, y0, sparks, glints } = buildRoof(env, P);
    S = { sky: buildSky(), roof, y0, sparks, glints };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0038, 0.0038, p);
    ctx.drawImage(S.sky, 0, 0);
    // the roof slides a few px along the arc (rotation about the arc's centre), the sky holds still
    L.cam(ctx, env, { rot }, () => ctx.drawImage(S.roof, -PAD, S.y0));
    // a breath of low sun sliding along the cornice (kept on the roof so the sky stays flat)
    ctx.save(); a.clipBelow(ctx, 5);
    const gl = a.pt(L.lerp(-0.2, -0.1, p), -40);
    L.glow(ctx, gl.x, gl.y, 360, '#ffdca0', 0.2, 'soft-light');
    ctx.restore();
    L.cam(ctx, env, { rot }, () => {
      ctx.globalCompositeOperation = 'lighter';
      // snow crystals flashing
      for (const sp of S.sparks) {
        const k = (env.frame + sp.ph) % 4;
        if (k > 1) continue;
        const q = a.pt(sp.theta, sp.dr), al = k === 0 ? 0.95 : 0.5, rad = 4.5 * sp.size;
        ctx.fillStyle = L.radial(ctx, q.x, q.y, 0, rad, [[0, L.rgba(sp.warm ? '#ffe9bd' : '#ffffff', al)], [0.25, L.rgba(sp.warm ? '#ffd58c' : '#e6e2ff', al * 0.35)], [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(q.x - rad, q.y - rad, rad * 2, rad * 2);
      }
      // the wet glaze flaring where the sun catches it: each bloom swells and dies within three frames
      for (const gt of S.glints) {
        const k = (env.frame + gt.ph) % 3;
        const q = a.pt(gt.theta, gt.dr), rad = 46 * gt.size * (k === 0 ? 1 : k === 1 ? 0.8 : 0.6), al = k === 0 ? 0.6 : k === 1 ? 0.42 : 0.25;
        ctx.fillStyle = L.radial(ctx, q.x, q.y, 0, rad, [[0, `rgba(255,250,228,${al})`], [0.3, `rgba(255,226,150,${al * 0.4})`], [1, 'rgba(255,210,120,0)']]);
        ctx.fillRect(q.x - rad, q.y - rad, rad * 2, rad * 2);
      }
    });
  },
};
