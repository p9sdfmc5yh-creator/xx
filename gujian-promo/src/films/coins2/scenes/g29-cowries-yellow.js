// g29 — 贝币: a few dozen small money cowries (货贝), aperture-up, laid on bright yellow paper so that together they spell the coin glyph
// (the reference's clover on yellow). An outer row lies along the circle (outer flanks on the rim), a pinwheel of four straight rows lines
// the square hole (inner flanks on its sides), and a few bigger shells fill the flesh between. 3-frame flash: one still layer.
// The shell painter (per-pixel shading from a height field, light from the page's top-left whatever the rotation) is the one from p10.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const LIGHT = (() => { const v = [-0.52, -0.62, 0.59], n = Math.hypot(...v); return v.map((c) => c / n); })();   // toward the light (top-left, raised)

/** one cowrie. o: len (px), kind 'ventral' | 'ground' | 'hole' | 'dorsal', rot (page rotation, for the light), seed, ring (golden ring) */
function makeShell(o) {
  const r = L.rng('cw' + o.seed), nz = L.makeNoise('cw' + o.seed);
  const A = o.len / 2, B = A * r.range(0.66, 0.74), pad = 5;
  const w = Math.ceil(A * 2 + pad * 2), h = Math.ceil(B * 2 * 1.12 + pad * 2);
  const cv = L.makeCanvas(w, h), g = cv.getContext('2d');
  const ox = w / 2, oy = h / 2;
  // outline: ovate, widest behind the middle, with the money cowrie's knobbly "shoulders" (a slightly rhomboid shield)
  const shift = r.range(0.12, 0.2), bT = r.range(0.07, 0.12), bB = r.range(0.06, 0.11), bpT = r.range(-0.46, -0.34), bpB = r.range(-0.44, -0.3);
  const b2T = r.range(0.01, 0.04), b2B = r.range(0.01, 0.04);
  const edge = (u, top) => {
    const uu = cl(Math.abs(u)); const us = u + shift * (1 - uu * uu);
    const p = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(us) > 1 ? 1 : Math.abs(us), 2.25)), 0.54);
    const bump = top ? bT * Math.exp(-(((u - bpT) / 0.2) ** 2)) + b2T * Math.exp(-(((u - 0.3) / 0.16) ** 2))
      : bB * Math.exp(-(((u - bpB) / 0.21) ** 2)) + b2B * Math.exp(-(((u - 0.36) / 0.15) ** 2));
    return B * (p * 0.93 + bump * Math.sqrt(1 - uu * uu));
  };
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const lx = c * LIGHT[0] + s * LIGHT[1], ly = -s * LIGHT[0] + c * LIGHT[1], lz = LIGHT[2];
  const hx = lx, hy = ly, hz = lz + 1, hn = Math.hypot(hx, hy, hz);          // half vector for the glaze highlight
  const l2 = Math.hypot(lx, ly), l2x = lx / l2, l2y = ly / l2;
  const ventral = o.kind === 'ventral', ground = o.kind === 'ground', holed = o.kind === 'hole';
  const Hmax = B * (ventral ? 0.46 : 0.8);
  // aperture (ventral) / the same slit seen from inside (ground)
  const ph = r.range(-0.5, 0.5), nT = r.int(11, 14), slitOff = r.range(-0.05, 0.02);
  const yc = (u) => B * (0.055 * Math.sin(u * 1.7 + ph) + slitOff);
  const gwOf = (u) => B * (0.04 + 0.034 * (u + 1) * 0.5) * ss(0.9, 0.6, Math.abs(u));
  const mc = r.range(0.4, 0.5), dRim = 0.115, cutOff = r.range(-0.08, 0.04), cutK = r.range(1.2, 1.45);     // ground opening
  const hu = r.range(0.34, 0.5) * (r.chance(0.5) ? 1 : -1), hv = r.range(-0.08, 0.08), hr = B * r.range(0.2, 0.26);   // small hole
  const mring = r.range(0.47, 0.55);
  const chalk = r.range(0.25, 0.75), soilAmt = r.range(0.25, 0.7);
  const tint = r.range(0, 1); const tw = r.range(0, 1), tb = r.range(0.93, 1); const SHT = [tb, tb * (1 - 0.035 * tw), tb * (1 - 0.08 * tw)];                                                // ivory ↔ straw
  const striA = r.range(0, Math.PI), sc = Math.cos(striA), sn = Math.sin(striA);

  const N = w * h, Hf = new Float32Array(N), Mf = new Float32Array(N);
  const field = (x, y) => {                       // → height; side data via closure vars
    const u = x / A, uc = u < -1 ? -1 : u > 1 ? 1 : u;
    const e = Math.max(1e-3, edge(uc, y < 0)); let sv = y / e; if (sv > 1) sv = 1; else if (sv < -1) sv = -1;
    const m = (1 - sv * sv) * Math.pow(Math.max(0, 1 - Math.abs(uc) ** 3), 0.8);
    let H = Hmax * Math.pow(m, ventral ? 0.4 : 0.55);
    if (ventral) {
      const tp0 = ss(0.9, 0.6, Math.abs(uc)), tp = tp0 * tp0, tc = Math.cos(uc * nT * Math.PI), tph = (tc < 0 ? -1 : 1) * Math.pow(Math.abs(tc), 0.7);
      const gw = Math.max(0.5, gwOf(uc) * (1 + 0.22 * tph)), dv = y - yc(uc), adv = Math.abs(dv);
      H -= Hmax * 0.62 * Math.exp(-((dv / gw) ** 2)) * tp;
      H += Hmax * 0.13 * Math.exp(-(((adv - 2.4 * gw) / (2.6 * gw)) ** 2)) * tp;
      const tz = Math.exp(-Math.max(0, adv - gw) / (B * 0.1)) * ss(0.3 * gw, gw, adv) * tp;
      H += Hmax * 0.06 * tph * tz;
    }
    fm = m; return H;
  };
  let fm = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; Hf[k] = field(i + 0.5 - ox, j + 0.5 - oy); Mf[k] = fm; }

  const img = g.createImageData(w, h), d = img.data;
  const ivory = [246, 238, 218], straw = [236, 212, 160], band = [176, 180, 168], soil = [150, 112, 72], gold = [212, 158, 62];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, x = i + 0.5 - ox, y = j + 0.5 - oy, u = cl((x / A + 1) / 2) * 2 - 1, m = Mf[k];
    const i0 = i > 0 ? k - 1 : k, i1 = i < w - 1 ? k + 1 : k, j0 = j > 0 ? k - w : k, j1 = j < h - 1 ? k + w : k;
    let gx = (Hf[i1] - Hf[i0]) / (i1 - i0 || 1), gy = (Hf[j1] - Hf[j0]) / ((j1 - j0) / w || 1);
    const gl = Math.hypot(gx, gy); if (gl > 3.2) { gx *= 3.2 / gl; gy *= 3.2 / gl; }
    // fine relief in the glaze: very shallow orange-peel + worn patches (mid scale), so the highlight breaks up like old enamel
    const n1 = nz.fbm(x * 0.012, y * 0.012, 4), n2 = nz.fbm(x * 0.045 + 31, y * 0.045 - 17, 3), n3 = nz.n2(x * 0.33, y * 0.33);
    gx += n2 * 0.011 + n3 * 0.008; gy += nz.fbm(x * 0.045 - 9, y * 0.045 + 53, 3) * 0.011;
    let nx = -gx, ny = -gy, nzv = 1; const nl = Math.hypot(nx, ny, nzv); nx /= nl; ny /= nl; nzv /= nl;
    let ndl = nx * lx + ny * ly + nzv * lz;
    let col, gloss = 1, occ = 1;
    // ── albedo ──
    const wornP = ss(-0.15, 0.75, n1 * 0.9 + (chalk - 0.5) * 0.7 + n2 * 0.25);            // chalky, glaze-lost patches
    const sl = ss(-0.05, 0.9, nz.fbm(x * 0.02 + 70, y * 0.02 + 5, 4) + (soilAmt - 0.55) + (1 - m) * 0.35);   // soil film, heavier at the margins
    if (ventral) {
      col = [L.lerp(ivory[0], 240, tint * 0.5), L.lerp(ivory[1], 226, tint * 0.5), L.lerp(ivory[2], 196, tint * 0.5)];
      const tp = ss(0.9, 0.6, Math.abs(u)), tph = Math.cos(u * nT * Math.PI);
      const gw = Math.max(0.5, gwOf(u) * (1 + 0.22 * tph)), dv = y - yc(u), adv = Math.abs(dv);
      const inS = Math.exp(-((dv / (gw * 0.95)) ** 2)) * tp;
      const tz = Math.exp(-Math.max(0, adv - gw) / (B * 0.1)) * ss(0.3 * gw, gw, adv) * tp;
      const grime = cl(tz * Math.max(0, -tph) * 0.75);                                    // earth packed between the teeth
      for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], soil[q] * 0.82, grime);
      for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], [52, 34, 22][q], inS * 0.94);
      occ = 1 - 0.72 * inS; gloss = (1 - inS) * (1 - grime);
    } else {
      const dz = ss(0.28, 0.75, m);                                                       // the coloured dorsum inside the pale callused margin
      col = [0, 1, 2].map((q) => L.lerp(ivory[q], straw[q], dz * (0.35 + 0.5 * tint)));
      const bd = (Math.exp(-(((u + 0.3) / 0.11) ** 2)) + 0.8 * Math.exp(-(((u - 0.08) / 0.09) ** 2)) + 0.9 * Math.exp(-(((u - 0.42) / 0.1) ** 2))) * dz * 0.3;
      for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], band[q], cl(bd));
      if (o.ring) { const rg = Math.exp(-(((m - mring) / 0.04) ** 2)) * 0.6; for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], gold[q], rg); }
    }
    for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], [238, 232, 216][q], wornP * 0.38);
    for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], soil[q], sl * 0.22) * SHT[q];
    gloss *= (1 - wornP * 0.8) * (1 - sl * 0.6);

    let cav = 0, wR = 0, wC = 0, rimCol = null, cavCol = null;
    if (ground) {
      const uo = u - cutOff, e = Math.max(1e-3, edge(u, y < 0)), sv = cl(Math.abs(y / e));
      const mcut = (1 - sv * sv * 1.05) * (1 - uo * uo * cutK) + nz.n2(x * 0.02, y * 0.02) * 0.02;
      const aa = 1.7 / B;
      wR = ss(mc - aa, mc + aa, mcut);
      if (wR > 0) {
        wC = ss(mc + dRim - aa, mc + dRim + aa, mcut);
        // the ground face: a flat ring of shell wall, chalk white with rubbing lines, a darker lip at its inner edge
        const st = Math.sin((x * sc + y * sn) * 1.7) * 0.5 + Math.sin((x * sc + y * sn) * 0.61 + 2) * 0.5;
        const v = 243 + st * 6 + n3 * 4, eIn = 1 - 0.2 * ss(mc + dRim * 0.5, mc + dRim, mcut), eOut = 1 - 0.1 * ss(mc + dRim * 0.3, mc, mcut);
        rimCol = [v * eIn * eOut, (v - 6) * eIn * eOut, (v - 24) * eIn * eOut];
        if (wC > 0) {                              // the hollow: inside of the base, the toothed slit seen from within
          const kIn = cl((mcut - mc - dRim) / (1 - mc - dRim));
          const ee = (x * l2x + y * l2y) / (B * 0.62);                                     // + = toward the light → in the wall shadow
          const lit = 0.36 + 0.5 * ss(0.55, -0.7, ee);
          const tp = ss(0.8, 0.5, Math.abs(u)), tph = Math.cos(u * nT * Math.PI);
          const gw = Math.max(0.6, gwOf(u) * 0.8 * (1 + 0.2 * tph)), dv = y - yc(u), adv = Math.abs(dv);
          const inS = Math.exp(-((dv / gw) ** 2)) * tp;
          const fold = Math.exp(-(((adv - 2.6 * gw) / (2.0 * gw)) ** 2)) * tp;             // the in-rolled lips
          const base = [212, 184, 140], dirt = [140, 104, 66];
          const dn = ss(-0.5, 0.8, nz.fbm(x * 0.022 + 9, y * 0.022 - 40, 4));
          cavCol = [0, 1, 2].map((q) => L.lerp(base[q], dirt[q], dn * 0.55) * (lit + fold * 0.22 * (1 + 0.4 * tph)));
          for (let q = 0; q < 3; q++) cavCol[q] = L.lerp(cavCol[q], [34, 22, 14][q], inS * 0.92);
          const rimSh = ss(0.2, 0, kIn) * (0.2 + 0.5 * ss(-0.4, 0.6, ee));                // shadow the rim throws into the hollow
          for (let q = 0; q < 3; q++) cavCol[q] *= 1 - rimSh;
        }
      }
    }
    if (holed) {
      const dx = x - hu * A, dy = y - hv * B, ang = Math.atan2(dy, dx);
      const rr = hr * (1 + 0.09 * nz.n2(Math.cos(ang) * 0.9 + 4, Math.sin(ang) * 0.9) + 0.025 * nz.n2(Math.cos(ang) * 2.6, Math.sin(ang) * 2.6 + 8));
      const dd = Math.hypot(dx, dy) - rr;
      if (dd < 2.2) {
        const ee = (dx * l2x + dy * l2y) / rr, wall = ss(-B * 0.085, 0, dd);              // wall thickness seen on the far (lit) side
        const litWall = wall * ss(0.1, -0.8, ee);
        const dark = [40, 27, 17], wl = [226, 212, 184];
        const inside = [0, 1, 2].map((q) => L.lerp(dark[q] * (1 + 0.5 * ss(0.4, -0.9, ee)), wl[q], litWall * 0.85));
        const a = ss(2.2, -0.6, dd);
        for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], inside[q], a);
        cav = Math.max(cav, a); gloss *= 1 - a;
        // chipped, chalky lip round the hole
      } else if (dd < B * 0.07) { const cpk = ss(B * 0.07, 2, dd) * 0.5; for (let q = 0; q < 3; q++) col[q] = L.lerp(col[q], [240, 234, 220][q], cpk); gloss *= 1 - cpk; }
    }

    // ── light: warm ambient (paper bounce) + cool-neutral key, so shadows stay ivory-brown, never grey ──
    const dif = Math.pow(cl((ndl + 0.5) / 1.5), 0.9);
    const ndh = (nx * hx + ny * hy + nzv * hz) / hn;
    const sp = (Math.pow(Math.max(0, ndh), 90) * 1.0 + Math.pow(Math.max(0, ndh), 14) * 0.07) * gloss;
    const bounce = cl(-(nx * lx + ny * ly)) * (1 - nzv) * 0.2;
    const av = 0.86 + 0.14 * nzv;
    let out = [col[0] * (0.42 * av + dif * 0.747) * occ + 255 * sp + 110 * bounce, col[1] * (0.385 * av + dif * 0.787) * occ + 250 * sp + 88 * bounce, col[2] * (0.34 * av + dif * 0.84) * occ + 236 * sp + 60 * bounce];
    const core = ss(0.2, 0, m) * cl(0.5 - ndl) * 0.3; for (let q = 0; q < 3; q++) out[q] *= 1 - core;
    if (cav > 0) for (let q = 0; q < 3; q++) out[q] = L.lerp(out[q], col[q], cav);
    if (wR > 0) {
      const kf = 0.99;
      for (let q = 0; q < 3; q++) out[q] = L.lerp(out[q], rimCol[q] * kf, wR);
      if (wC > 0) for (let q = 0; q < 3; q++) out[q] = L.lerp(out[q], cavCol[q], wC);
    }
    for (let q = 0; q < 3; q++) if (out[q] > 222) out[q] = 222 + (out[q] - 222) * 0.45;        // soft shoulder: lit flanks roll off instead of clipping
    const p4 = k * 4; d[p4] = out[0] > 255 ? 255 : out[0]; d[p4 + 1] = out[1] > 255 ? 255 : out[1]; d[p4 + 2] = out[2] > 255 ? 255 : out[2]; d[p4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);

  // outline path (antialiased mask), in sprite coordinates
  const outline = (q) => {
    q.beginPath(); const n = 90;
    for (let i = 0; i <= n; i++) { const u = -1 + (2 * i) / n; const y = -edge(u, true); i ? q.lineTo(ox + u * A, oy + y) : q.moveTo(ox + u * A, oy + y); }
    for (let i = n; i >= 0; i--) { const u = -1 + (2 * i) / n; q.lineTo(ox + u * A, oy + edge(u, false)); }
    q.closePath();
  };
  // ── drawn micro-detail: hairline scratches, pits with a lit rim, soil specks, one or two craze lines ──
  g.save(); outline(g); g.clip();
  const inBody = (x, y) => { const u = x / A; if (Math.abs(u) > 0.96) return false; return Math.abs(y) < edge(u, y < 0) * 0.94; };
  const skip = (x, y) => {                          // keep marks off the dark cavities
    const k = Math.round(y + oy) * w + Math.round(x + ox); const p4 = k * 4;
    return !(d[p4] > 150);
  };
  g.lineCap = 'round';
  for (let i = 0, n = Math.round(o.len * 0.2); i < n; i++) {
    const x = r.range(-A, A), y = r.range(-B, B); if (!inBody(x, y) || skip(x, y)) continue;
    const a = striA + r.range(-0.5, 0.5) + (r.chance(0.25) ? 1.3 : 0), len = r.range(5, o.len * 0.09), bend = r.range(-0.25, 0.25);
    g.strokeStyle = r.chance(0.6) ? L.rgba('#6a4a2c', r.range(0.1, 0.26)) : L.rgba('#fffaf0', r.range(0.16, 0.4));
    g.lineWidth = r.range(0.6, 1.1);
    g.beginPath(); g.moveTo(ox + x, oy + y);
    g.quadraticCurveTo(ox + x + Math.cos(a + bend) * len * 0.5, oy + y + Math.sin(a + bend) * len * 0.5, ox + x + Math.cos(a) * len, oy + y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0, n = Math.round(o.len * 0.13); i < n; i++) {
    const x = r.range(-A, A), y = r.range(-B, B); if (!inBody(x, y) || skip(x, y)) continue;
    const rad = r.range(0.8, 2.1) * (r.chance(0.1) ? 1.7 : 1);
    if (r.chance(0.55)) {                             // soil speck
      g.fillStyle = L.rgba(r.chance(0.5) ? '#7d5630' : '#5b3d22', r.range(0.25, 0.6));
      g.beginPath(); g.ellipse(ox + x, oy + y, rad, rad * r.range(0.6, 1), r() * 3, 0, TAU); g.fill();
    } else {                                          // pit: dark bowl, lit lower-right lip (in page space → rotate the offset into the sprite)
      const px = -l2x * rad * 0.45, py = -l2y * rad * 0.45;
      g.fillStyle = L.rgba('#fff8e8', r.range(0.35, 0.6)); g.beginPath(); g.arc(ox + x + px, oy + y + py, rad * 1.05, 0, TAU); g.fill();
      g.fillStyle = L.rgba('#4a321e', r.range(0.4, 0.7)); g.beginPath(); g.arc(ox + x, oy + y, rad * 0.85, 0, TAU); g.fill();
    }
  }
  for (let i = 0, n = r.int(0, 2); i < n; i++) {      // craze line
    let x = r.range(-A * 0.6, A * 0.6), y = r.range(-B * 0.5, B * 0.5), a = r.range(0, TAU);
    if (skip(x, y)) continue;
    g.strokeStyle = L.rgba('#5a3e25', r.range(0.28, 0.45)); g.lineWidth = 0.9; g.beginPath(); g.moveTo(ox + x, oy + y);
    for (let s2 = 0, m2 = r.int(6, 14); s2 < m2; s2++) { a += r.range(-0.45, 0.45); x += Math.cos(a) * r.range(4, 9); y += Math.sin(a) * r.range(4, 9); if (!inBody(x, y) || skip(x, y)) break; g.lineTo(ox + x, oy + y); }
    g.stroke();
  }
  g.restore();
  // mask
  g.globalCompositeOperation = 'destination-in'; outline(g); g.fillStyle = '#000'; g.fill(); g.globalCompositeOperation = 'source-over';
  // a thin darker rim line where the shell turns under (sits inside the mask edge)
  g.save(); outline(g); g.clip(); outline(g); g.strokeStyle = 'rgba(96,66,38,0.22)'; g.lineWidth = 2.4; g.stroke(); g.restore();
  return cv;
}

/** shell sprite + how far its outline reaches above / below its long axis (so a flank can be laid exactly on a line) */
function shell(len, rot, seed) {
  const spr = makeShell({ len, rot, kind: 'ventral', seed, ring: false });
  const w = spr.width, h = spr.height, q = spr.getContext('2d');
  q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(255,206,96,0.10)'; q.fillRect(0, 0, w, h); q.restore();   // warm bounce off the yellow paper
  const d = q.getImageData(0, 0, w, h).data;
  let top = h, bot = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 128) { if (y < top) top = y; if (y > bot) bot = y; }
  return { spr, eT: h / 2 - top, eB: bot + 1 - h / 2 };
}
/** extent of the shell toward page direction `dir` (rad), given its rotation: the sprite's +y axis points along rot + 90° */
const reach = (s, rot, dir) => (Math.cos(rot + Math.PI / 2 - dir) > 0 ? s.eB : s.eT);

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const G = K.GLYPH, r = L.rng('g29lay');
  g.drawImage(K.paper({ base: '#f3c61d', tone: '#b06c12', seed: 'g29paper', fiber: 0.75, stain: 0.26, grain: 0.09, edge: 0.2, foxing: 0.1 }), 0, 0);
  const items = [];                                                     // { s, x, y, rot, z }
  // ── outer row: long axes tangent to the circle, outer flank on the rim; lengths vary and are fitted to the circumference ──
  {
    const n = 24, lens = []; let sum = 0;
    for (let i = 0; i < n; i++) { const l = r.range(74, 104); lens.push(l); sum += l; }
    const k = (TAU * (G.R - 31)) / (sum * 0.965); let t = r() * TAU;
    for (let i = 0; i < n; i++) {
      const len = lens[i] * k, da = (len * 0.965) / (G.R - 31); const ang = t + da / 2; t += da;
      const rot = ang + Math.PI / 2 + (r.chance(0.5) ? Math.PI : 0) + r.range(-0.07, 0.07);
      const s = shell(len, rot, 'r' + i), rr = G.R + 1.5 - reach(s, rot, ang) + r.range(-1.5, 1);
      items.push({ s, x: G.cx + Math.cos(ang) * rr, y: G.cy + Math.sin(ang) * rr, rot, z: 2 + r() });
    }
  }
  // ── the square hole: a pinwheel of four straight rows, each owning one corner; inner flanks on the hole's sides ──
  {
    const sides = [[-1, -1, 1, 0, -Math.PI / 2], [1, -1, 0, 1, 0], [1, 1, -1, 0, Math.PI / 2], [-1, 1, 0, -1, Math.PI]];
    const span = G.a * 2 + 58;
    sides.forEach(([sx, sy, dx, dy, nrm], si) => {
      const lens = []; let sum = 0;
      for (let i = 0; i < 4; i++) { const l = r.range(70, 90); lens.push(l); sum += l; }
      const k = span / (sum * 0.97); let t = -58;                       // t = 0 at the hole's corner, running along the side
      for (let i = 0; i < 4; i++) {
        const len = lens[i] * k, adv = len * 0.97, tc = t + adv / 2; t += adv;
        const rot = Math.atan2(dy, dx) + (r.chance(0.5) ? Math.PI : 0) + r.range(-0.045, 0.045);
        const s = shell(len, rot, 'q' + si + '-' + i), off = G.a - 1 + reach(s, rot, nrm + Math.PI) + r.range(-0.5, 1.5);
        const x = G.cx + sx * G.a + dx * tc + Math.cos(nrm) * (off - G.a), y = G.cy + sy * G.a + dy * tc + Math.sin(nrm) * (off - G.a);
        items.push({ s, x, y, rot, z: 1 + r() });
      }
    });
  }
  // ── the flesh between: three shells standing roughly radially opposite each side, and a small one tucked in on each diagonal ──
  for (let q = 0; q < 4; q++) {
    for (let j = -1; j <= 1; j++) {
      const ang = q * Math.PI / 2 + j * 0.335 + r.range(-0.03, 0.03), len = r.range(94, 110), rot = ang + (r.chance(0.5) ? Math.PI : 0) + r.range(-0.32, 0.32);
      const rr = 244 + r.range(-5, 5);
      items.push({ s: shell(len, rot, 'f' + q + j), x: G.cx + Math.cos(ang) * rr, y: G.cy + Math.sin(ang) * rr, rot, z: r() });
    }
    const ang = q * Math.PI / 2 + Math.PI / 4 + r.range(-0.03, 0.03), len = r.range(72, 82), rot = ang + Math.PI / 2 + r.range(-0.3, 0.3) + (r.chance(0.5) ? Math.PI : 0);
    items.push({ s: shell(len, rot, 'd' + q), x: G.cx + Math.cos(ang) * 277, y: G.cy + Math.sin(ang) * 277, rot, z: r() * 0.5 });
  }
  items.sort((a, b) => a.z - b.z);
  for (const it of items) {
    // broad soft cast shadow toward the lower right, then a tight contact shadow hugging the shell
    K.stamp(g, it.s.spr, it.x, it.y, { rot: it.rot, shadow: { dx: 5, dy: 8, blur: 12, color: 'rgba(120,66,6,0.34)' } });
    K.stamp(g, it.s.spr, it.x, it.y, { rot: it.rot, shadow: { dx: 1.6, dy: 2.6, blur: 3.2, color: 'rgba(84,44,6,0.5)' } });
  }
  return c;
}

export default {
  name: '贝币',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },         // a 3-frame flash: perfectly still
};
