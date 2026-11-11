// g23 — 水墨: the CURRENT GLYPH written in dense ink on white xuan paper. Nothing here knows which character it is: the ink body
// is computed per DEVICE pixel (L.pixelCanvas) as an optical density field from K.sdGlyph — depth under the outline gives the
// pooled rims and the loaded middle, noise gives the 浓淡 (dense passages, thinner washes, dry passages), bristle streaks laid
// along K.strokeAngle give the 飞白, and outside the outline the carbon and then the water creep into the damp paper (洇晕).
// The same pass lights the sheet from the top-left: the paper's tooth and laid lines, the cockle round every wet stroke and
// two old fold creases, so that the ink sits IN a sheet of paper and not on a flat white card.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;
const sst = (a, b, x) => { const t = L.clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const NQ = 60;                             // bristle directions: the stroke angle is kept to 3°
const FLAT = 0.95;                         // what flat bare paper multiplies by (leaves headroom for the lit slopes)
const CREASES = [{ x: S * 0.338, s: 1, ph: 0.4 }, { x: S * 0.671, s: -0.8, ph: 2.1 }];   // the sheet was once folded in three

/** the slow fields, on a coarse grid tied to the stroke width: stroke direction, local half-width, dryness, dilution, cockle */
function strokeFields(info) {
  const sw = info.strokeWidth, step = L.clamp(sw / 5, 5, 15), n = Math.ceil(S / step) + 3, N = n * n;
  const nz = L.makeNoise('g23lo' + info.key);
  const KQ = new Int16Array(N), HW = new Float32Array(N), DRY = new Float32Array(N), DIL = new Float32Array(N), CK = new Float32Array(N);
  const dep = new Float32Array(N), tmp = new Float32Array(N), COH = new Float32Array(N);
  let VC = new Float32Array(N), VS = new Float32Array(N), VW = new Float32Array(N);
  // height of the sheet (px): it dips where the ink wetted it, ripples close to the strokes and undulates gently everywhere
  const hgt = (x, y) => {
    const sd = K.sdGlyph(x, y);
    return sw * (0.021 * sst(-0.25 * sw, 0.55 * sw, sd) + 0.013 * nz.fbm(x / (1.7 * sw) + 9, y / (1.7 * sw), 2) * sst(1.7 * sw, 0.1 * sw, sd))
      + 1.1 * nz.fbm(x / 300 + 5, y / 300, 2);
  };
  const e = step * 0.5;
  for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++, o++) {
    const x = i * step, y = j * step, sd = K.sdGlyph(x, y);
    dep[o] = sd < 0 ? -sd : 0;
    if (sd < sw * 0.7) { const a = K.strokeAngle(x, y), w = dep[o] + 0.5; VC[o] = w * Math.cos(2 * a); VS[o] = w * Math.sin(2 * a); VW[o] = w; }
    CK[o] = 0.9 * (hgt(x + e, y + e) - hgt(x - e, y - e)) / (2.828 * e);      // slope seen by a light from the top-left
  }
  // smooth the direction (as a doubled-angle vector weighted by depth, so the middle of a stroke leads) and keep its coherence:
  // where strokes meet the direction is undefined — and there the ink lies double, so it never runs dry
  for (let pass = 0; pass < 2; pass++) {
    const c2 = new Float32Array(N), s2 = new Float32Array(N), w2 = new Float32Array(N);
    for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++, o++) {
      let a = 0, b = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const k = (di ? 1 : 2) * (dj ? 1 : 2), q = jj * n + ii; a += k * VC[q]; b += k * VS[q]; w += k * VW[q];
      }
      c2[o] = a / 16; s2[o] = b / 16; w2[o] = w / 16;
    }
    VC = c2; VS = s2; VW = w2;
  }
  for (let o = 0; o < N; o++) {
    let a = 0.5 * Math.atan2(VS[o], VC[o]); a -= Math.PI * Math.floor(a / Math.PI);
    KQ[o] = Math.round((a / Math.PI) * NQ) % NQ;
    COH[o] = VW[o] > 1e-4 ? Math.hypot(VC[o], VS[o]) / VW[o] : 0;
  }
  // local half-width of the stroke: the deepest point within reach, smoothed
  const rad = Math.ceil((0.6 * sw) / step);
  for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++, o++) {
    let m = 0;
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      if (di * di + dj * dj > rad * rad + 1) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const v = dep[jj * n + ii]; if (v > m) m = v;
    }
    tmp[o] = m;
  }
  for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++, o++) {
    let s = 0, c = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; s += tmp[jj * n + ii]; c++; }
    HW[o] = s / c;
    const x = i * step, y = j * step, rel = HW[o] / (0.5 * sw);
    const thin = sst(0.8, 0.4, rel), fat = sst(0.98, 1.25, rel);           // lifted tails run dry; pressed-in heads and joints stay loaded
    const cs = Math.cos((KQ[o] * Math.PI) / NQ), sn = Math.sin((KQ[o] * Math.PI) / NQ);            // the brush runs dry in long passages ALONG the stroke
    const dn = nz.fbm((x * cs + y * sn) / (6 * sw) + 3, (y * cs - x * sn) / (1.6 * sw) + 7, 2);
    tmp[o] = L.clamp(0.92 * sst(0.08, 0.36, dn) + 0.2 * thin * sst(-0.1, 0.3, dn) - 0.7 * fat, 0, 0.94) * sst(0.4, 0.8, COH[o]);
  }
  for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++, o++) {
    let s = 0, c = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const k = (di ? 1 : 2) * (dj ? 1 : 2); s += k * tmp[jj * n + ii]; c += k; }
    DRY[o] = s / c;
    const x = i * step, y = j * step;
    DIL[o] = nz.fbm(x / (2.4 * sw) + 40, y / (2.4 * sw) + 11, 2) - 0.5 * DRY[o];                    // > 0.3: passages written with a wetter, thinner ink
  }
  const at = (A, x, y) => {
    const gx = L.clamp(x / step, 0, n - 1.001), gy = L.clamp(y / step, 0, n - 1.001), i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, o = j * n + i;
    return (A[o] * (1 - fx) + A[o + 1] * fx) * (1 - fy) + (A[o + n] * (1 - fx) + A[o + n + 1] * fx) * fy;
  };
  return {
    sw, step, n, KQ, HW, DRY, DIL, CK,
    dryAt: (x, y) => at(DRY, x, y), cohAt: (x, y) => at(COH, x, y),
    angAt: (x, y) => (KQ[Math.round(L.clamp(y / step, 0, n - 1)) * n + Math.round(L.clamp(x / step, 0, n - 1))] / NQ) * Math.PI,
  };
}

/** the ink (and the lit relief of the sheet) as one layer to MULTIPLY into the paper: white = bare flat paper, black = dense ink */
function inkField(info, F) {
  const { sw, step, n, KQ, HW, DRY, DIL, CK } = F;
  const nz = L.makeNoise('g23ink' + info.key), nt = L.makeNoise('g23tooth');
  const CS = new Float32Array(NQ), SN = new Float32Array(NQ);
  for (let k = 0; k < NQ; k++) { CS[k] = Math.cos((k * Math.PI) / NQ); SN[k] = Math.sin((k * Math.PI) / NQ); }
  // bristle streaks in stroke coordinates (a across, l along): broad gaps, hairs and fine hairs; frequencies capped for 4K
  const f0 = 6 / sw, f1 = Math.min(0.3, 19 / sw), f2 = Math.min(0.8, 55 / sw), g0 = 1 / (7 * sw), g1 = 1 / (5 * sw), g2 = 1 / (2 * sw);
  const streak = (k, x, y) => {
    const a = y * CS[k] - x * SN[k], l = x * CS[k] + y * SN[k];
    return 0.66 * nz.n2(a * f0 + k * 1.3, l * g0) + 0.5 * nz.fbm(a * f1 + k * 3.7, l * g1, 2) + 0.3 * nz.n2(a * f2 + 9 + k * 5.1, l * g2);
  };
  const rimL = Math.max(1.6, sw * 0.035), hf = 1 / Math.max(6, 0.32 * sw);
  const HALO = (2 + 0.17 * sw) * 1.25 * 1.35 + 0.02 * sw + 4;                 // furthest reach of the water halo
  const uk = new Int16Array(4), uw = new Float32Array(4);
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    const prev = new Float32Array(pw);                                         // the tooth of the row above (for the relief)
    for (let j = 0; j < ph; j++) {
      const y = (j + 0.5) / q, gy = y / step, j0 = gy | 0, fy = gy - j0;
      let upLeft = 0;
      for (let i = 0, o = j * pw * 4; i < pw; i++, o += 4) {
        const x = (i + 0.5) / q, gx = x / step, i0 = gx | 0, fx = gx - i0, go = j0 * n + i0;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        // ── the sheet: tooth + faint laid lines of the mould, lit from the top-left; cockle; fold creases; a little falloff
        const tooth = nt.n2(x * 0.47, y * 0.47) * 0.6 + nt.n2(x * 0.21 + 31, y * 0.21) * 0.4;
        const laid = Math.sin((y + 1.3 * Math.sin(x / 97 + 1.3) + 0.8 * Math.sin(x / 41 + y / 233)) * (TAU / 3.4));
        const ht = tooth + 0.2 * laid, up = prev[i];
        const sl = i > 0 && j > 0 ? (ht - upLeft) * q * 0.5 : 0;
        upLeft = up; prev[i] = ht;
        let shade = CK[go] * w00 + CK[go + 1] * w10 + CK[go + n] * w01 + CK[go + n + 1] * w11 + 0.065 * sl + 0.016 * (1 - (x + y) / S);
        for (let c = 0; c < CREASES.length; c++) {
          const cr = CREASES[c], dx = x - cr.x - 1.4 * Math.sin(y / 170 + cr.ph), ax = dx < 0 ? -dx : dx;
          if (ax < 520) shade += cr.s * (dx < 0 ? 0.011 : -0.011) * Math.exp(-ax / 150);          // the two panels do not lie in one plane
          if (ax < 9) { const u = dx / 2.3; shade -= cr.s * 0.055 * (0.6 + 0.4 * Math.sin(y / 53 + cr.ph * 3) * Math.sin(y / 131 + cr.ph)) * u * Math.exp(-u * u); }   // the ridge of the fold itself
        }
        // ── the ink
        const sd = K.sdGlyph(x, y);
        let D = 0;
        if (sd < HALO) {
          const dry = DRY[go] * w00 + DRY[go + 1] * w10 + DRY[go + n] * w01 + DRY[go + n + 1] * w11, wet = 1 - dry;
          if (sd < 1.7) {
            const hw = Math.max(3, HW[go] * w00 + HW[go + 1] * w10 + HW[go + n] * w01 + HW[go + n + 1] * w11);
            const depth = -sd, v = depth >= hw ? 1 : depth <= 0 ? 0 : depth / hw;
            // bristle streaks along the stroke: the direction comes from the four grid nodes round the pixel
            let nU = 0, bs = 0, w2 = 0;
            for (let c = 0; c < 4; c++) {
              const kk = c === 0 ? KQ[go] : c === 1 ? KQ[go + 1] : c === 2 ? KQ[go + n] : KQ[go + n + 1];
              const ww = c === 0 ? w00 : c === 1 ? w10 : c === 2 ? w01 : w11;
              let u = 0; while (u < nU && uk[u] !== kk) u++;
              if (u === nU) { uk[u] = kk; uw[u] = 0; nU++; }
              uw[u] += ww;
            }
            for (let u = 0; u < nU; u++) { if (uw[u] < 0.04) continue; bs += uw[u] * streak(uk[u], x, y); w2 += uw[u] * uw[u]; }
            const b = bs / Math.sqrt(w2);
            // 飞白: the dry brush skips, more in the middle of the stroke than at its edges, and catches on the paper's tooth
            const d0 = dry * (0.45 + 0.55 * sst(0.03, 0.34, v)), dl = d0 * sst(0.2, 0.5, d0);   // a brush is loaded or it is dry: no half-hearted scratches
            const T = -1.05 + dl;
            const cov = dl < 0.04 ? 1 : sst(T - 0.1, T + 0.1, b + (0.24 * tooth + 0.03 * laid) * dl);
            // 浓淡: dense where loaded, greyer where dry or diluted, a pooled rim along the outline
            const bb = b > 0.5 ? 1 : b < -0.5 ? -1 : b * 2;
            let dens = L.lerp(0.985, 0.87, dry) * (1 - (0.01 + 0.06 * dry) * (1 + bb)) + 0.03 * Math.exp(-depth / rimL);
            const dil = sst(0.24, 0.62, DIL[go] * w00 + DIL[go + 1] * w10 + DIL[go + n] * w01 + DIL[go + n + 1] * w11 + 0.22 * b);
            if (dil > 0.01) dens = dens * (1 - dil * (0.13 + 0.09 * bb)) + dil * 0.13 * Math.exp(-depth / (rimL * 1.5));   // …streaky, with a pooled rim
            const wob = sd > -3 ? 0.7 * tooth + 0.6 * nz.n2(x * 0.16 + 5, y * 0.16) : 0;        // a hand-held, fibrous edge (≈ 1 px)
            const body = cov * (dens > 0.985 ? 0.985 : dens);
            D = sst(0.8, -0.8, sd + wob) * (body > 0.08 ? body : 0.08);
          }
          if (sd > -1.5) {                                                                     // 洇晕 outside the outline
            const s0 = sd < 0 ? 0 : sd;
            // how open is the paper in front of this edge? the narrow gaps between strokes have to stay clean
            const nx = K.sdGlyph(x + 1.5, y) - K.sdGlyph(x - 1.5, y), ny = K.sdGlyph(x, y + 1.5) - K.sdGlyph(x, y - 1.5), nl = Math.hypot(nx, ny) || 1, P = 0.22 * sw;
            const open = sst(0.3, 0.85, (K.sdGlyph(x + (nx / nl) * P, y + (ny / nl) * P) - sd) / P);
            const hn = nz.n2(x * hf + 3, y * hf);
            const rc = (1.5 + 0.06 * sw) * (0.2 + wet) * (1 + 0.55 * hn + 0.3 * nz.n2(x * 0.19 + 7, y * 0.19)) * (0.3 + 0.7 * open);   // carbon: a grey feathered fringe with a lobed edge
            const sf = s0 * (1 + 0.45 * tooth), fr = sf < rc ? 1 - sf / rc : 0;
            const Dc = Math.sqrt(wet) * (0.2 * sst(rc, rc * 0.3, sf) + 0.17 * fr + 0.2 * Math.exp(-s0 / 1.2));
            const rw = (2 + 0.17 * sw) * (0.5 + 0.75 * wet) * (1 + 0.35 * nz.n2(x * hf * 0.6 + 17, y * hf * 0.6 + 4));
            const sn = s0 + 0.02 * sw * tooth, tl = (sn - rw) / 1.3;                            // water: a pale halo ending in a tide line
            const Dw = wet * open * (0.065 * sst(rw, rw * 0.3, sn) + 0.035 * Math.exp(-tl * tl));
            D = 1 - (1 - D) * (1 - Dc) * (1 - Dw);
          }
        }
        let pm = FLAT * (1 + shade); if (pm > 1) pm = 1;
        if (D <= 0.002) { d[o] = d[o + 1] = d[o + 2] = pm * 255; d[o + 3] = 255; continue; }
        const t = 1 - (D > 0.99 ? 0.99 : D);
        const sh = D > 0.5 && sl > 0 ? 26 * sl * D * D : 0;                                    // the satin glint of dry dense ink on the tooth
        d[o] = pm * (20 + 235 * t) + sh; d[o + 1] = pm * (18 + 237 * Math.pow(t, 1.01)) + sh; d[o + 2] = pm * (17 + 238 * Math.pow(t, 0.965)) + sh * 1.06;
        d[o + 3] = 255;
      }
    }
  });
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#fefcf3', tone: '#a39474', seed: 'g23paper', fiber: 0.9, stain: 0.14, foxing: 0.06, edge: 0.1, grain: 0.18 }), 0, 0);
  const F = strokeFields(info);
  const ink = inkField(info, F);
  // 洇: the ink creeps a little way into the damp paper round every edge
  g.save(); g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.12; g.drawImage(L.blurred(ink, Math.max(2, sw * 0.06)), 0, 0);
  g.globalAlpha = 1; g.drawImage(ink, 0, 0);
  g.restore();
  const r = L.rng('g23bits' + info.key);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 飞白丝: single bristles that ran dry, traced along the stroke through the dry passages
  g.save(); K.clipGlyph(g, { grow: -1 });
  const ds = Math.max(4, sw * 0.14);
  const march = (x, y, a, len, out) => {                    // walk `len` px along the stroke direction field
    for (let s = 0; s < len; s += ds) {
      const b = F.angAt(x, y), dot = Math.cos(b - a); if (Math.abs(dot) < 0.93 || F.cohAt(x, y) < 0.6) break;
      a = dot >= 0 ? b : b + Math.PI;
      x += Math.cos(a) * ds; y += Math.sin(a) * ds; out.push([x, y]);
    }
  };
  for (const bd of K.pack({ seed: 'g23hair', rmax: sw * 0.5, rmin: sw * 0.3 })) {
    const dry = F.dryAt(bd.x, bd.y); if (dry < 0.45) continue;
    for (let h = 0, m = Math.round(r.range(1, 5) * dry); h < m; h++) {
      const off = r.range(-0.85, 0.85) * bd.r, al = r.range(-1, 1) * bd.r, len = bd.r * r.range(1.2, 3.8), ca = Math.cos(bd.ang), sa = Math.sin(bd.ang);
      const x = bd.x - sa * off + ca * al, y = bd.y + ca * off + sa * al, a0 = F.angAt(x, y), fw = [], bw = [];
      march(x, y, a0, len * 0.5, fw); march(x, y, a0 + Math.PI, len * 0.5, bw);
      const pts = bw.reverse().concat([[x, y]], fw);
      g.strokeStyle = L.rgba('#f1eee4', r.range(0.2, 0.6) * dry); g.lineWidth = r.range(0.4, 1.1) * Math.min(1, sw / 50 + 0.3);
      g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    }
  }
  g.restore();
  // ink wicking out along single paper fibres where the stroke was wet
  for (const p of K.outline({ spacing: Math.max(3.5, sw * 0.07), seed: 'g23wick', jitter: 0.9 })) {
    const wet = 1 - F.dryAt(p.x, p.y); if (!r.chance(0.3 * wet)) continue;
    const a = p.ang + r.range(-1, 1), len = (1 + 0.035 * sw) * r.range(0.4, 1.4) * (0.6 + 0.6 * wet), bend = r.range(-0.6, 0.6);
    const x = p.x - Math.cos(p.ang) * 1.2, y = p.y - Math.sin(p.ang) * 1.2;
    g.strokeStyle = L.rgba('#1c1917', r.range(0.1, 0.3)); g.lineWidth = r.range(0.4, 0.8);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  // a few flung droplets in the open paper beside the strokes
  let drops = 0;
  for (const p of K.outline({ grow: sw * 0.45, spacing: sw * 2.6, seed: 'g23drop', jitter: 0.8 })) {
    if (drops >= 6 || !r.chance(0.4) || K.sdGlyph(p.x, p.y) < sw * 0.3) continue;
    drops++;
    const x = p.x + r.range(-0.1, 0.1) * sw, y = p.y + r.range(-0.1, 0.1) * sw, s = sw * (0.01 + 0.032 * r() * r());
    g.fillStyle = L.radial(g, x, y, s * 0.6, s * 2.4, [[0, 'rgba(30,27,25,0.16)'], [1, 'rgba(30,27,25,0)']]);
    g.beginPath(); g.arc(x, y, s * 2.4, 0, TAU); g.fill();
    g.fillStyle = L.rgba('#191715', r.range(0.72, 0.92));
    g.beginPath(); g.ellipse(x, y, s, s * r.range(0.7, 0.95), r() * 3, 0, TAU); g.fill();
  }
  // xuan fibres that took less ink: long pale hairs lying across the strokes
  const bb = info.bbox;
  for (let i = 0, k = 0; i < 900 && k < 32; i++) {
    const x = r.range(bb.x0, bb.x1), y = r.range(bb.y0, bb.y1);
    if (!K.inGlyph(x, y, 4)) continue;
    k++;
    const len = sw * r.range(0.2, 0.6), an = r() * TAU, bend = r.range(-0.7, 0.7);
    g.strokeStyle = L.rgba('#f4f1e8', r.range(0.04, 0.1)); g.lineWidth = r.range(0.5, 1);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  return c;
}

export default {
  name: '水墨',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
