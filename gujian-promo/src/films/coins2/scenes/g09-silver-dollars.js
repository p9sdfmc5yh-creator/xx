// g09 — 银元: silver dollars (and their small change) laid out on white paper and photographed from above, spelling the CURRENT glyph.
// K.pack strings the coins along the strokes like beads (a dollar is as wide as a stroke, smaller denominations fill what is left).
// Every coin is a little relief: a height map (rim, bead ring, a worn dragon / junk / wreath — none of it writing) is lit per device
// pixel from the top-left (L.pixelCanvas), with a reeded side wall, a contact shadow and a cast shadow falling to the lower right.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
let layer = null;

const disc = (q, x, y, r) => { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); };
const oval = (q, x, y, rx, ry, rot) => { q.beginPath(); q.ellipse(x, y, rx, ry, rot, 0, TAU); q.fill(); };

// ── worn reliefs, painted as HEIGHT (grey = how far the metal stands up). None of them is writing. ──
function reliefDragon(q, R, r) {
  // a dragon coiled round its pearl: a wavy, nearly closed ring of body with a head, claws and flame curls
  const a0 = r.range(0, TAU), n = 110;
  const pos = (t) => { const ang = a0 + t * 0.88 * TAU, rad = R * (0.37 + 0.105 * Math.sin(t * TAU * 4.5)); return [Math.cos(ang) * rad, Math.sin(ang) * rad, ang]; };
  q.fillStyle = '#a2a2a2';
  for (let i = 0; i <= n; i++) { const t = i / n, [x, y] = pos(t); disc(q, x, y, R * (0.085 - 0.04 * t)); }
  const [hx, hy] = pos(0);
  q.fillStyle = '#aeaeae'; oval(q, hx, hy, R * 0.125, R * 0.095, a0 - Math.PI / 2);
  oval(q, hx + Math.cos(a0 - 2.2) * R * 0.13, hy + Math.sin(a0 - 2.2) * R * 0.13, R * 0.07, R * 0.028, a0 - 2.2);
  oval(q, hx + Math.cos(a0 - 1.2) * R * 0.14, hy + Math.sin(a0 - 1.2) * R * 0.14, R * 0.075, R * 0.026, a0 - 1.2);
  q.fillStyle = '#b4b4b4';                                  // the spine: a few low knobs along the body (raised, not pits)
  for (let i = 6; i < n - 10; i += 7) { const [x, y] = pos(i / n); disc(q, x, y, R * 0.026); }
  q.fillStyle = '#9c9c9c';                                  // claws
  for (const t of [0.2, 0.42, 0.64, 0.84]) {
    const [x, y, ang] = pos(t);
    for (let k = -1; k <= 1; k++) oval(q, x + Math.cos(ang + k * 0.5) * R * 0.12, y + Math.sin(ang + k * 0.5) * R * 0.12, R * 0.05, R * 0.018, ang + k * 0.5);
  }
  q.fillStyle = '#989898';                                  // flame / cloud curls in the field
  for (let k = 0; k < 7; k++) {
    const ang = a0 + 0.9 + k * 0.78 + r.range(-0.12, 0.12), rad = R * r.range(0.61, 0.66);
    oval(q, Math.cos(ang) * rad, Math.sin(ang) * rad, R * 0.065, R * 0.028, ang + 1.1);
    disc(q, Math.cos(ang + 0.1) * (rad - R * 0.04), Math.sin(ang + 0.1) * (rad - R * 0.04), R * 0.026);
  }
  q.fillStyle = '#b8b8b8'; disc(q, 0, 0, R * 0.075);        // the pearl
  q.fillStyle = '#9a9a9a'; for (let k = 0; k < 6; k++) oval(q, Math.cos(k * TAU / 6) * R * 0.13, Math.sin(k * TAU / 6) * R * 0.13, R * 0.04, R * 0.016, k * TAU / 6);
}
function reliefJunk(q, R) {
  // a three-masted junk on the swell — the reverse of the sailing-ship dollar — worn to ONE soft lump: the sails overlap each other
  // and sit on the hull, so the device is a single lopsided mass at any size and any rotation (separate upright bars could be read as a sign)
  const P = (f) => { q.beginPath(); f(); q.closePath(); q.fill(); };
  const m = (x, y) => q.moveTo(x * R, y * R), l = (x, y) => q.lineTo(x * R, y * R), c = (u, v, x, y) => q.quadraticCurveTo(u * R, v * R, x * R, y * R);
  // (no battens on the sails: a ribbed dome could be taken for a shell — the three sails only differ a little in height)
  q.fillStyle = '#9c9c9c'; P(() => { m(-0.56, 0.1); c(0, 0.27, 0.58, 0.04); c(0.36, 0.45, -0.04, 0.42); c(-0.42, 0.4, -0.56, 0.1); });          // hull
  q.fillStyle = '#8e8e8e'; P(() => { m(-0.47, 0.15); l(-0.45, -0.14); c(-0.37, -0.31, -0.25, -0.24); l(-0.18, 0.17); });                    // mizzen
  q.fillStyle = '#999999'; P(() => { m(0.1, 0.17); l(0.14, -0.3); c(0.3, -0.49, 0.41, -0.36); c(0.52, -0.12, 0.47, 0.1); });                  // fore sail
  q.fillStyle = '#aaaaaa'; P(() => { m(-0.22, 0.19); l(-0.28, -0.46); c(-0.1, -0.73, 0.07, -0.62); c(0.26, -0.3, 0.17, 0.19); });             // main sail, in front
  q.lineCap = 'round';
  q.strokeStyle = '#989898'; q.lineWidth = Math.max(0.8, R * 0.03);   // the swell under the hull
  for (let row = 0; row < 2; row++) for (let k = -2; k <= 2; k++) {
    const x = R * (k * 0.2 + row * 0.1), y = R * (0.53 + row * 0.085);
    if (Math.hypot(x, y) > R * 0.66) continue;
    q.beginPath(); q.arc(x, y + R * 0.07, R * 0.1, -2.3, -0.84); q.stroke();
  }
  q.fillStyle = '#a8a8a8'; disc(q, -R * 0.5, -R * 0.42, R * 0.05);  // a low sun and two birds as plain pellets
  disc(q, R * 0.4, -R * 0.52, R * 0.03); disc(q, R * 0.51, -R * 0.42, R * 0.026);
}
function reliefWreath(q, R, r) {
  for (const side of [-1, 1]) {
    q.strokeStyle = '#949494'; q.lineWidth = R * 0.035; q.lineCap = 'round';
    q.beginPath(); q.arc(0, 0, R * 0.5, Math.PI / 2 + side * 0.2, Math.PI / 2 + side * 2.75, side < 0); q.stroke();
    for (let k = 0; k < 9; k++) {
      const ang = Math.PI / 2 + side * (0.3 + k * 0.29), tilt = ang + side * (Math.PI / 2 - 0.62);
      for (const [dr, g] of [[0.07, '#a4a4a4'], [-0.07, '#9c9c9c']]) {
        const rad = R * (0.5 + dr) + r.range(-0.6, 0.6);
        q.fillStyle = g; oval(q, Math.cos(ang) * rad, Math.sin(ang) * rad, R * 0.095, R * 0.04, tilt + (dr > 0 ? 0 : side * 1.1));
      }
    }
  }
  q.fillStyle = '#a8a8a8'; oval(q, -R * 0.07, R * 0.55, R * 0.08, R * 0.04, 0.5); oval(q, R * 0.07, R * 0.55, R * 0.08, R * 0.04, -0.5);
  q.fillStyle = '#a6a6a6';                                  // a five-petal blossom in the middle
  for (let k = 0; k < 5; k++) disc(q, Math.cos(k * TAU / 5 - 1.57) * R * 0.15, Math.sin(k * TAU / 5 - 1.57) * R * 0.15, R * 0.088);
  q.fillStyle = '#b6b6b6'; disc(q, 0, 0, R * 0.065);
}

/** the struck face as a height map (grey = height): raised rim, bead ring, a worn device, worn pellets. Origin of the coin at (cx, cy). */
function heightMap(W, R, cx, cy, r, type, rot) {
  const hc = L.makeCanvas(W, W), q = hc.getContext('2d', { willReadFrequently: true });
  q.fillStyle = '#b2b2b2'; q.fillRect(0, 0, W, W);          // the rim's level runs on past the edge; the shader cuts and bevels the edge itself
  q.translate(cx, cy);
  q.fillStyle = '#585858'; disc(q, 0, 0, R * 0.9);          // the field
  const br = L.clamp(R * 0.042, 0.8, 1.7), nb = Math.max(10, Math.round((TAU * R * 0.84) / (br * 2.9)));
  q.fillStyle = '#b6b6b6';                                  // 珠圈: the bead ring just inside the rim
  for (let i = 0; i < nb; i++) { const t = rot + (i / nb) * TAU; disc(q, Math.cos(t) * R * 0.84, Math.sin(t) * R * 0.84, br); }
  q.save(); q.rotate(rot);
  if (type === 0) reliefDragon(q, R, r); else if (type === 1) reliefJunk(q, R); else reliefWreath(q, R, r);
  q.fillStyle = '#8e8e8e';                                  // worn pellets where a border ornament used to be
  const nl = r.int(10, 14), l0 = r.range(0, TAU);
  for (let i = 0; i < nl; i++) {
    const t = l0 + (i / nl) * TAU, x = Math.cos(t) * R * 0.735, y = Math.sin(t) * R * 0.735;
    oval(q, x, y, R * r.range(0.035, 0.055), R * r.range(0.022, 0.034), t + Math.PI / 2 + r.range(-0.3, 0.3));
  }
  q.restore();
  return hc;
}

// ── light: from the top-left, a little in front of the page ──
const NZ = L.makeNoise('g09silver');
const [LX, LY, LZ] = (() => { const v = [-0.5, -0.62, 0.6], l = Math.hypot(...v); return v.map((t) => t / l); })();
const [HX, HY, HZ] = (() => { const v = [LX, LY, LZ + 1], l = Math.hypot(...v); return v.map((t) => t / l); })();   // half-vector for a camera straight above

/**
 * Light the height map per DEVICE pixel: the top face (diffuse + a tight specular core, dark toning in the recesses, polished high
 * points, worn-flat tops) and the side wall that shows on the lower right (reeded, in shade, with light bounced up from the paper).
 * (cx, cy) is the centre of the top face, (ex, ey) the offset of the bottom face — the visible thickness.
 */
function shadeCoin(hc, W, R, cx, cy, ex, ey, r) {
  const blurRead = (px) => {
    const t = L.makeCanvas(W, W), g = t.getContext('2d', { willReadFrequently: true });
    g.filter = `blur(${px.toFixed(2)}px)`; g.drawImage(hc, 0, 0); g.filter = 'none';
    return L.getRaw(t).data;                                // device pixels, same grid as the pixelCanvas below
  };
  const hs = blurRead(Math.max(0.4, R * 0.011)), hw = blurRead(Math.max(1.5, R * 0.075));
  const ox = r.range(0, 900), oy = r.range(0, 900), capBase = r.range(138, 158), cavK = r.range(2.8, 4), gain = r.range(0.84, 1.06), hue = r.range(-1, 0.55) * r();
  const e2 = ex * ex + ey * ey, bw = Math.max(1.1, R * 0.05), Nr = Math.max(12, Math.round((TAU * R) / 2.3)), KS = 7.5 / 255;
  return L.pixelCanvas(W, W, (d, pw, ph, q) => {
    for (let j = 0; j < ph; j++) {
      const Y = (j + 0.5) / q - cy, jo = j * pw, jm = (j > 0 ? j - 1 : j) * pw, jp = (j < ph - 1 ? j + 1 : j) * pw;
      for (let i = 0; i < pw; i++) {
        const X = (i + 0.5) / q - cx;
        const tt = L.clamp((X * ex + Y * ey) / e2), ux = X - ex * tt, uy = Y - ey * tt, dcap = Math.sqrt(ux * ux + uy * uy) - R;
        if (dcap > 0.6) continue;                           // outside the coin's silhouette (top face swept to the bottom face)
        const rr = Math.sqrt(X * X + Y * Y) || 1e-6, d1 = rr - R, cov = L.clamp(0.5 - dcap * q), tf = L.clamp(0.5 - d1 * q);
        let v = 0, warm = 0;
        if (tf > 0) {                                       // ── the struck face ──
          const o = (jo + i) * 4, h = hs[o];
          const gx = (hs[(jo + (i < pw - 1 ? i + 1 : i)) * 4] - hs[(jo + (i > 0 ? i - 1 : i)) * 4]) * q * 0.5;   // slope per logical px
          const gy = (hs[(jp + i) * 4] - hs[(jm + i) * 4]) * q * 0.5;
          const mott = NZ.n2((X / R) * 1.4 + ox, (Y / R) * 1.4 + oy);
          const gs = 1 - 0.85 * L.smooth((h - (capBase + 20 * mott) + 7) / 14);   // wear: everything above the cap has been rubbed flat
          const sb = L.smooth((rr - (R - bw)) / bw) * 1.5;                        // the rounded edge of the rim
          let nx = -gx * gs * KS + (X / rr) * sb, ny = -gy * gs * KS + (Y / rr) * sb;
          const il = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= il; ny *= il;
          const ndl = nx * LX + ny * LY + il * LZ, ndh = nx * HX + ny * HY + il * HZ;
          const cav = (hw[o] - h) / 255, tone = 1 - L.clamp(cav * cavK, -0.36, 0.6);   // toning sits in the recesses, high points are polished
          const lus = 1 - 0.16 * ((X * 0.62 + Y * 0.78) / R);
          const grain = NZ.n2(X * 2.3 + ox, Y * 2.3 - oy);
          const flow = NZ.n2(Math.atan2(Y, X) * 26 + ox, rr * 0.22 + oy);          // flow lines of the strike: fine radial lustre
          v = ((0.15 + 0.7 * (ndl > 0 ? ndl : 0)) * tone * lus * (1 + 0.08 * mott + 0.035 * grain + 0.04 * flow)
            + 1.25 * (ndh > 0 ? Math.pow(ndh, 40) : 0) * (0.5 + 0.5 * tone)) * gain;
          warm = L.clamp(cav * 4);
        }
        if (tf < 1) {                                       // ── the side wall: faces away from the light, fine reeding, bounce light at its foot ──
          const wn = Math.max(0.35, (X * ex + Y * ey) / rr), tw = L.clamp(d1 / wn);
          const reed = Math.sin(Math.atan2(Y, X) * Nr);
          const vw = (0.24 + 0.27 * tw * Math.sqrt(tw)) * (1 + 0.16 * reed) * (0.8 + 0.2 * L.smooth(tw * 5));
          v = v * tf + vw * (1 - tf); warm *= tf;
        }
        const vv = v > 1.1 ? 1.1 : v, u = vv < 1 ? 1 - vv : 0, k = (jo + i) * 4;
        d[k] = vv * 232 + u * 14 + warm * 7 + hue * 5; d[k + 1] = vv * 236 + u * 17 + warm * 2 + hue; d[k + 2] = vv * 243 + u * 28 - warm * 9 - hue * 8; d[k + 3] = cov * 255;   // cold silver
      }
    }
  });
}

/** one coin of radius R, lit from the top-left; the sprite is centred on its silhouette (top face + visible side wall) */
function makeCoin(seed, R, type) {
  const r = L.rng(seed), T = Math.max(1, R * 0.1), ex = T * 0.57, ey = T * 0.82;
  const W = Math.ceil(2 * R + T + 6), cx = W / 2 - ex / 2, cy = W / 2 - ey / 2, rot = r.range(0, TAU), D = 2 * R;
  const body = shadeCoin(heightMap(W, R, cx, cy, r, type, rot), W, R, cx, cy, ex, ey, r);
  const q = body.getContext('2d'), lus = r.range(0, TAU), tone = r.range(0, 0.13), sc = L.clamp(R / 38, 0.3, 1.2);
  q.save(); q.translate(cx, cy);
  q.save(); q.beginPath(); q.arc(0, 0, R - 0.25, 0, TAU); q.clip();
  if (q.createConicGradient) {                              // cartwheel lustre: two bright and two dull sectors
    const cg = q.createConicGradient(lus, 0, 0);
    [[0, 'rgba(255,255,255,0.17)'], [0.13, 'rgba(255,255,255,0)'], [0.25, 'rgba(34,36,46,0.11)'], [0.37, 'rgba(34,36,46,0)'], [0.5, 'rgba(255,255,255,0.17)'],
      [0.63, 'rgba(255,255,255,0)'], [0.75, 'rgba(34,36,46,0.11)'], [0.87, 'rgba(34,36,46,0)'], [1, 'rgba(255,255,255,0.17)']].forEach(([t, c]) => cg.addColorStop(t, c));
    q.fillStyle = cg; q.fillRect(-R, -R, D, D);
  }
  q.fillStyle = L.radial(q, 0, 0, R * 0.5, R * 0.92, [[0, 'rgba(52,48,42,0)'], [0.8, `rgba(52,48,42,${r.range(0.08, 0.2).toFixed(3)})`], [1, 'rgba(52,48,42,0.04)']]);
  q.fillRect(-R, -R, D, D);                                 // toning gathers toward the rim
  for (let k = 0, n = r.int(3, 6); k < n; k++) {            // toning patches
    const a = r.range(0, TAU), dd = R * r.range(0.3, 0.85), x = Math.cos(a) * dd, y = Math.sin(a) * dd, rr = R * r.range(0.12, 0.34);
    q.fillStyle = L.radial(q, x, y, 0, rr, [[0, `rgba(48,46,44,${r.range(0.05, 0.14).toFixed(3)})`], [1, 'rgba(48,46,44,0)']]);
    q.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  q.fillStyle = `rgba(52,54,58,${tone.toFixed(3)})`; q.fillRect(-R, -R, D, D);
  // hairline scratches and bag marks
  q.lineCap = 'round';
  for (let k = 0, n = Math.round(r.int(5, 11) * sc); k < n; k++) {
    const a = r.range(0, TAU), dd = R * Math.sqrt(r()) * 0.92, x = Math.cos(a) * dd, y = Math.sin(a) * dd, len = R * r.range(0.08, 0.4), dir = r.range(0, TAU), light = r() < 0.55;
    q.strokeStyle = light ? `rgba(255,255,255,${r.range(0.18, 0.42).toFixed(3)})` : `rgba(30,30,36,${r.range(0.16, 0.32).toFixed(3)})`;
    q.lineWidth = r.range(0.4, 0.7);
    q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + Math.cos(dir + 0.15) * len * 0.5, y + Math.sin(dir + 0.15) * len * 0.5, x + Math.cos(dir) * len, y + Math.sin(dir) * len); q.stroke();
  }
  for (let k = 0, n = Math.round(r.int(4, 9) * sc); k < n; k++) {      // a nick: shaded on its top-left wall, lit on its lower-right wall
    const a = r.range(0, TAU), dd = R * Math.sqrt(r()) * 0.9, x = Math.cos(a) * dd, y = Math.sin(a) * dd, len = r.range(1.5, 3.4) * Math.min(1, R / 30), dir = r.range(0, TAU);
    q.lineWidth = 1; q.strokeStyle = 'rgba(28,28,34,0.5)'; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(dir) * len, y + Math.sin(dir) * len); q.stroke();
    q.lineWidth = 0.7; q.strokeStyle = 'rgba(255,255,255,0.6)'; q.beginPath(); q.moveTo(x + 0.7, y + 0.7); q.lineTo(x + 0.7 + Math.cos(dir) * len, y + 0.7 + Math.sin(dir) * len); q.stroke();
  }
  q.restore();
  // the bright core of the highlight: a hairline glint on the rim's shoulder where it turns toward the light
  const ga = Math.atan2(LY, LX) + r.range(-0.1, 0.1);
  q.lineCap = 'round';
  for (const [span, al, lw] of [[0.7, 0.3, 0.03], [0.34, 0.6, 0.022], [0.14, 0.95, 0.016]]) {
    q.lineWidth = Math.max(0.5, R * lw);
    q.strokeStyle = `rgba(255,255,255,${al})`; q.beginPath(); q.arc(0, 0, R - Math.max(0.9, R * 0.03), ga - span, ga + span); q.stroke();
  }
  q.restore();
  return body;
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth;        // every size below follows the stroke width of whichever glyph this is
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#f5f3ec', tone: '#8d8266', seed: 'g09paper', stain: 0.14, foxing: 0.1, edge: 0.1, fiber: 0.5 }), 0, 0);
  // the faint blind-stamped frame of the mount
  g.strokeStyle = 'rgba(110,100,80,0.16)'; g.lineWidth = 1.4; g.strokeRect(34.5, 34.5, S - 69, S - 69);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.strokeRect(36, 36, S - 72, S - 72);

  // dollars as wide as a stroke on its centre line, half dollars and small change in what is left
  const coins = K.pack({ seed: 'g09', rmax: sw * 0.58, rmin: Math.max(4.5, sw * 0.17), gap: 0.87, margin: -2.5 })
    .map((d, i) => ({ x: d.x, y: d.y, R: d.r + 0.5, i }));

  // shadows on the paper: a long soft one cast to the lower right, and the ambient dimming round each coin
  const mask = L.makeCanvas(S, S), mg = mask.getContext('2d');
  mg.fillStyle = '#1a1c26'; for (const co of coins) disc(mg, co.x, co.y, co.R);
  g.save(); g.globalCompositeOperation = 'multiply';
  g.filter = `blur(${(sw * 0.16).toFixed(2)}px)`; g.globalAlpha = 0.3; g.drawImage(mask, sw * 0.11, sw * 0.155);
  g.filter = `blur(${(sw * 0.04).toFixed(2)}px)`; g.globalAlpha = 0.2; g.drawImage(mask, 0, sw * 0.006);
  g.filter = 'none'; g.restore();

  // the coins, small ones first so that the dollars lie on top; each drops a cast shadow and a tight contact shadow on the paper and on the coins it lies on
  const pick = L.rng('g09type' + info.key), types = coins.map(() => pick.int(0, 2)), cache = new Map();
  const cast = { dx: sw * 0.045, dy: sw * 0.065, blur: Math.max(1.5, sw * 0.075), color: 'rgba(16,18,28,0.42)' };      // falls on the paper and on the coins underneath
  const contact = { dx: sw * 0.012, dy: sw * 0.018, blur: Math.max(0.8, sw * 0.026), color: 'rgba(10,12,20,0.6)' };
  for (const co of coins.slice().sort((a, b) => (a.R - b.R) || (a.i - b.i))) {
    let spr;
    if (co.i < 240) spr = makeCoin('g09coin' + info.key + co.i, co.R, types[co.i]);      // every larger coin is its own piece
    else {                                                                              // the smallest change shares a few dies per size
      const key = Math.round(co.R * 2) + '_' + (co.i % 4);
      if (!cache.has(key)) cache.set(key, makeCoin('g09small' + key, Math.round(co.R * 2) / 2, co.i % 3));
      spr = cache.get(key);
    }
    K.stamp(g, spr, co.x, co.y, { shadow: cast });
    K.stamp(g, spr, co.x, co.y, { shadow: contact });
  }
  return c;
}

export default {
  name: '银元',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                // a 3-frame flash: perfectly still
};
