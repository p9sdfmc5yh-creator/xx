// s19 — 汤药液面. Macro of a bowl of dark decoction seen edge-on from almost table height: the arc is the upper limb of
// the liquid, domed by surface tension. A thin oily film rides the limb and splits the raking light into interference
// colours — orange-red at the very edge, then pale gold, violet, cobalt — the only bright thing in the frame.
// Below it the ink-brown liquid carries slow marbled clouds and a foggy reflection; above it is black, with a breath of
// steam at the far left and right only (the tagline sits over the crest).
//
// Everything under the arc is mapped onto a sphere of radius arc.R (U along the parallel, S down the meridian), so the
// cloud pattern is squeezed toward the limb exactly like the surface of a real dome. Layers are cropped to the part of
// the frame they cover and blitted with a small rotation about the arc's centre, so the limb itself never moves.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 120;
const BW = 0.9;           // thickness scale of the film (the ramp below is in px before this factor)
let S = null;

// [theta, dr, radius] of the bubbles, and the ripple rings round two of them: [theta, dr, first radius, gap, rings, squash, strength]
const BUBBLES = [[-0.118, -272, 11], [-0.104, -298, 5], [0.226, -326, 7.5]];
const RIPPLES = [[-0.118, -272, 28, 27, 4, 0.5, 1], [0.226, -326, 20, 22, 3, 0.56, 0.7]];

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// interference colours from the limb inward: [px below the arc, colour]
const FILM = [
  [0, '#c8330f'], [5, '#e8481f'], [15, '#f0562a'], [27, '#f5672e'], [35, '#f88c48'], [43, '#f8bf80'], [50, '#f6d6a4'], [58, '#f8e2ba'], [63, '#f6e2cc'],
  [68, '#eccfe0'], [76, '#bd9cee'], [87, '#8759e0'], [99, '#6a3fd0'], [112, '#4b3bd2'], [126, '#2446cc'], [142, '#1447c4'],
  [190, '#0f37a6'], [260, '#0c2a84'],
];
const FADE0 = 120, FADE1 = 200, DMAX = 260, LQ = 4;

function filmLut() {
  const f = L.makeRamp(FILM.map(([d, c]) => [d / DMAX, c]));
  const n = DMAX * LQ + 1, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** camera blit for a cropped canvas whose top-left sits at frame (x0, y0); scale = frame px per canvas px */
function blitAt(ctx, env, c, o = {}) {
  const { rot = 0, zoom = 1, alpha = 1, blend = 'source-over' } = o;
  const a = env.arc, sc = c._sc || 1;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = blend;
  if (zoom !== 1) { ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY); }
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(c, c._x0, c._y0, c.width * sc, c.height * sc);
  ctx.restore();
}

/** the iridescent film: a concentric band whose outer edge is exactly the arc */
function buildBand(env, seed, lut) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 6, RW = W + PAD * 2;
  const DEND = FADE1 * BW * 1.32 + 8;
  const RH = Math.min(H + PAD, Math.ceil(a.yAt(X0, -DEND)) + 2) - Y0;
  const nz = L.makeNoise('s19film' + seed);
  const sp = a.span(PAD + 200), NT = 2048, NL = DMAX * LQ + 1;
  // film thickness and brightness along the limb
  const wT = new Float32Array(NT + 1), bT = new Float32Array(NT + 1);
  for (let i = 0; i <= NT; i++) {
    const th = L.lerp(-sp, sp, i / NT), u = th * R;
    wT[i] = 1 + 0.17 * nz.n2(u / 640, 1.7) + 0.07 * nz.n2(u / 260, 9.3);
    bT[i] = 0.87 + 0.13 * Math.exp(-Math.pow((th + 0.07) / 0.38, 2));
  }
  const img = new ImageData(RW, RH), px = img.data;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -1.6 || d > DEND) continue;
      const th = Math.atan2(ddx, ddy), u = th * R;
      const tf = L.clamp((th + sp) / (2 * sp)) * (NT - 1), t0 = tf | 0, tt = tf - t0;
      const w = wT[t0] + (wT[t0 + 1] - wT[t0]) * tt, br0 = bT[t0] + (bT[t0 + 1] - bT[t0]) * tt;
      const dn = d / BW;
      const wob = 7 * nz.n2(u / 230 + 20, dn / 52) * sstep(0, 34, dn);     // the colour fronts wander a little
      const dd = Math.max(0, dn * w + wob);
      const streak = nz.n2(u / 460 - 8, dn / 6.5);                          // flow lines drawn out along the limb
      const li = Math.min(NL - 1, (dd * LQ) | 0) * 3;
      const br = br0 * (1 + 0.06 * streak);
      const al = sstep(-1.1, 1.1, d) * (1 - sstep(FADE0, FADE1, dd));
      const o = (j * RW + i) * 4;
      px[o] = lut[li] * br; px[o + 1] = lut[li + 1] * br; px[o + 2] = lut[li + 2] * br; px[o + 3] = al * 255;
    }
  }
  const c = L.makeCanvas(RW, RH);
  c.getContext('2d').putImageData(img, 0, 0);
  c._x0 = X0; c._y0 = Y0;
  return c;
}

/** soft glow of the film, at quarter resolution, with head-room above the limb */
function buildBloom(band, blurPx, div) {
  const up = 96;
  const c = L.makeCanvas(Math.ceil(band.width / div), Math.ceil((band.height + up) / div));
  const g = c.getContext('2d');
  g.filter = `blur(${(blurPx / div).toFixed(2)}px)`;
  g.drawImage(band, 0, up / div, band.width / div, band.height / div);
  g.filter = 'none';
  c._x0 = band._x0; c._y0 = band._y0 - up; c._sc = div;
  return c;
}

/** the decoction: ink-brown, marbled with slow clouds, sinking to black */
function buildLiquid(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 8, RW = W + PAD * 2, RH = H + PAD - Y0;
  const res = 0.5, cw = Math.ceil(RW * res), ch = Math.ceil(RH * res);
  const nA = L.makeNoise('s19a'), nB = L.makeNoise('s19b'), rd = L.rng('s19dither');
  const img = new ImageData(cw, ch), px = img.data;
  for (let j = 0; j < ch; j++) {
    const ddy = cy - (Y0 + (j + 0.5) / res);
    for (let i = 0; i < cw; i++) {
      const ddx = X0 + (i + 0.5) / res - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 8) continue;
      const q = Math.min(1, rr / R), al = Math.acos(q), depth = Math.max(0, R - rr);
      const th = Math.atan2(ddx, ddy), U = th * rr, Sv = R * al;
      // slow clouds: a swirl field bends a soft cloud field; a little finer veining rides on top
      const wx = nA.fbm(U / 1000 + 3.1, Sv / 760 + 7.7, 3), wy = nA.fbm(U / 1000 - 11.9, Sv / 760 + 53.1, 3);
      const u = U / 520 + 1.25 * wx, v = Sv / 360 + 1.25 * wy;
      const c1 = nB.fbm(u, v, 4, 2.05, 0.5) * 0.5 + 0.5;
      const c2 = nB.fbm(u * 2.2 + 3.0 * c1, v * 2.2 - 2.2 * c1, 3) * 0.5 + 0.5;
      const cloud = sstep(0.36, 0.74, c1), fil = sstep(0.5, 0.86, c2) * (0.2 + 0.8 * cloud);
      const fall = Math.exp(-depth / 440), low = 1 - 0.72 * sstep(250, 650, depth);
      const side = 1 - 0.32 * sstep(0.2, 0.58, Math.abs(th + 0.05));
      let r = 26 * (0.4 + 0.6 * fall), g = 18 * (0.4 + 0.6 * fall), b = 14 * (0.4 + 0.6 * fall);
      const k = fall * low * side * sstep(40, 200, depth) * 1.25;
      r += (68 * cloud + 22 * fil) * k; g += (35 * cloud + 13 * fil) * k; b += (17 * cloud + 10 * fil) * k;
      // the film's cobalt spills a little way down the slope
      const haze = Math.exp(-depth / 150) * (0.55 + 0.45 * cloud);
      r += 9 * haze; g += 15 * haze; b += 62 * haze;
      const n = (rd() - 0.5) * 1.6;
      const o = (j * cw + i) * 4;
      px[o] = r + n; px[o + 1] = g + n; px[o + 2] = b + n; px[o + 3] = 255;
    }
  }
  const small = L.makeCanvas(cw, ch);
  small.getContext('2d').putImageData(img, 0, 0);

  const c = L.makeCanvas(RW, RH), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.filter = 'blur(3px)';
  g.drawImage(small, -6, -6, RW + 12, RH + 12);
  g.filter = 'none';
  g.translate(-X0, -Y0);
  // motes of herb dust riding the surface, flattened by the grazing view
  const rs = L.rng('s19motes');
  for (let n = 0; n < 60; n++) {
    const th = rs.range(-0.6, 0.6), dr = -rs.range(170, 560), rad = rs.range(0.6, 1.7), al = rs.range(0.08, 0.3) * Math.exp(dr / 500);
    a.at(g, th, dr, () => {
      g.fillStyle = `rgba(214,170,128,${al.toFixed(3)})`;
      g.beginPath(); g.ellipse(0, 0, rad * 1.6, rad * 0.7, 0, 0, L.TAU); g.fill();
    });
  }
  // one or two tiny bubbles
  const bubble = (th, dr, r) => a.at(g, th, dr, () => {
    g.save();
    g.scale(1, 0.84);
    // dimple the bubble presses into the surface
    g.fillStyle = L.radial(g, 0, r * 0.3, r * 0.6, r * 2.3, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
    g.beginPath(); g.arc(0, r * 0.3, r * 2.3, 0, L.TAU); g.fill();
    // the dome: nearly clear, a little lighter toward its rim
    g.fillStyle = L.radial(g, 0, 0, r * 0.2, r, [[0, '#0b0605'], [0.7, '#1c120d'], [1, '#4a3023']]);
    g.beginPath(); g.arc(0, 0, r, 0, L.TAU); g.fill();
    g.lineCap = 'round';
    // far rim picks up the film's colours, near rim its violet
    g.lineWidth = Math.max(1.2, r * 0.2);
    g.strokeStyle = L.linear(g, -r, 0, r, 0, [[0, 'rgba(240,86,42,0.0)'], [0.25, 'rgba(246,150,90,0.95)'], [0.55, 'rgba(255,242,218,1)'], [1, 'rgba(246,220,176,0.1)']]);
    g.beginPath(); g.arc(0, 0, r - g.lineWidth * 0.5, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.lineWidth = Math.max(1, r * 0.14);
    g.strokeStyle = 'rgba(122,84,224,0.75)';
    g.beginPath(); g.arc(0, 0, r - g.lineWidth * 0.5, Math.PI * 0.2, Math.PI * 0.62); g.stroke();
    g.fillStyle = 'rgba(255,250,236,0.95)';
    g.beginPath(); g.ellipse(-r * 0.36, -r * 0.42, r * 0.2, r * 0.12, -0.5, 0, L.TAU); g.fill();
    g.restore();
  });
  for (const [th, dr, r] of BUBBLES) bubble(th, dr, r);
  c._x0 = X0; c._y0 = Y0;
  return c;
}

/** ripple rings round a bubble: circles on the surface, flattened by the grazing view; lit on the side that faces the film */
function buildRipple([th, dr, r0, gap, n, sq, amp]) {
  const rMax = r0 + gap * Math.pow(n, 1.12) + 14, w = Math.ceil(rMax * 2), h = Math.ceil(rMax * 2 * sq) + 16;
  const c0 = L.makeCanvas(w, h), g = c0.getContext('2d');
  g.translate(w / 2, h / 2);
  for (let k = 0; k < n; k++) {
    const rx = r0 + gap * Math.pow(k, 1.12), ry = rx * sq, f = amp * Math.pow(1 - k / (n + 0.4), 1.25);
    g.lineWidth = 4.4; g.strokeStyle = `rgba(0,0,0,${(0.42 * f).toFixed(3)})`;
    g.beginPath(); g.ellipse(0, 2.6, rx, ry, 0, 0, L.TAU); g.stroke();
    g.lineWidth = 2.3;
    g.strokeStyle = L.linear(g, -rx * 0.5, -ry, rx * 0.4, ry, [[0, `rgba(214,206,255,${(0.5 * f).toFixed(3)})`], [0.5, `rgba(150,140,226,${(0.22 * f).toFixed(3)})`], [1, `rgba(110,100,190,${(0.05 * f).toFixed(3)})`]]);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, L.TAU); g.stroke();
  }
  // the rings are not evenly lit all the way round, and die away at the outside
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = L.linear(g, 0, 0, w, 0, [[0, 'rgba(0,0,0,0.75)'], [0.3, 'rgba(0,0,0,1)'], [0.62, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0.2)']]);
  g.fillRect(0, 0, w, h);
  const c = L.blurred(c0, 1.3);
  return { th, dr, c };
}

/** foggy reflection of the light lying on the surface (screened over the liquid; drifts against the clouds) */
function buildSheen(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 8, RW = W + PAD * 2, RH = H + PAD - Y0;
  const div = 2, cw = Math.ceil(RW / div), ch = Math.ceil(RH / div);
  const nz = L.makeNoise('s19sheen');
  const img = new ImageData(cw, ch), px = img.data;
  for (let j = 0; j < ch; j++) {
    const ddy = cy - (Y0 + (j + 0.5) * div);
    for (let i = 0; i < cw; i++) {
      const ddx = X0 + (i + 0.5) * div - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R) continue;
      const depth = R - rr, th = Math.atan2(ddx, ddy), U = th * rr, Sv = R * Math.acos(rr / R);
      const fogN = nz.fbm(U / 560 + 0.9 * nz.n2(U / 900, Sv / 700), Sv / 400, 4) * 0.5 + 0.5;
      const fog = sstep(0.3, 0.72, fogN);
      // main reflection left of the crest: firmer toward the limb, melting away down the slope and at both ends
      const top = 196 + 22 * (fogN - 0.5);
      const m1 = sstep(-0.46, -0.3, th) * (1 - sstep(-0.02, 0.2, th)) * sstep(top, top + 22, depth) * (1 - sstep(250, 430, depth));
      const e2 = (th - 0.37) / 0.17, f2 = (depth - 250) / 90;
      const m2 = 0.5 * Math.exp(-e2 * e2 - f2 * f2);
      const al = (m1 + m2) * (0.28 + 0.72 * fog);
      const o = (j * cw + i) * 4;
      px[o] = 150; px[o + 1] = 152; px[o + 2] = 226; px[o + 3] = L.clamp(al * 0.32) * 255;
    }
  }
  const c0 = L.makeCanvas(cw, ch);
  c0.getContext('2d').putImageData(img, 0, 0);
  const c = L.blurred(c0, 2.5);
  c._x0 = X0; c._y0 = Y0; c._sc = div;
  return c;
}

/** steam: a few soft wisps standing on the limb at the far left and right only (half resolution; they are all blur) */
const WISPS = [
  // [x at the base, height, sway px, base width, strength]
  [70, 330, 46, 30, 1.0], [205, 270, -38, 24, 0.8], [345, 215, 30, 20, 0.55], [-40, 380, 30, 34, 0.9],
  [1585, 220, -30, 20, 0.55], [1715, 285, 40, 25, 0.85], [1850, 340, -44, 31, 1.0], [1965, 370, -26, 34, 0.85],
];
function buildSteam(env, seed) {
  const a = env.arc, div = 2, up = 60;
  const c0 = L.makeCanvas(W / div, (H + up) / div), g = c0.getContext('2d');
  const r = L.rng('s19wisp' + seed), nz = L.makeNoise('s19wisp' + seed);
  g.scale(1 / div, 1 / div); g.translate(0, up);
  WISPS.forEach(([x0, hgt, sway, w0, str], wi) => {
    const xb = x0 + r.range(-34, 34), hh = hgt * r.range(0.85, 1.15), ph = r.range(0, L.TAU), fq = r.range(0.75, 1.25), lean = 44 + r.range(-30, 30);
    const yb = a.yAt(L.clamp(xb, 0, W)) + 6;
    const n = Math.ceil(hh / 5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = xb + lean * t * t + 1.5 * sway * Math.pow(t, 0.8) * Math.sin(ph + t * 4.6 * fq) + 28 * t * nz.n2(t * 3.1, wi * 7.3);
      const y = yb - hh * t;
      const w = w0 * (0.55 + 1.9 * t) * (1 + 0.3 * nz.n2(t * 5.2 + 9, wi * 3.1));
      const al = 0.075 * str * 2.6 * Math.pow(t, 0.55) * Math.pow(1 - t, 1.4) * (0.6 + 0.4 * nz.n2(t * 7.7, wi + 40.5));
      if (al <= 0.002) continue;
      g.fillStyle = L.radial(g, x, y, 0, w, [[0, `rgba(255,255,255,${al.toFixed(4)})`], [0.55, `rgba(255,255,255,${(al * 0.42).toFixed(4)})`], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(x - w, y - w, w * 2, w * 2);
    }
  });
  // break the ribbons up a little, then tint: cool grey aloft, warmed by the film just above the limb
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(L.noiseTex(c0.width, c0.height, { seed: 's19wn' + seed, scale: 46, sx: 0.8, sy: 1.8, octaves: 3, warp: 1.1, contrast: 1.9, res: 0.5,
    ramp: [[0, 'rgba(0,0,0,0.04)'], [0.45, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#c4bab4'; g.fillRect(0, 0, c0.width, c0.height);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = L.radial(g, a.cx / div, (a.cy + up) / div, (a.R - 10) / div, (a.R + 150) / div, [[0, 'rgba(246,130,70,0.75)'], [0.4, 'rgba(240,120,70,0.3)'], [1, 'rgba(240,120,70,0)']]);
  g.fillRect(0, 0, c0.width, c0.height);
  const c = L.blurred(c0, 3.4);
  c._x0 = 0; c._y0 = -up; c._sc = div;
  return c;
}

export default {
  name: '汤药液面',
  tone: 'light',
  init(env) {
    const lut = filmLut();
    const bandA = buildBand(env, 'A', lut), bandB = buildBand(env, 'B', lut);
    S = {
      bandA, bandB,
      bloom: buildBloom(bandA, 11, 4),
      halo: buildBloom(bandA, 44, 8),
      liquid: buildLiquid(env),
      sheen: buildSheen(env),
      ripples: RIPPLES.map(buildRipple),
      steamA: buildSteam(env, 'A'), steamB: buildSteam(env, 'B'),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, W, H);

    // steam at the far left and right: two sets of wisps rising at different speeds, one thinning as the other fills in
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = L.lerp(1, 0.72, p); ctx.drawImage(S.steamA, 0, S.steamA._y0 - L.lerp(0, 24, p), W, S.steamA.height * 2);
    ctx.globalAlpha = L.lerp(0.5, 0.95, p); ctx.drawImage(S.steamB, L.lerp(-4, 4, p), S.steamB._y0 + L.lerp(14, -22, p), W, S.steamB.height * 2);
    ctx.restore();

    // the faintest breath of the film's light in the air above it
    blitAt(ctx, env, S.halo, { blend: 'screen', alpha: 0.1 });

    // the liquid: clouds drift one way, the foggy reflection the other
    ctx.save(); a.clipBelow(ctx, 0);
    const lrot = L.lerp(-0.007, 0.007, p), lzoom = L.lerp(1.0, 1.014, p);
    blitAt(ctx, env, S.liquid, { rot: lrot, zoom: lzoom });
    blitAt(ctx, env, S.sheen, { rot: L.lerp(0.012, -0.012, p), blend: 'screen', alpha: L.lerp(0.8, 1, p) });
    // capillary ripples spreading from the bubbles
    L.cam(ctx, env, { rot: lrot, zoom: lzoom }, () => {
      for (const rp of S.ripples) a.at(ctx, rp.th, rp.dr, () => {
        const sc = L.lerp(0.94, 1.1, p);
        ctx.globalAlpha = L.lerp(1, 0.8, p);
        ctx.drawImage(rp.c, -rp.c.width * 0.5 * sc, -rp.c.height * 0.5 * sc, rp.c.width * sc, rp.c.height * sc);
      });
    });
    ctx.restore();

    // the film: two thickness fields sliding against each other along the limb, so the colour fronts breathe
    blitAt(ctx, env, S.bandA, { rot: L.lerp(-0.011, 0.011, p) });
    blitAt(ctx, env, S.bandB, { rot: L.lerp(0.009, -0.009, p), alpha: L.lerp(0.3, 0.62, p) });
    blitAt(ctx, env, S.bloom, { rot: L.lerp(-0.011, 0.011, p), blend: 'screen', alpha: 0.24 });

    // raking light: a soft glint travels along the pale-gold front
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'butt';
    const gx = a.pt(L.lerp(-0.2, -0.1, p), 0).x;
    for (const [lw, al, len] of [[42, 0.07, 440], [22, 0.14, 330], [9, 0.24, 230]]) {
      ctx.strokeStyle = L.linear(ctx, gx - len, 0, gx + len, 0, [[0, 'rgba(255,236,200,0)'], [0.5, `rgba(255,240,210,${al})`], [1, 'rgba(255,236,200,0)']]);
      ctx.lineWidth = lw; a.stroke(ctx, -54 * BW);
    }
    ctx.restore();
  },
};
