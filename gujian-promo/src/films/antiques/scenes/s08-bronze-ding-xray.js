// s08 — 青铜鼎X光片. A radiograph of a bronze round ding (圆鼎) on the light box, shot close: black / white / grey only.
// The arc is the outer outline of the vessel's rim; the thick lip prints as the brightest band on the film and rolls
// softly into the wall. Below it the belly is a big pale mass: one spongy band of shrinkage porosity under the lip (dark,
// merged, irregular voids with thin bright walls between them — not a field of neat dots), a broad soft "valley" where
// the wall runs thin, the whiter ring of a foot root showing through at the lower left, three or four small squares
// (垫片, spacers) and a thin bright mould seam (范线) running down to the foot.
// Above the arc: clean film black, with one upright ear (立耳) standing on the rim at either edge of the frame.
//
// Everything is computed once in init() as a "thickness" field T (how much metal the beam crosses), then run through a
// film curve → cold grey ramp, given a macro lens's depth of field (sharp at the crest, soft toward the sides and the
// bottom) and the bloom of the light box behind the clear parts of the film. draw() only blits the plate, drifts a soft
// scan band across the belly and jitters the grain.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 48;
const RIM = 46;            // the solid white part of the lip (px); it rolls off into the wall over about the same again
const BG = '#050607';
// the two ears are hand-made castings: not quite the same size, not quite the same lean. They stand far out toward the
// frame edges (well clear of the crest) and are cropped by them.
const EARS = [
  { th: -0.452, ht: 322, hw: 170, bar: 94, lean: -0.215, seed: 3.1 },
  { th: 0.458, ht: 300, hw: 179, bar: 101, lean: 0.25, seed: 8.6 },
];
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Worley cells that also report WHERE the nearest feature point is, so a whole cell can be switched on or off */
function makeCells(seed) {
  const r = L.rng('s08cells' + seed), perm = new Uint8Array(512), jx = new Float32Array(256), jy = new Float32Array(256), id = new Float32Array(256);
  const p = []; for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { jx[i] = r(); jy[i] = r(); id[i] = r(); }
  const o = { d1: 0, d2: 0, fx: 0, fy: 0, id: 0 };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9, d2 = 9, bx = 0, by = 0, bh = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = xi + ox, gy = yi + oy, h = perm[(gx & 255) + perm[gy & 255]];
      const fx = gx + 0.1 + 0.8 * jx[h], fy = gy + 0.1 + 0.8 * jy[h], dx = fx - x, dy = fy - y, dd = dx * dx + dy * dy;
      if (dd < d1) { d2 = d1; d1 = dd; bx = fx; by = fy; bh = h; } else if (dd < d2) d2 = dd;
    }
    o.d1 = Math.sqrt(d1); o.d2 = Math.sqrt(d2); o.fx = bx; o.fy = by; o.id = id[bh];
    return o;
  };
}

/** polyline of an arch (∩): up the left side, round the two top corners, down the right side */
function archPts(hw0, hw1, ht, rr, yb) {
  const pts = [], q = Math.PI / 2;
  for (let i = 0; i <= 12; i++) pts.push([L.lerp(-hw0, -hw1, i / 12), L.lerp(yb, -ht + rr, i / 12)]);
  for (let i = 1; i <= 10; i++) { const an = Math.PI + (i / 10) * q; pts.push([-hw1 + rr + Math.cos(an) * rr, -ht + rr + Math.sin(an) * rr]); }
  for (let i = 1; i <= 6; i++) pts.push([L.lerp(-hw1 + rr, hw1 - rr, i / 7), -ht]);
  for (let i = 0; i <= 10; i++) { const an = -q + (i / 10) * q; pts.push([hw1 - rr + Math.cos(an) * rr, -ht + rr + Math.sin(an) * rr]); }
  for (let i = 1; i <= 12; i++) pts.push([L.lerp(hw1, hw0, i / 12), L.lerp(-ht + rr, yb, i / 12)]);
  return pts;
}
/**
 * one upright ear: a thick arch standing on the rim, leaning slightly outward. Drawn in frame coords.
 * `lift` slides the shape outward: drawing it twice (near face + far face of the slab) lets the overlap print denser
 * than the single-thickness fringe.
 */
function earPath(g, a, e, lift) {
  const p = a.pt(e.th, 0), nz = L.makeNoise('s08ear' + e.seed);
  g.save(); g.translate(p.x, p.y); g.rotate(e.lean); g.translate(0, -lift);
  const yb = 150;
  const wob = (pts, seed, amp) => L.smoothPath(pts.map(([x, y], i) => {
    const dx = x, dy = y + e.ht * 0.5, m = Math.hypot(dx, dy) || 1;
    const k = y > 0 ? 0 : amp * (nz.n2(i * 0.085, seed) + 0.35 * nz.n2(i * 0.41, seed + 5));
    return [x + (dx / m) * k, y + (dy / m) * k];
  }), 5);
  const ih = e.hw - e.bar;
  const outer = wob(archPts(e.hw, e.hw - 11, e.ht, e.hw * 0.56, yb), 1.7, 5.5);
  const inner = wob(archPts(ih + 6, ih - 3, e.ht - e.bar * 0.97, ih * 0.64, yb), 9.3, 4.2);
  g.beginPath();
  outer.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
  inner.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
  g.fill('evenodd');
  g.restore();
}
/** ear-local point → frame coords */
function earPt(a, e, lx, ly) {
  const p = a.pt(e.th, 0), c = Math.cos(e.lean), sn = Math.sin(e.lean);
  return [p.x + lx * c - ly * sn, p.y + lx * sn + ly * c];
}

function buildPlate(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  let top = 1e9;
  for (const e of EARS) top = Math.min(top, a.pt(e.th, 0).y - e.ht);
  const X0 = -PAD, Y0 = Math.max(-PAD, Math.floor(top - 90));
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  const nA = L.makeNoise('s08a'), nB = L.makeNoise('s08b');
  const toXY = (th, d) => [cx + (R - d) * Math.sin(th), cy - (R - d) * Math.cos(th)];
  const mk = () => { const c = L.makeCanvas(RW, RH); const g = c.getContext('2d', { willReadFrequently: true }); g.translate(-X0, -Y0); return [c, g]; };
  const rimW = (s) => RIM + 7 * nA.n2(s / 260, 3.3) + 3 * nA.n2(s / 64, 8.1);     // the lip is not a ruled band

  // ── ears: crisp mask + a blurred copy (≈ distance from the edge → rounded cross-section) ──
  const [cEar, gE] = mk();
  gE.save(); a.clipAbove(gE, -(RIM - 8)); gE.globalCompositeOperation = 'lighter'; gE.fillStyle = 'rgba(255,255,255,0.5)';
  for (const e of EARS) { earPath(gE, a, e, 0); earPath(gE, a, e, 15); }
  gE.restore();
  const earD = gE.getImageData(0, 0, RW, RH).data;                        // alpha: 0.5 = one face of the slab, 1 = both
  const softD = L.blurred(cEar, 14).getContext('2d').getImageData(0, 0, RW, RH).data;

  // ── marks canvas. R = sharp losses (pores, spacer gaps) · G = sharp gains (seams, dense spacers) · B = soft losses ──
  const [cM, gM] = mk();
  gM.fillStyle = '#000'; gM.fillRect(X0, Y0, RW, RH);
  gM.globalCompositeOperation = 'lighter';
  const span = a.span(PAD + 10);
  const rp = L.rng('s08pores');

  // spacers (垫片): a few small, crisp, slightly irregular squares set in the wall — never in a row
  const SPACERS = [
    { th: -0.088, d: 352, s: 54, lite: -1, rot: 0.3 }, { th: 0.268, d: 336, s: 76, lite: 1, rot: -0.24 },
    { th: -0.408, d: 208, s: 62, lite: -1, rot: 0.58 },
  ].map((q) => { const [x, y] = toXY(q.th, q.d); return { ...q, x, y }; });
  const clearOfSpacers = (x, y, rad) => SPACERS.every((q) => Math.hypot(q.x - x, q.y - y) > q.s * 0.8 + rad);

  // stray gas pores: round, but every one its own size, depth and sharpness, and most of them gathered round the
  // sponge (which is built further down and carries nearly all of the porosity)
  const PORE_AT = [[0.075, 250, 400, 110], [-0.236, 190, 170, 80], [0.405, 190, 180, 80], [0.02, 330, 300, 60]];   // th, depth, spread along / across
  const pore = (x, y, r, k, soft) => {
    const gr = gM.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(255,0,0,${k})`); gr.addColorStop(L.lerp(0.7, 0.3, soft), `rgba(255,0,0,${k * 0.86})`);
    gr.addColorStop(L.lerp(0.93, 0.7, soft), `rgba(255,0,0,${k * 0.4})`); gr.addColorStop(1, 'rgba(255,0,0,0)');
    gM.save(); gM.translate(x, y); gM.rotate(rp.range(0, 3.14)); gM.scale(1, rp.range(0.74, 1));
    gM.fillStyle = gr; gM.beginPath(); gM.arc(0, 0, r, 0, L.TAU); gM.fill(); gM.restore();
  };
  for (let i = 0; i < 96; i++) {
    let th, d;
    if (i < 64) { const c = PORE_AT[i % PORE_AT.length]; th = c[0] + rp.gauss() * c[2] / R; d = c[1] + rp.gauss() * c[3]; }
    else { th = rp.range(-span, span); d = RIM + 30 + 700 * Math.pow(rp(), 1.4); }
    if (d < RIM + 24) continue;
    const [x, y] = toXY(th, d), rad = 2 + 9 * Math.pow(rp(), 2.6);
    if (clearOfSpacers(x, y, rad)) pore(x, y, rad, Math.min(1, 0.2 + rad / 14) * rp.range(0.3, 0.8), rp());
  }
  // a few in the rim and in the thick ears (shrinkage gathers in heavy sections)
  for (let i = 0; i < 22; i++) { const [x, y] = toXY(rp.range(-span, span), rp.range(9, RIM - 6)); pore(x, y, 1.6 + 4.2 * Math.pow(rp(), 2), 0.5, rp()); }
  for (const e of EARS) {
    for (let i = 0; i < 16; i++) {
      const topBar = rp.chance(0.62), side = rp.chance(0.5) ? -1 : 1;
      const lx = topBar ? rp.gauss() * 52 : side * (e.hw - e.bar * 0.5) + rp.gauss() * 13;
      const ly = topBar ? -e.ht + e.bar * 0.5 + rp.gauss() * 15 : -rp.range(40, e.ht - 90);
      const [x, y] = earPt(a, e, lx, ly);
      pore(x, y, 2 + 9 * Math.pow(rp(), 2.4), rp.range(0.25, 0.6), rp());
    }
  }
  // spacers
  const rs = L.rng('s08spacer');
  gM.lineJoin = 'round';
  for (const q of SPACERS) {
    const h = q.s / 2, ang = q.th + q.rot;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([ux, uy]) => {
      const lx = ux * h * rs.range(0.82, 1.14), ly = uy * h * rs.range(0.82, 1.14);
      return [q.x + lx * Math.cos(ang) - ly * Math.sin(ang), q.y + lx * Math.sin(ang) + ly * Math.cos(ang)];
    });
    gM.beginPath(); pts.forEach((p, i) => (i ? gM.lineTo(p[0], p[1]) : gM.moveTo(p[0], p[1]))); gM.closePath();
    gM.fillStyle = q.lite > 0 ? 'rgba(0,255,0,0.42)' : 'rgba(255,0,0,0.2)'; gM.fill();
    // the chaplet never fused all the way round: the gap shows on some sides only, and unevenly
    for (let i = 0; i < 4; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % 4], al = rs.range(0.05, 0.75);
      gM.strokeStyle = `rgba(255,0,0,${al})`; gM.lineWidth = rs.range(1.6, 3.6);
      gM.beginPath(); gM.moveTo(p0[0], p0[1]); gM.lineTo(p1[0], p1[1]); gM.stroke();
    }
  }
  // seams: a thin raised fin of extra metal, not quite straight, stronger in places
  const SEAMS = [{ th: -0.303, k: 1 }, { th: 0.228, k: 0.55 }];
  gM.lineCap = 'round';
  SEAMS.forEach((sm, si) => {
    let prev = null;
    for (let d = RIM + 18; d < 920; d += 9) {
      const off = 5 * nA.n2(d / 190, 5 + si * 9) + 1.5 * nA.n2(d / 40, 21 + si * 3);
      const pt = toXY(sm.th + off / R, d);
      if (prev) {
        const al = sm.k * L.clamp(0.52 + 0.48 * nB.n2(d / 85, 40 + si * 7));
        for (const [w, k] of [[13, 0.1], [4.4, 0.62]]) {
          gM.strokeStyle = `rgba(0,255,0,${al * k})`; gM.lineWidth = w * (0.8 + 0.3 * nB.n2(d / 130, 3 + si));
          gM.beginPath(); gM.moveTo(prev[0], prev[1]); gM.lineTo(pt[0], pt[1]); gM.stroke();
        }
      }
      prev = pt;
    }
  });
  const mD = gM.getImageData(0, 0, RW, RH).data;

  // ── slow fields on a quarter-res grid: wall thickness, thin places, foot roots, the wall seen edge-on under the lip ──
  const VALLEYS = [    // places where the wall runs thin: big, soft, darker
    { x: 1262, y: 940, rx: 305, ry: 150, rot: -0.2, amp: 0.36 },
    { x: 40, y: 990, rx: 250, ry: 125, rot: 0.25, amp: 0.15 },
    { x: 905, y: 1085, rx: 190, ry: 95, rot: 0.1, amp: 0.13 },
  ].map((v) => ({ ...v, c: Math.cos(v.rot), sn: Math.sin(v.rot) }));
  const FEET = [       // foot roots seen through the belly (the seam runs down to the left one)
    { x: 520, y: 1052, r: 262, sq: 0.9 },
    { x: 1668, y: 1232, r: 300, sq: 0.88 },
  ];
  const QS = 4, qw = Math.ceil(RW / QS) + 2, qh = Math.ceil(RH / QS) + 2;
  const qT = new Float32Array(qw * qh), qN = new Float32Array(qw * qh);
  for (let j = 0; j < qh; j++) for (let i = 0; i < qw; i++) {
    const x = X0 + i * QS, y = Y0 + j * QS, ddx = x - cx, ddy = cy - y, k = j * qw + i;
    qN[k] = nB.n2(x / 21, y / 21 + 40);                                // medium mottle (also used in the ears)
    const d = R - Math.hypot(ddx, ddy);
    if (d < -8) continue;
    const s = Math.atan2(ddx, ddy) * R, dd = Math.max(0, d - rimW(s));
    const wx = nA.fbm(x / 560 + 3.1, y / 560 - 7.7, 2), wy = nA.fbm(x / 560 - 12.9, y / 560 + 5.3, 2);
    const cloud = nB.fbm(x / 400 + wx * 0.55, y / 400 + wy * 0.55, 4, 2, 0.5);
    const big = nA.fbm(x / 840 + 40, y / 840 + 11, 2);
    let T = 0.645 + 0.085 * big + 0.07 * cloud;
    T += 0.1 * Math.exp(-dd / 70) + 0.05 * Math.exp(-dd / 280);       // under the lip the far wall is seen edge-on
    T -= 0.06 * sstep(260, 660, d);                                    // deeper down we look straight through two thin walls
    for (const v of VALLEYS) {
      const ux = x - v.x, uy = y - v.y;
      const rho = Math.hypot((ux * v.c + uy * v.sn) / v.rx, (-ux * v.sn + uy * v.c) / v.ry) + 0.24 * wx + 0.1 * cloud;
      if (rho < 1.2) T -= v.amp * sstep(1.08, 0.22, rho);
    }
    for (const f of FEET) {
      const fx = x - f.x, fy = (y - f.y) / f.sq;
      let rho = Math.hypot(fx, fy) / f.r;
      if (rho < 1.7) {
        const an = Math.atan2(fy, fx);
        rho *= 1 + 0.035 * nA.n2(an * 1.3 + f.x, 2.2) + 0.012 * nA.n2(an * 5 + 3, 7.7);
        const disc = sstep(1.0, 0.92, rho), e = (rho - 0.9) / 0.066;
        const core = sstep(0.62, 0.08, rho);                            // centre-line shrinkage in the heavy section
        T += 0.07 * disc + 0.2 * Math.exp(-e * e) + 0.07 * Math.exp(-Math.max(0, rho - 1) / 0.17) * (1 - disc);
        T -= core * (0.2 + 0.14 * nA.fbm(x / 70, y / 70, 3));
        T += 0.035 * nB.n2(an * 4.3 + 1.6 * nA.n2(an * 1.7, rho * 2.6), rho * 1.7 + f.x) * disc * sstep(0.15, 0.55, rho);
      }
    }
    qT[k] = T;
  }

  // ── the porosity sponge, on a half-res grid ──
  const CLUSTERS = [   // in arc space: angle, depth below the arc, half-length along / across (px), tilt, strength
    { th: 0.075, d: 212, su: 345, sd: 98, tilt: 0.045, k: 1.08 },      // the big spongy band right under the lip
    { th: -0.236, d: 172, su: 132, sd: 62, tilt: -0.12, k: 0.9 },
    { th: 0.405, d: 158, su: 135, sd: 62, tilt: 0.15, k: 0.9 },
  ].map((c) => ({ ...c, ct: Math.cos(c.tilt), st: Math.sin(c.tilt) }));
  const CS = 2, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cV = new Float32Array(cw * ch), cF = new Float32Array(cw * ch), cD = new Float32Array(cw * ch), cW = new Float32Array(cw * ch);
  const vImg = new ImageData(cw, ch);
  for (let k = 3; k < vImg.data.length; k += 4) vImg.data[k] = 255;
  const cellA = makeCells('a'), cellB = makeCells('b');
  const SU1 = 104, SV1 = 82, SU2 = 50, SV2 = 42;      // cell sizes (px along the arc / across it)
  const maskAt = (s, d) => {
    let M = 0;
    for (const c of CLUSTERS) {
      const u = s - c.th * R, v = d - c.d;
      const uu = (u * c.ct + v * c.st) / c.su, vv = (-u * c.st + v * c.ct) / c.sd, q = uu * uu + vv * vv;
      if (q < 9) M += c.k * Math.exp(-q);
    }
    return M < 0.01 ? 0 : M * (0.5 + 0.95 * (nA.fbm(s / 215 + 3, d / 215 + 9, 3) * 0.5 + 0.5));
  };
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, ddx = x - cx, ddy = cy - y;
    const d = R - Math.hypot(ddx, ddy);
    if (d < RIM) continue;
    const s = Math.atan2(ddx, ddy) * R, M = maskAt(s, d);
    if (M <= 0.01) continue;
    // whole cells of a warped Worley net switch on where a cluster is dense enough, so the mass has a lobed outline;
    // each void has its own depth, and the walls left between them print as thin bright filaments
    let sel = 0, dep = 0, fil = 0;
    const u1 = s / SU1, v1 = d / SV1;
    const w1 = nA.n2(u1 * 0.5 + 7.3, v1 * 0.5 - 3.1), w2 = nA.n2(u1 * 0.5 - 11.2, v1 * 0.5 + 5.7);
    const w3 = nB.n2(u1 * 1.9 + 2.2, v1 * 1.9 + 8.8), w4 = nB.n2(u1 * 1.9 - 6.1, v1 * 1.9 - 4.4);
    const c1 = cellA(u1 + 0.4 * w1 + 0.11 * w3, v1 + 0.4 * w2 + 0.11 * w4);
    const Mc = maskAt(c1.fx * SU1, c1.fy * SV1) * (0.62 + 0.76 * c1.id);
    const h1 = (c1.id * 13.71) % 1, e1 = c1.d2 - c1.d1;
    if (Mc > 0.3 && c1.fy * SV1 > RIM + 62) {
      sel = 1;
      dep = L.clamp(0.3 + 0.62 * sstep(0.3, 0.9, Mc) + 0.36 * h1);
      const fw = 0.055 + 0.085 * sstep(-0.2, 0.7, nB.n2(s / 120 + 31, d / 120 + 17));       // some walls are thicker
      fil = (1 - sstep(0.012, fw, e1)) * (0.18 + 0.82 * sstep(-0.35, 0.45, nA.n2(s / 64 + 5, d / 64 - 2)));
      // a finer lace of walls inside some of the voids
      const c2 = cellB(s / SU2 + 0.35 * w2 + 71.3, d / SV2 + 0.35 * w1 + 23.9);
      fil = Math.max(fil, 0.42 * (1 - sstep(0.01, 0.075, c2.d2 - c2.d1)) * sstep(0.05, 0.5, nB.n2(s / 150 - 3, d / 110 + 6)));
    } else {
      // at the margin: smaller, shallower, separate bubbles
      const c2 = cellB(s / SU2 + 0.35 * w2 + 71.3, d / SV2 + 0.35 * w1 + 23.9);
      const M2 = maskAt(c2.fx * SU2, c2.fy * SV2) * (0.5 + 1.0 * c2.id), e2 = c2.d2 - c2.d1;
      if (M2 > 0.2 && c2.fy * SV2 > RIM + 34 && e2 > 0.2) { sel = 1; dep = 0.3 + 0.45 * ((c2.id * 7.31) % 1); }
    }
    // around the sponge the metal is cloudy: wisps of denser metal and a general greying
    const m2 = sstep(0.02, 0.5, M), wr = nA.ridged(s / 190 + 0.5 * w1, d / 130 + 0.5 * w2, 3);
    const k = j * cw + i;
    cW[k] = (0.2 * wr * wr * wr - 0.1) * m2; cF[k] = fil;
    vImg.data[k * 4] = sel * 255; vImg.data[k * 4 + 1] = sel * dep * 255;
  }
  // round the voids off (blur + threshold), keeping each one's depth
  const vC = L.makeCanvas(cw, ch), vg = vC.getContext('2d'); vg.putImageData(vImg, 0, 0);
  const rC = L.makeCanvas(cw, ch), rg = rC.getContext('2d', { willReadFrequently: true });
  rg.fillStyle = '#000'; rg.fillRect(0, 0, cw, ch); rg.filter = 'blur(2.2px)'; rg.drawImage(vC, 0, 0); rg.filter = 'none';
  const rD = rg.getImageData(0, 0, cw, ch).data;
  for (let k = 0; k < cw * ch; k++) {
    const r0 = rD[k * 4] / 255, v = sstep(0.36, 0.62, r0);
    cV[k] = v; cD[k] = r0 > 0.02 ? Math.min(1, rD[k * 4 + 1] / 255 / r0) : 0;
    vImg.data[k * 4] = vImg.data[k * 4 + 1] = vImg.data[k * 4 + 2] = v * 255;
  }
  vg.putImageData(vImg, 0, 0);
  // a void is a cavity, not a hole punched in card: it prints darkest where it is deepest (its middle) and greys out
  // toward its edge, the shallow ones are smoky inside, and not every edge sits in the plane of focus
  rg.filter = 'blur(6px)'; rg.drawImage(vC, 0, 0); rg.filter = 'none';
  const bD = rg.getImageData(0, 0, cw, ch).data;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const k = j * cw + i, b = bD[k * 4] / 255;
    if (b <= 0) { cV[k] = 0; cF[k] = 0; vImg.data[k * 4] = vImg.data[k * 4 + 1] = vImg.data[k * 4 + 2] = 0; continue; }
    const x = X0 + i * CS, y = Y0 + j * CS;
    const loose = 0.8 * sstep(-0.1, 0.55, nA.n2(x / 260 + 9, y / 260 - 4));
    const veil = 1 - 0.3 * sstep(0.5, 0.95, nB.ridged(x / 210 + 1.5, y / 90 - 7, 2));
    const smoke = L.clamp(0.74 + 0.6 * nA.fbm(x / 84 + 3, y / 84 + 7, 2), 0.4, 1.12);
    const v = L.lerp(cV[k], sstep(0.12, 0.8, b), loose);
    const dp = cD[k] * L.lerp(smoke, 1, sstep(0.72, 1, cD[k]));
    const f = cF[k] * cV[k] * (1 - 0.5 * loose);
    cF[k] = f;
    cV[k] = Math.min(1, v * dp * (0.4 + 0.6 * sstep(0.5, 0.99, b)) * veil);
    vImg.data[k * 4] = cV[k] * 255; vImg.data[k * 4 + 1] = f * 255; vImg.data[k * 4 + 2] = 0;
  }
  vg.putImageData(vImg, 0, 0);
  // the walls glow a little (a membrane, not a hairline) …
  rg.fillRect(0, 0, cw, ch); rg.filter = 'blur(2.6px)'; rg.drawImage(vC, 0, 0); rg.filter = 'none';
  const fD = rg.getImageData(0, 0, cw, ch).data;
  for (let k = 0; k < cw * ch; k++) cF[k] = Math.min(1, cF[k] + 0.75 * fD[k * 4 + 1] / 255);
  // … and the far wall is superimposed: the same kind of sponge, but mirrored, magnified and out of focus
  const gC = L.makeCanvas(cw, ch), gg = gC.getContext('2d', { willReadFrequently: true });
  gg.fillStyle = '#000'; gg.fillRect(0, 0, cw, ch);
  gg.filter = 'blur(8px)';
  const ic = (cx - X0) / CS, jc = (a.crestY - Y0) / CS;
  gg.translate(ic - 70, jc + 26); gg.scale(-1.34, 1.34); gg.translate(-ic, -jc);
  gg.drawImage(vC, 0, 0);
  const gD = gg.getImageData(0, 0, cw, ch).data;

  // ── film curve + cold grey ramp ──
  const ramp = L.makeRamp([[0, BG], [0.18, '#2c3133'], [0.5, '#8a9294'], [0.86, '#e8ecec'], [1, '#f7fbfb']]);
  const NL = 2048, LUT = new Uint8Array(NL * 3);
  for (let i = 0; i < NL; i++) {
    let v = L.clamp((i / (NL - 1)) * 1.2 / 1.08); v = L.lerp(v, v * v * (3 - 2 * v), 0.6);
    const c = ramp(v); LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2];
  }

  const out = new ImageData(RW, RH), o = out.data;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    const fy = j / CS, j0 = fy | 0, ty = fy - j0, qy = j / QS, q0 = qy | 0, sy = qy - q0;
    for (let i = 0; i < RW; i++) {
      const k4 = (j * RW + i) * 4, x = X0 + i, ddx = x - cx;
      const d = R - Math.sqrt(ddx * ddx + ddy * ddy);
      const et = earD[k4 + 3] / 255, ea = et >= 0.5 ? 1 : et * 2;
      const cov = d <= -0.5 ? 0 : d >= 0.5 ? 1 : d + 0.5;
      let T = 0;
      if (cov > 0 || ea > 0) {
        const qx = i / QS, p0 = qx | 0, sx = qx - p0, q = q0 * qw + p0, a00 = (1 - sx) * (1 - sy), a10 = sx * (1 - sy), a01 = (1 - sx) * sy, a11 = sx * sy;
        const fine = 0.55 * (qN[q] * a00 + qN[q + 1] * a10 + qN[q + qw] * a01 + qN[q + qw + 1] * a11) + 0.45 * nA.n2(x / 6.5, y / 6.5);
        let Tb = 0;
        if (cov > 0) {
          const fx = i / CS, i0 = fx | 0, tx = fx - i0, k = j0 * cw + i0, w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const sm = qT[q] * a00 + qT[q + 1] * a10 + qT[q + qw] * a01 + qT[q + qw + 1] * a11
            + cW[k] * w00 + cW[k + 1] * w10 + cW[k + cw] * w01 + cW[k + cw + 1] * w11;
          const V = cV[k] * w00 + cV[k + 1] * w10 + cV[k + cw] * w01 + cV[k + cw + 1] * w11;
          const F = cF[k] * w00 + cF[k + 1] * w10 + cF[k + cw] * w01 + cF[k + cw + 1] * w11;
          const G = (gD[k * 4] * w00 + gD[k * 4 + 4] * w10 + gD[(k + cw) * 4] * w01 + gD[(k + cw) * 4 + 4] * w11) / 255;
          Tb = (sm * (1 + 0.035 * fine) - 0.3 * G * sstep(RIM + 10, RIM + 70, d)) * (1 - 0.96 * V) + 0.55 * F;
          if (d < RIM * 2.6) {
            // the lip: solid and brightest, then a soft shoulder into the wall
            const s = Math.atan2(ddx, ddy) * R, rw = rimW(s);
            const lip = 1.09 + 0.035 * nB.n2(s / 230, 3.3) + 0.022 * fine;
            Tb = L.lerp(Tb, lip, 1 - sstep(rw * 0.8, rw * 1.32 + 7, d));
            Tb -= 0.09 * (1 - sstep(0, 4.5, d));                        // its rounded outer corner
          }
          Tb *= cov;
        }
        let Te = 0;
        if (ea > 0) {
          const prof = sstep(0.28, 0.8, softD[k4 + 3] / 255);
          Te = ea * (0.33 + 0.24 * L.clamp((et - 0.5) * 2) + 0.27 * prof) * (1 + 0.05 * fine + 0.09 * nA.fbm(x / 150 + 20, y / 150 - 9, 3));
        }
        T = Tb > Te ? Tb : Te;
        const floor = 0.035 * (cov > ea ? cov : ea);
        T += (mD[k4 + 1] / 255) * 0.3 - (mD[k4 + 2] / 255) * 0.26 - (mD[k4] / 255) * 0.6;
        if (T < floor) T = floor;
      }
      const li = (T >= 1.2 ? NL - 1 : (T / 1.2 * (NL - 1)) | 0) * 3;
      o[k4] = LUT[li]; o[k4 + 1] = LUT[li + 1]; o[k4 + 2] = LUT[li + 2]; o[k4 + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(out, 0, 0);

  const plate = L.makeLayer(PAD, (g) => {
    g.fillStyle = BG; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.drawImage(cnv, X0, Y0);
  });
  const pw = plate.width, ph = plate.height;
  const pg = plate.getContext('2d');
  pg.save(); pg.setTransform(1, 0, 0, 1, 0, 0);
  pg.imageSmoothingEnabled = true; pg.imageSmoothingQuality = 'high';
  pg.globalAlpha = 0.5; pg.drawImage(L.blurred(plate, 0.8), 0, 0); pg.globalAlpha = 1;   // radiographs are never razor sharp

  // depth of field: the lens is focused on the crest; the film falls out of focus toward the sides and the bottom
  const fcx = a.cx + PAD, fcy = a.crestY + 96 + PAD;
  const veil = (src, r0, r1) => {
    const t = L.makeCanvas(pw, ph), tg = t.getContext('2d');
    tg.drawImage(src, 0, 0);
    tg.globalCompositeOperation = 'destination-in';
    tg.translate(fcx, fcy); tg.scale(640, 390);
    tg.fillStyle = L.radial(tg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']]);
    tg.fillRect(-6, -6, 12, 12);
    return t;
  };
  const soft1 = veil(L.blurred(plate, 2.6), 0.7, 1.4), soft2 = veil(L.blurred(plate, 6), 1.3, 2.2);
  pg.drawImage(soft1, 0, 0); pg.drawImage(soft2, 0, 0);

  // the light box blooms through the clear (white) parts of the film: a tight glow and a wide one
  const sw = Math.ceil(pw / 4), sh = Math.ceil(ph / 4);
  const small = L.makeCanvas(sw, sh), sg = small.getContext('2d');
  sg.drawImage(plate, 0, 0, sw, sh);
  const sq = L.makeCanvas(sw, sh), qg = sq.getContext('2d');
  qg.drawImage(small, 0, 0); qg.globalCompositeOperation = 'multiply'; qg.drawImage(small, 0, 0);
  pg.globalCompositeOperation = 'screen';
  pg.globalAlpha = 0.15; pg.drawImage(L.blurred(sq, 3.5), 0, 0, pw, ph);
  pg.globalAlpha = 0.13; pg.drawImage(L.blurred(sq, 13), 0, 0, pw, ph);
  pg.restore();
  return plate;
}

export default {
  name: '青铜鼎X光片',
  tone: 'light',
  init(env) {
    const plate = buildPlate(env);
    // film grain: a fine and a chunkier plate, shifted every frame
    const fine = L.grainTex(W + 128, H + 128, { seed: 's08f', amount: 0.62, size: 1 });
    const coarse = L.grainTex(W + 128, H + 128, { seed: 's08c', amount: 0.5, size: 2.5 });
    // base fog: a whisper of grain in the blacks so the film never goes digitally dead
    const fog = L.makeCanvas(W + 128, H + 128), fg = fog.getContext('2d');
    fg.drawImage(fine, 0, 0); fg.globalCompositeOperation = 'multiply'; fg.fillStyle = '#0b0d0d'; fg.fillRect(0, 0, fog.width, fog.height);
    S = { plate, fine, coarse, fog };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.plate, { zoom: L.lerp(1.0, 1.014, p) });

    // the scan band: a soft bright column drifting left → right across the belly (long tail behind, firmer leading edge)
    const bx = L.lerp(470, 1460, p);
    ctx.save(); a.clipBelow(ctx, 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = L.linear(ctx, bx - 380, 0, bx + 200, 0, [[0, '#808080'], [0.3, '#8e8e8e'], [0.52, '#a8a8a8'], [0.66, '#c4c4c4'], [0.74, '#bcbcbc'], [0.88, '#929292'], [1, '#808080']]);
    ctx.fillRect(bx - 380, 0, 580, H);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = L.linear(ctx, bx - 260, 0, bx + 150, 0, [[0, 'rgba(206,218,218,0)'], [0.62, 'rgba(206,218,218,0.09)'], [0.72, 'rgba(206,218,218,0.09)'], [1, 'rgba(206,218,218,0)']]);
    ctx.fillRect(bx - 260, 0, 410, H);
    ctx.restore();

    // grain, re-seeded per frame
    const r = L.rng('s08grain' + (env.frame | 0));
    L.overlayGrain(ctx, S.coarse, 0.34, 'overlay', r.int(0, 127), r.int(0, 127));
    L.overlayGrain(ctx, S.fine, 0.5, 'overlay', r.int(0, 127), r.int(0, 127));
    L.overlayGrain(ctx, S.fog, 0.55, 'lighter', r.int(0, 127), r.int(0, 127));
    L.vignette(ctx, { strength: 0.3, inner: 0.5 });
  },
};
