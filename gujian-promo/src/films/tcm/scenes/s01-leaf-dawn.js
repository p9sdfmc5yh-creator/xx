// s01 — 草木晨光. The opening "horizon" of 《中国中医药》: the upper margin of one huge herb leaf, backlit at dawn, shot as a macro.
// Below the arc the blade is ink-green, almost black; only the thin margin lets a little emerald through.
// Hugging the arc is the glow: a hairline of morning gold (the short hairs on the leaf edge catching the light),
// then bright emerald, deep emerald, and finally a clean ink-green dark that runs far above the frame —
// the title card is simply the camera tilted up into that dark, so this file also exports the three "opening" hooks.
// Photographic rules of this shot: one light (behind the crest), focus on the crest (the edge softens toward both ends and the
// dew there melts into soft beads), highlights bloom, nothing is outlined.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 220;
let S = null; // cached layers

// colour of the air by height above the leaf edge (px): 晨金 → 明翠 → 深翠 → 墨绿黑
const SKY = [
  [-10, '#0a3c28'], [0, '#f9d468'], [10, '#f2c14e'], [23, '#dec652'], [39, '#a8cd5c'], [61, '#5fc869'],
  [92, '#2fbf71'], [132, '#25ab67'], [190, '#198e58'], [256, '#0f6b46'], [336, '#0b5239'], [426, '#083a29'], [536, '#06271c'],
  [690, '#041a12'], [900, '#03110c'], [1900, '#020a07'],
];
const SKY_TOP = 1900;
const LIGHT_X = 44;   // the sun sits a touch right of the crest: nothing in a photograph is dead-centre
const FOCUS_X = 70;

// dew drops sitting on the margin: offset along the edge from the crest (px), half-width, height
const DROPS = [
  { x: -812, w: 21, h: 13 }, { x: -505, w: 35, h: 22 }, { x: -236, w: 12, h: 7.5 },
  { x: 150, w: 56, h: 35.5 }, { x: 243, w: 13, h: 8 }, { x: 688, w: 26, h: 16 },
];

function dropPath(g, w, h, lean = 0) {
  g.beginPath();
  g.moveTo(-w, 1.6);
  g.bezierCurveTo(-w * 1.04, -h * 0.74, -w * 0.56 + lean, -h, lean, -h);
  g.bezierCurveTo(w * 0.56 + lean, -h, w * 1.04, -h * 0.74, w, 1.6);
  g.quadraticCurveTo(0, 5.5, -w, 1.6);
  g.closePath();
}

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** the margin is not a compass line: it wanders a pixel or two either side of the arc. Returns eo(U) in px (|eo| < 2). */
function edgeProfile(a) {
  const n = L.makeNoise('s01edge');
  const half = Math.ceil(a.R * a.span(PAD + 200)) + 8;
  const lut = new Float32Array(half * 2 + 1);
  for (let i = 0; i < lut.length; i++) { const U = i - half; lut[i] = 1.2 * n.n2(U / 230, 0.5) + 0.5 * n.n2(U / 51, 7.5); }
  return (U) => lut[L.clamp(Math.round(U) + half, 0, lut.length - 1)];
}

/**
 * The thin margin of the blade, where light gets through: the tissue glows yellow-green, the net of fine veins stays darker.
 * Computed per pixel in polar coordinates (U along the edge, V inward), only for the band under the arc.
 */
function buildMargin(env, eo) {
  const a = env.arc, nz = L.makeNoise('s01areole'), nb = L.makeNoise('s01patch');
  const DEPTH = 150;
  const X0 = -PAD, X1 = W + PAD;
  const Y0 = Math.floor(a.crestY) - 4, Y1 = Math.ceil(a.yAt(X1, 0)) + DEPTH + 4;
  const w = X1 - X0, h = Y1 - Y0;
  const img = new ImageData(w, h), d = img.data;
  const ramp = L.makeRamp([[0, '#0a4833'], [0.25, '#117a4d'], [0.48, '#22a862'], [0.7, '#62cc6c'], [0.86, '#b4dc6a'], [1, '#eae68c']]);
  for (let j = 0; j < h; j++) {
    const dy = a.cy - (Y0 + j + 0.5);
    for (let i = 0; i < w; i++) {
      const dx = X0 + i + 0.5 - a.cx, rr = Math.sqrt(dx * dx + dy * dy);
      if (rr > a.R + 3 || rr < a.R - DEPTH - 3) continue;
      const U = Math.atan2(dx, dy) * a.R, V = a.R + eo(U) - rr;
      if (V < -1.5 || V > DEPTH) continue;
      const v = Math.max(0, V);
      // the blade is not evenly thin: light reaches deeper in some stretches of the margin than in others
      const reach = 30 + 14 * nb.fbm(U / 260, 0.3, 2);
      const T = Math.exp(-v / reach);
      if (T < 0.02) continue;
      // the net of fine veins: paler than the tissue it fences in (a vein holds less green), and never ruler-straight
      const wu = U + 11 * nb.n2(U / 64 + 40.5, v / 64), wv = v + 8 * nb.n2(U / 64 - 17.1, v / 64 + 23.9);
      const c1 = nz.cell(wu / 42 + 3.7, wv / 36), c2 = nz.cell(wu / 160 - 11.3, wv / 110 + 5.1);
      const v1 = 1 - sstep(0.015, 0.17, c1.edge), v2 = 1 - sstep(0.01, 0.07, c2.edge);
      // it shows clearly only where the tissue is thin enough; some stretches are simply a soft glow
      const show = 0.7 + 0.3 * nb.n2(U / 190 + 9.2, v / 130);
      const net = 0.44 + 0.12 * c1.id + show * T * Math.max(0.4 * v1, 0.56 * v2);
      const lum = Math.min(1, T * net * 1.05);
      const c = ramp(lum);
      const o = (j * w + i) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255 * Math.min(0.95, T * 1.25);
    }
  }
  const c = L.makeCanvas(w, h);
  c.getContext('2d').putImageData(img, 0, 0);
  return { c, x: X0, y: Y0 };
}

/** one bead of dew in local coordinates (origin on the margin, −y outward). side = +1 / −1: where the light comes from */
function drawDrop(g, q, side) {
  const { w, h } = q, lean = -side * w * 0.05;
  // the light the bead gathers and throws onto the margin under it
  g.save(); g.globalCompositeOperation = 'screen';
  g.fillStyle = L.radial(g, -side * w * 0.22, 2, 0, w * 1.25, [[0, 'rgba(226,228,130,0.5)'], [0.35, 'rgba(110,206,112,0.24)'], [1, 'rgba(47,191,113,0)']]);
  g.beginPath(); g.rect(-w * 1.4, 0.6, w * 2.8, w * 1.3); g.fill();
  g.restore();

  g.save(); dropPath(g, w, h, lean); g.clip();
  // a bead is a lens: it holds the scene behind it upside-down — the dark blade on top, then the lit edge, then the air
  const yh = -h * 0.7, Rc = w * 2.5, cx0 = side * w * 0.12;
  g.fillStyle = L.linear(g, 0, -h, 0, yh + 2, [[0, '#0a4a34'], [1, '#1c8f58']]);
  g.fillRect(-w - 6, -h - 6, w * 2 + 12, h + 16);
  g.fillStyle = L.radial(g, cx0, yh - Rc, Rc - 1.6, Rc + h * 0.82, [
    [0, 'rgba(28,143,88,0)'], [0.1, '#f7d568'], [0.17, '#eccb58'], [0.3, '#b4d260'], [0.46, '#52c66c'], [0.68, '#25a864'], [0.88, '#15824f'], [1, '#0f6b46']]);
  g.fillRect(-w - 6, -h - 6, w * 2 + 12, h + 16);
  // toward its outline the bead looks past the light and deepens — soft, never a drawn line
  g.filter = `blur(${Math.max(1.2, w * 0.1).toFixed(2)}px)`;
  dropPath(g, w, h, lean);
  g.strokeStyle = 'rgba(4,40,27,0.5)'; g.lineWidth = Math.max(2.4, w * 0.17); g.stroke();
  g.filter = 'none';
  // a warm pool where the light leaves the bead, low on the side away from the sun
  g.fillStyle = L.radial(g, -side * w * 0.36, -h * 0.2, 0, w * 0.5, [[0, 'rgba(236,232,140,0.55)'], [0.5, 'rgba(120,210,112,0.22)'], [1, 'rgba(47,191,113,0)']]);
  g.fillRect(-w - 6, -h - 6, w * 2 + 12, h + 16);
  g.restore();

  // the thin lit skin of the dome, strongest toward the light
  const skin = side > 0
    ? [[0, 'rgba(242,193,78,0.16)'], [0.55, 'rgba(255,236,170,0.7)'], [1, 'rgba(255,246,208,1)']]
    : [[0, 'rgba(255,246,208,1)'], [0.45, 'rgba(255,236,170,0.7)'], [1, 'rgba(242,193,78,0.16)']];
  dropPath(g, w, h, lean);
  g.strokeStyle = L.linear(g, -w, 0, w, 0, skin);
  g.globalAlpha = 0.22; g.lineWidth = 3.4; g.stroke();
  g.globalAlpha = 1; g.lineWidth = 1.15; g.stroke();
  // the glint: the one place the sun itself is mirrored
  const gx = side * w * 0.44 + lean, gy = -h * 0.63, gr = Math.max(1.5, w * 0.085);
  g.fillStyle = L.radial(g, gx, gy, 0, gr * 5, [[0, 'rgba(255,246,208,0.8)'], [0.22, 'rgba(252,222,136,0.36)'], [1, 'rgba(242,193,78,0)']]);
  g.fillRect(gx - gr * 5, gy - gr * 5, gr * 10, gr * 10);
  g.fillStyle = '#fffbe8';
  g.beginPath(); g.ellipse(gx, gy, gr * 1.25, gr * 0.8, side * -0.55, 0, L.TAU); g.fill();
}

/** macro depth of field: the crest is in focus, the edge softens toward both ends of the frame and the blade toward the bottom */
function focusPull(src, fx, fy) {
  const w = src.width, h = src.height;
  const keep = (img, r0, r1) => {
    const c = L.makeCanvas(w, h), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.translate(fx + PAD, fy + PAD); g.scale(1, 0.8);
    g.fillStyle = L.radial(g, 0, 0, r0, r1, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(-w * 2, -h * 2, w * 4, h * 4);
    return c;
  };
  const out = L.blurred(src, 8.5);
  const g = out.getContext('2d');
  g.drawImage(keep(L.blurred(src, 3.2), 430, 1010), 0, 0);
  g.drawImage(keep(src, 190, 660), 0, 0);
  return out;
}

/** everything that belongs to the leaf and slides with it: blade, veins, lit hairs on the margin, dew */
function buildLeaf(env) {
  const a = env.arc;
  const span = a.span(PAD + 140), half = a.R * span;
  const full = (g) => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  const eo = edgeProfile(a);
  const margin = buildMargin(env, eo);
  const bladePath = (g) => {
    g.beginPath();
    for (let U = -half, first = true; U <= half; U += 5, first = false) { const p = a.pt(U / a.R, eo(U)); if (first) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); }
    g.lineTo(W + PAD + 500, H + PAD + 500); g.lineTo(-PAD - 500, H + PAD + 500); g.closePath();
  };

  // three faint lateral veins: parallel, all leaning the same way (toward the leaf tip, off to the right), bending forward as they
  // near the margin. They are only a soft sheen on raised tissue — wide, blurred, gone long before the bottom of the frame.
  const veins = L.blurred(L.makeLayer(PAD, (vg) => {
    const nv = L.makeNoise('s01vein');
    vg.lineCap = 'round';
    [[-0.205, 1], [0.088, 0.72], [0.335, 0.9]].forEach(([t1, str], n) => {
      const d0 = 640, dT = 0.2, N = 170;
      const at = (u) => {
        const th = t1 - dT + dT * (0.6 * u + 0.4 * Math.pow(u, 2.6));
        const dep = 26 + d0 * Math.pow(1 - u, 1.22);
        const wob = 10 * nv.n2(u * 3.6 + n * 9.1, n * 3.3) * (1 - u) + 2.5 * nv.n2(u * 13 + n * 4.7, 8.8);
        return a.pt(th + wob / a.R, -dep);
      };
      for (let pass = -1; pass < 3; pass++) {
        for (let i = 0; i < N; i++) {
          const u0 = i / N, p0 = at(u0), p1 = at(Math.min(1, (i + 1.4) / N));
          const dep = 26 + d0 * Math.pow(1 - u0, 1.22);
          const al = (1 - L.smooth((dep - 150) / 300)) * str * (0.78 + 0.22 * nv.n2(u0 * 8 + 4.4, n * 5.1));
          const wd = L.lerp(23, 5, Math.pow(u0, 0.75));
          const tip = L.smooth((1 - u0) / 0.2);
          let ox = 0, oy = 0;
          if (pass === -1) {                      // a raised rib: its far side falls into shadow
            let nx = -(p1.y - p0.y), ny = p1.x - p0.x; const nl = Math.hypot(nx, ny) || 1;
            if (nx * (p0.x - a.cx - LIGHT_X) + ny * (p0.y - a.crestY) < 0) { nx = -nx; ny = -ny; }
            ox = (nx / nl) * wd * 0.6; oy = (ny / nl) * wd * 0.6;
            vg.strokeStyle = `rgba(1,9,6,${(0.3 * al * tip).toFixed(4)})`; vg.lineWidth = wd * 0.9;
          } else if (pass === 2) {                // where the blade thins toward the margin the vein lets the light through
            const lit = Math.exp(-dep / 46) * L.smooth((1 - u0) / 0.06);
            if (lit < 0.02) continue;
            vg.strokeStyle = L.rgba('#a6d868', 0.3 * lit * str); vg.lineWidth = wd * 0.5;
          } else {
            vg.strokeStyle = pass ? L.rgba('#279462', 0.09 * al * tip) : L.rgba('#12684a', 0.16 * al * tip);
            vg.lineWidth = (pass ? 0.4 : 1) * wd;
          }
          vg.beginPath(); vg.moveTo(p0.x + ox, p0.y + oy); vg.lineTo(p1.x + ox, p1.y + oy); vg.stroke();
        }
      }
    });
  }), 4.5);

  // the margin catching the light: a hairline of gold whose weight never repeats, and short dense hairs pointing outward
  // (kept on a strip just tall enough for the edge, so its bloom is cheap)
  const hy0 = Math.floor(a.crestY - 72), hy1 = Math.ceil(a.yAt(W + PAD, 0) + 36);
  const hair = L.makeCanvas(W + PAD * 2, hy1 - hy0);
  {
    const hg = hair.getContext('2d');
    hg.translate(PAD, -hy0);
    const hn = L.makeNoise('s01hairline'), r = L.rng('s01hair');
    hg.lineCap = 'round';
    for (let U = -half; U < half; U += 3) {
      const n1 = hn.n2(U / 96, 1.3), n2 = hn.n2(U / 21, 5.7);
      const p0 = a.pt(U / a.R, eo(U) + 0.3), p1 = a.pt((U + 3.8) / a.R, eo(U + 3.8) + 0.3);
      hg.strokeStyle = `rgba(255,238,180,${(0.74 + 0.22 * n1).toFixed(3)})`;
      hg.lineWidth = Math.max(0.9, 1.9 + 0.95 * n1 + 0.45 * n2);
      hg.beginPath(); hg.moveTo(p0.x, p0.y); hg.lineTo(p1.x, p1.y); hg.stroke();
    }
    for (let U = -half; U < half; U += r.range(1.2, 3.2)) {
      const dens = 0.62 + 0.38 * hn.n2(U / 150, 9.1);                 // the down grows in patches
      if (r() > dens + 0.12) continue;
      let len = (5.5 + 15 * Math.pow(r(), 2.2)) * (0.72 + 0.5 * dens);
      if (r.chance(0.05)) len *= 1.8;
      const lean = 0.14 + r.gauss() * 0.25;
      const lw = r.range(0.6, 1.25), bend = r.range(-1.2, 2.4), hot = r.range(0.7, 1);
      a.at(hg, U / a.R, eo(U) - 0.6, () => {
        hg.rotate(lean);
        const gr = hg.createLinearGradient(0, 0, 0, -len);
        gr.addColorStop(0, `rgba(255,230,146,${(0.95 * hot).toFixed(3)})`); gr.addColorStop(0.5, `rgba(255,245,206,${(0.85 * hot).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,246,208,0)');
        hg.strokeStyle = gr; hg.lineWidth = lw;
        hg.beginPath(); hg.moveTo(0, 0.6); hg.quadraticCurveTo(bend * 0.35, -len * 0.5, bend, -len); hg.stroke();
      });
    }
  }

  const sharp = L.makeLayer(PAD, (g) => {
    // ── the blade ──
    g.save(); bladePath(g); g.clip();
    const D = 1000;
    const body = [[0, '#10684a'], [5, '#0d573d'], [16, '#0a432f'], [36, '#083223'], [72, '#06261b'], [150, '#051d14'], [380, '#041710'], [1000, '#03120c']];
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - D, a.R + 2.5, body.map(([d, c]) => [(D - d) / (D + 2.5), c]).reverse());
    full(g);
    // slow undulation of the blade: here and there the ink-green lifts by a breath
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's01blade', scale: 360, sx: 3.2, sy: 1, octaves: 3, contrast: 1.5, res: 0.2,
      ramp: [[0, 'rgba(0,0,0,0.3)'], [0.45, 'rgba(0,0,0,0)'], [0.6, 'rgba(10,52,36,0)'], [1, 'rgba(12,62,43,0.34)']] }), -PAD, -PAD);
    g.drawImage(veins, -PAD, -PAD);
    g.drawImage(margin.c, margin.x, margin.y);
    g.restore();

    // ── the lit hairs, with the bloom every bright thing gets in a lens ──
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.5; g.drawImage(L.blurred(hair, 13), -PAD, hy0);
    g.globalAlpha = 0.6; g.drawImage(L.blurred(hair, 4), -PAD, hy0);
    g.restore();
    g.drawImage(hair, -PAD, hy0);

    // ── dew: flat round beads stuck to the margin ──
    for (const q of DROPS) {
      const th = q.x / a.R;
      const side = -L.clamp((q.x - LIGHT_X) / 240, -1, 1) || 1;          // the glint sits on the side facing the light behind the crest
      a.at(g, th, eo(q.x), () => drawDrop(g, q, side < 0 ? -1 : 1));
    }
  });
  return focusPull(sharp, a.cx + FOCUS_X, a.crestY);
}

export function initOpening(env) {
  const a = env.arc;
  if (S && S.R === a.R && S.crestY === a.crestY) return S;
  // order of the glints: from the crest outward, like the light itself
  const order = DROPS.map((q, i) => i).sort((i, j) => Math.abs(DROPS[i].x - LIGHT_X) - Math.abs(DROPS[j].x - LIGHT_X));
  const flash = DROPS.map((q, i) => 0.16 + 0.68 * (order.indexOf(i) / (DROPS.length - 1)));
  S = { R: a.R, crestY: a.crestY, leaf: buildLeaf(env), flash };
  return S;
}

/**
 * tilt: px the camera has tilted UP (the whole picture slides down by this much). 0 = the opening framing.
 * k:    0..1 progress of the light itself (the glow spreads from the crest to both sides and widens; the dew glints in turn).
 */
export function drawOpening(ctx, env, { tilt = 0, k = 0 } = {}) {
  const a = env.arc; const s = initOpening(env);
  k = L.clamp(k);
  const e = L.smooth(k);
  const rot = L.lerp(-0.003, 0.003, k);
  const wide = L.lerp(0.88, 1.08, e);
  const lx = a.cx + LIGHT_X;
  ctx.save();
  ctx.translate(0, tilt);
  const full = () => ctx.fillRect(-PAD, -tilt - PAD, W + PAD * 2, H + PAD * 2 + tilt);

  // the air: concentric bands hugging the leaf edge, running up into a clean dark
  ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 10, a.R + SKY_TOP, SKY.map(([dr, c]) => [(Math.min(SKY_TOP, dr > 0 ? dr * wide : dr) + 10) / (SKY_TOP + 10), c]));
  full();
  // the light is right behind the crest: a long low bloom lying along the edge
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  ctx.translate(lx, a.crestY - 4); ctx.scale(L.lerp(3.2, 4.6, e), 1.15);
  ctx.fillStyle = L.radial(ctx, 0, 0, 0, 210, [[0, `rgba(255,218,116,${L.lerp(0.6, 0.8, e)})`], [0.2, `rgba(248,202,90,${L.lerp(0.34, 0.48, e)})`], [0.5, `rgba(196,208,94,${L.lerp(0.1, 0.15, e)})`], [1, 'rgba(47,191,113,0)']]);
  ctx.fillRect(-220, -220, 440, 440);
  ctx.restore();

  // the leaf (blade, lit hairs, dew) slides a hair's breadth along the arc
  L.blit(ctx, env, s.leaf, { rot });

  // the lens veils a little where the edge is brightest: light spills across the margin onto the dark blade
  const v = L.lerp(0.06, 0.1, e);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 96, a.R + 64, [[0, 'rgba(47,191,113,0)'], [0.42, `rgba(84,204,116,${v * 0.42})`], [0.6, `rgba(226,214,112,${v})`], [0.72, `rgba(120,212,116,${v * 0.4})`], [1, 'rgba(47,191,113,0)']]);
  full();
  ctx.restore();

  // light spreading from the crest toward both ends of the edge
  const sig = L.lerp(580, 1080, e), sideCol = L.mix('#839c82', '#d2ecda', e);
  const stops = [];
  for (let i = 0; i <= 16; i++) { const x = (i / 16) * W, wgt = 1 - Math.exp(-0.5 * Math.pow((x - lx) / sig, 2)); stops.push([i / 16, L.mix('#ffffff', sideCol, wgt)]); }
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = L.linear(ctx, 0, 0, W, 0, stops);
  full();
  ctx.restore();

  // where the light is about to break over the edge, a little more of it soaks through the blade
  ctx.save(); ctx.translate(lx, a.crestY + 8); ctx.scale(1.7, 1);
  L.glow(ctx, 0, 0, 300, '#3fd07f', L.lerp(0.07, 0.12, e));
  ctx.restore();

  // the dew glints, one after another: no drawn star, just the highlight blooming for a moment
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  DROPS.forEach((q, i) => {
    const f = Math.exp(-Math.pow((k - s.flash[i]) / 0.08, 2));
    if (f < 0.02) return;
    const th = q.x / a.R, side = q.x - LIGHT_X > 0 ? -1 : 1;
    const soft = L.clamp((Math.abs(q.x - FOCUS_X) - 260) / 560);       // out-of-focus beads flash as a soft disc
    const dr = q.h * 0.63, p = a.pt(th + rot + (side * q.w * 0.42) / (a.R + dr), dr);
    const rr = (20 + q.w * 1.9) * (0.55 + 0.45 * f) * (1 + 0.5 * soft);
    const core = L.lerp(0.1, 0.24, soft);
    ctx.fillStyle = L.radial(ctx, p.x, p.y, 0, rr, [[0, `rgba(255,251,230,${f})`], [core, `rgba(255,240,182,${0.72 * f})`], [0.5, `rgba(242,193,78,${0.17 * f})`], [1, 'rgba(242,193,78,0)']]);
    ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
  });
  ctx.restore();
  ctx.restore();
}

export const TITLE_TILT = 760;

export default {
  name: '草木晨光',
  tone: 'light',
  init(env) { initOpening(env); },
  draw(ctx, env, p) { drawOpening(ctx, env, { tilt: 0, k: p }); },
};
