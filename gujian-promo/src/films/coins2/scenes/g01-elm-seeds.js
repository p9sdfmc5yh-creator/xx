// g01 — 榆钱: pale green elm samaras (a round papery wing with one seed in the middle), painted like a botanical watercolour on
// off-white paper and heaped along the strokes of the CURRENT GLYPH (K.pack): a shaded under-layer of smaller seeds, then the big
// ones strung along the centre line of each stroke. Nothing here knows which character it is spelling; every size follows
// K.glyphInfo().strokeWidth. Light comes from the top-left: lit / shaded rims, a domed seed with a bright highlight core, contact +
// cast shadows.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const WASH = [
  { c: '#e6eec0', m: '#d3e3a4', e: '#b3cf84', rim: '#8fb162', seed: ['#cfcf80', '#9aa850'] },
  { c: '#e9edb8', m: '#dbe3a0', e: '#bfd183', rim: '#98b060', seed: ['#d4cc7a', '#a3a84c'] },
  { c: '#dfeec6', m: '#c8e0a6', e: '#a6c98a', rim: '#82aa66', seed: ['#c6cf86', '#8fa556'] },
  { c: '#ecebb4', m: '#e0dd98', e: '#c8c97c', rim: '#a3a85c', seed: ['#d6c672', '#a89c48'] },
  { c: '#e2efc4', m: '#cde2a2', e: '#abcd86', rim: '#86ad60', seed: ['#cbd084', '#93a652'] },
  { c: '#e4eebc', m: '#d0e2a0', e: '#b0cc80', rim: '#8cae5e', seed: ['#d0cc7c', '#9ca64e'] },
  { c: '#efe8be', m: '#e5dba2', e: '#d2c684', rim: '#aea262', seed: ['#d3be70', '#a69046'] },   // ripening: straw-coloured
];

// one samara, drawn around (0,0) with its tip pointing along `rot`; all lighting is computed in page space (light from the top-left).
// `rad` is the wing radius in logical px; every stroke width scales with it (u = 1 at the size the washes were designed for).
function samara(g, rad, rot, r) {
  const w = r.pick(WASH), u = rad / 44, tiny = rad < 15, cs = Math.cos(rot), sn = Math.sin(rot);
  const loc = (dx, dy) => [dx * cs + dy * sn, -dx * sn + dy * cs];          // page-space vector → local (rotated) frame
  const [lx, ly] = loc(-0.7071, -0.7071);                                   // unit vector TOWARD the light, in the local frame
  const lw = (px, min = 0.5) => Math.max(min, px * u);
  const ph1 = r() * TAU, ph2 = r() * TAU, nd = r.range(0.045, 0.085), nw = r.range(0.15, 0.22);   // the tip is a shallow dimple, not a cleft
  const rimR = (t) => {
    let dt = t + Math.PI / 2; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    return rad * (1 + 0.03 * Math.sin(2 * t + ph1) + 0.02 * Math.sin(3 * t + ph2) + 0.009 * Math.sin(7 * t + ph2) + 0.005 * Math.sin(13 * t + ph1)) * (1 - nd * Math.exp(-(dt / nw) * (dt / nw)));
  };
  const NP = tiny ? 64 : 128, px = new Float32Array(NP), py = new Float32Array(NP);
  for (let k = 0; k < NP; k++) { const t = (k / NP) * TAU, rr = rimR(t); px[k] = Math.cos(t) * rr; py[k] = Math.sin(t) * rr; }
  const outline = (dx = 0, dy = 0) => { g.beginPath(); g.moveTo(px[0] + dx, py[0] + dy); for (let k = 1; k < NP; k++) g.lineTo(px[k] + dx, py[k] + dy); g.closePath(); };
  const srx = rad * r.range(0.27, 0.31), sry = rad * r.range(0.35, 0.40), sy = rad * 0.04;
  const all = () => g.fillRect(-rad * 1.2, -rad * 1.2, rad * 2.4, rad * 2.4);

  g.save(); g.rotate(rot); g.lineCap = 'round'; g.lineJoin = 'round';
  // stalk + dried calyx under the wing
  const sx = r.range(-3, 3) * u, sl = r.range(5, 9) * u;
  g.strokeStyle = 'rgba(132,112,64,0.85)'; g.lineWidth = lw(1.7, 0.7);
  g.beginPath(); g.moveTo(0, rad * 0.9); g.quadraticCurveTo(sx * 0.3, rad + sl * 0.5, sx, rad + sl); g.stroke();
  // the thickness of the wing: its underside shows as a darker lip along the edge that faces away from the light
  { const tk = Math.max(0.6, 1.0 * u), [tx, ty] = loc(0.75 * tk, tk);
    outline(tx, ty); g.fillStyle = L.mix(w.rim, '#4e6a34', 0.55); g.fill(); }
  // wash
  outline(); g.globalAlpha = 0.96;
  g.fillStyle = L.radial(g, 0, 0, rad * 0.12, rad * 1.02, [[0, w.c], [0.55, w.m], [0.9, w.e], [1, w.rim]]); g.fill(); g.globalAlpha = 1;
  g.save(); outline(); g.clip();
  // wet-in-wet blooms
  for (let k = 0, n = tiny ? 3 : 6; k < n; k++) {
    const a = r() * TAU, d = rad * r.range(0.25, 0.85), br = rad * r.range(0.25, 0.55), x = Math.cos(a) * d, y = Math.sin(a) * d;
    const col = r.pick(['#b4d184', '#ecebac', '#c2dca2', '#d9d488', '#f4f3d6']);
    g.fillStyle = L.radial(g, x, y, 0, br, [[0, L.rgba(col, r.range(0.22, 0.42))], [1, L.rgba(col, 0)]]); g.fillRect(x - br, y - br, br * 2, br * 2);
  }
  // page-space light across the slightly domed wing: brighter toward the top-left, cooler and darker toward the lower-right
  g.fillStyle = L.linear(g, lx * rad, ly * rad, -lx * rad, -ly * rad, [[0, 'rgba(255,255,236,0.26)'], [0.45, 'rgba(255,255,236,0)'], [0.58, 'rgba(70,106,50,0)'], [1, 'rgba(70,106,50,0.22)']]); all();
  // the wing is ruffled: each radial fold has a flank turned to the light and one turned away
  for (let k = 0, n = r.int(4, 6), ph = r() * TAU; k < n; k++) {
    const a = ph + (k / n) * TAU + r.range(-0.25, 0.25), f = -Math.sin(a) * lx + Math.cos(a) * ly, sg = f >= 0 ? 1 : -1;
    const A = 0.06 + 0.28 * Math.abs(f), hw = r.range(0.2, 0.3);
    for (const [side, col] of [[sg, '255,255,234'], [-sg, '64,98,44']]) {
      const ac = a + side * hw * 0.8;
      g.fillStyle = `rgba(${col},${(A / 3).toFixed(3)})`;
      for (const m of [1, 0.66, 0.36]) {                                  // three nested wedges = a soft-edged streak
        g.beginPath(); g.moveTo(Math.cos(ac) * rad * 0.4, Math.sin(ac) * rad * 0.4); g.arc(0, 0, rad * 1.1, ac - hw * m, ac + hw * m); g.closePath(); g.fill();
      }
    }
  }
  // radiating veins, forking toward the rim, with a few cross veinlets; each main vein is a low ridge (a light line on its lit side)
  const nv = tiny ? r.int(10, 13) : r.int(20, 26), v0 = r() * TAU, angs = [], eo = lw(0.75, 0.4);
  for (let k = 0; k < nv; k++) {
    const a = v0 + (k / nv) * TAU + r.range(-0.05, 0.05); angs.push(a);
    const r0 = Math.hypot(Math.cos(a) * srx, Math.sin(a) * sry) * 0.98, r1 = rimR(a) * 0.985, bend = r.range(-0.16, 0.16);
    const x0 = Math.cos(a) * r0, y0 = Math.sin(a) * r0 + sy * 0.5, xm = Math.cos(a + bend) * (r0 + r1) * 0.5, ym = Math.sin(a + bend) * (r0 + r1) * 0.5, x1 = Math.cos(a + bend * 0.4) * r1, y1 = Math.sin(a + bend * 0.4) * r1;
    const va = r.range(0.14, 0.36), vw = lw(r.range(0.6, 1.1), 0.45);
    if (!tiny) {
      g.strokeStyle = `rgba(255,255,236,${(va * 0.8).toFixed(3)})`; g.lineWidth = vw;
      g.beginPath(); g.moveTo(x0 + lx * eo, y0 + ly * eo); g.quadraticCurveTo(xm + lx * eo, ym + ly * eo, x1 + lx * eo, y1 + ly * eo); g.stroke();
    }
    g.strokeStyle = `rgba(92,128,60,${va.toFixed(3)})`; g.lineWidth = vw;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(xm, ym, x1, y1); g.stroke();
    if (r.chance(0.6)) {
      const rf = L.lerp(r0, r1, r.range(0.45, 0.7)), fa = a + r.pick([-1, 1]) * r.range(0.07, 0.12);
      g.lineWidth = lw(0.65, 0.4); g.beginPath(); g.moveTo(Math.cos(a + bend * 0.6) * rf, Math.sin(a + bend * 0.6) * rf); g.lineTo(Math.cos(fa) * r1, Math.sin(fa) * r1); g.stroke();
    }
  }
  g.lineWidth = lw(0.55, 0.4);
  for (let k = 0, n = tiny ? 8 : 34; k < n; k++) {
    const i = r.int(0, nv - 1), a0 = angs[i], a1 = a0 + TAU / nv, rr = rad * r.range(0.5, 0.94);
    g.strokeStyle = `rgba(104,138,70,${r.range(0.14, 0.26).toFixed(3)})`;
    g.beginPath(); g.arc(0, 0, rr, a0, a1); g.stroke();
  }
  // pigment pooled along the rim (dark inner edge) and a paler dry band just inside it
  outline(); g.strokeStyle = L.rgba(w.rim, 0.30); g.lineWidth = lw(7, 2.2); g.stroke();
  outline(); g.strokeStyle = 'rgba(96,134,62,0.5)'; g.lineWidth = lw(2.0, 0.9); g.stroke();
  // the edge curls a little: a bright line where it catches the light, a shaded band where it turns away
  outline(); g.lineWidth = lw(3.0, 1.4);
  g.strokeStyle = L.linear(g, lx * rad, ly * rad, -lx * rad, -ly * rad, [[0, 'rgba(255,255,240,0.9)'], [0.3, 'rgba(255,255,240,0)'], [0.68, 'rgba(54,84,38,0)'], [1, 'rgba(54,84,38,0.42)']]); g.stroke();
  // tiny rust flecks
  for (let k = 0, n = tiny ? r.int(0, 1) : r.int(2, 6); k < n; k++) {
    const a = r() * TAU, d = rad * r.range(0.45, 0.93);
    g.fillStyle = `rgba(150,112,52,${r.range(0.3, 0.6).toFixed(3)})`;
    g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, lw(r.range(0.6, 1.5), 0.4), lw(r.range(0.5, 1.1), 0.35), r() * 3, 0, TAU); g.fill();
  }
  // the seed is a firm bulge under the membrane: the wing rises to it on the lit side and it drops a shadow on the wing behind it
  { const k = sry * 0.42;
    g.fillStyle = L.radial(g, lx * k, ly * k + sy, sry * 0.7, sry * 1.45, [[0, 'rgba(255,255,232,0.22)'], [1, 'rgba(255,255,232,0)']]); all();
    g.fillStyle = L.radial(g, -lx * k, -ly * k + sy, sry * 0.6, sry * 1.5, [[0, 'rgba(58,86,38,0.52)'], [1, 'rgba(58,86,38,0)']]); all(); }
  // style line from the seed to the tip
  g.strokeStyle = 'rgba(108,128,58,0.55)'; g.lineWidth = lw(1.1, 0.5); g.beginPath(); g.moveTo(0, sy - sry * 0.9); g.lineTo(r.range(-1, 1) * u, -rad * (1 - nd) * 0.96); g.stroke();
  { const ex = lx * sry, ey = ly * sry, seedPath = () => { g.beginPath(); g.ellipse(0, sy, srx, sry, 0, 0, TAU); };
    seedPath();
    g.fillStyle = L.linear(g, ex, ey + sy, -ex, -ey + sy, [[0, L.mix(w.seed[0], '#f4f0b4', 0.4)], [0.45, w.seed[0]], [1, L.mix(w.seed[1], '#586828', 0.5)]]); g.fill();
    g.save(); g.clip();
    for (let k = 0; k < 5; k++) {                                        // faint wrinkles on the seed coat
      const o = (k - 2) * srx * 0.34; g.strokeStyle = 'rgba(118,128,58,0.28)'; g.lineWidth = lw(0.7, 0.4);
      g.beginPath(); g.moveTo(o * 0.5, sy - sry); g.quadraticCurveTo(o * 1.3, sy, o * 0.5, sy + sry); g.stroke();
    }
    // form shadow wrapping the far side, a little reflected light inside its edge
    g.fillStyle = L.radial(g, lx * srx * 0.4, ly * sry * 0.4 + sy, sry * 0.25, sry * 1.35, [[0, 'rgba(62,76,26,0)'], [0.5, 'rgba(62,76,26,0.06)'], [1, 'rgba(62,76,26,0.62)']]); all();
    seedPath(); g.lineWidth = lw(3, 1.2);
    g.strokeStyle = L.linear(g, -ex, -ey + sy, ex * 0.2, ey * 0.2 + sy, [[0, 'rgba(228,238,172,0.5)'], [1, 'rgba(228,238,172,0)']]); g.stroke();
    // highlight: a soft bloom with a bright core (paper left white)
    const hx = lx * srx * 0.42, hy = ly * sry * 0.42 + sy;
    g.fillStyle = L.radial(g, hx, hy, 0, srx * 0.85, [[0, 'rgba(255,255,236,0.8)'], [0.35, 'rgba(255,255,236,0.3)'], [1, 'rgba(255,255,236,0)']]); all();
    g.fillStyle = 'rgba(255,255,250,0.95)';
    g.beginPath(); g.ellipse(hx + lx * srx * 0.06, hy + ly * srx * 0.06, srx * 0.2, srx * 0.11, Math.atan2(ly, lx) + Math.PI / 2, 0, TAU); g.fill();
    g.restore();
    // the seed coat's edge: thin on the lit side, a dark crease where it meets its own shadow
    seedPath(); g.lineWidth = lw(1.2, 0.6);
    g.strokeStyle = L.linear(g, ex, ey + sy, -ex, -ey + sy, [[0, 'rgba(120,132,60,0.35)'], [1, 'rgba(62,76,28,0.85)']]); g.stroke(); }
  g.restore();
  // calyx scar at the base (on top of the wing)
  g.fillStyle = 'rgba(140,112,58,0.8)'; g.beginPath(); g.ellipse(0, rad * 0.955, lw(3.2, 1), lw(2.1, 0.7), 0, 0, TAU); g.fill();
  g.restore();
}

/** the tooth of the watercolour paper as a neutral relief (128 = flat), lit from the top-left, at device resolution */
function tooth(seed) {
  const nz = L.makeNoise(seed);
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const h = new Float32Array(pw * ph);
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k++) { const x = (i + 0.5) / q; h[k] = nz.n2(x * 0.36, y * 0.36) + 0.5 * nz.n2(x * 1.05 + 31.7, y * 1.05 - 17.3); }
    }
    const gain = 26 * q;                                                // slopes are measured per logical pixel
    for (let j = 0, k = 0, o = 0; j < ph; j++) for (let i = 0; i < pw; i++, k++, o += 4) {
      const a = h[(j > 0 ? j - 1 : j) * pw + (i > 0 ? i - 1 : i)], b = h[(j < ph - 1 ? j + 1 : j) * pw + (i < pw - 1 ? i + 1 : i)];
      const v = 128 + (b - a) * gain * 0.5;                             // rising toward the lower-right = facing the light
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
  });
}

/** what the heap does to the paper under it: deep shade between the seeds (inside the strokes) and one very soft cast shadow
 *  slipping out toward the lower-right — both straight from the glyph's distance field, at device resolution */
function groundShade(U) {
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const ox = 3 * U, oy = 4.5 * U, far = 22 * U;
    for (let j = 0, o = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, o += 4) {
        const x = (i + 0.5) / q, s0 = K.sdGlyph(x, y);
        if (s0 > far) continue;
        const ain = 0.32 * L.smooth((-4 * U - s0) / (8 * U));           // only well inside the strokes, where seeds lie on every side
        const ash = 0.10 * L.smooth((7 * U - K.sdGlyph(x - ox, y - oy)) / (12 * U));
        const dither = (((i * 73856093) ^ (j * 19349663)) & 255) / 255 - 0.5;
        d[o] = 82; d[o + 1] = 100; d[o + 2] = 54; d[o + 3] = (ain + ash * (1 - ain)) * 255 + dither;
      }
    }
  });
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, U = sw / 75, R1 = sw * 0.5;    // U = 1 for one big character
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const pap = K.paper({ base: '#f4efe2', tone: '#9a8656', seed: 'g01paper', fiber: 0.55, stain: 0.2, foxing: 0.12, edge: 0.16 });
  const grain = tooth('g01tooth');
  { const pg = pap.getContext('2d'); pg.save(); pg.globalCompositeOperation = 'soft-light'; pg.globalAlpha = 0.6; pg.drawImage(grain, 0, 0); pg.restore(); }
  g.drawImage(pap, 0, 0);
  g.drawImage(groundShade(U), 0, 0);

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  const r = L.rng('g01seeds' + info.key);
  const put = (d, tag, grow, shadows) => {
    const rad = d.r * grow * r.range(0.98, 1.03), rr = L.rng('g01s' + tag + d.i);
    const rot = d.ang - Math.PI / 2 + (r.chance(0.5) ? Math.PI : 0) + r.range(-0.7, 0.7);       // the seed's long axis loosely follows the stroke
    const size = 2 * (rad * 1.1 + 10 * (rad / 44) + 4);
    const spr = K.sprite(size, size, (sg) => samara(sg, rad, rot, rr));
    const x = d.x + r.range(-0.6, 0.6) * U, y = d.y + r.range(-0.6, 0.6) * U;
    for (const shadow of shadows) K.stamp(q, spr, x, y, { alpha: 0.97, shadow });
  };
  const order = (list) => list.map((d) => ({ d, k: d.r * r.range(0.8, 1.2) })).sort((a, b) => a.k - b.k).map((e) => e.d);   // small ones first, loosely
  // under-layer: smaller seeds everywhere a disc fits, down to the thin ends of the strokes
  const under = K.pack({ seed: 'g01under', rmax: R1 * 0.8, rmin: Math.max(4.5, R1 * 0.22), gap: 0.9, margin: -U });
  // top layer: the big seeds, each as wide as the stroke, strung along its centre line
  const top = K.pack({ seed: 'g01top', rmax: R1, rmin: Math.max(6, R1 * 0.42), gap: 0.96, margin: U });
  // the smallest seeds, tucked against the outline wherever the two packs left the edge of a stroke bare (stroke heads, the
  // crescents beside a big seed) — so the heap's envelope follows the glyph all the way round
  const rs = Math.max(4, R1 * 0.2), tuck = [];
  { const cover = [...under.map((d) => ({ x: d.x, y: d.y, R: d.r * 1.06 })), ...top.map((d) => ({ x: d.x, y: d.y, R: d.r * 1.08 }))];
    for (const p of K.outline({ grow: -rs, spacing: rs * 1.5, seed: 'g01tuck', jitter: 0.5 })) {
      if (cover.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < c.R + rs * 0.45)) continue;      // only where a real gap is left: no bead rows
      const rr = rs * r.range(0.88, 1.2);
      tuck.push({ x: p.x, y: p.y, r: rr, ang: p.tan, i: tuck.length }); cover.push({ x: p.x, y: p.y, R: rr * 1.25 });
    } }
  for (const d of tuck) put(d, 'k', 1.04, [{ dx: 1.0 * U, dy: 1.5 * U, blur: 2.2 * U, color: 'rgba(58,68,34,0.36)' }]);
  for (const d of order(under)) put(d, 'u', 1.06, [{ dx: 1.4 * U, dy: 2.1 * U, blur: 3 * U, color: 'rgba(58,68,34,0.38)' }]);
  q.save(); q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(104,128,66,0.2)'; q.fillRect(0, 0, S, S); q.restore();   // … all of them in the heap's shade
  // the top layer casts a soft shadow and a tight contact shadow on whatever lies under it
  for (const d of order(top)) put(d, 't', 1.08, [
    { dx: 3.2 * U, dy: 5 * U, blur: 8 * U, color: 'rgba(62,70,34,0.30)' },
    { dx: 0.8 * U, dy: 1.2 * U, blur: 1.6 * U, color: 'rgba(46,58,24,0.5)' },
  ]);
  K.soak(ink, pap, 0.55);                                             // paper tone showing through the washes
  K.soak(ink, grain, 0.75, 'soft-light');                             // pigment granulating in the tooth of the paper
  g.drawImage(ink, 0, 0);
  return c;
}

export default {
  name: '榆钱',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                        // 3-frame flash: perfectly still
};
