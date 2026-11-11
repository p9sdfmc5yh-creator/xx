// s19 — 月洞门·夜. A macro of the top of a garden moon gate (月洞门) at night, seen from the dark side of the wall.
// The arc is the front arris of the round opening. Just inside it lies the reveal — the thickness of the wall, lined with
// honed grey brick (砖细门套). A lantern on our side rakes its front edge while the moon reaches its back from the garden,
// and across the matte brick the two lights run into one another like the colours of a thin film:
// vermilion → orange → pale peach → lilac → violet-blue → night (the reference shot's iridescent limb).
// Above: the whitewashed wall in deep shadow, one calm blue-black field. Below, far out of focus: a pond sunk in deep
// blue with a single path of moonlight broken into bokeh, and one spray of bamboo hanging in from the left.
import * as L from '../lib/core.js';

const { W, H, TAU } = L;
const PAD = 240;
const X0 = -PAD, Y0 = -PAD, FULLW = W + PAD * 2, FULLH = H + PAD * 2;
const BW = 146;       // on-screen depth of the reveal (inside the opening)
const GX = 1096;      // axis of the moon's path on the pond
const JOINTS = [-0.705, -0.418, -0.121, 0.168, 0.452, 0.741];   // hairline joints between the brick pieces (never on the crest, never evenly spaced)
let S = null;

// colours across the reveal, from the front arris on the arc (t = 0) to its back edge (t = 1)
const RIM_A = [[0, '#b42312'], [0.035, '#d43317'], [0.1, '#ee4c1a'], [0.17, '#ff7a30'], [0.24, '#fca468'], [0.32, '#f8ccae'], [0.40, '#f1dcda'],
  [0.47, '#d2c2ea'], [0.54, '#a691ee'], [0.61, '#7c62f0'], [0.68, '#5c4ee0'], [0.75, '#4852c8'], [0.81, '#2f429e'], [0.87, '#1a2b6c'], [0.93, '#0d183e'], [1, '#060c20']];
const RIM_B = [[0, '#b82a12'], [0.035, '#da3d16'], [0.1, '#f25a19'], [0.17, '#fc8a34'], [0.24, '#f9b972'], [0.32, '#f8deb4'], [0.40, '#f2e8d6'],
  [0.47, '#cec8e8'], [0.54, '#9c8cee'], [0.61, '#7456ee'], [0.68, '#5846e0'], [0.75, '#4348c8'], [0.81, '#2c3c9e'], [0.87, '#19286c'], [0.93, '#0c163e'], [1, '#060b20']];

function rampLut(stops, n = 1024) {
  const f = L.makeRamp(stops); const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** soft bloom of a layer: downsample → blur → upsample */
function bloom(src, px, down = 4) {
  const w = Math.ceil(src.width / down), h = Math.ceil(src.height / down);
  const small = L.makeCanvas(w, h); const sg = small.getContext('2d');
  sg.filter = `blur(${px / down}px)`; sg.drawImage(src, 0, 0, w, h);
  const out = L.makeCanvas(src.width, src.height); const og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(small, 0, 0, src.width, src.height);
  out._pad = src._pad;
  return out;
}

/** L.filtered over just the frame-space rectangle that holds content (filter cost scales with area; the rest stays transparent) */
function filteredRect(src, filter, x0, y0, x1, y1) {
  const c = L.makeCanvas(src.width, src.height); const g = c.getContext('2d');
  const sx = Math.max(0, Math.round(x0 + PAD)), sy = Math.max(0, Math.round(y0 + PAD));
  const sw = Math.min(src.width, Math.round(x1 + PAD)) - sx, sh = Math.min(src.height, Math.round(y1 + PAD)) - sy;
  g.filter = filter; g.drawImage(src, sx, sy, sw, sh, sx, sy, sw, sh); g.filter = 'none';
  c._pad = src._pad;
  return c;
}

/**
 * Depth of field: the lens is focused on the crest of the gate, so the layer goes soft toward the sides of the frame.
 * Returns sharp·(1 − m) + soft·m with m rising from 0 (within `near` px of the centre line) to 1 (`far` px away); rows above y0 stay sharp.
 */
function focusMix(sharp, px, y0, near, far) {
  const soft = filteredRect(sharp, `blur(${px}px)`, X0, y0 - 48, W + PAD, H + PAD);
  const mask = (g) => {
    const gr = g.createLinearGradient(PAD + W / 2 - 1200, 0, PAD + W / 2 + 1200, 0);
    for (let i = 0; i <= 24; i++) { const off = Math.abs(i / 24 - 0.5) * 2400; gr.addColorStop(i / 24, `rgba(0,0,0,${L.smooth((off - near) / (far - near)).toFixed(3)})`); }
    return gr;
  };
  const sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = mask(sg); sg.fillRect(0, y0 + PAD, soft.width, soft.height);
  const out = L.makeCanvas(sharp.width, sharp.height); const g = out.getContext('2d');
  g.drawImage(sharp, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = mask(g); g.fillRect(0, y0 + PAD, out.width, out.height);
  g.globalCompositeOperation = 'lighter'; g.drawImage(soft, 0, 0);
  g.globalCompositeOperation = 'source-over';
  out._pad = sharp._pad;
  return out;
}

// ───────────────────────── the gate ─────────────────────────
/** the lit reveal: honed brick carrying the film of colour, front arris exactly on the arc */
function buildRim(env) {
  const a = env.arc, s = a.span(PAD + 160);
  const top = Math.floor(a.crestY - 6);
  const cw = FULLW, ch = H + PAD - top;
  const img = new ImageData(cw, ch); const d = img.data;
  const nz = L.makeNoise('s19film'), ng = L.makeNoise('s19brick');
  const lutA = rampLut(RIM_A), lutB = rampLut(RIM_B);
  // everything that only depends on the position along the arc
  const N = 2048, wob = new Float32Array(N), side = new Float32Array(N), lamp = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const th = L.lerp(-s, s, i / (N - 1));
    // the film is never the same thickness twice: a slow wander, and a broad swell to the right of the crest where the pale band widens
    wob[i] = 0.075 * nz.fbm(th * 3.1 + 1.3, 0.7, 2) - 0.055 * Math.exp(-Math.pow((th - 0.3) / 0.22, 2));
    side[i] = L.smooth(0.5 + th / 0.7 + 0.2 * nz.n2(th * 3.1, 9.1));        // pinker toward the lantern (left), creamier and more violet to the right
    lamp[i] = 0.85 + 0.15 * Math.exp(-Math.pow((th + 0.09) / 0.3, 2));      // the lantern hangs a little left of the crest
  }
  for (let j = 0; j < ch; j++) {
    const dy = a.cy - (top + j + 0.5);
    for (let i = 0; i < cw; i++) {
      const dx = X0 + i + 0.5 - a.cx;
      const dr = Math.sqrt(dx * dx + dy * dy) - a.R;
      if (dr > 3 || dr < -BW - 3) continue;
      const th = Math.atan2(dx, dy);
      const ti = Math.round(L.clamp((th + s) / (2 * s)) * (N - 1));
      const t = L.clamp(-dr / BW);
      const u = th * a.R, v = -dr;                                           // px along the arc / px into the reveal
      const w2 = nz.fbm(u / 150 + 4.1, v / 70 + 3.1, 2);
      const tt = L.clamp(t + (wob[ti] + 0.03 * w2) * 4 * t * (1 - t));   // the bands wander, the two edges stay put
      const li = ((tt * 1023) | 0) * 3;
      // honed brick: fine tooth, long rubbing marks along the curve, a faint cloudiness in the firing
      const tooth = ng.n2(u / 2.6, v / 2.3), rub = ng.fbm(u / 150 + 7, v / 5, 2), cloud = ng.fbm(u / 38, v / 30 + 5, 2);
      const b = lamp[ti] * (1 + 0.05 * tooth + 0.055 * rub + 0.04 * cloud);
      const m = side[ti], k = (j * cw + i) * 4;
      d[k] = (lutA[li] * (1 - m) + lutB[li] * m) * b;
      d[k + 1] = (lutA[li + 1] * (1 - m) + lutB[li + 1] * m) * b;
      d[k + 2] = (lutA[li + 2] * (1 - m) + lutB[li + 2] * m) * b;
      d[k + 3] = 255;
    }
  }
  const field = L.makeCanvas(cw, ch); field.getContext('2d').putImageData(img, 0, 0);
  const inBand = (x, y) => { const dr = a.drAt(x, y); return dr < -4 && dr > -BW + 4; };
  return L.makeLayer(PAD, (g) => {
    g.save(); a.clipBand(g, 0, -BW, -s, s);
    g.drawImage(field, X0, top);
    // each brick piece takes the light a shade differently
    const tone = [-0.5, 0.35, -0.2, 0.3, -0.45, 0.25, -0.3];
    for (let i = 0; i <= JOINTS.length; i++) {
      const v = tone[i % tone.length], t0 = i === 0 ? -s : JOINTS[i - 1], t1 = i === JOINTS.length ? s : JOINTS[i];
      g.fillStyle = v < 0 ? `rgba(20,6,40,${(-v * 0.1).toFixed(3)})` : `rgba(255,238,226,${(v * 0.06).toFixed(3)})`;
      a.pathBand(g, 0, -BW, t0, t1); g.fill();
    }
    // pores and the odd pale grain of sand in the clay
    L.speckle(g, { seed: 's19pore', count: 3600, x: X0, y: top, w: FULLW, h: ch, rMin: 0.5, rMax: 2, colors: ['#2a0c26', '#3a1220', '#1a0a34'], alpha: [0.06, 0.28], test: inBand, squash: 0.7 });
    L.speckle(g, { seed: 's19sand', count: 1500, x: X0, y: top, w: FULLW, h: ch, rMin: 0.4, rMax: 1.4, colors: ['#fff6ea', '#ffe6d0', '#e8e4ff'], alpha: [0.08, 0.3], test: inBand });
    // hairline joints (磨砖对缝): a dark thread, a breath of light on its lit side, a chip or two
    const r = L.rng('s19joint');
    for (const t of JOINTS) a.at(g, t + 0.0004, 0, () => {
      g.save(); g.rotate(r.range(-0.012, 0.012));
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = L.linear(g, 0, 0, 0, BW, [[0, 'rgba(110,66,92,0.5)'], [0.6, 'rgba(110,70,110,0.4)'], [1, 'rgba(110,80,130,0.1)']]); g.fillRect(-0.9, -2, 1.8, BW + 4);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,240,226,0.1)'; g.fillRect(0.9, 0, 1.1, BW * 0.6);
      for (let i = 0; i < 3; i++) {
        const y = r.range(4, BW * 0.8), w = r.range(2.5, 5.5);
        g.fillStyle = 'rgba(40,14,36,0.34)'; g.beginPath(); g.ellipse(r.range(-1, 1), y, w * 0.5, w, 0, 0, TAU); g.fill();
      }
      g.restore();
    });
    g.restore();
    // the arris is not a ruled line: a few nicks where the edge has crumbled
    g.save(); g.globalCompositeOperation = 'destination-out';
    const rc = L.rng('s19chip');
    for (let i = 0; i < 26; i++) {
      const t = rc.range(-s, s), w = rc.range(3, 11), dep = rc.range(0.9, 2.4);
      a.at(g, t, 0, () => { g.globalAlpha = rc.range(0.5, 1); g.beginPath(); g.ellipse(0, -0.2, w, dep, 0, 0, TAU); g.fill(); });
    }
    // … and where a joint meets it, a corner of brick has gone
    for (const t of JOINTS) {
      if (rc.chance(0.3)) continue;
      const w = rc.range(4, 8), dep = rc.range(2.2, 3.6), off = rc.range(-3, 3) / a.R;
      a.at(g, t + off, 0, () => { g.globalAlpha = 0.9; g.beginPath(); g.ellipse(0, -0.3, w, dep, rc.range(-0.2, 0.2), 0, TAU); g.fill(); });
    }
    g.restore();
  });
}

function buildWall(env, rim) {
  const a = env.arc, s = a.span(PAD + 160);
  // lantern light just catching the plaster beside the arris; its tooth shows only here, where the light rakes it
  const spill = L.makeLayer(PAD, (t) => {
    t.fillStyle = L.radial(t, a.cx, a.cy, a.R - 2, a.R + 40, [[0, 'rgba(255,255,255,0.34)'], [0.1, 'rgba(255,255,255,0.24)'], [0.26, 'rgba(255,255,255,0.13)'],
      [0.5, 'rgba(255,255,255,0.05)'], [0.8, 'rgba(255,255,255,0.012)'], [1, 'rgba(255,255,255,0)']]);
    a.pathBand(t, 40, -2, -s, s); t.fill();
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(L.noiseTex(FULLW, 620, { seed: 's19rake', scale: 7, octaves: 3, res: 0.5, contrast: 1.7, oy: a.crestY - 60,
      ramp: [[0, 'rgba(0,0,0,0.3)'], [0.5, 'rgba(0,0,0,0.72)'], [1, 'rgba(0,0,0,1)']] }), X0, a.crestY - 60);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = L.linear(t, 200, 0, 1720, 0, [[0, '#ff5a22'], [0.45, '#f4461c'], [1, '#e2442a']]);
    t.fillRect(X0, Y0, FULLW, FULLH);
  });
  return L.makeLayer(PAD, (g) => {
    // ── whitewashed wall (粉墙) in deep shadow: one calm blue-black field ──
    g.save(); a.clipAbove(g, -1.5);
    g.fillStyle = '#05070f'; g.fillRect(X0, Y0, FULLW, FULLH);
    g.drawImage(L.noiseTex(FULLW, FULLH, { seed: 's19plaster', scale: 320, octaves: 4, warp: 0.6, res: 0.25, contrast: 1.2,
      ramp: [[0, '#04050c'], [0.5, '#05070f'], [1, '#070a16']] }), X0, Y0);
    // the night sky lends the top of the wall a breath of blue
    g.globalCompositeOperation = 'screen';
    g.fillStyle = L.linear(g, 0, Y0, 0, a.crestY - 250, [[0, 'rgba(26,40,96,0.5)'], [0.55, 'rgba(22,34,84,0.2)'], [1, 'rgba(20,30,80,0)']]);
    g.fillRect(X0, Y0, FULLW, a.crestY - 250 - Y0);
    g.drawImage(spill, X0, Y0);
    g.restore();
    // ── the lit reveal ──
    g.drawImage(rim, X0, Y0);
  });
}

/** the lantern's bloom: two blur passes of the lit reveal, knocked back over the reveal itself so it spills outward instead of bleaching the brick */
function buildGlow(env, rim) {
  const a = env.arc, s = a.span(PAD + 160);
  const c = L.makeCanvas(rim.width, rim.height); const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.22; g.drawImage(bloom(rim, 9, 2), 0, 0);
  g.globalAlpha = 0.5; g.drawImage(bloom(rim, 40, 6), 0, 0);
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, PAD, PAD);
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.6; g.fillStyle = '#000';
  a.pathBand(g, 0, -BW, -s, s); g.fill();
  // on the wall the halo dies within a few fingers (the tagline's feet sit just above) …
  g.globalAlpha = 1;
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 44, [[0, 'rgba(0,0,0,0)'], [0.3, 'rgba(0,0,0,0.42)'], [0.7, 'rgba(0,0,0,0.88)'], [1, 'rgba(0,0,0,1)']]);
  a.pathBand(g, 700, 0, -s, s); g.fill();
  // … and takes the colour of the arris it spills from, not the average of the whole rim
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = L.linear(g, 200, 0, 1720, 0, [[0, 'rgba(255,92,34,0.75)'], [0.5, 'rgba(244,70,28,0.75)'], [1, 'rgba(226,64,40,0.75)']]);
  a.pathBand(g, 60, 0, -s, s); g.fill();
  g.globalCompositeOperation = 'source-over';
  c._pad = rim._pad;
  return c;
}

// ───────────────────────── through the opening: the pond, far out of focus ─────────────────────────
function leafPath(g, len, wid, bend) {
  g.beginPath(); g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.2, -wid, len * 0.6, -wid * 0.82 + bend * 0.5, len, bend);
  g.bezierCurveTo(len * 0.62, wid * 0.52 + bend * 0.6, len * 0.24, wid * 0.74, 0, 0);
  g.closePath();
}

/** one arching twig of bamboo with its hanging fans of leaves (个字 / 介字), as a flat silhouette */
function spray(g, r, [sx, sy, mx, my, ex, ey], o = {}) {
  const { col = '#040a1a', size = 1, twig = 4.4, step = [0.17, 0.25], from = 0.22 } = o;
  const P = (t) => [(1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey];
  g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round';
  for (let i = 0; i < 24; i++) { const p0 = P(i / 24), p1 = P((i + 1) / 24); g.lineWidth = L.lerp(twig, twig * 0.3, i / 24) * size; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
  for (let t = from; t <= 1.001; t += r.range(step[0], step[1])) {
    const [x, y] = P(t), [x2, y2] = P(Math.min(1, t + 0.02)), [x1, y1] = P(t - 0.02);
    const tan = Math.atan2(y2 - y1, x2 - x1);
    const n = t > 0.95 ? 5 : r.int(3, 4);
    for (let j = 0; j < n; j++) {
      const fan = (j - (n - 1) / 2) * r.range(0.3, 0.5);
      const ang = L.lerp(tan, Math.PI * 0.44, 0.6) + fan + r.range(-0.14, 0.14);   // the leaves hang
      const len = r.range(118, 205) * (0.82 + 0.3 * t) * size, wid = len * r.range(0.105, 0.15);
      g.save(); g.translate(x, y); g.rotate(ang);
      leafPath(g, len, wid, r.range(-0.1, 0.18) * len); g.fill();
      g.restore();
    }
  }
}

function buildWater(env) {
  const a = env.arc;
  const res = 1 / 3, hz = a.crestY + 70;                 // the far shore lies hidden behind the wall
  const y0 = a.crestY + BW - 40, h = H + PAD - y0;
  const cw = Math.ceil(FULLW * res), ch = Math.ceil(h * res);
  const img = new ImageData(cw, ch); const d = img.data;
  const nz = L.makeNoise('s19water');
  let k = 0;
  for (let j = 0; j < ch; j++) {
    const y = y0 + j / res - hz;                         // px below the far shore
    const len = 34 + y * 0.5;                            // ripples get longer …
    const v = Math.log(1 + y * 0.0155) / 0.034;          // … and thicker toward the viewer
    const dep = Math.pow(L.clamp((y - 80) / 520), 0.8);
    const br = L.lerp(14, 3, dep), bg = L.lerp(50, 15, dep), bb = L.lerp(100, 40, dep);   // hazy cobalt far off, sinking to deep blue at our feet
    const sheenW = 60 + y * 0.5;
    for (let i = 0; i < cw; i++) {
      const x = i / res - PAD;
      const u = (x - GX) / len;
      const n = nz.fbm(u, v, 3);
      const n2 = nz.n2(u * 0.3 + 9, v * 0.25);
      const m = 1 + 0.3 * Math.min(0, n) + 0.14 * n2;
      const sx = (x - GX) / sheenW;
      const sheen = Math.exp(-sx * sx);
      const crest = Math.max(0, n + 0.1);
      const add = crest * crest * (9 + 190 * sheen * sheen);
      d[k++] = br * m + add * 0.74; d[k++] = bg * m + add * 0.86; d[k++] = bb * m + add; d[k++] = 255;
    }
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  return { canvas: small, y0, h };
}

function buildBack(env) {
  const a = env.arc;
  const layer = L.makeLayer(PAD, (g) => {
    const wt = buildWater(env);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(wt.canvas, X0, wt.y0, FULLW, wt.h);
    // the moon lies on the water as a long soft sheen under its path of glitter
    g.save(); g.globalCompositeOperation = 'screen';
    g.translate(GX, a.crestY + BW - 30); g.scale(1, 3.4);
    g.fillStyle = L.radial(g, 0, 0, 0, 190, [[0, 'rgba(140,180,244,0.42)'], [0.3, 'rgba(84,130,214,0.2)'], [0.65, 'rgba(44,84,176,0.06)'], [1, 'rgba(40,80,170,0)']]);
    g.fillRect(-200, -40, 400, 240);
    g.restore();
  });
  const soft = filteredRect(layer, 'blur(6px)', X0, a.crestY + BW - 60, W + PAD, H + PAD);
  const g = soft.getContext('2d'); g.translate(PAD, PAD);
  // a further spray of bamboo, well beyond the plane of focus: no more than a soft shadow on the water
  const farSpray = L.makeLayer(PAD, (t) => { spray(t, L.rng('s19bambooFar'), [-70, 900, 180, 842, 372, 978], { col: '#040b20', size: 0.86 }); });
  g.globalAlpha = 0.8; g.drawImage(filteredRect(farSpray, 'blur(11px)', X0, 700, 700, H + PAD), X0, Y0); g.globalAlpha = 1;
  // night mist lying on the pond in slow clouds
  const top = a.crestY + BW - 50, hh = H + PAD - top;
  g.globalCompositeOperation = 'screen';
  g.drawImage(L.noiseTex(FULLW, hh, { seed: 's19mist', scale: 120, sx: 6, sy: 1, octaves: 4, warp: 0.35, contrast: 1.5, res: 0.2,
    ramp: [[0, 'rgba(56,104,190,0)'], [0.42, 'rgba(56,104,190,0)'], [1, 'rgba(88,142,216,0.26)']] }), X0, top);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(L.noiseTex(FULLW, hh, { seed: 's19deep', scale: 150, sx: 5, sy: 1, octaves: 3, warp: 0.3, contrast: 1.4, res: 0.2,
    ramp: [[0, 'rgba(10,22,60,0.5)'], [0.5, 'rgba(10,22,60,0)'], [1, 'rgba(10,22,60,0)']] }), X0, top);
  g.globalCompositeOperation = 'source-over';
  // night pools under the gate and at the sides of the pond: everything but the moon's path sinks into deep blue
  const s = a.span(PAD + 160);
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - BW - 170, a.R - BW + 4, [[0, 'rgba(4,8,26,0)'], [0.5, 'rgba(4,8,26,0.22)'], [1, 'rgba(4,8,26,0.74)']]);
  a.pathBand(g, -BW + 4, -BW - 170, -s, s); g.fill();
  g.fillStyle = L.linear(g, GX - 1300, 0, GX + 1300, 0, [[0, 'rgba(3,7,24,0.7)'], [0.14, 'rgba(3,7,24,0.4)'], [0.3, 'rgba(3,7,24,0.08)'], [0.5, 'rgba(3,7,24,0)'],
    [0.58, 'rgba(3,7,24,0.06)'], [0.74, 'rgba(3,7,24,0.46)'], [1, 'rgba(3,7,24,0.8)']]);
  g.fillRect(X0, top, FULLW, hh);
  // … but a breath of moonlit mist hangs behind the bamboo, so its leaves read as shadow
  g.globalCompositeOperation = 'screen';
  g.save(); g.translate(500, 930); g.scale(1, 0.62);
  g.fillStyle = L.radial(g, 0, 0, 0, 520, [[0, 'rgba(70,112,206,0.3)'], [0.45, 'rgba(56,96,190,0.15)'], [1, 'rgba(40,80,170,0)']]);
  g.fillRect(-540, -540, 1080, 1080);
  g.restore();
  g.globalCompositeOperation = 'source-over';
  return soft;
}

/** the near spray of bamboo just beyond the gate: dark, only slightly soft */
function buildBamboo() {
  const layer = L.makeLayer(PAD, (g) => {
    const r = L.rng('s19bamboo');
    spray(g, r, [60, 742, 380, 770, 610, 938], { col: '#02060f', size: 1.08 });
    spray(g, r, [-110, 842, 150, 884, 296, 1040], { col: '#030712', size: 1.12 });
    spray(g, r, [300, 664, 560, 668, 770, 800], { col: '#030814', size: 0.96, from: 0.34 });
  });
  return filteredRect(layer, 'blur(5px)', X0, 560, 1160, H + PAD);
}

function makeGlints(env) {
  const a = env.arc, yT = a.crestY + BW - 10;
  const r = L.rng('s19glint'); const out = [];
  for (let i = 0; i < 176; i++) {
    const k = Math.pow(r(), 1.45);                       // crowded far off, thinning toward our feet
    const y = yT + k * (H + 70 - yT);
    const hw = 13 + (y - yT) * 0.3;
    const stray = r.chance(0.08);                        // a few off the path
    const rad = L.lerp(15, 25, k) * r.range(0.86, 1.14);
    out.push({ x: GX + r.gauss() * hw * (stray ? 1.8 : 0.5), y, rx: rad, ry: rad * r.range(0.86, 1),
      a: (0.045 + 0.56 * Math.pow(r(), 2.3)) * (1 - 0.25 * k) * (stray ? 0.5 : 1), ph: r.range(0, TAU), sp: r.range(0.9, 2.3) });
  }
  return out;
}

/** a ripple catching the moon, far behind the plane of focus: a disc of light, a little brighter at its rim (the lens's circle of confusion) */
function glintSprite() {
  const c = L.makeCanvas(128, 128); const g = c.getContext('2d');
  g.fillStyle = L.radial(g, 64, 64, 0, 62, [[0, 'rgba(150,190,252,0.78)'], [0.7, 'rgba(154,194,252,0.8)'], [0.88, 'rgba(170,204,255,0.9)'],
    [0.935, 'rgba(186,214,255,0.96)'], [0.975, 'rgba(170,204,255,0.45)'], [1, 'rgba(160,198,255,0)']]);
  g.fillRect(0, 0, 128, 128);
  return c;
}

function drawGlints(ctx, env) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const q of S.glints) {
    const tw = 0.5 + 0.5 * Math.sin(q.ph + env.frame * q.sp);
    ctx.globalAlpha = Math.min(1, q.a * (0.3 + 0.8 * tw));
    ctx.drawImage(S.sprite, q.x - q.rx, q.y - q.ry, q.rx * 2, q.ry * 2);
  }
  ctx.restore();
}

export default {
  name: '月洞门·夜',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const rim = buildRim(env);
    S = {
      back: buildBack(env), bamboo: buildBamboo(),
      wall: focusMix(buildWall(env, rim), 8, a.crestY - 70, 300, 1120),
      glow: buildGlow(env, rim), glints: makeGlints(env), sprite: glintSprite(),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // walking toward the gate: the wall swells about the crest (exactly on the arc at mid-shot), the garden barely changes
    const zW = L.lerp(0.99, 1.01, p), k = zW - 1;
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, H);
    // the pond only shows below the back edge of the reveal → skip rasterising it behind the wall
    ctx.save(); ctx.beginPath(); ctx.rect(0, a.crestY + BW * 0.99 - 14, W, H); ctx.clip();
    const far = { zoom: 1 + k * 0.2, dx: L.lerp(-6, 6, p) };
    L.blit(ctx, env, S.back, far);
    L.cam(ctx, env, far, () => drawGlints(ctx, env));
    L.blit(ctx, env, S.bamboo, { zoom: 1 + k * 0.7, dx: L.lerp(5, -5, p) });
    ctx.restore();
    L.blit(ctx, env, S.wall, { zoom: zW });
    // lantern light breathing on the brick: one swell across the shot (brightest at the middle frame)
    const fl = 0.93 + 0.07 * Math.sin(p * Math.PI);
    L.blit(ctx, env, S.glow, { zoom: zW, blend: 'screen', alpha: fl });
  },
};
