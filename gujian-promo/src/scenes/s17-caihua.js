// s17 — 旋子彩画. Macro of Qing-style beam painting (梁枋彩画), bent into concentric bands under the arc:
//   arc        : a raised, gilded 沥粉贴金 line (the dominant edge)
//   below it   : the 箍头 band — 群青 with 退晕 steps and a strip of 连珠 pearls on black
//   then       : the 藻头 — big 旋花 in the standard "一整二破" layout: whole rosettes on the centre line, half rosettes
//                hanging from the upper line and rising from the lower one, every circle touching its neighbours.
//                青/绿 alternate ring by ring and flower by flower; every 旋瓣 is tucked under the next one (the whirl
//                that gives 旋子 its name) and steps deep → mid → light → white line (退晕);
//                the 旋眼 and the little 菱角地 grounds left between the circles are gilded.
//   above      : the vermilion-lacquered board (垫板): ONE even field of 朱 with hairline 断纹 — kept calm for the tagline
// Everything is painted flat first, then aged: mineral-pigment grain, craquelure (a few cells flaked off to the pale 地仗
// ground, only out toward the ends), relief lighting from a height map (raised 沥粉 lines, thick white 粉 lines), gold-leaf
// glitter; finally a shallow depth of field — sharp round the crest, soft toward both ends and the corners.
import * as L from '../lib/core.js';

const { W, H, TAU } = L;
const PAD = 80;
let S = null;

// ── layout: radial offsets from the arc (negative = below it) ──
const BEAD = 20;                    // gilded bead sitting exactly under the arc: dr 0 → -20
const BAND = 80;                    // 箍头 band
const LINE = 8;                     // secondary gilded lines
const RW = 170;                     // radius of one 旋花
const B_TOP = -BEAD;
const FZ0 = B_TOP - BAND - LINE;    // top of the rosette zone (-108)
const FC = FZ0 - RW;                // rosette centres
const FZ1 = FZ0 - 2 * RW;           // bottom of the rosette zone
const B2_TOP = FZ1 - LINE;          // lower band
const BEAD2 = B2_TOP - BAND;

const COL = {
  b: { deep: '#14309c', mid: '#2a58d2', light: '#8db2f4' },
  g: { deep: '#078a62', mid: '#1fc08a', light: '#a4f0cc' },
  white: '#f6f2e6', ink: '#070b1c', ground: '#0a1436', strip: '#07080f', jitter: true,
};
// the same drawing in greys = a height map (white 粉 lines stand proud, ink lines sit low)
const HGT = {
  b: { deep: '#8a8a8a', mid: '#8b8b8b', light: '#8c8c8c' },
  g: { deep: '#8a8a8a', mid: '#8b8b8b', light: '#8c8c8c' },
  white: '#9c9c9c', ink: '#707070', ground: '#7c7c7c', strip: '#787878', jitter: false,
};

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const disc = (g, x, y, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };

/**
 * "一整二破": whole rosettes (W) on the centre line, half rosettes hanging from the upper line (T) and rising from the
 * lower line (B), all mutually tangent. Because the band is curved the three radii come out slightly different.
 * → { d: half the angular pitch, K, RT, RB }
 */
function lattice(a) {
  const r1 = a.R + FC, rT = a.R + FZ0, rB = a.R + FZ1;
  const dist = (ra, rb, t) => Math.sqrt(ra * ra + rb * rb - 2 * ra * rb * Math.cos(t));
  let lo = 0.02, hi = 0.4;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (dist(r1, rT, m) + dist(r1, rB, m) < 4 * RW) lo = m; else hi = m; }
  const d = (lo + hi) / 2;
  return { d, K: Math.ceil(a.span(PAD + 260) / (2 * d)) + 1, RT: dist(r1, rT, d) - RW, RB: dist(r1, rB, d) - RW };
}
/** visit every circle of the lattice: fn(theta, dr, radius, kind) — the halves first, then the whole rosettes */
function eachFlower(a, fn) {
  const lat = lattice(a);
  for (let k = -lat.K; k < lat.K; k++) { fn((2 * k + 1) * lat.d, FZ0, lat.RT, 'T'); fn((2 * k + 1) * lat.d, FZ1, lat.RB, 'B'); }
  for (let k = -lat.K; k <= lat.K; k++) fn(2 * k * lat.d, FC, RW, 'W');
}

// ── allocation-free worley noise (results in cE = d2-d1, cId) ──
let cE = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 255) / 255; } else if (d < d2) d2 = d;
  }
  cE = Math.sqrt(d2) - Math.sqrt(d1); cId = id;
}

// ───────────────────────── the painted pattern (colour or height palette) ─────────────────────────
/** one 旋瓣 / pearl-like disc with 退晕: ink outline → white 粉 line → light → mid → deep core */
function petal(g, P, pal, x, y, r, tone, jr, ft = 0) {
  const ox = jr ? jr.range(-2.2, 2.2) : 0, oy = jr ? jr.range(-2.2, 2.2) : 0;
  const t = ft + (jr ? jr.range(-0.08, 0.08) : 0);
  const j = jr ? jr.range(-0.014, 0.014) : 0, j2 = jr ? jr.range(-0.012, 0.012) : 0;   // hand-laid 退晕 steps wander
  const grd = g.createRadialGradient(x + ox, y + oy, 0, x, y, r);
  const deep = tone(pal.deep, t), mid = tone(pal.mid, t), light = tone(pal.light, t);
  grd.addColorStop(0, deep); grd.addColorStop(0.57 + j, deep);
  grd.addColorStop(0.6 + j, mid); grd.addColorStop(0.725 + j2, mid);
  grd.addColorStop(0.755 + j2, light); grd.addColorStop(0.86, light);
  grd.addColorStop(0.875, P.white); grd.addColorStop(0.945, P.white);
  grd.addColorStop(0.96, P.ink); grd.addColorStop(1, P.ink);
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

/** a whole 旋花 at the local origin (−y = outward) */
function xuanhua(g, P, outer, inner, tone, jr, gr) {
  disc(g, 0, 0, RW, P.ground);
  const ft = jr ? jr.range(-0.06, 0.06) : 0;               // every flower is mixed from a slightly different pot
  // every petal is tucked under the next one round the ring → the whirl (旋) that gives the pattern its name.
  // `gr` wobbles each petal by a couple of px (set out by hand, not by compass); it is seeded the same for the colour and
  // the height pass so the relief still registers with the paint.
  const ring = (n, rc, rd, pal, phase) => {
    const ps = [];
    for (let k = 0; k < n; k++) {
      const v = phase + (k * TAU) / n + gr.range(-0.022, 0.022), c = rc * gr.range(0.982, 1.014);
      ps.push([c * Math.sin(v), -c * Math.cos(v), rd * gr.range(0.965, 1.03)]);
    }
    for (let k = 0; k < n; k++) {
      const p = ps[k], q = ps[(k + 1) % n];
      g.save();
      g.beginPath(); g.rect(-RW * 1.2, -RW * 1.2, RW * 2.4, RW * 2.4); g.arc(q[0], q[1], q[2], 0, TAU); g.clip('evenodd');
      petal(g, P, pal, p[0], p[1], p[2], tone, jr, ft);
      g.restore();
    }
  };
  const ph = gr.range(-0.05, 0.05);
  g.save(); g.beginPath(); g.arc(0, 0, RW, 0, TAU); g.clip();
  ring(12, RW * 0.652, RW * 0.338, outer, ph);                                  // 头路瓣
  ring(8, RW * 0.365, RW * 0.218, inner, TAU / 16 + ph + gr.range(-0.05, 0.05)); // 二路瓣
  g.restore();
  disc(g, 0, 0, RW * 0.262, P.ink); disc(g, 0, 0, RW * 0.24, P.white);   // collar of the 旋眼 (the eye itself is gold)
}

/** 箍头 band: 退晕 stripes either side of a black strip of 连珠 pearls */
function bandStripes(g, a, top, P, pal, pearl, s, tone, jr) {
  const st = [[0, P.ink], [3, P.white], [8, pal.light], [16, pal.deep], [23, P.strip], [57, pal.deep], [64, pal.light], [72, P.white], [77, P.ink]];
  for (let i = 0; i < st.length; i++) a.fillBand(g, st[i][1], top - st[i][0] + (i ? 0.4 : 0), top - BAND, -s, s);
  const dr = top - 40;
  a.along({ spacing: 38, dr, t0: -s, t1: s }, (q) => {
    a.at(g, q.theta, dr, () => {
      const t = jr ? jr.range(-0.1, 0.1) : 0;
      if (P.jitter) {
        const k = jr.range(0.9, 1.08), px = jr.range(-1.4, 1.4), py = jr.range(-1.2, 1.2);
        disc(g, px, py, 14 * k, tone(pearl.deep, t)); disc(g, px - 0.8, py - 1, 10 * k, tone(pearl.light, t)); disc(g, px - 2.8, py - 3.4, 4.5 * k, P.white);
      } else {
        g.fillStyle = L.radial(g, 0, 0, 0, 14, [[0, '#b4b4b4'], [0.6, '#9c9c9c'], [1, '#7a7a7a']]); g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
      }
    });
  });
}

function drawPattern(g, env, P) {
  const a = env.arc, s = a.span(PAD + 320);
  const jr = P.jitter ? L.rng('s17jit') : null, gr = L.rng('s17geo');
  const tone = (c, t) => (t ? L.shade(c, t) : c);
  g.save(); a.clipBelow(g, 0);
  a.fillBelow(g, P.ground, 2);
  bandStripes(g, a, B_TOP, P, P.b, P.g, s, tone, jr);
  a.fillBand(g, P.ground, FZ0 + 1, FZ1 - 1, -s, s);
  // 一整二破: the half rosettes are 绿 outside / 青 inside, the whole ones the reverse
  g.save(); a.clipBand(g, FZ0 + 0.5, FZ1 - 0.5, -s, s);
  eachFlower(a, (th, dr, r, kind) => a.at(g, th, dr, () => {
    g.scale(r / RW, r / RW);
    if (kind === 'W') xuanhua(g, P, P.b, P.g, tone, jr, gr); else xuanhua(g, P, P.g, P.b, tone, jr, gr);
  }));
  g.restore();
  bandStripes(g, a, B2_TOP, P, P.g, P.b, s, tone, jr);
  g.restore();
}

// ───────────────────────── gilding ─────────────────────────
function goldBand(g, a, top, w, s) {
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R + top - w, a.R + top, [[0, '#5f3a09'], [0.22, '#a9741a'], [0.5, '#dba634'], [0.74, '#f7d56a'], [0.9, '#fff0b0'], [1, '#f4cf66']]);
  a.pathBand(g, top, top - w, -s, s); g.fill();
}
function goldRing(g, r, w) {
  g.lineWidth = w; g.strokeStyle = '#7a4d0c'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  g.lineWidth = w - 2.2; g.strokeStyle = '#e3b341'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  g.lineWidth = w * 0.4; g.strokeStyle = '#fff0b4'; g.beginPath(); g.arc(-w * 0.1, -w * 0.15, r, 0, TAU); g.stroke();
}
/** gilded boss: the 旋眼, a dome with a little ring of seed-petals */
function goldBoss(g, r, petals) {
  g.fillStyle = L.radial(g, -r * 0.34, -r * 0.4, r * 0.04, r * 1.2, [[0, '#fff6c8'], [0.22, '#f8d566'], [0.55, '#d79f2e'], [0.85, '#99661a'], [1, '#5f3a09']]);
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(84,48,6,0.8)'; g.lineWidth = Math.max(1.4, r * 0.07);
  if (petals) {
    for (let k = 0; k < petals; k++) {
      const v = (k * TAU) / petals, x = Math.sin(v) * r * 0.6, y = -Math.cos(v) * r * 0.6;
      g.beginPath(); g.arc(x, y, r * 0.3, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,244,190,0.55)'; g.beginPath(); g.arc(x - r * 0.07, y - r * 0.09, r * 0.13, 0, TAU); g.fill();
    }
    g.beginPath(); g.arc(0, 0, r * 0.3, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,250,215,0.8)'; g.beginPath(); g.arc(-r * 0.08, -r * 0.1, r * 0.13, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(70,40,4,0.85)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r - 1, 0, TAU); g.stroke();
}

/** noise for one rectangle of the frame (frame coords; draw it back at r.x, r.y). opts.polar → follows the arc */
function rectNoise(env, r, opts) {
  const a = env.arc;
  return L.noiseTex(r.w, r.h, { ...opts, ox: r.x, oy: r.y, polar: opts.polar ? { cx: a.cx, cy: a.cy, R: a.R } : null });
}
const FW = W + PAD * 2, FH = H + PAD * 2;
const topRect = (a) => ({ x: -PAD, y: -PAD, w: FW, h: Math.ceil(a.yAt(-PAD) + 16 + PAD) });                       // lacquer
const botRect = (a) => ({ x: -PAD, y: Math.floor(a.crestY - 6), w: FW, h: Math.ceil(H + PAD - a.crestY + 6) });   // painted beam
/** same alpha as src, one flat colour */
function tint(src, color) {
  const c = L.makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

const GAP = 8;    // dark ground left between a rosette's gilded rim and the gilded 菱角地 beside it

/** the gilding, in two sheets: `raised` = 沥粉 lines, rims and 旋眼 (they stand proud); `flat` = the leaf laid on the 菱角地 */
function buildGold(env) {
  const a = env.arc, s = a.span(PAD + 320), B = botRect(a);
  const leaf = (g, seed, scale, alpha) => {
    // gold leaf: uneven burnish, worn spots where the red bole shows, pin-point glitter
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = alpha;
    g.drawImage(rectNoise(env, B, { seed, scale, octaves: 3, res: 0.33, contrast: 1.8,
      ramp: [[0, 'rgba(92,50,6,0.95)'], [0.4, 'rgba(190,130,30,0)'], [0.66, 'rgba(255,240,170,0)'], [1, 'rgba(255,249,206,0.9)']] }), B.x, B.y);
    g.globalAlpha = 1;
  };
  const flat = L.makeLayer(PAD, (g) => {
    // 菱角地: the little grounds left between the circles, gilded; each keeps a dark margin so the rosettes stay青绿-led
    g.fillStyle = L.linear(g, 0, a.crestY, W, H + 200, [[0, '#f8d76c'], [0.45, '#e6b43e'], [1, '#b98422']]);
    a.pathBand(g, FZ0 - GAP + 2, FZ1 + GAP - 2, -s, s); g.fill();
    g.globalCompositeOperation = 'destination-out';
    eachFlower(a, (th, dr, r) => a.at(g, th, dr, () => disc(g, 0, 0, r + GAP, '#000')));
    leaf(g, 's17leafF', 62, 0.55);
    L.speckle(g, { seed: 's17boleF', count: 420, x: B.x, y: B.y, w: B.w, h: B.h, rMin: 0.8, rMax: 3.4, colors: ['#8a3413', '#6a2c0c', '#a2541a'], alpha: [0.2, 0.7] });
    L.speckle(g, { seed: 's17glitF', count: 2600, x: B.x, y: B.y, w: B.w, h: B.h, rMin: 0.5, rMax: 1.4, colors: ['#fffbe0', '#fff2ae', '#ffffff'], alpha: [0.3, 0.95] });
  });
  const raised = L.makeLayer(PAD, (g) => {
    // 沥粉 rims and gilded 旋眼
    const br = L.rng('s17boss');
    g.save(); a.clipBand(g, FZ0 + 2, FZ1 - 2, -s, s);
    eachFlower(a, (th, dr, r) => a.at(g, th, dr, () => {
      g.scale(r / RW, r / RW); goldRing(g, RW - 3.5, 7);
      g.translate(br.range(-2, 2), br.range(-2, 2)); g.rotate(br.range(-0.4, 0.4)); goldBoss(g, RW * 0.2 * br.range(0.93, 1.07), 7);
    }));
    g.restore();
    goldBand(g, a, 0, BEAD, s);
    goldBand(g, a, B_TOP - BAND, LINE, s);
    goldBand(g, a, FZ1, LINE, s);
    goldBand(g, a, BEAD2, BEAD, s);
    leaf(g, 's17leaf', 34, 0.62);
    L.speckle(g, { seed: 's17bole', count: 2200, x: B.x, y: B.y, w: B.w, h: B.h, rMin: 0.7, rMax: 3.0, colors: ['#8a3413', '#5d2a0c', '#a2541a'], alpha: [0.22, 0.75] });
    L.speckle(g, { seed: 's17glit', count: 5000, x: B.x, y: B.y, w: B.w, h: B.h, rMin: 0.5, rMax: 1.5, colors: ['#fffbe0', '#fff2ae', '#ffffff'], alpha: [0.35, 1] });
  });
  const all = L.makeLayer(PAD);
  const ag = all.getContext('2d'); ag.drawImage(flat, -PAD, -PAD); ag.drawImage(raised, -PAD, -PAD);
  return { flat, raised, all };
}

/** glitter that only exists where there is gold; two of these cross-fade → the leaf twinkles. Covers botRect only. */
function buildSpark(env, gold, seed) {
  const B = botRect(env.arc);
  const dot = L.makeCanvas(24, 24), dg = dot.getContext('2d');
  dg.fillStyle = L.radial(dg, 12, 12, 0, 12, [[0, 'rgba(255,252,230,1)'], [0.35, 'rgba(255,236,150,0.8)'], [1, 'rgba(255,210,90,0)']]);
  dg.fillRect(0, 0, 24, 24);
  const c = L.makeCanvas(B.w, B.h), g = c.getContext('2d');
  g.translate(-B.x, -B.y);
  const r = L.rng(seed);
  for (let i = 0; i < 3400; i++) {
    const x = r.range(B.x, B.x + B.w), y = r.range(B.y, B.y + B.h), rad = r.range(1.2, 4.2);
    g.drawImage(dot, x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(gold, -PAD, -PAD);
  return c;
}

/** L.blit for an image whose top-left sits at frame (x0, y0) */
function blitAt(ctx, env, img, x0, y0, { rot = 0, zoom = 1, alpha = 1, blend = 'source-over' } = {}) {
  const a = env.arc;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = blend;
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(img, x0, y0);
  ctx.restore();
}

// ───────────────────────── ageing of the painted beam: craquelure + a few flaked cells ─────────────────────────
function buildAging(env) {
  const a = env.arc, res = 0.7;
  const cw = Math.round(FW * res), ch = Math.round(FH * res);
  const nz = L.makeNoise('s17zone');
  const cImg = new ImageData(cw, ch), fImg = new ImageData(cw, ch), cd = cImg.data, fd = fImg.data;
  // slow fields on a coarse grid
  const CS = 6, gw = Math.ceil(cw / CS) + 2, gh = Math.ceil(ch / CS) + 2;
  const zf = new Float32Array(gw * gh), wx = new Float32Array(gw * gh), wy = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const fx = (i * CS) / res - PAD, fy = (j * CS) / res - PAD, ddx = fx - a.cx, ddy = a.cy - fy;
    const u = Math.atan2(ddx, ddy) * a.R, v = a.R - Math.hypot(ddx, ddy), k = j * gw + i;
    zf[k] = nz.fbm(u / 480, v / 480 + 3.3, 3);
    wx[k] = nz.fbm(u / 150 + 40.5, v / 150, 2); wy[k] = nz.fbm(u / 150 - 7.1, v / 150 + 21.7, 2);
  }
  const bil = (src, x, y) => {
    const fx = x / CS, fy = y / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * gw + i0;
    return (src[k] + (src[k + 1] - src[k]) * tx) * (1 - ty) + (src[k + gw] + (src[k + gw + 1] - src[k + gw]) * tx) * ty;
  };
  const y0 = Math.max(0, Math.floor((a.crestY - 4 + PAD) * res));
  let i = y0 * cw * 4;
  for (let y = y0; y < ch; y++) {
    const fy = y / res - PAD;
    for (let x = 0; x < cw; x++, i += 4) {
      const fx = x / res - PAD, ddx = fx - a.cx, ddy = a.cy - fy;
      const v = a.R - Math.sqrt(ddx * ddx + ddy * ddy);
      if (v <= 0) continue;
      const u = Math.atan2(ddx, ddy) * a.R;
      const m = L.clamp(0.5 + bil(zf, x, y) * 1.25), ux = bil(wx, x, y), uy = bil(wy, x, y);
      // paint on timber: cracks run mostly with the grain (along the arc); out toward the ends a few cells have dropped off
      cell(u / 92 + ux * 0.5, v / 58 + uy * 0.5);
      let ci = (1 - sstep(0.0, 0.04, cE)) * (0.16 + 0.7 * m), fl = 0;
      const keep = 0.04 + 0.96 * sstep(470, 1000, Math.abs(u));
      if (v > 120 && cId < (0.003 + 0.022 * sstep(0.66, 1, m)) * keep) fl = sstep(0.05, 0.075, cE);
      cell(u / 33 + 9.5 + ux * 1.1, v / 23 + 5.5 + uy * 1.1);
      ci = Math.max(ci, (1 - sstep(0.0, 0.07, cE)) * 0.46 * sstep(0.5, 0.95, m));
      if (v > 120 && cId < (0.005 + 0.06 * sstep(0.62, 1, m)) * keep) fl = Math.max(fl, sstep(0.06, 0.09, cE));
      cd[i] = 8; cd[i + 1] = 10; cd[i + 2] = 24; cd[i + 3] = ci * 255;
      fd[i] = fd[i + 1] = fd[i + 2] = 255; fd[i + 3] = fl * 255;
    }
  }
  const up = (img) => {
    const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
    const out = L.makeCanvas(FW, FH), g = out.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, FW, FH);
    out._pad = PAD; return out;
  };
  return { crack: up(cImg), flake: up(fImg) };
}

// ───────────────────────── vermilion lacquer above the arc ─────────────────────────
const RED = '#aa1a25';
/** 0 inside the tagline zone → 1 well outside it */
const quiet = (a, x, y) => sstep(0.75, 1.55, Math.hypot((x - a.cx) / 480, (y - (a.crestY - 135)) / 225));

/**
 * 断纹: hair cracks that run with the board (so roughly along the arc), wandering and tapering, tied to their neighbours by
 * short cross-breaks → long narrow cells (流水断), never the fat scales of dried mud. Patchy; almost absent behind the tagline.
 */
function lacquerCracks(g, env) {
  const a = env.arc, r = L.rng('s17lqc'), nz = L.makeNoise('s17lqz'), s = a.span(PAD + 80);
  g.save(); g.lineCap = 'round';
  const seg = (x0, y0, x1, y1, w, al) => {
    if (al < 0.03) return;
    g.lineWidth = w; g.strokeStyle = `rgba(255,138,132,${(al * 0.3).toFixed(3)})`;           // lit lower lip of the crack
    g.beginPath(); g.moveTo(x0 + 0.9, y0 + 1.2); g.lineTo(x1 + 0.9, y1 + 1.2); g.stroke();
    g.lineWidth = w; g.strokeStyle = `rgba(52,3,13,${(al * 0.66).toFixed(3)})`;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  for (let i = 0; i < 230; i++) {
    let dr = 14 + Math.pow(r(), 0.9) * 820;
    const th = r.range(-s, s), len = r.range(220, 1300) / a.R, steps = Math.ceil((len * a.R) / 12);
    const w0 = r.range(0.9, 1.8), tilt = r.range(-30, 30);
    const zth = (th * a.R) / 560, zdr = dr / 240;
    let prev = a.pt(th, dr), drift = 0;
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      drift = drift * 0.95 + r.range(-1.6, 1.6);
      if (r.chance(0.03)) dr += r.range(-9, 9);
      const q = a.pt(th + len * u, dr + drift + tilt * u);
      const zone = 0.3 + 0.7 * sstep(-0.3, 0.3, nz.fbm(zth + (len * u * a.R) / 560, zdr, 2));
      const far = 1 - 0.7 * sstep(760, 1250, Math.hypot(q.x - a.cx, (q.y - a.crestY) * 1.3));   // out where the lens has let go, cracks would only smear
      const taper = Math.sqrt(Math.sin(Math.PI * u)), al = zone * taper * far * quiet(a, q.x, q.y);
      seg(prev.x, prev.y, q.x, q.y, w0 * (0.4 + 0.6 * taper), al);
      if (r.chance(0.085)) {   // a short cross-break toward the neighbouring crack
        const h = r.range(10, 44) * (r.chance(0.5) ? 1 : -1), e = a.pt(th + len * u + r.range(-7, 7) / a.R, dr + drift + tilt * u + h);
        const m = { x: (q.x + e.x) / 2 + r.range(-2, 2), y: (q.y + e.y) / 2 + r.range(-2, 2) };
        seg(q.x, q.y, m.x, m.y, w0 * 0.62, al * 0.9); seg(m.x, m.y, e.x, e.y, w0 * 0.45, al * 0.75);
      }
      prev = q;
    }
  }
  g.restore();
}

function paintLacquer(g, env) {
  const a = env.arc, T = topRect(a);
  // one even field of 朱: only a breath of fall-off, no brown, no dark corner
  g.fillStyle = L.radial(g, a.cx - 260, a.crestY - 420, 200, 1700, [[0, '#ae1b26'], [0.55, RED], [1, '#a21822']]);
  g.fillRect(-PAD, -PAD, FW, FH);
  // depth of the lacquer: slow clouds, then the brush drag of the last coat (follows the board = along the arc)
  g.save();
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.1;
  g.drawImage(rectNoise(env, T, { seed: 's17lq1', scale: 380, octaves: 4, warp: 0.7, res: 0.14, contrast: 1.5 }), T.x, T.y);
  g.globalAlpha = 0.13;
  g.drawImage(rectNoise(env, T, { seed: 's17lq2', polar: true, scale: 9, sx: 34, sy: 1, octaves: 3, res: 0.5, contrast: 1.5 }), T.x, T.y);
  g.restore();
  lacquerCracks(g, env);
  L.speckle(g, { seed: 's17pit', count: 1700, x: T.x, y: T.y, w: T.w, h: T.h, rMin: 0.5, rMax: 1.6, colors: ['#3a0612', '#4c0a18'], alpha: [0.12, 0.45] });
  L.speckle(g, { seed: 's17dust', count: 520, x: T.x, y: T.y, w: T.w, h: T.h, rMin: 0.4, rMax: 1.3, colors: ['#f4c0c8', '#ffe0e4'], alpha: [0.08, 0.3] });
  // even out the tagline zone
  g.save(); g.translate(a.cx, a.crestY - 140); g.scale(1, 0.5);
  g.fillStyle = L.radial(g, 0, 0, 0, 560, [[0, L.rgba(RED, 0.6)], [0.6, L.rgba(RED, 0.48)], [1, L.rgba(RED, 0)]]);
  g.fillRect(-600, -600, 1200, 1200);
  g.restore();
  // the board sits behind the beam: contact shade just above the arc
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 30, [[0, 'rgba(36,2,10,0.6)'], [0.3, 'rgba(36,2,10,0.28)'], [1, 'rgba(36,2,10,0)']]);
  a.pathBand(g, 32, -2); g.fill();
}

/** shallow focus: sharp round the crest, falling off toward both ends of the beam, the bottom and the top corners */
function depthOfField(main, env) {
  const a = env.arc;
  const pass = (px, r0, r1) => {
    const k = 0.5, sm = L.makeCanvas(FW * k, FH * k), sg = sm.getContext('2d');
    sg.filter = `blur(${px * k}px)`; sg.drawImage(main, 0, 0, sm.width, sm.height); sg.filter = 'none';
    const out = L.makeCanvas(FW, FH), g = out.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(sm, 0, 0, FW, FH);
    g.globalCompositeOperation = 'destination-in';
    g.translate(PAD + a.cx, PAD + a.crestY + 40); g.scale(1, 0.72);
    g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(-3000, -3000, 6000, 6000);
    return out;
  };
  const near = pass(3, 440, 900), far = pass(8, 780, 1350);
  const g = main.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(near, 0, 0); g.drawImage(far, 0, 0);
  g.restore();
}

function buildMain(env) {
  const a = env.arc, B = botRect(a);
  const gold = buildGold(env);
  const { crack, flake } = buildAging(env);
  const grain = L.grainTex(FW >> 1, FH >> 1, { seed: 's17pg', amount: 0.85 });

  // height map → relief light
  const height = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#808080'; g.fillRect(-PAD, -PAD, FW, FH);
    drawPattern(g, env, HGT);
    g.save(); a.clipBelow(g, 0);
    g.globalAlpha = 0.2; g.globalCompositeOperation = 'overlay';
    g.drawImage(grain, -PAD - 37, -PAD - 23, FW + 60, FH + 60);
    g.restore();
    g.globalAlpha = 0.95; g.drawImage(tint(gold.raised, '#ffffff'), -PAD, -PAD);
    g.globalAlpha = 0.85; g.drawImage(tint(flake, '#383838'), -PAD, -PAD);
    g.globalAlpha = 0.6; g.drawImage(tint(crack, '#101010'), -PAD, -PAD);
  });

  // NB: with white = high, bumpLight's angle 45 is what lights raised detail from the upper left
  const bump = L.bumpLight(height, { angle: 45, strength: 3.2, blur: 0.7, res: 0.6 });

  // the bare 地仗 ground that shows where paint has flaked: pale hemp-and-ash, so it reads as a lost chip, not as a stain
  const chips = L.makeLayer(PAD, (g) => {
    g.drawImage(L.noiseTex(FW >> 1, FH >> 1, { seed: 's17ground', scale: 22, octaves: 3, res: 0.5, contrast: 1.6, ramp: [[0, '#6a5540'], [0.5, '#a89070'], [1, '#cdb88e']] }), -PAD, -PAD, FW, FH);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5; g.drawImage(grain, -PAD, -PAD, FW, FH);
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(flake, -PAD, -PAD);
  });

  // pigment particles as a grey sheet → overlaid, so they brighten / deepen the colour underneath instead of chalking it
  const part = L.makeCanvas(B.w, B.h), pg = part.getContext('2d');
  pg.translate(-B.x, -B.y);
  L.speckle(pg, { seed: 's17xtal', count: 7000, x: B.x, y: B.y, w: B.w, h: B.h, rMin: 0.6, rMax: 2.4, colors: ['#ffffff'], alpha: [0.12, 0.6] });
  L.speckle(pg, { seed: 's17dark', count: 4500, x: B.x, y: B.y, w: B.w, h: B.h, rMin: 0.6, rMax: 2.6, colors: ['#000000'], alpha: [0.1, 0.42] });

  const main = L.makeLayer(PAD, (g) => {
    paintLacquer(g, env);
    drawPattern(g, env, COL);
    // mineral pigment: uneven density, brush drag, coarse crystals — all inside each colour's own hue
    g.save(); a.clipBelow(g, 0);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.34;
    g.drawImage(rectNoise(env, B, { seed: 's17mott', scale: 44, octaves: 4, warp: 0.7, res: 0.3, contrast: 1.6 }), B.x, B.y);
    g.globalAlpha = 0.26;
    g.drawImage(rectNoise(env, B, { seed: 's17brush', polar: true, scale: 7, sx: 10, sy: 1, octaves: 2, res: 0.5, contrast: 1.4 }), B.x, B.y);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.36;
    g.drawImage(grain, -PAD, -PAD, FW, FH);
    g.globalAlpha = 1; g.drawImage(part, B.x, B.y);
    g.restore();

    // gilding: the leaf on the 菱角地 lies flat, the 沥粉 lines stand proud of the paint
    g.drawImage(gold.flat, -PAD, -PAD);
    g.save(); g.shadowColor = 'rgba(3,5,18,0.7)'; g.shadowBlur = 5; g.shadowOffsetX = 2.5; g.shadowOffsetY = 3.5;
    g.drawImage(gold.raised, -PAD, -PAD);
    g.restore();
    // craquelure, flaked cells
    g.globalAlpha = 0.7; g.drawImage(crack, -PAD, -PAD); g.globalAlpha = 1;
    g.drawImage(chips, -PAD, -PAD);
    // relief
    g.globalCompositeOperation = 'overlay'; g.drawImage(bump, -PAD, -PAD);
    // key light from the upper left across the beam (the lacquer board above stays even); cool shade toward the lower right
    g.save(); a.clipBelow(g, 0);
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.linear(g, 0, a.crestY - 100, W, H, [[0, 'rgba(255,248,232,0.38)'], [0.5, 'rgba(128,128,128,0)'], [1, 'rgba(0,6,40,0.34)']]);
    g.fillRect(-PAD, -PAD, FW, FH);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 640, a.R - 250, [[0, 'rgba(10,14,52,0.42)'], [1, 'rgba(10,14,52,0)']]);
    a.pathBelow(g, -200); g.fill();
    g.restore();
  });
  // a little punch for the mineral colours only (the red board keeps its even value): the beam overlaid on itself
  {
    const copy = L.makeCanvas(FW, FH); copy.getContext('2d').drawImage(main, 0, 0);
    const g = main.getContext('2d');
    g.save(); a.clipBelow(g, 0); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.24; g.drawImage(copy, -PAD, -PAD); g.restore();
  }
  depthOfField(main, env);
  return { main, gold: gold.all };
}

/** a soft round glint of leaf catching the light (no star rays) */
function flare(ctx, x, y, size, alpha) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha; ctx.translate(x, y);
  ctx.fillStyle = L.radial(ctx, 0, 0, 0, size, [[0, 'rgba(255,250,225,0.9)'], [0.16, 'rgba(255,228,150,0.42)'], [0.5, 'rgba(255,200,90,0.1)'], [1, 'rgba(255,190,70,0)']]);
  ctx.fillRect(-size, -size, size * 2, size * 2);
  ctx.restore();
}

export default {
  name: '旋子彩画',
  tone: 'light',
  async init(env) {
    const a = env.arc, lat = lattice(a), B = botRect(a);
    const { main, gold } = buildMain(env);
    // where the leaf catches the light: the rosette eyes and a few points on the bead (none under the tagline)
    const glints = [];
    for (let k = -1; k <= 1; k++) { const q = a.pt(2 * k * lat.d, FC); glints.push({ x: q.x - 12, y: q.y - 14, ph: (k + 1) * 0.55, size: 30 }); }
    for (let k = -2; k < 2; k++) { const q = a.pt((2 * k + 1) * lat.d, FZ0 - 16); glints.push({ x: q.x - 9, y: q.y, ph: 0.3 + (k + 2) * 0.4, size: 20 }); }
    [-0.31, -0.2, 0.17, 0.3].forEach((th, i) => { const q = a.pt(th, -5); glints.push({ x: q.x, y: q.y, ph: 0.5 + i * 0.29, size: 22 }); });
    // everything drawn per frame is baked into ImageBitmaps: plain images blit cheaply, whereas using the canvases
    // themselves (built from thousands of small draws) as sources forced a slow synchronous flush on every frame
    const [mainB, sparkA, sparkB] = await Promise.all([main, buildSpark(env, gold, 's17spA'), buildSpark(env, gold, 's17spB')].map((c) => createImageBitmap(c)));
    S = { main: mainB, sparkA, sparkB, bx: B.x, by: B.y, glints };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.015, p);
    blitAt(ctx, env, S.main, -PAD, -PAD, { rot, zoom });
    // gold leaf twinkles
    const tw = 0.5 + 0.5 * Math.sin(TAU * (p * 0.9 + 0.1));
    blitAt(ctx, env, S.sparkA, S.bx, S.by, { rot, zoom, alpha: 0.2 + 0.8 * tw, blend: 'lighter' });
    blitAt(ctx, env, S.sparkB, S.bx, S.by, { rot, zoom, alpha: 0.2 + 0.8 * (1 - tw), blend: 'lighter' });
    L.cam(ctx, env, { rot, zoom }, () => {
      // a sheen sliding along the gilded bead and across the paint below it
      const sx = L.lerp(620, 1330, p);
      ctx.save(); a.clipBand(ctx, 0, -BEAD);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = L.linear(ctx, sx - 330, 0, sx + 330, 0, [[0, 'rgba(255,244,200,0)'], [0.5, 'rgba(255,246,205,0.55)'], [1, 'rgba(255,244,200,0)']]);
      ctx.fillRect(sx - 330, 0, 660, H);
      ctx.restore();
      ctx.save(); a.clipBelow(ctx, -BEAD);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = L.radial(ctx, sx, a.crestY + 210, 0, 720, [[0, 'rgba(255,250,235,0.5)'], [0.5, 'rgba(255,250,235,0.18)'], [1, 'rgba(255,250,235,0)']]);
      ctx.fillRect(sx - 720, a.crestY - 520, 1440, 1460);
      ctx.restore();
    });
    L.cam(ctx, env, { rot, zoom }, () => {
      for (const q of S.glints) {
        const k = Math.sin(Math.PI * L.clamp(p * 1.15 - q.ph * 0.5 + 0.35));
        flare(ctx, q.x, q.y, q.size, 0.06 + 0.5 * k * k);
      }
    });
  },
};
