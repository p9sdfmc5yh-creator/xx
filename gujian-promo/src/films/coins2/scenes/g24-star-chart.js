// g24 — 星图: an old celestial-atlas sheet seen from above. Deep teal sky paper, a stippled Milky Way, and the CURRENT GLYPH
// drawn as a constellation: raised gilt stars set along its outline (K.outline), bright ones on the stroke ends and turns, joined
// by a fine gold thread into closed figures; inside the strokes a nebula of gold dust settles on a lighter teal glow, so the
// character reads at stamp size. Nothing here knows which character it is; every size follows K.glyphInfo().strokeWidth.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LIGHT = [-0.64, -0.77];                               // unit vector TOWARD the light: it comes from the top-left
let layer = null;

function starPath(g, x, y, r, n, rot, inner, alt = 1) {     // alt < 1: every other ray is shorter (a compass-rose star)
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const t = rot + (i * Math.PI) / n, rr = i % 2 ? r * inner : (i / 2) % 2 ? r * alt : r;
    i ? g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) : g.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
  }
  g.closePath();
}
// a PAINTED gilt star symbol (flat shell gold on the paper): lit from the top-left, a darker lower-right edge, a pale core
function giltStar(g, x, y, r, n, rot, inner = 0.46) {
  starPath(g, x, y, r, n, rot, inner);
  g.fillStyle = L.linear(g, x - r, y - r, x + r, y + r, [[0, '#fff4c8'], [0.42, '#ecc76c'], [1, '#a06c24']]);
  g.fill();
  g.strokeStyle = 'rgba(70,42,8,0.55)'; g.lineWidth = Math.max(0.5, r * 0.05); g.lineJoin = 'round'; g.stroke();
  if (r > 8) {                                               // facet lines from the centre to each point, like an engraved star
    g.strokeStyle = 'rgba(110,70,16,0.38)'; g.lineWidth = Math.max(0.6, r * 0.035);
    g.beginPath();
    for (let i = 0; i < n; i++) { const t = rot + (i * TAU) / n; g.moveTo(x, y); g.lineTo(x + Math.cos(t) * r * 0.86, y + Math.sin(t) * r * 0.86); }
    g.stroke();
  }
  g.fillStyle = L.radial(g, x - r * 0.1, y - r * 0.12, 0, r * 0.42, [[0, 'rgba(255,252,232,0.95)'], [1, 'rgba(255,240,190,0)']]);
  g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fill();
}

/**
 * a RAISED gilt star as a sprite: a faceted stud of gilt metal with a visible side wall, every facet shaded by where it faces
 * (light from the top-left), pale ridges, dark valleys, a domed boss with a bright core. The rotation is baked in, so the sprite
 * must be stamped unrotated (the lighting would turn with it).
 */
function giltStud(r, n, rot, inner, alt, rnd, gold) {
  const th = Math.max(0.8, r * 0.15), pad = Math.ceil(th) + 3, size = Math.ceil(r) * 2 + pad * 2, step = Math.PI / n;
  return K.sprite(size, size, (q) => {
    q.lineJoin = 'round'; q.lineCap = 'round';
    for (let s = th; s > 0.05; s -= 0.35) {                  // the side wall: the silhouette extruded away from the light
      starPath(q, s * 0.64, s * 0.77, r, n, rot, inner, alt); q.fillStyle = gold(0.02 + 0.2 * (1 - s / th)); q.fill();
    }
    starPath(q, 0, 0, r, n, rot, inner, alt); q.fillStyle = gold(0.5); q.fill();
    const facets = [];
    for (let i = 0; i < n; i++) {
      const t = rot + i * 2 * step, rt = i % 2 ? r * alt : r, tx = Math.cos(t) * rt, ty = Math.sin(t) * rt;
      for (const s of [-1, 1]) {
        const tv = t + s * step, vx = Math.cos(tv) * r * inner, vy = Math.sin(tv) * r * inner;
        let nx = Math.cos(t + s * Math.PI / 2) + 0.4 * Math.cos(t), ny = Math.sin(t + s * Math.PI / 2) + 0.4 * Math.sin(t);
        const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
        const lam = nx * LIGHT[0] + ny * LIGHT[1], sh = L.clamp(0.52 + 0.44 * lam + rnd.range(-0.04, 0.04));
        q.fillStyle = L.linear(q, 0, 0, tx, ty, [[0, gold(sh + 0.1)], [1, gold(sh - 0.1)]]);
        q.beginPath(); q.moveTo(0, 0); q.lineTo(tx, ty); q.lineTo(vx, vy); q.closePath(); q.fill();
        q.strokeStyle = gold(sh); q.lineWidth = 0.3; q.stroke();
        facets.push({ tx, ty, vx, vy, lam });
      }
    }
    for (const f of facets) {                                 // the rim: a bright arris toward the light, a dark one away from it
      q.beginPath(); q.moveTo(f.tx, f.ty); q.lineTo(f.vx, f.vy);
      q.strokeStyle = f.lam > 0 ? `rgba(255,250,226,${(0.25 + 0.6 * f.lam).toFixed(3)})` : `rgba(46,26,4,${(0.3 - 0.5 * f.lam).toFixed(3)})`;
      q.lineWidth = Math.max(0.4, r * 0.035); q.stroke();
    }
    if (r > 3.5) {                                            // ridges catch the light, valleys hold the dirt
      q.lineWidth = Math.max(0.35, r * 0.028);
      for (let i = 0; i < n; i++) {
        const t = rot + i * 2 * step, rt = (i % 2 ? r * alt : r) * 0.94;
        q.strokeStyle = 'rgba(255,252,236,0.6)'; q.beginPath(); q.moveTo(0, 0); q.lineTo(Math.cos(t) * rt, Math.sin(t) * rt); q.stroke();
        q.strokeStyle = 'rgba(70,40,8,0.42)'; q.beginPath(); q.moveTo(0, 0); q.lineTo(Math.cos(t + step) * r * inner * 0.92, Math.sin(t + step) * r * inner * 0.92); q.stroke();
      }
    }
    q.save(); starPath(q, 0, 0, r, n, rot, inner, alt); q.clip();
    q.fillStyle = L.radial(q, -r * 0.3, -r * 0.36, 0, r * 0.62, [[0, 'rgba(255,249,220,0.5)'], [1, 'rgba(255,249,220,0)']]);   // soft sheen
    q.fillRect(-r, -r, r * 2, r * 2);
    if (r > 8) {                                              // hair scratches in the leaf
      for (let k = 0, m = rnd.int(3, 7); k < m; k++) {
        const a = rnd() * TAU, d = rnd.range(0, r * 0.6), x = Math.cos(a) * d, y = Math.sin(a) * d, b = rnd() * TAU, len = rnd.range(r * 0.15, r * 0.5);
        q.strokeStyle = rnd() < 0.5 ? 'rgba(58,34,8,0.3)' : 'rgba(255,252,230,0.34)'; q.lineWidth = rnd.range(0.3, 0.55);
        q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(b) * len, y + Math.sin(b) * len); q.stroke();
      }
    }
    q.restore();
    if (r > 4.5) {                                            // the boss: a small dome with its own shadow and a bright core
      const rb = r * 0.2;
      q.fillStyle = 'rgba(40,22,4,0.45)'; q.beginPath(); q.arc(rb * 0.3, rb * 0.4, rb * 1.08, 0, TAU); q.fill();
      q.fillStyle = L.radial(q, -rb * 0.35, -rb * 0.4, 0, rb * 1.3, [[0, '#fffef2'], [0.28, '#f8e29c'], [0.7, '#cf9d42'], [1, '#855718']]);
      q.beginPath(); q.arc(0, 0, rb, 0, TAU); q.fill();
      q.strokeStyle = 'rgba(60,34,6,0.55)'; q.lineWidth = Math.max(0.3, rb * 0.1); q.stroke();
      q.fillStyle = 'rgba(255,255,255,0.95)'; q.beginPath(); q.ellipse(-rb * 0.36, -rb * 0.42, rb * 0.27, rb * 0.18, -0.7, 0, TAU); q.fill();
    }
  });
}
/** set a raised star on the sheet: a soft cast shadow falling to the lower right, then a tight contact shadow */
function setStar(g, st) {
  const x = Math.round(st.x * L.SS) / L.SS, y = Math.round(st.y * L.SS) / L.SS, r = st.r;
  K.stamp(g, st.spr, x, y, { shadow: { dx: r * 0.3, dy: r * 0.42, blur: r * 0.55, color: 'rgba(0,10,14,0.5)' } });
  K.stamp(g, st.spr, x, y, { shadow: { dx: r * 0.07, dy: r * 0.1, blur: Math.max(0.8, r * 0.14), color: 'rgba(0,5,7,0.8)' } });
}

/**
 * The constellation figures of the current glyph: for every closed loop of its outline, the stars in order.
 * Dense samples of the outline (K.outline) → corners and stroke ends by their turning → a star on each, the rest spaced evenly.
 * kind: 'big' = a stroke end, 'mid' = a convex turn, 'ord' = everything else (including the inner corners where strokes meet).
 */
function figures(sw, rnd) {
  const ds = Math.max(1.5, sw * 0.04), grow = -sw * 0.08, spacing = sw * 0.5;
  const loops = [];
  for (const p of K.outline({ grow, spacing: ds, seed: 'g24o' })) (loops[p.loop] || (loops[p.loop] = [])).push(p);
  const dAng = (a, b) => { let t = b - a; while (t > Math.PI) t -= TAU; while (t < -Math.PI) t += TAU; return t; };
  const figs = [], bigs = [];
  for (const P of loops) {
    if (!P) continue;
    const m = P.length;
    if (m * ds < sw * 1.2) continue;                                             // a speck: too small to hold a figure
    const at = (i) => P[((i % m) + m) % m];
    const dir = (i0, i1) => { const a = at(i0), b = at(i1); return Math.atan2(b.y - a.y, b.x - a.x); };
    const k = Math.max(2, Math.round((sw * 0.45) / ds)), kw = Math.round((sw * 0.95) / ds), sep = Math.round((sw * 0.5) / ds);
    const nodes = [];
    if (m >= 4 * k) {
      const raw = new Float32Array(m), sc = new Float32Array(m);
      for (let i = 0; i < m; i++) raw[i] = Math.abs(dAng(dir(i - k, i), dir(i, i + k)));
      for (let i = 0; i < m; i++) { let s = 0; for (let j = -k; j <= k; j++) s += (k + 1 - Math.abs(j)) * raw[(((i + j) % m) + m) % m]; sc[i] = s / ((k + 1) * (k + 1)); }
      const w = Math.max(2, Math.round(sep * 0.4)), cand = [];
      for (let i = 0; i < m; i++) {
        if (sc[i] < 0.5) continue;
        let top = true; for (let j = 1; j <= w && top; j++) if (sc[(i + j) % m] > sc[i] || sc[(i - j + m) % m] >= sc[i]) top = false;
        if (top) cand.push(i);
      }
      cand.sort((a, b) => sc[b] - sc[a]);
      for (const i of cand) {
        if (nodes.some((nd) => { const dd = Math.abs(nd.i - i); return Math.min(dd, m - dd) < sep; })) continue;
        const a = at(i - k), b = at(i), c = at(i + k);
        const convex = K.sdGlyph((a.x + c.x) / 2, (a.y + c.y) / 2) < K.sdGlyph(b.x, b.y) - 0.5;
        const wide = m >= 2 * (kw + k) + 2 ? Math.abs(dAng(dir(i - kw - k, i - kw), dir(i + kw, i + kw + k))) : (nodes.length ? 0 : 9);
        let kind = convex ? (wide > 2.3 ? 'big' : 'mid') : 'ord';
        if (kind === 'big') { if (bigs.some((q) => Math.hypot(q.x - b.x, q.y - b.y) < sw * 1.1)) kind = 'mid'; else bigs.push(b); }
        nodes.push({ i, kind });
      }
    }
    const stars = [];
    const put = (idx, kind) => {
      const p = at(idx), nud = kind === 'big' ? sw * 0.06 : kind === 'mid' ? sw * 0.025 : 0;       // big stars sit a little deeper in the stroke
      stars.push({ x: p.x - Math.cos(p.ang) * nud, y: p.y - Math.sin(p.ang) * nud, kind });
    };
    const even = (n) => { const off = rnd() * m / n; for (let j = 0; j < n; j++) put(Math.round(off + (j * m) / n), 'ord'); };
    if (!nodes.length) even(Math.max(3, Math.round((m * ds) / spacing)));
    else {
      nodes.sort((a, b) => a.i - b.i);
      nodes.forEach((nd, q) => {
        put(nd.i, nd.kind);
        const nx = nodes[(q + 1) % nodes.length], La = ((nx.i - nd.i + m) % m) || m, n = Math.max(1, Math.round((La * ds) / spacing));
        for (let j = 1; j < n; j++) put(nd.i + Math.round((La * (j + rnd.range(-0.12, 0.12))) / n), rnd() < 0.1 ? 'mid' : 'ord');
      });
      if (stars.length < 3) { stars.length = 0; even(3); }
    }
    figs.push(stars);
  }
  return figs;
}

/**
 * Per-pixel layer at device resolution (transparent where there is nothing): the nebula inside the strokes — a lighter teal
 * wash with gold dust that thickens toward the middle of each stroke — its faint glow and stray dust just outside, and over
 * everything the tooth of the paper, lit from the top-left.
 */
function nebula(sw) {
  const nz = L.makeNoise('g24neb'), nt = L.makeNoise('g24tooth'), n2 = nz.n2, fbm = nz.fbm, t2 = nt.n2, sdG = K.sdGlyph;
  const haloR = sw * 0.5, iCore = 1 / (sw * 0.3), cs = 1 / (sw * 1.9), ws = 1 / Math.max(4, sw * 0.12), wob = Math.min(1.05, sw * 0.014);
  const iGlow = 1 / (sw * 0.13), iDust = 1 / (sw * 0.2);
  const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  return L.pixelCanvas(S, S, (d, pw, ph, q) => {
    for (let j = 0, k = 0; j < ph; j++) {
      const y = (j + 0.5) / q;
      for (let i = 0; i < pw; i++, k += 4) {
        const x = (i + 0.5) / q;
        let R = 0, G = 0, B = 0, A = 0, sd = sdG(x, y);
        if (sd < haloR) {
          if (sd < 3 && sd > -3) sd += wob * n2(x * ws + 5.3, y * ws - 2.1);                    // a hand-laid edge, not a ruled one
          const cl = fbm(x * cs + 7.1, y * cs - 3.3, 3);                                         // the clouds of the nebula
          const f = n2(x * 0.435, y * 0.435) * 0.62 + n2(x * 0.95 + 31.7, y * 0.95 - 12.4) * 0.38;   // the grain of the gold dust
          const o = sd > 0 ? sd : 0;
          let ag = 0.2 * Math.exp(-o * iGlow) * (0.75 + 0.9 * cl); if (ag < 0) ag = 0;            // teal glow past the edge
          const ad = 0.62 * sm((f - 0.4) * 5) * Math.exp(-o * iDust);                            // stray gold specks
          A = ad + ag * (1 - ad);
          if (A > 0) { const w = ag * (1 - ad); R = (236 * ad + 58 * w) / A; G = (205 * ad + 150 * w) / A; B = (128 * ad + 146 * w) / A; }
          const m = sd < -0.5 ? 1 : sd > 0.5 ? 0 : 0.5 - sd;
          if (m > 0) {
            const core = sm(-sd * iCore);
            let ga = 0.1 + 0.76 * core + 0.4 * cl; ga = ga < 0 ? 0 : ga > 1 ? 1 : ga;             // how much gold settled here
            let tg = 0.25 + 0.5 * core + 0.4 * cl; tg = tg < 0 ? 0 : tg > 1 ? 1 : tg;
            let ir = 19 + 33 * tg, ig = 98 + 62 * tg, ib = 104 + 50 * tg;                        // the wash: #136268 → #34a09a
            const hz = 0.42 * ga * ga; ir += (226 - ir) * hz; ig += (180 - ig) * hz; ib += (96 - ib) * hz;   // a soft gold haze
            const pb = 0.5 + 0.5 * n2(x * 0.32 - 8.8, y * 0.32 + 4.2);                           // each particle its own brightness
            const ca = sm((f - 0.5 + 1.05 * ga + 0.11) / 0.22) * (0.55 + 0.4 * ga);
            ir += (202 + 53 * pb - ir) * ca; ig += (148 + 88 * pb - ig) * ca; ib += (50 + 118 * pb - ib) * ca;   // #ca9432 … #ffeca8
            const ai = m * (0.86 + 0.12 * ga), A2 = ai + A * (1 - ai), w = A * (1 - ai);
            R = (ir * ai + R * w) / A2; G = (ig * ai + G * w) / A2; B = (ib * ai + B * w) / A2; A = A2;
          }
        }
        const e = t2((x + 0.7) / 2.3, (y + 0.7) / 1.7) - t2(x / 2.3, y / 1.7);                 // > 0: this flank of the tooth faces the light
        let ta, tr, tgc, tb;
        if (e > 0) { ta = e * 0.25; if (ta > 0.14) ta = 0.14; tr = 196; tgc = 232; tb = 222; } else { ta = -e * 0.46; if (ta > 0.26) ta = 0.26; tr = 0; tgc = 8; tb = 10; }
        const A3 = ta + A * (1 - ta);
        if (A3 > 0) { const w = A * (1 - ta); R = (tr * ta + R * w) / A3; G = (tgc * ta + G * w) / A3; B = (tb * ta + B * w) / A3; }
        d[k] = R; d[k + 1] = G; d[k + 2] = B; d[k + 3] = A3 * 255;
      }
    }
  });
}

function build() {
  const info = K.glyphInfo(), sw = info.strokeWidth;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const r = L.rng('g24sky' + info.key);
  const goldRamp = L.makeRamp([[0, '#3a2206'], [0.22, '#7d5218'], [0.45, '#bf8d34'], [0.65, '#e4bb5e'], [0.85, '#f9e6a6'], [1, '#fffcee']]);
  const gold = (t) => L.css(goldRamp(L.clamp(t)));

  // 1 ── the sky: deep teal colour, mottled where the sheet took it unevenly
  g.drawImage(L.noiseTex(S, S, { seed: 'g24ink', scale: 520, octaves: 5, res: 0.5,
    ramp: [[0, '#06222a'], [0.5, '#0a3038'], [1, '#124a54']] }), 0, 0, S, S);
  g.fillStyle = L.radial(g, S / 2 - 120, S / 2 - 140, 80, 820, [[0, 'rgba(40,120,125,0.14)'], [1, 'rgba(3,14,18,0.36)']]);
  g.fillRect(0, 0, S, S);

  // 2 ── the Milky Way: a soft pale band from lower-left to upper-right, cloud first, then stipple (kept clear of the glyph)
  const mw = L.makeCanvas(S, S), m = mw.getContext('2d');
  m.drawImage(L.noiseTex(S, S, { seed: 'g24mw', scale: 210, octaves: 5, res: 0.5, warp: 0.18, contrast: 1.25,
    ramp: [[0, '#000000'], [0.4, '#020a0b'], [0.75, '#183f40'], [1, '#3f7f7a']] }), 0, 0, S, S);
  m.save(); m.translate(S / 2, S / 2); m.rotate(-0.72);
  m.fillStyle = L.linear(m, 0, -330, 0, 330, [[0, '#000'], [0.3, 'rgba(0,0,0,0.5)'], [0.5, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0.5)'], [1, '#000']]);
  m.fillRect(-900, -330, 1800, 660); m.fillStyle = '#000'; m.fillRect(-900, -1200, 1800, 871); m.fillRect(-900, 329, 1800, 871);
  m.restore();
  g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.62; g.drawImage(mw, 0, 0); g.restore();
  const nz = L.makeNoise('g24st');
  for (let i = 0; i < 9000; i++) {
    const u = r.range(-780, 780), v = r.gauss() * 105;                        // band coordinates
    const x = S / 2 + u * Math.cos(-0.72) - v * Math.sin(-0.72), y = S / 2 + u * Math.sin(-0.72) + v * Math.cos(-0.72);
    if (x < 0 || y < 0 || x > S || y > S) continue;
    if (nz.fbm(x / 150, y / 150) < r.range(-0.25, 0.3)) continue;             // stipple gathers into clouds
    if (K.sdGlyph(x, y) < sw * 0.3) continue;
    g.fillStyle = L.rgba(r() < 0.3 ? '#f1dfa6' : '#cfe6dc', r.range(0.14, 0.42));
    g.beginPath(); g.arc(x, y, r.range(0.5, 1.4), 0, TAU); g.fill();
  }

  // 3 ── atlas furniture in pale teal: declination circles and hour lines about the pole, the ecliptic in fine dashes (no numerals)
  g.save(); g.translate(S / 2 - 34, S / 2 + 26); g.lineCap = 'butt';
  g.strokeStyle = 'rgba(150,205,198,0.17)'; g.lineWidth = 1.1;
  for (const rad of [150, 300, 450, 600, 750]) { g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke(); }
  for (let k = 0; k < 24; k++) {
    const t = (k / 24) * TAU + 0.131;
    g.beginPath(); g.moveTo(Math.cos(t) * 150, Math.sin(t) * 150); g.lineTo(Math.cos(t) * 900, Math.sin(t) * 900); g.stroke();
  }
  g.setLineDash([7, 5]); g.strokeStyle = 'rgba(214,190,120,0.2)'; g.lineWidth = 1.2;
  g.beginPath(); g.arc(96, -70, 450, 0, TAU); g.stroke();
  g.restore();

  // 4 ── loose small stars over the rest of the sky, painted in shell gold (they lie IN the paper, under its tooth)
  for (let i = 0; i < 460; i++) {
    const x = r() * S, y = r() * S;
    if (K.sdGlyph(x, y) < sw * 0.32) continue;                                // the gaps between the strokes stay quiet
    const rad = r() < 0.1 ? r.range(4.6, 7) : r() < 0.5 ? r.range(2.2, 3.8) : r.range(1.1, 2.2);
    g.globalAlpha = r.range(0.6, 0.95); giltStar(g, x, y, rad, rad > 4.5 ? 6 : 4, r() * TAU, rad > 4.5 ? 0.45 : 0.4); g.globalAlpha = 1;
  }

  // 5 ── the nebula inside the strokes and the tooth of the paper (per pixel, device resolution)
  g.drawImage(nebula(sw), 0, 0);

  // 6 ── colour drop-outs and paper fibres showing through
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(190,222,212,${r.range(0.05, 0.18).toFixed(3)})`;
    g.beginPath(); g.ellipse(r() * S, r() * S, r.range(0.4, 1.3), r.range(0.3, 0.9), r() * 3, 0, TAU); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, len = r.range(10, 46), a = r() * TAU, b = r.range(-0.7, 0.7);
    g.strokeStyle = `rgba(175,215,205,${r.range(0.035, 0.09).toFixed(3)})`; g.lineWidth = r.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + b) * len * 0.5, y + Math.sin(a + b) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }

  // 7 ── gold: the constellation. Star sprites in a few variants per magnitude, every size a fraction of the stroke width
  const mk = (count, rLo, rHi, pts, iLo, iHi, alt) => Array.from({ length: count }, () => {
    const rr = sw * r.range(rLo, rHi);
    return { r: rr, spr: giltStud(rr, r.pick(pts), r() * TAU, r.range(iLo, iHi), alt, r, gold) };
  });
  const SPR = { ord: mk(7, 0.098, 0.128, [5, 6, 6], 0.44, 0.5, 1), mid: mk(5, 0.15, 0.175, [6, 8], 0.42, 0.48, 1),
    big: mk(5, 0.215, 0.25, [8], 0.36, 0.42, 0.74), fld: mk(6, 0.06, 0.1, [4, 5], 0.36, 0.46, 1) };
  const figs = figures(sw, r);
  const stars = [];
  for (const fig of figs) for (const st of fig) { const v = r.pick(SPR[st.kind]); st.r = v.r; st.spr = v.spr; stars.push(st); }
  // stars scattered through the nebula, along the middle of the strokes
  for (const p of K.pack({ seed: 'g24field', rmax: sw * 0.13, rmin: sw * 0.07, margin: sw * 0.2, gap: 3, max: 260 })) {
    if (r() < 0.25) continue;
    const v = r.pick(SPR.fld);
    stars.push({ x: p.x + r.range(-0.05, 0.05) * sw, y: p.y + r.range(-0.05, 0.05) * sw, r: v.r, spr: v.spr, kind: 'fld' });
  }
  // a few raised stars out in the open sky, well away from the glyph
  for (let i = 0, n = 0; i < 400 && n < 8; i++) {
    const x = r.range(46, S - 46), y = r.range(46, S - 46);
    if (K.sdGlyph(x, y) < sw * 1.05 || stars.some((q) => q.kind === 'sky' && Math.hypot(q.x - x, q.y - y) < 170)) continue;
    const v = r.pick(r() < 0.6 ? SPR.ord : SPR.fld);
    stars.push({ x, y, r: v.r, spr: v.spr, kind: 'sky' }); n++;
  }
  // halos of the bright stars, screened onto the sheet
  for (const st of stars) if (st.kind === 'sky') L.glow(g, st.x, st.y, st.r * 2.6, '#f3d58a', 0.16);
  for (const st of stars) if (st.kind === 'big' || st.kind === 'mid') L.glow(g, st.x, st.y, st.r * (st.kind === 'big' ? 3.3 : 2.7), '#f3d58a', st.kind === 'big' ? 0.38 : 0.2);
  // the thread: a fine gilt wire from star to star, closed into a figure; it throws a thin shadow and glints along its twist
  const wire = L.clamp(sw * 0.027, 1.0, 2.2);
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const fig of figs) {
    g.save(); g.shadowColor = 'rgba(0,9,12,0.8)'; g.shadowBlur = wire * 1.3; g.shadowOffsetX = wire * 0.75; g.shadowOffsetY = wire * 1.0;
    poly(fig); g.strokeStyle = '#74490f'; g.lineWidth = wire; g.stroke(); g.restore();
    g.save(); g.translate(-wire * 0.15, -wire * 0.19); poly(fig); g.strokeStyle = '#e6bd62'; g.lineWidth = wire * 0.62; g.stroke();
    g.translate(-wire * 0.08, -wire * 0.1); g.setLineDash([wire * 1.5, wire * 1.3]); poly(fig); g.strokeStyle = 'rgba(255,247,212,0.92)'; g.lineWidth = wire * 0.3; g.stroke();
    g.restore();
  }
  // the stars, faint ones first so the bright ones lie on top
  const rank = { fld: 0, sky: 0, ord: 1, mid: 2, big: 3 };
  stars.sort((a, b) => rank[a.kind] - rank[b.kind]);
  for (const st of stars) setStar(g, st);

  // 8 ── the sheet darkens toward its edges
  g.fillStyle = L.radial(g, S / 2, S / 2, S * 0.46, S * 0.82, [[0, 'rgba(2,10,13,0)'], [1, 'rgba(2,10,13,0.42)']]);
  g.fillRect(0, 0, S, S);
  return c;
}

export default {
  name: '星图',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },             // a 3-frame flash: perfectly still
};
