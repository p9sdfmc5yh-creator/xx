// p05 — 方孔圆钱规制图: a copper-plate line engraving of a square-holed round coin — plan above, section below,
// heavy black outlines, fine hatched shading (light from the top-left), leader lines and four small regular-script labels:
// 外郭 (raised outer rim), 内郭 (raised square frame round the hole), 肉 (the flat field between), 穿 (the hole itself).
// Slow plate: one oversize pre-rendered layer, the camera drifts slowly to the right.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const W = 1400;                                  // layer size (160 px of bleed all round)
const INK = '#100f0e';
const CX = 596, CY = 546, R = 322;               // plan view
const RW = 30;                                   // outer rim width
const HA = 90, HB = 118;                         // hole half-side, inner-rim outer half-side
const SY = 1022;                                 // section centre line
let layer = null;

const seg = (g, x0, y0, x1, y1, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };

function dashLine(g, x0, y0, x1, y1, pattern, w) {
  g.save(); g.setLineDash(pattern); g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
}

// ── plan view ──────────────────────────────────────────────────────────────────────────────────────────────
function drawPlan(g) {
  const r = L.rng('p05plan');
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'butt';
  const LD = Math.PI / 4;                        // direction the shadows fall (towards the lower right)
  const lx = Math.SQRT1_2, ly = Math.SQRT1_2;

  // 1 · cast shadow of the whole coin on the paper: concentric arcs outside the lower-right edge
  for (let k = 0; k < 6; k++) {
    const rr = R + 6 + k * 4.6;
    for (let t = LD - 1.25; t < LD + 1.25; t += 5 / rr) {
      const sh = Math.cos((t - LD) * 1.25) * (1 - k / 6.2);
      if (sh < 0.06) continue;
      g.lineWidth = 0.45 + 1.7 * sh * sh;
      g.beginPath(); g.arc(CX, CY, rr, t, t + 5.4 / rr); g.stroke();
    }
  }

  // 2 · the field (肉): fine concentric tint lines, swelling where the two rims throw their shadows
  for (let rr = HA + 6; rr < R - RW; rr += 4.4) {
    const dt = 4.2 / rr;
    for (let t = 0; t < TAU; t += dt) {
      const x = CX + Math.cos(t + dt / 2) * rr, y = CY + Math.sin(t + dt / 2) * rr;
      const dx = x - CX, dy = y - CY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < HB + 1.5) continue;
      let sh = 0;
      for (let k = 2; k <= 30; k += 2) {                                     // shadow of the outer rim (falls inward at the upper left)
        if (Math.hypot(dx - lx * k, dy - ly * k) > R - RW) { sh = Math.max(sh, 1 - k / 30); break; }
      }
      for (let k = 2; k <= 26; k += 2) {                                     // shadow of the inner rim (falls outward at the lower right)
        if (Math.max(Math.abs(dx - lx * k), Math.abs(dy - ly * k)) < HB) { sh = Math.max(sh, 1 - k / 26); break; }
      }
      const broad = 0.5 + 0.5 * Math.cos(t - LD);                            // a very slight overall turn of the surface
      g.globalAlpha = 0.72 + 0.28 * sh;
      g.lineWidth = 0.62 + 0.26 * broad + 2.1 * sh * sh + r.range(-0.05, 0.05);
      g.beginPath(); g.arc(CX, CY, rr, t, t + dt * 1.04); g.stroke();
    }
  }
  g.globalAlpha = 1;
  // a few burnished wear scratches across the field (short engraved flicks)
  for (let i = 0; i < 46; i++) {
    const t = r() * TAU, rr = r.range(HB * 1.5, R - RW - 14), x = CX + Math.cos(t) * rr, y = CY + Math.sin(t) * rr;
    if (Math.max(Math.abs(x - CX), Math.abs(y - CY)) < HB + 12) continue;
    const a = t + Math.PI / 2 + r.range(-0.5, 0.5), len = r.range(5, 16);
    g.globalAlpha = r.range(0.35, 0.7);
    seg(g, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, r.range(0.5, 0.9));
  }
  g.globalAlpha = 1;

  // 3 · outer rim (外郭): a rounded ridge — radial ticks on its two slopes, dark where each slope turns from the light
  for (let t = 0; t < TAU; t += 3.5 / R) {
    const c = Math.cos(t), s = Math.sin(t), q = Math.cos(t - LD);
    const so = 0.5 + 0.5 * q, si = 0.5 - 0.5 * q;                            // outer slope / inner slope
    if (so > 0.16) { g.lineWidth = 0.4 + 1.65 * so * so; g.beginPath(); g.moveTo(CX + c * (R - 3), CY + s * (R - 3)); g.lineTo(CX + c * (R - RW / 2 - 1 + (1 - so) * 6), CY + s * (R - RW / 2 - 1 + (1 - so) * 6)); g.stroke(); }
    if (si > 0.16) { g.lineWidth = 0.4 + 1.65 * si * si; g.beginPath(); g.moveTo(CX + c * (R - RW + 2.5), CY + s * (R - RW + 2.5)); g.lineTo(CX + c * (R - RW / 2 + 1 - (1 - si) * 6), CY + s * (R - RW / 2 + 1 - (1 - si) * 6)); g.stroke(); }
  }
  g.lineWidth = 6.4; g.beginPath(); g.arc(CX, CY, R, 0, TAU); g.stroke();
  g.lineWidth = 3.0; g.beginPath(); g.arc(CX, CY, R - RW, 0, TAU); g.stroke();
  g.lineWidth = 0.8; g.globalAlpha = 0.8; g.beginPath(); g.arc(CX, CY, R - RW / 2, 0, TAU); g.stroke(); g.globalAlpha = 1;
  // thicker shade line on the shadow side of the outline (engraver's convention)
  g.lineWidth = 3.2; g.beginPath(); g.arc(CX, CY, R + 2.2, LD - 1.2, LD + 1.2); g.stroke();
  g.lineWidth = 2.2; g.beginPath(); g.arc(CX, CY, R - RW - 1.4, LD + Math.PI - 1.15, LD + Math.PI + 1.15); g.stroke();

  // 4 · inner rim (内郭): square ridge with mitred corners, ticks square to each side
  const mid = (HA + HB) / 2;
  const sides = [[0, -1, 0.14, 0.9], [1, 0, 0.9, 0.14], [0, 1, 0.9, 0.14], [-1, 0, 0.14, 0.9]];   // normal, shade of outer slope, shade of inner slope
  for (const [nx, ny, so, si] of sides) {
    const tx = -ny, ty = nx;                                                 // along the side
    for (let u = -HB; u <= HB; u += 3.6) {
      const au = Math.abs(u);
      for (const [d0, d1, sh] of [[mid + 1, HB - 2.5, so], [HA + 2.5, mid - 1, si]]) {
        const a0 = Math.max(d0, au), a1 = d1;                                // mitre: stay outside the diagonal
        if (a1 - a0 < 1.5) continue;
        const e0 = sh > 0.5 ? a0 : a0 + (d0 === mid + 1 ? 0 : 0), e1 = sh > 0.5 ? a1 : (d0 === mid + 1 ? a0 + (a1 - a0) * 0.55 : a1);
        const b0 = sh > 0.5 ? e0 : (d0 === mid + 1 ? e0 : a1 - (a1 - a0) * 0.55);
        g.lineWidth = 0.4 + 1.5 * sh * sh;
        g.beginPath(); g.moveTo(CX + tx * u + nx * b0, CY + ty * u + ny * b0); g.lineTo(CX + tx * u + nx * e1, CY + ty * u + ny * e1); g.stroke();
      }
    }
  }
  g.lineJoin = 'miter';
  g.lineWidth = 3.8; g.strokeRect(CX - HB, CY - HB, HB * 2, HB * 2);
  g.lineWidth = 0.8; g.globalAlpha = 0.8; g.strokeRect(CX - mid, CY - mid, mid * 2, mid * 2); g.globalAlpha = 1;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) seg(g, CX + sx * HA, CY + sy * HA, CX + sx * HB, CY + sy * HB, 1.1);   // mitre lines
  // shade lines on the lower / right outer edge
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(CX + HB + 2, CY - HB + 6); g.lineTo(CX + HB + 2, CY + HB + 2); g.lineTo(CX - HB + 6, CY + HB + 2); g.stroke();

  // 5 · the hole (穿): bare paper, with the shadow of its upper and left walls hatched in
  g.save(); g.beginPath(); g.rect(CX - HA, CY - HA, HA * 2, HA * 2); g.clip();
  for (let c = -HA * 2; c <= HA * 2; c += 4.3) {                             // lines running lower-left → upper-right (x − y = const reversed)
    for (let u = -HA; u < HA; u += 4) {
      const x = c / 2 + u + 2, y = c / 2 - u - 2;                            // midpoint of this piece, relative to the centre
      if (Math.abs(x) > HA || Math.abs(y) > HA) continue;
      let sh = 0;
      for (let k = 2; k <= 34; k += 2) if (Math.max(Math.abs(x - lx * k), Math.abs(y - ly * k)) > HA) { sh = 1 - k / 34; break; }
      if (sh < 0.05) continue;
      g.lineWidth = 0.4 + 1.9 * sh * sh;
      g.beginPath(); g.moveTo(CX + c / 2 + u, CY + c / 2 - u); g.lineTo(CX + c / 2 + u + 4.2, CY + c / 2 - u - 4.2); g.stroke();
    }
  }
  g.restore();
  g.lineWidth = 5.4; g.strokeRect(CX - HA, CY - HA, HA * 2, HA * 2);

  // 6 · centre lines (chain-dotted), a centre mark, and the cutting-plane ticks
  g.globalAlpha = 0.85;
  dashLine(g, CX - R - 64, CY, CX + R + 64, CY, [26, 6, 4, 6], 1.1);
  dashLine(g, CX, CY - R - 64, CX, CY + R + 40, [26, 6, 4, 6], 1.1);
  g.globalAlpha = 1;
  g.lineWidth = 1.1; g.beginPath(); g.arc(CX, CY, 5, 0, TAU); g.stroke();
  for (const sx of [-1, 1]) {                                                // cutting-plane arrows at the ends of the horizontal centre line
    const x = CX + sx * (R + 64);
    seg(g, x, CY - 1, x, CY + 30, 3.4);
    g.beginPath(); g.moveTo(x, CY + 46); g.lineTo(x - 7, CY + 26); g.lineTo(x + 7, CY + 26); g.closePath(); g.fill();
  }
}

// ── section ────────────────────────────────────────────────────────────────────────────────────────────────
function sectionHalf(g, sx) {            // sx = −1 left half, +1 right half; outline of the cut metal
  const tR = 23, tF = 12;                // half-thickness at the rims / in the field
  const x0 = CX + sx * R, x1 = CX + sx * (R - RW), x2 = CX + sx * HB, x3 = CX + sx * HA, b = 4 * sx;
  g.beginPath();
  g.moveTo(x0, SY - tR + 6); g.quadraticCurveTo(x0, SY - tR, x0 - b * 1.5, SY - tR);
  g.lineTo(x1 + b, SY - tR); g.lineTo(x1 - b, SY - tF); g.lineTo(x2 + b, SY - tF); g.lineTo(x2 - b, SY - tR); g.lineTo(x3, SY - tR);
  g.lineTo(x3, SY + tR); g.lineTo(x2 - b, SY + tR); g.lineTo(x2 + b, SY + tF); g.lineTo(x1 - b, SY + tF); g.lineTo(x1 + b, SY + tR);
  g.lineTo(x0 - b * 1.5, SY + tR); g.quadraticCurveTo(x0, SY + tR, x0, SY + tR - 6);
  g.closePath();
}
function drawSection(g) {
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'butt'; g.lineJoin = 'round';
  // projection lines dropped from the plan
  g.globalAlpha = 0.8;
  for (const d of [R, R - RW, HB, HA]) for (const sx of [-1, 1]) {
    const x = CX + sx * d, yTop = CY + Math.sqrt(Math.max(0, R * R - d * d)) + (d === R ? 0 : 8);
    dashLine(g, x, d === R ? CY + 54 : yTop, x, SY - 34, [9, 6], 0.9);
  }
  g.globalAlpha = 1;
  // cast shadow under the section: short horizontal lines
  for (let k = 0; k < 5; k++) {
    const y = SY + 31 + k * 4.4, w = 1.7 * (1 - k / 5.5);
    for (const sx of [-1, 1]) seg(g, CX + sx * (HA + 4) + 8 + k * 3, y, CX + sx * (R - 4) + 10 + k * 3, y, 0.4 + w);
  }
  // the far wall of the hole seen beyond the cut
  seg(g, CX - HA, SY - 23, CX + HA, SY - 23, 1.4); seg(g, CX - HA, SY + 23, CX + HA, SY + 23, 1.4);
  for (let x = CX - HA + 7; x < CX + HA - 3; x += 7) seg(g, x, SY - 21, x, SY + 21, x < CX - HA + 40 ? 1.1 : 0.45);
  // cut metal: 45° section lining, alternating weight
  for (const sx of [-1, 1]) {
    g.save(); sectionHalf(g, sx); g.clip();
    let i = 0;
    for (let c = -60; c < R * 2 + 80; c += 5.2, i++) {
      const xa = CX - R - 30 + c;
      seg(g, xa, SY + 30, xa + 60, SY - 30, i % 2 ? 0.75 : 1.25);
    }
    g.restore();
    g.lineWidth = 4.4; sectionHalf(g, sx); g.stroke();
  }
  // chain-dotted axis through the section and a plain dimension line (arrowheads only, no figures)
  g.globalAlpha = 0.85; dashLine(g, CX, SY - 60, CX, SY + 62, [26, 6, 4, 6], 1.1); g.globalAlpha = 1;
  const yd = SY + 84;
  for (const sx of [-1, 1]) {
    const x = CX + sx * R;
    seg(g, x, SY + 34, x, yd + 12, 0.9);
    g.beginPath(); g.moveTo(x, yd); g.lineTo(x - sx * 20, yd - 5); g.lineTo(x - sx * 20, yd + 5); g.closePath(); g.fill();
  }
  seg(g, CX - R + 18, yd, CX + R - 18, yd, 1.0);
}

// ── edge elevation (comes into view as the camera moves right) ─────────────────────────────────────────────
function drawEdgeView(g) {
  const x0 = 1214, w = 46;
  g.strokeStyle = INK; g.lineCap = 'butt';
  g.globalAlpha = 0.8;
  for (const d of [-R, R]) dashLine(g, 1146, CY + d, x0 - 10, CY + d, [9, 6], 0.9);
  g.globalAlpha = 1;
  g.save();
  g.beginPath(); g.roundRect(x0, CY - R, w, R * 2, 7); g.clip();
  for (let y = CY - R; y < CY + R; y += 3.8) {
    seg(g, x0 + w * 0.52, y, x0 + w, y, 1.3);
    seg(g, x0 + w * 0.26, y, x0 + w * 0.52, y, 0.5);
  }
  g.restore();
  g.lineWidth = 3.6; g.beginPath(); g.roundRect(x0, CY - R, w, R * 2, 7); g.stroke();
  seg(g, x0 + w + 2.4, CY - R + 10, x0 + w + 2.4, CY + R - 6, 2.6);
}

// ── labels ─────────────────────────────────────────────────────────────────────────────────────────────────
function drawLabels(g) {
  const FONT = '"GJ WenKai"';
  const a1 = -0.66;                                                           // 外郭: a point on the outer rim, upper right
  const items = [
    { t: '外郭', tx: CX + Math.cos(a1) * (R - RW / 2), ty: CY + Math.sin(a1) * (R - RW / 2), lx: 1076, ly: 262 },
    { t: '肉', tx: CX + 214, ty: CY - 58, lx: 1098, ly: 452 },
    { t: '内郭', tx: CX + (HA + HB) / 2, ty: CY + 46, lx: 1076, ly: 664 },
    { t: '穿', tx: CX + 34, ty: CY + 52, lx: 1098, ly: 826 },
  ];
  for (const it of items) {
    const size = 50, wTxt = it.t.length * size;
    const xs = it.lx - wTxt / 2 - 14, shelf = 62;                             // end of the shelf next to the characters
    // clear a hairline of paper round the leader so it reads across the hatching
    g.save(); g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 5.5;
    g.beginPath(); g.moveTo(xs - shelf, it.ly); g.lineTo(it.tx, it.ty); g.stroke();
    g.beginPath(); g.arc(it.tx, it.ty, 8.5, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = INK; g.fillStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(xs, it.ly); g.lineTo(xs - shelf, it.ly); g.lineTo(it.tx, it.ty); g.stroke();
    g.beginPath(); g.arc(it.tx, it.ty, 4.6, 0, TAU); g.fill();
    L.text(g, it.t, it.lx, it.ly + 1, { font: FONT, size, weight: 400, color: INK, align: 'center', baseline: 'middle' });
  }
}

function build() {
  const c = L.makeCanvas(W, W), g = c.getContext('2d');
  const paper = K.paper({ base: '#e9e8e3', tone: '#7d7767', seed: 'p05paper', fiber: 0.55, stain: 0.22, grain: 0.18, foxing: 0.16, edge: 0.14, size: W });
  g.drawImage(paper, 0, 0);

  // plate mark: the bevelled edge of the copper plate pressed into the sheet, with a breath of plate tone inside it
  const px0 = 146, py0 = 118, px1 = 1356, py1 = 1196;
  g.fillStyle = 'rgba(70,66,54,0.045)'; g.fillRect(px0, py0, px1 - px0, py1 - py0);
  g.lineWidth = 2; g.strokeStyle = 'rgba(60,55,45,0.20)'; g.strokeRect(px0 + 1, py0 + 1, px1 - px0, py1 - py0);
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.strokeRect(px0 - 1, py0 - 1, px1 - px0, py1 - py0);
  // wiping streaks left in the plate tone
  const r = L.rng('p05wipe');
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = r.range(px0, px1), y = r.range(py0, py1), len = r.range(60, 260), a = -0.5 + r.range(-0.18, 0.18);
    g.strokeStyle = L.rgba(r() < 0.6 ? '#4a463a' : '#ffffff', r.range(0.02, 0.05)); g.lineWidth = r.range(0.7, 2.2);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + r.range(-6, 6), x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }

  // ink on its own layer, so it can be soaked into the paper and lightly worn
  const ink = L.makeCanvas(W, W), q = ink.getContext('2d');
  drawPlan(q); drawSection(q); drawEdgeView(q); drawLabels(q);
  K.wear(ink, { seed: 'p05wear', amount: 0.16, size: 1.3 });
  K.soak(ink, paper, 0.13, 'screen');                    // paper fibre lifts the black a little, unevenly
  g.save();
  g.globalAlpha = 0.3; g.filter = 'blur(1.4px)'; g.globalCompositeOperation = 'multiply'; g.drawImage(ink, 0, 0);   // ink squeezed slightly beyond the cut line
  g.filter = 'none'; g.globalAlpha = 0.97; g.drawImage(ink, 0, 0);
  g.restore();
  return c;
}

export default {
  name: '方孔圆钱规制图',
  init() { layer = build(); },
  draw(ctx, env, p) {
    ctx.fillStyle = '#e9e8e3'; ctx.fillRect(0, 0, S, S);
    K.drift(ctx, layer, p, { z0: 1.0, z1: 1.02, x0: 34, y0: 4, x1: -34, y1: -4 });   // the camera slides right: the sheet slides left
  },
};
