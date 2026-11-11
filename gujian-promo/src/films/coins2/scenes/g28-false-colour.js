// g28 — 伪彩扫描: a composition area-scan of a cash coin as it comes up on the instrument screen. Deep blue-black ground;
// the coin glyph is ONE scalar field pushed through a colour scale (the way real false-colour maps are made):
// hot magenta rim (outer edge and round the square hole) → purple → orange → yellow → green in the thick of the body,
// thin dark isolines between the tints, corrosion islands and lead-rich specks with their own colour rings,
// a hill-shade from the top-left so the bands sit like terraces, and a violet glow off every edge. No figures or letters.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
let layer = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// scalar → colour. 0 … 0.3 lives outside the coin (the glow on the dark screen); the rim is the magenta peak with a pale core
const SMAX = 1.16, NL = 2048;
const LUT_STOPS = [
  [0.000, '#04070f'], [0.030, '#060b1c'], [0.070, '#0c1036'], [0.120, '#22126c'], [0.180, '#5417b6'], [0.245, '#9c1fdc'], [0.300, '#dc28da'],
  [0.335, '#ff2bd6'], [0.354, '#ff4ede'], [0.372, '#ffb2f4'], [0.390, '#ff56e0'], [0.406, '#ff34d8'], [0.428, '#ee2bd6'],
  [0.470, '#9019d0'], [0.535, '#5413c2'], [0.580, '#7016bc'], [0.612, '#d81f86'], [0.636, '#ff3a5e'],
  [0.675, '#ff8a1f'], [0.720, '#ff9a22'], [0.762, '#ffa626'], [0.782, '#ffd638'], [0.815, '#ffdf3c'], [0.870, '#f8e938'],
  [0.886, '#f2e934'], [0.904, '#b6e826'], [0.945, '#9be81e'], [0.985, '#6fdd24'], [1.030, '#3fd24a'], [1.090, '#22dcae'], [1.160, '#3cf0e6'],
];
// depth inside the body (px from the nearest edge) → scalar: plateaus (the tints) joined by short ramps (their borders)
const PROFILE = [
  [0, 0.338], [3, 0.352], [7, 0.372], [11, 0.388], [16, 0.404], [21, 0.428],          // the rim (郭): hot magenta, pale core
  [27, 0.5], [35, 0.535], [42, 0.566],                                              // a narrow purple ring
  [47, 0.634], [52, 0.684], [64, 0.704], [76, 0.726],                               // red-pink contour, then orange
  [82, 0.802], [94, 0.83], [104, 0.858],                                            // bright yellow
  [111, 0.93], [126, 0.962], [146, 0.995], [200, 1.06],                             // green (cyan-green only in hot spots)
];
// isolines: [level, strength] — the first four sit on the borders between tints, the rest wander inside a tint
const CONTOURS = [[0.455, 0.5], [0.598, 0.46], [0.772, 0.5], [0.895, 0.5], [0.704, 0.2], [0.834, 0.2], [0.962, 0.22], [1.03, 0.2]];

function profile(d) {
  if (d <= PROFILE[0][0]) return PROFILE[0][1];
  for (let i = 1; i < PROFILE.length; i++) if (d <= PROFILE[i][0]) {
    const a = PROFILE[i - 1], b = PROFILE[i]; return a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]);
  }
  return PROFILE[PROFILE.length - 1][1];
}

function build() {
  const G = K.GLYPH, N = S * S;
  const nA = L.makeNoise('g28a'), nB = L.makeNoise('g28b');
  const ramp = L.makeRamp(LUT_STOPS.map(([t, c]) => [t / SMAX, c]));
  const LR = new Uint8Array(NL), LG = new Uint8Array(NL), LB = new Uint8Array(NL);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); LR[i] = c[0]; LG[i] = c[1]; LB[i] = c[2]; }
  const PN = 1601, Ptab = new Float32Array(PN);                       // depth 0 … 200 in 1/8 px
  for (let i = 0; i < PN; i++) Ptab[i] = profile(i / 8);

  const SD = new Float32Array(N), SC = new Float32Array(N), BL = new Float32Array(N);

  // ── corrosion islands and segregation specks: bumps of higher / lower signal with a ragged outline ──
  const rb = L.rng('g28blobs');
  const blobs = [];
  const pts = K.scatter({ seed: 'g28isl', spacing: 92, margin: 44, max: 16 });
  pts.forEach((p) => blobs.push([p.x, p.y, rb.range(30, 62), rb.range(18, 34), rb() * Math.PI, rb.range(0.08, 0.15) * (rb.chance(0.55) ? 1 : -1)]));
  const sp = K.scatter({ seed: 'g28spk', spacing: 46, margin: 30, max: 46 });
  sp.forEach((p) => blobs.push([p.x, p.y, rb.range(7, 15), rb.range(5, 10), rb() * Math.PI, rb.range(0.1, 0.2) * (rb.chance(0.72) ? 1 : -1)]));
  for (const [bx, by, ru, rv, rot, amp] of blobs) {
    const e = Math.max(ru, rv) * 1.5 + 2, cs = Math.cos(rot), sn = Math.sin(rot);
    const i0 = Math.max(0, Math.floor(bx - e)), i1 = Math.min(S - 1, Math.ceil(bx + e));
    const j0 = Math.max(0, Math.floor(by - e)), j1 = Math.min(S - 1, Math.ceil(by + e));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - bx, dy = j + 0.5 - by, du = dx * cs + dy * sn, dv = -dx * sn + dy * cs;
      const wob = 1 + (ru < 20 ? 0.1 : 0.28) * nA.n2(du / (ru * 0.55) + bx, dv / (rv * 0.7) + by);
      const q2 = ((du * du) / (ru * ru) + (dv * dv) / (rv * rv)) * wob * wob;
      if (q2 < 1) BL[j * S + i] += amp * (1 - q2) * (1 - q2);
    }
  }

  // ── the scalar field ──
  for (let j = 0; j < S; j++) {
    const y = j + 0.5;
    for (let i = 0; i < S; i++) {
      const k = j * S + i, x = i + 0.5;
      const sd = K.sdGlyph(x, y); SD[k] = sd;
      if (sd < 0.5) {                                                   // inside the body
        const d = -sd, g = sstep(12, 64, d);
        const wv = g * (17 * nA.n2(x / 150, y / 150) + 8 * nA.n2(x / 58 + 9, y / 58 + 4) + 3 * nB.n2(x / 21, y / 21));
        // richer toward the upper-left (where the light also comes from), leaner lower-right
        const lean = g * 9 * ((G.cx - x) + (G.cy - y)) / (2 * G.R);
        // the rim is worn unevenly: its width (and so its pale core) swells and thins along the edge
        const rimW = 1 + 0.24 * nB.n2(x / 52 + 11, y / 52 - 3) * (1 - sstep(20, 46, d));
        const de = L.clamp(d * 1.17 * rimW + wv + lean, 0, 199.8);
        const pi = de * 8, p0 = pi | 0;
        let s = Ptab[p0] + (Ptab[p0 + 1] - Ptab[p0]) * (pi - p0);
        s += sstep(16, 50, d) * (0.022 * nB.fbm(x / 84 + 5, y / 84, 3) + BL[k] * sstep(20, 40, d));
        SC[k] = s;
      } else {                                                          // the dark screen: the coin's glow falling off
        const m = 0.9 + 0.22 * nB.n2(x / 170, y / 170 + 3);
        // + the screen's own faint background signal: slow clouds of blue, never brighter than the glow
        const cloud = 0.024 + 0.02 * nA.fbm(x / 210 + 7, y / 210, 4) + 0.006 * nB.n2(x / 34, y / 34 + 2);
        SC[k] = (0.205 * Math.exp(-sd / 20) + 0.075 * Math.exp(-sd / 74)) * m + Math.max(0.004, cloud);
      }
    }
  }

  // stray scatter counts on the dark screen: a few dozen small soft specks of signal (violet-blue), none touching the coin
  const rs = L.rng('g28specks');
  for (let n = 0, placed = 0; n < 600 && placed < 64; n++) {
    const bx = rs.range(40, S - 40), by = rs.range(40, S - 40), sd0 = K.sdGlyph(bx, by);
    if (sd0 < 16) continue;
    placed++;
    const rad = rs.range(1.6, 4.6) * (rs.chance(0.12) ? 1.8 : 1), amp = rs.range(0.05, 0.15), st = rs.range(0.6, 1.5), rot = rs() * Math.PI;
    const cs = Math.cos(rot), sn = Math.sin(rot), e = Math.ceil(rad * 1.6 + 1);
    for (let j = Math.max(0, (by - e) | 0); j <= Math.min(S - 1, (by + e) | 0); j++) for (let i = Math.max(0, (bx - e) | 0); i <= Math.min(S - 1, (bx + e) | 0); i++) {
      const dx = i + 0.5 - bx, dy = j + 0.5 - by, du = (dx * cs + dy * sn) / (rad * st), dv = (-dx * sn + dy * cs) / rad;
      const q2 = du * du + dv * dv;
      if (q2 < 1) SC[j * S + i] += amp * (1 - q2) * (1 - q2);
    }
  }

  // ── colour: LUT + hill-shade + isolines; the edge is anti-aliased by coverage ──
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), px = img.data;
  const rn = L.rng('g28noise');
  const NT = new Float32Array(8192);
  for (let i = 0; i < 8192; i++) NT[i] = (rn() + rn() + rn() + rn() - 2) * 1.73;
  const NC = CONTOURS.length;
  for (let j = 0; j < S; j++) {
    const jm = j > 0 ? j - 1 : j, jp = j < S - 1 ? j + 1 : j;
    const rowGain = 0.0022 * NT[(j >> 1) * 37 & 8191];                   // line-to-line gain wobble of the raster
    for (let i = 0; i < S; i++) {
      const k = j * S + i, sd = SD[k];
      const im = i > 0 ? i - 1 : i, ip = i < S - 1 ? i + 1 : i;
      let s = SC[k];
      const inside = sd < 0.5;
      let lum = 1, iso = 0;
      if (inside && sd < -1.5) {
        const gx = (SC[j * S + ip] - SC[j * S + im]) * 0.5, gy = (SC[jp * S + i] - SC[jm * S + i]) * 0.5;
        // terraces lit from the top-left: slopes that climb toward the lower-right face the light
        lum = 1 + L.clamp((gx + gy) * 9.5, -0.26, 0.2);
        const gm = Math.max(0.0012, Math.hypot(gx, gy));
        for (let q = 0; q < NC; q++) {
          const dl = Math.abs(s - CONTOURS[q][0]) / gm;
          if (dl < 1.5) { const a = CONTOURS[q][1] * (1 - sstep(0.45, 1.5, dl)) * sstep(0.0012, 0.004, gm); if (a > iso) iso = a; }
        }
        s += (0.0034 * NT[(Math.imul(k, 40503) + 977) & 8191] + rowGain) * sstep(18, 40, -sd);   // counting noise (the rim is the cleanest)
      }
      let li = (s / SMAX * (NL - 1)) | 0; li = li < 0 ? 0 : li > NL - 1 ? NL - 1 : li;
      let r = LR[li], gg = LG[li], b = LB[li];
      if (inside) {
        const f = lum * (1 - iso * 0.62);
        r *= f; gg *= f; b *= f;
        if (lum > 1) { const w = (lum - 1) * 150; r += w; gg += w; b += w; }
        const cov = L.clamp(0.5 - sd);                                   // sd in (−0.5, 0.5): blend with the glow just outside
        if (cov < 1) {
          const so = 0.28 * 0.9 + 0.012; let lo = (so / SMAX * (NL - 1)) | 0;
          r = r * cov + LR[lo] * (1 - cov); gg = gg * cov + LG[lo] * (1 - cov); b = b * cov + LB[lo] * (1 - cov);
        }
      }
      const o = k * 4;
      px[o] = r > 255 ? 255 : r; px[o + 1] = gg > 255 ? 255 : gg; px[o + 2] = b > 255 ? 255 : b; px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // ── the screen around the map: a faint measuring grid, edge ticks, corner brackets, an unlabelled colour scale ──
  const out = L.makeCanvas(S, S), o = out.getContext('2d');
  o.drawImage(c, 0, 0);
  o.save();
  K.glyphPath(o, { grow: 3, corner: 0 }); o.rect(0, 0, S, S); o.clip('evenodd');       // only on the dark screen (and in the hole)
  o.globalCompositeOperation = 'screen';
  for (let q = 0; q <= 18; q++) {
    const p = q * 60 + 0.5, major = q % 3 === 0;
    o.strokeStyle = major ? 'rgba(96,128,255,0.17)' : 'rgba(84,110,230,0.085)'; o.lineWidth = major ? 1.3 : 1;
    o.beginPath(); o.moveTo(p, 0); o.lineTo(p, S); o.moveTo(0, p); o.lineTo(S, p); o.stroke();
  }
  // fine ticks along the left and bottom of the scan field
  o.strokeStyle = 'rgba(140,170,255,0.5)'; o.lineWidth = 1.4;
  for (let q = 0; q <= 72; q++) {
    const p = 90 + q * 12.5, len = q % 8 === 0 ? 14 : q % 4 === 0 ? 9 : 5;
    o.beginPath(); o.moveTo(78 - len, p); o.lineTo(78, p); o.moveTo(p, 1002); o.lineTo(p, 1002 + len); o.stroke();
  }
  o.lineWidth = 1.6; o.strokeStyle = 'rgba(150,180,255,0.42)';
  o.beginPath(); o.moveTo(78, 90); o.lineTo(78, 1002); o.lineTo(990, 1002); o.stroke();
  // corner brackets of the scanned field
  o.strokeStyle = 'rgba(170,196,255,0.6)'; o.lineWidth = 2;
  for (const [bx, by, ux, uy] of [[112, 112, 1, 1], [968, 112, -1, 1], [968, 968, -1, -1], [112, 968, 1, -1]]) {
    o.beginPath(); o.moveTo(bx + ux * 30, by); o.lineTo(bx, by); o.lineTo(bx, by + uy * 30); o.stroke();
    o.beginPath(); o.moveTo(bx + ux * 8, by + uy * 8); o.lineTo(bx + ux * 14, by + uy * 14); o.stroke();
  }
  // centre cross in the hole
  o.strokeStyle = 'rgba(170,196,255,0.5)'; o.lineWidth = 1.4;
  o.beginPath(); o.moveTo(G.cx - 16, G.cy + 0.5); o.lineTo(G.cx + 16, G.cy + 0.5); o.moveTo(G.cx + 0.5, G.cy - 16); o.lineTo(G.cx + 0.5, G.cy + 16); o.stroke();
  o.restore();
  // the colour scale: a slim vertical bar at the right, hot end up, ticked, no figures
  const bx = 986, by0 = 372, bh = 336, bw = 15;
  for (let q = 0; q < bh; q++) {
    const t = 1 - q / (bh - 1), s = 0.12 + t * (1.12 - 0.12);
    const li = Math.min(NL - 1, (s / SMAX * (NL - 1)) | 0);
    o.fillStyle = `rgb(${LR[li]},${LG[li]},${LB[li]})`; o.fillRect(bx, by0 + q, bw, 1.2);
  }
  o.fillStyle = L.linear(o, bx, 0, bx + bw, 0, [[0, 'rgba(255,255,255,0.20)'], [0.35, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,10,0.30)']]);
  o.fillRect(bx, by0, bw, bh);
  o.strokeStyle = 'rgba(170,196,255,0.55)'; o.lineWidth = 1.2; o.strokeRect(bx - 0.5, by0 - 0.5, bw + 1, bh + 1);
  for (let q = 0; q <= 16; q++) {
    const yy = by0 + (q / 16) * bh, len = q % 4 === 0 ? 10 : 5;
    o.beginPath(); o.moveTo(bx + bw + 3, yy); o.lineTo(bx + bw + 3 + len, yy); o.stroke();
  }

  // ── optical glow: the bright map blooms on the screen (wide + tight) ──
  const hot = L.makeCanvas(S, S), h = hot.getContext('2d');
  h.save(); K.clipGlyph(h, { corner: 0 }); h.drawImage(c, 0, 0); h.restore();
  o.save(); o.globalCompositeOperation = 'screen';
  o.globalAlpha = 0.34; o.drawImage(L.blurred(hot, 26), 0, 0);
  o.globalAlpha = 0.22; o.drawImage(L.blurred(hot, 7), 0, 0);
  o.restore();
  // a slightly brighter sheen on the upper-left of the body, falling away to the lower-right
  o.save(); K.clipGlyph(o, { corner: 0 });
  o.globalCompositeOperation = 'soft-light';
  o.fillStyle = L.linear(o, 240, 240, 840, 840, [[0, 'rgba(255,255,255,0.16)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,30,0.20)']]);
  o.fillRect(0, 0, S, S); o.restore();
  return out;
}

export default {
  name: '伪彩扫描',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },          // a 3-frame flash: perfectly still
};
