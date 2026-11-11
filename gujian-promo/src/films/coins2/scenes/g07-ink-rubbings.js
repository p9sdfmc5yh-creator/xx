// g07 — 钱背墨拓: a few dozen ink rubbings of coin backs on one sheet of xuan paper, spelling the CURRENT glyph.
// Each rubbing is a black dabbed disc: the rim and the inner rim struck solid, the flat field stippled through the paper tooth,
// and thin WHITE lines where the paper dipped beside the relief (outer rim line + the square hole). No inscriptions at all.
// Layout: K.pack — one rubbing per disc: the big ones strung along the centre line of every stroke (as wide as the stroke),
// smaller ones in what is left. Nothing here knows which character it is spelling; every size follows glyphInfo().strokeWidth.
// Between the coins the dabber left a dry stipple on the bare sheet, inside the strokes only: it keeps each stroke in one piece.
// The sheet kept the emboss of the coins (it was pressed on wet): a height field is built with the ink and lit from the upper
// left — paper highlights, a sheen on the ink, contact + cast shadows — all per DEVICE pixel (L.pixelCanvas), so it holds at 4K.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const PAPER = '#ebe6d8';
const INK = [21, 20, 19], GREY = [104, 99, 91], SHEEN = [190, 184, 171], SHADE = [56, 43, 27], LIGHT = [255, 253, 246];
const KINDS = ['plain', 'plain', 'plain', 'star', 'star', 'four', 'four', 'double'];   // what the coin's back carries (never writing)

// ───────────── where the rubbings go: beads on the strokes of whichever glyph is current ─────────────
function layout(info) {
  const sw = info.strokeWidth, r = L.rng('g07lay' + info.key);
  // the rubbings may stick out of the outline by a few px (so the strokes read full), and just touch one another
  const discs = K.pack({ seed: 'g07pack', rmax: sw * 0.57, rmin: Math.max(5, sw * 0.17), gap: 1, margin: -Math.min(2.5, sw * 0.035) });
  return discs.map((p) => ({ x: p.x, y: p.y, rad: p.r * r.range(0.955, 1.0) }));
}

// ───────────── one rubbing: ink density + relief height into the page buffers (device resolution) ─────────────
function rub(D, H, G, PW, q, c, idx, sw, nA, nB) {
  const r = L.rng('g07coin' + idx), rad = c.rad, k40 = rad / 40, small = rad < sw * 0.3;
  const rimW = Math.max(1.8, rad * r.range(0.13, 0.2)), h = rad * r.range(0.225, 0.29), iw = Math.max(1.2, rad * r.range(0.075, 0.11));
  const rot = r.range(-0.12, 0.12), cs = Math.cos(rot), sn = Math.sin(rot);
  const pale = r.chance(0.18), base = pale ? r.range(0.44, 0.58) : r.range(0.62, 0.98), so = r.range(0, 900);
  const rimD = pale ? r.range(0.8, 0.94) : r.range(1.02, 1.16), dry = r.range(0.2, 0.42);
  const kind = small ? (r.chance(0.3) ? 'star' : 'plain') : r.pick(KINDS);
  const mside = r.int(0, 3), mdist = h + iw + (rad - rimW - h - iw) * 0.52;
  const mx = [0, 1, 0, -1][mside] * mdist, my = [-1, 0, 1, 0][mside] * mdist, dotR = Math.max(1.3, rad * 0.066);
  const lw = Math.max(0.75, rad * 0.026);                                              // half width of a raised line on the back
  const ring2 = rad - rimW - Math.max(1.3, 2.3 * k40) - rad * r.range(0.085, 0.11);   // radius of the second ring ('double')
  const wa = r.range(0, Math.PI), wc = Math.cos(wa), ws = Math.sin(wa), WF = TAU / r.range(2.3, 2.9);   // weave of the dabber's silk
  const bin = Math.min(2, rimW * 0.6);                                                // how far into the rim its rounded shoulder reaches
  const E = rad + 7;
  const i0 = Math.max(2, Math.floor((c.x - E) * q)), i1 = Math.min(PW - 3, Math.ceil((c.x + E) * q));
  const j0 = Math.max(2, Math.floor((c.y - E) * q)), j1 = Math.min(PW - 3, Math.ceil((c.y + E) * q));
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / q, dy = y - c.y;
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / q, dx = x - c.x, rd = Math.hypot(dx, dy);
      if (rd > E) continue;
      const inv = rad / (rd || 1), ax = dx * inv, ay = dy * inv;                       // the point of the edge this pixel looks at
      const edge = rad + 0.55 * nB.n2(ax / 46 + so, ay / 46 - so) + 0.22 * nA.n2(ax / 7 + so, ay / 7 + 1.7);
      const out = sstep(edge - 0.8, edge + 0.8, rd);
      const bul = 1 - sstep(edge - bin * 1.3, edge + 1.0, rd);                              // the paper climbing over the coin's rounded edge
      let d = 0, hh = bul;
      if (out < 1) {
        const ux = dx * cs + dy * sn, uy = -dx * sn + dy * cs, aux = Math.abs(ux), auy = Math.abs(uy), sq = Math.max(aux, auy);
        const lo = nA.n2(x / 17 + so, y / 17);
        const moat = Math.max(1.3, (2.3 + 0.9 * lo) * k40), moat2 = Math.max(1.2, (2.0 - 0.8 * lo) * k40);
        const rimIn = rad - rimW + 0.7 * nB.n2(ax / 14 + so, ay / 14 + 7.3);
        const rim = sstep(rimIn - 0.7, rimIn + 0.7, rd);
        const inner = sstep(h - 0.7, h + 0.7, sq) * (1 - sstep(h + iw - 0.7, h + iw + 0.7, sq));
        let fmask = (1 - sstep(rimIn - moat - 0.7, rimIn - moat + 0.7, rd)) * sstep(h + iw + moat2 - 0.7, h + iw + moat2 + 0.7, sq);
        let mk = 0;
        if (kind === 'star') {                                   // 背星: one raised dot in the field (never a pair — a pair reads as eyes)
          const sdm = Math.hypot(ux - mx, uy - my) - dotR;
          mk = 1 - sstep(-0.7, 0.7, sdm);
          fmask *= sstep(moat2 - 0.6, moat2 + 0.8, sdm);
        } else if (kind === 'four') {                            // 四出: four raised lines from the corners of the hole to the rim
          const sdm = Math.abs(aux - auy) * 0.7071 - lw;
          mk = (1 - sstep(-0.6, 0.6, sdm)) * sstep(h, h + iw, sq);
          fmask *= sstep(moat2 * 0.8 - 0.6, moat2 * 0.8 + 0.8, sdm);
        } else if (kind === 'double') {                          // 重轮: a second, thin ring inside the rim
          const sdm = Math.abs(rd - ring2) - lw * 1.15;
          mk = 1 - sstep(-0.6, 0.6, sdm);
          fmask *= sstep(moat * 0.8 - 0.6, moat * 0.8 + 0.8, sdm);
        }
        // the flat field: dabbed unevenly — cloudy pressure, drier streaks, a breath of the dabber's weave
        const cloud = nB.fbm(x / 46 + so, y / 46 - so, 2), fine = nA.n2(x / 10.5 - so, y / 10.5);
        const wv = Math.sin((ux * wc + uy * ws) * WF) * Math.sin((uy * wc - ux * ws) * WF);
        const fd = base + 0.3 * cloud + 0.12 * fine + 0.07 * wv - dry * sstep(0.25, 0.8, nA.n2(x / 60 + so * 2, y / 23 + so));
        // relief: dense, but a dry dab bites pale patches into a rim here and there
        const rd2 = rimD - 0.3 * sstep(0.5, 0.95, nB.n2(ax / 26 + so * 3, ay / 26 + rd / 30 + so)) + 0.05 * fine;
        const top = Math.max(rim, inner, mk);
        d = Math.max(rim * rd2, inner * (rd2 - 0.02), mk * 1.05, fmask * fd) * (1 - out);
        // height the paper kept: the body of the coin, the raised rims on it, and the sag into the hole
        hh = bul * (0.5 + 0.5 * top) * (1 - 0.66 * (1 - sstep(h - 1.4, h + 0.3, sq)));
      }
      const k = j * PW + i, gd = rd - edge;                      // G: how far outside the nearest coin this pixel lies (0 on a coin)
      if (gd < G[k]) G[k] = gd < 0 ? 0 : gd;
      if (d > D[k]) D[k] = d;
      if (hh > H[k]) H[k] = hh;
    }
  }
}

/** one box-blur pass each way, in place (radius r cells) */
function blurField(a, W, r) {
  const t = new Float32Array(W), n = 2 * r + 1, m = W - 1;
  for (let y = 0; y < W; y++) {
    const o = y * W; let s = 0;
    for (let x = -r; x <= r; x++) s += a[o + (x < 0 ? 0 : x > m ? m : x)];
    for (let x = 0; x < W; x++) { t[x] = s / n; const p = x + r + 1, m2 = x - r; s += a[o + (p > m ? m : p)] - a[o + (m2 < 0 ? 0 : m2)]; }
    for (let x = 0; x < W; x++) a[o + x] = t[x];
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += a[(y < 0 ? 0 : y > m ? m : y) * W + x];
    for (let y = 0; y < W; y++) { t[y] = s / n; const p = y + r + 1, m2 = y - r; s += a[(p > m ? m : p) * W + x] - a[(m2 < 0 ? 0 : m2) * W + x]; }
    for (let y = 0; y < W; y++) a[y * W + x] = t[y];
  }
  return a;
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, q = L.SS, PW = S * q;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const paper = K.paper({ base: PAPER, tone: '#8d7b58', seed: 'g07xuan', fiber: 0.95, stain: 0.26, grain: 0.18, foxing: 0.14, edge: 0.16 });
  g.drawImage(paper, 0, 0);
  // xuan paper: faint chain lines left by the papermaker's screen
  const pr = L.rng('g07chain');
  for (let x = 23; x < S; x += 41) {
    g.strokeStyle = L.rgba('#7d6c4c', pr.range(0.03, 0.055)); g.lineWidth = pr.range(1.2, 2);
    g.beginPath(); g.moveTo(x + pr.range(-1, 1), 0); g.lineTo(x + pr.range(-1.5, 1.5), S); g.stroke();
  }

  // ink density D and relief H of every rubbing, at device resolution
  const D = new Float32Array(PW * PW), H = new Float32Array(PW * PW), G = new Float32Array(PW * PW).fill(99);
  const nA = L.makeNoise('g07a'), nB = L.makeNoise('g07b'), nC = L.makeNoise('g07c');
  const coins = layout(info);
  coins.forEach((cn, i) => rub(D, H, G, PW, q, cn, i, sw, nA, nB));
  // the dabber went over the whole character, coins and the bare sheet between them alike: a dry, uneven stipple that stays inside
  // the strokes (this is what keeps the strokes in one piece at stamp size). Right beside a coin the paper stood clear of the
  // table, out of the dabber's reach — every rubbing keeps a thin white ring.
  {
    const b = info.bbox, i0 = Math.max(1, Math.floor((b.x0 - 6) * q)), i1 = Math.min(PW - 2, Math.ceil((b.x1 + 6) * q));
    const j0 = Math.max(1, Math.floor((b.y0 - 6) * q)), j1 = Math.min(PW - 2, Math.ceil((b.y1 + 6) * q));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * PW + i, gd = G[k];
      if (gd < 0.8) continue;
      const x = (i + 0.5) / q, y = (j + 0.5) / q, sdg = K.sdGlyph(x, y);
      if (sdg > 5.5) continue;
      const e = sdg + 2.5 * nA.n2(x / 13 + 5, y / 13 - 8);       // a ragged edge, never more than 5 px outside the outline
      if (e > 2.5) continue;
      const tent = sstep(1.1, 3.8, gd + 0.9 * nA.n2(x / 6 + 3, y / 6 + 9));
      const sm = (0.5 + 0.08 * nB.n2(x / 70 + 31, y / 70 - 12) + 0.04 * nA.n2(x / 9, y / 9 + 50)) * (1 - sstep(-1.5, 2.5, e)) * tent;
      if (sm > D[k]) D[k] = sm;
    }
  }
  // the paper is soft: round the relief (H1, σ ≈ 1 px), and a wider copy (Hs) for the shadows it throws
  const b1 = Math.max(1, Math.round(q));
  const H1 = blurField(blurField(H, PW, b1), PW, b1);
  const Hs = blurField(blurField(Float32Array.from(H1), PW, b1 * 3), PW, b1 * 3);
  // the sheet does not lie dead flat: a slow cockle, as light / dark from the upper left (coarse grid, read bilinearly)
  const CP = 12, CN = Math.ceil(S / CP) + 2, cock = new Float32Array(CN * CN);
  for (let b = 0; b < CN; b++) for (let a = 0; a < CN; a++) {
    const x = a * CP, y = b * CP;
    cock[b * CN + a] = (nB.fbm((x + 14) / 420, (y + 18) / 420, 2) - nB.fbm((x - 14) / 420, (y - 18) / 420, 2)) * 5;
  }

  const toneBuf = new Uint8Array(PW * PW);
  const ink = L.pixelCanvas(S, S, (px, pw, ph) => {
    const off = Math.round(4 * q) * pw + Math.round(3 * q);         // towards the light: who shades this pixel
    for (let j = 1; j < ph - 1; j++) {
      const y = (j + 0.5) / q, gy0 = y / CP, gj = Math.floor(gy0), fy = gy0 - gj;
      for (let i = 1; i < pw - 1; i++) {
        const k = j * pw + i, x = (i + 0.5) / q, d = D[k], h1 = H1[k];
        const gx0 = x / CP, gi = Math.floor(gx0), fx = gx0 - gi, o2 = gj * CN + gi;
        const ck = (cock[o2] * (1 - fx) + cock[o2 + 1] * fx) * (1 - fy) + (cock[o2 + CN] * (1 - fx) + cock[o2 + CN + 1] * fx) * fy;
        // slope of the relief per logical px, against a light from the upper left ( > 0: faces the light )
        const lit = ((H1[k + 1] - H1[k - 1]) * 0.62 + (H1[k + pw] - H1[k - pw]) * 0.78) * q * 0.5;
        const ko = k - off, cast = ko >= 0 ? clamp01((Hs[ko] - h1) * 1.5) : 0, ao = clamp01((Hs[k] - h1) * 1.3);
        let tone = 0, cr = 0, cg = 0, cb = 0;
        if (d >= 0.004) {
          // paper tooth (≈ 0.6–2 px particles) + the dabber's cloth + a pinch of white noise
          const g0 = nC.n2(x / 0.62 - 9, y / 0.62 + 4), gf = nC.n2(x / 1.3 + 5.5, y / 1.3 - 3.5), gm = nB.n2(x / 1.9 - 21, y / 1.9 + 8);
          const g1 = nA.n2(x / 2.4, y / 2.4), g2 = nB.n2(x / 6.5 + 11, y / 6.5), wh = hash2(i, j);
          const grain = 0.5 + 0.1 * g0 + 0.2 * gf + 0.13 * gm + 0.1 * g1 + 0.07 * g2 + 0.1 * (wh - 0.5);
          const ia = sstep(0.4, 0.6, d + (grain - 0.5) * (d > 1 ? 0.5 : 0.84));
          tone = ia * (0.76 + 0.24 * sstep(0.3, 0.9, d)) + 0.2 * sstep(0.3, 0.8, d) * (1 - ia);
          const deep = sstep(0.35, 0.85, d);
          cr = GREY[0] + (INK[0] - GREY[0]) * deep; cg = GREY[1] + (INK[1] - GREY[1]) * deep; cb = GREY[2] + (INK[2] - GREY[2]) * deep;
          if (lit > 0) {                                        // a lit slope: the dabber skimmed it, and the black ink shines — soft sheen, bright core
            tone *= 1 - Math.min(0.5, lit * 1.6) * 0.14;
            const sp = (sstep(0.03, 0.22, lit) * 0.2 + sstep(0.19, 0.3, lit) * 0.56) * (1 + 0.7 * (grain - 0.5)) * ia;
            cr += (SHEEN[0] - cr) * sp; cg += (SHEEN[1] - cg) * sp; cb += (SHEEN[2] - cb) * sp;
          } else {                                              // a slope turned away: ink pooled there, and it is in shade
            tone += Math.min(0.5, -lit * 1.6) * 0.42 * (1 - tone);
            const dk = 1 - Math.min(0.5, -lit * 2);
            cr *= dk; cg *= dk; cb *= dk;
          }
          const sd = 1 - 0.35 * cast; cr *= sd; cg *= sd; cb *= sd;
          tone *= 0.975;
        }
        toneBuf[k] = tone * 255;
        // the bare paper: highlight on slopes facing the light, contact + cast shadow on the others; plus its own fine tooth and slow cockle
        const mt = tone < 0.98 ? 0.6 * nC.n2((x + y) / 3.4 + 40, (x - y) / 1.25) + 0.4 * nA.n2(x / 0.85 + 70, y / 0.85 - 30) + ck * 0.35 : 0;
        const hl = Math.min(0.92, (lit > 0 ? lit * 3.2 : 0) + (mt > 0 ? mt * 0.11 : 0));
        const sa = Math.min(0.8, (lit < 0 ? Math.min(0.6, -lit * 2.4) : 0) + cast * 0.38 + ao * 0.15 + (mt < 0 ? -mt * 0.04 : 0));
        const pT = 1 - tone, wS = sa * (1 - hl) * pT, wH = hl * pT, A = wS + wH + tone;
        if (A < 0.003) continue;
        const o = k * 4;
        px[o] = (SHADE[0] * wS + LIGHT[0] * wH + cr * tone) / A;
        px[o + 1] = (SHADE[1] * wS + LIGHT[1] * wH + cg * tone) / A;
        px[o + 2] = (SHADE[2] * wS + LIGHT[2] * wH + cb * tone) / A;
        px[o + 3] = A * 255;
      }
    }
  });
  // the ink alone, as a mask (for the oil halo and the fibres)
  const mask = L.pixelCanvas(S, S, (px, pw, ph) => { for (let k = 0, n = pw * ph; k < n; k++) px[k * 4 + 3] = toneBuf[k]; });

  // pale paper fibres that refused the ink
  const fib = L.makeCanvas(S, S), f = fib.getContext('2d'), fr = L.rng('g07fib');
  f.lineCap = 'round';
  for (let i = 0; i < 640; i++) {
    const x = fr() * S, y = fr() * S, len = fr.range(8, 34), a = fr() * TAU, bend = fr.range(-0.7, 0.7);
    f.strokeStyle = L.rgba('#efe9da', fr.range(0.1, 0.34)); f.lineWidth = fr.range(0.5, 1.2);
    f.beginPath(); f.moveTo(x, y);
    f.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); f.stroke();
  }
  f.globalCompositeOperation = 'destination-in'; f.drawImage(mask, 0, 0);

  // a breath of ink oil in the paper round each rubbing, then the lit relief + ink, then the fibres
  g.save(); g.globalAlpha = 0.16; g.globalCompositeOperation = 'multiply'; g.drawImage(L.blurred(mask, 7), 0, 0); g.restore();
  g.drawImage(ink, 0, 0);
  g.drawImage(fib, 0, 0);
  // the light falls off towards the lower right
  g.save(); g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, '#ffffff'], [0.5, '#fbf9f4'], [1, '#e6dfd0']]); g.fillRect(0, 0, S, S);
  g.restore();
  return c;
}

export default {
  name: '钱背墨拓',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
