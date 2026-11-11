// s09 — 银杏叶. Top-down macro of one ginkgo leaf lying on xuan paper: the arc is the upper margin of the fan.
// Below the arc the blade fills the frame — fine veins fan out from the leaf base (far below the frame), forking in two
// again and again (dichotomous venation: no midrib, no network), with one autumn-yellow streak right of centre.
// Above the arc: calm cream paper with a hairline of warm shadow along the leaf's edge.
//
// Recipe: the colour (green → yellow, mottling) is shaded per pixel at half resolution in init(); the veins are grown as a
// binary tree in polar coordinates about the leaf base, stroked into a height map and turned into relief with bumpLight.
// Two finished versions of the leaf (streak / streak a little wider) are cross-faded so the yellow seems to bleed outward.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 110;          // the leaf only slides ~25 px, so a modest margin is plenty
const D = 1500;           // the veins radiate from a point this far below the crest (the leaf base)
const PHI_Y = 0.235;      // direction (about the leaf base) of the autumn streak
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function geom(env) {
  const a = env.arc;
  const F = { x: a.cx, y: a.crestY + D };
  const d = a.R - D;                                   // the leaf base sits this far above the arc's centre
  const rhoM = (phi) => -d * Math.cos(phi) + Math.sqrt(a.R * a.R - d * d * Math.sin(phi) * Math.sin(phi));   // base → margin along a vein
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 48;
  const RW = W + PAD * 2, RH = H + PAD - Y0;
  // the margin undulates a few px around the arc, with a few shallow nicks (never at the crest)
  const nz = L.makeNoise('s09edge');
  const nicks = [[-668, 6.5, 10], [-287, 4.5, 8], [446, 7, 11], [871, 5.5, 9]];   // [px along the arc from the crest, depth, half-width]
  const margin = (theta) => {
    const u = theta * a.R;
    let dr = 1.4 - 4.4 * Math.pow(0.5 + 0.5 * nz.n2(u / 190, 1.3), 1.3) - 1.3 * (0.5 + 0.5 * nz.n2(u / 44, 7.7));
    for (const [u0, dep, hw] of nicks) { const t = 1 - Math.abs(u - u0) / hw; if (t > 0) dr -= dep * t * t * (3 - 2 * t); }
    return dr;
  };
  return { a, F, d, rhoM, X0, Y0, RW, RH, margin };
}

/** a canvas covering the leaf region, with a context that takes frame coordinates */
function regCanvas(G) {
  const c = L.makeCanvas(G.RW, G.RH), g = c.getContext('2d');
  g.translate(-G.X0, -G.Y0);
  return [c, g];
}

function marginPts(G) {
  const { a } = G, s = a.span(PAD + 90), n = Math.ceil((2 * s * a.R) / 3), out = [];
  for (let i = 0; i <= n; i++) { const th = L.lerp(-s, s, i / n); const p = a.pt(th, G.margin(th)); out.push([p.x, p.y]); }
  return out;
}
function leafPath(g, pts) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.lineTo(W + PAD + 500, H + PAD + 500); g.lineTo(-PAD - 500, H + PAD + 500); g.closePath();
}

/** dichotomous venation: every vein owns an angular sector; when the sector gets too wide it splits in two */
function growVeins(G) {
  const r = L.rng('s09veins'), nz = L.makeNoise('s09veinw');
  const out = [], stack = [];
  const RHO0 = 520, PHI = 0.98, STEP = 9;      // start well below the frame so the forks arrive already staggered
  const smax = (m) => L.lerp(50, 27, sstep(0.6, 0.95, m));      // veins pack tighter toward the margin
  for (let phi = -PHI; phi < PHI;) { const w = r.range(24, 40) / RHO0; stack.push([phi + w / 2, phi + w / 2, w, RHO0]); phi += w; }
  let id = 0;
  while (stack.length) {
    const [phi0, c, w, rho0] = stack.pop();
    const T = r.range(140, 230), jit = r.range(0.8, 1.25), k = id++;
    const pts = [];
    let rho = rho0, ph = phi0, m = 0;
    for (;;) {
      const e = 1 - Math.pow(1 - L.clamp((rho - rho0) / T), 2.2);       // leave the fork at an acute angle, then run parallel
      ph = L.lerp(phi0, c, e) + 0.02 * w * nz.n2(rho / 220, k * 3.7) * L.clamp((rho - rho0) / 60);
      pts.push([G.F.x + rho * Math.sin(ph), G.F.y - rho * Math.cos(ph)]);
      const rm = G.rhoM(ph); m = rho / rm;
      if (rho > rm + 16) break;
      if (rho - rho0 > T * 0.75 && rho * w > smax(m) * jit && m < 0.95) {
        const lo = c - w / 2, hi = c + w / 2, sp = c + w * r.range(-0.08, 0.08);
        stack.push([ph, (lo + sp) / 2, sp - lo, rho], [ph, (sp + hi) / 2, hi - sp, rho]);
        break;
      }
      rho += STEP;
    }
    out.push({ pts, m: (rho0 / G.rhoM(phi0) + m) / 2 });
  }
  return out;
}
function strokeVeins(g, veins, lw, style) {
  g.strokeStyle = style; g.lineCap = 'butt'; g.lineJoin = 'round';
  for (const v of veins) {
    g.lineWidth = lw(v);
    g.beginPath(); v.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
  }
}

function ramp256(stops) {
  const f = L.makeRamp(stops), o = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) { const c = f(i / 255); o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; }
  return o;
}

/** leaf colour, shaded per pixel at half resolution → two canvases (the streak as it starts / a little wider) + the streak's bbox */
function buildColour(G) {
  const RES = 0.5, cw = Math.ceil(G.RW * RES), ch = Math.ceil(G.RH * RES);
  const nA = L.makeNoise('s09a'), nB = L.makeNoise('s09b');
  const GREEN = ramp256([[0, '#2f590d'], [0.25, '#4f7d1c'], [0.55, '#7aa524'], [0.8, '#9bbf2e'], [1, '#aed034']]);
  const YELL = ramp256([[0, '#e4b01c'], [0.5, '#f2c230'], [1, '#ffe05a']]);
  const imA = new ImageData(cw, ch), imB = new ImageData(cw, ch), dA = imA.data, dB = imB.data;
  let bx0 = cw, bx1 = 0;
  for (let j = 0; j < ch; j++) {
    const y = G.Y0 + j / RES, dy = G.F.y - y;
    for (let i = 0; i < cw; i++) {
      const x = G.X0 + i / RES, dx = x - G.F.x;
      const rho = Math.sqrt(dx * dx + dy * dy), phi = Math.atan2(dx, dy);
      const v = G.rhoM(phi) - rho, u = phi * D;                  // v: px in from the margin along the vein; u: px across the veins
      const mott = 0.6 * nA.fbm(u / 170, v / 760, 3) + 0.4 * nA.fbm(x / 380, y / 380, 2);
      const strip = nA.n2(u / 11, v / 520 + 3);
      const lit = 0.085 * (1 - x / (W / 2));
      const deep = Math.max(sstep(120, 700, v), 0.55 * sstep(820, 1160, y));     // the blade thickens and darkens toward its base
      const s = L.clamp(0.82 - 0.6 * deep + 0.05 * mott + 0.02 * strip + lit);
      const sy = L.clamp(0.7 + 0.12 * mott + 0.04 * strip + lit * 0.6 - 0.25 * sstep(250, 700, v));
      // the streak: a flame along the veins, wide at the margin, feathered strip by strip
      const wy = L.lerp(0.088, 0.04, sstep(0, 620, v));
      const feather = 0.3 * nB.fbm(u / 9, v / 240, 2) + 0.4 * nB.fbm(x / 190, y / 190, 2);
      const dn = Math.abs(phi - PHI_Y) / wy + feather;
      const len = 1 - sstep(0, 260, v - 400 + 140 * nB.n2(u / 14, 9.1));
      const rim = 0.74 + 0.26 * sstep(0, 70, v);
      const ya = sstep(1.95, 0.22, dn) * len * rim, yb = sstep(1.95, 0.22, dn - 0.36) * len * rim;
      if (yb > 0.004) { if (i < bx0) bx0 = i; if (i > bx1) bx1 = i; }
      const gi = ((s * 255) | 0) * 3, yi = ((sy * 255) | 0) * 3, o = (j * cw + i) * 4;
      dA[o] = GREEN[gi] + (YELL[yi] - GREEN[gi]) * ya; dA[o + 1] = GREEN[gi + 1] + (YELL[yi + 1] - GREEN[gi + 1]) * ya; dA[o + 2] = GREEN[gi + 2] + (YELL[yi + 2] - GREEN[gi + 2]) * ya; dA[o + 3] = 255;
      dB[o] = GREEN[gi] + (YELL[yi] - GREEN[gi]) * yb; dB[o + 1] = GREEN[gi + 1] + (YELL[yi + 1] - GREEN[gi + 1]) * yb; dB[o + 2] = GREEN[gi + 2] + (YELL[yi + 2] - GREEN[gi + 2]) * yb; dB[o + 3] = 255;
    }
  }
  const up = (im) => {
    const sm = L.makeCanvas(cw, ch); sm.getContext('2d').putImageData(im, 0, 0);
    const c = L.makeCanvas(G.RW, G.RH), g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(sm, 0, 0, cw, ch, 0, 0, cw / RES, ch / RES);
    return c;
  };
  return { A: up(imA), B: up(imB), bx0: Math.max(0, Math.floor(bx0 / RES) - 8), bx1: Math.min(G.RW, Math.ceil(bx1 / RES) + 8) };
}

function buildLeaf(env) {
  const G = geom(env), { X0, Y0, RW, RH } = G;
  const polar = { cx: G.F.x - X0, cy: G.F.y - Y0, R: D };
  const veins = growVeins(G), edge = marginPts(G);
  const col = buildColour(G);

  // shared surface detail ─────────────────────────────────────────────
  // fine striation running with the veins
  const stri = L.noiseTex(RW, RH, { seed: 's09stri', scale: 5, sx: 1, sy: 60, octaves: 2, res: 1, contrast: 1.5, polar });
  // slow swells of the blade → broad soft light
  const swell = L.bumpLight(L.noiseTex(RW, RH, { seed: 's09swell', scale: 240, sx: 1.3, sy: 5, octaves: 2, res: 0.2, polar }), { angle: 350, strength: 10, res: 0.25 });
  // pale vein lines
  const [vein, vg] = regCanvas(G);
  strokeVeins(vg, veins, (v) => L.lerp(2.7, 1.8, sstep(0.6, 1, v.m)), '#ffffff');
  // height map: each vein a rounded rib standing on a wider swelling, plus a little skin texture
  const [broad, bg] = regCanvas(G); strokeVeins(bg, veins, (v) => L.lerp(8, 6, sstep(0.6, 1, v.m)), '#fff');
  const [ridge, rg] = regCanvas(G); strokeVeins(rg, veins, (v) => L.lerp(2.4, 1.7, sstep(0.6, 1, v.m)), '#fff');
  const hc = L.makeCanvas(RW, RH), hg = hc.getContext('2d');
  hg.fillStyle = '#000'; hg.fillRect(0, 0, RW, RH);
  hg.globalAlpha = 0.1; hg.drawImage(stri, 0, 0);
  hg.globalAlpha = 0.2; hg.drawImage(L.noiseTex(RW, RH, { seed: 's09skin', scale: 4.5, sx: 1, sy: 2.4, octaves: 2, res: 1, contrast: 1.5, polar }), 0, 0);
  hg.globalCompositeOperation = 'lighter';
  hg.globalAlpha = 0.22; hg.filter = 'blur(2.4px)'; hg.drawImage(broad, 0, 0);
  hg.globalAlpha = 0.8; hg.filter = 'blur(0.7px)'; hg.drawImage(ridge, 0, 0);
  hg.filter = 'none';
  const relief = L.bumpLight(hc, { angle: 350, strength: 2.0, res: 1 });

  const veinPale = L.makeCanvas(RW, RH), pg = veinPale.getContext('2d');
  pg.drawImage(vein, 0, 0); pg.globalCompositeOperation = 'source-in'; pg.fillStyle = '#f3f2a2'; pg.fillRect(0, 0, RW, RH);

  // a few pin-prick blemishes so the surface is not too perfect
  const [specks, sg] = regCanvas(G);
  L.speckle(sg, { seed: 's09speck', count: 420, x: X0, y: Y0, w: RW, h: RH, rMin: 0.5, rMax: 2.1, colors: ['#3b6410', '#2f560c', '#44700f', '#e6ee9a'], alpha: [0.1, 0.42] });
  const inner = (() => { const { a } = G, sp = a.span(PAD + 90), out = []; for (let i = 0; i <= 500; i++) { const th = L.lerp(-sp, sp, i / 500); const q = a.pt(th, G.margin(th) - 4.2); out.push([q.x, q.y]); } return out; })();

  const mask = L.makeCanvas(RW, RH), mg = mask.getContext('2d');
  mg.translate(-X0, -Y0); mg.fillStyle = '#000'; leafPath(mg, edge); mg.fill();

  const finish = (colour) => {
    const c = L.makeCanvas(RW, RH), g = c.getContext('2d');
    g.drawImage(colour, 0, 0);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.24; g.drawImage(stri, 0, 0);
    g.globalAlpha = 0.6; g.drawImage(swell, 0, 0);
    // veins: a shade lighter than the blade, whatever its colour
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.4; g.drawImage(vein, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.24; g.drawImage(veinPale, 0, 0);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.82; g.drawImage(relief, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(specks, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
    // the margin: a slightly darker, rolled edge
    g.globalCompositeOperation = 'source-atop';
    g.translate(-X0, -Y0); g.lineJoin = 'round';
    g.beginPath(); edge.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.strokeStyle = 'rgba(52,92,10,0.16)'; g.lineWidth = 16; g.stroke();
    g.strokeStyle = 'rgba(46,84,8,0.5)'; g.lineWidth = 3.4; g.stroke();
    // the rolled edge catches the light where it faces left
    g.beginPath(); inner.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.strokeStyle = L.linear(g, 0, 0, W, 0, [[0, 'rgba(238,250,170,0.5)'], [0.45, 'rgba(238,250,170,0.3)'], [0.7, 'rgba(238,250,170,0.08)'], [1, 'rgba(238,250,170,0)']]);
    g.lineWidth = 1.8; g.stroke();
    return c;
  };
  const fa = finish(col.A), fb = finish(col.B);

  // leaf A, with the hairline of warm shadow its edge drops on the paper (light from the left, a touch from below)
  const tint = L.makeCanvas(RW, RH), tg = tint.getContext('2d');
  tg.drawImage(mask, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#7d5a22'; tg.fillRect(0, 0, RW, RH);
  const leafA = L.makeCanvas(RW, RH), ga = leafA.getContext('2d');
  const wide = L.makeCanvas(RW, RH), wg = wide.getContext('2d');
  wg.filter = 'blur(10px)'; wg.drawImage(tint, 11, -6); wg.filter = 'none';
  wg.globalCompositeOperation = 'destination-in';   // the leaf does not lie perfectly flat: the soft shadow comes and goes along the edge
  wg.fillStyle = L.linear(wg, 0, 0, RW, 0, [[0, 'rgba(0,0,0,0.5)'], [0.16, 'rgba(0,0,0,0.95)'], [0.33, 'rgba(0,0,0,0.3)'], [0.5, 'rgba(0,0,0,0.6)'], [0.68, 'rgba(0,0,0,1)'], [0.85, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0.8)']]);
  wg.fillRect(0, 0, RW, RH);
  ga.globalAlpha = 0.4; ga.drawImage(wide, 0, 0);
  ga.globalAlpha = 0.4; ga.filter = 'blur(2.2px)'; ga.drawImage(tint, 2.2, -1.4);
  ga.globalAlpha = 1; ga.filter = 'none'; ga.drawImage(fa, 0, 0);
  // leaf B: only the strip where the streak differs
  const bw = Math.max(2, col.bx1 - col.bx0);
  const leafB = L.makeCanvas(bw, RH);
  leafB.getContext('2d').drawImage(fb, -col.bx0, 0);
  return { G, leafA, leafB, bx: X0 + col.bx0 };
}

/** xuan paper: cream, fine fibres, the faintest laid lines */
function buildPaper(env) {
  const a = env.arc;
  const pw = W + PAD * 2, ph = Math.ceil(a.yAt(0) + 70) + PAD;
  const c = L.makeCanvas(pw, ph), g = c.getContext('2d');
  g.drawImage(L.paperTex(pw, ph, { base: '#efe4c8', seed: 's09paper', tone: '#b89250', fiber: 1.3, stain: 0.22, grain: 0.14 }), 0, 0);
  // laid lines (帘纹) and a few long fibres
  g.fillStyle = 'rgba(150,118,60,0.045)';
  for (let y = 0; y < ph; y += 6) g.fillRect(0, y, pw, 1.4);
  g.fillStyle = 'rgba(150,118,60,0.035)';
  for (let x = 37; x < pw; x += 172) g.fillRect(x, 0, 2, ph);
  const r = L.rng('s09fib');
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = r() * pw, y = r() * ph, len = r.range(40, 150), an = r() * Math.PI, bend = r.range(-0.6, 0.6);
    g.strokeStyle = r.chance(0.55) ? L.rgba('#ffffff', r.range(0.16, 0.4)) : L.rgba('#a8813f', r.range(0.07, 0.18));
    g.lineWidth = r.range(0.6, 1.5);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(an + bend) * len * 0.5, y + Math.sin(an + bend) * len * 0.5, x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
  }
  // light falls from the left
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = L.linear(g, 0, 0, pw, ph * 0.5, [[0, 'rgba(255,250,230,0.5)'], [0.5, 'rgba(255,250,230,0)'], [1, 'rgba(120,90,40,0.28)']]);
  g.fillRect(0, 0, pw, ph);
  return c;
}

export default {
  name: '银杏叶',
  tone: 'dark',
  init(env) {
    S = { ...buildLeaf(env), paper: buildPaper(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc, G = S.G;
    const rot = L.lerp(-0.0105, 0.0105, p);
    L.cam(ctx, env, { rot: rot * 0.3 }, (c) => c.drawImage(S.paper, -PAD, -PAD));
    // the leaf slides along the arc; the yellow bleeds a little further out
    L.cam(ctx, env, { rot }, (c) => {
      c.drawImage(S.leafA, G.X0, G.Y0);
      c.globalAlpha = L.smooth(p);
      c.drawImage(S.leafB, S.bx, G.Y0);
    });
    // waxy sheen: one broad, soft band of light, no hard highlight
    ctx.save(); a.clipBelow(ctx, -7);
    ctx.globalCompositeOperation = 'soft-light';
    a.at(ctx, L.lerp(-0.2, -0.15, p), -150, () => {
      ctx.scale(2.3, 0.62);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, 330, [[0, 'rgba(255,255,225,0.34)'], [0.5, 'rgba(255,255,225,0.14)'], [1, 'rgba(255,255,225,0)']]);
      ctx.fillRect(-340, -340, 680, 680);
    });
    ctx.restore();
    L.vignette(ctx, { strength: 0.07, color: '#4a3410', inner: 0.6 });
  },
};
