// h2 — 铜汁入范: looking straight down into a round sand-and-clay mould. The coin-shaped cavity (the film's glyph: a disc with an
// axis-aligned square hole) is brim-full of white-hot copper; the square sand core stands dark in the middle. Over the 19 frames the
// melt breathes, its flow lines creep round the ring and a few oxide skins grow. Glyph by "material cut": the melt exists only inside K.GLYPH.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const G = K.GLYPH, TAU = Math.PI * 2;
const M = 2 * (G.R + 8), C0 = M / 2;                     // the melt is worked in an M × M box centred on the glyph
const RM = 496, RC = 452;                                 // mould outer radius, inner edge of the fired-clay casing
const GATE = -0.92;                                       // direction of the pouring gate (upper right), rad
let base = null, heatA = null, flowB = null, flowC = null, mask = null, rimFx = null, glowL = null, work = null, skins = [];

const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const disc = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); };

// ───────────────────────── the mould (static) ─────────────────────────
function buildBase() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const r = L.rng('h2base');
  // foundry floor: near-black charcoal and trodden sand
  g.drawImage(L.stoneTex(S, S, { base: '#1b1815', dark: '#0a0908', light: '#3b332a', seed: 'h2floor', scale: 240, speck: 1, rough: 0.8 }), 0, 0);
  L.speckle(g, { seed: 'h2floorg', count: 9000, x: 0, y: 0, w: S, h: S, rMin: 0.5, rMax: 2.1, colors: ['#6a5c4a', '#050404', '#8c7a62', '#2c2620'], alpha: [0.18, 0.6],
    test: (x, y) => Math.hypot(x - G.cx, y - G.cy) > RM - 4 });
  for (let i = 0; i < 46; i++) {                            // charcoal crumbs and spilt sand lumps lying on the floor, lit from the top-left
    const x = r() * S, y = r() * S; if (Math.hypot(x - G.cx, y - G.cy) < RM + 10) continue;
    const s = r.range(2.5, 7), rot = r() * 3;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.ellipse(x + 1.6, y + 2.2, s * 1.1, s * 0.8, rot, 0, TAU); g.fill();
    g.fillStyle = r.pick(['#14110f', '#2a231c', '#3a3026']); g.beginPath(); g.ellipse(x, y, s, s * r.range(0.55, 0.8), rot, 0, TAU); g.fill();
    g.fillStyle = 'rgba(170,150,120,0.22)'; g.beginPath(); g.ellipse(x - s * 0.25, y - s * 0.22, s * 0.45, s * 0.25, rot, 0, TAU); g.fill();
  }
  // the mould's shadow on the floor (light from the top-left)
  g.save(); g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 46; g.shadowOffsetX = 16; g.shadowOffsetY = 24;
  g.fillStyle = '#17120e'; disc(g, G.cx, G.cy, RM); g.fill(); g.restore();

  // sand face: dark, carbon-washed moulding sand with a rammed, slightly lumpy relief
  const sand = L.stoneTex(S, S, { base: '#3a3028', dark: '#1a1512', light: '#6b5a48', seed: 'h2sand', scale: 150, speck: 0.6, rough: 0.7 });
  const hgt = L.noiseTex(S, S, { seed: 'h2hgt', scale: 22, octaves: 3, gain: 0.62, res: 1, contrast: 1.3 });
  const bump = L.bumpLight(hgt, { angle: 45, strength: 2.6, res: 1 });
  g.save(); disc(g, G.cx, G.cy, RM); g.clip();
  g.drawImage(sand, 0, 0);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.75; g.drawImage(bump, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // broad daylight falling from the top-left
  g.fillStyle = L.linear(g, 120, 120, 960, 960, [[0, 'rgba(190,170,140,0.13)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.34)']]);
  g.fillRect(0, 0, S, S);
  // strickle marks: faint concentric scrapes left when the face was levelled
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const rr = r.range(G.R + 14, RC - 6), a0 = r() * TAU, len = r.range(0.25, 1.1);
    g.strokeStyle = r.chance(0.5) ? L.rgba('#9c8a72', r.range(0.04, 0.10)) : L.rgba('#000000', r.range(0.08, 0.18));
    g.lineWidth = r.range(0.8, 2.2); g.beginPath(); g.arc(G.cx + r.range(-3, 3), G.cy + r.range(-3, 3), rr, a0, a0 + len); g.stroke();
  }
  g.restore();

  // sand grains: quartz glints and dark carbon specks (drawn structure, on the sand only)
  L.speckle(g, { seed: 'h2grain', count: 15000, x: 40, y: 40, w: S - 80, h: S - 80, rMin: 0.45, rMax: 1.7,
    colors: ['#9a876e', '#0f0d0b', '#6a5b4b', '#c2ae92', '#1a1613'], alpha: [0.16, 0.62],
    test: (x, y) => Math.hypot(x - G.cx, y - G.cy) < RC - 2 && K.sdGlyph(x, y) > 1 });

  // heat-baked zone: the sand next to the metal is fired brick-red …
  g.save(); g.filter = 'blur(7px)'; g.lineWidth = 30; g.strokeStyle = 'rgba(150,62,26,0.55)'; K.strokeGlyph(g, { corner: 0 }); g.restore();
  // … and beyond it everything is smoked black: soot around the cavity, thickest by the pouring gate
  g.save(); disc(g, G.cx, G.cy, RM); g.clip();
  for (let i = 0; i < 230; i++) {
    const nearGate = i < 90;
    const a = nearGate ? GATE + r.gauss() * 0.42 : r() * TAU;
    const rr = nearGate ? r.range(G.R + 6, RM - 4) : G.R + 18 + Math.abs(r.gauss()) * 34;
    const x = G.cx + Math.cos(a) * rr, y = G.cy + Math.sin(a) * rr, rad = r.range(16, nearGate ? 64 : 46);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba('#050403', nearGate ? r.range(0.18, 0.36) : r.range(0.10, 0.24))], [1, 'rgba(5,4,3,0)']]);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 40; i++) {                            // the core's top is smoked too, from its four edges inwards
    const side = r.int(0, 3), u = r.range(-1, 1) * G.a, d = G.a - Math.abs(r.gauss()) * 26 - 8;
    const x = G.cx + (side === 0 ? u : side === 1 ? d : side === 2 ? u : -d), y = G.cy + (side === 0 ? -d : side === 1 ? u : side === 2 ? d : u);
    const rad = r.range(14, 34);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba('#050403', r.range(0.10, 0.22))], [1, 'rgba(5,4,3,0)']]);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // drying cracks running out from the cavity: a dark line with a lit lower-right lip
  for (let i = 0; i < 9; i++) {
    let a = r() * TAU; if (Math.abs(a - (TAU + GATE)) < 0.35) a += 0.8;
    let x = G.cx + Math.cos(a) * (G.R + 3), y = G.cy + Math.sin(a) * (G.R + 3), dir = a + r.range(-0.3, 0.3);
    const pts = [[x, y]], n = r.int(6, 12);
    for (let k = 0; k < n; k++) { dir += r.range(-0.5, 0.5); const st = r.range(6, 13); x += Math.cos(dir) * st; y += Math.sin(dir) * st; pts.push([x, y]); }
    for (const [ox, oy, col, lw] of [[0.9, 1.0, 'rgba(150,130,104,0.22)', 1.2], [0, 0, 'rgba(4,3,2,0.8)', 1.5]]) {
      g.strokeStyle = col; g.lineJoin = 'round';
      for (let k = 1; k < pts.length; k++) {
        g.lineWidth = lw * (1 - (k / pts.length) * 0.6);
        g.beginPath(); g.moveTo(pts[k - 1][0] + ox, pts[k - 1][1] + oy); g.lineTo(pts[k][0] + ox, pts[k][1] + oy); g.stroke();
      }
    }
  }
  // vent holes pricked through the sand with a wire, each with its own smoke stain
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + 0.21 + r.range(-0.08, 0.08); if (Math.abs(Math.atan2(Math.sin(a - GATE), Math.cos(a - GATE))) < 0.3) continue;
    const rr = 408 + r.range(-7, 7), x = G.cx + Math.cos(a) * rr, y = G.cy + Math.sin(a) * rr, hr = r.range(3.2, 4.6);
    g.fillStyle = L.radial(g, x, y, 0, 24, [[0, 'rgba(0,0,0,0.42)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - 24, y - 24, 48, 48);
    g.fillStyle = 'rgba(160,138,110,0.30)'; disc(g, x + 1.0, y + 1.2, hr + 0.9); g.fill();
    g.fillStyle = '#020201'; disc(g, x, y, hr); g.fill();
    g.fillStyle = 'rgba(255,120,30,0.20)'; disc(g, x + 0.6, y + 0.6, hr * 0.45); g.fill();     // a breath of fire-light down the vent
  }
  g.restore();

  // fired-clay casing round the sand (陶): terracotta, bevelled, chipped, with thumb marks
  const clay = L.stoneTex(S, S, { base: '#6d4c38', dark: '#39261b', light: '#9a745b', seed: 'h2clay', scale: 110, speck: 0.5, rough: 0.6 });
  g.save(); g.beginPath(); g.arc(G.cx, G.cy, RM, 0, TAU); g.arc(G.cx, G.cy, RC, 0, TAU, true); g.clip('evenodd');
  g.drawImage(clay, 0, 0);
  g.fillStyle = L.linear(g, 150, 150, 930, 930, [[0, 'rgba(255,225,190,0.20)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.50)']]); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 64; i++) {                            // thumb / paddle marks pressed across the casing
    const a = (i / 64) * TAU + r.range(-0.02, 0.02), r0 = RC + r.range(5, 10), r1 = RM - r.range(5, 10);
    for (const [da, col] of [[0, 'rgba(20,10,6,0.30)'], [0.006, 'rgba(230,190,160,0.14)']]) {
      g.strokeStyle = col; g.lineWidth = r.range(1.6, 3.2); g.beginPath();
      g.moveTo(G.cx + Math.cos(a + da) * r0, G.cy + Math.sin(a + da) * r0); g.lineTo(G.cx + Math.cos(a + da + 0.012) * r1, G.cy + Math.sin(a + da + 0.012) * r1); g.stroke();
    }
  }
  for (let i = 0; i < 44; i++) {                            // soot licking over the casing near the gate
    const a = GATE + r.gauss() * 0.38, rr = r.range(RC, RM), x = G.cx + Math.cos(a) * rr, y = G.cy + Math.sin(a) * rr, rad = r.range(18, 50);
    g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba('#050403', r.range(0.22, 0.42))], [1, 'rgba(5,4,3,0)']]); g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  L.speckle(g, { seed: 'h2clayp', count: 2600, x: 30, y: 30, w: S - 60, h: S - 60, rMin: 0.5, rMax: 1.9, colors: ['#2a1a12', '#b08a70', '#1a100b'], alpha: [0.2, 0.6] });
  g.restore();
  // bevels: outer edge catches light at the top-left; the inner edge drops a shadow onto the sand there and is lit at the lower right
  g.lineWidth = 3.5; g.strokeStyle = L.linear(g, 190, 190, 890, 890, [[0, 'rgba(240,205,170,0.62)'], [0.45, 'rgba(120,90,70,0.1)'], [1, 'rgba(0,0,0,0.72)']]);
  disc(g, G.cx, G.cy, RM - 1.6); g.stroke();
  g.save(); disc(g, G.cx, G.cy, RC); g.clip();
  g.filter = 'blur(5px)'; g.lineWidth = 16; g.strokeStyle = L.linear(g, 190, 190, 890, 890, [[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0)']]);
  disc(g, G.cx, G.cy, RC + 3); g.stroke(); g.restore();
  g.lineWidth = 2.2; g.strokeStyle = L.linear(g, 190, 190, 890, 890, [[0, 'rgba(0,0,0,0.75)'], [0.5, 'rgba(60,40,30,0.3)'], [1, 'rgba(225,185,150,0.5)']]);
  disc(g, G.cx, G.cy, RC); g.stroke();
  for (let i = 0; i < 7; i++) {                             // chips knocked out of the outer edge
    const a = r() * TAU, x = G.cx + Math.cos(a) * (RM - 1), y = G.cy + Math.sin(a) * (RM - 1), w = r.range(7, 16);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = '#0e0b09'; g.beginPath(); g.ellipse(1, 0, w * 0.45, w, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(190,150,120,0.35)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(1, 0, w * 0.45, w, 0, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
    g.restore();
  }

  // pouring gate (范口): a channel cut from the cavity to a cup in the casing; its metal has already frozen to a dull crusted red
  const gx = Math.cos(GATE), gy = Math.sin(GATE), cupR = 31, cupD = 441;
  g.save(); g.translate(G.cx, G.cy); g.rotate(GATE);
  g.beginPath(); g.moveTo(G.R - 6, -15); g.lineTo(cupD - 20, -19); g.arc(cupD, 0, cupR, Math.PI + 0.66, Math.PI - 0.66); g.lineTo(G.R - 6, 15); g.closePath();
  g.save(); g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 10; g.fillStyle = '#120806'; g.fill(); g.restore();
  g.clip();
  g.fillStyle = L.linear(g, G.R - 6, 0, cupD + cupR, 0, [[0, '#c4561a'], [0.2, '#863010'], [0.55, '#4c1a0b'], [1, '#26100a']]); g.fillRect(G.R - 10, -40, 130, 80);
  g.fillStyle = L.radial(g, cupD - 4, -3, 2, cupR, [[0, 'rgba(70,24,10,0.55)'], [0.45, 'rgba(26,10,5,0.7)'], [1, 'rgba(6,3,2,0.95)']]); g.fillRect(cupD - 40, -40, 80, 80);
  g.fillStyle = L.radial(g, cupD - 1, 9, cupR * 0.5, cupR * 1.3, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.85)']]); g.fillRect(cupD - 40, -40, 80, 80);   // the top-left wall shades the hollow
  for (let i = 0; i < 16; i++) {                            // crust plates on the frozen sprue, bright seams between them
    const x = r.range(G.R + 14, cupD + cupR), y = r.range(-cupR, cupR), w = r.range(5, 14);
    g.fillStyle = L.rgba('#170b07', r.range(0.3, 0.6)); g.beginPath(); g.ellipse(x, y, w, w * r.range(0.45, 0.8), r() * 3, 0, TAU); g.fill();
    g.strokeStyle = L.rgba('#e07a2a', r.range(0.06, 0.16)); g.lineWidth = 0.8; g.stroke();
  }
  g.restore();
  g.save(); g.translate(G.cx, G.cy); g.rotate(GATE);       // lip of the gate: dark top-left wall, lit lower-right wall
  g.lineWidth = 1.8; g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.beginPath(); g.moveTo(G.R + 4, -15.5); g.lineTo(cupD - 20, -19.5); g.arc(cupD, 0, cupR + 0.5, Math.PI + 0.66, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(214,170,130,0.32)';
  g.beginPath(); g.arc(cupD, 0, cupR + 0.8, 0, Math.PI - 0.66); g.lineTo(G.R + 4, 15.8); g.stroke();
  g.restore();
  g.fillStyle = L.radial(g, G.cx + gx * cupD, G.cy + gy * cupD, 10, 80, [[0, 'rgba(255,110,30,0.08)'], [1, 'rgba(255,110,30,0)']]);
  g.fillRect(G.cx + gx * cupD - 80, G.cy + gy * cupD - 80, 160, 160);
  return c;
}

// ───────────────────────── the melt (three per-pixel layers) ─────────────────────────
function buildMelt() {
  const nz = L.makeNoise('h2heat'), nb = L.makeNoise('h2flowB'), nc = L.makeNoise('h2flowC');
  const ramp = L.makeRamp([[0, '#861c02'], [0.22, '#d04608'], [0.42, '#f67a12'], [0.6, '#ffa92e'], [0.8, '#ffd570'], [1, '#fff8dc']]);
  const lut = new Uint8ClampedArray(1024 * 3);
  for (let i = 0; i < 1024; i++) { const q = ramp(i / 1023); lut[i * 3] = q[0]; lut[i * 3 + 1] = q[1]; lut[i * 3 + 2] = q[2]; }
  const iA = new ImageData(M, M), iB = new ImageData(M, M), iC = new ImageData(M, M);
  const A = iA.data, B = iB.data, Cc = iC.data;
  const PI = Math.PI;
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const dx = x - C0 + 0.5, dy = y - C0 + 0.5, rr = Math.hypot(dx, dy);
    if (rr > G.R + 6) continue;
    const k = (y * M + x) * 4;
    const sd = Math.max(rr - G.R, G.a - Math.max(Math.abs(dx), Math.abs(dy)));
    if (sd < 4) {
      // temperature: orange where the melt chills against the sand walls, white-hot down the middle of the channel
      const e = sstep(-2, 58, -sd);
      const n = nz.fbm(dx / 150 + 3.1, dy / 150 - 1.7, 3), n2 = nz.fbm(dx / 34 + 9, dy / 34 - 4, 2);
      let T = 0.45 + 0.43 * e + 0.2 * n + 0.07 * n2; T = T < 0 ? 0 : T > 1 ? 1 : T;
      const li = ((T * 1023) | 0) * 3;
      A[k] = lut[li]; A[k + 1] = lut[li + 1]; A[k + 2] = lut[li + 2]; A[k + 3] = 255;
    }
    // flow lines follow the ring: noise sampled in polar coordinates, two copies cross-faded so there is no seam
    const th = Math.atan2(dy, dx), th2 = th < 0 ? th + TAU : th;
    const w = sstep(PI * 0.3, PI * 0.7, Math.abs(th)), nrm = 1 / Math.sqrt(w * w + (1 - w) * (1 - w));
    let vb = 0, vc = 0;
    if (w < 1) {
      const sw = 0.5 * nb.n2(rr / 70, th * 1.4);
      vb += (1 - w) * (nb.ridged(th * 1.9 + sw, rr / 20 + sw * 0.6, 3) - 0.47);
      vc += (1 - w) * nc.fbm(th * 7.4 + sw * 2, rr / 6.5, 2);
    }
    if (w > 0) {
      const sw = 0.5 * nb.n2(rr / 70 + 40, th2 * 1.4 + 9);
      vb += w * (nb.ridged(th2 * 1.9 + sw + 31, rr / 20 + sw * 0.6 + 12, 3) - 0.47);
      vc += w * nc.fbm(th2 * 7.4 + sw * 2 + 17, rr / 6.5 + 23, 2);
    }
    vb *= nrm * 3.0; vc *= nrm * 1.5;
    if (vb > 0) { const a = Math.min(1, vb); B[k] = 255; B[k + 1] = 247; B[k + 2] = 208; B[k + 3] = Math.pow(a, 1.4) * 150; }
    else { const a = Math.min(1, -vb); B[k] = 184; B[k + 1] = 54; B[k + 2] = 6; B[k + 3] = a * 120; }
    if (vc > 0) { const a = Math.min(1, vc); Cc[k] = 255; Cc[k + 1] = 238; Cc[k + 2] = 176; Cc[k + 3] = a * 84; }
    else { const a = Math.min(1, -vc); Cc[k] = 160; Cc[k + 1] = 44; Cc[k + 2] = 4; Cc[k + 3] = a * 76; }
  }
  const mk = (img) => { const c = L.makeCanvas(M, M); c.getContext('2d').putImageData(img, 0, 0); return c; };
  heatA = mk(iA); flowB = mk(iB); flowC = mk(iC);
  // dross: tiny dark specks riding the surface, each with a brighter wake on its lower-right
  const gb = flowB.getContext('2d'), r = L.rng('h2dross');
  for (let i = 0; i < 70; i++) {
    const a = r() * TAU, rr = r.range(G.a + 20, G.R - 14), x = C0 + Math.cos(a) * rr, y = C0 + Math.sin(a) * rr, s = r.range(1.2, 3.4);
    gb.fillStyle = 'rgba(255,244,200,0.55)'; gb.beginPath(); gb.ellipse(x + 0.9, y + 0.9, s * 1.25, s * 0.9, a, 0, TAU); gb.fill();
    gb.fillStyle = L.rgba('#4a1a06', r.range(0.6, 0.9)); gb.beginPath(); gb.ellipse(x, y, s, s * r.range(0.5, 0.8), a + 1.2, 0, TAU); gb.fill();
  }
  mask = L.makeCanvas(M, M);
  K.fillGlyph(mask.getContext('2d'), '#fff', { cx: C0, cy: C0, corner: 3 });
}

// oxide skins: dark wrinkled crust islands with a thin glowing margin where the film is still translucent
function buildSkins() {
  const r = L.rng('h2skins');
  const spots = [[2.25, 262, 62], [0.55, 236, 50], [-2.3, 278, 44], [3.95 - TAU, 215, 38], [1.35, 300, 34], [-0.25, 290, 30]];
  skins = spots.map(([ang, rad, size], i) => {
    const nz = L.makeNoise('h2skin' + i), w = Math.round(size * 2 + 24), img = new ImageData(w, w), d = img.data;
    const squash = r.range(0.62, 0.86), tilt = r() * Math.PI, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const px = x - w / 2, py = y - w / 2, u = px * ct + py * st, v = (-px * st + py * ct) / squash;
      const f = 1 - Math.hypot(u, v) / size + 0.30 * nz.fbm(px / 36 + 5, py / 36 - 3, 2);
      if (f <= 0) continue;
      const k = (y * w + x) * 4;
      const al = sstep(0, 0.06, f), dep = sstep(0.02, 0.36, f);
      const wr = nz.ridged(u / 30 + 7, v / 8 + 2, 2);                // wrinkles run across the skin
      const lite = sstep(0.45, 0.92, wr) * dep;
      const crack = sstep(0.93, 0.99, nz.ridged(px / 44 - 8, py / 44 + 6, 2)) * dep;   // a few seams still glowing
      // margin #ffb347 → #b23c0a → body #2a1610, wrinkle crests a little greyer
      let R = L.lerp(L.lerp(255, 170, sstep(0, 0.3, dep)), 40, sstep(0.2, 0.8, dep));
      let Gc = L.lerp(L.lerp(176, 54, sstep(0, 0.3, dep)), 22, sstep(0.2, 0.8, dep));
      let Bc = L.lerp(L.lerp(70, 10, sstep(0, 0.3, dep)), 16, sstep(0.2, 0.8, dep));
      R += lite * 62 - px * 0.10 * dep - py * 0.10 * dep; Gc += lite * 44 - px * 0.08 * dep - py * 0.08 * dep; Bc += lite * 36;   // top-left a touch lighter
      R = L.lerp(R, 255, crack * 0.85); Gc = L.lerp(Gc, 150, crack * 0.85); Bc = L.lerp(Bc, 50, crack * 0.85);
      d[k] = R; d[k + 1] = Gc; d[k + 2] = Bc; d[k + 3] = al * (0.80 + 0.20 * dep) * 255;
    }
    const c = L.makeCanvas(w, w); c.getContext('2d').putImageData(img, 0, 0);
    return { c, ang, rad, rot: r.range(-0.5, 0.5), grow: r.range(0.14, 0.26), late: r.range(0, 0.25) };
  });
}

// static overlay drawn above the melt: the dark line where metal meets wall, and sand crumbs breaking that line
function buildRim() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d'), r = L.rng('h2rim');
  g.save(); g.filter = 'blur(1.2px)'; g.lineWidth = 3.4; g.strokeStyle = 'rgba(64,14,0,0.62)'; K.strokeGlyph(g, { corner: 3 }); g.restore();
  g.lineWidth = 1.1; g.strokeStyle = 'rgba(12,5,2,0.8)'; K.strokeGlyph(g, { corner: 3 });
  const crumb = (x, y) => {
    const s = r.range(0.8, 2.6);
    g.fillStyle = L.rgba(r.pick(['#120a06', '#1e120a', '#2c1a0e']), r.range(0.7, 0.95));
    g.beginPath(); g.ellipse(x, y, s, s * r.range(0.55, 0.9), r() * 3, 0, TAU); g.fill();
  };
  for (let i = 0; i < 300; i++) { const a = r() * TAU, rr = G.R + r.gauss() * 1.8 - 0.6; crumb(G.cx + Math.cos(a) * rr, G.cy + Math.sin(a) * rr); }
  for (let i = 0; i < 150; i++) {
    const side = r.int(0, 3), u = r.range(-1, 1) * G.a, d = G.a + r.gauss() * 1.7 + 0.6;
    crumb(G.cx + (side === 0 ? u : side === 1 ? d : side === 2 ? u : -d), G.cy + (side === 0 ? -d : side === 1 ? u : side === 2 ? d : u));
  }
  return c;
}

// soft bloom: the cavity's light spilling onto the sand, the core and the lens
function buildGlow() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.save(); g.filter = 'blur(44px)'; K.fillGlyph(g, 'rgba(255,120,24,0.62)'); g.restore();
  g.save(); g.filter = 'blur(13px)'; K.fillGlyph(g, 'rgba(255,170,60,0.34)'); g.restore();
  return c;
}

export default {
  name: '铜汁入范',
  init() {
    base = buildBase(); buildMelt(); buildSkins(); rimFx = buildRim(); glowL = buildGlow();
    work = L.makeCanvas(M, M);
  },
  draw(ctx, env, p) {
    const n = (env && env.frames) || 19, f = env && env.frame !== undefined ? env.frame : Math.round(p * (n - 1));
    const t = n > 1 ? f / (n - 1) : 0;
    const breath = 0.5 + 0.5 * Math.sin(t * TAU * 0.85 + 0.5);          // slow rise and fall of the melt's brightness
    const w = work.getContext('2d');
    w.setTransform(1, 0, 0, 1, 0, 0); w.globalCompositeOperation = 'source-over'; w.globalAlpha = 1;
    w.clearRect(0, 0, M, M);
    w.drawImage(heatA, 0, 0);
    w.save(); w.translate(C0, C0); w.rotate(0.35 + 0.07 * t); w.drawImage(flowB, -C0, -C0); w.restore();          // flow creeps round the ring
    w.save(); w.translate(C0, C0); w.rotate(-0.2 + 0.12 * t); w.globalAlpha = 0.55; w.drawImage(flowC, -C0, -C0); w.restore();
    w.globalCompositeOperation = 'lighter'; w.fillStyle = `rgba(255,196,110,${(0.02 + 0.10 * breath).toFixed(4)})`; w.fillRect(0, 0, M, M);
    w.globalCompositeOperation = 'destination-in'; w.drawImage(mask, 0, 0);
    w.globalCompositeOperation = 'source-over';

    ctx.drawImage(base, 0, 0);
    ctx.drawImage(work, G.cx - C0, G.cy - C0);
    ctx.drawImage(rimFx, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.62 + 0.26 * breath; ctx.drawImage(glowL, 0, 0); ctx.restore();
    ctx.save(); K.clipGlyph(ctx, { corner: 3 });                       // oxide skins ride above the bloom: they drift with the flow and grow
    for (const s of skins) {
      const g = L.clamp((t - s.late * 0.3) / (1 - s.late * 0.3)), a = s.ang + 0.07 * t, sc = 1 - s.grow * (1 - g);
      ctx.save(); ctx.translate(G.cx + Math.cos(a) * s.rad, G.cy + Math.sin(a) * s.rad); ctx.rotate(s.rot + 0.05 * t); ctx.scale(sc, sc);
      ctx.globalAlpha = 0.80 + 0.18 * g; ctx.drawImage(s.c, -s.c.width / 2, -s.c.height / 2); ctx.restore();
    }
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.16; ctx.drawImage(glowL, 0, 0); ctx.restore();   // a last veil of bloom ties them in
  },
};
