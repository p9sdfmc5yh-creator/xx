// s04 — 福建土楼 (macro). The camera has pushed right in on the ring roof of a round tulou: the arc is the OUTER EAVE of the
// far half of the ring, standing dark against clean morning mist. Going inward (down the frame): the far roof slope seen at a
// grazing angle (shaded, a cool sheen on the damp tile crowns) → the ridge of tiles stacked on edge, bedded in lime → the
// sunlit inner slope, one small grey tile at a time (cover tiles ≈ 53 px wide, troughs between them full of dirt and moss) →
// the scalloped inner eave → a soft, out-of-focus glimpse of the amber timber gallery in the eave's shadow at the bottom.
//
// How it is built: the roof is modelled once as a flat "unrolled" strip (x = distance along the arc, y = depth inside the arc)
// — a HEIGHT map and an ALBEDO map, tile by tile, every tile with its own length, shift, tilt, colour and wear — then lit per
// pixel (low sun from behind-left of the camera, cool skylight, cast shadows marched through the height map, a damp sheen) and
// wrapped onto the arc with a polar warp. Everything is therefore concentric / radial, so rot about the arc centre is seamless.
import * as L from '../lib/core.js';

const { W, H } = L;
const HP = 64;          // margin of the roof layer (the move is ±25 px of slide and ±1 % of zoom)
const BP = 32;          // margin of the background layer
const TOPM = 16;        // strip rows kept above the eave line (room for the bumpy tile ends)
const DEPTH = 600;      // strip rows below the eave line
const P = 88;           // 瓦垄 pitch along the arc: one row of cover tiles + one trough
const SPLIT = 0.6;      // share of the pitch taken by the convex cover tile (≈ 53 px)
const D = { ridge: 98, rh: 12, eave: 428 };   // depths inside the arc (px): ridge line, ridge half-width, inner eave
let S = null;

function h2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** a noise field as a plain byte array (0..255) */
function noiseArr(w, h, opts) {
  const d = L.noiseTex(w, h, opts).getContext('2d').getImageData(0, 0, w, h).data;
  const o = new Uint8Array(w * h);
  for (let i = 0; i < o.length; i++) o[i] = d[i * 4];
  return o;
}
/** one row of overlapping tiles down a slope: butt positions b[k] (tile k shows from b[k] to b[k+1]), a per-px lookup, per-tile dice */
function makeRun(seed, len, lap, jit) {
  const r = L.rng(seed);
  const b = [-60 - lap * r()];
  while (b[b.length - 1] < len + 70) b.push(b[b.length - 1] + lap * (1 + jit * (r() * 2 - 1)));
  const idx = new Uint8Array(len + 124);
  let k = 0;
  for (let s = -60; s < len + 64; s++) { while (k < b.length - 2 && b[k + 1] <= s) k++; idx[s + 60] = k; }
  const n = b.length, hk = new Float32Array(n), hq = new Float32Array(n), hp = new Float32Array(n), ho = new Float32Array(n);
  for (let i = 0; i < n; i++) { hk[i] = r(); hq[i] = r(); hp[i] = r(); ho[i] = r(); }
  return { b: Float32Array.from(b), idx, hk, hq, hp, ho };
}
/** box blur of a float field (edges clamped) */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[o + (i < 0 ? 0 : i)];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc / n; const a = x - r, b = x + r + 1; acc += src[o + (b >= w ? w - 1 : b)] - src[o + (a < 0 ? 0 : a)]; }
  }
  const col = new Float32Array(w);
  for (let yy = 0; yy <= r && yy < h; yy++) { const o = yy * w; for (let x = 0; x < w; x++) col[x] += tmp[o + x]; }
  for (let y = 0; y < h; y++) {
    const y0 = y - r < 0 ? 0 : y - r, y1 = y + r >= h ? h - 1 : y + r, inv = 1 / (y1 - y0 + 1), o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = col[x] * inv;
    if (y + r + 1 < h) { const oa = (y + r + 1) * w; for (let x = 0; x < w; x++) col[x] += tmp[oa + x]; }
    if (y - r >= 0) { const os = (y - r) * w; for (let x = 0; x < w; x++) col[x] -= tmp[os + x]; }
  }
  return out;
}

/** the timber gallery under the inner eave, in strip space (y = depth). Big, simple, and it will be thrown out of focus. */
function paintGallery(g, FW) {
  const E = D.eave, r = L.rng('s04gal');
  g.fillStyle = '#0b0705'; g.fillRect(0, E - 16, FW, DEPTH - E + 16);
  const rail0 = E + 34, rail1 = E + 84, beam1 = E + 97, BAY = P * 1.5;
  // boarded railing of the top gallery: upright planks, one by one
  for (let x = 0; x < FW;) {
    const w = r.range(9, 15);
    g.fillStyle = L.shade('#c4691c', r.range(-0.26, 0.12)); g.fillRect(x, rail0, w - 1.6, rail1 - rail0);
    g.fillStyle = 'rgba(255,196,130,0.24)'; g.fillRect(x, rail0, 1.6, rail1 - rail0);
    x += w;
  }
  for (let i = 0; i < 26; i++) {   // a few replaced / weathered boards
    const x = r() * FW, w = r.range(10, 34);
    g.fillStyle = r.chance(0.5) ? `rgba(236,180,120,${r.range(0.1, 0.26)})` : `rgba(40,18,6,${r.range(0.2, 0.45)})`; g.fillRect(x, rail0, w, rail1 - rail0);
  }
  g.fillStyle = '#e09a4c'; g.fillRect(0, rail0 - 5, FW, 6);            // handrail catching the sun
  g.fillStyle = '#421f0a'; g.fillRect(0, rail0 + 1, FW, 2.5);
  g.fillStyle = L.linear(g, 0, rail1, 0, beam1, [[0, '#c4742e'], [0.35, '#98541f'], [1, '#341808']]); g.fillRect(0, rail1, FW, beam1 - rail1);   // floor-edge beam
  g.fillStyle = '#080503'; g.fillRect(0, beam1, FW, DEPTH - beam1);                                 // the storey below, lost in shadow
  // posts
  for (let x = BAY * 0.3; x < FW; x += BAY) {
    const px = x + r.range(-5, 5), hw = r.range(7, 9);
    g.fillStyle = L.linear(g, px - hw, 0, px + hw, 0, [[0, '#e8a257'], [0.3, '#bb6a26'], [1, '#3d1c09']]); g.fillRect(px - hw, E - 16, hw * 2, beam1 - E + 16);
    g.fillStyle = 'rgba(20,9,3,0.5)'; g.fillRect(px + hw, rail0 - 5, 9, rail1 - rail0 + 5);
  }
  // timber grain + patchy ageing
  g.save(); g.beginPath(); g.rect(0, E - 16, FW, beam1 - E + 16); g.clip();
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55;
  g.drawImage(L.noiseTex(FW, 130, { seed: 's04age', scale: 90, sx: 1.6, octaves: 3, res: 0.25, contrast: 1.7, ramp: [[0, '#6b5240'], [0.5, '#e6dccd'], [1, '#ffffff']] }), 0, E - 16);
  g.restore();
  // the sun rakes the ring from the left: the galleries on the right face it squarely, those on the left turn away into cool shade
  g.save(); g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, 0, 0, FW, 0, [[0, '#4d5263'], [0.22, '#6a6872'], [0.42, '#cdbfae'], [0.6, '#fbf3e8'], [1, '#fff8ee']]);
  g.fillRect(0, E - 16, FW, beam1 - E + 16);
  g.restore();
  // the deep eave's shadow over the top of the gallery
  g.fillStyle = L.linear(g, 0, E - 16, 0, E + 54, [[0, 'rgba(7,4,3,0.97)'], [0.5, 'rgba(7,4,3,0.94)'], [0.78, 'rgba(7,4,3,0.5)'], [1, 'rgba(7,4,3,0)']]);
  g.fillRect(0, E - 16, FW, 70);
}

/** round colonies of crusty lichen (R = pale grey-green, G = ochre), scattered over the strip */
function lichenMap(FW, RH) {
  const c = L.makeCanvas(FW, RH), g = c.getContext('2d'), r = L.rng('s04lichen');
  g.fillStyle = '#000'; g.fillRect(0, 0, FW, RH);
  g.globalCompositeOperation = 'lighter';
  const n = Math.round(FW * 0.36);
  for (let i = 0; i < n; i++) {
    const x = r() * FW, y = TOPM + Math.pow(r(), 0.8) * (D.eave + 10), rad = 2.5 + 15 * Math.pow(r(), 2.6), ochre = false, a = r.range(0.35, 1);
    const lobes = rad > 6 ? r.int(3, 6) : 1;
    for (let j = 0; j < lobes; j++) {
      const lx = x + (lobes > 1 ? r.range(-0.5, 0.5) * rad : 0), ly = y + (lobes > 1 ? r.range(-0.5, 0.5) * rad : 0), lr = rad * (lobes > 1 ? r.range(0.45, 0.8) : 1);
      const col = ochre ? '0,255,0' : '255,0,0';
      g.fillStyle = L.radial(g, lx, ly, 0, lr, [[0, `rgba(${col},${a * 0.55})`], [0.55, `rgba(${col},${a})`], [0.82, `rgba(${col},${a * 0.8})`], [1, `rgba(${col},0)`]]);
      g.beginPath(); g.arc(lx, ly, lr, 0, L.TAU); g.fill();
    }
  }
  return g.getImageData(0, 0, FW, RH).data;
}

/** the unrolled roof strip, lit: returns straight-alpha RGBA (FW × FH) */
function buildStrip(env) {
  const a = env.arc, R = a.R;
  const nR = Math.ceil((2 * a.span(HP + 40) * R) / P) + 1;
  const FW = nR * P, FH = TOPM + DEPTH, RH = TOPM + D.eave + 24;
  const sE = D.eave - D.ridge;
  // ── noise fields
  const nBig = noiseArr(FW, RH, { seed: 's04big', scale: 190, sx: 1.5, octaves: 3, res: 0.16, contrast: 1.8 });
  const nMid = noiseArr(FW, RH, { seed: 's04mid', scale: 40, octaves: 3, res: 0.3, contrast: 1.7 });
  const nRun = noiseArr(FW, RH, { seed: 's04run', scale: 26, sx: 0.42, sy: 5, octaves: 3, res: 0.3, contrast: 1.7 });   // streaks down the slope
  const fine = noiseArr(256, 256, { seed: 's04fine', scale: 5, octaves: 3, res: 1, contrast: 1.8 });
  const lich = lichenMap(FW, RH);
  // ── rows
  const rr = L.rng('s04rows');
  const cOff = new Float32Array(nR), cHW = new Float32Array(nR), rowTone = new Float32Array(nR);
  const ci = [], co = [], ti_ = [], to_ = [];
  const lenIn = sE + 40, lenOut = D.ridge + TOPM + 24;
  for (let i = 0; i < nR; i++) {
    cOff[i] = rr.range(-5.5, 5.5); cHW[i] = ((P * SPLIT) / 2) * rr.range(0.87, 1.1); rowTone[i] = rr.range(0.86, 1.12);
    ci.push(makeRun('s04ci' + i, lenIn, 25, 0.24)); co.push(makeRun('s04co' + i, lenOut, 11.5, 0.22));
    ti_.push(makeRun('s04ti' + i, lenIn, 30, 0.24)); to_.push(makeRun('s04to' + i, lenOut, 14, 0.22));
  }
  const nzW = L.makeNoise('s04gauge'), warp = new Float32Array(FW);
  for (let x = 0; x < FW; x++) warp[x] = 9 * nzW.fbm(x / 330, 7.3, 2) + 3 * nzW.fbm(x / 120, 2.1, 2);
  const hgt = new Float32Array(FW * RH), alb = new Uint8ClampedArray(FW * RH * 3), glo = new Uint8Array(FW * RH), alp = new Uint8ClampedArray(FW * RH);

  // ── pass 1: height + albedo, tile by tile
  for (let y = 0; y < RH; y++) {
    const d = y - TOPM;
    let k = y * FW;
    for (let x = 0; x < FW; x++, k++) {
      const nb = nBig[k], nm = nMid[k], nr = nRun[k];
      const dd = d - D.ridge + (nb - 128) * 0.022;                         // the ridge line wanders a few px
      const side = dd >= 0 ? 1 : -1;            // +1 inner slope (faces the camera), −1 outer slope (falls away)
      const s = dd >= 0 ? dd : -dd;             // distance down the slope from the ridge line
      const xr = x + warp[x] + (nm - 128) * 0.014 + (nb - 128) * 0.05 + (side < 0 ? 37 : 0);   // rows meander; the two slopes were laid independently
      let ri = (xr / P) | 0; if (ri < 0) ri = 0; else if (ri >= nR) ri = nR - 1;
      const fx = xr - (ri + 0.5) * P - cOff[ri];
      const hw = cHW[ri];
      let h = 0, tone = 1, warm = 0, gl = 0, hd = 99, tr = 0, cover = false, edge = -1.4, fi = 0, lim = 0;
      const u0 = fx / hw;
      if (u0 > -1.3 && u0 < 1.3) {
        const uc0 = u0 < -1 ? -1 : u0 > 1 ? 1 : u0;
        const run = side > 0 ? ci[ri] : co[ri];
        // butt ends: seen from the front on the inner slope (∩), from behind on the outer one
        const se = s + (side > 0 ? 7 : -2.5) * (1 - uc0 * uc0);
        const ti = run.idx[(se + 60) | 0];
        const b0 = run.b[ti], e = run.b[ti + 1] - b0;
        const hk = run.hk[ti], hq = run.hq[ti], hp = run.hp[ti], ho = run.ho[ti];
        const uc = (fx - (hq - 0.5) * 6 - (hp - 0.5) * 0.14 * (se - b0 - e * 0.5)) / hw;
        if (uc > -1 && uc < 1) {
          cover = true;
          const face = side > 0 ? 2.2 : 1.4;
          const f = (se - b0) / e; let q = b0 + e - se;                    // q = px left to this tile's butt
          if (side > 0 && sE - se < q) q = sE - se;                        // the eave cuts the last tile
          const au = uc < 0 ? -uc : uc;
          const prof = (Math.sqrt(1 - 0.84 * uc * uc) - 0.4) / 0.6;        // 1 on the crown → 0 at the edges
          h = 5 + 13.5 * prof + (side > 0 ? 3 : 1.8) * f * (q < face ? (q < 0 ? 0 : q / face) : 1) + (ho - 0.5) * 2 + (hp - 0.5) * 2.6 * uc;
          tone = side > 0 ? rowTone[ri] * (0.78 + 0.44 * hk) : (0.74 + 0.4 * h2(ri, 77)) * (0.9 + 0.2 * hk);
          if (ho > 0.94) tone *= 1.18; else if (ho < 0.1) tone *= 0.7;
          warm = hq - 0.5;
          hd = se - b0;
          if (hd < 4.5) tone *= side > 0 ? 0.5 + 0.5 * (hd / 4.5) : 0.8 + 0.2 * (hd / 4.5);   // dirt packed under the tile above
          if (side > 0 && q >= face && q < face + 2.5) tone *= 1.14;       // worn, paler lip
          if (au > 0.86) tone *= 1 - (au - 0.86) * 2.4;
          if (hp > 0.86) {                                                 // a chipped corner shows the tile underneath
            const cw = 0.25 + 0.4 * hq, ch = 8 + 10 * ho;
            if ((1 - (hk > 0.5 ? uc : -uc)) / (cw * 2) + q / ch < 1 + (nm - 128) * 0.004) { h -= 3.4; tone *= 0.58; warm += 0.3; hd = 2; }
          } else if (ho < 0.013 && side > 0) { h = 1 + 3 * prof; tone *= 0.5; warm += 0.35; hd = 2; }   // a cover tile gone: the bedding shows
          gl = 150;
          edge = 0.4 + 3.1 * prof + (ho - 0.5) * 1.6;
          fi = ri * 37 + ti * 53;
          lim = sE - 7 * (1 - uc * uc);
        }
      }
      if (!cover) {
        const tj = fx > 0 ? ri : ri - 1;                                    // the trough between cover rows tj and tj+1
        const j0 = tj < 0 ? 0 : tj, j1 = tj + 1 >= nR ? nR - 1 : tj + 1;
        const thw = (P - cHW[j0] - cHW[j1]) * 0.5 + 4.5;
        let ut = (xr - (tj + 1) * P - (cOff[j0] + cOff[j1]) * 0.5) / thw; if (ut < -1) ut = -1; else if (ut > 1) ut = 1;
        const run = side > 0 ? ti_[j0] : to_[j0];
        tr = 1 - ut * ut;
        const se = s + (side > 0 ? -6 : 2.5) * tr;                          // ∪ from the front
        const ti = run.idx[(se + 60) | 0];
        const b0 = run.b[ti], e = run.b[ti + 1] - b0;
        const hk = run.hk[ti];
        const face = side > 0 ? 2.2 : 1.4;
        const f = (se - b0) / e; let q = b0 + e - se;
        if (side > 0 && sE + 6 - se < q) q = sE + 6 - se;
        h = -1.5 - 9 * tr + (side > 0 ? 2.6 : 1.5) * f * (q < face ? (q < 0 ? 0 : q / face) : 1) + (hk - 0.5) * 1.8;
        tone = (side > 0 ? 0.82 : 0.56) * (0.8 + 0.4 * hk);
        warm = run.hq[ti] - 0.5;
        hd = se - b0;
        if (hd < 4.5) tone *= 0.55 + 0.45 * (hd / 4.5);
        if (q >= face && q < face + 2.5) tone *= 1.18;
        gl = 110;
        edge = -1.5 + 0.9 * ut * ut;
        fi = j0 * 91 + ti * 29 + 7;
        lim = sE + 6 + 6 * tr;
      }
      const nf = fine[(((y + fi * 3) & 255) << 8) | ((x + fi) & 255)];
      // the old roof sags and swells; the clay itself is finely pitted
      h += (nb - 128) * 0.07 + (nf - 128) * 0.0045;
      // rain has streaked the slope below the ridge; the tiles stay damp and dark toward the inner eave
      if (side > 0) { if (s < 80) tone *= 1 - 0.3 * sm((nr - 132) / 50) * (1 - s / 80); tone *= 1 - 0.2 * sm((s - 190) / 140); }
      // fired clay: cool grey ↔ warm grey-brown, drifting in big patches and tile by tile
      let wm = 0.5 + warm * 0.8 + (nb - 128) * 0.0035; if (wm < 0) wm = 0; else if (wm > 1) wm = 1;
      const tx = tone * (0.74 + 0.52 * (nf / 255)) * (0.82 + 0.36 * (nr / 255)) * (side > 0 ? 1 : 0.94);
      let cr = (73 + 11 * wm) * tx, cg = (72 - 1 * wm) * tx, cb = (74 - 12 * wm) * tx;
      // ── the ridge: roof tiles stacked on edge like a row of leaning books, bedded in lime mortar
      if (dd > -D.rh * 1.6 && dd < D.rh * 1.6) {
        const t = dd / D.rh, t2 = t * t;
        if (t2 < 1) {
          const xe = xr + 12 * (1 - t2) + (nm - 128) * 0.05;
          const pk = Math.floor(xe / 9.5), fp = xe / 9.5 - pk;
          const pkh = h2(pk, 4177), pk2 = h2(pk, 911);
          const hR = 21 + 13 * Math.sqrt(1 - t2) + (fp < 0.3 ? fp / 0.3 : 1 - (fp - 0.3) * 0.5) * 3.2 * (0.4 + pkh) - (pk2 < 0.06 ? 7 : 0);
          if (hR > h) {
            h = hR;
            const lime = sm((nm - 150) / 40) * 0.7;
            const pt = (0.7 + 0.5 * pkh) * (fp < 0.16 ? 0.45 : fp < 0.34 ? 1.25 : 1) * (0.75 + 0.5 * (nf / 255));
            cr = 80 * pt * (1 - lime) + lime * (158 + 0.2 * nf); cg = 76 * pt * (1 - lime) + lime * (156 + 0.2 * nf); cb = 72 * pt * (1 - lime) + lime * (148 + 0.2 * nf);
            gl = 90 * (1 - lime); hd = 99; tr = 0; cover = true;
          }
        }
        const ft = t < 0 ? -t : t;
        if (ft > 0.78 && ft < 1.6) {          // the lime fillet at the foot of the ridge, grey with age
          let am = ft < 1 ? (ft - 0.78) / 0.22 : 1 - (ft - 1) / 0.6; am *= 0.25 + 0.75 * sm((nm - 100) / 60);
          const lv = 122 + 0.3 * nf;
          cr += (lv - cr) * am; cg += (lv * 0.98 - cg) * am; cb += (lv * 0.93 - cb) * am; gl *= 1 - am;
          if (ft >= 1) h += 3.5 * am;
        }
      }
      // round colonies of pale lichen on the exposed crowns
      const k4 = k * 4;
      let li = lich[k4] + lich[k4 + 1];
      if (li > 0) {
        const och = lich[k4 + 1] > lich[k4];
        li = (li > 255 ? 1 : li / 255) * (cover ? 0.6 : 0.22) * (0.5 + 0.5 * (nf / 255)) * (side > 0 ? 1 : 0.6);
        if (och) { cr += (150 - cr) * li; cg += (124 - cg) * li; cb += (62 - cb) * li; } else { cr += (150 - cr) * li; cg += (149 - cg) * li; cb += (142 - cb) * li; }
        gl *= 1 - li; h += li * 0.8;
      }
      // moss and black dirt gathering in the troughs and under every lap
      const wz = side > 0 ? 0.25 + 0.75 * sm((s - 120) / 190) : 0.45;       // dampness: toward the inner eave; all of the shaded slope
      let mm = sm((nr - 108) / 60) * wz * (cover ? (hd < 7 ? (1 - hd / 7) * 0.7 : 0) : tr * 1.1 + (hd < 7 ? (1 - hd / 7) * 0.5 : 0));
      if (mm > 0) {
        if (mm > 1) mm = 1; mm *= 0.45 + 0.55 * (nm / 255);
        const tip = nf / 255;
        cr += (22 + 24 * tip - cr) * mm; cg += (24 + 27 * tip - cg) * mm; cb += (17 + 13 * tip - cb) * mm; gl *= 1 - mm; h += mm * (0.6 + 2.6 * tip);
      }
      hgt[k] = h; alb[k * 3] = cr; alb[k * 3 + 1] = cg; alb[k * 3 + 2] = cb; glo[k] = gl;
      // silhouettes: the bumpy far eave above, the scalloped inner eave below
      let al = 255;
      if (d < 7) { const c = (edge + d + 0.5) * 255; al = c < 0 ? 0 : c > 255 ? 255 : c; }
      else if (s > sE - 12) { const c = (lim - s + 0.5) * 255; al = c < 0 ? 0 : c > 255 ? 255 : c; }
      alp[k] = al;
    }
  }

  // ── ambient occlusion from a blurred copy of the height map
  const hb = boxBlur(hgt, FW, RH, 6);

  // ── pass 2: light. Low sun from behind-left of the camera; cool skylight; the bright mist behind the far rim.
  const EL = 0.42, cosE = Math.cos(EL), sinE = Math.sin(EL), tanE = Math.tan(EL), STEP = 3.6;
  const hxl = new Float32Array(FW), hyl = new Float32Array(FW), hsx = new Float32Array(FW), hsy = new Float32Array(FW), hsz = new Float32Array(FW);
  for (let x = 0; x < FW; x++) {
    const th = (x - FW / 2) / R, c = Math.cos(th), sn = Math.sin(th);
    hxl[x] = -0.76 * c + 0.65 * sn; hyl[x] = 0.76 * sn + 0.65 * c;        // unit direction TO the sun, in strip space (it turns as the ring turns)
    const vx = hxl[x] * cosE, vy = hyl[x] * cosE + 0.64, vz = sinE + 0.77, vl = Math.hypot(vx, vy, vz);
    hsx[x] = vx / vl; hsy[x] = vy / vl; hsz[x] = vz / vl;                  // half vector sun ↔ camera
  }
  const gal = L.makeCanvas(FW, FH), gg_ = gal.getContext('2d');
  gg_.translate(0, TOPM); paintGallery(gg_, FW);
  const sd = gg_.getImageData(0, 0, FW, FH), o = sd.data;
  for (let y = 0; y < RH; y++) {
    const dd = y - TOPM - D.ridge;
    const tilt = dd <= -D.rh ? 0.8 : dd >= D.rh ? -0.42 : 0.8 - ((dd + D.rh) / (2 * D.rh)) * 1.22;   // the two pitches of the roof
    const yu = (y > 0 ? y - 1 : 0) * FW, yd = (y < RH - 1 ? y + 1 : RH - 1) * FW;
    for (let x = 0; x < FW; x++) {
      const k = y * FW + x, al = alp[k];
      if (al === 0) continue;
      const h0 = hgt[k];
      const gx = (hgt[x < FW - 1 ? k + 1 : k] - hgt[x > 0 ? k - 1 : k]) * 0.5, gy = (hgt[yd + x] - hgt[yu + x]) * 0.5 + tilt;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inv, ny = -gy * inv, nz = inv;
      const lx = hxl[x], ly = hyl[x];
      let diff = (nx * lx + ny * ly) * cosE + nz * sinE, sh = 0;
      if (diff > 0) {
        for (let i = 1; i <= 9; i++) {
          const sx = (x + lx * STEP * i + 0.5) | 0, sy = (y + ly * STEP * i + 0.5) | 0;
          if (sx < 0 || sx >= FW || sy < 0 || sy >= RH) break;
          const oc = (hgt[sy * FW + sx] - h0 - STEP * i * tanE - 0.4) / (0.8 + 0.45 * i);
          if (oc > sh) { sh = oc; if (sh >= 1) { sh = 1; break; } }
        }
      } else diff = 0;
      let ao = 1 - (hb[k] - h0) * 0.06; if (ao < 0.36) ao = 0.36; else if (ao > 1.12) ao = 1.12;
      const amb = (0.5 + 0.5 * nz) * ao;
      let bk = ny * -0.8 + nz * 0.6; bk = bk > 0 ? bk * ao : 0;
      const lit = 0.24 + 0.76 * sm(((x - FW / 2 + (y - TOPM) * 0.55 + (nBig[k] - 128) * 0.5) / R + 0.3) / 0.25);
      const sun = diff * (1 - sh) * lit;
      let r = alb[k * 3] * (0.5 * amb + 0.08 * bk + 1.4 * sun);
      let g = alb[k * 3 + 1] * (0.57 * amb + 0.1 * bk + 1.16 * sun);
      let b = alb[k * 3 + 2] * (0.68 * amb + 0.12 * bk + 0.86 * sun);
      const gl = glo[k] / 255;
      if (gl > 0) {      // damp tiles: a cool sheen at grazing angles, small warm glints toward the sun
        let fr = 1 - (ny * 0.64 + nz * 0.77); fr = fr > 0 ? (fr > 1 ? 1 : fr * fr * fr) * ao : 0;
        let sp = nx * hsx[x] + ny * hsy[x] + nz * hsz[x]; sp = sp > 0 ? Math.pow(sp, 26) * (1 - sh) * lit : 0;
        r += gl * (fr * 62 + sp * 190); g += gl * (fr * 71 + sp * 172); b += gl * (fr * 83 + sp * 140);
      }
      if (r > 196) r = 196 + (r - 196) * 0.5; if (g > 196) g = 196 + (g - 196) * 0.5; if (b > 196) b = 196 + (b - 196) * 0.5;
      const k4 = k * 4;
      if (al === 255 || y < TOPM + 40) { o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; o[k4 + 3] = al; }
      else { const t = al / 255; o[k4] += (r - o[k4]) * t; o[k4 + 1] += (g - o[k4 + 1]) * t; o[k4 + 2] += (b - o[k4 + 2]) * t; o[k4 + 3] = 255; }
    }
  }
  return { data: o, FW, FH };
}

/** wrap the strip onto the arc (inverse polar mapping, bilinear, straight alpha) → a layer cropped to the roof */
function wrapStrip(env, src, FW, FH) {
  const a = env.arc, R = a.R;
  const LW = W + HP * 2, top = Math.floor(a.crestY) - 10, LH = H + HP - top;
  const out = new ImageData(LW, LH), o = out.data;
  const xMax = FW - 1.001, yMax = FH - 1.001, row = FW * 4, half = FW / 2 - 0.5;
  for (let Y = 0; Y < LH; Y++) {
    const dy = a.cy - (Y + top + 0.5), dy2 = dy * dy;
    let k = Y * LW * 4;
    for (let X = 0; X < LW; X++, k += 4) {
      const dx = X - HP + 0.5 - a.cx;
      let fy = R - Math.sqrt(dx * dx + dy2) + TOPM - 0.5;
      if (fy < 0) continue;
      if (fy > yMax) fy = yMax;
      let fx = Math.atan2(dx, dy) * R + half;
      if (fx < 0) fx = 0; else if (fx > xMax) fx = xMax;
      const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const i = y0 * row + x0 * 4, j = i + row;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      o[k] = src[i] * w00 + src[i + 4] * w10 + src[j] * w01 + src[j + 4] * w11;
      o[k + 1] = src[i + 1] * w00 + src[i + 5] * w10 + src[j + 1] * w01 + src[j + 5] * w11;
      o[k + 2] = src[i + 2] * w00 + src[i + 6] * w10 + src[j + 2] * w01 + src[j + 6] * w11;
      o[k + 3] = src[i + 3] * w00 + src[i + 7] * w10 + src[j + 3] * w01 + src[j + 7] * w11;
    }
  }
  const c = L.makeCanvas(LW, LH);
  const g = c.getContext('2d');
  g.putImageData(out, 0, 0);
  g.translate(HP, -top);                    // frame coordinates from here on
  // finishing, only where the roof is
  g.globalCompositeOperation = 'source-atop';
  // aerial haze on the far rim + the bright mist blooming a few px over the dark edge
  g.fillStyle = L.radial(g, a.cx, a.cy, R - 110, R + 6, [[0, 'rgba(214,226,236,0)'], [1, 'rgba(214,226,236,0.1)']]);
  g.fillRect(-HP, top, LW, LH);
  g.fillStyle = L.radial(g, a.cx, a.cy, R - 14, R + 5, [[0, 'rgba(240,246,250,0)'], [0.7, 'rgba(240,246,250,0.16)'], [1, 'rgba(240,246,250,0.36)']]);
  g.fillRect(-HP, top, LW, LH);
  g.globalCompositeOperation = 'source-over';
  // depth of field: focus sits on the far rim at the crest; the roof softens toward the camera (down the frame)
  const soft = (px, y0, y1) => {
    const c0 = Math.max(0, Math.floor(y0 - top - px * 3)), hh = LH - c0;      // only the rows that will show
    const b = L.makeCanvas(LW, hh), q = b.getContext('2d');
    q.filter = `blur(${px}px)`; q.drawImage(c, 0, -c0); q.filter = 'none';
    q.globalCompositeOperation = 'destination-in';
    q.fillStyle = L.linear(q, 0, y0 - top - c0, 0, y1 - top - c0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]); q.fillRect(0, 0, LW, hh);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(b, 0, c0); g.restore();
  };
  soft(1.8, 760, 930);
  soft(6.5, 925, 1072);
  return { canvas: c, top };
}

/** clean morning mist: one soft gradient, a breath of a far ridge thrown completely out of focus */
function buildBack(env) {
  const a = env.arc;
  const X = -BP, Y = -BP, WW = W + BP * 2, HH = H + BP * 2;
  const c = L.makeCanvas(WW, HH); c._pad = BP;
  const g = c.getContext('2d'); g.translate(BP, BP);
  g.fillStyle = L.linear(g, 0, Y, 0, a.crestY + 300, [[0, '#cfdce7'], [0.4, '#dfe8ef'], [0.75, '#eef3f6'], [1, '#f7f9fb']]);
  g.fillRect(X, Y, WW, HH);
  // drawn at 1/8 size and scaled up: far out of focus for free
  const hill = L.makeCanvas(WW / 8, HH / 8), q = hill.getContext('2d'); q.scale(1 / 8, 1 / 8); q.translate(BP, BP);
  const nz = L.makeNoise('s04hill');
  q.beginPath(); q.moveTo(X - 40, HH);
  for (let x = X - 40; x <= W + BP + 40; x += 16) {
    q.lineTo(x, 380 - 60 * Math.exp(-(((x - 330) / 420) ** 2)) - 36 * Math.exp(-(((x - 1650) / 380) ** 2)) - 30 * nz.fbm((x / W) * 2.4 + 3.7, 1.3, 3));
  }
  q.lineTo(W + BP + 40, HH); q.closePath();
  q.fillStyle = L.linear(q, 0, 290, 0, 600, [[0, 'rgba(150,176,198,0.2)'], [0.4, 'rgba(160,184,204,0.12)'], [1, 'rgba(190,208,222,0)']]); q.fill();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(hill, X, Y, WW, HH);
  // slow, very low-contrast unevenness in the mist so it is air, not a flat fill
  g.drawImage(L.noiseTex(WW, HH, { seed: 's04sky', scale: 620, sx: 1.8, sy: 1, octaves: 3, res: 0.1, contrast: 1.3,
    ramp: [[0, 'rgba(176,196,212,0.16)'], [0.5, 'rgba(230,238,244,0)'], [1, 'rgba(255,255,255,0.4)']] }), X, Y);
  // the bright bank of mist the roof stands against
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 20, a.R + 300, [[0, 'rgba(248,251,252,0.95)'], [0.3, 'rgba(248,251,252,0.7)'], [0.7, 'rgba(248,251,252,0.22)'], [1, 'rgba(248,251,252,0)']]);
  g.fillRect(X, Y, WW, HH);
  return c;
}

export default {
  name: '福建土楼',
  tone: 'dark',
  init(env) {
    const t0 = performance.now();
    const { data, FW, FH } = buildStrip(env);
    const t1 = performance.now();
    const house = wrapStrip(env, data, FW, FH);
    const t2 = performance.now();
    S = { house: house.canvas, top: house.top, back: buildBack(env) };
    console.warn('PROF strip', (t1 - t0) | 0, 'wrap', (t2 - t1) | 0, 'back', (performance.now() - t2) | 0);
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.013, 0.013, p), zoom = L.lerp(0.994, 1.012, p);
    L.blit(ctx, env, S.back, { rot: rot * 0.15, zoom: 1 + (zoom - 1) * 0.3 });
    L.cam(ctx, env, { rot, zoom }, () => { ctx.drawImage(S.house, -HP, S.top); });
    // light that stays put while the roof slides beneath it: the sun pooling right of centre, cool shade gathering on the left
    L.cam(ctx, env, { zoom }, () => {
      ctx.save(); a.clipBand(ctx, -D.ridge - D.rh, -D.eave - 110);
      const s = a.pt(0.2, -300);
      L.glow(ctx, s.x, s.y, 640, '#ffd6a0', 0.4, 'overlay');
      const q = a.pt(-0.42, -250);
      L.glow(ctx, q.x, q.y, 600, '#16202e', 0.22, 'overlay');
      ctx.restore();
    });
  },
};
