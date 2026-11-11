// s01 — 天青碗沿晨光. The opening "horizon" of 《中国古玩》: the far lip of a sky-blue (天青) glazed bowl in extreme
// close-up, photographed against the light. The arc is the rim. Below it the bowl wall is in shadow — night blue, with
// only a breath of glaze glowing just under the lip, and in that glow the crackle of the glaze (开片). On the lip the
// glaze is thinnest, and it carries one soft moon-white highlight; above it the light blooms tianqing → blue-green →
// night blue. Nothing else: the space above keeps darkening for well over a frame height, because the title card is
// simply the camera tilted up into that darkness (see lib/titlecard.js) before it comes back down onto this exact image
// and the film loops.
//
// It is meant to read as a macro photograph, not as a drawn glow:
//   · depth of field — the lens is focused on the crest of the rim; toward both ends of the frame the lip, its highlight,
//     the crackle and the bubbles all fall softly out of focus (the edge stays centred on the arc, it only softens);
//   · the highlight has a shape — it is a band a few px deep that sits ON the lip (crisp upper edge, soft lower edge), its
//     strength and depth wander along the rim, crackle lines nick it, and it blooms a little like a hot edge does on film;
//   · two masses — light above, dark below, meeting on the arc; the glow under the lip falls away fast and then lingers;
//   · the light above is one clean gradient (no rings, no veils): it only swells and thins slowly along the rim, a little
//     deeper toward the left;
//   · the crackle is the fine, layered kind of Ru ware (蝉翼纹): the glaze has broken into flakes of every size, large
//     ones next to patches of small ones, and the back light that travels inside the glaze leaks out at every crack — a
//     hairline of light with a soft glow on its far side, and each flake a little brighter along its upper edge than its
//     lower one, like scales laid over one another. It is faint, it is squeezed flat where the lip rolls away from the
//     lens, it dies out down the wall and it is all but gone where the brand line sits.
//
// Everything static is shaded per pixel in init() with a dithered float pipeline (8-bit gradients this dark would band):
//   base   — the "before dawn" state, tall enough for the tilt
//   bright — the "first light" state, same geometry
//   lip    — the moon-white highlight on the lip (alpha only)
// Each frame is base + bright seen through a soft horizontal envelope that widens with k, so the light spreads outward
// along the rim from the crest; the lip highlight rides on top through a narrower envelope of its own.
import * as L from '../../../lib/core.js';

const { W, H } = L;

export const TITLE_TILT = 800;   // how far the title card tilts up (px)

const MX = 8;                    // spare pixels left / right / below (the camera only ever pushes in, never out)
const TOP = TITLE_TILT + 40;     // rows painted above the frame for the tilt
const CW = W + MX * 2;
const Q = 4, TMAX = 2800;        // colour LUTs: 0.25 px steps out to 2800 px from the rim
const UMAX = 1300;               // half-length of the 1-D tables that run along the rim (px of arc length)
const RL = 220;                  // the lip rolls away from the lens over this many px (foreshortens the crackle toward the rim)
const NR = 64;                   // the out-of-focus rim profiles cover this many px either side of the rim
const HR = 96;                   // the lip highlight, bloom included, reaches this far from the rim
const SAME = 830;                // from this distance above the rim upward "bright" and "base" are the same picture
const DC = 190;                  // crackle is only ever visible this far down the wall
const MU = 16, MT = 16, MTOP = 780;   // swell table: cell size along the rim / away from it, and how far up it applies
const VU = 16;                   // cell size of the table that says where the crackle catches the light (px of glaze)
const TONE = 0.3;                // how much the flakes of glaze differ in value, next to a crack at full strength
const ZOOM = 0.014;              // the push-in over the shot
const SIG = [0.5, 0.85, 1.4, 2.2, 3.3, 4.8, 6.8, 9];   // blur radii (px) the depth of field is tabulated for
let S = null;

// ── colour by distance from the rim (px). Task palette: 月白 #e6f3ef · 天青 #8fc9c4 · 青蓝 #3f7f9a · 夜蓝 #0d1b3a · #050a16 ──
const FAR = [[495, '#0d1b3a'], [650, '#0a152e'], [850, '#070f22'], [1150, '#050a16'], [2800, '#04080f']];
// (the stops are chosen so that red, green and blue each fall away at a pace that never changes abruptly: a knee in any
// of them would read as the edge of a band of colour)
const SKY_BRIGHT = [[0, '#bde2dd'], [5, '#b1dcd7'], [14, '#a6d6d1'], [30, '#9ad0cb'], [54, '#8fc9c4'], [87, '#7ec1c3'], [134, '#65b1be'],
  [182, '#509cb0'], [240, '#3c7f9e'], [292, '#2e6990'], [362, '#20507e'], [434, '#173b6a'], [508, '#122b53'], [586, '#0e2042'], [707, '#0a152e'], [837, '#070f22']];
const SKY_DIM = [[0, '#5a9cae'], [2.5, '#468aa0'], [9, '#3f7f9a'], [26, '#35708f'], [58, '#2a5d82'], [105, '#204b74'], [165, '#183b66'], [240, '#132e58'],
  [320, '#10254b'], [422, '#0e1f41'], ...FAR];
const DEEP = [[300, '#071123'], [430, '#060e1e'], [620, '#050b18'], [1400, '#04080f']];
// under the lip the light drops fast (the wall is in shadow) and then lingers as a long, low glow inside the glaze
const BODY_BRIGHT = [[0, '#c4e5e0'], [1.2, '#aad7d2'], [2.6, '#8fc9c4'], [4.5, '#6aaeb6'], [7, '#4f93a6'], [10.5, '#3d7b96'], [16, '#2e6587'], [25, '#225276'],
  [38, '#194064'], [56, '#123152'], [80, '#0d2542'], [112, '#0a1c35'], [155, '#09172d'], [215, '#081428'], ...DEEP];
const BODY_DIM = [[0, '#5a9cae'], [1.3, '#4f93a6'], [3, '#3a7893'], [7, '#2a5f80'], [14, '#1e496c'], [26, '#163859'], [46, '#102948'], [80, '#0c1e3a'],
  [120, '#0a1830'], [170, '#09152b'], [240, '#081326'], ...DEEP];
const MOON = [233, 245, 241];    // the lip highlight (月白)

const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

/**
 * colour ramp through [distance, css colour] stops as one smooth curve: a natural cubic spline, so that not only the
 * colour but also the pace and the bend of the fall-off are continuous (a kink at a stop would show as a faint ring).
 * The spline runs in log-distance, where the stops are evenly spread, and is held between the two stops it is passing.
 */
function smoothRamp(stops) {
  const warp = (t) => Math.log(1 + t / 9);
  const xs = stops.map((st) => warp(st[0])), cs = stops.map((st) => L.parseColor(st[1])), n = xs.length;
  const ms = [0, 1, 2].map((ch) => {
    const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n), m = new Float64Array(n);
    b[0] = b[n - 1] = 1;
    for (let i = 1; i < n - 1; i++) {
      const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
      a[i] = h0; b[i] = 2 * (h0 + h1); c[i] = h1;
      d[i] = 6 * ((cs[i + 1][ch] - cs[i][ch]) / h1 - (cs[i][ch] - cs[i - 1][ch]) / h0);
    }
    for (let i = 1; i < n; i++) { const k = a[i] / b[i - 1]; b[i] -= k * c[i - 1]; d[i] -= k * d[i - 1]; }
    m[n - 1] = d[n - 1] / b[n - 1];
    for (let i = n - 2; i >= 0; i--) m[i] = (d[i] - c[i] * m[i + 1]) / b[i];
    return m;
  });
  return (t) => {
    const x = warp(t);
    if (x <= xs[0]) return cs[0];
    if (x >= xs[n - 1]) return cs[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], A = (xs[i + 1] - x) / h, B = (x - xs[i]) / h, k = (h * h) / 6;
    return [0, 1, 2].map((ch) => {
      const p = cs[i][ch], q = cs[i + 1][ch], v = A * p + B * q + ((A * A * A - A) * ms[ch][i] + (B * B * B - B) * ms[ch][i + 1]) * k;
      return p < q ? (v < p ? p : v > q ? q : v) : v < q ? q : v > p ? p : v;
    });
  };
}

/** colour function → Float32 LUT; the kinks between stops are rounded off more and more with distance from the rim (the rim itself stays crisp) */
function buildLut(f) {
  const n = TMAX * Q + 4, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / Q, rad = Math.min(48, t * 0.17);
    let r = 0, g = 0, b = 0;
    for (let k = -4; k <= 4; k++) { const c = f(Math.max(0, t + (k / 4) * rad)); r += c[0]; g += c[1]; b += c[2]; }
    out[i * 3] = r / 9; out[i * 3 + 1] = g / 9; out[i * 3 + 2] = b / 9;
  }
  return out;
}
/** ramp `fa` handing over to ramp `fb` between distances a and b */
const handOver = (fa, fb, a, b) => (t) => {
  const k = sstep(a, b, t);
  if (k <= 0) return fa(t);
  if (k >= 1) return fb(t);
  const p = fa(t), q = fb(t);
  return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
};

// ── depth of field ──
/** blur radius (px) at arc-length U from the crest: sharp on the crest, soft by the ends of the frame */
const sigmaOf = (U) => 0.5 + 5.8 * Math.pow(Math.min(1.3, Math.abs(U) / 1000), 1.7);
/** |U| (px) → fractional index into SIG */
function levelTable() {
  const t = new Float32Array(UMAX + 2), last = SIG.length - 1;
  for (let i = 0; i < t.length; i++) {
    const s = Math.min(SIG[last], sigmaOf(i));
    let j = 0;
    while (j < last - 1 && s > SIG[j + 1]) j++;
    t[i] = j + L.clamp((s - SIG[j]) / (SIG[j + 1] - SIG[j]));
  }
  return t;
}
/** gaussian-blur a 1-D profile (ch channels, Q samples per px) once per SIG level, returning the middle `half` px either side */
function blurLevels(src, n, ch, pad, half) {
  const m = half * Q * 2 + 1;
  return SIG.map((sg) => {
    const rad = Math.ceil(sg * 3 * Q), ker = new Float32Array(rad * 2 + 1), out = new Float32Array((m + 1) * ch);
    let sum = 0;
    for (let k = -rad; k <= rad; k++) { const w = Math.exp(-0.5 * (k / (sg * Q)) * (k / (sg * Q))); ker[k + rad] = w; sum += w; }
    for (let i = 0; i <= m; i++) {
      const c = Math.min(i, m - 1) + pad * Q;
      for (let h = 0; h < ch; h++) {
        let v = 0;
        for (let k = -rad; k <= rad; k++) v += src[Math.min(n - 1, Math.max(0, c + k)) * ch + h] * ker[k + rad];
        out[i * ch + h] = v / sum;
      }
    }
    return out;
  });
}
/** the picture across the rim (sky above, wall below) as it looks at each amount of defocus */
function rimProfiles(sky, body) {
  const pad = 30, half = (NR + pad) * Q, n = half * 2 + 1, src = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = (i - half) / Q, lut = s >= 0 ? sky : body, q = Math.round(Math.abs(s) * Q) * 3;
    src[i * 3] = lut[q]; src[i * 3 + 1] = lut[q + 1]; src[i * 3 + 2] = lut[q + 2];
  }
  return blurLevels(src, n, 3, pad, NR);
}
/**
 * the highlight on the lip, across the rim: a band that begins exactly at the rim, stays full for a couple of px and
 * dies away down the wall, plus the bloom a hot edge throws on film. Index: depth below the rim (negative = above it).
 */
function lipProfiles() {
  const pad = 30, half = (HR + pad) * Q, n = half * 2 + 1, src = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = (i - half) / Q;
    const core = d < 0 ? 0 : d < 3 ? 1 : Math.exp(-((d - 3) / 2.4) * ((d - 3) / 2.4));
    const bloom = 0.2 * Math.exp(-((d - 2) / 8) * ((d - 2) / 8)) + 0.07 * Math.exp(-Math.abs(d - 2) / 26);
    src[i] = core + bloom * (1 - core);
  }
  return blurLevels(src, n, 1, pad, HR);
}

/**
 * the light above the rim swells and thins along its length, in one long breath, and runs a little deeper toward the left.
 * Nothing here ripples across the gradient: a ring or a veil that follows the rim would read as a colour band.
 */
function swellTable() {
  const nz = L.makeNoise('s01bands');
  const nu = Math.ceil((UMAX * 2) / MU) + 2, nt = Math.ceil(MTOP / MT) + 3, m = new Float32Array(nu * nt);
  for (let j = 0; j < nt; j++) {
    const t = j * MT, fade = 1 - sstep(520, 740, t);
    for (let i = 0; i < nu; i++) {
      const U = i * MU - UMAX;
      m[j * nu + i] = 1 + fade * (0.07 * nz.n2(U / 760 + 3.3, t / 560 + 1.1) - 0.075 * L.clamp(U / 1000, -1.2, 1.2));
    }
  }
  return { m, nu };
}

const LIP = RL * Math.PI / 2;    // surface distance covered by the rolled part of the lip
/** depth below the rim on screen (px) → distance down the glaze surface, and back */
const surfV = (d) => (d < RL ? RL * Math.acos(1 - d / RL) : LIP + (d - RL));
const depthOf = (V) => (V <= 0 ? 0 : V < LIP ? RL * (1 - Math.cos(V / RL)) : RL + (V - LIP));

/**
 * 开片, the fine layered kind (蝉翼纹). Crazing grows by subdivision: a new crack crosses a flake of glaze the short way,
 * a little off-centre and off-square, bows as it goes and stops at the cracks it meets (T-junctions, never crossings).
 * The first cracks are the longest and the boldest; every later generation is fainter. How far a flake goes on breaking
 * is drawn afresh for each one, so big flakes are left standing right next to finely crazed patches (大小片相间), and
 * here and there a crack has only started: it runs part of the way into a flake and tapers out.
 * Built in glaze-surface coordinates (U along the rim, V down the wall). Returns the cracks as dense polylines with a
 * strength, and the flakes as polygons that share those very points.
 */
function crackle() {
  const r = L.rng('s01crackle'), nzp = L.makeNoise('s01craze'), cracks = [], cells = [];
  const STEP = 7;   // spacing of the points along a crack (px of glaze)
  /** first hit of a ray leaving an inside point with the flake's outline */
  const cast = (P, ox, oy, dx, dy) => {
    let best = 1e9, hi = -1;
    for (let i = 0, n = P.length; i < n; i++) {
      const c = P[i], e = P[(i + 1) % n], ex = e[0] - c[0], ey = e[1] - c[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const tt = ((c[0] - ox) * ey - (c[1] - oy) * ex) / den, ss = ((c[0] - ox) * dy - (c[1] - oy) * dx) / den;
      if (tt > 1e-6 && ss >= 0 && ss <= 1 && tt < best) { best = tt; hi = i; }
    }
    return hi < 0 ? null : { i: hi, t: best, x: ox + dx * best, y: oy + dy * best };
  };
  const inside = (P, x, y) => {
    let c = false;
    for (let i = 0, n = P.length, j = n - 1; i < n; j = i++) {
      const p = P[i], q = P[j];
      if ((p[1] > y) !== (q[1] > y) && x < ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]) + p[0]) c = !c;
    }
    return c;
  };
  /** a crack from p to q that bows sideways by `bow` (a fraction of its length), as a dense polyline */
  const bowed = (p, q, bow) => {
    const n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / STEP)), out = [];
    const mx = (p[0] + q[0]) / 2 - (q[1] - p[1]) * bow, my = (p[1] + q[1]) / 2 + (q[0] - p[0]) * bow;
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p[0] + 2 * u * t * mx + t * t * q[0], u * u * p[1] + 2 * u * t * my + t * t * q[1]]); }
    return out;
  };
  const strength = (A) => L.clamp(0.3 + 0.2 * Math.log2(A / 1200), 0.3, 1) * r.range(0.62, 1);
  const split = (P, lvl) => {
    const n = P.length;
    let A2 = 0, cu = 0, cv = 0;
    for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n], w = p[0] * q[1] - q[0] * p[1]; A2 += w; cu += (p[0] + q[0]) * w; cv += (p[1] + q[1]) * w; }
    if (Math.abs(A2) < 16) return;
    cu /= 3 * A2; cv /= 3 * A2;
    const A = Math.abs(A2) / 2;
    // the flake's long axis, from the second moments of its outline
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]), x = (p[0] + q[0]) / 2 - cu, y = (p[1] + q[1]) / 2 - cv;
      sxx += l * x * x; sxy += l * x * y; syy += l * y * y;
    }
    const ax = 0.5 * Math.atan2(2 * sxy, sxx - syy), ex = Math.cos(ax), ey = Math.sin(ax);
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) { const t = (P[i][0] - cu) * ex + (P[i][1] - cv) * ey; if (t < lo) lo = t; if (t > hi) hi = t; }
    // 0 = the glaze has broken into large flakes here, 1 = it has crazed fine
    const z = sstep(-0.45, 0.25, nzp.fbm(cu / 460 + 4.4, cv / 460 - 9.1, 2)), aMin = L.lerp(1500, 420, z), aMax = L.lerp(14000, 2400, z);
    const stop = lvl > 20 || A < aMin * Math.pow(aMax / aMin, r());
    const aim = (qx, qy, da) => {
      if (!inside(P, qx, qy)) return null;
      const dx = Math.cos(da), dy = Math.sin(da), h1 = cast(P, qx, qy, dx, dy), h2 = cast(P, qx, qy, -dx, -dy);
      return h1 && h2 && h1.i !== h2.i ? { h1, h2 } : null;
    };
    const da = ax + Math.PI / 2 + L.clamp(r.gauss() * 0.28, -0.6, 0.6), off = r.range(-0.24, 0.24) * (hi - lo);
    const hit = aim(cu + ex * off, cv + ey * off, da) || aim(cu, cv, da);
    if (stop || !hit) {
      // a flake: its value, and the way the light falls off across it (brightest along the edge that faces the rim)
      const ga = Math.PI / 2 + L.clamp(r.gauss() * 0.4, -0.9, 0.9), gx = Math.cos(ga), gy = Math.sin(ga);
      let ext = 1;
      for (let i = 0; i < n; i++) { const t = Math.abs((P[i][0] - cu) * gx + (P[i][1] - cv) * gy); if (t > ext) ext = t; }
      // one flake in a dozen lies at just the angle to throw the light back (the shimmer the crackle is named for)
      const glint = r.chance(0.085);
      cells.push({ P, cu, cv, gx, gy, ext, base: glint ? r.range(0.55, 1) : L.clamp(r.gauss() * 0.3, -0.5, 0.7), amp: glint ? r.range(0.3, 0.5) : r.range(0.22, 0.55) });
      // now and then a crack has only started (it tapers out inside the flake), or one lies deeper in the glaze, under
      // the surface: no hairline to it, only its glow
      if (hit && A > 1000 && r.chance(0.42)) {
        const { h1, h2 } = hit, deep = r.chance(0.45), f = deep ? 1 : r.range(0.3, 0.72);
        cracks.push({ pts: bowed([h2.x, h2.y], [L.lerp(h2.x, h1.x, f), L.lerp(h2.y, h1.y, f)], L.clamp(r.gauss() * 0.07, -0.16, 0.16)), k: strength(A) * 0.85, taper: !deep, deep });
      }
      return;
    }
    const { h1, h2 } = hit, pts = bowed([h2.x, h2.y], [h1.x, h1.y], L.clamp(r.gauss() * 0.05, -0.13, 0.13));
    cracks.push({ pts, k: strength(A), taper: false, deep: false });
    const P1 = pts.slice(), P2 = pts.slice().reverse();
    for (let i = (h1.i + 1) % n; ; i = (i + 1) % n) { P1.push(P[i]); if (i === h2.i) break; }
    for (let i = (h2.i + 1) % n; ; i = (i + 1) % n) { P2.push(P[i]); if (i === h1.i) break; }
    split(P1, lvl + 1); split(P2, lvl + 1);
  };
  split([[-UMAX, -46], [UMAX, -46], [UMAX, 420], [-UMAX, 420]], 0);
  return { cracks, cells };
}

/** outline of a line of varying half-width through screen points — filled, it anti-aliases cleanly and has no joints */
function ribbon(g, pts, hw) {
  const n = pts.length, lx = new Float32Array(n), ly = new Float32Array(n), rx = new Float32Array(n), ry = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i < 1 ? 0 : i - 1], q = pts[i > n - 2 ? n - 1 : i + 1];
    let nx = p.y - q.y, ny = q.x - p.x;
    const m = Math.hypot(nx, ny) || 1;
    nx /= m; ny /= m;
    lx[i] = pts[i].x + nx * hw[i]; ly[i] = pts[i].y + ny * hw[i]; rx[i] = pts[i].x - nx * hw[i]; ry[i] = pts[i].y - ny * hw[i];
  }
  g.beginPath(); g.moveTo(lx[0], ly[0]);
  for (let i = 1; i < n; i++) g.lineTo(lx[i], ly[i]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(rx[i], ry[i]);
  g.closePath();
}

/**
 * per-pixel fields of the bowl wall just under the rim: how much light the crackle adds at each pixel (already out of
 * focus where the lens is), where cracks cross the lip, and the glaze depth along the rim
 */
function buildFields(a) {
  const R = a.R, cx = a.cx, cy = a.cy;
  const y0 = Math.floor(a.crestY) - 1, hgt = Math.min(H + MX, Math.ceil(a.yAt(-MX)) + DC + 4) - y0;
  const nz = L.makeNoise('s01glaze'), nw = L.makeNoise('s01warp'), rr = L.rng('s01hair');
  // glaze thickness along the rim: the glow sinks a little deeper here, a little shallower there
  const gmod = new Float32Array(UMAX * 2 + 2);
  for (let i = 0; i < gmod.length; i++) { const U = i - UMAX; gmod[i] = 1 + 0.26 * nz.fbm(U / 520 + 3.1, 0.7, 3) + 0.06 * nz.n2(U / 70, 9.4); }
  // glaze surface → screen. One smooth warp for everything, so cracks and flakes wander a little and still meet exactly;
  // then the lip rolls away from the lens: toward the rim the flakes are squeezed flat
  const warpU = (U0, V0) => U0 + 22 * nw.n2(U0 / 320 + 5.2, V0 / 320) + 3 * nw.n2(U0 / 90 + 1.7, V0 / 90 + 3.3) + 1.1 * nw.n2(U0 / 23 + 9.1, V0 / 23 - 4.2);
  const warpV = (U0, V0) => V0 + 22 * nw.n2(U0 / 320 - 17.3, V0 / 320 + 40.1) + 3 * nw.n2(U0 / 90 - 22.9, V0 / 90 + 61.4) + 1.1 * nw.n2(U0 / 23 - 31.7, V0 / 23 + 12.6);
  const at = (U0, V0) => { const U = warpU(U0, V0), V = warpV(U0, V0), s = a.pt(U / R, -depthOf(V)); s.U = U; s.V = V; return s; };
  const seen = new Map();
  const scr = (p) => { let s = seen.get(p); if (!s) { s = at(p[0], p[1]); seen.set(p, s); } return s; };
  const net = crackle();
  // hard: red = value of the flakes (128 = neutral), green = the hairlines.  soft: green = the glow beside each crack
  const hard = L.makeCanvas(CW, hgt), hg = hard.getContext('2d', { willReadFrequently: true });
  const soft = L.makeCanvas(CW, hgt), sg = soft.getContext('2d');
  hg.fillStyle = 'rgb(128,0,0)'; hg.fillRect(0, 0, CW, hgt);
  sg.fillStyle = '#000'; sg.fillRect(0, 0, CW, hgt);
  hg.translate(MX, -y0); sg.translate(MX, -y0);
  for (const c of net.cells) {
    const P = c.P, t = at(c.cu - c.gx * c.ext, c.cv - c.gy * c.ext), b = at(c.cu + c.gx * c.ext, c.cv + c.gy * c.ext);
    const hi = Math.round(128 + 112 * L.clamp(c.base + c.amp, -1, 1)), lo = Math.round(128 + 112 * L.clamp(c.base - c.amp, -1, 1));
    if (Math.hypot(b.x - t.x, b.y - t.y) > 1) {
      const gr = hg.createLinearGradient(t.x, t.y, b.x, b.y);
      gr.addColorStop(0, `rgb(${hi},0,0)`); gr.addColorStop(1, `rgb(${lo},0,0)`);
      hg.fillStyle = gr;
    } else hg.fillStyle = `rgb(${(hi + lo) >> 1},0,0)`;
    hg.beginPath();
    for (let i = 0; i < P.length; i++) { const p = scr(P[i]); if (i) hg.lineTo(p.x, p.y); else hg.moveTo(p.x, p.y); }
    hg.closePath(); hg.fill();
  }
  hg.globalCompositeOperation = 'lighten'; sg.globalCompositeOperation = 'lighter';
  const nick = new Float32Array(UMAX * 2 + 2);
  for (const c of net.cracks) {
    const P = c.pts, n = P.length, pts = P.map(scr), hw = new Float32Array(n), tp = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
    const ph = rr.range(0, 90), w0 = 1.2 + 0.5 * c.k, fw = (5 + 11 * c.k) * (c.deep ? 1.5 : 1), side = rr.sign(), thin = rr.range(0.15, 0.42) * (1.15 - 0.5 * c.k), from = rr.chance(0.5);
    let len = 0, nv = 0;
    for (let i = 0; i < n; i++) {
      const p = P[i < 1 ? 0 : i - 1], q = P[i > n - 2 ? n - 1 : i + 1], m = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      nx[i] = (p[1] - q[1]) / m; ny[i] = (q[0] - p[0]) / m; nv += ny[i];
      if (i) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      // a crack is boldest where it began and thins toward the end it ran to (蟹爪纹), swelling a little on the way;
      // one that has only started tapers to nothing
      const u = i / (n - 1);
      tp[i] = c.taper ? Math.pow(L.clamp((1 - u) / 0.55), 0.8) : 1;
      hw[i] = 0.5 * w0 * (1 + thin - 2 * thin * (c.taper || from ? u : 1 - u)) * (1 + 0.2 * nw.n2(len / 64 + ph, 7.7)) * tp[i];
    }
    if (!c.deep) { ribbon(hg, pts, hw); hg.fillStyle = `rgb(0,${Math.round(255 * c.k)},0)`; hg.fill(); }
    // the light inside the glaze comes from beyond the rim and leaks out on the far side of each crack: a soft glow
    // that begins at the hairline and dies away down the wall (for a crack that runs straight down the wall, either side)
    const sgn = Math.abs(nv) > 0.3 * n ? Math.sign(nv) : side;
    for (const [f, v] of [[1, 0.17], [0.6, 0.18], [0.28, 0.25]]) {
      sg.beginPath();
      for (let i = 0; i < n; i++) { if (i) sg.lineTo(pts[i].x, pts[i].y); else sg.moveTo(pts[i].x, pts[i].y); }
      for (let i = n - 1; i >= 0; i--) { const o = sgn * fw * f * tp[i], q = at(P[i][0] + nx[i] * o, P[i][1] + ny[i] * o); sg.lineTo(q.x, q.y); }
      sg.closePath();
      sg.fillStyle = `rgb(0,${Math.round(255 * v * c.k)},0)`; sg.fill();
    }
    // a bold crack that crosses the lip nicks the highlight there
    const dep = 0.36 * Math.pow(L.clamp((c.k - 0.7) / 0.3), 1.2);
    if (dep > 0.01) for (let i = 1; i < n; i++) {
      if ((pts[i - 1].V - 2) * (pts[i].V - 2) >= 0) continue;
      const U = L.lerp(pts[i - 1].U, pts[i].U, (2 - pts[i - 1].V) / (pts[i].V - pts[i - 1].V)), sw = 1 + 0.7 * sigmaOf(U), dd = dep * Math.pow(1.35 / sw, 0.7);
      for (let j = Math.max(0, Math.floor(U + UMAX - sw * 3)); j <= Math.min(nick.length - 1, Math.ceil(U + UMAX + sw * 3)); j++) {
        const e = (j - UMAX - U) / sw, v = dd * Math.exp(-0.5 * e * e);
        if (v > nick[j]) nick[j] = v;
      }
    }
  }
  // where the crackle catches the light at all: whole stretches of the network stay all but invisible
  const VN = Math.ceil(surfV(DC) / VU) + 3, UN = Math.ceil((UMAX * 2) / VU) + 2, vis = new Float32Array(VN * UN);
  for (let j = 0; j < VN; j++) for (let i = 0; i < UN; i++) vis[j * UN + i] = 0.32 + 0.68 * sstep(-0.42, 0.34, nz.fbm((i * VU - UMAX) / 430 + 71, (j * VU) / 430 - 8, 3));
  // the light a crack can leak, by depth below the rim: it follows the glow in the glaze, and is gone by DC
  const light = new Float32Array((DC + 2) * 4);
  for (let i = 0; i < light.length; i++) { const d = i / 4; light[i] = (0.36 * Math.exp(-d / 40) + 0.1 * Math.exp(-d / 110)) * (1 - sstep(DC - 110, DC, d)); }
  const read = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CW, hgt).data;
  const h0 = hg.getImageData(0, 0, CW, hgt).data, h1 = read(L.blurred(hard, 1.6)), h2 = read(L.blurred(hard, 4.5));
  const s0 = read(L.blurred(soft, 1.8)), s2 = read(L.blurred(soft, 5));
  const lit = new Float32Array(CW * hgt), yb = a.crestY;
  for (let j = 0; j < hgt; j++) {
    const y = y0 + j + 0.5, ddy = cy - y, ddy2 = ddy * ddy, by = sstep(yb + 70, yb + 125, y);
    for (let i = 0; i < CW; i++) {
      const x = i - MX + 0.5, ddx = x - cx, d = R - Math.sqrt(ddx * ddx + ddy2);
      if (d < 0.5 || d >= DC) continue;
      const k = j * CW + i, q = k * 4, U = Math.atan2(ddx, ddy) * R, sig = sigmaOf(U);
      // out of focus the hairlines spread and all but vanish, and the flakes run together
      const w1 = L.clamp((sig - 0.6) / 1.2), w2 = L.clamp((sig - 1.8) / 3.2);
      let tone = h0[q] + (h1[q] - h0[q]) * w1, line = h0[q + 1] + (h1[q + 1] - h0[q + 1]) * w1;
      tone += (h2[q] - tone) * w2; line += (h2[q + 1] - line) * w2;
      const glow = s0[q + 1] + (s2[q + 1] - s0[q + 1]) * w2;
      const fu = (U + UMAX) / VU, iu = fu | 0, tu = fu - iu, fv = surfV(d) / VU, iv = fv | 0, tv = fv - iv, k0 = iv * UN + iu;
      const see = (vis[k0] + (vis[k0 + 1] - vis[k0]) * tu) * (1 - tv) + (vis[k0 + UN] + (vis[k0 + UN + 1] - vis[k0 + UN]) * tu) * tv;
      // seen edge-on where the lip rolls away, a crack all but disappears (and the highlight on the lip keeps a clean lower edge)
      const e = 1 - (d < RL ? d : RL) / RL, fore = Math.min(1, 2.2 * Math.sqrt(1 - e * e)) * sstep(1, 12, d);
      // the brand line sits in the dark below the crest: the crackle is fainter still there
      const calm = 1 - 0.62 * by * sstep(520, 640, x) * (1 - sstep(1280, 1400, x));
      lit[k] = ((0.9 * line + 0.5 * glow) / 255 * see + TONE * (tone - 128) / 112 * (0.55 + 0.45 * see)) * fore * calm;
    }
  }
  return { y0, hgt, lit, light, nick, gmod };
}

/** shade rows y0..y1 of the picture: sky above the rim, bowl wall below, dithered so the dark gradients never band */
function paint(a, y0, y1, sky, body, F, T, gain, seed) {
  const R = a.R, cx = a.cx, cy = a.cy;
  const near = rimProfiles(sky, body), lvl = T.lvl, bm = T.swell.m, nu = T.swell.nu, lit = F.lit, light = F.light, last = SIG.length - 1;
  const hgt = y1 - y0, img = new ImageData(CW, hgt), o8 = img.data;
  let s = seed | 0 || 1, o = 0;
  for (let j = 0; j < hgt; j++) {
    const ddy = cy - (y0 + j + 0.5), ddy2 = ddy * ddy;
    const fj = y0 + j - F.y0;
    for (let i = 0; i < CW; i++, o += 4) {
      const ddx = i - MX + 0.5 - cx, dr = Math.sqrt(ddx * ddx + ddy2) - R;
      let r, g, b;
      if (dr >= MTOP) {
        const t = dr * Q, i0 = t | 0, f = t - i0, q = i0 * 3;
        r = sky[q] + (sky[q + 3] - sky[q]) * f; g = sky[q + 1] + (sky[q + 4] - sky[q + 1]) * f; b = sky[q + 2] + (sky[q + 5] - sky[q + 2]) * f;
      } else {
        const U = Math.atan2(ddx, ddy) * R, au = U < 0 ? -U : U;
        let se, lut;   // signed distance from the rim after the slow swells: > 0 sky, < 0 wall
        if (dr > 0) {
          const fu = (U + UMAX) / MU, iu = fu | 0, tu = fu - iu, ft = dr / MT, it = ft | 0, tt = ft - it, k0 = it * nu + iu;
          const m = (bm[k0] + (bm[k0 + 1] - bm[k0]) * tu) * (1 - tt) + (bm[k0 + nu] + (bm[k0 + nu + 1] - bm[k0 + nu]) * tu) * tt;
          se = dr / m; lut = sky;
        } else {
          const d = -dr, gm = F.gmod[(U + UMAX) | 0];
          se = -(d < 3 ? d : d - (d - 3) * (1 - 1 / gm) * Math.exp(-d / 90)); lut = body;   // only the glow near the lip breathes
        }
        const as = se < 0 ? -se : se;
        let wn = as >= NR - 4 ? 0 : as <= NR - 20 ? 1 : (NR - 4 - as) / 16;
        if (wn < 1) {
          const t = as * Q, i0 = t | 0, f = t - i0, q = i0 * 3;
          r = lut[q] + (lut[q + 3] - lut[q]) * f; g = lut[q + 1] + (lut[q + 4] - lut[q + 1]) * f; b = lut[q + 2] + (lut[q + 5] - lut[q + 2]) * f;
        } else { r = g = b = 0; }
        if (wn > 0) {
          // near the rim: the same profile, as soft as the lens renders it at this point along the rim
          const lv = lvl[au > UMAX ? UMAX : au | 0], la = lv | 0, lf = lv - la, A = near[la], B = near[la < last ? la + 1 : last];
          const t = (se + NR) * Q, i0 = t | 0, f = t - i0, q = i0 * 3;
          const ar = A[q] + (A[q + 3] - A[q]) * f, ag = A[q + 1] + (A[q + 4] - A[q + 1]) * f, ab = A[q + 2] + (A[q + 5] - A[q + 2]) * f;
          const br = B[q] + (B[q + 3] - B[q]) * f, bg = B[q + 1] + (B[q + 4] - B[q + 1]) * f, bb = B[q + 2] + (B[q + 5] - B[q + 2]) * f;
          const nr = ar + (br - ar) * lf, ng = ag + (bg - ag) * lf, nb = ab + (bb - ab) * lf;
          r += (nr - r) * wn; g += (ng - g) * wn; b += (nb - b) * wn;
        }
        if (dr < -0.5 && dr > -DC && fj >= 0 && fj < F.hgt) {
          // the crackle: light leaking out of the glaze (天青; the boldest glints near the lip turn moon-white), a shade less where a flake lies darker
          const kI = lit[fj * CW + i];
          if (kI > 0.002 || kI < -0.002) { const w = kI * gain * light[(-dr * 4) | 0], hot = w > 0.4 ? 1 : w > 0 ? w * 2.5 : 0; r += (143 + 80 * hot) * w; g += (201 + 40 * hot) * w; b += (196 + 42 * hot) * w; }
        }
      }
      // the faintest grain (triangular noise, well under what the film grain adds later): it is the dither that keeps these dark gradients from banding
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const n1 = (s >>> 0) / 4294967296;
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const n2 = (s >>> 0) / 4294967296;
      const gn = (n1 + n2 - 1) * (1.7 + 0.004 * (0.3 * r + 0.6 * g + 0.1 * b));
      o8[o] = r + gn; o8[o + 1] = g + gn; o8[o + 2] = b + gn; o8[o + 3] = 255;
    }
  }
  const c = L.makeCanvas(CW, hgt);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** the moon-white highlight on the lip, as an alpha layer: its strength and depth wander along the rim, crackle nicks it, the lens softens it */
function paintLip(a, F, T) {
  const R = a.R, cx = a.cx, cy = a.cy, prof = lipProfiles(), lvl = T.lvl, last = SIG.length - 1;
  const y0 = Math.floor(a.crestY) - HR - 2, y1 = Math.min(H + MX, Math.ceil(a.yAt(-MX)) + HR + 2), hgt = y1 - y0;
  const nz = L.makeNoise('s01lip'), inten = new Float32Array(UMAX * 2 + 2), thick = new Float32Array(UMAX * 2 + 2);
  for (let i = 0; i < inten.length; i++) {
    const U = i - UMAX;
    inten[i] = L.clamp(0.9 + 0.26 * nz.fbm(U / 330 + 2.2, 0.3, 3) + 0.07 * nz.n2(U / 34, 5.1), 0.5, 1.08);
    thick[i] = L.clamp(1 + 0.3 * nz.fbm(U / 250 - 7.7, 4.4, 2) + 0.09 * nz.n2(U / 46, 1.9), 0.62, 1.45);
  }
  const img = new ImageData(CW, hgt), o8 = img.data;
  let s = 6021023, o = 0;
  for (let j = 0; j < hgt; j++) {
    const ddy = cy - (y0 + j + 0.5), ddy2 = ddy * ddy;
    for (let i = 0; i < CW; i++, o += 4) {
      const ddx = i - MX + 0.5 - cx, d = R - Math.sqrt(ddx * ddx + ddy2);
      o8[o] = MOON[0]; o8[o + 1] = MOON[1]; o8[o + 2] = MOON[2];
      if (d <= 1 - HR || d >= HR - 1) continue;
      const U = Math.atan2(ddx, ddy) * R, au = U < 0 ? -U : U, iu = (U + UMAX) | 0;
      const dk = d > 0 ? d / thick[iu] : d;
      const lv = lvl[au > UMAX ? UMAX : au | 0], la = lv | 0, lf = lv - la, A = prof[la], B = prof[la < last ? la + 1 : last];
      const t = (dk + HR) * Q, i0 = t | 0, f = t - i0;
      const ha = A[i0] + (A[i0 + 1] - A[i0]) * f, hb = B[i0] + (B[i0 + 1] - B[i0]) * f;
      let al = (ha + (hb - ha) * lf) * inten[iu];
      al *= 1 - F.nick[iu] * (d > 0 ? 1 - sstep(2.5, 7, d) : 0.4);   // a bold crack crossing the lip nicks the bright core of the highlight
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const n1 = (s >>> 0) / 4294967296;
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const n2 = (s >>> 0) / 4294967296;
      o8[o + 3] = al * 255 + (n1 + n2 - 1) * 0.8 + 0.5;
    }
  }
  const c = L.makeCanvas(CW, hgt);
  c.getContext('2d').putImageData(img, 0, 0);
  return { c, y0 };
}

/** the odd bubble suspended in the glaze, lit from behind (汝釉气泡"寥若晨星"): sparse points, thinning out with depth, swelling into soft discs out of focus */
function bubbles(a, canvas, yTop, gain) {
  const g = canvas.getContext('2d'), r = L.rng('s01bubbles'), span = a.span(MX + 30);
  g.save(); g.translate(MX, -yTop); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const th = r.range(-span, span), d = 6 + 170 * Math.pow(r(), 1.9), r0 = r.range(0.7, 2.1), k = r.range(0.35, 1);
    const rad = r0 + 0.75 * (sigmaOf(th * a.R) - 0.5);
    const p = a.pt(th, -d), al = gain * k * Math.pow(r0 / rad, 1.25) * (0.55 * Math.exp(-d / 40) + 0.12 * Math.exp(-d / 150));
    g.fillStyle = L.radial(g, p.x, p.y, 0, rad * 2.2, [[0, `rgba(214,238,232,${al.toFixed(4)})`], [0.45, `rgba(143,201,196,${(al * 0.4).toFixed(4)})`], [1, 'rgba(143,201,196,0)']]);
    g.fillRect(p.x - rad * 2.4, p.y - rad * 2.4, rad * 4.8, rad * 4.8);
  }
  g.restore();
}

export function initOpening(env) {
  const a = env.arc, key = `${a.R}/${a.crestY}/${a.cx}`;
  if (S && S.key === key) return S;
  const F = buildFields(a), T = { lvl: levelTable(), swell: swellTable() };
  const yB0 = Math.floor(a.crestY) - SAME;                      // above this row "bright" and "base" are identical
  const fDim = smoothRamp(SKY_DIM), skyDim = buildLut(fDim), skyBright = buildLut(handOver(smoothRamp(SKY_BRIGHT), fDim, 590, 760));
  const base = paint(a, -TOP, H + MX, skyDim, buildLut(smoothRamp(BODY_DIM)), F, T, 0.42, 90210);
  const bright = paint(a, yB0, H + MX, skyBright, buildLut(smoothRamp(BODY_BRIGHT)), F, T, 1, 271828);
  bubbles(a, base, -TOP, 0.35);
  bubbles(a, bright, yB0, 1);
  const lip = paintLip(a, F, T);
  const tmp = L.makeCanvas(bright.width, bright.height), ltmp = L.makeCanvas(lip.c.width, lip.c.height);
  S = { key, base, bright, yB0, tmp, tg: tmp.getContext('2d'), lip: lip.c, yL0: lip.y0, ltmp, lg: ltmp.getContext('2d') };
  return S;
}

/**
 * horizontal envelope as a gradient: `peak` within `w` px of the light's centre, easing down to `floor` over the next
 * `fall` px. The light sits `off` px from the crest and reaches `skew` further on the left than on the right.
 */
function envelope(g, x0, x1, { w, fall, floor, peak, off = 0, skew = 0 }) {
  const grad = g.createLinearGradient(x0, 0, x1, 0), N = 56;
  for (let i = 0; i <= N; i++) {
    const x = L.lerp(-MX, W + MX, i / N) - W / 2 - off, ax = Math.abs(x);
    const e = floor + (peak - floor) * (1 - L.smooth((ax - w) / (fall * (x < 0 ? 1 + skew : 1 - skew))));
    grad.addColorStop(i / N, `rgba(0,0,0,${e.toFixed(4)})`);
  }
  return grad;
}
/** copy `src` into its scratch canvas, seen through a horizontal envelope */
function through(g, src, env) {
  g.globalCompositeOperation = 'copy'; g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = envelope(g, 0, src.width, env);
  g.fillRect(0, 0, src.width, src.height);
}

/**
 * tilt: px the camera has tilted UP (the whole picture slides down by this much). 0 = the opening framing.
 * k:    0..1 progress of the light itself — it spreads outward along the rim and brightens a touch, then holds.
 */
export function drawOpening(ctx, env, { tilt = 0, k = 0 } = {}) {
  const a = env.arc, s = initOpening(env);
  const u = L.smooth(L.clamp(k) / 0.86);          // settles a few frames before the end so the loop joins cleanly
  const zoom = 1 + ZOOM * u;
  ctx.save();
  ctx.fillStyle = '#04080f'; ctx.fillRect(0, 0, W, H);
  ctx.translate(0, tilt);
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  // before dawn
  ctx.drawImage(s.base, -MX, -TOP);
  if (s.yB0 + tilt < H) {
    // first light, spreading from the crest toward both ends of the rim
    through(s.tg, s.bright, { w: L.lerp(120, 700, u), fall: L.lerp(960, 1150, u), floor: L.lerp(0.1, 0.62, u), peak: L.lerp(0.84, 1, u), off: -50, skew: 0.12 });
    ctx.drawImage(s.tmp, -MX, s.yB0);
  }
  if (s.yL0 + tilt < H) {
    // the moon-white highlight on the lip: hottest at the crest, running out along the rim as the light grows
    through(s.lg, s.lip, { w: L.lerp(40, 540, u), fall: L.lerp(560, 900, u), floor: L.lerp(0, 0.45, u), peak: L.lerp(0.72, 1, u), off: -50, skew: 0.12 });
    ctx.drawImage(s.ltmp, -MX, s.yL0);
  }
  ctx.restore();
}

export default {
  name: '天青碗沿晨光',
  tone: 'light',
  init(env) { initOpening(env); },
  draw(ctx, env, p) { drawOpening(ctx, env, { tilt: 0, k: p }); },
};
