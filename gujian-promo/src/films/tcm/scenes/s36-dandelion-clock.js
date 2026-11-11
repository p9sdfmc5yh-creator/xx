// s36 — 蒲公英绒球. Macro of a dandelion clock against black, lit from behind: only black and white.
//
// The clock is built as a real sphere of radius arc.R seen straight on (orthographic), so its upper silhouette IS the arc.
// A couple of hundred pappus "umbrellas" are scattered over the sphere (both the half facing us and the half behind);
// each one is a node on a slender beak with a funnel of unbranched hairs whose tips all end on the sphere's surface →
// the outline of the clock is nothing but hair tips. Every hair is projected, then sorted by its depth into blur
// buckets: the lens is focused on the limb plane, so the fans standing on the arc are crisp and everything nearer
// or farther melts into a bright veil (real depth of field, not a painted gradient). Near-side and far-side hairs
// live on separate layers and slide by different amounts → the ball seems to turn.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 80;                       // the camera move is tiny, a small margin is enough
const TOP = 420;                      // band layers start at this frame y: nothing of the clock reaches higher
const BW = W + PAD * 2, BH = H + PAD - TOP;
let S = null;

const WHITE = '#f6f6f2', COOL = '#cfdcea', GREY = '#8f9499', BROWN = '#3a2c20', BLACK = '#030303';
const DEEP = '#bcd0ea';                // the cool white, one step bluer: hairs far behind the focal plane

const SPACING = 210;                  // distance between neighbouring pappus nodes on the sphere (px)
const TIP = 4;                        // hair tips end this far outside the arc (the fuzz averages back onto it)
const DOF = 0.010;                    // blur sigma (px) per px of distance from the focal plane
const HAIR_A = 0.36;                  // opacity of one hair before lighting
const EDGE = [0.7, 1.7, 3.2, 5.2, 8, 12, 17];      // sigma thresholds between the blur buckets
const BLUR = [0, 1.2, 2.4, 4.2, 6.5, 10, 14, 20];  // blur applied to each bucket
const SCL = [1, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25];   // resolution each bucket is drawn at
const LIGHT = (() => { const v = [-0.32, 0.5, -0.8], m = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / m); })();   // from behind, above, a little left

/** a transparent canvas covering the lower band of the (padded) frame at resolution `sc`; draw in frame coordinates */
function band(sc = 1) {
  const c = L.makeCanvas(BW * sc, BH * sc), g = c.getContext('2d');
  g.setTransform(sc, 0, 0, sc, PAD * sc, -TOP * sc);
  c._sc = sc;
  return c;
}
/** blit a band layer; rot turns it about the arc's centre so the silhouette stays put */
function put(ctx, env, layer, o = {}) {
  const { rot = 0, alpha = 1, blend = 'source-over' } = o;
  if (alpha <= 0) return;
  const a = env.arc;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = blend;
  if (rot) { ctx.translate(a.cx, a.cy); ctx.rotate(rot); ctx.translate(-a.cx, -a.cy); }
  ctx.drawImage(layer, -PAD, TOP, BW, BH);
  ctx.restore();
}
/** copy `src` (any band canvas) into band canvas `dst`, ignoring dst's drawing transform */
function into(dst, src, alpha = 1, blend = 'source-over') {
  const g = dst.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha; g.globalCompositeOperation = blend;
  g.drawImage(src, 0, 0, dst.width, dst.height);
  g.restore();
}
/** defocus with a disc-shaped kernel: points open into flat discs, lines into ribbons, like a real lens wide open */
function lensBlur(src, radius, n = 18) {
  const c = L.makeCanvas(src.width, src.height), g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const rr = radius * Math.sqrt((i + 0.5) / n), th = i * 2.399963;
    g.globalAlpha = 1 / (i + 1);
    g.drawImage(src, Math.cos(th) * rr, Math.sin(th) * rr);
  }
  const out = L.blurred(c, Math.max(0.5, radius * 0.2));
  out._sc = src._sc;
  return out;
}

// ───────────────────────── geometry ─────────────────────────
/** unit vectors from the ball's centre to every pappus node (x right, y up, z toward the lens) */
function makeSeeds(a) {
  const R = a.R, r = L.rng('s36-seeds'), out = [];
  const mk = (ux, uy, uz, hero) => ({
    ux, uy, uz, hero,
    h: r.range(170, 250) + 85 * Math.pow(r(), 2),                  // node sits this far inside the surface
    a0: L.deg(r.range(40, 57)) * (r.chance(0.07) ? 0.62 : 1),      // half-angle of the funnel (a few are half closed)
    n: r.int(104, 150),
    gain: r.range(0.55, 1.25),
    beak: r.range(110, 230),
    tilt: [r.gauss() * 0.09, r.gauss() * 0.09, r.gauss() * 0.09],
  });
  // a row of umbrellas standing in the focal plane, irregularly spaced along the arc → crisp fans on the limb
  const span = a.span(PAD + 260);
  for (let th = -span + r.range(0, 0.05); th < span; th += r.range(0.065, 0.15)) {
    const uz = r.range(-0.05, 0.05), q = Math.sqrt(1 - uz * uz);
    out.push(mk(q * Math.sin(th), q * Math.cos(th), uz, true));
  }
  // the rest: dart throwing over the visible cap of the sphere
  const Rn = R - 235, dmin2 = Math.pow(SPACING / Rn, 2);
  for (let k = 0; k < 14000; k++) {
    const uy = r.range(0.66, 1), ph = r.range(0, L.TAU), q = Math.sqrt(1 - uy * uy);
    const ux = q * Math.sin(ph), uz = q * Math.cos(ph);
    const X = a.cx + Rn * ux, Y = a.cy - Rn * uy;
    if (X < -PAD - 330 || X > W + PAD + 330 || Y > H + PAD + 300) continue;
    let ok = true;
    for (let i = 0; i < out.length; i++) {
      const s = out[i], dx = s.ux - ux, dy = s.uy - uy, dz = s.uz - uz;
      if (dx * dx + dy * dy + dz * dz < dmin2) { ok = false; break; }
    }
    if (ok && !r.chance(0.07)) out.push(mk(ux, uy, uz, false));   // a few seeds have already blown away
  }
  return out;
}

const bucketOf = (z) => { const sigma = DOF * Math.abs(z); let b = 0; while (b < EDGE.length && sigma > EDGE[b]) b++; return b; };

/** every hair / beak as a projected quadratic: [x0,y0, xc,yc, x1,y1, alpha, width, kind] (kind 0 = hair, 1 = beak) */
function buildGeometry(a) {
  const R = a.R, cx = a.cx, cy = a.cy, r = L.rng('s36-hair');
  const mkB = () => BLUR.map(() => []);
  const G = { limb: [[], [], []], back: mkB(), front: mkB(), achenes: [], nodes: [] };
  const seeds = makeSeeds(a);
  const X0 = -PAD - 12, X1 = W + PAD + 12, Y1 = H + PAD + 12;
  const light = (x, y, z) => {
    const m = Math.hypot(x, y, z) || 1;
    return 0.46 + 0.54 * L.smooth(((x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]) / m + 0.08) / 0.66);
  };
  const store = (rec, z, idx = 0) => {
    const b = bucketOf(z), list = b <= 2 ? G.limb[b] : (z < 0 ? G.back : G.front)[b];
    if (b >= 4 && rec[8] === 0) {   // far out of focus nobody can count hairs: draw every other one, twice as strong
      if (idx & 1) return;
      rec[6] *= 1.9; rec[7] *= 1.4;
    }
    for (let i = 0; i < 9; i++) list.push(rec[i]);
  };
  for (const s of seeds) {
    const Rn = R - s.h;
    let ax = s.ux + s.tilt[0], ay = s.uy + s.tilt[1], az = s.uz + s.tilt[2];
    let m = Math.hypot(ax, ay, az); ax /= m; ay /= m; az /= m;
    m = Math.hypot(ax, ay); const e1x = ay / m, e1y = -ax / m;                 // e1 lies in the picture plane
    const e2x = -az * e1y, e2y = az * e1x, e2z = ax * e1y - ay * e1x;          // e2 carries the depth
    const Nx = Rn * s.ux, Ny = Rn * s.uy, Nz = Rn * s.uz;
    for (let i = 0; i < s.n; i++) {
      const psi = ((i + r.range(-0.45, 0.45)) / s.n) * L.TAU;
      // most hairs stand in one ring (the funnel's wall); the rest fill its inside
      const al = L.clamp(r.chance(0.6) ? s.a0 + r.gauss() * 0.1 : s.a0 * (0.18 + 0.8 * Math.sqrt(r())) + r.gauss() * 0.05, 0.04, 1.25);
      const ca = Math.cos(al), sa = Math.sin(al), cp = Math.cos(psi), sp = Math.sin(psi);
      const dx = ca * ax + sa * (cp * e1x + sp * e2x), dy = ca * ay + sa * (cp * e1y + sp * e2y), dz = ca * az + sa * sp * e2z;
      const Rt = R + TIP + r.gauss() * 3.5 + (r.chance(0.04) ? r.range(6, 22) : 0);
      const Nd = Nx * dx + Ny * dy + Nz * dz;
      let len = -Nd + Math.sqrt(Math.max(0, Nd * Nd + Rt * Rt - Rn * Rn));     // … so the tip lands on the sphere
      if (r.chance(0.07)) len *= r.range(0.45, 0.9);                           // a few broken hairs
      const k = (0.03 + r.gauss() * 0.045) * len;                              // slight bow: the funnel is a little cupped
      const Tx = Nx + len * dx, Ty = Ny + len * dy, Tz = Nz + len * dz;
      const Cx = Nx + 0.5 * len * dx + k * (ax - dx * ca), Cy = Ny + 0.5 * len * dy + k * (ay - dy * ca), Cz = Nz + 0.5 * len * dz + k * (az - dz * ca);
      const Mx = 0.25 * Nx + 0.5 * Cx + 0.25 * Tx, My = 0.25 * Ny + 0.5 * Cy + 0.25 * Ty, Mz = 0.25 * Nz + 0.5 * Cz + 0.25 * Tz;
      const alpha = HAIR_A * s.gain * light(Mx, My, Mz) * r.range(0.45, 1), lw = r.range(0.9, 1.7);
      const x0 = cx + Nx, y0 = cy - Ny, x1 = cx + Tx, y1 = cy - Ty;
      if (Math.max(x0, x1) < X0 || Math.min(x0, x1) > X1 || Math.min(y0, y1) > Y1) continue;
      store([x0, y0, cx + Cx, cy - Cy, x1, y1, alpha, lw, 0], Mz, i);
    }
    // the beak: a hair-thin stalk from the node straight down toward the centre of the ball …
    let bx = s.ux + s.tilt[0] * 0.25, by = s.uy + s.tilt[1] * 0.25, bz = s.uz + s.tilt[2] * 0.25;
    m = Math.hypot(bx, by, bz); bx /= m; by /= m; bz /= m;
    const Bn = Rn - s.beak, Bx = Bn * bx, By = Bn * by, Bz = Bn * bz;
    const lit = light(Nx, Ny, Nz), sway = r.gauss() * 9;
    if (cx + Nx > X0 - 60 && cx + Nx < X1 + 60 && cy - Ny < Y1) {
      store([cx + Nx, cy - Ny, cx + (Nx + Bx) / 2 + sway * e1x, cy - (Ny + By) / 2 - sway * e1y, cx + Bx, cy - By, 0.38 * lit * s.gain, 1.3, 1], (Nz + Bz) / 2);
      G.nodes.push({ x: cx + Nx, y: cy - Ny, z: Nz, lit, b: bucketOf(Nz), k: r.range(0.6, 1) });
    }
    // … and the achene hanging from it, deep inside
    const aLen = r.range(84, 104), An = Bn - aLen;
    const px0 = cx + Bx, py0 = cy - By, px1 = cx + An * bx, py1 = cy - An * by;
    if (Math.abs(s.uz) < 0.45 && px0 > X0 && px0 < X1 && py0 < H + PAD) {
      G.achenes.push({ x0: px0, y0: py0, x1: px1, y1: py1, w: r.range(20, 25), lit, z: Bz, seed: r.int(1, 99999) });
    }
  }
  return G;
}

// ───────────────────────── drawing ─────────────────────────
function strokeHairs(g, arr, color, o = {}) {
  const { tremble = 0, rv = null, tip = 0.6, gain = 1, glint = null, taper = true } = o;
  g.strokeStyle = color; g.lineCap = 'round';
  for (let i = 0; i < arr.length; i += 9) {
    const x0 = arr[i], y0 = arr[i + 1];
    let xc = arr[i + 2], yc = arr[i + 3], x1 = arr[i + 4], y1 = arr[i + 5];
    const al = arr[i + 6] * gain, lw = arr[i + 7], hair = arr[i + 8] === 0;
    if (tremble && hair) {   // the tips quiver: swing the outer end sideways
      const dx = x1 - x0, dy = y1 - y0, m = Math.hypot(dx, dy) || 1, t = rv.gauss() * tremble * Math.min(1.5, m / 220);
      x1 -= (dy / m) * t; y1 += (dx / m) * t; xc -= (dy / m) * t * 0.4; yc += (dx / m) * t * 0.4;
    }
    g.globalAlpha = Math.min(1, al); g.lineWidth = hair && taper ? lw * 0.66 : lw;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(xc, yc, x1, y1); g.stroke();
    if (!hair) continue;
    if (taper) {             // a hair is stouter toward its base …
      g.globalAlpha = Math.min(1, al * 0.55); g.lineWidth = lw;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + xc) / 2, (y0 + yc) / 2, 0.25 * x0 + 0.5 * xc + 0.25 * x1, 0.25 * y0 + 0.5 * yc + 0.25 * y1); g.stroke();
    }
    if (tip) {               // … and its outer end catches the back light
      const t = 0.82, u = 1 - t;
      g.globalAlpha = Math.min(1, al * tip); g.lineWidth = taper ? lw * 0.66 : lw;
      g.beginPath(); g.moveTo(u * u * x0 + 2 * u * t * xc + t * t * x1, u * u * y0 + 2 * u * t * yc + t * t * y1); g.lineTo(x1, y1); g.stroke();
    }
    if (glint) {             // in focus, the barbs along a hair sparkle
      g.setLineDash([glint.range(2, 7), glint.range(16, 60)]); g.lineDashOffset = glint.range(0, 60);
      g.globalAlpha = Math.min(1, al * 1.3); g.lineWidth = lw * 1.25;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(xc, yc, x1, y1); g.stroke();
      g.setLineDash([]);
    }
  }
  g.globalAlpha = 1;
}
/** draw one depth bucket at its own resolution, defocus it, and add it to `target` */
function renderBucket(target, hairs, color, b, o = {}, nodes = null) {
  if (!hairs.length) return;
  const sc = Math.min(SCL[b], target._sc), c = band(sc), g = c.getContext('2d');
  strokeHairs(g, hairs, color, { taper: b < 3, ...(b >= 4 ? { tip: 0 } : null), ...o });
  if (nodes) {   // the little disc the hairs spring from: a bright bead (it opens into a bokeh disc once defocused)
    g.fillStyle = WHITE;
    for (const n of nodes) {
      if (n.b !== b) continue;
      const rad = b < 3 ? 2.6 : 5 + 0.45 * BLUR[b];
      g.globalAlpha = Math.min(1, n.lit * n.k * (b < 3 ? 0.95 : 1)); g.beginPath(); g.arc(n.x, n.y, rad, 0, L.TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  const out = !BLUR[b] ? c : b >= 4 ? lensBlur(c, BLUR[b] * sc * 1.9) : L.blurred(c, BLUR[b] * sc);
  into(target, out);
}

/** achene: narrow, widest in its upper third, a short cone on top that runs into the beak; dark brown, rim-lit */
function drawAchene(g, q) {
  const dx = q.x1 - q.x0, dy = q.y1 - q.y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w = q.w / 2;
  const P = (t, o) => [q.x0 + dx * t + nx * o * w, q.y0 + dy * t + ny * o * w];
  g.beginPath(); g.moveTo(...P(-0.06, 0));
  g.bezierCurveTo(...P(0.1, 0.25), ...P(0.16, 1), ...P(0.34, 1)); g.bezierCurveTo(...P(0.6, 1), ...P(0.86, 0.5), ...P(1, 0.22));
  g.lineTo(...P(1, -0.22));
  g.bezierCurveTo(...P(0.86, -0.5), ...P(0.6, -1), ...P(0.34, -1)); g.bezierCurveTo(...P(0.16, -1), ...P(0.1, -0.25), ...P(-0.06, 0));
  g.closePath();
  const a0 = P(0.4, -1), a1 = P(0.4, 1);
  g.fillStyle = L.linear(g, a0[0], a0[1], a1[0], a1[1], [[0, L.mix(BROWN, GREY, 0.42 * q.lit)], [0.22, BROWN], [0.75, L.shade(BROWN, -0.3)], [1, L.mix(BROWN, GREY, 0.2 * q.lit)]]);
  g.fill();
  // ribs, and the tiny spines near the top
  const r = L.rng('ach' + q.seed);
  g.lineCap = 'round';
  for (const o of [-0.45, 0.05, 0.5]) {
    g.strokeStyle = L.rgba(L.mix(BROWN, GREY, 0.5), 0.35 * q.lit + 0.1); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(...P(0.12, o * 0.7)); g.quadraticCurveTo(...P(0.5, o * 1.05), ...P(0.95, o * 0.3)); g.stroke();
  }
  g.fillStyle = L.mix(BROWN, GREY, 0.3);
  for (let i = 0; i < 9; i++) {
    const t = r.range(0.1, 0.42), s = r.sign(), p0 = P(t, s * 0.92), p1 = P(t - 0.05, s * 1.5), p2 = P(t + 0.05, s * 0.9);
    g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.lineTo(...p2); g.closePath(); g.fill();
  }
}

/** dim a band layer toward the inside of the ball (alpha lo at depth, 1 near the surface) */
function dimDeep(layer, a, lo, r0 = 560, r1 = 110) {
  const g = layer.getContext('2d');
  g.save(); g.globalCompositeOperation = 'destination-in';
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - r0, a.R - r1, [[0, `rgba(0,0,0,${lo})`], [1, 'rgba(0,0,0,1)']]);
  g.fillRect(-PAD, TOP, BW, BH);
  g.restore();
}

function buildClock(env) {
  const a = env.arc, G = buildGeometry(a);

  // far half of the ball: fully lit by the back light, out of focus, cool
  const back = band(0.5);
  for (let b = 7; b >= 3; b--) renderBucket(back, G.back[b], b >= 5 ? DEEP : COOL, b, { gain: 1.3, tip: 0.4 }, G.nodes.filter((n) => n.z < 0));
  dimDeep(back, a, 0.55);
  // the achenes hang in front of that haze
  const ac = band(0.5), ag = ac.getContext('2d');
  for (const q of G.achenes) drawAchene(ag, q);
  into(back, L.blurred(ac, 1.4));

  // near half: in the ball's own shadow, softer the closer it comes to the lens
  const front = band(0.5);
  for (let b = 3; b <= 7; b++) renderBucket(front, G.front[b], b >= 5 ? COOL : L.mix(WHITE, COOL, 0.5), b, { gain: 1.3, tip: 0.4 }, G.nodes.filter((n) => n.z >= 0));
  dimDeep(front, a, 0.55);

  // just off the focal plane: soft strands
  const mid = band(0.5);
  renderBucket(mid, G.limb[2], L.mix(WHITE, COOL, 0.3), 2, { gain: 1.5 }, G.nodes);
  renderBucket(mid, G.limb[1], L.mix(WHITE, COOL, 0.12), 1, { gain: 2.0 }, G.nodes);

  // the limb: the hairs lying in the focal plane. Three takes with the tips swung a little differently → frame-to-frame quiver
  const limb = [0, 1, 2].map((v) => {
    const c = band(1);
    renderBucket(c, G.limb[0], WHITE, 0, { tremble: 2.2, rv: L.rng('s36-quiver' + v), gain: 2.8, tip: 0.8, glint: L.rng('s36-glint') }, G.nodes);
    return c;
  });
  return { back, front, mid, limb };
}

/** glow: the brightest fibres bleed a cool halo into the lens */
function buildBloom(K) {
  const sum = band(0.25);
  into(sum, K.back, 0.45); into(sum, K.mid); into(sum, K.limb[0]); into(sum, K.front, 0.45);
  const out = band(0.25);
  into(out, L.blurred(sum, 7), 0.7); into(out, L.blurred(sum, 2.2), 0.6); into(out, L.blurred(sum, 0.8), 0.35);
  const g = out.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#b4cbe8'; g.fillRect(0, 0, out.width, out.height);
  g.restore();
  return out;
}
/** the rim on its own: used to make the bright edge flare for a frame */
function buildRim(env, K) {
  const a = env.arc, c = band(0.5);
  into(c, K.back); into(c, K.mid); into(c, K.limb[0]); into(c, K.front);
  const g = c.getContext('2d');
  g.save(); g.globalCompositeOperation = 'destination-in';
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 90, a.R + 30, [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,1)'], [0.8, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(-PAD, TOP, BW, BH);
  g.restore();
  return L.blurred(c, 1.2);
}

/** a few umbrellas almost touching the lens: far out of focus, soft white discs with a hint of rays */
function buildForeground() {
  const c = band(0.25), g = c.getContext('2d'), r = L.rng('s36-fg');
  const blobs = [[170, 955, 250, 0.6], [1775, 925, 215, 0.5], [1215, 1105, 230, 0.42], [640, 1120, 200, 0.36]];
  g.lineCap = 'round';
  for (const [x, y, rad, al] of blobs) {
    g.save(); g.translate(x, y); g.rotate(r.range(0, 3)); g.scale(1, r.range(0.7, 0.92));
    g.strokeStyle = WHITE;
    for (let i = 0; i < 64; i++) {
      const an = ((i + r.range(-0.4, 0.4)) / 64) * L.TAU, len = rad * r.range(0.82, 1.05);
      g.globalAlpha = al * r.range(0.5, 1); g.lineWidth = r.range(2.5, 5);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(an) * len, Math.sin(an) * len); g.stroke();
    }
    g.globalAlpha = al; g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, rad * 0.1, 0, L.TAU); g.fill();
    g.restore();
  }
  return lensBlur(c, 10);
}

/** one seed adrift: a funnel of hairs, the beak, the achene. axis = direction the pappus points (x right, y up, z toward us) */
function buildDrifter(seed, size, axis, blur) {
  const r = L.rng(seed), D = Math.ceil(size * 4.6), c = L.makeCanvas(D, D), g = c.getContext('2d'), o = D / 2;
  let [ax, ay, az] = axis; let m = Math.hypot(ax, ay, az); ax /= m; ay /= m; az /= m;
  m = Math.hypot(ax, ay) || 1; const e1x = ay / m, e1y = -ax / m, e2x = -az * e1y, e2y = az * e1x;
  const nx = o + ax * size * 0.35, ny = o - ay * size * 0.35;      // the node sits a little off-centre along the axis
  g.lineCap = 'round'; g.strokeStyle = WHITE;
  const n = 46;
  for (let i = 0; i < n; i++) {
    const psi = ((i + r.range(-0.4, 0.4)) / n) * L.TAU, al = L.deg(63) + r.gauss() * 0.09, len = size * r.range(0.86, 1.05);
    const ca = Math.cos(al), sa = Math.sin(al), cp = Math.cos(psi), sp = Math.sin(psi);
    const dx = ca * ax + sa * (cp * e1x + sp * e2x), dy = ca * ay + sa * (cp * e1y + sp * e2y);
    const k = 0.08 * len;
    g.globalAlpha = r.range(0.4, 0.85); g.lineWidth = Math.max(0.9, size / 80) * r.range(0.8, 1.2);
    g.beginPath(); g.moveTo(nx, ny);
    g.quadraticCurveTo(nx + (0.5 * len * dx + k * (ax - dx * ca)), ny - (0.5 * len * dy + k * (ay - dy * ca)), nx + len * dx, ny - len * dy); g.stroke();
  }
  const bl = size * 1.35, bx = nx - ax * bl, by = ny + ay * bl;
  g.globalAlpha = 0.75; g.strokeStyle = L.mix(WHITE, GREY, 0.35); g.lineWidth = Math.max(1.1, size / 60);
  g.beginPath(); g.moveTo(nx, ny); g.lineTo(bx, by); g.stroke();
  g.globalAlpha = 1;
  drawAchene(g, { x0: bx, y0: by, x1: bx - ax * size * 0.5, y1: by + ay * size * 0.5, w: size * 0.14, lit: 1, seed: 7 });
  return blur ? L.blurred(c, blur) : c;
}

export default {
  name: '蒲公英绒球',
  tone: 'light',
  init(env) {
    const K = buildClock(env);
    S = {
      back: K.back, front: K.front, mid: K.mid, limb: K.limb,
      bloom: buildBloom(K), rim: buildRim(env, K), fg: buildForeground(),
      driftL: buildDrifter('s36-dl', 62, [-0.45, 0.8, 0.4], 2.2),
      driftR: buildDrifter('s36-dr', 44, [0.5, 0.75, -0.42], 3.4),
    };
  },
  draw(ctx, env, p) {
    const f = Math.round(p * (env.frames - 1));
    const rot = L.lerp(-0.0036, 0.0036, p);
    const flash = Math.pow(Math.sin(Math.PI * L.clamp(p)), 2);       // the bright edge flares once, mid-shot
    ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);

    // two seeds adrift, far out to the sides
    ctx.save();
    ctx.globalAlpha = 0.62; ctx.drawImage(S.driftL, 268 - S.driftL.width / 2 - 7 * p, 262 - S.driftL.height / 2 - 5 * p);
    ctx.globalAlpha = 0.4; ctx.drawImage(S.driftR, 1672 - S.driftR.width / 2 + 5 * p, 318 - S.driftR.height / 2 - 4 * p);
    ctx.restore();

    put(ctx, env, S.back, { rot: rot * 0.4 });                        // far side of the ball slides least …
    put(ctx, env, S.mid, { rot: rot * 0.9, blend: 'screen' });
    put(ctx, env, S.limb[f % 3], { rot, blend: 'screen' });
    put(ctx, env, S.front, { rot: rot * 1.7, blend: 'screen' });      // … the near side most
    put(ctx, env, S.rim, { rot, blend: 'screen', alpha: 0.25 + 0.5 * flash });
    put(ctx, env, S.bloom, { rot, blend: 'screen', alpha: 0.7 + 0.25 * flash });
    put(ctx, env, S.fg, { rot: rot * 2.6, blend: 'screen' });
  },
};
