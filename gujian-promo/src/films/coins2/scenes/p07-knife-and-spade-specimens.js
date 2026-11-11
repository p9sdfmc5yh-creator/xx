// p07 — 刀布标本: a natural-history style colour plate. Six bronze knife and spade coins lie loose on grey-white paper,
// each at its own angle, green-patinated, lit from the top-left with a soft contact shadow. No lettering anywhere.
// Each coin: mask → height map (bevelled edge, raised rim, raised lines, casting lumps) → relief shading (L.bumpLight)
// over a bronze + patina colour pass → pits, scratches, malachite specks → thin drawn outline.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const LS = 1400;
const TAU = Math.PI * 2;
let layer = null;

// ── small canvas helpers ──
function copyOf(src) { const c = L.makeCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; }
function erode(mask, rad) {
  const c = copyOf(mask), g = c.getContext('2d'); g.globalCompositeOperation = 'destination-in';
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; g.drawImage(mask, Math.cos(a) * rad, Math.sin(a) * rad); }
  return c;
}
function rimOf(mask, rad, colour) {
  const c = copyOf(mask), g = c.getContext('2d');
  g.globalCompositeOperation = 'destination-out'; g.drawImage(erode(mask, rad), 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function polyline(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); }

// ── knife coin (刀币): tip, blade with an arched back and a concave edge, flat handle, small round ring ──
function knifeGeom(o) {
  const { len = 450, bend = 22, bladeW = 58, handleW = 31, ringR = 25, tipSlant = 0.07, shoulderT = 0.6, flare = 0.12 } = o;
  const y0 = -len / 2, y1 = len / 2 - ringR * 2 + 5, hb = handleW / 2;
  const P = (t) => [bend * (Math.sin(Math.PI * (0.08 + 0.84 * t)) - 0.62), L.lerp(y0, y1, t)];
  const T = (t) => { const a = P(t - 0.002), b = P(t + 0.002); const m = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / m, (b[1] - a[1]) / m]; };
  const off = (t, d) => { const p = P(t), tg = T(t); return [p[0] + tg[1] * d, p[1] - tg[0] * d]; };   // +d = towards the back (+x)
  const he = (t) => { const blade = (bladeW - hb) * (1 + flare * (1 - t / shoulderT)); return L.lerp(blade, hb, L.smooth((t - (shoulderT - 0.06)) / 0.085)); };
  const back = [], edge = [];
  for (let t = 0; t <= 1.0001; t += 0.02) back.push(off(t, hb));
  for (let t = 1; t >= tipSlant - 0.0001; t -= 0.01) edge.push(off(t, -he(t)));
  const pe = P(1), te = T(1), rc = [pe[0] + te[0] * (ringR - 5), pe[1] + te[1] * (ringR - 5)];
  const path = (g) => {
    g.beginPath();
    back.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    edge.forEach((p) => g.lineTo(p[0], p[1]));
    g.closePath();
    g.moveTo(rc[0] + ringR, rc[1]); g.arc(rc[0], rc[1], ringR, 0, TAU, false);
    g.moveTo(rc[0] + ringR * 0.5, rc[1]); g.arc(rc[0], rc[1], ringR * 0.5, 0, TAU, true);
  };
  const lines = [];
  for (const d of [hb * 0.36, -hb * 0.36]) { const l = []; for (let t = shoulderT - 0.1; t <= 0.985; t += 0.02) l.push(off(t, d)); lines.push(l); }
  const spine = []; for (let t = 0.03; t <= shoulderT - 0.02; t += 0.02) spine.push(off(t, hb - 7));
  const detail = (g, mode) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = mode === 'h' ? '#c6c6c6' : 'rgba(192,148,94,0.6)'; g.lineWidth = mode === 'h' ? 4 : 2.4;
    lines.forEach((l) => { polyline(g, l); g.stroke(); });
    g.strokeStyle = mode === 'h' ? '#9a9a9a' : 'rgba(176,134,86,0.22)'; g.lineWidth = mode === 'h' ? 5 : 3;
    polyline(g, spine); g.stroke();
    // the ring's own raised rim round the hole
    g.strokeStyle = mode === 'h' ? '#c6c6c6' : 'rgba(176,134,86,0.3)'; g.lineWidth = mode === 'h' ? 4 : 2.4;
    g.beginPath(); g.arc(rc[0], rc[1], ringR * 0.5 + 2.5, 0, TAU); g.stroke();
  };
  return { w: Math.ceil(bladeW + bend * 2 + ringR * 2 + 60), h: len + 50, path, detail };
}

// ── hollow-handle spade (空首布): socket head, shoulders, two feet ──
function spadeGeom(o) {
  const { H = 320, hw = 86, type = 'peaked' } = o;
  const top = -H / 2, bot = H / 2, sr = top + H * 0.34, st = hw * 0.27, sb = hw * 0.33;
  const apexY = type === 'peaked' ? sr + H * 0.3 : bot - H * 0.15;
  const path = (g) => {
    g.beginPath(); g.moveTo(-st, top); g.lineTo(st, top); g.lineTo(sb, sr - 3);
    if (type === 'peaked') {
      g.quadraticCurveTo(hw * 0.5, sr + 6, hw, sr - H * 0.065);
      g.lineTo(hw * 0.9, bot);
      g.bezierCurveTo(hw * 0.7, bot - H * 0.2, hw * 0.34, apexY + 8, 0, apexY);
      g.bezierCurveTo(-hw * 0.34, apexY + 8, -hw * 0.7, bot - H * 0.2, -hw * 0.9, bot);
      g.lineTo(-hw, sr - H * 0.065);
      g.quadraticCurveTo(-hw * 0.5, sr + 6, -sb, sr - 3);
    } else {
      g.quadraticCurveTo(sb + 3, sr + 1, sb + 10, sr + 2);
      g.lineTo(hw - 3, sr + 4); g.lineTo(hw * 1.05, bot);
      g.lineTo(hw * 0.6, bot - 2);
      g.quadraticCurveTo(0, bot - 2 * (bot - apexY), -hw * 0.6, bot - 2);
      g.lineTo(-hw * 1.05, bot); g.lineTo(-hw + 3, sr + 4); g.lineTo(-sb - 10, sr + 2);
      g.quadraticCurveTo(-sb - 3, sr + 1, -sb, sr - 3);
    }
    g.closePath();
  };
  const footY = type === 'peaked' ? bot - H * 0.1 : apexY - 8;
  const detail = (g, mode) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    // faceted socket: raised middle facet running down into a wedge on the blade
    g.fillStyle = mode === 'h' ? '#9c9c9c' : 'rgba(170,128,82,0.2)';
    g.beginPath(); g.moveTo(-st * 0.5, top + 3); g.lineTo(st * 0.5, top + 3); g.lineTo(sb * 0.56, sr); g.lineTo(0, sr + H * 0.11); g.lineTo(-sb * 0.56, sr); g.closePath(); g.fill();
    // three raised lines on the blade
    g.strokeStyle = mode === 'h' ? '#c6c6c6' : 'rgba(192,148,94,0.6)'; g.lineWidth = mode === 'h' ? 4.2 : 2.6;
    g.beginPath(); g.moveTo(0, sr + H * 0.1); g.lineTo(0, apexY - 9);
    g.moveTo(sb * 0.8, sr + 8); g.lineTo(hw * (type === 'peaked' ? 0.62 : 0.72), footY);
    g.moveTo(-sb * 0.8, sr + 8); g.lineTo(-hw * (type === 'peaked' ? 0.62 : 0.72), footY); g.stroke();
    // the small hole in the socket wall, core clay still inside
    const hy = top + (sr - top) * 0.46;
    g.fillStyle = mode === 'h' ? '#2c2c2c' : 'rgba(34,24,16,0.82)';
    g.beginPath(); g.ellipse(0, hy, st * 0.24, st * 0.36, 0, 0, TAU); g.fill();
  };
  return { w: Math.ceil(hw * 2.1 + 50), h: H + 50, path, detail };
}

// ── render one bronze as a sprite ──
function bronze(geom, seed, pal) {
  const w = geom.w, h = geom.h, r = L.rng(seed);
  const mask = L.makeCanvas(w, h), mg = mask.getContext('2d');
  mg.translate(w / 2, h / 2); mg.fillStyle = '#fff'; geom.path(mg); mg.fill();
  // height map
  const hc = L.makeCanvas(w, h), hg = hc.getContext('2d');
  hg.drawImage(mask, 0, 0); hg.globalCompositeOperation = 'source-in'; hg.fillStyle = '#727272'; hg.fillRect(0, 0, w, h);
  hg.globalCompositeOperation = 'source-atop';
  hg.drawImage(rimOf(mask, 5.5, '#c2c2c2'), 0, 0);
  hg.save(); hg.translate(w / 2, h / 2); geom.detail(hg, 'h'); hg.restore();
  hg.globalAlpha = 0.16; hg.drawImage(L.noiseTex(w, h, { seed: seed + 'h', scale: 34, octaves: 4, res: 0.5, contrast: 1.7 }), 0, 0);
  hg.globalAlpha = 0.07; hg.drawImage(L.noiseTex(w, h, { seed: seed + 'k', scale: 6, octaves: 2, res: 1, contrast: 1.9 }), 0, 0);
  hg.globalAlpha = 1;
  const relief = L.bumpLight(hc, { angle: 45, strength: 4.2, blur: 1.1, res: 1 });

  // colour
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = L.linear(g, 0, 0, w, h, [[0, pal.hi], [1, pal.lo]]); g.fillRect(0, 0, w, h);
  const T0 = 'rgba(0,0,0,0)';
  const wash = (sd, scale, ramp, opts = {}) => g.drawImage(L.noiseTex(w, h, { seed: seed + sd, scale, octaves: 5, warp: 0.4, res: 0.5, ramp, ...opts }), 0, 0);
  wash('c', 46, [[0, L.rgba('#6a3422', 0)], [0.5, L.rgba('#6a3422', 0)], [0.7, L.rgba('#6a3422', 0.4)], [1, L.rgba('#7c3a24', 0.6)]]);                                  // cuprite red under the green
  wash('p', 58, [[0, L.rgba(pal.g0, 0)], [0.45 - pal.amt, L.rgba(pal.g0, 0)], [0.55 - pal.amt, L.rgba(pal.g0, 0.8)], [0.74, L.rgba(pal.g1, 0.95)], [1, pal.g2]]);     // malachite crust
  wash('a', 30, [[0, L.rgba(pal.b0, 0)], [0.66, L.rgba(pal.b0, 0)], [0.75, L.rgba(pal.b0, 0.7)], [1, pal.b0]]);                                                            // azurite spots
  wash('e', 20, [[0, L.rgba('#b59a6c', 0)], [0.63, L.rgba('#b59a6c', 0)], [0.72, L.rgba('#b59a6c', 0.7)], [1, '#c9b388']], { octaves: 3 });                               // burial earth
  void T0;
  // high points rubbed back to metal
  g.drawImage(rimOf(mask, 4.5, 'rgba(186,142,90,0.5)'), 0, 0);
  g.save(); g.translate(w / 2, h / 2); geom.detail(g, 'c'); g.restore();
  // micro: malachite specks in clusters, pits, hairline scratches
  for (let k = 0, n = Math.round((w * h) / 2600); k < n; k++) {
    const cx = r() * w, cy = r() * h, col = r.chance(0.7) ? pal.g2 : '#d9e6d2';
    for (let j = 0, m = r.int(6, 18); j < m; j++) {
      g.globalAlpha = r.range(0.35, 0.85); g.fillStyle = col;
      g.beginPath(); g.ellipse(cx + r.gauss() * 7, cy + r.gauss() * 7, r.range(0.5, 1.6), r.range(0.4, 1.2), r() * 3, 0, TAU); g.fill();
    }
  }
  for (let k = 0, n = Math.round((w * h) / 520); k < n; k++) {
    const x = r() * w, y = r() * h, rad = r.range(0.6, 2.1);
    g.globalAlpha = r.range(0.3, 0.62); g.fillStyle = '#20160e'; g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.6, 1), r() * 3, 0, TAU); g.fill();
    g.globalAlpha = r.range(0.2, 0.42); g.strokeStyle = '#e4eedb'; g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, rad + 0.5, 0.15, 1.5); g.stroke();
  }
  g.lineCap = 'round';
  for (let k = 0, n = Math.round((w * h) / 4200); k < n; k++) {
    const x = r() * w, y = r() * h, a = r() * TAU, len = r.range(8, 30);
    g.globalAlpha = r.range(0.1, 0.24); g.strokeStyle = r.chance(0.5) ? '#ead9b4' : '#1c140c'; g.lineWidth = r.range(0.5, 0.9);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.2) * len * 0.5, y + Math.sin(a + 0.2) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  g.globalAlpha = 1;
  // relief light (top-left) and a broad form shade
  g.globalCompositeOperation = 'overlay'; g.drawImage(relief, 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.35; g.drawImage(relief, 0, 0); g.globalAlpha = 1;
  g.fillStyle = L.linear(g, 0, 0, w, h, [[0, 'rgba(255,248,230,0.18)'], [0.5, 'rgba(128,128,128,0)'], [1, 'rgba(10,6,0,0.26)']]);
  g.globalCompositeOperation = 'soft-light'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
  // drawn outline, heavier on the shadow side (the plate-maker's key line)
  g.globalCompositeOperation = 'source-over';
  g.drawImage(rimOf(mask, 1.1, 'rgba(34,22,12,0.5)'), 0, 0);
  const sh = copyOf(mask), sg = sh.getContext('2d'); sg.globalCompositeOperation = 'destination-out'; sg.drawImage(mask, -1.8, -1.8);
  sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgba(26,16,8,0.5)'; sg.fillRect(0, 0, w, h);
  g.drawImage(sh, 0, 0);
  return c;
}

function build() {
  const c = L.makeCanvas(LS, LS), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#e5e3da', tone: '#86775a', seed: 'p07paper', fiber: 0.55, stain: 0.26, foxing: 0.22, edge: 0.12, size: LS }), 0, 0);
  const pals = [
    { hi: '#7b5632', lo: '#4a321f', g0: '#3f7f66', g1: '#62a488', g2: '#a5d2ba', b0: '#3d7d8c', amt: 0.02 },
    { hi: '#6f5234', lo: '#45301e', g0: '#4a8a62', g1: '#74ad82', g2: '#b4d8b0', b0: '#44808a', amt: 0.06 },
    { hi: '#80583a', lo: '#523624', g0: '#3a7a70', g1: '#5c9f96', g2: '#9fcfc4', b0: '#3a6f93', amt: -0.03 },
  ];
  const items = [
    { geom: knifeGeom({ len: 540, bend: 30, bladeW: 70, handleW: 43, ringR: 31 }), x: 440, y: 520, rot: -0.52, pal: 0 },
    { geom: spadeGeom({ H: 380, hw: 104, type: 'peaked' }), x: 830, y: 430, rot: 0.17, pal: 1 },
    { geom: knifeGeom({ len: 520, bend: 36, bladeW: 72, handleW: 40, ringR: 30, tipSlant: 0.15, flare: 0.28 }), x: 1000, y: 880, rot: 0.92, pal: 2, flip: true },
    { geom: spadeGeom({ H: 350, hw: 100, type: 'flat' }), x: 560, y: 990, rot: -0.24, pal: 2 },
    { geom: spadeGeom({ H: 330, hw: 90, type: 'peaked' }), x: 1205, y: 330, rot: 0.62, pal: 0 },
    { geom: knifeGeom({ len: 520, bend: 26, bladeW: 68, handleW: 41, ringR: 30 }), x: 205, y: 1040, rot: 0.13, pal: 1, flip: true },
  ];
  items.forEach((it, i) => {
    const spr = bronze(it.geom, 'p07coin' + i, pals[it.pal]);
    // wide soft cast shadow, then a tight contact shadow under the same sprite
    K.stamp(g, spr, it.x, it.y, { rot: it.rot, flip: !!it.flip, shadow: { dx: 9, dy: 14, blur: 22, color: 'rgba(52,42,30,0.30)' } });
    K.stamp(g, spr, it.x, it.y, { rot: it.rot, flip: !!it.flip, shadow: { dx: 2.5, dy: 4, blur: 5, color: 'rgba(40,28,16,0.42)' } });
  });
  return c;
}

export default {
  name: '刀布标本',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.035, x0: 18, y0: 12, x1: -18, y1: -10 });
  },
};
