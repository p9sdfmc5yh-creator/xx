// s18 — 钱谱木刻. A page from an old coin catalogue (钱谱): the woodcut figure of one large cash coin, enlarged until
// only its upper edge is in frame. Pure black and white.
// The arc is the OUTER edge of the coin's outer rim (外郭): a thick, slightly broken white line against the solid
// printed black outside the coin. Below it, white paper with black line work in concentric bands:
//   1) the rim — packed with short cuts that all point at the coin's centre (uneven spacing, knife slips, ink blots),
//   2) a ring of small square "beads",
//   3) the field (钱肉) — sparse parallel horizontal lines, closer together in the shadow under the rim,
//   4) one corner of the inner rim and square hole (内郭 / 方孔) peeking in at the bottom.
// No inscription is shown. The hatching is the printmaker's convention, not teeth on the coin.
// Deliberate simplification: the distance from rim to hole is compressed so that the hole's corner can enter the frame
// (a real hole sits much deeper). The hole itself is a true square on the coin's own axes — the frame looks at the coin
// along its diagonal, which is why the hole meets us corner-first. Its black is the same ground as outside the coin.
// Old coin catalogues are mostly plain line work; the dense hatching here is this shot's stylisation, not a facsimile.
// Pipeline: crisp black/white "block" → per-pixel printing pass (ragged cut edges, uneven inking, salt specks,
// dry grey 断墨 patches, wood-grain 飞白, stray pepper) → composite onto paper → one blit per frame + a few live specks.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
const LW = W + PAD * 2, LH = H + PAD * 2;
const INK = [11, 10, 9];       // 墨黑 #0B0A09
const PAPER = '#F2ECDD';       // 纸白
let S = null;

// depths below the arc, px
const EDGE = 17;                        // the white line of the rim's outer edge: 0 … EDGE
const HAT0 = 24, HAT1 = 128;            // rim hatching
const BEAD0 = 138, BEAD1 = 195;         // black band carrying the square beads
const SQ0 = 148, SQ1 = 184, BPITCH = 50, BHALF = 18;
const LN3 = [201, 207], LN4 = [213, 216.2];
const FIELD = 223;                      // the field starts here
const HOLE_TH = 0.055;                  // direction of the hole's corner (rad from the crest)
const HOLE_APEX = 340, HOLE_RIM = 70;   // apex depth of the inner rim's outer line; apex-to-apex width of the inner rim

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

/** the "block": white = cut away (paper shows), black = wood left standing (prints) */
function buildDesign(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const r = L.rng('s18-qianpu');
  const nz = L.makeNoise('s18-qianpu');
  const U = a.span(PAD + 140) * R;      // half arc length to cover (px along the arc)
  // (u = px along the arc from the crest, d = px below the arc) → frame coords
  const M = (u, d) => { const th = u / R, rr = R - d; return [cx + rr * Math.sin(th), cy - rr * Math.cos(th)]; };

  return L.makeLayer(PAD, (g) => {
    const poly = (pts, col) => {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i < pts.length; i++) { const q = M(pts[i][0], pts[i][1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.closePath(); g.fill();
    };
    // a concentric line / band with a hand-cut wobble on both edges
    const ring = (d0, d1, col, wob, seed) => {
      const top = [], bot = [];
      for (let u = -U; u <= U + 1; u += 22) {
        top.push([u, d0 + wob * (nz.n2(u / 120, seed) + 0.55 * nz.n2(u / 29, seed + 5))]);
        bot.push([u, d1 + wob * (nz.n2(u / 120, seed + 11) + 0.55 * nz.n2(u / 29, seed + 17))]);
      }
      poly(top.concat(bot.reverse()), col);
    };
    // a faceted, tapering knife stroke from (u0,d0) to (u1,d1)
    const wedge = (u0, d0, u1, d1, w0, w1, col, n = 4) => {
      const du = u1 - u0, dd = d1 - d0, len = Math.hypot(du, dd) || 1, nx = -dd / len, ny = du / len;
      const A = [], B = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, mid = i > 0 && i < n;
        const hw = L.lerp(w0, w1, t) * 0.5 * (1 + (mid ? r.range(-0.15, 0.15) : 0));
        const off = mid ? r.range(-0.55, 0.55) : 0;
        const cu = u0 + du * t, cd = d0 + dd * t;
        A.push([cu + nx * (hw + off), cd + ny * (hw + off)]); B.push([cu - nx * (hw - off), cd - ny * (hw - off)]);
      }
      poly(A.concat(B.reverse()), col);
    };
    // an ink blot: the gaps between a few neighbouring cuts flooded shut — squarish (it stops at the cuts), ragged above and below
    const blob = (u, d, rx, ry) => {
      const pts = [], n = 12, ph = r.range(0, L.TAU);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * L.TAU, c = Math.cos(t), s = Math.sin(t), k = r.range(0.66, 1.16);
        pts.push([u + rx * Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (0.9 + 0.1 * k), d + ry * s * k * (1 + 0.28 * Math.sin(t * 3 + ph))]);
      }
      poly(pts, '#000');
      if (r.chance(0.6)) { const q = M(u + r.sign() * rx * r.range(0.3, 0.9), d + r.sign() * (ry + r.range(5, 12))); g.fillStyle = '#000'; g.beginPath(); g.ellipse(q[0], q[1], r.range(2.5, 4.5), r.range(3.5, 7), u / R, 0, L.TAU); g.fill(); }
    };

    // outside the coin: solid printed black. inside: paper.
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, LW, LH);
    // 漏印白点: a few specks of bare paper in the black ground, thinning out to nothing toward the crest and the tagline
    {
      const zx0 = 500, zx1 = 1420, zy0 = a.crestY - 350;
      for (let i = 0; i < 560; i++) {
        const x = r.range(-PAD, W + PAD), y = r.range(-PAD, a.crestY + 260), rad = 1.9 + 3.0 * Math.pow(r(), 2.6), keep = r(), ang = r.range(0, Math.PI), sq = r.range(0.55, 1);
        if (a.drAt(x, y) < 22) continue;
        const zdx = x < zx0 ? zx0 - x : x > zx1 ? x - zx1 : 0, zdy = y < zy0 ? zy0 - y : 0;
        const far = sstep(40, 430, Math.hypot(zdx, zdy));
        if (keep > far * far * 0.6) continue;
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, rad * 1.15, rad * sq * 0.8, ang, 0, L.TAU); g.fill();
        if (rad > 2.6) { g.beginPath(); g.ellipse(x + Math.cos(ang) * rad * 1.3, y + Math.sin(ang) * rad * 1.1, rad * 0.75, rad * 0.5, ang + 0.9, 0, L.TAU); g.fill(); }
      }
    }
    g.fillStyle = '#fff'; a.pathBelow(g, 0); g.fill();

    // ── 4) the field (钱肉): sparse parallel horizontal lines; every other line only lives in the shadow under the rim ──
    g.save(); a.clipBelow(g, -(FIELD - 1));
    {
      const Rf = R - FIELD - 2, XM = W / 2 + PAD + 40, PITCH = 12.5;
      const hline = (xa, xb, y, w, tapA, tapB, k) => {
        if (xb - xa < 10) return;
        const A = [], B = [];
        const n = Math.max(2, Math.round((xb - xa) / 17));
        for (let i = 0; i <= n; i++) {
          const x = L.lerp(xa, xb, i / n);
          const yc = y + 0.9 * nz.n2(x / 150, k * 1.7) + 0.4 * nz.n2(x / 33, k * 3.1 + 4);
          let hw = (w / 2) * (1 + 0.24 * nz.n2(x / 41, k * 5.3 + 9));
          hw *= Math.min(1, 0.28 + (x - xa) / tapA) * Math.min(1, 0.28 + (xb - x) / tapB);
          A.push([x, yc - hw]); B.push([x, yc + hw]);
        }
        g.fillStyle = '#000'; g.beginPath();
        A.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
        for (let i = B.length - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
        g.closePath(); g.fill();
      };
      let k = 0;
      for (let y = a.crestY + FIELD + 8; y < H + PAD + 10; y += PITCH, k++) {
        const dyc = cy - y; if (dyc >= Rf) continue;
        const xh = Math.min(XM, Math.sqrt(Rf * Rf - dyc * dyc));
        if (k % 2 === 0) {
          // the long lines: broken here and there where the knife lifted
          let x = cx - xh + r.range(2, 12); const xEnd = cx + xh - r.range(2, 12);
          const lw = r.pick([3.0, 3.4, 3.4, 3.8, 4.3]);
          while (x < xEnd) {
            const len = r.range(260, 900), xb = Math.min(xEnd, x + len);
            hline(x, xb, y, lw * r.range(0.92, 1.1), r.range(10, 40), r.range(10, 70), k);
            x = xb + r.range(6, 20);
          }
        } else {
          // shadow lines: only within a short distance of the rim, dying away into the field
          let run = null;
          for (let x = cx - xh; x <= cx + xh + 1; x += 12) {
            const depth = Rf - Math.hypot(x - cx, dyc);
            const reach = 30 + 34 * (0.5 + 0.5 * nz.n2(x / 170, k * 2.3)) + 14 * nz.n2(x / 40, k * 0.9 + 3);
            const on = depth < reach;
            if (on && run === null) run = x;
            if ((!on || x + 12 > cx + xh) && run !== null) {
              const left = run < cx;   // the shadow dies away toward the centre of the frame
              hline(run + r.range(0, 6), x - r.range(0, 6), y, 2.7 * r.range(0.9, 1.1), left ? 8 : r.range(50, 110), left ? r.range(50, 110) : 8, k);
              run = null;
            }
          }
        }
      }
    }
    g.restore();

    // ── 5) the inner rim and the square hole: only one corner reaches the frame ──
    {
      const sq = (apex, rough, seed, col) => {
        const pts = [];
        for (let j = 0; j < 4; j++) { const q = a.pt(HOLE_TH + (j - 1) * Math.PI / 2, -apex); pts.push([q.x, q.y]); }
        L.roughPoly(g, pts, { rough, seed, step: 26 }); g.fillStyle = col; g.fill();
      };
      sq(HOLE_APEX - 13, 0.5, 51, '#fff');             // a clear margin where the field lines stop short of the rim
      sq(HOLE_APEX, 1.1, 52, '#000');
      sq(HOLE_APEX + 11.5, 1.0, 53, '#fff');           // → a heavy outer line (≈8 px)
      sq(HOLE_APEX + HOLE_RIM - 14, 0.8, 55, '#000');
      sq(HOLE_APEX + HOLE_RIM - 8.5, 0.8, 56, '#fff'); // → a fine inner line: the inner rim is drawn as a double line
      sq(HOLE_APEX + HOLE_RIM, 1.3, 54, '#000');       // the hole: the same black ground as outside the coin
    }

    // ── 1) the rim (外郭): white edge line, then a band of short cuts pointing at the centre ──
    ring(EDGE, HAT0, '#000', 0.7, 1);
    ring(HAT1, HAT1 + 6.5, '#000', 0.7, 2);
    for (let u = -U; u < U;) {
      const dens = 1 + 0.2 * nz.n2(u / 310, 1.3) + 0.11 * nz.n2(u / 47, 7.7);
      const pitch = 11.4 / dens + r.range(-0.6, 0.6);
      const heft = r(); // most cuts are alike; now and then a heavy one or a hairline
      const w = Math.min(4.7 * (0.88 + 0.24 * (nz.n2(u / 170, 4.1) * 0.5 + 0.5)) * (heft < 0.11 ? 1.5 : heft > 0.88 ? 0.68 : 1), pitch * (heft < 0.11 ? 0.62 : 0.46));
      const top = HAT0 - 1 + (r.chance(0.12) ? r.range(4, 14) : 0);
      const bot = r.chance(0.07) ? HAT1 + 1 : HAT1 - r.range(5, 11) - (r.chance(0.2) ? r.range(6, 30) : 0);
      const lean = r.range(-1.4, 1.4);
      const wT = w * r.range(1.0, 1.25), wB = w * r.range(0.6, 0.92);
      if (r.chance(0.07)) {
        const mid = r.range(top + 26, bot - 26), gap = r.range(5, 12);
        wedge(u, top, u + lean * 0.5, mid - gap / 2, wT, wT * 0.7, '#000', 3);
        wedge(u + lean * 0.5, mid + gap / 2, u + lean, bot, wB * 1.1, wB, '#000', 3);
      } else wedge(u, top, u + lean, bot, wT, wB, '#000', 5);
      u += pitch * (r.chance(0.045) ? 1.75 : 1);   // a cut skipped here and there
    }
    // ink blots: a few neighbouring cuts flooded into one small black patch
    for (let u = -U + r.range(0, 200); u < U; u += r.range(170, 400)) blob(u, r.range(46, 100), r.range(11, 25), r.range(9, 21));
    // knife slips: a thin white sliver skidding across several cuts
    for (let u = -U + r.range(0, 150); u < U; u += r.range(120, 330)) {
      const d = r.range(36, 108), len = r.range(26, 66) * r.sign(), dd = r.range(6, 22) * r.sign();
      wedge(u, d, u + len, d + dd, r.range(3.4, 5.2), 0.8, '#fff', 3);
    }

    // ── 2) the ring of small square beads ──
    ring(BEAD0, BEAD1, '#000', 0.8, 3);
    {
      const nb = Math.ceil(U / BPITCH) + 1, j = () => r.range(-1.2, 1.2);
      for (let i = -nb; i <= nb; i++) {
        const uc = (i + 0.5) * BPITCH + r.range(-1.3, 1.3);
        let hw = BHALF + r.range(-1.3, 1.3), t0 = SQ0 + r.range(-1.2, 1.2); const t1 = SQ1 + r.range(-1.2, 1.2);
        if (r.chance(0.07)) { hw *= 0.74; t0 += r.range(2, 7); }       // half-clogged with ink
        poly([[uc - hw + j(), t0 + j()], [uc + hw + j(), t0 + j()], [uc + hw + j(), t1 + j()], [uc - hw + j(), t1 + j()]], '#fff');
        if (r.chance(0.17)) {                                           // a chip of wood left standing in one corner
          const sx = r.sign(), top = r.chance(0.5), c = r.range(5, 10), ux = uc + sx * hw, dq = top ? t0 : t1, sy = top ? 1 : -1;
          poly([[ux + sx, dq - sy], [ux - sx * c, dq - sy], [ux + sx, dq + sy * c]], '#000');
        } else if (r.chance(0.045)) {                                   // the wall between two beads has broken away
          const dm = r.range(t0 + 6, t1 - 6), hh = r.range(3, 6);
          poly([[uc + hw - 2, dm - hh], [uc + BPITCH - BHALF + 2, dm - hh * r.range(0.4, 1)], [uc + BPITCH - BHALF + 2, dm + hh * r.range(0.4, 1)], [uc + hw - 2, dm + hh]], '#fff');
        }
      }
    }
    // ── 3) double line closing the rim ──
    ring(LN3[0], LN3[1], '#000', 0.7, 4);
    ring(LN4[0], LN4[1], '#000', 0.5, 5);

    // nicks in the concentric lines where the block has chipped
    for (const [d0, d1, every] of [[EDGE, HAT0, 260], [HAT1, HAT1 + 6.5, 230], [LN3[0], LN3[1], 210], [LN4[0], LN4[1], 120]]) {
      for (let u = -U + r.range(0, every); u < U; u += r.range(every * 0.5, every * 1.5)) {
        const w = r.range(4, 11);
        poly([[u, d0 - 1.5], [u + w, d0 - 1.5], [u + w + r.range(-2, 2), d1 + 1.5], [u + r.range(-2, 2), d1 + 1.5]], '#fff');
      }
    }
    // the white edge line is "略有断续": ink from the black ground creeps into it, and bridges it in a few places (never at the crest)
    for (let u = -U + r.range(0, 80); u < U; u += r.range(70, 190)) {
      if (Math.abs(u) < 150) continue;
      const q = M(u, -0.5), rx = r.range(6, 18), ry = r.range(2.5, 6.5);
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(q[0], q[1], rx, ry, u / R, 0, L.TAU); g.fill();
    }
    for (let u = -U + r.range(60, 260); u < U; u += r.range(260, 520)) {
      if (Math.abs(u) < 230) continue;
      const w = r.range(5, 11);
      poly([[u - w * 0.7, -2], [u + w * 0.7, -2], [u + w * 0.35 + r.range(-1.5, 1.5), EDGE + 2], [u - w * 0.35 + r.range(-1.5, 1.5), EDGE + 2]], '#000');
    }
  });
}

function makeLat(seed, n) {
  const r = L.rng(seed); const v = new Float32Array(n * n);
  for (let i = 0; i < v.length; i++) v[i] = r();
  return { a: v, n, m: n - 1 };
}
/** tileable smooth value noise in [0,1] */
function vn(lat, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const m = lat.m, n = lat.n, a = lat.a;
  const x0 = xi & m, x1 = (xi + 1) & m, y0 = (yi & m) * n, y1 = ((yi + 1) & m) * n;
  const p = a[y0 + x0], q = a[y0 + x1], r = a[y1 + x0], s = a[y1 + x1];
  const top = p + (q - p) * fx;
  return top + (r + (s - r) * fx - top) * fy;
}

/** the printing pass: turn the crisp block into an impression (alpha = ink density) */
function buildInk(env, design) {
  const a = env.arc;
  const mS = L.blurred(design, 1.5).getContext('2d').getImageData(0, 0, LW, LH).data;
  // wide blur at half res → "how much ink is around here"
  const hw = Math.ceil(LW / 2), hh = Math.ceil(LH / 2);
  const wc = L.makeCanvas(hw, hh); const wg = wc.getContext('2d', { willReadFrequently: true });
  wg.fillStyle = '#000'; wg.fillRect(0, 0, hw, hh);
  wg.filter = 'blur(4px)'; wg.drawImage(design, 0, 0, LW, LH, 0, 0, LW / 2, LH / 2); wg.filter = 'none';
  const mW = wg.getImageData(0, 0, hw, hh).data;

  // coarse fields: inking pressure, dry patches, the slow wave of the wood grain
  const GS = 12, gw = Math.ceil(LW / GS) + 2, gh = Math.ceil(LH / GS) + 2;
  const nA = L.makeNoise('s18c-press'), nB = L.makeNoise('s18c-dry');
  const fP = new Float32Array(gw * gh), fQ = new Float32Array(gw * gh), fG = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const X = gx * GS, Y = gy * GS, i = gy * gw + gx;
    fP[i] = nA.fbm(X / 310, Y / 220, 3);
    fQ[i] = nB.fbm(X / 150 + 40, Y / 95 - 9, 3);
    fG[i] = nA.fbm(X / 600 + 7, Y / 110 + 3, 2);
  }
  const l1 = makeLat('s18c-a', 512), l2 = makeLat('s18c-b', 512), l3 = makeLat('s18c-c', 256), l4 = makeLat('s18c-d', 256);
  const out = new ImageData(LW, LH); const o = out.data;
  const cxL = a.cx + PAD, cyL = a.cy + PAD, R = a.R, R2 = R * R;
  // the tagline zone (frame → layer coords), widened for the slide along the arc: kept calm
  const zx0 = 520 + PAD, zx1 = 1400 + PAD, zy0 = a.crestY - 340 + PAD, zy1 = a.crestY + 30 + PAD;
  for (let y = 0; y < LH; y++) {
    const dy = y - cyL;
    const gyf = y / GS, gy0 = Math.floor(gyf), ty = gyf - gy0, row0 = gy0 * gw, row1 = row0 + gw;
    const wrow = (y >> 1) * hw;
    const zdy = y < zy0 ? zy0 - y : y > zy1 ? y - zy1 : 0;
    for (let x = 0; x < LW; x++) {
      const k = (y * LW + x) * 4;
      const m = mS[k] * (1 / 255);                       // 1 = cut away, 0 = standing wood
      const v1 = vn(l1, x * 0.57, y * 0.57), v2 = vn(l2, x * 0.25, y * 0.25), v3 = vn(l3, x * 0.11, y * 0.11);
      const gxf = x / GS, gx0 = Math.floor(gxf), tx = gxf - gx0, i0 = row0 + gx0, i1 = row1 + gx0;
      const P = L.lerp(L.lerp(fP[i0], fP[i0 + 1], tx), L.lerp(fP[i1], fP[i1 + 1], tx), ty);
      const dx = x - cxL;
      const below = dx * dx + dy * dy < R2;
      // 断墨: patches where the block ran dry (only inside the coin; the black ground stays solid)
      const dry = below ? sstep(0.14, 0.46, L.lerp(L.lerp(fQ[i0], fQ[i0 + 1], tx), L.lerp(fQ[i1], fQ[i1 + 1], tx), ty)) : 0;
      // the printed edge: heavy inking fattens the lines, thin inking starves and breaks them; ragged at 2–10 px
      const thr = 0.5 + 0.2 * P + 0.3 * (v3 - 0.5) + 0.24 * (v2 - 0.5) + 0.12 * (v1 - 0.5) - 0.17 * dry;
      const I = sstep(-0.06, 0.06, thr - m);
      const inside = 1 - mW[(wrow + (x >> 1)) * 4] * (1 / 255);   // 1 deep inside a solid black
      let D = 0;
      if (I > 0.003) {
        let amt = 1;
        if (!below) {
          const zdx = x < zx0 ? zx0 - x : x > zx1 ? x - zx1 : 0;
          const far = sstep(0, 320, Math.sqrt(zdx * zdx + zdy * zdy));
          amt = 0.42 * far * far;
        }
        const G = L.lerp(L.lerp(fG[i0], fG[i0 + 1], tx), L.lerp(fG[i1], fG[i1 + 1], tx), ty);
        let patch = 0.5 - 1.2 * P; patch = patch < 0 ? 0 : patch > 1 ? 1 : patch;   // where the block was inked thin
        // salt: tiny un-inked specks (漏印白点); none near the tagline
        const z = 0.5 * v1 + 0.3 * v2 + 0.2 * vn(l3, x * 0.19 + 40.5, y * 0.19 + 11.5);
        const tS = 0.93 - amt * (0.075 + 0.1 * patch);
        let drop = sstep(tS, tS + 0.035, z);
        let dens = 1;
        if (below) {
          // where the block ran dry the plank's grain shows as hair-thin horizontal streaks of bare paper (飞白) through the blacks,
          const gv = vn(l4, x / 220 + y * 0.003, y / 2.5 + 2.4 * G);
          const dg = sstep(0.84 - 0.17 * dry, 0.95 - 0.13 * dry, gv) * (0.3 + 0.7 * v2) * (0.2 + 0.8 * (patch > dry ? patch : dry)) * (0.4 + 0.6 * inside);
          if (dg > drop) drop = dg;
          // … and the thin lines print a grainy grey instead of black (the solids keep their ink)
          const thin = 1 - inside * 2;
          if (thin > 0) dens = 1 - dry * 0.9 * thin * (0.75 + 0.5 * v1);   // ≈ 断墨灰 #8A857A on the sparse field lines
        }
        // the faintest tooth of the paper showing through the solid
        const tooth = 0.5 * vn(l4, x / 31 + 91.5, y / 8 + 13.5) + 0.5 * v3;
        D = I * (1 - drop) * dens * (1 - 0.035 * tooth * tooth);
      }
      if (I < 0.5 && inside > 0.015) {
        // pepper: flecks of ink that strayed onto the cleared wood beside the lines
        const z2 = 0.5 * v1 + 0.5 * vn(l2, x * 0.33 + 9.5, y * 0.33 + 71.5);
        const tP = 0.885 - 0.13 * inside;
        const pe = sstep(tP, tP + 0.03, z2) * 0.9;
        if (pe > D) D = pe;
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

/** paper + impression + copy-stand light, flattened into one layer so a frame costs a single blit */
function buildShot(env) {
  const a = env.arc;
  const ink = buildInk(env, buildDesign(env));
  const paper = L.paperTex(LW, LH, { base: '#F6F0E2', seed: 's18coinpaper', tone: '#9a8a68', fiber: 0.8, stain: 0.16, grain: 0.14 });
  return L.makeLayer(PAD, (g) => {
    g.drawImage(paper, -PAD, -PAD);
    // oil of the ink creeping a hair into the paper around every printed form
    g.globalAlpha = 0.07; g.drawImage(L.blurred(ink, 2.6), -PAD, -PAD); g.globalAlpha = 1;
    g.drawImage(ink, -PAD, -PAD);
    // raking light from the upper left, falling off toward the lower right
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.linear(g, 0, a.crestY - 200, W, H, [[0, 'rgba(255,250,236,0.28)'], [0.5, 'rgba(128,128,128,0)'], [1, 'rgba(0,0,0,0.2)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.globalAlpha = 0.16;
    g.drawImage(L.noiseLayer(PAD, { seed: 's18c-sheet', scale: 520, sx: 1.6, octaves: 3, res: 0.12, contrast: 1.3 }), -PAD, -PAD);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const rad = Math.hypot(W / 2, H / 2);
    g.fillStyle = L.radial(g, W / 2, H / 2, rad * 0.5, rad * 1.08, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.12)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
  });
}

export default {
  name: '钱谱木刻',
  tone: 'light',
  init(env) {
    S = { shot: buildShot(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // slide about 2° round the coin's centre: the arc stays put, the cuts travel along it
    const rot = L.lerp(-0.0175, 0.0175, p);
    ctx.fillStyle = '#0b0a09'; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.shot, { rot });
    // printing grain that changes every frame: a few missed-ink specks in the black (kept away from the crest),
    // ink flecks and broken-ink nicks in the line work
    const f = Math.round(p * (env.frames - 1));
    const r = L.rng('s18grain' + f);
    L.cam(ctx, env, { rot }, () => {
      ctx.fillStyle = PAPER;
      for (let i = 0; i < 60; i++) {
        const x = r.range(-40, W + 40), y = r.range(-40, a.crestY + 250), s = 0.9 + 2.1 * Math.pow(r(), 2.4), al = r.range(0.35, 0.9), keep = r();
        if (a.drAt(x, y) < 14) continue;
        const zdx = Math.abs(x - a.cx) - 440, zdy = (a.crestY - 345) - y, zd = Math.max(zdx, zdy);
        if (zd < 40 || keep > zd / 320) continue;
        ctx.globalAlpha = al; ctx.fillRect(x, y, s, s * r.range(0.6, 1.5));
      }
      for (let i = 0; i < 46; i++) {
        const th = r.range(-0.44, 0.44), d = r.range(2, 520), q = a.pt(th, -d), w = r.range(1.3, 2.4), len = r.range(3, 9), al = r.range(0.5, 0.95);
        ctx.globalAlpha = al;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(th + r.range(-0.5, 0.5)); ctx.fillRect(-w / 2, -len / 2, w, len); ctx.restore();
      }
      ctx.fillStyle = '#0b0a09';
      for (let i = 0; i < 60; i++) {
        const th = r.range(-0.44, 0.44), d = r.range(18, 520), q = a.pt(th, -d), s = 0.9 + 1.8 * Math.pow(r(), 2);
        ctx.globalAlpha = r.range(0.45, 0.9); ctx.fillRect(q.x, q.y, s, s * r.range(0.6, 1.4));
      }
      ctx.globalAlpha = 1;
    });
  },
};
