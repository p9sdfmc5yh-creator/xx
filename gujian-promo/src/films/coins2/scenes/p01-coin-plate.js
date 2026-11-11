// p01 — 泉谱图版: a page from an old hand-coloured coin catalogue. Hollow-handled spades, knife money, round coins and cowries are laid
// out like pinned specimens and cropped by the frame; the big square-holed coin in the middle is a stop-motion (a new pose every 3 frames).
// Every specimen is built the same way: mask → height map (rims, ridges) → light from the top-left → watercolour wash per pixel →
// engraver's hatching whose line weight follows the shade → ink outline. Four full layers (one per pose) are pre-rendered; draw() only drifts.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const TAU = Math.PI * 2;
const LS = 1400;                      // layer size (160 px of bleed around the 1080 frame)
const INK = '#2a2018';
const NZ = L.makeNoise('p01wash');
let layers = [];

// ───────────────────────── one engraved, hand-coloured specimen ─────────────────────────
function makeObject(o) {
  const { shape, relief, ink, pal = 'bronze', green = 0.4, seed = 'o', dome = 4, rot = 0, dark0 = 0, pitch = 3.3 } = o;
  const w = Math.ceil(o.w / 2) * 2, h = Math.ceil(o.h / 2) * 2;
  const r = L.rng('p01' + seed);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const mk = K.sprite(w, h, (g) => { g.fillStyle = '#fff'; g.beginPath(); shape(g); g.fill(); });
  const M = mk.getContext('2d').getImageData(0, 0, w, h).data;
  const hc0 = K.sprite(w, h, (g) => {
    g.fillStyle = '#000'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = 'rgb(112,112,112)'; g.beginPath(); shape(g); g.fill();
    g.save(); g.beginPath(); shape(g); g.clip();
    for (let i = 0, n = Math.round((w * h) / 5200); i < n; i++) {          // worn, uneven ground
      const v = r.int(92, 128); g.fillStyle = `rgba(${v},${v},${v},0.55)`;
      g.beginPath(); g.ellipse(r.range(-w / 2, w / 2), r.range(-h / 2, h / 2), r.range(6, 24), r.range(5, 15), r() * 3, 0, TAU); g.fill();
    }
    if (relief) relief(g, r);
    g.restore();
  });
  const Hd = L.blurred(hc0, dome).getContext('2d').getImageData(0, 0, w, h).data;
  const lx = (cr + sr) * 0.021, ly = (cr - sr) * 0.021;                    // page light (top-left) turned into sprite space
  const dark = new Float32Array(w * h);
  const img = new ImageData(w, h), D = img.data;
  const ox = r.range(0, 900), oy = r.range(0, 900);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, a = M[i * 4 + 3]; if (!a) continue;
    const gx = Hd[(i + 1) * 4] - Hd[(i - 1) * 4], gy = Hd[(i + w) * 4] - Hd[(i - w) * 4];
    const u = x - w / 2, v = y - h / 2;
    const pg = (u * cr - v * sr + u * sr + v * cr) / (w + h);
    const d = L.clamp(0.36 - (gx * lx + gy * ly) + 0.3 * pg + dark0);
    dark[i] = d;
    const n = 0.5 + 0.5 * (0.62 * NZ.n2((x + ox) * 0.012, (y + oy) * 0.012) + 0.3 * NZ.n2((x + ox) * 0.034, (y + oy) * 0.034));
    const m = 0.5 + 0.5 * NZ.n2((x + ox) * 0.027 + 40, (y + oy) * 0.027);
    let R, G, B;
    if (pal === 'shell') { R = 242 - 20 * n - 10 * m; G = 232 - 26 * n - 12 * m; B = 206 - 42 * n - 10 * m; }
    else {
      const t = L.smooth((n - (1 - green)) / 0.46 + 0.5);
      const bR = 186 - 40 * m, bG = 138 - 34 * m, bB = 88 - 22 * m;        // bronze browns
      const vR = 126 + 44 * m, vG = 164 + 30 * m, vB = 142 + 26 * m;       // verdigris
      R = bR + (vR - bR) * t; G = bG + (vG - bG) * t; B = bB + (vB - bB) * t;
    }
    const lum = 1.07 - 0.36 * d;
    D[i * 4] = Math.min(255, R * lum); D[i * 4 + 1] = Math.min(255, G * lum); D[i * 4 + 2] = Math.min(255, B * lum); D[i * 4 + 3] = a;
  }
  const col = L.makeCanvas(w, h); col.getContext('2d').putImageData(img, 0, 0);
  const spr = L.makeCanvas(w, h), g = spr.getContext('2d');
  g.globalAlpha = 0.93; g.drawImage(col, r.range(0.4, 1.6), r.range(0.3, 1.3)); g.globalAlpha = 1;   // the colourist's wash sits a hair off the line work
  g.save(); g.translate(w / 2, h / 2);
  g.save(); g.beginPath(); shape(g); g.clip();
  const hatch = (ang, pt, thr, wmax, alpha) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), diag = Math.hypot(w, h) / 2;
    const P = [0, 1, 2, 3].map(() => new Path2D());
    for (let o2 = -diag; o2 < diag; o2 += pt * r.range(0.86, 1.14)) {
      let prev = -1; const ph = r() * 9;
      for (let s = -diag; s < diag; s += 3) {
        const wob = Math.sin(s * 0.045 + ph) * 0.45;
        const x = ca * s - sa * (o2 + wob), y = sa * s + ca * (o2 + wob);
        const xi = Math.round(x + w / 2), yi = Math.round(y + h / 2);
        if (xi < 1 || yi < 1 || xi >= w - 1 || yi >= h - 1) { prev = -1; continue; }
        const i = yi * w + xi;
        if (M[i * 4 + 3] < 30) { prev = -1; continue; }
        const d = dark[i]; if (d < thr) { prev = -1; continue; }
        const b = Math.min(3, Math.floor(((d - thr) / (1 - thr)) * 4));
        if (b !== prev) P[b].moveTo(x - ca * 1.5, y - sa * 1.5);
        P[b].lineTo(x + ca * 1.5, y + sa * 1.5); prev = b;
      }
    }
    g.strokeStyle = L.rgba(INK, alpha); g.lineCap = 'butt';
    P.forEach((p, b) => { g.lineWidth = wmax * (0.38 + 0.2 * b); g.stroke(p); });
  };
  hatch(-0.66 - rot, pitch, 0.17, 1.7, 0.86);
  hatch(0.8 - rot, pitch * 1.2, 0.52, 1.35, 0.7);
  // pits and hairline scratches
  for (let i = 0, n = Math.round((w * h) / 1100); i < n; i++) {
    const x = r.range(-w / 2, w / 2), y = r.range(-h / 2, h / 2);
    if (r() < 0.5) {
      const rad = r.range(0.6, 1.5);
      g.fillStyle = L.rgba(INK, r.range(0.25, 0.55)); g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,248,230,0.45)'; g.beginPath(); g.arc(x + (cr + sr) * rad, y + (cr - sr) * rad, rad * 0.6, 0, TAU); g.fill();
    } else {
      const a = r() * TAU, len = r.range(4, 15);
      g.strokeStyle = L.rgba(INK, r.range(0.18, 0.38)); g.lineWidth = r.range(0.5, 0.8);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  }
  if (ink) ink(g, r);
  g.restore();
  g.lineJoin = 'round';
  g.save(); g.beginPath(); shape(g); g.clip();                               // heavier line on the shadow side
  g.translate(-(cr + sr) * 1.3, -(cr - sr) * 1.3); g.strokeStyle = L.rgba(INK, 0.5); g.lineWidth = 3; g.beginPath(); shape(g); g.stroke();
  g.restore();
  g.strokeStyle = L.rgba(INK, 0.9); g.lineWidth = 1.5; g.beginPath(); shape(g); g.stroke();
  g.restore();
  return spr;
}

// ───────────────────────── shapes (nonzero fill: outlines clockwise, holes counter-clockwise) ─────────────────────────
const coinShape = (R, a, kx = 1, wob = 0, round = false) => (g) => {
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * TAU, rr = R * (1 + 0.005 * Math.sin(3 * t + wob) + 0.003 * Math.sin(7 * t + wob * 2));
    const x = Math.cos(t) * rr * kx, y = Math.sin(t) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  if (round) { g.moveTo(a * kx, 0); g.ellipse(0, 0, a * kx, a, 0, 0, TAU, true); g.closePath(); }
  else { g.moveTo(-a * kx, -a); g.lineTo(-a * kx, a); g.lineTo(a * kx, a); g.lineTo(a * kx, -a); g.closePath(); }
};
const coinRelief = (R, a, kx = 1, round = false) => (g) => {
  g.save(); g.scale(kx, 1);
  g.strokeStyle = 'rgb(188,188,188)';
  if (round) { g.lineWidth = R * 0.05; g.beginPath(); g.arc(0, 0, R * 0.975, 0, TAU); g.stroke(); }
  else {
    g.lineWidth = R * 0.115; g.beginPath(); g.arc(0, 0, R * 0.945, 0, TAU); g.stroke();                 // 外郭
    g.lineWidth = R * 0.075; g.strokeRect(-a - R * 0.037, -a - R * 0.037, 2 * a + R * 0.074, 2 * a + R * 0.074);   // 内郭
  }
  g.restore();
};
const coinInk = (R, a, kx = 1, round = false) => (g) => {
  g.save(); g.scale(kx, 1); g.strokeStyle = L.rgba(INK, 0.62); g.lineWidth = 1.1 / Math.sqrt(kx);
  if (round) { g.beginPath(); g.arc(0, 0, a * 1.12, 0.2, 2.6); g.stroke(); }
  else {
    g.beginPath(); g.arc(0, 0, R * 0.888, 0, TAU); g.stroke();
    g.strokeRect(-a - R * 0.075, -a - R * 0.075, 2 * a + R * 0.15, 2 * a + R * 0.15);
  }
  g.restore();
};
const barShape = (hw, R) => (g) => {
  const q = hw * 0.7;
  g.moveTo(-hw + q, -R); g.lineTo(hw - q, -R); g.quadraticCurveTo(hw, -R, hw, -R + q); g.lineTo(hw, R - q); g.quadraticCurveTo(hw, R, hw - q, R);
  g.lineTo(-hw + q, R); g.quadraticCurveTo(-hw, R, -hw, R - q); g.lineTo(-hw, -R + q); g.quadraticCurveTo(-hw, -R, -hw + q, -R); g.closePath();
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
  g.fillStyle = 'rgb(150,150,150)'; g.beginPath();                              // the hollow socket stands proud of the thin blade
  g.moveTo(-0.075 * s, -0.5 * s); g.lineTo(0.075 * s, -0.5 * s); g.lineTo(0.098 * s, -0.16 * s); g.lineTo(0, -0.1 * s); g.lineTo(-0.098 * s, -0.16 * s); g.closePath(); g.fill();
  g.strokeStyle = 'rgb(178,178,178)'; g.lineWidth = 0.03 * s; g.beginPath(); spadeShape(s)(g); g.stroke();
  g.lineWidth = 0.014 * s; g.lineCap = 'round';
  for (const [p, q] of spadeLines(s)) { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  g.strokeStyle = 'rgb(190,190,190)'; g.lineWidth = 0.02 * s; g.beginPath(); g.moveTo(0, -0.49 * s); g.lineTo(0, -0.14 * s); g.stroke();
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
  g.strokeStyle = 'rgb(180,180,180)'; g.lineWidth = 0.03 * s; g.beginPath(); knifeBody(g, s); g.stroke();
  g.lineWidth = 0.022 * s; g.beginPath(); g.arc(k.rc[0], k.rc[1], 0.0385 * s, 0, TAU); g.stroke();
  g.lineWidth = 0.01 * s; knifeHandle(g, s, 0.021); knifeHandle(g, s, 0.042);
};
const knifeInk = (s) => (g) => { g.strokeStyle = L.rgba(INK, 0.55); g.lineWidth = 1; knifeHandle(g, s, 0.028); knifeHandle(g, s, 0.049); };

const cowrieShape = (s) => (g) => {
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * TAU, ct = Math.cos(t), st = Math.sin(t);
    const x = 0.345 * s * ct * (1 + 0.08 * Math.cos(2 * t)) * (1 - 0.1 * st), y = 0.5 * s * st * (1 - 0.03 * Math.cos(2 * t));
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
};
const slit = (g, s) => { g.beginPath(); g.moveTo(0.012 * s, -0.41 * s); g.quadraticCurveTo(-0.035 * s, 0, 0.012 * s, 0.41 * s); g.stroke(); };
const cowrieRelief = (s) => (g) => {
  g.lineCap = 'round'; g.strokeStyle = 'rgb(152,152,152)'; g.lineWidth = 0.24 * s; g.beginPath(); g.moveTo(0, -0.27 * s); g.lineTo(0, 0.27 * s); g.stroke();
  g.strokeStyle = 'rgb(36,36,36)'; g.lineWidth = 0.055 * s; slit(g, s);
};
const cowrieInk = (s) => (g) => {
  g.lineCap = 'round'; g.strokeStyle = L.rgba(INK, 0.85); g.lineWidth = Math.max(1.6, 0.022 * s); slit(g, s);
  g.lineWidth = 1.1; g.strokeStyle = L.rgba(INK, 0.7);
  for (let k = 0; k < 14; k++) {
    const y = (-0.36 + k * 0.0555) * s, v = y / (0.41 * s), x0 = (0.012 - 0.047 * (1 - v * v)) * s;
    for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(x0 + sg * 0.016 * s, y); g.lineTo(x0 + sg * 0.078 * s, y + 0.008 * s); g.stroke(); }
  }
};

// ───────────────────────── page ─────────────────────────
function build() {
  const paper = K.paper({ base: '#efe6d3', tone: '#8a6a3a', seed: 'p01paper', size: LS, fiber: 0.6, stain: 0.4, foxing: 0.35, edge: 0.16 });
  const print = L.makeCanvas(LS, LS), pg = print.getContext('2d');
  const SH = { dx: 6, dy: 8, blur: 7, color: 'rgba(58,40,22,0.24)' };
  const put = (g, spr, x, y, rot = 0) => K.stamp(g, spr, x, y, { rot, shadow: SH });
  const spade = (s, x, y, rot, green, seed) => put(pg, makeObject({ w: 0.55 * s + 28, h: s + 28, shape: spadeShape(s), relief: spadeRelief(s), ink: spadeInk(s), rot, green, seed }), x, y, rot);
  const knife = (s, x, y, rot, green, seed) => put(pg, makeObject({ w: 0.2 * s + 28, h: s + 28, shape: knifeShape(s), relief: knifeRelief(s), ink: knifeInk(s), rot, green, seed }), x, y, rot);
  const coin = (R, x, y, rot, green, seed, round = false) => {
    const a = round ? R * 0.2 : R * 0.29;
    put(pg, makeObject({ w: 2 * R + 28, h: 2 * R + 28, shape: coinShape(R, a, 1, R, round), relief: coinRelief(R, a, 1, round), ink: coinInk(R, a, 1, round), rot, green, seed }), x, y, rot);
  };
  const cowrie = (s, x, y, rot, seed) => put(pg, makeObject({ w: 0.8 * s + 24, h: s + 24, shape: cowrieShape(s), relief: cowrieRelief(s), ink: cowrieInk(s), rot, pal: 'shell', dome: Math.max(4, s * 0.07), seed, pitch: 3 }), x, y, rot);

  spade(520, 310, 400, -0.15, 0.42, 'spA');
  knife(620, 1095, 330, 0.55, 0.55, 'knA');
  coin(150, 285, 860, 0.4, 0.3, 'huan', true);
  spade(440, 1160, 870, 0.18, 0.62, 'spB');
  knife(540, 440, 1190, -1.3, 0.3, 'knB');
  coin(128, 860, 1150, 0.12, 0.7, 'cB');
  coin(95, 660, 310, -0.2, 0.22, 'cC');
  cowrie(120, 850, 265, 0.35, 'w1');
  cowrie(100, 880, 430, -0.5, 'w2');
  cowrie(96, 640, 1030, 1.2, 'w3');
  cowrie(86, 480, 990, -0.6, 'w4');
  cowrie(104, 1255, 540, -0.3, 'w5');

  // the stop-motion coin: face → turning → edge-on → turning back
  const R = 200, a = 58, C = LS / 2;
  const face = (kx, rot, dark0, seed, green = 0.36) => makeObject({ w: 2 * R * kx + 30, h: 2 * R + 30, shape: coinShape(R, a, kx, 1.3), relief: coinRelief(R, a, kx), ink: coinInk(R, a, kx), rot, dark0, green, seed });
  const poses = [
    (g) => put(g, face(1, 0, 0, 'f0'), C, C, 0),
    (g) => { put(g, face(0.62, -0.05, 0.34, 'e1', 0.2), C + 11, C, -0.05); put(g, face(0.62, -0.05, -0.05, 'f1'), C, C, -0.05); },
    (g) => { put(g, face(0.16, 0.04, 0.32, 'e2', 0.2), C + 10, C, 0.04); put(g, face(0.16, 0.04, 0.06, 'f2'), C, C, 0.04); },
    (g) => { put(g, face(0.62, 0.06, 0.2, 'e3', 0.2), C - 11, C, 0.06); put(g, face(0.62, 0.06, 0.1, 'f3'), C, C, 0.06); },
  ];
  return poses.map((pose) => {
    const pc = L.makeCanvas(LS, LS), g = pc.getContext('2d');
    g.drawImage(print, 0, 0); pose(g);
    K.soak(pc, paper, 0.5); K.wear(pc, { seed: 'p01wear', amount: 0.22, size: 1.4 });
    const out = L.makeCanvas(LS, LS), q = out.getContext('2d');
    q.drawImage(paper, 0, 0); q.globalCompositeOperation = 'multiply'; q.drawImage(pc, 0, 0); q.globalCompositeOperation = 'source-over';
    return out;
  });
}

export default {
  name: '泉谱图版',
  init() { layers = build(); },
  draw(ctx, env, p) {
    const f = env && env.frame !== undefined ? env.frame : Math.round(p * 37);
    K.drift(ctx, layers[Math.floor(f / 3) % 4], p, { z0: 1, z1: 1.055, x0: 8, y0: 6, x1: -6, y1: -8 });
  },
};
