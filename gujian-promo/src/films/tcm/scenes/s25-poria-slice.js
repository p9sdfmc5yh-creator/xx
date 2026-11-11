// s25 — 茯苓片. Extreme macro of a whole poria sclerotium (茯苓个) cut across, lying on a flat perilla-purple sheet.
// The arc is the silhouette of the piece: a dark-brown band of rind (茯苓皮) of very uneven width — the wrinkled, furrowed
// skin rolling away from the cut face — whose outer lip is rim-lit by the top light as a bold, blobby line of warm yellow.
// Its inner edge is the knife cut: crisp, notched where a furrow reaches it. Under it the powdery white flesh:
// a pale red-brown layer hugs the rind (赤茯苓) and seeps into the white in drip- and tongue-shaped stains with a soft,
// darker tide band, then cleaner and cleaner chalk white with fine grain, pores and a few hairline cracks.
// (Research note: commercial 茯苓片 are peeled before slicing, so this is drawn as the section of a whole sclerotium —
// a thin rind, then pale brown-red, then white.)
//
// Everything is shaded per pixel once in init(), in polar coordinates about the arc centre
// (u = px of arc length from the crest, d = px below the arc): a height field (rind wrinkles, powder grain, cracks)
// is lit from the upper left, the stains come from blurred masks used as soft distance fields.
// draw() = two blits with a tiny rotation about the arc centre + a patch of key light that wanders along the rind's lip.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;
const MT = 110;                    // extra rows above the slice region for the stain masks (so their blur has something to chew on)
const LX = 0.36, LY = 0.93;        // direction the key light travels across the frame (from the upper left)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const sq = (v) => v * v;
const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/** cheap value noise, 0..1 */
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
/** alpha channel of a blurred copy */
function blurAlpha(c, px) {
  const b = L.makeCanvas(c.width, c.height), g = b.getContext('2d', { willReadFrequently: true });
  g.filter = `blur(${px}px)`; g.drawImage(c, 0, 0); g.filter = 'none';
  const d = g.getImageData(0, 0, c.width, c.height).data, out = new Uint8Array(c.width * c.height);
  for (let i = 0, k = 3; i < out.length; i++, k += 4) out[i] = d[k];
  return out;
}

function buildSlice(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 10;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH, MH = RH + MT;
  const nz = L.makeNoise('s25a'), nb = L.makeNoise('s25b');
  const pt = (u, d) => a.pt(u / R, -d);

  // ── 1-D tables along the arc (1 px of arc length per entry) ──
  const UM = Math.ceil(R * 0.6), TN = UM * 2 + 3;
  const E = new Float32Array(TN), T = new Float32Array(TN), LWT = new Float32Array(TN), GATE = new Float32Array(TN), KEY = new Float32Array(TN), SI = new Float32Array(TN), BASE = new Float32Array(TN);
  const rk = L.rng('s25knots'), knots = [];
  for (let i = 0; i < 9; i++) knots.push([rk.range(-1250, 1250), rk.range(55, 135), rk.range(-24, 36)]);
  for (let i = 0; i < TN; i++) {
    const u = i - UM;
    // the silhouette wanders a few px about the arc (rough skin), mean on the arc
    E[i] = 1.9 * nz.n2(u / 52, 1.3) + 1.1 * nz.n2(u / 15, 7.7) + 1.3 * nz.n2(u / 190, 4.1) + 0.45 * nz.n2(u / 5, 2.2);
    // rind thickness: thin on the whole, never the same twice
    let t = 74 + 20 * nz.n2(u / 360, 11.2) + 13 * nz.n2(u / 118, 21.5) + 3 * nz.n2(u / 31, 31.9);
    for (const [ku, kw, kh] of knots) t += kh * Math.exp(-sq((u - ku) / kw));
    T[i] = L.clamp(t, 40, 132);
    // the lit lip: how far the highlight reaches in from the edge, and where it breaks off
    LWT[i] = (15 + 25 * sstep(-0.5, 0.6, nz.n2(u / 170, 41.3) + 0.4 * nz.n2(u / 52, 44.9))) * (0.72 + 0.28 * Math.exp(-sq((u + 160) / 900)));
    GATE[i] = sstep(-0.86, -0.56, nz.n2(u / 150, 51.7) + 0.3 * nz.n2(u / 41, 57.1) + 0.35 * Math.exp(-sq((u + 260) / 420)));
    KEY[i] = 0.7 + 0.3 * Math.exp(-sq((u + 230) / 820));
    // how strongly the red layer has soaked in here, and how deep it sits before the drips start
    SI[i] = 0.58 + 0.42 * sstep(-0.45, 0.45, nz.n2(u / 240, 71.3) + 0.3 * nz.n2(u / 70, 75.9));
    BASE[i] = 22 + 20 * (0.5 + 0.5 * nz.n2(u / 95, 81.1)) + 5 * nz.n2(u / 22, 85.7);
  }
  const tl = (tb, u) => { let f = u + UM; f = f < 0 ? 0 : f > TN - 2 ? TN - 2 : f; const i = f | 0; return tb[i] + (tb[i + 1] - tb[i]) * (f - i); };

  // ── stain masks, drawn as plain shapes and blurred into soft distance fields ──
  const maskCanvas = (draw) => { const c = L.makeCanvas(RW, MH), g = c.getContext('2d'); g.translate(PAD, MT - Y0); g.fillStyle = '#fff'; draw(g); return c; };
  const band = (g, depth) => {
    g.beginPath();
    for (let u = -UM; u <= UM; u += 10) { const p = pt(u, -90); if (u === -UM) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); }
    for (let u = UM; u >= -UM; u -= 5) { const p = pt(u, depth(u)); g.lineTo(p.x, p.y); }
    g.closePath(); g.fill();
  };
  const tongue = (g, u, d0, w, len, tilt, k1, k2) => a.at(g, u / R, -d0, () => {
    g.beginPath(); g.moveTo(-w * 0.5, -8);
    g.bezierCurveTo(-w * k1, len * 0.55, -w * 0.3 + tilt, len, tilt, len);
    g.bezierCurveTo(w * 0.3 + tilt, len, w * k2, len * 0.55, w * 0.5, -8);
    g.closePath(); g.fill();
  });
  // first generation: saturated drips hanging right under the rind
  const m1 = maskCanvas((g) => {
    const r = L.rng('s25dripC');
    band(g, (u) => tl(T, u) + tl(BASE, u));
    for (let u = -UM + 40; u < UM;) {
      const kind = r();
      let w, len;
      if (kind < 0.22) { w = r.range(170, 270); len = r.range(150, 265); }          // a long tongue
      else if (kind < 0.52) { w = r.range(105, 200); len = r.range(68, 150); }      // a drip
      else { w = r.range(50, 120); len = 18 + 70 * r(); }                           // a mere scallop
      tongue(g, u, tl(T, u) + 6, w, len, r.range(-0.18, 0.18) * len, r.range(0.44, 0.6), r.range(0.44, 0.6));
      if (kind < 0.22 && r.chance(0.7)) tongue(g, u + r.sign() * w * r.range(0.3, 0.5), tl(T, u) + 6, w * r.range(0.3, 0.45), len * r.range(0.45, 0.8), r.range(-12, 12), 0.5, 0.5);
      u += w * r.range(0.5, 0.92) + (r.chance(0.22) ? r.range(30, 130) : 0);
    }
  });
  // second generation: a much paler, broader front further in
  const m2 = maskCanvas((g) => {
    const r = L.rng('s25wash');
    band(g, (u) => tl(T, u) + 70 + 45 * nz.n2(u / 300, 91.7));
    for (let u = -UM + 90; u < UM;) {
      const w = r.range(240, 480), len = r.range(70, 215);
      tongue(g, u, tl(T, u) + 60, w, len, r.range(-0.2, 0.2) * len, 0.52, 0.52);
      u += w * r.range(0.6, 1.2);
    }
  });
  const As = blurAlpha(m1, 4), Am = blurAlpha(m1, 17), Al = blurAlpha(m1, 44), Bm = blurAlpha(m2, 28);

  // ── cracks and pores, drawn as thin strokes and read back as a "groove" channel ──
  const crkC = L.makeCanvas(RW, RH);
  {
    const g = crkC.getContext('2d'); g.translate(PAD, -Y0);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const r = L.rng('s25crack');
    const seg = (u0, d0, u1, d1, w, al) => { const p = pt(u0, d0), q = pt(u1, d1); g.globalAlpha = al; g.lineWidth = w; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); };
    // a crack as a run of short straight pieces with sudden kinks, in (u, d); phi = heading (π/2 = straight inward)
    const walk = (u, d, phi, len, w0, w1, al0, al1, wig, branch) => {
      let left = len, home = phi;
      while (left > 0.5) {
        const st = Math.min(left, r.range(9, 34)), q = 1 - left / len;
        const nu = u + Math.cos(phi) * st, nd = d + Math.sin(phi) * st;
        seg(u, d, nu, nd, L.lerp(w0, w1, q) * r.range(0.7, 1.25), L.lerp(al0, al1, q));
        if (branch > 0 && r.chance(branch * st / 8)) walk(nu, nd, phi + r.sign() * r.range(0.6, 1.2), len * r.range(0.08, 0.2), L.lerp(w0, w1, q) * 0.7, 0.4, L.lerp(al0, al1, q) * 0.8, 0.2, wig, 0);
        u = nu; d = nd; left -= st;
        home += r.gauss() * wig * 0.35; phi = home + r.gauss() * wig * 2.4;
      }
    };
    // drying cracks across the rind (龟裂): open at the outer skin, pinching out toward the flesh
    for (let u = -UM + r.range(0, 60); u < UM; u += r.range(110, 380)) {
      const t = tl(T, u);
      walk(u, -3, Math.PI / 2 + r.sign() * r.range(0.15, 0.7), t * r.range(0.4, 0.95), r.range(1.6, 2.8), 0.7, 0.9, 0.5, 0.16, 0.12);
    }
    // … and a few that run with the skin
    for (let u = -UM + 30; u < UM; u += r.range(260, 620)) {
      const t = tl(T, u);
      walk(u, t * r.range(0.4, 0.7), r.range(-0.12, 0.12), r.range(50, 140), r.range(1.4, 2.4), 0.7, 0.8, 0.3, 0.12, 0.1);
    }
    // hairline cracks in the flesh
    const hair = [[-345, 6, 1.9, 360], [520, 200, 0.5, 330], [150, 360, 1.3, 230]];
    for (const [u, d, phi, len] of hair) walk(u, tl(T, u) * (d < 20 ? 0.8 : 0) + d, phi, len, d < 20 ? 3.0 : 2.4, 0.6, 1, 0.3, 0.1, 0.035);
    // pores
    for (let i = 0; i < 150; i++) {
      const u = r.range(-1300, 1300), d = 62 + 640 * Math.pow(r(), 0.8), p = pt(u, d);
      const big = r.chance(0.12);
      g.globalAlpha = r.range(0.2, 0.7);
      g.beginPath(); g.ellipse(p.x, p.y, big ? r.range(2, 3.6) : r.range(0.7, 1.8), big ? r.range(1.4, 2.6) : r.range(0.6, 1.4), r() * 3.14, 0, L.TAU); g.fill();
    }
  }
  const CK = blurAlpha(crkC, 0.55);

  // ── slow fields on a coarse grid ──
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cMot = new Float32Array(cw * ch), cMot2 = new Float32Array(cw * ch), cWx = new Float32Array(cw * ch), cWy = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    cMot[k] = nz.fbm(x / 210 + 5.5, y / 210 - 3.1, 3);
    cMot2[k] = nb.fbm(x / 58 - 11.3, y / 58 + 27.9, 3);
    cWx[k] = nb.n2(x / 44 + 91, y / 44 - 17); cWy[k] = nz.n2(x / 44 - 63, y / 44 + 39);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── pass 1: materials + height ──
  const img = new ImageData(RW, RH), px = img.data;
  const Hh = new Float32Array(N), RM = new Float32Array(N), LP = new Float32Array(N), LQ = new Float32Array(N), EF = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -7) continue;
      const u = Math.atan2(ddx, ddy) * R, dd = d + tl(E, u);
      if (dd <= -0.5) continue;
      const k = j * RW + i, o = k * 4;
      const t0 = tl(T, u);
      let tr = t0, rm = 0, fur = 0;
      if (dd < t0 + 26) {
        // furrows that run down the skin toward the cut; where one reaches the knife edge it leaves a notch
        const fw = u / 31 + 5.5 + 0.5 * nb.n2(u / 60 + 2, dd / 34 - 7);
        fur = sstep(0.78, 0.97, 1 - Math.abs(nz.n2(fw, dd / 120 + 2.5))) * sstep(-0.35, 0.2, nb.n2(u / 150 - 9, dd / 90 + 4));
        tr = t0 + 0.8 * nz.n2(u / 9, d / 9) + 2.4 * nz.n2(u / 34 + 40, d / 36) - 8 * fur;
        rm = 1 - sstep(tr - 1.4, tr + 1.4, dd);
      }
      const ck = CK[k] / 255;
      const g1 = vn(x * 0.59, y * 0.59) - 0.5, g2 = vn(x * 0.21 + 7.3, y * 0.21 + 1.9) - 0.5;
      let cr = 0, cg = 0, cb = 0, hh = 0;

      if (rm < 1) {
        // ── flesh: chalky, matt, a compact of fine powder ──
        const below = dd - tr;
        const mot = bil(cMot, i, j), mot2 = bil(cMot2, i, j);
        const g3 = vn(x * 0.071 + 3.1, y * 0.071 + 9.7) - 0.5;
        const g0 = hash(i, j) - 0.5;
        let fr = 244, fg = 238, fb = 228;
        const kk = 0.02 * mot + 0.004 * mot2;                        // denser / looser patches of powder
        fr *= 1 + kk; fg *= 1 + kk * 1.12; fb *= 1 + kk * 1.5;
        // the red layer: drips with a soft tide band, a pale wash further in
        const wx = bil(cWx, i, j) * 6, wy = bil(cWy, i, j) * 6;
        let ii = (i + wx + 0.5) | 0, jj = (j + MT + wy + 0.5) | 0;
        ii = ii < 0 ? 0 : ii >= RW ? RW - 1 : ii; jj = jj < 0 ? 0 : jj >= MH ? MH - 1 : jj;
        const mk = jj * RW + ii;
        const as = As[mk] / 255, am = Am[mk] / 255, al = Al[mk] / 255, bm = Bm[mk] / 255;
        const nn = 0.18 * (vn(x * 0.11 + 4.4, y * 0.11 - 8.8) - 0.5) + 0.08 * (vn(x * 0.33 - 2.2, y * 0.33 + 6.6) - 0.5);
        const si = tl(SI, u);
        const inside = sstep(0.36, 0.62, am + nn);                    // the soaked region, with rounded drips
        const rim = Math.exp(-sq((am + 0.5 * nn - 0.47) / 0.17));     // its tide band, ~14 px wide and soft
        const core = sstep(0.6, 0.92, al + 0.5 * nn);                 // deeper pockets well inside the broad drips
        const halo = sstep(0.04, 0.5, al) * (1 - inside);
        const body = inside * (0.3 + 0.1 * mot2 + 0.06 * g3) + 0.4 * core * (0.75 + 0.25 * as);
        const line = rim * (0.58 + 0.36 * vn(x * 0.021 + 13.1, y * 0.021 - 4.7));
        let amt = si * (body + line * (1 - 0.55 * body) + 0.2 * halo) * (1 + 0.2 * g1 + 0.18 * g0);
        const wash = 0.2 * sstep(0.3, 0.72, bm + nn) * (0.65 + 0.35 * mot) + 0.07 * Math.exp(-sq((bm + 0.5 * nn - 0.52) / 0.12));
        amt = 1 - (1 - L.clamp(amt)) * (1 - wash);
        const bl = Math.max(0, below);
        const seam = Math.exp(-bl / 26);                              // pale red-brown right against the rind …
        amt = Math.max(amt, 0.96 * seam);
        const dk = L.clamp(sstep(0.45, 1, amt) * 0.6 + 0.42 * seam + 0.3 * line * si);
        const sr = L.lerp(212, 172, dk), sg = L.lerp(140, 88, dk), sb = L.lerp(122, 70, dk);
        fr += (sr - fr) * amt; fg += (sg - fg) * amt; fb += (sb - fb) * amt;
        const brn = 0.78 * Math.exp(-bl / 6.5);                       // … and a thin, darker brown line where flesh meets skin
        fr += (112 - fr) * brn; fg += (62 - fg) * brn; fb += (44 - fb) * brn;
        // powder grain, bright crumbs, the odd brown fleck
        const gr = 0.034 * g0 + 0.03 * g1 + 0.014 * g2;
        fr *= 1 + gr; fg *= 1 + gr; fb *= 1 + gr * 1.1;
        if (g0 > 0.4955) { fr += 9; fg += 9; fb += 10; } else if (g0 < -0.4984) { fr *= 0.84; fg *= 0.78; fb *= 0.72; }
        // grooves
        if (ck > 0) { const q = ck * 0.6; fr += (132 - fr) * q; fg += (100 - fg) * q; fb += (86 - fb) * q; }
        // the light falls off toward the bottom and the right
        const lg = 1.03 - 0.1 * sstep(120, 640, d) - 0.04 * sstep(380, 1100, x - 820) - 0.02 * sstep(300, 1000, 700 - x);
        fr *= lg; fg *= lg * (1 - (1.03 - lg) * 0.12); fb *= lg * (1 - (1.03 - lg) * 0.4);
        cr = fr; cg = fg; cb = fb;
        hh = 0.55 * g1 + 0.2 * g2 + 0.12 * mot2 - 3.2 * ck;
      }
      if (rm > 0) {
        // ── rind: the dark wrinkled skin rolling away from the cut face ──
        const lw = tl(LWT, u), gate = tl(GATE, u), dp = Math.max(0, dd);
        const wp = 9 * nb.n2(u / 120, dd / 70);
        const wr = sq(1 - Math.abs(nb.n2((u + wp) / 84, dd / 27 + 3.3)));          // long ridges running with the edge
        const wr2 = sq(1 - Math.abs(nb.n2(u / 31 + 9.1, dd / 12 - 3.7)));
        const fine = nz.n2(u / 7 + 50, dd / 5);
        const hb = 4 + 8 * sstep(0, 0.6 * t0, dd) + 5.5 * wr + 1.1 * wr2 + 0.22 * fine - 3.6 * fur - 1.1 * ck;
        const tone = L.clamp(0.5 + 0.5 * nb.n2(u / 160 + 3, dd / 80 + 8) + 0.18 * (wr - 0.4));
        let ar = L.lerp(31, 58, tone), ag = L.lerp(18, 35, tone), ab = L.lerp(12, 23, tone);
        // earth still clinging to the crests
        const dust = 0.13 * sstep(0.55, 0.95, wr) * (0.4 + 0.6 * vn(x * 0.05, y * 0.05));
        ar += (120 - ar) * dust; ag += (84 - ag) * dust; ab += (54 - ab) * dust;
        const gk = (1 + 0.1 * g1 + 0.1 * g2) * (1 - 0.7 * ck) * (1 - 0.45 * fur);
        ar *= gk; ag *= gk; ab *= gk;
        // the knife edge: the thin section of the skin catches a little light — a broken tan line
        const ke = Math.exp(-sq((dd - (tr - 3.2)) / 2.3)) * (0.18 + 0.5 * sstep(0.35, 0.75, vn(u * 0.022 + 7.7, 3.1))) * (1 - fur);
        ar += (158 - ar) * ke; ag += (106 - ag) * ke; ab += (66 - ab) * ke;
        // top light on the lip: a bold band of warm yellow that reaches in as far as LWT says; its inner edge is a crisp, blobby
        // terminator, notched by every furrow that crosses it, with a few loose glints on the ridge crests below
        const en = 0.62 * nb.n2(u / 58 + 1.7, dd / 15 + 5.3) + 0.17 * nb.n2(u / 17 + 9.1, dd / 7 - 2.2) + 0.1 * (wr2 - 0.35);
        const q = (1 - dp / lw) + en - 1.3 * fur * sstep(0.1, 0.7, dp / lw) - 0.5 * ck;
        const bandL = sstep(0, 0.11, q) * gate;
        const fleck = sstep(0.8, 0.92, vn(u * 0.075 + 3, dd * 0.3 + 8)) * Math.exp(-dp / (2.6 * lw)) * (0.45 + 0.55 * gate) * sstep(0.3, 0.7, wr) * 0.85;
        const thin = sstep(0.3, 0.62, Math.exp(-dp / 2.6) * (0.6 + 0.4 * gate) * (1 - 0.6 * ck));   // the lip itself never quite loses the light
        LP[k] = tl(KEY, u) * Math.max(bandL, fleck, 0.9 * thin) * rm; LQ[k] = Math.max(q, fleck * 0.45, thin * 0.6);
        cr = cr * (1 - rm) + ar * rm; cg = cg * (1 - rm) + ag * rm; cb = cb * (1 - rm) + ab * rm;
        hh = hh * (1 - rm) + hb * rm;
      }
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = dd < 0.5 ? (dd + 0.5) * 255 : 255;
      Hh[k] = hh; RM[k] = rm; EF[k] = sstep(0.4, 2.6, dd);
    }
  }

  // ── pass 2: light the height field ──
  const SH = Math.min(RH, Math.ceil(a.yAt(X0) - Y0) + 120);
  const spImg = new ImageData(RW, SH), sp = spImg.data;
  for (let j = 1; j < RH - 1; j++) {
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, o = k * 4;
      if (!px[o + 3]) continue;
      const rel = ((Hh[k + 1] - Hh[k - 1]) * LX + (Hh[k + RW] - Hh[k - RW]) * LY) * 0.5 * EF[k];
      const rm = RM[k];
      let f = 1 + rel * 0.36; f = f < 0.78 ? 0.78 : f > 1.16 ? 1.16 : f;
      let cr = px[o] * f, cg = px[o + 1] * f, cb = px[o + 2] * f;
      if (rm > 0) {
        let v = rel * 1.1; v = v < -1 ? -1 : v > 1.3 ? 1.3 : v;
        const df = v >= 0 ? 0.82 + 0.72 * v : 0.82 + 0.5 * v;
        let rr = px[o] * df, rg = px[o + 1] * df, rb = px[o + 2] * df;
        if (v < 0) { rr += 138 * -v * 0.1; rg += 47 * -v * 0.1; rb += 127 * -v * 0.1; }   // the purple sheet bounces into the shadows
        let s = Math.max(LP[k], 0.07 * sstep(0.75, 1.25, v));
        if (s > 0) {
          if (s > 1) s = 1;
          const q = LQ[k], cq = LP[k] > 0 ? sstep(0.03, 0.85, q) : 0.3, hot = sstep(0.9, 1.4, q) * 0.5;   // ochre at the terminator → warm yellow → a pale hot core at the very lip
          const sh = 0.92 + 0.14 * L.clamp(v, -0.5, 0.6);                                                      // the lit skin still shows its wrinkles
          const hr = (L.lerp(192, 241, cq) + 13 * hot) * Math.min(1, sh + 0.06), hg = (L.lerp(126, 213, cq) + 30 * hot) * sh, hbb = (L.lerp(56, 139, cq) + 66 * hot) * sh;
          rr += (hr - rr) * s; rg += (hg - rg) * s; rb += (hbb - rb) * s;
          if (j < SH) { sp[o] = hr; sp[o + 1] = hg; sp[o + 2] = hbb; sp[o + 3] = s * rm * 255; }
        }
        cr += (rr - cr) * rm; cg += (rg - cg) * rm; cb += (rb - cb) * rm;
      }
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb;
    }
  }
  const slice = L.makeCanvas(RW, RH), sg = slice.getContext('2d');
  sg.putImageData(img, 0, 0);
  const spec = L.makeCanvas(RW, SH); spec.getContext('2d').putImageData(spImg, 0, 0);

  // ── depth of field: sharp under the crest, the powder goes soft toward the bottom of frame ──
  const soft = L.blurred(slice, 6.5), fg = soft.getContext('2d');
  fg.globalCompositeOperation = 'destination-in';
  fg.fillStyle = L.radial(fg, cx + PAD, cy - Y0, R - 620, R - 210, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);   // fully soft 620 px in, sharp from 210 px
  fg.fillRect(0, 0, RW, RH);
  sg.drawImage(soft, 0, 0);
  // … and a touch toward the two ends of the arc
  const side = L.blurred(slice, 3), dg = side.getContext('2d');
  dg.globalCompositeOperation = 'destination-in';
  dg.fillStyle = L.linear(dg, 0, 0, RW, 0, [[0, 'rgba(0,0,0,1)'], [0.16, 'rgba(0,0,0,0.6)'], [0.34, 'rgba(0,0,0,0)'], [0.68, 'rgba(0,0,0,0)'], [0.86, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,1)']]);
  dg.fillRect(0, 0, RW, RH);
  sg.drawImage(side, 0, 0);

  return { slice, spec, bloom: L.blurred(spec, 7), X0, Y0, RW, SH, tmp: L.makeCanvas(RW, SH) };
}

/** the sheet underneath: one flat field of perilla purple, nothing on it but paper tooth */
function buildBack(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.fillStyle = '#8a2f7f'; full();
    g.fillStyle = L.radial(g, 820, 330, 120, 1500, [[0, 'rgba(166,60,150,0.2)'], [0.45, 'rgba(138,47,127,0)'], [1, 'rgba(92,26,90,0.34)']]); full();
    g.fillStyle = L.radial(g, a.cx + 110, a.cy + 6, a.R - 6, a.R + 54, [[0, 'rgba(70,16,72,0.26)'], [0.35, 'rgba(70,16,72,0.11)'], [1, 'rgba(70,16,72,0)']]); full();
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.2;
    g.drawImage(L.noiseLayer(PAD, { seed: 's25paper', scale: 2.6, octaves: 2, res: 0.6, contrast: 1.6 }), -PAD, -PAD);
    g.globalAlpha = 0.05;
    g.drawImage(L.noiseLayer(PAD, { seed: 's25cloud', scale: 320, octaves: 3, res: 0.2, contrast: 1.4 }), -PAD, -PAD);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
    g.drawImage(L.grainTex(W + PAD * 2, H + PAD * 2, { seed: 25, amount: 0.16 }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
}

export default {
  name: '茯苓片',
  tone: 'light',
  init(env) {
    S = { back: buildBack(env), ...buildSlice(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.0065, 0.0065, p);
    L.blit(ctx, env, S.back, { rot });
    // the key light's hot patch drifts along the lip, against the slide of the slice
    const tg = S.tmp.getContext('2d');
    tg.globalCompositeOperation = 'copy'; tg.drawImage(S.spec, 0, 0);
    const hp = a.pt(L.lerp(-0.2, -0.02, p), -10);
    tg.globalCompositeOperation = 'destination-in';
    tg.fillStyle = L.radial(tg, hp.x - S.X0, hp.y - S.Y0, 40, 560, [[0, 'rgba(0,0,0,0.6)'], [0.5, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
    tg.fillRect(0, 0, S.RW, S.SH);
    L.cam(ctx, env, { rot }, () => {
      ctx.drawImage(S.slice, S.X0, S.Y0);
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(S.tmp, S.X0, S.Y0);
      ctx.globalAlpha = 0.4;
      ctx.drawImage(S.bloom, S.X0, S.Y0);
    });
  },
};
