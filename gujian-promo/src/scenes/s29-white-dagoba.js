// s29 — 白塔覆钵. Macro on the crown of a white dagoba's dome (覆钵): thick lime plaster rising as the arc,
// against a sunlit, out-of-focus red-ochre earth wall.
//   dome = a height-field render (height → normal → light) of hand-laid lime: broad trowel sweeps and brush tracks running
//          round the dome (concentric with the arc), the ridges where one stroke stops and the next begins, lap edges of
//          successive coats, a few big pores, a patch of craquelure. A low sun from the upper left rakes across it and a
//          soft-edged shadow falls over the right flank, so the plaster is two big shapes: warm white and deep violet-umber.
//          The terminator is ragged by the relief itself (bumps facing the sun stay lit a little way into the shadow).
//          The surface is foreshortened toward the silhouette so it reads as a swelling dome, not a flat disc.
//   back = one clean warm colour: far earth wall, completely defocused, calm behind the tagline.
//   lens = focus on the crown; the plaster softens toward the sides and the bottom of the frame, and the lit lime
//          blooms a little over the wall behind it.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 80;            // the move is only a few px of rot → a modest margin is plenty
let S = null;

// ── rounded-rim foreshortening: d = screen px below the arc, s = px along the plaster surface ──
const RS = 900, D0 = 25;
const S0 = RS * Math.acos(1 - D0 / RS);
const fore = (d) => RS * Math.acos(L.clamp(1 - (Math.max(d, 1 - D0) + D0) / RS, -1, 1)) - S0;
const unfore = (s) => RS * (1 - Math.cos((s + S0) / RS)) - D0;
const squash = (s) => Math.sin((s + S0) / RS);      // dd/ds: how flat a round mark looks at surface depth s
const TURN = 1.5;          // the dome turns away from the light faster than the arc itself

const unit = (v) => { const m = Math.hypot(...v); return v.map((c) => c / m); };
const LV = unit([-0.72, -0.62, 0.22]);     // key: low sun from the upper left, raking
const FV = unit([0.42, -0.5, 0.75]);       // fill inside the shadow: sky and wall bounce from the upper right / front

// the shadow's edge: a parabola that leaves the silhouette just right of the crown and sweeps down to the right
const SHX0 = 760, SHY0 = 500, SHA = 0.00104;

// ── allocation-free worley ──
function hash(ix, iy, k) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(k, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
let wF1 = 0, wF2 = 0, wId = 0;
function worley(x, y, k) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    const fx = cx + hash(cx, cy, k) - x, fy = cy + hash(cx, cy, k + 7) - y;
    const dd = fx * fx + fy * fy;
    if (dd < d1) { d2 = d1; d1 = dd; id = hash(cx, cy, k + 13); } else if (dd < d2) d2 = dd;
  }
  wF1 = Math.sqrt(d1); wF2 = Math.sqrt(d2); wId = id;
}

function lutOf(stops) {
  const f = L.makeRamp(stops); const lut = new Uint8ClampedArray(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = f(i / 1023); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  return lut;
}

/**
 * Slow-varying fields are evaluated on a coarse grid (every G low-res px) and bilinearly interpolated per pixel —
 * that keeps the expensive per-pixel noise budget for the detail that actually needs it.
 * fill(ix, iy, out) writes nf values for low-res pixel (ix, iy). Returns { at(ix, iy), get(k) }.
 */
function coarseFields(cw, ch, G, nf, fill) {
  const gw = Math.ceil(cw / G) + 2, gh = Math.ceil(ch / G) + 2;
  const data = new Float32Array(gw * gh * nf); const tmp = new Float32Array(nf);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { fill(gx * G, gy * G, tmp); data.set(tmp, (gy * gw + gx) * nf); }
  let o00 = 0, o10 = 0, o01 = 0, o11 = 0, w00 = 0, w10 = 0, w01 = 0, w11 = 0;
  return {
    at(ix, iy) {
      const fx = ix / G, fy = iy / G, gx = fx | 0, gy = fy | 0, tx = fx - gx, ty = fy - gy;
      o00 = (gy * gw + gx) * nf; o10 = o00 + nf; o01 = o00 + gw * nf; o11 = o01 + nf;
      w00 = (1 - tx) * (1 - ty); w10 = tx * (1 - ty); w01 = (1 - tx) * ty; w11 = tx * ty;
    },
    get(k) { return data[o00 + k] * w00 + data[o10 + k] * w10 + data[o01 + k] * w01 + data[o11 + k] * w11; },
  };
}

// ───────────────────────── the dome ─────────────────────────
function buildDome(env) {
  const a = env.arc, R = a.R, CX = a.cx, CY = a.cy;
  const RES = 0.6;
  const yTop = Math.floor(a.crestY) - 14;
  const cw = Math.ceil((W + PAD * 2) * RES), ch = Math.ceil((H + PAD - yTop) * RES);
  const n = cw * ch;
  const hgt = new Float32Array(n), occ = new Float32Array(n), alb = new Float32Array(n), warm = new Float32Array(n), flk = new Float32Array(n), rim = new Float32Array(n);
  const nmx = new Float32Array(n), nmy = new Float32Array(n), nmz = new Float32Array(n);
  const live = new Uint8Array(n);
  const nA = L.makeNoise('s29-a'), nB = L.makeNoise('s29-b'), nC = L.makeNoise('s29-c'), nD = L.makeNoise('s29-d');
  const sm = L.smooth;
  const LAPS = [[124, 2.2], [410, -2.0], [708, 2.0]];   // [surface depth, step height] of plaster-coat edges
  // ridges where one trowel stroke stops and the next one starts: they cross the sweeps and make a loose, uneven grid
  const rl = L.rng('s29-stops');
  const STOPS = [];
  for (let av = -1340; av < 1340; av += rl.range(120, 300)) {
    const s0 = rl.chance(0.45) ? -30 : rl.range(40, 430);
    STOPS.push({ a: av + rl.range(-30, 30), s0, s1: s0 + rl.range(90, 290), tilt: rl.range(-0.08, 0.08), amp: rl.range(1.9, 3.6) * (rl.chance(0.8) ? 1 : -0.7), k: STOPS.length * 3.7 + 1.3, w: rl.range(5.5, 10.5) });
  }
  const surf = (ix, iy) => {
    const ddx = -PAD + (ix + 0.5) / RES - CX, ddy = CY - (yTop + (iy + 0.5) / RES);
    return [Math.atan2(ddx, ddy) * R, fore(R - Math.sqrt(ddx * ddx + ddy * ddy))];
  };
  // coarse: 0 a-warp, 1 s-warp, 2 crack-patch field, 3 flake field, 4 shadow-edge wobble, 5 warm/cool mottling, 6-8 lap-edge depths,
  //         9 chalky lumps, 10 wander of the stroke rows
  const cf = coarseFields(cw, ch, 3, 11, (ix, iy, o) => {
    const [av, s] = surf(ix, iy);
    o[0] = 46 * nA.fbm(av / 620 + 3.1, s / 620 + 8.2, 2);
    o[1] = 26 * nA.fbm(av / 480 - 5.7, s / 480 + 1.3, 2);
    o[2] = nC.fbm(av / 760 + 11, s / 760 - 4, 2);
    o[3] = nD.fbm(av / 380 + 70, s / 380 + 33, 3);
    o[4] = nD.fbm(av / 330 + 5, s / 330 + 2.2, 2);
    o[5] = nD.fbm(av / 400 + 1, s / 400 + 2, 3);
    for (let k = 0; k < 3; k++) o[6 + k] = LAPS[k][0] + 70 * nA.n2(av / 900 + k * 31.7, k * 5.3) + 9 * nA.n2(av / 150 + k * 7.1, 9.9);
    o[9] = 0.75 * nC.fbm(av / 92, s / 92, 3);
    o[10] = 22 * nA.n2((av + o[0]) / 1100 + 2.2, (s + o[1]) / 420 + 0.7);
  });
  const wob = new Float32Array(n);

  for (let iy = 0; iy < ch; iy++) {
    const y = yTop + (iy + 0.5) / RES;
    for (let ix = 0; ix < cw; ix++) {
      const x = -PAD + (ix + 0.5) / RES;
      const ddx = x - CX, ddy = CY - y;
      const rr = Math.sqrt(ddx * ddx + ddy * ddy);
      const d = R - rr;
      if (d < -9) continue;
      const i = iy * cw + ix;
      live[i] = 1;
      const th = Math.atan2(ddx, ddy);
      const av = th * R;                        // px along the arc
      const s = fore(d);                        // px down the surface
      // macro normal of the swelling dome
      const nr = L.clamp(1 - (Math.max(d, 0) + D0) / RS, -1, 1);
      const mx = nr * Math.sin(th * TURN), my = -nr * Math.cos(th * TURN), mz = Math.sqrt(1 - nr * nr);
      nmx[i] = mx; nmy[i] = my; nmz[i] = mz;
      // the plaster's edge catches the light
      rim[i] = Math.exp(-Math.max(d, 0) / 6);
      cf.at(ix, iy);
      wob[i] = cf.get(4);
      // slow warp so no stroke is perfectly concentric
      const a2 = av + cf.get(0), s2 = s + cf.get(1);
      let h = 0;
      // trowel sweeps: long, straight, shallow swells running round the dome
      h += 2.0 * nA.fbm(a2 / 1700, s2 / 56, 2);
      // raised lips left by the trowel's edge
      const rg = nB.ridged(a2 / 2300 + 3.7, s2 / 92 + 1.9, 2);
      h += 2.1 * rg * rg * rg * rg;
      // rows of overlapping strokes: each climbs gently and drops off its lower edge, so the low sun leaves a thin shadow under it
      const bq = (s2 + cf.get(10)) / 62;
      const bi = Math.floor(bq), bf = bq - bi;
      const up = sm(bf / 0.86);
      const rowOn = 0.5 + 0.5 * nA.n2(a2 / 520 + bi * 7.3, 1.1);                // a stroke starts, thins out, stops
      h += (0.8 + 2.1 * hash(bi, 3, 5)) * rowOn * up * up * (1 - sm((bf - 0.88) / 0.12));
      alb[i] = (hash(bi, 9, 2) - 0.5) * (0.4 + 0.6 * rowOn) * sm(bf / 0.2) * (1 - sm((bf - 0.8) / 0.2));
      // bristle tracks of the limewash brush (faded out where the rim squeezes them below a pixel or two)
      h += 0.7 * sm((squash(s) - 0.25) / 0.25) * nB.fbm(a2 / 1150, s2 / 13, 2);
      // chalky lumps and sand
      h += cf.get(9);
      h += 0.3 * nC.fbm(av / 33 + 13, s / 33 + 5, 2);
      // edges where one coat of plaster laps over the last
      for (let k = 0; k < 3; k++) h += LAPS[k][1] * sm((s2 - cf.get(6 + k)) / 7 + 0.5);
      // stroke stops
      for (let k = 0; k < STOPS.length; k++) {
        const q = STOPS[k]; const da0 = a2 - q.a;
        if (da0 > 122 || da0 < -84 || s2 < q.s0 - 30 || s2 > q.s1 + 4) continue;
        const da = da0 - q.tilt * (s2 - q.s0) - 4 * nB.n2(s2 / 80, q.k);
        const fade = sm((s2 - q.s0) / 30 + 1) * sm((q.s1 - s2) / 50);
        h += q.amp * fade * (Math.exp(-(da * da) / (q.w * q.w)) + 0.42 * sm(da / (q.w * 2.5) + 0.5) * (1 - sm((da - 14) / 50)));
      }
      // craquelure (龟裂): a patch or two of plates bounded by wavering cracks
      const cm = sm((cf.get(2) - 0.3) / 0.24);
      let crack = 0;
      if (cm > 0.01) {
        const a3 = a2 + 26 * nC.n2(av / 110 + 9, s / 110) + 7 * nC.n2(av / 30, s / 30 + 4);
        const s3 = s2 + 26 * nC.n2(av / 110 + 50, s / 110 + 20) + 7 * nC.n2(av / 30 + 30, s / 30);
        worley(a3 / 176, s3 / 176, 3);
        crack = (1 - sm((wF2 - wF1) / 0.05)) * cm;
        h += 0.8 * (wId - 0.5) * cm - 2.3 * crack;
      }
      // pores / air holes: few, and big enough to read
      worley(av / 84 + 100, s / 84 + 50, 21);
      let pit = 0;
      if (wId > 0.5) {
        const t = (wId - 0.5) / 0.5; const pr = 0.028 + 0.105 * t * t * t;
        pit = 1 - sm((wF1 - pr * 0.45) / (pr * 0.55));
        h -= 3.8 * pit;
      }
      // a few places where the top coat has flaked off
      const fl = sm((cf.get(3) - 0.47) / 0.11);
      h -= 1.1 * fl;
      hgt[i] = h; flk[i] = fl;
      occ[i] = Math.max(crack * 0.5, pit);
      warm[i] = sm(cf.get(5) * 1.4 + 0.5);
    }
  }

  // shade twice — in the sun (lime white) and in the shadow (violet umber) — plus the mask that joins them
  const litLut = lutOf([[0, '#473f49'], [0.25, '#8c848b'], [0.45, '#bdb6b2'], [0.58, '#d9d2c8'], [0.7, '#efe9dd'], [0.8, '#f9f5eb'], [0.9, '#fefcf5'], [1, '#ffffff']]);
  const shdLut = lutOf([[0, '#1c151b'], [0.3, '#3c3039'], [0.5, '#51434e'], [0.7, '#685963'], [1, '#90818a']]);
  const iL = new ImageData(cw, ch), iS = new ImageData(cw, ch), iM = new ImageData(cw, ch);
  const pL = iL.data, pS = iS.data, pM = iM.data;
  const K = 1.7 * RES * 0.5;
  for (let iy = 0; iy < ch; iy++) {
    const y = yTop + (iy + 0.5) / RES;
    for (let ix = 0; ix < cw; ix++) {
      const i = iy * cw + ix;
      if (!live[i]) continue;
      const x = -PAD + (ix + 0.5) / RES;
      const il = ix > 0 && live[i - 1] ? i - 1 : i, ir = ix < cw - 1 && live[i + 1] ? i + 1 : i;
      const iu = iy > 0 && live[i - cw] ? i - cw : i, id = iy < ch - 1 && live[i + cw] ? i + cw : i;
      const hx = (hgt[ir] - hgt[il]) * K * (ir - il === 2 ? 1 : 2), hy = (hgt[id] - hgt[iu]) * K * (id - iu === 2 * cw ? 1 : 2);
      const mx = nmx[i], my = nmy[i], mz = nmz[i];
      const nx = mx - hx, ny = my - hy;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + mz * mz);
      const vm = mx * LV[0] + my * LV[1] + mz * LV[2];
      const dl = (nx * LV[0] + ny * LV[1] + mz * LV[2]) * inv - vm;          // what the relief adds to / takes from the sun
      const df = (nx * FV[0] + ny * FV[1] + mz * FV[2]) * inv - (mx * FV[0] + my * FV[1] + mz * FV[2]);
      const oc = occ[i], fl = flk[i], wm = warm[i];
      // sunlit: the dome's own turning is kept gentle so the lit side stays one big white shape
      let vl = 0.825 + 0.18 * (vm - 0.62) + 0.27 * Math.tanh(dl / 0.19) + 0.07 * alb[i];
      vl = vl * (1 - 0.5 * oc) - 0.035 * fl + 0.1 * rim[i] * L.clamp(vm * 1.3);
      // shadow edge
      const u = x > SHX0 ? x - SHX0 : 0;
      const gq = 2 * SHA * u;
      const t = ((y - SHY0) - SHA * u * u) / Math.sqrt(1 + gq * gq) + 12 * wob[i];
      const pw = 36 + 0.15 * Math.max(0, y - 560);
      const m = sm(0.5 + t / (2 * pw) + 0.38 * L.clamp(dl, -0.4, 0.4));
      const wt = 1 - sm(t / (pw * 2.3));                                       // the last of the sun before the shadow is warmer
      // in shadow: soft fill, deepest well away from the edge
      const sv = 0.5 + 0.85 * df + 0.04 * alb[i] - 0.26 * oc - 0.03 * fl - 0.1 * sm((-t - 40) / 520) + 0.1 * sm((y - 640) / 480) + 0.13 * rim[i];
      const li = (L.clamp(vl) * 1023) | 0, si = (L.clamp(sv) * 1023) | 0;
      const tr = 1 - 0.03 * fl, tg = (1 - 0.012 * wm) * (1 - 0.05 * fl) * (1 - 0.055 * wt), tb = (1 - 0.045 * wm) * (1 - 0.065 * fl) * (1 - 0.15 * wt);
      const o = i * 4;
      pL[o] = litLut[li * 3] * tr; pL[o + 1] = litLut[li * 3 + 1] * tg; pL[o + 2] = litLut[li * 3 + 2] * tb; pL[o + 3] = 255;
      pS[o] = shdLut[si * 3]; pS[o + 1] = shdLut[si * 3 + 1]; pS[o + 2] = shdLut[si * 3 + 2]; pS[o + 3] = 255;
      pM[o] = pM[o + 1] = pM[o + 2] = 255; pM[o + 3] = m * 255;
    }
  }
  const put = (img) => { const c = L.makeCanvas(cw, ch); c.getContext('2d').putImageData(img, 0, 0); return c; };
  const cLit = put(iL), cShd = put(iS), cMask = put(iM);

  const sMax = fore(R - (CY - (H + PAD))) + 6;
  const aMax = a.span(PAD + 110) * R;
  const toXY = (av, s) => a.pt(av / R, -unfore(s));

  // silhouette: the arc itself, with the faintest lumpiness of hand-laid plaster (never above the arc, at most ~2 px below)
  const clipSilhouette = (g) => {
    const nz = L.makeNoise('s29-rim');
    g.beginPath();
    const sp = a.span(PAD + 140);
    for (let k = 0; k <= 520; k++) {
      const th = L.lerp(-sp, sp, k / 520);
      const dr = -0.9 + 0.9 * nz.n2(th * R / 36, 1.7) - 1.3 * L.smooth((nz.n2(th * R / 140, 6.1) - 0.55) / 0.2);
      const p = a.pt(th, dr);
      if (k === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    }
    g.lineTo(W + PAD + 400, H + PAD + 50); g.lineTo(-PAD - 400, H + PAD + 50); g.closePath(); g.clip();
  };

  // rain tears (泪痕): a few pale cool bands running straight downhill, soft-edged, well away from the crown
  const tears = L.makeLayer(PAD, (t) => {
    t.lineCap = 'round';
    const rt = L.rng('s29-tears');
    const nt = L.makeNoise('s29-tears');
    for (let k = 0; k < 9; k++) {
      const zone = rt.pick([-980, -640, -420, 470, 640]);
      const av0 = zone + rt.gauss() * 70, sA = rt.range(150, sMax * 0.4), len = rt.range(300, 760), wid = rt.range(7, 18);
      const str = rt.range(0.45, 1);
      const rivs = rt.int(1, 2);
      for (let q = 0; q < rivs; q++) {
        const off = q === 0 ? 0 : rt.range(-wid * 1.3, wid * 1.3), l2 = len * (q === 0 ? 1 : rt.range(0.4, 0.9)), w2 = wid * (q === 0 ? 1 : rt.range(0.3, 0.6));
        const segs = Math.ceil(l2 / 9);
        for (let j = 0; j < segs; j++) {
          const u0 = j / segs, u1 = (j + 1) / segs;
          const wob0 = 5 * nt.n2(k * 3.1 + q, u0 * l2 / 170), wob1 = 5 * nt.n2(k * 3.1 + q, u1 * l2 / 170);
          const p0 = toXY(av0 + off + wob0, sA + l2 * u0), p1 = toXY(av0 + off + wob1, sA + l2 * u1);
          const um = (u0 + u1) / 2;
          const al = str * Math.min(1, um / 0.06) * Math.pow(1 - um, 1.6) * (0.7 + 0.3 * nt.n2(k * 7.7, um * 6));
          t.strokeStyle = `rgba(122,122,144,${(0.22 * al).toFixed(3)})`;
          t.lineWidth = w2 * (0.5 + 0.6 * Math.sqrt(um));
          t.beginPath(); t.moveTo(p0.x, p0.y); t.lineTo(p1.x, p1.y); t.stroke();
        }
      }
    }
  });
  const tearsSoft = L.blurred(tears, 4);

  // ── crisp full-resolution detail on top of the soft height-field render (same marks in sun and in shadow, two palettes) ──
  const details = (g, lit) => {
    const P = lit
      ? { hl: '255,254,250', hd: '126,118,122', hla: 1, hda: 1, pore: '70,62,66', lip: '255,254,250', lipA: 0.45, core: 'rgba(60,52,56,0.88)', shade: 'rgba(132,124,126,0.5)', far: 'rgba(255,253,246,0.62)' }
      : { hl: '138,122,134', hd: '28,21,28', hla: 0.5, hda: 1.4, pore: '26,19,26', lip: '132,116,128', lipA: 0.35, core: 'rgba(24,17,25,0.62)', shade: 'rgba(40,31,40,0.3)', far: 'rgba(128,112,124,0.3)' };
    const r = L.rng('s29-detail');
    // bristle tracks, in bundles like the passes of a wide brush
    g.lineCap = 'round';
    for (let b = 0; b < 150; b++) {
      const s0 = r.range(1, sMax), a0 = r.range(-aMax, aMax), len = r.range(180, 900), spread = r.range(8, 34);
      const tilt = r.range(-0.05, 0.05), bow = r.range(-10, 10), hairs = r.int(3, 9);
      for (let k = 0; k < hairs; k++) {
        const so = s0 + r.range(-spread, spread), ao = a0 + r.range(-60, 60), ln = len * r.range(0.5, 1.1);
        const light = r.chance(0.64);
        g.strokeStyle = light ? `rgba(${P.hl},${(r.range(0.08, 0.24) * P.hla).toFixed(3)})` : `rgba(${P.hd},${(r.range(0.03, 0.09) * P.hda).toFixed(3)})`;
        g.lineWidth = Math.max(0.6, r.range(1.0, 2.6) * Math.sqrt(squash(Math.max(0, so))));
        g.beginPath();
        const segs = Math.max(4, Math.round(ln / 18));
        for (let j = 0; j <= segs; j++) {
          const u = j / segs;
          const p = toXY(ao + ln * u, Math.max(0.5, so + tilt * ln * (u - 0.5) + bow * Math.sin(u * Math.PI)));
          if (j === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        }
        g.stroke();
      }
    }
    // sand in the lime: tiny lit grains with a shadow on the far side, densest where the lens is sharpest
    for (let k = 0; k < 2600; k++) {
      const av = r.gauss() * 520, s = Math.abs(r.gauss()) * 260 + 2;
      const p = toXY(av, s), q = Math.max(0.45, squash(s)), gr = r.range(0.6, 1.5);
      g.fillStyle = `rgba(${P.hd},${(r.range(0.16, 0.4) * P.hda).toFixed(3)})`;
      g.beginPath(); g.ellipse(p.x + 0.8, p.y + 0.7, gr, gr * q, 0, 0, L.TAU); g.fill();
      g.fillStyle = `rgba(${P.hl},${(r.range(0.35, 0.8) * P.hla).toFixed(3)})`;
      g.beginPath(); g.ellipse(p.x, p.y, gr, gr * q, 0, 0, L.TAU); g.fill();
    }
    // air holes: dark core, lit lip on the lower right
    for (let k = 0; k < 74; k++) {
      const av = r.range(-aMax, aMax), s = r.range(4, sMax);
      const big = r.chance(0.1);
      const rad = big ? r.range(5, 8.5) : 1.3 + 3.6 * Math.pow(r(), 2.4), q = Math.max(0.5, squash(s)), th = av / R;
      if (!big && nD.n2(av / 260 + 3, s / 260 + 8) < 0.05) { r(); continue; }      // they come in clusters, not an even sprinkle
      const p = toXY(av, s);
      const al = big ? r.range(0.7, 0.92) : r.range(0.35, 0.8);
      g.save(); g.translate(p.x, p.y); g.rotate(th);
      const ox = 0.9 * (Math.cos(th) + Math.sin(th)), oy = 0.9 * (Math.cos(th) - Math.sin(th));   // screen (+.9,+.9) in the local frame
      g.fillStyle = `rgba(${P.pore},${(al * 0.08).toFixed(3)})`;
      g.beginPath(); g.ellipse(-0.4, -0.4 * q, rad * 1.7, Math.max(0.6, rad * 1.7 * q), 0, 0, L.TAU); g.fill();
      g.fillStyle = `rgba(${P.lip},${(al * P.lipA).toFixed(3)})`;
      g.beginPath(); g.ellipse(ox, oy * q, rad + 0.4, Math.max(0.5, (rad + 0.4) * q), 0, 0, L.TAU); g.fill();
      g.fillStyle = `rgba(${P.pore},${al.toFixed(3)})`;
      const lobes = rad > 2.2 ? r.int(2, 3) : 1;
      for (let j = 0; j < lobes; j++) {
        const lx = j ? r.range(-0.6, 0.6) * rad : 0, ly = j ? r.range(-0.5, 0.5) * rad * q : 0, lr = j ? rad * r.range(0.5, 0.85) : rad;
        g.beginPath(); g.ellipse(lx, ly, lr * r.range(0.85, 1.25), Math.max(0.5, lr * q * r.range(0.8, 1.1)), r.range(-0.5, 0.5), 0, L.TAU); g.fill();
      }
      if (r.chance(0.3)) {                                                   // grit dragged by the trowel leaves a short groove
        const tl = rad * r.range(3, 7) * r.sign();
        g.globalAlpha = 0.55;
        g.beginPath(); g.moveTo(0, -rad * 0.55 * q); g.quadraticCurveTo(tl * 0.5, -rad * 0.2 * q, tl, r.range(-1, 1)); g.quadraticCurveTo(tl * 0.5, rad * 0.4 * q, 0, rad * 0.55 * q); g.fill();
        g.globalAlpha = 1;
      }
      g.restore();
    }
    // a few long cracks wandering downhill: jagged, with short forks; dark core, shadowed near edge, lit far edge
    const rc = L.rng('s29-cracks');
    const crackRun = (av, s, dir, len, w, depth) => {
      const pts = [[av, s]];
      const STEP = 7, steps = Math.round(len / STEP);
      const kids = [];
      for (let k = 0; k < steps; k++) {
        const kink = rc.chance(0.1);
        dir += kink ? rc.sign() * rc.range(0.5, 1.0) : rc.range(-0.2, 0.2);
        dir = L.lerp(dir, Math.PI / 2, 0.07);
        av += Math.cos(dir) * STEP + rc.range(-1.8, 1.8); s += Math.sin(dir) * STEP + rc.range(-1.8, 1.8);
        if (s < 1.5) break;
        pts.push([av, s]);
        if (depth < 1 && kink && rc.chance(0.35)) kids.push([av, s, dir + rc.sign() * rc.range(1.0, 1.7), len * rc.range(0.12, 0.28), w * 0.7, depth + 1]);
      }
      const m = pts.length;
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let k = 1; k < m; k++) {
        const u = k / m, p0 = toXY(pts[k - 1][0], pts[k - 1][1]), p1 = toXY(pts[k][0], pts[k][1]);
        const lw = Math.max(0.9, w * (1 - 0.55 * u * u) * rc.range(0.6, 1.3));
        g.strokeStyle = P.far; g.lineWidth = lw;
        g.beginPath(); g.moveTo(p0.x + 1.5, p0.y + 1.3); g.lineTo(p1.x + 1.5, p1.y + 1.3); g.stroke();
        g.strokeStyle = P.shade; g.lineWidth = lw + 1.8;
        g.beginPath(); g.moveTo(p0.x - 0.6, p0.y - 0.6); g.lineTo(p1.x - 0.6, p1.y - 0.6); g.stroke();
        g.strokeStyle = P.core; g.lineWidth = lw;
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      }
      kids.forEach((c) => crackRun(...c));
    };
    [[650, 120, 2.0, 310, 3.2], [1050, 60, 1.3, 220, 2.6]]
      .forEach(([av, s, dir, len, w]) => crackRun(av, s, dir, len, w, 0));
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = lit ? 0.8 : 0.5;
    g.drawImage(tearsSoft, -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  };

  const render = (small, lit) => L.makeLayer(PAD, (g) => {
    g.save();
    clipSilhouette(g);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small, -PAD, yTop, cw / RES, ch / RES);
    details(g, lit);
    g.restore();
  });
  const dome = render(cShd, false);
  const sun = render(cLit, true);
  // keep the sunlit version only where the sun reaches, and lay it over the shadowed one
  const sg = sun.getContext('2d');
  sg.save(); sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.globalCompositeOperation = 'destination-in';
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
  sg.drawImage(cMask, 0, yTop + PAD, cw / RES, ch / RES);
  sg.restore();
  const dg = dome.getContext('2d');
  dg.setTransform(1, 0, 0, 1, 0, 0);
  dg.drawImage(sun, 0, 0);

  // ── lens: focus sits on the crown; the plaster softens toward the sides and (more) toward the bottom of the frame ──
  const focusMask = (r0, r1) => {
    const c = L.makeCanvas(dome.width, dome.height); const g = c.getContext('2d');
    const RY = 560;
    g.translate(PAD + a.cx, PAD + a.crestY + 30); g.scale(1560 / RY, 1);
    g.fillStyle = L.radial(g, 0, 0, r0 * RY, r1 * RY, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']]);
    g.fillRect(-3000, -3000, 6000, 6000);
    return c;
  };
  const soft = [[1.6, 0.34, 0.8], [3.4, 0.74, 1.3]].map(([px, r0, r1]) => {
    const b = L.blurred(dome, px); const bg = b.getContext('2d');
    bg.globalCompositeOperation = 'destination-in'; bg.drawImage(focusMask(r0, r1), 0, 0);
    return b;
  });
  soft.forEach((b) => dg.drawImage(b, 0, 0));
  // fine tooth of the lime (only where there is plaster)
  L.overlayOn(dome, L.grainTex(dome.width, dome.height, { seed: 's29-g1', amount: 0.2, size: 1 }), { blend: 'overlay', alpha: 0.42 });
  // halation: the sunlit lime blooms a little over the wall behind it
  dg.globalCompositeOperation = 'destination-over'; dg.globalAlpha = 0.24;
  dg.drawImage(L.blurred(sun, 11), 0, 0);
  dg.globalCompositeOperation = 'source-over'; dg.globalAlpha = 1;
  dg.translate(PAD, PAD);
  return dome;
}

// ───────────────────────── the earth wall behind: one clean warm colour, far out of focus ─────────────────────────
function buildBack(env) {
  const a = env.arc;
  const RES = 0.25;
  const yBot = Math.ceil(a.yAt(-PAD)) + 70;
  const cw = Math.ceil((W + PAD * 2) * RES), ch = Math.ceil((yBot + PAD) * RES);
  const hgt = new Float32Array(cw * ch), tone = new Float32Array(cw * ch);
  const nA = L.makeNoise('s29-bgA'), nB = L.makeNoise('s29-bgB');
  // two weathered fissures up in the corners (well clear of the tagline), blurred to soft dark veins
  const VEINS = [
    [[1430, -140], [1560, 50], [1505, 180], [1680, 300], [1840, 330], [2080, 450]],
    [[1680, 300], [1770, 170], [1920, 80], [2080, 40]],
    [[-140, 110], [100, 215], [285, 150], [410, -140]],
  ];
  const veinDist = (x, y) => {
    let best = 1e9;
    for (const v of VEINS) for (let k = 1; k < v.length; k++) {
      const x0 = v[k - 1][0], y0 = v[k - 1][1], dx = v[k][0] - x0, dy = v[k][1] - y0;
      const t = L.clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy));
      const d = Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
      if (d < best) best = d;
    }
    return best;
  };
  for (let iy = 0; iy < ch; iy++) {
    const y = -PAD + (iy + 0.5) / RES;
    for (let ix = 0; ix < cw; ix++) {
      const x = -PAD + (ix + 0.5) / RES;
      if (a.drAt(x, y) < -70) continue;                         // hidden behind the dome
      const wx = x + 90 * nA.fbm(x / 640, y / 640, 2), wy = y + 90 * nA.fbm(x / 640 + 9, y / 640 + 4, 2);
      const vd = veinDist(wx, wy);
      const vn = Math.exp(-(vd * vd) / (24 * 24)) * (0.6 + 0.4 * nB.n2(x / 170, y / 170));
      const i = iy * cw + ix;
      hgt[i] = 26 * nA.fbm(wx / 560 + 5, wy / 560, 3) + 20 * nA.ridged(wx / 900 + 7.7, wy / 1250 + 1.1, 2) + 7 * nB.fbm(x / 120, y / 120, 2) - 24 * vn;
      tone[i] = 0.5 * nB.fbm(x / 430 + 11, y / 430 + 3, 3) + 0.22 * nB.fbm(x / 130, y / 130, 2) - 1.1 * vn;
    }
  }
  const lut = lutOf([[0, '#4f1f0c'], [0.25, '#7d3616'], [0.5, '#a95122'], [0.75, '#cc702f'], [1, '#e89246']]);
  const img = new ImageData(cw, ch); const px = img.data;
  const K = 0.22 * RES * 0.5;
  for (let iy = 0; iy < ch; iy++) {
    const y = -PAD + (iy + 0.5) / RES;
    for (let ix = 0; ix < cw; ix++) {
      const x = -PAD + (ix + 0.5) / RES;
      const i = iy * cw + ix;
      const il = ix > 0 ? i - 1 : i, ir = ix < cw - 1 ? i + 1 : i, iu = iy > 0 ? i - cw : i, id = iy < ch - 1 ? i + cw : i;
      const hx = (hgt[ir] - hgt[il]) * K, hy = (hgt[id] - hgt[iu]) * K;
      // calm zone behind the tagline
      const ox = Math.max(0, Math.abs(x - 960) - 380), oy = Math.max(0, Math.abs(y - 410) - 160);
      const calm = L.lerp(0.25, 1, L.smooth(Math.hypot(ox, oy) / 300));
      // a touch more light toward the right (behind the shadowed flank), a touch less at the very top
      const base = 0.455 + 0.085 * L.smooth((x - 300) / 1500) - 0.05 * L.smooth((240 - y) / 420);
      const v = base + calm * ((hx * 0.8 + hy * 0.5) + 0.2 * tone[i]);
      const li = (L.clamp(v) * 1023) | 0;
      const o = i * 4;
      px[o] = lut[li * 3]; px[o + 1] = lut[li * 3 + 1]; px[o + 2] = lut[li * 3 + 2]; px[o + 3] = 255;
    }
  }
  const small = L.makeCanvas(cw, ch);
  small.getContext('2d').putImageData(img, 0, 0);
  const soft = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#a95122'; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small, -PAD, -PAD, cw / RES, ch / RES);
  });
  const out = L.blurred(soft, 8);
  const g = out.getContext('2d');
  // the grain of the film stays sharp even where the wall is not
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.4;
  g.drawImage(L.grainTex(out.width, out.height, { seed: 's29-bg1', amount: 0.2, size: 1 }), 0, 0);
  g.globalAlpha = 0.3;
  g.drawImage(L.grainTex(out.width, out.height, { seed: 's29-bg2', amount: 0.2, size: 2 }), 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return out;
}

export default {
  name: '白塔覆钵',
  tone: 'light',
  init(env) {
    S = { dome: buildDome(env), back: buildBack(env) };
  },
  draw(ctx, env, p) {
    // the plaster slides a few px round the dome; the far wall barely moves
    const rot = L.lerp(-0.006, 0.006, p);
    L.blit(ctx, env, S.back, { rot: rot * 0.35, zoom: L.lerp(1.0, 1.012, p) });
    L.blit(ctx, env, S.dome, { rot });
  },
};
