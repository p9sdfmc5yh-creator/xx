// s05 — 枸杞. Six frames of pure colour clash: a mound of dried goji berries (枸杞子) under flat peacock blue.
// The arc is the top edge of the mound; a slender green fruit-stalk lies along it as a hairline rim.
//
// The berries are NOT vector shapes: init() rasterises ~900 wrinkled spindle-shaped height bumps into a z-buffer
// (each berry = an affine-mapped spindle with creases looked up from stretched noise tiles), then lights the
// height field per pixel (wrapped diffuse → colour ramp, contact AO, short cast shadows) and bakes three specular
// maps for three slightly different light directions. draw() slides the pile along the arc and cross-fades the
// specular maps, so every berry's narrow highlight flickers as the mound turns.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 130;          // margin around the frame for the slide along the arc
const ROT = 0.032;        // ± rotation about the arc centre over the shot (≈ 150 px of travel at the crest)
const BLUE = '#0e8a8f';   // 孔雀蓝 — perfectly flat
const TN = 256;           // noise tile size
const NONE = 65535;       // "no berry here" id
const ZF = -40;           // floor height of the crevices
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// the mound curves away toward its top edge: berries there are seen at a grazing angle (squashed radially) and are farther away (smaller)
const kOf = (d) => 0.6 + 0.4 * sstep(0, 320, d);
const szOf = (d) => 0.68 + 0.32 * sstep(0, 400, d) + 0.08 * sstep(400, 760, d);

function norm3(x, y, z) { const m = Math.hypot(x, y, z); return [x / m, y / m, z / m]; }

/** noise tiles the berry wrinkles are looked up from */
function makeTiles() {
  const nA = L.makeNoise('s05wrinkle'), nB = L.makeNoise('s05lump');
  const RT = new Float32Array(TN * TN), BT = new Float32Array(TN * TN), FT = new Float32Array(TN * TN);
  for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++) {
    const k = y * TN + x;
    const r = 1 - Math.abs(nA.n2(x / 19, y / 19) + 0.25 * nA.n2(x / 9 + 30, y / 9));
    RT[k] = Math.pow(L.clamp((r - 0.62) / 0.38), 1.5);       // long, clean crease lines (1 on the line) — no fine octaves, they read as stitches
    BT[k] = nB.fbm(x / 30, y / 30, 3) * 0.5 + 0.5;            // slow lumps
    FT[k] = nB.n2(x / 2.6 + 40, y / 2.6 - 7) * 0.5 + 0.5;     // leathery micro-grain
  }
  return { RT, BT, FT };
}

/** one berry: centre, half-length al, half-width bl, angle phi (measured from the local arc tangent), radial squash k */
function makeBerry(rnd, arc, x, y, al, bl, phi, k, z0, lg) {
  const th = Math.atan2(x - arc.cx, arc.cy - y);
  const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(phi), sp = Math.sin(phi);
  const bb = bl * 1.5;
  const fxu = cp * ct - k * sp * st, fxv = -sp * ct - k * cp * st, fyu = cp * st + k * sp * ct, fyv = -sp * st + k * cp * ct;
  return {
    x, y, a: al, b: bl,
    // screen offset → berry-local px (lu along the berry, lv across it)
    m00: ct * cp - (st * sp) / k, m01: st * cp + (ct * sp) / k, m10: -ct * sp - (st * cp) / k, m11: -st * sp + (ct * cp) / k,
    ex: Math.hypot(al * fxu, bb * fxv) + 2, ey: Math.hypot(al * fyu, bb * fyv) + 2,
    bend: rnd.range(-0.34, 0.34), z0, tilt: rnd.range(-12, 12),
    hmax: bl * rnd.range(0.8, 1.0) * Math.sqrt(k),
    ox: rnd.range(60, TN - 62), oy: rnd.range(bb + 2, TN - bb - 3), ox2: rnd.range(92, TN - 94), oy2: rnd.range(50, TN - 52),
    sA: rnd.range(0.13, 0.3), shr: rnd.range(-0.24, 0.24),
    row1: rnd.int(0, TN - 1) * TN, row2: rnd.int(0, TN - 1) * TN, lox: rnd.range(al * 0.25 + 2, TN - al * 0.25 - 3),
    fc: rnd.range(-0.42, 0.42), fs: rnd.range(-0.35, 0.35), fq: rnd.range(-0.3, 0.3), fd: rnd.chance(0.78) ? rnd.range(0.2, 0.42) : 0,
    crease: rnd.range(0.14, 0.3),
    tint: L.clamp(0.66 + 0.3 * rnd.gauss()), gain: rnd.range(0.93, 1.07) * lg,
  };
}

/** scatter the pile: three stacked layers of berries, each a variable-density Poisson-disc set (random headings, no rows) */
function scatter(env, X0, Y0, RW, RH) {
  const a = env.arc, R = a.R;
  const out = [];
  const xmin = X0 - 70, xmax = X0 + RW + 70, ymin = Y0, ymax = Y0 + RH + 70;
  const CELL = 76, gx0 = xmin - CELL, gy0 = ymin - CELL, gw = Math.ceil((xmax - xmin) / CELL) + 3, gh = Math.ceil((ymax - ymin) / CELL) + 3;
  const layers = [
    { seed: 's05top', rmin: 71, tries: 26000, z: [50, 100], rim: true, gain: 1 },
    { seed: 's05mid', rmin: 60, tries: 22000, z: [2, 36], rim: false, gain: 0.96 },
    { seed: 's05low', rmin: 56, tries: 16000, z: [-34, -10], rim: false, gain: 0.9 },
  ];
  for (const Ly of layers) {
    const rnd = L.rng(Ly.seed);
    const grid = new Array(gw * gh);
    const reg = (x, y, r) => {
      const gi = Math.floor((x - gx0) / CELL), gj = Math.floor((y - gy0) / CELL);
      if (gi < 0 || gj < 0 || gi >= gw || gj >= gh) return;
      (grid[gj * gw + gi] || (grid[gj * gw + gi] = [])).push({ x, y, r });
    };
    const free = (x, y, rc, k) => {
      const th = Math.atan2(x - a.cx, a.cy - y), ct = Math.cos(th), st = Math.sin(th);
      const gi = Math.floor((x - gx0) / CELL), gj = Math.floor((y - gy0) / CELL);
      for (let jj = gj - 1; jj <= gj + 1; jj++) for (let ii = gi - 1; ii <= gi + 1; ii++) {
        if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
        const cell = grid[jj * gw + ii]; if (!cell) continue;
        for (const q of cell) {
          const dx = q.x - x, dy = q.y - y;
          const dt = dx * ct + dy * st, dn = (-dx * st + dy * ct) / k;
          const lim = 0.5 * (rc + q.r);
          if (dt * dt + dn * dn < lim * lim) return false;
        }
      }
      return true;
    };
    // the rim row: berries lying along the top edge of the mound, their backs just touching the stalk
    if (Ly.rim) {
      const s = a.span(PAD + 220);
      let th = -s;
      while (th < s) {
        const sc = szOf(12), k = kOf(12);
        const al = sc * rnd.range(72, 96), bl = sc * rnd.range(28, 36);
        const phi = rnd.range(-0.2, 0.2) + (rnd.chance(0.5) ? Math.PI : 0);
        const er = k * Math.hypot(al * Math.sin(phi), bl * Math.cos(phi));
        const d = er + 5 + rnd.range(0, 3);
        const p = a.pt(th + (al * 0.9) / R, -d);
        out.push(makeBerry(rnd, a, p.x, p.y, al, bl, phi, k, rnd.range(70, 100), 1));
        reg(p.x, p.y, Ly.rmin * sc * 0.8);
        th += (al * rnd.range(1.55, 1.95)) / R;
      }
    }
    for (let n = 0; n < Ly.tries; n++) {
      const x = rnd.range(xmin, xmax), y = rnd.range(ymin, ymax);
      const d = R - Math.hypot(x - a.cx, y - a.cy);
      if (d < 8) continue;
      const sc = szOf(d), k = kOf(d);
      const sv = sc * rnd.range(0.88, 1.1);
      const al = sv * rnd.range(70, 98) * (rnd.chance(0.25) ? rnd.range(0.74, 0.9) : 1), bl = sv * rnd.range(29, 39);
      // near the rim the berries settle roughly along the edge; deeper down the headings are fully random
      const phi = d < 200 ? rnd.gauss() * (0.22 + (d / 200) * 1.5) + (rnd.chance(0.5) ? Math.PI : 0) : rnd.range(0, L.TAU);
      const er = k * Math.hypot(al * Math.sin(phi), bl * Math.cos(phi));
      if (d < er + 6) continue;
      const rc = Ly.rmin * sc;
      if (!free(x, y, rc, k)) continue;
      out.push(makeBerry(rnd, a, x, y, al, bl, phi, k, rnd.range(Ly.z[0], Ly.z[1]), Ly.gain));
      reg(x, y, rc);
    }
  }
  return out;
}

/** z-buffer the berries: Z = height, ID = which berry, SC = stalk-scar mask */
function raster(berries, T, X0, Y0, RW, RH, Z, ZS, ID, SC, DM) {
  const { RT, BT, FT } = T;
  const NL = 1024, ND = 512;
  const WL = new Float32Array(NL + 1), HL = new Float32Array(NL + 1), DL = new Float32Array(ND + 1);
  for (let i = 0; i <= NL; i++) {
    const u = (i / NL) * 2 - 1, au = Math.abs(u);
    // spindle outline: the style end (u<0) tapers to a point, the stalk end (u>0) is blunter
    const w = u < 0 ? Math.pow(Math.max(0, 1 - Math.pow(au, 2.3)), 0.6) : Math.pow(Math.max(0, 1 - au * au * au), 0.5);
    WL[i] = w; HL[i] = Math.pow(w, 0.7);
  }
  for (let i = 0; i <= ND; i++) DL[i] = Math.pow(Math.max(0, 1 - i / ND), 0.42);
  for (let bi = 0; bi < berries.length; bi++) {
    const B = berries[bi];
    const x0 = Math.max(0, Math.floor(B.x - B.ex - X0)), x1 = Math.min(RW - 1, Math.ceil(B.x + B.ex - X0));
    const y0 = Math.max(0, Math.floor(B.y - B.ey - Y0)), y1 = Math.min(RH - 1, Math.ceil(B.y + B.ey - Y0));
    if (x0 > x1 || y0 > y1) continue;
    const { m00, m01, m10, m11, bend, z0, tilt, hmax, ox, oy, ox2, oy2, sA, shr, row1, row2, lox, fc, fs, fq, fd, crease } = B;
    const ia = 1 / B.a, ib = 1 / B.b, bl = B.b;
    const su = 0.9 * B.a, rs = Math.max(3.2, 0.066 * B.a), rs2 = rs * rs * 1.2;
    for (let j = y0; j <= y1; j++) {
      const dy = Y0 + j - B.y;
      let k = j * RW + x0;
      for (let i = x0; i <= x1; i++, k++) {
        const dx = X0 + i - B.x;
        const lu = m00 * dx + m01 * dy, u = lu * ia;
        if (u <= -0.999 || u >= 0.999) continue;
        const vv = (m10 * dx + m11 * dy) * ib - bend * (u * u - 0.3);
        const li = ((u + 1) * 0.5 * NL) | 0;
        const lq = lox + lu * 0.25, lqi = lq | 0, lr = (vv > 0 ? row1 : row2) + lqi, lump = BT[lr] + (BT[lr + 1] - BT[lr]) * (lq - lqi);
        const w = WL[li] * (0.72 + 0.56 * lump);
        const vn = vv / w, q = vn * vn;
        if (!(q < 1)) continue;
        const dome = DL[(q * ND) | 0];
        // shrivelling: lengthwise lobes (tile sampled stretched and sheared along the berry), dents, and long crease lines
        const vb = vv * bl;
        const tx = ox + lu * sA + vb * shr, ty = oy + vb;
        const xi = tx | 0, yi = ty | 0, fx = tx - xi, fy = ty - yi, t0 = yi * TN + xi;
        const b0 = BT[t0], b1 = BT[t0 + 1], b2 = BT[t0 + TN], b3 = BT[t0 + TN + 1];
        const lobe = (b0 + (b1 - b0) * fx) * (1 - fy) + (b2 + (b3 - b2) * fx) * fy;
        const ux = ox2 + lu * 0.8, uy = oy2 + vb * 0.8, uxi = ux | 0, uyi = uy | 0, ufx = ux - uxi, ufy = uy - uyi, t2 = uyi * TN + uxi;
        const d0 = BT[t2], d1 = BT[t2 + 1], d2 = BT[t2 + TN], d3 = BT[t2 + TN + 1];
        const dent = (d0 + (d1 - d0) * ufx) * (1 - ufy) + (d2 + (d3 - d2) * ufx) * ufy;
        const wx = ox + lu * 0.12 + vb * shr, wy = oy + vb * 0.6, wxi = wx | 0, wyi = wy | 0, wfx = wx - wxi, wfy = wy - wyi, t1 = wyi * TN + wxi;
        const c0 = RT[t1], c1 = RT[t1 + 1], c2 = RT[t1 + TN], c3 = RT[t1 + TN + 1];
        const cr = (c0 + (c1 - c0) * wfx) * (1 - wfy) + (c2 + (c3 - c2) * wfx) * wfy;
        // one deep fold wandering down the length
        const ft = (vn - (fc + fs * u + fq * u * u)) * 4.2, fo = 1 / (1 + ft * ft), fold = fo * fo;
        const fine = FT[(((vb * 1.6) | 0) & 255) * TN + (((lu * 1.6) | 0) & 255)];
        const env0 = hmax * HL[li] * dome, zc = z0 + tilt * u, body = 1 + 1.3 * (lobe - 0.5) + 0.42 * (dent - 0.5);
        const zs = zc + env0 * (body - 0.5 * fd * fold);
        const z = zc + env0 * (body - crease * cr - fd * fold) + (fine - 0.5) * 0.12 * dome;
        if (z > Z[k]) {
          Z[k] = z; ZS[k] = zs; ID[k] = bi; DM[k] = dome * HL[li] * 255;
          const du = lu - su, r2 = du * du + vb * vb;
          if (r2 < rs2) { const t = L.clamp((Math.sqrt(r2) / rs - 0.6) / 0.45); SC[k] = 255 * (1 - t * t * (3 - 2 * t)); } else SC[k] = 0;
        }
      }
    }
  }
}

function lut(stops) {
  const f = L.makeRamp(stops), out = new Float32Array(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = f(i / 1023); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** the green fruit-stalk lying along the crest (drawn in frame coordinates) */
function drawStalk(g, env) {
  const a = env.arc, R = a.R;
  const s = a.span(PAD + 200), n = 760;
  const nz = L.makeNoise('s05stalk'), rnd = L.rng('s05stalk');
  const nodes = [];
  for (let al = -s * R + rnd.range(0, 120); al < s * R; al += rnd.range(170, 390)) nodes.push({ al, k: rnd.range(0.7, 1.25) });
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const th = L.lerp(-s, s, i / n), al = th * R;
    let up = 2.0 + 0.6 * nz.n2(al / 95, 1.3), dn = -6.2 - 1.2 * nz.n2(al / 70, 7.7) - 0.6 * nz.n2(al / 21, 3.1);
    for (const nd of nodes) { const e = (al - nd.al) / 9; if (e > -3 && e < 3) { const bm = Math.exp(-e * e) * nd.k; up += 1.1 * bm; dn -= 2.4 * bm; } }
    top.push(a.pt(th, up)); bot.push(a.pt(th, dn));
  }
  // soft shadow the stalk drops onto the berries just below it
  g.save(); a.clipBelow(g, 0);
  g.fillStyle = L.radial(g, a.cx, a.cy, R - 18, R - 4, [[0, 'rgba(70,6,8,0)'], [0.5, 'rgba(70,6,8,0.16)'], [1, 'rgba(60,5,8,0.62)']]);
  a.pathBand(g, 0, -28); g.fill();
  g.restore();
  // body: a thin cylinder, lit along its top
  const body = () => { g.beginPath(); g.moveTo(top[0].x, top[0].y); for (let i = 1; i <= n; i++) g.lineTo(top[i].x, top[i].y); for (let i = n; i >= 0; i--) g.lineTo(bot[i].x, bot[i].y); g.closePath(); };
  g.fillStyle = L.radial(g, a.cx, a.cy, R - 9.2, R + 3.5, [[0, '#2c6a16'], [0.26, '#4b9424'], [0.52, '#7fbf3a'], [0.76, '#a8dc52'], [0.9, '#d0f27e'], [1, '#9ccd49']]);
  body(); g.fill();
  g.save(); body(); g.clip();
  // mottling: yellower / deeper green stretches
  for (let i = 0; i < 90; i++) {
    const th = rnd.range(-s, s), len = rnd.range(30, 150) / R;
    g.strokeStyle = rnd.chance(0.5) ? L.rgba('#e2ef6e', rnd.range(0.12, 0.3)) : L.rgba('#2f7a1c', rnd.range(0.12, 0.3));
    g.lineWidth = rnd.range(1.5, 4); a.stroke(g, rnd.range(-6, 1), th, th + len);
  }
  // nodes: a darker ring and a pale bud scar
  for (const nd of nodes) {
    a.at(g, nd.al / R, -2.2, () => {
      g.fillStyle = 'rgba(226,232,140,0.7)'; g.beginPath(); g.ellipse(0, 0.5, 3.2, 1.5, 0, 0, L.TAU); g.fill();
    });
  }
  g.restore();
  // hairline specular along the top of the stalk
  g.save(); g.lineCap = 'round'; g.setLineDash([46, 13, 92, 24, 27, 11, 140, 18]);
  g.strokeStyle = 'rgba(244,255,200,0.6)'; g.lineWidth = 1.1; a.stroke(g, 0.3, -s, s);
  g.restore();
}

function buildPile(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 16;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const T = makeTiles();
  const berries = scatter(env, X0, Y0, RW, RH);
  const Z = new Float32Array(N).fill(ZF), ZS = new Float32Array(N).fill(ZF), ID = new Uint16Array(N).fill(NONE), SC = new Uint8Array(N), DM = new Uint8Array(N);
  raster(berries, T, X0, Y0, RW, RH, Z, ZS, ID, SC, DM);

  // blurred low-res height → contact occlusion (things lower than their surroundings go dark)
  const DS = 4, gw = Math.ceil(RW / DS), gh = Math.ceil(RH / DS);
  let G = new Float32Array(gw * gh), G2 = new Float32Array(gw * gh);
  for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) {
    let s = 0, n = 0;
    for (let jj = gj * DS; jj < Math.min(RH, gj * DS + DS); jj++) for (let ii = gi * DS; ii < Math.min(RW, gi * DS + DS); ii++) { s += Z[jj * RW + ii]; n++; }
    G[gj * gw + gi] = s / n;
  }
  const BR = 3;
  for (let pass = 0; pass < 2; pass++) {
    for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) {
      let s = 0; for (let o = -BR; o <= BR; o++) s += G[gj * gw + Math.min(gw - 1, Math.max(0, gi + o))];
      G2[gj * gw + gi] = s / (BR * 2 + 1);
    }
    for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) {
      let s = 0; for (let o = -BR; o <= BR; o++) s += G2[Math.min(gh - 1, Math.max(0, gj + o)) * gw + gi];
      G[gj * gw + gi] = s / (BR * 2 + 1);
    }
  }

  // light: key from the upper left, three variants for the travelling highlight
  const Lm = norm3(-0.38, -0.6, 0.7);
  const Ls = [norm3(-0.64, -0.42, 0.64), Lm, norm3(-0.08, -0.7, 0.71)];
  const Hs = Ls.map((l) => norm3(l[0], l[1], l[2] + 1));
  const lxy = Math.hypot(Lm[0], Lm[1]), sdx = Lm[0] / lxy, sdy = Lm[1] / lxy, tanE = Lm[2] / lxy;
  const SH = [4, 8, 13, 19, 26, 34].map((s) => ({ s, ox: Math.round(sdx * s), oy: Math.round(sdy * s) }));

  const RAMP_D = lut([[0, '#43070b'], [0.2, '#700e0f'], [0.42, '#a01512'], [0.6, '#c62118'], [0.76, '#d82c1b'], [0.9, '#e73f20'], [1, '#f8612e']]);
  const RAMP_O = lut([[0, '#4a090b'], [0.2, '#7d1410'], [0.38, '#b61c15'], [0.54, '#dc2f1c'], [0.7, '#e2381f'], [0.84, '#f04a22'], [0.94, '#fc6830'], [1, '#ff8040']]);
  const tint = new Float32Array(berries.length), gain = new Float32Array(berries.length);
  berries.forEach((b, i) => { tint[i] = b.tint; gain[i] = b.gain; });

  const img = new ImageData(RW, RH), d = img.data;
  const spec = [new ImageData(RW, RH), new ImageData(RW, RH), new ImageData(RW, RH)];
  const Rout2 = (R + 3) * (R + 3);
  for (let j = 0; j < RH; j++) {
    const ddy = cy - (Y0 + j);
    const gy = Math.min(gh - 1.001, Math.max(0, j / DS - 0.5)), gj = gy | 0, gfy = gy - gj;
    for (let i = 0; i < RW; i++) {
      const ddx = X0 + i - cx, rr2 = ddx * ddx + ddy * ddy;
      if (rr2 > Rout2) continue;
      const k = j * RW + i, o = k * 4, id = ID[k], z = Z[k];
      const depth = R - Math.sqrt(rr2);
      // occlusion
      const gx = Math.min(gw - 1.001, Math.max(0, i / DS - 0.5)), gi = gx | 0, gfx = gx - gi, g0 = gj * gw + gi;
      const zb = (G[g0] + (G[g0 + 1] - G[g0]) * gfx) * (1 - gfy) + (G[g0 + gw] + (G[g0 + gw + 1] - G[g0 + gw]) * gfx) * gfy;
      let ao = (zb - z - 2) / 40; ao = 1 - 0.8 * (ao < 0 ? 0 : ao > 1 ? 1 : ao);
      if (id === NONE) {
        const t = 0.1 * ao, c = (t * 1023) | 0;
        d[o] = RAMP_D[c * 3]; d[o + 1] = RAMP_D[c * 3 + 1]; d[o + 2] = RAMP_D[c * 3 + 2]; d[o + 3] = 255;
        continue;
      }
      // slope of the berry's own surface (never differentiate across a silhouette)
      const l = i > 0 && ID[k - 1] === id, r = i < RW - 1 && ID[k + 1] === id, u = j > 0 && ID[k - RW] === id, dn = j < RH - 1 && ID[k + RW] === id;
      const hx = l && r ? (Z[k + 1] - Z[k - 1]) * 0.5 : r ? Z[k + 1] - z : l ? z - Z[k - 1] : 0;
      const hy = u && dn ? (Z[k + RW] - Z[k - RW]) * 0.5 : dn ? Z[k + RW] - z : u ? z - Z[k - RW] : 0;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * inv, ny = -hy * inv, nzz = inv;
      // glossy skin: the highlight follows the smooth body of the berry, only partly broken by the creases
      const sx = l && r ? (ZS[k + 1] - ZS[k - 1]) * 0.5 : r ? ZS[k + 1] - ZS[k] : l ? ZS[k] - ZS[k - 1] : 0;
      const sy = u && dn ? (ZS[k + RW] - ZS[k - RW]) * 0.5 : dn ? ZS[k + RW] - ZS[k] : u ? ZS[k] - ZS[k - RW] : 0;
      const gxx = sx * 0.65 + hx * 0.35, gyy = sy * 0.65 + hy * 0.35, ginv = 1 / Math.sqrt(gxx * gxx + gyy * gyy + 1), mx = -gxx * ginv, my = -gyy * ginv, mz = ginv;
      // short cast shadows toward the lower right
      let sh = 0;
      for (let q = 0; q < SH.length; q++) {
        const s = SH[q], ii = i + s.ox, jj = j + s.oy;
        if (ii < 0 || jj < 0) continue;
        const v = (Z[jj * RW + ii] - z - s.s * tanE * 0.85) / 9;
        if (v > sh) sh = v;
      }
      if (sh > 1) sh = 1;
      const dif = nx * Lm[0] + ny * Lm[1] + nzz * Lm[2];
      let wrap = (dif + 0.4) / 1.4; wrap = wrap < 0 ? 0 : wrap;
      // broad leathery sheen
      let nh = mx * Hs[1][0] + my * Hs[1][1] + mz * Hs[1][2]; nh = nh < 0 ? 0 : nh;
      const nh2 = nh * nh, nh4 = nh2 * nh2, sheen = nh4 * nh4;
      const edge = DM[k] / 255, rim = 0.68 + 0.32 * (edge > 0.5 ? 1 : edge * 2 * (2 - edge * 2));
      const lit = (1 - 0.58 * sh) * (0.38 + 0.62 * ao) * rim;
      // the crest of the mound is thin and back-lit: the berries up there glow orange
      let limb = (depth - 8) / 170; limb = limb < 0 ? 1 : limb > 1 ? 0 : 1 - limb * limb * (3 - 2 * limb);
      let t = (0.9 * wrap + 0.3 * sheen) * lit * gain[id] * (1.04 - 0.07 * (depth / 700)) * (1 + 0.2 * limb) + 0.05 * limb;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const c = ((t * 1023) | 0) * 3, m = Math.min(1, tint[id] + 0.45 * limb);
      let cr = RAMP_D[c] + (RAMP_O[c] - RAMP_D[c]) * m, cg = RAMP_D[c + 1] + (RAMP_O[c + 1] - RAMP_D[c + 1]) * m, cb = RAMP_D[c + 2] + (RAMP_O[c + 2] - RAMP_D[c + 2]) * m;
      const sc = SC[k] / 255;
      if (sc > 0) {
        // 果柄痕: a small pale scar where the stalk was attached
        const sl = 0.45 + 0.6 * t;
        cr += (255 * sl - cr) * sc; cg += (240 * sl - cg) * sc; cb += (212 * sl - cb) * sc;
      }
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
      // narrow specular streaks (kept clear of the stalk)
      if (depth > 7) {
        const sm = (1 - 0.85 * sh) * (0.25 + 0.75 * ao) * (1 - 0.7 * sc);
        for (let q = 0; q < 3; q++) {
          const hv = mx * Hs[q][0] + my * Hs[q][1] + mz * Hs[q][2];
          if (hv < 0.9) continue;
          const sp = Math.pow(hv, 64) * sm;
          if (sp < 0.01) continue;
          const sd = spec[q].data;
          sd[o] = 255; sd[o + 1] = 222; sd[o + 2] = 178; sd[o + 3] = Math.min(255, sp * 235);
        }
      }
    }
  }
  // soften the stair-steps where one berry's silhouette crosses another
  const src = new Uint8ClampedArray(d), RW4 = RW * 4;
  for (let j = 1; j < RH - 1; j++) for (let i = 1; i < RW - 1; i++) {
    const k = j * RW + i, id = ID[k];
    if (ID[k - 1] === id && ID[k + 1] === id && ID[k - RW] === id && ID[k + RW] === id) continue;
    const o = k * 4;
    if (src[o + 3] === 0 || src[o - RW4 + 3] === 0) continue;
    for (let c = 0; c < 3; c++) d[o + c] = (src[o + c] * 4 + src[o - 4 + c] + src[o + 4 + c] + src[o - RW4 + c] + src[o + RW4 + c]) * 0.125;
  }

  const raw = L.makeCanvas(RW, RH); raw.getContext('2d').putImageData(img, 0, 0);
  const base = L.makeCanvas(RW, RH), g = base.getContext('2d');
  g.translate(-X0, -Y0);
  g.save(); a.clipBelow(g, 1); g.drawImage(raw, X0, Y0);
  // a breath of bloom: the lit skins glow into the crevices
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.24; g.drawImage(L.blurred(raw, 9), X0, Y0);
  g.restore();
  drawStalk(g, env);
  const specs = spec.map((im) => { const c = L.makeCanvas(RW, RH); c.getContext('2d').putImageData(im, 0, 0); return c; });
  return { base, specs, x0: X0, y0: Y0, count: berries.length };
}

export default {
  name: '枸杞',
  tone: 'light',
  init(env) {
    S = buildPile(env);
  },
  draw(ctx, env, p) {
    const a = env.arc;
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H);
    const rot = L.lerp(-ROT, ROT, p);
    ctx.save();
    ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy);
    ctx.drawImage(S.base, S.x0, S.y0);
    // the highlight on every berry shifts as the mound turns under the light
    ctx.globalCompositeOperation = 'lighter';
    const w = [Math.max(0, 1 - 2 * p), 1 - Math.abs(2 * p - 1), Math.max(0, 2 * p - 1)];
    for (let q = 0; q < 3; q++) { if (w[q] < 0.01) continue; ctx.globalAlpha = w[q]; ctx.drawImage(S.specs[q], S.x0, S.y0); }
    ctx.restore();
  },
};
