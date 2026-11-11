// g31 — 金相: a photomicrograph of etched bronze, cut to the CURRENT GLYPH (whichever character the cut list asks for).
// Pale lilac-white, out-of-focus field of view; the glyph is a polished-and-etched section lying on it: a slab with a dark
// side wall, a bevelled rim that catches the light on its top-left edges, a contact shadow and a soft cast shadow.
// Inside the glyph the metal, computed per DEVICE pixel (L.pixelCanvas): blue-green polygonal grains (a Voronoi field,
// two or three grains across one stroke), each grain etched to its own height and lit from the top-left, dark grain
// boundaries with a bright shoulder, annealing twins and slip lines, a few fern-like dendrites lying along the strokes in
// darker emerald pockets, a sparse scatter of lead beads, faint polishing scratches, a blue-black corrosion crust along
// the outline. Every size follows K.glyphInfo().strokeWidth. No magnification, figures or letters anywhere.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
let layer = null;

const ss = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** a rounded finger from (x, y) along ang */
function lobe(q, x, y, ang, len, w) {
  const cx = Math.cos(ang), cy = Math.sin(ang), px = -cy, py = cx, h = w / 2;
  q.moveTo(x - px * h, y - py * h);
  q.bezierCurveTo(x - px * h * 1.25 + cx * len * 0.45, y - py * h * 1.25 + cy * len * 0.45, x - px * h * 0.7 + cx * len, y - py * h * 0.7 + cy * len, x + cx * len, y + cy * len);
  q.bezierCurveTo(x + px * h * 0.7 + cx * len, y + py * h * 0.7 + cy * len, x + px * h * 1.25 + cx * len * 0.45, y + py * h * 1.25 + cy * len * 0.45, x + px * h, y + py * h);
  q.closePath();
}

/** points inside the strokes, at least `margin` from the outline and `minDist` from each other (dart throwing) */
function sprinkle(seed, { minDist, margin, max }) {
  const info = K.glyphInfo(), r = L.rng(seed + info.key), b = info.bbox, out = [];
  for (let k = 0; k < 9000 && out.length < max; k++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1);
    if (!K.inGlyph(x, y, margin)) continue;
    let ok = true;
    for (const p of out) if (Math.hypot(p.x - x, p.y - y) < minDist) { ok = false; break; }
    if (ok) out.push({ x, y });
  }
  return out;
}

/** the part of a silhouette that its own copy shifted by (dx, dy) does not cover — a band along the edges facing (-dx, -dy) */
function edgeBand(sil, dx, dy, color, blur) {
  const c = L.makeCanvas(S, S), q = c.getContext('2d');
  q.drawImage(sil, 0, 0);
  q.globalCompositeOperation = 'destination-out'; q.drawImage(sil, dx, dy);
  q.globalCompositeOperation = 'source-in'; q.fillStyle = color; q.fillRect(0, 0, S, S);
  return blur ? L.blurred(c, blur) : c;
}

function background() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d'), r = L.rng('g31bg');
  g.fillStyle = '#e9e2f0'; g.fillRect(0, 0, S, S);
  const cols = ['#f8f4fb', '#d6cae8', '#f4e4ef', '#cdc4e6', '#fdfbfd', '#e2d3ea', '#dfe0f2'];
  for (let i = 0; i < 34; i++) {
    const x = r.range(-80, S + 80), y = r.range(-80, S + 80), rad = r.range(120, 380), col = r.pick(cols);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, r.range(0.3, 0.6))], [0.6, L.rgba(col, 0.16)], [1, L.rgba(col, 0)]]);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // light falls off toward the lower right of the field
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,255,255,0.22)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(120,96,160,0.16)']]);
  g.fillRect(0, 0, S, S);
  const b = L.blurred(c, 22), q = b.getContext('2d');
  // out-of-focus dust: soft discs with a slightly darker rim
  const dust = L.makeCanvas(S, S), d = dust.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = r.range(20, S - 20), y = r.range(20, S - 20), rad = r.range(16, 54);
    d.fillStyle = L.rgba('#ffffff', r.range(0.07, 0.16)); d.beginPath(); d.arc(x, y, rad, 0, L.TAU); d.fill();
    d.strokeStyle = L.rgba('#8f7fba', r.range(0.07, 0.15)); d.lineWidth = r.range(2.5, 5); d.beginPath(); d.arc(x, y, rad, 0, L.TAU); d.stroke();
  }
  q.drawImage(L.blurred(dust, 5), 0, 0);
  // the edge of the microscope's field: the corners fall off a little
  q.fillStyle = L.radial(q, S / 2, S / 2, S * 0.5, S * 0.8, [[0, 'rgba(104,84,150,0)'], [1, 'rgba(104,84,150,0.13)']]);
  q.fillRect(0, 0, S, S);
  return b;
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, bb = info.bbox;
  const CELL = Math.max(8, sw / 2.5);                       // two or three grains across one stroke
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(background(), 0, 0);

  // ── dendrites: they lie along the fat strokes (K.pack puts beads on the centre lines; .ang is the stroke's direction) ──
  const rd = L.rng('g31den' + info.key);
  const beads = K.pack({ seed: 'g31site', rmax: sw * 0.5, rmin: sw * 0.3, gap: 1 })
    .map((b) => ({ b, k: rd() })).sort((p, q) => p.k - q.k).map((o) => o.b);
  const maxDen = Math.min(10, 4 + 3 * info.chars.length), dens = [];
  for (const b of beads) {
    if (dens.length >= maxDen) break;
    if (dens.some((d) => Math.hypot(d.x - b.x, d.y - b.y) < sw * 2.9)) continue;
    const a0 = b.ang + (rd() < 0.5 ? Math.PI : 0) + rd.range(-0.08, 0.08), ca = Math.cos(a0), sa = Math.sin(a0);
    let T = sw * rd.range(1.6, 2.2);
    const fits = (t) => { for (const f of [-0.5, -0.28, 0.28, 0.5]) if (!K.inGlyph(b.x + ca * t * f, b.y + sa * t * f, sw * 0.14)) return false; return true; };
    while (T > sw * 1.0 && !fits(T)) T *= 0.9;
    if (!fits(T)) continue;
    const reach = b.r * 0.86, lobes = [];                   // the side arms stay inside the stroke
    const bx = b.x - ca * T * 0.5, by = b.y - sa * T * 0.5;
    lobes.push({ x: bx, y: by, ang: a0, len: T, w: sw * 0.15 });
    const slant = rd.range(0.92, 1.12), sl = Math.sin(slant);            // arms sweep forward, like the pinnae of a fern frond
    let side = rd() < 0.5 ? 1 : -1;
    for (let d = sw * 0.13; d < T - sw * 0.3; d += sw * rd.range(0.085, 0.115)) {     // … and alternate left / right
      side = -side;
      const u = d / T, env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.75) * (1 - 0.4 * u);
      const ang = a0 + side * slant + rd.range(-0.06, 0.06), x = bx + ca * d, y = by + sa * d;
      let len = (reach * env / sl) * rd.range(0.8, 1.08) + sw * 0.05;
      while (len > sw * 0.1 && !K.inGlyph(x + Math.cos(ang) * len, y + Math.sin(ang) * len, sw * 0.07)) len *= 0.86;
      if (len <= sw * 0.1) continue;
      lobes.push({ x, y, ang, len, w: sw * rd.range(0.095, 0.12) });
      if (len > sw * 0.32) for (const f of [0.4, 0.68]) for (const s2 of [-1, 1]) {
        if (rd() < 0.25) continue;
        lobes.push({ x: x + Math.cos(ang) * len * f, y: y + Math.sin(ang) * len * f, ang: ang + s2 * 1.1, len: sw * rd.range(0.07, 0.11) * (1.15 - f * 0.5), w: sw * 0.07 });
      }
    }
    dens.push({ x: b.x, y: b.y, a0, T, reach, lobes });
  }

  // ── grain seeds on a jittered grid over the glyph's bounding box ──
  const B0x = Math.max(0, Math.floor(bb.x0) - 6), B0y = Math.max(0, Math.floor(bb.y0) - 6);
  const BW = Math.min(S, Math.ceil(bb.x1) + 6) - B0x, BH = Math.min(S, Math.ceil(bb.y1) + 6) - B0y;
  const gx0 = B0x - 2 * CELL, gy0 = B0y - 2 * CELL, gw = Math.ceil(BW / CELL) + 5, gh = Math.ceil(BH / CELL) + 5, NS = gw * gh;
  const sx = new Float32Array(NS), sy = new Float32Array(NS), alive = new Uint8Array(NS);
  const cr = new Float32Array(NS), cg = new Float32Array(NS), cb = new Float32Array(NS);
  const tca = new Float32Array(NS), tsa = new Float32Array(NS), tper = new Float32Array(NS), tdut = new Float32Array(NS), tamt = new Float32Array(NS), toff = new Float32Array(NS);
  const hamt = new Float32Array(NS), hper = new Float32Array(NS), dome = new Float32Array(NS), hgt = new Float32Array(NS);
  const rs = L.rng('g31seed' + info.key);
  const ramp = L.makeRamp([[0, '#0d4a5a'], [0.22, '#167a7c'], [0.45, '#2fa692'], [0.68, '#6fcdae'], [0.86, '#a9e3c4'], [1, '#dcf3da']]);
  const blue = L.parseColor('#3a8fc0'), yel = L.parseColor('#c4dc8c');
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    sx[k] = gx0 + (i + rs.range(0.08, 0.92)) * CELL; sy[k] = gy0 + (j + rs.range(0.08, 0.92)) * CELL;
    alive[k] = rs() < 0.84 ? 1 : 0;
    let dk = 0;
    for (const d of dens) {
      const ux = (sx[k] - d.x) * Math.cos(d.a0) + (sy[k] - d.y) * Math.sin(d.a0), uy = -(sx[k] - d.x) * Math.sin(d.a0) + (sy[k] - d.y) * Math.cos(d.a0);
      dk = Math.max(dk, 1 - ss(0.72, 1.3, Math.hypot(ux / (d.T * 0.5), uy / (d.reach + sw * 0.16))));
    }
    let t = L.clamp(0.5 + 0.27 * rs.gauss());
    t = t * (1 - 0.8 * dk) + 0.02;
    const col = ramp(t); let r0 = col[0], g0 = col[1], b0 = col[2];
    const tint = rs();
    if (tint < 0.3) { const m = rs.range(0.1, 0.34); r0 += (blue[0] - r0) * m; g0 += (blue[1] - g0) * m; b0 += (blue[2] - b0) * m; }
    else if (tint > 0.8) { const m = rs.range(0.1, 0.3) * (1 - dk); r0 += (yel[0] - r0) * m; g0 += (yel[1] - g0) * m; b0 += (yel[2] - b0) * m; }
    cr[k] = r0; cg[k] = g0; cb[k] = b0;
    const ta = rs.range(0, Math.PI); tca[k] = Math.cos(ta); tsa[k] = Math.sin(ta);
    const hasTw = rs() < 0.58;
    tper[k] = CELL * rs.range(0.95, 1.7); tdut[k] = rs.range(0.13, 0.32); toff[k] = rs.range(0, CELL * 1.7);
    tamt[k] = hasTw ? (rs() < 0.5 ? rs.range(-0.3, -0.15) : rs.range(0.14, 0.3)) : 0;
    hamt[k] = rs() < 0.36 ? rs.range(0.08, 0.17) : 0; hper[k] = Math.max(2.4, CELL * rs.range(0.1, 0.15));
    dome[k] = rs.range(0.1, 0.2); hgt[k] = rs();
  }

  // ── the metal, per DEVICE pixel ──
  const nA = L.makeNoise('g31a'), nB = L.makeNoise('g31b');
  const bk = L.clamp(CELL / 40, 0.6, 1.1);                  // grain-boundary width follows the grain size
  const bevW = L.clamp(sw * 0.036, 1.1, 3);               // the bevelled rim of the section
  const shW = CELL * 0.22, rimW = Math.max(0.7, CELL * 0.04);
  const metal = L.pixelCanvas(BW, BH, (px, pw, ph, q) => {
    const aa = 0.85 / q;                                    // half-width of an anti-aliasing ramp: under one device pixel
    for (let j = 0; j < ph; j++) {
      const y = B0y + (j + 0.5) / q, gj = Math.floor((y - gy0) / CELL);
      for (let i = 0; i < pw; i++) {
        const x = B0x + (i + 0.5) / q;
        const sd = K.sdGlyph(x, y);
        if (sd > 1.5) continue;
        const gi = Math.floor((x - gx0) / CELL);
        let d1 = 1e9, d2 = 1e9, i1 = -1, i2 = -1;
        for (let oj = -2; oj <= 2; oj++) {
          const jj = gj + oj; if (jj < 0 || jj >= gh) continue;
          for (let oi = -2; oi <= 2; oi++) {
            const ii = gi + oi; if (ii < 0 || ii >= gw) continue;
            const k = jj * gw + ii; if (!alive[k]) continue;
            const dx = sx[k] - x, dy = sy[k] - y, d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = k; } else if (d < d2) { d2 = d; i2 = k; }
          }
        }
        if (i1 < 0 || i2 < 0) continue;
        const ex = sx[i2] - sx[i1], ey = sy[i2] - sy[i1], el = Math.sqrt(ex * ex + ey * ey) || 1;
        const e = (d2 - d1) / (2 * el);                                  // px to the grain boundary
        let r = cr[i1], gg = cg[i1], b = cb[i1];
        const rx = x - sx[i1], ry = y - sy[i1];
        // annealing twins: straight parallel bands of a different tone, stopping at the grain's edge
        if (tamt[i1] !== 0) {
          const u = (rx * tca[i1] + ry * tsa[i1] + toff[i1]) / tper[i1], f = u - Math.floor(u), at = 1.4 * aa / tper[i1];
          let f2 = f + 0.46; f2 -= Math.floor(f2);
          const band = ss(0, at, f) - ss(tdut[i1], tdut[i1] + at, f) + 0.7 * (ss(0, at, f2) - ss(tdut[i1] * 0.38, tdut[i1] * 0.38 + at, f2));
          const m = 1 + tamt[i1] * band * ss(bk * 1.2, bk * 3.2, e);
          r *= m; gg *= m; b *= m;
        }
        // slip lines: fine parallel traces across some grains
        if (hamt[i1] !== 0) {
          const v = 0.5 + 0.5 * Math.cos((rx * tsa[i1] - ry * tca[i1]) * (L.TAU / hper[i1]));
          const m = 1 - hamt[i1] * v * v * v * ss(bk * 1.6, bk * 5.5, e);
          r *= m; gg *= m; b *= m;
        }
        // etch mottling + tooth down to the device pixel
        const mot = 1 + 0.07 * (rx * tsa[i1] + ry * tca[i1]) / CELL + 0.085 * nA.fbm(x / (CELL * 0.7), y / (CELL * 0.7), 3) + 0.024 * nB.n2(x / 2.6, y / 2.6) + 0.02 * nB.n2(x / 0.9 + 40, y / 0.9);
        // relief: every grain is etched to its own height and slightly domed. Its top-left shoulder catches the light,
        // the lower-right one falls into shade; a grain lying lower than its top-left neighbour sits in that neighbour's shadow.
        const lit = -(ex + ey) / el * 0.7071, step = hgt[i1] - hgt[i2], sh = 1 - ss(bk * 1.0, shW, e);
        const relief = (dome[i1] + 0.36 * step) * lit * sh;
        const m2 = mot * (1 + relief) * (1.07 - 0.14 * ((x - 180) + (y - 180)) / 1440);
        r *= m2; gg *= m2; b *= m2;
        // etched boundary, and the bright core of the lit shoulder right beside it
        const lo = i1 < i2 ? i1 : i2, hi = i1 < i2 ? i2 : i1;            // every boundary etches a little differently
        const bs = ((Math.imul((lo * 73856093) ^ (hi * 19349663), 668265263) >>> 9) & 1023) / 1023;
        const bw = (1.25 + 0.55 * nA.n2(x / 70, y / 70 + 31)) * bk * (0.78 + 0.4 * bs);
        const rim = (ss(bw, bw + 2 * aa, e) - ss(bw + rimW, bw + rimW * 2.4, e)) * Math.max(0, lit) * Math.max(0, 0.55 + step) * 0.5;
        r += (236 - r) * rim; gg += (252 - gg) * rim; b += (240 - b) * rim;
        const ba = (1 - ss(bw - aa, bw + aa, e)) * (0.5 + 0.44 * bs);
        r += (10 - r) * ba; gg += (46 - gg) * ba; b += (62 - b) * ba;
        // corrosion crust along every edge of the section, emerald just inside it
        const dep = -sd, T = sw * (0.05 + 0.034 * nA.n2(x / (sw * 0.6) + 9, y / (sw * 0.6)) + 0.014 * nB.n2(x / (sw * 0.17), y / (sw * 0.17)));
        const em = 0.5 * (1 - ss(T, T + sw * 0.15, dep));
        r += (14 - r) * em; gg += (104 - gg) * em; b += (98 - b) * em;
        const ca = (1 - ss(T - sw * 0.02 - aa, T + sw * 0.026 + aa, dep)) * 0.95;
        r += (24 - r) * ca; gg += (30 - gg) * ca; b += (70 - b) * ca;
        // the bevelled rim: bright where it faces the light (top-left), dark where it turns away
        // (a soft ramp only: the crisp bright core of the lit rim is cut from the outline's own path further down)
        if (dep < bevW * 1.3) {
          const h = 2.5, nx = K.sdGlyph(x + h, y) - K.sdGlyph(x - h, y), ny = K.sdGlyph(x, y + h) - K.sdGlyph(x, y - h), nl = Math.hypot(nx, ny) || 1;
          const ld = -(nx + ny) / nl * 0.7071, w = 1 - ss(0, bevW * 1.3, dep);
          if (ld > 0) { const a = Math.min(1, ld * 1.3) * w * 0.6; r += (232 - r) * a; gg += (248 - gg) * a; b += (255 - b) * a; }
          else { const a = 1 + ld * w * 0.75; r *= a; gg *= a; b *= a; }
        }
        const o = (j * pw + i) * 4;
        px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
      }
    }
  });

  // ── the section's shadows on the blurred field: a soft cast shadow, then a tight contact shadow ──
  const th = L.clamp(sw * 0.055, 1.5, 4.5);                 // thickness of the slab
  g.save();
  g.shadowColor = 'rgba(70,46,120,0.32)'; g.shadowBlur = sw * 0.3; g.shadowOffsetX = sw * 0.13; g.shadowOffsetY = sw * 0.18;
  K.fillGlyph(g, '#182446');
  g.shadowColor = 'rgba(40,24,84,0.55)'; g.shadowBlur = sw * 0.06; g.shadowOffsetX = th * 0.62 + sw * 0.02; g.shadowOffsetY = th * 0.78 + sw * 0.03;
  K.fillGlyph(g, '#182446');
  g.restore();
  // ── its side wall, seen on the lower-right ──
  for (let k = Math.ceil(th / 0.5); k >= 1; k--) {
    const d = k * 0.5, f = d / th;
    g.save(); g.translate(d * 0.62, d * 0.78);
    K.fillGlyph(g, `rgb(${Math.round(12 + 26 * f)},${Math.round(18 + 22 * f)},${Math.round(48 + 44 * f)})`);
    g.restore();
  }

  g.save();
  K.clipGlyph(g);
  g.drawImage(metal, B0x, B0y);
  // the bright core of the lit rim: the part of the (slightly inset) glyph that its copy shifted to the lower right leaves bare
  const rimSil = L.makeCanvas(S, S);
  K.fillGlyph(rimSil.getContext('2d'), '#ffffff', { grow: -bevW * 0.3 });
  g.drawImage(edgeBand(rimSil, bevW * 0.42, bevW * 0.42, 'rgba(244,252,255,0.8)', 0.35), 0, 0);

  // dendrites: a dark moat, then the pale raised arms with a cored centre line
  const moat = L.makeCanvas(S, S), mq = moat.getContext('2d');
  mq.fillStyle = '#08304a';
  for (const d of dens) { mq.beginPath(); for (const l of d.lobes) lobe(mq, l.x, l.y, l.ang, l.len * 1.04, l.w + sw * 0.07); mq.fill(); }
  g.globalAlpha = 0.8; g.drawImage(L.blurred(moat, Math.max(1.5, sw * 0.065)), 0, 0); g.globalAlpha = 1;
  const sil = L.makeCanvas(S, S), sq = sil.getContext('2d');           // the arms' silhouette
  sq.fillStyle = '#cdeed8'; sq.beginPath();
  for (const d of dens) for (const l of d.lobes) lobe(sq, l.x, l.y, l.ang, l.len, l.w);
  sq.fill();
  const arms = L.makeCanvas(S, S), aq = arms.getContext('2d');
  aq.drawImage(sil, 0, 0);
  aq.globalCompositeOperation = 'source-in'; aq.fillStyle = '#4fa890'; aq.fillRect(0, 0, S, S);     // the greener rim of a cored arm …
  aq.globalCompositeOperation = 'source-atop';
  aq.drawImage(L.blurred(sil, Math.max(1, sw * 0.036)), 0, 0);                                        // … paler toward its core
  for (const d of dens) {       // lit toward the top-left, greener toward the lower right
    const R = d.T * 0.62;
    aq.fillStyle = L.linear(aq, d.x - R, d.y - R, d.x + R, d.y + R, [[0, 'rgba(250,255,248,0.5)'], [0.5, 'rgba(206,238,216,0)'], [1, 'rgba(60,160,140,0.5)']]);
    aq.fillRect(d.x - R * 1.7, d.y - R * 1.7, R * 3.4, R * 3.4);
  }
  aq.lineCap = 'round';
  for (const d of dens) for (const l of d.lobes) {                      // the cored centre: a shallow groove
    if (l.len < sw * 0.2) continue;
    aq.strokeStyle = 'rgba(58,150,136,0.3)'; aq.lineWidth = Math.max(0.8, l.w * 0.14);
    aq.beginPath(); aq.moveTo(l.x + Math.cos(l.ang) * l.len * 0.12, l.y + Math.sin(l.ang) * l.len * 0.12);
    aq.lineTo(l.x + Math.cos(l.ang) * l.len * 0.7, l.y + Math.sin(l.ang) * l.len * 0.7); aq.stroke();
  }
  const eb = Math.max(0.7, sw * 0.018);                                 // rounded shoulders: lit on the top-left, shaded on the lower right
  aq.drawImage(edgeBand(sil, -eb * 1.6, -eb * 1.6, 'rgba(10,92,96,0.62)', eb * 0.5), 0, 0);
  aq.drawImage(edgeBand(sil, eb, eb, 'rgba(255,255,250,0.8)', eb * 0.3), 0, 0);
  g.save();                     // the arms stand a little proud of the matrix: they throw a small shadow to the lower right
  g.shadowColor = 'rgba(2,26,40,0.6)'; g.shadowBlur = Math.max(1, sw * 0.045); g.shadowOffsetX = sw * 0.022; g.shadowOffsetY = sw * 0.03;
  g.drawImage(arms, 0, 0);
  g.restore();

  // polishing scratches (a few survive the etch)
  const rq = L.rng('g31scr' + info.key);
  for (let i = 0; i < 14; i++) {
    const a = 0.42 + rq.range(-0.12, 0.12), x = rq.range(bb.x0, bb.x1), y = rq.range(bb.y0, bb.y1), len = rq.range(160, 520);
    g.strokeStyle = i % 3 ? L.rgba('#eafaf2', rq.range(0.08, 0.15)) : L.rgba('#06303c', rq.range(0.09, 0.16)); g.lineWidth = rq.range(0.5, 1.0);
    g.beginPath(); g.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2); g.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2); g.stroke();
  }
  // lead: a sparse scatter of slate-blue beads standing proud of the surface — a lit dome, a bright core, a shadow to the lower right
  const leads = sprinkle('g31lead', { minDist: sw * 1.3, margin: sw * 0.17, max: 12 + 8 * info.chars.length });
  for (const p of leads) {
    let near = false;
    for (const d of dens) {
      const ux = (p.x - d.x) * Math.cos(d.a0) + (p.y - d.y) * Math.sin(d.a0), uy = -(p.x - d.x) * Math.sin(d.a0) + (p.y - d.y) * Math.cos(d.a0);
      if (Math.hypot(ux / (d.T * 0.5 + sw * 0.15), uy / (d.reach + sw * 0.2)) < 1) near = true;
    }
    const rr = sw * rq.range(0.038, 0.075) * (rq() < 0.15 ? 1.4 : 1), sq = rq.range(0.84, 1), rot = rq.range(0, Math.PI);
    if (near) continue;
    g.fillStyle = L.radial(g, p.x + rr * 0.5, p.y + rr * 0.65, rr * 0.5, rr * 1.75, [[0, 'rgba(2,22,40,0.6)'], [1, 'rgba(2,22,40,0)']]);
    g.beginPath(); g.arc(p.x + rr * 0.5, p.y + rr * 0.65, rr * 1.75, 0, L.TAU); g.fill();
    g.fillStyle = L.radial(g, p.x - rr * 0.34, p.y - rr * 0.38, rr * 0.05, rr * 1.25, [[0, '#93a6cf'], [0.3, '#536592'], [0.72, '#232c58'], [1, '#0d1232']]);
    g.beginPath(); g.ellipse(p.x, p.y, rr, rr * sq, rot, 0, L.TAU); g.fill();
    g.strokeStyle = 'rgba(6,10,36,0.7)'; g.lineWidth = Math.max(0.5, rr * 0.13); g.stroke();
    g.strokeStyle = 'rgba(150,196,226,0.5)'; g.lineWidth = Math.max(0.5, rr * 0.12);       // light bounced off the matrix onto the shaded flank
    g.beginPath(); g.arc(p.x, p.y, rr * 0.72, 0.25, 1.35); g.stroke();
    g.fillStyle = L.radial(g, p.x - rr * 0.36, p.y - rr * 0.4, 0, rr * 0.42, [[0, 'rgba(255,255,255,0.95)'], [0.35, 'rgba(236,244,255,0.6)'], [1, 'rgba(220,232,255,0)']]);
    g.beginPath(); g.arc(p.x - rr * 0.36, p.y - rr * 0.4, rr * 0.42, 0, L.TAU); g.fill();
  }
  g.restore();

  // photographic bloom
  const bl = L.blurred(c, 9);
  g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.1; g.drawImage(bl, 0, 0); g.restore();
  // film grain at the device pixel: keeps the blurred field from banding and gives the 1:1 view some tooth
  g.drawImage(L.pixelCanvas(S, S, (d, pw, ph) => {
    for (let j = 0, o = 0; j < ph; j++) for (let i = 0; i < pw; i++, o += 4) {
      let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      const v = (h & 0xffff) / 65535 - 0.5, w = v < 0 ? 0 : 255;
      d[o] = d[o + 1] = d[o + 2] = w; d[o + 3] = Math.abs(v) * 22;
    }
  }), 0, 0);
  return c;
}

export default {
  name: '金相',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
