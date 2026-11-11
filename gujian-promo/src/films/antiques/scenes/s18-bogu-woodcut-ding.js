// s18 — 博古图录·木刻鼎. A page from an old catalogue of bronzes, cut in wood and printed in one ink:
// only ink-black and paper-white. The arc is the upper edge of a round ding's mouth rim. Below it, black line on paper:
// the thick lip cut as a comb of short upright strokes, a frieze of 兽面纹 on a 云雷纹 ground divided by flanges (扉棱),
// then bowstring lines and the swelling belly in concentric cuts that crowd toward the shadow. Far left and right, the
// roots of the two upright ears. Above the arc the block was left standing: solid black.
//
// Recipe: (1) draw the design as clean vector line art; (2) "cut and print" it per pixel in init() — blur → add fine,
// medium and ink-starved noise → threshold — which gives ragged knife edges, broken hairlines and 飞白 in the solids;
// (3) lay the ink on a fibrous paper and blit that one sheet with a small push-in + slide along the arc.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
const INK = '#0c0b0a';
const PAPER = '#efe9da';
let S = null;

// depths below the arc (px), from the mouth rim down
const D = {
  hatch0: 11, hatch1: 92, rimLine: 101,     // 口沿厚边
  bandTop: 131, band0: 140, HB: 222,        // 纹饰带 interior = band0 .. band0 + HB
  bandBot: 371,
  cord0: 388, cord1: 400, belly0: 416,      // 弦纹, 器腹
};
const UH = 410;                 // half-width of one 兽面 unit (px along the band's mid radius)
const EAR_TH = 0.376;           // where the upright ears stand (radians from the crest)
const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function mapper(a) {
  const Rm = a.R - (D.band0 + D.HB / 2);
  const P = (th, d) => [a.cx + (a.R - d) * Math.sin(th), a.cy - (a.R - d) * Math.cos(th)];
  const unit = (2 * UH) / Rm;
  /** band-local coords of unit k: u = px outward from the unit's centre line (mirrored by sg), v = px down from the band top */
  const UV = (th0, sg) => (u, v) => P(th0 + (sg * u) / Rm, D.band0 + v);
  return { Rm, P, unit, UV };
}

/** one hand-cut polyline: vertices wander a little, every run of the knife has its own weight and overcuts its corners;
 *  long runs are subdivided so they bend with the vessel */
function carve(g, map, pts, w, r, jit = 1.1) {
  const q = pts.map(([u, v]) => [u + r.range(-jit, jit), v + r.range(-jit, jit)]);
  g.lineCap = 'square';
  for (let i = 0; i < q.length - 1; i++) {
    const [u0, v0] = q[i], [u1, v1] = q[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / 30));
    g.beginPath();
    for (let s = 0; s <= n; s++) {
      const [x, y] = map(L.lerp(u0, u1, s / n), L.lerp(v0, v1, s / n));
      if (s) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.lineWidth = w * r.range(0.84, 1.18);
    g.stroke();
  }
  g.lineCap = 'butt';
}

/** a patch of 云雷纹 ground: squared spirals, each mirrored against its neighbours */
function ground(g, map, u0, v0, uw, vh, cols, rows, r) {
  const cw = uw / cols, ch = vh / rows;
  const K = [0.125, 0.375, 0.625, 0.875];
  const sp = [[0, 0], [3, 0], [3, 3], [0, 3], [0, 1], [2, 1], [2, 2], [1, 2]];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const fu = (i + j) % 2 === 1, fv = j % 2 === 1;
    const pts = sp.map(([p, q]) => [u0 + (i + (fu ? 1 - K[p] : K[p])) * cw, v0 + (j + (fv ? 1 - K[q] : K[q])) * ch]);
    carve(g, map, pts, 4.9, r, 0.8);
  }
}

/** 扉棱: a notched upright ridge */
function flange(g, map, r) {
  const quad = (u0, v0, u1, v1, col) => {
    g.fillStyle = col; g.beginPath();
    [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].forEach(([u, v], i) => { const [x, y] = map(u, v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath(); g.fill();
  };
  quad(-10.5 + r.range(-0.8, 0.8), 2, 10.5 + r.range(-0.8, 0.8), D.HB - 2, '#000');
  for (let i = 0; i < 9; i++) {
    const v0 = 13 + i * 23.3 + r.range(-1.2, 1.2), h = r.range(7.5, 9.5);
    if (i % 2) quad(-12, v0, 2.5, v0 + h, '#fff'); else quad(-2.5, v0, 12, v0 + h, '#fff');
  }
  g.fillStyle = '#000';
}

/** one half of a 兽面: horn, eye, jaw, body with upturned tail, leg — bold cuts over patches of fine 云雷纹 */
function halfMask(g, map, r) {
  ground(g, map, 166, 3, 138, 97, 3, 2, r);
  ground(g, map, 232, 128, 162, 91, 3, 2, r);
  const B = 11;
  carve(g, map, [[24, 60], [24, 13], [148, 13], [148, 64], [62, 64], [62, 38], [112, 38]], B, r);          // horn: a squared spiral
  carve(g, map, [[20, 209], [132, 209], [132, 170], [60, 170]], B, r);                                      // jaw
  carve(g, map, [[168, 114], [384, 114], [384, 13], [318, 13], [318, 60], [352, 60]], B + 1, r);             // body → curled tail
  carve(g, map, [[214, 119], [214, 209], [160, 209], [160, 172], [188, 172]], B, r);                         // leg and claw
  // eye: the one rounded form in the frieze, with canthi drawn to points
  const q = (u, v) => map(u, v);
  const p0 = q(30, 127), c1 = q(44, 86), p1 = q(98, 86), c2 = q(140, 86), p2 = q(155, 102), c3 = q(140, 147), p3 = q(90, 146), c4 = q(48, 146);
  g.beginPath(); g.moveTo(p0[0], p0[1]);
  g.quadraticCurveTo(c1[0], c1[1], p1[0], p1[1]); g.quadraticCurveTo(c2[0], c2[1], p2[0], p2[1]);
  g.quadraticCurveTo(c3[0], c3[1], p3[0], p3[1]); g.quadraticCurveTo(c4[0], c4[1], p0[0], p0[1]); g.closePath();
  g.fillStyle = '#fff'; g.fill(); g.lineWidth = 10; g.stroke();
  g.fillStyle = '#000'; g.beginPath();
  for (let i = 0; i < 22; i++) { const t = (i / 22) * L.TAU, [x, y] = q(95 + 24 * Math.cos(t), 116 + 13.5 * Math.sin(t)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.fill();
}

/** an upright ear (立耳): a thick arch standing on the rim; only its root and loop show at the edge of frame */
function ear(g, a, sg, r) {
  const th = sg * EAR_TH, p = a.pt(th, 0), tilt = th * 0.34;
  const HW = 126, HE = 272;
  const uPath = (hw, top, rad) => {
    g.beginPath(); g.moveTo(-hw, 170); g.lineTo(-hw, top + rad); g.quadraticCurveTo(-hw, top, -hw + rad, top);
    g.lineTo(hw - rad, top); g.quadraticCurveTo(hw, top, hw, top + rad); g.lineTo(hw, 170);
  };
  // where a local upright at x meets the rim
  const baseY = (x) => {
    let y = 0;
    for (let i = 0; i < 6; i++) { const wx = p.x + x * Math.cos(tilt) - y * Math.sin(tilt), wy = p.y + x * Math.sin(tilt) + y * Math.cos(tilt); y += a.drAt(wx, wy); }
    return y;
  };
  g.save();
  a.clipAbove(g, 0);
  g.translate(p.x, p.y); g.rotate(tilt);
  uPath(HW, -HE, 50); g.closePath(); g.fillStyle = '#fff'; g.fill();
  g.strokeStyle = '#000'; g.lineJoin = 'round'; g.lineCap = 'butt';
  uPath(HW - 15, -HE + 15, 38); g.lineWidth = 5.4; g.stroke();          // a raised border round the arch …
  uPath(62, -HE + 71, 30); g.lineWidth = 4.4; g.stroke();               // … and round the opening
  // the channel between them, shaded on the side away from the light with short cross-cuts
  for (const x0 of [-86, 86]) {
    const by = baseY(x0 + 10) - 13;
    for (let y = -HE + 96 + r.range(0, 4); y < by; y += r.range(8.2, 9.6)) {
      g.lineWidth = r.range(3.2, 4.4);
      g.beginPath(); g.moveTo(x0 + r.range(-1.5, 1.5), y); g.lineTo(x0 + 19 + r.range(-2.5, 1.5), y + r.range(-1, 1)); g.stroke();
    }
  }
  for (let x = -72 + r.range(0, 4); x < 104; x += r.range(8.2, 9.6)) {
    g.lineWidth = r.range(3.2, 4.4);
    g.beginPath(); g.moveTo(x, -HE + 44 + r.range(-1.5, 1.5)); g.lineTo(x + r.range(-1, 1), -HE + 64 + r.range(-2, 1)); g.stroke();
  }
  // the joint with the rim: a firm cut along the arc under each post
  g.save();
  uPath(HW, -HE, 50); g.closePath(); g.clip();
  g.rotate(-tilt); g.translate(-p.x, -p.y);
  g.lineWidth = 12; a.stroke(g, 0);
  g.restore();
  uPath(47, -HE + 86, 22); g.closePath(); g.fillStyle = '#000'; g.fill();   // the opening shows the black behind
  g.restore();
}

/** the design as clean black-on-white line art (frame coords, padded) */
function drawArt(g, env) {
  const a = env.arc, r = L.rng('s18-art'), nz = L.makeNoise('s18-ring');
  const { Rm, P, unit, UV } = mapper(a);
  const SPAN = a.span(PAD + 170);
  g.fillStyle = '#fff'; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  g.fillStyle = '#000'; a.pathAbove(g, 0); g.fill();
  g.strokeStyle = '#000'; g.lineJoin = 'miter'; g.lineCap = 'butt'; g.miterLimit = 4;

  // a long cut that follows the vessel, wandering by a hair; gap > 0 lets the knife skip now and then
  const ring = (d, w, wob = 0.8, gap = 0) => {
    const step = 44 / a.R;
    g.lineWidth = w; g.beginPath(); let pen = false;
    for (let th = -SPAN; th <= SPAN; th += step) {
      const [x, y] = P(th, d + wob * nz.n2(th * 46, d * 0.37));
      if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
      if (gap && r.chance(gap)) { g.stroke(); g.beginPath(); pen = false; th += r.range(8, 20) / a.R; }
    }
    g.stroke();
  };

  // ── 口沿厚边: a comb of short upright cuts ──
  for (let th = -SPAN; th < SPAN;) {
    const fused = r.chance(0.045);
    const w = fused ? r.range(11, 14) : r.range(5.4, 7.2);
    const d0 = D.hatch0 + r.range(-1.2, 3), d1 = D.hatch1 + r.range(-8, 1.5), sl = r.range(-2.2, 2.2) / a.R;
    const seg = (k0, k1) => {
      const [x0, y0] = P(th + sl * k0, L.lerp(d0, d1, k0)), [x1, y1] = P(th + sl * k1, L.lerp(d0, d1, k1));
      g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    };
    if (r.chance(0.1)) { const m = r.range(0.3, 0.72), gp = r.range(0.05, 0.1); seg(0, m - gp); seg(m + gp, 1); } else seg(0, 1);
    th += (13.2 / a.R) * (fused ? 1.5 : r.range(0.9, 1.1));
  }
  ring(D.rimLine, 9.5, 1.1);

  // ── 纹饰带: 兽面纹, 云雷纹 ground, 扉棱 ──
  ring(D.bandTop, 8, 1.1);
  ring(D.bandBot, 8, 1.1);
  for (let k = -1; k <= 1; k++) {
    halfMask(g, UV(k * unit, 1), r);
    halfMask(g, UV(k * unit, -1), r);
    g.strokeStyle = '#000';
    flange(g, UV(k * unit, 1), r);                 // the ridge down the nose
  }
  for (let k = -2; k <= 1; k++) flange(g, UV((k + 0.5) * unit, 1), r);   // the ridges between units
  g.strokeStyle = '#000';

  // ── 弦纹 and the belly: concentric cuts, wide apart in the light, crowding into the shadow ──
  ring(D.cord0, 6.5, 1.1);
  ring(D.cord1, 4.2, 0.9, 0.03);
  for (let d = D.belly0; d < 720;) {
    const k = L.clamp((d - D.belly0) / 120);
    const w0 = L.lerp(4, 5.5, k);
    for (let th = -SPAN + r.range(0, 0.03); th < SPAN;) {
      const rr = a.R - d, len = r.range(90, 260) / rr;
      const lit = Math.exp(-Math.pow((th + len / 2 + 0.05) / 0.085, 2)) * (1 - 0.72 * k);   // the highlight: cuts thin out and stop
      if (lit < 0.5 || r.chance(0.12)) {
        g.lineWidth = w0 * (1 - 0.5 * lit) * r.range(0.9, 1.1);
        g.beginPath(); g.arc(a.cx, a.cy, a.R - d - r.range(-0.9, 0.9), th - Math.PI / 2, th + len - Math.PI / 2); g.stroke();
      }
      th += len + r.range(5, 14) / rr;
    }
    d += L.lerp(14.5, 9.2, k);
  }

  // stray remnants the gouge left standing in the cleared wood
  for (let i = 0; i < 150; i++) {
    const th = r.range(-SPAN, SPAN);
    const d = r.pick([r.range(109, 123), r.range(109, 123), r.range(378, 382), r.range(406, 600)]);
    const len = r.range(4, 13) / a.R, tip = r.range(-2, 2);
    const [x0, y0] = P(th, d), [x1, y1] = P(th + len, d + tip);
    g.lineWidth = r.range(1.8, 2.8); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }

  // ── 立耳 ──
  ear(g, a, -1, r); ear(g, a, 1, r);
  return Rm;
}

/** cut and print: line art → ink coverage (white, alpha = coverage) with knife-rough edges, broken hairlines and 飞白 */
function woodcut(art, env) {
  const a = env.arc, LW = art.width, LH = art.height;
  const soft = L.blurred(art, 1.9);
  const src = soft.getContext('2d').getImageData(0, 0, LW, LH).data;

  // fine noise: tileable random lattice, smooth-interpolated
  const LN = 512, MASK = LN - 1, lat = new Float32Array(LN * LN), rr = L.rng('s18-lat');
  for (let i = 0; i < lat.length; i++) lat[i] = rr() * 2 - 1;
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = xi & MASK, x1 = (xi + 1) & MASK, y0 = (yi & MASK) * LN, y1 = ((yi + 1) & MASK) * LN;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const p = lat[y0 + x0], q = lat[y0 + x1], s = lat[y1 + x0], t = lat[y1 + x1];
    return (p + (q - p) * sx) * (1 - sy) + (s + (t - s) * sx) * sy;
  };
  // slow fields on a coarse grid: line weight (how hard the knife leaned) and how well the block took the ink
  const CS = 8, cw = Math.ceil(LW / CS) + 2, ch = Math.ceil(LH / CS) + 2;
  const fM = new Float32Array(cw * ch), fD = new Float32Array(cw * ch), nz = L.makeNoise('s18-ink');
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = i * CS, y = j * CS;
    fM[j * cw + i] = nz.fbm(x / 34, y / 34, 2);
    fD[j * cw + i] = nz.fbm(x / 330 + 9, y / 210 - 4, 3);
  }
  const bil = (f, x, y) => {
    const gx = x / CS, gy = y / CS, i0 = gx | 0, j0 = gy | 0, tx = gx - i0, ty = gy - j0, k = j0 * cw + i0;
    return (f[k] + (f[k + 1] - f[k]) * tx) * (1 - ty) + (f[k + cw] + (f[k + cw + 1] - f[k + cw]) * tx) * ty;
  };

  const out = new ImageData(LW, LH), o = out.data;
  const Ro2 = (a.R + 7) * (a.R + 7), Ri2 = (a.R - 5) * (a.R - 5);
  for (let y = 0; y < LH; y++) {
    const dy = a.cy - (y - PAD);
    for (let x = 0; x < LW; x++) {
      const k = (y * LW + x) * 4, v = src[k] / 255;
      if (v > 0.985) continue;                                   // clean paper
      const dx = x - PAD - a.cx, r2 = dx * dx + dy * dy, above = r2 > Ro2, inside = r2 < Ri2;
      let cov;
      if (above && v < 0.015) cov = 1;                           // the solid black field stays solid
      else {
        const e = 0.5 * vn(x / 3, y / 3) + 0.5 * vn(x / 7.5 + 31.3, y / 7.5 + 7.7);
        const dry = sstep(-0.08, 0.5, bil(fD, x, y));
        const t = v - 0.56 + 0.3 * e + 0.2 * bil(fM, x, y) + 0.08 * dry;   // −0.56: a little ink gain, the lines print fat
        cov = 1 - sstep(-0.085, 0.085, t);
        if (cov > 0.02 && inside) {
          // 飞白: short streaks along the grain of the block, and pinholes, where the ink ran thin
          const st = 0.6 * vn(x / 15 + 11.1, y / 2.7 + 5.3) + 0.4 * vn(x / 5.5 + 3.9, y / 1.7 + 40.2);
          const th = 0.56 - 0.2 * dry;
          const fb = sstep(th, th + 0.13, st) * (0.2 + 0.7 * dry);
          const pin = sstep(0.68, 0.86, vn(x / 1.8 + 77.7, y / 1.8 + 13.1)) * (0.2 + 0.6 * dry);
          cov *= (1 - fb) * (1 - pin);
        }
      }
      o[k] = o[k + 1] = o[k + 2] = 255; o[k + 3] = cov * 255;
    }
  }
  const c = L.makeCanvas(LW, LH);
  c.getContext('2d').putImageData(out, 0, 0);
  c._pad = PAD;
  return c;
}

/** ink on paper */
function compose(cut, env) {
  const a = env.arc, LW = cut.width, LH = cut.height;
  const paper = L.paperTex(LW, LH, { base: PAPER, seed: 's18paper', tone: '#b49f72', fiber: 0.7, stain: 0.32, grain: 0.13 });
  const ink = L.makeCanvas(LW, LH), ig = ink.getContext('2d');
  ig.drawImage(cut, 0, 0);
  ig.globalCompositeOperation = 'source-in'; ig.fillStyle = INK; ig.fillRect(0, 0, LW, LH);
  const print = L.makeLayer(PAD, (g) => {
    g.drawImage(paper, -PAD, -PAD);
    L.speckle(g, { seed: 's18incl', count: 520, x: -PAD, y: a.crestY - 60, w: LW, h: H + PAD - a.crestY + 60, rMin: 0.5, rMax: 1.7, colors: ['#b8a888', '#927f5e', '#fffaf0'], alpha: [0.12, 0.42] });
    g.drawImage(ink, -PAD, -PAD);
    // dust and pinholes in the solid black, kept well away from the caption
    L.speckle(g, {
      seed: 's18dust', count: 800, x: -PAD, y: -PAD, w: LW, h: a.crestY + 330, rMin: 0.45, rMax: 1.7, colors: [PAPER], alpha: [0.12, 0.62],
      test: (x, y) => a.drAt(x, y) > 16 && !(x > 520 && x < 1400 && y > a.crestY - 340),
    });
    // hairline streaks where the grain of the block shows through the solid — faint, and never behind the caption
    const rs = L.rng('s18grain');
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = rs.range(-PAD, W + PAD), y = rs.range(-PAD, a.crestY + 220), len = rs.range(50, 260);
      const al = rs.range(0.04, 0.13), lw = rs.range(0.7, 1.3), tip = rs.range(-1.5, 1.5);
      if (a.drAt(x, y) < 28 || a.drAt(x + len, y) < 28) continue;
      if (x + len > 480 && x < 1440 && y > a.crestY - 360) continue;
      g.strokeStyle = L.rgba(PAPER, al); g.lineWidth = lw;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + tip); g.stroke();
    }
  });
  // the faint bite of the block into the sheet: relief light on the ink edges
  const bump = L.bumpLight(cut, { angle: 45, strength: 0.42, res: 0.5 });
  const pg = print.getContext('2d');
  pg.save(); pg.setTransform(1, 0, 0, 1, 0, 0);
  pg.globalCompositeOperation = 'soft-light'; pg.globalAlpha = 0.5; pg.drawImage(bump, 0, 0);
  pg.restore();
  return print;
}

export default {
  name: '博古图录·木刻鼎',
  tone: 'light',
  init(env) {
    const art = L.makeLayer(PAD, (g) => { drawArt(g, env); });
    S = { print: compose(woodcut(art, env), env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // slow push-in, split either side of 1 so the rim never strays more than ~3 px from the arc, plus a slight slide along it
    const rot = L.lerp(-0.0055, 0.0055, p), zoom = L.lerp(0.987, 1.013, p);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.print, { rot, zoom });
    // a reading lamp over the sheet, fixed to the frame so the page slides beneath it
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.radial(ctx, a.cx - 150 + 70 * p, a.crestY + 250, 220, 1380, [[0, '#ffffff'], [0.6, '#fbf8f0'], [1, '#e9e1d0']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};
