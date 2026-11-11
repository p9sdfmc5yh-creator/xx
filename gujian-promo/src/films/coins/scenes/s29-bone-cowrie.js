// s29 — 出土骨贝. Extreme macro of a bone cowrie (骨贝: animal bone ground into the shape of a sea cowrie) lying
// half-buried in loess. The arc is the swelling outline of its back.
// Below the arc: the ground bone face — bone-white, covered in fine grinding lines that follow the arc, pin-hole pores,
// loess packed into every cut. Straight down from the crest runs the carved slot with its short saw-cut "teeth" on both
// sides (the imitation of a cowrie's mouth); to the left a drilled hole for the cord. Lit from the upper left; the right
// third falls into warm brown shadow, and the earth it lies in banks up over the two lower corners.
// Above the arc: the ochre loess wall of the excavation square — coarse grains, a few mud cracks stained burnt red, a few
// white chips — with a dark crevice shadow hugging the bone. Directly over the crest the earth is kept calm for the tagline.
//
// Both materials are shaded per pixel in init() from height fields (px): surface normal → raking key light from the upper
// left, a short ray-march toward the light for cast shadows, then an illumination → colour ramp per material (so shadows turn
// warm brown instead of grey). No lettering anywhere.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 72;
const IMAX = 1.6, NL = 1024;
let S = null;

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hash2 = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ── allocation-free worley (squared distances in cD1/cD2, two randoms of the nearest point in cId/cId2).
//    per > 0 makes the pattern repeat every `per` cells (for pre-baked tiles) ──
let cD1 = 0, cD2 = 0, cId = 0, cId2 = 0;
function cell(x, y, per = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, hh = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const px = xi + ox, py = yi + oy;
    let h = per ? (Math.imul(((px % per) + per) % per, 374761393) + Math.imul(((py % per) + per) % per, 668265263)) | 0 : (Math.imul(px, 374761393) + Math.imul(py, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const dx = px + (h & 1023) / 1023 - x, dy = py + ((h >>> 10) & 1023) / 1023 - y, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; hh = h; } else if (d < d2) d2 = d;
  }
  cD1 = d1; cD2 = d2; cId = ((hh >>> 20) & 63) / 63; cId2 = ((hh >>> 26) & 63) / 63;
}

// illumination (0..IMAX) → colour tables
function lut(stops) {
  const f = L.makeRamp(stops.map(([t, c]) => [t / IMAX, c])); const out = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) { const c = f(i / (NL - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
const BONE_STOPS = [[0, '#2a170a'], [0.16, '#553519'], [0.34, '#8a6238'], [0.5, '#b39468'], [0.66, '#cfbb97'], [0.82, '#e3d8bf'], [1, '#efe9da'], [1.2, '#f8f4e8'], [1.6, '#fffdf7']];
const SOIL_STOPS = [[0, '#170b04'], [0.2, '#3b220e'], [0.45, '#6f4a26'], [0.72, '#a6722d'], [1, '#c48d3a'], [1.25, '#e0aa4a'], [1.6, '#f5cf7e']];
const RED_STOPS = [[0, '#1c0804'], [0.2, '#48160a'], [0.45, '#7c2a13'], [0.72, '#a23a1e'], [1, '#b4431f'], [1.25, '#c4552a'], [1.6, '#d87646']];

// key light: from the upper left, ~40° above the surface
const LX = -0.52, LY = -0.56, LZ = 0.645;          // unit vector toward the light
const SLX = -0.68, SLY = -0.733, TANE = 0.844;      // its screen direction, and the height gained per px along it
const HX = -0.287, HY = -0.309, HZ = 0.907;         // half vector (viewer straight on)
const STEPS = [2, 4, 7, 11, 16, 23, 32, 44];
const SDX = STEPS.map((s) => Math.round(SLX * s)), SDY = STEPS.map((s) => Math.round(SLY * s));
const SREQ = STEPS.map((s) => s * TANE), SINV = STEPS.map((s) => 1 / (0.7 + s * 0.12));
let lRel = 0, lSh = 0, lSpec = 0;
/** light a height-field pixel: lRel = diffuse relative to a flat surface, lSh = cast shadow 0..1, lSpec = sheen */
function light(Hh, RW, RH, i, j, far) {
  const k = j * RW + i, h0 = Hh[k];
  const gx = (Hh[k + (i < RW - 1 ? 1 : 0)] - Hh[k - (i > 0 ? 1 : 0)]) * 0.5;
  const gy = (Hh[k + (j < RH - 1 ? RW : 0)] - Hh[k - (j > 0 ? RW : 0)]) * 0.5;
  const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
  const nx = -gx * inv, ny = -gy * inv;
  const d = nx * LX + ny * LY + inv * LZ;
  lRel = d > 0 ? d / LZ : 0;
  const s = nx * HX + ny * HY + inv * HZ;
  lSpec = s > 0.93 ? Math.pow(s, 48) : 0;
  let sh = 0;
  for (let n = 0; n < far; n++) {
    const xi = i + SDX[n], yj = j + SDY[n];
    if (xi < 0 || yj < 0) break;
    const o = (Hh[yj * RW + xi] - h0 - SREQ[n]) * SINV[n];
    if (o > sh) sh = o;
  }
  lSh = sh > 1 ? 1 : sh;
}

function coarse(RW, RH, CS) {
  const cw = Math.ceil(RW / CS) + 2, ch = Math.ceil(RH / CS) + 2;
  const mk = () => new Float32Array(cw * ch);
  const bil = (src, i, j) => {
    const fx = i / CS, fy = j / CS, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = j0 * cw + i0;
    const a0 = src[k], a1 = src[k + 1], b0 = src[k + cw], b1 = src[k + cw + 1];
    return (a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty;
  };
  return { cw, ch, mk, bil };
}

// the carved slot, its teeth and the drilled hole (U = px along the arc from the crest, V = px below the arc)
const SLOT_HALF = 23, SLOT_WALL = 18, SLOT_DEPTH = 28;
const T0 = 80, TP = 52, NT = 14;
const HOLE = { U: -420, V: 236, r: 58, bevel: 22 };

/** the bone: everything below the arc */
function buildBone(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 3;
  const RW = W + PAD * 2, RH = H + PAD - Y0, N = RW * RH;
  const nA = L.makeNoise('s29a'), nB = L.makeNoise('s29b');
  const BONE = lut(BONE_STOPS), SOIL = lut(SOIL_STOPS);

  // teeth: hand-sawn V cuts, a little uneven
  const rt = L.rng('s29teeth'), teeth = [[], []];
  for (let s = 0; s < 2; s++) for (let k = 0; k < NT; k++) {
    const v = T0 + TP * k + rt.range(-7, 7) + (s ? 13 : 0);
    teeth[s].push({ v, len: rt.range(74, 108) * (0.6 + 0.4 * sstep(70, 260, v)), hw: rt.range(10, 14), depth: rt.range(11, 15), tilt: rt.range(-0.09, 0.09), curve: rt.range(-0.0006, 0.0006) });
  }

  // slow fields on a coarse polar grid
  const CS = 4, cg = coarse(RW, RH, CS);
  const cPatch = cg.mk(), cIvory = cg.mk(), cCrust = cg.mk(), cPore = cg.mk(), cDust = cg.mk();
  for (let j = 0; j < cg.ch; j++) for (let i = 0; i < cg.cw; i++) {
    const ddx = X0 + i * CS - cx, ddy = cy - (Y0 + j * CS), rr = Math.sqrt(ddx * ddx + ddy * ddy);
    const U = Math.atan2(ddx, ddy) * rr, V = R - rr, k = j * cg.cw + i;
    cPatch[k] = nA.fbm(U / 420, V / 300, 2);
    cIvory[k] = nA.fbm(U / 520 + 9, V / 260 - 4, 3);
    cCrust[k] = nB.fbm(U / 190 + 31, V / 150 + 7, 4, 2, 0.55);
    cPore[k] = nB.fbm(U / 260 - 17, V / 200 + 41, 3);
    cDust[k] = nA.fbm(U / 640 + 77, V / 80 - 23, 3);
  }

  const Hh = new Float32Array(N).fill(-120), Sm = new Float32Array(N), Yl = new Float32Array(N), Du = new Float32Array(N), Cv = new Float32Array(N);
  const Ua = new Float32Array(N), Va = new Float32Array(N);
  const In = new Uint8Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, rr = Math.sqrt(ddx * ddx + ddy * ddy);
      if (rr > R + 2) continue;
      const k = j * RW + i; In[k] = 1;
      const U = Math.atan2(ddx, ddy) * rr, V = R - rr;
      Ua[k] = U; Va[k] = V;
      const hs = hash2(i, j) - 0.5;
      // 1) grinding lines following the arc; two more families at a slight angle, in patches (the piece was turned on the stone)
      const p1 = nA.n2(U / 460, V / 2.0 + 3.3), p2 = nB.n2(U / 150 + 50, V / 3.6);
      const pa = cg.bil(cPatch, i, j), wa = sstep(-0.1, 0.35, pa), wb = sstep(-0.1, 0.35, -pa);
      let h = 0.13 * p1 + 0.2 * p2 + hs * 0.1;
      if (wa > 0.01) h += wa * 0.2 * nA.n2(U / 380 - 9, (V + 0.065 * U) / 2.4 + 60);
      if (wb > 0.01) h += wb * 0.17 * nB.n2(U / 300 + 13, (V - 0.05 * U) / 2.8 - 30);
      const q = nB.n2(U / 720 + 7, V / 6.5 + 100);
      if (q > 0.56) h -= (q - 0.56) * 3.4;                    // the odd deeper scratch
      let soil = 0, cav = 0;
      // 2) pores: pin-holes, slightly drawn out along the bone's long axis, packed with loess
      const dens = 0.09 + 0.34 * cg.bil(cPore, i, j);
      if (dens > 0.01) {
        cell(U / 10 + 5.5, V / 17 + 9.1);
        if (cId < dens) {
          const rp = 0.09 + 0.24 * cId2 * cId2, qq = cD1 / (rp * rp);
          if (qq < 1) { const f = (1 - qq) * (1 - qq); h -= 3 * f * (0.5 + cId2); soil = f * 0.8; cav = f; }
        }
      }
      // 3) the carved slot and its teeth
      if (U > -180 && U < 180 && V > 2) {
        const u = U - 5 * nA.n2(V / 150, 7.7), au = u < 0 ? -u : u, side = u < 0 ? 0 : 1;
        const grow = sstep(6, 96, V);
        const wf = (SLOT_HALF + 3.5 * nB.n2(V / 80, 3.1 + side * 9)) * grow;
        const wo = wf + 5 + (SLOT_WALL - 5) * grow + 1.0 * nA.n2(V / 13, 40 + side * 5);
        const gd = SLOT_DEPTH * sstep(4, 76, V);
        let hg = 0, sg = 0;
        if (au < wo) {
          const wall = au <= wf ? 1 : (wo - au) / (wo - wf);
          hg = -gd * wall;
          // loess packed in the bottom, lying a little unevenly
          const fill = -gd + 6 + 2.4 * nA.n2(U / 30 + 3, V / 90) + 1.1 * nB.n2(U / 11 + 70, V / 11) + 0.5 * nA.n2(U / 4.3, V / 4.3 + 9) + hs * 1.0;
          if (fill > hg) { sg = sstep(0, 2.2, fill - hg); hg = fill; }
        }
        const aa = au - wf + 4;
        if (aa > 0 && aa < 120 && V > 24) {
          const arr = teeth[side], kk = Math.round((V - T0 - (side ? 13 : 0)) / TP);
          for (let n = kk - 1; n <= kk + 1; n++) {
            if (n < 0 || n >= NT) continue;
            const t = arr[n]; if (aa >= t.len) continue;
            const f = aa / t.len, dv = Math.abs(V - (t.v + t.tilt * aa + t.curve * aa * aa));
            const hwa = t.hw * Math.sqrt(1 - f) + 0.7;
            if (dv < hwa) {
              const cut = 1 - dv / hwa, dep = t.depth * (1 - 0.5 * f);
              let ht = -dep * cut;
              const lvl = -dep * (0.62 + 0.14 * nB.n2(U / 9 + 11, V / 9 - 5)) + hs * 0.9;     // soil in the bottom of the cut
              let st = 0;
              if (ht < lvl) { st = sstep(0, 1.6, lvl - ht); ht = lvl; }
              if (ht < hg) { hg = ht; sg = st; }
            }
          }
        }
        if (hg < 0) { const keep = 1 + hg / SLOT_DEPTH; h = h * (keep < 0 ? 0 : keep) + hg; if (sg > soil) soil = sg; const cv = -hg / SLOT_DEPTH; if (cv > cav) cav = cv > 1 ? 1 : cv; }
      }
      // 4) the drilled hole: hand-drilled cone, plugged with loess
      const hu = U - HOLE.U, hv = V - HOLE.V, hd2 = hu * hu + hv * hv;
      if (hd2 < (HOLE.r + HOLE.bevel + 6) * (HOLE.r + HOLE.bevel + 6)) {
        const hd = Math.sqrt(hd2), rh = HOLE.r * (1 + 0.03 * nA.n2(Math.atan2(hv, hu) * 1.4, 5.5));
        if (hd < rh) {
          h = -46 + 6 * nA.n2(hu / 30, hv / 30 + 9) + 1.3 * nB.n2(hu / 11, hv / 11) + 0.6 * nA.n2(hu / 4.3, hv / 4.3) + hs * 1.1; soil = 1; cav = 1;
        } else if (hd < rh + HOLE.bevel) {
          const t = (rh + HOLE.bevel - hd) / HOLE.bevel;
          h = h * (1 - t) - 26 * t * (0.75 + 0.25 * t) + 0.45 * Math.sin(hd * 1.7) * t; if (t * 0.5 > cav) cav = t * 0.5;
          const sm = sstep(0.82, 1, t + 0.1 * nB.n2(hu / 6, hv / 6)) * 0.9; if (sm > soil) soil = sm;
        }
      }
      // 5) loess still clinging to the face: the earth it lies in banks up over the two lower corners, crumbs scattered
      //    around the banks, a film of dust in the grinding lines
      const dL2 = (x + 90) * (x + 90) + (y - 1170) * (y - 1170), dR2 = (x - 2010) * (x - 2010) + (y - 1150) * (y - 1150);
      const cL = dL2 < 490000 ? 1 - sstep(190, 700, Math.sqrt(dL2)) : 0, cR = dR2 < 409600 ? 1 - sstep(180, 640, Math.sqrt(dR2)) : 0;
      const cf = cg.bil(cCrust, i, j), cb = 0.95 * (cL > cR ? cL : cR) + 0.34 * cf;
      let crv = 0, crm = 0;
      if (cb > 0.08) {
        const hero = Math.max(1 - sstep(200, 400, U < 0 ? -U : U), 1 - sstep(HOLE.r + 40, HOLE.r + 170, Math.sqrt(hd2)));
        crv = cb + 0.04 * nB.n2(U / 14 + 4, V / 14) + 0.01 * hs - 0.6 * hero;
        crm = sstep(0.6, 0.67, crv);
        if (crm > 0) {
          h += crm * (5 + 10 * sstep(0.62, 1.1, crv) + 4 * nA.n2(U / 46 - 20, V / 46) + 1.2 * nB.n2(U / 11 + 70, V / 11) + 0.5 * nA.n2(U / 4.3, V / 4.3 + 9) + 0.75 * hs);
          if (crm > soil) soil = crm;
        } else if (crv > 0.05) {
          const pc = 0.01 + 0.15 * sstep(0.36, 0.6, crv) + 0.05 * sstep(0.25, 0.5, cf) * (1 - hero);
          cell(U / 21 + 1.3, V / 21 + 8.8);
          if (cId < pc) {
            const rp = 0.08 + 0.24 * cId2 * cId2, qq = cD1 / (rp * rp) * (1 + 0.5 * nB.n2(U / 4 + 9, V / 4));
            if (qq < 1) { const dome = Math.sqrt(1 - qq); h += dome * rp * 21 * 0.42 + hs * 0.8; const sm = sstep(1, 0.72, qq); if (sm > soil) soil = sm; }
          }
        }
      }
      const dv2 = cg.bil(cDust, i, j);
      Du[k] = Math.min(1, sstep(0.3, 0.6, crv) * 0.6 * (1 - crm) + sstep(0.0, 0.45, dv2) * sstep(0.15, -0.35, p2) * 0.5);
      Yl[k] = cg.bil(cIvory, i, j);
      // 6) the face rolls over into the edge
      if (V < 480) h -= 12 * Math.exp(-V / 70) + (V < 90 ? 12 * Math.exp(-V / 9) : 0);
      Hh[k] = h; Sm[k] = soil; Cv[k] = cav;
    }
  }

  // shade
  const img = new ImageData(RW, RH), d = img.data;
  const HN2 = (HOLE.r + 110) * (HOLE.r + 110);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j;
    const xt = 1235 + 0.6 * (y - 560) + 30 * Math.sin((y - 560) / 170 + 0.6);      // edge of the big shadow on this row
    for (let i = 0; i < RW; i++) {
      const k = j * RW + i; if (!In[k]) continue;
      const x = X0 + i, U = Ua[k], V = Va[k];
      const hu = U - HOLE.U, hv = V - HOLE.V;
      light(Hh, RW, RH, i, j, hu * hu + hv * hv < HN2 ? 8 : 6);
      const soil = Sm[k], cav = Cv[k];
      // the big shadow that takes the right third
      let gs = sstep(-85, 95, x - xt + 44 * cg.bil(cPatch, i, j));
      if (V < 60) gs *= 1 - 0.3 * Math.exp(-V / 12);
      const macro = 1 + 0.07 * Math.exp(-((U + 380) * (U + 380)) / 270000 - ((V - 150) * (V - 150)) / 67600) - 0.1 * sstep(260, 660, V) - 0.07 * sstep(-520, -1150, U);
      const rel = lRel + (1 - lRel) * 0.55 * gs;
      const band = 1 + 0.06 * cg.bil(cDust, i, j) * (1 - soil);          // broad soft bands of the polish
      let il = (0.3 + 0.7 * rel * (1 - 0.9 * lSh)) * macro * band * (1 - 0.7 * gs) * (1 - 0.1 * gs * sstep(1300, 1950, x)) * (1 - 0.32 * cav);
      il += lSpec * 0.26 * (1 - gs) * (1 - soil);
      let li = (il / IMAX * (NL - 1)) | 0; li = (li < 0 ? 0 : li > NL - 1 ? NL - 1 : li) * 3;
      let r = BONE[li], g = BONE[li + 1], b = BONE[li + 2];
      // ivory yellowing in slow blotches
      const yl = Yl[k]; if (yl > 0) { const t = yl * 0.55; g *= 1 - 0.04 * t; b *= 1 - 0.17 * t; } else { const t = -yl * 0.3; r *= 1 - 0.03 * t; g *= 1 - 0.02 * t; }
      // loess: dust film, then solid earth
      const du = Du[k] * 0.5;
      if (du > 0 || soil > 0) {
        let si = (il * 1.12 / IMAX * (NL - 1)) | 0; si = (si < 0 ? 0 : si > NL - 1 ? NL - 1 : si) * 3;
        if (du > 0) { r += (SOIL[si] * 1.08 - r) * du; g += (SOIL[si + 1] * 1.1 - g) * du; b += (SOIL[si + 2] * 1.15 - b) * du; }
        if (soil > 0) { r += (SOIL[si] - r) * soil; g += (SOIL[si + 1] - g) * soil; b += (SOIL[si + 2] - b) * soil; }
      }
      const o = k * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH);
  cnv.getContext('2d').putImageData(img, 0, 0);

  const toXY = (U, V) => { const rr = R - V, th = U / rr; return [cx + rr * Math.sin(th), cy - rr * Math.cos(th)]; };
  const layer = L.makeLayer(PAD, (g) => {
    g.save(); a.clipBelow(g, 0);
    g.drawImage(cnv, X0, Y0);
    // hairline drying cracks along the bone's long axis, stained with earth
    const rc = L.rng('s29crack'), nz = L.makeNoise('s29crk');
    const cracks = [[-1010, 4, 300], [-760, 60, 260], [-640, 330, 300], [-250, 250, 200], [300, 300, 320], [520, 2, 240], [760, 140, 380], [1020, 40, 300], [-900, 380, 260],
      [HOLE.U + 22, HOLE.V + HOLE.r + 14, 190], [HOLE.U - 30, HOLE.V - HOLE.r - 150, 138]];
    g.globalCompositeOperation = 'multiply'; g.lineCap = 'round'; g.lineJoin = 'round';
    cracks.forEach(([U0, V0, len], n) => {
      const pts = []; let u = U0;
      for (let v = 0; v <= len; v += 7) { u += rc.range(-1.6, 1.6) + 2.2 * nz.n2(v / 60, n * 3.1); pts.push(toXY(u, V0 + v)); }
      const run = (lw, style, dx) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); pts.forEach((p, t) => (t ? g.lineTo(p[0] + dx, p[1]) : g.moveTo(p[0] + dx, p[1]))); g.stroke(); };
      run(3.4, 'rgba(214,170,98,0.3)', 0.6); run(1.5, 'rgba(120,78,36,0.72)', 0); run(0.7, 'rgba(60,34,14,0.8)', 0);
    });
    g.restore();
  });
  // shallow depth of field: the face comes toward the lens at the bottom of frame and goes a touch soft (only that strip is blurred)
  const yb = Math.floor(a.crestY + 336), hb = H + PAD - yb;
  const near = L.makeCanvas(layer.width, hb), ng = near.getContext('2d');
  ng.filter = 'blur(3.2px)'; ng.drawImage(layer, 0, -(yb + PAD)); ng.filter = 'none';
  ng.globalCompositeOperation = 'destination-in';
  ng.fillStyle = L.radial(ng, a.cx + PAD, a.cy - yb, R - 600, R - 350, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  ng.fillRect(0, 0, near.width, hb);
  const lg = layer.getContext('2d');
  lg.save(); a.clipBelow(lg, 0); lg.drawImage(near, -PAD, yb); lg.restore();
  return layer;
}

/**
 * mud cracks (龟裂) as a few designed fissures: jagged, forking at near right angles, tapering out.
 * Returns the V-shaped cut as a byte map (RGBA, read the red channel) and a sampler for a wide soft halo around it (for staining).
 */
function fissures(RW, RH, X0, Y0) {
  const r = L.rng('s29fissure'), segs = [];
  const grow = (x, y, ang, len, w0, depth) => {
    let done = 0, a = ang;
    while (done < len) {
      const st = r.range(16, 44), t = done / len;
      a = ang + (a - ang) * 0.5 + r.range(-0.55, 0.55);
      const nx = x + Math.cos(a) * st, ny = y + Math.sin(a) * st;
      segs.push([x, y, nx, ny, w0 * Math.pow(1 - t, 0.7) + 1.2]);
      if (depth < 2 && t > 0.12 && t < 0.85 && r.chance(0.2)) grow(nx, ny, a + r.sign() * r.range(1.1, 1.7), (len - done) * r.range(0.35, 0.6), w0 * Math.pow(1 - t, 0.7) * 0.62, depth + 1);
      x = nx; y = ny; done += st;
    }
  };
  grow(-70, 185, 0.2, 560, 13, 0);
  grow(-70, 560, -0.75, 300, 9, 1);
  grow(2000, 250, Math.PI - 0.22, 560, 14, 0);
  grow(1995, 650, Math.PI + 0.55, 300, 9, 1);
  grow(640, -90, 1.05, 230, 10, 1);
  const acc = L.makeCanvas(RW, RH), ag = acc.getContext('2d', { willReadFrequently: true });
  ag.fillStyle = '#000'; ag.fillRect(0, 0, RW, RH);
  const pass = L.makeCanvas(RW, RH), pg = pass.getContext('2d');
  pg.lineCap = 'round'; pg.strokeStyle = '#fff';
  ag.globalCompositeOperation = 'lighter'; ag.globalAlpha = 0.34;
  for (const f of [1, 0.6, 0.26]) {
    pg.setTransform(1, 0, 0, 1, 0, 0); pg.clearRect(0, 0, RW, RH); pg.translate(-X0, -Y0);
    for (const [x0, y0, x1, y1, w] of segs) { pg.lineWidth = Math.max(0.8, w * f); pg.beginPath(); pg.moveTo(x0, y0); pg.lineTo(x1, y1); pg.stroke(); }
    ag.drawImage(pass, 0, 0);
  }
  // halo at quarter resolution
  const Q = 4, qw = Math.ceil(RW / Q) + 1, qh = Math.ceil(RH / Q) + 1;
  const hc = L.makeCanvas(qw, qh), hg = hc.getContext('2d', { willReadFrequently: true });
  hg.fillStyle = '#000'; hg.fillRect(0, 0, qw, qh);
  hg.filter = 'blur(6px)'; hg.drawImage(acc, 0, 0, RW / Q, RH / Q); hg.filter = 'none';
  const hd = hg.getImageData(0, 0, qw, qh).data;
  const halo = (i, j) => {
    const fx = i / Q, fy = j / Q, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0, k = (j0 * qw + i0) * 4;
    const a0 = hd[k], a1 = hd[k + 4], b0 = hd[k + qw * 4], b1 = hd[k + qw * 4 + 4];
    return ((a0 + (a1 - a0) * tx) * (1 - ty) + (b0 + (b1 - b0) * tx) * ty) / 255;
  };
  return { cut: ag.getImageData(0, 0, RW, RH).data, halo };
}

/** a 256 px repeating tile of sand: small grains (domes) at two sizes + their tone */
function sandTile() {
  const n = 256, hA = new Float32Array(n * n), hB = new Float32Array(n * n), tn = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    cell(i / 8 + 0.3, j / 8 + 0.7, 32);
    if (cId < 0.5) { const rp = 0.2 + 0.24 * cId2, q = cD1 / (rp * rp); if (q < 1) { hA[k] = Math.sqrt(1 - q); tn[k] = (cId2 - 0.5) * 0.3 * (1 - q); } }
    cell(i / 4 + 0.6, j / 4 + 0.1, 64);
    if (cId < 0.75) { const rp = 0.28 + 0.2 * cId2, q = cD1 / (rp * rp); if (q < 1) hB[k] = 0.55 * Math.sqrt(1 - q); }
  }
  return { hA, hB, tn };
}

/** the loess wall behind: everything above the arc (and a margin below it, hidden by the bone) */
function buildSoil(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = -PAD;
  const RW = W + PAD * 2, RH = Math.min(H + PAD, Math.ceil(a.yAt(-PAD)) + 44) - Y0, N = RW * RH;
  const nA = L.makeNoise('s29c'), nB = L.makeNoise('s29d');
  const SOIL = lut(SOIL_STOPS), RED = lut(RED_STOPS), BONE = lut(BONE_STOPS);
  const RIN2 = (R - 44) * (R - 44);

  const CS = 4, cg = coarse(RW, RH, CS);
  const cLump = cg.mk(), cWx = cg.mk(), cWy = cg.mk(), cRed = cg.mk(), cPale = cg.mk(), cMac = cg.mk();
  for (let j = 0; j < cg.ch; j++) for (let i = 0; i < cg.cw; i++) {
    const x = X0 + i * CS, y = Y0 + j * CS, k = j * cg.cw + i;
    cLump[k] = 30 * nA.fbm(x / 240, y / 240, 4, 2, 0.55) + 4.5 * nA.n2(x / 64 + 300, y / 64);
    cWx[k] = nB.n2(x / 170 + 5, y / 170); cWy[k] = nB.n2(x / 170 - 31, y / 170 + 19);
    cRed[k] = nA.fbm(x / 170 + 40, y / 130 - 13, 3, 2, 0.5);
    cPale[k] = nB.fbm(x / 330 - 7, y / 260 + 3, 3);
    cMac[k] = nB.fbm(x / 520 + 21, y / 520 + 77, 3);
  }
  const fis = fissures(RW, RH, X0, Y0), sand = sandTile();

  const Hh = new Float32Array(N), Tn = new Float32Array(N), Ck = new Float32Array(N), Chip = new Float32Array(N), Calm = new Float32Array(N);
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx;
      if (ddx * ddx + ddy * ddy < RIN2) continue;
      const k = j * RW + i;
      // the patch over the crest stays calm for the tagline: fine grain only (its outline wanders a little)
      const adx = ddx < 0 ? -ddx : ddx;
      let calm = 0;
      if (adx < 650 && y > 20) { const mac = cg.bil(cMac, i, j); calm = (1 - sstep(360, 600, adx + 80 * mac)) * sstep(60 + 70 * mac, 250 + 70 * mac, y); }
      const kc = 1 - calm; Calm[k] = calm;
      const hs = hash2(i, j) - 0.5, ti = ((j & 255) << 8) | (i & 255);
      let h = cg.bil(cLump, i, j) * (1 - 0.85 * calm) + 1.5 * nB.n2(x / 19, y / 19) * (1 - 0.75 * calm);
      h += (1.25 - 0.55 * calm) * sand.hA[ti] + sand.hB[ti] + 0.55 * hs;
      let tn = sand.tn[ti];
      // coarse grit and small stones
      cell((x + 14 * cg.bil(cWx, i, j)) / 34, (y + 14 * cg.bil(cWy, i, j)) / 34);
      if (cId < 0.44) {
        const rp = (0.1 + 0.3 * cId2 * cId2) * (1 - 0.72 * calm), q0 = cD1 / (rp * rp);
        if (q0 < 1.6) {
          const q = q0 * (1 + 0.45 * nB.n2(x / 6 + 3, y / 6));
          if (q < 1) { const dome = Math.sqrt(1 - q); h += dome * rp * 34 * 0.46; tn += (cId / 0.44 - 0.45) * (1 - q * q) * (0.5 + 1.4 * rp); }
        }
      }
      // mud cracks (龟裂): V-shaped cuts, so the wall facing the light catches it
      const fc = fis.cut[k * 4];
      if (fc > 0 && kc > 0.02) { const c = (fc / 255) * kc; h -= 26 * c; Ck[k] = c; }
      Hh[k] = h; Tn[k] = tn;
    }
  }
  // white chips (bone / shell crumbs): small bevelled flakes lying in the earth, each tilted its own way
  const rcp = L.rng('s29chips');
  for (const [px, py, pr] of [[1568, 124, 21], [1640, 92, 12], [1742, 158, 27], [1796, 96, 11], [1700, 226, 9], [1846, 420, 13], [232, 384, 16], [96, 232, 10], [420, 96, 11], [1480, 60, 8]]) {
    const ns = rcp.int(4, 6), rot0 = rcp.range(0, L.TAU), pl = [];
    for (let s = 0; s < ns; s++) { const an = rot0 + (s / ns) * L.TAU + rcp.range(-0.3, 0.3); pl.push([Math.cos(an), Math.sin(an) * rcp.range(0.9, 1.5), pr * rcp.range(0.62, 1)]); }
    const tx = rcp.range(-0.25, 0.25), ty = rcp.range(-0.25, 0.25), hgt = 3.5 + pr * 0.22, e0 = Math.ceil(pr * 1.3) + 3;
    for (let yy = Math.floor(py - e0); yy <= py + e0; yy++) for (let xx = Math.floor(px - e0); xx <= px + e0; xx++) {
      const i = xx - X0, j = yy - Y0; if (i < 1 || j < 1 || i >= RW - 1 || j >= RH - 1) continue;
      let e = 99; const qx = xx - px, qy = yy - py;
      for (const [nx, ny, rr] of pl) { const dd = rr - (qx * nx + qy * ny); if (dd < e) e = dd; }
      e -= 1.6 + 1.6 * nB.n2(xx / 5, yy / 5);
      if (e <= 0) continue;
      const k = j * RW + i, m = Math.min(1, e / 2.2);
      Hh[k] = Hh[k] * (1 - m) + (Hh[k] * 0.3 + hgt + tx * qx + ty * qy + 0.5 * (hash2(i, j) - 0.5)) * m; Chip[k] = Math.min(1, e / 1.2);
    }
  }

  const img = new ImageData(RW, RH), d = img.data;
  for (let j = 0; j < RH; j++) {
    const y = Y0 + j, ddy = cy - y;
    for (let i = 0; i < RW; i++) {
      const x = X0 + i, ddx = x - cx, r2 = ddx * ddx + ddy * ddy;
      if (r2 < RIN2) continue;
      const k = j * RW + i, rr = Math.sqrt(r2), dr = rr - R, th = ddx / rr;
      const mac = cg.bil(cMac, i, j), calm = Calm[k], kc = 1 - calm;
      light(Hh, RW, RH, i, j, 7);
      // raking light: bright gold at the upper left, sinking to sienna by the middle; the calm patch lies in that half-shade
      let m = L.lerp(1.26, 0.62, sstep(-80, 1020, x + 0.35 * (y - 300))) * (1 + 0.2 * mac * kc) * (x > 1300 ? L.lerp(1, 0.84, sstep(1300, 1950, x)) : 1);
      m += (0.58 - m) * calm * 0.9;
      // the crevice between bone and earth: narrow on the lit side, a broad cast shadow on the right
      let crev = 0.12;
      if (dr > 0) { const wS = L.lerp(13, 62, sstep(-0.42, 0.42, th)); crev = dr < wS * 7 ? 1 - 0.88 * Math.exp(-dr / wS) : 1; }
      const chip = Chip[k], ck = Ck[k];
      const relK = 0.72 + 0.28 * kc;            // relief reads softer in the calm patch
      const rel = 1 + (lRel - 1) * relK;
      let il = (0.26 + 0.74 * rel * (1 - 0.92 * lSh * relK)) * m * crev * (1 - 0.5 * ck);
      if (chip > 0) il *= 1 + 0.75 * chip;
      const tn = Tn[k];
      il *= 1 + 0.22 * tn;
      let li = (il / IMAX * (NL - 1)) | 0; li = (li < 0 ? 0 : li > NL - 1 ? NL - 1 : li) * 3;
      let r = SOIL[li], g = SOIL[li + 1], b = SOIL[li + 2];
      // 土红斑: burnt-red earth staining the fissures at the two sides
      if (kc > 0.02 && (x < 680 || x > 1390)) {
        const ex = x < 960 ? x - 150 : x - 1800, ey = x < 960 ? (y - 250) * 1.3 : (y - 430) * 1.2, ed = Math.sqrt(ex * ex + ey * ey);
        const rw = x < 960 ? 1 - sstep(140, 520, ed) : 0.85 * (1 - sstep(110, 400, ed));
        if (rw > 0) {
          const red = sstep(0.5, 0.76, cg.bil(cRed, i, j) * 0.5 + 0.2 + 0.22 * rw + 3 * fis.halo(i, j) + 0.05 * tn + 0.07 * nA.n2(x / 9, y / 9)) * kc * 0.9 * sstep(0, 0.3, rw);
          if (red > 0) { r += (RED[li] - r) * red; g += (RED[li + 1] - g) * red; b += (RED[li + 2] - b) * red; }
        }
      }
      // paler, dustier drifts / pale and dark grains
      const pale = sstep(0.1, 0.5, cg.bil(cPale, i, j)) * 0.22 * kc;
      if (pale > 0) { r += (236 - r) * pale * 0.5; g += (206 - g) * pale * 0.5; b += (140 - b) * pale * 0.5; }
      if (tn > 0.12) { const t = (tn - 0.12) * 0.9; r += (232 - r) * t; g += (214 - g) * t; b += (176 - b) * t; }
      if (chip > 0) { r += (BONE[li] * 0.97 - r) * chip; g += (BONE[li + 1] * 0.95 - g) * chip; b += (BONE[li + 2] * 0.9 - b) * chip; }
      const o = k * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  const cnv = L.makeCanvas(RW, RH), sg = cnv.getContext('2d');
  sg.putImageData(img, 0, 0);
  // shallow depth of field: the wall is sharp where it meets the bone and softens as it recedes toward the top of frame
  const out = L.makeCanvas(W + PAD * 2, H + PAD * 2), og = out.getContext('2d');
  out._pad = PAD;
  og.fillStyle = '#1a0d05'; og.fillRect(0, 0, out.width, out.height);
  og.drawImage(cnv, 0, 0);                                   // (keeps the outermost rows solid under the blurred copy)
  og.filter = 'blur(4.5px)'; og.drawImage(cnv, 0, 0); og.filter = 'none';
  sg.globalCompositeOperation = 'destination-in';
  sg.fillStyle = L.radial(sg, a.cx + PAD, a.cy + PAD, R + 90, R + 470, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  sg.fillRect(0, 0, RW, RH);
  og.drawImage(cnv, 0, 0);
  return out;
}

export default {
  name: '出土骨贝',
  tone: 'light',
  init(env) {
    S = { soil: buildSoil(env), bone: buildBone(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.008, 0.008, p);
    L.blit(ctx, env, S.soil, { rot: rot * 0.35, zoom: L.lerp(1.0, 1.005, p) });
    L.blit(ctx, env, S.bone, { rot, zoom: L.lerp(1.0, 1.012, p) });
    // the raking light creeps along the grinding lines
    ctx.save(); a.clipBelow(ctx, 0); ctx.globalCompositeOperation = 'soft-light';
    a.at(ctx, L.lerp(-0.23, -0.14, p), -170, () => {
      ctx.scale(4.2, 1);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 170, [[0, 'rgba(255,252,240,0.5)'], [0.5, 'rgba(255,250,235,0.2)'], [1, 'rgba(255,250,235,0)']]);
      ctx.fillRect(-180, -180, 360, 360);
    });
    ctx.restore();
    L.vignette(ctx, { strength: 0.3 });
  },
};
