// s33 — 红斑锈微粒. Dark-field microscopy of the red spot (红斑, cuprite) on a bronze coin. Only black and red.
//   on the arc     → the edge of the coin's outer rim (外郭), picked out by raking light as a hair-thin vermilion line;
//                    RIMW px inside it a dimmer parallel line: the inner edge of the rim
//   below the arc  → the coin's face, almost pure black; at the bottom a crust of cuprite crystals rises like a small
//                    jagged mountain (bright lit wall → shadow trough → glittering interior), its foot crumbling into loose grains
//   above the arc  → black ground strewn with cuprite dust: sub-pixel powder, shards, a few faceted crystals, out-of-focus
//                    discs toward the corners; the dust thins out and dims above the crest (tagline zone)
// Everything static is baked in init(): three dust layers (blended with rotating weights → the powder shimmers) and the coin.
// Per frame only a few hundred sprite glints are drawn, each with its own pre-generated phase.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 56;          // layers only slide ~±10 px along the arc and creep 1.4 % closer
const RIMW = 46;         // width of the coin's outer rim band at this magnification
const MX = 925, MY = 1345, RX = 770, RY = 485;   // the cuprite crust: an ellipse whose top pokes into frame (crest ≈ y 860)
let S = null;
const TM = []; let _t = 0; const tick = (n) => { const t = performance.now(); TM.push(n + ':' + ((t - _t) | 0)); _t = t; };

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
/** integer lattice hash → [0,1) */
const hsh = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// allocation-free worley noise: squared distances in cD1/cD2, cell id in cId
let cD1 = 0, cD2 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 4095) / 4095; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = id;
}

// particle colours: dark cuprite red → vermilion → orange (never grey, never pink)
const PRAMP = L.makeRamp([[0, '#4a0a07'], [0.26, '#7a120c'], [0.6, '#e2301c'], [0.88, '#f8431f'], [1, '#ff7a3a']]);
const PCOL = []; for (let i = 0; i < 64; i++) PCOL.push(L.css(PRAMP(i / 63)));
const pcol = (u) => PCOL[Math.max(0, Math.min(63, (u * 63) | 0))];

/** camera blit for layers cropped to their content (ox, oy = frame position of the canvas's top-left corner) */
function blitAt(ctx, env, cnv, ox, oy, o = {}) {
  const { rot = 0, zoom = 1, alpha = 1, blend = 'source-over' } = o, a = env.arc;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(cnv, ox, oy);
  ctx.restore();
}

/** irregular shard outline around (x, y) */
function shard(g, r, x, y, rad, nv, squash) {
  const o = r() * L.TAU, co = Math.cos(o), so = Math.sin(o), a0 = r() * L.TAU;
  g.beginPath();
  for (let k = 0; k < nv; k++) {
    const an = a0 + ((k + r.range(-0.3, 0.3)) / nv) * L.TAU, rd = rad * r.range(0.6, 1.1);
    const px = Math.cos(an) * rd, py = Math.sin(an) * rd * squash;
    const X = x + px * co - py * so, Y = y + px * so + py * co;
    if (k) g.lineTo(X, Y); else g.moveTo(X, Y);
  }
  g.closePath();
}

function sprite(stops) {
  const c = L.makeCanvas(48, 48), g = c.getContext('2d');
  g.fillStyle = L.radial(g, 24, 24, 0, 24, stops); g.fillRect(0, 0, 48, 48);
  return c;
}

// ───────────────────────── the dust field above the arc ─────────────────────────
function buildDust(env) {
  const a = env.arc, R = a.R;
  const AW = W + PAD * 2, AH = Math.ceil(a.yAt(-PAD)) + 20 + PAD;

  // density / brightness fields on a coarse grid (frame coords = canvas coords − PAD)
  const CS = 6, cw = Math.ceil(AW / CS) + 2, ch = Math.ceil(AH / CS) + 2;
  const Dn = new Float32Array(cw * ch), Br = new Float32Array(cw * ch), Qf = new Float32Array(cw * ch);
  const nz = L.makeNoise('s33den');
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = -PAD + i * CS, y = -PAD + j * CS, k = j * cw + i;
    const dr = a.drAt(x, y);
    // "calm" grows from the tagline zone above the crest out to the corners
    const q = Math.hypot((x - a.cx) / 560, (y - (a.crestY - 125)) / 330) + 0.14 * nz.fbm(x / 380, y / 380, 2);
    const calm = sstep(0.62, 1.62, q);
    const cloud = nz.fbm(x / 270 + 3, y / 270 - 8, 3), clump = nz.fbm(x / 70 - 20, y / 70 + 4, 2);
    // the powder was shaken on from above the coin: faint streaks fan out along the coin's radii
    const pl = a.polar(x, y), streak = nz.fbm((pl.theta * R) / 34, pl.dr / 520 + 5, 2);
    const tex = L.clamp(0.82 + 0.6 * cloud + 0.34 * clump + 0.4 * streak, 0.22, 1.7);
    Dn[k] = sstep(26, 88, dr) * L.lerp(0.2, 1, calm) * (1 + 0.5 * sstep(1.4, 2.4, q)) * tex;
    Br[k] = L.lerp(0.55, 1, calm); Qf[k] = q;
  }
  const bil = (F, cxp, cyp) => {
    const fx = cxp / CS, fy = cyp / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = F[k], a1 = F[k + 1], b0 = F[k + cw], b1 = F[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };
  const inField = (x, y) => x > -PAD && x < W + PAD - 1 && y > -PAD && y < AH - PAD - 1;
  const den = (x, y) => bil(Dn, x + PAD, y + PAD), bri = (x, y) => bil(Br, x + PAD, y + PAD), qf = (x, y) => bil(Qf, x + PAD, y + PAD);

  tick('start'); _t = performance.now();
  // three layers; every grain lands in one of them at random
  const cv = [], gx = [];
  for (let k = 0; k < 3; k++) { const c = L.makeCanvas(AW, AH); cv.push(c); gx.push(c.getContext('2d')); }

  // 1) the finest powder, one pixel per grain
  const im = gx.map((g) => g.createImageData(AW, AH));
  const yArc = a.crestY - 44;
  for (let j = 0; j < AH; j++) {
    const y = j - PAD, near = y > yArc;
    for (let i = 0; i < AW; i++) {
      const h = hsh(i, j);
      let pr = 0.085 * bil(Dn, i, j), bf = bil(Br, i, j);
      if (near) {   // a lip of fine dust banked against the coin's edge
        const x = i - PAD, dr = Math.hypot(x - a.cx, y - a.cy) - R;
        if (dr > -0.5 && dr < 34) { const pl = 0.26 * Math.exp(-dr / 8.5) * (0.55 + 0.45 * nz.n2(x / 60, 7.7)); if (pl > pr) { pr = pl; bf = 0.62; } }
      }
      if (h >= pr) continue;
      const u = Math.pow(hsh(i + 7919, j - 104729), 2.6), v = (58 + 190 * u) * bf;
      const d = im[(hsh(i - 31337, j + 911) * 3) | 0].data, o = (j * AW + i) * 4;
      d[o] = v; d[o + 1] = v * (0.14 + 0.09 * u); d[o + 2] = v * 0.105; d[o + 3] = 255;
    }
  }
  gx.forEach((g, k) => { g.putImageData(im[k], 0, 0); g.translate(PAD, PAD); }); tick('micro');

  const r = L.rng('s33dust');
  const pick = () => gx[(r() * 3) | 0];
  const DMAX = 2.3;
  const tryPt = () => { const x = r.range(-PAD, W + PAD - 2), y = r.range(-PAD, AH - PAD - 2); return r() < den(x, y) / DMAX ? [x, y] : null; };

  // 2) small grains
  const grain = (x, y, scale) => {
    const g = pick(), u = Math.pow(r(), 1.45) * bri(x, y), rad = (0.7 + 1.25 * Math.pow(r(), 2.2)) * scale;
    g.globalAlpha = 0.6 + 0.4 * r(); g.fillStyle = pcol(0.22 + 0.78 * u);
    g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.5, 1), r() * Math.PI, 0, L.TAU); g.fill();
  };
  for (let n = 0; n < 230000; n++) { const p = tryPt(); if (p) grain(p[0], p[1], 1); }
  tick('grains');
  // tight clumps
  for (let n = 0; n < 420; n++) {
    const p = tryPt(); if (!p) continue;
    const cnt = r.int(8, 30), sg = r.range(4, 13);
    for (let k = 0; k < cnt; k++) { const x = p[0] + r.gauss() * sg, y = p[1] + r.gauss() * sg; if (inField(x, y) && a.drAt(x, y) > 30) grain(x, y, 1.15); }
  }
  tick('clumps');
  // 3) shards: lit on the upper-left, dark on the lower-right
  for (let n = 0; n < 22000; n++) {
    const p = tryPt(); if (!p) continue;
    const g = pick(), [x, y] = p, b = bri(x, y), u = (0.35 + 0.65 * Math.pow(r(), 1.2)) * b, rad = 1.7 + 2.1 * Math.pow(r(), 2.4);
    g.globalAlpha = 0.9; g.fillStyle = pcol(u * 0.62);
    shard(g, r, x, y, rad, r.int(4, 6), r.range(0.55, 1)); g.fill();
    g.globalAlpha = 0.9; g.fillStyle = pcol(Math.min(1, u * 1.15 + 0.1));
    g.beginPath(); g.ellipse(x - rad * 0.22, y - rad * 0.26, rad * 0.5, rad * 0.36, r() * Math.PI, 0, L.TAU); g.fill();
  }
  tick('shards');
  // 4) a few real crystals: faceted, one facet flashing
  for (let n = 0; n < 1300; n++) {
    const p = tryPt(); if (!p) continue;
    const g = pick(), [x, y] = p, b = bri(x, y), rad = 3.4 + 5 * Math.pow(r(), 2.4), hot = r.chance(0.3);
    g.globalAlpha = 1;
    g.fillStyle = L.linear(g, x - rad, y - rad, x + rad, y + rad, [[0, pcol(0.7 * b)], [0.55, pcol(0.36 * b)], [1, pcol(0.1)]]);
    shard(g, r, x, y, rad, r.int(5, 7), r.range(0.7, 1)); g.fill();
    g.fillStyle = hot ? L.rgba('#ff7a3a', b) : pcol(0.82 * b);
    g.beginPath(); g.moveTo(x - rad * 0.65, y - rad * 0.2); g.lineTo(x - rad * 0.05, y - rad * 0.75); g.lineTo(x + rad * 0.2, y - rad * 0.05); g.lineTo(x - rad * 0.3, y + rad * 0.25); g.closePath(); g.fill();
    if (hot) { g.fillStyle = L.rgba('#ffd9c2', 0.95 * b); g.beginPath(); g.ellipse(x - rad * 0.28, y - rad * 0.32, rad * 0.24, rad * 0.15, -0.7, 0, L.TAU); g.fill(); }
  }

  tick('crystals');
  // depth of field: grains melt a little toward the corners …
  cv.forEach((c, k) => {
    const g = gx[k], soft = L.blurred(c, 1.9), sg = soft.getContext('2d');
    const m = (t) => L.radial(t, a.cx + PAD, a.crestY - 40 + PAD, 560, 1220, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.8)']]);
    sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = m(sg); sg.fillRect(0, 0, AW, AH);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = m(g); g.fillRect(0, 0, AW, AH);
    g.globalCompositeOperation = 'lighter'; g.drawImage(soft, 0, 0); g.globalAlpha = 0.55; g.drawImage(soft, 0, 0);
    g.restore();
  });
  tick('dof');
  // … where a few grains close to the lens open into discs and rings
  for (let n = 0; n < 70; n++) {
    const x = r.range(-PAD, W + PAD - 2), y = r.range(-PAD, AH - PAD - 2), q = qf(x, y);
    const rad = r.range(5, 13), ring = r.chance(0.45), col = r.chance(0.25) ? '#ff7a3a' : '#e2301c', al = r.range(0.1, 0.2);
    if (q < 1.45 || r() > sstep(1.4, 2.3, q) || a.drAt(x, y) < 70 + rad) continue;
    const g = pick(); g.globalAlpha = 1;
    if (ring) {
      g.strokeStyle = L.rgba(col, al * 1.5); g.lineWidth = Math.max(1.3, rad * 0.14); g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.stroke();
      g.fillStyle = L.rgba(col, al * 0.22); g.fill();
    } else {
      g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al * 0.7)], [0.7, L.rgba(col, al * 0.8)], [0.9, L.rgba(col, al)], [1, L.rgba(col, 0)]]);
      g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
    }
  }
  // halation: a tight bloom plus a wide red haze where the powder lies thick (quarter-res)
  cv.forEach((c, k) => {
    const g = gx[k], q4 = L.makeCanvas(AW / 4, AH / 4), qg = q4.getContext('2d');
    qg.drawImage(c, 0, 0, q4.width, q4.height);
    const b1 = L.blurred(q4, 1.6), b2 = L.blurred(q4, 9);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.imageSmoothingQuality = 'high';
    g.globalAlpha = 0.22; g.drawImage(b1, 0, 0, AW, AH);
    g.globalAlpha = 0.2; g.drawImage(b2, 0, 0, AW, AH);
    g.restore();
  });

  tick('halo');
  // glints that flare individually, each with its own phase
  const sparks = [];
  for (let n = 0; n < 7000; n++) {
    const p = tryPt(); if (!p) continue;
    const b = bri(p[0], p[1]), roll = r();
    const k = roll < 0.05 ? 3 : roll < 0.2 ? 2 : roll < 0.48 ? 1 : 0;
    const s = k === 3 ? r.range(11, 19) : k === 2 ? r.range(6, 12) : r.range(4, 9);
    sparks.push({ x: p[0], y: p[1], s, k, a: (k === 3 ? 0.95 : r.range(0.6, 1)) * b, ph: r(), per: r.range(2.2, 6.5), fl: r.chance(0.3) ? r.range(0.4, 0.8) : r.range(0, 0.25) });
  }
  return { cv, sparks };
}

// ───────────────────────── the cuprite crust at the bottom of frame ─────────────────────────
function moundShape() {
  const nz = L.makeNoise('s33edge');
  const NT = 4096, A0 = -1.75, A1 = 1.75, bt = new Float32Array(NT + 1), wt = new Float32Array(NT + 1);
  for (let i = 0; i <= NT; i++) {
    const ang = L.lerp(A0, A1, i / NT), s = ang * 720;
    // a ridge line: broad shoulders, with pointed teeth of very unequal height standing on them
    const big = nz.fbm(s / 320, 3.1, 2), amp = L.clamp(0.55 + 0.95 * nz.n2(s / 205, 40.2), 0.06, 1.35);
    const tooth = Math.pow(1 - Math.abs(nz.n2(s / 76, 9.7)), 2.4);
    bt[i] = 1 + 0.07 * big + 0.082 * amp * (tooth - 0.3) + 0.012 * nz.n2(s / 17, 5.5);
    wt[i] = nz.n2(s / 230, 1.7);
  }
  const tab = (T, ang) => { const f = L.clamp((ang - A0) / (A1 - A0)) * NT, i = Math.min(NT - 1, f | 0); return T[i] + (T[i + 1] - T[i]) * (f - i); };
  return { bAt: (ang) => tab(bt, ang), wAt: (ang) => tab(wt, ang), radAt: (ang) => 1 / Math.hypot(Math.sin(ang) / RX, Math.cos(ang) / RY) };
}

function buildMound(shape) {
  const X0 = 110, Y0 = 770, RW = 1770 - X0, RH = H + PAD - Y0;
  const nz = L.makeNoise('s33m');
  const lutF = L.makeRamp([[0, '#050303'], [0.14, '#33070a'], [0.3, '#7a120c'], [0.48, '#bb1e11'], [0.66, '#e2301c'], [0.84, '#f6441f'], [0.94, '#ff7a3a'], [1, '#ffd9c2']]);
  const MCOL = []; for (let i = 0; i < 128; i++) MCOL.push(L.css(lutF(i / 127)));
  const mcol = (v) => MCOL[Math.max(0, Math.min(127, (v * 127) | 0))];
  // 1) the form: how much light each spot of the crust gets. Two jagged ridges, one behind the other:
  //    lit wall at the outline → shadow trough → second ridge → shadow again
  const img = new ImageData(RW, RH), d = img.data, V = new Float32Array(RW * RH), Wl = new Float32Array(RW * RH);
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const fIn = new Float32Array(cw * ch), fTr = new Float32Array(cw * ch), fMo = new Float32Array(cw * ch);
  const bil = (F, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = F[k], a1 = F[k + 1], b0 = F[k + cw], b1 = F[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };
  const light = (ang) => 0.82 + 0.18 * Math.cos(ang + 0.45);                // raking light from the upper left
  // how far inside the outline the second ridge runs (px): it meanders on its own and has its own teeth
  const inset = (x, y) => 126 + 46 * nz.n2(x / 240 + 77.7, y / 240) - 34 * Math.pow(1 - Math.abs(nz.n2(x / 86 + 61.3, y / 86 - 20)), 2.2) + 6 * nz.n2(x / 19, y / 19 + 15.5);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    if (Math.hypot((x - MX) / RX, (y - MY) / RY) > 1.24) continue;
    fIn[k] = inset(x, y); fTr[k] = 0.7 + 0.3 * nz.n2(x / 95, y / 95); fMo[k] = 0.9 + 0.16 * nz.fbm(x / 130 + 9, y / 130, 2);
  }
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, dy = y - MY;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, dx = x - MX;
      const rho = Math.hypot(dx / RX, dy / RY);
      if (rho > 1.2) continue;
      const ang = Math.atan2(dx, -dy), rad = Math.hypot(dx, dy) / rho;
      const e = (shape.bAt(ang) - rho) * rad;
      if (e <= -1) continue;
      const eN = e * (1 + 0.3 * shape.wAt(ang)), e2 = e - bil(fIn, i, j);
      const wall = Math.exp(-Math.pow((eN - 12) / 21, 2)), wall2 = Math.exp(-Math.pow((e2 - 9) / 17, 2));
      const trough = Math.exp(-Math.pow((eN - 78) / 40, 2)) * bil(fTr, i, j) * (1 - wall2);
      const trough2 = Math.exp(-Math.pow((e2 - 66) / 38, 2));
      const E = (0.6 + 0.42 * wall - 0.36 * trough + 0.3 * wall2 - 0.26 * trough2) * light(ang) * bil(fMo, i, j);
      const k = j * RW + i, v = E * 0.5 * (0.75 + 0.5 * hsh(i, j));         // what shows between the grains: deep red shadow
      const c = lutF(v), o = k * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = L.clamp(e + 1) * 255;
      V[k] = E; Wl[k] = Math.max(wall, wall2 * 0.8);
    }
  }
  tick('mform');
  const cnv = L.makeCanvas(RW, RH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);
  g.translate(-X0, -Y0);
  // 2) the grains themselves, heaped at random: each a shard with a lit and a shaded side
  const r = L.rng('s33grain');
  const heap = (x, y, E, wall, rad) => {
    const u = E * (0.36 + 0.95 * Math.pow(r(), 1.5));
    g.fillStyle = mcol(u * 0.8); shard(g, r, x, y, rad, r.int(4, 6), r.range(0.6, 1)); g.fill();
    const hot = r(), hc = hot < 0.008 + 0.025 * wall ? '#ffd9c2' : hot < 0.03 + 0.09 * wall ? '#ff7a3a' : mcol(Math.min(0.9, u * 1.25 + 0.08));
    g.fillStyle = hc; g.beginPath(); g.ellipse(x - rad * 0.2, y - rad * 0.26, rad * 0.5, rad * 0.34, r() * Math.PI, 0, L.TAU); g.fill();
  };
  // a cuprite crystal big enough to show its faces: lit face, shaded face, one flashing facet
  const crystal = (x, y, E, rad) => {
    const o = r() * L.TAU, nv = r.int(5, 7), pts = [];
    for (let k = 0; k < nv; k++) { const an = o + ((k + r.range(-0.25, 0.25)) / nv) * L.TAU, rd = rad * r.range(0.72, 1.08); pts.push([x + Math.cos(an) * rd, y + Math.sin(an) * rd * 0.86]); }
    const path = (idx) => { g.beginPath(); idx.forEach((q, n) => (n ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); };
    g.fillStyle = L.linear(g, x - rad, y - rad, x + rad, y + rad, [[0, mcol(Math.min(0.86, E * 1.05))], [0.5, mcol(E * 0.62)], [1, mcol(E * 0.26)]]);
    path(pts); g.fill();
    // the facet that faces the light: the fan of the two or three corners nearest the upper left, closed on the apex
    const ap = [x + r.range(-0.18, 0.18) * rad, y + r.range(-0.18, 0.18) * rad];
    const srt = pts.map((q, k) => [q[0] + q[1], k]).sort((a, b) => a[0] - b[0]), k0 = srt[0][1];
    const hot = r();
    g.fillStyle = hot < 0.3 ? '#ff7a3a' : mcol(Math.min(0.9, E * 1.3 + 0.1));
    path([pts[k0], pts[(k0 + 1) % nv], ap]); g.fill();
    g.fillStyle = mcol(Math.min(0.84, E * 1.1 + 0.05));
    path([pts[(k0 + nv - 1) % nv], pts[k0], ap]); g.fill();
    if (hot < 0.07) { g.fillStyle = '#ffd9c2'; g.beginPath(); g.ellipse((pts[k0][0] + ap[0]) / 2, (pts[k0][1] + ap[1]) / 2, rad * 0.2, rad * 0.11, -0.7, 0, L.TAU); g.fill(); }
  };
  for (let n = 0; n < 105000; n++) {
    const i = r.int(0, RW - 1), j = r.int(0, RH - 1), k = j * RW + i, E = V[k];
    if (E <= 0) continue;
    heap(X0 + i + r(), Y0 + j + r(), E, Wl[k], 1.25 + 2.5 * Math.pow(r(), 2.6));
  }
  tick('heap');
  // bigger grains crowd the two lit walls and stick out of the outline
  for (let n = 0; n < 7600; n++) {
    const ang = r.range(-1.5, 1.5), inner = r.chance(0.36), rb = shape.radAt(ang) * shape.bAt(ang), sn = Math.sin(ang), cs = Math.cos(ang);
    const e = r.range(-5, 22) + (inner ? inset(MX + sn * (rb - 120), MY - cs * (rb - 120)) : 0), rr = rb - e;
    const x = MX + sn * rr, y = MY - cs * rr;
    heap(x, y, (inner ? 0.74 : 0.88) * (1 + 0.16 * r()) * light(ang), 1, 2 + 4.4 * Math.pow(r(), 2.2));
  }
  for (let n = 0; n < 2600; n++) {
    const i = r.int(0, RW - 1), j = r.int(0, RH - 1), k = j * RW + i, E = V[k];
    if (E <= 0.3 || r() > 0.12 + 0.88 * Wl[k]) continue;
    crystal(X0 + i, Y0 + j, Math.min(1, E * (0.85 + 0.3 * r())), 4 + 6.5 * Math.pow(r(), 2.2));
  }
  tick('mcryst');
  g.setTransform(1, 0, 0, 1, 0, 0);
  return { cnv, X0, Y0, RW, RH, V };
}

// ───────────────────────── the coin: everything below the arc ─────────────────────────
function buildCoin(env) {
  const a = env.arc, R = a.R;
  const AW = W + PAD * 2, CY0 = Math.floor(a.crestY) - 44, CH = H + PAD - CY0;
  const mk = () => { const c = L.makeCanvas(AW, CH), g = c.getContext('2d'); g.translate(PAD, -CY0); return [c, g]; };
  const all = (g) => g.fillRect(-PAD, CY0, AW, CH);
  const [cnv, g] = mk();
  const sp = a.span(PAD + 60);
  const r = L.rng('s33coin');
  const shape = moundShape(), mound = buildMound(shape);
  const inMound = (x, y, grow) => { const dx = x - MX, dy = y - MY, rho = Math.hypot(dx / RX, dy / RY); return rho < shape.bAt(Math.atan2(dx, -dy)) + grow; };

  // 1) body: near-black patina
  a.fillBelow(g, '#050303', 0);

  // 2) a breath of dark red on the face: worn metal catching the raking light just inside the rim
  {
    const [t, tg] = mk();
    tg.fillStyle = L.radial(tg, a.cx, a.cy, R - RIMW - 300, R - RIMW - 8, [[0, 'rgba(122,18,12,0)'], [0.72, 'rgba(122,18,12,0.55)'], [0.93, 'rgba(140,22,14,0.8)'], [1, 'rgba(122,18,12,0)']]);
    a.pathBelow(tg, -RIMW - 8); tg.fill();
    tg.globalCompositeOperation = 'destination-in';
    tg.fillStyle = L.linear(tg, 0, 0, W, 0, [[0, 'rgba(0,0,0,0.45)'], [0.3, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0.22)']]); all(tg);
    // … broken into the pin-points of a cast surface: only the tops of its grain catch the light
    const sp2 = L.makeCanvas(AW, CH), sgx = sp2.getContext('2d'), sim = sgx.createImageData(AW, CH), sd = sim.data;
    for (let j = 0; j < CH; j++) for (let i = 0; i < AW; i++) {
      const h = hsh((i + (j >> 1)) >> 1, j >> 1) * 0.6 + hsh(i + 517, j - 263) * 0.4;
      sd[(j * AW + i) * 4 + 3] = 255 * Math.pow(h, 3.2);
    }
    sgx.putImageData(sim, 0, 0);
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.drawImage(sp2, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.6; g.drawImage(t, 0, 0); g.restore();
  }

  tick('sheen');
  // 3) the rim band: its rounded shoulder under the bright edge, fine rust dust lying on its flat top
  g.save(); a.clipBand(g, 0, -RIMW);
  g.fillStyle = L.radial(g, a.cx, a.cy, R - RIMW, R, [[0, 'rgba(122,18,12,0.10)'], [0.5, 'rgba(122,18,12,0.05)'], [0.72, 'rgba(150,22,14,0.12)'], [1, 'rgba(226,48,28,0.5)']]);
  all(g);
  for (let n = 0; n < 5200; n++) {
    const p = a.pt(r.range(-sp, sp), -r.range(3, RIMW - 3)), u = Math.pow(r(), 2.2), rad = 0.5 + 1.1 * Math.pow(r(), 3);
    g.globalAlpha = 0.3 + 0.6 * r(); g.fillStyle = pcol(0.12 + 0.55 * u);
    g.beginPath(); g.ellipse(p.x, p.y, rad * 1.2, rad * 0.8, r() * Math.PI, 0, L.TAU); g.fill();
  }
  g.restore(); g.globalAlpha = 1;
  // the rim stands proud of the face: a hair of pure shadow under its inner edge
  g.save(); a.clipBand(g, -RIMW, -RIMW - 16);
  g.fillStyle = L.radial(g, a.cx, a.cy, R - RIMW - 16, R - RIMW, [[0, 'rgba(3,1,1,0)'], [1, 'rgba(3,1,1,0.95)']]); all(g);
  g.restore();

  // 4) loose grains on the face: sparse everywhere, thick at the foot of the crust
  for (let n = 0; n < 420; n++) {
    const x = r.range(-PAD, W + PAD), y = r.range(a.crestY, H + PAD);
    if (a.drAt(x, y) > -RIMW - 14 || inMound(x, y, 0.03)) continue;
    const u = Math.pow(r(), 1.6), rad = 0.6 + 1.6 * Math.pow(r(), 2.4);
    g.globalAlpha = 0.5 + 0.5 * r(); g.fillStyle = pcol(0.25 + 0.6 * u);
    g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.6, 1), r() * Math.PI, 0, L.TAU); g.fill();
  }
  // bloom of the crust on the black face (drawn first so the crystals stay crisp on top)
  g.save(); g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.3; g.drawImage(L.blurred(mound.cnv, 30), mound.X0, mound.Y0);
  g.globalAlpha = 0.22; g.drawImage(L.blurred(mound.cnv, 7), mound.X0, mound.Y0);
  g.restore();
  g.drawImage(mound.cnv, mound.X0, mound.Y0);
  for (let n = 0; n < 5200; n++) {
    const side = r.chance(0.42);
    const ang = side ? r.sign() * r.range(0.8, 1.45) : r.range(-1.45, 1.45);
    const eo = -Math.log(1 - r() * 0.999) * (r.chance(0.68) ? 11 : side ? 85 : 46) - 6;
    const rr = shape.radAt(ang) * shape.bAt(ang) + eo, x = MX + Math.sin(ang) * rr, y = MY - Math.cos(ang) * rr;
    if (a.drAt(x, y) > -RIMW - 14) continue;
    const near = Math.exp(-Math.max(0, eo) / 40), u = Math.pow(r(), 1.3) * (0.55 + 0.45 * near), big = r.chance(0.035 * near + 0.006);
    g.globalAlpha = 0.6 + 0.4 * r();
    if (big) {
      const rad = r.range(3, 6.5);
      g.fillStyle = pcol(0.3 + 0.3 * u); shard(g, r, x, y, rad, r.int(4, 6), r.range(0.6, 1)); g.fill();
      g.fillStyle = pcol(0.7 + 0.3 * u); g.beginPath(); g.ellipse(x - rad * 0.25, y - rad * 0.28, rad * 0.48, rad * 0.32, r() * Math.PI, 0, L.TAU); g.fill();
    } else {
      const rad = 0.6 + 1.9 * Math.pow(r(), 2.2);
      g.fillStyle = pcol(0.3 + 0.7 * u);
      g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.55, 1), r() * Math.PI, 0, L.TAU); g.fill();
    }
  }
  g.globalAlpha = 1;

  tick('scatter');
  // 5) the two edges of the rim, drawn on their own canvas so they can bloom
  const [rc, rg] = mk();
  const nl = L.makeNoise('s33line');
  const LINE = L.makeRamp([[0, '#7a120c'], [0.45, '#c42412'], [0.7, '#e2301c'], [0.9, '#ff5a2a'], [1, '#ff8a55']]);
  rg.lineCap = 'round';
  const ds = 3 / R;
  for (let th = -sp; th < sp; th += ds) {
    const s = th * R;
    const n1 = nl.n2(s / 46, 0.3), n2 = nl.n2(s / 9, 4.1), n3 = nl.fbm(s / 240, 9.3, 2);
    const key = 0.66 + 0.34 * Math.exp(-Math.pow((th + 0.09) / 0.24, 2));     // the light rakes in from the upper left
    // outer edge: its top side sits exactly on the arc
    const w = 2.8 + 0.9 * n1 + 0.7 * n2, b = L.clamp((0.74 + 0.3 * n3 + 0.14 * n1 + 0.1 * n2) * key);
    let p0 = a.pt(th, -w / 2), p1 = a.pt(th + ds, -w / 2);
    rg.strokeStyle = L.css(LINE(b)); rg.lineWidth = w; rg.globalAlpha = 1;
    rg.beginPath(); rg.moveTo(p0.x, p0.y); rg.lineTo(p1.x, p1.y); rg.stroke();
    // inner edge: thinner, darker, broken here and there
    const m1 = nl.n2(s / 60, 20.3), m2 = nl.n2(s / 11, 33.1), wi = 1.5 + 0.5 * m1 + 0.4 * m2;
    p0 = a.pt(th, -RIMW + 0.3 * m2); p1 = a.pt(th + ds, -RIMW + 0.3 * m2);
    rg.strokeStyle = L.css(LINE(L.clamp(0.2 + 0.22 * m1 + 0.1 * key))); rg.lineWidth = wi; rg.globalAlpha = L.clamp(0.62 + 0.5 * m1 + 0.2 * m2) * key;
    rg.beginPath(); rg.moveTo(p0.x, p0.y); rg.lineTo(p1.x, p1.y); rg.stroke();
  }
  rg.globalAlpha = 1;
  // burrs and beads of rust riding the outer edge
  for (let n = 0; n < 520; n++) {
    const th = r.range(-sp, sp), dr = r.range(-3.2, 0.6), rad = 0.9 + 2.2 * Math.pow(r(), 3), u = r();
    const p = a.pt(th, dr - rad * 0.4);
    rg.fillStyle = u > 0.93 ? '#ffd9c2' : u > 0.7 ? '#ff7a3a' : pcol(0.6 + 0.4 * u); rg.globalAlpha = 0.75 + 0.25 * r();
    rg.beginPath(); rg.ellipse(p.x, p.y, rad * 1.3, rad * 0.8, th + r.range(-0.3, 0.3), 0, L.TAU); rg.fill();
  }
  rg.globalAlpha = 1;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.32; g.drawImage(L.blurred(rc, 14), 0, 0);
  g.globalAlpha = 0.6; g.drawImage(L.blurred(rc, 3.5), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.drawImage(rc, 0, 0);
  g.restore();

  tick('rim');
  // 6) depth of field: focus sits on the crest, the two ends of the rim go a touch soft
  {
    const soft = L.blurred(cnv, 2.4), sg = soft.getContext('2d');
    const m = (t) => L.linear(t, PAD, 0, PAD + W, 0, [[0, 'rgba(0,0,0,0.9)'], [0.24, 'rgba(0,0,0,0)'], [0.76, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.9)']]);
    sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = m(sg); sg.fillRect(0, 0, AW, CH);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = m(g); g.fillRect(0, 0, AW, CH);
    g.globalCompositeOperation = 'lighter'; g.drawImage(soft, 0, 0);
    g.restore();
  }

  tick('cdof');
  // glints: along the outer edge and on the crystals of the crust
  const sparks = [];
  for (let n = 0; n < 150; n++) {
    const th = r.range(-sp, sp), p = a.pt(th, -1.2), key = 0.6 + 0.4 * Math.exp(-Math.pow((th + 0.09) / 0.24, 2)), roll = r();
    const k = roll < 0.06 ? 3 : roll < 0.4 ? 2 : 1;
    sparks.push({ x: p.x, y: p.y, s: k === 3 ? r.range(12, 20) : r.range(6, 12), k, a: r.range(0.5, 1) * key, ph: r(), per: r.range(2.2, 6), fl: r.range(0, 0.3) });
  }
  for (let n = 0; n < 12000 && sparks.length < 900; n++) {
    const i = r.int(0, mound.RW - 1), j = r.int(0, mound.RH - 1), v = mound.V[j * mound.RW + i];
    if (v < 0.5 || r() > v * v) continue;
    const roll = r(), k = roll < 0.04 ? 3 : roll < 0.3 ? 2 : 1;
    sparks.push({ x: mound.X0 + i, y: mound.Y0 + j, s: k === 3 ? r.range(11, 19) : r.range(5, 11), k, a: r.range(0.45, 1), ph: r(), per: r.range(2.2, 6), fl: r.range(0, 0.3) });
  }
  return { cnv, CY0, sparks };
}

export default {
  name: '红斑锈微粒',
  tone: 'light',
  init(env) {
    const t0 = performance.now(); const dust = buildDust(env); const t1 = performance.now(); const coin = buildCoin(env); console.warn('s33 timing dust', (t1 - t0) | 0, 'coin', (performance.now() - t1) | 0, TM.join(' '));
    const spr = [
      sprite([[0, 'rgba(255,96,56,1)'], [0.4, 'rgba(232,52,28,0.95)'], [0.72, 'rgba(226,48,28,0.3)'], [1, 'rgba(226,48,28,0)']]),
      sprite([[0, 'rgba(255,140,84,1)'], [0.36, 'rgba(255,92,44,0.95)'], [0.7, 'rgba(226,48,28,0.3)'], [1, 'rgba(226,48,28,0)']]),
      sprite([[0, 'rgba(255,226,206,1)'], [0.28, 'rgba(255,140,80,1)'], [0.62, 'rgba(255,90,42,0.35)'], [1, 'rgba(226,48,28,0)']]),
      sprite([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,217,194,1)'], [0.42, 'rgba(255,122,58,0.7)'], [0.7, 'rgba(226,48,28,0.2)'], [1, 'rgba(226,48,28,0)']]),
    ];
    S = { dust, coin, spr };
  },
  draw(ctx, env, p) {
    const t = p * (env.frames - 1);                       // frame clock: the glints are tuned in frames
    const rot = L.lerp(-0.004, 0.004, p), zoom = L.lerp(1, 1.014, p);
    const bg = { rot: rot * 0.55, zoom };                 // the dusty ground lies below the coin → it slides less
    ctx.fillStyle = '#050303'; ctx.fillRect(0, 0, W, H);

    // the powder shimmers: three interleaved layers trade brightness
    for (let k = 0; k < 3; k++) {
      const al = 0.7 + 0.3 * Math.cos(L.TAU * (t / 4.4 + k / 3));
      blitAt(ctx, env, S.dust.cv[k], -PAD, -PAD, { ...bg, alpha: al, blend: 'lighter' });
    }
    const flare = (list) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const q of list) {
        const v = 0.5 + 0.5 * Math.cos(L.TAU * (t / q.per + q.ph)), al = q.a * (q.fl + (1 - q.fl) * v * v);
        if (al < 0.04) continue;
        ctx.globalAlpha = al;
        ctx.drawImage(S.spr[q.k], q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
      }
    };
    L.cam(ctx, env, bg, () => flare(S.dust.sparks));

    // the coin slides along its own edge
    blitAt(ctx, env, S.coin.cnv, -PAD, S.coin.CY0, { rot });
    L.cam(ctx, env, { rot }, () => flare(S.coin.sparks));

    L.vignette(ctx, { strength: 0.28 });
  },
};
