// s20 — 宣德炉香火. Soft-focus close-up of a Xuande-style bronze censer, backlit by lamp light seen through incense smoke.
// The arc is the flared mouth rim (侈口): no hard line, just a rouge-red edge of light where the glow wraps over the lip,
// with a thread of ember orange showing from inside the mouth. Below it the lip rolls into the shadowed neck (束颈) and the
// swelling belly (鼓腹): jujube-red patina sinking to near-black, scattered with gold-splash flecks (洒金) that the soft
// focus pulls into small vertical points of light. Above it: nothing but deep orange rising to amber.
//
// Everything is shaded per pixel at half resolution in init() (the shot is soft-focus anyway), then blitted with a
// breath of zoom. The gold flecks live in K groups that brighten and dim by frame number.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 64;        // only a slight push-in → small margin
const HR = 0.5;        // internal resolution of the per-pixel layers
const K = 5;           // twinkle groups of gold flecks
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = (v, c, s) => { const t = (v - c) / s; return Math.exp(-0.5 * t * t); };

function lut(stops, n = 1024) {
  const f = L.makeRamp(stops); const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = f(i / (n - 1)); out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
// per-pixel hash → [0,1), used to dither the smooth gradients (no banding)
function hash2(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** blur more along y than along x (the soft focus "pulls" highlights vertically) */
function anisoBlur(src, bx, by) {
  const f = bx / by, w = src.width, h = Math.max(2, Math.round(src.height * f));
  const t1 = L.makeCanvas(w, h), g1 = t1.getContext('2d');
  g1.imageSmoothingEnabled = true; g1.imageSmoothingQuality = 'high'; g1.drawImage(src, 0, 0, w, h);
  const t2 = L.blurred(t1, bx);
  const out = L.makeCanvas(w, src.height), g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(t2, 0, 0, w, src.height);
  return out;
}
/** upscale a half-res buffer to full size once (so draw() only ever blits) */
function fullRes(c, w, h) {
  const out = L.makeCanvas(w, h), g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h);
  return out;
}
/** draw a cropped / half-res layer {c, x, y, s} with a zoom about the crest */
function put(ctx, a, layer, zoom, alpha = 1, blend = 'source-over') {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
  ctx.imageSmoothingEnabled = true;
  ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
  ctx.drawImage(layer.c, layer.x, layer.y, layer.c.width * layer.s, layer.c.height * layer.s);
  ctx.restore();
}

/** the lamp light behind the censer: deep orange at the rim → orange gold → amber, with a little smoke at the sides */
function buildBack(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = -PAD, Y0 = -PAD, Y1 = Y0 + 2 * Math.ceil((a.yAt(-PAD) + 70 - Y0) / 2);
  const bw = Math.round((W + PAD * 2) * HR), bh = Math.round((Y1 - Y0) * HR);
  const DR0 = -80, DR1 = 800, N = 1024;
  const ramp = lut([[-80, '#7a0d1c'], [-20, '#a50f28'], [0, '#b8142c'], [14, '#c0241f'], [40, '#c63a18'], [90, '#cc4c15'], [160, '#d66117'],
    [250, '#e0731e'], [380, '#e8862a'], [540, '#f59c35'], [760, '#ffb347']].map(([d, c]) => [(d - DR0) / (DR1 - DR0), c]), N);
  const nS = L.makeNoise('s20smoke'), nB = L.makeNoise('s20band');
  // far lamps, completely out of focus: big soft discs, kept clear of the text zone
  const rd = L.rng('s20lamps'), discs = [];
  let guard = 0;
  while (discs.length < 9 && guard++ < 400) {
    const x = rd.range(-60, W + 60), y = rd.range(-60, 470), r = rd.range(80, 190), al = rd.range(0.05, 0.12);
    if (y + r < 285 || Math.abs(x - 960) - r > 380) discs.push([x, y, r, al]);
  }
  const img = new ImageData(bw, bh), o = img.data;
  for (let j = 0; j < bh; j++) {
    const y = Y0 + (j + 0.5) / HR, ddy = cy - y;
    for (let i = 0; i < bw; i++) {
      const x = X0 + (i + 0.5) / HR, ddx = x - cx;
      const dr = Math.sqrt(ddx * ddx + ddy * ddy) - R;
      if (dr < DR0) continue;
      const li = Math.min(N - 1, ((dr - DR0) / (DR1 - DR0) * (N - 1)) | 0) * 3;
      let cr = ramp[li], cg = ramp[li + 1], cb = ramp[li + 2];
      // lamp glow high in the frame (never near the rim or the words)
      const up = sstep(150, 430, dr);
      let w = 0.55 * gauss(Math.hypot(x - 430, y - 30), 0, 430) + 0.4 * gauss(Math.hypot(x - 1570, y - 90), 0, 380) + 0.3 * gauss(Math.hypot(x - 960, y + 160), 0, 520);
      let dsc = 0;
      for (let q = 0; q < discs.length; q++) {
        const D = discs[q], dd = Math.hypot(x - D[0], y - D[1]);
        if (dd < D[2]) dsc += D[3] * (1 - sstep(D[2] * 0.7, D[2], dd));
      }
      w = L.clamp((w * 0.5 + dsc * 1.5) * up);
      cr += (255 - cr) * w; cg += (183 - cg) * w; cb += (72 - cb) * w;
      // incense smoke: nothing but a faint, fogged lift in brightness, at the two sides only
      const side = sstep(380, 700, Math.abs(ddx)) * sstep(20, 170, dr);
      if (side > 0.003) {
        const wx = nS.fbm(x / 460, y / 520, 2), wy = nS.fbm(x / 460 + 31, y / 520 - 17, 2);
        const f1 = nS.fbm(x / 380 + 1.5 * wx, y / 520 + 1.1 * wy, 2) * 0.5 + 0.5;
        const sm = sstep(0.35, 0.9, f1) * side * 0.13;
        cr += (255 - cr) * sm; cg += (184 - cg) * sm; cb += (84 - cb) * sm;
      }
      // slow horizontal layering of the haze + light from the upper left
      const band = 1 + 0.018 * nB.fbm(x / 1100, y / 150, 2) * sstep(60, 300, dr) - 0.012 * (ddx / 960);
      const dth = (hash2(i, j) - 0.5) * 2.6;
      const k = (j * bw + i) * 4;
      o[k] = cr * band + dth; o[k + 1] = cg * band + dth; o[k + 2] = cb * band + dth; o[k + 3] = 255;
    }
  }
  const c = L.makeCanvas(bw, bh); c.getContext('2d').putImageData(img, 0, 0);
  return { c: fullRes(c, W + PAD * 2, Y1 - Y0), x: X0, y: Y0, s: 1 };
}

/** the censer itself: lip → neck → belly in jujube-red patina, edge-lit in rouge red */
function buildBody(env, rim) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const X0 = rim.x, Y0 = rim.y, Y1 = Y0 + 2 * Math.ceil((H + PAD - Y0) / 2);
  const bw = Math.round((W + PAD * 2) * HR), bh = Math.round((Y1 - Y0) * HR);
  const nA = L.makeNoise('s20a'), nB = L.makeNoise('s20b');
  const N = 1024;
  const skin = lut([[0, '#0e0302'], [0.12, '#1c0806'], [0.3, '#33090a'], [0.48, '#4e100e'], [0.58, '#5a1410'], [0.7, '#7c1d15'], [0.82, '#a2301a'], [0.92, '#c24a22'], [1, '#de6a2c']], N);
  const img = new ImageData(bw, bh), o = img.data;
  const span = H - a.crestY;
  for (let j = 0; j < bh; j++) {
    const y = Y0 + (j + 0.5) / HR, ddy = cy - y;
    for (let i = 0; i < bw; i++) {
      const x = X0 + (i + 0.5) / HR, ddx = x - cx;
      const d = R - Math.sqrt(ddx * ddx + ddy * ddy);          // px below the rim
      if (d < -8) continue;
      const u = Math.atan2(ddx, ddy) * R;                        // px along the rim
      const lat = Math.exp(-((u + 240) * (u + 240)) / (820 * 820));   // the sheen sits a little left of centre
      // the turned profile, read as light: rounded lip → shadow under the flare → swelling shoulder
      let T = 0.5;
      T += 0.2 * gauss(d, 24, 18);
      T -= 0.2 * gauss(d, 116, 52);
      T += (0.11 + 0.21 * lat) * gauss(d, 262, d < 262 ? 52 : 150) + 0.1 * lat * lat * gauss(d, 240, 22);
      // patina: slow clouds, finer mottling, cast grain, and a faint vertical drag from the soft focus
      T += 0.07 * nA.fbm(u / 300, d / 240, 3) + 0.045 * nA.fbm(u / 70 + 9, d / 70 - 4, 3) + 0.02 * nB.n2(u / 7, d / 7) + 0.012 * nB.n2(x / 5 + 40, y / 5);
      T += 0.035 * nB.fbm(x / 26, y / 420 + 7, 2);
      // the belly sinks into the dark toward the bottom of frame
      const s = 0.55 * (y - a.crestY) / span + 0.45 * d / span;
      T *= 1 - 0.93 * sstep(0.4, 0.97, s);
      const li = ((L.clamp(T) * (N - 1)) | 0) * 3;
      let cr = skin[li], cg = skin[li + 1], cb = skin[li + 2];
      // rouge-red light wrapping over the lip, and its halation spilling down the neck
      const dd = Math.max(0, d), kr = Math.min(1, 0.9 * Math.exp(-dd / 12) + 0.3 * Math.exp(-dd / 80));
      cr += (198 - cr) * kr; cg += (22 - cg) * kr; cb += (50 - cb) * kr;
      const dth = (hash2(i + 911, j) - 0.5) * 2.2;
      const k = (j * bw + i) * 4;
      o[k] = cr + dth; o[k + 1] = cg + dth; o[k + 2] = cb + dth; o[k + 3] = 255 * sstep(-6, 6, d);
    }
  }
  const c = L.makeCanvas(bw, bh); c.getContext('2d').putImageData(img, 0, 0);
  const full = fullRes(c, W + PAD * 2, Y1 - Y0);
  full.getContext('2d').drawImage(rim.c, 0, 0);                  // the rouge edge of light rides on top, spilling both ways
  return { c: full, x: X0, y: Y0, s: 1 };
}

/** irregular flake outline, a little taller than wide */
function blob(g, x, y, w, stretch, r, rough) {
  const n = 9, pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * L.TAU + r.range(-0.22, 0.22), rad = (w / 2) * (1 + rough * r.range(-1, 1));
    pts.push([x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * stretch]);
  }
  g.beginPath();
  g.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  g.closePath();
}

/** gold-splash flecks (洒金): irregular flakes of every size, defocused into soft vertical points of light */
function buildFlecks(env) {
  const a = env.arc;
  const X0 = -PAD, Y0 = Math.floor(a.crestY), Y1 = H + PAD;
  const bw = Math.round((W + PAD * 2) * HR), bh = Math.round((Y1 - Y0) * HR);
  const mk = () => { const c = L.makeCanvas(bw, bh), g = c.getContext('2d'); g.scale(HR, HR); g.translate(-X0, -Y0); return [c, g]; };
  const far = [], near = [];
  for (let k = 0; k < K; k++) { far.push(mk()); near.push(mk()); }
  const r = L.rng('s20flecks'), nC = L.makeNoise('s20cluster');
  const span = a.span(PAD + 30), depth = H - a.crestY;
  const gold = L.makeRamp([[0, '#8a2a12'], [0.28, '#c8581c'], [0.52, '#e8862a'], [0.8, '#ffb347'], [1, '#ffcc6e']]);
  const glints = [];
  for (let n = 0; n < 2300; n++) {
    const th = r.range(-span, span), d = 40 + 660 * Math.pow(r(), 1.25);
    const kind = r(), wr = r(), lr = r(), k = r.int(0, K - 1), keep = r(), st = r(), gp = r(), gs = r();
    const p = a.pt(th, -d);
    if (p.y > Y1 + 20) continue;
    const u = th * a.R;
    // the gold was splashed on in drifts: dense here, sparse there
    const cl = nC.fbm(u / 230, d / 190, 3) * 0.5 + 0.5;
    const nearK = sstep(0.45, 1.0, (p.y - a.crestY) / depth);       // lower = closer to the lens = larger, softer, dimmer
    if (keep > (0.2 + 1.1 * sstep(0.3, 0.72, cl)) * (1 - 0.5 * nearK)) continue;   // … and fewer: the belly sinks into the dark
    const lat = Math.exp(-((u + 240) * (u + 240)) / (900 * 900));
    let w, stretch, rough;
    if (kind < 0.17) { w = L.lerp(11, 30, wr * wr); stretch = L.lerp(1.25, 1.8, st); rough = 0.45; }       // 斑片
    else if (kind < 0.7) { w = L.lerp(3.8, 9, wr); stretch = L.lerp(2.4, 3.8, st); rough = 0.3; }          // 点
    else { w = L.lerp(1.8, 3.6, wr); stretch = L.lerp(2.6, 4.6, st); rough = 0.2; }                         // 屑
    w *= 1 + 1.5 * nearK;
    let lit = (0.3 + 0.7 * gauss(d, 270, 160)) * (0.55 + 0.45 * lat) * L.lerp(0.3, 1, lr * lr) * (1 - 0.9 * nearK) * sstep(34, 80, d);
    if (kind < 0.17) lit *= 0.72;
    const c = gold(L.clamp(lit * 1.35));
    const g = (nearK > 0.38 ? near : far)[k][1];
    g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${L.clamp((0.3 + lit * 1.1) * (1 - 0.35 * nearK)).toFixed(3)})`;
    blob(g, p.x, p.y, w, stretch, r, rough); g.fill();
    if (kind >= 0.17 && kind < 0.7 && lit > 0.4 && nearK < 0.2) glints.push({ x: p.x, y: p.y, k: lit, w, ph: gp, sp: 0.9 + 0.6 * gs });
  }
  const groups = [];
  for (let k = 0; k < K; k++) {
    const f = anisoBlur(far[k][0], 0.8, 2.4), nr = anisoBlur(near[k][0], 3.2, 8);
    const out = L.makeCanvas(bw, bh), g = out.getContext('2d');
    g.drawImage(f, 0, 0); g.drawImage(nr, 0, 0);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6;
    g.drawImage(anisoBlur(far[k][0], 4.5, 11), 0, 0);            // bloom
    groups.push({ c: out, x: X0, y: Y0, s: 1 / HR, ph: r(), sp: r.range(0.8, 1.3) });
  }
  glints.sort((p, q) => q.k - p.k);
  return { groups, glints: glints.slice(0, 26) };
}

/** the rouge edge of light on the rim (baked onto the body layer) + the ember thread inside the mouth (flickers on its own) */
function buildRim(env) {
  const a = env.arc;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - 90, Y1 = Math.ceil(a.yAt(-PAD)) + 90;
  const w = W + PAD * 2, h = Y1 - Y0;
  const mk = (fn, x0 = X0, cw = w, chh = h) => { const c = L.makeCanvas(cw, chh), g = c.getContext('2d'); g.translate(-x0, -Y0); fn(g); return c; };
  const rim = L.makeCanvas(w, h), rg = rim.getContext('2d');
  rg.drawImage(L.blurred(mk((g) => { g.strokeStyle = 'rgba(179,18,46,0.9)'; g.lineWidth = 58; a.stroke(g, 0); }), 21), 0, 0);
  rg.drawImage(L.blurred(mk((g) => { g.strokeStyle = 'rgba(214,28,52,0.95)'; g.lineWidth = 13; a.stroke(g, 0); }), 6), 0, 0);
  // strongest where the lamp sits behind the censer, a little weaker toward the edges of frame
  rg.globalCompositeOperation = 'destination-in';
  rg.fillStyle = L.linear(rg, 0, 0, w, 0, [[0, 'rgba(0,0,0,0.72)'], [0.42, 'rgba(0,0,0,1)'], [0.62, 'rgba(0,0,0,0.96)'], [1, 'rgba(0,0,0,0.7)']]);
  rg.fillRect(0, 0, w, h);
  // ember thread: uneven, strongest across the middle; lives on a small strip of its own
  const T1 = 0.31, EX0 = Math.floor(a.pt(-T1, 0).x) - 60, EW = 2 * (a.cx - EX0), EH = Math.ceil(a.pt(T1, 0).y) + 60 - Y0;
  const nz = L.makeNoise('s20ember');
  const thread = mk((g) => {
    g.lineCap = 'round';
    const n = 260;
    for (let i = 0; i < n; i++) {
      const tA = L.lerp(-T1, T1, i / n), tB = L.lerp(-T1, T1, (i + 1) / n) + 0.0005;
      const uu = ((i + 0.5) / n) * 2 - 1, win = Math.pow(Math.max(0, 1 - uu * uu), 1.4);
      const v = L.clamp(0.72 + 0.6 * nz.fbm(i * 0.05, 3.1, 3)) * win;
      if (v < 0.02) continue;
      g.strokeStyle = `rgba(255,${Math.round(104 + 56 * v)},${Math.round(22 + 22 * v)},${(v * 0.95).toFixed(3)})`;
      g.lineWidth = 3 + 4 * v;
      g.beginPath(); a.trace(g, -5, tA, tB); g.stroke();
    }
  }, EX0, EW, EH);
  const ember = L.makeCanvas(EW, EH), eg = ember.getContext('2d');
  eg.globalAlpha = 0.6; eg.drawImage(L.blurred(thread, 12), 0, 0);
  eg.globalAlpha = 1; eg.drawImage(L.blurred(thread, 3), 0, 0);
  return { rim: { c: rim, x: X0, y: Y0, s: 1 }, ember: { c: ember, x: EX0, y: Y0, s: 1 } };
}

export default {
  name: '宣德炉香火',
  tone: 'light',
  init(env) {
    const fl = buildFlecks(env), rm = buildRim(env);
    S = { back: buildBack(env), body: buildBody(env, rm.rim), groups: fl.groups, glints: fl.glints, ember: rm.ember };
  },
  draw(ctx, env, p) {
    const a = env.arc, f = env.frame || 0;
    const zoom = L.lerp(1.0, 1.02, p), zb = 1 + (zoom - 1) * 0.35;
    const breath = Math.sin(L.TAU * (p * 0.85 + 0.05));          // the glow breathes once over the shot

    // 1) lamp light through the smoke
    put(ctx, a, S.back, zb);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.07 + 0.05 * breath;
    ctx.fillStyle = L.radial(ctx, 700, 40, 0, 1150, [[0, '#ffa63a'], [0.5, 'rgba(255,150,48,0.45)'], [1, 'rgba(255,140,44,0)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 2) the censer
    put(ctx, a, S.body, zoom);

    // 3) gold flecks: each group brightens and dims by frame number
    for (let k = 0; k < S.groups.length; k++) {
      const g = S.groups[k];
      const tw = 0.62 + 0.38 * Math.sin(L.TAU * ((f * g.sp) / 6 + g.ph));
      put(ctx, a, g, zoom, tw, 'screen');
    }
    // … and a few of them flare
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.translate(a.cx, a.crestY); ctx.scale(zoom, zoom); ctx.translate(-a.cx, -a.crestY);
    for (const q of S.glints) {
      const tw = Math.pow(Math.max(0, Math.sin(L.TAU * ((f * q.sp) / 7 + q.ph))), 2) * q.k;
      if (tw < 0.04) continue;
      const rad = 16 + q.w * 2.2;
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(0.55, 1.5);
      ctx.fillStyle = L.radial(ctx, 0, 0, 0, rad, [[0, `rgba(255,214,128,${0.9 * tw})`], [0.16, `rgba(255,180,76,${0.55 * tw})`], [0.5, `rgba(240,126,40,${0.16 * tw})`], [1, 'rgba(232,110,30,0)']]);
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
    }
    ctx.restore();

    // 4) ember thread inside the mouth, flickering
    put(ctx, a, S.ember, zoom, 0.76 + 0.24 * Math.sin(L.TAU * (f / 5 + 0.2)));
    // the glow breathes on the rim as well
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5 + 0.5 * breath;
    ctx.strokeStyle = 'rgba(214,40,30,0.1)'; ctx.lineWidth = 44; a.stroke(ctx, 2);
    ctx.restore();
  },
};
