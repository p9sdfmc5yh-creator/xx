// s02 — 蜡丸. Macro photograph of the far rim of a round cake of yellow beeswax, lit from behind.
// The arc is the outer edge of the cake. Just inside it a row of wax-shell pills (蜡壳丸) sits half sunk into the raised rim:
// creamy translucent balls of uneven size, each with the thin seam where the two half shells meet. Below them the cake itself:
// honey-yellow wax with a few broad pouring rings stepping down into amber. Above: black, with a little lit dust.
//
// What makes it read as a photograph rather than a diagram:
//   one lamp — behind the cake, up and to the left. Every pill carries the same story: a hot crescent on the lamp-side limb,
//     cream where the light soaks through the shell, a warm amber heart where the pill inside blocks it, a shadow raking toward
//     the lens and to the right with a pool of transmitted light in it;
//   a shallow focal plane — sharp at the crest, going soft down the frame (nearer the lens) and sooner on the left;
//   nothing repeated — sizes, gaps, how deep each pill sits, how its seam is turned, how pale its wax is.
//
// How it is built (everything in init, then two blits per frame):
//   BODY — the cake. A tone field T(U, d) is evaluated on a polar grid (U = px along the arc, d = px below it), so every
//          ring is concentric by construction, then mapped through one beeswax colour ramp.
//   TOP  — the raised rim: backlit lip, shelf, cast shadows, and the pills (each shaded per pixel as a translucent sphere).
//   Both get the depth of field baked in. BODY turns a little slower than TOP, so the rings read as lying inside the wax.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 150;     // side margin of the pre-rendered layers (rot ≤ 0.011 rad → ≤ 27 px of slide)
const PADB = 70;     // margin below the frame
const LEDGE = 214;   // depth (px below the arc) of the front edge of the raised rim the pills sit in
const KEY = [-0.5, -0.6, -0.62];   // unit vector toward the lamp: screen-left, screen-up, away from the lens
const RAKE = 0.42;   // cast shadows lean this many radians to the right of "straight toward the lens"
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** how much of the lamp reaches this stretch of the cake (U = px along the arc): strongest left of centre, dying to the right */
const keyAt = (U) => Math.exp(-Math.pow((U + 520) / 1000, 2));
/** honey at the rim sinking to amber toward the middle of the cake */
const bodyBase = (d) => 0.75 - 0.3 * L.smooth((d - 250) / 380);

// tone (0 = deep shadow … 1 = backlit edge) → colour
const WAX = [[0, '#0d0501'], [0.12, '#341804'], [0.26, '#673408'], [0.38, '#8a4b0f'], [0.5, '#bf780c'], [0.6, '#e09d14'],
  [0.7, '#f0b429'], [0.8, '#f9c744'], [0.88, '#ffd96f'], [0.95, '#ffe9a3'], [1, '#fff6d6']];
// two shells: paler, creamier wax and a yellower one; every pill is its own mix of the two
const SHELL_A = [[0, '#5e2a05'], [0.16, '#a04c0a'], [0.3, '#d27614'], [0.42, '#eb9a2a'], [0.54, '#f6bb52'], [0.66, '#fbd689'],
  [0.78, '#ffe7ab'], [0.9, '#fff2cc'], [1, '#fffbec']];
const SHELL_B = [[0, '#592704'], [0.16, '#9a4708'], [0.3, '#cf7010'], [0.42, '#ea961c'], [0.54, '#f5b236'], [0.66, '#f9c95c'],
  [0.78, '#fddc86'], [0.9, '#ffecb4'], [1, '#fff8e0']];
function toneLut(stops) {
  const f = L.makeRamp(stops), out = new Uint8ClampedArray(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = f(i / 1023); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
function mixLut(a, b, k) {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

// ── polar tone field → pixels ──────────────────────────────────────────────────────────────────────
/** evaluate fn(U, d) on a grid: dU px steps along the arc, 1 px steps in depth */
function polarGrid(env, reg, dMin, dMax, dU, fn) {
  const a = env.arc;
  const thMax = Math.atan2(W / 2 + PAD + 4, a.cy - (reg.y + reg.h)) + 0.012;
  const U0 = -thMax * a.R, nU = Math.ceil((2 * thMax * a.R) / dU) + 2, nD = Math.ceil(dMax - dMin) + 2;
  const T = new Float32Array(nU * nD);
  for (let j = 0; j < nD; j++) { const d = dMin + j; for (let i = 0; i < nU; i++) T[j * nU + i] = fn(U0 + i * dU, d); }
  return { U0, dU, nU, d0: dMin, nD, T };
}
/** paint the grid into a canvas covering `reg`, for depths dTop … dEnd (anti-aliased at dTop, faded out over `fade` px at dEnd) */
function rasterize(env, reg, grid, lut, dTop, dEnd, fade) {
  const a = env.arc, RW = reg.w, RH = reg.h;
  const img = new ImageData(RW, RH), px = img.data;
  const { U0, dU, nU, d0, nD, T } = grid;
  for (let j = 0; j < RH; j++) {
    const ddy = a.cy - (reg.y + j + 0.5);
    for (let i = 0; i < RW; i++) {
      const ddx = reg.x + i + 0.5 - a.cx;
      const d = a.R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < dTop - 0.5 || d > dEnd) continue;
      let al = d - dTop + 0.5; if (al > 1) al = 1;
      if (fade && d > dEnd - fade) al *= (dEnd - d) / fade;
      const fu = (Math.atan2(ddx, ddy) * a.R - U0) / dU;
      let fd = d - d0; if (fd < 0) fd = 0; else if (fd > nD - 1.001) fd = nD - 1.001;
      const iu = fu | 0, id = fd | 0, tu = fu - iu, td = fd - id, k = id * nU + iu;
      const t = (T[k] * (1 - tu) + T[k + 1] * tu) * (1 - td) + (T[k + nU] * (1 - tu) + T[k + nU + 1] * tu) * td;
      let li = (t * 1023) | 0; li = (li < 0 ? 0 : li > 1023 ? 1023 : li) * 3;
      const o = (j * RW + i) * 4;
      px[o] = lut[li]; px[o + 1] = lut[li + 1]; px[o + 2] = lut[li + 2]; px[o + 3] = al * 255;
    }
  }
  const c = L.makeCanvas(RW, RH);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// ── depth of field ────────────────────────────────────────────────────────────────────────────────
/**
 * The cake is a plane seen at a low angle, so distance from the lens is (nearly) a linear function of screen position:
 * s = (y − yF) − TILT·(x − cx) is 0 on the focal line and grows toward the lens. Blur grows with s; the layer is
 * cross-faded through three blurred copies of itself along that gradient (a true lerp, so edges soften instead of ghosting).
 */
const FOCUS_DY = 92, TILT = 0.14;
const DOF = [[1.9, 96, 196], [4.4, 196, 326], [8.5, 326, 510]];   // [blur px, s where it starts to take over, s where it has]
function depthOfField(env, reg, src) {
  const a = env.arc, fx = a.cx - reg.x, fy = a.crestY + FOCUS_DY - reg.y, gg = 1 + TILT * TILT;
  const out = L.makeCanvas(src.width, src.height), g = out.getContext('2d');
  g.drawImage(src, 0, 0);
  for (const [b, s0, s1] of DOF) {
    const bl = L.blurred(src, b), bg = bl.getContext('2d');
    const mask = (ctx) => L.linear(ctx, fx - (TILT * s0) / gg, fy + s0 / gg, fx - (TILT * s1) / gg, fy + s1 / gg, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    bg.globalCompositeOperation = 'destination-in'; bg.fillStyle = mask(bg); bg.fillRect(0, 0, bl.width, bl.height);
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = mask(g); g.fillRect(0, 0, out.width, out.height);
    g.globalCompositeOperation = 'lighter'; g.drawImage(bl, 0, 0);
  }
  g.globalCompositeOperation = 'source-over';
  return out;
}

/** local contrast, the "bite" of a real lens: overlay the layer with its own high-pass (0.5 + (image − blurred image) / 2) */
function clarity(c, px, amount) {
  const hp = L.makeCanvas(c.width, c.height), g = hp.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalAlpha = 0.5; g.globalCompositeOperation = 'source-atop'; g.filter = `invert(1) blur(${px}px)`;
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  return L.overlayOn(c, hp, { blend: 'overlay', alpha: amount });
}

// ── the pouring rings: a 1-D profile over depth ───────────────────────────────────────────────────
const D_MIN = -12, D_MAX = 720, DN = (D_MAX - D_MIN) * 2 + 1;
const prof = (arr, d) => { let f = (d - D_MIN) * 2; f = f < 0 ? 0 : f > DN - 1.001 ? DN - 1.001 : f; const i = f | 0; return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };
function ringProfile() {
  const ridge = new Float32Array(DN);
  // few and broad: one clear step, a faint companion, a softer one, and a wide one that will sit out of focus near the lens
  const rings = [{ d: LEDGE + 92, s: 1, w: 3.1, len: 36 }, { d: LEDGE + 109, s: 0.3, w: 2, len: 12 },
    { d: LEDGE + 206, s: 0.7, w: 3, len: 46 }, { d: LEDGE + 288, s: 1.15, w: 5.5, len: 60 }];
  for (let i = 0; i < DN; i++) {
    const x = D_MIN + i * 0.5;
    // each ring: a lip that catches the back light, and the shadow it throws on the layer below
    let v = 0;
    for (const k of rings) {
      const u = x - k.d;
      v += 0.26 * k.s * Math.exp(-(u * u) / (k.w * k.w));
      if (u > 0) v -= 0.2 * k.s * Math.exp(-u / k.len) * (1 - Math.exp(-u / 2.2)) + 0.03 * k.s * sstep(0, 40, u);   // … and each layer sits a shade deeper
      else v += 0.08 * k.s * Math.exp(u / 22);
    }
    ridge[i] = v;
  }
  return ridge;
}

// ── shadows the pills throw toward the lens, each with a pool of warm light that came through the ball ─────────────
function castShadows(g, a, pills) {
  const disc = (rad) => { g.beginPath(); g.arc(0, 0, rad, 0, L.TAU); g.fill(); };
  const foot = (p) => { g.translate(0, p.top + p.r + (p.sink + p.sb * 0.5) * p.r); g.rotate(-(RAKE + p.th)); };
  g.globalCompositeOperation = 'multiply';
  for (const p of pills) a.at(g, p.th, 0, () => {
    foot(p);
    const len = p.r * p.sh;
    g.save(); g.translate(0, len * 0.4); g.scale((p.r * 0.96) / 100, (len * 0.74) / 100);
    g.fillStyle = L.radial(g, 0, 0, 0, 100, [[0, 'rgba(104,46,6,0.6)'], [0.5, 'rgba(118,58,8,0.32)'], [1, 'rgba(132,68,10,0)']]);
    disc(100); g.restore();
    g.translate(0, p.r * 0.06); g.scale((p.r * 0.84) / 100, (p.r * 0.3) / 100);
    g.fillStyle = L.radial(g, 0, 0, 0, 100, [[0, 'rgba(80,32,4,0.72)'], [0.55, 'rgba(92,40,5,0.34)'], [1, 'rgba(100,46,6,0)']]);
    disc(100);
  });
  g.globalCompositeOperation = 'screen';
  // between the pills the lamp gets through and lies on the wax in lanes
  for (let i = 0; i < pills.length - 1; i++) {
    const p0 = pills[i], p1 = pills[i + 1];
    const e0 = p0.th + p0.r / a.R, e1 = p1.th - p1.r / a.R, gap = (e1 - e0) * a.R, len = 250 + gap * 1.5;
    a.at(g, (e0 + e1) / 2, 0, () => {
      g.translate(0, 34 + Math.min(p0.top, p1.top)); g.rotate(-(RAKE + (e0 + e1) / 2));
      g.translate(0, len * 0.4); g.scale((16 + gap * 0.62) / 100, (len * 0.62) / 100);
      const k = 0.2 + 0.2 * L.clamp(gap / 50);
      g.fillStyle = L.radial(g, 0, 0, 0, 100, [[0, `rgba(255,222,132,${k})`], [0.45, `rgba(255,204,96,${k * 0.5})`], [1, 'rgba(250,180,60,0)']]);
      disc(100);
    });
  }
  for (const p of pills) a.at(g, p.th, 0, () => {
    foot(p);
    g.translate(0, p.r * 0.44); g.scale((p.r * 0.5) / 100, (p.r * 0.3) / 100);
    g.fillStyle = L.radial(g, 0, 0, 0, 100, [[0, `rgba(255,158,46,${0.5 * p.glow})`], [0.5, `rgba(250,132,30,${0.2 * p.glow})`], [1, 'rgba(240,120,20,0)']]);
    disc(100);
  });
  g.globalCompositeOperation = 'source-over';
}

// ── the cake ──────────────────────────────────────────────────────────────────────────────────────
function buildBody(env, reg, lut, pills) {
  const a = env.arc, nA = L.makeNoise('s02a'), nB = L.makeNoise('s02b');
  const ridge = ringProfile();
  const grid = polarGrid(env, reg, 20, a.R - (a.cy - (reg.y + reg.h)) + 12, 6, (U, d) => {
    // hand-poured: the rings wander, more so deep in the cake
    const wob = (nA.n2(U / 520 + 3.1, d / 300) * 0.7 + nA.n2(U / 190 - 8, d / 160 + 5) * 0.3) * (5 + 10 * sstep(260, 520, d));
    const dd = d + wob;
    let t = bodyBase(dd) - (dd > LEDGE - 2 ? 0.28 * Math.exp(-(dd - LEDGE + 2) / 16) : 0);   // … and the shaded riser under the shelf
    t += prof(ridge, dd) * (0.5 + 0.62 * nB.n2(U / 330 + 7.7, dd / 150));                    // a ring is strong here, nearly gone there
    t += 0.085 * nB.fbm(U / 300 + 11, d / 190 - 3, 3) + 0.036 * nA.fbm(U / 85 + 2, d / 60 + 8, 2);   // cloudiness inside the wax
    t += 0.02 * nA.n2(U / 640, dd / 15 + 40);                                                  // flow streaks drawn out along the rings
    t += 0.075 * keyAt(U) * sstep(LEDGE + 8, LEDGE + 70, d) * (1 - 0.6 * sstep(300, 560, d));  // glancing light off the top of the cake
    return t;
  });
  const c = rasterize(env, reg, grid, lut, 30, 1e9, 0);
  const g = c.getContext('2d');
  g.translate(-reg.x, -reg.y);
  g.save(); a.clipBelow(g, -34);
  // the cake turns away from the lamp toward the right and sinks to amber-brown deep down
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.radial(g, a.cx - 260, a.crestY + 230, 420, 1650, [[0, '#ffffff'], [0.5, '#efd2a4'], [1, '#b98549']]);
  g.fillRect(reg.x, reg.y, reg.w, reg.h);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 780, a.R - 430, [[0, '#c98e48'], [1, '#ffffff']]);
  g.fillRect(reg.x, reg.y, reg.w, reg.h);
  castShadows(g, a, pills);
  // specks of pollen and propolis caught in the wax
  L.speckle(g, { seed: 's02speck', count: 380, x: reg.x, y: reg.y, w: reg.w, h: reg.h, rMin: 0.6, rMax: 2.3, colors: ['#5a2a05', '#7a3a08', '#3a1803'], alpha: [0.12, 0.5], test: (x, y) => a.drAt(x, y) < -LEDGE - 14 });
  L.speckle(g, { seed: 's02speck2', count: 130, x: reg.x, y: reg.y, w: reg.w, h: reg.h, rMin: 0.6, rMax: 1.6, colors: ['#fff0bd', '#ffe08a'], alpha: [0.15, 0.55], test: (x, y) => a.drAt(x, y) < -LEDGE - 14 });
  // hairline scuffs in the skin of the wax
  const rs = L.rng('s02scuff');
  g.lineCap = 'round';
  for (let n = 0; n < 16; n++) {
    const th = rs.range(-0.36, 0.36), d = rs.range(LEDGE + 30, 430), len = rs.range(50, 190), ang = rs.range(-0.5, 0.5), bow = rs.range(-14, 14);
    a.at(g, th, -d, () => {
      g.rotate(ang);
      g.strokeStyle = rs.chance(0.6) ? `rgba(255,236,170,${rs.range(0.08, 0.2)})` : `rgba(110,52,6,${rs.range(0.08, 0.18)})`;
      g.lineWidth = rs.range(0.7, 1.5);
      g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, bow, len / 2, rs.range(-4, 4)); g.stroke();
    });
  }
  // a few air bubbles: dark refracting rim, light gathered on the side away from the lamp
  const r = L.rng('s02bub');
  let cth = 0, cd = 300;
  for (let n = 0; n < 14; n++) {
    if (n % 4 === 0) { cth = r.range(-0.12, 0.36); cd = r.range(LEDGE + 40, 330); }
    const th = cth + r.gauss() * 0.022, d = L.clamp(cd + r.gauss() * 34, LEDGE + 26, 470), rad = 2.4 + Math.pow(r(), 2.2) * 9;
    a.at(g, th, -d, () => {
      g.rotate(-th);
      g.fillStyle = L.radial(g, 0, 0, rad * 0.55, rad * 1.25, [[0, 'rgba(84,36,4,0)'], [0.6, 'rgba(84,36,4,0.5)'], [1, 'rgba(84,36,4,0)']]);
      g.beginPath(); g.arc(0, 0, rad * 1.25, 0, L.TAU); g.fill();
      g.fillStyle = L.radial(g, rad * 0.25, rad * 0.4, 0, rad, [[0, 'rgba(255,238,170,0.85)'], [0.55, 'rgba(255,208,96,0.3)'], [1, 'rgba(255,200,80,0)']]);
      g.beginPath(); g.arc(0, 0, rad, 0, L.TAU); g.fill();
      g.fillStyle = L.radial(g, -rad * 0.25, -rad * 0.45, 0, rad * 0.8, [[0, 'rgba(96,42,5,0.5)'], [1, 'rgba(96,42,5,0)']]);
      g.beginPath(); g.arc(0, 0, rad, 0, L.TAU); g.fill();
      g.fillStyle = 'rgba(255,250,228,0.85)';
      g.beginPath(); g.ellipse(-rad * 0.34, -rad * 0.46, Math.max(0.6, rad * 0.2), Math.max(0.45, rad * 0.12), -0.6, 0, L.TAU); g.fill();
    });
  }
  g.restore();
  return depthOfField(env, reg, clarity(c, 5, 0.55));
}

// ── the pills ─────────────────────────────────────────────────────────────────────────────────────
function layoutPills(env) {
  const a = env.arc, r = L.rng('s02pills-c'), s = a.span(PAD + 150), out = [];
  let th = -s, prev = 0;
  while (th < s) {
    const rad = 68 + 46 * Math.pow(r(), 1.25);
    th += (prev + rad + (r.chance(0.28) ? r.range(1, 5) : r.range(12, 54))) / a.R;   // some shoulder to shoulder, some apart
    const small = L.clamp((114 - rad) / 46);
    // the wax closes round each ball a little below its waist: a circle on the sphere, seen from just above → a flat ellipse
    const h = r.range(0.42, 0.62), rho = Math.sqrt(1 - h * h);
    out.push({
      th, r: rad,
      top: L.clamp(-3 + 20 * small * r() + r.range(-2, 3), -5, 30),          // crown relative to the arc (px inward; < 0 stands just proud of it)
      tilt: r.chance(0.22) ? r.range(-0.75, 0.75) : r.gauss() * 0.14,          // how the seam is turned …
      elev: r.range(0.08, 0.42),                                               // … and tipped toward the lens
      sink: h * 0.987, sa: rho, sb: rho * 0.19 * r.range(0.8, 1.3),
      sh: r.range(1.25, 1.75), glow: r.range(0.6, 1.1),
      tone: r.range(-0.03, 0.03), hue: r(), sq: r.range(0.975, 1.03), seed: out.length, gloss: r.range(0.6, 1.15),
      dents: Array.from({ length: r.int(1, 3) }, () => { const an = r.range(0, L.TAU), di = r.range(0.15, 0.7); return { x: Math.cos(an) * di, y: Math.sin(an) * di - 0.1, s: r.range(0.1, 0.24), a: r.range(-0.03, 0.055) }; }),
    });
    prev = rad;
  }
  out.forEach((p, i) => {
    const near = (q) => (q ? L.clamp(1 - ((Math.abs(q.th - p.th) * a.R - q.r - p.r) / 14)) : 0);
    p.nearL = near(out[i - 1]); p.nearR = near(out[i + 1]);
  });
  // compose: one pill just left of the crest
  let best = out[0];
  for (const p of out) if (Math.abs(p.th) < Math.abs(best.th)) best = p;
  const shift = -0.019 - best.th;
  for (const p of out) p.th += shift;
  return out;
}
/**
 * One wax-shell pill, shaded per pixel as a translucent hollow ball lit from behind (local frame: −y = out, away from the cake).
 * The lamp-side limb takes the light directly; light that soaks on through the shell comes out cream, then warmer the further
 * round it has to go; opposite the lamp the pill inside blocks it and the wax falls to amber, lifted again underneath by the
 * glow of the cake. Matte: the only reflection is a broad soft sheen.
 */
function buildPill(p, lut) {
  const SS = 1.5, r = p.r, m = 4, half = r + m, N = Math.ceil(half * 2 * SS);
  const img = new ImageData(N, N), px = img.data;
  const nz = L.makeNoise('s02pill' + p.seed);
  // the lamp, brought into this pill's frame
  const ct = Math.cos(p.th), st = Math.sin(p.th);
  const lx = KEY[0] * ct + KEY[1] * st, ly = -KEY[0] * st + KEY[1] * ct, lz = KEY[2];
  const l2 = Math.hypot(lx, ly), ux = lx / l2, uy = ly / l2;
  // the seam: a great circle whose plane normal is "up", tipped toward the lens by elev and rolled by tilt
  const ce = Math.cos(p.elev), mx = ce * Math.sin(p.tilt), my = -ce * Math.cos(p.tilt), mz = Math.sin(p.elev);
  const seat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (((i + 0.5) / SS - half) / r) * p.sq, ax = x / p.sa;
    seat[i] = p.sink + (ax * ax < 1 ? p.sb * Math.sqrt(1 - ax * ax) : 0) + 0.01 * nz.n2(x * 2.2 + p.seed * 3.7, 0.5);   // the wax of the rim closes unevenly round the foot
  }
  for (let j = 0; j < N; j++) {
    const y = ((j + 0.5) / SS - half) / r;
    for (let i = 0; i < N; i++) {
      const x = (((i + 0.5) / SS - half) / r) * p.sq, q = x * x + y * y;
      if (q > 1.06) continue;
      const rho = Math.sqrt(q);
      const s0 = rho > 1e-3 ? (x * mx + y * my) / rho : 1;
      const lump = rho > 1e-3 ? 0.011 * nz.n2((x / rho) * 1.25 + 31, (y / rho) * 1.25 - 17) : 0;   // hand-dipped: not quite round
      let cov = (1 + lump + 0.011 * Math.exp(-(s0 * s0) / 0.005) - rho) * r * SS + 0.5;   // the sealing band stands a hair proud of the outline
      if (cov <= 0) continue; if (cov > 1) cov = 1;
      const yc = seat[i];
      let vis = ((yc - y) * r * SS) / 2.4 + 0.5;
      if (vis <= 0) continue; if (vis > 1) vis = 1;
      const z = q < 1 ? Math.sqrt(1 - q) : 0;
      const k = 1 / (0.6 + z), su = x * k, sv = y * k;                         // surface coordinates that crowd toward the limb, as on a ball
      const w1 = nz.n2(su * 2.1 + 11, sv * 2.1 - 3), w2 = nz.n2(su * 2.1 - 7, sv * 2.1 + 19);
      const nx = x + 0.045 * w1, ny = y + 0.045 * w2;                          // the shell is not quite true: the light wavers on it
      const ndl = nx * lx + ny * ly + z * lz, gl = nx * ux + ny * uy;          // gl: −1 … 1 across the ball, toward the lamp
      const lit = sstep(-0.1, 0.62, ndl);
      let t = 0.62 + 0.22 * gl + 0.27 * lit + p.tone;                          // light soaking through from the lamp side; the limb takes it directly
      t += 0.09 * (1 - z) * (1 - z) * sstep(-0.7, 0.3, gl);                    // the limb is thin wax and lets it through
      const cx = x + 0.2 * ux, cy = y + 0.2 * uy;
      t -= 0.12 * sstep(0.8, 0.22, Math.sqrt(cx * cx + cy * cy)) * z;          // the pill inside, a darker heart
      for (const dn of p.dents) {                                              // thumb-flats and dings: the wall facing the lamp lights, the other shades
        const ex = x - dn.x, ey = y - dn.y, e = Math.exp(-(ex * ex + ey * ey) / (dn.s * dn.s));
        t -= dn.a * ((ex * ux + ey * uy) / dn.s) * e;
      }
      t -= 0.1 * (p.nearL * sstep(-0.45, -1, x) + p.nearR * sstep(0.45, 1, x));   // a close neighbour takes light off that flank
      let f = 0.4 * nx - 0.28 * ny + 0.87 * z; if (f < 0) f = 0;
      t += 0.05 * f * f;                                                       // faint fill from the front right
      t += 0.09 * sstep(0.2, 0.95, y) * (1 - 0.55 * z);                        // the lit cake glows up into the underside
      const hx = nx - 0.42 * ux, hy = ny - 0.42 * uy, hb = hx * ux + hy * uy, ha = hx * uy - hy * ux;
      const sheen = Math.exp(-(ha * ha) / 0.085 - (hb * hb) / 0.016) * (0.76 + 0.36 * w2) * (0.88 + 0.24 * nz.n2(su * 9 + 2, sv * 9));   // soft reflection of the lamp, stretched round the ball
      t += 0.05 * sheen;
      t -= 0.1 * (1 - z) * (1 - z) * (1 - z) * sstep(0.1, -0.6, gl);           // the far limb turns away
      t -= 0.13 * sstep(0.22, 0, yc - y);                                      // contact shadow where it sinks into the rim
      const sd = x * mx + y * my + z * mz, sw = 0.02 * (1 + 0.45 * nz.n2(su * 3 + 5, sv * 3 + 1));
      t -= 0.24 * (0.72 + 0.28 * w1) * Math.exp(-(sd * sd) / (sw * sw));       // the seam …
      const e2 = sd - 2.3 * sw; t += 0.06 * Math.exp(-(e2 * e2) / (3 * sw * sw));   // … and its lit lip
      t += 0.032 * nz.fbm(su * 2.2 + 9, sv * 2.2 - 4, 2) + 0.012 * nz.n2(su * 12, sv * 12 + 7);
      let li = (t * 1023) | 0; li = (li < 0 ? 0 : li > 1023 ? 1023 : li) * 3;
      const o = (j * N + i) * 4;
      const wh = 62 * sheen * p.gloss;                                         // the reflection is the lamp's own white, not the wax's yellow
      px[o] = lut[li] + wh; px[o + 1] = lut[li + 1] + wh; px[o + 2] = lut[li + 2] + wh * 0.94; px[o + 3] = 255 * cov * vis;
    }
  }
  const c = L.makeCanvas(N, N), g = c.getContext('2d');
  g.putImageData(img, 0, 0);
  // what a macro lens finds on any waxed surface: hairline scuffs and a little dust
  const rr = L.rng('s02skin' + p.seed), R = r * SS;
  g.globalCompositeOperation = 'source-atop';
  g.translate(N / 2, N / 2); g.lineCap = 'round';
  for (let n = 0; n < 5; n++) {
    const a0 = rr.range(0, L.TAU), cr = R * rr.range(0.9, 2.2), ox = Math.cos(a0) * cr * 0.8, oy = Math.sin(a0) * cr * 0.8, a1 = a0 + Math.PI + rr.range(-0.5, 0.5);
    g.strokeStyle = rr.chance(0.65) ? `rgba(255,248,222,${rr.range(0.07, 0.17)})` : `rgba(150,78,14,${rr.range(0.06, 0.14)})`;
    g.lineWidth = rr.range(0.7, 1.4) * SS;
    g.beginPath(); g.arc(ox, oy, cr, a1 - rr.range(0.1, 0.35), a1 + rr.range(0.1, 0.35)); g.stroke();
  }
  for (let n = 0; n < 9; n++) {
    const a0 = rr.range(0, L.TAU), d = R * Math.sqrt(rr()) * 0.92, rad = rr.range(0.5, 1.5) * SS;
    g.fillStyle = rr.chance(0.7) ? `rgba(255,251,234,${rr.range(0.3, 0.75)})` : `rgba(120,58,8,${rr.range(0.2, 0.45)})`;
    g.beginPath(); g.arc(Math.cos(a0) * d, Math.sin(a0) * d, rad, 0, L.TAU); g.fill();
  }
  return { c, half };
}
/** the travelling highlight: the lamp-side limb flaring, plus a soft bloom on the shoulder (unit sprite, scaled per pill) */
function buildHighlight() {
  const N = 240, R = N / 2 - 4, img = new ImageData(N, N), px = img.data;
  const l2 = Math.hypot(KEY[0], KEY[1]), ux = KEY[0] / l2, uy = KEY[1] / l2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5 - N / 2) / R, y = (j + 0.5 - N / 2) / R, q = x * x + y * y;
    if (q >= 1) continue;
    const z = Math.sqrt(1 - q), bx = x - 0.46 * ux, by = y - 0.46 * uy;
    let al = 0.95 * Math.pow(1 - z, 1.5) * sstep(-0.15, 0.75, x * ux + y * uy) + 0.7 * Math.exp(-(bx * bx + by * by) / 0.085);
    al = L.clamp(al) * L.clamp((1 - Math.sqrt(q)) * R);
    const o = (j * N + i) * 4;
    px[o] = 255; px[o + 1] = 247; px[o + 2] = 214; px[o + 3] = al * 255;
  }
  const c = L.makeCanvas(N, N);
  c.getContext('2d').putImageData(img, 0, 0);
  c._k = N / 2 / R;   // sprite half-size in pill radii
  return c;
}

// ── the raised rim with the pills in it ───────────────────────────────────────────────────────────
function buildTop(env, reg, pills, lut) {
  const a = env.arc, nA = L.makeNoise('s02c'), nB = L.makeNoise('s02d');
  const grid = polarGrid(env, reg, -2, LEDGE + 34, 4, (U, d) => {
    const key = keyAt(U), dd = d < 0 ? 0 : d;
    const thick = 0.5 + 0.5 * nA.fbm(U / 240 + 20, 3.3, 3);                              // the lip is thicker here, thinner there
    const dl = d - LEDGE - 7 * nA.n2(U / 260 + 5, 7.7) - 1.2 * nB.n2(U / 60, 1.1);       // depth past the (hand-made, wandering) front edge of the shelf
    if (dl > 0) return bodyBase(d) - 0.28 * Math.exp(-dl / 16) + 0.03 * nB.n2(U / 120, d / 40);   // the riser, in shade
    let t = 0.36 + 0.05 * key;                                                           // the inside of the lip: deep amber, seen only by the light that soaks through it
    t += (0.5 + 0.12 * key) * Math.exp(-dd / (3.5 + 6 * thick));                         // the thin edge lets the back light straight through
    t += 0.13 * Math.exp(-dd / (20 + 18 * thick));
    t += 0.045 * nB.n2(U / 34 + 3, d / 150 + 1) * sstep(4, 30, d);                        // runs of wax down the inside of the lip
    const glare = sstep(-0.3, 0.6, nB.n2(U / 260 + 40, d / 52 + 3));                    // the shelf is not flat: the glancing light lies on it in streaks
    t += (0.15 + 0.07 * key * glare + 0.02 * glare) * sstep(56, 130, d);                   // the shelf turns up into that light
    t += 0.05 * nA.fbm(U / 130 + 20, d / 80 + 9, 3);                                      // cloudy wax
    t += 0.06 * sstep(-46, -5, dl);
    return t + (0.24 + 0.16 * key) * Math.exp(-(dl * dl) / 11) * (0.3 + 0.7 * sstep(-0.35, 0.4, nB.n2(U / 150 + 9, 2.2)));   // the rounded front edge catches the lamp, brokenly
  });
  const c = rasterize(env, reg, grid, lut, 0, LEDGE + 30, 12);
  const g = c.getContext('2d');
  g.translate(-reg.x, -reg.y);

  g.save(); a.clipBelow(g, 0);
  // the wax is pressed up round the foot of each pill: a shaded hollow on the lens side
  g.globalCompositeOperation = 'multiply';
  for (const p of pills) a.at(g, p.th, 0, () => {
    g.translate(0, p.top + p.r + p.sink * p.r); g.scale((p.r * 1.28) / 100, (p.r * 0.6) / 100);
    g.fillStyle = L.radial(g, 0, 0, 0, 100, [[0, 'rgba(110,48,6,0.6)'], [0.5, 'rgba(110,48,6,0.36)'], [1, 'rgba(110,48,6,0)']]);
    g.beginPath(); g.arc(0, 0, 100, 0, L.TAU); g.fill();
  });
  castShadows(g, a, pills);
  L.speckle(g, { seed: 's02shelf', count: 420, x: reg.x, y: reg.y, w: reg.w, h: reg.h, rMin: 0.5, rMax: 1.8, colors: ['#5a2a05', '#7a3a08', '#fff0bd', '#ffe08a'], alpha: [0.12, 0.5], test: (x, y) => { const d = -a.drAt(x, y); return d > 24 && d < LEDGE - 6; } });
  g.restore();

  // the pills, then the wax meniscus that climbs each one
  for (const p of pills) a.at(g, p.th, 0, () => {
    const sp = buildPill(p, mixLut(S.shellA, S.shellB, p.hue));
    g.drawImage(sp.c, -sp.half, p.top + p.r - sp.half, sp.half * 2, sp.half * 2);
    const cy = p.top + p.r + p.sink * p.r, rx = (p.sa * p.r) / p.sq;
    g.lineCap = 'round';
    g.strokeStyle = `rgba(255,196,96,${0.18 * p.glow})`; g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, cy + 3, rx, p.sb * p.r, 0, 0.5, Math.PI - 0.35); g.stroke();
    g.strokeStyle = `rgba(255,216,134,${0.4 * p.glow})`; g.lineWidth = 1.3;
    g.beginPath(); g.ellipse(0, cy + 1.8, rx, p.sb * p.r, 0, 0.6, Math.PI - 0.8); g.stroke();
  });
  // the very edge of the lip is ragged at this scale: beads and nicks of wax that catch the lamp
  const rb = L.rng('s02beads'), sp = a.span(PAD);
  g.save(); a.clipBelow(g, 0); g.globalCompositeOperation = 'screen';
  for (let n = 0; n < 150; n++) {
    const th = rb.range(-sp, sp), len = rb.range(3, 22) * (rb.chance(0.15) ? 2.2 : 1), k = rb.range(0.25, 0.85) * (0.45 + 0.55 * keyAt(th * a.R));
    a.at(g, th, -rb.range(0.6, 3.2), () => {
      g.scale(len / 10, rb.range(0.8, 1.9) / 10);
      g.fillStyle = L.radial(g, 0, 0, 0, 10, [[0, `rgba(255,252,236,${k})`], [0.5, `rgba(255,236,170,${k * 0.5})`], [1, 'rgba(255,220,130,0)']]);
      g.beginPath(); g.arc(0, 0, 10, 0, L.TAU); g.fill();
    });
  }
  g.restore();
  return depthOfField(env, reg, clarity(c, 4, 0.5));
}

/** bloom: only the hot parts of the rim (lip, lit limbs, shelf edge), blurred wide at half size */
function buildBloom(reg, top) {
  const up = 110, k = 0.5;
  const c = L.makeCanvas(reg.w * k, (reg.h + up) * k), g = c.getContext('2d');
  g.filter = 'brightness(0.6) contrast(2.7) blur(10px)';
  g.drawImage(top, 0, up * k, reg.w * k, reg.h * k);
  g.filter = 'none';
  return { c, x: reg.x, y: reg.y - up, w: reg.w, h: reg.h + up };
}

// ── dust in the black ─────────────────────────────────────────────────────────────────────────────
function dustSprite(stops) {
  const c = L.makeCanvas(64, 64), g = c.getContext('2d');
  g.fillStyle = L.radial(g, 32, 32, 0, 32, stops); g.fillRect(0, 0, 64, 64);
  return c;
}
function buildDust(env) {
  const a = env.arc, r = L.rng('s02dust-b'), nz = L.makeNoise('s02dustn'), out = [];
  for (let guard = 0; out.length < 92 && guard < 8000; guard++) {
    const x = r.range(-40, W + 40), y = r.range(-30, 770);
    const top = a.yAt(L.clamp(x, 0, W));
    if (y > top - 24) continue;
    // dust hangs in drifts, thicker on the lamp side; the pocket above the crest stays almost empty
    if (r() > 0.42 + 0.5 * nz.fbm(x / 420, y / 300, 2) + 0.28 * (1 - x / W)) continue;
    const ex = (x - a.cx) / 440, ey = (y - (a.crestY - 150)) / 215;
    if (ex * ex + ey * ey < 1 && !r.chance(0.08)) continue;
    const u = r(), kind = u < 0.5 ? 0 : u < 0.82 ? 1 : 2;      // in the focal plane · a little out of it · far out of it
    const s = kind === 0 ? r.range(4, 11) : kind === 1 ? r.range(8, 22) : r.range(16, 44);
    const lit = 0.45 + 0.55 * Math.exp(-(top - y) / 300);       // motes near the rim catch more of the back light
    out.push({ x, y, s, kind, a: (kind === 0 ? r.range(0.4, 1) : kind === 1 ? r.range(0.14, 0.42) : r.range(0.06, 0.15)) * lit,
      rise: (kind === 2 ? 26 : 9) + s * r.range(0.4, 1.1), sway: r.range(-5, 5), ph: r(), fq: r.range(0.55, 1.6) });
  }
  return out;
}

export default {
  name: '蜡丸',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const y0 = Math.floor(a.crestY) - 26;
    const reg = { x: -PAD, y: y0, w: W + PAD * 2, h: H + PADB - y0 };
    S = { reg, shellA: toneLut(SHELL_A), shellB: toneLut(SHELL_B) };
    const waxLut = toneLut(WAX);
    S.pills = layoutPills(env).filter((p) => Math.abs(a.pt(p.th, 0).x - a.cx) < W / 2 + PAD + p.r + 12);
    S.body = buildBody(env, reg, waxLut, S.pills);
    S.top = buildTop(env, reg, S.pills, waxLut);
    S.bloom = buildBloom(reg, S.top);
    S.hl = buildHighlight();
    S.dust = buildDust(env);
    S.sprites = [
      dustSprite([[0, 'rgba(255,248,228,1)'], [0.16, 'rgba(255,234,178,0.8)'], [0.45, 'rgba(250,204,120,0.16)'], [1, 'rgba(250,190,90,0)']]),
      dustSprite([[0, 'rgba(255,236,186,0.75)'], [0.45, 'rgba(255,222,150,0.4)'], [1, 'rgba(250,200,110,0)']]),
      dustSprite([[0, 'rgba(255,226,156,0.5)'], [0.68, 'rgba(255,216,136,0.5)'], [0.85, 'rgba(255,228,164,0.68)'], [1, 'rgba(255,210,120,0)']]),
    ];
    // the black is never quite empty: a breath of lit haze, mostly on the lamp side
    S.haze = L.noiseTex(W, 760, { seed: 's02haze', scale: 560, octaves: 3, res: 0.125, warp: 0.5, ramp: [[0, 'rgba(30,24,18,0)'], [0.55, 'rgba(30,24,18,0)'], [1, 'rgba(44,36,28,0.2)']] });
  },
  draw(ctx, env, p) {
    const a = env.arc, reg = S.reg;
    const rot = L.lerp(-0.011, 0.011, p);       // pills and rim slide along the arc
    const sw = L.lerp(-0.34, 0.34, p);          // where the travelling light is (theta on screen)
    ctx.fillStyle = '#050403'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(S.haze, 0, 0);
    // the back light catching the air just over the rim — more of it toward the lamp
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 2, a.R + 120, [[0, 'rgba(255,160,40,0.3)'], [0.1, 'rgba(232,120,20,0.12)'], [0.4, 'rgba(170,76,10,0.03)'], [1, 'rgba(110,44,4,0)']]);
    ctx.fillRect(0, 0, W, H);
    const lamp = a.pt(-0.2 + rot, 0);
    ctx.fillStyle = L.radial(ctx, lamp.x, lamp.y, 0, 640, [[0, 'rgba(255,170,56,0.16)'], [0.3, 'rgba(226,122,24,0.05)'], [1, 'rgba(120,50,6,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // dust: drifts up, flickers
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const m of S.dust) {
      const tw = 0.5 + 0.5 * Math.sin(L.TAU * (m.ph + p * m.fq));
      const x = m.x + m.sway * Math.sin(L.TAU * (m.ph * 3 + p * 0.5)), y = m.y - m.rise * p;
      ctx.globalAlpha = m.a * (0.4 + 0.6 * tw);
      ctx.drawImage(S.sprites[m.kind], x - m.s, y - m.s, m.s * 2, m.s * 2);
    }
    ctx.restore();
    // the cake: its rings lie inside the wax, so they turn less than the rim
    L.cam(ctx, env, { rot: rot * 0.6 }, () => ctx.drawImage(S.body, reg.x, reg.y));
    ctx.save(); a.clipBelow(ctx, -LEDGE); ctx.globalCompositeOperation = 'soft-light';
    const sp = a.pt(sw, -330);
    ctx.fillStyle = L.radial(ctx, sp.x, sp.y, 0, 540, [[0, 'rgba(255,240,190,0.5)'], [1, 'rgba(255,240,190,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // the rim and its pills, the highlight passing over one after another, and the bloom
    L.cam(ctx, env, { rot }, () => {
      ctx.drawImage(S.top, reg.x, reg.y);
      ctx.globalCompositeOperation = 'screen';
      for (const q of S.pills) {
        const u = (q.th + rot - sw) / 0.085, w = Math.exp(-u * u);
        if (w < 0.02) continue;
        const s = q.r * S.hl._k;
        a.at(ctx, q.th, 0, () => { ctx.translate(0, q.top + q.r); ctx.rotate(-q.th - rot); ctx.globalAlpha = 0.8 * w; ctx.drawImage(S.hl, -s, -s, s * 2, s * 2); });
      }
      ctx.globalAlpha = 0.55;
      ctx.drawImage(S.bloom.c, S.bloom.x, S.bloom.y, S.bloom.w, S.bloom.h);
    });
    // a glint riding the lip with the light
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, sw, 0, () => {
      ctx.scale(3.4, 0.52);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 100, [[0, 'rgba(255,214,130,0.3)'], [0.4, 'rgba(255,176,70,0.11)'], [1, 'rgba(240,140,30,0)']]);
      ctx.fillRect(-100, -100, 200, 200);
    });
    ctx.restore();
    L.vignette(ctx, { strength: 0.3 });
  },
};
