// g22 — 钱范残片: the face of a terracotta coin mould (coin cavities with their rim grooves and square bosses, runners and slanted
// gates sunk into it) cut to the CURRENT GLYPH and broken into sherds along jagged fractures, laid on off-white paper like a
// museum specimen. Built as one relief at DEVICE resolution (L.pixelCanvas): a float height field (mould pattern, rounded and
// spalled arrises, grit, pits, tool marks) is lit from the top-left with cast shadows; every sherd has its own firing colour,
// lies a little askew, and stands on a visible broken section (the wall on its far side) over a contact and a cast shadow.
// Nothing here knows which character it spells: sizes follow K.glyphInfo().strokeWidth, the sherds come from K.pack.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const TAU = Math.PI * 2;
let layer = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const bump = (x, c, w) => { const t = (x - c) / w, k = 1 - t * t; return k > 0 ? k * k : 0; };

// ── the face of a stack-casting mould, as DEPTH below the face (≥ 0). Everything is in units of the stroke width: runners PX apart,
//    coin cavities (radius RC ≈ 0.35 → 0.7 of a stroke across) on both sides of each runner, staggered, each fed by a slanted gate ──
const PX = 2.06, PY = 0.84, RC = 0.35, CU = 0.56, DEEP = 0.034;
const GAX = 0.05, GAY = -0.31, GBX = CU - RC * 0.78, GBY = -0.12, GEX = GBX - GAX, GEY = GBY - GAY, GEE = GEX * GEX + GEY * GEY;
function mould(u, v) {
  const ur = u - PX * Math.round(u / PX), au = ur < 0 ? -ur : ur;
  let dep = 0.05 * sstep(0.105, 0.03, au);                                              // main runner: a round-bottomed trough
  const vv = ur < 0 ? v : v - PY * 0.5, dv = vv - PY * Math.round(vv / PY), du = au - CU, r = Math.sqrt(du * du + dv * dv);
  if (r < RC + 0.01) {                                                                   // coin cavity: floor, outer rim groove, inner rim groove, square boss
    const m = Math.max(du < 0 ? -du : du, dv < 0 ? -dv : dv);
    const c = DEEP * (sstep(RC, RC - 0.036, r) - 0.93 * sstep(RC * 0.29, RC * 0.2, m)) + 0.017 * bump(r, RC * 0.865, RC * 0.095) + 0.013 * bump(m, RC * 0.36, RC * 0.075);
    if (c > dep) dep = c;
  }
  if (au < GBX + 0.07 && dv < 0) {                                                       // the gate that feeds it from the runner
    let t = ((au - GAX) * GEX + (dv - GAY) * GEY) / GEE; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = au - GAX - GEX * t, ey = dv - GAY - GEY * t, g = 0.03 * sstep(0.056, 0.018, Math.sqrt(ex * ex + ey * ey));
    if (g > dep) dep = g;
  }
  return dep;
}

function tint(mask, color) {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
  return c;
}

// ── fracture plan: one sherd per seed. Seeds are picked from the discs K.pack strings along the strokes (centre line first), about
//    two stroke widths apart, so the breaks run ACROSS the strokes. Each sherd keeps the slab's pattern but lies slightly askew. ──
function sherds(info) {
  const sw = info.strokeWidth, u = sw / 75, r = L.rng('g22sherds' + info.key), TH = -0.19;
  const ct = Math.cos(TH), st = Math.sin(TH), pu = r() * PX, pv = r() * PY, out = [];
  for (const d of K.pack({ seed: 'g22seed', rmax: sw * 0.5, rmin: Math.max(3.5, sw * 0.17) })) {
    const D = sw * r.range(1.45, 2.35);
    if (out.some((s) => Math.hypot(s.x - d.x, s.y - d.y) < (D + s.D) * 0.5)) continue;
    const rot = TH + r.range(-0.07, 0.07), lay = r.range(-0.022, 0.022);
    out.push({ x: d.x, y: d.y, D, cs: Math.cos(rot), sn: Math.sin(rot),
      ou: ((d.x - S / 2) * ct + (d.y - S / 2) * st) / sw + pu + r.range(-0.05, 0.05),     // where the slab's pattern sits on this sherd
      ov: (-(d.x - S / 2) * st + (d.y - S / 2) * ct) / sw + pv + r.range(-0.05, 0.05),
      lc: Math.cos(lay), ls: Math.sin(lay), mx: r.range(-1.4, 1.4) * u, my: r.range(-1.4, 1.4) * u,   // how it was laid down: a nudge and a twist
      gap: sw * r.range(0.03, 0.058), tx: r.range(-0.11, 0.11), ty: r.range(-0.11, 0.11),      // half the break's width; the tilt it lies at
      tone: r.int(0, 4), amt: r.range(0.14, 0.58) });
  }
  return out;
}

// ── small things pressed into / standing on the face, drawn with paths as a height detail map (128 = level) ──
function detailMap(info) {
  const sw = info.strokeWidth, su = Math.sqrt(sw / 75), b = info.bbox, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const c = L.makeCanvas(S, S), h = c.getContext('2d');
  h.fillStyle = 'rgb(128,128,128)'; h.fillRect(0, 0, S, S);
  h.save(); K.clipGlyph(h, { grow: 2 });
  const rp = L.rng('g22pits' + info.key);
  for (let k = 0, n = Math.round(bw * bh / 1000); k < n; k++) {                          // sand grit standing proud, and a few pits left by burnt-out chaff
    const x = b.x0 + rp() * bw, y = b.y0 + rp() * bh, pit = rp() < 0.3, rr = (pit ? rp.range(0.8, 2.2) : rp.range(0.7, 1.9)) * su, al = rp.range(0.35, 0.8);
    if (!K.inGlyph(x, y, 2)) continue;
    h.fillStyle = pit ? `rgba(30,30,30,${al})` : `rgba(240,240,240,${al * 0.85})`;
    h.beginPath(); h.ellipse(x, y, rr, rr * rp.range(0.55, 1), rp() * 3, 0, TAU); h.fill();
  }
  h.lineCap = 'round';
  for (let k = 0, n = Math.round(bw * bh / 2600); k < n; k++) {                          // tooling scratches and chaff impressions
    const x = b.x0 + rp() * bw, y = b.y0 + rp() * bh, a = rp() * TAU, len = rp.range(8, 34) * su, bend = rp.range(-5, 5) * su, al = rp.range(0.25, 0.6), lw = rp.range(1.1, 2) * su;
    if (!K.inGlyph(x, y, 4)) continue;
    h.strokeStyle = `rgba(40,40,40,${al})`; h.lineWidth = lw;
    h.beginPath(); h.moveTo(x, y); h.quadraticCurveTo(x + Math.cos(a) * len / 2 - Math.sin(a) * bend, y + Math.sin(a) * len / 2 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len); h.stroke();
  }
  h.restore();
  return L.blurred(c, 0.45);
}

// ── the lit top faces of all the sherds, per device pixel ──
function buildFace(info, seeds, detail) {
  const sw = info.strokeWidth, u = sw / 75, su = Math.sqrt(u), ns = seeds.length;
  const nz = L.makeNoise('g22grit'), nw = L.makeNoise('g22warp'), nc = L.makeNoise('g22clay');
  const ramp = L.makeRamp([[0, '#a8553a'], [0.5, '#c47452'], [1, '#d99b74']]), lut = new Float32Array(257 * 3);
  for (let i = 0; i <= 256; i++) { const c = ramp(i / 256); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const TONES = [[122, 63, 37], [231, 170, 120], [141, 123, 110], [194, 85, 44], [217, 180, 138]];   // every sherd fired a little differently
  const SX = Float64Array.from(seeds, (s) => s.x), SY = Float64Array.from(seeds, (s) => s.y), SG = Float64Array.from(seeds, (s) => s.gap);
  const SEP = new Float64Array(ns * ns);
  for (let a = 0; a < ns; a++) for (let b = 0; b < ns; b++) SEP[a * ns + b] = Math.hypot(SX[a] - SX[b], SY[a] - SY[b]) || 1;
  // light from the top-left, 36° above the page
  const ll = Math.hypot(0.52, 0.62, 0.59), LX = -0.52 / ll, LY = -0.62 / ll, LZ = 0.59 / ll;
  const hl = Math.hypot(LX, LY, LZ + 1), HX = LX / hl, HY = LY / hl, HZ = (LZ + 1) / hl, lxy = Math.hypot(LX, LY), tanE = LZ / lxy;
  const AMB = 0.47, bw = 0.05 * sw, bd = 0.032 * sw, f1 = 1 / (0.6 * sw), f2 = 1 / (0.13 * sw), fc = 1 / (13 * u), fb = 1 / (28 * u), ff = 1 / (15 * u), fg = 1 / (40 * u);
  const crumbs = [];
  const face = L.pixelCanvas(S, S, (data, pw, ph, q) => {
    const det = L.getRaw(detail).data, b = info.bbox, pad = 10;
    const i0 = Math.max(0, Math.floor((b.x0 - pad) * q)), i1 = Math.min(pw, Math.ceil((b.x1 + pad) * q));
    const j0 = Math.max(0, Math.floor((b.y0 - pad) * q)), j1 = Math.min(ph, Math.ceil((b.y1 + pad) * q));
    const W = i1 - i0, Hh = j1 - j0, N = W * Hh;
    if (W < 3 || Hh < 3) return;
    const Hf = new Float32Array(N).fill(-1e3), Af = new Float32Array(N), Rf = new Float32Array(N), Df = new Float32Array(N), Cf = new Uint16Array(N);

    // pass 1 — which sherd, how far inside its broken edge, and the height of its face
    for (let j = j0; j < j1; j++) {
      const y = (j + 0.5) / q;
      for (let i = i0; i < i1; i++) {
        const x = (i + 0.5) / q;
        if (K.sdGlyph(x, y) > 7) continue;
        const a1 = x * f1, b1 = y * f1, a2 = x * f2, b2 = y * f2;                           // the fracture net: warped Voronoi cells around the seeds
        const wvx = sw * (0.07 * nw.n2(a1, b1) + 0.022 * nw.n2(a2 + 7.3, b2)), wvy = sw * (0.07 * nw.n2(a1 + 31.7, b1 + 17.1) + 0.022 * nw.n2(a2 + 3.1, b2 + 41.9));
        let wx = x + wvx, wy = y + wvy, e1 = 1e18, k1 = 0;
        for (let s = 0; s < ns; s++) { const ex = wx - SX[s], ey = wy - SY[s], e = ex * ex + ey * ey; if (e < e1) { e1 = e; k1 = s; } }
        const sh = seeds[k1];
        const px = x - sh.x - sh.mx, py = y - sh.y - sh.my;                                 // into the sherd's own frame (it lies a little askew)
        const qx = sh.x + px * sh.lc + py * sh.ls, qy = sh.y - px * sh.ls + py * sh.lc;
        const sd = K.sdGlyph(qx, qy);
        if (sd > 3) continue;
        const wob = 0.9 * su * (0.55 + 0.45 * nz.n2(qx * fb + 5, qy * fb + 70)), tooth = 0.09 * su * nz.n2(qx * 0.43 + 50, qy * 0.43);   // the broken edge wanders a little…
        const cn = nz.n2(qx * fc + 11, qy * fc - 7), chip = cn > 0.42 ? (cn - 0.42) * 8 * u : 0;                                             // …and lost a bite here and there
        let ds = -sd - wob - chip, d = ds - tooth;                                          // ds shapes the arris, d (with the fine tooth) cuts the silhouette
        if (d < -3) continue;
        wx = qx + wvx; wy = qy + wvy;
        const ax = wx - sh.x, ay = wy - sh.y; e1 = ax * ax + ay * ay;
        let db = 1e9;
        for (let s = 0; s < ns; s++) {
          if (s === k1) continue;
          const ex = wx - SX[s], ey = wy - SY[s], bis = (ex * ex + ey * ey - e1) / (2 * SEP[k1 * ns + s]) - (SG[s] + sh.gap) * 0.5;
          if (bis < db) db = bis;
        }
        if (i % (8 * q) === 0 && j % (8 * q) === 0 && db < 0 && db > -sh.gap && sd < -0.2 * sw) crumbs.push([x, y]);
        if (db < ds) ds = db;
        if (db - tooth < d) d = db - tooth;
        if (d < -3) continue;
        const k = (j - j0) * W + (i - i0);
        const fl = nz.n2(qx * ff + 90, qy * ff + 3), bwl = bw * (fl > 0.2 ? 1 + (fl - 0.2) * 2.2 : 1), t = ds / bwl;   // rounded arris; wider where a flake spalled off
        let h = t < 1 ? -bd * (1 - t) * (1 - t) : 0;
        const dx = qx - sh.x, dy = qy - sh.y;
        const dep = mould((dx * sh.cs + dy * sh.sn) / sw + sh.ou, (-dx * sh.sn + dy * sh.cs) / sw + sh.ov);
        h -= dep * sw;
        h += 0.9 * u * nz.fbm(x * fg, y * fg, 3) + 0.13 * su * nz.fbm(x / 4.6 + 20, y / 4.6, 2) + 0.03 * nz.n2(x * 0.95 + 9, y * 0.95);   // the hand-pressed face, its grit
        h += (det[(j * pw + i) * 4] - 128) * (1.25 * su / 127);
        Hf[k] = h; Df[k] = ds; Cf[k] = k1; Rf[k] = Math.min(1, dep / DEEP);
        const al = d * q + 0.5; Af[k] = al < 0 ? 0 : al > 1 ? 1 : al;
      }
    }

    // pass 2 — light and colour
    const SO = [], ST = [];
    for (const tt of [0.8, 1.6, 2.6, 4, 6]) {                                              // look toward the light: is something taller in the way?
      const di = Math.round((LX / lxy) * tt * u * q), dj = Math.round((LY / lxy) * tt * u * q), o = dj * W + di;
      if (o !== 0 && !SO.includes(o)) { SO.push(o); ST.push((Math.hypot(di, dj) / q) * tanE); }
    }
    const nst = SO.length, soft = 0.4 * u, drop = 0.6 / q, edgeW = 2.2 * u;
    for (let j = 1; j < Hh - 1; j++) {
      const y = (j + j0 + 0.5) / q;
      for (let i = 1; i < W - 1; i++) {
        const k = j * W + i, al = Af[k];
        if (al <= 0) continue;
        const x = (i + i0 + 0.5) / q, h = Hf[k], sh = seeds[Cf[k]];
        let hL = Hf[k - 1], hR = Hf[k + 1], hU = Hf[k - W], hD = Hf[k + W];
        if (hL < -500) hL = h - drop; if (hR < -500) hR = h - drop; if (hU < -500) hU = h - drop; if (hD < -500) hD = h - drop;
        const gx = (hR - hL) * q * 0.5 + sh.tx, gy = (hD - hU) * q * 0.5 + sh.ty, inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        let dif = (-gx * LX - gy * LY + LZ) * inv; if (dif < 0) dif = 0;
        let spc = (-gx * HX - gy * HY + HZ) * inv; spc = spc > 0 ? Math.pow(spc, 28) : 0;
        let shd = 0;
        for (let s = 0; s < nst; s++) { const kk = k + SO[s]; if (kk < 0 || kk >= N) continue; const e = Hf[kk] - h - ST[s]; if (e > shd) shd = e; }
        shd = shd > 0 ? Math.min(1, shd / soft) : 0;
        const rec = Rf[k];
        const lum = (AMB + (1 - AMB) * Math.min(1.5, dif / LZ) * (1 - 0.72 * shd)) * (1 - 0.06 * rec);
        // the clay body
        let t = 0.5 + 0.75 * nc.fbm(x / 150, y / 150, 3); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const li = ((t * 256) | 0) * 3;
        let cr = lut[li], cg = lut[li + 1], cb = lut[li + 2], a;
        let v = 0.5 + 1.1 * nc.fbm(x / 70 + 40, y / 70 - 13, 3); v = v < 0 ? 0 : v > 1 ? 1 : v;   // firing clouds: grey where it was starved of air, buff where it burnt clean
        if (v < 0.42) { a = (1 - v / 0.42) * 0.5; cr += (96 - cr) * a; cg += (80 - cg) * a; cb += (70 - cb) * a; }
        else { a = ((v - 0.42) / 0.58) * 0.3; cr += (236 - cr) * a; cg += (196 - cg) * a; cb += (150 - cb) * a; }
        const tn = TONES[sh.tone]; a = sh.amt; cr += (tn[0] - cr) * a; cg += (tn[1] - cg) * a; cb += (tn[2] - cb) * a;
        let soil = 0.5 + 1.25 * nc.fbm(x / 46 - 7, y / 46 + 61, 2); soil = soil < 0 ? 0 : soil > 1 ? 1 : soil;
        a = rec * 0.34 * (1 - soil); cr += (84 - cr) * a; cg += (64 - cg) * a; cb += (54 - cb) * a;             // soot left in the cavities and runners by the casting…
        a = rec * 0.5 * soil + 0.13 * soil * soil; cr += (218 - cr) * a; cg += (194 - cg) * a; cb += (164 - cb) * a;   // …and pale burial earth still lodged in them
        const dd = Df[k];
        if (dd < edgeW) { a = 0.3 * (1 - dd / edgeW); cr += (228 - cr) * a; cg += (152 - cg) * a; cb += (106 - cb) * a; }   // the fresher clay of the break
        const m = (1 + 0.05 * nc.n2(x / 2.7, y / 2.7) + 0.04 * nc.n2(x / 11 + 5, y / 11)) * lum, cool = lum < 1 ? 1 - lum : 0, sp = spc * 0.15 * (1 - shd) * 255;
        const o = ((j + j0) * pw + (i + i0)) * 4;
        data[o] = cr * m + sp; data[o + 1] = cg * m * (1 + 0.03 * cool) + sp * 0.92; data[o + 2] = cb * m * (1 + 0.1 * cool) + sp * 0.82; data[o + 3] = al * 255;
      }
    }
  });
  return { face, crumbs };
}

// a crumb of fired clay: a small faceted lump with its own shadow and a lit corner
function crumb(g, r, x, y, rr) {
  const col = r.pick(['#c0683f', '#a9532f', '#d58a5c', '#b9643c']), n = r.int(5, 7), ph = r() * TAU, pts = [];
  for (let k = 0; k < n; k++) { const t = ph + (k / n) * TAU, q = rr * r.range(0.7, 1.1); pts.push([Math.cos(t) * q, Math.sin(t) * q * 0.85]); }
  const path = (ox, oy) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(x + ox + p[0], y + oy + p[1]) : g.moveTo(x + ox + p[0], y + oy + p[1]))); g.closePath(); };
  g.fillStyle = 'rgba(40,24,12,0.34)'; path(rr * 0.45, rr * 0.65); g.fill();
  g.fillStyle = L.radial(g, x - rr * 0.35, y - rr * 0.4, rr * 0.1, rr * 1.25, [[0, L.shade(col, 0.28)], [0.55, col], [1, L.shade(col, -0.38)]]); path(0, 0); g.fill();
  g.fillStyle = 'rgba(255,232,200,0.4)'; g.beginPath(); g.arc(x - rr * 0.32, y - rr * 0.34, rr * 0.2, 0, TAU); g.fill();
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, u = sw / 75, b = info.bbox, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const { face, crumbs } = buildFace(info, sherds(info), detailMap(info));

  // temper in the clay body: quartz, mica and dark iron grains (only on the faces)
  const q = face.getContext('2d'), rc = L.rng('g22specks' + info.key);
  q.globalCompositeOperation = 'source-atop';
  for (let k = 0, n = Math.round(bw * bh / 300); k < n; k++) {
    const x = b.x0 + rc() * bw, y = b.y0 + rc() * bh, rr = rc.range(0.5, 1.5), sq = rc.range(0.5, 1), rot = rc() * 3;
    const col = rc.pick(['#f3dcc0', '#fff1dc', '#5a2e1c', '#3d2a22', '#e9b98e']), al = rc.range(0.25, 0.7);
    if (!K.inGlyph(x, y, 1)) continue;
    q.fillStyle = L.rgba(col, al); q.beginPath(); q.ellipse(x, y, rr, rr * sq, rot, 0, TAU); q.fill();
  }
  q.globalCompositeOperation = 'source-over';

  // ── page ──
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#f3eddd', tone: '#8a6f45', seed: 'g22paper', stain: 0.2, foxing: 0.14, edge: 0.16 }), 0, 0);
  const ox = 0.046 * sw, oy = 0.068 * sw;                           // the sherds' thickness, seen as the broken section on their far side
  const sil = tint(face, '#2a1a0c');
  g.globalAlpha = 0.26; g.drawImage(L.blurred(sil, 10 * u), ox + 6 * u, oy + 9 * u);          // cast shadow
  g.globalAlpha = 0.34; g.drawImage(L.blurred(sil, 4 * u), ox + 2.2 * u, oy + 3.4 * u);
  g.globalAlpha = 0.5; g.drawImage(L.blurred(sil, 1.3 * u), ox + 0.8 * u, oy + 1.2 * u);      // contact shadow
  const wall = L.makeCanvas(S, S), wg = wall.getContext('2d'), flat = tint(face, '#6b3823');
  for (let n = Math.max(3, Math.ceil(Math.hypot(ox, oy) * L.SS / 1.2)), k = n; k >= 1; k--) wg.drawImage(flat, ox * k / n, oy * k / n);   // extrude
  wg.globalCompositeOperation = 'source-atop'; wg.globalAlpha = 0.4;                                   // broad, quiet variation along the section (no beading)
  wg.drawImage(L.noiseTex(S, S, { seed: 'g22w', scale: 30, octaves: 3, res: 0.5, contrast: 1.3, ramp: [[0, '#40200f'], [1, '#9c5c3b']] }), 0, 0);
  wg.globalAlpha = 0.6; wg.drawImage(L.blurred(tint(face, '#c98558'), 1.7 * u), ox * 0.15, oy * 0.15);   // lighter just under the arris, darker toward the paper
  g.globalAlpha = 1; g.drawImage(wall, 0, 0);
  g.globalAlpha = 1;
  g.drawImage(face, 0, 0);

  // crumbs of fired clay lying in the breaks and just off the edges
  const rk = L.rng('g22crumbs' + info.key), spots = [];
  for (const p of crumbs) { const keep = rk() < 0.09, jx = rk.range(-1.5, 1.5) * u, jy = rk.range(-1.5, 1.5) * u; if (keep) spots.push([p[0] + jx, p[1] + jy]); }
  for (const p of K.outline({ grow: 2 + 2.5 * u, spacing: sw * 0.9, seed: 'g22out', jitter: 0.9 })) {
    const keep = rk() < 0.09, far = rk.range(0, 3) * u;
    if (keep) spots.push([p.x + Math.cos(p.ang) * far, p.y + Math.sin(p.ang) * far]);
  }
  for (const p of spots) crumb(g, rk, p[0], p[1], rk.range(1.2, 2.8) * Math.sqrt(u));
  return c;
}

export default {
  name: '钱范残片',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },     // a 3-frame flash: perfectly still
};
