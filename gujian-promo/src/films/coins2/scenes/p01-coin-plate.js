// p01 — 泉谱图版: a page from an old hand-coloured coin catalogue. Hollow-handled spades, knife money, round coins, a gold cake and a silver
// ingot are laid out like pinned specimens and cropped by the frame; the big square-holed coin in the middle is a stop-motion that really
// turns in space (a new pose every 3 frames).
// Every specimen: mask → height map (rims, ridges, bevel) → light from the top-left → per DEVICE pixel (L.pixelCanvas): a litho-style
// hand-colour wash (flat tints, pooled edges, mapped rust strata with drawn boundaries), engraver's hatching whose line swells with the
// shade, crayon grain → vector scratches and ink outline → contact shadow + soft cast shadow.
// The middle coin is ray-cast per pose: a thick disc with a square hole under a perspective camera, lit by the same light, with its rim
// wall, the walls of the hole and a soft shadow traced onto the paper. Poses are pre-rendered as small patches; draw() only drifts.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const TAU = Math.PI * 2, Q = L.SS, clamp = L.clamp;
const LS = 1400, C = LS / 2;          // layer size (160 px of bleed around the 1080 frame) and its centre
const INK = '#2a2018', IR = 42, IG = 32, IB = 24;
const NZ = L.makeNoise('p01wash');
const SDX = 0.6, SDY = 0.8;           // the way shadows fall on the page (light from the top-left)
const LH = 0.55, LZ = 0.835;          // the light: (LX, LY, LZ)
const LX = -SDX * LH, LY = -SDY * LH, HVL = Math.hypot(LH, 1 + LZ);
const KAP = 0.1;                      // height-map units → slope
const PAL = {                         // a: metal, b: its darker tone, c1/c1b: first crust, c2: thick crust, c0: rubbed-through patches, edge: drawn boundary
  bronze: { a: [192, 148, 100], b: [152, 112, 76], c1: [120, 156, 138], c1b: [152, 182, 158], c2: [192, 210, 188], c0: [150, 92, 64], edge: [58, 74, 60], spec: 0.55 },
  gold: { a: [234, 192, 92], b: [210, 162, 66], c1: [192, 140, 60], c1b: [202, 152, 70], c2: [158, 110, 52], c0: [244, 212, 126], edge: [112, 74, 30], spec: 1 },
  silver: { a: [218, 216, 208], b: [190, 190, 186], c1: [150, 148, 152], c1b: [164, 162, 164], c2: [130, 128, 134], c0: [232, 232, 226], edge: [60, 58, 64], spec: 0.9 },
};
const GRAIN = (() => {                // crayon grain / dither tile, 256 × 256
  const r = L.rng('p01grain'), a = new Float32Array(65536), b = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) a[i] = r();
  for (let i = 0; i < 65536; i++) b[i] = (2 * a[i] + a[(i + 1) & 65535] + a[(i + 256) & 65535]) * 0.25;
  return b;
})();
let base = null, patches = [];

// one engraved line family: s runs along the lines, o across them; the line swells with the darkness d and tapers out at thr
const hatch = (s, o, d, pitch, thr, wmax) => {
  const t = (d - thr) / (1 - thr); if (t <= 0) return 0;
  const k = Math.round(o / pitch);
  const lw = wmax * (0.3 + 0.72 * t) * Math.min(1, t * 9 + 0.25) * (0.9 + 0.13 * Math.sin(s * 0.13 + k * 4.7));
  const e = Math.abs(o - k * pitch - 0.42 * Math.sin(s * 0.045 + k * 2.399) - 0.3 * Math.sin(k * 7.13));
  return clamp(Math.min(lw * Q, (lw * 0.5 - e) * Q + 0.5));
};
// wash colour → shaded, hatched, grained pixel. d: darkness 0..1, wa: wash alpha, ia: how much of the line work prints here
function putPixel(D, p, R, G, B, d, spec, wa, ia, x, y, h, gi) {
  const sw = L.smooth((d - 0.56) / 0.06);                                   // a second, cooler wash laid into the shadows; its edge is crisp
  const lum = 1.08 - 0.42 * d - 0.09 * sw;
  R = Math.min(255, R * lum * (1 - 0.03 * sw)); G = Math.min(255, G * lum * (1 - 0.012 * sw)); B = Math.min(255, B * lum);
  const sl = Math.min(1, spec * 0.85); R += (255 - R) * sl; G += (251 - G) * sl; B += (238 - B) * sl;   // highlights are left almost unpainted
  let ink = 0;
  if (ia > 0) {
    ink = 0.86 * hatch(x * h.ac + y * h.as, y * h.ac - x * h.as, d, h.pitch, 0.17, 1.7);
    if (d > 0.52) ink = Math.max(ink, 0.7 * hatch(x * h.bc + y * h.bs, y * h.bc - x * h.bs, d, h.pitch * 1.2, 0.52, 1.35));
    const gf = d - 0.38;
    if (gf > 0) ink = Math.max(ink, 0.56 * Math.min(1, gf * 6) * clamp((0.27 + 0.4 * gf - GRAIN[gi]) * 5 + 0.5));
    ink *= ia;
  }
  const A = wa * 0.94, oa = A + ink * (1 - A);
  if (oa <= 0) return;
  const kc = (A * (1 - ink)) / oa, ki = ink / oa;
  D[p] = R * kc + IR * ki; D[p + 1] = G * kc + IG * ki; D[p + 2] = B * kc + IB * ki; D[p + 3] = oa * 255;
}
// red channel of a canvas as float heights at device resolution, smoothed below the 8-bit steps
function heightOf(cv, pw, ph) {
  const d = L.getRaw(cv).data, a = new Float32Array(pw * ph), b = new Float32Array(pw * ph);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < a.length - 1; i++) b[i] = (a[i - 1] + 2 * a[i] + a[i + 1]) * 0.25;
    for (let i = pw; i < a.length - pw; i++) a[i] = (b[i - pw] + 2 * b[i] + b[i + pw]) * 0.25;
  }
  return a;
}

// ───────────────────────── one engraved, hand-coloured specimen ─────────────────────────
// tex: true → only the flat wash and the height map (the turning coin lights and hatches them itself, pose by pose)
function makeObject(o) {
  const { shape, relief, ink, pal = 'bronze', green = 0.4, seed = 'o', dome = 4, rot = 0, dark0 = 0, pitch = 3.3, tex = false } = o;
  const w = Math.ceil(o.w / 2) * 2, h = Math.ceil(o.h / 2) * 2, pw = w * Q, ph = h * Q, P = PAL[pal];
  const r = L.rng('p01' + seed);
  const cr = Math.cos(rot), sr = Math.sin(rot), sx = SDX * cr + SDY * sr, sy = SDY * cr - SDX * sr;   // shadow direction in sprite space
  const mk = K.sprite(w, h, (g) => { g.fillStyle = '#fff'; g.beginPath(); shape(g); g.fill(); });
  const hc0 = K.sprite(w, h, (g) => {
    g.fillStyle = '#000'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = 'rgb(112,112,112)'; g.beginPath(); shape(g); g.fill();
    g.save(); g.beginPath(); shape(g); g.clip();
    for (let i = 0, n = Math.round((w * h) / 5200); i < n; i++) {          // worn, uneven ground
      const v = r.int(94, 128); g.fillStyle = `rgba(${v},${v},${v},0.55)`;
      g.beginPath(); g.ellipse(r.range(-w / 2, w / 2), r.range(-h / 2, h / 2), r.range(6, 24), r.range(5, 15), r() * 3, 0, TAU); g.fill();
    }
    if (relief) relief(g, r);
    g.restore();
  });
  const M = L.getRaw(mk).data, Bm = tex ? M : L.getRaw(L.blurred(mk, 2.2)).data, H = heightOf(L.blurred(hc0, dome), pw, ph);
  // smooth fields on a 1 px grid, read bilinearly per device pixel: F = rust strata (its level lines are the crust edges), Mg = tone, Sg = brush streaks
  const ox = r.range(0, 900), oy = r.range(0, 900), fw = w + 2, fn = fw * (h + 2);
  const F = new Float32Array(fn), Mg = new Float32Array(fn), Sg = new Float32Array(fn);
  const ba = r.range(0.2, 1.1), bc = Math.cos(ba), bs = Math.sin(ba), bo = r.range(-0.2, 0.2) * Math.min(w, h), bph = r() * TAU;
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < fw; x++) {
    const X = x + ox, Y = y + oy, k = y * fw + x;
    const wx = X + 16 * NZ.n2(X * 0.009 + 31, Y * 0.009), wy = Y + 16 * NZ.n2(X * 0.009, Y * 0.009 + 47);
    F[k] = 0.54 * NZ.n2(wx * 0.0115, wy * 0.0115) + 0.33 * NZ.n2(wx * 0.029 + 9, wy * 0.029) + 0.18 * NZ.n2(X * 0.066, Y * 0.066 + 5);
    Mg[k] = 0.5 + 0.5 * NZ.n2(X * 0.021 + 40, Y * 0.021);
    Sg[k] = NZ.n2((x * bc + y * bs) * 0.012 + 90 + ox, (y * bc - x * bs) * 0.1);
  }
  const t1 = (1 - 2 * green) * 0.75, t2 = t1 + 0.27, t0 = t1 - 0.52;
  const wdx = r.range(0.4, 1.3), wdy = r.range(0.4, 1.3), ph1 = r() * TAU, ph2 = r() * TAU, gi0 = r.int(0, 255), gj0 = r.int(0, 255);
  const hat = { ac: Math.cos(-0.66 - rot), as: Math.sin(-0.66 - rot), bc: Math.cos(0.8 - rot), bs: Math.sin(0.8 - rot), pitch };
  const lxs = -sx * LH, lys = -sy * LH;
  const col = L.pixelCanvas(w, h, (D) => {
    for (let j = Q; j < ph - Q; j++) {
      const y = (j + 0.5) / Q;
      for (let i = Q; i < pw - Q; i++) {
        const p = j * pw + i, a = M[p * 4 + 3], x = (i + 0.5) / Q;
        let wm = a;
        if (!tex) {                                                         // the colourist's wash sits a hair off the line work and its edge wavers
          const di = i - Math.round(Q * (wdx + 0.9 * Math.sin(x * 0.043 + y * 0.029 + ph1))), dj = j - Math.round(Q * (wdy + 0.9 * Math.sin(y * 0.047 - x * 0.025 + ph2)));
          wm = di >= 0 && dj >= 0 && di < pw && dj < ph ? Bm[(dj * pw + di) * 4 + 3] : 0;
        }
        const wa = tex ? a / 255 : clamp((wm - 104) / 44);
        if (!a && wa <= 0) continue;
        const fx = x + 0.5, fy = y + 0.5, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, k = y0 * fw + x0;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const f00 = F[k], f10 = F[k + 1], f01 = F[k + fw], f11 = F[k + fw + 1];
        let ex = (f10 - f00) * (1 - ty) + (f11 - f01) * ty, ey = (f01 - f00) * (1 - tx) + (f11 - f10) * tx;
        const G = Math.max(0.0035, Math.hypot(ex, ey)); ex /= G; ey /= G;    // (ex, ey): uphill, into the crust
        const Fv = f00 * w00 + f10 * w10 + f01 * w01 + f11 * w11, jag = 1.2 * NZ.n2((x + ox) * 0.31, (y + oy) * 0.31) + 0.7 * NZ.n2((x + ox) * 0.93 + 17, (y + oy) * 0.93);
        const s1 = (Fv - t1) / G + jag, s2 = (Fv - t2) / G + jag, s0 = (t0 - Fv) / G - jag;   // signed distances (px) to the three strata edges
        const c1 = clamp(s1 * Q + 0.5), c2 = clamp(s2 * Q + 0.5), c0 = clamp(s0 * Q + 0.5);
        const m = Mg[k] * w00 + Mg[k + 1] * w10 + Mg[k + fw] * w01 + Mg[k + fw + 1] * w11;
        let R = P.a[0] + (P.b[0] - P.a[0]) * m, Gc = P.a[1] + (P.b[1] - P.a[1]) * m, B = P.a[2] + (P.b[2] - P.a[2]) * m;
        if (c0 > 0) { const t = c0 * 0.5; R += (P.c0[0] - R) * t; Gc += (P.c0[1] - Gc) * t; B += (P.c0[2] - B) * t; }
        if (s1 < 0 && s1 > -10) { const t = (1 + s1 / 10) * (1 + s1 / 10) * 0.34; R += (P.c1[0] - R) * t; Gc += (P.c1[1] - Gc) * t; B += (P.c1[2] - B) * t; }   // the crust stains the metal round it
        if (c1 > 0) { R += (P.c1[0] + (P.c1b[0] - P.c1[0]) * m - R) * c1; Gc += (P.c1[1] + (P.c1b[1] - P.c1[1]) * m - Gc) * c1; B += (P.c1[2] + (P.c1b[2] - P.c1[2]) * m - B) * c1; }
        if (c2 > 0) { R += (P.c2[0] - R) * c2; Gc += (P.c2[1] - Gc) * c2; B += (P.c2[2] - B) * c2; }
        // each crust is a low step: its edge toward the light is bright, the far edge carries a shadow; pigment pools just inside the boundary
        const es = ex * sx + ey * sy, edge = Math.max(0, 1 - (s1 * s1) / 1.7) + 0.7 * Math.max(0, 1 - (s2 * s2) / 1.7) + 0.6 * Math.max(0, 1 - (s0 * s0) / 1.7);
        let lm = 1 + edge * (es > 0 ? 0.14 * es : 0.4 * es);
        if (s1 > 0 && s1 < 12) lm -= 0.2 * Math.exp(-s1 / 2.4);
        if (s2 > 0 && s2 < 10) lm -= 0.13 * Math.exp(-s2 / 2);
        lm *= 0.97 + 0.05 * (Sg[k] * w00 + Sg[k + 1] * w10 + Sg[k + fw] * w01 + Sg[k + fw + 1] * w11);
        const gi = (((j + gj0) & 255) << 8) | ((i + gi0) & 255);
        lm += 0.05 * (GRAIN[gi] - 0.5);                                      // granulation
        if (c1 > 0 && GRAIN[gi ^ 0x5a5a] > 0.7) lm -= 0.09 * c1;                 // crayon stipple inside the crust
        if (!tex) { const e = 1 - clamp((wm - 128) / 110); lm -= 0.1 * e * e; }   // the wash dries darker along its own edge
        const db = (x - w / 2) * bs - (y - h / 2) * bc - bo + 5 * Math.sin((x * bc + y * bs) * 0.03 + bph);   // where one brush stroke laps over the last
        lm *= 1 - 0.055 * clamp(db * Q + 0.5) - 0.05 * Math.max(0, 1 - Math.abs(db) / 1.1);
        const ln = clamp((0.45 - Math.abs(s1)) * Q + 0.5) * (0.3 + 0.45 * clamp(0.5 - es)) + clamp((0.4 - Math.abs(s2)) * Q + 0.5) * 0.22;   // the drawn boundary
        R = (R + (P.edge[0] - R) * ln) * lm; Gc = (Gc + (P.edge[1] - Gc) * ln) * lm; B = (B + (P.edge[2] - B) * ln) * lm;
        if (tex) { D[p * 4] = R; D[p * 4 + 1] = Gc; D[p * 4 + 2] = B; D[p * 4 + 3] = a; continue; }
        let d = 0.3, spec = 0;
        if (a > 0) {
          const gx = (H[p + Q] - H[p - Q]) * 0.5, gy = (H[p + Q * pw] - H[p - Q * pw]) * 0.5;
          const nx = -KAP * gx, ny = -KAP * gy, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          const ndl = (nx * lxs + ny * lys + LZ) * inv, ndh = (ndl + inv) / HVL;
          if (ndh > 0) spec = Math.max(0, Math.pow(ndh, 60) - 0.08) * P.spec;
          d = clamp(0.33 - 1.3 * (ndl - LZ) - 0.45 * spec + (0.36 * ((x - w / 2) * sx + (y - h / 2) * sy)) / (w + h) + dark0);
        }
        putPixel(D, p * 4, R, Gc, B, d, spec, wa, a / 255, x, y, hat, gi);
      }
    }
  });
  const spr = L.makeCanvas(w, h), g = spr.getContext('2d');
  g.drawImage(col, 0, 0);
  g.save(); g.translate(w / 2, h / 2);
  g.save(); g.beginPath(); shape(g); g.clip();
  g.lineCap = 'round';
  const pa = r() * TAU;                                                       // hairline scratches: a dark cut with a lit lip on its far side
  for (let i = 0, n = Math.round((w * h) / 2400); i < n; i++) {
    const x = r.range(-w / 2, w / 2), y = r.range(-h / 2, h / 2), an = pa + r.range(-0.5, 0.5) + (r() < 0.25 ? 1.3 : 0), len = r.range(4, 20) * (r() < 0.12 ? 2.2 : 1);
    const dx = Math.cos(an) * len, dy = Math.sin(an) * len, bd = r.range(-0.12, 0.12), mx = x + dx / 2 - dy * bd, my = y + dy / 2 + dx * bd;
    g.strokeStyle = `rgba(255,247,228,${r.range(0.22, 0.5).toFixed(2)})`; g.lineWidth = r.range(0.5, 0.9);
    g.beginPath(); g.moveTo(x + sx * 0.8, y + sy * 0.8); g.quadraticCurveTo(mx + sx * 0.8, my + sy * 0.8, x + dx + sx * 0.8, y + dy + sy * 0.8); g.stroke();
    g.strokeStyle = L.rgba(INK, r.range(0.2, 0.45)); g.lineWidth = r.range(0.45, 0.8);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x + dx, y + dy); g.stroke();
  }
  if (ink && !tex) ink(g, r);
  g.restore();
  if (!tex) {
    g.lineJoin = 'round';
    g.save(); g.beginPath(); shape(g); g.clip();                               // heavier line on the shadow side
    g.translate(-sx * 1.4, -sy * 1.4); g.strokeStyle = L.rgba(INK, 0.55); g.lineWidth = 3.2; g.beginPath(); shape(g); g.stroke();
    g.restore();
    g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 1.5; g.beginPath(); shape(g); g.stroke();
  }
  g.restore();
  return tex ? { spr, H } : spr;
}

// ───────────────────────── shapes (nonzero fill: outlines clockwise, holes counter-clockwise) ─────────────────────────
const coinShape = (R, a, wob = 0, round = false) => (g) => {
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * TAU, rr = R * (1 + 0.005 * Math.sin(3 * t + wob) + 0.003 * Math.sin(7 * t + wob * 2));
    const x = Math.cos(t) * rr, y = Math.sin(t) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  if (round) { g.moveTo(a, 0); g.arc(0, 0, a, 0, TAU, true); g.closePath(); }
  else { g.moveTo(-a, -a); g.lineTo(-a, a); g.lineTo(a, a); g.lineTo(a, -a); g.closePath(); }
};
const coinRelief = (R, a, round = false) => (g) => {
  g.strokeStyle = 'rgb(196,196,196)';
  if (round) { g.lineWidth = R * 0.06; g.beginPath(); g.arc(0, 0, R * 0.97, 0, TAU); g.stroke(); g.lineWidth = R * 0.045; g.beginPath(); g.arc(0, 0, a + R * 0.02, 0, TAU); g.stroke(); }
  else {
    g.lineWidth = R * 0.115; g.beginPath(); g.arc(0, 0, R * 0.945, 0, TAU); g.stroke();                 // 外郭
    g.lineWidth = R * 0.075; g.strokeRect(-a - R * 0.037, -a - R * 0.037, 2 * a + R * 0.074, 2 * a + R * 0.074);   // 内郭
  }
};
const coinInk = (R, a, round = false) => (g) => {
  g.strokeStyle = L.rgba(INK, 0.62); g.lineWidth = 1.1;
  if (round) { g.beginPath(); g.arc(0, 0, a * 1.14 + R * 0.03, 0.2, 2.6); g.stroke(); g.beginPath(); g.arc(0, 0, R * 0.93, 0.5, 2.2); g.stroke(); }
  else {
    g.beginPath(); g.arc(0, 0, R * 0.888, 0, TAU); g.stroke();
    g.strokeRect(-a - R * 0.075, -a - R * 0.075, 2 * a + R * 0.15, 2 * a + R * 0.15);
  }
};

const spadeShape = (s) => (g) => {                                            // 耸肩尖足空首布
  g.moveTo(-0.075 * s, -0.5 * s); g.lineTo(0.075 * s, -0.5 * s); g.lineTo(0.098 * s, -0.16 * s);
  g.quadraticCurveTo(0.2 * s, -0.165 * s, 0.275 * s, -0.245 * s);
  g.quadraticCurveTo(0.205 * s, 0.1 * s, 0.268 * s, 0.5 * s);
  g.bezierCurveTo(0.2 * s, 0.3 * s, 0.12 * s, 0.17 * s, 0, 0.17 * s);
  g.bezierCurveTo(-0.12 * s, 0.17 * s, -0.2 * s, 0.3 * s, -0.268 * s, 0.5 * s);
  g.quadraticCurveTo(-0.205 * s, 0.1 * s, -0.275 * s, -0.245 * s);
  g.quadraticCurveTo(-0.2 * s, -0.165 * s, -0.098 * s, -0.16 * s);
  g.closePath();
};
const spadeLines = (s) => [[[0, -0.15], [0, 0.15]], [[0.045, -0.15], [0.175, 0.4]], [[-0.045, -0.15], [-0.175, 0.4]]].map((l) => l.map(([x, y]) => [x * s, y * s]));
const spadeRelief = (s) => (g) => {
  g.fillStyle = 'rgb(160,160,160)'; g.beginPath();                              // the hollow socket stands proud of the thin blade
  g.moveTo(-0.075 * s, -0.5 * s); g.lineTo(0.075 * s, -0.5 * s); g.lineTo(0.098 * s, -0.16 * s); g.lineTo(0, -0.1 * s); g.lineTo(-0.098 * s, -0.16 * s); g.closePath(); g.fill();
  g.strokeStyle = 'rgb(186,186,186)'; g.lineWidth = 0.03 * s; g.beginPath(); spadeShape(s)(g); g.stroke();
  g.lineWidth = 0.014 * s; g.lineCap = 'round';
  for (const [p, q] of spadeLines(s)) { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  g.strokeStyle = 'rgb(202,202,202)'; g.lineWidth = 0.02 * s; g.beginPath(); g.moveTo(0, -0.49 * s); g.lineTo(0, -0.14 * s); g.stroke();
};
const spadeInk = (s) => (g) => {
  g.fillStyle = L.rgba(INK, 0.86); g.beginPath(); g.ellipse(0, -0.488 * s, 0.056 * s, 0.011 * s, 0, 0, TAU); g.fill();   // mouth of the socket
  g.beginPath(); g.moveTo(0, -0.345 * s); g.lineTo(0.012 * s, -0.318 * s); g.lineTo(-0.012 * s, -0.318 * s); g.closePath(); g.fill();
  g.strokeStyle = L.rgba(INK, 0.55); g.lineWidth = 1; g.lineCap = 'round';
  for (const [p, q] of spadeLines(s)) { g.beginPath(); g.moveTo(p[0] + 0.009 * s, p[1]); g.lineTo(q[0] + 0.009 * s, q[1]); g.stroke(); }
};

function knifeGeom(s) {
  const bx = (u) => (-0.025 - 0.062 * 4 * u * (1 - u)) * s;                     // the back: one convex arc from ring to tip
  const yy = (u) => (0.4 - 0.9 * u) * s;
  const wd = (u) => (u < 0.33 ? 0.062 : u < 0.37 ? 0.062 + ((u - 0.33) / 0.04) * 0.058 : 0.12 + 0.012 * Math.sin((u - 0.37) * 5)) * s;
  return { bx, yy, wd, rc: [bx(0) + 0.031 * s, yy(0) + 0.04 * s] };
}
const knifeBody = (g, s) => {
  const k = knifeGeom(s), N = 48;
  g.moveTo(k.bx(0), k.yy(0));
  for (let i = 1; i <= N; i++) g.lineTo(k.bx(i / N), k.yy(i / N));
  for (let i = 44; i >= 0; i--) g.lineTo(k.bx(i / N) + k.wd(i / N), k.yy(i / N));
  g.closePath();
};
const knifeShape = (s) => (g) => {                                             // 刀币：弧背、凹刃、扁柄、小圆环
  const k = knifeGeom(s);
  knifeBody(g, s);
  g.moveTo(k.rc[0] + 0.05 * s, k.rc[1]); g.arc(k.rc[0], k.rc[1], 0.05 * s, 0, TAU); g.closePath();
  g.moveTo(k.rc[0] + 0.027 * s, k.rc[1]); g.arc(k.rc[0], k.rc[1], 0.027 * s, 0, TAU, true); g.closePath();
};
const knifeHandle = (g, s, off) => { const k = knifeGeom(s); g.beginPath(); for (let i = 1; i <= 17; i++) { const u = i / 48; i > 1 ? g.lineTo(k.bx(u) + off * s, k.yy(u)) : g.moveTo(k.bx(u) + off * s, k.yy(u)); } g.stroke(); };
const knifeRelief = (s) => (g) => {
  const k = knifeGeom(s);
  g.strokeStyle = 'rgb(190,190,190)'; g.lineWidth = 0.03 * s; g.beginPath(); knifeBody(g, s); g.stroke();
  g.lineWidth = 0.022 * s; g.beginPath(); g.arc(k.rc[0], k.rc[1], 0.0385 * s, 0, TAU); g.stroke();
  g.lineWidth = 0.01 * s; knifeHandle(g, s, 0.021); knifeHandle(g, s, 0.042);
};
const knifeInk = (s) => (g) => { g.strokeStyle = L.rgba(INK, 0.55); g.lineWidth = 1; knifeHandle(g, s, 0.028); knifeHandle(g, s, 0.049); };

const cakeShape = (R, ph) => (g) => {                                          // 金饼: a cast round of gold, never quite circular
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * TAU, rr = R * (1 + 0.03 * Math.sin(2 * t + ph) + 0.022 * Math.sin(3 * t + ph * 2.3) + 0.01 * Math.sin(7 * t + ph * 0.7));
    i ? g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : g.moveTo(rr, 0);
  }
  g.closePath();
};
const cakeRelief = (R) => (g, r) => {                                           // a thick rolled lip round a shallow dish
  g.strokeStyle = 'rgb(200,200,200)'; g.lineWidth = R * 0.26; g.beginPath(); g.arc(0, 0, R * 0.8, 0, TAU); g.stroke();
  g.fillStyle = 'rgb(84,84,84)'; g.beginPath(); g.ellipse(R * 0.04, R * 0.03, R * 0.5, R * 0.46, r() * 3, 0, TAU); g.fill();
  g.fillStyle = 'rgb(120,120,120)'; g.beginPath(); g.ellipse(-R * 0.12, R * 0.1, R * 0.2, R * 0.14, r() * 3, 0, TAU); g.fill();
};
const cakeInk = (R) => (g) => { g.strokeStyle = L.rgba(INK, 0.5); g.lineWidth = 1; g.beginPath(); g.arc(R * 0.03, R * 0.02, R * 0.57, 3.0, 5.4); g.stroke(); };

const ingotShape = (s, k = 1) => (g) => {                                      // 束腰银铤: two rounded ends and a drawn-in waist
  const hl = 0.5 * s * k, we = 0.33 * s * k, ww = 0.2 * s * k;
  g.moveTo(-we * 0.82, -hl * 0.86);
  g.quadraticCurveTo(0, -hl * 1.1, we * 0.82, -hl * 0.86);
  g.quadraticCurveTo(we * 1.06, -hl * 0.74, we * 0.96, -hl * 0.56);
  g.bezierCurveTo(ww * 0.95, -hl * 0.25, ww * 0.95, hl * 0.25, we * 0.96, hl * 0.56);
  g.quadraticCurveTo(we * 1.06, hl * 0.74, we * 0.82, hl * 0.86);
  g.quadraticCurveTo(0, hl * 1.1, -we * 0.82, hl * 0.86);
  g.quadraticCurveTo(-we * 1.06, hl * 0.74, -we * 0.96, hl * 0.56);
  g.bezierCurveTo(-ww * 0.95, hl * 0.25, -ww * 0.95, -hl * 0.25, -we * 0.96, -hl * 0.56);
  g.quadraticCurveTo(-we * 1.06, -hl * 0.74, -we * 0.82, -hl * 0.86);
  g.closePath();
};
const ingotRelief = (s) => (g) => {                                            // raised lip, the face sunk a little as the silver cooled
  g.strokeStyle = 'rgb(198,198,198)'; g.lineWidth = 0.1 * s; g.lineJoin = 'round'; g.beginPath(); ingotShape(s)(g); g.stroke();
  g.fillStyle = 'rgb(90,90,90)'; g.beginPath(); ingotShape(s, 0.6)(g); g.fill();
};
const ingotInk = (s) => (g) => { g.strokeStyle = L.rgba(INK, 0.5); g.lineWidth = 1; g.lineJoin = 'round'; g.beginPath(); ingotShape(s, 0.8)(g); g.stroke(); };

// ───────────────────────── the turning coin (ray-cast) ─────────────────────────
const R0 = 200, A0 = 58, T0 = 12;                  // radius, half the side of the hole, half the thickness
const D0 = 2600;                                   // height of the camera above the paper
const CW = 472;                                    // coin canvas (centred on the coin)
const PX0 = C - 244, PY0 = C - 244, PW = 500, PH = 620;   // the patch of the page a pose can change: the coin and wherever its shadow may reach
const TW = 2 * R0 + 28, TPW = TW * Q, NPOSE = 13;
const HAT0 = { ac: Math.cos(-0.66), as: Math.sin(-0.66), bc: Math.cos(0.8), bs: Math.sin(0.8), pitch: 3.3 };
const KS = (() => { const a = []; for (let s = 0; s < 32; s++) { const rr = Math.sqrt((s + 0.5) / 32), t = s * 2.39996; a.push(rr * Math.cos(t), rr * Math.sin(t)); } return a; })();
let hT = 0, hK = 0;                                // last hit: ray parameter and kind (1 face, 2 rim wall, 3 / 4 walls of the hole)
// ray (origin e, direction d, in the coin's own frame u, v, n) against the disc |n| ≤ T0, u² + v² ≤ R0² minus the square hole |u|, |v| < A0
function castCoin(eu, ev, en, du, dv, dn) {
  let s0 = -1e9, s1 = 1e9, c0 = -1e9, c1 = 1e9;
  if (Math.abs(dn) < 1e-9) { if (Math.abs(en) >= T0) return false; }
  else { const a = (-T0 - en) / dn, b = (T0 - en) / dn; if (a < b) { s0 = a; s1 = b; } else { s0 = b; s1 = a; } }
  const qa = du * du + dv * dv, qc = eu * eu + ev * ev - R0 * R0;
  if (qa < 1e-12) { if (qc >= 0) return false; }
  else { const qb = eu * du + ev * dv, disc = qb * qb - qa * qc; if (disc <= 0) return false; const sq = Math.sqrt(disc); c0 = (-qb - sq) / qa; c1 = (-qb + sq) / qa; }
  const ta = Math.max(s0, c0, 1e-6), tb = Math.min(s1, c1);
  if (ta >= tb) return false;
  let h0 = -1e9, h1 = 1e9, kind = 3;
  if (Math.abs(du) < 1e-9) { if (Math.abs(eu) >= A0) h1 = -2e9; }
  else { const a = (-A0 - eu) / du, b = (A0 - eu) / du; if (a < b) { h0 = a; h1 = b; } else { h0 = b; h1 = a; } }
  if (h1 > h0) {
    if (Math.abs(dv) < 1e-9) { if (Math.abs(ev) >= A0) h1 = -2e9; }
    else { let a = (-A0 - ev) / dv, b = (A0 - ev) / dv; if (a > b) { const t = a; a = b; b = t; } if (a > h0) h0 = a; if (b < h1) { h1 = b; kind = 4; } }
  }
  if (h1 > h0 && h0 <= ta && h1 > ta) {              // the ray comes in through the hole: it either passes clean through or meets a wall of the hole
    if (h1 >= tb) return false;
    hT = h1; hK = kind; return true;
  }
  hT = ta; hK = s0 >= c0 ? 1 : 2; return true;
}
function hullOf(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
const poly = (g, pts) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
const texShape = (g) => { g.moveTo(R0 + 2, 0); g.arc(0, 0, R0 + 2, 0, TAU); g.closePath(); const a = A0 - 2; g.moveTo(-a, -a); g.lineTo(-a, a); g.lineTo(a, a); g.lineTo(a, -a); g.closePath(); };
const faceTex = (seed, green) => { const o = makeObject({ w: TW, h: TW, shape: texShape, relief: coinRelief(R0, A0), green, seed, tex: true }); return { C: L.getRaw(o.spr).data, H: o.H }; };

// pose k: the coin turned k / 7 of a half-turn about an axis lying in the page, resting on the paper by its lowest edge
function makePose(k, TF, TB, pp) {
  const r = L.rng('p01pose' + k), th = (-k * Math.PI) / 7, psi = k ? r.range(-0.07, 0.07) : 0.03, alp = k ? r.range(-0.05, 0.05) : 0;
  const ax = Math.sin(alp), ay = Math.cos(alp), ct = Math.cos(th), st = Math.sin(th);
  const turn = (x, y, z) => { const d = (ax * x + ay * y) * (1 - ct); return [x * ct + ay * z * st + ax * d, y * ct - ax * z * st + ay * d, z * ct + (ax * y - ay * x) * st]; };
  const U = turn(Math.cos(psi), Math.sin(psi), 0), V = turn(-Math.sin(psi), Math.cos(psi), 0), N = turn(0, 0, 1);
  const zc = R0 * Math.hypot(U[2], V[2]) + T0 * Math.abs(N[2]) + 0.8, ez = D0 - zc, eu = ez * U[2], ev = ez * V[2], en = ez * N[2];
  const front = en > 0, sg = front ? 1 : -1, wf = sg * T0, T = front ? TF : TB;
  const nfl = Math.max(-0.25, sg * (N[0] * LX + N[1] * LY + N[2] * LZ));        // how the flat of the visible face meets the light
  const pr = (u, v, w) => { const z = zc + u * U[2] + v * V[2] + w * N[2], m = D0 / (D0 - z); return [(u * U[0] + v * V[0] + w * N[0]) * m, (u * U[1] + v * V[1] + w * N[1]) * m]; };
  const ring = (rad, w) => { const a = []; for (let i = 0; i < 144; i++) { const t = (i / 144) * TAU; a.push(pr(Math.cos(t) * rad, Math.sin(t) * rad, w)); } return a; };
  const quad = (hs, w) => [pr(-hs, -hs, w), pr(hs, -hs, w), pr(hs, hs, w), pr(-hs, hs, w)];
  const fC = ring(R0, wf), hull = hullOf(fC.concat(ring(R0, -wf))), qF = quad(A0, wf), qB = quad(A0, -wf);
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
  for (const [x, y] of hull) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  const gi0 = r.int(0, 255), gj0 = r.int(0, 255);
  const pix = L.pixelCanvas(CW, CW, (D, pw, ph) => {
    const i0 = Math.max(0, Math.floor((bx0 + CW / 2) * Q) - 2), i1 = Math.min(pw, Math.ceil((bx1 + CW / 2) * Q) + 2);
    const j0 = Math.max(0, Math.floor((by0 + CW / 2) * Q) - 2), j1 = Math.min(ph, Math.ceil((by1 + CW / 2) * Q) + 2);
    for (let j = j0; j < j1; j++) {
      const Y = (j + 0.5) / Q - CW / 2;
      for (let i = i0; i < i1; i++) {
        const X = (i + 0.5) / Q - CW / 2;
        const du = X * U[0] + Y * U[1] - D0 * U[2], dv = X * V[0] + Y * V[1] - D0 * V[2], dn = X * N[0] + Y * N[1] - D0 * N[2];
        if (!castCoin(eu, ev, en, du, dv, dn)) continue;
        const u = eu + hT * du, v = ev + hT * dv, wv = en + hT * dn, kind = hK;
        let R, G, B, nu, nv, nw, dk = 0;
        if (kind === 1) {                              // the face: wash and relief come from the texture, averaged along the pixel's footprint
          const t2 = (wf - en) / (dn + N[0] / Q), fu = sg * (eu + t2 * (du + U[0] / Q) - u), fv = ev + t2 * (dv + V[0] / Q) - v;
          const nt = Math.max(1, Math.min(5, Math.round(Math.hypot(fu, fv) * Q)));
          let cr = 0, cg = 0, cb = 0, hx = 0, hy = 0;
          for (let s = 0; s < nt; s++) {
            const o = (s + 0.5) / nt - 0.5;
            let ti = ((sg * u + o * fu + TW / 2) * Q) | 0, tj = ((v + o * fv + TW / 2) * Q) | 0;
            ti = ti < Q ? Q : ti > TPW - Q - 1 ? TPW - Q - 1 : ti; tj = tj < Q ? Q : tj > TPW - Q - 1 ? TPW - Q - 1 : tj;
            const tp = tj * TPW + ti;
            cr += T.C[tp * 4]; cg += T.C[tp * 4 + 1]; cb += T.C[tp * 4 + 2];
            hx += T.H[tp + Q] - T.H[tp - Q]; hy += T.H[tp + Q * TPW] - T.H[tp - Q * TPW];
          }
          R = cr / nt; G = cg / nt; B = cb / nt;
          nu = (-sg * KAP * hx * 0.5) / nt; nv = (-KAP * hy * 0.5) / nt; nw = sg;
        } else if (kind === 2) {                       // the rim wall: rounded toward its arrises, filed round, patinated in the same strata
          const rr = Math.hypot(u, v), wz = wv / T0;
          nu = u / rr; nv = v / rr; nw = wz * 0.6;
          const cgn = clamp((NZ.n2(u * 0.021 + wv * 0.05 + 11, v * 0.021 - wv * 0.04) + 0.45 * NZ.n2(u * 0.06 + wv * 0.11, v * 0.06 - wv * 0.09 + 23) - 0.05) * 9 + 0.5);
          const fl = 0.93 + 0.07 * Math.sin(wv * 1.9 + 3 * NZ.n2(u * 0.008, v * 0.008 + 5)), ar = Math.max(0, Math.abs(wz) - 0.72) / 0.28;
          R = (160 - 40 * cgn) * fl + 34 * ar; G = (114 + 46 * cgn) * fl + 28 * ar; B = (72 + 66 * cgn) * fl + 18 * ar;
        } else {                                       // a wall of the hole
          if (kind === 3) { nu = u > 0 ? -1 : 1; nv = 0; } else { nu = 0; nv = v > 0 ? -1 : 1; }
          nw = 0; dk = 0.12;
          const cgn = clamp((NZ.n2(u * 0.03 + wv * 0.07 + 3, v * 0.03 + wv * 0.05) + 0.1) * 9 + 0.5);
          R = 140 - 36 * cgn; G = 100 + 42 * cgn; B = 62 + 60 * cgn;
        }
        const il = 1 / Math.sqrt(nu * nu + nv * nv + nw * nw);
        const nx = (nu * U[0] + nv * V[0] + nw * N[0]) * il, ny = (nu * U[1] + nv * V[1] + nw * N[1]) * il, nz = (nu * U[2] + nv * V[2] + nw * N[2]) * il;
        const ndl = nx * LX + ny * LY + nz * LZ, ndh = (ndl + nz) / HVL, nf = kind === 1 ? nfl : ndl;
        const spec = ndh > 0 ? Math.max(0, Math.pow(ndh, 60) - 0.08) * 0.6 : 0;
        const d = clamp(0.32 + 0.5 * (LZ - nf) + 1.3 * (nf - ndl) - 0.45 * spec + dk, 0.02, 0.98);
        putPixel(D, (j * pw + i) * 4, R, G, B, d, spec, 1, 1, X, Y, HAT0, (((j + gj0) & 255) << 8) | ((i + gi0) & 255));
      }
    }
  });
  // line work over the ray-cast colour: all of it projected from the same geometry, so it sits exactly on the pixel edges
  const cv = K.sprite(CW, CW, (g) => {
    g.lineJoin = 'round';
    g.save(); g.beginPath(); poly(g, hull); g.clip(); g.drawImage(pix, -CW / 2, -CW / 2);
    g.translate(-SDX * 1.4, -SDY * 1.4); g.strokeStyle = L.rgba(INK, 0.55); g.lineWidth = 3.2; g.beginPath(); poly(g, hull); g.stroke();   // heavier line on the shadow side
    g.restore();
    g.strokeStyle = L.rgba(INK, 0.62); g.lineWidth = 1.1;                       // 外郭 and 内郭 on the visible face
    g.beginPath(); poly(g, ring(R0 * 0.888, wf)); poly(g, quad(A0 + R0 * 0.075, wf)); g.stroke();
    g.save(); g.beginPath(); poly(g, qF); g.clip();                            // through the mouth of the hole: the far edge and the corners of its walls
    g.strokeStyle = L.rgba(INK, 0.75); g.beginPath(); poly(g, qB); for (let i = 0; i < 4; i++) { g.moveTo(qF[i][0], qF[i][1]); g.lineTo(qB[i][0], qB[i][1]); } g.stroke();
    g.restore();
    g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 1.3; g.beginPath(); poly(g, qF); g.stroke();
    g.strokeStyle = L.rgba(INK, 0.78); g.lineWidth = 1.1; g.beginPath(); poly(g, fC); g.stroke();      // where the face meets the rim wall
    g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 1.5; g.beginPath(); poly(g, hull); g.stroke();
  });
  // the shadow on the paper: for each point, how much of the lamp (a small disc of directions) the coin hides, plus a contact shadow where it hangs low
  const gw = PW / 2 + 1, gh = PH / 2 + 1, S = new Float32Array(gw * gh), Sb = new Float32Array(gw * gh), RB = Math.hypot(R0, T0);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const px = PX0 + gx * 2 - C, py = PY0 + gy * 2 - C;
    // can the coin's bounding sphere stand between this point and the lamp (far), or hang low over it (near)?
    const cxp = -py * LZ - zc * LY, cyp = zc * LX + px * LZ, czp = py * LX - px * LY, lim = RB + 0.1 * Math.max(0, zc * LZ - px * LX - py * LY) + 2;
    const far = cxp * cxp + cyp * cyp + czp * czp < lim * lim, near = px * px + py * py < (RB + 45) * (RB + 45);
    if (!far && !near) continue;
    const ou = px * U[0] + py * U[1] - zc * U[2], ov = px * V[0] + py * V[1] - zc * V[2], on = px * N[0] + py * N[1] - zc * N[2];
    let key = 0, amb = 0;
    for (let s = 0; s < 32; s++) {
      const jx = KS[s * 2], jy = KS[s * 2 + 1];
      if (far) { const lx = LX + jx * 0.075, ly = LY + jy * 0.075; if (castCoin(ou, ov, on, lx * U[0] + ly * U[1] + LZ * U[2], lx * V[0] + ly * V[1] + LZ * V[2], lx * N[0] + ly * N[1] + LZ * N[2])) key++; }
      if (near && s < 16) { const lx = jx * 0.8, ly = jy * 0.8; if (castCoin(ou, ov, on, lx * U[0] + ly * U[1] + U[2], lx * V[0] + ly * V[1] + V[2], lx * N[0] + ly * N[1] + N[2]) && hT < 70) amb += 1 - hT / 70; }
    }
    S[gy * gw + gx] = (0.5 * key) / 32 + (0.36 * amb) / 16;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < S.length - 1; i++) Sb[i] = (S[i - 1] + 2 * S[i] + S[i + 1]) * 0.25;
    for (let i = gw; i < S.length - gw; i++) S[i] = (Sb[i - gw] + 2 * Sb[i] + Sb[i + gw]) * 0.25;
  }
  const sh = L.pixelCanvas(PW, PH, (D, pw, ph, q) => {
    for (let j = 0; j < ph; j++) {
      const fy = (j + 0.5) / q / 2, y0 = Math.min(gh - 2, fy | 0), ty = fy - y0;
      for (let i = 0; i < pw; i++) {
        const fx = (i + 0.5) / q / 2, x0 = Math.min(gw - 2, fx | 0), tx = fx - x0, kk = y0 * gw + x0;
        const s = ((S[kk] + (S[kk + 1] - S[kk]) * tx) * (1 - ty) + (S[kk + gw] + (S[kk + gw + 1] - S[kk + gw]) * tx) * ty) * L.smooth(Math.min(fx, gw - 1 - fx) / 12) * L.smooth(Math.min(fy, gh - 1 - fy) / 12);   // never reaches the border of the patch
        if (s <= 0.004) continue;
        const p = (j * pw + i) * 4; D[p] = 52; D[p + 1] = 36; D[p + 2] = 20; D[p + 3] = s * 255 + GRAIN[((j & 255) << 8) | (i & 255)] - 0.5;
      }
    }
  });
  // shadow, then the coin (the shadow is cut away under it), soaked into the paper like the rest of the print, multiplied onto this corner of the page
  const pc = L.makeCanvas(PW, PH), g = pc.getContext('2d'), cx = C - CW / 2 - PX0, cy = C - CW / 2 - PY0;
  g.drawImage(sh, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(cv, cx, cy); g.drawImage(cv, cx, cy);
  g.globalCompositeOperation = 'source-over'; g.drawImage(cv, cx, cy);
  K.soak(pc, pp, 0.5); K.wear(pc, { seed: 'p01wearC', amount: 0.22, size: 1.4 });
  const out = L.makeCanvas(PW, PH), og = out.getContext('2d');
  og.drawImage(base, -PX0, -PY0); og.globalCompositeOperation = 'multiply'; og.drawImage(pc, 0, 0); og.globalCompositeOperation = 'source-over';
  return out;
}

// ───────────────────────── page ─────────────────────────
function build() {
  const paper = K.paper({ base: '#efe6d3', tone: '#8a6a3a', seed: 'p01paper', size: LS, fiber: 0.6, stain: 0.4, foxing: 0.35, edge: 0.16 });
  const print = L.makeCanvas(LS, LS), pg = print.getContext('2d');
  const put = (spr, x, y, rot = 0, lift = 1) => {                              // soft cast shadow, tight contact shadow, then the specimen
    const sil = K.sprite(spr.width + 64, spr.height + 64, (g) => { g.drawImage(spr, -spr.width / 2, -spr.height / 2); g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(52,36,20)'; g.fillRect(-4000, -4000, 8000, 8000); });
    K.stamp(pg, L.blurred(sil, 5 * lift), x + SDX * 11 * lift, y + SDY * 11 * lift, { rot, shadow: false, alpha: 0.36 });
    K.stamp(pg, L.blurred(sil, 1.5), x + SDX * 3 * lift, y + SDY * 3 * lift, { rot, shadow: false, alpha: 0.55 });
    K.stamp(pg, spr, x, y, { rot, shadow: false });
  };
  const spade = (s, x, y, rot, green, seed) => put(makeObject({ w: 0.55 * s + 28, h: s + 28, shape: spadeShape(s), relief: spadeRelief(s), ink: spadeInk(s), rot, green, seed }), x, y, rot);
  const knife = (s, x, y, rot, green, seed) => put(makeObject({ w: 0.2 * s + 28, h: s + 28, shape: knifeShape(s), relief: knifeRelief(s), ink: knifeInk(s), rot, green, seed }), x, y, rot);
  const coin = (R, x, y, rot, green, seed, round = false) => {
    const a = round ? R * 0.2 : R * 0.29, small = R < 80;
    put(makeObject({ w: 2 * R + 28, h: 2 * R + 28, shape: coinShape(R, a, R, round), relief: coinRelief(R, a, round), ink: coinInk(R, a, round), rot, green, seed, dome: clamp(R * 0.032, 1.7, 4), pitch: small ? 2.9 : 3.3 }), x, y, rot, small ? 0.7 : 1);
  };
  const cake = (R, x, y, rot, seed) => put(makeObject({ w: 2.14 * R + 28, h: 2.14 * R + 28, shape: cakeShape(R, R), relief: cakeRelief(R), ink: cakeInk(R), rot, pal: 'gold', green: 0.3, seed, dome: R * 0.1, pitch: 3 }), x, y, rot, 1.1);
  const ingot = (s, x, y, rot, seed) => put(makeObject({ w: 0.7 * s + 28, h: s + 28, shape: ingotShape(s), relief: ingotRelief(s), ink: ingotInk(s), rot, pal: 'silver', green: 0.26, seed, dome: 3.4, pitch: 3 }), x, y, rot, 1.1);

  spade(520, 310, 400, -0.15, 0.42, 'spA');
  knife(620, 1095, 330, 0.55, 0.55, 'knA');
  coin(150, 285, 860, 0.4, 0.3, 'huan', true);
  spade(440, 1160, 870, 0.18, 0.62, 'spB');
  knife(540, 440, 1190, -1.3, 0.3, 'knB');
  coin(128, 885, 1160, 0.12, 0.7, 'cB');
  coin(95, 660, 310, -0.2, 0.22, 'cC');
  coin(56, 852, 262, 0.5, 0.5, 'sA');                                          // small change, a gold cake and a silver ingot fill the gaps
  coin(44, 858, 452, -0.3, 0.34, 'sB', true);
  coin(48, 902, 416, 0.9, 0.6, 'sC');                                          // lies across the round-holed one
  cake(58, 628, 1042, 0.4, 'gold');
  coin(44, 486, 984, -0.6, 0.48, 'sD');
  ingot(150, 1190, 530, -0.3, 'ag');

  K.soak(print, paper, 0.5); K.wear(print, { seed: 'p01wear', amount: 0.22, size: 1.4 });
  base = L.makeCanvas(LS, LS);
  const bg = base.getContext('2d');
  bg.drawImage(paper, 0, 0); bg.globalCompositeOperation = 'multiply'; bg.drawImage(print, 0, 0); bg.globalCompositeOperation = 'source-over';

  // the stop-motion coin: two faces, then one patch of the page per pose
  const TF = faceTex('f0', 0.36), TB = faceTex('b0', 0.52);
  const pp = L.makeCanvas(PW, PH); pp.getContext('2d').drawImage(paper, -PX0, -PY0);
  patches = [];
  for (let k = 0; k < NPOSE; k++) patches.push(makePose(k, TF, TB, pp));
}

export default {
  name: '泉谱图版',
  init() { build(); },
  draw(ctx, env, p) {
    const f = env && env.frame !== undefined ? env.frame : Math.round(p * 37);
    const z = L.lerp(1, 1.055, p);
    ctx.save();
    ctx.translate(K.S / 2 + L.lerp(8, -6, p), K.S / 2 + L.lerp(6, -8, p)); ctx.scale(z, z);
    ctx.drawImage(base, -C, -C);
    ctx.drawImage(patches[Math.floor(f / 3) % NPOSE], PX0 - C, PY0 - C);
    ctx.restore();
  },
};
