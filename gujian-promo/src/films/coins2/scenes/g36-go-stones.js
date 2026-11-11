// g36 — 围棋子: slate-black and clamshell-white go stones on a kaya board with lacquer grid lines, spelling the coin glyph.
// The 19 × 19 grid is centred on the glyph (tengen sits in the middle of the square hole); a stone lies on every intersection
// inside the coin body: the row lining the square hole is white, everything else black. Light from the top-left.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const STEP = 49, N = 9, RAD = 22.6;
let layer = null;

function board(g) {
  const { cx, cy } = K.GLYPH;
  g.drawImage(L.woodTex(S, S, { base: '#d6a65c', dark: '#a9722e', light: '#eccb8e', seed: 'g36wood', scale: 90, dir: 'v', rings: 0.12 }), 0, 0);
  g.fillStyle = 'rgba(219,174,100,0.42)'; g.fillRect(0, 0, S, S);             // calm the figure: kaya is pale and even
  const r = L.rng('g36grain');
  g.lineCap = 'round';
  for (let i = 0; i < 620; i++) {                                              // long straight-grain lines
    const x = r() * S, y = r() * S - 80, len = r.range(80, 340), w = r.range(-3, 3);
    g.strokeStyle = r() < 0.6 ? `rgba(122,74,26,${r.range(0.05, 0.16).toFixed(3)})` : `rgba(255,234,184,${r.range(0.05, 0.14).toFixed(3)})`;
    g.lineWidth = r.range(0.6, 1.4);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w, y + len * 0.5, x + w * 0.4, y + len); g.stroke();
  }
  for (let i = 0; i < 1700; i++) {                                             // pores: short dark dashes along the grain
    const x = r() * S, y = r() * S, len = r.range(3, 9);
    g.strokeStyle = `rgba(98,58,20,${r.range(0.08, 0.22).toFixed(3)})`; g.lineWidth = r.range(0.5, 0.9);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-0.4, 0.4), y + len); g.stroke();
  }
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,242,205,0.16)'], [0.5, 'rgba(255,242,205,0)'], [1, 'rgba(70,36,8,0.22)']]);
  g.fillRect(0, 0, S, S);
  // lacquer grid: slightly raised lines — a thin shadow on the lower-right, uneven loading along the stroke
  const a0 = -N * STEP, a1 = N * STEP;
  for (let pass = 0; pass < 2; pass++) for (let k = -N; k <= N; k++) for (const vert of [false, true]) {
    const edge = Math.abs(k) === N, off = r.range(-0.35, 0.35);
    for (let s = -N; s < N; s++) {
      const t0 = s * STEP - 0.6, t1 = (s + 1) * STEP + 0.6, p = k * STEP + off;
      if (pass === 0) { g.strokeStyle = 'rgba(74,40,10,0.22)'; g.lineWidth = edge ? 3.6 : 2.6; }
      else { g.strokeStyle = `rgba(22,15,10,${r.range(0.80, 0.94).toFixed(3)})`; g.lineWidth = (edge ? 2.5 : 1.7) + r.range(-0.15, 0.2); }
      const d = pass === 0 ? 0.9 : 0;
      g.lineCap = 'butt'; g.beginPath();
      if (vert) { g.moveTo(cx + p + d, cy + t0 + d); g.lineTo(cx + p + d, cy + t1 + d); } else { g.moveTo(cx + t0 + d, cy + p + d); g.lineTo(cx + t1 + d, cy + p + d); }
      g.stroke();
    }
  }
  void a0; void a1;
  for (const [i, j] of [[0, 0], [-6, -6], [6, -6], [-6, 6], [6, 6], [0, -6], [0, 6], [-6, 0], [6, 0]]) {   // star points
    g.fillStyle = 'rgba(20,13,8,0.92)'; g.beginPath(); g.arc(cx + i * STEP, cy + j * STEP, 4.6, 0, TAU); g.fill();
  }
}

function stone(g, x, y, rad, white, r) {
  // cast shadow (to the lower right) + tight contact shadow
  g.fillStyle = L.radial(g, x + 4, y + 5.5, rad * 0.5, rad * 1.34, [[0, 'rgba(40,20,5,0.58)'], [0.6, 'rgba(40,20,5,0.26)'], [1, 'rgba(40,20,5,0)']]);
  g.beginPath(); g.arc(x + 4, y + 5.5, rad * 1.36, 0, TAU); g.fill();
  g.fillStyle = L.radial(g, x + 1, y + 1.5, rad * 0.88, rad * 1.09, [[0, 'rgba(18,9,2,0.62)'], [1, 'rgba(18,9,2,0)']]);
  g.beginPath(); g.arc(x + 1, y + 1.5, rad * 1.1, 0, TAU); g.fill();

  const w = Math.ceil(rad * 2 + 6), c = L.makeCanvas(w, w), q = c.getContext('2d');
  q.translate(w / 2, w / 2);
  q.beginPath(); q.arc(0, 0, rad, 0, TAU);
  q.fillStyle = white
    ? L.radial(q, -rad * 0.3, -rad * 0.35, rad * 0.1, rad * 1.3, [[0, '#fdfbf3'], [0.45, '#f2eddf'], [0.8, '#d6cdb8'], [1, '#a59a82']])
    : L.radial(q, -rad * 0.3, -rad * 0.35, rad * 0.1, rad * 1.3, [[0, '#3a3b41'], [0.4, '#222327'], [0.8, '#111113'], [1, '#050506']]);
  q.fill();
  q.globalCompositeOperation = 'source-atop';
  if (white) {                                                   // clamshell growth lines: fine, nearly parallel, slightly bowed
    q.save(); q.rotate(r() * Math.PI);
    for (let k = -rad + r.range(0, 2); k < rad; k += r.range(2.1, 3.4)) {
      q.strokeStyle = `rgba(148,132,100,${r.range(0.12, 0.28).toFixed(3)})`; q.lineWidth = r.range(0.5, 0.95);
      q.beginPath(); q.moveTo(-rad, k); q.quadraticCurveTo(0, k + r.range(1.5, 3.5), rad, k); q.stroke();
    }
    q.restore();
  } else {                                                       // slate: faint cleavage striae, a few pale dust specks and hairline scuffs
    q.save(); q.rotate(r() * Math.PI);
    for (let k = -rad; k < rad; k += r.range(1.8, 4.2)) {
      q.strokeStyle = `rgba(128,134,148,${r.range(0.04, 0.11).toFixed(3)})`; q.lineWidth = r.range(0.5, 1.1);
      q.beginPath(); q.moveTo(-rad, k); q.lineTo(rad, k + r.range(-1, 1)); q.stroke();
    }
    q.restore();
    for (let k = 0, n = r.int(3, 7); k < n; k++) {
      const a = r() * TAU, d = rad * Math.sqrt(r()) * 0.9;
      q.fillStyle = `rgba(206,200,188,${r.range(0.16, 0.36).toFixed(3)})`;
      q.beginPath(); q.ellipse(Math.cos(a) * d, Math.sin(a) * d, r.range(0.5, 1.0), r.range(0.4, 0.8), r() * 3, 0, TAU); q.fill();
    }
    for (let k = 0, n = r.int(1, 3); k < n; k++) {
      const a = r() * TAU, d = rad * r() * 0.6, len = r.range(5, 13), t = r() * TAU;
      q.strokeStyle = `rgba(170,176,190,${r.range(0.10, 0.20).toFixed(3)})`; q.lineWidth = 0.6;
      q.beginPath(); q.moveTo(Math.cos(a) * d, Math.sin(a) * d); q.lineTo(Math.cos(a) * d + Math.cos(t) * len, Math.sin(a) * d + Math.sin(t) * len); q.stroke();
    }
  }
  // form shadow towards the lower right, warm bounce from the board on the far rim
  q.fillStyle = L.linear(q, -rad * 0.7, -rad * 0.7, rad * 0.75, rad * 0.75, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [1, white ? 'rgba(84,64,34,0.42)' : 'rgba(0,0,0,0.5)']]);
  q.fillRect(-rad, -rad, rad * 2, rad * 2);
  q.fillStyle = L.radial(q, -rad * 0.22, -rad * 0.22, rad * 0.98, rad * 1.3, [[0, 'rgba(214,160,86,0)'], [1, white ? 'rgba(214,160,86,0.30)' : 'rgba(214,160,86,0.34)']]);
  q.fillRect(-rad, -rad, rad * 2, rad * 2);
  // broad soft highlight, then the small sharp reflection of the window
  q.fillStyle = L.radial(q, -rad * 0.36, -rad * 0.4, 0, rad * 0.62, white
    ? [[0, 'rgba(255,255,255,0.95)'], [0.4, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]
    : [[0, 'rgba(214,222,238,0.50)'], [0.4, 'rgba(186,196,216,0.18)'], [1, 'rgba(186,196,216,0)']]);
  q.fillRect(-rad, -rad, rad * 2, rad * 2);
  q.save(); q.translate(-rad * 0.4, -rad * 0.44); q.rotate(-0.75 + r.range(-0.12, 0.12)); q.scale(1, 0.42);
  q.fillStyle = L.radial(q, 0, 0, 0, rad * 0.24, white
    ? [[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]
    : [[0, 'rgba(246,248,255,0.92)'], [0.55, 'rgba(236,240,252,0.5)'], [1, 'rgba(236,240,252,0)']]);
  q.beginPath(); q.arc(0, 0, rad * 0.24, 0, TAU); q.fill(); q.restore();
  g.drawImage(c, x - w / 2, y - w / 2);
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  board(g);
  const { cx, cy } = K.GLYPH; const r = L.rng('g36stones');
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {   // top-left → bottom-right, so each stone covers its neighbours' shadows
    const cheb = Math.max(Math.abs(i), Math.abs(j)), hyp = Math.hypot(i, j);
    if (cheb < 3 || hyp > 7.1) continue;
    const white = cheb === 3;
    stone(g, cx + i * STEP + r.range(-1.1, 1.1), cy + j * STEP + r.range(-1.1, 1.1), RAD + r.range(-0.5, 0.5), white, r);
  }
  return c;
}

export default {
  name: '围棋子',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },
};
