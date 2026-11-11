// s05 — 红墙黄瓦. Six frames of pure colour collision, shot close: flat turquoise sky / a yellow-glazed wall cap (墙帽) on
// the arc / a thin green glazed moulding in the eave's shadow / sunlit vermilion palace-wall plaster filling everything below.
// The arc is the scalloped skyline of the cap: a row of tube-tile humps (+HUMP / −TROUGH px about the arc), rimmed in pale
// gold against a single flat teal so that it is the strongest edge in the frame.
// Nothing is stamped out twice: every tile has its own width, lean, firing colour, wear and damage; the plaster carries
// sun-bleached and re-coated fields, water runs with tide lines, flaked skin and hairline cracks. Focus sits on the crest and
// falls off toward both sides and the bottom of the frame.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 120;          // the move is only a few px of rot, so a modest margin is plenty
const PITCH = 62;         // mean spacing of tile ridges along the arc
const HALF = 17.5;        // mean half-width of a tube tile (筒瓦)
const HUMP = 4.5;         // tube-tile crests rise HUMP above the arc …
const TROUGH = 3;         // … and the pan-tile troughs between them meet the sky TROUGH below it
const EAVE = 76;          // depth of the eave line below the arc (local +y points to the circle centre)
const DISC = 19;          // mean radius of the round tile-end (勾头/瓦当)
const TS = 1.5;           // scale of a drip tongue (滴水) drawn in its 28 × 27 design space
const G0 = EAVE + 45;     // green glazed moulding: top …
const G1 = EAVE + 62;     // … and bottom
const WALL = EAVE + 67;   // the red plaster starts here
const SH = 30;            // depth of the eave's cast shadow on the wall
// the moulded dragon of a tile-end, as much as a 38 px disc can carry: one sinuous relief ridge in a ±10 design space — thin
// tail low on the left, thick body, head high on the right, four leg nubs. It lies on the rising diagonal and tapers, so it
// reads as a creature in low relief rather than as a glyph.
const DRAGON = (() => {
  const N = 18, c = Math.cos(-0.62), sn = Math.sin(-0.62);
  const pts = [], hw = [];
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const ax = -7.8 + 14.2 * t, lat = -4.4 * Math.sin(t * Math.PI * 2) * (0.62 + 0.38 * t);
    pts.push([ax * c - lat * sn, ax * sn + lat * c]);
    hw.push(t < 0.45 ? L.lerp(0.45, 1.75, L.smooth(t / 0.45)) : L.lerp(1.75, 1.2, L.smooth((t - 0.45) / 0.55)));
  }
  const nrm = pts.map((_, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(N - 1, k + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
  });
  const outline = [...pts.map((p, k) => [p[0] + nrm[k][0] * hw[k], p[1] + nrm[k][1] * hw[k]]),
    ...pts.map((p, k) => [p[0] - nrm[k][0] * hw[k], p[1] - nrm[k][1] * hw[k]]).reverse()];
  // legs: short nubs leaving the body, raked back toward the tail
  const legs = [[5, 1], [6, -1], [11, 1], [12, -1]].map(([k, side]) => {
    const p = pts[k], n = nrm[k], tx = n[1], ty = -n[0];
    const dx = n[0] * side - tx * 0.55, dy = n[1] * side - ty * 0.55, d = Math.hypot(dx, dy);
    return [p[0] + n[0] * side * hw[k] * 0.6, p[1] + n[1] * side * hw[k] * 0.6, p[0] + n[0] * side * hw[k] * 0.6 + (dx / d) * 2.5, p[1] + n[1] * side * hw[k] * 0.6 + (dy / d) * 2.5];
  });
  const h = pts[N - 1], hn = nrm[N - 1];
  return { pts, outline, legs, head: [h[0] + hn[1] * 0.9, h[1] - hn[0] * 0.9], snout: [h[0] + hn[1] * 3.1, h[1] - hn[0] * 3.1] };
})();
let S = null;

/** a layer cropped to the part of the frame that has anything in it (y ≥ rg.Y0); draw in frame coordinates */
function cropLayer(rg, draw) {
  const c = L.makeCanvas(rg.RW, rg.RH); const g = c.getContext('2d');
  g.translate(PAD, -rg.Y0);
  if (draw) draw(g, c);
  return c;
}
/** a flat-colour copy of a canvas' alpha */
function tinted(src, color) {
  const c = L.makeCanvas(src.width, src.height); const q = c.getContext('2d');
  q.drawImage(src, 0, 0);
  q.globalCompositeOperation = 'source-in';
  q.fillStyle = color; q.fillRect(0, 0, c.width, c.height);
  return c;
}
/** a wide blur done at half resolution (a quarter of the pixels); returns a canvas the size of `src` */
function softBlur(src, px) {
  const w = src.width, h = src.height;
  const t = L.makeCanvas(w / 2, h / 2); const tg = t.getContext('2d');
  tg.filter = `blur(${px / 2}px)`; tg.drawImage(src, 0, 0, t.width, t.height); tg.filter = 'none';
  const c = L.makeCanvas(w, h); const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(t, 0, 0, w, h);
  return c;
}
/** fill a canvas with a grain tile repeated across it (the seams of pure noise cannot be seen) */
function tileGrain(g, grain, w, h) {
  for (let y = 0; y < h; y += grain.height) for (let x = 0; x < w; x += grain.width) g.drawImage(grain, x, y);
}
const poly = (q, pts, ox = 0, oy = 0) => { q.beginPath(); pts.forEach(([x, y], k) => (k ? q.lineTo(x + ox, y + oy) : q.moveTo(x + ox, y + oy))); q.closePath(); };
/** the ruyi outline of a drip tile in its design space: 28 wide at the top (y = 0), the point at y = 27 */
function tonguePath(q) {
  q.beginPath();
  q.moveTo(-14, 0); q.quadraticCurveTo(0, 3.5, 14, 0);
  q.quadraticCurveTo(16, 9, 8.2, 12.5); q.quadraticCurveTo(7.6, 21, 0, 27);
  q.quadraticCurveTo(-7.6, 21, -8.2, 12.5); q.quadraticCurveTo(-16, 9, -14, 0);
  q.closePath();
}

/**
 * every tile of the cap, laid out "底瓦坐中" (a trough, not a ridge, sits on the centre line) and then made individual:
 * tube tiles (with their round ends and nail caps) and, between each pair, a trough ending in a drip tile.
 */
function layout(a) {
  const r = L.rng('s05lay');
  const s = a.span(PAD + 220);
  const n = Math.ceil((s * a.R) / PITCH) + 1;
  // firing colour: most pieces close to the mean, a quarter old and ochre, a few pale replacements
  const tone = () => { const u = r(); return u < 0.6 ? r.range(-0.25, 0.22) : u < 0.86 ? -r.range(0.35, 0.62) : r.range(0.3, 0.5); };
  const tiles = [];
  for (let i = -n; i < n; i++) {
    const t = tone(), u = r();
    tiles.push({
      i, th: ((i + 0.5) * PITCH + r.range(-3.2, 3.2)) / a.R,
      w: HALF * r.range(0.91, 1.08), rot: L.clamp(r.gauss() * 0.022, -0.05, 0.05), len: r.range(-4, 4),
      tone: t, tone2: L.clamp(t + r.range(-0.3, 0.3), -0.62, 0.5), j: EAVE * 0.46 + r.range(-7, 7), hl: r.range(-0.07, 0.07),
      dim: r.chance(0.3) ? r.range(0.06, 0.24) : 0, dull: r.chance(0.16), nail: !r.chance(0.07),
      dr: DISC * r.range(0.9, 1.07), ddx: r.range(-1.8, 1.8), ddy: r.range(-2, 3), spin: r.range(-0.45, 0.45),
      dtone: L.clamp(t + r.range(-0.25, 0.25), -0.62, 0.5),
      state: u < 0.045 ? 'gone' : u < 0.19 ? 'chip' : 'ok', chipA: r.range(0, L.TAU), chipD: r.range(0.38, 0.74),
    });
  }
  // the pieces in focus must show their age: fix a few states near the crest
  for (const t of tiles) {
    if (t.i === -3 || t.i === 1) { t.state = 'chip'; t.chipA = t.i === 1 ? 0.9 : 2.5; t.chipD = t.i === 1 ? 0.5 : 0.62; }
    if (t.i === 4) t.state = 'gone';
    if (t.i === -1 || t.i === 0 || t.i === 3 || t.i === 5) t.state = 'ok';
  }
  const drips = [];
  for (let k = 0; k < tiles.length - 1; k++) {
    const t0 = tiles[k], t1 = tiles[k + 1], gap = (t1.th - t0.th) * a.R, u = r();
    drips.push({
      k, th: (t0.th + t1.th) / 2, xl: -(gap / 2 - t0.w) - 3, xr: gap / 2 - t1.w + 3,
      sc: TS * r.range(0.93, 1.07), rot: r.gauss() * 0.03, drop: r.range(-2.5, 3), tone: tone(),
      state: u < 0.03 ? 'gone' : u < 0.17 ? 'broken' : 'ok', cut: r.range(0.5, 0.74), cutA: r.range(-0.45, 0.45),
      grime: r(), moss: r.chance(0.1),
    });
  }
  return { tiles, drips };
}

/** relief shading from a grey height map (white = high). (lx,ly) points TOWARD the light on screen. 128 = flat. */
function emboss(height, opts = {}) {
  const { lx = -0.64, ly = -0.77, strength = 3 } = opts;
  const cw = height.width, ch = height.height;
  const src = height.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cw, ch).data;
  const out = new ImageData(cw, ch); const o = out.data;
  for (let y = 0; y < ch; y++) {
    const yu = y > 0 ? y - 1 : 0, yd = y < ch - 1 ? y + 1 : y;
    for (let x = 0; x < cw; x++) {
      const xl = x > 0 ? x - 1 : 0, xr = x < cw - 1 ? x + 1 : x;
      const gx = src[(y * cw + xr) * 4] - src[(y * cw + xl) * 4];
      const gy = src[(yd * cw + x) * 4] - src[(yu * cw + x) * 4];
      const i = (y * cw + x) * 4;
      o[i] = o[i + 1] = o[i + 2] = 128 - (gx * lx + gy * ly) * strength;
      o[i + 3] = 255;
    }
  }
  const t = L.makeCanvas(cw, ch);
  t.getContext('2d').putImageData(out, 0, 0);
  return t;
}

// ───────────────────────── sky ─────────────────────────
function buildSky() {
  const c = L.makeCanvas(W, H); const g = c.getContext('2d');
  // peacock-glaze teal, one flat value (no lift toward the wall, no darkening at the top): the cap must be the brightest thing against it
  g.fillStyle = '#149c95'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(W, H, { seed: 's05sky', amount: 0.17, size: 2 }), 0, 0);
  g.globalAlpha = 0.35;
  tileGrain(g, L.grainTex(W / 2, H / 2, { seed: 's05sky2', amount: 0.14, size: 1 }), W, H);
  return c;
}

// ───────────────────────── red plaster ─────────────────────────
function makeCracks(a) {
  const r = L.rng('s05crack');
  const out = [];
  const s = a.span(PAD + 40);
  const walk = (x, y, ang, steps, w, depth) => {
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      ang += r.gauss() * 0.13;
      if (r.chance(0.05)) ang += r.sign() * r.range(0.3, 0.8);
      const st = r.range(5, 11);
      x += Math.cos(ang) * st; y += Math.sin(ang) * st;
      pts.push([x, y]);
      if (depth < 2 && r.chance(0.045)) walk(x, y, ang + r.sign() * r.range(0.5, 1.3), Math.max(3, Math.floor(steps * r.range(0.25, 0.5))), w * 0.7, depth + 1);
    }
    out.push({ pts, w, a: r.range(0.6, 1), main: depth === 0 });
  };
  for (let i = 0; i < 10; i++) {
    const th = r.range(-s, s), dr = -r.range(WALL + 30, 600);
    const p = a.pt(th, dr);
    // most cracks run down the wall (toward the circle centre), a few wander sideways
    const ang = Math.PI / 2 + th + (r.chance(0.3) ? r.range(-1.4, 1.4) : r.range(-0.35, 0.35));
    walk(p.x, p.y, ang, r.int(26, 64), r.range(0.9, 1.9), 0);
  }
  return out;
}
function strokeCracks(g, cracks, color, alpha, wMul, dx = 0, dy = 0) {
  g.save(); g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const c of cracks) {
    const n = c.pts.length;
    g.globalAlpha = alpha * c.a;
    // hairlines die away toward both ends: the whole length thin, the middle stretches re-stroked wider
    for (const [f0, f1, wm] of [[0, 1, 0.45], [0.12, 0.88, 0.72], [0.28, 0.72, 1]]) {
      const i0 = Math.floor(n * f0), i1 = Math.max(i0 + 2, Math.ceil(n * f1));
      g.lineWidth = c.w * wMul * wm;
      g.beginPath();
      for (let i = i0; i < i1 && i < n; i++) (i > i0 ? g.lineTo(c.pts[i][0] + dx, c.pts[i][1] + dy) : g.moveTo(c.pts[i][0] + dx, c.pts[i][1] + dy));
      g.stroke();
    }
  }
  g.restore();
}
/** an angular flake outline: a lobed, squashed ring of straight-edged facets */
function flakePts(r, cx, cy, rad) {
  const n = Math.max(6, Math.round(5 + rad * 0.42) + r.int(0, 3));
  const el = r.range(0.5, 1), rt = r.range(0, Math.PI), c = Math.cos(rt), s = Math.sin(rt);
  const ph = r.range(0, L.TAU), lob = r.range(0.1, 0.36);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const an = ((k + r.range(-0.32, 0.32)) / n) * L.TAU;
    const rr = rad * (1 + lob * Math.sin(an * 2 + ph)) * r.range(0.64, 1.12);
    const x = Math.cos(an) * rr, y = Math.sin(an) * rr * el;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}
/**
 * where the red skin has let go: a handful of clusters (a few ragged patches fused together, a scatter of chips around
 * them), some of them strung along the cracks. `outer` = the top coat gone, an older chalky coat showing; `core` = down to
 * the pale lime plaster.
 */
function makePeels(a, cracks) {
  const r = L.rng('s05peel');
  const outer = [], core = [];
  const cluster = (x, y, rad, k) => {
    let px = x, py = y;
    for (let i = 0; i < k; i++) {
      const rr = rad * (i ? r.range(0.45, 0.8) : 1);
      outer.push(flakePts(r, px, py, rr));
      if (rr > 13 && r.chance(0.75)) core.push(flakePts(r, px + r.range(-0.2, 0.2) * rr, py + r.range(-0.15, 0.25) * rr, rr * r.range(0.34, 0.55)));
      const an = r.range(0, L.TAU);
      px = x + Math.cos(an) * rad * r.range(0.6, 1.05); py = y + Math.sin(an) * rad * r.range(0.5, 0.95);
    }
    const sat = r.int(3, 6);
    for (let i = 0; i < sat; i++) {
      const an = r.range(0, L.TAU), d = rad * r.range(1.1, 2.6);
      outer.push(flakePts(r, x + Math.cos(an) * d, y + Math.sin(an) * d * 0.9, r.range(1.6, Math.max(3, rad * 0.2))));
    }
  };
  // [theta, depth below the top of the wall, radius, fused patches]
  for (const [th, d, rad, k] of [
    [-0.118, 196, 30, 3], [-0.3, 96, 30, 2], [0.262, 150, 44, 4], [0.03, 84, 10, 1],
    [0.168, 62, 14, 2], [0.37, 84, 24, 2]]) {
    const p = a.pt(th, -(WALL + d));
    cluster(p.x, p.y, rad, k);
  }
  // chips that have sprung off along the cracks
  for (const c of cracks) {
    if (!c.main || !r.chance(0.6)) continue;
    const m = r.int(2, 4);
    for (let i = 0; i < m; i++) {
      const p = c.pts[r.int(2, c.pts.length - 3)];
      const rad = r.range(4, 13);
      outer.push(flakePts(r, p[0] + r.range(-3, 3), p[1] + r.range(-3, 3), rad));
      if (rad > 9) core.push(flakePts(r, p[0], p[1], rad * 0.45));
    }
  }
  return { outer, core };
}

function buildPlaster(env, rg, g, lay) {
  const a = env.arc;
  const { Y0, RW, RH } = rg;
  const tex = (opts) => L.noiseTex(RW, RH, { ...opts, ox: -PAD, oy: Y0, polar: opts.polar ? { cx: a.cx, cy: a.cy, R: a.R } : null });
  const put = (c, alpha = 1, blend = 'source-over') => { g.globalAlpha = alpha; g.globalCompositeOperation = blend; g.drawImage(c, -PAD, Y0, RW, RH); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
  const cracks = makeCracks(a);
  const peels = makePeels(a, cracks);
  let P0 = performance.now(); const pk = (n) => { const t = performance.now(); console.warn('  P ' + n + ' ' + (t - P0).toFixed(0)); P0 = t; };

  g.save(); a.clipBelow(g, -(WALL - 1));
  // base: earthy matte vermilion, brightest just under the cap
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 800, a.R - WALL, [[0, '#9a1a13'], [0.5, '#b2231a'], [1, '#c82c1c']]);
  g.fillRect(-PAD, Y0, RW, RH);
  // sun from the upper left
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = L.linear(g, -PAD, 0, W + PAD, 0, [[0, 'rgba(255,160,140,0.42)'], [0.42, 'rgba(255,160,140,0.18)'], [0.7, 'rgba(60,0,0,0.02)'], [1, 'rgba(40,0,6,0.42)']]);
  g.fillRect(-PAD, Y0, RW, RH);
  g.globalCompositeOperation = 'source-over';

  // the big shapes of an old lime-wash: sun-bleached, chalky fields against deeper ones, each with a decided edge
  put(tex({ seed: 's05fade', scale: 430, octaves: 3, warp: 0.9, res: 0.2, contrast: 2.7,
    ramp: [[0, 'rgba(104,13,11,0.44)'], [0.28, 'rgba(104,13,11,0.26)'], [0.42, 'rgba(104,13,11,0)'], [0.55, 'rgba(210,64,44,0)'], [0.62, 'rgba(210,64,44,0.24)'], [1, 'rgba(210,64,44,0.36)']] }));
  // damp that dried and left its tide line
  put(tex({ seed: 's05stain', scale: 190, octaves: 4, warp: 1.1, res: 0.33, contrast: 1.9,
    ramp: [[0, 'rgba(84,10,8,0)'], [0.58, 'rgba(84,10,8,0)'], [0.66, 'rgba(84,10,8,0.2)'], [1, 'rgba(84,10,8,0.26)']] }));
  const mottle = tex({ seed: 's05m2', scale: 90, octaves: 4, warp: 0.5, res: 0.25, contrast: 1.5,
    ramp: [[0, 'rgba(108,18,12,0.22)'], [0.42, 'rgba(108,18,12,0)'], [0.66, 'rgba(214,62,40,0)'], [1, 'rgba(214,62,40,0.1)']] });
  put(mottle);
  pk('fields');
  // re-coated fields: later washes brushed on in bands, never quite the colour of the first
  {
    const r = L.rng('s05coat');
    const coats = cropLayer(rg, (q) => {
      for (const [t0, t1, d0, d1, col] of [[0.112, 0.305, 100, 360, '146,16,15'], [-0.36, -0.205, 150, 470, '216,80,58'], [-0.07, 0.03, 250, 520, '150,18,16']]) {
        const edge = [];
        const nT = Math.ceil(((t1 - t0) * a.R) / 22), nD = Math.ceil((d1 - d0) / 22);
        for (let k = 0; k <= nT; k++) { const p = a.pt(L.lerp(t0, t1, k / nT), -(WALL + d0 + r.range(-5, 5))); edge.push([p.x, p.y]); }
        for (let k = 1; k <= nD; k++) { const p = a.pt(t1 + r.range(-4, 4) / a.R, -(WALL + L.lerp(d0, d1, k / nD))); edge.push([p.x, p.y]); }
        for (let k = nT - 1; k >= 0; k--) { const p = a.pt(L.lerp(t0, t1, k / nT), -(WALL + d1 + r.range(-9, 9))); edge.push([p.x, p.y]); }
        for (let k = nD - 1; k >= 1; k--) { const p = a.pt(t0 + r.range(-4, 4) / a.R, -(WALL + L.lerp(d0, d1, k / nD))); edge.push([p.x, p.y]); }
        poly(q, edge); q.fillStyle = `rgba(${col},0.26)`; q.fill();
        q.lineWidth = 3; q.strokeStyle = `rgba(${col},0.16)`; q.stroke();
        // the laps of the brush
        let th = t0;
        while (th < t1) {
          const bw = r.range(46, 92) / a.R;
          q.fillStyle = `rgba(${col},${r.range(0, 0.12).toFixed(3)})`;
          a.pathBand(q, -(WALL + d0 + 4), -(WALL + d1 - 6), th, Math.min(t1, th + bw)); q.fill();
          th += bw;
        }
      }
    });
    g.drawImage(L.blurred(coats, 1.6), -PAD, Y0);
  }

  pk('coats');
  // rain wash: broad soft soiling under the eave, gathered into a few wet zones …
  const wash = tex({ seed: 's05wash', polar: true, scale: 24, sx: 1, sy: 24, octaves: 4, contrast: 2.1, res: 0.3,
    ramp: [[0, 'rgba(92,14,9,0.36)'], [0.36, 'rgba(92,14,9,0)'], [0.68, 'rgba(214,62,40,0)'], [1, 'rgba(214,62,40,0.14)']] });
  const zones = tex({ seed: 's05zone', polar: true, scale: 210, sx: 1, sy: 5, octaves: 3, contrast: 2.2, res: 0.2,
    ramp: [[0, 'rgba(0,0,0,0.06)'], [0.4, 'rgba(0,0,0,0.12)'], [0.62, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,1)']] });
  {
    const wg = wash.getContext('2d'); wg.globalCompositeOperation = 'destination-in';
    wg.drawImage(zones, 0, 0);
    wg.fillStyle = L.radial(wg, a.cx + PAD, a.cy - Y0, a.R - 560, a.R - WALL, [[0, 'rgba(0,0,0,0.1)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']]);
    wg.fillRect(0, 0, RW, RH);
  }
  put(wash);
  // … and the runs themselves: each starts under a drip tile, wanders, thins and dies; dirty ones dark, limy ones pale
  const runs = cropLayer(rg, (q) => {
    const r = L.rng('s05runs');
    for (const d of lay.drips) {
      const near = Math.abs(d.th) < 0.17;                       // in the plane of focus the runs are read one by one
      if (!r.chance(near ? 0.9 : 0.72)) continue;
      const n = r.chance(0.34) ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const len = r.range(46, 250) * (r.chance(0.2) ? 2.2 : 1), w0 = r.range(2, 7) * (k ? 0.55 : 1);
        const light = r.chance(0.36), x0 = r.range(-7, 7) + k * r.range(-13, 13);
        const steps = Math.ceil(len / 11), ph = r.range(0, 6.28), fq = r.range(3, 9), wob = r.range(1.5, 6), drift = r.range(-0.04, 0.04);
        const lp = [], rp = [];
        for (let s = 0; s <= steps; s++) {
          const u = s / steps, y = u * len;
          const cx = x0 + drift * y + Math.sin(u * fq + ph) * wob * u;
          const hw = (w0 / 2) * (1 - u * 0.78) * (0.72 + 0.28 * Math.sin(u * 11 + ph * 2));
          lp.push([cx - hw, y]); rp.push([cx + hw, y]);
        }
        const al = near ? r.range(0.85, 1) : r.range(0.6, 1);
        a.at(q, d.th, -(WALL - 2), () => {
          q.fillStyle = L.linear(q, 0, 0, 0, len, light
            ? [[0, `rgba(230,104,78,${0.62 * al})`], [0.5, `rgba(230,104,78,${0.36 * al})`], [1, 'rgba(230,104,78,0)']]
            : [[0, `rgba(60,7,5,${0.86 * al})`], [0.45, `rgba(60,7,5,${0.5 * al})`], [1, 'rgba(60,7,5,0)']]);
          poly(q, [...lp, ...rp.reverse()]); q.fill();
        });
      }
    }
  });
  g.drawImage(L.blurred(runs, 0.7), -PAD, Y0);

  pk('runs');
  // flaked skin: the older, chalkier coat underneath, and here and there the pale lime plaster itself
  const peelMask = cropLayer(rg, (q) => { q.fillStyle = '#000'; for (const p of peels.outer) { poly(q, p); q.fill(); } });
  const coreMask = cropLayer(rg, (q) => { q.fillStyle = '#000'; for (const p of peels.core) { poly(q, p); q.fill(); } });
  {
    const old = tinted(peelMask, '#c9583f'); const og = old.getContext('2d');
    og.globalCompositeOperation = 'source-atop';
    og.globalAlpha = 0.9; og.drawImage(mottle, 0, 0); og.globalAlpha = 1;
    og.drawImage(tinted(coreMask, '#d39078'), 0, 0);
    // the skin has thickness: its upper-left edge throws a hairline of shadow into the hollow …
    const rim = L.makeCanvas(RW, RH); const rq = rim.getContext('2d');
    rq.drawImage(peelMask, 0, 0); rq.globalCompositeOperation = 'destination-out'; rq.drawImage(peelMask, 2, 2.6);
    og.globalAlpha = 0.78; og.drawImage(tinted(rim, '#5c120c'), 0, 0); og.globalAlpha = 1;
    // … and its lower-right edge, facing the sun, lights up
    rq.globalCompositeOperation = 'copy'; rq.drawImage(peelMask, 1.5, 1.9);
    rq.globalCompositeOperation = 'destination-out'; rq.drawImage(peelMask, 0, 0);
    put(tinted(rim, '#ff9a7c'), 0.6);
    put(old);
  }

  pk('peel');
  // cracks: a handful of long hairlines (sunk, so only a whisper of a lit lip)
  strokeCracks(g, cracks, '#ff8a6a', 0.14, 1, 1.1, 1.1);
  strokeCracks(g, cracks, '#3a0906', 0.8, 1);

  // grit: pits, and sand grains catching the sun
  L.speckle(g, { seed: 's05pit', count: 3600, x: -PAD, y: Y0, w: RW, h: RH, rMin: 0.5, rMax: 2.3, colors: ['#6b150d', '#4a0d08', '#7c1a12'], alpha: [0.2, 0.65] });
  L.speckle(g, { seed: 's05glint', count: 1500, x: -PAD, y: Y0, w: RW, h: RH, rMin: 0.45, rMax: 1.5, colors: ['#e2553a', '#f07050', '#ff9a78'], alpha: [0.15, 0.5] });

  pk('grit');
  // relief, lit from the upper left: trowelled undulation, the drag of the wash brush, sand, pits, and the stepped edges
  // of every flake and crack
  const hc = L.makeCanvas(RW, RH); const hg = hc.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, RW, RH);
  hg.globalAlpha = 0.5; hg.drawImage(tex({ seed: 's05h1', scale: 95, octaves: 3, res: 0.25, contrast: 1.4 }), 0, 0);
  hg.globalAlpha = 0.3; hg.drawImage(tex({ seed: 's05h3', polar: true, scale: 9, sx: 14, sy: 1, octaves: 3, res: 0.4, contrast: 1.6 }), 0, 0);
  hg.globalCompositeOperation = 'overlay';
  const grain = L.grainTex(RW / 2, RH, { seed: 's05hg', amount: 0.85 });
  hg.globalAlpha = 0.24; tileGrain(hg, grain, RW, RH);
  hg.globalAlpha = 0.26; hg.drawImage(grain, 0, 0, RW / 2.5, RH / 2.5, 0, 0, RW, RH);
  hg.globalCompositeOperation = 'source-over'; hg.globalAlpha = 1;
  hg.save(); hg.translate(PAD, -Y0);
  L.speckle(hg, { seed: 's05hp', count: 2200, x: -PAD, y: Y0, w: RW, h: RH, rMin: 0.8, rMax: 2.8, colors: ['#000'], alpha: [0.25, 0.8] });
  L.speckle(hg, { seed: 's05hb', count: 1300, x: -PAD, y: Y0, w: RW, h: RH, rMin: 0.8, rMax: 2.3, colors: ['#fff'], alpha: [0.2, 0.55] });
  strokeCracks(hg, cracks, '#000', 0.95, 1.5);
  hg.restore();
  hg.globalAlpha = 0.3; hg.drawImage(peelMask, 0, 0);
  hg.globalAlpha = 0.25; hg.drawImage(coreMask, 0, 0); hg.globalAlpha = 1;
  put(emboss(hc, { strength: 1.7 }), 0.5, 'overlay');

  pk('relief');
  // a soft hot spot of sunlight left of centre
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = L.radial(g, a.cx - 320, a.crestY + 260, 40, 980, [[0, 'rgba(255,160,140,0.4)'], [1, 'rgba(255,160,140,0)']]);
  g.fillRect(-PAD, Y0, RW, RH);
  // … and the wall falls away into a deeper, cooler red toward the lower right
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, a.cx + 80, a.crestY + 220, W + PAD, H + PAD, [[0, 'rgba(140,90,104,0)'], [1, 'rgba(140,90,104,0.5)']]);
  g.fillRect(-PAD, Y0, RW, RH);
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

/**
 * the eave's cast shadow on the wall, thrown down and to the right by the upper-left sun: a deep band whose lower edge is
 * the row of round tile-ends and pointed drip tongues — every tooth the shadow of its own (leaning, chipped, missing) tile.
 * Returns a black silhouette (crisp core + soft penumbra) to be tinted.
 */
function buildShadow(env, rg, lay) {
  const a = env.arc;
  const sil = cropLayer(rg, (q) => {
    q.fillStyle = '#000';
    a.pathBand(q, -(WALL - 6), -(WALL + SH)); q.fill();
    for (const t of lay.tiles) {
      if (t.state === 'gone') continue;
      a.at(q, t.th, 0, () => { q.beginPath(); q.arc(15 + t.ddx + t.rot * EAVE, WALL + SH + 2 + t.len * 0.5 + t.ddy * 0.5, t.dr, 0, L.TAU); q.fill(); });
    }
    for (const d of lay.drips) {
      if (d.state === 'gone') continue;
      a.at(q, d.th, 0, () => {
        q.translate(16, WALL + SH - 8 + d.drop * 0.5); q.rotate(d.rot); q.scale(d.sc, d.sc * (d.state === 'broken' ? d.cut + 0.08 : 1));
        tonguePath(q); q.fill();
      });
    }
  });
  const out = L.makeCanvas(rg.RW, rg.RH); const q = out.getContext('2d');
  q.drawImage(L.blurred(sil, 1.7), 0, 0);
  q.globalAlpha = 0.4; q.drawImage(softBlur(sil, 12), 0, 0); q.globalAlpha = 1;
  // bounce light from the sunlit wall below thins the shadow toward its lower edge
  q.globalCompositeOperation = 'destination-in';
  q.fillStyle = L.radial(q, a.cx + PAD, a.cy - rg.Y0, a.R - (WALL + SH + 34), a.R - WALL, [[0, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,0.96)']]);
  q.fillRect(0, 0, rg.RW, rg.RH);
  return out;
}

// ───────────────────────── the glazed cap ─────────────────────────
function buildTiles(env, rg, lay) {
  const a = env.arc;
  const { Y0, RW, RH } = rg;
  const { tiles, drips } = lay;
  // per-tile glaze variation: some tiles a paler gold, some more ochre (old and replacement pieces side by side)
  const tint = (c, t) => (t >= 0 ? L.mix(c, '#f6c22e', t) : L.mix(c, '#c9790a', -t));
  const CLAY = '#c79a62', CLAY_D = '#7d5226';
  const base = cropLayer(rg, (q) => {
    // 1) under the eave: the brick cornice lost in shadow
    q.fillStyle = L.radial(q, a.cx, a.cy, a.R - G0, a.R - (EAVE - 10), [[0, '#7a2010'], [0.5, '#571509'], [1, '#3a0d07']]);
    a.pathBand(q, -(EAVE - 10), -(G0 + 1)); q.fill();
    q.lineWidth = 2; q.strokeStyle = 'rgba(140,50,26,0.5)'; a.stroke(q, -(G0 - 9));
    q.strokeStyle = 'rgba(10,2,1,0.6)'; a.stroke(q, -(G0 - 6.8));
    // 2) the thin green glazed moulding, piece by piece — no two lengths fired quite alike
    const r = L.rng('s05green');
    const s = a.span(PAD + 200);
    let th = -s;
    while (th < s) {
      const len = r.range(150, 240) / a.R, tn = r.range(-0.3, 0.26);
      const gt = (c) => (tn >= 0 ? L.mix(c, '#3aa87e', tn) : L.mix(c, '#0e5a40', -tn));
      q.fillStyle = L.radial(q, a.cx, a.cy, a.R - G1, a.R - G0, [[0, gt('#0f4a34')], [0.15, gt('#1f8f6a')], [0.42, gt('#22966f')], [0.5, gt('#45bd8a')], [0.58, gt('#22966f')], [0.85, gt('#1c8361')], [1, gt('#12503a')]]);
      a.pathBand(q, -G0, -G1, th, th + len + 0.0004); q.fill();
      a.at(q, th, 0, () => { q.fillStyle = 'rgba(8,30,20,0.66)'; q.fillRect(-1.1, G0, 2.2, G1 - G0); q.fillStyle = 'rgba(190,255,220,0.22)'; q.fillRect(1.3, G0 + 3, 1.2, G1 - G0 - 6); });
      th += len;
    }
    q.lineWidth = 1.8; q.strokeStyle = 'rgba(150,235,190,0.4)'; a.stroke(q, -(G0 + 7.5));
    q.fillStyle = '#4a0e0a'; a.pathBand(q, -G1, -(WALL + 0.5)); q.fill();
    // soft shadows of the drip tiles falling across the moulding
    q.save(); a.clipBand(q, -G0, -G1);
    for (const d of drips) {
      if (d.state === 'gone') continue;
      a.at(q, d.th, 0, () => { q.fillStyle = L.radial(q, 10, G0 + 2, 1, 20, [[0, 'rgba(4,20,12,0.62)'], [1, 'rgba(4,20,12,0)']]); q.fillRect(-14, G0 - 10, 50, 40); });
    }
    q.restore();
  });

  const glazed = cropLayer(rg, (q) => {
    // 3) pan-tile troughs (板瓦沟)
    q.fillStyle = '#b87408'; a.pathBand(q, -TROUGH, -(EAVE + 3)); q.fill();
    for (const d of drips) {
      const r = L.rng('s05pan' + d.k);
      a.at(q, d.th, 0, () => {
        const xl = d.xl, xr = d.xr, bw = xr - xl, tn = d.tone * 0.6;
        // the tube to the left throws its shadow into the trough
        q.fillStyle = L.linear(q, xl, 0, xr, 0, [[0, tint('#6e3e03', tn)], [0.36, tint('#c4800c', tn)], [0.8, tint('#f0ae1a', tn)], [1, tint('#d8940f', tn)]]);
        q.fillRect(xl, TROUGH, bw, EAVE + 3 - TROUGH);
        q.fillStyle = L.linear(q, 0, TROUGH, 0, EAVE, [[0, 'rgba(255,232,150,0.55)'], [0.2, 'rgba(255,232,150,0)'], [0.6, 'rgba(50,22,0,0)'], [1, `rgba(50,22,0,${(0.25 + 0.35 * d.grime).toFixed(3)})`]]);
        q.fillRect(xl, TROUGH, bw, EAVE + 3 - TROUGH);
        // the courses of pan tiles, each lapping the one below
        q.lineCap = 'round';
        for (let y = TROUGH + r.range(9, 15); y < EAVE - 4; y += r.range(13, 18)) {
          const sag = r.range(4.5, 7), tl = r.range(-1.2, 1.2);
          q.strokeStyle = 'rgba(58,28,0,0.55)'; q.lineWidth = 2.2; q.beginPath(); q.moveTo(xl, y - 2 + tl); q.quadraticCurveTo((xl + xr) / 2, y + sag, xr, y - 2 - tl); q.stroke();
          q.strokeStyle = 'rgba(255,224,128,0.42)'; q.lineWidth = 1.3; q.beginPath(); q.moveTo(xl, y + 0.6 + tl); q.quadraticCurveTo((xl + xr) / 2, y + sag + 2.6, xr, y + 0.6 - tl); q.stroke();
        }
        // what gathers in a gutter: dark silt near the eave
        if (d.grime > 0.55) {
          q.fillStyle = `rgba(44,28,8,${(0.3 + 0.5 * (d.grime - 0.55) / 0.45).toFixed(3)})`;
          q.beginPath(); q.ellipse((xl + xr) / 2 + r.range(-3, 3), EAVE - r.range(8, 16), bw * r.range(0.24, 0.4), r.range(4, 9), 0, 0, L.TAU); q.fill();
        }
      });
    }

    // 4) drip tiles (滴水): ruyi-shaped tongues hanging between and below the round tile-ends
    for (const d of drips) {
      if (d.state === 'gone') continue;                         // lost: the bare lip of the pan tile is all that is left
      const tn = d.tone;
      a.at(q, d.th, 0, () => {
        q.translate(0, EAVE - 1 + d.drop); q.rotate(d.rot); q.scale(d.sc, d.sc);
        const yc = 27 * d.cut;                                   // break line of a snapped tongue
        const jag = [[-17, yc - 6 * d.cutA], [-5, yc + 1.6 - 2 * d.cutA], [-1.5, yc - 1.4], [4, yc + 1.2 + 2 * d.cutA], [17, yc + 6 * d.cutA]];
        q.save();
        if (d.state === 'broken') { q.beginPath(); q.moveTo(-20, -6); jag.forEach(([x, y]) => q.lineTo(x, y)); q.lineTo(20, -6); q.closePath(); q.clip(); }
        q.save(); q.translate(2.2, 3); tonguePath(q); q.fillStyle = 'rgba(0,0,0,0.5)'; q.fill(); q.restore();
        tonguePath(q);
        q.fillStyle = L.linear(q, -10, 0, 8, 27, [[0, tint('#fbd24e', tn)], [0.45, tint('#e6a81c', tn)], [1, tint('#a8690a', tn)]]);
        q.fill();
        q.save(); q.clip();
        q.lineWidth = 2.6; q.strokeStyle = 'rgba(255,242,176,0.72)'; tonguePath(q); q.stroke();
        q.restore();
        // moulded relief: a raised boss with a curl either side
        q.fillStyle = 'rgba(88,46,0,0.55)'; q.beginPath(); q.arc(0.8, 13.3, 4.3, 0, L.TAU); q.fill();
        q.fillStyle = L.radial(q, -1.3, 11, 0.4, 5, [[0, '#fff3ba'], [0.55, tint('#efb62a', tn)], [1, tint('#b87a10', tn)]]);
        q.beginPath(); q.arc(0, 12.3, 3.9, 0, L.TAU); q.fill();
        q.lineWidth = 0.9; q.strokeStyle = 'rgba(60,28,0,0.7)'; tonguePath(q); q.stroke();
        q.restore();
        if (d.state === 'broken') {                              // the fracture: pale biscuit, a dark line where the glaze stops
          q.lineJoin = 'round'; q.lineCap = 'round';
          q.strokeStyle = CLAY; q.lineWidth = 2.2; q.beginPath(); jag.slice(1, 4).forEach(([x, y], k) => (k ? q.lineTo(x, y - 0.8) : q.moveTo(x, y - 0.8))); q.stroke();
          q.strokeStyle = 'rgba(50,24,2,0.7)'; q.lineWidth = 0.7; q.beginPath(); jag.slice(1, 4).forEach(([x, y], k) => (k ? q.lineTo(x, y - 2.2) : q.moveTo(x, y - 2.2))); q.stroke();
        }
      });
    }

    // 5) tube tiles (筒瓦): half-cylinders that roll over the top of the wall — their humps are the skyline
    for (const t of tiles) {
      const r = L.rng('s05tube' + t.i);
      a.at(q, t.th, 0, () => {
        q.rotate(t.rot);
        const w = t.w, yb = EAVE + t.len;
        // the shadow it throws into the trough on its right
        q.fillStyle = L.linear(q, w - 2, 0, w + 11, 0, [[0, 'rgba(40,18,0,0.6)'], [1, 'rgba(40,18,0,0)']]);
        q.fillRect(w - 2, HUMP + 4, 13, yb - HUMP - 12);
        const body = () => { q.beginPath(); q.moveTo(-w, yb); q.lineTo(-w, HUMP); q.ellipse(0, HUMP, w, HUMP * 2, 0, Math.PI, 0); q.lineTo(w, yb); q.closePath(); };
        const hp = 0.3 + t.hl;
        const cyl = (tn) => L.linear(q, -w, 0, w, 0, [
          [0, tint('#9a5c06', tn)], [0.1, tint('#e6a416', tn)], [hp - 0.07, tint('#fbbe24', tn)], [hp + 0.05, tint('#ffcb38', tn)],
          [0.6, tint('#df9810', tn)], [0.84, tint('#9c5f06', tn)], [1, tint('#5e3402', tn)]]);
        // two tile lengths, each from its own firing
        for (const [y0, y1, tn] of [[-HUMP - 2, t.j, t.tone], [t.j, yb + 1, t.tone2]]) {
          q.save(); q.beginPath(); q.rect(-w - 2, y0, w * 2 + 4, y1 - y0); q.clip();
          body(); q.fillStyle = cyl(tn); q.fill();
          q.restore();
        }
        body(); q.save(); q.clip();
        if (t.dim) { q.fillStyle = `rgba(74,36,0,${t.dim.toFixed(3)})`; q.fillRect(-w, -HUMP, w * 2, yb + HUMP); }
        // along its length: the roll-over at the top catches the sky, the eave end falls off
        q.fillStyle = L.linear(q, 0, -HUMP, 0, yb, [[0, 'rgba(255,246,190,0.82)'], [0.15, 'rgba(255,236,150,0)'], [0.66, 'rgba(70,34,0,0)'], [1, 'rgba(70,34,0,0.42)']]);
        q.fillRect(-w, -HUMP, w * 2, yb + HUMP);
        // the joint between the two lengths
        const j = t.j, sag = -6.5 + r.range(-1, 1);
        q.strokeStyle = 'rgba(62,30,0,0.76)'; q.lineWidth = 2.2; q.beginPath(); q.moveTo(-w, j); q.quadraticCurveTo(0, j + sag, w, j); q.stroke();
        q.strokeStyle = 'rgba(255,238,165,0.5)'; q.lineWidth = 1.3; q.beginPath(); q.moveTo(-w, j + 2.6); q.quadraticCurveTo(0, j + sag + 2.6, w, j + 2.6); q.stroke();
        // the sun on the glaze: a soft sheen, and inside it a hard streak that is never the same length or weight twice
        const sx = -w * (0.44 - t.hl * 1.3);
        q.lineCap = 'round';
        for (const [y0, y1] of [[5, j - 5], [j + 6, yb - 31]]) {
          if (y1 - y0 < 7) continue;
          q.strokeStyle = `rgba(255,240,170,${t.dull ? 0.2 : 0.36})`; q.lineWidth = w * r.range(0.2, 0.34);
          q.beginPath(); q.moveTo(sx, y0 + 2); q.lineTo(sx + r.range(-0.7, 0.7), y1 - 2); q.stroke();
          if (t.dull) continue;
          const a0 = y0 + r.range(0, 6), a1 = y1 - r.range(0, (y1 - y0) * 0.5);
          q.strokeStyle = `rgba(255,253,236,${r.range(0.62, 0.96).toFixed(3)})`; q.lineWidth = r.range(1.3, 3.2);
          q.beginPath(); q.moveTo(sx + r.range(-0.6, 0.6), a0); q.lineTo(sx + r.range(-0.9, 0.9), a1); q.stroke();
        }
        // worn through: a patch where the glaze has spalled off the biscuit
        if (r.chance(0.26)) {
          const fx = r.range(-w * 0.7, w * 0.75), fy = r.range(9, yb - 36), fr = r.range(3.2, 8);
          const fp = flakePts(r, fx, fy, fr);
          poly(q, fp); q.fillStyle = CLAY_D; q.fill();
          poly(q, fp, 1, 1.2); q.fillStyle = CLAY; q.fill();
          q.lineWidth = 0.8; q.strokeStyle = 'rgba(70,36,4,0.6)'; poly(q, fp); q.stroke();
        }
        q.restore();

        // nail cap (钉帽): a glazed bead on the back of the tile just behind its round end — now and then long gone
        const ny = yb - 21 + r.range(-1.5, 1.5), nr = r.range(6.1, 7.5);
        if (t.nail) {
          q.fillStyle = 'rgba(50,24,0,0.55)'; q.beginPath(); q.ellipse(2.7, ny + 3.8, nr * 1.05, nr * 0.85, 0, 0, L.TAU); q.fill();
          q.fillStyle = L.radial(q, -2.4, ny - 2.7, 0.5, nr * 1.3, [[0, '#fff8d0'], [0.3, tint('#f8cc44', t.dtone)], [0.75, tint('#c98a10', t.dtone)], [1, '#74460a']]);
          q.beginPath(); q.arc(0, ny, nr, 0, L.TAU); q.fill();
        } else {
          q.fillStyle = 'rgba(158,140,112,0.8)'; q.beginPath(); q.arc(0.4, ny, 4.6, 0, L.TAU); q.fill();
          q.fillStyle = 'rgba(40,20,4,0.85)'; q.beginPath(); q.arc(0, ny - 0.3, 2.3, 0, L.TAU); q.fill();
        }

        const cx = t.ddx, cy = yb + 7 + t.ddy, R0 = t.dr, tn = t.dtone;
        if (t.state === 'gone') {
          // the round end has broken away: the open arch of the tube, packed with grey bedding mortar
          const ey = yb + 2;
          q.fillStyle = 'rgba(0,0,0,0.45)'; q.beginPath(); q.arc(2.5, ey + 3, w, Math.PI, 0); q.closePath(); q.fill();
          q.fillStyle = CLAY; q.beginPath(); q.arc(0, ey, w, Math.PI, 0); q.closePath(); q.fill();
          q.fillStyle = L.linear(q, 0, ey - w, 0, ey, [[0, '#1a0a02'], [0.5, '#4c3822'], [1, '#8a7860']]);
          q.beginPath(); q.arc(0, ey, w - 4.4, Math.PI, 0); q.closePath(); q.fill();
          q.strokeStyle = 'rgba(60,30,4,0.7)'; q.lineWidth = 1; q.beginPath(); q.arc(0, ey, w - 0.5, Math.PI, 0); q.stroke();
          return;
        }
        // round tile-end (勾头/瓦当): raised rim, sunk field, moulded relief
        const nx = Math.cos(t.chipA), nyv = Math.sin(t.chipA), cd = R0 * t.chipD;
        const chord = [-1.3, -0.5, -0.12, 0.3, 0.7, 1.3].map((u, k) => {
          const off = cd + (k % 2 ? 1.6 : -1.3) * (k === 0 || k === 5 ? 0 : 1);
          return [cx + nx * off - nyv * u * R0, cy + nyv * off + nx * u * R0];
        });
        q.fillStyle = 'rgba(0,0,0,0.52)'; q.beginPath(); q.arc(cx + 4.5, cy + 6.5, R0, 0, L.TAU); q.fill();
        q.save();
        if (t.state === 'chip') {
          q.beginPath(); chord.forEach(([x, y], k) => (k ? q.lineTo(x, y) : q.moveTo(x, y)));
          const e = chord[5], s0 = chord[0];
          q.lineTo(e[0] - nx * R0 * 3, e[1] - nyv * R0 * 3); q.lineTo(s0[0] - nx * R0 * 3, s0[1] - nyv * R0 * 3); q.closePath(); q.clip();
        }
        q.fillStyle = L.radial(q, cx - R0 * 0.36, cy - R0 * 0.44, 1, R0 * 1.5, [[0, '#fff6c4'], [0.3, tint('#f8ca3c', tn)], [0.72, tint('#d0920f', tn)], [1, tint('#7c4c06', tn)]]);
        q.beginPath(); q.arc(cx, cy, R0, 0, L.TAU); q.fill();
        q.fillStyle = L.linear(q, cx - R0, cy - R0, cx + R0, cy + R0, [[0, tint('#7c4a04', tn)], [0.55, tint('#c88c14', tn)], [1, tint('#f0b82c', tn)]]);
        q.beginPath(); q.arc(cx, cy, R0 - 4.8, 0, L.TAU); q.fill();
        // the moulded dragon, as it reads from this distance: a sinuous ridge in low relief — shadow below-right, body, lit lip above-left
        q.save(); q.translate(cx, cy); q.rotate(t.spin); q.scale(R0 / 15.6, R0 / 15.6);
        q.lineCap = 'round'; q.lineJoin = 'round';
        const dragon = (ox, oy, col, grow) => {
          q.fillStyle = col; q.strokeStyle = col;
          q.beginPath(); DRAGON.outline.forEach(([x, y], k) => (k ? q.lineTo(x + ox, y + oy) : q.moveTo(x + ox, y + oy))); q.closePath(); q.fill();
          if (grow) { q.lineWidth = grow; q.stroke(); }
          q.lineWidth = 1.5 + grow;
          q.beginPath(); for (const [x0, y0l, x1, y1] of DRAGON.legs) { q.moveTo(x0 + ox, y0l + oy); q.lineTo(x1 + ox, y1 + oy); } q.stroke();
          q.beginPath(); q.arc(DRAGON.head[0] + ox, DRAGON.head[1] + oy, 2.3 + grow / 2, 0, L.TAU); q.fill();
          q.beginPath(); q.arc(DRAGON.snout[0] + ox, DRAGON.snout[1] + oy, 1.35 + grow / 2, 0, L.TAU); q.fill();
        };
        dragon(0.9, 1.1, 'rgba(70,34,0,0.6)', 0.9);
        dragon(0, 0, tint('#f2b622', tn), 0);
        q.globalAlpha = 0.7; q.strokeStyle = '#fff3b0'; q.lineWidth = 1;
        q.beginPath(); DRAGON.pts.forEach(([x, y], k) => { if (k >= 3) (k > 3 ? q.lineTo(x - 0.6, y - 0.7) : q.moveTo(x - 0.6, y - 0.7)); }); q.stroke();
        q.fillStyle = '#fff3b0'; q.beginPath(); q.arc(DRAGON.head[0] - 0.7, DRAGON.head[1] - 0.8, 0.9, 0, L.TAU); q.fill();
        q.restore();
        q.strokeStyle = 'rgba(60,28,0,0.75)'; q.lineWidth = 1.3; q.beginPath(); q.arc(cx, cy, R0 - 0.5, 0, L.TAU); q.stroke();
        // the sun on the rim: a crescent whose length and weight change from piece to piece
        const h0 = Math.PI * r.range(0.95, 1.12), h1 = h0 + Math.PI * r.range(0.3, 0.62);
        q.strokeStyle = `rgba(255,243,176,${r.range(0.7, 0.96).toFixed(3)})`; q.lineWidth = r.range(1.6, 2.6); q.beginPath(); q.arc(cx, cy, R0 - 2.2, h0, h1); q.stroke();
        q.restore();
        if (t.state === 'chip') {
          // the bite: pale biscuit along the break, the dark of the eave behind where the piece is gone
          q.save(); q.beginPath(); q.arc(cx, cy, R0, 0, L.TAU); q.clip();
          q.lineJoin = 'round';
          q.strokeStyle = CLAY; q.lineWidth = 3.2; q.beginPath(); chord.forEach(([x, y], k) => (k ? q.lineTo(x - nx * 1.2, y - nyv * 1.2) : q.moveTo(x - nx * 1.2, y - nyv * 1.2))); q.stroke();
          q.strokeStyle = 'rgba(54,26,2,0.75)'; q.lineWidth = 0.9; q.beginPath(); chord.forEach(([x, y], k) => (k ? q.lineTo(x - nx * 3, y - nyv * 3) : q.moveTo(x - nx * 3, y - nyv * 3))); q.stroke();
          q.restore();
        }
      });
    }

    // 6) glaze mottling, and the grime that settles toward the eave — painted only onto what is already there, kept warm
    //    so the yellow stays clean
    q.globalCompositeOperation = 'source-atop';
    const tex = (opts) => L.noiseTex(RW, RH, { ...opts, ox: -PAD, oy: Y0, polar: opts.polar ? { cx: a.cx, cy: a.cy, R: a.R } : null });
    q.drawImage(tex({ seed: 's05glaze', polar: true, scale: 15, sx: 1, sy: 4.5, octaves: 3, contrast: 1.7, res: 0.4,
      ramp: [[0, 'rgba(130,62,0,0.34)'], [0.38, 'rgba(130,62,0,0)'], [0.64, 'rgba(255,222,110,0)'], [1, 'rgba(255,222,110,0.18)']] }), -PAD, Y0);
    q.drawImage(tex({ seed: 's05dirt', scale: 120, octaves: 4, warp: 0.8, res: 0.25, contrast: 1.9,
      ramp: [[0, 'rgba(96,44,4,0.42)'], [0.4, 'rgba(96,44,4,0)'], [1, 'rgba(96,44,4,0)']] }), -PAD, Y0);
    // pinholes, soot and droppings: the small dark and pale specks no fired glaze is without
    L.speckle(q, { seed: 's05pin', count: 900, x: -PAD, y: Y0, w: RW, h: 470, rMin: 0.5, rMax: 2, colors: ['#6a3a04', '#4a2804', '#8a5208'], alpha: [0.25, 0.75] });
    L.speckle(q, { seed: 's05pin2', count: 260, x: -PAD, y: Y0, w: RW, h: 470, rMin: 0.6, rMax: 1.8, colors: ['#fff6cc', '#e8dcc0'], alpha: [0.3, 0.7] });
    // the sun rakes in from the left: the far end of the cap sinks into amber
    q.fillStyle = L.linear(q, 0, 0, W, 0, [[0, 'rgba(255,220,110,0.1)'], [0.45, 'rgba(255,220,110,0)'], [0.6, 'rgba(120,58,0,0)'], [1, 'rgba(120,58,0,0.26)']]);
    q.fillRect(-PAD, Y0, RW, RH);
    q.globalCompositeOperation = 'source-over';
  });
  // a final lift so the cap reads as one luminous yellow band (overlay through its own silhouette)
  const gq = glazed.getContext('2d');
  gq.globalCompositeOperation = 'overlay'; gq.globalAlpha = 0.42;
  gq.setTransform(1, 0, 0, 1, 0, 0); gq.drawImage(tinted(glazed, '#ffbe1e'), 0, 0); gq.translate(PAD, -Y0);
  gq.globalCompositeOperation = 'source-over'; gq.globalAlpha = 1;
  // the skyline is laid last so neither mottling nor lift can dull it: a pale-gold rim over every hump and along every
  // trough top — this scallop against the teal is the arc itself
  gq.lineCap = 'butt';
  for (const d of drips) {
    const r = L.rng('s05rim' + d.k);
    a.at(gq, d.th, 0, () => {
      gq.strokeStyle = `rgba(255,243,176,${r.range(0.8, 0.97).toFixed(3)})`; gq.lineWidth = 2.4;
      gq.beginPath(); gq.moveTo(d.xl + 2, TROUGH + 1.2); gq.lineTo(d.xr - 2, TROUGH + 1.2); gq.stroke();
      if (d.moss) {                                               // a pad of dark moss lodged at the top of a gutter
        gq.fillStyle = 'rgba(52,50,16,0.85)'; gq.beginPath(); gq.ellipse(r.range(-3, 3), TROUGH + 2.4, r.range(4.5, 8), r.range(1.6, 2.4), 0, 0, L.TAU); gq.fill();
      }
    });
  }
  for (const t of tiles) {
    const r = L.rng('s05rimt' + t.i);
    a.at(gq, t.th, 0, () => {
      gq.rotate(t.rot);
      gq.strokeStyle = `rgba(255,243,176,${r.range(0.82, 0.98).toFixed(3)})`; gq.lineWidth = r.range(2.2, 3);
      gq.beginPath(); gq.ellipse(0, HUMP, t.w - 1.2, HUMP * 2 - 1.2, 0, Math.PI, 0); gq.stroke();
    });
  }
  base.getContext('2d').drawImage(glazed, -PAD, Y0);
  return base;
}

/**
 * depth of field, baked in: focus on the crest of the arc, the image going soft toward both sides and toward the bottom
 * of the frame (two blur radii cross-faded by gradient masks, each an exact lerp so the cap's edge never doubles).
 */
function depthOfField(src, rg, a) {
  const { Y0, RW, RH } = rg;
  const out = L.makeCanvas(RW, RH); const og = out.getContext('2d');
  og.drawImage(src, 0, 0);
  const pass = (px, x0, x1, yb0, yb1, bottom) => {
    const mask = L.makeCanvas(RW, RH); const mg = mask.getContext('2d');
    mg.translate(PAD, -Y0);
    const u = (x1 - x0) / (2 * x1), k = (v) => `rgba(0,0,0,${v})`;
    mg.fillStyle = L.linear(mg, a.cx - x1, 0, a.cx + x1, 0, [[0, k(1)], [u * 0.5, k(0.5)], [u * 0.82, k(0.1)], [u, k(0)], [1 - u, k(0)], [1 - u * 0.82, k(0.1)], [1 - u * 0.5, k(0.5)], [1, k(1)]]);
    mg.fillRect(-PAD, Y0, RW, RH);
    mg.fillStyle = L.linear(mg, 0, yb0, 0, yb1, [[0, k(0)], [1, k(bottom)]]);
    mg.fillRect(-PAD, Y0, RW, RH);
    const soft = px > 4 ? softBlur(src, px) : L.blurred(src, px); const sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in'; sg.drawImage(mask, 0, 0);
    og.globalCompositeOperation = 'destination-out'; og.drawImage(mask, 0, 0);
    og.globalCompositeOperation = 'lighter'; og.drawImage(soft, 0, 0);
    og.globalCompositeOperation = 'source-over';
  };
  pass(2.4, 300, 720, a.crestY + 330, H + 60, 0.85);
  pass(5, 640, 1070, a.crestY + 440, H + PAD, 0.6);
  return out;
}

export default {
  name: '红墙黄瓦',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const Y0 = Math.floor(a.crestY - 40);                       // everything lives below the arc: layers are cropped to that
    const rg = { Y0, RW: W + PAD * 2, RH: H + PAD - Y0 };
    const lay = layout(a);
    let T0 = performance.now(); const tick = (n) => { const t = performance.now(); console.warn('T ' + n + ' ' + (t - T0).toFixed(0)); T0 = t; };
    const cap = buildTiles(env, rg, lay); tick('tiles');
    const shadow = buildShadow(env, rg, lay); tick('shadow');
    const wall = cropLayer(rg, (g) => {
      buildPlaster(env, rg, g, lay);
      g.save(); a.clipBelow(g, -(WALL - 1));
      // a cool shadow against the warm wall: multiply drops red and green but leaves the blue, then a breath of violet → 绛紫
      g.globalCompositeOperation = 'multiply';
      g.drawImage(tinted(shadow, '#a882d6'), -PAD, Y0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.08;
      g.drawImage(tinted(shadow, '#3a1050'), -PAD, Y0);
      g.restore();
      g.drawImage(cap, -PAD, Y0);
    }); tick('wall');
    const dofd = depthOfField(wall, rg, a); tick('dof');
    S = {
      Y0, sky: buildSky(), wall: dofd,
      glint: tinted(cap, '#ffd050'),                            // a pale-gold copy of the cap: the mask for a travelling glint
      scratch: L.makeCanvas(520, 520),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0028, 0.0028, p);
    const place = (c) => { c.translate(a.cx, a.cy); c.rotate(rot); c.translate(-a.cx, -a.cy); };
    ctx.drawImage(S.sky, 0, 0);
    ctx.save(); place(ctx); ctx.drawImage(S.wall, -PAD, S.Y0); ctx.restore();
    // sun glint sliding along the glazed cap (overlay: it lifts the glaze without bleaching it)
    const GS = S.scratch.width, sg = S.scratch.getContext('2d');
    const gp = a.pt(L.lerp(-0.2, -0.11, p), -46), ox = Math.round(gp.x - GS / 2), oy = Math.round(gp.y - GS / 2);
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, GS, GS);
    sg.translate(-ox, -oy); place(sg); sg.drawImage(S.glint, -PAD, S.Y0);
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.radial(sg, GS / 2, GS / 2, 0, GS / 2, [[0, 'rgba(0,0,0,1)'], [0.4, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]);
    sg.fillRect(0, 0, GS, GS);
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(S.scratch, ox, oy); ctx.restore();
  },
};
