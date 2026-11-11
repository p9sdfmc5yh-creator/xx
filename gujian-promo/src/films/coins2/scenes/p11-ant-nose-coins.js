// p11 — 蚁鼻钱: a tinted natural-history plate of Chu "ant-nose" bronze cowries (the reference's page of green microbes).
// A dozen-odd teardrop-shaped little bronzes (wide end up, domed face) scattered on grey-white paper, verdigris all over, painted as
// layered watercolour washes with a pen outline that thickens on the shadow side and pen stipple in the shade. The incised legend
// is only suggested: two sunk pits and one sunk stroke — nothing readable. A small hole near the wide end.
// Each coin is shaded per pixel from a height field (light from the top-left in PAGE space), masked by an antialiased outline.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const TAU = Math.PI * 2;
const LS = 1400;                                  // layer size (160 px margin round the frame)
let layer = null;

const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const LIGHT = (() => { const v = [-0.52, -0.62, 0.59], n = Math.hypot(...v); return v.map((c) => c / n); })();   // toward the light
const RAMP = [[0, [28, 74, 60]], [0.28, [54, 124, 98]], [0.58, [112, 178, 144]], [0.82, [186, 222, 196]], [1, [234, 239, 228]]];
function ramp(t, out) {
  t = cl(t);
  for (let k = 1; k < RAMP.length; k++) if (t <= RAMP[k][0]) {
    const a = RAMP[k - 1], b = RAMP[k], u = (t - a[0]) / (b[0] - a[0]);
    out[0] = a[1][0] + (b[1][0] - a[1][0]) * u; out[1] = a[1][1] + (b[1][1] - a[1][1]) * u; out[2] = a[1][2] + (b[1][2] - a[1][2]) * u; return;
  }
}

/** one ant-nose coin. o: len (px), rot (page rotation, for the light), seed */
function makeCoin(o) {
  const r = L.rng('ab' + o.seed), nz = L.makeNoise('ab' + o.seed);
  const A = o.len / 2, B = A * r.range(0.6, 0.7), pad = 7;
  const w = Math.ceil(B * 2.1 + pad * 2), h = Math.ceil(A * 2 + pad * 2), ox = w / 2, oy = h / 2;
  const taper = r.range(0.2, 0.32), pw = r.range(0.5, 0.58), ph1 = r.range(0, TAU), ph2 = r.range(0, TAU), lop = r.range(-0.04, 0.04);
  let wmax = 0; for (let v = -1; v <= 1; v += 0.02) wmax = Math.max(wmax, Math.pow(1 - v * v, pw) * (1 - taper * v));
  const hw = (v, side) => {
    const vv = v < -1 ? -1 : v > 1 ? 1 : v;
    const base = (Math.pow(Math.max(0, 1 - vv * vv), pw) * (1 - taper * vv)) / wmax;
    return B * base * (1 + 0.03 * Math.sin(vv * 2.6 + ph1 + side * 1.3) + 0.016 * Math.sin(vv * 6.1 + ph2 * side) + side * lop * (1 - vv * vv));
  };
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const lx = c * LIGHT[0] + s * LIGHT[1], ly = -s * LIGHT[0] + c * LIGHT[1], lz = LIGHT[2];
  const l2 = Math.hypot(lx, ly), l2x = lx / l2, l2y = ly / l2;
  // the sunk marks: two pits ("eyes"), one stroke below them, the hole near the wide end
  const e1 = [-B * r.range(0.24, 0.32), -A * r.range(0.16, 0.26), B * r.range(0.13, 0.17), A * r.range(0.075, 0.1)];
  const e2 = [B * r.range(0.24, 0.32), -A * r.range(0.16, 0.26), B * r.range(0.13, 0.17), A * r.range(0.075, 0.1)];
  const n0 = [B * r.range(-0.05, 0.05), A * r.range(0.0, 0.06)], n1 = [B * r.range(-0.08, 0.08), A * r.range(0.4, 0.5)], nw = B * r.range(0.065, 0.085);
  const worn = r.range(0.6, 1), Hmax = B * 0.5;
  const hole = [B * r.range(-0.05, 0.05), -A * r.range(0.64, 0.7), B * r.range(0.1, 0.125)], pierced = r.chance(0.75);
  const N = w * h, Hf = new Float32Array(N), Qf = new Float32Array(N), If = new Float32Array(N);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = px + 0.5 - ox, y = py + 0.5 - oy, v = y / A, i = py * w + px;
    if (v <= -1 || v >= 1) continue;
    const e = Math.max(1e-3, hw(v, x < 0 ? -1 : 1)); const q0 = x / e, q = 1 - q0 * q0;
    if (q <= 0) continue;
    const m = q * Math.pow(1 - v * v, 0.7);
    let H = Hmax * Math.pow(m, 0.46);
    H += Hmax * 0.03 * nz.fbm(x / 52, y / 52, 2) * ss(0, 0.3, m);
    let dx = (x - e1[0]) / e1[2], dy = (y - e1[1]) / e1[3]; let inc = Math.exp(-Math.pow(dx * dx + dy * dy, 1.5));
    dx = (x - e2[0]) / e2[2]; dy = (y - e2[1]) / e2[3]; inc = Math.max(inc, Math.exp(-Math.pow(dx * dx + dy * dy, 1.5)));
    const sx = n1[0] - n0[0], sy = n1[1] - n0[1], tt = cl(((x - n0[0]) * sx + (y - n0[1]) * sy) / (sx * sx + sy * sy));
    const dn = Math.hypot(x - n0[0] - sx * tt, y - n0[1] - sy * tt) / nw; inc = Math.max(inc, Math.exp(-Math.pow(dn, 2.6)));
    const dh = Math.hypot(x - hole[0], y - hole[1]) / (hole[2] * 1.5); const hd = Math.exp(-Math.pow(dh, 2.4));
    H -= Hmax * (0.34 * inc * worn + 0.4 * hd);
    Hf[i] = H; Qf[i] = m; If[i] = Math.max(inc * worn, pierced ? hd * 0.5 : hd);
  }
  const tmp = L.makeCanvas(w, h), tg = tmp.getContext('2d'), img = tg.createImageData(w, h), D = img.data, col = [0, 0, 0];
  const hueSeed = r.range(0, 50), warm = r.range(-0.25, 0.25);
  for (let py = 1; py < h - 1; py++) for (let px = 1; px < w - 1; px++) {
    const i = py * w + px, m = Qf[i]; if (m <= 0 && Qf[i - 1] <= 0 && Qf[i + 1] <= 0 && Qf[i - w] <= 0 && Qf[i + w] <= 0) continue;
    const x = px + 0.5 - ox, y = py + 0.5 - oy;
    const gx = (Hf[i + 1] - Hf[i - 1]) * 0.5, gy = (Hf[i + w] - Hf[i - w]) * 0.5, inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    const lam = (-gx * lx - gy * ly + lz) * inv;
    let t = ss(-0.15, 1.0, lam) + 0.035 * nz.fbm(x / 32 + 7, y / 32, 2);
    const t4 = t * 5, f = t4 - Math.floor(t4); t = t * 0.68 + ((Math.floor(t4) + ss(0.25, 0.75, f)) / 5) * 0.32;      // layered washes
    t -= 0.2 * (1 - ss(0, 0.16, m));                                                                              // pigment pooled at the edge
    t -= 0.34 * If[i];
    ramp(t, col);
    const hv = nz.fbm(x / 60 + hueSeed, y / 60, 3) + warm, k = Math.abs(hv) * 0.75 * ss(0.1, 0.5, t) * (1 - ss(0.8, 1, t));
    const tr = hv > 0 ? 70 : 150, tgc = hv > 0 ? 158 : 168, tb = hv > 0 ? 166 : 96;                               // blue verdigris ↔ yellow-green
    col[0] += (tr - col[0]) * k; col[1] += (tgc - col[1]) * k; col[2] += (tb - col[2]) * k;
    const ev = ss(0.3, 0.62, nz.fbm(x / 48 + 9, y / 48 + 5, 2)) * 0.42 * (1 - If[i]);                                // earthy crust
    col[0] += (156 - col[0]) * ev; col[1] += (132 - col[1]) * ev; col[2] += (84 - col[2]) * ev;
    const o4 = i * 4; D[o4] = col[0]; D[o4 + 1] = col[1]; D[o4 + 2] = col[2]; D[o4 + 3] = 255;
  }
  tg.putImageData(img, 0, 0);

  // outline polygon
  const NP = 180, pts = [], nrm = [];
  for (let i = 0; i < NP; i++) { const t = (i / NP) * TAU, sg = t < Math.PI ? 1 : -1, v = -Math.cos(t); pts.push([sg * hw(v, sg), v * A]); }
  for (let i = 0; i < NP; i++) { const a = pts[(i + NP - 1) % NP], b = pts[(i + 1) % NP], tx = b[0] - a[0], ty = b[1] - a[1], n = Math.hypot(tx, ty) || 1; nrm.push([ty / n, -tx / n]); }
  const cv = L.makeCanvas(w, h), g = cv.getContext('2d'); g.translate(ox, oy);
  const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  path(); g.fillStyle = '#000'; g.fill();
  g.globalCompositeOperation = 'source-in'; g.drawImage(tmp, -ox, -oy);
  g.globalCompositeOperation = 'source-atop';
  const inside = (x, y, mg) => { const v = y / A; return Math.abs(v) < 0.94 && Math.abs(x) < hw(v, x < 0 ? -1 : 1) - mg; };
  // crust lumps
  for (let k = 0, n = r.int(8, 13); k < n; k++) {
    const x = r.range(-B, B), y = r.range(-A, A), rr = r.range(2.5, 6.5); if (!inside(x, y, rr + 3)) continue;
    g.fillStyle = 'rgba(20,56,48,0.32)'; g.beginPath(); g.ellipse(x - l2x * 1.4, y - l2y * 1.4, rr, rr * r.range(0.7, 1), r() * 3, 0, TAU); g.fill();
    g.fillStyle = L.radial(g, x + l2x * rr * 0.3, y + l2y * rr * 0.3, 0, rr, [[0, 'rgba(214,234,214,0.9)'], [0.7, 'rgba(150,200,172,0.75)'], [1, 'rgba(110,170,140,0.5)']]);
    g.beginPath(); g.ellipse(x, y, rr, rr * r.range(0.7, 1), r() * 3, 0, TAU); g.fill();
  }
  // corrosion pits: dark on the wall toward the light, a lit lip on the far side
  for (let k = 0, n = r.int(26, 40); k < n; k++) {
    const x = r.range(-B, B), y = r.range(-A, A), rr = r.range(1.1, 2.9); if (!inside(x, y, rr + 2)) continue;
    g.fillStyle = 'rgba(214,236,218,0.55)'; g.beginPath(); g.arc(x - l2x * 0.9, y - l2y * 0.9, rr, 0, TAU); g.fill();
    g.fillStyle = `rgba(18,50,44,${r.range(0.5, 0.8).toFixed(2)})`; g.beginPath(); g.ellipse(x, y, rr, rr * r.range(0.6, 1), r() * 3, 0, TAU); g.fill();
  }
  // fine scratches
  g.lineCap = 'round';
  for (let k = 0, n = r.int(5, 9); k < n; k++) {
    const x = r.range(-B * 0.7, B * 0.7), y = r.range(-A * 0.8, A * 0.8), a = r() * TAU, len = r.range(8, 26), bx = Math.cos(a) * len, by = Math.sin(a) * len;
    g.strokeStyle = 'rgba(20,56,48,0.38)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bx * 0.5 + by * 0.1, y + by * 0.5 - bx * 0.1, x + bx, y + by); g.stroke();
    g.strokeStyle = 'rgba(222,240,224,0.4)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x - l2x, y - l2y); g.quadraticCurveTo(x + bx * 0.5 + by * 0.1 - l2x, y + by * 0.5 - bx * 0.1 - l2y, x + bx - l2x, y + by - l2y); g.stroke();
  }
  // pen stipple in rows following the outline, on the side away from the light
  g.fillStyle = 'rgba(16,48,42,0.62)';
  for (let row = 0; row < 6; row++) {
    const d = 4 + row * 4.4, step = 4.2 + row * 0.9; let acc = r() * step;
    for (let i = 0; i < NP; i++) {
      const p = pts[i], q = pts[(i + 1) % NP]; acc += Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (acc < step) continue; acc -= step;
      const shade = -(nrm[i][0] * l2x + nrm[i][1] * l2y); if (shade < 0.12 + row * 0.13 || !r.chance(0.9)) continue;
      const x = p[0] - nrm[i][0] * d + r.range(-0.8, 0.8), y = p[1] - nrm[i][1] * d + r.range(-0.8, 0.8); if (!inside(x, y, 1.5)) continue;
      g.beginPath(); g.arc(x, y, 0.65 + 0.55 * shade * (1 - row / 8), 0, TAU); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // pen outline: thin all round, swelling on the shadow side
  path(); g.strokeStyle = 'rgba(26,62,52,0.8)'; g.lineWidth = 1.25; g.lineJoin = 'round'; g.stroke();
  g.strokeStyle = '#234f43';
  for (let i = 0; i < NP; i++) {
    const shade = -(nrm[i][0] * l2x + nrm[i][1] * l2y); if (shade < 0.1) continue;
    const p = pts[i], q = pts[(i + 1) % NP]; g.lineWidth = 1.1 + 1.7 * ss(0.1, 0.9, shade); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
  }
  // the hole
  if (pierced) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(hole[0], hole[1], hole[2] * 0.82, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over'; }
  const la = Math.atan2(l2y, l2x);
  g.strokeStyle = 'rgba(14,42,38,0.85)'; g.lineWidth = 1.8; g.beginPath(); g.arc(hole[0], hole[1], hole[2] * 0.86, la - 1.35, la + 1.35); g.stroke();
  g.strokeStyle = 'rgba(206,232,212,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.arc(hole[0], hole[1], hole[2] * 0.98, la + Math.PI - 1.1, la + Math.PI + 1.1); g.stroke();
  return cv;
}

function build() {
  const pap = K.paper({ base: '#e7e7e0', tone: '#7b7868', seed: 'p11paper', fiber: 0.55, stain: 0.28, foxing: 0.22, edge: 0.14, size: LS });
  const ink = L.makeCanvas(LS, LS), g = ink.getContext('2d');
  // scatter: dart throwing over the whole layer (coins run off the edges)
  const r = L.rng('p11lay'), spots = [];
  for (let t = 0; t < 6000 && spots.length < 30; t++) {
    const x = r.range(-30, LS + 30), y = r.range(-30, LS + 30), len = r.range(212, 292);
    let ok = true; for (const p of spots) if (Math.hypot(p.x - x, p.y - y) < (p.len + len) * 0.47) { ok = false; break; }
    if (ok) spots.push({ x, y, len, rot: r.chance(0.3) ? r.range(0, TAU) : r.gauss() * 0.55 });
  }
  spots.forEach((sp, i) => {
    const spr = makeCoin({ len: sp.len, rot: sp.rot, seed: i });
    K.stamp(g, spr, sp.x, sp.y, { rot: sp.rot, shadow: { dx: 0, dy: 0, blur: 7, color: 'rgba(96,160,132,0.30)' }, alpha: 0.5 });   // wash bleeding into the paper
    K.stamp(g, spr, sp.x, sp.y, { rot: sp.rot, shadow: { dx: 6, dy: 9, blur: 11, color: 'rgba(48,58,64,0.36)' } });
  });
  // a few drops flicked off the brush
  for (let k = 0; k < 16; k++) {
    const x = r.range(0, LS), y = r.range(0, LS), rr = r.range(1.6, 4.2);
    if (spots.some((p) => Math.hypot(p.x - x, p.y - y) < p.len * 0.5)) continue;
    g.fillStyle = `rgba(96,160,134,${r.range(0.25, 0.5).toFixed(2)})`; g.beginPath(); g.ellipse(x, y, rr, rr * r.range(0.8, 1), r() * 3, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(52,116,94,0.45)'; g.lineWidth = 0.9; g.stroke();
  }
  K.soak(ink, pap, 0.5);
  const out = L.makeCanvas(LS, LS), og = out.getContext('2d');
  og.drawImage(pap, 0, 0); og.drawImage(ink, 0, 0);
  return out;
}

export default {
  name: '蚁鼻钱',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.03, x0: 18, y0: 12, x1: -12, y1: -8 });
  },
};
