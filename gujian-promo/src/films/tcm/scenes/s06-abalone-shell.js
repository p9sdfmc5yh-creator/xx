// s06 — 石决明 (abalone shell). The arc is the raised rim of the shell; below it the nacre fills the frame:
// crowded, wavy growth lines that follow the shell's curve, squeeze each other and close into eyes, their ridges
// flashing peacock blue → emerald → a little gold → pink-purple. Above the arc: black, nothing else.
//
// How it is drawn: in init() every pixel under the arc is mapped onto a dome (U = distance along the parallel,
// S = distance down the meridian from the limb, so the pattern is foreshortened toward the rim like a real curved
// surface). A warped scalar field F(U,S) gives the growth lines (its iso-contours); from it we bake, per pixel,
//   PH  — interference phase (which colour of the thin-film cycle the pixel shows)
//   LUM — relief lighting (ridge profile, bump shading from an upper-left key light, the dome's fall-off)
//   WH  — static pearl-white (rim, limb sheen, lit facets)    HB/TQ — how strongly the travelling highlight bites
//   CW  — how much of the ridge "flash" colour (vs. the blue-green body colour) the pixel shows
// draw() only runs one tight loop: colour = mix(base, accent, CW)[PH + shift(p)] · LUM, washed toward pearl white by the highlight.
// Shifting the phase is exactly what turning a shell in the light does: the structure stays, the colours flow.
// Everything is seeded (L.rng / L.makeNoise) — no Math.random, no Date, no external images.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const MX = 60, MY = 30;         // field margin beyond the frame (room for the small rotation about the arc centre)
const LAM = 22;                 // growth-line spacing on the shell surface (px)
const NPAL = 1024, NTH = 2048;
const LSC = 1 / 105;            // LUM byte → multiplier
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const sm = (t) => t * t * (3 - 2 * t);
// one growth line in cross-section: a steep little step up, then a long shingle falling to a sharp groove
const profile = (f) => (f < 0.26 ? sm(f / 0.26) : Math.pow(1 - (f - 0.26) / 0.74, 1.25));

/**
 * Two cyclic thin-film palettes indexed by the same phase:
 *   base   — the metallic blue-green body colour of the nacre (grooves and the long backs of the growth lines)
 *   accent — what the ridges flash: peacock blue → emerald → a little gold → pink-purple → violet → back to blue
 */
function buildPalettes() {
  const mk = (stops) => {
    const f = L.makeRamp(stops), out = new Float32Array(NPAL * 3);
    for (let i = 0; i < NPAL; i++) { const c = f(i / NPAL); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
    return out;
  };
  const base = mk([
    [0.00, '#07408f'], [0.12, '#0b7fb0'], [0.26, '#0a9aa6'], [0.40, '#12a884'], [0.50, '#0e8f8c'],
    [0.60, '#2f5cb8'], [0.70, '#9450c2'], [0.80, '#5340b8'], [0.90, '#0c4f9c'], [1.00, '#07408f'],
  ]);
  const accent = mk([
    [0.00, '#1487d8'], [0.10, '#1aa7c4'], [0.22, '#20e0d2'], [0.34, '#2fd6a1'], [0.43, '#58e6a0'],
    [0.50, '#f4cf6a'], [0.54, '#f9b98c'], [0.61, '#ee8cca'], [0.72, '#d07ad6'], [0.82, '#9a66f2'],
    [0.90, '#3f74e6'], [1.00, '#1487d8'],
  ]);
  return { base, accent };
}

function buildShell(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -MX, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + MX * 2, RH = H + MY - Y0, N = RW * RH;
  const span = a.span(MX + 60);
  const nA = L.makeNoise('s06a'), nB = L.makeNoise('s06b');

  // "eyes": low bumps the growth lines have to flow around (they close into rings there)
  const rk = L.rng('s06eyes'), knots = [];
  for (let guard = 0; knots.length < 15 && guard < 900; guard++) {
    const th = rk.range(-span, span), dd = rk.range(110, 620);
    const rr = R - dd, U = th * rr, Sv = R * Math.acos(rr / R);
    if (knots.some((k) => Math.hypot(k.U - U, k.S - Sv) < 250)) continue;
    const ru = rk.range(80, 170), rs = ru * rk.range(0.45, 0.75), amp = rk.sign() * rk.range(2.6, 5.6);
    knots.push({ U, S: Sv, iu: 1 / (ru * ru), is: 1 / (rs * rs), amp });
  }

  // 1) slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWarp = new Float32Array(cw * ch), cCol = new Float32Array(cw * ch), cMound = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const ddx = X0 + i * CS + 0.5 - cx, ddy = cy - (Y0 + j * CS + 0.5), rr = Math.hypot(ddx, ddy);
    const U = Math.atan2(ddx, ddy) * rr, Sv = R * Math.acos(Math.min(1, rr / R)), k = j * cw + i;
    let kn = 0, kb = 0;
    for (const o of knots) {
      const du = U - o.U, ds = Sv - o.S, e = du * du * o.iu + ds * ds * o.is;
      if (e < 9) { const g = Math.exp(-e); kn += o.amp * g; kb += Math.abs(o.amp) * g; }
    }
    cWarp[k] = 165 * nA.fbm(U / 700, Sv / 380, 3, 2, 0.5) + 70 * Math.sin(U / 540 + 0.9) + kn * LAM;
    cCol[k] = nB.fbm(U / 760 + 11, Sv / 520 - 4, 2);
    cMound[k] = nA.fbm(U / 260 + 50, Sv / 170 + 9, 3) + 0.2 * kb;
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // which pixels of each row lie under the arc (+2.5 px so the clip path, not the pixel grid, makes the edge)
  const xs = new Int32Array(RH), xe = new Int32Array(RH);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5), lim = (R + 2.5) * (R + 2.5) - ddy * ddy;
    if (lim <= 0) continue;
    const hw = Math.sqrt(lim);
    xs[j] = Math.max(0, Math.ceil(cx - hw - X0 - 0.5)); xe[j] = Math.min(RW, Math.floor(cx + hw - X0 - 0.5) + 1);
    if (xe[j] < xs[j]) xe[j] = xs[j];
  }

  // 2) growth-line field F — its iso-contours are the growth lines
  const Ff = new Float32Array(N), Gr = new Float32Array(N), Sk = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5);
    for (let i = xs[j]; i < xe[j]; i++) {
      const k = j * RW + i, ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      const U = Math.atan2(ddx, ddy) * rr, Sv = R * Math.acos(Math.min(1, rr / R));
      const w2 = nA.fbm(U / 340 + 3.1, Sv / 120 - 7.7, 2);
      const w3 = nB.fbm(U / 96 + 9, Sv / 40, 2);
      // the lines crowd together toward one end of the shell (they converge on the spire), and wander on the way
      Ff[k] = (Sv * (1 + 0.00038 * U) + bil(cWarp, i, j) + 30 * w2 + 3.5 * w3) / LAM;
      Gr[k] = nB.n2(U / 6 + 40, Sv / 6);
      Sk[k] = nA.n2(U / 90 - 17, Sv / 5.5 + 3);        // satin: hair-fine striation along the growth direction
    }
  }
  // 2b) ridge profile + height map. Where the lines crowd closer than the pixel grid can carry they melt into a smooth
  //     sheen (no moiré); where they open out, a finer secondary line appears on each shingle.
  const Hh = new Float32Array(N), Rd = new Float32Array(N), FL = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = xs[j]; i < xe[j]; i++) {
      const k = j * RW + i, ddx = X0 + i + 0.5 - cx, q = Math.min(1, Math.sqrt(ddx * ddx + ddy * ddy) / R), nz = Math.sqrt(1 - q * q);
      const fx = (Ff[k + (i < RW - 1 ? 1 : 0)] - Ff[k - (i > 0 ? 1 : 0)]) * 0.5, fy = (Ff[k + jp] - Ff[k + jm]) * 0.5;
      const gF = Math.sqrt(fx * fx + fy * fy);             // lines per screen px
      const fade = (1 - sstep(0.15, 0.27, gF)) * sstep(0.07, 0.2, nz);
      const F = Ff[k];
      let h = profile(F - Math.floor(F));
      const sub = 1 - sstep(0.05, 0.1, gF);
      if (sub > 0) { const F2 = F * 2 + 0.37; h = h * (1 - 0.28 * sub) + 0.28 * sub * profile(F2 - Math.floor(F2)); }
      h = 0.42 + (h - 0.42) * fade;
      const amp = 0.105 / Math.max(gF, 0.035);             // ridge height ∝ line spacing → the same crisp shading at every scale
      Hh[k] = amp * (h - 0.42) + 7 * bil(cMound, i, j) * sstep(0.05, 0.22, nz) * (nz / 0.7) + 0.1 * Gr[k] * fade;
      Rd[k] = h; FL[k] = fade;
    }
  }

  // 3) bake phase / light / white maps
  const PH = new Uint16Array(N), LUM = new Uint8Array(N), WH = new Uint8Array(N), HB = new Uint8Array(N), TQ = new Uint16Array(N), CW = new Uint8Array(N);
  const img = new ImageData(RW, RH), px = img.data;
  const rgl = L.rng('s06glint'), cand = [];
  const THL = -0.085;                                 // where the key light sits along the arc
  const lcx = cx - 130, lcy = a.crestY + 230;         // centre of the lit part of the dome (frame coords)
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j + 0.5), jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = xs[j]; i < xe[j]; i++) {
      const k = j * RW + i, ddx = X0 + i + 0.5 - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      const th = Math.atan2(ddx, ddy), d = R - rr;
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      let rel = (hx * 0.55 + hy * 0.835) * 1.8; rel = rel < -0.6 ? -0.6 : rel > 0.95 ? 0.95 : rel;
      const h = Rd[k], g = Gr[k], fade = FL[k];
      // the dome: brightest under the key light, sinking into blue-black toward both sides and the lower corners
      const dth = th - THL, gT = Math.exp(-(dth * dth) / (dth < 0 ? 0.072 : 0.15));
      const dist = Math.hypot(X0 + i - lcx, (Y0 + j - lcy) * 1.2);
      const lit = (0.09 + 1.12 * gT) * (1 - 0.64 * sstep(460, 1180, dist));
      const limb = Math.exp(-(d * d) / (46 * 46));       // grazing view just under the rim: the nacre brightens
      const tl = (1 - sstep(0.0, 0.16, h)) * fade;
      const band = (0.52 + 0.6 * h) * (1 - 0.42 * tl) + 0.25 * (1 - fade);
      // … and where the lines have melted together, long silky streaks run with the rim instead
      const streak = fade < 0.98 ? (1 - fade) * (0.3 * nB.n2(th * R / 190 + 5, d / 7 + 11) + 0.16 * nA.n2(th * R / 60 - 8, d / 3.2 + 2)) : 0;
      const lum = lit * band * (1 + rel) * (1 + 0.04 * g + 0.1 * Sk[k] * fade + streak) * (1 + 0.55 * limb);
      LUM[k] = Math.max(0, Math.min(255, lum * 105));
      // interference phase: steps on through the cycle ridge after ridge, pushed around by a slow field and by the tilt of each facet
      let ph = Ff[k] * 0.04 + 0.85 * bil(cCol, i, j) + 0.08 * (h - 0.42) + 0.1 * rel + 0.02 * g + 0.2;
      ph -= Math.floor(ph);
      PH[k] = (ph * NPAL) & (NPAL - 1);
      // ridges flash the accent colours, grooves and backs keep the blue-green body colour
      const flash = L.clamp(0.1 + 0.85 * sstep(0.3, 0.95, h) + 0.45 * Math.max(0, rel));
      CW[k] = (flash * fade + 0.38 * (1 - fade)) * 255;
      // pearl white: the thin rim on the arc, a soft sheen just under it, glints on the facets that face the light
      const rimLit = 0.4 + 0.6 * Math.exp(-(dth * dth) / 0.25);
      const rim = (1 - sstep(3.5, 9, d)) * rimLit;
      const sheen = limb * (0.14 + 0.3 * Math.exp(-(dth * dth) / 0.2)) * (1 - 0.5 * fade);
      const spark = sstep(0.3, 0.85, rel) * 0.38 * sstep(0.3, 0.95, lit);
      WH[k] = Math.min(255, (rim + sheen + spark + 0.08 * h * h * gT) * 255);
      // travelling highlight: radial profile × how much this facet catches it (so the grain shows through the glow)
      const B = d < 84 ? Math.exp(-((d - 84) * (d - 84)) / (58 * 58)) : Math.exp(-((d - 84) * (d - 84)) / (190 * 190));
      const gloss = L.clamp(0.5 + 1.1 * rel + 0.3 * (h - 0.5));
      HB[k] = Math.min(255, B * (0.8 + 0.2 * gloss) * 255);
      TQ[k] = L.clamp((th + span) / (2 * span)) * (NTH - 1);
      px[k * 4 + 3] = 255;
      // pin-point glints: a few facets tilted exactly into the light
      if (rel > 0.5 && lit > 0.45 && fade > 0.9 && rgl() < 0.004) cand.push({ x: X0 + i + 0.5, y: Y0 + j + 0.5, ph: rgl(), k: rgl.range(0.6, 1) * Math.min(1, lit), s: rgl.range(0.65, 1.3) });
    }
  }
  // keep a scattered handful (chosen independently of scan order)
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rgl() * (i + 1)), t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
  const glints = cand.slice(0, 70);
  const cv = L.makeCanvas(RW, RH), pal = buildPalettes();
  // glint sprite: a tiny soft star
  const star = L.makeCanvas(64, 64), sg = star.getContext('2d');
  sg.fillStyle = L.radial(sg, 32, 32, 0, 32, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(240,252,255,0.7)'], [0.4, 'rgba(190,235,250,0.14)'], [1, 'rgba(160,220,250,0)']]);
  sg.fillRect(0, 0, 64, 64);
  return { glints, star, X0, Y0, RW, RH, xs, xe, PH, LUM, WH, HB, TQ, CW, img, cv, g: cv.getContext('2d'), span, base: pal.base, accent: pal.accent, A: new Float32Array(NTH) };
}

export default {
  name: '石决明',
  tone: 'light',
  init(env) { S = buildShell(env); },
  draw(ctx, env, p) {
    const a = env.arc;
    const { X0, Y0, RW, RH, xs, xe, PH, LUM, WH, HB, TQ, CW, img, base, accent, A, span } = S;
    const rot = L.lerp(-0.004, 0.004, p);                 // the shell turns a hair under the lens
    const shift = Math.round(p * 0.3 * NPAL);             // … and the whole interference cycle slides with it
    const thH = L.lerp(-0.135, -0.085, p);                // highlight position on screen (theta), drifting along the arc
    // highlight profile along the arc, in the field's own (rotating) coordinates
    for (let i = 0; i < NTH; i++) { const t = -span + (i / (NTH - 1)) * 2 * span + rot - thH; A[i] = Math.exp(-(t * t) / (0.125 * 0.125)); }
    const d = img.data, PR = 246, PG = 252, PB = 250, I255 = 1 / 255;
    for (let j = 0; j < RH; j++) {
      let k = j * RW + xs[j], o = k * 4;
      for (const e = j * RW + xe[j]; k < e; k++, o += 4) {
        const pi = ((PH[k] + shift) & (NPAL - 1)) * 3, lum = LUM[k] * LSC, c = CW[k] * I255;
        let w = WH[k] + A[TQ[k]] * HB[k]; if (w > 255) w = 255;
        w *= I255;
        const br = base[pi], bg = base[pi + 1], bb = base[pi + 2];
        const r = (br + (accent[pi] - br) * c) * lum + 1, g = (bg + (accent[pi + 1] - bg) * c) * lum + 3, b = (bb + (accent[pi + 2] - bb) * c) * lum + 9;
        d[o] = r + (PR - r) * w; d[o + 1] = g + (PG - g) * w; d[o + 2] = b + (PB - b) * w;
      }
    }
    S.g.putImageData(img, 0, 0);

    ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, W, H);
    ctx.save(); a.clipBelow(ctx, 0);
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.cv, X0, Y0);
    // glints flare and die as the shell turns
    ctx.globalCompositeOperation = 'screen';
    for (const q of S.glints) {
      const tw = Math.pow(Math.max(0, Math.cos((p * 0.7 + q.ph) * L.TAU)), 2) * q.k;
      if (tw < 0.04) continue;
      const r = 30 * q.s;
      ctx.globalAlpha = tw; ctx.drawImage(S.star, q.x - r, q.y - r * 0.6, r * 2, r * 1.2);
    }
    ctx.restore();
    // soft bloom of the highlight on the nacre
    const hp = a.pt(thH, -100);
    ctx.save(); a.clipBelow(ctx, 0);
    L.glow(ctx, hp.x, hp.y, 560, '#d8f6f4', 0.2);
    ctx.restore();
    // the pearl rim, crisp on the arc, with a breath of bloom into the black where the highlight sits
    const pk = L.clamp(hp.x / W, 0.05, 0.95);
    ctx.save(); a.clipAbove(ctx, 0);
    ctx.shadowColor = 'rgba(190,236,246,0.9)'; ctx.shadowBlur = 18;
    ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(200,240,250,0)'], [Math.max(0, pk - 0.22), 'rgba(200,240,250,0.05)'], [pk, 'rgba(220,246,250,0.5)'], [Math.min(1, pk + 0.26), 'rgba(200,240,250,0.05)'], [1, 'rgba(200,240,250,0)']]);
    ctx.lineWidth = 5; a.stroke(ctx, -3.5);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = L.linear(ctx, 0, 0, W, 0, [[0, 'rgba(190,225,235,0.28)'], [pk, 'rgba(246,252,250,0.9)'], [1, 'rgba(180,215,235,0.22)']]);
    ctx.lineWidth = 2.6; a.stroke(ctx, -1.4);
    ctx.restore();
  },
};
