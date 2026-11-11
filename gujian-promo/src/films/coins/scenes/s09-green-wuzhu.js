// s09 — 绿锈五铢. Flat-lay macro of the top edge of a Han wuzhu coin lying on cream xuan paper.
// The arc is the coin's outer edge; just inside it runs the raised outer rim (外郭), then the sunken field (肉),
// all under a thick malachite crust that reads like a leaf: the crust is quilted into pillowy plates by a net of shallow
// crackle grooves, its skin is pebbly (botryoidal), and a few long fissures sweep up from the lower left and flatten out
// under the rim like the veins of a leaf (they are cracks in the corrosion layer, not casting marks).
// A patch of ochre burial soil lies centre-right: dry and cracked where it is thick, crumbling into the crust at its margin.
// Only the uppermost ~3 mm of the coin is in frame, so the inscription and the square hole never appear.
//
// The coin is shaded per pixel in init(): height field → normal → one soft key light from the upper left; the rim's inner
// step and the thick soil also throw a short shadow (found by walking the height field toward the light). A second,
// smoother normal gives two sparse layers of glints (two light azimuths) that cross-fade as the coin turns. Focus sits
// on the crest; the far ends of the edge and the bottom of the frame fall gently out of focus.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 90;
const RIMW = 114;      // mean width of the outer rim (外郭) in px — it wanders ±15 along the edge
const HR = 13;         // how far the rim stands above the field (px of relief)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// allocation-free worley noise: squared distances in cD1/cD2, cell id in cId
let cD1 = 0, cD2 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, dd = dx * dx + dy * dy;
    if (dd < d1) { d2 = d1; d1 = dd; id = ((h >>> 20) & 255) / 255; } else if (dd < d2) d2 = dd;
  }
  cD1 = d1; cD2 = d2; cId = id;
}

const lut = (stops) => {
  const f = L.makeRamp(stops), o = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) { const c = f(i / 255); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
};

// two small knocks on the edge (磕缺): u = arc length from the crest (px); the break runs wl px to the left and wr px to
// the right of its deepest point (d px). One flank is a clean snap, the other is worn down.
const NICKS = [{ u: -352, wl: 12, wr: 44, d: 10 }, { u: 590, wl: 27, wr: 9, d: 6.5 }];

/**
 * Everything about the rim that only depends on the position along the edge, tabulated every half pixel of arc length:
 * e = how far the true edge sits inside the shared arc (waviness of the casting, the nicks), g = the slope of that line
 * (for honest anti-aliasing on the nicks' steep flanks), lump = how beaded with crust the outline is,
 * rw = width of the rim, sf / k = half width and sharpness of its inner step, sl = how lumpy that step is,
 * ws = width of the rounded outer shoulder, wear = where the high spots are rubbed thin,
 * tint = strength of the dark line at the very edge, chip / reach = the nicks' broken faces.
 */
function edgeTables(a) {
  const nz = L.makeNoise('s09edge'), nA = L.makeNoise('s09a'), nB = L.makeNoise('s09b');
  const U = a.span(PAD + 220) * a.R, n = Math.ceil(U * 4) + 2;
  const f = () => new Float32Array(n);
  const T = { U, n, e: f(), g: f(), lump: f(), rw: f(), sf: f(), k: f(), sl: f(), ws: f(), wear: f(), tint: f(), chip: f(), reach: f() };
  for (let i = 0; i < n; i++) {
    const u = -U + i * 0.5;
    let e = 1.0 + 0.85 * nz.n2(u / 260, 2.2) + 0.45 * nz.n2(u / 63, 7.7);
    let cl = 0, cr = 0;
    for (const q of NICKS) {
      const du = u - q.u;
      if (du > -q.wl && du < q.wr) e += q.d * (du < 0 ? Math.pow(1 + du / q.wl, 0.8) : 1 - sstep(0, q.wr, du)) * (1 + 0.12 * nz.n2(u / 15, 9.1));
      const lat = du < 0 ? sstep(-q.wl * 1.25, -q.wl * 0.6, du) : 1 - sstep(q.wr * 0.45, q.wr * 1.1, du);
      if (lat > cl) { cl = lat; cr = q.d * 2.1; }
    }
    T.e[i] = e; T.chip[i] = cl; T.reach[i] = cr;
    T.lump[i] = (0.4 + 0.6 * sstep(-0.4, 0.4, nz.n2(u / 210, 14.9))) * (1 - 0.7 * cl);
    T.rw[i] = RIMW + 11 * nA.n2(u / 370, 3.1) + 4 * nB.n2(u / 86, 8.8);
    const soft = sstep(-0.5, 0.45, nB.n2(u / 200, 5.5));               // where crust has crept up the step it is softer
    T.sf[i] = 5 + 8 * soft; T.k[i] = 2.0 - 0.8 * soft; T.sl[i] = 0.35 + 0.65 * soft;
    T.ws[i] = 24 + 10 * nz.n2(u / 150, 11.3) + 4 * nz.n2(u / 37, 6.6);
    T.wear[i] = sstep(0.1, 0.5, nz.n2(u / 300, 21.7) + 0.3 * nz.n2(u / 70, 3.3));
    T.tint[i] = 0.2 + 0.32 * sstep(-0.3, 0.5, nz.n2(u / 74, 5.1));
  }
  for (let i = 0; i < n; i++) T.g[i] = Math.hypot(1, T.e[Math.min(n - 1, i + 1)] - T.e[Math.max(0, i - 1)]);
  return T;
}

/**
 * The long crust fissures. Each main one is walked backwards from the point where it dies out under the rim: it leaves
 * the rim at a shallow angle and steepens toward the lower left, so in frame they read as a few near-parallel sweeping
 * curves (a leaf's secondary veins). A couple of shorter branches split off toward the rim.
 * Returns [{ pts:[[x,y]…], ws:[width…] }]
 */
function veinCurves(a) {
  const r = L.rng('s09vein3'), nz = L.makeNoise('s09veinw');
  const out = [], inner = RIMW + 6, STEP = 10;
  const ENDS = [-230, 190, 585, 1030, 1485, 1930, 2380, 2830];
  ENDS.forEach((ex0, n) => {
    const ex = ex0 + r.range(-45, 45);
    const th = a.thetaAtX(ex, -inner), p0 = a.pt(th, -inner);
    const b0 = r.range(0.2, 0.3), b1 = r.range(0.58, 0.7), kk = r.range(330, 470), seed = n * 7.1 + 1;
    // heading (−cos φ, +sin φ): down-left, φ eases from b0 (measured off the rim's tangent) to b1
    let x = p0.x, y = p0.y;
    const pts = [[x, y]], phis = [b0 - th];
    for (let s = 0; s < 3400; s += STEP) {
      const phi = (b0 - th) + ((b1 - th * 0.45) - (b0 - th)) * (1 - Math.exp(-s / kk)) + 0.085 * nz.n2(s / 250, seed) + 0.05 * nz.n2(s / 64, seed + 9.7);
      x -= Math.cos(phi) * STEP; y += Math.sin(phi) * STEP;
      pts.push([x, y]); phis.push(phi);
      if (x < -PAD - 140 || y > H + PAD + 140) break;
    }
    const wMain = r.range(11.5, 15);
    out.push({ pts, ws: pts.map((_, i) => 4.5 + (wMain - 4.5) * (1 - Math.exp(-(i * STEP) / 420))) });
    // branches: leave the main fissure some way back from its end and climb more steeply to the rim
    const nb = n % 3 === 1 ? 2 : 1;
    for (let q = 0; q < nb; q++) {
      const i0 = Math.min(pts.length - 2, Math.round(r.range(24, 44) + q * r.range(26, 40)));
      let bx = pts[i0][0], by = pts[i0][1];
      const bp = [[bx, by]], d0 = r.range(0.62, 0.86), bs = seed * 1.7 + q * 4.4;
      for (let s = 0; s < 560; s += STEP) {
        const psi = phis[i0] + 0.16 + d0 * Math.exp(-s / 210) + 0.1 * nz.n2(s / 120, bs);      // forward = (cos ψ, −sin ψ)
        bx += Math.cos(psi) * STEP; by -= Math.sin(psi) * STEP;
        bp.push([bx, by]);
        if (a.drAt(bx, by) > -inner) break;
      }
      const wb = r.range(6.5, 8.5);
      out.push({ pts: bp, ws: bp.map((_, i) => L.lerp(wb, 3.4, i / (bp.length - 1))) });
    }
  });
  return out;
}

/** radial alpha mask (0 inside r0, 1 beyond r1) around the focus point, squashed vertically; canvas coords */
function focusMask(w, h, fx, fy, r0, r1, sy) {
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.translate(fx, fy); g.scale(1, sy);
  const st = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; st.push([t, `rgba(0,0,0,${(t * t * (3 - 2 * t)).toFixed(3)})`]); }
  g.fillStyle = L.radial(g, 0, 0, r0, r1, st);
  g.fillRect(-4000, -4000 / sy, 8000, 8000 / sy);
  return c;
}
/** dst = dst·(1−m) + src·m  (m = the mask canvas's alpha) */
function mixIn(dst, src, m) {
  const t = L.makeCanvas(src.width, src.height), tg = t.getContext('2d');
  tg.drawImage(src, 0, 0); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(m, 0, 0);
  const g = dst.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'lighter'; g.drawImage(t, 0, 0);
  g.restore();
}

/** the coin: everything below the arc. Returns { coin, spA, spB, sil, X0, Y0 } (canvases cropped to the coin's region) */
function buildCoin(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 6;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s09a'), nB = L.makeNoise('s09b');
  const ET = edgeTables(a), EU = ET.U, EN = ET.n - 1;
  const E = ET.e, EG = ET.g, ELT = ET.lump, RWT = ET.rw, SFT = ET.sf, KT = ET.k, SLT = ET.sl, WST = ET.ws, WGT = ET.wear, EKT = ET.tint, CLT = ET.chip, CRT = ET.reach;

  // ── rasterised masks (drawn with the canvas API in frame coords, read back as bytes) ──
  const mask = (draw, blur) => {
    const c = L.makeCanvas(RW, RH), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, RW, RH);
    g.translate(-X0, -Y0); draw(g);
    const b = blur ? L.blurred(c, blur) : c;
    const px = b.getContext('2d').getImageData(0, 0, RW, RH).data, out = new Uint8Array(N);
    for (let k = 0; k < N; k++) out[k] = px[k * 4];
    return out;
  };
  const veins = veinCurves(a);
  const strokeVeins = (g, wk, wmin, grey = '#fff') => {
    g.save(); a.clipBelow(g, -(RIMW - 14));
    g.strokeStyle = grey; g.lineCap = 'round';
    for (const v of veins) {
      for (let i = 1; i < v.pts.length; i++) {
        g.lineWidth = Math.max(wmin, 0.5 * (v.ws[i - 1] + v.ws[i]) * wk);
        g.beginPath(); g.moveTo(v.pts[i - 1][0], v.pts[i - 1][1]); g.lineTo(v.pts[i][0], v.pts[i][1]); g.stroke();
      }
    }
    g.restore();
  };
  // the fissure itself, a pale shallow groove: its full width at 60 %, the middle third at 100 %
  const Vc = mask((g) => { strokeVeins(g, 1, 2.8, '#999'); strokeVeins(g, 0.4, 1.7); }, 1.5);
  const Vw = mask((g) => strokeVeins(g, 5.4, 26), 17);            // the broad valley it sits in (the crust pillows up between fissures)
  const soilShape = (g) => {                                      // burial soil: a diagonal patch centre-right, broken in two
    const nz = L.makeNoise('s09soilshape'), r = L.rng('s09soil');
    g.fillStyle = '#fff';
    const blob = (x, y, rad) => { g.beginPath(); g.ellipse(x, y, rad, rad * 0.92, 0, 0, L.TAU); g.fill(); };
    const top = a.yAt(1118, -(RIMW + 40));
    const spine = L.smoothPath([[1112, top], [1128, top + 70], [1158, top + 160], [1192, top + 250], [1240, top + 350], [1296, top + 470], [1346, top + 600]], 8);
    spine.forEach(([x, y], i) => {
      const t = i / (spine.length - 1);
      // widest a third of the way down, pinched to almost nothing near t≈0.66, a second smaller patch below
      const e1 = Math.exp(-Math.pow((t - 0.3) / 0.19, 2)), e2 = 0.75 * Math.exp(-Math.pow((t - 0.88) / 0.13, 2));
      const rad = 6 + 50 * e1 + 54 * e2 + 20 * nz.n2(t * 7, 4.1);
      if (rad > 13) blob(x + 26 * nz.n2(t * 6, 1.3), y, rad);
    });
    // lobes that spoil the almond: a shoulder on the right, a tongue licking down-left
    for (const [x, y, rad] of [[1218, top + 196, 34], [1246, top + 236, 22], [1118, top + 262, 26], [1100, top + 300, 15], [1160, top + 60, 20]]) blob(x, y, rad);
    // a few ragged satellites, and two faint smears far to the left like the spots on a leaf
    const sat = [[1040, 930, 14], [1300, 850, 12], [1076, 800, 8], [1290, 990, 10], [262, 930, 17], [585, 800, 9]];
    for (const [x, y, rad] of sat) for (let q = 0; q < 4; q++) blob(x + r.range(-rad, rad), y + r.range(-rad, rad) * 0.7, rad * r.range(0.5, 1));
  };
  const Sm = mask(soilShape, 15), Sw = mask(soilShape, 46);       // the soil itself / the wide stain around it

  // ── slow fields on a coarse grid (bilinear-sampled) ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, cn = cw * ch;
  const cLump = new Float32Array(cn), cHue = new Float32Array(cn), cPow = new Float32Array(cn), cWx = new Float32Array(cn),
    cWy = new Float32Array(cn), cSoil = new Float32Array(cn), cZone = new Float32Array(cn), cMid = new Float32Array(cn), cCor = new Float32Array(cn);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    cLump[k] = nA.fbm(x / 150, y / 150, 3, 2, 0.5);
    cHue[k] = nA.fbm(x / 560 + 9, y / 560 - 4, 3);
    cPow[k] = nB.fbm(x / 84 + 40, y / 84, 3);
    cWx[k] = nB.n2(x / 190 + 5, y / 190); cWy[k] = nB.n2(x / 190 - 31, y / 190 + 19);
    cSoil[k] = nB.fbm(x / 52 - 7, y / 52 + 3, 3, 2, 0.6);
    cZone[k] = nA.fbm(x / 360 + 70, y / 360 + 21, 2);
    cMid[k] = nA.fbm(x / 34 - 12, y / 34 + 44, 2, 2, 0.6);
    cCor[k] = nB.fbm(x / 230 + 3, y / 230 - 8, 2);
  }
  let bk = 0, btx = 0, bty = 0;
  const B = (s) => { const a0 = s[bk], a1 = s[bk + 1], b0 = s[bk + cw], b1 = s[bk + cw + 1]; return (a0 + (a1 - a0) * btx) * (1 - bty) + (b0 + (b1 - b0) * btx) * bty; };

  const GREEN = lut([[0, '#0d3a23'], [0.2, '#1c5f3c'], [0.46, '#2f9a5f'], [0.63, '#4aae66'], [0.82, '#84c877'], [1, '#bbe292']]);
  const SOIL = lut([[0, '#5f4018'], [0.22, '#93702a'], [0.5, '#c9a24a'], [0.76, '#d9b95f'], [1, '#ead390']]);

  // ── pass 1: height (full, and without the finest grain), albedo, occlusion, gloss ──
  const Hh = new Float32Array(N), Hs = new Float32Array(N), Hr = new Float32Array(N), Ao = new Float32Array(N), Gs = new Float32Array(N), Gl = new Float32Array(N);
  const Fz = new Uint8Array(N);                                   // 1 where the rim or thick soil can throw a shadow
  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y, fy = j / CS, j0 = fy | 0;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx;
      const v = R - Math.sqrt(ddx * ddx + ddy * ddy);            // depth inside the shared arc
      if (v < -6) continue;                                       // (a few px beyond the outline are filled in too, so the slopes at the edge are honest)
      const k = j * RW + i;
      const fx = i / CS, i0 = fx | 0; bk = j0 * cw + i0; btx = fx - i0; bty = fy - j0;
      const wx = B(cWx), wy = B(cWy);
      const lump = B(cLump), sn = B(cSoil), mid = B(cMid), pw = B(cPow);

      // corrosion crust: big pillowy plates split by crackle grooves, a pebbly skin, a little sugar on top
      const g1 = nA.n2(x / 5.5, y / 5.5), g2 = nB.n2(x / 2.6 + 50, y / 2.6);
      const w1 = nA.n2(x / 24 + 80, y / 24), w2 = nB.n2(x / 24 - 20, y / 24 + 60);       // wiggle: no ruler-straight cracks
      cell(x / 122 + wx * 0.4 + w1 * 0.036, y / 122 + wy * 0.4 + w2 * 0.036);
      const e1 = Math.sqrt(cD2) - Math.sqrt(cD1), id1 = cId;
      const crack = 1 - sstep(0.008, 0.05 + 0.04 * id1, e1 + 0.008 * g1);
      const dome1 = sstep(0, 0.42, e1);
      cell(x / 17 + 17 + wy * 0.95 + w2 * 0.1, y / 17 - 5 + wx * 0.95 + w1 * 0.1);     // the slow warp stretches and squeezes the pebbles: no two patches alike
      const e2 = Math.sqrt(cD2) - Math.sqrt(cD1), id2 = cId;
      const groove2 = 1 - sstep(0.02, 0.2, e2);
      const peb = 1 - Math.min(1, cD1 * 3.1);
      const zone = sstep(-0.32, 0.26, B(cZone));

      // rim profile: a rounded shoulder up from the edge, a slightly crowned top, then the step down to the field —
      // a crisp arris where the rim is rubbed, a soft slope where crust has crept over it. Both the outline and the step
      // are beaded by the pebbles of the crust, so neither is a ruled line.
      let ins = v, cov = 1, rimIn = 0, rimTop = 0, hRim = 0, foot = 0, sh = 1, facet = 0, wearG = 0, eTint = 0, ws = 24, rw = RIMW, sf = 6;
      if (v < RIMW + 84) {
        const u = Math.atan2(ddx, ddy) * R;
        let ti = ((u + EU) * 2 + 0.5) | 0; ti = ti < 0 ? 0 : ti > EN ? EN : ti;
        rw = RWT[ti] + 3 * wx + (2.2 * (peb - 0.5) + 2.2 * mid) * SLT[ti]; sf = SFT[ti];
        const st = (v - (rw - sf)) / (2 * sf);
        rimIn = st <= 0 ? 1 : st >= 1 ? 0 : Math.pow(1 - st, KT[ti]);
        if (v < 62) {
          ins = v - E[ti] + ELT[ti] * (1.9 * (peb - 0.5) + 1.5 * mid);      // distance inside the true edge
          cov = ins / EG[ti] + 0.5; cov = cov < 0 ? 0 : cov > 1 ? 1 : cov;
          ws = WST[ti] + 2.5 * wy;
          if (ins < ws) { const q = ins <= 0 ? 1 : 1 - ins / ws; sh = Math.sqrt(1 - q * q); }
          if (CLT[ti] > 0) facet = CLT[ti] * (1 - sstep(CRT[ti] * 0.45, CRT[ti], ins));
          eTint = EKT[ti];
        }
        rimTop = sh * rimIn;
        const rv = (v - rw * 0.5) / (rw * 0.5);
        hRim = HR * rimTop - 1.3 * rimIn * rv * rv;
        foot = (1 - sstep(rw + 2, rw + 36, v)) * (1 - rimIn);              // the corner at the rim's foot, where shadow and soil collect
        wearG = WGT[ti];
        if (v > rw - sf - 3 && v < rw + 48) Fz[k] = 1;
      }
      const cs = (0.3 + 0.7 * zone) * (1 - 0.5 * rimIn);             // crackle strength comes and goes; the rim top is rubbed nearly smooth
      const pa = (0.4 + 0.6 * sstep(-0.3, 0.3, pw)) * (1 - 0.28 * rimIn) * (0.55 + 0.45 * sh);
      // the nicks: a small broken face running in from the edge, rough and dark where the crust has not grown back
      if (facet > 0) facet = sstep(0.3, 0.62, facet + 0.16 * mid + 0.06 * g1);
      // where the rim is handled most — the crown of the rounded shoulder, the inner arris — the crust is rubbed thin
      // and the dark skin of the metal shows through it in long soft patches
      let wear = 0;
      if (wearG > 0 && rimIn > 0.4) {
        const c0 = (ins - 0.5 * ws) / (0.5 * ws), c1 = (v - (rw - sf - 6)) / 9;
        const band = Math.max(Math.exp(-c0 * c0), 0.8 * Math.exp(-c1 * c1));
        wear = wearG * band * sstep(-0.25, 0.35, 0.6 * mid + 0.5 * lump + 0.25 * (peb - 0.5)) * (1 - facet);
      }

      // ── burial soil: thick, pale and cracked in the middle of the patch; toward its margin it thins to clods lying
      // between the pebbles (whose tops stay green), then to loose crumbs, then to a stain in the crust ──
      const sb = Sm[k] / 255, halo = Sw[k] / 255, cor = B(cCor);
      const nearK = Math.min(1, halo * 8 + foot * 1.2);             // 0 well away from any soil: no stray specks out there
      let sm = sb * 1.3 * (1 - 0.7 * rimIn) + (0.42 * sn + 0.14 * mid + 0.03 * g1) * (0.5 + 0.5 * nearK);
      if (foot > 0 || rimIn > 0) {                                  // soil packed here and there into the corner under the rim
        const corner = foot * (1 - rimIn) * sstep(0.35, 0.95, foot);
        sm = Math.max(sm, corner * (0.2 + 0.75 * cor) + 0.3 * sn + 0.08 * mid);
      }
      const soilNear = halo > 0.012 || foot > 0.02 || sm > 0.3;
      let clod = 0, clodId = 0.5;
      if (soilNear) { cell(x / 10.5 + 3 + w1 * 0.3, y / 10.5 + 9 + w2 * 0.3); clod = 1 - Math.min(1, cD1 * 3); clodId = cId; }
      const film = sm + 0.32 * (0.42 - peb) + 0.16 * crack + (0.1 * groove2 + 0.1 * (clodId - 0.5) + 0.06 * (clod - 0.5)) * nearK;
      const thick = sstep(0.6, 0.92, sm);
      let soil = sstep(0.42, 0.58, film) * (0.84 + 0.16 * thick), crumb = 0;
      if (soilNear && soil < 0.9) {                                 // crumbs: single clods lying loose around the patch, fewer the further out
        const far = Math.min(1, halo * 3.2);
        if (clodId > 1 - 0.08 * far * far) {                        // (ragged little lumps, not discs)
          crumb = 0.9 * sstep(0.44 + 1.6 * (1 - clodId), 0.76, clod + 0.22 * g1 + 0.12 * (0.5 - peb));
          if (crumb > soil) soil = crumb; else crumb = 0;
        }
      }
      let sand = 0, sandId = 0.5, mc = 0;
      if (soil > 0.02) {
        cell(x / 4.6 + 31.3, y / 4.6 - 12.7); sand = 1 - Math.min(1, cD1 * 3.2); sandId = cId;          // grains of sand in the loess
        if (thick > 0.15) {                                         // the thick part has dried and split: a few hairline cracks, not a net
          cell(x / 66 + 7.1 + w1 * 0.05, y / 66 - 3.3 + w2 * 0.05);
          mc = (1 - sstep(0.006, 0.03, Math.sqrt(cD2) - Math.sqrt(cD1))) * sstep(0.15, 0.6, thick) * sstep(-0.3, 0.2, mid + 0.6 * lump);
        }
      }
      const near = Math.min(1, halo * 5 + foot * 2);                // brown only seeps where there is soil nearby…
      const gather = 0.25 + 0.75 * sstep(-0.1, 0.35, cor + 0.5 * sn);   // …and not as a ring: it gathers on some sides of the patch
      const seep = sstep(0.18, 0.5, sm) * (1 - soil) * near * gather * (0.4 + 0.6 * (1 - peb));
      const stain = sstep(0.06, 0.75, halo * 1.9 + 0.3 * sn + 0.12 * mid) * (1 - soil);

      // fissures: the pale bloom gathers between the pebbles along the crack, so its edges are scalloped and it comes and goes
      const fld = 1 - rimIn, vraw = Vc[k] / 255, vw = (Vw[k] / 255) * fld;
      let vc = 0;
      if (vraw > 0.01) {
        const along = sstep(-0.35, 0.25, pw + 0.5 * mid);
        const flank = sstep(0.1, 0.44, vraw * (0.84 + 0.34 * along) + 0.22 * (0.45 - peb) * Math.min(1, vraw * 4));
        vc = (0.56 * flank + 0.44 * sstep(0.66, 0.92, vraw)) * fld * (0.74 + 0.26 * along);
      }
      const pit = id2 > 0.972 && lump + 0.6 * mid < 0.05 ? peb : 0, crys = id2 < 0.045 ? peb : 0;

      const det = (1 - 0.8 * soil) * (1 - 0.85 * facet) * (1 - 0.4 * wear);
      const soilH = soil * (0.5 + 2.0 * thick);
      const hs = hRim + (2.5 * lump * (1 - 0.5 * rimIn) + 1.0 * mid * (1 - 0.35 * rimIn)) * (0.45 + 0.55 * sh)
        + det * cs * (1.5 * dome1 - 2.4 * crack)
        + det * (pa * (1.5 * peb - 0.45 * groove2) - 1.6 * pit + 0.7 * crys)
        - (3.2 * vw + 2.3 * vc) * (1 - 0.6 * soil)
        + soilH + soil * (0.3 * peb * (1 - thick) + 0.7 * clod + 0.35 * sand + 0.8 * sn - 0.5 * crack - 1.3 * mc) + 1.1 * crumb
        - facet * (1.6 + 1.1 * mid) - 0.4 * wear;
      Hs[k] = hs;
      Hh[k] = hs + (0.3 * g1 + 0.13 * g2) * (1 - 0.4 * soil) * (1 + 1.6 * facet);
      Hr[k] = hRim + soilH;
      if (soilNear && halo > 0.012) Fz[k] = 1;

      // albedo: one family of greens — malachite in the middle, deeper in the hollows, tender on the high, powdery spots
      const bloom = sstep(0.05, 0.6, cor + 0.45 * mid) * (1 - 0.6 * rimIn);                      // powdery, paler malachite lying in patches
      let t = 0.47 + 0.2 * lump + 0.11 * mid + 0.1 * pw + 0.09 * (peb - 0.45) * pa + 0.08 * (dome1 - 0.6) * cs + 0.035 * g1 + 0.2 * crys + 0.1 * vw
        + 0.07 * (id1 - 0.5) * (1 - 0.6 * rimIn) + 0.09 * (id2 - 0.5) + 0.1 * bloom;
      t = t < 0.2 ? 0.2 : t > 1 ? 1 : t;
      let li = ((t * 255) | 0) * 3;
      let cr = GREEN[li], cg = GREEN[li + 1], cb = GREEN[li + 2];
      const hu = B(cHue);
      const hw = hu + 0.08 + 0.2 * (id1 - 0.5) * (1 - 0.5 * rimIn);
      if (hw > 0) { cr += hw * 46; cg += hw * 15; cb -= hw * 32; } else { cr += hw * 16; cg += hw * 8; }   // toward yellow-green / a shade deeper — never toward blue
      // the rim: a shade deeper, more so where it is rubbed
      const rk = rimIn * (0.32 + 0.2 * sstep(0, 0.45, lump)); cr += (30 - cr) * rk; cg += (102 - cg) * rk; cb += (56 - cb) * rk;
      // crackle & pits go dark (brown where the soil has stained them)
      const dk = Math.min(1, det * (0.12 * groove2 * pa + 0.75 * pit));
      cr += (16 + 66 * seep - cr) * dk; cg += (66 - cg) * dk; cb += (40 - 14 * seep - cb) * dk;
      const ck = det * crack * cs * (0.4 - 0.22 * rimIn) * (1 - 0.8 * seep);
      cr += (146 - cr) * ck; cg += (206 - cg) * ck; cb += (124 - cb) * ck;
      // fissures: pale tender green, the powdery bloom that fills a crack
      const vk = Math.min(1, vc * 1.25) * (0.82 + 0.1 * g1 + 0.1 * (peb - 0.5)) * (1 - 0.7 * soil);
      cr += (164 - cr) * vk; cg += (218 - cg) * vk; cb += (134 - cb) * vk;
      // the green yellows around the soil, a brown seep where it has run, then the soil itself
      if (stain > 0) { const s1 = stain * 0.6; cr += (168 - cr) * s1; cg += (184 - cg) * s1; cb += (72 - cb) * s1; }
      if (seep > 0) { const s2 = seep * (0.46 + 0.2 * mid); cr += (128 - cr) * s2; cg += (96 - cg) * s2; cb += (40 - cb) * s2; }
      if (soil > 0) {
        let ts = 0.43 + 0.3 * thick + 0.2 * sn + 0.14 * mid + 0.1 * (clod - 0.4) + 0.1 * (clodId - 0.5) + 0.05 * g1 - 0.3 * crack - 0.4 * mc
          - 0.14 * (gather - 0.25) * (1 - thick) + 0.14 * crumb;                                          // damper, browner where it has seeped; loose crumbs are dry and pale
        if (sandId > 0.9) ts += 0.28 * sand; else if (sandId < 0.07) ts -= 0.4 * sand;                  // a few pale grains, a few dark ones
        ts = ts < 0 ? 0 : ts > 1 ? 1 : ts; li = ((ts * 255) | 0) * 3;
        cr += (SOIL[li] - cr) * soil; cg += (SOIL[li + 1] - cg) * soil; cb += (SOIL[li + 2] - cb) * soil;
      }
      // thin crust on the rubbed parts of the rim: darker and browner; the broken faces of the nicks are browner still
      if (wear > 0) { const wk = wear * (0.34 + 0.3 * peb); cr += (58 - cr) * wk; cg += (64 - cg) * wk; cb += (38 - cb) * wk; }
      if (facet > 0) { const fk = facet * (0.74 + 0.2 * g1); cr += (88 + 26 * mid - cr) * fk; cg += (62 + 14 * mid - cg) * fk; cb += (38 - cb) * fk; }
      // the very edge: a thin deeper line where the crust is thinnest, heavier in some stretches than in others
      if (eTint > 0) { const ek = eTint * (1 - sstep(0.4, 3.6, ins)); cr += (26 - cr) * ek; cg += (64 - cg) * ek; cb += (38 - cb) * ek; }

      const o = k * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = cov * 255;
      Ao[k] = 1 - 0.1 * foot - 0.1 * dk;
      Gs[k] = peb * (id2 > 0.55 ? 1 : 0.16) * (1 - 0.9 * soil) * (1 - 0.5 * rimIn) * (1 - facet) + 0.5 * crys + (sandId > 0.9 ? 0.5 * sand * soil : 0);
      Gl[k] = (0.2 + 0.8 * sstep(0.3, 0.62, id1 + 0.3 * lump)) * (1 - 0.92 * soil) * (0.55 + 0.45 * zone) * (1 - 0.8 * facet) * (1 - 0.3 * vw);   // some plates are waxy, some chalky
    }
  }
  // the outline as an image (white, alpha = coverage): the shadow on the paper is made from it
  const sil = L.makeCanvas(RW, RH);
  {
    const im = new ImageData(RW, RH), sd = im.data;
    for (let k = 0; k < N; k++) { const o = k * 4; sd[o] = sd[o + 1] = sd[o + 2] = 255; sd[o + 3] = d[o + 3]; }
    sil.getContext('2d').putImageData(im, 0, 0);
  }

  // ── pass 2: light it. Key from the upper left, high and soft; fill is implicit in the ambient term ──
  const nrm = (v) => { const m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; };
  const LK = nrm([-0.52, -0.6, 0.62]);
  const half = (az) => { const c = Math.cos(az), s = Math.sin(az); return nrm([LK[0] * c - LK[1] * s, LK[0] * s + LK[1] * c, LK[2] + 1]); };
  const HK = half(0), HA = half(-0.34), HB = half(0.34);
  const imA = new ImageData(RW, RH), imB = new ImageData(RW, RH), dA = imA.data, dB = imB.data;
  // the light's heading across the picture, and how fast its rays drop: what the rim's inner step shades is found by walking toward the light
  const LX = -LK[0] / Math.hypot(LK[0], LK[1]), LY = -LK[1] / Math.hypot(LK[0], LK[1]), DROP = 0.56;
  for (let j = 1; j < RH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, o = k * 4;
      if (d[o + 3] === 0) continue;
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * inv, ny = -hy * inv, nz = inv;
      const df = nx * LK[0] + ny * LK[1] + nz * LK[2];
      // cast shadow: crisp against the step, softer the further it falls; the tops of the pebbles catch the light first
      let shd = 0;
      if (Fz[k]) {
        let rel = 0.6 * (Hs[k] - Hr[k]); rel = rel < -0.7 ? -0.7 : rel > 2.2 ? 2.2 : rel;
        const base = Hr[k] + rel;
        for (let q = 1; q <= 14; q++) {
          const t = q * 2.2, px = i - LX * t, py = j - LY * t;
          if (px < 0 || py < 0) break;
          const x0 = px | 0, y0 = py | 0, tx = px - x0, ty = py - y0, kk = y0 * RW + x0;
          const hh = (Hr[kk] + (Hr[kk + 1] - Hr[kk]) * tx) * (1 - ty) + (Hr[kk + RW] + (Hr[kk + RW + 1] - Hr[kk + RW]) * tx) * ty;
          const oc = (hh - base - t * DROP) / (0.7 + 0.085 * t);
          if (oc > shd) shd = oc;
        }
        if (shd > 1) shd = 1;
      }
      let sh = 0.47 + 0.53 * (1 - 0.74 * shd) * (df > 0 ? df : 0) / LK[2];
      sh = (sh > 1.42 ? 1.42 : sh) * Ao[k];
      // broad light falloff: brightest upper-left, a touch deeper toward the lower right
      sh *= 1.09 - 0.19 * (i / RW) - 0.13 * (j / RH);
      // sheen and glints come off the smoother normal, so they sit on the pebbles as small soft shapes, not as pepper
      const sx = (Hs[k + 1] - Hs[k - 1]) * 0.5, sy = (Hs[k + RW] - Hs[k - RW]) * 0.5;
      const si = 1 / Math.sqrt(sx * sx + sy * sy + 1), mx = -sx * si, my = -sy * si, mz = si;
      const gs = Gs[k];
      const qx = (i + X0 - 660) / 600, qy = (j + Y0 - 800) / 330, hot = 0.4 + 0.9 * Math.exp(-(qx * qx + qy * qy));
      const sk = mx * HK[0] + my * HK[1] + mz * HK[2];
      let veil = 0, sp = 0;
      if (sk > 0) {
        veil = Math.pow(sk, 13) - 0.22; veil = veil > 0 ? veil * 0.42 * Gl[k] * hot : 0;                  // broad, greyish sheen on the flanks that face the light
        sp = Math.pow(sk, 28) * (0.1 + 0.34 * gs) * hot + veil;
        if (shd > 0) { veil *= 1 - shd; sp *= 1 - shd; }
      }
      d[o] = d[o] * sh * (1 - 0.35 * veil) + 204 * sp; d[o + 1] = d[o + 1] * sh * (1 - 0.35 * veil) + 236 * sp; d[o + 2] = d[o + 2] * sh * (1 - 0.35 * veil) + 200 * sp;
      if (gs > 0.3) {
        const sa = mx * HA[0] + my * HA[1] + mz * HA[2], sb = mx * HB[0] + my * HB[1] + mz * HB[2];
        const ga = sa > 0.9 ? Math.pow(sa, 90) * gs * 300 * hot : 0, gb = sb > 0.9 ? Math.pow(sb, 90) * gs * 300 * hot : 0;
        if (ga > 4) { dA[o] = 226; dA[o + 1] = 252; dA[o + 2] = 212; dA[o + 3] = ga > 255 ? 255 : ga; }
        if (gb > 4) { dB[o] = 226; dB[o + 1] = 252; dB[o + 2] = 212; dB[o + 3] = gb > 255 ? 255 : gb; }
      }
    }
  }
  const put = (im) => { const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(im, 0, 0); return c; };
  const coin = put(img), spA = put(imA), spB = put(imB);

  // ── depth of field: sharp around the crest, softening toward the ends of the edge and the bottom of the frame ──
  const fxp = 930 - X0, fyp = a.crestY + 130 - Y0;
  const m1 = focusMask(RW, RH, fxp, fyp, 430, 840, 0.62), m2 = focusMask(RW, RH, fxp, fyp, 760, 1260, 0.62);
  mixIn(coin, L.blurred(coin, 1.7), m1);
  mixIn(coin, L.blurred(coin, 5), m2);
  for (const sp of [spA, spB]) {                                   // glints only live where the crust is in focus
    const g = sp.getContext('2d'); g.globalCompositeOperation = 'destination-out'; g.drawImage(m1, 0, 0);
  }
  return { coin, spA, spB, sil, X0, Y0 };
}

/**
 * What the coin does to the paper beside it. The key light comes over the top edge, so nothing is thrown onto the sheet
 * here; what shows is the soft closing-in of a thick object (broad and faint), a little more of it toward the right where
 * the edge turns away from the light, and the dark line of contact. Built from the outline, so it follows every nick,
 * and drawn with the coin, so it turns with it.
 */
function buildShadow(env, sil, Y0) {
  const a = env.arc, w = sil.width;
  const YS = Y0 - 200, hh = Math.ceil(a.yAt(-PAD, 0)) + 130 - YS;
  const tint = L.makeCanvas(w, hh), tg = tint.getContext('2d');
  tg.drawImage(sil, 0, Y0 - YS);
  tg.globalCompositeOperation = 'source-in'; tg.fillStyle = 'rgb(60,56,30)'; tg.fillRect(0, 0, w, hh);
  const c = L.makeCanvas(w, hh), g = c.getContext('2d');
  for (const [blur, dx, dy, alpha] of [[44, 0, 0, 0.2], [22, 60, 4, 0.14], [9, 0, 0, 0.15], [2, 0.5, 0, 0.4]]) {
    g.filter = `blur(${blur}px)`; g.globalAlpha = alpha; g.drawImage(tint, dx, dy);
  }
  // …and a whisper of green bounced off the coin onto the sheet
  tg.globalCompositeOperation = 'source-in'; tg.fillStyle = 'rgb(70,150,84)'; tg.fillRect(0, 0, w, hh);
  g.filter = 'blur(30px)'; g.globalAlpha = 0.07; g.drawImage(tint, 0, 0);
  g.filter = 'none'; g.globalAlpha = 1;
  return { shadow: c, YS };
}

/**
 * Cream xuan paper (cropped: only the part above the coin is ever seen). At this magnification a sheet is a felt of long
 * bast fibres; it lies a coin's thickness behind the plane of focus, so the felt is soft. Clean and even: the only
 * texture is that mat of fibres, a few of them lying proud with a hair of shadow on the side away from the light.
 */
function buildPaper(env) {
  const a = env.arc;
  const pw = W + PAD * 2, ph = Math.ceil(a.yAt(-PAD, 0)) + 60 + PAD;
  const c = L.makeCanvas(pw, ph), g = c.getContext('2d');
  g.drawImage(L.paperTex(pw, ph, { base: '#f1e5cc', seed: 's09paper', tone: '#b79c6c', fiber: 0, stain: 0.07, grain: 0.12 }), 0, 0);
  // the felt: broad, pale, overlapping fibres (and some that lie in shade between them)
  const felt = L.makeCanvas(pw, ph), fg = felt.getContext('2d');
  const r = L.rng('s09fibre');
  fg.lineCap = 'round';
  const fibre = (len, wid, lift) => {
    const x = r.range(-40, pw + 40), y = r.range(-40, ph + 40), ang = r.range(0, Math.PI), bend = r.range(-0.9, 0.9);
    const mx = x + Math.cos(ang + bend) * len * 0.5, my = y + Math.sin(ang + bend) * len * 0.5, ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    const line = (dx, dy) => { fg.beginPath(); fg.moveTo(x + dx, y + dy); fg.quadraticCurveTo(mx + dx, my + dy, ex + dx, ey + dy); fg.stroke(); };
    fg.lineWidth = wid;
    if (lift > 0) { fg.strokeStyle = L.rgba('#9c8250', lift * 0.4); line(0.9, 1); fg.strokeStyle = L.rgba('#fff6e0', lift); line(0, 0); }
    else if (r.chance(0.62)) { fg.strokeStyle = L.rgba('#fff6e0', r.range(0.05, 0.13)); line(0, 0); }
    else { fg.strokeStyle = L.rgba('#a28a58', r.range(0.01, 0.026)); line(0, 0); }
  };
  for (let i = 0; i < 3200; i++) fibre(r.range(24, 120), r.range(2.2, 4.6), 0);
  for (let i = 0; i < 70; i++) fibre(r.range(30, 110), r.range(1.4, 2.2), r.range(0.06, 0.11));
  g.drawImage(L.blurred(felt, 1.3), 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.16;                                 // the tooth of the sheet
  g.fillStyle = g.createPattern(L.noiseTex(512, 512, { seed: 's09tooth', scale: 3.6, octaves: 2, res: 1, contrast: 1.5 }), 'repeat');   // grain this fine can tile unseen
  g.fillRect(0, 0, pw, ph);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.translate(PAD, PAD);
  // a very few flecks of bark left in the pulp
  L.speckle(g, { seed: 's09speck', count: 120, x: -PAD, y: -PAD, w: pw, h: ph, rMin: 0.8, rMax: 1.8, colors: ['#a88c56', '#8f7646'], alpha: [0.08, 0.22] });
  // soft, bright light pooled left of centre, falling off into the corners
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.radial(g, 880, 330, 300, 1560, [[0, '#ffffff'], [0.5, '#faf5ea'], [1, '#ece2d0']]);
  g.fillRect(-PAD, -PAD, pw, ph);
  g.globalCompositeOperation = 'source-over';
  // the sheet falls further out of focus toward the far corners, like the coin
  const fx = 930 + PAD, fy = a.crestY + 130 + PAD;
  mixIn(c, L.blurred(c, 2.4), focusMask(pw, ph, fx, fy, 700, 1300, 0.62));
  return c;
}

export default {
  name: '绿锈五铢',
  tone: 'dark',
  init(env) {
    const coin = buildCoin(env);
    S = { paper: buildPaper(env), ...coin, ...buildShadow(env, coin.sil, coin.Y0) };
  },
  draw(ctx, env, p) {
    const rot = L.lerp(-0.0065, 0.0065, p), zoom = L.lerp(0.994, 1.014, p);
    // the paper stays put (it only breathes with the push-in); the coin turns a hair about its own centre
    L.cam(ctx, env, { zoom, rot: rot * 0.1 }, () => ctx.drawImage(S.paper, -PAD, -PAD));
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.drawImage(S.shadow, S.X0, S.YS);
      ctx.drawImage(S.coin, S.X0, S.Y0);
      // glints: the pebbles that catch the light change as the coin turns
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 1 - sstep(0.1, 0.8, p); ctx.drawImage(S.spA, S.X0, S.Y0);
      ctx.globalAlpha = sstep(0.2, 0.9, p); ctx.drawImage(S.spB, S.X0, S.Y0);
    });
  },
};
