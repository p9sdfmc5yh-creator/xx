// h2 — 铜汁入范: looking straight down onto an oblong open sand mould in a fired-clay flask (iron straps riveted round its four
// corners) that fills the frame from side to side. The cavity is the film's glyph (whatever the player selected: every measure
// below comes from K.glyphInfo / K.sdGlyph) and it is brim-full of copper — white-hot down the middle of each stroke, orange
// where the melt chills against the sand. A pouring cup, a runner and one ingate per character feed it from the top; their
// metal has already frozen to a dull crusted red, and the sand round the cup is smoked black.
//   · mould  = one height field at DEVICE resolution (L.pixelCanvas): rammed sand with grain relief, the cavity walls falling to
//              the liquid level, runner, cup, clay casing with bevels, iron straps and rivets — lit from the top-left with cast shadows.
//   · glow   = a second per-pixel layer, added on top ('lighter') and breathing: the melt's light on the walls, on the lip of
//              the cavity and — grain by grain, on the slopes that face the metal — out across the sand.
//   · melt   = temperature from K.sdGlyph + fine flow lines by line-integral convolution ALONG the strokes (K.strokeAngle).
//              Three LIC images (plain, cos, sin) give any phase of a periodic kernel, so the lines creep along the strokes.
//   · oxide skins (long glowing margin → dark wrinkled crust) and dross specks drift with the flow and grow.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2, SQ = Math.SQRT1_2;
const GX = 0.33, GY = 0.944;                              // the melt creeps down the strokes, away from the gates
const HC = 16, BEVH = 3, HS = HC - 3.6;                   // heights (px): top of the casing, its outer bevel, the sand face
const RAMP = [[0, '#861c02'], [0.22, '#d04608'], [0.42, '#f67a12'], [0.6, '#ffa92e'], [0.8, '#ffd570'], [1, '#fff8dc']];
let G = null, lut = null, base = null, glowL = null, heat = null, flows = null, work = null, skins = [], specks = [];

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sdBox = (x, y, cx, cy, hw, hh, r) => { const dx = Math.abs(x - cx) - hw + r, dy = Math.abs(y - cy) - hh + r; return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r; };
const sdSeg = (x, y, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, wx = x - ax, wy = y - ay; let t = (wx * vx + wy * vy) / (vx * vx + vy * vy || 1); t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(wx - vx * t, wy - vy * t); };
const hash2 = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

// ───────────────────────── layout: everything is placed from the glyph ─────────────────────────
function layout() {
  const info = K.glyphInfo(), bb = info.bbox, sw = info.strokeWidth;
  const U = L.clamp(sw / 28, 1, 2.4), Uc = Math.min(U, 1.6), TH = 26;                  // TH: thickness of the casing
  const fx0 = 10, fx1 = S - 10, fy0 = Math.max(6, Math.round(bb.y0 - 170)), fy1 = Math.min(S - 6, Math.round(bb.y1 + 98));
  const fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2, fhw = (fx1 - fx0) / 2, fhh = (fy1 - fy0) / 2;
  const sx0 = fx0 + TH, sx1 = fx1 - TH, sy0 = fy0 + TH, sy1 = fy1 - TH;
  const mx0 = Math.max(0, fx0 - 4), my0 = Math.max(0, fy0 - 4), mw = Math.min(S, fx1 + 4) - mx0, mh = Math.min(S, fy1 + 4) - my0;   // the mould's pixel region
  const rx0 = Math.max(mx0 + 3, Math.floor(bb.x0 - 4)), ry0 = Math.max(my0 + 3, Math.floor(bb.y0 - 4));                         // the melt's pixel region
  const rw = Math.min(mx0 + mw - 3, Math.ceil(bb.x1 + 4)) - rx0, rh = Math.min(my0 + mh - 3, Math.ceil(bb.y1 + 4)) - ry0;
  const wall = L.clamp(sw * 0.1, 2.6, 5.5);                                            // width of the cavity wall seen from above
  const room = Math.max(44, bb.y0 - sy0), ry = sy0 + room * 0.42;                      // the runner lies in the sand above the characters
  const cupR = Math.min(30, room * 0.3), cupX = sx1 - cupR - 30, cupY = Math.max(sy0 + cupR + 9, ry - 2);
  const wr = 7.6 * Uc, wi = 5.6 * Uc;
  const gates = info.chars.map((c) => {                    // one ingate per character, dropped onto its topmost stroke
    let bx = c.cx, by = -1, best = 1e9;
    for (let x = c.cx - c.em * 0.32; x <= c.cx + c.em * 0.32; x += 2) {
      for (let y = bb.y0 - 2; y < bb.y0 + c.em * 0.45; y += 1) {
        if (K.sdGlyph(x, y) < -Math.min(4.5, sw * 0.16)) { const sc = y + Math.abs(x - c.cx) * 0.015; if (sc < best) { best = sc; bx = x; by = y; } break; }
      }
    }
    if (by < 0) return { x: c.cx, y0: ry, y1: bb.y0 + 6 };
    let xl = bx, xr = bx;
    while (bx - xl < sw * 1.2 && K.sdGlyph(xl - 1, by + 2) < 0) xl--;
    while (xr - bx < sw * 1.2 && K.sdGlyph(xr + 1, by + 2) < 0) xr++;
    if (xr - xl < sw * 2.2) bx = (xl + xr) / 2;
    return { x: bx, y0: ry, y1: by + 4 };
  });
  const xL = Math.min(cupX - 40, ...gates.map((g) => g.x));
  const chan = (x, y) => {                                 // signed distance to the runner + ingates (negative inside the channel)
    let d = sdSeg(x, y, xL, ry, cupX, cupY) - wr;
    for (const g of gates) { const t = c01((y - g.y0) / (g.y1 - g.y0 || 1)), dd = sdSeg(x, y, g.x, g.y0, g.x, g.y1) - wi * (1.12 - 0.26 * t); if (dd < d) d = dd; }
    return d;
  };
  const chY0 = Math.min(ry, cupY) - wr - 6, chY1 = Math.max(...gates.map((g) => g.y1)) + wi + 6;
  return { info, bb, sw, U, Uc, TH, fx0, fx1, fy0, fy1, fcx, fcy, fhw, fhh, sx0, sx1, sy0, sy1, mx0, my0, mw, mh, rx0, ry0, rw, rh, wall, ry, cupR, cupX, cupY, wr, wi, gates, xL, chan, chY0, chY1,
    Rdir: Math.max(12, sw * 0.75) };
}

// ───────────────────────── the mould and the light the melt throws on it (per device pixel) ─────────────────────────
function buildMould() {
  const { Uc, TH, fx0, fy0, fx1, fy1, fcx, fcy, fhw, fhh, mx0, my0, mw, mh, wall, cupR, cupX, cupY, chan, chY0, chY1 } = G;
  const q = L.SS, pw = mw * q, ph = mh * q, npx = pw * ph;
  const SD = new Float32Array(npx), H = new Float32Array(npx).fill(HC - BEVH), mat = new Uint8Array(npx), emi = new Uint8Array(npx);
  const nA = L.makeNoise('h2sandA'), nB = L.makeNoise('h2sandB'), nC = L.makeNoise('h2clay');
  const LV = HS - 2.7 * Uc, DCH = 5 * Uc, ARM = 74;        // liquid level, depth of the runner, length of the corner straps
  const bloom = (px) => {                                  // the glyph, blurred: how much of the melt a point of the mould "sees"
    const c = L.makeCanvas(mw, mh), x = c.getContext('2d', { willReadFrequently: true });
    x.filter = `blur(${px}px)`; x.translate(-mx0, -my0); K.fillGlyph(x, '#fff'); x.filter = 'none';
    return L.getRaw(c).data;
  };
  const b1 = bloom(11 * Uc), b2 = bloom(40 * Uc);
  const gdat = new Uint8ClampedArray(npx * 4);
  const mould = L.pixelCanvas(mw, mh, (d) => {
    // pass 1 — height, material and unlit colour
    for (let j = 0; j < ph; j++) {
      const y = my0 + (j + 0.5) / q, ay = Math.abs(y - fcy), inCh = y > chY0 && y < chY1;
      for (let i = 0; i < pw; i++) {
        const x = mx0 + (i + 0.5) / q, o = j * pw + i, k = o * 4, ax = Math.abs(x - fcx);
        const sdg = K.sdGlyph(x, y); SD[o] = sdg;
        const sdO = sdBox(x, y, fcx, fcy, fhw, fhh, 8), sdI = sdBox(x, y, fcx, fcy, fhw - TH, fhh - TH, 5);
        const sdSt = Math.max(fhw - ARM - ax, fhh - ARM - ay, sdO - 2.5, 1.5 - sdI);     // iron strap wrapped round each corner
        const sdAll = Math.min(sdO, sdSt);
        if (sdAll > 0.75) continue;
        const qx = x - cupX, qy = y - cupY, pa = qx * 0.5 - qy * 0.87, pc = qx * 0.87 + qy * 0.5, nS = nB.fbm(x / 55 + 1.7, y / 55 - 4.2, 2);
        const dcs = Math.hypot(pc / 0.8, pa > 0 ? pa / 1.9 : pa / 0.85);                       // the smoke drifted to the upper right
        const sootC = c01(1.6 * Math.exp(-Math.max(0, dcs - cupR * 0.8) / 44) * (0.62 + 0.45 * nS));   // smoke round the pouring cup
        const hv = hash2((x * 2) | 0, (y * 2) | 0);
        let h, r, g, b, m;
        if (sdSt < 0) {                                    // ── wrought iron: rust-mottled, pitted, riveted
          const te = c01(-sdSt / 1.7), rn = nC.fbm(x / 9 + 3, y / 9 - 7, 3), pit = nC.n2(x / 1.9, y / 1.9), scl = nC.n2(x / 4.5 + 9, y / 4.5);
          h = HC + 2.4 * Math.sqrt(te * (2 - te)) + 0.2 * pit + 0.3 * rn + 0.22 * scl;
          const c1 = fhh - TH * 0.5, c2 = fhw - TH * 0.5;
          const rv = Math.min(Math.hypot(ax - (fhw - 32), ay - c1), Math.hypot(ax - (fhw - 60), ay - c1), Math.hypot(ax - c2, ay - (fhh - 32)), Math.hypot(ax - c2, ay - (fhh - 60)));
          if (rv < 4.8) h += 2.4 * Math.sqrt(1 - (rv / 4.8) * (rv / 4.8)); else if (rv < 6.2) h -= 0.35;
          const w = sstep(-0.15, 0.45, rn) * 0.85, tone = (0.86 + 0.2 * pit + 0.12 * scl) * (1 - 0.45 * sootC) * (hv < 0.05 ? 0.7 : 1);
          r = (52 + 60 * w) * tone; g = (47 + 18 * w) * tone; b = (45 - 6 * w) * tone; m = 3;
        } else if (sdI > 0) {                              // ── fired-clay casing: bevelled, paddle-marked, chipped
          const to = c01(-sdO / 3.5), ti = c01(sdI / 3.2);
          const along = (ay - (fhh - TH) > ax - (fhw - TH)) ? x : y;
          const gph = (along + 4 * nC.n2(along / 37, 3.3)) / 17, gf = gph - Math.floor(gph), gdist = Math.min(gf, 1 - gf) * 17;
          const groove = (1 - sstep(0, 1.7, gdist)) * (0.3 + 0.7 * c01(0.5 + nC.n2(along / 50, 9.1)));
          const und = nC.n2(x / 26, y / 26), fine = nC.n2(x / 2.7 + 11, y / 2.7), grit = nC.n2(x / 0.9, y / 0.9 + 5);
          const chip = sstep(0.42, 0.74, nC.n2(x / 11 + 7, y / 11 - 3)) * (1 - sstep(0, 7, -sdO));
          h = HC - BEVH * (1 - Math.sqrt(to * (2 - to))) - (HC - HS) * (1 - Math.sqrt(ti * (2 - ti))) + 0.45 * und + 0.24 * fine + 0.12 * grit - 0.6 * groove - 2.6 * chip - (fine > 0.62 ? 0.5 : 0);
          let tone = (1 + 0.13 * und + 0.07 * fine + 0.08 * grit - 0.22 * groove + 0.2 * chip) * (1 - 0.36 * Math.exp(-sdI / 6)) * (1 - 0.9 * sootC);
          if (hv > 0.985) tone *= 1.4; else if (hv < 0.04) tone *= 0.6;
          r = 132 * tone; g = 87 * tone; b = 60 * tone; m = 2;
        } else {                                           // ── moulding sand, with the cavity, the runner and the cup cut into it
          const lump = nA.fbm(x / 22, y / 22, 3), gr1 = nA.n2(x / 1.4 + 50, y / 1.4), gr2 = nB.n2(x / 0.72, y / 0.72), scr = nB.n2(x / 130, y / 2.4 + 9), mot = nB.n2(x / 95 + 3, y / 95), mid = nA.n2(x / 6.5 + 70, y / 6.5);
          const hs = HS + 1.5 * lump + 0.45 * mid + 0.4 * gr1 + 0.24 * gr2 + 0.22 * scr;
          const asd = Math.abs(sdg), sdc = asd < 8 ? sdg + 0.45 * (1 - sstep(4, 8, asd)) * nA.n2(x / 2.3 + 20, y / 2.3) : sdg;   // the lip is a little crumbled
          SD[o] = sdc;
          const cav = sdc < 0 ? sstep(0, -wall, sdc) : 0;
          let sdCh = 99, tt = 0, dropC = 0;
          const dcup = Math.hypot(x - cupX, y - cupY);
          if (inCh || dcup < cupR + 3) {
            const wob = 0.9 * nA.n2(x / 11 + 31, y / 11 + 5);
            sdCh = Math.min(inCh ? chan(x, y) + wob : 99, dcup - cupR + wob);
            if (sdCh < 0) { tt = c01((cupR - dcup - wob) / cupR); dropC = Math.max(DCH * sstep(0, -3.4 * Uc, sdCh), 10 * (1 - (1 - tt) * (1 - tt))); }
          }
          if (sdc < -wall - 1.5) { H[o] = LV; mat[o] = 5; d[k] = 150; d[k + 1] = 58; d[k + 2] = 14; d[k + 3] = 255; continue; }   // under the melt
          const lvl = LV - 3.4 * sstep(0, 0.35, tt);       // the cup has drained into the runner: its puddle stands lower, inside a sooty bowl
          if (dropC > 0 && hs - dropC < lvl - 0.1) {       // frozen metal standing in the runner and the cup: crust plates, seams still red
            const cp = nB.ridged(x / 6.5 + 13, y / 6.5 - 8, 2), cn = nB.n2(x / 2.6, y / 2.6), seam = sstep(0.8, 0.97, cp);
            h = lvl - 0.5 * seam + 0.3 * cn - 1.2 * tt * tt;
            const hot = Math.exp(-Math.max(sdc, 0) / (15 * Uc)), tone = 0.8 + 0.3 * cn - 0.25 * seam;
            r = 88 * tone; g = 45 * tone; b = 31 * tone; m = 4;
            emi[o] = 255 * c01(0.07 + 0.55 * hot * hot + seam * (0.2 + 0.4 * hot + 0.3 * tt) + 0.24 * tt);
          } else {
            h = hs - Math.max((HS - LV) * cav, dropC);
            let tone = (1 + 0.15 * mot + 0.09 * lump) * (1 + 0.2 * gr2 + 0.1 * gr1);
            if (hv > 0.975) tone *= 1.7; else if (hv < 0.06) tone *= 0.5;      // quartz glints and carbon specks
            const bk = sdc > 0 ? 0.62 * Math.exp(-sdc / 8) : 0.62;              // fired brick-red next to the metal
            const sootG = sdc > 4 ? sstep(4, 14, sdc) * Math.exp(-Math.max(0, sdc - 14) / 24) * (0.42 + 0.3 * nS) : 0;
            const sootH = sdCh < 30 ? 0.5 * Math.exp(-Math.max(0, sdCh) / 8) : 0;
            const kk = tone * (1 - 0.8 * c01(Math.max(sootC, sootG, sootH)));
            r = (78 + 44 * bk) * kk; g = (65 - 12 * bk) * kk; b = (53 - 22 * bk) * kk; m = 1;
          }
        }
        H[o] = h; mat[o] = m; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255 * c01(0.5 - sdAll * q * 0.67);
      }
    }
    // pass 2 — daylight from the top-left (slope shading + cast shadows), and the melt's own light into `gdat`
    const SHO = [1, 2, 3, 4, 6, 8, 11, 14, 18], SHD = SHO.map((v) => v * Math.SQRT2 / q * 0.77), span = (fx1 - fx0) + (fy1 - fy0);
    for (let j = 0; j < ph; j++) {
      const y = my0 + (j + 0.5) / q;
      for (let i = 0; i < pw; i++) {
        const o = j * pw + i, m = mat[o]; if (!m || m === 5) continue;
        const k = o * 4, x = mx0 + (i + 0.5) / q;
        const hx = (H[i < pw - 1 ? o + 1 : o] - H[i > 0 ? o - 1 : o]) * q * 0.5, hy = (H[j < ph - 1 ? o + pw : o] - H[j > 0 ? o - pw : o]) * q * 0.5;
        const nl = 1 / Math.sqrt(1 + hx * hx + hy * hy);
        let dif = (0.56 * (hx + hy) + 0.61) * nl; if (dif < 0) dif = 0;
        let sh = 0; const h0 = H[o];
        for (let s = 0; s < SHO.length; s++) { const of = SHO[s]; if (i < of || j < of) break; const dh = (H[o - of * pw - of] - h0 - SHD[s]) * 1.7; if (dh > sh) sh = dh; }
        if (sh > 1) sh = 1;
        const shade = (0.34 + 1.08 * dif * (1 - 0.85 * sh)) * (1.1 - 0.3 * ((x - fx0) + (y - fy0)) / span);
        const ar = d[k], ag = d[k + 1], ab = d[k + 2];
        let sp = 0;
        if (m === 3) { let ndh = (0.313 * (hx + hy) + 0.899) * nl; if (ndh > 0) { ndh *= ndh; ndh *= ndh; ndh *= ndh; sp = ndh * ndh * ndh * 150 * (1 - sh); } }   // a dull sheen on the iron
        d[k] = ar * shade + sp; d[k + 1] = ag * shade + sp * 0.95; d[k + 2] = ab * shade + sp * 0.88;
        // the melt's light: strong on the walls and the lip, then falling away over the sand, catching the grain slopes that face it
        const sd = SD[o];
        let gx = SD[i < pw - 2 ? o + 2 : o] - SD[i > 1 ? o - 2 : o], gy = SD[j < ph - 2 ? o + 2 * pw : o] - SD[j > 1 ? o - 2 * pw : o];
        const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
        let rf = 0.62 + 1.5 * (hx * gx + hy * gy); rf = rf < 0.12 ? 0.12 : rf > 1.35 ? 1.35 : rf;
        let af = (ar * 0.3 + ag * 0.59 + ab * 0.11) / 66; af = af < 0.3 ? 0.3 : af > 1.9 ? 1.9 : af;
        const B1 = b1[k + 3] / 255, B2 = b2[k + 3] / 255;
        const near = sd > 0 ? 0.85 * Math.exp(-sd / (4.2 * Uc)) : 0.85;
        const E1 = (near + 0.62 * B1) * 0.8 * rf * af, E2 = 1.9 * B2 * (0.5 + 0.5 * rf) * af;
        let R = 255 * (E1 + E2), Gc = 146 * E1 + 100 * E2, Bc = 46 * E1 + 24 * E2;
        if (m === 1 && sd < 0) {                           // cavity wall: brighter toward the liquid; the lower-right walls face the daylight, the upper-left ones are in shade
          const wd = sstep(0, -wall, sd), wE = (0.34 + 0.6 * wd) * (1 + 0.55 * (gx + gy) * SQ) * (0.55 + 0.45 * af), mm = sstep(0, -0.8, sd);
          R += (255 * wE - R) * mm; Gc += (126 * wE - Gc) * mm; Bc += (32 * wE - Bc) * mm;
        } else if (m === 4) {                              // the frozen runner still glows where it meets the characters
          const T = emi[o] / 255, li = ((T * 1023) | 0) * 3, ke = c01(T * 2.3);
          R = R * 0.6 + lut[li] * ke; Gc = Gc * 0.6 + lut[li + 1] * ke; Bc = Bc * 0.6 + lut[li + 2] * ke;
        }
        gdat[k] = R; gdat[k + 1] = Gc; gdat[k + 2] = Bc; gdat[k + 3] = 255;
      }
    }
  });
  const glow = L.pixelCanvas(mw, mh, (d) => { d.set(gdat); });
  return { mould, glow, SD, pw, ph };
}

// ───────────────────────── floor + mould (static) ─────────────────────────
function buildBase(mould) {
  const { fx0, fy0, fx1, fy1, sx0, sx1, sy0, sy1, mx0, my0, cupX, cupY, cupR, chan } = G;
  const c = L.makeCanvas(S, S), g = c.getContext('2d'), r = L.rng('h2base');
  const off = (x, y, mrg) => x < fx0 - mrg || x > fx1 + mrg || y < fy0 - mrg || y > fy1 + mrg;
  // foundry floor: near-black charcoal and trodden sand
  g.drawImage(L.stoneTex(S, S, { base: '#1b1815', dark: '#0a0908', light: '#3b332a', seed: 'h2floor', scale: 240, speck: 1, rough: 0.8 }), 0, 0);
  L.speckle(g, { seed: 'h2floorg', count: 9000, x: 0, y: 0, w: S, h: S, rMin: 0.5, rMax: 2.1, colors: ['#6a5c4a', '#050404', '#8c7a62', '#2c2620'], alpha: [0.18, 0.6], test: (x, y) => off(x, y, 2) });
  for (let i = 0; i < 70; i++) {                            // charcoal crumbs and spilt sand lumps, lit from the top-left
    const x = r() * S, y = r() * S; if (!off(x, y, 10)) continue;
    const s = r.range(2.5, 7), rot = r() * 3;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.ellipse(x + 1.6, y + 2.2, s * 1.1, s * 0.8, rot, 0, TAU); g.fill();
    g.fillStyle = r.pick(['#14110f', '#2a231c', '#3a3026']); g.beginPath(); g.ellipse(x, y, s, s * r.range(0.55, 0.8), rot, 0, TAU); g.fill();
    g.fillStyle = 'rgba(170,150,120,0.22)'; g.beginPath(); g.ellipse(x - s * 0.25, y - s * 0.22, s * 0.45, s * 0.25, rot, 0, TAU); g.fill();
  }
  // the flask's shadow on the floor: a long soft one and a tight contact one, both falling to the lower right
  for (const [bl, ox, oy, al] of [[42, 15, 22, 0.85], [9, 4, 6, 0.8]]) {
    g.save(); g.shadowColor = `rgba(0,0,0,${al})`; g.shadowBlur = bl; g.shadowOffsetX = ox; g.shadowOffsetY = oy;
    g.fillStyle = '#0b0908'; rrect(g, fx0 + 1, fy0 + 1, fx1 - fx0 - 2, fy1 - fy0 - 2, 8); g.fill(); g.restore();
  }
  g.drawImage(mould, mx0, my0);
  // loose grains and small lumps lying on the sand face, each with its own highlight and shadow
  for (let i = 0; i < 420; i++) {
    const x = r.range(sx0 + 5, sx1 - 5), y = r.range(sy0 + 5, sy1 - 5);
    if (K.sdGlyph(x, y) < 6 || chan(x, y) < 5 || Math.hypot(x - cupX, y - cupY) < cupR + 6) continue;
    const s = r.range(0.8, 2.5), rot = r() * 3, sq = r.range(0.6, 0.9);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(x + s * 0.55, y + s * 0.7, s * 1.05, s * sq, rot, 0, TAU); g.fill();
    g.fillStyle = r.pick(['#4a3d31', '#2b231c', '#5c4c3c', '#191512']); g.beginPath(); g.ellipse(x, y, s, s * sq, rot, 0, TAU); g.fill();
    g.fillStyle = 'rgba(196,172,140,0.4)'; g.beginPath(); g.ellipse(x - s * 0.3, y - s * 0.3, s * 0.42, s * 0.26, rot, 0, TAU); g.fill();
  }
  // spatter: a few beads of copper that jumped out of the cup — on the sand, the casing and the floor; the bigger ones still dull red
  const rb = L.rng('h2spatter');
  for (let i = 0; i < 18; i++) {
    const a = rb() * TAU, dist = cupR + 10 + Math.pow(rb(), 1.6) * 150, x = cupX + Math.cos(a) * dist, y = cupY + Math.sin(a) * dist * 0.9;
    const s = rb.range(1.4, 4.2), hot = s > 2.6 && rb() < 0.7, rot = rb() * 3, sq = rb.range(0.8, 1);
    if (x < 8 || x > S - 8 || y < 8 || K.sdGlyph(x, y) < 12 || chan(x, y) < 6 || dist < cupR + s + 4) continue;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.ellipse(x + s * 0.5, y + s * 0.65, s * 1.1, s * 0.9, rot, 0, TAU); g.fill();
    if (hot) { g.fillStyle = L.radial(g, x, y, s * 0.6, s * 3.4, [[0, 'rgba(255,120,30,0.24)'], [1, 'rgba(255,120,30,0)']]); g.fillRect(x - s * 3.4, y - s * 3.4, s * 6.8, s * 6.8); }
    g.fillStyle = L.radial(g, x - s * 0.3, y - s * 0.3, 0, s * 1.25, hot ? [[0, '#f08a3a'], [0.45, '#9c3c14'], [1, '#2a120c']] : [[0, '#8a5a44'], [0.4, '#3c2018'], [1, '#160c09']]);
    g.beginPath(); g.ellipse(x, y, s, s * sq, rot, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,224,176,0.5)'; g.beginPath(); g.ellipse(x - s * 0.36, y - s * 0.36, s * 0.24, s * 0.16, 0.6, 0, TAU); g.fill();
  }
  return c;
}

// ───────────────────────── the melt: temperature + flow lines along the strokes ─────────────────────────
function buildMelt(M) {
  const { rx0, ry0, rw, rh, mx0, my0, wall, Uc, sw, Rdir } = G, q = L.SS, SD = M.SD, mwq = M.pw;
  const pw = rw * q, ph = rh * q, n = pw * ph, oi = (rx0 - mx0) * q, oj = (ry0 - my0) * q;
  // 1. stroke direction on a coarse grid (double-angle form, so that it can be averaged), smoothed and spread one node outwards
  const P = sw > 50 ? 4 : 3, gw = Math.ceil(rw / P) + 2, gh = Math.ceil(rh / P) + 2;
  let c2 = new Float32Array(gw * gh), s2 = new Float32Array(gw * gh), ok = new Uint8Array(gw * gh);
  for (let b = 0; b < gh; b++) for (let a = 0; a < gw; a++) {
    const x = rx0 + a * P, y = ry0 + b * P; if (K.sdGlyph(x, y) > 2.5) continue;
    const an = K.strokeAngle(x, y, Rdir), k = b * gw + a; c2[k] = Math.cos(2 * an); s2[k] = Math.sin(2 * an); ok[k] = 1;
  }
  for (let pass = 0; pass < 3; pass++) {
    const nc = c2.slice(), ns = s2.slice(), nok = ok.slice();
    for (let b = 0; b < gh; b++) for (let a = 0; a < gw; a++) {
      const k = b * gw + a; if (pass > 0 && ok[k]) continue;
      let sc = 0, ss = 0, cnt = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a2 = a + di, b2 = b + dj; if (a2 < 0 || b2 < 0 || a2 >= gw || b2 >= gh) continue;
        const k2 = b2 * gw + a2; if (ok[k2]) { const wgt = di === 0 && dj === 0 ? 2 : 1; sc += c2[k2] * wgt; ss += s2[k2] * wgt; cnt += wgt; }
      }
      if (cnt) { nc[k] = sc / cnt; ns[k] = ss / cnt; nok[k] = 1; }
    }
    c2 = nc; s2 = ns; ok = nok;
  }
  // 2. per device pixel: direction (oriented down-stream), and the noise the flow lines are drawn out of
  const DX = new Float32Array(n), DY = new Float32Array(n), IN = new Uint8Array(n), N = new Float32Array(n);
  const rn = L.rng('h2lic'), nf = L.makeNoise('h2licn'), nz = L.makeNoise('h2heat');
  for (let j = 0; j < ph; j++) {
    const yl = (j + 0.5) / q, v = yl / P, b0 = v | 0, fb = v - b0, rowM = (j + oj) * mwq + oi;
    for (let i = 0; i < pw; i++) {
      if (SD[rowM + i] > 1.5) continue;
      const o = j * pw + i, xl = (i + 0.5) / q, u = xl / P, a0 = u | 0, fa = u - a0, k = b0 * gw + a0;
      let c = (c2[k] * (1 - fa) + c2[k + 1] * fa) * (1 - fb) + (c2[k + gw] * (1 - fa) + c2[k + gw + 1] * fa) * fb;
      let s = (s2[k] * (1 - fa) + s2[k + 1] * fa) * (1 - fb) + (s2[k + gw] * (1 - fa) + s2[k + gw + 1] * fa) * fb;
      const l = Math.hypot(c, s); let dx = 1, dy = 0;
      if (l > 1e-4) { c /= l; s /= l; dx = Math.sqrt((1 + c) / 2); dy = (s >= 0 ? 1 : -1) * Math.sqrt((1 - c) / 2); }
      if (dx * GX + dy * GY < 0) { dx = -dx; dy = -dy; }
      DX[o] = dx; DY[o] = dy; IN[o] = 1;
      const x = rx0 + xl, y = ry0 + yl;
      N[o] = 0.6 * (rn() * 2 - 1) + 0.9 * nf.n2(x / 1.05, y / 1.05) + 0.7 * nf.n2(x / 2.6 + 40, y / 2.6);
    }
  }
  // 3. line-integral convolution along the strokes with a Hann window; A = plain, B / C = cos / sin weighted. A + cos φ·B − sin φ·C
  //    is the convolution with a periodic kernel shifted by φ — so stepping φ makes the lines travel down the stroke.
  const NS = Math.round(15 * Uc * q), lam = 12.5 * Uc * q;
  const Hn = new Float32Array(NS + 1), Hc = new Float32Array(NS + 1), Hs = new Float32Array(NS + 1);
  for (let k = 0; k <= NS; k++) { const h = 0.5 * (1 + Math.cos(Math.PI * k / (NS + 1))); Hn[k] = h; Hc[k] = h * Math.cos(TAU * k / lam); Hs[k] = h * Math.sin(TAU * k / lam); }
  const A = new Float32Array(n), B = new Float32Array(n), C = new Float32Array(n);
  let sa = 0, sb = 0, cnt = 0;
  for (let j = 0; j < ph; j++) {
    const rowM = (j + oj) * mwq + oi;
    for (let i = 0; i < pw; i++) {
      const o = j * pw + i; if (!IN[o] || SD[rowM + i] > 1 - wall) continue;
      let a = N[o], b = N[o], c = 0, ws = 1;
      for (let sg = 1; sg >= -1; sg -= 2) {
        let x = i + 0.5, y = j + 0.5, px = DX[o] * sg, py = DY[o] * sg;
        for (let k = 1; k <= NS; k++) {
          x += px; y += py; if (x < 0 || y < 0 || x >= pw || y >= ph) break;
          const oo = (y | 0) * pw + (x | 0); if (!IN[oo]) break;
          const nv = N[oo]; a += Hn[k] * nv; b += Hc[k] * nv; c += sg * Hs[k] * nv; ws += Hn[k];
          let nx = DX[oo], ny = DY[oo]; if (nx * px + ny * py < 0) { nx = -nx; ny = -ny; }
          px = nx; py = ny;
        }
      }
      A[o] = a / ws; B[o] = b / ws; C[o] = c / ws;
      sa += A[o] * A[o]; sb += B[o] * B[o] + C[o] * C[o]; cnt++;
    }
  }
  const gA = 1 / (2.2 * Math.sqrt(sa / (cnt || 1)) + 1e-6), gB = 1 / (1.9 * Math.sqrt(sb / (2 * (cnt || 1))) + 1e-6);
  // 4. colour: temperature ramp (orange against the walls, white-hot down the core), and the four flow overlays
  const bp = new Uint8ClampedArray(n * 4), bn = new Uint8ClampedArray(n * 4), cp = new Uint8ClampedArray(n * 4), cn = new Uint8ClampedArray(n * 4);
  const put = (arr, k, v, al) => {
    if (v > 0) { const a = v > 1 ? 1 : v; arr[k] = 255; arr[k + 1] = 246; arr[k + 2] = 205; arr[k + 3] = Math.pow(a, 1.25) * 150 * al; }
    else { const a = v < -1 ? 1 : -v; arr[k] = 178; arr[k + 1] = 52; arr[k + 2] = 6; arr[k + 3] = a * 112 * al; }
  };
  const coreW = 7 * Uc;
  heat = L.pixelCanvas(rw, rh, (d) => {
    for (let j = 0; j < ph; j++) {
      const y = ry0 + (j + 0.5) / q, rowM = (j + oj) * mwq + oi;
      for (let i = 0; i < pw; i++) {
        const om = rowM + i, dd = -SD[om] - wall; if (!(dd > -0.85)) continue;
        const o = j * pw + i, k = o * 4, x = rx0 + (i + 0.5) / q;
        const al = c01(0.5 + dd * q * 0.6), e = sstep(0, coreW, dd), env = sstep(0, 2.2 * Uc, dd);
        const gx = SD[om + 2] - SD[om - 2], gy = SD[om + 2 * mwq] - SD[om - 2 * mwq], gl = Math.hypot(gx, gy) || 1, lit = (gx + gy) / gl * SQ;
        const edge = 1 - sstep(0.2, 3.3 * Uc, dd);         // the top-left wall shades the liquid under it; the lower-right shore catches a little light
        const nL = nz.fbm(x / 120 + 3.1, y / 120 - 1.7, 2), nS = nz.n2(x / 19 + 9, y / 19 - 4);
        const As = Math.max(-1, Math.min(1, A[o] * gA)) * env;
        let T = 0.52 + 0.38 * e + 0.12 * nL + 0.05 * nS + 0.1 * As + (lit < 0 ? -0.26 : 0.06) * lit * lit * edge - 0.17 * (1 - sstep(0, 0.9, dd));
        T = T < 0 ? 0 : T > 1 ? 1 : T;
        const li = ((T * 1023) | 0) * 3;
        d[k] = lut[li]; d[k + 1] = lut[li + 1]; d[k + 2] = lut[li + 2]; d[k + 3] = al * 255;
        const vb = B[o] * gB * env, vc = C[o] * gB * env;
        put(bp, k, vb, al); put(bn, k, -vb, al); put(cp, k, vc, al); put(cn, k, -vc, al);
      }
    }
  });
  const mk = (arr) => L.pixelCanvas(rw, rh, (d) => { d.set(arr); });
  flows = { bp: mk(bp), bn: mk(bn), cp: mk(cp), cn: mk(cn) };
}

// ───────────────────────── oxide skins and dross ─────────────────────────
function buildSkins() {
  const { info, bb, sw, U, Uc, wall, gates, Rdir } = G, r = L.rng('h2skins');
  const ramp = L.makeRamp([[0, '#ffd88a'], [0.45, '#fb952c'], [1, '#b9430f']]);
  const discs = K.pack({ seed: 'h2skin', rmax: sw * 0.5, rmin: sw * 0.36, gap: 1 }).filter((p) => p.r > sw * 0.4);
  const chosen = [];
  info.chars.forEach((c, ci) => {
    const want = info.chars.length === 1 ? 7 : (ci % 2 === 0 ? 3 : 2);
    const list = discs.filter((p) => p.x >= c.x0 && p.x < c.x1).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k);
    let got = 0;
    for (const { p } of list) {
      if (got >= want) break;
      if (gates.some((gt) => Math.hypot(p.x - gt.x, p.y - gt.y1) < 44 * U) || chosen.some((s) => Math.hypot(p.x - s.x, p.y - s.y) < 84 * U)) continue;
      chosen.push(p); got++;
    }
  });
  skins = chosen.map((p, i) => {
    const nz = L.makeNoise('h2skin' + i), a = r.range(0.72, 1.18) * sw, b = r.range(0.3, 0.42) * sw, w = Math.ceil(a * 2 + 18), h = Math.ceil(b * 2 + 18);
    const c = L.pixelCanvas(w, h, (d, pw, ph, q) => {
      for (let j = 0; j < ph; j++) for (let ii = 0; ii < pw; ii++) {
        const px = (ii + 0.5) / q - w / 2, py = (j + 0.5) / q - h / 2;
        const f = 1 - Math.hypot(px / a, py / b) + 0.26 * nz.fbm(px / (a * 0.7) + 5, py / (a * 0.7) - 3, 2) + 0.05 * nz.n2(px / 2.2, py / 2.2);
        if (f <= 0) continue;
        const k = (j * pw + ii) * 4;
        const fe = f + 0.09 * nz.n2(px / 2.6 + 9, py / 2.6) + 0.04 * nz.n2(px / 0.9, py / 0.9 + 4);
        const al = sstep(0, 0.08, f), marg = sstep(0, 0.4, f), crust = sstep(0.35, 0.43, fe), deep = sstep(0.4, 0.9, f);   // wide glowing margin (film still translucent) → crisp edge of the thick crust
        const wr = nz.ridged(px / (sw * 0.36) + 7, py / (sw * 1.5) + 2, 2), wr2 = nz.ridged(px / (sw * 0.12) + 3, py / (sw * 0.8) - 5, 2);   // wrinkles lie across the flow
        const lite = (0.7 * sstep(0.5, 0.92, wr) + 0.6 * sstep(0.6, 0.95, wr2)) * crust, gap = 0.78 + 0.22 * wr;
        const crack = sstep(0.92, 0.985, nz.ridged(px / 30 - 8, py / 30 + 6, 2)) * crust;                                  // a few seams still glowing
        const cm = ramp(marg);
        let cr = (92 - 36 * deep) * gap + lite * 84, cg = (40 - 14 * deep) * gap + lite * 62, cb = (20 - 4 * deep) * gap + lite * 50;
        cr += (255 - cr) * crack * 0.85; cg += (150 - cg) * crack * 0.85; cb += (50 - cb) * crack * 0.85;
        const R = cm[0] + (cr - cm[0]) * crust, Gc = cm[1] + (cg - cm[1]) * crust, Bc = cm[2] + (cb - cm[2]) * crust;
        d[k] = R; d[k + 1] = Gc; d[k + 2] = Bc; d[k + 3] = al * (0.72 + 0.26 * crust) * 255;
      }
    });
    let dx = Math.cos(p.ang), dy = Math.sin(p.ang); if (dx * GX + dy * GY < 0) { dx = -dx; dy = -dy; }
    const off = r.range(-0.1, 0.1) * sw;
    return { c, x: p.x - dy * off, y: p.y + dx * off, dx, dy, ang: Math.atan2(dy, dx), grow: r.range(0.2, 0.34), late: r.range(0, 0.25), drift: r.range(7, 11) * Uc };
  });
  // dross: tiny dark specks riding the surface, each with a brighter wake on its lower-right
  const rs = L.rng('h2dross'); specks = [];
  for (let cnt = 0, tries = 0; cnt < 80 && tries < 8000; tries++) {
    const x = rs.range(bb.x0, bb.x1), y = rs.range(bb.y0, bb.y1); if (K.sdGlyph(x, y) > -(wall + 3.5)) continue;
    const an = K.strokeAngle(x, y, Rdir); let dx = Math.cos(an), dy = Math.sin(an); if (dx * GX + dy * GY < 0) { dx = -dx; dy = -dy; }
    specks.push({ x, y, dx, dy, s: rs.range(0.6, 1.7) * Math.sqrt(Uc), sq: rs.range(0.5, 0.85), rot: rs() * 3, al: rs.range(0.55, 0.9) }); cnt++;
  }
}

export default {
  name: '铜汁入范',
  init() {
    const st = RAMP.map(([t, c]) => [t, L.parseColor(c)]), ramp = L.makeRamp(st);
    lut = new Uint8ClampedArray(1024 * 3);
    for (let i = 0; i < 1024; i++) { const c = ramp(i / 1023); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
    G = layout();
    const M = buildMould();
    glowL = M.glow; base = buildBase(M.mould);
    buildMelt(M); buildSkins();
    work = L.makeCanvas(G.rw, G.rh);
  },
  draw(ctx, env, p) {
    const n = (env && env.frames) || 19, f = env && env.frame !== undefined ? env.frame : Math.round(p * (n - 1));
    const t = n > 1 ? f / (n - 1) : 0;
    const breath = 0.5 + 0.5 * Math.sin(t * TAU * 0.85 + 0.5);          // slow rise and fall of the melt's brightness
    const phi = 0.7 + TAU * 0.9 * t, kb = Math.cos(phi), kc = -Math.sin(phi), travel = 12.5 * G.Uc * 0.9 * t;   // flow lines creep ~11 px down the strokes
    const { mx0, my0, rx0, ry0, rw, rh } = G;
    ctx.drawImage(base, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7 + 0.3 * breath; ctx.drawImage(glowL, mx0, my0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(heat, rx0, ry0);
    ctx.globalAlpha = Math.abs(kb); ctx.drawImage(kb >= 0 ? flows.bp : flows.bn, rx0, ry0);
    ctx.globalAlpha = Math.abs(kc); ctx.drawImage(kc >= 0 ? flows.cp : flows.cn, rx0, ry0);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.03 + 0.15 * breath; ctx.drawImage(heat, rx0, ry0);
    ctx.restore();
    // dross and oxide skins ride the surface: drawn on a work canvas and cut to the liquid with the melt's own alpha
    const w = work.getContext('2d');
    w.setTransform(1, 0, 0, 1, 0, 0); w.globalCompositeOperation = 'source-over'; w.globalAlpha = 1; w.clearRect(0, 0, rw, rh);
    for (const s of specks) {
      const x = s.x - rx0 + s.dx * travel, y = s.y - ry0 + s.dy * travel;
      w.fillStyle = 'rgba(255,246,206,0.6)'; w.beginPath(); w.ellipse(x + 0.5, y + 0.5, s.s * 1.3, s.s * s.sq * 1.2, s.rot, 0, TAU); w.fill();
      w.fillStyle = `rgba(74,26,8,${s.al.toFixed(3)})`; w.beginPath(); w.ellipse(x, y, s.s, s.s * s.sq, s.rot, 0, TAU); w.fill();
    }
    for (const s of skins) {
      const g = L.clamp((t - s.late * 0.3) / (1 - s.late * 0.3)), sc = 1 - s.grow * (1 - g);
      w.save(); w.translate(s.x - rx0 + s.dx * s.drift * t, s.y - ry0 + s.dy * s.drift * t); w.rotate(s.ang); w.scale(sc, sc);
      w.globalAlpha = 0.82 + 0.18 * g; w.drawImage(s.c, -s.c.width / 2, -s.c.height / 2); w.restore();
    }
    w.globalAlpha = 1; w.globalCompositeOperation = 'destination-in'; w.drawImage(heat, 0, 0);
    w.globalCompositeOperation = 'source-over';
    ctx.drawImage(work, rx0, ry0);
  },
};
