// s34 — 祈年殿平面图. A hand-inked plan on white drafting paper, shot close:
// the shared arc is the heavy ink circle of the hall's round base (台明外圆), with the kerb ring washed in yellow just
// inside it. Under it: a bold lattice of 45° regulating chords (the red pair is the inscribed square struck from the
// crest, the blue one its partner from the right-hand station), the eave-column ring (檐柱圈) and the hypostyle ring
// (金柱圈) with their columns on shared radial axes at ±15°, so the central axis runs between two columns.
// Few lines, drawn thick. NOTE: ring radii are schematic (no reliable survey figures exist in the research file) — the
// hypostyle columns sit where the red chords cut the 15° axes. No numbers, no lettering.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 100;   // the move is tiny (zoom ±1.5 %, rot ±0.002) so a small margin is plenty
const INK = '#0b0c0f', RED = '#e6341c', BLUE = '#1653c2', YEL = '#ffd91c', PAPER = '#f6f9fa', LEAD = '#3a4250';
let S = null;

// ───────── drafting helpers ─────────
/** on/off segments [t0,t1] of a hand-drawn dash pattern along a length (dash lengths never repeat exactly) */
function dashSegs(len, pat, r, jit = 0.09) {
  const out = []; let t = 0, i = 0;
  while (t < len) {
    const d = pat[i % pat.length] * (1 + r.range(-jit, jit));
    if (i % 2 === 0) out.push([t, Math.min(len, t + d)]);
    t += d; i++;
  }
  return out;
}
/** one ruled stroke p→q as a filled strip whose width breathes a little along its length */
function strip(g, p, q, w, r, o = {}) {
  const { color = INK, alpha = 1, dash = null, wob = 0.06, drift = 0 } = o;
  const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const ph1 = r.range(0, 9), ph2 = r.range(0, 9), k1 = r.range(0.004, 0.008), k2 = r.range(0.016, 0.03);
  const hw = (t) => (w / 2) * (1 + wob * Math.sin(t * k1 + ph1) + wob * 0.6 * Math.sin(t * k2 + ph2));
  const mid = (t) => drift * Math.sin(t * k1 * 0.7 + ph2);
  g.save(); g.fillStyle = color; g.globalAlpha *= alpha;
  for (const [t0, t1] of dash ? dashSegs(len, dash, r) : [[0, len]]) {
    const n = Math.max(1, Math.ceil((t1 - t0) / 40));
    g.beginPath();
    for (let i = 0; i <= n; i++) { const t = L.lerp(t0, t1, i / n), o2 = mid(t) + hw(t); const x = p.x + ux * t + nx * o2, y = p.y + uy * t + ny * o2; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let i = n; i >= 0; i--) { const t = L.lerp(t0, t1, i / n), o2 = mid(t) - hw(t); g.lineTo(p.x + ux * t + nx * o2, p.y + uy * t + ny * o2); }
    g.closePath(); g.fill();
  }
  g.restore();
}
/** a compass stroke concentric with the arc */
function ring(g, a, dr, w, r, o = {}) {
  const { color = INK, alpha = 1, dash = null, t0 = -1, t1 = 1 } = o;
  const rr = a.R + dr, len = rr * (t1 - t0);
  g.save(); g.strokeStyle = color; g.globalAlpha *= alpha; g.lineWidth = w; g.lineCap = 'butt';
  for (const [u0, u1] of dash ? dashSegs(len, dash, r) : [[0, len]]) a.stroke(g, dr, t0 + u0 / rr, t0 + u1 / rr);
  g.restore();
}
/** random-alpha tile used to "bite" strokes with paper tooth (destination-out) */
function toothTile(seed, size, density, scale = 1) {
  const n = Math.round(size / scale);
  const c = L.makeCanvas(n, n); const g = c.getContext('2d');
  const img = new ImageData(n, n); const d = img.data; const r = L.rng(seed);
  for (let i = 0; i < d.length; i += 4) { d[i + 3] = r() < density ? 255 * Math.pow(r(), 0.6) : 0; }
  g.putImageData(img, 0, 0);
  if (scale === 1) return c;
  const out = L.makeCanvas(size, size); const og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.drawImage(c, 0, 0, size, size);
  return out;
}
function bite(layer, tile, alpha) {
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = alpha;
  g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, layer.width, layer.height);
  g.restore();
}
/** thin the medium in soft patches (destination-out with low-frequency noise) */
function thin(layer, seed, scale, amount) {
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out';
  g.drawImage(L.noiseTex(layer.width, layer.height, { seed, scale, octaves: 3, res: 0.25, contrast: 1.7, ramp: [[0, 'rgba(0,0,0,0)'], [0.42, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${amount})`]] }), 0, 0);
  g.restore();
}
/**
 * Wet media creep along the paper fibres: blur the layer's alpha, push it around with fibre-sized noise and
 * re-threshold, so every edge wanders by a pixel or so instead of being a perfect vector edge.
 */
function bleed(layer, { blur = 1.1, amt = 0.55, seed = 's34bleed', hard = 3, y0 = 0, y1 = layer.height } = {}) {
  // only rows y0..y1 (layer pixels) hold anything: work on that strip alone
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(layer.height, Math.ceil(y1));
  const w = layer.width, h = y1 - y0;
  const strip = L.makeCanvas(w, h);
  const g = strip.getContext('2d', { willReadFrequently: true });
  g.filter = `blur(${blur}px)`; g.drawImage(layer, 0, -y0); g.filter = 'none';
  const img = g.getImageData(0, 0, w, h); const d = img.data;
  const NS = 256;
  const nd = L.noiseTex(NS, NS, { seed, scale: 5, octaves: 2, res: 1, contrast: 1.5 }).getContext('2d').getImageData(0, 0, NS, NS).data;
  const r = L.rng(seed + 'w');
  for (let y = 0, i = 3; y < h; y++) {
    const row = (y & (NS - 1)) * NS;
    for (let x = 0; x < w; x++, i += 4) {
      const al = d[i];
      if (al < 6 || al > 249) continue;
      const n = nd[(row + (x & (NS - 1))) * 4] / 255 * 0.75 + r() * 0.25;
      const v = (al / 255 - 0.5 + (n - 0.5) * amt) * hard + 0.5;
      d[i] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const out = L.makeCanvas(w, layer.height);
  out.getContext('2d').drawImage(strip, 0, y0);
  out._pad = layer._pad;
  return out;
}

function build(env) {
  const a = env.arc, R = a.R;
  const LW = W + PAD * 2, LH = H + PAD * 2;
  const s = a.span(PAD + 140);
  const rad = L.deg;
  const P = (d, dr = 0) => a.pt(rad(d), dr);
  const C = { x: a.cx, y: a.cy };
  // ring radii generated by the chord construction (schematic proportions, not survey sizes)
  const dE = (R * Math.cos(rad(30))) / Math.cos(rad(15)) - R; // 檐柱圈 eave-column ring
  const dM = R * Math.cos(rad(30)) - R;                       // a trial circle between the two rings
  const dG = (R * Math.cos(rad(45))) / Math.cos(rad(30)) - R; // 金柱圈 hypostyle ring (on the red chords)
  const rE = 40, rG = 50;                                     // column radii: inner ring thicker than outer
  const KERB = -48;                                           // inner edge of the kerb course (阶条石)
  const AXIS = [78, 17, 11, 17];                              // 点划线, long and bold
  // columns: [deg, dr, radius, per-column wobble seed]
  const COLS = [[-15, dE, rE, 1], [15, dE, rE, 2], [-15, dG, rG, 3], [15, dG, rG, 4]];
  /** offset a chord sideways by `off` px (for re-struck twin lines) and pull its start back so the clip trims it on the arc */
  const chordPts = (da, db, off = 0, back = 24) => {
    const p = P(da), q = P(db), dx = q.x - p.x, dy = q.y - p.y, m = Math.hypot(dx, dy), ux = dx / m, uy = dy / m;
    return [{ x: p.x - ux * back - uy * off, y: p.y - uy * back + ux * off }, { x: q.x - uy * off, y: q.y + ux * off }];
  };
  /** punch the plinth squares out of a layer so nothing runs under a column */
  const clearPlinths = (layer) => {
    const g = layer.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, PAD, PAD); g.globalCompositeOperation = 'destination-out';
    for (const [d, dr, rr] of COLS) a.at(g, rad(d), dr, () => { const q = rr * 1.46 + 1; g.fillRect(-q, -q, q * 2, q * 2); });
    g.restore();
  };

  // ───────── 1. pencil under-drawing: a handful of construction lines that were never inked ─────────
  const pencil = L.makeLayer(PAD, (g) => {
    const r = L.rng('s34pencil');
    const pl = (p, q, w, alpha) => strip(g, p, q, w, r, { color: LEAD, alpha, wob: 0.12 });
    g.save(); a.clipBelow(g, -2);
    pl(...chordPts(0, 60), 3.0, 0.46); pl(...chordPts(0, -60), 3.0, 0.4);   // the pair from the crest that fixes the eave columns
    pl(...chordPts(-30, 30, 0, 0), 2.8, 0.36);                 // … and the chord that checks them
    pl(...chordPts(0, -120), 2.6, 0.3);                        // one abandoned trial
    g.restore();
    ring(g, a, dM, 2.6, r, { color: LEAD, alpha: 0.32, t0: -s, t1: s });
    ring(g, a, dM + 3, 1.8, r, { color: LEAD, alpha: 0.2, t0: -0.22, t1: 0.1 });   // the compass went round twice
  });
  bite(pencil, toothTile('s34t2', 256, 0.6, 2), 0.6);
  bite(pencil, toothTile('s34t1', 256, 0.5, 1), 0.35);

  // ───────── 2. yellow wash on the kerb ring, hugging the arc ─────────
  let wash = L.makeLayer(PAD, (g) => {
    const r = L.rng('s34wash');
    g.fillStyle = YEL;
    g.beginPath();
    a.trace(g, -4, -s, s);                                    // top edge hides under the heavy ink line
    const n = 220;
    for (let i = n; i >= 0; i--) {                            // inner edge follows the kerb line by hand: now shy of it, now over
      const t = L.lerp(-s, s, i / n);
      const p = a.pt(t, KERB + 1.5 + 2.8 * Math.sin(i * 0.61 + 1.3) * Math.sin(i * 0.17) + r.range(-0.7, 0.7));
      g.lineTo(p.x, p.y);
    }
    g.closePath(); g.fill();
  });
  const yTop = PAD + a.crestY - 70, yBand = PAD + a.yAt(-PAD, KERB) + 14;
  wash = bleed(wash, { blur: 1.5, amt: 0.8, seed: 's34bw', y0: yTop, y1: yBand });
  {
    const g = wash.getContext('2d'); g.translate(PAD, PAD);
    const r = L.rng('s34lap');
    // lap marks where one brush-load ends and the next begins
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#f6c900';
    for (let t = -s + r.range(0, 0.06); t < s; t += r.range(0.11, 0.24)) {
      const wd = r.range(14, 34) / R;
      g.globalAlpha = r.range(0.3, 0.55);
      a.pathBand(g, 0, KERB - 6, t, t + wd); g.fill();
    }
    g.globalAlpha = 1;
    // dry streaks along the stroke: the bristles leave the paper showing through
    g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineCap = 'round';
    for (let i = 0; i < 460; i++) {
      const t = r.range(-s, s), len = r.range(40, 260) / R, dr = r.range(KERB + 3, -6);
      g.globalAlpha = r.range(0.04, 0.2); g.lineWidth = r.range(0.8, 2.6);
      a.stroke(g, dr, t, t + len);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // ───────── 3. red / blue emphasis lines (marker, struck along the straight-edge) ─────────
  let colour = L.makeLayer(PAD, (g) => {
    const r = L.rng('s34colour');
    g.save(); a.clipBelow(g, -1);
    strip(g, ...chordPts(0, 90), 15, r, { color: RED, wob: 0.07, drift: 0.8 });     // 方圆: the inscribed square, struck from the crest
    strip(g, ...chordPts(0, -90), 15, r, { color: RED, wob: 0.07, drift: 0.8 });
    g.restore();
    g.save(); a.clipBelow(g, KERB - 3);                        // the blue starts under the kerb, so it never goes green over the yellow
    strip(g, ...chordPts(15, -105, 9), 12.5, r, { color: BLUE, wob: 0.07, drift: 0.8 }); // its partner from the right-hand station
    g.restore();
  });
  colour = bleed(colour, { blur: 1.5, amt: 0.85, seed: 's34bc', y0: yTop });
  thin(colour, 's34cden', 150, 0.16);
  bite(colour, toothTile('s34t3', 256, 0.5, 2), 0.12);
  clearPlinths(colour);

  // ───────── 4. ink ─────────
  let ink = L.makeLayer(PAD, (g) => {
    const r = L.rng('s34ink');
    // regulating chords: two families at 45°, all struck from stations on the circle. [from°, to°, weight, sideways offset]
    const CH = [
      [-15, 105, 7.4, 0], [-15, 105, 4.4, -19],                 // left station, re-struck once beside itself
      [-7.5, 97.5, 5.8, 0],
      [15, 75, 7.0, 0],
      [-15, -75, 6.8, 0],
      [7.5, -97.5, 6.0, 0],
      [15, -105, 6.2, -7.5],                                   // the black line that the blue one runs beside
    ];
    g.save(); a.clipBelow(g, -1);
    for (const [da, db, w, off] of CH) strip(g, ...chordPts(da, db, off), w, r);
    g.restore();
    // axes (点划线): the central axis runs between two columns; the two column axes start just outside the circle
    strip(g, P(0, -12), C, 5.2, r, { dash: AXIS });
    strip(g, P(-15, 40), C, 4.8, r, { dash: AXIS });
    strip(g, P(15, 30), C, 4.8, r, { dash: AXIS });
    // the two column rings: eave ring as the wall line, hypostyle ring as an axis
    ring(g, a, dE, 7.2, r, { t0: -s, t1: s });
    ring(g, a, dG, 5.0, r, { t0: -s, t1: s, dash: AXIS });
    // kerb course: inner line + stone joints of uneven length
    ring(g, a, KERB, 5.2, r, { t0: -s, t1: s });
    for (let t = -s + r.range(0, 0.03); t < s; t += r.range(150, 250) / R) {
      if (Math.abs(t) < 0.012) continue;                       // keep the crest clear for the red pair
      strip(g, a.pt(t, 0), a.pt(t, KERB), r.range(3.6, 4.8), r);
    }
    // the base edge = THE arc
    ring(g, a, -4, 14, r, { t0: -s, t1: s });
  });
  clearPlinths(ink);
  {
    // columns: plinth square ruled with crossed corners, solid shaft
    const g = ink.getContext('2d');
    for (const [d, dr, rr, k] of COLS) {
      const r = L.rng('s34col' + k);
      a.at(g, rad(d), dr, () => {
        g.rotate(r.range(-0.02, 0.02));
        const q = rr * 1.46, o = 7;
        const e = [[-q - o, -q, q + o, -q], [q, -q - o, q, q + o], [q + o, q, -q - o, q], [-q, q + o, -q, -q - o]];
        for (const [x0, y0, x1, y1] of e) strip(g, { x: x0 - r.range(0, 5), y: y0 }, { x: x1, y: y1 }, r.range(4.8, 5.8), r, { wob: 0.04 });
        // shaft: filled by hand, so the outline is not a perfect circle and not perfectly centred
        const ox = r.range(-2, 2), oy = r.range(-2, 2), ph = r.range(0, 6);
        g.fillStyle = INK; g.beginPath();
        for (let i = 0; i <= 48; i++) {
          const t = (i / 48) * L.TAU, rr2 = (rr + r.range(-2, 2) * 0) * (1 + 0.018 * Math.sin(t * 3 + ph) + 0.012 * Math.sin(t * 5 + ph * 2));
          const x = ox + Math.cos(t) * rr2, y = oy + Math.sin(t) * rr2;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.closePath(); g.fill();
      });
    }
  }
  ink = bleed(ink, { blur: 1.05, amt: 0.6, seed: 's34bi', y0: yTop });
  thin(ink, 's34inkden', 60, 0.13);
  bite(ink, toothTile('s34t4', 256, 0.35, 1), 0.1);

  // ───────── 5. the sheet: cold white paper + everything drawn on it ─────────
  // paper tooth under raking light: on white only the little shadows show
  const toothBump = L.bumpLight(L.noiseTex(512, 512, { seed: 's34tooth', scale: 3.2, octaves: 2, res: 1, contrast: 1.6 }), { strength: 1.8, res: 1, angle: 45 });
  {
    const g = toothBump.getContext('2d', { willReadFrequently: true });
    const img = g.getImageData(0, 0, 512, 512), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] - 128) / 128;                             // −1..1
      const m = L.clamp(255 + (v - 0.02) * 21, 0, 255);
      d[i] = m - 1; d[i + 1] = m; d[i + 2] = Math.min(255, m + 1);
    }
    g.putImageData(img, 0, 0);
  }
  let sheet = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#fefefe'; g.fillRect(-PAD, -PAD, LW, LH);
    // a few stray fibres in the pulp
    {
      const r = L.rng('s34fib'); g.lineCap = 'round';
      for (let i = 0; i < 150; i++) {
        const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(6, 38), an = r() * Math.PI;
        g.strokeStyle = L.rgba('#9aa6ad', r.range(0.05, 0.2)); g.lineWidth = r.range(0.4, 1.2);
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-4, 4), y + Math.sin(an) * len * 0.5 + r.range(-4, 4), x + Math.cos(an) * len, y + Math.sin(an) * len);
        g.stroke();
      }
    }
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = g.createPattern(toothBump, 'repeat'); g.fillRect(-PAD, -PAD, LW, LH);
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = g.createPattern(L.grainTex(512, 512, { seed: 39, amount: 0.14 }), 'repeat'); g.fillRect(-PAD, -PAD, LW, LH);
    g.restore();
    L.speckle(g, { seed: 's34sp', count: 110, x: -PAD, y: -PAD, w: LW, h: LH, rMin: 0.4, rMax: 1.3, colors: ['#6c777e', '#8c979d'], alpha: [0.08, 0.28] });
    g.globalCompositeOperation = 'multiply';
    g.drawImage(pencil, -PAD, -PAD);
    g.drawImage(wash, -PAD, -PAD);
    g.drawImage(colour, -PAD, -PAD);
    g.drawImage(ink, -PAD, -PAD);
  });
  sheet = L.blurred(sheet, 0.45);

  // ───────── 6. paper curl, window light and lens fall-off, baked into the sheet ─────────
  {
    const g = sheet.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    // the sheet has been kept rolled and does not lie perfectly flat: broad, very soft bands of light and shade
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.linear(g, PAD - 200, 0, PAD + W + 200, 260, [[0, '#fbfcfc'], [0.14, '#ffffff'], [0.3, '#fcfdfd'], [0.47, '#ffffff'], [0.66, '#fbfcfd'], [0.8, '#ffffff'], [1, '#fafbfc']]);
    g.fillRect(0, 0, LW, LH);
    g.restore();
    // the lens is focused on the crest; the picture softens a little toward the near edge and the corners
    const ox = a.cx + PAD, oy = a.crestY + PAD + 70;
    const defocus = (px, r0, r1) => {
      const b = L.blurred(sheet, px), bg = b.getContext('2d');
      bg.save(); bg.globalCompositeOperation = 'destination-in';
      bg.translate(ox, oy); bg.scale(2.1, 1);
      bg.fillStyle = L.radial(bg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
      bg.fillRect(-LW, -LH, LW * 2, LH * 2);
      bg.restore();
      return b;
    };
    g.drawImage(defocus(1.7, 400, 900), 0, 0);
    // window light from the upper left, falling off very gently toward the lower right
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.linear(g, PAD, PAD, PAD + W, PAD + H, [[0, '#ffffff'], [0.5, '#fefefe'], [1, '#f8fafb']]);
    g.fillRect(0, 0, LW, LH);
    g.restore();
  }
  return { sheet };
}

export default {
  name: '祈年殿平面图',
  tone: 'dark',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    // slow push-in centred on the crest + a hair of rotation about the plan's centre
    const zoom = L.lerp(0.99, 1.016, p), rot = L.lerp(-0.002, 0.002, p);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.sheet, { rot, zoom });
  },
};
