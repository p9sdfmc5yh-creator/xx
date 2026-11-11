// g12 — 彩笺·留白: old coloured letter-papers (朱红 / 藤黄 / 石绿 / 月白 / 粉 / 靛蓝) layered over the whole page; the pile is die-cut
// through in the shape of the CURRENT GLYPH, showing the dark-brown mount underneath (negative form, the reference's
// stamps-around-a-5). Whatever the strokes enclose stays on the mount as a small stack of its own.
// Some slips carry a 连钱纹 border, some red ruled columns, some an all-over 连钱 diaper or gold flecks. No writing anywhere.
// Nothing here knows which character it is: slips, shadows and the depth of the cut are sized from K.glyphInfo().strokeWidth,
// the cut is K.glyphPath, and the shadow inside it is ray-marched through K.sdGlyph at device resolution (L.pixelCanvas).
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LX = -0.6, LY = -0.8;          // unit vector pointing AT the light (top-left), in page space
let layer = null;

const PAL = [
  { c: '#b23826', ink: '#e9c97c', dark: true, w: 0.8 },   // 朱红
  { c: '#dba22a', ink: '#9a3a22', w: 1.1 },               // 藤黄
  { c: '#6c9c80', ink: '#27503f', w: 1 },                 // 石绿
  { c: '#dde6e1', ink: '#b8452f', w: 1.1 },               // 月白
  { c: '#e3aca1', ink: '#9c3d2d', w: 1 },                 // 粉
  { c: '#3a5984', ink: '#d3dad6', dark: true, w: 0.7 },   // 靛蓝
  { c: '#ebe0c6', ink: '#b8452f', w: 0.8 },               // 素笺
];

// a chain of interlocking circles (连钱) from a to b, each with a tiny square "hole"
function chain(g, ax, ay, bx, by, rad) {
  const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / (rad * 1.414)));
  for (let i = 0; i <= n; i++) {
    const x = L.lerp(ax, bx, i / n), y = L.lerp(ay, by, i / n);
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
    const q = rad * 0.26; g.strokeRect(x - q, y - q, q * 2, q * 2);
  }
}

// a woodblock-printed bamboo sprig, tone on tone (花笺)
function sprig(g, r, hw, hh, ink) {
  g.save(); g.translate(r.range(-hw * 0.3, hw * 0.3), hh * 0.8); g.rotate(r.range(-0.22, 0.22));
  g.strokeStyle = L.rgba(ink, 0.36); g.fillStyle = L.rgba(ink, 0.3); g.lineCap = 'round';
  const segs = 5, l = (hh * 1.35) / segs; let y = 0;
  for (let i = 0; i < segs; i++) {
    const xa = Math.sin(i * 1.3) * 2.5, xb = Math.sin((i + 1) * 1.3) * 2.5;
    g.lineWidth = 3.4 - i * 0.45; g.beginPath(); g.moveTo(xa, y - 2); g.lineTo(xb, y - l + 2); g.stroke();
    for (let k = 0, nl = r.int(2, 3); k < nl; k++) {
      const a = -Math.PI / 2 + (k % 2 ? 1 : -1) * r.range(0.55, 1.3), ll = r.range(34, 64), wd = r.range(5, 8.5);
      g.save(); g.translate(xb, y - l); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(ll * 0.42, -wd, ll, 0); g.quadraticCurveTo(ll * 0.42, wd, 0, 0); g.fill(); g.restore();
    }
    y -= l;
  }
  g.restore();
}

/** one slip, w × h page px, to be stamped at angle `rot` (so that its lit / shaded edges agree with the page's light); u = drawing scale */
function makeSlip(w, h, pal, kind, seed, tex, rot, u) {
  const r = L.rng(seed);
  const cs = Math.cos(rot), sn = Math.sin(rot), lx = LX * cs + LY * sn, ly = -LX * sn + LY * cs;   // the light, seen from the slip
  return K.sprite(Math.ceil(w + 10), Math.ceil(h + 10), (g) => {
    g.scale(u, u);
    const W = w / u, H = h / u, hw = W / 2, hh = H / 2;
    const pts = [];
    const edge = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0); if (len < 1) return;
      const n = Math.max(2, Math.round(len / 24)), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      for (let i = 0; i < n; i++) { const t = i / n, j = i === 0 ? 0 : r.range(-0.55, 0.55); pts.push([L.lerp(x0, x1, t) + nx * j, L.lerp(y0, y1, t) + ny * j]); }
    };
    const dog = r.chance(0.3) ? r.range(16, 34) : 0;
    edge(-hw, -hh, hw - dog, -hh); edge(hw - dog, -hh, hw, -hh + dog); edge(hw, -hh + dog, hw, hh); edge(hw, hh, -hw, hh); edge(-hw, hh, -hw, -hh);
    const outline = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    outline();
    const col = L.shade(pal.c, r.range(-0.07, 0.07));
    g.fillStyle = col; g.fill();
    g.save(); g.clip();
    // large: uneven dye, a soft lift of light on the side that faces the lamp
    const dd = Math.hypot(hw, hh) * 0.85;
    g.fillStyle = L.linear(g, lx * dd, ly * dd, -lx * dd, -ly * dd, [[0, 'rgba(255,250,235,0.15)'], [0.5, 'rgba(255,250,235,0)'], [1, 'rgba(30,15,5,0.16)']]);
    g.fillRect(-hw - 4, -hh - 4, W + 8, H + 8);
    for (let i = 0; i < 5; i++) {
      const x = r.range(-hw, hw), y = r.range(-hh, hh), rr = r.range(60, 150);
      g.fillStyle = L.radial(g, x, y, 0, rr, [[0, L.rgba(r.chance(0.5) ? '#fff6e0' : '#3a2412', r.range(0.05, 0.11))], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // medium: printed decoration
    const ink = pal.ink; g.lineJoin = 'round';
    if (kind === 'border') {
      const m = 11, rad = r.range(9.5, 12.5), band = rad * 2 + 7;
      g.strokeStyle = L.rgba(ink, 0.86); g.lineWidth = 2.2; g.strokeRect(-hw + m, -hh + m, W - 2 * m, H - 2 * m);
      g.lineWidth = 1.3; g.strokeRect(-hw + m + band, -hh + m + band, W - 2 * (m + band), H - 2 * (m + band));
      const o = m + band / 2; g.strokeStyle = L.rgba(ink, 0.8); g.lineWidth = 1.35;
      g.save(); g.beginPath(); g.rect(-hw + m, -hh + m, W - 2 * m, H - 2 * m); g.rect(-hw + m + band, -hh + m + band, W - 2 * (m + band), H - 2 * (m + band)); g.clip('evenodd');
      chain(g, -hw + o, -hh + o, hw - o, -hh + o, rad); chain(g, -hw + o, hh - o, hw - o, hh - o, rad);
      chain(g, -hw + o, -hh + o, -hw + o, hh - o, rad); chain(g, hw - o, -hh + o, hw - o, hh - o, rad);
      g.restore();
    } else if (kind === 'ruled') {
      const m = 15; g.strokeStyle = L.rgba(ink, 0.82); g.lineWidth = 2.6; g.strokeRect(-hw + m, -hh + m, W - 2 * m, H - 2 * m);
      g.lineWidth = 1.2; g.strokeRect(-hw + m + 5, -hh + m + 5, W - 2 * m - 10, H - 2 * m - 10);
      const n = Math.max(4, Math.round((W - 2 * m) / 30));
      for (let i = 1; i < n; i++) {
        const x = -hw + m + 5 + ((W - 2 * m - 10) * i) / n;
        g.globalAlpha = r.range(0.7, 1); g.lineWidth = r.range(1.1, 1.6);
        g.beginPath(); g.moveTo(x + r.range(-0.4, 0.4), -hh + m + 5); g.lineTo(x + r.range(-0.4, 0.4), hh - m - 5); g.stroke();
      }
      g.globalAlpha = 1;
    } else if (kind === 'diaper') {
      const d = r.range(30, 38), rad = d / 1.414;                       // 连钱锦: overlapping rings, tone on tone
      g.strokeStyle = L.rgba(pal.dark ? L.shade(col, 0.3) : L.shade(col, -0.3), 0.5); g.lineWidth = 1.4;
      for (let y = -hh - d; y <= hh + d; y += d) for (let x = -hw - d; x <= hw + d; x += d) { g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke(); }
    } else {
      sprig(g, r, hw, hh, pal.dark ? L.shade(col, 0.45) : L.shade(col, -0.45));
      // 洒金笺: flecks of gold leaf, each a small torn quad
      for (let i = 0, n = Math.round((W * H) / 1200); i < n; i++) {
        const x = r.range(-hw, hw), y = r.range(-hh, hh), s = r.range(1.6, 4.6) * (r.chance(0.12) ? 1.8 : 1), a = r() * TAU;
        g.fillStyle = L.rgba(r.pick(['#e2c26a', '#f2dc98', '#c9a44a']), r.range(0.6, 0.95));
        g.beginPath();
        for (let k = 0; k < 4; k++) { const t = a + (k / 4) * TAU + r.range(-0.3, 0.3), rr = s * r.range(0.6, 1.1); k ? g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) : g.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); }
        g.closePath(); g.fill();
        if (s > 2.4) { g.fillStyle = 'rgba(255,248,214,0.85)'; g.beginPath(); g.ellipse(x + lx * s * 0.22, y + ly * s * 0.22, s * 0.3, s * 0.2, a, 0, TAU); g.fill(); }   // the leaf glints
      }
    }
    // a dog-eared corner: the flap lies folded back on the sheet, plain side up, and throws its own small shadow
    if (dog) {
      const ax = hw - dog, ay = -hh, bx = hw, by = -hh + dog, tx = ax + r.range(-2, 2), ty = by + r.range(-2, 2);
      const flap = () => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(tx, ty); g.closePath(); };
      g.save(); g.shadowColor = 'rgba(30,14,4,0.6)'; g.shadowBlur = 5 * u; g.shadowOffsetX = -lx * 3 * u; g.shadowOffsetY = -ly * 3 * u;
      flap(); g.fillStyle = L.shade(col, pal.dark ? 0.26 : 0.1); g.fill(); g.restore();
      flap(); g.fillStyle = L.linear(g, (ax + bx) / 2, (ay + by) / 2, tx, ty, [[0, 'rgba(255,250,236,0.4)'], [0.4, 'rgba(255,250,236,0.04)'], [1, 'rgba(40,20,8,0.14)']]); g.fill();
      g.strokeStyle = 'rgba(60,30,10,0.4)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(ax, ay); g.lineTo(tx, ty); g.lineTo(bx, by); g.stroke();
    }
    // paper body: fibres and stains multiplied in, so the print sits in the sheet
    const tw = (W + 8) * u, th = (H + 8) * u, ox = r.int(0, S - Math.ceil(tw) - 2), oy = r.int(0, S - Math.ceil(th) - 2);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = pal.dark ? 0.75 : 0.95;
    g.drawImage(tex, ox, oy, tw, th, -hw - 4, -hh - 4, W + 8, H + 8);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (pal.dark) { g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.05; g.drawImage(tex, ox, oy, tw, th, -hw - 4, -hh - 4, W + 8, H + 8); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    // micro: this sheet's own long fibres, pale and dark
    g.lineCap = 'round';
    for (let i = 0, n = Math.round((W * H) / 2400); i < n; i++) {
      const x = r.range(-hw, hw), y = r.range(-hh, hh), len = r.range(8, 28), a = r() * TAU, b = a + r.range(-0.7, 0.7);
      g.strokeStyle = r.chance(0.55) ? L.rgba('#fff8e6', r.range(0.12, 0.26)) : L.rgba('#3a2412', r.range(0.08, 0.18)); g.lineWidth = r.range(0.7, 1.15);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(b) * len * 0.5, y + Math.sin(b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    // an old water stain with its tide line
    if (r.chance(0.45)) {
      const cx = r.range(-hw, hw), cy = r.range(-hh, hh), R0 = r.range(45, 120), p1 = r() * TAU, p2 = r() * TAU;
      g.beginPath();
      for (let k = 0; k <= 48; k++) { const a = (k / 48) * TAU, rr = R0 * (1 + 0.2 * Math.sin(3 * a + p1) + 0.09 * Math.sin(7 * a + p2)); k ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8); }
      g.closePath(); g.fillStyle = 'rgba(120,80,40,0.07)'; g.fill(); g.strokeStyle = 'rgba(105,66,30,0.2)'; g.lineWidth = 1.5; g.stroke();
    }
    // a fold crease or two: a pressed-in dark line with the light catching the ridge beside it
    for (let i = 0, n = r.int(0, 2); i < n; i++) {
      const horiz = r.chance(0.6), p = r.range(-0.3, 0.3);
      const x0 = horiz ? -hw : W * p, y0 = horiz ? H * p : -hh, x1 = horiz ? hw : W * p + r.range(-3, 3), y1 = horiz ? H * p + r.range(-3, 3) : hh;
      g.strokeStyle = 'rgba(40,22,10,0.22)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = 'rgba(255,248,230,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + lx * 1.4, y0 + ly * 1.4); g.lineTo(x1 + lx * 1.4, y1 + ly * 1.4); g.stroke();
    }
    // foxing
    for (let i = 0, n = r.int(3, 9); i < n; i++) {
      const x = r.range(-hw, hw), y = r.range(-hh, hh), rr = r.range(1.5, 4.5);
      g.fillStyle = L.radial(g, x, y, 0, rr, [[0, L.rgba('#6a4322', r.range(0.2, 0.42))], [1, 'rgba(106,67,34,0)']]); g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // browned edges, then the sheet's thickness: a lit rim along the edges that face the lamp, a dark one along those that face away
    outline(); g.strokeStyle = 'rgba(70,40,15,0.07)'; g.lineWidth = 16; g.stroke(); g.lineWidth = 7; g.stroke();
    g.save(); g.translate(-lx * 0.95, -ly * 0.95); outline(); g.strokeStyle = 'rgba(255,250,236,0.6)'; g.lineWidth = 1.9; g.stroke(); g.restore();
    g.save(); g.translate(lx * 0.95, ly * 0.95); outline(); g.strokeStyle = 'rgba(40,20,8,0.42)'; g.lineWidth = 1.9; g.stroke(); g.restore();
    g.restore();
  });
}

/** fine paper tooth for the whole pile, one value per DEVICE pixel (to be multiplied in) */
function tooth(seed) {
  const nz = L.makeNoise(seed);
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q;
        let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177);
        const h = ((n ^ (n >>> 16)) >>> 0) / 4294967296;
        const v = 238 + 14 * nz.n2(x / 2.3, y / 2.3) + 8 * nz.n2(x / 9 + 40, y / 9) + 10 * (h - 0.5);
        d[k] = v; d[k + 1] = v - 1; d[k + 2] = v - 3; d[k + 3] = 255;
      }
    }
  });
}

/** what the cut pile does to the light on the mount: the lip on the lamp's side throws a shadow (sharp at the foot of the wall,
 *  softer further out) and every wall darkens its own foot. Computed from the glyph's distance field at device resolution. */
function cutShadow(sw) {
  const len = sw * 0.25, foot = sw * 0.16, ST = [0.08, 0.2, 0.34, 0.5, 0.67, 0.84, 1];
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q, sd = K.sdGlyph(x, y);
        if (sd > 1.5) continue;                                              // under the paper
        let sh = 0;
        for (let s = 0; s < ST.length; s++) {                                // walk toward the lamp: is paper standing in the way?
          const t = ST[s] * len, e = K.sdGlyph(x + LX * t, y + LY * t), soft = 0.45 + 0.2 * t;
          const v = L.clamp(0.5 + e / (2 * soft)) * (1 - 0.6 * ST[s] * ST[s]);
          if (v > sh) sh = v;
        }
        const occ = 0.5 * Math.exp(Math.min(0, sd) / foot);
        d[k] = 10; d[k + 1] = 5; d[k + 2] = 2; d[k + 3] = 255 * (1 - (1 - 0.86 * sh) * (1 - occ));
      }
    }
  });
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth;
  const u = L.clamp(sw / 75, 0.5, 1.15);       // the slips are a few stroke widths across, whichever glyph this is
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  // the mount: dark brown laid paper
  g.drawImage(K.paper({ base: '#402e22', tone: '#130a05', seed: 'g12mount', fiber: 0.4, stain: 0.6, foxing: 0.1, edge: 0.3 }), 0, 0);
  const rm = L.rng('g12laid');
  for (let y = 2; y < S; y += 4.5) { g.strokeStyle = `rgba(255,225,190,${rm.range(0.02, 0.05).toFixed(3)})`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y + rm.range(-0.3, 0.3)); g.lineTo(S, y + rm.range(-0.3, 0.3)); g.stroke(); }
  for (let x = 40; x < S; x += 96) { g.strokeStyle = 'rgba(20,10,4,0.16)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 1.5, S); g.stroke(); }

  // the pile of slips, on a plain backing sheet
  const tex = K.paper({ base: '#f3efe6', tone: '#7d6a4c', seed: 'g12tex', fiber: 0.95, stain: 0.45, foxing: 0.35, edge: 0 });
  const top = L.makeCanvas(S, S), t = top.getContext('2d');
  t.fillStyle = '#e4d8bd'; t.fillRect(0, 0, S, S);
  t.globalCompositeOperation = 'multiply'; t.drawImage(tex, 0, 0); t.globalCompositeOperation = 'source-over';
  const r = L.rng('g12slips' + info.key);
  const KINDS = ['border', 'ruled', 'diaper', 'fleck', 'border', 'ruled'];
  const tot = PAL.reduce((s, p) => s + p.w, 0);
  let last = -1, n = 0;
  const pick = () => { for (;;) { let v = r() * tot, i = 0; while (i < PAL.length - 1 && (v -= PAL[i].w) > 0) i++; if (i !== last) { last = i; return PAL[i]; } } };
  const lay = (w, h, x, y, rot, lift) => {
    const spr = makeSlip(w, h, pick(), r.pick(KINDS), 'g12s' + info.key + n++, tex, rot, u), far = 5.6 * lift * u;
    K.stamp(t, spr, x, y, { rot, shadow: { dx: -LX * far, dy: -LY * far, blur: 8 * lift * u, color: 'rgba(38,20,8,0.44)' } });   // the soft cast shadow (a lifted sheet throws it further)
    K.stamp(t, spr, x, y, { rot, shadow: { dx: -LX * 1.5, dy: -LY * 1.5, blur: 2.2, color: 'rgba(30,14,4,0.5)' } });               // the tight contact shadow under the edge
  };
  // bottom course: big sheets on a loose grid, so no gap is left anywhere
  const nb = Math.max(3, Math.round(S / (270 * u))), pitch = S / nb, cells = [];
  for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) cells.push([i, j, r()]);
  cells.sort((a, b) => a[2] - b[2]);
  for (const [i, j] of cells) {
    const w = r.range(290, 350) * u, h = r.range(360, 440) * u, rot = r.range(-0.16, 0.16) + (r.chance(0.3) ? Math.PI / 2 : 0);
    lay(w, h, (i + 0.5) * pitch + r.range(-34, 34) * u, (j + 0.5) * pitch + r.range(-34, 34) * u, rot, r.range(0.7, 1.1));
  }
  // upper courses: narrower slips thrown over them, kept apart so each shows
  const pts = [], want = Math.round(30 / (u * u)), dmin = 165 * u;
  for (let k = 0; k < 8000 && pts.length < want; k++) {
    const x = r.range(-20, S + 20), y = r.range(-20, S + 20);
    if (pts.every((p) => Math.hypot(p[0] - x, p[1] - y) > dmin)) pts.push([x, y]);
  }
  for (const [x, y] of pts) {
    const w = r.range(150, 215) * u, h = r.range(250, 380) * u, rot = r.range(-0.5, 0.5) + (r.chance(0.35) ? Math.PI / 2 : 0);
    lay(w, h, x, y, rot, r.chance(0.3) ? r.range(1.6, 2.3) : r.range(0.8, 1.2));
  }
  t.globalCompositeOperation = 'multiply'; t.drawImage(tooth('g12tooth'), 0, 0); t.globalCompositeOperation = 'source-over';
  const full = L.makeCanvas(S, S); full.getContext('2d').drawImage(top, 0, 0);          // the uncut pile: colours for the cut edges below

  // die-cut the glyph through the whole pile (even-odd: what the strokes enclose stays as a little stack of its own)
  t.globalCompositeOperation = 'destination-out'; K.fillGlyph(t, '#000'); t.globalCompositeOperation = 'source-over';

  // onto the mount. 1) the shadow the pile throws into the cut
  g.drawImage(cutShadow(sw), 0, 0);
  // 2) the wall of the cut that faces the lamp (lower-right side of every opening): the lit edges of the stacked sheets, one thin line each
  const N = 4, T = L.clamp(sw * 0.07, 2.4, 5.8), lam = L.makeCanvas(S, S), q = lam.getContext('2d');
  for (let k = N; k >= 1; k--) {
    q.globalCompositeOperation = 'source-over';
    q.fillStyle = '#e9dfc8'; q.fillRect(0, 0, S, S);
    q.drawImage(full, ((k * 97) % 160) - 80, ((k * 61) % 140) - 70);                    // each sheet down the stack has its own colours
    q.fillStyle = k % 2 ? 'rgba(255,249,232,0.5)' : 'rgba(255,249,232,0.2)'; q.fillRect(0, 0, S, S);
    if (k === N) { q.fillStyle = 'rgba(40,20,8,0.22)'; q.fillRect(0, 0, S, S); }
    q.globalCompositeOperation = 'destination-in'; q.drawImage(top, 0, 0);
    g.drawImage(lam, (LX * T * k) / N, (LY * T * k) / N);
  }
  // 3) the pile itself
  g.drawImage(top, 0, 0);
  // 4) the pressed edge of the top sheet: the light catches it on the lower-right side of the cut, it turns away on the upper-left
  g.save(); K.glyphPath(g); g.rect(0, 0, S, S); g.clip('evenodd'); g.lineJoin = 'round';
  const e = L.clamp(sw / 75, 0.65, 1.1);          // finer on a thinner stroke
  g.save(); g.translate(-LX * 0.9 * e, -LY * 0.9 * e); g.strokeStyle = 'rgba(255,249,230,0.7)'; g.lineWidth = 1.8 * e; K.strokeGlyph(g); g.restore();
  g.save(); g.translate(LX * 0.8 * e, LY * 0.8 * e); g.strokeStyle = 'rgba(26,12,4,0.5)'; g.lineWidth = 1.6 * e; K.strokeGlyph(g); g.restore();
  g.restore();
  // 5) one lamp for the whole table: a little warmer toward it, a little duller away from it
  g.fillStyle = L.linear(g, 0, 0, S, S, [[0, 'rgba(255,244,220,0.07)'], [0.5, 'rgba(255,244,220,0)'], [1, 'rgba(20,10,4,0.12)']]); g.fillRect(0, 0, S, S);
  return c;
}

export default {
  name: '彩笺·留白',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },   // a 3-frame flash: perfectly still
};
