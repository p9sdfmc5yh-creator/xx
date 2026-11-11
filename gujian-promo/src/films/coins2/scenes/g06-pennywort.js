// g06 — 铜钱草: round, shallowly crenate, peltate pennywort leaves (veins radiating from the petiole point), leaf by leaf
// spelling the CURRENT GLYPH. Botanical-plate manner on cream paper, but with real volume: every blade is a little parasol —
// domed, dimpled where the petiole joins, pleated between the veins, with a rolled margin — shaded per pixel at device
// resolution (L.pixelCanvas) from a height field, light from the upper left; fine pale veins, hatching and an ink outline
// are drawn over it with paths. K.pack strings the big blades along the centre line of each stroke and tucks small ones
// into what is left; a creeping stolon with thin petioles and hair roots shows in the notches between the blades.
// Nothing here knows which character it is spelling; every size follows K.glyphInfo().strokeWidth.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const GREENS = ['#5f8f3e', '#739d44', '#4c7a3a', '#86a64e', '#3f6a35', '#6a9648', '#557f33', '#95ad58', '#4a7440', '#7c9c3f'];

// light from the upper left, fairly high; HV is the half vector for a viewer straight above
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const LV = unit(-0.38, -0.47, 0.8), HV = unit(LV[0], LV[1], LV[2] + 1);

// two small tiling noise tables (fine tooth of the leaf skin, coarse watercolour mottling), sampled from LOGICAL coordinates
const NT = 256, NM = NT - 1;
let FINE = null, COARSE = null;
function noiseTable(seed, passes) {
  const r = L.rng(seed); let a = new Float32Array(NT * NT), b = new Float32Array(NT * NT);
  for (let i = 0; i < a.length; i++) a[i] = r() * 2 - 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) { const o = ((y + dy) & NM) * NT; s += a[o + ((x - 1) & NM)] + a[o + x] + a[o + ((x + 1) & NM)]; }
      b[y * NT + x] = s / 9;
    }
    const t = a; a = b; b = t;
  }
  let m = 0; for (let i = 0; i < a.length; i++) m += a[i] * a[i];
  m = 2.2 * Math.sqrt(m / a.length) || 1;
  for (let i = 0; i < a.length; i++) a[i] /= m;                                // ≈ ±1 at 2.2 σ
  return a;
}
function bil(t, x, y) {
  const xf = Math.floor(x), yf = Math.floor(y), a = x - xf, b = y - yf;
  const i0 = xf & NM, i1 = (xf + 1) & NM, j0 = (yf & NM) * NT, j1 = ((yf + 1) & NM) * NT;
  return (t[j0 + i0] * (1 - a) + t[j0 + i1] * a) * (1 - b) + (t[j1 + i0] * (1 - a) + t[j1 + i1] * a) * b;
}

/** one leaf blade, lit from the upper left. rad: outermost radius of the blade in logical px */
function leafSprite(rad, seed, base, gloss) {
  const r = L.rng(seed);
  const pad = 3, half = Math.ceil(rad + pad), sz = half * 2, inv = 1 / rad;
  const n = Math.round(L.clamp(7 + rad * 0.12, 7, 12)) + r.int(-1, 1), n2 = n / 2, ph = r() * TAU;
  const ox = r.range(-0.08, 0.08) * rad, oy = r.range(-0.08, 0.08) * rad;      // where the petiole joins (peltate: near the middle)
  const w0 = r() * TAU, w1 = r() * TAU, w2 = r() * TAU, w3 = r() * TAU;
  const domeA = r.range(0.08, 0.14), dimA = r.range(0.04, 0.06), plA = r.range(0.034, 0.054);
  const wa = r.range(0.015, 0.045), wb = r.range(0.01, 0.028), tx = r.range(-0.1, 0.1), ty = r.range(-0.1, 0.1);
  const wr = Math.max(1.3, rad * 0.075), T = Math.max(0.9, rad * 0.05);         // rolled margin: width and drop (the blade's thickness)
  const micro = L.clamp(rad / 30, 0.35, 1), offx = r.int(0, 255), offy = r.int(0, 255);
  const lw = L.clamp(rad / 36, 0.42, 1.1);                                     // pen width for this leaf
  const [br, bg, bb] = L.parseColor(base);
  // relative radius of the margin at angle t: shallow rounded scallops, one per main vein, on a slightly irregular round
  const eR = (t) => {
    const s = Math.sin(n2 * t + ph);
    return 0.992 - 0.05 * (1 - (Math.sqrt(s * s + 0.03) - 0.1732) / 0.8417) - 0.012 * (0.5 + 0.5 * Math.sin(2 * t + w0)) - 0.008 * (0.5 + 0.5 * Math.sin(5 * t + w1));
  };
  const lobeT = (j) => (((j + 0.5) * Math.PI - ph) * 2) / n;                   // the main veins run to the middle of each scallop

  // 1 — the blade itself: height field → normals → wash, shade, sheen (device pixels)
  const body = L.pixelCanvas(sz, sz, (d, pw, phh, q) => {
    const N = pw * phh, Hh = new Float32Array(N), D = new Float32Array(N);
    for (let j = 0, k = 0; j < phh; j++) {
      const y = (j + 0.5) / q - half;
      for (let i = 0; i < pw; i++, k++) {
        const x = (i + 0.5) / q - half;
        const rho = Math.sqrt(x * x + y * y) * inv, th = Math.atan2(y, x);
        const dd = (eR(th) - rho) * rad;                                       // px inside the margin
        D[k] = dd;
        if (dd < -2) continue;
        const kk = rho < 1 ? 1 - rho : 0, xv = x - ox * kk, yv = y - oy * kk;     // polar frame that slides from the petiole point to the centre
        const rv = Math.sqrt(xv * xv + yv * yv) * inv, cv = Math.cos(n2 * Math.atan2(yv, xv) + ph);
        const ed = dd < wr ? 1 - dd / wr : 0;
        Hh[k] = rad * (domeA * (1 - rho * rho * Math.sqrt(Math.sqrt(rho)))       // parasol dome
                     - dimA * Math.exp(-rv * rv * 34)                           // dimple at the petiole point
                     + plA * rv * Math.sqrt(Math.sqrt(rv)) * (1 - Math.sqrt(cv * cv + 0.02))   // parasol pleats: a rib along each vein, the blade sagging between
                     + rho * rho * (wa * Math.sin(2 * th + w2) + wb * Math.sin(3 * th + w3)))   // wavy brim
              + tx * x + ty * y                                                 // each blade tilts its own way on its petiole
              - T * ed * ed                                                     // rolled margin
              + micro * (0.13 * bil(FINE, x * 2 + offx, y * 2 + offy) + 0.06 * bil(COARSE, x * 2 + offy, y * 2 + offx) + 0.3 * bil(COARSE, x * 0.5 + offx, y * 0.5 + offy));
      }
    }
    for (let j = 1; j < phh - 1; j++) {
      const y = (j + 0.5) / q - half;
      for (let i = 1; i < pw - 1; i++) {
        const k = j * pw + i, a = D[k] * q + 0.5;
        if (a <= 0) continue;
        const x = (i + 0.5) / q - half;
        const hx = (Hh[k + 1] - Hh[k - 1]) * q * 0.5, hy = (Hh[k + pw] - Hh[k - pw]) * q * 0.5;
        const il = 1 / Math.sqrt(1 + hx * hx + hy * hy);
        const diff = (-hx * LV[0] - hy * LV[1] + LV[2]) * il, sh = (-hx * HV[0] - hy * HV[1] + HV[2]) * il;
        const rho = Math.sqrt(x * x + y * y) * inv, cx = (x - ox) * inv, cy = (y - oy) * inv;
        let lum = 1 + 1.7 * (diff - LV[2]); if (lum < 0.2) lum = 0.2;               // flat = 1; the modelling is pushed a little, as a plate painter would
        lum *= 1 - 0.2 * Math.exp(-(cx * cx + cy * cy) * 42);                   // the dimple sits in its own shade
        const m = 1 + 0.15 * bil(COARSE, x * 0.55 + offx, y * 0.55 + offy);     // watercolour mottling
        let R = br * m, G = bg * m, B = bb * m;
        if (rho > 0.7) { const t = (rho - 0.7) / 0.3, mg = 0.2 * t * t; R += (190 - R) * mg; G += (196 - G) * mg; B += (96 - B) * mg; }   // the margin a little yellower
        if (lum < 1) { R *= 0.15 + 0.85 * lum; G *= 0.25 + 0.75 * lum; B = B * (0.3 + 0.7 * lum) + 8 * (1 - lum); }
        else { const t = Math.min(1, (lum - 1) * 1.5); R += (226 - R) * t; G += (236 - G) * t; B += (150 - B) * t; }
        if (sh > 0) { const sp = gloss * (0.07 * Math.pow(sh, 16) + 0.27 * Math.pow(sh, 70) + 0.38 * Math.pow(sh, 320)); R += 255 * sp; G += 252 * sp; B += 226 * sp; }   // waxy sheen with a bright core
        const o = k * 4; d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = a >= 1 ? 255 : a * 255;
      }
    }
  });

  // 2 — pen work over the wash (paths: native device resolution)
  return K.sprite(sz, sz, (g) => {
    g.drawImage(body, -half, -half);
    const steps = Math.max(56, Math.round(rad * 5));
    const path = () => {
      g.beginPath();
      for (let k = 0; k < steps; k++) { const t = (k / steps) * TAU, rr = eR(t) * rad; const x = Math.cos(t) * rr, y = Math.sin(t) * rr; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath();
    };
    const dark = L.shade(base, -0.62), pale = L.mix(L.shade(base, 0.55), '#ece8b4', 0.5);
    g.save(); path(); g.clip();
    g.lineCap = 'round';
    if (rad > 13) {
      // engraver's hatching: short concentric strokes on the side turned from the light
      for (let k = 0, nk = Math.round(rad * 0.7); k < nk; k++) {
        const t = r.range(-0.3, 1.85), rr = r.range(0.36, 0.9) * rad, len = r.range(0.1, 0.22);
        g.strokeStyle = L.rgba(dark, r.range(0.12, 0.26)); g.lineWidth = r.range(0.55, 0.85) * lw;
        g.beginPath(); g.arc(ox * 0.5, oy * 0.5, rr, t, t + len); g.stroke();
      }
      // veinlets: a fine net between the main veins
      for (let j = 0; j < n; j++) {
        const t0 = lobeT(j), t1 = lobeT(j + 1);
        for (let k = 0; k < 4; k++) {
          const rr = rad * (0.3 + 0.16 * k + r.range(-0.04, 0.04)), b = r.range(0.1, 0.3) * (t1 - t0);
          g.strokeStyle = L.rgba(pale, r.range(0.2, 0.4)); g.lineWidth = 0.65 * lw;
          g.beginPath(); g.arc(ox * (1 - rr / rad), oy * (1 - rr / rad), rr, t0 + b, t1 - b * r.range(0.5, 1.2)); g.stroke();
        }
      }
    }
    // main veins: pale, tapering, forking toward the margin, each with a thin dark line on its shaded side
    for (let j = 0; j < n; j++) {
      const t = lobeT(j) + r.range(-0.03, 0.03), e = eR(t) * rad * 0.93;
      const ex = Math.cos(t) * e, ey = Math.sin(t) * e, f = r.range(0.5, 0.6), tb = t + r.range(-0.04, 0.04);
      const bx = ox * (1 - f) + Math.cos(tb) * e * f, by = oy * (1 - f) + Math.sin(tb) * e * f;
      g.strokeStyle = L.rgba(dark, 0.3); g.lineWidth = 1.9 * lw;
      g.beginPath(); g.moveTo(ox + 0.7 * lw, oy + 0.9 * lw); g.quadraticCurveTo(bx + 0.7 * lw, by + 0.9 * lw, ex + 0.4 * lw, ey + 0.6 * lw); g.stroke();
      g.strokeStyle = L.rgba(pale, 0.9); g.lineWidth = 1.5 * lw;
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(bx, by); g.stroke();
      g.lineWidth = 0.95 * lw; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
      if (rad > 9) for (const sgn of [-1, 1]) {
        const tf = t + sgn * (Math.PI / n) * r.range(0.5, 0.72), ef = eR(tf) * rad * 0.9;
        g.strokeStyle = L.rgba(pale, 0.68); g.lineWidth = 0.72 * lw;
        g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(Math.cos(t + sgn * 0.08) * e * 0.8, Math.sin(t + sgn * 0.08) * e * 0.8, Math.cos(tf) * ef, Math.sin(tf) * ef); g.stroke();
      }
    }
    g.restore();
    // petiole point: a pale boss sitting in the dimple
    g.fillStyle = L.rgba(dark, 0.6); g.beginPath(); g.arc(ox + 0.5 * lw, oy + 0.6 * lw, 3.1 * lw, 0, TAU); g.fill();
    g.fillStyle = L.rgba(pale, 0.96); g.beginPath(); g.arc(ox, oy, 2.1 * lw, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,240,0.85)'; g.beginPath(); g.arc(ox - 0.6 * lw, oy - 0.7 * lw, 0.75 * lw, 0, TAU); g.fill();
    // ink outline: light on the lit side so the bright rolled margin reads, heavier on the shadow side
    path(); g.lineJoin = 'round'; g.strokeStyle = L.rgba(L.shade(base, -0.7), 0.4); g.lineWidth = 0.85 * lw; g.stroke();
    g.save(); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, rad * 1.3, -0.3, 1.9); g.closePath(); g.clip();
    path(); g.strokeStyle = L.rgba(L.shade(base, -0.78), 0.55); g.lineWidth = 1.7 * lw; g.stroke(); g.restore();
  });
}

/** a stem through pts: dark edge, pale green body, a hairline of light on its upper-left flank */
function stemLine(q, pts, w, body) {
  const draw = () => {
    q.beginPath(); q.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; q.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
    const e = pts[pts.length - 1]; q.lineTo(e[0], e[1]);
  };
  q.lineCap = 'round'; q.lineJoin = 'round';
  q.strokeStyle = 'rgba(58,70,28,0.85)'; q.lineWidth = w + Math.max(0.7, w * 0.55); draw(); q.stroke();
  q.strokeStyle = body; q.lineWidth = w; draw(); q.stroke();
  q.save(); q.translate(-w * 0.22, -w * 0.26); q.strokeStyle = 'rgba(240,242,196,0.7)'; q.lineWidth = Math.max(0.5, w * 0.3); draw(); q.stroke(); q.restore();
}

/** points every `step` px along a closed polyline */
function resample(loop, step) {
  const out = []; let need = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = need;
    while (t <= l) { const f = l ? t / l : 0; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); t += step; }
    need = t - l;
  }
  return out;
}

/** K.pack sizes a disc by its distance to the OUTLINE only, so where strokes cross it leaves holes between the big discs:
 *  put the largest disc that still fits into every such hole (same overlap rule as the pack) */
function fillHoles(discs, { rmin, rmax, gap, margin }) {
  const b = K.glyphInfo().bbox, pitch = Math.max(2, rmin * 0.5), cand = [], out = [];
  const free = (x, y, list, f) => { for (const d of list) { const v = Math.hypot(d.x - x, d.y - y) / gap - d.r; if (v < f) { f = v; if (f < rmin) break; } } return f; };
  for (let y = b.y0; y <= b.y1; y += pitch) for (let x = b.x0; x <= b.x1; x += pitch) {
    let f = Math.min(rmax, -K.sdGlyph(x, y) - margin);
    if (f < rmin) continue;
    f = free(x, y, discs, f);
    if (f >= rmin) cand.push({ x, y, r: f });
  }
  cand.sort((p, q) => q.r - p.r);
  for (const p of cand) { const f = free(p.x, p.y, out, p.r); if (f >= rmin) out.push({ x: p.x, y: p.y, r: f, i: discs.length + out.length }); }
  return out;
}

/** how much open paper lies beyond a blade on its shadow side before the next stroke begins (px; Infinity if none) */
const SHADE_DIRS = [[0.53, 0.85, 1], [1, 0, 1.2], [0, 1, 1.1]];
function room(lf, sw) {
  let best = Infinity;
  for (const [dx, dy, wgt] of SHADE_DIRS) {
    let out = -1;
    for (let t = 0; t <= sw * 0.6; t += 1.5) {
      const s = K.sdGlyph(lf.x + dx * (lf.rad + t), lf.y + dy * (lf.rad + t));
      if (out < 0) { if (s > 0.5) out = t; } else if (s < 0) { best = Math.min(best, (t - out) * wgt); break; }
    }
  }
  return best;
}

function build() {
  FINE = FINE || noiseTable('g06fine', 2); COARSE = COARSE || noiseTable('g06coarse', 12);
  const info = K.glyphInfo(), sw = info.strokeWidth, R1 = sw * 0.5, u = L.clamp(sw / 75, 0.3, 1.5), SSq = L.SS;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const paper = K.paper({ base: '#f2ebd9', tone: '#8a6a3a', seed: 'g06paper', fiber: 0.55, stain: 0.3, foxing: 0.22, edge: 0.2 });
  g.drawImage(paper, 0, 0);
  // plate mark: the faint bevel an intaglio plate leaves in the sheet
  g.strokeStyle = 'rgba(110,84,48,0.20)'; g.lineWidth = 1.4; g.strokeRect(46.5, 46.5, S - 93, S - 93);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.strokeRect(48.5, 48.5, S - 93, S - 93);
  // the soft pool of shade the whole plant throws on the sheet, toward the lower right
  { const sh = L.makeCanvas(S, S); K.fillGlyph(sh.getContext('2d'), '#2c3418', { grow: -sw * 0.1 });
    g.save(); g.globalAlpha = 0.1; g.drawImage(L.blurred(sh, 6 * u), 3 * u, 4.6 * u); g.restore(); }

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  const r = L.rng('g06-pennywort' + info.key);
  // big blades strung along the centre line of every stroke, small ones tucked into what is left
  const PK = { rmax: R1, rmin: Math.max(4.2, R1 * 0.19), gap: 0.94, margin: Math.max(0.8, sw * 0.03) };   // blades stay just inside the outline: the gaps between strokes stay open
  const discs = K.pack({ seed: 'g06leaf', ...PK });
  const leaves = discs.concat(fillHoles(discs, PK)).map((d) => {
    const h = Math.max(1.5, d.r * 0.6);                                        // on the centre line the distance field has no slope
    const slope = Math.hypot(K.sdGlyph(d.x + h, d.y) - K.sdGlyph(d.x - h, d.y), K.sdGlyph(d.x, d.y + h) - K.sdGlyph(d.x, d.y - h)) / (2 * h);
    const top = d.r >= R1 * 0.8 || slope < 0.5;
    let base = GREENS[r.int(0, GREENS.length - 1)];
    base = L.mix(base, r.chance(0.5) ? '#2f5a3a' : '#a8b850', r.range(0, 0.24));
    if (!top) base = L.mix(base, '#2c5030', r.range(0.25, 0.45));               // the low ones sit in the shade of the canopy
    return { x: Math.round(d.x * SSq) / SSq, y: Math.round(d.y * SSq) / SSq, rad: d.r * r.range(1.0, 1.045), top, z: d.r + r() * R1 * 0.14, base, gloss: r.range(0.7, 1.1), i: d.i };
  });
  const put = (lf) => {
    const spr = leafSprite(lf.rad, 'g06leaf' + info.key + lf.i, lf.base, lf.gloss);
    let k = lf.top ? L.clamp(lf.rad / R1, 0.55, 1.1) : 0.4;                     // how high the blade stands on its petiole
    k = Math.max(0.28, k * L.clamp(room(lf, sw) / (0.4 * sw), 0.3, 1));         // … kept short where the next stroke is close, so the gap stays light
    K.stamp(q, spr, lf.x, lf.y, { shadow: { dx: 3.4 * u * k, dy: 5.4 * u * k, blur: 7.5 * u * k, color: 'rgba(26,34,12,0.40)' } });   // cast shadow
    K.stamp(q, spr, lf.x, lf.y, { shadow: { dx: 0.7 * u, dy: 1.2 * u, blur: 1.8 * u, color: 'rgba(14,22,8,0.50)' } });               // contact shadow
  };
  const low = leaves.filter((l) => !l.top).sort((a, b) => a.z - b.z), high = leaves.filter((l) => l.top).sort((a, b) => a.z - b.z);
  low.forEach(put);

  // the creeping stolon: runs just inside the outline, over the low leaves and under the canopy, so it shows in the notches
  const stems = L.makeCanvas(S, S), sq = stems.getContext('2d');
  for (const loop of K.glyphLoops({ grow: -sw * 0.14 })) {
    const pts = resample(loop, sw * 0.2);
    if (pts.length < 6) continue;
    const phw = r() * TAU;
    let k = r.int(0, 3);
    while (k < pts.length) {
      const len = Math.min(r.int(5, 15), pts.length - k), seg = [];
      for (let m = 0; m < len; m++) {
        const p = pts[k + m], nn = K.glyphNormal(p[0], p[1]), w = sw * (0.035 * Math.sin((k + m) * 1.3 + phw) + r.range(-0.015, 0.015));
        seg.push([p[0] + nn.x * w, p[1] + nn.y * w]);
      }
      if (seg.length >= 3) {
        const body = r.chance(0.5) ? '#aab66c' : '#9cab5e', wS = Math.max(0.9, r.range(1.6, 2.1) * u);
        for (let m = 1; m < seg.length - 1; m += r.int(2, 4)) {                  // nodes: a petiole dives under the nearest big blade, hair roots trail
          const [bx, by] = seg[m];
          let best = null, bd = 1e9;
          for (const lf of high) { const dd = Math.hypot(lf.x - bx, lf.y - by) - lf.rad; if (dd < bd) { bd = dd; best = lf; } }
          const mx = best ? (bx + best.x) / 2 + r.range(-0.1, 0.1) * sw : 0, my = best ? (by + best.y) / 2 + r.range(-0.1, 0.1) * sw : 0;
          if (best && bd < R1 * 0.9 && K.inGlyph(mx, my, 1.5) && K.inGlyph((bx + mx) / 2, (by + my) / 2, 1.5) && K.inGlyph((best.x + mx) / 2, (best.y + my) / 2, 1.5)) {   // never across a gap
            stemLine(sq, [[bx, by], [mx, my], [best.x, best.y]], Math.max(0.75, r.range(1.15, 1.5) * u), '#a3b062');
          }
          for (let h = 0, nh = r.int(2, 3); h < nh; h++) {
            const a = r() * TAU, hl = r.range(0.05, 0.1) * sw;
            if (!K.inGlyph(bx + Math.cos(a) * hl, by + Math.sin(a) * hl, 1)) continue;
            sq.strokeStyle = 'rgba(122,98,58,0.75)'; sq.lineWidth = Math.max(0.5, 0.75 * u); sq.lineCap = 'round';
            sq.beginPath(); sq.moveTo(bx, by); sq.quadraticCurveTo(bx + Math.cos(a) * hl * 0.5 + r.range(-0.03, 0.03) * sw, by + Math.sin(a) * hl * 0.5 + r.range(-0.03, 0.03) * sw, bx + Math.cos(a) * hl, by + Math.sin(a) * hl); sq.stroke();
          }
        }
        stemLine(sq, seg, wS, body);
        for (let m = 1; m < seg.length - 1; m += 3) {                            // the nodes themselves: small swollen joints
          sq.fillStyle = 'rgba(70,78,34,0.85)'; sq.beginPath(); sq.arc(seg[m][0] + 0.3 * u, seg[m][1] + 0.4 * u, wS * 0.95, 0, TAU); sq.fill();
          sq.fillStyle = '#8a9650'; sq.beginPath(); sq.arc(seg[m][0], seg[m][1], wS * 0.72, 0, TAU); sq.fill();
          sq.fillStyle = 'rgba(236,240,190,0.75)'; sq.beginPath(); sq.arc(seg[m][0] - wS * 0.22, seg[m][1] - wS * 0.26, wS * 0.26, 0, TAU); sq.fill();
        }
      }
      k += len + r.int(2, 5);
    }
  }
  q.save(); q.shadowColor = 'rgba(24,30,10,0.5)'; q.shadowBlur = 2.6 * u; q.shadowOffsetX = 1.3 * u; q.shadowOffsetY = 2.1 * u;
  q.drawImage(stems, 0, 0); q.restore();

  high.forEach(put);

  K.soak(ink, paper, 0.4);                                              // paper tooth shows through the washes
  g.drawImage(ink, 0, 0);
  return c;
}

export default {
  name: '铜钱草',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
