// s18 — 圜丘·木刻版画. A MACRO of a black-and-white woodcut print of the Circular Mound Altar:
// the lens is pushed right onto the sheet, so the frame holds one big ring of white-marble balustrade
// (望柱 + 寻杖栏板) standing on the hatched wall of its terrace (台帮, with a 螭首 spout under every post),
// and — at the bottom centre only — the top of the next, larger ring coming in out of focus.
// The arc is the top of the UPPER tier's handrail; everything above it is the solid printed black of the sky
// (nothing is cut into it: the reference frame is pure black up there).
// Pipeline: draw the block as crisp black/white knife work (thick faceted cuts, wedge hatching, residual nicks)
// → printing pass (blur + noisy threshold = ink squash, broken thin lines, salt in the solids, stray pepper)
// → hand-made paper with visible fibre → macro-lens falloff (sharp at the crest, soft at the bottom and the far sides).
// Deliberate simplifications: the 柱头 are kept short (they would otherwise climb into the tagline), the lower tier is
// drawn larger (nearer) rather than with more panels, and no stairway is shown (it would cut the arc at the crest).
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 56;
const LW = W + PAD * 2, LH = H + PAD * 2;
const INK = [5, 5, 5];      // 松烟墨黑 #050505
let S = null;

// ── bay geometry: px at tier scale 1 (u = along the handrail from a post's centre line, d = below the handrail top) ──
const P = 460;         // bay pitch, post centre → post centre: a Qing 栏板 is about twice as long as it is tall
const PW = 25;         // half-width of a 望柱
const BAL = 203;       // handrail top (0) → underside of the 地栿
const TIER_H = 318;    // balustrade + terrace wall (上枋 207–232, 束腰 232–292, 下枋 292–318)
const FLOOR = 52;      // the paved terrace floor showing between this wall and the next balustrade (seen almost edge-on)
const G = 1.15;        // how far the lens is pushed in: px per unit on the upper tier
const TIERS = [
  { d0: 0, s: G, phase: 0.5, seed: 1, floor: true },                        // upper tier: a panel centred on the crest, posts clear of the tagline
  { d0: (TIER_H + FLOOR) * G, s: G * 1.2, phase: 0, seed: 2, edge: true },  // middle tier: only its handrail and openings reach into the frame
];

// profile of a 荷叶净瓶 (leaf-and-vase support under the handrail): [half-width, d]
const VASE = [[35, 29.5], [33, 35.5], [15, 42], [10, 46.5], [11, 50.5], [21.5, 57], [23.5, 63.5], [15, 71.5], [14.5, 73.5], [20.5, 78.5]];
// front of a 螭首 (beast-head spout), unit outline → px via hd()
const HEAD = [[-12.5, 100], [-4, 99], [4, 99], [12.5, 100], [14.6, 107], [16.4, 119], [14.6, 127.5], [8.5, 133.5], [-8.5, 133.5], [-14.6, 127.5], [-16.4, 119], [-14.6, 107]];
const HK = 2.1, HD = 246;
const hd = (u, d, ku = 1, kd = 1, ou = 0, od = 0) => [u * HK * ku + ou, HD + (d - 116) * HK * kd + od];
// 柱头 standing proud of the handrail (short on purpose)
const CAP = [[-23, 1], [-23, -2], [-27, -4], [-27, -8], [-23, -10], [-24, -16], [-20, -21], [-12, -24], [12, -24], [20, -21], [24, -16], [23, -10], [27, -8], [27, -4], [23, -2], [23, 1]];

function drawTier(g, a, T) {
  const { d0, s, phase, seed } = T;
  const r = L.rng('s18tier' + seed);
  const Rt = a.R - d0;
  const pitch = P * s;
  const half = Math.asin(Math.min(0.999, (W / 2 + PAD + 220) / Rt)) * Rt;
  const N = Math.ceil(half / pitch) + 1;
  let u0 = 0;
  const M = (u, d) => { const th = (u0 + u * s) / Rt, rr = Rt - d * s; return [a.cx + rr * Math.sin(th), a.cy - rr * Math.cos(th)]; };
  const jit = (j) => (r() - 0.5) * 2 * j;
  const poly = (pts, col, j = 1) => {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < pts.length; i++) { const p = M(pts[i][0], pts[i][1]); const x = p[0] + jit(j), y = p[1] + jit(j); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
  };
  // a knife cut from (ua,da) to (ub,db), full widths wa → wb: faceted every ~30 px, ends sliced off askew
  const cut = (ua, da, ub, db, wa, wb, col = '#000', j = 0.5) => {
    const du = ub - ua, dd = db - da, len = Math.hypot(du, dd) || 1, tx = du / len, ty = dd / len, nx = -ty, ny = tx;
    const n = Math.max(1, Math.round((len * s) / 30));
    const sk0 = r.range(-0.5, 0.5), sk1 = r.range(-0.5, 0.5);
    const top = [], back = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, mid = i > 0 && i < n;
      const hw = L.lerp(wa, wb, t) * (0.5 + (mid ? r.range(-0.07, 0.07) : 0));
      const off = mid ? r.range(-0.8, 0.8) : 0;
      const sk = (i === 0 ? sk0 : i === n ? sk1 : 0) * hw;
      const cu = ua + du * t, cd = da + dd * t;
      top.push(M(cu + nx * (hw + off) + tx * sk, cd + ny * (hw + off) + ty * sk));
      back.push(M(cu - nx * (hw - off) - tx * sk, cd - ny * (hw - off) - ty * sk));
    }
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i <= n; i++) { const x = top[i][0] + jit(j), y = top[i][1] + jit(j); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let i = n; i >= 0; i--) g.lineTo(back[i][0] + jit(j), back[i][1] + jit(j));
    g.closePath(); g.fill();
  };
  // a line the knife left standing in several pieces (gaps where the gouge slipped through it)
  const dashes = (ua, ub, d, wa, wb, gapP = 0.5, lo = 46, hi = 150) => {
    let u = ua;
    while (u < ub - 12) {
      const len = Math.min(ub - u, r.range(lo, hi));
      const dd = d + r.range(-1.2, 1.2), t0 = (u - ua) / (ub - ua), t1 = (u + len - ua) / (ub - ua);
      cut(u, dd, u + len, dd + r.range(-1, 1), L.lerp(wa, wb, t0), L.lerp(wa, wb, t1));
      u += len + (r.chance(gapP) ? r.range(12, 32) : -2);
    }
  };
  // residual sliver in a cleared (white) strip: wood the gouge skipped over
  const nick = (uA, uB, dA, dB, prob) => {
    if (!r.chance(prob)) return;
    const u = r.range(uA, uB), d = r.range(dA, dB), len = r.range(16, 40), w = r.range(4.6, 6);
    poly([[u, d], [u + len * 0.45, d - w * 0.5], [u + len, d + r.range(-1, 1)], [u + len * 0.5, d + w * 0.5]], '#000', 0.4);
  };
  // a comb of vertical shading cuts standing in a strip (排线): blunt, about as wide as the gaps between them,
  // some of them crossed by the gouge and left in two pieces. wFn(t) / lenFn(t) → width and length along the run
  const comb = (uA, uB, dA, dB, wFn, lenFn, skip = 0.04, brk = 0.3, pitch = 20.5) => {
    const n = Math.max(1, Math.round((uB - uA) / pitch));
    for (let q = 0; q <= n; q++) {
      const t = q / n;
      if (r.chance(skip)) continue;
      const u = L.lerp(uA, uB, t) + r.range(-2.2, 2.2), tilt = r.range(-1.8, 1.8);
      const w = wFn(t) + r.range(-0.9, 0.9), len = Math.max(11, lenFn(t) * (dB - dA));
      const w1 = w * r.range(0.1, 0.24);                 // each tooth is a wedge: the two gouge cuts beside it run together at its tip
      if (len > 34 && r.chance(brk)) {
        const c = r.range(0.3, 0.7) * len, gap = r.range(6, 10), wm = L.lerp(w, w1, c / len);
        cut(u, dA, u + tilt * 0.5, dA + c, w, wm, '#000', 0.4);
        cut(u + tilt * 0.6, dA + c + gap, u + tilt, dA + len, wm * 0.95, w1, '#000', 0.4);
      } else cut(u, dA, u + tilt, dA + len, w, w1, '#000', 0.4);
    }
  };
  // a few such cuts where a strip turns into shade
  const ticks = (uA, uB, dA, dB, prob, w = 7.4) => {
    if (prob < 0.04) return;
    for (let u = uA + r.range(0, 7); u < uB; u += 20 + r.range(-2.4, 2.4)) {
      if (!r.chance(prob)) continue;
      cut(u, dA + r.range(-0.5, 1.5), u + r.range(-1.2, 1.2), L.lerp(dA, dB, r.range(0.55, 1)), w, 1.2, '#000', 0.4);
    }
  };
  // the altar is a drum lit from the upper left: its right-hand side turns away into shade (0 lit → 1 shade)
  const shadeAt = (u) => 0.8 * L.smooth((u / Rt + 0.14) / 0.5);
  const sp = a.span(PAD + 320);

  // white stone of the whole tier (balustrade + wall), and the paved floor of the terrace below it
  g.fillStyle = '#fff';
  a.pathBand(g, -d0, -(d0 + (TIER_H + (T.floor ? FLOOR + 4 : 0)) * s), -sp, sp); g.fill();

  for (let i = -N; i <= N; i++) {
    u0 = (i + phase) * pitch;
    const A = PW, B = P - PW, mid = P / 2; // panel between the posts
    const k = shadeAt(u0 + pitch * 0.5), kp = shadeAt(u0);

    if (T.edge) cut(-2, -4.6, P + 2, -4.6, 8.4, 8.4, '#000', 0.8);                   // a tier seen against the floor behind it needs its top edge cut in

    // ── terrace wall (台帮) ──
    cut(-2, BAL + 2, P + 2, BAL + 2, 11.5, 11.5);                                  // underside of the 地栿 / edge of the terrace floor
    cut(-2, 233, P + 2, 233, 9.5, 9.5);                                            // shadow under the 上枋
    {
      // 束腰 in that shadow: a comb whose lower edge wanders like the edge of a shadow, not like drips
      const f1 = r.range(0.8, 1.7), p1 = r(), f2 = r.range(2.3, 4.1), p2 = r();
      comb(44, P - 40, 235, 290, () => 8.6 + 1.1 * k,
        (t) => 0.4 + 0.11 * Math.sin(L.TAU * (t * f1 + p1)) + 0.06 * Math.sin(L.TAU * (t * f2 + p2)) + r.range(-0.035, 0.035) + 0.3 * k, 0.05, 0.1);
    }
    dashes(r.range(-10, 60), P + 2, 294.5, 7.6, 7.6, 0.85, 80, 240);               // 下枋: a lost-and-found line on the lit stone
    nick(44, P - 90, 214, 224, 0.45); nick(mid, P - 70, 302, 310, 0.4);
    ticks(44, P - 40, 211, 227, k * 0.45); ticks(6, P - 6, 300, 313, k * 0.5);
    if (T.floor) {
      // foot of the wall, then the terrace floor: rings of paving seen almost edge-on, cut as broken concentric lines
      cut(-2, TIER_H + 5, P + 2, TIER_H + 5, 15, 15, '#000', 0.9);
      dashes(r.range(-20, 20), P + 2, TIER_H + 24.5, 6.4, 6.4, 0.8, 60, 210);
      dashes(r.range(-20, 40), P + 2, TIER_H + 38.5, 6.4, 6.4, 0.9, 50, 170);
    } else cut(-2, TIER_H + 1.4, P + 2, TIER_H + 1.4, 4, 4, '#000', 1.5);

    // ── panel (栏板) ──
    // long low openings under the handrail, with the 净瓶 standing in them
    poly([[A, 30.5], [B, 30.5], [B, 78], [A, 78]], '#000', 0.8);
    poly([...VASE.map(([w, d]) => [mid + w, d]), ...VASE.slice().reverse().map(([w, d]) => [mid - w, d])], '#fff', 0.7);
    poly([[A, 29], ...VASE.map(([w, d]) => [A + w * 0.82, d]), [A, 79]], '#fff', 0.7);
    poly([[B, 29], ...VASE.map(([w, d]) => [B - w * 0.82, d]), [B, 79]], '#fff', 0.7);
    // handrail (寻杖): a broken shadow line along the round bar, and the post's shadow falling on it
    dashes(A + r.range(40, 70), B - r.range(6, 50), 19.5, 6.6, 5.4, 0.7);
    for (let q = 0; q < 2; q++) cut(A + 7 + q * 13, 5 + q * 2, A + 7.4 + q * 13, 27 - q * 8, 8, 1.4, '#000', 0.4);
    ticks(A + 44, B - 4, 11, 27, k * 0.4, 6.4);
    // 面枋 strip with the post's shadow
    for (let q = 0; q < 3; q++) cut(A + 7.5 + q * 13, 80 + q * 0.5, A + 8 + q * 13, 96 - q * 4.4, 8, 1.4, '#000', 0.4);
    nick(A + 70, B - 70, 83.5, 91, 0.35);
    ticks(A + 60, B - 4, 80.5, 95, k * 0.5);
    // recessed field (池子): frame heavier on the top and left, where the recess is in shadow; the 地栿 closes it below
    cut(A + 11 + r.range(-3, 2), 102, B - 10 + r.range(-2, 3), 102, 11.5, 10);
    cut(A + 17, 98 + r.range(-2, 2), A + 17, 176, 11.5, 10);
    cut(B - 14.5, 99 + r.range(-2, 2), B - 14.5, 176, 7.4, 7.4);
    {
      // the field itself: a comb of wedge cuts hanging from the top edge's shadow — heavy and full-length on the left,
      // thinner and shorter toward the light, with a worn stretch somewhere along it
      const wornAt = r.range(0.2, 0.9), wornW = r.range(0.05, 0.14);
      const worn = (t) => Math.max(0, 1 - Math.abs(t - wornAt) / wornW);
      const f1 = r.range(1.2, 2.6), p1 = r();
      comb(A + 38, B - 29, 105, 170,
        (t) => L.lerp(10.4, 8, Math.pow(t, 0.8)) + 1.2 * k - 1.8 * worn(t),
        (t) => Math.min(1, L.lerp(1.03, 0.62, Math.pow(t, 1.3)) + 0.4 * k + 0.07 * Math.sin(L.TAU * (t * f1 + p1)) + r.range(-0.05, 0.05) - 0.3 * worn(t)), 0.03, 0.22);
    }
    // 地栿
    cut(A, 176.5, B, 176.5, 9, 8.4);
    for (let q = 0; q < 2; q++) cut(A + 7.5 + q * 13, 181.5, A + 8 + q * 13, 196 - q * 6, 8, 1.4, '#000', 0.4);
    nick(A + 60, B - 70, 186, 193, 0.4);
    ticks(A + 54, B - 4, 181.5, 196, k * 0.5);

    // ── 螭首: a carved beast head projecting from the wall under every post (no two cut quite alike) ──
    {
      const hs = r.range(0.94, 1.07), hv = r.range(0.95, 1.05), ho = r.range(-2.5, 2.5), hq = r.range(-1.5, 2.5), tw = r.range(-0.05, 0.05);
      const h = (u, d, ku = 1, kd = 1, ou = 0, od = 0) => { const q = hd(u, d, ku * hs, kd * hs * hv, ou + ho, od + hq); return [q[0] + (q[1] - HD) * tw, q[1]]; };
      const dot = (u, d, ru, rd, col = '#000') => { const o = []; for (let i = 0; i < 7; i++) { const an = (i / 7) * L.TAU + 0.3; o.push(h(u + Math.cos(an) * ru * r.range(0.85, 1.12), d + Math.sin(an) * rd * r.range(0.85, 1.12))); } poly(o, col, 0.3); };
      poly(HEAD.map(([u, d]) => h(u, d, 1.1, 1.06, 12, 11)), '#000', 0.6);                        // cast shadow, down-right
      poly(HEAD.map(([u, d]) => h(u, d, 1.2, 1.17)), '#000', 0.6);                                // outline
      poly(HEAD.map(([u, d]) => h(u, d)), '#fff', 0.5);
      // carved in the round and lit from the upper left: the off side of the head is left as solid wood (black),
      // its edge a zigzag of gouge strokes, with one nick of light for the far eye
      const zz = [r.range(-1.5, 1.5), r.range(-1.5, 1.5), r.range(-1.5, 1.5), r.range(-1.5, 1.5)];
      poly([h(2.4, 98.6), h(13, 99.4), h(15.4, 107), h(17.2, 119), h(15.2, 128), h(9, 134.2), h(0.6, 134.2),
        h(3.4 + zz[0], 129.4), h(0.6, 126.4), h(5.6 + zz[1], 122.6), h(2.2, 118.6), h(6.4 + zz[2], 113.4), h(1.6, 108.6), h(4.6 + zz[3], 103.4)], '#000', 0.4);
      dot(8.6, 112.6, 2.3, 1.9, '#fff');
      { const b0 = h(-0.6, 109.8), b1 = h(-13.4, 104); cut(b0[0], b0[1], b1[0], b1[1], 8.6, 3.2, '#000', 0.3); }       // brow ridge sweeping up and back like a horn
      dot(-7.4, 114, 2.7, 2.4);                                                                    // the near eye, round and staring
      dot(-3.6, 120.6, 2.1, 1.6);                                                                  // nostril of the blunt upturned nose
      { const c0 = h(-11.6, 119), c1 = h(-14.4, 125.4); cut(c0[0], c0[1], c1[0], c1[1], 4.8, 1.4, '#000', 0.3); }       // jowl fold
      dot(-3.4, 128.2, 4.6, 3.5);                                                                  // the open mouth: the spout
    }

    // ── post (望柱) with its cap (柱头) standing proud of the handrail ──
    // no two posts cut alike; the caps beside the tagline are kept lowest (clear of the text zone), the outer ones stand a little taller
    const ch = L.lerp(0.78, 1.1, L.smooth((Math.abs(u0) - 330) / 420)) * r.range(0.97, 1.03), cw = r.range(0.96, 1.05), lean = r.range(-1.6, 1.6);
    const cap = CAP.map(([u, d]) => [u * cw + (d < 0 ? lean * 0.4 : 0), d < 0 ? d * ch : d]);
    if (T.edge) poly(cap.map(([u, d]) => [u * 1.3, (d + 10) * 1.34 - 10]), '#000', 0.6);
    poly([[-PW, -2], [PW, -2], [PW + lean, BAL], [-PW + lean, BAL]], '#fff', 0.5);
    poly(cap, '#fff', 0.7);
    cut(-20.5, -9.8 * ch, 20.5, -9.8 * ch + r.range(-0.8, 0.8), 5.6, 5.6, '#000', 0.3);           // groove under the cap
    cut(-PW + 3.5, -1, -PW + 3.5 + lean, BAL, 8, 8);
    cut(PW - 6, -1, PW - 6 + lean, BAL, 13, 13);                                                  // the shade side: a heavy edge with wedges running in from it
    for (let d = 16 + r.range(-3, 5); d < BAL - 14; d += r.range(17, 28)) {                       // never evenly spaced
      if (r.chance(0.1)) continue;
      const len = L.lerp(r.range(10, 20), r.range(20, 31), Math.pow(kp, 1.1)) * (r.chance(0.22) ? 0.6 : 1);
      const x = PW - 8 + lean * (d / BAL);
      cut(x, d, x - len, d + r.range(0.3, 3), 9.6 + 0.8 * kp + r.range(-0.8, 1), 1.2, '#000', 0.4);
    }
  }
}

/** the "block": white = cut away (paper shows), black = wood left standing (prints) */
function buildDesign(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, LW, LH);
    for (const T of TIERS) drawTier(g, a, T);
  });
}

/** value noise as a full-layer byte field (read channel 0): random grey tiles scaled up by the canvas, octaves averaged */
function noiseField(seed, octs) {
  const c = L.makeCanvas(LW, LH); const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  let wsum = 0;
  octs.forEach(([cell, wt], k) => {
    const r = L.rng(seed + ':' + k);
    const sw = Math.ceil(LW / cell) + 4, sh = Math.ceil(LH / cell) + 4;
    const sc = L.makeCanvas(sw, sh); const sg = sc.getContext('2d');
    const id = sg.createImageData(sw, sh); const d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = (r() * 256) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    sg.putImageData(id, 0, 0);
    wsum += wt; g.globalAlpha = wt / wsum;
    g.drawImage(sc, -cell * (1.3 + 0.37 * k), -cell * (1.6 - 0.23 * k), sw * cell, sh * cell);
  });
  return g.getImageData(0, 0, LW, LH).data;
}
/** value below which `q` of the field lies (from a sparse sample) */
function quantile(d, q) {
  const s = [];
  for (let i = 0; i < d.length; i += 4 * 97) s.push(d[i]);
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

/** the printing pass: turn the crisp block into an impression (alpha = ink density) */
function buildInk(env, design) {
  const a = env.arc;
  const mS = L.blurred(design, 1.3).getContext('2d').getImageData(0, 0, LW, LH).data;   // ink squash: corners round, hair lines starve
  const mW = L.blurred(design, 8).getContext('2d').getImageData(0, 0, LW, LH).data;     // "how much ink is around here"
  const nE = noiseField('s18edge', [[1.6, 0.9], [3.4, 1.0], [8.5, 0.8]]);                  // ragged cut edge
  const nS = noiseField('s18salt', [[1.7, 1], [3.3, 0.7]]);                             // salt / pepper
  const nP = noiseField('s18patch', [[260, 1], [84, 0.55]]);                            // where the block was inked thin / heavy
  const sHi = quantile(nS, 0.9925), sTop = quantile(nS, 0.9993), pMid = quantile(nP, 0.5);
  const out = new ImageData(LW, LH); const o = out.data;
  const cxL = a.cx + PAD, cyL = a.cy + PAD, R2 = a.R * a.R;
  // text zone (frame coords → layer coords), kept spotless
  const zx0 = 560 + PAD, zx1 = 1360 + PAD, zy0 = a.crestY - 320 + PAD, zy1 = a.crestY + PAD;
  for (let y = 0; y < LH; y++) {
    const dy = y - cyL;
    const zdy = y < zy0 ? zy0 - y : y > zy1 ? y - zy1 : 0;
    for (let x = 0; x < LW; x++) {
      const k = (y * LW + x) * 4;
      const m = mS[k] * (1 / 255), w = mW[k] * (1 / 255);        // 1 = cut away, 0 = standing wood
      if (m > 0.985 && w > 0.93) continue;                       // open paper, far from any ink
      const dx = x - cxL, below = dx * dx + dy * dy < R2;
      const e = (nE[k] - 127.5) * (1 / 255), pa = (nP[k] - pMid) * (1 / 255), sp = nS[k];
      // thin-inked patches starve the lines a little, heavy ones fatten them (only on the stone, never on the sky's edge)
      const t = m + e * (below ? 1.25 : 0.8) + (below ? pa * 0.95 : 0);
      let D = 1 - sstep(0.36, 0.64, t);
      if (D > 0.004) {
        if (w < 0.6) {
          // salt: tiny un-inked specks inside the solids — sparse in the sky, none at all around the tagline
          let thr = sHi - pa * 40;
          if (!below) {
            const zdx = x < zx0 ? zx0 - x : x > zx1 ? x - zx1 : 0;
            const far = sstep(40, 420, Math.sqrt(zdx * zdx + zdy * zdy));
            thr = far > 0.02 ? L.lerp(300, sTop + 3, far) : 300;
          }
          if (sp > thr) D *= 1 - sstep(thr, thr + 5, sp);
        }
      } else if (w < 0.9 && sp > sHi + 2 + w * 6) {
        // pepper: flecks of ink that strayed onto the cleared wood beside the lines
        D = 0.9 * sstep(sHi + 2 + w * 6, sHi + 7 + w * 6, sp);
      }
      if (D <= 0.004) continue;
      o[k] = INK[0]; o[k + 1] = INK[1]; o[k + 2] = INK[2]; o[k + 3] = D >= 1 ? 255 : D * 255;
    }
  }
  const ink = L.makeCanvas(LW, LH);
  ink.getContext('2d').putImageData(out, 0, 0);
  ink._pad = PAD;
  return ink;
}

function buildSheet(env) {
  const a = env.arc;
  const ink = buildInk(env, buildDesign(env));
  const paper = L.paperTex(LW, LH, { base: '#faf4e5', seed: 's18paper', tone: '#a08e68', fiber: 0.5, stain: 0.12, grain: 0.13 });
  return L.makeLayer(PAD, (g) => {
    g.drawImage(paper, -PAD, -PAD);
    // long fibres of the hand-made sheet, big enough to see at this distance
    const r = L.rng('s18fibre');
    g.lineCap = 'round';
    for (let i = 0; i < 620; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(a.crestY - 40, H + PAD), len = r.range(26, 110), an = r.range(0, Math.PI);
      const cx = Math.cos(an), sy = Math.sin(an), bend = r.range(-0.3, 0.3) * len;
      g.strokeStyle = r.chance(0.55) ? `rgba(255,253,244,${r.range(0.2, 0.5).toFixed(3)})` : `rgba(128,110,78,${r.range(0.04, 0.11).toFixed(3)})`;
      g.lineWidth = r.range(0.8, 2);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + cx * len * 0.5 - sy * bend, y + sy * len * 0.5 + cx * bend, x + cx * len, y + sy * len); g.stroke();
    }
    // laid lines
    g.fillStyle = 'rgba(120,102,66,0.028)';
    for (let y = -PAD; y < H + PAD; y += 11) g.fillRect(-PAD, y, LW, 1.6);
    // oil of the ink creeping a hair into the paper around every printed form
    g.globalAlpha = 0.09; g.drawImage(L.blurred(ink, 3), -PAD, -PAD); g.globalAlpha = 1;
    g.drawImage(ink, -PAD, -PAD);
  });
}

/** macro-lens falloff: softened copies of the sheet fade in away from the crest (the plane of focus) */
function buildSoft(env, sheet, px, stops, side) {
  const a = env.arc;
  const soft = L.blurred(sheet, px);
  const g = soft.getContext('2d');
  g.filter = 'none'; g.globalCompositeOperation = 'destination-in';
  if (side) {
    g.fillStyle = L.linear(g, 0, 0, LW, 0, [[0, 'rgba(0,0,0,1)'], [0.2, 'rgba(0,0,0,0.5)'], [0.36, 'rgba(0,0,0,0)'], [0.64, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']]);
  } else {
    const r0 = a.R - 760, r1 = a.R + 200, st = (dr) => (a.R + dr - r0) / (r1 - r0);
    g.fillStyle = L.radial(g, a.cx + PAD, a.cy + PAD, r0, r1, [[0, 'rgba(0,0,0,1)'], ...stops.map(([dr, al]) => [st(dr), `rgba(0,0,0,${al})`]), [1, 'rgba(0,0,0,0)']]);
  }
  g.fillRect(0, 0, LW, LH);
  return soft;
}

/** everything that is fixed for the whole shot, flattened into one layer so a frame costs a single blit */
function buildShot(env) {
  const sheet = buildSheet(env);
  const softA = buildSoft(env, sheet, 1.6, null, true);                                   // far sides
  const softB = buildSoft(env, sheet, 2.2, [[-600, 1], [-500, 0.55], [-410, 0]], false);   // the lower tier
  const a = env.arc;
  const bloom = L.blurred(sheet, 9);
  return L.makeLayer(PAD, (g) => {
    g.drawImage(sheet, -PAD, -PAD);
    g.drawImage(softA, -PAD, -PAD);
    g.drawImage(softB, -PAD, -PAD);
    // the copy lamp, upper left: the sheet falls off a little toward the far corners (multiply: the ink stays as black as it is)
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, a.cx - 180, a.crestY + 120, 260, 1500, [[0, '#ffffff'], [0.55, '#f6f4ee'], [1, '#e9e5da']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    // lens halation: the lit paper glows a hair past its own edge
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.09;
    g.drawImage(bloom, -PAD, -PAD);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  });
}

export default {
  name: '圜丘·木刻版画',
  tone: 'light',
  init(env) {
    S = { shot: buildShot(env) };
  },
  draw(ctx, env, p) {
    // slow push-in with a small drift along the arc; zoom passes through 1 at mid-shot so the handrail sits on the arc
    const rot = L.lerp(-0.0045, 0.0045, p), zoom = L.lerp(0.988, 1.012, p);
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.shot, { rot, zoom });
  },
};
