// s11 — 拱桥红灯笼. A Jiangnan stone arch bridge at night, seen close in side elevation from the water.
// The arc = the top of the low, plain stone parapet (石栏板) following the humped deck. Five big red gauze
// lanterns ride that line; their light is the only light in the picture, so the masonry is relit
// per-pixel in init() from the lantern positions (height map → normals → point lights → colour ramp).
// Everything hangs plumb (posts, lanterns, tassels, horizontal stone courses): only the deck line curves.
// The parapet is old hand-cut stone: slabs of unequal length, a few posts of unequal size and wear, spalls,
// cracks, lichen and run-off — nothing repeats. The lanterns hang from cords that vanish up into the night:
// above the arc there is nothing but black and five glowing reds.
import * as L from '../lib/core.js';

const { W, H, TAU } = L;
const PAD = 150;                       // camera move is tiny (±0.5° about the arc centre, 2.5 % push-in)
const LW = W + PAD * 2, LH = H + PAD * 2;
const XL = -PAD - 30, XR = W + PAD + 30;
const PITCH = 410, SHIFT = 16;         // lantern pitch along the arc (px); the string sits a little off-centre
// vertical offsets below the parapet-top arc (px). Water-town bridges carry LOW, PLAIN slab parapets —
// no carved balustrade, no lotus finials (that is the northern imperial manner) — so: bare slabs, square posts.
const O = { cope: 22, slab: 168, deck: 236 };
const DROP = 448, RA = 1300, RT = 64;  // arch: intrados crown sits DROP px under the crest; radius; ring thickness
const LIGHT_Z = 132;                   // how far the lanterns hang in front of the wall plane
const Q = 1.5;                         // frame px per light-map px (the relighting runs at 1/Q resolution)
const NIGHT = '#050407';
let S = null;

const G = (v) => { v = Math.round(L.clamp(v, 0, 255)); return `rgb(${v},${v},${v})`; };

// ───────────────────────── layout ─────────────────────────
function mkPost(a, x, r, key) {
  // every post was cut and has worn differently: stout or slim, tall or barely proud of the slabs, square-headed, rounded off, or broken
  const hw = r.range(20, 34), up = r.chance(0.3) ? r.range(1, 5) : r.range(7, 21), cut = r.range(4, 9), chip = r.chance(0.45) ? r.sign() : 0;
  return { key, x, hw, up, cut, round: r.chance(0.4), cl: cut * (chip < 0 ? 2.8 : 1), cr: cut * (chip > 0 ? 2.8 : 1), y: a.yAt(x), yt: Math.min(a.yAt(x - hw), a.yAt(x + hw)) - up };
}

function layout(a) {
  const s = a.span(PAD + 460);
  const n = Math.ceil((s * a.R) / PITCH);
  // the five lanterns that are in frame are cast by hand: sizes and brightness differ, the biggest rides the crest
  const SIZE = { [-3]: 0.9, [-2]: 1.1, [-1]: 0.84, 0: 1.32, 1: 1.0, 2: 1.15, 3: 0.9 };
  const GLOW = { [-2]: 0.92, [-1]: 0.6, 0: 1, 1: 0.8, 2: 0.96 };
  const lanterns = [];
  for (let k = -n; k <= n; k++) {
    const r = L.rng('s11-lantern-' + k);
    const x = a.cx + a.R * Math.sin((k * PITCH + SHIFT + r.range(-14, 14)) / a.R);
    const sc = SIZE[k] !== undefined ? SIZE[k] : r.range(0.84, 1.14);
    const glowK = GLOW[k] !== undefined ? GLOW[k] : r.range(0.65, 1);
    const rx = 110 * sc, ry = rx * r.range(0.85, 0.89);
    const y = a.yAt(x) - ry * 0.5 + r.range(-6, 6);
    const cord = (150 + r.range(0, 40)) * sc;
    lanterns.push({ k, x, y, rx, ry, sc, glowK, cord, phase: r(), amp: r.range(0.55, 1), power: sc * sc * glowK * r.range(0.95, 1.05), tilt: r.range(-0.02, 0.02) });
  }
  // parapet: slabs of unequal length; where two meet there is sometimes a post, sometimes only a bare butt joint
  const divs = [];
  {
    const r = L.rng('s11-divs-3');
    const lim = s * a.R + 300;
    let u = -lim - r.range(0, 260), i = 0;
    while (u < lim) {
      const x = a.cx + a.R * Math.sin(L.clamp(u / a.R, -1.5, 1.5));
      divs.push({ x, post: r.chance(0.58) ? mkPost(a, x, r, 'p' + i) : null });
      u += r.range(240, 540); i++;
    }
  }
  const posts = divs.filter((d) => d.post).map((d) => d.post), joints = divs.filter((d) => !d.post).map((d) => d.x);
  const segs = [];
  for (let i = 0; i < divs.length - 1; i++) {
    const r = L.rng('s11-seg-' + i);
    // no two slabs sit quite flush: each has settled by a pixel or two
    segs.push({ key: i, x0: divs[i].x, x1: divs[i + 1].x, dy: r.range(0, 3.4), in0: divs[i].post ? divs[i].post.hw : 1.5, in1: divs[i + 1].post ? divs[i + 1].post.hw : 1.5 });
  }
  return { lanterns, posts, joints, segs };
}

function buildCourses(a) {
  const r = L.rng('s11-courses');
  const out = [];
  let y = a.crestY + O.deck - 3;
  while (y < H + PAD + 60) {
    const h = r.range(64, 106);
    const xs = [];
    let x = XL - 60 - r.range(0, 260);
    while (x < XR + 60) { xs.push(x); x += r.range(180, 540); }
    xs.push(x);
    out.push({ y0: y, y1: y + h, xs, tone: xs.map(() => r.range(-1, 1)), alb: xs.map(() => r.range(-1, 1)), tool: xs.map(() => r()), tool2: xs.map(() => r()) });
    y += h;
  }
  return out;
}

/** region between two copies of the arc shifted straight down by o0 / o1 px, for x in [x0, x1] */
function tband(g, a, o0, o1, x0 = XL, x1 = XR) {
  const t0 = a.thetaAtX(x0) - Math.PI / 2, t1 = a.thetaAtX(x1) - Math.PI / 2;
  g.beginPath();
  g.arc(a.cx, a.cy + o0, a.R, t0, t1, false);
  g.arc(a.cx, a.cy + o1, a.R, t1, t0, true);
  g.closePath();
}
function tline(g, a, o, x0 = XL, x1 = XR) {
  g.beginPath();
  g.arc(a.cx, a.cy + o, a.R, a.thetaAtX(x0) - Math.PI / 2, a.thetaAtX(x1) - Math.PI / 2, false);
  g.stroke();
}
const postFoot = (a, p) => Math.max(a.yAt(p.x - p.hw), a.yAt(p.x + p.hw)) + O.slab + 1;
/** a post: plain square shaft with a chamfered (sometimes broken) head, from just above the slabs down to the deck course */
function postPath(g, a, p) {
  const x = p.x, y = p.yt, hw = p.hw, yb = postFoot(a, p);
  g.beginPath();
  g.moveTo(x - hw, yb); g.lineTo(x - hw, y + p.cl * 1.15);
  if (p.round) { g.quadraticCurveTo(x - hw, y, x - hw + p.cl * 1.3, y); g.lineTo(x + hw - p.cr * 1.3, y); g.quadraticCurveTo(x + hw, y, x + hw, y + p.cr * 1.15); }
  else { g.lineTo(x - hw + p.cl, y); g.lineTo(x + hw - p.cr, y); g.lineTo(x + hw, y + p.cr * 1.15); }
  g.lineTo(x + hw, yb);
  g.closePath();
}
/** an irregular flake outline (a spall, a patch of lichen) */
function blob(g, v, cx, cy, ex, ey, rot) {
  const nv = v.int(7, 11), cs = Math.cos(rot), sn = Math.sin(rot);
  g.beginPath();
  for (let j = 0; j < nv; j++) {
    const t = (j / nv) * TAU + v.range(-0.2, 0.2), rr = v.range(0.6, 1.14);
    const px = Math.cos(t) * ex * rr, py = Math.sin(t) * ey * rr;
    const X = cx + px * cs - py * sn, Y = cy + px * sn + py * cs;
    if (j) g.lineTo(X, Y); else g.moveTo(X, Y);
  }
  g.closePath();
}

// ───────────────────────── bridge: height / albedo maps ─────────────────────────
// mode 'h' → grey height map (white = proud of the wall), mode 'a' → grey albedo map
function drawStructure(g, a, lay, courses, arch, mode) {
  const hgt = mode === 'h';
  const r = L.rng('s11-struct-' + mode);
  g.fillStyle = G(hgt ? 58 : 200); g.fillRect(-PAD, -PAD, LW, LH);

  // spandrel wall: horizontal courses of dressed stone (条石), joints are the gaps
  g.save(); tband(g, a, O.deck - 3, 1700); g.clip();
  g.fillStyle = G(hgt ? 60 : 112); g.fillRect(-PAD, -PAD, LW, LH);
  for (const c of courses) for (let i = 0; i < c.xs.length - 1; i++) {
    const x0 = c.xs[i], x1 = c.xs[i + 1];
    if (hgt) {
      // every block sits a little differently: its face is a slightly tilted plane
      const base = 106 + c.tone[i] * 13, tl = 4 + 8 * c.tool2[i], vert = c.tool[i] > 0.5, sg = c.alb[i] > 0 ? 1 : -1;
      g.fillStyle = vert ? L.linear(g, 0, c.y0, 0, c.y1, [[0, G(base - sg * tl)], [1, G(base + sg * tl)]])
        : L.linear(g, x0, 0, x1, 0, [[0, G(base - sg * tl)], [1, G(base + sg * tl)]]);
    } else g.fillStyle = G(198 + c.alb[i] * 44);
    const jg = 1.6 + 1.6 * c.tool2[i];
    g.fillRect(x0 + jg, c.y0 + jg, x1 - x0 - jg * 2, c.y1 - c.y0 - jg * 2);
  }
  g.restore();

  // arch ring (拱券石): a band of voussoirs of uneven width with radial joints, a touch proud of the wall
  const rm = arch.ri + RT / 2, gap = 2.3 / rm;
  g.lineCap = 'butt';
  g.strokeStyle = G(hgt ? 60 : 116); g.lineWidth = RT + 3;
  g.beginPath(); g.arc(arch.cx, arch.cy, rm, -Math.PI / 2 - 1.3, -Math.PI / 2 + 1.3); g.stroke();
  for (let j = 0; j < arch.joints.length - 1; j++) {
    const t0 = arch.joints[j] + gap, t1 = arch.joints[j + 1] - gap;
    g.strokeStyle = G(hgt ? 124 + r.range(-9, 9) : 222 + r.range(-34, 16)); g.lineWidth = RT - 4;
    g.beginPath(); g.arc(arch.cx, arch.cy, rm, t0 - Math.PI / 2, t1 - Math.PI / 2); g.stroke();
  }
  g.fillStyle = G(hgt ? 36 : 60); g.beginPath(); g.arc(arch.cx, arch.cy, arch.ri, 0, TAU); g.fill();

  // parapet: plain stone slabs (素面石栏板) of unequal length; the top arris is worn round
  for (const s of lay.segs) {
    const v = L.rng('s11-slab-' + s.key);
    const base = 132 + v.range(-10, 10), tl = v.range(-8, 8), alb = 198 + v.range(-54, 40);
    tband(g, a, s.dy, O.slab, s.x0, s.x1);
    g.fillStyle = hgt ? L.linear(g, s.x0, 0, s.x1, 0, [[0, G(base - tl)], [1, G(base + tl)]]) : G(alb);
    g.fill();
    // age: flakes spalled off the face (fresh stone shows paler), an occasional crack
    g.save(); tband(g, a, s.dy + 3, O.slab, s.x0 + s.in0, s.x1 - s.in1); g.clip();
    const d = L.rng('s11-dmg-' + s.key);
    for (let n = d.chance(0.8) ? d.int(1, 3) : 0; n > 0; n--) {
      const cx = d.range(s.x0 + 16, s.x1 - 16), yT = a.yAt(cx) + s.dy, edge = d.chance(0.55);
      const cy = edge ? (d.chance(0.6) ? yT + O.slab - d.range(0, 12) : yT + d.range(20, 36)) : yT + d.range(34, O.slab - 26);
      const ex = d.range(13, 46), ey = d.range(7, 22), rot = d.range(-0.5, 0.5), depth = d.range(12, 24), pale = d.range(8, 34);
      blob(g, d, cx, cy, ex, ey, rot);
      g.fillStyle = hgt ? G(base - depth) : G(alb + pale);
      g.fill();
    }
    if (d.chance(0.34)) {
      let x = d.range(s.x0 + 30, s.x1 - 30), y = a.yAt(x) + s.dy; const drift = d.range(-5, 5);
      g.beginPath(); g.moveTo(x, y);
      for (let n = d.int(5, 12); n > 0; n--) { x += d.range(-8, 8) + drift; y += d.range(7, 16); g.lineTo(x, y); }
      g.strokeStyle = G(hgt ? 70 : 118); g.lineWidth = hgt ? 2.6 : 1.8; g.lineJoin = 'round'; g.stroke();
    }
    g.restore();
    if (hgt) {
      g.lineWidth = 2.2;
      for (let o = 0; o <= O.cope; o += 1) {
        const u = 1 - o / O.cope;
        g.strokeStyle = `rgba(58,58,58,${(0.62 * (1 - Math.sqrt(Math.max(0, 1 - u * u)))).toFixed(3)})`; tline(g, a, o + s.dy, s.x0, s.x1);
      }
    }
  }
  // butt joints between slabs that share no post
  g.lineWidth = hgt ? 4 : 3; g.strokeStyle = G(hgt ? 64 : 110);
  for (const x of lay.joints) { const y = a.yAt(x); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + O.slab); g.stroke(); }
  // posts (望柱): plain, a little proud of the slabs, every one cut to its own size
  for (const p of lay.posts) {
    const v = L.rng('s11-postface-' + p.key);
    postPath(g, a, p); g.fillStyle = G(hgt ? 146 : 212 + v.range(-30, 14)); g.fill();
    if (hgt) {
      const yb = postFoot(a, p), ch = Math.max(p.cl, p.cr) * 1.15 + 1;
      g.fillStyle = G(166 + v.range(-6, 6)); g.fillRect(p.x - p.hw + 4, p.yt + ch, p.hw * 2 - 8, yb - p.yt - ch);
      g.fillStyle = L.linear(g, 0, p.yt, 0, p.yt + ch, [[0, G(120)], [1, G(166)]]); g.fillRect(p.x - p.hw + p.cl, p.yt, p.hw * 2 - p.cl - p.cr, ch);
    }
  }

  // deck-edge course (桥面沿石): a rounded nosing that projects over the wall; the slabs stand on it
  g.lineWidth = 2.2;
  for (let o = O.slab; o <= O.deck; o += 1) {
    const u = (o - O.slab) / (O.deck - O.slab);
    g.strokeStyle = G(hgt ? 150 + 36 * Math.pow(Math.sin(Math.PI * u), 0.55) : 204); tline(g, a, o);
  }
  const jr = L.rng('s11-deckjoints');
  for (let x = XL + jr.range(0, 200); x < XR; x += jr.range(210, 520)) {
    const y = a.yAt(x), x1 = x + jr.range(210, 520), tone = jr.range(-1, 1);
    // each kerb stone has weathered to its own tone
    if (!hgt) { g.save(); g.globalAlpha = 0.5; tband(g, a, O.slab + 1, O.deck, x, Math.min(x1, XR)); g.fillStyle = G(204 + tone * 44); g.fill(); g.restore(); }
    g.strokeStyle = G(hgt ? 104 : 140); g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y + O.slab + 1); g.lineTo(x + jr.range(-2, 2), y + O.deck); g.stroke();
  }

  if (!hgt) {
    // baked occlusion: shadow under the projecting deck course, grime where the slabs meet it
    g.globalCompositeOperation = 'multiply'; g.lineWidth = 2.2;
    for (let o = 0; o < 26; o++) { g.strokeStyle = G(255 * (0.56 + 0.44 * Math.pow(o / 26, 0.7))); tline(g, a, O.deck + o); }
    for (let o = 0; o < 14; o++) { g.strokeStyle = G(255 * (0.7 + 0.3 * (o / 14))); tline(g, a, O.slab - o); }
    // weathering: broad mottling + rain streaks running down the face
    g.drawImage(L.noiseTex(LW / 2, LH / 2, { seed: 's11mottle', scale: 190, octaves: 4, warp: 0.8, res: 0.4, contrast: 1.3, ramp: [[0, G(100)], [0.5, G(212)], [1, G(255)]] }), -PAD, -PAD, LW, LH);
    g.drawImage(L.noiseTex(LW / 2, LH / 2, { seed: 's11streak', scale: 40, sx: 0.32, sy: 8, octaves: 3, res: 0.5, contrast: 1.8, ramp: [[0, G(168)], [0.42, G(244)], [1, G(255)]] }), -PAD, -PAD, LW, LH);
    // soot and algae gather in patches where the slabs stand on the kerb
    const cn = L.makeNoise('s11-crust');
    for (let x = XL; x < XR; x += 6) {
      const y = a.yAt(x), d = L.clamp(0.42 + 0.95 * cn.fbm(x / 170, 9.1, 3)), len = 10 + 64 * d * d;
      g.fillStyle = L.linear(g, 0, y + O.slab - len, 0, y + O.slab, [[0, G(255)], [1, G(255 - 120 * d)]]);
      g.fillRect(x, y + O.slab - len, 6.5, len);
    }
    // lichen: pale crusts scattered over the old faces — fine scatter everywhere, a few big colonies on the parapet
    g.globalCompositeOperation = 'screen';
    g.drawImage(L.noiseTex(LW / 2, LH / 2, { seed: 's11lichen', scale: 34, octaves: 4, gain: 0.6, warp: 1.2, res: 0.5, contrast: 2.2, ramp: [[0, G(0)], [0.62, G(0)], [0.78, G(48)], [1, G(80)]] }), -PAD, -PAD, LW, LH);
    for (const s of lay.segs) {
      const v = L.rng('s11-lichen-' + s.key);
      for (let n = v.chance(0.7) ? v.int(1, 2) : 0; n > 0; n--) {
        const cx = v.range(s.x0 + 10, s.x1 - 10), cy = a.yAt(cx) + v.range(10, O.slab - 14), spread = v.range(22, 74);
        for (let k = v.int(5, 13); k > 0; k--) {
          const ang = v.range(0, TAU), rad = spread * Math.sqrt(v());
          blob(g, v, cx + Math.cos(ang) * rad * 1.3, cy + Math.sin(ang) * rad * 0.8, v.range(5, 24), v.range(4, 16), v.range(0, 3));
          g.fillStyle = G(v.range(30, 80)); g.fill();
        }
      }
    }
    g.globalCompositeOperation = 'multiply';
    // run-off: dark tide marks hanging from the ledges (slab tops, deck nosing)
    const dr = L.rng('s11-drips');
    for (const [off, n, lmin, lmax, dark] of [[O.deck - 4, 56, 40, 230, 172], [6, 92, 18, 132, 146]]) {
      for (let k = 0; k < n; k++) {
        const x = dr.range(XL, XR), y = a.yAt(x) + off, len = dr.range(lmin, lmax) * (dr.chance(0.2) ? 1.5 : 1), ww = dr.range(4, 40);
        g.fillStyle = L.linear(g, 0, y, 0, y + len, [[0, G(dark + dr.range(-24, 34))], [1, G(255)]]);
        g.fillRect(x - ww / 2, y, ww, len);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}

// ───────────────────────── bridge: relight from the lanterns ─────────────────────────
function lightPass(hc, ac, a, lanterns) {
  const w = hc.width, h = hc.height;
  const hd = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const ad = ac.getContext('2d').getImageData(0, 0, w, h).data;
  const Hf = new Float32Array(w * h);
  const nz = L.makeNoise('s11-rough'), nw = L.makeNoise('s11-wet'), ne = L.makeNoise('s11-erode');
  const y0 = Math.max(1, Math.floor((a.crestY - 60 + PAD) / Q));
  for (let y = y0 - 1; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x * Q - PAD, fy = y * Q - PAD;
    // weathering is patchy: some faces are still tight and smooth, others have opened up into pits and furrows
    const er = L.smooth(0.5 + 0.95 * ne.fbm(fx / 230, fy / 150, 2));
    let hv = hd[(y * w + x) * 4] + 6 * nz.fbm(fx / 150, fy / 110, 2) + 5.2 * (0.35 + er) * nz.fbm(fx / 34, fy / 34, 3) + 2.3 * er * er * nz.n2(fx / 7, fy / 7);
    if (er > 0.3) { const c = ne.cell(fx / 27 + 3.1, fy / 27), thr = 0.08 + 0.3 * c.id; if (c.d < thr) hv -= (er - 0.3) * (thr - c.d) * 95; }
    const c2 = ne.cell(fx / 78 + 9.7, fy / 60 + 1.3); if (c2.id > 0.58 && c2.d < 0.3) hv -= (0.3 - c2.d) * 36;
    Hf[y * w + x] = hv;
  }
  // light value → colour: night violet → plum → magenta → rose → warm white. One hue family, so the stone stays clean.
  const ramp = L.makeRamp([[0, '#050308'], [0.035, '#150619'], [0.08, '#320a28'], [0.18, '#781040'], [0.3, '#b41a54'],
    [0.42, '#dc2e66'], [0.56, '#f65a7c'], [0.74, '#ff9e92'], [1, '#ffe8c4']]);
  const lut = new Uint8ClampedArray(1024 * 3);
  for (let i = 0; i < 1024; i++) { const c = ramp(i / 1023); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  const out = new ImageData(w, h); const od = out.data;
  const LZ2 = LIGHT_Z * LIGHT_Z, R0 = 300 * 300, WIN = 800, K = 0.17 / Q;
  const AMB = 0.04, KD = 1.32, KF = 0.5, KS = 0.5;
  const nl = lanterns.length;
  const lx = lanterns.map((l) => l.x), ly = lanterns.map((l) => l.y), lp = lanterns.map((l) => l.power), lr = lanterns.map((l) => l.rx);
  for (let y = y0; y < h - 1; y++) {
    const fy = y * Q - PAD;
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, fx = x * Q - PAD;
      let gx = (Hf[i + 1] - Hf[i - 1]) * K, gy = (Hf[i + w] - Hf[i - w]) * K;
      if (gx > 1.7) gx = 1.7; else if (gx < -1.7) gx = -1.7;
      if (gy > 1.7) gy = 1.7; else if (gy < -1.7) gy = -1.7;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inv, ny = -gy * inv, nzz = inv;
      const o = fy - a.yAt(fx);                                   // px below the parapet top
      let diff = 0, spec = 0, streak = 0;
      for (let j = 0; j < nl; j++) {
        const dx = lx[j] - fx;
        if (dx > WIN || dx < -WIN) continue;
        const dy = ly[j] - fy;
        const d2 = dx * dx + dy * dy + LZ2, id = 1 / Math.sqrt(d2);
        let wn = 1 - (dx * dx) / (WIN * WIN); wn *= wn;
        const att = (lp[j] * wn) / (1 + d2 / R0);
        const lam = ((nx * dx + ny * dy + nzz * LIGHT_Z) * id + 0.3) / 1.3;
        if (lam > 0) diff += lam * att;
        const hx = dx * id, hy = dy * id, hz = LIGHT_Z * id + 1;
        const ndh = (nx * hx + ny * hy + nzz * hz) / Math.sqrt(hx * hx + hy * hy + hz * hz);
        if (ndh > 0.82) { let s = ndh * ndh; s *= s; s *= s; s *= s; s *= s; spec += s * att; }
        // wet stone: each lantern drags a broken streak of its own colour down the wall below it
        if (o > O.deck + 4 && dx < 120 && dx > -120) {
          const sx = dx + 15 * nw.n2(fy / 46, j * 7.31), q = (sx * sx) / (lr[j] * lr[j] * 0.07);
          if (q < 7) streak += lp[j] * Math.exp(-q) * L.smooth((o - O.deck - 4) / 60) * Math.exp(-(o - O.deck) / 240);
        }
      }
      const alb = ad[i * 4] / 255;
      const fill = Math.max(0, -0.62 * ny + 0.78 * nzz) / (1 + (o * o) / (270 * 270));   // the whole row of lanterns as one soft source above
      const wet = L.smooth((nw.fbm(fx / 80, fy / 520, 2) + 0.15) * 1.6);
      const bounce = o > O.deck - 6 ? 0.22 * Math.exp(-(o - O.deck) / 520) : 0;
      const v = alb * (AMB + KD * diff + KF * fill + bounce) + KS * wet * spec * (0.4 + 0.6 * alb);
      let li = (v * 511.5) | 0; if (li > 1023) li = 1023;
      const p = i * 4;
      let r = lut[li * 3], g = lut[li * 3 + 1], b = lut[li * 3 + 2];
      if (streak > 0.004) {
        const brk = L.smooth(nw.fbm(fx / 15, fy / 210, 2) * 1.5 + 0.55);
        const st = streak * alb * alb * (0.2 + 0.8 * brk) * L.clamp(1 + 2.4 * gy, 0.3, 2.6) * 0.7;
        r += 255 * st; g += 92 * st; b += 104 * st;
      }
      od[p] = r; od[p + 1] = g; od[p + 2] = b; od[p + 3] = 255;
    }
  }
  const c = L.makeCanvas(w, h);
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

function buildBridge(env, lay, courses, arch) {
  const a = env.arc;
  const hw = Math.ceil(LW / Q), hh = Math.ceil(LH / Q);
  const mk = (mode) => {
    const c = L.makeCanvas(hw, hh); const g = c.getContext('2d', { willReadFrequently: true });
    g.scale(1 / Q, 1 / Q); g.translate(PAD, PAD);
    drawStructure(g, a, lay, courses, arch, mode);
    return c;
  };
  const lit = lightPass(L.blurred(mk('h'), 1.35), mk('a'), a, lay.lanterns);
  const grain = L.grainTex(512, 512, { seed: 's11grain', amount: 0.5 });
  const segAt = (x) => { for (const s of lay.segs) if (x >= s.x0 && x < s.x1) return s; return null; };

  const layer = L.makeLayer(PAD, (g) => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(lit, -PAD, -PAD, hw * Q, hh * Q);

    // ── crisp full-resolution detail on the wall
    g.save();
    g.beginPath(); g.rect(-PAD, -PAD, LW, LH); g.arc(arch.cx, arch.cy, arch.ri + RT + 1, 0, TAU); g.clip('evenodd');
    tband(g, a, O.deck, 1700); g.clip();
    for (const c of courses) {
      // tooling marks (錾道): every block was dressed by hand at its own angle, some hardly at all
      for (let i = 0; i < c.xs.length - 1; i++) {
        const x0 = c.xs[i], x1 = c.xs[i + 1], hgt = c.y1 - c.y0;
        const ang = (c.tool[i] - 0.5) * 1.5, sp = 6 + c.tool2[i] * 8, sl = Math.tan(ang) * hgt, m = Math.abs(sl) + 8;
        const rr = L.rng('s11-tool-' + Math.round(x0) + '-' + Math.round(c.y0));
        const worn = rr.range(0.25, 1);
        g.save(); g.beginPath(); g.rect(x0 + 3, c.y0 + 3, x1 - x0 - 6, hgt - 6); g.clip();
        g.lineWidth = 1.1;
        for (const [off, col] of [[0, `rgba(0,0,0,${(0.12 * worn).toFixed(3)})`], [1.7, `rgba(255,165,195,${(0.05 * worn).toFixed(3)})`]]) {
          g.strokeStyle = col; g.beginPath();
          const r2 = L.rng('s11-tool2-' + Math.round(x0) + '-' + Math.round(c.y0));
          for (let x = x0 - m; x < x1 + m; x += sp * r2.range(0.6, 1.5)) {
            const j = r2.range(-1.5, 1.5), ya = c.y0 + r2.range(0, hgt * 0.45), yb = c.y1 - r2.range(0, hgt * 0.45);
            g.moveTo(x + j + off + (sl * (ya - c.y0)) / hgt, ya); g.lineTo(x + j + off + (sl * (yb - c.y0)) / hgt, yb);
          }
          g.stroke();
        }
        // chipped arrises
        g.fillStyle = 'rgba(4,0,3,0.55)';
        for (let n = rr.int(1, 4); n > 0; n--) {
          const cx = rr.range(x0, x1), top = rr.chance(0.5), cy = top ? c.y0 + 2 : c.y1 - 2;
          g.beginPath(); g.ellipse(cx, cy, rr.range(4, 16), rr.range(2, 6), 0, 0, TAU); g.fill();
        }
        g.restore();
      }
      const jr2 = L.rng('s11-joint-' + Math.round(c.y0));
      for (let i = 0; i < c.xs.length - 1; i++) {
        const x0 = c.xs[i], x1 = c.xs[i + 1], oy = jr2.range(-1.3, 1.3), wj = jr2.range(1.1, 2.8);
        g.lineWidth = wj; g.strokeStyle = `rgba(5,1,4,${jr2.range(0.4, 0.72).toFixed(3)})`;
        g.beginPath(); g.moveTo(x0, c.y0 + oy); g.lineTo((x0 + x1) / 2, c.y0 + oy + jr2.range(-0.8, 0.8)); g.lineTo(x1, c.y0 + oy + jr2.range(-0.6, 0.6));
        g.moveTo(x0 + jr2.range(-1, 1), c.y0); g.lineTo(x0 + jr2.range(-1.5, 1.5), c.y1); g.stroke();
        g.lineWidth = 1; g.strokeStyle = `rgba(255,150,185,${jr2.range(0.06, 0.2).toFixed(3)})`;
        g.beginPath(); g.moveTo(x0 + 3, c.y0 + oy + wj + 1.2); g.lineTo(x1 - 3, c.y0 + oy + wj + 1.2); g.stroke();
      }
    }
    // moss creeping out of the joints and under the nosing (苔痕)
    const mr = L.rng('s11-moss'), mn = L.makeNoise('s11-mossn');
    const dab = (x, y, d) => {
      const rr = mr.range(1, 3.6) * (0.6 + d * 1.6);
      g.fillStyle = mr.chance(0.3) ? 'rgba(24,32,14,0.5)' : 'rgba(7,10,7,0.55)';
      g.beginPath(); g.ellipse(x, y, rr * mr.range(0.9, 1.9), rr * mr.range(0.45, 1), mr.range(-0.3, 0.3), 0, TAU); g.fill();
    };
    courses.forEach((c, ci) => {
      for (let x = XL; x < XR; x += 5) {
        const d = mn.fbm(x / 190, ci * 3.7, 3) - 0.08;
        if (d <= 0) continue;
        for (let k = 1 + Math.floor(d * 12); k > 0; k--) dab(x + mr.range(-4, 4), c.y0 + mr.range(-3, 8) * (0.5 + d * 1.5), d);
      }
    });
    for (let x = XL; x < XR; x += 4) {
      const d = mn.fbm(x / 150, 91.3, 3) + 0.12;
      if (d <= 0) continue;
      for (let k = 1 + Math.floor(d * 7); k > 0; k--) dab(x + mr.range(-3, 3), a.yAt(x) + O.deck + mr.range(1, 9 + d * 20), d);
    }
    g.restore();

    // ── crisp arrises on the parapet and the arch ring (the relit map is soft; these put the edges back)
    g.save(); g.lineCap = 'butt';
    const dk = (al) => `rgba(8,0,6,${al})`, lt = (al) => `rgba(255,176,196,${al})`;
    {
      g.lineWidth = 1.6; g.strokeStyle = dk(0.6);
      g.beginPath(); g.arc(arch.cx, arch.cy, arch.ri + RT + 1, -Math.PI / 2 - 1.3, -Math.PI / 2 + 1.3); g.stroke();
      g.lineWidth = 1; g.strokeStyle = lt(0.14);
      g.beginPath(); g.arc(arch.cx, arch.cy, arch.ri + RT - 2, -Math.PI / 2 - 1.3, -Math.PI / 2 + 1.3); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = dk(0.55); g.beginPath();
      for (const t of arch.joints) {
        const sn = Math.sin(t), cs = Math.cos(t);
        g.moveTo(arch.cx + arch.ri * sn, arch.cy - arch.ri * cs); g.lineTo(arch.cx + (arch.ri + RT) * sn, arch.cy - (arch.ri + RT) * cs);
      }
      g.stroke();
    }
    // slab faces: no ruled tooling here — only what time left: a peppering of pick marks on some, pin-holes, hair cracks
    for (const s of lay.segs) {
      const v = L.rng('s11-slabtool-' + s.key);
      g.save(); tband(g, a, s.dy + 5, O.slab - 2, s.x0 + s.in0 + 2, s.x1 - s.in1 - 2); g.clip();
      if (v.chance(0.55)) {
        const dens = v.range(0.3, 1), ang = v.range(-1.1, 1.1), n = Math.round(((s.x1 - s.x0) * dens) / 2.2);
        g.lineCap = 'round';
        for (let k = 0; k < n; k++) {
          const x = v.range(s.x0, s.x1), y = a.yAt(x) + v.range(8, O.slab), len = v.range(2, 7), aa = ang + v.range(-0.5, 0.5);
          g.strokeStyle = v.chance(0.72) ? `rgba(6,0,6,${v.range(0.08, 0.26).toFixed(3)})` : `rgba(255,186,204,${v.range(0.05, 0.14).toFixed(3)})`;
          g.lineWidth = v.range(0.9, 2);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(aa) * len, y + Math.sin(aa) * len); g.stroke();
        }
        g.lineCap = 'butt';
      }
      g.restore();
    }
    for (const x of lay.joints) {
      const y = a.yAt(x);
      g.lineWidth = 2; g.strokeStyle = dk(0.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.6, y + O.slab); g.stroke();
      g.lineWidth = 1.1; g.strokeStyle = lt(0.2); g.beginPath(); g.moveTo(x + 2, y + 5); g.lineTo(x + 2.6, y + O.slab); g.stroke();
    }
    for (const p of lay.posts) {
      const yb = postFoot(a, p) - 1;
      g.lineWidth = 1.6; g.strokeStyle = dk(0.45); g.beginPath();
      g.moveTo(p.x - p.hw - 0.5, p.yt + p.cl * 1.15); g.lineTo(p.x - p.hw - 0.5, yb);
      g.moveTo(p.x + p.hw + 0.5, p.yt + p.cr * 1.15); g.lineTo(p.x + p.hw + 0.5, yb);
      g.stroke();
      g.lineWidth = 1.3; g.strokeStyle = lt(0.22); g.beginPath();
      g.moveTo(p.x - p.hw + 2.4, p.yt + p.cl * 1.15 + 1); g.lineTo(p.x - p.hw + 2.4, yb);
      g.moveTo(p.x + p.hw - 2.4, p.yt + p.cr * 1.15 + 1); g.lineTo(p.x + p.hw - 2.4, yb);
      g.stroke();
    }
    g.lineWidth = 1.7; g.strokeStyle = dk(0.5); tline(g, a, O.slab);
    g.lineWidth = 1; g.strokeStyle = lt(0.2); tline(g, a, O.slab + 2.6);
    g.lineWidth = 2; g.strokeStyle = dk(0.6); tline(g, a, O.deck);
    // wet gloss along the nosing of the deck course
    g.globalCompositeOperation = 'screen';
    for (let x = XL; x < XR; x += 6) {
      let e = 0;
      for (const ln of lay.lanterns) { const d = x - ln.x; e += ln.power / (1 + (d * d) / (120 * 120)); }
      e = L.clamp(0.08 + 0.42 * e, 0, 1) * L.clamp(0.5 + 0.7 * mn.fbm(x / 60, 5.5, 3), 0.1, 1);
      const x1 = x + 6.6, o = O.slab + (O.deck - O.slab) * 0.3;
      g.strokeStyle = `rgba(255,170,176,${(0.5 * e).toFixed(3)})`; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(x, a.yAt(x) + o); g.lineTo(x1, a.yAt(x1) + o); g.stroke();
      g.strokeStyle = `rgba(255,110,150,${(0.2 * e).toFixed(3)})`; g.lineWidth = 10;
      g.beginPath(); g.moveTo(x, a.yAt(x) + o + 2); g.lineTo(x1, a.yAt(x1) + o + 2); g.stroke();
    }
    g.restore();

    // ── detail over the whole elevation: stone grain (uneven: open-grained in patches, tight elsewhere), pits, crystals
    g.save();
    const gm = L.makeLayer(PAD, (m) => {
      m.fillStyle = m.createPattern(grain, 'repeat'); m.fillRect(-PAD, a.crestY - 80, LW, LH);
      m.globalCompositeOperation = 'destination-in';
      m.drawImage(L.noiseTex(LW, LH, { seed: 's11grainmask', scale: 190, octaves: 3, warp: 0.6, res: 0.2, contrast: 1.5,
        ramp: [[0, 'rgba(0,0,0,0.05)'], [0.5, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0.62)']] }), -PAD, -PAD);
    });
    g.globalCompositeOperation = 'overlay';
    g.drawImage(gm, -PAD, -PAD);
    g.globalCompositeOperation = 'source-over';
    const pn = L.makeNoise('s11-pitmask');
    L.speckle(g, { seed: 's11pits', count: 3000, x: -PAD, y: a.crestY - 40, w: LW, h: H + PAD - a.crestY + 40, rMin: 0.8, rMax: 4.6, colors: ['#020003', '#14040c', '#020003', '#ffa6c0'], alpha: [0.12, 0.5],
      test: (x, y) => pn.fbm(x / 120, y / 90, 2) > -0.12 });
    // colour temperature: a little warmth right beside each lantern, cool violet where only the night reaches
    g.globalCompositeOperation = 'soft-light';
    for (const ln of lay.lanterns) {
      const R1 = ln.rx * 1.9;
      g.fillStyle = L.radial(g, ln.x, ln.y + ln.ry * 0.7, ln.rx * 0.4, R1, [[0, `rgba(255,120,60,${(0.4 * ln.glowK).toFixed(3)})`], [0.4, `rgba(255,110,60,${(0.15 * ln.glowK).toFixed(3)})`], [1, 'rgba(255,110,60,0)']]);
      g.fillRect(ln.x - R1, ln.y - R1, R1 * 2, R1 * 2);
    }
    g.globalCompositeOperation = 'screen';
    for (const ln of lay.lanterns) {
      const R1 = ln.rx * 2.4, cy = ln.y + ln.ry * 0.55;
      g.fillStyle = L.radial(g, ln.x, cy, ln.rx * 0.3, R1, [[0, `rgba(255,96,104,${(0.34 * ln.glowK).toFixed(3)})`], [0.4, `rgba(255,60,100,${(0.13 * ln.glowK).toFixed(3)})`], [1, 'rgba(255,40,100,0)']]);
      g.fillRect(ln.x - R1, cy - R1, R1 * 2, R1 * 2);
    }
    g.globalCompositeOperation = 'soft-light';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's11hue', scale: 260, octaves: 3, warp: 0.5, res: 0.2,
      ramp: [[0, 'rgba(90,30,170,0.1)'], [0.42, 'rgba(90,30,170,0)'], [0.66, 'rgba(255,90,90,0)'], [1, 'rgba(255,90,90,0.12)']] }), -PAD, -PAD);
    g.fillStyle = L.linear(g, 0, a.crestY + 230, 0, H + 40, [[0, 'rgba(90,30,170,0)'], [1, 'rgba(90,30,170,0.14)']]);
    g.fillRect(-PAD, a.crestY + 230, LW, LH);
    g.globalCompositeOperation = 'source-over';
    // the bridge sinks into darkness toward the water
    g.fillStyle = L.linear(g, 0, a.crestY + 290, 0, H + 60, [[0, 'rgba(5,2,8,0)'], [0.5, 'rgba(5,2,8,0.2)'], [1, 'rgba(5,2,8,0.7)']]);
    g.fillRect(-PAD, a.crestY + 290, LW, LH);
    g.restore();

    // ── cut the silhouette at full resolution
    const mask = L.makeLayer(PAD, (m) => {
      m.fillStyle = '#fff'; tband(m, a, 3, 1700, XL - 20, XR + 20); m.fill();
      for (const s of lay.segs) { tband(m, a, s.dy, 6, s.x0 - 0.5, s.x1 + 0.5); m.fill(); }
      for (const p of lay.posts) { postPath(m, a, p); m.fill(); }
      m.globalCompositeOperation = 'destination-out';
      m.beginPath(); m.arc(arch.cx, arch.cy, arch.ri, 0, TAU); m.fill();
    });
    g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, -PAD, -PAD);
    g.globalCompositeOperation = 'source-over';

    // ── soffit of the arch barrel, seen from the water: lit only by light bouncing off the canal
    const yVP = a.crestY + 1100, sF = 0.93;
    const far = { cy: yVP + sF * (arch.cy - yVP), r: arch.ri * sF };
    g.save();
    g.beginPath(); g.arc(arch.cx, arch.cy, arch.ri, 0, TAU); g.arc(arch.cx, far.cy, far.r, 0, TAU); g.clip('evenodd');
    g.fillStyle = '#0c0410'; g.fillRect(-PAD, -PAD, LW, LH);
    g.fillStyle = L.radial(g, arch.cx, arch.cy, arch.ri - 60, arch.ri, [[0, 'rgba(110,14,70,0)'], [0.5, 'rgba(110,14,70,0.2)'], [1, 'rgba(150,22,90,0.46)']]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5;
    g.drawImage(L.noiseTex(LW, 520, { seed: 's11caustic', scale: 46, sx: 2.6, sy: 0.7, octaves: 3, ridged: true, warp: 0.7, contrast: 2.1, res: 0.33, oy: 600 }), -PAD, H + PAD - 520);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.strokeStyle = 'rgba(4,0,3,0.6)'; g.lineWidth = 1.4;
    for (const f of [0.36, 0.7]) { g.beginPath(); g.arc(arch.cx, L.lerp(arch.cy, far.cy, f), L.lerp(arch.ri, far.r, f), 0, TAU); g.stroke(); }
    for (let j = -12; j <= 12; j++) {
      const t = (j + 0.5) * (120 / arch.ri);
      g.beginPath(); g.moveTo(arch.cx + arch.ri * Math.sin(t), arch.cy - arch.ri * Math.cos(t)); g.lineTo(arch.cx + far.r * Math.sin(t), far.cy - far.r * Math.cos(t)); g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(3,0,3,0.85)'; g.lineWidth = 2.2; g.beginPath(); g.arc(arch.cx, arch.cy, arch.ri, 0, TAU); g.stroke();

    // ── the rim: the rounded coping catches the lantern light full on → the brightest line in the frame sits on the arc.
    // It is a worn edge, not a ruled one: it flares beside each lantern, thins between them, breaks at chips and joints.
    const lampAt = (x) => { let e = 0; for (const ln of lay.lanterns) { const d = x - ln.x; e += ln.power / (1 + (d * d) / (190 * 190)); } return e; };
    const rimL = L.makeLayer(PAD, (m) => {
      m.save();
      m.beginPath(); m.rect(-PAD, -PAD, LW, LH);
      for (const p of lay.posts) m.rect(p.x - p.hw - 0.5, p.y - 60, p.hw * 2 + 1, 120);
      m.clip('evenodd');
      m.lineCap = 'butt';
      for (const [o, lw, al, col] of [[22, 44, 0.22, '255,50,104'], [12, 24, 0.4, '255,92,114'], [6.6, 13.2, 0.72, '255,150,128'], [3.4, 6.8, 1, '255,216,172']]) {
        for (let x = XL; x < XR; x += 5) {
          const s = segAt(x); if (!s) continue;
          const e = L.clamp(0.5 + 0.4 * lampAt(x), 0, 1) * L.clamp(0.84 + 0.34 * mn.fbm(x / 46, 17.3, 3), 0.55, 1);
          const x1 = Math.min(x + 5.3, s.x1), ya = a.yAt(x) + s.dy, yb = a.yAt(x1) + s.dy;
          m.strokeStyle = `rgba(${col},${(al * e).toFixed(3)})`; m.lineWidth = lw;
          m.beginPath(); m.moveTo(x, ya + o); m.lineTo(x1, yb + o); m.stroke();
        }
      }
      m.restore();
      m.lineCap = 'round'; m.lineJoin = 'round';
      for (const p of lay.posts) {
        const e = L.clamp(0.45 + 0.4 * lampAt(p.x), 0, 1);
        const head = () => { m.beginPath(); m.moveTo(p.x - p.hw + 1.5, p.yt + p.cl * 1.15 + 1); m.lineTo(p.x - p.hw + p.cl + 0.5, p.yt + 1.8); m.lineTo(p.x + p.hw - p.cr - 0.5, p.yt + 1.8); m.lineTo(p.x + p.hw - 1.5, p.yt + p.cr * 1.15 + 1); };
        m.strokeStyle = `rgba(255,96,120,${(0.4 * e).toFixed(3)})`; m.lineWidth = 9; head(); m.stroke();
        m.strokeStyle = `rgba(255,200,158,${(0.9 * e).toFixed(3)})`; m.lineWidth = 3.8; head(); m.stroke();
      }
    });
    g.save(); g.globalCompositeOperation = 'screen';
    g.drawImage(L.blurred(rimL, 1.1), -PAD, -PAD);
    g.restore();
    // chips knocked out of the top arris; the corners at posts and joints are the first to go
    g.save(); g.globalCompositeOperation = 'destination-out';
    const cr = L.rng('s11-chips');
    for (const s of lay.segs) {
      const xa = s.x0 + s.in0 + 12, xb = s.x1 - s.in1 - 12;
      for (let n = xb > xa ? cr.int(0, 3) : 0; n > 0; n--) {
        const x = cr.range(xa, xb), w = cr.chance(0.32) ? cr.range(14, 36) : cr.range(4, 10), d = cr.range(1.6, 5), y = a.yAt(x) + s.dy - 1.5;
        g.beginPath(); g.moveTo(x - w, y); g.lineTo(x - w * cr.range(0.3, 0.7), y + 1.5 + d * cr.range(0.6, 1)); g.lineTo(x + w * cr.range(0.1, 0.7), y + 1.5 + d * cr.range(0.5, 1)); g.lineTo(x + w, y); g.closePath(); g.fill();
      }
    }
    g.restore();
  });

  // ── depth of field: focus sits on the crest; the bridge softens toward its ends and down toward the water
  const soft = L.blurred(layer, 4.2);
  const sg = soft.getContext('2d');
  sg.save();
  sg.globalCompositeOperation = 'destination-in';
  sg.translate(PAD + a.cx, PAD + a.crestY + 40); sg.scale(1, 0.5);
  sg.fillStyle = L.radial(sg, 0, 0, 430, 1320, [[0, 'rgba(0,0,0,0)'], [0.35, 'rgba(0,0,0,0.3)'], [0.7, 'rgba(0,0,0,0.72)'], [1, 'rgba(0,0,0,0.92)']]);
  sg.fillRect(-LW, -LH * 2, LW * 2, LH * 4);
  sg.restore();
  layer.getContext('2d').drawImage(soft, -PAD, -PAD);
  return layer;
}

// ───────────────────────── lanterns ─────────────────────────
const GOLDS = ['#f2bd2e', '#ffd95a', '#e3a51e', '#ffe58a', '#f0b429', '#ffc94a'];

function makeLantern(ln, tex) {
  const { rx, ry, sc, glowK: gk } = ln;
  const capW = rx * 0.36, capH = rx * 0.2, e = capW * 0.18;
  const yCut = ry * 0.93;
  const cord = ln.cord, tLen = rx * 0.98;
  const top = yCut + capH + e + cord;                       // body centre → where the cord is lost in the dark (the pivot)
  const bot = yCut + capH + e + 30 * sc + tLen + 8;
  const m = 60;                                             // room for the bloom
  ln.py = ln.y - top; ln.top = top;
  if (ln.x < -330 || ln.x > W + 330) return;                // never in frame: only its light matters
  const w = Math.ceil(rx * 2 + m * 2), h = Math.ceil(top + bot + m * 2);
  const c = L.makeCanvas(w, h); const g = c.getContext('2d');
  const r = L.rng('s11-lan-paint-' + ln.k);
  const deep = 1 - L.clamp((gk - 0.6) / 0.4);              // 0 = the brightest lamp, 1 = the dimmest
  g.translate(w / 2, m + top);
  g.lineCap = 'round';

  // hanging cord: lit where it meets the lantern, gone a hand's breadth above; a small brass ring
  g.strokeStyle = L.linear(g, 0, -top, 0, -(yCut + capH), [[0, 'rgba(70,14,10,0)'], [0.5, 'rgba(84,18,12,0.4)'], [1, 'rgba(168,48,26,0.95)']]); g.lineWidth = 2.8 * sc;
  g.beginPath(); g.moveTo(0, -top); g.lineTo(0, -(yCut + capH)); g.stroke();
  g.strokeStyle = '#a8720e'; g.lineWidth = 2.6 * sc; g.beginPath(); g.arc(0, -(yCut + capH + e + 7 * sc), 5 * sc, 0, TAU); g.stroke();

  // silhouette: a hand-made frame is never a true ellipse — slightly lopsided, a little flat here and full there
  const wob = L.makeNoise('s11-lan-shape-' + ln.k), lop = r.range(-0.02, 0.02);
  const body = () => {
    g.beginPath();
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * TAU, cs = Math.cos(t), sn = Math.sin(t);
      const f = 1 + 0.012 * wob.fbm(cs * 1.4 + 3, sn * 1.4 + 7, 2) + lop * cs * Math.abs(sn);
      if (i) g.lineTo(cs * rx * f, sn * ry * f); else g.moveTo(cs * rx * f, sn * ry * f);
    }
    g.closePath();
  };
  const ly0 = ry * 0.1;                                     // the lamp hangs a little below the middle

  // body: red gauze glowing from the lamp inside — a small hot heart, then true vermilion all the way out to a deep crimson limb
  g.save(); body(); g.clip();
  g.save(); g.scale(1, ry / rx);
  const R1 = rx * 1.08, gy = (ly0 * rx) / ry;
  g.fillStyle = L.radial(g, 0, gy, 0, R1, [[0, '#fff4c4'], [0.06, '#ffd04a'], [0.14, '#ff7a22'], [0.25, '#fb3418'], [0.5, '#ee2014'], [0.72, '#d61416'], [0.9, '#9a0b18'], [1, '#580612']]);
  g.fillRect(-R1, -R1 * 1.2, R1 * 2, R1 * 2.4);
  if (deep > 0.02) {
    g.globalAlpha = deep;
    g.fillStyle = L.radial(g, 0, gy, 0, R1, [[0, '#ffc45a'], [0.05, '#ff8426'], [0.13, '#e22a18'], [0.4, '#c21316'], [0.76, '#8a0a16'], [1, '#40050e']]);
    g.fillRect(-R1, -R1 * 1.2, R1 * 2, R1 * 2.4);
    g.globalAlpha = 1;
  }
  g.restore();
  // the lamp itself, a taller blur of light
  g.save(); g.globalCompositeOperation = 'screen'; g.scale(0.6, 1);
  g.fillStyle = L.radial(g, 0, ly0, 0, ry * 0.56, [[0, `rgba(255,232,130,${(0.26 + 0.5 * gk).toFixed(3)})`], [0.45, `rgba(255,140,50,${(0.05 + 0.2 * gk).toFixed(3)})`], [1, 'rgba(255,80,30,0)']]);
  g.fillRect(-rx * 2, -ry, rx * 4, ry * 2);
  g.restore();
  // the top of the globe is farther from the lamp and under the cap: it falls off into crimson
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.linear(g, 0, -ry, 0, ry, [[0, 'rgba(150,16,30,0.62)'], [0.4, 'rgba(190,30,40,0)'], [0.86, 'rgba(190,30,40,0)'], [1, 'rgba(150,16,30,0.4)']]);
  g.fillRect(-rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2);
  g.globalCompositeOperation = 'source-over';

  // ribs (灯笼骨): meridians from cap to cap, crowding toward the limb; hand-bent, so never quite evenly spaced
  const NG = rx > 105 ? 13 : 11;
  const ribs = [];
  for (let j = 0; j < NG; j++) ribs.push({ phi: -Math.PI / 2 + ((j + 0.5) * Math.PI) / NG + r.range(-0.06, 0.06), bend: r.range(-0.014, 0.014), wt: r.range(0.6, 1.35) });
  const mer = (sx, bend = 0) => { g.beginPath(); g.ellipse(0, 0, Math.max(0.6, Math.abs(sx) * rx), ry * 1.01, bend, -Math.PI / 2, Math.PI / 2, sx < 0); };
  // seen through the cloth: the ribs of the far side and the stem that carries the lamp, as soft shadows
  for (let j = 0; j < NG; j++) {
    const phi = ribs[j].phi + (Math.PI / NG) * r.range(0.3, 0.7);
    if (Math.abs(phi) > 1.25) continue;
    g.strokeStyle = `rgba(120,4,14,${(0.1 * Math.cos(phi)).toFixed(3)})`; g.lineWidth = 6 * sc; mer(Math.sin(phi) || 0.001, -ribs[j].bend); g.stroke();
  }
  g.strokeStyle = L.linear(g, 0, -ry, 0, ly0, [[0, 'rgba(96,4,12,0.42)'], [0.75, 'rgba(120,10,12,0.2)'], [1, 'rgba(160,30,12,0)']]); g.lineWidth = 5 * sc; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(r.range(-2, 2), -ry); g.lineTo(0, ly0 - ry * 0.12); g.stroke(); g.lineCap = 'round';
  // each gore of gauze between two ribs bellies out and passes a little more or less light than its neighbours
  for (let j = 0; j <= NG; j++) {
    const p0 = j === 0 ? -Math.PI / 2 : ribs[j - 1].phi, p1 = j === NG ? Math.PI / 2 : ribs[j].phi, phi = (p0 + p1) / 2, wp = rx * (p1 - p0) * Math.cos(phi);
    if (wp < 4) continue;
    const lum = r.range(-1, 1);
    g.globalCompositeOperation = lum > 0 ? 'screen' : 'multiply';
    g.strokeStyle = lum > 0 ? `rgba(255,120,70,${(0.05 + 0.13 * lum).toFixed(3)})` : `rgba(176,18,24,${(-0.3 * lum).toFixed(3)})`;
    g.lineWidth = wp * 0.6; mer(Math.sin(phi) || 0.001); g.stroke();
  }
  // cloth: vertical threads, uneven dye and the dust of a season outdoors, all seen in transmitted light
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.42;
  g.drawImage(tex.cloth, r.int(0, 180), r.int(0, 180), 320, 320, -rx, -ry, rx * 2, ry * 2);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.34;
  g.drawImage(tex.blotch, r.int(0, 300), r.int(0, 300), 200, 200, -rx, -ry, rx * 2, ry * 2);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3 + 0.6 * deep;
  g.drawImage(tex.stain, r.int(0, 250), r.int(0, 250), 250, 250, -rx, -ry, rx * 2, ry * 2);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  for (let j = 0; j < NG; j++) {
    const rb = ribs[j], sx = Math.sin(rb.phi), face = Math.cos(rb.phi);
    g.strokeStyle = `rgba(96,0,12,${((0.1 + 0.1 * face) * rb.wt).toFixed(3)})`; g.lineWidth = 9 * (0.3 + 0.7 * face) * sc; mer(sx, rb.bend); g.stroke();
    g.strokeStyle = `rgba(74,0,10,${(0.3 * rb.wt).toFixed(3)})`; g.lineWidth = (0.8 + 1.5 * face) * sc * rb.wt; mer(sx, rb.bend); g.stroke();
  }
  // gathered cloth darkens at the mouths; limb darkening (no outline: the edge is just where the gauze turns away)
  g.fillStyle = L.linear(g, 0, -ry, 0, ry, [[0, 'rgba(50,0,10,0.7)'], [0.17, 'rgba(50,0,10,0)'], [0.84, 'rgba(50,0,10,0)'], [1, 'rgba(50,0,10,0.66)']]);
  g.fillRect(-rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2);
  g.save(); g.scale(1, ry / rx); g.globalCompositeOperation = 'multiply';
  g.fillStyle = L.radial(g, 0, 0, rx * 0.7, rx * 1.04, [[0, '#ffffff'], [0.55, '#f0bcbc'], [1, '#9a3a48']]);
  g.fillRect(-R1, -R1 * 1.2, R1 * 2, R1 * 2.4);
  g.restore();
  g.restore();

  // mouths (灯托): short brass collars, dull at night — they only catch the glow of the globe they close
  const gold = L.linear(g, -capW, 0, capW, 0, [[0, '#2c1502'], [0.18, '#8c5a0e'], [0.4, '#f7d684'], [0.55, '#dba42c'], [0.82, '#7a4a08'], [1, '#281202']]);
  for (const sgn of [-1, 1]) {
    const yA = sgn * yCut, yB = sgn * (yCut + capH);
    g.beginPath();
    if (sgn < 0) { g.ellipse(0, yB, capW, e, 0, Math.PI, TAU); g.lineTo(capW * 1.1, yA); g.ellipse(0, yA, capW * 1.1, e, 0, 0, Math.PI, true); }
    else { g.ellipse(0, yA, capW * 1.1, e, 0, Math.PI, 0, true); g.lineTo(capW, yB); g.ellipse(0, yB, capW, e, 0, 0, Math.PI, false); }
    g.closePath();
    g.fillStyle = gold; g.fill();
    g.fillStyle = L.linear(g, 0, yA, 0, yB + sgn * e, [[0, 'rgba(255,96,30,0.5)'], [0.45, 'rgba(60,20,0,0.1)'], [1, 'rgba(20,6,0,0.62)']]); g.fill();
    g.strokeStyle = 'rgba(46,18,0,0.5)'; g.lineWidth = 1.4 * sc;
    for (const f of [0.4]) {
      const yy = L.lerp(yA, yB, f), ww = L.lerp(capW * 1.1, capW, f);
      g.beginPath(); if (sgn < 0) g.ellipse(0, yy, ww, e, 0, Math.PI, TAU); else g.ellipse(0, yy, ww, e, 0, 0, Math.PI); g.stroke();
    }
  }

  // tassel (流苏): bead, bound head, a skirt of gold silk
  const yb = yCut + capH + e;
  g.strokeStyle = '#5a2a0c'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, yb - 2); g.lineTo(0, yb + 8 * sc); g.stroke();
  const by = yb + 12 * sc, br = 6.4 * sc;
  g.fillStyle = L.radial(g, -br * 0.3, by - br * 0.4, 0.5, br * 1.2, [[0, '#fff0b4'], [0.4, '#f2bd2e'], [1, '#7a4a08']]);
  g.beginPath(); g.arc(0, by, br, 0, TAU); g.fill();
  const yh = by + br, hh = 11 * sc, hwd = 5.6 * sc;
  g.fillStyle = L.linear(g, -hwd, 0, hwd, 0, [[0, '#7a1410'], [0.4, '#e0301e'], [1, '#5a0c0c']]); g.fillRect(-hwd, yh - 1, hwd * 2, hh);
  const yt = yh + hh - 1, spread = 16 * sc, swing = r.range(-5, 5) * sc;
  g.fillStyle = L.linear(g, 0, yt, 0, yt + tLen, [[0, 'rgba(160,90,10,0.92)'], [1, 'rgba(120,44,10,0.6)']]);
  g.beginPath(); g.moveTo(-hwd, yt); g.lineTo(hwd, yt); g.lineTo(spread + swing, yt + tLen * 0.9); g.lineTo(-spread + swing, yt + tLen * 0.9); g.closePath(); g.fill();
  const nt = Math.round(34 * sc + 8);
  for (let i = 0; i < nt; i++) {
    const u = (i + 0.5) / nt - 0.5;
    const x0 = u * 2 * hwd, x1 = u * 2.2 * spread + swing + r.range(-3, 3), len = tLen * r.range(0.76, 1);
    const col = r.pick(GOLDS);
    g.strokeStyle = L.linear(g, 0, yt, 0, yt + tLen, [[0, col], [1, L.rgba(L.mix(col, '#c2461a', 0.36), 0.9)]]);
    g.lineWidth = r.range(1.2, 2.6) * Math.sqrt(sc);
    g.beginPath(); g.moveTo(x0, yt); g.quadraticCurveTo(x0 + (x1 - x0) * 0.2, yt + len * 0.5, x1, yt + len); g.stroke();
  }

  // bloom of the lamp through the cloth
  g.globalCompositeOperation = 'screen';
  g.fillStyle = L.radial(g, 0, ly0, 0, rx * 0.66, [[0, `rgba(255,214,110,${(0.1 + 0.3 * gk).toFixed(3)})`], [0.5, `rgba(255,96,44,${(0.12 * gk).toFixed(3)})`], [1, 'rgba(255,50,36,0)']]);
  body(); g.fill();
  g.globalCompositeOperation = 'source-over';

  // lens: focus is on the crest lantern — the ones toward the ends of the bridge go a little soft; the whole lit object bleeds into the night
  const dof = L.clamp((Math.abs(ln.x - W / 2) - 260) / 620) * 1.7;
  const out = L.blurred(c, 0.7 + dof);
  const og = out.getContext('2d');
  og.globalCompositeOperation = 'screen'; og.globalAlpha = 0.16;
  og.drawImage(L.blurred(c, 6 * sc), 0, 0);
  ln.bloom = L.blurred(c, 14 * sc);

  ln.sprite = out; ln.sox = w / 2; ln.soy = m;
}

function buildHalo(lay) {
  return L.makeLayer(PAD, (g) => {
    g.globalCompositeOperation = 'lighter';
    for (const ln of lay.lanterns) {
      const R1 = ln.rx * 3.3, k = 0.5 + 0.5 * ln.glowK;
      g.fillStyle = L.radial(g, ln.x, ln.y, ln.rx * 0.5, R1, [[0, `rgba(255,44,44,${(0.5 * k).toFixed(3)})`], [0.12, `rgba(226,24,56,${(0.24 * k).toFixed(3)})`], [0.36, `rgba(150,12,80,${(0.075 * k).toFixed(3)})`], [1, 'rgba(90,8,80,0)']]);
      g.fillRect(ln.x - R1, ln.y - R1, R1 * 2, R1 * 2);
    }
  });
}

/** night: clean near-black sky, a few far lamps far out of focus, the canal glimpsed through the arch */
function buildBack(a) {
  const layer = L.makeLayer(PAD, (g) => {
    g.fillStyle = NIGHT; g.fillRect(-PAD, -PAD, LW, LH);
    const r = L.rng('s11-bokeh');
    const cols = ['#ffd23f', '#ffb52e', '#ff4a3a', '#ffd23f'];
    g.globalCompositeOperation = 'lighter';
    const disc = (x, y, rad, col, al) => {
      g.fillStyle = L.radial(g, x, y, 0, rad, [[0, L.rgba(col, al * 0.75)], [0.72, L.rgba(col, al)], [0.92, L.rgba(col, al * 1.15)], [1, L.rgba(col, 0)]]);
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    };
    // two far lamps down the canal, wide open and far out of focus
    for (const [dx, up, rad, col, al] of [[-905, 96, 30, '#ff4a3a', 0.2], [770, 150, 22, '#ffb52e', 0.17]]) {
      const x = a.cx + dx;
      disc(x, a.yAt(x) - up, rad, col, al);
    }
    // far bank glimpsed under the arch
    for (let i = 0; i < 4; i++) {
      const x = a.cx + r.range(-380, 380), y = a.crestY + DROP + 56 + r.range(-8, 14), col = r.pick(['#ff7a2e', '#ff4a3a', '#ffb52e']);
      disc(x, y, r.range(9, 16), col, r.range(0.2, 0.4));
    }
  });
  return L.blurred(layer, 2.6);
}

export default {
  name: '拱桥红灯笼',
  tone: 'light',
  init(env) {
    const a = env.arc;
    S = {};
    const lay = layout(a);
    const courses = buildCourses(a);
    const arch = { cx: a.cx, cy: a.crestY + DROP + RA, ri: RA, joints: [] };
    { // voussoirs of uneven width
      const r = L.rng('s11-voussoirs'), rm = RA + RT / 2;
      for (let t = -1.3 - r.range(0, 0.05); t < 1.36; t += r.range(136, 236) / rm) arch.joints.push(t);
    }
    const tex = {
      cloth: L.noiseTex(512, 512, { seed: 's11cloth', scale: 5, sx: 0.8, sy: 7, octaves: 3, res: 1, contrast: 1.6 }),
      blotch: L.noiseTex(512, 512, { seed: 's11blotch', scale: 60, octaves: 4, warp: 0.9, res: 0.5, contrast: 1.8 }),
      stain: L.noiseTex(512, 512, { seed: 's11stain', scale: 74, octaves: 4, warp: 1.1, res: 0.5, contrast: 2.2,
        ramp: [[0, 'rgba(88,4,14,0.9)'], [0.4, 'rgba(88,4,14,0.3)'], [0.58, 'rgba(88,4,14,0)'], [1, 'rgba(88,4,14,0)']] }),
    };
    for (const ln of lay.lanterns) makeLantern(ln, tex);
    S.lay = lay;
    S.back = buildBack(a);
    S.halo = buildHalo(lay);
    S.bridge = buildBridge(env, lay, courses, arch);
  },
  draw(ctx, env, p) {
    const rot = L.lerp(-0.0085, 0.0085, p), zoom = L.lerp(0.995, 1.02, p);
    const t = p * env.dur;
    ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.back, { rot: rot * 0.3, zoom: 1 + (zoom - 1) * 0.3 });
    const breath = 0.93 + 0.07 * Math.sin(p * Math.PI * 1.5 + 0.5);
    L.blit(ctx, env, S.halo, { rot, zoom, blend: 'screen', alpha: breath });
    L.blit(ctx, env, S.bridge, { rot, zoom });
    L.cam(ctx, env, { rot, zoom }, () => {
      for (const ln of S.lay.lanterns) {
        if (!ln.sprite) continue;
        const sw = ln.tilt + 0.016 * ln.amp * Math.sin(TAU * (0.62 * t + ln.phase));
        const fl = (0.9 + 0.1 * Math.sin(TAU * (1.1 * t + ln.phase * 3.7))) * (0.45 + 0.55 * ln.glowK);
        L.glow(ctx, ln.x, ln.y, ln.rx * 1.9, '#ff2a24', 0.26 * fl);
        ctx.save(); ctx.translate(ln.x, ln.py); ctx.rotate(sw);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.62 * fl; ctx.drawImage(ln.bloom, -ln.sox, -ln.soy);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(ln.sprite, -ln.sox, -ln.soy);
        ctx.restore();
      }
      // each flame breathes a little on its own
      for (const ln of S.lay.lanterns) {
        if (!ln.sprite) continue;
        const fl = (0.9 + 0.1 * Math.sin(TAU * (1.1 * t + ln.phase * 3.7))) * (0.45 + 0.55 * ln.glowK);
        L.glow(ctx, ln.x, ln.y + ln.ry * 0.05, ln.rx * 0.55, '#ffd23f', 0.2 * fl);
      }
    });
    L.vignette(ctx, { strength: 0.3 });
  },
};
