// g19 — 岛屿地图: an old hand-coloured engraved chart. The island IS the current glyph (every stroke a strip of land, joined
// where the strokes join): the coast follows the glyph outline with a little wobble (< 5 px), a hachured range runs down the
// centre line of every stroke (the depth inside the glyph is the elevation), short rivers fall from the range to the sea,
// outline-colour districts, a green coast wash, water lining and a graticule on the sea. The relief is shaded from the top-left.
// No names, no figures, no letters anywhere. Nothing here knows which character it is drawing.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const TAU = Math.PI * 2;
let layer = null;

function poly(g, pts, close) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
const pathLoops = (g, loops) => { g.beginPath(); for (const lp of loops) poly(g, lp, true); };

/** the colour of the land, computed per DEVICE pixel as a multiply layer: district washes (stronger along their borders, with the
 *  pigment pooled in the paper grain), the green coast wash, the shaded relief (light from the top-left) and the dash-dot borders */
function landTint({ sw, hw, kk, bb, nz, wob, Hs }) {
  const cell = 2.5 * sw, r = L.rng('g19dist');
  const ox = bb.x0 - cell * 1.5, oy = bb.y0 - cell * 1.5;
  const GW = Math.ceil((bb.x1 - bb.x0) / cell) + 3, GH = Math.ceil((bb.y1 - bb.y0) / cell) + 3;
  const sx = new Float32Array(GW * GH), sy = new Float32Array(GW * GH), sc = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    sx[k] = ox + (i + 0.5 + r.range(-0.3, 0.3)) * cell; sy[k] = oy + (j + 0.5 + r.range(-0.3, 0.3)) * cell; sc[k] = (i * 2 + j * 3) % 6;
  }
  const WASH = ['#eda893', '#ecd77c', '#b4d59a', '#d9b0d2', '#f3bf7c', '#c9d6a2'].map((h) => L.parseColor(h));
  const GRN = L.parseColor('#4f9a5c'), INK = [61, 44, 30];
  const KS = hw * 0.95, cs = 8 * kk, ks = Math.max(0.6, kk), PD = 16.6 * ks, band1 = 0.15 * sw, band2 = 0.045 * sw, g1 = 0.085 * sw, g2 = 0.25 * sw;
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const i0 = Math.max(0, Math.floor((bb.x0 - 8) * q)), i1 = Math.min(pw, Math.ceil((bb.x1 + 8) * q));
    const j0 = Math.max(0, Math.floor((bb.y0 - 8) * q)), j1 = Math.min(ph, Math.ceil((bb.y1 + 8) * q));
    for (let j = j0; j < j1; j++) {
      const y = (j + 0.5) / q;
      for (let i = i0; i < i1; i++) {
        const x = (i + 0.5) / q, sd = K.sdGlyph(x, y);
        if (sd > 6) continue;
        let dep = -sd; if (dep < 0.5 * hw) dep += wob(x, y);
        // districts: a warped Voronoi diagram of jittered grid sites
        const wx = x + 15 * nz.n2(x / 150 + 3, y / 150 + 7) + 3.5 * nz.n2(x / 31 - 4, y / 31 + 2);
        const wy = y + 15 * nz.n2(x / 150 - 5, y / 150 + 1) + 3.5 * nz.n2(x / 31 + 8, y / 31 - 6);
        const ci = Math.floor((wx - ox) / cell), cj = Math.floor((wy - oy) / cell);
        let d1 = 1e18, d2 = 1e18, k1 = 0, k2 = 0;
        for (let b = cj - 1; b <= cj + 1; b++) {
          if (b < 0 || b >= GH) continue;
          for (let a = ci - 1; a <= ci + 1; a++) {
            if (a < 0 || a >= GW) continue;
            const k = b * GW + a, dx = wx - sx[k], dy = wy - sy[k], dd = dx * dx + dy * dy;
            if (dd < d1) { d2 = d1; k2 = k1; d1 = dd; k1 = k; } else if (dd < d2) { d2 = dd; k2 = k; }
          }
        }
        const ex = sx[k2] - sx[k1], ey = sy[k2] - sy[k1], el = Math.hypot(ex, ey) || 1, e = (d2 - d1) / (2 * el);   // px to the border
        // relief: slope towards / away from the light, and the shadow the range throws to the lower right
        const h0 = Hs(x, y), hx = (Hs(x + 1, y) - Hs(x - 1, y)) * 0.5, hy = (Hs(x, y + 1) - Hs(x, y - 1)) * 0.5;
        const lit = (hx + hy) * 0.707 * KS, sh = lit < 0 ? Math.min(1, -lit) : 0, li = lit > 0 ? Math.min(1, lit) : 0;
        const cast = L.clamp((Hs(x - cs, y - cs) - h0 - 0.16) * 2.4);
        // pigment granulation
        const na = nz.n2(x * 0.55 + 3, y * 0.55), nb = nz.n2(x / 8 + 4, y / 8 - 2), gr = 1 + 0.2 * na + 0.16 * nb;
        let a = (0.24 + 0.3 * Math.exp(-e / band1) + 0.2 * Math.exp(-e / band2)) * gr * (1 - 0.3 * li); if (a > 0.9) a = 0.9;
        const W = WASH[sc[k1]];
        let R = 255 + (W[0] - 255) * a, G = 255 + (W[1] - 255) * a, B = 255 + (W[2] - 255) * a;
        const ga = Math.min(0.85, (0.5 * Math.exp(-dep / g1) + 0.22 * Math.exp(-dep / g2)) * gr);
        R *= 1 + (GRN[0] / 255 - 1) * ga; G *= 1 + (GRN[1] / 255 - 1) * ga; B *= 1 + (GRN[2] / 255 - 1) * ga;
        const sg = 1 + 0.3 * na + 0.14 * nb, f = (0.93 + 0.07 * li) * (1 - 0.2 * cast * sg), sd2 = Math.min(1, sh * sg);
        R *= f * (1 - 0.42 * sd2); G *= f * (1 - 0.42 * sd2); B *= f * (1 - 0.34 * sd2);
        if (e < 1.8) {                                                                      // district border: dash-dot ink
          const s = k1 < k2 ? 1 : -1; let u = (((wx * -ey + wy * ex) / el) * s) % PD; if (u < 0) u += PD;
          if (u < 8 * ks || (u > 11.5 * ks && u < 13.3 * ks)) {
            const al = L.clamp((0.62 * ks - e) * q + 0.5) * 0.72;
            R += (INK[0] - R) * al; G += (INK[1] - G) * al; B += (INK[2] - B) * al;
          }
        }
        const o = (j * pw + i) * 4; d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = 255;
      }
    }
  });
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, hw = sw / 2, bb = info.bbox;
  const kk = L.clamp(sw / 75, 0.45, 1.15), ks = Math.max(0.6, kk), C = S / 2;        // everything on the island is sized from the stroke width
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const nz = L.makeNoise('g19isle'); const r = L.rng('g19');
  const INK = '#3d2c1e';

  // ── the coast: the glyph outline, pushed in and out by a slow wobble (never more than 5 px)
  const WA = Math.min(4.2, sw * 0.056);
  const wob = (x, y) => WA * (0.95 * nz.fbm(x / 66 + 5, y / 66 + 2, 3) + 0.1 * nz.n2(x / 13 + 1, y / 13));
  const shore = (grow = 0) => {
    const kf = grow > 0 ? Math.max(0.2, 1 - grow / 45) : 1;
    return K.glyphLoops({ grow }).map((loop) => loop.map(([x, y]) => { const n = K.glyphNormal(x, y, 1.5), w = wob(x, y) * kf; return [x + n.x * w, y + n.y * w]; }));
  };
  const coast0 = shore(0);
  const landPath = (q = g) => pathLoops(q, coast0);

  // ── where the sheet furniture goes: the corner the glyph leaves freest (it differs from glyph to glyph)
  let rose = null;
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (const dx of [112, 132, 152, 176, 200]) for (const dy of [112, 132, 152, 176, 200]) {
    const x = cx ? S - dx : dx, y = cy ? S - dy : dy;
    const sc = Math.min(1, (K.sdGlyph(x, y) - 18) / 84, (Math.min(dx, dy) - 48) / 84);
    if (sc >= 0.5 && (!rose || sc > rose.sc + 0.01)) rose = { x, y, sc, cx, cy };
  }
  let bar = null;
  for (const sc of [1, 0.8, 0.62]) {
    for (const [ax, ay] of [[0, 1], [1, 1], [1, 0], [0, 0]]) {
      if (rose && rose.cx === ax && rose.cy === ay) continue;
      const w = 42 * sc, x0 = ax ? S - 92 - 5 * w : 92, y0 = ay ? 962 : 106; let ok = true;
      for (let u = 0; u <= 10; u++) if (K.sdGlyph(x0 + u * 0.5 * w, y0 + 3) < 36) ok = false;
      if (ok) { bar = { x0, y0, w, sc }; break; }
    }
    if (bar) break;
  }

  // ── sea: blue-green aged paper, a deeper wash hugging the shores
  g.drawImage(K.paper({ base: '#d6ddcb', tone: '#7f7a55', seed: 'g19sea', stain: 0.34, foxing: 0.35, edge: 0.2, fiber: 0.55 }), 0, 0);
  {
    const t = L.makeCanvas(S, S), q = t.getContext('2d');
    K.fillGlyph(q, 'rgba(84,138,150,0.5)', { grow: 29 * kk });
    g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(L.blurred(t, 11 * kk), 0, 0); g.restore();
  }
  // graticule: gently curved parallels, meridians converging towards the top
  const F0 = 44, STEP = 108;
  g.save(); g.beginPath(); g.rect(F0, F0, S - 2 * F0, S - 2 * F0); g.clip();
  g.strokeStyle = L.rgba('#2f4c5e', 0.5); g.lineWidth = 1.15;
  for (let k = -6; k <= 6; k++) {
    g.beginPath();
    for (let y = 0; y <= S; y += 20) { const x = C + k * STEP * (1 + 0.00013 * (y - C)) + 0.4 * Math.sin(y * 0.02 + k); y ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.beginPath();
    for (let x = 0; x <= S; x += 20) { const y = C + k * STEP + 0.00006 * (x - C) * (x - C) * (1 + k * 0.08) + 0.4 * Math.sin(x * 0.02 + k); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.restore();
  // engraved swell marks in the open sea, and the water lining; both keep clear of the compass and the scale bar
  g.save(); g.beginPath(); g.rect(F0, F0, S - 2 * F0, S - 2 * F0);
  if (rose) { g.moveTo(rose.x + 59 * rose.sc, rose.y); g.arc(rose.x, rose.y, 59 * rose.sc, 0, TAU); }
  if (bar) g.rect(bar.x0 - 9, bar.y0 - 12, bar.w * 5 + 18, 32);
  g.clip('evenodd');
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r.range(F0 + 8, S - F0 - 8), y = r.range(F0 + 8, S - F0 - 8);
    const len = r.range(8, 18), amp = r.range(0.8, 1.6), al = r.range(0.22, 0.42), lw = r.range(0.8, 1.2);
    if (K.sdGlyph(x, y) < 70 * kk || K.sdGlyph(x + len, y) < 70 * kk) continue;
    if (rose && Math.hypot(x + len / 2 - rose.x, y - rose.y) < 96 * rose.sc) continue;
    g.strokeStyle = L.rgba('#2f4c5e', al); g.lineWidth = lw;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.25, y - amp * 2, x + len * 0.5, y); g.quadraticCurveTo(x + len * 0.75, y + amp * 2, x + len, y); g.stroke();
  }
  // water lining: shore-parallel lines, gaps widening seawards
  g.lineJoin = 'round';
  [5, 11, 18, 26.5, 36.5, 48, 61].forEach((d, i) => {
    g.strokeStyle = L.rgba('#24485c', 0.72 - i * 0.085); g.lineWidth = 1.25 - i * 0.06;
    pathLoops(g, shore(d * kk)); g.stroke();
  });
  g.restore();

  // ── elevation: zero on the coastal strip, rising to a crest on the centre line of every stroke; the crest goes up and down
  // along the stroke (peaks and passes) and the flanks carry small spurs. Kept on a 1 px grid and sampled bilinearly.
  const N = S + 1, Hg = new Float32Array(N * N), foot = 0.22 * hw, rise = 0.78 * hw;
  for (let j = Math.max(0, Math.floor(bb.y0)); j <= Math.min(S, Math.ceil(bb.y1)); j++) for (let i = Math.max(0, Math.floor(bb.x0)); i <= Math.min(S, Math.ceil(bb.x1)); i++) {
    const d = -K.sdGlyph(i, j); if (d <= foot) continue;
    const t = (d - foot) / rise, p = t * (1.35 - 0.35 * Math.min(t, 1.5));
    const m = L.smooth((nz.ridged(i / (1.15 * sw) + 3.1, j / (1.15 * sw) + 8.7, 2) - 0.3) / 0.5);
    Hg[j * N + i] = p * (0.3 + 0.7 * m) * (1 + 0.17 * nz.fbm(i / (0.24 * sw) + 1.7, j / (0.24 * sw) - 4.2, 3));
  }
  const Hs = (x, y) => {
    if (x < 0) x = 0; else if (x > S - 0.001) x = S - 0.001;
    if (y < 0) y = 0; else if (y > S - 0.001) y = S - 0.001;
    const i = x | 0, j = y | 0, a = x - i, b = y - j, o = j * N + i;
    return (Hg[o] * (1 - a) + Hg[o + 1] * a) * (1 - b) + (Hg[o + N] * (1 - a) + Hg[o + N + 1] * a) * b;
  };

  // ── land
  g.save(); landPath(); g.clip('evenodd');
  g.drawImage(K.paper({ base: '#f4e8c9', tone: '#8a6a3a', seed: 'g19land', stain: 0.3, foxing: 0.2, edge: 0, fiber: 0.6 }), 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(landTint({ sw, hw, kk, bb, nz, wob, Hs }), 0, 0);
  g.globalCompositeOperation = 'source-over';

  // rivers: from the crest of a stroke, running along it for a while and then down its flank to the sea, widening as they go
  const MG = 2, MW = Math.ceil(S / MG) + 2, rmask = new Uint8Array(MW * MW);
  const mark = (x, y, rad) => {
    for (let b = Math.floor((y - rad) / MG); b <= Math.floor((y + rad) / MG); b++) for (let a = Math.floor((x - rad) / MG); a <= Math.floor((x + rad) / MG); a++) {
      if (a >= 0 && b >= 0 && a < MW && b < MW) rmask[b * MW + a] = 1;
    }
  };
  const masked = (x, y) => { const a = Math.floor(x / MG), b = Math.floor(y / MG); return a >= 0 && b >= 0 && a < MW && b < MW && rmask[b * MW + a] === 1; };
  const rivers = [], tribs = [], stp = 2.2 * ks;
  for (const bd of K.pack({ seed: 'g19riv', rmax: hw, rmin: hw * 0.6, gap: 1.3 })) {
    if (!r.chance(0.82)) continue;
    const tx = Math.cos(bd.ang), ty = Math.sin(bd.ang), side = r.sign(), along = r.sign(), nx = -ty * side, ny = tx * side;
    let x = bd.x + nx * 2.5, y = bd.y + ny * 2.5, vx = tx * along * 0.85 + nx * 0.5, vy = ty * along * 0.85 + ny * 0.5, done = false;
    const pts = [[x, y]];
    for (let st = 0; st < 120; st++) {
      const nn = K.glyphNormal(x, y, 2), pull = 0.04 + st * 0.007;
      vx = vx * 0.88 + nn.x * pull; vy = vy * 0.88 + nn.y * pull;
      const wb = nz.n2(x / 15 + 9, y / 15) * 0.3, cw = Math.cos(wb), sn = Math.sin(wb);
      [vx, vy] = [vx * cw - vy * sn, vx * sn + vy * cw];
      const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
      x += vx * stp; y += vy * stp; pts.push([x, y]);
      if (K.sdGlyph(x, y) > 2.5) { done = true; break; }
    }
    if (!done || pts.length < 10) continue;
    rivers.push(pts); for (const p of pts) mark(p[0], p[1], 3.6 * ks);
    if (r.chance(0.65)) {                                                    // a tributary joining from further up the range
      const jn = Math.floor(pts.length * r.range(0.3, 0.55)); let [x2, y2] = pts[jn]; const tp = [[x2, y2]];
      let px = tx * along, py = ty * along;                                   // it climbs steadily and stops short of the crest
      for (let st = 0; st < 15; st++) {
        const nn = K.glyphNormal(x2, y2, 2); let ux = px * 0.6 + (-nn.x * 0.7 + tx * along * 0.75) * 0.4, uy = py * 0.6 + (-nn.y * 0.7 + ty * along * 0.75) * 0.4;
        const wb = nz.n2(x2 / 13 + 2, y2 / 13 + 5) * 0.3, cw = Math.cos(wb), sn = Math.sin(wb);
        [ux, uy] = [ux * cw - uy * sn, ux * sn + uy * cw];
        const ul = Math.hypot(ux, uy) || 1; px = ux / ul; py = uy / ul; x2 += px * stp; y2 += py * stp;
        const dd = -K.sdGlyph(x2, y2); if (dd < 0.3 * hw || dd > 0.84 * hw) break;
        tp.push([x2, y2]);
      }
      if (tp.length > 5) { tribs.push(tp.reverse()); for (const p of tp) mark(p[0], p[1], 3 * ks); }
    }
  }

  // settlements: small ports on the coastal strip, well apart
  const towns = [];
  for (const p of K.outline({ grow: -Math.max(4.5, 0.2 * hw), spacing: 0.8 * sw, seed: 'g19town' }).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).map((o) => o.p)) {
    if (towns.length >= 12) break;
    if (masked(p.x, p.y) || towns.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 1.55 * sw)) continue;
    towns.push(p);
  }

  // hachures (晕滃线): short tapered strokes down the slopes of the ranges, heavier on the faces turned from the light
  const smp = [], HSP = L.clamp(sw * 0.06, 2.6, 4.8);
  for (let y = bb.y0; y <= bb.y1; y += HSP) for (let x = bb.x0; x <= bb.x1; x += HSP) {
    const px = x + r.range(-0.42, 0.42) * HSP, py = y + r.range(-0.42, 0.42) * HSP;
    if (!K.inGlyph(px, py, 0.16 * hw) || masked(px, py)) continue;
    const gx = (Hs(px + 2, py) - Hs(px - 2, py)) / 4, gy = (Hs(px, py + 2) - Hs(px, py - 2)) / 4;
    smp.push([px, py, gx, gy, Math.hypot(gx, gy)]);
  }
  const sl = smp.map((s) => s[4]).sort((a, b) => a - b);
  const lo = sl[Math.floor(sl.length * 0.4)] || 0, hi = sl[Math.floor(sl.length * 0.96)] || 1;
  for (const [px, py, gx, gy, m] of smp) {
    if (m <= lo || m < 1e-6) continue;
    const t = L.clamp((m - lo) / (hi - lo || 1)), dx = -gx / m, dy = -gy / m;
    const sh = Math.max(0, dx * 0.707 + dy * 0.707);
    const len = (4.5 + 7.5 * t + r.range(-1, 1.2)) * kk, w = (0.42 + 0.38 * t + 0.42 * sh) * ks;
    const x1 = px + dx * len, y1 = py + dy * len, nx = -dy * w, ny = dx * w;
    g.fillStyle = L.rgba(INK, 0.36 + 0.26 * t + 0.3 * sh);
    g.beginPath(); g.moveTo(px + nx, py + ny); g.lineTo(x1, y1); g.lineTo(px - nx, py - ny); g.closePath(); g.fill();
  }

  // woods: clumps of tree signs on the low ground
  g.lineCap = 'round';
  const TSP = 8.5 * ks;
  for (let y = bb.y0; y <= bb.y1; y += TSP) for (let x = bb.x0; x <= bb.x1; x += TSP) {
    const px = x + r.range(-0.4, 0.4) * TSP, py = y + r.range(-0.4, 0.4) * TSP, s = r.range(2.3, 3.2) * ks, al = r.range(0.55, 0.85), keep = r.chance(0.6);
    if (!keep || !K.inGlyph(px, py, 3.6 * ks) || Hs(px, py) > 0.1 || masked(px, py) || nz.n2(px / 60 + 2, py / 60 + 5) < 0.1) continue;
    if (towns.some((t) => Math.hypot(t.x - px, t.y - py) < 11 * ks)) continue;
    g.strokeStyle = L.rgba('#3f5a3a', al); g.lineWidth = ks;
    g.beginPath(); g.arc(px, py, s, Math.PI * 0.95, TAU * 1.02); g.moveTo(px + s * 1.5 + s * 0.8, py + 1); g.arc(px + s * 1.5, py + 1, s * 0.8, 0, Math.PI, true);
    g.moveTo(px, py); g.lineTo(px, py + s * 1.3); g.stroke();
  }

  // the rivers themselves, over the hachures
  g.strokeStyle = '#356a84';
  for (const pts of tribs) for (let i = 1; i < pts.length; i++) {
    g.lineWidth = (0.6 + 0.5 * (i / pts.length)) * ks;
    g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
  }
  for (const pts of rivers) for (let i = 1; i < pts.length; i++) {
    g.lineWidth = (0.7 + 2.1 * Math.pow(i / pts.length, 1.3)) * ks;
    g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
  }
  // roads: fine dotted red lines between neighbouring settlements (only where the straight run stays on land)
  g.setLineDash([4 * ks, 2.6 * ks]); g.strokeStyle = L.rgba('#8f3524', 0.7); g.lineWidth = 0.95 * ks;
  towns.forEach((p, i) => {
    towns.forEach((q, j) => {
      if (j <= i) return; const d = Math.hypot(p.x - q.x, p.y - q.y); if (d > 3.4 * sw) return;
      const mx = (p.x + q.x) / 2 - (q.y - p.y) * 0.08, my = (p.y + q.y) / 2 + (q.x - p.x) * 0.08;
      for (let u = 0.1; u < 1; u += 0.1) { const v = 1 - u; if (!K.inGlyph(v * v * p.x + 2 * u * v * mx + u * u * q.x, v * v * p.y + 2 * u * v * my + u * u * q.y, 2)) return; }
      g.beginPath(); g.moveTo(p.x, p.y); g.quadraticCurveTo(mx, my, q.x, q.y); g.stroke();
    });
  });
  g.setLineDash([]);
  for (const p of towns) {
    g.fillStyle = '#a4321f'; g.beginPath(); g.arc(p.x, p.y, 3.3 * ks, 0, TAU); g.fill();
    g.strokeStyle = L.rgba('#3a1a10', 0.85); g.lineWidth = 0.9 * ks; g.beginPath(); g.arc(p.x, p.y, 3.3 * ks, 0, TAU); g.stroke();
  }
  // dark green line just inside the shore
  g.lineJoin = 'round';
  g.strokeStyle = L.rgba('#2f6a3c', 0.8); g.lineWidth = 4 * ks; landPath(); g.stroke();
  g.restore();

  // shoreline in ink
  g.strokeStyle = L.rgba('#22241c', 0.92); g.lineWidth = 1.6; g.lineJoin = 'round'; landPath(); g.stroke();

  // ── sheet furniture: neatline with alternating bars, a compass star, a blank scale bar
  const F1 = 30;
  g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 2.6; g.strokeRect(F1, F1, S - 2 * F1, S - 2 * F1);
  g.lineWidth = 1.1; g.strokeRect(F0, F0, S - 2 * F0, S - 2 * F0);
  g.fillStyle = L.rgba(INK, 0.85);
  const seg = STEP / 2;
  for (let k = -10; k < 10; k++) {
    if (((k % 2) + 2) % 2) continue;
    const a0 = Math.max(F0, C + k * seg), a1 = Math.min(S - F0, C + (k + 1) * seg); if (a1 <= a0) continue;
    g.fillRect(a0, F1 + 3.5, a1 - a0, F0 - F1 - 7); g.fillRect(a0, S - F0 + 3.5, a1 - a0, F0 - F1 - 7);
    g.fillRect(F1 + 3.5, a0, F0 - F1 - 7, a1 - a0); g.fillRect(S - F0 + 3.5, a0, F0 - F1 - 7, a1 - a0);
  }
  if (rose) {
    g.save(); g.translate(rose.x, rose.y); g.rotate(-0.05); g.scale(rose.sc, rose.sc);
    g.strokeStyle = L.rgba(INK, 0.85); g.lineWidth = 1.3; g.beginPath(); g.arc(0, 0, 56, 0, TAU); g.stroke();
    g.lineWidth = 0.9; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke();
    for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 50, Math.sin(a) * 50); g.lineTo(Math.cos(a) * 56, Math.sin(a) * 56); g.stroke(); }
    const point = (ang, len, wid) => {
      g.save(); g.rotate(ang);
      g.fillStyle = '#e9e2c9'; g.beginPath(); g.moveTo(0, 0); g.lineTo(wid, -wid); g.lineTo(0, -len); g.closePath(); g.fill();
      g.fillStyle = L.rgba(INK, 0.9); g.beginPath(); g.moveTo(0, 0); g.lineTo(-wid, -wid); g.lineTo(0, -len); g.closePath(); g.fill();
      g.lineWidth = 1; g.beginPath(); g.moveTo(-wid, -wid); g.lineTo(0, -len); g.lineTo(wid, -wid); g.lineTo(0, 0); g.closePath(); g.stroke();
      g.restore();
    };
    for (let i = 0; i < 8; i++) point((i + 0.5) * (TAU / 8), 30, 4.5);
    for (let i = 0; i < 4; i++) point((i + 0.5) * (TAU / 4), 46, 7);
    for (let i = 1; i < 4; i++) point(i * (TAU / 4), 62, 9);
    point(0, 82, 9);
    g.fillStyle = '#b23a26'; g.beginPath(); g.arc(0, 0, 3.4, 0, TAU); g.fill();
    g.restore();
  }
  if (bar) {
    const { x0, y0, w } = bar, h = 7;
    g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 1.1; g.fillStyle = L.rgba(INK, 0.88);
    for (let i = 0; i < 5; i++) { if (i % 2 === 0) g.fillRect(x0 + i * w, y0, w, h); }
    g.strokeRect(x0, y0, w * 5, h);
    g.beginPath(); for (let i = 0; i <= 5; i++) { g.moveTo(x0 + i * w, y0 - 6); g.lineTo(x0 + i * w, y0); } g.moveTo(x0, y0 + h + 4); g.lineTo(x0 + w * 5, y0 + h + 4); g.stroke();
  }

  // ── the sheet as an object. It was folded in four: each crease stands up a little, lit on the side towards the light and
  // shaded on the other, with a rubbed line of lost ink along it …
  for (const vertical of [true, false]) {
    g.save(); if (!vertical) { g.translate(S, 0); g.rotate(Math.PI / 2); }
    const xx = 540.5;
    g.fillStyle = L.linear(g, xx - 90, 0, xx + 120, 0, [[0, 'rgba(255,250,235,0)'], [0.42, 'rgba(255,250,235,0.075)'], [0.4286, 'rgba(48,34,20,0.11)'], [0.62, 'rgba(48,34,20,0.045)'], [1, 'rgba(48,34,20,0)']]);
    g.fillRect(xx - 90, 0, 210, S);
    g.fillStyle = L.linear(g, xx - 9, 0, xx + 9, 0, [[0, 'rgba(60,40,20,0)'], [0.42, 'rgba(255,250,235,0.16)'], [0.5, 'rgba(60,40,20,0.2)'], [0.62, 'rgba(60,40,20,0.08)'], [1, 'rgba(60,40,20,0)']]);
    g.fillRect(xx - 9, 0, 18, S);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = L.rgba('#efe6cf', r.range(0.12, 0.38));
      g.beginPath(); g.ellipse(xx + r.gauss() * 1.2, r() * S, r.range(0.4, 1.0), r.range(0.8, 2.6), 0, 0, TAU); g.fill();
    }
    g.restore();
  }
  // … and the copper plate left its mark: a shallow step pressed into the paper just outside the neatline
  const PM = 13.5;
  for (const [lw, a] of [[5, 0.05], [2.6, 0.09], [1.1, 0.16]]) {
    g.lineWidth = lw; g.lineJoin = 'miter';
    g.strokeStyle = `rgba(48,34,20,${a})`; g.beginPath(); g.moveTo(PM, S - PM); g.lineTo(PM, PM); g.lineTo(S - PM, PM); g.stroke();
    g.strokeStyle = `rgba(255,250,235,${a * 2.2})`; g.beginPath(); g.moveTo(PM, S - PM); g.lineTo(S - PM, S - PM); g.lineTo(S - PM, PM); g.stroke();
  }
  return c;
}

export default {
  name: '岛屿地图',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
