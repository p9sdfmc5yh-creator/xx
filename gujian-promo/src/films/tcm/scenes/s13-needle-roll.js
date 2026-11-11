// s13 — 针包. Macro flat-lay of an unrolled leather needle roll on grey-beige handmade paper: the arc is the roll's
// upper edge. The lens is pushed right onto the leather — only seven or eight filiform needles (毫针) cross the frame:
// a small wire loop for a tail, a handle of closely wound wire, then a hair-thin body that dives into a slit, lifts
// the leather into a little ridge and comes out again. A waxed-linen stitch line runs between the edge and the needle
// heads; near the crest it has been mended with a few vermilion stitches whose loose end climbs over the edge and
// frays out on the paper, next to a short dark-green tail. One needle is missing from its slot.
//
// The leather is shaded per pixel in init(): a float height field (pebbled grain from a warped worley net, long
// wrinkles, flow lines, the rolled-over edge, the stitch groove, the pressed beds, slits and tunnels of the needles)
// lit from the upper left. Needle and stitch geometry is analytic in polar coords (U = px along the arc, d = px below
// it), so everything stays concentric with the arc and the whole picture can slide along it.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;
const PITCH = 250;                // needle spacing along the arc
const GAP_SLOT = 2;               // this slot has lost its needle
const HW = 10.5;                  // half width of the wound handle
const TURN = 5.1;                 // pitch of the wire winding
const RING_D = 108, RING_R = 13.5; // tail ring: depth below the arc, outer radius
const HAND_L = 244;               // nominal length of the winding
const S1 = 444, S2 = 508;         // depths of the two slits each needle threads through
const ST_D = 46, ST_P = 44, ST_OFF = 20; // stitch line: depth, hole pitch, hole phase
const FOLD_U = -520, FOLD_L = 128, FOLD_W = 8.5;   // a short length of the edge has flipped over: centre, length, depth
const LXS = -0.66, LYS = -0.75;   // key light direction in the picture plane (from the upper left)
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const THREAD = {
  red: { dark: '#7c0a16', mid: '#cf1f2b', light: '#ff8f7c' },
  green: { dark: '#0a2418', mid: '#1d5a3d', light: '#6aa988' },
  flax: { dark: '#86601f', mid: '#dcbe82', light: '#f7e8bc' },
};

// ── tiny allocation-free worley noise (squared distances in cD1/cD2, cell id in cId) ──
let cD1 = 0, cD2 = 0, cId = 0;
function cell(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = cx + (h & 1023) / 1023 - x, dy = cy + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = ((h >>> 20) & 255) / 255; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = id;
}

const line = (g, x0, y0, x1, y1, lw, style) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  g.lineTo(x + w, y + h - r); g.arc(x + w - r, y + h - r, r, 0, Math.PI / 2); g.lineTo(x + r, y + h);
  g.arc(x + r, y + r, r, Math.PI / 2, Math.PI); g.lineTo(x, y + r); g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); g.closePath();
}

// ───────────────────────── needles: one record per slot ─────────────────────────
function needleList(a) {
  const s = a.span(PAD + 220), n = Math.ceil((s * a.R) / PITCH) + 1, r = L.rng('s13needles'), list = [];
  for (let i = -n; i < n; i++) {
    const U = (i + 0.5) * PITCH + r.range(-26, 26), th = U / a.R;
    const lxl = Math.cos(th) * LXS + Math.sin(th) * LYS, lyl = -Math.sin(th) * LXS + Math.cos(th) * LYS;   // light in the needle's own frame
    list.push({
      slot: i, U, th, missing: i === GAP_SLOT, dz: r.range(-24, 26), tilt: r.range(-0.05, 0.05),
      h1: RING_D + RING_R + HAND_L + r.range(-38, 16), lxl, lyl, hl: L.clamp(0.5 + 0.42 * lxl, 0.14, 0.42),
      tone: r.range(0, 1), rrot: r.range(-0.6, 0.6), rsq: r.range(0.84, 1), seed: 's13n' + i,
    });
  }
  return { list, slot0: -n };
}
/** local frame of one needle: origin dz below the arc, +y runs down the needle toward the circle centre */
function inNeedle(g, a, nd, fn) {
  a.at(g, nd.th, -nd.dz, () => { g.translate(0, S1); g.rotate(nd.tilt); g.translate(0, -S1); fn(); });
}

// ───────────────────────── leather: per-pixel height field + shading ─────────────────────────
function buildLeather(env, needles, slot0) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 6;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s13a'), nB = L.makeNoise('s13b');

  // slow fields on a coarse grid
  const CS = 4, cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2, CN = cw * ch;
  const cMac = new Float32Array(CN), cTone = new Float32Array(CN), cWx = new Float32Array(CN), cWy = new Float32Array(CN), cM3 = new Float32Array(CN), cM4 = new Float32Array(CN), cGs = new Float32Array(CN);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cw + i;
    const ddx = x - cx, ddy = cy - y, U = Math.atan2(ddx, ddy) * R, d = R - Math.hypot(ddx, ddy);
    // soft swells of a strip that has spent years rolled up
    cMac[k] = 15 * nA.fbm(x / 430, y / 430, 3) + 4.2 * nA.n2(U / 640 + 3.1, d / 240 + 9.2) + 1.9 * nB.n2(U / 150 - 8, d / 420);
    cTone[k] = nB.fbm(x / 260 + 11, y / 260 - 5, 3);
    cWx[k] = nB.n2(x / 72 + 5, y / 72); cWy[k] = nB.n2(x / 72 - 31, y / 72 + 19);
    cM3[k] = nA.n2(x / 380 + 9, y / 300 - 2);
    cM4[k] = nB.n2(x / 300 - 40, y / 260 + 13);
    cGs[k] = nA.n2(x / 170 - 3, y / 170 + 27);
  }
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };

  const Hh = new Float32Array(N), Cv = new Float32Array(N), Dp = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;
      if (d < -3) { Dp[k] = -9; continue; }
      Dp[k] = d;
      const wx = bil(cWx, i, j), wy = bil(cWy, i, j), tq = ddx / ddy, t2 = tq * tq, U = R * tq * (1 - t2 * (0.3333333 - t2 * (0.2 - t2 * 0.1428571)));   // R·atan

      // what the needle in this slot does to the leather
      let flat = 0, hN = 0, cN = 0;
      if (d > 70) {
        const nd = needles[Math.floor(U / PITCH) - slot0];
        if (nd) {
          const dd = d - nd.dz, q = (U - nd.U) * (rr / R), aq = Math.abs(q);
          if (dd > RING_D - RING_R - 14 && dd < nd.h1 + 22) {      // the bed the handle has pressed for itself
            const qr = Math.abs(q + (dd - S1) * nd.tilt);
            if (qr < HW + 13) {
              const pr = (1 - sstep(HW - 3, HW + 12, qr)) * sstep(RING_D - RING_R - 14, RING_D - RING_R + 8, dd) * (1 - sstep(nd.h1 - 4, nd.h1 + 22, dd));
              flat = 0.45 * pr; hN -= (nd.missing ? 0.5 : 1.1) * pr; cN += (nd.missing ? 0.16 : 0.1) * pr;
            }
          }
          if (aq < 36 && dd > S1 - 30) {
            if (!nd.missing) { const m = sstep(S1 - 2, S1 + 12, dd) * (1 - sstep(S2 - 12, S2 + 2, dd)); hN += 6.5 * m * Math.exp(-q * q / 72); }
            const sl = 1 - sstep(11, 17, aq);
            if (sl > 0) { const z1 = dd - S1, z2 = dd - S2, sg = Math.exp(-z1 * z1 / 9) + Math.exp(-z2 * z2 / 9); hN -= 4.2 * sg * sl; cN += 0.95 * sg * sl; }
            cN += 0.15 * Math.exp(-q * q / 170) * sstep(S1 - 30, S1 - 8, dd);       // rubbed darker where the metal lies
          }
        }
      }

      // pebbled grain: small rounded pads, the creases between them of very uneven depth
      cell((x + wx * 7) / 10.4, (y + wy * 7) / 8.0);
      const f1 = Math.sqrt(cD1), e = Math.sqrt(cD2) - f1, id1 = cId;
      let dome = 1 - 2.1 * f1 * f1; if (dome < 0) dome = 0;
      const gs = bil(cGs, i, j), edgeK = 1 - sstep(30, 190, d);
      const hp = (0.7 * dome + 0.3 * sstep(0.02, 0.3, e)) * (0.66 + 0.68 * id1);
      const crease = (1 - sstep(0.0, 0.2, e)) * (0.35 + 0.65 * id1);
      // a few long wrinkles, and patches of finer flow lines that run with the edge
      const m3 = sstep(0.0, 0.5, bil(cM3, i, j));
      let g3 = 0;
      if (m3 > 0) { const wv = nA.n2((U + wx * 46) / 240, (d + wy * 40) / 84 + 50); g3 = (1 - sstep(0.0, 0.04, Math.abs(wv))) * m3; }
      const m4 = Math.max(sstep(-0.2, 0.5, bil(cM4, i, j)), 0.8 * edgeK);
      let g4 = 0;
      if (m4 > 0) { const wv = nB.n2((U + wx * 24) / 105 + 9, (d + wy * 24) / 30 - 7); g4 = (1 - sstep(0.0, 0.1, Math.abs(wv))) * m4; }
      const amp = (1 - flat) * (0.95 + 0.35 * gs + 0.5 * edgeK);
      const rz = (d - 190) / 140;
      let h = bil(cMac, i, j) + 19 * Math.exp(-rz * rz) + amp * 1.55 * hp - 1.25 * g3 - 0.62 * g4 + hN;
      let cav = 0.24 * crease * amp + 0.55 * g3 + 0.2 * g4 + cN;
      const dc = d < 0 ? 0 : d;
      if (dc < 96) { const t = 1 - dc / 96; h -= 10 * t * t; }       // the strip curls down to the paper…
      if (dc < 13) { const t = 1 - dc / 13; h -= 6 * t * t; }       // …and its cut edge rounds over
      if (d > ST_D - 20 && d < ST_D + 20) {                         // pressed groove + stitch holes
        const dd = d - ST_D, gz = Math.exp(-dd * dd / 34);
        let uh = (U - ST_OFF) / ST_P; uh = (uh - Math.round(uh)) * ST_P;
        const hz = Math.exp(-(uh * uh + dd * dd) / 24);
        h -= 1.5 * gz + 3.4 * hz; cav += 0.22 * gz + 0.5 * hz;
      }
      Hh[k] = h; Cv[k] = cav;
    }
  }

  // shade: warm key from the upper left, waxy sheen on the pads, shadows that stay saturated
  const img = new ImageData(RW, RH), px = img.data;
  const LX = -0.56, LY = -0.64, LZ = 0.52, HX = -0.321, HY = -0.367, HZ = 0.872;
  for (let j = 0; j < RH; j++) {
    const jm = j > 0 ? -RW : 0, jp = j < RH - 1 ? RW : 0;
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i, d = Dp[k];
      if (d < -3) continue;
      const hx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5, hy = (Hh[k + jp] - Hh[k + jm]) * 0.5;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      let sh = 0.4 + 1.154 * (-hx * LX - hy * LY + LZ) * inv; sh = sh < 0.32 ? 0.32 : sh > 1.6 ? 1.6 : sh;
      const sp = (-hx * HX - hy * HY + HZ) * inv, spec = sp > 0.9 ? Math.pow(sp, 22) - 0.06 : 0;
      const tone = bil(cTone, i, j);
      let ar = 203 + 22 * tone, ag = 130 + 21 * tone, ab = 46 + 13 * tone;
      let cav = Cv[k]; cav = cav > 1 ? 1 : cav;
      ar *= 1 - 0.3 * cav; ag *= 1 - 0.47 * cav; ab *= 1 - 0.62 * cav;
      if (d < 90) { const pt = 1 - sstep(8, 90, d); ar *= 1 + 0.035 * pt; ag *= 1 + 0.075 * pt; ab *= 1 + 0.1 * pt; }   // dye worn paler toward the edge
      let r, g, b;
      if (sh < 1) { r = ar * (1 - (1 - sh) * 0.8); g = ag * sh; b = ab * sh * sh; } else { r = ar * sh; g = ag * (1 + (sh - 1) * 0.92); b = ab * (1 + (sh - 1) * 1.1); }
      if (spec > 0) { r += spec * 56; g += spec * 45; b += spec * 26; }
      if (d < 7) { const eb = 1 - 0.56 * (1 - sstep(3.6, 7, d)); r *= eb; g *= eb * 0.92; b *= eb * 0.8; }   // burnished, darker cut edge
      const o = k * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH), g = cnv.getContext('2d');
  g.putImageData(img, 0, 0);
  // slow warm stains, a few darker patches of handling, faint scuffs
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5;
  g.drawImage(L.noiseTex(RW, RH, { seed: 's13stain', scale: 300, octaves: 4, warp: 0.5, res: 0.2, ramp: [[0, '#c98d4e'], [0.5, '#ffffff'], [1, '#ffffff']] }), 0, 0);
  g.globalAlpha = 1;
  const rs = L.rng('s13scuff');
  for (let n = 0; n < 7; n++) {
    const x = rs.range(0, RW), y = rs.range(120, RH), rad = rs.range(40, 120);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, `rgba(176,104,44,${rs.range(0.25, 0.5)})`], [0.6, 'rgba(206,150,90,0.12)'], [1, 'rgba(255,255,255,0)']]);
    g.save(); g.translate(x, y); g.scale(1, rs.range(0.5, 0.9)); g.translate(-x, -y); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
  }
  g.globalCompositeOperation = 'source-over'; g.lineCap = 'round';
  for (let n = 0; n < 34; n++) {
    const x = rs.range(0, RW), y = rs.range(20, RH), ang = rs.range(-0.5, 0.5) + (rs.chance(0.3) ? 1.3 : 0), len = rs.range(24, 150), bend = rs.range(-14, 14);
    g.strokeStyle = `rgba(255,222,164,${rs.range(0.05, 0.15)})`; g.lineWidth = rs.range(0.8, 1.8);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend, y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  }
  return { cnv, X0, Y0 };
}

// ───────────────────────── paper ─────────────────────────
function buildPaper(a) {
  const pw = W + PAD * 2, ph = Math.ceil(a.yAt(-PAD - 40)) + 80 + PAD;
  const c = L.makeCanvas(pw, ph), g = c.getContext('2d'), r = L.rng('s13fibre');
  g.fillStyle = '#d0c0a3'; g.fillRect(0, 0, pw, ph);
  // soft clouds of pulp, then a finer mottle — both low in contrast
  g.globalAlpha = 0.7;
  g.drawImage(L.noiseTex(pw, ph, { seed: 's13pulp', scale: 150, octaves: 4, warp: 0.5, res: 0.2, ramp: [[0, '#c3b192'], [0.5, '#d0c0a3'], [1, '#dbccb1']] }), 0, 0);
  g.globalAlpha = 0.4;
  g.drawImage(L.noiseTex(pw, ph, { seed: 's13mottle', scale: 16, octaves: 3, res: 0.4, contrast: 1.3, ramp: [[0, '#bfae90'], [0.5, '#d0c0a3'], [1, '#e0d2b8']] }), 0, 0);
  g.globalAlpha = 1; g.lineCap = 'round';
  const fibre = (len, lw, style) => {
    const x = r() * pw, y = r() * ph, ang = r() * Math.PI, bend = r.range(-0.25, 0.25) * len;
    g.strokeStyle = style; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend, y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  };
  for (let i = 0; i < 260; i++) fibre(r.range(24, 110), r.range(0.8, 1.8), `rgba(244,236,216,${r.range(0.1, 0.3)})`);   // long pale plant fibres
  for (let i = 0; i < 900; i++) fibre(r.range(3, 14), r.range(0.8, 1.7), `rgba(98,76,44,${r.range(0.14, 0.5)})`);       // chopped dark fibres
  for (let i = 0; i < 40; i++) fibre(r.range(20, 60), r.range(0.7, 1.2), `rgba(98,76,44,${r.range(0.15, 0.4)})`);       // a few long hairs
  L.speckle(g, { seed: 's13speck', count: 1500, x: 0, y: 0, w: pw, h: ph, rMin: 0.5, rMax: 1.8, colors: ['#75603a', '#574326', '#9c8456', '#efe6cf'], alpha: [0.14, 0.5] });
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55; g.drawImage(L.grainTex(pw, ph, { seed: 's13grainA', amount: 0.22 }), 0, 0);
  g.globalAlpha = 0.5; g.drawImage(L.grainTex(pw, ph, { seed: 's13grainB', amount: 0.26, size: 2.5 }), 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 1;
  g.fillStyle = L.linear(g, 0, 0, pw, ph, [[0, 'rgba(255,250,236,0.22)'], [0.5, 'rgba(255,250,236,0)'], [1, 'rgba(58,44,22,0.2)']]);
  g.fillRect(0, 0, pw, ph);
  g.globalCompositeOperation = 'source-over';
  return c;
}

// ───────────────────────── edge of the leather ─────────────────────────
/** depth of the flipped-over lip at U (0 outside it) */
const foldW = (U) => { const f = (U - FOLD_U) / FOLD_L + 0.5; return f > 0 && f < 1 ? FOLD_W * Math.pow(Math.sin(Math.PI * f), 1.5) : 0; };
const NICKS = [[-905, 10, 4.5], [-322, 8, 3.4], [258, 12, 4.8], [742, 9, 4], [1010, 8, 3.5]];   // [U, half width, depth]
function edgeOffset(nz, U) {
  let w = Math.max(0, nz.n2(U / 60, 1.3)) * 1.6 + Math.max(0, nz.n2(U / 11, 7.7) - 0.3) * 2;
  for (const [u, hw, dp] of NICKS) { const t = Math.abs(U - u) / hw; if (t < 1) w = Math.max(w, dp * (1 - t * t)); }
  w = Math.max(w, foldW(U));
  return w;
}
function edgePts(a) {
  const nz = L.makeNoise('s13edge'), s = a.span(PAD + 240), n = Math.ceil((2 * s * a.R) / 2), out = [];
  for (let i = 0; i <= n; i++) { const th = L.lerp(-s, s, i / n), p = a.pt(th, -edgeOffset(nz, th * a.R)); out.push([p.x, p.y]); }
  return out;
}
const traceEdge = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
function leatherPath(g, pts) { traceEdge(g, pts); g.lineTo(pts[pts.length - 1][0], H + PAD + 60); g.lineTo(pts[0][0], H + PAD + 60); g.closePath(); }

// ───────────────────────── needles ─────────────────────────
function drawSlits(g, a, nd) {
  inNeedle(g, a, nd, () => {
    for (const s of [S1, S2]) {
      g.fillStyle = 'rgba(64,28,3,0.3)'; g.beginPath(); g.ellipse(0, s, 20, 6.5, 0, 0, L.TAU); g.fill();
      g.fillStyle = 'rgba(32,13,2,0.94)'; g.beginPath(); g.ellipse(0, s, 15, 3.1, 0, 0, L.TAU); g.fill();
    }
    g.lineCap = 'round';   // lit lips of the slits (the side that faces the light)
    for (const s of [S1, S2]) { g.strokeStyle = 'rgba(255,216,146,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, s + 0.9, 16.5, 4.6, 0, 0.25, Math.PI - 0.25); g.stroke(); }
  });
}
const ringTop = () => RING_D + RING_R - 4;   // where the winding starts, just under the loop
function needleShadow(g, a, nd, ox, oy, body) {
  g.save(); g.translate(ox, oy);
  inNeedle(g, a, nd, () => {
    g.strokeStyle = '#2e1402'; g.fillStyle = '#2e1402';
    if (!body) {
      g.lineWidth = 6.4; g.beginPath(); g.ellipse(0, RING_D, RING_R - 2.8, (RING_R - 2.8) * nd.rsq, nd.rrot, 0, L.TAU); g.stroke();
      g.fillRect(-HW, ringTop(), HW * 2, nd.h1 + 6 - ringTop());
    } else { g.lineCap = 'butt'; line(g, 0, nd.h1, 0, S1 - 2, 5, '#2e1402'); line(g, 0, S2 + 2, 0, S2 + 260, 5, '#2e1402'); }
  });
  g.restore();
}
function drawNeedle(g, a, nd) {
  inNeedle(g, a, nd, () => {
    const top = ringTop(), H1 = nd.h1, hx = -HW + 2 * HW * nd.hl, rr = L.rng(nd.seed), dull = nd.tone;
    // needle body: hair-thin, one cold white line of light, warm leather mirrored on its far side
    const seg = (y0, y1) => {
      g.lineCap = 'butt';
      line(g, 0, y0, 0, y1, 4.4, '#959ea3');
      line(g, 1.55, y0, 1.55, y1, 1.3, 'rgba(96,60,26,0.8)');
      line(g, -0.75, y0, -0.75, y1, 1.5, '#ffffff');
    };
    seg(H1 + 3, S1 + 1); seg(S2 - 1, S2 + 260);
    // wound-wire handle: one rounded bar per turn of wire, lit as a cylinder
    const grad = L.linear(g, -HW, 0, HW, 0, [[0, '#2b2622'], [Math.max(0.03, nd.hl - 0.17), '#868e93'], [nd.hl, '#fbfcfc'], [nd.hl + 0.12, '#d8dde0'], [0.6, '#a2aaae'], [0.8, '#64696d'], [0.92, '#a0723c'], [1, '#3a2817']]);
    g.fillStyle = '#231e1a'; g.fillRect(-HW + 1.6, top, 2 * HW - 3.2, H1 - top);
    const ys = [];
    for (let y = top; y < H1 + 14;) {
      const tw = TURN * (1 + rr.range(-0.1, 0.1)), k = y < H1 ? 1 + rr.range(-0.035, 0.035) : L.lerp(0.8, 0.3, (y - H1) / 14);
      g.save(); g.translate(rr.range(-0.35, 0.35), y + tw / 2); g.rotate(-0.15 + rr.range(-0.025, 0.025)); g.scale(k, 1);
      g.fillStyle = grad; rrect(g, -HW, -tw / 2 + 0.3, 2 * HW, tw - 0.6, (tw - 0.6) / 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.26)'; g.fillRect(-HW + 2.5, -tw / 2 + 0.6, 2 * HW - 6.5, 1.1);   // each wire is round too
      g.fillStyle = 'rgba(22,16,12,0.34)'; g.fillRect(-HW + 1.5, tw / 2 - 1.5, 2 * HW - 3, 1.1);
      g.restore();
      if (y < H1) ys.push(y + tw / 2);
      y += tw;
    }
    // tarnish: stretches of the winding have gone dull
    g.save(); g.beginPath(); g.rect(-HW - 0.5, top, 2 * HW + 1, H1 - top + 14); g.clip();
    for (let t = 0; t < 5; t++) {
      const yy = rr.range(top, H1), hh = rr.range(22, 80), al = rr.range(0.08, 0.2) + 0.16 * dull;
      g.fillStyle = L.linear(g, 0, yy - hh, 0, yy + hh, [[0, 'rgba(70,50,32,0)'], [0.5, `rgba(70,50,32,${al})`], [1, 'rgba(70,50,32,0)']]);
      g.fillRect(-HW - 1, yy - hh, 2 * HW + 2, 2 * hh);
    }
    g.restore();
    // a string of tiny glints, one on every turn
    for (const y of ys) { g.fillStyle = `rgba(255,255,255,${rr.range(0.3, 0.75) * (1 - 0.4 * dull)})`; g.beginPath(); g.ellipse(hx, y - 0.4, 2.3, 1.05, -0.15, 0, L.TAU); g.fill(); }
    // tail: the wire's end turned into a small loop
    const rc = RING_R - 2.8, la = Math.atan2(nd.lyl, nd.lxl);
    g.save(); g.translate(0, RING_D); g.rotate(nd.rrot); g.scale(1, nd.rsq); g.rotate(-nd.rrot);
    g.lineCap = 'round';
    g.lineWidth = 5.6; g.strokeStyle = '#70787d'; g.beginPath(); g.arc(0, 0, rc, 0, L.TAU); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(40,30,24,0.75)'; g.beginPath(); g.arc(-nd.lxl * 1.5, -nd.lyl * 1.5, rc, la + Math.PI - 1.3, la + Math.PI + 1.3); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(176,122,62,0.8)'; g.beginPath(); g.arc(0, 0, rc + 1.7, la + Math.PI - 0.9, la + Math.PI + 0.9); g.stroke();
    g.lineWidth = 2.2; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(nd.lxl * 1.1, nd.lyl * 1.1, rc, la - 1.15, la + 1.15); g.stroke();
    g.lineWidth = 1.1; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(0, 0, rc - 1.9, la + Math.PI - 0.8, la + Math.PI + 0.8); g.stroke();
    g.restore();
  });
}

// ───────────────────────── stitches & threads ─────────────────────────
const stitchKind = (k) => (k >= -2 && k <= 0 ? 'red' : k === -6 || k === -5 ? 'green' : (k >= 14 && k <= 16) || k === -19 ? null : 'flax');
/** one length of twisted thread between two points: dark core, a row of slanted plies, light on their backs */
function plyRun(g, x0, y0, x1, y1, w, col, r) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / (w * 0.62))), ang = Math.atan2(y1 - y0, x1 - x0) + 0.9;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = L.lerp(x0, x1, t) + r.range(-0.4, 0.4), y = L.lerp(y0, y1, t) + r.range(-0.4, 0.4);
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = col.mid; g.beginPath(); g.ellipse(0, 0, w * 0.62, w * 0.23, 0, 0, L.TAU); g.fill();
    g.fillStyle = L.rgba(col.dark, 0.55); g.beginPath(); g.ellipse(w * 0.05, w * 0.17, w * 0.5, w * 0.075, 0, 0, L.TAU); g.fill();
    g.fillStyle = L.rgba(col.light, 0.6); g.beginPath(); g.ellipse(-w * 0.1, -w * 0.09, w * 0.3, w * 0.07, 0, 0, L.TAU); g.fill();
    g.restore();
  }
}
function drawStitches(g, a) {
  const s = a.span(PAD + 200), k0 = Math.floor((-s * a.R - ST_OFF) / ST_P), k1 = Math.ceil((s * a.R - ST_OFF) / ST_P), r = L.rng('s13stitch');
  for (let k = k0; k <= k1; k++) {
    a.at(g, (ST_OFF + k * ST_P) / a.R, -ST_D, () => {
      g.fillStyle = 'rgba(34,14,2,0.92)'; g.beginPath(); g.ellipse(0, 0, 5.6, 4.2, 0, 0, L.TAU); g.fill();
      g.strokeStyle = 'rgba(255,216,146,0.42)'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(0.7, 1.1, 6.6, 5.1, 0, 0.2, 1.9); g.stroke();
    });
  }
  for (let k = k0; k < k1; k++) {
    const kind = stitchKind(k), w = 8.6 + r.range(-1, 1), jy = r.range(-1.1, 1.1), dirt = r.range(0, 1), sl = r.range(1.6, 3.2);
    if (!kind) continue;
    const col = THREAD[kind];
    a.at(g, (ST_OFF + (k + 0.5) * ST_P) / a.R, -ST_D, () => {
      const x0 = -ST_P / 2 + 5.5, x1 = ST_P / 2 - 5.5, y0 = sl + jy, y1 = -sl + jy;
      g.lineCap = 'round';
      line(g, x0 + 2.6, y0 + 3.6, x1 + 2.6, y1 + 3.6, w, 'rgba(44,18,2,0.42)');
      line(g, x0, y0, x1, y1, w, col.dark);
      plyRun(g, x0 + 1.5, y0, x1 - 1.5, y1, w * 0.9, col, r);
      if (kind === 'flax' && dirt > 0.45) line(g, x0, y0, x1, y1, w, `rgba(110,70,26,${(dirt - 0.45) * 0.6})`);   // years of wax and handling
    });
  }
}
const polarPts = (a, pts) => pts.map(([U, dr]) => { const p = a.pt(U / a.R, dr); return [p.x, p.y]; });
/** a loose twisted thread. g = colour target, sn / sf = near and far shadow targets. o: {w, col, seed, crimp, lift(u), fray, frayLen} */
function drawThread(g, sn, sf, pts, o) {
  const P0 = L.smoothPath(pts, 2), n = P0.length, r = L.rng(o.seed), nz = L.makeNoise(o.seed), col = o.col, w = o.w;
  const lift = (u) => (o.lift ? o.lift(u) : 0);
  const P = [], T = [];
  for (let i = 0; i < n; i++) {
    const p = P0[Math.max(0, i - 1)], q = P0[Math.min(n - 1, i + 1)];
    let tx = q[0] - p[0], ty = q[1] - p[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    // the kinks a thread keeps after it has been pulled out of its stitches
    const sl = i * 2, c = o.crimp * Math.sin((sl / ST_P) * Math.PI + 2.6 * nz.n2(sl / 110, 3.1)) * (0.35 + 0.9 * Math.abs(nz.n2(sl / 64, 9.7))) * sstep(0, 0.06, i / (n - 1));
    P.push([P0[i][0] - ty * c, P0[i][1] + tx * c]); T.push([tx, ty]);
  }
  for (let i = 1; i < n; i++) {   // shadow: tight where the thread lies down, far and soft where it lifts
    const lf = lift(i / (n - 1)), ox = 3.5 + lf * 24, oy = 4.5 + lf * 19, far = sstep(0.18, 0.5, lf);
    for (const [sg, al] of [[sn, (1 - far) * 0.85], [sf, far * 0.7]]) {
      if (al < 0.02) continue;
      sg.lineCap = 'butt'; sg.strokeStyle = `rgba(52,32,12,${al})`; sg.lineWidth = w * (1 + 0.5 * lf);
      sg.beginPath(); sg.moveTo(P[i - 1][0] + ox, P[i - 1][1] + oy); sg.lineTo(P[i][0] + ox, P[i][1] + oy); sg.stroke();
    }
  }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const hair = (i, len, spread, lw, style) => {
    const side = r.sign(), [tx, ty] = T[i], ang = Math.atan2(ty, tx) + side * r.range(0.35, spread), x0 = P[i][0] - ty * side * w * 0.35, y0 = P[i][1] + tx * side * w * 0.35;
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len, b = r.range(-0.35, 0.35) * len;
    g.strokeStyle = style; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 - Math.sin(ang) * b, (y0 + y1) / 2 + Math.cos(ang) * b, x1, y1); g.stroke();
  };
  for (let i = 3; i < n - 2; i++) if (r.chance(0.16)) hair(i, r.range(4, 13) * (1 + lift(i / (n - 1))), 1.2, r.range(0.6, 1.1), L.rgba(r.chance(0.5) ? col.mid : col.light, r.range(0.4, 0.85)));
  g.strokeStyle = col.dark; g.lineWidth = w; g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
  const stepN = Math.max(2, Math.round((w * 0.62) / 2));
  for (let i = 0; i + stepN < n; i += stepN) plyRun(g, P[i][0], P[i][1], P[i + stepN][0], P[i + stepN][1], w, col, r);
  // the round of the thread itself: a soft shade along its far side
  g.strokeStyle = L.rgba(col.dark, 0.3); g.lineWidth = w * 0.3; g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p[0] + w * 0.24, p[1] + w * 0.28) : g.moveTo(p[0] + w * 0.24, p[1] + w * 0.28))); g.stroke();
  // frayed end: the plies open and each one feathers into fluff
  const [tx, ty] = T[n - 1], base = Math.atan2(ty, tx), e = P[n - 1];
  for (let s = -1; s <= 1; s++) {
    const ang = base + s * 0.3 + r.range(-0.12, 0.12), len = o.frayLen * r.range(0.45, 0.8), b = r.range(-0.25, 0.25) * len;
    const x1 = e[0] + Math.cos(ang) * len, y1 = e[1] + Math.sin(ang) * len, mx = (e[0] + x1) / 2 - Math.sin(ang) * b, my = (e[1] + y1) / 2 + Math.cos(ang) * b;
    for (const [lw, style] of [[w * 0.5, col.dark], [w * 0.34, col.mid]]) { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); g.moveTo(e[0], e[1]); g.quadraticCurveTo(mx, my, x1, y1); g.stroke(); }
    g.strokeStyle = L.rgba(col.light, 0.6); g.lineWidth = w * 0.1; g.beginPath(); g.moveTo(e[0] - 1, e[1] - 1); g.quadraticCurveTo(mx - 1, my - 1, x1 - 1, y1 - 1); g.stroke();
    const so = lift(1);
    sf.strokeStyle = 'rgba(52,32,12,0.4)'; sf.lineWidth = w * 0.5; sf.beginPath(); sf.moveTo(e[0] + 3.5 + so * 24, e[1] + 4.5 + so * 19); sf.lineTo(x1 + 3.5 + so * 24, y1 + 4.5 + so * 19); sf.stroke();
  }
  for (let f = 0; f < o.fray; f++) {
    const i = n - 1 - r.int(0, 6), ang = base + r.range(-0.85, 0.85), len = r.range(0.3, 1) * o.frayLen, b = r.range(-0.3, 0.3) * len;
    const x0 = P[i][0] + Math.cos(base) * r.range(0, o.frayLen * 0.5), y0 = P[i][1] + Math.sin(base) * r.range(0, o.frayLen * 0.5), x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    g.strokeStyle = L.rgba(r.pick([col.mid, col.mid, col.light, col.dark]), r.range(0.5, 0.95)); g.lineWidth = r.range(0.8, 1.9);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 - Math.sin(ang) * b, (y0 + y1) / 2 + Math.cos(ang) * b, x1, y1); g.stroke();
  }
  g.restore();
}

// ───────────────────────── small helpers for partial layers ─────────────────────────
/** an off-screen canvas covering the frame rectangle x0…x0+w, y0…y0+h; its context draws in frame coordinates */
function region(x0, y0, w, h, draw) {
  const c = L.makeCanvas(w, h), g = c.getContext('2d');
  g.translate(-x0, -y0); if (draw) draw(g);
  return { c, g, x0, y0 };
}
const soft = (rg, px) => ({ c: L.blurred(rg.c, px), x0: rg.x0, y0: rg.y0 });
const put = (g, rg) => g.drawImage(rg.c, rg.x0, rg.y0);

// ───────────────────────── depth of field ─────────────────────────
/** focus sits on the crest; the picture softens toward the sides and down the roll (blurred at half size, mixed in through masks) */
function depthOfField(layer, a) {
  const hw = layer.width >> 1, hh = layer.height >> 1, fw = W + PAD * 2, fh = H + PAD * 2;
  const half = L.makeCanvas(hw, hh); half.getContext('2d').drawImage(layer, 0, 0, hw, hh);
  const pos = (x) => L.clamp((x + PAD) / fw);
  const sides = (g, x0, x1) => L.linear(g, -PAD, 0, W + PAD, 0, [[pos(a.cx - x1), 'rgba(0,0,0,1)'], [pos(a.cx - x0), 'rgba(0,0,0,0)'], [pos(a.cx + x0), 'rgba(0,0,0,0)'], [pos(a.cx + x1), 'rgba(0,0,0,1)']]);
  const deep = (g, d0, d1) => L.radial(g, a.cx, a.cy, a.R - d1, a.R - d0, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  const g = layer.getContext('2d');
  const mixIn = (px, fills) => {
    const m = L.makeCanvas(hw, hh), mg = m.getContext('2d');
    mg.scale(0.5, 0.5); mg.translate(PAD, PAD);
    for (const f of fills) { mg.fillStyle = f(mg); mg.fillRect(-PAD, -PAD, fw, fh); }
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'source-in'; mg.filter = `blur(${px / 2}px)`; mg.drawImage(half, 0, 0); mg.filter = 'none';
    g.drawImage(m, -PAD, -PAD, fw, fh);
  };
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  mixIn(2.4, [(mg) => sides(mg, 420, 840), (mg) => deep(mg, 250, 420), (mg) => L.linear(mg, 0, -PAD, 0, 280, [[0, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,0)']])]);
  mixIn(6, [(mg) => sides(mg, 700, 1080), (mg) => deep(mg, 400, 660)]);
  return layer;
}

// ───────────────────────── the whole flat-lay, one layer ─────────────────────────
function buildScene(env, needles, slot0) {
  const a = env.arc;
  const T0 = performance.now(); const lea = buildLeather(env, needles, slot0); const T1 = performance.now(); const paper = buildPaper(a); const T2 = performance.now(); const edge = edgePts(a);
  const live = needles.filter((nd) => !nd.missing);
  // the flipped lip: the strip between the fold (now the silhouette) and its mirror image lies pale side up on the leather
  const lip = (k) => { const out = []; for (let u = -FOLD_L / 2; u <= FOLD_L / 2; u += 3) { const p = a.pt((FOLD_U + u) / a.R, -k * foldW(FOLD_U + u)); out.push([p.x, p.y]); } return out; };
  const lipTop = lip(1), lipLow = lip(2.08);
  const lipPath = (g) => { g.beginPath(); lipTop.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); for (let i = lipLow.length - 1; i >= 0; i--) g.lineTo(lipLow[i][0], lipLow[i][1]); g.closePath(); };

  // shadows cast on the leather: soft and offset from the handles, tight under them, plus the flipped lip
  const sy0 = Math.floor(a.crestY) - 4, sw = W + PAD * 2, shH = H + PAD - sy0;
  const shCast = soft(region(-PAD, sy0, sw, shH, (g) => {
    for (const nd of live) { needleShadow(g, a, nd, 9, 11.5, false); needleShadow(g, a, nd, 4, 5, true); }
    g.translate(3, 4.5); g.fillStyle = '#2e1402'; lipPath(g); g.fill();
  }), 4.6);
  const shTight = soft(region(-PAD, sy0, sw, shH, (g) => { for (const nd of live) needleShadow(g, a, nd, 2, 2.6, false); }), 2.4);

  const tx0 = Math.round(a.cx - 400), ty0 = Math.round(a.crestY - 340);
  const tsn = region(tx0, ty0, 780, 480), tsf = region(tx0, ty0, 780, 480);
  const threads = region(tx0, ty0, 780, 480, (g) => {
    drawThread(g, tsn.g, tsf.g, polarPts(a, [[-244, -ST_D], [-260, -62], [-290, -74], [-322, -67], [-340, -46], [-334, -26], [-318, -20]]),
      { w: 7.8, col: THREAD.green, seed: 's13green', crimp: 1.6, lift: (u) => 0.14 * sstep(0.55, 1, u), fray: 9, frayLen: 20 });
    drawThread(g, tsn.g, tsf.g, polarPts(a, [[64, -ST_D], [80, -34], [87, -12], [72, 22], [80, 54], [116, 82], [118, 104], [108, 134], [132, 172], [162, 216]]),
      { w: 8.8, col: THREAD.red, seed: 's13red', crimp: 2.6, lift: (u) => Math.pow(sstep(0.12, 1, u), 1.3), fray: 20, frayLen: 44 });
  });
  const shNear = soft(tsn, 3.2), shFar = soft(tsf, 8);

  const sharp = L.makeLayer(PAD, (g) => {
    // 1) paper
    g.drawImage(paper, -PAD, -PAD);
    // 2) the leather sits on it: a soft shadow where the curled edge hovers, a tight one where it touches
    g.lineJoin = 'round';
    for (const [lw, al] of [[46, 0.035], [28, 0.05], [15, 0.08], [7, 0.13], [3, 0.3]]) { g.strokeStyle = `rgba(70,46,18,${al})`; g.lineWidth = lw; traceEdge(g, edge); g.stroke(); }
    // 3) leather
    g.save(); leatherPath(g, edge); g.clip();
    g.drawImage(lea.cnv, lea.X0, lea.Y0);
    const rw = L.rng('s13wear');   // worn spots where the dye has rubbed off the edge
    for (let i = 0; i < 26; i++) {
      const p = a.pt(rw.range(-0.36, 0.36), -rw.range(1, 9)), rad = rw.range(7, 20);
      g.fillStyle = L.radial(g, p.x, p.y, 0, rad, [[0, `rgba(246,204,136,${rw.range(0.25, 0.6)})`], [1, 'rgba(246,204,136,0)']]);
      g.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2);
    }
    // stitches, then everything that throws a shadow on the leather
    drawStitches(g, a);
    for (const nd of needles) drawSlits(g, a, nd);
    g.globalAlpha = 0.5; put(g, shTight);
    g.globalAlpha = 0.7; put(g, shCast); g.globalAlpha = 1;
    g.restore();
    // 4) fuzz of loose fibres along the cut edge
    const rf = L.rng('s13fuzz'); g.lineCap = 'round';
    for (let i = 4; i < edge.length - 4; i += 2) {
      if (!rf.chance(0.26)) continue;
      const [x, y] = edge[i], pl = a.polar(x, y), ang = pl.theta - Math.PI / 2 + rf.range(-0.9, 0.9), len = rf.range(2, 7) * (rf.chance(0.06) ? 2.4 : 1);
      g.strokeStyle = L.rgba(rf.pick(['#c8842c', '#e6b46a', '#9a5e1c']), rf.range(0.4, 0.85)); g.lineWidth = rf.range(0.6, 1.3);
      g.beginPath(); g.moveTo(x, y + 0.8); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.6 + rf.range(-2, 2), y + Math.sin(ang) * len * 0.6, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    }
    // 5) the flipped lip, pale flesh side up
    g.save(); lipPath(g); g.clip();
    const lc = a.pt(FOLD_U / a.R, -FOLD_W * 1.5);
    g.fillStyle = L.linear(g, lc.x, lc.y - FOLD_W, lc.x, lc.y + FOLD_W, [[0, '#f7dfb0'], [0.45, '#e4bf88'], [1, '#c79a5c']]); g.fillRect(lc.x - FOLD_L, lc.y - 40, FOLD_L * 2, 80);
    L.speckle(g, { seed: 's13nap', count: 520, x: lc.x - FOLD_L * 0.6, y: lc.y - 30, w: FOLD_L * 1.2, h: 60, rMin: 0.4, rMax: 1.3, colors: ['#fff3d4', '#b88a50', '#a87a40'], alpha: [0.2, 0.6] });
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(118,62,14,0.9)'; g.lineWidth = 4.5; g.beginPath(); lipLow.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();   // the burnished edge, now lying inside
    g.strokeStyle = 'rgba(255,247,224,0.85)'; g.lineWidth = 2.4; g.beginPath(); lipTop.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + 1.6) : g.moveTo(p[0], p[1] + 1.6))); g.stroke();   // light on the rounded fold
    g.restore();
    // 6) needles
    for (const nd of live) drawNeedle(g, a, nd);
    // 7) the loose threads and their shadows
    g.globalAlpha = 0.6; put(g, shFar); put(g, shNear); g.globalAlpha = 1;
    put(g, threads);
    // 8) light: a warm pool from the upper left, the roll falling away toward the bottom of frame
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = L.radial(g, a.cx - 320, a.crestY - 40, 160, 1500, [[0, 'rgba(255,240,206,0.24)'], [0.5, 'rgba(255,236,200,0.04)'], [1, 'rgba(70,34,0,0.3)']]);
    g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 700, a.R - 230, [[0, 'rgba(158,88,32,1)'], [1, 'rgba(255,255,255,1)']]);
    g.save(); a.clipBelow(g, -180); g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2); g.restore();
    g.globalCompositeOperation = 'source-over';
  });
  const T3 = performance.now(); const out = depthOfField(sharp, a); console.warn('TIMING leather', T1 - T0 | 0, 'paper', T2 - T1 | 0, 'compose', T3 - T2 | 0, 'dof', performance.now() - T3 | 0);
  return out;
}

export default {
  name: '针包',
  tone: 'dark',
  init(env) {
    const { list, slot0 } = needleList(env.arc);
    S = { needles: list.filter((nd) => !nd.missing), scene: buildScene(env, list, slot0) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    // the whole flat-lay slides ~1.5° along the arc, with a breath of push-in
    const rot = L.lerp(-0.013, 0.013, p), zoom = L.lerp(1.0, 1.012, p);
    L.blit(ctx, env, S.scene, { rot, zoom });
    // warm light drifting over the leather
    ctx.save(); a.clipBelow(ctx, -2);
    const gp = a.pt(L.lerp(-0.2, 0.06, p), -210);
    L.glow(ctx, gp.x, gp.y, 620, '#ffc680', 0.1);
    ctx.restore();
    // a glint runs down the row, needle by needle
    const ts = L.lerp(-0.24, 0.24, p);
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.globalCompositeOperation = 'screen';
      for (const nd of S.needles) {
        const dl = (nd.th + rot - ts) / 0.07, k = Math.exp(-dl * dl);
        if (k < 0.03) continue;
        inNeedle(ctx, a, nd, () => {
          const top = ringTop(), H1 = nd.h1, hx = -HW + 2 * HW * nd.hl, yk = L.clamp(L.lerp(top, H1, 0.36) + dl * 46, top + 16, H1 - 16), u = (yk - top) / (H1 - top);
          ctx.fillStyle = L.radial(ctx, hx, yk, 0, 46, [[0, `rgba(232,242,255,${0.42 * k})`], [0.3, `rgba(220,234,255,${0.12 * k})`], [1, 'rgba(210,230,255,0)']]);
          ctx.fillRect(hx - 46, yk - 46, 92, 92);
          ctx.fillStyle = L.linear(ctx, 0, top, 0, H1, [[0, 'rgba(255,255,255,0)'], [Math.max(0.02, u - 0.3), `rgba(255,255,255,${0.22 * k})`], [u, `rgba(255,255,255,${0.9 * k})`], [Math.min(0.98, u + 0.3), `rgba(255,255,255,${0.22 * k})`], [1, 'rgba(255,255,255,0)']]);
          ctx.fillRect(hx - 3, top, 6, H1 - top);
          // the needle body catches it too, and so does the loop
          ctx.fillStyle = `rgba(255,255,255,${0.8 * k})`;
          ctx.fillRect(-1.8, H1 + 5, 2.6, S1 - H1 - 7);
          const sx = nd.lxl * (RING_R - 2.6), sy = RING_D + nd.lyl * (RING_R - 2.6);
          ctx.fillStyle = L.radial(ctx, sx, sy, 0, 22, [[0, `rgba(255,255,255,${0.9 * k})`], [0.25, `rgba(232,242,255,${0.3 * k})`], [1, 'rgba(220,236,255,0)']]);
          ctx.fillRect(sx - 22, sy - 22, 44, 44);
        });
      }
    });
  },
};
