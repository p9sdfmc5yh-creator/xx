// s30 — 黄绫钱拓. A leaf from a coin album (钱谱册页), very close: one ink rubbing (墨拓) of a cash coin, cut out round
// and mounted on imperial-yellow damask silk (黄绫).
// The arc is the scissor-cut upper edge of the rubbing = the outer edge of the coin's outer rim (外郭).
// Below it, pure black and white:
//   · the raised rim rubbed into a broad band of dense ink (edge lines crisp, the flat a touch drier),
//   · the field (钱肉) left paper-white, with the dabber's (拓包) ink laid down in layers that ripple along the arc
//     like sand, and a clean white halo wherever the paper dipped beside the relief,
//   · at the bottom, the top half of the character above the hole — 開 of 開元通寳 (直读: 穿上为“開”): only the two
//     door-leaves of 門 are in frame, which is all that is drawn; edges ragged like a real rubbing,
//   · two or three small white breaks where the paper skinned when it was lifted for remounting.
// Above it: bright yellow silk with a faint twill, a few creases, rubbed-pale patches and one vertical mounting seam,
// all kept to the sides so the tagline zone above the crest stays calm.
// Deliberate simplification: rim width and the distance from rim to character are compressed (at this magnification a real
// rim alone would fill the frame). Rubbing logic is kept true: raised = inked (rim, character), sunk = paper white.
// Motion: the rubbing slides a little about the arc's centre; the silk does not move.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PADX = 48, PADB = 40;      // spare rubbing beyond the frame (the layer only ever rotates ≈ ±19 px at the corners)
const RIMW = 86;                 // inked outer rim: 0 … RIMW px below the arc
const VT = 256;                  // top of 開, px below the crest
const RP = 33;                   // ripple period of the dabbing, px
const SEAM = 1478;               // x of the mounting seam in the silk
const PAPER = [236, 230, 214];   // 拓纸白 #ece6d6
const INK = [20, 19, 18];        // 墨 #141312
const GREY = [107, 102, 94];     // 灰墨 #6b665e
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** one brush stroke of the character as a slightly tapering slab */
function bar(g, xa, ya, xb, yb, wa, wb = wa) {
  const dx = xb - xa, dy = yb - ya, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  g.beginPath();
  g.moveTo(xa + nx * wa / 2, ya + ny * wa / 2); g.lineTo(xb + nx * wb / 2, yb + ny * wb / 2);
  g.lineTo(xb - nx * wb / 2, yb - ny * wb / 2); g.lineTo(xa - nx * wa / 2, ya - ny * wa / 2);
  g.closePath(); g.fill();
}
/** 開 (upper part): the two leaves of 門, each a 日-shaped box hanging from a long outer upright. Local frame: origin at the crest, +y down. */
function drawKai(g) {
  const t = VT;
  // left leaf
  bar(g, -284, t - 7, -292, t + 720, 57, 50);     // long left upright (starts a hair above the bar, leans out a little)
  bar(g, -302, t + 25, -40, t + 19, 44, 46);      // top bar, rising slightly to the right
  bar(g, -63, t - 1, -60, t + 228, 50, 45);       // short inner upright (the shoulder of the 横折 is the heaviest point)
  bar(g, -268, t + 114, -74, t + 111, 35, 38);    // middle bar
  bar(g, -268, t + 207, -38, t + 203, 40, 44);    // bottom bar
  // right leaf
  bar(g, 61, t + 3, 63, t + 228, 46, 47);         // short inner upright
  bar(g, 38, t + 23, 304, t + 17, 43, 47);        // top bar
  bar(g, 287, t - 6, 292, t + 720, 58, 52);       // long right upright
  bar(g, 74, t + 113, 268, t + 110, 38, 35);      // middle bar
  bar(g, 38, t + 206, 268, t + 202, 44, 40);      // bottom bar
  // (whatever stands inside the door begins below the frame and is deliberately not drawn)
}

/** the ink rubbing: everything below the arc, shaded per pixel in polar coordinates (u = px along the arc, v = px below it) */
function buildRub(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PADX, Y0 = Math.floor(a.crestY) - 2;
  const RW = W + PADX * 2, RH = H + PADB - Y0, N = RW * RH;
  const nA = L.makeNoise('s30a'), nB = L.makeNoise('s30b'), nC = L.makeNoise('s30c');

  // relief mask of the character → a soft copy (edges, emboss) and a wide copy (the white halo beside raised metal)
  const mk = L.makeCanvas(RW, RH), mg = mk.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, RW, RH);
  mg.translate(-X0, -Y0); mg.fillStyle = '#fff';
  a.at(mg, 0, 0, () => drawKai(mg));
  const soft = L.blurred(mk, 3).getContext('2d').getImageData(0, 0, RW, RH).data;
  const halo = L.blurred(mk, 20).getContext('2d').getImageData(0, 0, RW, RH).data;
  const near = L.blurred(mk, 46).getContext('2d').getImageData(0, 0, RW, RH).data;

  // slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const gWarp = new Float32Array(cw * ch), gEnv = new Float32Array(cw * ch), gSm = new Float32Array(cw * ch),
    gTone = new Float32Array(cw * ch), gDry = new Float32Array(cw * ch), gWarp2 = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.hypot(ddx, ddy);
    const u = Math.atan2(ddx, ddy) * R, v = R - rr, k = j * cw + i;
    gWarp[k] = 27 * nA.fbm(u / 520, v / 190, 3) + 5 * nB.n2(u / 140 + 7, v / 60);
    gEnv[k] = nB.fbm(u / 250 + 30, v / 130 - 8, 2);
    gSm[k] = nC.fbm(u / 170 - 9, v / 110 + 4, 3);
    gTone[k] = nC.fbm(u / 600 + 3, v / 400, 2);
    gDry[k] = nA.fbm(u / 110 + 50, v / 46 + 9, 2);
    gWarp2[k] = 21 * nC.fbm(u / 380 + 90, v / 150 - 40, 3) + 4 * nA.n2(u / 110 - 3, v / 50 + 61);
  }
  let bi = 0, bx = 0, by = 0;
  const bset = (i, j) => { const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0; bx = fx - i0; by = fy - j0; bi = j0 * cw + i0; };
  const bil = (src) => { const a0 = src[bi], a1 = src[bi + 1], b0 = src[bi + cw], b1 = src[bi + cw + 1]; return (a0 + (a1 - a0) * bx) * (1 - by) + (b0 + (b1 - b0) * bx) * by; };

  // pass 1: polar coordinates + relief height (for the emboss the paper kept from the coin)
  const U = new Float32Array(N), V = new Float32Array(N), Hh = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, ddx = X0 + i - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), v = R - rr;
      V[k] = v;
      if (v < -1.5) continue;
      U[k] = Math.atan2(ddx, ddy) * R;
      const rim = 1 - sstep(RIMW - 4, RIMW + 4, v), cm = soft[k * 4] / 255;
      Hh[k] = rim > cm ? rim : cm;
    }
  }

  // pass 2: ink
  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 0; j < RH; j++) {
    const jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, v = V[k];
      if (v < -1.5) continue;
      const u = U[k];
      bset(i, j);
      // paper tooth + the weave of the dabber's cloth + a pinch of white noise
      const g1 = nA.n2(u / 2.4, v / 2.4), g2 = nB.n2(u / 6.5 + 11, v / 6.5), wh = hash2(i, j);
      const grain = 0.5 + 0.3 * g1 + 0.17 * g2 + 0.16 * (wh - 0.5);
      const dry = bil(gDry);

      let D = 0;
      // 1) the rim: dense ink, both edge lines crisp; on the flat the dabber left a few dry streaks running round the coin
      const rimIn = RIMW + 2.4 * nB.n2(u / 37, 3.3) + 1.2 * g2;
      if (v < rimIn + 3) {
        const stv = nA.fbm(u / 190 + 50, v / 6.5 + 9, 2) + 0.4 * dry;
        let dd = 1.04 + 1.0 * Math.min(0, stv + 0.36);
        const e = Math.max(1 - sstep(4, 9, v), sstep(rimIn - 10, rimIn - 4, v));
        dd += (1.2 - dd) * e;
        D = dd * (1 - sstep(rimIn - 1.5, rimIn + 1.5, v));
      }
      // 2) the character: thick strokes, ragged where the dabber rode over the edge
      const cm = soft[k * 4] / 255;
      if (cm > 0.02) {
        const dc = sstep(0.36, 0.6, cm + 0.15 * nC.n2(u / 12, v / 12) + 0.1 * nC.n2(u / 47 + 5, v / 47) + 0.07 * g2) * (0.96 + 0.3 * dry);
        if (dc > D) D = dc;
      }
      // 3) the field: two passes of the dabber, each leaving its own train of ripples along the arc (crisp leading edge,
      //    stippled trailing edge); nothing where the paper dips beside the relief
      const hn = 0.5 + 0.5 * nC.n2(u / 33 + 40, v / 33);   // the white moat beside the relief is never an even width
      const clear = (1 - sstep(0.01 + 0.03 * hn, 0.1 + 0.1 * hn, halo[k * 4] / 255)) * sstep(rimIn + 5 + 5 * hn, rimIn + 22 + 10 * hn, v);
      let G = 0.56;
      if (clear > 0.01) {
        // first pass: the black train
        let ph = (v + bil(gWarp)) / RP, kk = Math.floor(ph), f = ph - kk;
        let tk = 0.5 + 0.13 * nA.n2(u / 240 + kk * 7.31, kk * 3.17);
        let st = L.clamp(1.1 + 0.95 * nB.n2(u / 560 - kk * 5.1, kk * 9.7 + 4));
        let dd = sstep(0, 0.06, f) * (1 - sstep(tk * 0.66, tk * 1.36, f)) * st * (0.84 + 0.4 * bil(gEnv)) * (0.98 + 0.3 * nC.n2(u / 70 + 3, v / 4.5));
        // second pass: lighter, drier, laid at a slight angle across the first
        ph = (v + u * 0.034 + bil(gWarp2)) / (RP * 0.76) + 0.37; kk = Math.floor(ph); f = ph - kk;
        tk = 0.34 + 0.13 * nA.n2(u / 200 - kk * 4.7, kk * 6.1 + 20);
        st = L.clamp(0.62 + 0.7 * nB.n2(u / 380 + kk * 3.3, kk * 2.9 - 14));
        const d2 = sstep(0, 0.1, f) * (1 - sstep(tk * 0.5, tk * 1.4, f)) * st * 0.64;
        if (d2 > dd) dd = d2;
        const sm = 0.33 * sstep(0.05, 0.55, bil(gSm));
        if (sm > dd) dd = sm;
        // the dabber goes light round the character, so the strokes stand clear of the ripples
        dd *= clear * (1 - 0.5 * sstep(0.02, 0.3, near[k * 4] / 255));
        if (dd > D) { D = dd; G = 0.8; }
      }

      // ink through the paper grain: stippled where thin, solid where the dabber struck hard
      const ia = sstep(0.4, 0.6, D + (grain - 0.5) * G);
      const tone = ia * (0.74 + 0.26 * sstep(0.3, 0.9, D)) + 0.2 * sstep(0.1, 0.8, D) * (1 - ia);
      const deep = sstep(0.35, 0.85, D);
      const tn = bil(gTone), pf = 1 + 0.03 * tn + 0.022 * g1;
      let cr = PAPER[0] * pf, cg = PAPER[1] * pf, cb = PAPER[2] * (pf - 0.03 * Math.max(0, tn));
      cr += (GREY[0] + (INK[0] - GREY[0]) * deep - cr) * tone;
      cg += (GREY[1] + (INK[1] - GREY[1]) * deep - cg) * tone;
      cb += (GREY[2] + (INK[2] - GREY[2]) * deep - cb) * tone;

      // emboss the paper kept from the coin, lit from the upper left
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      let sh = (hx + hy) * 2.4; sh = sh < -0.55 ? -0.55 : sh > 0.55 ? 0.55 : sh;
      if (sh < 0) { const m = 1 + sh * 0.5; cr *= m; cg *= m; cb *= m; } else { const m = sh * 46; cr += m; cg += m; cb += m * 0.94; }

      const o = k * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb;
      d[o + 3] = v >= 0.5 ? 255 : (v + 0.5) * 255 < 0 ? 0 : (v + 0.5) * 255;   // the scissor cut: anti-aliased, exactly on the arc
    }
  }

  // 3) small white breaks where the inked skin of the paper came away (揭裱)
  const tears = [
    { u: 282, v: 106, rx: 72, ry: 30, rot: -0.14, s: 1.7 },
    { u: -520, v: 204, rx: 50, ry: 23, rot: 0.22, s: 5.2 },
    { u: 752, v: 48, rx: 36, ry: 17, rot: -0.3, s: 9.4 },
  ];
  for (const t of tears) {
    const p0 = a.pt(t.u / R, -t.v), e = Math.ceil(t.rx * 1.6);
    const cs = Math.cos(t.rot), sn = Math.sin(t.rot);
    for (let j = Math.max(0, Math.floor(p0.y - Y0 - e)); j <= Math.min(RH - 1, Math.ceil(p0.y - Y0 + e)); j++) {
      for (let i = Math.max(0, Math.floor(p0.x - X0 - e)); i <= Math.min(RW - 1, Math.ceil(p0.x - X0 + e)); i++) {
        const k = j * RW + i; if (V[k] < 0.5) continue;
        const du0 = U[k] - t.u, dv0 = V[k] - t.v, du = (du0 * cs + dv0 * sn) / t.rx, dv = (-du0 * sn + dv0 * cs) / t.ry;
        const dw = dv * (1 + 0.55 * du);   // skinned paper tears to a point at one end
        const q = 1 - Math.sqrt(du * du + dw * dw) + 0.3 * nC.n2(U[k] / 30 + t.s, V[k] / 30) + 0.08 * nA.n2(U[k] / 9, V[k] / 9 + t.s) + 0.03 * nA.n2(U[k] / 3, V[k] / 3);
        if (q < -0.1) continue;
        const o = k * 4, fib = 0.5 + 0.5 * nB.n2(U[k] / 3.1, V[k] / 1.6 + t.s);
        if (q <= 0) {   // lifted fibres round the break
          const m = 0.16 * sstep(-0.1, 0, q) * fib;
          d[o] += (244 - d[o]) * m; d[o + 1] += (240 - d[o + 1]) * m; d[o + 2] += (228 - d[o + 2]) * m;
        } else {
          const m = sstep(0, 0.035, q);
          // the step down into the break: a thin shadow under its upper-left lip
          const lip = (1 - sstep(0.0, 0.26, q)) * (0.07 + 0.2 * L.clamp(0.5 - 0.6 * (du + dv)));
          const w = (1 - lip) * (0.97 + 0.03 * fib);
          d[o] += (250 * w - d[o]) * m; d[o + 1] += (247 * w - d[o + 1]) * m; d[o + 2] += (238 * w - d[o + 2]) * m;
        }
      }
    }
  }

  const cnv = L.makeCanvas(RW, RH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);
  g.translate(-X0, -Y0);
  g.globalCompositeOperation = 'source-atop';
  // stray paper fibres
  const r = L.rng('s30fib');
  g.lineCap = 'round';
  for (let n = 0; n < 420; n++) {
    const x = r.range(X0, X0 + RW), y = r.range(Y0, Y0 + RH), len = r.range(5, 26), an = r.range(0, Math.PI);
    g.strokeStyle = r.chance(0.6) ? `rgba(250,247,236,${r.range(0.08, 0.3)})` : `rgba(70,62,48,${r.range(0.06, 0.2)})`;
    g.lineWidth = r.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-3, 3), y + Math.sin(an) * len * 0.5 + r.range(-3, 3), x + Math.cos(an) * len, y + Math.sin(an) * len);
    g.stroke();
  }
  // raking light from the upper left; the sheet falls away a little toward the lower corners
  g.fillStyle = L.radial(g, 760, 610, 260, 1500, [[0, 'rgba(255,252,240,0.07)'], [0.45, 'rgba(60,48,20,0)'], [1, 'rgba(34,26,10,0.3)']]);
  g.fillRect(X0, Y0, RW, RH);
  return { cnv, X0, Y0 };
}

/** a rubbed-pale patch of silk (磨白): ragged, streaky along the threads. Returns a w×h canvas with alpha. */
function wornPatch(w, h, seed, stretchY = 2.4) {
  const nz = L.makeNoise(seed), img = new ImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ex = (x - w / 2) / (w / 2), ey = (y - h / 2) / (h / 2);
    const e = 1 - (ex * ex + ey * ey * ey * ey);
    const n = 0.55 * nz.fbm(x / 46, y / (46 * stretchY), 3) + 0.2 * nz.n2(x / 5, y / 38) + 0.14 * nz.n2(x / 30, y / 4);
    const m = sstep(0.16, 0.5, e * 0.62 + n);
    const th = 0.74 + 0.26 * (((x + y) >> 1) % 3 === 0 ? 0.3 : 1) * (0.7 + 0.3 * hash2(x, y));
    const o = (y * w + x) * 4;
    d[o] = 254; d[o + 1] = 245; d[o + 2] = 200; d[o + 3] = 255 * m * th;
  }
  const c = L.makeCanvas(w, h); c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** the yellow damask silk the rubbing is mounted on (static, frame-sized) */
function buildSilk(env) {
  const a = env.arc;
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  const nz = L.makeNoise('s30silk');
  // 明黄, with the soft directional lustre of silk: lighter toward the upper left, deeper and warmer at the corners
  g.fillStyle = '#f5d21a'; g.fillRect(0, 0, W, H);
  g.fillStyle = L.radial(g, 720, 150, 60, 1560, [[0, 'rgba(252,234,140,0.5)'], [0.5, 'rgba(249,220,70,0.12)'], [1, 'rgba(238,188,6,0.3)']]);
  g.fillRect(0, 0, W, H);
  // the piece to the right of the seam was cut from another length: a shade deeper
  g.fillStyle = 'rgba(232,172,0,0.2)'; g.fillRect(SEAM, 0, W - SEAM, H);
  // lustre streaks along the warp, slubs along the weft, slow mottling
  g.globalCompositeOperation = 'soft-light';
  g.globalAlpha = 0.13; g.drawImage(L.noiseTex(W, H, { seed: 's30sheen', scale: 120, sx: 0.5, sy: 12, octaves: 3, contrast: 1.3, res: 0.25 }), 0, 0);
  g.globalAlpha = 0.1; g.drawImage(L.noiseTex(W, H, { seed: 's30slub', scale: 30, sx: 40, sy: 0.14, octaves: 2, contrast: 1.9, res: 0.5 }), 0, 0);
  g.globalAlpha = 0.13; g.drawImage(L.noiseTex(W, H, { seed: 's30mott', scale: 520, octaves: 3, contrast: 1.4, res: 0.2 }), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // twill (斜纹): a very faint diagonal rib; it runs the other way on the piece right of the seam
  const twill = (dir) => {
    const T = 6, t = L.makeCanvas(T, T), tg = t.getContext('2d');
    tg.lineWidth = 1.15;
    for (let o = -T; o <= T; o += T) {
      tg.strokeStyle = 'rgba(255,249,196,0.55)'; tg.beginPath(); tg.moveTo(o - 1, dir > 0 ? T + 1 : -1); tg.lineTo(o + T + 1, dir > 0 ? -1 : T + 1); tg.stroke();
      tg.strokeStyle = 'rgba(196,140,0,0.5)'; tg.beginPath(); tg.moveTo(o + 2, dir > 0 ? T + 1 : -1); tg.lineTo(o + T + 4, dir > 0 ? -1 : T + 1); tg.stroke();
    }
    return g.createPattern(t, 'repeat');
  };
  g.globalAlpha = 0.34;
  g.fillStyle = twill(1); g.fillRect(0, 0, SEAM, H);
  g.fillStyle = twill(-1); g.fillRect(SEAM, 0, W - SEAM, H);
  g.globalAlpha = 1;

  // rubbed-pale patches (磨白) — all well clear of the tagline zone
  g.globalAlpha = 0.9; g.drawImage(wornPatch(150, 520, 's30wornA', 3.2), 196, -20);
  g.globalAlpha = 0.75; g.drawImage(wornPatch(130, 110, 's30wornB', 1.2), 1668, 372);
  g.globalAlpha = 0.6; g.drawImage(wornPatch(120, 90, 's30wornC', 0.8), 52, 560);
  g.globalAlpha = 0.55; g.drawImage(wornPatch(70, 190, 's30wornD', 2.6), 1362, 30);
  g.globalAlpha = 1;

  // creases (细折痕): a sharp light ridge with its shadow line, a soft valley either side, the dye rubbed thin along the fold
  const crease = (pts, seed, k = 1) => {
    const p = L.smoothPath(pts.map(([x, y], i) => [x + 5 * nz.n2(i * 1.7, seed), y + 5 * nz.n2(i * 1.7 + 9, seed)]), 8);
    const path = (dx, dy) => { g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0] + dx, q[1] + dy) : g.moveTo(q[0] + dx, q[1] + dy))); };
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = `rgba(204,146,0,${0.1 * k})`; g.lineWidth = 34; path(11, 13); g.stroke();
    g.strokeStyle = `rgba(196,138,0,${0.17 * k})`; g.lineWidth = 16; path(5, 6); g.stroke();
    g.strokeStyle = `rgba(255,249,200,${0.2 * k})`; g.lineWidth = 14; path(-5, -6); g.stroke();
    g.strokeStyle = `rgba(150,100,0,${0.6 * k})`; g.lineWidth = 1.5; path(1.3, 1.5); g.stroke();
    g.strokeStyle = `rgba(255,251,220,${0.9 * k})`; g.lineWidth = 1.7; path(0, 0); g.stroke();
    g.restore();
    L.chalkStroke(g, p, { width: 7, color: '#fff6c8', seed: 's30cr' + seed, density: 0.2, jitter: 1.5, alpha: 0.75 * k, step: 2 });
  };
  crease([[-20, 318], [150, 236], [330, 150], [470, 92], [600, -20]], 1, 1);
  crease([[92, -20], [110, 180], [100, 380], [124, 560], [118, 720]], 2, 0.8);
  crease([[1560, 196], [1680, 232], [1800, 250], [1940, 296]], 3, 1);
  crease([[1742, -20], [1722, 150], [1736, 330], [1700, 520], [1712, 700]], 4, 0.75);
  crease([[1330, 96], [1400, 70], [1474, 58]], 5, 0.6);

  // pulled threads (抽丝): straight hairlines along the weft, fading out at both ends
  const rr = L.rng('s30pull');
  for (const [x, y, len] of [[388, 318, 190], [1560, 96, 240], [1500, 498, 170]]) {
    g.save(); g.translate(x, y); g.rotate(rr.range(-0.006, 0.006));
    g.fillStyle = L.linear(g, 0, 0, len, 0, [[0, 'rgba(255,250,214,0)'], [0.15, 'rgba(255,250,214,0.6)'], [0.7, 'rgba(255,250,214,0.5)'], [1, 'rgba(255,250,214,0)']]);
    g.fillRect(0, 0, len, 1.3);
    g.fillStyle = L.linear(g, 0, 0, len, 0, [[0, 'rgba(170,118,0,0)'], [0.3, 'rgba(170,118,0,0.36)'], [1, 'rgba(170,118,0,0)']]);
    g.fillRect(2, 1.4, len * rr.range(0.6, 0.95), 1);
    g.restore();
  }
  // a few foxing spots, far from the centre
  for (let i = 0; i < 26; i++) {
    const left = rr.chance(0.5), x = left ? rr.range(10, 560) : rr.range(1350, 1910), y = rr.range(10, 720), rad = rr.range(2, 9);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, `rgba(190,120,0,${rr.range(0.18, 0.4)})`], [1, 'rgba(190,120,0,0)']]);
    g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
  }

  // the mounting seam: the left piece laps over the right — a lit fold, a hard shadow line, a soft shadow beyond
  const seamX = (y) => SEAM + 1.6 * nz.n2(y / 140, 4.4) + 0.5 * nz.n2(y / 17, 8.8) + (y - 300) * 0.004;
  const seam = (dx, wdt, style) => { g.strokeStyle = style; g.lineWidth = wdt; g.beginPath(); for (let y = -10; y <= H + 10; y += 12) { if (y < 0) g.moveTo(seamX(y) + dx, y); else g.lineTo(seamX(y) + dx, y); } g.stroke(); };
  seam(13, 24, 'rgba(186,128,0,0.1)');
  seam(6, 10, 'rgba(170,112,0,0.18)');
  seam(-4, 7, 'rgba(255,248,196,0.3)');
  seam(1.7, 2, 'rgba(112,70,0,0.72)');
  seam(-0.4, 1.5, 'rgba(255,252,224,0.85)');

  // the paste line: the silk is a touch darker right against the edge of the rubbing
  g.save(); g.filter = 'blur(3px)'; g.strokeStyle = 'rgba(150,96,0,0.5)'; g.lineWidth = 7; a.stroke(g, 1.5); g.restore();

  // fine tooth
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
  g.drawImage(L.grainTex(W, H, { seed: 's30g', amount: 0.14 }), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '黄绫钱拓',
  tone: 'dark',
  init(env) {
    S = { silk: buildSilk(env), rub: buildRub(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.drawImage(S.silk, 0, 0);
    // the rubbing slides about the arc's centre: its cut edge stays on the arc, the ink ripples travel along it
    const rot = L.lerp(-0.0085, 0.0085, p);
    ctx.save();
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.rub.cnv, S.rub.X0, S.rub.Y0);
    ctx.restore();
    // a breath of sheen on the dense ink of the rim (the light stays put while the sheet slides)
    ctx.save(); a.clipBand(ctx, 0, -RIMW - 4); ctx.globalCompositeOperation = 'screen';
    const q = a.pt(-0.13, -RIMW * 0.5);
    ctx.translate(q.x, q.y); ctx.rotate(-0.13); ctx.scale(4.2, 1);
    ctx.fillStyle = L.radial(ctx, 0, 0, 0, 150, [[0, 'rgba(214,206,186,0.16)'], [0.5, 'rgba(214,206,186,0.06)'], [1, 'rgba(214,206,186,0)']]);
    ctx.fillRect(-150, -150, 300, 300);
    ctx.restore();
  },
};
