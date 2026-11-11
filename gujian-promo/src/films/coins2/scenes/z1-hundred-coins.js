// z1 — 百钱成字·飞散: well over a hundred small old coins (square-holed cash in many patinas, round-holed coins, gold cakes,
// little silver ingots, a few small spades and knives laid along the strokes) packed into the strokes of the CURRENT GLYPH on
// off-white paper. They lie still, then lift off one by one and tumble towards the camera — real slabs of metal: a rim wall
// that shows when they flip, light that changes with the tilt, shadows that slide, spread and fade on the page, perspective
// growth, depth-of-field and a smooth motion blur — and one huge out-of-focus cash coin closes the shot.
// Also exports drawFlyers(ctx, t) for the title card (coins still flying away; independent of the glyph and of init()).
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K; const TAU = Math.PI * 2, Q = L.SS, C0 = S / 2;
const LX = -0.5, LY = -0.56, LZ = 0.66, HX = -0.2743, HY = -0.3073, HZ = 0.9108;   // unit vector TO the light (top-left, above the page) and its half vector with the lens
const BUMP = 7, FIT = 1.1, NS = 8;                                                // relief strength; coin size / packed disc; most sub-samples of one exposure
const clamp = L.clamp, sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const PAL = {
  green: { base: '#5b7a60', lite: '#bccba6', dark: '#22382b', pat: ['#7fb39b', '#3a6a58'], spot: '#8a4a2c', amt: 0.72, gloss: 0.4 },    // 青铜绿
  red: { base: '#7a5638', lite: '#c9a070', dark: '#3a271a', pat: ['#4f8a6c', '#2f6450'], spot: '#a43a24', amt: 0.5, gloss: 0.45 },       // 红斑
  black: { base: '#3d3930', lite: '#a09378', dark: '#17140f', pat: ['#5a5740', '#2c352e'], spot: '#5f8062', amt: 0.34, gloss: 0.85 },    // 黑漆古
  brass: { base: '#8f6f36', lite: '#e2c57c', dark: '#473415', pat: ['#6c6c40', '#6a4c25'], spot: '#4f7458', amt: 0.46, gloss: 0.7 },
  blue: { base: '#4d7c82', lite: '#a9cfc8', dark: '#20424a', pat: ['#4c97a0', '#2c5c68'], spot: '#8a4a2c', amt: 0.66, gloss: 0.35 },
  gold: { base: '#c9992f', lite: '#fbe9a0', dark: '#7a5514', pat: ['#e2bd55', '#a8781f'], spot: '#8a5a1a', amt: 0.3, spotA: 0.4, gloss: 1 },
  silver: { base: '#a6a7a3', lite: '#f4f2ea', dark: '#4a4c4f', pat: ['#77797d', '#c9c7bd'], spot: '#4a4640', amt: 0.44, spotA: 0.4, gloss: 0.9 },
};

// ───────────── shapes, in sprite units (a cash coin has radius 72; T = thickness of the slab) ─────────────
const ring = (g, rad, wob, ph) => {
  for (let k = 0; k <= 96; k++) { const t = (k / 96) * TAU, rr = rad * (1 + wob * Math.sin(t * 3 + ph) + wob * 0.6 * Math.sin(t * 7 + ph * 2)); k ? g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : g.moveTo(rr, 0); }
  g.closePath();
};
const spadePath = (g) => {
  g.beginPath(); g.moveTo(-12, -80); g.lineTo(12, -80); g.lineTo(13.5, -50); g.lineTo(40, -50); g.lineTo(44, -44); g.lineTo(46, 78);
  g.lineTo(17, 78); g.lineTo(14, 55); g.quadraticCurveTo(0, 40, -14, 55); g.lineTo(-17, 78); g.lineTo(-46, 78); g.lineTo(-44, -44); g.lineTo(-40, -50); g.lineTo(-13.5, -50); g.closePath();
};
const KN = { rho: 520, y0: -24 };
const knP = (phi, d) => [(KN.rho - d) * Math.sin(phi), KN.y0 + KN.rho - (KN.rho - d) * Math.cos(phi)];
const knifePath = (g) => {
  g.beginPath();
  for (let i = 0; i <= 28; i++) { const p = knP(-0.24 + 0.428 * (i / 28), 0); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
  for (let i = 0; i <= 10; i++) { const p = knP(0.188 - 0.158 * (i / 10), 18); g.lineTo(p[0], p[1]); }
  for (let i = 0; i <= 16; i++) { const u = i / 16, p = knP(0.016 - 0.226 * u, 40 - 5 * u); g.lineTo(p[0], p[1]); }
  g.closePath();
  const c = knP(0.2155, 9); g.moveTo(c[0] + 18, c[1]); g.arc(c[0], c[1], 18, 0, TAU);
  g.moveTo(c[0] + 8.5, c[1]); g.arc(c[0], c[1], 8.5, 0, TAU, true);
};
const ingotPath = (g) => {
  g.beginPath(); g.moveTo(-62, -52); g.quadraticCurveTo(0, -27, 62, -52); g.quadraticCurveTo(78, 0, 62, 52); g.quadraticCurveTo(0, 27, -62, 52); g.quadraticCurveTo(-78, 0, -62, -52); g.closePath();
};
const SHAPES = {
  cash: (v) => ({ ext: 73, T: 13,
    path(g) { g.beginPath(); ring(g, 72, 0.006, v.ph); g.rect(-v.hole, -v.hole, v.hole * 2, v.hole * 2); },
    relief(h) {                                                                    // outer rim and inner rim; the field is worn flat (no legend)
      h.strokeStyle = '#c6c6c6'; h.lineWidth = v.rim; h.beginPath(); h.arc(0, 0, 72 - v.rim / 2, 0, TAU); h.stroke();
      if (v.inner) { const a = v.hole + v.inner / 2; h.lineWidth = v.inner; h.lineJoin = 'miter'; h.strokeRect(-a, -a, a * 2, a * 2); }
    } }),
  huan: (v) => ({ ext: 71, T: 12,
    path(g) { g.beginPath(); ring(g, 70, 0.012, v.ph); g.moveTo(14, 0); g.arc(0, 0, 14, 0, TAU); },
    relief(h) { h.strokeStyle = '#bcbcbc'; h.lineWidth = 5.5; h.beginPath(); h.arc(0, 0, 67, 0, TAU); h.stroke(); h.lineWidth = 3.2; h.beginPath(); h.arc(0, 0, 16.5, 0, TAU); h.stroke(); } }),
  gold: (v) => ({ ext: 65, T: 22, dome: 2.2, scratch: 8,
    path(g) { g.beginPath(); ring(g, 63, 0.022, v.ph); },
    relief(h, q) {                                                                 // the lumpy cast face of a gold cake
      for (let k = 0; k < 14; k++) {
        const a = q() * TAU, d = Math.sqrt(q()) * 48, rr = q.range(8, 17), x = Math.cos(a) * d, y = Math.sin(a) * d;
        h.fillStyle = L.radial(h, x, y, 0, rr, [[0, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]); h.beginPath(); h.arc(x, y, rr, 0, TAU); h.fill();
      }
    } }),
  ingot: () => ({ ext: 81, T: 26, scratch: 20,
    path: ingotPath,
    relief(h) {                                                                    // raised lip around a slightly sunken face
      h.strokeStyle = '#cccccc'; h.lineWidth = 17; h.lineJoin = 'round'; ingotPath(h); h.stroke();
      h.fillStyle = L.radial(h, 0, 0, 0, 44, [[0, 'rgba(40,40,40,0.5)'], [1, 'rgba(40,40,40,0)']]); h.beginPath(); h.ellipse(0, 0, 46, 24, 0, 0, TAU); h.fill();   // no ring: it would read as a letter
    } }),
  spade: () => ({ ext: 93, T: 8,
    path: spadePath,
    relief(h) {
      h.strokeStyle = '#bcbcbc'; h.lineWidth = 9; h.lineJoin = 'miter'; spadePath(h); h.stroke();
      h.lineWidth = 2.8; h.lineCap = 'round'; h.beginPath(); h.moveTo(0, -76); h.lineTo(0, 44); h.moveTo(-9, -48); h.lineTo(-30, 72); h.moveTo(9, -48); h.lineTo(30, 72); h.stroke();
    } }),
  knife: () => ({ ext: 137, T: 8, rule: 'nonzero', scratch: 22,
    path: knifePath,
    relief(h) {
      h.strokeStyle = '#bcbcbc'; h.lineWidth = 8; h.lineJoin = 'round'; knifePath(h); h.stroke();
      h.lineWidth = 2.4; h.beginPath();
      for (const d of [7, 11.5]) for (let i = 0; i <= 10; i++) { const p = knP(0.03 + 0.15 * (i / 10), d); i ? h.lineTo(p[0], p[1]) : h.moveTo(p[0], p[1]); }
      h.stroke();
    } }),
};

// ───────────── levels: one picture of a sprite at some resolution / blur. h = half-size in sprite units, res = canvas px per unit ─────────────
const put = (g, lv) => g.drawImage(lv.c, -lv.h, -lv.h, lv.h * 2, lv.h * 2);
function mkLevel(src, half, res, sigma) {
  const n = Math.max(2, Math.ceil(half * 2 * res)), c = L.makeCanvas(n, n), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  if (sigma) g.filter = `blur(${(sigma * res).toFixed(3)}px)`;
  g.translate(n / 2, n / 2); g.scale(res, res); put(g, src); g.filter = 'none';
  return { c, h: n / (2 * res), res, sigma: sigma || 0 };
}
function tinted(lv, color, alpha, op) {
  const c = L.makeCanvas(lv.c.width, lv.c.height), g = c.getContext('2d');
  g.drawImage(lv.c, 0, 0); g.globalCompositeOperation = op; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return { ...lv, c };
}
const pickSharp = (a, res) => { let i = 0; while (i + 1 < a.length && a[i + 1].res >= res * 0.99) i++; return a[i]; };
function faceLv(spr, f, sig) {                           // f = screen px per unit, sig = wanted blur in screen px
  const su = sig / f;
  if (su < 1.1) return pickSharp(spr.sharp, f * 1.04);
  for (const lv of spr.blur) if (lv.sigma >= su * 0.9) return lv;
  return spr.blur[spr.blur.length - 1];
}
const sideLv = (spr, lv) => spr.side[lv.sigma < 2 ? 0 : lv.sigma < 4.5 ? 1 : lv.sigma < 10 ? 2 : 3];
function shadowLv(spr, su) { let best = spr.shadow[0]; for (const lv of spr.shadow) if (lv.sigma <= su * 1.5) best = lv; return best; }

// ───────────── one piece of metal: per-pixel shading at DEVICE resolution (L.pixelCanvas) from a drawn height map ─────────────
function defOf(kind, id, pal, rot, ss) {
  const r = L.rng('z1d' + kind + id);
  const v = { ph: r() * 6, hole: r.range(13, 18), rim: r.range(8.5, 13), inner: r.chance(0.2) ? 0 : r.range(4.5, 7) };
  return { kind, seed: kind + id, pal, v, ss: ss || 1, rot: rot === undefined ? r() * TAU : rot };   // rot turns the PATTERN inside the sprite: the light stays top-left
}
function forge(def) {
  const sh = SHAPES[def.kind](def.v), pal = def.pal, ss = def.ss, rot = def.rot, r = L.rng('z1s' + def.seed), rule = sh.rule || 'evenodd';
  const half = sh.ext + 6, W = Math.ceil(half * 2 * ss);
  const prep = (g) => { g.translate(W / 2, W / 2); g.scale(ss, ss); g.rotate(rot); };
  // 1 — height of the casting: a bevelled slab plus its raised rims, drawn with paths
  const rc = L.makeCanvas(W, W), rg = rc.getContext('2d'); prep(rg); sh.relief(rg, r);
  const hc = L.makeCanvas(W, W), hg = hc.getContext('2d');
  hg.fillStyle = '#000'; hg.fillRect(0, 0, W, W); hg.save(); prep(hg);
  hg.filter = `blur(${(1.6 * ss).toFixed(2)}px)`; hg.fillStyle = '#707070'; sh.path(hg); hg.fill(rule); hg.filter = 'none';
  sh.path(hg); hg.clip(rule); hg.setTransform(1, 0, 0, 1, 0, 0); hg.filter = `blur(${(0.9 * ss).toFixed(2)}px)`; hg.drawImage(rc, 0, 0); hg.filter = 'none'; hg.restore();
  const mc = L.makeCanvas(W, W), mg = mc.getContext('2d'); prep(mg); mg.fillStyle = '#fff'; sh.path(mg); mg.fill(rule);
  const hr = L.getRaw(hc).data, mr = L.getRaw(mc).data;
  // 2 — every device pixel: normal from the height field → diffuse + specular light from the top-left; patina settles in the low parts, high parts are rubbed bright
  const nz = L.makeNoise('z1n' + def.seed), cB = L.parseColor(pal.base), cL = L.parseColor(pal.lite), cD = L.parseColor(pal.dark);
  const p0 = L.parseColor(pal.pat[0]), p1 = L.parseColor(pal.pat[1]), cS = L.parseColor(pal.spot), spotA = pal.spotA || 1, dome = sh.dome || 0, R2 = sh.ext * sh.ext;
  const c = L.pixelCanvas(W, W, (d, pw, ph, q) => {
    const Hh = new Float32Array(pw * ph), k = 1 / (ss * q), cu = W / (2 * ss), g1 = (0.5 * BUMP) / k;
    for (let j = 0, o = 0; j < ph; j++) {
      const uy = (j + 0.5) * k - cu;
      for (let i = 0; i < pw; i++, o++) {
        let h = hr[o * 4] / 255;
        if (mr[o * 4 + 3]) {
          const ux = (i + 0.5) * k - cu;
          h += 0.02 * nz.n2(ux / 2.7, uy / 2.7) + 0.035 * nz.n2(ux / 11 + 5, uy / 11);
          if (dome) h += dome * Math.sqrt(Math.max(0.03, 1 - (ux * ux + uy * uy) / R2));
        }
        Hh[o] = h;
      }
    }
    for (let j = 1; j < ph - 1; j++) {
      const uy = (j + 0.5) * k - cu;
      for (let i = 1; i < pw - 1; i++) {
        const o = j * pw + i, al = mr[o * 4 + 3]; if (!al) continue;
        const ux = (i + 0.5) * k - cu, hb = hr[o * 4] / 255;
        const sx = (Hh[o + 1] - Hh[o - 1]) * g1, sy = (Hh[o + pw] - Hh[o - pw]) * g1, il = 1 / Math.sqrt(sx * sx + sy * sy + 1);
        const nx = -sx * il, ny = -sy * il, dif = Math.max(0, nx * LX + ny * LY + il * LZ);
        let spc = nx * HX + ny * HY + il * HZ; spc = spc > 0 ? Math.pow(spc, 30) : 0;
        const wear = sstep(0.52, 0.74, hb), rec = clamp((0.44 - hb) / 0.3);
        const t1 = clamp(nz.fbm(ux / 46, uy / 46, 3) * 1.3 + 0.5 + (pal.amt - 0.5) * 0.7), a1 = sstep(0.42, 0.62, t1) * 0.86 * (1 - 0.65 * wear), m1 = sstep(0.6, 1, t1);
        const t2 = clamp(nz.fbm(ux / 21 + 40, uy / 21 - 13, 3) * 1.5 + 0.34), a2 = sstep(0.6, 0.74, t2) * 0.85 * spotA * (1 - 0.4 * wear);
        const tone = 1 + 0.1 * nz.n2(ux / 58 + 3, uy / 58 - 7), shade = (0.4 + 0.92 * dif) * (1 - (0.08 * (ux + uy)) / sh.ext), gl = spc * pal.gloss * 0.9 * (1 - 0.5 * a1);
        for (let ch = 0; ch < 3; ch++) {
          let col = cB[ch] * tone;
          col += (p0[ch] + (p1[ch] - p0[ch]) * m1 - col) * a1; col += (cS[ch] - col) * a2; col += (cL[ch] - col) * wear * 0.5; col += (cD[ch] - col) * rec * 0.55;
          d[o * 4 + ch] = col * shade + cL[ch] * gl;
        }
        d[o * 4 + 3] = al;
      }
    }
  });
  // 3 — drawn structure on top: hairline scratches, a few nicks, the dark contour
  const g = c.getContext('2d'); g.save(); g.translate(W / 2, W / 2); g.scale(ss, ss);
  g.save(); g.rotate(rot); sh.path(g); g.restore(); g.save(); g.clip(rule);
  g.lineCap = 'round';
  for (let i = 0, n = sh.scratch || 14; i < n; i++) {
    const x = r.range(-sh.ext, sh.ext), y = r.range(-sh.ext, sh.ext), a = r.range(-0.9, 0.5) + (r.chance(0.3) ? 1.4 : 0), len = r.range(5, 24);
    g.strokeStyle = L.rgba(r.chance(0.55) ? pal.lite : pal.dark, r.range(0.18, 0.45)); g.lineWidth = r.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = r.range(-sh.ext, sh.ext) * 0.8, y = r.range(-sh.ext, sh.ext) * 0.8, rr = r.range(0.8, 1.9);
    g.fillStyle = L.rgba(pal.dark, r.range(0.35, 0.65)); g.beginPath(); g.ellipse(x, y, rr, rr * r.range(0.6, 1), r() * 3, 0, TAU); g.fill();
    g.strokeStyle = L.rgba(pal.lite, 0.5); g.lineWidth = 0.6; g.beginPath(); g.arc(x, y, rr + 0.5, 0.1, 1.5); g.stroke();
  }
  g.restore();
  g.rotate(rot); sh.path(g); g.strokeStyle = L.rgba(pal.dark, 0.7); g.lineWidth = 1.2; g.lineJoin = 'round'; g.stroke(); g.restore();
  // 4 — the level sets: sharp (a √2 ladder of sizes), out of focus, the rim wall, shadows
  const lv0 = { c, h: W / (2 * ss), res: ss, sigma: 0 }, sharp = [lv0];
  for (let res = ss * 0.7071; res > 0.085; res *= 0.7071) sharp.push(mkLevel(lv0, half, res, 0));
  const blur = [[1.2, 0.71], [1.8, 0.5], [2.7, 0.5], [4, 0.354], [6, 0.25], [9, 0.25], [13.5, 0.177], [20, 0.125]].map(([s, rs]) => mkLevel(pickSharp(sharp, rs), half + 2.7 * s, rs, s));
  const wall = L.mix(pal.dark, pal.base, 0.42);
  const side = [pickSharp(sharp, 0.5), blur[2], blur[4], blur[6]].map((lv) => tinted(lv, wall, 0.8, 'source-atop'));
  const sil = tinted(pickSharp(sharp, 0.25), 'rgb(45,28,12)', 1, 'source-in');
  const shadow = [[2.6, 0.25], [6, 0.25], [14, 0.125], [32, 0.125], [72, 0.0625]].map(([s, rs]) => mkLevel(sil, half + 2.7 * s, rs, s));
  return { half, ext: sh.ext, T: sh.T, gloss: pal.gloss, sharp, blur, side, shadow };
}
const CASH = ['green', 'red', 'black', 'green', 'brass', 'blue', 'red', 'black', 'green', 'red', 'black', 'brass', 'green', 'blue', 'black', 'red'];
const HUAN = ['blue', 'black', 'green', 'red'];
const LIB = new Map();   // the round designs are shared (each is used by several coins, plain or mirrored about the light's diagonal)
function stock(kind, k) {
  const key = kind + k;
  if (!LIB.has(key)) LIB.set(key, forge(defOf(kind, k, kind === 'gold' ? PAL.gold : PAL[(kind === 'cash' ? CASH : HUAN)[k]])));
  return LIB.get(key);
}

// ───────────── drawing a piece in space ─────────────
// state: { x, y (screen), sc (screen px per unit), rot (in-plane turn), phi (flip angle about the in-plane axis at angle ax), tp (mirrored design), m (magnification) }
function pose(g, x, y, st, sc, fcs) {
  g.translate(x, y);
  if (fcs !== 1) { g.rotate(st.ax); g.scale(1, fcs); g.rotate(-st.ax); }
  if (st.rot) g.rotate(st.rot);
  g.scale(sc, sc);
  if (st.tp) g.transform(0, 1, 1, 0, 0, 0);
}
const TIER = [72, 112, 176, 288, 608], SCR = [];
function scratch(n) {
  let i = 0; while (i < TIER.length - 1 && TIER[i] < n) i++;
  if (!SCR[i]) { const mk = () => { const c = L.makeCanvas(TIER[i], TIER[i]); return { c, g: c.getContext('2d') }; }; SCR[i] = [mk(), mk()]; }
  return SCR[i];
}
/** one piece as a slab in space, composed off-screen (rim wall, face, light), averaged over the exposure if `samples` is given, then put on ctx */
function renderCoin(ctx, spr, st, sig, samples, alpha) {
  if (alpha <= 0) return;
  const cs = Math.cos(st.phi), sn = Math.sin(st.phi), sg = cs < 0 ? -1 : 1, zc = Math.abs(cs), fc = Math.max(0.05, zc);
  const nx = -sg * sn * Math.sin(st.ax), ny = sg * sn * Math.cos(st.ax);                 // xy of the visible face's normal (its z is zc)
  const wall = spr.T * st.sc * Math.abs(sn), ox = nx * spr.T * st.sc * 0.5, oy = ny * spr.T * st.sc * 0.5;
  const lv = faceLv(spr, st.sc, sig), blurPx = Math.max(sig, lv.sigma * st.sc), Rb = spr.half * st.sc + wall * 0.5 + 3 * blurPx + 2;
  let ext = 0;
  if (samples) for (const s of samples) ext = Math.max(ext, Math.hypot(s.x - st.x, s.y - st.y) + spr.half * Math.max(0, s.sc - st.sc));
  const M = 48, x1 = Math.min(S + M, st.x + Rb + ext), y1 = Math.min(S + M, st.y + Rb + ext);
  let x0 = Math.max(-M, st.x - Rb - ext), y0 = Math.max(-M, st.y - Rb - ext);
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  const dif = (nx * LX + ny * LY + zc * LZ) / LZ, spec = Math.pow(Math.max(0, nx * HX + ny * HY + zc * HZ), 36) * spr.gloss;
  if (!samples && wall <= 0.4 && Math.abs(dif - 1) <= 0.03 && spec <= 0.04) {             // lying flat and hardly moving: no off-screen pass needed
    ctx.save(); ctx.globalAlpha *= alpha; pose(ctx, st.x + ox, st.y + oy, st, st.sc, sg * fc); put(ctx, lv); ctx.restore(); return;
  }
  x0 = Math.floor(x0 * Q) / Q; y0 = Math.floor(y0 * Q) / Q;
  let kk = Math.min(1, Math.max(0.2, 1.5 / (Math.max(blurPx, 0.01) * Q)), 604 / Math.max(x1 - x0, y1 - y0));   // blurred pieces are composed at a lower resolution
  if (kk > 0.97) kk = 1;
  const rw = Math.ceil((x1 - x0) * kk) + 1, rh = Math.ceil((y1 - y0) * kk) + 1, [A, B] = scratch(Math.max(rw, rh) + 2), ga = A.g;
  const base = (g) => g.setTransform(kk, 0, 0, kk, -x0 * kk, -y0 * kk), wipe = (g) => { g.setTransform(1, 0, 0, 1, 0, 0); g.fillRect(0, 0, rw + 2, rh + 2); };
  ga.setTransform(1, 0, 0, 1, 0, 0); ga.globalCompositeOperation = 'source-over'; ga.globalAlpha = 1; ga.clearRect(0, 0, rw + 2, rh + 2);
  if (wall > 0.4) {                                                                       // the rim wall: the slab's far face … near face, stacked
    const sl = sideLv(spr, lv), nl = Math.min(4, Math.max(1, Math.ceil(wall / Math.max(1.1, blurPx * 1.2))));
    for (let j = 0; j < nl; j++) { const t = (j / nl) * 2 - 1; base(ga); pose(ga, st.x + ox * t, st.y + oy * t, st, st.sc, sg * fc); put(ga, sl); }
    const b = -(nx * LX + ny * LY) / (Math.abs(sn) * 0.7507 + 1e-6);                     // it catches the light where it faces the top-left
    ga.globalCompositeOperation = 'source-atop'; ga.fillStyle = b > 0 ? `rgba(255,238,200,${(0.36 * b).toFixed(3)})` : `rgba(10,6,2,${(-0.4 * b).toFixed(3)})`; wipe(ga);
    ga.globalCompositeOperation = 'source-over';
  }
  base(ga); pose(ga, st.x + ox, st.y + oy, st, st.sc, sg * fc); put(ga, lv);
  // the face: brighter as it leans towards the light, in shade as it leans away, a flash when it mirrors the light into the lens
  ga.globalCompositeOperation = 'source-atop';
  if (dif < 0.97) { ga.fillStyle = `rgba(12,8,4,${Math.min(0.5, (1 - dif) * 0.45).toFixed(3)})`; wipe(ga); }
  else if (dif > 1.03) { ga.fillStyle = `rgba(255,244,216,${Math.min(0.26, (dif - 1) * 0.6).toFixed(3)})`; wipe(ga); }
  if (spec > 0.04) { ga.fillStyle = `rgba(255,250,236,${Math.min(0.6, spec * 0.7).toFixed(3)})`; wipe(ga); }
  ga.globalCompositeOperation = 'source-over';
  let out = A;
  if (samples) {                                                                          // motion blur: a true running average of the sub-exposures (no layered ghosts)
    const gb = B.g, tx0 = Math.max(x0, st.x - Rb), ty0 = Math.max(y0, st.y - Rb), tw = Math.min(x1, st.x + Rb) - tx0, th = Math.min(y1, st.y + Rb) - ty0;
    gb.setTransform(1, 0, 0, 1, 0, 0); gb.globalCompositeOperation = 'source-over'; gb.globalAlpha = 1; gb.clearRect(0, 0, rw + 2, rh + 2); gb.fillStyle = '#000';
    if (tw > 0.5 && th > 0.5) samples.forEach((s, i) => {
      const w = 1 / (i + 1), k = s.sc / st.sc;
      if (i) { gb.globalCompositeOperation = 'destination-out'; gb.globalAlpha = w; wipe(gb); }
      gb.globalCompositeOperation = 'lighter'; gb.globalAlpha = w;
      base(gb); gb.translate(s.x, s.y); gb.rotate(s.rot - st.rot); gb.scale(k, k); gb.translate(-st.x, -st.y);
      gb.drawImage(A.c, (tx0 - x0) * kk, (ty0 - y0) * kk, tw * kk, th * kk, tx0, ty0, tw, th);
    });
    gb.globalCompositeOperation = 'source-over'; gb.globalAlpha = 1; out = B;
  }
  ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(out.c, 0, 0, rw, rh, x0, y0, rw / kk, rh / kk); ctx.restore();
}
/** expose one frame of a moving piece: at(u) → state; du = shutter (in u); dofOf(state) → blur from being out of the focal plane (screen px) */
function shoot(ctx, spr, at, u, du, dofOf, alpha) {
  const a = at(u), b = at(Math.max(0, u - du)), R = spr.ext * a.sc;
  const mv = Math.hypot(a.x - b.x, a.y - b.y) + R * Math.abs(1 - b.sc / a.sc) + R * Math.abs(a.rot - b.rot) * 0.6;
  const dof = dofOf(a), n = mv < 1.1 ? 1 : Math.min(NS, Math.ceil(mv / Math.max(1, 1.4 * dof)));
  let samples = null;
  if (n > 1) { samples = []; for (let i = 0; i < n; i++) samples.push(at(Math.max(0, u - du * (1 - (i + 0.5) / n)))); }
  renderCoin(ctx, spr, at(Math.max(0, u - du * 0.5)), Math.max(dof, n > 1 ? (0.5 * mv) / n : 0), samples, alpha);   // sub-samples closer than the blur: no steps
}
/** the shadows a piece leaves on the page: a tight one and a soft one; they slide to the lower right, spread and fade as it climbs (z = height) */
function castShadow(g, it, st, z, fade) {
  const spr = it.spr, R0 = spr.ext * it.scale, gx = C0 + (st.x - C0) / st.m, gy = C0 + (st.y - C0) / st.m, f = it.scale * (1 + 0.45 * z);
  const cs = Math.cos(st.phi), fcs = (cs < 0 ? -1 : 1) * Math.max(0.3, Math.abs(cs));
  const near = Math.max(0, 1 - z * 4);
  for (const [o0, o1, s0, s1, a] of [[0.13, 115, 0.55, 16, 0.5 * near], [0.3, 150, 3.2, 24, 0.54 - 0.3 * near]]) {
    const off = R0 * o0 + z * o1; if (a * fade < 0.02) continue;
    g.save(); g.globalAlpha *= a * fade; pose(g, gx + 0.55 * off, gy + 0.83 * off, st, f, fcs); put(g, shadowLv(spr, (s0 + z * s1) / f)); g.restore();
  }
}

// ───────────── the page: coins packed into the strokes of the current glyph ─────────────
function arrange(info, kR, frac) {
  const sw = info.strokeWidth, R1 = sw * kR, r = L.rng('z1long' + info.key);
  let discs = K.pack({ seed: 'z1coins', rmax: R1, rmin: R1 * frac, gap: 0.9, margin: -0.5 });
  // a few knives and spades on straight runs of stroke, lying along it
  const longs = [], per = {}, nCh = info.chars.length, cand = shuffle(discs.filter((d) => d.r > R1 * 0.9), r);
  for (const [kind, cnt, hl, hw] of [['knife', 3, 1.8 * sw, 0.3 * sw], ['spade', 4, 0.78 * sw, 0.45 * sw]]) {
    let n = 0;
    for (const d of cand) {
      if (n >= cnt) break;
      const key = kind + info.chars.findIndex((c) => d.x >= c.x0 && d.x < c.x1);
      if ((per[key] || 0) >= Math.ceil(cnt / nCh) || longs.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < hl + o.hl + sw * 0.8)) continue;
      const cx = Math.cos(d.ang), sy = Math.sin(d.ang); let ok = true;
      for (let t = -hl; t <= hl && ok; t += 4) ok = K.sdGlyph(d.x + cx * t, d.y + sy * t) < -sw * 0.2;
      if (!ok) continue;
      longs.push({ kind, x: d.x, y: d.y, ang: d.ang, hl, hw }); per[key] = (per[key] || 0) + 1; n++;
    }
  }
  discs = discs.filter((d) => !longs.some((o) => { const dx = d.x - o.x, dy = d.y - o.y, c = Math.cos(o.ang), s = Math.sin(o.ang); return Math.abs(dx * c + dy * s) < o.hl - d.r * 0.3 && Math.abs(dy * c - dx * s) < o.hw * 0.9; }));
  return { discs, longs };
}
const restOf = (it) => ({ x: it.x, y: it.y, m: 1, sc: it.scale, rot: 0, phi: 0, ax: 0, tp: it.tp });
function build() {
  const info = K.glyphInfo(); let A = null, R1 = 0, frac = 0;
  // coins about as wide as a stroke, smaller ones in the gaps: look for the size mix that gives 150–200 pieces
  for (const kR of [0.41, 0.36, 0.32]) {
    let lo = 0.3, hi = 0.9; R1 = info.strokeWidth * kR; frac = 0.55; A = arrange(info, kR, frac);
    for (let k = 0; k < 6; k++) {
      const n = A.discs.length + A.longs.length; if (n >= 160 && n <= 192) break;
      if (n > 192) lo = frac; else hi = frac;
      frac = (lo + hi) / 2; A = arrange(info, kR, frac);
    }
    if (A.discs.length + A.longs.length >= 150) break;
  }
  const q = L.rng('z1kind' + info.key), cnt = { cash: 0, huan: 0, gold: 0 }, all = []; let uid = 0;
  for (const d of A.discs) {
    const big = d.r > R1 * 0.8, x = q();
    const kind = big ? (x < 0.08 ? 'ingot' : x < 0.15 ? 'gold' : x < 0.27 ? 'huan' : 'cash') : (x < 0.06 ? 'gold' : x < 0.18 ? 'huan' : 'cash');
    if (kind === 'ingot') all.push({ kind, x: d.x, y: d.y, r: d.r, tp: false, scale: (d.r * 1.86) / 104, spr: forge(defOf('ingot', uid++, PAL.silver, d.ang + (q.chance(0.5) ? Math.PI : 0))) });
    else { const spr = stock(kind, cnt[kind]++ % (kind === 'cash' ? 16 : kind === 'huan' ? 4 : 3)); all.push({ kind, x: d.x, y: d.y, r: d.r, tp: q.chance(0.5), scale: (d.r * FIT) / (spr.ext - 1), spr }); }
  }
  all.sort((a, b) => a.r - b.r);                                                          // small ones underneath
  const LP = ['green', 'red', 'blue', 'black'];
  A.longs.forEach((o, i) => {
    const knife = o.kind === 'knife', scale = (2 * o.hl) / (knife ? 252 : 158), rot = o.ang - (knife ? 0 : Math.PI / 2) + (q.chance(0.5) ? Math.PI : 0);
    all.push({ kind: o.kind, x: o.x, y: o.y, r: R1 + 1, tp: false, scale, spr: forge(defOf(o.kind, uid++, PAL[LP[i % 4]], rot, Math.min(2, Math.max(1, Math.ceil(scale * 16) / 4)))) });
  });
  // choreography: who leaves when, and how it tumbles (flip axes near the light's diagonal, so a flipped face is still lit from the top-left)
  const c = L.rng('z1fly' + info.key), order = shuffle(all.map((_, i) => i), c);
  const cash = all.filter((it) => it.kind === 'cash' && it.r > R1 * 0.85);
  let hero = cash[0] || all[all.length - 1];
  for (const it of cash) if (Math.hypot(it.x - 430, it.y - 500) < Math.hypot(hero.x - 430, hero.y - 500)) hero = it;
  const nd = Math.floor(order.length * 0.8); let k = 0;
  for (const i of order) {
    const it = all[i];
    it.f0 = 999; it.dur = c.range(8.5, 11.5); it.spin = c.range(-0.6, 0.6); it.flip = c.range(0.6, 1.5) * c.sign(); it.ax = Math.PI / 4 + c.range(-0.5, 0.5);
    it.dx = c.range(-0.35, 0.35); it.dy = c.range(-0.35, 0.35); it.wob = c.chance(0.05) ? c() * TAU : null;
    if (it !== hero && k < nd) { it.f0 = 12 + 20.5 * Math.pow(k / nd, 0.6); k++; }
  }
  hero.f0 = 25.5; hero.dur = 11.5; hero.hero = true; hero.wob = null; hero.hk = Math.log(8.9 / hero.scale);
  // paper, a faint plate rule, and the tone the coins left where they lay
  const paper = K.paper({ base: '#efe7d3', tone: '#8a6a3a', seed: 'z1paper', fiber: 0.55, stain: 0.32, foxing: 0.3, edge: 0.2 });
  const pg = paper.getContext('2d');
  pg.strokeStyle = 'rgba(92,70,44,0.42)'; pg.lineWidth = 1.6; pg.strokeRect(41.5, 41.5, S - 83, S - 83);
  pg.strokeStyle = 'rgba(92,70,44,0.3)'; pg.lineWidth = 0.8; pg.strokeRect(48.5, 48.5, S - 97, S - 97);
  pg.save(); pg.filter = 'blur(2.5px)'; K.fillGlyph(pg, 'rgba(118,86,48,0.15)', { grow: 0.5 }); pg.restore();
  for (const it of all) { pg.save(); pg.globalAlpha = 0.09; pose(pg, it.x + 1, it.y + 1.5, restOf(it), it.scale * 1.04, 1); put(pg, it.spr.shadow[2]); pg.restore(); }
  // every piece at rest, with its shadows and a sliver of rim wall on the side away from the light, baked once at device resolution
  for (const it of all) {
    const R = it.spr.half * it.scale, d = Math.ceil(2 * (R * 1.45 + 12)), cv = L.makeCanvas(d, d), g = cv.getContext('2d'), st = restOf(it), tk = it.spr.T * it.scale * 0.36;
    it.ix = Math.round((it.x - d / 2) * Q) / Q; it.iy = Math.round((it.y - d / 2) * Q) / Q;
    g.translate(-it.ix, -it.iy); g.imageSmoothingQuality = 'high';
    castShadow(g, it, st, 0, 1);
    g.save(); pose(g, it.x + 0.55 * tk, it.y + 0.83 * tk, st, it.scale, 1); put(g, it.spr.side[0]); g.restore();
    g.save(); pose(g, it.x, it.y, st, it.scale, 1); put(g, faceLv(it.spr, it.scale, 0)); g.restore();
    it.rest = cv;
  }
  return { key: info.key, all, paper };
}

function flyState(it, u) {
  if (it.hero) {                                    // one full flip on the way up, then flat and enormous in front of the lens
    const e = Math.pow(Math.sin((Math.min(1, u) * Math.PI) / 2), 1.6), pe = L.smooth(Math.min(1, u * 1.15)), sc = it.scale * Math.exp(it.hk * e);
    return { x: L.lerp(it.x, 505, pe), y: L.lerp(it.y, 525, pe), m: sc / it.scale, sc, rot: 0.3 * e, phi: Math.PI * pe, ax: it.ax, tp: it.tp };
  }
  const e = Math.pow(u, 1.9), m = 1 / (1 - 0.84 * e), ox = it.x - C0, oy = it.y - C0, d = Math.hypot(ox, oy) || 1, v = e * e * 430;
  return { x: C0 + ox * m + (ox / d + it.dx) * v, y: C0 + oy * m + (oy / d + it.dy) * v, m, sc: it.scale * m, rot: it.spin * e, phi: it.flip * Math.PI * Math.pow(u, 1.4), ax: it.ax, tp: it.tp };
}
function render(ctx, b, f) {
  ctx.drawImage(b.paper, 0, 0);
  const fly = [];
  for (const it of b.all) {
    const u = (f - it.f0) / it.dur;
    if (u > 0) { if (u < 1 || it.hero) fly.push({ it, u: Math.min(u, 1), st: flyState(it, Math.min(u, 1)) }); continue; }
    const w = it.wob === null ? 0 : Math.sin(f * 1.1 + it.wob);                          // a few coins rock very slightly before anything leaves
    if (!w) { ctx.drawImage(it.rest, it.ix, it.iy); continue; }
    ctx.save(); ctx.translate(it.x + w * 0.5, it.y); ctx.rotate(w * 0.012); ctx.drawImage(it.rest, it.ix - it.x, it.iy - it.y); ctx.restore();
  }
  fly.sort((p, q) => p.st.m - q.st.m);                                                    // nearest to the lens last
  const top = fly[fly.length - 1], h = top && top.it.hero && top.u > 0.72 ? top.st : null;   // once the big coin fills the frame, skip what its body hides
  const hidden = (x, y, rad) => { if (!h) return false; const d = Math.hypot(x - h.x, y - h.y); return d + rad + 60 < 72 * h.sc && d - rad - 60 > 26 * h.sc; };
  for (const o of fly) {
    const st = o.st, z = Math.min(0.84, 1 - 1 / st.m), R0 = o.it.spr.half * o.it.scale;
    o.hide = !o.it.hero && hidden(st.x, st.y, o.it.spr.half * st.sc * 1.5);
    if (z < 0.83 && !hidden(C0 + (st.x - C0) / st.m + 60 * z, C0 + (st.y - C0) / st.m + 90 * z, R0 * 1.5 + 60)) castShadow(ctx, o.it, st, z, Math.pow(1 - z / 0.84, 2));
  }
  for (const o of fly) {
    if (o.hide) continue;
    const it = o.it, at = (v) => flyState(it, v);
    if (it.hero) renderCoin(ctx, it.spr, o.st, Math.min(16, 1.6 * Math.pow(o.st.m - 1, 0.85)), null, 1);
    else shoot(ctx, it.spr, at, o.u, 0.3 / it.dur, (a) => 1.5 * Math.pow(a.m - 1, 1.2), clamp((1 - o.u) / 0.1));
  }
}

// ───────────── the title card's flyers (their own high-resolution sprites; nothing here depends on the glyph or on init) ─────────────
let FL = null;
function flyers() {
  if (FL) return FL;
  const q = L.rng('z1card'), kinds = ['cash', 'spade', 'cash', 'gold', 'knife', 'cash', 'ingot', 'huan', 'cash', 'spade', 'cash', 'gold'];
  const pals = { cash: ['green', 'red', 'black', 'brass', 'blue'], spade: ['green', 'blue'], knife: ['red'], gold: ['gold'], ingot: ['silver'], huan: ['black'] };
  FL = kinds.map((kind, i) => {
    const a = (i / kinds.length) * TAU + q.range(-0.2, 0.2), d = q.range(70, 330);
    return { x: C0 + Math.cos(a) * d, y: C0 + Math.sin(a) * d, a: a + q.range(-0.3, 0.3), s0: q.range(1.0, 2.5) * (kind === 'knife' ? 0.6 : 1), te: q.range(0.5, 0.94),
      spin: q.range(-0.8, 0.8), flip: q.range(0.5, 1.3) * q.sign(), ax: Math.PI / 4 + q.range(-0.5, 0.5), ph: q.range(-0.6, 0.6),
      spr: forge(defOf(kind, 'f' + i, PAL[pals[kind][i % pals[kind].length]], q() * TAU, 2)) };
  });
  return FL;
}
/** for the title card: coins still flying off, on a transparent background. t ∈ [0,1]; nothing is left at t = 1. */
export function drawFlyers(ctx, t) {
  if (!(t < 1)) return;
  t = Math.max(0, t);
  const live = flyers().filter((f) => t < f.te).sort((p, q) => q.te - p.te);
  for (const f of live) {
    const at = (u) => {
      const m = 1 + 3.2 * Math.pow(u, 1.5), v = u * u * 1450;
      return { x: C0 + (f.x - C0) * m + Math.cos(f.a) * v, y: C0 + (f.y - C0) * m + Math.sin(f.a) * v, sc: f.s0 * (1 + 1.6 * u), rot: f.spin * u, phi: f.ph + f.flip * Math.PI * u, ax: f.ax, tp: false };
    };
    shoot(ctx, f.spr, at, t / f.te, 0.019 / f.te, (a) => Math.max(0, a.sc - 1.6) * 4.5, 1);
  }
}

let B = null;
export default {
  name: '百钱成字·飞散',
  init() { B = build(); },
  draw(ctx, env) {
    if (!B || B.key !== K.glyphInfo().key) B = build();
    render(ctx, B, env.frame);
  },
};
