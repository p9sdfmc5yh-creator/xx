// g10 — 红绳: red silk cord laid on cream paper so that it spells the CURRENT glyph (whatever the player selected).
// The cord runs doubled along every stroke — out along one side, round the end, back along the other, the way a frog-button
// (盘扣) is coiled: it follows the glyph's outline pulled in by half a cord, so the outside of the cord sits on the outline.
// At one or two places on the underside of a stroke the two runs are bound together with a few turns of finer cord and a
// tassel hangs from the binding.
// The cord is shaded per DEVICE pixel (L.pixelCanvas): a height field of twisted three-ply cylinders lit from the top-left,
// with fibre lines in each ply, a highlight with a bright core, shadows the runs cast on each other and a dark crease where
// two runs press together. Tassels, stray fuzz and the shadows on the paper are ordinary paths in logical pixels.
// Nothing here knows which character it is spelling; every size follows K.glyphInfo().strokeWidth.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const NF = 13;                // numbers per cord segment: ax ay bx by | s at a, s at b | half-width a, b | bend a, b | lay | path id | loop length
let layer = null;

const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ── paths ──
/** a closed outline loop → evenly resampled, smoothed (no marching-squares jitter, corners eased), laid "by hand" (a slight wander) */
function smoothLoop(loop, step, sigma, wander, r) {
  const n0 = loop.length, cum = new Float64Array(n0 + 1);
  for (let i = 0; i < n0; i++) { const a = loop[i], b = loop[(i + 1) % n0]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const len = cum[n0], n = Math.max(8, Math.round(len / step));
  let xs = new Float64Array(n), ys = new Float64Array(n);
  for (let k = 0, i = 0; k < n; k++) {
    const t = (k / n) * len; while (i < n0 - 1 && cum[i + 1] < t) i++;
    const a = loop[i], b = loop[(i + 1) % n0], f = (t - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
    xs[k] = a[0] + (b[0] - a[0]) * f; ys[k] = a[1] + (b[1] - a[1]) * f;
  }
  const w = Math.min(Math.max(1, Math.round(sigma / (len / n))), Math.floor((n - 1) / 6));
  for (let pass = 0; pass < 3 && w > 0; pass++) {                    // three box passes ≈ a Gaussian of σ ≈ w samples
    const nx = new Float64Array(n), ny = new Float64Array(n), m = 2 * w + 1; let sx = 0, sy = 0;
    for (let j = -w; j <= w; j++) { const q = (j + n) % n; sx += xs[q]; sy += ys[q]; }
    for (let k = 0; k < n; k++) { nx[k] = sx / m; ny[k] = sy / m; const a = (k + w + 1) % n, b = (k - w + n) % n; sx += xs[a] - xs[b]; sy += ys[a] - ys[b]; }
    xs = nx; ys = ny;
  }
  if (wander > 0 && len > sigma * 40) {
    const c1 = Math.max(1, Math.round(len / (sigma * 90))), c2 = Math.max(2, Math.round(len / (sigma * 38))), p1 = r() * TAU, p2 = r() * TAU;
    const ox = new Float64Array(n), oy = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n, dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1;
      const wv = wander * (0.62 * Math.sin((TAU * c1 * k) / n + p1) + 0.38 * Math.sin((TAU * c2 * k) / n + p2));
      ox[k] = xs[k] - (dy / l) * wv; oy[k] = ys[k] + (dx / l) * wv;
    }
    xs = ox; ys = oy;
  }
  return { xs, ys };
}
/** append a polyline to the segment list. o: closed, hw (px, or fn(v) with v = 0..1 along the path), bend (fn(v)), lay (px), phase (0..1) */
function addPath(segs, xs, ys, o) {
  const n = xs.length, closed = !!o.closed, m = closed ? n : n - 1, cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) { const j = (i + 1) % n; cum[i + 1] = cum[i] + Math.hypot(xs[j] - xs[i], ys[j] - ys[i]); }
  const len = cum[m], lay = closed ? len / Math.max(1, Math.round(len / o.lay)) : o.lay, s0 = (o.phase || 0) * lay;   // a closed loop holds a whole number of twists
  const hwAt = typeof o.hw === 'function' ? o.hw : () => o.hw, bendAt = o.bend || (() => 0), id = segs.paths++;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n;
    segs.d.push(xs[i], ys[i], xs[j], ys[j], s0 + cum[i], s0 + cum[i + 1], hwAt(i / m), hwAt((i + 1) / m), bendAt(i / m), bendAt((i + 1) / m), lay, id, closed ? len : 0);
  }
  return { xs, ys, n, len };
}

// ── per-pixel cord: a height field of twisted cylinders, rasterised and shaded at device resolution ──
/** w × h logical px whose top-left is the page point (ox, oy); hwRef = nominal half-width of this cord (logical px) */
function renderCord(w, h, ox, oy, segs, hwRef) {
  const d = Float64Array.from(segs.d), ns = d.length / NF;
  return L.pixelCanvas(w, h, (data, pw, ph, q) => {
    const N = pw * ph, zb = new Float32Array(N).fill(-1e9), z2 = new Float32Array(N).fill(-1e9), si = new Int32Array(N).fill(-1), tb = new Float32Array(N), lb = new Float32Array(N);
    const sameLim = hwRef * 2.5;
    // pass 1: for every pixel the highest cylinder over it (zb), where on which segment, and the highest OTHER run (z2)
    for (let k = 0; k < ns; k++) {
      const o = k * NF, ax = (d[o] - ox) * q, ay = (d[o + 1] - oy) * q, bx = (d[o + 2] - ox) * q, by = (d[o + 3] - oy) * q;
      const ha = d[o + 6] * q, hb = d[o + 7] * q, sa = d[o + 4], id = d[o + 11], ll = d[o + 12];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9, hm = Math.max(ha, hb) + 1.5;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hm)), x1 = Math.min(pw - 1, Math.ceil(Math.max(ax, bx) + hm));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hm)), y1 = Math.min(ph - 1, Math.ceil(Math.max(ay, by) + hm));
      for (let yy = y0; yy <= y1; yy++) {
        const py = yy + 0.5 - ay;
        for (let xx = x0; xx <= x1; xx++) {
          const px = xx + 0.5 - ax; let t = (px * dx + py * dy) / l2; if (t < 0) t = 0; else if (t > 1) t = 1;
          const qx = px - dx * t, qy = py - dy * t, d2 = qx * qx + qy * qy, hw = ha + (hb - ha) * t, h2 = hw * hw;
          if (d2 >= h2 + hw + 0.25) continue;                                  // beyond hw + 0.5
          const z = d2 < h2 ? Math.sqrt(h2 - d2) : (h2 - d2) * 0.02, pi = yy * pw + xx, cur = si[pi];
          let other = false;
          if (cur >= 0) {
            const co = cur * NF;
            if (d[co + 11] !== id) other = true;
            else { let ds = Math.abs(d[co + 4] - sa); if (ll > 0 && ds > ll * 0.5) ds = ll - ds; other = ds > sameLim; }
          }
          if (z > zb[pi]) { if (other) z2[pi] = zb[pi]; zb[pi] = z; si[pi] = k; tb[pi] = t; lb[pi] = dx * qy - dy * qx < 0 ? -Math.sqrt(d2) : Math.sqrt(d2); }
          else if (other && z > z2[pi]) z2[pi] = z;
        }
      }
    }
    // pass 2: shade. Light from the top-left (same vectors as the first edition of this plate).
    const LX = -0.5014, LY = -0.6217, LZ = 0.6017, HX = -0.2801, HY = -0.3474, HZ = 0.8949;
    const LN = Math.hypot(LX, LY), UX = LX / LN, UY = LY / LN, TANE = LZ / LN;
    const hwD = hwRef * q, zMax = hwD * 1.02, sUnit = 7.6 / hwRef;
    const nf1 = L.clamp(hwD / 7.3, 1.5, 4.5), nf2 = L.clamp(hwD / 3.1, 3.5, 10.5);          // fibre lines per ply: never finer than ≈2.5 device px
    const steps = [1.5, 3, 5, 7.5, 10.5, 14, 18, 23, 29, 36, 44, 53, 63, 75, 90];
    for (let yy = 0, pi = 0; yy < ph; yy++) for (let xx = 0; xx < pw; xx++, pi++) {
      const k = si[pi]; if (k < 0) continue;
      const o = k * NF, t = tb[pi], hw = (d[o + 6] + (d[o + 7] - d[o + 6]) * t) * q, lat = lb[pi], dist = Math.abs(lat), sg = lat < 0 ? -1 : 1;
      const lay = d[o + 10], id = d[o + 11], ll = d[o + 12], s = d[o + 4] + (d[o + 5] - d[o + 4]) * t, bend = d[o + 8] + (d[o + 9] - d[o + 8]) * t;
      // hand-twisted: the lay tightens and loosens along the cord, and the dye is not quite even (both periodic round a closed loop)
      const fr = ll > 0 ? (TAU * s) / ll : 0, cyc = ll > 0 ? Math.max(1, Math.round(ll / (hwRef * 16))) : 0;
      const turn = s / lay + (ll > 0 ? 0.07 * Math.sin(cyc * fr + id * 1.3) + 0.04 * Math.sin((2 * cyc + 1) * fr + id * 0.7) : 0);
      const pe = 3 * (turn + sg * 0.25), hwE = hw * (0.955 + 0.045 * Math.sin(Math.PI * (pe - Math.floor(pe))));     // each ply bulges the silhouette a little
      const cov = hwE - dist + 0.5; if (cov <= 0) continue;
      // lateral unit vector (centre line → this pixel, flipped to the cord's left-hand side) and the direction of travel
      const ax = (d[o] - ox) * q, ay = (d[o + 1] - oy) * q, bx = (d[o + 2] - ox) * q, by = (d[o + 3] - oy) * q;
      let ex, ey;
      if (dist > 0.01) { ex = (xx + 0.5 - (ax + (bx - ax) * t)) / dist; ey = (yy + 0.5 - (ay + (by - ay) * t)) / dist; }
      else { const l = Math.hypot(bx - ax, by - ay) || 1; ex = (-(by - ay) / l) * sg; ey = ((bx - ax) / l) * sg; }
      const tX = sg * ey, tY = -sg * ex;
      // cylinder + three twisted plies
      const au = Math.min(0.995, dist / hwE), u = sg * au, nz0 = Math.sqrt(1 - au * au);
      const php = 3 * (turn + Math.asin(u) / TAU), kf = Math.floor(php), f = php - kf;
      const bump = Math.sin(Math.PI * f), tilt = -Math.cos(Math.PI * f) * 0.62 * nz0 + bend * 0.9;
      let nx = ex * au + tX * tilt, ny = ey * au + tY * tilt, nz = nz0;
      const nl = 1 / Math.hypot(nx, ny, nz); nx *= nl; ny *= nl; nz *= nl;
      // shadow: march towards the light across the height field
      const z0 = zb[pi] > 0 ? zb[pi] : 0; let sh = 0;
      for (let m = 0; m < steps.length; m++) {
        const dk = steps[m], need = z0 + dk * TANE; if (need > zMax) break;
        const sx = Math.floor(xx + 0.5 + UX * dk), sy = Math.floor(yy + 0.5 + UY * dk); if (sx < 0 || sy < 0) break;
        const zs = zb[sy * pw + sx];
        if (zs > need) { const v = (zs - need) / (0.7 + 0.12 * dk); if (v > sh) { sh = v; if (sh >= 1) { sh = 1; break; } } }
      }
      // crease where another run presses against this one
      let cr = 1; const zo = z2[pi];
      if (zo > -1e8) {
        const do2 = zo > 0 ? Math.sqrt(Math.max(0, hw * hw - zo * zo)) : hw, D = (dist + do2) / (2 * hw);
        const depth = D >= 1 ? 1 : 1 - Math.sqrt(1 - D * D), near = 1 - L.smooth((z0 - Math.max(0, zo)) / (0.5 * hw));
        cr = 1 - 0.55 * near * L.smooth(depth / 0.3);
      }
      const ndl = nx * LX + ny * LY + nz * LZ, diff = Math.max(0, ndl) * (1 - 0.9 * sh), sp = Math.max(0, nx * HX + ny * HY + nz * HZ);
      const bounce = Math.max(0, -(nx * LX + ny * LY)) * (1 - nz) * 0.2;                       // light coming back off the paper
      const ao = 0.46 + 0.54 * Math.pow(bump, 0.55), sn = s * sUnit;
      // silk filaments: they cross each ply at a slant (closer to the cord's axis than the ply itself), in coarse and fine bundles
      const gq = php - 1.65 * turn, hsh = hash(Math.floor(gq * nf2 * 1.6) + kf * 131, Math.floor(sn * 0.22 + gq * 3));
      const fib = 1 + 0.10 * Math.sin(gq * TAU * nf1 + kf * 1.7) + 0.085 * Math.sin(gq * TAU * nf2 + kf * 3.1) + 0.15 * (hsh - 0.5);
      const dye = ll > 0 ? 1 + 0.05 * Math.sin(Math.max(1, Math.round(cyc * 0.6)) * fr + 1.3 + id) + 0.03 * Math.sin((cyc * 3 + 2) * fr + id * 2.3) : 1 + 0.04 * Math.sin(sn * 0.05 + id);
      const tt = Math.max(0, Math.min(1, ((0.25 + 0.95 * diff + bounce) * ao * fib * dye * (1 - 0.35 * bend * bend) * cr) / 1.08));
      const spec = (Math.pow(sp, 16) * 0.42 + Math.pow(sp, 80) * 0.62) * bump * (0.55 + 0.9 * hsh) * fib * (1 - sh) * cr;      // silky sheen + a bright core, broken up by the filaments
      const p4 = pi * 4;
      data[p4] = 50 + 180 * Math.pow(tt, 0.85) + spec * 60;
      data[p4 + 1] = 4 + 48 * Math.pow(tt, 1.7) + spec * 170;
      data[p4 + 2] = 12 + 38 * Math.pow(tt, 1.4) + spec * 140;
      data[p4 + 3] = (cov > 1 ? 1 : cov) * 255;
    }
  });
}

// ── where the tassels hang: the underside of a stroke with free paper below it ──
function findSites(hw) {
  const info = K.glyphInfo(), sw = info.strokeWidth, b = info.bbox, Lmax = sw * 2.3, edge = 34, all = [];
  for (const p of K.outline({ grow: 0, spacing: Math.max(8, sw * 0.22), seed: 'g10site' })) {
    const nx = Math.cos(p.ang), ny = Math.sin(p.ang);
    if (ny < 0.85) continue;                                                     // the outline faces down here
    let wl = 0; for (let t = 2; t < hw * 6.5; t += 1) if (K.sdGlyph(p.x - nx * t, p.y - ny * t) > 0) { wl = t; break; }
    if (wl < hw * 2.4 || wl > hw * 5.6) continue;                                // a plain stroke: two runs side by side above this point
    for (const da of [0, -0.12, 0.12, -0.25, 0.25]) {
      const a = Math.PI / 2 + da, ax = Math.cos(a), ay = Math.sin(a); let t = 4;
      for (; t <= Lmax; t += 3) {
        const x = p.x + ax * t, y = p.y + ay * t, half = hw * (0.8 + 1.3 * (t / Lmax));
        if (x < edge + half || x > S - edge - half || y > S - edge - 6) break;
        if (K.sdGlyph(x, y) < Math.min(t * 0.6, half + sw * 0.25)) break;
      }
      all.push({ x: p.x, y: p.y, nx, ny, a, wl, free: t, score: Math.min(t, Lmax) / sw - Math.abs(da) * 1.5 + 2.6 * ((p.y - b.y0) / (b.y1 - b.y0 || 1)) });
    }
  }
  all.sort((p, q) => q.score - p.score);
  const sites = [];
  for (const c of all) {
    if (c.free < sw * 1.15) continue;
    if (sites.length && Math.hypot(c.x - sites[0].x, c.y - sites[0].y) < Math.max(sw * 4.5, S * 0.3)) continue;
    sites.push(c); if (sites.length === 2) break;
  }
  if (!sites.length && all.length) sites.push(all.reduce((p, q) => (q.free > p.free ? q : p)));
  for (const s of sites) s.len = L.clamp(s.free - 2, sw * 0.9, Lmax);
  return sites;
}

// ── the knot: a few turns of finer cord binding the two runs together, each seen as half a turn ──
function knotAt(site, hw, r) {
  const hk = hw * 0.46, N = 4, pitch = hk * 1.85, tx = -site.ny, ty = site.nx, e = hk * 0.7, span = site.wl + 2 * e, n = 28;
  const segs = { d: [], paths: 0 }; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < N; k++) {
    const off = (k - (N - 1) / 2) * pitch + r.range(-0.06, 0.06) * pitch, xs = new Float64Array(n + 1), ys = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const v = i / n, along = off + (v - 0.5) * pitch * 0.5, across = e - v * span;          // from just outside the outline to the far side of the stroke
      const x = site.x + site.nx * across + tx * along, y = site.y + site.ny * across + ty * along;
      xs[i] = x; ys[i] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    addPath(segs, xs, ys, {
      hw: (v) => hk * Math.sqrt(Math.max(0.03, 1 - Math.pow(Math.abs(v * 2 - 1), 5))),
      bend: (v) => { const w = v * 2 - 1; return Math.sign(w) * Math.pow(Math.abs(w), 2.4); }, lay: hk * 3.5, phase: r(),
    });
  }
  const pad = hk + 3, ox = Math.floor(x0 - pad), oy = Math.floor(y0 - pad);
  return { c: renderCord(Math.ceil(x1 + pad) - ox, Math.ceil(y1 + pad) - oy, ox, oy, segs, hk), ox, oy };
}

// ── the tassel: a bound bundle of loose silk threads lying on the paper below the knot ──
// drawn in the first edition's units around x = 0: head at y = 0, binding at y = 33, loose ends at y = yEnd; k = the scale it is drawn at
function tassel(g, r, k, yEnd) {
  const yTop = 0, yBind = 33, sk = Math.min(1.25, (yEnd - yBind) / 94), fl = 9 + 18 * Math.min(1, sk), dens = L.clamp(k, 0.6, 3);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // dark body under the threads
  g.fillStyle = '#6f0c15';
  g.beginPath(); g.moveTo(-9, yTop); g.bezierCurveTo(-13, yTop + 12, -9, yBind - 4, -8, yBind);
  g.bezierCurveTo(-12, yBind + 40 * sk, -(fl - 2), yEnd - 40 * sk, -(fl - 5), yEnd - 8); g.lineTo(fl + 4, yEnd - 8);
  g.bezierCurveTo(fl + 3, yEnd - 40 * sk, 12, yBind + 40 * sk, 8, yBind); g.bezierCurveTo(9, yBind - 4, 13, yTop + 12, 9, yTop); g.closePath(); g.fill();
  const thread = (u, dark) => {
    const xh = u * 8.5, xm = u * 12.5, xb = u * 8, sway = 5 * sk + r.range(-2.5, 2.5), xe = u * fl + sway + r.range(-2, 2);
    const ye = yEnd + r.range(-13, 4) - Math.abs(u) * 5;
    const t = L.clamp(0.52 - 0.34 * u + r.range(-0.2, 0.2) - dark, 0, 1);
    g.strokeStyle = L.mix('#7d0e18', '#e24a3e', t); g.lineWidth = r.range(0.8, 1.7) / k; g.globalAlpha = r.range(0.82, 1);
    g.beginPath(); g.moveTo(xh, yTop);
    g.bezierCurveTo(xm, yTop + 8, xm, yBind - 8, xb, yBind);
    g.bezierCurveTo(xb + u * 3, yBind + (34 + r.range(-6, 6)) * sk, xe - u * 5 + r.range(-2, 2), ye - 44 * sk, xe, ye); g.stroke();
  };
  for (let i = 0, n = Math.round(72 * dens); i < n; i++) thread(((i + r()) / n) * 2 - 1, 0.3);
  for (let i = 0, n = Math.round(26 * dens); i < n; i++) thread(r.range(-1, 1), 0.6);            // the dark between the threads
  for (let i = 0, n = Math.round(66 * dens); i < n; i++) thread(r.range(-1, 1), 0);
  for (let i = 0, n = Math.round(16 * dens); i < n; i++) thread(r.range(-0.9, 0.1), -0.25);      // a few catching the light
  g.globalAlpha = 1;
  // the head is round: its right flank falls into shade
  g.save(); g.globalCompositeOperation = 'source-atop';
  g.fillStyle = L.linear(g, -13, 0, 13, 0, [[0, 'rgba(255,196,170,0.14)'], [0.3, 'rgba(255,196,170,0)'], [0.62, 'rgba(48,0,6,0)'], [1, 'rgba(48,0,6,0.42)']]);
  g.fillRect(-15, yTop - 2, 30, yBind + 6);
  // the skirt is a bundle too: shade under the binding, the right flank darker than the left
  g.fillStyle = L.linear(g, 0, yBind, 0, yBind + 16, [[0, 'rgba(40,0,6,0.45)'], [1, 'rgba(40,0,6,0)']]);
  g.fillRect(-fl - 12, yBind, 2 * fl + 24, 16);
  g.fillStyle = L.linear(g, -fl, 0, fl + 6, 0, [[0, 'rgba(255,190,160,0.10)'], [0.4, 'rgba(255,190,160,0)'], [0.6, 'rgba(40,0,6,0)'], [1, 'rgba(40,0,6,0.30)']]);
  g.fillRect(-fl - 12, yBind, 2 * fl + 24, yEnd - yBind + 12); g.restore();
  // binding: fine gold thread wound round the neck
  for (let i = 0; i < 5; i++) {
    const y = yBind - 4.2 + i * 2.1;
    g.strokeStyle = L.linear(g, -10, 0, 10, 0, [[0, '#a8842f'], [0.28, '#f0d488'], [0.6, '#c39a3c'], [1, '#6e5218']]);
    g.lineWidth = 1.7; g.beginPath(); g.moveTo(-9.6, y - 0.6); g.quadraticCurveTo(0, y + 1.9, 9.6, y - 0.2); g.stroke();
    g.strokeStyle = 'rgba(70,40,8,0.55)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-9.6, y + 0.5); g.quadraticCurveTo(0, y + 3, 9.6, y + 0.9); g.stroke();
  }
}
function tasselLayer(sites, hw, key) {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  sites.forEach((s, i) => {
    const tuck = hw * 0.5, k = Math.min((hw * 0.78) / 9, (s.len + tuck) / 80);              // the head is about as wide as the cord
    g.save(); g.translate(s.x - s.nx * tuck, s.y - s.ny * tuck); g.rotate(s.a - Math.PI / 2); g.scale(k, k);
    tassel(g, L.rng('g10tassel' + i + key), k, (s.len + tuck) / k); g.restore();
  });
  return c;
}

// ── stray silk fuzz: short hairs leaving the edge of the cord that faces the paper ──
function fuzz(g, paths, hw, r) {
  const kk = Math.pow(hw / 7.6, 0.7);
  g.lineCap = 'round';
  for (const p of paths) {
    for (let j = 0, n = Math.round(p.len / (hw * 2.6)); j < n; j++) {
      const i = r.int(0, p.n - 1), i0 = (i - 1 + p.n) % p.n, i1 = (i + 1) % p.n;
      let tx = p.xs[i1] - p.xs[i0], ty = p.ys[i1] - p.ys[i0]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const side = K.sdGlyph(p.xs[i] - ty * hw, p.ys[i] + tx * hw) > K.sdGlyph(p.xs[i] + ty * hw, p.ys[i] - tx * hw) ? 1 : -1;
      const x = p.xs[i] - ty * side * (hw - 0.8), y = p.ys[i] + tx * side * (hw - 0.8), fw = r.range(0.4, 1) * r.sign(), len = r.range(3, 8.5) * kk;
      const jx = r.range(-1.2, 1.2) * kk, jy = r.range(-1.2, 1.2) * kk, col = r() < 0.6 ? '#b3202a' : '#d9564c', al = r.range(0.35, 0.7), lw = r.range(0.6, 1.0);
      if (K.sdGlyph(x, y) < -hw * 0.5) continue;                                   // that edge faces the other run, not the paper
      const dirx = -ty * side * 0.55 + tx * fw, diry = tx * side * 0.55 + ty * fw;
      g.strokeStyle = L.rgba(col, al); g.lineWidth = lw;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + dirx * len * 0.5 + jx, y + diry * len * 0.5 + jy, x + dirx * len, y + diry * len); g.stroke();
    }
  }
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, key = info.key;
  const hw = sw * 0.235, inset = hw + 0.6;            // cord ≈ 47 % of a stroke; two runs side by side fill it
  const c = L.makeCanvas(S, S), g = c.getContext('2d'), r = L.rng('g10' + key);
  g.drawImage(K.paper({ base: '#f2ead8', tone: '#8a6a3a', seed: 'g10paper', fiber: 0.65, stain: 0.26, foxing: 0.14, edge: 0.2 }), 0, 0);
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,250,236,0.10)'], [0.5, 'rgba(255,250,236,0)'], [1, 'rgba(96,62,28,0.10)']]);   // the lamp is up and to the left
  g.fillRect(0, 0, S, S);

  // the cord: one closed run round every outline, pulled in by half a cord
  const segs = { d: [], paths: 0 }, paths = [], step = L.clamp(hw * 0.06, 0.5, 1);
  for (const loop of K.glyphLoops({ grow: -inset })) {
    const p = smoothLoop(loop, step, hw * 0.2, hw * 0.035, r);
    paths.push(addPath(segs, p.xs, p.ys, { closed: true, hw, lay: hw * 3.5, phase: r() }));
  }
  const cord = renderCord(S, S, 0, 0, segs, hw);
  const sites = findSites(hw), tas = tasselLayer(sites, hw, key), knots = sites.map((s, i) => knotAt(s, hw, L.rng('g10knot' + i + key)));

  // shadows on the paper: a soft cast shadow thrown to the lower right, and a tight dark one where the cord touches down
  const silhouette = (draw) => { const t = L.makeCanvas(S, S), q = t.getContext('2d'); draw(q); q.globalCompositeOperation = 'source-in'; q.fillStyle = '#34160a'; q.fillRect(0, 0, S, S); return t; };
  const shadow = (sil, dx, dy, blur, alpha) => { g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = alpha; g.drawImage(L.blurred(sil, blur), dx, dy); g.restore(); };
  const hollow = L.makeCanvas(S, S); K.fillGlyph(hollow.getContext('2d'), '#6b1f16', { grow: -hw * 1.2 });   // only the strip between two runs is ever seen: a deep, narrow gap
  shadow(hollow, 0, 0, hw * 0.18, 0.55);
  const silT = silhouette((q) => q.drawImage(tas, 0, 0)), silC = silhouette((q) => { q.drawImage(cord, 0, 0); for (const k of knots) q.drawImage(k.c, k.ox, k.oy); });
  shadow(silT, hw * 0.3, hw * 0.4, hw * 0.3, 0.36); shadow(silT, hw * 0.07, hw * 0.1, Math.max(0.8, hw * 0.07), 0.4);
  shadow(silC, hw * 0.55, hw * 0.7, hw * 0.42, 0.42); shadow(silC, hw * 0.14, hw * 0.19, Math.max(1, hw * 0.12), 0.5);
  g.drawImage(tas, 0, 0);
  g.drawImage(cord, 0, 0);
  fuzz(g, paths, hw, L.rng('g10fuzz' + key));
  // the bindings, each casting a small shadow on the runs it crosses
  if (knots.length) {
    const silK = silhouette((q) => { for (const k of knots) q.drawImage(k.c, k.ox, k.oy); });
    shadow(silK, hw * 0.12, hw * 0.16, Math.max(0.8, hw * 0.1), 0.5);
    for (const k of knots) g.drawImage(k.c, k.ox, k.oy);
  }
  return c;
}

export default {
  name: '红绳',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
