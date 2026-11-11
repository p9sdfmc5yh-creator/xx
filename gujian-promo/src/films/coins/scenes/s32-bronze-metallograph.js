// s32 — 青铜金相显微. A polished, etched cross-section of a cast bronze coin under the light microscope.
// The arc is the outer edge of the section: a narrow blue-black corrosion crust hugging it, gently uneven.
// Below it the metal: rounded grains packed like cells (small and tight under the crust, growing toward the core),
// bright white to pale yellow, with malachite-green boundaries between them; several darker emerald "dendritic" pockets,
// each with a fern-like dendrite, a few ink-black globules of lead (lead does not dissolve in bronze) and a ring of small
// bright grains around it. Above the arc: the empty, warm-white field of view.
// Colours are an artistic exaggeration (see the task sheet) — no magnification, numbers or labels anywhere.
//
// Recipe: (1) a coarse per-pixel field decides where the section is "dark" (crust zone, pockets) and how big grains are;
// (2) grains are discs thrown largest-first, then flattened where they touch (power-diagram cells cut out of each disc);
// (3) everything is baked into ONE opaque layer (the slide), softened like a photograph (halation, bloom, lateral colour
// fringing, field curvature) and moved the way a microscope stage would move it.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;
const LW = W + PAD * 2, LH = H + PAD * 2;
let S = null;

const ss = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const full = (g) => g.fillRect(-PAD, -PAD, LW, LH);

/** blur done on a shrunken copy (wide blurs do not need full resolution); returns a small canvas — draw it stretched over the layer */
function blurSmall(src, px, q) {
  const w = Math.ceil(src.width * q), h = Math.ceil(src.height * q);
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.filter = `blur(${(px * q).toFixed(2)}px)`;
  g.drawImage(src, 0, 0, w, h);
  g.filter = 'none';
  return c;
}

// dendritic pockets: [theta, depth below the arc, radius, cap (dark bridge up to the crust)]
function makeClusters() {
  const r = L.rng('s32clusters');
  const raw = [
    [-0.535, 150, 86, 1], [-0.352, 128, 72, 1], [-0.190, 176, 104, 1], [-0.030, 122, 70, 1], [0.128, 168, 98, 1], [0.305, 132, 76, 1], [0.470, 160, 92, 1],
    [-0.268, 385, 100, 0], [0.050, 430, 112, 0], [0.243, 356, 82, 0], [-0.47, 352, 90, 0],
  ];
  return raw.map(([th, dep, rad, cap]) => ({ th, dep, rad, cap, ey: r.range(1.15, 1.6), p1: r.range(0, L.TAU), p2: r.range(0, L.TAU), p3: r.range(0, L.TAU), ang: r.range(0, Math.PI) }));
}

/** coarse fields over the padded layer: D = darkness of the matrix (0 = open grain field, 1 = crust zone / pocket), E = px to the nearest pocket edge */
function buildField(env, CL) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const FS = 4, fw = Math.ceil(LW / FS) + 2, fh = Math.ceil(LH / FS) + 2;
  const D = new Float32Array(fw * fh), E = new Float32Array(fw * fh);
  const img = new ImageData(fw, fh), d = img.data, msk = new ImageData(fw, fh), m = msk.data;
  const nA = L.makeNoise('s32a'), nB = L.makeNoise('s32b');
  const ramp = L.makeRamp([[0, '#1fa98a'], [0.2, '#1a9a80'], [0.4, '#0e6c64'], [0.56, '#0a3549'], [0.74, '#0b1634'], [1, '#080a20']]);
  for (let j = 0; j < fh; j++) {
    const y = -PAD + j * FS, ddy = cy - y;
    for (let i = 0; i < fw; i++) {
      const x = -PAD + i * FS, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), dep = R - rr, k = j * fw + i;
      E[k] = 999;
      if (dep < -14) continue;
      const th = Math.atan2(ddx, ddy), U = th * R;
      let e = 999, cap = 0, crad = 80;
      for (const c of CL) {
        const u = (th - c.th) * (R - c.dep), v = dep - c.dep;
        if (u > 330 || u < -330) continue;
        const ph = Math.atan2(v, u);
        const b = c.rad * (1 + 0.11 * Math.sin(2 * ph + c.p1) + 0.07 * Math.sin(3 * ph + c.p2) + 0.04 * Math.sin(5 * ph + c.p3));
        const ee = Math.sqrt(u * u + (v * v) / c.ey) - b;
        if (ee < e) { e = ee; crad = c.rad; }
        if (c.cap && v < 0) { const hw = c.rad * (0.74 + 0.4 * (-v / c.dep)); const cc = ss(0, 44, hw - Math.abs(u)); if (cc > cap) cap = cc; }
      }
      const T0 = 46 + 20 * nA.n2(U / 210, 3.1) + 8 * nA.n2(U / 60, 9.7);
      const dRim = 1 - ss(T0, T0 + 56 + 20 * nB.n2(U / 170, 1.3), dep);
      const dCl = 1 - ss(20, 66, e);
      let dd = Math.max(dRim, dCl, cap);
      dd = L.clamp(dd + 0.07 * nB.fbm(x / 90, y / 90, 2));
      D[k] = dd; E[k] = e;
      // matrix colour: malachite between the open grains → emerald → blue-black in the dark zones, with a few emerald glints
      const mot = nA.fbm(x / 46, y / 46, 3);
      const c0 = ramp(L.clamp(dd * 1.04 - 0.14 * Math.max(0, mot) + 0.05 * Math.min(0, mot)));
      let cr = c0[0], cg = c0[1], cb = c0[2];
      if (e < -4) {   // heart of a pocket: deep emerald, brighter toward its centre; the blue-black stays as a moat around it
        const kk = ss(4, 0.5 * crad, -e) * L.clamp(0.72 + 0.6 * nB.fbm(x / 26, y / 26, 2));
        cr += (10 + 4 * kk - cr) * kk; cg += (98 + 30 * kk - cg) * kk; cb += (84 + 20 * kk - cb) * kk;
      }
      if (dep < 50) { const kr = Math.pow(1 - Math.max(0, dep) / 50, 1.1) * 0.92; cr += (11 - cr) * kr; cg += (14 - cg) * kr; cb += (46 - cb) * kr; }
      const o = k * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
      m[o] = m[o + 1] = m[o + 2] = 255; m[o + 3] = 255 * (0.06 + 0.94 * ss(0.15, 0.7, dd));
    }
  }
  const toLayer = (im) => {
    const small = L.makeCanvas(fw, fh); small.getContext('2d').putImageData(im, 0, 0);
    return L.makeLayer(PAD, (g) => { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(small, -PAD - FS / 2, -PAD - FS / 2, fw * FS, fh * FS); });
  };
  const samp = (arr, x, y) => {
    const fx = (x + PAD) / FS, fy = (y + PAD) / FS;
    const i = Math.max(0, Math.min(fw - 2, fx | 0)), j = Math.max(0, Math.min(fh - 2, fy | 0));
    const tx = L.clamp(fx - i), ty = L.clamp(fy - j), k = j * fw + i;
    return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - ty) + (arr[k + fw] * (1 - tx) + arr[k + fw + 1] * tx) * ty;
  };
  return { mat: toLayer(img), mask: toLayer(msk), dAt: (x, y) => samp(D, x, y), eAt: (x, y) => samp(E, x, y) };
}

/** discs thrown largest-first (dart throwing on a hash grid) → grain seeds {x, y, r} */
function buildSeeds(env, F) {
  const a = env.arc, r = L.rng('s32seed'), nz = L.makeNoise('s32s');
  const GS = 56, gw = Math.ceil(LW / GS) + 2, gh = Math.ceil(LH / GS) + 2;
  const grid = new Array(gw * gh); for (let i = 0; i < grid.length; i++) grid[i] = [];
  const seeds = [];
  const y0 = a.crestY, RMAX = 96;
  const passes = [[1.0, 1.32, 50000, 1], [0.8, 1.0, 70000, 1], [0.6, 0.8, 90000, 1], [0.42, 0.6, 100000, 1], [0.3, 0.42, 80000, 0.4], [0.2, 0.3, 60000, 0]];
  for (const [f0, f1, n, darkKeep] of passes) {
    for (let q = 0; q < n; q++) {
      const x = r.range(-PAD, W + PAD), y = r.range(y0, H + PAD), pick = r(), fr = r();
      const dep = a.R - Math.hypot(x - a.cx, a.cy - y);
      if (dep < 19) continue;
      const e = F.eAt(x, y);
      if (e < 3) continue;
      const dd = F.dAt(x, y);
      if (dd > 0.4 && pick >= darkKeep) continue;
      let s = L.lerp(30, 98, ss(80, 400, dep)) * (1 + 0.22 * nz.n2(x / 260, y / 260));
      s = L.lerp(s, 24 * (1 + 0.42 * nz.n2(x / 64, y / 64 + 40)), ss(0.1, 0.62, dd));
      if (e < 50) s = Math.min(s, 21 + 0.18 * e);
      if (dep < 80) s = Math.min(s, 15 + dep * 0.13);
      const ri = 0.5 * s * L.lerp(f0, f1, fr);
      const gx = Math.floor((x + PAD) / GS), gy = Math.floor((y + PAD) / GS);
      const reach = Math.ceil((ri + RMAX) / GS);
      let ok = true;
      for (let ring = 0; ring <= reach && ok; ring++) {
        for (let oy = -ring; oy <= ring && ok; oy++) {
          const yy = gy + oy; if (yy < 0 || yy >= gh) continue;
          const edge = oy === -ring || oy === ring;
          for (let ox = -ring; ox <= ring; ox += edge ? 1 : Math.max(1, 2 * ring)) {
            const xx = gx + ox; if (xx < 0 || xx >= gw) continue;
            const b = grid[yy * gw + xx];
            for (let t = 0; t < b.length; t++) {
              const o = b[t], dx = o.x - x, dy = o.y - y, lim = 0.95 * (ri + o.r);
              if (dx * dx + dy * dy < lim * lim) { ok = false; break; }
            }
            if (!ok) break;
          }
        }
      }
      if (!ok) continue;
      // right under the crust the beads thin out, so the blue-black shows as a band
      const sd = { x, y, r: ri, dd, e, dep, drop: dep < 64 && e > 34 && r() < 0.62 - 0.004 * dep };
      seeds.push(sd); grid[gy * gw + gx].push(sd);
    }
  }
  return { seeds, grid, GS, gw, gh };
}

/** keep the part of the convex polygon P (flat [x,y,…], relative to the seed) with p·n ≤ c */
function clipHalf(P, nx, ny, c) {
  const out = [], n = P.length >> 1;
  let ax = P[2 * n - 2], ay = P[2 * n - 1], fa = ax * nx + ay * ny - c;
  for (let k = 0; k < n; k++) {
    const bx = P[2 * k], by = P[2 * k + 1], fb = bx * nx + by * ny - c;
    if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
    if (fb <= 0) out.push(bx, by);
    ax = bx; ay = by; fa = fb;
  }
  return out;
}

/** rounded blob inside polygon P (relative to ox,oy), scaled by k about (mx,my): a quadratic B-spline through the edge midpoints */
function roundPath(g, P, ox, oy, mx, my, k) {
  const n = P.length >> 1;
  let px = mx + (P[2 * n - 2] - mx) * k, py = my + (P[2 * n - 1] - my) * k;
  for (let i = 0; i < n; i++) {
    const vx = mx + (P[2 * i] - mx) * k, vy = my + (P[2 * i + 1] - my) * k;
    const q = (i + 1) % n, qx = mx + (P[2 * q] - mx) * k, qy = my + (P[2 * q + 1] - my) * k;
    if (i === 0) g.moveTo(ox + (vx + px) / 2, oy + (vy + py) / 2);
    g.quadraticCurveTo(ox + vx, oy + vy, ox + (vx + qx) / 2, oy + (vy + qy) / 2);
    px = vx; py = vy;
  }
  g.closePath();
}

/** the grains: discs flattened where they touch (each seed's power-diagram cell cut out of its own circle), a thin skin and a soft core */
function buildCells(env, F, SD) {
  const { seeds, grid, GS, gw, gh } = SD;
  const r = L.rng('s32cells');
  const rimL = L.makeLayer(PAD), coreL = L.makeLayer(PAD);
  const gr = rimL.getContext('2d'), gc = coreL.getContext('2d');
  const NG = 16;
  for (const s of seeds) {
    if (s.drop) continue;
    const dk = ss(0.15, 0.62, s.dd), first = s.dep < 38, tiny = s.r < 6.2;
    const w = L.lerp(2.0 + 0.035 * s.r, 0.6, dk) * r.range(0.85, 1.25);
    // open field: grains crowd each other into rounded polygons; dark zones: separate beads
    const capR = s.r * L.lerp(1.3, 0.74, dk) * (first ? 0.7 : 1), a0 = r.range(0, L.TAU);
    let P = [];
    for (let k = 0; k < NG; k++) P.push(Math.cos(a0 + k * L.TAU / NG) * capR, Math.sin(a0 + k * L.TAU / NG) * capR);
    let maxR = capR;
    const reach = Math.min(360, 2.4 * capR + 96);
    const gx0 = Math.max(0, Math.floor((s.x + PAD - reach) / GS)), gx1 = Math.min(gw - 1, Math.floor((s.x + PAD + reach) / GS));
    const gy0 = Math.max(0, Math.floor((s.y + PAD - reach) / GS)), gy1 = Math.min(gh - 1, Math.floor((s.y + PAD + reach) / GS));
    for (let gy = gy0; gy <= gy1 && P.length; gy++) for (let gx = gx0; gx <= gx1 && P.length; gx++) {
      const b = grid[gy * gw + gx];
      for (let t = 0; t < b.length; t++) {
        const o = b[t]; if (o === s) continue;
        const dx = o.x - s.x, dy = o.y - s.y, d2 = dx * dx + dy * dy;
        const dist = Math.sqrt(d2), c = (d2 + s.r * s.r - o.r * o.r) / (2 * dist) - w;
        if (c >= maxR) continue;
        P = clipHalf(P, dx / dist, dy / dist, c);
        if (P.length < 6) { P = []; break; }
        maxR = 0;
        for (let k = 0; k < P.length; k += 2) { const q = P[k] * P[k] + P[k + 1] * P[k + 1]; if (q > maxR) maxR = q; }
        maxR = Math.sqrt(maxR);
      }
    }
    if (P.length < 6 || maxR < 1.8) continue;
    let mx = 0, my = 0; const n = P.length >> 1;
    for (let k = 0; k < n; k++) { mx += P[2 * k]; my += P[2 * k + 1]; }
    mx /= n; my /= n;
    // colour: bright white → pale yellow; beads in the dark zones turn lemon, and some stay dim sea-green
    const ring = s.e < 30, roll = r(), tone = r.range(-1, 1);
    const dim = first || (dk > 0.5 && (tiny || (!ring && roll < (s.dep < 64 ? 0.6 : 0.3))));
    let core, skin;
    if (dim) {
      core = L.mix('#1fa98a', '#6fe6c6', r()); skin = L.mix('#0c6a5e', '#17917a', r());
    } else {
      const warm = roll > 0.88 ? r.range(0.25, 0.6) : r.range(0, 0.08);
      core = L.mix('#f6f3e4', '#f7f08a', L.clamp(warm + dk * r.range(0.12, 0.72)));
      if (roll > 0.3 && roll < 0.36 && dk < 0.3) core = L.mix(core, '#dff0dc', 0.6);
      core = L.shade(core, tone * 0.03 - 0.005);
      skin = L.mix('#dcedc8', '#d9ea4c', L.clamp(dk * 1.15));
    }
    gr.fillStyle = skin; gr.beginPath(); roundPath(gr, P, s.x, s.y, mx, my, 1); gr.fill();
    const cw = dim ? 1.2 : L.lerp(1.3, 3.2, L.clamp(s.r / 55));
    gc.fillStyle = core; gc.beginPath(); roundPath(gc, P, s.x, s.y, mx, my, L.clamp(1 - cw / Math.max(2.5, maxR), 0.45, 0.96)); gc.fill();
  }
  gr.drawImage(L.blurred(coreL, 1.4), -PAD, -PAD);
  // uneven etch: slow, same-hue blotches so no two grains are quite the same white
  L.overlayOn(rimL, L.noiseLayer(PAD, { seed: 's32etch', scale: 210, octaves: 3, res: 0.16, contrast: 1.5, ramp: [[0, '#eceacb'], [0.6, '#ffffff'], [1, '#ffffff']] }), { blend: 'multiply', alpha: 0.5 });
  return rimL;
}

/** a fat, fern-like dendrite (cored arms) in the heart of every pocket, and the lead globules that sit among its arms */
function buildPockets(env, CL, fine) {
  const a = env.arc;
  const den = L.makeLayer(PAD), lead = L.makeLayer(PAD);
  const g = den.getContext('2d'), lg = lead.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  CL.forEach((c, ci) => {
    const r = L.rng('s32den' + ci);
    const segs = [], dots = [];
    const Lh = c.rad * 0.66, Wd = c.rad * 0.5, ux = Math.cos(c.ang), uy = Math.sin(c.ang), bend = r.range(-0.24, 0.24);
    const pos = (t) => { const o = bend * (t * t) / Lh; return [ux * t - uy * o, uy * t + ux * o]; };
    for (let t = -Lh; t < Lh; t += 8) { const p0 = pos(t), p1 = pos(Math.min(Lh, t + 8)); segs.push([p0[0], p0[1], p1[0], p1[1], 14]); }
    const off = r.sign();
    for (let t = -Lh + 5; t < Lh - 2; t += r.range(16.5, 20)) {
      const p0 = pos(t);
      for (const side of [-1, 1]) {
        const len = Wd * Math.pow(1 - Math.pow(Math.abs(t) / Lh, 2), 0.75) * r.range(0.68, 1.1);
        if (len < 6) continue;
        const lean = 0.24 + r.range(-0.13, 0.13), cl = Math.cos(lean), sl = Math.sin(lean);
        const dxn = -uy * side * cl + ux * sl, dyn = ux * side * cl + uy * sl;
        segs.push([p0[0], p0[1], p0[0] + dxn * len, p0[1] + dyn * len, r.range(12, 15.5)]);
        // arms of a neighbouring dendrite cut straight across: a row of ovals beside the fern
        if (side === off && r.chance(0.8)) { const q = len + 15, x = p0[0] + dxn * q, y = p0[1] + dyn * q; if (Math.hypot(x, y) < c.rad * 0.8) dots.push([x, y, r.range(5, 7.5), Math.atan2(dyn, dxn)]); }
      }
    }
    a.at(g, c.th, -c.dep, () => {
      const cols = ['#17a183', '#3bd8ae', '#a5f8e0'], shr = [0, 2.6, 7.2];
      for (let pass = 0; pass < 3; pass++) {
        g.strokeStyle = g.fillStyle = cols[pass];
        for (const sg of segs) {
          const lw = sg[4] - shr[pass]; if (lw < 1.2) continue;
          g.lineWidth = lw; g.beginPath(); g.moveTo(sg[0], sg[1]); g.lineTo(sg[2], sg[3]); g.stroke();
        }
        for (const [x, y, rr, an] of dots) {
          const q = rr - shr[pass] * 0.5; if (q < 1) continue;
          g.beginPath(); g.ellipse(x, y, q * 1.45, q, an, 0, L.TAU); g.fill();
        }
      }
    });
    // lead: a few ink-black globules of very different sizes, kept off each other
    const blobs = [], nb = r.int(4, 6);
    for (let k = 0, tries = 0; k < nb && tries < 300; tries++) {
      const rr = k === 0 ? r.range(17, 24) : k < 3 ? r.range(9, 14) : r.range(4.5, 7.5);
      const t = r.range(-0.75, 0.75) * Lh, p0 = pos(t), side = r.sign(), q = r.range(0.2, 0.95) * Wd * (1 - 0.6 * Math.abs(t) / Lh);
      const x = p0[0] - uy * side * q, y = p0[1] + ux * side * q;
      if (blobs.some((b) => Math.hypot(b[0] - x, b[1] - y) < b[2] + rr + 5)) continue;
      blobs.push([x, y, rr]); k++;
    }
    a.at(lg, c.th, -c.dep, () => {
      for (const [x, y, rr] of blobs) {
        const sq = r.range(0.86, 1), rot = r.range(0, Math.PI);
        lg.save(); lg.translate(x, y); lg.rotate(rot); lg.scale(1, sq);
        lg.fillStyle = L.radial(lg, 0, 0, rr * 0.7, rr + 4.5, [[0, 'rgba(4,10,30,0.75)'], [1, 'rgba(4,10,30,0)']]);
        lg.beginPath(); lg.arc(0, 0, rr + 4.5, 0, L.TAU); lg.fill();
        lg.fillStyle = L.radial(lg, -rr * 0.15, -rr * 0.2, 0, rr * 1.05, [[0, '#12162a'], [0.6, '#090b16'], [1, '#04050c']]);
        lg.beginPath(); lg.arc(0, 0, rr, 0, L.TAU); lg.fill();
        lg.restore();
      }
    });
  });
  // crystalline sparkle on the dendrites
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.5;
  g.fillStyle = g.createPattern(fine, 'repeat'); g.globalCompositeOperation = 'overlay';
  { const tmp = L.makeLayer(PAD, (t) => { t.fillStyle = t.createPattern(fine, 'repeat'); full(t); }); L.overlayOn(den, tmp, { blend: 'overlay', alpha: 0.45 }); }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return { den, lead };
}

/** outline of the section (the arc ± a few px) and of the corrosion crust that hugs it */
function crustGeometry(env) {
  const a = env.arc, nz = L.makeNoise('s32crust');
  const s = a.span(PAD + 160), n = Math.ceil((2 * s * a.R) / 3);
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const th = L.lerp(-s, s, i / n), U = th * a.R;
    const dro = 2.3 * nz.n2(U / 150, 0.3) + 1.1 * nz.n2(U / 23, 5.1);
    const t = 17 + 5.5 * nz.n2(U / 130, 7.7) + 3 * nz.n2(U / 30, 3.3) + 1.0 * nz.n2(U / 8, 1.1);
    outer.push(a.pt(th, dro)); inner.push(a.pt(th, -Math.max(7, t)));
  }
  return { outer, inner };
}
function pathSection(g, G) {
  g.beginPath();
  G.outer.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  const last = G.outer[G.outer.length - 1], first = G.outer[0];
  g.lineTo(last.x, H + PAD + 400); g.lineTo(first.x, H + PAD + 400); g.closePath();
}
function pathCrust(g, G) {
  g.beginPath();
  G.outer.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  for (let i = G.inner.length - 1; i >= 0; i--) g.lineTo(G.inner[i].x, G.inner[i].y);
  g.closePath();
}

/** lateral colour fringing: red drawn a hair larger, blue a hair smaller, about the optical axis */
function chroma(src, k, px, py) {
  const w = src.width, h = src.height;
  const out = L.makeCanvas(w, h), og = out.getContext('2d');
  og.fillStyle = '#000'; og.fillRect(0, 0, w, h);
  const tmp = L.makeCanvas(w, h), tg = tmp.getContext('2d');
  for (const [col, s] of [['#ff0000', 1 + k], ['#00ff00', 1], ['#0000ff', 1 - k]]) {
    tg.globalCompositeOperation = 'source-over';
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.fillStyle = '#000'; tg.fillRect(0, 0, w, h);
    tg.setTransform(s, 0, 0, s, px * (1 - s), py * (1 - s));
    tg.drawImage(src, 0, 0);
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'multiply'; tg.fillStyle = col; tg.fillRect(0, 0, w, h);
    og.globalCompositeOperation = 'lighter'; og.drawImage(tmp, 0, 0);
  }
  out._pad = src._pad;
  return out;
}

function buildScene(env) {
  const a = env.arc;
  const T = [performance.now()], tick = (n) => { T.push(performance.now()); T.push(n); };
  const fine = L.noiseTex(512, 512, { seed: 's32fine', scale: 9, octaves: 2, res: 1, contrast: 2 });   // one fine-noise tile, reused as a pattern
  const CL = makeClusters();
  const F = buildField(env, CL); tick('field');
  const SD = buildSeeds(env, F); tick('seeds ' + SD.seeds.length);
  const cells = buildCells(env, F, SD); tick('cells');
  const { den, lead } = buildPockets(env, CL, fine); tick('pockets');
  const G = crustGeometry(env);
  const stretch = (g, c) => g.drawImage(c, -PAD, -PAD, LW, LH);

  // ── the section itself (transparent outside its outline) ──
  const spec = L.makeLayer(PAD, (g) => {
    g.save(); pathSection(g, G); g.clip();
    g.drawImage(F.mat, -PAD, -PAD);
    // etched roughness of the matrix
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.4;
    g.fillStyle = g.createPattern(fine, 'repeat'); full(g);
    // the dendrites glow in their pockets
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.6; stretch(g, blurSmall(den, 11, 0.25));
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(den, -PAD, -PAD);
    // halation: bright grains bleed into the dark matrix — a wide sea-green haze and a tight lime fringe
    const halo = (px, q, col, al) => {
      const c = blurSmall(cells, px, q), cg = c.getContext('2d');
      cg.globalCompositeOperation = 'source-atop'; cg.fillStyle = col; cg.fillRect(0, 0, c.width, c.height);
      cg.globalCompositeOperation = 'destination-in'; cg.drawImage(F.mask, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'screen'; g.globalAlpha = al; stretch(g, c);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    };
    halo(16, 0.25, 'rgba(24,170,150,0.95)', 0.24);
    halo(4.5, 0.5, 'rgba(214,238,80,0.7)', 0.7);
    g.drawImage(cells, -PAD, -PAD);
    g.drawImage(lead, -PAD, -PAD);
    // a few polishing scratches left on the section
    const r = L.rng('s32scratch');
    for (let i = 0; i < 6; i++) {
      const x0 = r.range(-PAD, W + PAD), y0 = r.range(a.crestY + 60, H), ang = r.range(-0.5, 0.5) + (r.chance(0.5) ? 0 : 1.1), len = r.range(500, 1300);
      g.strokeStyle = r.chance(0.5) ? 'rgba(14,96,82,0.13)' : 'rgba(255,255,255,0.16)'; g.lineWidth = r.range(0.8, 1.5);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); g.stroke();
    }
    // corrosion crust: blue-black, bluer toward the outside
    g.save(); pathCrust(g, G); g.clip();
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 34, a.R + 4, [[0, '#0b0d28'], [0.6, '#14183a'], [0.88, '#191e58'], [1, '#232a7c']]);
    full(g);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.5;
    g.fillStyle = g.createPattern(fine, 'repeat'); full(g);
    g.restore();
    // bloom, kept inside the section
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.2;
    stretch(g, blurSmall(g.canvas, 14, 0.25));
    g.restore();
  });
  tick('spec');

  // ── the slide: empty field + section, then the camera's softness ──
  const slide = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#ece6da'; full(g);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.6;
    g.drawImage(L.noiseLayer(PAD, { seed: 's32bg', scale: 560, octaves: 2, res: 0.125, ramp: [[0, '#ebe5d8'], [1, '#ffffff']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // the thick edge of the section shades the field a little, right outside the arc
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 64, [[0, 'rgba(84,96,92,0.2)'], [0.3, 'rgba(84,96,92,0.08)'], [1, 'rgba(84,96,92,0)']]);
    full(g);
    g.filter = 'blur(1.1px)'; g.drawImage(spec, -PAD, -PAD); g.filter = 'none';
  });
  // field curvature: the periphery of the view falls slightly out of focus
  const soft = blurSmall(slide, 3.8, 0.5), big = L.makeCanvas(LW, LH), bg = big.getContext('2d');
  bg.drawImage(soft, 0, 0, LW, LH);
  bg.globalCompositeOperation = 'destination-in';
  bg.fillStyle = L.radial(bg, a.cx + PAD, a.crestY + 60 + PAD, 520, 1250, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  bg.fillRect(0, 0, LW, LH);
  slide.getContext('2d').drawImage(big, -PAD, -PAD);
  tick('slide');
  const out = chroma(slide, 0.0015, W / 2 + PAD, H / 2 + PAD);
  tick('chroma');
  let msg = 's32 timing:'; for (let i = 1; i < T.length; i += 2) msg += ` ${T[i + 1]}=${(T[i] - (i > 1 ? T[i - 2] : T[0])).toFixed(0)}`;
  console.warn(msg);
  return out;
}

export default {
  name: '青铜金相显微',
  tone: 'dark',
  init(env) {
    S = {
      slide: buildScene(env),
      grain: [1, 2, 3].map((k) => L.grainTex(W + 48, H + 48, { seed: 's32g' + k, amount: 0.22, size: 1 })),
    };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // the stage creeps sideways (detail slides along the arc) while we push in a breath
    const rot = L.lerp(-0.0065, 0.0065, p), zoom = L.lerp(1.0, 1.016, p);
    L.blit(ctx, env, S.slide, { rot, zoom, dy: 1.2 * p });
    // the lamp: even in the middle, falling off toward the corners of the field of view (belongs to the camera, so it stays put)
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.radial(ctx, a.cx, a.crestY - 60, 420, 1260, [[0, '#ffffff'], [0.55, '#f7f3ec'], [1, '#e1d9cb']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // sensor noise, new every frame
    const f = env.frame | 0, gr = S.grain[f % S.grain.length], r = L.rng('s32n' + f);
    L.overlayGrain(ctx, gr, 0.5, 'overlay', Math.floor(r() * 48), Math.floor(r() * 48));
  },
};
