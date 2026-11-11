// p13 — 彩绳钱串: little bundles of cash coins tied with coloured cord (red / blue / yellow / green), photographed from above on
// grey-white paper (the reference's page of small flags). The bundles lie ALONG THE STROKES OF THE CURRENT GLYPH: K.pack gives
// the beads on each stroke's centre line, neighbouring beads of one stroke are joined into an oblong bundle of staggered coins
// that follows the stroke's direction (ang), and every coin is as wide as the stroke is there. Nothing here knows which
// character it spells — this is the first time the glyph appears in the film.
// Each coin is shaded per DEVICE pixel from a height field (outer rim, sunken field, inner rim round the square hole, worn
// lumps, casting grain) with the light fixed in PAGE space at the top-left; it has a visible edge wall, and throws a contact
// and a cast shadow on whatever lies under it. The cords are twisted ropes built ply by ply.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const PAD = 16;                                          // the layer is a little larger than the frame: the push-in never shows its edge
let layer = null;

//               rubbed-bright metal    tarnished field
const METAL = [
  { bright: [218, 176, 92], dull: [128, 97, 46] },       // brass
  { bright: [198, 154, 94], dull: [110, 81, 44] },       // old bronze
  { bright: [178, 146, 100], dull: [88, 67, 38] },       // dark, handled
  { bright: [212, 152, 102], dull: [122, 79, 42] },      // reddish copper
];
//             light      base       dark
const CORD = [
  ['#f8846a', '#cb2a20', '#6e0f0c'],                     // red
  ['#7eaee6', '#2b5eaa', '#10295a'],                     // blue
  ['#fbe58c', '#e2ac1e', '#86590a'],                     // yellow
  ['#8ad29a', '#2f8b4d', '#114724'],                     // green
];
// the light: from the top-left, about 38° above the page
const LX = -0.52, LY = -0.60, LZ = 0.61;
const HX = -0.29, HY = -0.334, HZ = 0.897;               // half-vector toward a camera straight above
const PLX = -0.655, PLY = -0.756, TAN_EL = 0.768;        // its direction in the page plane (unit), and the slope of its rays
const clamp = L.clamp;
const ss = (a, b, x) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

// ── one fbm tile, sampled bilinearly: cheap enough to evaluate for every device pixel of every coin ──
const NT = 512;
let TILE = null, HB = new Float32Array(0);
function noiseTile() {
  const nz = L.makeNoise('p13tile'), t = new Float32Array(NT * NT);
  for (let j = 0, o = 0; j < NT; j++) for (let i = 0; i < NT; i++, o++) t[o] = nz.fbm(i / 24, j / 24, 4);
  return t;
}
function tile(x, y) {
  const i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j, i0 = i & 511, i1 = (i + 1) & 511, j0 = (j & 511) * NT, j1 = ((j + 1) & 511) * NT, t = TILE;
  return (t[j0 + i0] * (1 - a) + t[j0 + i1] * a) * (1 - b) + (t[j1 + i0] * (1 - a) + t[j1 + i1] * a) * b;
}

/**
 * One coin as a sprite, shaded where it lies. c: { R, rot, pal, seed, size (sprite side), cx, cy (coin centre inside the sprite),
 * ex, ey (how far the bottom face shows beyond the top face: the coin's thickness), tx, ty (slope of the face: it leans on the coin below) }
 */
function coinSprite(c) {
  const { R, cx, cy, ex, ey } = c, B = METAL[c.pal].bright, D = METAL[c.pal].dull, r = L.rng('p13coin' + c.seed);
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot), ee = ex * ex + ey * ey;
  const hq = r.range(0.195, 0.215), iq = r.range(0.305, 0.335), rf = r.range(0.80, 0.835), lm = (iq + rf) * 0.5;   // hole, inner rim, field (in radii)
  const HR = r.range(0.044, 0.054), HI = r.range(0.034, 0.044);                                                        // heights of the two rims
  const o1x = r.range(120, 390), o1y = r.range(120, 390), o2x = r.range(200, 310), o2y = r.range(200, 310), o3x = r.range(100, 410), o3y = r.range(100, 410);
  const lump = [r.range(0.2, 1), r.range(0.2, 1), r.range(0.2, 1), r.range(0.2, 1)];
  const verd = r.chance(0.5) ? r.range(0.15, 0.5) : 0, tone = r.range(0.93, 1.06), polish = r.range(0.65, 1);
  const spr = L.pixelCanvas(c.size, c.size, (d, pw, ph, q) => {
    if (HB.length < pw * ph) HB = new Float32Array(pw * ph);
    const H = HB, eps = 3 / (R * q);
    // pass 1 — the relief of the face, in radii
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q - cy;
      for (let i = 0; i < pw; i++, k++) {
        const x = (i + 0.5) / q - cx, u = (x * cs + y * sn) / R, v = (y * cs - x * sn) / R;
        const rho = Math.sqrt(u * u + v * v), au = u < 0 ? -u : u, av = v < 0 ? -v : v, sq = au > av ? au : av;
        if (rho > 1 + eps || sq < hq - eps) { H[k] = 0; continue; }
        const lo = tile(o1x + u * 42, o1y + v * 42), fi = tile(o2x + u * 150, o2y + v * 150);
        const rim = (0.35 + 0.65 * ss(1, 0.955, rho)) * ss(rf - 0.03, rf + 0.012, rho);            // outer rim: bevelled outside, a step down to the field
        const inner = ss(iq + 0.022, iq - 0.018, sq) * (0.4 + 0.6 * ss(hq, hq + 0.035, sq));        // inner rim round the hole
        let bu, bv, li;                                                                              // four worn-flat lumps: polished, shapeless
        if (au > av) { bu = au - lm; bv = av; li = u > 0 ? 0 : 2; } else { bu = av - lm; bv = au; li = v > 0 ? 1 : 3; }
        const lmp = Math.exp(-(bu * bu) / 0.0145 - (bv * bv) / 0.026) * lump[li] * Math.max(0, 0.55 + 0.9 * lo);
        const rough = 1 - 0.62 * Math.max(ss(rf - 0.03, rf + 0.012, rho), inner);                   // the rims are rubbed smooth, the field keeps its casting grain
        H[k] = HR * rim + HI * inner + 0.019 * lmp + (0.007 * lo + 0.0038 * fi) * rough;
      }
    }
    // pass 2 — light it
    const gk = R * q * 0.5;
    const k1 = Math.round(PLY * 0.032 * R * q) * pw + Math.round(PLX * 0.032 * R * q), k2 = Math.round(PLY * 0.064 * R * q) * pw + Math.round(PLX * 0.064 * R * q);
    for (let j = 0, k = 0, o = 0; j < ph; j++) {
      const y = (j + 0.5) / q - cy;
      for (let i = 0; i < pw; i++, k++, o += 4) {
        const x = (i + 0.5) / q - cx;
        const pe = x * ex + y * ey, te = pe <= 0 ? 0 : pe >= ee ? 1 : pe / ee, dcap = Math.hypot(x - te * ex, y - te * ey) - R;
        if (dcap > 1) continue;                                                                       // outside the coin (the data starts transparent)
        const u = (x * cs + y * sn) / R, v = (y * cs - x * sn) / R, sq = Math.max(Math.abs(u), Math.abs(v));
        const x2 = x - ex, y2 = y - ey, sq2 = Math.max(Math.abs(x2 * cs + y2 * sn), Math.abs(y2 * cs - x2 * sn)) / R;
        const thr = Math.max(sq, sq2) - hq;                                                           // < 0: you look straight through the hole
        const aSil = clamp(0.5 - Math.max(dcap, -thr * R) * q);
        if (aSil <= 0) continue;
        const rr = Math.sqrt(x * x + y * y), rho = rr / R;
        const aTop = clamp(0.5 - Math.max(rr - R, (hq - sq) * R) * q);
        let tr = 0, tg = 0, tb = 0, wr = 0, wg = 0, wb = 0;
        if (aTop > 0) {
          const h = H[k], gx = (H[k + 1] - H[k - 1]) * gk + c.tx, gy = (H[k + pw] - H[k - pw]) * gk + c.ty;
          const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
          const dif = Math.max(0, (LZ - gx * LX - gy * LY) * inv), spe = Math.pow(Math.max(0, (HZ - gx * HX - gy * HY) * inv), 30);
          const sh = Math.max(ss(0, 0.012, H[k + k1] - h - 0.032 * TAN_EL), ss(0, 0.012, H[k + k2] - h - 0.064 * TAN_EL));   // the rims' own shadow on the field
          const pol = rho > rf + 0.012 || sq < iq - 0.018 ? 1 : ss(0.006, 0.03, h);                   // raised = rubbed bright
          const lo2 = tile(o3x + u * 34, o3y + v * 34);
          const m = clamp(0.2 + (0.66 * pol + 0.42 * lo2) * polish);
          const foot = (1 - pol) * Math.max(rho < rf ? Math.exp(-Math.max(0, rf - 0.02 - rho) / 0.05) : 0, sq > iq ? Math.exp(-(sq - iq) / 0.045) : 0);
          const gr = (1 - 0.36 * foot) * tone, vg = verd * foot * ss(-0.1, 0.3, lo2);                  // grime, and a little verdigris, where the field meets the rims
          let ar = (D[0] + (B[0] - D[0]) * m) * gr, ag = (D[1] + (B[1] - D[1]) * m) * gr, ab = (D[2] + (B[2] - D[2]) * m) * gr;
          ar += (92 - ar) * vg; ag += (146 - ag) * vg; ab += (124 - ab) * vg;
          const lit = 0.40 + 0.92 * dif * (1 - 0.72 * sh), sp = 170 * spe * (0.3 + 0.7 * pol) * (1 - sh);
          tr = ar * lit + sp; tg = ag * lit + sp * 0.94; tb = ab * lit + sp * 0.78;
        }
        if (aTop < 1) {
          let w;
          if (sq < hq) w = 0.3 - 0.14 * clamp((hq - sq) / (sq2 - sq || 1));                           // the far walls of the hole, in shade
          else {                                                                                       // the edge of the coin, seen on its lower-right side
            const disc = pe * pe - ee * (rr * rr - R * R), tw = disc > 0 ? clamp((pe - Math.sqrt(disc)) / ee) : 1;
            const wx = x - tw * ex, wy = y - tw * ey, nl = (wx * PLX + wy * PLY) / (Math.hypot(wx, wy) || 1);
            w = (0.4 + 0.3 * Math.max(0, 1 + nl)) * (1 - 0.3 * tw) + 0.24 * Math.exp(-(((tw - 0.32) / 0.2) ** 2));
            w *= 0.9 + 0.3 * tile(o2x + Math.atan2(wy, wx) * 40, o2y + tw * 4);
          }
          w *= tone; wr = B[0] * w * 0.92; wg = B[1] * w * 0.86; wb = B[2] * w * 0.8;
        }
        d[o] = tr * aTop + wr * (1 - aTop); d[o + 1] = tg * aTop + wg * (1 - aTop); d[o + 2] = tb * aTop + wb * (1 - aTop); d[o + 3] = aSil * 255;
      }
    }
  });
  // hairline scratches: a dark cut with a bright lip
  const g = spr.getContext('2d'); g.save(); g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round'; g.translate(cx, cy);
  for (let k = 0, n = r.int(4, 8); k < n; k++) {
    const a = r() * TAU, dd = r.range(0.1, 0.85) * R, sx = Math.cos(a) * dd, sy = Math.sin(a) * dd, sa = r() * TAU, sl = R * r.range(0.12, 0.42), lw = Math.max(0.3, R * r.range(0.008, 0.015));
    const qx = sx + Math.cos(sa) * sl, qy = sy + Math.sin(sa) * sl;
    g.lineWidth = lw;
    g.strokeStyle = `rgba(28,17,6,${r.range(0.14, 0.26)})`; g.beginPath(); g.moveTo(sx + lw * 0.7, sy + lw * 0.8); g.lineTo(qx + lw * 0.7, qy + lw * 0.8); g.stroke();
    g.strokeStyle = `rgba(255,243,208,${r.range(0.16, 0.32)})`; g.beginPath(); g.moveTo(sx, sy); g.lineTo(qx, qy); g.stroke();
  }
  g.restore();
  return spr;
}

// ── cords ──
const quad = (a, c, b, n = 22) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return o; };

/** a twisted cord along a dense polyline: a dark core with its shadow, then one slanted, lit ply after another */
function rope(g, pts, w, col, shadow = 1) {
  const path = () => { g.beginPath(); for (let i = 0; i < pts.length; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]); };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.shadowColor = `rgba(22,12,4,${0.6 * shadow})`; g.shadowBlur = w * 0.6; g.shadowOffsetX = w * 0.3; g.shadowOffsetY = w * 0.46;
  path(); g.strokeStyle = col[2]; g.lineWidth = w; g.stroke(); g.restore();
  path(); g.strokeStyle = L.rgba(col[1], 0.9); g.lineWidth = w * 0.7; g.stroke();
  const pl = w * 0.62, tw = 0.95;                              // length of a ply along the cord; the angle of the twist
  let next = pl * 0.5, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i - 1][0], y0 = pts[i - 1][1], dx = pts[i][0] - x0, dy = pts[i][1] - y0, len = Math.hypot(dx, dy);
    if (!len) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len, a = Math.atan2(dy, dx) + tw, ca = Math.cos(a), sa = Math.sin(a);
      const lx = PLX * ca + PLY * sa, ly = PLY * ca - PLX * sa;                       // the light's direction in the ply's own frame
      g.save(); g.translate(x0 + dx * t, y0 + dy * t); g.rotate(a);
      g.fillStyle = L.linear(g, lx * w * 0.5, ly * w * 0.5, -lx * w * 0.5, -ly * w * 0.5, [[0, col[0]], [0.42, col[1]], [1, col[2]]]);
      g.beginPath(); g.ellipse(0, 0, w * 0.5, pl * 0.5, 0, 0, TAU); g.fill();
      g.strokeStyle = L.rgba(col[2], 0.55); g.lineWidth = Math.max(0.3, w * 0.085); g.beginPath(); g.ellipse(0, 0, w * 0.5, pl * 0.5, 0, 0.2, Math.PI - 0.2); g.stroke();   // the groove to the next ply
      g.fillStyle = 'rgba(255,252,240,0.42)'; g.beginPath(); g.ellipse(lx * w * 0.2, ly * pl * 0.2, w * 0.15, pl * 0.1, 0, 0, TAU); g.fill();                              // the bright core of its highlight
      g.restore();
      next += pl;
    }
    acc += len;
  }
  g.restore();
}

function drawCord(g, b) {
  const P = b.coins, n = P.length, w = b.w, col = b.col, r = L.rng('p13k' + b.key), top = P[n - 1], bot = P[0];
  const ax = b.ax, ay = b.ay, nx = -ay, ny = ax;                                       // unit axis of the bundle: from its bottom coin to its top coin
  // where the lashing goes: about the middle of the pile, clear of the top coin's hole
  let Lt = 0; for (let k = 1; k < n; k++) Lt += Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y);
  const sM = Math.min(Lt + bot.R * 0.55, Math.max(Lt * 0.5 + top.R * 0.12, top.R * 0.62));
  let mx = bot.x - ax * (sM - Lt), my = bot.y - ay * (sM - Lt), Rm = bot.R;
  for (let k = n - 1, acc = 0; k > 0; k--) {
    const l = Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y);
    if (acc + l >= sM) { const t = (sM - acc) / (l || 1); mx = L.lerp(P[k].x, P[k - 1].x, t); my = L.lerp(P[k].y, P[k - 1].y, t); Rm = L.lerp(P[k].R, P[k - 1].R, t); break; }
    acc += l;
  }
  const turns = n >= 4 ? 3 : 2, ext = Rm + w * 2;
  // everything that lies ON the coins is clipped to the pile: the cord passes round underneath
  g.save();
  g.beginPath();
  for (const c of P) for (const [ox, oy] of [[0, 0], [c.ex, c.ey]]) { g.moveTo(c.x + ox + c.R + 0.3, c.y + oy); g.arc(c.x + ox, c.y + oy, c.R + 0.3, 0, TAU); }
  g.clip();
  // the cord the coins are strung on: up out of the top coin's hole, back along the pile and round its far end
  const pts = [[top.x, top.y]];
  for (let k = n - 2; k >= 0; k--) pts.push([P[k].x + nx * r.range(-0.07, 0.07) * P[k].R, P[k].y + ny * r.range(-0.07, 0.07) * P[k].R]);
  pts.push([bot.x - ax * (bot.R + w * 2.5), bot.y - ay * (bot.R + w * 2.5)]);
  rope(g, L.smoothPath(pts, Math.max(0.6, w * 0.3)), w, col);
  g.fillStyle = L.radial(g, top.x, top.y, 0, top.R * 0.21, [[0, 'rgba(14,8,3,0.8)'], [0.55, 'rgba(14,8,3,0.45)'], [1, 'rgba(14,8,3,0)']]);   // it dives into the hole
  g.beginPath(); g.arc(top.x, top.y, top.R * 0.21, 0, TAU); g.fill();
  // the lashing: two or three turns across the pile
  for (let m = 0; m < turns; m++) {
    const o = (m - (turns - 1) / 2) * w * 1.04, px = mx + ax * o, py = my + ay * o, bow = r.range(-0.4, 0.4) * w;
    rope(g, quad([px - nx * ext, py - ny * ext], [px + ax * bow, py + ay * bow], [px + nx * ext, py + ny * ext], Math.max(12, Math.ceil(ext / Math.max(0.5, w * 0.3)))), w, col, 0.85);
  }
  // …turning away from the light as it goes over the edge of the coins
  const lit = PLX * nx + PLY * ny, hw = turns * w * 0.52 + 0.4;
  g.save(); g.translate(mx, my); g.rotate(Math.atan2(ny, nx));
  g.fillStyle = L.linear(g, -Rm, 0, Rm, 0, [[0, `rgba(20,10,3,${0.3 + 0.2 * lit})`], [0.2, 'rgba(20,10,3,0)'], [0.8, 'rgba(20,10,3,0)'], [1, `rgba(20,10,3,${0.3 - 0.2 * lit})`]]);
  g.fillRect(-ext, -hw, ext * 2, hw * 2);
  g.restore();
  g.restore();
  // the knot, on top of the lashing: two short tails, a bow of two loops, the knot itself
  const side = r.sign(), kx = mx + nx * side * Rm * 0.1, ky = my + ny * side * Rm * 0.1, wk = w * 0.9;
  const dir = (da, dn) => { const jt = r.range(-0.15, 0.15), cj = Math.cos(jt), sj = Math.sin(jt), x = ax * da + nx * dn, y = ay * da + ny * dn, l = Math.hypot(x, y) || 1; return [(x * cj - y * sj) / l, (x * sj + y * cj) / l]; };
  for (const s of [1, -1]) {
    const [dx, dy] = dir(s * 0.85, -side * 0.7), len = w * r.range(2.7, 3.5), bend = w * r.range(-0.8, 0.8);
    const end = [kx + dx * len, ky + dy * len], tp = quad([kx, ky], [kx + dx * len * 0.5 - dy * bend, ky + dy * len * 0.5 + dx * bend], end, 16);
    rope(g, tp, wk, col);
    const p2 = tp[tp.length - 3], ea = Math.atan2(end[1] - p2[1], end[0] - p2[0]);
    g.save(); g.lineCap = 'round';
    for (let f = 0; f < 6; f++) {                                                      // the frayed end
      const fa = ea + r.range(-0.55, 0.55), fl = w * r.range(0.6, 1.3), fx = end[0] + r.range(-0.25, 0.25) * w, fy = end[1] + r.range(-0.25, 0.25) * w;
      g.strokeStyle = L.rgba(col[f % 3], 0.92); g.lineWidth = Math.max(0.3, w * r.range(0.09, 0.16));
      g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl); g.stroke();
    }
    g.strokeStyle = L.rgba(col[2], 0.9); g.lineWidth = Math.max(0.4, w * 0.24); g.lineCap = 'butt';   // the whipping just before it
    g.beginPath(); g.moveTo(p2[0] - Math.sin(ea) * wk * 0.5, p2[1] + Math.cos(ea) * wk * 0.5); g.lineTo(p2[0] + Math.sin(ea) * wk * 0.5, p2[1] - Math.cos(ea) * wk * 0.5); g.stroke();
    g.restore();
  }
  for (const s of [1, -1]) {
    const [dx, dy] = dir(s, side * 0.55), ll = w * r.range(2.4, 3), lw = w * r.range(1.3, 1.7), lp = [];
    for (let i = 0; i <= 26; i++) { const t = i / 26, al = ll * Math.sin(Math.PI * t), la = lw * 0.5 * Math.sin(TAU * t) * s; lp.push([kx + dx * al - dy * la, ky + dy * al + dx * la]); }
    rope(g, lp, wk, col);
  }
  g.save(); g.shadowColor = 'rgba(22,12,4,0.6)'; g.shadowBlur = w * 0.6; g.shadowOffsetX = w * 0.3; g.shadowOffsetY = w * 0.46;
  g.fillStyle = L.radial(g, kx - w * 0.32, ky - w * 0.38, w * 0.1, w * 1.25, [[0, col[0]], [0.5, col[1]], [1, col[2]]]);
  g.beginPath(); g.ellipse(kx, ky, w * 1.02, w * 0.84, Math.atan2(ny, nx), 0, TAU); g.fill(); g.restore();
  g.save(); g.translate(kx, ky); g.rotate(Math.atan2(ny, nx)); g.lineCap = 'round';
  g.strokeStyle = L.rgba(col[2], 0.7); g.lineWidth = Math.max(0.3, w * 0.14);
  for (const o of [-0.45, 0.08, 0.6]) { g.beginPath(); g.moveTo((o - 0.3) * w, -0.7 * w); g.quadraticCurveTo((o + 0.3) * w, 0, (o - 0.2) * w, 0.7 * w); g.stroke(); }
  g.restore();
  g.fillStyle = 'rgba(255,252,240,0.5)'; g.beginPath(); g.ellipse(kx - w * 0.3, ky - w * 0.34, w * 0.3, w * 0.16, -0.7, 0, TAU); g.fill();
}

/** the bundles: beads from K.pack, neighbours on the same stroke joined in twos (or threes), coins staggered along each group */
function layout(info) {
  const sw = info.strokeWidth, R1 = sw * 0.5, POKE = Math.min(3.2, sw * 0.045), q = L.SS;
  const depth = (x, y) => -K.sdGlyph(x, y);
  const discs = K.pack({ seed: 'p13cord', rmax: R1, rmin: R1 * 0.42, gap: 1, margin: -POKE * 0.7 });
  const N = discs.length, angDiff = (a, b) => { const d = Math.abs(a - b) % Math.PI; return d > Math.PI / 2 ? Math.PI - d : d; };
  // each bead's nearest neighbour up and down its own stroke
  const nb = discs.map((A, i) => {
    const ca = Math.cos(A.ang), sa = Math.sin(A.ang); let f = -1, fd = 1e9, bk = -1, bd = 1e9;
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const Bd = discs[j], dx = Bd.x - A.x, dy = Bd.y - A.y, d = Math.hypot(dx, dy);
      if (d > (A.r + Bd.r) * 1.3 || Math.min(A.r, Bd.r) < Math.max(A.r, Bd.r) * 0.62) continue;
      const al = (dx * ca + dy * sa) / d;
      if (Math.abs(al) < 0.8 || angDiff(Math.atan2(dy, dx), Bd.ang) > 0.7) continue;                 // the chord has to run along both beads' strokes
      if (depth(A.x + dx * 0.5, A.y + dy * 0.5) < Math.min(A.r, Bd.r) * 0.55) continue;              // …and stay inside the ink (not jump to the next stroke)
      if (al > 0) { if (d < fd) { fd = d; f = j; } } else if (d < bd) { bd = d; bk = j; }
    }
    return [f, bk];
  });
  const links = discs.map(() => []);
  nb.forEach((pair, i) => { for (const j of pair) if (j >= 0 && nb[j].includes(i) && !links[i].includes(j)) links[i].push(j); });
  const seen = new Uint8Array(N), chains = [];
  const walk = (s) => { const c = []; let a = s, p = -1; while (a >= 0 && !seen[a]) { seen[a] = 1; c.push(a); const nx = links[a].find((j) => j !== p && !seen[j]); p = a; a = nx === undefined ? -1 : nx; } return c; };
  for (let i = 0; i < N; i++) if (!seen[i] && links[i].length < 2) chains.push(walk(i));
  for (let i = 0; i < N; i++) if (!seen[i]) chains.push(walk(i));
  const groups = [];
  for (const c of chains) for (let i = 0; i < c.length;) { const take = c.length - i === 3 ? 3 : Math.min(2, c.length - i); groups.push(c.slice(i, i + take)); i += take; }

  const out = [];
  for (const grp of groups) {
    const A = grp.map((i) => discs[i]), key = info.key + Math.round(A[0].x) + '_' + Math.round(A[0].y), r = L.rng('p13b' + key), st = [];
    if (A.length === 1) {                                           // a lone bead: a short pile along the stroke
      const a = A[0], n = a.r > R1 * 0.6 ? 3 : 2, sp = a.r * (n === 3 ? 0.5 : 0.6), ca = Math.cos(a.ang), sa = Math.sin(a.ang);
      for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * sp; st.push({ x: a.x + ca * o, y: a.y + sa * o, r: a.r }); }
    } else {                                                        // coins staggered from the first bead to the last
      const cum = [0]; for (let i = 1; i < A.length; i++) cum.push(cum[i - 1] + Math.hypot(A[i].x - A[i - 1].x, A[i].y - A[i - 1].y));
      const D = cum[cum.length - 1], ra = A.reduce((s, a) => s + a.r, 0) / A.length, n = 1 + Math.max(2, Math.round(D / (ra * r.range(0.5, 0.62))));
      for (let k = 0; k < n; k++) {
        const s = (k / (n - 1)) * D; let i = 1; while (i < A.length - 1 && cum[i] < s) i++;
        const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        st.push({ x: L.lerp(A[i - 1].x, A[i].x, t), y: L.lerp(A[i - 1].y, A[i].y, t), r: L.lerp(A[i - 1].r, A[i].r, t) });
      }
    }
    // the top coin usually sits at the upper-left end, so that its shadow falls on the coins below it
    const lastUL = (st[st.length - 1].x + st[st.length - 1].y) < (st[0].x + st[0].y);
    if (lastUL !== r.chance(0.7)) st.reverse();
    let ax = st[st.length - 1].x - st[0].x, ay = st[st.length - 1].y - st[0].y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const axA = Math.atan2(ay, ax), pb = r.chance(0.45) ? 0 : r.int(1, 3), coins = [];
    st.forEach((s, k) => {
      const want = s.r * r.range(0.95, 1);
      let x = s.x + r.range(-0.03, 0.03) * s.r, y = s.y + r.range(-0.03, 0.03) * s.r, d = depth(x, y);
      for (let it = 0; it < 6 && d + POKE < want; it++) {           // settle toward the middle of the stroke until the coin fits
        const nn = K.glyphNormal(x, y, 2), qx = x - nn.x * 1.2, qy = y - nn.y * 1.2, d2 = depth(qx, qy);
        if (d2 <= d) break; x = qx; y = qy; d = d2;
      }
      const R = Math.min(want, d + POKE);                           // never more than POKE px (plus half its edge) over the outline
      if (R < s.r * 0.5 || R < 3) return;
      let tx = r.range(-0.02, 0.02), ty = r.range(-0.02, 0.02); const prev = coins[coins.length - 1];
      if (prev) { const dx = x - prev.x, dy = y - prev.y, dl = Math.hypot(dx, dy) || 1; tx -= 0.14 * dx / dl; ty -= 0.14 * dy / dl; }   // it leans on the coin below
      const ex = R * 0.06, ey = R * 0.1, half = Math.ceil(R + ey + 2);
      x -= ex * 0.5; y -= ey * 0.5;                                // face + edge together sit centred on the stroke
      const ox = Math.round((x - half) * q) / q, oy = Math.round((y - half) * q) / q;
      coins.push({ x, y, R, rot: axA + r.range(-0.2, 0.2) + (r.chance(0.15) ? r.range(-0.5, 0.5) : 0), pal: r.chance(0.8) ? pb : r.int(0, 3), seed: key + '_' + k,
        tx, ty, ex, ey, size: half * 2, ox, oy, cx: x - ox, cy: y - oy });
    });
    if (!coins.length) continue;
    const Rb = coins.reduce((s, c) => s + c.R, 0) / coins.length;
    out.push({ coins, key, ax, ay, w: clamp(Rb * 0.145, 1.5, 6.5), cx: coins.reduce((s, c) => s + c.x, 0) / coins.length, cy: coins.reduce((s, c) => s + c.y, 0) / coins.length, ci: 0, col: null });
  }
  out.sort((a, b) => (b.cx + b.cy) - (a.cx + a.cy));              // lower-right first: every shadow then falls on something already there
  const rc = L.rng('p13col' + info.key);
  out.forEach((b, i) => {                                           // cord colours: keep bundles of one colour apart
    let best = 0, bs = -1;
    for (let c = 0; c < CORD.length; c++) {
      let dm = 1e9; for (let j = 0; j < i; j++) if (out[j].ci === c) dm = Math.min(dm, Math.hypot(out[j].cx - b.cx, out[j].cy - b.cy));
      const sc = Math.min(dm, sw * 6) + rc() * sw * 0.8 + (c === 0 ? sw * 0.3 : 0);
      if (sc > bs) { bs = sc; best = c; }
    }
    b.ci = best; b.col = CORD[best];
  });
  return out;
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, W = S + PAD * 2;
  TILE = TILE || noiseTile();
  const c = L.makeCanvas(W, W), g = c.getContext('2d', { alpha: false });      // the page is opaque: cheaper to draw every frame
  g.drawImage(K.paper({ base: '#e9e7df', tone: '#6e685a', seed: 'p13paper', fiber: 0.65, stain: 0.2, foxing: 0.06, edge: 0.14, size: W }), 0, 0);
  g.translate(PAD, PAD);
  const B = layout(info);
  // what the piles throw on the paper: a soft pool of shade, the cast shadow (toward the lower right), the dark line of contact
  const sil = L.makeCanvas(W, W), sg = sil.getContext('2d'); sg.translate(PAD, PAD); sg.fillStyle = '#2a1c0e';
  for (const b of B) for (const k of b.coins) { sg.beginPath(); sg.arc(k.x, k.y, k.R, 0, TAU); sg.fill(); sg.beginPath(); sg.arc(k.x + k.ex, k.y + k.ey, k.R, 0, TAU); sg.fill(); }
  const shade = (blur, dx, dy, a) => { g.globalAlpha = a; g.drawImage(L.blurred(sil, blur), dx - PAD, dy - PAD); };
  shade(sw * 0.34, sw * 0.07, sw * 0.1, 0.2);
  shade(sw * 0.12, sw * 0.085, sw * 0.125, 0.4);
  shade(sw * 0.035, sw * 0.02, sw * 0.03, 0.6);
  g.globalAlpha = 1;
  for (const b of B) {
    for (const k of b.coins) {
      const spr = coinSprite(k);
      g.save();
      g.shadowColor = 'rgba(24,14,5,0.56)'; g.shadowBlur = k.R * 0.22; g.shadowOffsetX = k.R * 0.1; g.shadowOffsetY = k.R * 0.145; g.drawImage(spr, k.ox, k.oy);    // cast on the coins below
      g.shadowColor = 'rgba(20,11,4,0.62)'; g.shadowBlur = k.R * 0.05; g.shadowOffsetX = k.R * 0.02; g.shadowOffsetY = k.R * 0.032; g.drawImage(spr, k.ox, k.oy);  // contact
      g.restore();
    }
    drawCord(g, b);
  }
  return c;
}

export default {
  name: '彩绳钱串',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 0.988, z1: 1 });           // the faintest push-in, landing exactly on the glyph for the flash-cuts that follow
  },
};
