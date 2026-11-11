// g03 — 朱印: dozens of vermilion seal impressions on xuan paper spelling the CURRENT GLYPH (the plate never knows which one).
// K.pack strings discs along the strokes; every disc (or a pair of neighbours) becomes a stroke-aligned box that is cut into
// square and oblong seals, each checked against K.sdGlyph so that nothing leaves the stroke. A few of the stone seals are still
// standing on the sheet where they were pressed. Every legend is an unreadable meander in the manner of nine-fold seal script.
// The paste is shaded per DEVICE pixel (L.pixelCanvas): pressure, dry streaks (飞白), paste piled at the edges, and a height
// field lit from the top-left so that the paste stands on the paper.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LIGHT = [-0.646, -0.763];        // unit vector on the page pointing TOWARD the light (top-left)
const PERSP = 0.022;                   // how far the top of a standing seal leans away from the centre of the picture
let layer = null;

// ── small value noise with a known 0..1 range ──
function vnoise(seed) {
  const r = L.rng('vn' + seed); const T = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) T[i] = r();
  const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return T[(n ^ (n >>> 16)) & 4095]; };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// ── one serpentine block (the building brick of the pseudo seal script) ──
function serp(g, x, y, w, h, sw, pitch, rnd) {
  const horiz = Math.abs(w - h) < pitch * 1.5 ? rnd() < 0.5 : (h > w) !== (rnd() < 0.22);   // mostly stack the passes along the longer side
  const Ls = horiz ? h : w, Lr = horiz ? w : h;
  const n = Math.max(5, Math.round((Ls - sw) / pitch) + 1), pa = (Ls - sw) / (n - 1);       // never fewer than five passes: three or four read as S / 5 / 2 / M
  const a0 = sw / 2, a1 = Lr - sw / 2; const pts = [];
  let side = rnd() < 0.5 ? 0 : 1;
  let cur = side ? a1 : a0;
  for (let k = 0; k < n; k++) {
    const s = sw / 2 + k * pa;
    // the far end of this pass: sometimes turns back early, leaving a notch of ground
    let far = side ? a0 : a1;
    if (k < n - 1 && Lr > pitch * 3.2 && rnd() < 0.34) far = L.lerp(far, cur, rnd.range(0.2, 0.5));
    pts.push([cur, s], [far, s]);
    cur = far; side = 1 - side;
  }
  g.beginPath();
  const P = (i) => (horiz ? [x + pts[i][0], y + pts[i][1]] : [x + pts[i][1], y + pts[i][0]]);
  const rad = pa * rnd.range(0.04, 0.14);                              // knife-cut corners, hardly rounded
  let p = P(0); g.moveTo(p[0], p[1]);
  for (let i = 1; i < pts.length - 1; i++) { const q = P(i), q2 = P(i + 1); g.arcTo(q[0], q[1], q2[0], q2[1], rad); }
  p = P(pts.length - 1); g.lineTo(p[0], p[1]);
  g.stroke();
}
// cut the field of a seal into small blocks, each one a serpentine of its own: fragmented enough that nothing reads as a character
function meander(g, x, y, w, h, sw, pitch, rnd, depth) {
  const gap = pitch - sw, mx = 8.2 * pitch, mn = 4.3 * pitch;
  const cv = w >= 2 * mn + gap, ch = h >= 2 * mn + gap;                 // room for two blocks side by side / one above the other
  const must = (w > mx && cv) || (h > mx && ch);
  if (must || (depth < 4 && (cv || ch) && rnd() < 0.3)) {
    const f = rnd.range(0.36, 0.64);
    const vert = cv && (!ch || (w > h * 1.15 ? true : h > w * 1.15 ? false : rnd() < 0.5));
    if (vert) {
      const w1 = L.clamp((w - gap) * f, mn, w - gap - mn);
      meander(g, x, y, w1, h, sw, pitch, rnd, depth + 1); meander(g, x + w1 + gap, y, w - w1 - gap, h, sw, pitch, rnd, depth + 1);
    } else {
      const h1 = L.clamp((h - gap) * f, mn, h - gap - mn);
      meander(g, x, y, w, h1, sw, pitch, rnd, depth + 1); meander(g, x, y + h1 + gap, w, h - h1 - gap, sw, pitch, rnd, depth + 1);
    }
    return;
  }
  serp(g, x, y, w, h, sw, pitch, rnd);
}
// worn, hand-cut rectangle (u = size of the seal relative to a 72 px one)
function roughRect(g, w, h, r, rnd, amp, u) {
  const hw = w / 2, hh = h / 2; const ph = [rnd() * 9, rnd() * 9, rnd() * 9, rnd() * 9];
  const cs = [[-hw, -hh, 1, 0], [hw, -hh, 0, 1], [hw, hh, -1, 0], [-hw, hh, 0, -1]];
  g.beginPath();
  cs.forEach(([cx, cy, dx, dy], s) => {
    const len = (dx ? w : h) - 2 * r, k = Math.max(3, Math.round(len / (7 * u)));
    for (let i = 0; i <= k; i++) {
      const t = i / k, d = r + t * len, e = d / u;
      const o = amp * (Math.sin(ph[s] + e * 0.11) * 0.6 + Math.sin(ph[s] * 2.3 + e * 0.31) * 0.4) * Math.sin(Math.PI * t) ** 0.5;
      const px = cx + dx * d + dy * o, py = cy + dy * d - dx * o;    // (dy, -dx) points outward
      if (s === 0 && i === 0) g.moveTo(px, py); else if (i === 0) { g.quadraticCurveTo(cx, cy, px, py); } else g.lineTo(px, py);
    }
  });
  g.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  g.closePath();
}

const PASTES = [
  { deep: [166, 28, 20], mid: [200, 46, 28], light: [224, 96, 64] },     // 朱砂
  { deep: [148, 24, 24], mid: [184, 38, 34], light: [214, 88, 70] },     // deeper, slightly purple
  { deep: [176, 44, 18], mid: [210, 66, 28], light: [230, 118, 70] },    // 朱磦, more orange
];

/**
 * One seal as a vector-drawn sprite (so it is cut at device resolution): the alpha is where the seal face touches the paper,
 * the colour channels carry what the paste pass needs — R: how heavily it was inked and pressed (with the tilt of the hand),
 * G: which paste, B: the direction of the dry streaks.
 */
function sealSprite(w, h, seed) {
  const rnd = L.rng(seed), m = Math.min(w, h), u = L.clamp(m / 72, 0.2, 1.3), pad = 3;
  return K.sprite(Math.ceil(w) + pad * 2, Math.ceil(h) + pad * 2, (g, W, H) => {
    g.lineCap = 'butt'; g.lineJoin = 'round';
    const intaglio = rnd() < 0.6;                                    // 白文 (white legend on red) or 朱文 (red legend, red frame)
    const cr = rnd.range(2.5, 7) * u;
    let sw, pitch, mg;
    if (intaglio) {
      sw = Math.max(1.15, m * 0.032) * rnd.range(0.92, 1.1); pitch = sw * rnd.range(1.95, 2.2); mg = m * 0.07 + 1.4 * u;
      g.fillStyle = '#000'; roughRect(g, w, h, cr, rnd, 1.1 * u, u); g.fill();
      g.globalCompositeOperation = 'destination-out';
    } else {
      sw = Math.max(1.05, m * 0.029) * rnd.range(0.92, 1.1); pitch = sw * rnd.range(2.15, 2.5);
      const fw = sw * rnd.range(1.2, 1.9); mg = fw + (pitch - sw);
      g.strokeStyle = '#000'; g.lineWidth = fw;
      roughRect(g, w - fw, h - fw, cr, rnd, 0.9 * u, u); g.stroke();
    }
    const iw = w - 2 * mg, ih = h - 2 * mg, k4 = Math.min(1, Math.min(iw, ih) / (4 * pitch + sw));     // a small seal: thin the line until five passes fit
    sw *= k4; pitch *= k4;
    g.strokeStyle = '#000'; g.lineWidth = sw;
    if (sw > 0.55 && iw > pitch * 3.9 && ih > pitch * 3.9) meander(g, -iw / 2, -ih / 2, iw, ih, sw, pitch, rnd, 0);
    // the inking of this impression
    const ink = rnd() < 0.2 ? rnd.range(0.54, 0.64) : rnd.range(0.72, 1);        // one in five is a tired second impression
    const tilt = rnd.range(0.1, 0.4), pa = rnd() * TAU, dx = Math.cos(pa) * w / 2, dy = Math.sin(pa) * h / 2;
    const pal = rnd() < 0.55 ? 0 : rnd() < 0.5 ? 128 : 255, sa = Math.floor(rnd() * 256);
    const col = (v) => `rgb(${Math.round(255 * v)},${pal},${sa})`;
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = L.linear(g, -dx, -dy, dx, dy, [[0, col(ink * (1 - tilt))], [1, col(ink)]]);
    g.fillRect(-W / 2 - 1, -H / 2 - 1, W + 2, H + 2);
  });
}

/**
 * All impressions at once, per device pixel. M: the sheet of seal faces (see sealSprite). Returns the paste layer:
 * uneven pressure, dry streaks, paper tooth, paste piled at the edges of the strokes, and the relief of the paste lit from the top-left.
 */
function pasteLayer(M, sw) {
  const U = sw / 75, rb = L.clamp(1.9 * U, 0.8, 2.1), fq = 1 / L.clamp(U, 0.5, 1);
  const raw = L.getRaw(M).data, soft = L.getRaw(L.blurred(M, rb)).data;
  const nz = vnoise('g03paste'), lowS = 1 / (sw * 0.36), BK = 1.75 * rb;
  const cs = new Float32Array(256), sn = new Float32Array(256);
  for (let i = 0; i < 256; i++) { cs[i] = Math.cos((i / 256) * Math.PI); sn[i] = Math.sin((i / 256) * Math.PI); }
  const Lx = -0.552, Ly = -0.652, Lz = 0.52, Hx = -0.317, Hy = -0.374, Hz = 0.872;        // light, and the half vector to a viewer overhead
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const Hf = new Float32Array(pw * ph), Gl = new Float32Array(pw * ph);
    for (let j = 0, k = 0, o = 0; j < ph; j++) for (let i = 0; i < pw; i++, k += 4, o++) {
      const a = raw[k + 3] / 255; if (a <= 0.004) continue;
      const x = (i + 0.5) / q, y = (j + 0.5) / q, sA = soft[k + 3] / 255, si = raw[k + 2];
      const low = nz(x * lowS, y * lowS) * 0.65 + nz(90 + x * lowS * 2.7, y * lowS * 2.7) * 0.35;
      const press = L.clamp(raw[k] / 255 + (low - 0.5) * 0.66);
      const u = (x * cs[si] + y * sn[si]) * fq, v = (-x * sn[si] + y * cs[si]) * fq;
      const fine = nz(x * 0.8 * fq, 7 + y * 0.8 * fq) * 0.6 + nz(31 + x * 0.34 * fq, y * 0.34 * fq) * 0.4;
      const streak = nz(200 + u * 0.1, v * 0.42) * 0.6 + nz(300 + u * 0.22, v * 0.9) * 0.4;
      const tooth = fine * 0.5 + streak * 0.5;
      const th = L.lerp(0.7, 0.17, press);
      const cover = L.smooth((tooth - th + 0.08) / 0.16);
      const rim = L.clamp((a - sA) * 2.4);                                      // inside the face and close to its edge
      const t = L.clamp(press * 0.75 + rim * 0.5 + (fine - 0.5) * 0.3) * cover;
      const pal = PASTES[raw[k + 1] < 64 ? 0 : raw[k + 1] < 192 ? 1 : 2], A = pal.light, B = pal.mid, C = pal.deep;
      if (t < 0.55) { const e = t / 0.55; d[k] = A[0] + (B[0] - A[0]) * e; d[k + 1] = A[1] + (B[1] - A[1]) * e; d[k + 2] = A[2] + (B[2] - A[2]) * e; }
      else { const e = (t - 0.55) / 0.45; d[k] = B[0] + (C[0] - B[0]) * e; d[k + 1] = B[1] + (C[1] - B[1]) * e; d[k + 2] = B[2] + (C[2] - B[2]) * e; }
      const al = a * L.clamp(cover * (0.8 + 0.2 * press) + 0.05 * press);
      d[k + 3] = 255 * al;
      Hf[o] = al * (0.22 + 0.78 * sA) * (0.7 + 0.3 * press) + (fine - 0.5) * 0.07 * al;   // thickness of the paste
      Gl[o] = 0.35 + 0.65 * press * (0.5 + fine * 0.5);                                   // thick paste is oily, thin paste is matt
    }
    for (let j = 1; j < ph - 1; j++) for (let i = 1, o = j * pw + 1, k = o * 4; i < pw - 1; i++, o++, k += 4) {
      if (!d[k + 3]) continue;
      const gx = (Hf[o + 1] - Hf[o - 1]) * 0.5 * q * BK, gy = (Hf[o + pw] - Hf[o - pw]) * 0.5 * q * BK;
      const il = 1 / Math.sqrt(gx * gx + gy * gy + 1), nx = -gx * il, ny = -gy * il;
      const lit = L.clamp(0.6 + 0.78 * (nx * Lx + ny * Ly + il * Lz), 0.5, 1.45);
      let sp = nx * Hx + ny * Hy + il * Hz; sp = sp > 0 ? sp ** 34 : 0;
      const hi = 255 * sp * 0.5 * Gl[o];
      d[k] = d[k] * lit + hi; d[k + 1] = d[k + 1] * lit + hi * 0.9; d[k + 2] = d[k + 2] * lit + hi * 0.8;
    }
  });
}

// ───────────────────────── layout ─────────────────────────
function inRect(s, x, y, pad = 0) {
  const dx = x - s.x, dy = y - s.y, c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
  return Math.abs(dx * c - dy * sn) <= s.w / 2 + pad && Math.abs(dx * sn + dy * c) <= s.h / 2 + pad;
}
/** how far the rectangle sticks out of the glyph (px; ≤ 0 when it is wholly inside the strokes) */
function worstSd(s) {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot); let worst = -1e9;
  for (let e = 0; e < 4; e++) for (let k = 0; k < 4; k++) {
    const t = (k / 4) * 2 - 1;
    const lx = (e === 0 ? t : e === 1 ? 1 : e === 2 ? -t : -1) * s.w / 2, ly = (e === 0 ? -1 : e === 1 ? t : e === 2 ? 1 : -t) * s.h / 2;
    const dd = K.sdGlyph(s.x + lx * c - ly * sn, s.y + lx * sn + ly * c); if (dd > worst) worst = dd;
  }
  return worst;
}
/** the share of the rectangle that lies on (or within `pad` px of) the other seals */
function overlap(s, list, pad = 0, self = null) {
  const reach = Math.hypot(s.w, s.h) / 2 + pad;
  const near = list.filter((o) => o !== self && Math.hypot(o.x - s.x, o.y - s.y) < reach + Math.hypot(o.w, o.h) / 2);
  if (!near.length) return 0;
  const c = Math.cos(s.rot), sn = Math.sin(s.rot); let hit = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const lx = (i / 5 - 0.5) * s.w, ly = (j / 5 - 0.5) * s.h, px = s.x + lx * c - ly * sn, py = s.y + lx * sn + ly * c;
    for (const o of near) if (inRect(o, px, py, pad)) { hit++; break; }
  }
  return hit / 36;
}

function plan(info) {
  const sw = info.strokeWidth, rnd = L.rng('g03plan' + info.key);
  const tol = L.clamp(sw * 0.045, 1.5, 3.4), gp = Math.max(0.9, sw * 0.026), pad = gp * 1.8, minSide = Math.max(6, sw * 0.18);
  // beads on the centre lines of the strokes, as wide as the stroke; smaller ones in what is left
  const discs = K.pack({ seed: 'g03', rmax: sw * 0.56, rmin: Math.max(5.5, sw * 0.17), gap: 1, margin: 0 });
  const adiff = (a, b) => { const dd = Math.abs(a - b) % Math.PI; return dd > Math.PI / 2 ? Math.PI - dd : dd; };
  const used = new Uint8Array(discs.length), boxes = [];
  // two neighbouring beads on one straight stretch of stroke make a 2 : 1 box (for the oblong seals)
  for (let i = 0; i < discs.length; i++) {
    const p = discs[i]; if (used[i] || p.r < sw * 0.3 || rnd() > 0.5) continue;
    for (let j = i + 1; j < discs.length; j++) {
      const q = discs[j]; if (used[j] || q.r < p.r * 0.8 || q.r > p.r * 1.25) continue;
      const dx = q.x - p.x, dy = q.y - p.y, dd = Math.hypot(dx, dy);
      if (dd > (p.r + q.r) * 1.1 || dd < (p.r + q.r) * 0.8) continue;
      const a = Math.atan2(dy, dx); if (adiff(a, p.ang) > 0.22 || adiff(a, q.ang) > 0.3) continue;
      const hl = (dd + p.r + q.r) / 2, ux = dx / dd, uy = dy / dd, b = Math.min(p.r, q.r);
      const bx = { x: p.x + ux * (hl - p.r), y: p.y + uy * (hl - p.r), a: hl, b, ang: a, pair: true };
      if (worstSd({ x: bx.x, y: bx.y, w: hl * 2, h: b * 2, rot: a }) > tol + 1) continue;
      boxes.push(bx); used[i] = used[j] = 1; break;
    }
  }
  discs.forEach((p, i) => { if (!used[i]) boxes.push({ x: p.x, y: p.y, a: p.r, b: p.r, ang: p.ang, pair: false }); });
  boxes.sort((p, q) => q.a * q.b - p.a * p.b);

  const out = [];
  const fits = (s, self) => worstSd(s) <= tol && overlap(s, out, pad, self) <= 0.03;
  const place = (bx, x0, x1, y0, y1, solo) => {                       // a seal on the part [x0, x1] × [y0, y1] of the box (x along the stroke)
    const c = Math.cos(bx.ang), sn = Math.sin(bx.ang), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const s = { x: bx.x + mx * c - my * sn, y: bx.y + mx * sn + my * c, w: x1 - x0, h: y1 - y0, rot: bx.ang, solo, done: 0 };
    for (let k = 0; k < 12 && Math.min(s.w, s.h) >= minSide; k++) {   // shrink until it is inside the stroke and clear of its neighbours
      if (fits(s, null)) { out.push(s); return; }
      s.w *= 0.95; s.h *= 0.95;
    }
  };
  // push the four sides of a seal outward, a little at a time, until the stroke's edge or a neighbour stops each of them
  const grow = (list, rounds) => {
    const d = Math.max(0.8, sw * 0.02);
    for (let n = 0; n < rounds; n++) {
      let any = false;
      for (const s of list) for (let side = 0; side < 4; side++) {
        if (s.done & (1 << side)) continue;
        const along = side < 2, nw = s.w + (along ? d : 0), nh = s.h + (along ? 0 : d);
        if ((along ? nw > nh * 2.2 : nh > nw * 2.2) || Math.max(nw, nh) > sw * 2.3) { s.done |= 1 << side; continue; }
        const sg = side % 2 ? -0.5 : 0.5, c = Math.cos(s.rot), sn = Math.sin(s.rot);
        const t = { x: s.x + (along ? c : -sn) * d * sg, y: s.y + (along ? sn : c) * d * sg, w: nw, h: nh, rot: s.rot };
        if (fits(t, s)) { s.x = t.x; s.y = t.y; s.w = nw; s.h = nh; any = true; } else s.done |= 1 << side;
      }
      if (!any) break;
    }
  };
  for (const bx of boxes) {
    const A = bx.a - gp, B = bx.b - 0.5, big = bx.b > sw * 0.3, k = rnd();
    if (bx.pair) {
      if (k < 0.3) place(bx, -A, A, -B, B, false);                                                         // a long 2 : 1 seal
      else { const cut = -A + 2 * A * rnd.range(0.36, 0.64); place(bx, -A, cut - gp, -B, B, false); place(bx, cut + gp, A, -B, B, false); }
    } else if (big && k < 0.15) {                                      // two narrow seals side by side, long sides along the stroke
      const cut = -B + 2 * B * rnd.range(0.42, 0.58); place(bx, -A, A, -B, cut - gp, false); place(bx, -A, A, cut + gp, B, false);
    } else if (big && k < 0.28) {                                      // two oblong seals across the stroke
      const cut = -A + 2 * A * rnd.range(0.42, 0.58); place(bx, -A, cut - gp, -B, B, false); place(bx, cut + gp, A, -B, B, false);
    } else place(bx, -A, A, -B, B, true);
  }
  grow(out, 40);
  // whatever part of the strokes is still bare gets a seal of its own, started small and grown to fit the hole
  const step = Math.max(3, sw * 0.1), bb = info.bbox, cands = [];
  for (let y = bb.y0; y <= bb.y1; y += step) for (let x = bb.x0; x <= bb.x1; x += step) {
    const dd = -K.sdGlyph(x, y); if (dd >= minSide * 0.5 - tol * 0.5) cands.push({ x, y, d: dd, k: rnd() });
  }
  cands.sort((p, q) => (q.d - p.d) || (p.k - q.k));
  for (const p of cands) {
    if (out.some((o) => inRect(o, p.x, p.y, minSide * 0.5 + pad * 0.5))) continue;
    const s = { x: p.x, y: p.y, w: minSide, h: minSide, rot: K.strokeAngle(p.x, p.y, Math.max(16, sw * 0.6)), solo: false, done: 0 };
    if (!fits(s, null)) continue;
    out.push(s); grow([s], 60);
  }
  for (const s of out) { s.rot += rnd.range(-0.03, 0.03); const k = rnd.range(0.975, 1); s.w *= k; s.h *= k; }   // stamped by hand
  // a few of the stones stay on the sheet, well apart from each other
  const stones = [], want = info.chars.length === 1 ? 5 : 6;
  const cand = out.filter((s) => Math.min(s.w, s.h) >= sw * 0.62 && Math.max(s.w, s.h) <= Math.min(s.w, s.h) * 1.25);
  cand.forEach((s) => { s.k = rnd(); }); cand.sort((p, q) => p.k - q.k);
  for (const s of cand) {
    if (stones.length >= want) break;
    if (stones.every((o) => Math.hypot(o.x - s.x, o.y - s.y) > sw * 3)) { s.stone = true; stones.push(s); }
  }
  return { seals: out.filter((s) => !s.stone), stones };
}

// ───────────────────────── the stone seals standing on the sheet ─────────────────────────
const STONES = [
  { base: '#8f4f20', lite: '#d8a05a', dark: '#44200b', vein: '#f2cf92' },   // 寿山 amber
  { base: '#3a4a3c', lite: '#86a184', dark: '#151d17', vein: '#b4c8ac' },   // 青田, dark celadon
  { base: '#6f231b', lite: '#c0583f', dark: '#300d09', vein: '#e3b79c' },   // 鸡血 ground
  { base: '#2f2a27', lite: '#7b6f64', dark: '#0f0c0b', vein: '#a39484' },   // 墨晶
  { base: '#6f5626', lite: '#c6a95e', dark: '#2e220c', vein: '#ead596' },   // 田黄, deep
];
const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
function stoneGeom(s) {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot), hw = s.w * 0.46, hh = s.h * 0.46;
  const kx = (s.x - S / 2) * PERSP * 0.5, ky = (s.y - S / 2) * PERSP * 0.5;        // the foot goes half this way inward, the top half outward
  const quad = (a, b, ox, oy) => [[-a, -b], [a, -b], [a, b], [-a, b]].map(([lx, ly]) => [s.x + lx * c - ly * sn + ox, s.y + lx * sn + ly * c + oy]);
  return { quad, kx, ky, hw, hh, m: Math.min(hw, hh) * 2 };
}
function stoneShadow(ga, gb, s) {
  const G = stoneGeom(s), base = G.quad(G.hw, G.hh, -G.kx, -G.ky), m = G.m;
  const sx = -LIGHT[0] * m * 0.34, sy = -LIGHT[1] * m * 0.34;
  ga.fillStyle = 'rgb(54,33,20)';                                       // the cast shadow: the foot swept away from the light
  for (let t = 0; t <= 1.001; t += 0.125) { poly(ga, base.map(([x, y]) => [x + sx * t, y + sy * t])); ga.fill(); }
  gb.fillStyle = gb.strokeStyle = 'rgb(26,13,7)'; gb.lineWidth = m * 0.05; gb.lineJoin = 'round';   // the contact shadow, tight under the foot
  poly(gb, base.map(([x, y]) => [x + m * 0.028, y + m * 0.036])); gb.fill(); gb.stroke();
}
function drawStone(g, s, seed, kind) {
  const r = L.rng(seed), P = STONES[kind % STONES.length], G = stoneGeom(s), m = G.m;
  const base = G.quad(G.hw, G.hh, -G.kx, -G.ky), top = G.quad(G.hw, G.hh, G.kx, G.ky), cx = s.x + G.kx, cy = s.y + G.ky;
  // outward normals of the four edges (the quad runs clockwise on a y-down page)
  const N = top.map((p, i) => { const q = top[(i + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
  const ndl = N.map((n) => n[0] * LIGHT[0] + n[1] * LIGHT[1]);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // the side walls that face the camera
  for (let i = 0; i < 4; i++) {
    if (N[i][0] * G.kx + N[i][1] * G.ky >= 0) continue;
    const j = (i + 1) % 4, lit = L.clamp(0.5 + 0.5 * ndl[i]);
    const c0 = L.mix(P.dark, P.lite, 0.06 + 0.66 * lit * lit), c1 = L.mix(c0, '#0a0503', 0.5);
    const ax = (top[i][0] + top[j][0]) / 2, ay = (top[i][1] + top[j][1]) / 2;
    g.fillStyle = L.linear(g, ax, ay, ax - 2 * G.kx, ay - 2 * G.ky, [[0, c0], [1, c1]]);
    poly(g, [top[i], top[j], base[j], base[i]]); g.fill();
  }
  // the top face: polished stone, brighter toward the light
  poly(g, top);
  g.fillStyle = L.linear(g, cx + LIGHT[0] * m * 0.9, cy + LIGHT[1] * m * 0.9, cx - LIGHT[0] * m * 0.9, cy - LIGHT[1] * m * 0.9, [[0, L.mix(P.base, P.lite, 0.55)], [0.5, P.base], [1, L.mix(P.base, P.dark, 0.5)]]);
  g.fill();
  g.save(); poly(g, top); g.clip();
  const a0 = r() * TAU;                                                 // flow bands and veins, all roughly one way
  for (let i = 0, n = r.int(5, 8); i < n; i++) {
    const a = a0 + r.range(-0.3, 0.3), off = r.range(-0.55, 0.55) * m, len = m * 1.3, bend = r.range(-0.4, 0.4) * m;
    const ux = Math.cos(a), uy = Math.sin(a), ox = cx - uy * off, oy = cy + ux * off, wide = r() < 0.55, col = r() < 0.6 ? P.vein : P.dark;
    for (let k = 0; k < (wide ? 3 : 1); k++) {
      g.strokeStyle = L.rgba(col, wide ? r.range(0.05, 0.11) : r.range(0.2, 0.38));
      g.lineWidth = wide ? m * r.range(0.07, 0.2) * (1 - k * 0.28) : Math.max(0.5, m * r.range(0.008, 0.016));
      g.beginPath(); g.moveTo(ox - ux * len, oy - uy * len); g.quadraticCurveTo(ox - uy * bend, oy + ux * bend, ox + ux * len, oy + uy * len); g.stroke();
    }
  }
  g.restore();
  // the chamfer round the top (a low one, or the four slopes of a 覆斗 top)
  const bw = m * (r() < 0.3 ? r.range(0.16, 0.22) : r.range(0.075, 0.105));
  const inn = G.quad(G.hw - bw, G.hh - bw, G.kx * 1.12, G.ky * 1.12);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, e = ndl[i];
    const mxo = (top[i][0] + top[j][0]) / 2, myo = (top[i][1] + top[j][1]) / 2, mxi = (inn[i][0] + inn[j][0]) / 2, myi = (inn[i][1] + inn[j][1]) / 2;
    const c0 = e > 0 ? `rgba(255,238,206,${(0.08 + 0.3 * e).toFixed(3)})` : `rgba(12,5,0,${(0.2 + 0.46 * -e).toFixed(3)})`;
    const c1 = e > 0 ? `rgba(255,238,206,${(0.16 + 0.46 * e).toFixed(3)})` : `rgba(12,5,0,${(0.1 + 0.36 * -e).toFixed(3)})`;
    g.fillStyle = L.linear(g, mxo, myo, mxi, myi, [[0, c0], [1, c1]]);
    poly(g, [top[i], top[j], inn[j], inn[i]]); g.fill();
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, e = ndl[i];
    g.lineWidth = Math.max(0.6, m * 0.008); g.strokeStyle = 'rgba(255,244,224,0.2)';                // the arris at each corner
    g.beginPath(); g.moveTo(top[i][0], top[i][1]); g.lineTo(inn[i][0], inn[i][1]); g.stroke();
    g.lineWidth = Math.max(0.7, m * 0.013);                                                        // the ridge where the slope meets the flat
    g.strokeStyle = e > 0 ? `rgba(255,251,238,${(0.3 + 0.55 * e).toFixed(3)})` : `rgba(0,0,0,${(0.12 + 0.25 * -e).toFixed(3)})`;
    g.beginPath(); g.moveTo(inn[i][0], inn[i][1]); g.lineTo(inn[j][0], inn[j][1]); g.stroke();
  }
  // the polish on the flat: a soft sheen, a highlight with a bright core, hairline scratches
  g.save(); poly(g, inn); g.clip();
  g.fillStyle = L.linear(g, cx + LIGHT[0] * m * 0.75, cy + LIGHT[1] * m * 0.75, cx - LIGHT[0] * m * 0.3, cy - LIGHT[1] * m * 0.3, [[0, 'rgba(255,248,232,0.32)'], [0.55, 'rgba(255,248,232,0.05)'], [1, 'rgba(255,248,232,0)']]);
  g.fillRect(cx - m, cy - m, 2 * m, 2 * m);
  for (let i = 0, n = r.int(5, 9); i < n; i++) {
    const x = cx + r.range(-0.5, 0.5) * m, y = cy + r.range(-0.5, 0.5) * m, a = r() * TAU, len = m * r.range(0.08, 0.4);
    g.strokeStyle = `rgba(255,246,228,${r.range(0.08, 0.2).toFixed(3)})`; g.lineWidth = Math.max(0.4, m * r.range(0.005, 0.009));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  const im = m - 2 * bw, hk = r.range(0.17, 0.27), hr = im * r.range(0.3, 0.42);
  g.translate(cx + G.kx * 0.12 + LIGHT[0] * im * hk, cy + G.ky * 0.12 + LIGHT[1] * im * hk); g.rotate(-0.72 + r.range(-0.25, 0.25)); g.scale(1, r.range(0.34, 0.5));
  g.fillStyle = L.radial(g, 0, 0, 0, hr, [[0, 'rgba(255,255,250,0.96)'], [0.09, 'rgba(255,253,242,0.82)'], [0.3, 'rgba(255,244,222,0.26)'], [1, 'rgba(255,240,210,0)']]);
  g.fillRect(-hr, -hr, 2 * hr, 2 * hr);
  g.restore();
  g.strokeStyle = 'rgba(20,8,2,0.4)'; g.lineWidth = Math.max(0.5, m * 0.007); poly(g, top); g.stroke();
  g.restore();
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, U = sw / 75;
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
  // cloud-dragon fibres of the xuan sheet: each a pale thread with its own thin shadow, so the sheet has a nap
  g.lineCap = 'round';
  for (let i = 0; i < 170; i++) {
    const x = r() * S, y = r() * S, len = r.range(18, 70), a = r() * TAU, b = a + r.range(-0.9, 0.9), lw = r.range(0.6, 1.4), pale = r() < 0.6;
    const thread = (ox, oy, style) => {
      g.strokeStyle = style; g.lineWidth = lw;
      g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + Math.cos(b) * len * 0.5, y + oy + Math.sin(b) * len * 0.5, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); g.stroke();
    };
    if (pale) thread(0.6, 0.8, L.rgba('#6f5c36', r.range(0.05, 0.11)));
    thread(0, 0, L.rgba(pale ? '#fffdf6' : '#a38f63', r.range(0.08, 0.22)));
  }

  const { seals, stones } = plan(info);
  seals.sort((p, q) => p.w * p.h - q.w * q.h);                         // small ones first, the big ones are pressed over them
  // the faces of all the seals go onto one sheet, then the paste is worked out for the whole sheet at once
  const M = L.makeCanvas(S, S), q = M.getContext('2d');
  seals.forEach((s, i) => K.stamp(q, sealSprite(s.w, s.h, 'g03seal' + info.key + i), s.x, s.y, { rot: s.rot, shadow: false }));
  const ink = pasteLayer(M, sw);
  // oil from the paste creeping a little way into the paper round every stroke
  g.save(); g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.4; g.drawImage(L.blurred(ink, 5 * Math.max(U, 0.5)), 0, 0);
  g.globalAlpha = 0.3; g.drawImage(L.blurred(ink, 1.2), 0, 0);
  g.restore();
  // the paste itself, standing a hair above the sheet
  g.save(); g.globalAlpha = 0.97;
  g.shadowColor = 'rgba(88,22,10,0.5)'; g.shadowBlur = 1.1; g.shadowOffsetX = 0.55; g.shadowOffsetY = 0.75;
  g.drawImage(ink, 0, 0);
  g.restore();

  // the stones left standing: cast shadows, contact shadows, then the stones themselves
  if (stones.length) {
    const sa = L.makeCanvas(S, S), sb = L.makeCanvas(S, S), ga = sa.getContext('2d'), gb = sb.getContext('2d');
    stones.forEach((s) => stoneShadow(ga, gb, s));
    g.save(); g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.5; g.drawImage(L.blurred(sa, Math.max(1.2, sw * 0.07)), 0, 0);
    g.globalAlpha = 0.34; g.drawImage(L.blurred(sa, Math.max(0.8, sw * 0.022)), 0, 0);
    g.globalAlpha = 0.62; g.drawImage(L.blurred(sb, Math.max(0.7, sw * 0.03)), 0, 0);
    g.restore();
    const k0 = L.rng('g03kinds' + info.key).int(0, STONES.length - 1);          // no two neighbours of the same stone
    stones.forEach((s, i) => drawStone(g, s, 'g03stone' + info.key + i, k0 + i * 2));
  }
  // the light falls off gently toward the bottom-right corner of the sheet
  g.save(); g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(120,96,60,0)'], [0.55, 'rgba(120,96,60,0.02)'], [1, 'rgba(120,96,60,0.13)']]);
  g.fillRect(0, 0, S, S); g.restore();
  return c;
}

export default {
  name: '朱印',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
