// s08 — 钱坨的X光片. A radiograph (negative look: dense = white) of a hoard clump — cash coins rusted into one lump, in macro.
// The arc is the outer contour of the lump: a bright rind of corrosion and soil, a dark spongy seam of gas bubbles under it,
// then the milky core in which a few BIG coins lie — round, each with a SQUARE hole, every one at its own angle; where they
// overlap the film goes whiter. Above the arc: bare black film base.
//
// Everything below the arc is computed per pixel in init() the way an X-ray forms:
//   density = corrosion matrix (billows − rounded voids − foam cavities + membranes) + Σ coin thickness along the beam + rind
//   film    = 1 − exp(−density)   → tone ramp (film black → dark blue-grey → cold grey → white)
// The coins are solids, not outlines: each is a short cylinder (a tenth of its radius thick) with a raised rim on both faces,
// so a tilted coin shows the rims of its two faces as two ellipses slipped against each other, and its edge is a ramp, not a line.
// The fine structure is drawn, not noise: hairline cracks in the crust, pores, grit in the rind, smoke-thin filaments in the
// foam are stroked on a canvas with the 2D API, read back and fed into the density like everything else.
// Then the plate is finished like a photograph: halation around the dense parts, focus held near the crest and falling off.
// draw() drifts the plate a little (rotation about the arc's centre keeps the contour on the arc), sweeps a soft scan band
// left → right and scatters a few flecks of noise.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;
const TOP = 96;                    // room above the crest inside the plate (for the glow of the rind)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ── allocation-free worley noise: squared distances in cD1 / cD2, ids of the two nearest cells in cId / cId2,
//    and cBd = distance to the wall between those two cells (in cell units) ──
let cD1 = 0, cD2 = 0, cId = 0, cId2 = 0, cBd = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0, id2 = 0, ax = 0, ay = 0, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; id2 = id; bx = ax; by = ay; d1 = d; id = ((h >>> 20) & 255) / 255; ax = dx; ay = dy; }
    else if (d < d2) { d2 = d; id2 = ((h >>> 20) & 255) / 255; bx = dx; by = dy; }
  }
  const sx = ax - bx, sy = ay - by;
  cD1 = d1; cD2 = d2; cId = id; cId2 = id2; cBd = (d2 - d1) / (2 * Math.sqrt(sx * sx + sy * sy) + 1e-6);
}

/** after cell(): signed distance (px) to the wall of the bubble we are in — a round bubble pressed flat against its
 *  neighbours. > 0 inside the cavity, < 0 in the solid between bubbles. `open` (px) pushes the shared wall back: the wall
 *  thins and, once `open` exceeds its width, is gone (two bubbles have run together). */
function cavity(scale, open) {
  const dd = (0.5 + 0.3 * cId) * scale - Math.sqrt(cD1) * scale, bd = cBd * scale + open;
  return bd < dd ? bd : dd;
}

// ── exact worley: the nearest feature point A (eAx, eAy = its offset from the sample, in cell units; eId; eD1 = squared
//    distance), the TRUE distance eBd to the border of A's cell, and the neighbour B across that border (eBx, eBy).
//    Continuous everywhere, so walls keep one width and nothing in a bubble jumps. ──
let eAx = 0, eAy = 0, eBx = 0, eBy = 0, eId = 0, eD1 = 0, eBd = 0;
const ePx = new Float32Array(25), ePy = new Float32Array(25), ePi = new Float32Array(25);
function cellX(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 1e9, n = 0, im = 0;
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    ePx[n] = dx; ePy[n] = dy; ePi[n] = ((h >>> 20) & 255) / 255;
    if (d < d1) { d1 = d; im = n; }
    n++;
  }
  const ax = ePx[im], ay = ePy[im];
  let bd = 1e9, ib = im;
  for (let k = 0; k < 25; k++) {
    if (k === im) continue;
    const sx = ePx[k] - ax, sy = ePy[k] - ay, dd = (0.5 * (ax + ePx[k]) * sx + 0.5 * (ay + ePy[k]) * sy) / Math.sqrt(sx * sx + sy * sy);   // to the bisector of A and k
    if (dd < bd) { bd = dd; ib = k; }
  }
  eAx = ax; eAy = ay; eBx = ePx[ib]; eBy = ePy[ib]; eId = ePi[im]; eD1 = d1; eBd = bd;
}

/** where the coins lie inside the lump (offsets from the crest point). All much the same size, as in a real hoard. */
function layCoins(a) {
  const r = L.rng('s08-coins-macro'), r2 = L.rng('s08-coins-solid');
  const ox = a.cx, oy = a.crestY;
  const coins = [];
  // c = cos(tilt): 1 = flat-on to the beam (a full circle), small = strongly tilted (a narrow ellipse)
  // soft = geometric unsharpness: coins far from the film come out blurred
  const add = (x, y, rc, c, psi, rot, gain, soft, o = {}) => {
    const rs = o.rs || r;
    coins.push({
      x: ox + x, y: oy + y, rc, c, psi, rot, gain, soft, seed: rs.range(0, 90),
      hs: rs.range(0.238, 0.262),     // half-side of the square hole / radius
      wr: rs.range(0.125, 0.155),     // width of the outer rim (外郭) / radius
      ecc: rs.range(0.12, 0.4), ea: rs.range(0, L.TAU),          // the rim is never the same width all round
      hox: rs.range(-0.03, 0.03), hoy: rs.range(-0.03, 0.03),   // nor is the hole dead centre
      hq: [rs.range(0.95, 1.05), rs.range(0.95, 1.05), rs.range(0.95, 1.05), rs.range(0.95, 1.05)],   // nor its four sides alike
      eat: o.eat || 0,               // how far corrosion has eaten into the metal
      chip: o.chip || null,          // a bite out of the edge: [angle, size]
      wedge: rs.range(-0.16, 0.16), wa: rs.range(0, L.TAU),
      th: r2.range(0.096, 0.108),    // thickness / radius: a cash coin is about a tenth of its radius thick
      lip: r2.range(-0.14, 0.14),    // the rims of the two faces do not stand equally high
      inr: r2.range(0.74, 0.94),     // the rim round the hole (内郭) stands a little lower than the outer one
      hk: o.hk === undefined ? 0.3 : o.hk,   // how empty the hole is (the cord has rotted away; soil only half fills it)
      halo: o.halo || 0,             // the crust next to the metal is looser: a faint dark fringe outside the edge
      lo: !!o.lo,                    // a coin in the background: computed with less care
    });
  };
  // far coins first: soft ghosts that give the lump its depth
  add(835, 560, 276, 0.74, 1.15, 0.2, 0.36, 5);
  add(-430, 226, 276, 0.34, -0.2, 0.9, 0.3, 3.2);
  // a string that has slumped: coins leaning one on the next → ring outlines nested one inside another
  {
    const c = 0.47, psi = 0.38, rc = 278, n = 5, sinT = Math.sqrt(1 - c * c), ax = -Math.sin(psi), ay = Math.cos(psi), pitch = rc * 0.19 * sinT;
    let s = -0.5 * (n - 1) * pitch;
    for (let i = 0; i < n; i++) {
      add(-790 + ax * s + r.range(-3, 3), 500 + ay * s + r.range(-3, 3), rc * r.range(0.98, 1.02), L.clamp(c + r.range(-0.03, 0.03), 0.2, 1),
        psi + r.range(-0.04, 0.04), r.range(0, Math.PI / 2), 0.24, 1.9, { lo: true });
      s += pitch * r.range(0.8, 1.25);
    }
  }
  // the three coins the eye lands on
  add(560, 270, 272, 0.3, 0.27, 0.5, 0.34, 1.9, { eat: 0.35, hk: 0.42, halo: 0.1 });
  add(250, 424, 276, 0.78, -0.6, 1.0, 0.72, 1.35, { eat: 0.5, chip: [2.5, 0.2], hk: 0.5, halo: 0.15 });
  add(-215, 382, 280, 0.955, 0.5, 0.33, 1.0, 1.25, { eat: 0.25, chip: [-2.2, 0.13], hk: 0.62, halo: 0.17 });
  return coins;
}

/** add every coin's metal thickness (along the beam) into C, and how empty its hole is into Hm.
 *  A coin is a stack of thin layers along its own axis — the flan (disc minus square hole) and, on either face, the raised
 *  rims (外郭 round the edge, 内郭 round the hole). Seen at an angle each layer lands a little further along the minor axis. */
function castCoins(coins, C, Hm, Ha, RW, RH, X0, Y0) {
  const nz = L.makeNoise('s08-metal');
  const offs = new Float32Array(8), wF = new Float32Array(8), wL = new Float32Array(8), xa = new Float32Array(8);
  for (const q of coins) {
    const rc = q.rc, c = q.c, ic = 1 / c, sinT = Math.sqrt(1 - c * c);
    const cp = Math.cos(q.psi), sp = Math.sin(q.psi), cr = Math.cos(q.rot), sr = Math.sin(q.rot);
    const cheap = q.soft > 3 || q.lo;
    const tt = q.th * rc, tf = tt * 0.58, lh = (tt - tf) / 2, lipD = tf / 2 + lh / 2, hT = 0.5 * tt * sinT;
    // the layers: nf slices of the flan, then the rim of either face
    const nf = tf * sinT < 2.4 ? 1 : (tf * sinT < 8 || cheap) ? 3 : 5;
    let nl = 0;
    for (let i = 0; i < nf; i++) { offs[nl] = ((i + 0.5) / nf - 0.5) * tf * sinT; wF[nl] = 1 / nf; wL[nl] = 0; xa[nl] = 0.5 * tf * sinT / nf * ic; nl++; }
    offs[nl] = -lipD * sinT; wF[nl] = 0; wL[nl] = 0.5 * (1 + q.lip); xa[nl] = 0.5 * lh * sinT * ic; nl++;
    offs[nl] = lipD * sinT; wF[nl] = 0; wL[nl] = 0.5 * (1 - q.lip); xa[nl] = 0.5 * lh * sinT * ic; nl++;
    const hw = q.halo ? 0.1 * rc : 0;
    const extM = rc * 1.035 + q.soft * 2 + 2, extM2 = extM * extM, ext = extM + hw, ext2 = ext * ext, eb = ext * c + hT + 2;
    const bw = Math.sqrt((ext * cp) ** 2 + (eb * sp) ** 2) + 3, bh = Math.sqrt((ext * sp) ** 2 + (eb * cp) ** 2) + 3;
    const i0 = Math.max(0, Math.floor(q.x - bw - X0)), i1 = Math.min(RW - 1, Math.ceil(q.x + bw - X0));
    const j0 = Math.max(0, Math.floor(q.y - bh - Y0)), j1 = Math.min(RH - 1, Math.ceil(q.y + bh - Y0));
    const gain = q.gain * Math.min(2.2, ic);          // a tilted coin puts more metal in the beam
    const hs = q.hs * rc, hi = hs + 0.072 * rc, hi13 = hi * 1.3, rin = rc * (1 - q.wr), k1 = 2.2 / rc, k2 = 7.4 / rc;
    const wx = Math.cos(q.wa) * q.wedge / rc, wy = Math.sin(q.wa) * q.wedge / rc;
    const hq = q.hq;
    const ex = Math.cos(q.ea) * q.ecc, ey = Math.sin(q.ea) * q.ecc, hox = q.hox * rc, hoy = q.hoy * rc, wrc = q.wr * rc;
    const chx = q.chip ? Math.cos(q.chip[0]) * rc * 1.04 : 0, chy = q.chip ? Math.sin(q.chip[0]) * rc * 1.04 : 0, chr = q.chip ? q.chip[1] * rc : 0;
    // one screen px measured across the sides of the hole (they lie along the hole's own axes)
    const aqX = q.soft * Math.sqrt(cr * cr + sr * sr * ic * ic), aqY = q.soft * Math.sqrt(sr * sr + cr * cr * ic * ic);
    const asr = Math.abs(sr), acr = Math.abs(cr), bevR = 0.15 * wrc, bevI = 0.2 * (hi - hs);
    for (let j = j0; j <= j1; j++) {
      const dy = Y0 + j - q.y;
      for (let i = i0; i <= i1; i++) {
        const dx = X0 + i - q.x;
        const u = dx * cp + dy * sp, vs = -dx * sp + dy * cp;            // along the major axis / along the minor axis (screen px)
        const avs = vs < 0 ? -vs : vs, vv = avs > hT ? (avs - hT) * ic : 0;
        if (u * u + vv * vv > ext2) continue;
        const v0 = vs * ic, lx0 = u * cr + v0 * sr, ly0 = -u * sr + v0 * cr;
        const m1 = nz.n2(lx0 * k1 + q.seed, ly0 * k1 - q.seed * 0.7), m2 = cheap ? 0 : nz.n2(lx0 * k2 - q.seed, ly0 * k2 + 3.1);
        const re = rc * (1 + 0.008 * m2 + 0.02 * m1);                       // a worn, slightly nibbled edge
        let field = 0.41 * (0.86 + 0.3 * m1 + 0.13 * m2) * (1 + lx0 * wx + ly0 * wy);
        field *= 1 - 0.3 * sstep(0.42, 0.8, m2);                             // pitting
        let top = (1.22 + 0.08 * m2) * (0.84 + 0.16 * sstep(-0.5, 0.3, m1));   // the raised rims are worn unevenly
        if (q.eat) { const e = q.eat * sstep(0.05, 0.6, m1 * 0.85 + m2 * 0.3); field *= 1 - e; top *= 1 - 0.6 * e; }
        const lipGain = top - field;
        let acc = 0, hAcc = 0;
        for (let l = 0; l < nl; l++) {
          const v = (vs - offs[l]) * ic, rho2 = u * u + v * v;
          if (rho2 > extM2) continue;
          const rho = Math.sqrt(rho2), av = v < 0 ? -v : v;
          // one screen px measured along the radius of the coin, plus the reach of this layer's own thickness
          const aa = rho > 1 ? q.soft * Math.sqrt(u * u + v * v * ic * ic) / rho + xa[l] * av / rho : q.soft;
          const lx = u * cr + v * sr, ly = -u * sr + v * cr, hx = lx - hox, hy = ly - hoy;
          const ax = hx < 0 ? -hx * hq[0] : hx * hq[1], ay = hy < 0 ? -hy * hq[2] : hy * hq[3];
          let sq, aq;                                                        // square distance → SQUARE hole
          if (ax > ay) { sq = ax; aq = aqX + xa[l] * asr; if (sq < hi13) { const t = ay / ax, t2 = t * t; sq *= 1 + 0.05 * t2 * t2; } }   // corners a touch worn
          else { sq = ay; aq = aqY + xa[l] * acr; if (sq < hi13) { const t = ax / (ay + 1e-6), t2 = t * t; sq *= 1 + 0.05 * t2 * t2; } }
          const hole = 1 - sstep(hs - aq, hs + aq, sq);
          if (wF[l] > 0) hAcc += wF[l] * hole;
          if (hole >= 1) continue;
          let disc = 1 - sstep(re - aa, re + aa, rho);
          if (disc <= 0) continue;
          if (chr) { const cd = Math.sqrt((lx - chx) * (lx - chx) + (ly - chy) * (ly - chy)) + 0.2 * chr * m1 + 0.12 * chr * m2; disc *= sstep(chr - aa * 1.5, chr + aa * 1.5, cd); }
          if (wF[l] > 0) acc += wF[l] * disc * (1 - hole) * field;
          else {
            const rinL = rho > 1 ? rc - wrc * (1 + (lx * ex + ly * ey) / rho) : rin, bev = bevR + aa;
            const rim = sstep(rinL - bev, rinL + bev * 0.6, rho) * (1 - 0.3 * sstep(rc - 0.34 * wrc, rc, rho));   // 外郭: a bevelled lip, its outer shoulder worn round
            const bi = bevI + aq, inr = (1 - sstep(hi - bi * 0.6, hi + bi, sq)) * q.inr;                          // 内郭
            acc += wL[l] * disc * (1 - hole) * lipGain * (rim > inr ? rim : inr);
          }
        }
        const k = j * RW + i;
        if (acc > 0) C[k] += acc * gain;
        if (hAcc > 0) { const hv = hAcc * q.hk; if (hv > Hm[k]) Hm[k] = hv; }
        if (hw) { const rho0 = Math.sqrt(u * u + vv * vv); if (rho0 > re) { const hv = q.halo * (1 - sstep(0, hw, rho0 - re)); if (hv > Ha[k]) Ha[k] = hv; } }
      }
    }
  }
}

/** the marks that are drawn rather than computed, as two canvases read back as data:
 *  d1 = [hairline cracks in the crust, grit, pores], d2 = [smoke-thin filaments, soft veils, cracks in the metal] */
function drawMarks(a, coins, X0, Y0, RW, RH, gAt, tkAt) {
  const R = a.R, cx = a.cx, cy = a.cy, r = L.rng('s08-marks'), nz = L.makeNoise('s08-flow');
  const mk = () => {
    const c = L.makeCanvas(RW, RH), g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, RW, RH);
    g.translate(-X0, -Y0); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    return [c, g];
  };
  const [c1, g1] = mk(), [c2, g2] = mk(), [c3, g3] = mk();
  const RED = 'rgba(255,0,0,', GRN = 'rgba(0,255,0,', BLU = 'rgba(0,0,255,';
  const polar = (al, dp) => { const th = al / R, rr = R - dp; return [cx + rr * Math.sin(th), cy - rr * Math.cos(th)]; };
  const run = (g, pts, i0, i1) => { g.beginPath(); g.moveTo(pts[i0][0], pts[i0][1]); for (let i = i0 + 1; i <= i1; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); };
  // a hairline: fine along its whole length, wider and stronger where it stands open
  const hair = (g, pts, w, al, col) => {
    const n = pts.length - 1; if (n < 1) return;
    g.strokeStyle = col + (al * 0.55).toFixed(3) + ')'; g.lineWidth = Math.max(1.2, w * 0.7); run(g, pts, 0, n);
    if (n >= 3) {
      const i0 = 1 + ((n * r.range(0, 0.3)) | 0), i1 = Math.min(n - 1, i0 + 1 + ((n * r.range(0.35, 0.6)) | 0));
      g.strokeStyle = col + (al * 0.5).toFixed(3) + ')'; g.lineWidth = w; run(g, pts, i0, i1);
    }
  };
  // a crack in something brittle: short straight runs with abrupt small turns
  const brittle = (x, y, ang, len, kink) => {
    const pts = [[x, y]]; let d = 0;
    while (d < len) { const s = r.range(8, 28); ang += r.gauss() * kink; x += Math.cos(ang) * s; y += Math.sin(ang) * s; d += s; pts.push([x, y]); }
    return pts;
  };
  const dot = (g, x, y, rad, al, col) => {
    const k = r.range(0.62, 1), an = r.range(0, Math.PI);
    g.save(); g.translate(x, y); g.rotate(an); g.scale(1, k);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
    gr.addColorStop(0, col + al.toFixed(3) + ')'); gr.addColorStop(0.5, col + (al * 0.94).toFixed(3) + ')'); gr.addColorStop(1, col + '0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad, 0, L.TAU); g.fill(); g.restore();
  };
  const grit = (x, y, rad, al) => {
    const n = r.int(5, 7), a0 = r.range(0, L.TAU);
    g1.fillStyle = GRN + al.toFixed(3) + ')'; g1.beginPath();
    for (let i = 0; i < n; i++) { const an = a0 + i / n * L.TAU, rr = rad * r.range(0.6, 1.25); if (i) g1.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.8); else g1.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.8); }
    g1.closePath(); g1.fill();
  };

  // ── cracks (red) ──
  // the rind is a brittle shell: short cracks run in from the surface, in loose groups
  for (let al = -1180 + r.range(0, 60); al < 1180; al += r.range(26, 170) * (r.chance(0.3) ? 0.3 : 1)) {
    const p = polar(al, 1.5), inward = Math.PI / 2 + al / R + r.gauss() * 0.4;
    hair(g1, brittle(p[0], p[1], inward, tkAt(al) * r.range(0.45, 1.25), 0.3), r.range(1.3, 2.1), r.range(0.4, 0.8), RED);
  }
  // long cracks through the body, each with a branch or two
  for (let i = 0; i < 6; i++) {
    const p = polar(r.range(-1000, 1050), r.range(170, 560)), pts = brittle(p[0], p[1], r.range(0, L.TAU), r.range(220, 560), 0.36);
    hair(g1, pts, r.range(1.5, 2.3), r.range(0.28, 0.5), RED);
    for (let b = r.int(1, 2); b > 0; b--) {
      const k = r.int(1, pts.length - 2), p0 = pts[k], d = Math.atan2(pts[k + 1][1] - p0[1], pts[k + 1][0] - p0[0]) + r.sign() * r.range(0.6, 1.15);
      hair(g1, brittle(p0[0], p0[1], d, r.range(50, 170), 0.4), r.range(1.3, 1.8), r.range(0.25, 0.42), RED);
    }
  }
  // ── pores (blue): froth — they come in swarms and keep to the fringes of the foam; a few larger gas holes have a
  //    denser lip (green) ──
  const frothy = (p) => { const gv = gAt(p[0], p[1]); return gv > 0.03 && gv < 0.45 ? true : r.chance(0.16); };
  for (let t = 0, made = 0; t < 900 && made < 30; t++) {
    const p = polar(r.range(-1080, 1080), r.range(56, 600));
    if (!frothy(p)) continue;
    made++;
    const n = r.int(6, 24), spr = r.range(22, 70);
    for (let k = 0; k < n; k++) dot(g1, p[0] + r.gauss() * spr, p[1] + r.gauss() * spr * 0.8, 1.6 + 5 * Math.pow(r(), 2.4), r.range(0.3, 0.75), BLU);
  }
  for (let t = 0, made = 0; t < 600 && made < 18; t++) {
    const p = polar(r.range(-1080, 1080), r.range(70, 600));
    if (!frothy(p)) continue;
    made++;
    const rad = r.range(4.5, 10.5);
    dot(g1, p[0], p[1], rad, r.range(0.45, 0.8), BLU);
    g1.strokeStyle = GRN + r.range(0.14, 0.3).toFixed(3) + ')'; g1.lineWidth = r.range(1.3, 2);
    const a0 = r.range(0, L.TAU); g1.beginPath(); g1.arc(p[0], p[1], rad * 0.9, a0, a0 + r.range(2.2, 5.4)); g1.stroke();
  }
  // ── grit (green): sand caught in the rind, a few nests of it deeper in ──
  for (let i = 0; i < 300; i++) {
    const al = r.range(-1130, 1130), p = polar(al, 3 + tkAt(al) * 1.25 * Math.pow(r(), 1.4));
    grit(p[0], p[1], 1.3 + 2.5 * Math.pow(r(), 2), r.range(0.25, 0.8));
  }
  for (let i = 0; i < 14; i++) {
    const p = polar(r.range(-1050, 1050), r.range(120, 600)), spr = r.range(14, 50);
    for (let k = r.int(5, 14); k > 0; k--) grit(p[0] + r.gauss() * spr, p[1] + r.gauss() * spr, 1.3 + 2.2 * Math.pow(r(), 2), r.range(0.25, 0.7));
  }

  // ── filaments in the foam (red on the second canvas): they follow a slow swirl, like smoke, crinkling a little.
  //    Many are the folded edge of a film: on one side of them a soft veil (green; blurred before it is used) ──
  const flow = (x, y) => Math.atan2(x - cx, cy - y) + 2.3 * nz.fbm(x / 190 + 7, y / 190 - 3, 2) + 0.5 * nz.n2(x / 23 + 1.7, y / 23 - 4.1);
  const trace = (x, y, n, gMin) => {
    const pts = [[x, y]], back = r.chance(0.5) ? Math.PI : 0;
    for (let s = 0; s < n; s++) { const an = flow(x, y) + back; x += Math.cos(an) * 5; y += Math.sin(an) * 5; if (gAt(x, y) < gMin) break; pts.push([x, y]); }
    return pts;
  };
  for (let t = 0, made = 0; t < 6000 && made < 135; t++) {
    const x = r.range(X0, X0 + RW), y = r.range(Y0 + TOP, Y0 + RH);
    if (gAt(x, y) < 0.3) continue;
    const pts = trace(x, y, r.int(9, 40), 0.05), n = pts.length - 1;
    if (n < 3) continue;
    const u = r();
    hair(g2, pts, r.range(1.25, 2.0), 0.1 + 0.5 * u * u, RED); made++;
    if (r.chance(0.5) && n >= 5) {
      const w2 = r.range(8, 24), side = r.sign() * w2 * 0.5, off = [];
      for (let i = 0; i <= n; i++) {
        const p0 = pts[i ? i - 1 : 0], p1 = pts[i < n ? i + 1 : n], dx = p1[0] - p0[0], dy = p1[1] - p0[1], dl = Math.hypot(dx, dy) || 1;
        off.push([pts[i][0] - dy / dl * side, pts[i][1] + dx / dl * side]);
      }
      g3.lineCap = 'butt'; g3.strokeStyle = GRN + r.range(0.06, 0.15).toFixed(3) + ')'; g3.lineWidth = w2; run(g3, off, 1, n - 1);
    }
  }
  g2.save(); g2.setTransform(1, 0, 0, 1, 0, 0); g2.filter = 'blur(4px)'; g2.drawImage(c3, 0, 0); g2.restore();
  // ── cracks in the metal (blue): a cast coin splits from a corner of its hole out to the rim ──
  const split = (q, an, r0, r1, w, al) => {
    const cr = Math.cos(q.rot), sr = Math.sin(q.rot), cp = Math.cos(q.psi), sp = Math.sin(q.psi), pts = [];
    for (let rr = r0; rr < r1 + 0.02; rr += 0.04) {
      an += r.gauss() * 0.022;
      const lx = Math.cos(an) * rr * q.rc, ly = Math.sin(an) * rr * q.rc, u = lx * cr - ly * sr, vs = (lx * sr + ly * cr) * q.c;
      pts.push([q.x + u * cp - vs * sp, q.y + u * sp + vs * cp]);
    }
    hair(g2, pts, w, al, BLU);
  };
  const hero = coins[coins.length - 1], second = coins[coins.length - 2];
  {
    // the corner of the hero's hole that points most nearly up the frame
    let best = 0, by = 9;
    for (let k = 0; k < 4; k++) { const an = Math.PI / 4 + k * Math.PI / 2, lx = Math.cos(an), ly = Math.sin(an), u = lx * Math.cos(hero.rot) - ly * Math.sin(hero.rot), vs = (lx * Math.sin(hero.rot) + ly * Math.cos(hero.rot)) * hero.c, dy = u * Math.sin(hero.psi) + vs * Math.cos(hero.psi); if (dy < by) { by = dy; best = an; } }
    split(hero, best + 0.05, hero.hs * 1.5, 1.0, 1.9, 0.85);
    split(second, 3.9, 0.66, 1.0, 1.7, 0.6);
  }
  return { d1: g1.getImageData(0, 0, RW, RH).data, d2: g2.getImageData(0, 0, RW, RH).data };
}

/** the radiograph of the lump: everything below the arc (cropped canvas, origin at X0,Y0 in frame coords) */
function buildClump(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - TOP;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s08a'), nB = L.makeNoise('s08b'), nC = L.makeNoise('s08c');
  const coins = layCoins(a), hero = coins[coins.length - 1], second = coins[coins.length - 2];
  const tkAt = (al) => 31 + 18 * nA.n2(al / 430, 3.1) + 9 * nA.n2(al / 95, 8.2);   // thickness of the rind along the arc

  // 1) slow fields on a coarse grid
  const CS = 6, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const F = () => new Float32Array(CN);
  const fWx = F(), fWy = F(), fVx = F(), fVy = F(), fBody = F(), fVoid = F(), fSh1 = F(), fRel = F(), fTk = F(),
    fWsp = F(), fMem = F(), fCl = F(), fOp = F(), fBig = F(), fGC = F();
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const px = X0 + i * CS, py = Y0 + j * CS, k = j * cw + i;
    const ddx = px - cx, ddy = cy - py, dp = R - Math.sqrt(ddx * ddx + ddy * ddy), al = Math.atan2(ddx, ddy) * R;
    const wx = nA.fbm(px / 340, py / 340, 2), wy = nA.fbm(px / 340 + 40, py / 340 - 17, 2);
    fWx[k] = wx; fWy[k] = wy;
    fVx[k] = nA.fbm(px / 70 + 3, py / 70 + 71, 2); fVy[k] = nB.fbm(px / 70 - 47, py / 70 + 13, 2);
    const ux = px + 120 * wx, uy = py + 120 * wy;
    // the matrix: slow billows, a little denser to the upper left, thinning toward the lower right
    fBody[k] = 1.1 + 0.27 * nB.fbm(ux / 460, uy / 460, 3) - 0.2 * L.clamp((ddx + 0.7 * (py - a.crestY) - 420) / 800, -1, 1);
    // cloudy veins of denser corrosion drifting through it
    fCl[k] = nC.ridged(ux / 330 + 3.3, uy / 250 - 8.1, 3);
    // rounded hollows (smooth dark pockets, each with a firm bright lip): few and large, mostly on the right;
    // a shallow one lies behind the hero coin
    const hx = (px - hero.x) / 150, hy = (py - hero.y) / 120;
    const qx = (px - (cx + 760)) / 260, qy = (py - (a.crestY + 470)) / 150;
    fVoid[k] = nA.fbm(ux / 400 + 9, uy / 330 - 3, 3) - 0.3 + 0.14 * L.clamp(ddx / 700, -1, 1) + 0.2 * sstep(300, 520, dp)
      + 0.22 * Math.exp(-(hx * hx + hy * hy)) + 0.5 * Math.exp(-(qx * qx + qy * qy));
    // thin overlapping flakes of corrosion (each a plateau with a crisp contour)
    fSh1[k] = nB.fbm(ux / 360 - 21, uy / 300 + 5, 3);
    // the spongy seam under the rind: wide and deep from the crest to the right, a thin seam elsewhere; a few pockets deeper in
    const run = sstep(-470, -150, al) * (1 - sstep(400, 780, al));
    const d0 = 138 + 26 * nA.n2(al / 380, 1.7) + 30 * run;
    const hh = 26 + 74 * run + 16 * nA.n2(al / 210, 5.3);
    const rag = 0.4 * nB.fbm(px / 150 + 5, py / 150 - 8, 3);
    const rel = (dp - d0) / hh;
    // away from the main run the seam is no continuous line: it comes and goes in patches of froth
    const patch = run + (1 - run) * sstep(-0.2, 0.22, nA.n2(al / 240, 9.7));
    const g = (1 - sstep(0.6, 1.08, Math.abs(rel) + rag)) * (0.5 + 0.5 * run) * patch;
    const clear = sstep(0.8, 1.2, Math.hypot(px - hero.x, py - hero.y) / hero.rc) * sstep(0.75, 1.15, Math.hypot(px - second.x, py - second.y) / second.rc);
    const pk = sstep(0.22, 0.44, nC.fbm(ux / 230 - 4, uy / 200 + 12, 3)) * sstep(270, 420, dp) * 0.85 * clear;   // gas pockets between the coins
    fMem[k] = nC.fbm(px / 95 + 31, py / 95 - 9, 2);
    fOp[k] = nA.fbm(px / 200 - 13, py / 200 + 29, 2);       // where the walls between bubbles have given way
    // the rind: thickness along the arc, and a wispy underside
    fTk[k] = tkAt(al);
    fWsp[k] = 11 * nB.fbm(al / 130, dp / 60, 3) + 4 * nB.n2(al / 38, dp / 30);
    // one gate for the foam: the seam (it keeps clear of the shell) or a pocket, whichever is stronger — blended, not switched
    const gS = g * sstep(0.8, 1.7, (dp + fWsp[k]) / fTk[k]), tP = sstep(-0.1, 0.1, pk - gS);
    fGC[k] = gS + (pk - gS) * tP; fRel[k] = rel + (0.6 - rel) * tP;
    fBig[k] = 0.25 + 0.75 * run * (1 - tP) + 0.75 * tP;     // big bubbles only where there is room for them
  }
  // the gate anywhere (bilinear), and where foam has to be worked out at all: a bubble reaches well beyond its centre
  const gBil = (X, Y) => {
    let fx = (X - X0) / CS, fy = (Y - Y0) / CS;
    if (fx < 0) fx = 0; else if (fx > cw - 1.001) fx = cw - 1.001;
    if (fy < 0) fy = 0; else if (fy > ch - 1.001) fy = ch - 1.001;
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * cw + i;
    return (fGC[k] * (1 - tx) + fGC[k + 1] * tx) * (1 - ty) + (fGC[k + cw] * (1 - tx) + fGC[k + cw + 1] * tx) * ty;
  };
  const gAt = gBil;
  const dilate = (lo, rad) => {
    const tmp = new Float32Array(CN), out = new Float32Array(CN);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { let mx = 0; for (let t = Math.max(0, i - rad), t1 = Math.min(cw - 1, i + rad); t <= t1; t++) { const v = fGC[j * cw + t] - lo; if (v > mx) mx = v; } tmp[j * cw + i] = mx; }
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { let mx = 0; for (let t = Math.max(0, j - rad), t1 = Math.min(ch - 1, j + rad); t <= t1; t++) { const v = tmp[t * cw + i]; if (v > mx) mx = v; } out[j * cw + i] = mx; }
    return out;
  };
  const fGW1 = dilate(0.2, 28), fGW2 = dilate(0.02, 10);

  const tA = performance.now();
  // 2) the coins, and the drawn marks
  const C = new Float32Array(N), Hm = new Float32Array(N), Ha = new Float32Array(N);
  castCoins(coins, C, Hm, Ha, RW, RH, X0, Y0);
  const tB0 = performance.now();
  const { d1, d2 } = drawMarks(a, coins, X0, Y0, RW, RH, gAt, tkAt);

  const tB = performance.now();
  // 3) film response — the task card's five tones only (film black → dark blue-grey → cold grey → grey-white → white);
  //    a grey-and-black negative, deliberately NOT the saturated blue of a hospital film
  const ramp = L.makeRamp([[0, '#050607'], [0.1, '#0b1013'], [0.25, '#1b2328'], [0.42, '#4b585f'], [0.58, '#7f8a8f'], [0.75, '#b6c0c4'], [0.88, '#d7dde0'], [1, '#f6f8f9']]);
  const NL = 2048, lut = new Uint8ClampedArray(NL * 3);
  for (let i = 0; i < NL; i++) { const c = ramp(i / (NL - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }

  const img = new ImageData(RW, RH), d = img.data;
  const HS = 4, hw = Math.ceil(RW / HS), hh2 = Math.ceil(RH / HS), hot = new Float32Array(hw * hh2);
  const vcx = cx - 150, vcy = a.crestY + 130, i255 = 1 / 255;
  for (let j = 0; j < RH; j++) {
    const py = Y0 + j, ddy = cy - py;
    const fy = j / CS, cj = fy | 0, ty = fy - cj;
    for (let i = 0; i < RW; i++) {
      const px = X0 + i, ddx = px - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), dp = R - rr;   // dp = depth below the contour
      if (dp < -3) continue;
      const k = j * RW + i, o = k * 4;
      // bilinear weights into the coarse fields
      const fx = i / CS, ci = fx | 0, tx = fx - ci, kk = cj * cw + ci, kb = kk + cw;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const wx = fWx[kk] * w00 + fWx[kk + 1] * w10 + fWx[kb] * w01 + fWx[kb + 1] * w11;
      const wy = fWy[kk] * w00 + fWy[kk + 1] * w10 + fWy[kb] * w01 + fWy[kb + 1] * w11;
      const vx = fVx[kk] * w00 + fVx[kk + 1] * w10 + fVx[kb] * w01 + fVx[kb + 1] * w11;
      const vy = fVy[kk] * w00 + fVy[kk + 1] * w10 + fVy[kb] * w01 + fVy[kb + 1] * w11;
      let m = fBody[kk] * w00 + fBody[kk + 1] * w10 + fBody[kb] * w01 + fBody[kb + 1] * w11;
      const v00 = fVoid[kk], v10 = fVoid[kk + 1], v01 = fVoid[kb], v11 = fVoid[kb + 1];
      const vd = v00 * w00 + v10 * w10 + v01 * w01 + v11 * w11;
      const s1 = fSh1[kk] * w00 + fSh1[kk + 1] * w10 + fSh1[kb] * w01 + fSh1[kb + 1] * w11;
      const cl = fCl[kk] * w00 + fCl[kk + 1] * w10 + fCl[kb] * w01 + fCl[kb + 1] * w11;
      const tk = fTk[kk] * w00 + fTk[kk + 1] * w10 + fTk[kb] * w01 + fTk[kb + 1] * w11;
      const wsp = fWsp[kk] * w00 + fWsp[kk + 1] * w10 + fWsp[kb] * w01 + fWsp[kb + 1] * w11;
      const mem = fMem[kk] * w00 + fMem[kk + 1] * w10 + fMem[kb] * w01 + fMem[kb + 1] * w11;

      // cloudy veins
      m += 0.15 * sstep(0.58, 0.95, cl);
      // a flake: a plateau with a crisp contour, like a sheet of rust lying over the rest
      if (s1 > 0.14) m += 0.22 * Math.sqrt(Math.min(1, (s1 - 0.14) / 0.5));
      // rounded hollows: a denser lip, then steep at the edge and flat inside (the projection of a round hollow)
      if (vd > -0.09) {
        const gx = (v10 - v00) * (1 - ty) + (v11 - v01) * ty, gy = (v01 - v00) * (1 - tx) + (v11 - v10) * tx;
        const dist = vd * CS / (Math.sqrt(gx * gx + gy * gy) + 1e-5);          // px into the hollow
        const lp = vd < 0 ? 1 + vd / 0.09 : 1;
        m += 0.16 * lp * lp * (1 - sstep(-0.7, 1.7, dist));
        if (vd > 0) m *= 1 - 0.66 * Math.pow(Math.min(1, vd / 0.5), 0.55 + 1.1 * L.clamp(0.5 + 1.4 * wy));   // here a firm lip, there a slow slope
      }
      // fine corrosion mottle
      m *= 0.955 + 0.06 * nC.n2(px / 27, py / 27) + 0.026 * nA.n2(px / 9 + 50, py / 9);

      // the rind: a shell seen edge-on — brightest where the beam grazes its inner face, tailing off inward
      const q = (dp + wsp) / tk;
      let sh = 0;
      if (q > 0 && q < 6) {
        sh = (Math.sqrt(q) - (q > 1 ? Math.sqrt(q - 1) : 0)) * (1 - sstep(2.4, 6, q));
        sh *= 1.42 + (q < 2 ? 0.28 * (1 - sstep(1, 2, q)) * nB.n2((ddx / rr) * R / 140, dp / 9) : 0);   // faint laminations
      }
      // what was drawn: cracks and pores take matter away, grit adds a little. They belong to the crust between the
      // coins — over a coin's face they fade, and there is none in its hole
      const Ck = C[k], hm = Hm[k];
      const crack = d1[o] * i255, grit = d1[o + 1] * i255, pore = d1[o + 2] * i255;
      if (crack + grit + pore > 0) {
        const off = (1 - 0.75 * sstep(0.12, 0.45, Ck)) * (1 - hm);
        m = m * (1 - 0.44 * crack * off) * (1 - 0.5 * pore * off) + 0.3 * grit;
        sh *= 1 - 0.55 * crack;
      }
      // the crust lies looser against the metal: a faint dark fringe outside each coin's edge
      m *= 1 - Ha[k];

      // foam — an X-ray of bubbles: round cavities pressed against one another, each dark in the middle and brightening
      // toward its wall (the beam runs along the membrane there). Big cells low in the seam, a lace of small ones toward
      // the rind, a fainter net behind and soft out-of-focus walls behind that (the foam has depth), smoke-thin filaments
      // across. A bubble is there or not as a whole (the gate is read at its centre), so the seam ends in whole bubbles
      // and never in a cut; and nothing switches on or off — walls thin out and give way where a slow field says so.
      const gw2 = fGW2[kk] * w00 + fGW2[kk + 1] * w10 + fGW2[kb] * w01 + fGW2[kb + 1] * w11;
      const gw1 = fGW1[kk] * w00 + fGW1[kk + 1] * w10 + fGW1[kb] * w01 + fGW1[kb + 1] * w11;
      if (gw1 > 0 || gw2 > 0) {
        const rel = fRel[kk] * w00 + fRel[kk + 1] * w10 + fRel[kb] * w01 + fRel[kb + 1] * w11;
        const big = fBig[kk] * w00 + fBig[kk + 1] * w10 + fBig[kb] * w01 + fBig[kb + 1] * w11;
        const op = fOp[kk] * w00 + fOp[kk + 1] * w10 + fOp[kb] * w01 + fOp[kb + 1] * w11;
        const ux = px + 72 * wx + 11 * vx, uy = py + 72 * wy + 11 * vy;
        const upper = 1 - sstep(-0.6, 0.25, rel);
        const wg = 0.56 + 0.44 * sstep(-0.5, 0.15, mem);                   // membranes are not equally dense along their length
        let S1 = 1, S2 = 1, Sf = 1;                                        // how much of each layer is solid here
        // big cells (bigger and emptier low in the seam)
        if (gw1 > 0) {
          cellX(ux / 168, uy / 132);
          const cA = sstep(0.2, 0.68, gBil(px + eAx * 168, py + eAy * 132)), cB = sstep(0.2, 0.68, gBil(px + eBx * 168, py + eBy * 132));
          if (cA > 0.003 || cB > 0.003) {
            const w = 1.0 + 1.5 * (1 + vy), dC = cA > cB ? cA - cB : cB - cA;
            const opn = 26 * sstep(0.0, 0.42, op) * (1 - Math.min(1, 2.5 * dC));      // how far the wall has receded
            const fd = eBd * 150, dd = (0.5 + 0.3 * eId) * 150 - Math.sqrt(eD1) * 150, cd = fd + opn < dd ? fd + opn : dd;
            const c = cA + (cB - cA) * (0.5 - 0.5 * sstep(0, 14, fd)) * sstep(0.4 * w, w, opn);   // two bubbles run together share their emptiness
            let vl = eId * 7.31; vl -= Math.floor(vl);                     // a film lying face-on across some bubbles: a soft veil
            const veil = vl > 0.68 ? (vl - 0.68) * 0.55 * sstep(2, 34, fd < cd ? fd : cd) : 0;
            const in1 = sstep(w, w + 2.4, cd);
            const F1 = (1 - in1) * (0.72 + 0.28 * wg) + in1 * ((0.5 * Math.exp(-(cd - w) / 15) + 0.24 * Math.exp(-(cd - w) / 4.5)) * wg + veil);
            S1 = 1 - c * (1 - F1);
          }
        }
        // the lace of small cells; on the fringe of the foam the solid matrix is only nibbled by them
        if (gw2 > 0) {
          cellX(ux / 47 + 11.3 + 0.12 * vy, uy / 42 - 7.1 + 0.12 * vx);
          const gA = gBil(px + eAx * 47, py + eAy * 42), gB = gBil(px + eBx * 47, py + eBy * 42);
          if (gA > 0.02 || gB > 0.02) {
            const cA = sstep(0.2, 0.68, gA), cB = sstep(0.2, 0.68, gB), nA2 = sstep(0.02, 0.24, gA) * (1 - cA), nB2 = sstep(0.02, 0.24, gB) * (1 - cB);
            const dC = Math.abs(cA - cB) + Math.abs(nA2 - nB2);
            const opn = 7 * sstep(0.1, 0.55, -op) * (1 - Math.min(1, 2.5 * dC));
            const fd = eBd * 44, dd = (0.5 + 0.3 * eId) * 44 - Math.sqrt(eD1) * 44, cd = fd + opn < dd ? fd + opn : dd;
            const tb = (0.5 - 0.5 * sstep(0, 9, fd)) * sstep(0.36, 0.9, opn);
            const in2 = sstep(0.9, 2.9, cd), lip2 = Math.exp(-(cd - 0.9) / 7), F2 = (1 - in2) + in2 * 0.5 * lip2;
            S2 = 1 - (cA + (cB - cA) * tb) * (1 - F2);
            Sf = 1 - 0.8 * (nA2 + (nB2 - nA2) * tb) * in2 * (1 - 0.65 * lip2);
          }
        }
        const small = 0.02 + 0.66 * upper, w1 = (0.95 - 0.5 * upper) * big, w2 = small + (0.8 - small) * (1 - big);
        const base = (w1 * S1 + w2 * S2) / (w1 + w2), opn = 1 - base;      // opn: how much of the beam's way through the foam is empty
        if (opn > 0.004) {
          // the net behind: membranes only, gone in places
          cell(ux / 92 - 3.9, uy / 80 + 21.7);
          const bd = cBd * 86 + 5 * sstep(0.05, 0.5, vx);
          const F3 = 0.5 * (1 - sstep(0.8, 3.0, bd)) + 0.16 * Math.exp(-bd / 9);
          // further back still, out of focus: broad soft walls
          cell(ux / 250 + 7.7, uy / 205 - 3.3);
          const F4 = Math.exp(-cBd * 225 / 13);
          // filaments: the computed ones, and the ones that were drawn
          const f1 = 1 - Math.abs(nB.n2(ux / 96 + 1.2 * wx, uy / 96 + 1.2 * wy)), f2 = f1 * f1, f4 = f2 * f2;
          const fil = (f4 * f4 * f4 * f4 * f2 * 0.5 + f4 * f1 * 0.035) * sstep(-0.4, 0.2, vy + mem) + 0.62 * d2[o] * i255 + 0.42 * d2[o + 1] * i255;
          m = m * base + 1.1 * opn * (0.02 + 0.13 * upper + F3 * (0.5 + 0.3 * upper) * (0.35 + 0.65 * sstep(-0.5, 0.3, mem))
            + 0.07 * F4 * (1 - 0.6 * upper) + fil * (0.4 + 0.6 * upper));
          sh *= 1 - 0.8 * opn;
        }
        m *= Sf;
      }

      // the holes: the cord that strung the coins has rotted away and soil only half fills them
      if (hm > 0) m *= 1 - hm * (0.84 + 0.16 * vx);
      // the contour, on the arc (a rough crust: ≤ 4 px of wobble inward)
      let wob = 1.3 * (1 + vx);
      if (dp < 7) wob += 0.75 * (1 + nA.n2(Math.atan2(ddx, ddy) * R / 8, 3.3));
      const edge = sstep(-1.4, 1.4, dp - wob);
      const x = m + sh + Ck * (1 - 0.5 * d2[o + 2] * i255);
      let v = 1 - Math.exp(-x);
      // the lump thickens and the film darkens away from the crest
      const vdx = (px - vcx) / 1.5, vdy = py - vcy;
      v *= 1 - 0.25 * sstep(400, 1080, Math.sqrt(vdx * vdx + vdy * vdy));
      // the grain of the film: per pixel, fine
      let h = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      v += (((h & 1023) + ((h >>> 10) & 1023)) / 2046 - 0.5) * 0.03 * (0.35 + v);
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const li = ((v * (NL - 1)) | 0) * 3;
      d[o] = lut[li]; d[o + 1] = lut[li + 1]; d[o + 2] = lut[li + 2]; d[o + 3] = edge * 255;
      if (v > 0.78) hot[(j >> 2) * hw + (i >> 2)] += sstep(0.78, 0.99, v) * edge * 0.0625;
    }
  }
  const tC = performance.now();
  const sharp = L.makeCanvas(RW, RH), g = sharp.getContext('2d');
  g.putImageData(img, 0, 0);
  // halation: the densest parts bloom a little into their surroundings (and, at the rind, a breath into the black above)
  const hc = L.makeCanvas(hw, hh2), hg = hc.getContext('2d'), himg = new ImageData(hw, hh2), hd = himg.data;
  for (let i = 0; i < hw * hh2; i++) { hd[i * 4] = 206; hd[i * 4 + 1] = 218; hd[i * 4 + 2] = 226; hd[i * 4 + 3] = Math.min(1, hot[i]) * 255; }
  hg.putImageData(himg, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.globalCompositeOperation = 'screen';
  g.filter = 'blur(4px)'; g.globalAlpha = 0.16; g.drawImage(hc, 0, 0, hw * HS, hh2 * HS);
  g.filter = 'blur(20px)'; g.globalAlpha = 0.09; g.drawImage(hc, 0, 0, hw * HS, hh2 * HS);
  g.restore();
  // depth of field: focus held around the crest and the coins under it (and along the rind), falling off in two steps
  // toward the sides and the bottom corners
  const out = L.blurred(sharp, 5), og = out.getContext('2d'), mid = L.blurred(sharp, 2), mg = mid.getContext('2d');
  const focus = (sx, r0, r1, rindA) => {
    const mask = L.makeCanvas(RW, RH), k = mask.getContext('2d');
    k.save();
    k.translate(cx - X0 - 40, a.crestY - Y0 + 210); k.scale(sx, 1);
    k.fillStyle = L.radial(k, 0, 0, r0, r1, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.66)'], [1, 'rgba(0,0,0,0)']]);
    k.fillRect(-RW, -RH, RW * 2, RH * 2);
    k.restore();
    k.translate(-X0, -Y0);
    k.filter = 'blur(14px)'; k.strokeStyle = `rgba(0,0,0,${rindA})`; k.lineWidth = 64; a.stroke(k, -14);
    k.filter = 'none';
    return mask;
  };
  mg.globalCompositeOperation = 'destination-in'; mg.drawImage(focus(2.5, 300, 640, 0.9), 0, 0);
  og.drawImage(mid, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(focus(2.1, 230, 520, 0.8), 0, 0);
  og.drawImage(sharp, 0, 0);
  og.getImageData(0, 0, 1, 1);
  console.warn('s08 coins', (tB0 - tA) | 0, 'marks', (tB - tB0) | 0, 'pixels', (tC - tB) | 0, 'post', (performance.now() - tC) | 0);
  return { cnv: out, X0, Y0 };
}

/** the bare film base: faint fog, a few hairline scratches, dust */
function buildFilm() {
  const c = L.makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#050607'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'screen';
  g.drawImage(L.noiseTex(W, H, { seed: 's08fog', scale: 700, octaves: 3, res: 0.125, ramp: [[0, 'rgba(27,35,40,0)'], [0.45, 'rgba(27,35,40,0)'], [1, 'rgba(27,35,40,0.34)']] }), 0, 0);
  const r = L.rng('s08film');
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const x = r.range(0, W), y = r.range(-80, H * 0.62), ang = Math.PI / 2 + r.gauss() * 0.16, len = r.range(90, 520), bend = r.range(-16, 16);
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len, mx = x + Math.cos(ang) * len * 0.5 + bend, my = y + Math.sin(ang) * len * 0.5;
    // a scratch is faint along its whole length and a little stronger along part of it
    g.strokeStyle = L.rgba('#7f8a8f', r.range(0.025, 0.06)); g.lineWidth = r.range(1.2, 1.7);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
    g.strokeStyle = L.rgba('#7f8a8f', r.range(0.02, 0.05)); g.lineWidth = r.range(1.3, 2);
    g.beginPath(); g.moveTo(L.lerp(x, mx, 0.5), L.lerp(y, my, 0.5)); g.quadraticCurveTo(mx, my, L.lerp(mx, x1, 0.6), L.lerp(my, y1, 0.6)); g.stroke();
  }
  L.speckle(g, { seed: 's08dust', count: 110, x: 0, y: 0, w: W, h: H, rMin: 0.6, rMax: 1.5, colors: ['#7f8a8f', '#d7dde0'], alpha: [0.05, 0.22] });
  return c;
}

export default {
  name: '钱坨的X光片',
  tone: 'light',
  init(env) {
    const t0 = performance.now();
    const clump = buildClump(env);
    const t1 = performance.now();
    S = { clump, film: buildFilm() };
    console.warn('s08 timing clump', (t1 - t0) | 0, 'film', (performance.now() - t1) | 0);
  },
  draw(ctx, env, p) {
    const f = env.frame | 0;
    const zoom = L.lerp(0.99, 1.016, p), rot = L.lerp(-0.004, 0.004, p);
    const jr = L.rng('s08fr' + f);
    // film base
    ctx.drawImage(S.film, 0, 0);
    // the lump: it drifts along the arc and comes a touch closer; its contour stays on the arc
    L.cam(ctx, env, { zoom, rot }, () => ctx.drawImage(S.clump.cnv, S.clump.X0, S.clump.Y0));
    // the scan band: a broad soft lift of the mid-tones, travelling left → right (does nothing to the black)
    const bx = L.lerp(60, W - 60, p), bw = 300;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.translate(bx, H / 2); ctx.rotate(0.07);
    ctx.fillStyle = L.linear(ctx, -bw, 0, bw, 0, [[0, '#808080'], [0.3, '#8e9396'], [0.5, '#a9b0b4'], [0.7, '#8e9396'], [1, '#808080']]);
    ctx.fillRect(-bw, -80, bw * 2, H);
    ctx.restore();
    // a few flecks of noise on the film, new every frame
    for (let i = 0; i < 46; i++) {
      const x = jr() * W, y = jr() * H, s = 0.6 + jr() * 0.8;
      ctx.fillStyle = `rgba(127,138,143,${(0.05 + 0.2 * jr()).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, L.TAU); ctx.fill();
    }
  },
};
