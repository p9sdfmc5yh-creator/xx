// g27 — 金箔: the current glyph gilded on black lacquer. A sheet made of many square gold leaves (0.9–1.4 stroke widths across,
// every one at its own angle, with torn edges, laid over one another) is cut to the glyph with K.clipGlyph; crumbs of leaf lie
// along the outside of the outline. Nothing here knows which character it is: sizes hang off K.glyphInfo().strokeWidth.
//
// How it is built (all in init):
//   1. the leaves are painted as VECTORS into three maps — A: each leaf's own reflectance (a gradient, so a leaf reads as a tilted
//      mirror), B: how many leaves lie on top of each other (additive), C: hairline relief (folds, rucks of fine wrinkles, brush marks);
//   2. A and B are cut to the glyph (K.clipGlyph), the outline gets a few small bites, crumbs are added outside it;
//   3. one per-pixel pass at DEVICE resolution (L.pixelCanvas) turns the maps into a height field and lights it from the top-left:
//      every overlap becomes a bright edge / dark line, every crease a lit and a shaded flank, the strokes are slightly pillowed;
//   4. the ground is black lacquer (faint reflection, fine hairline crazing) with the gold's contact and cast shadows.
// One soft glint lies across the gold. In the held shots it creeps slowly (two bakes of the picture, with the glint a little
// apart, are cross-faded by draw); in the 3-frame flashes the picture is perfectly still.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layers = [];

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

/** gold from deep shadow to the white core of a highlight; index = v / 1.2 · 1024 */
function goldLUT() {
  const st = [[0, 18, 10, 3], [0.14, 60, 35, 8], [0.3, 116, 74, 14], [0.45, 168, 114, 24], [0.6, 207, 152, 38], [0.74, 235, 188, 70],
    [0.87, 249, 218, 120], [1.0, 255, 238, 180], [1.2, 255, 251, 234]];
  const N = 1024, lut = new Uint8ClampedArray((N + 1) * 3);
  for (let i = 0, s = 0; i <= N; i++) {
    const v = (i / N) * 1.2; while (s < st.length - 2 && v > st[s + 1][0]) s++;
    const a = st[s], b = st[s + 1], t = L.clamp((v - a[0]) / (b[0] - a[0]));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * t;
  }
  return lut;
}

/** one square leaf as a Path2D in page space: wavering, chipped edges, the odd torn corner, a pinhole or a slit (fill with 'evenodd') */
function leafPath(r, cx, cy, s, rot) {
  const h = s / 2, cs = Math.cos(rot), sn = Math.sin(rot), path = new Path2D();
  const C4 = [[-h, -h], [h, -h], [h, h], [-h, h]];
  const tear = C4.map(() => (r.chance(0.3) ? r.range(0.05, 0.2) * s : 0));
  const put = (x, y, first) => { const X = cx + x * cs - y * sn, Y = cy + x * sn + y * cs; if (first) path.moveTo(X, Y); else path.lineTo(X, Y); };
  let first = true;
  for (let e = 0; e < 4; e++) {
    const a = C4[e], b = C4[(e + 1) % 4], ex = (b[0] - a[0]) / s, ey = (b[1] - a[1]) / s, nx = -ey, ny = ex;      // (nx, ny) points into the leaf
    const n = r.int(8, 13), ph1 = r() * TAU, ph2 = r() * TAU, f1 = r.range(1.1, 2.4), f2 = r.range(3.7, 7.3), amp = s * r.range(0.004, 0.012);
    const chip = r.chance(0.5) ? { t: r.range(0.12, 0.88), w: r.range(0.04, 0.13), d: s * r.range(0.025, 0.085) } : null;
    const t0 = tear[e], t1 = tear[(e + 1) % 4];
    for (let k = 0; k < n; k++) {
      const t = (k + (k ? r.range(-0.3, 0.3) : 0)) / n, along = t * s;
      let d = amp * (1 + Math.sin(t * f1 * TAU + ph1) + 0.6 * Math.sin(t * f2 * TAU + ph2)) + s * r.range(0, 0.006);
      if (chip) { const q = Math.abs(t - chip.t) / chip.w; if (q < 1) d += chip.d * (1 - q * q) * r.range(0.7, 1); }
      if (t0 && along < t0) d += (t0 - along) * r.range(0.8, 1.1);
      if (t1 && s - along < t1) d += (t1 - (s - along)) * r.range(0.8, 1.1);
      put(a[0] + ex * along + nx * d, a[1] + ey * along + ny * d, first); first = false;
    }
  }
  path.closePath();
  for (let k = 0, nh = r.chance(0.5) ? r.int(1, 2) : 0; k < nh; k++) {                                               // where the leaf broke: the ground shows
    const hx = r.range(-h, h) * 0.8, hy = r.range(-h, h) * 0.8, slit = r.chance(0.2);
    const ra = s * (slit ? r.range(0.05, 0.12) : r.range(0.012, 0.034)), rb = ra * (slit ? r.range(0.14, 0.3) : r.range(0.5, 1));
    const ha = r() * TAU, ca = Math.cos(ha), sa = Math.sin(ha), m = r.int(5, 7);
    for (let i = 0; i < m; i++) {
      const t = (i / m) * TAU + r.range(-0.3, 0.3), jr = r.range(0.55, 1.2), px = Math.cos(t) * ra * jr, py = Math.sin(t) * rb * jr;
      put(hx + px * ca - py * sa, hy + px * sa + py * ca, i === 0);
    }
    path.closePath();
  }
  return path;
}

/** a small irregular scrap (crumbs, bites) */
function scrapPath(r, x, y, rad) {
  const p = new Path2D(), m = r.int(4, 6), a0 = r() * TAU, sq = r.range(0.5, 1);
  for (let i = 0; i < m; i++) {
    const t = a0 + (i / m) * TAU + r.range(-0.3, 0.3), rr = rad * r.range(0.6, 1.2), px = Math.cos(t) * rr, py = Math.sin(t) * rr * sq;
    const X = x + px * Math.cos(a0) - py * Math.sin(a0), Y = y + px * Math.sin(a0) + py * Math.cos(a0);
    if (i) p.lineTo(X, Y); else p.moveTo(X, Y);
  }
  p.closePath();
  return p;
}

/** rows of leaves over the glyph, each overlapping its neighbours; shuffled so that no leaf systematically lies on top */
function layoutLeaves(info, r, small) {
  const sw = info.strokeWidth, b = info.bbox, pitch = sw * 0.8, out = [], base = r.range(-0.1, 0.1);
  const tone = () => { const q = r(); return q < (small ? 0.1 : 0.17) ? r.range(0.31, 0.44) : q < 0.72 ? r.range(0.46, 0.67) : r.range(0.69, 0.84); };
  for (let y = b.y0 - pitch * 0.2; y < b.y1 + pitch * 0.6; y += pitch) {
    const shift = r() * pitch;
    for (let x = b.x0 - pitch + shift; x < b.x1 + pitch; x += pitch) {
      const s = sw * r.range(0.9, 1.4), cx = x + r.range(-0.12, 0.12) * pitch, cy = y + r.range(-0.12, 0.12) * pitch;
      const rot = r.chance(0.2) ? r.range(-0.78, 0.78) : base + r.gauss() * 0.14, k = r();
      const t0 = tone(), t1 = L.clamp(t0 + r.range(-0.17, 0.17), 0.26, 0.88), tm = L.clamp((t0 + t1) / 2 + r.range(-0.05, 0.12), 0.26, 0.88);
      const lf = { cx, cy, s, rot, k, t0, t1, tm, mid: r.range(0.3, 0.7), gdir: r() * TAU, hue: r.range(0.2, 0.8) };
      if (K.sdGlyph(cx, cy) > s * 0.72) continue;
      lf.path = leafPath(r, cx, cy, s, rot);
      out.push(lf);
    }
  }
  out.sort((p, q) => p.k - q.k);
  return out;
}

/** relief of one leaf, painted in its own frame (grey 128 = flat, lighter = raised): faint brush marks, a fold or two, and
 *  bundles of fine parallel wrinkles where the leaf rucked up as it was laid */
function wrinkles(g, r, s, u) {
  const h = s / 2, W = '255,255,255', D = '0,0,0';
  g.lineCap = 'round'; g.lineJoin = 'round';
  const swap = r.chance(0.5);                                                 // the gilder's brush went along one side of the leaf
  for (let k = 0, n = Math.round(r.range(7, 13) * (0.45 + 0.55 * u)); k < n; k++) {
    const y = r.range(-h, h), b1 = r.range(-0.02, 0.02) * s, b2 = r.range(-0.02, 0.02) * s, x0 = r.range(-h * 1.1, -h * 0.1), x1 = r.range(h * 0.1, h * 1.1);
    g.strokeStyle = `rgba(${r.chance(0.5) ? W : D},${r.range(0.03, 0.1).toFixed(3)})`; g.lineWidth = r.range(0.5, 1.2) * u;
    g.beginPath();
    if (swap) { g.moveTo(y, x0); g.quadraticCurveTo(y + b1, 0, y + b2, x1); } else { g.moveTo(x0, y); g.quadraticCurveTo(0, y + b1, x1, y + b2); }
    g.stroke();
  }
  const crease = (pts, up, w, a) => {
    const c = up ? W : D;
    for (const [lw, al] of [[w * 3.2, 0.2 * a], [w, 0.48 * a]]) {
      g.strokeStyle = `rgba(${c},${al.toFixed(3)})`; g.lineWidth = lw; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.stroke();
    }
  };
  for (let k = 0, n = r.int(0, u > 0.8 ? 2 : 1); k < n; k++) {                 // a long soft fold
    const a = r() * TAU, off = r.range(-0.36, 0.36) * s, len = s * r.range(0.5, 1.2), m = r.int(3, 5), pts = [];
    const dx = Math.cos(a), dy = Math.sin(a), ox = -dy * off, oy = dx * off; let bend = 0;
    for (let i = 0; i <= m; i++) { const t = (i / m - 0.5) * len; bend += r.range(-0.07, 0.07) * s; pts.push([ox + dx * t - dy * bend, oy + dy * t + dx * bend]); }
    crease(pts, r.chance(0.65), r.range(0.8, 1.4) * u, r.range(0.5, 0.8));
  }
  for (let b = 0, nb = r.int(1, 2); b < nb; b++) {                            // a ruck: a few short wrinkles side by side
    const a = r() * TAU, dx = Math.cos(a), dy = Math.sin(a), cx = r.range(-0.4, 0.4) * s, cy = r.range(-0.4, 0.4) * s;
    const n = r.int(3, 6), gap = s * r.range(0.02, 0.042), len = s * r.range(0.16, 0.42), curve = r.range(-0.22, 0.22) * len;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * gap * r.range(0.8, 1.25), l = len * r.range(0.55, 1) * 0.5, sl = r.range(-0.15, 0.15) * len, cv = curve * r.range(0.6, 1.3);
      const P = (t, bend) => [cx + dx * (t + sl) - dy * (off + bend), cy + dy * (t + sl) + dx * (off + bend)];
      crease([P(-l, 0), P(0, cv), P(l, 0)], i % 2 === 0, r.range(0.55, 0.95) * u, r.range(0.5, 0.85));
    }
  }
}

/** hairline crazing of old lacquer: long, nearly parallel, slightly wandering lines. Returns polylines. */
function crazing(r) {
  const out = [], fam = r.range(-0.05, 0.05);
  for (let n = 0; n < 170; n++) {
    let x = r.range(-60, S), y = r.range(0, S), a = fam + r.range(-0.06, 0.06);
    const len = r.chance(0.3) ? r.range(240, 640) : r.range(40, 210), pts = [];
    for (let t = 0; t <= len; t += 8) { pts.push([x, y]); a = a * 0.9 + fam * 0.1 + r.range(-0.08, 0.08); x += Math.cos(a) * 8; y += Math.sin(a) * 8 + r.range(-0.4, 0.4); }
    out.push({ pts, al: r.range(0.3, 0.75), w: r.range(0.5, 0.9) });
  }
  return out;
}
function strokeLine(g, pts, dx, dy) {
  g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1] + dy);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + dx, pts[i][1] + dy);
  g.stroke();
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth, u = L.clamp(sw / 75, 0.5, 1.1), small = sw < 45;
  const r = L.rng('g27' + info.key), vn = makeVN('g27vn');
  const mk = () => { const c = L.makeCanvas(S, S); return [c, c.getContext('2d')]; };

  // ── 1. the sheet of leaves, as three vector-painted maps ──
  const leaves = layoutLeaves(info, r, small);
  const [sA, gsA] = mk(), [sB, gsB] = mk(), [cC, gC] = mk();
  gsB.fillStyle = '#000'; gsB.fillRect(0, 0, S, S); gsB.globalCompositeOperation = 'lighter'; gsB.fillStyle = 'rgb(24,0,0)';
  for (const lf of leaves) {
    const dx = Math.cos(lf.gdir) * lf.s * 0.62, dy = Math.sin(lf.gdir) * lf.s * 0.62, hu = Math.round(255 * lf.hue), c = (t) => `rgb(${Math.round(255 * t)},${hu},0)`;
    gsA.fillStyle = L.linear(gsA, lf.cx - dx, lf.cy - dy, lf.cx + dx, lf.cy + dy, [[0, c(lf.t0)], [lf.mid, c(lf.tm)], [1, c(lf.t1)]]);
    gsA.fill(lf.path, 'evenodd');
    gsB.fill(lf.path, 'evenodd');
    gC.save(); gC.clip(lf.path, 'evenodd'); gC.translate(lf.cx, lf.cy); gC.rotate(lf.rot);
    gC.fillStyle = 'rgb(128,128,128)'; gC.fillRect(-lf.s, -lf.s, lf.s * 2, lf.s * 2);
    wrinkles(gC, r, lf.s, u);
    gC.restore();
  }

  // ── 2. cut the sheet to the glyph; chip the outline here and there; scatter crumbs of leaf outside it ──
  const [cA, gA] = mk(), [cB, gB] = mk();
  const over = new Path2D(), bites = [];                                      // scraps of leaf that hang over the outline; chips missing from it
  for (const p of K.outline({ grow: 0, spacing: sw * 0.2, seed: 'g27edge', jitter: 0.9 })) {
    const q = r(), rad = sw * r.range(0.016, q < 0.2 ? 0.046 : 0.056), k = q < 0.2 ? 0.2 : 0.4;
    if (q < 0.2) over.addPath(scrapPath(r, p.x + Math.cos(p.ang) * rad * k, p.y + Math.sin(p.ang) * rad * k, rad));
    else if (q < 0.44) bites.push(scrapPath(r, p.x + Math.cos(p.ang) * rad * k, p.y + Math.sin(p.ang) * rad * k, rad));
  }
  for (const [g, src] of [[gA, sA], [gB, sB]]) {
    g.save(); K.clipGlyph(g); g.drawImage(src, 0, 0); g.restore();
    g.save(); g.clip(over); g.drawImage(src, 0, 0); g.restore();
    g.globalCompositeOperation = 'destination-out';
    for (const bite of bites) g.fill(bite);
  }
  gA.globalCompositeOperation = 'source-over'; gB.globalCompositeOperation = 'lighter';
  const crumb = (x, y, rad) => {
    const p = scrapPath(r, x, y, rad), t = r.range(0.4, 0.9), a = r() * TAU, g0 = Math.round(128 - r.range(10, 34)), g1 = Math.round(128 + r.range(10, 34));
    gA.fillStyle = `rgb(${Math.round(255 * t)},${Math.round(255 * r.range(0.2, 0.8))},0)`; gA.fill(p);
    gB.fillStyle = 'rgb(48,0,0)'; gB.fill(p);                                 // a curled scrap stands a little higher than a laid leaf
    gC.fillStyle = L.linear(gC, x - Math.cos(a) * rad, y - Math.sin(a) * rad, x + Math.cos(a) * rad, y + Math.sin(a) * rad, [[0, `rgb(${g0},${g0},${g0})`], [1, `rgb(${g1},${g1},${g1})`]]);
    gC.fill(p);
  };
  for (const p of K.outline({ grow: 0, spacing: sw * 0.2, seed: 'g27crumb', jitter: 0.9 })) {
    if (!r.chance(small ? 0.2 : 0.36)) continue;
    const big = r.chance(0.07), dist = sw * (big ? r.range(0.14, 0.42) : 0.03 + 0.4 * Math.pow(r(), 2.4)), ta = r.range(-0.1, 0.1) * sw;
    const x = p.x + Math.cos(p.ang) * dist - Math.sin(p.ang) * ta, y = p.y + Math.sin(p.ang) * dist + Math.cos(p.ang) * ta;
    const rad = Math.max(0.5, sw * (big ? r.range(0.05, 0.095) : r.range(0.01, 0.036)));
    if (x < 8 || y < 8 || x > S - 8 || y > S - 8 || K.sdGlyph(x, y) < rad + (big ? sw * 0.09 : 0.6)) continue;   // big scraps keep clear of the strokes, so the gaps stay open
    crumb(x, y, rad);
  }
  for (let n = 0, tries = 0; n < 16 && tries < 600; tries++) {                // a few strays further out
    const b = info.bbox, x = r.range(b.x0 - sw, b.x1 + sw), y = r.range(b.y0 - sw, b.y1 + sw), sd = K.sdGlyph(x, y);
    if (sd < sw * 0.32 || sd > sw * 1.1 || x < 8 || y < 8 || x > S - 8 || y > S - 8) continue;
    crumb(x, y, Math.max(0.5, sw * r.range(0.012, 0.05))); n++;
  }

  // ── 3. light the gold, pixel by device pixel ──
  const A = L.getRaw(cA).data, B = L.getRaw(cB).data, Cb = L.getRaw(cC).data, lut = goldLUT();
  const TH = 0.38 * (0.5 + 0.5 * u), SHD = 0.13 * (0.5 + 0.5 * u), SK = L.clamp(u, 0.6, 1), WR = 0.62 * u, UND = 0.037 * sw, US = 0.3 * sw, PIL = 0.04 * sw, PW = 0.26 * sw, LX = 0.64, LY = 0.77;
  const BWD = Math.max(1.2, 0.04 * sw), BH = 0.62 * BWD;                      // the gilded strokes stand a little proud of the lacquer: a narrow rounded edge
  let specBuf = null;
  const gold = L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const H = new Float32Array(pw * ph), hr = L.rng('g27grain');
    specBuf = new Uint8ClampedArray(pw * ph * 4);
    for (let j = 0, o = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, o++, k += 4) {
        const cov = A[k + 3]; if (!cov) continue;
        const x = (i + 0.5) / q, c = cov / 255, ly = Math.min(6, B[k] * B[k + 3] / 6120);
        const bump = Cb[k + 3] > 8 ? (Cb[k] - 128) / 127 : 0;
        const sd = -K.sdGlyph(x, y); let p = sd / PW, e = sd / BWD; p = p < 0 ? 0 : p > 1 ? 1 : p; e = e < 0 ? 0 : e > 1 ? 1 : e;
        H[o] = TH * ly + (WR * bump + UND * (vn(x / US, y / US) + 0.45 * vn(x / US * 2.3 + 7.1, y / US * 2.3 + 3.3) + 0.07 * vn(x / US * 5.6 + 1.3, y / US * 5.6 + 8.8))) * c + PIL * (1 - (1 - p) * (1 - p)) + BH * e * e * (3 - 2 * e);
      }
    }
    const o1 = (Math.round(1.4 * q * SK) * pw + Math.round(1.0 * q * SK)) * 4, o2 = (Math.max(1, Math.round(0.6 * q * SK)) * pw + Math.max(1, Math.round(0.5 * q * SK))) * 4;
    for (let j = 4; j < ph - 4; j++) {
      const y = (j + 0.5) / q;
      for (let i = 4; i < pw - 4; i++) {
        const o = j * pw + i, k = o * 4, cov = A[k + 3]; if (!cov) continue;
        const x = (i + 0.5) / q, tone = A[k] / 255, hue = A[k + 1] / 255 - 0.5;
        const hx = (H[o + 1] - H[o - 1]) * q * 0.5, hy = (H[o + pw] - H[o - pw]) * q * 0.5;
        let lam = hx * LX + hy * LY; lam = lam / (1 + Math.abs(lam) * 0.8);                         // > 0: this facet looks at the light
        const ly = B[k] * B[k + 3] / 6120, l1 = B[k - o1] * B[k - o1 + 3] / 6120 - ly, l2 = B[k - o2] * B[k - o2 + 3] / 6120 - ly;
        const sh = (l1 > 0 ? (l1 > 1 ? 1 : l1) : 0) * 0.55 + (l2 > 0 ? (l2 > 1 ? 1 : l2) : 0) * 0.45;   // the leaf lying on top, up-left of here, shades this one
        const bump = Cb[k + 3] > 8 ? (Cb[k] - 128) / 127 : 0;
        const gx = x - S * 0.3, gy = y - S * 0.24, sheen = 0.8 + 0.3 * Math.exp(-(gx * gx + gy * gy) / (2 * 0.6 * 0.6 * S * S));
        const grain = 0.012 * vn(x / 1.3 + 31, y / 1.3) + 0.01 * (hr() - 0.5);
        const v = 0.05 + tone * sheen * 0.95 + 0.56 * lam + (lam > 0.2 ? (lam - 0.2) * (lam - 0.2) * 2.4 : 0) - SHD * sh + (bump < 0 ? 0.07 * bump : 0) + (ly > 1 ? 0.02 * Math.min(2, ly - 1) : 0) + grain;
        const idx = (v <= 0 ? 0 : v >= 1.2 ? 1024 : Math.round(v / 1.2 * 1024)) * 3;
        d[k] = lut[idx] * (1 + 0.03 * hue); d[k + 1] = lut[idx + 1] * (1 - 0.012 * hue); d[k + 2] = lut[idx + 2] * (1 - 0.24 * hue); d[k + 3] = cov;
        const sp = 0.1 + 0.6 * tone + 0.9 * lam - 0.4 * sh;
        specBuf[k] = 255; specBuf[k + 1] = 233; specBuf[k + 2] = 172; specBuf[k + 3] = cov * (sp < 0 ? 0 : sp > 1 ? 1 : sp);
      }
    }
  });
  const spec = L.pixelCanvas(S, S, (d) => { d.set(specBuf); });

  // ── 4. the lacquer ground ──
  const c = L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const hr = L.rng('g27dither');
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q, dx = x - S * 0.26, dy = y - S * 0.2, bd = x * 0.8 + y * 0.6 - 560;
        const glow = Math.exp(-(dx * dx + dy * dy) / (2 * 520 * 520)), band = Math.exp(-(bd * bd) / (2 * 170 * 170));
        const n1 = vn(x / 210 + 3.7, y / 210), n2 = vn(x / 26, y / 140 + 5.2), n3 = vn(x / 1.6, y / 1.6 + 9.4);
        const v = 10 + 15 * glow + 7 * band * (0.6 + 0.4 * n1) + 3 * n1 + 1.6 * n2 * (0.3 + glow) + 1.1 * n3 + (hr() - 0.5);
        d[k] = v + 1; d[k + 1] = v * 0.93; d[k + 2] = v * 0.9 + glow * 2.5; d[k + 3] = 255;
      }
    }
  });
  const g = c.getContext('2d');
  const cracks = crazing(r);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const k of cracks) {
    g.strokeStyle = `rgba(0,0,0,${k.al.toFixed(3)})`; g.lineWidth = k.w; strokeLine(g, k.pts, 0, 0);
    g.strokeStyle = `rgba(150,138,122,${(k.al * 0.2).toFixed(3)})`; g.lineWidth = 0.45; strokeLine(g, k.pts, 0.45, 0.6);       // the lower lip of the crack catches the light
  }
  for (let n = 0; n < 90; n++) {                                              // dust
    g.fillStyle = `rgba(170,160,140,${r.range(0.05, 0.16).toFixed(3)})`;
    g.beginPath(); g.ellipse(r() * S, r() * S, r.range(0.35, 0.9), r.range(0.3, 0.7), r() * 3, 0, TAU); g.fill();
  }
  // what the gold does to the ground: a faint warm reflection in the polished lacquer, a tight contact shadow, a softer cast shadow
  const tint = (col) => { const [t, tg] = mk(); tg.drawImage(cA, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, S, S); return t; };
  const sil = tint('#000'), warm = tint('#b27a1e');
  g.save();
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22; g.drawImage(L.blurred(warm, sw * 0.2), 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.7; g.drawImage(L.blurred(sil, 0.04 * sw + 0.4), 0.048 * sw, 0.068 * sw);
  g.globalAlpha = 0.85; g.drawImage(L.blurred(sil, 0.01 * sw + 0.7), 0.5 + 0.01 * sw, 0.8 + 0.014 * sw);
  g.restore();
  K.fillGlyph(g, '#36160c', { grow: -0.7 });                                  // the red-brown size the leaf was laid on shows where the leaf broke
  g.drawImage(gold, 0, 0);
  g.save(); K.clipGlyph(g);                                                   // the crazing runs on through the gilding
  for (const k of cracks) {
    if (k.pts.length < 12 || !r.chance(0.35)) continue;
    g.strokeStyle = `rgba(48,24,6,${(k.al * 0.3).toFixed(3)})`; g.lineWidth = k.w * 0.8; strokeLine(g, k.pts, 0, 0);
    g.strokeStyle = `rgba(255,240,196,${(k.al * 0.16).toFixed(3)})`; g.lineWidth = 0.45; strokeLine(g, k.pts, 0.45, 0.6);
  }
  g.restore();

  // the glint: a soft band across the gold, `shift` px along its own axis from its resting place
  const [tmp, t] = mk(), ux = 0.86, uy = 0.51, wid = 210;
  return (shift) => {
    const cen = 690 + shift, [out, og] = mk();
    t.globalCompositeOperation = 'copy'; t.drawImage(spec, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.fillStyle = L.linear(t, (cen - wid) * ux, (cen - wid) * uy, (cen + wid) * ux, (cen + wid) * uy,
      [[0, 'rgba(0,0,0,0)'], [0.25, 'rgba(0,0,0,0.3)'], [0.5, 'rgba(0,0,0,1)'], [0.75, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
    t.fillRect(0, 0, S, S);
    og.drawImage(c, 0, 0);
    og.globalCompositeOperation = 'lighter'; og.globalAlpha = 0.3; og.drawImage(tmp, 0, 0);
    return out;
  };
}

export default {
  name: '金箔',
  init(env) {
    const bake = build();
    layers = (env && env.frames > 3) ? [bake(-17), bake(17)] : [bake(0)];      // held shot: the glint travels; 3-frame flash: one still picture
  },
  draw(ctx, env, p) {
    ctx.drawImage(layers[0], 0, 0);
    if (layers.length > 1) { ctx.globalAlpha = L.clamp(p || 0); ctx.drawImage(layers[1], 0, 0); }
  },
};
