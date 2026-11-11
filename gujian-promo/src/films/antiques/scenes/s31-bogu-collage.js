// s31 — 博古图剪纸拼贴. A hand-made paper collage of a 博古图 (scholar's "antiques" picture).
// Cream card above; the arc is the torn top edge of one big sheet of ultramarine paper, its white core showing along the tear.
// Glued on the blue sheet, big naive scissor-cut shapes that overlap each other and run off the bottom of frame: an orange
// folding fan, a lemon-yellow jade disc (璧) leaning on two thread-bound books, a vermilion long-necked vase, a green ruyi
// sceptre, an aubergine tripod censer sitting on a scrap of white paper scribbled with pencil, and a wisp of pink tissue
// cut into a lingzhi. Everything is one rigid piece of artwork: the camera only slips a few pixels along the arc.
import * as L from '../../../lib/core.js';

const { W, H, TAU } = L;
const PAD = 40;
const GW = W + PAD * 2, GH = H + PAD * 2;
let S = null;
let T = null;      // shared paper textures (only alive during init)

const C = {
  card: '#eee8d8', blue: '#2452a0', red: '#d0281e', green: '#3f9a58', yellow: '#f3e37a',
  purple: '#2a2150', brown: '#5c2616', orange: '#e8862a', pink: '#d59ad8', white: '#f6f3ea', label: '#eadfc2',
};

// ───────────────────────── paper textures (grey, 128 = neutral → composited with hard-light) ─────────────────────────
function buildTextures() {
  const grey = (lo, hi) => [[0, `rgb(${lo},${lo},${lo})`], [1, `rgb(${hi},${hi},${hi})`]];
  // 1) tooth: the flocked mottle of sugar paper — a soft salt-and-pepper of fibre clumps, laid mostly one way, with a breath of
  //    relief, per-pixel grain and a scatter of short pale and dark fibres
  const tooth = L.makeCanvas(GW, GH); const g = tooth.getContext('2d');
  const mott = L.noiseTex(GW, GH, { seed: 'a31mott', scale: 3.6, octaves: 2, gain: 0.6, res: 1, contrast: 2.1, ramp: grey(86, 170) });
  g.drawImage(mott, 0, 0);
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55;
  g.drawImage(L.noiseTex(GW, GH, { seed: 'a31lay', scale: 10, sx: 0.4, sy: 5, octaves: 2, res: 0.5, contrast: 1.8, ramp: grey(64, 192) }), 0, 0);
  g.globalAlpha = 0.6;
  g.drawImage(L.bumpLight(mott, { angle: 45, strength: 0.4, res: 0.5 }), 0, 0);
  g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(GW, GH, { seed: 'a31tooth', amount: 0.22 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const r = L.rng('a31fib'); g.lineCap = 'round';
  for (let i = 0; i < 30000; i++) {
    const x = r() * GW, y = r() * GH, len = r.range(2, 9) * (r.chance(0.04) ? 3.2 : 1);
    const a = r.chance(0.3) ? r() * Math.PI : Math.PI / 2 + r.gauss() * 0.4;
    g.strokeStyle = r.chance(0.6) ? `rgba(255,255,255,${r.range(0.07, 0.3).toFixed(3)})` : `rgba(0,0,0,${r.range(0.06, 0.22).toFixed(3)})`;
    g.lineWidth = r.range(0.6, 1.6);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + r.range(-1.5, 1.5), y + Math.sin(a) * len * 0.5 + r.range(-1.5, 1.5), x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  L.speckle(g, { seed: 'a31inc', count: 700, x: 0, y: 0, w: GW, h: GH, rMin: 0.6, rMax: 1.9, colors: ['#000', '#fff', '#fff'], alpha: [0.05, 0.26] });

  // 2) cloud: slow tonal drift of the dye
  const cloud = L.noiseTex(GW, GH, { seed: 'a31cloud', scale: 260, octaves: 3, res: 0.08, contrast: 1.4, ramp: grey(106, 150) });

  // 3) wrinkle: paper that was wetted with paste dries into long soft ridges and a few sharper creases
  const wh = L.makeCanvas(GW, GH); const wg = wh.getContext('2d');
  wg.drawImage(L.noiseTex(GW, GH, { seed: 'a31wr1', scale: 170, sx: 0.5, sy: 2.2, octaves: 2, gain: 0.45, warp: 0.9, res: 0.1 }), 0, 0);
  wg.globalAlpha = 0.5;
  wg.drawImage(L.noiseTex(GW, GH, { seed: 'a31wr2', scale: 130, sx: 0.4, sy: 3, octaves: 2, gain: 0.4, warp: 0.6, ridged: true, res: 0.1 }), 0, 0);
  const wrinkle = L.bumpLight(wh, { angle: 45, strength: 2.6, res: 0.25, blur: 2.5 });

  // 4) crumple: flat-shaded facets with thin creases between them (thin paper that was creased, then smoothed flat)
  const res = 0.25, cw = Math.round(GW * res), ch = Math.round(GH * res);
  const nz = L.makeNoise('a31crumple');
  const img = new ImageData(cw, ch); const d = img.data;
  let k = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const u0 = x / res / 170, v0 = y / res / 170;
    const u = u0 + 0.3 * nz.n2(u0 * 0.8 + 3.1, v0 * 0.8), v = v0 + 0.3 * nz.n2(u0 * 0.8 - 5.2, v0 * 0.8 + 9.4);
    const c1 = nz.cell(u, v), c2 = nz.cell(u * 2.3 + 11.3, v * 2.3 + 7.1);
    let s = 128 + (c1.id - 0.5) * 56 + (c2.id - 0.5) * 26;
    s += 16 * Math.exp(-(c1.edge * c1.edge) / 0.0014) + 7 * Math.exp(-(c2.edge * c2.edge) / 0.003);
    d[k++] = s; d[k++] = s; d[k++] = s; d[k++] = 255;
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  const crumple = L.makeCanvas(GW, GH); const cg = crumple.getContext('2d');
  cg.imageSmoothingQuality = 'high'; cg.filter = 'blur(1.2px)';
  cg.drawImage(small, 0, 0, GW, GH);
  return { tooth, cloud, wrinkle, crumple };
}

// ───────────────────────── geometry helpers ─────────────────────────
/** local shape → frame: scale, rotate (rad, clockwise on screen), translate; keeps the "corner" flag in p[2] */
function xf(pts, { at = [0, 0], rot = 0, scale = 1 } = {}) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return pts.map((p) => { const x = p[0] * scale, y = p[1] * scale; const q = [at[0] + x * c - y * s, at[1] + x * s + y * c]; if (p[2]) q[2] = 1; return q; });
}
/**
 * Hand-cut outline. ctrl: [[x, y, corner?, torn?], …] closed. Each run between corners is splined, then pulled part of the way
 * toward straight snips of very uneven length (scissors go round a curve in bites, and no two bites are alike); the hand
 * wavers a little along every cut and the fibres leave the edge faintly ragged. A run whose first point carries torn = 1 is
 * ripped instead of cut. Returns a dense polygon (≈ 3 px steps).
 */
function cut(ctrl, seed, o = {}) {
  const { facet = [46, 170], flat = [0.3, 0.95], wob = 1.3, fuzz = 0.35 } = o;
  const r = L.rng('a31cut' + seed), nz = L.makeNoise('a31cut' + seed);
  const n = ctrl.length;
  let s = ctrl.findIndex((p) => p[2]); if (s < 0) s = 0;
  const pts = ctrl.slice(s).concat(ctrl.slice(0, s));
  const out = [];
  let i = 0, al = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && !pts[j][2]) j++;
    const run = [];
    for (let q = i; q <= j; q++) run.push([pts[q % n][0], pts[q % n][1]]);
    const torn = !!pts[i][3], straight = run.length === 2;
    const dense = L.smoothPath(run, 3), m = dense.length;
    if (!torn && !straight) {
      let a = 0;
      while (a < m - 1) {
        const want = r.range(facet[0], facet[1]) * (r.chance(0.2) ? 0.5 : 1);
        let b = a, acc = 0;
        while (b < m - 1 && acc < want) { acc += Math.hypot(dense[b + 1][0] - dense[b][0], dense[b + 1][1] - dense[b][1]); b++; }
        if (m - 1 - b < 5) b = m - 1;
        const f = r.range(flat[0], flat[1]), A = dense[a], B = dense[b];
        for (let q = a + 1; q < b; q++) {
          const t = (q - a) / (b - a);
          dense[q] = [L.lerp(dense[q][0], L.lerp(A[0], B[0], t), f), L.lerp(dense[q][1], L.lerp(A[1], B[1], t), f)];
        }
        a = b;
      }
    }
    for (let q = 0; q < m - 1; q++) {
      const a = dense[Math.max(0, q - 1)], b = dense[Math.min(m - 1, q + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const ends = Math.min(1, q / 5, (m - 1 - q) / 5);
      const d = torn
        ? ends * (3.2 * nz.fbm(al / 30, 3.1, 3) + 1.5 * nz.n2(al / 3.4, 8.8))
        : ends * wob * nz.n2(al / 95, 1.7) + fuzz * nz.n2(al / 2.3, 5.5);
      out.push([dense[q][0] + nx * d, dense[q][1] + ny * d]);
      al += 3;
    }
    i = j;
  }
  return out;
}
/** control points of a disc cut freehand: never quite round */
function disc(cx, cy, rad, n, seed, wobble = 0.035) {
  const r = L.rng('a31round' + seed); const a0 = r() * TAU; const pts = [];
  for (let i = 0; i < n; i++) { const a = a0 + ((i + r.range(-0.2, 0.2)) / n) * TAU, q = rad * (1 + r.range(-wobble, wobble)); pts.push([cx + q * Math.cos(a), cy + q * Math.sin(a)]); }
  return pts;
}
/** the two edges of a tapered strip along a centre line (smoothed); wf(t) → full width */
function strip(ctrl, wf, step = 6) {
  const p = L.smoothPath(ctrl, step), n = p.length, A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const hw = wf(i / (n - 1)) / 2;
    A.push([p[i][0] + nx * hw, p[i][1] + ny * hw]); B.push([p[i][0] - nx * hw, p[i][1] - ny * hw]);
  }
  return { A, B };
}

// ───────────────────────── one piece of paper ─────────────────────────
let seq = 0;
/**
 * Glue a piece of paper onto the layer. polys = one closed polygon or several (even-odd → holes).
 * o: color, alpha (thin paper lets what is underneath show through), grain / cloud / wrinkle / crumple (texture strengths),
 *    lay (direction of the paper's fibre, rad; every piece was cut from a sheet turned its own way),
 *    lift + sh (how far it stands off the sheet, shadow strength), edge (paper thickness), curl (light falling across it),
 *    creases [[x0,y0,x1,y1,strength]], peel [[x,y,r]] (a corner that has come unstuck), shadow (false → none)
 */
function paper(g, polys, o) {
  if (typeof polys[0][0] === 'number') polys = [polys];
  const { color, alpha = 1, grain = 0.55, cloud = 0.24, wrinkle = 0.3, crumple = 0, lift = 1, sh = 1, edge = 1, curl = 1, creases = null, peel = null, shadow = true } = o;
  const r = L.rng('a31pp' + (o.seed !== undefined ? o.seed : seq++));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of polys) for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  x0 = Math.max(x0, -PAD); y0 = Math.max(y0, -PAD); x1 = Math.min(x1, W + PAD); y1 = Math.min(y1, H + PAD);
  const bw = x1 - x0, bh = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.hypot(bw, bh) / 2 + 6;
  const lay = o.lay !== undefined ? o.lay : (r.chance(0.5) ? 0 : Math.PI / 2) + r.range(-0.3, 0.3) + (r.chance(0.5) ? Math.PI : 0);
  const path = () => {
    g.beginPath();
    for (const p of polys) { g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }
  };
  if (shadow) {
    // shadows on their own: the shape is drawn far off-canvas and only its shadow lands here (so thin paper can stay translucent)
    const BIG = 9000;
    const cast = (blur, dx, dy, al) => {
      g.save(); g.translate(-BIG, 0);
      g.shadowColor = `rgba(4,8,34,${al.toFixed(3)})`; g.shadowBlur = blur; g.shadowOffsetX = BIG + dx; g.shadowOffsetY = dy;
      g.fillStyle = '#000'; path(); g.fill('evenodd'); g.restore();
    };
    // a corner that has come unstuck throws a deeper, softer shadow
    if (peel) for (const [px, py, pr] of peel) {
      g.save(); g.translate(6, 10);
      g.shadowColor = 'rgba(0,0,0,0)';
      g.fillStyle = L.radial(g, px - 6, py - 10, 0, pr, [[0, 'rgba(4,8,34,0.3)'], [0.5, 'rgba(4,8,34,0.15)'], [1, 'rgba(4,8,34,0)']]);
      g.filter = 'blur(6px)'; path(); g.fill('evenodd'); g.restore();
    }
    cast(9 * lift, 2.4 * lift, 4.2 * lift, 0.17 * sh);
    cast(2, 0.8, 1.4, 0.36 * sh);
  }
  g.save(); g.globalAlpha = alpha; g.fillStyle = color; path(); g.fill('evenodd'); g.restore();
  // everything else stays inside the piece
  g.save(); path(); g.clip('evenodd');
  // a texture laid over the piece: turned to this piece's own fibre direction when the piece is small enough for the texture to cover
  const place = (tex, al, mode = 'hard-light', ang = 0) => {
    g.save(); g.globalCompositeOperation = mode; g.globalAlpha = al;
    if (ang && rad < GH / 2 - 2) {
      g.translate(cx, cy); g.rotate(ang);
      g.drawImage(tex, -r.range(rad, GW - rad), -r.range(rad, GH - rad));
    } else {
      g.drawImage(tex, x0 - 4 - r.range(0, Math.max(0, GW - bw - 8)), y0 - 4 - r.range(0, Math.max(0, GH - bh - 8)));
    }
    g.restore();
  };
  if (cloud > 0) place(T.cloud, cloud);
  if (crumple > 0) place(T.crumple, crumple);
  if (wrinkle > 0) place(T.wrinkle, wrinkle, 'hard-light', lay + r.range(-0.5, 0.5));
  if (grain > 0) place(T.tooth, grain, 'hard-light', lay);
  const pc = L.parseColor(color), lum = (0.299 * pc[0] + 0.587 * pc[1] + 0.114 * pc[2]) / 255;
  if (creases) for (const [ax, ay, bx, by, st = 1] of creases) {
    // a fold that was pressed flat again: the face turned to the light is a touch brighter, the other a touch darker
    const ang = Math.atan2(by - ay, bx - ax), len = Math.hypot(bx - ax, by - ay), wd = 70;
    const up = (Math.cos(ang) * -0.8 - Math.sin(ang) * -0.6) > 0 ? 1 : -1;   // which side of the fold faces the upper-left light
    g.save(); g.translate(ax, ay); g.rotate(ang);
    const hi = (0.05 + 0.07 * lum) * st, lo = 0.08 * st;
    g.fillStyle = L.linear(g, 0, -wd * up, 0, 0, [[0, 'rgba(255,255,255,0)'], [1, `rgba(255,255,255,${hi.toFixed(3)})`]]);
    g.fillRect(-60, Math.min(0, -wd * up), len + 120, wd);
    g.fillStyle = L.linear(g, 0, 0, 0, wd * up, [[0, `rgba(0,0,24,${lo.toFixed(3)})`], [1, 'rgba(0,0,24,0)']]);
    g.fillRect(-60, Math.min(0, wd * up), len + 120, wd);
    g.restore();
  }
  if (curl > 0) {
    // no sheet lies perfectly flat: the light falls off a little across it
    const a = L.deg(52) + r.range(-0.5, 0.5);
    const dx = Math.cos(a) * rad, dy = Math.sin(a) * rad;
    g.fillStyle = L.linear(g, cx - dx, cy - dy, cx + dx, cy + dy, [[0, `rgba(255,252,240,${(0.07 * curl * (0.3 + 0.7 * lum)).toFixed(3)})`], [0.45, 'rgba(255,252,240,0)'], [0.6, 'rgba(0,0,24,0)'], [1, `rgba(0,0,24,${(0.08 * curl).toFixed(3)})`]]);
    g.fillRect(x0 - 8, y0 - 8, bw + 16, bh + 16);
  }
  if (peel) for (const [px, py, pr] of peel) {
    g.fillStyle = L.radial(g, px, py, 0, pr * 0.85, [[0, 'rgba(255,255,250,0.14)'], [0.6, 'rgba(255,255,250,0.04)'], [1, 'rgba(255,255,250,0)']]);
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  if (edge > 0) {
    // paper thickness, barely: the cut edge is a breath paler toward the light and a breath darker away from it
    g.lineJoin = 'round'; g.lineWidth = 1.6;
    g.save(); g.translate(0.9, 1.2); g.strokeStyle = `rgba(255,255,255,${(0.07 * edge * (1.2 - lum)).toFixed(3)})`; path(); g.stroke(); g.restore();
    g.save(); g.translate(-0.9, -1.2); g.strokeStyle = `rgba(0,0,16,${(0.1 * edge).toFixed(3)})`; path(); g.stroke(); g.restore();
  }
  g.restore();
}

// ───────────────────────── the shapes ─────────────────────────
// long-necked vase: mouth, neck, shoulder, belly (its lower half runs off the bottom of frame). Local: x from the axis, y from the mouth.
const VASE = [
  [-47, 2, 1], [51, -2, 1], [57, 17, 1], [38, 34, 1],
  [31, 90], [30, 152], [38, 198], [68, 238], [110, 276], [137, 324], [143, 370], [129, 420], [100, 464], [80, 494, 1],
  [84, 560, 1], [-82, 560, 1], [-78, 496, 1],
  [-96, 468], [-125, 424], [-141, 375], [-137, 328], [-113, 281], [-73, 243], [-44, 206], [-33, 160], [-30, 98], [-37, 40, 1], [-55, 22, 1],
];
// ruyi head (云头): three lobes round a pointed neck. Local origin = centre of the head, neck pointing +y.
const RUYI_HEAD = [
  [-24, 82, 1], [-60, 76], [-98, 54], [-114, 14], [-102, -24], [-74, -38], [-57, -30, 1],
  [-54, -62], [-30, -90], [4, -97], [36, -86], [56, -60], [59, -28, 1],
  [78, -37], [106, -19], [116, 16], [98, 55], [60, 76], [24, 84, 1],
];
// small tripod censer: two loop ears standing on a flat rim, a squat drum belly, three short legs. Local origin = middle of the rim.
const CENSER = [
  [-126, 0, 1], [-103, 0, 1], [-107, -30], [-93, -47], [-66, -47], [-51, -30], [-55, 0, 1],
  [55, 0, 1], [52, -30], [66, -46], [93, -47], [107, -30], [103, 0, 1], [126, 0, 1],
  [121, 17, 1], [106, 28], [140, 62], [152, 104], [138, 146], [118, 166, 1],
  [129, 226, 1], [94, 228, 1], [84, 176, 1], [54, 184], [20, 188, 1], [18, 232, 1], [-16, 233, 1], [-20, 188, 1],
  [-54, 184], [-84, 176, 1], [-97, 228, 1], [-131, 225, 1], [-118, 166, 1],
  [-138, 146], [-152, 104], [-140, 62], [-106, 28], [-121, 17, 1],
];
// lingzhi: a kidney-shaped cap on a bent stalk. Local origin = middle of the cap.
const LINGZHI = [
  [-88, 6, 1], [-72, -30], [-32, -52], [16, -54], [62, -37], [90, 2, 1],
  [52, 14], [22, 8], [-8, 18, 1], [0, 60], [14, 120, 1], [-18, 122, 1], [-30, 60], [-34, 22, 1], [-62, 15],
];

// ───────────────────────── the collage ─────────────────────────
function buildCollage(env) {
  const a = env.arc;
  const art = L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, GW, GH);
    const line = (e) => { g.beginPath(); g.moveTo(e[0][0], e[0][1]); for (let i = 1; i < e.length; i++) g.lineTo(e[i][0], e[i][1]); };
    const clipTo = (poly) => { g.beginPath(); g.moveTo(poly[0][0], poly[0][1]); for (const q of poly) g.lineTo(q[0], q[1]); g.closePath(); g.clip(); };
    const corners = (pts) => pts.map((p) => [p[0], p[1], 1]);

    // ── the card everything is mounted on: clean, calm, only its tooth ──
    g.fillStyle = C.card; full();
    g.save(); g.globalCompositeOperation = 'hard-light';
    g.translate(W / 2, H / 2); g.rotate(Math.PI); g.translate(-W / 2, -H / 2);
    g.globalAlpha = 0.2; g.drawImage(T.tooth, -PAD, -PAD);
    g.globalAlpha = 0.08; g.drawImage(T.cloud, -PAD, -PAD);
    g.restore();

    // ── the torn edge of the big blue sheet: coloured skin (drB) and the white core that outruns it (drW) ──
    const nz = L.makeNoise('a31tear');
    const s = a.span(PAD + 150), n = Math.ceil((2 * s * a.R) / 2);
    const eB = [], eW = [], prof = [];
    for (let i = 0; i <= n; i++) {
      const th = L.lerp(-s, s, i / n), al = th * a.R;
      const bay = Math.pow(Math.max(0, nz.n2(al / 230, 4.2) - 0.2) / 0.8, 1.2);             // stretches where the skin peeled back further
      const und = 1.6 * nz.n2(al / 430, 9.9);                                               // the whole tear wanders a little
      const drB = L.clamp(0.5 + und + 1.5 * nz.fbm(al / 52, 1.3, 3) + 0.9 * nz.n2(al / 6.5, 7.7) - 5 * bay, -5.2, 3.6);
      const wide = L.clamp(0.5 + 0.62 * nz.n2(al / 150 + 30, 12.1));
      const w = L.clamp(0.4 + 7 * wide * wide * wide + 6 * bay + 1.2 * nz.n2(al / 17, 3.3) + 0.7 * nz.n2(al / 4.3, 5.5), 0, 12);
      const drW = Math.min(8.5, drB + w);
      const pb = a.pt(th, drB), pw = a.pt(th, drW);
      eB.push([pb.x, pb.y]); eW.push([pw.x, pw.y]); prof.push([th, drB, drW, w]);
    }
    const bottom = H + PAD + 60;
    const sheet = (e) => e.concat([[e[e.length - 1][0], bottom], [e[0][0], bottom]]);
    // the faintest contact shadow of the sheet on the card
    g.save(); g.strokeStyle = 'rgba(84,62,30,0.24)'; g.lineWidth = 2.6; g.translate(0.6, -0.5); g.filter = 'blur(1.8px)'; line(eW); g.stroke(); g.restore();
    paper(g, sheet(eW), { color: '#fcfbf6', grain: 0.5, cloud: 0, wrinkle: 0, edge: 0, curl: 0, shadow: false, seed: 'core' });
    paper(g, sheet(eB), { color: C.blue, grain: 0.62, cloud: 0.3, wrinkle: 0.22, edge: 0, curl: 0, shadow: false, seed: 'sheet' });
    // the skin is stressed pale right at the tear
    g.save(); clipTo(sheet(eB));
    g.strokeStyle = 'rgba(206,224,255,0.2)'; g.lineWidth = 4.5; g.translate(0, 2); g.filter = 'blur(1.3px)'; line(eB); g.stroke();
    g.restore();
    // fuzz: white fibres standing off the core, blue shreds straying onto it
    const rf = L.rng('a31fuzz'); g.lineCap = 'round';
    for (let i = 0; i < 4200; i++) {
      const [th, drB, drW, w] = prof[rf.int(0, n)];
      const blue = rf.chance(0.4);
      if (!blue && w < 1.2 && rf.chance(0.7)) continue;
      const p = a.pt(th, blue ? drB + rf.range(-0.6, 1.6) : drW + rf.range(-1.4, 0.4));
      const dir = th - Math.PI / 2 + rf.gauss() * 0.9, len = blue ? rf.range(0.8, 2.8) : rf.range(1, 4.5) * (rf.chance(0.05) ? 2.2 : 1);
      g.strokeStyle = blue ? L.rgba(rf.chance(0.5) ? C.blue : '#3f6cb2', rf.range(0.4, 0.9)) : L.rgba('#fffefa', rf.range(0.25, 0.8));
      g.lineWidth = rf.range(0.5, 1.1);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len); g.stroke();
    }

    const gaps = [];
    const check = (name, poly) => { let m = -1e9; for (const q of poly) m = Math.max(m, a.drAt(q[0], q[1])); gaps.push(name + ':' + m.toFixed(0)); };

    // ── two thread-bound books: aubergine underneath, brown on top with its blank title slip and the binding thread ──
    {
      const bookA = xf([[0, 0, 1], [300, 4, 1], [296, 440, 1], [-3, 440, 1]], { at: [522, 916], rot: L.deg(8) });
      paper(g, cut(bookA, 'bookA'), { color: C.purple, lift: 0.8 });
      const at = [588, 872], rot = L.deg(-5.5), BW = 306;
      const bookB = xf([[0, 0, 1], [BW, -2, 1], [BW + 3, 450, 1], [-3, 452, 1]], { at, rot });
      check('book', bookB);
      paper(g, cut(bookB, 'bookB'), { color: C.brown, grain: 0.62, cloud: 0.3, wrinkle: 0.4, lift: 1, peel: [[892, 846, 90]] });
      const slip = xf([[24, 50, 1], [86, 46, 1], [88, 300, 1], [26, 304, 1]], { at, rot });
      paper(g, cut(slip, 'slip'), { color: C.label, grain: 0.45, lift: 0.3, sh: 0.8, wrinkle: 0.2 });
      // 四眼线装: one thread down the spine side, a wrap round the spine at each hole (right-hand side), drawn with a white crayon
      const sx = BW - 26, holes = [60, 178, 296, 414];
      const rs = L.rng('a31stitch');
      const to = (x, y) => xf([[x, y]], { at, rot })[0];
      const th = (pts, sd) => L.chalkStroke(g, pts, { width: 6, color: '#f2ead6', density: 0.9, alpha: 0.95, jitter: 0.8, seed: sd });
      th([to(sx + rs.range(-1, 1), 3), to(sx + rs.range(-2, 2), 150), to(sx + rs.range(-2, 2), 300), to(sx + rs.range(-1, 1), 448)], 1);
      holes.forEach((hy, i) => th([to(sx - 1, hy + rs.range(-2, 2)), to(BW, hy + rs.range(-4, 4))], 5 + i));
    }

    // ── folding fan: ribs gathered toward one rivet (just below frame), a pleated orange leaf, the two guard sticks ──
    {
      const P = [240, 1160], Ro = 430, Ri = 196, t0 = L.deg(-80), t1 = L.deg(55), N = 8;
      const r = L.rng('a31fan');
      const pt = (th, rad, off = 0) => [P[0] + rad * Math.sin(th) + off * Math.cos(th), P[1] - rad * Math.cos(th) + off * Math.sin(th)];
      const bounds = []; for (let i = 0; i <= N; i++) bounds.push(L.lerp(t0, t1, (i + (i > 0 && i < N ? r.range(-0.24, 0.24) : 0)) / N));
      const stick = (th, r0, r1, w0, w1, sd) => cut(corners([pt(th, r0, -w0 / 2), pt(th, r0, w0 / 2), pt(th, r1, w1 / 2), pt(th, r1, -w1 / 2)]), 'stick' + sd, { wob: 0.8 });
      for (let i = 2; i < N; i += 2) paper(g, stick(bounds[i] + r.range(-0.02, 0.02), -20, Ri + r.range(18, 34), r.range(17, 21), r.range(24, 30), i), { color: C.brown, lift: 0.4, sh: 0.8, curl: 0, wrinkle: 0 });
      const outer = bounds.map((th, i) => pt(th, Ro - (i % 2 ? 10 : 0) + r.range(-5, 4)));
      const inner = bounds.map((th, i) => pt(th, Ri + (i % 2 ? 7 : 0) + r.range(-4, 4))).reverse();
      const leaf = cut(corners(outer.concat(inner)), 'leaf', { wob: 1.0 });
      check('fan', leaf);
      paper(g, leaf, { color: C.orange, cloud: 0.3, wrinkle: 0.24, lift: 1.1, lay: 0.2, peel: [[pt(bounds[6], Ro)[0], pt(bounds[6], Ro)[1], 120]] });
      // the pleats: alternate faces turn a little to and from the light; mountain folds catch a hairline, valleys a thin shade
      g.save(); clipTo(leaf);
      for (let i = 0; i < N; i++) {
        const p0 = pt(bounds[i], Ri - 12), p1 = pt(bounds[i], Ro + 12), p2 = pt(bounds[i + 1], Ro + 12), p3 = pt(bounds[i + 1], Ri - 12);
        g.fillStyle = i % 2 ? `rgba(70,14,0,${r.range(0.05, 0.11).toFixed(3)})` : `rgba(255,238,200,${r.range(0.02, 0.08).toFixed(3)})`;
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.closePath(); g.fill();
      }
      for (let i = 1; i < N; i++) {
        const p0 = pt(bounds[i], Ri), p1 = pt(bounds[i], Ro);
        g.strokeStyle = i % 2 ? 'rgba(80,20,0,0.22)' : 'rgba(255,244,214,0.26)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      }
      g.restore();
      paper(g, stick(t0 + 0.014, -24, Ro + 6, 22, 30, 'a'), { color: C.brown, lift: 0.5, curl: 0.4, wrinkle: 0 });
      paper(g, stick(t1 - 0.014, -24, Ro + 6, 22, 30, 'b'), { color: C.brown, lift: 0.5, curl: 0.4, wrinkle: 0 });
    }

    // ── a scrap of drawing paper scribbled with pencil: torn out of the pad along its top ──
    {
      const scrap = cut([[1530, 800, 1, 1], [1650, 764], [1830, 762], [1990, 818, 1], [1990, 1180, 1], [1400, 1180, 1], [1414, 1010, 1], [1516, 992, 1]], 'scrap', { wob: 1.6 });
      check('scrap', scrap);
      paper(g, scrap, { color: C.white, grain: 0.4, cloud: 0.14, wrinkle: 0.42, crumple: 0.1, lift: 1.1, peel: [[1530, 802, 120]] });
      const x0 = 1360, y0 = 720, w = 620, h = 420;
      const c = L.makeCanvas(w, h), k = c.getContext('2d'); k.translate(-x0, -y0);
      const rh = L.rng('a31hatch');
      // one bout of scribbling: the pencil saws to and fro while the hand drifts sideways
      const scribble = (xa, xb, top, bot, lean, gap, wd, al, sd) => {
        const pts = []; let x = xa;
        while (x < xb) {
          const lo = bot(x) + rh.range(-30, 12), hi = top(x) + rh.range(-10, 34);
          pts.push([x + rh.range(-5, 5), lo], [x + lean * (lo - hi) + rh.range(-8, 8), hi]);
          x += gap * rh.range(0.5, 1.6);
        }
        L.sketchLine(k, pts, { width: wd, color: '#3a3a42', seed: sd, wobble: 2, passes: 2, alpha: al });
      };
      const topE = (x) => 784 + 0.03 * (x - 1530);
      scribble(1536, 1960, topE, () => 1000, 0.42, 28, 4.2, 0.86, 3);
      scribble(1424, 1950, (x) => (x < 1524 ? 1022 : 940), () => 1110, 0.3, 32, 3.8, 0.8, 5);
      scribble(1600, 1900, (x) => topE(x) + 40, () => 930, -0.7, 58, 3, 0.5, 8);
      k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'destination-out';
      k.drawImage(L.noiseTex(w, h, { seed: 'a31graphite', scale: 1.8, octaves: 2, res: 1, contrast: 2.0, ramp: [[0, 'rgba(0,0,0,0.8)'], [0.4, 'rgba(0,0,0,0.22)'], [0.7, 'rgba(0,0,0,0)']] }), 0, 0);
      g.save(); clipTo(scrap);
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.9; g.drawImage(c, x0, y0);
      g.restore();
    }

    // ── ruyi: a long bent handle, then the cloud head glued over its top end ──
    {
      const { A, B } = strip([[1362, 832], [1388, 902], [1436, 960], [1492, 1008], [1528, 1066], [1540, 1170]], (t) => L.lerp(68, 58, Math.sin(Math.PI * t)) + 10 * t, 6);
      const ctrl = A.filter((_, i) => i % 9 === 0).concat(B.filter((_, i) => i % 9 === 0).reverse());
      ctrl[0][2] = 1;
      paper(g, cut(ctrl, 'ruyiH', { facet: [70, 180] }), { color: C.green, lift: 0.9, wrinkle: 0.2 });
      const head = cut(xf(RUYI_HEAD, { at: [1338, 764], rot: -0.32, scale: 1.42 }), 'ruyi', { facet: [40, 120] });
      check('ruyi', head);
      paper(g, head, { color: C.green, cloud: 0.3, wrinkle: 0.6, lift: 1.1, peel: [[1196, 826, 90]] });
    }

    // ── tripod censer ──
    {
      const o = { at: [1730, 838], rot: 0.03, scale: 1.12 };
      const body = cut(xf(CENSER, o), 'censer', { facet: [36, 100] });
      check('censer', body);
      const hole = (cx) => cut(xf([[cx - 14, -36, 1], [cx + 13, -37, 1], [cx + 15, -10, 1], [cx - 15, -9, 1]], o), 'ear' + cx, { wob: 0.6 });
      paper(g, [body, hole(-79), hole(80)], { color: C.purple, lift: 1.1, wrinkle: 0.36, peel: [[1870, 842, 80]] });
    }

    // ── the vase ──
    {
      const vase = cut(xf(VASE.map(([x, y, c]) => [x, y - 212, c]), { at: [1056, 852], rot: 0.05, scale: 1.2 }), 'vase', { facet: [56, 190] });
      check('vase', vase);
      paper(g, vase, { color: C.red, cloud: 0.3, wrinkle: 0.5, lift: 1.2, lay: 1.45, creases: [[896, 1046, 1236, 936, 0.6]], peel: [[1122, 604, 90]] });
    }

    // ── jade disc with its small hole ──
    {
      const bi = cut(disc(716, 758, 150, 10, 'bi'), 'bi', { facet: [50, 150], flat: [0.45, 1] });
      const holeP = cut(disc(721, 754, 35, 6, 'bihole', 0.07), 'bihole', { facet: [20, 46], flat: [0.5, 1], wob: 0.5 });
      check('bi', bi);
      paper(g, [bi, holeP], { color: C.yellow, alpha: 0.97, grain: 0.46, cloud: 0.25, wrinkle: 0.34, lift: 1.2, peel: [[612, 656, 100]] });
    }

    // ── lingzhi: a wisp of pink tissue, thin enough to show what lies under it ──
    {
      const lz = cut(xf(LINGZHI, { at: [1290, 1004], rot: -0.14, scale: 1.4 }), 'lingzhi', { facet: [34, 90] });
      paper(g, lz, { color: C.pink, alpha: 0.8, cloud: 0.15, wrinkle: 0.3, crumple: 0.5, lift: 0.5, sh: 0.7, edge: 0.6 });
    }

    // ── one light over the whole artwork: from the upper left, falling away to the lower right ──
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.radial(g, 480, 260, 100, 1500, [[0, 'rgba(255,248,232,0.16)'], [1, 'rgba(255,248,232,0)']]); full();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, 600, 340, 900, 2150, [[0, 'rgb(255,255,255)'], [1, 'rgb(232,230,240)']]); full();
    g.restore();
    console.warn('s31 gaps ' + gaps.join(' '));
  });

  // ── the lens: sharp where the arc crests, the far corners of the artwork a touch out of focus ──
  const soft = L.blurred(art, 2.4);
  const sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.radial(sg, PAD + a.cx, PAD + a.crestY + 60, 560, 1240, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  sg.fillRect(0, 0, GW, GH);
  const ag = art.getContext('2d');
  ag.save(); ag.setTransform(1, 0, 0, 1, 0, 0); ag.drawImage(soft, 0, 0); ag.restore();
  return art;
}

export default {
  name: '博古图剪纸拼贴',
  tone: 'dark',
  async init(env) {
    seq = 0;
    T = buildTextures();
    const art = buildCollage(env);
    T = null;
    const bmp = await createImageBitmap(art);
    bmp._pad = PAD;
    S = { art: bmp };
  },
  draw(ctx, env, p) {
    // 6 frames: the camera slips a few pixels along the arc over the artwork; every shadow is baked in, so none of them turns
    const rot = L.lerp(-0.003, 0.003, p), zoom = L.lerp(1.0, 1.005, p);
    L.blit(ctx, env, S.art, { rot, zoom });
  },
};
