// s36 — 羊毫笔锋. Macro of the splayed head of a big goat-hair brush (羊毫, a soft-hair brush) against pure black, tips up.
// The arc is the soft envelope joined by the hair tips: the longest tufts just touch env.arc, shorter ones fall a little short,
// so the edge is a fringe, not a line. Below it thousands of ivory-white hairs rise from under the frame and fan slightly
// outward: packed into one soft white at the root, parting into separate tufts (一缕一缕) toward the top, every hair thick at
// the root and drawn out into a fine translucent point (锋颖). Three depth layers: a defocused grey haze far back, a soft
// mid layer, and a crisp bright front layer with a top-left key light (lit / shadow side on every tuft, a pearly sheen band
// running along each hair). Above the arc: black, with a few long stray hairs out at the sides, clear of the tagline.
// Everything is pre-rendered in init(); draw() blits the layers with a hair of rotation and a tiny shear (tips sway, roots stay).
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;
const FAN = 1.42;              // hairs lean outward 1.42× faster than the arc's own normal → a gentle fan
const BOT = H + PAD + 40;      // every hair runs down to here (below the padded layer)
const YP = H + 60;             // the shear's still row: roots stay, tips sway
let S = null;

// brightness (0..1) → the palette: 墨黑 → 深灰 #3a3835 → 毫影灰 #9a968c → 羊毫白 #f5f2ea → white
const RAMP = L.makeRamp([[0, '#0c0b0a'], [0.24, '#3a3835'], [0.56, '#9a968c'], [0.86, '#f5f2ea'], [1, '#ffffff']]);
const _tc = new Map();
function tone(b, al = 1) {
  const bi = Math.round(L.clamp(b) * 63), ai = Math.round(L.clamp(al) * 40), key = bi * 64 + ai;
  let s = _tc.get(key);
  if (!s) { const c = RAMP(bi / 63); s = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(ai / 40).toFixed(3)})`; _tc.set(key, s); }
  return s;
}

// ───────────────────────── one hair ─────────────────────────
const NS = 11, SS = [];
for (let k = 0; k <= NS; k++) SS.push(Math.pow(k / NS, 1.7));     // samples crowd toward the tip, where the taper and the flick live
const _x = new Float32Array(NS + 1), _y = new Float32Array(NS + 1), _w = new Float32Array(NS + 1);
const _lx = new Float32Array(NS + 1), _ly = new Float32Array(NS + 1), _rx = new Float32Array(NS + 1), _ry = new Float32Array(NS + 1);

/**
 * A tuft ("lock") is a straight axis from its tip T down along (dx,dy) with a slow bow and a flick at the tip; a hair is a
 * lateral offset u (−1 … 1) inside the tuft that starts d0 px below the tuft's tip. The tuft opens with distance, so hairs
 * converge into a point at the top. Filled as one tapered outline: thick at the root, a fine point at the tip.
 */
function hair(g, lk, q) {
  const Lh = lk.len - q.d0;
  if (Lh < 40) return;
  for (let k = 0; k <= NS; k++) {
    const e = SS[k], d = q.d0 + Lh * e;
    const lat = lk.bend * Math.sin(Math.min(d, 1100) * 0.002856) + lk.curl * Math.exp(-d / 130)
      + q.u * 0.5 * (lk.wTip + lk.spread * Math.pow(d / 800, lk.pw))
      + q.waveA * Math.sin(q.waveF * d + q.wavePh) + q.flick * Math.exp(-(Lh * e) / 70);
    _x[k] = lk.tx + lk.dx * d + lk.nx * lat;
    _y[k] = lk.ty + lk.dy * d + lk.ny * lat;
    _w[k] = 0.5 * q.w0 * Math.pow(Math.min(1, (Lh * e) / q.tipLen), 0.7);
  }
  if ((_x[0] < -PAD - 30 && _x[NS] < -PAD - 30) || (_x[0] > W + PAD + 30 && _x[NS] > W + PAD + 30)) return;
  for (let k = 1; k <= NS; k++) {
    const k0 = k - 1, k1 = k < NS ? k + 1 : k;
    let tx = _x[k1] - _x[k0], ty = _y[k1] - _y[k0]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    _lx[k] = _x[k] - ty * _w[k]; _ly[k] = _y[k] + tx * _w[k];
    _rx[k] = _x[k] + ty * _w[k]; _ry[k] = _y[k] - tx * _w[k];
  }
  g.beginPath(); g.moveTo(_x[0], _y[0]);
  for (let k = 1; k < NS; k++) g.quadraticCurveTo(_lx[k], _ly[k], (_lx[k] + _lx[k + 1]) / 2, (_ly[k] + _ly[k + 1]) / 2);
  g.lineTo(_lx[NS], _ly[NS]); g.lineTo(_rx[NS], _ry[NS]);
  for (let k = NS - 1; k >= 1; k--) g.quadraticCurveTo(_rx[k], _ry[k], (_rx[k] + (k > 1 ? _rx[k - 1] : _x[0])) / 2, (_ry[k] + (k > 1 ? _ry[k - 1] : _y[0])) / 2);
  g.closePath();
  const gr = g.createLinearGradient(_x[0], _y[0], _x[0] + lk.dx * Lh, _y[0] + lk.dy * Lh);
  if (q.shadow) {
    gr.addColorStop(0, 'rgba(6,6,5,0)'); gr.addColorStop(Math.min(0.3, 70 / Lh), `rgba(6,6,5,${q.al})`);
    gr.addColorStop(Math.min(0.6, 190 / Lh), `rgba(6,6,5,${q.al * 0.45})`); gr.addColorStop(Math.min(0.9, 360 / Lh), 'rgba(6,6,5,0)');
  } else {
    const t2 = Math.min(0.45, q.tipLen / Lh), t1 = t2 * 0.4;
    const th = L.clamp(q.sheenD / Lh, t2 + 0.03, 0.9), bw = q.sheenW / Lh;
    gr.addColorStop(0, tone(q.b + 0.1, q.al * q.tipA));              // 锋颖: the point is translucent
    gr.addColorStop(t1, tone(q.b + 0.05, q.al * (0.5 + 0.5 * q.tipA)));
    gr.addColorStop(t2, tone(q.b, q.al));
    if (th - bw > t2) gr.addColorStop(th - bw, tone(q.b, q.al));
    gr.addColorStop(th, tone(q.b + q.hi, q.al));                     // pearly sheen band
    gr.addColorStop(Math.min(0.97, th + bw), tone(q.b, q.al));
    gr.addColorStop(1, tone(q.rootB, q.al));
  }
  g.fillStyle = globalThis.__solid ? (q.shadow ? 'rgba(6,6,5,0.3)' : tone(q.b, q.al)) : gr; g.fill();
}

/** lay one depth layer of tufts along the arc */
function tufts(g, a, seed, o) {
  const r = L.rng(seed), nz = L.makeNoise(seed), locks = [];
  const tMax = a.span(PAD + 400);        // far enough out that hairs from off-frame tufts cover the bottom corners
  for (let th = -tMax; th < tMax; th += r.range(o.gap[0], o.gap[1]) / a.R) locks.push({ th, z: r() });
  locks.sort((p, q) => p.z - q.z);
  const q = { shadow: false };
  for (const lc of locks) {
    const th = lc.th, tipDr = o.tipDr(r, th), T = a.pt(th, tipDr), phi = FAN * th + r.gauss() * o.leanJ;
    const dy = Math.cos(phi), dx = -Math.sin(phi);
    const lk = { tx: T.x, ty: T.y, dx, dy, nx: dy, ny: -dx, len: (BOT - T.y) / Math.max(0.45, dy),
      wTip: r.range(o.wTip[0], o.wTip[1]), spread: r.range(o.spread[0], o.spread[1]), pw: r.range(o.pw[0], o.pw[1]),
      bend: o.bend * (1.3 * nz.n2(th * 3.3, 1.7) + 0.5 * r.gauss()),          // neighbours bow the same way
      curl: o.flare * th * 60 + r.gauss() * o.curl };                           // the tips flare outward: the head is splayed
    const n = r.int(o.hairs[0], o.hairs[1]), lockB = r.range(o.bright[0], o.bright[1]);
    // the sheen is one soft band that follows the arc (wandering a little), strongest toward the key light
    const sheen0 = o.sheen + 60 * nz.n2(th * 4.1, 9.3) + r.range(-28, 28) + tipDr;
    const hiK = o.hi * (0.55 + 0.75 * Math.exp(-Math.pow((th + 0.1) / 0.3, 2)));
    if (o.shadow) {   // the tuft's own shadow, falling to its right on whatever is behind it
      q.shadow = true;
      for (let i = 0; i < 5; i++) {
        q.d0 = r.range(10, 80); q.u = r.range(0.6, 1.7); q.w0 = r.range(7, 15); q.tipLen = 140; q.waveA = 0; q.waveF = 0; q.wavePh = 0; q.flick = 0; q.al = o.shadow * r.range(0.6, 1);
        hair(g, lk, q);
      }
      q.shadow = false;
    }
    for (let i = 0; i < n; i++) {
      const u = i === 0 ? 0 : L.clamp(r.gauss() * 0.56, -1.7, 1.7);
      q.u = u; q.d0 = i === 0 ? 0 : Math.pow(Math.abs(u) / 1.2, 1.6) * o.round + Math.pow(r(), 1.5) * o.drop;   // a rounded, brushy end, not a needle
      q.w0 = r.range(o.w[0], o.w[1]) * (r.chance(0.12) ? 1.35 : 1); q.tipLen = r.range(o.tip[0], o.tip[1]);
      q.waveA = r.range(0.5, 3.5); q.waveF = r.range(0.006, 0.018); q.wavePh = r() * L.TAU; q.flick = r.gauss() * o.flick;
      // key light from the upper left: lit side / shadow side of the tuft, hairs deeper inside are dimmer
      q.b = lockB * (1 - o.side * L.smooth((u + 0.55) / 1.6)) * r.range(0.8, 1) + r.gauss() * 0.04;
      q.al = o.alpha; q.tipA = r.range(0.05, 0.3); q.hi = r.range(0.14, 0.4) * hiK; q.rootB = L.lerp(q.b, o.rootB, 0.7);
      q.sheenD = sheen0 + u * 22 + r.gauss() * 16 - q.d0; q.sheenW = r.range(45, 100);
      hair(g, lk, q);
    }
  }
}

/** single hairs that belong to no tuft: they cross the others and fray the envelope */
function loose(g, a, seed, o) {
  const r = L.rng(seed), q = { shadow: false };
  const tMax = a.span(PAD + 400);
  for (let i = 0; i < o.count; i++) {
    const th = o.theta ? o.theta(r, i) : r.range(-tMax, tMax), T = a.pt(th, o.tipDr(r, th, i)), phi = FAN * th + r.gauss() * o.leanJ + (o.out || 0) * Math.sign(th);
    const dy = Math.cos(phi), dx = -Math.sin(phi);
    const lk = { tx: T.x, ty: T.y, dx, dy, nx: dy, ny: -dx, len: (BOT - T.y) / Math.max(0.45, dy), wTip: 0, spread: 0, pw: 1, bend: r.gauss() * o.bend, curl: r.gauss() * o.curl };
    q.u = 0; q.d0 = 0; q.w0 = r.range(o.w[0], o.w[1]); q.tipLen = r.range(o.tip[0], o.tip[1]);
    q.waveA = r.range(1, 5); q.waveF = r.range(0.005, 0.016); q.wavePh = r() * L.TAU; q.flick = r.gauss() * o.flick;
    q.b = r.range(o.bright[0], o.bright[1]); q.al = o.alpha; q.tipA = r.range(0.04, 0.2); q.hi = r.range(0.1, 0.25); q.rootB = q.b;
    q.sheenD = r.range(120, 320); q.sheenW = r.range(50, 110);
    hair(g, lk, q);
  }
}

/** depth of field on a layer: cross-fade to a blurred copy outside an ellipse around the crest (call twice for two blur steps) */
function defocus(layer, a, px, r0, r1, sx = 2.1) {
  const soft = L.blurred(layer, px), sg = soft.getContext('2d');
  const mask = (c) => {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.translate(a.cx + PAD, a.crestY + 40 + PAD); c.scale(sx, 1);
    c.fillStyle = L.radial(c, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    c.fillRect(-3000, -3000, 6000, 6000); c.restore();
  };
  sg.globalCompositeOperation = 'destination-in'; mask(sg);
  const g = layer.getContext('2d');
  g.save(); g.globalCompositeOperation = 'destination-out'; mask(g);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.drawImage(soft, 0, 0);
  g.restore();
  return layer;
}
/** tint what is already on a layer with a gradient concentric with the arc: stops are [dr, css] from the arc inward */
function arcShade(layer, a, blend, stops, drIn, drOut) {
  const g = layer.getContext('2d');
  g.save(); g.globalCompositeOperation = blend;
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R + drIn, a.R + drOut, stops);
  g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  g.restore();
}
/** drop the empty rows above y0 so the per-frame blit is smaller */
function crop(layer, y0) {
  const c = L.makeCanvas(layer.width, layer.height - (y0 + PAD));
  c.getContext('2d').drawImage(layer, 0, -(y0 + PAD));
  c._pad = PAD; c._oy = y0;
  return c;
}

function build(env) {
  const a = env.arc;
  const t0 = performance.now(), tm = [];
  for (const mode of [0, 1, 0, 1]) {
    globalThis.__solid = mode;
    const ta = performance.now();
    const tl = L.makeLayer(PAD, (g) => {
      tufts(g, a, 's36front', { gap: [28, 66], hairs: [20, 46], w: [1.9, 3.5], tip: [130, 270], wTip: [10, 30], tipDr: (r) => (r.chance(0.56) ? r.range(2, 12) : -r.range(6, 52)), leanJ: 0.035, spread: [280, 390], pw: [1.2, 1.45], bend: 22, curl: 8, flare: 1,
        round: 38, drop: 55, flick: 3.5, bright: [0.72, 1.0], side: 0.34, alpha: 1, hi: 1, rootB: 0.95, sheen: 170, shadow: 0.42 });
    });
    tl.getContext('2d').getImageData(0, 0, 1, 1);
    console.warn('s36 AB solid=' + mode + ' ' + (performance.now() - ta).toFixed(0) + ' ms');
  }
  globalThis.__solid = 0;
  // 1) far back: thick dim hairs, completely out of focus → the far side of the head, a soft grey body behind the gaps
  const hazeSharp = L.makeLayer(PAD, (g) => {
    tufts(g, a, 's36haze', { gap: [30, 60], hairs: [5, 9], w: [6, 12], tip: [90, 200], wTip: [8, 30], tipDr: (r) => -r.range(14, 90), leanJ: 0.07, spread: [260, 420], pw: [1, 1.3], bend: 22, curl: 8, flare: 0.6,
      round: 30, drop: 80, flick: 3, bright: [0.3, 0.5], side: 0.2, alpha: 0.7, hi: 0.4, rootB: 0.62, sheen: 260, shadow: 0 });
  });
  tm.push(performance.now() - t0);
  const back = L.blurred(hazeSharp, 9), bg = back.getContext('2d');
  tm.push(performance.now() - t0);
  // 2) middle: greyer, a little soft, falling just short of the arc
  const mid = L.makeLayer(PAD, (g) => {
    tufts(g, a, 's36mid', { gap: [28, 60], hairs: [16, 32], w: [2.2, 3.8], tip: [110, 240], wTip: [10, 34], tipDr: (r) => -r.range(0, 52), leanJ: 0.05, spread: [250, 400], pw: [1.1, 1.4], bend: 22, curl: 8, flare: 0.8,
      round: 34, drop: 60, flick: 3, bright: [0.45, 0.76], side: 0.36, alpha: 0.95, hi: 0.7, rootB: 0.84, sheen: 230, shadow: 0.3 });
  });
  tm.push(performance.now() - t0);
  arcShade(mid, a, 'source-atop', [[0, 'rgba(10,10,9,0)'], [1, 'rgba(10,10,9,0.42)']], -230, -10);     // dimmer toward the tips: the gaps go deep
  bg.drawImage(L.blurred(mid, 2.6), 0, 0);
  tm.push(performance.now() - t0);
  // 3) front: crisp, bright tufts; more than half reach the arc, the rest fall a little short
  const front = L.makeLayer(PAD, (g) => {
    tufts(g, a, 's36front', { gap: [28, 66], hairs: [20, 46], w: [1.9, 3.5], tip: [130, 270], wTip: [10, 30], tipDr: (r) => (r.chance(0.56) ? r.range(2, 12) : -r.range(6, 52)), leanJ: 0.035, spread: [280, 390], pw: [1.2, 1.45], bend: 22, curl: 8, flare: 1,
      round: 38, drop: 55, flick: 3.5, bright: [0.72, 1.0], side: 0.34, alpha: 1, hi: 1, rootB: 0.95, sheen: 170, shadow: 0.42 });
    loose(g, a, 's36loose', { count: 480, tipDr: (r) => 9 - r.range(0, 46), leanJ: 0.07, bend: 30, curl: 14, w: [1.2, 2.2], tip: [140, 300], flick: 7, bright: [0.75, 1], alpha: 0.95 });
  });
  tm.push(performance.now() - t0);
  arcShade(front, a, 'source-atop', [[0, 'rgba(245,242,234,0.5)'], [1, 'rgba(245,242,234,0)']], -700, -240);  // packed root: one soft white
  defocus(front, a, 2.4, 150, 520);
  defocus(front, a, 6.5, 420, 900);
  tm.push(performance.now() - t0);
  // 4) strays: a few extra-long hairs out at the sides, in front of the focal plane → soft and dim
  const stray = L.blurred(L.makeLayer(PAD, (g) => {
    const TH = [-0.355, -0.262, -0.208, 0.232, 0.318, 0.385], DR = [150, 70, 205, 120, 55, 170];
    loose(g, a, 's36stray', { count: TH.length, theta: (r, i) => TH[i], tipDr: (r, th, i) => DR[i], leanJ: 0.05, out: 0.1, bend: 46, curl: 30, w: [2.2, 3.2], tip: [220, 340], flick: 14, bright: [0.7, 0.9], alpha: 0.7 });
    loose(g, a, 's36stray2', { count: 34, theta: (r) => r.sign() * r.range(0.17, 0.5), tipDr: (r) => r.range(8, 46), leanJ: 0.1, out: 0.05, bend: 30, curl: 18, w: [1.3, 2.2], tip: [160, 280], flick: 9, bright: [0.7, 0.95], alpha: 0.75 });
  }), 2.2);
  tm.push(performance.now() - t0);
  // 5) bloom: quarter-res glow of everything
  const bw = Math.round((W + PAD * 2) / 4), bh = Math.round((H + PAD * 2) / 4);
  const small = L.makeCanvas(bw, bh), sg = small.getContext('2d');
  sg.drawImage(back, 0, 0, bw, bh); sg.drawImage(front, 0, 0, bw, bh);
  const bloom = L.blurred(small, 9);
  tm.push(performance.now() - t0);
  console.warn('s36 timing ' + tm.map((v) => v.toFixed(0)).join(' '));
  // DEV: where does the fringe sit relative to the arc?
  {
    const c = L.makeCanvas(W, H), cg = c.getContext('2d', { willReadFrequently: true });
    cg.fillStyle = '#000'; cg.fillRect(0, 0, W, H); cg.drawImage(back, -PAD, -PAD); cg.drawImage(front, -PAD, -PAD);
    const d = cg.getImageData(0, 0, W, H).data, res = {};
    for (const T of [50, 110, 170]) {
      const v = [];
      for (let x = 40; x < W; x += 8) {
        const ya = a.yAt(x);
        for (let y = Math.round(ya - 120); y < ya + 200; y++) if (d[(y * W + x) * 4 + 1] > T) { v.push(a.drAt(x, y)); break; }
      }
      v.sort((p, q) => p - q);
      res[T] = [0.1, 0.5, 0.9].map((f) => v[Math.floor(f * (v.length - 1))].toFixed(0)).join('/');
    }
    console.warn('s36 fringe dr p10/p50/p90 @lum50/110/170: ' + JSON.stringify(res));
  }
  const top = Math.round(a.crestY - 300);
  return { back: crop(back, top), front: crop(front, top), stray: crop(stray, top), bloom };
}

function put(ctx, env, layer, rot, k, alpha = 1, blend = 'source-over') {
  const a = env.arc, pad = layer._pad || 0;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
  ctx.transform(1, 0, -k, 1, k * YP, 0);                       // shear: x += k·(YP − y)
  ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
  ctx.drawImage(layer, -pad, layer._oy === undefined ? -pad : layer._oy);
  ctx.restore();
}

export default {
  name: '羊毫笔锋',
  tone: 'light',
  init(env) {
    S = build(env);
  },
  draw(ctx, env, p) {
    ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-0.0022, 0.0022, p);
    const k = L.lerp(-0.006, 0.006, L.ease.outQuad(p));       // the tips brush over to one side
    put(ctx, env, S.back, rot * 0.6, k * 0.55);
    put(ctx, env, S.front, rot, k);
    put(ctx, env, S.stray, rot * 1.3, k * 1.7);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.28;
    ctx.drawImage(S.bloom, -PAD, -PAD, W + PAD * 2, H + PAD * 2);
    ctx.restore();
  },
};
