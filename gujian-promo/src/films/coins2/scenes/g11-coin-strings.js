// g11 — 钱串: strings of cash seen from the side (a stack of coin rims, like a ribbed short rod) laid along the strokes of the
// CURRENT GLYPH on grey-blue paper. Layout: K.pack's discs → neighbours that follow the stroke direction are chained → every
// chain is cut into strings 2–3 discs long (a new string wherever the stroke turns) → what is left over gets short stubs.
// Bronze with verdigris, hemp cord and knots, light from the top-left. Nothing here knows which character it is spelling.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LXY = 0.53, LZ = 0.66;                    // light from the top-left, raised
let layer = null;

const BRONZE = ['#8b6b3d', '#7c5c33', '#9a7a47', '#6d5230', '#a48550', '#5f492c', '#876a45', '#93703a'];
const GREEN = ['#5f9c86', '#4d8a78', '#79b09b', '#3f7566', '#6aa58a', '#8bbfaa'];

const angDiff = (a, b) => { const d = Math.abs(a - b) % Math.PI; return d > Math.PI / 2 ? Math.PI - d : d; };   // between two directions (mod π)
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ═════════════════════════ layout: discs → chains → strings ═════════════════════════
function layout(info) {
  const sw = info.strokeWidth, R1 = sw * 0.52, R0 = sw * 0.19, tol = Math.min(4.5, sw * 0.1);
  const discs = K.pack({ seed: 'g11', rmax: R1, rmin: R0, gap: 1, margin: 0 });
  for (const d of discs) {                       // a disc capped at rmax may sit off-centre in a fat stroke: slide it onto the centre line
    if (d.r < R1 * 0.985) continue;
    let dep = -K.sdGlyph(d.x, d.y), moved = false;
    for (let k = 0, m = Math.ceil(R1 * 0.22); k < m; k++) {
      const nn = K.glyphNormal(d.x, d.y, 2), qx = d.x - nn.x, qy = d.y - nn.y, d2 = -K.sdGlyph(qx, qy);
      if (d2 <= dep + 0.03) break;
      d.x = qx; d.y = qy; dep = d2; moved = true;
    }
    if (moved) d.ang = K.strokeAngle(d.x, d.y, Math.max(d.r * 1.7, 16));
  }
  const n = discs.length;
  // 1. every disc's best neighbour on either side ALONG its stroke (similar size, the way between them deep inside the ink)
  const best = discs.map(() => [null, null]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const p = discs[i], q = discs[j], dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy), rm = Math.min(p.r, q.r);
    if (dist > p.r + q.r + 1.9 * rm || rm < 0.8 * Math.max(p.r, q.r)) continue;
    const dir = Math.atan2(dy, dx), e1 = angDiff(dir, p.ang), e2 = angDiff(dir, q.ang);
    if (e1 > 0.44 || e2 > 0.44) continue;
    let ok = true;
    for (let t = 0.2; t < 0.81 && ok; t += 0.2) if (K.sdGlyph(p.x + dx * t, p.y + dy * t) > -0.62 * rm) ok = false;
    if (!ok) continue;
    const side = dx * Math.cos(p.ang) + dy * Math.sin(p.ang) > 0 ? 1 : 0, cost = dist + (e1 + e2) * R1 * 1.5;
    if (!best[i][side] || cost < best[i][side].cost) best[i][side] = { j, cost };
  }
  const nb = discs.map(() => []);                // mutual choices become links: at most one per side
  for (let i = 0; i < n; i++) for (const b of best[i]) {
    if (!b || b.j < i) continue;
    const o = best[b.j];
    if ((o[0] && o[0].j === i) || (o[1] && o[1].j === i)) { nb[i].push(b.j); nb[b.j].push(i); }
  }
  const used = new Uint8Array(n), chains = [];
  const walk = (s0) => { const c = [s0]; used[s0] = 1; for (let cur = s0; ;) { const nx = nb[cur].find((k) => !used[k]); if (nx === undefined) break; used[nx] = 1; c.push(nx); cur = nx; } return c; };
  for (let i = 0; i < n; i++) if (!used[i] && nb[i].length === 1) chains.push(walk(i));
  for (let i = 0; i < n; i++) if (!used[i] && nb[i].length === 2) chains.push(walk(i));       // closed loops

  // 2. cut every chain into strings of 2–3 discs; a bend starts a new string
  const dirOf = (a, b) => Math.atan2(discs[b].y - discs[a].y, discs[b].x - discs[a].x);
  const split = (ch) => {
    const groups = []; let g = [ch[0]], d0 = null;
    for (let k = 1; k < ch.length; k++) {
      const dir = dirOf(ch[k - 1], ch[k]);
      if (g.length >= 3 || (g.length >= 2 && Math.abs(wrapPi(dir - d0)) > 0.2)) { groups.push(g); g = [ch[k]]; d0 = null; }
      else { g.push(ch[k]); if (d0 === null) d0 = dir; }
    }
    groups.push(g);
    const m = groups.length;
    if (m > 1 && groups[m - 1].length === 1) {   // no lonely last disc at the end of a straight run
      const prev = groups[m - 2], last = groups[m - 1];
      const bend = Math.abs(wrapPi(dirOf(prev[prev.length - 1], last[0]) - dirOf(prev[prev.length - 2], prev[prev.length - 1])));
      if (bend < 0.3) { if (prev.length === 3) last.unshift(prev.pop()); else { prev.push(last[0]); groups.pop(); } }
    }
    return groups;
  };
  const rods = [], cords = [];
  const mkRod = (c) => ({ c, W: (2 * c.reduce((s, d) => s + d.r, 0)) / c.length, pts: c.map((d) => ({ x: d.x, y: d.y, r: d.r })), cutS: false, cutE: false, capS: 0, capE: 0, dead: false });
  for (const ch of chains) {
    const rs = split(ch).map((ids) => mkRod(ids.map((i) => discs[i])));
    for (let k = 0; k + 1 < rs.length; k++) {    // the gap between two strings of one chain: the cord shows, with a knot
      const A = rs[k], B = rs[k + 1], a = A.c[A.c.length - 1], b = B.c[0], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist, m = a.r + (dist - a.r - b.r) / 2, gap = Math.max(2.4, 0.09 * (A.W + B.W));
      A.pts.push({ x: a.x + ux * (m - gap / 2), y: a.y + uy * (m - gap / 2), r: a.r }); A.cutE = true;
      B.pts.unshift({ x: a.x + ux * (m + gap / 2), y: a.y + uy * (m + gap / 2), r: b.r }); B.cutS = true;
      cords.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, kx: a.x + ux * m, ky: a.y + uy * m, th: Math.atan2(dy, dx), W: (A.W + B.W) / 2 });
    }
    rods.push(...rs);
  }

  // 3. free ends run on along the stroke until it narrows / ends (→ a leaning end coin) or another string is in the way
  const near = (x, y, self, f, extra) => {       // is (x, y) within f × width + extra of another string's axis (beside it, not beyond its ends)?
    for (const o of rods) {
      if (o === self || o.dead) continue;
      const P = o.pts, lim = o.W * f + extra;
      for (let k = 1; k < P.length; k++) {
        const a = P[k - 1], b = P[k], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
        if (l2 < 1e-6) continue;
        const t = ((x - a.x) * vx + (y - a.y) * vy) / l2;
        if (t < 0 || t > 1) continue;
        if (Math.abs((x - a.x) * vy - (y - a.y) * vx) / Math.sqrt(l2) < lim) return true;
      }
    }
    return false;
  };
  const extend = (rod, atStart) => {
    const c = rod.c, e = atStart ? c[0] : c[c.length - 1], P = rod.pts;
    let ux, uy;
    if (c.length > 1) { const o = atStart ? c[1] : c[c.length - 2]; ux = e.x - o.x; uy = e.y - o.y; }
    else if (P.length > 1) { const o = atStart ? P[P.length - 1] : P[0]; ux = e.x - o.x; uy = e.y - o.y; }
    else { const sg = atStart ? -1 : 1; ux = Math.cos(e.ang) * sg; uy = Math.sin(e.ang) * sg; }
    const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
    const r = e.r, hw = r * 0.94, nx = -uy, ny = ux; let ext = 0, stop = 'max';
    for (let s = 1.5; s <= r * 3.5; s += 1.5) {
      const x = e.x + ux * s, y = e.y + uy * s;
      if (K.sdGlyph(x, y) > -0.5 * r || K.sdGlyph(x + nx * hw, y + ny * hw) > tol || K.sdGlyph(x - nx * hw, y - ny * hw) > tol) { stop = 'tip'; break; }
      if (near(x, y, rod, 0.38, 0)) { stop = 'rod'; break; }
      ext = s;
    }
    if (stop !== 'rod') ext = Math.max(ext, 0.4 * e.r);
    let cap = 0;                                 // room for the last coin leaning out, its face showing
    if (stop === 'tip') { cap = 0.42 * r; while (cap > 0.14 * r && K.sdGlyph(e.x + ux * (ext + cap), e.y + uy * (ext + cap)) > 1) cap *= 0.8; if (cap <= 0.14 * r) cap = 0; }
    if (ext > 0.05) { const p = { x: e.x + ux * ext, y: e.y + uy * ext, r: e.r }; if (atStart) P.unshift(p); else P.push(p); }
    if (atStart) rod.capS = cap; else rod.capE = cap;
  };
  const rodLen = (rod) => { let s = 0; for (let k = 1; k < rod.pts.length; k++) s += Math.hypot(rod.pts[k].x - rod.pts[k - 1].x, rod.pts[k].y - rod.pts[k - 1].y); return s; };
  for (const rod of rods.slice().sort((a, b) => b.W - a.W)) { if (!rod.cutS) extend(rod, true); if (!rod.cutE) extend(rod, false); }
  const singles = []; for (let i = 0; i < n; i++) if (!used[i]) singles.push(discs[i]);
  singles.sort((a, b) => b.r - a.r);
  for (const d of singles) {                     // left-over discs: a short stub each, unless a string already lies there
    if (near(d.x, d.y, null, 0.5, 0.45 * d.r)) continue;
    const rod = mkRod([d]); rods.push(rod); extend(rod, true); extend(rod, false);
    if (rodLen(rod) < 0.8 * d.r) rod.dead = true;
  }
  return { rods: rods.filter((o) => !o.dead && rodLen(o) > 1), cords };
}

/** a string along the polyline pts, arc-length parametrised: at(s) → { x, y, r (local half-width), th (smoothed across the corners) } */
function makeString(pts, W) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const len = cum[cum.length - 1], h = W * 0.32;
  const pos = (s) => {
    s = L.clamp(s, 0, len); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t };
  };
  const at = (s) => { const p = pos(s), a = pos(s - h), b = pos(s + h); p.th = Math.atan2(b.y - a.y, b.x - a.x); return p; };
  return { len, W, at };
}
function corePath(g, st, s0, s1, f) {             // the body of a string, f × its local half-width either side of the axis
  const n = Math.max(2, Math.ceil((s1 - s0) / 4)), a = [], b = [];
  for (let i = 0; i <= n; i++) { const p = st.at(s0 + ((s1 - s0) * i) / n), h = p.r * f, nx = -Math.sin(p.th), ny = Math.cos(p.th); a.push([p.x + nx * h, p.y + ny * h]); b.push([p.x - nx * h, p.y - ny * h]); }
  g.beginPath(); a.forEach((v, i) => (i ? g.lineTo(v[0], v[1]) : g.moveTo(v[0], v[1])));
  for (let i = b.length - 1; i >= 0; i--) g.lineTo(b[i][0], b[i][1]);
  g.closePath();
}

// ═════════════════════════ hemp cord and knots ═════════════════════════
function cord(g, pts, r, wd = 5) {
  const k = wd / 5, step = 3.1 * k;
  const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(22,30,42,0.45)'; g.shadowBlur = 4 * k; g.shadowOffsetX = 2 * k; g.shadowOffsetY = 3 * k;
  path(); g.strokeStyle = '#4c3a24'; g.lineWidth = wd + 1.6 * k; g.stroke();
  g.shadowColor = 'transparent';
  path(); g.strokeStyle = '#b89c6a'; g.lineWidth = wd; g.stroke();
  let acc = 0;                                   // twist: short diagonal plies
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dl = Math.hypot(b.x - a.x, b.y - a.y), th = Math.atan2(b.y - a.y, b.x - a.x);
    for (let s = acc; s < dl; s += step) {
      const x = a.x + Math.cos(th) * s, y = a.y + Math.sin(th) * s, kk = th + 0.95;
      g.strokeStyle = L.rgba('#6b5232', r.range(0.55, 0.85)); g.lineWidth = Math.max(0.5, 0.9 * k);
      g.beginPath(); g.moveTo(x - Math.cos(kk) * wd * 0.5, y - Math.sin(kk) * wd * 0.5); g.lineTo(x + Math.cos(kk) * wd * 0.5, y + Math.sin(kk) * wd * 0.5); g.stroke();
      g.strokeStyle = 'rgba(240,222,180,0.5)'; g.lineWidth = Math.max(0.4, 0.7 * k);
      g.beginPath(); g.moveTo(x + 1.3 * k - Math.cos(kk) * wd * 0.3, y - Math.sin(kk) * wd * 0.3); g.lineTo(x + 1.3 * k, y); g.stroke();
    }
    acc = (acc + step * Math.ceil((dl - acc) / step)) - dl; if (acc < 0) acc = 0;
  }
  g.restore();
}
function knot(g, x, y, th, r, sz = 6.5) {         // an overhand knot: two lobes of cord and the wrap across them; th = across the cord
  const k = sz / 6.5;
  const lobe = (sx, grow) => { g.beginPath(); g.ellipse(sx * sz * 0.42, 0, sz * 0.6 + grow, sz * 0.5 + grow, sx * 0.5, 0, TAU); g.fill(); };
  const bar = () => { g.beginPath(); g.moveTo(0, -sz * 0.48); g.lineTo(0, sz * 0.48); g.stroke(); };
  g.save(); g.translate(x, y); g.rotate(th); g.lineCap = 'round';
  g.shadowColor = 'rgba(22,30,42,0.5)'; g.shadowBlur = 5 * k; g.shadowOffsetX = 2 * k; g.shadowOffsetY = 3 * k;
  g.fillStyle = '#4c3a24'; lobe(-1, 0.9 * k); lobe(1, 0.9 * k);
  g.shadowColor = 'transparent';
  g.fillStyle = L.radial(g, -sz * 0.3, -sz * 0.3, 0.5 * k, sz * 1.3, [[0, '#d2b885'], [0.6, '#b0935f'], [1, '#7c6340']]);
  lobe(-1, 0); lobe(1, 0);
  g.strokeStyle = 'rgba(84,62,36,0.75)'; g.lineWidth = Math.max(0.45, 0.8 * k);                 // plies of the twisted cord: short straight ticks
  for (const sx of [-1, 1]) for (let j = 0; j <= 1; j++) { const cx = sx * sz * (0.55 + 0.3 * j); g.beginPath(); g.moveTo(cx - sz * 0.12, -sz * 0.26); g.lineTo(cx + sz * 0.12, sz * 0.26); g.stroke(); }
  g.strokeStyle = '#4c3a24'; g.lineWidth = sz * 0.46 + 1.2 * k; bar();                           // the wrap
  g.strokeStyle = '#c9ad78'; g.lineWidth = sz * 0.46; bar();
  g.strokeStyle = 'rgba(84,62,36,0.7)'; g.lineWidth = Math.max(0.45, 0.8 * k);
  for (let j = -1; j <= 1; j++) { g.beginPath(); g.moveTo(-sz * 0.2, j * sz * 0.3 - sz * 0.07); g.lineTo(sz * 0.2, j * sz * 0.3 + sz * 0.07); g.stroke(); }
  for (let j = 0; j < 4; j++) {                  // a few frayed fibres
    const a = r.range(0, TAU), l = sz * r.range(1.0, 1.4);
    g.strokeStyle = L.rgba(j % 2 ? '#c9b07c' : '#7c6340', 0.8); g.lineWidth = Math.max(0.4, 0.7 * k);
    g.beginPath(); g.moveTo(Math.cos(a) * sz * 0.7, Math.sin(a) * sz * 0.35); g.lineTo(Math.cos(a) * l, Math.sin(a) * l * 0.6); g.stroke();
  }
  g.restore();
}

// ═════════════════════════ patina: per-pixel crust, tarnish and grain at device resolution ═════════════════════════
function patinaTex(fs) {
  const nz = L.makeNoise('g11crust');
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q;
        if (K.sdGlyph(x, y) > 10) continue;                   // only where the strings lie
        const X = x * fs, Y = y * fs;
        const a = nz.fbm(X * 0.028, Y * 0.028, 3), b = nz.n2(X * 0.19 + 40.5, Y * 0.19 - 17.3), c = nz.n2(X * 0.71 - 9.1, Y * 0.71 + 31.7);
        const crust = a * 1.5 + b * 0.5 + c * 0.22;
        if (crust > 0.28) {                                   // verdigris crust: pale, powdery, crisp-edged
          const t = Math.min(1, (crust - 0.28) / 0.16), v = 0.5 + 0.5 * c, m = L.clamp(0.12 + 0.55 * v + 0.3 * (0.5 + 0.5 * b) * t);
          d[k] = 58 + 112 * m; d[k + 1] = 112 + 100 * m; d[k + 2] = 98 + 96 * m; d[k + 3] = 255 * t * (0.5 + 0.34 * v);
        } else if (crust < -0.3) {                            // tarnish: dull dark patches
          const t = Math.min(1, (-0.3 - crust) / 0.25);
          d[k] = 34; d[k + 1] = 26; d[k + 2] = 18; d[k + 3] = 255 * t * (0.3 + 0.16 * c);
        } else {                                              // bare metal: fine grain
          const gn = c * 0.55 + b * 0.3;
          if (gn > 0) { d[k] = 255; d[k + 1] = 226; d[k + 2] = 170; d[k + 3] = 255 * gn * 0.17; }
          else { d[k] = 20; d[k + 1] = 14; d[k + 2] = 8; d[k + 3] = -255 * gn * 0.22; }
        }
      }
    }
  });
}

// ═════════════════════════ one string ═════════════════════════
function coinPath(q, w, y0, d, rr) {             // the rim of one coin seen edge-on: a rounded bar across the string
  q.beginPath();
  q.moveTo(-w / 2 + rr, y0); q.lineTo(w / 2 - rr, y0); q.quadraticCurveTo(w / 2, y0, w / 2, y0 + rr);
  q.lineTo(w / 2, y0 + d - rr); q.quadraticCurveTo(w / 2, y0 + d, w / 2 - rr, y0 + d);
  q.lineTo(-w / 2 + rr, y0 + d); q.quadraticCurveTo(-w / 2, y0 + d, -w / 2, y0 + d - rr);
  q.lineTo(-w / 2, y0 + rr); q.quadraticCurveTo(-w / 2, y0, -w / 2 + rr, y0); q.closePath();
}
// the last coin of a free end leans out, so a sliver of its face shows (outer rim, worn field; the knot sits on the hole)
function faceBase(q, f, r) {
  q.save(); q.translate(f.x, f.y); q.rotate(f.th);
  q.beginPath(); q.ellipse(0, 0, f.cap, f.de / 2, 0, 0, TAU); q.fillStyle = f.base; q.fill(); q.clip();
  for (let k = 0; k < 3; k++) {
    const y = r.range(-0.42, 0.42) * f.de, rad = r.range(0.12, 0.3) * f.de;
    q.fillStyle = L.radial(q, f.cap * 0.5, y, 0, rad, [[0, L.rgba(f.grn, r.range(0.35, 0.75))], [1, L.rgba(f.grn, 0)]]);
    q.fillRect(-f.cap, y - rad, f.cap * 2, rad * 2);
  }
  q.restore();
}
function faceShade(q, f, r, W) {
  const u = W / 68, c = Math.cos(f.th), s = Math.sin(f.th), bf = -0.95 * (c + s) * LXY + 0.3 * LZ, ly = LXY * (s - c);
  const ell = (rx, ry) => { q.beginPath(); q.ellipse(0, 0, Math.max(0.3, rx), Math.max(0.3, ry), 0, 0, TAU); };
  q.save(); q.translate(f.x, f.y); q.rotate(f.th);
  q.beginPath(); q.rect(-0.4, -f.de, f.cap + 6, f.de * 2); q.clip();
  ell(f.cap, f.de / 2);
  q.fillStyle = `rgba(14,10,8,${L.clamp(0.7 - 0.85 * Math.max(0, bf), 0.04, 0.76).toFixed(3)})`; q.fill();
  q.fillStyle = L.linear(q, 0, -f.de / 2, 0, f.de / 2, [[0, `rgba(255,236,200,${((0.2 * Math.max(0, -ly)) / 0.75).toFixed(3)})`], [0.5, 'rgba(255,236,200,0)'], [1, `rgba(255,236,200,${((0.2 * Math.max(0, ly)) / 0.75).toFixed(3)})`]]);
  q.fill();
  const rw = Math.max(1, 0.055 * f.de);
  q.lineWidth = Math.max(0.5, 0.9 * u);
  q.strokeStyle = 'rgba(18,12,8,0.55)'; ell(f.cap * 0.74, f.de / 2 - rw * 1.5); q.stroke();                                         // the step from the raised rim down to the field
  q.strokeStyle = `rgba(255,232,190,${(0.14 + 0.34 * Math.max(0, bf)).toFixed(3)})`; ell(f.cap * 0.88, f.de / 2 - rw * 0.7); q.stroke();   // the crown of the rim
  q.strokeStyle = 'rgba(22,16,10,0.75)'; q.lineWidth = Math.max(0.5, 0.8 * u); ell(f.cap, f.de / 2); q.stroke();
  q.restore();
  knot(q, f.x + c * f.cap * 0.4, f.y + s * f.cap * 0.4, f.th + Math.PI / 2, r, Math.max(1.5, 0.085 * W));
}

const SV = [-1, -0.94, -0.82, -0.64, -0.44, -0.22, 0, 0.22, 0.44, 0.64, 0.82, 0.94, 1];
function drawRod(q, rod, seed, nz, tex, box, tk) {
  const st = makeString(rod.pts, rod.W), r = L.rng(seed), nOff = r.range(0, 500);
  const faces = [];
  const mkFace = (p, th, cap) => faces.push({ x: p.x, y: p.y, th, cap, de: 2 * p.r - (r.range(1.5, 4) * p.r) / 34, base: L.shade(r.pick(BRONZE), r.range(-0.1, 0.12)), grn: r.pick(GREEN) });
  if (rod.capS) { const p = st.at(0); mkFace(p, p.th + Math.PI, rod.capS); }
  if (rod.capE) { const p = st.at(st.len); mkFace(p, p.th, rod.capE); }
  for (const f of faces) faceBase(q, f, r);
  // the dark core seen between the coins
  corePath(q, st, 0.4, st.len - 0.4, 0.78); q.fillStyle = '#33281b'; q.fill();
  // coin thicknesses, scaled so the stack fills the string exactly
  const steps = []; let sum = 0;
  while (sum < st.len) { const t = r.range(0.82, 1.18) * tk * (r.chance(0.08) ? 1.25 : 1); steps.push(t); sum += t; }
  const k = st.len / sum, gapc = Math.min(0.55, tk * 0.1), coins = [], specks = []; let s = 0;
  // ── pass 1: metal and verdigris (coherent blotches that run across neighbouring coins)
  for (const t0 of steps) {
    const t = t0 * k, p = st.at(s + t / 2), Wl = 2 * p.r, u = Wl / 68; s += t;      // the string is as wide as the stroke is here
    const d = Wl - (r.chance(0.08) ? r.range(6, 9.5) : r.range(0, 4.5)) * u;
    const off = (Wl - d) * r.range(-0.4, 0.4) + r.range(-1.4, 1.4) * u;
    const th = p.th, tilt = r.gauss() * 0.028;
    const base = L.shade(r.pick(BRONZE), r.range(-0.12, 0.1)), grn = r.pick(GREEN);
    const bias = r.range(-0.34, 0.1) + (r.chance(0.07) ? 0.7 : 0);
    const y0 = off - d / 2, w = t - gapc, rr = Math.min(2.2 * u, w * 0.4);
    q.save(); q.translate(p.x, p.y); q.rotate(th + tilt);
    coinPath(q, w, y0, d, rr);
    q.fillStyle = base; q.fill();
    const pg = q.createLinearGradient(0, y0, 0, y0 + d);
    for (let j = 0; j <= 12; j++) {
      const v = y0 + (d * j) / 12, pn = nz.fbm((nOff + s / u) * 0.021, (v / u) * 0.034 + nOff, 3);
      const a = L.clamp((pn + 0.02) * 2.7 + bias, 0, 0.9);
      pg.addColorStop(j / 12, L.rgba(grn, a));
      if (a > 0.35 && r.chance(0.06)) specks.push({ x: p.x, y: p.y, th, u, v: v + r.range(-2, 2) * u, uu: r.range(-t, t) * 0.6, lt: r.chance(0.7) });
    }
    q.fillStyle = pg; q.fill();
    q.restore();
    coins.push({ p, th, tilt, w, d, y0, off, rr, u, gloss: (bias > 0.3 ? 0.25 : 1) * r.range(0.25, 1) });
  }
  // ── the per-pixel patina sits on the metal, under the light
  q.save(); q.globalCompositeOperation = 'source-atop'; q.drawImage(tex, box[0], box[1], box[2], box[3], box[0], box[1], box[2], box[3]); q.restore();
  // ── pass 2: light
  for (const f of faces) faceShade(q, f, r, f.de);
  for (const cn of coins) {
    const { p, th, w, d, y0, off, rr, u } = cn;
    const ly = LXY * (Math.sin(th) - Math.cos(th)), bmax = Math.hypot(ly, LZ);
    q.save(); q.translate(p.x, p.y); q.rotate(th + cn.tilt);
    coinPath(q, w, y0, d, rr);
    // the stack is a cylinder: shade across the diameter
    const dg = q.createLinearGradient(0, y0, 0, y0 + d), hg = q.createLinearGradient(0, y0, 0, y0 + d);
    for (const sv of SV) {
      const b = Math.max(0, sv * ly + Math.sqrt(1 - sv * sv) * LZ), tt = (sv + 1) / 2;
      dg.addColorStop(tt, `rgba(16,12,10,${L.clamp(0.98 - (0.3 + 0.84 * b), 0, 0.82).toFixed(3)})`);
      hg.addColorStop(tt, `rgba(255,238,200,${(0.42 * Math.pow(b / bmax, 12) * (0.45 + (0.55 * bmax) / 0.85)).toFixed(3)})`);
    }
    q.fillStyle = dg; q.fill(); q.fillStyle = hg; q.fill();
    // the bright core of the highlight, broken from coin to coin
    const tp = (ly / bmax + 1) / 2, ka = Math.min(0.9, cn.gloss * Math.pow(bmax, 1.5)), kg = q.createLinearGradient(0, y0, 0, y0 + d);
    kg.addColorStop(L.clamp(tp - 0.07), 'rgba(255,244,214,0)'); kg.addColorStop(L.clamp(tp - 0.024), `rgba(255,244,214,${(ka * 0.5).toFixed(3)})`);
    kg.addColorStop(L.clamp(tp), `rgba(255,247,226,${ka.toFixed(3)})`);
    kg.addColorStop(L.clamp(tp + 0.024), `rgba(255,244,214,${(ka * 0.5).toFixed(3)})`); kg.addColorStop(L.clamp(tp + 0.07), 'rgba(255,244,214,0)');
    q.fillStyle = kg; q.fill();
    // the paper throws a little cool light back onto the shaded flank
    if (Math.abs(ly) > 0.12) {
      const sg = ly > 0 ? -1 : 1, T = (v) => (sg * v + 1) / 2, bg = q.createLinearGradient(0, y0, 0, y0 + d);
      bg.addColorStop(T(1), 'rgba(150,172,196,0)'); bg.addColorStop(T(0.9), 'rgba(150,172,196,0.15)'); bg.addColorStop(T(0.7), 'rgba(150,172,196,0)');
      q.fillStyle = bg; q.fill();
    }
    // each rim is rounded: dark at both faces, a soft glint along its crown
    const lit = -(Math.cos(th) + Math.sin(th)) > 0 ? 1 : -1;               // which face looks toward the light
    q.fillStyle = L.linear(q, -w / 2, 0, w / 2, 0, [[0, `rgba(10,8,6,${lit > 0 ? 0.5 : 0.28})`], [0.28, 'rgba(10,8,6,0)'], [0.5, 'rgba(255,236,196,0.15)'], [0.72, 'rgba(10,8,6,0)'], [1, `rgba(10,8,6,${lit > 0 ? 0.28 : 0.5})`]]);
    q.fill();
    // worn bright metal on the crown of some rims, on the lit flank only
    if (r.chance(0.3)) {
      const sv = L.clamp((-ly / bmax) * -0.75 + r.range(-0.2, 0.2), -0.9, 0.9), yc = off + (sv * d) / 2, hl = r.range(5, 13) * u;
      q.strokeStyle = `rgba(236,200,138,${r.range(0.25, 0.55).toFixed(2)})`; q.lineWidth = Math.max(0.5, r.range(0.8, 1.4) * u); q.lineCap = 'round';
      q.beginPath(); q.moveTo(r.range(-0.6, 0.6) * u, yc - hl / 2); q.lineTo(r.range(-0.6, 0.6) * u, yc + hl / 2); q.stroke();
    }
    // a small dent
    if (r.chance(0.1)) {
      const yc = off + r.range(-0.42, 0.42) * d;
      q.fillStyle = 'rgba(20,14,8,0.5)'; q.beginPath(); q.ellipse(r.range(-w, w) * 0.3, yc, r.range(0.6, 1.2) * u, r.range(0.9, 2.2) * u, 0, 0, TAU); q.fill();
    }
    q.restore();
  }
  // encrustation specks sitting on the patina, bridging the gaps between coins
  for (const sp of specks) {
    const c = Math.cos(sp.th), sn = Math.sin(sp.th), x = sp.x + c * sp.uu - sn * sp.v, y = sp.y + sn * sp.uu + c * sp.v;
    const u = sp.u, rad = r.range(0.6, 1.5) * Math.max(0.6, u);
    q.fillStyle = 'rgba(14,26,24,0.3)'; q.beginPath(); q.ellipse(x + 0.6 * u, y + 0.8 * u, rad, rad * 0.7, r() * 3, 0, TAU); q.fill();
    q.fillStyle = sp.lt ? L.rgba(r.pick(['#a9d3c0', '#8fc4ad', '#c4e0d2']), r.range(0.45, 0.8)) : L.rgba('#2f5a4e', r.range(0.45, 0.75));
    q.beginPath(); q.ellipse(x, y, rad * r.range(1, 1.9), rad * r.range(0.45, 0.8), r() * 3, 0, TAU); q.fill();
  }
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#8d9eac', tone: '#3b4a5b', seed: 'g11paper', fiber: 0.7, stain: 0.3, foxing: 0.12, edge: 0.3 }), 0, 0);
  const { rods, cords } = layout(info);
  const nz = L.makeNoise('g11patina'), r = L.rng('g11' + info.key), tex = patinaTex(L.clamp(75 / sw, 1, 2.4));
  // the cord runs on from one string of a chain to the next, knotted in the gap
  for (const cd of cords) {
    cord(g, [{ x: cd.x0, y: cd.y0 }, { x: cd.x1, y: cd.y1 }], r, Math.max(1.6, cd.W * 0.075));
    knot(g, cd.kx, cd.ky, cd.th + Math.PI / 2, r, Math.max(1.6, cd.W * 0.1));
  }
  // every string is a sprite (metal → patina → light), laid down thin ones first with a cast and a contact shadow
  rods.sort((a, b) => a.W - b.W);
  rods.forEach((rod, i) => {
    const pad = Math.max(...rod.pts.map((p) => p.r)) + Math.max(rod.capS, rod.capE) + 8; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of rod.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const bx = Math.max(0, Math.floor(x0 - pad)), by = Math.max(0, Math.floor(y0 - pad));
    const bw = 2 * Math.ceil((Math.min(S, x1 + pad) - bx) / 2), bh = 2 * Math.ceil((Math.min(S, y1 + pad) - by) / 2);
    if (bw < 2 || bh < 2) return;
    const tk = ((0.55 * rod.W + 0.45 * sw) / 68) * 6.5, cx = bx + bw / 2, cy = by + bh / 2, u = rod.W / 68;
    const spr = K.sprite(bw, bh, (q) => { q.translate(-cx, -cy); drawRod(q, rod, 'g11s' + info.key + i, nz, tex, [bx, by, bw, bh], tk); });
    K.stamp(g, spr, cx, cy, { shadow: { dx: 7 * u, dy: 10 * u, blur: 14 * u, color: 'rgba(18,26,38,0.56)' } });
    K.stamp(g, spr, cx, cy, { shadow: { dx: 2 * u, dy: 3 * u, blur: 4 * u, color: 'rgba(14,20,30,0.55)' } });
  });
  return c;
}

export default {
  name: '钱串',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
