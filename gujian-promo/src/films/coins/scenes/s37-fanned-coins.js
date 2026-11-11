// s37 — 扇形展开的铜钱. A long string of cash coins bent round into one big ring and fanned open, seen from straight
// above the ring: every coin stands on its rim, so all we see is rim after rim — narrow copper blades that run from
// the outer circle (the arc) down toward the ring's centre like the gills of a mushroom. The arc is the outer limb of
// all those rims, picked out by a thin pale-gold back-light; below it the blades glow furnace-orange on the side that
// faces the key light (upper left) and drop to dark red on the other, with deep black slots between them. Above: black.
//
// Everything under the arc is shaded per pixel in init(): each pixel is mapped to (θ, depth below the arc), assigned to
// a coin, and lit from that coin's own cross-section (filed flat + worn arrises), its position round the rim (a cylinder
// seen from above: grazing at the limb, turning to face the lens further down) and its own tilt, wear and tarnish.
// Coins that lean show a sliver of one face in the slot beside them: the faces turned to the light glow orange, the
// others only catch copper bouncing off copper. Energy → colour goes through one copper ramp, so shadows fall to red
// and highlights rise to pale gold. No inscriptions are visible from this angle and none are drawn.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 56;
const RO = 500;          // coin radius in px (a coin is well over a dozen thicknesses across: its rim is a thin blade)
const PSI = 0.6;         // where round the rim the key light sits (angle from the limb)
const BG = [4, 3, 3];
const ND = 780;          // per-coin tables along the blade: depth −8 … 771 px
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** the string: every coin has its own thickness, wear, tilt, tarnish; they bunch and part, a few lean or sit half a head low */
function makeCoins(a, nA, nB) {
  const r = L.rng('s37-fan');
  const uMax = a.span(PAD + 300) * a.R;
  const out = [];
  let u = -uMax;
  while (u < uMax) {
    const roll = r(), gr = r();
    const t = roll < 0.16 ? r.range(24, 30) : roll < 0.3 ? r.range(44, 54) : r.range(32, 42);
    const gap = gr < 0.26 ? r.range(2, 6) : gr < 0.82 ? r.range(13, 27) : r.range(30, 46);   // touching … parted
    const o = r.chance(0.12) ? r.range(9, 24) : r.chance(0.07) ? -r.range(3, 5) : r.gauss() * 2.2;
    const th = (u + t / 2) / a.R;
    const old = r.chance(0.12);        // a darker, older coin now and then
    // which face the lens catches past the rim: perspective favours the left faces on the right of frame and vice versa; each coin also leans its own way
    const leftFace = r.chance(0.5 + 0.38 * L.clamp(th / 0.4, -1, 1));
    const c = {
      th, t, half: t / 2, o,
      lean: r.chance(0.15) ? r.sign() * r.range(0.018, 0.04) : r.gauss() * 0.005,   // px of sideways drift per px of depth
      ra: (t / 2) * r.range(0.22, 0.55),         // the filed flat of the edge rolls over into worn arrises
      rt: r.range(2.5, 6),                       // … which show in silhouette as the rounded corners of the blade's tip
      slant: r.gauss() * 0.05,
      crown: r.range(0.12, 0.38), crownPx: r.range(0.2, 1.6),
      tilt: r.gauss() * 0.16,          // the whole flat of the edge turned a little toward / away from the light
      pitch: r.gauss() * 0.08,         // … and fore/aft, which slides its highlight up or down the blade
      tone: old ? r.range(0.6, 0.74) : L.clamp(1 + r.gauss() * 0.09, 0.82, 1.2),
      hue: r.range(-1, 1),
      rimW: r.range(4, 8), rimI: r.range(1.0, 1.6),
      spec: r.range(0.3, 1.2),
      zh: -o + r.gauss() * 3,          // how proud the rim stands (decides who shadows whom)
      k: (leftFace ? -1 : 1) * r.range(0.05, 0.2),          // sine of the lean: how wide a sliver of that face shows
      s1: r.range(0, 500), s2: r.range(0, 500),
      wL: new Float32Array(ND), wR: new Float32Array(ND), sp: new Float32Array(ND), nk: new Float32Array(128),
    };
    // a blade's edges are never ruler-straight: it swells and thins a little, wavers, and is nicked where the arris was knocked
    for (let i = 0; i < ND; i++) {
      const d = i - 8, sw = 1.1 * nA.n2(d * 0.004 + c.s2, 9.1);
      c.wL[i] = sw + 0.9 * nA.n2(d * 0.013 + c.s1, 3.7 + c.s2) - 1.8 * sstep(0.7, 0.92, nB.n2(d * 0.045 + c.s2, 3.7 + c.s1));
      c.wR[i] = sw + 0.9 * nA.n2(d * 0.013 + c.s1, 8.3 + c.s2) - 1.8 * sstep(0.7, 0.92, nB.n2(d * 0.045 + c.s2, 8.3 + c.s1));
      c.sp[i] = 0.25 + 0.75 * sstep(-0.2, 0.45, nB.n2(d * 0.04 + c.s1, c.s2));     // the arris highlight comes and goes
    }
    for (let i = 0; i < 128; i++) c.nk[i] = 0.9 * nB.n2((i - 64) * 0.3 + c.s1, c.s2);   // the tip is not cut clean either
    out.push(c);
    u += t + gap;
  }
  return out;
}

function buildFan(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const nA = L.makeNoise('s37a'), nB = L.makeNoise('s37b');
  const coins = makeCoins(a, nA, nB), n = coins.length;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 14;
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  const img = new ImageData(RW, RH), px = img.data;
  const hot = new ImageData(RW, RH), hp = hot.data;      // highlights only → bloom

  // energy → colour: black → dark red → copper orange → bright orange → pale gold
  const NL = 1300, lut = new Float32Array((NL + 1) * 3);
  const ramp = L.makeRamp([[0, '#040303'], [0.07, '#170504'], [0.18, '#410e07'], [0.31, '#6e1a0c'], [0.44, '#ab300e'], [0.58, '#e2591c'],
    [0.7, '#fb742c'], [0.81, '#ff8f45'], [0.92, '#ffb267'], [1.03, '#f8d595'], [1.3, '#fff3d6']]);
  for (let i = 0; i <= NL; i++) { const q = ramp(i / 1000); lut[i * 3] = q[0]; lut[i * 3 + 1] = q[1]; lut[i * 3 + 2] = q[2]; }

  // u (arc length at the arc) → nearest coin
  const Q = 2, uMin = coins[0].th * R - 300, nQ = Math.ceil((coins[n - 1].th * R + 300 - uMin) / Q);
  const near = new Int16Array(nQ);
  for (let q = 0, j = 0; q < nQ; q++) {
    const u = uMin + q * Q;
    while (j < n - 1 && Math.abs(coins[j + 1].th * R - u) < Math.abs(coins[j].th * R - u)) j++;
    near[q] = j;
  }

  for (let jy = 0; jy < RH; jy++) {
    const ddy = cy - (Y0 + jy);
    for (let ix = 0; ix < RW; ix++) {
      const ddx = X0 + ix - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      const o4 = (jy * RW + ix) * 4;
      px[o4 + 3] = 255; hp[o4 + 3] = 255;
      if (d < -8) { px[o4] = BG[0]; px[o4 + 1] = BG[1]; px[o4 + 2] = BG[2]; continue; }
      const th = Math.atan2(ddx, ddy);
      let q = ((th * R - uMin) / Q) | 0; q = q < 0 ? 0 : q >= nQ ? nQ - 1 : q;
      const j0 = near[q];
      let di = (d + 8.5) | 0; di = di >= ND ? ND - 1 : di;
      // which rim covers this pixel, and how far the nearest rims are on either side
      let bar = -1, barX = 0, barHW = 0, barZ = -1e9, sL = 1e9, sR = 1e9, cL = -1, cR = -1;
      for (let k = j0 - 2; k <= j0 + 2; k++) {
        if (k < 0 || k >= n) continue;
        const c = coins[k];
        const x = (th - c.th) * rr - c.lean * d, ax = x < 0 ? -x : x;
        const hw = c.half + (x < 0 ? c.wL[di] : c.wR[di]);
        if (ax < hw + 0.5) { if (c.zh > barZ && d - c.o > -3) { bar = k; barX = x; barHW = hw; barZ = c.zh; } }
        else if (x > 0) { const s = x - hw; if (s < sL) { sL = s; cL = k; } }
        else { const s = -x - hw; if (s < sR) { sR = s; cR = k; } }
      }
      const fade = 1 - 0.7 * sstep(280, 640, d);                       // everything sinks into the dark toward the ring's centre
      const tq = (th + 0.09) / 0.36, pool = 0.78 + 0.34 * Math.exp(-tq * tq);   // the key light pools left of the crest
      const grain = hash2(ix, jy) - 0.5;

      // ── the slot between two rims: black, unless a coin leans and shows a sliver of its face ──
      let cr0 = BG[0], cg0 = BG[1], cb0 = BG[2], hv = 0, li = 0;
      if (d > 0 && cL >= 0 && cR >= 0) {
        const g = sL + sR, open = sstep(1.5, 12, g);
        if (open > 0) for (let side = 0; side < 2; side++) {
          // side 0: the left face of the coin on the right (turned toward the key light → bright orange)
          // side 1: the right face of the coin on the left (lit only by copper bouncing off copper → dark red)
          const c = side ? coins[cL] : coins[cR], s = side ? sL : sR, ak = side ? c.k : -c.k, dc = d - c.o;
          if (ak <= 0 || dc <= 0) continue;
          const sk = s / ak; if (sk >= RO) continue;
          const rt2 = Math.sqrt(RO * RO - sk * sk), dv = dc - (RO - rt2);      // the face's outline is the far half of the coin's ellipse
          if (dv < -0.6) continue;
          const sl = sk / ak / rt2, nd = dv / Math.sqrt(1 + sl * sl), cov = nd + 0.5 < 1 ? nd + 0.5 : 1;
          let kf = Math.cos(Math.acos(Math.max(-1, 1 - dc / RO)) + c.pitch - PSI); kf = kf > 0 ? kf * kf : 0;
          const tex = 1 + 0.2 * nA.n2(s * 0.4 + c.s1, d * 0.012 + c.s2) + 0.1 * nB.n2(ix * 0.3, jy * 0.3) + 0.08 * grain;
          const E = (side ? 0.4 * Math.exp(-s / (3 + 0.3 * g)) : 0.84 * Math.exp(-s / (4 + 0.42 * g))) * open * kf * c.tone * tex * fade * pool;
          li = (E * 1000) | 0; li = (li < 0 ? 0 : li > NL ? NL : li) * 3;
          const rim = Math.exp(-(nd > 0 ? nd : 0) / 3) * 0.7 * c.rimI * Math.exp(-s / (5 + 0.5 * g)) * pool;
          const fr = lut[li] + rim * 250, fg = lut[li + 1] + rim * 205, fb = lut[li + 2] + rim * 128;
          if (fr * cov > cr0) { cr0 += (fr - cr0) * cov; cg0 += (fg - cg0) * cov; cb0 += (fb - cb0) * cov; hv = rim * 0.8 * cov; }
        }
      }

      // ── the rim of a coin ──
      if (bar >= 0) {
        const c = coins[bar], x = barX, ax = x < 0 ? -x : x, half = barHW, xn = x / half;
        let nx = c.tilt + c.crown * xn, drop = c.crownPx * xn * xn + c.slant * x;
        const xa = ax - (half - c.ra);
        if (xa > 0) { const s = xa / c.ra; nx += (x < 0 ? -1 : 1) * (s > 1 ? 1 : s) * 0.92; }
        const xt = ax - (half - c.rt);
        if (xt > 0) { let s = xt / c.rt; s = s > 1 ? 1 : s; drop += c.rt * (1 - Math.sqrt(1 - s * s)); }
        let xi = (x + 64.5) | 0; xi = xi < 0 ? 0 : xi > 127 ? 127 : xi;
        const dp = d - c.o - drop - c.nk[xi];        // depth below this coin's own limb (its silhouette is its cross-section)
        if (dp > -0.5) {
          const cov = (dp + 0.5 < 1 ? dp + 0.5 : 1) * L.clamp(half + 0.5 - ax);
          const dpp = dp < 0 ? 0 : dp;
          // file marks run round the rim → hairlines down the blade; each one throws the highlight a little further or shorter
          const h1 = nA.n2(x * 0.45 + c.s1, d * 0.0035 + c.s2), h2 = nB.n2(x * 0.16 + c.s2, d * 0.006 + c.s1);
          const al = Math.acos(Math.max(-1, 1 - dpp / RO)) + c.pitch;
          let key = Math.cos(al + 0.2 * h1 + 0.16 * h2 - PSI); key = key > 0 ? key * key : 0;
          let lf = 1 - nx; lf = lf < 0.14 ? 0.14 : lf > 1.6 ? 1.6 : lf;
          const mo = nA.fbm(x * 0.02 + c.s1 * 3.1, d * 0.005 + c.s2, 2);                     // slow tarnish: only ever darker and redder
          const ox = sstep(0.3, 0.62, nB.n2(x * 0.045 + c.s2 * 1.9, d * 0.012 + c.s1));       // oxide blooms drawn out along the blade
          const scr = sstep(0.5, 0.82, nB.n2(x * 0.7 + c.s1 * 2.3, d * 0.012 + c.s2 * 1.7));  // a few bright scratches
          const tex = (1 + 0.12 * h1 + 0.08 * h2 + 0.14 * scr - 0.14 * sstep(0.1, 0.6, mo) - 0.12 * ox) * (1 + 0.1 * grain);
          let E = 0.04 + 0.56 * key * fade * lf * pool * c.tone * tex;
          // the arris that faces the light flashes in a broken line
          const e = (nx + 0.6) / 0.2;
          E += 0.3 * Math.exp(-e * e) * sstep(0.12, 0.45, al) * (1 - sstep(0.95, 1.4, al)) * c.spec * c.sp[di] * fade * pool;
          // the key light's mirror image: one hot band round every rim, a little higher or lower on each coin, combed into streaks by the file marks
          const ab = (al + 0.22 * h1 + 0.2 * h2 - 0.8) / 0.12, an = (nx + 0.18) / 0.42;
          E += 0.36 * Math.exp(-ab * ab - an * an) * (0.5 + 0.5 * c.spec) * fade * pool;
          // a prouder neighbour on the light side drops its shadow across this rim
          if (bar > 0) {
            const cl = coins[bar - 1], ls = (cl.zh - c.zh) * 3.2;
            if (ls > 2) { const xl = (th - cl.th) * rr - cl.lean * d - cl.half; E *= 0.38 + 0.62 * sstep(ls - 5, ls + 3, xl); }
          }
          li = (E * 1000) | 0; li = (li < 0 ? 0 : li > NL ? NL : li) * 3;
          let br = lut[li], bg = lut[li + 1] * (1 + 0.06 * c.hue), bb = lut[li + 2] * (1 + 0.05 * c.hue);
          // pale-gold back-light riding the limb
          const rim = Math.exp(-dpp / c.rimW) * c.rimI * (1 - 0.4 * (nx > 0 ? nx : 0)) * (0.8 + 0.25 * h2) * pool;
          br += rim * 250; bg += rim * 205; bb += rim * 128;
          cr0 += (br - cr0) * cov; cg0 += (bg - cg0) * cov; cb0 += (bb - cb0) * cov;
          hv = hv * (1 - cov) + (Math.max(0, E - 0.8) * 1.6 + rim * 1.2) * cov;
        }
      }
      px[o4] = cr0; px[o4 + 1] = cg0; px[o4 + 2] = cb0;
      if (hv > 0) { hp[o4] = cr0 * hv; hp[o4 + 1] = cg0 * hv; hp[o4 + 2] = cb0 * hv; }
    }
  }
  const cnv = L.makeCanvas(RW, RH); cnv.getContext('2d').putImageData(img, 0, 0);
  const hcv = L.makeCanvas(RW, RH); hcv.getContext('2d').putImageData(hot, 0, 0);

  const full = (g) => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  const layer = L.makeLayer(PAD, (g) => { g.fillStyle = `rgb(${BG})`; full(g); g.drawImage(cnv, X0, Y0); });

  // depth of field: sharp round the crest, a touch soft toward the sides, softer again toward the bottom of frame
  const K0 = 'rgba(0,0,0,0)', K1 = 'rgba(0,0,0,1)';
  const side = L.blurred(layer, 2), sg = side.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.linear(sg, 0, 0, side.width, 0, [[0, K1], [0.08, K1], [0.3, K0], [0.7, K0], [0.92, K1], [1, K1]]);
  sg.fillRect(0, 0, side.width, side.height);
  const deep = L.blurred(layer, 4), dg = deep.getContext('2d');
  dg.globalCompositeOperation = 'destination-in';
  dg.fillStyle = L.radial(dg, cx + PAD, cy + PAD, R - 580, R - 350, [[0, K1], [1, K0]]);
  dg.fillRect(0, 0, deep.width, deep.height);
  const lg = layer.getContext('2d');
  lg.drawImage(side, -PAD, -PAD); lg.drawImage(deep, -PAD, -PAD);

  // bloom: the hot arrises and the back-lit limb bleed a little into the lens
  const hl = L.makeLayer(PAD, (g) => { g.fillStyle = '#000'; full(g); g.drawImage(hcv, X0, Y0); });
  lg.globalCompositeOperation = 'screen';
  lg.globalAlpha = 0.7; lg.drawImage(L.blurred(hl, 5), -PAD, -PAD);
  lg.globalAlpha = 0.5; lg.drawImage(L.blurred(hl, 20), -PAD, -PAD);
  lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
  return layer;
}

export default {
  name: '扇形展开的铜钱',
  tone: 'light',
  init(env) {
    S = { fan: buildFan(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.003, 0.003, p), zoom = L.lerp(1.0, 1.012, p);
    L.blit(ctx, env, S.fan, { rot, zoom, dy: 1.2 * p });
    // the key light's sheen travels down the blades
    ctx.save(); a.clipBelow(ctx, 2); ctx.globalCompositeOperation = 'color-dodge';
    const c = L.lerp(60, 170, p), w = 110, r0 = a.R - c - w, r1 = a.R - c + w;
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, r0, r1, [[0, 'rgba(255,150,70,0)'], [0.5, 'rgba(255,160,80,0.3)'], [1, 'rgba(255,150,70,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};
