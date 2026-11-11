// s13 — 木构斗拱. Macro of bare, unpainted timber bracket sets laid against a sheet of indigo 磁青 paper.
// The arc is the top edge of a curved eave tie-beam (挑檐枋): a row of wooden pegs runs along it and a lap joint crosses it
// near the crest. Under it hangs a row of bracket sets (攒) in true front elevation: 栌斗 → 泥道拱 + 散斗 → 慢拱 + 散斗 → 枋,
// with the end-grain heads of the projecting arms (华拱) stacked on the centre line. Between the sets: the dark gaps (拱眼).
// Everything is laid out in 分° (fen, the modular unit of the bracket system) and mapped through polar coordinates so
// every member is concentric with the arc — a `rot` about the arc centre slides the row along without bending anything.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 150;
const U = 7.0;                 // px per 分° — close enough that the growth rings and the seams between members read
const B = 15;                  // depth of the beam on the arc (分°): one 材
const PITCH = 100;             // spacing of the bracket sets along the arc (分°)
const SHIFT = 0.05;            // the row sits a touch right of centre (fraction of a pitch)
// vertical layout, 分° measured down from the arc (材高 15, 栔 6, 小斗 10 = 耳4 平2 欹4, 栌斗 20 = 耳8 平4 欹8)
const V_D2 = B - 4;            // top of the upper small blocks (their ears grip the beam)
const V_G2 = B + 6;            // top of the long arm 慢拱
const V_D1 = B + 17;           // top of the lower small blocks
const V_G1 = B + 27;           // top of the short arm 泥道拱
const V_LU = B + 34;           // top of the cap block 栌斗
const V_BOT = B + 54;          // underside of the cap block = top of the plate 普拍枋
const LIGHT = 45;              // L.bumpLight angle for light arriving from the upper left
const JOINT = { u: 13, v: 9.4 };   // lap joint in the beam over the centre set: half-length and depth of the step (分°)
const SLIP = -0.031;           // the length of timber left of the joint is cut from elsewhere in the log (radians of grain offset)
let S = null;

// ───────────────────────── layers that cover only some rows of the padded frame ─────────────────────────
function strip(y0, y1, draw) {
  const c = L.makeCanvas(W + PAD * 2, Math.ceil(y1 - y0)); const g = c.getContext('2d');
  g.translate(PAD, -y0); c._x = -PAD; c._y = y0;
  if (draw) draw(g, c);
  return c;
}
const put = (ctx, env, layer, opts) => L.cam(ctx, env, opts, () => ctx.drawImage(layer, layer._x, layer._y));

// ───────────────────────── timber texture ─────────────────────────
// amber, all four inside one hue family; shadows lean toward the blue of the paper
const RAMPS = [
  [[0, '#190c10'], [0.2, '#5e2e10'], [0.42, '#a85c1e'], [0.62, '#cf8632'], [0.8, '#e9a94e'], [1, '#ffd994']],   // golden
  [[0, '#190b10'], [0.2, '#602610'], [0.42, '#a0481a'], [0.62, '#c06828'], [0.8, '#dc8a3e'], [1, '#f5bc74']],   // redder
  [[0, '#1b0e10'], [0.2, '#684018'], [0.42, '#b47228'], [0.62, '#d7963c'], [0.8, '#efb85e'], [1, '#ffe2a2']],   // paler, drier
  [[0, '#160a0e'], [0.2, '#4e240e'], [0.42, '#8c4a18'], [0.62, '#ae6422'], [0.8, '#cc8436'], [1, '#eab066']],   // darker heartwood
];
function lutOf(stops) {
  const f = L.makeRamp(stops); const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const c = f(i / 255); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  return lut;
}
/**
 * long-grain timber value at (s along the grain, t across it), px. Growth rings: pale earlywood darkening into a hard
 * latewood line. `knots` [{s, t, l, w}] push the rings apart so the grain flows round them.
 */
function woodVal(nz, s, t, ring, wave, knots) {
  if (knots) for (let i = 0; i < knots.length; i++) {
    const k = knots[i], dx = (s - k.s) / k.l;
    if (dx > -3 && dx < 3) { const dy = (t - k.t) / k.w, ay = Math.abs(dy); t -= k.w * 1.5 * Math.exp(-dx * dx) * (dy / (ay + 0.4)) * Math.exp(-ay * 0.45); }
  }
  const wv = nz.fbm(s / 820, t / (ring * 8), 3) * wave + nz.n2(s / 210 + 40.5, t / (ring * 3)) * 0.2;
  const q = t / ring + wv;
  const f = q - Math.floor(q);
  const late = f < 0.8 ? Math.pow(f / 0.8, 2.6) : 1 - (f - 0.8) / 0.2;
  const fib = nz.n2(s / 80, t / 1.7) * 0.6 + nz.n2(s / 26 + 9.7, t / 1.0 + 3.1) * 0.4;
  const bl = nz.fbm(s / 420 + 5.3, t / 150 - 3.7, 2);
  const amp = 0.3 + 0.13 * nz.n2(s / 900 - 7.1, t / 90 + 2.2);    // some stretches of a board show their rings harder than others
  const drift = nz.n2(s / 1500 + 3.3, t / 420 - 1.9);              // sap-stain and sun: slow changes of tone across a piece
  return 0.71 - amp * late + 0.1 * fib + 0.2 * bl + 0.09 * drift;
}
/** per-pixel timber image. map(x, y, out) may remap canvas px → (s, t) and return false to leave a pixel empty. */
function woodImage(w, h, o, map) {
  const res = o.res || 1;
  const cw = Math.max(2, Math.round(w * res)), ch = Math.max(2, Math.round(h * res));
  const nz = L.makeNoise(o.seed), lut = lutOf(o.ramp);
  const img = new ImageData(cw, ch); const d = img.data; const st = [0, 0];
  let k = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++, k += 4) {
    let s = x / res, t = y / res;
    if (map) { if (!map(s, t, st)) continue; s = st[0]; t = st[1]; }
    const li = (L.clamp(woodVal(nz, s, t, o.ring, o.wave, o.knots)) * 255) | 0;
    d[k] = lut[li * 3]; d[k + 1] = lut[li * 3 + 1]; d[k + 2] = lut[li * 3 + 2]; d[k + 3] = 255;
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  if (res === 1) return small;
  const out = L.makeCanvas(w, h); const g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, w, h);
  return out;
}
/** give a timber image its surface: pores and loose fibres along the grain, then relief so the grain catches the light */
function finishTimber(c, seed, relief = 2.6) {
  const g = c.getContext('2d'), w = c.width, h = c.height, r = L.rng('s13fin' + seed);
  g.lineCap = 'round';
  for (let i = 0, n = (w * h) / 150; i < n; i++) {
    const x = r() * w, y = r() * h, len = r.range(6, 48);
    g.strokeStyle = r.chance(0.72) ? `rgba(58,24,6,${r.range(0.12, 0.4)})` : `rgba(255,222,160,${r.range(0.08, 0.22)})`;
    g.lineWidth = r.range(0.6, 1.3);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + r.range(-0.9, 0.9)); g.stroke();
  }
  const bump = L.bumpLight(c, { angle: LIGHT, strength: relief, res: 1 });
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.6; g.drawImage(bump, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}
/** timber whose grain follows the arc, covering depths v0..v1 px below it. Returns {c, x, y} (canvas + frame position). */
function polarWood(env, v0, v1, yTop, yBot, o) {
  const a = env.arc, x0 = -PAD, w = W + PAD * 2, h = Math.ceil(yBot - yTop);
  const cxp = a.cx - x0, cyp = a.cy - yTop, R = a.R, m = 6 / (o.res || 1);
  const c = woodImage(w, h, o, (x, y, st) => {
    const dx = x - cxp, dy = cyp - y; const dep = R - Math.sqrt(dx * dx + dy * dy);
    if (dep < v0 - m || dep > v1 + m) return false;
    st[0] = Math.atan2(dx, dy) * R; st[1] = dep; return true;
  });
  return { c, x: x0, y: yTop };
}

// ───────────────────────── geometry (分° → frame) ─────────────────────────
function quad(p0, c, p1, n) {
  const out = [];
  for (let i = 1; i <= n; i++) { const t = i / n, k = 1 - t; out.push([k * k * p0[0] + 2 * k * t * c[0] + t * t * p1[0], k * k * p0[1] + 2 * k * t * c[1] + t * t * p1[1]]); }
  return out;
}
/** add a polyline given in 分° to the current path, subdividing so straight runs follow the arc */
function trace(g, P, pts, close = true) {
  const n = pts.length, m = close ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    const k = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 5));
    for (let j = 0; j < k; j++) {
      const q = P(L.lerp(p0[0], p1[0], j / k), L.lerp(p0[1], p1[1], j / k));
      if (i === 0 && j === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
    }
  }
  if (close) g.closePath(); else { const q = P(pts[n - 1][0], pts[n - 1][1]); g.lineTo(q.x, q.y); }
}
/** bow arm 拱: ends keep a 6分° vertical face, the lower corner is cut back in four straight facets (卷杀). zones: [[u0, u1]…] of 栱眼 */
function gongShape(half, top, kx, zones = []) {
  const b = top + 15, e = top + 6, d = 2.6;
  const Rk = quad([half, e], [half, b], [half - kx, b], 4);
  const Lk = quad([-half + kx, b], [-half, b], [-half, e], 4);
  // 栱眼: between the block seats the upper edge of the arm is cut down in a shallow hollow
  const tp = [[-half, top]];
  for (const [x0, x1] of zones) tp.push([x0, top], ...quad([x0, top], [x0 + 0.5, top + d], [x0 + 3.4, top + d], 4), [x1 - 3.4, top + d], ...quad([x1 - 3.4, top + d], [x1 - 0.5, top + d], [x1, top], 4));
  tp.push([half, top]);
  return {
    pts: [...tp, [half, e], ...Rk, [-half + kx, b], ...Lk],
    top: tp, left: [[-half, e], [-half, top]], right: [[half, top], [half, e]],
    bottom: [[half, e], ...Rk, [-half + kx, b], ...Lk],
  };
}
/** bearing block 斗 / 升: square upper part (耳 + 平), concave tapered foot (欹) */
function douShape(cu, top, hw, hUp, hQi, inset) {
  const m = top + hUp, b = m + hQi;
  const Rq = quad([cu + hw, m], [cu + hw - inset * 0.9, m + hQi * 0.3], [cu + hw - inset, b], 4);
  const Lq = quad([cu - hw + inset, b], [cu - hw + inset * 0.9, m + hQi * 0.3], [cu - hw, m], 4);
  return {
    pts: [[cu - hw, top], [cu + hw, top], [cu + hw, m], ...Rq, [cu - hw + inset, b], ...Lq],
    top: [[cu - hw, top], [cu + hw, top]], left: [[cu - hw + inset, b], ...Lq, [cu - hw, top]], right: [[cu + hw, top], [cu + hw, m], ...Rq],
    bottom: [[cu + hw - inset, b], [cu - hw + inset, b]],
  };
}
/** the squared end of an arm that runs straight toward the viewer (华拱) */
const headShape = (top) => ({
  pts: [[-5, top], [5, top], [5, top + 15], [-5, top + 15]],
  top: [[-5, top], [5, top]], left: [[-5, top + 15], [-5, top]], right: [[5, top], [5, top + 15]], bottom: [[5, top + 15], [-5, top + 15]],
});

// ───────────────────────── painting one member ─────────────────────────
const SH_DOU = { dx: 9, dy: 17, blur: 13, a: 0.72 };
const SH_LU = { dx: 12, dy: 21, blur: 18, a: 0.74 };
const SH_HEAD = { dx: 15, dy: 30, blur: 20, a: 0.68 };
const SH_ARM = { dx: 9, dy: 18, blur: 18, a: 0.64 };
const EN = L.makeNoise('s13edge');

/** stroke an edge the way a worn arris takes light: a continuous base, then brighter stretches where it is still crisp */
function runVar(g, P, pts, rgb, a0, lw, ph) {
  g.strokeStyle = `rgba(${rgb},${a0 * 0.5})`; g.lineWidth = lw; g.beginPath(); trace(g, P, pts, false); g.stroke();
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1], len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const k = Math.max(1, Math.ceil(len / 1.5));
    for (let j = 0; j < k; j++) {
      const n = EN.n2((acc + (j / k) * len) * 0.19 + ph, ph * 0.37);
      if (n > -0.15) {
        const q0 = P(L.lerp(p0[0], p1[0], j / k), L.lerp(p0[1], p1[1], j / k)), q1 = P(L.lerp(p0[0], p1[0], (j + 1) / k), L.lerp(p0[1], p1[1], (j + 1) / k));
        g.strokeStyle = `rgba(${rgb},${Math.min(1, a0 * (0.25 + 0.75 * n))})`; g.lineWidth = lw * (0.8 + 0.35 * n);
        g.beginPath(); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.stroke();
      }
    }
    acc += len;
  }
}
function edges(g, P, sh, r) {
  g.lineCap = 'butt'; g.lineJoin = 'round';
  const ph = r.range(0, 90);
  runVar(g, P, sh.bottom, '14,8,20', 0.42, 9, ph);
  runVar(g, P, sh.right, '14,8,20', 0.4, 7, ph + 11);
  runVar(g, P, sh.left, '255,224,160', 0.34, 3.4, ph + 23);
  // the top arris: a soft worn bevel, then the bright line itself
  g.strokeStyle = 'rgba(255,226,164,0.12)'; g.lineWidth = 15; g.beginPath(); trace(g, P, sh.top, false); g.stroke();
  runVar(g, P, sh.top, '255,234,184', 0.7, 3.8, ph + 37);
}
/** drying checks: thin lens-shaped splits that follow the grain, with a lit lower lip (分°) */
function checksOn(g, P, r, u0, u1, v0, v1, n) {
  for (let k = 0; k < n; k++) {
    const len = r.range(0.22, 0.55) * (u1 - u0), ua = r.range(u0, u1 - len), wmax = r.range(0.24, 0.5);
    let v = r.range(v0, v1);
    const m = Math.max(4, Math.round(len / 2)), top = [], bot = [];
    for (let i = 0; i <= m; i++) {
      const t = i / m; v += r.range(-0.14, 0.14);
      const hw = (wmax * Math.pow(Math.sin(Math.PI * t), 0.6)) / 2;
      top.push([ua + t * len, v - hw]); bot.push([ua + t * len, v + hw]);
    }
    g.fillStyle = 'rgba(16,8,12,0.86)'; g.beginPath(); trace(g, P, [...top, ...bot.slice().reverse()]); g.fill();
    g.strokeStyle = 'rgba(255,226,168,0.34)'; g.lineWidth = 1.1; g.beginPath(); trace(g, P, bot.map(([u, w]) => [u, w + 0.2]), false); g.stroke();
  }
}
/** knocks and chips out of an edge (分°). where: 'top' | 'both' */
function chipsOn(g, P, r, u0, u1, vTop, vBot, n, where = 'both') {
  for (let k = 0; k < n; k++) {
    const top = where === 'top' || r.chance(0.55), cu = r.range(u0, u1), cw = r.range(0.6, 1.7), cd = r.range(0.45, 0.95) * (top ? 1 : -1), cv = top ? vTop : vBot;
    g.fillStyle = 'rgba(14,8,14,0.84)'; g.beginPath();
    trace(g, P, [[cu - cw, cv - cd * 0.3], [cu - cw * 0.2, cv + cd], [cu + cw * 0.7, cv + cd * 0.5], [cu + cw, cv - cd * 0.3]]); g.fill();
    g.strokeStyle = 'rgba(255,228,176,0.42)'; g.lineWidth = 1.1; g.beginPath();
    trace(g, P, [[cu - cw * 0.2, cv + cd + 0.18 * Math.sign(cd)], [cu + cw * 0.7, cv + cd * 0.5 + 0.18 * Math.sign(cd)]], false); g.stroke();
  }
}
/**
 * One piece of timber: its underside (we look up at it slightly) and the shadow it throws on whatever is already drawn,
 * then its own length of wood, tone, form shading, piece-specific marks, lit / shaded edges and the seam round it.
 */
function member(g, a, P, th, sh, o) {
  const { uc, vc, w, h, tile, r, shadow, shade, extra, tone = 0, ext = 0 } = o;
  const under = ext ? sh.pts.map(([u, v]) => [u, v + ext]) : sh.pts;
  g.save();
  if (shadow) {
    // where it bears on its neighbours the light cannot get in (occlusion), then the shadow it throws down and to the right
    g.shadowColor = 'rgba(6,5,22,0.5)'; g.shadowBlur = shadow.blur * 2; g.shadowOffsetX = 0; g.shadowOffsetY = 3;
    g.fillStyle = '#1d1018'; g.beginPath(); trace(g, P, under); g.fill();
    g.shadowColor = `rgba(6,5,22,${shadow.a})`; g.shadowBlur = shadow.blur; g.shadowOffsetX = shadow.dx; g.shadowOffsetY = shadow.dy;
  }
  g.fillStyle = '#1d1018'; g.beginPath(); trace(g, P, under); g.fill();
  g.restore();
  if (ext) {
    // we look up at it a little: the underside shows as a dim plane, lit only by what bounces back from below
    g.save(); g.beginPath(); trace(g, P, under); g.clip();
    a.at(g, th(uc), -vc * U, () => {
      g.fillStyle = L.linear(g, -w / 2, 0, w / 2, 0, [[0, '#7a4218'], [0.5, '#643414'], [1, '#42200e']]); g.fillRect(-w, -h, w * 2, h * 3);
      g.fillStyle = L.linear(g, 0, h / 2 - 4, 0, h / 2 + ext * U + 2, [[0, 'rgba(14,7,14,0)'], [1, 'rgba(14,7,14,0.6)']]); g.fillRect(-w, -h, w * 2, h * 3);
    });
    g.restore();
  }
  g.fillStyle = '#b5651d'; g.beginPath(); trace(g, P, sh.pts); g.fill();
  g.save(); g.beginPath(); trace(g, P, sh.pts); g.clip();
  a.at(g, th(uc), -vc * U, () => {
    if (tile) {
      const sw = Math.min(tile.width, w + 12), shh = Math.min(tile.height, h + 24);
      const ox = r.range(0, tile.width - sw), oy = r.range(0, tile.height - shh);
      g.drawImage(tile, ox, oy, sw, shh, -sw / 2, -shh / 2, sw, shh);
    }
    // no two pieces have aged alike
    if (tone > 0) { g.fillStyle = `rgba(255,200,116,${tone})`; g.globalCompositeOperation = 'soft-light'; g.fillRect(-w, -h, w * 2, h * 2); }
    else if (tone < 0) { g.fillStyle = `rgba(46,18,8,${-tone})`; g.fillRect(-w, -h, w * 2, h * 2); }
    g.globalCompositeOperation = 'source-over';
    // and each has weathered unevenly along its own length
    const gx = r.range(-1, 1), ga = r.range(0.1, 0.24);
    g.fillStyle = L.linear(g, -w / 2, 0, w / 2, 0, gx > 0 ? [[0, `rgba(40,16,10,${ga})`], [0.6, 'rgba(40,16,10,0)']] : [[0.4, 'rgba(40,16,10,0)'], [1, `rgba(40,16,10,${ga})`]]);
    g.fillRect(-w, -h, w * 2, h * 2);
    if (shade) shade(g, w, h);
  });
  if (extra) extra(g, P);
  edges(g, P, sh, r);
  g.restore();
  // the seam: these joints are cut dry and have opened a little, unevenly, with the years
  g.save(); g.strokeStyle = 'rgba(12,7,16,0.55)'; g.lineWidth = r.range(1.0, 1.9); g.lineJoin = 'round'; g.beginPath(); trace(g, P, sh.pts); g.stroke(); g.restore();
}
const shadeArm = (kx) => (g, w, h) => {
  // a squared timber lit from the upper left: top a little brighter, belly falling into shade
  g.fillStyle = L.linear(g, 0, -h / 2, 0, h / 2 + 8, [[0, 'rgba(255,220,150,0.2)'], [0.3, 'rgba(255,220,150,0)'], [0.5, 'rgba(20,9,14,0)'], [1, 'rgba(20,9,14,0.5)']]);
  g.fillRect(-w, -h, w * 2, h * 2.4);
  g.fillStyle = L.linear(g, -w / 2, 0, w / 2, 0, [[0, 'rgba(255,220,150,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(20,9,14,0.26)']]);
  g.fillRect(-w, -h, w * 2, h * 2.4);
  // the facetted cut-backs at both ends face downward → darker
  for (const sgn of [-1, 1]) {
    const x0 = sgn * (w / 2 - kx * U * 1.25), x1 = sgn * (w / 2 + 4);
    g.fillStyle = L.linear(g, x0, -h * 0.05, x1, h * 0.55, [[0, 'rgba(20,9,14,0)'], [1, sgn > 0 ? 'rgba(20,9,14,0.66)' : 'rgba(20,9,14,0.46)']]);
    g.fillRect(Math.min(x0, x1), -h / 2 + 6 * U - 6, Math.abs(x1 - x0), h);
  }
};
const shadeDou = (upPx) => (g, w, h) => {
  const yM = -h / 2 + upPx;
  g.fillStyle = L.linear(g, 0, -h / 2, 0, yM, [[0, 'rgba(255,224,160,0.24)'], [1, 'rgba(255,224,160,0.02)']]);
  g.fillRect(-w, -h, w * 2, h / 2 + upPx);
  // the concave foot tucks under the square top: darkest right below the lip
  g.fillStyle = L.linear(g, 0, yM, 0, h / 2 + 2, [[0, 'rgba(16,8,14,0.72)'], [0.45, 'rgba(16,8,14,0.46)'], [1, 'rgba(16,8,14,0.26)']]);
  g.fillRect(-w, yM, w * 2, h);
  g.fillStyle = 'rgba(255,232,180,0.5)'; g.fillRect(-w, yM - 2.2, w * 2, 2.2);
  g.fillStyle = L.linear(g, -w / 2, 0, w / 2, 0, [[0, 'rgba(255,224,160,0.14)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(20,9,14,0.32)']]);
  g.fillRect(-w, -h, w * 2, h * 2);
};
/** end grain of a squared timber: growth rings round an off-centre pith, rays, a drying check */
function endGrain(g, w, h, r, seed) {
  const nz = L.makeNoise('s13eg' + seed);
  g.fillStyle = L.linear(g, 0, -h / 2, 0, h / 2, [[0, '#dd9a44'], [1, '#aa6220']]); g.fillRect(-w, -h, w * 2, h * 2);
  const px = r.range(-0.7, 0.7) * w, py = r.range(0.25, 0.95) * h * (r.chance(0.75) ? 1 : -1);
  const far = Math.hypot(Math.abs(px) + w / 2, Math.abs(py) + h / 2) + 6;
  const step = r.range(6.2, 8.4);
  g.lineCap = 'round';
  for (let k = 1, rad = step * 0.6; rad < far; k++, rad += step * (0.7 + 0.6 * r())) {
    const wob = (ang) => rad * (1 + 0.035 * nz.n2(ang * 1.6, k * 0.21)) + 1.2 * nz.n2(ang * 7, k * 1.3);
    g.beginPath();
    for (let i = 0; i <= 72; i++) { const ang = (i / 72) * L.TAU, q = wob(ang); const x = px + Math.cos(ang) * q, y = py + Math.sin(ang) * q; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.strokeStyle = `rgba(88,40,12,${r.range(0.5, 0.9)})`; g.lineWidth = r.range(1.4, 3); g.stroke();
    g.beginPath();
    for (let i = 0; i <= 72; i++) { const ang = (i / 72) * L.TAU, q = wob(ang) + step * 0.45; const x = px + Math.cos(ang) * q, y = py + Math.sin(ang) * q; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.strokeStyle = 'rgba(255,208,130,0.32)'; g.lineWidth = 2.1; g.stroke();
  }
  // medullary rays
  for (let i = 0; i < 60; i++) {
    const ang = r() * L.TAU, r0 = r.range(4, far * 0.6), r1 = r0 + r.range(12, 52);
    g.strokeStyle = r.chance(0.5) ? 'rgba(70,32,10,0.18)' : 'rgba(255,214,150,0.18)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(px + Math.cos(ang) * r0, py + Math.sin(ang) * r0); g.lineTo(px + Math.cos(ang) * r1, py + Math.sin(ang) * r1); g.stroke();
  }
  // saw-marks left across the cut face
  for (let i = 0; i < 9; i++) {
    const y = r.range(-h / 2, h / 2);
    g.strokeStyle = r.chance(0.5) ? 'rgba(60,26,8,0.16)' : 'rgba(255,220,160,0.14)'; g.lineWidth = r.range(0.8, 1.6);
    g.beginPath(); g.moveTo(-w / 2 - 2, y); g.lineTo(w / 2 + 2, y + r.range(-5, 5)); g.stroke();
  }
  // a drying check opening from the pith
  const ca = Math.atan2(-py, -px) + r.range(-0.35, 0.35);
  g.strokeStyle = 'rgba(18,8,10,0.8)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(px + Math.cos(ca) * 3, py + Math.sin(ca) * 3);
  let cl = 3; const cmax = r.range(0.5, 0.85) * far;
  while (cl < cmax) { cl += 7; const j = nz.n2(cl * 0.07, 7.7) * 3; g.lineTo(px + Math.cos(ca) * cl - Math.sin(ca) * j, py + Math.sin(ca) * cl + Math.cos(ca) * j); }
  g.stroke();
}
/** head of a projecting arm 华拱 seen end-on: end-grain face on top, then the four facets of its cut-back underside */
const shadeHead = (seed) => (g, w, h) => {
  const r = L.rng('s13head' + seed);
  endGrain(g, w, h, r, seed);
  const y0 = -h / 2 + 6 * U, fh = (9 * U) / 4;
  for (let k = 0; k < 4; k++) {
    g.fillStyle = `rgba(18,8,14,${0.24 + 0.18 * k})`; g.fillRect(-w, y0 + k * fh, w * 2, fh + (k === 3 ? 20 : 0));
    g.fillStyle = 'rgba(255,226,170,0.3)'; g.fillRect(-w, y0 + k * fh - 0.8, w * 2, 1.6);
  }
  g.fillStyle = L.linear(g, -w / 2, 0, w / 2, 0, [[0, 'rgba(255,230,180,0.2)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(20,9,14,0.32)']]);
  g.fillRect(-w, -h, w * 2, h * 2);
  g.fillStyle = L.linear(g, 0, -h / 2, 0, -h / 2 + 6 * U, [[0, 'rgba(255,236,190,0.3)'], [1, 'rgba(255,236,190,0)']]);
  g.fillRect(-w, -h, w * 2, h / 2 + 6 * U);
};
/** a wooden peg 木销 driven through the beam, seen end-on. kind: 'proud' | 'flush' | 'sunk' | 'hole' */
function peg(g, r, pr, kind) {
  const round = (rad, jit) => { g.beginPath(); for (let i = 0; i < 14; i++) { const an = (i / 14) * L.TAU, q = rad * (1 + jit * (r() - 0.5)); if (i) g.lineTo(Math.cos(an) * q, Math.sin(an) * q); else g.moveTo(Math.cos(an) * q, Math.sin(an) * q); } g.closePath(); };
  if (kind === 'proud') { g.fillStyle = 'rgba(10,6,16,0.4)'; g.beginPath(); g.ellipse(2.6, 4, pr + 1.2, pr + 0.6, 0.6, 0, L.TAU); g.fill(); }
  g.fillStyle = 'rgba(12,7,14,0.9)'; round(pr + 1.1, 0.12); g.fill();
  if (kind === 'hole') {
    // the peg has dropped out: a dark bore, its lower-right wall catching a little light
    g.strokeStyle = 'rgba(214,138,58,0.55)'; g.lineWidth = 2; g.beginPath(); g.arc(-0.6, -0.8, pr, 0.15, 1.5); g.stroke();
    return;
  }
  const tn = r.range(-0.3, 0.02), off = kind === 'sunk' ? 1.4 : 0;
  g.save(); round(pr + 1.1, 0); g.clip(); g.translate(off, off);
  g.fillStyle = L.radial(g, -pr * 0.3, -pr * 0.35, 0.5, pr * 1.3, [[0, L.shade('#9c5a22', tn)], [0.6, L.shade('#74401a', tn)], [1, L.shade('#44200c', tn)]]);
  round(pr, 0.12); g.fill();
  g.strokeStyle = 'rgba(52,22,8,0.55)'; g.lineWidth = 1;
  const ex = r.range(-2.4, 2.4), ey = r.range(-2.4, 2.4);
  for (const q of [0.28, 0.52, 0.76]) { g.beginPath(); g.arc(ex * (1 - q), ey * (1 - q), pr * q, 0, L.TAU); g.stroke(); }
  if (r.chance(0.5)) { const an = r() * L.TAU; g.strokeStyle = 'rgba(14,7,10,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(Math.cos(an) * 1.5, Math.sin(an) * 1.5); g.lineTo(Math.cos(an + 0.2) * pr, Math.sin(an + 0.2) * pr); g.stroke(); }
  g.restore();
  if (kind === 'proud') { g.strokeStyle = 'rgba(255,226,170,0.6)'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, pr - 0.9, Math.PI * 0.95, Math.PI * 1.62); g.stroke(); }
  else if (kind === 'sunk') { g.strokeStyle = 'rgba(255,220,160,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, pr + 1.2, -0.1, Math.PI * 0.55); g.stroke(); }
}
/** the dark heart of a knot; the rings around it are bent by woodVal */
function knotCore(g, r, kr) {
  g.fillStyle = L.radial(g, 0, 0, 0, kr * 1.25, [[0, '#24100a'], [0.5, '#45200c'], [0.82, 'rgba(120,58,18,0.8)'], [1, 'rgba(120,58,18,0)']]);
  g.beginPath(); g.ellipse(0, 0, kr * 1.45, kr * 1.1, 0, 0, L.TAU); g.fill();
  for (const q of [0.4, 0.7, 0.98]) { g.strokeStyle = `rgba(20,9,6,${0.6 - q * 0.3})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(r.range(-1, 1), r.range(-1, 1), kr * 1.3 * q, kr * q, r.range(-0.2, 0.2), 0, L.TAU); g.stroke(); }
  g.strokeStyle = 'rgba(8,4,6,0.9)'; g.lineWidth = 1.3;
  for (let i = 0; i < 3; i++) { const an = r() * L.TAU; g.beginPath(); g.moveTo(Math.cos(an) * 1.5, Math.sin(an) * 1.5); g.lineTo(Math.cos(an + 0.15) * kr * 0.9, Math.sin(an + 0.15) * kr * 0.75); g.stroke(); }
  g.strokeStyle = 'rgba(255,216,150,0.3)'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(0, 0, kr * 1.5, kr * 1.12, 0, 0.3, 1.9); g.stroke();
}

// ───────────────────────── the timber layer ─────────────────────────
function buildWood(env) {
  const a = env.arc, R = a.R;
  const Rm = R - 36 * U;                       // radius at which 分° are true to scale along the arc
  const pitch = (PITCH * U) / Rm;              // angular spacing of the sets
  const off = SHIFT * pitch;
  const sp = a.span(PAD + 80);
  const y0 = a.crestY - 14, y1 = H + PAD, lw = W + PAD * 2, lh = Math.ceil(y1 - y0);
  const bd = B * U;

  // individual lengths of timber for the bracket members: some quarter-sawn (straight), some with a broader figure
  const rings = [7.5, 10.5, 6.2, 8.8, 11.5, 6.8, 9.4], waves = [1.2, 3.0, 0.8, 1.7, 3.6, 2.3, 1.4];
  const tiles = [];
  for (let i = 0; i < 7; i++) tiles.push(finishTimber(woodImage(790, 154, { seed: 's13tile' + i, ramp: RAMPS[i % RAMPS.length], ring: rings[i], wave: waves[i] }), i));
  // knots on the beam, placed where they will show (s along the arc from the crest, t below it, px)
  const knotsAt = [{ s: -505, t: 66, l: 52, w: 13, left: true }, { s: 742, t: 34, l: 40, w: 10, left: false }];
  const knots = knotsAt.map((k) => ({ ...k, s: k.s + off * R - (k.left ? SLIP * R : 0) }));
  const beam = polarWood(env, -5, bd + 3, a.crestY - 9, a.yAt(-PAD, -bd) + 12, { seed: 's13beam', ramp: RAMPS[0], ring: 9.5, wave: 2.0, knots });
  const beamBump = L.bumpLight(beam.c, { angle: LIGHT, strength: 2.6, res: 1 });
  const low = polarWood(env, V_BOT * U - 4, V_BOT * U + 120, a.crestY + V_BOT * U - 8, Math.min(y1, a.crestY + V_BOT * U + 150), { seed: 's13low', ramp: RAMPS[3], ring: 14, wave: 1.4, res: 0.75 });
  const panel = L.noiseTex(lw, lh, { seed: 's13panel', scale: 30, sx: 0.5, sy: 14, octaves: 3, contrast: 1.5, res: 0.25, polar: { cx: a.cx + PAD, cy: a.cy - y0, R }, ramp: [[0, '#05050c'], [0.55, '#12101e'], [1, '#2b1e2c']] });

  const layer = strip(y0, y1, (g, c) => {
    const full = () => g.fillRect(-PAD, y0, lw, lh);
    const P0 = (u, v) => a.pt(off + (u * U) / Rm, -v * U);          // the centre set's 分° frame, used for the beam joint
    // 0) the recess behind the brackets (拱眼壁): old boards deep in shadow, a blue-brown dark
    g.save(); a.clipBelow(g, 3);
    g.fillStyle = '#0b0a14'; full();
    g.drawImage(panel, -PAD, y0);
    g.fillStyle = L.radial(g, a.cx, a.cy, R - V_BOT * U, R - bd, [[0, 'rgba(170,92,28,0.24)'], [0.35, 'rgba(70,36,20,0.04)'], [1, 'rgba(4,5,20,0.75)']]);
    full();
    g.restore();

    // 1) the plate 普拍枋 the row stands on: only its top edge shows, at the foot of the frame
    {
      const d0 = V_BOT * U;
      g.save(); a.clipBelow(g, -d0);
      g.drawImage(low.c, low.x, low.y);
      g.fillStyle = L.radial(g, a.cx, a.cy, R - d0 - 130, R - d0, [[0, 'rgba(8,5,16,0.92)'], [0.6, 'rgba(10,6,16,0.62)'], [0.94, 'rgba(14,8,16,0.3)'], [0.985, 'rgba(255,226,170,0.2)'], [1, 'rgba(255,232,186,0.5)']]);
      full();
      g.restore();
    }

    // 2) bracket sets, far → near
    const sets = [];
    for (let i = -2; i <= 2; i++) {
      const th0 = i * pitch + off;
      if (Math.abs(th0) - (48 * U) / Rm > sp) continue;
      const r = L.rng('s13set' + i);
      const P = (u, v) => a.pt(th0 + (u * U) / Rm, -v * U);
      const T = (u) => th0 + (u * U) / Rm;
      // nothing sits quite square any more: each piece has crept a hair sideways and leans a fraction
      const J = (vc) => { const du = r.range(-0.3, 0.3), sk = r.range(-0.012, 0.012); return (u, v) => P(u + du + (v - vc) * sk, v); };
      const pick = () => tiles[r.int(0, tiles.length - 1)];
      const tone = (bias = 0) => r.range(-0.24, 0.2) + bias;
      const armMarks = (half, top, kx) => (gg, PP) => {
        checksOn(gg, PP, r, -half + 5, half - 5, top + 6, top + 12.5, r.int(0, 2));
        chipsOn(gg, PP, r, -half + kx, half - kx, top, top + 15, r.int(0, 2));
      };
      const douMarks = (cu, top, hw) => (gg, PP) => { if (r.chance(0.3)) chipsOn(gg, PP, r, cu - hw + 1.5, cu + hw - 1.5, top, top, 1, 'top'); };
      // short arm 泥道拱 (set back under the long arm → a little deeper in shade)
      member(g, a, J(V_G1 + 7.5), T, gongShape(31, V_G1, 14), { uc: 0, vc: V_G1 + 7.5, w: 62 * U, h: 15 * U, tile: pick(), r, tone: tone(-0.1), ext: 2.4, shadow: SH_ARM, shade: shadeArm(14),
        extra: armMarks(31, V_G1, 14) });
      // cap block 栌斗: the biggest block, at the bottom
      member(g, a, P, T, douShape(0, V_LU, 16, 12, 8, 4), { uc: 0, vc: V_LU + 10, w: 32 * U, h: 20 * U, tile: pick(), r, tone: tone(-0.04) * 0.7, ext: 2.0, shadow: SH_LU, shade: shadeDou(12 * U),
        extra: (gg, PP) => { checksOn(gg, PP, r, -13, 13, V_LU + 2, V_LU + 10, r.int(0, 1)); douMarks(0, V_LU, 16)(gg, PP); } });
      // first projecting arm, end-on
      member(g, a, P, T, headShape(V_G1), { uc: 0, vc: V_G1 + 7.5, w: 10 * U, h: 15 * U, tile: null, r, shadow: SH_HEAD, shade: shadeHead(i + 'a') });
      // long arm 慢拱
      member(g, a, J(V_G2 + 7.5), T, gongShape(46, V_G2, 12, [[-29.2, -8.6], [8.6, 29.2]]), { uc: 0, vc: V_G2 + 7.5, w: 92 * U, h: 15 * U, tile: pick(), r, tone: tone(), ext: 2.4, shadow: SH_ARM, shade: shadeArm(12),
        extra: armMarks(46, V_G2, 12) });
      // lower small blocks: two 散斗 on the arm ends, then the centre block riding on the projecting arm
      for (const cu of [-22.5, 22.5, 0]) {
        const hw = 8 + r.range(-0.3, 0.3);
        member(g, a, J(V_D1 + 5), T, douShape(cu, V_D1, hw, 6, 4, 2), { uc: cu, vc: V_D1 + 5, w: 16 * U, h: 10 * U, tile: pick(), r, tone: tone(), ext: 1.5, shadow: SH_DOU, shade: shadeDou(6 * U), extra: douMarks(cu, V_D1, hw) });
      }
      // second projecting arm
      member(g, a, P, T, headShape(V_G2), { uc: 0, vc: V_G2 + 7.5, w: 10 * U, h: 15 * U, tile: null, r, shadow: SH_HEAD, shade: shadeHead(i + 'b') });
      sets.push({ r, P, T, J, pick, tone, douMarks });
    }

    // 3) the beam on the arc (挑檐枋): grain follows the curve
    {
      // underside lip, seen from slightly below, and the shade the beam lays on what hangs under it
      g.save();
      g.shadowColor = 'rgba(6,5,22,0.8)'; g.shadowBlur = 30; g.shadowOffsetX = 13; g.shadowOffsetY = 30;
      g.fillStyle = '#1d1018'; a.pathBand(g, -bd + 1, -bd - 16, -sp, sp); g.fill();
      g.restore();
      g.fillStyle = L.radial(g, a.cx, a.cy, R - bd - 16, R - bd, [[0, '#2a140e'], [1, '#70401a']]); a.pathBand(g, -bd + 1, -bd - 16, -sp, sp); g.fill();
      g.save(); a.clipBand(g, 3, -bd, -sp, sp);
      const leftOfJoint = () => { g.beginPath(); trace(g, P0, [[-400, -2], [-JOINT.u, -2], [-JOINT.u, JOINT.v], [JOINT.u, JOINT.v], [JOINT.u, B + 1], [-400, B + 1]]); };
      const grain = () => {
        g.drawImage(beam.c, beam.x, beam.y);
        g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.6; g.drawImage(beamBump, beam.x, beam.y);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      };
      grain();
      // the length left of the lap joint is another piece of the log: its grain does not run on through the seam
      g.save(); leftOfJoint(); g.clip();
      g.translate(a.cx, a.cy); g.rotate(SLIP); g.translate(-a.cx, -a.cy);
      grain();
      g.restore();
      g.save(); leftOfJoint(); g.clip(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255,206,124,0.2)'; full(); g.restore();
      // pores and fibres following the curve
      const rf = L.rng('s13beamfib');
      for (let k = 0; k < 2400; k++) {
        const t0 = rf.range(-sp, sp), dr = -rf.range(0, bd);
        g.strokeStyle = rf.chance(0.72) ? `rgba(58,24,6,${rf.range(0.12, 0.4)})` : `rgba(255,222,160,${rf.range(0.08, 0.22)})`;
        g.lineWidth = rf.range(0.6, 1.3); g.beginPath(); a.trace(g, dr, t0, t0 + rf.range(8, 52) / R); g.stroke();
      }
      // knots
      const rk = L.rng('s13knot');
      for (const k of knotsAt) a.at(g, off + k.s / R, -k.t, () => knotCore(g, rk, k.w));
      // form: lit upper part, body, shaded belly (the bright arris itself is drawn live, exactly on the arc)
      g.fillStyle = L.radial(g, a.cx, a.cy, R - bd, R, [[0, 'rgba(18,8,14,0.52)'], [0.1, 'rgba(18,8,14,0.22)'], [0.36, 'rgba(0,0,0,0)'], [0.6, 'rgba(255,226,170,0.03)'], [1, 'rgba(255,226,170,0.26)']]);
      full();
      // a long soft sheen where hands and weather have polished the face, strongest toward the light
      g.save(); g.globalCompositeOperation = 'soft-light';
      for (const [dr, lwd, al] of [[-bd * 0.3, 26, 0.3], [-bd * 0.34, 9, 0.26]]) {
        g.strokeStyle = L.linear(g, 0, 0, W, 0, [[0, `rgba(255,236,190,${al * 0.5})`], [0.3, `rgba(255,236,190,${al})`], [0.55, `rgba(255,236,190,${al * 0.45})`], [1, 'rgba(255,236,190,0)']]);
        g.lineWidth = lwd; a.stroke(g, dr, -sp, sp);
      }
      g.restore();
      g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255,210,132,0.34)'; full(); g.restore();
      // drying checks along the grain
      const rc = L.rng('s13check');
      for (let k = 0; k < 15; k++) {
        const t0 = rc.range(-sp, sp), len = rc.range(90, 420) / R, dr = -rc.range(12, bd - 10), wd = rc.range(1, 2.6);
        g.strokeStyle = `rgba(18,8,12,${rc.range(0.5, 0.82)})`; g.lineWidth = wd; g.beginPath(); a.trace(g, dr, t0, t0 + len); g.stroke();
        g.strokeStyle = `rgba(18,8,12,${rc.range(0.3, 0.5)})`; g.lineWidth = wd * 0.5; g.beginPath(); a.trace(g, dr + rc.range(-1.5, 1.5), t0 - len * 0.25, t0 + len * 1.2); g.stroke();
        g.strokeStyle = 'rgba(255,226,170,0.26)'; g.lineWidth = 1.1; g.beginPath(); a.trace(g, dr - wd * 0.5 - 1, t0 + len * 0.1, t0 + len * 0.9); g.stroke();
      }
      // the lap joint (搭掌): a stepped seam, opened a little, its far lip catching the light
      {
        const seam = [[-JOINT.u, -1], [-JOINT.u + 0.15, JOINT.v * 0.5], [-JOINT.u, JOINT.v], [-2, JOINT.v + 0.12], [JOINT.u, JOINT.v], [JOINT.u - 0.12, B * 0.82], [JOINT.u, B + 1]];
        g.lineJoin = 'miter'; g.lineCap = 'butt';
        g.strokeStyle = 'rgba(255,228,176,0.42)'; g.lineWidth = 1.6; g.beginPath(); trace(g, P0, seam.map(([u, v]) => [u + 0.38, v + 0.38]), false); g.stroke();
        g.strokeStyle = 'rgba(10,6,14,0.92)'; g.lineWidth = 2.4; g.beginPath(); trace(g, P0, seam, false); g.stroke();
        // corners knocked off where the two tongues meet the faces
        const rj = L.rng('s13lap');
        chipsOn(g, P0, rj, -JOINT.u - 0.4, -JOINT.u + 0.6, 0, 0, 1, 'top');
        chipsOn(g, P0, rj, JOINT.u - 2.5, JOINT.u - 0.6, JOINT.v, JOINT.v, 1, 'top');
      }
      g.restore();
      // a row of wooden pegs 木销 pinning the beam: end grain, darker than the face; some proud, some sunk, one or two gone
      const rp = L.rng('s13peg');
      const stepA = pitch / 6;
      for (let k = Math.floor(-sp / stepA) - 1; k * stepA <= sp; k++) {
        const tp = off + (k + 0.5) * stepA + rp.range(-17, 17) / R, depth = 5.7 * U + rp.range(-3, 3), pr = rp.range(8, 11.5);
        const q = rp(), kind = q < 0.1 ? 'hole' : q < 0.3 ? 'sunk' : q < 0.55 ? 'flush' : 'proud';
        if (knotsAt.some((kn) => Math.abs((tp - off) * R - kn.s) < 70)) continue;
        a.at(g, tp, -depth, () => { g.save(); g.rotate(-tp); peg(g, rp, pr, kind); g.restore(); });   // keep the light direction fixed on the page
      }
    }

    // 4) upper small blocks: their ears lap over the beam and hold it
    for (const s of sets) {
      for (const cu of [-37.5, 37.5, 0]) {
        const hw = 8 + s.r.range(-0.3, 0.3);
        member(g, a, s.J(V_D2 + 5), s.T, douShape(cu, V_D2, hw, 6, 4, 2), { uc: cu, vc: V_D2 + 5, w: 16 * U, h: 10 * U, tile: s.pick(), r: s.r, tone: s.tone(0.04), ext: 1.5, shadow: SH_DOU, shade: shadeDou(6 * U), extra: s.douMarks(cu, V_D2, hw) });
      }
    }

    // 5) age: uneven patina, worm holes; then the light falls off down the tiers into a cool shade
    g.save(); a.clipBelow(g, 3);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3;
    g.drawImage(L.noiseTex(lw, lh, { seed: 's13patina', scale: 340, octaves: 4, warp: 0.5, res: 0.2, ramp: [[0, '#b0703a'], [0.5, '#f8ead6'], [1, '#ffffff']] }), -PAD, y0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    L.speckle(g, { seed: 's13worm', count: 900, x: -PAD, y: y0, w: lw, h: lh, rMin: 0.6, rMax: 2.2, colors: ['#1c0c0a', '#30160a'], alpha: [0.15, 0.6] });
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.34;
    g.drawImage(L.noiseTex(lw, lh, { seed: 's13grime', scale: 80, octaves: 3, warp: 0.4, res: 0.25, contrast: 1.3, ramp: [[0, '#9a5c34'], [0.45, '#f4e2cc'], [1, '#ffffff']] }), -PAD, y0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, a.cx, a.cy, R - 84 * U, R - bd, [[0, '#5a4460'], [0.4, '#957a7c'], [0.8, '#d6c5ba'], [1, '#ffffff']]);
    full();
    g.globalCompositeOperation = 'source-over';
    g.restore();

    // 6) depth of field: the lens is focused on the crest; the row softens toward both ends and toward the foot of the frame
    for (const [px, r0, r1] of [[2.4, 350, 600], [6.5, 580, 900]]) {
      const soft = L.blurred(c, px), sg = soft.getContext('2d');
      sg.globalCompositeOperation = 'destination-in';
      sg.translate(PAD + a.cx + off * R, a.crestY - y0 + 170); sg.scale(1.55, 1);
      sg.fillStyle = L.radial(sg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.96)']]);
      sg.fillRect(-2000, -2000, 4000, 4000);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(soft, 0, 0); g.restore();
    }
  });
  return layer;
}

// ───────────────────────── the paper ─────────────────────────
/** 磁青纸: a sheet dyed deep indigo — fibres showing paler through the dye, a little rubbed, a tooth that takes the light */
function buildPaper(env) {
  const a = env.arc;
  const y0 = -PAD, y1 = Math.ceil(a.yAt(-PAD) + 60), w = W + PAD * 2, h = y1 - y0;
  return strip(y0, y1, (g) => {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1b2f72'; g.fillRect(0, 0, w, h);
    // the dye took unevenly: broad clouds, then a finer mottle, all inside the one blue
    g.drawImage(L.noiseTex(w, h, { seed: 's13dyeA', scale: 560, octaves: 4, res: 0.2, warp: 0.6, ramp: [[0, 'rgba(9,18,62,0.55)'], [0.5, 'rgba(22,40,104,0)'], [1, 'rgba(58,88,178,0.34)']] }), 0, 0);
    g.drawImage(L.noiseTex(w, h, { seed: 's13dyeB', scale: 70, octaves: 3, res: 0.33, contrast: 1.4, ramp: [[0, 'rgba(8,16,58,0.26)'], [0.5, 'rgba(20,36,96,0)'], [1, 'rgba(84,112,200,0.16)']] }), 0, 0);
    // laid lines of the mould (帘纹), barely there
    const r = L.rng('s13fibre');
    for (let y = 0; y < h; y += 3.4) { g.strokeStyle = `rgba(150,172,240,${r.range(0.012, 0.05)})`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5 + r.range(-0.7, 0.7)); g.stroke(); }
    // fibres showing paler through the dye: mostly short, a few long ones lying across the sheet
    g.lineCap = 'round';
    for (let i = 0; i < 3000; i++) {
      const x = r() * w, y = r() * h, big = r.chance(0.05), len = big ? r.range(60, 210) : r.range(6, 40), ang = r() * Math.PI, bend = r.range(-0.9, 0.9);
      g.strokeStyle = r.chance(0.72) ? `rgba(${r.chance(0.3) ? '206,218,250' : '132,158,232'},${r.range(0.04, big ? 0.16 : 0.22)})` : `rgba(6,12,48,${r.range(0.08, 0.3)})`;
      g.lineWidth = r.range(0.45, big ? 1.1 : 1.3);
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + ex) / 2 - Math.sin(ang) * len * bend * 0.35, (y + ey) / 2 + Math.cos(ang) * len * bend * 0.35, ex, ey); g.stroke();
    }
    // places rubbed pale (磨白) and the odd undyed fleck
    L.speckle(g, { seed: 's13rub', count: 130, x: 0, y: 0, w, h, rMin: 0.7, rMax: 3, colors: ['#6f8fd8', '#93abe6', '#c9d6f5'], alpha: [0.05, 0.28], squash: 0.6 });
    // tooth
    const tooth = L.noiseTex(w, h, { seed: 's13tooth', scale: 3.4, octaves: 2, res: 0.5, contrast: 1.3, ramp: [[0, '#565656'], [1, '#aaaaaa']] });
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.36;
    g.drawImage(L.bumpLight(tooth, { angle: LIGHT, strength: 3, res: 0.5 }), 0, 0);
    g.restore();
    // the light pools on the sheet toward the upper left; the far corners fall off a little
    g.fillStyle = L.radial(g, 560, 100, 100, 1850, [[0, 'rgba(112,148,255,0.24)'], [0.45, 'rgba(112,148,255,0.03)'], [1, 'rgba(5,9,40,0.42)']]);
    g.fillRect(-PAD, y0, w, h);
  });
}

export default {
  name: '木构斗拱',
  tone: 'light',
  init(env) {
    S = { wood: buildWood(env), paper: buildPaper(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.025, p);
    put(ctx, env, S.wood, { rot, zoom });
    // warm key light from the upper left, pooling a little further along the beam as the shot runs
    const lx = L.lerp(600, 820, p), ly = a.crestY + 70;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.radial(ctx, lx, ly, 320, 1500, [[0, '#ffffff'], [0.45, '#efd2ac'], [1, '#86543a']]);
    ctx.fillRect(0, a.crestY - 10, W, H);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = L.radial(ctx, lx, ly, 40, 900, [[0, 'rgba(255,216,146,0.55)'], [0.6, 'rgba(255,216,146,0.14)'], [1, 'rgba(255,216,146,0)']]);
    ctx.fillRect(0, a.crestY - 10, W, H);
    ctx.restore();
    // the paper covers everything above the arc → the beam's upper edge is exactly the arc on every frame
    ctx.save(); a.clipAbove(ctx, 0);
    put(ctx, env, S.paper, { rot: rot * 0.5, zoom: 1 + (zoom - 1) * 0.5 });
    // where timber meets sheet: a narrow, soft occlusion shadow, blue like the paper
    for (const [lw, al] of [[30, 0.08], [16, 0.1], [7, 0.16]]) { ctx.strokeStyle = `rgba(4,7,30,${al})`; ctx.lineWidth = lw; a.stroke(ctx, 1); }
    ctx.restore();
    // the beam's upper arris: a warm chamfer just inside the arc, brightest where the key light strikes it
    ctx.save(); a.clipBelow(ctx, 0);
    ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(255,226,156,0.6)'], [lx / W, 'rgba(255,236,178,0.98)'], [0.68, 'rgba(255,222,150,0.7)'], [1, 'rgba(255,210,136,0.3)']]);
    ctx.lineWidth = 3.4; ctx.setLineDash([173, 5, 64, 3, 251, 8, 97, 4, 318, 6]); ctx.lineDashOffset = rot * a.R + 400; a.stroke(ctx, -2.4);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,214,140,0.16)'; ctx.lineWidth = 16; a.stroke(ctx, -6);
    ctx.restore();
    ctx.strokeStyle = 'rgba(6,8,28,0.8)'; ctx.lineWidth = 1.3; a.stroke(ctx, 0.3);
  },
};
