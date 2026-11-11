// plate.js — helpers for the square "collector's plate" films (1080 × 1080): the coin glyph every plate shares,
// layouts that place objects along it, aged papers, sprites with soft contact shadows, and a slow camera drift.
// The glyph is the outline of a square-holed round coin (方孔圆钱): a disc of radius R with an axis-aligned square hole.
// Scene modules import this as K and core.js as L. Nothing here touches the 1920 × 1080 arc films.
import * as L from './core.js';

export const S = 1080;                                   // frame is S × S
export const GLYPH = Object.freeze({ cx: 540, cy: 540, R: 360, a: 128 });   // a = HALF the side of the square hole
const TAU = Math.PI * 2;

/** Path of the glyph (disc with a square hole). Fill / clip with the 'evenodd' rule.
 *  opts: cx, cy, R, a (override), grow (px: >0 fattens the coin — bigger disc, smaller hole), corner (hole corner radius) */
export function glyphPath(ctx, o = {}) {
  const { cx, cy, R, a } = { ...GLYPH, ...o };
  const grow = o.grow || 0;
  const h = Math.max(1, a - grow), r = Math.min(o.corner === undefined ? 5 : o.corner, h);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, R + grow), 0, TAU);
  ctx.moveTo(cx - h, cy - h + r);
  ctx.lineTo(cx - h, cy + h - r); ctx.quadraticCurveTo(cx - h, cy + h, cx - h + r, cy + h);
  ctx.lineTo(cx + h - r, cy + h); ctx.quadraticCurveTo(cx + h, cy + h, cx + h, cy + h - r);
  ctx.lineTo(cx + h, cy - h + r); ctx.quadraticCurveTo(cx + h, cy - h, cx + h - r, cy - h);
  ctx.lineTo(cx - h + r, cy - h); ctx.quadraticCurveTo(cx - h, cy - h, cx - h, cy - h + r);
  ctx.closePath();
}
export function fillGlyph(ctx, style, o) { glyphPath(ctx, o); ctx.fillStyle = style; ctx.fill('evenodd'); }
export function clipGlyph(ctx, o) { glyphPath(ctx, o); ctx.clip('evenodd'); }
export function strokeGlyph(ctx, o) { glyphPath(ctx, o); ctx.stroke(); }

/** Signed distance to the glyph: negative INSIDE the coin's body ("肉"), positive in the hole and outside the disc. */
export function sdGlyph(x, y, o = {}) {
  const { cx, cy, R, a } = { ...GLYPH, ...o };
  return Math.max(Math.hypot(x - cx, y - cy) - R, a - Math.max(Math.abs(x - cx), Math.abs(y - cy)));
}
export const inGlyph = (x, y, margin = 0, o) => sdGlyph(x, y, o) < -margin;

/** n slots on a circle of radius r around the glyph centre. Each: { x, y, ang (direction pointing OUT of the coin, rad), i, u } */
export function ringSlots({ n, r, seed = 'ring', jitter = 0, phase = null, cx = GLYPH.cx, cy = GLYPH.cy }) {
  const rnd = L.rng(seed); const ph = phase === null ? rnd() * TAU : phase; const out = [];
  for (let i = 0; i < n; i++) {
    const t = ph + (i / n) * TAU + (rnd() - 0.5) * jitter * (TAU / n);
    const rr = r + (rnd() - 0.5) * jitter * 14;
    out.push({ x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr, ang: t, i, u: i / n, row: 'ring' });
  }
  return out;
}
/** slots along a square of half-side d (centres on the square), perSide per side. ang points away from the centre (side normal; diagonal at corners). */
export function squareSlots({ perSide, d, seed = 'sq', jitter = 0, cx = GLYPH.cx, cy = GLYPH.cy }) {
  const rnd = L.rng(seed); const out = []; const step = (2 * d) / perSide;
  const sides = [[-1, -1, 1, 0, -Math.PI / 2], [1, -1, 0, 1, 0], [1, 1, -1, 0, Math.PI / 2], [-1, 1, 0, -1, Math.PI]];   // start corner, direction, outward normal
  sides.forEach(([sx, sy, dx, dy, nrm], s) => {
    for (let k = 0; k < perSide; k++) {
      const j = (rnd() - 0.5) * jitter * step * 0.35;
      const x = cx + sx * d + dx * (k * step + j), y = cy + sy * d + dy * (k * step + j);
      const ang = k === 0 ? nrm - Math.PI / 4 : nrm;
      out.push({ x, y, ang, i: out.length, side: s, k, corner: k === 0, row: 'square' });
    }
  });
  return out;
}
/** dart-throwing: points inside the coin body, at least `spacing` apart and `margin` from its edges. avoid: [{x,y,r}] */
export function scatter({ seed = 'sc', spacing = 60, margin = 20, max = 400, avoid = [], tries = 6000, o = {} }) {
  const rnd = L.rng(seed); const g = { ...GLYPH, ...o }; const pts = [];
  for (let t = 0; t < tries && pts.length < max; t++) {
    const x = g.cx + (rnd() * 2 - 1) * g.R, y = g.cy + (rnd() * 2 - 1) * g.R;
    if (sdGlyph(x, y, o) > -margin) continue;
    let ok = true;
    for (const p of pts) if (Math.hypot(p.x - x, p.y - y) < spacing) { ok = false; break; }
    if (ok) for (const p of avoid) if (Math.hypot(p.x - x, p.y - y) < spacing * 0.5 + (p.r || 0)) { ok = false; break; }
    if (ok) pts.push({ x, y, ang: Math.atan2(y - g.cy, x - g.cx), rot: rnd() * TAU, i: pts.length, row: 'fill' });
  }
  return pts;
}
/**
 * The standard way to make objects of roughly `size` px spell the glyph: one row hugging the outer circle, one row lining the
 * square hole (so the hole reads as a SQUARE with four straight sides), and the space between filled in.
 * Returns [{ x, y, ang, row: 'ring' | 'square' | 'fill', size }]. Tune `size` so the rows are dense; draw 'fill' first.
 */
export function coinLayout({ seed = 'lay', size = 78, jitter = 0.25, fill = true, gap = 1.04 } = {}) {
  const g = GLYPH; const r = g.R - size * 0.5, d = g.a + size * 0.5;
  const ring = ringSlots({ n: Math.max(6, Math.round((TAU * r) / (size * gap))), r, seed: seed + 'r', jitter });
  const sq = squareSlots({ perSide: Math.max(2, Math.round((2 * d) / (size * gap))), d, seed: seed + 's', jitter });
  const all = [...ring, ...sq];
  all.forEach((s) => { s.size = size; });
  if (fill) {
    const f = scatter({ seed: seed + 'f', spacing: size * 0.98, margin: size * 0.5, avoid: all.map((s) => ({ x: s.x, y: s.y, r: size * 0.48 })) });
    f.forEach((s) => { s.size = size; });
    return [...f, ...all];
  }
  return all;
}

// ───────────────────────── papers ─────────────────────────
/** aged paper, S × S (or opts.size). opts: base, tone (stain colour), seed, fiber, stain, grain, edge (0..1 darkened edges), foxing (0..1) */
export function paper(o = {}) {
  const { base = '#efe6d3', tone = '#8a6a3a', seed = 'paper', fiber = 0.5, stain = 0.35, grain = 0.2, edge = 0.22, foxing = 0.25, size = S } = o;
  const c = L.paperTex(size, size, { base, seed, tone, fiber, stain, grain });
  const g = c.getContext('2d'); const r = L.rng(seed + 'fx');
  // foxing: a few soft rust-brown spots, mostly near the edges
  const n = Math.round(foxing * 60);
  for (let i = 0; i < n; i++) {
    const ang = r() * TAU, rad = size * (0.25 + 0.5 * Math.sqrt(r()));
    const x = size / 2 + Math.cos(ang) * rad, y = size / 2 + Math.sin(ang) * rad, rr = r.range(1.2, 6) * (r() < 0.12 ? 2.4 : 1);
    g.fillStyle = L.radial(g, x, y, 0, rr, [[0, L.rgba(tone, r.range(0.10, 0.28))], [1, L.rgba(tone, 0)]]);
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // long loose fibres
  g.lineCap = 'round';
  for (let i = 0; i < Math.round(fiber * 90); i++) {
    const x = r() * size, y = r() * size, len = r.range(14, 60), a = r() * TAU, bend = r.range(-0.6, 0.6);
    g.strokeStyle = L.rgba(r() < 0.5 ? '#ffffff' : tone, r.range(0.05, 0.14)); g.lineWidth = r.range(0.6, 1.3);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  if (edge > 0) {
    g.fillStyle = L.radial(g, size / 2, size / 2, size * 0.42, size * 0.8, [[0, L.rgba(tone, 0)], [1, L.rgba(tone, edge)]]);
    g.fillRect(0, 0, size, size);
  }
  return c;
}
/** squared paper (used by the title cards and available to plates). opts: base, line, step, seed, lineAlpha + paper opts */
export function gridPaper(o = {}) {
  const { line = '#b9b09a', step = 54, seed = 'grid', lineAlpha = 0.5, size = S } = o;   // offset: where the first line sits (default step / 2)
  const c = paper({ foxing: 0.1, edge: 0.12, ...o, seed, size }); const g = c.getContext('2d'); const r = L.rng(seed + 'g');
  const off = o.offset === undefined ? step * 0.5 : o.offset;
  for (let k = -1; k <= size / step + 1; k++) {
    for (const vertical of [false, true]) {
      const p = off + k * step + r.range(-0.4, 0.4);
      g.strokeStyle = L.rgba(line, lineAlpha * r.range(0.65, 1)); g.lineWidth = r.range(0.9, 1.5);
      g.beginPath();
      for (let t = 0; t <= size; t += 36) {
        const w = Math.sin(t * 0.011 + k) * 0.5 + r.range(-0.25, 0.25);
        if (vertical) (t ? g.lineTo(p + w, t) : g.moveTo(p + w, t)); else (t ? g.lineTo(t, p + w) : g.moveTo(t, p + w));
      }
      g.stroke();
    }
  }
  return c;
}

// ───────────────────────── sprites ─────────────────────────
/** a w × h canvas whose context is translated to its centre: draw(g, w, h) paints one object around (0, 0) */
export function sprite(w, h, draw) {
  const c = L.makeCanvas(w, h); const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  if (draw) draw(g, c.width, c.height);
  return c;
}
/** put a sprite on the page, centred at (x, y). opts: rot, scale, alpha, flip, shadow ({ dx, dy, blur, color } or false).
 *  The shadow is cast in page space (light from the top-left by default), whatever the sprite's rotation. */
export function stamp(ctx, spr, x, y, o = {}) {
  const { rot = 0, scale = 1, alpha = 1, flip = false } = o;
  const sh = o.shadow === false ? null : { dx: 4, dy: 7, blur: 9, color: 'rgba(45,28,12,0.36)', ...(o.shadow || {}) };
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (sh) { ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur; ctx.shadowOffsetX = sh.dx; ctx.shadowOffsetY = sh.dy; }
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(flip ? -scale : scale, scale);
  ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
  ctx.restore();
}
/** multiply a paper (or any texture) over what is already on a canvas, only where it has pixels — makes printed ink sit IN the paper */
export function soak(layer, tex, alpha = 0.6, blend = 'multiply') {
  const tmp = L.makeCanvas(layer.width, layer.height); const t = tmp.getContext('2d');
  t.drawImage(tex, 0, 0, layer.width, layer.height);
  t.globalCompositeOperation = 'destination-in'; t.drawImage(layer, 0, 0);
  const g = layer.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha; g.globalCompositeOperation = blend; g.drawImage(tmp, 0, 0); g.restore();
  return layer;
}
/** rub tiny holes into printed ink (worn litho / letterpress). amount 0..1 */
export function wear(layer, { seed = 'wear', amount = 0.3, size = 1.6 } = {}) {
  const g = layer.getContext('2d'); const r = L.rng(seed); const n = Math.round(layer.width * layer.height * 0.00035 * amount * 10);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    g.globalAlpha = r.range(0.15, 0.7);
    g.beginPath(); g.ellipse(r() * layer.width, r() * layer.height, r.range(0.4, size), r.range(0.4, size * 0.7), r() * 3, 0, TAU); g.fill();
  }
  g.restore(); return layer;
}

// ───────────────────────── camera ─────────────────────────
/** draw a pre-rendered layer (any size ≥ S; its centre is the pivot) with a slow move. o: z0, z1 (zoom), x0, y0, x1, y1 (px offset of the
 *  layer centre from the frame centre), r0, r1 (rad), ease. Keep zoom within 0.96–1.06 so the layer is shown at ≈1:1 and stays crisp. */
export function drift(ctx, layer, p, o = {}) {
  const { z0 = 1, z1 = 1.04, x0 = 0, y0 = 0, x1 = 0, y1 = 0, r0 = 0, r1 = 0, ease = null } = o;
  const t = ease ? ease(p) : p; const z = L.lerp(z0, z1, t);
  ctx.save();
  ctx.translate(S / 2 + L.lerp(x0, x1, t), S / 2 + L.lerp(y0, y1, t)); ctx.rotate(L.lerp(r0, r1, t)); ctx.scale(z, z);
  ctx.drawImage(layer, -layer.width / 2, -layer.height / 2);
  ctx.restore();
}
/** preview overlay: the glyph outline every glyph plate has to hit */
export function guide(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,0,255,0.9)'; ctx.lineWidth = 2.5; glyphPath(ctx, { corner: 0 }); ctx.stroke();
  ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(0,255,255,0.7)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(60, 60, S - 120, S - 120);
  ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  ctx.restore();
}
