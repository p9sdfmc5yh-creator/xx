// s15 — 旋转的秦半两. A huge Qin "banliang" coin spinning in the dark; we only see the top of it.
// The arc is the coin's outer edge: no raised rim (秦半两 has none), just a slightly knobbly cast edge that the spin
// smears into a soft fringe, picked out by a hairline of blue-violet rim light.
//
// How it is built:
//   · the coin face is authored in POLAR space (u = arc length, d = depth below the edge) as a small float field:
//     every patch of patina becomes a long concentric streak, exactly what a rotational motion blur does;
//   · that field is resampled once into a screen-space layer, which draw() spins about the arc's centre (the arc never moves);
//   · the light does not spin with the coin: a multiply "falloff", a colour-dodge "hot wedge" (the fan-shaped highlight every
//     spinning metal disc shows) and the blue-violet rim spill are separate low-res polar layers that sweep slowly left → right.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const SPIN = 0.13;     // the face turns ±SPIN rad over the shot (≈ 90 px per frame at the rim)
const SWEEP = 0.06;    // the light's hot spot slides ±SWEEP rad along the arc (left → right)
const TOPM = 72;       // the rotating layers reach this far above the arc
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── rim light: brightness along the arc (theta measured from the hot spot) and its colour ──
const rimEnv = (th) => 0.8 * Math.exp(-(th * th) / (0.17 * 0.17)) + 0.2 * Math.exp(-(th * th) / (0.5 * 0.5));
/** violet (#7B5CE0) on the trailing side → blue (#3E8BFF) on the leading side, lavender where it is hottest */
function rimRGB(th, o) {
  const k = sstep(-0.14, 0.2, th), core = Math.exp(-(th * th) / (0.05 * 0.05));
  o[0] = Math.min(255, L.lerp(123, 62, k) + core * 84);
  o[1] = Math.min(255, L.lerp(92, 139, k) + core * 60);
  o[2] = Math.min(255, L.lerp(224, 255, k) + core * 24);
  return o;
}

/** bounding box (frame coords) of everything the frame can see of a layer that is rotated by ±rotMax about the arc's centre */
function cropBox(a, rotMax) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, tMax = 0, rMin = 1e9;
  const add = (x, y) => {
    for (let k = 0; k <= 8; k++) {
      const r = L.lerp(-rotMax, rotMax, k / 8), c = Math.cos(r), s = Math.sin(r), dx = x - a.cx, dy = y - a.cy;
      const px = a.cx + dx * c - dy * s, py = a.cy + dx * s + dy * c;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      tMax = Math.max(tMax, Math.abs(Math.atan2(px - a.cx, a.cy - py)));
      rMin = Math.min(rMin, Math.hypot(px - a.cx, py - a.cy));
    }
  };
  for (let i = 0; i <= 96; i++) { const x = (W * i) / 96; add(x, a.yAt(x, TOPM)); add(x, H); }
  for (let i = 0; i <= 24; i++) { add(0, L.lerp(a.yAt(0, TOPM), H, i / 24)); add(W, L.lerp(a.yAt(W, TOPM), H, i / 24)); }
  return { X0: Math.floor(x0) - 8, Y0: Math.floor(y0) - 8, X1: Math.ceil(x1) + 8, Y1: Math.ceil(y1) + 8, tMax: tMax + 0.012, dMax: a.R - rMin + 10 };
}

function lut(stops) {
  const f = L.makeRamp(stops), out = new Float32Array(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = f(i / 1023); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** the spinning coin face, "fully lit": bronze brown / red copper / ochre streaks, concentric with the arc */
function buildFace(env, box) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const nA = L.makeNoise('s15a'), nB = L.makeNoise('s15b');

  // 1) polar tone field: columns every DU px of arc length, rows every px of depth
  const DU = 8, D0 = -12, uMax = box.tMax * R;
  const NT = Math.ceil((2 * uMax) / DU) + 5, NR = Math.ceil(box.dMax - D0) + 3, U0 = -uMax - 2 * DU;
  const T = new Float32Array(NT * NR), Hu = new Float32Array(NT * NR), Gl = new Float32Array(NT * NR), DW = new Float32Array(NT * NR), Ho = new Float32Array(NT * NR);
  for (let j = 0; j < NR; j++) {
    const d = D0 + j;
    const relief = Math.exp(-Math.pow((d - 205) / 105, 2));   // where the (unreadable, smeared-out) raised legend rides: a little brighter, a little busier
    for (let i = 0; i < NT; i++) {
      const u = U0 + i * DU, k = j * NT + i;
      // the coin is neither perfectly round nor perfectly centred, so the streaks waver by a few px
      const dw = d + 5.5 * nA.n2(u / 1300, d / 330) + 1.6 * nB.n2(u / 380 + 5, d / 80);
      DW[k] = dw;
      const broad = nA.fbm(u / 3000 + 3, dw / 96, 3);
      const mid = nA.fbm(u / 1400 - 8, dw / 24 + 40, 3);
      const fine = nB.n2(u / 760 + 13, dw / 6.5);
      const hair = nB.n2(u / 460 - 21, dw / 2.5);
      const micro = nA.n2(u / 280 + 60, dw / 1.15);
      // some bands are smooth, some gritty
      const grit = 0.35 + 0.65 * sstep(-0.35, 0.35, nA.n2(u / 2300 - 40, dw / 64 + 12));
      let t = 0.46 + 0.86 * broad + 0.5 * mid + 0.2 * fine * grit + (0.13 + 0.06 * relief) * hair * grit + 0.07 * micro * grit + 0.05 * relief;
      // deep-brown bands: push the low end down so they read as separate bands, not as a gradient
      t -= 0.1 * sstep(0.03, 0.2, -broad);
      // the square hole, smeared by the spin into a dark band with a streaky upper edge
      const hole = sstep(350, 440, d + 30 * nA.n2(u / 1500 + 9, d / 30) + 9 * nB.n2(u / 600 - 3, d / 7));
      T[k] = t; Ho[k] = hole;
      Hu[k] = nB.fbm(u / 2400 + 77, dw / 46 - 5, 2) - 0.07;
    }
  }
  // 2) individual smeared points: bright nicks and dark pits, each dragged into a long thin line with soft ends;
  //    a few wide ones (whole patches of patina) and a scatter of short ones for grit
  const r = L.rng('s15streak');
  const deposit = (u0, d0, half, sig, amp, glint) => {
    const i0 = Math.max(0, Math.floor((u0 - half - U0) / DU)), i1 = Math.min(NT - 1, Math.ceil((u0 + half - U0) / DU));
    const j0 = Math.max(0, Math.floor(d0 - 3 * sig - 8 - D0)), j1 = Math.min(NR - 1, Math.ceil(d0 + 3 * sig + 8 - D0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * NT + i, x = (U0 + i * DU - u0) / half;
      if (x <= -1 || x >= 1) continue;
      const dd = (DW[k] - d0) / sig; if (dd < -3 || dd > 3) continue;
      const pr = (1 - x * x) * (1 - x * x) * Math.exp(-0.5 * dd * dd);
      T[k] += amp * pr; Gl[k] += glint * pr;
    }
  };
  for (let n = 0; n < 34; n++) deposit(r.range(-uMax, uMax), 14 + r() * 400, r.range(520, 1500), r.range(4.5, 17), r.chance(0.5) ? r.range(0.1, 0.26) : -r.range(0.12, 0.3), 0);
  for (let n = 0; n < 150; n++) {
    const bright = r.chance(0.64);
    deposit(r.range(-uMax, uMax), 5 + Math.pow(r(), 1.5) * 430, r.range(130, 600), r.range(0.55, 2.2) * (r.chance(0.12) ? 2.4 : 1),
      bright ? r.range(0.14, 0.5) : -r.range(0.14, 0.42), bright && r.chance(0.32) ? r.range(0.2, 0.85) : 0);
  }
  for (let n = 0; n < 260; n++) {
    const bright = r.chance(0.55);
    deposit(r.range(-uMax, uMax), 4 + r() * 440, r.range(26, 110), r.range(0.5, 1.3), bright ? r.range(0.12, 0.4) : -r.range(0.12, 0.34), bright && r.chance(0.15) ? r.range(0.15, 0.5) : 0);
  }
  for (let k = 0; k < T.length; k++) T[k] *= 1 - 0.3 * Ho[k];   // (the real darkening of the hole happens after tone-mapping, below)

  // 3) resample into a screen-space layer
  const BASE = lut([[0, '#1e0d06'], [0.18, '#3d1d0c'], [0.4, '#7A4A24'], [0.58, '#a85c2a'], [0.74, '#C47A3C'], [0.88, '#da8e49'], [1, '#ecb46f']]);
  const RUST = lut([[0, '#200906'], [0.18, '#4a160b'], [0.4, '#8f3619'], [0.58, '#b54a25'], [0.74, '#d0602f'], [0.88, '#e27f46'], [1, '#f0a878']]);
  const OCHRE = lut([[0, '#1c0e06'], [0.18, '#3f260c'], [0.4, '#86581f'], [0.58, '#b27c2c'], [0.74, '#cf9a40'], [0.88, '#e0b257'], [1, '#eecb80']]);
  const X0 = box.X0, Y0 = box.Y0, LW = box.X1 - box.X0, LH = box.Y1 - box.Y0;
  const img = new ImageData(LW, LH), px = img.data;
  const fiMax = NT - 1.001, fjMax = NR - 1.001;
  for (let j = 0; j < LH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < LW; i++) {
      const ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -9.5) continue;
      const u = Math.atan2(ddx, ddy) * R;
      // the edge: a soft fringe (the knobbly outline averaged over the exposure) plus faint ghost trails just outside it
      let al = 1;
      if (d < 7) {
        const wob = 2.1 * nA.n2(u / 560, 3.3) + 0.8 * nB.n2(u / 180, 8.1);
        al = sstep(-2.4, 2.8, d + wob - 0.8);
        if (d < 2) {
          const gh = sstep(0.1, 0.62, nB.n2(u / 380 + 4, d / 1.6 + 31)) * sstep(-9, -1.5, d) * 0.5;
          if (gh > al) al = gh;
        }
        if (al <= 0.004) continue;
      }
      let fi = (u - U0) / DU, fj = d - D0;
      fi = fi < 0 ? 0 : fi > fiMax ? fiMax : fi; fj = fj < 0 ? 0 : fj > fjMax ? fjMax : fj;
      const i0 = fi | 0, j0 = fj | 0, tx = fi - i0, ty = fj - j0, k = j0 * NT + i0, k2 = k + NT;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      let t = T[k] * w00 + T[k + 1] * w10 + T[k2] * w01 + T[k2 + 1] * w11;
      const hv = Hu[k] * w00 + Hu[k + 1] * w10 + Hu[k2] * w01 + Hu[k2 + 1] * w11;
      const gl = Gl[k] * w00 + Gl[k + 1] * w10 + Gl[k2] * w01 + Gl[k2 + 1] * w11;
      if (t > 0.68) t = 0.68 + (t - 0.68) * 0.55;   // keep the pale end for the few real highlights
      if (t < 0.24) t = 0.24 - (0.24 - t) * 0.42;   // … and keep the deep-brown bands brown, with their streaks, instead of crushing them to black
      t = t < 0.05 ? 0.05 : t > 1 ? 1 : t;
      const li = ((t * 1023) | 0) * 3;
      let cr = BASE[li], cg = BASE[li + 1], cb = BASE[li + 2];
      let hw = hv * 2.6; hw = hw < -1 ? -1 : hw > 1 ? 1 : hw;
      if (hw < 0) { const m = -hw * 0.9; cr += (RUST[li] - cr) * m; cg += (RUST[li + 1] - cg) * m; cb += (RUST[li + 2] - cb) * m; }
      else { const m = hw * 0.62; cr += (OCHRE[li] - cr) * m; cg += (OCHRE[li + 1] - cg) * m; cb += (OCHRE[li + 2] - cb) * m; }
      if (gl > 0) { cr += gl * 200; cg += gl * 165; cb += gl * 105; }
      if (d > 290) {   // the smeared square hole: nearly black, with a streaky upper edge
        const ho = 1 - 0.9 * (Ho[k] * w00 + Ho[k + 1] * w10 + Ho[k2] * w01 + Ho[k2 + 1] * w11);
        cr *= ho; cg *= ho; cb *= ho;
      }
      const o = (j * LW + i) * 4;
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = al * 255;
    }
  }
  const c = L.makeCanvas(LW, LH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** a low-res layer over the crop box whose pixels are a function of (theta, depth below the arc) */
function polarLayer(a, box, res, fn) {
  const w = Math.ceil((box.X1 - box.X0) * res), h = Math.ceil((box.Y1 - box.Y0) * res);
  const img = new ImageData(w, h), px = img.data, o = [0, 0, 0, 255];
  const sx = (box.X1 - box.X0) / w, sy = (box.Y1 - box.Y0) / h;
  const dith = L.rng('s15dither');
  for (let j = 0; j < h; j++) {
    const ddy = a.cy - (box.Y0 + (j + 0.5) * sy);
    for (let i = 0; i < w; i++) {
      const ddx = box.X0 + (i + 0.5) * sx - a.cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      o[3] = 255;
      fn(Math.atan2(ddx, ddy), a.R - rr, o);
      const k = (j * w + i) * 4, n = dith() - 0.5;
      px[k] = o[0] + n; px[k + 1] = o[1] + n; px[k + 2] = o[2] + n; px[k + 3] = o[3];
    }
  }
  const c = L.makeCanvas(w, h);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** draw a crop-box layer rotated about the arc's centre */
function put(ctx, a, layer, box, rot, blend = 'source-over', alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = blend; ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
  ctx.drawImage(layer, box.X0, box.Y0, box.X1 - box.X0, box.Y1 - box.Y0);
  ctx.restore();
}

export default {
  name: '旋转的秦半两',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const box = cropBox(a, SPIN + 0.004);
    const face = buildFace(env, box);

    // light falloff (multiply): a pool of light around the hot spot, dying away to the sides and toward the hole
    const shade = polarLayer(a, box, 0.25, (th, d, o) => {
      if (d < 0) { o[0] = o[1] = o[2] = 255; return; }
      const fr = 1 - 0.62 * sstep(40, 520, d);
      const fa = 0.29 + 0.71 * Math.exp(-(th * th) / (0.3 * 0.3));
      const f = fr * fa;
      o[0] = 255 * (0.05 + 0.95 * f); o[1] = 255 * (0.03 + 0.97 * f); o[2] = 255 * (0.06 + 0.94 * f);
    });
    // hot wedge (colour-dodge): the fan-shaped highlight of a spinning metal disc
    const wedge = polarLayer(a, box, 0.25, (th, d, o) => {
      if (d < 4) { o[0] = o[1] = o[2] = 0; return; }
      const band = sstep(6, 78, d) * (1 - sstep(170, 470, d));
      const w = (Math.exp(-(th * th) / (0.085 * 0.085)) + 0.32 * Math.exp(-(th * th) / (0.22 * 0.22))) * band;
      o[0] = 114 * w; o[1] = 68 * w; o[2] = 32 * w;
    });
    // blue-violet rim light: a tight glow outside the edge and a spill onto the face just inside it
    const c3 = [0, 0, 0];
    const rim = polarLayer(a, box, 0.5, (th, d, o) => {
      o[0] = o[1] = o[2] = 0;
      if (d > 300 || d < -(TOPM - 8)) return;
      let s;
      if (d >= 0) s = 0.52 * Math.exp(-d / 9) + 0.42 * Math.exp(-d / 38) + 0.13 * Math.exp(-d / 120);
      else s = (0.5 * Math.exp(d / 4.5) + 0.1 * Math.exp(d / 18)) * (1 - sstep(TOPM - 30, TOPM - 8, -d));
      rimRGB(th, c3);
      let v = rimEnv(th) * s;
      // a cool sheen the same light leaves on the face out toward the sides (violet on the left, blue on the right)
      if (d >= 0) v += 0.16 * Math.exp(-d / 170) * sstep(0.07, 0.36, Math.abs(th)) * sstep(0, 14, d);
      o[0] = c3[0] * v; o[1] = c3[1] * v; o[2] = c3[2] * v;
    });

    // knobs on the cast edge: each flashes as it races through the rim light
    const rk = L.rng('s15knob'), knobs = [];
    const sp = a.span(60) + SPIN;
    for (let i = 0; i < 26; i++) knobs.push({ th: rk.range(-sp, sp), len: rk.range(0.018, 0.075), w: rk.range(1.2, 2.6), dr: rk.range(-0.6, 1.8), k: rk.range(0.35, 1) });
    // filaments flung off the rim: straight tangents that peel away from the arc; kept to the left and right thirds
    const rw = L.rng('s15whisk'), whisk = [];
    for (let i = 0; i < 12; i++) {
      const right = i % 2 === 1;
      whisk.push({
        th: right ? rw.range(0.12, 0.33) : rw.range(-0.52, -0.36), s0: rw.range(110, 330), len: rw.range(130, 360), v: rw.range(100, 200),
        w: rw.range(1.1, 2.3), al: rw.range(0.45, 1), col: rw.pick(['#b3a2ff', '#8ab8ff', '#9a86ff', '#74aaff', '#ffb884']), right,
      });
    }
    // finer dust thrown off with them: short smeared dashes hugging the rim, again only out at the sides
    const rm = L.rng('s15mote'), motes = [];
    for (let i = 0; i < 90; i++) {
      const right = i % 2 === 1, v = rm.range(0.03, 0.07);
      motes.push({
        th: right ? rm.range(0.2, 0.47) : rm.range(-0.5, -0.23), v, dr: 2.5 + 46 * Math.pow(rm(), 1.9), len: rm.range(0.004, 0.022),
        w: rm.range(0.7, 1.7), al: rm.range(0.2, 0.9), warm: rm.chance(0.22),
      });
    }
    S = { box, face, shade, wedge, rim, knobs, whisk, motes };
  },
  draw(ctx, env, p) {
    const a = env.arc, B = S.box;
    const spin = L.lerp(-SPIN, SPIN, p), hot = L.lerp(-SWEEP, SWEEP, p);
    const c = [0, 0, 0];
    ctx.fillStyle = '#040305'; ctx.fillRect(0, 0, W, H);

    // the face, spinning; then the light, which does not spin with it
    put(ctx, a, S.face, B, spin);
    put(ctx, a, S.shade, B, hot, 'multiply');
    put(ctx, a, S.wedge, B, hot, 'color-dodge');
    // a soft warm bloom inside the coin where the light is hottest
    ctx.save(); a.clipBelow(ctx, 0);
    const hp = a.pt(hot, -150);
    L.glow(ctx, hp.x, hp.y, 560, '#ff8a3c', 0.13);
    ctx.restore();
    // the blue-violet rim light: once as a veil, once as a dodge so the streaks under it light up in lilac
    put(ctx, a, S.rim, B, hot, 'color-dodge', 0.6);
    put(ctx, a, S.rim, B, hot, 'screen', 0.85);

    // hairline on the very edge
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    for (let i = 0; i <= 32; i++) {
      const th = a.thetaAtX((W * i) / 32) - hot; rimRGB(th, c);
      grad.addColorStop(i / 32, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${rimEnv(th).toFixed(3)})`);
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.6; a.stroke(ctx, -0.5);
    ctx.globalAlpha = 0.32; ctx.lineWidth = 6.5; a.stroke(ctx, 0);
    ctx.restore();

    // knobs of the edge flashing through the light (they travel with the coin)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const q of S.knobs) {
      const th = q.th + spin, e = rimEnv(th - hot) * q.k;
      if (e < 0.04) continue;
      rimRGB(th - hot, c);
      ctx.strokeStyle = `rgba(${Math.min(255, c[0] + 60) | 0},${Math.min(255, c[1] + 60) | 0},${c[2] | 0},${(e * 0.8).toFixed(3)})`;
      ctx.lineWidth = q.w; a.stroke(ctx, q.dr, th - q.len, th + q.len);
      ctx.lineWidth = q.w * 0.6; a.stroke(ctx, q.dr, th - q.len * 0.4, th + q.len * 0.4);
    }
    ctx.restore();

    // a thin bloom riding the edge at the hot spot
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, hot, 0, () => {
      ctx.scale(1, 0.075);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 320, [[0, 'rgba(186,168,255,0.8)'], [0.25, 'rgba(132,108,255,0.42)'], [0.6, 'rgba(84,110,255,0.13)'], [1, 'rgba(62,139,255,0)']]);
      ctx.fillRect(-320, -320, 640, 640);
    });
    ctx.restore();

    // dust
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const q of S.motes) {
      const th = q.th + q.v * p, e = 0.3 + 0.7 * Math.sqrt(rimEnv(th - hot));
      if (q.warm) ctx.strokeStyle = `rgba(255,170,110,${(q.al * e * 0.8).toFixed(3)})`;
      else { rimRGB(th - hot, c); ctx.strokeStyle = `rgba(${Math.min(255, c[0] + 40) | 0},${Math.min(255, c[1] + 40) | 0},${c[2] | 0},${(q.al * e).toFixed(3)})`; }
      ctx.lineWidth = q.w; a.stroke(ctx, q.dr + 7 * p * q.v / 0.05, th - q.len, th + q.len);
    }
    ctx.restore();

    // flung filaments
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const q of S.whisk) {
      const sh = q.s0 + q.v * p, st = Math.max(0, sh - q.len);
      const o = a.pt(q.th, 0.5), ux = Math.cos(q.th), uy = Math.sin(q.th);
      const hx = o.x + ux * sh, hy = o.y + uy * sh, tx = o.x + ux * st, ty = o.y + uy * st;
      let al = q.al * (1 - sstep(430, 600, sh)) * sstep(0, 60, sh);
      if (!q.right) al *= 1 - sstep(520, 610, hx);
      if (al < 0.02) continue;
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, L.rgba(q.col, 0)); g.addColorStop(0.55, L.rgba(q.col, al * 0.55)); g.addColorStop(0.92, L.rgba(q.col, al)); g.addColorStop(1, L.rgba(q.col, 0));
      ctx.strokeStyle = g;
      ctx.globalAlpha = 0.22; ctx.lineWidth = q.w * 4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = q.w; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    }
    ctx.restore();

    L.vignette(ctx, { strength: 0.28, inner: 0.5 });
  },
};
