// g03 — 朱印: dozens of vermilion seal impressions on xuan paper spelling the coin glyph.
// A ring of seals stamped tangent to the outer circle, a pinwheel of upright seals lining the four sides of the square hole,
// smaller seals filling the space between. Every legend is an unreadable meander in the manner of nine-fold seal script.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

// ── small value noise with a known 0..1 range ──
function vnoise(seed) {
  const r = L.rng('vn' + seed); const T = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) T[i] = r();
  const h = (x, y) => T[((x * 73) ^ (y * 151) ^ ((x * y) & 63)) & 4095];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// ── one serpentine block (the building brick of the pseudo seal script) ──
function serp(g, x, y, w, h, sw, pitch, rnd) {
  const horiz = Math.abs(w - h) < pitch ? rnd() < 0.5 : h > w;      // stack the passes along the longer side
  const Ls = horiz ? h : w, Lr = horiz ? w : h;
  const n = Math.max(4, Math.round((Ls - sw) / pitch) + 1), pa = (Ls - sw) / (n - 1);
  const a0 = sw / 2, a1 = Lr - sw / 2; const pts = [];
  let side = rnd() < 0.5 ? 0 : 1;
  let cur = side ? a1 : a0;
  for (let k = 0; k < n; k++) {
    const s = sw / 2 + k * pa;
    // the far end of this pass: sometimes turns back early, leaving a notch of ground
    let far = side ? a0 : a1;
    if (k < n - 1 && Lr > pitch * 3.2 && rnd() < 0.14) far = L.lerp(far, cur, rnd.range(0.22, 0.4));
    pts.push([cur, s], [far, s]);
    cur = far; side = 1 - side;
  }
  g.beginPath();
  const P = (i) => (horiz ? [x + pts[i][0], y + pts[i][1]] : [x + pts[i][1], y + pts[i][0]]);
  const rad = pa * rnd.range(0.1, 0.3);
  let p = P(0); g.moveTo(p[0], p[1]);
  for (let i = 1; i < pts.length - 1; i++) { const q = P(i), q2 = P(i + 1); g.arcTo(q[0], q[1], q2[0], q2[1], rad); }
  p = P(pts.length - 1); g.lineTo(p[0], p[1]);
  g.stroke();
}
function meander(g, x, y, w, h, sw, pitch, rnd, depth) {
  const cv = w >= pitch * 5.6 && h >= pitch * 4.4, ch = h >= pitch * 5.6 && w >= pitch * 4.4;
  if (depth < 2 && (cv || ch) && rnd() < (depth ? 0.5 : 0.82)) {
    const f = rnd.range(0.36, 0.64);
    if (cv && (!ch || rnd() < 0.5)) {
      const w1 = (w - sw) * f;
      meander(g, x, y, w1, h, sw, pitch, rnd, depth + 1); meander(g, x + w1 + sw, y, w - w1 - sw, h, sw, pitch, rnd, depth + 1);
    } else {
      const h1 = (h - sw) * f;
      meander(g, x, y, w, h1, sw, pitch, rnd, depth + 1); meander(g, x, y + h1 + sw, w, h - h1 - sw, sw, pitch, rnd, depth + 1);
    }
    return;
  }
  serp(g, x, y, w, h, sw, pitch, rnd);
}
// worn, hand-cut rectangle
function roughRect(g, w, h, r, rnd, amp) {
  const hw = w / 2, hh = h / 2; const ph = [rnd() * 9, rnd() * 9, rnd() * 9, rnd() * 9];
  const cs = [[-hw, -hh, 1, 0], [hw, -hh, 0, 1], [hw, hh, -1, 0], [-hw, hh, 0, -1]];
  g.beginPath();
  cs.forEach(([cx, cy, dx, dy], s) => {
    const len = (dx ? w : h) - 2 * r, k = Math.max(3, Math.round(len / 7));
    for (let i = 0; i <= k; i++) {
      const t = i / k, d = r + t * len;
      const o = amp * (Math.sin(ph[s] + d * 0.11) * 0.6 + Math.sin(ph[s] * 2.3 + d * 0.31) * 0.4) * Math.sin(Math.PI * t) ** 0.5;
      const px = cx + dx * d + dy * o, py = cy + dy * d - dx * o;    // (dy, -dx) points outward
      if (s === 0 && i === 0) g.moveTo(px, py); else if (i === 0) { g.quadraticCurveTo(cx, cy, px, py); } else g.lineTo(px, py);
    }
  });
  g.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  g.closePath();
}

const PASTES = [
  { deep: [168, 30, 22], mid: [198, 48, 30], light: [222, 96, 66] },     // 朱砂
  { deep: [150, 26, 26], mid: [182, 38, 34], light: [212, 86, 70] },     // deeper, slightly purple
  { deep: [176, 44, 20], mid: [208, 66, 30], light: [228, 116, 70] },    // 朱磦, more orange
];

/** one seal impression, w × h px, returned as a sprite (transparent ground) */
function makeSeal(w, h, seed) {
  const rnd = L.rng(seed); const pad = 5; const W = Math.ceil(w) + pad * 2, H = Math.ceil(h) + pad * 2;
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  const m = Math.min(w, h); const intaglio = rnd() < 0.5;           // 白文 (white legend on red) or 朱文 (red legend, red frame)
  g.translate(W / 2, H / 2); g.lineCap = 'round'; g.lineJoin = 'round';
  const cr = rnd.range(2.5, 7);
  let sw, pitch, mg;
  if (intaglio) {
    sw = L.clamp(m * 0.05, 2.7, 4.4) * rnd.range(0.92, 1.1); pitch = sw * rnd.range(1.95, 2.2); mg = m * 0.075 + 1.5;
    g.fillStyle = '#000'; roughRect(g, w, h, cr, rnd, 1.1); g.fill();
    g.globalCompositeOperation = 'destination-out';
  } else {
    sw = L.clamp(m * 0.04, 2.3, 3.5) * rnd.range(0.92, 1.1); pitch = sw * rnd.range(2.25, 2.6);
    const fw = sw * rnd.range(1.15, 1.9); mg = fw + sw * 1.25;
    g.strokeStyle = '#000'; g.lineWidth = fw;
    roughRect(g, w - fw, h - fw, cr, rnd, 0.9); g.stroke();
  }
  g.strokeStyle = '#000'; g.lineWidth = sw;
  const iw = w - 2 * mg, ih = h - 2 * mg, gap = sw * 1.05;
  const cols = L.clamp(Math.round(iw / 42), 1, 3), rows = L.clamp(Math.round(ih / 42), 1, 3);
  const xs = [0], ys = [0];
  for (let i = 1; i < cols; i++) xs.push((iw + gap) * (i / cols) + rnd.range(-0.05, 0.05) * iw);
  for (let j = 1; j < rows; j++) ys.push((ih + gap) * (j / rows) + rnd.range(-0.05, 0.05) * ih);
  xs.push(iw + gap); ys.push(ih + gap);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    meander(g, -iw / 2 + xs[i], -ih / 2 + ys[j], xs[i + 1] - xs[i] - gap, ys[j + 1] - ys[j] - gap, sw, pitch, rnd, 0);
  }
  // broken edges: a few bites out of the border, as on an old stone seal
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  for (let i = 0, n = rnd.int(2, 5); i < n; i++) {
    const s = rnd.int(0, 3), t = rnd.range(-0.48, 0.48);
    const bx = s % 2 ? (s === 1 ? w / 2 : -w / 2) : t * w, by = s % 2 ? t * h : (s === 0 ? -h / 2 : h / 2);
    g.beginPath();
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU, rr = rnd.range(1.6, 5.2); k ? g.lineTo(bx + Math.cos(a) * rr * 1.4, by + Math.sin(a) * rr) : g.moveTo(bx + Math.cos(a) * rr * 1.4, by + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';

  // ── paste: uneven pressure, dry streaks (飞白), paper tooth, paste piled at the edges of the strokes ──
  const soft = L.blurred(c, 2.2).getContext('2d').getImageData(0, 0, W, H).data;
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const nz = vnoise(seed); const pal = PASTES[rnd() < 0.55 ? 0 : rnd() < 0.5 ? 1 : 2];
  const ink = rnd() < 0.22 ? rnd.range(0.42, 0.6) : rnd.range(0.66, 1);      // a quarter are tired second impressions
  const pa = rnd() * TAU, pcx = Math.cos(pa), pcy = Math.sin(pa), tilt = rnd.range(0.1, 0.42);
  const sa = rnd() * TAU, scx = Math.cos(sa), scy = Math.sin(sa);
  const ox = rnd() * 400, oy = rnd() * 400, lowS = 1 / (m * 0.42);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; const a = d[i + 3] / 255; if (a <= 0.004) continue;
    const ux = (x - W / 2) / (w / 2), uy = (y - H / 2) / (h / 2);
    const low = nz(ox + x * lowS, oy + y * lowS) * 0.65 + nz(ox + 90 + x * lowS * 2.7, oy + y * lowS * 2.7) * 0.35;
    const press = L.clamp(ink * (1 - tilt * 0.5 + tilt * 0.5 * (ux * pcx + uy * pcy)) + (low - 0.5) * 0.62);
    const u = x * scx + y * scy, v = -x * scy + y * scx;
    const fine = nz(ox + x * 0.78, oy + 7 + y * 0.78) * 0.6 + nz(ox + 31 + x * 0.33, oy + y * 0.33) * 0.4;
    const streak = nz(ox + 200 + u * 0.085, oy + v * 0.62);
    const tooth = fine * 0.62 + streak * 0.38;
    const th = L.lerp(0.69, 0.16, press);
    const cover = L.smooth((tooth - th + 0.075) / 0.15);
    const rim = L.clamp((a - soft[i + 3] / 255) * 2.4);                        // inside the mask and close to its edge
    const t = L.clamp(press * 0.75 + rim * 0.5 + (fine - 0.5) * 0.3) * cover;
    const A = pal.light, B = pal.mid, C = pal.deep; let R, G, Bl;
    if (t < 0.55) { const k = t / 0.55; R = A[0] + (B[0] - A[0]) * k; G = A[1] + (B[1] - A[1]) * k; Bl = A[2] + (B[2] - A[2]) * k; }
    else { const k = (t - 0.55) / 0.45; R = B[0] + (C[0] - B[0]) * k; G = B[1] + (C[1] - B[1]) * k; Bl = B[2] + (C[2] - B[2]) * k; }
    d[i] = R; d[i + 1] = G; d[i + 2] = Bl;
    d[i + 3] = 255 * a * L.clamp(cover * (0.8 + 0.2 * press) + 0.05 * press);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function inRect(s, x, y) {
  const dx = x - s.x, dy = y - s.y, c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
  return Math.abs(dx * c - dy * sn) <= s.w / 2 && Math.abs(dx * sn + dy * c) <= s.h / 2;
}

function plan() {
  const G = K.GLYPH; const rnd = L.rng('g03plan'); const out = [];
  // ring: tangent to the outer circle, tangential widths scaled so the ring closes exactly
  const ring = []; let tot = 0;
  while (true) {
    const big = rnd() < 0.3;
    const w = big ? rnd.range(92, 116) : rnd.range(62, 90), h = rnd() < 0.3 ? w * rnd.range(1.15, 1.4) : w * rnd.range(0.82, 1.05);
    const hh = L.clamp(h, 60, 118);
    const da = 2 * Math.atan((w / 2 + 2.2) / (G.R - hh * 0.5));
    if (tot + da > TAU + 0.12) break;
    ring.push({ w, h: hh, da }); tot += da;
  }
  const k = TAU / tot; let ang = -Math.PI / 2 + 0.21;
  for (const s of ring) {
    const da = s.da * k; s.w *= k; ang += da / 2;
    const sag = G.R - Math.sqrt(G.R * G.R - (s.w / 2) ** 2);
    const rc = G.R - sag * 0.5 - 1 - s.h / 2;
    out.push({ x: G.cx + Math.cos(ang) * rc, y: G.cy + Math.sin(ang) * rc, w: s.w, h: s.h, rot: ang + Math.PI / 2 + rnd.range(-0.012, 0.012), row: 'ring' });
    ang += da / 2;
  }
  // square: a pinwheel of upright seals, inner edges on the four sides of the hole
  const sides = [[1, 0, 0, -1], [0, 1, 1, 0], [-1, 0, 0, 1], [0, -1, -1, 0]];
  sides.forEach(([tx, ty, nx, ny], si) => {
    const cl = rnd.range(66, 84), span = 2 * G.a + cl, n = 4, gp = 3.5;
    const ws = []; let sum = 0;
    for (let i = 0; i < n; i++) { const v = rnd.range(0.8, 1.25); ws.push(v); sum += v; }
    let p = -G.a - cl;
    for (let i = 0; i < n; i++) {
      const w = (span - gp * (n - 1)) * (ws[i] / sum), h = L.clamp(w * rnd.range(0.92, 1.28), 66, 102);
      const tc = p + w / 2, nc = G.a + 1.2 + h / 2;
      out.push({ x: G.cx + tx * tc + nx * nc, y: G.cy + ty * tc + ny * nc, w, h, rot: Math.atan2(ty, tx) + rnd.range(-0.008, 0.008), row: 'square', side: si });
      p += w + gp;
    }
  });
  // fill: smaller seals wherever enough paper still shows between the two rows
  for (const size of [84, 74, 64, 56, 48, 44]) {
    for (let t = 0; t < 900; t++) {
      const w = size * rnd.range(0.9, 1.1), h = size * rnd.range(0.86, 1.2), rot = rnd.range(-0.22, 0.22) + (rnd() < 0.5 ? 0 : Math.PI / 2);
      const x = G.cx + rnd.range(-G.R, G.R), y = G.cy + rnd.range(-G.R, G.R);
      const cand = { x, y, w, h, rot, row: 'fill' }; const c = Math.cos(rot), sn = Math.sin(rot);
      let ok = true, cov = 0, tot2 = 0;
      for (let i = 0; i < 6 && ok; i++) for (let j = 0; j < 6; j++) {
        const lx = (i / 5 - 0.5) * w, ly = (j / 5 - 0.5) * h, px = x + lx * c - ly * sn, py = y + lx * sn + ly * c;
        if (K.sdGlyph(px, py) > -3) { ok = false; break; }
        tot2++; for (const s of out) if (inRect(s, px, py)) { cov++; break; }
      }
      if (ok && cov / tot2 <= 0.3) out.push(cand);
    }
  }
  return out;
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  // xuan paper: warm white, long fibres, faint laid lines from the mould screen
  g.drawImage(K.paper({ base: '#f3eee0', tone: '#9c8658', seed: 'g03xuan', fiber: 1.0, stain: 0.2, grain: 0.16, foxing: 0.08, edge: 0.16 }), 0, 0);
  const r = L.rng('g03laid');
  for (let x = 1.5; x < S; x += 3.4) {
    g.strokeStyle = L.rgba('#7d6a44', r.range(0.018, 0.05)); g.lineWidth = r.range(0.7, 1.2);
    g.beginPath(); g.moveTo(x + r.range(-0.3, 0.3), 0); g.lineTo(x + r.range(-0.6, 0.6), S); g.stroke();
  }
  for (let y = 22; y < S; y += 47 + r.range(-2, 2)) {
    g.strokeStyle = L.rgba('#7d6a44', 0.045); g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + r.range(-2, 2), S * 0.7, y + r.range(-2, 2), S, y + r.range(-1, 1)); g.stroke();
  }
  // cloud-dragon fibres of the xuan sheet
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = r() * S, y = r() * S, len = r.range(18, 70), a = r() * TAU, b = a + r.range(-0.9, 0.9);
    g.strokeStyle = L.rgba(r() < 0.6 ? '#fffdf6' : '#a38f63', r.range(0.07, 0.2)); g.lineWidth = r.range(0.6, 1.4);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(b) * len * 0.5, y + Math.sin(b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }

  const seals = plan();
  const order = { fill: 0, ring: 1, square: 2 };
  seals.sort((a, b) => order[a.row] - order[b.row]);
  // all impressions go onto one transparent sheet first, then soak into the paper
  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  seals.forEach((s, i) => {
    const spr = makeSeal(s.w, s.h, 'g03seal' + i);
    q.save(); q.translate(s.x, s.y); q.rotate(s.rot);
    q.drawImage(spr, -spr.width / 2, -spr.height / 2);
    q.restore();
  });
  // oil from the paste creeping a little way into the paper round every stroke
  g.save(); g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.5; g.drawImage(L.blurred(ink, 5), 0, 0);
  g.globalAlpha = 0.34; g.drawImage(L.blurred(ink, 1.2), 0, 0);
  g.globalAlpha = 0.97; g.drawImage(ink, 0, 0);
  g.restore();
  return c;
}

export default {
  name: '朱印',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
