// p02 — 钱背墨拓册页: a leaf from a collector's album of ink rubbings (coin reverses) on xuan paper, panned slowly to the right.
// Each rubbing: black outer rim (外郭) and inner rim (内郭) parted from the mottled field by thin white lines, a white square hole,
// a few with a crescent (月纹) or a star dot; vermilion collector's seals cut in a 九叠篆-like fret that spells nothing; soft fold creases.
// How it is made (native at any L.SS, 4K masters included): the shapes are painted with paths into masks, read back as DEVICE pixels
// (L.getRaw) and turned into ink per device pixel (L.pixelCanvas): the dabber's ink density is broken up by the tooth of the paper,
// and the relief the damp sheet took from the coins is lit from the upper left — a highlight with a bright core on the slopes that
// face the lamp, a contact shadow plus a softer cast shadow on the others. Every quantity comes from logical coordinates; q only makes it finer.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const TAU = Math.PI * 2;
const LS = 1400;                                            // layer is larger than the frame: 160 px spare on every side
// The part of the leaf the camera ever shows (the drift covers x 102…1287, y 156…1236) plus a margin. All per-pixel work happens in
// this window only. VX / VY are whole logical pixels, so the window lands exactly on the device grid.
const VX = 84, VY = 138, VW = 1220, VH = 1116;
let layer = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const nA = L.makeNoise('p02a'), nB = L.makeNoise('p02b'), nC = L.makeNoise('p02c');
const C1 = Math.cos(0.5), S1 = Math.sin(0.5), C2 = Math.cos(-0.9), S2 = Math.sin(-0.9);   // the two ways most fibres of the sheet lie
const INK = [16, 14, 12], GREY = [66, 60, 53], SHEEN = [176, 170, 158], SHADE = [60, 46, 30], LIGHT = [255, 253, 246];

// the tooth of the paper as the dabber (or the seal) meets it, ≈ N(0, 1): fibre-long grains in two directions, clumps of a few
// pixels, and a pinch of per-device-pixel sparkle. (x, y) logical, (i, j) the device pixel.
function tooth(x, y, i, j) {
  const u1 = x * C1 + y * S1, v1 = y * C1 - x * S1, u2 = x * C2 + y * S2, v2 = y * C2 - x * S2;
  return 0.45 * nC.n2(x / 0.7 - 9, y / 0.7 + 4) + nC.n2(u1 / 4.5 + 5.5, v1 / 0.9 - 3.5) + nB.n2(u2 / 5 - 21, v2 + 8)
    + 0.9 * nA.n2(x / 2.6, y / 2.2) + 0.7 * nA.n2(x / 7 + 40, y / 5) + 0.4 * (hash2(i, j) - 0.5);
}
/** box blur (radius r cells) of a W × H field, in place; two passes make a soft triangle filter. Both directions walk the rows. */
function blurBox(a, W, H, r, passes = 2) {
  const n = 2 * r + 1, t = new Float32Array(W), acc = new Float64Array(W), b = new Float32Array(a.length), mw = W - 1, mh = H - 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      const o = y * W; let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + (x < 0 ? 0 : x > mw ? mw : x)];
      for (let x = 0; x < W; x++) { t[x] = s / n; const e = x + r + 1, l = x - r; s += a[o + (e > mw ? mw : e)] - a[o + (l < 0 ? 0 : l)]; }
      a.set(t, o);
    }
    acc.fill(0);                                              // one running sum per column
    for (let y = -r; y <= r; y++) { const o = (y < 0 ? 0 : y > mh ? mh : y) * W; for (let x = 0; x < W; x++) acc[x] += a[o + x]; }
    for (let y = 0; y < H; y++) {
      const o = y * W, oe = (y + r + 1 > mh ? mh : y + r + 1) * W, ol = (y - r < 0 ? 0 : y - r) * W;
      for (let x = 0; x < W; x++) { b[o + x] = acc[x] / n; acc[x] += a[oe + x] - a[ol + x]; }
    }
    a.set(b);
  }
  return a;
}
/** a slow field over the window, sampled on a coarse grid and read bilinearly: at(x, y) in leaf coordinates */
function coarse(step, fn) {
  const nx = Math.ceil(VW / step) + 2, ny = Math.ceil(VH / step) + 2, a = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) a[j * nx + i] = fn(VX + i * step, VY + j * step);
  return (x, y) => {
    const u = (x - VX) / step, v = (y - VY) / step, i = u | 0, j = v | 0, fx = u - i, fy = v - j, o = j * nx + i;
    return (a[o] * (1 - fx) + a[o + 1] * fx) * (1 - fy) + (a[o + nx] * (1 - fx) + a[o + nx + 1] * fx) * fy;
  };
}
/** a canvas over the window whose context works in leaf coordinates */
function winCtx() { const c = L.makeCanvas(VW, VH), g = c.getContext('2d'); g.translate(-VX, -VY); return g; }
/** one channel (0 = red … 3 = alpha) of a canvas's DEVICE pixels */
function channel(c, ch) {
  const raw = L.getRaw(c).data, n = raw.length >> 2, a = new Uint8Array(n);
  for (let k = 0; k < n; k++) a[k] = raw[k * 4 + ch];
  return a;
}

// closed, slightly irregular circle: radius rad with a deviation of ±dev px
function ringPath(g, rad, dev, f1, f2, ph) {
  const n = 120;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * TAU, rr = rad + dev * (Math.sin(t * f1 + ph) * 0.6 + Math.sin(t * f2 + ph * 2.3) * 0.4);
    const x = Math.cos(t) * rr, y = Math.sin(t) * rr; k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}
function rrect(g, h, cr) {
  g.moveTo(-h + cr, -h); g.lineTo(h - cr, -h); g.quadraticCurveTo(h, -h, h, -h + cr); g.lineTo(h, h - cr); g.quadraticCurveTo(h, h, h - cr, h);
  g.lineTo(-h + cr, h); g.quadraticCurveTo(-h, h, -h, h - cr); g.lineTo(-h, -h + cr); g.quadraticCurveTo(-h, -h, -h + cr, -h); g.closePath();
}
function crescent(g, cx, cy, w, th, grow) {
  const b = w * 0.62;
  g.beginPath(); g.moveTo(cx - w - grow, cy + grow * 0.3);
  g.quadraticCurveTo(cx, cy - b * 2 - grow * 2.2, cx + w + grow, cy + grow * 0.3);
  g.quadraticCurveTo(cx, cy - (b - th) * 2 + grow * 2.2, cx - w - grow, cy + grow * 0.3); g.closePath();
}
// one gently bent hair (a paper fibre, a scratch)
function fibre(g, x, y, len, an, bend) {
  g.beginPath(); g.moveTo(x, y);
  g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
}

// One rubbing of a coin reverse, as four masks painted with paths (so every edge is rasterised at device resolution):
//   F  where the dabber left a thin coat: the flat field (地章), smudges past the edge, ink that crept into the hole (alpha = how much)
//   R  what the bronze held up to the dabber: rims, cast marks, the lip of a corrosion crust — struck nearly solid
//   W  what stayed white: pits, loose fibres of the paper, nicks, hairline scratches, the lee of a crust
//   H  the relief the damp sheet took from the coin (grey = height)
function coinMasks(M, sp) {
  const { R, rimW, a, irW, line } = sp; const r = L.rng(sp.seed), rx = L.rng(sp.seed + 'x'), ph = r() * TAU;
  const mid = (a + irW + R - rimW) / 2, moon = sp.mark === 'moon' || sp.mark === 'both', star = sp.mark === 'star' || sp.mark === 'both';
  const mw = R * 0.2, mth = R * 0.055, my = -mid + mw * 0.45, sr = R * 0.042;
  const box = (gg) => { gg.beginPath(); gg.rect(-R - 40, -R - 40, 2 * R + 80, 2 * R + 80); gg.clip(); };   // keeps the filter layers as small as the coin
  let g = M.F; g.save(); g.translate(sp.x, sp.y); box(g); g.rotate(sp.rot);
  // grey smudges where the ink pad strayed past the edge of the coin
  g.filter = 'blur(5px)'; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const t0 = r() * TAU, lw = r.range(8, 20);
    g.strokeStyle = `rgba(255,255,255,${r.range(0.06, 0.16) * 1.35})`; g.lineWidth = lw;
    g.beginPath(); g.arc(0, 0, R + lw * 0.2, t0, t0 + r.range(0.5, 1.7)); g.stroke();
  }
  // field: parted from both rims and from the cast marks by the white lines where the paper could not reach
  g.filter = 'blur(0.5px)'; g.fillStyle = '#fff';
  g.beginPath(); ringPath(g, R - rimW - line, line * 0.55, 5, 11, ph); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); rrect(g, a + irW + line * 1.05, 5); g.fill();
  if (moon) { crescent(g, 0, my, mw, mth, line * 0.95); g.fill(); }
  if (star) { g.beginPath(); g.arc(0, mid, sr + line, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  // ink that crept a little into the hole along two sides
  g.filter = 'blur(2px)'; g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-a + 3, a - 3); g.lineTo(a - 3, a - 3); g.lineTo(a - 3, -a + 10); g.stroke();
  g.filter = 'none'; g.restore();

  // outer rim (外郭), inner rim (内郭) round the square hole, crescent (月纹) above the hole, star dot below
  g = M.R; g.save(); g.translate(sp.x, sp.y); box(g); g.rotate(sp.rot); g.fillStyle = '#fff'; g.filter = 'blur(0.5px)';
  g.beginPath(); ringPath(g, R, 0.9, 2, 3, ph + 1); ringPath(g, R - rimW, line * 0.3, 3, 7, ph + 2); g.fill('evenodd');
  g.beginPath(); rrect(g, a + irW, 3.5); rrect(g, a, 2); g.fill('evenodd');
  if (moon) { crescent(g, 0, my, mw, mth, 0); g.fill(); }
  if (star) { g.beginPath(); g.arc(0, mid, sr, 0, TAU); g.fill(); }
  g.filter = 'none'; g.restore();

  // relief: the body of the coin, both rims and the marks standing proud of the field, the sheet sagging into the hole
  g = M.H; g.save(); g.translate(sp.x, sp.y); g.rotate(sp.rot);
  g.fillStyle = '#fff'; g.beginPath(); ringPath(g, R, 0.9, 2, 3, ph + 1); g.fill();
  g.fillStyle = '#9e9e9e'; g.beginPath(); ringPath(g, R - rimW, line * 0.3, 3, 7, ph + 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); rrect(g, a + irW, 3.5); g.fill();
  g.fillStyle = '#383838'; g.beginPath(); rrect(g, a, 2); g.fill();
  g.fillStyle = '#f0f0f0';
  if (moon) { crescent(g, 0, my, mw, mth, 0); g.fill(); }
  if (star) { g.beginPath(); g.arc(0, mid, sr, 0, TAU); g.fill(); }
  g.restore();

  g = M.W; g.save(); g.translate(sp.x, sp.y); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
  // corrosion pits and casting flaws: small white specks, never a clean oval
  for (let i = 0; i < 46; i++) {
    const t = r() * TAU, d = r.range(a + irW + 8, R - 6), x = Math.cos(t) * d, y = Math.sin(t) * d, big = r.range(1.2, 4.2) * (r() < 0.15 ? 2 : 1);
    const s = big * 0.62, la = rx() * TAU;
    g.globalAlpha = r.range(0.45, 0.95) * (big > 4.4 ? 0.7 : 1);
    g.beginPath(); g.ellipse(x, y, s, s * r.range(0.45, 0.9), r() * 3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(x + Math.cos(la) * s * 0.7, y + Math.sin(la) * s * 0.55, s * rx.range(0.35, 0.6), s * rx.range(0.22, 0.42), rx() * 3, 0, TAU); g.fill();
  }
  // loose fibres of the xuan paper that stayed white
  for (let i = 0; i < 60; i++) {
    const x = r.range(-R, R), y = r.range(-R, R), len = r.range(7, 30), an = r() * TAU, bend = r.range(-0.7, 0.7);
    g.globalAlpha = Math.min(1, r.range(0.2, 0.6) * 1.3); g.lineWidth = r.range(0.6, 1.25) * 0.85;
    fibre(g, x, y, len, an, bend);
  }
  // nicks along the outer edge
  for (let i = 0; i < 50; i++) {
    const t = r() * TAU, d = R + r.range(-1.5, 1.2);
    g.globalAlpha = r.range(0.4, 0.9); g.beginPath(); g.ellipse(Math.cos(t) * d, Math.sin(t) * d, r.range(0.8, 2.6), r.range(0.6, 1.5), t + 1.57, 0, TAU); g.fill();
  }
  // hairline scratches from circulation: the paper bridged them, so they stayed white — singly, or two or three abreast
  for (let i = 0, n = rx.int(6, 9); i < n; i++) {
    const t = rx() * TAU, d0 = rx.range(a + irW + 6, R - 5), an = rx() * Math.PI, len = rx.range(16, 70), bend = rx.range(-0.1, 0.1);
    const k = rx() < 0.35 ? rx.int(2, 3) : 1, gap = rx.range(1.5, 2.4), ca = Math.cos(an), sa = Math.sin(an);
    for (let s = 0; s < k; s++) {
      const sl = rx.range(-4, 4), l2 = len * rx.range(0.7, 1);
      g.globalAlpha = rx.range(0.4, 0.85); g.lineWidth = rx.range(0.5, 0.95);
      fibre(g, Math.cos(t) * d0 - sa * gap * s + ca * (sl - l2 / 2), Math.sin(t) * d0 + ca * gap * s + sa * (sl - l2 / 2), l2, an, bend);
    }
  }
  // edges of corrosion crusts in the field: a white hairline where the sheet could not follow the step, the dabbed lip of the crust beside it
  const gl = M.R; gl.save(); gl.translate(sp.x, sp.y); gl.strokeStyle = '#fff'; gl.lineCap = 'round'; gl.lineJoin = 'round'; g.lineJoin = 'round';
  for (let i = 0, n = rx.int(2, 4); i < n; i++) {
    const t = rx() * TAU, d0 = rx.range(a + irW + 18, R - rimW - 16), cx = Math.cos(t) * d0, cy = Math.sin(t) * d0;
    const rad = rx.range(7, 19), e = rx.range(0.6, 1), tilt = t + rx.range(-0.6, 0.6), cr = Math.cos(tilt), sn = Math.sin(tilt);
    const p1 = rx() * TAU, p2 = rx() * TAU, f2 = rx.int(4, 6), t0 = rx() * TAU, span = rx.range(2.0, 4.4);
    const arc = (gg, kk) => {
      gg.beginPath();
      for (let s = 0; s <= 36; s++) {
        const tt = t0 + (span * s) / 36, rr = rad * kk * (1 + 0.14 * Math.sin(2 * tt + p1) + 0.07 * Math.sin(f2 * tt + p2)), px = Math.cos(tt) * rr, py = Math.sin(tt) * rr * e;
        const X = cx + px * cr - py * sn, Y = cy + px * sn + py * cr; s ? gg.lineTo(X, Y) : gg.moveTo(X, Y);
      }
      gg.stroke();
    };
    g.globalAlpha = rx.range(0.4, 0.7); g.lineWidth = rx.range(0.6, 1.0); arc(g, 1);
    gl.globalAlpha = rx.range(0.75, 1); gl.lineWidth = rx.range(0.9, 1.5); arc(gl, 1 - 1.5 / rad);
  }
  gl.restore(); g.restore();
}

// how much ink the dabber left on one rubbing, per device pixel (before the tooth of the paper breaks it up into grains)
function rubDensity(D, F, Rl, Wh, PW, PH, q, sp, broadAt) {
  const r = L.rng(sp.seed + 'ink'), so = r.range(0, 900), base = sp.dens - 0.09, rimD = r.range(1.04, 1.11);
  const a1 = 0.22 + sp.thin * 0.26, a2 = 0.2 + sp.thin * 0.2;                         // broad light passes of the pad; mottling over the pitted bronze
  const wa = r.range(0, Math.PI), wf = TAU / r.range(2.4, 3.0), wc = Math.cos(wa) * wf, ws = Math.sin(wa) * wf;   // weave of the dabber's silk
  const E = sp.R + 36;
  const i0 = Math.max(0, Math.floor((sp.x - E - VX) * q)), i1 = Math.min(PW - 1, Math.ceil((sp.x + E - VX) * q));
  const j0 = Math.max(0, Math.floor((sp.y - E - VY) * q)), j1 = Math.min(PH - 1, Math.ceil((sp.y + E - VY) * q));
  for (let j = j0; j <= j1; j++) {
    const y = VY + (j + 0.5) / q;
    for (let i = i0; i <= i1; i++) {
      const k = j * PW + i, f = F[k], rl = Rl[k];
      if (f === 0 && rl === 0) continue;
      const x = VX + (i + 0.5) / q;
      let d = 0;
      if (f !== 0) {
        const u = x / 38 + so, v = y / 38 - so;
        const m = 0.5 + 0.8 * nB.fbm(u + 0.25 * nA.n2(u / 2.5 + 31.4, v / 2.5 + 7.7), v + 0.25 * nA.n2(u / 2.5 - 11.9, v / 2.5 + 53.1), 4);
        const l2 = m <= 0.54 ? 0 : m < 0.76 ? ((m - 0.54) / 0.22) * a2 : a2 + ((m > 1 ? 1 : m) - 0.76) / 0.24 * (0.62 - a2);
        const bn = broadAt(x, y), l1 = bn > 0.5 ? (bn - 0.5) * 2 * a1 : 0;
        // + the sand-cast skin of the bronze: islands a few pixels across that took a little more, or a little less
        d = (f / 255) * (base * (1 - l1) * (1 - l2) + 0.1 * (sstep(-0.12, 0.12, nA.n2(x / 5.5 + so, y / 5.5)) - 0.5));
      }
      if (rl !== 0) {                                                                   // raised parts took the ink almost solid: only a light break-up
        const n = 0.5 + 0.8 * nB.fbm(x / 44 + so * 3, y / 44 + so, 3);
        const dr = (rl / 255) * rimD * (1 - (n > 0.6 ? (n > 1 ? 1 : (n - 0.6) / 0.4) * 0.3 : 0));
        if (dr > d) d = dr;
      }
      const w = Wh[k];
      if (w !== 0) { d = d * (1 - w / 255) - 0.3 * (w / 255); if (d < 0) d = 0; }
      if (d > 0.1) { const lx = x - sp.x, ly = y - sp.y; d += 0.05 * Math.sin(lx * wc + ly * ws) * Math.sin(ly * wc - lx * ws); }
      D[k] = d;
    }
  }
}

// The face of a seal in the manner of 九叠篆: the w × h field is cut into blocks five to seven grid steps a side, and every block is
// filled by ONE stroke folded back and forth — five runs or more, each at least three steps long, line and gap about equal, no
// junctions, no crossings, no closed boxes. A fret: it has the colour of seal script and can never be read as a character.
function fretFill(g, x, y, w, h, lw, r) {
  const pt = lw * 2.15, nx = Math.max(5, Math.round((w - lw) / pt) + 1), ny = Math.max(5, Math.round((h - lw) / pt) + 1);
  const sx = (w - lw) / (nx - 1), sy = (h - lw) / (ny - 1), blocks = [];
  const odd = (n) => n === 8 || n === 9;                                               // too short to cut again, too long to leave
  const cut = (i0, j0, a, b) => {
    const cx = a >= 10, cy = b >= 10;
    if ((cx || cy) && (Math.max(a, b) > 10 || a * b > 50 || r() < 0.3)) {
      const ax = cx && (!cy || r() < (a > b ? 0.75 : a < b ? 0.25 : 0.5)), n = ax ? a : b;
      let c = r.int(5, n - 5);
      for (let t = 0; t < 12 && (odd(c) || odd(n - c)); t++) c = r.int(5, n - 5);
      if (ax) { cut(i0, j0, c, b); cut(i0 + c, j0, a - c, b); } else { cut(i0, j0, a, c); cut(i0, j0 + c, a, b - c); }
    } else blocks.push([i0, j0, a, b]);
  };
  cut(0, 0, nx, ny);
  g.lineCap = 'butt'; g.lineJoin = 'miter'; g.miterLimit = 4;
  let horiz = r() < 0.5;
  for (const [i0, j0, a, b] of blocks) {
    horiz = r() < L.clamp(0.55 + 0.13 * (a - b) + (horiz ? -0.3 : 0.3), 0.12, 0.88);   // long blocks are folded the long way, mostly; neighbours tend to cross
    const n = horiz ? b : a, len = (horiz ? a : b) - 1, jit = [];                      // runs, and their length in grid steps
    for (let v = 0; v < n; v++) jit.push(r.range(-0.28, 0.28));                        // cut by hand: no two runs quite evenly spaced
    const P = (u, v) => (horiz ? [x + lw / 2 + (i0 + u) * sx, y + lw / 2 + (j0 + v) * sy + jit[v]] : [x + lw / 2 + (i0 + v) * sx + jit[v], y + lw / 2 + (j0 + u) * sy]);
    const pick = (room) => (room > 0 && r() < 0.3 ? Math.min(room, r() < 0.3 ? 2 : 1) : 0);   // some folds turn a step or two early
    let side = r() < 0.5 ? 1 : 0, ins = pick(len - 3), u = side ? len - ins : ins;
    g.lineWidth = lw * r.range(0.94, 1.06); g.beginPath();
    for (let v = 0; v < n; v++) {
      let p = P(u, v); v ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
      side = 1 - side; ins = pick(len - ins - 3); u = side ? len - ins : ins;
      p = P(u, v); g.lineTo(p[0], p[1]);
    }
    g.stroke();
  }
}
function roughRect(g, w, h, r, j) {
  const pts = []; const step = 9;
  for (let x = -w / 2; x < w / 2; x += step) pts.push([x, -h / 2]);
  for (let y = -h / 2; y < h / 2; y += step) pts.push([w / 2, y]);
  for (let x = w / 2; x > -w / 2; x -= step) pts.push([x, h / 2]);
  for (let y = h / 2; y > -h / 2; y -= step) pts.push([-w / 2, y]);
  g.beginPath(); pts.forEach(([x, y], i) => { const px = x + r.range(-j, j), py = y + r.range(-j, j); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath();
}
// where the seal laid its paste (alpha), around (0, 0). white = 白文 (solid ground, strokes left as paper); otherwise 朱文 (frame and strokes)
function sealMask(g, w, h, white, r) {
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineJoin = 'round';
  const fw = Math.max(3.4, w * 0.062);
  if (white) { roughRect(g, w, h, r, 0.9); g.fill(); g.globalCompositeOperation = 'destination-out'; }
  else { g.lineWidth = fw; roughRect(g, w - fw, h - fw, r, 0.7); g.stroke(); }
  const m = white ? w * 0.1 : fw + w * 0.085;
  fretFill(g, -w / 2 + m, -h / 2 + m, w - 2 * m, h - 2 * m, white ? L.clamp(w * 0.0235, 2.0, 2.3) : 2.3, r);
  // chipped edge
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const side = r.int(0, 3), u = r.range(-0.5, 0.5), x = side < 2 ? u * w : (side === 2 ? -w / 2 : w / 2), y = side < 2 ? (side === 0 ? -h / 2 : h / 2) : u * h;
    g.globalAlpha = r.range(0.5, 1); g.beginPath(); g.ellipse(x, y, r.range(1, 3.4), r.range(0.8, 2.2), r() * 3, 0, TAU); g.fill();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
// A vermilion collector's seal, shaded per device pixel in leaf space: the paste is thick — it fills the tooth of the paper except where
// the seal was inked thin, piles up darker along the edges of the strokes, and stands a hair proud of the sheet (lit lip, shaded lip).
function buildSeal(s, seed) {
  const q = L.SS, r = L.rng(seed), hw = Math.ceil(Math.hypot(s.w, s.h) / 2) + 8, bw = hw * 2, bx = Math.round(s.x) - hw, by = Math.round(s.y) - hw;
  const mc = L.makeCanvas(bw, bw), g = mc.getContext('2d');
  g.translate(s.x - bx, s.y - by); g.rotate(s.rot);
  sealMask(g, s.w, s.h, s.white, r);
  const al = channel(mc, 3), pw = bw * q, M = new Float32Array(pw * pw);
  for (let k = 0; k < M.length; k++) M[k] = al[k] / 255;
  const B = blurBox(M.slice(), pw, pw, Math.max(1, Math.round(q)), 1), so = r.range(0, 500);
  const c = L.pixelCanvas(bw, bw, (px) => {
    for (let j = 1; j < pw - 1; j++) {
      const y = by + (j + 0.5) / q;
      for (let i = 1; i < pw - 1; i++) {
        const k = j * pw + i, b = B[k];
        if (b < 0.004) continue;
        const x = bx + (i + 0.5) / q, m = M[k], lit = ((B[k + 1] - B[k - 1]) * 0.62 + (B[k + pw] - B[k - pw]) * 0.78) * q * 0.5;
        let tone = 0, cr = 0, cg = 0, cb = 0;
        if (m > 0.004) {
          const nz = 0.5 + 0.85 * nB.fbm(x / 22 + so, y / 22 - so, 3);                  // uneven take-up of the paste
          const loss = nz <= 0.52 ? 0 : nz < 0.8 ? ((nz - 0.52) / 0.28) * 0.45 : 0.45 + ((nz > 1 ? 1 : nz) - 0.8) / 0.2 * 0.4;
          const d = m * (1.04 - 0.62 * loss), ia = sstep(-0.35, 0.35, (d - 0.5) * 3.9 + tooth(x, y, i, j)) * sstep(0, 0.2, m);
          tone = ia * 0.95 + (1 - ia) * 0.2 * sstep(0.3, 0.8, d);
          const cn = clamp01(0.5 + 0.9 * nA.fbm(x / 40 + so, y / 40 + 5, 3));         // #9c2416 … #b7301e … #cf4a31
          if (cn < 0.5) { const t = cn * 2; cr = 156 + 27 * t; cg = 36 + 12 * t; cb = 22 + 8 * t; } else { const t = cn * 2 - 1; cr = 183 + 24 * t; cg = 48 + 26 * t; cb = 30 + 19 * t; }
          const mul = (1 - 0.2 * (1 - sstep(0.5, 0.97, b))) * (lit < 0 ? 1 - Math.min(0.3, -lit * 1.1) : 1);
          cr *= mul; cg *= mul; cb *= mul;
          if (lit > 0) { const sp = Math.min(0.42, lit * 1.5) * ia; cr += (244 - cr) * sp; cg += (140 - cg) * sp; cb += (108 - cb) * sp; }
        }
        const pT = 1 - tone, wH = (lit > 0 ? Math.min(0.24, lit * 0.8) : 0) * pT, wS = (lit < 0 ? Math.min(0.22, -lit * 0.75) : 0) * pT, A = wS + wH + tone;
        if (A < 0.003) continue;
        const o = k * 4;
        px[o] = (96 * wS + LIGHT[0] * wH + cr * tone) / A; px[o + 1] = (40 * wS + LIGHT[1] * wH + cg * tone) / A; px[o + 2] = (26 * wS + LIGHT[2] * wH + cb * tone) / A;
        px[o + 3] = A * 255;
      }
    }
  });
  return { c, x: bx, y: by };
}

// a soft fold in the leaf: a valley line with a lit and a shaded flank
function crease(g, vertical, pos, r, strength) {
  g.save();
  if (!vertical) { g.translate(0, LS); g.rotate(-Math.PI / 2); g.translate(0, 0); }
  const x = vertical ? pos : LS - pos;
  g.fillStyle = L.linear(g, x - 34, 0, x + 34, 0, [[0, 'rgba(255,250,235,0)'], [0.4, `rgba(255,250,235,${0.1 * strength})`], [0.5, `rgba(90,66,34,${0.13 * strength})`], [0.62, `rgba(90,66,34,${0.05 * strength})`], [1, 'rgba(90,66,34,0)']]);
  g.fillRect(x - 34, 0, 68, LS);
  g.lineCap = 'round';
  let y = -10, xx = x;
  while (y < LS + 10) {
    const len = r.range(30, 120), nx = x + r.range(-1.3, 1.3);
    if (r() < 0.86) {
      g.strokeStyle = `rgba(84,62,34,${r.range(0.14, 0.34) * strength})`; g.lineWidth = r.range(0.8, 1.5);
      g.beginPath(); g.moveTo(xx + 0.7, y); g.lineTo(nx + 0.7, y + len); g.stroke();
      g.strokeStyle = `rgba(255,252,240,${r.range(0.25, 0.5) * strength})`; g.lineWidth = r.range(0.8, 1.4);
      g.beginPath(); g.moveTo(xx - 0.8, y); g.lineTo(nx - 0.8, y + len); g.stroke();
    }
    y += len; xx = nx;
  }
  g.restore();
}

function build() {
  const q = L.SS, PW = VW * q, PH = VH * q, NP = PW * PH;
  const c = L.makeCanvas(LS, LS), g = c.getContext('2d'), r = L.rng('p02'), fr = L.rng('p02fine');
  // xuan paper leaf
  g.drawImage(K.paper({ size: LS, base: '#ece4d0', tone: '#8c6c40', seed: 'p02paper', fiber: 0.9, stain: 0.32, foxing: 0.3, edge: 0.1 }), 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {                                    // long bark fibres: the pale ones lie ON the sheet and throw a hair of shadow
    const x = r() * LS, y = r() * LS, len = r.range(18, 90), an = r() * TAU, bend = r.range(-0.8, 0.8), pale = r() < 0.55;
    const al = pale ? r.range(0.12, 0.3) : r.range(0.05, 0.13); g.lineWidth = r.range(0.6, 1.3);
    if (pale) { g.strokeStyle = `rgba(104,80,46,${al * 0.32})`; fibre(g, x + 0.45, y + 0.6, len, an, bend); g.strokeStyle = `rgba(255,253,244,${al})`; }
    else g.strokeStyle = `rgba(120,92,52,${al})`;
    fibre(g, x, y, len, an, bend);
  }
  for (let i = 0; i < 900; i++) {                                    // finer hairs, only seen close up
    const x = fr() * LS, y = fr() * LS, len = fr.range(5, 26), an = fr() * TAU, bend = fr.range(-0.9, 0.9), al = fr.range(0.1, 0.26);
    g.lineWidth = fr.range(0.35, 0.7);
    g.strokeStyle = `rgba(104,80,46,${al * 0.3})`; fibre(g, x + 0.3, y + 0.4, len, an, bend);
    g.strokeStyle = `rgba(255,253,244,${al})`; fibre(g, x, y, len, an, bend);
  }

  // the rubbings: three rows, four columns, cropped by the frame
  const X = [44, 484, 922, 1362], Y = [258, 700, 1142];
  const marks = { '1,1': 'moon', '2,1': null, '2,0': 'star', '1,2': null, '0,1': 'both', '3,1': 'moon', '1,0': null, '2,2': 'moon' };
  const coins = [];
  Y.forEach((y, j) => X.forEach((x, i) => {
    const R = r.range(160, 182);
    coins.push({ x: x + r.range(-7, 7), y: y + r.range(-7, 7), R, rimW: R * r.range(0.105, 0.15), a: R * r.range(0.255, 0.285), irW: R * r.range(0.06, 0.082),
      line: r.range(2.8, 4.2), rot: r.range(-0.07, 0.07), dens: r.range(0.88, 0.97), thin: r(), mark: marks[i + ',' + j] || null, seed: 'p02c' + i + '_' + j });
  }));
  // faint damp halo the wet paper left around each coin
  for (const k of coins) {
    g.fillStyle = L.radial(g, k.x, k.y, k.R * 0.9, k.R * 1.22, [[0, 'rgba(120,100,70,0.10)'], [0.5, 'rgba(120,100,70,0.05)'], [1, 'rgba(120,100,70,0)']]);
    g.fillRect(k.x - k.R * 1.3, k.y - k.R * 1.3, k.R * 2.6, k.R * 2.6);
  }

  // ── the rubbings as masks (paths), then per DEVICE pixel: ink density D, relief H ──
  const M = { F: winCtx(), R: winCtx(), W: winCtx(), H: winCtx() };
  M.H.fillStyle = '#000'; M.H.fillRect(VX, VY, VW, VH);
  for (const k of coins) coinMasks(M, k);
  const F = channel(M.F.canvas, 3), Rl = channel(M.R.canvas, 3), Wh = channel(M.W.canvas, 3), D = new Float32Array(NP);
  const broadAt = coarse(8, (x, y) => clamp01(0.5 + 0.75 * nB.fbm(x / 170, y / 170, 3)));
  for (const k of coins) rubDensity(D, F, Rl, Wh, PW, PH, q, k, broadAt);
  // the sheet is soft: H1 keeps the crisp edge of the relief (σ ≈ 1 px), H2 its rounded shoulder (σ ≈ 3.5 px), Hw what throws the long shadow
  const hb = channel(M.H.canvas, 0), H1 = new Float32Array(NP), b1 = Math.max(1, Math.round(q));
  for (let k = 0; k < NP; k++) H1[k] = hb[k] / 255;
  const H2 = blurBox(H1.slice(), PW, PH, 4 * b1), Hw = blurBox(H2.slice(), PW, PH, 8 * b1, 1);
  blurBox(H1, PW, PH, b1);
  const liftAt = coarse(10, (x, y) => clamp01(0.5 + 0.9 * nA.fbm(x / 90, y / 90, 3)));                                    // the lamp-black is not one black
  const cockAt = coarse(12, (x, y) => nB.fbm((x + 14) / 420, (y + 18) / 420, 2) - nB.fbm((x - 14) / 420, (y - 18) / 420, 2));   // the leaf does not lie dead flat
  const laidAt = coarse(16, (x, y) => 1.2 * nA.n2(x / 260, y / 90));                                                       // the papermaker's screen was not ruled

  const ink = L.pixelCanvas(VW, VH, (px, pw, ph) => {
    const offC = Math.round(4 * q) * pw + Math.round(3 * q), offS = Math.round(10 * q) * pw + Math.round(8 * q), hq = q * 0.5, LF = TAU / 7.6;
    for (let j = 1; j < ph - 1; j++) {
      const y = VY + (j + 0.5) / q;
      for (let i = 1; i < pw - 1; i++) {
        const k = j * pw + i, x = VX + (i + 0.5) / q, d = D[k], h1 = H1[k];
        // slope of the relief per logical px against a lamp at the upper left ( > 0: faces it ): crisp edge + rounded shoulder
        const s1 = ((H1[k + 1] - H1[k - 1]) * 0.62 + (H1[k + pw] - H1[k - pw]) * 0.78) * hq;
        const s2 = ((H2[k + 1] - H2[k - 1]) * 0.62 + (H2[k + pw] - H2[k - pw]) * 0.78) * hq;
        const kc = k - offC, ks = k - offS;
        const cast = kc >= 0 ? clamp01((H2[kc] - h1) * 1.3) : 0, soft = ks >= 0 ? clamp01((Hw[ks] - Hw[k]) * 1.25) : 0;
        let tone = 0, cr = 0, cg = 0, cb = 0;
        if (d > 0.004) {
          // ink sits on the high points of the paper: grains where density + tooth clear the threshold, a thin wash soaked in between them
          const t = tooth(x, y, i, j), ia = sstep(-0.35, 0.35, (d - 0.5) * 3.3 + t) * sstep(0, 0.14, d), deep = sstep(0.3, 0.85, d);
          const lit = s1 + 0.8 * s2, lf = liftAt(x, y) * deep;
          tone = ia * (0.8 + 0.17 * deep) + (1 - ia) * 0.15 * deep;
          cr = GREY[0] + (INK[0] - GREY[0]) * deep + 24 * lf; cg = GREY[1] + (INK[1] - GREY[1]) * deep + 21 * lf; cb = GREY[2] + (INK[2] - GREY[2]) * deep + 18 * lf;
          if (lit > 0) {                                          // a slope that faces the lamp: the dabber skimmed it and the dry ink shines — soft sheen, bright core
            const sp = (sstep(0.02, 0.2, lit) * 0.16 + sstep(0.17, 0.32, lit) * 0.38) * (1 + 0.25 * (t > 1.5 ? 1.5 : t < -1.5 ? -1.5 : t)) * ia;
            cr += (SHEEN[0] - cr) * sp; cg += (SHEEN[1] - cg) * sp; cb += (SHEEN[2] - cb) * sp;
            tone *= 1 - Math.min(0.5, lit * 1.6) * 0.12;
          } else {                                                // turned away: ink pooled there, and it lies in shade
            const dk = 1 - Math.min(0.5, -lit * 2); cr *= dk; cg *= dk; cb *= dk;
            tone += Math.min(0.5, -lit * 1.6) * 0.3 * (1 - tone);
          }
          const sd = 1 - 0.35 * cast; cr *= sd; cg *= sd; cb *= sd;
        }
        // the bare sheet: highlight on what faces the lamp, contact shadow + a softer cast shadow on what does not
        let hl = (s1 > 0 ? s1 * 3.0 : 0) + (s2 > 0 ? s2 * 1.9 : 0);
        let sa = (s1 < 0 ? Math.min(0.6, -s1 * 2.4) : 0) + (s2 < 0 ? -s2 * 1.4 : 0) + cast * 0.34 + soft * 0.28;
        if (tone < 0.9) {
          // …and its own surface: fibres felted two ways (lit side, shaded side), a fine tooth, the slow cockle, the laid lines of the screen
          const u1 = x * C1 + y * S1, v1 = y * C1 - x * S1, u2 = x * C2 + y * S2, v2 = y * C2 - x * S2;
          const fa = nC.n2(u1 / 6.5 + 3, v1 / 0.85) - nC.n2((u1 + 0.74) / 6.5 + 3, (v1 + 0.31) / 0.85);
          const fb = nB.n2(u2 / 6 - 8, v2 / 0.8) - nB.n2((u2 - 0.18) / 6 - 8, (v2 + 0.78) / 0.8);
          const mt = 0.55 * fa + 0.55 * fb + 0.3 * nA.n2(x / 0.9 + 70, y / 0.9 - 30), ck = cockAt(x, y);
          if (mt > 0) hl += mt * 0.12; else sa -= mt * 0.06;
          if (ck > 0) hl += ck * 0.25; else sa -= ck * 0.1;
          sa += sstep(0.82, 1, Math.cos((y + laidAt(x, y)) * LF)) * 0.018;
        }
        if (hl > 0.92) hl = 0.92; if (sa > 0.8) sa = 0.8;
        const pT = 1 - tone, wS = sa * (1 - hl) * pT, wH = hl * pT, A = wS + wH + tone;
        if (A < 0.003) continue;
        const o = k * 4;
        px[o] = (SHADE[0] * wS + LIGHT[0] * wH + cr * tone) / A; px[o + 1] = (SHADE[1] * wS + LIGHT[1] * wH + cg * tone) / A; px[o + 2] = (SHADE[2] * wS + LIGHT[2] * wH + cb * tone) / A;
        px[o + 3] = A * 255;
      }
    }
  });
  g.drawImage(ink, VX, VY);

  // fold creases
  crease(g, true, 1146, L.rng('p02f1'), 0.8);
  crease(g, false, 486, L.rng('p02f2'), 0.5);

  // collector's seals in the gaps between the rubbings
  const seals = [
    { x: 704, y: 924, w: 98, h: 98, white: true, rot: -0.03 },
    { x: 264, y: 470, w: 56, h: 106, white: false, rot: 0.035 },
    { x: 1108, y: 936, w: 50, h: 50, white: true, rot: 0.06 },
  ];
  seals.forEach((s, i) => {
    const sp = buildSeal(s, 'p02seal' + i);
    g.save(); g.translate(s.x, s.y); g.rotate(s.rot);
    const rr = Math.max(s.w, s.h);                                   // oil of the seal paste soaking outwards
    g.fillStyle = L.radial(g, 0, 0, rr * 0.3, rr * 0.9, [[0, 'rgba(200,90,50,0.10)'], [1, 'rgba(200,90,50,0)']]); g.fillRect(-rr, -rr, rr * 2, rr * 2);
    g.restore();
    g.drawImage(sp.c, sp.x, sp.y);
  });
  // the lamp stands at the upper left: the leaf falls off a little towards the lower right
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, 100, 150, 1290, 1240, [[0, '#ffffff'], [0.5, '#fcf9f3'], [1, '#eee8da']]); g.fillRect(0, 0, LS, LS);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '钱背墨拓册页',
  init() { layer = build(); },
  draw(ctx, env, p) {
    // the camera travels slowly to the right: the leaf slides left
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.02, x0: 58, y0: 4, x1: -58, y1: -4 });
  },
};
