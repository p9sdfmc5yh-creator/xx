// s30 — 娇黄釉与白地黑花. Two pots, one behind the other, shot in macro.
// The arc is the shoulder silhouette of a Cizhou jar in the foreground, edged by one fine black line. Below it: cream slip painted
// in iron black with a loaded brush — rows of water ripples that hug the arc, then a band of scrolling tendrils (卷草) — under a
// thin clear glaze with fine crazing. Above it: the face of a 娇黄 (egg-yolk yellow) dish, plain, even and bright.
//
// The painting is laid out on the unrolled surface of the jar (U = px along the arc, V = px down the wall from the silhouette) and
// every brush outline is pushed through map(U, V): the shoulder is a quarter-turn of radius RV, so rows crowd together toward the
// silhouette exactly as they do on a round pot. Ink is first painted as a density mask; a LUT then turns density into colour
// (thin = iron brown, loaded = black), which gives brown fringes, brown dry-brush and black pooled heads for free.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 140;
const RV = 700, QS = (RV * Math.PI) / 2;   // radius of the shoulder's turn (surface px); below a quarter turn the wall is straight
const UM = 1440;                           // half-extent of the painting along the arc
const NZ = L.makeNoise('s30brush');
let S = null;

const dOfV = (v) => (v < QS ? RV * (1 - Math.cos(v / RV)) : RV + (v - QS));   // surface distance → screen px below the arc
const comp = (v) => (v < QS ? Math.max(0.06, Math.sin(v / RV)) : 1);          // radial foreshortening at V
const full = (g) => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);

// ───────────────────────── brushwork ─────────────────────────
/**
 * One stroke of a round brush, drawn on the unrolled surface and mapped onto the pot.
 * pts [[U,V]…]; w = full width; head = extra swell where the loaded brush lands; tail = fraction over which it lifts off;
 * slope = press on the way down / lift on the way up; dry = amount of flying-white in the tail; fw = flying-white line scale.
 */
function brush(g, map, pts, o = {}) {
  const { w = 24, seed = 1, head = 0.25, tail = 0.3, slope = 0, dry = 0.5, alpha = 0.92, rough = 1, fw = 1, end = 0, mid = 0, point = false } = o;
  const P = L.smoothPath(pts, 5), n = P.length;
  if (n < 4) return;
  const len = new Float32Array(n);
  for (let i = 1; i < n; i++) len[i] = len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const tot = len[n - 1], cap = w * (point ? 1.5 : 0.5), sd = seed * 1.618;
  const A = new Array(n), B = new Array(n);
  let iHead = n - 1;
  for (let i = 0; i < n; i++) {
    const p0 = P[i > 0 ? i - 1 : 0], p1 = P[i < n - 1 ? i + 1 : n - 1];
    let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const s = len[i], t = s / tot;
    if (s > w * 1.7 && iHead === n - 1) iHead = i;
    let wv = 1;
    if (s < cap) { const q = 1 - s / cap; wv *= point ? 0.1 + 0.9 * Math.pow(s / cap, 0.75) : 0.12 + 0.88 * Math.sqrt(1 - q * q); }   // the tip lands first, or a blunt round landing
    const hd = (s - 0.6 * w) / (0.9 * w); wv *= 1 + head * Math.exp(-hd * hd);            // the loaded head swells
    if (t > 1 - tail) wv *= end + (1 - end) * Math.pow((1 - t) / tail, 0.8);              // lifting off
    wv *= L.clamp(1 + slope * ty, 0.5, 1.7);
    wv *= 1 + 0.2 * NZ.n2(s / 120 + sd, sd * 0.7);
    const hw = Math.max(0.5, (w * wv) / 2);
    const j1 = rough * NZ.n2(s / 7 + sd * 3, 5.5), j2 = rough * NZ.n2(s / 7 - sd * 2, 91.5);
    A[i] = map(P[i][0] - ty * (hw + j1), P[i][1] + tx * (hw + j1));
    B[i] = map(P[i][0] + ty * (hw + j2), P[i][1] - tx * (hw + j2));
  }
  const poly = (i0, i1) => {
    g.beginPath(); g.moveTo(A[i0][0], A[i0][1]);
    for (let i = i0 + 1; i <= i1; i++) g.lineTo(A[i][0], A[i][1]);
    for (let i = i1; i >= i0; i--) g.lineTo(B[i][0], B[i][1]);
    g.closePath(); g.fill();
  };
  g.save();
  g.fillStyle = '#000';
  g.globalAlpha = alpha; poly(0, n - 1);
  g.globalAlpha = 0.6; poly(0, iHead);          // pigment pools where the brush first lands
  if (dry > 0) {
    // flying white: individual hairs run out of pigment toward the end of the stroke (and now and then in the middle of a fast one)
    const r = L.rng('fb' + seed);
    g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.lineJoin = 'round';
    const run = (i0, i1, f) => {
      g.beginPath();
      for (let i = i0; i <= i1; i++) {
        const x = L.lerp(B[i][0], A[i][0], f), y = L.lerp(B[i][1], A[i][1], f);
        if (i === i0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    };
    const K = Math.round((3 + w * 0.2) * dry);
    for (let k = 0; k < K; k++) {
      const i0 = Math.floor(n * (1 - r.range(0.1, 0.2 + 0.26 * dry))), i1 = n - 1 - Math.floor(r.range(0, 0.03) * n);
      if (i1 - i0 < 3) continue;
      g.lineWidth = r.range(0.7, 2.2) * fw; g.globalAlpha = r.range(0.45, 1);
      run(i0, i1, 0.5 + r.range(-0.4, 0.4));
    }
    const M = Math.round(mid * r.range(1, 4));
    for (let k = 0; k < M; k++) {
      const i0 = Math.floor(n * r.range(0.2, 0.7)), i1 = Math.min(n - 2, i0 + Math.floor(n * r.range(0.06, 0.2)));
      if (i1 - i0 < 3) continue;
      g.lineWidth = r.range(0.6, 1.6) * fw; g.globalAlpha = r.range(0.35, 0.85);
      run(i0, i1, 0.5 + r.range(-0.34, 0.34));
    }
  }
  g.restore();
}

/** a banding line (弦线) spun on the wheel: `px` thick on screen at surface height V */
function ring(g, map, V, px, seed) {
  const c = comp(V), h0 = px / 2 / c;
  const top = [], bot = [];
  for (let U = -UM; U <= UM; U += 10) {
    const wob = (1.3 * NZ.n2(U / 260 + seed, seed * 3.3)) / c;
    const h = h0 * (1 + 0.24 * NZ.n2(U / 150 + seed * 5, 2.2) + 0.1 * NZ.n2(U / 23, seed + 8.8));
    top.push(map(U, V + wob - h)); bot.push(map(U, V + wob + h));
  }
  g.save(); g.fillStyle = '#000'; g.globalAlpha = 0.9;
  g.beginPath(); g.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) g.lineTo(top[i][0], top[i][1]);
  for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
  g.closePath(); g.fill(); g.restore();
}

const skew = (x) => Math.sin(x + 0.3 * Math.sin(x));   // a wave that rises slowly and drops fast

/** everything painted in black: returns the density mask as a padded layer */
function paintMask(env, map) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const r = L.rng('s30ink');
    let seed = 10;

    // ── banding lines ──
    ring(g, map, 197, 6.5, 1); ring(g, map, 237, 2.8, 2);
    ring(g, map, 635, 3, 3); ring(g, map, 654, 7.5, 4);
    ring(g, map, 950, 7.5, 5); ring(g, map, 970, 3, 6);

    // ── water ripples: six rows that follow the arc and rise and fall together, parting twice round a lens of bare slip ──
    const OPEN = [{ U: 410, V: 436, w: 250, amp: 27 }, { U: -730, V: 380, w: 180, amp: 20 }];
    const push = (U, V0) => {
      let s = 0;
      for (const o of OPEN) {
        const q = (U - o.U) / o.w, dv = V0 - o.V;
        s += Math.sign(dv) * o.amp * Math.exp(-q * q) * Math.exp(-Math.max(0, Math.abs(dv) - 30) / 70);
      }
      return s;
    };
    // one displacement field shared by every row, so neighbouring ripples nest; the phase drifts slowly down the wall
    const disp = (U, V) => {
      const ph = (TAU * U) / 256 + 0.003 * V + 1.0 * NZ.n2(U / 900 + 3.3, V / 600);
      return 24 * skew(ph) * (0.86 + 0.24 * NZ.n2(U / 520 - 7, V / 400 + 2)) + 7 * NZ.n2(U / 640 + 11, V / 400);
    };
    const rows = [];
    for (let k = 0; k < 6; k++) rows.push(296 + 56 * k);
    for (let k = 0; k < 3; k++) rows.push(1028 + 56 * k);
    rows.forEach((V0, k) => {
      const rowV = (U) => V0 + disp(U, V0) + push(U, V0) + 2.2 * NZ.n2(U / 90, k * 9.1);
      let U = -UM + r.range(-200, 0);
      while (U < UM) {
        const len = 256 * r.range(1.2, 3.1);
        const lift = r.range(0, 7);
        const pts = [];
        for (let u = U; u <= U + len + 1; u += 16) { const t = (u - U) / len; pts.push([u, rowV(u) - lift * t * t * t]); }
        brush(g, map, pts, { w: 26 * r.range(0.9, 1.14), seed: seed++, head: r.range(0, 0.16), tail: r.range(0.1, 0.2), slope: 0.62, dry: r.range(0.4, 1), mid: r.range(0, 1.2), alpha: r.range(0.8, 0.95),
          point: r.chance(0.7), fw: 0.35 + 0.65 * comp(V0) });
        U += len + r.range(-34, 8);     // lift, reload, carry on where the last stroke gave out
      }
    });

    // ── scrolling tendrils (卷草): a running scroll. Each stroke springs from the back of the last curl, sweeps across and winds
    //    into a curl of its own, alternately above and below the middle of the band; a leaf fills the pocket beside each curl ──
    const VC = 804, STEP = 262, OFF = 34;
    const j0 = Math.floor(-UM / STEP) - 1, j1 = Math.ceil(UM / STEP) + 1;
    for (let j = j0; j <= j1; j++) {
      const sgn = (((j % 2) + 2) % 2) === 0 ? -1 : 1;      // −1: this curl sits above the middle line, +1: below it
      const Uj = j * STEP + 40;
      const cU = Uj + r.range(-9, 9), cV = VC + sgn * OFF + r.range(-4, 4), rx = 92 * r.range(0.94, 1.07), ry = 66 * r.range(0.94, 1.05);
      const turns = r.range(1.42, 1.62), a0 = (-sgn * 110 * Math.PI) / 180;
      const pts = [[Uj - STEP + 26, VC + sgn * 31], [Uj - 138, VC - sgn * r.range(0, 5)]];
      for (let i = 0; i <= 46; i++) {
        const t = i / 46, ang = a0 + sgn * t * turns * TAU, rad = 1 - 0.86 * Math.pow(t, 0.85);
        pts.push([cU + rx * rad * Math.cos(ang), cV + ry * rad * Math.sin(ang)]);
      }
      brush(g, map, pts, { w: 33 * r.range(0.92, 1.1), seed: seed++, head: 0.22, tail: 0.5, end: 0.07, dry: r.range(0.35, 0.85), mid: 1, fw: 0.85 });
      // leaves: the tip of the brush lands on the stem, the belly presses down, the point flicks off
      const lJ = [cU - 30 + r.range(-8, 8), VC - sgn * 37], lT = [cU + 64 + r.range(-12, 12), VC - sgn * (108 + r.range(-6, 5))];
      brush(g, map, [lJ, [lJ[0] + 26, lJ[1] - sgn * 44], lT],
        { w: 40 * r.range(0.9, 1.12), seed: seed++, head: 0, tail: 0.42, dry: 0.25, point: true, fw: 0.85 });
      if (r.chance(0.6)) {
        const mJ = [cU - 52 + r.range(-6, 6), VC - sgn * 35], mT = [cU - 96 + r.range(-10, 10), VC - sgn * (94 + r.range(-8, 8))];
        brush(g, map, [mJ, [mJ[0] - 10, mJ[1] - sgn * 34], mT],
          { w: 28 * r.range(0.9, 1.1), seed: seed++, head: 0, tail: 0.42, dry: 0.2, point: true, fw: 0.85 });
      }
    }

    // ── pigment is never even: thinner blotches fire iron brown; the hairs of the brush leave faint streaks ──
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's30thin', scale: 150, sx: 2.2, octaves: 3, res: 0.25, warp: 0.5,
      ramp: [[0, 'rgba(0,0,0,0.42)'], [0.3, 'rgba(0,0,0,0.1)'], [0.44, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), -PAD, -PAD);
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's30hair', scale: 5, sx: 44, octaves: 2, res: 0.5, contrast: 1.5,
      ramp: [[0, 'rgba(0,0,0,0.2)'], [0.36, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), -PAD, -PAD);
    g.restore();

    // ── the line on the silhouette itself: a fine black ring right where the shoulder turns out of sight ──
    const sp = a.span(PAD + 80);
    g.fillStyle = '#000'; g.globalAlpha = 0.94;
    g.beginPath();
    for (let i = 0; i <= 240; i++) { const th = L.lerp(-sp, sp, i / 240), p = a.pt(th, 4); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
    for (let i = 240; i >= 0; i--) { const th = L.lerp(-sp, sp, i / 240), p = a.pt(th, -(4.6 + 1.1 * NZ.n2(th * 34, 3.1) + 0.5 * NZ.n2(th * 190, 9.9))); g.lineTo(p.x, p.y); }
    g.closePath(); g.fill();
  });
}

/** density → colour. Thin pigment is translucent iron brown, loaded pigment is black. Returns a canvas covering rows ≥ y0 of the mask. */
function inkColour(mask, y0) {
  const soft = L.blurred(mask, 0.8);
  const pw = soft.width, ph = soft.height - y0;
  const img = soft.getContext('2d', { willReadFrequently: true }).getImageData(0, y0, pw, ph), d = img.data;
  const ramp = L.makeRamp([[0, [132, 90, 46, 0]], [0.2, [118, 78, 38, 0.36]], [0.45, [94, 60, 30, 0.74]], [0.68, [56, 38, 22, 0.93]], [0.86, [31, 23, 17, 0.985]], [1, [19, 16, 13, 1]]]);
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) { const c = ramp(i / 255); lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = c[3] * 255; }
  for (let i = 3; i < d.length; i += 4) {
    const k = d[i] * 4; if (!k) continue;
    d[i - 3] = lut[k]; d[i - 2] = lut[k + 1]; d[i - 1] = lut[k + 2]; d[i] = lut[k + 3];
  }
  const c = L.makeCanvas(pw, ph);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** fine crazing of the clear glaze: long wandering cracks with short ones stepping between them */
function crackle(g, map) {
  const r = L.rng('s30crk');
  const PITCH = 62, CELL = 92;
  const rowV = (j, U) => 118 + j * PITCH + 21 * NZ.n2(U / 120 + j * 7.3, j * 2.1) + 8 * NZ.n2(U / 31, j * 5.7 + 3);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#7c6240';
  for (let j = 0; j < 18; j++) {
    for (let U = -UM; U < UM;) {
      const len = r.range(150, 520);
      if (r.chance(0.8)) {
        g.lineWidth = r.range(0.6, 1.1); g.globalAlpha = r.range(0.2, 0.46);
        g.beginPath();
        for (let u = U; u <= U + len; u += 9) { const p = map(u, rowV(j, u)); if (u === U) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); }
        g.stroke();
      }
      U += len;
    }
    for (let V = -UM + r.range(0, CELL); V < UM; V += CELL * r.range(0.55, 1.5)) {
      if (!r.chance(0.85)) continue;
      const u0 = V, u1 = V + r.range(-30, 30), v0 = rowV(j, u0), v1 = rowV(j + 1, u1), bow = r.range(-9, 9);
      g.lineWidth = r.range(0.55, 1); g.globalAlpha = r.range(0.18, 0.42);
      g.beginPath();
      for (let i = 0; i <= 6; i++) { const t = i / 6, p = map(L.lerp(u0, u1, t) + bow * Math.sin(t * Math.PI), L.lerp(v0, v1, t)); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
      g.stroke();
    }
  }
  g.restore();
}

/** the Cizhou jar: slip, crazing, painting, and the shading of a round shoulder. Returns {jar, gloss} cropped to rows ≥ top */
function buildJar(env) {
  const a = env.arc;
  const map = (U, V) => { const rr = a.R - dOfV(V), th = U / a.R; return [a.cx + rr * Math.sin(th), a.cy - rr * Math.cos(th)]; };
  const top = Math.floor(a.crestY) - 8, y0 = top + PAD;
  const ink = inkColour(paintMask(env, map), y0);

  const jar = L.makeLayer(PAD, (g) => {
    g.save(); a.clipBelow(g, 0);
    // slip: warm ivory, brighter where the key light lands (upper left), sinking a little toward the lower right
    g.fillStyle = '#efe6d2'; full(g);
    g.fillStyle = L.radial(g, a.cx - 300, a.crestY + 150, 80, 1500, [[0, '#faf5e8'], [0.3, '#f3ecda'], [0.65, '#ebe0c8'], [1, '#dccdb0']]); full(g);
    // the slip was brushed on round the pot: faint streaks along the arc, slow mottling, a few kiln stains
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.34;
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's30slip', scale: 26, sx: 16, sy: 0.7, octaves: 2, res: 0.4, contrast: 1.5 }), -PAD, -PAD);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55;
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's30stain', scale: 300, sx: 1.6, octaves: 4, warp: 0.6, res: 0.22,
      ramp: [[0, '#dcc99c'], [0.4, '#f6efdc'], [0.62, '#ffffff'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    L.speckle(g, { seed: 's30iron', count: 520, x: -PAD, y: a.crestY - 10, w: W + PAD * 2, h: H + PAD - a.crestY + 20, rMin: 0.5, rMax: 1.9,
      colors: ['#7a5a36', '#5a3a1e', '#a08458', '#3a2a1c'], alpha: [0.12, 0.6] });
    crackle(g, map);
    // the painting
    g.drawImage(ink, -PAD, top);
    // a round shoulder: the limb mirrors the yellow dish behind it; the wall turns away from the light lower down and to the right
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 64, a.R, [[0, '#ffffff'], [0.5, '#fdf4cc'], [1, '#f6de80']]); full(g);
    g.fillStyle = L.radial(g, a.cx - 380, a.crestY + 40, 420, 1650, [[0, '#ffffff'], [0.48, '#f0e4ce'], [1, '#bca782']]); full(g);
    g.restore();
  });

  // clear glaze: a long soft reflection on the turn of the shoulder and the crisp double pane of a window inside it
  const gl = L.makeLayer(PAD, (h) => {
    a.pathBand(h, -56, -170);
    h.fillStyle = L.radial(h, a.cx, a.cy, a.R - 170, a.R - 56, [[0, 'rgba(255,250,236,0)'], [0.42, 'rgba(255,250,236,0.3)'], [0.6, 'rgba(255,250,236,0.34)'], [1, 'rgba(255,250,236,0)']]);
    h.fill();
    h.globalCompositeOperation = 'destination-in';
    h.fillStyle = L.linear(h, 0, 0, W, 0, [[0, 'rgba(0,0,0,0.2)'], [0.16, 'rgba(0,0,0,0.7)'], [0.34, 'rgba(0,0,0,1)'], [0.56, 'rgba(0,0,0,0.45)'], [0.8, 'rgba(0,0,0,0.16)'], [1, 'rgba(0,0,0,0.08)']]); full(h);
    h.globalCompositeOperation = 'source-over';
  });
  const pane = L.makeLayer(PAD, (h) => {
    // the hot core of the reflection: a long lens that tapers to nothing at both ends
    const t0 = -0.262, t1 = -0.062, N = 60;
    h.fillStyle = 'rgba(255,253,244,0.8)';
    h.beginPath();
    for (let i = 0; i <= N; i++) { const u = i / N, q = a.pt(L.lerp(t0, t1, u), -103 + 11 * Math.pow(Math.sin(u * Math.PI), 0.7)); if (i) h.lineTo(q.x, q.y); else h.moveTo(q.x, q.y); }
    for (let i = N; i >= 0; i--) { const u = i / N, q = a.pt(L.lerp(t0, t1, u), -103 - 11 * Math.pow(Math.sin(u * Math.PI), 0.7)); h.lineTo(q.x, q.y); }
    h.closePath(); h.fill();
    // the orange-peel of the glaze breaks the reflection up a little
    h.globalCompositeOperation = 'destination-out';
    h.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's30peelj', scale: 9, sx: 2.4, octaves: 2, res: 0.5, contrast: 1.7,
      ramp: [[0, 'rgba(0,0,0,0.5)'], [0.42, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), -PAD, -PAD);
    h.globalCompositeOperation = 'source-over';
  });
  const gloss = L.makeLayer(PAD, (h) => {
    h.save(); a.clipBelow(h, -1);
    h.drawImage(L.blurred(gl, 9), -PAD, -PAD);
    h.drawImage(L.blurred(pane, 3.2), -PAD, -PAD);
    h.restore();
  });

  const crop = (layer) => { const c = L.makeCanvas(layer.width, layer.height - y0); c.getContext('2d').drawImage(layer, 0, -y0); return c; };
  // depth of field: focus sits on the shoulder just under the crest; the wall swelling toward the lens and the far sides go soft
  const sharp = crop(jar);
  const soft = L.blurred(sharp, 4.2), sg = soft.getContext('2d');
  const mk = L.makeCanvas(sharp.width, sharp.height), mg = mk.getContext('2d');
  mg.fillStyle = L.radial(mg, a.cx + PAD, a.cy + PAD - y0, a.R - 640, a.R - 330, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
  mg.fillRect(0, 0, mk.width, mk.height);
  mg.fillStyle = L.linear(mg, PAD, 0, PAD + W, 0, [[0, 'rgba(0,0,0,0.75)'], [0.2, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.75)']]);
  mg.fillRect(0, 0, mk.width, mk.height);
  sg.globalCompositeOperation = 'destination-in'; sg.drawImage(mk, 0, 0);
  const jg = sharp.getContext('2d');
  jg.save(); jg.translate(PAD, PAD - y0); a.clipBelow(jg, 0); jg.setTransform(1, 0, 0, 1, 0, 0); jg.drawImage(soft, 0, 0); jg.restore();
  return { jar: sharp, gloss: crop(gloss), top };
}

/** the 娇黄 dish behind: plain egg-yolk yellow, even and bright; the well meets the wall in a soft ring high in the frame */
function buildDish(env) {
  const a = env.arc;
  const DC = { x: 1040, y: 1080, r: 944 };       // centre of the dish and radius of its well
  // tone that only the wall (outside the well) receives, and the glaze pooled along the join — both very soft
  const wall = L.blurred(L.makeLayer(PAD, (g) => {
    g.fillStyle = 'rgba(226,170,6,0.5)'; full(g);
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(DC.x, DC.y, DC.r, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(214,156,2,0.5)'; g.lineWidth = 30; g.beginPath(); g.arc(DC.x, DC.y, DC.r + 6, 0, TAU); g.stroke();
  }), 24);
  const sheen = L.blurred(L.makeLayer(PAD, (g) => {
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const u = i / 39, ang = L.lerp(-158, -96, u) * (Math.PI / 180), k = Math.sin(u * Math.PI);
      g.strokeStyle = `rgba(255,244,170,${(0.3 * k * k).toFixed(3)})`; g.lineWidth = 12 + 18 * k;
      g.beginPath(); g.arc(DC.x, DC.y, DC.r + 58, ang, ang + 0.034); g.stroke();
    }
  }), 18);

  const layer = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#f2c21a'; full(g);
    // one broad soft key from the upper left; the far corners only deepen, they never go brown
    g.fillStyle = L.radial(g, 520, 130, 0, 1750, [[0, '#f8d648'], [0.38, '#f4c720'], [0.72, '#f0bf16'], [1, '#e8b30e']]); full(g);
    g.drawImage(wall, -PAD, -PAD);
    g.globalCompositeOperation = 'screen'; g.drawImage(sheen, -PAD, -PAD); g.globalCompositeOperation = 'source-over';
    // glaze laid by pouring is never dead flat: the faintest slow drift of tone, and a whisper of orange-peel
    g.globalAlpha = 1;
    g.drawImage(L.noiseLayer(PAD, { seed: 's30tone', scale: 560, octaves: 3, res: 0.2, warp: 0.5,
      ramp: [[0, 'rgba(232,176,8,0.13)'], [0.45, 'rgba(240,190,20,0)'], [0.6, 'rgba(250,222,100,0)'], [1, 'rgba(250,224,108,0.13)']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.1;
    g.drawImage(L.bumpLight(L.noiseLayer(PAD, { seed: 's30peel', scale: 16, octaves: 2, res: 0.34 }), { angle: 45, strength: 1.2, res: 0.34 }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    // a few hairline scratches from use — kept to the sides, clear of the words
    const scr = [
      [[1418, 64], [1506, 196], [1618, 430]], [[1704, 118], [1762, 300], [1792, 476]], [[1486, 332], [1566, 362], [1702, 372]],
      [[1838, 30], [1852, 262], [1840, 540]], [[1338, 52], [1376, 118], [1398, 212]],
      [[88, 150], [176, 300], [232, 476]], [[52, 516], [150, 560], [300, 598]], [[150, 60], [210, 110], [330, 132]],
    ];
    scr.forEach((pts, i) => {
      L.sketchLine(g, pts.map(([x, y]) => [x + 1.2, y + 1.4]), { width: 1.5, color: '#c08a04', seed: 30 + i, wobble: 1.4, passes: 1, alpha: 0.5 });
      L.sketchLine(g, pts, { width: 1.5, color: '#fdeea6', seed: 30 + i, wobble: 1.4, passes: 1, alpha: 0.72 });
    });
    // one small scuff rubbed through to the white body: a bundle of short abrasions all running the same way
    const wr = L.rng('s30worn');
    g.save(); g.translate(1640, 252); g.rotate(-0.58); g.lineCap = 'round';
    const scuff = (color, grow) => {
      const q = L.rng('s30scuff');
      g.strokeStyle = color;
      for (let i = 0; i < 17; i++) {
        const y = q.range(-10, 10), len = q.range(8, 46), x = q.range(-30, 30) + y * 1.3, wd = q.range(1.4, 5);
        g.globalAlpha = q.range(0.55, 1); g.lineWidth = wd + grow; g.beginPath(); g.moveTo(x - len / 2 - grow, y); g.quadraticCurveTo(x, y + q.range(-2.5, 2.5), x + len / 2 + grow, y + q.range(-1.5, 1.5)); g.stroke();
      }
    };
    scuff('rgba(251,232,140,0.85)', 5);      // glaze worn thin round it
    scuff('#f5eeda', 0);
    for (let i = 0; i < 9; i++) {            // stray nicks trailing off along the same line
      const x = wr.range(-120, 120), y = wr.range(-22, 22), len = wr.range(4, 20);
      g.strokeStyle = wr.chance(0.5) ? '#f5eeda' : 'rgba(251,232,140,0.9)'; g.lineWidth = wr.range(1, 2.6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + wr.range(-1, 1)); g.stroke();
    }
    g.restore();
  });
  // the dish is a little behind the plane of focus
  const out = L.blurred(layer, 2);
  const g = out.getContext('2d'); g.translate(PAD, PAD);
  // the jar stands close in front of it: the yellow deepens gently toward the shoulder line
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 230, [[0, 'rgba(226,168,2,0.22)'], [0.35, 'rgba(228,172,4,0.08)'], [1, 'rgba(230,176,6,0)']]); full(g);
  return out;
}

export default {
  name: '娇黄釉与白地黑花',
  tone: 'dark',
  init(env) {
    const j = buildJar(env);
    S = { dish: buildDish(env), jar: j.jar, gloss: j.gloss, top: j.top };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0055, 0.0055, p), zoom = L.lerp(1.0, 1.01, p);
    // the dish, far behind: hardly moves
    L.blit(ctx, env, S.dish, { rot: rot * 0.28, zoom: 1 + (zoom - 1) * 0.4 });
    // a tall soft reflection drifting across the yellow glaze, left of the words
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(L.lerp(318, 404, p), 330); ctx.rotate(-0.2); ctx.scale(1, 3.4);
    ctx.fillStyle = L.radial(ctx, 0, 0, 0, 172, [[0, 'rgba(255,240,150,0.42)'], [0.45, 'rgba(255,236,140,0.17)'], [1, 'rgba(255,234,130,0)']]);
    ctx.fillRect(-172, -172, 344, 344);
    ctx.restore();
    // the jar: the painting slides along the arc
    L.cam(ctx, env, { rot, zoom }, () => ctx.drawImage(S.jar, -PAD, S.top));
    // reflections in the clear glaze lag behind the surface they sit on
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    L.cam(ctx, env, { rot: rot * 0.15 + L.lerp(-0.004, 0.004, p), zoom }, () => ctx.drawImage(S.gloss, -PAD, S.top));
    ctx.restore();
  },
};
