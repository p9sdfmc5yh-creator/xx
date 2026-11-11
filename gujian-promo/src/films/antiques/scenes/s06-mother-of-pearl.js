// s06 — 螺钿. Macro photograph of a black-lacquer round box inlaid with thin mother-of-pearl (薄螺钿):
// the arc is the horizon of the gently domed lid. Below it the jet lacquer carries a scrolling-vine (缠枝) design
// cut from separate pieces of shell; above it, nothing but black and a hair of cool rim light.
//
// How it is built (all in init):
//   1. the design is laid out on the unrolled lid surface (U = px along the rim, S = px in from the rim):
//      a fillet – pearl-bead – fillet border, then rows of thick wave stems; every lobe carries a spiral branch
//      ending in a big flower, and leaves / tendrils are packed into whatever room is left with an occupancy grid,
//      so pieces never touch and a hairline of lacquer always shows between them;
//   2. every piece is mapped onto the dome — strongly foreshortened where the surface rolls away toward the horizon,
//      like the limb of a sphere — and drawn into two masks (coverage / iridescence phase / brightness, and the
//      piece's own grain direction + id);
//   3. one per-pixel pass turns that into nacre + lacquer under a rim light and a soft-box highlight, and bakes K
//      copies whose thin-film phase is shifted step by step while individual pieces flash on and off;
//   4. each copy gets a lens: sharp near the crest, falling out of focus toward the sides, the bottom and the limb.
import * as L from '../../../lib/core.js';

const { W, H, TAU, clamp, lerp } = L;
const PAD = 56, PADB = 36;     // the pattern only slides a few px, so the layers need very little margin
const HEAD = 56;               // head-room above the crest: the defocused rim light spills into it
const K = 6;                   // iridescence phase steps (one per frame of this 6-frame shot)
const SHIFT0 = -0.24, SHIFT1 = 0.24;   // phase travel across the shot: about half a cycle
const FA = 230, FB = 100;      // foreshortening of the dome toward its horizon (surface px swallowed / falloff px)
const FIELD_TOP = 150;         // S where the vine field starts (the border lives above it)
const UMAX = 1210, SLIM = 1000;
const G = 3.2;                 // lacquer gap between neighbouring pieces of shell (surface px)
let S = null;

const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// ───────────── surface ⇄ screen ─────────────
// S(d): surface distance from the rim for a point d px below the arc. Log term = conformal unrolling of the disc;
// the exp term squeezes the pattern where the dome turns away from the lens.
const sOfD = (d, R) => -R * Math.log(1 - d / R) + FA * (1 - Math.exp(-d / FB));
function makeInv(R) {
  const STEP = 0.5, n = Math.ceil(SLIM / STEP) + 3, lut = new Float32Array(n);
  let d = 0;
  for (let i = 0; i < n; i++) { const target = i * STEP; while (sOfD(d, R) < target) d += 0.02; lut[i] = d; }
  return (s) => { const f = clamp(s, 0, SLIM) / STEP, i = f | 0; return lut[i] + (lut[i + 1] - lut[i]) * (f - i); };
}

// ───────────── packing helpers ─────────────
function occGrid(u0, u1, s0, s1, cell) {
  const gw = Math.ceil((u1 - u0) / cell), gh = Math.ceil((s1 - s0) / cell), g = new Uint8Array(gw * gh);
  const run = (u, s, r, set) => {
    const i0 = Math.max(0, Math.floor((u - r - u0) / cell)), i1 = Math.min(gw - 1, Math.floor((u + r - u0) / cell));
    const j0 = Math.max(0, Math.floor((s - r - s0) / cell)), j1 = Math.min(gh - 1, Math.floor((s + r - s0) / cell));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const ds = s0 + (j + 0.5) * cell - s;
      for (let i = i0; i <= i1; i++) {
        const du = u0 + (i + 0.5) * cell - u;
        if (du * du + ds * ds > r2) continue;
        if (set) g[j * gw + i] = 1; else if (g[j * gw + i]) return true;
      }
    }
    return false;
  };
  return {
    hit: (u, s, r) => run(u, s, r, false),
    stamp: (u, s, r) => { run(u, s, r, true); },
    fillBand: (sa, sb) => { const j0 = Math.max(0, Math.floor((sa - s0) / cell)), j1 = Math.min(gh, Math.ceil((sb - s0) / cell)); g.fill(1, j0 * gw, j1 * gw); },
  };
}
function sampler(pts) {
  const n = pts.length, cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let j = 1;
  const at = (q) => {
    if (q < cum[j - 1]) j = 1;
    while (j < n - 1 && cum[j] < q) j++;
    const a = pts[j - 1], b = pts[j], seg = cum[j] - cum[j - 1] || 1, t = clamp((q - cum[j - 1]) / seg);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  };
  return { total: cum[n - 1], at };
}
/** cut a path into a run of separate shell strips (each its own piece, hairline gaps between) */
function ribbon(out, pts, wFn, o) {
  const sp = sampler(pts), total = sp.total, { rnd, gap = G, phJ = 0.06, step = 5, big = false } = o;
  let q0 = 0;
  while (q0 < total - 3) {
    let q1 = q0 + rnd.range(o.segMin, o.segMax);
    if (total - q1 < o.segMin * 0.6) q1 = total;
    const left = [], right = [], m = Math.max(1, Math.ceil((q1 - q0) / step));
    const wk = rnd.range(0.93, 1.06);                      // no two strips are cut to quite the same width
    for (let i = 0; i <= m; i++) {
      const q = q0 + ((q1 - q0) * i) / m, s = sp.at(q), hw = (wFn(q / total) * wk) / 2;
      left.push([s[0] - s[3] * hw, s[1] + s[2] * hw]); right.push([s[0] + s[3] * hw, s[1] - s[2] * hw]);
    }
    right.reverse();
    out.push({ poly: left.concat(right), ph: o.ph + rnd.range(-phJ, phJ), br: rnd.range(0.8, 1), big });
    q0 = q1 + gap;
  }
}
function circlePoly(u, s, r, n = 16, squash = 1) {
  const p = [];
  for (let i = 0; i < n; i++) p.push([u + Math.cos((i / n) * TAU) * r, s + Math.sin((i / n) * TAU) * r * squash]);
  return p;
}
/** one ring of petals, each its own piece. tip: 0 = round scallop … 1 = pointed */
function petalRing(out, cu, cs, rin, rout, n, rot, tip, rnd, ph) {
  for (let i = 0; i < n; i++) {
    const pc = rot + (i * TAU) / n + rnd.range(-0.03, 0.03), poly = [], M = 10;
    const ro1 = rout * rnd.range(0.93, 1.05);              // hand-cut: every petal a slightly different length
    for (let q = 0; q <= M; q++) {
      const aN = -1 + (2 * q) / M;
      const side = rin + (ro1 - rin) * (0.62 - 0.14 * tip);
      const ro = side + (ro1 - side) * (tip > 0.5 ? Math.pow(1 - Math.abs(aN), 0.8) : Math.cos((aN * Math.PI) / 2));
      const ha = Math.max(0.03, Math.PI / n - (G * 0.5) / ro);
      poly.push([cu + Math.cos(pc + aN * ha) * ro, cs + Math.sin(pc + aN * ha) * ro]);
    }
    const hi = Math.max(0.03, Math.PI / n - (G * 0.5) / rin);
    for (let q = 2; q >= 0; q--) { const aN = -1 + q; poly.push([cu + Math.cos(pc + aN * hi) * rin, cs + Math.sin(pc + aN * hi) * rin]); }
    out.push({ poly, ph: ph + rnd.range(-0.085, 0.085) + (rnd.chance(0.1) ? rnd.range(0.3, 0.5) : 0), br: rnd.range(0.8, 1), big: true });
  }
}
/** a flower built from separate shell pieces. type 0 = chrysanthemum (many narrow petals), 1 = double flower (round inner ring, pointed outer ring), 2 = five-petal blossom */
function flower(out, cu, cs, rf, type, rot, rnd, ph) {
  if (type === 0) {
    const rin = rf * 0.34;
    out.push({ poly: circlePoly(cu, cs, Math.max(1.6, rin - G), 18), ph: 0.48, br: 1 });
    petalRing(out, cu, cs, rin, rf, rf > 60 ? 12 : 10, rot, 0, rnd, ph);
  } else if (type === 1) {
    const r0 = rf * 0.2, r1 = rf * 0.56;
    out.push({ poly: circlePoly(cu, cs, Math.max(1.5, r0 - G), 16), ph: 0.48, br: 1 });
    petalRing(out, cu, cs, r0, r1, 6, rot, 0, rnd, ph + 0.07);
    petalRing(out, cu, cs, r1 + G, rf, 8, rot + Math.PI / 8, 1, rnd, ph - 0.03);
  } else {
    const rin = rf * 0.33;
    out.push({ poly: circlePoly(cu, cs, Math.max(1.6, rin - G), 18), ph: 0.48, br: 1 });
    petalRing(out, cu, cs, rin, rf, 5, rot, 0, rnd, ph);
  }
}

// ───────────── the design, on the unrolled surface ─────────────
function design() {
  const pieces = [], glints = [];
  const rnd = L.rng('s06-luodian-macro');
  const occStem = occGrid(-UMAX - 60, UMAX + 60, 0, SLIM, 3), occLeaf = occGrid(-UMAX - 60, UMAX + 60, 0, SLIM, 3);
  occStem.fillBand(0, FIELD_TOP - 10); occLeaf.fillBand(0, FIELD_TOP - 10);

  // 1) border hugging the rim: fillet – pearl beads (连珠) – fillet. Seen almost edge-on, so it reads as a few bright lines
  const line = (sv) => { const p = []; for (let u = -UMAX; u <= UMAX; u += 8) p.push([u, sv]); return p; };
  ribbon(pieces, line(38), () => 16, { rnd, segMin: 70, segMax: 200, ph: 0.4, phJ: 0.1 });
  ribbon(pieces, line(131), () => 13, { rnd, segMin: 70, segMax: 200, ph: 0.36, phJ: 0.12 });
  for (let u = -UMAX, i = 0; u <= UMAX; i++) {
    const r = 26 * rnd.range(0.86, 1.08);
    u += r;
    pieces.push({ poly: circlePoly(u, 84 + rnd.range(-2.5, 2.5), r, 22, rnd.range(0.9, 1)), ph: 0.44 + rnd.range(-0.07, 0.07), br: rnd.range(0.84, 1), big: true });
    if (i % 2 === 0) glints.push({ u, s: 82, k: rnd.range(0.3, 0.6), ph: rnd() });
    u += r + rnd.range(4.5, 8.5);
  }

  // 2) rows of wave stems; each lobe holds a spiral branch that ends in a flower
  const rows = [];
  let top = FIELD_TOP;
  for (const hb of [300, 364, 430]) { rows.push({ top, hb, sc: top + hb / 2 }); top += hb; }
  const sites = [];
  const OFF = [0.31, 0.77, 0.12];
  rows.forEach((row, j) => {
    const { hb, sc } = row, lam = 1.9 * hb, A = 0.33 * hb, u0 = OFF[j % OFF.length] * lam, ws = 0.058 * hb;
    row.lam = lam; row.A = A; row.u0 = u0; row.ws = ws;
    const pts = [];
    for (let u = -UMAX; u <= UMAX; u += 3) pts.push([u, sc + A * Math.sin((TAU * (u - u0)) / lam)]);
    for (const p of pts) occStem.stamp(p[0], p[1], ws / 2 + 0.6);
    ribbon(pieces, pts, () => ws, { rnd, segMin: 0.2 * hb, segMax: 0.36 * hb, ph: 0.02, phJ: 0.05 });
    const sp = sampler(pts);
    for (let q = rnd.range(0, 0.1) * hb; q < sp.total; q += 0.105 * hb * rnd.range(0.9, 1.1)) {
      const s = sp.at(q); sites.push({ x: s[0], y: s[1], tx: s[2], ty: s[3], ws, hb });
    }
  });
  rows.forEach((row, j) => {
    const { hb, sc, lam, A, u0, ws } = row;
    const k0 = Math.floor((-UMAX - u0) / (lam / 2)) - 1, k1 = Math.ceil((UMAX - u0) / (lam / 2)) + 1;
    for (let k = k0; k <= k1; k++) {
      const um = u0 + lam / 4 + (k * lam) / 2;
      if (Math.abs(um) > UMAX - 20) continue;
      const sign = ((k % 2) + 2) % 2 === 0 ? 1 : -1;         // +1: the stem dips under the flower, −1: it arches over it
      const cu = um + rnd.range(-0.012, 0.012) * lam, cs = sc - sign * (0.1 + rnd.range(-0.012, 0.012)) * hb;
      const ub = um + 0.15 * lam, sb = sc + A * Math.sin((TAU * (ub - u0)) / lam);
      const phiB = Math.atan2(sb - cs, ub - cu), rb = Math.hypot(ub - cu, sb - cs);
      const DEL = 1.7 * Math.PI, wEnd = ws * 0.55, big = rnd.range(1.0, 1.14);
      let placed = null;
      for (const [fs, ex] of [[big, 0.9], [1, 0.9], [0.9, 0.62], [0.8, 0.42]]) {
        const rf = 0.19 * hb * fs, rEnd = rf + G * 1.2 + wEnd / 2;
        const n = Math.ceil((rb * DEL) / 3.5), sp = [];
        let ok = !occStem.hit(cu, cs, rf + G * 1.1);
        for (let i = 0; i <= n && ok; i++) {
          const t = i / n, phi = phiB - sign * DEL * t, r = rb + (rEnd - rb) * Math.pow(t, ex);
          const p = [cu + r * Math.cos(phi), cs + r * Math.sin(phi)];
          sp.push(p);
          if (t >= 0.14 && occStem.hit(p[0], p[1], (ws * (1 - 0.45 * t)) / 2 + G * 1.1)) ok = false;
        }
        if (ok) { placed = { sp, rf }; break; }
      }
      if (!placed) continue;
      const { sp, rf } = placed, wOf = (t) => ws * (1 - 0.45 * t);
      sp.forEach((p, i) => occStem.stamp(p[0], p[1], wOf(i / (sp.length - 1)) / 2 + 0.6));
      occStem.stamp(cu, cs, rf + 0.5); occLeaf.stamp(cu, cs, rf + 0.5);
      ribbon(pieces, sp, wOf, { rnd, segMin: 0.2 * hb, segMax: 0.34 * hb, ph: 0.03, phJ: 0.05 });
      flower(pieces, cu, cs, rf, rnd.int(0, 2), rnd.range(0, TAU), rnd, 0.68 + rnd.range(-0.05, 0.05));
      glints.push({ u: cu, s: cs, k: rnd.range(0.6, 1), ph: rnd() });
      const sm = sampler(sp);
      for (let q = 0.2 * sm.total; q < sm.total * 0.97; q += 0.105 * hb * rnd.range(0.9, 1.1)) {
        const s = sm.at(q); sites.push({ x: s[0], y: s[1], tx: s[2], ty: s[3], ws: wOf(q / sm.total), hb });
      }
    }
  });

  // 3) pack leaves, then curling tendrils, into the free lacquer — biggest first
  const leafW = (t, wmax) => wmax * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85);
  const tryGrow = (st, side, len, lean, curl, kind) => {
    const nx = -st.ty * side, ny = st.tx * side;
    const off = st.ws / 2 + G * 1.1, bx = st.x + nx * off, by = st.y + ny * off;
    const h0 = Math.atan2(st.ty, st.tx) + side * lean;
    const N = kind === 'leaf' ? 12 : 16, ds = len / N;
    const wmax = kind === 'leaf' ? Math.min(len * 0.4, 0.125 * st.hb) : Math.max(7.5, 0.03 * st.hb);
    const wAt = (t) => (kind === 'leaf' ? leafW(t, wmax) : wmax * (1 - 0.5 * t));
    const sp = [];
    let x = bx, y = by;
    for (let i = 0; i <= N; i++) {
      sp.push([x, y]);
      const t = (i + 0.5) / N, h = h0 + side * curl * (kind === 'leaf' ? t : Math.pow(t, 1.5));
      x += Math.cos(h) * ds; y += Math.sin(h) * ds;
    }
    for (let i = 0; i <= N; i++) {
      const t = i / N; if (t < 0.18) continue;
      const w = wAt(t), p = sp[i], rad = w / 2 + G;
      const perp = (p[0] - st.x) * nx + (p[1] - st.y) * ny;
      if (perp < st.ws / 2 + w / 2 + G * 1.1) {          // still alongside the parent stem
        if (t > 0.36) return false;
        if (occLeaf.hit(p[0], p[1], w / 2 + G * 0.7)) return false;
        continue;
      }
      if (occLeaf.hit(p[0], p[1], rad) || occStem.hit(p[0], p[1], rad)) return false;
    }
    const left = [], right = [], midL = [], midR = [];
    const split = kind === 'leaf' && wmax > 19;        // big leaves are two pieces of shell meeting along the midrib
    for (let i = 0; i <= N; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N, i + 1)], m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const px = -(b[1] - a[1]) / m, py = (b[0] - a[0]) / m, hw = wAt(i / N) / 2, g = Math.min(G * 0.36, hw * 0.5);
      left.push([sp[i][0] + px * hw, sp[i][1] + py * hw]); right.push([sp[i][0] - px * hw, sp[i][1] - py * hw]);
      midL.push([sp[i][0] + px * g, sp[i][1] + py * g]); midR.push([sp[i][0] - px * g, sp[i][1] - py * g]);
      occLeaf.stamp(sp[i][0], sp[i][1], Math.max(1.8, hw + 0.5));
    }
    if (kind === 'leaf' && wmax < 24 && rnd.chance(0.04)) return true;   // a piece of shell lost long ago: bare lacquer
    // most leaves are cut from the blue-green of the shell; now and then the craftsman reached for a rosier piece
    const ph = (kind === 'leaf' ? 0.17 : 0.04) + rnd.range(-0.13, 0.13) + (rnd.chance(0.1) ? rnd.range(0.3, 0.46) : 0), br = rnd.range(0.74, 1);
    if (split) {
      midL.reverse(); right.reverse();
      pieces.push({ poly: left.concat(midL), ph: ph + 0.04, br, big: true });
      pieces.push({ poly: midR.reverse().concat(right), ph: ph - 0.04, br: br * 0.9, big: true });
    } else { right.reverse(); pieces.push({ poly: left.concat(right), ph, br }); }
    return true;
  };
  const LEAF = [[0.95, -0.9], [1.3, -0.5], [0.8, 0.5], [1.15, 0.9], [1.0, -1.2]];
  const CURL = [[1.0, 3.3], [1.25, -3.3], [0.85, 2.6], [1.3, -2.6]];
  for (const f of [0.36, 0.29, 0.22, 0.165, 0.12]) {
    for (const st of sites) for (const side of [1, -1]) {
      const key = side > 0 ? 'a' : 'b'; if (st[key]) continue;
      const len = f * st.hb * rnd.range(0.88, 1.1), v0 = rnd.int(0, LEAF.length - 1);
      for (let v = 0; v < LEAF.length; v++) {
        const [lean, curl] = LEAF[(v0 + v) % LEAF.length];
        if (tryGrow(st, side, len, lean, curl, 'leaf')) { st[key] = 1; break; }
      }
    }
  }
  for (const f of [0.34, 0.24]) {
    for (const st of sites) for (const side of [1, -1]) {
      const key = side > 0 ? 'a' : 'b'; if (st[key]) continue;
      const len = f * st.hb, v0 = rnd.int(0, CURL.length - 1);
      for (let v = 0; v < CURL.length; v++) {
        const [lean, curl] = CURL[(v0 + v) % CURL.length];
        if (tryGrow(st, side, len, lean, curl, 'curl')) { st[key] = 1; break; }
      }
    }
  }
  // every piece was cut from a different bit of shell: its own grain direction, its own moment to flash
  for (const pc of pieces) { pc.ga = rnd.range(0, Math.PI); pc.hp = rnd(); pc.crack = !!pc.big && rnd.chance(0.16); pc.ca = rnd.range(0, Math.PI); pc.co = rnd.range(-0.25, 0.25); }
  return { pieces, glints };
}

// ───────────── light on the dome (screen-fixed) ─────────────
function lightAt(th, d) {
  const hu = (th - 0.1) / 0.26, hd = (d - 225) / 150;
  const main = Math.exp(-(hu * hu + hd * hd));                      // the soft-box reflection, centre-right
  const lt = (th - 0.08) / 0.5;
  const prof = 0.5 + 0.5 * Math.exp(-lt * lt);
  const limb = (0.7 * Math.exp(-d / 34) + 0.3 * Math.exp(-d / 110)) * prof;   // grazing light where the dome turns away
  const au = (th - 0.1) / 0.6, ad = (d - 200) / 380;
  return { main, limb, prof, hl: 1 - (1 - main) * (1 - limb), l: 0.74 + 0.5 * Math.exp(-(au * au + ad * ad)) };
}
/** how far out of focus a point is: 0 = on the focal plane (just below the crest) … 1 = fully soft */
function defocus(th, d) {
  const ad = (d - 205) / 270, at = (th - 0.05) / 0.45;
  return clamp((Math.sqrt(ad * ad + at * at) - 0.42) / 0.75);
}

function build(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - HEAD;
  const RW = W + PAD * 2, RH = H + PADB - Y0, N = RW * RH;
  const dOfS = makeInv(R);
  // a slow warp of the whole layout: the vine was drawn by hand, its rows are not ruled
  const wn = L.makeNoise('s06-warp');
  const toXY = (u, s) => {
    const uu = u + 15 * wn.n2(u / 540 + 3.3, s / 430 + 1.1), ss = s + sstep(110, 330, s) * 13 * wn.n2(u / 470 - 7.7, s / 380 + 4.2);
    const rr = R - dOfS(ss), th = uu / R; return [cx + rr * Math.sin(th), cy - rr * Math.cos(th)];
  };

  // mask A: R = coverage, G = piece phase, B = piece brightness.   mask B: R,G = grain direction, B = piece id
  const { pieces, glints } = design();
  const maskA = L.makeCanvas(RW, RH), mg = maskA.getContext('2d', { willReadFrequently: true });
  const maskB = L.makeCanvas(RW, RH), ng = maskB.getContext('2d', { willReadFrequently: true });
  for (const g of [mg, ng]) { g.fillStyle = '#000'; g.fillRect(0, 0, RW, RH); g.translate(-X0, -Y0); }
  for (const pc of pieces) {
    const pts = pc.poly.map((p, i) => { const q = toXY(p[0], p[1]); q[0] += (hash(i + 3, (pc.hp * 65535) | 0) - 0.5) * 1.5; q[1] += (hash(i + 71, (pc.hp * 65535) | 0) - 0.5) * 1.1; return q; });   // sawn by hand: no edge is quite true
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, mx = 0, my = 0;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; mx += p[0]; my += p[1]; }
    if (x1 < X0 || x0 > X0 + RW || y0 > Y0 + RH) continue;
    mx /= pts.length; my /= pts.length;
    const ph = ((pc.ph % 1) + 1) % 1;
    const path = (g) => { g.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0], pts[i][1]); else g.moveTo(pts[i][0], pts[i][1]); } g.closePath(); };
    mg.fillStyle = `rgb(255,${Math.round(ph * 255)},${Math.round(pc.br * 255)})`;
    path(mg); mg.fill();
    if (pc.crack) {                                       // a hairline crack right across the piece
      const rad = Math.hypot(x1 - x0, y1 - y0) * 0.6, c = Math.cos(pc.ca), s = Math.sin(pc.ca) * 0.6, ox = -s * rad * pc.co, oy = c * rad * pc.co;
      mg.save(); mg.clip(); mg.strokeStyle = '#000'; mg.lineWidth = 1.15; mg.beginPath();
      mg.moveTo(mx + ox - c * rad, my + oy - s * rad);
      mg.quadraticCurveTo(mx + ox * 2.2, my + oy * 2.2, mx + ox + c * rad, my + oy + s * rad);
      mg.stroke(); mg.restore();
    }
    ng.fillStyle = `rgb(${Math.round((Math.cos(pc.ga) + 1) * 127.5)},${Math.round((Math.sin(pc.ga) + 1) * 127.5)},${Math.round(pc.hp * 255)})`;
    path(ng); ng.fill();
  }
  const md = mg.getImageData(0, 0, RW, RH).data, nd = ng.getImageData(0, 0, RW, RH).data;

  // slow "which colour is this patch of shell" field, on a coarse grid
  const nz = L.makeNoise('s06'), CS = 8, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, zone = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy), d = Math.max(0, R - rr);
    zone[j * cw + i] = nz.fbm((Math.atan2(ddx, ddy) * R) / 700 + 3.1, sOfD(d, R) / 520 - 1.7, 3);
  }

  // thin-film colour wheel
  const LN = 1024, rampF = L.makeRamp([[0, '#2f8fd0'], [0.14, '#27b6d8'], [0.3, '#3fd0a0'], [0.4, '#8ff0c8'], [0.48, '#f2f6ff'],
    [0.56, '#f7b4e6'], [0.68, '#e07ac8'], [0.8, '#a45fe0'], [0.9, '#4a66de'], [1, '#2f8fd0']]), LUT = new Float32Array(LN * 3);
  for (let i = 0; i < LN; i++) { const c = rampF(i / LN); LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2]; }

  const idx = new Uint16Array(N), mulc = new Float32Array(N), hpA = new Uint8Array(N);
  const base = new Uint8ClampedArray(N * 4), add = new Float32Array(N * 3), shell = new Uint32Array(N);
  let ns = 0;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), edge = R - rr + 0.5;
      if (edge <= 0) continue;
      const o = k * 4, cR = md[o];
      base[o + 3] = edge >= 1 ? 255 : edge * 255;
      const d = Math.max(0, R - rr), th = Math.atan2(ddx, ddy);
      const lg = lightAt(th, d), hl = lg.hl;
      const U = th * R, Sv = sOfD(d, R);
      const h1 = hash(i, j);
      let lr = 0, lgc = 0, lb = 0;
      if (cR < 250) {
        // lacquer: jet black with a breath of indigo, the soft-box mirrored in it as a blue-grey sheen (faint polishing
        // streaks and dust inside the sheen), and a cold lip of light where the dome meets the dark
        const pol = nz.n2(U / 120 + 9, Sv / 6);
        const sheen = Math.pow(lg.main, 1.3) * (0.86 + 0.14 * pol), rimI = Math.exp(-d / 6) * lg.prof;
        const dust = h1 > 0.9989 ? 46 * (sheen + lg.limb) : 0;
        lr = 7 + 3 * lg.l + 40 * sheen + 90 * lg.limb + 128 * rimI + dust;
        lgc = 6 + 4 * lg.l + 60 * sheen + 130 * lg.limb + 168 * rimI + dust;
        lb = 10 + 9 * lg.l + 102 * sheen + 190 * lg.limb + 215 * rimI + dust;
        if (cR < 8) { base[o] = lr; base[o + 1] = lgc; base[o + 2] = lb; continue; }
      }
      const cov = cR / 255, ph0 = md[o + 1] / cR, br = Math.min(1, md[o + 2] / cR);
      const gc = (nd[o] / cR) * 2 - 1, gs = (nd[o + 1] / cR) * 2 - 1, hp = Math.min(1, nd[o + 2] / cR);
      hpA[k] = (hp * 255) | 0;
      // nacre: the shell grew in layers, so its colour steps across wavy terraces that follow the piece's own grain,
      // each terrace edged by a hair of shadow; a fine silky lustre runs across them
      const gu = U * gc + Sv * gs + hp * 613, gv = -U * gs + Sv * gc + hp * 271;
      const n1 = nz.n2(gu / 76, gv / 24), n2 = nz.n2(gu / 30 + 9, gv / 30 - 4), lus = nz.n2(gu / 52 + 40, gv / 4.4 + n2 * 1.2);
      let ter = n1 * 2.4 + n2 * 0.7 + 8; ter -= Math.floor(ter);
      const lip = Math.min(ter, 1 - ter), seam = lip < 0.045 ? 1 - lip / 0.045 : 0;
      const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, zk = j0 * cw + i0;
      const zn = (zone[zk] + (zone[zk + 1] - zone[zk]) * tx) * (1 - ty) + (zone[zk + cw] + (zone[zk + cw + 1] - zone[zk + cw]) * tx) * ty;
      let phase = ph0 + 0.2 * zn + 0.15 * (ter - 0.5) + 0.05 * n1 + 4;
      phase -= Math.floor(phase);
      idx[k] = (phase * LN) | 0;
      // bevel: the upper-right edge of every piece catches the light, the lower-left edge sinks
      const e = (md[o + 4 * (i < RW - 1 ? 1 : 0) + jm * 4] - md[o - 4 * (i > 0 ? 1 : 0) + jp * 4]) / 255;
      const m = br * lg.l * (0.86 + 0.1 * lus + 0.12 * (ter - 0.5)) * (0.93 + 0.14 * h1) * (1 - 0.35 * Math.max(0, -e)) * (1 - 0.3 * seam);
      const w = 0.82 * hl;
      mulc[k] = cov * m * (1 - 0.55 * w);
      const glit = hash(i >> 1, (j >> 1) + 7919) > 0.9955 - 0.012 * hl ? 50 + 120 * hl : 0;
      const up = Math.max(0, e) * 48 + glit, pw = w * (0.92 + 0.08 * lus) * (0.94 + 0.12 * h1) * (1 - 0.2 * seam);
      const o3 = ns * 3;
      add[o3] = cov * (240 * pw + up) + (1 - cov) * lr;
      add[o3 + 1] = cov * (246 * pw + up) + (1 - cov) * lgc;
      add[o3 + 2] = cov * (255 * pw + up) + (1 - cov) * lb;
      shell[ns++] = k;
    }
  }

  // the lens: two quarter-size masks saying where the slightly-soft and the very-soft copies take over
  const qw = Math.ceil(RW / 4), qh = Math.ceil(RH / 4), mk1 = L.makeCanvas(qw, qh), mk2 = L.makeCanvas(qw, qh);
  {
    const i1 = new ImageData(qw, qh), i2 = new ImageData(qw, qh);
    for (let j = 0; j < qh; j++) for (let i = 0; i < qw; i++) {
      const ddx = X0 + i * 4 + 2 - cx, ddy = cy - (Y0 + j * 4 + 2), A = defocus(Math.atan2(ddx, ddy), Math.max(0, R - Math.hypot(ddx, ddy)));
      const o = (j * qw + i) * 4;
      i1.data[o + 3] = 255 * clamp(A * 2); i2.data[o + 3] = 255 * clamp(A * 2 - 1);
    }
    mk1.getContext('2d').putImageData(i1, 0, 0); mk2.getContext('2d').putImageData(i2, 0, 0);
  }
  const sharp = L.makeCanvas(RW, RH), sg = sharp.getContext('2d');
  // the two soft copies are blurred at reduced size (half / third) — same look, a fraction of the cost
  const hw2 = Math.ceil(RW / 2), hh2 = Math.ceil(RH / 2), hw3 = Math.ceil(RW / 3), hh3 = Math.ceil(RH / 3);
  const soft1 = L.makeCanvas(hw2, hh2), s1 = soft1.getContext('2d'), soft2 = L.makeCanvas(hw3, hh3), s2 = soft2.getContext('2d');
  const FL = new Float32Array(256);
  const img = new ImageData(RW, RH), dd = img.data;
  const layers = [];
  for (let q = 0; q < K; q++) {
    const sh = Math.round((((lerp(SHIFT0, SHIFT1, q / (K - 1)) % 1) + 1) % 1) * LN);
    // each piece of shell has its own angle at which it lights up; most sit half-lit, a few blaze
    for (let h = 0; h < 256; h++) FL[h] = 0.66 + 0.9 * Math.pow(0.5 + 0.5 * Math.cos((h / 256) * TAU + q * 0.55), 3);
    dd.set(base);
    for (let n = 0; n < ns; n++) {
      const k = shell[n], o = k * 4, o3 = n * 3, li = ((idx[k] + sh) % LN) * 3, mf = mulc[k] * FL[hpA[k]];
      dd[o] = LUT[li] * mf + add[o3]; dd[o + 1] = LUT[li + 1] * mf + add[o3 + 1]; dd[o + 2] = LUT[li + 2] * mf + add[o3 + 2];
    }
    sg.putImageData(img, 0, 0);
    const c = L.makeCanvas(RW, RH), g = c.getContext('2d');
    g.drawImage(sharp, 0, 0);
    for (const [sc, cv, px, mk, bw, bh] of [[s1, soft1, 1.1, mk1, hw2, hh2], [s2, soft2, 2, mk2, hw3, hh3]]) {
      sc.globalCompositeOperation = 'copy'; sc.filter = `blur(${px}px)`; sc.drawImage(sharp, 0, 0, bw, bh); sc.filter = 'none';
      sc.globalCompositeOperation = 'destination-in'; sc.drawImage(mk, 0, 0, qw * 4 * (bw / RW), qh * 4 * (bh / RH));
      g.drawImage(cv, 0, 0, RW, RH);
    }
    layers.push(c);
  }

  // bloom: a quarter-size blurred copy (the layer's head-room lets the glow spill over the rim)
  const bloom = L.makeCanvas(qw, qh), bg = bloom.getContext('2d');
  bg.filter = 'blur(5px) brightness(1.15)';
  bg.drawImage(layers[K >> 1], 0, 0, RW / 4, RH / 4);
  bg.filter = 'none';

  // the defocused rim light standing off the horizon: one soft cold breath, brightest right of the crest
  const halo = L.makeCanvas(qw, qh), hg = halo.getContext('2d');
  hg.filter = 'blur(5.5px)'; hg.scale(0.25, 0.25); hg.translate(-X0, -Y0);
  hg.strokeStyle = L.linear(hg, 0, 0, W, 0, [[0, 'rgba(96,140,255,0.3)'], [0.56, 'rgba(150,196,255,0.78)'], [1, 'rgba(96,140,255,0.4)']]);
  hg.lineWidth = 26; a.stroke(hg, 2);
  hg.filter = 'none';

  // pin-point glints: flower hearts and border pearls that sit in the light
  const gl = [];
  for (const g of glints) {
    const p = toXY(g.u, g.s); if (p[0] < -20 || p[0] > W + 20 || p[1] > H + 10) continue;
    const pol = a.polar(p[0], p[1]), lg = lightAt(pol.theta, -pol.dr);
    if (lg.hl < 0.22) continue;
    gl.push({ x: p[0], y: p[1], k: g.k * Math.min(1, lg.hl * 1.3), ph: g.ph, soft: defocus(pol.theta, -pol.dr) });
  }
  return { layers, bloom, halo, gl, X0, Y0, RW, RH };
}

export default {
  name: '螺钿',
  tone: 'light',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#08070a'; ctx.fillRect(0, 0, W, H);

    // a hair of cold light standing off the rim
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(S.halo, S.X0, S.Y0, S.halo.width * 4, S.halo.height * 4);
    ctx.restore();

    // the lid: pattern slides a few px along the rim while the shell's colours roll through half a cycle
    const rot = lerp(-0.0045, 0.0045, p);
    const f = clamp(p) * (K - 1), i0 = Math.min(K - 2, Math.floor(f)), fr = f - i0;
    ctx.save();
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.layers[i0], S.X0, S.Y0);
    if (fr > 0.004) { ctx.globalAlpha = fr; ctx.drawImage(S.layers[i0 + 1], S.X0, S.Y0); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.42;
    ctx.drawImage(S.bloom, S.X0, S.Y0, S.bloom.width * 4, S.bloom.height * 4);
    // pearly glints flick on and off
    ctx.globalCompositeOperation = 'lighter';
    for (const g of S.gl) {
      const tw = Math.pow(Math.max(0, Math.cos((p * 1.3 + g.ph) * TAU)), 6) * g.k;
      if (tw < 0.04) continue;
      const r = (14 + 20 * tw) * (1 + 0.8 * g.soft);
      ctx.globalAlpha = 1;
      ctx.fillStyle = L.radial(ctx, g.x, g.y, 0, r, [[0, `rgba(255,255,255,${0.95 * tw})`], [0.18, `rgba(226,240,255,${0.5 * tw})`], [1, 'rgba(160,200,255,0)']]);
      ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2);
    }
    ctx.restore();

    // specular line riding the lip of the lacquer, its hot spot creeping along the rim
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const pk = lerp(0.56, 0.64, p);
    for (const [w, al] of [[1.6, 0.6], [4, 0.26], [9, 0.12]]) {
      ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, `rgba(120,170,255,${0.25 * al})`], [pk - 0.2, `rgba(170,205,255,${0.5 * al})`], [pk, `rgba(236,246,255,${al})`], [pk + 0.2, `rgba(170,205,255,${0.5 * al})`], [1, `rgba(120,170,255,${0.3 * al})`]]);
      ctx.lineWidth = w; a.stroke(ctx, -w / 2 - 0.3);
    }
    ctx.restore();
  },
};
