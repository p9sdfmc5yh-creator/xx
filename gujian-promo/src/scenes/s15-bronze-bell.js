// s15 — 铜钟. Macro on the shoulder of a colossal bronze bell rising out of the dark: the arc is the bell's
// silhouette. Below it the bronze rolls toward us (rows foreshorten at the limb), cast all over with columns of
// inscription in relief — unreadable stroke-texture, never real characters — and one raised 弦纹 band.
// The whole surface is one material: verdigris fills the ground and buries strokes where it is thick, the high
// points are rubbed back to bronze. One soft key from the upper left, shallow focus, a cold violet→cyan rim
// light along the silhouette. Above: pure black.
//
// Everything lives below the arc, so the pre-rendered layers only cover the frame from just above the crest
// downward (plus PAD at the sides and bottom for the rotation). The bronze turns about the arc's centre under
// lights that stay fixed to the frame.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 240;
const LW = W + PAD * 2;
const HEAD = 30;          // rows of surface kept above the crest, so the focus blur has something to pull from
let TOP = 0, LH = 0;      // first frame row covered by the "low" layers, and their height (set in init)
let S = null;

/** a layer covering x ∈ [-PAD, W+PAD], y ∈ [TOP, H+PAD]; draw with frame coordinates */
function low(draw) {
  const c = L.makeCanvas(LW, LH); const g = c.getContext('2d');
  g.translate(PAD, -TOP);
  if (draw) draw(g, c);
  return c;
}
/** noise that follows the arc (sx stretches along it, sy radially), sized like a low layer */
function lowNoise(env, opts) {
  const a = env.arc;
  return L.noiseTex(LW, LH, { ...opts, polar: { cx: a.cx + PAD, cy: a.cy - TOP, R: a.R } });
}

// ── the bell's curvature ──
// Screen depth below the arc (d, px) ↔ distance measured on the bronze itself (s, px). The shoulder is a
// quarter-roll of radius ROLL: at the silhouette the surface is edge-on (rows squash to nothing), by d = ROLL it faces us.
const ROLL = 650;
const S_FLAT = (ROLL * Math.PI) / 2;
const sOf = (d) => (d <= 0 ? 0 : d < ROLL ? ROLL * Math.acos(1 - d / ROLL) : S_FLAT + (d - ROLL));
const dOf = (s) => (s <= 0 ? 0 : s < S_FLAT ? ROLL * (1 - Math.cos(s / ROLL)) : ROLL + (s - S_FLAT));

// layout on the bronze (surface px from the silhouette inward)
const CW = 74, CH = 68;                         // one inscription cell — close enough to see every stroke
const BAND = [404, 488];                        // the raised string-course band (弦纹)
const ZONES = [[72, BAND[0] - 14], [BAND[1] + 14, 1500]];
// the band = thin / thick / thin half-round ridges: [centre s, width s, relative height]
const RIDGES = (() => { const w = BAND[1] - BAND[0]; return [[BAND[0] + w * 0.1, w * 0.17, 0.45], [BAND[0] + w * 0.5, w * 0.48, 1], [BAND[0] + w * 0.9, w * 0.17, 0.45]]; })();

const sstep = (e0, e1, v) => { const t = v <= e0 ? 0 : v >= e1 ? 1 : (v - e0) / (e1 - e0); return t * t * (3 - 2 * t); };
const hash2 = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ───────────────────────── pseudo-inscription glyphs ─────────────────────────
// Brush-shaped strokes (横 with a pressed end, 竖, 撇, 捺, 点) thrown onto a loose grid: reads as cast
// regular-script at a glance, but spells nothing. Each glyph is a list of stroke paths in a unit box.
function buildGlyphSet(count) {
  const r = L.rng('s15glyph');
  const TH = 0.1, TV = 0.118;
  const heng = (x0, x1, y) => {
    const p = new Path2D(), rise = (x1 - x0) * 0.075, t = TH * r.range(0.85, 1.18), xm = (x0 + x1) / 2;
    p.moveTo(x0 - t * 0.1, y + t * 0.55);
    p.lineTo(x0 + t * 0.15, y - t * 0.6);
    p.quadraticCurveTo(xm, y - t * 0.3 - rise * 0.5, x1 - t * 0.5, y - t * 0.55 - rise);
    p.lineTo(x1 + t * 0.2, y - rise - t * 0.05);
    p.lineTo(x1 - t * 0.05, y - rise + t * 0.8);
    p.quadraticCurveTo(xm, y + t * 0.28 - rise * 0.5, x0 - t * 0.1, y + t * 0.55);
    p.closePath(); return p;
  };
  const shu = (x, y0, y1) => {
    const p = new Path2D(), t = TV * r.range(0.85, 1.18), needle = r.chance(0.35);
    p.moveTo(x - t * 0.62, y0 + t * 0.1);
    p.lineTo(x + t * 0.5, y0 - t * 0.12);
    if (needle) { p.lineTo(x + t * 0.4, y0 + (y1 - y0) * 0.7); p.lineTo(x + t * 0.05, y1 + t * 0.35); p.lineTo(x - t * 0.42, y0 + (y1 - y0) * 0.72); }
    else { p.lineTo(x + t * 0.46, y1 - t * 0.1); p.lineTo(x + t * 0.12, y1 + t * 0.28); p.lineTo(x - t * 0.5, y1 + t * 0.02); }
    p.closePath(); return p;
  };
  // a stroke that changes weight along a slight curve (撇 thins to a point, 捺 swells into its foot)
  const sweep = (x0, y0, x1, y1, t0, t1, bow) => {
    const p = new Path2D();
    const dx = x1 - x0, dy = y1 - y0, m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m, tm = (t0 + t1) / 4;
    const cx = (x0 + x1) / 2 + nx * bow * m, cy = (y0 + y1) / 2 + ny * bow * m;
    p.moveTo(x0 + (nx * t0) / 2, y0 + (ny * t0) / 2);
    p.quadraticCurveTo(cx + nx * tm, cy + ny * tm, x1 + (nx * t1) / 2, y1 + (ny * t1) / 2);
    p.lineTo(x1 + (dx / m) * t1 * 0.55, y1 + (dy / m) * t1 * 0.55);
    p.lineTo(x1 - (nx * t1) / 2, y1 - (ny * t1) / 2);
    p.quadraticCurveTo(cx - nx * tm, cy - ny * tm, x0 - (nx * t0) / 2, y0 - (ny * t0) / 2);
    p.closePath(); return p;
  };
  const pie = (x0, y0, x1, y1) => sweep(x0, y0, x1, y1, TV * 1.15, TV * 0.22, 0.09);
  const na = (x0, y0, x1, y1) => sweep(x0, y0, x1, y1, TV * 0.45, TV * 1.4, -0.09);
  const dian = (x, y, dir) => sweep(x - 0.035 * dir, y - 0.055, x + 0.05 * dir, y + 0.065, TV * 0.45, TV * 1.35, 0.12 * dir);
  const part = (out, bx, by, bw, bh, nH, nV, legs) => {
    // (one horizontal and one vertical always stop short, so strokes never close into a tidy box)
    const shortH = r.int(0, nH - 1), shortV = r.int(0, nV - 1);
    for (let i = 0; i < nH; i++) {
      const y = by + bh * (0.08 + 0.84 * ((i + 0.5 + r.range(-0.2, 0.2)) / nH));
      let x0 = bx + bw * r.pick([0, 0, 0.06, 0.28, 0.4]), x1 = bx + bw * r.pick([1, 1, 0.92, 0.7, 0.86]);
      if (i === shortH) { if (r.chance(0.5)) x0 = bx + bw * r.range(0.26, 0.44); else x1 = bx + bw * r.range(0.56, 0.74); }
      out.push(heng(x0, x1, y));
    }
    const cols = [0.06, 0.5, 0.94, 0.3, 0.72];
    const used = new Set();
    for (let i = 0; i < nV; i++) {
      let k = r.int(0, cols.length - 1); while (used.has(k)) k = (k + 1) % cols.length; used.add(k);
      let y0 = by + bh * r.pick([0, 0, 0.14, 0.34, 0.46]), y1 = by + bh * r.pick([1, 1, 0.9, 0.64, 0.8]);
      if (i === shortV) { if (r.chance(0.5)) y0 = by + bh * r.range(0.26, 0.46); else y1 = by + bh * r.range(0.54, 0.74); }
      out.push(shu(bx + bw * (cols[k] + r.range(-0.04, 0.04)), y0, y1));
    }
    if (legs) {
      const cx = bx + bw * r.range(0.4, 0.6), y0 = by + bh * r.range(0.4, 0.6);
      if (r.chance(0.8)) out.push(pie(cx, y0, bx + bw * 0.02, by + bh));
      if (r.chance(0.8)) out.push(na(cx + bw * 0.05, y0, bx + bw * 0.96, by + bh * 0.98));
    }
    const ticks = r.int(0, 2);
    for (let i = 0; i < ticks; i++) out.push(dian(bx + bw * r.range(0.15, 0.85), by + bh * r.range(0.08, 0.9), r.sign()));
  };
  const set = [];
  for (let i = 0; i < count; i++) {
    const out = [];
    const kind = r();
    if (kind < 0.42) { // left | right
      const split = r.range(0.34, 0.5);
      part(out, 0.04, 0.05, split - 0.08, 0.9, r.int(2, 3), r.int(1, 2), r.chance(0.25));
      part(out, split + 0.04, 0.04, 0.92 - split, 0.92, r.int(3, 4), r.int(1, 2), r.chance(0.35));
    } else if (kind < 0.78) { // top / bottom
      const split = r.range(0.36, 0.52);
      part(out, 0.08, 0.03, 0.84, split - 0.07, 2, r.int(2, 3), false);
      part(out, 0.05, split + 0.03, 0.9, 0.95 - split, r.int(2, 3), r.int(1, 2), r.chance(0.55));
    } else { // one dense block
      part(out, 0.05, 0.04, 0.9, 0.92, r.int(4, 5), r.int(2, 3), r.chance(0.5));
    }
    set.push(out);
  }
  return set;
}

/** white-on-transparent mask of every inscription stroke, laid out in radial columns and foreshortened rows */
function buildGlyphMask(env) {
  const a = env.arc;
  const glyphs = buildGlyphSet(120);
  const r = L.rng('s15rows');
  const nCols = Math.ceil((a.span(PAD + 140) * a.R) / CW);
  const mask = low((g) => {
    g.fillStyle = '#fff';
    for (const [z0, z1] of ZONES) {
      const nRows = Math.floor((z1 - z0) / CH), pitch = (z1 - z0) / nRows;
      for (let k = 0; k < nRows; k++) {
        const sTop = z0 + k * pitch + pitch * 0.07, sBot = sTop + pitch * 0.86;
        const dTop = dOf(sTop), hpx = dOf(sBot) - dTop;
        if (hpx < 1.6) continue;
        if (a.crestY + dTop > H + PAD + 20) break;
        const wScale = (a.R - dTop - hpx / 2) / a.R;
        for (let j = -nCols; j <= nCols; j++) {
          // no two cells alike: each character sits a little off its place, a little bigger or smaller, a little askew
          const gi = r.int(0, glyphs.length - 1), jx = r.range(-0.05, 0.05), jy = r.range(-0.035, 0.035), sc = r.range(0.9, 1.06), tilt = r.range(-0.03, 0.03), skip = r.chance(0.025);
          const th = ((j + 0.5) * CW) / a.R;
          const p = a.pt(th, -dTop);
          if (skip || p.x < -PAD - 60 || p.x > W + PAD + 60 || p.y > H + PAD + 30) continue;
          g.save();
          g.translate(p.x, p.y); g.rotate(th);
          g.scale(CW * 0.76 * wScale * sc, hpx * sc);      // gutters between columns, tight leading within them
          g.translate(jx, 0.5 + jy); g.rotate(tilt); g.translate(-0.5, -0.5);
          for (const sp of glyphs[gi]) g.fill(sp);
          g.restore();
        }
      }
    }
  });
  // corrosion has eaten some of the casting away
  const g = mask.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(lowNoise(env, { seed: 's15eat', scale: 150, octaves: 4, warp: 0.7, res: 0.25, contrast: 1.5,
    ramp: [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [0.75, 'rgba(0,0,0,0.85)'], [1, 'rgba(0,0,0,1)']] }), 0, 0);
  return mask;
}

// ───────────────────────── bronze + verdigris + relief (per-pixel, in surface coordinates) ─────────────────────────
// One little shader for the whole casting. Every pixel has a height (strokes, ridges, crust) and a verdigris
// field; green settles where the field is high and the metal is low, the high points stay rubbed bronze, and the
// height map is lit from the upper left.
const KR = 0.3;           // how much further the verdigris has to grow before it buries a raised stroke
function buildSurface(env, mask) {
  const a = env.arc, res = 0.4;
  const cw = Math.round(LW * res), ch = Math.round(LH * res), N = cw * ch;
  const pfA = new Float32Array(N).fill(-9);   // verdigris field, thresholded later at full resolution
  const tA = new Float32Array(N), pcA = new Float32Array(N), wrA = new Float32Array(N), cuA = new Float32Array(N);
  const n1 = L.makeNoise('s15mottle'), n2 = L.makeNoise('s15patina'), n3 = L.makeNoise('s15streak');
  for (let y = 0; y < ch; y++) {
    const dy = a.cy - (y / res + TOP);
    for (let x = 0; x < cw; x++) {
      const dx = x / res - PAD - a.cx;
      const d = a.R - Math.sqrt(dx * dx + dy * dy);
      if (d < -HEAD - 16) continue;
      const u = Math.atan2(dx, dy) * a.R;
      const s = sOf(d);
      const i = y * cw + x;
      // bronze tone: big cast blotches + long streaks that run round the bell
      const mot = n1.fbm(u / 440, s / 440, 3);
      const str = n3.fbm(u / 1500 + 3.1, s / 46, 3);
      tA[i] = L.clamp(0.46 + 0.5 * mot + 0.3 * str);
      wrA[i] = 0.5 + 0.5 * n1.n2(u / 560 + 40, s / 330 - 17);                 // how hard this part has been rubbed
      cuA[i] = sstep(0.18, 0.5, n3.fbm(u / 320 - 8, s / 320 + 5, 2)) * 0.22;   // cuprite: dull date-red oxide under the green
      // verdigris field. It grows the way it does on a casting, not in round blotches: drawn out down the
      // bell where rain runs, heaviest on the shoulder where damp sits, packed into the grooves of the band
      // and trailing off its lower edge in drips.
      const wx = n2.n2(u / 620 + 9.1, s / 620 - 3.3), wy = n2.n2(u / 620 - 5.2, s / 620 + 7.7);
      const blob = n2.fbm(u / 175 + wx * 0.35, s / 640 + wy * 0.35, 3);
      const region = n2.n2(u / 1250 + 1.7, s / 820 - 2.2);
      const hf = n2.fbm(u / 15 + 77, s / 15, 2);
      const spots = n2.fbm(u / 46 - 31, s / 46 + 13, 2);
      let pf = 0.12 + 0.4 * blob + 0.5 * region + 0.06 * hf + 0.12 * spots - 0.18 * str;
      pf += 0.5 * (1 - sstep(300, 520, s));
      // … and rubbed thin across the middle of the shoulder, where the bronze shows through
      { const eu = (u - 140) / 640, es = (s - 690) / 210; pf -= 0.3 * Math.exp(-(eu * eu + es * es)); }
      const eb = s < BAND[0] ? BAND[0] - s : s > BAND[1] ? s - BAND[1] : 0;
      if (eb < 34) pf += 0.26 * (1 - eb / 34);
      if (s > BAND[1] && s < BAND[1] + 400) pf += 0.42 * (1 - (s - BAND[1]) / 400) * sstep(0, 0.55, n2.n2(u / 42 + 50, 4.9));
      pfA[i] = pf; pcA[i] = 0.5 + 0.5 * n2.n2(u / 64 + 20, s / 64);
    }
  }
  // the strokes as the pass below needs them: a slightly soft copy (bevelled edge) and a wide soft one cast down-right (shadow)
  const alphaOf = (c) => c.getContext('2d').getImageData(0, 0, LW, LH).data;
  const bev = alphaOf(L.blurred(mask, 1.25));
  const oc = L.makeCanvas(LW, LH);
  { const g = oc.getContext('2d'); g.filter = 'blur(5px)'; g.drawImage(mask, 3, 4.5); g.filter = 'none'; }
  const occ = alphaOf(oc);

  const img = new ImageData(LW, LH), o = img.data;
  const hA = new Float32Array(LW * LH), paA = new Float32Array(LW * LH);
  const dR0 = dOf(BAND[0] - 8), dR1 = dOf(BAND[1] + 30);
  for (let Y = 0; Y < LH; Y++) {
    const dyp = a.cy - (Y + TOP + 0.5);
    const hy = L.clamp((Y + 0.5) * res - 0.5, 0, ch - 1.001), y0 = hy | 0, fy = hy - y0;
    for (let X = 0; X < LW; X++) {
      const dxp = X + 0.5 - PAD - a.cx;
      const d = a.R - Math.sqrt(dxp * dxp + dyp * dyp);
      if (d < -HEAD + 2) continue;
      const hx = L.clamp((X + 0.5) * res - 0.5, 0, cw - 1.001), x0 = hx | 0, fx = hx - x0;
      const i0 = y0 * cw + x0, i1 = i0 + 1, i2 = i0 + cw, i3 = i2 + 1;
      if (pfA[i0] < -5 || pfA[i1] < -5 || pfA[i2] < -5 || pfA[i3] < -5) continue;
      const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
      const pf = pfA[i0] * w0 + pfA[i1] * w1 + pfA[i2] * w2 + pfA[i3] * w3;
      const t = tA[i0] * w0 + tA[i1] * w1 + tA[i2] * w2 + tA[i3] * w3;
      const pc = pcA[i0] * w0 + pcA[i1] * w1 + pcA[i2] * w2 + pcA[i3] * w3;
      const wear = wrA[i0] * w0 + wrA[i1] * w1 + wrA[i2] * w2 + wrA[i3] * w3;
      const cup = cuA[i0] * w0 + cuA[i1] * w1 + cuA[i2] * w2 + cuA[i3] * w3;
      const i = Y * LW + X, j = i * 4;
      const mb = bev[j + 3] / 255, m = sstep(0.2, 0.62, mb);
      // the band: half-round ridges, the shadow each throws below itself, plain sunk ground between them
      let ridge = 0, ridgeH = 0, rsh = 0, groove = 0;
      if (d > dR0 && d < dR1) {
        const s = sOf(d);
        for (let k = 0; k < 3; k++) {
          const tt = (s - RIDGES[k][0]) / (RIDGES[k][1] / 2);
          if (tt > -1 && tt < 1) { const pr = 1 - tt * tt; ridge = Math.sqrt(pr); ridgeH = pr * RIDGES[k][1] * 0.1; }
          else if (tt >= 1 && tt < 2.6) { const sh = (1 - (tt - 1) / 1.6) * (0.5 + 0.5 * RIDGES[k][2]); if (sh > rsh) rsh = sh; }
        }
        if (s > BAND[0] && s < BAND[1] && ridge === 0) groove = 1;
      }
      const raise = m > ridge ? m : ridge;
      const g1 = hash2(X, Y), g2 = hash2(X >> 1, (Y >> 1) + 7919), g3 = hash2((X + 1) >> 2, (Y >> 2) + 104729);
      const gr = 0.34 * g1 + 0.33 * g2 + 0.33 * g3 - 0.5;
      const v = pf + 0.1 * gr + 0.2 * groove;
      const ve = v - KR * raise;
      // (a hard-edged crust, with a thin translucent film of green running out ahead of it)
      const film = 0.34 * sstep(-0.02, 0.14, ve), crust = sstep(0.09, 0.13, ve);
      const aP = (crust > film ? crust : film) * 0.95;
      // bronze: black-lacquer patina → old bronze → rubbed crests (sober, never gold)
      const tb = t + raise * (0.12 + 0.36 * wear) + 0.1 * gr;
      let R0, G0, B0;
      if (tb < 0.45) { const k = tb < 0 ? 0 : tb / 0.45; R0 = 24 + 54 * k; G0 = 18 + 42 * k; B0 = 12 + 28 * k; }
      else if (tb < 0.85) { const k = (tb - 0.45) / 0.4; R0 = 78 + 62 * k; G0 = 60 + 52 * k; B0 = 40 + 36 * k; }
      else { const k = tb > 1.3 ? 1 : (tb - 0.85) / 0.45; R0 = 140 + 58 * k; G0 = 112 + 54 * k; B0 = 76 + 36 * k; }
      const cu = cup * (1 - raise);
      R0 += (110 - R0) * cu; G0 += (44 - G0) * cu; B0 += (28 - B0) * cu;
      // a thin dull film of green stains the metal around the heavier growth
      const wash = sstep(-0.25, 0.05, ve) * 0.45;
      R0 += (14 - R0) * wash; G0 += (46 - G0) * wash; B0 += (42 - B0) * wash;
      // verdigris: deep #0f4a44 → malachite green #2f9c88 → chalky crust #78d6c0 …
      // (where it has buried a stroke the crust over the stroke is the part that gets rubbed pale)
      const chalk = L.clamp(sstep(0.2, 0.62, v) * (0.35 + 0.65 * pc) + 0.3 * m);
      const lum = 0.86 + 0.28 * g2;
      let PR = 15 + 32 * pc + 73 * chalk, PG = 74 + 82 * pc + 58 * chalk, PB = 68 + 68 * pc + 56 * chalk;
      // … with the odd bloom of azurite (石青 #2a80be) in the heavier growth
      if (pc > 0.8 && v > 0.34) { const az = 0.45 * sstep(0.8, 0.88, pc) * sstep(0.34, 0.4, v); PR += (42 - PR) * az; PG += (128 - PG) * az; PB += (190 - PB) * az; }
      const dim = (1 - 0.5 * (occ[j + 3] / 255) * (1 - m)) * (1 - 0.5 * rsh) * (1 - 0.22 * groove);
      o[j] = (R0 + (PR * lum - R0) * aP) * dim;
      o[j + 1] = (G0 + (PG * lum - G0) * aP) * dim;
      o[j + 2] = (B0 + (PB * lum - B0) * aP) * dim;
      o[j + 3] = 255;
      // height: strokes and ridges stand proud, thick crust is lumpy, the bare metal has a little tooth
      hA[i] = mb * (1.15 + 0.7 * wear) + ridgeH + sstep(0.3, 0.56, ve) * (0.16 + 0.15 * g2) + 0.06 * aP * g3 + 0.05 * g1;
      paA[i] = aP;
    }
  }
  // light the height map from the upper left: pale catch-lights on the slopes that face it, shade on those that don't
  for (let Y = 1; Y < LH - 1; Y++) {
    for (let X = 1; X < LW - 1; X++) {
      const i = Y * LW + X, j = i * 4;
      if (o[j + 3] === 0) continue;
      const sh = ((hA[i + 1] - hA[i - 1]) * 0.55 + (hA[i + LW] - hA[i - LW]) * 0.83) * 1.5;
      if (sh > 0) {
        const k = (sh > 1 ? 1 : sh) * 0.8, pa = paA[i];
        o[j] += (232 - 36 * pa - o[j]) * k; o[j + 1] += (208 + 36 * pa - o[j + 1]) * k; o[j + 2] += (156 + 70 * pa - o[j + 2]) * k;
      } else {
        const f = 1 - 0.72 * (sh < -1 ? 1 : -sh);
        o[j] *= f; o[j + 1] *= f; o[j + 2] *= f;
      }
    }
  }
  const c = L.makeCanvas(LW, LH); c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/**
 * Shallow focus, as a macro lens would give: sharp across the lit middle of the shoulder, softening toward
 * the limb (which is farther away), the sides and the bottom of the frame.
 */
function depthOfField(env, sharp) {
  const a = env.arc, D = 1500;
  // alpha = how much of the SHARP image survives: a concentric band (by depth below the arc) × a span across the frame
  const focus = (dStops, xc, half0, half1) => low((g) => {
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - D, a.R + HEAD + 10, dStops.map(([d, v]) => [1 - (d + HEAD + 10) / (D + HEAD + 10), `rgba(0,0,0,${v})`]).reverse());
    g.fillRect(-PAD, TOP, LW, LH);
    g.globalCompositeOperation = 'destination-in';
    const e = (half1 - half0) / (2 * half1);
    g.fillStyle = L.linear(g, xc - half1, 0, xc + half1, 0, [[0, 'rgba(0,0,0,0)'], [e, '#000'], [1 - e, '#000'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(-PAD, TOP, LW, LH);
  });
  const soft = (px, keep) => {
    const b = L.blurred(sharp, px); const g = b.getContext('2d');
    g.globalCompositeOperation = 'destination-out'; g.drawImage(keep, 0, 0);
    return b;
  };
  const out = L.makeCanvas(LW, LH); const g = out.getContext('2d');
  g.drawImage(sharp, 0, 0);
  g.drawImage(soft(2.2, focus([[-HEAD - 10, 0], [26, 0], [100, 1], [380, 1], [520, 0], [D, 0]], 900, 480, 1020)), 0, 0);
  g.drawImage(soft(6.5, focus([[-HEAD - 10, 1], [450, 1], [640, 0], [D, 0]], 900, 800, 1300)), 0, 0);
  return out;
}

function buildBell(env) {
  const a = env.arc;
  const mask = buildGlyphMask(env);
  const tex = buildSurface(env, mask);
  // cast-surface blotching, pits and flecks
  L.overlayOn(tex, lowNoise(env, { seed: 's15blot', scale: 300, octaves: 4, warp: 0.6, res: 0.25, contrast: 1.4, ramp: [[0, '#4a4034'], [0.55, '#ffffff'], [1, '#ffffff']] }), { blend: 'multiply', alpha: 0.5 });
  {
    const g = tex.getContext('2d');
    g.save(); g.translate(PAD, -TOP);
    const below = (x, y) => a.drAt(x, y) < -2;
    const box = { x: -PAD, y: TOP, w: LW, h: LH, squash: 0.7, test: below };
    L.speckle(g, { ...box, seed: 's15pit', count: 2600, rMin: 0.7, rMax: 3.4, colors: ['#0b0603', '#140b05', '#0d2824'], alpha: [0.3, 0.8] });
    L.speckle(g, { ...box, seed: 's15fleck', count: 1100, rMin: 0.5, rMax: 2, colors: ['#9fdccb', '#74bcab', '#c9a56c', '#58a898'], alpha: [0.25, 0.75] });
    g.restore();
  }
  L.overlayOn(tex, L.grainTex(LW, LH, { seed: 's15grain', amount: 0.3 }), { blend: 'overlay', alpha: 0.5 });
  const bell = depthOfField(env, tex);
  // cut the silhouette: rotation about the arc's centre keeps this edge exactly on the arc
  {
    const g = bell.getContext('2d');
    g.translate(PAD, -TOP);
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000';
    a.pathBelow(g, 0); g.fill();
  }
  return L.filtered(bell, 'brightness(1.2) contrast(1.05) saturate(1.1)');
}

// ───────────────────────── light (fixed to the frame; the bronze slides underneath) ─────────────────────────
const grey = (v, tintC) => { const c = tintC || [1, 1, 1]; return `rgb(${Math.round(255 * L.clamp(v * c[0]))},${Math.round(255 * L.clamp(v * c[1]))},${Math.round(255 * L.clamp(v * c[2]))})`; };
/** a frame-wide strip from row TOP down; draw with frame coordinates */
function strip(draw) {
  const c = L.makeCanvas(W, H - TOP); const g = c.getContext('2d');
  g.translate(0, -TOP);
  draw(g);
  return c;
}

/** multiply layer: the limb falls into (cold) shade, one pool of light left of centre, the rest falls away */
function buildShade(env) {
  const a = env.arc;
  return strip((g) => {
    g.fillStyle = '#fff'; g.fillRect(0, TOP, W, H - TOP);
    a.clipBelow(g, 0);
    const DEEP = 900, COLD = [0.8, 0.88, 1.3];
    const stops = [[0, 0.46, COLD], [10, 0.52, COLD], [36, 0.66, [0.93, 0.96, 1.1]], [90, 0.86], [170, 0.97], [260, 1], [400, 0.95], [540, 0.88], [900, 0.68]];
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - DEEP, a.R, stops.map(([d, v, t]) => [1 - d / DEEP, grey(v, t)]));
    g.fillRect(0, TOP, W, H - TOP);
    g.globalCompositeOperation = 'multiply';
    g.translate(800, a.crestY + 240); g.scale(1, 0.6);
    g.fillStyle = L.radial(g, 0, 0, 120, 1400, [[0, grey(1)], [0.22, grey(0.98)], [0.45, grey(0.86)], [0.7, grey(0.64)], [1, grey(0.44)]]);
    g.fillRect(-3000, -3000, 6000, 6000);
  });
}

/**
 * color-dodge layer: soft reflections of the light sources as concentric bands, streaky along the arc,
 * on opaque black (so the blend reads it as an amount of light).
 */
function buildSpec(env) {
  const a = env.arc;
  return strip((g) => {
    g.fillStyle = '#000'; g.fillRect(0, TOP, W, H - TOP);
    const band = (dC, hw, alpha, col, xC, reach) => {
      const t = strip((tg) => {
        const r0 = a.R - dC - hw, r1 = a.R - dC + hw;
        tg.fillStyle = L.radial(tg, a.cx, a.cy, r0, r1, [[0, L.rgba(col, 0)], [0.2, L.rgba(col, alpha * 0.2)], [0.38, L.rgba(col, alpha * 0.68)], [0.5, L.rgba(col, alpha)], [0.62, L.rgba(col, alpha * 0.68)], [0.8, L.rgba(col, alpha * 0.2)], [1, L.rgba(col, 0)]]);
        tg.fillRect(0, TOP, W, H - TOP);
        tg.globalCompositeOperation = 'destination-in';
        const x0 = xC - reach, x1 = xC + reach;
        tg.fillStyle = L.linear(tg, x0, 0, x1, 0, [[0, 'rgba(0,0,0,0)'], [0.16, 'rgba(0,0,0,0.1)'], [0.32, 'rgba(0,0,0,0.5)'], [0.44, 'rgba(0,0,0,0.92)'], [0.5, 'rgba(0,0,0,1)'], [0.56, 'rgba(0,0,0,0.92)'], [0.68, 'rgba(0,0,0,0.5)'], [0.84, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0)']]);
        tg.fillRect(0, TOP, W, H - TOP);
      });
      g.globalCompositeOperation = 'lighter';
      g.drawImage(t, 0, TOP);
    };
    band(262, 124, 0.7, '#f2fff6', 840, 1700);      // key: a long soft box, bent into a band by the curve of the bronze
    band(330, 230, 0.38, '#eafff2', 820, 1600);    // and the broad glow around it
    band(146, 20, 0.5, '#fff0de', 780, 1300);      // the same light caught along the raised band
    band(56, 15, 0.42, '#c4c6ff', 900, 1500);      // cold strip just inside the limb
    band(470, 100, 0.3, '#bfe2ee', 1420, 1000);    // cool fill low on the right, answering the cyan end of the rim light
    g.globalCompositeOperation = 'multiply';
    g.drawImage(L.noiseTex(W, H - TOP, { seed: 's15sheen', scale: 26, sx: 46, sy: 1, octaves: 3, res: 0.3, contrast: 1.5,
      polar: { cx: a.cx, cy: a.cy - TOP, R: a.R }, ramp: [[0, '#a8a8a8'], [0.5, '#c8c8c8'], [1, '#ffffff']] }), 0, TOP);
  });
}

/**
 * The cold rim light, in two layers that only cover the rows around the arc:
 *   wrap (color-dodge) — the light creeping a little way onto the bronze, so the relief there catches it;
 *   line (screen)      — the bright edge itself and a faint bloom, uneven along its length like a real kicker.
 */
function buildRim(env) {
  const a = env.arc;
  const IN = 90, OUT = 60, T = IN + OUT;
  const y0 = Math.floor(a.crestY - OUT - 4), y1 = Math.ceil(a.yAt(0) + IN + 4), hh = y1 - y0;
  const make = (draw) => { const c = L.makeCanvas(W, hh); const g = c.getContext('2d'); g.translate(0, -y0); draw(g); c._y0 = y0; return c; };
  const falloff = (g, al) => {
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - IN, a.R + OUT, al.map(([dr, v]) => [(dr + IN) / T, `rgba(0,0,0,${v})`]));
    g.fillRect(0, y0, W, hh);
  };
  // brighter and dimmer stretches along the silhouette
  const uneven = L.noiseTex(W, hh, { seed: 's15rimvar', scale: 230, sx: 1, sy: 40, octaves: 3, res: 0.25, contrast: 1.7,
    ramp: [[0, 'rgba(0,0,0,0.6)'], [0.45, 'rgba(0,0,0,0.82)'], [1, 'rgba(0,0,0,1)']] });
  const wrap = make((g) => {
    g.fillStyle = L.linear(g, 0, 0, W, 0, [[0, '#4a3cc0'], [0.3, '#5f55c8'], [0.6, '#746cd0'], [0.8, '#5f84cc'], [1, '#4aa2b6']]);
    g.fillRect(0, y0, W, hh);
    falloff(g, [[-IN, 0], [-60, 0.04], [-34, 0.14], [-16, 0.38], [-5, 0.7], [-0.5, 0.88], [0.5, 0], [OUT, 0]]);
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(uneven, 0, 0);
  });
  const line = make((g) => {
    // colour runs violet → cyan along the silhouette; violet holds most of it, so the cyan end stays clear of the verdigris
    g.fillStyle = L.linear(g, 0, 0, W, 0, [[0, '#5a45e6'], [0.3, '#7a6cff'], [0.55, '#9a8cff'], [0.72, '#7f8cf8'], [0.88, '#58c8d8'], [1, '#58c8d8']]);
    g.fillRect(0, y0, W, hh);
    falloff(g, [[-IN, 0], [-30, 0.06], [-12, 0.26], [-4, 0.5], [-1.5, 0.8], [0.5, 0.78], [3.5, 0.3], [10, 0.09], [26, 0.02], [OUT, 0]]);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = L.linear(g, 0, 0, W, 0, [[0, 'rgba(150,138,255,0.85)'], [0.45, 'rgba(212,206,255,0.95)'], [0.72, 'rgba(196,198,255,0.95)'], [0.88, 'rgba(168,220,252,0.9)'], [1, 'rgba(120,220,236,0.85)']]);
    g.lineWidth = 2.8; a.stroke(g, -1.3);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(uneven, 0, 0);
  });
  return { wrap, line: Object.assign(L.blurred(line, 0.6), { _y0: y0 }) };
}

export default {
  name: '铜钟',
  tone: 'light',
  init(env) {
    TOP = Math.floor(env.arc.crestY) - HEAD;
    LH = H + PAD - TOP;
    S = { bell: buildBell(env), shade: buildShade(env), spec: buildSpec(env), rim: buildRim(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.017, 0.017, p);      // the bell turns under fixed lights; a touch faster than usual so it slides
    ctx.fillStyle = '#040404'; ctx.fillRect(0, 0, W, H);
    L.cam(ctx, env, { rot }, () => ctx.drawImage(S.bell, -PAD, TOP));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(S.shade, 0, TOP);
    ctx.globalCompositeOperation = 'color-dodge'; ctx.globalAlpha = 0.78; ctx.drawImage(S.spec, 0, TOP);
    // dodge alone breaks up over the dark verdigris; a veil of screen carries the band right across the bell
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.46; ctx.drawImage(S.spec, 0, TOP);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'color-dodge'; ctx.drawImage(S.rim.wrap, 0, S.rim.wrap._y0);
    ctx.globalCompositeOperation = 'screen'; ctx.drawImage(S.rim.line, 0, S.rim.line._y0);
    // a glint running along the silhouette
    a.at(ctx, L.lerp(-0.1, 0.04, p), -1, () => {
      ctx.scale(1, 0.05);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 330, [[0, 'rgba(226,222,255,0.8)'], [0.25, 'rgba(160,150,255,0.35)'], [1, 'rgba(120,110,255,0)']]);
      ctx.fillRect(-330, -330, 660, 660);
    });
    ctx.restore();
  },
};
