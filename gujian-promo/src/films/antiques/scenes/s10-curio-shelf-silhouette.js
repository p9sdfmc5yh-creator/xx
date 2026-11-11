// s10 — 博古架剪影. A long display table seen exactly edge-on against a flat cyan backdrop: the arc is the top edge of the
// table (案面上沿). A row of antique vessels stands on it, every foot on the arc, every outline reaching up into the blue —
// 梅瓶 / 尊 / 觚 / 三足炉 / 玉壶春瓶 / 葫芦瓶 (plus half a 天球瓶 and half a 将军罐 leaving frame). Backlit: the vessels are
// aubergine-black, with just enough dark crimson glaze sheen, string lines (弦纹) and a warm side-lit edge to tell them apart.
// Below the arc: the table itself in the same aubergine — ice-plate edge, waist, apron with cloud-scroll spandrels (云纹牙头)
// either side of each leg, wood grain, all sinking into shadow.
//
// Recipe: (1) every vessel is a lathe profile → silhouette mask; shading is done strip by strip across the profile so the sheen
// follows the body like on a real solid of revolution; rim light = mask minus the same mask shifted away from the light.
// (2) the table is a grey height map + albedo map built with canvas ops in arc-polar space, then lit per pixel in init().
// (3) one cropped scene layer is blitted per frame with a slide along the arc and a small push-in.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 120;
const YT = 96;                                  // the scene layer is cropped: rows YT … H+PAD (no vessel reaches higher)
const LW = W + PAD * 2, LH = H + PAD - YT;
let S = null;

const SKY = '#2ea7c4';
const cBody = [43, 22, 48], cRed = [106, 36, 64], cRim = [201, 138, 106], cInk = [9, 4, 13];
const mx = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cs = (c, al = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+al.toFixed(3)})`;

/** cropped, padded layer in frame coordinates */
function layer(draw) {
  const c = L.makeCanvas(LW, LH), g = c.getContext('2d');
  g.translate(PAD, -YT);
  if (draw) draw(g);
  return c;
}
/** composite one same-sized canvas onto another, pixel for pixel */
function comp(dst, src, blend = 'source-over', alpha = 1) {
  const g = dst.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = blend; g.globalAlpha = alpha;
  g.drawImage(src, 0, 0, dst.width, dst.height);
  g.restore();
  return dst;
}

// ───────────────────────── vessels ─────────────────────────
/**
 * Lathe profile → dense right-hand outline [[halfWidth, height] …] in px (height measured up from the foot).
 * `segs` is a list of point runs; each run is smoothed on its own so the joints between runs stay crisp (foot rings, lips).
 */
function lathe(k, segs) {
  const poly = [];
  for (const seg of segs) for (const p of L.smoothPath(seg.map(([w, h]) => [w * k, h * k]), 3)) poly.push(p);
  let top = 0, wMax = 0;
  for (const [w, h] of poly) { if (h > top) top = h; if (w > wMax) wMax = w; }
  const n = Math.floor(top);
  const rows = new Float32Array(n + 1);
  for (let i = 0; i < poly.length - 1; i++) {
    const [w0, h0] = poly[i], [w1, h1] = poly[i + 1];
    const lo = Math.min(h0, h1), hi = Math.max(h0, h1);
    for (let h = Math.max(0, Math.ceil(lo)); h <= Math.min(n, Math.floor(hi)); h++) {
      const w = hi - lo < 1e-6 ? Math.max(w0, w1) : w0 + (w1 - w0) * ((h - h0) / (h1 - h0));
      if (w > rows[h]) rows[h] = w;
    }
  }
  return { poly, rows, n, top, wMax };
}
const hwAt = (la, h) => la.rows[Math.max(0, Math.min(la.n, Math.round(h)))];

function lathePath(g, la, cx = 0) {
  const p = la.poly, ext = p[0][1] < 1 ? 12 : 0;      // a foot that starts on the table is carried down behind the table edge
  g.beginPath();
  g.moveTo(cx + p[0][0], ext - p[0][1]);
  for (const [w, h] of p) g.lineTo(cx + w, -h);
  for (let i = p.length - 1; i >= 0; i--) g.lineTo(cx - p[i][0], -p[i][1]);
  g.lineTo(cx - p[0][0], ext - p[0][1]);
  g.closePath();
}

/** colour across a body of revolution, left limb (t=0) → right limb (t=1). k = how much sheen this slice carries */
function limbStops(gr, mat, base, k) {
  if (mat === 'glaze') {
    gr.addColorStop(0, cs(mx(base, cRed, 0.72)));
    gr.addColorStop(0.05, cs(mx(base, cRed, 0.5)));
    gr.addColorStop(0.125, cs(mx(base, cRed, 0.22 + 0.2 * k)));
    gr.addColorStop(0.18, cs(mx(mx(base, cRed, 0.78), cRim, 0.3 * k)));
    gr.addColorStop(0.205, cs(mx(mx(base, cRed, 0.85), cRim, 0.46 * k)));       // the soft window streak of a glazed pot
    gr.addColorStop(0.24, cs(mx(base, cRed, 0.36 + 0.2 * k)));
    gr.addColorStop(0.37, cs(mx(base, cRed, 0.13)));
    gr.addColorStop(0.5, cs(base));
    gr.addColorStop(0.72, cs(mx(base, cInk, 0.46)));
    gr.addColorStop(0.9, cs(mx(base, cInk, 0.16)));
    gr.addColorStop(0.965, cs(mx(base, cRed, 0.24)));
    gr.addColorStop(1, cs(mx(base, cRed, 0.5)));
  } else {                                                                       // bronze / wood: broad and matte
    gr.addColorStop(0, cs(mx(base, cRed, 0.66)));
    gr.addColorStop(0.07, cs(mx(base, cRed, 0.46)));
    gr.addColorStop(0.2, cs(mx(base, cRed, 0.24 + 0.14 * k)));
    gr.addColorStop(0.35, cs(mx(base, cRed, 0.1)));
    gr.addColorStop(0.5, cs(base));
    gr.addColorStop(0.74, cs(mx(base, cInk, 0.42)));
    gr.addColorStop(0.92, cs(mx(base, cInk, 0.14)));
    gr.addColorStop(1, cs(mx(base, cRed, 0.34)));
  }
}
function latheShade(g, la, cx, mat, base) {
  g.fillStyle = cs(base); lathePath(g, la, cx); g.fill();
  for (let h = -12; h <= la.n; h++) {
    const hw = hwAt(la, h);
    if (hw < 0.8) continue;
    const gr = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
    limbStops(gr, mat, base, 0.3 + 0.7 * L.smooth(hw / la.wMax));
    g.fillStyle = gr; g.fillRect(cx - hw - 1.5, -h - 1.2, hw * 2 + 3, 1.75);
  }
}
/** a string line (弦纹) round the body at height h — seen from just below, so it bows upward a little */
function band(g, la, h, o = {}) {
  const { w = 2, al = 1, cx = 0 } = o;
  const hw = hwAt(la, h), sag = (h * hw) / 5200;
  const run = (dy, style) => {
    g.strokeStyle = style; g.lineWidth = w;
    g.beginPath(); g.moveTo(cx - hw - 1, -h + dy); g.quadraticCurveTo(cx, -h + dy - 2 * sag, cx + hw + 1, -h + dy); g.stroke();
  };
  run(w * 1.05, cs(cInk, 0.5 * al));
  const st = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
  st.addColorStop(0, cs(mx(cRed, cRim, 0.6), 0.95 * al)); st.addColorStop(0.1, cs(mx(cRed, cRim, 0.12), 0.95 * al));
  st.addColorStop(0.42, cs(cRed, 0.62 * al)); st.addColorStop(0.74, cs(cRed, 0.14 * al)); st.addColorStop(1, cs(cRed, 0.42 * al));
  run(0, st);
}

// Profiles as [halfWidth, height] in fractions of the vessel's height. Each has its own unmistakable outline:
const FORMS = {
  // 梅瓶: small mouth with a rolled lip, short neck, full high shoulder, body drawn in to a narrow foot
  meiping: { mat: 'glaze', bands: [0.055, 0.842, 0.866],
    segs: [[[0.125, 0], [0.118, 0.03], [0.12, 0.1], [0.14, 0.22], [0.18, 0.38], [0.232, 0.54], [0.275, 0.67], [0.292, 0.77], [0.27, 0.855], [0.2, 0.905], [0.11, 0.93], [0.062, 0.938]],
      [[0.062, 0.938], [0.052, 0.953], [0.054, 0.968]], [[0.054, 0.968], [0.078, 0.975], [0.084, 0.988], [0.074, 1]]] },
  // 尊: wide flaring mouth, swelling belly, tall ring foot
  zun: { mat: 'bronze', bands: [0.05, 0.215, 0.24, 0.585, 0.612, 0.955],
    segs: [[[0.25, 0], [0.25, 0.035]], [[0.25, 0.035], [0.238, 0.06], [0.215, 0.14], [0.205, 0.22]],
      [[0.205, 0.22], [0.27, 0.27], [0.33, 0.35], [0.345, 0.43], [0.315, 0.52], [0.24, 0.585]],
      [[0.24, 0.585], [0.218, 0.64], [0.225, 0.74], [0.275, 0.86], [0.355, 0.95], [0.42, 1]]] },
  // 觚: trumpet mouth, wasp waist with a slightly swelling middle section, tall flaring foot
  gu: { mat: 'bronze', bands: [0.036, 0.29, 0.31, 0.47, 0.49, 0.975],
    segs: [[[0.16, 0], [0.16, 0.03]], [[0.16, 0.03], [0.15, 0.045], [0.125, 0.12], [0.1, 0.22], [0.088, 0.3]],
      [[0.088, 0.3], [0.097, 0.33], [0.101, 0.39], [0.097, 0.45], [0.086, 0.48]],
      [[0.086, 0.48], [0.08, 0.54], [0.086, 0.66], [0.108, 0.78], [0.15, 0.88], [0.215, 0.955], [0.28, 1]]] },
  // 玉壶春瓶: flared lip, long slender neck, pear-shaped belly hanging low, ring foot
  yuhuchun: { mat: 'glaze', bands: [0.045, 0.6, 0.628, 0.975],
    segs: [[[0.13, 0], [0.128, 0.035]],
      [[0.128, 0.035], [0.175, 0.07], [0.245, 0.15], [0.285, 0.25], [0.275, 0.35], [0.215, 0.46], [0.14, 0.56], [0.09, 0.65], [0.066, 0.74], [0.06, 0.82], [0.07, 0.9], [0.1, 0.955], [0.142, 0.99], [0.15, 1]]] },
  // 葫芦瓶: two bulbs, the lower one larger, pinched waist, small mouth
  hulu: { mat: 'glaze', bands: [0.038, 0.54, 0.566, 0.955],
    segs: [[[0.15, 0], [0.148, 0.03]],
      [[0.148, 0.03], [0.215, 0.07], [0.285, 0.16], [0.31, 0.27], [0.285, 0.38], [0.205, 0.47], [0.125, 0.525], [0.105, 0.555], [0.125, 0.59], [0.18, 0.65], [0.2, 0.725], [0.18, 0.8], [0.12, 0.87], [0.066, 0.915], [0.052, 0.95], [0.054, 0.985]],
      [[0.054, 0.985], [0.063, 0.99], [0.06, 1]]] },
  // 天球瓶: globe body, straight tall neck (only half of it is in frame)
  tianqiu: { mat: 'glaze', bands: [0.03, 0.612, 0.985],
    segs: [[[0.12, 0], [0.12, 0.025]], [[0.12, 0.025], [0.2, 0.06], [0.3, 0.17], [0.335, 0.3], [0.3, 0.43], [0.2, 0.535], [0.115, 0.585], [0.092, 0.62]],
      [[0.092, 0.62], [0.088, 0.75], [0.09, 1]]] },
  // 将军罐: domed lid with a bead knob, short straight neck, broad shoulder (only half of it is in frame)
  jiangjun: { mat: 'glaze', bands: [0.035, 0.718, 0.8],
    segs: [[[0.2, 0], [0.195, 0.03]], [[0.195, 0.03], [0.205, 0.1], [0.25, 0.25], [0.31, 0.42], [0.335, 0.55], [0.31, 0.65], [0.23, 0.71], [0.17, 0.725]],
      [[0.17, 0.725], [0.165, 0.76], [0.168, 0.775]], [[0.168, 0.775], [0.215, 0.78], [0.215, 0.795]],
      [[0.215, 0.795], [0.2, 0.83], [0.15, 0.88], [0.08, 0.915], [0.03, 0.925]], [[0.03, 0.925], [0.028, 0.94], [0.05, 0.96], [0.045, 0.985], [0.004, 1]]] },
};
// the row, left → right: s = position along the arc in px from the crest (the crest itself is a gap, like in the reference)
const ROW = [
  { form: 'tianqiu', s: -1024, H: 300, tint: 0.0 },
  { form: 'meiping', s: -745, H: 345, tint: 0.06 },
  { form: 'zun', s: -447, H: 232, stand: 32, tint: -0.1 },
  { form: 'gu', s: -160, H: 352, tint: -0.04 },
  { form: 'lu', s: 162, H: 1, tint: -0.08 },
  { form: 'yuhuchun', s: 442, H: 300, stand: 32, tint: 0.08 },
  { form: 'hulu', s: 742, H: 286, tint: 0.02 },
  { form: 'jiangjun', s: 1026, H: 310, tint: 0.05 },
];

/** little waisted wooden stand (木座) with bracket feet; hw = half-width, hs = height */
function standPath(g, hw, hs) {
  const q = hs / 26, f = 17, y = (v) => -v * q;
  g.beginPath();
  g.moveTo(-hw, 12); g.lineTo(-hw, y(5)); g.lineTo(-hw - 3, y(7)); g.lineTo(-hw - 3, y(12.5));
  g.lineTo(-hw + 7, y(14)); g.lineTo(-hw + 7, y(18)); g.lineTo(-hw - 1, y(19.5)); g.lineTo(-hw - 1, y(24)); g.quadraticCurveTo(-hw - 1, y(26), -hw + 2, y(26));
  g.lineTo(hw - 2, y(26)); g.quadraticCurveTo(hw + 1, y(26), hw + 1, y(24));
  g.lineTo(hw + 1, y(19.5)); g.lineTo(hw - 7, y(18)); g.lineTo(hw - 7, y(14)); g.lineTo(hw + 3, y(12.5)); g.lineTo(hw + 3, y(7)); g.lineTo(hw, y(5)); g.lineTo(hw, 12);
  g.lineTo(hw - f, 12); g.lineTo(hw - f, y(1)); g.quadraticCurveTo(hw - f - 3, y(6.5), hw - f - 16, y(6.5));
  g.lineTo(-hw + f + 16, y(6.5)); g.quadraticCurveTo(-hw + f + 3, y(6.5), -hw + f, y(1)); g.lineTo(-hw + f, 12);
  g.closePath();
}

/** 三足炉: squat round belly, short neck, everted rim with two upright loop ears, three hoof legs */
function censer(k) {
  return {
    k,
    body: lathe(k, [[[0, 40], [40, 43], [78, 56], [102, 76], [112, 98], [106, 120], [94, 132]], [[94, 132], [90, 138], [91, 144]], [[91, 144], [106, 148], [108, 154], [104, 157]]]),
    leg: lathe(k, [[[15, 0], [14, 5], [10, 14], [12, 32], [18, 52], [19, 74]]]),
  };
}
function earPath(g, k, sgn) {
  const xe = sgn * 68 * k, o = sgn * 4 * k;
  g.beginPath();
  g.moveTo(xe - 14 * k, -150 * k); g.lineTo(xe - 16 * k + o * 0.7, -182 * k);
  g.quadraticCurveTo(xe - 16 * k + o, -199 * k, xe + o, -199 * k);
  g.quadraticCurveTo(xe + 16 * k + o, -199 * k, xe + 16 * k + o * 0.7, -182 * k);
  g.lineTo(xe + 14 * k, -150 * k);
}
function drawCenser(g, it, mode) {
  const { body, leg, k } = it.cz, base = it.base;
  const legs = [[-72 * k, mx(base, cInk, 0.18)], [72 * k, mx(base, cInk, 0.3)], [0, base]];
  g.lineWidth = 10.5 * k; g.lineJoin = 'round'; g.lineCap = 'butt';
  if (mode === 'sil') {
    for (const [x] of legs) { lathePath(g, leg, x); g.fill(); }
    lathePath(g, body, 0); g.fill();
    for (const s of [-1, 1]) { earPath(g, k, s); g.stroke(); }
  } else if (mode === 'shade') {
    for (const s of [-1, 1]) {
      const xe = s * 68 * k;
      g.strokeStyle = L.linear(g, xe - 22 * k, 0, xe + 22 * k, 0, [[0, cs(mx(base, cRed, 0.6))], [0.3, cs(mx(base, cRed, 0.2))], [0.6, cs(mx(base, cInk, 0.3))], [1, cs(mx(base, cRed, 0.25))]]);
      earPath(g, k, s); g.stroke();
    }
    for (const [x, c] of legs) latheShade(g, leg, x, 'bronze', c);
    latheShade(g, body, 0, 'bronze', base);
  } else {
    band(g, body, 96 * k, { w: 2 }); band(g, body, 103 * k, { w: 1.6, al: 0.8 });
    band(g, body, 136 * k, { w: 1.8, al: 0.9 }); band(g, body, 150 * k, { w: 1.6, al: 0.8 });
  }
}

function drawItem(g, it, mode) {
  const st = it.stand || 0;
  g.save(); g.translate(0, -st);
  if (it.form === 'lu') drawCenser(g, it, mode);
  else if (mode === 'sil') { lathePath(g, it.la, 0); g.fill(); }
  else if (mode === 'shade') latheShade(g, it.la, 0, it.mat, it.base);
  else it.bands.forEach((b, i) => band(g, it.la, b * it.la.top, { w: i % 2 ? 1.7 : 2.1, al: i % 2 ? 0.85 : 1 }));
  g.restore();
  if (!st) return;
  const hw = it.la.poly[0][0] + 15;
  if (mode === 'sil') { standPath(g, hw, st); g.fill(); }
  else if (mode === 'shade') {
    const wood = mx(cBody, cInk, 0.22);
    g.fillStyle = L.linear(g, -hw, 0, hw, 0, [[0, cs(mx(wood, cRed, 0.6))], [0.12, cs(mx(wood, cRed, 0.3))], [0.42, cs(wood)], [0.8, cs(mx(wood, cInk, 0.4))], [1, cs(mx(wood, cRed, 0.2))]]);
    standPath(g, hw, st); g.fill();
  } else {
    const q = st / 26;
    g.strokeStyle = L.linear(g, -hw, 0, hw, 0, [[0, cs(cRed, 0.9)], [0.5, cs(cRed, 0.45)], [1, cs(cRed, 0.15)]]);
    g.lineWidth = 1.5;
    for (const v of [19.5, 12.5]) { g.beginPath(); g.moveTo(-hw - 3, -v * q); g.lineTo(hw + 3, -v * q); g.stroke(); }
  }
}

/** the part of `sil` that is NOT covered by the same silhouette shifted by (dx,dy): a strip along the edges facing (−dx,−dy) */
function edgeLight(sil, dx, dy, color) {
  const c = L.makeCanvas(LW, LH), g = c.getContext('2d');
  g.drawImage(sil, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(sil, dx, dy);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, LW, LH);
  return c;
}

function buildObjects(env) {
  const a = env.arc;
  const items = ROW.map((v) => {
    const it = { ...v, base: v.tint >= 0 ? mx(cBody, cRed, v.tint) : mx(cBody, cInk, -v.tint) };
    if (v.form === 'lu') { it.cz = censer(1.02); it.mat = 'bronze'; }
    else { const f = FORMS[v.form]; it.la = lathe(v.H, f.segs); it.mat = f.mat; it.bands = f.bands; }
    return it;
  });
  const each = (g, mode) => { for (const it of items) a.at(g, it.s / a.R, 0, () => drawItem(g, it, mode)); };

  const sil = layer((g) => { g.fillStyle = '#fff'; g.strokeStyle = '#fff'; each(g, 'sil'); });
  const obj = layer((g) => each(g, 'shade'));
  comp(obj, sil, 'destination-in');
  // surface breath: slow mottling so no body is a flat fill
  L.overlayOn(obj, L.noiseTex(LW, LH, { seed: 's10mottle', scale: 70, octaves: 4, res: 0.25, contrast: 1.7, warp: 0.5 }), { blend: 'soft-light', alpha: 0.34 });
  // side light from the upper left: a broad dark-crimson edge, then a thin warm core that breaks up along the outline
  const wide = L.blurred(edgeLight(sil, 6.5, 2.6, cs(cRed, 0.95)), 1.4);
  comp(wide, sil, 'destination-in');
  comp(obj, wide);
  comp(obj, edgeLight(sil, -2.4, 0.6, cs(cRed, 0.5)));                 // faint return light down the far edge
  const lines = layer((g) => { g.lineCap = 'butt'; each(g, 'lines'); });
  comp(lines, sil, 'destination-in');
  comp(obj, lines);
  const hot = L.blurred(edgeLight(sil, 2.6, 1.3, cs(cRim, 1)), 0.5);
  comp(hot, L.noiseTex(LW, LH, { seed: 's10hot', scale: 150, octaves: 3, res: 0.2, contrast: 2.4, bias: 0.12, ramp: [[0, 'rgba(0,0,0,0.12)'], [0.45, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,1)']] }), 'destination-in');
  comp(obj, hot);
  return obj;
}

// ───────────────────────── the table ─────────────────────────
const LEG0 = 300, LEGP = 600, LEGH = 35;        // legs every 600 px along the arc, 70 px wide
const APR = 176, SW = 152;                      // plain apron depth; width of a cloud spandrel

/** depth (px below the arc) of the apron's lower edge at arc position u: plain between the legs, two cloud lobes stepping down beside each leg */
function edgeD(u) {
  const ul = LEG0 + Math.round((u - LEG0) / LEGP) * LEGP;
  const t = Math.abs(u - ul) - LEGH;
  if (t <= 0) return 4000;
  if (t >= SW) return APR;
  if (t >= 104) return APR + 16 * L.smooth((SW - t) / (SW - 104));
  if (t >= 46) return APR + 10 + 44 * Math.sqrt(1 - ((t - 46) / 58) ** 2);
  return APR + 44 + 84 * Math.sqrt(1 - (t / 46) ** 2);
}

function buildTable(env) {
  const a = env.arc, R = a.R;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 6, TW = LW, TH = H + PAD - Y0;
  const mk = () => { const c = L.makeCanvas(TW, TH), g = c.getContext('2d'); g.translate(-X0, -Y0); return [c, g]; };
  const full = (g) => g.fillRect(X0, Y0, TW, TH);
  const P = (u, d) => { const th = u / R, r = R - d; return [a.cx + r * Math.sin(th), a.cy - r * Math.cos(th)]; };
  const UMAX = a.span(PAD + 180) * R;
  const legs = [];
  for (let k = -4; k <= 4; k++) { const u = LEG0 + k * LEGP; if (Math.abs(u) < UMAX + LEGP * 0.6) legs.push(u); }
  const polar = { cx: a.cx, cy: a.cy, R };

  const solidPath = (g) => {          // table top + waist + apron + spandrels + legs
    g.beginPath();
    let first = true;
    for (let u = -UMAX; u <= UMAX; u += 2) { const [x, y] = P(u, Math.min(edgeD(u), 1300)); if (first) g.moveTo(x, y); else g.lineTo(x, y); first = false; }
    for (let u = UMAX; u >= -UMAX; u -= 30) { const [x, y] = P(u, -40); g.lineTo(x, y); }
    g.closePath();
  };
  const legsPath = (g) => {
    g.beginPath();
    for (const ul of legs) {
      const p0 = P(ul - LEGH, 70), p1 = P(ul - LEGH, 1300), p2 = P(ul + LEGH, 1300), p3 = P(ul + LEGH, 70);
      g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.closePath();
    }
  };
  const poly = (g, pts) => { g.beginPath(); pts.forEach(([u, d], i) => { const [x, y] = P(u, d); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); };

  // wood figure: along the arc for the top and apron, down the length of each leg
  const RAMP = [[0, '#606060'], [0.45, '#8c8c8c'], [0.74, '#b8b8b8'], [0.9, '#e2e2e2'], [1, '#ffffff']];
  const grain = L.noiseTex(TW, TH, { seed: 's10grain', scale: 54, octaves: 5, gain: 0.55, sx: 15, sy: 0.5, warp: 0.6, warpScale: 1.4, ridged: true, contrast: 1.35, res: 0.5, ox: X0, oy: Y0, polar, ramp: RAMP });
  const grainLeg = L.noiseTex(TW, TH, { seed: 's10leg', scale: 50, octaves: 4, gain: 0.55, sx: 0.5, sy: 15, warp: 0.5, warpScale: 1.4, ridged: true, contrast: 1.35, res: 0.4, ox: X0, oy: Y0, polar, ramp: RAMP });

  // 1) height map (white = toward the lens)
  const [hc, hg] = mk();
  hg.fillStyle = '#aaaaaa'; full(hg);
  hg.save(); a.clipBelow(hg, 0);
  hg.fillStyle = '#181818'; full(hg);                                        // the void under the table
  hg.fillStyle = '#767676'; solidPath(hg); hg.fill();                         // apron face
  // beaded edge (灯草线) following the apron and curling into a scroll inside each cloud lobe
  hg.save(); solidPath(hg); hg.clip();
  hg.globalCompositeOperation = 'lighter'; hg.lineCap = 'round'; hg.lineJoin = 'round';
  const raised = (pts) => { for (const [lw, al] of [[9, 0.1], [5.5, 0.1], [2.5, 0.08]]) { hg.lineWidth = lw; hg.strokeStyle = `rgba(255,255,255,${al})`; poly(hg, pts); hg.stroke(); } };
  for (let i = -1; i < legs.length; i++) {
    const u0 = (i < 0 ? legs[0] - LEGP : legs[i]) + LEGH + 1, u1 = u0 + LEGP - 2 * LEGH - 2, pts = [];
    for (let u = u0; u <= u1; u += 2) pts.push([u, edgeD(u) - 11]);
    raised(pts);
  }
  for (const ul of legs) for (const sg of [-1, 1]) {
    const scroll = (ct, cd, r0, r1, turns) => {
      const pts = [];
      for (let i = 0; i <= 44; i++) { const f = i / 44, ang = -1.2 + turns * L.TAU * f, r = L.lerp(r0, r1, f); pts.push([ul + sg * (LEGH + ct + r * Math.cos(ang)), cd + r * Math.sin(ang)]); }
      raised(pts);
    };
    scroll(23, 259, 20, 3, 1.55); scroll(74, 201, 11, 2.5, 1.4);
  }
  hg.restore();
  // legs stand proud of the apron: a gently rounded face with a bead down each edge
  for (const ul of legs) a.at(hg, ul / R, 0, () => {
    hg.fillStyle = L.linear(hg, -LEGH, 0, LEGH, 0, [[0, '#949494'], [0.1, '#b4b4b4'], [0.2, '#a0a0a0'], [0.5, '#aeaeae'], [0.8, '#a0a0a0'], [0.9, '#b4b4b4'], [1, '#949494']]);
    hg.fillRect(-LEGH, 70, LEGH * 2, 1300);
  });
  // table top: ice-plate edge (冰盘沿) sweeping back to a recessed waist (束腰) and a bead (托腮) above the apron
  hg.save(); a.clipBand(hg, 0, -70);
  const lv = (v) => `rgb(${v},${v},${v})`, at = (d) => (70 - d) / 70;
  hg.fillStyle = L.radial(hg, a.cx, a.cy, R - 70, R, [[at(70), lv(118)], [at(66), lv(162)], [at(61), lv(150)], [at(58), lv(76)], [at(44), lv(76)], [at(41), lv(118)],
    [at(30), lv(150)], [at(18), lv(196)], [at(10), lv(212)], [at(4), lv(216)], [at(0), lv(170)]]);
  full(hg); hg.restore();
  hg.restore();
  // the figure of the wood is very slightly raised
  hg.save(); hg.setTransform(1, 0, 0, 1, 0, 0); hg.globalCompositeOperation = 'soft-light'; hg.globalAlpha = 0.3; hg.drawImage(grain, 0, 0); hg.restore();
  const hb = L.blurred(hc, 1.1);

  // 2) albedo
  const mask = L.makeCanvas(TW, TH), mg = mask.getContext('2d');
  mg.translate(-X0, -Y0); mg.fillStyle = '#000'; solidPath(mg); mg.fill();
  const [ac, ag] = mk();
  ag.fillStyle = '#808080'; full(ag);                                         // back of the shelf, far behind
  ag.save(); ag.setTransform(1, 0, 0, 1, 0, 0); ag.filter = 'blur(10px)'; ag.globalAlpha = 0.8; ag.drawImage(mask, 12, 20); ag.restore();   // shadow the table throws on it
  ag.fillStyle = '#ffffff'; solidPath(ag); ag.fill();
  ag.save(); ag.setTransform(1, 0, 0, 1, 0, 0); ag.globalCompositeOperation = 'multiply'; ag.drawImage(grain, 0, 0); ag.restore();
  ag.save(); legsPath(ag); ag.clip(); ag.fillStyle = '#ffffff'; full(ag);
  ag.setTransform(1, 0, 0, 1, 0, 0); ag.globalCompositeOperation = 'multiply'; ag.drawImage(grainLeg, 0, 0); ag.restore();
  ag.globalCompositeOperation = 'multiply';
  // slow tonal drift across the boards
  ag.save(); ag.setTransform(1, 0, 0, 1, 0, 0); ag.globalAlpha = 0.6;
  ag.drawImage(L.noiseTex(TW, TH, { seed: 's10drift', scale: 420, octaves: 3, res: 0.12, sx: 2.4, ox: X0, oy: Y0, polar, ramp: [[0, '#8a8a8a'], [0.5, '#e0e0e0'], [1, '#ffffff']] }), 0, 0);
  ag.restore();
  // everything sinks into shadow with depth; the overhanging top shades the waist
  ag.fillStyle = L.radial(ag, a.cx, a.cy, R - 760, R, [[0, '#4c4c4c'], [0.42, '#7a7a7a'], [0.72, '#c0c0c0'], [0.9, '#f0f0f0'], [1, '#ffffff']]); full(ag);
  ag.fillStyle = L.radial(ag, a.cx, a.cy, R - 130, R - 36, [[0, '#ffffff'], [0.45, '#b4b4b4'], [0.9, '#8a8a8a'], [1, '#ffffff']]);
  ag.save(); a.clipBand(ag, -36, -130); full(ag); ag.restore();
  ag.globalCompositeOperation = 'source-over';

  // 3) light it: key from the upper left, colours taken from the shot's own ramp (ink → aubergine → crimson → warm side light)
  const ramp = L.makeRamp([[0, '#08040c'], [0.16, '#160a1c'], [0.36, '#2b1630'], [0.5, '#451a3a'], [0.66, '#6a2440'], [0.82, '#a65a52'], [0.93, '#c98a6a'], [1, '#f0c8aa']]);
  const lut = new Uint8ClampedArray(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = ramp(i / 1023); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const hd = hb.getContext('2d').getImageData(0, 0, TW, TH).data, ad = ag.getImageData(0, 0, TW, TH).data;
  const img = new ImageData(TW, TH), o = img.data, row = TW * 4;
  for (let y = 0; y < TH; y++) {
    const up = y > 0 ? -row : 0, dn = y < TH - 1 ? row : 0;
    for (let x = 0; x < TW; x++) {
      const i = y * row + x * 4;
      const hx = hd[i + (x < TW - 1 ? 4 : 0)] - hd[i - (x > 0 ? 4 : 0)], hy = hd[i + dn] - hd[i + up];
      let rel = (hx * 0.5 + hy * 0.866) * 0.034;
      rel = rel < -0.8 ? -0.8 : rel > 2 ? 2 : rel;
      let lum = (ad[i] / 255) * 0.62 * (1 + rel);
      if (rel > 0.5) lum += (rel - 0.5) * 0.12;
      const li = (lum <= 0 ? 0 : lum >= 1 ? 1023 : (lum * 1023) | 0) * 3;
      o[i] = lut[li]; o[i + 1] = lut[li + 1]; o[i + 2] = lut[li + 2]; o[i + 3] = 255;
    }
  }
  const out = L.makeCanvas(TW, TH);
  out.getContext('2d').putImageData(img, 0, 0);
  return { canvas: out, X0, Y0 };
}

function buildScene(env) {
  const a = env.arc;
  const obj = buildObjects(env), tab = buildTable(env);
  return layer((g) => {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(obj, 0, 0); g.restore();
    g.save(); a.clipBelow(g, 0); g.drawImage(tab.canvas, tab.X0, tab.Y0); g.restore();
    // the lit arris of the table top: the one continuous line of the shot — warm where it faces the light, crimson where it turns away
    const nz = L.makeNoise('s10arris'), sp = a.span(PAD + 80), n = 300;
    g.save(); a.clipBelow(g, 0.6);
    g.strokeStyle = cs(cRed, 0.4); g.lineWidth = 9; a.stroke(g, -4);
    g.lineCap = 'butt';
    for (let i = 0; i < n; i++) {
      const t0 = L.lerp(-sp, sp, i / n), t1 = L.lerp(-sp, sp, (i + 1) / n) + 0.0005, u = i / n;
      const lit = L.clamp(1.02 - 0.8 * u + 0.3 * nz.fbm(t0 * 46, 3.1, 3));
      g.strokeStyle = cs(mx(cRed, cRim, lit), 0.6 + 0.4 * lit); g.lineWidth = 2.4 + 2.2 * lit;
      g.beginPath(); a.trace(g, -1.2, t0, t1); g.stroke();
    }
    g.restore();
  });
}

function buildSky() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = L.linear(g, 0, 0, 0, H, [[0, '#2aa3c1'], [0.5, SKY], [1, '#30aac7']]);
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55;
  g.drawImage(L.grainTex(W, H, { seed: 's10sky', amount: 0.1 }), 0, 0);
  return c;
}

export default {
  name: '博古架剪影',
  tone: 'light',
  init(env) {
    S = { sky: buildSky(), scene: buildScene(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.01, 0.01, p), zoom = L.lerp(1.0, 1.02, p);
    ctx.drawImage(S.sky, 0, 0);
    L.cam(ctx, env, { rot, zoom }, () => ctx.drawImage(S.scene, -PAD, YT));
    // a glint of the side light running along the table edge
    ctx.save(); a.clipBelow(ctx, 2); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, L.lerp(-0.26, -0.13, p), -2, () => {
      ctx.scale(5, 0.5);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 60, [[0, cs(cRim, 0.7)], [0.4, cs(cRim, 0.25)], [1, cs(cRim, 0)]]);
      ctx.fillRect(-60, -60, 120, 120);
    });
    ctx.restore();
  },
};
