// s17 — 钧窑窑变. Looking straight down into a Jun-ware dish, macro on the glaze.
// The arc is the fold between the well (盘心, below) and the wall (盘壁, above): the thick glaze pools there into a line of moon-white.
// Below the arc: opalescent sky-blue glaze, clouded with moon-white, pitted with tiny "brown eyes" (棕眼) and wandering
// "earthworm tracks" (蚯蚓走泥纹). Above it: rose-purple and begonia-red flambé running down the wall in radial streams that
// bleed into sky-blue and moon-white at the sides; the middle (tagline zone) stays one calm cloud of rose-purple.
//
// Both glaze fields are shaded per pixel at half resolution in init() from a "copper content" value that is looked up in a ramp
// (moon-white → sky-blue → lilac → rose-purple → begonia-red), so colours always melt through their neighbours instead of
// meeting as flat patches. Crisp things (fold line, pinholes, tracks, bubbles) are drawn on top at full resolution.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 130;
const LW = W + PAD * 2, LH = H + PAD * 2;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const NL = 1024;
function lut(stops) {
  const f = L.makeRamp(stops), out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

// copper content 0 → 1: 月白 → 天蓝 → 藕荷 → 玫瑰紫 → 海棠红
const FLAMBE = [
  [0.0, '#e6f1f2'], [0.1, '#c4e2ea'], [0.24, '#6fb7d6'], [0.34, '#6a98da'], [0.44, '#8a5fba'],
  [0.56, '#a63a7a'], [0.68, '#bb3c70'], [0.82, '#d0455e'], [0.93, '#d94c64'], [1, '#bf3552'],
];
// thickness / opalescence of the blue glaze 0 → 1: deep azure → 天蓝 → 月白
const WELL = [
  [0, '#2f86c4'], [0.24, '#4a9fd2'], [0.46, '#6fb7d6'], [0.68, '#a3d3e3'], [0.86, '#d6e6ea'], [1, '#f1f8f7'],
];

/** per-pixel glaze: returns two half-res canvases (wall above the arc, well below it) */
function shadeGlaze(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const RES = 0.5, cw = Math.ceil(LW * RES), ch = Math.ceil(LH * RES);
  const nA = L.makeNoise('s17a'), nB = L.makeNoise('s17b'), nC = L.makeNoise('s17c');
  const FL = lut(FLAMBE), WL = lut(WELL);
  const wallI = new ImageData(cw, ch), wellI = new ImageData(cw, ch);
  const wd = wallI.data, ld = wellI.data;
  const SPU = -610, SPV = -262;       // the purple splash (紫斑) floating in the well, lower left
  for (let j = 0; j < ch; j++) {
    const y = (j + 0.5) / RES - PAD, ddy = cy - y;
    for (let i = 0; i < cw; i++) {
      const x = (i + 0.5) / RES - PAD, ddx = x - cx;
      const rr = Math.sqrt(ddx * ddx + ddy * ddy), v = rr - R, u = Math.atan2(ddx, ddy) * R, au = Math.abs(u);
      const o = (j * cw + i) * 4;
      if (v > -6) {
        // ── the wall: copper flambé streaming toward the fold ──
        const big = nA.fbm(u / 560 + 3.1, v / 460 - 1.7, 3);
        const side = sstep(350, 880, au + 130 * big);          // 0 = calm centre column (tagline), 1 = streaming sides
        const wob = (30 * nA.n2(u / 460 + 11, v / 300) + 11 * nB.n2(u / 120 - 3, v / 170 + 9)) * (0.3 + 0.7 * side);
        const uw = u + wob;
        const st3 = nB.fbm(uw / 270 - 9, v / 900 + 2, 2);
        const st1 = nA.fbm(uw / 88 + 20, v / 1500 + 5, 3);
        const st4 = nA.n2(uw / 27 + 90, v / 800 - 3);
        const st2 = nB.n2(uw / 11 + 40, v / 600);
        const amp = 0.06 + 0.94 * side;
        let c = 0.6 + amp * 1.5 * (0.2 * big + 0.22 * st3 + 0.29 * st1 + 0.065 * st4 + 0.035 * st2);
        // calm zone: one soft cloud of rose-purple — blushing toward begonia-red at the fold, deeper toward the top
        c += (1 - side) * (0.1 * (1 - sstep(0, 320, v)) - 0.07 * sstep(200, 620, v) + 0.05 * nC.fbm(u / 340 + 1, v / 340, 2));
        // sides: begonia-red gathers low on the wall, sky-blue and moon-white break through higher up
        c += side * (0.08 * (1 - sstep(0, 280, v)) - 0.13 * sstep(160, 700, v));
        c = c < 0 ? 0 : c > 1 ? 1 : c;
        // deep aubergine veins between the bright streams give the flambé its depth
        const dkv = side * sstep(0.36, 0.8, nC.n2(uw / 36 + 7, v / 1200 + 2));
        c += (0.5 - c) * 0.45 * dkv;
        let k = (1 + amp * (0.07 * st2 + 0.05 * st4 + 0.05 * st1)) * (1 - 0.38 * dkv);
        k *= 1 - 0.36 * Math.exp(-Math.max(0, v) / 20);        // the foot of the wall sits in the shade of the fold
        k *= 0.9 + 0.1 * sstep(0, 230, v);
        k *= 1.05 - 0.1 * L.clamp((x - 100) / 1800);           // key light from the upper left
        const li = ((c * (NL - 1)) | 0) * 3;
        wd[o] = FL[li] * k; wd[o + 1] = FL[li + 1] * k; wd[o + 2] = FL[li + 2] * k; wd[o + 3] = 255;
      }
      if (v < 6) {
        // ── the well: thick opalescent sky-blue ──
        const d = v < 0 ? -v : 0;
        const wx = nA.n2(u / 400 + 5, v / 400), wy = nA.n2(u / 400 - 31, v / 400 + 19);
        const cloud = nB.fbm(u / 620 + wx * 0.28 + 9, v / 620 + wy * 0.28, 3, 2, 0.45);
        const mott = nC.fbm(u / 110 + wx * 0.6, v / 110 + wy * 0.6 + 4, 3);
        const fine = nA.n2(u / 16 + 80, v / 16);
        let t = 0.4 + 0.5 * cloud + 0.085 * mott + 0.025 * fine + 0.18 * sstep(0.1, 0.7, cloud);
        // glaze pools along the fold → a line of moon-white
        const pw = 13 + 6 * nB.n2(u / 150 + 60, 3.3);
        t += 0.66 * Math.exp(-d / pw) + 0.2 * Math.exp(-d / 95);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const wi = ((t * (NL - 1)) | 0) * 3;
        let cr = WL[wi], cg = WL[wi + 1], cb = WL[wi + 2];
        // copper spilling over the fold: lilac tongues that hang into the blue, longer in some stretches than others, mostly at the sides
        const sideB = sstep(240, 900, au);
        let bleed = 0;
        if (d < 760) {
          const tn = nA.fbm(u / 80 + 70 + wx * 0.6, v / 430 + 4, 3) * 0.5 + 0.5;
          const reach = 60 + 150 * (nB.n2(u / 270 + 12, 7.7) * 0.5 + 0.5);
          bleed = sstep(0.3, 0.9, tn + 0.22 * sideB) * Math.exp(-d / reach) * (0.1 + 0.9 * sideB) * sstep(5, 30, d);
        }
        // the purple splash (紫斑): begonia-red heart, rose-purple body, a wide lilac halo melting into the blue
        const su = (u - SPU) / 235, sv = (v - SPV) / 125;
        const s0 = Math.sqrt(su * su + sv * sv);
        const sd = s0 > 1.9 ? 9 : s0 + 0.42 * nC.fbm(u / 190 + 3, v / 190 + 8, 3) + 0.08 * mott;
        const sp = 1 - sstep(0.02, 1.32, sd);
        const cu = Math.max(bleed * 0.72, sp * 0.97);
        if (cu > 0.004) {
          const cc = 0.2 + 0.7 * cu + 0.03 * mott, ci = ((L.clamp(cc) * (NL - 1)) | 0) * 3;
          const m = sstep(0, 0.42, cu) * (0.92 - 0.5 * Math.exp(-d / pw));
          cr += (FL[ci] - cr) * m; cg += (FL[ci + 1] - cg) * m; cb += (FL[ci + 2] - cb) * m;
        }
        const kk = (1.04 - 0.09 * L.clamp((x - 100) / 1800)) * (1 - 0.1 * sstep(260, 820, d));
        ld[o] = cr * kk; ld[o + 1] = cg * kk; ld[o + 2] = cb * kk; ld[o + 3] = 255;
      }
    }
  }
  const wallC = L.makeCanvas(cw, ch); wallC.getContext('2d').putImageData(wallI, 0, 0);
  const wellC = L.makeCanvas(cw, ch); wellC.getContext('2d').putImageData(wellI, 0, 0);
  return { wallC, wellC };
}

/** a meandering path (frame coords): the heading drifts with smooth noise, like a worm trail in mud. Stops short of the fold. */
function wormPts(a, nz, k, x0, y0, h0, len, below, turn = 1) {
  const pts = []; let x = x0, y = y0, h = h0;
  const step = 6;
  for (let s = 0; s <= len; s += step) {
    const dr = a.drAt(x, y);
    if (below ? dr > -34 : dr < 46) break;
    let self = false;
    for (let j = 0; j < pts.length - 12 && !self; j++) self = Math.hypot(pts[j][0] - x, pts[j][1] - y) < 30;
    if (self) break;
    pts.push([x, y]);
    h += turn * (0.17 * nz.n2(s / 66 + k * 3.7, k * 1.3) + 0.07 * nz.n2(s / 160 + k, 40 + k));
    x += Math.cos(h) * step; y += Math.sin(h) * step;
  }
  return pts;
}
/** round-ended stroke whose width swells and thins gently (opaque: alpha is applied when the whole layer is composited) */
function strokeWorm(g, pts, w, color, nz, k) {
  const n = pts.length; if (n < 4) return;
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < n - 1; i++) {
    const t = i / (n - 1);
    const ends = Math.pow(Math.sin(Math.PI * t), 0.45);
    g.lineWidth = w * (0.5 + 0.5 * ends) * (1 + 0.2 * nz.n2(i * 0.09 + k * 5.1, 3.1));
    g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke();
  }
}

/** 蚯蚓走泥纹: soft pale veins with a deeper rim. Returns { rim, core } layers. */
function buildTracks(env) {
  const a = env.arc;
  const nz = L.makeNoise('s17worm'), r = L.rng('s17worm');
  const worms = [], placed = [];
  // keep a track only up to the point where it would run into another one
  const add = (pts, w, k, rim, core) => {
    let n = pts.length;
    for (let i = 0; i < pts.length && n === pts.length; i++) {
      if (placed.some((q) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) < 40)) n = Math.max(0, i - 4);
    }
    const kept = pts.slice(0, n);
    if (kept.length < 10) return null;
    worms.push({ pts: kept, w, k, rim, core });
    return kept;
  };
  const commit = (...lists) => { for (const l of lists) if (l) for (const q of l) placed.push(q); };
  // the well: wandering every which way
  const starts = [];
  let guard = 0;
  while (starts.length < 10 && guard++ < 800) {
    const x = r.range(-90, W + 90), y = r.range(a.yAt(x) + 120, H + 80);
    if (starts.some((s) => Math.hypot(s[0] - x, s[1] - y) < 330)) continue;
    if (Math.hypot(x - 423, y - 891) < 300) continue;     // keep clear of the purple splash
    starts.push([x, y]);
  }
  starts.forEach(([x, y], k) => {
    const w = r.range(12, 17), h0 = r.range(0, L.TAU), len = r.range(170, 330);
    const main = add(wormPts(a, nz, k + 1, x, y, h0, len, true), w, k, '#1f6cb0', '#e3f2f4');
    let fork = null;
    if (r.chance(0.5) && main && main.length > 14) {
      // a side branch that peels away and keeps going its own way (straighter, so it cannot curl back onto its parent)
      const qi = Math.floor(main.length * r.range(0.35, 0.6)), q = main[qi], q0 = main[qi - 1];
      const hq = Math.atan2(q[1] - q0[1], q[0] - q0[0]) + r.sign() * r.range(0.75, 1.15);
      let b = wormPts(a, nz, k + 31, q[0], q[1], hq, len * r.range(0.35, 0.5), true, 0.3);
      for (let i = 13; i < b.length; i++) {
        if (main.some((m) => Math.hypot(m[0] - b[i][0], m[1] - b[i][1]) < 38)) { b = b.slice(0, i - 4); break; }
      }
      fork = add(b, w * 0.82, k + 31, '#1f6cb0', '#e3f2f4');
    }
    commit(main, fork);
  });
  // the wall: they follow the flow, roughly radial; only at the sides
  [[-0.3, 300], [-0.235, 430], [0.3, 350], [0.365, 210]].forEach(([th, dr], k) => {
    const p = a.pt(th, dr), h0 = Math.atan2(Math.cos(th), -Math.sin(th)) + r.range(-0.2, 0.2);
    commit(add(wormPts(a, nz, k + 61, p.x, p.y, h0, r.range(190, 270), false, 0.55), r.range(10, 14), k + 61, '#5a124c', '#f2d9ec'));
  });
  const rim = L.makeLayer(PAD, (g) => { for (const o of worms) strokeWorm(g, o.pts, o.w * 2.1, o.rim, nz, o.k); });
  const core = L.makeLayer(PAD, (g) => { for (const o of worms) strokeWorm(g, o.pts, o.w, o.core, nz, o.k + 7); });
  return { rim: L.blurred(rim, 4), core: L.blurred(core, 1.6) };
}

function buildBase(env) {
  const a = env.arc;
  const { wallC, wellC } = shadeGlaze(env);
  const tracks = buildTracks(env);
  const full = (g) => g.fillRect(-PAD, -PAD, LW, LH);

  // height map for the relief pass: orange-peel undulation + pits
  const height = L.makeLayer(PAD, (g) => {
    g.drawImage(L.noiseLayer(PAD, { seed: 's17peel', scale: 90, octaves: 2, res: 0.2, contrast: 0.3 }), -PAD, -PAD);
  });
  const hg = height.getContext('2d');

  const layer = L.makeLayer(PAD, (g) => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(wallC, -PAD, -PAD, LW, LH);
    g.save(); a.clipBelow(g, 0); g.drawImage(wellC, -PAD, -PAD, LW, LH); g.restore();

    // silky radial hair-streaks in the flambé + crisp aubergine hairlines (both hushed in the tagline column)
    const hush = (cnv, keep) => {
      const hgx = cnv.getContext('2d');
      hgx.globalCompositeOperation = 'destination-out';
      hgx.fillStyle = L.linear(hgx, PAD, 0, PAD + W, 0, [[0, 'rgba(0,0,0,0)'], [0.18, 'rgba(0,0,0,0)'], [0.3, L.rgba('#000', 1 - keep)], [0.7, L.rgba('#000', 1 - keep)], [0.82, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']]);
      hgx.fillRect(0, 0, LW, LH);
      hgx.globalCompositeOperation = 'source-over';
      return cnv;
    };
    const silk = hush(L.polarNoiseLayer(env, PAD, { seed: 's17silk', scale: 6, sx: 1, sy: 90, octaves: 1, res: 0.5, contrast: 1.7 }), 0.07);
    const veins = hush(L.polarNoiseLayer(env, PAD, { seed: 's17vein', scale: 8.5, sx: 1, sy: 80, octaves: 1, res: 0.5, contrast: 1.5,
      ramp: [[0, 'rgba(70,12,64,0.8)'], [0.2, 'rgba(70,12,64,0.34)'], [0.34, 'rgba(70,12,64,0)'], [1, 'rgba(70,12,64,0)']] }), 0);
    g.save(); a.clipAbove(g, 1);
    g.globalAlpha = 0.6; g.drawImage(veins, -PAD, -PAD);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.38;
    g.drawImage(silk, -PAD, -PAD);
    g.restore();

    // a few stray copper specks around the splash
    const rs = L.rng('s17sat');
    for (let n = 0; n < 10; n++) {
      const ang = rs.range(0, L.TAU), dist = rs.range(250, 400), rad = rs.range(6, 17);
      const x = 423 + Math.cos(ang) * dist * 1.25, y = 891 + Math.sin(ang) * dist * 0.72;
      if (a.drAt(x, y) > -46) continue;
      g.save(); g.translate(x, y); g.rotate(rs.range(0, 3)); g.scale(1, rs.range(0.6, 0.9));
      g.fillStyle = L.radial(g, 0, 0, 0, rad * 2.3, [[0, 'rgba(200,64,100,0.85)'], [0.28, 'rgba(166,58,122,0.72)'], [0.6, 'rgba(126,96,196,0.38)'], [1, 'rgba(111,152,218,0)']]);
      g.beginPath(); g.arc(0, 0, rad * 2.3, 0, L.TAU); g.fill();
      g.restore();
    }

    // micro-bubbles: the milky, granular body of an opalescent glaze (denser in some clouds than others)
    const bub = L.noiseTex(512, 512, { seed: 's17bub', scale: 8, cellular: true, res: 1,
      ramp: [[0, 'rgba(244,251,252,0.95)'], [0.16, 'rgba(244,251,252,0.5)'], [0.34, 'rgba(244,251,252,0)'], [1, 'rgba(244,251,252,0)']] });
    const bub2 = L.noiseTex(512, 512, { seed: 's17bub2', scale: 19, cellular: true, res: 1,
      ramp: [[0, 'rgba(244,251,252,0.7)'], [0.1, 'rgba(244,251,252,0.3)'], [0.22, 'rgba(244,251,252,0)'], [1, 'rgba(244,251,252,0)']] });
    const bl = L.makeLayer(PAD, (b) => {
      b.globalAlpha = 0.75; b.fillStyle = b.createPattern(bub, 'repeat'); full(b);
      b.globalAlpha = 0.8; b.fillStyle = b.createPattern(bub2, 'repeat'); full(b);
      b.globalAlpha = 1; b.globalCompositeOperation = 'destination-in';
      b.drawImage(L.noiseLayer(PAD, { seed: 's17dens', scale: 190, octaves: 3, res: 0.2, contrast: 2.2, ramp: [[0, 'rgba(0,0,0,0.06)'], [0.45, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,1)']] }), -PAD, -PAD);
    });
    const grainT = L.noiseTex(512, 512, { seed: 's17grain', scale: 5.5, octaves: 2, res: 1, contrast: 2.4 });
    const deepT = L.noiseTex(512, 512, { seed: 's17deep', scale: 12, cellular: true, res: 1,
      ramp: [[0, 'rgba(20,98,170,0.7)'], [0.14, 'rgba(20,98,170,0.32)'], [0.3, 'rgba(20,98,170,0)'], [1, 'rgba(20,98,170,0)']] });
    g.save(); a.clipBelow(g, -2);
    g.globalAlpha = 0.42; g.fillStyle = g.createPattern(deepT, 'repeat'); full(g);
    g.globalAlpha = 0.76; g.drawImage(bl, -PAD, -PAD);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.3; g.fillStyle = g.createPattern(grainT, 'repeat'); full(g);
    g.restore();
    g.save(); a.clipAbove(g, 2);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.12; g.fillStyle = g.createPattern(grainT, 'repeat'); full(g);
    g.restore();
    g.save(); a.clipAbove(g, 2);
    g.globalAlpha = 0.17; g.drawImage(bl, -PAD, -PAD);
    g.globalAlpha = 0.2;
    g.drawImage(bl, 0, 0, PAD + 500, LH, -PAD, -PAD, PAD + 500, LH);
    g.drawImage(bl, PAD + 1420, 0, 500 + PAD, LH, 1420, -PAD, 500 + PAD, LH);
    g.restore();

    // earthworm tracks
    g.save();
    g.globalAlpha = 0.42; g.drawImage(tracks.rim, -PAD, -PAD);
    g.globalAlpha = 0.66; g.drawImage(tracks.core, -PAD, -PAD);
    g.restore();

    // pinholes (棕眼): tiny pits with a brownish floor, a pale collar where the glaze pulled back, and a lit lip
    const rp = L.rng('s17pin');
    const span = a.span(PAD + 20);
    const pin = (x, y, rad, halo) => {
      g.fillStyle = L.radial(g, x, y, rad * 0.7, rad * 2.9, [[0, L.rgba(halo, 0.55)], [1, L.rgba(halo, 0)]]);
      g.beginPath(); g.arc(x, y, rad * 2.9, 0, L.TAU); g.fill();
      g.fillStyle = L.radial(g, x - rad * 0.14, y - rad * 0.14, 0, rad, [[0, '#3a2516'], [0.5, '#5a3d26'], [0.86, 'rgba(74,70,84,0.85)'], [1, 'rgba(60,100,140,0)']]);
      g.beginPath(); g.arc(x, y, rad, 0, L.TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = Math.max(0.8, rad * 0.24); g.lineCap = 'round';
      g.beginPath(); g.arc(x, y, rad * 0.95, 0.2, 1.35); g.stroke();
      hg.fillStyle = L.radial(hg, x, y, 0, rad * 1.5, [[0, 'rgba(0,0,0,0.95)'], [0.6, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
      hg.beginPath(); hg.arc(x, y, rad * 1.5, 0, L.TAU); hg.fill();
    };
    for (let n = 0; n < 66; n++) {
      const th = rp.range(-span, span), dr = -(26 + Math.pow(rp(), 0.8) * 720);
      const rad = rp.chance(0.12) ? rp.range(5, 8) : rp.range(1.8, 4.2);
      const p = a.pt(th, dr);
      pin(p.x, p.y, rad, '#eaf6f7');
    }
    for (let n = 0; n < 26; n++) {
      const sgn = rp.sign(), th = sgn * rp.range(0.25, span), dr = 40 + rp() * 560;
      const p = a.pt(th, dr);
      pin(p.x, p.y, rp.range(1.6, 4.4), '#f2dcec');
    }

    // relief: orange-peel gloss and the pits catch the key light (upper left)
    const bump = L.bumpLight(height, { angle: 45, strength: 3.4, res: 0.5 });
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5; g.drawImage(bump, -PAD, -PAD); g.restore();

    // the fold itself, crisp: shaded foot of the wall above, the pooled moon-white lip below, a hairline of specular on it
    g.save();
    g.strokeStyle = 'rgba(74,10,52,0.42)'; g.lineWidth = 5; a.stroke(g, 2.6);
    g.strokeStyle = 'rgba(238,247,247,0.9)'; g.lineWidth = 4.4; a.stroke(g, -2.2);
    g.strokeStyle = L.linear(g, 0, 0, W, 0, [[0, 'rgba(255,255,255,0.55)'], [0.3, 'rgba(255,255,255,1)'], [0.62, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0.35)']]);
    g.lineWidth = 1.8; a.stroke(g, -3.2);
    g.restore();
  });
  return layer;
}

/** pale wisps that slide down the wall toward the fold during the shot (sides only, fading out before the fold) */
function buildWisps(env) {
  const a = env.arc;
  const wisps = L.polarNoiseLayer(env, PAD, { seed: 's17flow', scale: 25, sx: 1, sy: 34, octaves: 2, res: 0.4, contrast: 2.2,
    ramp: [[0, 'rgba(176,218,240,0)'], [0.68, 'rgba(176,218,240,0)'], [0.84, 'rgba(190,226,243,0.36)'], [1, 'rgba(232,245,249,0.7)']] });
  const mask = L.makeLayer(PAD, (g) => {
    g.fillStyle = L.linear(g, 0, 0, W, 0, [[0, '#000'], [0.2, '#000'], [0.34, 'rgba(0,0,0,0)'], [0.66, 'rgba(0,0,0,0)'], [0.8, '#000'], [1, '#000']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R + 4, a.R + 70, [[0, '#000'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
  });
  const g = wisps.getContext('2d');
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return wisps;
}

function sheen(ctx, x, y, rx, ry, ang, color, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1, ry / rx);
  ctx.fillStyle = L.radial(ctx, 0, 0, 0, rx, [[0, L.rgba(color, alpha)], [0.4, L.rgba(color, alpha * 0.55)], [1, L.rgba(color, 0)]]);
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/** gloss: reflections of the key light. They belong to the light, not the glaze, so they are blitted with their own motion. */
function buildGloss(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    // the concave wall mirrors the light as a soft band concentric with the fold (kept above the tagline zone), brightest upper left
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R + 268, a.R + 600, [[0, 'rgba(255,224,240,0)'], [0.22, 'rgba(255,224,240,0.1)'], [0.46, 'rgba(255,232,244,0.36)'], [0.6, 'rgba(255,232,244,0.36)'], [1, 'rgba(255,224,240,0)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = L.linear(g, -PAD, 0, W + PAD, 0, [[0, 'rgba(0,0,0,0.35)'], [0.27, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.55)'], [0.75, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0.14)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's17gl', scale: 46, sx: 1, sy: 7, octaves: 2, res: 0.25, contrast: 1.6, ramp: [[0, 'rgba(0,0,0,0.72)'], [1, 'rgba(0,0,0,1)']] }), -PAD, -PAD);
    g.globalCompositeOperation = 'source-over';
    // broad sheen lying on the pooled glaze of the well
    sheen(g, 1330, 885, 540, 150, 0.1, '#ffffff', 0.3);
    sheen(g, 1345, 880, 210, 40, 0.1, '#ffffff', 0.36);
    // a glint riding the pooled lip
    const gp = a.pt(-0.185, -4);
    g.save(); g.translate(gp.x, gp.y); g.rotate(-0.185); g.scale(1, 0.1);
    g.fillStyle = L.radial(g, 0, 0, 0, 300, [[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(-300, -300, 600, 600);
    g.restore();
  });
}

export default {
  name: '钧窑窑变',
  tone: 'light',
  init(env) {
    S = { base: buildBase(env), wisps: buildWisps(env), gloss: buildGloss(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.012, p);
    L.blit(ctx, env, S.base, { rot, zoom });
    // the flambé creeps: wisps slide a few px down the wall toward the fold
    L.cam(ctx, env, { zoom }, () => {
      L.blit(ctx, env, S.wisps, { rot: rot * 1.25, zoom: L.lerp(1.0016, 0.9984, p), pivot: { x: a.cx, y: a.cy }, alpha: 0.58 });
    });
    // gloss stays with the light while the glaze slides under it
    L.blit(ctx, env, S.gloss, { rot: -rot * 0.7, zoom, blend: 'screen' });
    L.vignette(ctx, { strength: 0.2, color: '#1a0626', inner: 0.55 });
  },
};
