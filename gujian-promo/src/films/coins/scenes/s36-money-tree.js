// s36 — 摇钱树枝叶. One leaf of a Han bronze money tree (摇钱树), back-lit in cold white on pure black, shallow focus.
// The arc is the leaf's upper main branch: thin and bright. A row of square-holed round coins hangs under it, each coin
// tangent to its neighbours, the square holes open onto black. Every coin carries a regular ring of short cast awns (芒);
// from the branch and the coin tops countless silver filaments rise across the arc like the barbs of a feather —
// bright and solid at the root, thin, soft and gone at the tip. Under the coins a second, out-of-focus branch melts into white mist.
// (The real object is green-patinated bronze; the silver back-light is a deliberate grade. No inscriptions are drawn.)
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;
const RC = 136;              // coin radius
const BTOP = 2.5, BBOT = -8; // the main branch occupies this dr band (its bright upper edge sits on the arc)
const DRC = BBOT - RC + 1.5; // dr of the coin centres (coins fused to the underside of the branch)
const HS = 49;               // half side of the square hole
const WR = 15, WI = 9;       // outer rim (外郭) / inner rim (内郭) widths
const LA = 25, NA = 60;      // the short regular awns round every coin
let S = null;

const sm = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const K0 = 'rgba(0,0,0,0)', K1 = 'rgba(0,0,0,1)';

/** one coin, shaded per pixel from a height field: raised outer rim, raised square inner rim, plain cast field, open square hole */
function buildCoin(seed) {
  const M = 3, SZ = 2 * (RC + M), c = SZ / 2, N = SZ * SZ;
  const nA = L.makeNoise('s36a' + seed), nB = L.makeNoise('s36b' + seed);
  const Hh = new Float32Array(N), Am = new Float32Array(N), Pt = new Float32Array(N), Ed = new Float32Array(N);
  const HR = 5.8, HI = 4.4;
  for (let j = 0; j < SZ; j++) for (let i = 0; i < SZ; i++) {
    const k = j * SZ + i, x = i + 0.5 - c, y = j + 0.5 - c, r = Math.hypot(x, y), sq = Math.max(Math.abs(x), Math.abs(y));
    if (r > RC + 2) continue;
    const ux = x / (r || 1), uy = y / (r || 1);
    const ro = RC - 0.8 + 0.9 * nA.n2(ux * 2.4 + 5, uy * 2.4 - 3);   // a cast outline is never a perfect circle …
    const hs = HS + 0.9 * nB.n2(x / 36 + 2, y / 36);                     // … nor the hole a perfect square
    Am[k] = L.clamp(ro - r + 0.5) * L.clamp(sq - hs + 0.5);
    if (Am[k] <= 0) continue;
    const rimO = sm(RC - WR - 3.5, RC - WR + 3, r) * (1 - sm(ro - 6.5, ro + 0.5, r));
    const rimI = (1 - sm(hs + WI - 3, hs + WI + 3, sq)) * sm(hs - 1.5, hs + 3, sq);
    const f1 = nA.fbm(x / 48, y / 48, 3), f2 = nB.n2(x / 3.1, y / 3.1), f3 = nB.n2(x / 11 + 9, y / 11 - 4);
    Hh[k] = HR * rimO + HI * rimI + 0.85 * f1 + 0.04 * f2 + 0.12 * f3;
    Pt[k] = 0.75 * nA.fbm(x / 70 + 11, y / 70 + 7, 3) + 0.45 * nB.fbm(x / 21 - 5, y / 21 + 13, 3);
    Ed[k] = sm(ro - 5, ro - 0.8, r) * Math.pow(Math.max(0, -uy), 0.6);    // the top edge of the rim catches the back-light
  }
  // a few casting pits (砂眼), scattered irregularly over the field
  const rp = L.rng('s36pit' + seed);
  for (let n = 0; n < 11; n++) {
    const an = rp.range(0, L.TAU), rr = rp.range(HS + WI + 16, RC - WR - 8), px = c + Math.cos(an) * rr, py = c + Math.sin(an) * rr;
    const pr = rp.range(1.3, 3.2), dep = pr * rp.range(0.35, 0.6), e = Math.ceil(pr) + 1;
    for (let j = Math.floor(py - e); j <= Math.ceil(py + e); j++) for (let i = Math.floor(px - e); i <= Math.ceil(px + e); i++) {
      if (i < 0 || j < 0 || i >= SZ || j >= SZ) continue;
      const q = ((i + 0.5 - px) ** 2 + (j + 0.5 - py) ** 2) / (pr * pr);
      if (q < 1) Hh[j * SZ + i] -= dep * (1 - q) * (1 - q);
    }
  }
  const lut = new Uint8ClampedArray(512 * 3);
  const ramp = L.makeRamp([[0, '#04090a'], [0.17, '#3c4a4c'], [0.4, '#9aa5a6'], [0.6, '#dde3e2'], [0.74, '#f1f3f2'], [0.84, '#ffffff'], [1, '#ffffff']]);
  for (let i = 0; i < 512; i++) { const q = ramp(i / 511); lut[i * 3] = q[0]; lut[i * 3 + 1] = q[1]; lut[i * 3 + 2] = q[2]; }
  const lx = -0.42, ly = -0.6, lz = 0.68;                 // soft key from the upper left, in front
  const hx0 = -0.229, hy0 = -0.327, hz0 = 0.917;          // half vector for the specular lobe
  const tx = -0.573, ty = -0.819, tanE = 0.36;            // toward the light on the surface, for the cast shadows
  const sheenOff = [-30, 22, -4, 12, -18][seed % 5];
  const cwA = Math.atan2(ty, tx) + [0.22, -0.2, 0.02, -0.1, 0.14][seed % 5], gainK = [1.0, 0.965, 1.03, 0.985, 1.015][seed % 5];   // every coin hangs at a slightly different tilt
  const img = new ImageData(SZ, SZ), d = img.data;
  const at = (x, y) => { const i = Math.round(x), j = Math.round(y); return i < 0 || j < 0 || i >= SZ || j >= SZ ? 0 : Hh[j * SZ + i]; };
  for (let j = 1; j < SZ - 1; j++) for (let i = 1; i < SZ - 1; i++) {
    const k = j * SZ + i; if (Am[k] <= 0) continue;
    const gx = (Hh[k + 1] - Hh[k - 1]) * 0.5, gy = (Hh[k + SZ] - Hh[k - SZ]) * 0.5;
    const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1), nx = -gx * inv, ny = -gy * inv, nz = inv;
    const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
    let occ = 0;
    for (let s = 2; s <= 18; s += 2) { const o = at(i + tx * s, j + ty * s) - Hh[k] - s * tanE; if (o > occ) occ = o; }
    const shadow = L.clamp(occ / 1.6);
    const hn = L.clamp(Hh[k] / HR);
    const sp = Math.pow(Math.max(0, nx * hx0 + ny * hy0 + nz * hz0), 40);
    const x = i + 0.5 - c, y = j + 0.5 - c;
    const sq = (x * 0.55 + y * 0.83 + sheenOff) / (0.46 * RC), sheen = Math.exp(-sq * sq);
    const cw = Math.cos(2 * (Math.atan2(y, x) - cwA));   // the two opposed bright fans of light a silvery disc throws back
    const alb = (0.86 + 0.28 * hn + 0.15 * Pt[k] * (1 - 0.5 * hn)) * gainK;
    const lum = (0.22 + 0.72 * diff * (1 - 0.78 * shadow)) * alb + 0.55 * sp * (0.35 + 0.65 * hn) + 0.07 * hn
      - 0.2 * (y / RC) + 0.11 * cw * (1 - 0.45 * hn) + 0.08 * sheen + 0.45 * Ed[k];
    const li = (L.clamp(((lum - 0.62) * 1.14 + 0.635) / 1.35) * 511 | 0) * 3;
    const cool = Pt[k] < 0 ? -Pt[k] : 0;                 // the dimmer patches lean a little toward teal
    const o = k * 4;
    d[o] = lut[li] - 24 * cool; d[o + 1] = lut[li + 1] - 6 * cool; d[o + 2] = lut[li + 2] + 3 * cool; d[o + 3] = Am[k] * 255;
  }
  const cv = L.makeCanvas(SZ, SZ), g = cv.getContext('2d');
  g.putImageData(img, 0, 0);
  // hairline handling marks: a bright lip with a dark twin, only on the metal
  const rs = L.rng('s36scr' + seed);
  g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round';
  for (let n = 0; n < 16; n++) {
    const an = rs.range(0, L.TAU), rr = RC * Math.sqrt(rs()) * 0.92, x0 = c + Math.cos(an) * rr, y0 = c + Math.sin(an) * rr;
    const dir = rs.range(0, Math.PI), len = rs.range(14, 64), bend = rs.range(-6, 6), al = rs.range(0.1, 0.3);
    const x1 = x0 + Math.cos(dir) * len, y1 = y0 + Math.sin(dir) * len, mx = (x0 + x1) / 2 - Math.sin(dir) * bend, my = (y0 + y1) / 2 + Math.cos(dir) * bend;
    g.lineWidth = rs.range(0.5, 1.0);
    g.strokeStyle = `rgba(60,74,76,${al * 0.8})`; g.beginPath(); g.moveTo(x0 + 0.7, y0 + 0.8); g.quadraticCurveTo(mx + 0.7, my + 0.8, x1 + 0.7, y1 + 0.8); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${al})`; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  return cv;
}

/** the ring of short cast awns round a coin: regular, evenly spaced, each a tiny two-facet spike */
function buildAwns() {
  const SZ = 2 * (RC + LA + 4), cv = L.makeCanvas(SZ, SZ), g = cv.getContext('2d');
  g.translate(SZ / 2, SZ / 2);
  for (let k = 0; k < NA; k++) {
    const an = ((k + 0.5) / NA) * L.TAU;
    const lit = 0.573 * Math.sin(an) - 0.819 * Math.cos(an) > 0 ? 1 : -1;   // which facet faces the key light
    g.save(); g.rotate(an);
    const r0 = RC - 4, r1 = RC + LA, hw = 2.9;
    g.fillStyle = L.linear(g, r0, 0, r1, 0, [[0, '#a3afb0'], [1, 'rgba(120,134,136,0.7)']]);
    g.beginPath(); g.moveTo(r0, -hw); g.lineTo(r1, -0.35); g.lineTo(r1, 0.35); g.lineTo(r0, hw); g.closePath(); g.fill();
    g.fillStyle = L.linear(g, r0, 0, r1, 0, [[0, '#ffffff'], [1, 'rgba(232,237,236,0.8)']]);
    g.beginPath(); g.moveTo(r0, lit * hw); g.lineTo(r1, lit * 0.35); g.lineTo(r1, 0); g.lineTo(r0, -lit * 0.4); g.closePath(); g.fill();
    g.restore();
  }
  return cv;
}

/** coins hanging tangent to one another along a concentric circle */
function coinList(a, dr, rc, off, seed) {
  const dth = 2 * Math.asin((rc - 0.4) / (a.R + dr));
  const n = Math.ceil(a.span(PAD + rc + 90) / dth) + 1, r = L.rng(seed), out = [];
  for (let i = -n; i <= n; i++) out.push({ th: (i + off) * dth, v: (((i * 2) % 5) + 5) % 5, tw: r.range(-0.03, 0.03) });
  return out;
}

/** the long filaments, in tufts: a low fringe over the crest (the text sits there), tall plumes at the sides */
function genFilaments(env, coins) {
  const a = env.arc, r = L.rng('s36fil'), nz = L.makeNoise('s36tuft');
  const sharp = [], soft = [];
  const bumps = [[-150, 270, 130], [40, 230, 112], [288, 335, 120], [520, 130, 90], [1410, 150, 92], [1640, 355, 124], [1885, 240, 115], [2070, 270, 130]];
  const envLen = (x) => {
    const side = sm(325, 545, Math.abs(x - a.cx));
    let e = 22 + side * (120 + 80 * (0.5 + 0.5 * nz.fbm(x / 140, 3.7, 2)));
    for (const [bx, A, s] of bumps) { const q = (x - bx) / s; e += A * Math.exp(-q * q) * side; }
    return e;
  };
  const mk = (x, y, psi, kap, len, w, al) => {
    const pts = [[x, y]]; let ang = psi, s = 0;
    while (s < len) {
      const st = Math.min(6, len - s);
      x += Math.sin(ang) * st; y -= Math.cos(ang) * st; ang += kap * st; s += st;
      if (Math.abs(x - a.cx) < 362 && a.drAt(x, y) > 26) break;       // never climb into the text column
      pts.push([x, y]);
    }
    return { pts, w, al, soft: false };
  };
  const lean = (x) => 0.14 * nz.n2(x / 210, 9.1) + 0.13 * Math.sign(x - a.cx) * sm(300, 380, Math.abs(x - a.cx)) * (1 - sm(420, 760, Math.abs(x - a.cx)));
  const curl = (x) => 0.0006 * nz.n2(x / 240, 20.3);
  const sp = a.span(PAD + 90);
  // 1) a fine, even fuzz all along the branch
  for (let th = -sp; th <= sp; th += 6 / a.R) {
    const t = th + r.range(-0.45, 0.45) * 6 / a.R, p0 = a.pt(t, -2), e = envLen(p0.x);
    const len = Math.min(e, 18 + e * 0.3) * (0.25 + 0.75 * Math.pow(r(), 1.5));
    sharp.push(mk(p0.x, p0.y, t * 1.15 + lean(p0.x) + r.gauss() * 0.1, r.gauss() * 0.0006, len, 0.75 + 0.8 * r() * r(), 0.3 + 0.5 * r()));
  }
  // 2) tufts: near-parallel filaments sharing a direction and a curl, like the barbs of a feather
  const tuft = (t0, e0) => {
    const x0 = a.pt(t0, 0).x;
    const eT = e0 * r.range(0.55, 1.0), psiT = t0 * 1.15 + lean(x0) + r.gauss() * 0.11, kT = curl(x0) + r.gauss() * 0.00025;
    const n = Math.round(5 + eT / 30);
    for (let i = 0; i < n; i++) {
      const off = r.gauss() * 15, q = a.pt(t0 + off / a.R, -2);
      const len = eT * (0.2 + 0.8 * Math.pow(r(), 1.15));
      const psi = psiT + off * 0.0045 + r.gauss() * 0.045;
      sharp.push(mk(q.x, q.y, psi, kT + r.gauss() * 0.00025, len, 0.7 + 1.1 * r() * r() + len / 480, 0.35 + 0.65 * r()));
    }
    // out-of-focus barbs in front of and behind the sharp ones: broad, soft, tapering to a point
    const nb = Math.round(eT / 105 + r() * 0.7);
    for (let i = 0; i < nb; i++) {
      const off = r.gauss() * 17, q = a.pt(t0 + off / a.R, 0);
      const f = mk(q.x, q.y, psiT + off * 0.0045 + r.gauss() * 0.07, kT + r.gauss() * 0.0003, eT * r.range(0.45, 1.0), r.range(4, 8.5), r.range(0.2, 0.42));
      f.soft = true; soft.push(f);
    }
  };
  let th = -sp;
  while (th < sp) { tuft(th, envLen(a.pt(th, 0).x)); th += r.range(24, 44) / a.R; }
  for (const cn of coins) tuft(cn.th + r.gauss() * 0.004, envLen(a.pt(cn.th, 0).x) * 1.1);   // one more over every coin's top
  return { sharp, soft };
}

function drawFil(g, f) {
  const P = f.pts, n = P.length; if (n < 2) return;
  const gr = g.createLinearGradient(P[0][0], P[0][1], P[n - 1][0], P[n - 1][1]);
  gr.addColorStop(0, `rgba(255,255,255,${f.al * (f.soft ? 0.22 : 1)})`);
  if (f.soft) gr.addColorStop(0.2, `rgba(255,255,255,${f.al})`);
  gr.addColorStop(0.45, `rgba(241,243,242,${f.al * 0.8})`);
  gr.addColorStop(0.8, `rgba(190,200,200,${f.al * 0.36})`);
  gr.addColorStop(1, 'rgba(154,165,166,0)');
  g.fillStyle = gr;
  const Lx = [], Ly = [], Rx = [], Ry = [];
  for (let i = 0; i < n; i++) {
    const p = P[Math.max(0, i - 1)], q = P[Math.min(n - 1, i + 1)];
    let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const hw = 0.5 * (f.w * Math.pow(1 - i / (n - 1), 0.8) + 0.45);
    Lx.push(P[i][0] + nx * hw); Ly.push(P[i][1] + ny * hw); Rx.push(P[i][0] - nx * hw); Ry.push(P[i][1] - ny * hw);
  }
  g.beginPath(); g.moveTo(Lx[0], Ly[0]);
  for (let i = 1; i < n; i++) g.lineTo(Lx[i], Ly[i]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(Rx[i], Ry[i]);
  g.closePath(); g.fill();
}

/** copy of a padded canvas kept only inside a radial (dr) window; `gain` re-brightens what the blur spread thin */
function maskedCopy(src, env, dr0, dr1, stops, gain = 1) {
  const a = env.arc, c = L.makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  if (gain > 1) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = gain - 1; g.drawImage(src, 0, 0); g.globalAlpha = 1; }
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = L.radial(g, a.cx + PAD, a.cy + PAD, a.R + dr0, a.R + dr1, stops);
  g.fillRect(0, 0, c.width, c.height);
  c._pad = PAD;
  return c;
}

/** the sharp plane: filament roots → awns → branch → coin bodies, then side defocus and bloom */
function buildMain(env, sprites, awn, coins, filAll) {
  const a = env.arc, full = (g) => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  const layer = L.makeLayer(PAD, (g) => {
    g.drawImage(maskedCopy(filAll, env, 60, 200, [[0, K1], [1, K0]]), -PAD, -PAD);
    for (const cn of coins) a.at(g, cn.th, DRC, () => { g.rotate(cn.tw); g.drawImage(awn, -awn.width / 2, -awn.height / 2); });
    // the main branch: a flat cast strip, lit along its upper edge
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R + BBOT - 1, a.R + BTOP + 0.8, [[0, 'rgba(90,104,106,0)'], [0.09, '#6f7e80'], [0.34, '#c4cccc'], [0.62, '#f1f3f2'], [0.9, '#ffffff'], [1, 'rgba(255,255,255,0)']]);
    a.pathBand(g, BTOP + 0.8, BBOT - 1); g.fill();
    // a little fillet where each coin is fused to the branch
    for (const cn of coins) a.at(g, cn.th, BBOT, () => {
      g.fillStyle = L.linear(g, 0, -2, 0, 9, [[0, '#f1f3f2'], [1, '#aab4b5']]);
      g.beginPath(); g.moveTo(-32, -1); g.quadraticCurveTo(-12, 1, -9, 10); g.lineTo(9, 10); g.quadraticCurveTo(12, 1, 32, -1); g.closePath(); g.fill();
    });
    for (const cn of coins) a.at(g, cn.th, DRC, () => { g.rotate(cn.tw); const sp = sprites[cn.v]; g.drawImage(sp, -sp.width / 2, -sp.height / 2); });
  });
  const g = layer.getContext('2d');
  // shallow focus: the plane falls soft toward the left and right of frame  (sharp·(1−m) + soft·m)
  const hm = [[0, K1], [0.18, 'rgba(0,0,0,0.5)'], [0.35, K0], [0.65, K0], [0.82, 'rgba(0,0,0,0.5)'], [1, K1]];
  const soft = L.blurred(layer, 5), sg = soft.getContext('2d');
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.linear(sg, PAD - 60, 0, PAD + W + 60, 0, hm);
  sg.fillRect(0, 0, soft.width, soft.height);
  g.save();
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = L.linear(g, -60, 0, W + 60, 0, hm); full(g);
  g.globalCompositeOperation = 'lighter'; g.drawImage(soft, -PAD, -PAD);
  g.restore();
  // halation from the back-light
  const b1 = L.blurred(layer, 5), b2 = L.blurred(layer, 20);
  g.save(); g.globalCompositeOperation = 'screen';
  g.globalAlpha = 0.3; g.drawImage(b1, -PAD, -PAD);
  g.globalAlpha = 0.5; g.drawImage(b2, -PAD, -PAD);
  g.restore();
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'butt';
  g.shadowColor = 'rgba(236,244,244,0.9)'; g.shadowBlur = 9;
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3.2; a.stroke(g, -0.6);
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.6; a.stroke(g, 0.6);
  g.restore();
  // pin-point glints where the rims turn to the light
  const rg = L.rng('s36glint');
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const cn of coins) {
    const k = rg.int(1, 2);
    for (let i = 0; i < k; i++) {
      const an = Math.atan2(-0.819, -0.573) + rg.range(-0.75, 0.75), rr = rg.chance(0.7) ? RC - 4.5 : HS + WI + 1, q = rg.range(0.45, 1), gr = rg.range(9, 20);
      a.at(g, cn.th, DRC, () => {
        const x = Math.cos(an) * rr, y = Math.sin(an) * rr;
        g.fillStyle = L.radial(g, x, y, 0, gr, [[0, `rgba(255,255,255,${0.95 * q})`], [0.16, `rgba(241,246,246,${0.5 * q})`], [0.5, `rgba(200,214,216,${0.1 * q})`], [1, 'rgba(154,165,166,0)']]);
        g.fillRect(x - gr, y - gr, gr * 2, gr * 2);
      });
    }
  }
  g.restore();
  return layer;
}

/** behind: pure black, a second branch of coins far out of focus, dissolving into white mist toward the bottom */
function buildBack(env, sprites, awn) {
  const a = env.arc, full = (g) => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  const K = 1.22, DR2 = -(2 * RC + 50), RC2 = RC * K, DRC2 = DR2 - 9 * K - RC2;
  const far = L.makeLayer(PAD, (g) => {
    const coins2 = coinList(a, DRC2, RC2, 0.5, 's36row2');
    const r = L.rng('s36far'), sp = a.span(PAD + 90);
    g.lineCap = 'round';
    for (let i = 0; i < 620; i++) {
      const t = r.range(-sp, sp), len = r.range(18, 80), p0 = a.pt(t, DR2), ps = t + r.gauss() * 0.22;
      const x1 = p0.x + Math.sin(ps) * len, y1 = p0.y - Math.cos(ps) * len;
      g.strokeStyle = L.linear(g, p0.x, p0.y, x1, y1, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(200,210,210,0)']]);
      g.lineWidth = r.range(1.5, 3.8);
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(x1, y1); g.stroke();
    }
    for (const cn of coins2) a.at(g, cn.th, DRC2, () => { g.scale(K, K); g.drawImage(awn, -awn.width / 2, -awn.height / 2); });
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R + DR2 - 10 * K, a.R + DR2 + 3 * K, [[0, '#7f8c8e'], [0.5, '#e3e8e7'], [1, '#ffffff']]);
    a.pathBand(g, DR2 + 3 * K, DR2 - 10 * K); g.fill();
    for (const cn of coins2) a.at(g, cn.th, DRC2, () => { g.scale(K, K); const sp2 = sprites[cn.v]; g.drawImage(sp2, -sp2.width / 2, -sp2.height / 2); });
  });
  const farB = L.blurred(far, 14);
  const streaks = L.polarNoiseLayer(env, PAD, { seed: 's36mist', scale: 320, sx: 0.8, sy: 1.6, octaves: 3, contrast: 1.1, res: 0.2, ramp: [[0, '#aab5b6'], [0.5, '#dde3e2'], [1, '#ffffff']] });
  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#030303'; full(g);
    g.drawImage(farB, -PAD, -PAD);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.55; g.drawImage(farB, -PAD, -PAD); g.globalAlpha = 1;
    // the mist: out-of-focus down, brightest at the bottom, nothing left by the height of the square holes
    const mist = L.makeLayer(PAD, (m) => {
      m.drawImage(streaks, -PAD, -PAD);
      m.globalCompositeOperation = 'destination-in';
      m.fillStyle = L.radial(m, a.cx, a.cy, a.R - 640, a.R - (RC + HS + 12), [[0, 'rgba(0,0,0,0.97)'], [0.36, 'rgba(0,0,0,0.74)'], [0.7, 'rgba(0,0,0,0.26)'], [1, K0]]);
      full(m);
    });
    g.drawImage(mist, -PAD, -PAD);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 690, a.R - 295, [[0, 'rgba(241,243,242,0.95)'], [0.45, 'rgba(221,228,228,0.55)'], [1, 'rgba(154,165,166,0)']]); full(g);
    g.globalCompositeOperation = 'source-over';
  });
}

/** crop a padded layer to the rows that hold content and upload it once (big per-frame drawImage sources are slow in headless Chromium) */
async function bake(layer, y0, y1) {
  const sy = Math.max(0, Math.round(y0 + PAD)), sh = Math.min(layer.height, Math.round(y1 + PAD)) - sy;
  return { bmp: await createImageBitmap(layer, 0, sy, layer.width, sh), y: sy - PAD };
}
function put(ctx, env, lay, opts) {
  L.cam(ctx, env, opts, () => {
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts.blend) ctx.globalCompositeOperation = opts.blend;
    ctx.drawImage(lay.bmp, -PAD, lay.y);
  });
}

export default {
  name: '摇钱树枝叶',
  tone: 'light',
  async init(env) {
    const a = env.arc;
    const sprites = [1, 2, 3, 4, 5].map(buildCoin), awn = buildAwns();
    const coins = coinList(a, DRC, RC, 0, 's36row1');
    const fil = genFilaments(env, coins);
    const filAll = L.makeLayer(PAD, (g) => { g.globalCompositeOperation = 'lighter'; for (const f of fil.sharp) drawFil(g, f); });
    const filSoft = L.makeLayer(PAD, (g) => { g.globalCompositeOperation = 'lighter'; for (const f of fil.soft) drawFil(g, f); });
    const haze = L.blurred(filAll, 16);
    // tips: the farther from the branch, the softer. Two versions (a little soft / softer) are cross-faded so the blur breathes.
    const M1 = [[0, K0], [0.44, K1], [1, K0]], M2 = [[0, K0], [1, K1]];
    const tips = (b1, b2, b3, g1, g2) => {
      const c = L.makeCanvas(filAll.width, filAll.height), g = c.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      g.drawImage(maskedCopy(L.blurred(filAll, b1), env, 60, 380, M1, g1), 0, 0);
      g.drawImage(maskedCopy(L.blurred(filAll, b2), env, 200, 380, M2, g2), 0, 0);
      g.drawImage(L.blurred(filSoft, b3), 0, 0);
      g.globalAlpha = 0.15; g.drawImage(haze, 0, 0);
      c._pad = PAD;
      return c;
    };
    const yEdge = a.yAt(-PAD);   // the arc's lowest point inside the padded layer
    const back = buildBack(env, sprites, awn), main = buildMain(env, sprites, awn, coins, filAll);
    S = {
      back: await bake(back, a.crestY + RC, H + PAD),
      main: await bake(main, a.crestY - 260, H + PAD),
      tipsA: await bake(tips(1.1, 2.2, 4.0, 1.15, 1.6), -PAD, yEdge + 40),
      tipsB: await bake(tips(2.0, 3.8, 6.0, 1.25, 1.9), -PAD, yEdge + 40),
    };
  },
  draw(ctx, env, p) {
    const rot = L.lerp(-0.0035, 0.0035, p), zoom = L.lerp(1.0, 1.01, p);
    ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, W, H);
    put(ctx, env, S.back, { rot: rot * 0.45, zoom: 1 + (zoom - 1) * 0.4 });
    put(ctx, env, S.main, { rot, zoom });
    const br = L.smooth(p);   // the tips drift a little further out of focus across the shot
    put(ctx, env, S.tipsA, { rot, zoom, blend: 'lighter', alpha: 1 - br });
    put(ctx, env, S.tipsB, { rot, zoom, blend: 'lighter', alpha: br });
  },
};
