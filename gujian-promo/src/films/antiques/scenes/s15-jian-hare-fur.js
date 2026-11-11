// s15 — 建盏兔毫. Macro of a black-glazed Jian tea bowl seen from just above its mouth: the arc is the lip, and inside
// it the wall falls away toward the well. Where the glaze runs thin under the lip it is iron-rust brown and the "hare's
// fur" is so dense it fuses into one warm tawny mass; further down the streaks part, taper and sink into glaze that
// pools thicker and blacker. A soft window reflection lies across the wall, a violet→cyan film of iridescence rides the
// lip, and beyond the lip there is only warm darkness.
//
// Recipe: the glaze is a small per-pixel shader evaluated in "unwrapped" coordinates (u = distance along the rim,
// v = depth below it). The fur is the part of a strongly stretched noise field that stands above a threshold which
// rises with depth — so streaks fuse near the lip, split and taper lower down, and no two are alike. Because the
// field lives in (u, v) the streaks are exactly radial and `rot` slides them along the rim without ever disturbing
// the arc. Light (the window reflection, the lip glint, the iridescent rim) stays put while the fur slides beneath it.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 72;
let S = null;

const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

function geometry(env) {
  const a = env.arc;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 4;
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  // u must reach the widest pixel of the padded frame (its bottom corners), plus room for the sway of the streaks
  const UMAX = Math.ceil(Math.atan2(W / 2 + PAD, a.cy - (H + PAD)) * a.R) + 48;
  return { X0, Y0, RW, RH, UMAX, TW: UMAX * 2 };
}

/** a canvas covering only part of the frame; draw into it with frame coordinates */
function region(x0, y0, w, h, draw) {
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.translate(-x0, -y0);
  c._x = x0; c._y = y0;
  if (draw) draw(g);
  return c;
}
const put = (ctx, c) => ctx.drawImage(c, c._x, c._y);

function lut(stops) {
  const f = L.makeRamp(stops), t = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) { const c = f(i / 255); t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2]; }
  return t;
}

/** the glazed wall, shaded pixel by pixel straight onto the arc */
function buildWall(env, geo) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const { X0, Y0, RW, RH, UMAX, TW } = geo;
  const nf = L.makeNoise('s15fur').n2, nw = L.makeNoise('s15flow').n2, nz = L.makeNoise('s15zone').n2;

  // each streak of fur is rusty at its feathered edge and pale down its spine
  const GOLD = lut([[0, '#3a170a'], [0.2, '#6e3014'], [0.4, '#9a5626'], [0.6, '#b47434'], [0.78, '#cf8e44'], [0.92, '#e4ae68'], [1, '#f0c78c']]);
  const SILV = lut([[0, '#30241f'], [0.2, '#574b47'], [0.4, '#7d7b7e'], [0.6, '#9aa3ad'], [0.78, '#b3bcc7'], [0.92, '#cbd3dc'], [1, '#dbe1e8']]);

  // 1-D character along the rim: how deep the fur runs (clumps and thin gaps), where it turns silver, how wide the rust is
  const clump = new Float32Array(TW), silver = new Float32Array(TW), rustD = new Float32Array(TW), coarse = new Float32Array(TW);
  const clmp = (x) => 0.5 + 0.6 * nz(x / 250, 1.7) + 0.32 * nz(x / 70, 7.3) + 0.12 * nz(x / 17, 3.1);
  const silv = (x) => 0.5 + 0.62 * nz(x / 560 + 3.3, 0.7) + 0.2 * nz(x / 150, 4.1);
  // slide the pattern so a silver passage lies left of the crest, under the window light, and gold takes the right
  let shift = 0, best = -1e9;
  for (let sft = 0; sft < 5000; sft += 40) {
    let m = 0;
    for (let x = -560; x <= -120; x += 40) m += silv(x + sft);
    for (let x = 160; x <= 760; x += 40) m -= 0.8 * silv(x + sft);
    if (m > best) { best = m; shift = sft; }
  }
  // … and a thick clump of fur, not a bald gap, runs down under the crest where the eye lands first
  let cshift = 0; best = -1e9;
  for (let sft = 0; sft < 5000; sft += 40) {
    let m = 0;
    for (let x = -220; x <= 220; x += 20) m += clmp(x + sft);
    if (m > best) { best = m; cshift = sft; }
  }
  for (let x = 0; x < TW; x++) {
    const u = x - UMAX;
    clump[x] = L.clamp(clmp(u + cshift));
    coarse[x] = 0.3 + 0.22 * nz(u / 380 + 11, 6.6);              // here broad bundles, there nothing but fine hairs
    silver[x] = silv(u + shift);
    rustD[x] = 70 + 44 * nz(u / 190, 12.5) + 20 * nz(u / 37, 9.9) + 8 * nz(u / 9, 2.2);
  }

  const out = new ImageData(RW, RH), d = out.data;
  const kx = cx - 190, ky = a.crestY + 130;                    // where the key light falls fullest
  for (let j = 0; j < RH; j++) {
    const py = Y0 + j + 0.5, ddy = cy - py;
    for (let i = 0; i < RW; i++) {
      const px = X0 + i + 0.5, ddx = px - cx;
      let v = R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (v < -0.5) continue;
      const cov = v + 0.5 > 1 ? 1 : v + 0.5;                   // anti-aliased lip
      if (v < 0) v = 0;
      const u = Math.atan2(ddx, ddy) * R;
      // the streaks sway a little with the flow of the glaze: not at all at the lip, more with depth
      const dp = v < 140 ? sstep(0, 140, v) : 1;
      const us = u + dp * (5.5 * nw(u / 320, v / 560) + 1.8 * nw(u / 84 + 9, v / 280 - 4));
      let ui = (us + UMAX) | 0; if (ui < 0) ui = 0; else if (ui >= TW) ui = TW - 1;

      // fur "height": noise drawn out along the fall line, coarse bundles down to single hairs
      const fib = nf(us / 3 + 300, v / 70 + 7);                // hair-fine fibres
      const hn = (coarse[ui] * nf(us / 52, v / 2400 + 3.1) + 0.34 * nf(us / 17 + 40, v / 1200 + 11.7) + 0.22 * nf(us / 7 + 80, v / 620 + 5.3) + 0.1 * nf(us / 3.2 + 120, v / 280)) * 3.86 + 0.3 * fib;
      // the threshold it must clear climbs with depth (sooner in the thin gaps, later in the clumps)
      const ve = v * (0.62 + 0.8 * (1 - clump[ui]));
      const q = ve >= 1000 ? 0 : 1 - ve / 1000, td = 1 - q * q;
      const thz = -1.85 + 2.95 * td, e = 0.2 + 0.3 * td;
      const fur = sstep(thz - e, thz + e, hn);
      const core = sstep(thz + 0.1, thz + 1.6, hn);

      const blot = nz(us / 31 + 20, v / 120 + 5);              // slow unevenness along a streak
      const patch = nz(us / 540 + 7, v / 340 + 1.5);           // broad passages, paler here and rustier there
      let tone = 0.42 + 0.13 * hn + 0.2 * core + 0.07 * fib + 0.05 * blot + 0.1 * patch;
      tone = tone < 0 ? 0 : tone > 1 ? 1 : tone;
      const ti = ((tone * 255) | 0) * 3;
      // gold-brown where it leaves the lip; here and there, as it runs down into thicker glaze, it cools to silver
      const sv = 0.6 * sstep(0.54, 0.98, silver[ui] + 0.3 * nz(us / 36 + 50, v / 1300 + 2)) * sstep(80, 340, v);
      const fade = (1 - 0.4 * sstep(160, 680, v)) * (1 + 0.13 * fib + 0.1 * blot);
      const fr = (GOLD[ti] + (SILV[ti] - GOLD[ti]) * sv) * fade;
      const fg = (GOLD[ti + 1] + (SILV[ti + 1] - GOLD[ti + 1]) * sv) * fade;
      const fb = (GOLD[ti + 2] + (SILV[ti + 2] - GOLD[ti + 2]) * sv) * fade;

      // the glaze itself: iron rust where it runs thin under the lip, brown-black below, blue-black where it pools;
      // the deepest slits between the streaks go dark first
      const slit = 0.3 + 0.42 * (1 - sstep(70, 280, v));
      const rz = (1 - sstep(rustD[ui], rustD[ui] + 290, v)) * (slit + (1 - slit) * sstep(thz - 2.1, thz - 0.3, hn));
      const deep = sstep(120, 560, v);
      const gk = rz * (0.84 + 0.16 * fib);
      let r = 25 - 15 * deep + (106 - 25) * gk, g = 14 - 6 * deep + (49 - 14) * gk, b = 10 + (21 - 10) * gk;
      const fa = fur * 0.95;
      r += (fr - r) * fa; g += (fg - g) * fa; b += (fb - b) * fa;

      // the lip: the glaze at its thinnest, a rounded bead of rust
      if (v < 24) {
        const bt = (v - 6.5) / 3.8, k = (1 - sstep(9, 24, v)) * 0.85;
        const lv = (0.76 + 0.5 * Math.exp(-bt * bt)) * (0.9 + 0.2 * blot + 0.1 * fib);
        r += (130 * lv - r) * k; g += (61 * lv - g) * k; b += (27 * lv - b) * k;
      }

      // light: fullest left of the crest, falling away along the rim and down into the bowl
      const dk = Math.sqrt((px - kx) * (px - kx) + (py - ky) * (py - ky));
      const lit = 1.04 * (1 - 0.34 * sstep(300, 1500, dk)) * (1 - 0.3 * sstep(260, 680, v));
      r *= lit; g *= lit; b *= lit;
      const o = (j * RW + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = cov * 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH), cg = cnv.getContext('2d');
  cg.putImageData(out, 0, 0);
  cnv._x = X0; cnv._y = Y0;
  // pinholes where bubbles broke through the glaze in the kiln: a dark pit, a prick of light on its far wall
  cg.save();
  cg.translate(-X0, -Y0);
  cg.globalCompositeOperation = 'source-atop';
  const r = L.rng('s15pits'), sp = a.span(PAD);
  for (let i = 0; i < 40; i++) {
    const th = r.range(-sp, sp), v = 34 + Math.pow(r(), 0.75) * 430, rad = r.range(1.1, 2.6) * (r.chance(0.12) ? 1.6 : 1), sq = r.range(1, 1.5);
    a.at(cg, th, -v, () => {
      cg.fillStyle = 'rgba(40,18,8,0.45)'; cg.beginPath(); cg.ellipse(0, 0, rad * 1.5, rad * 1.5 * sq, 0, 0, L.TAU); cg.fill();
      cg.fillStyle = 'rgba(12,6,4,0.8)'; cg.beginPath(); cg.ellipse(0, 0, rad, rad * sq, 0, 0, L.TAU); cg.fill();
      cg.fillStyle = 'rgba(255,226,184,0.42)'; cg.beginPath(); cg.arc(rad * 0.3, rad * 0.5 * sq, rad * 0.3, 0, L.TAU); cg.fill();
    });
  }
  cg.restore();
  return cnv;
}

/** shallow focus: sharp around the crest, softening along the rim toward both sides and down into the bowl */
function pullFocus(env, geo, wall) {
  const a = env.arc, { X0, Y0, RW, RH } = geo;
  const mask = (xin, xout, vin, vout) => region(X0, Y0, RW, RH, (g) => {
    const t = (xout - xin) / (2 * xout);
    g.fillStyle = L.linear(g, a.cx - xout, 0, a.cx + xout, 0, [[0, 'rgba(0,0,0,1)'], [t * 0.5, 'rgba(0,0,0,0.5)'], [t, 'rgba(0,0,0,0)'], [1 - t, 'rgba(0,0,0,0)'], [1 - t * 0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(X0, Y0, RW, RH);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - vout, a.R - vin, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(X0, Y0, RW, RH);
  });
  const blend = (base, px, m) => {
    const soft = L.blurred(base, px), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in'; sg.drawImage(m, 0, 0);
    const bg = base.getContext('2d');
    bg.globalCompositeOperation = 'destination-out'; bg.drawImage(m, 0, 0);
    bg.globalCompositeOperation = 'lighter'; bg.drawImage(soft, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    return base;
  };
  blend(wall, 2.4, mask(330, 800, 210, 430));
  blend(wall, 6.5, mask(640, 1100, 360, 600));
  // halation: the brightest fur bleeds a little light into the glaze around it and over the lip
  const hot = L.makeCanvas(RW, RH), hg = hot.getContext('2d');
  hg.drawImage(wall, 0, 0); hg.globalCompositeOperation = 'multiply'; hg.drawImage(wall, 0, 0);
  hg.globalCompositeOperation = 'destination-in'; hg.drawImage(wall, 0, 0);
  const wg = wall.getContext('2d');
  wg.globalCompositeOperation = 'screen'; wg.globalAlpha = 0.34; wg.drawImage(L.blurred(hot, 15), 0, 0);
  wg.globalCompositeOperation = 'source-over'; wg.globalAlpha = 1;
  return wall;
}

/**
 * The window reflection lying on the glaze, concentric with the lip: a broad soft patch left of the crest with a wavering
 * edge and the faint orange-peel of a real glaze surface. Returned twice: for colour-dodge, so the fur blazes where the
 * light crosses it (black = no change), and as a cool veil for screen — the shine of the glassy black glaze itself.
 */
function buildSheen(env, geo) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, { X0, Y0, RW, RH } = geo, Q = 2;
  const w = Math.ceil(RW / Q), h = Math.ceil(RH / Q);
  const img = new ImageData(w, h), d = img.data, n = L.makeNoise('s15sheen').n2;
  for (let j = 0; j < h; j++) {
    const ddy = cy - (Y0 + (j + 0.5) * Q);
    for (let i = 0; i < w; i++) {
      const ddx = X0 + (i + 0.5) * Q - cx;
      const v = R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (v < 0) continue;
      const u = Math.atan2(ddx, ddy) * R;
      const vv = v + 9 * n(u / 13 + 40, 2.2) + 4 * n(u / 7, 9.1);   // its edge frays along the relief of the streaks
      const v0 = 152 + 20 * n(u / 430, 1.3) + 6 * n(u / 95, 7.7);
      const body = sstep(v0 - 104, v0 - 30, vv) * (1 - sstep(v0 + 4, v0 + 136, vv));
      const ends = sstep(-880, -430, u) * (1 - sstep(-170, 640, u));   // fullest left of the crest, a long tail to the right
      const peel = 0.8 + 0.2 * n(u / 52 + 3, v / 36);
      const s = body * ends * peel;
      const o = (j * w + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = (s > 1 ? 1 : s) * 255;
    }
  }
  const small = L.makeCanvas(w, h); small.getContext('2d').putImageData(img, 0, 0);
  const tint = (bg, col) => region(X0, Y0, RW, RH, (g) => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small, X0, Y0, w * Q, h * Q);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(X0, Y0, RW, RH);
    if (bg) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = bg; g.fillRect(X0, Y0, RW, RH); }
  });
  return { dodge: tint('#000', '#584f47'), veil: tint(null, 'rgba(244,230,214,0.27)') };
}

/**
 * Light on the lip itself (drawn with screen): the thin film of iridescence — blue-violet over the crest, sliding to
 * cyan toward both sides, never the same strength twice — and, left of the words, the hot glint where the window
 * catches the rounded bead.
 */
function buildRim(env) {
  const a = env.arc, n = L.makeNoise('s15rim').n2;
  const x0 = -PAD, y0 = Math.floor(a.crestY) - 90, w = W + PAD * 2, h = Math.ceil(a.yAt(-PAD)) + 70 - y0;
  // strength along the rim: breathing, with a couple of near-gaps
  const hue = (g, k, lift = 0, seed = 0) => {
    const stops = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, x = -PAD + t * w, m = Math.abs(t - 0.5) * 2;
      const col = m < 0.34 ? L.mix('#6a5cff', '#5f96ee', m / 0.34) : L.mix('#5f96ee', '#58c8d8', L.clamp((m - 0.34) / 0.4));
      const al = L.clamp(0.62 + 0.5 * n(x / 330 + seed, 2.2) + 0.22 * n(x / 70, 8.8 + seed)) * (1 - 0.45 * L.smooth((m - 0.55) / 0.45));
      stops.push([t, L.rgba(L.shade(col, lift), al * k)]);
    }
    return L.linear(g, -PAD, 0, W + PAD, 0, stops);
  };
  const halo = L.blurred(region(x0, y0, w, h, (g) => { g.strokeStyle = hue(g, 1, 0, 0); g.lineWidth = 12; a.stroke(g, 1.5); }), 9);
  const line = region(x0, y0, w, h, (g) => {
    g.strokeStyle = hue(g, 0.95, 0.1, 5); g.lineWidth = 2.6; a.stroke(g, 0.2);
    g.strokeStyle = hue(g, 0.5, 0.45, 9); g.lineWidth = 1.1; a.stroke(g, 0.5);
  });
  // out toward both sides the line goes out of focus with the rest of the picture
  const lineSoft = L.blurred(line, 3.2);
  const sides = (g) => L.linear(g, 0, 0, W, 0, [[0, 'rgba(0,0,0,1)'], [0.14, 'rgba(0,0,0,1)'], [0.3, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [0.86, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']]);
  const lg = line.getContext('2d'); lg.globalCompositeOperation = 'destination-out'; lg.fillStyle = sides(lg); lg.fillRect(x0, y0, w, h);
  const sg = lineSoft.getContext('2d'); sg.translate(-x0, -y0); sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = sides(sg); sg.fillRect(x0, y0, w, h);
  // the glint on the bead: a broken, tapering lick of warm white
  const t0 = a.thetaAtX(a.cx - 590), t1 = a.thetaAtX(a.cx - 356);
  const glint = region(x0, y0, w, h, (g) => {
    const gx0 = a.cx - 590, gx1 = a.cx - 356;
    g.lineCap = 'round';
    g.strokeStyle = L.linear(g, gx0, 0, gx1, 0, [[0, 'rgba(255,236,206,0)'], [0.2, 'rgba(255,236,206,0.75)'], [0.48, 'rgba(255,246,228,1)'], [0.56, 'rgba(255,240,214,0.5)'], [0.62, 'rgba(255,246,228,0.95)'], [0.86, 'rgba(255,232,196,0.5)'], [1, 'rgba(255,232,196,0)']]);
    g.lineWidth = 4.2; a.stroke(g, -4.6, t0, t1);
    g.lineWidth = 2; a.stroke(g, -8.5, L.lerp(t0, t1, 0.3), L.lerp(t0, t1, 0.74));
  });
  // the film of iridescence spills a little way onto the bead itself
  const spill = region(x0, y0, w, h, (g) => {
    g.fillStyle = hue(g, 1, 0, 3); a.pathBand(g, 1, -26); g.fill();
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 26, a.R + 1, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.34)']]);
    g.fillRect(x0, y0, w, h);
  });
  return region(x0, y0, w, h, (g) => {
    g.drawImage(halo, x0, y0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(spill, x0, y0);
    g.drawImage(line, x0, y0); g.drawImage(lineSoft, x0, y0);
    g.globalAlpha = 0.55; g.drawImage(L.blurred(glint, 13), x0, y0);
    g.globalAlpha = 0.8; g.drawImage(L.blurred(glint, 3.5), x0, y0);
    g.globalAlpha = 1; g.drawImage(L.blurred(glint, 0.8), x0, y0);
  });
}

/** beyond the lip: darkness with a breath of warmth in it, not a dead black — calm and even behind the words */
function buildBack(env) {
  const a = env.arc, c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = L.radial(g, a.cx - 120, a.crestY + 60, 80, 1250, [[0, '#151211'], [0.3, '#110e0e'], [0.62, '#0c0a0a'], [1, '#070606']]);
  g.fillRect(0, 0, W, H);
  return c;
}

export default {
  name: '建盏兔毫',
  tone: 'light',
  init(env) {
    const geo = geometry(env);
    const wall = pullFocus(env, geo, buildWall(env, geo));
    const sheen = buildSheen(env, geo);
    S = { geo, wall, dodge: sheen.dodge, veil: sheen.veil, rim: buildRim(env), back: buildBack(env) };
  },
  draw(ctx, env, p) {
    ctx.save();
    ctx.drawImage(S.back, 0, 0);
    const rot = L.lerp(-0.013, 0.013, p), zoom = L.lerp(1.0, 1.012, p);
    L.cam(ctx, env, { zoom }, () => {
      // the glaze slides along the rim …
      L.cam(ctx, env, { rot }, () => put(ctx, S.wall));
      // … under light that stays where it is
      ctx.globalCompositeOperation = 'color-dodge'; put(ctx, S.dodge);
      ctx.globalCompositeOperation = 'screen'; put(ctx, S.veil);
      // the iridescent film creeps along the lip
      L.cam(ctx, env, { rot: L.lerp(-0.006, 0.008, p) }, () => put(ctx, S.rim));
      ctx.globalCompositeOperation = 'source-over';
    });
    ctx.restore();
    L.vignette(ctx, { strength: 0.3 });
  },
};
