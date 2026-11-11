// g09 — 银元: silver dollars on white paper, drawn like a copperplate coin plate (grey ink, ruled shading), spelling the coin glyph.
// One row of sixteen hugs the outer circle, twelve line the square hole (corner coins + two per side). Reliefs are worn and unreadable.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const disc = (q, x, y, r) => { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); };
const oval = (q, x, y, rx, ry, rot) => { q.beginPath(); q.ellipse(x, y, rx, ry, rot, 0, TAU); q.fill(); };

// ── worn reliefs, painted as HEIGHT (grey = how far the metal stands up). None of them is writing. ──
function reliefDragon(q, R, r) {
  // a dragon coiled round its pearl: a wavy, nearly closed ring of body with a head, claws and flame curls
  const a0 = r.range(0, TAU), n = 110;
  const pos = (t) => { const ang = a0 + t * 0.88 * TAU, rad = R * (0.37 + 0.105 * Math.sin(t * TAU * 4.5)); return [Math.cos(ang) * rad, Math.sin(ang) * rad, ang]; };
  q.fillStyle = '#a2a2a2';
  for (let i = 0; i <= n; i++) { const t = i / n, [x, y] = pos(t); disc(q, x, y, R * (0.085 - 0.04 * t)); }
  const [hx, hy] = pos(0);
  q.fillStyle = '#aeaeae'; oval(q, hx, hy, R * 0.125, R * 0.095, a0 - Math.PI / 2);
  oval(q, hx + Math.cos(a0 - 2.2) * R * 0.13, hy + Math.sin(a0 - 2.2) * R * 0.13, R * 0.07, R * 0.028, a0 - 2.2);
  oval(q, hx + Math.cos(a0 - 1.2) * R * 0.14, hy + Math.sin(a0 - 1.2) * R * 0.14, R * 0.075, R * 0.026, a0 - 1.2);
  q.fillStyle = '#868686';                                  // scales: small pits along the body
  for (let i = 5; i < n - 8; i += 3) {
    const [x, y, ang] = pos(i / n), o = ((i / 3) % 2 ? 1 : -1) * R * 0.026;
    disc(q, x + Math.cos(ang) * o, y + Math.sin(ang) * o, R * 0.016);
  }
  q.fillStyle = '#9c9c9c';                                  // claws
  for (const t of [0.2, 0.42, 0.64, 0.84]) {
    const [x, y, ang] = pos(t);
    for (let k = -1; k <= 1; k++) oval(q, x + Math.cos(ang + k * 0.5) * R * 0.12, y + Math.sin(ang + k * 0.5) * R * 0.12, R * 0.05, R * 0.018, ang + k * 0.5);
  }
  q.fillStyle = '#989898';                                  // flame / cloud curls in the field
  for (let k = 0; k < 7; k++) {
    const ang = a0 + 0.9 + k * 0.78 + r.range(-0.12, 0.12), rad = R * r.range(0.61, 0.66);
    oval(q, Math.cos(ang) * rad, Math.sin(ang) * rad, R * 0.065, R * 0.028, ang + 1.1);
    disc(q, Math.cos(ang + 0.1) * (rad - R * 0.04), Math.sin(ang + 0.1) * (rad - R * 0.04), R * 0.026);
  }
  q.fillStyle = '#b8b8b8'; disc(q, 0, 0, R * 0.075);        // the pearl
  q.fillStyle = '#9a9a9a'; for (let k = 0; k < 6; k++) oval(q, Math.cos(k * TAU / 6) * R * 0.13, Math.sin(k * TAU / 6) * R * 0.13, R * 0.04, R * 0.016, k * TAU / 6);
}
function reliefBust(q, R) {
  // (type 1) a two-masted junk on the swell — the reverse of the sailing-ship dollar — worn to soft lumps
  const poly = (pts) => { q.beginPath(); pts.forEach(([x, y], i) => (i ? q.lineTo(x * R, y * R) : q.moveTo(x * R, y * R))); q.closePath(); q.fill(); };
  q.fillStyle = '#a0a0a0';
  q.beginPath(); q.moveTo(-R * 0.52, R * 0.1); q.quadraticCurveTo(0, R * 0.3, R * 0.54, R * 0.04);
  q.quadraticCurveTo(R * 0.34, R * 0.44, -R * 0.04, R * 0.42); q.quadraticCurveTo(-R * 0.4, R * 0.4, -R * 0.52, R * 0.1); q.fill();
  q.fillStyle = '#acacac';
  poly([[-0.37, 0.12], [-0.31, -0.5], [-0.03, -0.57], [0.0, 0.15]]);
  poly([[0.08, 0.14], [0.12, -0.37], [0.36, -0.42], [0.41, 0.08]]);
  q.strokeStyle = '#8a8a8a'; q.lineWidth = Math.max(1, R * 0.022); q.lineCap = 'round';
  for (let k = 1; k <= 5; k++) { const y = 0.12 - k * 0.105; q.beginPath(); q.moveTo(-R * (0.36 - k * 0.008), R * y); q.lineTo(-R * 0.012, R * (y + 0.02)); q.stroke(); }
  for (let k = 1; k <= 4; k++) { const y = 0.12 - k * 0.1; q.beginPath(); q.moveTo(R * 0.09, R * y); q.lineTo(R * (0.4 - k * 0.01), R * (y - 0.03)); q.stroke(); }
  q.strokeStyle = '#a0a0a0'; q.lineWidth = Math.max(1, R * 0.026);
  q.beginPath(); q.moveTo(-R * 0.17, R * 0.16); q.lineTo(-R * 0.17, -R * 0.64); q.moveTo(R * 0.25, R * 0.12); q.lineTo(R * 0.25, -R * 0.5); q.stroke();
  q.strokeStyle = '#989898'; q.lineWidth = Math.max(1, R * 0.03);   // the swell under the hull
  for (let row = 0; row < 2; row++) for (let k = -2; k <= 2; k++) {
    const x = R * (k * 0.2 + row * 0.1), y = R * (0.53 + row * 0.085);
    if (Math.hypot(x, y) > R * 0.66) continue;
    q.beginPath(); q.arc(x, y + R * 0.07, R * 0.1, -2.3, -0.84); q.stroke();
  }
  q.fillStyle = '#a8a8a8'; disc(q, R * 0.5, -R * 0.36, R * 0.05);  // three birds / a low sun as plain pellets
  disc(q, -R * 0.52, -R * 0.3, R * 0.03); disc(q, -R * 0.46, -R * 0.4, R * 0.026);
}
function reliefWreath(q, R, r) {
  for (const side of [-1, 1]) {
    q.strokeStyle = '#949494'; q.lineWidth = R * 0.035; q.lineCap = 'round';
    q.beginPath(); q.arc(0, 0, R * 0.5, Math.PI / 2 + side * 0.2, Math.PI / 2 + side * 2.75, side < 0); q.stroke();
    for (let k = 0; k < 9; k++) {
      const ang = Math.PI / 2 + side * (0.3 + k * 0.29), tilt = ang + side * (Math.PI / 2 - 0.62);
      for (const [dr, g] of [[0.07, '#a4a4a4'], [-0.07, '#9c9c9c']]) {
        const rad = R * (0.5 + dr) + r.range(-0.6, 0.6);
        q.fillStyle = g; oval(q, Math.cos(ang) * rad, Math.sin(ang) * rad, R * 0.095, R * 0.04, tilt + (dr > 0 ? 0 : side * 1.1));
      }
    }
  }
  q.fillStyle = '#a8a8a8'; oval(q, -R * 0.07, R * 0.55, R * 0.08, R * 0.04, 0.5); oval(q, R * 0.07, R * 0.55, R * 0.08, R * 0.04, -0.5);
  q.fillStyle = '#a6a6a6';                                  // a five-petal blossom in the middle
  for (let k = 0; k < 5; k++) disc(q, Math.cos(k * TAU / 5 - 1.57) * R * 0.15, Math.sin(k * TAU / 5 - 1.57) * R * 0.15, R * 0.088);
  q.fillStyle = '#b6b6b6'; disc(q, 0, 0, R * 0.065);
}

function makeCoin(seed, D, type) {
  const r = L.rng(seed), R = D / 2, W = Math.ceil(D + 14), rot = r.range(0, TAU);
  const height = K.sprite(W, W, (q) => {
    q.fillStyle = '#000'; q.fillRect(-W / 2, -W / 2, W, W);
    q.fillStyle = L.radial(q, 0, 0, 0, R, [[0, '#606060'], [0.8, '#565656'], [1, '#505050']]); disc(q, 0, 0, R);
    q.strokeStyle = '#b2b2b2'; q.lineWidth = R * 0.085; q.beginPath(); q.arc(0, 0, R * 0.95, 0, TAU); q.stroke();
    q.fillStyle = '#b0b0b0';
    const nb = Math.round((TAU * R * 0.85) / 4.7);          // bead ring inside the rim
    for (let i = 0; i < nb; i++) { const t = rot + (i / nb) * TAU; disc(q, Math.cos(t) * R * 0.85, Math.sin(t) * R * 0.85, 1.6); }
    q.save(); q.rotate(rot);
    if (type === 0) reliefDragon(q, R, r); else if (type === 1) reliefBust(q, R); else reliefWreath(q, R, r);
    q.fillStyle = '#8e8e8e';                                // worn pellets where a border ornament used to be
    const nl = r.int(10, 14), l0 = r.range(0, TAU);
    for (let i = 0; i < nl; i++) {
      const t = l0 + (i / nl) * TAU, x = Math.cos(t) * R * 0.735, y = Math.sin(t) * R * 0.735;
      oval(q, x, y, R * r.range(0.035, 0.055), R * r.range(0.022, 0.034), t + Math.PI / 2 + r.range(-0.3, 0.3));
    }
    q.restore();
  });
  const shade = L.bumpLight(height, { angle: 45, strength: 1.7, blur: 0.75, res: 1 });
  const lus = r.range(0, TAU), tone = r.range(0, 0.2), tilt = r.range(-0.07, 0.07);
  return K.sprite(W, W, (q) => {
    q.save(); q.beginPath(); q.arc(0, 0, R, 0, TAU); q.clip();
    q.fillStyle = L.linear(q, -R * 0.7, -R * 0.7, R * 0.7, R * 0.7, [[0, '#f3f2ed'], [0.45, '#c8c8c4'], [1, '#88888c']]);
    q.fillRect(-R, -R, D, D);
    if (q.createConicGradient) {                            // cartwheel lustre: two bright and two dull sectors
      const cg = q.createConicGradient(lus, 0, 0);
      [[0, 'rgba(255,255,255,0.24)'], [0.13, 'rgba(255,255,255,0)'], [0.25, 'rgba(40,40,46,0.13)'], [0.37, 'rgba(40,40,46,0)'], [0.5, 'rgba(255,255,255,0.24)'],
        [0.63, 'rgba(255,255,255,0)'], [0.75, 'rgba(40,40,46,0.13)'], [0.87, 'rgba(40,40,46,0)'], [1, 'rgba(255,255,255,0.24)']].forEach(([t, c]) => cg.addColorStop(t, c));
      q.fillStyle = cg; q.fillRect(-R, -R, D, D);
    }
    q.fillStyle = L.radial(q, 0, 0, R * 0.5, R * 0.92, [[0, 'rgba(48,46,42,0)'], [0.8, 'rgba(48,46,42,0.22)'], [1, 'rgba(48,46,42,0.04)']]);
    q.fillRect(-R, -R, D, D);
    for (let k = 0, n = r.int(3, 6); k < n; k++) {          // toning patches
      const a = r.range(0, TAU), d = R * r.range(0.3, 0.85), x = Math.cos(a) * d, y = Math.sin(a) * d, rr = R * r.range(0.12, 0.34);
      q.fillStyle = L.radial(q, x, y, 0, rr, [[0, `rgba(52,48,42,${r.range(0.06, 0.15).toFixed(3)})`], [1, 'rgba(52,48,42,0)']]);
      q.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    q.fillStyle = `rgba(58,56,52,${tone.toFixed(3)})`; q.fillRect(-R, -R, D, D);
    q.globalCompositeOperation = 'hard-light'; q.drawImage(shade, -W / 2, -W / 2); q.globalCompositeOperation = 'source-over';
    // engraver's ruling: fine parallel lines that thicken toward the shadow side, cross-hatched in the darkest crescent
    const rule = (ang, gap, lw, aFn) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      q.save(); q.rotate(ang); q.lineWidth = lw;
      for (let y = -R + r.range(0, gap); y < R; y += gap) {
        const half = Math.sqrt(Math.max(0, R * R - y * y));
        for (let x = -half; x < half; x += 8) {
          const x2 = Math.min(half, x + 8.4), mx = (x + x2) / 2, px = mx * ca - y * sa, py = mx * sa + y * ca;
          const al = aFn(L.clamp(((px + py) / (2 * R)) * 0.95 + 0.47));
          if (al < 0.012) continue;
          q.strokeStyle = `rgba(36,36,42,${al.toFixed(3)})`; q.beginPath(); q.moveTo(x, y); q.lineTo(x2, y); q.stroke();
        }
      }
      q.restore();
    };
    rule(tilt, 2.5, 0.8, (s) => 0.07 + 0.38 * s * s);
    rule(tilt + 0.92, 3.1, 0.7, (s) => Math.max(0, s - 0.62) * 0.95);
    // hairline scratches and bag marks
    q.lineCap = 'round';
    for (let k = 0, n = r.int(12, 24); k < n; k++) {
      const a = r.range(0, TAU), d = R * Math.sqrt(r()) * 0.92, x = Math.cos(a) * d, y = Math.sin(a) * d, len = r.range(4, 24), dir = r.range(0, TAU), light = r() < 0.55;
      q.strokeStyle = light ? `rgba(255,255,255,${r.range(0.3, 0.6).toFixed(3)})` : `rgba(30,30,36,${r.range(0.18, 0.36).toFixed(3)})`;
      q.lineWidth = r.range(0.5, 0.9);
      q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + Math.cos(dir + 0.15) * len * 0.5, y + Math.sin(dir + 0.15) * len * 0.5, x + Math.cos(dir) * len, y + Math.sin(dir) * len); q.stroke();
    }
    for (let k = 0, n = r.int(6, 12); k < n; k++) {
      const a = r.range(0, TAU), d = R * Math.sqrt(r()) * 0.9, x = Math.cos(a) * d, y = Math.sin(a) * d, len = r.range(1.5, 3.4), dir = r.range(0, TAU);
      q.lineWidth = 1; q.strokeStyle = 'rgba(28,28,34,0.5)'; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(dir) * len, y + Math.sin(dir) * len); q.stroke();
      q.lineWidth = 0.7; q.strokeStyle = 'rgba(255,255,255,0.6)'; q.beginPath(); q.moveTo(x - 0.8, y - 0.8); q.lineTo(x - 0.8 + Math.cos(dir) * len, y - 0.8 + Math.sin(dir) * len); q.stroke();
    }
    // reeded edge: short radial teeth all the way round
    const nt = Math.round((TAU * R) / 2.5); q.lineCap = 'butt'; q.lineWidth = 0.95;
    for (let i = 0; i < nt; i++) {
      const t = (i / nt) * TAU, c = Math.cos(t), s = Math.sin(t);
      q.strokeStyle = `rgba(30,30,36,${(0.34 + 0.26 * L.clamp((c + s) * 0.5 + 0.5)).toFixed(3)})`;
      q.beginPath(); q.moveTo(c * R * 0.968, s * R * 0.968); q.lineTo(c * (R + 1), s * (R + 1)); q.stroke();
    }
    q.restore();
    q.strokeStyle = 'rgba(34,34,40,0.7)'; q.lineWidth = 1; q.beginPath(); q.arc(0, 0, R - 0.4, 0, TAU); q.stroke();
    q.strokeStyle = 'rgba(30,30,36,0.55)'; q.lineWidth = 1.9; q.lineCap = 'round'; q.beginPath(); q.arc(0, 0, R - 0.9, -0.3, Math.PI / 2 + 0.3); q.stroke();
  });
}

function build() {
  const G = K.GLYPH, c = L.makeCanvas(S, S), g = c.getContext('2d');
  const pap = K.paper({ base: '#f5f3ec', tone: '#8d8266', seed: 'g09paper', stain: 0.14, foxing: 0.1, edge: 0.1, fiber: 0.5 });
  g.drawImage(pap, 0, 0);
  // faint plate mark of the copperplate
  g.strokeStyle = 'rgba(110,100,80,0.16)'; g.lineWidth = 1.4; g.strokeRect(44.5, 44.5, S - 89, S - 89);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.strokeRect(46, 46, S - 92, S - 92);

  const r = L.rng('g09lay'), coins = [];
  const NR = 16;
  for (let i = 0; i < NR; i++) {                            // outer row: outer edge of every coin touches the big circle
    const D = 120 + r.range(-3, 4), t = Math.PI / NR + (i / NR) * TAU + r.range(-0.012, 0.012), rr = G.R - D / 2;
    coins.push({ x: G.cx + Math.cos(t) * rr, y: G.cy + Math.sin(t) * rr, D, row: 0, i });
  }
  K.squareSlots({ perSide: 3, d: G.a + 60, seed: 'g09sq', jitter: 0 }).forEach((s, i) => {   // inner row: inner edges sit on the hole's four straight sides
    const D = 120 + r.range(-3, 3), d = G.a + D / 2; let dx = s.x - G.cx, dy = s.y - G.cy;
    if (s.corner) { dx = Math.sign(dx) * d; dy = Math.sign(dy) * d; } else if (s.side % 2 === 0) { dy = Math.sign(dy) * d; dx += r.range(-1.5, 1.5); } else { dx = Math.sign(dx) * d; dy += r.range(-1.5, 1.5); }
    coins.push({ x: G.cx + dx, y: G.cy + dy, D, row: 1, i });
  });
  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  coins.forEach((co, k) => {
    const spr = makeCoin('g09coin' + k, co.D, (k * 7 + (co.row ? 1 : 0)) % 3);
    K.stamp(q, spr, co.x, co.y, { shadow: { dx: 4, dy: 6, blur: 8, color: 'rgba(30,28,26,0.42)' } });
  });
  K.soak(ink, pap, 0.4);
  g.drawImage(ink, 0, 0);
  return c;
}

export default {
  name: '银元',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                // a 3-frame flash: perfectly still
};
