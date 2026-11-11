// g05 — 刀币线刻: a black-and-white copperplate. Fifteen knife coins laid out as the coin glyph — six head-to-tail round the
// outer circle (arc backs outward), five on an inner ring, four straight knives pin-wheeled along the sides of the square hole
// (their straight backs ARE the hole's sides). Fine ruled hatching on cream paper; no lettering anywhere.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const G = K.GLYPH, TAU = Math.PI * 2;
const INK = '#1b1814';
const LD = [0.7071, 0.7071];                                     // the way the light travels (from the top-left)
let layer = null;

/** knife outline in (u, v): u runs along the length from the point (0) to the ring end (Lk); v across, from the back (0) to the edge (W) */
function profile(Lk, W, r) {
  const Wh = W * r.range(0.44, 0.5), rr = Wh * 0.72, ri = rr * 0.5;
  const ub = Lk * r.range(0.57, 0.62), uh = Lk - 2 * rr + (rr - ri) * 0.7;
  const sl = W * r.range(0.4, 0.55), Wj = W * 0.9, bow = W * 0.06;
  const body = [];
  for (let u = 0; u < uh; u += 5) body.push([u, 0]);
  body.push([uh, 0], [uh, Wh]);
  for (let u = uh - 5; u > ub + 4; u -= 5) body.push([u, Wh]);
  body.push([ub + 4, Wh], [ub, Wh + 2.5], [ub - 5, Wj - 3], [ub - 10, Wj]);          // the shoulder where blade meets handle
  const e0 = ub - 10;
  for (let u = e0 - 5; u > sl; u -= 5) { const t = (e0 - u) / (e0 - sl); body.push([u, L.lerp(Wj, W, t) - bow * Math.sin(Math.PI * t)]); }
  body.push([sl, W]);
  for (let k = 1; k < 6; k++) { const t = k / 6; body.push([sl * (1 - t) + Math.sin(Math.PI * t) * 2.5, W * (1 - t)]); }   // the slanting, slightly hollow end
  const rc = [Lk - rr, Wh / 2], ro = [], rin = [];
  for (let k = 0; k < 40; k++) { const a = (k / 40) * TAU; ro.push([rc[0] + Math.cos(a) * rr, rc[1] + Math.sin(a) * rr]); }
  for (let k = 40; k > 0; k--) { const a = (k / 40) * TAU; rin.push([rc[0] + Math.cos(a) * ri, rc[1] + Math.sin(a) * ri]); }
  return { body, ro, rin, Wh, rr, ri, ub, uh, sl, Wj, rc };
}

function knife(M, Lk, W, seed) {
  const r = L.rng(seed), P = profile(Lk, W, r);
  const shapes = [P.body, P.ro, P.rin].map((sh) => sh.map(([u, v]) => M(u, v)));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of shapes[0].concat(shapes[1])) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { M, Lk, W, P, r, shapes, bb: [x0, y0, x1, y1] };
}
function trace(g, kn, dx = 0, dy = 0) {
  g.beginPath();
  for (const sh of kn.shapes) { sh.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); g.closePath(); }
}

/** the shadow each knife throws to the lower right: short slanting burin strokes */
function castShadow(g, kn) {
  const [x0, y0, x1, y1] = kn.bb, r = kn.r;
  g.save(); trace(g, kn, 6, 8); g.clip();
  g.strokeStyle = INK; g.lineCap = 'round';
  for (let c = x0 + y0 - 20; c < x1 + y1 + 40; c += 3.1) {          // lines x + y = c  (running "/")
    const xa = Math.max(x0 - 4, c - y1 - 12), xb = Math.min(x1 + 12, c - y0 + 4);
    if (xb <= xa) continue;
    g.lineWidth = 1.15 + r.range(-0.2, 0.25); g.globalAlpha = 0.9;
    g.beginPath(); g.moveTo(xa, c - xa + r.range(-0.4, 0.4)); g.lineTo(xb, c - xb + r.range(-0.4, 0.4)); g.stroke();
  }
  g.restore();
}

function drawKnife(g, kn, nz) {
  const { M, Lk, W, P, r } = kn;
  // bare paper under the knife
  g.save(); g.globalCompositeOperation = 'destination-out'; trace(g, kn); g.fill(); g.restore();
  g.save(); trace(g, kn); g.clip();
  g.strokeStyle = INK; g.lineCap = 'round';
  const shade = (u, v, x, y) => {
    const Wl = u < P.ub ? W : P.Wh, a = M(u, v), b = M(u, v + 1);
    const d = (b[0] - a[0]) * LD[0] + (b[1] - a[1]) * LD[1];
    return 0.44 + 0.36 * d * (2 * v / Wl - 1) + 0.5 * nz.fbm(x * 0.012, y * 0.012, 3) + 0.22 * nz.fbm(x * 0.05 + 9, y * 0.05, 2) + (u > P.ub ? 0.07 : 0);
  };
  // 1) lines engraved along the length, swelling in the shade and breaking in the lights
  const du = 5, pitch = 2.75;
  for (let v = -9 + r() * 1.2; v < W + 3; v += pitch) {
    let p0 = M(0, v);
    for (let u = du; u <= Lk + 0.5; u += du) {
      const p1 = M(u, v + Math.sin(u * 0.045 + v) * 0.22), sh = shade(u - du / 2, v, p1[0], p1[1]);
      const w = 0.4 + 1.55 * L.clamp(sh, 0, 1);
      if (sh > 0.1) { g.lineWidth = w; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
      p0 = p1;
    }
  }
  // 2) cross-hatching laid over the darkest passages
  for (let c = -W; c < Lk + W; c += 3.4) {
    let p0 = null;
    for (let v = -9; v <= W + 3; v += 3.5) {
      const u = c + v * 0.9; if (u < 0 || u > Lk) { p0 = null; continue; }
      const p1 = M(u, v), sh = shade(u, v, p1[0], p1[1]);
      if (p0 && sh > 0.6) { g.lineWidth = Math.min(1.25, 0.35 + (sh - 0.6) * 3.2); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
      p0 = p1;
    }
  }
  // 3) corrosion: small ringed pits and burin flicks
  for (let k = 0, n = r.int(26, 40); k < n; k++) {
    const u = r.range(8, Lk - 8), v = r.range(4, (u < P.ub ? W : P.Wh) - 4), [x, y] = M(u, v);
    if (r() < 0.3) {
      const rad = r.range(1.4, 3.2);
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x, y, rad + 0.8, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over'; g.lineWidth = 0.9;
      g.beginPath(); g.arc(x, y, rad, -0.4, 2.6); g.stroke();
      g.beginPath(); g.arc(x + 0.5, y + 0.5, 0.6, 0, TAU); g.fillStyle = INK; g.fill();
    } else {
      const a = r.range(0, TAU), len = r.range(2, 5.5);
      g.lineWidth = r.range(0.8, 1.4);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  }
  // 4) the two raised lines down the handle: a clean light ridge with a dark line on its shaded side
  for (const f of [0.36, 0.66]) {
    const pts = []; for (let u = P.ub + 7; u <= P.uh - 1; u += 5) pts.push(M(u, P.Wh * f));
    const run = (dx, dy) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); g.stroke(); };
    g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3.4; run(0, 0);
    g.globalCompositeOperation = 'source-over'; g.lineWidth = 1.15; run(1.3, 1.3);
  }
  // 5) the raised rim all round: a band of bare paper inside the outline, closed by a thinner inner line
  trace(g, kn); g.lineJoin = 'round';
  g.lineWidth = 11; g.stroke();
  g.globalCompositeOperation = 'destination-out'; g.lineWidth = 8.6; g.stroke();
  g.globalCompositeOperation = 'source-over';
  g.restore();
  // outline, with a heavier "shadow line" on the sides turned away from the light
  g.save(); g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = 1.5; trace(g, kn, 0.8, 0.9); g.stroke();
  g.lineWidth = 1.6; trace(g, kn); g.stroke();
  g.restore();
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const pap = K.paper({ base: '#efe7d3', tone: '#86683a', seed: 'g05paper', fiber: 0.55, stain: 0.3, foxing: 0.3, edge: 0.24 });
  g.drawImage(pap, 0, 0);
  // plate mark: the copper plate's bevel pressed into the damp sheet, and a breath of plate tone inside it
  const pm = 58;
  g.fillStyle = 'rgba(120,96,60,0.055)'; g.fillRect(pm, pm, S - 2 * pm, S - 2 * pm);
  g.lineWidth = 3; g.strokeStyle = 'rgba(70,50,25,0.13)'; g.strokeRect(pm + 1.5, pm + 1.5, S - 2 * pm, S - 2 * pm);
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,252,240,0.5)'; g.strokeRect(pm - 1.5, pm - 1.5, S - 2 * pm, S - 2 * pm);

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  const r = L.rng('g05'), nz = L.makeNoise('g05n');
  // the ground: machine-ruled lines filling the coin's body, so the knives lie on a pale grey coin
  q.save(); K.clipGlyph(q, { corner: 0 });
  q.strokeStyle = INK; q.lineCap = 'round';
  for (let y = G.cy - G.R - 2; y < G.cy + G.R + 4; y += 4.4) {
    q.lineWidth = 0.72 + r.range(-0.08, 0.1); q.globalAlpha = r.range(0.78, 0.95);
    q.beginPath();
    for (let x = G.cx - G.R - 4; x <= G.cx + G.R + 4; x += 24) { const yy = y + Math.sin(x * 0.013 + y * 0.05) * 0.35; x === G.cx - G.R - 4 ? q.moveTo(x, yy) : q.lineTo(x, yy); }
    q.stroke();
  }
  q.restore();
  q.strokeStyle = INK; q.lineWidth = 1.5; K.strokeGlyph(q, { corner: 0 });

  // the knives
  const kn = [];
  const ring = (n, R0, W, s, ph, tag) => {
    const span = TAU / n, Lk = R0 * span - 7;
    for (let i = 0; i < n; i++) {
      const th0 = ph + i * span * s + (3.5 / R0) * s;
      kn.push(knife((u, v) => { const a = th0 + (s * u) / R0, rad = R0 - v; return [G.cx + Math.cos(a) * rad, G.cy + Math.sin(a) * rad]; }, Lk + r.range(-3, 0), W + r.range(-2, 1.5), tag + i));
    }
  };
  ring(5, 294, 51, -1, 0.5, 'g05m');                                 // inner ring, running the other way
  ring(6, G.R - 3, 58, 1, -1.95, 'g05o');                            // outer ring: backs on the coin's edge
  const a = G.a + 3, Wi = 52;
  [[-1, -1, 1, 0, 0, -1], [1, -1, 0, 1, 1, 0], [1, 1, -1, 0, 0, 1], [-1, 1, 0, -1, -1, 0]].forEach(([sx, sy, tx, ty, nx, ny], i) => {
    const px = G.cx + sx * a, py = G.cy + sy * a;
    kn.push(knife((u, v) => [px + tx * (u + 2) + nx * v, py + ty * (u + 2) + ny * v], 2 * a + Wi - 4, Wi + r.range(-1.5, 1.5), 'g05s' + i));
  });
  kn.forEach((k) => castShadow(q, k));
  kn.forEach((k) => drawKnife(q, k, nz));

  K.soak(ink, pap, 0.5);
  K.wear(ink, { seed: 'g05w', amount: 0.22, size: 1.2 });
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.94; g.drawImage(ink, 0, 0);
  g.globalAlpha = 0.16; g.drawImage(L.blurred(ink, 1.1), 0, 0);       // the ink's slight spread into the paper
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '刀币线刻',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                          // a 3-frame flash: perfectly still
};
