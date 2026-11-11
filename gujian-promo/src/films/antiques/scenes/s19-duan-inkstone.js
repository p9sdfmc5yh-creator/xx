// s19 — 端砚墨池. Looking straight down on a round Duan inkstone in a black room:
// the arc is the outer edge of its raised rim (砚边), caught by an iridescent rim light — orange-red at the very edge,
// then violet, then blue, soft like the oil sheen on ink. Inside the rim the grinding floor (砚堂) lies slightly out of
// focus: purple stone with a pale cloud of 鱼脑冻, a dusting of blue 青花 specks, a couple of 石眼, and a pool of
// wet overnight ink that mirrors the rim light as a faint blue-violet band.
//
// Everything is shaded per pixel once in init():
//   · stone  — half resolution (it is meant to be a touch soft), flat top-down mapping, then fine details in vector;
//   · rim    — full resolution in polar coords (u along the arc, depth below it), so the bands stay concentric;
//   · two ripple phases of the reflection in the ink, cross-faded per frame so the surface trembles.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 130;
let S = null;

const sq = (v) => v * v;
// smoothstep that also works with a > b (falling edge)
const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
function lut(stops, n = 512) {
  const f = L.makeRamp(stops), o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}

// ── the ink pool: an organic blob in frame coordinates ──
const PX = 1128, PY = 1008, RX = 366, RY = 166;
let nP = null;
let pSd = 0, pPhi = 0;        // signed distance to the pool edge (px, < 0 inside) and bearing (0 = up the frame)
function edgeR(sn, cs) {
  const phi = Math.atan2(sn, cs);
  return 1 + 0.07 * Math.sin(phi * 2 + 0.7) + 0.045 * Math.sin(phi * 3 + 2.1) + 0.03 * nP.n2(sn * 1.4 + 3.1, cs * 1.4 - 1.2) + 0.007 * nP.n2(sn * 4.6 - 9, cs * 4.6 + 4);
}
function pool(x, y) {
  const ex = (x - PX) / RX, ey = (y - PY) / RY;
  const rho = Math.sqrt(ex * ex + ey * ey) || 1e-6;
  const sn = ex / rho, cs = -ey / rho;
  pPhi = Math.atan2(sn, cs);
  pSd = (rho - edgeR(sn, cs)) * Math.sqrt(sq(RX * sn) + sq(RY * cs));
}

/** the stone floor + the ink pool (everything below the arc) */
function buildStone(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 8;
  const FW = W + PAD * 2, FH = H + PAD - Y0;
  const RES = 0.5, cw = Math.ceil(FW * RES), ch = Math.ceil(FH * RES);
  const nA = L.makeNoise('s19a'), nB = L.makeNoise('s19b'), nC = L.makeNoise('s19c');
  const TONE = lut([[0, '#21142a'], [0.5, '#452e57'], [1, '#71508a']]);
  const img = new ImageData(cw, ch), d = img.data;
  for (let j = 0; j < ch; j++) {
    const y = Y0 + (j + 0.5) / RES, ddy = cy - y;
    for (let i = 0; i < cw; i++) {
      const x = X0 + (i + 0.5) / RES, ddx = x - cx;
      const dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      const o = (j * cw + i) * 4;
      d[o + 3] = 255;
      if (dr > -84) { d[o] = 5; d[o + 1] = 6; d[o + 2] = 16; continue; }   // hidden under the rim light
      pool(x, y);
      const sd = pSd, up = Math.max(0, Math.cos(pPhi));
      let r, g, b;
      if (sd < -12) {
        // deep ink: near-black, with a breath of blue where it faces the rim
        const gl = Math.exp(-sq((sd + 70) / 70)) * Math.pow(up, 1.3);
        r = 4 + 4 * gl; g = 3 + 4 * gl; b = 7 + 13 * gl;
      } else {
        // ── the stone ──
        const wx = nB.fbm(x / 310 + 11.3, y / 310 - 4.1, 2), wy = nB.fbm(x / 310 - 27.7, y / 310 + 13.9, 2);
        const t1 = nA.fbm(x / 560, y / 560, 3);
        const t2 = nA.fbm(x / 190 + wx * 0.4 + 40, y / 190 + wy * 0.4, 4, 2, 0.5);
        const t3 = nB.fbm(x / 30 + 7, y / 30, 2);
        let k = 0.47 + 0.3 * t1 + 0.2 * t2 + 0.05 * t3; k = k < 0 ? 0 : k > 1 ? 1 : k;
        const ti = ((k * 511) | 0) * 3;
        r = TONE[ti]; g = TONE[ti + 1]; b = TONE[ti + 2];
        const hs = nC.fbm(x / 430 + 3, y / 430 + 8, 2);       // liver-purple ↔ blue-purple drift
        r *= 1 + 0.12 * hs; b *= 1 - 0.07 * hs;
        // 鱼脑冻: a pale, cloud-like bloom inside the stone, ringed by a warmer wine-purple
        const cl = nC.fbm(x / 250 + wx * 0.5, y / 250 + wy * 0.5, 3, 2, 0.5) * 0.5 + 0.5;
        // a thin pale mist drifting through the whole stone
        const mist = sstep(0.5, 0.86, cl + 0.25 * t2) * 0.2;
        r += (128 - r) * mist; g += (122 - g) * mist; b += (150 - b) * mist;
        const e1 = Math.exp(-(sq((x - 440) / 360) + sq((y - 985) / 150)));
        const e2 = Math.exp(-(sq((x - 1720) / 220) + sq((y - 1010) / 120)));
        const e3 = 0.66 * Math.exp(-(sq((x - 800) / 170) + sq((y - 800) / 42)));
        const ev = Math.max(e1, e2, e3);
        if (ev > 0.04) {
          const cr = cl * 0.5 + ev * 0.95 - 0.78;
          const cloud = sstep(0, 0.44, cr), fire = sstep(-0.4, 0.08, cr) * (1 - cloud);
          if (cloud > 0) {
            // cotton-like puffs: soft lumps of denser white inside the cloud
            const puff = sstep(-0.45, 0.5, nC.fbm(x / 88 + 9 + wx * 0.5, y / 88 - 3 + wy * 0.5, 3, 2, 0.5));
            const m = cloud * (0.34 + 0.56 * puff), lump = 0.8 + 0.2 * puff;
            r += (168 * lump - r) * m; g += (163 * lump - g) * m; b += (196 * lump - b) * m;
          }
          r *= 1 + 0.12 * fire; g *= 1 - 0.09 * fire; b *= 1 - 0.02 * fire;
        }
        // light: the rim throws its shadow onto the floor; a soft pool of fill light left of centre
        const shade = sstep(-124, -262, dr);
        const spot = Math.exp(-(sq((x - 830) / 1000) + sq((y - 940) / 470)));
        const li = shade * (0.36 + 0.92 * spot);
        r *= li; g *= li; b *= li;
        // the polished floor returns a soft violet sheen of the rim light
        const sheen = Math.exp(-sq((dr + 322) / 88)) * (0.35 + 0.65 * spot);
        r += 9 * sheen; g += 7 * sheen; b += 22 * sheen;
        // ── wet ink on the stone ──
        if (sd < 240) {
          const wn = nA.fbm(x / 120 + 50, y / 120 + 50, 3);
          const wet = sstep(70 + 46 * wn, 8, sd);                    // damp halo: darker, deeper colour
          const wk = 1 - 0.24 * wet; r *= wk; g *= wk * 0.97; b *= wk * 1.05;
          const film = sstep(13 + 7 * wn, -2, sd) * 0.42;            // the ink thins to a film at its fringe
          r += (5 - r) * film; g += (4 - g) * film; b += (10 - b) * film;
          const ink = sstep(3, -9, sd);
          r += (5 - r) * ink; g += (4 - g) * ink; b += (10 - b) * ink;
        }
      }
      // blue bounce from the rim light just inside the rim
      const bl = Math.exp(-sq((dr + 122) / 52));
      d[o] = r + 3 + 9 * bl; d[o + 1] = g + 3 + 13 * bl; d[o + 2] = b + 7 + 50 * bl;
    }
  }
  const small = L.makeCanvas(cw, ch);
  small.getContext('2d').putImageData(img, 0, 0);
  const cnv = L.makeCanvas(FW, FH), g = cnv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, FW, FH);

  // ── fine details in vector, then softened to sit in the same shallow focus ──
  const det = L.makeCanvas(FW, FH), dg = det.getContext('2d');
  dg.translate(-X0, -Y0);
  const onFloor = (x, y) => { if (a.drAt(x, y) > -150) return false; pool(x, y); return pSd > 10; };
  // 青花: clusters of tiny blue specks, each sitting in a faint blue haze
  const rs = L.rng('s19qinghua');
  const clusters = [[900, 770, 110, 30, 210], [1610, 868, 80, 40, 200], [235, 975, 80, 40, 130]];
  for (const [qx, qy, sx, sy, n] of clusters) {
    dg.fillStyle = L.radial(dg, qx, qy, 0, sx * 1.5, [[0, 'rgba(58,110,220,0.2)'], [1, 'rgba(58,110,220,0)']]);
    dg.save(); dg.translate(qx, qy); dg.scale(1, sy / sx); dg.translate(-qx, -qy); dg.fillRect(qx - sx * 1.6, qy - sx * 1.6, sx * 3.2, sx * 3.2); dg.restore();
    for (let i = 0; i < n; i++) {
      const x = qx + rs.gauss() * sx * 0.62, y = qy + rs.gauss() * sy * 0.62;
      if (!onFloor(x, y)) continue;
      const rad = L.lerp(0.9, 3.1, Math.pow(rs(), 2.2));
      dg.globalAlpha = rs.range(0.3, 0.8);
      dg.fillStyle = rs.pick(['#4c8ee0', '#3a6ccc', '#5fa8dc', '#2f56b0', '#4478d4']);
      dg.beginPath(); dg.ellipse(x, y, rad, rad * rs.range(0.6, 1), rs() * Math.PI, 0, L.TAU); dg.fill();
    }
  }
  dg.globalAlpha = 1;
  // 石眼: ringed "eyes" with a dark pupil, pale yellow-green like a bird's eye
  const eye = (x, y, rad, tilt) => {
    dg.save(); dg.translate(x, y); dg.rotate(tilt); dg.scale(1, 0.9);
    dg.fillStyle = L.radial(dg, 0, 0, rad * 0.8, rad * 1.8, [[0, 'rgba(12,6,16,0.4)'], [1, 'rgba(12,6,16,0)']]);
    dg.beginPath(); dg.arc(0, 0, rad * 1.8, 0, L.TAU); dg.fill();
    dg.fillStyle = L.radial(dg, 0, 0, 0, rad, [[0, '#120c16'], [0.22, '#18111b'], [0.33, '#3e452c'], [0.46, '#7b8650'], [0.58, '#58623a'],
      [0.66, '#383d2c'], [0.76, '#6a734c'], [0.88, '#4f4d46'], [1, 'rgba(70,56,80,0)']]);
    dg.beginPath(); dg.arc(0, 0, rad, 0, L.TAU); dg.fill();
    dg.restore();
  };
  eye(1404, 796, 26, 0.3);
  eye(626, 874, 16, -0.5);
  g.drawImage(L.blurred(det, 2.3), 0, 0);

  // stray drops of ink beside the pool
  const drops = [[716, 944, 11, 9.2], [1556, 946, 13, 10.5], [778, 880, 5, 4.4], [1594, 884, 6, 5.2], [1672, 962, 4.2, 3.8]];
  for (const [x, y, rx, ry] of drops) {
    g.save(); g.translate(x - X0, y - Y0); g.scale(1, ry / rx);
    g.fillStyle = L.radial(g, 0, 0, 0, rx * 1.3, [[0, '#05040a'], [0.7, '#05040a'], [1, 'rgba(5,4,10,0)']]);
    g.beginPath(); g.arc(0, 0, rx * 1.3, 0, L.TAU); g.fill(); g.restore();
  }

  // meniscus: the ink climbs the stone at its edge and catches the rim light as a thin bright line
  const men = L.makeCanvas(FW, FH), mg = men.getContext('2d');
  mg.translate(-X0, -Y0); mg.lineCap = 'round';
  const N = 150, pts = [];
  for (let i = 0; i <= N; i++) {
    const phi = L.lerp(-1.75, 1.75, i / N), sn = Math.sin(phi), cs = Math.cos(phi);
    const k = edgeR(sn, cs) - 5.5 / Math.sqrt(sq(RX * sn) + sq(RY * cs));
    pts.push([PX + RX * k * sn, PY - RY * k * cs, phi]);
  }
  for (let i = 0; i < N; i++) {
    const [x0, y0, phi] = pts[i], [x1, y1] = pts[i + 1];
    const al = Math.pow(Math.max(0, Math.cos(phi * 0.9)), 1.6) * (0.55 + 0.45 * nP.n2(phi * 4.2, 17.5)) * (0.75 + 0.25 * Math.exp(-sq((phi + 0.35) / 0.4)));
    mg.strokeStyle = `rgba(112,116,255,${(0.22 * al).toFixed(3)})`; mg.lineWidth = 6; mg.beginPath(); mg.moveTo(x0, y0 + 1.5); mg.lineTo(x1, y1 + 1.5); mg.stroke();
    mg.strokeStyle = `rgba(214,206,255,${(0.62 * al).toFixed(3)})`; mg.lineWidth = 1.7; mg.beginPath(); mg.moveTo(x0, y0); mg.lineTo(x1, y1); mg.stroke();
  }
  for (const [x, y, rx, ry] of drops) {
    mg.strokeStyle = 'rgba(190,186,255,0.85)'; mg.lineWidth = Math.max(1.2, rx * 0.16);
    mg.beginPath(); mg.ellipse(x, y, rx * 0.8, ry * 0.8, 0, -Math.PI * 0.88, -Math.PI * 0.2); mg.stroke();
    mg.fillStyle = 'rgba(244,240,255,0.95)'; mg.beginPath(); mg.ellipse(x - rx * 0.28, y - ry * 0.36, rx * 0.2, ry * 0.13, -0.5, 0, L.TAU); mg.fill();
  }
  g.globalCompositeOperation = 'screen';
  g.drawImage(L.blurred(men, 0.9), 0, 0);
  // fine mineral grain so the soft stone does not go plastic
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55;
  g.drawImage(L.grainTex(FW, FH, { seed: 's19grain', amount: 0.2 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return { cnv, x0: X0, y0: Y0 };
}

// a tapered highlight that follows the pool edge at `inset` px, between bearings p0..p1 (half-width hw at its middle)
function crescent(phi, dep, p0, p1, inset, hw) {
  const u = (phi - p0) / (p1 - p0);
  if (u <= 0 || u >= 1) return 0;
  const w = hw * Math.pow(Math.sin(Math.PI * u), 0.7);
  return w < 0.6 ? 0 : sstep(w, w * 0.45, Math.abs(dep - inset));
}

/** one ripple phase of what the wet ink mirrors: the rim light, upside down (blue nearest the edge, then violet, a last trace of orange) */
function buildRefl(ph) {
  const X0 = Math.floor(PX - RX * 1.25), Y0 = Math.floor(PY - RY * 1.3);
  const FW = Math.ceil(RX * 2.5), FH = Math.min(H + PAD, Math.ceil(PY + RY * 1.3)) - Y0;
  const RES = 0.5, cw = Math.ceil(FW * RES), ch = Math.ceil(FH * RES);
  const nR = L.makeNoise('s19refl');
  const BAND = lut([[0, '#3a7bff'], [0.45, '#5f6cff'], [1, '#b04cff']]);
  const img = new ImageData(cw, ch), d = img.data;
  for (let j = 0; j < ch; j++) {
    const y = Y0 + (j + 0.5) / RES;
    for (let i = 0; i < cw; i++) {
      const x = X0 + (i + 0.5) / RES;
      pool(x, y);
      if (pSd > -3) continue;
      const dep = -pSd, up = Math.max(0, Math.cos(pPhi));
            const rip = 7 * nR.n2(x / 170 + ph * 2.3, y / 34 + ph * 5.1) + 2.5 * nR.n2(x / 60 - ph * 3.7, y / 14 + ph);
      const s = dep + 0.4 * rip * sstep(4, 30, dep);
      // the faintest mirror image of the rim light: blue nearest the edge, sinking into violet
      const t = (s - 8) / 120, bi = ((t < 0 ? 0 : t > 1 ? 1 : t) * 511 | 0) * 3;
      const al = sstep(6, 30, s) * sstep(150, 34, s) * Math.pow(up, 0.85) * (0.72 + 0.28 * nR.n2(x / 240 + ph, y / 90)) * 0.4;
      // two crisp specular crescents riding the swell of the liquid just inside its edge
      const sc = dep + rip * 0.45;
      const c1 = crescent(pPhi, sc, -1.22, -0.1, 25, 9.5), c2 = 0.6 * crescent(pPhi, sc, 0.3, 0.95, 20, 4.6);
      const g1 = crescent(pPhi, sc, -1.3, -0.02, 25, 19) * 0.34 + crescent(pPhi, sc, 0.22, 1.03, 20, 12) * 0.2;
      const cc = Math.max(c1, c2);
      const fade = sstep(2, 12, dep);
      const hk = L.clamp((pPhi + 1.2) / 2.2);                                     // the highlight cools to blue on the left, warms to lilac on the right
      const pr = (BAND[bi] * al + (84 + 60 * hk) * g1 + (204 + 42 * hk) * cc) * fade, pg = (BAND[bi + 1] * al + (112 - 30 * hk) * g1 + (222 - 12 * hk) * cc) * fade, pb = (BAND[bi + 2] * al + 255 * g1 + 255 * cc) * fade;
      const m = Math.max(pr, pg, pb);
      if (m < 1) continue;
      const o = (j * cw + i) * 4, av = Math.min(1, m / 255);
      d[o] = pr / av; d[o + 1] = pg / av; d[o + 2] = pb / av; d[o + 3] = av * 255;
    }
  }
  const small = L.makeCanvas(cw, ch);
  small.getContext('2d').putImageData(img, 0, 0);
  const cnv = L.makeCanvas(FW, FH), g = cnv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, FW, FH);
  return { cnv, x0: X0, y0: Y0 };
}

/** the iridescent rim light hugging the arc: orange-red → violet → blue from the outside in */
function buildRim(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const DEEP = 178;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 96;
  const FW = W + PAD * 2, FH = Math.ceil(a.yAt(X0, -DEEP)) + 6 - Y0;
  const n1 = L.makeNoise('s19rim1'), n2 = L.makeNoise('s19rim2');
  const RAMP = lut([[0, '#e2330c'], [0.06, '#ff5f1e'], [0.16, '#ff8a3a'], [0.25, '#ffa562'], [0.32, '#ff7f9c'], [0.4, '#d250f2'],
    [0.5, '#a846ff'], [0.61, '#8448ff'], [0.71, '#5a62ff'], [0.8, '#3a7bff'], [0.9, '#2150d6'], [1, '#0d2070']], 1024);
  const img = new ImageData(FW, FH), d = img.data;
  for (let j = 0; j < FH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = 0; i < FW; i++) {
      const ddx = X0 + i + 0.5 - cx;
      const dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      if (dr > 2.6 || dr < -DEEP) continue;
      const u = Math.atan2(ddx, ddy) * R, dep = -dr;
      // the film is not perfectly even: its thickness breathes along the rim and the colour bands waver inside it
      const T = 130 * (1 + 0.04 * n1.n2(u / 620, 1.7) + 0.012 * n1.n2(u / 190, 9.2));
      let v = dep / T;
      const wg = sstep(0.05, 0.4, v);
      v += wg * (0.026 * n2.fbm(u / 340, dep / 80, 2) + 0.01 * n2.n2(u / 900 + 5, dep / 6.5));
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const li = ((v * 1023) | 0) * 3;
      const inten = 0.9 + 0.1 * n1.n2(u / 430 + 30, 4.4) + 0.035 * n2.n2(u / 26, dep / 26);
      const al = sstep(2.4, -2.4, dr) * sstep(1, 0.75, v);
      const o = (j * FW + i) * 4;
      d[o] = RAMP[li] * inten; d[o + 1] = RAMP[li + 1] * inten; d[o + 2] = RAMP[li + 2] * inten; d[o + 3] = al * 255;
    }
  }
  const cnv = L.makeCanvas(FW, FH);
  cnv.getContext('2d').putImageData(img, 0, 0);
  return { cnv, bloom: L.blurred(cnv, 15), x0: X0, y0: Y0 };
}

/** blit a cropped piece (top-left at frame coords x0,y0) with the usual camera: rot about the arc centre, zoom about the crest */
function put(ctx, env, piece, o = {}) {
  const { rot = 0, zoom = 1, dx = 0, dy = 0, alpha = 1, blend = 'source-over', src = null } = o;
  const a = env.arc;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = blend;
  ctx.translate(a.cx + dx, a.crestY + dy); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(src || piece.cnv, piece.x0, piece.y0);
  ctx.restore();
}

export default {
  name: '端砚墨池',
  tone: 'light',
  init(env) {
    nP = L.makeNoise('s19pool');
    S = { stone: buildStone(env), reflA: buildRefl(0), reflB: buildRefl(1), rim: buildRim(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = '#040404'; ctx.fillRect(0, 0, W, H);
    // slow push-in on the stone; the rim light is drawn un-zoomed so its edge never leaves the arc
    const rot = L.lerp(-0.004, 0.004, p), zoom = L.lerp(1.0, 1.022, p);
    ctx.save(); a.clipBelow(ctx, 1);
    put(ctx, env, S.stone, { rot, zoom });
    // the reflection in the ink trembles: two ripple phases cross-fade and nudge against each other
    const w = 0.5 + 0.5 * Math.sin(p * L.TAU * 1.25);
    put(ctx, env, S.reflA, { rot, zoom, blend: 'screen', alpha: 0.3 + 0.7 * w, dx: 1.6 * Math.sin(p * L.TAU * 2), dy: 1.2 * Math.cos(p * L.TAU * 1.5) });
    put(ctx, env, S.reflB, { rot, zoom, blend: 'screen', alpha: 0.3 + 0.7 * (1 - w), dx: -1.4 * Math.sin(p * L.TAU * 1.5), dy: -1.2 * Math.cos(p * L.TAU * 2) });
    ctx.restore();
    // the iridescent rim: slides along the arc
    const rr = L.lerp(-0.013, 0.013, p);
    put(ctx, env, S.rim, { rot: rr });
    put(ctx, env, S.rim, { rot: rr, blend: 'screen', alpha: 0.34, src: S.rim.bloom });
    // a brighter swell of light travelling along the rim
    ctx.save(); a.clipBand(ctx, 1, -118); ctx.globalCompositeOperation = 'screen';
    a.at(ctx, L.lerp(-0.2, -0.03, p), -34, () => {
      ctx.scale(5, 1);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 120, [[0, 'rgba(255,214,170,0.3)'], [0.5, 'rgba(255,170,150,0.12)'], [1, 'rgba(255,150,150,0)']]);
      ctx.fillRect(-125, -125, 250, 250);
    });
    ctx.restore();
  },
};
