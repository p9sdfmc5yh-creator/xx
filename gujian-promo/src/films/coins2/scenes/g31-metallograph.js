// g31 — 金相: a photomicrograph of etched bronze, cut to the coin glyph. Pale lilac-white, out-of-focus field of view;
// inside the glyph the metal: blue-green polygonal grains (a Voronoi field computed per pixel, each grain gently domed and lit
// from the top-left), dark etched grain boundaries, annealing twins and slip lines inside the grains, a few fern-like dendrites
// sitting in darker emerald pockets, ink-black lead globules, etch pits and faint polishing scratches. A blue-black corrosion
// crust follows the outer edge and the square hole. No magnification, figures or letters anywhere.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
let layer = null;

const ss = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** a rounded finger from (x, y) along ang */
function lobe(q, x, y, ang, len, w) {
  const cx = Math.cos(ang), cy = Math.sin(ang), px = -cy, py = cx, h = w / 2;
  q.moveTo(x - px * h, y - py * h);
  q.bezierCurveTo(x - px * h * 1.25 + cx * len * 0.45, y - py * h * 1.25 + cy * len * 0.45, x - px * h * 0.7 + cx * len, y - py * h * 0.7 + cy * len, x + cx * len, y + cy * len);
  q.bezierCurveTo(x + px * h * 0.7 + cx * len, y + py * h * 0.7 + cy * len, x + px * h * 1.25 + cx * len * 0.45, y + py * h * 1.25 + cy * len * 0.45, x + px * h, y + py * h);
  q.closePath();
}

function background() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d'), r = L.rng('g31bg');
  g.fillStyle = '#e9e2f0'; g.fillRect(0, 0, S, S);
  const cols = ['#f8f4fb', '#d6cae8', '#f4e4ef', '#cdc4e6', '#fdfbfd', '#e2d3ea', '#dfe0f2'];
  for (let i = 0; i < 34; i++) {
    const x = r.range(-80, S + 80), y = r.range(-80, S + 80), rad = r.range(120, 380), col = r.pick(cols);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, r.range(0.3, 0.6))], [0.6, L.rgba(col, 0.16)], [1, L.rgba(col, 0)]]);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // light falls off toward the lower right of the field
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,255,255,0.22)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(120,96,160,0.16)']]);
  g.fillRect(0, 0, S, S);
  const b = L.blurred(c, 22), q = b.getContext('2d');
  // out-of-focus dust: soft discs with a slightly darker rim
  const dust = L.makeCanvas(S, S), d = dust.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = r.range(20, S - 20), y = r.range(20, S - 20), rad = r.range(16, 54);
    d.fillStyle = L.rgba('#ffffff', r.range(0.07, 0.16)); d.beginPath(); d.arc(x, y, rad, 0, L.TAU); d.fill();
    d.strokeStyle = L.rgba('#8f7fba', r.range(0.07, 0.15)); d.lineWidth = r.range(2.5, 5); d.beginPath(); d.arc(x, y, rad, 0, L.TAU); d.stroke();
  }
  q.drawImage(L.blurred(dust, 5), 0, 0);
  return b;
}

function build() {
  const G = K.GLYPH;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(background(), 0, 0);

  // ── dendrites: where they sit, and their lobes ──
  const rd = L.rng('g31den');
  const sites = K.scatter({ seed: 'g31site', spacing: 215, margin: 64, max: 7 });
  const dens = sites.map((s) => {
    const a0 = rd.range(0, L.TAU), T = rd.range(150, 205), lobes = [];
    const bx = s.x - Math.cos(a0) * T * 0.5, by = s.y - Math.sin(a0) * T * 0.5;
    lobes.push({ x: bx, y: by, ang: a0, len: T, w: 13 });
    const slant = rd.range(1.25, 1.42);
    for (let d = 10; d < T - 14; d += rd.range(11.5, 14.5)) {
      const u = d / T, env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.75) * (1 - 0.4 * u);
      for (const sgn of [-1, 1]) {
        const len = (52 * env + 5) * rd.range(0.78, 1.12), ang = a0 + sgn * slant + rd.range(-0.07, 0.07);
        const x = bx + Math.cos(a0) * d, y = by + Math.sin(a0) * d;
        lobes.push({ x, y, ang, len, w: rd.range(7.5, 9.5) });
        if (len > 27) for (const f of [0.42, 0.7]) for (const s2 of [-1, 1]) {
          if (rd() < 0.25) continue;
          lobes.push({ x: x + Math.cos(ang) * len * f, y: y + Math.sin(ang) * len * f, ang: ang + s2 * 1.35, len: rd.range(6.5, 10.5) * (1.2 - f * 0.5), w: 5.2 });
        }
      }
    }
    return { x: s.x, y: s.y, a0, T, lobes };
  });

  // ── grain seeds on a jittered grid ──
  const CELL = 50, X0 = G.cx - G.R - 2 * CELL, gw = Math.ceil((2 * G.R + 4 * CELL) / CELL) + 1, NS = gw * gw;
  const sx = new Float32Array(NS), sy = new Float32Array(NS), alive = new Uint8Array(NS);
  const cr = new Float32Array(NS), cg = new Float32Array(NS), cb = new Float32Array(NS);
  const tca = new Float32Array(NS), tsa = new Float32Array(NS), tper = new Float32Array(NS), tdut = new Float32Array(NS), tamt = new Float32Array(NS), toff = new Float32Array(NS);
  const hamt = new Float32Array(NS), hper = new Float32Array(NS), dome = new Float32Array(NS);
  const rs = L.rng('g31seed');
  const ramp = L.makeRamp([[0, '#0d4a5a'], [0.22, '#167a7c'], [0.45, '#2fa692'], [0.68, '#6fcdae'], [0.86, '#a9e3c4'], [1, '#dcf3da']]);
  const blue = L.parseColor('#3a8fc0'), yel = L.parseColor('#c4dc8c');
  for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    sx[k] = X0 + (i + rs.range(0.08, 0.92)) * CELL; sy[k] = X0 + (j + rs.range(0.08, 0.92)) * CELL;
    alive[k] = rs() < 0.84 ? 1 : 0;
    let dk = 0;
    for (const d of dens) {
      const ux = (sx[k] - d.x) * Math.cos(d.a0) + (sy[k] - d.y) * Math.sin(d.a0), uy = -(sx[k] - d.x) * Math.sin(d.a0) + (sy[k] - d.y) * Math.cos(d.a0);
      dk = Math.max(dk, 1 - ss(0.72, 1.3, Math.hypot(ux / (d.T * 0.5), uy / 62)));
    }
    let t = L.clamp(0.5 + 0.27 * rs.gauss());
    t = t * (1 - 0.8 * dk) + 0.02;
    const col = ramp(t); let r0 = col[0], g0 = col[1], b0 = col[2];
    const tint = rs();
    if (tint < 0.3) { const m = rs.range(0.1, 0.34); r0 += (blue[0] - r0) * m; g0 += (blue[1] - g0) * m; b0 += (blue[2] - b0) * m; }
    else if (tint > 0.8) { const m = rs.range(0.1, 0.3) * (1 - dk); r0 += (yel[0] - r0) * m; g0 += (yel[1] - g0) * m; b0 += (yel[2] - b0) * m; }
    cr[k] = r0; cg[k] = g0; cb[k] = b0;
    const ta = rs.range(0, Math.PI); tca[k] = Math.cos(ta); tsa[k] = Math.sin(ta);
    const hasTw = rs() < 0.58;
    tper[k] = rs.range(15, 34); tdut[k] = rs.range(0.22, 0.5); toff[k] = rs.range(0, 40);
    tamt[k] = hasTw ? (rs() < 0.5 ? rs.range(-0.3, -0.15) : rs.range(0.14, 0.3)) : 0;
    hamt[k] = rs() < 0.32 ? rs.range(0.07, 0.15) : 0; hper[k] = rs.range(5.2, 7.5);
    dome[k] = rs.range(0.14, 0.26);
  }

  // ── the metal, per pixel ──
  const B0 = G.cx - G.R - 4, BW = 2 * G.R + 8;
  const img = new ImageData(BW, BW), px = img.data;
  const nA = L.makeNoise('g31a'), nB = L.makeNoise('g31b');
  for (let yy = 0; yy < BW; yy++) {
    const y = B0 + yy + 0.5;
    for (let xx = 0; xx < BW; xx++) {
      const x = B0 + xx + 0.5;
      const sd = K.sdGlyph(x, y);
      if (sd > 2.5) continue;
      const gi = Math.floor((x - X0) / CELL), gj = Math.floor((y - X0) / CELL);
      let d1 = 1e9, d2 = 1e9, i1 = -1, i2 = -1;
      for (let oj = -2; oj <= 2; oj++) {
        const jj = gj + oj; if (jj < 0 || jj >= gw) continue;
        for (let oi = -2; oi <= 2; oi++) {
          const ii = gi + oi; if (ii < 0 || ii >= gw) continue;
          const k = jj * gw + ii; if (!alive[k]) continue;
          const dx = sx[k] - x, dy = sy[k] - y, d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = k; } else if (d < d2) { d2 = d; i2 = k; }
        }
      }
      if (i1 < 0 || i2 < 0) continue;
      const ex = sx[i2] - sx[i1], ey = sy[i2] - sy[i1], el = Math.sqrt(ex * ex + ey * ey) || 1;
      const e = (d2 - d1) / (2 * el);                                  // px to the grain boundary
      let r = cr[i1], gg = cg[i1], b = cb[i1];
      const rx = x - sx[i1], ry = y - sy[i1];
      // annealing twins: straight parallel bands of a different tone, stopping at the grain's edge
      if (tamt[i1] !== 0) {
        const u = (rx * tca[i1] + ry * tsa[i1] + toff[i1]) / tper[i1], f = u - Math.floor(u), aa = 1.1 / tper[i1];
        const band = ss(0, aa, f) - ss(tdut[i1], tdut[i1] + aa, f);
        const m = 1 + tamt[i1] * band * ss(1.5, 4, e);
        r *= m; gg *= m; b *= m;
      }
      // slip lines: fine parallel traces across some grains
      if (hamt[i1] !== 0) {
        const v = 0.5 + 0.5 * Math.cos((rx * tsa[i1] - ry * tca[i1]) * (L.TAU / hper[i1]));
        const m = 1 - hamt[i1] * v * v * v * ss(2, 7, e);
        r *= m; gg *= m; b *= m;
      }
      // etch mottling + a little tooth
      const mot = 1 + 0.085 * nA.fbm(x / 34, y / 34, 3) + 0.022 * nB.n2(x / 2.6, y / 2.6);
      // each grain is slightly domed: its top-left shoulder catches the light, the lower-right one falls into shade
      const lit = -(ex + ey) / el * 0.7071, sh = 1 - ss(1.2, 11, e);
      const m2 = mot * (1 + dome[i1] * lit * sh) * (1.07 - 0.14 * ((x - 180) + (y - 180)) / 1440);
      r *= m2; gg *= m2; b *= m2;
      // etched boundary
      const bw = 1.25 + 0.55 * nA.n2(x / 70, y / 70 + 31);
      const ba = (1 - ss(bw - 0.85, bw + 0.85, e)) * 0.92;
      r += (10 - r) * ba; gg += (46 - gg) * ba; b += (62 - b) * ba;
      // corrosion crust along every edge of the section, emerald just inside it
      const dep = -sd, T = 6.5 + 4.2 * nA.n2(x / 44 + 9, y / 44) + 1.6 * nB.n2(x / 13, y / 13);
      const em = 0.55 * (1 - ss(T, T + 20, dep));
      r += (14 - r) * em; gg += (104 - gg) * em; b += (98 - b) * em;
      const ca = (1 - ss(T - 2.2, T + 2.8, dep)) * 0.95;
      r += (24 - r) * ca; gg += (30 - gg) * ca; b += (70 - b) * ca;
      const o = (yy * BW + xx) * 4;
      px[o] = r < 0 ? 0 : r > 255 ? 255 : r; px[o + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; px[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b; px[o + 3] = 255;
    }
  }
  const metal = L.makeCanvas(BW, BW); metal.getContext('2d').putImageData(img, 0, 0);

  // ── the section's soft shadow on the blurred field ──
  g.save();
  g.shadowColor = 'rgba(72,48,120,0.42)'; g.shadowBlur = 30; g.shadowOffsetX = 9; g.shadowOffsetY = 13;
  K.fillGlyph(g, '#182446', { corner: 3 });
  g.restore();

  g.save();
  K.clipGlyph(g, { corner: 3 });
  g.drawImage(metal, B0, B0);

  // dendrites: a dark moat, then the pale arms with a cored centre line
  const moat = L.makeCanvas(S, S), mq = moat.getContext('2d');
  mq.fillStyle = '#08304a';
  for (const d of dens) { mq.beginPath(); for (const l of d.lobes) lobe(mq, l.x, l.y, l.ang, l.len * 1.04, l.w + 5); mq.fill(); }
  g.globalAlpha = 0.8; g.drawImage(L.blurred(moat, 5), 0, 0); g.globalAlpha = 1;
  const arms = L.makeCanvas(S, S), aq = arms.getContext('2d');
  aq.lineJoin = 'round';
  for (const d of dens) {
    aq.beginPath(); for (const l of d.lobes) lobe(aq, l.x, l.y, l.ang, l.len, l.w);
    aq.strokeStyle = '#0b3c4c'; aq.lineWidth = 3; aq.stroke();
    aq.fillStyle = '#cdeed8'; aq.fill();
  }
  aq.globalCompositeOperation = 'source-atop';
  for (const d of dens) {       // shading: lit toward the top-left, greener toward the tips
    aq.fillStyle = L.linear(aq, d.x - 90, d.y - 90, d.x + 90, d.y + 90, [[0, 'rgba(246,253,244,0.75)'], [0.5, 'rgba(206,238,216,0)'], [1, 'rgba(86,178,156,0.6)']]);
    aq.fillRect(d.x - 150, d.y - 150, 300, 300);
  }
  aq.lineCap = 'round';
  for (const d of dens) for (const l of d.lobes) {
    if (l.len < 13) continue;
    aq.strokeStyle = 'rgba(58,150,136,0.5)'; aq.lineWidth = Math.max(1.2, l.w * 0.2);
    aq.beginPath(); aq.moveTo(l.x + Math.cos(l.ang) * l.len * 0.1, l.y + Math.sin(l.ang) * l.len * 0.1);
    aq.lineTo(l.x + Math.cos(l.ang) * l.len * 0.74, l.y + Math.sin(l.ang) * l.len * 0.74); aq.stroke();
  }
  g.drawImage(arms, 0, 0);

  // polishing scratches (a few survive the etch)
  const rq = L.rng('g31scr');
  for (let i = 0; i < 12; i++) {
    const a = 0.42 + rq.range(-0.12, 0.12), x = rq.range(160, 920), y = rq.range(160, 920), len = rq.range(160, 520);
    g.strokeStyle = i % 3 ? L.rgba('#eafaf2', rq.range(0.07, 0.13)) : L.rgba('#06303c', rq.range(0.08, 0.14)); g.lineWidth = rq.range(0.8, 1.3);
    g.beginPath(); g.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2); g.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2); g.stroke();
  }
  // etch pits
  const pits = K.scatter({ seed: 'g31pit', spacing: 23, margin: 14, max: 300 });
  for (const p of pits) {
    const rr = rq.range(0.8, 1.7);
    g.fillStyle = L.rgba('#07283a', rq.range(0.4, 0.75)); g.beginPath(); g.arc(p.x, p.y, rr, 0, L.TAU); g.fill();
    g.fillStyle = L.rgba('#e6fbef', 0.35); g.beginPath(); g.arc(p.x + rr * 0.9, p.y + rr * 0.9, rr * 0.55, 0, L.TAU); g.fill();
  }
  // lead globules: ink-black beads with a pale etch halo and a glint
  const leads = K.scatter({ seed: 'g31lead', spacing: 47, margin: 17, max: 90 });
  for (const p of leads) {
    const rr = rq.range(2.4, 6.8) * (rq() < 0.12 ? 1.5 : 1);
    g.strokeStyle = L.rgba('#dff8ea', 0.4); g.lineWidth = 1.4; g.beginPath(); g.ellipse(p.x, p.y, rr + 1.2, (rr + 1.2) * rq.range(0.82, 1), p.rot, 0, L.TAU); g.stroke();
    g.fillStyle = L.radial(g, p.x - rr * 0.3, p.y - rr * 0.3, 0, rr * 1.2, [[0, '#26345c'], [0.55, '#0e1430'], [1, '#070a1c']]);
    g.beginPath(); g.ellipse(p.x, p.y, rr, rr * rq.range(0.82, 1), p.rot, 0, L.TAU); g.fill();
    g.fillStyle = L.rgba('#cfe0ff', 0.55); g.beginPath(); g.arc(p.x - rr * 0.38, p.y - rr * 0.38, Math.max(0.6, rr * 0.2), 0, L.TAU); g.fill();
  }
  g.restore();

  // the edge of the section catches the light on the top-left
  g.save();
  g.strokeStyle = L.linear(g, 180, 180, 900, 900, [[0, 'rgba(236,244,255,0.6)'], [0.45, 'rgba(236,244,255,0.05)'], [1, 'rgba(10,12,40,0.3)']]);
  g.lineWidth = 1.4; K.strokeGlyph(g, { corner: 3, grow: -0.7 });
  g.restore();

  // photographic bloom
  const bl = L.blurred(c, 9);
  g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.1; g.drawImage(bl, 0, 0); g.restore();
  return c;
}

export default {
  name: '金相',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },
};
