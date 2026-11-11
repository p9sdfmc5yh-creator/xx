// s06 — 藻井 (macro). The lens is pushed right up against the gilt mouth-ring of a round caisson: the arc is the top
// edge of that ring. Below it, ONE painted band fills the frame — a ring of big lotus-petal lappets pointing into the
// well, blue and green by turns (青绿相间), each with its stepped 叠晕 tints, a fat raised gilt outline and a raised
// gilt ruyi head holding a pearl (沥粉贴金). A second row of petals shows between their tips, and behind everything
// the ground itself is gold leaf, so the bottom of the frame glows amber instead of falling into a hole.
// Above the arc: nothing, black.
// Recipe: paint pigment colour + a height map + a "where is the gold leaf" mask side by side → shade every pixel
// (matte pigment with cast shadows from the raised lines; gold as rough metal that also mirrors the paint next to it;
// the mouth-ring is an analytic moulding) → shallow depth of field → bloom, a travelling hot spot and glints at draw time.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 96;
const LW = W + PAD * 2, LH = H + PAD * 2;
let S = null;

const GOLD_BASE = [214, 158, 46];
const BLUE = { top: '#2440cc', core: '#13249a', mid: '#3458e4', lit: '#86a4fa', wht: '#f3f6ff' };
const GREEN = { top: '#0ea673', core: '#077552', mid: '#1cc08c', lit: '#7cecc0', wht: '#f0fff8' };

// depths, px inward from the arc
const RIM_A = 50, RIM_G = 56, RIM_B = 74;   // mouth-ring: big half-round 0→50, scribed groove →56, small bead →74
const D0 = 62;                              // the petals tuck in under the ring
const PITCH = 436, LEN_F = 368, LEN_B = 506;
const GW = 17;                              // width of the raised outline
const LEVELS = 24;                          // height-map grey levels per px of relief
const HV_GROUND = 16, HV_BACK = 40, HV_FRONT = 60;

// key light: from the upper left, a little in front of the surface (screen coords: x right, y down, z toward the lens)
const LX = -0.36, LY = -0.64, LZ = 0.68;
const HX = -0.196, HY = -0.349, HZ = 0.916;  // half vector with the view direction

const grey = (v) => { v = Math.round(L.clamp(v, 0, 255)); return `rgb(${v},${v},${v})`; };
const poly = (c, P, close = true) => { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); if (close) c.closePath(); };

/** closed outline of one lotus-petal lappet in its own frame: x across, y from the base (0) to the ogee tip (len) */
function petalLocal(w, len, lean) {
  const side = L.smoothPath([[-0.5, -0.14], [-0.503, 0], [-0.516, 0.2], [-0.492, 0.43], [-0.4, 0.65], [-0.235, 0.815], [-0.088, 0.915], [-0.03, 0.964], [0, 1]].map(([x, y]) => [x * w, y * len]), 5);
  const sk = (x, y) => [x + lean * Math.pow(Math.max(0, y / len), 2), y];
  const out = side.map(([x, y]) => sk(x, y));
  for (let i = side.length - 2; i >= 0; i--) out.push(sk(-side[i][0], side[i][1]));
  return out;
}

/** craquelure of the gesso: the edges of a warped cell mosaic, as a padded layer (dark lines on transparent) */
function crackle(env, seed, scale, width) {
  const a = env.arc, res = 0.6;
  const cw = Math.round(LW * res), ch = Math.round(LH * res);
  const nz = L.makeNoise(seed), img = new ImageData(cw, ch), d = img.data;
  const yTop = Math.floor((a.crestY + PAD) * res) - 2;
  for (let y = Math.max(0, yTop); y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const px = x / res - PAD, py = y / res - PAD;
      const u = px / scale + 0.5 * nz.n2(px / (scale * 2.6), py / (scale * 2.6)), v = py / scale + 0.5 * nz.n2(px / (scale * 2.6) + 40, py / (scale * 2.6) - 17);
      const e = nz.cell(u, v).edge * scale;                          // ≈ px from the nearest cell wall (×2)
      const wv = width * (0.55 + 0.6 * (0.5 + 0.5 * nz.n2(px / 150, py / 150 + 9)));
      if (e > wv + 1.5) continue;
      const k = (y * cw + x) * 4;
      d[k] = 3; d[k + 1] = 4; d[k + 2] = 10; d[k + 3] = 255 * L.clamp((wv + 1.5 - e) / 1.5);
    }
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  const out = L.makeCanvas(LW, LH), og = out.getContext('2d');
  og.imageSmoothingQuality = 'high'; og.drawImage(small, 0, 0, LW, LH);
  return out;
}

/** paint colour, height and gold mask for the whole band */
function paint(env) {
  const a = env.arc;
  const T = a.span(PAD + 80);
  const alb = L.makeLayer(PAD), hl = L.makeLayer(PAD), gm = L.makeLayer(PAD);
  const g = alb.getContext('2d'), h = hl.getContext('2d'), m = gm.getContext('2d');
  const r = L.rng('s06-macro-b'), nz = L.makeNoise('s06-hand');
  const full = (c) => c.fillRect(-PAD, -PAD, LW, LH);
  const gold = `rgb(${GOLD_BASE})`;
  const Rref = a.R - D0 - 130;
  const dth = PITCH / Rref, n = Math.ceil(T / dth) + 1, th0 = 0.37 * dth;
  /** petal frame → picture, following the ring; `amp` adds the wander of a hand-drawn line */
  const warp = (P, thc, amp = 0, s = 0) => P.map(([x, y], i) => {
    const wx = amp ? amp * nz.n2(i * 0.045 + s, s * 1.7) : 0, wy = amp ? amp * nz.n2(i * 0.045 - s * 2.1, 9.3 + s) : 0;
    const q = a.pt(thc + (x + wx) / Rref, -(D0 + y + wy));
    return [q.x, q.y];
  });
  /** gold leaf is laid in overlapping squares: each a slightly different tone, with a faint seam */
  const leaf = (d0, d1, lo, hi, seam) => {
    g.save(); a.clipBand(g, -d0, -d1, -T, T);
    for (let th = -T + r.range(0, 0.02); th < T;) {
      const step = r.range(lo, hi) / a.R, tone = r.range(-0.11, 0.06);
      a.pathBand(g, -d0, -d1, th, th + step + 0.001); g.fillStyle = tone < 0 ? L.rgba('#3a1a02', -tone * 2) : L.rgba('#fff3c0', tone * 2); g.fill();
      const p0 = a.pt(th, -d0), p1 = a.pt(th + r.range(-0.002, 0.002), -d1);
      g.strokeStyle = `rgba(70,34,4,${seam})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      th += step;
    }
    g.restore();
  };

  // ── the ground behind the petals is gilded too (leaf over a slightly uneven gesso) ──
  g.fillStyle = gold; full(g);
  m.fillStyle = '#fff'; full(m);
  h.fillStyle = grey(HV_GROUND); full(h);
  for (let d = RIM_B - 6; d < 760; d += 112) leaf(d, d + 113, 90, 136, 0.34);
  h.save(); h.globalCompositeOperation = 'lighter';
  h.drawImage(L.noiseLayer(PAD, { seed: 's06dent', scale: 30, octaves: 2, res: 0.35, contrast: 1.5, ramp: [[0, '#000'], [1, grey(26)]] }), -PAD, -PAD);
  h.restore();

  /** a raised gilt line (沥粉): a slumped bead in section, gold-leafed */
  const tube = (P, w, close, hv) => {
    m.lineJoin = m.lineCap = 'round'; m.strokeStyle = '#fff'; m.lineWidth = w; poly(m, P, close); m.stroke();
    g.save(); g.lineJoin = g.lineCap = 'round'; g.strokeStyle = gold; g.lineWidth = w + 0.6; poly(g, P, close); g.stroke(); g.restore();
    h.save(); h.lineJoin = h.lineCap = 'round'; h.globalCompositeOperation = 'lighten';
    const pk = LEVELS * w * 0.42, NS = 7;
    for (let k = 0; k < NS; k++) {
      const rin = 1 - (k + 0.5) / (NS + 0.2);            // normalised distance from the centre line at this stroke's edge
      h.lineWidth = w * (1 - k / NS); h.strokeStyle = grey(hv + pk * Math.sqrt(1 - rin * rin)); poly(h, P, close); h.stroke();
    }
    h.restore();
  };
  /** a drop of the same paste: where the bag paused, where a line starts or stops, or a pearl */
  const knot = (x, y, rad, hv, lift = 0.72) => {
    m.fillStyle = '#fff'; m.beginPath(); m.arc(x, y, rad, 0, L.TAU); m.fill();
    g.fillStyle = gold; g.beginPath(); g.arc(x, y, rad + 0.3, 0, L.TAU); g.fill();
    h.save(); h.globalCompositeOperation = 'lighten';
    const pk = Math.min(LEVELS * rad * lift, 250 - hv), NS = 8;
    for (let k = 0; k < NS; k++) {
      const rin = 1 - (k + 0.5) / (NS + 0.2);
      h.fillStyle = grey(hv + pk * Math.sqrt(1 - rin * rin)); h.beginPath(); h.arc(x, y, rad * (1 - k / NS), 0, L.TAU); h.fill();
    }
    h.restore();
  };
  const knots = (P, w, hv, count) => {
    for (let k = 0; k < count; k++) { const q = P[Math.floor(r.range(0.04, 0.96) * P.length)]; knot(q[0] + r.range(-1, 1), q[1] + r.range(-1, 1), w * r.range(0.56, 0.7), hv, 0.62); }
  };
  /** one lappet: deep core, then mid / light / white 叠晕 steps toward the edge, then the gilt outline */
  const petal = (thc, w, len, lean, pal0, o) => {
    const tn = o.tone, pal = { top: L.shade(pal0.top, tn), core: L.shade(pal0.core, tn), mid: L.shade(pal0.mid, tn * 0.8), lit: L.shade(pal0.lit, tn * 0.6), wht: pal0.wht };
    const loc = petalLocal(w, len, lean);
    const P = warp(loc, thc, 2.2, o.seed);
    const c0 = a.pt(thc, -(D0 + len * 0.42));
    g.save();
    g.shadowColor = `rgba(0,0,10,${o.shA})`; g.shadowBlur = o.shB; g.shadowOffsetX = o.shB * 0.34; g.shadowOffsetY = o.shB * 0.56;
    poly(g, P);
    const tA = a.pt(thc, -D0), tB = a.pt(thc, -(D0 + len));
    g.fillStyle = L.linear(g, tA.x, tA.y, tB.x, tB.y, [[0, pal.top], [0.5, pal.core], [1, L.shade(pal.core, -0.14)]]); g.fill();
    g.restore();
    g.save(); poly(g, P); g.clip(); g.lineJoin = 'round';
    const b0 = GW / 2 + o.ww, b1 = b0 + o.wl, b2 = b1 + o.wm;
    poly(g, warp(loc, thc, 3.6, o.seed + 3.1)); g.strokeStyle = pal.mid; g.lineWidth = b2 * 2; g.stroke();
    poly(g, warp(loc, thc, 3.0, o.seed + 5.7)); g.strokeStyle = pal.lit; g.lineWidth = b1 * 2; g.stroke();
    poly(g, warp(loc, thc, 2.4, o.seed + 8.2)); g.strokeStyle = pal.wht; g.lineWidth = b0 * 2; g.stroke();
    // the petal is carved in low relief: its upper-left shoulder takes the light, the lower right falls away
    const R0 = Math.max(w, len) * 0.62;
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.linear(g, c0.x - 0.56 * R0, c0.y - 0.83 * R0, c0.x + 0.56 * R0, c0.y + 0.83 * R0,
      [[0, 'rgba(255,255,255,0.46)'], [0.42, 'rgba(255,255,255,0)'], [0.55, 'rgba(0,0,16,0)'], [1, 'rgba(0,0,16,0.5)']]);
    full(g);
    if (o.dim) { g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(1,2,14,${o.dim})`; full(g); }
    g.restore();
    poly(h, P); h.fillStyle = grey(o.hv); h.fill();
    m.save(); m.globalCompositeOperation = 'destination-out'; poly(m, P); m.fill(); m.restore();
    tube(P, o.gw, true, o.hv);
    knots(P, o.gw, o.hv, o.kn);
  };
  /** the gilt ruyi head inside a petal (如意云头): an ogee point toward the tip, two volutes curling in toward the ring, a pearl between */
  const ruyi = (thc, yTip, k, o, hv) => {
    const half = (sgn, q) => {
      const pts = []; let x = 0, y = 0, ph = L.deg(-73);
      const N1 = 24, ds = 106 * k * q.l / N1, d1 = L.deg(59) / N1;
      for (let i = 0; i < N1; i++) { pts.push([x, y]); ph += d1; x += Math.cos(ph) * ds; y += Math.sin(ph) * ds; }
      const N2 = 96, d2 = q.t * L.TAU / N2, R1 = 51 * k * q.r;
      for (let i = 0; i <= N2; i++) { const rad = L.lerp(R1, 5, Math.pow(i / N2, 0.8)); pts.push([x, y]); ph -= d2; x += Math.cos(ph) * rad * d2; y += Math.sin(ph) * rad * d2; }
      const cs = Math.cos(o.tilt), sn = Math.sin(o.tilt);
      return pts.map(([px, py]) => { const qx = sgn * px; return [o.dx + qx * cs - py * sn, yTip + qx * sn + py * cs]; });
    };
    const A = half(1, o.a), B = half(-1, o.b);
    const P = warp(B.reverse().concat(A.slice(1)), thc, 1.7, o.seed);
    tube(P, o.w, false, hv);
    const e0 = P[0], e1 = P[P.length - 1], tip = P[B.length - 1];
    knot(e0[0], e0[1], o.w * 0.78, hv); knot(e1[0], e1[1], o.w * 0.74, hv);
    knot(tip[0], tip[1], o.w * 0.6, hv, 0.6);
    const pr = warp([[o.dx + r.range(-3, 3), yTip - 64 * k + r.range(-4, 4)]], thc)[0];
    knot(pr[0], pr[1], 15.5 * k * r.range(0.92, 1.08), hv, 0.8);
  };

  // ── back row of petals (their tips show between the front ones) ──
  for (let j = -n; j <= n; j++) {
    const even = ((j % 2) + 2) % 2 === 0;
    petal(th0 + (j + 0.5) * dth + r.range(-6, 6) / Rref, (PITCH - 16) * r.range(0.96, 1.03), LEN_B * r.range(0.96, 1.04), r.range(-12, 12), even ? GREEN : BLUE,
      { seed: 40 + j * 1.7, tone: r.range(-0.07, 0.05), ww: r.range(7, 8.5), wl: r.range(15, 20), wm: r.range(24, 31), hv: HV_BACK, gw: GW - 2, kn: 3, shA: 0.8, shB: 42, dim: 0.12 });
  }
  // ── front row ──
  for (let i = -n; i <= n; i++) {
    const even = ((i % 2) + 2) % 2 === 0;
    const thc = th0 + i * dth + r.range(-7, 7) / Rref, w = (PITCH - 10) * r.range(0.955, 1.02), len = LEN_F * r.range(0.95, 1.045), k = w / PITCH;
    petal(thc, w, len, r.range(-10, 10), even ? BLUE : GREEN,
      { seed: i * 2.3, tone: r.range(-0.06, 0.06), ww: r.range(7.5, 9.5), wl: r.range(16, 21), wm: r.range(25, 33), hv: HV_FRONT, gw: GW * r.range(0.94, 1.06), kn: 4, shA: 0.92, shB: 52, dim: 0 });
    const q = () => ({ l: r.range(0.94, 1.06), r: r.range(0.93, 1.07), t: r.range(1.3, 1.46) });
    ruyi(thc, len * r.range(0.775, 0.8), k, { a: q(), b: q(), dx: r.range(-5, 5), tilt: r.range(-0.05, 0.05), w: 14 * r.range(0.93, 1.07), seed: i * 3.7 + 11 }, HV_FRONT);
  }

  // ── the mouth-ring: gold-leaf ground; the moulding itself is modelled in the shader ──
  g.fillStyle = gold; a.pathBand(g, 3, -RIM_B, -T, T); g.fill();
  m.fillStyle = '#fff'; a.pathBand(m, 3, -RIM_B, -T, T); m.fill();
  leaf(-3, RIM_B, 104, 168, 0.4);
  // the ring overhangs the petals: a band of shadow under it
  g.save(); g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - RIM_B - 84, a.R - RIM_B, [[0, '#ffffff'], [0.4, '#aeb1c6'], [0.8, '#3e4058'], [1, '#0c0c14']]);
  a.pathBand(g, -RIM_B, -RIM_B - 84, -T, T); g.fill();
  g.restore();

  // ── surface: hand-ground mineral pigment is granular and never even; the gesso has crazed; a little is lost ──
  g.save(); a.clipBelow(g, 3);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.34;
  g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's06mottle', scale: 44, sx: 1.2, sy: 2.0, octaves: 4, contrast: 1.7, res: 0.4 }), -PAD, -PAD);
  g.globalAlpha = 0.3;                                                // bristle marks, dragged along the petals
  g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's06brush', scale: 5.5, sx: 1, sy: 11, octaves: 2, contrast: 1.7, res: 0.5 }), -PAD, -PAD);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.17;
  g.drawImage(L.noiseLayer(PAD, { seed: 's06hue', scale: 320, octaves: 2, warp: 0.6, res: 0.2, contrast: 1.6, ramp: [[0, '#5a34c8'], [0.5, '#808080'], [1, '#10b8a0']] }), -PAD, -PAD);
  const crack = crackle(env, 's06crack', 128, 1.5);
  const cg = crack.getContext('2d'); cg.globalCompositeOperation = 'destination-out'; cg.globalAlpha = 0.75; cg.drawImage(gm, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.5; g.drawImage(crack, -PAD, -PAD);
  h.save(); h.globalAlpha = 0.5; h.drawImage(crack, -PAD, -PAD); h.restore();
  // losses: a few thumbnail-sized flakes where the paint has let go and the grey-ochre gesso shows (never on the
  // gilding — leaf outlasts paint)
  const flake = L.noiseLayer(PAD, { seed: 's06flake2', scale: 210, octaves: 3, gain: 0.42, warp: 1.1, warpScale: 1.4, res: 0.5, contrast: 1.5,
    ramp: [[0, 'rgba(150,138,112,0)'], [0.868, 'rgba(150,138,112,0)'], [0.876, 'rgba(158,146,120,0.94)'], [1, 'rgba(170,158,130,0.96)']] });
  const fg = flake.getContext('2d'); fg.globalCompositeOperation = 'destination-out'; fg.drawImage(gm, 0, 0);
  g.globalAlpha = 0.85; g.filter = 'brightness(0.16)'; g.drawImage(flake, -PAD - 2.2, -PAD - 3); g.filter = 'none';
  g.globalAlpha = 0.92; g.drawImage(flake, -PAD, -PAD);
  h.save(); h.globalAlpha = 0.4; h.filter = 'brightness(0)'; h.drawImage(flake, -PAD, -PAD); h.restore();
  // worn gilding: the red bole under the leaf shows on the rubbed crowns
  const wear = L.noiseLayer(PAD, { seed: 's06bole', scale: 40, octaves: 3, warp: 0.5, res: 0.4, contrast: 1.6,
    ramp: [[0, 'rgba(120,40,16,0)'], [0.86, 'rgba(120,40,16,0)'], [0.905, 'rgba(132,44,18,0.85)'], [1, 'rgba(110,36,14,0.9)']] });
  const wg = wear.getContext('2d'); wg.globalCompositeOperation = 'destination-in'; wg.drawImage(gm, 0, 0);
  g.globalAlpha = 0.8; g.drawImage(wear, -PAD, -PAD);
  g.restore();
  return { alb, hl, gm, dth, th0 };
}

/** per-pixel lighting → { lit, bloom, y0, hh, glints } (canvases cropped to rows y0… of the padded layer) */
function shade(env, { alb, hl, gm }) {
  const a = env.arc;
  const y0 = Math.max(0, Math.floor(PAD + a.crestY - 70)), hh = LH - y0, n = LW * hh;
  const read = (c) => c.getContext('2d').getImageData(0, y0, LW, hh).data;
  const A = read(alb), Hd = read(L.blurred(hl, 1.3)), Gd = read(gm), B = read(L.blurred(alb, 16));
  const Nd = L.noiseTex(LW, hh, { seed: 's06micro', scale: 5, octaves: 2, res: 0.5, contrast: 1.5 }).getContext('2d').getImageData(0, 0, LW, hh).data;
  const Hf = new Float32Array(n), Hc = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = Hd[i * 4]; Hf[i] = v; Hc[i] = v + (Nd[i * 4] - 128) * 0.085; }
  // gold: dark umber where it mirrors the dark room, orange through the turn, pale yellow where it faces the lamp
  const ramp = L.makeRamp([[0, '#1a0a02'], [0.16, '#55290a'], [0.36, '#a2640f'], [0.54, '#d99c28'], [0.7, '#f1c24c'], [0.86, '#ffe491'], [1, '#fff8dc']]);
  const lut = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) { const c = ramp(i / 255); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const nzr = L.makeNoise('s06rim');
  const img = new ImageData(LW, hh), o = img.data;
  const blm = new ImageData(LW, hh), q = blm.data;
  for (let i = 3; i < q.length; i += 4) q[i] = 255;
  const INV = 1 / LEVELS, SK = 10.4;
  const tap = (s) => Math.round(LY / 0.734 * s) * LW + Math.round(LX / 0.734 * s);   // toward the light
  const O1 = tap(3), O2 = tap(6), O3 = tap(9.5), O4 = tap(13);
  const hot = a.pt(-0.11, -46);
  const cand = [];
  for (let y = 1; y < hh - 1; y++) {
    const fy = y + y0 - PAD, dy = fy - a.cy;
    for (let x = 1; x < LW - 1; x++) {
      const fx = x - PAD, dx = fx - a.cx;
      const rr = Math.sqrt(dx * dx + dy * dy), d = a.R - rr;
      if (d <= -0.5) continue;
      const i = y * LW + x, i4 = i * 4;
      const ex = dx / rr, ey = dy / rr;
      let nx, ny, nz, gk, occ = 1, dim = 1;
      if (d < RIM_B) {
        // the mouth-ring moulding, modelled analytically so its highlight is perfectly smooth, then roughened by hand
        const s = Math.atan2(dx, -dy) * a.R;
        let u;
        if (d < RIM_A) { u = -0.86 + 1.81 * d / RIM_A + 0.06 * nzr.n2(s / 190, 0.4) + 0.028 * nzr.n2(s / 44, d / 34); dim = 1 - 0.75 * L.smooth((d - RIM_A + 5) / 5); }
        else if (d < RIM_G) { u = 0.2; dim = 0.2; }
        else { const hb = (RIM_B - RIM_G) / 2; u = (d - RIM_G - hb) / hb * 0.94 + 0.08 * nzr.n2(s / 60, 3.1); dim = 0.25 + 0.75 * L.smooth((d - RIM_G) / 3.5); dim *= 1 - 0.6 * L.smooth((d - RIM_B + 3.5) / 3.5); }
        if (u > 0.985) u = 0.985; else if (u < -0.985) u = -0.985;
        const c = Math.sqrt(1 - u * u);
        nx = -u * ex - (Nd[i4 + 4] - Nd[i4 - 4]) * 0.001; ny = -u * ey - (Nd[i4 + LW * 4] - Nd[i4 - LW * 4]) * 0.001; nz = c;
        const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= il; ny *= il; nz *= il;
        gk = 1;
      } else {
        const gx = (Hc[i + 1] - Hc[i - 1]) * 0.5 * INV, gy = (Hc[i + LW] - Hc[i - LW]) * 0.5 * INV;
        const il = 1 / Math.sqrt(gx * gx + gy * gy + 1); nx = -gx * il; ny = -gy * il; nz = il;
        gk = Gd[i4 + 3] / 255;
        const h0 = Hf[i]; let sh = 0;
        if (Hf[i + O1] - h0 > 3 * SK) sh += 0.3;
        if (Hf[i + O2] - h0 > 6 * SK) sh += 0.3;
        if (Hf[i + O3] - h0 > 9.5 * SK) sh += 0.25;
        if (Hf[i + O4] - h0 > 13 * SK) sh += 0.15;
        occ = 1 - 0.66 * sh;
      }
      const ndl = nx * LX + ny * LY + nz * LZ;
      // where the lamp reaches: a pool around the hot spot, dying away along the ring and down into the well
      const sx = fx - hot.x, sy = fy - hot.y;
      let key = 0.4 + 1.0 / (1 + (sx * sx + 3.6 * sy * sy) / 800000);
      key *= 1 - 0.5 * L.smooth((d - 330) / 280);
      let cr, cg, cb;
      if (gk < 1) {
        let f = 1 + 1.35 * (ndl - LZ); f = (f < 0.3 ? 0.3 : f > 1.9 ? 1.9 : f) * occ * key;
        let pr = A[i4] * f, pg = A[i4 + 1] * f, pb = A[i4 + 2] * f;
        const lum = pr * 0.3 + pg * 0.59 + pb * 0.11;               // mineral pigment: keep it saturated
        pr = lum + (pr - lum) * 1.18; pg = lum + (pg - lum) * 1.18; pb = lum + (pb - lum) * 1.18;
        cr = pr + 2; cg = pg + 3; cb = pb + 7;
      }
      if (gk > 0) {
        const rz = 2 * nz * nz - 1;
        let e = 2 * nz * (nx * LX + ny * LY) + rz * LZ; if (e < 0) e = 0;
        let t = 0.07 + 0.5 * (ndl > 0 ? ndl : 0) + 0.56 * e * e;
        t *= (0.4 + 0.6 * occ) * dim;
        const kg = Math.pow(key, 0.62);
        t *= kg;
        let ndh = nx * HX + ny * HY + nz * HZ; if (ndh < 0) ndh = 0;
        let sp = Math.pow(ndh, 46) * occ * dim * kg;
        // the tone of the leaf itself (seams, soot, the shadow a petal throws on it) comes from the painted layer; where the leaf is rubbed through, red bole
        const ar = A[i4], ag = A[i4 + 1];
        let tone = (ar * 0.3 + ag * 0.59 + A[i4 + 2] * 0.11) / 162.5; tone = tone < 0.3 ? 0.3 : tone > 1.1 ? 1.1 : tone;
        if (d >= RIM_B) { t *= 0.3 + 0.7 * tone; sp *= tone; }
        const li = (t > 1 ? 255 : (t * 255) | 0) * 3;
        if (tone < 0.74) tone = 0.74;
        let wr = lut[li] * tone, wg = lut[li + 1] * tone, wb = lut[li + 2] * tone;
        let bole = (0.6 - ag / (ar + 1)) * 4; if (bole > 0) { if (bole > 1) bole = 1; const bl = (0.35 + 0.75 * (ndl > 0 ? ndl : 0)) * occ * kg; wr += (150 * bl - wr) * bole; wg += (46 * bl - wg) * bole; wb += (20 * bl - wb) * bole; sp *= 1 - bole; }
        // the flank turned away from the lamp mirrors the paint beside it
        let bw = (0.45 - rz) * 1.1; if (bw < 0) bw = 0; else if (bw > 1) bw = 1; bw *= 1 - (t > 1 ? 1 : t);
        let bi = i4;
        if (d < RIM_B) { const k = RIM_B + 46 - d; const bx = Math.round(x - ex * k), by = Math.round(y - ey * k); if (by < hh && bx > 0 && bx < LW) bi = (by * LW + bx) * 4; bw *= ey * ny + ex * nx < 0 ? 1 : 0.15; }
        wr += B[bi] * bw * 0.75 * key; wg += B[bi + 1] * bw * 0.75 * key; wb += B[bi + 2] * bw * 0.75 * key;
        wr += 255 * sp; wg += 244 * sp; wb += 206 * sp;
        if (gk >= 1) { cr = wr; cg = wg; cb = wb; } else { cr += (wr - cr) * gk; cg += (wg - cg) * gk; cb += (wb - cb) * gk; }
        if (sp > 0.45 && gk > 0.9 && (x * 7 + y * 13) % 23 === 0) cand.push([fx, fy, d, sp]);
      }
      o[i4] = cr; o[i4 + 1] = cg; o[i4 + 2] = cb; o[i4 + 3] = d < 0.5 ? (d + 0.5) * 255 : 255;
      const mx = cr > cg ? cr : cg;
      if (mx > 182) { let k = (mx - 182) / 70; if (k > 1) k = 1; k *= k; q[i4] = cr * k; q[i4 + 1] = cg * k; q[i4 + 2] = cb * k; }
    }
  }
  const lit = L.makeCanvas(LW, hh); lit.getContext('2d').putImageData(img, 0, 0);
  const hi = L.makeCanvas(LW, hh); hi.getContext('2d').putImageData(blm, 0, 0);
  // bloom at half size: a tight core and a wide veil
  const bloom = L.makeCanvas(LW / 2, hh / 2), bg = bloom.getContext('2d');
  bg.fillStyle = '#000'; bg.fillRect(0, 0, bloom.width, bloom.height);
  bg.globalCompositeOperation = 'lighter';
  bg.filter = 'blur(4px)'; bg.globalAlpha = 0.85; bg.drawImage(hi, 0, 0, bloom.width, bloom.height);
  bg.filter = 'blur(15px)'; bg.globalAlpha = 0.7; bg.drawImage(hi, 0, 0, bloom.width, bloom.height);
  bg.filter = 'none';
  return { lit, bloom, y0, hh, cand };
}

// shallow depth of field: sharp around the crest, softening along the ring and down into the well
const FOCUS = { th: -0.04, d: 130, k: 0.5, a0: 400, a1: 880, b0: 620, b1: 1040 };
function depthOfField(env, lit, y0) {
  const a = env.arc, w = lit.width, hh = lit.height;
  const F = a.pt(FOCUS.th, -FOCUS.d), fx = F.x + PAD, fy = F.y + PAD - y0;
  const mask = (r0, r1) => {
    const c = L.makeCanvas(w, hh), g = c.getContext('2d');
    g.translate(fx, fy); g.scale(1, FOCUS.k);
    g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(-w * 2, -hh * 4, w * 4, hh * 8);
    return c;
  };
  const out = L.makeCanvas(w, hh), og = out.getContext('2d');
  og.drawImage(lit, 0, 0);
  for (const [px, r0, r1] of [[3, FOCUS.a0, FOCUS.a1], [9.5, FOCUS.b0, FOCUS.b1]]) {
    const mk = mask(r0, r1), bl = L.blurred(lit, px), bg = bl.getContext('2d');
    bg.globalCompositeOperation = 'destination-in'; bg.drawImage(mk, 0, 0);
    og.globalCompositeOperation = 'destination-out'; og.drawImage(mk, 0, 0);
    og.globalCompositeOperation = 'lighter'; og.drawImage(bl, 0, 0);
  }
  return out;
}

/** glint sprites: a tight star-less bloom for in-focus leaf, a soft disc for out-of-focus leaf */
function sprites() {
  const mk = (stops) => { const c = L.makeCanvas(96, 96), g = c.getContext('2d'); g.fillStyle = L.radial(g, 48, 48, 0, 48, stops); g.fillRect(0, 0, 96, 96); return c; };
  return {
    sharp: mk([[0, 'rgba(255,253,240,1)'], [0.1, 'rgba(255,244,196,0.95)'], [0.3, 'rgba(255,214,120,0.32)'], [0.62, 'rgba(255,190,80,0.08)'], [1, 'rgba(255,180,60,0)']]),
    soft: mk([[0, 'rgba(255,236,170,0.6)'], [0.62, 'rgba(255,226,150,0.5)'], [0.8, 'rgba(255,220,140,0.3)'], [1, 'rgba(255,210,120,0)']]),
  };
}

export default {
  name: '藻井',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const P = paint(env);
    const sh = shade(env, P);
    const lit = depthOfField(env, sh.lit, sh.y0);
    // pick the glints from where the shader actually found specular gold
    const r = L.rng('s06-glint'), F = a.pt(FOCUS.th, -FOCUS.d), glints = [];
    const pool = sh.cand;
    for (let k = 0; k < 900 && glints.length < 70 && pool.length; k++) {
      const c = pool[Math.floor(r() * pool.length)];
      if (glints.some((q) => Math.hypot(q.x - c[0], q.y - c[1]) < 46)) continue;
      const blur = L.clamp((Math.hypot(c[0] - F.x, (c[1] - F.y) / FOCUS.k) - FOCUS.b0) / (FOCUS.b1 - FOCUS.b0));
      glints.push({ x: c[0], y: c[1], blur, s: r.range(13, 30), ph: r.range(0, L.TAU), sp: r.range(1.0, 2.0), a: c[2] < RIM_B ? 1 : 0.85 });
    }
    S = { lit, bloom: sh.bloom, y0: sh.y0, hh: sh.hh, glints, spr: sprites() };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.004, 0.004, p), zoom = L.lerp(1.0, 1.014, p);
    const f = p * (env.frames - 1);
    ctx.fillStyle = '#040405'; ctx.fillRect(0, 0, W, H);
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.lit, -PAD, S.y0 - PAD);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.85;
      ctx.drawImage(S.bloom, -PAD, S.y0 - PAD, LW, S.hh);
    });
    // the lamp drifts: a warm pool sliding over the petals, and a shaped hot streak riding the gilt ring
    const th = L.lerp(-0.17, -0.05, p);
    ctx.save(); a.clipBelow(ctx, 1.5);
    const sh = a.pt(th + 0.02, -170);
    L.glow(ctx, sh.x, sh.y, 500, '#ffe9bc', 0.17);
    ctx.restore();
    ctx.save(); a.clipBand(ctx, -1.5, -RIM_A + 7);
    const hs = a.pt(th, -17);
    L.glow(ctx, hs.x, hs.y, 320, '#ffdf9c', 0.42);
    L.glow(ctx, hs.x, hs.y, 130, '#fff6d6', 0.85);
    ctx.restore();
    L.glow(ctx, hs.x, hs.y - 4, 150, '#ffd98a', 0.1);          // a breath of halation over the edge
    // gold leaf catching the light: glints that flare and die from frame to frame
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (const q of S.glints) {
        const k = Math.pow(Math.max(0, Math.sin(q.ph + f * q.sp)), 2.2) * q.a;
        if (k < 0.05) continue;
        if (q.blur > 0.35) {
          const s = q.s * (0.7 + 0.9 * q.blur);
          ctx.globalAlpha = Math.min(1, k) * 0.5;
          ctx.drawImage(S.spr.soft, q.x - s, q.y - s, s * 2, s * 2);
        } else {
          const s = q.s * (0.6 + 0.7 * k);
          ctx.globalAlpha = Math.min(1, k);
          ctx.drawImage(S.spr.sharp, q.x - s, q.y - s, s * 2, s * 2);
        }
      }
    });
    L.vignette(ctx, { strength: 0.3, inner: 0.52 });
  },
};
