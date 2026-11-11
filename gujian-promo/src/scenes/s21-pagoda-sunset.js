// s21 — 古塔夕照. The arc is a wooded ridge at sundown: a near-black hill whose rim is a fuzz of tree crowns,
// a seven-storey pavilion-style pagoda (楼阁式塔) standing on it in front of the half-set sun, a tiny pavilion
// far along the ridge, a few birds going home. Sky: a thin ember line hugging the ridge → rouge → night purple.
// Layers: sky (per-pixel height field + sun) / lit cirrus / dark horizon streaks / birds (live) / hill + buildings,
// then two optical passes: the ember line's halation over the ridge, and the sun's bloom over the pagoda.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 240;
const INK = '#050305';
const TOWER_X = 484;      // pagoda axis at mid-shot — well clear of the tagline zone (x ≥ 630)
const PAV_X = 1574;       // the little pavilion, far along the ridge on the other side
let S = null;

const sunOf = (a) => ({ x: 460, y: a.yAt(460) - 76, r: 120 });

// height above the ridge (px) → colour, after「塞上燕脂凝夜紫」: a thin ember line on the ridge, a quick fall to
// rouge (the calm band the tagline sits in), then plum and night-purple overhead — never down to black
const SKY = [
  [0, '#ffbe55'], [5, '#ffb347'], [12, '#ff8a2a'], [22, '#ee4f2a'], [34, '#c22a3a'], [56, '#a82241'],
  [260, '#8e1d48'], [370, '#661d56'], [470, '#451c50'], [640, '#26123a'],
];
const HMAX = 720;
const SKY_BOTTOM = 900, EMBER_TOP = 480;   // no sky is ever seen below this row (the ridge at the far end of the padded layer)

// ───────────────────────── sky ─────────────────────────
function buildSky(env) {
  const a = env.arc, sun = sunOf(a);
  const LW = W + PAD * 2, LH = SKY_BOTTOM + PAD, res = 0.5;
  const cw = Math.round(LW * res), ch = Math.round(LH * res);
  const ramp = L.makeRamp(SKY);
  const NL = HMAX * 4 + 1;
  const lut = new Uint8ClampedArray(NL * 3);
  for (let i = 0; i < NL; i++) { const c = ramp(i / 4); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const nz = L.makeNoise('s21sky');
  const img = new ImageData(cw, ch); const d = img.data;
  const eimg = new ImageData(cw, ch); const ed = eimg.data;     // the ember line on its own, for the halation pass
  let k = 0;
  for (let j = 0; j < ch; j++) {
    const y = (j + 0.5) / res - PAD;
    for (let i = 0; i < cw; i++) {
      const x = (i + 0.5) / res - PAD;
      const raw = a.drAt(x, y), dr = Math.max(0, raw);
      const up = L.smooth((dr - 40) / 220);                 // 0 inside the ember line, 1 in the open sky
      // the ember line: its thickness breathes, and away from the sun it cools from yellow to orange
      let h1 = dr;
      if (up < 1) {
        const calm = Math.exp(-(((x - a.cx) / 420) ** 2));      // under the tagline the line is at its thinnest and steadiest
        h1 = dr * (1 + 0.2 * (1 - 0.85 * calm) * nz.n2(x / 230, 3.3) + 0.16 * calm) + 16 * L.smooth((Math.abs(x - sun.x) - 320) / 1100);
        if (raw >= 0 && h1 < 28) {
          const e = 1 - h1 / 28, ei = Math.min(NL - 1, ((h1 + 9) * 4) | 0) * 3;   // a shade redder than the line itself, so it never goes olive on black
          ed[k] = lut[ei]; ed[k + 1] = lut[ei + 1]; ed[k + 2] = lut[ei + 2]; ed[k + 3] = 255 * e * e;
        }
      }
      // the open sky: purple comes a little lower on the side away from the sun; slow breathing so it is not a clean gradient
      if (up > 0) h1 = L.lerp(h1, dr * (0.94 + 0.26 * L.smooth((x - 200) / 1900)) * (1 + 0.09 * nz.fbm(x / 820, y / 240, 3)), up);
      // the sun's aureole, as a "height" of its own: hot against the disc, back to the plain sky ~130 px out
      const ds = Math.max(0, Math.hypot((x - sun.x) / 1.15, y - sun.y) - sun.r * 0.96);
      const h2 = 12 + 0.27 * ds * (1 + (ds * ds) / 60000);
      const h = Math.pow(Math.pow(h1 + 0.5, -1.5) + Math.pow(h2 + 0.5, -1.5), -1 / 1.5);
      const li = Math.min(NL - 1, Math.max(0, (h * 4) | 0)) * 3;
      d[k++] = lut[li]; d[k++] = lut[li + 1]; d[k++] = lut[li + 2]; d[k++] = 255;
    }
  }
  const small = L.makeCanvas(cw, ch); small.getContext('2d').putImageData(img, 0, 0);
  // the ember line on its own (init cuts the hill's silhouette out of it and blurs it: the halation pass)
  const esmall = L.makeCanvas(cw, ch); esmall.getContext('2d').putImageData(eimg, 0, 0);
  const ember = L.makeCanvas(LW, SKY_BOTTOM - EMBER_TOP), eg = ember.getContext('2d');
  eg.imageSmoothingEnabled = true; eg.imageSmoothingQuality = 'high';
  eg.drawImage(esmall, 0, -(EMBER_TOP + PAD), LW, LH);
  const sky = L.makeLayer(PAD, (g) => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small, -PAD, -PAD, LW, LH);
    // the disc: soft-edged, a little flattened and reddened toward its foot by the thick air
    const DS = sun.r * 2 + 48, disc = L.makeCanvas(DS, DS), dg = disc.getContext('2d');
    dg.save();
    dg.filter = 'blur(2.4px)';
    dg.translate(DS / 2, DS / 2); dg.scale(1, 0.955);
    dg.fillStyle = L.linear(dg, 0, -sun.r, 0, sun.r * 0.75, [[0, '#ffe680'], [0.5, '#ffc24a'], [0.85, '#ff9a30'], [1, '#ff7a2a']]);
    dg.beginPath(); dg.arc(0, 0, sun.r, 0, L.TAU); dg.fill();
    dg.restore();
    dg.globalCompositeOperation = 'source-atop';                                   // limb darkening, inside the disc only
    dg.fillStyle = L.radial(dg, DS / 2, DS / 2, sun.r * 0.5, sun.r * 1.03, [[0, 'rgba(255,110,40,0)'], [1, 'rgba(255,110,40,0.34)']]);
    dg.fillRect(0, 0, DS, DS);
    g.drawImage(disc, sun.x - DS / 2, sun.y - DS / 2);
    // bars of cloud lying across it
    g.save(); g.filter = 'blur(2.6px)';
    const bars = [[-70, 2.6, 170, 0.6, 40], [-58, 1.3, 120, 0.4, -60], [-12, 1.5, 150, 0.36, 70], [22, 5, 210, 0.6, -10], [36, 1.8, 180, 0.5, 60]];
    for (const [dy, ry, rx, al, ox] of bars) {
      g.fillStyle = L.rgba('#b3243c', al);
      g.beginPath(); g.ellipse(sun.x + ox, sun.y + dy, rx, ry, -0.01, 0, L.TAU); g.fill();
    }
    g.restore();
  });
  return { sky, ember };
}

/** the light the bloom pass spreads over whatever stands in front of the sun: the disc and the tight glare round it */
const BLOOM_R = 320;
function buildSunLight(env) {
  const sun = sunOf(env.arc), N = BLOOM_R * 2;
  const c = L.makeCanvas(N, N), g = c.getContext('2d');
  g.translate(N / 2, N / 2);
  g.fillStyle = L.radial(g, 0, 0, sun.r * 0.94, sun.r * 1.5, [[0, 'rgba(255,150,60,0.3)'], [0.35, 'rgba(255,110,50,0.1)'], [1, 'rgba(255,80,40,0)']]);
  g.fillRect(-N / 2, -N / 2, N, N);
  g.fillStyle = L.linear(g, 0, -sun.r, 0, sun.r, [[0, '#ffe890'], [0.55, '#ffc050'], [1, '#ff8a30']]);
  g.beginPath(); g.ellipse(0, 0, sun.r, sun.r * 0.955, 0, 0, L.TAU); g.fill();
  return c;
}

// ───────────────────────── clouds ─────────────────────────
function buildClouds(env) {
  const a = env.arc, sun = sunOf(a);
  const LW = W + PAD * 2, LH = 860 + PAD;            // only the part above the ridge is ever seen
  // long fibres: coarse strands with finer ones combed through them, lying at a slight slant rather than dead level
  const MX = 200, MY = 160;
  const fibres = (seed, scale, sx, sy, lo, hi, tilt) => {
    const mk = (sd, sc, sxx) => L.noiseTex(LW + MX, LH + MY, {
      seed: sd, scale: sc, sx: sxx, sy, octaves: 4, gain: 0.55, warp: 0.9, warpScale: 3, contrast: 1.5, res: 0.5,
      ramp: [[0, 'rgba(255,255,255,0)'], [lo, 'rgba(255,255,255,0)'], [hi, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,1)']],
    });
    const c = L.makeCanvas(LW, LH), g = c.getContext('2d');
    g.translate(LW / 2, LH / 2); g.rotate(tilt);
    g.drawImage(mk(seed, scale, sx), -(LW + MX) / 2, -(LH + MY) / 2);
    g.globalAlpha = 0.35; g.drawImage(mk(seed + 'fine', scale * 0.48, sx * 1.35), -(LW + MX) / 2, -(LH + MY) / 2);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    return c;
  };
  // …gathered into a few banks [x, y, rx, ry, strength] (frame coords), with clear sky between them
  const gather = (g, banks) => {
    const m = L.makeCanvas(LW, LH); const mg = m.getContext('2d');
    for (const [x, y, rx, ry, al] of banks) {
      mg.save(); mg.translate(x + PAD, y + PAD); mg.scale(rx, ry);
      mg.fillStyle = L.radial(mg, 0, 0, 0, 1, [[0, `rgba(0,0,0,${al})`], [0.5, `rgba(0,0,0,${al * 0.62})`], [1, 'rgba(0,0,0,0)']]);
      mg.fillRect(-1, -1, 2, 2); mg.restore();
    }
    g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0);
    // the tagline's pocket stays quiet
    g.globalCompositeOperation = 'destination-out';
    g.save(); g.translate(a.cx + PAD, a.crestY - 135 + PAD); g.scale(1, 0.55);
    g.fillStyle = L.radial(g, 0, 0, 340, 700, [[0, 'rgba(0,0,0,0.97)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(-720, -720, 1440, 1440);
    g.restore();
  };
  // 1) high cirrus, lit from below: brighter than the sky behind it — peach by the sun, rose and mauve far from it
  const lit = fibres('s21cirrus', 46, 22, 0.75, 0.46, 0.72, -0.022);
  let g = lit.getContext('2d');
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = L.radial(g, sun.x + PAD, sun.y + PAD, 0, 1700, [[0, '#ffc890'], [0.16, '#ff9a5a'], [0.36, '#ed5736'], [0.6, '#c24a62'], [1, '#7a3a52']]);
  g.fillRect(0, 0, LW, LH);
  gather(g, [[430, 96, 760, 78, 1], [1500, 176, 640, 62, 0.7], [70, 292, 430, 44, 0.8], [1790, 20, 520, 56, 0.6]]);
  lit._pad = PAD;
  // 2) low streaks across the ember line: darker than the sky behind them
  const dark = fibres('s21streak', 58, 26, 0.8, 0.42, 0.74, 0.012);
  g = dark.getContext('2d');
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#7a3a62'; g.fillRect(0, 0, LW, LH);            // multiplied over the sky: the same hue, a step down in value
  gather(g, [[1640, 512, 400, 30, 0.85], [40, 552, 400, 30, 0.4], [330, 432, 330, 20, 0.5], [1900, 650, 330, 26, 0.8], [-80, 690, 300, 26, 0.7], [1380, 468, 190, 12, 0.5]]);
  dark._pad = PAD;
  return { lit: L.blurred(lit, 1.0), dark: L.blurred(dark, 1.1) };
}

// ───────────────────────── buildings ─────────────────────────
/**
 * 楼阁式塔 in silhouette: 台基, seven storeys that shrink as they climb, each with its 塔身, 平座 + 栏杆, 檐柱 and an
 * upturned 腰檐; 攒尖 top roof; 塔刹 (覆钵, 刹杆, 相轮, 宝盖, 宝珠). Local units ≈ px at k = 1; y is measured UP from the base.
 */
function drawPagoda(g, cx, by, k) {
  const X = (x) => cx + x * k, Y = (y) => by - y * k;
  const rect = (x, y, w, h) => g.fillRect(X(x), Y(y + h), w * k, h * k);
  const N = 7;
  const doors = [], glints = [];
  g.fillStyle = INK;
  rect(-78, -46, 156, 52); rect(-69, 6, 138, 6);                   // 台基 (its foot runs down into the slope)
  let y = 12, bw = 50, h = 58, e = 30;
  for (let i = 0; i < N; i++) {
    const T = y + h, rH = h * 0.26, last = i === N - 1;
    const tipX = bw + e, tipY = T - rH * 0.6;
    // 塔身, with a slight batter
    g.beginPath(); g.moveTo(X(-bw), Y(y)); g.lineTo(X(-bw * 0.965), Y(T)); g.lineTo(X(bw * 0.965), Y(T)); g.lineTo(X(bw), Y(y)); g.closePath(); g.fill();
    // 檐柱 of the surrounding gallery, 平座 slab and 栏杆
    const col = bw + 7.6;
    for (const s of [-1, 1]) rect(s * col - 1.15, y, 2.3, h - rH * 1.02);
    if (i > 0) {
      rect(-col - 2.2, y - 1.2, (col + 2.2) * 2, 3.6);
      rect(-col, y + 8.2, col * 2, 1.7);
      for (const s of [-1, 1]) rect(s * (bw + 3.5) - 0.65, y, 1.3, 8.4);
    }
    // 腰檐: a thin concave wing, tip turned up; 斗栱 wedge beneath it
    for (const s of [-1, 1]) {
      g.beginPath();
      if (last) {
        g.moveTo(X(0), Y(T + 31));
        g.bezierCurveTo(X(s * bw * 0.26), Y(T + 9), X(s * (bw + e * 0.4)), Y(T - rH * 0.98), X(s * tipX), Y(tipY));
      } else {
        g.moveTo(X(s * bw * 0.8), Y(T - 1));
        g.quadraticCurveTo(X(s * (bw + e * 0.45)), Y(T - rH), X(s * tipX), Y(tipY));
      }
      g.quadraticCurveTo(X(s * (bw + e * 0.55)), Y(T - rH * 1.34), X(s * (bw + 1)), Y(T - rH * 1.08 - 2));
      g.lineTo(X(s * (bw - 2)), Y(T - rH * 1.08 - 12));
      g.lineTo(X(0), Y(T - rH * 1.08 - 12));
      g.lineTo(X(0), Y(last ? T + 31 : T - 1));
      g.closePath(); g.fill();
      g.beginPath(); g.moveTo(X(s * (bw - 2)), Y(T - rH * 1.08 - 13)); g.lineTo(X(s * (bw + e * 0.44)), Y(T - rH * 1.2)); g.lineTo(X(s * (bw - 2)), Y(T - rH)); g.closePath(); g.fill();
      // 风铎 under the corner
      rect(s * (tipX - 2.2) - 0.45, tipY - 5.5, 0.9, 5);
      g.beginPath(); g.arc(X(s * (tipX - 2.2)), Y(tipY - 6.6), 1.6 * k, 0, L.TAU); g.fill();
      glints.push({ s, bw, e, T, rH, tipX, tipY, last, low: i < 3 });
    }
    doors.push({ y: y + (i ? 3.4 : 2), w: bw * 0.27, h: h * 0.36 });
    if (last) {
      // 塔刹
      const y0 = T + 30;
      rect(-7.5, y0 - 1, 15, 3.6);
      g.beginPath(); g.ellipse(X(0), Y(y0 + 2.4), 6.4 * k, 6.8 * k, 0, Math.PI, 0); g.fill();        // 覆钵
      rect(-1.15, y0 + 6, 2.3, 70);                                                                   // 刹杆
      for (let j = 0; j < 7; j++) {                                                                   // 相轮
        const hw = L.lerp(10.6, 5.4, j / 6), yy = y0 + 16 + j * 6.3;
        g.beginPath(); g.ellipse(X(0), Y(yy + 1.6), hw * k, 1.75 * k, 0, 0, L.TAU); g.fill();
      }
      g.beginPath(); g.moveTo(X(-8.4), Y(y0 + 60.6)); g.quadraticCurveTo(X(0), Y(y0 + 66.6), X(8.4), Y(y0 + 60.6)); g.closePath(); g.fill();   // 宝盖
      g.beginPath(); g.arc(X(0), Y(y0 + 69.6), 3.5 * k, 0, L.TAU); g.fill();                          // 宝珠
      g.beginPath(); g.moveTo(X(-1.5), Y(y0 + 72)); g.lineTo(X(0), Y(y0 + 84)); g.lineTo(X(1.5), Y(y0 + 72)); g.closePath(); g.fill();
    }
    y = T; bw *= 0.9; h *= 0.93; e *= 0.94;
  }
  // 券门: the doorways line up through the core, so the sky shows through
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const d of doors) {
    const hw = d.w / 2;
    g.beginPath(); g.moveTo(X(-hw), Y(d.y)); g.lineTo(X(-hw), Y(d.y + d.h - hw)); g.arc(X(0), Y(d.y + d.h - hw), hw * k, Math.PI, 0); g.lineTo(X(hw), Y(d.y)); g.closePath(); g.fill();
  }
  g.restore();
  // the roof slopes face the sky and catch a thread of its colour
  g.save(); g.lineCap = 'round';
  for (const q of glints) {
    const { s, bw: b, e: ev, T, rH, tipX, tipY, last, low } = q;
    g.beginPath();
    if (last) { g.moveTo(X(s * 1.5), Y(T + 27)); g.bezierCurveTo(X(s * b * 0.26), Y(T + 7.6), X(s * (b + ev * 0.4)), Y(T - rH * 0.98 - 1.4), X(s * (tipX - 2)), Y(tipY - 1.6)); }
    else { g.moveTo(X(s * (b * 0.9 + 9)), Y(T - 5)); g.quadraticCurveTo(X(s * (b + ev * 0.5)), Y(T - rH - 1.2), X(s * (tipX - 2)), Y(tipY - 1.6)); }
    g.strokeStyle = low ? 'rgba(255,160,70,0.5)' : 'rgba(214,60,90,0.45)'; g.lineWidth = 1.2 * k; g.stroke();
  }
  g.restore();
}

/** a small open pavilion (亭): 台基, four posts, bench rails in the side bays, 额枋, 攒尖 roof with a 宝顶 */
function drawPavilion(g, cx, by, k) {
  const X = (x) => cx + x * k, Y = (y) => by - y * k;
  const rect = (x, y, w, h) => g.fillRect(X(x), Y(y + h), w * k, h * k);
  g.fillStyle = INK;
  rect(-37, 0, 74, 5);
  for (const x of [-27, -10, 10, 27]) rect(x - 1.6, 5, 3.2, 34);
  for (const s of [-1, 1]) { rect(s > 0 ? 10 : -27, 5, 17, 2.2); rect(s > 0 ? 10 : -27, 12, 17, 1.7); rect(s * 18.5 - 0.6, 5, 1.2, 8); }
  rect(-29, 33.5, 58, 6.5);
  for (const x of [-27, -10, 10, 27]) for (const s of [-1, 1]) {   // 雀替
    g.beginPath(); g.moveTo(X(x), Y(34)); g.lineTo(X(x + s * 6.5), Y(34)); g.lineTo(X(x), Y(27.5)); g.closePath(); g.fill();
  }
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(X(0), Y(79));
    g.bezierCurveTo(X(s * 7), Y(56), X(s * 27), Y(42.5), X(s * 48), Y(47.5));
    g.quadraticCurveTo(X(s * 28), Y(37), X(0), Y(39));
    g.closePath(); g.fill();
  }
  rect(-1.7, 77, 3.4, 6); g.beginPath(); g.arc(X(0), Y(86), 3.7 * k, 0, L.TAU); g.fill();
  g.save(); g.lineCap = 'round'; g.strokeStyle = 'rgba(200,50,80,0.42)'; g.lineWidth = 1.1 * k;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(s * 2), Y(75)); g.bezierCurveTo(X(s * 7), Y(55), X(s * 27), Y(41.3), X(s * 46), Y(45.8)); g.stroke(); }
  g.restore();
}

/** a ridge pine: leaning trunk, flat-bottomed pads of needles */
function drawPine(g, x, by, hgt, lean, seed) {
  const r = L.rng(seed);
  const tx = (u) => x + lean * hgt * u * u + Math.sin(u * 5 + hgt) * hgt * 0.022;
  const pts = [];
  for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push([tx(u), by + 6 - (hgt + 6) * u]); }
  L.inkStroke(g, pts, { width: Math.max(2.8, hgt * 0.085), color: INK, taper: [0, 0.6], wobble: 0.25, seed: 5 });
  g.fillStyle = INK; g.strokeStyle = INK;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), u = 0.42 + 0.58 * f;
    const side = i === n - 1 ? 0 : (i % 2 ? 1 : -1) * (lean >= 0 ? 1 : -1);
    const px = tx(u) + side * hgt * L.lerp(0.36, 0.08, f) * r.range(0.8, 1.15), py = by - hgt * u - Math.abs(side) * hgt * 0.03;
    g.lineWidth = Math.max(1.1, hgt * 0.026);
    g.beginPath(); g.moveTo(tx(u - 0.09), by - hgt * (u - 0.09)); g.lineTo(px, py); g.stroke();
    const rx = hgt * L.lerp(0.3, 0.17, f) * r.range(0.85, 1.15);
    const m = Math.max(5, Math.round(rx / 2.2));
    for (let j = 0; j <= m; j++) {
      const v = (j / m) * 2 - 1;
      const rr = Math.max(1.5, rx * 0.21 * (1 - v * v * 0.78) * r.range(0.8, 1.25));
      g.beginPath(); g.ellipse(px + v * rx, py - rr * 0.45 + r.range(-0.6, 0.6), rr * 1.55, rr, 0, 0, L.TAU); g.fill();
    }
  }
}

// ───────────────────────── the hill ─────────────────────────
function buildHill(env) {
  const a = env.arc, sun = sunOf(a);
  return L.makeLayer(PAD, (g, layer) => {
    const s = a.span(PAD + 160), U = s * a.R;
    const FW = layer.width, FH = layer.height;
    // 1) things standing on the ridge (drawn first; the tree line then buries their feet)
    drawPagoda(g, TOWER_X, a.yAt(TOWER_X) + 3, 1);
    drawPavilion(g, PAV_X, a.yAt(PAV_X) + 2, 0.8);
    drawPine(g, PAV_X + 80, a.yAt(PAV_X + 80), 64, 0.2, 's21pineA');
    drawPine(g, PAV_X + 116, a.yAt(PAV_X + 116), 40, -0.16, 's21pineB');

    // 2) the hill mass — kept a little under the arc, so the gaps between the crowns bite into the ember line
    g.fillStyle = INK; a.pathBelow(g, -9); g.fill();

    // 3) the canopy: big overlapping crowns, like the lumps on the rim of the reference's mound. The first row is the
    //    skyline (tops ride −1…+6 px on the arc, with ~5 px scallops between them); the ones further down the slope are
    //    nearer the camera, overlap the ones behind, and each catches a crescent of sky light on the side toward the sun.
    const r = L.rng('s21canopy');
    const nz = L.makeNoise('s21canopy');
    const STEP = 1.5, FN = Math.ceil((2 * U) / STEP);
    const envl = new Float32Array(FN + 1).fill(-9);          // the skyline's envelope (dr), for the leaf fringe
    const crowns = [];
    const add = (u, top, rad, depth, sky) => { const c = a.pt(u / a.R, top - rad); crowns.push({ x: c.x, y: c.y, rad, depth, sky, top }); };
    // taller trees gathered at the feet of the buildings: [x, radius, how far the crown tops out above the arc]
    const big = [
      [TOWER_X - 182, 17, 9], [TOWER_X - 152, 25, 19], [TOWER_X - 118, 31, 36], [TOWER_X - 86, 22, 29], [TOWER_X - 64, 14, 15],
      [TOWER_X + 64, 15, 13], [TOWER_X + 92, 26, 27], [TOWER_X + 126, 21, 17], [TOWER_X + 154, 15, 9],
      [PAV_X - 62, 19, 13], [PAV_X - 40, 12, 8], [PAV_X + 46, 17, 12],
      // …and here and there along the ridge, so the skyline is not one even hem
      [70, 20, 9], [104, 26, 12], [138, 16, 7], [1392, 18, 8], [1422, 24, 11], [1812, 22, 10], [1846, 28, 13], [1880, 17, 7],
    ];
    for (const [x, rad, lift] of big) add(a.thetaAtX(x) * a.R, lift, rad, 0, true);
    for (let u = -U + r.range(0, 20); u < U;) {
      const clump = 0.5 + 0.5 * nz.n2(u / 260, 1.3);                                   // stretches of big / small trees
      const rad = 6 + 28 * Math.pow(r(), 1.6) * (0.35 + 0.95 * clump);
      const swell = 1.4 + 3.2 * nz.fbm(u / 170, 7.7, 2);                               // the skyline's slow undulation
      add(u, L.clamp(swell + r.range(-2.6, 2.6) + (rad - 14) * 0.08, -5, 6.5), rad, 0, true);
      u += rad * r.range(0.7, 1.4);
    }
    const rows = [11, 25, 42, 62, 86, 114, 146, 184, 228];
    rows.forEach((d, row) => {
      const gap = (row + 1 < rows.length ? rows[row + 1] : d * 1.25) - d;
      for (let u = -U + r.range(0, 30); u < U;) {
        const clump = 0.5 + 0.5 * nz.n2(u / 260, row * 3.7 + 9.3);
        const rad = (11 + 22 * Math.pow(r(), 1.5) * (0.4 + 0.9 * clump)) * (1 + row * 0.1);
        const dd = d + r.range(-0.48, 0.48) * gap;                                     // no tidy rows
        add(u, -dd, rad, dd, false);
        u += rad * r.range(0.85, 1.5);
      }
    });
    crowns.sort((p, q) => p.depth - q.depth);

    const disc = (x, y, rr) => { g.beginPath(); g.arc(x, y, rr, 0, L.TAU); g.fill(); };
    for (const { x: cx, y: cy, rad, depth, sky, top } of crowns) {
      const prox = Math.exp(-Math.abs(cx - sun.x) / 520);
      // toward the light: up at the sky, and over toward the sun
      let lx = sun.x - cx, ly = sun.y - cy; const ll = Math.hypot(lx, ly) || 1;
      lx = (lx / ll) * 0.62; ly = (ly / ll) * 0.62 - 0.72; const l2 = Math.hypot(lx, ly); lx /= l2; ly /= l2;
      const patch = L.clamp(0.55 + 0.95 * nz.fbm(cx / 150, cy / 80, 3));            // drifting patches of lit and shadowed forest
      const al = (0.3 + 0.7 * prox) * Math.exp(-depth / 52) * (0.22 + 0.78 * patch) * (r.chance(0.25) ? 0.35 : 1) * (sky ? (top > 8 ? 0.22 : 0.75) : 1);
      const rim = L.mix(INK, L.mix('#b02a4a', '#ffa040', prox), Math.min(1, al));
      const kb = 0.32 * (0.2 + 0.8 * patch) * Math.exp(-depth / 72) * (0.45 + 0.55 * prox) * (sky ? 0.7 : 1);
      const lit = L.mix('#3a1030', '#8a2438', prox);
      const body = L.mix(INK, lit, kb * 0.4), mid = L.mix(INK, lit, kb), edge = L.mix(mid, rim, 0.38);
      const lobes = [[0, 0, rad]];
      const nl = rad > 24 ? 6 : rad > 15 ? 4 : 2;
      for (let i = 0; i < nl; i++) {
        const ang = r.range(-1.35, 1.35), rr = rad * r.range(0.34, 0.6), dd = rad - rr * (sky ? r.range(0.84, 1.0) : r.range(0.55, 0.95));
        lobes.push([Math.sin(ang) * dd, -Math.cos(ang) * dd, rr]);
      }
      for (const [ox, oy, rr] of lobes) {
        const x = cx + ox, y = cy + oy;
        const gx = x - lx * rr * 0.5, gy = y - ly * rr * 0.5;
        const gr = g.createRadialGradient(gx, gy, rr * 0.35, gx, gy, rr * 1.5);
        gr.addColorStop(0, body); gr.addColorStop(0.5, mid); gr.addColorStop(0.8, edge); gr.addColorStop(1, rim);
        g.fillStyle = gr; disc(x, y, rr);
        if (sky) {
          const q = a.polar(x, y), uc = q.theta * a.R;
          const i0 = Math.max(0, Math.ceil((uc - rr + U) / STEP)), i1 = Math.min(FN, Math.floor((uc + rr + U) / STEP));
          for (let i = i0; i <= i1; i++) { const du = -U + i * STEP - uc, e = q.dr + Math.sqrt(Math.max(0, rr * rr - du * du)); if (e > envl[i]) envl[i] = e; }
        }
        // sprigs of leaves break up the round outline (and the crescent)
        if (depth > 130) continue;
        g.fillStyle = body;
        const sprigs = 1 + Math.round(rr / 4.5);
        for (let q = 0; q < sprigs; q++) {
          const ang = r.range(-1.7, 1.7), lr = r.range(1.2, 3.4);
          disc(x + Math.sin(ang) * (rr - lr * 0.3), y - Math.cos(ang) * (rr - lr * 0.3), lr);
        }
      }
    }

    // the very edge: a ragged fringe of twigs and leaf-tips riding the crowns' outline, taller where the growth is rank
    g.fillStyle = INK; g.beginPath();
    for (let i = 0; i <= FN; i++) {
      const u = -U + i * STEP;
      const rank = Math.pow(L.clamp(0.5 + 0.9 * nz.fbm(u / 150 + 40, 2.1, 2)), 2);
      const hgt = envl[i] - 0.5 + 3.0 * nz.ridged(u / 9, 5.5, 2) * (0.3 + rank) + 1.1 * nz.n2(u / 2.6, 9.9);
      const q = a.pt(u / a.R, hgt);
      if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
    }
    for (let i = FN; i >= 0; i -= 3) { const q = a.pt((-U + i * STEP) / a.R, envl[i] - 5); g.lineTo(q.x, q.y); }
    g.closePath(); g.fill();

    // the crescents bloom a little (kept inside the silhouette)
    const bloom = L.blurred(layer, 3.4), bg = bloom.getContext('2d');
    bg.globalCompositeOperation = 'destination-in'; bg.drawImage(layer, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6;
    g.drawImage(bloom, 0, 0);
    g.restore();

    // depth of field: the crowns go soft as the slope comes toward the camera
    const soft = L.blurred(layer, 3.2), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = L.radial(sg, a.cx + PAD, a.cy + PAD, a.R - 190, a.R - 46, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    sg.fillRect(0, 0, FW, FH);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(soft, 0, 0); g.restore();

    // …and so do the two ends of the ridge, away from the pagoda
    const ends = L.blurred(layer, 2.6), ng = ends.getContext('2d');
    ng.globalCompositeOperation = 'destination-in';
    ng.fillStyle = L.linear(ng, PAD - 60, 0, PAD + W + 40, 0, [[0, 'rgba(0,0,0,1)'], [0.16, 'rgba(0,0,0,0)'], [0.88, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    ng.fillRect(0, 0, FW, FH);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(ends, 0, 0); g.restore();

    // 4) nearer slopes stepping toward the camera — far out of focus, a breath of plum haze caught behind each
    const fore = L.makeCanvas(FW / 2, FH / 2), fg = fore.getContext('2d');
    fg.scale(0.5, 0.5); fg.translate(PAD, PAD);
    const ridges = [[214, 38, 1.2, '#070309', 0.05], [404, 56, 1.9, '#040205', 0.05]];
    ridges.forEach(([drop, amp, freq, col, haze], k) => {
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        const x = L.lerp(-PAD - 30, W + PAD + 30, i / 200);
        const y = a.yAt(L.clamp(x, a.cx - a.R * 0.7, a.cx + a.R * 0.7)) + drop + amp * nz.fbm((i / 200) * freq * 3 + k * 7.3, k * 3.1, 3)
          + (k % 2 ? 1 : -1) * (x - a.cx) * 0.045;
        pts.push([x, y]);
      }
      for (let i = 0; i < pts.length; i += 6) {
        const p = pts[i], prox = Math.exp(-Math.abs(p[0] - sun.x) / 900);
        fg.fillStyle = L.radial(fg, p[0], p[1] - 6, 0, 170, [[0, `rgba(88,36,104,${haze * (0.4 + 0.6 * prox)})`], [1, 'rgba(88,36,104,0)']]);
        fg.fillRect(p[0] - 170, p[1] - 176, 340, 340);
      }
      fg.fillStyle = col;
      fg.beginPath(); fg.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) fg.lineTo(p[0], p[1]);
      fg.lineTo(W + PAD + 30, H + PAD * 2); fg.lineTo(-PAD - 30, H + PAD * 2); fg.closePath(); fg.fill();
    });
    g.save(); a.clipBelow(g, -30); g.setTransform(1, 0, 0, 1, 0, 0);
    g.filter = 'blur(9px)'; g.drawImage(fore, 0, 0, FW, FH); g.filter = 'none';
    g.restore();
  });
}

// ───────────────────────── birds ─────────────────────────
const BIRDS = [ // x, y, size, flap phase
  [1392, 262, 1.5, 0.0], [1452, 298, 1.2, 1.7], [1518, 250, 0.8, 3.1], [1588, 320, 1.3, 4.4], [1664, 278, 0.7, 2.3],
];
function drawBird(ctx, x, y, s, flap) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.06); ctx.scale(s, s);
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    const tx = sd * 15, ty = -7.5 * flap - 1, mx = sd * 7, my = -4 - 3.5 * flap;
    ctx.moveTo(0, -0.6); ctx.quadraticCurveTo(mx, my - 2.3, tx, ty); ctx.quadraticCurveTo(mx, my + 1.3, 0, 1.7);
  }
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(-0.5, 0.6, 4.4, 1.8, 0.12, 0, L.TAU); ctx.fill();
  ctx.restore();
}

export default {
  name: '古塔夕照',
  tone: 'light',
  init(env) {
    const a = env.arc, sun = sunOf(a);
    const clouds = buildClouds(env);
    const hill = buildHill(env);
    // what stands in front of the sun (pagoda, trees, ridge), cut out of the hill layer for the bloom pass
    const CW = 820, CH = 780, cx0 = Math.round(sun.x - 400), cy0 = Math.round(sun.y - 430);
    const occ = L.makeCanvas(CW, CH);
    occ.getContext('2d').drawImage(hill, cx0 + PAD, cy0 + PAD, CW, CH, 0, 0, CW, CH);
    const BN = BLOOM_R / 2;                              // bloom buffers at quarter size
    const sk = buildSky(env);
    // halation: only the part of the ember line that is actually seen past the trees glows, and it bleeds a few px into them
    const eg = sk.ember.getContext('2d');
    eg.globalCompositeOperation = 'destination-out'; eg.drawImage(hill, 0, -(EMBER_TOP + PAD));
    S = { sky: sk.sky, ember: L.blurred(sk.ember, 4.5), lit: clouds.lit, dark: clouds.dark, hill, sunLight: buildSunLight(env), occ, occX: cx0, occY: cy0,
      b0: L.makeCanvas(BN, BN), b1: L.makeCanvas(BN, BN) };
  },
  draw(ctx, env, p) {
    const a = env.arc, sun = sunOf(a);
    const rot = L.lerp(-0.006, 0.006, p), zoom = L.lerp(1.0, 1.02, p);
    const skyRot = rot * 0.15, skyZoom = 1 + (zoom - 1) * 0.6;
    L.blit(ctx, env, S.sky, { rot: skyRot, zoom: skyZoom });
    // cloud parallax: the high cirrus barely moves, the low streaks slide the other way
    L.blit(ctx, env, S.lit, { dx: L.lerp(6, -6, p), zoom: 1 + (zoom - 1) * 0.4, blend: 'screen', alpha: 0.55 });
    L.blit(ctx, env, S.dark, { dx: L.lerp(-13, 13, p), zoom: 1 + (zoom - 1) * 0.6, blend: 'multiply', alpha: 0.85 });
    // birds heading home toward the pagoda
    ctx.save(); ctx.fillStyle = INK; ctx.globalAlpha = 0.92;
    for (const [x, y, s, ph] of BIRDS) drawBird(ctx, x - 16 * p * (0.6 + s * 0.5), y - 3 * p + Math.sin(ph + p * 4) * 1.5, s * 1.25, Math.sin(ph + p * 9));
    ctx.restore();
    // hill, trees, pagoda: slide along the ridge
    L.blit(ctx, env, S.hill, { rot, zoom });
    // halation: the ember line bleeds a few px over the edge of the ridge (cut to the tree line, so it rides with the hill)
    L.cam(ctx, env, { rot, zoom }, () => {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5;
      ctx.drawImage(S.ember, -PAD, EMBER_TOP);
    });

    // bloom: the sun's light, minus whatever stands in front of it, spread and laid back over the frame — so the disc
    // eats into the edges of the pagoda, the doorways flare, and the black lifts to a warm brown inside the glare
    const c = Math.cos(skyRot), sn = Math.sin(skyRot), ux = sun.x - a.cx, uy = sun.y - a.cy;
    const sx = a.cx + (ux * c - uy * sn) * skyZoom, sy = a.crestY + (a.cy - a.crestY + ux * sn + uy * c) * skyZoom;   // where the sky's move puts the sun
    const q = 0.25, x0 = sx - BLOOM_R, y0 = sy - BLOOM_R, N = BLOOM_R * 2;
    const g0 = S.b0.getContext('2d'), g1 = S.b1.getContext('2d');
    g0.setTransform(1, 0, 0, 1, 0, 0); g0.globalCompositeOperation = 'source-over'; g0.clearRect(0, 0, S.b0.width, S.b0.height);
    g0.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
    g0.drawImage(S.sunLight, x0, y0);
    g0.globalCompositeOperation = 'destination-out';
    L.cam(g0, env, { rot, zoom }, () => g0.drawImage(S.occ, S.occX, S.occY));
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const [blur, alpha] of [[1.8, 0.4], [8, 0.22]]) {
      g1.setTransform(1, 0, 0, 1, 0, 0); g1.clearRect(0, 0, S.b1.width, S.b1.height);
      g1.globalCompositeOperation = 'source-over';
      g1.filter = `blur(${blur}px)`; g1.drawImage(S.b0, 0, 0); g1.filter = 'none';
      if (blur > 4) {                                        // the wide spread goes red, as glare does away from its source
        g1.globalCompositeOperation = 'source-atop'; g1.fillStyle = 'rgba(255,84,40,0.6)'; g1.fillRect(0, 0, S.b1.width, S.b1.height);
      }
      ctx.globalAlpha = alpha; ctx.drawImage(S.b1, x0, y0, N, N);
    }
    ctx.restore();
    // a veil of glare over the foot of the pagoda
    L.glow(ctx, sx, sy + 20, 210, '#ff8a3a', 0.12);
    L.vignette(ctx, { strength: 0.18 });
  },
};
