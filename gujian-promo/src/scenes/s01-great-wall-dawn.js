// s01 — 长城·晨曦. The opening "horizon": first light behind a mountain ridge carrying the Great Wall.
// Also exports drawDawn() so the title card can tilt back down onto exactly this image (the film loops).
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 220;
let S = null; // cached layers

// sky colour by height above the arc (px): 朱砂 at the horizon → 妃色 → 雪青 → 群青/石青 → 玄青. (明黄 is saved for s02.)
// dr ≥ 470 must stay ≤ #122c62 and dr ≥ 650 ≤ #0a1430: the title card tilts 720 px up into that space and sets its type there.
const SKY = [
  [-14, '#3a0a05'], [-12, '#a81a0c'], [0, '#e2361a'], [10, '#f24f1e'], [28, '#f66f2e'], [60, '#f48a55'], [100, '#eb9a86'], [145, '#cf98ad'],
  [190, '#948fc6'], [240, '#5a84c8'], [300, '#2f66b3'], [380, '#1d4990'], [470, '#122c62'], [650, '#0a1430'], [1000, '#06080f'], [1700, '#05060a'],
];
const WALL = '#0a0504';      // the silhouette
const RIM = '#7a2a14';       // dull red the sky lays on upward-facing brick
const MERLON = { spacing: 29, dr: -11 }; // 垛墙 20 wide, 垛口 9 wide, 11 tall → their TOPS are the shared arc (dr = 0)
const wallSpan = (a) => a.span(PAD + 80);
const RAYS = [[-1.13, 120, 1.6], [-0.56, 190, 2.0], [-0.09, 150, 1.5], [0.4, 215, 2.1], [0.98, 135, 1.6]]; // [angle from straight up, length px, half-width px]

/** the sun sits in the crenel (垛口) nearest theta 0.045, so the first light bursts through a gap in the battlements */
function sunThetaFor(a) {
  const s = wallSpan(a);
  const th = a.along({ ...MERLON, t0: -s, t1: s }).map((q) => q.theta);
  let best = 0.045, bd = Infinity;
  for (let i = 0; i + 1 < th.length; i++) { const m = (th[i] + th[i + 1]) / 2, d = Math.abs(m - 0.045); if (d < bd) { bd = d; best = m; } }
  return best;
}

function buildWall(env, sunTheta) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const s = wallSpan(a);
    g.fillStyle = WALL;
    // wall body riding the ridge line; the whole wall sits low enough that the merlon tops ARE the arc
    // (level coping above; below, an uneven footing of stone and scrub so the foot of the wall is not a ruled line)
    const nf = L.makeNoise('s01foot');
    g.beginPath(); a.trace(g, -11, -s, s);
    for (let i = 0; i <= 640; i++) {
      const th = L.lerp(s, -s, i / 640);
      const p = a.pt(th, -37.5 - 3 * nf.fbm(th * 150, 1.7, 3) - 6 * Math.max(0, nf.n2(th * 46, 8.2) - 0.4));
      g.lineTo(p.x, p.y);
    }
    g.closePath(); g.fill();
    // merlons (垛墙) on the outward parapet only; the crenels (垛口) between them are narrower than the merlons
    a.along({ ...MERLON, t0: -s, t1: s }, (q) => {
      a.at(g, q.theta, -11, () => { g.fillRect(-10, -11, 20, 12); });
    });
    // the top faces of the merlons take a dull red from the sky (only where there is brick)
    g.save(); g.globalCompositeOperation = 'source-atop'; g.strokeStyle = RIM; g.lineWidth = 2; a.stroke(g, -0.5, -s, s); g.restore();
    // watchtowers (空心敌台): a square brick platform astride the wall, three arched arrow windows per face, a ring of small merlons on top
    const tower = (theta, k) => {
      a.at(g, theta, -13, () => {
        g.scale(k, k);
        g.fillStyle = WALL;
        // near-vertical body with a slight batter
        g.beginPath(); g.moveTo(-36, 3); g.lineTo(-33.5, -56); g.lineTo(33.5, -56); g.lineTo(36, 3); g.closePath(); g.fill();
        g.fillRect(-35, -58, 70, 2); // brick cornice, barely proud of the wall face
        // 铺房 on the main tower only: a small gabled (硬山) house standing behind the parapet
        if (k > 1.2) {
          g.fillRect(-15, -80, 30, 22);
          g.beginPath();
          g.moveTo(-10, -92); g.lineTo(10, -92);                     // level ridge
          g.quadraticCurveTo(15, -84.5, 23, -80.5);                  // gently concave slope out to the eave
          g.lineTo(23, -78.5); g.lineTo(-23, -78.5); g.lineTo(-23, -80.5);
          g.quadraticCurveTo(-15, -84.5, -10, -92);
          g.closePath(); g.fill();
          g.fillRect(-11, -94, 22, 2.5);                             // 正脊
        }
        // parapet: seven small merlons, the same grain as those along the wall
        for (let i = 0; i < 7; i++) g.fillRect(-33.5 + i * 10, -64, 7, 6.5);
        // arched arrow windows let the dawn through
        g.globalCompositeOperation = 'destination-out';
        for (let i = -1; i <= 1; i++) {
          const x = i * 20;
          g.beginPath(); g.moveTo(x - 3.5, -30); g.lineTo(x - 3.5, -41.5); g.arc(x, -41.5, 3.5, Math.PI, 0); g.lineTo(x + 3.5, -30); g.closePath(); g.fill();
        }
        // sky-red on the upward faces, and a thread of it down the flank that looks toward the sun
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = RIM;
        for (let i = 0; i < 7; i++) g.fillRect(-33.5 + i * 10, -64, 7, 1.3 / k);
        if (k > 1.2) {
          g.strokeStyle = RIM; g.lineWidth = 2.6 / k; g.lineJoin = 'round';
          g.beginPath(); g.moveTo(-23, -80.5); g.quadraticCurveTo(-15, -84.5, -10, -92); g.lineTo(-11, -94); g.lineTo(11, -94); g.lineTo(10, -92); g.quadraticCurveTo(15, -84.5, 23, -80.5); g.stroke();
        }
        const side = theta < sunTheta ? 1 : -1;
        const near = L.clamp(1.25 - Math.abs(theta - sunTheta) / 0.34, 0.25, 1);
        g.strokeStyle = L.rgba(RIM, 0.85 * near); g.lineWidth = 2.4 / k;
        g.beginPath(); g.moveTo(side * 36, 3); g.lineTo(side * 33.5, -56); g.stroke();
        g.globalCompositeOperation = 'source-over';
      });
    };
    tower(-0.128, 1.35);
    tower(0.232, 0.8);
    tower(-0.335, 1.0);
    tower(0.41, 0.6);
  });
}

function buildLand(env, sunX) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const X0 = -PAD, X1 = W + PAD, N = 480, TH = 260;
    // Runnels and spurs hanging from a crest line: dark gullies, faintly lit spurs, fading with depth below the crest. The streaks
    // follow the fall line (they lean away from each summit, by the smoothed slope of the crest) instead of dropping like a curtain.
    // Every mass gets its own texture, so the grain breaks at each ridge line.
    const hang = (seed, scale, tint, yFn) => {
      const res = 0.6, tw = Math.round((X1 - X0) * res), th = Math.round(TH * res);
      const lean = new Float32Array(tw);
      for (let px = 0; px < tw; px++) { const x = X0 + px / res; lean[px] = 0.5 * L.clamp((yFn(x + 150) - yFn(x - 150)) / 300, -0.9, 0.9); }
      const nzg = L.makeNoise(seed), [tr, tgn, tb] = L.parseColor(tint);
      const img = new ImageData(tw, th), d = img.data;
      const fx = 1 / (scale * 0.9), fy = 1 / (scale * 2.6);
      let o = 0;
      for (let py = 0; py < th; py++) {
        const dep = py / res, t = dep / TH, fade = t < 0.3 ? 1 - 0.2 * t / 0.3 : 0.8 * (1 - (t - 0.3) / 0.7);
        for (let px = 0; px < tw; px++, o += 4) {
          let u = (px / res - lean[px] * dep) * fx, v = dep * fy;
          const wu = nzg.n2(u / 2.5 + 31.4, v / 2.5 + 7.7), wv = nzg.n2(u / 2.5 - 11.9, v / 2.5 + 53.1);
          u += 0.5 * wu; v += 0.5 * wv;
          const n = L.clamp(nzg.fbm(u, v, 4, 2, 0.55) * 0.85 + 0.5);
          if (n < 0.5) { d[o] = 3; d[o + 1] = 2; d[o + 2] = 5; d[o + 3] = 255 * 0.62 * (1 - n * 2) * fade; }
          else if (n > 0.72) { d[o] = tr; d[o + 1] = tgn; d[o + 2] = tb; d[o + 3] = 255 * 0.08 * ((n - 0.72) / 0.28) * fade; }
        }
      }
      const small = L.makeCanvas(tw, th); small.getContext('2d').putImageData(img, 0, 0);
      const tex = L.makeCanvas(X1 - X0, TH), tg = tex.getContext('2d');
      tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high'; tg.drawImage(small, 0, 0, X1 - X0, TH);
      for (let x = X0; x < X1; x += 2) g.drawImage(tex, x - X0, 0, 2, TH, x, Math.round(yFn(x + 1)) + 1, 2, TH);
    };
    // the mountain the wall stands on: 赭绛 where the dawn reflects off it just under the wall, sinking through plum to blue-black
    g.save(); a.clipBelow(g, -12);
    const deep = 760, at = (dr) => (-dr - 36) / (deep - 36);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 36, a.R - deep, [[0, '#2a100e'], [at(-120), '#180c14'], [at(-260), '#0d0a14'], [at(-520), '#070810'], [1, '#050508']]);
    g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 3);
    hang('s01gullyW', 40, '#ff7a50', (x) => a.yAt(x, -36));
    // nearer ridges stepping down toward the camera; the haze between them cools from ember red to 石青 as it leaves the light
    const nz = L.makeNoise('s01ridge');
    const ridges = [[70, 0.9, '#1a0c12', [190, 60, 40], 0.2, '#ff7a5a'], [170, 1.6, '#110a12', [120, 50, 96], 0.15, '#d878a8'],
      [300, 2.4, '#0a0810', [52, 70, 140], 0.12, '#8c8ce0'], [450, 3.1, '#050508', [30, 48, 104], 0.1, '#6f86d8']];
    const Q = 4, bw = Math.ceil((X1 - X0) / Q), bh = Math.ceil((H + PAD * 2) / Q); // the mist is worked out at quarter resolution
    ridges.forEach(([drop, freq, col, mistRGB, mist, tint], k) => {
      const pts = [], disp = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = L.lerp(X0, X1, u);
        const d = (38 + k * 16) * nz.fbm(u * freq * 3 + k * 7.3, k * 3.1, 4);
        const y = a.yAt(L.clamp(x, a.cx - a.R * 0.6, a.cx + a.R * 0.6), 0) + drop + d + (k % 2 ? 1 : -1) * (x - a.cx) * 0.05
          + 3.5 * nz.fbm(u * 90, k * 5.1, 2); // rock / tree-line raggedness
        pts.push([x, y]); disp.push(d);
      }
      const yFn = (x) => { const f = L.clamp((x - X0) / (X1 - X0)) * N, i = Math.min(N - 1, Math.floor(f)); return L.lerp(pts[i][1], pts[i + 1][1], f - i); };
      const trace = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(X1, H + PAD * 2); g.lineTo(X0, H + PAD * 2); g.closePath(); };
      g.save(); trace(); g.clip();
      g.fillStyle = col; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 3);
      g.restore();
      // mist pooled in the valley behind this ridge: thicker where the crest dips and we see further in. The puffs are summed in
      // floats and screened on in ONE pass: the browser dithers every gradient fill with the same ordered pattern, and dozens of
      // faint ones stacked on a near-black ground add up to a visible weave.
      const P = [0, 1, 2].map(() => new Float32Array(bw * bh).fill(1));
      for (let i = 0; i <= N; i += 12) {
        const [x, y] = pts[i];
        const pool = L.clamp(0.75 + disp[i] / 70 + 0.35 * nz.n2(i * 0.021 + k * 3.7, 9.4), 0.3, 1.5);
        const rb = 150 * (0.8 + 0.25 * pool) / Q, al = mist * (k ? 0.56 : 0.44) * pool;
        const bx = (x - X0) / Q - 0.5, by = (y - 8 + PAD) / Q - 0.5;
        for (let j = Math.max(0, Math.floor(by - rb)); j <= Math.min(bh - 1, Math.ceil(by + rb)); j++) {
          for (let i2 = Math.max(0, Math.floor(bx - rb)); i2 <= Math.min(bw - 1, Math.ceil(bx + rb)); i2++) {
            const f = 1 - Math.hypot(i2 - bx, j - by) / rb;
            if (f <= 0) continue;
            for (let c = 0; c < 3; c++) P[c][j * bw + i2] *= 1 - al * f * mistRGB[c] / 255;
          }
        }
      }
      const haze = new ImageData(bw, bh);
      for (let j = 0; j < bw * bh; j++) { for (let c = 0; c < 3; c++) haze.data[j * 4 + c] = 255 * (1 - P[c][j]); haze.data[j * 4 + 3] = 255; }
      const hc = L.makeCanvas(bw, bh); hc.getContext('2d').putImageData(haze, 0, 0);
      g.save(); g.globalCompositeOperation = 'screen'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(hc, X0, -PAD, bw * Q, bh * Q);
      g.restore();
      g.save(); trace(); g.clip(); g.fillStyle = col; g.globalAlpha = 0.8; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 3); g.restore();
      hang('s01gully' + k, 46 + k * 12, tint, yFn);
      // a thread of red light on the slopes that face the glow; gone 700 px either side of the sun
      g.save(); g.globalCompositeOperation = 'screen'; g.lineWidth = 1.5;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], xm = (x0 + x1) / 2;
        const fall = L.clamp(1 - Math.abs(xm - sunX) / 700);
        if (fall <= 0) continue;
        const facing = L.clamp(0.55 + 1.5 * ((y1 - y0) / (x1 - x0)) * Math.sign(sunX - xm), 0.12, 1);
        g.strokeStyle = `rgba(255,110,60,${(0.16 * fall * facing).toFixed(3)})`;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.restore();
    });
    g.restore();
  });
}

function buildClouds(env) {
  // thin strata following the curve of the horizon; they thin out with height
  const a = env.arc;
  const tex = L.polarNoiseLayer(env, PAD, { seed: 's01cloud', scale: 54, sx: 26, sy: 1, octaves: 4, gain: 0.5, contrast: 1.5, res: 0.4,
    ramp: [[0, 'rgba(74,26,60,0.5)'], [0.4, 'rgba(74,26,60,0)'], [0.66, 'rgba(255,196,150,0)'], [1, 'rgba(255,196,150,0.42)']] });
  const g = tex.getContext('2d');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = L.radial(g, a.cx + PAD, a.cy + PAD, a.R, a.R + 330, [[0, 'rgba(0,0,0,1)'], [0.35, 'rgba(0,0,0,0.8)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, 0, tex.width, tex.height);
  return L.blurred(tex, 1.2);
}

function buildStars() {
  // Only the rows y ∈ [-PAD, 202] ever carried visible stars, so the layer is just that strip (same seed, same stars).
  const c = L.makeCanvas(W + PAD * 2, PAD + 202), g = c.getContext('2d');
  g.translate(PAD, PAD);
  const r = L.rng('stars');
  for (let i = 0; i < 260; i++) {
    const x = r.range(-PAD, W + PAD), y = r.range(-1500, 200);
    g.globalAlpha = r.range(0.15, 0.7) * (r.chance(0.08) ? 1.3 : 0.7);
    g.fillStyle = r.pick(['#dfe8ff', '#fff3df', '#ffffff']);
    const s = r.range(0.6, 1.7); g.fillRect(x, y, s, s);
  }
  return c;
}

/** keep only frame rows y0..y1 of a padded layer (less to push through drawImage every frame) */
function rows(layer, y0, y1) {
  y0 = Math.max(-PAD, Math.floor(y0)); y1 = Math.min(H + PAD, Math.ceil(y1));
  const c = L.makeCanvas(layer.width, y1 - y0);
  c.getContext('2d').drawImage(layer, 0, -(y0 + PAD));
  c._y0 = y0;
  return c;
}
/** L.blit for a rows() layer: rot about the arc's centre, zoom about the crest */
function blitRows(ctx, env, layer, rot, zoom) {
  const a = env.arc;
  ctx.save();
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(layer, -PAD, layer._y0);
  ctx.restore();
}

export function initDawn(env) {
  if (S) return S;
  const a = env.arc;
  const sunTheta = sunThetaFor(a);
  // land and wall share one camera move, so they are baked into a single layer
  const ground = buildLand(env, a.pt(sunTheta, 0).x);
  ground.getContext('2d').drawImage(buildWall(env, sunTheta), -PAD, -PAD);
  S = {
    sunTheta,
    ground: rows(ground, a.crestY - 150, H + PAD),
    clouds: rows(buildClouds(env), a.crestY - 345, a.yAt(-PAD, -12) + 10),
    stars: buildStars(),
  };
  return S;
}

/**
 * tilt: px the camera has tilted UP (the whole picture slides down by this much). 0 = the opening framing.
 * k:    0..1 progress of the dawn itself (glow grows, slow drift along the ridge).
 */
export function drawDawn(ctx, env, { tilt = 0, k = 0 } = {}) {
  const a = env.arc; const s = initDawn(env);
  const rot = L.lerp(-0.0035, 0.0035, k), zoom = L.lerp(1.0, 1.02, L.ease.outQuad(k));
  ctx.save();
  ctx.translate(0, tilt);
  // sky: concentric bands hugging the arc
  ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 14, a.R + 1700, SKY.map(([dr, c]) => [(dr + 14) / 1714, c]));
  ctx.fillRect(-PAD, -tilt - PAD, W + PAD * 2, H + PAD * 2 + tilt);
  // stars far above
  ctx.drawImage(s.stars, -PAD, -PAD);
  // strata of cloud
  ctx.save(); a.clipAbove(ctx, -12);
  ctx.globalAlpha = 0.85; blitRows(ctx, env, s.clouds, rot * 2.2, zoom);
  ctx.restore();
  // first light: the sun's limb is in a crenel of the battlements (it rides with the wall, so it stays in its gap) and inches upward
  const q = a.pt(s.sunTheta + rot, L.lerp(-6.5, -3.5, k));
  const sun = { x: a.cx + (q.x - a.cx) * zoom, y: a.crestY + (q.y - a.crestY) * zoom };
  const gl = 0.55 + 0.45 * k;
  L.glow(ctx, sun.x, sun.y, 620, '#ff3d1a', 0.3 * gl);
  L.glow(ctx, sun.x, sun.y, 240, '#ff8a3c', 0.55 * gl);
  L.glow(ctx, sun.x, sun.y, 64, '#fff2cf', 0.95 * gl);
  // the one point of warm white in the picture: a hard core for the bloom to hang on
  ctx.save(); ctx.globalAlpha = Math.min(1, gl * 1.3);
  ctx.fillStyle = L.radial(ctx, sun.x, sun.y, 0, 9, [[0, '#fffaf0'], [0.6, '#fff2cf'], [1, 'rgba(255,214,150,0)']]);
  ctx.beginPath(); ctx.arc(sun.x, sun.y, 9, 0, L.TAU); ctx.fill();
  ctx.restore();
  // land + wall silhouettes
  blitRows(ctx, env, s.ground, rot, zoom);
  // light wrap: the glare spills over the brick. The core burns past the corners of the two merlons that frame it (so it reads as a
  // disc, not as a lit square), a tight bloom sits on top, and a lens of light lying along the wall top eats the edges of the three
  // or four merlons either side.
  ctx.save(); ctx.globalAlpha = Math.min(1, gl * 1.3);
  ctx.fillStyle = L.radial(ctx, sun.x, sun.y, 0, 8, [[0, '#fffaf0'], [0.5, '#fff2cf'], [1, 'rgba(255,214,150,0)']]);
  ctx.beginPath(); ctx.arc(sun.x, sun.y, 8, 0, L.TAU); ctx.fill();
  ctx.restore();
  L.glow(ctx, sun.x, sun.y, 24, '#ffe6b8', 0.7 * gl);
  ctx.save(); ctx.translate(sun.x, sun.y); ctx.rotate(s.sunTheta + rot); ctx.scale(1, 0.2);
  L.glow(ctx, 0, 0, 110, '#ff9a4a', 0.5 * gl);
  ctx.restore();
  // the first rays: a few thin spikes fanning up from the crenel, lengthening as the sun clears the brick
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.translate(sun.x, sun.y); ctx.rotate(s.sunTheta + rot);
  for (const [ang, len, w] of RAYS) {
    const n = len * (0.55 + 0.45 * k);
    ctx.save(); ctx.rotate(ang);
    ctx.fillStyle = L.linear(ctx, 0, 0, 0, -n, [[0, `rgba(255,226,180,${(0.34 * gl).toFixed(3)})`], [0.3, `rgba(255,170,110,${(0.14 * gl).toFixed(3)})`], [1, 'rgba(255,120,70,0)']]);
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(0, -n); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

export default {
  name: '长城·晨曦',
  tone: 'light',
  init(env) { initDawn(env); },
  draw(ctx, env, p) { drawDawn(ctx, env, { tilt: 0, k: p }); },
};

// generic names used by the shared title card (every film's opening shot exports these three)
export { initDawn as initOpening, drawDawn as drawOpening };
export const TITLE_TILT = 720;
