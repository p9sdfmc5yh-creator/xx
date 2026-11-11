// s03 — 朱门金钉. Extreme macro of one gilded bronze door stud (门钉) on a palace gate:
// the arc is the upper silhouette of the dome. Behind it, far out of focus, the vermilion door leaf with a
// few big neighbouring studs melted into soft gold bokeh (still on their strict grid).
//
// The dome is shaded per pixel in init(): every pixel under the arc is mapped onto a real sphere of radius arc.R
// (U = distance along the parallel, S = distance down the meridian from the limb), so dents, sand holes and wear
// are foreshortened toward the limb exactly like the surface of a ball. The (very gently) bumped normal then looks up a
// "matcap" ramp: vermilion door reflection at the limb → pale highlight band with a crisp lower edge → deepening red gold.
// The surface is polished fire-gilding: smooth, a liquid wobble in the reflections, and only a sparse scatter of pits.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 120;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── tiny allocation-free worley noise (squared distances in cD1/cD2, cell id in cId) ──
let cD1 = 0, cD2 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 255) / 255; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = id;
}

// colour ramp given in nz (0 = limb, grazing; 1 = facing the lens) → LUT indexed by elevation angle α = asin(nz)
const AMAX = 1.05, NLUT = 1024;
function lut(stops) {
  const f = L.makeRamp(stops); const out = new Float32Array(NLUT * 3);
  for (let i = 0; i < NLUT; i++) { const c = f(Math.sin((i / (NLUT - 1)) * AMAX)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** the gilded dome: everything below the arc. Returns a canvas cropped to the dome (frame offset in _ox/_oy). */
function buildDome(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 2;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s03a'), nB = L.makeNoise('s03b');

  // matcaps. gold seen under the key light / away from it, and the bare copper where the gilding has worn through.
  // The limb mirrors the sunlit vermilion door (same brightness on both sides: it does not depend on the key light);
  // the dark end of the gold runs to red gold and cinnabar, never to brown.
  const GOLD_LIT = lut([[0, '#de3c18'], [0.04, '#e44a1a'], [0.09, '#ed661e'], [0.14, '#f58a26'], [0.19, '#fbb038'], [0.235, '#ffcf58'],
    [0.268, '#ffe282'], [0.29, '#fff7d6'], [0.304, '#fff3c6'], [0.318, '#ffd866'], [0.34, '#f9c44a'], [0.39, '#f5b83c'], [0.45, '#eda632'], [0.51, '#e2902a'], [0.58, '#d07622'], [0.7, '#b4501b'], [1, '#8e2c16']]);
  const GOLD_DIM = lut([[0, '#d83818'], [0.04, '#de441a'], [0.09, '#e65c1d'], [0.14, '#ec7a24'], [0.19, '#f19a30'], [0.235, '#f5b442'],
    [0.275, '#f8c658'], [0.305, '#f6c250'], [0.34, '#eeb03e'], [0.39, '#e6a034'], [0.45, '#da8c2a'], [0.51, '#cc7622'], [0.58, '#ba5e1c'], [0.7, '#a04018'], [1, '#7a2612']]);
  const BRONZE = lut([[0, '#6a1c0e'], [0.11, '#7a2a12'], [0.21, '#9a4a1e'], [0.3, '#c08040'], [0.4, '#9a4a1c'], [0.56, '#7a3414'], [1, '#5a200e']]);

  // 1) slow fields on a coarse grid (bilinear-sampled later)
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWear = new Float32Array(cw * ch), cMed = new Float32Array(cw * ch), cTarn = new Float32Array(cw * ch),
    cVerd = new Float32Array(cw * ch), cWx = new Float32Array(cw * ch), cWy = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * rr, Sv = R * Math.acos(Math.min(1, rr / R)), k = j * cw + i;
    cWear[k] = nA.fbm(U / 230, Sv / 230, 3, 2, 0.55);
    cMed[k] = nA.fbm(U / 420 + 40, Sv / 420 - 13, 2);
    cTarn[k] = nB.fbm(U / 900 - 7, Sv / 620 + 3, 3);
    cVerd[k] = nB.fbm(U / 170 + 21, Sv / 170 + 77, 3);
    cWx[k] = nB.n2(U / 300 + 5, Sv / 300); cWy[k] = nB.n2(U / 300 - 31, Sv / 300 + 19);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 2) height field at full resolution (units: radians of tilt per surface px once differentiated).
  //    Polished metal: broad planished facets and a slow swell only — just enough to make the reflections swim.
  const Hh = new Float32Array(N), Gl = new Float32Array(N), Cv = new Float32Array(N), Al = new Float32Array(N), St = new Float32Array(N);
  const AF = 0.2, AM = 1.45, AS = 0.016, CELL = 210;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 2) { Al[k] = -1; continue; }
      const q = Math.min(1, rr / R), al = Math.acos(q), nz = Math.sqrt(1 - q * q);
      Al[k] = al;
      const U = Math.atan2(ddx, ddy) * rr, Sv = R * al;
      const fadeFine = sstep(0.07, 0.24, nz), fadeBig = sstep(0.06, 0.22, nz);
      cell(U / CELL + bil(cWx, i, j) * 0.36, Sv / CELL + bil(cWy, i, j) * 0.36);
      const bowl = sstep(0.04, 0.8, Math.sqrt(cD1));   // each planishing blow leaves a very shallow dish
      const streak = nB.n2(U / 300, Sv / 7 + 91);        // burnishing lines running round the stud
      Hh[k] = (AF * bowl + AM * bil(cMed, i, j)) * fadeBig + AS * streak * fadeFine;
      St[k] = streak;
      if (nz > 0.21 && nz < 0.39) Gl[k] = nB.n2(U / 4.2 + 50, Sv / 4.2);     // grain of the gilding: only ever seen as glitter in the highlight band
    }
  }

  // 3) sand holes (砂眼) and knocks: round on the sphere → squashed ellipses near the limb. Sparse, and no two alike.
  const r = L.rng('s03pits');
  const span = a.span(PAD + 20);
  const pits = [];
  for (let n = 0; n < 58; n++) {
    const th0 = r.range(-span, span), v0 = 70 + Math.pow(r(), 0.8) * 640, t = r();
    const rp = t < 0.62 ? r.range(2.2, 4.6) : t < 0.92 ? r.range(5, 9.5) : r.range(11, 16);
    pits.push([th0, v0, rp, rp * r.range(0.18, 0.36)]);
  }
  // three knocks placed by hand inside the plane of focus (the one right of centre is the "eye" of the frame)
  pits.push([0.074, 318, 25, 6.2], [-0.118, 236, 13, 3.4], [-0.021, 404, 17, 4.4]);
  for (const [th0, v0, rp, depth] of pits) {
    const rr0 = R - v0, al0 = Math.acos(rr0 / R), U0 = th0 * rr0, S0 = R * al0;
    const px = cx + rr0 * Math.sin(th0) - X0, py = cy - rr0 * Math.cos(th0) - Y0;
    const e = Math.ceil(rp) + 2;
    for (let j = Math.max(1, Math.floor(py - e)); j <= Math.min(RH - 2, Math.ceil(py + e)); j++) {
      for (let i = Math.max(1, Math.floor(px - e)); i <= Math.min(RW - 2, Math.ceil(px + e)); i++) {
        const k = j * RW + i; if (Al[k] < 0) continue;
        const ddx = X0 + i - cx, ddy = cy - (Y0 + j), rr = Math.sqrt(ddx * ddx + ddy * ddy);
        const du = Math.atan2(ddx, ddy) * rr - U0, ds = R * Al[k] - S0;
        const d2 = (du * du + ds * ds) / (rp * rp);
        if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2);
        Hh[k] -= depth * f; Cv[k] = Math.max(Cv[k], Math.min(1, f * 1.6));
      }
    }
  }

  // 4) shade
  const img = new ImageData(RW, RH), d = img.data;
  const KR = 1.7;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, al = Al[k];
      if (al < 0) continue;
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), sn = ddx / rr, cs = ddy / rr;
      const nz = Math.sin(al);
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      const ht = hx * cs + hy * sn, hv = -hx * sn + hy * cs;       // along the arc / toward the centre (screen px)
      // tilt the sphere normal by the bump: radial slope changes the elevation above the limb, tangential slope slides the highlight sideways
      let a2 = al - hv * nz; a2 = a2 < 0 ? 0 : a2 > AMAX ? AMAX : a2;
      const nx2 = ddx / R - ht;
      const lt = (nx2 + 0.11) / 0.33, lat = Math.exp(-lt * lt);
      const li = ((a2 / AMAX) * (NLUT - 1) | 0) * 3;
      let cr = GOLD_DIM[li] + (GOLD_LIT[li] - GOLD_DIM[li]) * lat, cg = GOLD_DIM[li + 1] + (GOLD_LIT[li + 1] - GOLD_DIM[li + 1]) * lat, cb = GOLD_DIM[li + 2] + (GOLD_LIT[li + 2] - GOLD_DIM[li + 2]) * lat;
      const cav = Cv[k];
      // gilding rubbed a little thinner (warmer) in slow patches and toward the crown of the dome — the bottom of frame,
      // where hands reach it — and, in a very few places, chipped through to the copper. The highlight band and the limb stay clean.
      const crown = sstep(0.4, 0.62, nz), wc = bil(cWear, i, j);
      const thin = L.clamp(0.3 * crown + 0.6 * wc * (0.3 + crown));
      if (thin > 0) { cr *= 1 - 0.02 * thin; cg *= 1 - 0.1 * thin; cb *= 1 - 0.3 * thin; }
      const wb = wc + 0.44 * crown - 0.5 * (1 - sstep(0.16, 0.34, nz));
      let wear = 0;
      if (wb > 0.44) {      // fine structure of the worn edges (only evaluated where wear is possible at all)
        const U = Math.atan2(ddx, ddy) * rr, Sv = R * al;
        wear = sstep(0.74, 0.9, wb + 0.22 * nA.n2(U / 46 + 9, Sv / 46 - 4) + 0.08 * nB.n2(U / 18 - 3, Sv / 18 + 8));
      }
      if (wear > 0) {
        cr += (BRONZE[li] - cr) * wear; cg += (BRONZE[li + 1] - cg) * wear; cb += (BRONZE[li + 2] - cb) * wear;
        const lip = 4 * wear * (1 - wear);     // the curled edge of the gold leaf catches the light
        cr += 46 * lip; cg += 38 * lip; cb += 14 * lip;
      }
      // slow tarnish: only ever warmer and darker
      const tarn = Math.min(0.15, bil(cTarn, i, j)), tw = tarn < 0 ? tarn * 1.4 : tarn * 0.3;
      cr *= 1 + 0.04 * tw; cg *= 1 + 0.09 * tw; cb *= 1 + (tarn < 0 ? 0.17 : 0.1) * tw;
      // the burnisher's strokes: faint concentric silk in the reflection
      const sk = 1 + 0.02 * St[k] * sstep(0.2, 0.32, nz);
      cr *= sk; cg *= sk; cb *= sk;
      // relief from the upper-left key light, measured on the surface (not the foreshortened screen) …
      const tR = -hv * nz, tT = -ht;
      let rel = -(tR * 0.835 + tT * 0.55) * KR * sstep(0.12, 0.3, nz); rel = rel < -0.55 ? -0.55 : rel > 0.65 ? 0.65 : rel;
      const sh = 1 + rel;
      cr *= sh; cg *= sh; cb *= sh;
      // … plus a tight specular lobe: the lip of every pit that faces the light flashes
      const e1 = tR + 0.07, e2 = tT + 0.046, ee = e1 * e1 + e2 * e2, spec = ee < 0.005 ? Math.exp(-ee / 0.0012) : 0;
      if (spec > 0.02) { const sp = spec * 150 * (0.35 + 0.65 * lat) * (1 - wear * 0.8) * sstep(0.17, 0.3, nz); cr += sp; cg += sp * 0.92; cb += sp * 0.6; }
      // micro-glitter of the gilding, only inside the highlight band where the light rakes across it
      const gl = Gl[k] - 0.55;
      if (gl > 0) { const sp = gl * 46 * (0.25 + 0.75 * lat) * (1 - wear * 0.8) * sstep(0.22, 0.28, nz) * (1 - sstep(0.31, 0.38, nz)); cr += sp; cg += sp * 0.94; cb += sp * 0.72; }
      // cavities go dark (a deep red-brown, the colour of the copper in shadow); a little verdigris gathers in a very few of them
      if (cav > 0) { const o = 1 - 0.86 * cav; cr *= o + 0.05 * cav; cg *= o * 0.86; cb *= o * 0.8; }
      const vm = cav > 0 || wear > 0 ? sstep(0.96, 1.03, bil(cVerd, i, j) * 0.5 + 0.5 + 0.36 * cav + 0.12 * wear) * sstep(0.34, 0.44, nz) : 0;
      if (vm > 0) {
        const vs = (0.8 + 0.5 * rel) * (1 - 0.45 * cav), m = vm * 0.8;
        cr += (58 * vs - cr) * m; cg += (168 * vs - cg) * m; cb += (140 * vs - cb) * m;
      }
      const o = k * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);

  // surface point (U, S) → frame coords
  const toXY = (U, Sv) => { const rr = R * Math.cos(Sv / R), th = U / rr; return [cx + rr * Math.sin(th), cy - rr * Math.cos(th)]; };

  // everything from here on lives on a canvas cropped to the dome: frame (x, y) → canvas (x + PAD, y - OY)
  const TOPM = 24, OY = Y0 - TOPM, DW = RW, DH = RH + TOPM;
  const layer = L.makeCanvas(DW, DH), g = layer.getContext('2d');
  const full = (c) => c.fillRect(-PAD, OY, DW, DH);
  g.translate(PAD, -OY);
  g.save(); a.clipBelow(g, 0);
  g.drawImage(cnv, X0, Y0);
  // a few hairline scratches (bright lip + dark groove), straight on the sphere → flattened toward the limb
  const rs = L.rng('s03scratch');
  g.lineCap = 'round';
  for (let n = 0; n < 26; n++) {
    const U0 = rs.range(-1250, 1250), S0 = rs.range(1000, 2100), ang = rs.range(0, Math.PI), len = rs.range(60, 320) * (rs.chance(0.15) ? 2 : 1), bend = rs.range(-0.12, 0.12);
    const pts = [];
    for (let t = 0; t <= 10; t++) { const u = t / 10 - 0.5, aa = ang + bend * u; pts.push(toXY(U0 + Math.cos(aa) * len * u, Math.max(860, S0 + Math.sin(aa) * len * u))); }
    const al = rs.range(0.08, 0.22), lw = rs.range(0.7, 1.3);
    const run = (dy, style) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); pts.forEach((q, t) => (t ? g.lineTo(q[0], q[1] + dy) : g.moveTo(q[0], q[1] + dy))); g.stroke(); };
    run(0.9, `rgba(110,36,8,${al * 0.8})`); run(0, `rgba(255,246,206,${al})`);
  }
  // the dome turns away from the key light toward the right and the lower corners: it gets redder, not greyer
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, -PAD, 0, W + PAD, 0, [[0, '#fff0dc'], [0.3, '#ffffff'], [0.62, '#ffecd2'], [1, '#f6c096']]); full(g);
  g.fillStyle = L.radial(g, a.cx - 160, a.crestY + 120, 520, 1500, [[0, '#ffffff'], [1, '#f2ae80']]); full(g);
  g.restore();

  // bloom, baked in: only the hot parts of the gold, blurred wide → the metal glows
  const bs = 0.25, bw = Math.round(DW * bs), bh = Math.round(DH * bs);
  const bsm = L.makeCanvas(bw, bh), bg = bsm.getContext('2d');
  bg.filter = 'brightness(0.74) contrast(2.6) saturate(1.2) blur(5px)';
  bg.drawImage(layer, 0, 0, bw, bh);
  const bloom = L.makeCanvas(DW, DH), blg = bloom.getContext('2d');
  blg.imageSmoothingEnabled = true; blg.imageSmoothingQuality = 'high';
  blg.drawImage(bsm, 0, 0, DW, DH);
  L.overlayOn(layer, bloom, { blend: 'screen', alpha: 0.24 });

  // depth of field. The plane of focus crosses the dome just below the highlight band;
  // the limb (far, edge-on) is soft — its edge feathers across the arc — and so is the crown bulging toward the lens.
  const out = L.makeCanvas(DW, DH), og = out.getContext('2d');
  og.drawImage(L.blurred(layer, 3), 0, 0);
  const mask = (src, r0, r1) => {      // keep src inside radius r0, fade it out by r1
    const c = L.makeCanvas(DW, DH), m = c.getContext('2d');
    m.drawImage(src, 0, 0);
    m.globalCompositeOperation = 'destination-in';
    m.fillStyle = L.radial(m, a.cx + PAD, a.cy - OY, r0, r1, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    m.fillRect(0, 0, DW, DH);
    return c;
  };
  og.drawImage(mask(layer, R - 130, R - 10), 0, 0);
  og.drawImage(mask(L.blurred(layer, 4), R - 420, R - 270), 0, 0);
  og.drawImage(mask(L.blurred(layer, 10), R - 600, R - 400), 0, 0);
  out._ox = -PAD; out._oy = OY;
  return out;
}

/** defocus with a disc-shaped kernel (flat-topped blur, like a real lens wide open). Worked at half size: the result has no detail anyway. */
function lensBlur(src, radius, n = 44) {
  const w = Math.round(src.width / 2), h = Math.round(src.height / 2);
  const sm = L.makeCanvas(w, h), sg = sm.getContext('2d');
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
  sg.drawImage(src, 0, 0, w, h);
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const rr = radius * 0.5 * Math.sqrt((i + 0.5) / n), th = i * 2.399963;
    g.globalAlpha = 1 / (i + 1);
    g.drawImage(sm, Math.cos(th) * rr, Math.sin(th) * rr);
  }
  const out = L.makeCanvas(src.width, src.height), og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(L.blurred(c, radius * 0.08), 0, 0, src.width, src.height);
  return out;
}

/** the door leaf behind: true vermilion lacquer and one row of big neighbouring studs on their strict grid, all far out of focus */
function buildBack(env) {
  const a = env.arc;
  const BW = W + PAD * 2, BH = PAD + 810;      // only the part of the leaf that can show above the dome
  const G = 500, SR = 122, COL0 = 960 + 250, ROW0 = 272, BLUR = 36;
  const rv = L.rng('s03studs');
  const studs = [];
  // hand-set: a few px off the grid, no two quite the same size or polish
  for (let col = -4; col <= 3; col++) studs.push({ x: COL0 + col * G + rv.range(-4, 4), y: ROW0 + rv.range(-4, 4), r: SR * rv.range(0.96, 1.04), k: rv.range(0.86, 1.06) });
  const full = (c) => c.fillRect(-PAD, -PAD, BW, BH);
  const LX = 540, LY = 60;      // where the key light lands on the door
  const sharp = L.makeCanvas(BW, BH), g = sharp.getContext('2d');
  g.translate(PAD, PAD);
  g.fillStyle = L.linear(g, 0, -PAD, 0, H * 0.72, [[0, '#d0351f'], [0.5, '#c02a1b'], [1, '#961b14']]); full(g);
  g.fillStyle = L.radial(g, LX, LY, 0, 1250, [[0, 'rgba(240,78,46,0.8)'], [0.45, 'rgba(218,54,32,0.36)'], [1, 'rgba(160,26,18,0)']]); full(g);
  // lacquer: slow blotches in the same hue (no brushed sheen — that read as a velvet curtain)
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.32;
  g.drawImage(L.noiseTex(BW, BH, { seed: 's03lac2', scale: 460, octaves: 3, res: 0.2, ox: -PAD, oy: -PAD, ramp: [[0, '#b0463a'], [0.55, '#ffffff'], [1, '#ffffff']] }), -PAD, -PAD);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // the leaf falls off toward the corners, into deep cinnabar (under the studs, so the gold itself never goes olive)
  g.fillStyle = L.radial(g, 900, 300, 700, 1340, [[0, 'rgba(70,8,12,0)'], [1, 'rgba(70,8,12,0.5)']]); full(g);
  for (const s of studs) {
    const { x, y, r: sr } = s;
    const far = L.clamp((Math.hypot(x - LX, y - LY) - 400) / 1200);
    // cast shadow, down and to the right
    g.fillStyle = L.radial(g, x + sr * 0.44, y + sr * 0.56, sr * 0.5, sr * 1.22, [[0, 'rgba(96,10,10,0.7)'], [1, 'rgba(96,10,10,0)']]);
    g.beginPath(); g.arc(x + sr * 0.44, y + sr * 0.56, sr * 1.22, 0, L.TAU); g.fill();
    g.save(); g.beginPath(); g.arc(x, y, sr, 0, L.TAU); g.clip();
    const box = () => g.fillRect(x - sr * 1.5, y - sr * 1.5, sr * 3, sr * 3);
    // the gilded dome: red gold, deeper away from the light
    g.fillStyle = L.radial(g, x - sr * 0.3, y - sr * 0.36, sr * 0.08, sr * 1.4, [[0, '#ffd766'], [0.34, '#f8b436'], [0.62, '#e48c24'], [0.84, '#c45c1a'], [1, '#9c3614']]); box();
    // the vermilion leaf mirrored round its rim, strongest on the shadow side
    g.fillStyle = L.radial(g, x - sr * 0.14, y - sr * 0.16, sr * 0.62, sr * 1.12, [[0, 'rgba(228,66,28,0)'], [1, 'rgba(228,66,28,0.9)']]); box();
    // studs farther from the light sink toward red gold
    g.fillStyle = `rgba(196,70,22,${(0.08 + 0.3 * far + (1.06 - s.k) * 0.5).toFixed(3)})`; box();
    // the sky mirrored high on the dome: a broad pale crescent, not a point
    g.translate(x - sr * 0.3, y - sr * 0.38); g.rotate(-0.66); g.scale(1, 0.58);
    g.fillStyle = L.radial(g, 0, 0, 0, sr * 0.7, [[0, `rgba(255,247,208,${0.98 * s.k})`], [0.42, `rgba(255,228,136,${0.72 * s.k})`], [1, 'rgba(255,206,96,0)']]);
    g.fillRect(-sr, -sr, sr * 2, sr * 2);
    g.restore();
  }
  const back = lensBlur(sharp, BLUR), b = back.getContext('2d');
  back._pad = PAD;
  b.translate(PAD, PAD);
  // the door falls into shadow right behind the big stud: this is what makes the arc the hardest edge in frame
  b.fillStyle = L.radial(b, a.cx, a.cy, a.R - 20, a.R + 150, [[0, 'rgba(52,5,9,0.78)'], [0.4, 'rgba(52,5,9,0.36)'], [1, 'rgba(52,5,9,0)']]); full(b);
  // out of focus, each stud's highlight swells into a soft glow; dimmer and more orange away from the light
  b.globalCompositeOperation = 'screen';
  for (const s of studs) {
    const bx = s.x - s.r * 0.3, by = s.y - s.r * 0.38, br = s.r * 0.6;
    const f = L.clamp((Math.hypot(bx - LX, by - LY) - 350) / 1100);
    const col = L.mix('#ffcc60', '#f29a2c', f), al = L.lerp(0.3, 0.18, f) * s.k;
    b.fillStyle = L.radial(b, bx, by, 0, br, [[0, L.rgba(col, al)], [0.35, L.rgba(col, al * 0.8)], [0.7, L.rgba(col, al * 0.22)], [1, L.rgba(col, 0)]]);
    b.beginPath(); b.arc(bx, by, br, 0, L.TAU); b.fill();
  }
  b.globalCompositeOperation = 'source-over';
  return back;
}

/** draw a cropped, rot-able layer (rotation about the arc's centre: detail slides along the arc) */
function put(ctx, env, c, rot) {
  const a = env.arc;
  ctx.save();
  ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
  ctx.drawImage(c, c._ox, c._oy);
  ctx.restore();
}

export default {
  name: '朱门金钉',
  tone: 'light',
  init(env) {
    const dome = buildDome(env);
    // a handful of pin-point glints in the highlight band; each flares once as the surface slides under the light
    const rg = L.rng('s03glint'), glints = [];
    for (let i = 0; i < 7; i++) glints.push({ th: rg.range(-0.27, 0.1), dr: -rg.range(112, 176), ph: rg(), k: rg.range(0.45, 1) });
    S = { back: buildBack(env), dome, glints };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.009, 0.009, p);
    // background: far less parallax, a breath of zoom
    L.blit(ctx, env, S.back, { rot: rot * 0.22, zoom: L.lerp(1.0, 1.018, p) });
    // a thin warm halo where the gold spills over its own limb into the lens
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = L.radial(ctx, a.cx, a.cy, a.R - 4, a.R + 64, [[0, 'rgba(255,110,40,0.18)'], [0.3, 'rgba(236,66,24,0.08)'], [1, 'rgba(200,40,20,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // the stud: surface detail slides along the arc
    put(ctx, env, S.dome, rot);
    // travelling sheen in the highlight band
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, L.lerp(-0.15, -0.075, p), -138, () => {
      ctx.scale(3.6, 0.5);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 150, [[0, 'rgba(255,240,196,0.5)'], [0.4, 'rgba(255,208,100,0.16)'], [1, 'rgba(255,180,60,0)']]);
      ctx.fillRect(-160, -160, 320, 320);
    });
    ctx.restore();
    // pin-point glints
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const q of S.glints) {
      const tw = (0.25 + 0.75 * Math.pow(Math.max(0, Math.cos((p * 0.8 + q.ph) * L.TAU)), 3)) * q.k;
      if (tw < 0.03) continue;
      a.at(ctx, q.th + rot, q.dr, () => {
        ctx.scale(1, 0.42);
        ctx.fillStyle = L.radial(ctx, 0, 0, 0, 34, [[0, `rgba(255,252,232,${0.95 * tw})`], [0.1, `rgba(255,240,180,${0.55 * tw})`], [0.4, `rgba(255,214,120,${0.12 * tw})`], [1, 'rgba(255,200,100,0)']]);
        ctx.fillRect(-34, -34, 68, 68);
      });
    }
    ctx.restore();
    // rim light riding the limb: strongest where the key light grazes it, never an even outline
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const pk = L.lerp(0.28, 0.34, p);
    const rim = (k) => L.linear(ctx, 0, 0, W, 0, [[0, `rgba(255,150,70,${0.1 * k})`], [pk - 0.16, `rgba(255,190,110,${0.4 * k})`], [pk, `rgba(255,228,164,${0.95 * k})`], [pk + 0.2, `rgba(255,190,104,${0.42 * k})`], [0.8, `rgba(255,150,70,${0.1 * k})`], [1, 'rgba(255,140,64,0)']]);
    ctx.strokeStyle = rim(0.2); ctx.lineWidth = 12; a.stroke(ctx, -6);
    ctx.strokeStyle = rim(0.3); ctx.lineWidth = 6; a.stroke(ctx, -3.4);
    ctx.strokeStyle = rim(0.42); ctx.lineWidth = 2.6; a.stroke(ctx, -2);
    ctx.restore();
  },
};
