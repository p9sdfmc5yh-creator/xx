// s14 — 虹桥 · 画心微距. A macro photograph of a Song handscroll (the manner of《清明上河图》), ink and mineral colour on silk.
// The lens is pushed right up to the crown of the pier-less timber "rainbow bridge": the arc is the top edge of the
// balustrade's hand rail — one heavy brush line. Above it, on bare ivory silk, only two big figures cross the bridge:
// a porter with a shoulder pole and a scholar on a grey donkey (each ≈ 600 px tall, drawn with nail-head brush lines and
// flat washes). Below it: the rails and posts with the walkers' legs showing between them, the deck-edge board, the woven
// arch (编木拱 — straight logs of two interleaved systems, rope-lashed, round cross-beam heads; never one bent beam)
// and a sliver of 花青 river with a few bold ripple lines.
// Three paint sheets (bridge / figures / balustrade) get pigment pooling, wear on the thread crowns, a lit plain-weave,
// roll creases and a shallow depth of field baked in, then are blit with a slow rot; the walkers drift a few px further.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 110;
const LW = W + PAD * 2, LH = H + PAD * 2;
let S = null;

const K = 5.6;        // px per figure unit (a standing man = 100 units)
const RH = 148;       // height of the balustrade; the TOP edge of its hand rail is the arc
const HR = 42;        // depth of the hand rail

const C = {
  silk: '#ecdfba',
  ink: '#241710', inkSoft: '#4a392b',
  ochre: '#a6653a', ochrePale: '#c8935c', ochreDark: '#784a2a',
  wood: '#8d775b', woodBack: '#655543', board: '#6c482f', gap: '#35261c',
  deck: '#c5a16a',
  blue: '#2c659a', cyan: '#5b98ad', cyanDeep: '#2a5f78', cyanPale: '#9cc4ca', waterInk: '#1d4354',
  red: '#cf432a', persimmon: '#dc5a2c',
  white: '#fbf7ec', offwhite: '#ece5d2', flesh: '#edcba2', straw: '#d9bb72', bamboo: '#c5a05a', rope: '#bfa066',
  donkey: '#7b746d', donkeyDark: '#544d49',
};

// ───────────────────────── geometry helpers ─────────────────────────
/** Catmull-Rom resample that keeps the control-point parameter: [[x, y, t]…], t = segment index + fraction */
function spline(pts, step = 3, closed = false) {
  const m = pts.length, out = [];
  const P = (i) => (closed ? pts[((i % m) + m) % m] : pts[Math.max(0, Math.min(m - 1, i))]);
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        i + t,
      ]);
    }
  }
  if (!closed) out.push([pts[m - 1][0], pts[m - 1][1], m - 1]);
  return out;
}
/** a tapered ribbon around a polyline: widths per control point (or [start, end]) → two edges + closed polygon */
function ribbon(pts, widths, step) {
  const sp = spline(pts, step), n = sp.length, A = [], B = [];
  const two = widths.length === 2 && pts.length !== 2;
  const wAt = (t) => {
    if (two) return L.lerp(widths[0], widths[1], t / (pts.length - 1));
    const i = Math.min(widths.length - 2, Math.floor(t));
    return L.lerp(widths[i], widths[i + 1], t - i);
  };
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const mm = Math.hypot(nx, ny) || 1; nx /= mm; ny /= mm;
    const hw = wAt(sp[i][2]) / 2;
    A.push([sp[i][0] + nx * hw, sp[i][1] + ny * hw]); B.push([sp[i][0] - nx * hw, sp[i][1] - ny * hw]);
  }
  return { A, B, poly: A.concat(B.slice().reverse()) };
}
const ell = (cx, cy, rx, ry, n = 20, rot = 0) => {
  const o = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const t = (i / n) * L.TAU, x = Math.cos(t) * rx, y = Math.sin(t) * ry; o.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return o;
};
const loop = (pts) => pts.concat([pts[0]]);

// ───────────────────────── the brush ─────────────────────────
const BN = L.makeNoise('s14brush');
/**
 * One loaded-brush line in the 钉头鼠尾 manner: it lands with a small nail-head, runs on with breathing pressure,
 * thins toward the lift and leaves a tail. `ends: [0|1, 0|1]` — 0 = a blunt end (structural lines that run off the sheet).
 * w is in the caller's units; k = px per unit (so the noise and the ragged edge stay in pixels whatever the transform).
 */
function brush(g, pts, w, o = {}) {
  const { k = 1, color = C.ink, alpha = 0.96, seed = 1, head = 0.32, tail = 0.35, wob = 0.14, step = 3, ends = [1, 1] } = o;
  const sp = L.smoothPath(pts, step / k), n = sp.length; if (n < 2) return;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]);
  const len = cum[n - 1] || 1e-3;
  const lin = Math.min(len * 0.35, w * 0.9), lout = Math.min(len * 0.45, w * (1.6 + 4.5 * tail));
  const sn = (seed % 977) * 0.731 + 3.1;
  const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const s = cum[i], spx = s * k;
    let kk = 1;
    if (ends[1]) kk -= tail * 0.5 * L.smooth(s / len);
    if (ends[0]) { const t = s / lin; if (t < 1) kk *= 0.5 + 0.5 * Math.sin((t * Math.PI) / 2); kk *= 1 + head * Math.exp(-(((s - lin * 1.15) / (w * 1.15)) ** 2)); }
    if (ends[1]) { const t = (len - s) / lout; if (t < 1) kk *= 0.1 + 0.9 * Math.pow(Math.max(0, t), 0.75); }
    kk *= 1 + wob * BN.n2(spx / 70 + sn, sn * 1.7) + wob * 0.4 * BN.n2(spx / 13, sn + 40);
    const hw = Math.max(0.3 / k, (w * kk) / 2);
    const e1 = (0.55 / k) * BN.n2(spx / 3.7, sn + 7), e2 = (0.55 / k) * BN.n2(spx / 4.1, sn + 19);
    A.push([sp[i][0] + nx * (hw + e1), sp[i][1] + ny * (hw + e1)]);
    B.push([sp[i][0] - nx * (hw + e2), sp[i][1] - ny * (hw + e2)]);
  }
  g.save(); g.globalAlpha *= alpha; g.fillStyle = color;
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
  if (ends[0]) { g.beginPath(); g.arc(sp[0][0], sp[0][1], Math.hypot(A[0][0] - B[0][0], A[0][1] - B[0][1]) / 2, 0, L.TAU); g.fill(); }
  g.restore();
}

// ───────────────────────── the painter: flat wash + ink line on two sheets ─────────────────────────
/**
 * Every shape is an opaque wash plus brush lines on a separate ink sheet. A later wash knocks out the ink underneath it,
 * so things painted later properly hide what is behind them. Each wash gets a darker rim just inside its edge — pigment
 * pools where a wet wash stops.
 */
function makePen(seed0) {
  const wash = L.makeLayer(PAD), ink = L.makeLayer(PAD);
  const gw = wash.getContext('2d'), gi = ink.getContext('2d');
  let n = 0;
  const trace = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
  const pen = {
    wash, ink, gw, gi, k: 1, lw: 1,
    /** run fn inside a local transform; k = the transform's scale */
    scope(setup, k, fn) { gw.save(); gi.save(); const k0 = pen.k; setup(gw); setup(gi); pen.k = k0 * k; fn(); pen.k = k0; gw.restore(); gi.restore(); },
    clip(path, fn) { gw.save(); gi.save(); path(gw); gw.clip(); path(gi); gi.clip(); fn(); gw.restore(); gi.restore(); },
    /** wash. path = [[x,y]…] or (ctx) => {…build path…}; a = pigment strength over the silk; o.rim = strength of the pooled edge (0 = none) */
    fill(path, color, a = 1, o = {}) {
      let p = path;
      if (typeof path !== 'function') { const pts = o.smooth ? spline(path, 2.5 / pen.k, true) : path; p = (g) => trace(g, pts); }
      gi.save(); gi.globalCompositeOperation = 'destination-out'; gi.fillStyle = '#000'; p(gi); gi.fill(); gi.restore();
      const col = o.style || (a >= 1 ? color : L.mix(C.silk, color, a));
      gw.fillStyle = col; p(gw); gw.fill();
      if (o.rim !== 0 && !o.style) {
        const rc = L.mix(col, C.ink, 0.55), rs = o.rim === undefined ? 0.22 : o.rim;
        gw.save(); p(gw); gw.clip(); gw.lineJoin = 'round';
        // 分染: the wash is laid on heavier toward the lower right of every shape (the light comes from the upper left)
        gw.strokeStyle = L.rgba(rc, rs * 0.42); gw.lineWidth = 36 / pen.k;
        gw.save(); gw.translate(5 / pen.k, 7 / pen.k); p(gw); gw.restore(); gw.stroke();
        gw.strokeStyle = L.rgba(rc, rs * 0.5); gw.lineWidth = 16 / pen.k;
        gw.save(); gw.translate(2 / pen.k, 3 / pen.k); p(gw); gw.restore(); gw.stroke();
        gw.strokeStyle = L.rgba(rc, rs); gw.lineWidth = 6 / pen.k; p(gw); gw.stroke();
        gw.restore();
      }
    },
    /** a second, translucent glaze over an existing wash — does not disturb the ink */
    tint(path, style) {
      const p = typeof path === 'function' ? path : (g) => trace(g, path);
      gw.fillStyle = style; p(gw); gw.fill();
    },
    /** brush line (w in local units) */
    line(pts, w = 1, o = {}) { brush(gi, pts, w * pen.lw, { k: pen.k, seed: seed0 + (n++), ...o }); },
    /** tapered limb / pole: wash + an ink line down each side */
    tube(pts, widths, color, a = 1, lw = 1, o = {}) {
      const t = ribbon(pts, widths, 2.5 / pen.k);
      pen.fill(t.poly, color, a, { rim: o.rim });
      if (lw > 0) { pen.line(t.A, lw, { ends: [0, 0], ...o }); pen.line(t.B, lw, { ends: [0, 0], ...o }); }
      return t;
    },
  };
  return pen;
}

// ───────────────────────── the woven arch ─────────────────────────
function ribGeom(a) {
  const TL = 78, DB = 94, FAS = 62;                 // log thickness, cross-beam diameter, depth of the deck-edge board
  const TOP = -(RH + FAS);                          // underside of the edge board
  const DRC = TOP - 5 - DB / 2;                     // centre of the cross-beams = centreline of the log ends
  const SAG = TL / 2 + DB / 2;                      // a straight log must dip this far to pass under the next cross-beam
  const DEL = Math.acos(1 - SAG / (a.R + DRC));     // → angular spacing of the joints
  const PH = 0.36 * DEL;                            // no joint on the centreline: nothing in this picture is symmetrical
  /** dr of the centreline of the log whose middle sits at joint j (it spans joints j-1 … j+1) */
  const chord = (th, j) => ((a.R + DRC) * Math.cos(DEL)) / Math.cos(th - PH - j * DEL) - a.R;
  const pair = (th) => { const j = Math.floor((th - PH) / DEL); return [chord(th, j), chord(th, j + 1)]; };
  const lowDr = (th) => { const p = pair(th); return Math.min(p[0], p[1]) - TL / 2; };
  const upDr = (th) => { const p = pair(th); return Math.max(p[0], p[1]) + TL / 2; };
  return { TL, DB, FAS, TOP, DRC, SAG, DEL, PH, chord, lowDr, upDr };
}

function paintBack(env, pen) {
  const a = env.arc, R = a.R;
  const sp = a.span(PAD + 320);
  const Pt = (th, dr) => { const q = a.pt(th, dr); return [q.x, q.y]; };
  const r = L.rng('s14back');
  const G = ribGeom(a);
  const { gw } = pen;
  const band = (d0, d1) => (c) => a.pathBand(c, d0, d1, -sp, sp);

  // ── river: 花青, deepest in the shade of the arch
  const below = (dr) => (c) => {
    c.beginPath();
    for (let i = 0; i <= 80; i++) { const p = Pt(L.lerp(-sp, sp, i / 80), dr); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
    c.lineTo(W + PAD + 500, H + PAD + 80); c.lineTo(-PAD - 500, H + PAD + 80); c.closePath();
  };
  pen.fill(below(G.TOP - 30), null, 1, { style: L.radial(gw, a.cx, a.cy, R - 600, R - 370, [[0, C.cyanPale], [0.4, C.cyan], [0.8, L.mix(C.cyan, C.cyanDeep, 0.7)], [1, C.cyanDeep]]) });
  // ripples: a few long, level brush lines that swell and thin
  for (let y = a.crestY + 428; y < H + PAD; y += r.range(46, 62)) {
    let x = -PAD - r.range(0, 300);
    while (x < W + PAD) {
      const len = r.range(380, 820), amp = r.range(5, 10), wl = r.range(210, 330), ph = r.range(0, L.TAU), tilt = r.range(-8, 8);
      const pts = [];
      for (let u = 0; u <= len; u += 24) pts.push([x + u, y + amp * Math.sin(ph + (u / wl) * L.TAU) + (u / len - 0.5) * tilt]);
      pen.line(pts, r.range(7, 11), { color: C.waterInk, alpha: r.range(0.55, 0.8), tail: 0.6, head: 0.1, step: 6 });
      x += len + r.range(140, 420);
    }
  }

  // ── bridge silhouette: everything between the edge board and the underside of the lowest logs (dark gaps between timbers)
  const NS = 280;
  pen.fill((c) => {
    c.beginPath();
    for (let i = 0; i <= NS; i++) { const p = Pt(L.lerp(-sp, sp, i / NS), G.TOP + 4); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
    for (let i = NS; i >= 0; i--) { const th = L.lerp(-sp, sp, i / NS); const p = Pt(th, G.lowDr(th) + 1); c.lineTo(p[0], p[1]); }
    c.closePath();
  }, C.gap, 1, { rim: 0 });

  // ── the logs: system B (odd joints) lies behind system A (even joints)
  const jmax = Math.ceil(sp / G.DEL) + 2;
  const h = G.TL / 2;
  const drawLog = (j) => {
    const front = j % 2 === 0;
    const A = Pt(G.PH + (j - 1) * G.DEL, G.DRC), B = Pt(G.PH + (j + 1) * G.DEL, G.DRC);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len, nx = -uy, ny = ux;
    const q = (t, o) => [A[0] + ux * t + nx * o, A[1] + uy * t + ny * o];      // t along the log, o across (+ = toward the water)
    const run = (o, t0 = 14, t1 = len - 14, jit = 1.6) => { const pts = []; const n = Math.round((t1 - t0) / 120); for (let i = 0; i <= n; i++) pts.push(q(L.lerp(t0, t1, i / n), o + r.range(-jit, jit))); return pts; };
    const col = front ? L.mix(C.wood, C.ochrePale, r.range(0, 0.22)) : L.mix(C.woodBack, C.wood, r.range(0, 0.25));
    pen.fill([q(14, -h), q(len - 14, -h), q(len - 14, h), q(14, h)], col, 1, { rim: 0.12 });
    // roundness: a paler crown, a darker belly
    pen.tint([q(14, -h + 6), q(len - 14, -h + 6), q(len - 14, -h * 0.3), q(14, -h * 0.3)], L.rgba(C.silk, front ? 0.2 : 0.1));
    pen.tint([q(14, h * 0.3), q(len - 14, h * 0.3), q(len - 14, h), q(14, h)], L.rgba(C.ink, 0.22));
    // grain: a few long dragged strokes
    for (let i = 0; i < 3; i++) {
      const o = r.range(-h * 0.66, h * 0.66); let t = r.range(30, 260);
      while (t < len - 160) {
        const l = r.range(160, 520), t1 = Math.min(len - 24, t + l);
        pen.line([q(t, o), q((t + t1) / 2, o + r.range(-4, 4)), q(t1, o + r.range(-3, 3))], r.range(2.4, 4.2), { alpha: r.range(0.3, 0.55), tail: 0.7, head: 0 });
        t += l + r.range(80, 380);
      }
    }
    // one knot
    if (r.chance(0.7)) {
      const c = q(r.range(120, len - 120), r.range(-h * 0.3, h * 0.3)), ang = Math.atan2(uy, ux);
      pen.line(loop(ell(c[0], c[1], r.range(13, 19), r.range(6, 9), 12, ang)), 3, { alpha: 0.55 });
      pen.fill(ell(c[0], c[1], 3.4, 2.6, 8, ang), C.ink, 0.8, { rim: 0 });
    }
    pen.line(run(-h), 7.5, { ends: [0, 0] });
    pen.line(run(h), 9, { ends: [0, 0] });
  };
  for (let j = -jmax; j <= jmax; j++) if (j % 2 !== 0) drawLog(j);
  for (let j = -jmax; j <= jmax; j++) if (j % 2 === 0) drawLog(j);

  // ── rope lashings: beside every cross-beam and where the two systems cross
  const rr = R + G.DRC;
  const lash = (th0, wraps, pitch) => {
    const wpts = (th) => { const t = Pt(th, G.upDr(th) + 5), b = Pt(th, G.lowDr(th) - 5); return [t, [(t[0] + b[0]) / 2 + 5, (t[1] + b[1]) / 2], b]; };
    const e0 = wpts(th0 - (pitch * 0.62) / rr), e1 = wpts(th0 + ((wraps - 1) * pitch + pitch * 0.62) / rr);
    pen.fill([e0[0], e1[0], e1[2], e0[2]], C.rope, 1, { rim: 0.3 });
    for (let m = -0.5; m < wraps; m++) pen.line(wpts(th0 + ((m + 0.1 + r.range(-0.08, 0.08)) * pitch) / rr), 4.6, { ends: [0, 0], alpha: 0.94 });
    for (let m = 0; m < wraps; m++) { const t = wpts(th0 + ((m - 0.25) * pitch) / rr), b = wpts(th0 + ((m + 0.35) * pitch) / rr); pen.line([t[0], b[1]], 2, { alpha: 0.45 }); pen.line([t[1], b[2]], 2, { alpha: 0.45 }); }
  };
  for (let j = -jmax; j <= jmax; j++) {
    const th = G.PH + j * G.DEL, off = (G.DB / 2 + 26) / rr;
    lash(th + off, 3, 18);
    lash(th - off - 38 / rr, 3, 18);
  }

  // ── cross-beam ends (横木): round log heads with growth rings
  for (let j = -jmax; j <= jmax; j++) {
    const c = Pt(G.PH + j * G.DEL, G.DRC), rad = G.DB / 2 * r.range(0.94, 1.04);
    const head = ell(c[0], c[1], rad, rad * r.range(0.95, 1), 14, r.range(0, 3)).map((p) => [p[0] + r.range(-1.6, 1.6), p[1] + r.range(-1.6, 1.6)]);
    pen.fill(head, L.mix(C.ochrePale, C.wood, 0.35), 1, { smooth: true, rim: 0.35 });
    pen.tint((g) => { g.beginPath(); g.arc(c[0], c[1], rad, 0, L.TAU); g.arc(c[0] - 9, c[1] - 11, rad * 0.9, 0, L.TAU, true); }, L.rgba(C.ink, 0.24));
    pen.line(loop(spline(head, 6, true).map((p) => [p[0], p[1]])), 8, { ends: [0, 0], step: 5 });
    pen.line(loop(ell(c[0] + 1.5, c[1] + 1, rad * 0.63, rad * 0.6, 14, r.range(0, 6))), 3, { alpha: 0.6, tail: 0.6 });
    pen.line(loop(ell(c[0] + 2.4, c[1] + 1.6, rad * 0.32, rad * 0.3, 10, r.range(0, 6))), 2.6, { alpha: 0.55, tail: 0.6 });
    pen.fill(ell(c[0] + 2.6, c[1] + 2, 4, 3.6, 8), C.ink, 0.85, { rim: 0 });
    const ca = r.range(0, L.TAU);
    pen.line([[c[0] + Math.cos(ca) * 9, c[1] + Math.sin(ca) * 9], [c[0] + Math.cos(ca + 0.15) * (rad - 6), c[1] + Math.sin(ca + 0.15) * (rad - 6)]], 2.8, { alpha: 0.7 });
  }
  // shade thrown by the edge board onto the timbers
  pen.tint(band(G.TOP + 2, G.TOP - 20), L.rgba(C.ink, 0.3));

  // ── the deck between the rails: trodden earth, a flat ochre wash
  pen.fill(band(2, -RH - 2), C.deck, 1, { rim: 0 });
  for (let i = 0; i < 26; i++) {
    const th = r.range(-sp, sp), d = -r.range(HR + 12, RH - 12), l = r.range(160, 520) / R;
    pen.line([Pt(th, d), Pt(th + l / 2, d + r.range(-3, 3)), Pt(th + l, d)], r.range(3, 6), { color: C.ochre, alpha: r.range(0.1, 0.22), tail: 0.7, head: 0 });
  }

  // ── deck-edge board: the long plank the balustrade stands on
  pen.fill(band(-RH, G.TOP), C.board, 1, { rim: 0.3 });
  pen.tint(band(-RH - G.FAS * 0.55, G.TOP), L.rgba(C.ink, 0.2));
  for (let i = 0; i < 22; i++) {
    const th = r.range(-sp, sp), d = -RH - r.range(16, G.FAS - 10), l = r.range(180, 620) / R;
    pen.line([Pt(th, d), Pt(th + l / 2, d + r.range(-3, 3)), Pt(th + l, d + r.range(-2, 2))], r.range(2.2, 3.6), { alpha: r.range(0.35, 0.6), tail: 0.7, head: 0 });
  }
  // scarf joints
  for (let th = -sp + 0.11; th < sp; th += r.range(0.36, 0.5)) pen.line([Pt(th, -RH - 8), Pt(th + 0.012, G.TOP + 5)], 5, { alpha: 0.9 });
  pen.line(L.arcPts(a, G.TOP, -sp, sp, 110), 9, { ends: [0, 0] });
  pen.line(L.arcPts(a, -RH - 1, -sp, sp, 110), 7, { ends: [0, 0] });
}

/** the balustrade in front of the walkers: plumb posts, a middle rail, and the hand rail whose top edge is THE ARC */
function paintRail(env, pen) {
  const a = env.arc, sp = a.span(PAD + 320);
  const r = L.rng('s14rail');
  const band = (d0, d1) => (c) => a.pathBand(c, d0, d1, -sp, sp);
  // middle rail
  pen.fill(band(-90, -106), L.mix(C.ochre, C.ochrePale, 0.3), 1, { rim: 0.2 });
  pen.tint(band(-99, -106), L.rgba(C.ink, 0.18));
  pen.line(L.arcPts(a, -90, -sp, sp, 110), 4.5, { ends: [0, 0] });
  pen.line(L.arcPts(a, -106, -sp, sp, 110), 5.5, { ends: [0, 0] });
  // posts: plumb, unevenly spaced, each a little different
  const PW = 30;
  let x = a.cx - 1310 + r.range(0, 60);
  while (x < a.cx + 1320) {
    const w = PW * r.range(0.88, 1.12), xl = x - w / 2, xr = x + w / 2, tl = r.range(-2.5, 2.5);
    const yt = Math.min(a.yAt(xl), a.yAt(xr)) + HR - 6, yl = a.yAt(xl) + RH + 5, yr = a.yAt(xr) + RH + 5;
    const post = [[xl + tl, yt], [xr + tl, yt], [xr, yr], [xl, yl]];
    pen.fill(post, L.mix(C.ochre, C.ochrePale, r.range(0.1, 0.4)), 1, { rim: 0.22 });
    pen.tint([[x + 4 + tl, yt], [xr + tl, yt], [xr, yr], [x + 4, (yl + yr) / 2]], L.rgba(C.ink, 0.2));
    pen.line([[xl + tl, yt], [xl + tl / 2 + r.range(-1, 1), (yt + yl) / 2], [xl, yl]], 6, { ends: [0, 0] });
    pen.line([[xr + tl, yt], [xr + tl / 2 + r.range(-1, 1), (yt + yr) / 2], [xr, yr]], 7, { ends: [0, 0] });
    pen.line([[x + tl * 0.6 - 2, yt + 20], [x - 3 + r.range(-2, 2), yl - 16]], 2.4, { alpha: 0.4, tail: 0.7, head: 0 });
    x += r.range(262, 330);
  }
  // hand rail
  pen.fill(band(-1, -HR), C.ochreDark, 1, { rim: 0.3 });
  pen.tint(band(-HR * 0.55, -HR), L.rgba(C.ink, 0.26));
  for (let i = 0; i < 16; i++) {       // long dragged grain along the rail
    const th = r.range(-sp, sp), d = -r.range(17, HR - 6), l = r.range(200, 640) / a.R;
    const p0 = a.pt(th, d), p1 = a.pt(th + l / 2, d + r.range(-2, 2)), p2 = a.pt(th + l, d + r.range(-2, 2));
    pen.line([[p0.x, p0.y], [p1.x, p1.y], [p2.x, p2.y]], r.range(2.2, 3.6), { alpha: r.range(0.3, 0.55), tail: 0.7, head: 0 });
  }
  for (let th = -sp + r.range(0.05, 0.2); th < sp; th += r.range(0.3, 0.44)) { const p = a.pt(th, -9), q = a.pt(th + 0.006, -HR + 2); pen.line([[p.x, p.y], [q.x, q.y]], 4.5, { alpha: 0.9 }); }
  pen.line(L.arcPts(a, -HR, -sp, sp, 120), 7, { ends: [0, 0] });
  // THE ARC: one heavy brush line whose upper edge is the arc itself
  pen.line(L.arcPts(a, -7, -sp, sp, 160), 14, { ends: [0, 0], wob: 0.07 });
}

// ───────────────────────── figures (unit = 1/100 of a standing man; +x = the way they face, −y = up) ─────────────────────────
function shoe(pen, x, y = 0) {
  pen.fill([[x - 4.4, y - 5.6], [x + 2.6, y - 6], [x + 7.8, y - 2.4], [x + 8.8, y - 0.3], [x + 8.2, y], [x - 4.8, y]], C.ink, 1, { rim: 0 });
}
/** sleeve + hand */
function arm(pen, pts, widths, color, o = {}) {
  const t = pen.tube(pts, widths, color, 1, o.lw || 1.4);
  pen.line([t.A[t.A.length - 1], t.B[t.B.length - 1]], 1.0, { ends: [0, 0] });
  if (o.hand !== false) {
    const e = pts[pts.length - 1], d = pts[pts.length - 2], dx = e[0] - d[0], dy = e[1] - d[1], m = Math.hypot(dx, dy) || 1;
    const hx = e[0] + (dx / m) * 2.3, hy = e[1] + (dy / m) * 2.3;
    pen.fill(ell(hx, hy, 2.9, 2.5, 10), C.flesh, 1, { rim: 0.2 });
    pen.line(loop(ell(hx, hy, 2.9, 2.5, 10)), 0.75, { ends: [0, 0] });
  }
}
/** a head in three-quarter profile, (x, y) = middle of the face (≈ 15 units from crown to chin) */
function head(pen, x, y, o = {}) {
  const hat = o.hat || 'jin';
  pen.scope((g) => { g.translate(x, y); if (o.tilt) g.rotate(o.tilt); }, 1, () => {
    pen.fill([[-3.6, 3.6], [2.8, 5.2], [3.4, 12], [-4.6, 12]], C.flesh, 1, { rim: 0 });                 // neck
    const face = [[3.0, -6.8], [5.3, -3.8], [5.7, -2.0], [7.5, 0.7], [6.0, 1.7], [6.2, 2.9], [5.6, 3.6], [5.9, 4.5], [4.7, 6.6], [1.8, 7.6], [-2.4, 6.0], [-4.8, 2.4], [-6.2, -2.2], [-5, -6.4], [-0.5, -8]];
    pen.fill(face, C.flesh, 1, { rim: 0.12 });
    pen.line([[3.0, -6.8], [5.3, -3.8], [5.7, -2.0], [7.5, 0.7], [6.1, 1.6]], 0.8, { tail: 0.15 });      // brow → nose
    pen.line([[6.0, 1.9], [6.2, 2.9], [5.6, 3.6], [5.9, 4.5], [4.7, 6.6], [1.8, 7.6], [-2.4, 6.0], [-4.4, 3.0]], 0.8, { head: 0, tail: 0.55 });   // lips → chin → jaw
    pen.line([[1.4, -1.2], [3.0, -1.9], [4.6, -1.4]], 0.75, { head: 0.15 });                             // eye
    pen.fill(ell(3.4, -1.15, 0.8, 0.72, 8), C.ink, 1, { rim: 0 });
    pen.line([[0.8, -3.7], [3.1, -4.5], [5.0, -3.9]], 0.7);                                              // brow
    pen.line([[4.1, 3.75], [5.6, 3.5]], 0.6);                                                            // mouth
    pen.line([[-1.6, -1.6], [-3.4, -0.6], [-3.3, 1.5], [-1.9, 2.4]], 0.65);                              // ear
    if (o.beard) {
      pen.line([[5.3, 2.5], [7.0, 4.0], [7.4, 6.2]], 0.8, { tail: 0.8 });
      pen.line([[4.4, 6.6], [5.6, 10.4], [4.6, 14.2]], 1.3, { tail: 0.8 });
      pen.line([[2.6, 7.5], [3.5, 10.8], [3.0, 13.2]], 1.0, { tail: 0.8 });
    }
    if (hat === 'futou') {
      pen.fill([[3.6, -6.2], [3.5, -9.6], [1.2, -11.4], [-1.2, -11.6], [-2, -13.6], [-6.2, -13.4], [-7.6, -9.6], [-7.6, -4.6], [-6.6, 0.6], [-4.8, 2.4], [-3.6, -1.8], [0.6, -4.4]], C.ink, 1, { rim: 0 });
      pen.line([[-7.0, -5.4], [-11.6, -3.4], [-15.2, 1.4]], 1.9, { tail: 0.8, head: 0.1 });
      pen.line([[-6.8, -2.6], [-10.6, 1.6], [-12.2, 6.6]], 1.7, { tail: 0.8, head: 0.1 });
    } else if (hat === 'jin') {
      pen.fill([[3.4, -6.4], [2.2, -9.6], [-1.5, -11], [-5.5, -9.6], [-7.4, -5.2], [-6.8, 0.5], [-4.9, 2.6], [-3.6, -1.6], [0.4, -4.4]], C.ink, 1, { smooth: true, rim: 0 });
      pen.fill(ell(-4.2, -11.6, 3.2, 2.6, 10, -0.3), C.ink, 1, { rim: 0 });
    } else if (hat === 'li') {
      pen.fill([[-5.4, -4.8], [-6.6, -1], [-5.6, 2.4], [-4.2, 3.2], [-3.2, -0.6], [-1.6, -4.6]], C.ink, 1, { rim: 0 });       // hair at the nape
      const brim = [[-17.5, -3.0], [-6.4, -10.2], [0.6, -15.6], [7.4, -10], [18.5, -2.4], [8, -4.8], [-6, -5.2]];
      pen.fill(brim, C.straw, 1, { rim: 0.25 });
      pen.tint([[0.6, -15.6], [7.4, -10], [18.5, -2.4], [8, -4.8]], L.rgba(C.ink, 0.12));
      pen.line(brim.slice(0, 3), 1.4, { tail: 0.1 });
      pen.line(brim.slice(2, 5), 1.4, { head: 0.1 });
      pen.line([brim[4], brim[5], brim[6], brim[0]], 1.1, { ends: [0, 0] });
      pen.line([[0.6, -15], [-5.4, -5.6]], 0.6, { alpha: 0.6, head: 0 }); pen.line([[0.6, -15], [5.6, -5.4]], 0.6, { alpha: 0.6, head: 0 });
      pen.line([[0.6, -15], [-11.4, -4.4]], 0.55, { alpha: 0.5, head: 0 }); pen.line([[0.6, -15], [12.4, -4]], 0.55, { alpha: 0.5, head: 0 });
      pen.line([[2.6, -4.6], [4.2, 3.6], [3.0, 7.0]], 0.6, { alpha: 0.7 });                              // chin strap
    }
  });
}

/** 挑夫: short ochre jacket, white trousers, vermilion sash, a bamboo hat, and a shoulder pole with a basket at each end */
function porter(pen) {
  const lean = 5;
  const X = ([x, y]) => [x + (y < -44 ? (lean * (-y - 44)) / 56 : 0), y];
  const TR = C.offwhite, JK = C.ochre, JKD = L.mix(C.ochre, C.ink, 0.22), sx = 3.4;
  // legs
  pen.tube([[-1.5, -47], [-8.5, -27], [-15.5, -7.5]], [11, 8.2, 5.4], L.mix(TR, C.inkSoft, 0.2), 1, 1.35);
  pen.scope((g) => { g.translate(-18.4, -4.6); g.rotate(0.52); }, 1, () => shoe(pen, 0, 0));
  pen.tube([[2.5, -47], [10.5, -28], [11.5, -6]], [11.5, 8.8, 5.8], TR, 1, 1.45);
  pen.line([[7.8, -19], [14, -16]], 0.8, { alpha: 0.8 }); pen.line([[8.4, -13.4], [14, -10.6]], 0.8, { alpha: 0.8 });
  shoe(pen, 11.5, 0);
  // far arm reaching back along the pole
  arm(pen, [[-4, -78], [-12.5, -70.5], [-17.5, -76.5]].map(X), [7.6, 7, 5.6], JKD);
  // jacket
  const body = [[-3.6, -83.5], [-10.2, -79.5], [-12.4, -66], [-11.4, -53], [-13.6, -41.5], [-2, -38.4], [10.6, -41.8], [10, -53], [10.6, -66], [8.6, -79.5], [3.6, -83.5]].map(X);
  pen.fill(body, JK, 1);
  pen.fill([[-1.6, -84], [3.6, -83.6], [5.8, -75.6], [3.4, -73.6]].map(X), C.white, 1, { rim: 0 });
  pen.line(body.slice(0, 5), 1.6, { tail: 0.2 });
  pen.line(body.slice(4, 7), 1.4, { ends: [0, 0] });
  pen.line(body.slice(6), 1.6, { head: 0.1, tail: 0.2 });
  pen.line([[3.6, -83.5], [6.4, -72], [9.6, -57]].map(X), 1.05, { tail: 0.6 });
  pen.line([[-1.6, -84], [3.4, -73.6], [5.4, -70]].map(X), 0.8, { tail: 0.6 });
  pen.line([[-6, -64], [-7.6, -56]].map(X), 0.9, { tail: 0.7 });
  pen.line([[3.4, -51], [5, -42.4]], 0.95, { tail: 0.7 });
  pen.line([[-5.6, -51], [-7.2, -42]], 0.9, { tail: 0.7 });
  // sash
  pen.tube([[-11.8, -54.4], [0, -52.6], [10.3, -53.6]].map(X), [4.6, 4.6], C.red, 1, 0.9);
  pen.tube([[-10.4, -52.6], [-15, -47], [-14.2, -39.6]], [3.2, 2.6, 1.2], C.red, 1, 0.8);
  // head, then the pole lying on the near shoulder
  const hp = X([1.2, -92.6]);
  head(pen, hp[0], hp[1], { hat: 'li', tilt: 0.06 });
  const pole = [[-47, -72.5], [-24, -79.6], [1, -83.8], [25, -80.8], [49, -73]].map(([x, y]) => [x + sx, y]);
  pen.tube(pole, [2.4, 3, 3.4, 3, 2.4], C.bamboo, 1, 1.0);
  for (const t of [0.14, 0.33, 0.68, 0.87]) { const x = L.lerp(pole[0][0], pole[4][0], t), y = -83.8 + 11.2 * Math.pow(Math.abs(t - 0.5) * 2, 1.7); pen.line([[x - 0.3, y - 1.8], [x + 0.3, y + 1.9]], 0.7, { ends: [0, 0] }); }
  // near arm: the hand up on the pole
  arm(pen, [[3, -78.5], [10.5, -69.5], [15.6, -79]].map(X), [8.2, 7.6, 6.2], JK);
  // baskets
  const basket = (x0, sway, kind) => {
    const cx = x0 + sway, rimY = -47, botY = -22, top = [x0, -72.6];
    if (kind === 'fruit') for (const [fx, fy] of [[-6.4, -49.2], [0.2, -50], [6.6, -49.4], [-3, -54.2], [3.6, -54.4]]) {
      pen.fill(ell(cx + fx, fy, 3.9, 3.5, 12), C.persimmon, 1, { rim: 0.3 });
      pen.line(loop(ell(cx + fx, fy, 3.9, 3.5, 12)), 0.8, { ends: [0, 0] });
      pen.line([[cx + fx - 1.2, fy - 3], [cx + fx + 1.2, fy - 3.3]], 0.8);
    }
    const b = [[cx - 11.8, rimY], [cx - 10.2, -33], [cx - 7.6, botY], [cx + 7.6, botY], [cx + 10.2, -33], [cx + 11.8, rimY]];
    pen.fill(b, C.straw, 1, { rim: 0.3 });
    for (let i = -2; i <= 2; i++) pen.line([[cx + i * 4.7 - 1.7, rimY + 3.4], [cx + i * 3.5 + 1.7, botY + 1]], 0.7, { alpha: 0.7, head: 0 });
    for (const yy of [-38.6, -30.4]) pen.line([[cx - 10.6 + (yy + 47) * 0.12, yy], [cx + 10.6 - (yy + 47) * 0.12, yy + 0.3]], 0.7, { alpha: 0.7, head: 0 });
    pen.line(b, 1.5, { ends: [0, 0], step: 2 });
    pen.tube([[cx - 12.2, rimY + 0.6], [cx + 12.2, rimY + 0.6]], [3.2, 3.2], L.mix(C.straw, C.ochre, 0.35), 1, 0.9);
    if (kind === 'cloth') {
      const cv = [[cx - 11.6, rimY - 0.8], [cx - 8, rimY - 8.2], [cx, rimY - 11], [cx + 8.4, rimY - 7.8], [cx + 11.6, rimY - 0.8]];
      pen.fill(spline(cv, 1).concat([[cx + 11.6, rimY - 0.8], [cx - 11.6, rimY - 0.8]]), C.cyanDeep, 1, { rim: 0.2 });
      pen.line(cv, 1.3);
      pen.line([[cx - 3, rimY - 9.6], [cx - 5, rimY - 1.4]], 0.7, { alpha: 0.7, tail: 0.7 });
      pen.line([[cx + 3.6, rimY - 9.4], [cx + 6, rimY - 1.4]], 0.7, { alpha: 0.7, tail: 0.7 });
    }
    for (const dx of [-11, 0, 11]) pen.line([top, [cx + dx, rimY - (dx === 0 ? 0.4 : 0)]], 0.75, { ends: [0, 0], alpha: 0.9 });
  };
  basket(pole[0][0] + 0.4, -1.2, 'cloth');
  basket(pole[4][0] - 0.4, 1.4, 'fruit');
}

/** 骑驴: a grey donkey at a walk and a bearded scholar in a 石青 robe */
function donkeyRider(pen) {
  const G = C.donkey, GD = C.donkeyDark;
  const hoof = (x, y, rot = 0) => pen.scope((g) => { g.translate(x, y); g.rotate(rot); }, 1, () => pen.fill([[-2.6, -4.2], [2.3, -4.2], [3.5, 0], [-3.3, 0]], C.ink, 1, { rim: 0 }));
  // far legs
  pen.tube([[23, -43], [28.5, -28], [31, -14], [34.2, -5.4]], [8, 5.4, 3.8, 3.8], GD, 1, 1.25); hoof(35.4, -1.6, -0.25);
  pen.tube([[-20, -43], [-16.5, -27], [-11, -13], [-9, -4]], [10, 5.8, 4, 3.8], GD, 1, 1.25); hoof(-8.4, 0);
  // tail
  pen.tube([[-31.5, -52], [-36, -44], [-36.6, -32]], [3.2, 2.6, 1.8], GD, 1, 1.0);
  for (const e of [[-38.6, -21], [-36.2, -20], [-34.6, -22.6]]) pen.line([[-36.6, -33], e], 1.5, { tail: 0.8, head: 0 });
  // barrel
  const body = [[-31, -52], [-26, -59], [-12, -58.6], [0, -57.6], [12, -60.5], [21.5, -57], [25, -49.5], [21.5, -40], [4, -33.8], [-14, -35.4], [-26, -39.6], [-32.5, -45.5]];
  pen.fill(body, G, 1, { smooth: true });
  pen.fill([[-25, -39.8], [-14, -35.8], [4, -34.2], [20, -39.8], [9, -41.8], [-10, -41]], C.offwhite, 0.8, { smooth: true, rim: 0 });
  // neck + head
  const neck = [[12, -60.5], [19.5, -69], [26, -78.5], [30, -83.5], [36.5, -81], [43.5, -71.5], [50, -61], [53.2, -56], [50.2, -51.4], [45.8, -54.4], [41, -59.4], [36, -66.4], [30.5, -58], [25.5, -49], [18, -48.5]];
  pen.fill(neck, G, 1);
  pen.fill(ell(49.8, -56, 4.6, 4.3, 12, 0.6), C.offwhite, 0.9, { rim: 0 });
  pen.fill(ell(40.4, -73.8, 2.9, 2.5, 10, 0.5), C.offwhite, 0.7, { rim: 0 });
  // ears
  const earF = [[33.6, -81.4], [34, -92], [37, -100.5], [38.4, -91], [36.8, -81]];
  pen.fill(earF, GD, 1, { smooth: true }); pen.line(earF, 1.2);
  const earN = [[29.6, -81], [25.6, -90], [25.8, -100], [30.6, -91.5], [32.8, -81.6]];
  pen.fill(earN, G, 1, { smooth: true }); pen.line(earN, 1.4);
  pen.line([[28.6, -84], [27.6, -92], [27, -97]], 0.8, { alpha: 0.6, tail: 0.7 });
  // outlines
  pen.line([[12, -60.5], [19.5, -69], [26, -78.5], [29.6, -82.6]], 1.6, { ends: [0, 1], tail: 0.1 });
  pen.line([[34.2, -82.4], [36.5, -81], [43.5, -71.5], [50, -61], [53.2, -56], [50.2, -51.4], [45.8, -54.4], [41, -59.4], [36, -66.4]], 1.6, { tail: 0.2 });
  pen.line([[36, -66.4], [30.5, -58], [25.5, -49], [23, -42.6]], 1.5, { tail: 0.3 });
  pen.line([[-26, -59], [-31, -52], [-32.5, -45.5], [-27, -39.8]], 1.7, { tail: 0.2 });
  pen.line([[-26, -59.2], [-12, -58.8], [0, -57.8], [12, -60.6]], 1.4, { ends: [0, 0] });
  pen.line([[-26, -39.6], [-14, -35.4], [4, -33.8], [21.5, -40]], 1.6, { ends: [0, 0] });
  for (let i = 0; i <= 7; i++) { const t = i / 7, x = L.lerp(14.6, 28.6, t), y = L.lerp(-62.6, -81, t); pen.line([[x, y], [x - 3.4, y - 3.2]], 1.9, { tail: 0.8, head: 0.1 }); }   // mane
  pen.fill(ell(40.4, -73.8, 1.5, 1.15, 8, 0.4), C.ink, 1, { rim: 0 });
  pen.line([[38.4, -75.6], [40.6, -76.2], [42.6, -75]], 0.7);
  pen.fill(ell(51.3, -56.8, 0.95, 0.75, 6), C.ink, 1, { rim: 0 });
  pen.line([[50.2, -51.8], [47.2, -54.4]], 0.7);
  pen.line([[43.6, -70], [45.2, -62.4], [47.6, -56]], 0.95, { ends: [0, 0] }); pen.line([[39.8, -63], [45.2, -62.4]], 0.9, { ends: [0, 0] });   // bridle
  pen.tube([[35.4, -65.6], [35, -61], [34.4, -55.4]], [1.4, 3.6, 0.8], C.red, 1, 0.6);                                                          // throat tassel
  // near legs
  pen.tube([[19.5, -42], [20, -25], [19, -11], [20, -4]], [9, 5.6, 3.9, 4.1], G, 1, 1.4); hoof(20.3, 0);
  pen.tube([[-24.5, -43], [-29.5, -26], [-25.8, -12], [-25, -4]], [11, 6.4, 4.1, 4.1], G, 1, 1.4); hoof(-24.6, 0);
  // saddle cloth
  const cloth = [[-13.5, -59.5], [11.5, -61], [14, -46.5], [10.5, -40.2], [-11.5, -40.2], [-15, -46.5]];
  pen.fill(cloth, C.red, 1);
  pen.line(loop(cloth), 1.3, { ends: [0, 0], step: 2 });
  pen.line([[-12, -44.4], [11, -44.8]], 0.75, { alpha: 0.75, ends: [0, 0] });
  pen.line([[2, -40.2], [1.4, -34]], 1.7, { ends: [0, 0] });
  // rider
  pen.fill([[6, -42.6], [12.2, -42.6], [13.6, -33.6], [18.8, -31.4], [19, -29], [7, -29.4]], C.ink, 1, { rim: 0 });      // boot
  const robe = [[-2.8, -91.6], [-8.8, -87.6], [-10.8, -74], [-9.6, -62], [-10.8, -52], [-7.4, -41.4], [4, -38.4], [12.6, -42], [16.2, -54.5], [13.8, -62.5], [9.2, -66.5], [8.8, -76.5], [7.6, -87.6], [2.8, -91.6]];
  pen.fill(robe, C.blue, 1);
  pen.fill([[-2.6, -92], [3, -91.8], [4.8, -86.6], [0.6, -84.2]], C.white, 1, { rim: 0 });
  pen.line(robe.slice(0, 6), 1.65, { tail: 0.2 });
  pen.line(robe.slice(5, 9), 1.45, { ends: [0, 0] });
  pen.line(robe.slice(8), 1.65, { head: 0.1, tail: 0.2 });
  pen.line([[-2, -62], [3, -52], [5, -41]], 1.05, { tail: 0.7 });
  pen.line([[6, -64], [11, -55], [12.8, -45]], 0.95, { tail: 0.7 });
  pen.line([[-6.4, -60], [-7, -50], [-5, -43]], 0.9, { tail: 0.7 });
  pen.line([[-2.6, -92], [0.6, -84.2], [4.8, -86.6]], 0.8, { ends: [0, 0] });
  pen.tube([[-10.2, -67.8], [0, -66], [9.2, -67.2]], [3.2, 3.2], C.white, 1, 0.8);
  head(pen, 1.8, -99.6, { hat: 'futou', beard: true });
  arm(pen, [[0.8, -87.4], [8, -76.5], [16.5, -71.5]], [8.6, 10.8, 11.2], C.blue, { lw: 1.5 });
  pen.line([[18.8, -70.4], [33, -62.8], [47.4, -56.2]], 0.85, { ends: [0, 0] });   // rein
}

function paintFigures(env, pen) {
  const a = env.arc;
  const place = (s, dr, flip, fn) => {
    const th = s / a.R, p = a.pt(th, dr), sl = Math.tan(th);
    // people stand plumb on the sloping deck: shear, don't rotate
    pen.scope((g) => { g.translate(p.x, p.y); g.transform(1, sl, 0, 1, 0, 0); g.scale(flip * K, K); }, K, () => fn(pen));
  };
  place(-590, -RH + 8, 1, porter);
  place(250, -RH + 12, 1, donkeyRider);
}

// ───────────────────────── silk, pigment, age ─────────────────────────
/**
 * Plain-weave silk under a macro lens, built from a height field (every thread crosses over, then under):
 * shade = the weave lit from the upper left (neutral grey, for soft-light), crown = alpha on the thread tops
 * (where paint wears off first), gap = alpha in the interstices (where pigment collects).
 */
function weaveTiles() {
  const P = 6, N = 48, T = P * N;
  const r = L.rng('s14weave');
  const wg = [], hg = [];
  for (let i = 0; i < N; i++) { wg.push(r.range(0.78, 1.16)); hg.push(r.range(0.78, 1.16)); }
  const h = new Float32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = (x / P) | 0, j = (y / P) | 0, fx = (x + 0.5) / P - i - 0.5, fy = (y + 0.5) / P - j - 0.5;
    const s = ((i + j) & 1) ? 1 : -1;
    const cw = Math.cos(Math.PI * fx), ch = Math.cos(Math.PI * fy);
    h[y * T + x] = Math.max(wg[i] * cw * (0.6 + 0.4 * s * ch), hg[j] * ch * (0.6 - 0.4 * s * cw));
  }
  const at = (x, y) => h[((y + T) % T) * T + ((x + T) % T)];
  const is = new ImageData(T, T), ic = new ImageData(T, T), ig = new ImageData(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = at(x, y), lit = at(x + 1, y + 1) - at(x - 1, y - 1), k = (y * T + x) * 4;
    const sv = L.clamp(128 + 120 * lit + 80 * (v - 0.62), 0, 255);
    is.data[k] = is.data[k + 1] = is.data[k + 2] = sv; is.data[k + 3] = 255;
    ic.data[k] = ic.data[k + 1] = ic.data[k + 2] = 255; ic.data[k + 3] = 255 * L.smooth((v - 0.7) / 0.3);
    ig.data[k] = ig.data[k + 1] = ig.data[k + 2] = 0; ig.data[k + 3] = 255 * L.smooth((0.55 - v) / 0.4);
  }
  const mk = (img) => { const c = L.makeCanvas(T, T); c.getContext('2d').putImageData(img, 0, 0); return c; };
  return { shade: mk(is), crown: mk(ic), gap: mk(ig) };
}
function makeCreases() {
  // a handscroll cracks ACROSS its rolling direction: irregular vertical creases that fade in and out along their length
  const r = L.rng('s14crease'), nz = L.makeNoise('s14crease'); const out = [];
  let x = -PAD + r.range(40, 300), id = 0;
  while (x < W + PAD) {
    const pts = [], drift = r.range(-30, 30), k = r.range(0.4, 1);
    for (let y = -PAD; y <= H + PAD; y += 40) {
      const a = L.clamp(0.25 + 1.5 * nz.n2(y / 280, id * 7.3));          // strength of this stretch (0 = the crease vanishes)
      pts.push([x + (drift * y) / H + 8 * nz.n2(y / 200, id * 3.1 + 50), y, a * k]);
    }
    out.push({ pts, k });
    x += r.range(240, 620); id++;
  }
  return out;
}
function buildTex(creases) {
  const weave = weaveTiles();
  const full = (fn) => { const c = L.makeCanvas(LW, LH); fn(c.getContext('2d')); return c; };
  // where pigment lies thicker: soft mottled pools + the interstices of the weave + fine granulation
  const grain = L.noiseTex(256, 256, { seed: 's14gr', scale: 3.2, octaves: 2, res: 1, contrast: 2.2, ramp: [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']] });
  const pool = full((g) => {
    g.drawImage(L.noiseTex(LW, LH, { seed: 's14pool', scale: 110, octaves: 4, res: 0.3, warp: 0.7, contrast: 1.8, ramp: [[0, 'rgba(0,0,0,0)'], [0.42, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.55)']] }), 0, 0);
    g.globalAlpha = 0.42; g.fillStyle = g.createPattern(weave.gap, 'repeat'); g.fillRect(0, 0, LW, LH);
    g.globalAlpha = 1; g.fillStyle = g.createPattern(grain, 'repeat'); g.fillRect(0, 0, LW, LH);
  });
  // where paint has gone: rubbed patches, the crowns of the threads, chips along the roll creases
  const wear = full((g) => {
    g.fillStyle = g.createPattern(weave.crown, 'repeat'); g.fillRect(0, 0, LW, LH);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's14rub', scale: 260, octaves: 3, res: 0.2, warp: 0.5, contrast: 1.9, ramp: [[0, 'rgba(0,0,0,0.46)'], [0.25, 'rgba(0,0,0,0.2)'], [0.5, 'rgba(0,0,0,0.06)'], [1, 'rgba(0,0,0,0.02)']] }), 0, 0);
    g.globalCompositeOperation = 'source-over';
    const r = L.rng('s14flake');
    g.translate(PAD, PAD);
    for (const c of creases) for (const [x, y, k] of c.pts) for (let i = 0; i < 4; i++) {
      if (!r.chance(0.6 * k)) continue;
      const w = r.range(1.6, 5), hh = r.range(4, 22), cx = x + r.range(-2.5, 2.5), cy = y + r.range(0, 40);
      g.fillStyle = `rgba(0,0,0,${r.range(0.5, 0.95).toFixed(2)})`;
      g.beginPath(); g.moveTo(cx - w / 2, cy); g.lineTo(cx + w * r.range(0.2, 0.6), cy + hh * r.range(0.1, 0.4)); g.lineTo(cx + w * r.range(-0.2, 0.3), cy + hh); g.lineTo(cx - w * r.range(0.3, 0.7), cy + hh * r.range(0.5, 0.8)); g.closePath(); g.fill();
    }
  });
  // a loaded brush runs dry: the line breaks into granules here and there, and pales over longer stretches
  const dryTile = L.noiseTex(256, 256, { seed: 's14dry', scale: 5, octaves: 2, res: 1, contrast: 2.4, ramp: [[0, 'rgba(0,0,0,0.5)'], [0.3, 'rgba(0,0,0,0.12)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] });
  const dry = full((g) => {
    g.fillStyle = g.createPattern(dryTile, 'repeat'); g.fillRect(0, 0, LW, LH);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's14dry2', scale: 120, octaves: 3, res: 0.2, contrast: 2, ramp: [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.5)'], [0.7, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's14pale', scale: 300, octaves: 3, res: 0.15, contrast: 1.8, ramp: [[0, 'rgba(0,0,0,0.26)'], [0.4, 'rgba(0,0,0,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']] }), 0, 0);
  });
  return { weave, pool, wear, dry };
}
/** let the pigment behave like pigment, then lay the sheet onto target */
function flatten(target, pen, tex, o = {}) {
  const tmp = L.makeCanvas(LW, LH), tg = tmp.getContext('2d');
  tg.drawImage(pen.wash, 0, 0);
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(tex.pool, 0, 0);
  let g = pen.gw; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.drawImage(tmp, 0, 0);            // every colour darkened by ITSELF → stays clean
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = o.wear === undefined ? 1 : o.wear; g.drawImage(tex.wear, 0, 0);
  g.restore();
  g = pen.gi; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.4; g.drawImage(tex.wear, 0, 0);
  g.globalAlpha = 1; g.drawImage(tex.dry, 0, 0);
  g.restore();
  const t = target.getContext('2d'); t.save(); t.setTransform(1, 0, 0, 1, 0, 0);
  // the wash: edges a touch soft, a hair out of register with the drawing
  t.filter = 'blur(0.9px)'; t.drawImage(pen.wash, 1.5, 1.2); t.filter = 'none';
  // ink sinks into the silk: a soft halo under a firm line
  t.globalAlpha = 0.42; t.drawImage(L.blurred(pen.ink, 3.2), 0, 0);
  t.globalAlpha = 1; t.filter = 'blur(0.55px)'; t.drawImage(pen.ink, 0, 0); t.filter = 'none';
  t.restore();
  return target;
}
/** the multiply sheet: faint uneven toning, a little foxing, the dark side of the roll creases */
function buildAging(creases) {
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#fff'; g.fillRect(-PAD, -PAD, LW, LH);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's14tone', scale: 560, octaves: 4, res: 0.2, warp: 0.6, ramp: [[0, '#eee2c6'], [0.5, '#faf5e8'], [1, '#ffffff']] }), -PAD, -PAD);
    // raking light: a shade brighter upper left
    g.fillStyle = L.linear(g, 0, 0, W, H, [[0, '#ffffff'], [0.55, '#fbf8f0'], [1, '#efe9db']]); g.fillRect(-PAD, -PAD, LW, LH);
    const r = L.rng('s14fox');
    for (let i = 0; i < 34; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), rad = r.range(3, 15), n = r.int(2, 4);
      for (let m = 0; m < n; m++) {
        g.fillStyle = L.rgba('#b3925a', r.range(0.07, 0.2));
        g.beginPath(); g.ellipse(x + r.range(-rad, rad) * 0.6, y + r.range(-rad, rad) * 0.6, rad * r.range(0.5, 1), rad * r.range(0.3, 0.8), r.range(0, 3), 0, L.TAU); g.fill();
      }
    }
    g.lineCap = 'round';
    for (const c of creases) for (let i = 1; i < c.pts.length; i++) {
      const p = c.pts[i - 1], q = c.pts[i], k = (p[2] + q[2]) / 2;
      if (k < 0.04) continue;
      g.strokeStyle = `rgba(110,84,48,${(0.07 * k).toFixed(3)})`; g.lineWidth = 14; g.beginPath(); g.moveTo(p[0] + 6, p[1]); g.lineTo(q[0] + 6, q[1]); g.stroke();
      g.strokeStyle = `rgba(86,62,34,${(0.42 * k).toFixed(3)})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
  });
}

export default {
  name: '虹桥',
  tone: 'dark',
  init(env) {
    const creases = makeCreases();
    const tex = buildTex(creases);
    const pb = makePen(1000); paintBack(env, pb);
    const back = flatten(L.makeLayer(PAD, (g) => { g.fillStyle = C.silk; g.fillRect(-PAD, -PAD, LW, LH); }), pb, tex);
    const pf = makePen(4000); paintFigures(env, pf);
    const fig = flatten(L.makeLayer(PAD), pf, tex);
    const pr = makePen(7000); paintRail(env, pr);
    const rail = flatten(L.makeLayer(PAD), pr, tex);

    const aging = buildAging(creases);
    // focus lies on the crown of the bridge; the sheet falls out of focus toward the sides and the bottom
    const a = env.arc;
    const focusMask = (hx0, hx1, vy0, vy1) => {
      const c = L.makeCanvas(LW, LH), g = c.getContext('2d'); g.translate(PAD, PAD);
      const fx = a.cx + 40, u = (hx1 - hx0) / (2 * hx1), z = 'rgba(0,0,0,0)', o = 'rgba(0,0,0,1)', h = 'rgba(0,0,0,0.5)';
      g.fillStyle = L.linear(g, fx - hx1, 0, fx + hx1, 0, [[0, o], [u * 0.5, h], [u, z], [1 - u, z], [1 - u * 0.5, h], [1, o]]); g.fillRect(-PAD, -PAD, LW, LH);
      g.fillStyle = L.linear(g, 0, vy0, 0, vy1, [[0, z], [0.5, h], [1, o]]); g.fillRect(-PAD, -PAD, LW, LH);
      return c;
    };
    const m1 = focusMask(540, 1020, a.crestY + 150, a.crestY + 430), m2 = focusMask(820, 1280, a.crestY + 300, a.crestY + 660);
    const bake = (layer) => {
      const keep = L.makeCanvas(LW, LH); keep.getContext('2d').drawImage(layer, 0, 0);
      const g = layer.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.drawImage(aging, 0, 0);
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.46; g.fillStyle = g.createPattern(tex.weave.shade, 'repeat'); g.fillRect(0, 0, LW, LH);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.lineCap = 'round'; g.translate(PAD, PAD);
      for (const c of creases) for (let i = 1; i < c.pts.length; i++) {       // the lit side of each crease
        const p = c.pts[i - 1], q = c.pts[i], k = (p[2] + q[2]) / 2;
        if (k < 0.04) continue;
        g.strokeStyle = `rgba(255,250,236,${(0.3 * k).toFixed(3)})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(p[0] - 2.2, p[1]); g.lineTo(q[0] - 2.2, q[1]); g.stroke();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(keep, 0, 0);
      g.restore();
      // depth of field: sharp·(1−m) + blurred·m, twice — the focus lies on the crown, the sheet melts toward the sides and the bottom
      for (const [m, px] of [[m1, 3.2], [m2, 10]]) {
        const bl = L.blurred(layer, px), bg = bl.getContext('2d');
        bg.globalCompositeOperation = 'destination-in'; bg.drawImage(m, 0, 0);
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-out'; g.drawImage(m, 0, 0);
        g.globalCompositeOperation = 'lighter'; g.drawImage(bl, 0, 0);
        g.restore();
      }
      return layer;
    };
    S = { back: bake(back), fig: bake(fig), rail: bake(rail) };
  },
  draw(ctx, env, p) {
    // the whole painting slides along the arc; the walkers drift a little further, as if still walking
    const rot = L.lerp(-0.0065, 0.0065, p), zoom = L.lerp(1.0, 1.02, p);
    L.blit(ctx, env, S.back, { rot, zoom });
    L.blit(ctx, env, S.fig, { rot: rot + L.lerp(-0.0018, 0.0018, p), zoom });
    L.blit(ctx, env, S.rail, { rot, zoom });
    // a soft band of light travelling across the silk
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const x0 = L.lerp(560, 780, p);
    ctx.fillStyle = L.linear(ctx, x0 - 420, 0, x0 + 420, H, [[0, 'rgba(255,252,240,0)'], [0.5, 'rgba(255,252,240,0.2)'], [1, 'rgba(255,252,240,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};
