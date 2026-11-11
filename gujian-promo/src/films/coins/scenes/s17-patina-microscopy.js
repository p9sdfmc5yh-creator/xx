// s17 — 锈色显微. The corrosion crust of a bronze coin under the stereo microscope, pushed to pure pigment:
//   below the arc  → malachite (石绿): a bright, flat crust of granules and botryoidal knobs, mottled with yellow-green
//   on the arc     → a hair-thin seam of cuprite vermilion (朱) between the two crusts
//   above the arc  → azurite (石青): big deep-blue blades slanting down to the right like the barbs of a feather, cuprite red and
//                    purple-black showing in the slits; the blades fuse into one calm blue face above the crest (tagline zone)
// Both crusts are built once in init() as a height field + pigment colour per pixel, lit by one raking light from the upper
// right, then given a shallow depth of field (focus on the crest of the arc). The seam is a third, static layer drawn at exact
// pixel coverage, so the shared arc stays razor-clean in every frame while the two crusts slide against each other under it.
// The sparkle is not an overlay either: draw() lets a handful of the crusts' own highlights flare for a frame each.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 48;          // the two layers only slide ~±14 px along the arc; the rest is room for the blur
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** integer lattice hash → [0,1) */
const hsh = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// the one light of the shot: low, from the upper right (unit vector surface → light), and its half-vector with the viewer
const LX = 0.52, LY = -0.62, LZ = 0.59;
const HN = Math.hypot(LX, LY, LZ + 1), HX = LX / HN, HY = LY / HN, HZ = (LZ + 1) / HN;

// ── allocation-free worley noise: squared distances in cD1/cD2, cell id in cId, vector pixel→feature in cDx/cDy ──
let cD1 = 0, cD2 = 0, cId = 0, cDx = 0, cDy = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 4095) / 4095; bx = dx; by = dy; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = id; cDx = bx; cDy = by;
}

// ── a crust of rounded lumps: the union of paraboloid caps of random radius, one per lattice cell ──
// lV = cap value of the winning lump (1 at its top, 0 at its rim, < 0 outside every lump; -9 if there is none),
// lV2 = runner-up (lV - lV2 small → the crease between two lumps), lId / lR / lDx,lDy = id, radius, vector pixel→centre;
// lId2 / lDx2,lDy2 = the same for the runner-up (so the border between two touching lumps can be antialiased).
// pres < 1 thins the lumps out (only cells with a low id survive, and they shrink before they vanish).
let lV = 0, lV2 = 0, lId = 0, lId2 = 0, lR = 1, lDx = 0, lDy = 0, lDx2 = 0, lDy2 = 0;
function lumps(x, y, rMin, rVar, pres) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let b1 = -9, b2 = -9, id = 0, id2 = 0, bx = 0, by = 0, bx2 = 0, by2 = 0, br = 1;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const cid = ((h >>> 20) & 4095) * 0.0002442;
    let r = rMin + rVar * ((h >>> 6) & 255) * 0.003922;
    if (pres < 1) { let amp = (pres * 1.3 - cid) * 3.3333; if (amp <= 0) continue; if (amp > 1) amp = 1; r *= 0.55 + 0.45 * amp; }
    const dx = cx + (h & 1023) * 0.0009775 - x, dy = cy + ((h >>> 10) & 1023) * 0.0009775 - y;
    const v = 1 - (dx * dx + dy * dy) / (r * r);
    if (v > b1) { b2 = b1; id2 = id; bx2 = bx; by2 = by; b1 = v; id = cid; bx = dx; by = dy; br = r; }
    else if (v > b2) { b2 = v; id2 = cid; bx2 = dx; by2 = dy; }
  }
  lV = b1; lV2 = b2; lId = id; lId2 = id2; lR = br; lDx = bx; lDy = by; lDx2 = bx2; lDy2 = by2;
}

// slow fields on a coarse grid, bilinear-sampled per pixel
function coarse(X0, Y0, w, h, CS, fn) {
  const cw = Math.ceil(w / CS) + 2, ch = Math.ceil(h / CS) + 2, a = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) a[j * cw + i] = fn(X0 + i * CS, Y0 + j * CS);
  return { a, cw, CS };
}
function bil(f, i, j) {
  const fx = i / f.CS, fy = j / f.CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * f.cw + i0, a = f.a;
  const a0 = a[k], a1 = a[k + 1], b0 = a[k + f.cw], b1 = a[k + f.cw + 1];
  return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
}
/** a table of random steps, read with linear interpolation: the cross-section of a bundle of fibres / growth lines */
function fibreTable(seed) {
  const t = new Float32Array(1025), r = L.rng(seed);
  for (let n = 0; n < 1024; n++) t[n] = r() * 2 - 1;
  t[1024] = t[0];
  return t;
}

/**
 * Light a pigment-colour image in place from its height field.
 * hB = height (px), sB = occlusion / cast shadow / falloff multiplier, gB = gloss (0..1).
 * Shadows sink toward the ambient colour (never dead black); highlights push the pigment up and let the clipped channel
 * spill into the others, so a lit blue goes azure-white and a lit green goes mint instead of grey.
 * Nothing random happens here: every bit of texture in the result is relief that was put into the height field.
 */
function relight(d, hB, sB, gB, RW, RH, o) {
  const { kd, amb, spec, pw } = o;
  for (let j = 1; j < RH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const p = j * RW + i, q = p * 4;
      if (d[q + 3] === 0) continue;
      const hx = (hB[p + 1] - hB[p - 1]) * 0.5, hy = (hB[p + RW] - hB[p - RW]) * 0.5;
      const inv = 1 / Math.sqrt(1 + hx * hx + hy * hy);
      let lum = 1 + kd * ((-hx * LX - hy * LY + LZ) * inv / LZ - 1);
      if (lum < 0) lum = 0;
      lum *= sB[p];
      let r = d[q], g = d[q + 1], b = d[q + 2];
      if (lum <= 1) {
        const k = 1 - lum;
        r = r * lum + amb[0] * k; g = g * lum + amb[1] * k; b = b * lum + amb[2] * k;
      } else {
        r *= lum; g *= lum; b *= lum;
        let ov = 0;
        if (r > 255) { ov += r - 255; r = 255; }
        if (g > 255) { ov += g - 255; g = 255; }
        if (b > 255) { ov += b - 255; b = 255; }
        if (ov > 0) { ov *= 0.45; r += ov; g += ov; b += ov; }
      }
      const gl = gB[p];
      if (gl > 0.01) {
        const nh = (-hx * HX - hy * HY + HZ) * inv;
        if (nh > 0.93) { const s = Math.pow(nh, pw) * gl * sB[p]; r += spec[0] * s; g += spec[1] * s; b += spec[2] * s; }
      }
      d[q] = r; d[q + 1] = g; d[q + 2] = b;
    }
  }
}

// focus sits on the crest of the arc; this is how far (in "focus radii") a frame point is from it
const FOC = { rx: 700, ry: 330, dy: 24 };

/** one horizontal + one vertical box-blur pass of radius r over a w×h float plane (edges clamped); src is overwritten, tmp is scratch */
function boxBlur(src, tmp, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let j = 0; j < h; j++) {
    const o = j * w;
    let acc = src[o] * (r + 1);
    for (let i = 1; i <= r; i++) acc += src[o + (i < w ? i : w - 1)];
    for (let i = 0; i < w; i++) {
      tmp[o + i] = acc * inv;
      const ia = i + r + 1, ib = i - r;
      acc += src[o + (ia < w ? ia : w - 1)] - src[o + (ib > 0 ? ib : 0)];
    }
  }
  for (let i = 0; i < w; i++) {
    let acc = tmp[i] * (r + 1);
    for (let j = 1; j <= r; j++) acc += tmp[(j < h ? j : h - 1) * w + i];
    for (let j = 0; j < h; j++) {
      src[j * w + i] = acc * inv;
      const ja = j + r + 1, jb = j - r;
      acc += tmp[(ja < h ? ja : h - 1) * w + i] - tmp[(jb > 0 ? jb : 0) * w + i];
    }
  }
}

/**
 * Shallow depth of field, done the way a lens does it: in linear light. Progressively blurred copies (half size — nobody can
 * tell, and it is four times cheaper) are laid over the sharp layer away from the focus; because the blur averages light and
 * not pigment values, out-of-focus highlights swell and stay bright instead of going muddy. Three box passes make each blur a
 * near-gaussian. The arc edge itself is kept out of it and stays crisp. img = the lit layer as ImageData.
 */
function depthOfField(env, img, X0, Y0) {
  const a = env.arc, w = img.width, h = img.height, hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), n = hw * hh, d = img.data;
  const out = L.makeCanvas(w, h), g = out.getContext('2d');
  g.putImageData(img, 0, 0);
  // half-size copy in linear light (value², near enough), weighted by coverage so the transparent side of an edge adds nothing
  const P = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let j = 0; j < hh; j++) {
    const ja = j * 2, jb = ja + 1 < h ? ja + 1 : ja;
    for (let i = 0; i < hw; i++) {
      const ia = i * 2, ib = ia + 1 < w ? ia + 1 : ia;
      let r = 0, gg = 0, b = 0, al = 0;
      for (let k = 0; k < 4; k++) {
        const q = ((k < 2 ? ja : jb) * w + (k & 1 ? ib : ia)) * 4, aa = d[q + 3];
        r += d[q] * d[q] * aa; gg += d[q + 1] * d[q + 1] * aa; b += d[q + 2] * d[q + 2] * aa; al += aa;
      }
      const p = j * hw + i;
      P[0][p] = r; P[1][p] = gg; P[2][p] = b; P[3][p] = al;
    }
  }
  // a soft ribbon along the arc that the blur is kept out of: the shared edge must stay exact
  const rib = L.makeCanvas(hw, hh), rgx = rib.getContext('2d');
  rgx.scale(0.5, 0.5); rgx.translate(-X0, -Y0); rgx.filter = 'blur(5px)'; rgx.strokeStyle = '#000'; rgx.lineWidth = 40; a.stroke(rgx, 0); rgx.filter = 'none';
  const tmp = L.makeCanvas(hw, hh), tg = tmp.getContext('2d');
  const Q = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)], scr = new Float32Array(n);
  const lvl = new ImageData(hw, hh), ld = lvl.data;
  // [box radii (≈ gaussian σ 0 / 2.2 / 4.5 half-size px), where the copy starts to show, where it is fully in] (focus radii)
  for (const [radii, e0, e1] of [[[], 0.9, 1.3], [[1, 2, 2], 1.25, 1.75], [[4, 4, 4], 1.7, 2.5]]) {
    for (let c = 0; c < 4; c++) { Q[c].set(P[c]); for (const r of radii) boxBlur(Q[c], scr, hw, hh, r); }
    for (let p = 0, q = 0; p < n; p++, q += 4) {
      const al = Q[3][p];
      if (al > 0.5) { ld[q] = Math.sqrt(Q[0][p] / al); ld[q + 1] = Math.sqrt(Q[1][p] / al); ld[q + 2] = Math.sqrt(Q[2][p] / al); ld[q + 3] = al * 0.25; }
      else ld[q + 3] = 0;
    }
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'source-over';
    tg.putImageData(lvl, 0, 0);
    tg.globalCompositeOperation = 'destination-in';
    tg.setTransform(FOC.rx / 2, 0, 0, FOC.ry / 2, (a.cx - X0) / 2, (a.crestY + FOC.dy - Y0) / 2);
    const grd = tg.createRadialGradient(0, 0, e0, 0, 0, e1);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
    tg.fillStyle = grd; tg.fillRect(-9, -9, 18, 18);
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'destination-out';
    tg.drawImage(rib, 0, 0);
    g.drawImage(tmp, 0, 0, hw * 2, hh * 2);
  }
  return out;
}

// a 256² tile of fine noise, sampled per pixel for the micro surface (cheaper than simplex in the inner loops)
function microTile(seed, sc) {
  const n = L.makeNoise(seed), t = new Float32Array(65536);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) t[(j << 8) | i] = n.n2(i / sc, j / sc);
  return t;
}

/** how strongly the feather structure shows at a frame point: 0 in the calm window above the crest → 1 toward the sides */
function featherMask(a, x, y, wob) {
  const ex = (x - a.cx) / 480, ey = (y - (a.crestY - 150)) / 350;
  return sstep(0.8, 1.5, Math.sqrt(ex * ex + ey * ey) + 0.22 * wob);
}

/**
 * The sparkle of the shot is made of its own highlights. Pick sites on real lit facets of a finished layer (after the depth of
 * field, so far ones are already soft) and cut a round, soft-edged patch of just the bright pixels around each into an atlas.
 * draw() adds a random handful of them back every frame: a blade edge or a granule facet flares for one frame in its true shape.
 * measure(d, o) says how "highlight" a pixel is; the thresholds are taken from the layer's own distribution.
 */
function flares(cnv, X0, Y0, rg, o) {
  const { count, T, measure, tint, accept } = o;
  const w = cnv.width, h = cnv.height, d = cnv.getContext('2d').getImageData(0, 0, w, h).data;
  const hist = new Uint32Array(256);
  let tot = 0;
  for (let y = 3; y < h; y += 7) for (let x = 3; x < w; x += 7) {
    const q = (y * w + x) * 4;
    if (d[q + 3] < 255) continue;
    const v = measure(d, q); hist[v < 0 ? 0 : v > 255 ? 255 : v | 0]++; tot++;
  }
  const pct = (f) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= tot * f) return v; } return 255; };
  const m0 = pct(o.p0), m1 = Math.max(m0 + 24, pct(o.p1));
  const sites = [], hT = T / 2;
  for (let n = 0; n < count * 40 && sites.length < count; n++) {
    const x0 = rg.int(T, w - T - 1), y0 = rg.int(T, h - T - 1);
    let best = -1, bx = x0, by = y0;
    for (let dy = -9; dy <= 9; dy += 3) for (let dx = -9; dx <= 9; dx += 3) {
      const q = ((y0 + dy) * w + x0 + dx) * 4;
      if (d[q + 3] < 255) continue;
      const v = measure(d, q);
      if (v > best) { best = v; bx = x0 + dx; by = y0 + dy; }
    }
    if (best < m0 + 0.5 * (m1 - m0)) continue;
    if (accept && !accept(bx + X0, by + Y0)) continue;
    let ok = true;
    for (let s = 0; s < sites.length; s++) { const q = sites[s]; if (Math.abs(q.px - bx) < T * 0.55 && Math.abs(q.py - by) < T * 0.55) { ok = false; break; } }
    if (ok) sites.push({ px: bx, py: by });
  }
  const cols = 16, at = L.makeCanvas(cols * T, Math.max(1, Math.ceil(sites.length / cols)) * T), ag = at.getContext('2d');
  const img = ag.createImageData(at.width, at.height), ad = img.data;
  sites.forEach((s, k) => {
    const ox = (k % cols) * T, oy = Math.floor(k / cols) * T;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const rx = (i + 0.5 - hT) / hT, ry = (j + 0.5 - hT) / hT, r2 = rx * rx + ry * ry;
      if (r2 >= 1) continue;
      const q = ((s.py - hT + j) * w + s.px - hT + i) * 4;
      const al = clamp01((measure(d, q) - m0) / (m1 - m0)) * (1 - r2) * (1 - r2) * (d[q + 3] / 255);
      const t = ((oy + j) * at.width + ox + i) * 4;
      ad[t] = tint[0]; ad[t + 1] = tint[1]; ad[t + 2] = tint[2]; ad[t + 3] = 255 * al;
    }
    s.ax = ox; s.ay = oy; s.x = s.px + X0 - hT; s.y = s.py + Y0 - hT;
  });
  ag.putImageData(img, 0, 0);
  return { atlas: at, sites, T };
}

/** let a different handful of highlights flare each frame (call inside the layer's camera transform) */
function flare(ctx, F, fr, salt, rate, gain) {
  const T = F.T, s = F.sites;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < s.length; i++) {
    const tw = hsh(i, fr * salt + 1);
    if (tw > rate) continue;
    ctx.globalAlpha = gain * (0.35 + 0.65 * (1 - tw / rate));
    ctx.drawImage(F.atlas, s[i].ax, s[i].ay, T, T, s[i].x, s[i].y, T, T);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// ───────────────────────── azurite (above the arc) ─────────────────────────
function buildUpper(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = -PAD;
  const RW = W + PAD * 2, RH = Math.ceil(a.yAt(-PAD)) + 36 - Y0;
  const nA = L.makeNoise('s17u1'), nB = L.makeNoise('s17u2');
  const CS = 8;
  const fWarp = coarse(X0, Y0, RW, RH, CS, (x, y) => nA.fbm(x / 620, y / 620, 3));
  const fQ = coarse(X0, Y0, RW, RH, CS, (x, y) => nB.fbm(x / 310 + 9, y / 310, 3));
  const fGap = coarse(X0, Y0, RW, RH, CS, (x, y) => nA.fbm(x / 260 - 40, y / 260 + 17, 3));
  const fHue = coarse(X0, Y0, RW, RH, CS, (x, y) => nB.fbm(x / 540, y / 540 + 90, 3));
  const fBev = coarse(X0, Y0, RW, RH, CS, (x, y) => nA.fbm(x / 120 + 71, y / 120 - 33, 2));   // how the sheen pools along a blade
  const MT = microTile('s17micro', 2.9);
  const SR = fibreTable('s17stri');

  // the "feather": long shafts (羽轴) running slightly up to the right, big blades (羽枝) between them slanting down to the right.
  // each band between two shafts gets its own blade angle / pitch / curl so neighbouring bands never line up.
  const SP = 214, B0 = -8, NB = 22;
  const bSin = new Float32Array(NB), bCos = new Float32Array(NB), bP = new Float32Array(NB), bOff = new Float32Array(NB), bCurve = new Float32Array(NB);
  for (let b = 0; b < NB; b++) {
    const bi = b + B0, h1 = hsh(bi, 17), h2 = hsh(bi, 91), h3 = hsh(bi, 233);
    const phi = ((bi & 1) ? 0.98 : 0.62) + (h1 - 0.5) * 0.2;
    bSin[b] = Math.sin(phi); bCos[b] = Math.cos(phi);
    bP[b] = 84 + 44 * h2; bOff[b] = h3 * 11; bCurve[b] = ((bi & 1) ? 1 : -1) * (0.35 + 0.5 * h1);
  }

  const img = new ImageData(RW, RH), d = img.data, NPX = RW * RH;
  const hB = new Float32Array(NPX), sB = new Float32Array(NPX), gB = new Float32Array(NPX);
  const rIn2 = (R - 30) * (R - 30), rAO2 = (R + 64) * (R + 64);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, rr2 = ddx * ddx + ddy * ddy;
      if (rr2 < rIn2) continue;      // hidden under the malachite
      const wv = bil(fWarp, i, j);
      const m = featherMask(a, x, y, wv), k = 0.05 + 0.95 * m, vary = 0.3 + 0.7 * m;
      let w = (y - 0.11 * (x - 960) + 30 * wv) / SP + 0.37;
      w += 0.17 * Math.sin(w * 2.1 + 1);               // uneven band heights
      const bi = Math.floor(w), t = w - bi, b = bi - B0;
      const tc = t - 0.5, pinS = Math.sqrt(4 * t * (1 - t)), P = bP[b];
      const along = x * bCos[b] + y * bSin[b];
      let q = (-x * bSin[b] + y * bCos[b]) / P + bCurve[b] * tc * tc + 0.12 * bil(fQ, i, j) + bOff[b];
      q += (1.7 / P) * nB.n2(along / 36, q * 0.7 + bi * 9.1);                // crystal edges are never ruler-straight
      const si = Math.floor(q), f = q - si;
      const hs = hsh(si, bi * 57 + 3), hs2 = hsh(si, bi * 131 + 71), hs3 = hsh(si, bi * 211 + 19);
      let gw = 0.2 + 0.2 * hs + 0.24 * bil(fGap, i, j);
      gw = (gw < 0.1 ? 0.1 : gw > 0.44 ? 0.44 : gw) * (0.2 + 0.8 * pinS) * m;   // slit width: lens-shaped, pinched at the shafts
      const gapPx = gw * P, Wb = P - gapPx, xb = f * P;
      // each blade is broken along its length into cleavage segments, every one a slightly different pair of facets.
      // a cleavage crack is neither ruler-straight nor square to the blade: it leans a little and wanders as it crosses
      const segLen = P * (1.1 + 1.9 * hs2);
      const cwv = xb * 0.1 + hs * 61, cwi = cwv | 0, cwk = cwi & 1023, cwu = xb * 0.031 + hs * 17, cui = cwu | 0, cuk = cui & 1023;
      const wob = SR[cwk] + (SR[cwk + 1] - SR[cwk]) * (cwv - cwi), wob2 = SR[cuk] + (SR[cuk + 1] - SR[cuk]) * (cwu - cui);
      const sl = (along + (hs3 - 0.5) * 0.7 * xb + 2.6 * wob + 5 * wob2) / segLen + hs * 13, ai = Math.floor(sl), af = sl - ai;
      let hseg = hsh(ai, si * 31 + bi * 7), hseg2 = hsh(ai, si * 17 + bi * 29 + 5), hseg3 = hsh(ai, si * 7 + bi * 3 + 11);
      let tilt = (af - 0.5) * (hseg - 0.5);
      const afPx = af * segLen;
      let bwSeg = hseg2;
      if (afPx < 18) {
        // just past a crack. The bevel's width eases from the previous segment's over a longer run (a ribbon of light never
        // ends square) …
        const pB = hsh(ai - 1, si * 17 + bi * 29 + 5);
        bwSeg = pB + (hseg2 - pB) * sstep(0, 18, afPx);
        if (afPx < 3.4) {
          // … and the facets themselves ease over three pixels, so the step is a lit / shaded little cliff with a soft foot
          // instead of a one-pixel hairline
          const wq = sstep(0, 3.4, afPx), pA = hsh(ai - 1, si * 31 + bi * 7), pC = hsh(ai - 1, si * 7 + bi * 3 + 11);
          tilt = (af + 0.5) * (pA - 0.5) * (1 - wq) + tilt * wq;
          hseg = pA + (hseg - pA) * wq; hseg2 = pB + (hseg2 - pB) * wq; hseg3 = pC + (hseg3 - pC) * wq;
        }
      }
      const bv = bil(fBev, i, j);
      const Hb = (11 + 10 * hs3) * (0.3 + 0.7 * pinS) * k * (1 + 0.4 * (hseg - 0.5) * vary);
      let bw = (5 + 11 * bwSeg) * (1 + 0.32 * bv * vary); if (bw > Wb * 0.45) bw = Wb * 0.45;       // the bevel that faces the light
      const back = 0.36 + (0.95 * hseg3 - 0.48) * vary;                    // how far the main facet falls away behind it
      const xc = xb < Wb ? xb : Wb;
      let h = xc < bw ? Hb * xc / bw : Hb * (1 - back * (xc - bw) / (Wb - bw));
      const hEdge = Hb * (1 - back);
      if (m < 0.98) h *= 1 - sstep(Wb - 16 * (1 - m), Wb, xc);            // in the calm face the blades melt into each other
      h += tilt * segLen * (0.03 + 0.04 * (wob2 + 1)) * k * m;              // cleavage steps, deeper at one end of a crack than the other
      // growth striations, dead parallel to the blade: some facets silky, some glass-smooth
      const c1 = q * 15 + along * 0.004 + hs * 37 + 4096, c2 = q * 38 - along * 0.007 + hs * 11 + 8192;
      const i1 = c1 | 0, i2 = c2 | 0, k1 = i1 & 1023, k2 = i2 & 1023;
      const stri = SR[k1] + (SR[k1 + 1] - SR[k1]) * (c1 - i1), stri2 = SR[k2] + (SR[k2 + 1] - SR[k2]) * (c2 - i2);
      h += (0.34 + 0.66 * k * hseg2) * (0.55 * stri + 0.4 * stri2);
      const tone = 1 + (0.24 * (hs - 0.5) + 0.12 * (hseg - 0.5)) * k;
      let cr = 27 * tone, cg = 72 * tone, cb = 176 * tone, sh = 1, gloss = 0.85;
      // the lit bevel is a mirror for the lamp, not a flat ribbon: its sheen pools and thins along the blade, and the growth
      // lines show in it as fine darker threads
      if (xc < bw + 1.2 && m > 0.03) {
        const wbv = (1 - sstep(bw - 1.2, bw + 1.2, xc)) * sstep(0.03, 0.3, m);
        sh += ((1.0 + 0.2 * bv) * (1 - 0.09 * (stri2 + 1) - 0.05 * (stri + 1)) - 1) * wbv;
      }

      // the slit between two blades: a druse of tiny cuprite crystals on the floor, purple-black in the shadow of the blade
      // that overhangs it
      if (gapPx > 0.5 && xb > Wb - 0.7) {
        let bg = sstep(Wb - 0.7, Wb + 0.7, xb) * (1 - sstep(P - 1.4, P, xb));
        if (gapPx < 2) bg *= gapPx / 2;
        const gp = xb - Wb;
        // cuprite grows as octahedra: the floor of a slit is a druse of their tips — little square pyramids, each its own size
        // and turned its own way, so every face takes the lamp differently — with bare, deeper crimson floor between them.
        // every slit has its own grain: fine sugar in one, a few fat crystals in the next
        const ds = 7.6 + 6.4 * hs2;
        cell(x / ds + si * 3.7, y / ds + bi * 1.9);
        const an = cId * 19.7, cc = Math.cos(an), ss = Math.sin(an), szr = (cId * 13.7) % 1;
        const ux = Math.abs(cDx * cc + cDy * ss), uy = Math.abs(cDy * cc - cDx * ss);
        const pyr = szr < 0.3 ? -1 : 1 - (ux > uy ? ux : uy) / (0.2 + 0.52 * (szr - 0.3) * (szr - 0.3) * 2.04 + 0.16 * szr);
        const on = sstep(0, 0.16, pyr), gv = 0.9 + 0.2 * ((cId * 7.1) % 1);
        const bump = pyr > 0 ? pyr * (0.5 + 1.3 * ((cId * 29.3) % 1)) * (ds / 8.6) : 0;
        let gr = 150 + (229 * gv - 150) * on, gG = 30 + (54 * gv - 30) * on, gb = 26 + (30 * gv - 26) * on;
        if (cId > 0.92) { gr += (252 - gr) * on; gG += (100 - gG) * on; gb += (50 - gb) * on; }          // a few thin, glowing ones
        const Ls = 1.25 * (hEdge > 0 ? hEdge : 0) + 2.5;
        let shd = 0.1 + 0.9 * sstep(Ls * 0.5, Ls * 1.15, gp);
        if (hs3 < 0.23) shd *= cId > 0.8 ? 0.75 : 0.22;                 // some slits stay almost entirely purple-black, a few red embers
        if (gp > 0) { const wall = sstep(0, 2.4 + 12 * (1 - m), gp); h += ((bump > 0 ? bump * 2.1 : 0) - h) * wall; }
        cr += (gr - cr) * bg; cg += (gG - cg) * bg; cb += (gb - cb) * bg;
        sh += (shd - 1) * bg; gloss += (0.3 - gloss) * bg;
      }

      // the shaft: a raised spine catching the light, with a cuprite / purple-black seam hugging its underside
      const sd = (t < 0.5 ? t : t - 1) * SP;          // px from the nearest shaft line, < 0 above it
      if (sd > -8 && sd < 15) {
        const sn = nB.n2(x / 38, bi * 5.3);
        const rg = 1 - Math.abs(sd + 2.6) / 5.2;
        if (rg > 0) { h += 7 * m * rg * (1 + 0.25 * sn); cr += (44 - cr) * rg * 0.6 * m; cg += (104 - cg) * rg * 0.6 * m; cb += (214 - cb) * rg * 0.6 * m; }
        const sw = (sd - 2) / (0.9 + 0.9 * (0.5 + 0.5 * nA.n2(x / 85, bi * 3.1 - 4)));      // the seam swells and thins along its length
        const uk = sstep(1.8, 3.2, sd) * (1 - sstep(4.2, 6.6, sw)) * m;
        if (uk > 0) {
          const red = sstep(-0.3, 0.0, nA.n2(x / 130, bi * 7.7 + 2)), tex = 1 + 0.14 * sn;
          cr += (229 * tex - cr) * uk; cg += (54 * tex - cg) * uk; cb += (30 * tex - cb) * uk;
          sh += ((0.2 + 0.8 * red) - sh) * uk; h -= h * uk; gloss += (0.12 - gloss) * uk;
        }
      }

      // the crust below stands proud of this one: a soft occlusion shadow along the seam
      if (rr2 < rAO2) sh *= 0.8 + 0.2 * sstep(4, 60, Math.sqrt(rr2) - R);
      // slow hue drift (ultramarine ↔ cobalt), illumination falloff, a breath of surface tooth
      const hv = bil(fHue, i, j);
      const dx0 = x - 960, dy0 = y - 330;
      sh *= 1.05 - 0.17 * sstep(420, 1250, Math.sqrt(dx0 * dx0 + dy0 * dy0));
      h += 0.16 * MT[((y & 255) << 8) | (x & 255)];
      const p = j * RW + i, o = p * 4;
      d[o] = cr * (1 + 0.5 * hv); d[o + 1] = cg * (1 - 0.2 * hv); d[o + 2] = cb; d[o + 3] = 255;
      hB[p] = h; sB[p] = sh; gB[p] = gloss;
    }
  }

  relight(d, hB, sB, gB, RW, RH, { kd: 0.92, amb: [24, 13, 56], spec: [190, 215, 255], pw: 46 });
  const cnv = depthOfField(env, img, X0, Y0);
  const fl = flares(cnv, X0, Y0, L.rng('s17glintU'), {
    count: 150, T: 48, p0: 0.955, p1: 0.997, tint: [222, 238, 255],
    measure: (dd, q) => dd[q + 1] - 0.35 * dd[q],                          // pale = lit crystal; keeps the red slits out
    accept: (x, y) => featherMask(a, x, y, 0) > 0.5 && y < a.yAt(x) - 30,
  });
  return { cnv, X0, Y0, fl };
}

// one clean pigment colour per granule → gcR/gcG/gcB, gloss in gcGl. tm = slow green ↔ teal drift, yel = how yellow the drift
// of lichen-like 明黄绿 is at the granule's own centre
let gcR = 0, gcG = 0, gcB = 0, gcGl = 0;
function grainCol(id, tm, yel) {
  const j1 = (id * 7.31) % 1, j2 = (id * 23.17) % 1;
  let r, g, b, gl = 0.2;
  if (id > 0.975) { r = 18; g = 150; b = 108; }                                 // now and then a deeper one …
  else if (id > 0.93) { r = 124; g = 238; b = 190; gl = 0.7; }                  // … or a pale, glassy one
  else { const kk = 0.95 + 0.2 * j1; r = (58 - 38 * tm) * kk; g = (204 + 4 * tm) * kk; b = (132 + 54 * tm) * kk; }
  const yk = sstep(-0.05, 0.05, 0.04 + 0.78 * yel - j2);
  if (yk > 0) { const kk = 0.86 + 0.16 * j1; r += (200 * kk - r) * yk; g += (224 * kk - g) * yk; b += (74 * kk - b) * yk; }
  gcR = r; gcG = g; gcB = b; gcGl = gl;
}

// ───────────────────────── malachite (below the arc) ─────────────────────────
function buildLower(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 26;
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  const nA = L.makeNoise('s17l1'), nB = L.makeNoise('s17l2');
  const CS = 8;
  const fTone = coarse(X0, Y0, RW, RH, CS, (x, y) => nA.fbm(x / 430, y / 430, 3));
  const fYel = coarse(X0, Y0, RW, RH, CS, (x, y) => 0.6 * nA.fbm(x / 210 + 30, y / 210 - 12, 3) + 0.4 * nB.fbm(x / 62 + 3, y / 62 + 8, 2));
  const fBot = coarse(X0, Y0, RW, RH, CS, (x, y) => nB.fbm(x / 250 - 7, y / 250 + 44, 3));
  const fPack = coarse(X0, Y0, RW, RH, CS, (x, y) => nA.fbm(x / 170 - 55, y / 170 + 21, 2));
  const fWx = coarse(X0, Y0, RW, RH, CS, (x, y) => nB.n2(x / 70 + 5, y / 70));
  const fWy = coarse(X0, Y0, RW, RH, CS, (x, y) => nB.n2(x / 70 - 31, y / 70 + 19));
  const GS = 19, BS = 54;                 // granule / botryoidal knob lattice sizes (px)
  const MT = microTile('s17grit', 2.6);
  const SF = fibreTable('s17fibre');
  const img = new ImageData(RW, RH), d = img.data, NPX = RW * RH;
  const hB = new Float32Array(NPX), sB = new Float32Array(NPX), gB = new Float32Array(NPX);
  const EDGE = -0.3;                      // dr at which the crust stops; its last pixel lies under the vermilion of the seam layer
  const rOut2 = (R + EDGE + 0.5) * (R + EDGE + 0.5);
  const lx0 = 1160, ly0 = a.crestY + 60;
  const iMax = RW - 1, jMax = RH - 1;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, rr2 = ddx * ddx + ddy * ddy;
      if (rr2 >= rOut2) continue;
      const dr = Math.sqrt(rr2) - R, u = dr - EDGE;        // u < 0 inside the crust
      const wx = bil(fWx, i, j), wy = bil(fWy, i, j);
      lumps(x / GS + wx * 0.5, y / GS + wy * 0.5, 0.5 + 0.22 * bil(fPack, i, j), 0.42, 1);
      const gv = lV, gv2 = lV2, gid = lId, gR = lR, gdx = lDx, gdy = lDy, eb = gv - gv2;
      const tn = bil(fTone, i, j), tm = clamp01(0.5 + tn * 1.3);                 // slow drift green ↔ teal
      // every granule is one clean pigment colour — 石绿, or whole drifts of them turned 明黄绿 the way lichen mottles a rock —
      // decided at the granule's own centre, so no colour boundary ever cuts through a grain
      let ic = i + gdx * GS, jc = j + gdy * GS;
      ic = ic < 0 ? 0 : ic > iMax ? iMax : ic; jc = jc < 0 ? 0 : jc > jMax ? jMax : jc;
      grainCol(gid, tm, sstep(0.0, 0.34, bil(fYel, ic, jc)));
      let cr = gcR, cg = gcG, cb = gcB, gloss = gcGl;
      if (eb < 0.1 && gv2 > -0.06) {
        // where two grains touch, cross-fade their colours over one pixel instead of switching
        let i2 = i + lDx2 * GS, j2 = j + lDy2 * GS;
        i2 = i2 < 0 ? 0 : i2 > iMax ? iMax : i2; j2 = j2 < 0 ? 0 : j2 > jMax ? jMax : j2;
        grainCol(lId2, tm, sstep(0.0, 0.34, bil(fYel, i2, j2)));
        const wq = 0.5 * (1 - eb * 10) * sstep(-0.06, 0.04, gv2);
        cr += (gcR - cr) * wq; cg += (gcG - cg) * wq; cb += (gcB - cb) * wq; gloss += (gcGl - gloss) * wq;
      }
      // … and its own little crystal: most are rounded, a few are flat-topped chips, and each leans its own way, so the
      // lamp finds some faces and misses others
      const j1 = (gid * 7.31) % 1, j3 = (gid * 41.77) % 1, j4 = (gid * 89.3) % 1;
      const g1 = gv > 0 ? gv : 0;
      let cap;
      if (j3 < 0.18) { const tt = g1 * 1.7; cap = 0.9 * (tt >= 1 ? 1 : tt * (2 - tt)); gloss += 0.25; }
      else cap = 0.6 * g1 + 0.4 * g1 * g1;
      let h = 0.3 * gR * GS * cap * (0.7 + 0.6 * j1);
      const lean = 0.2 * ((j3 * 3.7) % 1) * GS * sstep(0, 0.3, g1), la = j4 * 6.2832;
      h -= lean * (gdx * Math.cos(la) + gdy * Math.sin(la));
      // two grains in five are little bundles of fibres (malachite's habit): fine parallel growth lines, each grain its own way
      const j5 = (gid * 173.3) % 1;
      let silk = 0;
      if (j5 < 0.4) {
        const fa = j4 * 3.1416 + 0.6, fcv = (gdx * Math.cos(fa) + gdy * Math.sin(fa)) * GS * 0.58 + gid * 517 + 64, fci = fcv | 0, fck = fci & 1023;
        silk = sstep(0.03, 0.3, g1);
        h += 0.46 * (SF[fck] + (SF[fck + 1] - SF[fck]) * (fcv - fci)) * silk;
      }
      // bedded in a darker green matrix
      const gin = sstep(0, 0.14, gv);
      const mr = 22 - 8 * tm, mg = 160, mb = 112 + 34 * tm;
      cr = mr + (cr - mr) * gin; cg = mg + (cg - mg) * gin; cb = mb + (cb - mb) * gin; gloss *= gin;
      let sh = 0.7 + 0.3 * sstep(-0.07, 0.3, gv);
      // the clear ones let the lamp through: a little light comes out again along the rim that faces away from it
      if (j5 > 0.66 && gv > 0) {
        const far = (gdx * 0.643 - gdy * 0.766) / gR, tl = sstep(0.2, 0.95, far) * (1 - g1) * gin;
        sh += 0.3 * tl; cr += 26 * tl; cg += 18 * tl;
      }
      // botryoidal knobs (葡萄状): silky domes of very different sizes crowding each other in patches
      let cover = 0;
      const bm = sstep(0.2, 0.5, bil(fBot, i, j));
      if (bm > 0.01) {
        lumps(x / BS + wx * 0.14 + 3.3, y / BS + wy * 0.14 + 1.7, 0.4, 0.46, bm * 0.8);
        if (lV > -8) {
          if (lV > 0) {
            const v = lV;
            cover = sstep(0, 0.14, v);
            const ring = 0.5 + 0.5 * Math.sin((1 - v) * 7 + lId * 50);     // malachite's concentric banding, very faint
            const kk = (0.94 + 0.1 * ring) * (0.94 + 0.14 * ((lId * 53.3) % 1));
            const kR = (50 - 30 * tm) * kk, kG = 206 * kk, kB = (134 + 50 * tm) * kk;
            cr += (kR - cr) * cover; cg += (kG - cg) * cover; cb += (kB - cb) * cover;
            // a knob is a bundle of needles seen end-on: fine fibres run from its pole down its flanks and give it the silk
            const fn = 6 + 8 * lR, fc = Math.atan2(lDy, lDx) * fn + lId * 97 + 64, fi = fc | 0, fk = fi & 1023;
            const fib = (SF[fk] + (SF[fk + 1] - SF[fk]) * (fc - fi)) * sstep(1.5, 3.2, Math.sqrt(lDx * lDx + lDy * lDy) * BS / fn);
            h = h * (1 - 0.8 * cover) + 0.34 * lR * BS * (0.5 * v + 0.5 * Math.sqrt(v)) + 0.42 * fib * cover;
            sh += (1 - sh) * cover * 0.85;
            sh *= 0.8 + 0.2 * sstep(0, 0.14, v - (lV2 > 0 ? lV2 : 0));  // the crease where two domes meet
            gloss += (0.6 - gloss) * cover;
          } else {
            const dd = Math.sqrt(lDx * lDx + lDy * lDy), rr = dd / lR;      // contact shadow on the side away from the light
            if (rr < 1.5) { const sdw = (lDx * 0.64 - lDy * 0.77) / dd; if (sdw > 0) sh *= 1 - 0.5 * sdw * (1 - (rr - 1) / 0.5); }
          }
        }
      }
      // fine drusy tooth
      h += 0.33 * MT[((y & 255) << 8) | (x & 255)] * (1 - 0.6 * cover) * (1 - 0.55 * silk);
      // the crust ends in a smooth, rounded lip — one clean bright line for the lamp to run along, right under the seam
      if (u > -9) {
        const s = Math.atan2(ddx, ddy) * R, lw = 6.0 + 2.0 * nA.n2(s / 47, 7.7);
        if (u > -lw) {
          // (it comes and goes along the arc: where it thins, whole grains run right up to the seam)
          const tb = (u + lw) / lw, wb = sstep(0, 0.5, tb) * (0.62 + 0.38 * nA.n2(s / 29, 4.4)), lt = 0.95 + 0.07 * nA.n2(s / 110, 2.2);
          cr += (64 * lt - cr) * wb * 0.5; cg += (220 * lt - cg) * wb * 0.5; cb += (156 * lt - cb) * wb * 0.5;
          h += (0.8 + 3.6 * (1 - tb * tb) - h) * wb; sh += (1 - sh) * wb; gloss += (0.3 - gloss) * wb;
        }
      }
      // the rim of the mound catches the light; the light pools on its upper right shoulder
      const dxv = x - lx0, dyv = y - ly0;
      sh *= (1 + 0.14 * sstep(-26, -3, dr)) * (1.05 - 0.17 * sstep(300, 1350, Math.sqrt(dxv * dxv + dyv * dyv)));
      const p = j * RW + i, o = p * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255 * clamp01(0.5 - u);
      hB[p] = h; sB[p] = sh; gB[p] = gloss;
    }
  }
  relight(d, hB, sB, gB, RW, RH, { kd: 0.5, amb: [8, 62, 54], spec: [215, 255, 235], pw: 38 });
  const cnv = depthOfField(env, img, X0, Y0);
  const fl = flares(cnv, X0, Y0, L.rng('s17glintL'), {
    count: 320, T: 40, p0: 0.95, p1: 0.997, tint: [240, 255, 232],
    measure: (dd, q) => (dd[q] < dd[q + 2] ? dd[q] : dd[q + 2]),             // white-ish = a facet mirroring the lamp
    accept: (x, y) => y > a.yAt(x) + 12,
  });
  return { cnv, X0, Y0, fl };
}

// ───────────────────────── the seam: a hair of cuprite vermilion exactly on the arc ─────────────────────────
// Static (the arc does not move when the crusts slide along it) and computed at exact pixel coverage: a clean vermilion line
// of slowly breathing width, lit from above so it has a top and a bottom, and the tight purple-black contact shadow it and the
// malachite lip throw on the azurite behind them.
function buildSeam(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const Y0 = Math.floor(a.crestY) - 26, RH = Math.ceil(a.yAt(0)) + 8 - Y0;
  const n = L.makeNoise('s17seam');
  const img = new ImageData(W, RH), d = img.data;
  for (let i = 0; i < W; i++) {
    const ddx = i - cx, yc = a.yAt(i);
    const j0 = Math.max(0, Math.floor(yc - 26) - Y0), j1 = Math.min(RH - 1, Math.ceil(yc + 6) - Y0);
    for (let j = j0; j <= j1; j++) {
      const ddy = cy - (Y0 + j), dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      if (dr < -2.6 || dr > 24) continue;
      const s = Math.atan2(ddx, ddy) * R;                                      // arc length from the crest
      const e0 = -1.45 + 0.4 * n.n2(s / 75, 3.7);                              // lower edge of the vermilion (dr)
      const pocket = n.n2(s / 190, 8.8) - 0.55;
      const wl = 3.0 + 0.6 * n.n2(s / 120, 5.1) + (pocket > 0 ? pocket * 5 : 0);   // its width: 2.4–3.6 px, swelling to ~5 in a few pockets
      const lt = 0.96 + 0.07 * n.n2(s / 26, 1.9);
      const v = dr - e0;                                                       // 0 at the bottom of the line, wl at its top
      if (v < -0.5 || v > wl + 17) continue;
      const cR = clamp01(v + 0.5) * clamp01(wl - v + 0.5);
      // contact shadow: a tight dark core hugging the line, then a short soft penumbra
      const dS = v - wl;
      let aS = 0;
      if (dS > -wl * 0.5) { const dd = dS > 0 ? dS : 0, f = clamp01(1 - dd / 16); aS = 0.42 * Math.exp(-dd / 1.9) + 0.36 * f * f; }
      const tz = clamp01(v / wl);                                            // 0 bottom (lit shoulder) … 1 top (in the corner)
      const rr = (240 - 34 * tz) * lt, rg = (66 - 26 * tz) * lt, rb = (32 - 8 * tz) * lt;
      const wS = aS * (1 - cR), al = cR + wS, kS = clamp01(dS / 3);
      const sr = 62 - 26 * kS, sg = 14, sb = 44 + 8 * kS;                    // the shadow is warm next to the red, purple-black beyond
      const o = (j * W + i) * 4;
      if (al <= 0) continue;
      d[o] = (rr * cR + sr * wS) / al; d[o + 1] = (rg * cR + sg * wS) / al; d[o + 2] = (rb * cR + sb * wS) / al; d[o + 3] = 255 * al;
    }
  }
  const cnv = L.makeCanvas(W, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);
  return { cnv, Y0 };
}

export default {
  name: '锈色显微',
  tone: 'light',
  init(env) {
    S = { up: buildUpper(env), lo: buildLower(env), seam: buildSeam(env) };
  },
  draw(ctx, env, p) {
    const fr = env.frame | 0;
    // the two crusts creep in opposite directions along their boundary
    const rotU = L.lerp(0.0036, -0.0036, p), rotL = L.lerp(-0.0046, 0.0046, p);
    ctx.fillStyle = '#1f4fb0'; ctx.fillRect(0, 0, W, H);

    L.cam(ctx, env, { rot: rotU }, () => {
      ctx.drawImage(S.up.cnv, S.up.X0, S.up.Y0);
      flare(ctx, S.up.fl, fr, 7, 0.3, 0.9);        // blade edges flash for a single frame each
    });

    L.cam(ctx, env, { rot: rotL }, () => {
      ctx.drawImage(S.lo.cnv, S.lo.X0, S.lo.Y0);
      flare(ctx, S.lo.fl, fr, 13, 0.34, 0.85);     // granule facets catch the light frame by frame
    });

    // the seam itself never moves and is never resampled
    ctx.drawImage(S.seam.cnv, 0, S.seam.Y0);
  },
};
