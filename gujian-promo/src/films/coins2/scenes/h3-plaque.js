// h3 — 金字牌匾: an old shop's name board seen square-on. Black lacquer ground (crazed, with the planks' grain telegraphing through),
// the film's glyph as RAISED, GILDED relief characters (K.sdGlyph is the height field: rounded bevel, slightly domed face), a moulded
// frame (rosewood band, vermilion cove, gilt bead) with brass corner plates, hung on a grey brick wall.
// The whole picture is one height field + material maps, built once at device resolution. A raking light travels from the left to the
// upper left / top over the shot: init() relights the scene for NK light positions (diffuse, two specular lobes, cast shadows swept
// through the height field), draw() cross-fades the two nearest of them and pushes in very slightly.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const PAD = 5, W = S + PAD * 2, C = S / 2;              // the layer is W × W logical px; frame (0, 0) sits at layer (PAD, PAD)
const NK = 8;                                            // light positions rendered in init
const BW = 46, LA = 132, TIP = 17;                       // brass corner plate (design px): width across the rail, arm length, depth of the scalloped end
const RIV = [11, 11, 11, 76, 76, 11, 37, 52, 37, 100, 52, 37, 100, 37];   // rivets: (distance from the vertical edge, from the horizontal edge)
let keys = null;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const mixn = (a, b, t) => a + (b - a) * t;

/** fast tiling value noise → [-1, 1] */
function makeVN(seed) {
  const r = L.rng(seed), t = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) t[i] = r() * 2 - 1;
  return (x, y) => {
    const xf = Math.floor(x), yf = Math.floor(y); let a = x - xf, b = y - yf;
    a = a * a * (3 - 2 * a); b = b * b * (3 - 2 * b);
    const x0 = xf & 255, x1 = (xf + 1) & 255, y0 = (yf & 255) << 8, y1 = ((yf + 1) & 255) << 8;
    const p = t[y0 + x0], q = t[y0 + x1], u = t[y1 + x0], v = t[y1 + x1];
    return (p + (q - p) * a) * (1 - b) + (u + (v - u) * a) * b;
  };
}
function blur121(a, w, h, passes) {
  const t = new Float32Array(Math.max(w, h));
  for (let n = 0; n < passes; n++) {
    for (let j = 0; j < h; j++) {
      const o = j * w; for (let i = 0; i < w; i++) t[i] = a[o + i];
      for (let i = 1; i < w - 1; i++) a[o + i] = (t[i - 1] + 2 * t[i] + t[i + 1]) * 0.25;
    }
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) t[j] = a[j * w + i];
      for (let j = 1; j < h - 1; j++) a[j * w + i] = (t[j - 1] + 2 * t[j] + t[j + 1]) * 0.25;
    }
  }
}

// ───────────────────────── layout: everything hangs off the glyph ─────────────────────────
function layout() {
  const info = K.glyphInfo(), bb = info.bbox, sw = info.strokeWidth, U = sw / 28;      // U: design px → logical px
  const mx = 24 * U, my = 80 * U, fw = 60 * U;                                        // lacquer margins round the characters, width of the frame
  const FX0 = bb.x0 - mx, FX1 = bb.x1 + mx, FY0 = bb.y0 - my, FY1 = bb.y1 + my;
  return { bb, sw, U, fw, FX0, FX1, FY0, FY1, OX0: FX0 - fw, OX1: FX1 + fw, OY0: FY0 - fw, OY1: FY1 + fw, ZF: 22 * U };
}

// ───────────────────────── hairline detail, painted as vectors and read back as bump / tint maps ─────────────────────────
// channel R = fine ridges, G = fine grooves, B = tint. Canvas A: lacquer, frame, brass. Canvas B: the gold only.
function paintDetail(G) {
  const { bb, U, FX0, FX1, FY0, FY1, OX0, OX1, OY0, OY1 } = G;
  const RED = '255,0,0', GRN = '0,255,0', BLU = '0,0,255', TAU = Math.PI * 2;
  const mk = () => {
    const c = L.makeCanvas(W, W), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    g.translate(PAD, PAD); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    return [c, g];
  };
  const line = (g, pts, col, a, lw) => {
    g.strokeStyle = `rgba(${col},${a.toFixed(3)})`; g.lineWidth = lw; g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  // ── A: lacquer field ──
  const [ca, ga] = mk(); let r = L.rng('h3-lacquer');
  const fwid = FX1 - FX0, fhgt = FY1 - FY0;
  ga.save(); ga.beginPath(); ga.rect(FX0, FY0, fwid, fhgt); ga.clip();
  const nJ = Math.max(1, Math.round(fhgt / (150 * U)) - 1);                            // joints between the planks of the board
  for (let k = 1; k <= nJ; k++) {
    let y = FY0 + fhgt * (k / (nJ + 1)) + r.range(-14, 14) * U; const pts = [];
    for (let x = FX0 - 4; x <= FX1 + 12; x += 12 * U) { y += r.gauss() * 0.22 * U; pts.push(x, y); }
    line(ga, pts, RED, 0.4, 1.6 * U); line(ga, pts, GRN, 0.9, 0.75);
  }
  for (let x0 = FX0 + r() * 6 * U; x0 < FX1; x0 += r.range(4.5, 10.5) * U) {                // 断纹: fine, close hairlines across the grain (蛇腹断)
    let y = FY0 - r() * 60 * U;
    while (y < FY1) {
      const len = r.range(22, 125) * U, st = 4 * U, pts = []; let x = x0 + r.range(-2.5, 2.5) * U, vx = r.range(-0.08, 0.08);
      for (let s = 0; s <= len; s += st) { pts.push(x, y + s); vx = vx * 0.84 + r.gauss() * 0.11; x += vx * st; }
      const a = r.range(0.2, 0.62);
      line(ga, pts, GRN, a, r.range(0.42, 0.62));
      line(ga, pts.map((v, i) => (i & 1 ? v : v + 0.75)), RED, a * 0.55, 0.5);          // the lip that catches the light
      y += len + r.range(4, 46) * U;
    }
  }
  const nH = Math.round(fwid * fhgt / (400 * U * U));                                  // 牛毛: hairs that link them
  for (let k = 0; k < nH; k++) {
    const x = FX0 + r() * fwid, y = FY0 + r() * fhgt, len = r.range(3, 10) * U;
    const a = r.chance(0.75) ? r.gauss() * 0.35 : Math.PI / 2 + r.gauss() * 0.5;
    line(ga, [x, y, x + Math.cos(a) * len, y + Math.sin(a) * len], GRN, r.range(0.15, 0.45), r.range(0.38, 0.5));
  }
  for (let k = 0; k < 54; k++) {                                                       // handling scratches, faintly paler
    const x = FX0 + r() * fwid, y = FY0 + r() * fhgt, len = r.range(20, 150) * U, a = r() * TAU, b = r.range(-0.12, 0.12);
    const pts = [x, y, x + Math.cos(a + b) * len * 0.5, y + Math.sin(a + b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len];
    line(ga, pts, BLU, r.range(0.10, 0.3), 0.55); line(ga, pts, GRN, r.range(0.08, 0.2), 0.5);
  }
  ga.restore();
  // rosewood band of the top and bottom rails: pores as short dashes along the grain
  r = L.rng('h3-wood');
  for (const y0 of [OY0, OY1 - 28 * U]) {
    for (let k = 0; k < 1500; k++) {
      const x = OX0 + r() * (OX1 - OX0), y = y0 + r() * 28 * U, len = r.range(3, 16) * U;
      line(ga, [x, y, x + len, y + r.range(-0.4, 0.4)], r.chance(0.8) ? GRN : RED, r.range(0.2, 0.6), r.range(0.4, 0.6));
    }
  }
  // vermilion cove: short hair cracks across it
  for (let k = 0; k < 760; k++) {
    const horiz = k < 520, t = r.range(29, 45) * U, len = r.range(4, 13) * U, w = r.range(-1.5, 1.5);
    if (horiz) {
      const x = OX0 + r() * (OX1 - OX0), y = r.chance(0.5) ? OY0 + t : OY1 - t;
      line(ga, [x, y - len / 2, x + w, y + len / 2], GRN, r.range(0.25, 0.6), 0.5);
    } else {
      const y = OY0 + r() * (OY1 - OY0), x = r.chance(0.5) ? OX0 + t : OX1 - t;
      line(ga, [x - len / 2, y, x + len / 2, y + w], GRN, r.range(0.25, 0.6), 0.5);
    }
  }
  // brass corner plates: years of scratches (clipped to the two arms of each plate)
  r = L.rng('h3-brass');
  for (const cx of [OX0, OX1]) for (const cy of [OY0, OY1]) {
    const dx = cx === OX0 ? 1 : -1, dy = cy === OY0 ? 1 : -1, la = LA * U, bw = BW * U;
    ga.save(); ga.beginPath();
    ga.rect(Math.min(cx, cx + dx * la), Math.min(cy, cy + dy * bw), la, bw); ga.rect(Math.min(cx, cx + dx * bw), Math.min(cy, cy + dy * la), bw, la);
    ga.clip();
    for (let k = 0; k < 420; k++) {
      const x = cx + dx * r() * la, y = cy + dy * r() * la, len = r.range(4, 46) * U * (r.chance(0.1) ? 2 : 1), a = r.chance(0.5) ? r.gauss() * 0.5 : r() * TAU;
      const pts = [x, y, x + Math.cos(a) * len, y + Math.sin(a) * len], al = r.range(0.15, 0.6);
      line(ga, pts, GRN, al, r.range(0.4, 0.7)); if (r.chance(0.45)) line(ga, pts, BLU, al * 0.8, 0.8);
    }
    ga.restore();
  }
  // ── B: the gold leaf ──
  const [cb, gb] = mk(); r = L.rng('h3-leaf');
  const x0 = bb.x0 - 4, y0 = bb.y0 - 4, bw = bb.x1 - bb.x0 + 8, bh = bb.y1 - bb.y0 + 8, LS = 46 * U;
  for (let yy = y0 - r() * LS; yy < y0 + bh; yy += LS) {                               // the leaves, laid in overlapping squares: each a shade of its own, seams between
    const ya = yy + r.range(-2, 2), yb = yy + r.range(-2, 2); let xx = x0 - r() * LS;
    while (xx < x0 + bw) {
      const wd = LS * r.range(0.82, 1.18), xa = xx + r.range(-3, 3), xb = xx + r.range(-3, 3);
      gb.fillStyle = `rgba(0,0,255,${(r() * r() * 0.42).toFixed(3)})`; gb.fillRect(xx, yy, wd, LS);
      line(gb, [xa, yy, xb, yy + LS], RED, 0.2, 0.8); line(gb, [xa + 0.8, yy, xb + 0.8, yy + LS], BLU, 0.18, 1.8);
      xx += wd;
    }
    line(gb, [x0, ya, x0 + bw, yb], RED, 0.2, 0.8); line(gb, [x0, ya + 0.8, x0 + bw, yb + 0.8], BLU, 0.18, 1.8);
  }
  const nW = Math.round(bw * bh / (90 * U * U));                                       // 箔纹: tiny wrinkles where the leaf was pressed down
  for (let k = 0; k < nW; k++) {
    const x = x0 + r() * bw, y = y0 + r() * bh, len = r.range(2.5, 11) * U, a = r() * TAU, b = r.range(-0.5, 0.5);
    line(gb, [x, y, x + Math.cos(a + b) * len * 0.5, y + Math.sin(a + b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len],
      r.chance(0.5) ? RED : GRN, r.range(0.12, 0.42), r.range(0.4, 0.6));
  }
  const nB = Math.round(bw * bh / (230 * U * U));                                      // 磨痕: burnishing strokes, mostly along the board
  for (let k = 0; k < nB; k++) {
    const x = x0 + r() * bw, y = y0 + r() * bh, len = r.range(10, 62) * U, a = r.gauss() * 0.16;
    line(gb, [x, y, x + Math.cos(a) * len, y + Math.sin(a) * len], GRN, r.range(0.10, 0.32), r.range(0.38, 0.5));
  }
  for (let k = 0; k < 60; k++) {                                                       // a few knocks that went through to the ground
    const x = x0 + r() * bw, y = y0 + r() * bh, len = r.range(4, 18) * U, a = r() * TAU, pts = [x, y, x + Math.cos(a) * len, y + Math.sin(a) * len];
    line(gb, pts, GRN, r.range(0.4, 0.8), 0.6); line(gb, pts, BLU, r.range(0.3, 0.7), 0.9);
  }
  return [L.getRaw(ca).data, L.getRaw(cb).data];
}

// ───────────────────────── height field + material maps (device resolution) ─────────────────────────
function buildMaps(G, da, db) {
  const { bb, sw, U, fw, FX0, FX1, FY0, FY1, OX0, OX1, OY0, OY1, ZF } = G;
  const q = L.SS, pw = Math.round(W * q), ph = pw, NPX = pw * ph, iq = 1 / q, iU = 1 / U, i255 = 1 / 255;
  const H = new Float32Array(NPX), MIC = new Float32Array(NPX);                        // macro height (casts shadows) / micro relief (normals only)
  const ALB = new Uint8ClampedArray(NPX * 3), MAT = new Uint8Array(NPX), GL = new Uint8ClampedArray(NPX);
  const vA = makeVN('h3-a'), vB = makeVN('h3-b'), vC = makeVN('h3-c');
  const hr = L.rng('h3-hash'), HT = new Float32Array(65536); for (let i = 0; i < 65536; i++) HT[i] = hr() * 2 - 1;
  const hash2 = (a, b) => HT[(((a * 73 + b * 151 + 7) & 255) << 8) | ((a * 29 + b * 59 + 3) & 255)];

  // ── the characters as relief: a short riser, a rounded bevel, a gently domed face ──
  const mg = 6;
  const rx0 = Math.max(0, Math.floor((bb.x0 - mg + PAD) * q)), rx1 = Math.min(pw, Math.ceil((bb.x1 + mg + PAD) * q));
  const ry0 = Math.max(0, Math.floor((bb.y0 - mg + PAD) * q)), ry1 = Math.min(ph, Math.ceil((bb.y1 + mg + PAD) * q));
  const rw = Math.max(1, rx1 - rx0), rh = Math.max(1, ry1 - ry0);
  const REL = new Float32Array(rw * rh), DEP = new Float32Array(rw * rh);
  const bev = 0.22 * sw, hT = 0.21 * sw, hD = 0.07 * sw, hS = 0.07 * sw, relMax = hT + hD + hS, dome = 1 / (0.36 * sw);
  for (let j = 0, k = 0; j < rh; j++) {
    const y = (ry0 + j + 0.5) * iq - PAD;
    for (let i = 0; i < rw; i++, k++) DEP[k] = -K.sdGlyph((rx0 + i + 0.5) * iq - PAD, y);
  }
  blur121(DEP, rw, rh, 6 * q);                                                         // the raw field is stepped (it comes from a bitmap): unsmoothed it ribs the bevel
  for (let k = 0; k < REL.length; k++) {
    const d = DEP[k];
    if (d > -0.4) {
      let v = hS * sm((d + 0.4) / 0.8);
      if (d > 0) { const t = d < bev ? d / bev : 1; v += hT * (1 - Math.pow(1 - t, 1.8)) + hD * (1 - Math.exp(-d * dome)); }
      REL[k] = v;
    }
  }
  blur121(REL, rw, rh, 1);

  const CH = 66 * U, BL = 244 * U, JW = 7 * U, edgeW = 0.06 * sw;
  for (let j = 0, o = 0; j < ph; j++) {
    const y = (j + 0.5) * iq - PAD, dOy = Math.max(OY0 - y, y - OY1);
    for (let i = 0; i < pw; i++, o++) {
      const x = (i + 0.5) * iq - PAD, dOx = Math.max(OX0 - x, x - OX1), dO = dOx > dOy ? dOx : dOy;
      let h = 0, mic = 0, ar = 0, ag = 0, ab = 0, mat = 0, gl = 0;
      const o4 = o * 4;
      if (dO > 0) {
        // ── grey brick wall ──
        const yy = y + 4000 * U + 21, c = Math.floor(yy / CH), v = yy - c * CH;
        const xx = x + 3000 * U + ((c & 1) ? BL * 0.5 : 0) + hash2(c, 5) * 30 * U, b = Math.floor(xx / BL), uu = xx - b * BL;
        const ex = Math.min(uu, BL - uu) - JW * 0.5, ey = Math.min(v, CH - v) - JW * 0.5;
        const n1 = vA(x / 5.2, y / 3.4), n2 = vB(x / 1.5, y / 1.3), n3 = vC(x / 13, y / 11), nBig = vA(x / 150 + 40, y / 110 + 7);
        const e = (ex < ey ? ex : ey) + n3 * 1.3 * U;                                  // > 0 on the brick; the arris wanders a little
        const hb = hash2(b, c), hb2 = hash2(b + 31, c + 17);
        const kb = clamp01(e / 0.7 + 0.5);                                             // brick ↔ mortar
        const s = e < 3.4 * U ? (e > 0 ? e / (3.4 * U) : 0) : 1;
        let chip = 0; if (e > 0 && e < 9 * U && n3 > 0.3) chip = (n3 - 0.3) * (1 - e / (9 * U)) * 3;
        const hBrick = (-2.3 * (1 - s) * (1 - s) + hb * 0.5 - chip) * U, hMort = (-2.5 + 0.45 * n3) * U;
        h = mixn(hMort, hBrick, kb);
        const drag = vC(x / 46 + hb * 9, y / 2.3);
        mic = mixn(0.34 * n2 + 0.3 * n1, 0.26 * n1 + 0.15 * n2 + 0.16 * drag, kb);
        const tb = 1 + 0.13 * hb + 0.17 * nBig + 0.07 * n2 + 0.05 * n1 + 0.04 * drag - 0.2 * chip, tm = 1 + 0.12 * n2 + 0.14 * nBig;
        ar = mixn(126 * tm, (95 + 7 * hb2) * tb, kb); ag = mixn(122 * tm, (98 + 3 * hb2) * tb, kb); ab = mixn(112 * tm, (98 - 5 * hb2) * tb, kb);
        const dd = Math.hypot(dOx > 0 ? dOx : 0, dOy > 0 ? dOy : 0);                    // grime where the board meets the wall
        if (dd < 18 * U) { const a = 0.58 + 0.42 * dd / (18 * U); ar *= a; ag *= a; ab *= a; }
        mat = 0; gl = 60 * kb;
      } else if (-dO < fw) {
        // ── the frame ──
        const uu = -dO * iU;
        const ux = Math.min(x - OX0, OX1 - x), uy = Math.min(y - OY0, OY1 - y), horiz = uy <= ux;
        const sa = horiz ? x : y, ta = horiz ? y : x;                                  // along / across the rail
        const dR = da[o4] * i255, dG = da[o4 + 1] * i255, dB = da[o4 + 2] * i255;
        let pf, zone;
        if (uu < 22) { pf = 15; if (uu < 2.5) { const a = 1 - uu / 2.5; pf -= 2.2 * a * a; } zone = 0; }
        else if (uu < 28) { const a = (uu - 22) / 6; pf = 10 + 5 * (1 - Math.pow(a, 2.2)); zone = 1; }
        else if (uu < 46) { const a = 1 - (uu - 28) / 18; pf = 3.5 + 6.5 * a * a; zone = 2; }
        else if (uu < 55) { const a = uu - 50.5; pf = 3.5 + 0.95 * Math.sqrt(Math.max(0, 20.25 - a * a)); zone = 3; }
        else { pf = 2.2; zone = 4; }
        h = ZF + pf * U;
        const fine = vB(x / 1.3, y / 1.3);
        if (zone <= 1) {                                                               // 紫檀 band and ovolo
          const gr = 0.5 * vA(sa / 64, ta / 1.7) + 0.3 * vB(sa / 21, ta / 0.85) + 0.2 * vC(sa / 240, ta / 6);
          const tone = (1 + 0.34 * gr) * (1 - 0.4 * dG);
          let wr = 0; if (uu < 3.5) wr = 1 - uu / 3.5; else if (uu > 20.5 && uu < 25) wr = 1 - Math.abs(uu - 22.5) / 2.5;   // rubbed arrises
          wr *= 0.4 + 0.45 * vB(sa / 30, 7.7);
          ar = 68 * tone + 62 * wr; ag = 35 * tone + 40 * wr; ab = 31 * tone + 27 * wr;
          mic = 0.10 * gr + 0.04 * fine + (dR - dG) * 0.2;
          mat = 3; gl = 150 + 70 * wr;
        } else if (zone === 2) {                                                       // 朱漆 cove
          const tc = (uu - 28) / 18;
          const tone = (1 + 0.08 * vA(x / 44, y / 44) + 0.05 * vB(x / 2.2, y / 2.2)) * (1 - 0.4 * tc * tc) * (1 - 0.5 * dG);
          const lip = tc < 0.12 ? (1 - tc / 0.12) * (0.35 + 0.5 * vB(sa / 16, 3.3)) : 0;   // rubbed through to the dark ground on the arris
          ar = mixn(156 * tone, 46, lip); ag = mixn(31 * tone, 20, lip); ab = mixn(22 * tone, 15, lip);
          if (horiz && y > C) {                                                        // dust lying in the cove of the bottom rail
            const du = sm((tc - 0.3) / 0.5) * (0.26 + 0.12 * vB(x / 6, y / 3));
            ar = mixn(ar, 132, du); ag = mixn(ag, 120, du); ab = mixn(ab, 106, du);
          }
          mic = 0.02 * fine + dR * 0.1 - dG * 0.24;
          mat = 4; gl = 215;
        } else if (zone === 3) {                                                       // gilt bead, worn to the bole along its crest
          const a = Math.abs(uu - 50.5) / 4.5, w2 = vC(x / 2.3, y / 2.3);
          const worn = sm((vB(sa / 42, horiz ? 1.7 : 5.1) * 0.9 + w2 * 0.12 + 0.02 - a * 0.9) * 2.0) * 0.5, grime = a * a * 0.8;
          ar = mixn(mixn(222, 146, worn), 50, grime); ag = mixn(mixn(160, 70, worn), 30, grime); ab = mixn(mixn(52, 32, worn), 12, grime);
          mic = 0.05 * w2 + 0.03 * fine;
          mat = 2; gl = 185 - 90 * worn - 90 * grime;
        } else {                                                                       // inner fillet: black lacquer
          const tone = 1 + 0.08 * fine;
          ar = 40 * tone; ag = 31 * tone; ab = 26 * tone; mic = 0.012 * fine; mat = 1; gl = 180;
        }
        // brass corner plate, pressed over the band and the cove
        const axu = ux * iU, ayu = uy * iU;
        if (uu < BW && axu < LA && ayu < LA) {
          let sd = 1e9;
          if (ayu < BW) { const lobe = Math.pow(Math.abs(Math.cos(1.5 * Math.PI * (ayu / BW - 0.5))), 0.8); sd = Math.max(ayu - BW, (axu - (LA - TIP * (1 - lobe))) * 0.8); }
          if (axu < BW) { const lobe = Math.pow(Math.abs(Math.cos(1.5 * Math.PI * (axu / BW - 0.5))), 0.8); const s2 = Math.max(axu - BW, (ayu - (LA - TIP * (1 - lobe))) * 0.8); if (s2 < sd) sd = s2; }
          if (sd < 0) {
            const eB = -sd, edge = eB < 1.3 ? eB / 1.3 : 1;
            h += 2 * U * edge * (2 - edge);
            const sl = (eB - 4.6) / 0.6, groove = Math.exp(-sl * sl);                  // scribed border line
            let rmin = 1e9; for (let k = 0; k < RIV.length; k += 2) { const d = Math.hypot(axu - RIV[k], ayu - RIV[k + 1]); if (d < rmin) rmin = d; }
            const RR = 3.7; let crown = 0;
            if (rmin < RR) { const a = rmin / RR; h += 2.3 * U * Math.sqrt(1 - a * a); crown = 1 - a; }
            const ring = rmin >= RR && rmin < RR + 2.4 ? 1 - (rmin - RR) / 2.4 : 0;
            const t1 = vA(x / 34 + 3, y / 34), t2 = vB(x / 7, y / 7), t3 = vC(x / 1.6, y / 1.6);
            const rub = (zone === 1 ? 0.45 : 0) + crown * 0.9 + dG * 0.8 + (uu < 3 ? 0.4 : 0);
            const tarn = clamp01(0.4 + 0.36 * t1 + 0.1 * t2 + 0.55 * ring + (zone === 2 ? 0.22 : 0) + 0.3 * (1 - edge) + 0.5 * groove - rub);
            const verd = clamp01((t1 * 0.7 + t2 * 0.5 - 0.3) * 1.6) * tarn * 0.3;      // a breath of verdigris in the tarnish
            ar = mixn(mixn(210, 104, tarn), 86, verd) * (1 + 0.25 * dB); ag = mixn(mixn(164, 76, tarn), 96, verd) * (1 + 0.25 * dB); ab = mixn(mixn(80, 38, tarn), 62, verd) * (1 + 0.2 * dB);
            mic = 0.05 * t3 + 0.06 * t2 - 0.6 * groove + (dR - dG) * 0.2;
            mat = 5; gl = 225 - 150 * tarn + 22 * t3;
          } else if (sd < 2.2) { const a = 0.6 + 0.4 * sd / 2.2; ar *= a; ag *= a; ab *= a; }   // grime along the plate's edge
        }
      } else {
        // ── the lacquer field and the gilded characters ──
        const dF = -dO - fw;
        let rel = 0, dep = -99;
        if (i >= rx0 && i < rx1 && j >= ry0 && j < ry1) { const k = (j - ry0) * rw + (i - rx0); rel = REL[k]; dep = DEP[k]; }
        h = ZF + (0.5 * vA(x / 170 + 11, y / 95) + 0.22 * vB(x / 52, y / 36)) * U + rel;
        const cov = dep > 0.3 ? 1 : dep < -0.3 ? 0 : (dep + 0.3) / 0.6;                // gold ↔ lacquer
        let lr = 0, lg = 0, lb = 0, lm = 0, lgl = 0, gr_ = 0, gg_ = 0, gb_ = 0, gm = 0, ggl = 0;
        if (cov < 1) {
          const dR = da[o4] * i255, dG = da[o4 + 1] * i255, dB = da[o4 + 2] * i255;
          const g1 = vC(x / 110, y / 2.4), g2 = vA(x / 34, y / 1.15), o1 = vB(x / 1.4, y / 1.4);
          lm = (0.012 * g1 + 0.006 * g2 + 0.004 * o1) * U + 0.11 * dR - 0.2 * dG;     // grain telegraphing through, craquelure
          let tone = 1 + 0.10 * vA(x / 150 + 5, y / 80 + 9) + 0.05 * vB(x / 2.6, y / 2.6) + 0.04 * g1;
          const dull = sm((vB(x / 130 + 20, y / 90 + 3) - 0.1) * 2.2);                 // rubbed, dusty patches
          if (dep > -1.2 * U && dep <= 0.3) tone *= 0.8 + 0.2 * clamp01(-dep / (1.2 * U));   // a line of dirt at the foot of the characters
          if (dF < 6 * U) tone *= 0.64 + 0.36 * dF / (6 * U);
          tone *= 1 - 0.5 * dG;
          lr = 33 * tone + 5 * dull + 46 * dB; lg = 25 * tone + 5 * dull + 42 * dB; lb = 21 * tone + 6 * dull + 38 * dB;
          const ds = vC(x / 0.8 + 50, y / 0.8); if (ds > 0.8) { const a = (ds - 0.8) * 4 * (0.4 + dull); lr += 34 * a; lg += 31 * a; lb += 27 * a; }   // dust
          lgl = 215 - 80 * dull;
        }
        if (cov > 0) {
          const eR = db[o4] * i255, eG = db[o4 + 1] * i255, eB = db[o4 + 2] * i255;
          const hN = rel / relMax, d = dep > 0 ? dep : 0, edge = Math.exp(-d / edgeW);
          const n1 = vA(x / 48 + 2, y / 48 + 5), n2 = vB(x / 9, y / 9), n3 = vC(x / 2.1, y / 2.1), n4 = vB(x / 1.05, y / 1.05);
          gm = (0.045 * vA(x / 11, y / 11) + 0.03 * n4) * U + (eR - eG) * 0.16;       // the leaf follows the ground's tiny unevenness; wrinkles, strokes
          const bright = clamp01(0.16 + 0.85 * hN + 0.16 * n1 + 0.10 * n2 - 0.55 * eB);   // burnished bright on the high ground; each leaf its own shade
          const grime = clamp01(edge * (0.55 + 0.5 * n2)) * 0.6;                         // dark gold and a little lacquer in the foot of the bevel
          const bole = clamp01((n2 * 0.6 + n3 * 0.5 - 0.3) * 2.2) * edge * (1 - edge) * 4 * 0.5;        // red ground showing on the shoulder
          const pat = clamp01((-n1 * 0.9 + n2 * 0.35 + vA(x / 150 + 9, y / 60) * 0.5 - 0.1) * 1.5) * 0.42;   // duller, browner old gold in patches
          const lf = (1 - 0.22 * eB) * (1 + 0.2 * eG);
          gr_ = mixn(mixn(mixn(mixn(186, 232, bright) + 6 * n1, 156, pat), 138, bole), 74, grime) * lf;
          gg_ = mixn(mixn(mixn(mixn(126, 184, bright) - 5 * n1, 100, pat), 54, bole), 42, grime) * lf;
          gb_ = mixn(mixn(mixn(mixn(36, 80, bright) - 5 * n1, 34, pat), 24, bole), 14, grime) * lf;
          ggl = 100 + 150 * hN - 150 * grime + 25 * n3 - 70 * pat - 60 * eB;
        }
        mic = mixn(lm, gm, cov); ar = mixn(lr, gr_, cov); ag = mixn(lg, gg_, cov); ab = mixn(lb, gb_, cov);
        mat = cov > 0.5 ? 2 : 1; gl = cov > 0.5 ? ggl : lgl;
      }
      H[o] = h; MIC[o] = mic; const o3 = o * 3; ALB[o3] = ar; ALB[o3 + 1] = ag; ALB[o3 + 2] = ab; MAT[o] = mat; GL[o] = gl;
    }
  }
  // normals from macro + micro relief
  const NX = new Int16Array(NPX), NY = new Int16Array(NPX), gs = q * 0.5;
  for (let j = 0, o = 0; j < ph; j++) {
    const jm = j > 0 ? -pw : 0, jp = j < ph - 1 ? pw : 0;
    for (let i = 0; i < pw; i++, o++) {
      const im = i > 0 ? -1 : 0, ip = i < pw - 1 ? 1 : 0;
      const gx = (H[o + ip] + MIC[o + ip] - H[o + im] - MIC[o + im]) * gs, gy = (H[o + jp] + MIC[o + jp] - H[o + jm] - MIC[o + jm]) * gs;
      const il = 32767 / Math.sqrt(1 + gx * gx + gy * gy);
      NX[o] = -gx * il; NY[o] = -gy * il;
    }
  }
  return { H, NX, NY, ALB, MAT, GL, pw, ph, q };
}

// ───────────────────────── one relit picture for light position p ∈ [0, 1] ─────────────────────────
//                 wall  lacquer gold  wood  red   brass
const KD = [1.00, 1.00, 0.55, 1.00, 1.00, 0.55];        // diffuse
const KW = [0.00, 0.00, 0.42, 0.10, 0.06, 0.48];        // wide satin lobe (tinted by the material)
const KS = [0.04, 0.55, 1.60, 0.30, 0.60, 1.20];        // tight highlight
const NS = [6, 46, 12, 18, 30, 12];                     // … and its sharpness
const MET = [0, 0, 1, 0, 0, 1];                         // metal: the highlight takes the material's colour
const SHN = [0, 1, 4.2, 0.15, 0.6, 3.2];                // the soft streak of reflected light that glides over glossy surfaces (metals: × their own colour)
const AMBM = [1, 0.85, 0.9, 1, 1, 0.95];
function renderKey(M, p, LUT, DN) {
  const { H, NX, NY, ALB, MAT, GL, SH, SD, pw, ph, q } = M;
  const iq = 1 / q, INV = 1 / 32767;
  const ang = (195 + 63 * p) * Math.PI / 180, R = 1500 - 350 * p, Lz = 560 + 40 * p;   // the lamp: from the left → from above, a little to the left
  const Lx = C + Math.cos(ang) * R, Ly = C + Math.sin(ang) * R;
  const cxp = 260 + 640 * p, invR2 = 1 / (520 * 520), FLOOR = 0.34, I0 = 1.4, AMB = 0.24;   // the pool of light walks along the board
  const fx = 0.55, fy = 0.5, fz = 0.669;                                               // weak warm bounce from the lower right
  const sbA = -16 * Math.PI / 180, cb = Math.cos(sbA), sb = Math.sin(sbA), c0 = C * cb + C * sb - 400 + 800 * p, iw = 1 / 125, shA = 0.24;
  SH.set(H); SD.fill(0);
  const lxd = (Lx + PAD) * q - 0.5, lyd = (Ly + PAD) * q - 0.5;
  const jc = Math.min(ph, Math.max(0, Math.ceil(lyd))), ic = Math.min(pw, Math.max(0, Math.ceil(lxd)));
  return L.pixelCanvas(W, W, (data) => {
    for (let pass = 0; pass < 2; pass++) {                                             // rows, moving away from the light
      const j0 = pass === 0 ? jc : jc - 1, j1 = pass === 0 ? ph : -1, dj = pass === 0 ? 1 : -1;
      for (let j = j0; j !== j1; j += dj) {
        const y = (j + 0.5) * iq - PAD, dy = Ly - y, ady = dy < 0 ? -dy : dy, sy = dy < 0 ? -1 : 1;
        const oy = (j + sy < 0 || j + sy >= ph) ? 0 : sy * pw, py = y - C, dnRow = (j & 255) << 8;
        for (let half = 0; half < 2; half++) {
          const i0 = half === 0 ? ic : ic - 1, i1 = half === 0 ? pw : -1, di = half === 0 ? 1 : -1;
          for (let i = i0; i !== i1; i += di) {
            const o = j * pw + i, x = (i + 0.5) * iq - PAD, dx = Lx - x, adx = dx < 0 ? -dx : dx, sx = dx < 0 ? -1 : 1;
            const ox = (i + sx < 0 || i + sx >= pw) ? 0 : sx;
            const h = H[o], dz = Lz - h, dh = Math.sqrt(adx * adx + ady * ady);
            // cast shadow: carry the shadow's height one pixel further from the light
            let su, du, st;
            if (adx >= ady) { const f = ady / adx, o1 = o + ox, o2 = o1 + oy; su = SH[o1] + (SH[o2] - SH[o1]) * f; du = SD[o1] + (SD[o2] - SD[o1]) * f; st = Math.sqrt(1 + f * f) * iq; }
            else { const f = adx / ady, o1 = o + oy, o2 = o1 + ox; su = SH[o1] + (SH[o2] - SH[o1]) * f; du = SD[o1] + (SD[o2] - SD[o1]) * f; st = Math.sqrt(1 + f * f) * iq; }
            const sUp = su - st * dz / dh;
            let lit = 1;
            if (sUp > h) {
              const dd = du + st; SH[o] = sUp; SD[o] = dd;
              const s = (sUp - h) / (0.12 + 0.025 * dd);                                 // penumbra widens with the distance from the edge that casts it
              lit = s >= 1 ? 0 : 1 - s * s * (3 - 2 * s);
            }
            // light
            const il = 1 / Math.sqrt(dh * dh + dz * dz), lx = dx * il, ly = dy * il, lz = dz * il;
            const nx = NX[o] * INV, ny = NY[o] * INV, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
            let ndl = nx * lx + ny * ly + nz * lz; if (ndl < 0) ndl = 0;
            const px = x - cxp, r2 = (px * px + py * py) * invR2, pool = FLOOR + (1 - FLOOR) / ((1 + r2) * (1 + r2));
            const I = I0 * pool * lit;
            const m = MAT[o], gg = GL[o] * (1 / 255);
            let ndh = (nx * lx + ny * ly + nz * (lz + 1)) / Math.sqrt(2 + 2 * lz); if (ndh < 0) ndh = 0;
            const wide = ndh / (5 - 4 * ndh), nn = NS[m]; let tight = ndh / (nn - (nn - 1) * ndh); tight *= tight;
            let fill = nx * fx + ny * fy + nz * fz; fill = fill > 0 ? fill * 0.11 : 0;
            const ek = (KD[m] * ndl + KW[m] * wide * gg) * I, ea = (AMB + fill) * AMBM[m];
            const o3 = o * 3, ar = ALB[o3], ag = ALB[o3 + 1], ab = ALB[o3 + 2];
            let r = ar * (ea * 0.97 + ek * 1.04), g = ag * (ea + ek * 0.97), b = ab * (ea * 1.05 + ek * 0.87);
            const sp = KS[m] * gg * tight * I;
            if (sp > 0.002) {
              if (MET[m]) {
                const k = sp * 1.6; let t2 = ndh / (44 - 43 * ndh); t2 *= t2; const s2 = 1.5 * gg * t2 * I;   // … and a much tighter lobe: the bright core
                r += ar * k + 34 * sp + 255 * s2; g += ag * k + 30 * sp + 236 * s2; b += ab * k + 22 * sp + 180 * s2;
              }
              else { r += 255 * sp; g += 242 * sp; b += 216 * sp; }
            }
            const shn = SHN[m];
            if (shn > 0) {
              let wv = nx * cb + ny * sb; wv = wv < -0.22 ? -0.22 : wv > 0.22 ? 0.22 : wv;
              const t = (x * cb + y * sb - c0 + wv * 2400) * iw;
              const s = (0.2 + (t > -2.6 && t < 2.6 ? Math.exp(-t * t) : 0)) * shA * shn * gg * (0.3 + 0.7 * lit);
              if (MET[m]) { r += ar * s; g += ag * s; b += ab * s; } else { r += 150 * s; g += 158 * s; b += 170 * s; }
            }
            let mx = r > g ? r : g; if (b > mx) mx = b;                                // shoulder on the brightest channel: highlights keep their hue, the very core burns to white
            if (mx > 170) {
              const tm = LUT[mx >= 1023 ? 2046 : (mx * 2) | 0], k = tm / mx; r *= k; g *= k; b *= k;
              if (mx > 300) { let w = (mx - 300) * (1 / 700); if (w > 0.85) w = 0.85; r += (tm - r) * w; g += (tm - g) * w; b += (tm - b) * w; }
            }
            const dn = DN[dnRow | (i & 255)], k4 = o * 4;
            data[k4] = r + dn; data[k4 + 1] = g + dn; data[k4 + 2] = b + dn;
            data[k4 + 3] = 255;
          }
        }
      }
    }
  });
}

function build() {
  const G = layout();
  const [da, db] = paintDetail(G);
  const M = buildMaps(G, da, db);
  M.SH = new Float32Array(M.pw * M.ph); M.SD = new Float32Array(M.pw * M.ph);
  const LUT = new Float32Array(2048);                                                  // soft shoulder: values above 170 roll off towards white
  for (let i = 0; i < 2048; i++) { const v = i / 2; LUT[i] = v <= 170 ? v : 170 + 85 * (1 - Math.exp(-(v - 170) / 120)); }
  const dr = L.rng('h3-dither'), DN = new Float32Array(65536); for (let i = 0; i < 65536; i++) DN[i] = dr() - 0.5;
  const out = [];
  for (let k = 0; k < NK; k++) out.push(renderKey(M, k / (NK - 1), LUT, DN));
  return out;
}

export default {
  name: '金字牌匾',
  init() { keys = build(); },
  draw(ctx, env, p) {
    const pp = clamp01(p), t = pp * (NK - 1), i0 = Math.min(NK - 2, Math.floor(t)), f = t - i0, z = 0.992 + 0.016 * pp;   // a very slight push-in
    ctx.save();
    ctx.translate(C, C); ctx.scale(z, z);
    ctx.drawImage(keys[i0], -W / 2, -W / 2);
    if (f > 0.003) { ctx.globalAlpha = f; ctx.drawImage(keys[i0 + 1], -W / 2, -W / 2); }
    ctx.restore();
  },
};
