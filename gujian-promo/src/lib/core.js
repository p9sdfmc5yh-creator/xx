// core.js — shared drawing toolkit for every scene.
// Everything here is deterministic (seeded) so a frame always renders the same way.

export const W = 1920;
export const H = 1080;
export const FPS = 25;
export const TAU = Math.PI * 2;

// ───────────────────────── math ─────────────────────────
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, invLerp(a, b, v));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const ease = {
  linear: (t) => clamp(t),
  inQuad: (t) => { t = clamp(t); return t * t; },
  outQuad: (t) => { t = clamp(t); return 1 - (1 - t) * (1 - t); },
  inOutQuad: (t) => { t = clamp(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  inCubic: (t) => { t = clamp(t); return t * t * t; },
  outCubic: (t) => { t = clamp(t); return 1 - Math.pow(1 - t, 3); },
  inOutCubic: (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  inQuart: (t) => { t = clamp(t); return t * t * t * t; },
  outExpo: (t) => { t = clamp(t); return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
};
export const deg = (d) => (d * Math.PI) / 180;

// ───────────────────────── rng ─────────────────────────
function hashSeed(seed) {
  if (typeof seed === 'number') return (seed * 2654435761) >>> 0;
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Seeded PRNG. const r = rng('abc'); r() → [0,1); r.range(a,b); r.int(a,b); r.pick(arr); r.gauss(); r.chance(p) */
export function rng(seed = 1) {
  let a = hashSeed(seed) || 1;
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.gauss = () => { let u = 0, v = 0; while (u === 0) u = f(); v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

// ───────────────────────── noise ─────────────────────────
/** Seeded 2D simplex noise. n2 → [-1,1]; fbm → [-1,1]; ridged → [0,1]; cell(x,y) → {d, id} worley */
export function makeNoise(seed = 1) {
  const r = rng('noise' + seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function n2(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = p[ii + p[jj]] & 7; t0 *= t0; n += t0 * t0 * (GX[g] * x0 + GY[g] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = p[ii + i1 + p[jj + j1]] & 7; t1 *= t1; n += t1 * t1 * (GX[g] * x1 + GY[g] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = p[ii + 1 + p[jj + 1]] & 7; t2 *= t2; n += t2 * t2 * (GX[g] * x2 + GY[g] * y2); }
    return clamp(n * 70, -1, 1);
  }
  function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * n2(x * f + o * 17.1, y * f - o * 9.3); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  function ridged(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { const v = 1 - Math.abs(n2(x * f + o * 17.1, y * f - o * 9.3)); s += a * v * v; n += a; a *= gain; f *= lac; }
    return s / n;
  }
  // Worley / cellular noise: distance to nearest feature point (0..~1) and the cell id (0..1)
  function cell(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy;
      const h = p[(cx & 255) + p[cy & 255]];
      const h2 = p[(h + 57) & 255];
      const fx = cx + h / 255, fy = cy + h2 / 255;
      const d = Math.hypot(fx - x, fy - y);
      if (d < d1) { d2 = d1; d1 = d; id = h / 255; } else if (d < d2) d2 = d;
    }
    return { d: d1, d2, edge: d2 - d1, id };
  }
  return { n2, fbm, ridged, cell };
}

// ───────────────────────── color ─────────────────────────
let _cctx = null;
const _ccache = new Map();
/** parse any CSS color → [r,g,b,a] with r,g,b 0-255 and a 0-1 */
export function parseColor(c) {
  if (Array.isArray(c)) return c.length === 3 ? [c[0], c[1], c[2], 1] : c;
  if (_ccache.has(c)) return _ccache.get(c);
  if (!_cctx) _cctx = document.createElement('canvas').getContext('2d');
  _cctx.fillStyle = '#000'; _cctx.fillStyle = c;
  const s = _cctx.fillStyle;
  let out;
  if (s[0] === '#') out = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  else { const m = s.match(/[\d.]+/g).map(Number); out = [m[0], m[1], m[2], m[3] === undefined ? 1 : m[3]]; }
  _ccache.set(c, out);
  return out;
}
export const css = (c) => { const [r, g, b, a] = parseColor(c); return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(4)})`; };
/** rgba('#c0392b', 0.5) → css string with alpha multiplied */
export const rgba = (c, a = 1) => { const p = parseColor(c); return `rgba(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])},${+(p[3] * a).toFixed(4)})`; };
/** mix two css colors, t=0 → a, t=1 → b; returns css string */
export function mix(a, b, t) {
  const p = parseColor(a), q = parseColor(b);
  return css([lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t), lerp(p[3], q[3], t)]);
}
/** lighten (amt>0) or darken (amt<0) a color, amt in [-1,1] */
export const shade = (c, amt) => (amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt));
export const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
/** makeRamp([[0,'#000'],[0.5,'#f00'],[1,'#fff']]) → fn(t) → [r,g,b,a] */
export function makeRamp(stops) {
  const st = stops.map(([t, c]) => [t, parseColor(c)]).sort((a, b) => a[0] - b[0]);
  return (t) => {
    if (t <= st[0][0]) return st[0][1];
    for (let i = 1; i < st.length; i++) {
      if (t <= st[i][0]) {
        const k = (t - st[i - 1][0]) / (st[i][0] - st[i - 1][0] || 1);
        const a = st[i - 1][1], b = st[i][1];
        return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
      }
    }
    return st[st.length - 1][1];
  };
}
/** css string from a ramp at t */
export const rampCss = (stops, t) => css(makeRamp(stops)(t));

// ───────────────────────── canvas helpers ─────────────────────────
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
/** linear gradient with stops [[t,color],...] */
export function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(clamp(t), c);
  return g;
}
/** radial gradient with stops [[t,color],...] (t=0 at r0, t=1 at r1) */
export function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, c] of stops) g.addColorStop(clamp(t), c);
  return g;
}
/** return a blurred copy of a canvas */
export function blurred(src, px) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.filter = `blur(${px}px)`;
  g.drawImage(src, 0, 0);
  g.filter = 'none'; // leave the returned canvas with a clean context
  if (src._pad !== undefined) c._pad = src._pad;
  return c;
}
/** apply a CSS filter string (e.g. 'contrast(1.2) saturate(0.8)') and return a copy */
export function filtered(src, filter) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.filter = filter;
  g.drawImage(src, 0, 0);
  g.filter = 'none';
  if (src._pad !== undefined) c._pad = src._pad;
  return c;
}

// ───────────────────────── the arc ─────────────────────────
/**
 * The shared arc: a big circle whose top ("crest") sits near the middle of the frame.
 * theta is measured from the crest: 0 = top-centre, positive = to the right (radians).
 * dr offsets the radius: dr > 0 is OUTSIDE/above the arc, dr < 0 is INSIDE/below it.
 */
export function makeArc({ cx = 960, crestY = 560, R = 2400 } = {}) {
  const cy = crestY + R;
  const arc = {
    cx, cy, R, crestY,
    /** y of the arc at screen x (upper half of the circle) */
    yAt(x, dr = 0) { const r = R + dr, dx = x - cx; return cy - Math.sqrt(Math.max(0, r * r - dx * dx)); },
    /** point on the arc */
    pt(theta, dr = 0) { const r = R + dr; return { x: cx + r * Math.sin(theta), y: cy - r * Math.cos(theta) }; },
    thetaAtX(x, dr = 0) { return Math.asin(clamp((x - cx) / (R + dr), -1, 1)); },
    /** half-angle that covers the frame edge plus `margin` px */
    span(margin = 200) { return Math.asin(clamp((W / 2 + margin) / R, -1, 1)); },
    /** signed radial distance of a point from the arc: >0 above/outside, <0 below/inside */
    drAt(x, y) { return Math.hypot(x - cx, y - cy) - R; },
    /** polar coords of a point: {theta, dr} */
    polar(x, y) { return { theta: Math.atan2(x - cx, cy - y), dr: Math.hypot(x - cx, y - cy) - R }; },
    /** add the arc curve to the current path, from theta t0 to t1 (defaults cover frame + margin) */
    trace(ctx, dr = 0, t0, t1, moveTo = true) {
      const s = arc.span(400);
      if (t0 === undefined) t0 = -s; if (t1 === undefined) t1 = s;
      const r = R + dr;
      if (moveTo) { const p = arc.pt(t0, dr); ctx.moveTo(p.x, p.y); }
      ctx.arc(cx, cy, r, t0 - Math.PI / 2, t1 - Math.PI / 2, t1 < t0);
    },
    /** stroke the arc line */
    stroke(ctx, dr = 0, t0, t1) { ctx.beginPath(); arc.trace(ctx, dr, t0, t1); ctx.stroke(); },
    /** closed path of everything BELOW the arc (inside the circle), generous margins */
    pathBelow(ctx, dr = 0) {
      const s = arc.span(700);
      ctx.beginPath();
      arc.trace(ctx, dr, -s, s);
      const b = Math.max(H + 900, arc.pt(s, dr).y + 50);
      ctx.lineTo(arc.pt(s, dr).x, b); ctx.lineTo(arc.pt(-s, dr).x, b);
      ctx.closePath();
    },
    /** closed path of everything ABOVE the arc (outside the circle), generous margins */
    pathAbove(ctx, dr = 0) {
      const s = arc.span(700);
      ctx.beginPath();
      arc.trace(ctx, dr, -s, s);
      ctx.lineTo(arc.pt(s, dr).x, -900); ctx.lineTo(arc.pt(-s, dr).x, -900);
      ctx.closePath();
    },
    /** annular band between two radius offsets (dr0 outer/upper, dr1 inner/lower), theta range optional */
    pathBand(ctx, dr0, dr1, t0, t1) {
      const s = arc.span(500);
      if (t0 === undefined) t0 = -s; if (t1 === undefined) t1 = s;
      ctx.beginPath();
      ctx.arc(cx, cy, R + dr0, t0 - Math.PI / 2, t1 - Math.PI / 2, false);
      ctx.arc(cx, cy, R + dr1, t1 - Math.PI / 2, t0 - Math.PI / 2, true);
      ctx.closePath();
    },
    clipBelow(ctx, dr = 0) { arc.pathBelow(ctx, dr); ctx.clip(); },
    clipAbove(ctx, dr = 0) { arc.pathAbove(ctx, dr); ctx.clip(); },
    clipBand(ctx, dr0, dr1, t0, t1) { arc.pathBand(ctx, dr0, dr1, t0, t1); ctx.clip(); },
    fillBelow(ctx, style, dr = 0) { ctx.save(); ctx.fillStyle = style; arc.pathBelow(ctx, dr); ctx.fill(); ctx.restore(); },
    fillAbove(ctx, style, dr = 0) { ctx.save(); ctx.fillStyle = style; arc.pathAbove(ctx, dr); ctx.fill(); ctx.restore(); },
    fillBand(ctx, style, dr0, dr1, t0, t1) { ctx.save(); ctx.fillStyle = style; arc.pathBand(ctx, dr0, dr1, t0, t1); ctx.fill(); ctx.restore(); },
    /**
     * Run fn inside a local coordinate frame anchored on the arc at theta (+dr):
     * origin = the arc point, +x = along the arc to the right, +y = toward the circle centre (downward at the crest),
     * so "up/outward" is -y. Great for standing things on the arc or hanging things under it.
     */
    at(ctx, theta, dr, fn) {
      const p = arc.pt(theta, dr);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(theta);
      fn(ctx, p);
      ctx.restore();
    },
    /**
     * Evenly spaced positions along the arc. opts: {spacing (px along arc) | count, dr, t0, t1, margin}
     * returns [{theta, x, y, i, n, u}] (u = 0..1 across the run); pass fn to iterate.
     */
    along(opts = {}, fn) {
      const dr = opts.dr || 0;
      const s = arc.span(opts.margin === undefined ? 300 : opts.margin);
      const t0 = opts.t0 === undefined ? -s : opts.t0, t1 = opts.t1 === undefined ? s : opts.t1;
      const len = (R + dr) * (t1 - t0);
      let n = opts.count || Math.max(1, Math.round(len / (opts.spacing || 100)));
      // keep one element exactly on the crest when the run is symmetric
      const out = [];
      for (let i = 0; i <= n; i++) {
        const u = n === 0 ? 0.5 : i / n;
        const theta = lerp(t0, t1, u);
        const p = arc.pt(theta, dr);
        const item = { theta, x: p.x, y: p.y, i, n, u };
        out.push(item);
        if (fn) fn(item);
      }
      return out;
    },
  };
  return arc;
}

// ───────────────────────── layers & camera ─────────────────────────
/**
 * Pre-render a static layer once (in init), then blit it every frame with a little camera move.
 * The layer is the frame plus `pad` px on every side; inside `draw` you use normal frame coordinates
 * (0..1920, 0..1080) and may draw past the edges into the padding.
 */
export function makeLayer(pad, draw) {
  const c = makeCanvas(W + pad * 2, H + pad * 2);
  const g = c.getContext('2d');
  g.translate(pad, pad);
  c._pad = pad;
  if (draw) draw(g, c);
  return c;
}
/**
 * Draw a padded layer onto the frame.
 * opts: rot (radians, rotation about the arc's circle centre → detail slides ALONG the arc while the arc stays put),
 *       zoom (scale about the crest point, or opts.pivot {x,y}), dx/dy (px shift), alpha, blend, filter
 */
export function blit(ctx, env, layerCanvas, opts = {}) {
  const { rot = 0, zoom = 1, dx = 0, dy = 0, alpha = 1, blend = 'source-over', filter = null, pivot = null } = opts;
  const a = env.arc, pad = layerCanvas._pad || 0;
  const px = pivot ? pivot.x : a.cx, py = pivot ? pivot.y : a.crestY;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = blend;
  if (filter) ctx.filter = filter;
  ctx.translate(px + dx, py + dy); ctx.scale(zoom, zoom); ctx.translate(-px, -py);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(layerCanvas, -pad, -pad);
  ctx.restore();
}
/**
 * Composite a texture/shading canvas onto a layer ONLY where the layer already has pixels (transparent areas stay transparent).
 * Plain multiply/overlay/soft-light would also paint the transparent parts; this clips the texture by the layer's alpha first.
 *   overlayOn(layer, tex, { blend: 'overlay', alpha: 0.6 })   → mutates and returns `layer`
 * `tex` must be the same pixel size as `layer` (e.g. both made with makeLayer(PAD) / noiseLayer(PAD) / bumpLight(layer)).
 */
export function overlayOn(layerCanvas, tex, opts = {}) {
  const { blend = 'overlay', alpha = 1 } = opts;
  const tmp = makeCanvas(layerCanvas.width, layerCanvas.height);
  const tg = tmp.getContext('2d');
  tg.drawImage(tex, 0, 0, tmp.width, tmp.height);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(layerCanvas, 0, 0);
  const g = layerCanvas.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha; g.globalCompositeOperation = blend;
  g.drawImage(tmp, 0, 0);
  g.restore();
  return layerCanvas;
}
/** apply the same camera transform to live drawing: cam(ctx, env, {rot, zoom, dx, dy}, () => {...}) */
export function cam(ctx, env, opts, fn) {
  const { rot = 0, zoom = 1, dx = 0, dy = 0, pivot = null } = opts || {};
  const a = env.arc;
  const px = pivot ? pivot.x : a.cx, py = pivot ? pivot.y : a.crestY;
  ctx.save();
  ctx.translate(px + dx, py + dy); ctx.scale(zoom, zoom); ctx.translate(-px, -py);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  fn(ctx);
  ctx.restore();
}

// ───────────────────────── procedural textures ─────────────────────────
/**
 * Noise texture canvas (w×h).
 * opts: seed, scale (feature size px), octaves, gain, lac, sx/sy (stretch factors: sx=8 → long horizontal streaks),
 *       ridged (bool), contrast, bias, warp (0..2 domain warp), ramp ([[t,color]...] or fn(t)→[r,g,b,a]),
 *       res (0.25..1 internal resolution; lower = faster/softer),
 *       polar: {cx, cy, R} in THIS canvas's pixel coords → u runs along the arc (px of arc length), v runs radially
 *              (so sx stretches along the arc, sy stretches radially). Use polarNoiseLayer() for the easy path.
 */
export function noiseTex(w, h, opts = {}) {
  const { seed = 1, scale = 200, octaves = 4, gain = 0.5, lac = 2, sx = 1, sy = 1, res = 0.5, warp = 0, warpScale = 2.5,
    ridged = false, cellular = false, contrast = 1, bias = 0, ramp = [[0, '#000'], [1, '#fff']], ox = 0, oy = 0, polar = null } = opts;
  const cw = Math.max(2, Math.round(w * res)), ch = Math.max(2, Math.round(h * res));
  const nz = makeNoise(seed);
  const rampFn = typeof ramp === 'function' ? ramp : makeRamp(ramp);
  const img = new ImageData(cw, ch);
  const d = img.data;
  const lut = new Uint8ClampedArray(1024 * 4);
  for (let i = 0; i < 1024; i++) { const c = rampFn(i / 1023); lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = (c[3] === undefined ? 1 : c[3]) * 255; }
  let k = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let px = x / res + ox, py = y / res + oy;
      if (polar) {
        const ddx = px - polar.cx, ddy = polar.cy - py;
        const rr = Math.hypot(ddx, ddy);
        px = Math.atan2(ddx, ddy) * polar.R; py = polar.R - rr; // py > 0 below the arc
      }
      let u = px / (scale * sx), v = py / (scale * sy);
      if (warp) {
        const wx = nz.fbm(u / warpScale + 31.4, v / warpScale + 7.7, 2);
        const wy = nz.fbm(u / warpScale - 11.9, v / warpScale + 53.1, 2);
        u += warp * wx; v += warp * wy;
      }
      let n;
      if (cellular) n = clamp(nz.cell(u, v).d);
      else if (ridged) n = nz.ridged(u, v, octaves, lac, gain);
      else n = nz.fbm(u, v, octaves, lac, gain) * 0.5 + 0.5;
      n = clamp((n - 0.5) * contrast + 0.5 + bias);
      const li = (n * 1023) | 0;
      d[k++] = lut[li * 4]; d[k++] = lut[li * 4 + 1]; d[k++] = lut[li * 4 + 2]; d[k++] = lut[li * 4 + 3];
    }
  }
  const small = makeCanvas(cw, ch);
  small.getContext('2d').putImageData(img, 0, 0);
  if (res === 1) return small;
  const out = makeCanvas(w, h);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, w, h);
  return out;
}
/** noiseTex as a padded layer in frame coordinates (so it can be blit() with camera moves). */
export function noiseLayer(pad, opts = {}) {
  const c = noiseTex(W + pad * 2, H + pad * 2, { ...opts, ox: (opts.ox || 0) - pad, oy: (opts.oy || 0) - pad });
  c._pad = pad;
  return c;
}
/** noise that follows the arc: sx stretches ALONG the arc, sy stretches RADIALLY. Returns a padded layer. */
export function polarNoiseLayer(env, pad, opts = {}) {
  const a = env.arc;
  const c = noiseTex(W + pad * 2, H + pad * 2, { ...opts, polar: { cx: a.cx + pad, cy: a.cy + pad, R: a.R } });
  c._pad = pad;
  return c;
}
/**
 * Fine per-pixel grain canvas, neutral grey ± amount. Composite with ctx.globalCompositeOperation = 'overlay' or 'soft-light'.
 * opts: seed, amount (0..1), mono (true = grey), size (1 = per pixel, 2 = chunkier)
 */
export function grainTex(w, h, opts = {}) {
  const { seed = 7, amount = 0.5, mono = true, size = 1 } = opts;
  const cw = Math.ceil(w / size), ch = Math.ceil(h / size);
  const r = rng('grain' + seed);
  const img = new ImageData(cw, ch); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 128 + (r() - 0.5) * 255 * amount;
    if (mono) { d[i] = d[i + 1] = d[i + 2] = g; }
    else { d[i] = g; d[i + 1] = 128 + (r() - 0.5) * 255 * amount; d[i + 2] = 128 + (r() - 0.5) * 255 * amount; }
    d[i + 3] = 255;
  }
  const small = makeCanvas(cw, ch);
  small.getContext('2d').putImageData(img, 0, 0);
  if (size === 1) return small;
  const out = makeCanvas(w, h); const g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.drawImage(small, 0, 0, w, h);
  return out;
}
/**
 * Fake relief lighting from a height map. Draw anything in greyscale onto a canvas (white = high, black = low),
 * pass it here, and you get a grey shading canvas (128 = flat). Composite it with 'overlay' / 'soft-light' / 'hard-light'
 * over your colour layer to make carving, tiles, plaster, brush ridges look embossed.
 * opts: angle (degrees; the direction the light travels across the canvas: 45 = lit from the TOP-LEFT, 135 = from the top-right,
 *       225 = from the bottom-right (the default, kept for backward compatibility), 315 = from the bottom-left),
 *       strength (1..12), blur (px pre-blur of the height map), res
 */
export function bumpLight(heightCanvas, opts = {}) {
  const { angle = 225, strength = 4, blur = 0, res = 0.5 } = opts;
  const w = heightCanvas.width, h = heightCanvas.height;
  const cw = Math.max(2, Math.round(w * res)), ch = Math.max(2, Math.round(h * res));
  const tmp = makeCanvas(cw, ch); const tg = tmp.getContext('2d', { willReadFrequently: true });
  if (blur) tg.filter = `blur(${blur * res}px)`;
  tg.drawImage(heightCanvas, 0, 0, cw, ch);
  const src = tg.getImageData(0, 0, cw, ch).data;
  const out = new ImageData(cw, ch); const o = out.data;
  const lx = Math.cos(deg(angle)), ly = Math.sin(deg(angle));
  const L = (x, y) => { x = x < 0 ? 0 : x >= cw ? cw - 1 : x; y = y < 0 ? 0 : y >= ch ? ch - 1 : y; const i = (y * cw + x) * 4; return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) * (src[i + 3] / 255); };
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const gx = L(x + 1, y) - L(x - 1, y), gy = L(x, y + 1) - L(x, y - 1);
    const s = 128 + (gx * lx + gy * ly) * strength;
    const i = (y * cw + x) * 4;
    o[i] = o[i + 1] = o[i + 2] = s; o[i + 3] = 255;
  }
  tg.filter = 'none'; tg.putImageData(out, 0, 0);
  const res2 = makeCanvas(w, h); const g = res2.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(tmp, 0, 0, w, h);
  if (heightCanvas._pad !== undefined) res2._pad = heightCanvas._pad;
  return res2;
}

/** scatter dots: speckle(ctx, {seed, count, x,y,w,h, rMin, rMax, colors:[...], alpha:[min,max], test:(x,y)=>bool}) */
export function speckle(ctx, opts = {}) {
  const { seed = 3, count = 500, x = -200, y = -200, w = W + 400, h = H + 400, rMin = 0.5, rMax = 2, colors = ['#000'], alpha = [0.2, 0.8], test = null, squash = 1 } = opts;
  const r = rng('sp' + seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const px = x + r() * w, py = y + r() * h;
    if (test && !test(px, py)) continue;
    const rad = lerp(rMin, rMax, Math.pow(r(), 2.2));
    ctx.globalAlpha = lerp(alpha[0], alpha[1], r());
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.beginPath(); ctx.ellipse(px, py, rad, rad * squash, r() * Math.PI, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ready-made materials (each returns a canvas w×h; wrap with makeLayer + drawImage, or use directly as a pattern source)
/** aged paper / silk. opts: base, seed, tone (stain colour), fiber (0..1), stain (0..1) */
export function paperTex(w, h, opts = {}) {
  const { base = '#e8dcc2', seed = 11, tone = '#8a6a3a', fiber = 0.5, stain = 0.5, grain = 0.22 } = opts;
  const c = makeCanvas(w, h); const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.55 * stain;
  g.drawImage(noiseTex(w, h, { seed, scale: 520, octaves: 4, res: 0.25, ramp: [[0, rgba(tone, 0.55)], [0.55, rgba(tone, 0.08)], [1, rgba('#fff', 0.25)]] }), 0, 0);
  g.globalAlpha = 0.35 * stain;
  g.drawImage(noiseTex(w, h, { seed: seed + 1, scale: 90, octaves: 3, res: 0.33, ramp: [[0, rgba(tone, 0.5)], [0.6, rgba(tone, 0)], [1, rgba('#fff', 0.2)]] }), 0, 0);
  g.globalAlpha = 1;
  if (fiber > 0) {
    const r = rng('fib' + seed);
    g.lineCap = 'round';
    for (let i = 0; i < 900 * fiber; i++) {
      const x = r() * w, y = r() * h, len = r.range(6, 38), a = r() * Math.PI;
      g.strokeStyle = r.chance(0.5) ? rgba(tone, r.range(0.05, 0.22)) : rgba('#fff', r.range(0.05, 0.25));
      g.lineWidth = r.range(0.4, 1.2);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + r.range(-4, 4), y + Math.sin(a) * len * 0.5 + r.range(-4, 4), x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  }
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 1;
  g.drawImage(grainTex(w, h, { seed: seed + 5, amount: grain }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}
/** wood grain. opts: base, dark, seed, scale, dir ('h' | 'v'), rings (0..1 adds knots/ring swirl) */
export function woodTex(w, h, opts = {}) {
  const { base = '#9b6a3c', dark = '#4a2c14', light = '#c79a62', seed = 21, scale = 60, dir = 'h', rings = 0.3 } = opts;
  const long = 14, short = 0.55;
  const c = noiseTex(w, h, {
    seed, scale, octaves: 5, gain: 0.55, sx: dir === 'h' ? long : short, sy: dir === 'h' ? short : long, warp: 0.35 + rings, warpScale: 1.4, res: 0.5,
    ridged: true, contrast: 1.25, ramp: [[0, dark], [0.35, mix(dark, base, 0.6)], [0.62, base], [1, light]],
  });
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5;
  g.drawImage(noiseTex(w, h, { seed: seed + 3, scale: scale * 5, octaves: 3, res: 0.25, ramp: [[0, mix(dark, base, 0.4)], [0.6, '#fff'], [1, '#fff']] }), 0, 0);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.6;
  g.drawImage(grainTex(w, h, { seed: seed + 9, amount: 0.2 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}
/** stone / plaster / brick-ish mottled surface. opts: base, dark, light, seed, scale, speck (0..1), rough (0..1) */
export function stoneTex(w, h, opts = {}) {
  const { base = '#9a968c', dark = '#5d5a54', light = '#d6d2c6', seed = 31, scale = 180, speck = 0.5, rough = 0.6 } = opts;
  const c = noiseTex(w, h, { seed, scale, octaves: 5, gain: 0.55, warp: 0.5, res: 0.5, contrast: 1.2, ramp: [[0, dark], [0.45, base], [1, light]] });
  const g = c.getContext('2d');
  g.globalAlpha = 0.5 * rough; g.globalCompositeOperation = 'multiply';
  g.drawImage(noiseTex(w, h, { seed: seed + 2, scale: scale * 0.12, octaves: 3, res: 0.5, contrast: 1.6, ramp: [[0, mix(dark, '#000', 0.2)], [0.5, '#fff'], [1, '#fff']] }), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (speck > 0) speckle(g, { seed: seed + 4, count: 2600 * speck * (w * h) / (W * H), x: 0, y: 0, w, h, rMin: 0.4, rMax: 1.8, colors: [dark, light, '#2b2925'], alpha: [0.15, 0.6] });
  g.globalCompositeOperation = 'overlay';
  g.drawImage(grainTex(w, h, { seed: seed + 6, amount: 0.25 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}
/** woven cloth. opts: base, warp (thread colour), weft, seed, pitch (thread spacing px), slub (0..1 irregularity) */
export function weaveTex(w, h, opts = {}) {
  const { base = '#27406b', warp = '#3a5a8f', weft = '#1b2d4d', seed = 41, pitch = 3, slub = 0.5 } = opts;
  const c = makeCanvas(w, h); const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = rng('weave' + seed);
  g.lineWidth = pitch * 0.55;
  for (let x = 0; x < w; x += pitch) { g.strokeStyle = rgba(warp, r.range(0.35, 0.9)); g.beginPath(); g.moveTo(x + r.range(-0.4, 0.4), 0); g.lineTo(x + r.range(-0.4, 0.4), h); g.stroke(); }
  for (let y = 0; y < h; y += pitch) { g.strokeStyle = rgba(weft, r.range(0.25, 0.75)); g.beginPath(); g.moveTo(0, y + r.range(-0.4, 0.4)); g.lineTo(w, y + r.range(-0.4, 0.4)); g.stroke(); }
  g.globalAlpha = 0.5 * slub; g.globalCompositeOperation = 'soft-light';
  g.drawImage(noiseTex(w, h, { seed, scale: 40, sx: 9, sy: 0.6, octaves: 3, res: 0.5, contrast: 1.8 }), 0, 0);
  g.drawImage(noiseTex(w, h, { seed: seed + 1, scale: 40, sx: 0.6, sy: 9, octaves: 3, res: 0.5, contrast: 1.8 }), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'overlay';
  g.drawImage(grainTex(w, h, { seed: seed + 2, amount: 0.3 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}

// ───────────────────────── brushes & marks ─────────────────────────
/** Catmull-Rom resample of a polyline: pts [[x,y],...] → dense [[x,y],...] at ~step px */
export function smoothPath(pts, step = 4) {
  if (pts.length < 3) {
    const out = []; const [a, b] = pts; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = 0; i <= n; i++) out.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
    return out;
  }
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** points along the arc as a polyline: arcPts(arc, dr, t0, t1, n) → [[x,y]...] */
export function arcPts(arc, dr = 0, t0, t1, n = 80) {
  const s = arc.span(300);
  if (t0 === undefined) t0 = -s; if (t1 === undefined) t1 = s;
  const out = [];
  for (let i = 0; i <= n; i++) { const p = arc.pt(lerp(t0, t1, i / n), dr); out.push([p.x, p.y]); }
  return out;
}
/**
 * Ink-brush stroke with pressure and optional dry-brush streaks.
 * pts: [[x,y],...] (will be smoothed). opts: width, color, seed, taper [in,out] fractions (0..0.5), wobble (0..1), dry (0..1), alpha
 * Note: `dry` scratches gaps with destination-out on the target context, so it also erases whatever is already under the stroke —
 * draw dry strokes on their own layer. `wobble` jitter is in absolute pixels: scale your points, not the context.
 */
export function inkStroke(ctx, pts, opts = {}) {
  const { width = 10, color = '#111', seed = 1, taper = [0.15, 0.3], wobble = 0.25, dry = 0, alpha = 1, smoothStep = 3 } = opts;
  const p = smoothPath(pts, smoothStep);
  const n = p.length; if (n < 2) return;
  const nz = makeNoise('ink' + seed);
  const sn = typeof seed === 'number' ? seed : (hashSeed(seed) % 9973) / 7; // numeric form for the noise lookups (string seeds are fine)
  const L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const u = i / (n - 1);
    let wv = 1;
    if (taper[0] > 0 && u < taper[0]) wv *= Math.pow(u / taper[0], 0.6);
    if (taper[1] > 0 && u > 1 - taper[1]) wv *= Math.pow((1 - u) / taper[1], 0.8);
    wv *= 1 + wobble * nz.n2(u * 9, sn * 0.37);
    const hw = Math.max(0.3, (width * wv) / 2);
    const j = wobble * 0.8 * nz.n2(u * 40, 9.1);
    L.push([p[i][0] + nx * (hw + j), p[i][1] + ny * (hw + j)]);
    Rr.push([p[i][0] - nx * (hw - j), p[i][1] - ny * (hw - j)]);
  }
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
  ctx.closePath(); ctx.fill();
  if (dry > 0) {
    // dry-brush: scratch thin gaps along the stroke
    const r = rng('dry' + seed);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = Math.max(0.6, width * 0.05);
    const streaks = Math.round(width * 0.5 * dry) + 1;
    for (let s = 0; s < streaks; s++) {
      const off = r.range(-0.45, 0.45), start = Math.floor(r.range(0.1, 0.8) * n), len = Math.floor(r.range(0.1, 0.5) * n);
      ctx.globalAlpha = r.range(0.3, 0.9) * dry;
      ctx.beginPath();
      for (let i = start; i < Math.min(n, start + len); i++) {
        const x = lerp(Rr[i][0], L[i][0], 0.5 + off), y = lerp(Rr[i][1], L[i][1], 0.5 + off);
        if (i === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}
/**
 * Chalk / crayon / pastel line along a polyline: grainy, broken, slightly doubled.
 * opts: width, color, seed, density (0..1), jitter (px), alpha
 */
export function chalkStroke(ctx, pts, opts = {}) {
  const { width = 5, color = '#fff', seed = 1, density = 0.75, jitter = 1.2, alpha = 0.9, step = 1.5 } = opts;
  const p = smoothPath(pts, step);
  const r = rng('chalk' + seed);
  const nz = makeNoise('chalk' + seed);
  ctx.save(); ctx.fillStyle = color;
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const press = 0.75 + 0.25 * nz.n2(i * 0.01, 3.3);
    const grainN = Math.ceil(width * 1.3);
    for (let k = 0; k < grainN; k++) {
      if (r() > density * press) continue;
      const o = (r() - 0.5) * width * press;
      const x = p[i][0] + nx * o + (r() - 0.5) * jitter, y = p[i][1] + ny * o + (r() - 0.5) * jitter;
      const edge = 1 - Math.abs(o) / (width * 0.5 + 0.001);
      ctx.globalAlpha = alpha * (0.35 + 0.65 * r()) * (0.4 + 0.6 * edge);
      const s = r.range(0.7, 1.9);
      ctx.fillRect(x, y, s, s);
    }
  }
  ctx.restore();
}
/** chalk line between two points */
export const chalkLine = (ctx, x0, y0, x1, y1, opts) => chalkStroke(ctx, [[x0, y0], [x1, y1]], opts);
/** hand-drawn pencil/pen line: slightly wobbly, optional double pass. opts: width, color, seed, wobble (px), passes, alpha */
export function sketchLine(ctx, pts, opts = {}) {
  const { width = 1.6, color = '#222', seed = 1, wobble = 1.2, passes = 2, alpha = 0.85 } = opts;
  const nz = makeNoise('sk' + seed);
  const p = smoothPath(pts, 6);
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < passes; k++) {
    ctx.globalAlpha = alpha * (k === 0 ? 1 : 0.55); ctx.lineWidth = width * (k === 0 ? 1 : 0.7);
    ctx.beginPath();
    for (let i = 0; i < p.length; i++) {
      const x = p[i][0] + wobble * nz.n2(i * 0.06 + k * 13, seed * 0.7 + k), y = p[i][1] + wobble * nz.n2(i * 0.06 - k * 7, seed * 1.3 + 40 + k);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
/** rough/torn polygon path (call ctx.fill() / ctx.clip() after). pts: [[x,y]...] closed implicitly. */
export function roughPoly(ctx, pts, opts = {}) {
  const { rough = 4, seed = 1, step = 10 } = opts;
  const nz = makeNoise('rough' + seed);
  ctx.beginPath();
  let k = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(len / step));
    let nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
    for (let j = 0; j < n; j++) {
      const t = j / n; const o = rough * (nz.n2(k * 0.35, seed) + 0.5 * nz.n2(k * 1.7, seed + 9)); k++;
      const x = lerp(a[0], b[0], t) + nx * o, y = lerp(a[1], b[1], t) + ny * o;
      if (i === 0 && j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

// ───────────────────────── fx ─────────────────────────
/** darken the frame edges. opts: strength (0..1), color, inner (0..1), outer (0..1.2) */
export function vignette(ctx, opts = {}) {
  const { strength = 0.45, color = '#000', inner = 0.45, outer = 1.05 } = opts;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const rad = Math.hypot(W / 2, H / 2);
  ctx.fillStyle = radial(ctx, W / 2, H / 2, rad * inner, rad * outer, [[0, rgba(color, 0)], [1, rgba(color, strength)]]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
/** soft light bloom spot: glow(ctx, x, y, r, color, alpha, blend='screen') */
export function glow(ctx, x, y, r, color = '#fff', alpha = 0.6, blend = 'screen') {
  ctx.save(); ctx.globalCompositeOperation = blend;
  ctx.fillStyle = radial(ctx, x, y, 0, r, [[0, rgba(color, alpha)], [0.4, rgba(color, alpha * 0.35)], [1, rgba(color, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
/** overlay a grain canvas over the whole frame (ignores current transform). */
export function overlayGrain(ctx, grainCanvas, alpha = 0.5, blend = 'overlay', ox = 0, oy = 0) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
  ctx.drawImage(grainCanvas, -ox, -oy);
  ctx.restore();
}

// ───────────────────────── text ─────────────────────────
export const FONTS = {
  serif: '"GJ Serif", "Noto Serif SC", serif',     // 思源宋体, variable weight 200–900
  brush: '"GJ Brush", cursive',                    // 马善政楷书 (brush regular script)
  xiaowei: '"GJ XiaoWei", serif',                  // 站酷小薇 (display serif)
  cao: '"GJ Cao", cursive',                        // 刘建毛草 (running/cursive brush)
  latin: '"GJ Latin", "Cormorant Garamond", serif', // Cormorant Garamond
};
/**
 * Draw text. opts: font ('serif'|'brush'|'xiaowei'|'cao'|'latin'), size, weight, color, align, baseline,
 *   spacing (extra px between chars), kern ([px after char 0, px after char 1, …]), vertical (stack chars top→bottom),
 *   alpha, rotate (rad), stroke {color,width}
 */
export function text(ctx, str, x, y, opts = {}) {
  const { font = 'serif', size = 48, weight = 600, color = '#fff', align = 'center', baseline = 'middle', spacing = 0, vertical = false, alpha = 1, rotate = 0, stroke = null, italic = false, kern = null } = opts;
  ctx.save();
  ctx.translate(x, y); if (rotate) ctx.rotate(rotate);
  ctx.globalAlpha *= alpha;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONTS[font] || font}`;
  ctx.fillStyle = color; ctx.textBaseline = baseline;
  const chars = Array.from(str);
  const put = (s, px, py) => { if (stroke) { ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineJoin = 'round'; ctx.strokeText(s, px, py); } ctx.fillText(s, px, py); };
  if (vertical) {
    ctx.textAlign = 'center';
    const step = size + spacing; const total = step * (chars.length - 1);
    const y0 = baseline === 'top' ? 0 : baseline === 'bottom' ? -total : -total / 2;
    chars.forEach((ch, i) => put(ch, 0, y0 + i * step));
  } else if (spacing || kern) {
    // kern: optional array of extra px after each character (e.g. [-8] pulls the 2nd character toward the 1st)
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const gaps = chars.map((_, i) => (i < chars.length - 1 ? spacing + ((kern && kern[i]) || 0) : 0));
    const total = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
    let px = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    ctx.textAlign = 'left';
    chars.forEach((ch, i) => { put(ch, px, 0); px += widths[i] + gaps[i]; });
  } else { ctx.textAlign = align; put(str, 0, 0); }
  ctx.restore();
}
