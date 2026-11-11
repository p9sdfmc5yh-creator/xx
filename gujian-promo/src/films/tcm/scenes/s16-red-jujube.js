// s16 — 大枣. Extreme macro of one dried red jujube, freshly rinsed: so close that it fills the frame like a red planet.
// The arc is the upper silhouette of the fruit. Below it: glossy jujube-red skin whose shrivelled folds run along the fruit
// like mountain ranges — wet highlights ride the crests, deep purple-red sinks into the furrows — beaded with water.
// Above it: black.
//
// The skin is shaded per pixel in init(): every pixel under the arc is mapped onto a sphere of radius arc.R
// (U = distance along the parallel, S = distance down the meridian from the limb), so the folds are foreshortened toward the
// limb like the surface of a ball. The bumped normal is reduced to two angles — elevation above the limb and sideways lean —
// and the "studio" is three horizontal strip lights (thin, thin, one big softbox) plus a rim light, all concentric with the arc.
// Sharp speculars are also kept in their own layer, so draw() can slide a light window across them while the fruit turns.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
let S = null;

const sstep = (a, b, v) => { const t = (v - a) / (b - a), c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * (3 - 2 * c); };
/** flat-topped band: 1 inside [c−w, c+w], soft edges of width e */
const band = (v, c, w, e) => sstep(c - w - e, c - w, v) * (1 - sstep(c + w, c + w + e, v));

// tiny allocation-free worley noise (squared distance to the nearest feature point in cD1)
let cD1 = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) d1 = d;
  }
  cD1 = d1;
}

/** water beads: positions are uniform on the SURFACE (so they crowd toward the limb on screen) */
function scatterDrops(a) {
  const r = L.rng('s16drops-2'), R = a.R, span = a.span(PAD + 30), out = [];
  const add = (n, rmin, rmax, smin, smax, gap) => {
    let tries = 0;
    while (n > 0 && tries++ < 6000) {
      const th = r.range(-span, span), al = r.range(smin, smax) / R;
      const depth = R * (1 - Math.cos(al)), nz = Math.sin(al);
      const rad = L.lerp(rmin, rmax, Math.pow(r(), 1.7));
      const p = a.pt(th, -depth);
      const sq = L.clamp(nz * 1.25, 0.44, 0.92);
      let ok = true;
      for (const q of out) { const dx = q.x - p.x, dy = (q.y - p.y) / 0.6, rr = q.r + rad + gap; if (dx * dx + dy * dy < rr * rr) { ok = false; break; } }
      if (!ok) continue;
      out.push({ th, depth, x: p.x, y: p.y, r: rad, sq, k: r(), j: r() });
      n--;
    }
  };
  add(8, 20, 33, 640, 1640, 40);
  add(56, 9, 16, 300, 1760, 14);
  add(220, 4, 8, 190, 1790, 4);
  add(400, 2, 3.8, 150, 1790, 1.5);
  return out;
}

/** one bead, drawn in the local frame of the surface (x along the arc, y toward the centre) */
function drawDrop(g, d) {
  const r = d.r, ry = r * d.sq;
  g.save(); g.translate(d.x, d.y); g.rotate(d.th);
  if (r < 3.5) {
    // mist-sized: a dark foot and a pin-point of light
    g.fillStyle = 'rgba(40,2,8,0.5)'; g.beginPath(); g.ellipse(0.3, 0.5, r, ry, 0, 0, L.TAU); g.fill();
    g.fillStyle = `rgba(255,120,84,${0.35 + 0.3 * d.k})`; g.beginPath(); g.ellipse(0.2, ry * 0.3, r * 0.7, ry * 0.55, 0, 0, L.TAU); g.fill();
    g.fillStyle = `rgba(255,244,236,${0.6 + 0.4 * d.j})`; g.beginPath(); g.ellipse(-r * 0.3, -ry * 0.35, Math.max(0.6, r * 0.34), Math.max(0.5, ry * 0.3), 0, 0, L.TAU); g.fill();
    g.restore(); return;
  }
  // the shadow it casts on the skin, away from the key light (upper left)
  g.fillStyle = L.radial(g, r * 0.3, ry * 0.5, r * 0.5, r * 1.5, [[0, 'rgba(30,0,8,0.6)'], [1, 'rgba(30,0,8,0)']]);
  g.save(); g.scale(1, d.sq); g.beginPath(); g.arc(r * 0.3, ry * 0.5 / d.sq, r * 1.5, 0, L.TAU); g.restore(); g.fill();
  // the body is a lens: dark where the light enters (top), a burning caustic where it lands (bottom)
  g.save(); g.beginPath(); g.ellipse(0, 0, r, ry, 0, 0, L.TAU); g.clip();
  g.fillStyle = L.linear(g, 0, -ry, 0, ry, [[0, 'rgba(46,2,10,0.74)'], [0.42, 'rgba(70,4,12,0.3)'], [0.62, 'rgba(120,10,12,0)']]);
  g.fillRect(-r, -ry, r * 2, ry * 2);
  g.globalCompositeOperation = 'screen';
  g.save(); g.translate(r * 0.12, ry * 0.52); g.scale(1, d.sq);
  g.fillStyle = L.radial(g, 0, 0, 0, r * 0.95, [[0, 'rgba(255,170,120,0.95)'], [0.3, 'rgba(255,96,56,0.7)'], [0.7, 'rgba(240,50,30,0.25)'], [1, 'rgba(230,40,24,0)']]);
  g.fillRect(-r * 2, -r * 2, r * 4, r * 4); g.restore();
  g.restore();
  // meniscus: dark upper lip, glowing lower lip
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(28,0,8,0.6)'; g.lineWidth = Math.max(0.8, r * 0.09);
  g.beginPath(); g.ellipse(0, 0, r, ry, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
  g.strokeStyle = 'rgba(255,176,146,0.6)'; g.lineWidth = Math.max(0.7, r * 0.07);
  g.beginPath(); g.ellipse(0, 0, r * 0.97, ry * 0.95, 0, Math.PI * 0.2, Math.PI * 0.72); g.stroke();
  // the softbox, mirrored small and hard in the top of the bead, + a second window lower right
  g.fillStyle = 'rgba(255,214,196,0.35)'; g.beginPath(); g.ellipse(-r * 0.32, -ry * 0.4, r * 0.42, Math.max(1, ry * 0.3), -0.25, 0, L.TAU); g.fill();
  g.fillStyle = 'rgba(255,252,248,0.97)'; g.beginPath(); g.ellipse(-r * 0.34, -ry * 0.42, r * 0.27, Math.max(0.8, ry * 0.17), -0.25, 0, L.TAU); g.fill();
  if (r > 6) { g.fillStyle = 'rgba(255,236,224,0.7)'; g.beginPath(); g.ellipse(r * 0.46, ry * 0.2, r * 0.07, Math.max(0.6, ry * 0.11), 0.5, 0, L.TAU); g.fill(); }
  g.restore();
}

function buildJujube(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 2;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s16a'), nB = L.makeNoise('s16b'), nC = L.makeNoise('s16c');

  // 1) slow fields on a coarse grid: domain warp of the folds, tone drift, where the skin is crinkled fine
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWu = new Float32Array(cw * ch), cWs = new Float32Array(cw * ch), cTone = new Float32Array(cw * ch), cMask = new Float32Array(cw * ch), cFd = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * rr, Sv = R * Math.acos(Math.min(1, rr / R)), k = j * cw + i;
    cWu[k] = nC.fbm(U / 820 + 3, Sv / 640 - 5, 3) * 230;
    cWs[k] = nC.fbm(U / 700 - 13, Sv / 520 + 9, 3) * 130;
    cTone[k] = nC.fbm(U / 520 + 31, Sv / 300 + 17, 3);
    cMask[k] = nC.fbm(U / 380 - 41, Sv / 260 + 23, 2);
    cFd[k] = nC.fbm(U / 460 + 77, Sv / 230 - 31, 2);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // 2) height field. Hb = the big folds (pillows of taut skin between narrow furrows) + slow swell; Hf = fine crinkle, pores, grain
  const Hb = new Float32Array(N), Hf = new Float32Array(N), Al = new Float32Array(N), Pl = new Float32Array(N), P2 = new Float32Array(N), Gm = new Float32Array(N), Sp = new Float32Array(N);
  const LX = 900, LS = 250;                      // a fold is ~3.5× longer (along the fruit) than it is wide
  const A0 = 24, A1 = 26, A2 = 5, A3 = 1.2, A4 = 0.1, A5 = 0.025;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 1.5) { Al[k] = -1; continue; }
      const q = rr >= R ? 1 : rr / R, al = Math.acos(q), nz = Math.sqrt(1 - q * q);
      Al[k] = al;
      const U = Math.atan2(ddx, ddy) * rr, Sv = R * al;
      const wu = bil(cWu, i, j), ws = bil(cWs, i, j);
      const u1 = (U + wu) / LX + Sv * 0.00022, s1 = (Sv + ws) / LS;
      const n = nA.n2(u1, s1) + 0.38 * nA.n2(u1 * 2.1 + 7.1, s1 * 2.1 - 3.3);
      const swell = nA.n2(u1 * 0.55 + 20.3, s1 * 0.55 + 9.1);         // broad hills under the folds
      const c = Math.min(1, Math.abs(n) * 1.5), dome = c * (2 - c);   // 0 in the furrow → 1 on the crown; a rounded ridge, not a plateau
      const m = nB.n2(U / 260 + 11, Sv / 170 - 7);
      const n2 = nB.n2((U + wu * 0.6) / 220 + 50, (Sv + ws * 0.6) / 60 - 20);
      const pill2 = 1 - Math.exp(-Math.abs(n2) * 4.5);
      const mk = sstep(0.12, 0.5, bil(cMask, i, j));
      cell(U / 10, Sv / 10);
      const dim = sstep(0.05, 0.55, Math.sqrt(cD1));
      const g = nB.n2(U / 3.6 + 90, Sv / 3.6);
      const fadeBig = sstep(0.03, 0.2, nz), fadeFine = sstep(0.1, 0.3, nz);
      const fd = sstep(-0.3, 0.38, bil(cFd, i, j));                    // some folds are deep, some barely there
      Hb[k] = (A1 * (0.4 + 0.6 * fd) * dome + A0 * swell + A2 * m) * fadeBig;
      Hf[k] = A3 * (pill2 - 1) * mk * fadeBig + (A4 * dim + A5 * g) * fadeFine;
      Pl[k] = c; P2[k] = 1 - mk * (1 - pill2); Gm[k] = g;
    }
  }

  // 3) one or two pale corky spots (round on the surface → squashed ellipses on screen)
  const spots = [{ th: -0.168, depth: 236, ru: 27, rs: 40 }, { th: 0.214, depth: 330, ru: 15, rs: 24 }];
  for (const sp of spots) {
    const rr0 = R - sp.depth, al0 = Math.acos(rr0 / R), U0 = sp.th * rr0, S0 = R * al0;
    const px = cx + rr0 * Math.sin(sp.th) - X0, py = cy - rr0 * Math.cos(sp.th) - Y0, e = Math.ceil(Math.max(sp.ru, sp.rs) * 1.5);
    for (let j = Math.max(1, Math.floor(py - e)); j <= Math.min(RH - 2, Math.ceil(py + e)); j++) {
      for (let i = Math.max(1, Math.floor(px - e)); i <= Math.min(RW - 2, Math.ceil(px + e)); i++) {
        const k = j * RW + i; if (Al[k] < 0) continue;
        const ddx = X0 + i - cx, ddy = cy - (Y0 + j), rr = Math.sqrt(ddx * ddx + ddy * ddy);
        const U = Math.atan2(ddx, ddy) * rr, Sv = R * Al[k], du = (U - U0) / sp.ru, ds = (Sv - S0) / sp.rs;
        const dd = Math.sqrt(du * du + ds * ds) + 0.13 * nB.n2(U / 18 + 3, Sv / 18) + 0.04 * nB.n2(U / 5, Sv / 5 + 40);
        if (dd < 1.15) Sp[k] = Math.max(Sp[k], dd < 0.01 ? 2 : 2 - dd);   // stores 2 − d: >1 inside, 0.85..1 = the rim
      }
    }
  }

  // 4) shade
  const NL = 512, VMAX = 1.4, RAMP = new Float32Array(NL * 3);
  {
    const f = L.makeRamp([[0, '#12030a'], [0.1, '#2c0710'], [0.215, '#4a0c14'], [0.34, '#7c1217'], [0.44, '#a01b19'], [0.53, '#b0201a'],
      [0.63, '#cf2e22'], [0.715, '#e8432e'], [0.85, '#ff6444'], [1, '#ff8a66']]);
    for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); RAMP[i * 3] = c[0]; RAMP[i * 3 + 1] = c[1]; RAMP[i * 3 + 2] = c[2]; }
  }
  const img = new ImageData(RW, RH), d = img.data, simg = new ImageData(RW, RH), sd = simg.data;
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, al = Al[k], o = k * 4;
      sd[o + 3] = 255;
      if (al < 0) continue;
      const ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), sn = ddx / rr, cs = ddy / rr, nz = Math.sin(al);
      const im = i > 0 ? -1 : 0, ip = i < RW - 1 ? 1 : 0;
      const bx = (Hb[k + ip] - Hb[k + im]) * 0.5, by = (Hb[k + jp] - Hb[k + jm]) * 0.5;
      const fx = (Hf[k + ip] - Hf[k + im]) * 0.5, fy = (Hf[k + jp] - Hf[k + jm]) * 0.5;
      // slopes measured on the surface: down the meridian (screen-radial, un-foreshortened by nz) and along the parallel
      const sB = -nz * (bx * sn - by * cs), sF = -nz * (fx * sn - fy * cs);
      const lat = (bx + fx) * cs + (by + fy) * sn;                 // > 0: the facet leans toward the key light (left)
      const sS = sB + sF;                                           // > 0: the facet tips back toward the limb (up, on screen)
      const tone = bil(cTone, i, j);
      const a2s = al - Math.atan(0.06 * sB) - 0.025 * tone;                        // elevation of the normal as the smoothing film of water sees it
      const c = Pl[k], ao = sstep(0, 0.55, c), deep = 1 - sstep(0, 0.12, c), fd = sstep(-0.3, 0.38, bil(cFd, i, j));
      const occ = (1 - (1 - (0.45 + 0.55 * ao) * (1 - 0.34 * deep)) * (0.35 + 0.65 * fd)) * (0.7 + 0.3 * P2[k]);
      // key light from the upper left, a little behind: the far flank and the left shoulder of every fold are lit
      let rel = 0.95 * sS + 0.6 * lat; rel = rel < -0.48 ? -0.48 : rel > 0.5 ? 0.5 : rel;
      const limb = Math.exp(-al / 0.2);
      const v = (0.79 + 0.54 * rel) * occ * (1 + 0.1 * tone) + 0.1 * limb * occ;
      let li = (v / VMAX * (NL - 1)) | 0; li = (li < 0 ? 0 : li > NL - 1 ? NL - 1 : li) * 3;
      let cr = RAMP[li], cg = RAMP[li + 1], cb = RAMP[li + 2];
      let gloss = 1;
      const spv = Sp[k];
      if (spv > 0.85) {
        const mIn = sstep(0.96, 1.3, spv), ring = band(spv, 0.99, 0.03, 0.06), sh = 0.5 + 0.5 * v;
        cr += (255 * sh - cr) * mIn * 0.78; cg += (164 * sh - cg) * mIn * 0.78; cb += (132 * sh - cb) * mIn * 0.78;
        const dk = 1 - 0.22 * ring; cr *= dk; cg *= dk * 0.92; cb *= dk * 0.92;
        gloss = 1 - 0.5 * mIn;
      }
      const open = sstep(0.1, 0.7, ao);
      // the big softbox: one broad wet band lower down, its edge wobbling over the folds, drowned in the furrows
      const xC = a2s - 0.455, wet = (0.15 + 0.85 * open) * gloss;
      const zC = sstep(-0.007, 0.007, xC) * Math.exp(-(xC > 0 ? xC : 0) / 0.12) * wet * 0.56;   // crisp upper edge, long tail toward the lens
      cr += (255 - cr) * zC; cg += (80 - cg) * zC; cb += (50 - cb) * zC;
      const eC = Math.exp(-(xC * xC) / 0.00011) * wet * 0.8;                                     // the edge of the softbox itself
      cr += (255 - cr) * eC; cg += (192 - cg) * eC; cb += (168 - cb) * eC;
      // the wet line on the lit shoulder of every crest, with a rosy sheen around it and a glitter of pores
      const e1 = sS - 0.12, e2 = lat - 0.07, ee = e1 * e1 + 0.3 * e2 * e2;
      const patch = 0.55 + 0.45 * sstep(-0.35, 0.3, tone);
      const sheen = Math.exp(-ee / 0.012) * open * gloss * patch * 0.24;
      cr += (255 - cr) * sheen; cg += (112 - cg) * sheen; cb += (84 - cb) * sheen;
      let sp = Math.exp(-ee / 0.003) * open * gloss * patch;
      const gl = Gm[k] - 0.5;
      if (gl > 0) sp += gl * 2 * Math.exp(-ee / 0.0055) * open * gloss;
      // … and on the lit flanks the pores themselves glint: fine reflective grains
      const gr = Gm[k] - 0.36;
      if (gr > 0) {
        let kg = gr * 1.7 * sstep(-0.04, 0.26, rel) * open * gloss * (0.3 + 0.7 * sstep(-0.15, 0.3, tone)) * sstep(0.12, 0.26, nz);
        if (kg > 0.62) kg = 0.62;
        cr += (255 - cr) * kg; cg += (196 - cg) * kg; cb += (172 - cb) * kg;
      }
      // rim light: the limb itself burns
      const rim = Math.exp(-(al * al) / 0.0034) * 0.95;
      cr += (255 - cr) * rim; cg += (176 - cg) * rim; cb += (148 - cb) * rim;
      if (sp > 1) sp = 1;
      const bk = sp * 0.7;
      d[o] = cr + bk * 255; d[o + 1] = cg + bk * 208; d[o + 2] = cb + bk * 188; d[o + 3] = 255;
      sd[o] = sp * 255; sd[o + 1] = sp * 210; sd[o + 2] = sp * 190;
    }
  }
  const cnv = L.makeCanvas(RW, RH); cnv.getContext('2d').putImageData(img, 0, 0);
  const scv = L.makeCanvas(RW, RH); scv.getContext('2d').putImageData(simg, 0, 0);
  const sbloom = L.blurred(scv, 9);

  const drops = scatterDrops(a);
  const skin = L.makeLayer(PAD, (g) => {
    g.save(); a.clipBelow(g, 0);
    g.drawImage(cnv, X0, Y0);
    // wet bloom around the speculars
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.34; g.drawImage(sbloom, X0, Y0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // lenticels: tiny pale dots in the skin
    const r = L.rng('s16dots'), span = a.span(PAD + 20);
    for (let n = 0; n < 300; n++) {
      const th = r.range(-span, span), al = r.range(260, 1790) / R, nz = Math.sin(al), p = a.pt(th, -R * (1 - Math.cos(al)));
      const rad = r.range(0.9, 2.6);
      g.fillStyle = `rgba(255,${150 + (r() * 40 | 0)},${112 + (r() * 30 | 0)},${r.range(0.16, 0.42)})`;
      g.save(); g.translate(p.x, p.y); g.rotate(th); g.beginPath(); g.ellipse(0, 0, rad, Math.max(0.5, rad * nz * 1.2), 0, 0, L.TAU); g.fill(); g.restore();
    }
    for (let n = drops.length - 1; n >= 0; n--) drawDrop(g, drops[n]);
    g.restore();
  });
  // macro depth of field: the crown of the fruit, bulging toward the lens at the bottom of frame, goes soft
  const near = L.blurred(skin, 5), ng = near.getContext('2d');
  ng.globalCompositeOperation = 'destination-in';
  ng.fillStyle = L.radial(ng, cx + PAD, cy + PAD, R - 620, R - 380, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  ng.fillRect(0, 0, near.width, near.height);
  const sg = skin.getContext('2d');
  sg.save(); a.clipBelow(sg, 0); sg.drawImage(near, -PAD, -PAD); sg.restore();

  // sharp speculars on black (opaque), with their own bloom — draw() gates them with a moving light window
  const spec = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.save(); a.clipBelow(g, 0);
    g.drawImage(scv, X0, Y0);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4; g.drawImage(sbloom, X0, Y0);
    g.restore();
  });
  return { skin, spec, drops };
}

export default {
  name: '大枣',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const { skin, spec, drops } = buildJujube(env);
    // a handful of beads that flash once as the fruit turns under the light
    const r = L.rng('s16tw'), cand = drops.filter((q) => q.r > 5 && Math.abs(q.th) < 0.36 && q.depth > 50 && q.depth < 430 - 620 * q.th * q.th);
    const tw = [];
    for (let i = 0; i < 9 && cand.length; i++) { const q = cand.splice(Math.floor(r() * cand.length), 1)[0]; tw.push({ ...q, ph: 0.12 + 0.76 * (i / 8), w: r.range(0.16, 0.24), g: r.range(0.7, 1) }); }
    const TY = Math.floor(a.crestY) - 4, tmp = L.makeCanvas(W, H - TY);
    S = { skin, spec, tw, TY, tmp, tg: tmp.getContext('2d') };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.013, 0.013, p);                       // ≈ 1.5° about the fruit's centre
    ctx.fillStyle = '#040303'; ctx.fillRect(0, 0, W, H);
    // two or three motes of dust, barely there, well clear of the words
    const dust = [[322, 236, 2.4, 0.2], [1592, 148, 1.8, 0.15], [1724, 404, 3.4, 0.1]];
    for (const [x, y, rd, al] of dust) {
      const dx = L.lerp(-2.5, 2.5, p) * (rd / 2), dy = L.lerp(1.5, -1.5, p);
      ctx.fillStyle = L.radial(ctx, x + dx, y + dy, 0, rd * 2.2, [[0, `rgba(214,196,186,${al})`], [0.45, `rgba(200,170,160,${al * 0.5})`], [1, 'rgba(180,150,140,0)']]);
      ctx.fillRect(x + dx - 10, y + dy - 10, 20, 20);
    }
    // the rim light bleeds a breath of red into the lens, just over the limb
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(210,34,20,0.07)'; ctx.lineWidth = 26; a.stroke(ctx, 2);
    ctx.strokeStyle = 'rgba(255,80,50,0.11)'; ctx.lineWidth = 9; a.stroke(ctx, 1);
    ctx.restore();

    L.blit(ctx, env, S.skin, { rot });

    // the studio stays put while the fruit turns: key from the upper left, falling away to the right and into the corners
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.radial(ctx, 720, a.crestY + 40, 420, 1500, [[0, '#ffffff'], [0.42, '#f2d6d2'], [1, '#855060']]);
    ctx.fillRect(0, a.crestY - 6, W, H);
    ctx.restore();

    // wet highlights: the sharp speculars turn with the skin, a window of light slides across them the other way
    const tg = S.tg, TY = S.TY;
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1;
    tg.translate(0, -TY);
    tg.translate(a.cx, a.cy); tg.rotate(rot); tg.translate(-a.cx, -a.cy);
    tg.drawImage(S.spec, -PAD, -PAD);
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'multiply';
    tg.translate(L.lerp(560, 1180, p), a.crestY + 170 - TY); tg.rotate(0.1); tg.scale(1, 0.52);
    tg.fillStyle = L.radial(tg, 0, 0, 0, 760, [[0, '#cfcfcf'], [0.3, '#ababab'], [0.62, '#565656'], [1, '#2a2a2a']]);
    tg.fillRect(-3000, -3000, 6000, 6000);
    tg.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(S.tmp, 0, TY); ctx.restore();

    // beads catching the light, one after another
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of S.tw) {
      const e = (p - q.ph) / q.w, k = Math.exp(-e * e) * q.g;
      if (k < 0.04) continue;
      a.at(ctx, q.th + rot, -q.depth, () => {
        ctx.translate(-q.r * 0.34, -q.r * q.sq * 0.42);
        const rr = 12 + q.r * 1.7;
        const flare = (sx, sy, al) => {
          ctx.save(); ctx.scale(sx, sy);
          ctx.fillStyle = L.radial(ctx, 0, 0, 0, rr, [[0, `rgba(255,250,244,${al * k})`], [0.2, `rgba(255,214,196,${al * 0.5 * k})`], [0.55, `rgba(255,120,90,${al * 0.12 * k})`], [1, 'rgba(255,90,60,0)']]);
          ctx.fillRect(-rr, -rr, rr * 2, rr * 2); ctx.restore();
        };
        flare(1, 1, 0.95); flare(3.4, 0.09, 0.8); flare(0.09, 2.2, 0.6);
      });
    }
    ctx.restore();
  },
};
