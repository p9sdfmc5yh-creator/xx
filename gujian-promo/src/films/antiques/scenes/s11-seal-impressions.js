// s11 — 印蜕. A round sheet of magenta gold-flecked letter paper (洒金笺) lies on a black lacquer table, seen from straight above:
// its upper edge is the arc. Riding the edge, a row of round seals stand face-up, each face loaded with wet vermilion seal paste —
// 朱文 (design left standing: thin bright lines on a cut-away ground) and 白文 (design cut in: a solid red field with dark strokes),
// plus two pictorial seals (肖形印: a fish, a bird). On the paper below are impressions already struck from them — mirrored,
// a little paler, with dry patches (飞白) and chipped edges. No readable characters anywhere: the "script" is abstract folded line.
//
// Each seal face is shaded per pixel in init(): mask → height field (paste piled toward the stroke edges, stippled from dabbing)
// → normals → raking key light from the upper left, cast shadows into the cut ground, tight oily speculars.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 110;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const unit = (v) => { const m = Math.hypot(...v); return v.map((c) => c / m); };
const LIGHT = unit([-0.52, -0.6, 0.61]);                         // direction TO the key light (upper left, raking)
const HALF = unit([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);           // half vector for a viewer straight above
const LS = unit([LIGHT[0], LIGHT[1]]);                           // on-screen direction toward the light

// s = px along the arc from the crest; r = radius of the face; up = how far the centre rides above the arc (× r)
const SEALS = [
  { s: -968, r: 58, up: 0.2, kind: 'text', zhu: false, seed: 2, ang: 0.21, hue: 0.3 },
  { s: -766, r: 84, up: 0.34, kind: 'text', zhu: true, seed: 3, ang: -0.12, hue: -0.2 },
  { s: -570, r: 40, up: 0.1, kind: 'text', zhu: false, seed: 4, ang: 0.3, hue: 0.5, small: true },
  { s: -370, r: 96, up: 0.26, kind: 'bird', zhu: true, seed: 5, ang: 0.06, hue: 0.1 },
  { s: -146, r: 48, up: 0.42, kind: 'text', zhu: true, seed: 6, ang: -0.25, hue: -0.4, small: true },
  { s: 78, r: 110, up: 0.22, kind: 'fish', zhu: false, seed: 7, ang: -0.1, hue: 0.2 },
  { s: 294, r: 44, up: 0.06, kind: 'text', zhu: true, seed: 8, ang: 0.18, hue: 0.4, small: true },
  { s: 488, r: 80, up: 0.36, kind: 'text', zhu: false, seed: 9, ang: -0.07, hue: -0.1 },
  { s: 690, r: 56, up: 0.18, kind: 'text', zhu: true, seed: 10, ang: 0.33, hue: 0.3 },
  { s: 930, r: 96, up: 0.3, kind: 'text', zhu: true, seed: 11, ang: -0.2, hue: -0.3 },
];
// impressions already on the paper: frame coords, which seal struck them (index into SEALS), angle, which way the pressure fell off
const PRINTS = [
  { x: 1132, y: 868, like: 5, ang: 0.13, dir: 0.6, dry: 0.42 },
  { x: 498, y: 908, like: 3, ang: -0.11, dir: 2.4, dry: 0.7 },
  { x: 818, y: 1016, like: 1, ang: 0.2, dir: 4.0, dry: 0.6 },
  { x: 1480, y: 972, like: 7, ang: -0.16, dir: 5.2, dry: 0.85 },
  { x: 222, y: 1004, like: 0, ang: 0.3, dir: 1.2, dry: 0.6 },
  { x: 1786, y: 1056, like: 9, ang: 0.1, dir: 3.1, dry: 0.75 },
  { x: 1296, y: 1066, like: 8, ang: -0.3, dir: 0.2, dry: 0.5 },
];

// ───────────────────────── seal designs (white = left standing = carries the paste) ─────────────────────────
function roundPoly(g, pts, rad) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) g.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rad);
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}
/** one folded line filling a box, rows `p` apart (horiz) or columns `p` apart; random inset turns and a few open turns */
function serp(rr, x0, y0, x1, y1, horiz, p) {
  const U = horiz ? x1 - x0 : y1 - y0, V = horiz ? y1 - y0 : x1 - x0;
  const n = Math.max(2, Math.round(V / p) + 1), dv = V / (n - 1);
  const map = (u, v) => (horiz ? [x0 + u, y0 + v] : [x0 + v, y0 + u]);
  const ins = () => (U > p * 3.4 && rr.chance(0.34) ? p : 0);
  const lines = []; let cur = [], broke = false;
  let side = rr.chance(0.5) ? 1 : 0;
  cur.push(map(side ? ins() : U - ins(), 0));
  for (let i = 0; i < n; i++) {
    const v = i * dv, c = side ? U - ins() : ins();
    cur.push(map(c, v));
    if (i < n - 1) {
      if (!broke && i > 0 && i < n - 2 && rr.chance(0.3)) { broke = true; lines.push(cur); cur = [map(c, v + dv)]; } else cur.push(map(c, v + dv));
    }
    side = 1 - side;
  }
  lines.push(cur);
  return lines.filter((l) => l.length >= 2);
}
/** an abstract seal-script-like block: folded lines, sometimes under a bar, sometimes mirrored about a stem. Not a character. */
function glyph(rr, x0, y0, x1, y1, p) {
  const w = x1 - x0, h = y1 - y0, t = rr(), horiz = rr.chance(0.5);
  if (t < 0.38 || Math.min(w, h) < p * 2.6) return serp(rr, x0, y0, x1, y1, horiz, p);
  if (t < 0.72 || w < p * 4.6) {
    if (horiz) return [[[x0, y0], [x1, y0]], ...serp(rr, x0, y0 + p, x1, y1, false, p)];
    return [[[x0, y0], [x0, y1]], ...serp(rr, x0 + p, y0, x1, y1, true, p)];
  }
  const xm = (x0 + x1) / 2, left = serp(rr, x0, y0 + (rr.chance(0.5) ? p : 0), xm - p, y1, rr.chance(0.6), p);
  return [[[xm, y0], [xm, y1]], ...left, ...left.map((ln) => ln.map(([x, y]) => [2 * xm - x, y]))];
}
const ringW = (r) => Math.max(4, r * 0.085);
function ring(g, r) {
  const lw = ringW(r);
  g.strokeStyle = '#fff'; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r * 0.975 - lw / 2, 0, TAU); g.stroke();
}
function drawText(g, r, d) {
  const rr = L.rng('s11glyph' + d.seed), zhu = d.zhu;
  let rc;
  if (zhu) { ring(g, r); rc = r * 0.975 - ringW(r) + 0.6; }
  else { g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, r * 0.985, 0, TAU); g.fill(); rc = r * 0.77; }
  const p = Math.max(9, r * (d.small ? 0.27 : 0.205));
  g.save(); g.beginPath(); g.arc(0, 0, rc, 0, TAU); g.clip();
  g.strokeStyle = zhu ? '#fff' : '#000'; g.lineWidth = p * (zhu ? 0.42 : 0.52);
  const h = rc * (zhu ? 0.9 : 0.88), gap = p * 0.55;
  let boxes;
  if (d.small) boxes = [[-h, -h, h, h]];
  else {
    const sx = rr.range(-0.08, 0.08) * h, sy = rr.range(-0.1, 0.1) * h, lay = rr.int(0, 2);
    if (lay === 0) boxes = [[-h, -h, sx - gap, sy - gap], [-h, sy + gap, sx - gap, h], [sx + gap, -h, h, -sy - gap], [sx + gap, -sy + gap, h, h]];
    else if (lay === 1) boxes = [[-h, -h, sx - gap, h], [sx + gap, -h, h, sy - gap], [sx + gap, sy + gap, h, h]];
    else boxes = [[-h, -h, sx - gap, sy - gap], [-h, sy + gap, sx - gap, h], [sx + gap, -h, h, h]];
  }
  for (const [x0, y0, x1, y1] of boxes) for (const ln of glyph(rr, x0, y0, x1, y1, p)) { g.beginPath(); roundPoly(g, ln, p * 0.42); g.stroke(); }
  g.restore();
}
/** 肖形·鱼, cut in (白文): a solid field with the fish sunk into it; eye, gill and scale lines left standing */
function drawFish(g, r) {
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, r * 0.985, 0, TAU); g.fill();
  g.save(); g.scale(r * 1.1, r * 1.1); g.rotate(-0.12); g.translate(0.02, 0.02);
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(-0.7, 0.03);
  g.bezierCurveTo(-0.48, -0.36, 0.0, -0.38, 0.3, -0.06);
  g.lineTo(0.62, -0.38);
  g.quadraticCurveTo(0.49, 0.0, 0.64, 0.38);
  g.lineTo(0.3, 0.08);
  g.bezierCurveTo(0.0, 0.4, -0.48, 0.4, -0.7, 0.03);
  g.fill();
  g.beginPath(); g.moveTo(-0.26, -0.25); g.quadraticCurveTo(-0.06, -0.5, 0.15, -0.46); g.lineTo(0.14, -0.2); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-0.22, 0.29); g.lineTo(-0.04, 0.5); g.lineTo(0.08, 0.27); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineWidth = 0.056;
  g.beginPath(); g.arc(-0.47, -0.06, 0.058, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-0.33, -0.21); g.quadraticCurveTo(-0.2, 0.02, -0.33, 0.25); g.stroke();
  for (const x of [-0.13, 0.05]) { g.beginPath(); g.moveTo(x, -0.17 + (x + 0.13) * 0.3); g.quadraticCurveTo(x + 0.11, 0.02, x, 0.19 - (x + 0.13) * 0.3); g.stroke(); }
  g.lineWidth = 0.042;
  g.beginPath(); g.moveTo(0.38, -0.04); g.lineTo(0.55, -0.21); g.moveTo(0.38, 0.05); g.lineTo(0.56, 0.22); g.stroke();
  g.restore();
}
/** 肖形·鸟, left standing (朱文): border ring and a solid bird; eye and wing lines cut in */
function drawBird(g, r) {
  ring(g, r);
  g.save(); g.scale(r, r); g.translate(0.02, -0.02);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 0.092;
  for (const [x, y, qx, qy] of [[0.7, 0.1, 0.5, 0.0], [0.67, 0.36, 0.5, 0.2], [0.5, 0.57, 0.42, 0.36]]) { g.beginPath(); g.moveTo(0.2, 0.13); g.quadraticCurveTo(qx, qy, x, y); g.stroke(); }
  g.beginPath(); g.ellipse(-0.01, 0.06, 0.37, 0.22, 0.38, 0, TAU); g.fill();
  g.lineWidth = 0.17; g.beginPath(); g.moveTo(-0.22, -0.05); g.quadraticCurveTo(-0.37, -0.16, -0.37, -0.36); g.stroke();
  g.beginPath(); g.arc(-0.37, -0.38, 0.128, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-0.44, -0.48); g.lineTo(-0.72, -0.35); g.lineTo(-0.45, -0.28); g.closePath(); g.fill();
  g.lineWidth = 0.056; g.beginPath(); g.moveTo(-0.32, -0.5); g.quadraticCurveTo(-0.2, -0.68, -0.03, -0.63); g.stroke();
  g.lineWidth = 0.062;
  g.beginPath(); g.moveTo(-0.09, 0.24); g.lineTo(-0.15, 0.56); g.lineTo(-0.31, 0.61); g.stroke();
  g.beginPath(); g.moveTo(0.1, 0.27); g.lineTo(0.1, 0.61); g.lineTo(-0.06, 0.67); g.stroke();
  g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineWidth = 0.046;
  g.beginPath(); g.moveTo(-0.17, 0.0); g.quadraticCurveTo(0.06, -0.1, 0.27, 0.14); g.stroke();
  g.beginPath(); g.moveTo(-0.08, 0.11); g.quadraticCurveTo(0.08, 0.05, 0.21, 0.22); g.stroke();
  g.beginPath(); g.arc(-0.4, -0.4, 0.032, 0, TAU); g.fill();
  g.restore();
}
function drawDesign(g, r, d) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (d.kind === 'fish') drawFish(g, r); else if (d.kind === 'bird') drawBird(g, r); else drawText(g, r, d);
}
function blurData(src, px) {
  const c = L.makeCanvas(src.width, src.height), g = c.getContext('2d', { willReadFrequently: true });
  g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); g.filter = 'none';
  return g.getImageData(0, 0, c.width, c.height).data;
}

// ───────────────────────── a seal face, loaded with paste ─────────────────────────
function buildSeal(d) {
  const r = d.r, rim = Math.max(3.4, r * 0.05), M = Math.ceil(rim) + 3, N = 2 * Math.ceil(r + M), c0 = N / 2;
  const mc = L.makeCanvas(N, N), mg = mc.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, N, N);
  mg.translate(c0, c0); mg.rotate(d.ang);
  drawDesign(mg, r, d);
  const b1 = blurData(mc, 1.0), b2 = blurData(mc, Math.max(2.6, r * 0.045));
  const nz = L.makeNoise('s11seal' + d.seed);
  const Hh = new Float32Array(N * N), Mr = new Float32Array(N * N), Lp = new Float32Array(N * N), Tl = new Float32Array(N * N);
  const DEPTH = Math.min(6.5, 3.4 + r * 0.03);
  const ga = d.seed * 1.7, ca = Math.cos(ga), sa = Math.sin(ga);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = i - c0 + 0.5, y = j - c0 + 0.5;
    if (x * x + y * y > (r + rim + 2) * (r + rim + 2)) continue;
    const m1 = b1[k * 4] / 255, m2 = b2[k * 4] / 255;
    let m = sstep(0.38, 0.62, m1 + 0.14 * nz.fbm(x / 6.5, y / 6.5, 2));
    m *= 1 - 0.9 * sstep(0.52, 0.66, nz.n2(x / 19 + 40, y / 19 - 17)) * sstep(0.92, 0.5, m2);   // old chips along the edges of the design
    const st = nz.n2(x / 2.5 + 11, y / 2.5 - 5), lump = nz.fbm(x / 10 - 3, y / 10 + 8, 2);
    const tool = nz.n2((x * ca + y * sa) / 17 + 3, (-x * sa + y * ca) / 3.3 - 9);                 // chisel marks in the cut-away ground
    const ridge = sstep(0.55, 0.8, m2) * (1 - sstep(0.8, 0.98, m2));
    Hh[k] = DEPTH * m * (0.5 + 0.62 * sstep(0.12, 0.8, m2)) + m * (1.5 * ridge + 0.12 * st + 0.55 * lump) + (1 - m) * (0.12 * st + 0.6 * tool);
    Mr[k] = m; Lp[k] = lump; Tl[k] = tool;
  }
  const img = new ImageData(N, N), o = img.data, gl = new ImageData(N, N), go = gl.data;
  const hue = d.hue || 0;
  // paste: deep → nominal → thin and lit; pushed a little toward orange or toward crimson per seal
  const P0 = [206 + 6 * hue, 30 + 7 * hue, 20 - 3 * hue], P1 = [242 + 5 * hue, 56 + 12 * hue, 30 - 5 * hue];
  const s3 = Math.round(LS[0] * 3), t3 = Math.round(LS[1] * 3), s6 = Math.round(LS[0] * 6.5), t6 = Math.round(LS[1] * 6.5);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i, x = i - c0 + 0.5, y = j - c0 + 0.5, dist = Math.hypot(x, y);
    if (dist > r + rim + 0.5) continue;
    let cr, cg, cb, al = 1;
    if (dist <= r) {
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + N] - Hh[k - N]) * 0.5, inv = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const nx = -hx * inv, ny = -hy * inv;
      const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + inv * LIGHT[2]), rel = Math.min(1.7, diff / LIGHT[2]);
      const m = Mr[k], t = L.clamp(0.5 + 0.62 * Lp[k]), gv = 0.5 + 0.5 * Tl[k];
      const m2 = b2[k * 4] / 255;
      const resid = L.clamp(0.75 * sstep(-0.1, 0.5, Lp[k]) * (0.35 + m2));       // paste smeared into the ground beside the strokes
      let gr = 108 + 40 * gv, gg = 15 + 8 * gv, gb = 13 + 5 * gv;
      gr += (186 - gr) * resid; gg += (30 - gg) * resid; gb += (20 - gb) * resid;
      cr = gr + (P0[0] + (P1[0] - P0[0]) * t - gr) * m; cg = gg + (P0[1] + (P1[1] - P0[1]) * t - gg) * m; cb = gb + (P0[2] + (P1[2] - P0[2]) * t - gb) * m;
      // shadow the standing strokes throw into the ground, away from the light
      const sh = (1 - m) * Math.max(Mr[k + t3 * N + s3], 0.65 * Mr[k + t6 * N + s6]);
      let lit = (0.3 + 0.7 * rel) * (1 - 0.58 * sh) * (1 - 0.22 * (1 - m) * m2);
      lit *= 1 + 0.13 * ((x * LS[0] + y * LS[1]) / r);                                   // the face is a touch brighter toward the light
      cr *= lit; cg *= lit; cb *= lit;
      const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + inv * HALF[2]);
      const spec = Math.pow(nh, 46) * (0.18 + 0.82 * m) * (0.55 + 0.45 * t);
      cr += 255 * spec * 0.9; cg += 224 * spec * 0.9; cb += 200 * spec * 0.9;
      const gs = L.clamp(0.1 + 0.3 * t * t + 1.5 * Math.pow(nh, 26)) * m;
      go[k * 4] = 255; go[k * 4 + 1] = 236; go[k * 4 + 2] = 216; go[k * 4 + 3] = gs * 255;
    } else {
      // the rounded shoulder of the stone, stained by years of paste; it catches a hard glint toward the light
      const tt = L.clamp((dist - r) / rim), be = tt * 1.35, sb = Math.sin(be), cbv = Math.cos(be), ux = x / dist, uy = y / dist;
      const nx = ux * sb, ny = uy * sb;
      const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + cbv * LIGHT[2]);
      const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + cbv * HALF[2]);
      const v = 0.22 + 1.05 * diff, spec = Math.pow(nh, 30) * 0.9, st = 1 + 0.12 * nz.n2(x / 3 + 5, y / 3);
      cr = 132 * v * st + 255 * spec; cg = 30 * v * st + 208 * spec; cb = 24 * v * st + 190 * spec;
      al = L.clamp(r + rim - dist + 0.5);
    }
    o[k * 4] = cr; o[k * 4 + 1] = cg; o[k * 4 + 2] = cb; o[k * 4 + 3] = al * 255;
  }
  const sprite = L.makeCanvas(N, N); sprite.getContext('2d').putImageData(img, 0, 0);
  const gloss = L.makeCanvas(N, N); gloss.getContext('2d').putImageData(gl, 0, 0);
  const scratch = L.makeCanvas(N, N);
  return { sprite, gloss, scratch, sg: scratch.getContext('2d'), size: N };
}

// ───────────────────────── an impression on the paper ─────────────────────────
function buildPrint(d, pr, idx) {
  const r = d.r, N = 2 * Math.ceil(r + 6), c0 = N / 2;
  const mc = L.makeCanvas(N, N), mg = mc.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, N, N);
  mg.translate(c0, c0); mg.rotate(pr.ang); mg.scale(-1, 1);       // the print is the mirror image of the face
  drawDesign(mg, r, d);
  const b1 = blurData(mc, 1.0);
  const nz = L.makeNoise('s11print' + idx);
  const img = new ImageData(N, N), o = img.data;
  const px = Math.cos(pr.dir), py = Math.sin(pr.dir), fa = idx * 2.3 + 0.4, ca = Math.cos(fa), sa = Math.sin(fa);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = i - c0 + 0.5, y = j - c0 + 0.5;
    const m1 = b1[k * 4] / 255;
    if (m1 < 0.04) continue;
    let a = sstep(0.36, 0.64, m1 + 0.2 * nz.fbm(x / 5.5, y / 5.5, 2));
    a *= 1 - sstep(0.58, 0.7, nz.n2(x / 22 + 50, y / 22 + 3));                                    // broken, chipped passages
    if (a < 0.004) continue;
    const press = (x * px + y * py) / r, cov = nz.fbm(x / 34 + 7, y / 34 - 2, 3), fine = nz.n2(x / 1.7, y / 1.7);
    const fib = nz.n2((x * ca + y * sa) / 46, (-x * sa + y * ca) / 2.4);
    const t = 0.68 + 0.36 * cov + 0.15 * fine + 0.13 * fib - 0.36 * pr.dry * (press + 0.3);       // 飞白 where the pressure fell off
    const ink = sstep(0.22, 0.5, t);
    const edge = sstep(0.3, 0.52, m1) * sstep(1.0, 0.72, m1), dens = 0.5 + 0.5 * nz.n2(x / 9 + 3, y / 9);
    const q = L.clamp(0.2 + 0.5 * edge + 0.3 * dens * ink);
    o[k * 4] = 238 + (206 - 238) * q; o[k * 4 + 1] = 76 + (36 - 76) * q; o[k * 4 + 2] = 44 + (24 - 44) * q;
    o[k * 4 + 3] = a * (0.1 + 0.9 * ink) * 0.95 * 255;
  }
  const c = L.makeCanvas(N, N); c.getContext('2d').putImageData(img, 0, 0);
  return { canvas: c, size: N };
}

// ───────────────────────── paper + everything that rides on it ─────────────────────────
function buildMain(env, seals, prints, twinkles) {
  const a = env.arc;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 10, RW = W + PAD * 2, RH = H + PAD - Y0;
  return L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(X0, Y0, RW, RH);
    g.save(); a.clipBelow(g, 0);
    // the sheet: hot at the lit rim, deepening toward the middle of the disc
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 760, a.R, [[0, '#7e0a40'], [0.4, '#a80f50'], [0.78, '#c4165b'], [0.94, '#d81c68'], [1, '#ea2a78']]); full();
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.linear(g, 150, 480, 1750, 1180, [[0, 'rgba(255,255,255,0.4)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.45)']]); full();
    g.globalAlpha = 0.34;
    g.drawImage(L.noiseTex(RW, RH, { seed: 's11cloud', scale: 250, octaves: 4, warp: 0.7, res: 0.2, contrast: 1.5 }), X0, Y0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(L.noiseTex(RW, RH, { seed: 's11pulp', scale: 30, octaves: 3, warp: 0.5, res: 0.4, contrast: 1.7,
      ramp: [[0, 'rgba(112,4,56,0.4)'], [0.42, 'rgba(112,4,56,0)'], [0.62, 'rgba(255,70,150,0)'], [1, 'rgba(255,70,150,0.24)']] }), X0, Y0);
    // fibres: long wandering strands and a felt of short ones
    const fr = L.rng('s11fib'), fibers = [];
    const mk = (len, w) => {
      let x = fr.range(X0, X0 + RW), y = fr.range(Y0, Y0 + RH), ang = fr.range(0, TAU), curv = fr.range(-0.035, 0.035);
      const pts = [[x, y]];
      for (let s = 0; s < len; s += 7) { ang += curv + fr.range(-0.13, 0.13); x += Math.cos(ang) * 7; y += Math.sin(ang) * 7; pts.push([x, y]); }
      fibers.push({ pts, w, light: fr.chance(0.64), a: fr.range(0.35, 1) });
    };
    for (let i = 0; i < 300; i++) mk(fr.range(90, 430), fr.range(0.8, 2.3));
    for (let i = 0; i < 1500; i++) mk(fr.range(8, 46), fr.range(0.5, 1.2));
    const strokeFibers = (c, style, extra) => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const f of fibers) {
        c.strokeStyle = style(f); c.lineWidth = f.w + extra;
        c.beginPath(); c.moveTo(f.pts[0][0], f.pts[0][1]);
        for (let i = 1; i < f.pts.length; i++) c.lineTo(f.pts[i][0], f.pts[i][1]);
        c.stroke();
      }
    };
    strokeFibers(g, (f) => (f.light ? `rgba(255,122,182,${0.36 * f.a})` : `rgba(96,2,46,${0.3 * f.a})`), 0);
    // … and their relief under the raking light
    const hc = L.makeCanvas(RW, RH), hg = hc.getContext('2d');
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, RW, RH);
    hg.globalAlpha = 0.28; hg.drawImage(L.noiseTex(RW, RH, { seed: 's11tooth', scale: 7, octaves: 2, res: 0.5, contrast: 1.3 }), 0, 0); hg.globalAlpha = 1;
    hg.translate(-X0, -Y0);
    strokeFibers(hg, (f) => (f.light ? `rgba(255,255,255,${0.6 * f.a})` : `rgba(0,0,0,${0.35 * f.a})`), 0.8);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.7;
    g.drawImage(L.bumpLight(hc, { angle: 45, strength: 2.6, res: 0.5 }), X0, Y0);
    g.globalAlpha = 0.26;
    g.drawImage(L.grainTex(RW, RH, { seed: 's11grain', amount: 0.5, size: 1.5 }), X0, Y0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    // 洒金: gold dust in drifts, and a scatter of torn leaf
    const gr = L.rng('s11gold'), gn = L.makeNoise('s11gold');
    const GOLD = ['#e3b341', '#f2cf66', '#c9962c', '#f7e08e'];
    for (let i = 0; i < 5200; i++) {
      const x = gr.range(X0, X0 + RW), y = gr.range(Y0, Y0 + RH), rad = 0.5 + Math.pow(gr(), 3) * 1.5, al = gr.range(0.45, 1), c = gr.pick(GOLD);
      if (a.drAt(x, y) > -5 || gn.fbm(x / 210, y / 210, 2) < gr.range(-0.5, 0.35)) continue;
      g.globalAlpha = al; g.fillStyle = c; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    for (let i = 0; i < 700; i++) {
      const x = gr.range(X0, X0 + RW), y = gr.range(Y0, Y0 + RH), s = 2 + Math.pow(gr(), 2.4) * 6.4, n = gr.int(4, 6), a0 = gr.range(0, TAU);
      const pts = []; for (let q = 0; q < n; q++) { const an = a0 + (q / n) * TAU + gr.range(-0.3, 0.3), rr = s * gr.range(0.55, 1.15); pts.push([x + Math.cos(an) * rr, y + Math.sin(an) * rr]); }
      if (a.drAt(x, y) > -9 || gn.fbm(x / 210, y / 210, 2) < gr.range(-0.6, 0.3)) continue;
      g.globalAlpha = gr.range(0.8, 1);
      g.fillStyle = L.linear(g, x - s, y - s, x + s, y + s, [[0, '#fbe9a0'], [0.45, '#e3b341'], [1, '#a9781f']]);
      g.beginPath(); pts.forEach((q, qi) => (qi ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill();
      g.globalAlpha = 0.35; g.strokeStyle = '#5a0530'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(pts[0][0] + 0.8, pts[0][1] + 0.9); g.lineTo(pts[1][0] + 0.8, pts[1][1] + 0.9); g.stroke();
      if (s > 4.2 && x > 0 && x < W && y < H && !prints.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + 6) && !seals.some((q) => Math.hypot(q.x - x, q.y - y) < q.r * 1.6 + 10)) twinkles.push({ x, y, s, ph: gr() });
    }
    g.globalAlpha = 1;

    // impressions: a faint halo where the oil of the paste has crept into the paper, then the vermilion itself
    for (const pr of prints) {
      g.fillStyle = L.radial(g, pr.x, pr.y, pr.r * 0.5, pr.r * 1.16, [[0, 'rgba(120,6,58,0.34)'], [0.8, 'rgba(120,6,58,0.22)'], [1, 'rgba(120,6,58,0)']]);
      g.beginPath(); g.arc(pr.x, pr.y, pr.r * 1.16, 0, TAU); g.fill();
    }
    for (const pr of prints) g.drawImage(pr.canvas, pr.x - pr.size / 2, pr.y - pr.size / 2);

    // the cut edge of the sheet catches the light
    g.lineWidth = 50; g.strokeStyle = 'rgba(255,92,154,0.15)'; a.stroke(g, -24);
    g.lineWidth = 15; g.strokeStyle = 'rgba(255,158,200,0.42)'; a.stroke(g, -7);
    g.lineWidth = 3.2; g.strokeStyle = 'rgba(255,220,232,0.94)'; a.stroke(g, -1.4);

    // shadows of the seals: each stands a few centimetres tall, so its shadow slides out toward the lower right
    const sh = L.blurred(L.makeLayer(PAD, (b) => {
      b.strokeStyle = '#2a0018'; b.lineCap = 'round';
      for (const s of seals) { b.lineWidth = s.r * 2.02; b.beginPath(); b.moveTo(s.x + 3, s.y + 4); b.lineTo(s.x - LS[0] * (s.r * 0.36 + 12), s.y - LS[1] * (s.r * 0.36 + 12)); b.stroke(); }
    }), 9);
    g.globalAlpha = 0.6; g.drawImage(sh, -PAD, -PAD); g.globalAlpha = 1;
    g.restore();

    // the seals themselves, each with a breath of red spilling into the lacquer around it
    g.save(); a.clipAbove(g, 0);
    for (const s of seals) {
      g.fillStyle = L.radial(g, s.x, s.y, s.r * 0.9, s.r * 1.55, [[0, 'rgba(224,48,30,0.26)'], [0.4, 'rgba(190,30,22,0.1)'], [1, 'rgba(150,20,16,0)']]);
      g.beginPath(); g.arc(s.x, s.y, s.r * 1.55, 0, TAU); g.fill();
    }
    g.restore();
    for (const s of seals) g.drawImage(s.sprite, s.x - s.size / 2, s.y - s.size / 2);
  });
}

function buildBg(env) {
  const a = env.arc, c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#07060a'; g.fillRect(0, 0, W, H);
  // the faintest cold sheen far off in the lacquer
  g.fillStyle = L.linear(g, 0, 0, W * 0.75, H * 0.62, [[0, 'rgba(52,28,60,0.2)'], [0.5, 'rgba(26,12,32,0.07)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, 0, W, H);
  // the sheet's colour bleeding onto the polished black beside its edge
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 150, [[0, 'rgba(206,28,100,0.42)'], [0.12, 'rgba(170,18,80,0.2)'], [0.45, 'rgba(110,8,54,0.07)'], [1, 'rgba(60,0,30,0)']]);
  g.fillRect(0, 0, W, H);
  return c;
}

export default {
  name: '印蜕',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const seals = SEALS.map((d) => {
      const th = d.s / a.R, q = a.pt(th, d.r * d.up);
      return { ...d, ...buildSeal(d), x: q.x, y: q.y };
    });
    const prints = PRINTS.map((pr, i) => { const d = SEALS[pr.like]; return { ...pr, r: d.r, ...buildPrint(d, pr, i) }; });
    const twinkles = [];
    const main = buildMain(env, seals, prints, twinkles);
    const dr = L.rng('s11dust'), dust = [];
    for (let i = 0; i < 46; i++) dust.push({ th: dr.range(-0.6, 0.6), dr: 26 + Math.pow(dr(), 1.25) * 540, r: dr.range(0.6, 2.1), a: dr.range(0.16, 0.72), c: dr.pick(['#f4e6d6', '#ffb7d2', '#e3b341', '#f4e6d6']), ph: dr(), k: dr.range(0.3, 1) });
    S = { bg: buildBg(env), main, seals, dust, twinkles: twinkles.slice(0, 40) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.009, 0.009, p), zoom = L.lerp(1.0, 1.012, p);
    ctx.drawImage(S.bg, 0, 0);
    // dust on the lacquer, drifting a little less than the sheet
    ctx.save();
    for (const d of S.dust) {
      const q = a.pt(d.th + rot * 0.4, d.dr - 5 * p * d.k);
      ctx.globalAlpha = d.a * (0.72 + 0.28 * Math.sin(TAU * (p * 0.7 + d.ph)));
      ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(q.x, q.y, d.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    L.blit(ctx, env, S.main, { rot, zoom });
    L.cam(ctx, env, { rot, zoom }, () => {
      // the oily sheen of the paste wanders across each face
      ctx.globalCompositeOperation = 'screen';
      for (const s of S.seals) {
        const sg = s.sg, n = s.size, e = L.ease.inOutQuad(p);
        const hx = n / 2 + s.r * L.lerp(-0.46, -0.1, e), hy = n / 2 + s.r * L.lerp(-0.44, -0.2, e);
        sg.globalCompositeOperation = 'copy'; sg.drawImage(s.gloss, 0, 0);
        sg.globalCompositeOperation = 'source-in';
        sg.fillStyle = L.radial(sg, hx, hy, 0, s.r * 0.66, [[0, 'rgba(255,242,226,1)'], [0.5, 'rgba(255,214,190,0.55)'], [1, 'rgba(255,190,170,0)']]);
        sg.fillRect(0, 0, n, n);
        ctx.drawImage(s.scratch, s.x - n / 2, s.y - n / 2);
      }
      // gold leaf winking as the light slides
      for (const t of S.twinkles) {
        const k = Math.pow(Math.max(0, Math.sin(TAU * (p * 0.85 + t.ph))), 5);
        if (k < 0.04) continue;
        const rad = 6 + t.s * 2.2;
        ctx.fillStyle = L.radial(ctx, t.x, t.y, 0, rad, [[0, `rgba(255,246,206,${0.9 * k})`], [0.3, `rgba(255,222,130,${0.4 * k})`], [1, 'rgba(255,200,90,0)']]);
        ctx.fillRect(t.x - rad, t.y - rad, rad * 2, rad * 2);
      }
    });
    L.vignette(ctx, { strength: 0.26 });
  },
};
