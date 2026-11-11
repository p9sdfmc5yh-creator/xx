// s07 — 梅瓶器型线图 (film: antiques). A vessel survey drawing in white chalk on Prussian-blue cyanotype paper.
// The shared arc is the full shoulder of an enlarged meiping — the heaviest chalk line on the sheet. A dash-dot centre axis
// splits the drawing the way ceramic drawings are always split: LEFT = section (wall thickness, hatched), RIGHT = elevation
// (faint string lines, which project as horizontals). On the crest sits the small mouth and short neck. Below: construction
// radii from the far-off centre, a degree scale, and a little complete meiping labelled 口 / 颈 / 肩 / 腹 / 足.
// No figures anywhere: dimension lines and scales are deliberately left blank.
//
// How the chalk is made: every line is first drawn as plain vector "pressure" into a mask, then thresholded per pixel against
// one sheet-wide paper-tooth field (chalkify) — solid cores, crumbling edges, skips where the pressure drops. The same tooth
// grains the paper, so chalk and paper agree. Lines are grouped into cropped layers that are revealed through growing clip
// shapes, which is the "being drawn" motion; everything is finished by p ≈ 0.5 and then holds.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 90;                       // the camera only breathes (zoom 0.994 → 1.014), so a small margin is enough
const SW = W + PAD * 2, SH = H + PAD * 2;
const BLUE = '#0f3d7a', DEEP = '#0a2a5c', LIT = '#1b62bd', CHALK = '#eef3f7', PALE = '#9fc0e0';
const WALL = 36;                      // thickness of the sectioned wall under the shoulder (px)
const CREASE_X = [700, 1440], CREASE_Y = 290;
const DONE = 0.6;                     // draw-on time is p / DONE; all reveals end by 0.8 of that
const NZ = L.makeNoise('s07m-hand');
let SEQ = 0;
let S = null;

// ───────────────────────── paper tooth (shared by paper and chalk) ─────────────────────────
function buildTooth() {
  const n = SW * SH, tooth = new Uint8Array(n), press = new Uint8Array(n);
  const r = L.rng('s07m-tooth');
  const w2 = (SW >> 1) + 2, c2 = new Float32Array(w2 * ((SH >> 1) + 2));
  const w3 = Math.ceil(SW / 3) + 2, c3 = new Float32Array(w3 * (Math.ceil(SH / 3) + 2));
  for (let i = 0; i < c2.length; i++) c2[i] = r();
  for (let i = 0; i < c3.length; i++) c3[i] = r();
  // slow hand-pressure field on a coarse grid
  const CS = 8, cw = Math.ceil(SW / CS) + 2, ch = Math.ceil(SH / CS) + 2, cp = new Float32Array(cw * ch);
  const nz = L.makeNoise('s07m-press');
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) cp[j * cw + i] = L.clamp(0.5 + 0.95 * nz.fbm((i * CS) / 150, (j * CS) / 150, 3));
  for (let y = 0; y < SH; y++) {
    const fy = y / CS, j0 = fy | 0, ty = fy - j0;
    for (let x = 0; x < SW; x++) {
      const k = y * SW + x;
      tooth[k] = 255 * (0.46 * r() + 0.34 * c2[(y >> 1) * w2 + (x >> 1)] + 0.2 * c3[((y / 3) | 0) * w3 + ((x / 3) | 0)]);
      const fx = x / CS, i0 = fx | 0, tx = fx - i0, q = j0 * cw + i0;
      press[k] = 255 * ((cp[q] + (cp[q + 1] - cp[q]) * tx) * (1 - ty) + (cp[q + cw] + (cp[q + cw + 1] - cp[q + cw]) * tx) * ty);
    }
  }
  return { tooth, press };
}

function blurData(src, px) {
  const c = L.makeCanvas(src.width, src.height), g = c.getContext('2d', { willReadFrequently: true });
  g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); g.filter = 'none';
  return g.getImageData(0, 0, c.width, c.height).data;
}

/** pressure mask → chalk. (gx0, gy0) is where the mask's top-left sits on the padded sheet. */
function chalkify(T, mask, gx0, gy0, color) {
  const w = mask.width, h = mask.height, col = L.parseColor(color);
  const s1 = blurData(mask, 0.8), s2 = blurData(mask, 4.5);
  const img = new ImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const gy = y + gy0; if (gy < 0 || gy >= SH) continue;
    const foldY = Math.abs(gy - PAD - CREASE_Y) < 2.2;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) << 2, a2 = s2[i + 3];
      if (a2 < 4) continue;
      const gx = x + gx0; if (gx < 0 || gx >= SW) continue;
      const k = gy * SW + gx, t = T.tooth[k] / 255, fx = gx - PAD;
      let v = ((s1[i + 3] + 0.28 * a2) / 255) * (0.74 + 0.4 * (T.press[k] / 255));
      if (foldY || Math.abs(fx - CREASE_X[0]) < 2.2 || Math.abs(fx - CREASE_X[1]) < 2.2) v *= 0.5;   // chalk rubs off along the folds
      const e = 0.07 + 0.78 * v - t;
      if (e <= -0.05) continue;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
      d[i + 3] = 255 * (e >= 0.05 ? 1 : (e + 0.05) * 10) * (0.8 + 0.2 * ((t * 37.7) % 1));
    }
  }
  const c = L.makeCanvas(w, h); c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** a cropped chalk layer: box = {x,y,w,h} in frame coords; passes = [{color, draw(g)}] → {c, x, y} */
function chalkLayer(T, box, passes) {
  const out = L.makeCanvas(box.w, box.h), og = out.getContext('2d');
  for (const ps of passes) {
    const m = L.makeCanvas(box.w, box.h), g = m.getContext('2d');
    g.translate(-box.x, -box.y); g.fillStyle = '#fff';
    ps.draw(g);
    const c = chalkify(T, m, box.x + PAD, box.y + PAD, ps.color || CHALK);
    og.globalAlpha = 0.3; og.drawImage(L.blurred(c, 6), 0, 0);   // dust halo
    og.globalAlpha = 1; og.drawImage(c, 0, 0);
    og.globalAlpha = 0.35; og.drawImage(c, 0, 0);                // pack the chalk a little denser
  }
  return { c: out, x: box.x, y: box.y };
}

// ───────────────────────── pressure-mask drawing ─────────────────────────
/** one chalk line: a ribbon whose width breathes and whose centre wanders a hair; `press` is the hand pressure (mask alpha) */
function cs(g, pts, w, o = {}) {
  const { press = 1, wob = 0.6, vary = 0.13 } = o;
  const p = L.smoothPath(pts, 6), n = p.length, so = (SEQ += 3.713);
  const A = new Array(n), B = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    if (i) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const hw = Math.max(0.5, (w / 2) * (1 + vary * NZ.n2(s * 0.012 + so, so * 0.71)));
    const j = wob * NZ.n2(s * 0.0045 + so * 1.31, 7.7 - so);
    A[i] = [p[i][0] + nx * (hw + j), p[i][1] + ny * (hw + j)]; B[i] = [p[i][0] - nx * (hw - j), p[i][1] - ny * (hw - j)];
  }
  g.globalAlpha = press; g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}
function dash(g, x0, y0, x1, y1, pat, w, o) {
  const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  for (let d = 0, i = 0; d < len; d += pat[i % pat.length], i++) {
    if (i % 2) continue;
    const e = Math.min(len, d + pat[i % pat.length]);
    cs(g, [[x0 + ux * d, y0 + uy * d], [x0 + ux * e, y0 + uy * e]], w, o);
  }
}
/** solid arrowhead with its tip at (x,y), pointing along `ang` */
function arrow(g, x, y, ang, len = 26, half = 7) {
  const bx = x - Math.cos(ang) * len, by = y - Math.sin(ang) * len, nx = -Math.sin(ang) * half, ny = Math.cos(ang) * half;
  g.globalAlpha = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(bx + nx, by + ny); g.lineTo(bx - nx, by - ny); g.closePath(); g.fill();
}
function dot(g, x, y, r) { g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r, 0, L.TAU); g.fill(); }

// ───────────────────────── reveal shapes (all polygons wound the same way so their union never punches holes) ─────────────────────────
function poly(c, pts) {
  let ar = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; ar += a[0] * b[1] - b[0] * a[1]; }
  if (ar < 0) pts = pts.slice().reverse();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}
/** a line being drawn from a → b between times t0 and t1 */
const segR = (a, b, t0, t1, hw = 16) => (c, q) => {
  const u = L.clamp((q - t0) / (t1 - t0)); if (u <= 0) return false;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy * hw, ny = ux * hw;
  const sx = a[0] - ux * hw, sy = a[1] - uy * hw, d = len * u + (u >= 1 ? hw : 0), ex = a[0] + ux * d, ey = a[1] + uy * d;
  poly(c, [[sx + nx, sy + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx - nx, sy - ny]]);
  return true;
};
/** a rectangle that wipes open downward (or pops, when t0 === t1) */
const rectR = (x, y, w, h, t0, t1) => (c, q) => {
  const u = t1 > t0 ? L.clamp((q - t0) / (t1 - t0)) : (q >= t0 ? 1 : 0); if (u <= 0) return false;
  poly(c, [[x, y], [x + w, y], [x + w, y + h * u], [x, y + h * u]]);
  return true;
};

// ───────────────────────── the cyanotype sheet ─────────────────────────
function crease(g, x0, y0, x1, y1, seed) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  g.save(); g.translate(x0, y0); g.rotate(Math.atan2(y1 - y0, x1 - x0));
  // the sheet no longer lies flat: a broad soft roll of light either side of the fold, and the ridge itself
  g.fillStyle = L.linear(g, 0, -150, 0, 150, [[0, 'rgba(90,160,255,0)'], [0.5, 'rgba(90,160,255,0.1)'], [0.5, 'rgba(2,10,36,0.17)'], [1, 'rgba(2,10,36,0)']]);
  g.fillRect(0, -150, len, 300);
  g.fillStyle = L.linear(g, 0, -7, 0, 7, [[0, 'rgba(130,190,255,0)'], [0.42, 'rgba(130,190,255,0.24)'], [0.53, 'rgba(2,10,36,0.34)'], [1, 'rgba(2,10,36,0)']]);
  g.fillRect(0, -7, len, 14);
  g.restore();
  // pigment cracked and rubbed pale along the ridge
  L.chalkStroke(g, [[x0, y0], [x1, y1]], { width: 5, color: '#3f8ae0', seed: 's07m-cr' + seed, density: 0.3, alpha: 0.6, jitter: 1.6 });
  L.chalkStroke(g, [[x0, y0], [x1, y1]], { width: 2, color: '#a9cdf2', seed: 's07m-cs' + seed, density: 0.13, alpha: 0.6, jitter: 0.8 });
}
function buildPaper(T) {
  return L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, SW, SH);
    g.fillStyle = BLUE; full();
    // uneven exposure: deep Prussian pools and brighter, washed fields
    g.drawImage(L.noiseTex(SW, SH, { seed: 's07m-exp', scale: 760, octaves: 4, res: 0.2, warp: 0.7, contrast: 1.7,
      ramp: [[0, L.rgba(DEEP, 0.92)], [0.4, L.rgba(DEEP, 0.16)], [0.54, L.rgba(LIT, 0)], [1, L.rgba(LIT, 0.66)]] }), -PAD, -PAD);
    g.globalAlpha = 0.5;
    g.drawImage(L.noiseTex(SW, SH, { seed: 's07m-mot', scale: 130, octaves: 4, res: 0.25, warp: 0.5, contrast: 1.5,
      ramp: [[0, 'rgba(7,30,74,0.6)'], [0.47, 'rgba(7,30,74,0)'], [0.6, 'rgba(38,122,222,0)'], [1, 'rgba(38,122,222,0.42)']] }), -PAD, -PAD);
    // brush streaks of the hand-coated sensitiser, a few degrees off the horizontal
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.045); g.globalAlpha = 0.3;
    g.drawImage(L.noiseTex(SW + 260, SH + 260, { seed: 's07m-str', scale: 26, sx: 50, sy: 1, octaves: 3, res: 0.33, contrast: 1.7,
      ramp: [[0, 'rgba(6,26,66,0.6)'], [0.46, 'rgba(6,26,66,0)'], [0.6, 'rgba(60,140,232,0)'], [1, 'rgba(60,140,232,0.45)']] }), -(SW + 260) / 2, -(SH + 260) / 2);
    g.restore(); g.globalAlpha = 1;
    // paper fibres
    const r = L.rng('s07m-fib');
    g.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r.range(-PAD, W + PAD), y = r.range(-PAD, H + PAD), len = r.range(7, 40), an = r() * Math.PI;
      g.strokeStyle = r.chance(0.55) ? L.rgba('#5aa2f0', r.range(0.06, 0.26)) : L.rgba('#061c44', r.range(0.08, 0.3));
      g.lineWidth = r.range(0.5, 1.5);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an) * len * 0.5 + r.range(-5, 5), y + Math.sin(an) * len * 0.5 + r.range(-5, 5), x + Math.cos(an) * len, y + Math.sin(an) * len);
      g.stroke();
    }
    // the tooth of the paper — the very field the chalk catches on
    const tc = L.makeCanvas(SW, SH), tg = tc.getContext('2d'), ti = tg.createImageData(SW, SH), td = ti.data;
    for (let k = 0, i = 0; k < T.tooth.length; k++, i += 4) { td[i] = td[i + 1] = td[i + 2] = T.tooth[k]; td[i + 3] = 255; }
    tg.putImageData(ti, 0, 0);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.42; g.drawImage(tc, -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // the sheet sinks into deep blue toward its corners
    g.fillStyle = L.radial(g, W / 2, H * 0.46, 560, 1300, [[0, 'rgba(6,26,66,0)'], [1, 'rgba(6,26,66,0.72)']]); full();
    for (const x of CREASE_X) crease(g, x, -PAD, x, H + PAD, 'v' + x);
    crease(g, -PAD, CREASE_Y, W + PAD, CREASE_Y, 'h');
  });
}

// ───────────────────────── the drawing ─────────────────────────
function build(env) {
  const a = env.arc, cx = a.cx, cr = a.crestY, R = a.R;
  const T = buildTooth();
  const sp = a.span(PAD + 60);
  const P = (thDeg, dr = 0) => { const q = a.pt(L.deg(thDeg), dr); return [q.x, q.y]; };
  const yA = (x, dr = 0) => a.yAt(x, dr);
  const groups = [];
  const add = (box, passes, items) => { const Gp = chalkLayer(T, box, passes); Gp.items = items; groups.push(Gp); };

  // mouth and neck on the crest (dx from the axis, dy from the crest): short waisted neck, small rolled lip
  const OUT = [[90, yA(cx + 90) - cr], [82, -4], [75, -15], [71, -29], [70, -43], [72, -54], [80, -61.5], [93, -65], [101.5, -69], [104, -75], [101, -81], [93, -83.5]];
  const INN = [[52, -83.5], [46, -79], [44, -70], [44, -45], [45, -20], [49, 2], [58, 20], [74, 31], [98, yA(cx - 98, -WALL) - cr], [130, yA(cx - 130, -WALL) - cr]];
  const side = (pts, sgn) => L.smoothPath(pts.map(([dx, dy]) => [cx + sgn * dx, cr + dy]), 3);
  const LIP = cr - 83.5;

  // ── always there from the first frame: the shoulder arc, the axis, the mouth, the inner face of the wall ──
  const base = chalkLayer(T, { x: -PAD, y: -PAD, w: SW, h: SH }, [{ draw(g) {
    dash(g, cx, cr - 48 - 133 * 5, cx, H + PAD + 30, [96, 14, 9, 14], 4.4, { press: 0.95 });
    cs(g, L.arcPts(a, -WALL, -sp, a.thetaAtX(cx - 130, -WALL), 160), 6.2, { press: 0.95 });
    cs(g, side(INN, -1), 6.2, { press: 0.95 });
    cs(g, side(OUT, -1), 7.6); cs(g, side(OUT, 1), 7.6);
    cs(g, [[cx - 95, LIP], [cx + 95, LIP]], 6.6);
    cs(g, [[cx + 3, cr - 65], [cx + 92, cr - 65]], 3.6, { press: 0.85 });           // underside of the lip, seen in elevation
    cs(g, L.arcPts(a, 0, -sp, sp, 320), 15.5, { vary: 0.09, wob: 0.5 });            // THE arc
    cs(g, L.arcPts(a, 4.5, -sp, -0.07, 140), 4.5, { press: 0.42, wob: 1.2 });       // gone over twice
    cs(g, L.arcPts(a, -5, 0.1, sp, 140), 4.5, { press: 0.4, wob: 1.2 });
  } }]);

  // ── section hatching of the wall (left half), swept in from the neck outward ──
  {
    const box = { x: -PAD, y: Math.floor(cr - 100), w: PAD + cx + 8, h: 0 };
    box.h = Math.ceil(yA(-PAD, -WALL)) + 14 - box.y;
    add(box, [{ draw(g) {
      g.save(); g.beginPath();
      L.arcPts(a, 0, -sp, a.thetaAtX(cx - 90), 120).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      side(OUT, -1).forEach(([x, y]) => g.lineTo(x, y));
      side(INN, -1).forEach(([x, y]) => g.lineTo(x, y));
      L.arcPts(a, -WALL, a.thetaAtX(cx - 130, -WALL), -sp, 120).forEach(([x, y]) => g.lineTo(x, y));
      g.closePath(); g.clip();
      for (let c = -470; c < 960; c += 21.2) cs(g, [[-PAD - 20, -PAD - 20 + c], [cx + 10, cx + 10 + c]], 3.4, { press: 0.88, wob: 1 });
      g.restore();
    } }], [(c, q) => {
      const cc = L.lerp(-490, 960, L.clamp((q + 0.2) / 0.8));
      poly(c, [[-1000, cc - 1000], [3000, cc + 3000], [3000, -3000], [-1000, -3000]]);
      return true;
    }]);
  }

  // ── construction radii from the centre of the shoulder circle ──
  {
    const RAD = [ // θ°, length below the arc, draw-on start / end
      [-5, 700, -0.3, 0.3], [5, 700, -0.25, 0.35], [-10, 700, -0.15, 0.4], [10, 700, -0.1, 0.45], [15, 700, 0, 0.5],
      [20, 250, 0.1, 0.35], [25, 700, 0.15, 0.6], [-15, 58, 0, 0.08], [-20, 150, 0.1, 0.3], [-25, 700, 0.2, 0.6]];
    const y0 = Math.floor(cr - 30);
    add({ x: -PAD, y: y0, w: SW, h: H + PAD - y0 }, [{ draw(g) {
      for (const [th, len] of RAD) cs(g, [P(th, 12), P(th, -len)], 4.8, { press: 0.8 });
    } }], RAD.map(([th, len, t0, t1]) => segR(P(th, 14), P(th, -len), t0, t1)));
  }

  // ── degree scale on a concentric arc (blank), and a blank scale bar ──
  {
    const DS = -190, T0 = -10, T1 = 26.5, bx = 1540, by = 1002 + (cr - 560), cell = 44;
    add({ x: 540, y: 730, w: W + PAD - 540, h: 320 }, [{ color: PALE, draw(g) {
      cs(g, L.arcPts(a, DS, L.deg(T0), L.deg(T1), 200), 3.4);
      for (let k = T0 * 2; k <= T1 * 2; k++) {
        const len = k % 10 === 0 ? 30 : k % 5 === 0 ? 18 : 9.5;
        cs(g, [P(k / 2, DS + 1), P(k / 2, DS - len)], k % 5 === 0 ? 3.2 : 2.7, { wob: 0.3 });
      }
    } }, { draw(g) {
      cs(g, [[bx, by], [bx + cell * 6, by]], 3.2); cs(g, [[bx, by + 12], [bx + cell * 6, by + 12]], 3.2);
      for (let i = 0; i <= 6; i++) cs(g, [[bx + cell * i, by - (i % 6 === 0 ? 14 : 5)], [bx + cell * i, by + 12]], 3, { wob: 0.2 });
      g.globalAlpha = 1; for (let i = 0; i < 6; i += 2) g.fillRect(bx + cell * i, by, cell, 12);
    } }], [(c, q) => {
      const u = L.clamp((q - 0.05) / 0.55); if (u <= 0) return false;
      const t0 = L.deg(T0 - 0.5), t1 = L.deg(L.lerp(T0 - 0.5, T1 + 1, u)), pts = [];
      for (let i = 0; i <= 24; i++) { const q2 = a.pt(L.lerp(t0, t1, i / 24), DS + 18); pts.push([q2.x, q2.y]); }
      for (let i = 24; i >= 0; i--) { const q2 = a.pt(L.lerp(t0, t1, i / 24), DS - 46); pts.push([q2.x, q2.y]); }
      poly(c, pts); return true;
    }, segR([bx, by + 4], [bx + cell * 6, by + 4], 0.6, 0.76, 24)]);
  }

  // ── elevation side: string lines (弦纹) round the shoulder project as faint horizontals ──
  {
    const DY = [50, 62, 140, 152], xe = (dy) => cx + Math.sqrt(R * R - (R - dy) * (R - dy)) - 12;
    add({ x: cx - 4, y: Math.floor(cr + 36), w: W + PAD - cx + 4, h: 132 }, [{ color: PALE, draw(g) {
      for (const dy of DY) cs(g, [[cx + 8, cr + dy], [xe(dy), cr + dy]], 3, { press: 0.82, wob: 0.4 });
    } }], DY.map((dy, i) => segR([cx + 8, cr + dy], [xe(dy), cr + dy], 0.12 + i * 0.07, 0.4 + i * 0.07, 6)));
  }

  // ── above the arc: sparse dimension lines, arrows and crossing construction lines ──
  {
    const oy = cr - 560;
    const Apt = (s, off = 0) => [s * 0.822 + off * 0.569, 330 + oy - s * 0.569 + off * 0.822];
    const Cpt = (s, off = 0) => [1400 + s * 0.7593 - off * 0.6508, oy + s * 0.6508 + off * 0.7593];
    const Dpt = (s, off = 0) => [1500 + s * 0.8466 + off * 0.5322, 322 + oy - s * 0.5322 + off * 0.8466];
    const hx = cx + 300, hy = yA(hx) - 7;
    add({ x: -PAD, y: -PAD, w: SW, h: Math.ceil(cr + 40) + PAD }, [{ draw(g) {
      cs(g, [Apt(-150), Apt(720)], 7.4); cs(g, [Cpt(-130), Cpt(810)], 7.4);
      cs(g, [Apt(120, 58), Apt(470, 58)], 4.4); arrow(g, ...Apt(120, 58), Math.atan2(0.569, -0.822)); arrow(g, ...Apt(470, 58), Math.atan2(-0.569, 0.822));
      cs(g, [Apt(120, -12), Apt(120, 74)], 3.8); cs(g, [Apt(470, -12), Apt(470, 74)], 3.8);
      cs(g, [Dpt(0), Dpt(600)], 4.8); cs(g, [Dpt(0, -18), Dpt(0, 18)], 4.2);
      cs(g, [Cpt(118, -24), Cpt(118, 24)], 4.4); cs(g, [Cpt(514, -24), Cpt(514, 24)], 4.4);
      cs(g, [P(-15, 6), P(-15, 520)], 4.8, { press: 0.8 });                       // one radius runs on through the shoulder
      // mouth diameter and neck height — dimension lines without figures
      cs(g, [[cx - 104, cr - 146], [cx + 104, cr - 146]], 3.8); arrow(g, cx - 104, cr - 146, Math.PI); arrow(g, cx + 104, cr - 146, 0);
      cs(g, [[hx, LIP], [hx, hy]], 3.8); arrow(g, hx, LIP, -Math.PI / 2); arrow(g, hx, hy, Math.PI / 2);
    } }, { color: PALE, draw(g) {
      for (const sg of [-1, 1]) cs(g, [[cx + sg * 104, cr - 93], [cx + sg * 104, cr - 164]], 3.2, { wob: 0.3 });
      cs(g, [[cx + 114, LIP], [hx + 24, LIP]], 3.2, { wob: 0.3 });
    } }], [
      segR(Apt(-150), Apt(720), -0.5, 0.25, 18), segR(Cpt(-130), Cpt(810), -0.4, 0.3, 18),
      segR(P(-15, 6), P(-15, 520), 0.05, 0.4),
      segR(Apt(120, -12), Apt(120, 74), 0.28, 0.34, 10), segR(Apt(470, -12), Apt(470, 74), 0.33, 0.39, 10), segR(Apt(120, 58), Apt(470, 58), 0.4, 0.56, 18),
      segR(Dpt(600), Dpt(0), 0.18, 0.46), segR(Dpt(0, -18), Dpt(0, 18), 0.46, 0.5, 10),
      segR(Cpt(118, -24), Cpt(118, 24), 0.32, 0.36, 10), segR(Cpt(514, -24), Cpt(514, 24), 0.38, 0.42, 10),
      segR([cx - 104, cr - 93], [cx - 104, cr - 164], 0.16, 0.23, 9), segR([cx + 104, cr - 93], [cx + 104, cr - 164], 0.2, 0.27, 9),
      segR([cx - 104, cr - 146], [cx + 104, cr - 146], 0.3, 0.46, 14),
      segR([cx + 114, LIP], [hx + 24, LIP], 0.36, 0.46, 9), segR([hx, LIP], [hx, hy], 0.46, 0.58, 14),
    ]);
  }

  // ── lower left: the whole vessel, half section / half elevation, with its five part names ──
  {
    const ix = 326, iy = 736 + (cr - 560), Hv = 312;
    // t = height from the lip (0) to the foot (1), r = radius / height. Small mouth, short neck, full shoulder (widest at ~0.28),
    // then a long taper to the foot, which is the narrowest part of the body.
    const PROF = [[0, 0.085], [0.012, 0.09], [0.026, 0.07], [0.05, 0.062], [0.075, 0.074], [0.097, 0.12], [0.128, 0.19], [0.172, 0.25], [0.226, 0.285],
      [0.28, 0.295], [0.34, 0.288], [0.42, 0.262], [0.52, 0.225], [0.62, 0.192], [0.72, 0.166], [0.82, 0.15], [0.9, 0.144], [0.97, 0.142], [1, 0.142]];
    const dense = L.smoothPath(PROF.map(([t, r]) => [r * Hv, t * Hv]), 2);   // [radius px, depth px]
    const rAt = (t) => { const d = t * Hv; for (let i = 1; i < dense.length; i++) if (dense[i][1] >= d) return dense[i][0]; return dense[dense.length - 1][0]; };
    const rf = 0.142 * Hv, yb = iy + Hv;
    const LAB = [['口', 0.004, -4], ['颈', 0.05, 46], ['肩', 0.19, 100], ['腹', 0.5, 174], ['足', 0.985, 300]];
    const lead = LAB.map(([ch, t, ly]) => ({ ch, a: [ix + rAt(t) + 1, iy + t * Hv], b: [ix + 150, iy + ly], ly: iy + ly }));
    add({ x: 176, y: Math.floor(iy - 40), w: 390, h: Math.ceil(H + 16 - (iy - 40)) }, [{ draw(g) {
      // section (left): the wall, the base slab and the foot ring, filled solid
      g.globalAlpha = 0.95; g.beginPath();
      dense.forEach(([r, d], i) => (i ? g.lineTo(ix - r, iy + d) : g.moveTo(ix - r, iy + d)));
      g.lineTo(ix - rf + 8, yb); g.lineTo(ix - rf + 8, yb - 7); g.lineTo(ix, yb - 7); g.lineTo(ix, yb - 16);
      for (let i = dense.length - 1; i >= 0; i--) { const [r, d] = dense[i]; if (d > Hv - 16) continue; g.lineTo(ix - Math.max(2, r - (d < 30 ? 5 : 6.5)), iy + d); }
      g.closePath(); g.fill();
      cs(g, dense.map(([r, d]) => [ix - r, iy + d]), 3.2, { wob: 0.3 });
      // elevation (right)
      cs(g, dense.map(([r, d]) => [ix + r, iy + d]), 5.2, { wob: 0.4 });
      cs(g, [[ix - rAt(0), iy], [ix + rAt(0), iy]], 4.2, { wob: 0.2 });
      cs(g, [[ix - 136, yb + 1], [ix + 128, yb + 1]], 3.6);                        // ground line
      dash(g, ix, iy - 26, ix, yb + 26, [34, 7, 5, 7], 2.8, { wob: 0.2 });
      for (const l of lead) { cs(g, [l.a, l.b], 2.9, { press: 0.92, wob: 0.3 }); dot(g, l.a[0], l.a[1], 4); }
      g.globalAlpha = 1;
      for (const l of lead) L.text(g, l.ch, ix + 182, l.ly + 1, { font: '"GJ WenKai", "GJ Brush", cursive', size: 44, weight: 400, color: '#fff' });
    } }, { color: PALE, draw(g) {
      for (const t of [0.186, 0.208, 0.46]) cs(g, [[ix + 4, iy + t * Hv], [ix + rAt(t) - 3, iy + t * Hv]], 2.4, { wob: 0.2 });
    } }], [
      rectR(ix - 112, iy - 34, 224, Hv + 66, -0.1, 0.46),
      segR([ix - 136, yb + 1], [ix + 128, yb + 1], 0.42, 0.5, 9),
      ...lead.map((l, i) => segR(l.a, l.b, 0.46 + i * 0.065, 0.51 + i * 0.065, 9)),
      ...lead.map((l, i) => rectR(ix + 154, l.ly - 27, 58, 54, 0.5 + i * 0.065, 0.5 + i * 0.065)),
    ]);
  }

  // flatten paper + first-frame chalk into one opaque sheet
  const sheet = buildPaper(T);
  sheet.getContext('2d').drawImage(base.c, base.x, base.y);
  return { sheet, groups };
}

export default {
  name: '梅瓶器型线图',
  tone: 'light',
  init(env) {
    SEQ = 0;
    S = build(env);
  },
  draw(ctx, env, p) {
    const zoom = L.lerp(0.994, 1.014, p), q = p / DONE;
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.sheet, { zoom });
    L.cam(ctx, env, { zoom }, () => {
      for (const G of S.groups) {
        if (q >= 0.82) { ctx.drawImage(G.c, G.x, G.y); continue; }
        ctx.save(); ctx.beginPath();
        let any = false;
        for (const it of G.items) if (it(ctx, q)) any = true;
        if (any) { ctx.clip(); ctx.drawImage(G.c, G.x, G.y); }
        ctx.restore();
      }
    });
    // fixed raking light from the upper left; the sheet breathes underneath it
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = L.radial(ctx, 640, 260, 0, 1500, [[0, 'rgba(255,255,255,0.3)'], [0.5, 'rgba(255,255,255,0.04)'], [1, 'rgba(0,0,0,0.3)']]);
    ctx.fillRect(0, 0, W, H); ctx.restore();
  },
};
