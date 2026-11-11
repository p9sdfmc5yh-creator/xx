// s04 — 文玩核桃. Macro of a hand-polished walnut (文玩核桃): the arc is the round top of the shell.
// Below the arc the shell is a small mountain range — an irregular net of furrows and pits between broad raised ridges;
// years of handling have polished the ridge tops to a glossy, translucent jujube red, the furrow floors stay near black.
// Lower right: the raised suture (边棱) where the two half-shells meet runs out obliquely, lighter and smoother.
// Above the arc: clean moon-white paper with the faintest fibres and a soft warm shadow hugging the shell.
//
// The shell is shaded per pixel in init(): every pixel under the arc is put on a real sphere of radius arc.R (the arc is its limb),
// charted with an azimuthal-equidistant map so the furrow pattern is undistorted on the surface and foreshortens toward the limb.
// A height field (ridges / furrows / suture / micro relief) tilts the sphere normal; a key light from the upper left gives diffuse
// shading + short cast shadows, and two bakes of the pin-point speculars are cross-faded in draw() so the glints flicker as it turns.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const norm3 = (x, y, z) => { const m = Math.hypot(x, y, z); return [x / m, y / m, z / m]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const NLUT = 512, IMAX = 1.15;
function lut(stops) {
  const f = L.makeRamp(stops); const out = new Float32Array(NLUT * 3);
  for (let i = 0; i < NLUT; i++) { const c = f(i / (NLUT - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

function buildWalnut(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s04a'), nB = L.makeNoise('s04b'), nC = L.makeNoise('s04c');

  // ── geometry: screen pixel → point on the sphere (x right, y up, z toward the lens) → chart coords (surface px) ──
  const ALPHA = 0.44, sA = Math.sin(ALPHA), cA = Math.cos(ALPHA);   // chart centre sits in the middle of the visible cap
  let pu = 0, pv = 0, pnx = 0, pny = 0, pnz = 0;
  const chart = (x, y) => {
    pnx = (x - cx) / R; pny = (cy - y) / R;
    const q = pnx * pnx + pny * pny;
    pnz = q < 1 ? Math.sqrt(1 - q) : 0;
    const a2 = -pny * sA + pnz * cA, s2 = pnx * pnx + a2 * a2, sc = R * (1 + s2 * (0.1666667 + s2 * 0.075));
    pu = pnx * sc; pv = a2 * sc;
  };
  // the suture is a great circle of the sphere through two chosen screen points (bottom centre-right → right edge)
  const onSphere = (x, y) => { const nx = (x - cx) / R, ny = (cy - y) / R; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; };
  const pA = onSphere(a.cx - 40, a.crestY + 585), pB = onSphere(a.cx + 975, a.yAt(a.cx + 975) + 100);
  let NS = cross(pA, pB); NS = norm3(NS[0], NS[1], NS[2]);
  if (NS[1] < 0) NS = [-NS[0], -NS[1], -NS[2]];
  const SA = norm3(pA[0], pA[1], pA[2]), SBv = cross(NS, SA), SB = norm3(SBv[0], SBv[1], SBv[2]);
  const SEAM_W = 62, SEAM_H = 58;

  // ── slow fields on a coarse grid ──
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const cWx = new Float32Array(cw * ch), cWy = new Float32Array(cw * ch), cPat = new Float32Array(cw * ch), cOld = new Float32Array(cw * ch),
    cGa = new Float32Array(cw * ch), cGb = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    chart(X0 + i * CS, Y0 + j * CS); const k = j * cw + i;
    cWx[k] = nA.fbm(pu / 520 + 3.7, pv / 520 - 1.2, 2); cWy[k] = nB.fbm(pu / 520 - 8.1, pv / 520 + 6.4, 2);
    cPat[k] = nC.fbm(pu / 420 + 12, pv / 420 + 5, 3);
    cOld[k] = nA.fbm(pu / 260 - 40, pv / 260 + 31, 3);
    cGa[k] = nC.n2(pu / 360 + 71, pv / 360 - 15) + 0.3 * nA.n2(pu / 140 + 5, pv / 140 + 66);
    cGb[k] = nB.n2(pu / 330 - 52, pv / 330 + 28) + 0.3 * nC.n2(pu / 120 - 9, pv / 120 + 3);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  // ── the shell pattern. Furrows follow the zero-lines of two independent, stretched noise fields, so they wind and cross into an
  //    irregular net; slow fields let them swell into pits in some places and pinch shut in others, and a third field punches lone pits.
  //    Between the furrows the shell stands up as rounded ridges: a steep wall (pWall) and then a broad crown toward the middle (pCrown) ──
  const SA1 = 230, SB1 = 325, VS = 1.45;     // VS: the net is stretched down the meridian to counter the foreshortening
  const cRA = Math.cos(0.62), sRA = Math.sin(0.62), cRB = Math.cos(-0.5), sRB = Math.sin(-0.5);
  let pCrown = 0, pKnob = 0;
  const pattern = (u, v, ga, gb) => {
    v /= VS;
    const o2 = nB.n2(u / 116 + 9.3, v / 116 - 4.1), o3 = nA.n2(u / 58 + 31.7, v / 58 + 7.9);
    const fa = nA.n2((u * cRA + v * sRA) / (SA1 * 1.75), (v * cRA - u * sRA) / SA1) + 0.3 * o2 + 0.09 * o3;
    const fb = nC.n2((u * cRB + v * sRB) / (SB1 * 1.3) + 3.1, (v * cRB - u * sRB) / SB1 - 8.2) - 0.24 * o2 + 0.1 * o3;
    const wa = 0.07 + 0.19 * sstep(0.0, 0.7, ga), wb = 0.06 + 0.17 * sstep(0.05, 0.75, gb);      // narrow crack … wide furrow
    const da = sstep(-0.85, -0.4, ga), db = sstep(-0.78, -0.3, gb);                             // a few stretches heal over
    const a2 = fa * fa, b2 = fb * fb;
    const pit = sstep(0.42, 0.66, nB.n2(u / 150 - 21, v / 150 + 40) + 0.25 * o3);
    pKnob = o3;
    pCrown = (1 - da * Math.exp(-a2 / 0.11)) * (1 - db * Math.exp(-b2 / 0.11)) * (1 - 0.6 * pit);
    return 1 - (1 - da * Math.exp(-a2 / (wa * wa))) * (1 - db * Math.exp(-b2 / (wb * wb))) * (1 - pit);   // furrow depth 0 … 1
  };
  // full field at a screen position → ridge height 0 … 1; also leaves the wall mask in fWall (0 furrow floor … 1 ridge)
  let fSm = 0, fSm2 = 0, fDs = 0, fWall = 0;
  const fieldAt = (x, y) => {
    chart(x, y);
    const dn = pnx * NS[0] + pny * NS[1] + pnz * NS[2], ds = R * dn * (1 + dn * dn * 0.1667);
    const e = ds / SEAM_W, e2 = ds / (SEAM_W * 1.9);
    fSm = e * e < 14 ? Math.exp(-0.5 * e * e) : 0; fSm2 = e2 * e2 < 14 ? Math.exp(-0.5 * e2 * e2) : 0; fDs = ds;
    const i = x - X0, j = y - Y0;
    let fur = pattern(pu + 64 * bil(cWx, i, j), pv + 64 * bil(cWy, i, j), bil(cGa, i, j), bil(cGb, i, j));
    // near the limb we look along the surface and the ridges hide most of the furrows; toward the suture they run out into its smooth shoulders
    fur *= (0.3 + 0.7 * sstep(0.02, 0.3, pnz)) * (1 - 0.92 * fSm2);
    fWall = 1 - Math.pow(fur, 1.7);                                   // a firm rim and steep walls
    return fWall * (0.56 + 0.44 * (pCrown + (1 - pCrown) * fSm2));
  };

  // ── 1) height field (px of relief) ──
  const Hh = new Float32Array(N), NZ = new Float32Array(N), Sg = new Float32Array(N), Sm = new Float32Array(N), Mi = new Float32Array(N), Cr = new Float32Array(N);
  const AR = 44, RO2 = (R + 2.5) * (R + 2.5);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, x = X0 + i, ddx = x - cx;
      if (ddx * ddx + ddy * ddy > RO2) { NZ[k] = -1; continue; }
      const net = fieldAt(x, y), nz = pnz, sm = fSm, ds = fDs, knob = pKnob, wall = fWall;
      NZ[k] = nz;
      const fine = sstep(0.05, 0.24, nz);
      const m1 = nB.n2(pu / 6.5 + 11, pv / 6.5), m2 = nA.n2(pu / 17 + 50, pv / 17 - 20), m3 = nC.n2(pu / 44 - 7, pv / 44 + 13);
      const pit = 1 - sstep(0.15, 0.7, wall);                             // furrow floors are rough and dusty, the tops glass-smooth
      // the polished skin is never dead flat: slow swells and knobs break the reflections up into beads
      let h = AR * net + SEAM_H * sm + ((0.3 + 1.1 * pit) * m1 + (0.42 + 1.3 * pit) * m2 + 0.55 * m3 + 0.45 * knob) * (1 - 0.7 * sm) * fine;
      // the hairline where the two half-shells close, wandering along the top of the keel
      if (ds > -16 && ds < 16) {
        const st = R * Math.atan2(pnx * SB[0] + pny * SB[1] + pnz * SB[2], pnx * SA[0] + pny * SA[1] + pnz * SA[2]);
        const dl = ds - 3.2 * nA.n2(st / 150, 5.5) - 1.3 * nB.n2(st / 33, 2.2), c = Math.exp(-dl * dl / 4.5);
        h -= 3.2 * c; Cr[k] = c;
      }
      Hh[k] = h; Sg[k] = wall; Sm[k] = sm; Mi[k] = m1;
    }
  }

  // ── 2) shade ──
  // intensity → colour: pit-floor brown-black → jujube red → red-brown on the lit flanks. A lighter ramp for the keel and worn patches.
  const RED = lut([[0, '#120504'], [0.11, '#2a0d08'], [0.24, '#4a150c'], [0.4, '#6e1f12'], [0.56, '#8c2c18'], [0.7, '#a23a1e'], [0.81, '#b44d2a'], [0.9, '#c26439'], [1, '#d68a5c']]);
  const ORG = lut([[0, '#140503'], [0.11, '#2e0f08'], [0.24, '#531a0d'], [0.4, '#812b14'], [0.56, '#a8421e'], [0.72, '#c8643a'], [0.86, '#dd8450'], [1, '#f2ad7c']]);
  const K = norm3(-0.6, 0.68, 0.42);                 // key light: upper left, a little toward the lens
  const HG = norm3(-0.2, 0.86, 0.47);                // where the lamp's reflection would sit on a smooth ball: glints are strongest round it
  // every glint sits where the skin leans a fixed angle toward the lamp: on the lamp-side shoulder of each ridge and knob
  const TS = L.deg(15), TA = L.deg(12.5), TB = L.deg(18.5);       // soft sheen / pin-points at the start and the end of the shot
  const cTS = Math.cos(TS), sTS = Math.sin(TS), cTA = Math.cos(TA), sTA = Math.sin(TA), cTB = Math.cos(TB), sTB = Math.sin(TB);
  const LX = -0.555, LY = -0.832;                    // screen direction toward the key light
  const TAPS = [3, 6, 10, 14, 19, 25, 32, 40, 50, 62], NT = TAPS.length;
  const tdx = TAPS.map((d) => Math.round(LX * d)), tdy = TAPS.map((d) => Math.round(LY * d)), trise = TAPS.map((d) => d * 0.52);
  const body = new ImageData(RW, RH), sa = new ImageData(RW, RH), sb = new ImageData(RW, RH);
  const d = body.data, da = sa.data, db = sb.data;
  for (let j = 1; j < RH - 1; j++) {
    const ny = (cy - (Y0 + j)) / R;
    for (let i = 1; i < RW - 1; i++) {
      const k = j * RW + i, nz = NZ[k];
      if (nz < 0) continue;
      const nx = (X0 + i - cx) / R;
      const hx = (Hh[k + 1] - Hh[k - 1]) * 0.5, hy = (Hh[k + RW] - Hh[k - RW]) * 0.5;
      // surface gradient = screen gradient (hx, -hy, 0) projected on the tangent plane; the bumped normal leans away from it
      const gn = hx * nx - hy * ny, fade = sstep(0.02, 0.2, nz);
      let px = nx - (hx - gn * nx) * fade, py = ny - (-hy - gn * ny) * fade, pz = nz + gn * nz * fade;
      const il = 1 / Math.sqrt(px * px + py * py + pz * pz); px *= il; py *= il; pz *= il;
      // short cast shadows: is anything toward the light higher than the light ray?
      const h0 = Hh[k]; let occ = 0;
      for (let t = 0; t < NT; t++) {
        const ii = i + tdx[t], jj = j + tdy[t]; if (ii < 0 || jj < 0) break;
        const o = Hh[jj * RW + ii] - h0 - trise[t]; if (o > occ) occ = o;
      }
      const lit = 1 - 0.85 * sstep(0, 12, occ);
      const net = Sg[k], sm = Sm[k], top = sstep(0.45, 0.9, net), cav = 1 - sstep(0.06, 0.7, net);
      const dK = px * K[0] + py * K[1] + pz * K[2], wrap = dK > -0.12 ? (dK + 0.12) / 1.12 : 0;
      const fill = Math.max(0, px * 0.5 + py * 0.3 + pz * 0.81);
      const old = bil(cOld, i, j), pat = bil(cPat, i, j);
      let I = (0.07 + 0.09 * net + 0.62 * wrap * lit + 0.11 * fill) * (1 - 0.62 * cav) * (1 + 0.16 * old) * (1 + 0.03 * Mi[k]);
      I *= 1 - 0.45 * Cr[k];
      const li = (L.clamp(I / IMAX) * (NLUT - 1) | 0) * 3;
      const pm = L.clamp(0.04 + 0.4 * pat + 0.85 * sm - 0.2 * cav);
      let cr = RED[li] + (ORG[li] - RED[li]) * pm, cg = RED[li + 1] + (ORG[li + 1] - RED[li + 1]) * pm, cb = RED[li + 2] + (ORG[li + 2] - RED[li + 2]) * pm;
      // polish: a soft warm sheen on the lamp side of every crest …
      const kd = nx * K[0] + ny * K[1] + nz * K[2], tl = Math.sqrt(Math.max(1e-4, 1 - kd * kd));
      const pn = px * nx + py * ny + pz * nz, pt = (dK - kd * pn) / tl;
      const env2 = 0.4 + 0.6 * sstep(0.6, 0.97, nx * HG[0] + ny * HG[1] + nz * HG[2]);
      const gloss = (0.12 + 0.88 * top) * lit * sstep(0.02, 0.1, nz) * env2;
      const dS = pn * cTS + pt * sTS;
      if (dS > 0.6) { const s2 = dS * dS, s4 = s2 * s2, s8 = s4 * s4, sh = s8 * s8 * s8 * 0.085 * gloss; cr += 255 * sh; cg += 152 * sh; cb += 98 * sh; }
      const o = k * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
      // … and the pin-point glints on top of it, baked for two positions of the lamp
      const dA = pn * cTA + pt * sTA, dB = pn * cTB + pt * sTB;
      if (dA > 0.94) { const s = Math.pow(dA, 150) * 0.8 * gloss; da[o] = 255 * s; da[o + 1] = 217 * s; da[o + 2] = 176 * s; da[o + 3] = 255; }
      if (dB > 0.94) { const s = Math.pow(dB, 150) * 0.8 * gloss; db[o] = 255 * s; db[o + 1] = 217 * s; db[o + 2] = 176 * s; db[o + 3] = 255; }
    }
  }
  const toCanvas = (img) => { const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(img, 0, 0); return c; };
  const raw = toCanvas(body);

  // ── 3) silhouette: the ridge tops lie exactly on the arc; where a furrow runs over the limb the outline dips a few px ──
  const out = L.makeCanvas(RW, RH), g = out.getContext('2d');
  g.translate(-X0, -Y0);
  const span = a.span(PAD + 40);
  g.beginPath();
  const rl = R - 3, STEP = 2.5 / R;
  for (let t = -span, first = true; t <= span; t += STEP) {
    fieldAt(cx + rl * Math.sin(t), cy - rl * Math.cos(t));
    const dip = 4.2 * sstep(0.8, 0.5, fWall), p = a.pt(t, -dip);
    if (first) { g.moveTo(p.x, p.y); first = false; } else g.lineTo(p.x, p.y);
  }
  g.lineTo(W + PAD + 50, H + PAD + 50); g.lineTo(-PAD - 50, H + PAD + 50); g.closePath();
  g.save(); g.clip(); g.drawImage(raw, X0, Y0); g.restore();
  return { body: out, specA: toCanvas(sa), specB: toCanvas(sb), x0: X0, y0: Y0 };
}

/** moon-white paper behind the shell, with a soft warm shadow hugging the arc */
function buildBg(env) {
  const a = env.arc;
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.drawImage(L.paperTex(W, H, { base: '#dfe6e4', seed: 404, tone: '#8fa6a4', fiber: 0.4, stain: 0.3, grain: 0.1 }), 0, 0);
  // studio falloff: a touch brighter toward the light, cooler and deeper in the far corners
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = L.radial(g, 640, 400, 80, 1500, [[0, 'rgba(255,255,255,0.45)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(70,96,104,0.32)']]);
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply';
  // warm bounce all round the shell …
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 2, a.R + 190, [[0, '#f1dcd0'], [0.25, '#f6e9e2'], [1, '#ffffff']]);
  g.fillRect(0, 0, W, H);
  // … and its shadow thrown down-right, away from the key light
  g.fillStyle = L.radial(g, a.cx + 58, a.cy + 16, a.R - 46, a.R + 64, [[0, '#dcb3a0'], [0.45, '#e9cdc0'], [1, '#ffffff']]);
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '文玩核桃',
  tone: 'dark',
  init(env) {
    S = { bg: buildBg(env), ...buildWalnut(env) };
  },
  draw(ctx, env, p) {
    ctx.drawImage(S.bg, 0, 0);
    // the shell turns a little about the arc's centre: the furrows slide along the arc, the outline stays put
    const rot = L.lerp(-0.0065, 0.0065, p);
    L.cam(ctx, env, { rot }, () => {
      ctx.drawImage(S.body, S.x0, S.y0);
      // glints on the ridge tops flicker as the surface passes under the light
      ctx.globalCompositeOperation = 'lighter';
      if (p < 0.995) { ctx.globalAlpha = 1 - p; ctx.drawImage(S.specA, S.x0, S.y0); }
      if (p > 0.005) { ctx.globalAlpha = p; ctx.drawImage(S.specB, S.x0, S.y0); }
    });
  },
};
